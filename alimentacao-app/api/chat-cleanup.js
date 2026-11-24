// Chat Seguro — apaga conversas temporárias e mensagens vencidas, do banco E do storage.
// Chamada a cada 1 minuto pelo pg_cron (migration 20261127b_chat_seguro_cron.sql).
// Protegida pelo header x-webhook-secret = CHAT_WEBHOOK_SECRET.
const { json, envOk, rest, rpc, storageList, storageRemove, webhookOk } = require('./_chat')

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido.' })
  if (!envOk()) return json(res, 500, { error: 'Variáveis do servidor incompletas.' })
  if (!webhookOk(req)) return json(res, 403, { error: 'forbidden' })
  try {
    const now = new Date().toISOString()
    const rooms = await rest(`sc_rooms?expires_at=lt.${encodeURIComponent(now)}&select=id`)
    const roomIds = (rooms || []).map((r) => r.id)

    const filter = roomIds.length
      ? `or=(expires_at.lt.${encodeURIComponent(now)},room_id.in.(${roomIds.join(',')}))`
      : `expires_at=lt.${encodeURIComponent(now)}`
    const msgs = await rest(`sc_messages?${filter}&select=id,file_path&limit=5000`)
    const ids = (msgs || []).map((m) => m.id)
    const files = (msgs || []).filter((m) => m.file_path).map((m) => m.file_path)
    let once = []
    if (ids.length) {
      const secrets = await rest(`sc_once_secrets?message_id=in.(${ids.join(',')})&select=file_path`)
      once = (secrets || []).map((s) => s.file_path).filter(Boolean)
    }
    await storageRemove('sc-files', files)
    await storageRemove('sc-once', once)
    for (const id of roomIds) {
      for (const bucket of ['sc-files', 'sc-once']) {
        const list = await storageList(bucket, `${id}/`)
        if (list.length) await storageRemove(bucket, list.map((f) => `${id}/${f.name}`))
      }
    }
    // apagar a uma visão vencida gera o comprovante "expirou sem ser aberta" (trigger no banco)
    if (ids.length) await rest(`sc_messages?id=in.(${ids.join(',')})`, { method: 'DELETE', prefer: 'return=minimal' })
    if (roomIds.length) await rest(`sc_rooms?id=in.(${roomIds.join(',')})`, { method: 'DELETE', prefer: 'return=minimal' })
    const purged = await rpc('sc_purge_old_security_data', { p_days: 180 }).catch(() => null)
    return json(res, 200, { rooms: roomIds.length, messages: ids.length, files: files.length + once.length, purged })
  } catch (e) {
    return json(res, 500, { error: String((e && e.message) || e) })
  }
}
