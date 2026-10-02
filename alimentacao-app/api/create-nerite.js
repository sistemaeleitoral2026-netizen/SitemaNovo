const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

function json(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

async function rest(path, { method = 'GET', body, token } = {}) {
  const headers = {
    Authorization: `Bearer ${token || SERVICE_ROLE}`,
    apikey: token && token !== SERVICE_ROLE ? ANON_KEY : SERVICE_ROLE,
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    headers.Prefer = 'return=representation'
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  return { ok: res.ok, status: res.status, data }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Método não permitido.' })
  }

  if (!SUPABASE_URL || !SERVICE_ROLE || !ANON_KEY) {
    return json(res, 500, { error: 'Variáveis do servidor incompletas.' })
  }

  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) {
    return json(res, 401, { error: 'Não autenticado.' })
  }

  try {
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: ANON_KEY,
      },
    })
    if (!userRes.ok) {
      return json(res, 401, { error: 'Sessão inválida.' })
    }
    const user = await userRes.json()

    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=id,role,ativo,diretoria_id,coordenador_id`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: ANON_KEY,
        },
      },
    )
    const profiles = await profileRes.json()
    const profile = Array.isArray(profiles) ? profiles[0] : null
    if (!profile || !profile.ativo || !['admin', 'diretoria', 'coordenador'].includes(profile.role)) {
      return json(res, 403, { error: 'Sem permissão para criar usuários.' })
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const nome = String(body.nome || '').trim()
    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')
    let role = String(body.role || 'operador').trim()
    let coordenadorId = body.coordenador_id || null
    const liderId = body.lider_id || null
    const liderIds = Array.isArray(body.lider_ids)
      ? [...new Set(body.lider_ids.map(String).filter(Boolean))]
      : []
    const allowedExtra = new Set(['operador', 'mobilizador', 'administrativo'])

    if (!nome || !email || password.length < 8) {
      return json(res, 400, { error: 'Nome, e-mail e senha (mín. 8) são obrigatórios.' })
    }

    // Coordenador só pode criar auxiliares da própria coordenação
    if (profile.role === 'coordenador') {
      role = 'auxiliar'
      const mine = await rest(
        `coordenadores?or=(user_id.eq.${profile.id},id.eq.${profile.coordenador_id || '00000000-0000-0000-0000-000000000000'})&select=id,diretoria_id&limit=1`,
      )
      const coordRow = Array.isArray(mine.data) ? mine.data[0] : null
      if (!coordRow) {
        return json(res, 403, { error: 'Coordenação não vinculada ao login.' })
      }
      coordenadorId = coordRow.id
      body.diretoria_id = coordRow.diretoria_id
    } else if (profile.role === 'diretoria') {
      if (!['mobilizador', 'operador', 'coordenador', 'auxiliar'].includes(role)) {
        role = 'operador'
      }
    } else if (!['operador', 'diretoria', 'mobilizador', 'administrativo', 'coordenador', 'auxiliar'].includes(role)) {
      role = 'operador'
    }

    const rawExtras = Array.isArray(body.extra_roles)
      ? body.extra_roles.map(String)
      : []
    let finalExtras = [...new Set(rawExtras.filter((r) => allowedExtra.has(r) && r !== role))]
    if (profile.role === 'diretoria' || profile.role === 'coordenador') {
      finalExtras = finalExtras.filter((r) => r !== 'administrativo')
    }
    if (role === 'coordenador' || role === 'auxiliar') {
      finalExtras = []
    }

    const diretoriaId = profile.role === 'diretoria'
      ? profile.id
      : (body.diretoria_id || null)

    if ((role === 'operador' || role === 'mobilizador' || role === 'coordenador' || role === 'auxiliar')
      && profile.role === 'diretoria'
      && !diretoriaId) {
      return json(res, 400, { error: 'Diretoria inválida.' })
    }

    if (role === 'administrativo' && profile.role !== 'admin') {
      return json(res, 403, { error: 'Somente o admin pode criar usuário administrativo.' })
    }

    if (role === 'coordenador' && !coordenadorId) {
      return json(res, 400, { error: 'Informe o coordenador para vincular o login.' })
    }

    if (role === 'auxiliar' && !coordenadorId) {
      return json(res, 400, { error: 'Informe a coordenação do auxiliar.' })
    }

    if (role === 'coordenador') {
      const check = await rest(`coordenadores?id=eq.${coordenadorId}&select=id,user_id,diretoria_id,nome`)
      const row = Array.isArray(check.data) ? check.data[0] : null
      if (!row) return json(res, 404, { error: 'Coordenador não encontrado.' })
      if (row.user_id) return json(res, 400, { error: 'Este coordenador já tem login.' })
      if (profile.role === 'diretoria' && row.diretoria_id !== profile.id) {
        return json(res, 403, { error: 'Sem permissão para este coordenador.' })
      }
      body.diretoria_id = row.diretoria_id
    }

    const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE}`,
        apikey: SERVICE_ROLE,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { nome, role },
      }),
    })

    const created = await createRes.json()
    if (!createRes.ok) {
      return json(res, 400, {
        error: created.msg || created.error_description || created.message || 'Falha ao criar usuário.',
      })
    }

    const userId = created.id
    if (userId) {
      const finalDir = role === 'administrativo' && !finalExtras.includes('operador') && !finalExtras.includes('mobilizador')
        ? null
        : (
          role === 'coordenador' || role === 'auxiliar'
            ? (body.diretoria_id || diretoriaId)
            : (role === 'operador' || role === 'mobilizador' || finalExtras.includes('operador') || finalExtras.includes('mobilizador')
              ? diretoriaId
              : null)
        )

      const finalCoordId = (role === 'operador' || role === 'coordenador' || role === 'auxiliar' || finalExtras.includes('operador'))
        ? coordenadorId
        : null
      const finalLiderId = (role === 'operador' || finalExtras.includes('operador')) ? liderId : null

      await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${SERVICE_ROLE}`,
          apikey: SERVICE_ROLE,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          nome,
          email,
          role,
          extra_roles: finalExtras,
          ativo: true,
          diretoria_id: finalDir,
          coordenador_id: finalCoordId,
          lider_id: finalLiderId,
        }),
      })

      if (role === 'coordenador' && coordenadorId) {
        await rest(`coordenadores?id=eq.${coordenadorId}`, {
          method: 'PATCH',
          body: { user_id: userId },
        })
      }

      if (role === 'auxiliar' && liderIds.length) {
        const rows = liderIds.map((lider_id) => ({ auxiliar_id: userId, lider_id }))
        await rest('auxiliar_lideres', { method: 'POST', body: rows })
      }
    }

    return json(res, 200, { ok: true, id: userId, email, role, extra_roles: finalExtras })
  } catch (err) {
    return json(res, 500, { error: err instanceof Error ? err.message : 'Erro interno.' })
  }
}
