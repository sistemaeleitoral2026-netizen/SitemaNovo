const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
const { logAdminEvent } = require('./_admin-audit')

// Ids dos sistemas que o /admin pode liberar (iguais a SITES em alimentacao-app/src/lib/sites.ts)
const SISTEMAS = new Set(['mr-terceiriza', 'assessoria-mb', 'painel-do-mandato', 'financeiro-pessoal', 'chat'])
const NIVEIS = new Set(['admin', 'editor'])
const SQL_HINT = ' Rode o SQL alimentacao-app/supabase/migrations/20261116b_acessos_externos.sql no Supabase e tente de novo.'

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

/** Só o admin cadastra login para os outros sistemas por aqui. */
async function loadCallerAdmin(userId) {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=id,nome,role,ativo`,
    { headers: { Authorization: `Bearer ${SERVICE_ROLE}`, apikey: SERVICE_ROLE } },
  )
  const rows = await r.json().catch(() => [])
  const profile = Array.isArray(rows) ? rows[0] : null
  if (!profile || profile.ativo === false || profile.role !== 'admin') return null
  return profile
}

async function deleteAuthUser(userId) {
  if (!userId) return
  try {
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${SERVICE_ROLE}`, apikey: SERVICE_ROLE },
    })
  } catch {
    /* best effort */
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
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
    if (!caller) return json(res, 403, { error: 'Somente o admin pode cadastrar usuários aqui.' })

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const nome = String(body.nome || '').trim()
    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')
    const acessos = sanitizeAcessos(body.acessos_externos)

    if (!nome || !email || password.length < 8) {
      return json(res, 400, { error: 'Nome, e-mail e senha (mín. 8) são obrigatórios.' })
    }
    if (!Object.keys(acessos).length) {
      return json(res, 400, { error: 'Marque pelo menos um sistema para liberar o acesso.' })
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
        user_metadata: { nome, role: 'externo' },
      }),
    })

    const created = await createRes.json().catch(() => ({}))
    if (!createRes.ok) {
      const raw = errMsg(created, 'Falha ao criar usuário.')
      if (/permission|policy|row-level|RLS|42501|check|constraint/i.test(raw)) {
        return json(res, 400, { error: `${raw}.${SQL_HINT}` })
      }
      return json(res, 400, { error: raw })
    }

    const userId = created.id || created.user?.id
    if (!userId) {
      return json(res, 500, { error: 'Usuário criado sem ID. Tente de novo.' })
    }

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
        role: 'externo',
        extra_roles: [],
        ativo: true,
        diretoria_id: null,
        coordenador_id: null,
        lider_id: null,
        acessos_externos: acessos,
      }),
    })
    const patchText = await patchRes.text()
    let patchData = null
    try { patchData = patchText ? JSON.parse(patchText) : null } catch { patchData = patchText }

    if (!patchRes.ok) {
      await deleteAuthUser(userId)
      const raw = errMsg(patchData, `HTTP ${patchRes.status}`)
      if (/check|constraint|column|acessos_externos|role/i.test(raw)) {
        return json(res, 400, { error: `Não foi possível salvar o perfil: ${raw}.${SQL_HINT}` })
      }
      return json(res, 400, { error: `Usuário criado, mas o perfil falhou: ${raw}` })
    }

    await logAdminEvent({
      sistema: 'admin', categoria: 'acesso', acao: 'usuario.criar', entidade: 'profiles', entidadeId: userId,
      titulo: 'Novo login criado', resumo: `${nome} · ${email}`, actorId: caller.id, actorNome: caller.nome,
      metadata: { usuario: nome, email, acessos: Object.keys(acessos) }, origemUrl: '/admin/usuarios',
      sourceKey: `admin:usuario.criar:${userId}`,
    })
    return json(res, 200, { ok: true, id: userId, email })
  } catch (err) {
    return json(res, 500, { error: err instanceof Error ? err.message : 'Erro interno.' })
  }
}
