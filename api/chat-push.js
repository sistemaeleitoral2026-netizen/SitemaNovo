// Chat Seguro — notificações push. Chamada pelos Database Webhooks do Supabase (INSERT) em:
//   public.sc_messages        -> avisa os outros membros da sala
//   public.sc_security_alerts -> alerta de segurança (print, cópia, devtools, novo aparelho...)
// O TEXTO das mensagens nunca aparece: é cifrado de ponta a ponta e o servidor não consegue lê-lo.
// Protegida pelo header x-webhook-secret = CHAT_WEBHOOK_SECRET.
const { json, readBody, envOk, rest, one, sendPush, webhookOk } = require('./_chat')

const ALERT_TEXT = {
  screenshot_attempt: 'tentou capturar a tela',
  capture_shortcut: 'usou um atalho de captura de tela',
  print_attempt: 'tentou imprimir/salvar em PDF',
  copy_attempt: 'tentou copiar conteúdo',
  cut_attempt: 'tentou recortar conteúdo',
  devtools_open: 'abriu ferramentas de desenvolvedor',
  long_press: 'tentou salvar um conteúdo de uma visão',
  reopen_denied: 'tentou reabrir uma mensagem de uma visão',
}

async function sendTo(userIds, payload) {
  if (!userIds.length) return 0
  const subs = await rest(`sc_push_subscriptions?user_id=in.(${userIds.join(',')})&select=id,endpoint,p256dh,auth`).catch(() => [])
  let sent = 0
  await Promise.all((subs || []).map(async (s) => {
    try {
      const status = await sendPush(s, payload)
      if (status === 404 || status === 410) await rest(`sc_push_subscriptions?id=eq.${s.id}`, { method: 'DELETE', prefer: 'return=minimal' })
      else if (status < 300) sent++
    } catch { /* uma inscrição ruim não derruba as outras */ }
  }))
  return sent
}

async function roomInfo(roomId, exceptUser) {
  const [room, members] = await Promise.all([
    one(`sc_rooms?id=eq.${roomId}&select=id,type,name`),
    rest(`sc_room_members?room_id=eq.${roomId}&user_id=neq.${exceptUser}&select=user_id`).catch(() => []),
  ])
  return { room, ids: (members || []).map((m) => m.user_id) }
}
const nameOf = async (id) => ((await one(`profiles?id=eq.${id}&select=nome`)) || {}).nome || 'Alguém'

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido.' })
  if (!envOk() || !process.env.CHAT_VAPID_PUBLIC_KEY || !process.env.CHAT_VAPID_PRIVATE_KEY) {
    return json(res, 500, { error: 'Variáveis do servidor incompletas (Supabase / VAPID).' })
  }
  if (!webhookOk(req)) return json(res, 403, { error: 'forbidden' })
  try {
    const payload = readBody(req)
    const r = payload.record
    if (!r || payload.type !== 'INSERT') return json(res, 200, { skipped: true })
    const preview = (process.env.CHAT_PUSH_PREVIEW || 'preview') === 'preview'

    if (payload.table === 'sc_security_alerts') {
      if (r.severity === 'low') return json(res, 200, { skipped: 'low' })
      if (r.alert_type === 'new_device') {
        const sent = await sendTo([r.user_id], {
          title: 'Chat Seguro · alerta de segurança',
          body: 'Um novo aparelho entrou na sua conta. Se não foi você, troque a senha.', tag: 'sc-security-device',
        })
        return json(res, 200, { sent })
      }
      if (!r.room_id) return json(res, 200, { skipped: 'sem sala' })
      const [{ room, ids }, name] = await Promise.all([roomInfo(r.room_id, r.user_id), nameOf(r.user_id)])
      const where = !room || room.type === 'direct' ? '' : ` em ${room.type === 'global' ? 'Sala Geral' : room.name || 'uma conversa'}`
      const sent = await sendTo(ids, {
        title: 'Chat Seguro · alerta de segurança',
        body: `${name} ${ALERT_TEXT[r.alert_type] || 'teve um comportamento suspeito'}${where}.`,
        room_id: r.room_id, tag: `sc-security-${r.room_id}`,
      })
      return json(res, 200, { sent })
    }

    if (payload.table !== 'sc_messages') return json(res, 200, { skipped: 'tabela' })
    const [{ room, ids }, who] = await Promise.all([roomInfo(r.room_id, r.sender_id), nameOf(r.sender_id)])
    const title = !room || room.type === 'direct' ? who : (room.type === 'global' ? 'Sala Geral' : room.name || 'Conversa')
    let text = 'Nova mensagem'
    if (preview) {
      if (r.kind === 'once') text = 'Mensagem de uma visão'
      else if (r.kind === 'file') text = 'Arquivo'
      if (room && room.type !== 'direct') text = `${who}: ${text}`
    }
    const sent = await sendTo(ids, { title, body: text, room_id: r.room_id, tag: `sc-room-${r.room_id}` })
    return json(res, 200, { sent })
  } catch (e) {
    return json(res, 500, { error: String((e && e.message) || e) })
  }
}
