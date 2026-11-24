// Chat Seguro — apaga uma conversa inteira (mensagens + arquivos), com a SENHA conferida aqui no servidor.
// Pode: participante de conversa privada; criador de conversa temporária. A Sala Geral não pode.
// POST /api/chat-delete-room  { room_id, password }   (Authorization: Bearer <token>)
const { SUPABASE_URL, ANON_KEY, json, readBody, envOk, getAuthUser, rest, one, rpc, storageList, storageRemove } = require('./_chat')

async function passwordOk(email, password) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!r.ok) return false
  // encerra a sessão criada só para conferir a senha
  const s = await r.json().catch(() => null)
  if (s && s.access_token) {
    fetch(`${SUPABASE_URL}/auth/v1/logout?scope=local`, { method: 'POST', headers: { apikey: ANON_KEY, Authorization: `Bearer ${s.access_token}` } }).catch(() => {})
  }
  return true
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido.' })
  if (!envOk()) return json(res, 500, { error: 'Variáveis do servidor incompletas.' })
  try {
    const user = await getAuthUser(req)
    if (!user || !user.email) return json(res, 401, { error: 'nao autenticado' })
    const body = readBody(req)
    const roomId = Number(body.room_id)
    const password = String(body.password || '')
    if (!roomId || !password) return json(res, 400, { error: 'senha obrigatoria' })
    if (!(await passwordOk(user.email, password))) return json(res, 403, { error: 'senha incorreta' })

    const room = await one(`sc_rooms?id=eq.${roomId}&select=id,type,created_by`)
    if (!room) return json(res, 404, { error: 'conversa inexistente' })
    const member = await one(`sc_room_members?room_id=eq.${roomId}&user_id=eq.${user.id}&select=user_id`)
    const hasAccess = await rpc('sc_has_access', { p_user: user.id }).catch(() => false)
    const allowed = hasAccess && member && (room.type === 'direct' || (room.type === 'temp' && room.created_by === user.id))
    if (!allowed) return json(res, 403, { error: 'voce nao pode apagar esta conversa' })

    let files = 0
    for (const bucket of ['sc-files', 'sc-once']) {
      for (let guard = 0; guard < 50; guard++) {
        const list = await storageList(bucket, `${roomId}/`)
        if (!list.length) break
        await storageRemove(bucket, list.map((f) => `${roomId}/${f.name}`))
        files += list.length
        if (list.length < 1000) break
      }
    }
    await rpc('sc_audit', { p_user: user.id, p_action: 'room_deleted', p_room: roomId, p_meta: { type: room.type, files } }).catch(() => {})
    await rest(`sc_rooms?id=eq.${roomId}`, { method: 'DELETE', prefer: 'return=minimal' })   // cascata: membros, mensagens, alertas
    return json(res, 200, { ok: true, files })
  } catch (e) {
    return json(res, 500, { error: String((e && e.message) || e) })
  }
}
