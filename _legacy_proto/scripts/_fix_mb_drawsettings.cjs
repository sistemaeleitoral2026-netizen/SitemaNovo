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

u = u.replace(/const\s+const\s+fileMem/g, 'const fileMem')

const i = u.indexOf('function updateDirty()')
const j = u.indexOf('function setTab(t){')
console.log('updateDirty..setTab length', j - i)
fs.writeFileSync(path.join(__dirname, '_mb_settings_broken.txt'), u.slice(i, j))

// The bug in drawSettings: `.join('')||'<tr>...'` inside template — the `'` in `||'...'` can close wrong.
// Safer rewrite of the whole settings helpers + drawSettings.

const from = u.indexOf('const setOriginal=')
const to = j
if (from < 0 || to < 0) throw new Error('bounds')

const replacement = `
const setOriginal=()=>{if(SET.tab==='centers'){refreshCostCodes();return COST_CODES.map(c=>({code:c,desc:db.centers[c]||''}))}return [...(db[SETDEF[SET.tab].key]||[])]};
const setClean=d=>{if(SET.tab==='centers'){const rows=(d||[]).map(r=>({code:String(r.code||'').trim().toUpperCase(),desc:String(r.desc||'').trim()})).filter(r=>r.code);const seen=new Set();const out=[];for(const r of rows){if(seen.has(r.code))continue;seen.add(r.code);out.push(r)}return out}return [...new Set((d||[]).map(s=>String(s).trim()).filter(Boolean))]};
const setDirty=()=>SET.edit&&JSON.stringify(setClean(SET.draft))!==JSON.stringify(setClean(setOriginal()));
function updateDirty(){const on=setDirty();const ind=$('#dirty-ind'),btn=$('#set-save');if(ind){ind.classList.toggle('on',on);ind.textContent=on?'Alterações não salvas':'Nenhuma alteração'}if(btn)btn.disabled=!on;const sel=SET.tab==='centers'?'.edit-row input[data-code-i]':'.edit-row input[data-i]';const seen={};$$(sel).forEach(inp=>{const v=SET.tab==='centers'?inp.value.trim().toUpperCase():inp.value.trim().toLowerCase();inp.classList.toggle('dup',!!v&&!!seen[v]);if(v)seen[v]=1})}
function drawSettings(){refreshCostCodes();refreshCompanies();const c={centers:COST_CODES.length,banks:db.banks.length,templates:db.templates.length,staff:db.staff.length,companies:subdivisions.length};for(const k in c){const el=$('#snc-'+k);if(el)el.textContent=c[k]}$$('.sn-btn').forEach(b=>b.classList.toggle('active',b.dataset.set===SET.tab));$('#set-env').classList.toggle('hide',SET.tab!=='env');$('#set-dynamic').classList.toggle('hide',SET.tab==='env');if(SET.tab==='env'){const files=[...db.finance,...db.tasks,...Object.values(db.historyEdits)].reduce((n,r)=>n+((r&&r.anexos)||[]).length,0);$('#env-stats').innerHTML=[['Lançamentos',db.finance.length],['Tarefas',db.tasks.length],['Edições na planilha',Object.keys(db.historyEdits).length],['Comprovantes',files],['Registros de auditoria',db.audit.length]].map(x=>'<div><span>'+x[0]+'</span><strong>'+x[1].toLocaleString('pt-BR')+'</strong></div>').join('');return}const def=SETDEF[SET.tab];let body='',foot='',head='';
if(!SET.edit){head='<button type="button" class="btn" data-set-act="edit">'+icon('edit')+'Editar</button><button type="button" class="btn primary" data-set-act="edit-add">'+icon('plus')+'Adicionar</button>';if(SET.tab==='centers'){const rows=COST_CODES.map(k=>{const n=db.finance.filter(r=>r.centro===k).length;return '<tr><td class="code">'+esc(k)+'</td><td class="wrap">'+(db.centers[k]?esc(db.centers[k]):'<span class="muted">Sem descrição</span>')+'</td><td class="amount">'+n+'</td></tr>'}).join('');body='<table class="set-table"><thead><tr><th>Código</th><th>Descrição</th><th>Lançamentos</th></tr></thead><tbody>'+(rows||'<tr><td colspan="3" class="empty">Nenhum centro cadastrado</td></tr>')+'</tbody></table>'}else{const list=db[def.key]||[];body=list.length?'<table class="set-table"><thead><tr><th>#</th><th>Nome</th><th>Uso</th></tr></thead><tbody>'+list.map((v,i)=>'<tr><td class="idx">'+String(i+1).padStart(2,'0')+'</td><td><b>'+esc(v)+'</b></td><td class="amount">'+def.usage(v)+'</td></tr>').join('')+'</tbody></table>':'<div class="empty">'+icon('list')+'<strong>Nenhum item cadastrado</strong><p>Adicione opções para agilizar o preenchimento dos formulários.</p><button type="button" class="btn primary" data-set-act="edit-add" style="margin-top:10px">'+icon('plus')+'Adicionar '+def.item+'</button></div>'}}
else{if(SET.tab==='centers'){body='<div class="edit-list">'+SET.draft.map((r,i)=>'<div class="edit-row" style="grid-template-columns:110px minmax(0,1fr) 36px"><input class="control" data-code-i="'+i+'" maxlength="24" placeholder="Código" value="'+esc(r.code||'')+'"><input class="control" data-desc-i="'+i+'" maxlength="180" placeholder="Descrição" value="'+esc(r.desc||'')+'"><button type="button" class="icon-btn sm danger" data-set-act="remove" data-i="'+i+'" aria-label="Remover" title="Remover">'+icon('trash')+'</button></div>').join('')+'<button type="button" class="add-row" data-set-act="add">'+icon('plus')+'Adicionar centro</button></div>'}else{body='<div class="edit-list">'+SET.draft.map((v,i)=>'<div class="edit-row"><span class="er-idx">'+String(i+1).padStart(2,'0')+'</span><input class="control" data-i="'+i+'" maxlength="120" placeholder="Nome da '+def.item+'" value="'+esc(v)+'"><button type="button" class="icon-btn sm danger" data-set-act="remove" data-i="'+i+'" aria-label="Remover" title="Remover">'+icon('trash')+'</button></div>').join('')+'<button type="button" class="add-row" data-set-act="add">'+icon('plus')+'Adicionar '+def.item+'</button></div>'}foot='<div class="set-foot"><span class="dirty-ind" id="dirty-ind">Nenhuma alteração</span><button type="button" class="btn" data-set-act="cancel">Cancelar</button><button type="button" class="btn primary" data-set-act="save" id="set-save" disabled>'+icon('check')+'Salvar alterações</button></div>';head='<span class="pill info">Modo de edição</span>'}
$('#set-dynamic').innerHTML='<div class="set-card"><div class="set-head"><div><h2>'+def.title+'</h2><p>'+def.desc+'</p></div><div class="actions">'+head+'</div></div><div class="set-body">'+body+'</div>'+foot+(SET.edit?'<div class="set-note">Itens vazios e duplicados são ignorados ao salvar. Pressione Enter para adicionar uma nova linha.</div>':'')+'</div>';if(SET.edit)updateDirty()}
`

u = u.slice(0, from) + replacement + u.slice(to)

const script = u.match(/<script>([\s\S]*?)<\/script>/)[1]
const tmp = path.join(__dirname, '_mb_script_tmp.js')
fs.writeFileSync(tmp, script)
const { spawnSync } = require('child_process')
const res = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' })
if (res.status !== 0) {
  console.error(res.stderr)
  throw new Error('still invalid')
}
console.log('syntax OK')

const packed = JSON.stringify(u).replace(/\//g, '\\/')
if (packed.includes('</script>')) throw new Error('raw </script>')
fs.writeFileSync(htmlPath, html.slice(0, start) + packed + html.slice(end + 1))
console.log('written')
