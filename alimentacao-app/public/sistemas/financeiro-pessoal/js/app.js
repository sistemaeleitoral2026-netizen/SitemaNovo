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
    'Moradia': 'house', 'Alimentação': 'utensils', 'Transporte': 'car', 'Saúde': 'heart-pulse',
    'Lazer': 'gamepad-2', 'Compras': 'shopping-cart', 'Contas da casa': 'credit-card', 'Outros': 'ellipsis',
    'Salário': 'briefcase', 'Renda extra': 'circle-dollar-sign', 'Rendimentos': 'trending-up',
  };
  const TITLES = {
    overview: 'Visão geral', transactions: 'Movimentações',
    pagamentos: 'Pagamentos', cobrancas: 'Cobranças', documentacao: 'Documentação',
    accounts: 'Contas', investments: 'Investimentos', reports: 'Relatórios',
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
  const money = n => brl.format(n);
  const signed = n => (n >= 0 ? '+ ' : '− ') + brl.format(Math.abs(n));

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
  // Permissão: dentro do sistema, o React informa se é admin (mensagem fp-user). Aberto direto, é admin.
  const embedded = window.parent !== window;
  // Modo banco: aberto pelo sistema com ?remote=1 → dados nas tabelas fp_* (via página React).
  // Fora disso (arquivo aberto direto), continua no localStorage com dados de exemplo.
  const REMOTE = embedded && new URLSearchParams(location.search).has('remote');
  let isAdmin = !embedded;
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
  const syncStatus = (txt, cls = '') => {
    const el = document.getElementById('syncStatus');
    if (el) { el.textContent = txt; el.className = 'sync-status ' + cls; }
  };
  const save = () => {
    if (!REMOTE) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { alert('Não foi possível salvar neste navegador (armazenamento cheio ou bloqueado).'); }
      return;
    }
    dirty = true;
    syncStatus('Salvando…', 'saving');
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      const { accounts, accChecks, txs, tasks, taskDone, investments, snapshots, goal } = state;
      window.parent.postMessage({ type: 'fp-persist', requestId: String(++persistSeq),
        payload: JSON.parse(JSON.stringify({ accounts, accChecks, txs, tasks, taskDone, investments, snapshots, goal })) }, location.origin);
    }, 250);
  };
  // Quem pode excluir no modo banco: admin, ou quem criou o registro
  // Fora de Tarefas, qualquer pessoa com acesso exclui. Lançamento de tarefa (desfazer baixa) só admin.
  const canDelete = item => !REMOTE || isAdmin || !item?.taskId;
  const stamp_ = () => (REMOTE && userId ? { createdBy: userId } : {});

  let period = null;
  let view = 'overview';
  let taskView = 'pagamento'; // tipo mostrado na tela de compromissos
  const taskTabs = { pagamento: 'open', cobranca: 'open', documentacao: 'pend' }; // aba escolhida por tipo
  let taskTab = 'open';
  let taskPage = 1;
  const TASK_PAGE = 12;
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
  const accBalance = (a, k) => balanceAt(a, `${k}-31T23:59`);
  const checksOf = id => state.accChecks.filter(c => c.accId === id).sort((a, b) => chkStamp(a).localeCompare(chkStamp(b)));
  const checkDiff = c => { const a = state.accounts.find(x => x.id === c.accId); return a ? Math.round((c.balance - balanceAt(a, chkStamp(c), c.id)) * 100) / 100 : 0; };
  const totalBalance = k => state.accounts.reduce((s, a) => s + accBalance(a, k), 0);
  const prevMonth = k => { let [y, m] = k.split('-').map(Number); m -= 1; if (!m) { m = 12; y -= 1; } return `${y}-${String(m).padStart(2, '0')}`; };
  const byDateDesc = (a, b) => b.date.localeCompare(a.date);

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
  function txRow(x, withDelete) {
    return `<tr>
      <td><div class="t-desc"><span class="t-ico">${icon(CAT_ICON[x.category] || 'ellipsis', 'i-sm')}</span><div>${esc(x.description)}${x.taskId ? `<span class="tag task-tag">${taskById(x.taskId) && taskKind(taskById(x.taskId)) === 'cobranca' ? 'Cobrança recebida' : 'Pagamento programado'}</span>` : ''}${x.receiptId ? `<button class="clip" data-receipt="${x.receiptId}" data-rtx="${x.id}" title="Ver comprovante" aria-label="Ver comprovante">${icon('paperclip')}</button>` : ''}${x.payee ? `<span class="t-payee">${esc(x.payee)}</span>` : ''}</div></div></td>
      <td>${esc(x.category)}</td>
      <td class="t-muted">${esc(accName(x.account))}</td>
      <td class="t-muted num">${shortDate(x.date)}${x.time ? ` · ${x.time}` : ''}</td>
      <td class="t-right num amount ${x.kind === 'income' ? 'in' : 'out'}">${signed(value(x))}</td>
      ${withDelete ? `<td class="t-right" style="width:44px"><button class="icon-btn" data-del-tx="${x.id}" aria-label="Excluir lançamento">${icon('trash-2', 'i-sm')}</button></td>` : ''}
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

  /** Quadro "Resumo em números" da visão geral (substitui o gráfico). */
  function renderNumbers(k, list, sched, next) {
    const grid = $('#numGrid');
    if (!grid) return;
    const mName = m => MONTHS_FULL[+m.slice(5) - 1].toLowerCase();
    const pay = sched.filter(x => x.kind === 'expense'), get = sched.filter(x => x.kind === 'income');
    const payNow = pay.filter(x => ym(x.date) === k), payNext = pay.filter(x => ym(x.date) === next);
    const paidNow = list.filter(x => x.kind === 'expense'), gotNow = list.filter(x => x.kind === 'income');
    const tot = l => l.reduce((s, x) => s + (x.amount || 0), 0);
    const undef = l => l.filter(x => !x.amount).length;
    const qty = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
    const extra = l => (undef(l) ? ` · ${undef(l)} sem valor` : '');
    const saldo = totalBalance(k);
    const previsto = saldo - tot(pay) + tot(get);
    const late = pay.filter(x => x.status === 'atrasada');
    const maior = pay.slice().sort((a, b) => (b.amount || 0) - (a.amount || 0))[0];
    const lastM = sched.length ? sched.map(x => ym(x.date)).sort().at(-1) : k;
    const cell = (label, val, foot, cls = '') => `<div class="num-cell ${cls}"><div class="num-label">${label}</div><div class="num-val num">${val}</div><div class="num-foot">${foot}</div></div>`;
    $('#numMeta').textContent = `${monthLabel(k)}${lastM !== k ? ` e ${mName(lastM)}` : ''}`;
    grid.innerHTML = [
      cell(`Saldo previsto ao fim de ${mName(lastM)}`, signed(previsto), `saldo hoje ${money(saldo)} − a pagar + a receber`, previsto < 0 ? 'is-neg' : 'is-pos'),
      cell(`A pagar ainda em ${mName(k)}`, money(tot(payNow)), `${qty(payNow.length, 'conta', 'contas')}${extra(payNow)}${late.length ? ` · <b class="delta-neg">${late.length} atrasada${late.length === 1 ? '' : 's'}</b>` : ''}`, payNow.length ? 'is-neg' : ''),
      cell(`A pagar em ${mName(next)}`, money(tot(payNext)), `${qty(payNext.length, 'conta', 'contas')}${extra(payNext)}`, payNext.length ? 'is-neg' : ''),
      cell('A receber (agendado)', money(tot(get)), qty(get.length, 'cobrança', 'cobranças'), get.length ? 'is-pos' : ''),
      cell(`Já pago em ${mName(k)}`, money(tot(paidNow)), `${qty(paidNow.length, 'lançamento', 'lançamentos')} · recebido ${money(tot(gotNow))}`),
      cell('Maior conta agendada', maior && maior.amount ? money(maior.amount) : '—', maior ? `${esc(maior.description)} · ${shortDate(maior.date)}` : 'nada agendado'),
    ].join('');

    const today = todayISO();
    const prox = sched.slice().sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
    $('#numNext').innerHTML = prox.length ? `<table class="num-table"><tbody>${prox.map(x => {
      const d = daysBetween(today, x.date);
      const quando = d < 0 ? `<span class="delta-neg">${-d} dia${d === -1 ? '' : 's'} atrasado</span>` : d === 0 ? '<span class="delta-neg">vence hoje</span>' : `em ${d} dia${d === 1 ? '' : 's'}`;
      return `<tr><td class="num">${fullDate(x.date)}</td><td class="num-t">${esc(x.description)}</td><td class="t-muted">${quando}</td><td class="t-right num ${x.kind === 'income' ? 'delta-pos' : 'delta-neg'}">${x.amount ? signed(value(x)) : '<span class="t-faint">a definir</span>'}</td></tr>`;
    }).join('')}</tbody></table>` : '<div class="empty">Nenhum vencimento agendado.</div>';
  }

  /** Linha da planilha "Últimos lançamentos" (lançamentos reais e agendamentos sem baixa). */
  function overviewTxRow(x) {
    const inc = x.kind === 'income';
    const t = x.taskId ? taskById(x.taskId) : null;
    const cob = t && taskKind(t) === 'cobranca';
    const origin = x.scheduled
      ? (inc ? 'Cobrança a receber' : 'Pagamento a fazer')
      : x.taskId ? (cob ? 'Cobrança recebida' : 'Pagamento programado') : 'Lançamento avulso';
    const sit = x.scheduled
      ? `<span class="tag sched-tag ${x.status === 'atrasada' ? 'is-late' : ''}">${x.status === 'atrasada' ? 'Atrasado' : x.status === 'hoje' ? 'Vence hoje' : 'Agendado'}</span>`
      : `<span class="tag sheet-done">${inc ? 'Recebido' : 'Pago'}</span>`;
    const acc = x.account && accName(x.account) !== '—' ? esc(accName(x.account)) : '<span class="t-faint">—</span>';
    const val = x.scheduled && !x.amount ? '<span class="t-faint">a definir</span>'
      : `${signed(value(x))}${x.scheduled && x.variable ? '<small>estimado</small>' : ''}`;
    return `<tr class="${x.scheduled ? 'is-scheduled' : ''}">
      <td class="num">${fullDate(x.date)}${x.time ? `<small>${x.time}</small>` : ''}</td>
      <td class="sheet-desc"><span class="sheet-desc-in">${esc(x.description)}${x.receiptId ? `<button class="clip" data-receipt="${x.receiptId}" data-rtx="${x.id}" title="Ver comprovante" aria-label="Ver comprovante">${icon('paperclip')}</button>` : ''}</span></td>
      <td>${esc(x.category)}</td>
      <td>${acc}</td>
      <td>${origin}</td>
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
    const groups = {}, sched = {};
    exp.forEach(x => {
      groups[x.category] = (groups[x.category] || 0) + x.amount;
      if (x.scheduled) sched[x.category] = (sched[x.category] || 0) + x.amount;
    });
    let rows = Object.entries(groups).map(([c, v]) => [c, v, sched[c] || 0]).sort((a, b) => b[1] - a[1]);
    if (limit && rows.length > limit) {
      const rest = rows.slice(limit - 1);
      rows = [...rows.slice(0, limit - 1), ['Demais categorias', rest.reduce((s, r) => s + r[1], 0), rest.reduce((s, r) => s + r[2], 0)]];
    }
    const max = rows[0][1];
    return rows.map(([c, v, s]) => `
      <div class="cat-row">
        <div class="cat-name">${icon(CAT_ICON[c] || 'ellipsis', 'i-sm')}${esc(c)}</div>
        <div class="cat-val num">${money(v)}<small>${pct(v / total)}</small></div>
        <div class="cat-bar" title="${s ? `${money(s)} agendado` : ''}${s && v - s > 0.004 ? ' · ' : ''}${v - s > 0.004 ? `${money(v - s)} pago` : ''}">${v - s > 0.004 ? `<span style="width:${((v - s) / max) * 100}%"></span>` : ''}${s ? `<span class="is-sched" style="width:${(s / max) * 100}%"></span>` : ''}</div>
      </div>`).join('');
  }

  function accRows(k, withDelete) {
    if (!state.accounts.length) return '<div class="empty">Nenhuma conta cadastrada.</div>';
    const rows = state.accounts.map(a => `
      <div class="acc-row">
        <div class="acc-ico">${icon(a.type === 'Dinheiro em espécie' ? 'wallet' : 'landmark', 'i-sm')}</div>
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

  function investChart() {
    const svg = $('#investChart');
    const dates = [...new Set(state.snapshots.map(s => s.date))].sort().slice(-20);
    if (!dates.length) { svg.innerHTML = ''; svg.style.height = '0'; svg.insertAdjacentHTML('afterend', ''); return; }
    const W = svg.clientWidth || 600, H = Math.round(Math.min(320, Math.max(220, W * 0.3))), pad = { l: 56, r: 14, t: 16, b: 26 };
    // Total do dia = soma do último saldo conhecido de cada aplicação até aquele dia
    const data = dates.map(d => ({
      d, v: state.investments.reduce((s, inv) => {
        const l = snapsOf(inv.id).filter(x => x.date <= d);
        return s + (l.at(-1)?.balance ?? 0);
      }, 0),
    }));
    const vals = data.map(x => x.v), lo = Math.min(...vals), hi = Math.max(...vals);
    const spread = Math.max(hi - lo, hi * 0.002, 10);
    const { y, out: grid } = axes(svg, W, H, pad, lo - spread * 0.4, hi + spread * 0.4);
    const n = data.length, span = W - pad.l - pad.r;
    const x = i => n === 1 ? pad.l + span / 2 : pad.l + 8 + (span - 16) * i / (n - 1);
    const pts = data.map((p, i) => [x(i), y(p.v)]);
    const base = H - pad.b;
    let out = grid + `<path class="area-acc" d="${smooth(pts)} L${pts.at(-1)[0]},${base} L${pts[0][0]},${base} Z"/><path class="line-acc" d="${smooth(pts)}"/>`;
    const every = Math.ceil(n / 8);
    data.forEach((p, i) => {
      const prev = data[i - 1];
      out += `<circle class="pt pt-acc" cx="${pts[i][0]}" cy="${pts[i][1]}" r="${i === n - 1 ? 4.5 : 3}"/>
        <rect class="hit" x="${pts[i][0] - span / n / 2}" y="${pad.t}" width="${span / n}" height="${H - pad.t - pad.b}"><title>${fullDate(p.d)}\nTotal investido: ${money(p.v)}${prev ? `\nVariação no dia: ${signed(p.v - prev.v)}` : ''}</title></rect>`;
      if (i % every === 0 || i === n - 1) out += `<text x="${pts[i][0]}" y="${H - 6}" text-anchor="middle">${shortDate(p.d)}</text>`;
    });
    out += `<text class="val" style="fill:var(--chart-line)" x="${pts.at(-1)[0]}" y="${pts.at(-1)[1] - 10}" text-anchor="end">${money(data.at(-1).v)}</text>`;
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

  function occursIn(t, k) {
    const r = t.rec || {};
    const start = asMonth(t.start);
    const end = asMonth(t.end);
    if (r.type === 'once') return asMonth(r.dateTo || r.dateFrom || '') === k;
    if (start && k < start) return false;
    if (end && k > end) return false;
    if (r.type === 'yearly') return +k.slice(5) === +r.month;
    return monthDiff(start || k, k) % (r.every || 1) === 0;
  }

  function occurrence(t, k) {
    const r = t.rec || {};
    let from, to;
    if (r.type === 'once') { to = r.dateTo || r.dateFrom; from = r.dateFrom || to; }
    else { from = dayIn(k, r.dayFrom); to = dayIn(k, Math.max(r.dayTo || r.dayFrom, r.dayFrom)); }
    const done = doneOf(t.id, k);
    const today = todayISO();
    const status = done ? done.status : today > to ? 'atrasada' : today === to ? 'hoje' : today >= from ? 'aberta' : 'futura';
    return { task: t, period: k, from, to, done, status, key: `${t.id}|${k}` };
  }

  function occurrencesIn(k) {
    return state.tasks
      .filter(t => occursIn(t, k) && (!t.paused || doneOf(t.id, k)))
      .map(t => occurrence(t, k));
  }

  // Atrasadas de até 12 meses antes do mês k
  function overdueBefore(k) {
    const out = [];
    for (let i = 12; i >= 1; i--) occurrencesIn(addMonths(k, -i)).forEach(o => { if (o.status === 'atrasada') out.push(o); });
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
      const o = occurrence(t, m);
      if (!o.done) return o;
    }
    return null;
  }

  function recLabel(t) {
    const r = t.rec || {};
    if (r.type === 'once') return 'Única';
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
    if (ff === 'anual' && r.type !== 'yearly') return false;
    if (ff === 'mensal' && (r.type === 'once' || r.type === 'yearly' || (r.every || 1) !== 1)) return false;
    if (ff === 'periodico' && (r.type === 'once' || r.type === 'yearly' || (r.every || 1) <= 1)) return false;
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
    if (pages === 1) return `<div class="task-pager"><span class="t-muted">${total} item(ns)</span></div>`;
    const btns = [];
    for (let i = 1; i <= pages; i++) {
      if (pages > 7 && i !== 1 && i !== pages && Math.abs(i - taskPage) > 2) {
        if (btns[btns.length - 1] !== '…') btns.push('…');
        continue;
      }
      btns.push(i);
    }
    return `<div class="task-pager">
      <span class="t-muted">${start}–${end} de ${total}</span>
      <div class="task-pager-btns">
        <button type="button" class="btn btn-sm" data-task-page="${taskPage - 1}" ${taskPage <= 1 ? 'disabled' : ''} aria-label="Anterior">‹</button>
        ${btns.map(i => i === '…'
          ? '<span class="t-muted">…</span>'
          : `<button type="button" class="btn btn-sm ${i === taskPage ? 'on' : ''}" data-task-page="${i}">${i}</button>`).join('')}
        <button type="button" class="btn btn-sm" data-task-page="${taskPage + 1}" ${taskPage >= pages ? 'disabled' : ''} aria-label="Próxima">›</button>
      </div>
    </div>`;
  }

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
          <strong>${esc(dueHeadline(o))}</strong>
          <span class="due-banner-meta">${esc(KIND_LABEL[kind])}${valor ? ` · ${valor}` : ''} · ${windowLabel(o)}</span>
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
    if (!d) {
      actions += launchBtn(o);
      if (isAdmin) actions += `<button class="icon-btn" data-skip="${o.key}" title="Dispensar neste mês" aria-label="Dispensar neste mês">${icon('ban', 'i-sm')}</button>`;
    } else if (d.status === 'paga' || d.status === 'cobrada') {
      if (d.receiptId) actions += `<button class="btn btn-sm" data-receipt="${d.receiptId}" data-rtx="${d.txId}">${icon('paperclip', 'i-sm')}Comprovante</button>`;
      if (isAdmin) actions += `<button class="icon-btn danger" data-undo="${o.key}" title="Desfazer" aria-label="Desfazer">${icon('undo-2', 'i-sm')}</button>`;
    } else if (isAdmin) {
      actions += `<button class="icon-btn" data-undo="${o.key}" title="Reabrir" aria-label="Reabrir">${icon('undo-2', 'i-sm')}</button>`;
    }
    if (isAdmin) actions += `<button class="icon-btn" data-edit-task="${t.id}" title="Editar" aria-label="Editar">${icon('pencil-line', 'i-sm')}</button>`;
    const prevMonthTag = o.period !== period && OPEN.includes(o.status) ? `<span class="tag rec">${monthLabel(o.period)}</span>` : '';
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
      return `<button type="button" class="btn btn-sm btn-action btn-doc" data-pay="${o.key}" data-pay-mode="documentacao">${icon('check', 'i-sm')}Concluir pendência</button>`;
    }
    if (kind === 'cobranca') {
      return `<button type="button" class="btn btn-sm btn-action btn-charge" data-pay="${o.key}" data-pay-mode="cobranca">${icon('circle-dollar-sign', 'i-sm')}Registrar recebimento</button>`;
    }
    return `<button type="button" class="btn btn-sm btn-action btn-pay" data-pay="${o.key}" data-pay-mode="pagamento">${icon('check', 'i-sm')}Registrar pagamento</button>`;
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

  function valueCell(o) {
    const t = o.task, d = o.done;
    if (isMoneyDone(d) && d.amount != null) return `<span class="num">${money(d.amount)}</span>`;
    if (t.expected != null) return `<span class="num">${money(t.expected)}</span>`;
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
    const d = o.done;
    let a = launchBtn(o);
    if (isMoneyDone(d) && d.receiptId) a += `<button class="btn btn-sm" data-receipt="${d.receiptId}" data-rtx="${d.txId}" title="Ver comprovante" aria-label="Ver comprovante">${icon('paperclip', 'i-sm')}</button>`;
    if (d && isAdmin) a += `<button class="icon-btn" data-undo="${o.key}" title="${d.status === 'dispensada' ? 'Reabrir' : 'Desfazer registro'}" aria-label="Desfazer">${icon('undo-2', 'i-sm')}</button>`;
    if (!d && isAdmin) a += `<button class="icon-btn" data-skip="${o.key}" title="Dispensar neste mês" aria-label="Dispensar neste mês">${icon('ban', 'i-sm')}</button>`;
    return a;
  }

  function adminTaskActions(t) {
    if (!isAdmin) return '';
    const once = (t.rec || {}).type === 'once';
    const editTitle = once ? 'Editar' : 'Editar o cadastro (vale para os próximos meses; registros já feitos não mudam)';
    return `<button class="icon-btn" data-edit-task="${t.id}" title="${editTitle}" aria-label="Editar">${icon('pencil-line', 'i-sm')}</button>`
      + (once ? '' : `<button class="icon-btn" data-pause-task="${t.id}" title="${t.paused ? 'Retomar' : 'Pausar'}" aria-label="${t.paused ? 'Retomar' : 'Pausar'}">${icon(t.paused ? 'play' : 'pause', 'i-sm')}</button>`)
      + `<button class="icon-btn danger" data-del-task="${t.id}" title="Excluir cadastro" aria-label="Excluir">${icon('trash-2', 'i-sm')}</button>`;
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
    const filtered = list.filter(o => taskMatchesFilters(o.task) && (isDoc || st === 'all' || o.status === st));
    if (!filtered.length) return `<div class="task-empty">${icon('search')}Nada com esses filtros.</div>`;
    const rows = pageSlice(filtered).map(o => {
      const t = o.task;
      const otherMonth = !isDoc && !showMonth && o.period !== period ?` <span class="tag rec">${monthLabel(o.period)}</span>` : '';
      return `<tr class="occ-row st-${o.status}">
        <td class="sheet-cell sheet-title">${esc(t.title)}${otherMonth}<div class="sheet-due">${esc(recLabel(t))}${t.account && !isDoc ? ` · ${esc(accName(t.account))}` : ''}</div></td>
        <td class="sheet-cell">${esc(taskTarget(t))}</td>
        ${isDoc ? '' : `<td class="sheet-cell t-right">${valueCell(o)}</td>`}
        <td class="sheet-cell">${statusTag(o.status)}</td>
        <td class="sheet-cell">${windowLabel(o)}<div class="sheet-due">${esc(occNote(o))}</div></td>
        ${showMonth ? `<td class="sheet-cell t-muted">${monthLabel(o.period)}</td>` : ''}
        <td class="sheet-cell t-muted">${esc(taskIssuer(t))}</td>
        <td class="sheet-cell"><div class="sheet-actions">${occActions(o)}${adminTaskActions(t)}</div></td>
      </tr>`;
    }).join('');
    return `<div class="table-wrap sheet-wrap"><table class="sheet">
      <thead><tr>
        <th>${isDoc ? 'Pendência' : 'Conta'}</th><th>${PERSON_COL[kind]}</th>${isDoc ? '' : '<th class="t-right">Valor</th>'}
        <th>Situação</th><th>Prazo</th>${showMonth ? '<th>Mês</th>' : ''}<th>Cadastrado por</th><th>Ação</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>${taskPagerHtml(filtered.length)}`;
  }

  /** Recorrentes: o cadastro + como está o mês escolhido + próximo vencimento. */
  function recurringSheet() {
    const kind = taskView;
    const all = state.tasks.filter(t => taskKind(t) === kind && (t.rec || {}).type !== 'once');
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
        <td class="sheet-cell sheet-title">${esc(t.title)}<div class="sheet-due">${esc(recLabel(t))} · ${t.rec?.dayFrom === t.rec?.dayTo || !t.rec?.dayTo ? `dia ${t.rec?.dayFrom}` : `dias ${t.rec.dayFrom}–${t.rec.dayTo}`}</div></td>
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

  function kpi(label, value, foot, cls = '') {
    return `<div class="kpi"><div class="kpi-label">${label}</div><div class="kpi-value num ${cls}">${value}</div><div class="kpi-foot">${foot}</div></div>`;
  }

  function renderTaskKpis() {
    const kind = taskView;
    if (kind === 'documentacao') {
      const docs = state.tasks.filter(t => taskKind(t) === kind).map(docOccurrence).filter(Boolean);
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
    const open = inMonthL.filter(o => !o.done);
    const exp = l => l.reduce((s, o) => s + (o.task.expected || 0), 0);
    const doneSum = done.reduce((s, o) => s + (o.done.amount || 0), 0);
    const vars = open.filter(o => o.task.expected == null).length;
    const mes = monthLabel(period).split(' ')[0].toLowerCase();
    const n = (c, s, p) => `${c} ${c === 1 ? s : p}`;
    $('#taskKpis').innerHTML =
      kpi(isCharge ? 'Previsto a receber' : 'Previsto no mês', money(doneSum + exp(open)),
        `${n(inMonthL.length, isCharge ? 'cobrança' : 'conta', isCharge ? 'cobranças' : 'contas')} em ${mes}`)
      + kpi(isCharge ? 'Já recebido' : 'Já pago', money(doneSum),
        n(done.length, 'registro', 'registros'), 'delta-pos')
      + kpi(isCharge ? 'A receber' : 'A pagar', money(exp(open)),
        `${n(open.length, 'pendente', 'pendentes')}${vars ? ` · ${n(vars, 'variável', 'variáveis')}` : ''}`)
      + kpi('Atrasados', n(late.length, isCharge ? 'cobrança' : 'pagamento', isCharge ? 'cobranças' : 'pagamentos'),
        late.length ? `${money(exp(late))} previstos` : 'nada atrasado', late.length ? 'delta-neg' : '');
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
      sel.innerHTML = '<option value="all">Todas as situações</option>'
        + opts.map(s => `<option value="${s}">${STATUS_LABEL[s]}</option>`).join('');
      sel.value = opts.includes(cur) ? cur : 'all';
      sel.dataset.kind = statusContext;
    }
    if (sel) sel.hidden = isDoc;
    $('#tfMore').hidden = isDoc;
    if (isDoc) $('#tfMorePanel').hidden = true;
    const freq = $('#tfFreq');
    if (freq) freq.hidden = taskTab === 'once';
    $('#taskNewBtn span').textContent = NEW_LABEL[kind];
    $('#tq').placeholder = isDoc ? 'Buscar pendência ou responsável…' : 'Buscar conta, pessoa, banco…';
    $('#taskTabs').innerHTML = TASK_TABS[kind]
      .map(([id, label]) => `<button type="button" data-ttab="${id}" class="${id === taskTab ? 'on' : ''}">${label}</button>`).join('');
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
      const docs = state.tasks.filter(t => taskKind(t) === kind).map(docOccurrence).filter(Boolean).sort(occSort);
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
      html = `<div class="task-window-note">${icon('calendar-clock', 'i-sm')}<span>Mostrando atrasados e tudo ${label} até o fim de <strong>${esc(next)}</strong>. Itens concluídos saem desta lista.</span></div>`
        + occurrencesSheet(list, `Nada ${label} neste mês nem no próximo.`, { showMonth: true });
    } else if (taskTab === 'done') {
      html = occurrencesSheet(completedOccurrences(kind), kind === 'cobranca' ? 'Nenhum recebimento concluído.' : 'Nenhum pagamento concluído.', { showMonth: true });
    } else if (taskTab === 'rec') {
      html = recurringSheet();
    } else if (taskTab === 'once') {
      const list = state.tasks
        .filter(t => taskKind(t) === kind && (t.rec || {}).type === 'once')
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
      const mine = k && k !== 'all' ? list.filter(o => taskKind(o.task) === k) : list;
      b.hidden = !mine.length;
      b.textContent = mine.length;
      b.classList.toggle('soft', !mine.some(o => o.status === 'atrasada'));
    });
  }

  function applyRole() {
    $$('[data-admin-only]').forEach(el => el.classList.toggle('is-hidden', !isAdmin));
    $('#taskEditorNote').hidden = isAdmin || !embedded;
  }

  /* ---------- Formulário de programação (admin) ---------- */
  function taskFormType() { return $('input[name="tkType"]:checked').value; }
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
    // Documentação: sempre prazo único (sem Recorrente / Uma vez)
    if (isDoc) $('#tkTypeO').checked = true;
    const type = isDoc ? 'once' : taskFormType();
    const freq = $('#tkFreq').value;
    const f = TK_FIELDS[kind];

    $$('[data-tk-kind]').forEach(el => {
      const allowed = (el.getAttribute('data-tk-kind') || '').split(/\s+/);
      el.hidden = !allowed.includes(kind);
    });
    $$('[data-tk-when]').forEach(el => { el.hidden = isDoc; });
    $$('[data-tk="rec"]').forEach(el => { el.hidden = isDoc || type !== 'rec'; });
    $$('[data-tk="once"]').forEach(el => { el.hidden = !(isDoc || type === 'once'); });
    $$('[data-tk="year"]').forEach(el => { el.hidden = isDoc || !(type === 'rec' && freq === 'y'); });

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
    $('#tkDayLabel').textContent = f.day;
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

    const person = $('#tkPerson')?.value.trim() || '';
    const subject = $('#tkName')?.value.trim() || KIND_LABEL[kind];
    const amt = kind === 'cobranca' ? moneyVal('#tkChargeAmount') : moneyVal('#tkAmount');
    let timing = '';
    if (!isDoc && type === 'rec') {
      const fixed = $('input[name="tkDayMode"]:checked').value === 'fixed';
      const df = +$('#tkDayFrom').value || 1, dt = fixed ? df : (+$('#tkDayTo').value || df);
      const freqTxt = { m1: 'todo mês', m2: 'a cada 2 meses', m3: 'a cada 3 meses', m6: 'a cada 6 meses', y: `todo ano em ${MONTHS_FULL[+$('#tkMonth').value - 1]?.toLowerCase()}` }[freq];
      const win = df === dt ? `no dia ${df}` : `entre os dias ${Math.min(df, dt)} e ${Math.max(df, dt)}`;
      const st = $('#tkStart').value, en = $('#tkEnd').value;
      timing = `${freqTxt}, ${win}${st ? `, a partir de ${monthLabel(st).toLowerCase()}` : ''}${en ? ` até ${monthLabel(en).toLowerCase()}` : ''}`;
    } else {
      const a = $('#tkDateFrom').value, b = $('#tkDateTo').value;
      timing = a && b ? `de ${fullDate(a)} até ${fullDate(b)}` : b ? `até ${fullDate(b)}` : a ? `a partir de ${fullDate(a)}` : 'em data a definir';
    }
    let txt = '';
    if (kind === 'pagamento') {
      txt = `Pagamento: ${subject}${person ? ` para ${person}` : ''}. ${amt > 0 && !varies ? money(amt) : 'Valor não informado'}. Programado ${timing}.`;
    } else if (kind === 'documentacao') {
      const created = $('#tkDocCreated')?.value;
      txt = `Documentação: ${subject}${person ? ` — responsável: ${person}` : ''}.${created ? ` Cadastrada em ${fullDate(created)}.` : ''} Resolver ${timing}. Sem valor financeiro.`;
    } else {
      txt = `Cobrança: ${subject}${person ? ` de ${person}` : ''}. ${amt > 0 ? money(amt) : 'Valor não informado'}. Programada ${timing}. O recebimento só será lançado quando confirmado.`;
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
    $('#tkTitle').textContent = t ? `Editar ${KIND_LABEL[kind].toLowerCase()}` : NEW_LABEL[kind];
    $('#tkSubmit').textContent = t ? 'Salvar alterações' : 'Cadastrar';
    $('#tkCat').innerHTML = CATEGORIES.expense.map(c => `<option>${c}</option>`).join('');
    $('#tkMonth').innerHTML = MONTHS_FULL.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');
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
    $(kind === 'documentacao' || r.type === 'once' ? '#tkTypeO' : '#tkTypeR').checked = true;
    $('#tkFreq').value = r.type === 'yearly' ? 'y' : `m${[1, 2, 3, 6].includes(r.every) ? r.every : 1}`;
    $('#tkMonth').value = r.month || (+currentMonth().slice(5));
    $('#tkDayFrom').value = r.dayFrom || 10;
    $('#tkDayTo').value = r.dayTo || r.dayFrom || 15;
    $(t && r.type !== 'once' && r.dayFrom === r.dayTo ? '#tkDayFixed' : '#tkDayRange').checked = true;
    const start = t?.start || currentMonth();
    const end = t?.end || '';
    $('#tkStart').innerHTML = monthSelectOptions(start);
    $('#tkEnd').innerHTML = monthSelectOptions(end, { allowEmpty: true, emptyLabel: 'Sem fim' });
    $('#tkStart').value = start;
    $('#tkEnd').value = end;
    $('#tkDateFrom').value = r.dateFrom || todayISO();
    $('#tkDateTo').value = r.dateTo || (kind === 'documentacao' ? '' : addDays(todayISO(), 5));
    $('#tkNotes').value = t?.notes || '';
    updateTaskForm();
  }

  function saveTaskForm() {
    if (!isAdmin) return;
    const kind = taskFormKind();
    const isDoc = kind === 'documentacao';
    const type = isDoc ? 'once' : taskFormType();
    const freq = $('#tkFreq').value;
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
      if (!a || !b) { alert('Informe datas válidas para o período.'); return; }
      if (a > b) [a, b] = [b, a];
      rec = { type: 'once', dateFrom: a, dateTo: b };
      start = ym(a);
    } else {
      const fixed = $('input[name="tkDayMode"]:checked').value === 'fixed';
      let df = Math.min(Math.max(+$('#tkDayFrom').value || 1, 1), 31), dt = fixed ? df : Math.min(Math.max(+$('#tkDayTo').value || df, 1), 31);
      if (df > dt) [df, dt] = [dt, df];
      start = $('#tkStart').value || currentMonth();
      rec = freq === 'y'
        ? { type: 'yearly', every: 12, month: +$('#tkMonth').value, dayFrom: df, dayTo: dt }
        : { type: 'monthly', every: +freq.slice(1), dayFrom: df, dayTo: dt };
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
    if (id) Object.assign(taskById(id), data, { updatedAt: new Date().toISOString(), updatedBy: userName || 'Admin' });
    else state.tasks.push({
      id: uid(), ...data, paused: false,
      createdBy: userId || null,
      createdByName: userName || 'Admin',
      createdAt: new Date().toISOString(),
    });
    if (data.payee) rememberPayee(data.payee);
    if (data.chargeTo) rememberPayee(data.chargeTo);
    if (data.docOwner) rememberPerson(data.docOwner);
    save(); closeModals(); refresh();
  }

  /* ---------- Lançar programação (pagamento / documentação / cobrança) ---------- */
  function openPay(key, modeHint) {
    const [taskId, k] = key.split('|');
    const t = taskById(taskId);
    if (!t) return;
    if (doneOf(taskId, k)) { alert('Este item já foi lançado neste mês.'); return; }
    const mode = modeHint || taskKind(t);
    if (mode !== 'documentacao' && !state.accounts.length) {
      alert(mode === 'cobranca' ? 'Cadastre uma conta antes de lançar a cobrança.' : 'Cadastre uma conta antes de dar baixa.');
      return;
    }
    const o = occurrence(t, k);
    $('#pyMode').value = mode;
    $('#pyTitle').textContent = mode === 'documentacao' ? 'Concluir documentação'
      : mode === 'cobranca' ? 'Registrar recebimento' : 'Registrar pagamento';
    $('#pySubmit').innerHTML = `<svg class="i i-sm"><use href="#i-check"/></svg>${mode === 'documentacao' ? 'Concluir pendência' : mode === 'cobranca' ? 'Confirmar recebimento' : 'Confirmar pagamento'}`;
    $$('[data-py="pagamento"]').forEach(el => { el.hidden = mode !== 'pagamento'; });
    $$('[data-py="cobranca"]').forEach(el => { el.hidden = mode !== 'cobranca'; });
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
    if (doneOf(taskId, k)) { alert('Este item já foi lançado neste mês.'); return; }
    const mode = $('#pyMode').value === 'documentacao' || $('#pyMode').value === 'cobranca' ? $('#pyMode').value : 'pagamento';
    const by = (userName || '').trim();
    const note = $('#pyNote').value.trim(), date = $('#pyDate').value;
    $('#pyBy').value = by;
    if (!by) { alert('Não foi possível identificar quem está logado. Recarregue a página.'); return; }
    if (!date) { alert('Informe a data.'); return; }

    if (mode === 'documentacao') {
      state.taskDone.push({
        id: uid(), taskId, period: k, status: 'concluida',
        date, time: nowTime(), by, note,
      });
      rememberPerson(by);
      save(); closeModals(); refresh();
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
    try {
      let receiptId = null;
      const file = (isCharge ? uploads.charge : uploads.pay)?.file;
      const txId = uid();
      if (file) receiptId = await FPComprovantes.put(file, txId);
      const txKind = isCharge ? 'income' : 'expense';
      const status = isCharge ? 'cobrada' : 'paga';
      const category = isCharge ? 'Renda extra' : (t.category || 'Outros');
      state.txs.push({
        ...stamp_(), id: txId, date, time, amount, kind: txKind, description: t.title,
        category, account, payee, by, taskId, period: k, receiptId, note,
      });
      state.taskDone.push({
        id: uid(), taskId, period: k, status, txId, amount, account, date, time, by, payee, receiptId, note,
      });
      rememberPerson(by); rememberPayee(payee);
      save(); closeModals(); refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Não foi possível salvar o comprovante.');
    } finally {
      salvandoBaixa = false;
    }
  }

  function skipOccurrence(key) {
    if (!isAdmin) return;
    const [taskId, k] = key.split('|');
    const t = taskById(taskId);
    if (!t || doneOf(taskId, k)) return;
    if (!confirm(`Dispensar “${t.title}” em ${monthLabel(k).toLowerCase()}? Não será cobrada neste mês.`)) return;
    state.taskDone.push({ id: uid(), taskId, period: k, status: 'dispensada', date: todayISO(), time: nowTime(), by: userName || 'Admin' });
    save(); refresh();
  }

  function undoOccurrence(key) {
    if (!isAdmin) return;
    const [taskId, k] = key.split('|');
    const d = doneOf(taskId, k);
    if (!d) return;
    if (d.status === 'paga' || d.status === 'cobrada') {
      const tipo = d.status === 'cobrada' ? 'receita' : 'despesa';
      if (!confirm(`Desfazer? A ${tipo} de ${money(d.amount)} em Movimentações${d.receiptId ? ' e o comprovante' : ''} também serão excluídos.`)) return;
      state.txs = state.txs.filter(x => x.id !== d.txId);
      FPComprovantes.del(d.receiptId);
    } else if (!confirm('Reabrir este item da programação?')) {
      return;
    }
    state.taskDone = state.taskDone.filter(x => x !== d);
    save(); refresh();
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

  /* ======================================================================
     CONTAS — saldo inicial + conferências de saldo (saldo real do dia)
     ====================================================================== */
  function diffChip(d) {
    if (Math.abs(d) < 0.005) return '<span class="chip pos">confere</span>';
    return `<span class="chip ${d > 0 ? 'pos' : 'neg'} num">${signed(d)}</span>`;
  }
  const whenTxt = c => `${fullDate(c.date)} às ${c.time}`;

  function renderAccounts(k) {
    const total = totalBalance(k);
    const last = state.accChecks.slice().sort((a, b) => chkStamp(b).localeCompare(chkStamp(a)))[0];
    $('#accKpis').innerHTML = `
      <div class="account-total-panel">
        <div class="invest-eyebrow">Saldo total em contas</div>
        <div class="invest-total-value num ${total < 0 ? 'delta-neg' : ''}">${money(total)}</div>
        <div class="invest-total-meta">${state.accounts.length} conta${state.accounts.length === 1 ? ' cadastrada' : 's cadastradas'}</div>
      </div>
      <div class="account-update-panel">
        <div class="invest-eyebrow">Última conferência</div>
        <div class="invest-update-date num">${last ? whenTxt(last) : 'Nenhuma conferência'}</div>
        <div class="invest-total-meta">${last ? `${esc(accName(last.accId))} · verificado por ${esc(last.by)}` : 'Informe o saldo de uma conta para iniciar a conferência.'}</div>
      </div>`;

    const accountRows = state.accounts.map(a => {
      const bal = accBalance(a, k);
      const lc = checksOf(a.id).at(-1);
      const after = lc ? Math.round((bal - lc.balance) * 100) / 100 : null;
      return `<tr class="account-sheet-row">
        <td class="sheet-cell sheet-title"><span class="account-name-cell">${icon(a.type === 'Dinheiro em espécie' ? 'wallet' : 'landmark', 'i-sm')}${esc(a.name)}</span></td>
        <td class="sheet-cell"><span class="tag rec">${esc(a.type)}</span></td>
        <td class="sheet-cell t-right"><strong class="num ${bal < 0 ? 'delta-neg' : ''}">${money(bal)}</strong></td>
        <td class="sheet-cell t-right">${lc ? `<span class="num">${money(lc.balance)}</span>` : '<span class="t-muted">—</span>'}</td>
        <td class="sheet-cell t-right">${lc ? resultMoney(after) : '<span class="t-muted">sem conferência</span>'}</td>
        <td class="sheet-cell">${lc ? `${fullDate(lc.date)}<small>${lc.time}</small>` : '<span class="t-muted">Nunca</span>'}</td>
        <td class="sheet-cell">${lc ? `<span class="checked">${icon('user-round', 'i-sm')}${esc(lc.by)}</span>` : '—'}</td>
        <td class="sheet-cell"><div class="sheet-actions account-sheet-actions">
          <button class="btn btn-sm btn-primary" data-open="acccheck" data-acc="${a.id}">${icon('pencil-line', 'i-sm')}Informar saldo</button>
          <button class="icon-btn edit" data-edit-acc="${a.id}" title="Editar conta" aria-label="Editar conta">${icon('settings', 'i-sm')}</button>
          <button class="icon-btn" data-del-acc="${a.id}" title="Excluir conta" aria-label="Excluir conta">${icon('trash-2', 'i-sm')}</button>
        </div></td>
      </tr>`;
    }).join('');
    $('#accFull').innerHTML = state.accounts.length
      ? `<div class="table-wrap sheet-wrap account-sheet-wrap"><table class="sheet account-sheet">
          <thead><tr><th>Conta</th><th>Tipo</th><th class="t-right">Saldo atual</th><th class="t-right">Último saldo informado</th><th class="t-right">Lançamentos depois</th><th>Última conferência</th><th>Editor</th><th>Ação</th></tr></thead>
          <tbody>${accountRows}</tbody>
          <tfoot><tr><td class="sheet-cell" colspan="2"><strong>Total em contas</strong></td><td class="sheet-cell t-right"><strong class="num">${money(total)}</strong></td><td class="sheet-cell" colspan="5"></td></tr></tfoot>
        </table></div>`
      : '<div class="empty">Nenhuma conta cadastrada.</div>';

    const fa = $('#fAccCheck').value || 'all';
    const rows = state.accChecks.filter(c => fa === 'all' || c.accId === fa)
      .sort((a, b) => chkStamp(b).localeCompare(chkStamp(a))).slice(0, 80);
    $('#accCheckRows').innerHTML = rows.map(c => {
      const a = state.accounts.find(x => x.id === c.accId);
      const calc = a ? balanceAt(a, chkStamp(c), c.id) : 0;
      return `<tr>
        <td class="num">${fullDate(c.date)}</td>
        <td class="num t-muted">${c.time}</td>
        <td>${esc(accName(c.accId))}</td>
        <td class="t-right num amount">${money(c.balance)}</td>
        <td class="t-right num t-muted">${money(calc)}</td>
        <td class="t-right">${diffChip(c.balance - calc)}</td>
        <td><span class="checked">${icon('user-round', 'i-sm')}${esc(c.by)}</span></td>
        <td class="t-right" style="width:44px"><button class="icon-btn" data-del-check="${c.id}" aria-label="Excluir conferência">${icon('trash-2', 'i-sm')}</button></td>
      </tr>`;
    }).join('') || '<tr><td colspan="8" class="empty">Nenhum saldo informado ainda. Use “Informar saldo” para registrar o saldo real da conta.</td></tr>';
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
        <div class="acc-ico">${icon('piggy-bank', 'i-sm')}</div>
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
    renderNumbers(k, list, sched, next);
    $('#catMeta').textContent = sched.some(x => x.kind === 'expense')
      ? `${monthLabel(k).split(' ')[0]}${schedMonths.length > 1 ? ` + agendados até ${nextName.toLowerCase()}` : ' + agendados'}`
      : monthLabel(k);
    $('#catTop').innerHTML = catBreakdown([...list, ...sched], 6);
    const recent = [...sched, ...list].sort((a, b) => b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || ''));
    $('#recentRows').innerHTML = recent.slice(0, 10).map(overviewTxRow).join('') || '<tr><td colspan="7" class="empty">Nenhum lançamento neste mês.</td></tr>';
    $('#accSummary').innerHTML = accRows(k);
    renderInvTop();

    // Movimentações
    const q = $('#q').value.trim().toLowerCase(), fk = $('#fKind').value, fa = $('#fAccount').value;
    const fo = $('#fOrigin')?.value || 'all';
    const filtered = list.filter(x =>
      (fk === 'all' || x.kind === fk) && (fa === 'all' || x.account === fa) &&
      (fo === 'all' || (fo === 'avulso' ? !x.taskId : !!x.taskId)) &&
      (!q || `${x.description} ${x.category} ${accName(x.account)} ${x.payee || ''} ${x.by || ''}`.toLowerCase().includes(q)));
    $('#allRows').innerHTML = filtered.map(x => txRow(x, true)).join('') || '<tr><td colspan="6" class="empty">Nenhum lançamento encontrado.</td></tr>';

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

  function renderInvestments() {
    if (view === 'investments') investChart();

    // Resumo: uma leitura principal, sem repetir a meta em blocos diferentes.
    const total = invTotal();
    const lc = lastCheck();
    $('#invKpis').innerHTML = `
      <div class="invest-total-panel">
        <div class="invest-eyebrow">Patrimônio investido</div>
        <div class="invest-total-value num">${money(total)}</div>
        <div class="invest-total-meta">${state.investments.length} aplicaç${state.investments.length === 1 ? 'ão cadastrada' : 'ões cadastradas'}</div>
      </div>
      <div class="invest-update-panel">
        <div class="invest-eyebrow">Última atualização</div>
        <div class="invest-update-date num">${lc ? `${fullDate(lc.date)} · ${lc.time}` : 'Nenhuma atualização'}</div>
        <div class="invest-total-meta">${lc ? `${esc(invName(lc.invId))} · ${esc(lc.by)}` : 'Informe o saldo de uma aplicação para começar.'}</div>
      </div>`;

    // Planilha de aplicações: uma linha por aplicação, com resultado derivado das verificações reais.
    const applications = state.investments.slice().sort((a, b) =>
      invAccName(a).localeCompare(invAccName(b), 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR'));
    const applicationRows = applications.map(i => {
      const records = snapsOf(i.id), cur = records.at(-1), before = records.at(-2);
      const result = snapshotResult(cur, before);
      const variation = result
        ? `${resultMoney(result.difference)}${result.percent != null ? `<small>${pct2(result.percent)} no período</small>` : ''}`
        : '<span class="t-muted">—</span>';
      return `<tr class="invest-sheet-row">
        <td class="sheet-cell"><span class="invest-bank">${icon('landmark', 'i-sm')}${esc(invAccName(i))}</span></td>
        <td class="sheet-cell sheet-title">${esc(i.name)}</td>
        <td class="sheet-cell"><span class="tag rec">${esc(i.type)}</span></td>
        <td class="sheet-cell t-right"><strong class="num">${cur ? money(cur.balance) : '—'}</strong></td>
        <td class="sheet-cell t-right invest-result-cell">${variation}</td>
        <td class="sheet-cell t-right invest-result-cell">${dailyResultLabel(result)}</td>
        <td class="sheet-cell">${cur ? `${fullDate(cur.date)}<small>${cur.time}</small>` : '<span class="t-muted">Nunca</span>'}</td>
        <td class="sheet-cell">${cur ? `<span class="checked">${icon('user-round', 'i-sm')}${esc(cur.by)}</span>` : '—'}</td>
        <td class="sheet-cell"><div class="sheet-actions invest-sheet-actions">
          <button class="btn btn-sm btn-primary" data-open="snap" data-inv="${i.id}">${icon('pencil-line', 'i-sm')}Atualizar saldo</button>
          <button class="icon-btn edit" data-edit-inv="${i.id}" title="Editar dados" aria-label="Editar dados da aplicação">${icon('settings', 'i-sm')}</button>
          <button class="icon-btn" data-del-inv="${i.id}" title="Excluir aplicação" aria-label="Excluir aplicação">${icon('trash-2', 'i-sm')}</button>
        </div></td>
      </tr>`;
    }).join('');
    $('#invGroups').innerHTML = applications.length
      ? `<div class="table-wrap sheet-wrap invest-sheet-wrap"><table class="sheet invest-sheet">
          <thead><tr><th>Banco</th><th>Aplicação</th><th>Tipo</th><th class="t-right">Saldo atual</th><th class="t-right">Rendimento</th><th class="t-right">Média/dia</th><th>Última verificação</th><th>Editor</th><th>Ação</th></tr></thead>
          <tbody>${applicationRows}</tbody>
          <tfoot><tr><td class="sheet-cell" colspan="3"><strong>Total investido</strong></td><td class="sheet-cell t-right"><strong class="num">${money(total)}</strong></td><td class="sheet-cell" colspan="5"></td></tr></tfoot>
        </table></div>`
      : `<div class="inv-empty">${icon('piggy-bank')}<strong>Nenhuma aplicação ainda</strong><span>${state.accounts.length ? 'Clique em “Nova aplicação”, escolha a conta e informe o saldo.' : 'Cadastre uma conta em “Contas” e depois adicione a aplicação aqui.'}</span></div>`;

    const fi = $('#fInv').value || 'all';
    const hist = state.snapshots.filter(s => fi === 'all' || s.invId === fi)
      .sort((a, b) => stamp(b).localeCompare(stamp(a))).slice(0, 60);
    $('#snapRows').innerHTML = hist.map(s => {
      const before = prevSnap(s);
      const result = snapshotResult(s, before);
      return `<tr>
        <td class="num">${fullDate(s.date)}</td>
        <td class="num t-muted">${s.time}</td>
        <td>${esc(invName(s.invId))}</td>
        <td class="t-muted">${esc(invAccName(state.investments.find(i => i.id === s.invId)))}</td>
        <td class="t-right num amount">${money(s.balance)}</td>
        <td class="t-right invest-result-cell">${result ? `${resultMoney(result.difference)}${result.percent != null ? `<small>${pct2(result.percent)}</small>` : ''}` : '<span class="t-muted">base inicial</span>'}</td>
        <td class="t-right invest-result-cell">${dailyResultLabel(result)}</td>
        <td><span class="checked">${icon('user-round', 'i-sm')}${esc(s.by)}</span></td>
        <td class="t-right" style="width:44px"><button class="icon-btn" data-del-snap="${s.id}" aria-label="Excluir registro">${icon('trash-2', 'i-sm')}</button></td>
      </tr>`;
    }).join('') || '<tr><td colspan="9" class="empty">Nenhum saldo registrado ainda.</td></tr>';
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
    document.title = `${TITLES[v]} · Matheus do Beiju`;
    window.scrollTo({ top: 0 });
    // Telas com ação própria (contas, aplicações, compromissos) não mostram o botão Lançamento, para não confundir
    const hasOwnPrimaryAction = ['investments', 'accounts', 'tasks'].includes(view);
    $('#headTxBtn').hidden = hasOwnPrimaryAction;
    $('.mobile-quick-add').hidden = hasOwnPrimaryAction;
    // Pagamentos e cobranças usam o mês do topo; documentação mostra tudo por prazo
    $('#period').hidden = tk === 'documentacao';
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
    if (name === 'task' && !isAdmin) { alert('Só admin pode criar ou editar programações.'); return; }
    lastFocus = document.activeElement;
    const m = $('#modal-' + name);
    m.classList.add('open');
    if (name === 'tx') {
      fillCategories();
      const t = todayISO();
      $('#txDate').value = ym(t) === period ? t : `${period}-01`;
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
    else if (b.dataset.taskPage) {
      const p = Number(b.dataset.taskPage);
      if (Number.isFinite(p) && p >= 1 && !b.disabled) { taskPage = p; renderTasks(); }
    }
    else if (b.dataset.rtab) { reportTab = b.dataset.rtab; renderReports(); }
    else if (b.dataset.pay) openPay(b.dataset.pay, b.dataset.payMode);
    else if (b.dataset.skip) skipOccurrence(b.dataset.skip);
    else if (b.dataset.undo) undoOccurrence(b.dataset.undo);
    else if (b.dataset.receipt) openReceipt(b.dataset.receipt, b.dataset.rtx);
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
      if (!isAdmin || !t) return;
      t.paused = !t.paused; save(); refresh();
    } else if (b.dataset.delTask) {
      const t = taskById(b.dataset.delTask);
      if (!isAdmin || !t) return;
      if (!confirm(`Excluir a programação “${t.title}”? Os lançamentos já feitos continuam em Movimentações.`)) return;
      state.tasks = state.tasks.filter(x => x !== t);
      state.taskDone = state.taskDone.filter(d => d.taskId !== t.id);
      save(); refresh();
    } else if (b.dataset.delTx) {
      const tx = state.txs.find(x => x.id === b.dataset.delTx);
      if (!tx) return;
      if (!canDelete(tx)) { alert('Este lançamento veio de uma programação. Só admin pode desfazer.'); return; }
      const d = tx.taskId ? state.taskDone.find(x => x.txId === tx.id) : null;
      const msg = d ? `Excluir este lançamento? A programação “${tx.description}” volta a ficar pendente${tx.receiptId ? ' e o comprovante será apagado' : ''}.`
        : `Excluir este lançamento?${tx.receiptId ? ' O comprovante também será apagado.' : ''}`;
      if (!confirm(msg)) return;
      state.txs = state.txs.filter(x => x !== tx);
      if (d) state.taskDone = state.taskDone.filter(x => x !== d);
      FPComprovantes.del(tx.receiptId);
      save(); refresh();
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
    syncPeriodNow();
    render();
  });
  $('#periodNow')?.addEventListener('click', goCurrentMonth);
  ['#q', '#fKind', '#fAccount', '#fOrigin'].forEach(s => $(s).addEventListener(s === '#q' ? 'input' : 'change', render));
  ['#tq', '#tfValor', '#tfFreq', '#tfState', '#tfStatus'].forEach(s => {
    const el = $(s);
    if (el) el.addEventListener(s === '#tq' ? 'input' : 'change', () => { taskPage = 1; renderTasks(); });
  });
  $('#tfClear')?.addEventListener('click', clearTaskFilters);
  // Filtros menos usados ficam recolhidos em "Mais filtros"
  $('#tfMore')?.addEventListener('click', e => {
    const panel = $('#tfMorePanel'), open = panel.hidden;
    panel.hidden = !open;
    e.currentTarget.setAttribute('aria-expanded', String(open));
    e.currentTarget.classList.toggle('on', open);
  });
  $('#reportPdfBtn')?.addEventListener('click', exportReportPdf);
  $('#fInv').addEventListener('change', renderInvestments);
  ['#snapInv', '#snapDate', '#snapTime', '#snapBal'].forEach(s => $(s).addEventListener(s === '#snapBal' ? 'input' : 'change', updateSnapPrev));
  $$('input[name="kind"]').forEach(r => r.addEventListener('change', fillCategories));

  $('#txForm').addEventListener('submit', async e => {
    e.preventDefault();
    const amount = Math.round(moneyVal('#txAmount') * 100) / 100;
    if (!(amount > 0)) return;
    const date = $('#txDate').value;
    let receiptId = null;
    const newTxId = uid();
    try { if (uploads.tx.file) receiptId = await FPComprovantes.put(uploads.tx.file, newTxId); }
    catch (err) { alert(err instanceof Error ? err.message : 'Não foi possível salvar o comprovante.'); return; }
    const payee = $('#txPayee').value.trim();
    state.txs.push({
      ...stamp_(), id: newTxId, date, amount, time: nowTime(),
      description: $('#txDesc').value.trim(),
      kind: $('input[name="kind"]:checked').value,
      category: $('#txCat').value,
      account: $('#txAcc').value,
      payee: payee || undefined,
      by: userName || undefined,
      receiptId,
    });
    rememberPayee(payee);
    period = ym(date);
    periodManual = period !== currentMonth(); // lançou em outro mês: fica nele até voltar
    save(); closeModals(); refresh();
  });

  $('#taskForm').addEventListener('submit', e => { e.preventDefault(); saveTaskForm(); });
  $('#taskForm').addEventListener('input', updateTaskForm);
  $('#taskForm').addEventListener('change', updateTaskForm);
  $('#tkKind').addEventListener('change', () => {
    if (taskFormKind() === 'documentacao' && userName) $('#tkPerson').value = userName;
    else if (!$('#tkId').value) $('#tkPerson').value = '';
    updateTaskForm();
  });
  $('#payForm').addEventListener('submit', e => { e.preventDefault(); savePay(); });

  $('#accForm').addEventListener('submit', e => {
    e.preventDefault();
    const data = { name: $('#accName').value.trim(), type: $('#accType').value, initial: Math.round((moneyVal('#accInitial') || 0) * 100) / 100 };
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
  window.addEventListener('message', ev => {
    if (ev.origin !== window.location.origin || ev.source !== window.parent) return;
    const d = ev.data || {};
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
      if (d.requestId === String(persistSeq)) { dirty = false; syncStatus('Salvo no banco', 'ok'); }
      return;
    }
    if (d.type === 'fp-persist-erro') {
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
      const mudou = isAdmin !== !!d.admin || userName !== nome;
      isAdmin = !!d.admin;
      userName = nome;
      userId = String(d.userId || '');
      if (mudou) render();
    }
  });
  $('#btnSair').addEventListener('click', () => avisarPai({ type: 'fp-sair' }));
  $('#btnTrocarSistema').addEventListener('click', () => avisarPai({ type: 'fp-trocar-sistema' }));

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
      put: async (file, entidadeId) => {
        const erro = FPComprovantes.validar(file);
        if (erro) throw new Error(erro);
        const d = await pedirArquivo({ type: 'fp-file-put', file, name: file.name, entidadeId });
        return d.id;
      },
      get: async id => { try { return await get(id); } catch { return null; } },
      del: async () => { /* o salvamento apaga o comprovante junto com o lançamento */ },
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
  $('#today').textContent = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
    .replace(/^./, c => c.toUpperCase());
  refresh();
  avisarPai({ type: 'fp-pronto' });
})();
