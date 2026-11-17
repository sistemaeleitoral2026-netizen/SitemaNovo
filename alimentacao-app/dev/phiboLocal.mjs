// Só o preview local (vite). O Phibo bloqueia o IP da Vercel com HTTP 403;
// daqui, neste computador, a mesma chamada passa.
// Não registra a chave em log.

const PHIBO_API = 'https://www.phibo-api.com.br'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

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

function erroPhibo(text, status) {
  let detalhe = ''
  try {
    const j = JSON.parse(text)
    if (j && typeof j.mensagem === 'string') detalhe = j.mensagem.slice(0, 180)
  } catch { /* corpo não é JSON */ }
  if (status === 403 && !detalhe) return 'O Phibo bloqueou esta chamada (HTTP 403).'
  if (detalhe) return `Phibo recusou (HTTP ${status}): ${detalhe}`
  if (status === 401) return 'Chave do Phibo recusada. No Phibo, já dentro do painel, copie de novo.'
  return `Phibo recusou (HTTP ${status}).`
}

async function phibo(path, accessToken) {
  const r = await fetch(`${PHIBO_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': UA, Accept: 'application/json' },
  })
  const text = await r.text()
  if (!r.ok) throw new Error(erroPhibo(text, r.status))
  try { return JSON.parse(text) } catch { throw new Error('Resposta do Phibo não é JSON.') }
}

export async function puxarPhibo(refreshToken) {
  const token = String(refreshToken || '').trim().replace(/^"+|"+$/g, '')
  if (token.length < 20) return { ok: false, erro: 'Chave do Phibo inválida.' }

  const r = await fetch(`${PHIBO_API}/auth/refreshToken/${encodeURIComponent(token)}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  })
  const text = await r.text()
  if (!r.ok) return { ok: false, erro: erroPhibo(text, r.status) }

  let corpo = null
  try { corpo = JSON.parse(text) } catch { corpo = null }
  const { access, refresh } = acharTokens(corpo)
  if (!access) return { ok: false, erro: 'Resposta da renovação do Phibo sem accessToken.' }

  const vendasMes = await phibo('/dashboard/vendasMes', access)
  let totais = null
  try { totais = await phibo('/relacaoVendas/periodo/totais?opcaoFiltro=mesAtual', access) } catch { totais = null }

  return { ok: true, refresh: refresh || token, vendasMes, totais }
}
