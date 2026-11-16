/**
 * Liga o embed Assessoria MB ao Supabase via postMessage (parent React).
 * Uso: node _legacy_proto/scripts/_patch_assessoria_cloud.cjs
 */
const fs = require('fs')
const path = require('path')

const htmlPath = path.join(
  __dirname,
  '..',
  '..',
  'alimentacao-app',
  'public',
  'sistemas',
  'assessoria-mb',
  'index.html',
)
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
let u = JSON.parse(html.slice(start, end + 1))

function mustReplace(from, to, label) {
  if (!u.includes(from)) throw new Error('missing: ' + label)
  u = u.split(from).join(to)
  console.log('ok', label)
}

// 1) monthlyHistory mutável para hidratar da nuvem
mustReplace('const monthlyHistory=', 'let monthlyHistory=', 'monthlyHistory let')

// 2) IDs novos em UUID
mustReplace(
  "id:editing||'task'+Date.now()",
  "id:editing||crypto.randomUUID()",
  'task uuid',
)
mustReplace(
  "id:editing||'fin'+Date.now()",
  "id:editing||crypto.randomUUID()",
  'fin uuid',
)

// 3) save() com sync na nuvem
mustReplace(
  "const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(db))}catch{toast('Não foi possível salvar no navegador')}};",
  `const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(db))}catch{toast('Não foi possível salvar no navegador')}scheduleCloudSave()};
let cloudTimer=null,cloudReq=0,cloudPending={};
async function blobToB64(blob){const buf=await blob.arrayBuffer();const bytes=new Uint8Array(buf);let s='';for(let i=0;i<bytes.length;i++)s+=String.fromCharCode(bytes[i]);return btoa(s)}
async function collectPendingFiles(snapshot){const files={};const lists=[];for(const r of snapshot.finance||[])for(const a of r.anexos||[])lists.push(a);for(const t of snapshot.tasks||[])for(const a of t.anexos||[])lists.push(a);for(const ed of Object.values(snapshot.historyEdits||{}))for(const a of ed.anexos||[])lists.push(a);for(const a of lists){if(!a||!a.id||a.path||a.signedUrl)continue;const blob=await fileStore.get(a.id);if(!blob)continue;files[a.id]={name:a.name||'arquivo',type:a.type||blob.type||'application/octet-stream',size:a.size||blob.size||0,dataBase64:await blobToB64(blob)}}return files}
function scheduleCloudSave(){if(!MB.embed)return;clearTimeout(cloudTimer);cloudTimer=setTimeout(()=>void cloudSave(),600)}
async function cloudSave(){if(!MB.embed)return;const requestId='p'+(++cloudReq);const snapshot={finance:db.finance,tasks:db.tasks,audit:db.audit,banks:db.banks,templates:db.templates,staff:db.staff,centers:db.centers||{},historyEdits:db.historyEdits||{},prestacao:Array.isArray(monthlyHistory)?monthlyHistory:[]};try{snapshot._files=await collectPendingFiles(snapshot)}catch(err){toast('Falha ao ler comprovantes para nuvem');return}cloudPending[requestId]=true;toParent({type:'mb-persist',requestId,payload:snapshot})}
function applyCloudDb(payload){if(!payload||typeof payload!=='object')return;db.finance=Array.isArray(payload.finance)?payload.finance:[];db.tasks=Array.isArray(payload.tasks)?payload.tasks:[];db.audit=Array.isArray(payload.audit)?payload.audit:[];if(Array.isArray(payload.banks)&&payload.banks.length)db.banks=payload.banks.slice();if(Array.isArray(payload.templates)&&payload.templates.length)db.templates=payload.templates.slice();if(Array.isArray(payload.staff))db.staff=payload.staff.slice();if(payload.centers&&typeof payload.centers==='object')db.centers=payload.centers;db.historyEdits=payload.historyEdits&&typeof payload.historyEdits==='object'?payload.historyEdits:{};if(Array.isArray(payload.prestacao)&&payload.prestacao.length)monthlyHistory=payload.prestacao.map(r=>({id:r.id,mes:r.mes,aba:r.aba,linha:r.linha,nome:r.nome,descricao:r.descricao,data:r.data,valor:r.valor,banco:r.banco,extrato:r.extrato,situacao:r.situacao,observacao:r.observacao}));try{localStorage.setItem(KEY,JSON.stringify(db))}catch{}render()}
`,
  'cloud save',
)

// 4) audit com nome do usuário logado + uuid
mustReplace(
  "function audit(action,detail){db.audit.unshift({id:Date.now(),at:new Date().toISOString(),actor:'Jurandy Santana',action,detail});save()}",
  "function audit(action,detail){db.audit.unshift({id:crypto.randomUUID(),at:new Date().toISOString(),actor:MB.nome||'Usuário',action,detail});save()}",
  'audit actor',
)

// 5) storeFile com uuid
mustReplace(
  "function storeFile(file){const id='f'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);fileStore.put(id,file);return {id,name:file.name,type:file.type,size:file.size}}",
  "function storeFile(file){const id=crypto.randomUUID();fileStore.put(id,file);return {id,name:file.name,type:file.type,size:file.size}}",
  'storeFile uuid',
)

// 6) nota dos anexos
mustReplace(
  'Os arquivos ficam salvos neste navegador e podem ser visualizados em Comprovantes.',
  'Os comprovantes são salvos na nuvem (Supabase) e podem ser visualizados em Comprovantes.',
  'anexo note',
)

// 7) fileStore.get com fallback nuvem (signedUrl / path via parent)
mustReplace(
  "get:id=>fileDB.then(d=>new Promise(res=>{const q=d.transaction('files').objectStore('files').get(id);q.onsuccess=()=>res(q.result||null);q.onerror=()=>res(null)})).catch(()=>null)};",
  `get:id=>fileDB.then(d=>new Promise(res=>{const q=d.transaction('files').objectStore('files').get(id);q.onsuccess=()=>res(q.result||null);q.onerror=()=>res(null)})).catch(()=>null)};
const fileWait={};
function requestCloudFile(path){return new Promise((resolve,reject)=>{if(!path){reject(new Error('sem path'));return}const requestId='f'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);fileWait[requestId]={resolve,reject};toParent({type:'mb-file-get',requestId,path});setTimeout(()=>{if(fileWait[requestId]){fileWait[requestId].reject(new Error('timeout arquivo'));delete fileWait[requestId]}},20000)})}
async function resolveAnexoBlob(f){if(!f)return null;const local=await fileStore.get(f.id);if(local)return local;if(f.signedUrl){try{const r=await fetch(f.signedUrl);if(r.ok){const b=await r.blob();fileStore.put(f.id,b);return b}}catch{}}if(f.path){try{const data=await requestCloudFile(f.path);const bin=atob(data.dataBase64);const bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);const b=new Blob([bytes],{type:data.mime||f.type||'application/octet-stream'});fileStore.put(f.id,b);return b}catch{}}return null}
`,
  'file cloud get',
)

// 8) showFile usa resolveAnexoBlob — localizar trecho atual
const showOld =
  "async function showFile(i){const f=viewerData.files[i];$$('#viewer-list button').forEach((b,j)=>b.classList.toggle('active',j===i));if(viewerURL){URL.revokeObjectURL(viewerURL);viewerURL=null}const pv=$('#viewer-preview');pv.innerHTML=`<div "
if (!u.includes(showOld)) {
  // try to find showFile and patch fileStore.get call inside
  const idx = u.indexOf('async function showFile(i){')
  if (idx < 0) throw new Error('missing showFile')
  const chunk = u.slice(idx, idx + 900)
  console.log('showFile chunk preview:', JSON.stringify(chunk.slice(0, 400)))
  if (chunk.includes('fileStore.get(f.id)')) {
    u = u.replace(
      'const blob=await fileStore.get(f.id);',
      'const blob=await resolveAnexoBlob(f);',
    )
    console.log('ok showFile resolveAnexoBlob')
  } else if (chunk.includes('await fileStore.get')) {
    u = u.replace(/await fileStore\.get\(f\.id\)/g, 'await resolveAnexoBlob(f)')
    console.log('ok showFile resolveAnexoBlob (alt)')
  } else {
    throw new Error('could not patch showFile')
  }
} else {
  console.log('showFile marker found (unexpected exact) — skipped auto')
}

// 9) message listener: hydrate + persist result + file data
mustReplace(
  "window.addEventListener('message',e=>{if(e.origin!==location.origin)return;const d=e.data||{};if(d.type==='mb-user'){MB.nome=String(d.nome||MB.nome);MB.admin=!!d.admin;drawUser()}});",
  `window.addEventListener('message',e=>{if(e.origin!==location.origin)return;const d=e.data||{};if(d.type==='mb-user'){MB.nome=String(d.nome||MB.nome);MB.admin=!!d.admin;drawUser()}if(d.type==='mb-hydrate'&&d.payload){applyCloudDb(d.payload);toast('Dados sincronizados')}if(d.type==='mb-persist-ok'){delete cloudPending[d.requestId];if(d.payload)applyCloudDb(d.payload);toast('Salvo na nuvem')}if(d.type==='mb-persist-erro'){delete cloudPending[d.requestId];toast(d.erro||'Falha ao salvar na nuvem')}if(d.type==='mb-file-data'&&d.requestId&&fileWait[d.requestId]){fileWait[d.requestId].resolve(d);delete fileWait[d.requestId]}if(d.type==='mb-file-erro'&&d.requestId&&fileWait[d.requestId]){fileWait[d.requestId].reject(new Error(d.erro||'erro arquivo'));delete fileWait[d.requestId]}});`,
  'message hydrate',
)

const packed = JSON.stringify(u).replace(/\//g, '\\/')
if (packed.includes('</script>')) throw new Error('raw </script> in packed output')
const out = html.slice(0, start) + packed + html.slice(end + 1)
fs.writeFileSync(htmlPath, out)
console.log('patched', htmlPath, 'bytes', out.length)
