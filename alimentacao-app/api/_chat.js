// Utilitários do Chat Seguro (/chat) para as funções da Vercel. Sem dependências: só fetch + crypto.
// O conteúdo das mensagens é cifrado de ponta a ponta no aparelho; estas funções nunca conseguem lê-lo.
const crypto = require('crypto')

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
const WEBHOOK_SECRET = process.env.CHAT_WEBHOOK_SECRET

function json(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  try { return JSON.parse(req.body || '{}') } catch { return {} }
}

function envOk() {
  return Boolean(SUPABASE_URL && SERVICE_ROLE && ANON_KEY)
}

const svcHeaders = (extra = {}) => ({ Authorization: `Bearer ${SERVICE_ROLE}`, apikey: SERVICE_ROLE, ...extra })

/** Usuário dono do token (ou null). */
async function getAuthUser(req) {
  const h = req.headers.authorization || ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : ''
  if (!token) return null
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: ANON_KEY } })
  if (!r.ok) return null
  const u = await r.json().catch(() => null)
  return u && u.id ? u : null
}

/** PostgREST com service role. */
async function rest(path, { method = 'GET', body, prefer } = {}) {
  const headers = svcHeaders({ 'Content-Type': 'application/json' })
  if (prefer) headers.Prefer = prefer
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await r.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!r.ok) {
    const msg = (data && (data.message || data.error)) || `HTTP ${r.status}`
    const err = new Error(msg); err.status = r.status; throw err
  }
  return data
}
const one = async (path) => { const rows = await rest(path); return Array.isArray(rows) ? rows[0] || null : null }
const rpc = (name, args) => rest(`rpc/${name}`, { method: 'POST', body: args || {} })

// ------------------------------------------------------------------ storage
async function storageDownload(bucket, path) {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`, { headers: svcHeaders() })
  if (!r.ok) return null
  return Buffer.from(await r.arrayBuffer())
}
async function storageRemove(bucket, paths) {
  const list = (paths || []).filter(Boolean)
  if (!list.length) return
  await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}`, {
    method: 'DELETE', headers: svcHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ prefixes: list }),
  }).catch(() => {})
}
async function storageList(bucket, prefix) {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
    method: 'POST', headers: svcHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ prefix, limit: 1000, offset: 0 }),
  })
  if (!r.ok) return []
  const rows = await r.json().catch(() => [])
  return Array.isArray(rows) ? rows : []
}

// ------------------------------------------------------------------ Web Push (RFC 8291 aes128gcm + RFC 8292 VAPID)
const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64u = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (String(s).length % 4)) % 4), 'base64')

function vapidAuthorization(endpoint) {
  const pub = process.env.CHAT_VAPID_PUBLIC_KEY
  const priv = process.env.CHAT_VAPID_PRIVATE_KEY
  const subject = process.env.CHAT_VAPID_SUBJECT || 'mailto:admin@example.com'
  const p = unb64u(pub)
  const key = crypto.createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', x: b64u(p.subarray(1, 33)), y: b64u(p.subarray(33, 65)), d: priv },
    format: 'jwk',
  })
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))
  const claims = b64u(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }))
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${claims}`), { key, dsaEncoding: 'ieee-p1363' })
  return `vapid t=${head}.${claims}.${b64u(sig)}, k=${pub}`
}

/** Cifra a notificação para a inscrição do navegador (só o aparelho dela consegue abrir). */
function encryptPush(p256dh, authSecret, payload) {
  const uaPublic = unb64u(p256dh)
  const auth = unb64u(authSecret)
  const ecdh = crypto.createECDH('prime256v1')
  ecdh.generateKeys()
  const asPublic = ecdh.getPublicKey()
  const shared = ecdh.computeSecret(uaPublic)
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic])
  const ikm = Buffer.from(crypto.hkdfSync('sha256', shared, auth, keyInfo, 32))
  const salt = crypto.randomBytes(16)
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16))
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12))
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce)
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()])
  const header = Buffer.alloc(21)
  salt.copy(header, 0)
  header.writeUInt32BE(4096, 16)
  header.writeUInt8(asPublic.length, 20)
  return Buffer.concat([header, asPublic, body])
}

/** Envia para uma inscrição; devolve o status HTTP do serviço de push (404/410 = inscrição morta). */
async function sendPush(sub, payload, ttl = 3600) {
  const r = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: vapidAuthorization(sub.endpoint),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttl),
      Urgency: 'high',
    },
    body: encryptPush(sub.p256dh, sub.auth, JSON.stringify(payload)),
  })
  return r.status
}

function webhookOk(req) {
  return Boolean(WEBHOOK_SECRET) && req.headers['x-webhook-secret'] === WEBHOOK_SECRET
}

module.exports = {
  SUPABASE_URL, ANON_KEY, json, readBody, envOk, getAuthUser, rest, one, rpc,
  storageDownload, storageRemove, storageList, sendPush, encryptPush, vapidAuthorization, webhookOk, b64u, unb64u,
}
