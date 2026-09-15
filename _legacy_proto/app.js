const people = [];
const operadores = [];
let role = 'admin',
  page = 'dashboard';
const app = document.querySelector('#app');

function login() {
  app.innerHTML = `<section class="login"><div class="loginPanel"><div class="brand">📍 AlimentaAção</div><div class="sub">Cadastro e geolocalização</div><div style="margin-top:42px"><input class="field" id="user" placeholder="Usuário"><input class="field" id="pass" type="password" placeholder="Senha"><select class="field" id="role"><option value="admin">Administrador / Analista</option><option value="operador">Operador</option></select><button class="btn" style="width:100%;margin-top:10px" onclick="enter()">Entrar</button></div></div><div class="loginHero"><img src="assets/referencia-visual.png" alt="Referência visual do sistema"></div></section>`;
}

function enter() {
  role = document.querySelector('#role').value;
  page = 'dashboard';
  render();
}

const navAdmin = [
  ['dashboard', 'Dashboard'],
  ['operadores', 'Operadores'],
  ['cadastros', 'Cadastros'],
  ['mapa', 'Mapa Interativo'],
  ['importar', 'Importar Planilha'],
];
const navOp = [
  ['dashboard', 'Visão geral'],
  ['cadastros', 'Meus Cadastros'],
  ['novo', 'Novo Cadastro'],
  ['importar', 'Importar Planilha'],
];

function render() {
  const nav = role === 'admin' ? navAdmin : navOp;
  const userLabel = role === 'admin' ? 'Administrador' : 'Operador';
  app.innerHTML = `<div class="shell"><aside class="side"><div class="brand">📍 AlimentaAção</div>${nav
    .map((n) => `<button class="nav ${page === n[0] ? 'active' : ''}" onclick="go('${n[0]}')">${n[1]}</button>`)
    .join('')}<button class="nav" onclick="login()">Sair</button></aside><main class="main"><div class="top"><div><button class="mobileMenu btn">☰</button><h1>${title()}</h1><div class="muted">${
    role === 'admin'
      ? 'Visão administrativa e análise dos cadastros'
      : 'Área restrita do operador — somente seus registros'
  }</div></div><div>${userLabel} ▾</div></div>${content()}</main></div>`;
}

function go(p) {
  page = p;
  render();
}

function title() {
  return (
    {
      dashboard: 'Dashboard Geral',
      operadores: 'Operadores',
      cadastros: role === 'admin' ? 'Cadastros' : 'Meus Cadastros',
      mapa: 'Mapa Interativo',
      importar: 'Importar Planilha',
      novo: 'Novo Cadastro',
    }[page] || 'AlimentaAção'
  );
}

function content() {
  if (page === 'dashboard') return dashboard();
  if (page === 'cadastros') return list();
  if (page === 'novo') return form();
  if (page === 'importar') return importer();
  if (page === 'mapa') return mapPage();
  if (page === 'operadores') return operators();
}

function emptyHint(text) {
  return `<p class="muted" style="margin:12px 0 0">${text}</p>`;
}

function dashboard() {
  return `<div class="cards"><div class="card kpi">Total de Cadastros<strong>0</strong></div><div class="card kpi">${
    role === 'admin' ? 'Operadores Ativos' : 'Cadastros hoje'
  }<strong>0</strong></div><div class="card kpi">Zonas Diferentes<strong>0</strong></div><div class="card kpi">Seções Diferentes<strong>0</strong></div></div><div class="grid3"><div class="panel"><h3>${
    role === 'admin' ? 'Cadastros por Operador' : 'Evolução dos meus cadastros'
  }</h3>${emptyHint('Nenhum dado ainda. Os números aparecem conforme os cadastros reais.')}</div><div class="panel"><h3>Distribuição geográfica</h3>${map()}</div></div>`;
}

function map() {
  return `<div class="map"></div>${emptyHint('O mapa fica vazio até existirem cadastros com localização.')}`;
}

function list() {
  const rows =
    people.length === 0
      ? `<tr><td colspan="9" class="muted">Nenhum cadastro. Inclua registros reais pelo formulário ou importação.</td></tr>`
      : people
          .map(
            (p) =>
              `<tr><td>${p.nome}</td><td>${p.cpf}</td><td>${p.tel}</td><td>${p.titulo}</td><td>${p.zona}</td><td>${p.sessao}</td><td>${p.cep}</td><td>${p.op}</td><td class="actions"><button onclick="alert('Editar cadastro')">✏️</button> ${
                role === 'operador' ? `<button onclick="alert('Confirmação de exclusão')">🗑️</button>` : ''
              }</td></tr>`,
          )
          .join('');
  return `<div class="panel"><div class="toolbar"><input class="field" placeholder="Buscar por nome, CPF ou telefone"><select class="field"><option>Todas as zonas</option></select>${
    role === 'operador' ? `<button class="btn" onclick="go('novo')">+ Novo Cadastro</button>` : ''
  }</div><div class="tablewrap"><table><thead><tr><th>Nome completo</th><th>CPF</th><th>Telefone</th><th>Título</th><th>Zona</th><th>Seção</th><th>CEP</th><th>Operador</th><th>Ações</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

function form() {
  const fields = [
    'Nome completo',
    'Nome completo da mãe',
    'CPF',
    'Telefone',
    'Título de eleitor',
    'Zona',
    'Seção',
    'CEP',
  ];
  return `<div class="panel"><div class="formgrid">${fields
    .map((f) => `<label>${f} *<input class="field" placeholder="${f}"></label>`)
    .join(
      '',
    )}</div><div class="notice">Campos começam vazios. Preencha só com dados reais. CPF, CEP, telefone, zona, seção e título passam por validação antes de salvar.</div><div style="margin-top:15px"><button class="btn">Salvar Cadastro</button></div></div>`;
}

function importer() {
  return `<div class="grid2"><div class="panel"><div class="drop"><div style="font-size:48px">📊</div><h3>Arraste e solte sua planilha aqui</h3><p class="muted">Formatos: .xlsx, .xls e .csv</p><button class="btn">Selecionar arquivo</button></div><div class="notice"><b>Cabeçalhos obrigatórios:</b><br>Nome completo | CPF | Telefone | Título | Zona | Seção | Nome da mãe completo | CEP</div></div><div class="panel"><h3>Validação antes da importação</h3><p>O sistema separa registros válidos, duplicados e inválidos antes de confirmar a importação.</p><div class="cards" style="grid-template-columns:repeat(3,1fr)"><div class="card"><b>Válidos</b><strong>—</strong></div><div class="card"><b>Duplicados</b><strong>—</strong></div><div class="card"><b>Inválidos</b><strong>—</strong></div></div></div></div>`;
}

function mapPage() {
  return `<div class="panel"><div class="toolbar"><select class="field"><option>Todos os operadores</option></select><select class="field"><option>Todas as zonas</option></select><select class="field"><option>Todas as seções</option></select></div>${map()}<div class="notice">O mapa exibe distribuição territorial. Dados pessoais sensíveis não aparecem nos marcadores.</div></div>`;
}

function operators() {
  const rows =
    operadores.length === 0
      ? `<tr><td colspan="5" class="muted">Nenhum operador cadastrado ainda.</td></tr>`
      : operadores
          .map(
            (o) =>
              `<tr><td><b>${o[0]}</b></td><td>${o[1]}</td><td>${o[2]}</td><td>${o[3]}</td><td><button class="btn" onclick="alert('Abrir dashboard individual de ${o[0]}')">Analisar</button></td></tr>`,
          )
          .join('');
  return `<div class="panel"><table><thead><tr><th>Operador</th><th>Cadastros</th><th>Zonas</th><th>Última atividade</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

login();
