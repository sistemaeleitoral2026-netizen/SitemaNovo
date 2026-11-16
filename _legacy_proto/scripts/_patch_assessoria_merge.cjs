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
const from = "if(d.type==='mb-hydrate'&&d.payload){applyCloudDb(d.payload);toast('Dados sincronizados')}"
const to = "if(d.type==='mb-hydrate'&&d.payload){const p=d.payload;const remoteEmpty=!(p.finance&&p.finance.length)&&!(p.tasks&&p.tasks.length);if(remoteEmpty&&(db.finance.length||db.tasks.length)){toast('Enviando dados locais para a nuvem');scheduleCloudSave()}else{applyCloudDb(p);toast('Dados sincronizados')}}"
if (!u.includes(from)) throw new Error('hydrate handler missing')
u = u.replace(from, to)
const packed = JSON.stringify(u).replace(/\//g, '\\/')
fs.writeFileSync(htmlPath, html.slice(0, start) + packed + html.slice(end + 1))
console.log('merge-on-empty patched')
