const fs = require('fs')
const path = require('path')

const html = fs.readFileSync(path.join(__dirname, '_extracted-dashboard.html'), 'utf8')

// Outer shell start
const bodyStart = html.indexOf('<body>')
const asideStart = html.indexOf('<aside')
console.log('--- shell prologue ---')
console.log(html.slice(bodyStart, asideStart).slice(0, 2500))

// After aside until main content padding
const asideEnd = html.indexOf('</aside>') + '</aside>'.length
const mainContentStart = html.indexOf('<div style="padding:26px 28px')
console.log('\n--- between aside and dash padding ---')
console.log(html.slice(asideEnd, mainContentStart).slice(0, 2000))

// Section order by h2/h3
const heads = [...html.matchAll(/<h([123])[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => {
  const text = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
  return `h${m[1]}: ${text}`
})
console.log('\n--- headings order ---')
heads.forEach((h) => console.log(h))

// Extract remaining sections after first viewport cut
const evoIdx = html.indexOf('Evolução de cadastros')
const rest = html.slice(evoIdx)
fs.writeFileSync(path.join(__dirname, '_snippet-rest-dashboard.html'), rest.slice(0, 25000))

// Check for logout, menu button, icons on labels
const checks = [
  'Encerrar',
  'LogOut',
  'logout',
  'menu',
  'Sair',
  'MetaGoal',
  'popup',
  'Faltam',
  'Meta alcançada',
  'tabular',
  'Helvetica',
  'font-family',
  'width:232',
  '1520px',
  'Abrir fichas',
  'Ver tudo',
  'Gerenciar',
  'Mapa completo',
  'Cobertura',
  'Seções mais ativas',
  'Intensidade',
  'pendente',
  'Carros adesivados',
  'Adesivos para casa',
  'Postagens',
  'Sem lançamento',
  'filtrando',
  'Limpar filtro',
  'Configurar',
  'v 1.0.0',
  'Painel administrativo',
  'Sistema de gestão',
]
console.log('\n--- presence checks ---')
for (const c of checks) {
  console.log(`${html.includes(c) ? 'YES' : 'NO '} ${c}`)
}

// Count SVG icons before labels in summary
const summaryStart = html.indexOf('Meta de fichas')
const summaryChunk = html.slice(summaryStart - 500, summaryStart + 3500)
const svgCount = (summaryChunk.match(/<svg/g) || []).length
console.log('\nsummary svg count near meta:', svgCount)

// Dir card mini grid styles
const miniIdx = html.indexOf('grid-template-columns:repeat(3,minmax(0,1fr))')
console.log('\n--- dir minis style snippet ---')
console.log(html.slice(miniIdx - 80, miniIdx + 600))

// Desempenho grid
const desp = html.indexOf('Desempenho')
console.log('\n--- desempenho area ---')
console.log(html.slice(desp - 100, desp + 800))

// Map legend
const map = html.indexOf('Mapa por zona')
console.log('\n--- map section start ---')
console.log(html.slice(map - 50, map + 1200))

// Meta popup at end
const faltam = html.indexOf('Faltam')
console.log('\n--- meta popup ---')
console.log(html.slice(faltam - 400, faltam + 1500))

// Font on root wrapper
const wrap = html.match(/font-family:[^;"']+/g) || []
console.log('\n--- font-family decls ---')
;[...new Set(wrap)].forEach((f) => console.log(f))

// Widths / key layout values
const layoutKeys = [
  'width:232px',
  'padding:20px 14px',
  'gap:26px',
  'padding:26px 28px 44px',
  'max-width:1520px',
  'gap:24px',
  'grid-template-columns:minmax(0,1.6fr) minmax(0,1fr)',
  'grid-template-columns:repeat(3,minmax(0,1fr))',
  'minmax(320px,1fr)',
]
console.log('\n--- layout key presence ---')
for (const k of layoutKeys) console.log(`${html.includes(k) ? 'YES' : 'NO '} ${k}`)
