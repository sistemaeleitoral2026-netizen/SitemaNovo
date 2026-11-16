const fs = require('fs')
const path = 'public/assessoria-mb/index.html'
const html = fs.readFileSync(path, 'utf8')
const marker = '<script type="__bundler/template">'
const start = html.indexOf(marker) + marker.length
let end = start + 1
while (end < html.length) {
  if (html[end] === '\\') { end += 2; continue }
  if (html[end] === '"') break
  end++
}
let u = JSON.parse(html.slice(start, end + 1))

const from = '<button type="submit" class="btn" id="save-next">Salvar e novo</button>'
if (!u.includes(from)) throw new Error('button not found')
u = u.replace(from, '')

// neutralize JS that clicks/listens save-next if present
let hits = 0
let p = 0
while ((p = u.indexOf('save-next', p)) >= 0) {
  hits++
  console.log('ref', JSON.stringify(u.slice(p - 80, p + 120)))
  p += 9
}
console.log('remaining save-next refs', hits)

const packed = JSON.stringify(u).replace(/\//g, '\\/')
const out = html.slice(0, start) + packed + html.slice(end + 1)
fs.writeFileSync(path, out)

const check = fs.readFileSync(path, 'utf8')
const cs = check.indexOf(marker) + marker.length
let ce = cs + 1
while (ce < check.length) {
  if (check[ce] === '\\') { ce += 2; continue }
  if (check[ce] === '"') break
  ce++
}
const again = JSON.parse(check.slice(cs, ce + 1))
console.log('ok', !again.includes('Salvar e novo'), again.includes('id="save-next"') === false)
console.log('raw </script>?', check.slice(cs, ce).includes('</script>'))
