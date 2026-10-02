const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

function json(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

async function rest(path, { method = 'GET', body } = {}) {
  const headers = {
    Authorization: `Bearer ${SERVICE_ROLE}`,
    apikey: SERVICE_ROLE,
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    headers.Prefer = 'return=minimal'
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

async function getCaller(token) {
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: ANON_KEY },
  })
  if (!userRes.ok) return null
  const user = await userRes.json()
  const profileRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=id,role,ativo,diretoria_id,coordenador_id`,
    { headers: { Authorization: `Bearer ${token}`, apikey: ANON_KEY } },
  )
  const profiles = await profileRes.json()
  const profile = Array.isArray(profiles) ? profiles[0] : null
  if (!profile || !profile.ativo || !['admin', 'diretoria', 'coordenador'].includes(profile.role)) {
    return null
  }
  return profile
}

async function resolveCallerCoordId(caller) {
  if (caller.role !== 'coordenador') return null
  if (caller.coordenador_id) return caller.coordenador_id
  const mine = await rest(
    `coordenadores?user_id=eq.${caller.id}&select=id&limit=1`,
  )
  const row = Array.isArray(mine.data) ? mine.data[0] : null
  return row?.id ?? null
}

module.exports = async function handler(req, res) {
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
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${neriteId}&select=id,role,diretoria_id,email,coordenador_id`,
      {
        headers: {
          Authorization: `Bearer ${SERVICE_ROLE}`,
          apikey: SERVICE_ROLE,
        },
      },
    )
    const targets = await targetRes.json()
    const target = Array.isArray(targets) ? targets[0] : null
    const managedRoles = ['operador', 'mobilizador', 'administrativo', 'coordenador', 'auxiliar']
    if (!target || !managedRoles.includes(target.role)) {
      return json(res, 404, { error: 'Usuário não encontrado.' })
    }
    if (target.role === 'administrativo' && caller.role !== 'admin') {
      return json(res, 403, { error: 'Somente o admin gerencia usuários administrativos.' })
    }
    if (caller.role === 'diretoria' && target.diretoria_id !== caller.id) {
      return json(res, 403, { error: 'Sem permissão para este usuário.' })
    }
    if (caller.role === 'coordenador') {
      if (target.role !== 'auxiliar') {
        return json(res, 403, { error: 'Coordenador só gerencia auxiliares.' })
      }
      const myCoord = await resolveCallerCoordId(caller)
      if (!myCoord || target.coordenador_id !== myCoord) {
        return json(res, 403, { error: 'Sem permissão para este auxiliar.' })
      }
    }

    if (req.method === 'DELETE') {
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
          await rest(`cadastros?operator_id=eq.${neriteId}`, {
            method: 'PATCH',
            body: { operator_id: null },
          })
        }
      }

      if (target.role === 'coordenador') {
        await rest(`coordenadores?user_id=eq.${neriteId}`, {
          method: 'PATCH',
          body: { user_id: null },
        })
      }

      if (target.role === 'auxiliar') {
        await rest(`auxiliar_lideres?auxiliar_id=eq.${neriteId}`, { method: 'DELETE' })
      }

      await rest(`importacoes?operator_id=eq.${neriteId}`, {
        method: 'PATCH',
        body: { operator_id: null },
      })

      await rest(`auditoria?actor_id=eq.${neriteId}`, {
        method: 'PATCH',
        body: { actor_id: null },
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
        return json(res, 500, { error: errText || 'Não foi possível excluir o usuário.' })
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
    const allowedExtra = new Set(['operador', 'mobilizador', 'administrativo'])
    let extraRoles = Array.isArray(body.extra_roles)
      ? [...new Set(body.extra_roles.map(String).filter((r) => allowedExtra.has(r) && r !== target.role))]
      : null
    if (extraRoles && (caller.role === 'diretoria' || caller.role === 'coordenador')) {
      extraRoles = extraRoles.filter((r) => r !== 'administrativo')
    }
    if (target.role === 'coordenador' || target.role === 'auxiliar') {
      extraRoles = []
    }

    const liderIds = Array.isArray(body.lider_ids)
      ? [...new Set(body.lider_ids.map(String).filter(Boolean))]
      : null

    if (!nome) return json(res, 400, { error: 'Informe o nome.' })
    if (password && password.length < 8) {
      return json(res, 400, { error: 'A nova senha precisa ter no mínimo 8 caracteres.' })
    }

    const patch = {
      nome,
      diretoria_id: target.role === 'administrativo' ? null : diretoriaId,
      coordenador_id: ['operador', 'coordenador', 'auxiliar'].includes(target.role) ? coordenadorId : null,
      lider_id: target.role === 'operador' ? liderId : null,
      ativo,
    }
    if (extraRoles) {
      Object.assign(patch, { extra_roles: extraRoles })
      if (
        target.role === 'operador'
        || target.role === 'mobilizador'
        || extraRoles.includes('operador')
        || extraRoles.includes('mobilizador')
      ) {
        Object.assign(patch, { diretoria_id: diretoriaId })
      }
      if (target.role === 'operador' || extraRoles.includes('operador')) {
        Object.assign(patch, {
          coordenador_id: coordenadorId,
          lider_id: liderId,
        })
      }
    }
    if (target.role === 'coordenador' || target.role === 'auxiliar') {
      Object.assign(patch, {
        diretoria_id: diretoriaId,
        coordenador_id: coordenadorId || target.coordenador_id,
        lider_id: null,
        extra_roles: [],
      })
    }

    await rest(`profiles?id=eq.${neriteId}`, { method: 'PATCH', body: patch })

    if (target.role === 'auxiliar' && liderIds) {
      await rest(`auxiliar_lideres?auxiliar_id=eq.${neriteId}`, { method: 'DELETE' })
      if (liderIds.length) {
        await rest('auxiliar_lideres', {
          method: 'POST',
          body: liderIds.map((lider_id) => ({ auxiliar_id: neriteId, lider_id })),
        })
      }
    }

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
