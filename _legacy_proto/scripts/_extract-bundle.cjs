const fs = require('fs')
const p = 'c:/Users/PC/Desktop/BATIMENTO DE COMPRAS/Dashboard Nerites (standalone).html'
const html = fs.readFileSync(p, 'utf8')
const start = html.indexOf('<script type="__bundler/template">')
const end = html.indexOf('</script>', start + 10)
if (start < 0 || end < 0) {
  console.error('template not found', start, end)
  process.exit(1)
}
const raw = html.slice(start + '<script type="__bundler/template">'.length, end).trim()
const template = JSON.parse(raw)
const out = 'c:/Users/PC/Desktop/alimentacao-sistema/alimentacao-app/_extracted-dashboard.html'
fs.writeFileSync(out, template)
console.log('wrote', out, 'len', template.length)
