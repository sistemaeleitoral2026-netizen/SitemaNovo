const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

const CAN_CREATE = new Set(['admin', 'diretoria', 'coordenador'])
const SQL_HINT = ' Rode o SQL coordenador_auxiliar_votacao_run.sql no Supabase e tente de novo.'

function json(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

function sameId(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()
}

function errMsg(data, fallback) {
  if (!data) return fallback
  if (typeof data === 'string') return data
  return data.message || data.msg || data.error_description || data.error || fallback
}

async function rest(path, { method = 'GET', body, token } = {}) {
  const headers = {
    Authorization: `Bearer ${token || SERVICE_ROLE}`,
    apikey: token && token !== SERVICE_ROLE ? (ANON_KEY || SERVICE_ROLE) : SERVICE_ROLE,
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

/** Valida o JWT do usuário (tenta anon e service role como apikey). */
async function getAuthUser(token) {
  const keys = [...new Set([ANON_KEY, SERVICE_ROLE].filter(Boolean))]
  let lastStatus = 0
  for (const apikey of keys) {
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey,
      },
    })
    lastStatus = userRes.status
    if (userRes.ok) {
      const user = await userRes.json()
      if (user?.id) return { user, error: null }
    }
  }
  return {
    user: null,
    error: lastStatus === 401 || lastStatus === 403
      ? 'Sessão inválida. Saia e entre novamente.'
      : `Falha ao validar sessão (HTTP ${lastStatus || '—'}).`,
  }
}

async function loadCallerProfile(userId) {
  let profileRes = await rest(
    `profiles?id=eq.${userId}&select=id,role,ativo,diretoria_id,coordenador_id`,
  )
  if (!profileRes.ok && /coordenador_id|column|schema/i.test(errMsg(profileRes.data, ''))) {
    profileRes = await rest(`profiles?id=eq.${userId}&select=id,role,ativo,diretoria_id`)
  }
  if (!profileRes.ok) {
    return {
      profile: null,
      error: `Não foi possível ler o perfil (${errMsg(profileRes.data, `HTTP ${profileRes.status}`)}).`,
    }
  }
  const profile = Array.isArray(profileRes.data) ? profileRes.data[0] : null
  if (!profile) {
    return { profile: null, error: 'Perfil não encontrado. Saia e entre novamente.' }
  }
  if (profile.ativo === false) {
    return { profile: null, error: 'Seu usuário está inativo.' }
  }
  if (!CAN_CREATE.has(String(profile.role || '').trim())) {
    return {
      profile: null,
      error: `Sem permissão para criar usuários (perfil: ${profile.role || 'desconhecido'}).`,
    }
  }
  return { profile, error: null }
}

async function deleteAuthUser(userId) {
  if (!userId) return
  try {
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE}`,
        apikey: SERVICE_ROLE,
      },
    })
  } catch {
    /* best effort */
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Método não permitido.' })
  }

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json(res, 500, { error: 'Variáveis do servidor incompletas (SUPABASE_URL / SERVICE_ROLE).' })
  }
  if (!ANON_KEY) {
    return json(res, 500, {
      error: 'VITE_SUPABASE_ANON_KEY (ou SUPABASE_ANON_KEY) não configurada no Vercel.',
    })
  }

  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) {
    return json(res, 401, { error: 'Não autenticado.' })
  }

  try {
    const { user, error: authError } = await getAuthUser(token)
    if (!user) {
      return json(res, 401, { error: authError || 'Sessão inválida. Saia e entre novamente.' })
    }

    const { profile, error: profileError } = await loadCallerProfile(user.id)
    if (!profile) {
      return json(res, 403, { error: profileError || 'Sem permissão para criar usuários.' })
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
      if (!mine.ok) {
        return json(res, 500, {
          error: `Falha ao buscar coordenação: ${errMsg(mine.data, `HTTP ${mine.status}`)}.${SQL_HINT}`,
        })
      }
      const coordRow = Array.isArray(mine.data) ? mine.data[0] : null
      if (!coordRow) {
        return json(res, 403, {
          error: 'Coordenação não vinculada ao login. Peça à diretoria para vincular seu usuário ao coordenador.',
        })
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
      if (profile.role === 'diretoria' && row.diretoria_id && !sameId(row.diretoria_id, profile.id)) {
        return json(res, 403, { error: 'Sem permissão para este coordenador.' })
      }
      body.diretoria_id = row.diretoria_id || profile.id
    }

    // Auxiliar: valida coordenação e amarra diretoria (especialmente para a diretora).
    if (role === 'auxiliar' && coordenadorId) {
      const check = await rest(`coordenadores?id=eq.${coordenadorId}&select=id,diretoria_id,nome`)
      if (!check.ok) {
        return json(res, 500, {
          error: `Falha ao validar coordenação: ${errMsg(check.data, `HTTP ${check.status}`)}.`,
        })
      }
      const row = Array.isArray(check.data) ? check.data[0] : null
      if (!row) return json(res, 404, { error: 'Coordenação não encontrada.' })

      if (profile.role === 'diretoria') {
        // Aceita se já é da diretoria OU se diretoria_id está vazio (corrige no ato).
        if (row.diretoria_id && !sameId(row.diretoria_id, profile.id)) {
          return json(res, 403, {
            error: `A coordenação "${row.nome || ''}" não pertence à sua diretoria.`,
          })
        }
        if (!row.diretoria_id) {
          await rest(`coordenadores?id=eq.${coordenadorId}`, {
            method: 'PATCH',
            body: { diretoria_id: profile.id },
          })
        }
        body.diretoria_id = profile.id
      } else if (profile.role === 'coordenador') {
        if (!sameId(row.id, coordenadorId)) {
          return json(res, 403, { error: 'Sem permissão para esta coordenação.' })
        }
        body.diretoria_id = row.diretoria_id || body.diretoria_id || diretoriaId
      } else {
        // admin
        body.diretoria_id = row.diretoria_id || body.diretoria_id || diretoriaId
      }
    }

    // Metadata segura no create: evita trigger/CHECK rejeitar role auxiliar/coordenador.
    const bootstrapRole = (role === 'auxiliar' || role === 'coordenador') ? 'operador' : role

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
        user_metadata: { nome, role: bootstrapRole },
      }),
    })

    const created = await createRes.json().catch(() => ({}))
    if (!createRes.ok) {
      const raw = errMsg(created, 'Falha ao criar usuário.')
      if (/permission|policy|row-level|RLS|42501|check|constraint|auxiliar|coordenador/i.test(raw)) {
        return json(res, 400, { error: `${raw}.${SQL_HINT}` })
      }
      return json(res, 400, { error: raw })
    }

    const userId = created.id || created.user?.id
    if (!userId) {
      return json(res, 500, { error: 'Usuário criado sem ID. Tente de novo.' })
    }

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

    const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE}`,
        apikey: SERVICE_ROLE,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
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
    const patchText = await patchRes.text()
    let patchData = null
    try { patchData = patchText ? JSON.parse(patchText) : null } catch { patchData = patchText }

    if (!patchRes.ok) {
      await deleteAuthUser(userId)
      const raw = errMsg(patchData, `HTTP ${patchRes.status}`)
      if (/check|constraint|auxiliar|coordenador|role/i.test(raw)) {
        return json(res, 400, {
          error: `Não foi possível definir o cargo "${role}": ${raw}.${SQL_HINT}`,
        })
      }
      return json(res, 400, { error: `Usuário criado, mas o perfil falhou: ${raw}` })
    }

    // Confirma que o role foi gravado (PATCH pode “passar” sem alterar se RLS filtrar — service role não deveria).
    const saved = Array.isArray(patchData) ? patchData[0] : null
    if (saved && saved.role && saved.role !== role) {
      await deleteAuthUser(userId)
      return json(res, 400, {
        error: `O banco rejeitou o cargo "${role}" (ficou "${saved.role}").${SQL_HINT}`,
      })
    }

    if (role === 'coordenador' && coordenadorId) {
      await rest(`coordenadores?id=eq.${coordenadorId}`, {
        method: 'PATCH',
        body: { user_id: userId },
      })
    }

    if (role === 'auxiliar' && liderIds.length) {
      const rows = liderIds.map((lider_id) => ({ auxiliar_id: userId, lider_id }))
      const linkRes = await rest('auxiliar_lideres', { method: 'POST', body: rows })
      if (!linkRes.ok) {
        // Login já existe — avisa sem desfazer o usuário.
        return json(res, 200, {
          ok: true,
          id: userId,
          email,
          role,
          extra_roles: finalExtras,
          warning: `Auxiliar criado, mas as lideranças não vincularam: ${errMsg(linkRes.data, 'erro')}.${SQL_HINT}`,
        })
      }
    }

    return json(res, 200, { ok: true, id: userId, email, role, extra_roles: finalExtras })
  } catch (err) {
    return json(res, 500, { error: err instanceof Error ? err.message : 'Erro interno.' })
  }
}
