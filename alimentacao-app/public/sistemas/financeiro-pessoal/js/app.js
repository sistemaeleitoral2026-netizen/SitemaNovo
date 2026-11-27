/* Matheus do Beiju — controle financeiro
   Todos os números da tela são calculados a partir dos lançamentos
   e das verificações diárias de saldo dos investimentos. */
(() => {
  'use strict';

  const STORAGE_KEY = 'meu-financeiro:v2';
  const OLD_KEY = 'meu-financeiro:v1';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  const CATEGORIES = {
    expense: ['Moradia', 'Alimentação', 'Transporte', 'Saúde', 'Lazer', 'Compras', 'Contas da casa', 'Outros'],
    income: ['Salário', 'Renda extra', 'Rendimentos', 'Outros'],
  };
  const CAT_ICON = {
    'Moradia': 'cat-house', 'Alimentação': 'cat-fork-knife', 'Transporte': 'cat-car', 'Saúde': 'cat-heartbeat',
    'Lazer': 'cat-game-controller', 'Compras': 'cat-shopping-bag', 'Contas da casa': 'cat-receipt', 'Outros': 'cat-dots-three-outline',
    'Salário': 'cat-briefcase', 'Renda extra': 'cat-hand-coins', 'Rendimentos': 'cat-trend-up',
    'Recebimentos': 'cat-coins', 'Demais categorias': 'cat-squares-four',
  };
  const TITLES = {
    overview: 'Visão Geral', transactions: 'Movimentações',
    pagamentos: 'Pagamentos', cobrancas: 'Cobranças', documentacao: 'Documentação',
    accounts: 'Contas', investments: 'Investimentos', reports: 'Relatórios', audit: 'Auditoria',
  };
  const SUBTITLES = {
    overview: 'Resumo financeiro, compromissos e <span class="sub-x">situação do seu </span>patrimônio',
    transactions: 'Tudo o que entrou e saiu no mês',
    pagamentos: 'Contas a pagar e o que já foi pago', cobrancas: 'Valores a receber e o que já entrou',
    documentacao: 'Documentos e prazos a cumprir',
    accounts: 'Saldos das contas e carteiras', investments: 'Aplicações e evolução do patrimônio',
    reports: 'Resumo por período e por categoria',
    audit: 'Quem lançou, alterou ou excluiu cada registro',
  };
  const KIND_LABEL = { pagamento: 'Pagamento', documentacao: 'Documentação', cobranca: 'Cobrança' };
  const taskKind = t => (t && (t.kind === 'documentacao' || t.kind === 'cobranca') ? t.kind : 'pagamento');
  // Menu → tipo de programação. As três telas usam a mesma seção (#view-tasks) e os mesmos dados.
  const TASK_VIEWS = { pagamentos: 'pagamento', cobrancas: 'cobranca', documentacao: 'documentacao' };
  const VIEW_OF_KIND = { pagamento: 'pagamentos', cobranca: 'cobrancas', documentacao: 'documentacao' };
  const NEW_LABEL = { pagamento: 'Novo pagamento', cobranca: 'Nova cobrança', documentacao: 'Nova pendência' };
  const TASK_TABS = {
    pagamento: [['open', 'A fazer'], ['done', 'Concluídos'], ['rec', 'Recorrentes'], ['once', 'Avulsos']],
    cobranca: [['open', 'A receber'], ['done', 'Concluídas'], ['rec', 'Recorrentes'], ['once', 'Avulsas']],
    documentacao: [['pend', 'Pendentes'], ['late', 'Atrasadas'], ['done', 'Concluídas'], ['all', 'Todas']],
  };
  const PERSON_COL = { pagamento: 'Quem recebe', cobranca: 'Quem paga', documentacao: 'Responsável' };

  /* ---------- Formatação ---------- */
  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const finiteMoney = n => Number.isFinite(Number(n)) ? Number(n) : 0;
  const money = n => brl.format(finiteMoney(n));
  const signed = n => (finiteMoney(n) >= 0 ? '+ ' : '− ') + brl.format(Math.abs(finiteMoney(n)));

  /* Campos de valor: máscara brasileira enquanto digita (1.234,56) */
  const fmtMoneyInput = n => (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const parseMoney = el => {
    const v = (el?.value || '').trim();
    const d = v.replace(/\D/g, '');
    if (!d) return NaN;
    return (v.includes('-') ? -1 : 1) * Number(d) / 100;
  };
  const moneyVal = sel => parseMoney(document.querySelector(sel));
  const setMoney = (sel, n) => {
    const el = typeof sel === 'string' ? document.querySelector(sel) : sel;
    el.value = n == null || n === '' || Number.isNaN(Number(n)) ? '' : fmtMoneyInput(Number(n));
  };
  document.addEventListener('input', e => {
    const el = e.target;
    if (!el.matches || !el.matches('[data-money]')) return;
    const neg = el.hasAttribute('data-negative') && el.value.includes('-');
    const d = el.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 13);
    if (!d || /^0+$/.test(d)) { el.value = neg ? '-' : (d ? '0,00' : ''); return; }
    el.value = (neg ? '-' : '') + (Number(d) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  });
  const pct = n => (n * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + '%';
  const pct2 = n => (n * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
  const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const MONTHS_FULL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const ym = d => d.slice(0, 7);
  const monthLabel = k => { const [y, m] = k.split('-'); return `${MONTHS_FULL[+m - 1]} ${y}`; };
  const shortDate = d => { const [, m, day] = d.split('-'); return `${+day} ${MONTHS[+m - 1]}`; };
  const fullDate = d => { const [y, m, day] = d.split('-'); return `${day}/${m}/${y}`; };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (name, cls = '') => `<svg class="i ${cls}"><use href="#i-${name}"/></svg>`;
  // Ids em formato UUID (o banco usa uuid)
  const uid = () => (window.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  const localNow = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString(); };
  const todayISO = () => localNow().slice(0, 10);
  const nowTime = () => localNow().slice(11, 16);
  const kAxis = v => (v ? (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil' : '0');

  /* ---------- Dados de exemplo ---------- */
  function seed() {
    const accounts = [
      { id: 'nu', name: 'Nubank', type: 'Conta digital', initial: 0 },
      { id: 'itau', name: 'Itaú', type: 'Conta corrente', initial: 0 },
      { id: 'bb', name: 'Banco do Brasil', type: 'Poupança', initial: 0 },
    ];
    const t = (date, description, category, kind, amount, account) => ({ id: uid(), date, description, category, kind, amount, account });
    const txs = [];
    const hist = [
      ['06', 4800, 0, 2310.4], ['07', 4800, 900, 2675.2], ['08', 4800, 450, 2490.8],
      ['09', 5000, 1600, 2988.1], ['10', 5000, 680, 2840.3],
    ];
    hist.forEach(([m, sal, extra, out]) => {
      const d = `2026-${m}`;
      const food = +(out * 0.28).toFixed(2), fuel = +(out * 0.12).toFixed(2);
      txs.push(t(`${d}-05`, 'Salário', 'Salário', 'income', sal, 'itau'));
      if (extra) txs.push(t(`${d}-18`, 'Projeto freelance', 'Renda extra', 'income', extra, 'nu'));
      txs.push(t(`${d}-10`, 'Aluguel', 'Moradia', 'expense', 1200, 'bb'));
      txs.push(t(`${d}-12`, 'Supermercado', 'Alimentação', 'expense', food, 'nu'));
      txs.push(t(`${d}-15`, 'Combustível', 'Transporte', 'expense', fuel, 'nu'));
      txs.push(t(`${d}-20`, 'Energia e internet', 'Contas da casa', 'expense', +(out - 1200 - food - fuel).toFixed(2), 'itau'));
    });
    txs.push(
      t('2026-11-20', 'Salário', 'Salário', 'income', 5000, 'itau'),
      t('2026-11-17', 'Projeto freelance', 'Renda extra', 'income', 1250, 'nu'),
      t('2026-11-10', 'Aluguel', 'Moradia', 'expense', 1200, 'bb'),
      t('2026-11-19', 'Mercado', 'Alimentação', 'expense', 420.5, 'nu'),
      t('2026-11-08', 'Supermercado', 'Alimentação', 'expense', 380, 'nu'),
      t('2026-11-21', 'Restaurante', 'Alimentação', 'expense', 98.5, 'nu'),
      t('2026-11-12', 'Combustível', 'Transporte', 'expense', 350, 'nu'),
      t('2026-11-14', 'Transporte por app', 'Transporte', 'expense', 72, 'nu'),
      t('2026-11-11', 'Energia elétrica', 'Contas da casa', 'expense', 186.9, 'itau'),
      t('2026-11-11', 'Internet', 'Contas da casa', 'expense', 119.9, 'itau'),
      t('2026-11-06', 'Farmácia', 'Saúde', 'expense', 142.6, 'nu'),
      t('2026-11-03', 'Academia', 'Saúde', 'expense', 120, 'itau'),
      t('2026-11-15', 'Cinema', 'Lazer', 'expense', 90, 'nu'),
    );
    // Saldo inicial de cada conta em 01/06/2026 (antes do primeiro lançamento de exemplo)
    const initial = { nu: 4000, itau: 1500, bb: 9000 };
    accounts.forEach(a => { a.initial = initial[a.id]; });
    // Saldo que a conta teria num momento (para as conferências de exemplo baterem)
    const saldoEm = (accId, stamp) => +(initial[accId] + txs
      .filter(x => x.account === accId && `${x.date}T${x.time || '00:00'}` <= stamp)
      .reduce((s, x) => s + (x.kind === 'income' ? x.amount : -x.amount), 0)).toFixed(2);

    const investments = [
      { id: 'res', name: 'Reserva de emergência', type: 'Poupança', institution: 'Banco do Brasil', account: 'bb' },
      { id: 'cdb', name: 'CDB liquidez diária', type: 'CDB', institution: 'Nubank', account: 'nu' },
      { id: 'selic', name: 'Tesouro Selic 2029', type: 'Tesouro Direto', institution: 'Itaú', account: 'itau' },
    ];
    // Verificações diárias de 10 a 23/11 (dias úteis), com o saldo final do layout original
    const days = ['10', '11', '12', '13', '14', '17', '18', '19', '20', '21', '23'];
    const times = ['09:12', '09:40', '08:55', '10:05', '09:20', '09:31', '08:47', '09:58', '09:15', '10:22', '09:08'];
    const snapshots = [];
    days.forEach((d, i) => {
      const back = days.length - 1 - i;
      snapshots.push({ id: uid(), invId: 'res', date: `2026-11-${d}`, time: times[i], balance: +(5000 - back * 1.35).toFixed(2), by: 'Responsável' });
      snapshots.push({ id: uid(), invId: 'cdb', date: `2026-11-${d}`, time: times[i], balance: +(3500 - back * 1.62 + (i === 6 ? -2.1 : 0)).toFixed(2), by: 'Responsável' });
      snapshots.push({ id: uid(), invId: 'selic', date: `2026-11-${d}`, time: times[i], balance: +(2150 - back * 0.98).toFixed(2), by: 'Responsável' });
    });
    // Programações de exemplo
    const now = new Date().toISOString();
    const base = { kind: 'pagamento', paused: false, end: null, createdBy: 'Admin', createdByName: 'Admin', createdAt: now };
    const tasks = [
      { ...base, id: 'tk-netflix', title: 'Netflix', payee: 'Netflix', payeeKind: 'empresa', category: 'Lazer', expected: 55.9, account: 'nu',
        rec: { type: 'monthly', every: 1, dayFrom: 10, dayTo: 15 }, start: '2026-11', notes: 'Cobrança no cartão Nubank. Conferir se o valor da assinatura mudou.' },
      { ...base, id: 'tk-aluguel', title: 'Aluguel', payee: 'Proprietário do imóvel', payeeKind: 'pessoa', category: 'Moradia', expected: 1200, account: 'bb',
        rec: { type: 'monthly', every: 1, dayFrom: 5, dayTo: 10 }, start: '2026-06', notes: 'Pix para a chave do proprietário. Pedir recibo assinado.' },
      { ...base, id: 'tk-energia', title: 'Energia elétrica', payee: 'Companhia de energia', payeeKind: 'empresa', category: 'Contas da casa', expected: null, account: 'itau',
        rec: { type: 'monthly', every: 1, dayFrom: 8, dayTo: 12 }, start: '2026-11', notes: 'Valor muda todo mês: conferir na fatura.' },
      { ...base, id: 'tk-internet', title: 'Internet', payee: 'Provedor de internet', payeeKind: 'empresa', category: 'Contas da casa', expected: 119.9, account: 'itau',
        rec: { type: 'monthly', every: 1, dayFrom: 11, dayTo: 11 }, start: '2026-11', notes: '' },
      { ...base, id: 'tk-ipva', title: 'IPVA', payee: 'Detran', payeeKind: 'empresa', category: 'Transporte', expected: 980, account: 'itau',
        rec: { type: 'yearly', every: 12, month: 1, dayFrom: 10, dayTo: 20 }, start: '2027-01', notes: 'Cota única com desconto até o dia 20.' },
      { ...base, id: 'tk-revisao', title: 'Revisão do carro', payee: 'Oficina mecânica', payeeKind: 'empresa', category: 'Transporte', expected: 450, account: 'nu',
        rec: { type: 'once', dateFrom: '2026-11-24', dateTo: '2026-11-30' }, start: '2026-11', notes: 'Revisão dos 30 mil km.' },
      { ...base, kind: 'documentacao', id: 'tk-docs', title: 'Resolver documentação', payee: '', payeeKind: 'empresa', category: 'Outros', expected: null, account: null, docOwner: 'Responsável', chargeTo: '',
        rec: { type: 'once', dateFrom: '2026-12-01', dateTo: '2026-12-15' }, start: '2026-12', notes: 'Separar RG, CPF e comprovante de residência.' },
      { ...base, kind: 'cobranca', id: 'tk-cob', title: 'Resolver cobrança', payee: '', payeeKind: 'pessoa', category: 'Outros', expected: 350, account: 'nu', chargeTo: 'Cliente exemplo', docOwner: '',
        rec: { type: 'once', dateFrom: '2026-12-01', dateTo: '2026-12-10' }, start: '2026-12', notes: 'Cobrar o serviço prestado em novembro.' },
    ];
    const taskDone = [];
    const link = (taskId, description, date, time, payee) => {
      const tx = txs.find(x => x.description === description && x.date === date);
      if (!tx) return;
      Object.assign(tx, { taskId, period: ym(date), payee, time, by: 'Responsável' });
      taskDone.push({ id: uid(), taskId, period: ym(date), status: 'paga', txId: tx.id, amount: tx.amount, account: tx.account, date, time, by: 'Responsável', payee, receiptId: null, note: '' });
    };
    ['06', '07', '08', '09', '10', '11'].forEach((m, i) => link('tk-aluguel', 'Aluguel', `2026-${m}-10`, `${String(9 + (i % 3)).padStart(2, '0')}:1${i}`, 'Proprietário do imóvel'));
    link('tk-energia', 'Energia elétrica', '2026-11-11', '09:40', 'Companhia de energia');
    link('tk-internet', 'Internet', '2026-11-11', '09:42', 'Provedor de internet');
    const accChecks = [
      { id: uid(), accId: 'nu', date: '2026-11-22', time: '18:00', balance: saldoEm('nu', '2026-11-22T18:00'), by: 'Responsável' },
      { id: uid(), accId: 'itau', date: '2026-11-21', time: '18:05', balance: saldoEm('itau', '2026-11-21T18:05'), by: 'Responsável' },
      { id: uid(), accId: 'bb', date: '2026-11-20', time: '17:40', balance: saldoEm('bb', '2026-11-20T17:40'), by: 'Responsável' },
    ];
    return { accounts, txs, investments, snapshots, goal: 15000, people: ['Responsável'], tasks, taskDone, payees: [], accChecks };
  }

  /* Converte dados salvos pela versão anterior (aplicações com valor fixo) */
  function migrate(old) {
    const s = { ...old, snapshots: [], people: [] };
    s.investments = (old.investments || []).map(i => {
      s.snapshots.push({ id: uid(), invId: i.id, date: todayISO(), time: nowTime(), balance: i.amount || 0, by: '—' });
      return { id: i.id, name: i.name, type: i.type, institution: i.institution };
    });
    return s;
  }

  /* ---------- Estado ---------- */
  // Permissão: dentro do sistema, o React informa o usuário (mensagem fp-user). Admin e Editor
  // podem fazer tudo (isAdmin); só o Admin vê a Auditoria (canAudit). Aberto direto, é admin.
  const embedded = window.parent !== window;
  // Modo banco: aberto pelo sistema com ?remote=1 → dados nas tabelas fp_* (via página React).
  // Fora disso (arquivo aberto direto), continua no localStorage com dados de exemplo.
  const REMOTE = embedded && new URLSearchParams(location.search).has('remote');
  let isAdmin = !embedded;
  let canAudit = false;
  let userName = '';
  let userId = '';

  const emptyState = () => ({ accounts: [], txs: [], investments: [], snapshots: [], goal: 15000, people: [], tasks: [], taskDone: [], payees: [], accChecks: [] });
  let state;
  if (REMOTE) state = emptyState();
  else {
    try {
      state = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!state) { const old = JSON.parse(localStorage.getItem(OLD_KEY)); state = old ? migrate(old) : seed(); }
    } catch { state = seed(); }
  }
  state.snapshots ||= []; state.people ||= [];
  state.tasks ||= []; state.taskDone ||= []; state.payees ||= []; state.accChecks ||= [];

  // Salvar: no modo banco, manda o estado para a página React gravar (com pequena espera
  // para juntar alterações seguidas); fora dele, grava no localStorage.
  let dirty = false, persistTimer = null, persistSeq = 0;
  const persistWaiters = new Map();
  const syncStatus = (txt, cls = '') => {
    const el = document.getElementById('syncStatus');
    if (el) { el.textContent = txt; el.className = 'sync-status ' + cls; }
  };
  const persistPayload = () => {
    const { accounts, accChecks, txs, tasks, taskDone, investments, snapshots, goal } = state;
    return JSON.parse(JSON.stringify({ accounts, accChecks, txs, tasks, taskDone, investments, snapshots, goal }));
  };
  const sendPersist = () => {
    const requestId = String(++persistSeq);
    window.parent.postMessage({ type: 'fp-persist', requestId, payload: persistPayload() }, location.origin);
    return requestId;
  };
  const save = () => {
    if (!REMOTE) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { alert('Não foi possível salvar neste navegador (armazenamento cheio ou bloqueado).'); }
      return;
    }
    dirty = true;
    syncStatus('Salvando…', 'saving');
    clearTimeout(persistTimer);
    persistTimer = setTimeout(sendPersist, 250);
  };
  const saveConfirmed = () => {
    if (!REMOTE) { save(); return Promise.resolve(); }
    dirty = true;
    syncStatus('Salvando…', 'saving');
    clearTimeout(persistTimer);
    const requestId = sendPersist();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        persistWaiters.delete(requestId);
        reject(new Error('O banco demorou para responder. Confira sua conexão e tente novamente.'));
      }, 120000);
      persistWaiters.set(requestId, { resolve, reject, timer });
    });
  };
  // Admin e Editor operam igual; canAudit é o único privilégio exclusivo do Admin.
  const canOperate = () => !REMOTE || isAdmin;
  const canDeleteOwned = item => canOperate() || (!!userId && item?.createdBy === userId);
  const canDelete = () => canOperate();
  const stamp_ = () => (REMOTE && userId ? { createdBy: userId } : {});

  let period = null;
  let view = 'overview';
  let taskView = 'pagamento'; // tipo mostrado na tela de compromissos
  const taskTabs = { pagamento: 'open', cobranca: 'open', documentacao: 'pend' }; // aba escolhida por tipo
  let taskTab = 'open';
  let taskPage = 1;
  const TASK_PAGE = 8;
  let movPage = 1;
  const MOV_PAGE = 10;
  let taskSort = { key: null, dir: 1 };
  let reportTab = 'pagamentos';
  let chartMode = 'line';
  try { chartMode = localStorage.getItem('mf:chart') || 'line'; } catch { /* */ }

  const accName = id => state.accounts.find(a => a.id === id)?.name ?? '—';
  const invName = id => state.investments.find(a => a.id === id)?.name ?? '—';
  const invAccName = i => (i && state.accounts.find(a => a.id === i.account)?.name) || i?.institution || 'Sem conta';
  const value = x => (x.kind === 'income' ? x.amount : -x.amount);
  const sum = (list, kind) => list.filter(x => !kind || x.kind === kind).reduce((s, x) => s + (kind ? x.amount : value(x)), 0);
  const inMonth = k => state.txs.filter(x => ym(x.date) === k);
  const upTo = k => state.txs.filter(x => ym(x.date) <= k);
  /* Saldo da conta: parte do último saldo informado (conferência) até o limite
     e soma os lançamentos feitos depois dele. Sem conferência, parte do saldo inicial. */
  const txStamp = x => `${x.date}T${x.time || '00:00'}`;
  const chkStamp = c => `${c.date}T${c.time}`;
  function balanceAt(a, limit, excludeId) {
    let last = null;
    for (const c of state.accChecks) {
      if (c.accId !== a.id || c.id === excludeId || chkStamp(c) > limit) continue;
      if (!last || chkStamp(c) > chkStamp(last)) last = c;
    }
    const from = last ? chkStamp(last) : '';
    let b = last ? last.balance : a.initial;
    for (const x of state.txs) {
      if (x.account !== a.id) continue;
      const st = txStamp(x);
      if (st > from && st <= limit) b += value(x);
    }
    return Math.round(b * 100) / 100;
  }
  // Usa o mesmo fechamento mensal na Visão Geral, em Contas e nos relatórios.
  const accBalance = (a, k) => balanceAt(a, `${k}-31T23:59`);
  const checksOf = id => state.accChecks.filter(c => c.accId === id).sort((a, b) => chkStamp(a).localeCompare(chkStamp(b)));
  const checkDiff = c => { const a = state.accounts.find(x => x.id === c.accId); return a ? Math.round((c.balance - balanceAt(a, chkStamp(c), c.id)) * 100) / 100 : 0; };
  const totalBalance = k => state.accounts.reduce((s, a) => s + accBalance(a, k), 0);
  const prevMonth = k => { let [y, m] = k.split('-').map(Number); m -= 1; if (!m) { m = 12; y -= 1; } return `${y}-${String(m).padStart(2, '0')}`; };
  const byDateDesc = (a, b) => txStamp(b).localeCompare(txStamp(a));

  /* Investimentos: o valor atual é o último saldo verificado */
  const stamp = s => `${s.date}T${s.time}`;
  const snapsOf = id => state.snapshots.filter(s => s.invId === id).sort((a, b) => stamp(a).localeCompare(stamp(b)));
  const latest = id => snapsOf(id).at(-1);
  const invValue = id => latest(id)?.balance ?? 0;
  const invTotal = () => state.investments.reduce((s, i) => s + invValue(i.id), 0);
  const prevSnap = s => { const l = snapsOf(s.invId); const i = l.findIndex(x => x.id === s.id); return i > 0 ? l[i - 1] : null; };
  function snapshotResult(cur, before) {
    if (!cur || !before) return null;
    const difference = Math.round((cur.balance - before.balance) * 100) / 100;
    const percent = before.balance ? difference / before.balance : null;
    const days = Math.max(0, daysBetween(before.date, cur.date));
    const daily = days > 0 ? Math.round((difference / days) * 100) / 100 : null;
    return { difference, percent, days, daily };
  }
  function snapshotBefore(invId, date, time) {
    const target = `${date || '9999-12-31'}T${time || '23:59'}`;
    return snapsOf(invId).filter(s => stamp(s) < target).at(-1) || null;
  }
  const resultClass = n => n > 0 ? 'delta-pos' : n < 0 ? 'delta-neg' : 't-muted';
  const resultMoney = n => `<span class="num ${resultClass(n)}">${signed(n)}</span>`;
  function dailyResultLabel(result) {
    if (!result) return '<span class="t-muted">—</span>';
    if (!result.days) return '<span class="t-muted">mesmo dia</span>';
    return `${resultMoney(result.daily)}<small>${result.days === 1 ? 'em 1 dia' : `média simples · ${result.days} dias`}</small>`;
  }
  const lastCheck = () => state.snapshots.slice().sort((a, b) => stamp(b).localeCompare(stamp(a)))[0];

  function months() {
    const set = new Set(state.txs.map(x => ym(x.date)));
    const now = currentMonth();
    set.add(now);
    set.add(addMonths(now, 1));
    for (let i = 0; i <= 12; i++) {
      const k = addMonths(now, i);
      if (state.tasks.some(t => occursIn(t, k))) set.add(k);
    }
    return [...set].sort().reverse();
  }

  /* ---------- Componentes ---------- */
  function txProofCell(x) {
    if (!x.receiptId) return '<span class="mov-no-proof">—</span>';
    return `<button type="button" class="mov-proof-thumb" data-receipt="${esc(x.receiptId)}" data-rtx="${esc(x.id)}" title="Abrir comprovante" aria-label="Abrir comprovante">
      <span class="mov-proof-frame" data-receipt-thumb="${esc(x.receiptId)}">${icon('file-text', 'i-sm')}</span>
      <span class="mov-proof-caption">Ver</span>
    </button>`;
  }

  /** Carrega miniaturas dos comprovantes depois de montar a tabela. */
  async function hydrateReceiptPreviews(root = document) {
    const nodes = [...(root.querySelectorAll?.('[data-receipt-thumb]') || [])];
    await Promise.all(nodes.map(async el => {
      const id = el.dataset.receiptThumb;
      if (!id || el.dataset.ready === '1') return;
      try {
        const rec = await FPComprovantes.get(id);
        const url = await FPComprovantes.url(id);
        if (!url) return;
        el.dataset.ready = '1';
        if ((rec?.type || '').startsWith('image/')) {
          el.innerHTML = `<img src="${url}" alt="Prévia do comprovante">`;
        } else {
          el.innerHTML = `<span class="mov-proof-pdf">PDF</span>`;
          el.style.backgroundImage = '';
        }
      } catch { /* sem arquivo neste aparelho */ }
    }));
  }

  function txRow(x, withDelete) {
    const inc = x.kind === 'income';
    const t = x.taskId ? taskById(x.taskId) : null;
    const cob = t && taskKind(t) === 'cobranca';
    const origin = x.taskId ? (inc || cob ? 'Cobrança' : 'Pagamento') : 'Avulso';
    const sit = inc ? 'Recebido' : 'Pago';
    const acc = x.account && accName(x.account) !== '—' ? esc(accName(x.account)) : '—';
    const metas = [];
    if (x.payee) metas.push(`${inc ? 'De' : 'Para'}: ${esc(x.payee)}`);
    if (x.by) metas.push(`Por: ${esc(x.by)}`);
    const canEditTx = !x.taskId && canDeleteOwned(x);
    const actions = `<div class="mov-action-set">
      <button type="button" class="icon-btn mov-view-btn" data-view-tx="${x.id}" title="Ver detalhes" aria-label="Ver detalhes">${icon('eye', 'i-sm')}</button>
      ${canEditTx ? `<button type="button" class="icon-btn mov-edit-btn" data-edit-tx="${x.id}" title="Editar lançamento" aria-label="Editar lançamento">${icon('pencil-line', 'i-sm')}</button>` : ''}
      ${withDelete && canDelete(x) ? `<button type="button" class="icon-btn mov-del-btn" data-del-tx="${x.id}" title="Excluir lançamento" aria-label="Excluir lançamento">${icon('trash-2', 'i-sm')}</button>` : ''}
    </div>`;
    return `<tr class="mov-row ${inc ? 'is-income' : 'is-expense'}">
      <td class="num mov-date">${sheetDate(x.date)}${x.time ? `<small>${esc(x.time)}</small>` : ''}</td>
      <td class="sheet-desc">
        <span class="sheet-desc-in">${esc(x.description)}</span>
        ${metas.map(m => `<small class="tx-meta">${m}</small>`).join('')}
      </td>
      <td class="col-cat">${esc(x.category || 'Outros')}</td>
      <td class="col-acc">${acc}</td>
      <td class="col-orig">${origin}</td>
      <td class="mov-status">${sit}</td>
      <td class="t-right num mov-value ${inc ? 'delta-pos' : 'delta-neg'}">${signed(value(x))}</td>
      <td class="col-proof mov-proof-cell">${txProofCell(x)}</td>
      <td class="col-act mov-actions">${actions}</td>
    </tr>`;
  }

  /**
   * Pagamentos e cobranças agendados (ainda sem baixa) nos meses dados, no formato de lançamento.
   * O que já teve baixa vira lançamento real (com taskId), então não entra aqui — sem duplicar.
   */
  function scheduledEntries(monthKeys) {
    const out = [];
    monthKeys.forEach(k => occurrencesIn(k).forEach(o => {
      const t = o.task, kind = taskKind(t);
      if (kind === 'documentacao' || o.done) return;
      const amount = t.expected ?? lastPaidAmount(t.id) ?? 0;
      out.push({
        id: `sched:${o.key}`,
        scheduled: true,
        status: o.status,
        taskId: t.id,
        description: t.title || (kind === 'cobranca' ? 'Cobrança' : 'Pagamento'),
        category: kind === 'cobranca' ? (t.category && t.category !== 'Outros' ? t.category : 'Recebimentos') : (t.category || 'Outros'),
        account: t.account,
        date: o.to,
        kind: kind === 'cobranca' ? 'income' : 'expense',
        amount,
        variable: t.expected == null,
      });
    }));
    return out;
  }

  /** Documentação (pendente nos meses pedidos e concluída no mês da tela) para "Últimos lançamentos". */
  function docEntries(monthKeys, k) {
    const out = [];
    monthKeys.forEach(m => occurrencesIn(m).forEach(o => {
      if (taskKind(o.task) !== 'documentacao' || o.done) return;
      out.push({ id: `doc:${o.key}`, doc: true, status: o.status, taskId: o.task.id, description: o.task.title || 'Documentação', category: 'Documentação', account: null, date: o.to, kind: 'doc', amount: 0 });
    }));
    state.taskDone.filter(d => d.status === 'concluida' && d.date && ym(d.date) === k).forEach(d => {
      const t = taskById(d.taskId);
      if (!t || taskKind(t) !== 'documentacao') return;
      out.push({ id: `docok:${d.id}`, doc: true, done: true, status: 'concluida', taskId: t.id, description: t.title || 'Documentação', category: 'Documentação', account: null, date: d.date, time: d.time, kind: 'doc', amount: 0 });
    });
    return out;
  }

  /** dd/mm/aaaa; o ano some no celular (classe .yr). */
  const sheetDate = d => { const [y, m, day] = d.split('-'); return `${day}/${m}<span class="yr">/${y}</span>`; };

  /** Quadro "Resumo em números" da visão geral (substitui o gráfico). */
  function renderNumbers(k, list, sched, next, overdue = []) {
    const box = $('#ovMonths');
    if (!box) return;
    const tot = l => l.reduce((s, x) => s + (x.amount || 0), 0);
    const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
    const semValor = l => { const n = l.filter(x => !x.amount).length; return n ? ` · ${n} sem valor definido` : ''; };
    const mes = m => MONTHS_FULL[+m.slice(5) - 1];

    const card = (m, tipo, extra) => {
      const doMes = sched.filter(x => ym(x.date) === m);
      const dividas = [...(tipo === 'atual' ? overdue.filter(x => x.kind === 'expense') : []), ...doMes.filter(x => x.kind === 'expense')];
      const receber = [...(tipo === 'atual' ? overdue.filter(x => x.kind === 'income') : []), ...doMes.filter(x => x.kind === 'income')];
      const atrasadas = dividas.filter(x => x.status === 'atrasada').length;
      const saldo = tot(receber) - tot(dividas);
      return `<div class="ov-month ${tipo === 'atual' ? 'is-current' : 'is-next'}">
        <div class="ov-month-head">
          <span class="ov-mh-title">${icon('ph-calendar-blank')}<span>${tipo === 'atual' ? 'Este mês' : 'Próximo mês'} <em>—</em> ${mes(m)}</span></span>
          <button class="link" data-go="pagamentos">Ver contas${icon('ph-arrow-right', 'i-sm')}</button>
        </div>
        <div class="ov-line is-debt ${tot(dividas) ? '' : 'is-zero'}">
          <span class="ov-line-ico">${icon('ph-receipt')}</span>
          <div class="ov-line-main"><div class="ov-line-label">${tipo === 'atual' ? 'Dívidas deste mês' : `Dívidas para ${mes(m).toLowerCase()}`}</div>
            <div class="ov-line-sub">${dividas.length ? plural(dividas.length, 'conta a pagar', 'contas a pagar') : 'nenhuma conta'}${semValor(dividas)}${atrasadas ? ` · <b>${plural(atrasadas, 'atrasada', 'atrasadas')}</b>` : ''}</div></div>
          <div class="ov-line-val num">${money(tot(dividas))}</div>
        </div>
        <div class="ov-line is-get ${tot(receber) ? '' : 'is-zero'}">
          <span class="ov-line-ico">${icon('ph-hand-coins')}</span>
          <div class="ov-line-main"><div class="ov-line-label">${tipo === 'atual' ? 'A receber este mês' : `A receber em ${mes(m).toLowerCase()}`}</div>
            <div class="ov-line-sub">${receber.length ? plural(receber.length, 'cobrança', 'cobranças') : 'nenhuma cobrança'}</div></div>
          <div class="ov-line-val num">${money(tot(receber))}</div>
        </div>
        ${extra}
        <div class="ov-line is-total ${saldo < 0 ? 'neg' : 'pos'}">
          <div class="ov-line-main"><div class="ov-line-label">${saldo < 0 ? 'Falta (receber − dívidas)' : 'Sobra (receber − dívidas)'}</div></div>
          <div class="ov-line-val num">${Math.abs(saldo) < 0.005 ? money(0) : signed(saldo)}</div>
        </div>
      </div>`;
    };

    const pago = list.filter(x => x.kind === 'expense'), recebido = list.filter(x => x.kind === 'income');
    const jaFeito = `<div class="ov-line is-done">
          <span class="ov-line-ico">${icon('ph-check-circle')}</span>
          <div class="ov-line-main"><div class="ov-line-label">Já pago / recebido</div>
            <div class="ov-line-sub">${plural(pago.length + recebido.length, 'lançamento com baixa', 'lançamentos com baixa')}</div></div>
          <div class="ov-line-val num"><span class="delta-neg">${money(tot(pago))}</span> / <span class="delta-pos">${money(tot(recebido))}</span></div>
        </div>`;
    const saldoContas = `<div class="ov-line is-done">
          <span class="ov-line-ico">${icon('ph-bank')}</span>
          <div class="ov-line-main"><div class="ov-line-label">Saldo em contas hoje</div>
            <div class="ov-line-sub">${plural(state.accounts.length, 'conta', 'contas')}</div></div>
          <div class="ov-line-val num">${money(totalBalance(k))}</div>
        </div>`;
    box.innerHTML = card(k, 'atual', jaFeito) + card(next, 'proximo', saldoContas);

    // Saldo em contas e patrimônio investido
    const stats = $('#ovStats');
    if (stats) {
      let varInv = 0, temVar = false;
      state.investments.forEach(inv => { const l = snapsOf(inv.id); if (l.length > 1) { temVar = true; varInv += l.at(-1).balance - l.at(-2).balance; } });
      const chipInv = temVar && Math.abs(varInv) > 0.004 ? `<span class="ov-stat-chip ${varInv < 0 ? 'is-neg' : ''}">${varInv < 0 ? '−' : '+'} ${money(Math.abs(varInv))}</span>` : '';
      stats.innerHTML = `
        <button type="button" class="ov-stat is-green" data-go="accounts">
          <span class="ov-stat-ico">${icon('ph-chart-line-up')}</span>
          <span class="ov-stat-txt"><span class="ov-stat-label">Saldo total em contas</span><strong class="num">${money(totalBalance(k))}</strong></span>
          <span class="ov-stat-go">${icon('ph-caret-right')}</span>
        </button>
        <button type="button" class="ov-stat is-purple" data-go="investments">
          <span class="ov-stat-ico">${icon('ph-stack')}</span>
          <span class="ov-stat-txt"><span class="ov-stat-label">Patrimônio investido</span><strong class="num">${money(invTotal())}</strong>${chipInv}</span>
          <span class="ov-stat-go">${icon('ph-caret-right')}</span>
        </button>`;
    }

    const today = todayISO();
    const prox = sched.slice().sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
    $('#numNext').innerHTML = prox.length ? prox.map(x => {
      const d = daysBetween(today, x.date);
      const quando = d < 0 ? `<span class="tag sched-tag is-late">${-d} dia${d === -1 ? '' : 's'} atrasado</span>`
        : d === 0 ? '<span class="tag sched-tag is-late">Vence hoje</span>'
        : `<span class="tag sched-tag ${d <= 7 ? 'is-soon' : ''}">em ${d} dia${d === 1 ? '' : 's'}</span>`;
      return `<tr class="is-scheduled">
        <td class="num">${sheetDate(x.date)}</td>
        <td class="sheet-desc"><span class="sheet-desc-in">${esc(x.description)}</span></td>
        <td class="col-cat">${esc(x.category)}</td>
        <td>${quando}</td>
        <td class="t-right num ${x.kind === 'income' ? 'delta-pos' : 'delta-neg'}">${x.amount ? signed(value(x)) : '<span class="t-faint">a definir</span>'}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="5" class="empty">Nenhum vencimento agendado.</td></tr>';
  }

  /* Últimos lançamentos: abas Todos / Movimentações / Pagamentos / Cobranças / Documentação */
  let ovRecent = [], ovTab = 'all';
  const OV_TABS = {
    all: { go: 'transactions', empty: 'Nenhum lançamento neste mês.' },
    mov: { go: 'transactions', empty: 'Nenhuma movimentação avulsa neste mês.' },
    pag: { go: 'pagamentos', empty: 'Nenhum pagamento neste mês nem agendado.' },
    cob: { go: 'cobrancas', empty: 'Nenhuma cobrança neste mês nem agendada.' },
    doc: { go: 'documentacao', empty: 'Nenhuma documentação pendente ou concluída neste mês.' },
  };
  function recentType(x) {
    if (x.doc) return 'doc';
    if (x.scheduled || x.taskId) {
      const t = x.taskId ? taskById(x.taskId) : null;
      return x.kind === 'income' || (t && taskKind(t) === 'cobranca') ? 'cob' : 'pag';
    }
    return 'mov';
  }
  function renderRecent() {
    const list = ovTab === 'all' ? ovRecent : ovRecent.filter(x => recentType(x) === ovTab);
    $$('#recentTabs [data-ovtab]').forEach(b => b.classList.toggle('on', b.dataset.ovtab === ovTab));
    $('#recentMore').dataset.go = OV_TABS[ovTab].go;
    $('#recentRows').innerHTML = list.slice(0, 5).map(overviewTxRow).join('')
      || `<tr><td colspan="7" class="empty">${OV_TABS[ovTab].empty}</td></tr>`;
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-ovtab]');
    if (b) { ovTab = b.dataset.ovtab; renderRecent(); }
  });

  /** Linha da planilha "Últimos lançamentos" (lançamentos reais e agendamentos sem baixa). */
  function overviewTxRow(x) {
    if (x.doc) {
      const sit = x.done ? '<span class="tag sheet-done">Concluída</span>'
        : `<span class="tag sched-tag ${x.status === 'atrasada' ? 'is-late' : ''}">${x.status === 'atrasada' ? 'Atrasada' : x.status === 'hoje' ? 'Vence hoje' : 'Pendente'}</span>`;
      return `<tr class="${x.done ? '' : 'is-scheduled'} is-doc">
      <td class="num">${sheetDate(x.date)}${x.time ? `<small>${x.time}</small>` : ''}</td>
      <td class="sheet-desc"><span class="sheet-desc-in">${esc(x.description)}</span></td>
      <td class="col-cat">Documentação</td>
      <td class="col-acc"><span class="t-faint">—</span></td>
      <td class="col-orig">Documentação</td>
      <td>${sit}</td>
      <td class="t-right"><span class="t-faint">—</span></td>
    </tr>`;
    }
    const inc = x.kind === 'income';
    const t = x.taskId ? taskById(x.taskId) : null;
    const cob = t && taskKind(t) === 'cobranca';
    const origin = x.scheduled || x.taskId ? (inc || cob ? 'Cobrança' : 'Pagamento') : 'Movimentação';
    const sit = x.scheduled
      ? `<span class="tag sched-tag ${x.status === 'atrasada' ? 'is-late' : ''}">${x.status === 'atrasada' ? 'Atrasado' : x.status === 'hoje' ? 'Vence hoje' : 'Agendado'}</span>`
      : `<span class="tag sheet-done">${inc ? 'Recebido' : 'Pago'}</span>`;
    const acc = x.account && accName(x.account) !== '—' ? esc(accName(x.account)) : '<span class="t-faint">—</span>';
    const val = x.scheduled && !x.amount ? '<span class="t-faint">a definir</span>'
      : `${signed(value(x))}${x.scheduled && x.variable ? '<small>estimado</small>' : ''}`;
    return `<tr class="${x.scheduled ? 'is-scheduled' : ''}">
      <td class="num">${sheetDate(x.date)}${x.time ? `<small>${x.time}</small>` : ''}</td>
      <td class="sheet-desc"><span class="sheet-desc-in">${esc(x.description)}${x.receiptId ? `<button class="clip" data-receipt="${x.receiptId}" data-rtx="${x.id}" title="Ver comprovante" aria-label="Ver comprovante">${icon('paperclip')}</button>` : ''}</span></td>
      <td class="col-cat">${esc(x.category)}</td>
      <td class="col-acc">${acc}</td>
      <td class="col-orig">${origin}</td>
      <td>${sit}</td>
      <td class="t-right num ${inc ? 'delta-pos' : 'delta-neg'}">${val}</td>
    </tr>`;
  }


  function chip(diff, base) {
    if (diff == null) return '<span class="chip zero">primeiro registro</span>';
    const cls = diff > 0.004 ? 'pos' : diff < -0.004 ? 'neg' : 'zero';
    const p = base ? ` (${diff >= 0 ? '+' : '−'}${pct2(Math.abs(diff / base))})` : '';
    return `<span class="chip ${cls} num">${signed(diff)}${p}</span>`;
  }

  function catBreakdown(list, limit) {
    const exp = list.filter(x => x.kind === 'expense');
    const total = sum(exp, 'expense');
    if (!total) return '<div class="empty">Sem despesas neste período.</div>';
    const groups = {}, sched = {}, count = {};
    exp.forEach(x => {
      groups[x.category] = (groups[x.category] || 0) + x.amount;
      count[x.category] = (count[x.category] || 0) + 1;
      if (x.scheduled) sched[x.category] = (sched[x.category] || 0) + x.amount;
    });
    let rows = Object.entries(groups).map(([c, v]) => [c, v, sched[c] || 0, count[c]]).sort((a, b) => b[1] - a[1]);
    if (limit && rows.length > limit) {
      const rest = rows.slice(limit - 1);
      rows = [...rows.slice(0, limit - 1), ['Demais categorias', rest.reduce((s, r) => s + r[1], 0), rest.reduce((s, r) => s + r[2], 0), rest.reduce((s, r) => s + r[3], 0)]];
    }
    const max = rows[0][1];
    const tot = $('#catTotal');
    if (tot) {
      tot.innerHTML = `<div class="cat-total-row"><span>Total</span><strong class="num">${money(total)}</strong></div>`;
    }
    return rows.map(([c, v, s, n]) => {
      return `
      <div class="cat-row">
        <div class="cat-name">${icon(CAT_ICON[c] || 'cat-dots-three-outline', 'i-sm')}<span class="cat-txt">${esc(c)}</span><small class="cat-n">${n} ${n === 1 ? 'conta' : 'contas'}</small></div>
        <div class="cat-val num">${money(v)}<small>${pct(v / total)}</small></div>
        <div class="cat-bar" title="${s ? `${money(s)} agendado` : ''}${s && v - s > 0.004 ? ' · ' : ''}${v - s > 0.004 ? `${money(v - s)} pago` : ''}">${v - s > 0.004 ? `<span class="is-paid" style="width:${((v - s) / max) * 100}%"></span>` : ''}${s ? `<span class="is-sched" style="width:${(s / max) * 100}%"></span>` : ''}</div>
      </div>`;
    }).join('');
  }


  /** Despesas por categoria da visão geral: rosca + tabela. */
  const DONUT_COLORS = ['#1f6fe5', '#16a34a', '#f59e0b', '#e8457f', '#8b5cf6', '#14b8a6'];
  function catDonut(list, limit = 6) {
    const exp = list.filter(x => x.kind === 'expense');
    const total = sum(exp, 'expense');
    if (!total) return '<div class="empty">Sem despesas neste período.</div>';
    const groups = {}, count = {};
    exp.forEach(x => { groups[x.category] = (groups[x.category] || 0) + x.amount; count[x.category] = (count[x.category] || 0) + 1; });
    let rows = Object.entries(groups).map(([c, v]) => [c, v, count[c]]).sort((a, b) => b[1] - a[1]);
    if (rows.length > limit) {
      const rest = rows.slice(limit - 1);
      rows = [...rows.slice(0, limit - 1), ['Demais categorias', rest.reduce((t, r) => t + r[1], 0), rest.reduce((t, r) => t + r[2], 0)]];
    }
    const R = 46, C = 2 * Math.PI * R, gap = rows.length > 1 ? 1.2 : 0;
    let off = 0;
    const arcs = rows.map(([c, v], i) => {
      const len = (v / total) * C;
      const a = `<circle cx="60" cy="60" r="${R}" fill="none" stroke="${DONUT_COLORS[i % DONUT_COLORS.length]}" stroke-width="17"
        stroke-dasharray="${Math.max(len - gap, 0.01)} ${C}" stroke-dashoffset="${-off}"><title>${esc(c)}: ${money(v)}</title></circle>`;
      off += len;
      return a;
    }).join('');
    const pctR = v => `${Math.round((v / total) * 100)}%`;
    return `<div class="donut">
        <svg viewBox="0 0 120 120" aria-hidden="true"><g transform="rotate(-90 60 60)">${arcs}</g></svg>
        <div class="donut-center"><strong class="num">${money(total)}</strong><span>Total</span></div>
      </div>
      <table class="donut-table">
        <thead><tr><th>Categoria</th><th class="col-n">Contas</th><th class="t-right">Valor</th><th class="t-right">%</th></tr></thead>
        <tbody>${rows.map(([c, v, n], i) => `<tr>
          <td><span class="donut-cat"><i style="background:${DONUT_COLORS[i % DONUT_COLORS.length]}"></i>${icon(CAT_ICON[c] || 'cat-dots-three-outline', 'i-sm')}<span>${esc(c)}</span></span></td>
          <td class="col-n">${n} ${n === 1 ? 'conta' : 'contas'}</td>
          <td class="t-right num">${money(v)}</td>
          <td class="t-right num donut-pct">${pctR(v)}</td>
        </tr>`).join('')}</tbody>
      </table>`;
  }

  function accRows(k, withDelete) {
    if (!state.accounts.length) return '<div class="empty">Nenhuma conta cadastrada.</div>';
    const rows = state.accounts.map(a => `
      <div class="acc-row">
        <div class="acc-ico">${icon(a.type === 'Dinheiro em espécie' ? 'ph-wallet' : 'ph-bank', 'i-sm')}</div>
        <div class="acc-info"><div class="acc-name">${esc(a.name)}</div><div class="acc-type">${esc(a.type)}</div></div>
        <div class="acc-bal num">${money(accBalance(a, k))}</div>
        ${withDelete ? `<button class="icon-btn" data-del-acc="${a.id}" aria-label="Excluir conta">${icon('trash-2', 'i-sm')}</button>` : ''}
      </div>`).join('');
    return rows + `<div class="acc-total"><span>Total</span><strong class="num">${money(totalBalance(k))}</strong></div>`;
  }

  /* ---------- Gráficos ---------- */
  const niceStep = raw => { const p = 10 ** Math.floor(Math.log10(raw)); return [1, 2, 2.5, 5, 10].map(m => m * p).find(s => s >= raw); };

  function axes(svg, W, H, pad, lo, hi, ticks = 4) {
    const step = niceStep(Math.max((hi - lo) / ticks, 1));
    const min = Math.floor(lo / step) * step, max = Math.max(Math.ceil(hi / step) * step, min + step);
    const y = v => pad.t + (H - pad.t - pad.b) * (1 - (v - min) / (max - min));
    let out = '';
    for (let v = min; v <= max + 1e-6; v += step) {
      const yy = Math.round(y(v)) + .5;
      const label = step >= 100 ? kAxis(v) : v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
      out += `<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${yy}" y2="${yy}"/><text x="${pad.l - 10}" y="${yy + 4}" text-anchor="end">${label}</text>`;
    }
    return { y, out };
  }

  // Curva suave (monotônica) passando pelos pontos
  function smooth(pts) {
    if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : '';
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], cx = (x1 - x0) / 2;
      d += ` C${x0 + cx},${y0} ${x1 - cx},${y1} ${x1},${y1}`;
    }
    return d;
  }

  function flowChart(k) {
    const svg = $('#chart');
    if (!svg) return;
    const W = svg.clientWidth || 600, H = Math.round(Math.min(340, Math.max(230, W * 0.3))), pad = { l: 52, r: 12, t: 18, b: 26 };
    const keys = []; let c = k; for (let i = 0; i < 6; i++) { keys.unshift(c); c = prevMonth(c); }
    const data = keys.map(key => { const l = inMonth(key); return { key, inc: sum(l, 'income'), exp: sum(l, 'expense') }; });
    const { y, out: grid } = axes(svg, W, H, pad, 0, Math.max(1000, ...data.map(d => Math.max(d.inc, d.exp))));
    const slot = (W - pad.l - pad.r) / data.length;
    const cx = i => pad.l + slot * i + slot / 2;
    let out = grid;

    if (chartMode === 'bar') {
      const bw = Math.min(18, slot * 0.24);
      data.forEach((d, i) => {
        out += `<rect class="bar-in" x="${cx(i) - bw - 2}" y="${y(d.inc)}" width="${bw}" height="${Math.max(y(0) - y(d.inc), 0)}" rx="2" style="fill:var(--chart-in)"/>
          <rect class="bar-out" x="${cx(i) + 2}" y="${y(d.exp)}" width="${bw}" height="${Math.max(y(0) - y(d.exp), 0)}" rx="2" style="fill:var(--chart-out)"/>`;
      });
    } else {
      const pin = data.map((d, i) => [cx(i), y(d.inc)]), pout = data.map((d, i) => [cx(i), y(d.exp)]);
      const base = y(0), first = cx(0), last = cx(data.length - 1);
      out += `<path class="area-in" d="${smooth(pin)} L${last},${base} L${first},${base} Z"/>
        <path class="area-out" d="${smooth(pout)} L${last},${base} L${first},${base} Z"/>
        <path class="line-in" d="${smooth(pin)}"/><path class="line-out" d="${smooth(pout)}"/>`;
      data.forEach((d, i) => {
        out += `<circle class="pt pt-in" cx="${pin[i][0]}" cy="${pin[i][1]}" r="${d.key === k ? 4.5 : 3.5}"/>
          <circle class="pt pt-out" cx="${pout[i][0]}" cy="${pout[i][1]}" r="${d.key === k ? 4.5 : 3.5}"/>`;
        if (d.key === k) {
          out += `<text class="val val-in" x="${pin[i][0]}" y="${pin[i][1] - 10}" text-anchor="middle">${kAxis(d.inc)}</text>
            <text class="val val-out" x="${pout[i][0]}" y="${pout[i][1] + 18}" text-anchor="middle">${kAxis(d.exp)}</text>`;
        }
      });
    }
    data.forEach((d, i) => {
      const [yy, mm] = d.key.split('-');
      out += `<g class="${d.key === k ? 'current' : ''}">
        <rect class="hit" x="${cx(i) - slot / 2}" y="${pad.t}" width="${slot}" height="${H - pad.t - pad.b}"><title>${monthLabel(d.key)}\nReceitas: ${money(d.inc)}\nDespesas: ${money(d.exp)}\nResultado: ${signed(d.inc - d.exp)}</title></rect>
        <text class="mlabel" x="${cx(i)}" y="${H - 6}" text-anchor="middle">${MONTHS[+mm - 1]}${mm === '01' ? ' ' + yy.slice(2) : ''}</text></g>`;
    });
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.style.height = H + 'px';
    svg.innerHTML = out;
  }

  let invChartMode = 'all';
  /** Série do gráfico: total, uma conta ou uma aplicação. */
  function invChartApps() {
    const pick = $('#invChartPick')?.value;
    if (invChartMode === 'acc' && pick) return state.investments.filter(i => i.account === pick);
    if (invChartMode === 'app' && pick) return state.investments.filter(i => i.id === pick);
    return state.investments;
  }
  function investChart() {
    const svg = $('#investChart');
    if (!svg) return;
    const apps = invChartApps(), ids = new Set(apps.map(a => a.id));
    const snaps = state.snapshots.filter(x => ids.has(x.invId));
    if (!snaps.length) { svg.innerHTML = '<text x="50%" y="50%" text-anchor="middle" class="empty-txt">Nenhum saldo registrado ainda.</text>'; svg.setAttribute('viewBox', '0 0 600 200'); svg.style.height = '200px'; return; }
    const allDates = [...new Set(snaps.map(x => x.date))].sort();
    // Mais de 2 meses de histórico: um ponto por mês (fim do mês); senão, um ponto por data verificada
    const first = allDates[0], last = allDates.at(-1);
    const monthly = monthDiff(ym(first), ym(last)) >= 2;
    let keys;
    if (monthly) { keys = []; for (let m = ym(first); m <= ym(last); m = addMonths(m, 1)) keys.push(m); keys = keys.slice(-8); }
    else keys = allDates.slice(-12);
    const limit = k => monthly ? `${k}-31` : k;
    const data = keys.map(k => ({ k, v: apps.reduce((t, inv) => t + (snapsOf(inv.id).filter(x => x.date <= limit(k)).at(-1)?.balance ?? 0), 0) }));
    const W = svg.clientWidth || 700, H = Math.max(210, Math.min(260, Math.round(W * 0.34))), pad = { l: 92, r: 24, t: 26, b: 30 };
    const vals = data.map(x => x.v), lo = Math.min(...vals), hi = Math.max(...vals);
    const spread = Math.max(hi - lo, hi * 0.05, 10);
    const lo2 = data.length === 1 ? 0 : Math.max(0, lo - spread * 0.35), hi2 = data.length === 1 ? (hi * 1.25 || 100) : hi + spread * 0.35;
    const stepY = niceStep(Math.max((hi2 - lo2) / 5, 1));
    const minY = Math.floor(lo2 / stepY) * stepY, maxY = Math.max(Math.ceil(hi2 / stepY) * stepY, minY + stepY);
    const y = v => pad.t + (H - pad.t - pad.b) * (1 - (v - minY) / (maxY - minY));
    let grid = '';
    for (let v = minY; v <= maxY + 1e-6; v += stepY) {
      const yy = Math.round(y(v)) + .5;
      grid += `<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${yy}" y2="${yy}"/><text x="${pad.l - 12}" y="${yy + 4}" text-anchor="end">R$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</text>`;
    }
    const n = data.length, span = W - pad.l - pad.r;
    const x = i => n === 1 ? pad.l + span / 2 : pad.l + 16 + (span - 32) * i / (n - 1);
    const pts = data.map((p, i) => [x(i), y(p.v)]);
    const base = H - pad.b;
    const line = n > 1 ? `M${pts.map(p => p.join(',')).join(' L')}` : '';
    let out = `<defs><linearGradient id="invGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1f6fe5" stop-opacity=".45"/><stop offset="1" stop-color="#1f6fe5" stop-opacity=".05"/></linearGradient></defs>` + grid;
    if (n > 1) out += `<path d="${line} L${pts.at(-1)[0]},${base} L${pts[0][0]},${base} Z" fill="url(#invGrad)"/><path d="${line}" fill="none" stroke="#1f6fe5" stroke-width="2.5"/>`;
    const lbl = k => monthly ? `${MONTHS[+k.slice(5) - 1].toLowerCase()}/${k.slice(2, 4)}` : shortDate(k);
    const badge = (px, py, txt, anchorEnd) => {
      const w = txt.length * 7.4 + 16, bx = anchorEnd ? px - w + 18 : px - 18, by = py - 34;
      return `<g class="inv-badge"><rect x="${bx}" y="${by}" width="${w}" height="24" rx="5"/><text x="${bx + w / 2}" y="${by + 16}" text-anchor="middle">${txt}</text></g>`;
    };
    data.forEach((p, i) => {
      out += `<circle cx="${pts[i][0]}" cy="${pts[i][1]}" r="5.5" fill="#1f6fe5" stroke="#fff" stroke-width="2"><title>${monthly ? monthLabel(p.k) : fullDate(p.k)}\n${money(p.v)}</title></circle>
        <text x="${pts[i][0]}" y="${H - 8}" text-anchor="middle" class="inv-xl">${lbl(p.k)}</text>`;
    });
    if (n > 1) out += badge(pts[0][0], pts[0][1], money(data[0].v), false);
    out += badge(pts.at(-1)[0], pts.at(-1)[1], money(data.at(-1).v), true);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.style.height = H + 'px';
    svg.innerHTML = out;
  }

  function delta(cur, prev, invert) {
    if (!prev) return '<span>sem mês anterior</span>';
    const d = (cur - prev) / prev;
    const good = invert ? d <= 0 : d >= 0;
    return `<span class="${good ? 'delta-pos' : 'delta-neg'}">${d >= 0 ? '↑' : '↓'} ${pct(Math.abs(d))}</span> vs. mês anterior`;
  }

  /* ======================================================================
     TAREFAS DE PAGAMENTO
     Ocorrências são calculadas a partir do modelo (state.tasks); só a baixa
     ou a dispensa de cada mês fica salva (state.taskDone).
     ====================================================================== */
  const pad2 = n => String(n).padStart(2, '0');
  function addMonths(k, n) {
    let [y, m] = k.split('-').map(Number);
    m += n; y += Math.floor((m - 1) / 12); m = ((m - 1) % 12 + 12) % 12 + 1;
    return `${y}-${pad2(m)}`;
  }
  const monthDiff = (a, b) => { const [ya, ma] = a.split('-').map(Number), [yb, mb] = b.split('-').map(Number); return (yb - ya) * 12 + (mb - ma); };
  const daysIn = k => { const [y, m] = k.split('-').map(Number); return new Date(y, m, 0).getDate(); };
  const dayIn = (k, d) => `${k}-${pad2(Math.min(Math.max(1, d || 1), daysIn(k)))}`;
  const daysBetween = (a, b) => Math.round((Date.parse(b + 'T12:00') - Date.parse(a + 'T12:00')) / 86400000);
  const addDays = (d, n) => { const x = new Date(d + 'T12:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  const currentMonth = () => ym(todayISO());
  const OPEN = ['atrasada', 'hoje', 'aberta'];
  const STATUS_LABEL = {
    atrasada: 'Atrasada', hoje: 'Vence hoje', aberta: 'Pendente', futura: 'A vencer',
    paga: 'Paga', cobrada: 'Recebida', concluida: 'Concluída', dispensada: 'Dispensada',
  };
  const GROUP_LABEL = {
    atrasada: 'Atrasadas', hoje: 'Vencem hoje', aberta: 'Pendentes', futura: 'A vencer',
    paga: 'Pagas', cobrada: 'Recebidas', concluida: 'Concluídas', dispensada: 'Dispensadas',
  };
  // Status que fazem sentido em cada tipo (filtro "Situação")
  const STATUS_BY_KIND = {
    pagamento: ['atrasada', 'hoje', 'aberta', 'futura', 'paga', 'dispensada'],
    cobranca: ['atrasada', 'hoje', 'aberta', 'futura', 'cobrada', 'dispensada'],
    documentacao: ['atrasada', 'hoje', 'aberta', 'futura', 'concluida', 'dispensada'],
  };
  const ORDER = ['atrasada', 'hoje', 'aberta', 'futura', 'paga', 'cobrada', 'concluida', 'dispensada'];
  const DONE_STATUSES = ['paga', 'cobrada', 'concluida', 'dispensada'];

  const taskById = id => state.tasks.find(t => t.id === id);
  const doneOf = (taskId, k) => state.taskDone.find(d => d.taskId === taskId && d.period === k);

  /** Normaliza para YYYY-MM (evita "2026-11" < "2026-11-01" excluir o mês atual). */
  const asMonth = v => (typeof v === 'string' && v.length >= 7 ? v.slice(0, 7) : null);

  function weeklyDates(t, k) {
    const r = t.rec || {};
    if (r.type !== 'weekly') return [];
    const start = `${k}-01`;
    const last = new Date(+k.slice(0, 4), +k.slice(5), 0).getDate();
    const finish = `${k}-${String(last).padStart(2, '0')}`;
    const lower = t.start && `${asMonth(t.start)}-01` > start ? `${asMonth(t.start)}-01` : start;
    const upper = t.end && `${asMonth(t.end)}-${String(new Date(+t.end.slice(0, 4), +t.end.slice(5), 0).getDate()).padStart(2, '0')}` < finish
      ? `${asMonth(t.end)}-${String(new Date(+t.end.slice(0, 4), +t.end.slice(5), 0).getDate()).padStart(2, '0')}` : finish;
    if (lower > upper) return [];
    const wanted = Number(r.dayOfWeek) || 0;
    const out = [];
    for (let d = lower; d <= upper; d = addDays(d, 1)) {
      if (new Date(`${d}T12:00`).getDay() === wanted) out.push(d);
    }
    return out;
  }

  function occursIn(t, k) {
    const r = t.rec || {};
    const start = asMonth(t.start);
    const end = asMonth(t.end);
    if (r.type === 'once') return asMonth(r.dateTo || r.dateFrom || '') === k;
    if (r.type === 'weekly') return weeklyDates(t, k).length > 0;
    if (start && k < start) return false;
    if (end && k > end) return false;
    if (r.type === 'yearly') return +k.slice(5) === +r.month;
    return monthDiff(start || k, k) % (r.every || 1) === 0;
  }

  function occurrence(t, k) {
    const r = t.rec || {};
    let from, to;
    if (r.type === 'once') { to = r.dateTo || r.dateFrom; from = r.dateFrom || to; }
    else if (r.type === 'weekly') { from = to = k.length === 10 ? k : weeklyDates(t, k)[0]; }
    else { from = dayIn(k, r.dayFrom); to = dayIn(k, Math.max(r.dayTo || r.dayFrom, r.dayFrom)); }
    const done = doneOf(t.id, k);
    const today = todayISO();
    const status = done ? done.status : today > to ? 'atrasada' : today === to ? 'hoje' : today >= from ? 'aberta' : 'futura';
    return { task: t, period: k, from, to, done, status, key: `${t.id}|${k}` };
  }

  function occurrencesIn(k) {
    return state.tasks.flatMap(t => {
      if ((t.rec || {}).type === 'weekly') {
        return weeklyDates(t, k).filter(d => (!t.paused && !t.archived) || doneOf(t.id, d)).map(d => occurrence(t, d));
      }
      return occursIn(t, k) && ((!t.paused && !t.archived) || doneOf(t.id, k)) ? [occurrence(t, k)] : [];
    });
  }

  const firstTaskMonth = t => {
    const r = t.rec || {};
    return asMonth(r.type === 'once' ? (r.dateFrom || r.dateTo) : t.start)
      || asMonth(t.createdAt) || currentMonth();
  };

  // Atrasadas desde o primeiro cadastro. O limite de 100 anos é apenas uma
  // proteção contra dado corrompido; uma dívida real não some depois de 12 meses.
  function overdueBefore(k) {
    const out = [];
    const starts = state.tasks.filter(t => !t.archived).map(firstTaskMonth).filter(Boolean).sort();
    const earliest = starts[0] || k;
    const distance = Math.min(1200, Math.max(0, monthDiff(earliest, k)));
    for (let i = distance; i >= 1; i--) occurrencesIn(addMonths(k, -i)).forEach(o => { if (o.status === 'atrasada') out.push(o); });
    return out;
  }

  // Tudo que precisa de ação hoje (atrasadas, vence hoje, em aberto)
  function pendingNow() {
    const k = currentMonth();
    return [...overdueBefore(k), ...occurrencesIn(k)].filter(o => OPEN.includes(o.status))
      .sort((a, b) => a.to.localeCompare(b.to));
  }

  function upcoming(days = 7) {
    const k = currentMonth(), limit = addDays(todayISO(), days);
    return [...occurrencesIn(k), ...occurrencesIn(addMonths(k, 1))].filter(o => o.status === 'futura' && o.from <= limit);
  }

  function nextDue(t) {
    const k = currentMonth();
    for (let i = -12; i <= 24; i++) {
      const m = addMonths(k, i);
      if (!occursIn(t, m)) continue;
      const options = (t.rec || {}).type === 'weekly'
        ? weeklyDates(t, m).map(d => occurrence(t, d))
        : [occurrence(t, m)];
      const o = options.find(x => !x.done && x.to >= todayISO());
      if (o) return o;
    }
    return null;
  }

  function recLabel(t) {
    const r = t.rec || {};
    if (r.type === 'once') return 'Única';
    if (r.type === 'weekly') return `Semanal · ${WEEKDAYS[Number(r.dayOfWeek) || 0]}`;
    if (r.type === 'yearly') return `Anual · ${MONTHS[(r.month || 1) - 1]}`;
    return (r.every || 1) === 1 ? 'Mensal' : `A cada ${r.every} meses`;
  }

  function windowLabel(o) {
    if (o.from === o.to) return `dia ${shortDate(o.to)}`;
    if (ym(o.from) === ym(o.to)) return `${+o.from.slice(8)}–${shortDate(o.to)}`;
    return `${shortDate(o.from)} – ${shortDate(o.to)}`;
  }

  function dueText(o) {
    const today = todayISO();
    if (o.status === 'atrasada') { const n = daysBetween(o.to, today); return `atrasada há ${n} dia${n > 1 ? 's' : ''}`; }
    if (o.status === 'hoje') return 'vence hoje';
    if (o.status === 'aberta') { const n = daysBetween(today, o.to); return `vence em ${n} dia${n > 1 ? 's' : ''}`; }
    if (o.status === 'futura') { const n = daysBetween(today, o.from); return n <= 31 ? `abre em ${n} dia${n > 1 ? 's' : ''}` : `abre em ${fullDate(o.from)}`; }
    return '';
  }

  function dueActionWord(kind) {
    return kind === 'cobranca' ? 'recebimento' : kind === 'documentacao' ? 'conclusão' : 'pagamento';
  }

  /** Cabeçalho: faltam X dias para o pagamento/cobrança… */
  function dueHeadline(o) {
    const kind = taskKind(o.task);
    const word = dueActionWord(kind);
    const today = todayISO();
    if (o.status === 'atrasada') {
      const n = daysBetween(o.to, today);
      return `Atrasada há ${n} dia${n === 1 ? '' : 's'} — ${word} de “${o.task.title}”`;
    }
    if (o.status === 'hoje') return `Vence hoje — ${word} de “${o.task.title}”`;
    if (o.status === 'aberta') {
      const n = daysBetween(today, o.to);
      if (n === 0) return `Vence hoje — ${word} de “${o.task.title}”`;
      return `Faltam ${n} dia${n === 1 ? '' : 's'} para o ${word} de “${o.task.title}”`;
    }
    if (o.status === 'futura') {
      const n = daysBetween(today, o.from);
      return `Em ${n} dia${n === 1 ? '' : 's'} abre o prazo do ${word} de “${o.task.title}”`;
    }
    return '';
  }

  function lastPaidAmount(taskId) {
    const list = state.taskDone
      .filter(d => d.taskId === taskId && (d.status === 'paga' || d.status === 'cobrada') && d.amount != null)
      .sort((a, b) => `${b.date || ''} ${b.time || ''}`.localeCompare(`${a.date || ''} ${a.time || ''}`));
    return list[0]?.amount ?? null;
  }

  function taskValorLabel(t) {
    const kind = taskKind(t);
    if (kind === 'documentacao') return '<span class="tag rec">Sem valor</span>';
    if (t.expected == null) {
      const last = lastPaidAmount(t.id);
      return last != null
        ? `<span class="tag var">Variável</span> <span class="t-muted">último ${money(last)}</span>`
        : '<span class="tag var">Variável</span>';
    }
    return `<span class="num">${money(t.expected)}</span>`;
  }

  function taskMatchesFilters(t) {
    const q = ($('#tq')?.value || '').trim().toLowerCase();
    const fk = taskView; // tipo vem do menu (Pagamentos / Cobranças / Documentação)
    const fv = $('#tfValor')?.value || 'all';
    const ff = $('#tfFreq')?.value || 'all';
    const fs = $('#tfState')?.value || 'all';
    const kind = taskKind(t);
    const r = t.rec || {};
    if (kind !== fk) return false;
    if (fv === 'fixo' && (kind === 'documentacao' || t.expected == null)) return false;
    if (fv === 'variavel' && (kind === 'documentacao' || t.expected != null)) return false;
    if (fv === 'sem' && kind !== 'documentacao') return false;
    if (ff === 'unica' && r.type !== 'once') return false;
    if (ff === 'semanal' && r.type !== 'weekly') return false;
    if (ff === 'anual' && r.type !== 'yearly') return false;
    if (ff === 'mensal' && (r.type !== 'monthly' || (r.every || 1) !== 1)) return false;
    if (ff === 'periodico' && (r.type !== 'monthly' || (r.every || 1) <= 1)) return false;
    if (fs === 'ativa' && t.paused) return false;
    if (fs === 'pausada' && !t.paused) return false;
    if (q) {
      const blob = `${t.title} ${t.payee || ''} ${t.chargeTo || ''} ${t.docOwner || ''} ${t.category || ''} ${accName(t.account) || ''} ${taskIssuer(t)} ${KIND_LABEL[kind]} ${recLabel(t)}`.toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  }

  function occMatchesFilters(o) {
    if (!taskMatchesFilters(o.task)) return false;
    const st = $('#tfStatus')?.value || 'all';
    if (st !== 'all' && o.status !== st) return false;
    return true;
  }

  function clearTaskFilters() {
    const tq = $('#tq'); if (tq) tq.value = '';
    ['tfValor', 'tfFreq', 'tfState', 'tfStatus'].forEach(id => {
      const el = $(`#${id}`);
      if (el) el.value = 'all';
    });
    taskPage = 1;
    renderTasks();
  }

  function taskPagerHtml(total) {
    const pages = Math.max(1, Math.ceil(total / TASK_PAGE));
    taskPage = Math.min(Math.max(1, taskPage), pages);
    if (!total) return '';
    const start = (taskPage - 1) * TASK_PAGE + 1;
    const end = Math.min(taskPage * TASK_PAGE, total);
    const noun = { pagamento: 'pagamentos', cobranca: 'cobranças', documentacao: 'pendências' }[taskView] || 'itens';
    const btns = [];
    for (let i = 1; i <= pages; i++) {
      if (pages > 7 && i !== 1 && i !== pages && Math.abs(i - taskPage) > 2) {
        if (btns[btns.length - 1] !== '…') btns.push('…');
        continue;
      }
      btns.push(i);
    }
    return `<div class="task-pager">
      <span class="t-muted">Mostrando ${start}–${end} de ${total} ${noun}</span>
      <div class="task-pager-btns">
        <button type="button" class="pg-btn" data-task-page="${taskPage - 1}" ${taskPage <= 1 ? 'disabled' : ''} aria-label="Anterior">${icon('chevron-down', 'i-sm pg-prev')}</button>
        ${btns.map(i => i === '…'
          ? '<span class="t-muted">…</span>'
          : `<button type="button" class="pg-btn ${i === taskPage ? 'on' : ''}" data-task-page="${i}">${i}</button>`).join('')}
        <button type="button" class="pg-btn" data-task-page="${taskPage + 1}" ${taskPage >= pages ? 'disabled' : ''} aria-label="Próxima">${icon('chevron-down', 'i-sm pg-next')}</button>
      </div>
    </div>`;
  }

  /** Ordenação pelos cabeçalhos da tabela de pagamentos/cobranças. */
  const SORTERS = {
    title: o => o.task.title.toLowerCase(),
    target: o => taskTarget(o.task).toLowerCase(),
    value: o => (isMoneyDone(o.done) && o.done.amount != null ? o.done.amount : o.task.expected ?? -1),
    period: o => o.period,
    due: o => o.to,
    status: o => STATUS_LABEL[o.status] || '',
    issuer: o => taskIssuer(o.task).toLowerCase(),
  };
  function sortOcc(list) {
    const f = SORTERS[taskSort.key];
    if (!f) return list;
    return list.slice().sort((a, b) => { const x = f(a), y = f(b); return (x > y ? 1 : x < y ? -1 : 0) * taskSort.dir; });
  }
  const sortTh = (key, label, cls = '') => `<th class="th-sort ${cls} ${taskSort.key === key ? 'is-sorted' : ''}"><button type="button" data-tsort="${key}">${label}<span class="sort-ico">${taskSort.key === key ? (taskSort.dir > 0 ? '↑' : '↓') : '⇅'}</span></button></th>`;

  function pageSlice(list) {
    const pages = Math.max(1, Math.ceil(list.length / TASK_PAGE));
    taskPage = Math.min(Math.max(1, taskPage), pages);
    const start = (taskPage - 1) * TASK_PAGE;
    return list.slice(start, start + TASK_PAGE);
  }

  function renderDueBanner() {
    const el = $('#taskDueBanner');
    if (!el) return;
    const list = [...pendingNow(), ...upcoming(7)]
      .filter((o, i, arr) => arr.findIndex(x => x.key === o.key) === i)
      .filter(o => taskKind(o.task) === taskView)
      .filter(o => OPEN.includes(o.status) || o.status === 'futura')
      .sort((a, b) => a.to.localeCompare(b.to) || a.from.localeCompare(b.from))
      .slice(0, 4);
    if (!list.length) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.innerHTML = list.map(o => {
      const kind = taskKind(o.task);
      const urgent = o.status === 'atrasada' || o.status === 'hoje';
      const soon = o.status === 'aberta' && daysBetween(todayISO(), o.to) <= 3;
      const cls = urgent ? 'due-banner is-late' : soon ? 'due-banner is-soon' : 'due-banner';
      const valor = kind === 'documentacao' ? ''
        : o.task.expected != null ? money(o.task.expected)
        : (lastPaidAmount(o.task.id) != null ? `≈ último ${money(lastPaidAmount(o.task.id))}` : 'valor variável');
      return `<div class="${cls}">
        <div class="due-banner-main">
          ${icon('info', 'due-ico')}<strong>${esc(dueHeadline(o))}</strong>
          <span class="due-banner-meta">— ${esc(KIND_LABEL[kind])}${valor ? ` · ${valor}` : ''} · ${o.from === o.to ? `dia ${+o.to.slice(8)} de ${MONTHS_FULL[+o.to.slice(5, 7) - 1].toLowerCase()}` : windowLabel(o)}</span>
        </div>
        <div class="due-banner-actions">${launchBtn(o)}</div>
      </div>`;
    }).join('');
  }

  const statusTag = s => `<span class="tag st-${s}">${STATUS_LABEL[s]}</span>`;
  const payeeIcon = () => icon('user-round');

  function taskRow(o) {
    const t = o.task, d = o.done, kind = taskKind(t);
    const moneyDone = d && (d.status === 'paga' || d.status === 'cobrada');
    const val = moneyDone ? d.amount : t.expected;
    const valNote = d?.status === 'paga' ? 'pago'
      : d?.status === 'cobrada' ? 'recebido'
      : d?.status === 'concluida' ? 'concluído'
      : kind === 'documentacao' ? 'sem valor'
      : t.expected != null ? 'previsto' : 'valor variável';
    let info = '';
    if (d && d.status === 'paga') {
      info = `<div class="task-done-info">${icon('check')}Pago por ${esc(d.by || '—')} em ${fullDate(d.date)}${d.time ? ` às ${d.time}` : ''} · ${esc(accName(d.account))}${d.payee && d.payee !== t.payee ? ` · recebido por ${esc(d.payee)}` : ''}</div>`;
    } else if (d && d.status === 'cobrada') {
      info = `<div class="task-done-info">${icon('check')}Recebido de ${esc(d.payee || t.chargeTo || '—')} · registrado por ${esc(d.by || '—')} em ${fullDate(d.date)}${d.time ? ` às ${d.time}` : ''} · ${esc(accName(d.account))}</div>`;
    } else if (d && d.status === 'concluida') {
      info = `<div class="task-done-info">${icon('check')}Concluído por ${esc(d.by || '—')}${d.date ? ` em ${fullDate(d.date)}` : ''}${d.note ? ` · ${esc(d.note)}` : ''}</div>`;
    } else if (d && d.status === 'dispensada') {
      info = `<div class="task-done-info" style="color:var(--muted)">${icon('ban')}Dispensada${d.by ? ` por ${esc(d.by)}` : ''}${d.date ? ` em ${fullDate(d.date)}` : ''}</div>`;
    }
    let actions = '';
    if (kind === 'documentacao' && t.docFileId) {
      actions += `<button class="btn btn-sm" data-receipt="${t.docFileId}" title="Ver documento anexado">${icon('paperclip', 'i-sm')}Documento</button>`;
    }
    if (!d) {
      actions += launchBtn(o);
      if (kind !== 'pagamento') actions += `<button class="icon-btn" data-skip="${o.key}" title="Dispensar neste mês" aria-label="Dispensar neste mês">${icon('ban', 'i-sm')}</button>`;
    } else if (d.status === 'paga' || d.status === 'cobrada') {
      if (d.receiptId) actions += `<button class="btn btn-sm" data-receipt="${d.receiptId}" data-rtx="${d.txId}">${icon('paperclip', 'i-sm')}Comprovante</button>`;
      actions += `<button class="icon-btn danger" data-undo="${o.key}" title="Desfazer" aria-label="Desfazer">${icon('undo-2', 'i-sm')}</button>`;
    } else {
      if (d.receiptId) actions += `<button class="btn btn-sm" data-receipt="${d.receiptId}" title="Ver anexo da conclusão">${icon('paperclip', 'i-sm')}Conclusão</button>`;
      actions += `<button class="icon-btn" data-undo="${o.key}" title="Reabrir" aria-label="Reabrir">${icon('undo-2', 'i-sm')}</button>`;
    }
    actions += `<button class="icon-btn" data-edit-task="${t.id}" title="Editar" aria-label="Editar">${icon('pencil-line', 'i-sm')}</button>`;
    const prevMonthTag = asMonth(o.period) !== period && OPEN.includes(o.status) ? `<span class="tag rec">${monthLabel(o.period)}</span>` : '';
    const kindTag = `<span class="tag rec">${KIND_LABEL[kind]}</span>`;
    const hideValue = kind === 'documentacao' && !moneyDone;
    return `<div class="task st-${o.status}">
      <div class="task-ico">${icon(kind === 'documentacao' ? 'briefcase' : kind === 'cobranca' ? 'circle-dollar-sign' : (CAT_ICON[t.category] || 'list-checks'))}</div>
      <div class="task-main">
        <div class="task-title">${esc(t.title)} ${statusTag(o.status)}${kindTag}<span class="tag rec">${icon('repeat')}${recLabel(t)}</span>${prevMonthTag}</div>
        <div class="task-sub">
          ${kind === 'pagamento' ? `<span>${payeeIcon(t)}${esc(t.payee || '—')}</span>` : ''}
          ${kind === 'cobranca' ? `<span>${payeeIcon(t)}${esc(t.chargeTo || '—')}</span>` : ''}
          ${kind === 'documentacao' && t.docOwner ? `<span>${payeeIcon(t)}${esc(t.docOwner)}</span>` : ''}
          <span>${icon('calendar-clock')}${windowLabel(o)}${d ? '' : ` · ${dueText(o)}`}</span>
          ${t.account && !d && kind !== 'documentacao' ? `<span>${icon('landmark')}${esc(accName(t.account))}</span>` : ''}
        </div>
        ${info}
      </div>
      <div class="task-value">${hideValue ? '<strong>—</strong><small>documentação</small>' : `<strong class="num">${val != null ? money(val) : '—'}</strong><small>${valNote}</small>`}</div>
      <div class="task-actions">${actions}</div>
    </div>`;
  }

  function groupedRows(list) {
    const out = [];
    ORDER.forEach(s => {
      const g = list.filter(o => o.status === s).sort((a, b) => a.to.localeCompare(b.to));
      if (!g.length) return;
      out.push(`<div class="task-group g-${s}">${GROUP_LABEL[s]}<span class="count">${g.length}</span></div>`);
      g.forEach(o => out.push(taskRow(o)));
    });
    return out.join('');
  }

  function taskIssuer(t) {
    return t?.createdByName || (t?.createdBy && !/^[0-9a-f-]{20,}$/i.test(t.createdBy) ? t.createdBy : '') || '—';
  }

  function taskTarget(t) {
    const kind = taskKind(t);
    if (kind === 'cobranca') return t.chargeTo || '—';
    if (kind === 'documentacao') return t.docOwner || '—';
    return t.payee || '—';
  }

  function launchBtn(o) {
    if (!o || o.done) return '';
    const cur = currentMonth();
    // Pagou o mês atual → some o botão até o próximo mês chegar.
    if (o.period > cur && occursIn(o.task, cur) && doneOf(o.task.id, cur)) return '';
    const kind = taskKind(o.task);
    if (kind === 'documentacao') {
      return `<button type="button" class="btn btn-sm btn-action btn-doc" title="Registrar a conclusão desta documentação" data-pay="${o.key}" data-pay-mode="documentacao">${icon('file-text', 'i-sm')}Registrar conclusão</button>`;
    }
    if (kind === 'cobranca') {
      return `<button type="button" class="btn btn-sm btn-action btn-charge" title="Lançar o valor recebido desta cobrança" data-pay="${o.key}" data-pay-mode="cobranca">${icon('circle-dollar-sign', 'i-sm')}Lançar recebimento</button>`;
    }
    return `<button type="button" class="btn btn-sm btn-action btn-pay" title="Lançar o pagamento realizado como despesa" data-pay="${o.key}" data-pay-mode="pagamento">${icon('check', 'i-sm')}Lançar pagamento</button>`;
  }

  function nextPrazoLabel(t, nd) {
    if (t.paused) return '<span class="tag paused">Pausada</span>';
    if (!nd) {
      const cur = doneOf(t.id, currentMonth());
      if (cur && (t.rec?.type === 'once' || !occursIn(t, addMonths(currentMonth(), 1)))) {
        return `<span class="tag st-paga">Concluída</span>`;
      }
      return '—';
    }
    const cur = currentMonth();
    if (nd.period > cur && occursIn(t, cur) && doneOf(t.id, cur)) {
      return `<span class="t-muted">Volta em ${monthLabel(nd.period)}</span>`;
    }
    const paidNote = doneOf(t.id, cur) && nd.period !== cur
      ? `<span class="tag st-paga">Ok neste mês</span> · `
      : '';
    return `${paidNote}${fullDate(nd.to)} ${statusTag(nd.status)}<div class="sheet-due">${esc(dueText(nd))}</div>`;
  }

  /* ---------- Compromissos: Pagamentos / Cobranças / Documentação ----------
     Mesma fonte de dados (state.tasks + state.taskDone). Separação só na tela:
     - situação do CADASTRO: Ativo / Pausado / Encerrado
     - situação de CADA MÊS: Pendente / Atrasada / Paga|Recebida|Concluída / Dispensada */

  const occSort = (a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || a.to.localeCompare(b.to)
    || a.task.title.localeCompare(b.task.title, 'pt-BR');
  const isMoneyDone = d => d && (d.status === 'paga' || d.status === 'cobrada');

  function cadastroTag(t) {
    if (t.paused) return '<span class="tag paused">Pausado</span>';
    const end = asMonth(t.end);
    if (end && end < currentMonth()) return '<span class="tag rec">Encerrado</span>';
    return '<span class="tag st-ativa">Ativo</span>';
  }

  function valueCell(o, plain = false) {
    const t = o.task, d = o.done;
    const m = v => plain ? money(v).replace(/^(-?\s*)R\$\s?/, '$1') : money(v);
    if (isMoneyDone(d) && d.amount != null) return `<span class="num">${m(d.amount)}</span>`;
    if (t.expected != null) return `<span class="num">${m(t.expected)}</span>`;
    const last = lastPaidAmount(t.id);
    return last != null
      ? `<span class="tag var">Variável</span> <span class="t-muted">último ${money(last)}</span>`
      : '<span class="tag var">Variável</span>';
  }

  /** Linha de baixo do prazo: quanto falta, ou quem registrou e quando. */
  function occNote(o) {
    const d = o.done;
    if (!d) return dueText(o);
    const what = d.status === 'dispensada' ? 'Dispensada' : d.status === 'concluida' ? 'Concluída' : 'Registrado';
    return `${what}${d.date ? ` em ${fullDate(d.date)}` : ''}${d.by ? ` por ${d.by}` : ''}`;
  }

  function occActions(o) {
    const d = o.done, kind = taskKind(o.task), t = o.task;
    let a = '';
    if (kind === 'documentacao' && t.docFileId) {
      a += `<button class="btn btn-sm" data-receipt="${t.docFileId}" title="Ver documento anexado">${icon('paperclip', 'i-sm')}Documento</button>`;
    }
    a += launchBtn(o);
    if (isMoneyDone(d) && d.receiptId) a += `<button class="btn btn-sm" data-receipt="${d.receiptId}" data-rtx="${d.txId}" title="Ver comprovante" aria-label="Ver comprovante">${icon('paperclip', 'i-sm')}Comprovante</button>`;
    if (d && d.status === 'concluida' && d.receiptId) a += `<button class="btn btn-sm" data-receipt="${d.receiptId}" title="Ver anexo da conclusão">${icon('paperclip', 'i-sm')}Conclusão</button>`;
    if (d) a += `<button class="icon-btn" data-undo="${o.key}" title="${d.status === 'dispensada' ? 'Reabrir' : 'Desfazer registro'}" aria-label="Desfazer">${icon('undo-2', 'i-sm')}</button>`;
    if (!d && kind !== 'pagamento') a += `<button class="icon-btn" data-skip="${o.key}" title="Dispensar neste mês" aria-label="Dispensar neste mês">${icon('ban', 'i-sm')}</button>`;
    return a;
  }

  function docAnexoCell(t) {
    if (!t?.docFileId) return '<span class="t-faint">—</span>';
    return `<button type="button" class="btn btn-sm" data-receipt="${t.docFileId}" title="Ver documento">${icon('paperclip', 'i-sm')}Anexo</button>`;
  }

  function adminTaskActions(t) {
    if (t.archived) return '';
    const once = (t.rec || {}).type === 'once', kind = taskKind(t);
    const editTitle = once ? 'Editar' : 'Editar o cadastro (vale para os próximos meses; registros já feitos não mudam)';
    return `<button class="icon-btn" data-edit-task="${t.id}" title="${editTitle}" aria-label="Editar">${icon('pencil-line', 'i-sm')}</button>`
      + (once || kind === 'pagamento' ? '' : `<button class="icon-btn" data-pause-task="${t.id}" title="${t.paused ? 'Retomar' : 'Pausar'}" aria-label="${t.paused ? 'Retomar' : 'Pausar'}">${icon(t.paused ? 'play' : 'pause', 'i-sm')}</button>`)
      + `<button class="icon-btn danger" data-del-task="${t.id}" title="Arquivar sem apagar o histórico" aria-label="Arquivar">${icon('archive', 'i-sm')}</button>`;
  }

  function emptyTasks(msg) {
    return `<div class="task-empty">${icon('check')}${msg}</div>`;
  }

  /** Ocorrência "principal" de uma documentação (prazo único). */
  function docOccurrence(t) {
    const r = t.rec || {};
    if (r.type === 'once') {
      const k = asMonth(r.dateTo || r.dateFrom || '');
      return k ? occurrence(t, k) : null;
    }
    return nextDue(t) || occurrence(t, currentMonth());
  }

  /** Tabela de ocorrências (mês, avulsos, documentação). */
  function occurrencesSheet(list, emptyMsg, { showMonth = false } = {}) {
    const kind = taskView, isDoc = kind === 'documentacao';
    if (!list.length) return emptyTasks(emptyMsg);
    const st = $('#tfStatus')?.value || 'all';
    const filtered = sortOcc(list.filter(o => taskMatchesFilters(o.task) && (isDoc || st === 'all' || o.status === st)));
    if (!filtered.length) return `<div class="task-empty">${icon('search')}Nada com esses filtros.</div>`;
    const rows = pageSlice(filtered).map(o => {
      const t = o.task;
      return `<tr class="occ-row st-${o.status}">
        <td class="sheet-cell sheet-title">${esc(t.title)}<div class="sheet-due">${esc(recLabel(t))}${t.account && !isDoc ? ` · ${esc(accName(t.account))}` : ''}</div></td>
        <td class="sheet-cell occ-target">${esc(taskTarget(t))}</td>
        ${isDoc ? '' : `<td class="sheet-cell t-right occ-val">${valueCell(o, true)}</td>`}
        ${isDoc ? '' : `<td class="sheet-cell occ-month">${monthLabel(o.period)}</td>`}
        <td class="sheet-cell occ-due"><strong>${windowLabel(o)}</strong><div class="sheet-due">${esc(occNote(o))}</div></td>
        <td class="sheet-cell">${statusTag(o.status)}</td>
        ${isDoc ? `<td class="sheet-cell">${docAnexoCell(t)}</td>` : ''}
        <td class="sheet-cell occ-issuer">${esc(taskIssuer(t)) || '—'}</td>
        <td class="sheet-cell"><div class="sheet-actions">${occActions(o)}${adminTaskActions(t)}</div></td>
      </tr>`;
    }).join('');
    return `<div class="table-wrap sheet-wrap occ-wrap"><table class="sheet occ-sheet">
      <thead><tr>
        ${sortTh('title', isDoc ? 'Pendência' : 'Conta')}${sortTh('target', PERSON_COL[kind])}
        ${isDoc ? '' : sortTh('value', 'Valor (R$)', 't-right')}${isDoc ? '' : sortTh('period', 'Mês', 'col-month')}
        ${sortTh('due', 'Prazo')}${sortTh('status', 'Situação')}${isDoc ? '<th>Anexos</th>' : ''}${sortTh('issuer', 'Cadastrado por', 'col-issuer')}<th>Ação</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>${taskPagerHtml(filtered.length)}`;
  }

  /** Recorrentes: o cadastro + como está o mês escolhido + próximo vencimento. */
  function recurringSheet() {
    const kind = taskView;
    const all = state.tasks.filter(t => !t.archived && taskKind(t) === kind && (t.rec || {}).type !== 'once');
    if (!all.length) return emptyTasks(kind === 'cobranca' ? 'Nenhuma cobrança recorrente cadastrada.' : 'Nenhum pagamento recorrente cadastrado.');
    const st = $('#tfStatus')?.value || 'all';
    const list = all.filter(taskMatchesFilters).filter(t => {
      if (st === 'all') return true;
      return occursIn(t, period) && occurrence(t, period).status === st;
    }).sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
    if (!list.length) return `<div class="task-empty">${icon('search')}Nada com esses filtros.</div>`;
    const rows = pageSlice(list).map(t => {
      const occ = occursIn(t, period) ? occurrence(t, period) : null;
      let next = null;
      for (let i = 1; i <= 24 && !next; i++) {
        const m = addMonths(period, i);
        if (occursIn(t, m)) next = occurrence(t, m);
      }
      const monthCell = occ
        ? `${statusTag(occ.status)}<div class="sheet-due">${esc(occNote(occ))}</div>`
        : '<span class="t-muted">Não vence neste mês</span>';
      const valueO = occ || { task: t, done: null };
      return `<tr class="${occ ? `occ-row st-${occ.status}` : ''}">
        <td class="sheet-cell sheet-title">${esc(t.title)}<div class="sheet-due">${esc(recLabel(t))}${t.rec?.type === 'weekly' ? '' : ` · ${t.rec?.dayFrom === t.rec?.dayTo || !t.rec?.dayTo ? `dia ${t.rec?.dayFrom}` : `dias ${t.rec.dayFrom}–${t.rec.dayTo}`}`}</div></td>
        <td class="sheet-cell">${esc(taskTarget(t))}</td>
        <td class="sheet-cell t-right">${valueCell(valueO)}</td>
        <td class="sheet-cell">${cadastroTag(t)}</td>
        <td class="sheet-cell">${monthCell}</td>
        <td class="sheet-cell">${t.paused ? '<span class="t-muted">—</span>' : next ? `${monthLabel(next.period)}<div class="sheet-due">${fullDate(next.to)}</div>` : '<span class="t-muted">Sem próximo</span>'}</td>
        <td class="sheet-cell"><div class="sheet-actions">${occ ? occActions(occ) : ''}${adminTaskActions(t)}</div></td>
      </tr>`;
    }).join('');
    return `<div class="table-wrap sheet-wrap"><table class="sheet">
      <thead><tr>
        <th>Conta</th><th>${PERSON_COL[kind]}</th><th class="t-right">Valor</th><th>Cadastro</th>
        <th>${esc(monthLabel(period))}</th><th>Próximo vencimento</th><th>Ação</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>${taskPagerHtml(list.length)}`;
  }

  /** Ocorrências do mês escolhido (+ atrasadas de meses anteriores, se for o mês atual). */
  function monthOccurrences(kind, k = period) {
    const prev = k === currentMonth() ? overdueBefore(k) : [];
    return [...prev, ...occurrencesIn(k)].filter(o => taskKind(o.task) === kind);
  }

  /**
   * Área de trabalho: atrasados + o que ainda falta neste mês + o mês seguinte.
   * Se a recorrência deste mês já foi concluída, a próxima ocorrência só volta
   * quando o mês virar, evitando que a mesma conta pareça pendente novamente.
   */
  function openOccurrences(kind) {
    const cur = currentMonth();
    const next = addMonths(cur, 1);
    const old = overdueBefore(cur);
    const current = occurrencesIn(cur);
    const upcoming = occurrencesIn(next).filter(o => {
      if ((o.task.rec || {}).type === 'weekly') {
        return !current.some(c => c.task.id === o.task.id && !c.done);
      }
      const currentDone = occursIn(o.task, cur) && doneOf(o.task.id, cur);
      return !currentDone;
    });
    return [...old, ...current, ...upcoming]
      .filter(o => taskKind(o.task) === kind && !o.done)
      .filter((o, i, arr) => arr.findIndex(x => x.key === o.key) === i);
  }

  /** Histórico real de baixas, sem recriar ou duplicar lançamentos. */
  function completedOccurrences(kind) {
    const completedStatus = kind === 'cobranca' ? 'cobrada' : 'paga';
    return state.taskDone
      .filter(d => d.status === completedStatus)
      .map(d => {
        const t = taskById(d.taskId);
        return t && taskKind(t) === kind ? occurrence(t, d.period) : null;
      })
      .filter(Boolean)
      .sort((a, b) => `${b.done?.date || b.to} ${b.done?.time || ''}`.localeCompare(`${a.done?.date || a.to} ${a.done?.time || ''}`));
  }

  function kpi(label, value, foot, cls = '', ico = '') {
    return `<div class="kpi">${ico ? `<span class="kpi-ico ${ico.split(':')[0]}">${icon(ico.split(':')[1])}</span>` : ''}<div class="kpi-txt"><div class="kpi-label">${label}</div><div class="kpi-value num ${cls}">${value}</div><div class="kpi-foot">${foot}</div></div></div>`;
  }

  function renderTaskKpis() {
    const kind = taskView;
    if (kind === 'documentacao') {
      const docs = state.tasks.filter(t => !t.archived || state.taskDone.some(d => d.taskId === t.id)).filter(t => taskKind(t) === kind).map(docOccurrence).filter(Boolean);
      const late = docs.filter(o => o.status === 'atrasada').length;
      const pend = docs.filter(o => !o.done && o.status !== 'atrasada').length;
      const done = docs.filter(o => o.done && o.done.status === 'concluida').length;
      $('#taskKpis').innerHTML = kpi('Pendentes', pend, 'dentro do prazo')
        + kpi('Atrasadas', late, late ? 'prazo já terminou' : 'nada atrasado', late ? 'delta-neg' : '')
        + kpi('Concluídas', done, 'com data e responsável')
        + kpi('Cadastradas', docs.length, 'no total');
      return;
    }
    const isCharge = kind === 'cobranca';
    const all = monthOccurrences(kind);
    const inMonthL = all.filter(o => o.period === period && o.status !== 'dispensada');
    const late = all.filter(o => o.status === 'atrasada');
    const done = inMonthL.filter(o => isMoneyDone(o.done));
    const openInMonth = inMonthL.filter(o => !o.done);
    // No mês atual, "a pagar" é o mesmo que a aba "A fazer" (atrasados + este mês + próximo mês)
    const open = period === currentMonth()
      ? openOccurrences(kind).filter(o => o.status !== 'dispensada')
      : inMonthL.filter(o => !o.done);
    const exp = l => l.reduce((s, o) => s + (o.task.expected || 0), 0);
    const doneSum = done.reduce((s, o) => s + (o.done.amount || 0), 0);
    const vars = open.filter(o => o.task.expected == null).length;
    const mes = monthLabel(period).split(' ')[0].toLowerCase();
    const n = (c, s, p) => `${c} ${c === 1 ? s : p}`;
    $('#taskKpis').innerHTML =
      kpi(isCharge ? 'Previsto a receber no mês' : 'Previsto no mês', money(doneSum + exp(openInMonth)),
        `${n(done.length + openInMonth.length, isCharge ? 'cobrança' : 'conta', isCharge ? 'cobranças' : 'contas')}`, '', 'is-blue:cat-coins')
      + kpi(isCharge ? 'Já recebido' : 'Já pago', money(doneSum),
        `${n(done.length, 'registro', 'registros')} em ${mes}`, 'delta-pos', 'is-green:check')
      + kpi(isCharge ? 'A receber' : 'A pagar', money(exp(open)),
        `${n(open.length, 'pendente', 'pendentes')}${vars ? ` · ${n(vars, 'variável', 'variáveis')}` : ''}`, '', 'is-red:ph-calendar-blank')
      + kpi('Atrasados', n(late.length, isCharge ? 'cobrança' : 'pagamento', isCharge ? 'cobranças' : 'pagamentos'),
        late.length ? `${money(exp(late))} previstos` : 'nada atrasado', late.length ? 'delta-neg' : '', 'is-red:clock');
  }

  function syncTaskToolbar() {
    const kind = taskView, isDoc = kind === 'documentacao';
    const sel = $('#tfStatus');
    const statusContext = `${kind}:${taskTab}`;
    if (sel && sel.dataset.kind !== statusContext) {
      const cur = sel.value;
      const opts = taskTab === 'open'
        ? ['atrasada', 'hoje', 'aberta', 'futura']
        : taskTab === 'done'
          ? [kind === 'cobranca' ? 'cobrada' : 'paga']
          : STATUS_BY_KIND[kind];
      sel.innerHTML = '<option value="all">Todas</option>'
        + opts.map(s => `<option value="${s}">${STATUS_LABEL[s]}</option>`).join('');
      sel.value = opts.includes(cur) ? cur : 'all';
      sel.dataset.kind = statusContext;
    }
    $('#tfStatusField').hidden = isDoc;
    $('#tfMore').hidden = isDoc;
    $('#taskFilters').classList.toggle('is-doc', isDoc);
    $('#tfFreqField').hidden = taskTab === 'once';
    $('#taskNewBtn span').textContent = NEW_LABEL[kind];
    $('#tq').placeholder = isDoc ? 'Buscar pendência ou responsável...' : 'Buscar conta, pessoa ou conta bancária...';
    const counts = isDoc ? {} : {
      open: openOccurrences(kind).filter(o => o.status !== 'dispensada').length,
      done: completedOccurrences(kind).length,
    };
    $('#taskTabs').innerHTML = TASK_TABS[kind]
      .map(([id, label]) => `<button type="button" data-ttab="${id}" class="${id === taskTab ? 'on' : ''}">${label}${counts[id] != null ? ` (${counts[id]})` : ''}</button>`).join('');
  }

  function renderTasks() {
    const kind = taskView;
    if (!TASK_TABS[kind].some(([id]) => id === taskTab)) taskTab = TASK_TABS[kind][0][0];
    taskTabs[kind] = taskTab;
    syncTaskToolbar();
    renderTaskKpis();
    renderDueBanner();
    let html;
    if (kind === 'documentacao') {
      const docs = state.tasks.filter(t => !t.archived || state.taskDone.some(d => d.taskId === t.id)).filter(t => taskKind(t) === kind).map(docOccurrence).filter(Boolean).sort(occSort);
      const pick = {
        pend: docs.filter(o => !o.done && o.status !== 'atrasada'),
        late: docs.filter(o => o.status === 'atrasada'),
        done: docs.filter(o => o.done),
        all: docs,
      }[taskTab];
      const empty = { pend: 'Nenhuma pendência no prazo.', late: 'Nenhuma documentação atrasada.', done: 'Nada concluído ainda.', all: 'Nenhuma documentação cadastrada. Clique em “Nova pendência”.' }[taskTab];
      html = occurrencesSheet(pick, empty, { showMonth: false });
    } else if (taskTab === 'open') {
      const list = openOccurrences(kind).sort(occSort);
      const next = monthLabel(addMonths(currentMonth(), 1));
      const label = kind === 'cobranca' ? 'a receber' : 'a pagar';
      void next;
      html = occurrencesSheet(list, `Nada ${label} neste mês nem no próximo.`, { showMonth: true });
    } else if (taskTab === 'done') {
      html = occurrencesSheet(completedOccurrences(kind), kind === 'cobranca' ? 'Nenhum recebimento concluído.' : 'Nenhum pagamento concluído.', { showMonth: true });
    } else if (taskTab === 'rec') {
      html = recurringSheet();
    } else if (taskTab === 'once') {
      const list = state.tasks
        .filter(t => !t.archived && taskKind(t) === kind && (t.rec || {}).type === 'once')
        .map(t => { const k = asMonth(t.rec.dateTo || t.rec.dateFrom || ''); return k ? occurrence(t, k) : null; })
        .filter(Boolean).sort(occSort);
      html = occurrencesSheet(list, kind === 'cobranca' ? 'Nenhuma cobrança avulsa.' : 'Nenhum pagamento avulso.', { showMonth: true });
    } else {
      const list = monthOccurrences(kind).sort(occSort);
      html = occurrencesSheet(list, `Nada ${kind === 'cobranca' ? 'a receber' : 'a pagar'} em ${monthLabel(period).toLowerCase()}.`);
    }
    $('#taskBody').innerHTML = html;
  }

  function renderPending() {
    const list = pendingNow();
    const late = list.filter(o => o.status === 'atrasada').length;
    $('#pendingMeta').textContent = list.length ? `${late} atrasado${late === 1 ? '' : 's'} · ${list.length - late} em aberto` : 'Tudo em dia';
    $('#pendingList').innerHTML = list.length
      ? groupedRows(list.slice(0, 5)) + (list.length > 5 ? `<div class="task-empty" style="padding:12px"><button class="link" data-go="${VIEW_OF_KIND[taskKind(list[5].task)]}">Ver mais ${list.length - 5}</button></div>` : '')
      : `<div class="task-empty">${icon('check')}Nenhuma pendência. Tudo em dia.</div>`;

    // Resumo por tipo, cada um leva à sua tela
    const cur = currentMonth();
    const sumBox = $('#commitSum');
    if (sumBox) {
      const card = (kind, label, ico) => {
        const open = monthOccurrences(kind, cur).filter(o => !o.done && o.status !== 'dispensada');
        const lateN = open.filter(o => o.status === 'atrasada').length;
        const total = open.reduce((s, o) => s + (o.task.expected || 0), 0);
        const foot = kind === 'documentacao'
          ? (lateN ? `${lateN} atrasada${lateN === 1 ? '' : 's'}` : 'nenhuma atrasada')
          : `${money(total)}${lateN ? ` · ${lateN} atrasado${lateN === 1 ? '' : 's'}` : ''}`;
        return `<button type="button" class="commit-card ${lateN ? 'is-late' : ''}" data-go="${VIEW_OF_KIND[kind]}">
          <span class="commit-ico">${icon(ico)}</span>
          <span class="commit-txt"><span class="commit-label">${label}</span><strong>${open.length}</strong><small>${foot}</small></span>
        </button>`;
      };
      sumBox.innerHTML = card('pagamento', 'Pagamentos a vencer', 'credit-card')
        + card('cobranca', 'Cobranças a receber', 'circle-dollar-sign')
        + card('documentacao', 'Documentos pendentes', 'file-text');
    }

    $$('[data-task-badge]').forEach(b => {
      const k = b.dataset.taskBadge;
      // Igual à aba "A fazer": atrasados + este mês + próximo mês ainda sem baixa
      const aFazer = kk => openOccurrences(kk).filter(o => o.status !== 'dispensada');
      const mine = k && k !== 'all' ? aFazer(k) : ['pagamento', 'cobranca', 'documentacao'].flatMap(aFazer);
      b.hidden = !mine.length;
      b.textContent = mine.length;
      b.classList.toggle('soft', !mine.some(o => o.status === 'atrasada'));
    });
  }

  function applyRole() {
    // Admin e Editor veem os mesmos botões; só a Auditoria continua exclusiva do Admin.
    $$('[data-admin-only]').forEach(el => el.classList.toggle('is-hidden', !canOperate()));
    $('#taskEditorNote').hidden = true;
  }

  /* ---------- Formulário de programação (admin) ---------- */
  function taskFormType() { return $('#tkRepeat')?.value || 'monthly'; }
  function taskFormKind() {
    const v = $('#tkKind')?.value;
    return v === 'documentacao' || v === 'cobranca' ? v : 'pagamento';
  }
  const TK_FIELDS = {
    pagamento: {
      title: 'O que precisa ser pago',
      titlePh: 'Ex.: Netflix, Aluguel, Conta de luz',
      person: 'Quem recebe',
      personPh: 'Nome de quem recebe o pagamento',
      day: 'Dia do pagamento',
      onceFrom: 'Pagar a partir de',
      onceTo: 'Até (vencimento)',
      notes: 'Instruções para quem vai pagar',
    },
    documentacao: {
      title: 'Qual documento ou pendência precisa ser resolvido?',
      titlePh: 'Ex.: Renovação de certificado digital',
      person: 'Responsável por resolver',
      personPh: 'Nome da pessoa responsável',
      day: 'Prazo da documentação',
      onceFrom: 'Resolver a partir de',
      onceTo: 'Até (prazo final)',
      notes: 'Detalhes da documentação',
    },
    cobranca: {
      title: 'O que será cobrado?',
      titlePh: 'Ex.: Serviço prestado, Aluguel, Empréstimo',
      person: 'Quem será cobrado',
      personPh: 'Nome da pessoa ou empresa devedora',
      day: 'Dia da cobrança',
      onceFrom: 'Cobrar a partir de',
      onceTo: 'Até (vencimento)',
      notes: 'Instruções da cobrança',
    },
  };

  function updateTaskForm() {
    const kind = taskFormKind();
    const isDoc = kind === 'documentacao';
    // Documentação continua com prazo único; pagamento e cobrança usam o fluxo progressivo.
    const type = isDoc ? 'once' : taskFormType();
    const f = TK_FIELDS[kind];

    $$('[data-tk-kind]').forEach(el => {
      const allowed = (el.getAttribute('data-tk-kind') || '').split(/\s+/);
      el.hidden = !allowed.includes(kind);
    });
    $$('[data-tk-when]').forEach(el => { el.hidden = isDoc; });
    $$('[data-tk="rec"]').forEach(el => { el.hidden = isDoc || type === 'once'; });
    $$('[data-tk="once"]').forEach(el => { el.hidden = !(isDoc || type === 'once'); });
    $$('[data-tk="year"]').forEach(el => { el.hidden = isDoc || type !== 'yearly'; });
    $$('[data-tk="day-choice"]').forEach(el => { el.hidden = isDoc || (type !== 'monthly' && type !== 'yearly'); });
    $$('[data-tk="month-day"]').forEach(el => { el.hidden = isDoc || (type !== 'monthly' && type !== 'yearly'); });
    $$('[data-tk="week-day"]').forEach(el => { el.hidden = isDoc || type !== 'weekly'; });

    const fixedDay = $('input[name="tkDayMode"]:checked').value === 'fixed';
    $$('[data-range-part]').forEach(el => { el.hidden = fixedDay; });
    $('#tkDayFrom').setAttribute('aria-label', fixedDay ? 'Dia fixo' : 'Do dia');

    $('#tkNameLabel').textContent = f.title;
    $('#tkName').placeholder = f.titlePh;
    $('#tkPersonLabel').textContent = f.person;
    $('#tkPerson').placeholder = isDoc
      ? 'Escolha quem está logado ou digite outro nome'
      : f.personPh;
    $('#tkPerson').required = true;
    // Documentação: lista de pessoas (inclui logado). Pagamento/Cobrança: recebedores.
    $('#tkPerson').setAttribute('list', isDoc ? 'peopleList' : 'payeeList');
    $('#tkPersonHint').hidden = !isDoc;
    $('#tkProgramTitle').textContent = kind === 'cobranca' ? 'Programação da cobrança' : 'Programação do pagamento';
    $('#tkRepeat').previousElementSibling.textContent = kind === 'cobranca' ? 'Com que frequência será cobrado?' : 'Com que frequência será pago?';
    $('#tkDayLabel').textContent = kind === 'cobranca' ? 'Quando deve cobrar?' : 'Quando deve pagar?';
    $('#tkMonthDayLabel').textContent = fixedDay ? 'Dia do mês' : 'Período do mês';
    $('#tkDaySuffix').textContent = type === 'yearly' ? 'no mês selecionado' : 'de cada mês';
    $('#tkWeekdayLabel').textContent = kind === 'cobranca' ? 'Em qual dia da semana deve cobrar?' : 'Em qual dia da semana deve pagar?';
    $('#tkDateFromLabel').textContent = f.onceFrom;
    $('#tkDateToLabel').textContent = f.onceTo;
    $('#tkNotesLabel').innerHTML = `${f.notes} <span class="opt">(opcional)</span>`;

    const varies = kind === 'pagamento' && $('#tkVaries').checked;
    if ($('#tkAmount')) {
      $('#tkAmount').disabled = varies;
      $('#tkAmount').required = kind === 'pagamento' && !varies;
      if (varies) $('#tkAmount').value = '';
    }
    if ($('#tkChargeAmount')) $('#tkChargeAmount').required = kind === 'cobranca';
    if ($('#tkDocCreated') && !$('#tkDocCreated').value) $('#tkDocCreated').value = todayISO();

    let timing = '';
    if (!isDoc && (type === 'monthly' || type === 'yearly')) {
      const fixed = $('input[name="tkDayMode"]:checked').value === 'fixed';
      const df = +$('#tkDayFrom').value || 1, dt = fixed ? df : (+$('#tkDayTo').value || df);
      const monthName = MONTHS_FULL[+$('#tkMonth').value - 1]?.toLowerCase();
      const days = df === dt
        ? `todo dia ${String(df).padStart(2, '0')}`
        : `entre os dias ${String(Math.min(df, dt)).padStart(2, '0')} e ${String(Math.max(df, dt)).padStart(2, '0')}`;
      const cadence = type === 'yearly' ? `${days} de ${monthName} de cada ano` : `${days} de cada mês`;
      const st = $('#tkStart').value, en = $('#tkEnd').value;
      timing = `${cadence}${st ? `, a partir de ${monthLabel(st).toLowerCase()}` : ''}, ${en ? `até ${monthLabel(en).toLowerCase()}` : 'sem data de término'}`;
    } else if (!isDoc && type === 'weekly') {
      const st = $('#tkStart').value, en = $('#tkEnd').value;
      timing = `toda ${WEEKDAYS[+$('#tkWeekday').value]}${st ? `, a partir de ${monthLabel(st).toLowerCase()}` : ''}, ${en ? `até ${monthLabel(en).toLowerCase()}` : 'sem data de término'}`;
    } else {
      const a = $('#tkDateFrom').value, b = $('#tkDateTo').value;
      timing = a && b && a === b ? `uma única vez em ${fullDate(a)}` : a && b ? `uma única vez, de ${fullDate(a)} até ${fullDate(b)}` : b ? `uma única vez, até ${fullDate(b)}` : a ? `uma única vez, a partir de ${fullDate(a)}` : 'uma única vez, em data a definir';
    }
    let txt;
    if (kind === 'documentacao') {
      const subject = $('#tkName')?.value.trim() || KIND_LABEL[kind];
      const person = $('#tkPerson')?.value.trim() || '';
      const created = $('#tkDocCreated')?.value;
      txt = `Documentação: ${subject}${person ? ` — responsável: ${person}` : ''}.${created ? ` Cadastrada em ${fullDate(created)}.` : ''} Resolver ${timing}. Sem valor financeiro.`;
    } else {
      txt = `${kind === 'cobranca' ? 'Cobrar' : 'Pagar'} ${timing}.`;
    }
    $('#tkSummary').innerHTML = `${icon('info', 'i-sm')}<span>${esc(txt)}</span>`;
  }

  /** Opções YYYY-MM com rótulo em português (ex.: Novembro 2026). */
  function monthSelectOptions(selected, { allowEmpty = false, emptyLabel = 'Sem fim' } = {}) {
    const now = currentMonth();
    const keys = [];
    for (let i = -24; i <= 60; i++) keys.push(addMonths(now, i));
    if (selected && !keys.includes(selected)) keys.push(selected);
    keys.sort();
    const opts = keys.map(k => `<option value="${k}" ${k === selected ? 'selected' : ''}>${monthLabel(k)}</option>`).join('');
    return allowEmpty
      ? `<option value="">${emptyLabel}</option>${opts}`
      : opts;
  }

  function fillTaskForm(id) {
    const t = id ? taskById(id) : null;
    const kind = t ? taskKind(t) : taskView;
    const taskModal = $('#modal-task');
    taskModal.classList.remove('is-payment', 'is-charge', 'is-document');
    taskModal.classList.add(kind === 'documentacao' ? 'is-document' : kind === 'cobranca' ? 'is-charge' : 'is-payment');
    $('#tkTitle').textContent = t ? `Editar ${KIND_LABEL[kind].toLowerCase()}` : NEW_LABEL[kind];
    $('#tkSubtitle').textContent = kind === 'cobranca'
      ? 'Cadastre somente os dados da cobrança e de quem deverá pagar'
      : kind === 'documentacao'
        ? 'Cadastre somente a pendência, o responsável e o prazo final'
        : 'Cadastre somente os dados da conta que deverá ser paga';
    $('#tkSubmit').textContent = t ? 'Salvar alterações' : 'Cadastrar';
    $('#tkCat').innerHTML = CATEGORIES.expense.map(c => `<option>${c}</option>`).join('');
    $('#tkMonth').innerHTML = MONTHS_FULL.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');
    const dayOptions = Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}">${String(i + 1).padStart(2, '0')}</option>`).join('');
    $('#tkDayFrom').innerHTML = dayOptions;
    $('#tkDayTo').innerHTML = dayOptions;
    const r = t?.rec || {};
    $('#tkId').value = t?.id || '';
    $('#tkKind').value = kind;
    $('#tkName').value = t?.title || '';
    const person = kind === 'documentacao'
      ? (t?.docOwner || (!t ? (userName || '') : ''))
      : kind === 'cobranca' ? (t?.chargeTo || t?.payee || '')
      : (t?.payee || '');
    $('#tkPerson').value = person;
    $('#tkCat').value = t?.category || 'Outros';
    $('#tkAcc').value = kind === 'pagamento' ? (t?.account || '') : '';
    $('#tkVaries').checked = kind === 'pagamento' && !!t && t.expected == null;
    setMoney('#tkAmount', kind === 'pagamento' ? t?.expected : null);
    $('#tkDocCreated').value = (t?.createdAt && String(t.createdAt).slice(0, 10)) || todayISO();
    setMoney('#tkChargeAmount', kind === 'cobranca' ? t?.expected : null);
    $('#tkChargeAcc').value = kind === 'cobranca' ? (t?.account || '') : '';
    $('#tkRepeat').value = kind === 'documentacao' ? 'once'
      : r.type === 'weekly' ? 'weekly' : r.type === 'yearly' ? 'yearly' : r.type === 'once' ? 'once' : 'monthly';
    $('#tkMonth').value = r.month || (+currentMonth().slice(5));
    $('#tkWeekday').value = r.dayOfWeek ?? 1;
    $('#tkDayFrom').value = r.dayFrom || 1;
    $('#tkDayTo').value = r.dayTo || r.dayFrom || 1;
    $(t && r.type !== 'once' && r.type !== 'weekly' && r.dayFrom !== r.dayTo ? '#tkDayRange' : '#tkDayFixed').checked = true;
    const start = t?.start || currentMonth();
    const end = t?.end || '';
    $('#tkStart').innerHTML = monthSelectOptions(start);
    $('#tkEnd').innerHTML = monthSelectOptions(end, { allowEmpty: true, emptyLabel: 'Sem fim' });
    $('#tkStart').value = start;
    $('#tkEnd').value = end;
    $('#tkDateFrom').value = r.dateFrom || todayISO();
    $('#tkDateTo').value = r.dateTo || (kind === 'documentacao' ? '' : addDays(todayISO(), 5));
    $('#tkNotes').value = t?.notes || '';
    uploads.taskDoc?.reset();
    const keepDoc = $('#tkKeepDoc');
    if (keepDoc) {
      keepDoc.hidden = !(kind === 'documentacao' && t?.docFileId);
      keepDoc.dataset.receiptId = t?.docFileId || '';
      keepDoc.dataset.removed = '0';
      keepDoc.querySelector('[data-tk-doc-name]')?.replaceChildren(
        document.createTextNode(t?.docFileId ? 'Documento já anexado' : ''),
      );
    }
    updateTaskForm();
  }

  async function saveTaskForm() {
    const kind = taskFormKind();
    const isDoc = kind === 'documentacao';
    const type = isDoc ? 'once' : taskFormType();
    const person = $('#tkPerson').value.trim();
    if (!$('#tkName').value.trim()) { alert('Preencha o título da programação.'); return; }
    if (!person) { alert(`Informe ${TK_FIELDS[kind].person.toLowerCase()}.`); return; }

    let expected = null;
    let account = null;
    let category = 'Outros';
    let payee = '';
    let chargeTo = '';
    let docOwner = '';

    if (kind === 'pagamento') {
      const varies = $('#tkVaries').checked;
      expected = varies ? null : Math.round(moneyVal('#tkAmount') * 100) / 100;
      if (!varies && !(expected > 0)) {
        alert('Informe o valor previsto ou marque “Valor varia todo mês”.');
        return;
      }
      payee = person;
      account = $('#tkAcc').value || null;
      category = $('#tkCat').value || 'Outros';
    } else if (kind === 'cobranca') {
      expected = Math.round(moneyVal('#tkChargeAmount') * 100) / 100;
      if (!(expected > 0)) { alert('Informe o valor a receber.'); return; }
      chargeTo = person;
      account = $('#tkChargeAcc').value || null;
    } else {
      docOwner = person;
    }

    let rec, start;
    if (type === 'once') {
      let a = $('#tkDateFrom').value, b = $('#tkDateTo').value;
      if (isDoc && a && !b) b = a;
      if (isDoc && b && !a) a = b;
      if (!a || !b) { alert(isDoc ? 'Informe o prazo da documentação.' : 'Informe datas válidas para o período.'); return; }
      if (a > b) [a, b] = [b, a];
      rec = { type: 'once', dateFrom: a, dateTo: b };
      start = ym(a);
    } else if (type === 'weekly') {
      start = $('#tkStart').value || currentMonth();
      rec = { type: 'weekly', dayOfWeek: +$('#tkWeekday').value };
      const end = $('#tkEnd').value;
      if (end && end < start) { alert('“Termina em” não pode ser antes de “Começa em”.'); return; }
    } else {
      const fixed = $('input[name="tkDayMode"]:checked').value === 'fixed';
      let df = Math.min(Math.max(+$('#tkDayFrom').value || 1, 1), 31), dt = fixed ? df : Math.min(Math.max(+$('#tkDayTo').value || df, 1), 31);
      if (df > dt) [df, dt] = [dt, df];
      start = $('#tkStart').value || currentMonth();
      rec = type === 'yearly'
        ? { type: 'yearly', every: 12, month: +$('#tkMonth').value, dayFrom: df, dayTo: dt }
        : { type: 'monthly', every: 1, dayFrom: df, dayTo: dt };
      const end = $('#tkEnd').value;
      if (end && end < start) { alert('“Termina em” não pode ser antes de “Começa em”.'); return; }
    }
    const data = {
      kind,
      title: $('#tkName').value.trim(),
      payee,
      payeeKind: 'empresa',
      chargeTo,
      docOwner,
      category,
      account,
      expected, rec, start,
      end: type === 'once' ? null : ($('#tkEnd').value || null),
      notes: $('#tkNotes').value.trim(),
    };
    const id = $('#tkId').value;
    const prev = id ? { ...taskById(id) } : null;
    const taskId = id || uid();
    const keepDoc = $('#tkKeepDoc');
    const removedDoc = isDoc && keepDoc?.dataset.removed === '1';
    const oldDocId = prev?.docFileId || null;
    let docFileId = isDoc
      ? (removedDoc ? null : (oldDocId || null))
      : (prev?.docFileId || null);
    const created = id ? null : {
      id: taskId, ...data, paused: false, archived: false, docFileId: null,
      createdBy: userId || null,
      createdByName: userName || 'Usuário',
      createdAt: new Date().toISOString(),
    };
    if (id) Object.assign(taskById(id), data, { updatedAt: new Date().toISOString(), updatedBy: userName || 'Usuário' });
    else state.tasks.push(created);
    if (data.payee) rememberPayee(data.payee);
    if (data.chargeTo) rememberPayee(data.chargeTo);
    if (data.docOwner) rememberPerson(data.docOwner);
    const submit = $('#tkSubmit');
    const oldHtml = submit.innerHTML;
    submit.disabled = true; submit.textContent = 'Salvando…';
    refresh();
    try {
      await saveConfirmed();
      if (isDoc) {
        const file = uploads.taskDoc?.file;
        if (file) {
          docFileId = await FPComprovantes.put(file, taskId, 'tarefa');
          const t = taskById(taskId);
          if (t) t.docFileId = docFileId;
          if (oldDocId && oldDocId !== docFileId) FPComprovantes.del(oldDocId);
          uploads.taskDoc?.reset();
        } else if (removedDoc && oldDocId) {
          FPComprovantes.del(oldDocId);
          const t = taskById(taskId);
          if (t) t.docFileId = null;
        }
      }
      closeModals();
      refresh();
    } catch (e) {
      if (prev) Object.assign(taskById(id), prev);
      else state.tasks = state.tasks.filter(t => t.id !== taskId);
      if (docFileId && docFileId !== oldDocId) FPComprovantes.del(docFileId);
      refresh();
      alert(e instanceof Error ? e.message : 'Não foi possível salvar a programação.');
    } finally {
      submit.disabled = false; submit.innerHTML = oldHtml;
    }
  }

  /* ---------- Lançar programação (pagamento / documentação / cobrança) ---------- */
  function openPay(key, modeHint) {
    const [taskId, k] = key.split('|');
    const t = taskById(taskId);
    if (!t) return;
    if (doneOf(taskId, k)) { alert(k.length === 10 ? `Este item já foi lançado em ${fullDate(k)}.` : 'Este item já foi lançado neste mês.'); return; }
    const mode = modeHint || taskKind(t);
    if (mode !== 'documentacao' && !state.accounts.length) {
      alert(mode === 'cobranca' ? 'Cadastre uma conta antes de lançar a cobrança.' : 'Cadastre uma conta antes de dar baixa.');
      return;
    }
    const o = occurrence(t, k);
    $('#pyMode').value = mode;
    const payModal = $('#modal-pay');
    payModal.classList.remove('is-payment', 'is-charge', 'is-document');
    payModal.classList.add(mode === 'documentacao' ? 'is-document' : mode === 'cobranca' ? 'is-charge' : 'is-payment');
    $('#pyTitle').textContent = mode === 'documentacao' ? 'Registrar conclusão da documentação'
      : mode === 'cobranca' ? 'Lançar recebimento da cobrança' : 'Lançar pagamento realizado';
    $('#pySubtitle').textContent = mode === 'documentacao' ? 'Informe quando e por quem a pendência foi concluída'
      : mode === 'cobranca' ? 'Informe os dados do valor que entrou na conta' : 'Informe os dados do valor que saiu da conta';
    $('#pySubmit').innerHTML = `<svg class="i i-sm"><use href="#i-check"/></svg>${mode === 'documentacao' ? 'Registrar conclusão' : mode === 'cobranca' ? 'Lançar recebimento' : 'Lançar pagamento'}`;
    $('#payEffect').innerHTML = mode === 'documentacao'
      ? `${icon('info', 'i-sm')}<span>Esta ação marcará a pendência como concluída e registrará a data e o responsável.</span>`
      : mode === 'cobranca'
        ? `${icon('info', 'i-sm')}<span>Ao confirmar, a cobrança será marcada como recebida e uma <strong>receita</strong> será criada em Lançamentos na conta escolhida.</span>`
        : `${icon('info', 'i-sm')}<span>Ao confirmar, a conta será marcada como paga e uma <strong>despesa</strong> será criada em Lançamentos, reduzindo o saldo da conta escolhida.</span>`;
    $$('[data-py="pagamento"]').forEach(el => { el.hidden = mode !== 'pagamento'; });
    $$('[data-py="cobranca"]').forEach(el => { el.hidden = mode !== 'cobranca'; });
    $$('[data-py="documentacao"]').forEach(el => { el.hidden = mode !== 'documentacao'; });
    $('#pyAmount').required = mode === 'pagamento';
    $('#pyAcc').required = mode === 'pagamento';
    $('#pyTime').required = mode === 'pagamento';
    $('#pyPayee').required = mode === 'pagamento';
    $('#pyChargeAmount').required = mode === 'cobranca';
    $('#pyChargeAcc').required = mode === 'cobranca';
    $('#pyChargeTime').required = mode === 'cobranca';
    $('#pyChargeTo').required = mode === 'cobranca';
    $('#pyDateLabel').textContent = mode === 'documentacao' ? 'Data da conclusão' : mode === 'cobranca' ? 'Data do recebimento' : 'Data do pagamento';
    $('#pyByLabel').textContent = mode === 'documentacao' ? 'Concluído por' : mode === 'cobranca' ? 'Registrado por' : 'Pago por';
    const who = mode === 'cobranca' ? (t.chargeTo || '—') : mode === 'documentacao' ? (t.docOwner || '') : (t.payee || '—');
    const lastAmt = mode !== 'documentacao' && t.expected == null ? lastPaidAmount(t.id) : null;
    const valorHint = mode === 'documentacao' ? ''
      : t.expected != null ? `Previsto: <strong class="num">${money(t.expected)}</strong>`
      : lastAmt != null ? `Valor variável · último pago: <strong class="num">${money(lastAmt)}</strong>`
      : 'Valor variável — informe o valor deste mês';
    $('#payHead').innerHTML = `
      <div class="pay-head-title">${esc(t.title)} ${statusTag(o.status)}<span class="tag rec">${KIND_LABEL[mode]}</span><span class="tag rec">${icon('repeat')}${recLabel(t)}</span></div>
      <div class="pay-head-sub">
        ${who ? `<span>${payeeIcon(t)}${esc(who)}</span>` : ''}
        <span>${icon('calendar-clock')}${windowLabel(o)} · ${dueText(o)}</span>
        ${valorHint ? `<span>${valorHint}</span>` : ''}
      </div>
      ${dueHeadline(o) ? `<div class="pay-head-due">${esc(dueHeadline(o))}</div>` : ''}
      ${t.notes ? `<div class="pay-head-notes">${icon('info', 'i-sm')}<span>${esc(t.notes)}</span></div>` : ''}`;
    $('#pyTask').value = taskId;
    $('#pyPeriod').value = k;
    // Fixo: sugere o previsto. Variável: deixa em branco (só mostra o último como referência).
    setMoney('#pyAmount', mode === 'pagamento' ? t.expected : null);
    setMoney('#pyChargeAmount', mode === 'cobranca' ? t.expected : null);
    if (mode === 'pagamento' && t.expected == null) {
      $('#pyAmount').placeholder = lastAmt != null ? `Último: ${money(lastAmt).replace('R$', '').trim()}` : '0,00';
    }
    if (mode === 'cobranca' && t.expected == null) {
      $('#pyChargeAmount').placeholder = lastAmt != null ? `Último: ${money(lastAmt).replace('R$', '').trim()}` : '0,00';
    }
    if (state.accounts.length) {
      const acc = state.accounts.some(a => a.id === t.account) ? t.account : state.accounts[0].id;
      $('#pyAcc').value = acc;
      $('#pyChargeAcc').value = acc;
    }
    $('#pyDate').value = todayISO();
    $('#pyTime').value = nowTime();
    $('#pyChargeTime').value = nowTime();
    $('#pyPayee').value = t.payee || '';
    $('#pyChargeTo').value = t.chargeTo || '';
    $('#pyBy').value = userName || '';
    $('#pyNote').value = '';
    uploads.pay?.reset();
    uploads.charge?.reset();
    uploads.doc?.reset();
    lastFocus = document.activeElement;
    $('#modal-pay').classList.add('open');
    setTimeout(() => {
      if (mode === 'cobranca') $('#pyChargeAmount').focus();
      else if (mode === 'documentacao') $('#pyDate').focus();
      else $('#pyAmount').focus();
    }, 20);
  }

  let salvandoBaixa = false;
  async function savePay() {
    if (salvandoBaixa) return;
    const taskId = $('#pyTask').value, k = $('#pyPeriod').value, t = taskById(taskId);
    if (!t) return;
    if (doneOf(taskId, k)) { alert(k.length === 10 ? `Este item já foi lançado em ${fullDate(k)}.` : 'Este item já foi lançado neste mês.'); return; }
    const mode = $('#pyMode').value === 'documentacao' || $('#pyMode').value === 'cobranca' ? $('#pyMode').value : 'pagamento';
    const by = (userName || '').trim();
    const note = $('#pyNote').value.trim(), date = $('#pyDate').value;
    $('#pyBy').value = by;
    if (!by) { alert('Não foi possível identificar quem está logado. Recarregue a página.'); return; }
    if (!date) { alert('Informe a data.'); return; }
    if (asMonth(date) !== asMonth(k)) {
      const origem = k.length === 10 ? fullDate(k) : monthLabel(k);
      if (!confirm(`A ocorrência é de ${origem}, mas a data informada é ${fullDate(date)}. O lançamento aparecerá em ${monthLabel(asMonth(date))}. Deseja continuar?`)) return;
    }

    if (mode === 'documentacao') {
      salvandoBaixa = true;
      const submit = $('#pySubmit');
      const oldHtml = submit.innerHTML;
      submit.disabled = true; submit.textContent = 'Salvando…';
      const doneId = uid();
      const done = {
        id: doneId, taskId, period: k, status: 'concluida',
        date, time: nowTime(), by, note, receiptId: null,
      };
      try {
        const file = uploads.doc?.file;
        if (file) done.receiptId = await FPComprovantes.put(file, doneId, 'baixa');
        state.taskDone.push(done);
        rememberPerson(by);
        refresh();
        await saveConfirmed();
        closeModals();
      } catch (e) {
        state.taskDone = state.taskDone.filter(x => x.id !== doneId);
        if (done.receiptId) FPComprovantes.del(done.receiptId);
        refresh();
        alert(e instanceof Error ? e.message : 'Não foi possível registrar a conclusão.');
      } finally {
        salvandoBaixa = false;
        submit.disabled = false; submit.innerHTML = oldHtml;
      }
      return;
    }

    const isCharge = mode === 'cobranca';
    const amount = Math.round(moneyVal(isCharge ? '#pyChargeAmount' : '#pyAmount') * 100) / 100;
    if (!(amount > 0)) {
      alert(isCharge ? 'Informe o valor recebido.' : 'Informe o valor pago.');
      return;
    }
    const payee = (isCharge ? $('#pyChargeTo') : $('#pyPayee')).value.trim();
    if (!payee) {
      alert(isCharge ? 'Informe de quem você recebeu.' : 'Informe quem recebeu.');
      return;
    }
    const account = (isCharge ? $('#pyChargeAcc') : $('#pyAcc')).value;
    const time = (isCharge ? $('#pyChargeTime') : $('#pyTime')).value;
    if (!account || !time) return;

    salvandoBaixa = true;
    const submit = $('#pySubmit');
    const oldHtml = submit.innerHTML;
    submit.disabled = true; submit.textContent = 'Salvando…';
    const txId = uid();
    const doneId = uid();
    let receiptId = null;
    try {
      const file = (isCharge ? uploads.charge : uploads.pay)?.file;
      if (file) receiptId = await FPComprovantes.put(file, txId);
      const txKind = isCharge ? 'income' : 'expense';
      const status = isCharge ? 'cobrada' : 'paga';
      const category = isCharge ? 'Renda extra' : (t.category || 'Outros');
      state.txs.push({
        ...stamp_(), id: txId, date, time, amount, kind: txKind, description: t.title,
        category, account, payee, by, taskId, period: k, receiptId, note,
      });
      state.taskDone.push({
        id: doneId, taskId, period: k, status, txId, amount, account, date, time, by, payee, receiptId, note,
      });
      rememberPerson(by); rememberPayee(payee);
      refresh();
      await saveConfirmed();
      closeModals();
    } catch (e) {
      state.txs = state.txs.filter(x => x.id !== txId);
      state.taskDone = state.taskDone.filter(x => x.id !== doneId);
      if (receiptId) FPComprovantes.del(receiptId);
      refresh();
      alert(e instanceof Error ? e.message : 'Não foi possível salvar o pagamento/recebimento.');
    } finally {
      salvandoBaixa = false;
      submit.disabled = false; submit.innerHTML = oldHtml;
    }
  }

  async function skipOccurrence(key) {
    const [taskId, k] = key.split('|');
    const t = taskById(taskId);
    if (!t || doneOf(taskId, k)) return;
    const quando = k.length === 10 ? fullDate(k) : monthLabel(k).toLowerCase();
    if (!confirm(`Dispensar “${t.title}” em ${quando}? Não será cobrada neste período.`)) return;
    const done = { id: uid(), taskId, period: k, status: 'dispensada', date: todayISO(), time: nowTime(), by: userName || 'Usuário' };
    state.taskDone.push(done);
    refresh();
    try { await saveConfirmed(); }
    catch (e) {
      state.taskDone = state.taskDone.filter(x => x !== done);
      refresh();
      alert(e instanceof Error ? e.message : 'Não foi possível dispensar.');
    }
  }

  async function undoOccurrence(key) {
    const [taskId, k] = key.split('|');
    const d = doneOf(taskId, k);
    if (!d) return;
    if (d.status === 'paga' || d.status === 'cobrada') {
      const tipo = d.status === 'cobrada' ? 'receita' : 'despesa';
      if (!confirm(`Desfazer? A ${tipo} de ${money(d.amount)} em Movimentações${d.receiptId ? ' e o comprovante' : ''} também serão excluídos.`)) return;
    } else if (!confirm('Reabrir este item da programação?')) {
      return;
    }
    const tx = d.txId ? state.txs.find(x => x.id === d.txId) : null;
    const receipt = d.receiptId;
    state.txs = state.txs.filter(x => x.id !== d.txId);
    state.taskDone = state.taskDone.filter(x => x !== d);
    refresh();
    try {
      await saveConfirmed();
      if (receipt) FPComprovantes.del(receipt);
    } catch (e) {
      if (tx) state.txs.push(tx);
      state.taskDone.push(d);
      refresh();
      alert(e instanceof Error ? e.message : 'Não foi possível desfazer.');
    }
  }

  function rememberPayee(name) {
    if (!name) return;
    state.payees = [name, ...state.payees.filter(p => p !== name)].slice(0, 40);
  }

  const fileSize = b => b < 1024 * 1024
    ? `${Math.max(1, Math.round(b / 1024)).toLocaleString('pt-BR')} KB`
    : `${(b / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;

  /* ---------- Upload de comprovante ---------- */
  function mountUpload(el) {
    const ctl = { file: null, preview: null, error: '' };
    const draw = () => {
      el.classList.toggle('has-file', !!ctl.file);
      const f = ctl.file;
      el.innerHTML = f
        ? `<div class="upload-file">
            ${ctl.preview ? `<img class="upload-thumb" src="${ctl.preview}" alt="">` : `<div class="upload-thumb">${icon('file-text')}</div>`}
            <div class="upload-name">${esc(f.name)}<small>${fileSize(f.size)}</small></div>
            <button type="button" class="icon-btn" data-up-clear aria-label="Remover arquivo">${icon('x', 'i-sm')}</button>
          </div>`
        : `<button type="button" class="upload-drop" data-up-pick>${icon('upload')}<div><strong>Clique para escolher ou arraste o comprovante aqui</strong><small>Imagem (PNG, JPG) ou PDF, até 10 MB</small></div></button>
           ${ctl.error ? `<div class="upload-err">${esc(ctl.error)}</div>` : ''}`;
    };
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*,application/pdf'; input.hidden = true;
    el.after(input);
    const setFile = f => {
      if (ctl.preview) URL.revokeObjectURL(ctl.preview);
      ctl.preview = null; ctl.error = '';
      const err = f ? FPComprovantes.validar(f) : '';
      if (err) { ctl.file = null; ctl.error = err; }
      else {
        ctl.file = f || null;
        if (f && f.type.startsWith('image/')) ctl.preview = URL.createObjectURL(f);
      }
      draw();
    };
    el.addEventListener('click', e => {
      if (e.target.closest('[data-up-pick]')) input.click();
      else if (e.target.closest('[data-up-clear]')) setFile(null);
    });
    input.addEventListener('change', () => { setFile(input.files[0]); input.value = ''; });
    el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('drag'); });
    el.addEventListener('dragleave', () => el.classList.remove('drag'));
    el.addEventListener('drop', e => { e.preventDefault(); el.classList.remove('drag'); if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]); });
    ctl.reset = () => setFile(null);
    draw();
    return ctl;
  }
  const uploads = {};
  $$('[data-upload]').forEach(el => { uploads[el.dataset.upload] = mountUpload(el); });

  /* ---------- Visualizador de comprovante ---------- */
  async function openReceipt(id, txId) {
    let rec;
    try { rec = await FPComprovantes.get(id); } catch { rec = null; }
    if (!rec) { alert('Comprovante não encontrado neste navegador. Ele fica salvo só no computador onde foi anexado.'); return; }
    const url = await FPComprovantes.url(id);
    const tx = state.txs.find(x => x.id === txId);
    $('#rcTitle').textContent = tx ? `Comprovante · ${tx.description}` : 'Comprovante';
    $('#rcMeta').innerHTML = [
      tx ? `<span><strong class="num">${money(tx.amount)}</strong></span>` : '',
      tx ? `<span>${fullDate(tx.date)}${tx.time ? ` às ${tx.time}` : ''}</span>` : '',
      tx ? `<span>${esc(accName(tx.account))}</span>` : '',
      tx?.payee ? `<span>Recebeu: ${esc(tx.payee)}</span>` : '',
      tx?.by ? `<span>Pago por: ${esc(tx.by)}</span>` : '',
      `<span>${esc(rec.name)} · ${fileSize(rec.size)}</span>`,
    ].join('');
    $('#rcView').innerHTML = rec.type === 'application/pdf'
      ? `<iframe src="${url}" title="Comprovante em PDF"></iframe>`
      : `<img src="${url}" alt="Comprovante">`;
    $('#rcOpen').href = url;
    $('#rcDownload').href = url;
    $('#rcDownload').download = rec.name;
    lastFocus = document.activeElement;
    $('#modal-receipt').classList.add('open');
  }

  function openTxDetails(id) {
    const tx = state.txs.find(x => x.id === id);
    if (!tx) return;
    const inc = tx.kind === 'income';
    const t = tx.taskId ? taskById(tx.taskId) : null;
    const origin = tx.taskId ? (inc || taskKind(t) === 'cobranca' ? 'Cobrança' : 'Pagamento') : 'Movimentação avulsa';
    $('#txViewTitle').textContent = tx.description;
    $('#txViewBody').innerHTML = `
      <div class="mov-detail-hero ${inc ? 'is-income' : 'is-expense'}">
        <span>${icon(inc ? 'ph-chart-line-up' : 'ph-receipt')}</span>
        <div><small>${inc ? 'Receita recebida' : 'Despesa paga'}</small><strong class="num ${inc ? 'delta-pos' : 'delta-neg'}">${signed(value(tx))}</strong></div>
      </div>
      <dl class="mov-detail-grid">
        <div><dt>Data e hora</dt><dd>${fullDate(tx.date)}${tx.time ? ` às ${esc(tx.time)}` : ''}</dd></div>
        <div><dt>Conta</dt><dd>${esc(accName(tx.account))}</dd></div>
        <div><dt>Categoria</dt><dd>${esc(tx.category || 'Outros')}</dd></div>
        <div><dt>Origem</dt><dd>${origin}</dd></div>
        ${tx.payee ? `<div><dt>${inc ? 'Recebido de' : 'Quem recebeu'}</dt><dd>${esc(tx.payee)}</dd></div>` : ''}
        ${tx.by ? `<div><dt>Registrado por</dt><dd>${esc(tx.by)}</dd></div>` : ''}
        ${tx.note ? `<div class="full"><dt>Observação</dt><dd>${esc(tx.note)}</dd></div>` : ''}
      </dl>
      ${tx.receiptId
        ? `<div class="mov-detail-proof-box">
            <button type="button" class="mov-proof-thumb is-lg" data-receipt="${esc(tx.receiptId)}" data-rtx="${esc(tx.id)}" title="Abrir comprovante">
              <span class="mov-proof-frame" data-receipt-thumb="${esc(tx.receiptId)}">${icon('file-text', 'i-sm')}</span>
              <span class="mov-proof-caption">Abrir comprovante</span>
            </button>
          </div>`
        : '<p class="mov-detail-empty">Nenhum comprovante anexado.</p>'}`;
    lastFocus = document.activeElement;
    $('#modal-txview').classList.add('open');
    hydrateReceiptPreviews($('#modal-txview') || document).catch(() => {});
  }

  /* ======================================================================
     CONTAS — saldo inicial + conferências de saldo (saldo real do dia)
     ====================================================================== */
  function diffChip(d) {
    if (Math.abs(d) < 0.005) return '<span class="chip pos">confere</span>';
    return `<span class="chip ${d > 0 ? 'pos' : 'neg'} num">${signed(d)}</span>`;
  }
  const whenTxt = c => `${fullDate(c.date)} às ${c.time}`;

  /* ---------- Bancos: logo e cores do cartão ---------- */
  const BANKS = {
    caixa: { name: 'Caixa', logo: 'caixa-branco', chip: 'caixa', color: '#0a5bb5' },
    bb: { name: 'Banco do Brasil', logo: 'bb', chip: 'bb', color: '#f2c500' },
    inter: { name: 'Inter', logo: 'inter-branco', chip: 'inter', color: '#ff7a00' },
    nubank: { name: 'Nubank', logo: 'nubank-branco', chip: 'nubank', color: '#820ad1' },
    bradesco: { name: 'Bradesco', logo: 'bradesco-branco', chip: 'bradesco', color: '#cc092f' },
    carteira: { name: 'Carteira', color: '#13894f' },
    outro: { name: 'Banco', color: '#1d3f7a' },
  };
  function bankOf(a) {
    if (!a) return 'outro';
    if (a.type === 'Dinheiro em espécie') return 'carteira';
    if (a.bank && BANKS[a.bank]) return a.bank;
    const n = (a.name || '').toLowerCase();
    if (/caixa/.test(n)) return 'caixa';
    if (/banco do brasil|\bbb\b/.test(n)) return 'bb';
    if (/nubank|\bnu\b/.test(n)) return 'nubank';
    if (/bradesco/.test(n)) return 'bradesco';
    if (/inter\b/.test(n)) return 'inter';
    return 'outro';
  }
  const bankLogo = (id, white = true) => `assets/bancos/${white ? BANKS[id].logo : BANKS[id].chip}.svg`;
  function bankHead(id, a) {
    const b = BANKS[id];
    if (b.logo) return `<img class="bank-logo bank-logo-${id}" src="${bankLogo(id)}" alt="${b.name}">`;
    return `<span class="bank-word">${icon(id === 'carteira' ? 'ph-wallet' : 'ph-bank')}<span>${id === 'carteira' ? 'Carteira' : esc(a?.name || 'Banco')}</span></span>`;
  }
  function bankChip(a) {
    const id = bankOf(a), b = BANKS[id];
    return b.chip
      ? `<span class="bank-chip bank-chip-${id}"><img src="${bankLogo(id, false)}" alt=""></span>`
      : `<span class="bank-chip" style="background:${b.color}">${icon(id === 'carteira' ? 'ph-wallet' : 'ph-bank', 'i-sm')}</span>`;
  }
  let accTab = 'cards';

  function renderAccounts(k) {
    const total = totalBalance(k);
    const last = state.accChecks.slice().sort((a, b) => chkStamp(b).localeCompare(chkStamp(a)))[0];
    const list = inMonth(k);
    const inc = sum(list, 'income'), exp = sum(list, 'expense'), net = inc - exp;
    $('#accKpis').innerHTML = `
      <div class="acc-kpi acc-kpi-main">
        <span class="acc-kpi-big-ico">${icon('ph-bank')}</span>
        <div><div class="acc-kpi-label">Saldo total em contas</div>
          <div class="acc-kpi-total"><strong class="num ${total < 0 ? 'delta-neg' : ''}">${money(total)}</strong>
          <span class="acc-kpi-chip ${net < 0 ? 'is-neg' : ''}">${icon(net < 0 ? 'arrow-down-left' : 'arrow-up-right', 'i-sm')}${net < 0 ? '−' : '+'} ${money(Math.abs(net))}</span><span class="acc-kpi-sub">no mês</span></div></div>
      </div>
      <div class="acc-kpi"><span class="acc-kpi-ico">${icon('ph-stack')}</span><div><div class="acc-kpi-label">Total de contas</div><div class="acc-kpi-val num">${state.accounts.length}</div></div></div>
      <div class="acc-kpi"><span class="acc-kpi-ico is-in">${icon('arrow-up-right')}</span><div><div class="acc-kpi-label">Entradas (mês)</div><div class="acc-kpi-val num">${money(inc)}</div></div></div>
      <div class="acc-kpi"><span class="acc-kpi-ico is-out">${icon('arrow-down-left')}</span><div><div class="acc-kpi-label">Saídas (mês)</div><div class="acc-kpi-val num">${money(exp)}</div></div></div>
      <div class="acc-kpi acc-kpi-last"><span class="acc-kpi-ico">${icon('ph-calendar-blank')}</span><div><div class="acc-kpi-label">Última conferência</div><div class="acc-kpi-when num">${last ? whenTxt(last) : 'Nenhuma ainda'}</div></div></div>`;

    $('#accCount').textContent = state.accounts.length;
    $$('[data-acc-tab]').forEach(b => b.classList.toggle('on', b.dataset.accTab === accTab));
    $('#accCardsWrap').hidden = accTab !== 'cards';

    const q = ($('#accQ').value || '').trim().toLowerCase(), ft = $('#accTypeFilter').value || 'all';
    const shown = state.accounts.filter(a => (ft === 'all' || a.type === ft)
      && (!q || `${a.name} ${a.type} ${BANKS[bankOf(a)].name}`.toLowerCase().includes(q)));
    $('#accFull').innerHTML = shown.map(a => {
      const id = bankOf(a), b = BANKS[id];
      const bal = accBalance(a, k);
      const lc = checksOf(a.id).at(-1);
      const after = state.txs.filter(x => x.account === a.id && (!lc || txStamp(x) > chkStamp(lc))).length;
      return `<article class="bank-card bank-${id}" style="--bank:${b.color}">
        <header class="bank-card-head">
          ${bankHead(id, a)}
          <span class="bank-type">${esc(a.type)}</span>
          <div class="bank-more">
            <button type="button" class="bank-kebab" data-acc-menu="${a.id}" aria-label="Mais ações" aria-expanded="false">${icon('ellipsis')}</button>
            <div class="bank-menu" hidden>
              <button type="button" data-open="acccheck" data-acc="${a.id}">${icon('ph-arrows-down-up', 'i-sm')}Informar saldo</button>
              <button type="button" data-edit-acc="${a.id}">${icon('pencil-line', 'i-sm')}Editar conta</button>
              <button type="button" class="is-del" data-del-acc="${a.id}">${icon('trash-2', 'i-sm')}Excluir conta</button>
            </div>
          </div>
        </header>
        <div class="bank-card-body">
          <div class="bank-name">${esc(a.name)}</div>
          <div class="bank-bal num ${bal < 0 ? 'is-neg' : ''}">${money(bal)}</div>
          <div class="bank-info">
            <div class="bank-info-item">${icon('arrow-up-right')}<div><span>Lançamentos após<br>a conferência</span><strong class="num">${after}</strong></div></div>
            <div class="bank-info-item">${icon('ph-calendar-blank')}<div><span>Última conferência</span>${lc ? `<strong class="num">${fullDate(lc.date)} ${lc.time}</strong><small>por ${esc(lc.by)}</small>` : '<strong>Nunca</strong><small>sem saldo informado</small>'}</div></div>
          </div>
          <div class="bank-actions">
            <button type="button" class="bank-check" data-open="acccheck" data-acc="${a.id}">${icon('repeat', 'i-sm')}Informar saldo</button>
            <button type="button" class="bank-icon-btn" data-edit-acc="${a.id}" title="Editar conta" aria-label="Editar conta">${icon('pencil-line', 'i-sm')}</button>
            <button type="button" class="bank-icon-btn" data-del-acc="${a.id}" title="Excluir conta" aria-label="Excluir conta">${icon('trash-2', 'i-sm')}</button>
          </div>
        </div>
      </article>`;
    }).join('') || `<div class="empty">${state.accounts.length ? 'Nenhuma conta encontrada com esse filtro.' : 'Nenhuma conta cadastrada. Use “Nova conta”.'}</div>`;

    const fa = $('#fAccCheck').value || 'all';
    const rows = state.accChecks.filter(c => fa === 'all' || c.accId === fa)
      .sort((a, b) => chkStamp(b).localeCompare(chkStamp(a))).slice(0, 80);
    $('#accCheckRows').innerHTML = rows.map(c => {
      const a = state.accounts.find(x => x.id === c.accId);
      const calc = a ? balanceAt(a, chkStamp(c), c.id) : 0;
      const d = Math.round((c.balance - calc) * 100) / 100;
      return `<tr>
        <td class="num">${fullDate(c.date)}</td>
        <td class="num">${c.time}</td>
        <td><span class="acc-hist-name">${bankChip(a)}${esc(accName(c.accId))}</span></td>
        <td class="t-right num"><strong>${money(c.balance)}</strong></td>
        <td class="t-right num"><strong>${money(calc)}</strong></td>
        <td class="t-center"><span class="diff-pill ${Math.abs(d) < 0.005 ? '' : d > 0 ? 'is-pos' : 'is-neg'} num">${Math.abs(d) < 0.005 ? money(0) : signed(d)}</span></td>
        <td class="t-center">${esc(c.by)}</td>
        <td class="t-center">${canDeleteOwned(c) ? `<button class="icon-btn" data-del-check="${c.id}" aria-label="Excluir conferência">${icon('trash-2', 'i-sm')}</button>` : ''}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="8" class="empty">Nenhum saldo informado ainda. Use “Informar saldo” para registrar o saldo real da conta.</td></tr>';
  }

  function renderBankPreview() {
    const box = $('#accPreview');
    if (!box) return;
    const a = { name: $('#accName').value.trim() || 'Nova conta', type: $('#accType').value, bank: $('#accBank').value };
    const id = bankOf(a);
    box.style.setProperty('--bank', BANKS[id].color);
    box.className = `bank-preview bank-${id}`;
    box.innerHTML = `<div class="bank-card-head">${bankHead(id, a)}<span class="bank-type">${esc(a.type)}</span></div>`;
  }

  function updateAccCalc() {
    const a = state.accounts.find(x => x.id === $('#acAcc').value);
    const date = $('#acDate').value, time = $('#acTime').value;
    if (!a || !date || !time) { $('#acCalc').innerHTML = ''; return; }
    const calc = balanceAt(a, `${date}T${time}`);
    const informed = moneyVal('#acBal');
    let html = `${icon('info', 'i-sm')}<span>Pelo sistema, o saldo de <strong>${esc(a.name)}</strong> em ${fullDate(date)} às ${time} seria <strong class="num">${money(calc)}</strong>.`;
    if (!Number.isNaN(informed)) {
      const d = Math.round((informed - calc) * 100) / 100;
      html += Math.abs(d) < 0.005 ? ' O valor informado <strong>confere</strong>.'
        : ` Diferença de <strong class="num ${d > 0 ? 'delta-pos' : 'delta-neg'}">${signed(d)}</strong>: a partir daqui o sistema passa a usar o saldo informado.`;
    }
    $('#acCalc').innerHTML = html + '</span>';
  }

  /* ---------- Visão geral: principais investimentos ---------- */
  function renderInvTop() {
    const total = invTotal();
    const list = state.investments.map(i => ({ i, v: invValue(i.id), l: snapsOf(i.id) }))
      .sort((a, b) => b.v - a.v);
    $('#invTopMeta').textContent = list.length ? `${money(total)} em ${list.length} aplicaç${list.length === 1 ? 'ão' : 'ões'}` : '';
    if (!list.length) { $('#invTop').innerHTML = '<div class="empty">Nenhuma aplicação cadastrada.</div>'; return; }
    $('#invTop').innerHTML = list.slice(0, 3).map(({ i, v, l }) => {
      const cur = l.at(-1), before = l.at(-2);
      return `<div class="inv-row">
        <div class="acc-ico">${icon('ph-stack', 'i-sm')}</div>
        <div class="acc-info">
          <div class="acc-name">${esc(i.name)}</div>
          <div class="acc-type">${esc(invAccName(i))}${cur ? ` · ${icon('clock', 'i-xs')} ${fullDate(cur.date)} às ${cur.time}` : ' · sem atualização'}</div>
        </div>
        <div class="inv-val"><strong class="num">${money(v)}</strong>${cur && before ? chip(cur.balance - before.balance) : ''}</div>
      </div>`;
    }).join('');
  }

  /* ---------- Render ---------- */
  function render() {
    const k = period;
    const list = inMonth(k).sort(byDateDesc);
    const prev = inMonth(prevMonth(k));
    const inc = sum(list, 'income'), exp = sum(list, 'expense'), net = inc - exp;

    // KPIs
    if ($('#kBalance')) {
    $('#kBalance').textContent = money(totalBalance(k));
    $('#kBalanceFoot').textContent = `${state.accounts.length} conta${state.accounts.length === 1 ? '' : 's'} · fim de ${monthLabel(k).split(' ')[0].toLowerCase()}`;
    $('#kIncome').textContent = money(inc);
    $('#kIncome').className = 'kpi-value num delta-pos';
    $('#kIncomeFoot').innerHTML = delta(inc, sum(prev, 'income'));
    $('#kExpense').textContent = money(exp);
    $('#kExpense').className = 'kpi-value num delta-neg';
    $('#kExpenseFoot').innerHTML = delta(exp, sum(prev, 'expense'), true);
    $('#kNet').textContent = signed(net);
    $('#kNet').className = 'kpi-value num ' + (net >= 0 ? 'delta-pos' : 'delta-neg');
    $('#kNetFoot').textContent = inc ? `${pct(Math.max(net, 0) / inc)} da renda poupada` : '—';
    }
    $$('#chartMode button').forEach(b => b.classList.toggle('on', b.dataset.mode === chartMode));
    if (view === 'overview') flowChart(k);
    // Agendamentos (pagamentos/cobranças sem baixa): mês da tela e, no mês atual, também o seguinte
    const cur = currentMonth(), next = addMonths(k, 1);
    const schedMonths = k === cur ? [k, next] : k > cur ? [k] : [];
    const sched = scheduledEntries(schedMonths);
    const nextSched = sched.filter(x => ym(x.date) === next);
    const nextPay = nextSched.filter(x => x.kind === 'expense'), nextGet = nextSched.filter(x => x.kind === 'income');
    const nextName = MONTHS_FULL[+next.slice(5) - 1];
    const nk = $('#kNextBox');
    if (nk) {
      nk.hidden = k !== cur;
      $('#kNextLabel').textContent = `Agendado para ${nextName.toLowerCase()}`;
      $('#kNext').textContent = nextPay.length ? `− ${money(sum(nextPay, 'expense'))}` : money(0);
      $('#kNextFoot').innerHTML = nextSched.length
        ? `${nextPay.length} pagamento${nextPay.length === 1 ? '' : 's'}${nextGet.length ? ` · <span class="delta-pos">+ ${money(sum(nextGet, 'income'))}</span> a receber` : ''}`
        : 'nada agendado';
    }
    const overdueMonths = k === cur
      ? [...new Set(overdueBefore(k).map(o => asMonth(o.period) || o.period).filter(Boolean))]
      : [];
    const overdue = scheduledEntries(overdueMonths).filter(x => x.status === 'atrasada');
    renderNumbers(k, list, [...overdue, ...sched], next, overdue);
    $('#catMeta').textContent = sched.some(x => x.kind === 'expense')
      ? `${monthLabel(k).split(' ')[0]}${schedMonths.length > 1 ? ` + agendados até ${nextName.toLowerCase()}` : ' + agendados'}`
      : monthLabel(k);
    $('#catTop').innerHTML = catDonut([...list, ...sched], 6);
    const recent = [...sched, ...docEntries(schedMonths.length ? schedMonths : [k], k), ...list].sort((a, b) => b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || ''));
    ovRecent = recent;
    renderRecent();
    $('#accSummary').innerHTML = accRows(k);
    renderInvTop();

    // Movimentações
    const q = $('#q').value.trim().toLowerCase(), fk = $('#fKind').value, fa = $('#fAccount').value;
    const fo = $('#fOrigin')?.value || 'all', fs = $('#fStatus')?.value || 'all';
    const filtered = list.filter(x =>
      (fk === 'all' || x.kind === fk) && (fa === 'all' || x.account === fa) &&
      (fo === 'all' || (fo === 'avulso' ? !x.taskId : !!x.taskId)) &&
      (fs === 'all' || (fs === 'received' ? x.kind === 'income' : x.kind === 'expense')) &&
      (!q || `${x.description} ${x.category} ${accName(x.account)} ${x.payee || ''} ${x.by || ''}`.toLowerCase().includes(q)));
    const movIncome = list.filter(x => x.kind === 'income').reduce((total, x) => total + value(x), 0);
    const movExpense = list.filter(x => x.kind === 'expense').reduce((total, x) => total + value(x), 0);
    const movResult = movIncome - movExpense;
    $('#movKpis').innerHTML = `
      <div class="mov-kpi is-count"><span class="mov-kpi-icon">${icon('ph-arrows-down-up')}</span><span class="mov-kpi-copy"><small>Lançamentos</small><strong>${list.length}</strong><span>${monthLabel(k)}</span></span></div>
      <div class="mov-kpi is-income"><span class="mov-kpi-icon">${icon('ph-chart-line-up')}</span><span class="mov-kpi-copy"><small>Receitas</small><strong>${money(movIncome)}</strong><span>${list.filter(x => x.kind === 'income').length} entrada${list.filter(x => x.kind === 'income').length === 1 ? '' : 's'}</span></span></div>
      <div class="mov-kpi is-expense"><span class="mov-kpi-icon">${icon('ph-receipt')}</span><span class="mov-kpi-copy"><small>Despesas</small><strong>${money(movExpense)}</strong><span>${list.filter(x => x.kind === 'expense').length} saída${list.filter(x => x.kind === 'expense').length === 1 ? '' : 's'}</span></span></div>
      <div class="mov-kpi is-balance"><span class="mov-kpi-icon">${icon('ph-wallet')}</span><span class="mov-kpi-copy"><small>Resultado</small><strong class="${movResult >= 0 ? 'delta-pos' : 'delta-neg'}">${signed(movResult)}</strong><span>receitas menos despesas</span></span></div>`;
    const hasMovFilters = Boolean(q || fk !== 'all' || fa !== 'all' || fo !== 'all' || fs !== 'all');
    $('#movMeta').textContent = `Mostrando ${filtered.length} ${filtered.length === 1 ? 'registro' : 'registros'} de ${monthLabel(k).toLowerCase()}`;
    $('#movClear').hidden = !hasMovFilters;
    const movPages = Math.max(1, Math.ceil(filtered.length / MOV_PAGE));
    movPage = Math.min(Math.max(1, movPage), movPages);
    const movStart = (movPage - 1) * MOV_PAGE;
    const movVisible = filtered.slice(movStart, movStart + MOV_PAGE);
    $('#allRows').innerHTML = movVisible.map(x => txRow(x, true)).join('') || '<tr><td colspan="9" class="empty">Nenhum lançamento encontrado.</td></tr>';
    hydrateReceiptPreviews($('#view-transactions') || document).catch(() => {});
    const shownFrom = filtered.length ? movStart + 1 : 0;
    const shownTo = Math.min(movStart + MOV_PAGE, filtered.length);
    $('#movFooter').innerHTML = `<span>Mostrando <strong>${shownFrom}–${shownTo}</strong> de <strong>${filtered.length}</strong> lançamentos</span>
      <div class="mov-pages">
        <button type="button" class="icon-btn" data-mov-page="${movPage - 1}" ${movPage <= 1 ? 'disabled' : ''} aria-label="Página anterior">${icon('chevron-down', 'i-sm mov-page-prev')}</button>
        <span>${movPage}</span>
        <button type="button" class="icon-btn" data-mov-page="${movPage + 1}" ${movPage >= movPages ? 'disabled' : ''} aria-label="Próxima página">${icon('chevron-down', 'i-sm mov-page-next')}</button>
      </div>`;

    // Contas
    renderAccounts(k);

    // Tarefas
    applyRole();
    renderTasks();
    renderPending();

    // Investimentos
    renderInvestments();

    // Relatórios
    renderReports();
  }

  /* ---------- Relatórios (planilha + PDF A4) ---------- */
  function situacaoProg(o) {
    if (!o) return '—';
    const kind = taskKind(o.task);
    const word = kind === 'cobranca' ? 'recebido' : kind === 'documentacao' ? 'concluído' : 'pago';
    if (o.done) {
      if (o.done.status === 'paga') return 'Pago';
      if (o.done.status === 'cobrada') return 'Recebido';
      if (o.done.status === 'concluida') return 'Concluído';
      if (o.done.status === 'dispensada') return 'Dispensado';
      return STATUS_LABEL[o.done.status] || o.done.status;
    }
    if (o.status === 'atrasada') return `Não ${word} (atrasado)`;
    if (o.status === 'hoje') return `Não ${word} (vence hoje)`;
    if (o.status === 'aberta') return `Não ${word}`;
    if (o.status === 'futura') return 'A vencer';
    return STATUS_LABEL[o.status] || 'Pendente';
  }

  const REPORT_KIND = { pagamentos: 'pagamento', cobrancas: 'cobranca', documentacao: 'documentacao' };
  function reportProgramacao(k, kind = 'pagamento') {
    const rows = state.tasks
      .filter(t => taskKind(t) === kind && !t.paused && occursIn(t, k))
      .map(t => occurrence(t, k))
      .sort((a, b) => a.to.localeCompare(b.to) || a.task.title.localeCompare(b.task.title, 'pt-BR'));
    const isDoc = kind === 'documentacao';
    const headers = isDoc
      ? ['Pendência', 'Responsável', 'Prazo', 'Situação']
      : ['Conta', PERSON_COL[kind], 'Valor', 'Prazo', 'Situação'];
    const body = rows.map(o => {
      const t = o.task;
      if (isDoc) return [t.title, taskTarget(t), fullDate(o.to), situacaoProg(o)];
      const valor = o.done?.amount != null ? money(o.done.amount)
        : t.expected != null ? money(t.expected)
        : 'Variável';
      return [t.title, taskTarget(t), valor, fullDate(o.to), situacaoProg(o)];
    });
    const name = { pagamento: 'Pagamentos', cobranca: 'Cobranças', documentacao: 'Documentação' }[kind];
    return { title: `${name} — ${monthLabel(k)}`, headers, rows: body, empty: `Nada em ${name.toLowerCase()} neste mês.` };
  }

  function reportMovimentacoes(k) {
    const list = inMonth(k).slice().sort(byDateDesc);
    const headers = ['Data', 'Tipo', 'Descrição', 'Categoria', 'Conta', 'Valor', 'Pago por'];
    const body = list.map(x => [
      fullDate(x.date),
      x.kind === 'income' ? 'Receita' : 'Despesa',
      x.description || '',
      x.category || '',
      accName(x.account),
      money(x.amount),
      x.by || '—',
    ]);
    return { title: `Movimentações — ${monthLabel(k)}`, headers, rows: body, empty: 'Nenhum lançamento neste mês.' };
  }

  function reportContas(k) {
    const headers = ['Conta', 'Tipo', 'Saldo no mês', 'Entradas', 'Saídas', 'Lançamentos'];
    const body = state.accounts.map(a => {
      const l = inMonth(k).filter(x => x.account === a.id);
      return [
        a.name,
        a.type || '—',
        money(accBalance(a, k)),
        money(sum(l, 'income')),
        money(sum(l, 'expense')),
        String(l.length),
      ];
    });
    return { title: `Contas — ${monthLabel(k)}`, headers, rows: body, empty: 'Nenhuma conta cadastrada.' };
  }

  function reportInvestimentos() {
    const headers = ['Aplicação', 'Conta / instituição', 'Saldo', 'Última atualização', 'Responsável'];
    const body = state.investments.map(i => {
      const last = snapsOf(i.id).at(-1);
      return [
        i.name,
        invAccName(i),
        money(invValue(i.id)),
        last ? `${fullDate(last.date)}${last.time ? ` ${last.time}` : ''}` : '—',
        last?.by || '—',
      ];
    });
    return { title: 'Investimentos', headers, rows: body, empty: 'Nenhuma aplicação cadastrada.' };
  }

  function currentReportData() {
    const k = period || currentMonth();
    if (reportTab === 'movimentacoes') return reportMovimentacoes(k);
    if (reportTab === 'contas') return reportContas(k);
    if (reportTab === 'investimentos') return reportInvestimentos();
    return reportProgramacao(k, REPORT_KIND[reportTab] || 'pagamento');
  }

  function reportDocHtml(data, { forPrint = false } = {}) {
    const headHtml = data.headers.map(h => `<th>${esc(h)}</th>`).join('');
    const rowsHtml = data.rows.length
      ? data.rows.map(r => `<tr>${r.map((c, i) => {
        const sit = REPORT_KIND[reportTab] && i === data.headers.length - 1 ? String(c) : '';
        const cls = [
          sit === 'Pago' || sit === 'Recebido' || sit === 'Concluído' ? 'sit-ok' : '',
          sit.startsWith('Não ') ? 'sit-late' : '',
        ].filter(Boolean).join(' ');
        return `<td${cls ? ` class="${cls}"` : ''}>${esc(String(c))}</td>`;
      }).join('')}</tr>`).join('')
      : `<tr><td colspan="${Math.max(data.headers.length, 1)}">${esc(data.empty || 'Sem dados.')}</td></tr>`;
    const sub = `Gerado em ${fullDate(todayISO())}${userName ? ` · ${esc(userName)}` : ''}`;
    return `
      <div class="a4-head">
        <div class="a4-brand">Controle Financeiro Pessoal</div>
        <h1 class="a4-title">${esc(data.title)}</h1>
        <div class="a4-sub">${sub}</div>
      </div>
      <table class="a4-table"><thead><tr>${headHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>
      <div class="a4-foot">Folha A4 · ${esc(data.title)}</div>
      ${forPrint ? '' : ''}`;
  }

  function renderReports() {
    const preview = $('#reportPreview');
    if (!preview) return;
    const k = period || currentMonth();
    $$('#reportTabs button').forEach(b => b.classList.toggle('on', b.dataset.rtab === reportTab));
    const needsMonth = reportTab !== 'investimentos';
    $('#reportPeriodLabel').textContent = needsMonth
      ? `Pré-visualização A4 · ${monthLabel(k)} · ${REPORT_KIND[reportTab] ? 'situação de cada item no mês' : 'dados do período'}`
      : 'Pré-visualização A4 · saldo atual das aplicações';
    const data = currentReportData();
    preview.innerHTML = reportDocHtml(data);
    preview.dataset.title = data.title;
  }

  function exportReportPdf() {
    const data = currentReportData();
    const frame = $('#reportPrintFrame');
    if (!frame) { alert('Não foi possível preparar a impressão.'); return; }
    const docHtml = reportDocHtml(data, { forPrint: true });
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(data.title)}</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font: 11px/1.35 Arial, Helvetica, sans-serif; color: #14233d; margin: 0; }
  .a4-brand { font-size: 10px; color: #5b6d86; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 4px; }
  .a4-title { font-size: 16px; margin: 0 0 4px; font-weight: 700; color: #14233d; }
  .a4-sub { color: #5b6d86; font-size: 11px; margin-bottom: 14px; }
  .a4-table { width: 100%; border-collapse: collapse; }
  .a4-table th, .a4-table td { border: 1px solid #c5d1e4; padding: 5px 6px; text-align: left; vertical-align: top; }
  .a4-table th { background: #eef2f7; font-size: 10px; font-weight: 700; }
  .a4-table td { font-size: 10.5px; }
  .sit-ok { color: #1f6b3a; font-weight: 700; }
  .sit-late { color: #b42318; font-weight: 700; }
  .a4-foot { margin-top: 12px; color: #8e9bb1; font-size: 9px; }
</style></head><body>${docHtml}</body></html>`;
    const printNow = () => {
      try { frame.contentWindow.focus(); frame.contentWindow.print(); }
      catch { alert('Não foi possível abrir a impressão. Tente de novo.'); }
    };
    frame.onload = () => setTimeout(printNow, 50);
    frame.srcdoc = html;
  }

  /* ---------- Auditoria (só Admin; o banco grava, a página React busca) ---------- */
  let auditPage = 1, auditPer = 20, auditQ = '', auditReq = '', auditSeq = 0, auditTimer = null;
  const auditData = { itens: [], total: 0, erro: '', carregando: false };
  const AUDIT_CARGO_CLS = { 'Admin': 't-blue', 'Admin do Nerites': 't-purple', 'Editor': 't-green' };
  const auditWhen = iso => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  };

  function loadAudit() {
    if (!REMOTE || !canAudit) {
      Object.assign(auditData, { itens: [], total: 0, carregando: false,
        erro: REMOTE ? 'Só o Admin vê a auditoria.' : 'A auditoria só aparece dentro do sistema, com os dados do banco.' });
      renderAudit();
      return;
    }
    auditReq = 'a' + (++auditSeq);
    Object.assign(auditData, { carregando: true, erro: '' });
    renderAudit();
    window.parent.postMessage({ type: 'fp-audit-get', requestId: auditReq, pagina: auditPage, porPagina: auditPer, busca: auditQ }, location.origin);
  }

  function auditReceber(d) {
    auditData.carregando = false;
    if (d.type === 'fp-audit-erro') {
      Object.assign(auditData, { itens: [], total: 0, erro: d.erro || 'Falha ao carregar a auditoria.' });
    } else {
      const total = Number(d.total) || 0;
      const pages = Math.max(1, Math.ceil(total / auditPer));
      if (!(d.itens || []).length && auditPage > pages) { auditPage = pages; loadAudit(); return; }
      Object.assign(auditData, { itens: d.itens || [], total, erro: '' });
    }
    renderAudit();
  }

  function auditPagerHtml() {
    const total = auditData.total;
    if (!total) return '';
    const pages = Math.max(1, Math.ceil(total / auditPer));
    const start = (auditPage - 1) * auditPer + 1, end = Math.min(auditPage * auditPer, total);
    const btns = [];
    for (let i = 1; i <= pages; i++) {
      if (pages > 7 && i > 1 && i !== pages && Math.abs(i - auditPage) > 1) { if (btns.at(-1) !== '…') btns.push('…'); continue; }
      btns.push(i);
    }
    return `<div class="task-pager inv-pager audit-pager">
      <span class="t-muted">Mostrando ${start}–${end} de ${total} ${total === 1 ? 'registro' : 'registros'}</span>
      <div class="task-pager-btns">
        <label class="inv-per">Exibir: <select class="select" id="auditPer">${[10, 20, 50, 100].map(n => `<option ${n === auditPer ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <button type="button" class="pg-btn" data-audit-page="${auditPage - 1}" ${auditPage <= 1 ? 'disabled' : ''} aria-label="Anterior">${icon('chevron-down', 'i-sm pg-prev')}</button>
        ${btns.map(i => i === '…' ? '<span class="t-muted">…</span>' : `<button type="button" class="pg-btn ${i === auditPage ? 'on' : ''}" data-audit-page="${i}">${i}</button>`).join('')}
        <button type="button" class="pg-btn" data-audit-page="${auditPage + 1}" ${auditPage >= pages ? 'disabled' : ''} aria-label="Próxima">${icon('chevron-down', 'i-sm pg-next')}</button>
      </div>
    </div>`;
  }

  function renderAudit() {
    const rows = $('#auditRows');
    if (!rows) return;
    const vazio = msg => `<tr><td colspan="4" class="empty">${esc(msg)}</td></tr>`;
    if (auditData.erro) rows.innerHTML = vazio(auditData.erro);
    else if (auditData.carregando && !auditData.itens.length) rows.innerHTML = vazio('Carregando…');
    else if (!auditData.itens.length) rows.innerHTML = vazio(auditQ ? 'Nada encontrado para essa busca.' : 'Nenhuma alteração registrada ainda.');
    else rows.innerHTML = auditData.itens.map(x => `<tr>
        <td class="audit-when">${esc(auditWhen(x.quando))}</td>
        <td class="audit-user">${esc(x.usuario)}</td>
        <td><span class="inv-type ${AUDIT_CARGO_CLS[x.cargo] || 't-gray'}">${esc(x.cargo)}</span></td>
        <td class="audit-desc">${esc(x.descricao)}</td>
      </tr>`).join('');
    $('#view-audit .table-wrap').classList.toggle('is-loading', auditData.carregando);
    $('#auditPager').innerHTML = auditData.erro ? '' : auditPagerHtml();
  }

  /* ---------- Investimentos ---------- */
  let invTab = 'apps', invPage = 1, invPer = 5, invSort = { key: null, dir: 1 };
  const INV_TYPE_CLS = { 'CDB': 't-blue', 'Poupança': 't-blue', 'Tesouro Direto': 't-orange', 'LCI / LCA': 't-orange', 'Renda fixa': 't-green', 'Fundos': 't-blue', 'Ações': 't-purple', 'Previdência': 't-purple', 'Outro': 't-gray' };
  const INV_TYPE_ICO = { 'CDB': 'circle-dollar-sign', 'Tesouro Direto': 'landmark', 'LCI / LCA': 'shield-check', 'Fundos': 'briefcase', 'Poupança': 'piggy-bank', 'Ações': 'trending-up', 'Previdência': 'clock', 'Renda fixa': 'chart-line' };
  function invInfo(i) {
    const l = snapsOf(i.id), cur = l.at(-1), ini = l[0];
    const gain = cur && ini ? Math.round((cur.balance - ini.balance) * 100) / 100 : null;
    const rate = cur && ini && ini.balance ? gain / ini.balance : null;
    const sit = !cur ? 'sem' : cur.balance > 0 ? 'ativa' : 'zerada';
    return { i, cur, ini, gain, rate, sit, acc: state.accounts.find(a => a.id === i.account) };
  }
  const INV_SORT = {
    name: x => x.i.name.toLowerCase(), acc: x => invAccName(x.i).toLowerCase(), type: x => x.i.type,
    bal: x => x.cur?.balance ?? -1, ini: x => x.ini?.balance ?? -1, gain: x => x.gain ?? -Infinity, rate: x => x.rate ?? -Infinity,
    last: x => x.cur ? stamp(x.cur) : '', sit: x => x.sit,
  };
  const invTh = (k, label, cls = '') => `<th class="th-sort ${cls} ${invSort.key === k ? 'is-sorted' : ''}"><button type="button" data-isort="${k}">${label}<span class="sort-ico">${invSort.key === k ? (invSort.dir > 0 ? '↑' : '↓') : '⇅'}</span></button></th>`;
  const pctSigned = r => `${r >= 0 ? '+ ' : '− '}${pct2(Math.abs(r))}`;

  function invPagerHtml(total, noun) {
    const pages = Math.max(1, Math.ceil(total / invPer));
    invPage = Math.min(Math.max(1, invPage), pages);
    if (!total) return '';
    const start = (invPage - 1) * invPer + 1, end = Math.min(invPage * invPer, total);
    const btns = [];
    for (let i = 1; i <= pages; i++) {
      if (pages > 7 && i > 5 && i !== pages && Math.abs(i - invPage) > 1) { if (btns.at(-1) !== '…') btns.push('…'); continue; }
      btns.push(i);
    }
    return `<div class="task-pager inv-pager">
      <span class="t-muted">Mostrando ${start}–${end} de ${total} ${noun}</span>
      <div class="task-pager-btns">
        <label class="inv-per">Exibir: <select class="select" id="invPer">${[5, 10, 20, 50].map(n => `<option ${n === invPer ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <button type="button" class="pg-btn" data-inv-page="${invPage - 1}" ${invPage <= 1 ? 'disabled' : ''} aria-label="Anterior">${icon('chevron-down', 'i-sm pg-prev')}</button>
        ${btns.map(i => i === '…' ? '<span class="t-muted">…</span>' : `<button type="button" class="pg-btn ${i === invPage ? 'on' : ''}" data-inv-page="${i}">${i}</button>`).join('')}
        <button type="button" class="pg-btn" data-inv-page="${invPage + 1}" ${invPage >= pages ? 'disabled' : ''} aria-label="Próxima">${icon('chevron-down', 'i-sm pg-next')}</button>
      </div>
    </div>`;
  }

  function renderInvestments() {
    const infos = state.investments.map(invInfo);
    const total = invTotal();
    const lc = lastCheck();
    const accN = new Set(state.investments.map(i => i.account || i.institution)).size;
    const withHist = infos.filter(x => x.gain != null);
    const gainSum = withHist.reduce((t, x) => t + x.gain, 0);
    const iniSum = withHist.reduce((t, x) => t + (x.ini?.balance || 0), 0);
    const rated = infos.filter(x => x.sit === 'ativa' && x.rate != null);
    const avgRate = rated.length ? rated.reduce((t, x) => t + x.rate, 0) / rated.length : null;
    const n = (c, a, b) => `${c} ${c === 1 ? a : b}`;
    $('#invKpis').innerHTML = `
      <div class="block inv-kpi"><span class="inv-kpi-ico is-blue">${icon('ph-stack')}</span><div><div class="inv-kpi-label">Patrimônio investido</div><div class="inv-kpi-val num">${money(total)}</div><div class="inv-kpi-sub">${n(state.investments.length, 'aplicação', 'aplicações')} em ${n(accN, 'conta', 'contas')}</div></div></div>
      <div class="block inv-kpi"><span class="inv-kpi-ico is-green">${icon('ph-chart-line-up')}</span><div><div class="inv-kpi-label">Rendimento acumulado</div><div class="inv-kpi-val num ${gainSum < 0 ? 'delta-neg' : 'delta-pos'}">${signed(gainSum)}</div><div class="inv-kpi-sub">${iniSum ? `${pctSigned(gainSum / iniSum)} no período` : 'sem histórico ainda'}</div></div></div>
      <div class="block inv-kpi"><span class="inv-kpi-ico is-purple"><b>%</b></span><div><div class="inv-kpi-label">Rentabilidade média</div><div class="inv-kpi-val num">${avgRate == null ? '—' : pct2(avgRate)}</div><div class="inv-kpi-sub">das aplicações ativas</div></div></div>
      <div class="block inv-kpi"><span class="inv-kpi-ico is-orange">${icon('repeat')}</span><div><div class="inv-kpi-label">Última atualização</div><div class="inv-kpi-val inv-kpi-when num">${lc ? `${fullDate(lc.date)} às ${lc.time}` : 'Nenhuma'}</div><div class="inv-kpi-sub">${n(state.snapshots.length, 'verificação registrada', 'verificações registradas')}</div></div></div>`;

    // Por instituição (conta/banco onde está a aplicação)
    const groups = {};
    infos.forEach(x => { const key = x.i.account || `inst:${x.i.institution || ''}`; (groups[key] ||= { acc: x.acc, name: invAccName(x.i), v: 0 }).v += x.cur?.balance || 0; });
    let gl = Object.values(groups).sort((a, b) => b.v - a.v);
    if (gl.length > 5) { const rest = gl.slice(4); gl = [...gl.slice(0, 4), { name: `Outros (${rest.length})`, v: rest.reduce((t, g) => t + g.v, 0), other: true }]; }
    $('#invByBank').innerHTML = gl.length ? gl.map(g => `<div class="inv-bank-row">
        <span class="inv-bank-name">${g.other ? `<span class="bank-chip bank-chip-plain">${icon('ph-bank', 'i-sm')}</span>` : bankChip(g.acc || { name: g.name, type: '' })}<span>${esc(g.name)}</span></span>
        <div class="inv-bank-bar"><div class="inv-bank-top"><strong class="num">${money(g.v)}</strong><span class="num">${total ? pct2(g.v / total).replace(/,(\d)\d%$/, ',$1%') : '0%'}</span></div><div class="inv-bar"><i style="width:${total ? (g.v / total) * 100 : 0}%"></i></div></div>
      </div>`).join('') : '<div class="empty">Nenhuma aplicação cadastrada.</div>';

    // gráfico
    $$('#invChartTabs [data-invchart]').forEach(b => b.classList.toggle('on', b.dataset.invchart === invChartMode));
    const pick = $('#invChartPick');
    pick.hidden = invChartMode === 'all';
    if (invChartMode !== 'all') {
      const opts = invChartMode === 'acc'
        ? [...new Map(state.investments.filter(i => i.account).map(i => [i.account, invAccName(i)])).entries()]
        : state.investments.map(i => [i.id, i.name]);
      const cur = pick.value, sig = invChartMode + opts.map(o => o[0]).join();
      if (pick.dataset.sig !== sig) { pick.innerHTML = opts.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join(''); pick.dataset.sig = sig; if (opts.some(o => o[0] === cur)) pick.value = cur; }
    }
    if (view === 'investments') investChart();

    // filtros
    const fAcc = $('#invFAcc'), fType = $('#invFType');
    const accOpts = [...new Map(state.investments.map(i => [i.account || '', invAccName(i)])).entries()];
    const keepA = fAcc.value || 'all', keepT = fType.value || 'all';
    fAcc.innerHTML = '<option value="all">Todas</option>' + accOpts.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('');
    fAcc.value = accOpts.some(o => o[0] === keepA) ? keepA : 'all';
    const types = [...new Set(state.investments.map(i => i.type))].sort();
    fType.innerHTML = '<option value="all">Todos</option>' + types.map(t => `<option>${esc(t)}</option>`).join('');
    fType.value = types.includes(keepT) ? keepT : 'all';

    $('#invAppsN').textContent = state.investments.length;
    $('#invHistN').textContent = state.snapshots.length;
    $$('[data-inv-tab]').forEach(b => b.classList.toggle('on', b.dataset.invTab === invTab));
    $$('.inv-apps-only').forEach(el => { el.hidden = invTab !== 'apps'; });
    $$('.inv-hist-only').forEach(el => { el.hidden = invTab !== 'hist'; });
    $('#invMore').hidden = invTab !== 'apps';
    if (invTab !== 'apps') $('#invMorePanel').hidden = true;
    $('#invGroups').hidden = invTab !== 'apps';
    $('#invHistBox').hidden = invTab !== 'hist';

    const q = $('#invQ').value.trim().toLowerCase(), fa = fAcc.value, today = todayISO();
    if (invTab === 'apps') {
      const ft = fType.value, fs = $('#invFSit').value, fr = $('#invFRes').value, fg = $('#invFAge').value;
      let list = infos.filter(x => (fa === 'all' || (x.i.account || '') === fa) && (ft === 'all' || x.i.type === ft) && (fs === 'all' || x.sit === fs)
        && (!q || `${x.i.name} ${x.i.type} ${invAccName(x.i)} ${x.i.institution || ''}`.toLowerCase().includes(q))
        && (fr === 'all' || (fr === 'pos' ? x.gain > 0.004 : fr === 'neg' ? x.gain < -0.004 : !x.gain))
        && (fg === 'all' || (x.cur && (fg === '30' ? daysBetween(x.cur.date, today) > 30 : daysBetween(x.cur.date, today) <= 7))));
      const f = INV_SORT[invSort.key];
      list = f ? list.slice().sort((a, b) => { const p = f(a), r = f(b); return (p > r ? 1 : p < r ? -1 : 0) * invSort.dir; })
        : list.slice().sort((a, b) => (b.cur?.balance || 0) - (a.cur?.balance || 0));
      const pages = Math.max(1, Math.ceil(list.length / invPer)); invPage = Math.min(Math.max(1, invPage), pages);
      const rows = list.slice((invPage - 1) * invPer, invPage * invPer).map(x => `<tr>
        <td class="inv-app"><span>${icon(INV_TYPE_ICO[x.i.type] || 'circle-dollar-sign', 'i-sm')}<strong>${esc(x.i.name)}</strong></span></td>
        <td class="inv-acc">${esc(invAccName(x.i))}</td>
        <td><span class="inv-type ${INV_TYPE_CLS[x.i.type] || 't-gray'}">${esc(x.i.type)}</span></td>
        <td class="t-right num"><strong>${x.cur ? money(x.cur.balance) : '—'}</strong></td>
        <td class="t-right num">${x.ini ? money(x.ini.balance) : '—'}</td>
        <td class="t-right num"><strong class="${x.gain > 0 ? 'delta-pos' : x.gain < 0 ? 'delta-neg' : 't-muted'}">${x.gain == null ? '—' : signed(x.gain)}</strong></td>
        <td class="t-center">${x.rate == null ? '<span class="t-muted">—</span>' : `<span class="diff-pill ${x.rate < 0 ? 'is-neg' : ''} num">${pctSigned(x.rate)}</span>`}</td>
        <td class="num">${x.cur ? `${fullDate(x.cur.date)} ${x.cur.time}` : '<span class="t-muted">Nunca</span>'}</td>
        <td class="t-center"><span class="inv-sit s-${x.sit}">${x.sit === 'ativa' ? 'Ativa' : x.sit === 'zerada' ? 'Zerada' : 'Sem saldo'}</span></td>
        <td><div class="inv-actions">
          <button type="button" class="inv-upd" data-open="snap" data-inv="${x.i.id}">${icon('repeat', 'i-sm')}Atualizar saldo</button>
          <button class="icon-btn" data-edit-inv="${x.i.id}" title="Editar aplicação" aria-label="Editar aplicação">${icon('pencil-line', 'i-sm')}</button>
          <button class="icon-btn" data-del-inv="${x.i.id}" title="Excluir aplicação" aria-label="Excluir aplicação">${icon('trash-2', 'i-sm')}</button>
        </div></td>
      </tr>`).join('');
      $('#invGroups').innerHTML = !state.investments.length
        ? `<div class="inv-empty">${icon('piggy-bank')}<strong>Nenhuma aplicação ainda</strong><span>${state.accounts.length ? 'Clique em “Nova aplicação”, escolha a conta e informe o saldo.' : 'Cadastre uma conta em “Contas” e depois adicione a aplicação aqui.'}</span></div>`
        : list.length ? `<div class="table-wrap inv-table-wrap"><table class="inv-table">
            <thead><tr>${invTh('name', 'Aplicação')}${invTh('acc', 'Conta (Banco)')}${invTh('type', 'Tipo')}${invTh('bal', 'Saldo atual', 't-right')}${invTh('ini', 'Saldo inicial', 't-right')}${invTh('gain', 'Rendimento', 't-right')}${invTh('rate', 'Rentabilidade', 't-center')}${invTh('last', 'Última verificação')}<th class="t-center">Situação</th><th>Ação</th></tr></thead>
            <tbody>${rows}</tbody></table></div>`
          : `<div class="task-empty">${icon('search')}Nada com esses filtros.</div>`;
      $('#invPager').innerHTML = invPagerHtml(list.length, list.length === 1 ? 'aplicação' : 'aplicações');
    } else {
      const fi = $('#fInv').value || 'all';
      const hist = state.snapshots.filter(x => {
        const inv = state.investments.find(i => i.id === x.invId);
        return (fi === 'all' || x.invId === fi) && (fa === 'all' || (inv?.account || '') === fa)
          && (!q || `${invName(x.invId)} ${invAccName(inv)} ${x.by}`.toLowerCase().includes(q));
      }).sort((a, b) => stamp(b).localeCompare(stamp(a)));
      const pages = Math.max(1, Math.ceil(hist.length / invPer)); invPage = Math.min(Math.max(1, invPage), pages);
      $('#snapRows').innerHTML = hist.slice((invPage - 1) * invPer, invPage * invPer).map(x => {
        const result = snapshotResult(x, prevSnap(x));
        return `<tr>
          <td class="num">${fullDate(x.date)}</td><td class="num">${x.time}</td>
          <td><strong>${esc(invName(x.invId))}</strong></td>
          <td>${esc(invAccName(state.investments.find(i => i.id === x.invId)))}</td>
          <td class="t-right num"><strong>${money(x.balance)}</strong></td>
          <td class="t-right">${result ? `${resultMoney(result.difference)}${result.percent != null ? ` <small class="t-muted">${pct2(result.percent)}</small>` : ''}` : '<span class="t-muted">base inicial</span>'}</td>
          <td class="t-right">${dailyResultLabel(result)}</td>
          <td>${esc(x.by)}</td>
          <td class="t-center">${canDeleteOwned(x) ? `<button class="icon-btn" data-del-snap="${x.id}" aria-label="Excluir registro">${icon('trash-2', 'i-sm')}</button>` : ''}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="9" class="empty">Nenhum saldo registrado ainda.</td></tr>';
      $('#invPager').innerHTML = invPagerHtml(hist.length, hist.length === 1 ? 'atualização' : 'atualizações');
    }
  }

  function fillPeriod() {
    const ms = months();
    // Visão geral é sempre o mês atual; nas outras telas mantém a escolha manual.
    if (view === 'overview' || !periodManual || !period || !ms.includes(period)) {
      period = currentMonth();
      if (view === 'overview') periodManual = false;
    }
    if (!ms.includes(period)) period = ms.includes(currentMonth()) ? currentMonth() : ms[0];
    const now = currentMonth();
    $('#period').innerHTML = ms.map(m => `<option value="${m}" ${m === period ? 'selected' : ''}>${monthLabel(m)}${m === now ? ' (atual)' : ''}</option>`).join('');
    syncPeriodNow();
  }

  /** Mostra "Voltar ao mês atual" só quando a tela está em outro mês. */
  function syncPeriodNow() {
    const btn = $('#periodNow');
    if (!btn) return;
    btn.hidden = $('#period').hidden || !period || period === currentMonth();
  }

  function goCurrentMonth() {
    periodManual = false;
    period = currentMonth();
    movPage = 1;
    fillPeriod();
    render();
  }

  function fillSelects() {
    const opts = state.accounts.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('');
    $('#txAcc').innerHTML = opts;
    $('#acAcc').innerHTML = opts;
    const fc = $('#fAccCheck').value;
    $('#fAccCheck').innerHTML = '<option value="all">Todas as contas</option>' + opts;
    if (fc && $(`#fAccCheck option[value="${fc}"]`)) $('#fAccCheck').value = fc;
    const tkOpts = `<option value="">Selecione</option>${opts}`;
    $('#tkAcc').innerHTML = tkOpts;
    $('#tkChargeAcc').innerHTML = tkOpts;
    $('#pyAcc').innerHTML = opts;
    $('#pyChargeAcc').innerHTML = opts;
    const fa = $('#fAccount').value;
    $('#fAccount').innerHTML = '<option value="all">Todas as contas</option>' + opts;
    if (fa && $(`#fAccount option[value="${fa}"]`)) $('#fAccount').value = fa;
    const payees = [...new Set([
      ...state.payees,
      ...state.tasks.map(t => t.payee),
      ...state.tasks.map(t => t.chargeTo),
      ...state.txs.map(x => x.payee),
    ].filter(Boolean))];
    $('#payeeList').innerHTML = payees.map(p => `<option value="${esc(p)}">`).join('');
    const inv = state.investments.map(i => `<option value="${i.id}">${esc(i.name)}</option>`).join('');
    const cur = $('#fInv').value;
    $('#fInv').innerHTML = '<option value="all">Todas as aplicações</option>' + inv;
    if (cur && $(`#fInv option[value="${cur}"]`)) $('#fInv').value = cur;
    $('#snapInv').innerHTML = state.investments.map(i => `<option value="${i.id}">${esc(i.name)} — ${esc(invAccName(i))}</option>`).join('');
    $('#invAcc').innerHTML = opts;
    const people = [...new Set([
      userName,
      ...state.people,
      ...state.tasks.map(t => t.docOwner).filter(Boolean),
    ].filter(Boolean))];
    $('#peopleList').innerHTML = people.map(p => `<option value="${esc(p)}">`).join('');
  }

  function fillCategories() {
    const kind = $('input[name="kind"]:checked').value;
    $('#txCat').innerHTML = CATEGORIES[kind].map(c => `<option>${c}</option>`).join('');
  }

  function refresh() { fillPeriod(); fillSelects(); render(); }

  function rememberPerson(name) {
    state.people = [name, ...state.people.filter(p => p !== name)].slice(0, 10);
  }

  /* ---------- Navegação ---------- */
  function show(v) {
    if (v === 'tasks') v = VIEW_OF_KIND[taskView] || 'pagamentos'; // links antigos
    const tk = TASK_VIEWS[v];
    view = tk ? 'tasks' : v;
    if (tk && tk !== taskView) { taskView = tk; taskTab = taskTabs[tk]; taskPage = 1; }
    $$('.view').forEach(s => s.classList.toggle('active', s.id === 'view-' + view));
    $$('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === v || (!!tk && 'tabTasks' in b.dataset)));
    $$('#taskKindSwitch button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
    $('#pageTitle').textContent = TITLES[v];
    $('#pageSub').innerHTML = SUBTITLES[v] || '';
    document.title = `${TITLES[v]} · Matheus do Beiju`;
    window.scrollTo({ top: 0 });
    if (growOn) avisarPai({ type: 'fp-top' });
    // Telas com ação própria (contas, aplicações, compromissos) não mostram o botão Lançamento, para não confundir
    const hasOwnPrimaryAction = ['investments', 'accounts', 'tasks', 'audit'].includes(view);
    $('#headTxBtn').hidden = hasOwnPrimaryAction;
    $('.mobile-quick-add').hidden = hasOwnPrimaryAction;
    // Pagamentos e cobranças usam o mês do topo; documentação e auditoria mostram tudo
    $('#period').hidden = tk === 'documentacao' || view === 'audit';
    if (view === 'audit') loadAudit();
    if (v !== 'overview' && (periodManual || period !== currentMonth())) {
      periodManual = false;
      period = currentMonth();
      fillPeriod();
      render();
    }
    syncPeriodNow();
    if (tk) renderTasks();
    if (v === 'reports') renderReports();
    if (v === 'overview') {
      periodManual = false;
      period = currentMonth();
      fillPeriod();
      render();
      return;
    }
    if (v === 'investments') investChart();
  }

  /* ---------- Modais ---------- */
  let lastFocus = null;
  function openModal(name, btn) {
    if (name === 'tx' && !state.accounts.length) { alert('Cadastre uma conta antes de lançar.'); return; }
    if (name === 'snap' && !state.investments.length) { alert('Cadastre uma aplicação antes de registrar o saldo.'); return; }
    lastFocus = document.activeElement;
    const m = $('#modal-' + name);
    m.classList.add('open');
    if (name === 'tx') {
      const tx = btn?.dataset.editTx ? state.txs.find(x => x.id === btn.dataset.editTx) : null;
      if (tx?.taskId || (tx && !canDeleteOwned(tx))) { m.classList.remove('open'); alert('Somente lançamentos avulsos próprios podem ser editados.'); return; }
      $('#txId').value = tx?.id || '';
      $('#tTitle').textContent = tx ? 'Editar lançamento' : 'Novo lançamento';
      $('#tTitle').nextElementSibling.textContent = tx ? 'Atualize os dados do lançamento avulso' : 'Registre uma receita ou despesa';
      $('#txSubmit').innerHTML = `${icon('check', 'i-sm')}${tx ? 'Salvar alterações' : 'Salvar lançamento'}`;
      (tx?.kind === 'income' ? $('#kInc') : $('#kExp')).checked = true;
      fillCategories();
      const t = todayISO();
      $('#txDesc').value = tx?.description || '';
      setMoney('#txAmount', tx?.amount ?? '');
      $('#txDate').value = tx?.date || (ym(t) === period ? t : `${period}-01`);
      if (tx?.category) $('#txCat').value = tx.category;
      if (tx?.account && state.accounts.some(a => a.id === tx.account)) $('#txAcc').value = tx.account;
      $('#txPayee').value = tx?.payee || '';
      uploads.tx?.reset();
      const keep = $('#txKeepReceipt');
      if (keep) {
        keep.hidden = !tx?.receiptId;
        keep.dataset.receiptId = tx?.receiptId || '';
        keep.dataset.removed = '0';
        keep.querySelector('[data-tx-receipt-name]')?.replaceChildren(document.createTextNode(tx?.receiptId ? 'Comprovante já anexado' : ''));
      }
    }
    if (name === 'snapbatch') {
      if (!state.investments.length) { m.classList.remove('open'); alert('Cadastre uma aplicação antes.'); return; }
      $('#sbDate').value = todayISO();
      $('#sbTime').value = nowTime();
      $('#sbList').innerHTML = state.investments.map((i, k) => `<div class="sb-row">
          <div><strong>${esc(i.name)}</strong><small>${esc(invAccName(i))} · último ${latest(i.id) ? money(latest(i.id).balance) : '—'}</small></div>
          <input class="input num money" id="sbV${k}" data-sb="${i.id}" type="text" inputmode="numeric" autocomplete="off" data-money placeholder="Novo saldo">
        </div>`).join('');
    }
    if (name === 'snap') {
      if (btn?.dataset.inv) $('#snapInv').value = btn.dataset.inv;
      $('#snapDate').value = todayISO();
      $('#snapTime').value = nowTime();
      $('#snapBy').value = userName || state.people[0] || '';
      setMoney('#snapBal', '');
      updateSnapPrev();
    }
    if (name === 'invest') {
      if (!state.accounts.length) { m.classList.remove('open'); alert('Cadastre uma conta em “Contas” antes de adicionar a aplicação.'); return; }
      const inv = btn?.dataset.editInv ? state.investments.find(i => i.id === btn.dataset.editInv) : null;
      $('#iTitle').textContent = inv ? 'Editar aplicação' : 'Nova aplicação';
      $('#invSubmit').textContent = inv ? 'Salvar alterações' : 'Adicionar';
      $('#invId').value = inv?.id || '';
      $('#invAcc').value = inv?.account && state.accounts.some(a => a.id === inv.account) ? inv.account : state.accounts[0].id;
      $('#invName').value = inv?.name || '';
      $('#invType').value = inv?.type || 'CDB';
      $$('[data-inv-new]').forEach(el => { el.hidden = !!inv; });
      $('#invAmount').required = !inv; $('#invBy').required = !inv;
      $('#invBy').value = state.people[0] || userName || '';
    }
    if (name === 'task') fillTaskForm(btn?.dataset.editTask);
    if (name === 'account') {
      const a = btn?.dataset.editAcc ? state.accounts.find(x => x.id === btn.dataset.editAcc) : null;
      $('#aTitle').textContent = a ? 'Editar conta' : 'Nova conta';
      $('#accSubmit').textContent = a ? 'Salvar alterações' : 'Adicionar';
      $('#accId').value = a?.id || '';
      $('#accName').value = a?.name || '';
      $('#accType').value = a?.type || 'Conta corrente';
      $('#accBank').value = a?.bank || '';
      renderBankPreview();
      setMoney('#accInitial', a ? a.initial || 0 : '');
    }
    if (name === 'acccheck') {
      if (!state.accounts.length) { m.classList.remove('open'); alert('Cadastre uma conta antes de informar o saldo.'); return; }
      if (btn?.dataset.acc) $('#acAcc').value = btn.dataset.acc;
      $('#acDate').value = todayISO();
      $('#acTime').value = nowTime();
      $('#acBy').value = state.people[0] || userName || '';
      updateAccCalc();
    }
    setTimeout(() => {
      const target = name === 'snap' ? $('#snapBal') : $('input:not([type=radio])', m);
      target?.focus();
    }, 20);
  }
  function closeModals() {
    $$('.modal-backdrop.open').forEach(m => { m.classList.remove('open'); $('form', m)?.reset(); });
    Object.values(uploads).forEach(u => u.reset());
    $('#rcView').innerHTML = '';
    lastFocus?.focus?.();
  }
  function updateSnapPrev() {
    const invId = $('#snapInv').value;
    const date = $('#snapDate').value;
    const time = $('#snapTime').value;
    const before = snapshotBefore(invId, date, time);
    const balance = moneyVal('#snapBal');
    if (!before) {
      $('#snapPrev').innerHTML = `${icon('info', 'i-sm')}<span>Primeira verificação desta aplicação. Ela será a base para calcular os próximos rendimentos.</span>`;
      return;
    }
    let html = `${icon('history', 'i-sm')}<span>Saldo anterior: <strong class="num">${money(before.balance)}</strong> em ${fullDate(before.date)} às ${before.time}, verificado por ${esc(before.by)}.`;
    if (!Number.isNaN(balance)) {
      const result = snapshotResult({ invId, date, time, balance }, before);
      html += ` Rendimento no período: <strong class="${resultClass(result.difference)}">${signed(result.difference)}</strong>`;
      if (result.percent != null) html += ` (${pct2(result.percent)})`;
      html += result.days
        ? `. Média simples por dia: <strong class="${resultClass(result.daily)}">${signed(result.daily)}</strong> em ${result.days} dia${result.days === 1 ? '' : 's'}.`
        : ' A comparação é do mesmo dia; não há média diária.';
    }
    $('#snapPrev').innerHTML = html + '</span>';
  }

  /* ---------- Eventos ---------- */
  document.addEventListener('click', e => {
    const b = e.target.closest('button, .modal-backdrop');
    if (!b) return;
    if (b.classList.contains('modal-backdrop')) { if (e.target === b) closeModals(); return; }
    if (b.dataset.view) show(b.dataset.view);
    else if (b.dataset.go) show(b.dataset.go);
    else if (b.dataset.open) openModal(b.dataset.open, b);
    else if (b.dataset.mode) {
      chartMode = b.dataset.mode;
      try { localStorage.setItem('mf:chart', chartMode); } catch { /* */ }
      $$('#chartMode button').forEach(x => x.classList.toggle('on', x === b));
      flowChart(period);
    }
    else if ('close' in b.dataset) closeModals();
    else if (b.dataset.ttab) {
      taskTab = b.dataset.ttab;
      taskTabs[taskView] = taskTab;
      taskPage = 1;
      const status = $('#tfStatus');
      if (status) status.value = 'all';
      renderTasks();
    }
    else if (b.dataset.tsort) {
      const k = b.dataset.tsort;
      taskSort = taskSort.key === k ? { key: k, dir: -taskSort.dir } : { key: k, dir: 1 };
      taskPage = 1;
      renderTasks();
    }
    else if (b.dataset.taskPage) {
      const p = Number(b.dataset.taskPage);
      if (Number.isFinite(p) && p >= 1 && !b.disabled) { taskPage = p; renderTasks(); }
    }
    else if (b.dataset.movPage) {
      const p = Number(b.dataset.movPage);
      if (Number.isFinite(p) && p >= 1 && !b.disabled) { movPage = p; render(); }
    }
    else if (b.dataset.rtab) { reportTab = b.dataset.rtab; renderReports(); }
    else if (b.dataset.pay) openPay(b.dataset.pay, b.dataset.payMode);
    else if (b.dataset.skip) skipOccurrence(b.dataset.skip);
    else if (b.dataset.undo) undoOccurrence(b.dataset.undo);
    else if (b.dataset.receipt) openReceipt(b.dataset.receipt, b.dataset.rtx);
    else if (b.dataset.viewTx) openTxDetails(b.dataset.viewTx);
    else if (b.dataset.editTx) openModal('tx', b);
    else if (b.dataset.editTask) openModal('task', b);
    else if (b.dataset.editAcc) openModal('account', b);
    else if (b.dataset.editInv) openModal('invest', b);
    else if (b.dataset.delCheck) {
      if (confirm('Excluir esta conferência de saldo? O saldo da conta volta a ser calculado sem ela.')) {
        state.accChecks = state.accChecks.filter(c => c.id !== b.dataset.delCheck); save(); refresh();
      }
    }
    else if (b.dataset.pauseTask) {
      const t = taskById(b.dataset.pauseTask);
      if (!t) return;
      const before = t.paused;
      t.paused = !t.paused; refresh();
      saveConfirmed().catch(e => { t.paused = before; refresh(); alert(e instanceof Error ? e.message : 'Não foi possível alterar.'); });
    } else if (b.dataset.delTask) {
      const t = taskById(b.dataset.delTask);
      if (!t) return;
      if (!confirm(`Arquivar a programação “${t.title}”? Ela deixará de gerar novas pendências, mas todo o histórico continuará preservado.`)) return;
      const before = { archived: !!t.archived, paused: !!t.paused };
      t.archived = true;
      t.paused = true;
      refresh();
      saveConfirmed().catch(e => {
        Object.assign(t, before); refresh();
        alert(e instanceof Error ? e.message : 'Não foi possível arquivar.');
      });
    } else if (b.dataset.delTx) {
      const tx = state.txs.find(x => x.id === b.dataset.delTx);
      if (!tx) return;
      if (!canDelete(tx)) { alert('Sem permissão para excluir este lançamento.'); return; }
      const d = tx.taskId ? state.taskDone.find(x => x.txId === tx.id) : null;
      const msg = d ? `Excluir este lançamento? A programação “${tx.description}” volta a ficar pendente${tx.receiptId ? ' e o comprovante será apagado' : ''}.`
        : `Excluir este lançamento?${tx.receiptId ? ' O comprovante também será apagado.' : ''}`;
      if (!confirm(msg)) return;
      const receipt = tx.receiptId;
      state.txs = state.txs.filter(x => x !== tx);
      if (d) state.taskDone = state.taskDone.filter(x => x !== d);
      refresh();
      saveConfirmed()
        .then(() => { if (receipt) FPComprovantes.del(receipt); })
        .catch(e => {
          state.txs.push(tx);
          if (d) state.taskDone.push(d);
          refresh();
          alert(e instanceof Error ? e.message : 'Não foi possível excluir.');
        });
    } else if (b.dataset.delAcc) {
      const a = state.accounts.find(x => x.id === b.dataset.delAcc);
      const n = state.txs.filter(x => x.account === a.id).length;
      if (n) { alert(`"${a.name}" tem ${n} lançamento(s). Exclua-os antes de remover a conta.`); return; }
      const nc = checksOf(a.id).length;
      if (confirm(`Excluir a conta "${a.name}"${nc ? ` e suas ${nc} conferências de saldo` : ''}?`)) {
        state.accounts = state.accounts.filter(x => x.id !== a.id);
        state.accChecks = state.accChecks.filter(c => c.accId !== a.id);
        save(); refresh();
      }
    } else if (b.dataset.delInv) {
      const n = snapsOf(b.dataset.delInv).length;
      if (confirm(`Excluir esta aplicação${n ? ` e seus ${n} registros de saldo` : ''}?`)) {
        state.investments = state.investments.filter(x => x.id !== b.dataset.delInv);
        state.snapshots = state.snapshots.filter(s => s.invId !== b.dataset.delInv);
        save(); refresh();
      }
    } else if (b.dataset.delSnap) {
      if (confirm('Excluir este registro de saldo?')) { state.snapshots = state.snapshots.filter(s => s.id !== b.dataset.delSnap); save(); refresh(); }
    }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModals(); });

  let periodManual = false; // a pessoa escolheu um mês: não troca sozinho ao recarregar do banco
  $('#period').addEventListener('change', e => {
    // Visão geral fica no mês atual; em outras telas a pessoa escolhe o período.
    if (view === 'overview') {
      period = currentMonth();
      periodManual = false;
      e.target.value = period;
      render();
      return;
    }
    period = e.target.value;
    periodManual = period !== currentMonth();
    movPage = 1;
    syncPeriodNow();
    render();
  });
  $('#periodNow')?.addEventListener('click', goCurrentMonth);
  ['#q', '#fKind', '#fAccount', '#fOrigin', '#fStatus'].forEach(s => $(s).addEventListener(s === '#q' ? 'input' : 'change', () => { movPage = 1; render(); }));
  $('#movClear')?.addEventListener('click', () => {
    $('#q').value = '';
    $('#fKind').value = 'all';
    $('#fAccount').value = 'all';
    $('#fOrigin').value = 'all';
    $('#fStatus').value = 'all';
    movPage = 1;
    render();
  });
  ['#tq', '#tfValor', '#tfFreq', '#tfState', '#tfStatus'].forEach(s => {
    const el = $(s);
    if (el) el.addEventListener(s === '#tq' ? 'input' : 'change', () => { taskPage = 1; renderTasks(); });
  });
  $('#tfClear')?.addEventListener('click', clearTaskFilters);
  // Filtros menos usados ficam recolhidos em "Mais filtros"
  $('#tfMore')?.addEventListener('click', e => {
    const box = $('#taskFilters');
    box.classList.toggle('tf-toggled');
    const open = getComputedStyle($('#tfFreqField')).display !== 'none' || getComputedStyle(box.querySelector('.tf-extra:not(#tfFreqField)')).display !== 'none';
    e.currentTarget.setAttribute('aria-expanded', String(open));
    e.currentTarget.classList.toggle('on', open);
  });
  $('#reportPdfBtn')?.addEventListener('click', exportReportPdf);
  $('#fInv').addEventListener('change', () => { invPage = 1; renderInvestments(); });
  ['#invQ', '#invFAcc', '#invFType', '#invFSit', '#invFRes', '#invFAge'].forEach(sel => $(sel).addEventListener(sel === '#invQ' ? 'input' : 'change', () => { invPage = 1; renderInvestments(); }));
  $('#invChartPick').addEventListener('change', investChart);
  $('#invMore').addEventListener('click', e => { const p = $('#invMorePanel'); p.hidden = !p.hidden; e.currentTarget.classList.toggle('on', !p.hidden); });
  $('#invClear').addEventListener('click', () => {
    $('#invQ').value = ''; ['#invFAcc', '#invFType', '#invFSit', '#invFRes', '#invFAge', '#fInv'].forEach(sel => { $(sel).value = 'all'; });
    invPage = 1; renderInvestments();
  });
  document.addEventListener('change', e => { if (e.target.id === 'invPer') { invPer = +e.target.value || 5; invPage = 1; renderInvestments(); } });
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-inv-tab]');
    if (t) { invTab = t.dataset.invTab; invPage = 1; renderInvestments(); return; }
    const c = e.target.closest('[data-invchart]');
    if (c) { invChartMode = c.dataset.invchart; renderInvestments(); return; }
    const s2 = e.target.closest('[data-isort]');
    if (s2) { const k = s2.dataset.isort; invSort = invSort.key === k ? { key: k, dir: -invSort.dir } : { key: k, dir: 1 }; invPage = 1; renderInvestments(); return; }
    const pg = e.target.closest('[data-inv-page]');
    if (pg && !pg.disabled) { invPage = +pg.dataset.invPage; renderInvestments(); }
  });
  $('#view-audit').addEventListener('click', e => {
    const pg = e.target.closest('[data-audit-page]');
    if (pg && !pg.disabled) { auditPage = +pg.dataset.auditPage; loadAudit(); }
  });
  $('#view-audit').addEventListener('change', e => {
    if (e.target.id === 'auditPer') { auditPer = +e.target.value || 20; auditPage = 1; loadAudit(); }
  });
  $('#auditQ').addEventListener('input', e => {
    clearTimeout(auditTimer);
    auditTimer = setTimeout(() => { auditQ = e.target.value.trim(); auditPage = 1; loadAudit(); }, 300);
  });
  $('#snapBatchForm').addEventListener('submit', e => {
    e.preventDefault();
    const date = $('#sbDate').value, time = $('#sbTime').value, by = (userName || state.people[0] || '').trim();
    if (!by) { alert('Não foi possível identificar o editor conectado. Recarregue a página.'); return; }
    const filled = $$('#sbList [data-sb]').map(el => ({ invId: el.dataset.sb, v: moneyVal(`#${el.id}`) })).filter(x => !Number.isNaN(x.v) && x.v >= 0);
    if (!filled.length) { alert('Preencha o saldo de pelo menos uma aplicação.'); return; }
    filled.forEach(({ invId, v }) => {
      state.snapshots = state.snapshots.filter(x => !(x.invId === invId && x.date === date && x.time === time));
      state.snapshots.push({ ...stamp_(), id: uid(), invId, date, time, balance: Math.round(v * 100) / 100, by });
    });
    rememberPerson(by);
    save(); closeModals(); refresh();
  });
  ['#snapInv', '#snapDate', '#snapTime', '#snapBal'].forEach(s => $(s).addEventListener(s === '#snapBal' ? 'input' : 'change', updateSnapPrev));
  $$('input[name="kind"]').forEach(r => r.addEventListener('change', fillCategories));

  $('#txForm').addEventListener('submit', async e => {
    e.preventDefault();
    const amount = Math.round(moneyVal('#txAmount') * 100) / 100;
    if (!(amount > 0)) return;
    const date = $('#txDate').value;
    const editId = $('#txId').value;
    const current = editId ? state.txs.find(x => x.id === editId) : null;
    if (editId && (!current || current.taskId || !canDeleteOwned(current))) { alert('Este lançamento não pode ser editado.'); return; }
    const newTxId = current?.id || uid();
    const keep = $('#txKeepReceipt');
    const removedExisting = keep && !keep.hidden && keep.dataset.removed === '1';
    let receiptId = removedExisting ? null : (current?.receiptId || null);
    const oldReceipt = current?.receiptId || null;
    const submit = $('#txSubmit');
    const oldHtml = submit.innerHTML;
    submit.disabled = true; submit.textContent = 'Salvando…';
    const snapshot = current ? { ...current } : null;
    try {
      if (uploads.tx.file) {
        receiptId = await FPComprovantes.put(uploads.tx.file, newTxId);
      }
      const payee = $('#txPayee').value.trim();
      const data = {
        ...stamp_(), id: newTxId, date, amount, time: nowTime(),
        description: $('#txDesc').value.trim(),
        kind: $('input[name="kind"]:checked').value,
        category: $('#txCat').value,
        account: $('#txAcc').value,
        payee: payee || undefined,
        by: userName || undefined,
        receiptId,
      };
      if (current) Object.assign(current, data, { createdBy: current.createdBy, time: current.time || data.time });
      else state.txs.push(data);
      rememberPayee(payee);
      period = ym(date);
      periodManual = period !== currentMonth();
      refresh();
      await saveConfirmed();
      if (oldReceipt && oldReceipt !== receiptId) FPComprovantes.del(oldReceipt);
      closeModals();
    } catch (err) {
      if (snapshot && current) Object.assign(current, snapshot);
      else state.txs = state.txs.filter(x => x.id !== newTxId);
      if (receiptId && receiptId !== oldReceipt) FPComprovantes.del(receiptId);
      refresh();
      alert(err instanceof Error ? err.message : 'Não foi possível salvar o lançamento.');
    } finally {
      submit.disabled = false; submit.innerHTML = oldHtml;
    }
  });
  document.addEventListener('click', e => {
    const rm = e.target.closest('[data-tx-remove-receipt]');
    if (rm) {
      const box = $('#txKeepReceipt');
      if (!box) return;
      box.dataset.removed = '1';
      box.hidden = true;
      return;
    }
    const rmDoc = e.target.closest('[data-tk-remove-doc]');
    if (rmDoc) {
      const box = $('#tkKeepDoc');
      if (!box) return;
      box.dataset.removed = '1';
      box.hidden = true;
    }
  });

  $('#taskForm').addEventListener('submit', e => { e.preventDefault(); saveTaskForm(); });
  $('#taskForm').addEventListener('input', updateTaskForm);
  $('#taskForm').addEventListener('change', updateTaskForm);
  $('#payForm').addEventListener('submit', e => { e.preventDefault(); savePay(); });

  $('#accForm').addEventListener('submit', e => {
    e.preventDefault();
    const data = { name: $('#accName').value.trim(), type: $('#accType').value, bank: $('#accBank').value || '', initial: Math.round((moneyVal('#accInitial') || 0) * 100) / 100 };
    const id = $('#accId').value;
    if (id) Object.assign(state.accounts.find(a => a.id === id), data);
    else state.accounts.push({ ...stamp_(), id: uid(), ...data });
    save(); closeModals(); refresh();
  });

  $('#accCheckForm').addEventListener('submit', e => {
    e.preventDefault();
    const balance = Math.round(moneyVal('#acBal') * 100) / 100;
    if (Number.isNaN(balance)) { alert('Informe o saldo da conta.'); return; }
    const accId = $('#acAcc').value, date = $('#acDate').value, time = $('#acTime').value, by = $('#acBy').value.trim();
    const dup = state.accChecks.find(c => c.accId === accId && c.date === date && c.time === time);
    if (dup && !confirm(`Já existe um saldo de ${accName(accId)} em ${fullDate(date)} às ${time}. Substituir?`)) return;
    if (dup) state.accChecks = state.accChecks.filter(c => c !== dup);
    state.accChecks.push({ ...stamp_(), id: uid(), accId, date, time, balance, by });
    rememberPerson(by);
    save(); closeModals(); refresh();
  });
  ['#acAcc', '#acDate', '#acTime', '#acBal'].forEach(s => $(s).addEventListener(s === '#acBal' ? 'input' : 'change', updateAccCalc));
  $('#fAccCheck').addEventListener('change', render);
  ['#accName', '#accType', '#accBank'].forEach(sel => { $(sel).addEventListener('input', renderBankPreview); $(sel).addEventListener('change', renderBankPreview); });
  $('#accQ').addEventListener('input', render);
  $('#accTypeFilter').addEventListener('change', render);
  document.addEventListener('click', e => {
    const tab = e.target.closest('[data-acc-tab]');
    if (tab) { accTab = tab.dataset.accTab; render(); return; }
    const k = e.target.closest('[data-acc-menu]');
    $$('.bank-menu').forEach(m => { if (!k || m !== k.nextElementSibling) { m.hidden = true; m.previousElementSibling?.setAttribute('aria-expanded', 'false'); } });
    if (k) { const m = k.nextElementSibling; m.hidden = !m.hidden; k.setAttribute('aria-expanded', String(!m.hidden)); }
  });

  $('#invForm').addEventListener('submit', e => {
    e.preventDefault();
    const account = $('#invAcc').value;
    const data = { name: $('#invName').value.trim(), type: $('#invType').value, account, institution: accName(account) };
    const editId = $('#invId').value;
    if (editId) {
      Object.assign(state.investments.find(i => i.id === editId), data);
    } else {
      const amount = Math.round(moneyVal('#invAmount') * 100) / 100;
      if (!(amount >= 0)) { alert('Informe o saldo atual da aplicação.'); return; }
      const id = uid(), by = $('#invBy').value.trim();
      state.investments.push({ id, ...data });
      state.snapshots.push({ ...stamp_(), id: uid(), invId: id, date: todayISO(), time: nowTime(), balance: amount, by });
      rememberPerson(by);
    }
    save(); closeModals(); refresh();
  });

  $('#snapForm').addEventListener('submit', e => {
    e.preventDefault();
    const balance = Math.round(moneyVal('#snapBal') * 100) / 100;
    if (!(balance >= 0)) return;
    const invId = $('#snapInv').value, date = $('#snapDate').value, time = $('#snapTime').value;
    const by = (userName || $('#snapBy').value).trim();
    $('#snapBy').value = by;
    if (!by) { alert('Não foi possível identificar o editor conectado. Recarregue a página.'); return; }
    const dup = state.snapshots.find(s => s.invId === invId && s.date === date && s.time === time);
    if (dup && !confirm(`Já existe um registro de ${invName(invId)} em ${fullDate(date)} às ${time}. Substituir?`)) return;
    if (dup) state.snapshots = state.snapshots.filter(s => s !== dup);
    state.snapshots.push({ ...stamp_(), id: uid(), invId, date, time, balance, by });
    rememberPerson(by);
    save(); closeModals(); refresh();
  });

  let rt; window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => { if (view === 'overview') flowChart(period); if (view === 'investments') investChart(); }, 120);
  });

  /* ---------- Ponte com o sistema (página React que carrega este iframe) ---------- */
  const avisarPai = msg => { if (embedded) window.parent.postMessage(msg, window.location.origin); };
  /* Computador: o iframe cresce até a altura do conteúdo (a página do sistema rola),
     assim o print de página inteira do navegador sai completo. Celular continua com rolagem interna. */
  const GROW_MIN = 761;
  let growOn = false, growH = 0, growRaf = 0;
  function syncGrow() {
    growRaf = 0;
    const on = embedded && REMOTE && window.innerWidth >= GROW_MIN;
    document.documentElement.classList.toggle('fp-grow', on);
    const app = $('.app');
    const h = on && app ? Math.ceil(app.getBoundingClientRect().height) : 0;
    if (on === growOn && Math.abs(h - growH) < 2) return;
    growOn = on; growH = h;
    avisarPai({ type: 'fp-grow', on, height: h });
  }
  const pedirGrow = () => { if (!growRaf) growRaf = requestAnimationFrame(syncGrow); };
  if (embedded && REMOTE) {
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(pedirGrow);
      ro.observe($('.main'));
      ro.observe($('.app'));
    }
    window.addEventListener('resize', pedirGrow);
    pedirGrow();
  }
  window.addEventListener('message', ev => {
    if (ev.origin !== window.location.origin || ev.source !== window.parent) return;
    const d = ev.data || {};
    if (d.type === 'fp-viewport') {
      const r = document.documentElement.style;
      r.setProperty('--vp-top', `${Math.round(d.top || 0)}px`);
      r.setProperty('--vp-h', `${Math.max(200, Math.round(d.height || window.innerHeight))}px`);
      return;
    }
    if (d.type === 'fp-hydrate' && d.payload) {
      if (dirty) return; // há alteração local ainda não salva: não sobrescreve
      const p = d.payload;
      const tasks = (p.tasks || []).map(t => ({
        ...t,
        start: asMonth(t.start) || t.start || null,
        end: asMonth(t.end) || t.end || null,
      }));
      Object.assign(state, {
        accounts: p.accounts || [], accChecks: p.accChecks || [], txs: p.txs || [], tasks,
        taskDone: p.taskDone || [], investments: p.investments || [], snapshots: p.snapshots || [],
        goal: Number(p.goal) || 15000,
      });
      if (Array.isArray(p.people)) state.people = [...new Set([...state.people, ...p.people])].slice(0, 10);
      if (!periodManual) period = null;
      refresh();
      syncStatus('Dados do banco atualizados', 'ok');
      return;
    }
    if (d.type === 'fp-persist-ok') {
      const waiter = persistWaiters.get(String(d.requestId));
      if (waiter) {
        clearTimeout(waiter.timer);
        persistWaiters.delete(String(d.requestId));
        waiter.resolve();
      }
      if (d.requestId === String(persistSeq)) { dirty = false; syncStatus('Salvo no banco', 'ok'); }
      return;
    }
    if (d.type === 'fp-persist-erro') {
      const waiter = persistWaiters.get(String(d.requestId));
      if (waiter) {
        clearTimeout(waiter.timer);
        persistWaiters.delete(String(d.requestId));
        waiter.reject(new Error(d.erro || 'Falha ao salvar no banco.'));
      }
      dirty = false; // a página recarrega do banco em seguida
      syncStatus('Erro ao salvar: ' + (d.erro || 'tente de novo'), 'err');
      return;
    }
    if (d.type === 'fp-file-ok' || d.type === 'fp-file-data' || d.type === 'fp-file-erro') {
      const cb = fileWaiters.get(d.requestId);
      if (cb) { fileWaiters.delete(d.requestId); cb(d); }
      return;
    }
    if (d.type === 'fp-user') {
      const nome = String(d.nome || 'Usuário');
      $('#userName').textContent = nome;
      $('#userAvatar').textContent = nome.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
      $('#userBox').hidden = false;
      $('#userRole').textContent = d.admin ? 'Admin' : 'Editor';
      $('#mUserName').textContent = nome;
      const mudou = !isAdmin || canAudit !== !!d.admin || userName !== nome;
      isAdmin = true;
      canAudit = !!d.admin;
      userName = nome;
      userId = String(d.userId || '');
      $$('[data-audit-only]').forEach(el => el.classList.toggle('is-hidden', !canAudit));
      if (!canAudit && view === 'audit') show('overview');
      if (mudou) render();
    }
    if (d.type === 'fp-audit-data' || d.type === 'fp-audit-erro') {
      if (d.requestId === auditReq) auditReceber(d);
      return;
    }
  });
  $('#btnSair').addEventListener('click', () => avisarPai({ type: 'fp-sair' }));
  $('#btnTrocarSistema').addEventListener('click', () => avisarPai({ type: 'fp-trocar-sistema' }));
  $('#mSair').addEventListener('click', () => avisarPai({ type: 'fp-sair' }));
  $('#mTrocar').addEventListener('click', () => avisarPai({ type: 'fp-trocar-sistema' }));
  const mMenu = (abrir) => { $('#mUserMenu').hidden = !abrir; $('#mUserBtn').setAttribute('aria-expanded', String(abrir)); };
  $('#mUserBtn').addEventListener('click', e => { e.stopPropagation(); mMenu($('#mUserMenu').hidden); });
  $$('#mUserMenu [data-go]').forEach(b => b.addEventListener('click', () => mMenu(false)));
  document.addEventListener('click', e => { if (!e.target.closest('.m-user')) mMenu(false); });

  /* Comprovantes no modo banco: upload/download pela página React (bucket fp-comprovantes) */
  const fileWaiters = new Map();
  let fileSeq = 0;
  const pedirArquivo = msg => new Promise((resolve, reject) => {
    const requestId = 'f' + (++fileSeq);
    const timer = setTimeout(() => { fileWaiters.delete(requestId); reject(new Error('Tempo esgotado ao transferir o comprovante.')); }, 120000);
    fileWaiters.set(requestId, d => { clearTimeout(timer); d.type === 'fp-file-erro' ? reject(new Error(d.erro)) : resolve(d); });
    window.parent.postMessage({ ...msg, requestId }, location.origin);
  });
  if (REMOTE) {
    const remoteUrls = new Map();
    const get = async id => {
      const d = await pedirArquivo({ type: 'fp-file-get', id });
      return { id, name: d.name, type: d.mime || d.blob.type, size: d.size || d.blob.size, blob: d.blob };
    };
    Object.assign(FPComprovantes, {
      put: async (file, entidadeId, entidade = 'lancamento') => {
        const erro = FPComprovantes.validar(file);
        if (erro) throw new Error(erro);
        const d = await pedirArquivo({ type: 'fp-file-put', file, name: file.name, entidadeId, entidade });
        return d.id;
      },
      get: async id => { try { return await get(id); } catch { return null; } },
      del: async id => {
        if (!id) return;
        try { await pedirArquivo({ type: 'fp-file-del', id }); }
        catch { /* se o registro já sumiu, segue */ }
      },
      url: async id => {
        if (remoteUrls.has(id)) return remoteUrls.get(id);
        const rec = await get(id);
        const u = URL.createObjectURL(rec.blob);
        remoteUrls.set(id, u);
        return u;
      },
    });
    document.querySelector('#taskEditorNote span')?.insertAdjacentText('beforeend', '');
  }

  /* ---------- Início ---------- */
  $('#today').textContent = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    .replace(/^./, c => c.toUpperCase());
  refresh();
  avisarPai({ type: 'fp-pronto' });
})();
