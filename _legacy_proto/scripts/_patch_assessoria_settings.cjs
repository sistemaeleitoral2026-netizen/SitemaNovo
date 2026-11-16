/**
 * Configurações: adicionar/editar centros, empresas e reforçar "Adicionar" nos demais.
 * node _legacy_proto/scripts/_patch_assessoria_settings.cjs
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
  if (!u.includes(from)) throw new Error('missing: ' + label + '\n' + from.slice(0, 120))
  const n = u.split(from).length - 1
  u = u.split(from).join(to)
  console.log('ok', label, 'x' + n)
}

// 1) COST_CODES dinâmico
mustReplace(
  "const COST_CODES=['M1','M2','M3','M4','M5'];",
  `let COST_CODES=['M1','M2','M3','M4','M5'];
function refreshCostCodes(){const keys=Object.keys(db.centers||{}).map(s=>String(s).trim()).filter(Boolean);if(keys.length){COST_CODES=keys.sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true}))}else{COST_CODES=['M1','M2','M3','M4','M5'];for(const c of COST_CODES){if(db.centers[c]==null)db.centers[c]=''}}}
`,
  'cost codes dynamic',
)

// After staff/historyEdits init, refresh codes + companies from db
mustReplace(
  "if(!Array.isArray(db.staff))db.staff=[];if(!db.historyEdits)db.historyEdits={};",
  `if(!Array.isArray(db.staff))db.staff=[];if(!db.historyEdits)db.historyEdits={};if(!Array.isArray(db.companies))db.companies=[];refreshCostCodes();`,
  'init companies+refresh',
)

// 2) subdivisions mutável + sync com db.companies
mustReplace(
  "const subdivisions=['ESP','MTAREIA','MTEX','MARI','IMP','SONIGNF','CAST','PREF GNF','PREF ZD'];",
  `let subdivisions=['ESP','MTAREIA','MTEX','MARI','IMP','SONIGNF','CAST','PREF GNF','PREF ZD'];
function refreshCompanies(){if(typeof db==='undefined'||!db)return;if(Array.isArray(db.companies)&&db.companies.length){subdivisions=db.companies.slice()}else{db.companies=subdivisions.slice()}}`,
  'subdivisions mutable',
)

// 3) Nav subtitle
mustReplace(
  'Centros de custo<small>Códigos M1 a M5</small>',
  'Centros de custo<small>Incluir e editar códigos</small>',
  'nav centers label',
)
mustReplace(
  'Empresas<small>Módulo financeiro</small>',
  'Empresas<small>Incluir e editar empresas</small>',
  'nav companies label',
)

// 4) SETDEF — centers/companies como listas editáveis
mustReplace(
  "const SETDEF={centers:{title:'Centros de custo',desc:'Os códigos M1 a M5 identificam o centro de custo em cada lançamento. A descrição aparece junto ao código no formulário de lançamento.'},banks:{title:'Contas e origens de pagamento',desc:'Opções do campo “Origem do pagamento” nas tarefas e prestações de contas.',key:'banks',item:'origem',usage:v=>db.tasks.filter(t=>t.origemPagamento===v).length},templates:{title:'Modelos de tarefas',desc:'Títulos sugeridos ao cadastrar uma nova tarefa. O cadastro continua aceitando tarefa livre.',key:'templates',item:'modelo',usage:v=>db.tasks.filter(t=>t.titulo===v).length},staff:{title:'Equipe administrativa',desc:'Pessoas sugeridas no campo “Responsável” das tarefas.',key:'staff',item:'pessoa',usage:v=>db.tasks.filter(t=>t.responsavel===v).length},companies:{title:'Empresas',desc:'Empresas do módulo financeiro (Demanda J). A lista é definida pelo sistema; empresas da Demanda D ainda não foram informadas.'}};",
  "const SETDEF={centers:{title:'Centros de custo',desc:'Cadastre códigos e descrições usados nos lançamentos. Você pode incluir novos centros além de M1–M5.',key:'centers',item:'centro',usage:v=>db.finance.filter(r=>r.centro===v).length},banks:{title:'Contas e origens de pagamento',desc:'Opções do campo “Origem do pagamento” nas tarefas e prestações de contas.',key:'banks',item:'origem',usage:v=>db.tasks.filter(t=>t.origemPagamento===v).length},templates:{title:'Modelos de tarefas',desc:'Títulos sugeridos ao cadastrar uma nova tarefa. O cadastro continua aceitando tarefa livre.',key:'templates',item:'modelo',usage:v=>db.tasks.filter(t=>t.titulo===v).length},staff:{title:'Equipe administrativa',desc:'Pessoas sugeridas no campo “Responsável” das tarefas.',key:'staff',item:'pessoa',usage:v=>db.tasks.filter(t=>t.responsavel===v).length},companies:{title:'Empresas',desc:'Empresas do módulo financeiro. Inclua, edite ou remova conforme a operação.',key:'companies',item:'empresa',usage:v=>db.finance.filter(r=>r.sub===v).length}};",
  'SETDEF editable',
)

// 5) setOriginal / setClean / setDirty for centers as list of {code,desc}
mustReplace(
  "const setOriginal=()=>SET.tab==='centers'?Object.fromEntries(COST_CODES.map(c=>[c,db.centers[c]||''])):[...db[SETDEF[SET.tab].key]];\nconst setClean=d=>SET.tab==='centers'?Object.fromEntries(COST_CODES.map(c=>[c,String(d[c]||'').trim()])):[...new Set(d.map(s=>String(s).trim()).filter(Boolean))];\nconst setDirty=()=>SET.edit&&JSON.stringify(setClean(SET.draft))!==JSON.stringify(setClean(setOriginal()));\nfunction updateDirty(){const on=setDirty();const ind=$('#dirty-ind'),btn=$('#set-save');if(ind){ind.classList.toggle('on',on);ind.textContent=on?'Alterações não salvas':'Nenhuma alteração'}if(btn)btn.disabled=!on;if(SET.tab!=='centers'){const seen={};$$('.edit-row input[data-i]').forEach(inp=>{const v=inp.value.trim().toLowerCase();inp.classList.toggle('dup',!!v&&!!seen[v]);if(v)seen[v]=1})}}",
  `const setOriginal=()=>{if(SET.tab==='centers'){refreshCostCodes();return COST_CODES.map(c=>({code:c,desc:db.centers[c]||''}))}return [...(db[SETDEF[SET.tab].key]||[])]};
const setClean=d=>{if(SET.tab==='centers'){const rows=(d||[]).map(r=>({code:String(r.code||'').trim().toUpperCase(),desc:String(r.desc||'').trim()})).filter(r=>r.code);const seen=new Set();const out=[];for(const r of rows){if(seen.has(r.code))continue;seen.add(r.code);out.push(r)}return out}return [...new Set((d||[]).map(s=>String(s).trim()).filter(Boolean))]};
const setDirty=()=>SET.edit&&JSON.stringify(setClean(SET.draft))!==JSON.stringify(setClean(setOriginal()));
function updateDirty(){const on=setDirty();const ind=$('#dirty-ind'),btn=$('#set-save');if(ind){ind.classList.toggle('on',on);ind.textContent=on?'Alterações não salvas':'Nenhuma alteração'}if(btn)btn.disabled=!on;if(SET.tab==='centers'){const seen={};$$('.edit-row input[data-code-i]').forEach(inp=>{const v=inp.value.trim().toUpperCase();inp.classList.toggle('dup',!!v&&!!seen[v]);if(v)seen[v]=1})}else{const seen={};$$('.edit-row input[data-i]').forEach(inp=>{const v=inp.value.trim().toLowerCase();inp.classList.toggle('dup',!!v&&!!seen[v]);if(v)seen[v]=1})}}`,
  'setOriginal/clean',
)

// 6) Replace entire drawSettings function — find exact start to end before setTab
const drawFrom = u.indexOf('function drawSettings(){')
const setTabAt = u.indexOf('function setTab(t){')
if (drawFrom < 0 || setTabAt < 0) throw new Error('drawSettings/setTab not found')
const newDraw = `function drawSettings(){refreshCostCodes();refreshCompanies();const c={centers:COST_CODES.length,banks:db.banks.length,templates:db.templates.length,staff:db.staff.length,companies:subdivisions.length};for(const k in c){const el=$('#snc-'+k);if(el)el.textContent=c[k]}$$('.sn-btn').forEach(b=>b.classList.toggle('active',b.dataset.set===SET.tab));$('#set-env').classList.toggle('hide',SET.tab!=='env');$('#set-dynamic').classList.toggle('hide',SET.tab==='env');if(SET.tab==='env'){const files=[...db.finance,...db.tasks,...Object.values(db.historyEdits)].reduce((n,r)=>n+((r&&r.anexos)||[]).length,0);$('#env-stats').innerHTML=[['Lançamentos',db.finance.length],['Tarefas',db.tasks.length],['Edições na planilha',Object.keys(db.historyEdits).length],['Comprovantes',files],['Registros de auditoria',db.audit.length]].map(x=>\`<div><span>\${x[0]}</span><strong>\${x[1].toLocaleString('pt-BR')}</strong></div>\`).join('');return}const def=SETDEF[SET.tab];let body='',foot='',head='';
if(!SET.edit){head=\`<button type="button" class="btn" data-set-act="edit">\${icon('edit')}Editar</button><button type="button" class="btn primary" data-set-act="edit-add">\${icon('plus')}Adicionar</button>\`;if(SET.tab==='centers'){body=\`<table class="set-table"><thead><tr><th>Código</th><th>Descrição</th><th>Lançamentos</th></tr></thead><tbody>\${COST_CODES.map(k=>{const n=db.finance.filter(r=>r.centro===k).length;return \`<tr><td class="code">\${esc(k)}</td><td class="wrap">\${db.centers[k]?esc(db.centers[k]):'<span class="muted">Sem descrição</span>'}</td><td class="amount">\${n}</td></tr>\`).join('')||'<tr><td colspan="3" class="empty">Nenhum centro cadastrado</td></tr>'}</tbody></table>\`}else{const list=db[def.key]||[];body=list.length?\`<table class="set-table"><thead><tr><th>#</th><th>Nome</th><th>Uso</th></tr></thead><tbody>\${list.map((v,i)=>\`<tr><td class="idx">\${String(i+1).padStart(2,'0')}</td><td><b>\${esc(v)}</b></td><td class="amount">\${def.usage(v)}</td></tr>\`).join('')}</tbody></table>\`:\`<div class="empty">\${icon('list')}<strong>Nenhum item cadastrado</strong><p>Adicione opções para agilizar o preenchimento dos formulários.</p><button type="button" class="btn primary" data-set-act="edit-add" style="margin-top:10px">\${icon('plus')}Adicionar \${def.item}</button></div>\`}}
else{if(SET.tab==='centers'){body=\`<div class="edit-list">\${SET.draft.map((r,i)=>\`<div class="edit-row" style="grid-template-columns:110px minmax(0,1fr) 36px"><input class="control" data-code-i="\${i}" maxlength="24" placeholder="Código" value="\${esc(r.code||'')}"><input class="control" data-desc-i="\${i}" maxlength="180" placeholder="Descrição" value="\${esc(r.desc||'')}"><button type="button" class="icon-btn sm danger" data-set-act="remove" data-i="\${i}" aria-label="Remover" title="Remover">\${icon('trash')}</button></div>\`).join('')}<button type="button" class="add-row" data-set-act="add">\${icon('plus')}Adicionar centro</button></div>\`}else{body=\`<div class="edit-list">\${SET.draft.map((v,i)=>\`<div class="edit-row"><span class="er-idx">\${String(i+1).padStart(2,'0')}</span><input class="control" data-i="\${i}" maxlength="120" placeholder="Nome da \${def.item}" value="\${esc(v)}"><button type="button" class="icon-btn sm danger" data-set-act="remove" data-i="\${i}" aria-label="Remover" title="Remover">\${icon('trash')}</button></div>\`).join('')}<button type="button" class="add-row" data-set-act="add">\${icon('plus')}Adicionar \${def.item}</button></div>\`}foot=\`<div class="set-foot"><span class="dirty-ind" id="dirty-ind">Nenhuma alteração</span><button type="button" class="btn" data-set-act="cancel">Cancelar</button><button type="button" class="btn primary" data-set-act="save" id="set-save" disabled>\${icon('check')}Salvar alterações</button></div>\`;head=\`<span class="pill info">Modo de edição</span>\`}
$('#set-dynamic').innerHTML=\`<div class="set-card"><div class="set-head"><div><h2>\${def.title}</h2><p>\${def.desc}</p></div><div class="actions">\${head}</div></div><div class="set-body">\${body}</div>\${foot}\${SET.edit?'<div class="set-note">Itens vazios e duplicados são ignorados ao salvar. Pressione Enter para adicionar uma nova linha.</div>':''}</div>\`;if(SET.edit)updateDirty()}
`
u = u.slice(0, drawFrom) + newDraw + u.slice(setTabAt)
console.log('ok drawSettings replaced')

// 7) Click handler save/add for centers + companies
mustReplace(
  `else if(a==='add'){SET.draft.push('');drawSettings();focusRow(SET.draft.length-1)}else if(a==='remove'){SET.draft.splice(Number(b.dataset.i),1);drawSettings()}else if(a==='save'){const clean=setClean(SET.draft),def=SETDEF[SET.tab];if(SET.tab==='centers'){db.centers=clean;audit('Centros de custo atualizados','Descrições dos centros M1 a M5 atualizadas')}else{db[def.key]=clean;audit(def.title+' atualizados',clean.length+' opções')}save();SET.edit=false;SET.draft=null;render();toast(def.title+' salvos')}});`,
  "else if(a==='add'){if(SET.tab==='centers'){SET.draft.push({code:'',desc:''});drawSettings();const el=$('.edit-row input[data-code-i=\"'+(SET.draft.length-1)+'\"]');if(el)el.focus()}else{SET.draft.push('');drawSettings();focusRow(SET.draft.length-1)}}else if(a==='remove'){SET.draft.splice(Number(b.dataset.i),1);drawSettings()}else if(a==='save'){const clean=setClean(SET.draft),def=SETDEF[SET.tab];if(SET.tab==='centers'){const map={};for(const r of clean)map[r.code]=r.desc;db.centers=map;refreshCostCodes();audit('Centros de custo atualizados',clean.length+' centros')}else if(SET.tab==='companies'){db.companies=clean;refreshCompanies();audit('Empresas atualizadas',clean.length+' empresas')}else{db[def.key]=clean;audit(def.title+' atualizados',clean.length+' opções')}save();SET.edit=false;SET.draft=null;render();toast(def.title+' salvos')}});".replace(
    /\\"/g,
    '"',
  ),
  'save/add centers companies',
)

// 8) input handler for code/desc
mustReplace(
  "$('#set-dynamic').addEventListener('input',e=>{const t=e.target;if(!SET.edit)return;if(t.dataset.code)SET.draft[t.dataset.code]=t.value;else if(t.dataset.i!=null)SET.draft[Number(t.dataset.i)]=t.value;updateDirty()});",
  `$('#set-dynamic').addEventListener('input',e=>{const t=e.target;if(!SET.edit)return;if(t.dataset.codeI!=null){const i=Number(t.dataset.codeI);SET.draft[i]=SET.draft[i]||{code:'',desc:''};SET.draft[i].code=t.value}else if(t.dataset.descI!=null){const i=Number(t.dataset.descI);SET.draft[i]=SET.draft[i]||{code:'',desc:''};SET.draft[i].desc=t.value}else if(t.dataset.code)SET.draft[t.dataset.code]=t.value;else if(t.dataset.i!=null)SET.draft[Number(t.dataset.i)]=t.value;updateDirty()});`,
  'input centers fields',
)

// 9) Enter key also for centers code/desc rows
mustReplace(
  "$('#set-dynamic').addEventListener('keydown',e=>{const t=e.target;if(e.key==='Enter'&&t.dataset&&t.dataset.i!=null){e.preventDefault();const i=Number(t.dataset.i)+1;SET.draft.splice(i,0,'');drawSettings();focusRow(i)}});",
  "$('#set-dynamic').addEventListener('keydown',e=>{const t=e.target;if(e.key!=='Enter'||!t.dataset)return;if(t.dataset.i!=null){e.preventDefault();const i=Number(t.dataset.i)+1;SET.draft.splice(i,0,'');drawSettings();focusRow(i)}else if(t.dataset.codeI!=null||t.dataset.descI!=null){e.preventDefault();const i=Number(t.dataset.codeI!=null?t.dataset.codeI:t.dataset.descI)+1;SET.draft.splice(i,0,{code:'',desc:''});drawSettings();const el=$('.edit-row input[data-code-i=\"'+i+'\"]');if(el)el.focus()}});".replace(
    /\\"/g,
    '"',
  ),
  'keydown centers',
)

// 10) edit-add for centers pushes object
mustReplace(
  `if(a==='edit'||a==='edit-add'){SET.edit=true;SET.draft=setOriginal();if(a==='edit-add'||(Array.isArray(SET.draft)&&!SET.draft.length))SET.draft.push('');drawSettings();const f=$('#set-dynamic input');if(f)f.focus()}`,
  `if(a==='edit'||a==='edit-add'){SET.edit=true;SET.draft=setOriginal();if(a==='edit-add'||(Array.isArray(SET.draft)&&!SET.draft.length)){if(SET.tab==='centers')SET.draft.push({code:'',desc:''});else SET.draft.push('')}drawSettings();const f=$('#set-dynamic input');if(f)f.focus()}`,
  'edit-add centers object',
)

// 11) applyCloudDb — hydrate companies + refresh
mustReplace(
  "if(payload.centers&&typeof payload.centers==='object')db.centers=payload.centers;db.historyEdits=payload.historyEdits&&typeof payload.historyEdits==='object'?payload.historyEdits:{};",
  "if(payload.centers&&typeof payload.centers==='object')db.centers=payload.centers;if(Array.isArray(payload.companies))db.companies=payload.companies.slice();refreshCostCodes();refreshCompanies();db.historyEdits=payload.historyEdits&&typeof payload.historyEdits==='object'?payload.historyEdits:{};",
  'hydrate companies',
)

// 12) cloudSave snapshot include companies
mustReplace(
  "const snapshot={finance:db.finance,tasks:db.tasks,audit:db.audit,banks:db.banks,templates:db.templates,staff:db.staff,centers:db.centers||{},historyEdits:db.historyEdits||{},prestacao:Array.isArray(monthlyHistory)?monthlyHistory:[]};",
  "const snapshot={finance:db.finance,tasks:db.tasks,audit:db.audit,banks:db.banks,templates:db.templates,staff:db.staff,centers:db.centers||{},companies:db.companies||subdivisions.slice(),historyEdits:db.historyEdits||{},prestacao:Array.isArray(monthlyHistory)?monthlyHistory:[]};",
  'snapshot companies',
)

const packed = JSON.stringify(u).replace(/\//g, '\\/')
if (packed.includes('</script>')) throw new Error('raw </script> leaked')
fs.writeFileSync(htmlPath, html.slice(0, start) + packed + html.slice(end + 1))
console.log('patched ok', htmlPath)
