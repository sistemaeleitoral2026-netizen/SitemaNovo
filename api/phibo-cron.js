// Vendas da loja RE FASHION (Phibo ERP) -> Empresas (mr_lancamentos + mr_phibo_resumo).
// Agendamento: supabase/migrations/20261117c_mr_phibo.sql (pg_cron, de hora em hora).
// Chamada pelo agendador: GET /api/phibo-cron com "Authorization: Bearer <CRON_SECRET>".
// Chamada pelo botão "Sincronizar agora": mesmo GET com o token de sessão de um admin do Empresas.
//
// A sessão do Phibo (refreshToken) fica em mr_phibo_sessao, que só a service role lê.
// Cada execução consome o refreshToken atual e grava o novo par antes de puxar os dados.

const crypto = require('crypto')

const SUPABASE_URL = String(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '')
const SERVICE_ROLE = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
const ANON_KEY = String(process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim()

const PHIBO_API = 'https://www.phibo-api.com.br'
const EMPRESA = 're-fashion'
const CONTA = 'Caixa'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

function json(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

async function db(path, { method = 'GET', body, prefer } = {}) {
  const headers = { Authorization: `Bearer ${SERVICE_ROLE}`, apikey: SERVICE_ROLE }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    headers.Prefer = prefer || 'return=minimal,resolution=merge-duplicates'
  }
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await r.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!r.ok) {
    const msg = (data && (data.message || data.error)) || `Erro ${r.status}`
    throw new Error(/PGRST205|schema cache|mr_phibo/i.test(String(msg))
      ? 'Rode supabase/migrations/20261117c_mr_phibo.sql no Supabase do Nerites.'
      : msg)
  }
  return data
}

/** Admin do Empresas (Nerites admin ou acesso externo "admin" ao mr-terceiriza). */
async function chamadorEhAdmin(token) {
  const keys = [...new Set([ANON_KEY, SERVICE_ROLE].filter(Boolean))]
  for (const apikey of keys) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey } })
    if (!r.ok) continue
    const user = await r.json().catch(() => null)
    if (!user?.id) continue
    const rows = await db(`profiles?id=eq.${user.id}&select=role,ativo,acessos_externos`)
    const p = Array.isArray(rows) ? rows[0] : null
    if (!p || p.ativo === false) return false
    return p.role === 'admin' || (p.acessos_externos && p.acessos_externos['mr-terceiriza'] === 'admin')
  }
  return false
}

/** UUID estável a partir de um texto (mesmo dia -> mesmo id -> upsert sem duplicar). */
function uuidDe(texto) {
  const h = crypto.createHash('sha1').update(texto).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)}${h.slice(18, 20)}-${h.slice(20, 32)}`
}

/** Procura accessToken/refreshToken em qualquer nível da resposta do Phibo. */
function acharTokens(obj) {
  let access = null
  let refresh = null
  const visitar = (o, prof) => {
    if (!o || typeof o !== 'object' || prof > 4) return
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'string') {
        if (!access && /^(access_?token|token|jwt)$/i.test(k)) access = v
        if (!refresh && /^refresh_?token$/i.test(k)) refresh = v
      } else visitar(v, prof + 1)
    }
  }
  visitar(obj, 0)
  return { access, refresh }
}

async function phibo(path, accessToken) {
  const r = await fetch(`${PHIBO_API}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': UA,
      Accept: 'application/json',
      Origin: 'https://app.phibo.com.br',
      Referer: 'https://app.phibo.com.br/',
    },
  })
  const text = await r.text()
  if (!r.ok) {
    const e = new Error(`Phibo ${path}: HTTP ${r.status}`)
    e.status = r.status
    throw e
  }
  try { return JSON.parse(text) } catch { throw new Error(`Phibo ${path}: resposta não é JSON`) }
}

const pad2 = (n) => String(n).padStart(2, '0')
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

function mesAnterior(ym) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 2, 1))
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`
}

function hojeSP() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

/** Uma entrada por dia com venda (id estável por dia). */
function linhasDoMes(ym, dias, agora) {
  return (Array.isArray(dias) ? dias : [])
    .filter((d) => Number(d?.dia) >= 1 && (Number(d.valor) > 0 || Number(d.qtdeVendas) > 0))
    .map((d) => {
      const dia = `${ym}-${pad2(Number(d.dia))}`
      const qtde = Number(d.qtdeVendas) || 0
      return {
        id: uuidDe(`phibo:${EMPRESA}:${dia}`),
        empresa: EMPRESA,
        data: dia,
        tipo: 'entrada',
        descricao: `Vendas do dia ${pad2(Number(d.dia))}/${ym.slice(5, 7)} (Phibo)`,
        valor: r2(d.valor),
        conta: CONTA,
        forma_pagamento: 'Outro',
        observacoes: `Importado automaticamente do Phibo · ${qtde} venda(s)${Number(d.frete) ? ` · frete ${r2(d.frete)}` : ''}`,
        origem: 'phibo',
        updated_at: agora,
      }
    })
}

module.exports = async function handler(req, res) {
  if (!SUPABASE_URL || !SERVICE_ROLE) return json(res, 503, { error: 'SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY faltam no servidor.' })

  const auth = String(req.headers.authorization || '')
  const segredo = process.env.CRON_SECRET
  let autorizado = Boolean(segredo) && auth === `Bearer ${segredo}`
  if (!autorizado && auth.startsWith('Bearer ')) {
    try { autorizado = await chamadorEhAdmin(auth.slice(7)) } catch { autorizado = false }
  }
  if (!autorizado) return json(res, 401, { error: 'Não autorizado.' })

  const agora = new Date().toISOString()
  let sessao
  try {
    const rows = await db('mr_phibo_sessao?id=eq.1&select=refresh_token')
    sessao = Array.isArray(rows) ? rows[0] : null
  } catch (e) {
    return json(res, 500, { ok: false, erro: e.message })
  }
  if (!sessao?.refresh_token) return json(res, 200, { ok: false, erro: 'Phibo ainda não conectado (Configurações do Empresas).' })

  const registrarErro = async (msg) => {
    try { await db('mr_phibo_sessao?id=eq.1', { method: 'PATCH', body: { ultima_tentativa: agora, ultimo_erro: msg } }) } catch {}
  }

  // 1) Renova a sessão (o refreshToken antigo deixa de valer).
  let accessToken
  try {
    const r = await fetch(`${PHIBO_API}/auth/refreshToken/${encodeURIComponent(sessao.refresh_token)}`, {
      headers: { 'User-Agent': UA, Accept: 'application/json', Origin: 'https://app.phibo.com.br', Referer: 'https://app.phibo.com.br/' },
    })
    const text = await r.text()
    if (!r.ok) {
      const msg = r.status === 401 || r.status === 403 || r.status === 400
        ? `Sessão do Phibo expirou (HTTP ${r.status}). Conecte de novo em Configurações.`
        : `Phibo recusou a renovação (HTTP ${r.status}).`
      await registrarErro(msg)
      return json(res, 200, { ok: false, erro: msg })
    }
    let corpo = null
    try { corpo = JSON.parse(text) } catch { corpo = null }
    const { access, refresh } = acharTokens(corpo)
    if (!access) {
      await registrarErro('Resposta da renovação do Phibo sem accessToken.')
      return json(res, 200, { ok: false, erro: 'Resposta da renovação do Phibo sem accessToken.' })
    }
    accessToken = access
    await db('mr_phibo_sessao?id=eq.1', {
      method: 'PATCH',
      body: { refresh_token: refresh || sessao.refresh_token, access_token: access, token_atualizado_em: agora, ultima_tentativa: agora },
    })
  } catch (e) {
    const msg = `Falha ao falar com o Phibo: ${e.message}`
    await registrarErro(msg)
    return json(res, 200, { ok: false, erro: msg })
  }

  // 2) Dados do mês.
  try {
    const vendasMes = await phibo('/dashboard/vendasMes', accessToken)
    const ym = String(vendasMes?.hoje || hojeSP()).slice(0, 7)

    let totais = null
    try {
      totais = await phibo('/relacaoVendas/periodo/totais?opcaoFiltro=mesAtual', accessToken)
    } catch {
      try {
        totais = await phibo(`/relacaoVendas/periodo/totais?dataInicio=${ym}-01&dataFim=${hojeSP()}`, accessToken)
      } catch { totais = null }
    }

    const linhas = [
      ...linhasDoMes(ym, vendasMes?.diasMes, agora),
      ...linhasDoMes(mesAnterior(ym), vendasMes?.diasMesAnterior, agora),
    ]
    if (linhas.length) {
      await db('mr_lancamentos?on_conflict=id', { method: 'POST', body: linhas })
    }

    await db('mr_phibo_resumo?on_conflict=empresa,mes', {
      method: 'POST',
      body: [{ empresa: EMPRESA, mes: ym, vendas_mes: vendasMes, totais, atualizado_em: agora }],
    })
    await db('mr_phibo_sessao?id=eq.1', { method: 'PATCH', body: { ultimo_ok: agora, ultimo_erro: null } })

    const totalMes = (vendasMes?.diasMes || []).reduce((s, d) => s + (Number(d.valor) || 0), 0)
    return json(res, 200, { ok: true, mes: ym, dias: linhas.length, totalMes: r2(totalMes), totais: Boolean(totais) })
  } catch (e) {
    const msg = e.status === 401 || e.status === 403
      ? `Phibo negou acesso aos dados (HTTP ${e.status}).`
      : `Falha ao puxar vendas: ${e.message}`
    await registrarErro(msg)
    return json(res, 200, { ok: false, erro: msg })
  }
}
