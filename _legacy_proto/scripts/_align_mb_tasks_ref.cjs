/**
 * _align_mb_tasks_ref.cjs
 *
 * Alinha a UI/lógica das páginas "Demandas e tarefas" e "Minhas tarefas"
 * do embed Assessoria MB (alimentacao-app/public/sistemas/assessoria-mb/index.html)
 * à estrutura do protótipo de referência:
 *   c:\Users\PC\Desktop\BATIMENTO DE COMPRAS\sistema_nerites_demandas_e_tarefas.html
 *
 * Mantém:
 *  - persistência Supabase (titulo/nome/responsavel/prazo/dataExecucao/valor/
 *    origemPagamento/nomeExtrato/situacaoRegistro/observacao/descricao/status/
 *    recorrente/anexos)
 *  - fluxo save()/scheduleCloudSave(), anexos, settings, MB.nome / MB.admin
 *  - páginas financeiras / configurações inalteradas
 *
 * Mudanças (parity):
 *  - Páginas #page-demandas e #page-minhas recebem a MESMA estrutura rica
 *    (heading + view-toggle pills + info-strip + KPIs + filtros + tabela).
 *  - Filtros compartilhados: Situação / Pesquisar (titulo, nome, responsavel,
 *    origemPagamento) / Responsável (todos únicos de staff + owners) / Limpar.
 *  - KPIs clicáveis (quick filters): Total · Valores · Prazo vencido ·
 *    Próximos 7 dias · Sem comprovante. "Valores" é card estático (não filtra).
 *  - "Minhas" filtra por MB.nome (case-insensitive trim), sem hardcode.
 *    Lista ordena atrasadas primeiro, depois prazo ascendente.
 *  - Subtítulo dinâmico "Atividades atribuídas a <MB.nome>, ordenadas
 *    por prioridade e prazo."
 *  - Modal já contempla recorrente checkbox (persistência existente).
 *  - CSS mínima adicionada apenas para .view-toggle.
 */
const fs = require('fs')
const path = require('path')

const htmlPath = path.join(
  __dirname,
  '../../alimentacao-app/public/sistemas/assessoria-mb/index.html',
)

function unpack(html) {
  const marker = '<script type="__bundler/template">'
  const start = html.indexOf(marker)
  if (start < 0) throw new Error('bundler template não encontrado')
  const strStart = start + marker.length
  let end = strStart + 1
  while (end < html.length) {
    if (html[end] === '\\') {
      end += 2
      continue
    }
    if (html[end] === '"') break
    end++
  }
  const inner = JSON.parse(html.slice(strStart, end + 1))
  return { inner, before: html.slice(0, strStart), after: html.slice(end + 1) }
}

function pack({ inner, before, after }) {
  const encoded = JSON.stringify(inner).replace(/\//g, '\\/')
  return before + encoded + after
}

function replaceSection(html, startNeedle, newHtml) {
  const i = html.indexOf(startNeedle)
  if (i < 0) throw new Error('não achei: ' + startNeedle.slice(0, 80))
  const endMarker = '</section>'
  const j = html.indexOf(endMarker, i)
  if (j < 0) throw new Error('não achei </section> para: ' + startNeedle.slice(0, 80))
  const endPos = j + endMarker.length
  return html.slice(0, i) + newHtml + html.slice(endPos)
}

function replaceBetween(html, startNeedle, endNeedle, newBody) {
  const i = html.indexOf(startNeedle)
  if (i < 0) throw new Error('não achei start: ' + startNeedle.slice(0, 80))
  const j = html.indexOf(endNeedle, i + startNeedle.length)
  if (j < 0) throw new Error('não achei end: ' + endNeedle.slice(0, 80))
  return html.slice(0, i) + newBody + html.slice(j)
}

// -----------------------------------------------------------------------------
// Novos blocos HTML das páginas
// -----------------------------------------------------------------------------
const PAGE_DEMANDAS = [
  '<section id="page-demandas" class="page-section" data-screen-label="Demandas e tarefas">',
    '<div class="heading">',
      '<div>',
        '<h1>Demandas e tarefas</h1>',
        '<p>Controle de obrigações operacionais, pagamentos vinculados e comprovação documental.</p>',
      '</div>',
      '<div class="actions">',
        '<div class="view-toggle" role="tablist" aria-label="Alternar visualização de tarefas">',
          '<button type="button" class="active" data-page="demandas" role="tab" aria-selected="true">Todas as demandas</button>',
          '<button type="button" data-page="minhas" role="tab" aria-selected="false">Minhas tarefas</button>',
        '</div>',
        '<button class="btn primary" data-open="task"><svg><use href="#i-plus"></use></svg>Nova tarefa</button>',
      '</div>',
    '</div>',
    '<div class="info-strip">Pagamentos e comprovantes registrados em uma tarefa não geram lançamento financeiro automaticamente.</div>',
    '<div class="kpis" id="task-kpis"></div>',
    '<div class="section panel"><div class="section-head panel-pad"><div><h2>Prazos de tarefas</h2><div class="sub">Atrasadas e com vencimento nos próximos 7 dias</div></div></div><div id="dash-deadlines"></div></div>',
    '<div class="section panel">',
      '<div class="section-head panel-pad"><h2>Tarefas cadastradas</h2><span class="muted" id="task-count"></span></div>',
      '<div class="filters" id="task-filters"></div>',
      '<div class="table-wrap" id="task-table"></div>',
      '<div class="panel-pad" style="border-top:1px solid var(--line)"><button class="section-link" data-goto="tarefas-historico">Ver prestação de contas</button></div>',
    '</div>',
  '</section>',
].join('')

const PAGE_MINHAS = [
  '<section id="page-minhas" class="page-section" data-screen-label="Minhas tarefas">',
    '<div class="heading">',
      '<div>',
        '<h1>Minhas tarefas</h1>',
        '<p id="minhas-subtitle">Atividades atribuídas a você, ordenadas por prioridade e prazo.</p>',
      '</div>',
      '<div class="actions">',
        '<div class="view-toggle" role="tablist" aria-label="Alternar visualização de tarefas">',
          '<button type="button" data-page="demandas" role="tab" aria-selected="false">Todas as demandas</button>',
          '<button type="button" class="active" data-page="minhas" role="tab" aria-selected="true">Minhas tarefas</button>',
        '</div>',
        '<button class="btn primary" data-open="task"><svg><use href="#i-plus"></use></svg>Nova tarefa</button>',
      '</div>',
    '</div>',
    '<div class="info-strip">Pagamentos e comprovantes registrados em uma tarefa não geram lançamento financeiro automaticamente.</div>',
    '<div class="kpis" id="my-task-kpis"></div>',
    '<div class="section panel">',
      '<div class="section-head panel-pad"><h2>Minhas tarefas</h2><span class="muted" id="my-task-count"></span></div>',
      '<div class="filters" id="my-task-filters"></div>',
      '<div class="table-wrap" id="my-task-table"></div>',
    '</div>',
  '</section>',
].join('')

// -----------------------------------------------------------------------------
// Novo JS (taskFiltered, drawTasks, renderTaskFilters)
// -----------------------------------------------------------------------------
const NEW_TASK_FILTERED =
  "function taskFiltered(){return db.tasks.filter(t=>(!state.taskStatus||t.status===state.taskStatus)" +
  "&&(!state.taskMonth||month(t.prazo)===state.taskMonth)" +
  "&&(!state.taskQuery||[t.titulo,t.nome,t.responsavel,t.origemPagamento,t.sub].join(' ').toLowerCase().includes(state.taskQuery.toLowerCase()))" +
  "&&(!state.taskResponsavel||t.responsavel===state.taskResponsavel))}"

// Nova drawTasks + renderTaskFilters.
// Observações:
//  - subtítulo da página "Minhas tarefas" é preenchido com MB.nome (sem hardcode).
//  - Ordenação de #my-task-table: atrasadas primeiro, depois prazo asc.
//  - Rota de "Minhas" aplica os mesmos filtros (status/responsavel/query) usados em "Todas".
//  - KPIs da aba "Minhas" calculam sobre a base de "minhas" (inclusive quick filter dedicado).
//  - Pills .view-toggle refletem a página ativa.
const NEW_DRAW_TASKS = [
  "function renderTaskFilters(){",
  "  const respList=[...new Set([...(db.staff||[]),...db.tasks.map(function(t){return t.responsavel}).filter(Boolean)])].sort(function(a,b){return a.localeCompare(b,'pt-BR')});",
  "  function html(prefix){",
  "    const statusOpts=['Pendente','Em andamento','Concluída'].map(function(s){return `<option value=\"${s}\" ${state.taskStatus===s?'selected':''}>${s}</option>`}).join('');",
  "    const respOpts=respList.map(function(n){return `<option value=\"${esc(n)}\" ${state.taskResponsavel===n?'selected':''}>${esc(n)}</option>`}).join('');",
  "    return `<div class=\"field\"><label for=\"${prefix}-status\">Situação</label><select class=\"control\" id=\"${prefix}-status\"><option value=\"\">Todas</option>${statusOpts}</select></div>`",
  "      +`<div class=\"field\"><label for=\"${prefix}-search\">Pesquisar</label><input class=\"control\" id=\"${prefix}-search\" value=\"${esc(state.taskQuery||'')}\" placeholder=\"Tarefa, favorecido ou responsável\"></div>`",
  "      +`<div class=\"field\"><label for=\"${prefix}-responsavel\">Responsável</label><select class=\"control\" id=\"${prefix}-responsavel\"><option value=\"\">Todos</option>${respOpts}</select></div>`",
  "      +`<div class=\"field\" style=\"align-self:flex-end\"><button type=\"button\" class=\"btn\" id=\"${prefix}-clear\">Limpar</button></div>`;",
  "  }",
  "  function wire(prefix){",
  "    const st=$('#'+prefix+'-status');if(st)st.onchange=function(e){state.taskStatus=e.target.value;drawTasks()};",
  "    const sr=$('#'+prefix+'-search');if(sr)sr.oninput=function(e){state.taskQuery=e.target.value;drawTasks()};",
  "    const rs=$('#'+prefix+'-responsavel');if(rs)rs.onchange=function(e){state.taskResponsavel=e.target.value;drawTasks()};",
  "    const cl=$('#'+prefix+'-clear');if(cl)cl.onclick=function(){state.taskStatus='';state.taskQuery='';state.taskResponsavel='';state.taskQuickFilter='all';state.myQuickFilter='all';drawTasks()};",
  "  }",
  "  const a=$('#task-filters');if(a){a.innerHTML=html('tf');wire('tf')}",
  "  const b=$('#my-task-filters');if(b){b.innerHTML=html('mtf');wire('mtf')}",
  "}",
  "function minhasBaseFiltered(){",
  "  const myName=String(MB.nome||'').trim().toLowerCase();",
  "  return db.tasks.filter(function(t){",
  "    if(!myName)return false;",
  "    if(String(t.responsavel||'').trim().toLowerCase()!==myName)return false;",
  "    if(state.taskStatus&&t.status!==state.taskStatus)return false;",
  "    if(state.taskMonth&&month(t.prazo)!==state.taskMonth)return false;",
  "    if(state.taskResponsavel&&t.responsavel!==state.taskResponsavel)return false;",
  "    if(state.taskQuery){",
  "      const q=state.taskQuery.toLowerCase();",
  "      const hay=[t.titulo,t.nome,t.responsavel,t.origemPagamento,t.sub].join(' ').toLowerCase();",
  "      if(!hay.includes(q))return false;",
  "    }",
  "    return true;",
  "  });",
  "}",
  "function drawTasks(){",
  "  const hoje=taskHoje();",
  "  const baseAll=taskFiltered();",
  "  $('#task-kpis').innerHTML=kpiCardsHTML(baseAll,'task');",
  "  const qfAll=state.taskQuickFilter||'all';",
  "  const rows=baseAll.filter(function(t){return taskQuickPass(t,hoje,qfAll)});",
  "  $('#task-count').textContent=rows.length+' registro'+(rows.length===1?'':'s');",
  "  $('#task-table').innerHTML=`<table><thead><tr><th>Tarefa / Favorecido</th><th>Responsável</th><th>Prazo</th><th>Valor</th><th>Situação</th><th>Anexos</th><th></th></tr></thead><tbody>${rows.map(function(t){return taskRowHTML(t,hoje)}).join('')||noRows('Nenhuma tarefa encontrada. Ajuste os filtros ou cadastre uma nova demanda em “Nova tarefa”.',7)}</tbody></table>`;",
  "  const minhasBase=minhasBaseFiltered();",
  "  $('#my-task-kpis').innerHTML=kpiCardsHTML(minhasBase,'my');",
  "  const qfMy=state.myQuickFilter||'all';",
  "  const myRows=minhasBase.filter(function(t){return taskQuickPass(t,hoje,qfMy)}).sort(function(a,b){",
  "    const la=a.status!=='Concluída'&&a.prazo&&a.prazo<hoje?0:1;",
  "    const lb=b.status!=='Concluída'&&b.prazo&&b.prazo<hoje?0:1;",
  "    if(la!==lb)return la-lb;",
  "    return String(a.prazo||'9999-12-31').localeCompare(String(b.prazo||'9999-12-31'));",
  "  });",
  "  const myCount=$('#my-task-count');if(myCount)myCount.textContent=myRows.length+' registro'+(myRows.length===1?'':'s');",
  "  $('#my-task-table').innerHTML=`<table><thead><tr><th>Tarefa / Favorecido</th><th>Responsável</th><th>Prazo</th><th>Valor</th><th>Situação</th><th>Anexos</th><th></th></tr></thead><tbody>${myRows.map(function(t){return taskRowHTML(t,hoje)}).join('')||noRows('Nenhuma tarefa atribuída a '+esc(MB.nome||'você')+' com os filtros atuais.',7)}</tbody></table>`;",
  "  const sub=$('#minhas-subtitle');if(sub)sub.textContent='Atividades atribuídas a '+(MB.nome||'você')+', ordenadas por prioridade e prazo.';",
  "  document.querySelectorAll('.view-toggle button[data-page]').forEach(function(btn){",
  "    const isActive=btn.dataset.page===page;",
  "    btn.classList.toggle('active',isActive);",
  "    btn.setAttribute('aria-selected',String(isActive));",
  "  });",
  "  renderTaskFilters();",
  "}",
].join('\n')

// Alvo antigo da drawTasks (para substituir a partir de "function drawTasks(){" até antes de "function drawHistory(){")
const OLD_DRAW_TASKS_START = 'function drawTasks(){\n  const hoje=taskHoje();\n'
const DRAW_TASKS_END_ANCHOR = 'function drawHistory(){'

// Alvo antigo da taskFiltered (uma linha)
const OLD_TASK_FILTERED =
  "function taskFiltered(){return db.tasks.filter(t=>(!state.taskStatus||t.status===state.taskStatus)&&(!state.taskMonth||month(t.prazo)===state.taskMonth)&&(!state.taskQuery||[t.titulo,t.responsavel,t.origemPagamento,t.sub].join(' ').toLowerCase().includes(state.taskQuery.toLowerCase()))&&(!state.taskResponsavel||t.responsavel===state.taskResponsavel))}"

// Bloco inline em render() que montava #task-filters: substituir por renderTaskFilters()
const OLD_RENDER_TASK_FILTERS_START = "$('#task-filters').innerHTML=selectField('Situação','tf-status',"
const OLD_RENDER_TASK_FILTERS_END_ANCHOR = "updateCounts();updateBell()}"

// CSS extra para pills do view-toggle
const EXTRA_CSS = [
  '.view-toggle{display:inline-flex;gap:3px;padding:3px;background:#edf0f4;border:1px solid var(--line);border-radius:999px;align-items:center}',
  '.view-toggle button{background:transparent;border:0;padding:5px 12px;font-size:12px;font-weight:500;border-radius:999px;cursor:pointer;color:var(--muted);transition:background .12s,color .12s}',
  '.view-toggle button.active{background:var(--surface);color:var(--text);box-shadow:0 1px 2px rgba(0,0,0,.08);font-weight:600}',
  '.view-toggle button:hover:not(.active){color:var(--text)}',
  '@media(max-width:620px){.view-toggle{width:100%;justify-content:center}.view-toggle button{flex:1}}',
].join('')

const CSS_ANCHOR = '.att-remove:hover{background:var(--neg-soft);color:var(--neg)}</style>'
const CSS_REPLACEMENT = '.att-remove:hover{background:var(--neg-soft);color:var(--neg)}' + EXTRA_CSS + '</style>'

// -----------------------------------------------------------------------------
// Execução
// -----------------------------------------------------------------------------
const raw = fs.readFileSync(htmlPath, 'utf8')
const bundle = unpack(raw)
let u = bundle.inner

// 1) substitui as duas seções de página
u = replaceSection(
  u,
  '<section id="page-demandas" class="page-section" data-screen-label="Demandas e tarefas">',
  PAGE_DEMANDAS,
)
u = replaceSection(
  u,
  '<section id="page-minhas" class="page-section" data-screen-label="Minhas tarefas">',
  PAGE_MINHAS,
)

// 2) substitui taskFiltered
if (!u.includes(OLD_TASK_FILTERED)) {
  // idempotência: se já foi aplicado, precisa estar com a versão nova
  if (!u.includes("[t.titulo,t.nome,t.responsavel,t.origemPagamento,t.sub]")) {
    throw new Error('taskFiltered não encontrado em nenhuma versão conhecida')
  }
} else {
  u = u.replace(OLD_TASK_FILTERED, NEW_TASK_FILTERED)
}

// 3) substitui drawTasks (de function drawTasks(){ até antes de function drawHistory()
if (u.includes('function renderTaskFilters()')) {
  // já aplicado — faz substituição completa do bloco mesmo assim para refletir alterações
  const startNeedle = 'function renderTaskFilters()'
  const i = u.indexOf(startNeedle)
  const j = u.indexOf(DRAW_TASKS_END_ANCHOR, i)
  if (j < 0) throw new Error('não achei drawHistory após renderTaskFilters')
  u = u.slice(0, i) + NEW_DRAW_TASKS + '\n' + u.slice(j)
} else {
  u = replaceBetween(u, OLD_DRAW_TASKS_START, DRAW_TASKS_END_ANCHOR, NEW_DRAW_TASKS + '\n')
}

// 4) substitui bloco inline em render() que montava task-filters.
//    Troca o chamado inline antigo por `renderTaskFilters();` imediatamente antes de updateCounts().
if (u.includes(OLD_RENDER_TASK_FILTERS_START)) {
  const i = u.indexOf(OLD_RENDER_TASK_FILTERS_START)
  const j = u.indexOf(OLD_RENDER_TASK_FILTERS_END_ANCHOR, i)
  if (j < 0) throw new Error('não achei updateCounts anchor')
  u = u.slice(0, i) + 'renderTaskFilters();' + u.slice(j)
}

// 5) injeta CSS extra para .view-toggle (uma única vez)
if (!u.includes('.view-toggle{display:inline-flex')) {
  if (u.indexOf(CSS_ANCHOR) < 0) {
    throw new Error('âncora de CSS não encontrada para injetar .view-toggle')
  }
  u = u.replace(CSS_ANCHOR, CSS_REPLACEMENT)
}

// 6) grava o html empacotado
const packed = pack({ inner: u, before: bundle.before, after: bundle.after })
fs.writeFileSync(htmlPath, packed)

// log resumo
console.log('ok: alignment aplicado')
console.log(' - page-demandas            : substituída')
console.log(' - page-minhas              : substituída')
console.log(' - taskFiltered             : aceita t.nome em busca')
console.log(' - drawTasks + render filters: filtros compartilhados tf/mtf')
console.log(' - CSS .view-toggle         : injetada')
console.log(' - bytes html finais        :', packed.length)
