/**
 * Converte o CSV do BU (votos por zona/seção/candidato) em JSON compacto
 * para a tela Auditoria.  Rode:
 *   node _build_bu_auditoria.cjs "C:\caminho\votos_sao_luis.csv"
 * Saída: public/data/bu-sao-luis.json
 */
const fs = require('fs')
const path = require('path')

const src = process.argv[2] || 'C:/Users/PC/Desktop/BU_SaoLuis/votos_sao_luis.csv'
const out = path.join(__dirname, 'public', 'data', 'bu-sao-luis.json')

const cargos = []
const candMaps = [] // por cargo: Map "numero|nome|partido" -> idx
const cand = []     // por cargo: [[numero, nome, partido], ...]
const secoes = {}

const lines = fs.readFileSync(src, 'utf8').split(/\r?\n/)
for (let i = 1; i < lines.length; i++) {
  const l = lines[i]
  if (!l) continue
  const p = l.split(';')
  if (p.length < 8) continue
  const [zRaw, sRaw, cargo, numero, nome, partido, tipo, votosRaw] = p
  const votos = parseInt(votosRaw, 10) || 0
  const zona = zRaw.replace(/\D/g, '').padStart(3, '0')
  const secao = sRaw.replace(/\D/g, '').padStart(4, '0')
  let ci = cargos.indexOf(cargo)
  if (ci < 0) {
    ci = cargos.length
    cargos.push(cargo)
    candMaps.push(new Map())
    cand.push([])
  }
  const key = `${zona}|${secao}`
  const sec = (secoes[key] ||= {})
  // [branco, nulo, legenda, [[candIdx, votos], ...]]
  const c = (sec[ci] ||= [0, 0, 0, []])
  if (tipo === 'branco') c[0] += votos
  else if (tipo === 'nulo') c[1] += votos
  else if (tipo === 'legenda') c[2] += votos
  else {
    const ck = `${numero}|${nome}|${partido}`
    let idx = candMaps[ci].get(ck)
    if (idx === undefined) {
      idx = cand[ci].length
      candMaps[ci].set(ck, idx)
      cand[ci].push([numero, nome, partido])
    }
    c[3].push([idx, votos])
  }
}

fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, JSON.stringify({ cargos, cand, secoes }))
console.log('seções:', Object.keys(secoes).length, 'cargos:', cargos, 'candidatos:', cand.map((c) => c.length))
console.log('arquivo:', out, (fs.statSync(out).size / 1048576).toFixed(2), 'MB')
