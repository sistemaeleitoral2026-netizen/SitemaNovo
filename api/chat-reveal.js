// Chat Seguro — entrega uma mensagem/arquivo de "uma visão" UMA vez e apaga antes de responder.
// O conteúdo é cifrado de ponta a ponta: esta função só repassa bytes que não consegue ler.
// POST /api/chat-reveal  { id }   (Authorization: Bearer <token do usuário>)
//   texto   -> JSON { env, view_seconds, expires_at, message_id }
//   arquivo -> binário: [4 bytes = tamanho do JSON][JSON { env, ... }][bytes cifrados]
// Reabertura: 410 + alerta reopen_denied (provado pelo servidor).
const { json, readBody, envOk, getAuthUser, rest, one, rpc, storageDownload, storageRemove } = require('./_chat')

async function serverAlert(user, room, type, severity, messageId, meta) {
  await rpc('sc_insert_server_alert', {
    p_user: user, p_room: room, p_type: type, p_severity: severity, p_message_id: messageId, p_meta: meta || null,
  }).catch(() => {})
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido.' })
  if (!envOk()) return json(res, 500, { error: 'Variáveis do servidor incompletas.' })
  try {
    const user = await getAuthUser(req)
    if (!user) return json(res, 401, { error: 'nao autenticado' })
    const id = Number(readBody(req).id)
    if (!Number.isFinite(id) || id <= 0) return json(res, 400, { error: 'id invalido' })

    const hasAccess = await rpc('sc_has_access', { p_user: user.id }).catch(() => false)
    if (!hasAccess) return json(res, 403, { error: 'sem acesso ao Chat Seguro' })

    const m = await one(`sc_messages?id=eq.${id}&select=id,room_id,sender_id,kind,expires_at,created_at`)
    if (!m) {
      // já consumida: tentativa de reabrir
      const c = await one(`sc_consumed_onces?message_id=eq.${id}&select=message_id,room_id`)
      if (c) {
        const member = await one(`sc_room_members?room_id=eq.${c.room_id}&user_id=eq.${user.id}&select=user_id`)
        if (member) await serverAlert(user.id, c.room_id, 'reopen_denied', 'high', id, { reason: 'already_consumed' })
        return json(res, 410, { error: 'conteudo ja aberto ou indisponivel', code: 'reopen_denied' })
      }
      return json(res, 404, { error: 'conteudo ja aberto ou indisponivel' })
    }
    if (m.kind !== 'once') return json(res, 404, { error: 'conteudo ja aberto ou indisponivel' })
    if (m.sender_id === user.id) return json(res, 403, { error: 'quem enviou nao pode abrir' })
    if (m.expires_at && Date.parse(m.expires_at) < Date.now()) return json(res, 410, { error: 'expirada' })

    const [member, room] = await Promise.all([
      one(`sc_room_members?room_id=eq.${m.room_id}&user_id=eq.${user.id}&select=user_id`),
      one(`sc_rooms?id=eq.${m.room_id}&select=expires_at`),
    ])
    if (!member) return json(res, 403, { error: 'voce nao esta nesta sala' })
    if (room && room.expires_at && Date.parse(room.expires_at) < Date.now()) return json(res, 410, { error: 'conversa expirada' })

    const secret = await one(`sc_once_secrets?message_id=eq.${id}&select=envelope,file_path,view_seconds`)

    // apaga ANTES de responder: se dois pedidos chegarem juntos, só um consegue o delete
    const deleted = await rest(`sc_messages?id=eq.${id}`, { method: 'DELETE', prefer: 'return=representation' })
    if (!Array.isArray(deleted) || !deleted.length || !secret) {
      await serverAlert(user.id, m.room_id, 'reopen_denied', 'high', id, { reason: 'race_lost' })
      return json(res, 410, { error: 'conteudo ja aberto', code: 'reopen_denied' })
    }

    const viewSeconds = [5, 10, 15, 30].includes(secret.view_seconds) ? secret.view_seconds : 10
    const claimedAt = new Date()
    const expiresAt = new Date(claimedAt.getTime() + viewSeconds * 1000)
    // vira o comprovante "aberta por… às…" (trigger sc_receipt_from_consumed)
    await rest('sc_consumed_onces', {
      method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
      body: {
        message_id: id, room_id: m.room_id, sender_id: m.sender_id, viewer_id: user.id, sent_at: m.created_at,
        view_seconds: viewSeconds, claimed_at: claimedAt.toISOString(), expires_at: expiresAt.toISOString(),
        had_file: Boolean(secret.file_path),
      },
    }).catch(() => {})
    await rpc('sc_audit', { p_user: user.id, p_action: 'once_opened', p_room: m.room_id, p_meta: { id, file: Boolean(secret.file_path), view_seconds: viewSeconds } }).catch(() => {})
    await serverAlert(user.id, m.room_id, 'image_opened', 'low', id, {
      kind: secret.file_path ? 'file' : 'text', view_seconds: viewSeconds,
      note: 'Abertura autorizada pelo servidor. Nao implica captura de tela.',
    })

    const meta = { env: secret.envelope, view_seconds: viewSeconds, expires_at: expiresAt.toISOString(), message_id: id }
    if (secret.file_path) {
      const file = await storageDownload('sc-once', secret.file_path)
      await storageRemove('sc-once', [secret.file_path])
      if (!file) return json(res, 404, { error: 'arquivo indisponivel' })
      const head = Buffer.from(JSON.stringify(meta))
      const len = Buffer.alloc(4); len.writeUInt32BE(head.length, 0)
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/octet-stream')
      res.setHeader('Cache-Control', 'no-store')
      return res.end(Buffer.concat([len, head, file]))
    }
    return json(res, 200, meta)
  } catch (e) {
    return json(res, 500, { error: String((e && e.message) || e) })
  }
}
