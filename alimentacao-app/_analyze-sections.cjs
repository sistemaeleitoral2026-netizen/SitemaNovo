const fs = require('fs')
const path = require('path')
const html = fs.readFileSync(path.join(__dirname, '_extracted-dashboard.html'), 'utf8')

function between(a, b) {
  const i = html.indexOf(a)
  const j = b ? html.indexOf(b, i + a.length) : html.length
  return html.slice(i, j > 0 ? j : i + 3000)
}

const sections = [
  ['Evolução', 'Evolução de cadastros', 'Mobilização'],
  ['Mobilização panel', '>Mobilização</h2>', 'Mapa por zona eleitoral'],
  ['Mapa', 'Mapa por zona eleitoral', 'Distribuição por zona'],
  ['Zona', 'Distribuição por zona', 'Desempenho'],
  ['Desempenho', '>Desempenho</h2>', 'Faltam'],
]

for (const [name, start, end] of sections) {
  const chunk = between(start, end)
  fs.writeFileSync(path.join(__dirname, `_sec-${name.replace(/\s+/g, '-')}.html`), chunk)
  // list text labels and svg presence
  const texts = [...chunk.matchAll(/>([A-Za-zÀ-ú0-9%·→\.\s,]{3,80})</g)]
    .map((m) => m[1].replace(/\s+/g, ' ').trim())
    .filter((t) => t && !t.startsWith('{{') && t.length < 60)
  console.log('\n====', name, 'len', chunk.length, 'svgs', (chunk.match(/<svg/g) || []).length)
  console.log([...new Set(texts)].slice(0, 40).join(' | '))
}

// Activity row structure
const act = html.indexOf('Atividade recente')
console.log('\n==== activity snippet')
console.log(html.slice(act, act + 1800))

// Top nerites row
const tn = html.indexOf('Top nerites')
console.log('\n==== top nerites snippet')
console.log(html.slice(tn, tn + 1600))

// Evolution chart structure
const evo = html.indexOf('Evolução de cadastros')
console.log('\n==== evo snippet')
console.log(html.slice(evo, evo + 2200))

// Sidebar link padding compare keys
console.log('\n==== sidebar link padding')
const linkStyle = html.match(/padding:9px 10px;border-radius:8px;background:#1f4fd8/)
console.log('active padding', !!linkStyle)

// Version color
console.log('version color #4d5870', html.includes('color:#4d5870'))
console.log('nav color #e8ebf2', html.includes('color:#e8ebf2'))
console.log('gap header user 12px', html.includes('gap:12px'))

// Period option values
console.log('option value=7', html.includes('value="7"'))
console.log('option value=30', html.includes('value="30"'))
