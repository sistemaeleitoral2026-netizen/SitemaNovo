const fs = require('fs')
const path = require('path')
const htmlPath = path.join(__dirname, '..', '..', 'alimentacao-app', 'public', 'sistemas', 'assessoria-mb', 'index.html')
const html = fs.readFileSync(htmlPath, 'utf8')
const marker = '<script type="__bundler/template">'
const start = html.indexOf(marker) + marker.length
let end = start + 1
while (end < html.length) {
  if (html[end] === '\\') { end += 2; continue }
  if (html[end] === '"') break
  end++
}
let u = JSON.parse(html.slice(start, end + 1))

const bad = 'const const fileMem={};'
if (!u.includes(bad)) {
  // also try without newline variants
  console.log('exact bad not found, searching...')
  const i = u.indexOf('const fileMem')
  console.log(JSON.stringify(u.slice(i - 30, i + 80)))
  throw new Error('pattern not found')
}
u = u.replace(bad, 'const fileMem={};')

// validate
try {
  const script = u.match(/<script>([\s\S]*?)<\/script>/)[1]
  // eslint-disable-next-line no-new-func
  new Function(script)
  console.log('syntax OK')
} catch (e) {
  console.error('still broken', e.message)
  throw e
}

const packed = JSON.stringify(u).replace(/\//g, '\\/')
if (packed.includes('</script>')) throw new Error('raw </script>')
fs.writeFileSync(htmlPath, html.slice(0, start) + packed + html.slice(end + 1))
console.log('fixed')
