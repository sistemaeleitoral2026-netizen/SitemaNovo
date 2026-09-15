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
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=role,ativo`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: ANON_KEY,
        },
      },
    )
    const profiles = await profileRes.json()
    const profile = Array.isArray(profiles) ? profiles[0] : null
    if (!profile || profile.role !== 'admin' || !profile.ativo) {
      return json(res, 403, { error: 'Apenas administrador pode criar nerites.' })
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const nome = String(body.nome || '').trim()
    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')

    if (!nome || !email || password.length < 8) {
      return json(res, 400, { error: 'Nome, e-mail e senha (mín. 8) são obrigatórios.' })
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
        user_metadata: { nome, role: 'operador' },
      }),
    })

    const created = await createRes.json()
    if (!createRes.ok) {
      return json(res, 400, {
        error: created.msg || created.error_description || created.message || 'Falha ao criar nerite.',
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
          role: 'operador',
          ativo: true,
        }),
      })
    }

    return json(res, 200, { ok: true, id: userId, email })
  } catch (err) {
    return json(res, 500, { error: err instanceof Error ? err.message : 'Erro interno.' })
  }
}
