/**
 * Gera lookup compacto zona|seção → NM_LOCAL_VOTACAO_ORIGINAL
 * a partir do CSV oficial TSE eleitorado_local_votacao_2026_MA.csv
 */
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const csvPath = path.join(__dirname, '_tmp_eleitorado', 'eleitorado_local_votacao_2026_MA.csv')
const outJson = path.join(__dirname, 'public', 'data', 'locais-votacao-ma.json')
const outMeta = path.join(__dirname, 'src', 'lib', 'locaisVotacaoMeta.ts')

function stripQuotes(s) {
  if (s == null) return ''
  const t = String(s)
  if (t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1)
  return t
}

function padZona(z) {
  const d = String(z ?? '').replace(/\D/g, '')
  return d ? d.padStart(3, '0') : ''
}

function padSecao(s) {
  const d = String(s ?? '').replace(/\D/g, '')
  return d ? d.padStart(4, '0') : ''
}

function parseLatLng(v) {
  if (v == null || v === '' || v === '-1') return null
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

// TSE exports this file in Windows-1252 / Latin-1
const raw = fs.readFileSync(csvPath, 'latin1')
const lines = raw.split(/\r?\n/).filter(Boolean)
const header = lines[0].split(';').map(stripQuotes)
const idx = Object.fromEntries(header.map((h, i) => [h, i]))

const byKey = new Map()
const byMunicipio = new Map()

for (let i = 1; i < lines.length; i++) {
  const p = lines[i].split(';').map(stripQuotes)
  const zona = padZona(p[idx.NR_ZONA])
  const secao = padSecao(p[idx.NR_SECAO])
  if (!zona || !secao) continue

  const local =
    (p[idx.NM_LOCAL_VOTACAO_ORIGINAL] || p[idx.NM_LOCAL_VOTACAO] || '').trim().replace(/\s+/g, ' ')
  if (!local) continue

  const bairro = (p[idx.NM_BAIRRO] || '').trim().replace(/\s+/g, ' ')
  const endereco = (p[idx.DS_ENDERECO_LOCVT_ORIGINAL] || p[idx.DS_ENDERECO] || '').trim().replace(/\s+/g, ' ')
  const municipio = (p[idx.NM_MUNICIPIO] || '').trim().replace(/\s+/g, ' ')
  const lat = parseLatLng(p[idx.NR_LATITUDE])
  const lng = parseLatLng(p[idx.NR_LONGITUDE])

  const key = `${zona}|${secao}`
  const situ = (p[idx.DS_SITU_LOCAL_VOTACAO] || '').toUpperCase()
  const prev = byKey.get(key)
  if (prev && situ !== 'ATIVO') continue

  // Compacto: só campos usados no mapa/ranking
  const row = { l: local }
  if (bairro) row.b = bairro
  if (endereco) row.e = endereco
  if (municipio) row.m = municipio
  if (lat != null) row.la = lat
  if (lng != null) row.ln = lng

  byKey.set(key, row)
  byMunicipio.set(municipio, (byMunicipio.get(municipio) || 0) + 1)
}

const obj = Object.fromEntries(byKey)
fs.mkdirSync(path.dirname(outJson), { recursive: true })
const json = JSON.stringify(obj)
fs.writeFileSync(outJson, json)

const topMun = [...byMunicipio.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
fs.writeFileSync(
  outMeta,
  `/** Gerado por _build-locais-votacao.cjs — não editar à mão. */\n` +
    `export const LOCAIS_VOTACAO_MA_COUNT = ${byKey.size}\n` +
    `export const LOCAIS_VOTACAO_MA_URL = '/data/locais-votacao-ma.json'\n` +
    `export const LOCAIS_VOTACAO_TOP_MUNICIPIOS = ${JSON.stringify(topMun)} as const\n`,
)

const gz = zlib.gzipSync(Buffer.from(json))
console.log('keys', byKey.size)
console.log('json bytes', Buffer.byteLength(json), 'gzip ~', gz.length)
console.log('top municipios', topMun)
console.log('sample SL zona 001', byKey.get('001|0635'))
