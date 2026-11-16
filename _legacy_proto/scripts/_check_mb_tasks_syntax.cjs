const fs = require('fs')
const path = require('path')
const vm = require('vm')

const htmlPath = path.join(__dirname, '../../alimentacao-app/public/sistemas/assessoria-mb/index.html')
const html = fs.readFileSync(htmlPath, 'utf8')
const marker = '<script type="__bundler/template">'
const start = html.indexOf(marker) + marker.length
let end = start + 1
while (end < html.length) {
  if (html[end] === '\\') {
    end += 2
    continue
  }
  if (html[end] === '"') break
  end++
}
const u = JSON.parse(html.slice(start, end + 1))
const scripts = [...u.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1])
let ok = true
scripts.forEach((s, i) => {
  try {
    new vm.Script(s, { filename: 'inline-' + i + '.js' })
    console.log('script[' + i + '] bytes=' + s.length + ' OK')
  } catch (err) {
    ok = false
    console.error('script[' + i + '] parse error:', err.message)
    const idx = Number((err.stack.match(/inline-\d+\.js:(\d+)/) || [])[1] || 0)
    if (idx) {
      const lines = s.split('\n')
      const from = Math.max(0, idx - 3)
      const to = Math.min(lines.length, idx + 3)
      for (let L = from; L < to; L++) {
        console.error(String(L + 1).padStart(4) + (L + 1 === idx ? ' > ' : ' | ') + lines[L].slice(0, 200))
      }
    }
  }
})
process.exit(ok ? 0 : 1)
