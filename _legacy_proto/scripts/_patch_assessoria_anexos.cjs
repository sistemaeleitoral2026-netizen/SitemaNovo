/**
 * Corrige cache de anexos + snapshot leve (sem planilha inteira).
 * node _legacy_proto/scripts/_patch_assessoria_anexos.cjs
 */
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

function mustReplace(from, to, label) {
  if (!u.includes(from)) throw new Error('missing: ' + label)
  u = u.split(from).join(to)
  console.log('ok', label)
}

mustReplace(
  "fileStore={put:(id,blob)=>fileDB.then(d=>new Promise((res,rej)=>{const tx=d.transaction('files','readwrite');tx.objectStore('files').put(blob,id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})).catch(()=>toast('Não foi possível guardar o arquivo neste navegador')),get:id=>fileDB.then(d=>new Promise(res=>{const q=d.transaction('files').objectStore('files').get(id);q.onsuccess=()=>res(q.result||null);q.onerror=()=>res(null)})).catch(()=>null)};",
  "const fileMem={};fileStore={put:(id,blob)=>{fileMem[id]=blob;return fileDB.then(d=>new Promise((res,rej)=>{const tx=d.transaction('files','readwrite');tx.objectStore('files').put(blob,id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})).catch(()=>toast('Não foi possível guardar o arquivo neste navegador'))},get:async id=>{if(fileMem[id])return fileMem[id];const blob=await fileDB.then(d=>new Promise(res=>{const q=d.transaction('files').objectStore('files').get(id);q.onsuccess=()=>res(q.result||null);q.onerror=()=>res(null)})).catch(()=>null);if(blob)fileMem[id]=blob;return blob}};",
  'fileMem cache',
)

mustReplace(
  "function storeFile(file){const id=crypto.randomUUID();fileStore.put(id,file);return {id,name:file.name,type:file.type,size:file.size}}",
  "function storeFile(file){const id=crypto.randomUUID();fileMem[id]=file;fileStore.put(id,file);return {id,name:file.name,type:file.type,size:file.size}}",
  'storeFile mem',
)

mustReplace(
  "async function collectPendingFiles(snapshot){const files={};const lists=[];for(const r of snapshot.finance||[])for(const a of r.anexos||[])lists.push(a);for(const t of snapshot.tasks||[])for(const a of t.anexos||[])lists.push(a);for(const ed of Object.values(snapshot.historyEdits||{}))for(const a of ed.anexos||[])lists.push(a);for(const a of lists){if(!a||!a.id||a.path||a.signedUrl)continue;const blob=await fileStore.get(a.id);if(!blob)continue;files[a.id]={name:a.name||'arquivo',type:a.type||blob.type||'application/octet-stream',size:a.size||blob.size||0,dataBase64:await blobToB64(blob)}}return files}",
  "async function collectPendingFiles(snapshot){const files={};const lists=[];for(const r of snapshot.finance||[])for(const a of r.anexos||[])lists.push(a);for(const t of snapshot.tasks||[])for(const a of t.anexos||[])lists.push(a);for(const ed of Object.values(snapshot.historyEdits||{}))for(const a of ed.anexos||[])lists.push(a);for(const a of lists){if(!a||!a.id||a.path||a.signedUrl)continue;const blob=fileMem[a.id]||await fileStore.get(a.id);if(!blob){console.warn('anexo sem blob',a.id,a.name);continue}files[a.id]={name:a.name||'arquivo',type:a.type||blob.type||'application/octet-stream',size:a.size||blob.size||0,dataBase64:await blobToB64(blob)}}return files}",
  'collectPending mem',
)

mustReplace(
  "async function cloudSave(){if(!MB.embed)return;const requestId='p'+(++cloudReq);const snapshot={finance:db.finance,tasks:db.tasks,audit:db.audit,banks:db.banks,templates:db.templates,staff:db.staff,centers:db.centers||{},companies:db.companies||subdivisions.slice(),historyEdits:db.historyEdits||{},prestacao:Array.isArray(monthlyHistory)?monthlyHistory:[]};try{snapshot._files=await collectPendingFiles(snapshot)}catch(err){toast('Falha ao ler comprovantes para nuvem');return}cloudPending[requestId]=true;toParent({type:'mb-persist',requestId,payload:snapshot})}",
  "async function cloudSave(){if(!MB.embed)return;const requestId='p'+(++cloudReq);const snapshot={finance:db.finance,tasks:db.tasks,audit:db.audit,banks:db.banks,templates:db.templates,staff:db.staff,centers:db.centers||{},companies:db.companies||subdivisions.slice(),historyEdits:db.historyEdits||{},prestacao:[]};try{snapshot._files=await collectPendingFiles(snapshot)}catch(err){toast('Falha ao ler comprovantes para nuvem');return}cloudPending[requestId]=true;try{toParent({type:'mb-persist',requestId,payload:snapshot})}catch(err){delete cloudPending[requestId];toast('Arquivo grande demais para enviar. Use PDF/imagem menor.')}}",
  'cloudSave light',
)

const packed = JSON.stringify(u).replace(/\//g, '\\/')
if (packed.includes('</script>')) throw new Error('raw </script>')
fs.writeFileSync(htmlPath, html.slice(0, start) + packed + html.slice(end + 1))
console.log('done')
