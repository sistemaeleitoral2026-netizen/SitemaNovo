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
const from = 'const blob=f.id?await fileStore.get(f.id):null;'
const to = 'const blob=await resolveAnexoBlob(f);'
if (!u.includes(from)) throw new Error('showFile blob line missing')
u = u.replace(from, to)
const packed = JSON.stringify(u).replace(/\//g, '\\/')
if (packed.includes('</script>')) throw new Error('raw </script>')
fs.writeFileSync(htmlPath, html.slice(0, start) + packed + html.slice(end + 1))
console.log('showFile patched')
