const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

const SISTEMAS = new Set(['mr-terceiriza', 'assessoria-mb', 'painel-do-mandato'])
const NIVEIS = new Set(['admin', 'editor'])

function json(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

function errMsg(data, fallback) {
  if (!data) return fallback
  if (typeof data === 'string') return data
  return data.message || data.msg || data.error_description || data.error || fallback
}

function sanitizeAcessos(input) {
  const out = {}
  if (!input || typeof input !== 'object') return out
  for (const site of SISTEMAS) {
    const nivel = input[site]
    if (NIVEIS.has(nivel)) out[site] = nivel
  }
  return out
}

async function getAuthUser(token) {
  const keys = [...new Set([ANON_KEY, SERVICE_ROLE].filter(Boolean))]
  let lastStatus = 0
  for (const apikey of keys) {
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey },
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

/** Só o admin mexe nos logins "externos" por aqui — nunca em admin/diretoria/nerites. */
async function loadCallerAdmin(userId) {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=id,role,ativo`,
    { headers: { Authorization: `Bearer ${SERVICE_ROLE}`, apikey: SERVICE_ROLE } },
  )
  const rows = await r.json().catch(() => [])
  const profile = Array.isArray(rows) ? rows[0] : null
  if (!profile || profile.ativo === false || profile.role !== 'admin') return null
  return profile
}

async function loadTargetExterno(userId) {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=id,role`,
    { headers: { Authorization: `Bearer ${SERVICE_ROLE}`, apikey: SERVICE_ROLE } },
  )
  const rows = await r.json().catch(() => [])
  const profile = Array.isArray(rows) ? rows[0] : null
  if (!profile || profile.role !== 'externo') return null
  return profile
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return json(res, 405, { error: 'Método não permitido.' })
  }
  if (!SUPABASE_URL || !SERVICE_ROLE || !ANON_KEY) {
    return json(res, 500, { error: 'Variáveis do servidor incompletas (SUPABASE_URL / SERVICE_ROLE / ANON_KEY).' })
  }

  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) return json(res, 401, { error: 'Não autenticado.' })

  try {
    const { user, error: authError } = await getAuthUser(token)
    if (!user) return json(res, 401, { error: authError || 'Sessão inválida. Saia e entre novamente.' })

    const caller = await loadCallerAdmin(user.id)
    if (!caller) return json(res, 403, { error: 'Somente o admin gerencia esses logins.' })

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const targetId = String(body.id || '').trim()
    if (!targetId) return json(res, 400, { error: 'Informe o usuário.' })

    const target = await loadTargetExterno(targetId)
    if (!target) {
      return json(res, 404, { error: 'Usuário não encontrado (esta página só gerencia logins "externos").' })
    }

    if (req.method === 'DELETE') {
      const delRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${targetId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${SERVICE_ROLE}`, apikey: SERVICE_ROLE },
      })
      if (!delRes.ok) {
        const data = await delRes.json().catch(() => ({}))
        return json(res, 400, { error: errMsg(data, 'Falha ao excluir usuário.') })
      }
      return json(res, 200, { ok: true })
    }

    // UPDATE
    const nome = body.nome != null ? String(body.nome).trim() : null
    const ativo = body.ativo == null ? null : Boolean(body.ativo)
    const password = body.password ? String(body.password) : ''
    const acessos = body.acessos_externos != null ? sanitizeAcessos(body.acessos_externos) : null

    if (nome === '') return json(res, 400, { error: 'Informe o nome.' })
    if (password && password.length < 8) {
      return json(res, 400, { error: 'A nova senha precisa ter no mínimo 8 caracteres.' })
    }
    if (acessos && !Object.keys(acessos).length) {
      return json(res, 400, { error: 'Marque pelo menos um sistema para manter o acesso, ou exclua o usuário.' })
    }

    const patch = {}
    if (nome != null) patch.nome = nome
    if (ativo != null) patch.ativo = ativo
    if (acessos != null) patch.acessos_externos = acessos

    if (Object.keys(patch).length) {
      const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${targetId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${SERVICE_ROLE}`,
          apikey: SERVICE_ROLE,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(patch),
      })
      if (!patchRes.ok) {
        const text = await patchRes.text()
        let data = null
        try { data = text ? JSON.parse(text) : null } catch { data = text }
        return json(res, 400, { error: errMsg(data, `HTTP ${patchRes.status}`) })
      }
    }

    if (password) {
      const pwRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${targetId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${SERVICE_ROLE}`,
          apikey: SERVICE_ROLE,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password, ban_duration: 'none' }),
      })
      if (!pwRes.ok) {
        const data = await pwRes.json().catch(() => ({}))
        return json(res, 400, { error: errMsg(data, 'Perfil salvo, mas a senha não foi atualizada.') })
      }
    }

    return json(res, 200, { ok: true })
  } catch (err) {
    return json(res, 500, { error: err instanceof Error ? err.message : 'Erro interno.' })
  }
}
