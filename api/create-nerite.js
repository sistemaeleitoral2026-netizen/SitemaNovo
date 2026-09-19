const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

function json(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

export default async function handler(req, res) {
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
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=id,role,ativo`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: ANON_KEY,
        },
      },
    )
    const profiles = await profileRes.json()
    const profile = Array.isArray(profiles) ? profiles[0] : null
    if (!profile || !profile.ativo || !['admin', 'diretoria'].includes(profile.role)) {
      return json(res, 403, { error: 'Sem permissão para criar usuários.' })
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const nome = String(body.nome || '').trim()
    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')
    let role = String(body.role || 'operador').trim()
    const coordenadorId = body.coordenador_id || null
    const liderId = body.lider_id || null

    if (!nome || !email || password.length < 8) {
      return json(res, 400, { error: 'Nome, e-mail e senha (mín. 8) são obrigatórios.' })
    }

    if (profile.role === 'diretoria') {
      role = body.role === 'mobilizador' ? 'mobilizador' : 'operador'
    } else if (!['operador', 'diretoria', 'mobilizador', 'administrativo'].includes(role)) {
      role = 'operador'
    }

    const diretoriaId = profile.role === 'diretoria' ? profile.id : (body.diretoria_id || null)

    if ((role === 'operador' || role === 'mobilizador') && profile.role === 'diretoria' && !diretoriaId) {
      return json(res, 400, { error: 'Diretoria inválida.' })
    }

    if (role === 'administrativo' && profile.role !== 'admin') {
      return json(res, 403, { error: 'Somente o admin pode criar usuário administrativo.' })
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
          ativo: true,
          diretoria_id: role === 'operador' || role === 'mobilizador' ? diretoriaId : null,
          coordenador_id: role === 'operador' ? coordenadorId : null,
          lider_id: role === 'operador' ? liderId : null,
        }),
      })
    }

    return json(res, 200, { ok: true, id: userId, email, role })
  } catch (err) {
    return json(res, 500, { error: err instanceof Error ? err.message : 'Erro interno.' })
  }
}
