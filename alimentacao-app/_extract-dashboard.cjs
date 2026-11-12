const fs = require('fs')
const path = require('path')

const candidates = [
  'c:/Users/PC/Desktop/BATIMENTO DE COMPRAS/Dashboard Nerites.html',
  'c:/Users/PC/Desktop/BATIMENTO DE COMPRAS/Dashboard Nerites (standalone).html',
]

const p = candidates.find((f) => fs.existsSync(f))
if (!p) {
  console.error('file not found')
  process.exit(1)
}

const html = fs.readFileSync(p, 'utf8')
console.log('source', p, 'bytes', html.length)

const start = html.indexOf('<script type="__bundler/template">')
const end = html.indexOf('</script>', start + 10)
if (start < 0 || end < 0) {
  console.error('template not found', start, end)
  process.exit(1)
}

const raw = html.slice(start + '<script type="__bundler/template">'.length, end).trim()
const template = JSON.parse(raw)
const out = path.join(__dirname, '_extracted-dashboard.html')
fs.writeFileSync(out, template)
console.log('wrote', out, 'len', template.length)

// Also dump styles and section outline
const styleMatch = template.match(/<style[\s\S]*?<\/style>/gi) || []
fs.writeFileSync(path.join(__dirname, '_extracted-dashboard-styles.css'), styleMatch.join('\n\n'))
console.log('styles blocks', styleMatch.length, 'chars', styleMatch.join('').length)

const headings = [...template.matchAll(/<(h[1-6]|button|section)[^>]*>([^<]{0,80})/gi)]
  .slice(0, 80)
  .map((m) => `${m[1]}: ${m[2].replace(/\s+/g, ' ').trim()}`)
fs.writeFileSync(path.join(__dirname, '_extracted-dashboard-outline.txt'), headings.join('\n'))
console.log('outline lines', headings.length)
