const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

function json(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

async function getCaller(token) {
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: ANON_KEY },
  })
  if (!userRes.ok) return null
  const user = await userRes.json()
  const profileRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=id,role,ativo`,
    { headers: { Authorization: `Bearer ${token}`, apikey: ANON_KEY } },
  )
  const profiles = await profileRes.json()
  const profile = Array.isArray(profiles) ? profiles[0] : null
  if (!profile || !profile.ativo || !['admin', 'diretoria'].includes(profile.role)) return null
  return profile
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return json(res, 405, { error: 'Método não permitido.' })
  }

  if (!SUPABASE_URL || !SERVICE_ROLE || !ANON_KEY) {
    return json(res, 500, { error: 'Variáveis do servidor incompletas.' })
  }

  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) return json(res, 401, { error: 'Não autenticado.' })

  try {
    const caller = await getCaller(token)
    if (!caller) return json(res, 403, { error: 'Sem permissão.' })

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const neriteId = String(body.id || '').trim()
    if (!neriteId) return json(res, 400, { error: 'Informe o usuário.' })

    const targetRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${neriteId}&select=id,role,diretoria_id,email`,
      {
        headers: {
          Authorization: `Bearer ${SERVICE_ROLE}`,
          apikey: SERVICE_ROLE,
        },
      },
    )
    const targets = await targetRes.json()
    const target = Array.isArray(targets) ? targets[0] : null
    if (!target || !['operador', 'mobilizador', 'administrativo'].includes(target.role)) {
      return json(res, 404, { error: 'Usuário não encontrado.' })
    }
    if (target.role === 'administrativo' && caller.role !== 'admin') {
      return json(res, 403, { error: 'Somente o admin gerencia usuários administrativos.' })
    }
    if (caller.role === 'diretoria' && target.diretoria_id !== caller.id) {
      return json(res, 403, { error: 'Sem permissão para este usuário.' })
    }

    if (req.method === 'DELETE') {
      // Conta fichas desta nerite (mobilizador não gera fichas)
      let fichasCount = 0
      if (target.role === 'operador') {
        const countRes = await fetch(
          `${SUPABASE_URL}/rest/v1/cadastros?operator_id=eq.${neriteId}&select=id`,
          {
            headers: {
              Authorization: `Bearer ${SERVICE_ROLE}`,
              apikey: SERVICE_ROLE,
              Prefer: 'count=exact',
              Range: '0-0',
            },
          },
        )
        const contentRange = countRes.headers.get('content-range') || ''
        const totalMatch = contentRange.match(/\/(\d+|\*)/)
        fichasCount = totalMatch && totalMatch[1] !== '*' ? Number(totalMatch[1]) : 0

        if (fichasCount > 0 && caller.role !== 'admin') {
          return json(res, 403, {
            error: 'Só o administrador pode excluir nerite que já tem fichas. As fichas não são apagadas.',
          })
        }

        if (fichasCount > 0) {
          await fetch(`${SUPABASE_URL}/rest/v1/cadastros?operator_id=eq.${neriteId}`, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${SERVICE_ROLE}`,
              apikey: SERVICE_ROLE,
              'Content-Type': 'application/json',
              Prefer: 'return=minimal',
            },
            body: JSON.stringify({ operator_id: null }),
          })
        }
      }

      await fetch(`${SUPABASE_URL}/rest/v1/importacoes?operator_id=eq.${neriteId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${SERVICE_ROLE}`,
          apikey: SERVICE_ROLE,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ operator_id: null }),
      })

      await fetch(`${SUPABASE_URL}/rest/v1/auditoria?actor_id=eq.${neriteId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${SERVICE_ROLE}`,
          apikey: SERVICE_ROLE,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ actor_id: null }),
      })

      const delAuth = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${neriteId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${SERVICE_ROLE}`,
          apikey: SERVICE_ROLE,
        },
      })
      if (!delAuth.ok) {
        const errText = await delAuth.text()
        return json(res, 500, { error: errText || 'Não foi possível excluir a nerite.' })
      }

      return json(res, 200, { ok: true })
    }

    // UPDATE
    const nome = String(body.nome || '').trim()
    const password = body.password ? String(body.password) : ''
    const diretoriaId =
      caller.role === 'diretoria' ? caller.id : (body.diretoria_id || target.diretoria_id || null)
    const coordenadorId = body.coordenador_id || null
    const liderId = body.lider_id || null
    const ativo = body.ativo == null ? true : Boolean(body.ativo)

    if (!nome) return json(res, 400, { error: 'Informe o nome.' })
    if (password && password.length < 8) {
      return json(res, 400, { error: 'A nova senha precisa ter no mínimo 8 caracteres.' })
    }

    await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${neriteId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE}`,
        apikey: SERVICE_ROLE,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        nome,
        diretoria_id: target.role === 'administrativo' ? null : diretoriaId,
        coordenador_id: target.role === 'operador' ? coordenadorId : null,
        lider_id: target.role === 'operador' ? liderId : null,
        ativo,
      }),
    })

    if (password) {
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${neriteId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${SERVICE_ROLE}`,
          apikey: SERVICE_ROLE,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password, ban_duration: 'none' }),
      })
    } else if (ativo) {
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${neriteId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${SERVICE_ROLE}`,
          apikey: SERVICE_ROLE,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ban_duration: 'none' }),
      })
    }

    return json(res, 200, { ok: true })
  } catch (err) {
    return json(res, 500, { error: err instanceof Error ? err.message : 'Erro interno.' })
  }
}
