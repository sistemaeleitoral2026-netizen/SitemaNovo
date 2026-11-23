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
  const TITLES = { overview: 'Visão geral', transactions: 'Movimentações', tasks: 'Tarefas', accounts: 'Contas', investments: 'Investimentos', reports: 'Relatórios' };

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
    // Tarefas de pagamento de exemplo
    const now = new Date().toISOString();
    const base = { paused: false, end: null, createdBy: 'Admin', createdAt: now };
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
  let taskTab = 'pending';
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
  const lastCheck = () => state.snapshots.slice().sort((a, b) => stamp(b).localeCompare(stamp(a)))[0];

  function months() {
    const set = new Set(state.txs.map(x => ym(x.date)));
    set.add(ym(todayISO()));
    set.add(addMonths(ym(todayISO()), 1));
    return [...set].sort().reverse();
  }

  /* ---------- Componentes ---------- */
  function txRow(x, withDelete) {
    return `<tr>
      <td><div class="t-desc"><span class="t-ico">${icon(CAT_ICON[x.category] || 'ellipsis', 'i-sm')}</span><div>${esc(x.description)}${x.taskId ? '<span class="tag task-tag">Tarefa</span>' : ''}${x.receiptId ? `<button class="clip" data-receipt="${x.receiptId}" data-rtx="${x.id}" title="Ver comprovante" aria-label="Ver comprovante">${icon('paperclip')}</button>` : ''}${x.payee ? `<span class="t-payee">${esc(x.payee)}</span>` : ''}</div></div></td>
      <td>${esc(x.category)}</td>
      <td class="t-muted">${esc(accName(x.account))}</td>
      <td class="t-muted num">${shortDate(x.date)}${x.time ? ` · ${x.time}` : ''}</td>
      <td class="t-right num amount ${x.kind === 'income' ? 'in' : 'out'}">${signed(value(x))}</td>
      ${withDelete ? `<td class="t-right" style="width:44px"><button class="icon-btn" data-del-tx="${x.id}" aria-label="Excluir lançamento">${icon('trash-2', 'i-sm')}</button></td>` : ''}
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
    const groups = {};
    exp.forEach(x => { groups[x.category] = (groups[x.category] || 0) + x.amount; });
    let rows = Object.entries(groups).sort((a, b) => b[1] - a[1]);
    if (limit && rows.length > limit) {
      const rest = rows.slice(limit - 1).reduce((s, r) => s + r[1], 0);
      rows = [...rows.slice(0, limit - 1), ['Demais categorias', rest]];
    }
    const max = rows[0][1];
    return rows.map(([c, v]) => `
      <div class="cat-row">
        <div class="cat-name">${icon(CAT_ICON[c] || 'ellipsis', 'i-sm')}${esc(c)}</div>
        <div class="cat-val num">${money(v)}<small>${pct(v / total)}</small></div>
        <div class="cat-bar"><span style="width:${(v / max) * 100}%"></span></div>
      </div>`).join('');
  }

  function goalBox() {
    const total = invTotal();
    const p = state.goal ? Math.min(total / state.goal, 1) : 0;
    const lc = lastCheck();
    return `<div class="goal-value num">${money(total)}</div>
      <div class="goal-sub">aplicados de ${money(state.goal)}</div>
      <div class="progress"><span style="width:${p * 100}%"></span></div>
      <div class="goal-foot"><span>${pct(p)} da meta</span><span class="num">faltam ${money(Math.max(state.goal - total, 0))}</span></div>
      ${lc ? `<div class="checked" style="margin-top:14px">${icon('clock', 'i-sm')}Última verificação: ${fullDate(lc.date)} às ${lc.time} · ${esc(lc.by)}</div>` : ''}`;
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
  const STATUS_LABEL = { atrasada: 'Atrasada', hoje: 'Vence hoje', aberta: 'Em aberto', futura: 'Programada', paga: 'Paga', dispensada: 'Dispensada' };
  const GROUP_LABEL = { atrasada: 'Atrasadas', hoje: 'Vencem hoje', aberta: 'Em aberto', futura: 'Programadas', paga: 'Pagas', dispensada: 'Dispensadas' };
  const ORDER = ['atrasada', 'hoje', 'aberta', 'futura', 'paga', 'dispensada'];

  const taskById = id => state.tasks.find(t => t.id === id);
  const doneOf = (taskId, k) => state.taskDone.find(d => d.taskId === taskId && d.period === k);

  function occursIn(t, k) {
    const r = t.rec || {};
    if (r.type === 'once') return ym(r.dateTo || r.dateFrom || '') === k;
    if (t.start && k < t.start) return false;
    if (t.end && k > t.end) return false;
    if (r.type === 'yearly') return +k.slice(5) === +r.month;
    return monthDiff(t.start || k, k) % (r.every || 1) === 0;
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

  const statusTag = s => `<span class="tag st-${s}">${STATUS_LABEL[s]}</span>`;
  const payeeIcon = () => icon('user-round');

  function taskRow(o) {
    const t = o.task, d = o.done;
    const val = d && d.status === 'paga' ? d.amount : t.expected;
    const valNote = d && d.status === 'paga' ? 'pago' : t.expected != null ? 'previsto' : 'valor variável';
    let info = '';
    if (d && d.status === 'paga') {
      info = `<div class="task-done-info">${icon('check')}Pago por ${esc(d.by || '—')} em ${fullDate(d.date)}${d.time ? ` às ${d.time}` : ''} · ${esc(accName(d.account))}${d.payee && d.payee !== t.payee ? ` · recebido por ${esc(d.payee)}` : ''}</div>`;
    } else if (d && d.status === 'dispensada') {
      info = `<div class="task-done-info" style="color:var(--muted)">${icon('ban')}Dispensada${d.by ? ` por ${esc(d.by)}` : ''}${d.date ? ` em ${fullDate(d.date)}` : ''}</div>`;
    }
    let actions = '';
    if (!d) {
      actions += `<button class="btn btn-sm btn-pay" data-pay="${o.key}">${icon('check', 'i-sm')}Dar baixa</button>`;
      if (isAdmin) actions += `<button class="icon-btn" data-skip="${o.key}" title="Dispensar neste mês" aria-label="Dispensar neste mês">${icon('ban', 'i-sm')}</button>`;
    } else if (d.status === 'paga') {
      if (d.receiptId) actions += `<button class="btn btn-sm" data-receipt="${d.receiptId}" data-rtx="${d.txId}">${icon('paperclip', 'i-sm')}Comprovante</button>`;
      if (isAdmin) actions += `<button class="icon-btn danger" data-undo="${o.key}" title="Desfazer baixa" aria-label="Desfazer baixa">${icon('undo-2', 'i-sm')}</button>`;
    } else if (isAdmin) {
      actions += `<button class="icon-btn" data-undo="${o.key}" title="Voltar a cobrar" aria-label="Voltar a cobrar">${icon('undo-2', 'i-sm')}</button>`;
    }
    if (isAdmin) actions += `<button class="icon-btn" data-edit-task="${t.id}" title="Editar tarefa" aria-label="Editar tarefa">${icon('pencil-line', 'i-sm')}</button>`;
    const prevMonthTag = o.period !== period && OPEN.includes(o.status) ? `<span class="tag rec">${monthLabel(o.period)}</span>` : '';
    return `<div class="task st-${o.status}">
      <div class="task-ico">${icon(CAT_ICON[t.category] || 'list-checks')}</div>
      <div class="task-main">
        <div class="task-title">${esc(t.title)} ${statusTag(o.status)}<span class="tag rec">${icon('repeat')}${recLabel(t)}</span>${prevMonthTag}</div>
        <div class="task-sub">
          <span>${payeeIcon(t)}${esc(t.payee || '—')}</span>
          <span>${icon('calendar-clock')}${windowLabel(o)}${d ? '' : ` · ${dueText(o)}`}</span>
          ${t.account && !d ? `<span>${icon('landmark')}${esc(accName(t.account))}</span>` : ''}
        </div>
        ${info}
      </div>
      <div class="task-value"><strong class="num">${val != null ? money(val) : '—'}</strong><small>${valNote}</small></div>
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

  function modelsTable() {
    if (!state.tasks.length) return `<div class="task-empty">${icon('list-checks')}Nenhuma tarefa cadastrada. Clique em “Nova tarefa”.</div>`;
    const rows = state.tasks.slice().sort((a, b) => a.title.localeCompare(b.title, 'pt-BR')).map(t => {
      const r = t.rec || {};
      const nd = t.paused ? null : nextDue(t);
      const when = r.type === 'once' ? `${fullDate(r.dateFrom || r.dateTo)} a ${fullDate(r.dateTo)}`
        : r.dayFrom === r.dayTo ? `dia ${r.dayFrom}` : `dias ${r.dayFrom}–${r.dayTo}`;
      return `<tr>
        <td><div class="t-desc"><span class="t-ico">${icon(CAT_ICON[t.category] || 'list-checks', 'i-sm')}</span><div>${esc(t.title)}<span class="t-payee">${esc(t.payee)}</span></div></div></td>
        <td><span class="tag rec">${icon('repeat')}${recLabel(t)}</span></td>
        <td class="t-muted">${when}</td>
        <td class="t-right num amount">${t.expected != null ? money(t.expected) : '<span class="t-muted">variável</span>'}</td>
        <td class="t-muted">${t.paused ? '<span class="tag paused">Pausada</span>' : nd ? `${fullDate(nd.to)} ${statusTag(nd.status)}` : '—'}</td>
        <td class="t-right" style="white-space:nowrap">
          <button class="icon-btn" data-edit-task="${t.id}" title="Editar" aria-label="Editar">${icon('pencil-line', 'i-sm')}</button>
          <button class="icon-btn" data-pause-task="${t.id}" title="${t.paused ? 'Retomar' : 'Pausar'}" aria-label="${t.paused ? 'Retomar' : 'Pausar'}">${icon(t.paused ? 'play' : 'pause', 'i-sm')}</button>
          <button class="icon-btn danger" data-del-task="${t.id}" title="Excluir" aria-label="Excluir">${icon('trash-2', 'i-sm')}</button>
        </td></tr>`;
    }).join('');
    return `<div class="table-wrap"><table><thead><tr><th>Tarefa</th><th>Frequência</th><th>Quando</th><th class="t-right">Valor</th><th>Próximo vencimento</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function renderTasks() {
    const k = period;
    const carry = k === currentMonth() ? overdueBefore(k) : [];
    const occs = [...carry, ...occurrencesIn(k)];
    const late = occs.filter(o => o.status === 'atrasada');
    const open = occs.filter(o => o.status === 'hoje' || o.status === 'aberta');
    const soon = k === currentMonth() ? upcoming(7) : [];
    const paid = occs.filter(o => o.status === 'paga');
    const exp = l => l.reduce((s, o) => s + (o.task.expected || 0), 0);
    $('#taskKpis').innerHTML = `
      <div class="kpi"><div class="kpi-label">Atrasadas</div><div class="kpi-value num ${late.length ? 'delta-neg' : ''}">${late.length}</div><div class="kpi-foot">${late.length ? `${money(exp(late))} previstos` : 'nada atrasado'}</div></div>
      <div class="kpi"><div class="kpi-label">Em aberto</div><div class="kpi-value num">${open.length}</div><div class="kpi-foot">${open.filter(o => o.status === 'hoje').length} vence(m) hoje</div></div>
      <div class="kpi"><div class="kpi-label">Próximos 7 dias</div><div class="kpi-value num">${soon.length}</div><div class="kpi-foot">${soon.length ? `${money(exp(soon))} previstos` : '&nbsp;'}</div></div>
      <div class="kpi"><div class="kpi-label">Pagas em ${monthLabel(k).split(' ')[0].toLowerCase()}</div><div class="kpi-value num delta-pos">${paid.length}</div><div class="kpi-foot num">${money(paid.reduce((s, o) => s + (o.done.amount || 0), 0))}</div></div>`;

    if (taskTab === 'models' && !isAdmin) taskTab = 'pending';
    $$('#taskTabs button').forEach(b => b.classList.toggle('on', b.dataset.ttab === taskTab));
    let html;
    if (taskTab === 'models') html = modelsTable();
    else {
      const filter = { pending: o => !o.done, paid: o => !!o.done, all: () => true }[taskTab];
      const list = occs.filter(filter);
      html = list.length ? `<div class="task-list">${groupedRows(list)}</div>`
        : `<div class="task-empty">${icon('check')}${taskTab === 'pending' ? 'Nenhum pagamento pendente neste mês.' : taskTab === 'paid' ? 'Nenhuma tarefa paga neste mês ainda.' : 'Nenhuma tarefa neste mês.'}</div>`;
    }
    $('#taskBody').innerHTML = html;
  }

  function renderPending() {
    const list = pendingNow();
    const late = list.filter(o => o.status === 'atrasada').length;
    $('#pendingMeta').textContent = list.length ? `${late} atrasada${late === 1 ? '' : 's'} · ${list.length - late} em aberto` : 'Tudo em dia';
    $('#pendingList').innerHTML = list.length
      ? groupedRows(list.slice(0, 5)) + (list.length > 5 ? `<div class="task-empty" style="padding:12px"><button class="link" data-go="tasks">Ver mais ${list.length - 5}</button></div>` : '')
      : `<div class="task-empty">${icon('check')}Nenhum pagamento pendente. Tudo em dia.</div>`;
    $$('[data-task-badge]').forEach(b => {
      b.hidden = !list.length;
      b.textContent = list.length;
      b.classList.toggle('soft', !late);
    });
  }

  function applyRole() {
    $$('[data-admin-only]').forEach(el => el.classList.toggle('is-hidden', !isAdmin));
    $('#taskEditorNote').hidden = isAdmin || !embedded;
  }

  /* ---------- Formulário de tarefa (admin) ---------- */
  function taskFormType() { return $('input[name="tkType"]:checked').value; }
  function updateTaskForm() {
    const type = taskFormType(), freq = $('#tkFreq').value;
    $$('[data-tk="rec"]').forEach(el => { el.hidden = type !== 'rec'; });
    $$('[data-tk="once"]').forEach(el => { el.hidden = type !== 'once'; });
    $$('[data-tk="year"]').forEach(el => { el.hidden = !(type === 'rec' && freq === 'y'); });
    const fixedDay = $('input[name="tkDayMode"]:checked').value === 'fixed';
    $$('[data-range-part]').forEach(el => { el.hidden = fixedDay; });
    $('#tkDayFrom').setAttribute('aria-label', fixedDay ? 'Dia fixo' : 'Do dia');
    const varies = $('#tkVaries').checked;
    $('#tkAmount').disabled = varies;
    $('#tkAmount').required = !varies;
    if (varies) $('#tkAmount').value = '';
    // Resumo
    const payee = $('#tkPayee').value.trim();
    const amt = moneyVal('#tkAmount');
    let txt;
    if (type === 'once') {
      const a = $('#tkDateFrom').value, b = $('#tkDateTo').value;
      txt = b ? `Pagamento único${a && a !== b ? `, entre ${fullDate(a)} e ${fullDate(b)}` : `, até ${fullDate(b)}`}.` : 'Pagamento único: informe a data de vencimento.';
    } else {
      const fixed = $('input[name="tkDayMode"]:checked').value === 'fixed';
      const df = +$('#tkDayFrom').value || 1, dt = fixed ? df : (+$('#tkDayTo').value || df);
      const freqTxt = { m1: 'todo mês', m2: 'a cada 2 meses', m3: 'a cada 3 meses', m6: 'a cada 6 meses', y: `todo ano em ${MONTHS_FULL[+$('#tkMonth').value - 1]?.toLowerCase()}` }[freq];
      const win = df === dt ? `no dia ${df}` : `entre os dias ${Math.min(df, dt)} e ${Math.max(df, dt)}`;
      const st = $('#tkStart').value, en = $('#tkEnd').value;
      txt = `Aparece ${freqTxt}, para pagar ${win}${st ? `, a partir de ${monthLabel(st).toLowerCase()}` : ''}${en ? ` até ${monthLabel(en).toLowerCase()}` : ''}.`;
      if (df > 28 || dt > 28) txt += ' Em meses mais curtos, vale o último dia do mês.';
    }
    txt += amt > 0 && !varies ? ` Valor previsto: ${money(amt)}.` : ' O valor é informado na hora da baixa.';
    if (payee) txt += ` Recebe: ${payee}.`;
    $('#tkSummary').innerHTML = `${icon('info', 'i-sm')}<span>${esc(txt)}</span>`;
  }

  function fillTaskForm(id) {
    const t = id ? taskById(id) : null;
    $('#tkTitle').textContent = t ? 'Editar tarefa' : 'Nova tarefa';
    $('#tkSubmit').textContent = t ? 'Salvar alterações' : 'Criar tarefa';
    $('#tkCat').innerHTML = CATEGORIES.expense.map(c => `<option>${c}</option>`).join('');
    $('#tkMonth').innerHTML = MONTHS_FULL.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');
    const r = t?.rec || {};
    $('#tkId').value = t?.id || '';
    $('#tkName').value = t?.title || '';
    $('#tkPayee').value = t?.payee || '';
    $('#tkCat').value = t?.category || 'Outros';
    $('#tkAcc').value = t?.account || state.accounts[0]?.id || '';
    $('#tkVaries').checked = !!t && t.expected == null;
    setMoney('#tkAmount', t?.expected);
    $(r.type === 'once' ? '#tkTypeO' : '#tkTypeR').checked = true;
    $('#tkFreq').value = r.type === 'yearly' ? 'y' : `m${[1, 2, 3, 6].includes(r.every) ? r.every : 1}`;
    $('#tkMonth').value = r.month || (+currentMonth().slice(5));
    $('#tkDayFrom').value = r.dayFrom || 10;
    $('#tkDayTo').value = r.dayTo || r.dayFrom || 15;
    $(t && r.type !== 'once' && r.dayFrom === r.dayTo ? '#tkDayFixed' : '#tkDayRange').checked = true;
    $('#tkStart').value = t?.start || currentMonth();
    $('#tkEnd').value = t?.end || '';
    $('#tkDateFrom').value = r.dateFrom || todayISO();
    $('#tkDateTo').value = r.dateTo || addDays(todayISO(), 5);
    $('#tkNotes').value = t?.notes || '';
    updateTaskForm();
  }

  function saveTaskForm() {
    if (!isAdmin) return;
    const type = taskFormType(), freq = $('#tkFreq').value;
    const varies = $('#tkVaries').checked;
    const expected = varies ? null : Math.round(moneyVal('#tkAmount') * 100) / 100;
    if (!varies && !(expected > 0)) { alert('Informe o valor previsto ou marque “Valor varia todo mês”.'); return; }
    let rec, start;
    if (type === 'once') {
      let a = $('#tkDateFrom').value, b = $('#tkDateTo').value;
      if (!b) { alert('Informe a data de vencimento.'); return; }
      if (!a) a = b;
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
      title: $('#tkName').value.trim(),
      payee: $('#tkPayee').value.trim(),
      payeeKind: 'empresa',
      category: $('#tkCat').value,
      account: $('#tkAcc').value,
      expected, rec, start,
      end: type === 'once' ? null : ($('#tkEnd').value || null),
      notes: $('#tkNotes').value.trim(),
    };
    const id = $('#tkId').value;
    if (id) Object.assign(taskById(id), data, { updatedAt: new Date().toISOString(), updatedBy: userName || 'Admin' });
    else state.tasks.push({ id: uid(), ...data, paused: false, createdBy: userId || null, createdAt: new Date().toISOString() });
    rememberPayee(data.payee);
    save(); closeModals(); refresh();
  }

  /* ---------- Dar baixa ---------- */
  function openPay(key) {
    const [taskId, k] = key.split('|');
    const t = taskById(taskId);
    if (!t) return;
    if (doneOf(taskId, k)) { alert('Esta tarefa já teve baixa neste mês.'); return; }
    if (!state.accounts.length) { alert('Cadastre uma conta antes de dar baixa.'); return; }
    const o = occurrence(t, k);
    $('#payHead').innerHTML = `
      <div class="pay-head-title">${esc(t.title)} ${statusTag(o.status)}<span class="tag rec">${icon('repeat')}${recLabel(t)}</span></div>
      <div class="pay-head-sub">
        <span>${payeeIcon(t)}${esc(t.payee)}</span>
        <span>${icon('calendar-clock')}${windowLabel(o)} · ${dueText(o)}</span>
        <span>${t.expected != null ? `Previsto: <strong class="num">${money(t.expected)}</strong>` : 'Valor variável'}</span>
      </div>
      ${t.notes ? `<div class="pay-head-notes">${icon('info', 'i-sm')}<span>${esc(t.notes)}</span></div>` : ''}`;
    $('#pyTask').value = taskId;
    $('#pyPeriod').value = k;
    setMoney('#pyAmount', t.expected);
    $('#pyAcc').value = state.accounts.some(a => a.id === t.account) ? t.account : state.accounts[0].id;
    $('#pyDate').value = todayISO();
    $('#pyTime').value = nowTime();
    $('#pyPayee').value = t.payee || '';
    $('#pyBy').value = state.people[0] || userName || '';
    $('#pyNote').value = '';
    uploads.pay.reset();
    lastFocus = document.activeElement;
    $('#modal-pay').classList.add('open');
    setTimeout(() => $('#pyAmount').focus(), 20);
  }

  let salvandoBaixa = false;
  async function savePay() {
    if (salvandoBaixa) return;
    const taskId = $('#pyTask').value, k = $('#pyPeriod').value, t = taskById(taskId);
    if (!t) return;
    if (doneOf(taskId, k)) { alert('Esta tarefa já teve baixa neste mês.'); return; }
    const amount = Math.round(moneyVal('#pyAmount') * 100) / 100;
    if (!(amount > 0)) return;
    salvandoBaixa = true;
    try {
      let receiptId = null;
      const file = uploads.pay.file;
      const txId = uid();
      if (file) receiptId = await FPComprovantes.put(file, txId);
      const date = $('#pyDate').value, time = $('#pyTime').value, account = $('#pyAcc').value;
      const by = $('#pyBy').value.trim(), payee = $('#pyPayee').value.trim(), note = $('#pyNote').value.trim();
      state.txs.push({ ...stamp_(), id: txId, date, time, amount, kind: 'expense', description: t.title, category: t.category, account, payee, by, taskId, period: k, receiptId, note });
      state.taskDone.push({ id: uid(), taskId, period: k, status: 'paga', txId, amount, account, date, time, by, payee, receiptId, note });
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
    if (d.status === 'paga') {
      if (!confirm(`Desfazer a baixa? A despesa de ${money(d.amount)} em Movimentações${d.receiptId ? ' e o comprovante' : ''} também serão excluídos.`)) return;
      state.txs = state.txs.filter(x => x.id !== d.txId);
      FPComprovantes.del(d.receiptId);
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
    const initial = state.accounts.reduce((s, a) => s + (a.initial || 0), 0);
    const last = state.accChecks.slice().sort((a, b) => chkStamp(b).localeCompare(chkStamp(a)))[0];
    const varTotal = total - initial;
    $('#accKpis').innerHTML = `
      <div class="kpi"><div class="kpi-label">Saldo atual em contas</div><div class="kpi-value num">${money(total)}</div><div class="kpi-foot">${state.accounts.length} conta${state.accounts.length === 1 ? '' : 's'}</div></div>
      <div class="kpi"><div class="kpi-label">Saldo inicial somado</div><div class="kpi-value num">${money(initial)}</div><div class="kpi-foot">antes do primeiro lançamento</div></div>
      <div class="kpi"><div class="kpi-label">Variação desde o início</div><div class="kpi-value num ${varTotal >= 0 ? 'delta-pos' : 'delta-neg'}">${signed(varTotal)}</div><div class="kpi-foot">saldo atual − saldo inicial</div></div>
      <div class="kpi"><div class="kpi-label">Última conferência</div><div class="kpi-value num" style="font-size:18px">${last ? whenTxt(last) : '—'}</div><div class="kpi-foot">${last ? `${esc(accName(last.accId))} · ${esc(last.by)}` : 'nenhum saldo informado ainda'}</div></div>`;

    $('#accFull').innerHTML = state.accounts.map(a => {
      const bal = accBalance(a, k);
      const lc = checksOf(a.id).at(-1);
      const after = lc ? Math.round((bal - lc.balance) * 100) / 100 : null;
      return `<div class="acc-card">
        <div class="acc-card-head">
          <div class="acc-ico">${icon(a.type === 'Dinheiro em espécie' ? 'wallet' : 'landmark', 'i-sm')}</div>
          <div class="acc-info"><div class="acc-name">${esc(a.name)}</div><div class="acc-type">${esc(a.type)}</div></div>
          <button class="icon-btn edit" data-edit-acc="${a.id}" title="Editar conta" aria-label="Editar conta">${icon('pencil-line', 'i-sm')}</button>
          <button class="icon-btn" data-del-acc="${a.id}" title="Excluir conta" aria-label="Excluir conta">${icon('trash-2', 'i-sm')}</button>
        </div>
        <div class="acc-card-bal num ${bal < 0 ? 'delta-neg' : ''}">${money(bal)}</div>
        <div class="acc-card-cap">saldo atual</div>
        <dl class="acc-lines">
          <div><dt>Saldo inicial</dt><dd class="num">${money(a.initial || 0)}</dd></div>
          <div><dt>Último saldo informado</dt><dd>${lc ? `<span class="num">${money(lc.balance)}</span> ${diffChip(checkDiff(lc))}` : '<span class="t-muted">nenhum ainda</span>'}</dd></div>
          ${lc ? `<div class="acc-when">${icon('clock', 'i-sm')}${whenTxt(lc)} · ${esc(lc.by)}</div>` : ''}
          ${lc ? `<div><dt>Lançamentos depois disso</dt><dd class="num ${after > 0 ? 'delta-pos' : after < 0 ? 'delta-neg' : 't-muted'}">${signed(after)}</dd></div>` : ''}
        </dl>
        <button class="btn btn-sm acc-card-btn" data-open="acccheck" data-acc="${a.id}">${icon('pencil-line', 'i-sm')}Informar saldo do dia</button>
      </div>`;
    }).join('') || '<div class="empty">Nenhuma conta cadastrada.</div>';

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
    const p = state.goal ? Math.min(total / state.goal, 1) : 0;
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
    }).join('') + `
      <div class="inv-goal">
        <div class="progress"><span style="width:${p * 100}%"></span></div>
        <div class="goal-foot"><span>${pct(p)} da meta de reserva</span><span class="num">meta ${money(state.goal)}</span></div>
      </div>`;
  }

  /* ---------- Render ---------- */
  function render() {
    const k = period;
    const list = inMonth(k).sort(byDateDesc);
    const prev = inMonth(prevMonth(k));
    const inc = sum(list, 'income'), exp = sum(list, 'expense'), net = inc - exp;

    // KPIs
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

    $$('#chartMode button').forEach(b => b.classList.toggle('on', b.dataset.mode === chartMode));
    if (view === 'overview') flowChart(k);
    $('#catTop').innerHTML = catBreakdown(list, 5);
    $('#recentRows').innerHTML = list.slice(0, 6).map(x => txRow(x)).join('') || '<tr><td colspan="5" class="empty">Nenhum lançamento neste mês.</td></tr>';
    $('#accSummary').innerHTML = accRows(k);
    renderInvTop();

    // Movimentações
    const q = $('#q').value.trim().toLowerCase(), fk = $('#fKind').value, fa = $('#fAccount').value;
    const filtered = list.filter(x =>
      (fk === 'all' || x.kind === fk) && (fa === 'all' || x.account === fa) &&
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
    const expList = list.filter(x => x.kind === 'expense');
    const biggest = expList.slice().sort((a, b) => b.amount - a.amount)[0];
    const days = new Set(expList.map(x => x.date)).size;
    $('#reportKpis').innerHTML = `
      <div class="kpi"><div class="kpi-label">Lançamentos</div><div class="kpi-value num">${list.length}</div><div class="kpi-foot">${list.filter(x => x.kind === 'income').length} receitas · ${expList.length} despesas</div></div>
      <div class="kpi"><div class="kpi-label">Maior despesa</div><div class="kpi-value num delta-neg">${biggest ? money(biggest.amount) : '—'}</div><div class="kpi-foot">${biggest ? esc(biggest.description) : '&nbsp;'}</div></div>
      <div class="kpi"><div class="kpi-label">Gasto médio por dia com gasto</div><div class="kpi-value num">${days ? money(exp / days) : '—'}</div><div class="kpi-foot">${days} dias com despesas</div></div>
      <div class="kpi"><div class="kpi-label">Taxa de poupança</div><div class="kpi-value num ${net >= 0 ? 'delta-pos' : 'delta-neg'}">${inc ? pct(net / inc) : '—'}</div><div class="kpi-foot">resultado ÷ receitas</div></div>`;
    $('#reportPeriod').textContent = monthLabel(k);
    $('#catAll').innerHTML = catBreakdown(list);
    $('#byAccount').innerHTML = state.accounts.map(a => {
      const l = list.filter(x => x.account === a.id);
      return `<tr><td>${esc(a.name)}</td><td class="t-right num amount in">${money(sum(l, 'income'))}</td><td class="t-right num amount out">${money(sum(l, 'expense'))}</td></tr>`;
    }).join('');
  }

  function renderInvestments() {
    $('#goalBox2').innerHTML = goalBox();
    if (view === 'investments') investChart();

    // Indicadores
    const total = invTotal();
    const lc = lastCheck();
    const p = state.goal ? Math.min(total / state.goal, 1) : 0;
    $('#invKpis').innerHTML = `
      <div class="kpi"><div class="kpi-label">Total investido</div><div class="kpi-value num">${money(total)}</div><div class="kpi-foot">${state.investments.length} aplicaç${state.investments.length === 1 ? 'ão' : 'ões'}</div></div>
      <div class="kpi"><div class="kpi-label">Meta de reserva</div><div class="kpi-value num">${pct(p)}</div><div class="kpi-foot">de ${money(state.goal)}</div></div>
      <div class="kpi"><div class="kpi-label">Falta para a meta</div><div class="kpi-value num">${money(Math.max(state.goal - total, 0))}</div><div class="kpi-foot">&nbsp;</div></div>
      <div class="kpi"><div class="kpi-label">Última atualização</div><div class="kpi-value num" style="font-size:18px">${lc ? `${fullDate(lc.date)} às ${lc.time}` : '—'}</div><div class="kpi-foot">${lc ? `${esc(invName(lc.invId))} · ${esc(lc.by)}` : 'nenhum saldo ainda'}</div></div>`;

    // Aplicações separadas pela conta onde estão
    const grupos = new Map();
    state.investments.forEach(i => {
      const key = state.accounts.some(a => a.id === i.account) ? i.account : '__sem';
      if (!grupos.has(key)) grupos.set(key, []);
      grupos.get(key).push(i);
    });
    const ordem = [...state.accounts.map(a => a.id).filter(id => grupos.has(id)), ...(grupos.has('__sem') ? ['__sem'] : [])];
    $('#invGroups').innerHTML = ordem.map(key => {
      const lista = grupos.get(key);
      const conta = state.accounts.find(a => a.id === key);
      const soma = lista.reduce((t, i) => t + invValue(i.id), 0);
      return `<div class="inv-group">
        <div class="inv-group-head">
          <div class="acc-ico">${icon('landmark', 'i-sm')}</div>
          <div class="acc-info"><div class="acc-name">${conta ? esc(conta.name) : 'Sem conta'}</div><div class="acc-type">${lista.length} aplicaç${lista.length === 1 ? 'ão' : 'ões'}</div></div>
          <div class="inv-group-total num">${money(soma)}</div>
        </div>
        ${lista.map(i => {
          const l = snapsOf(i.id), cur = l.at(-1), before = l.at(-2);
          return `<div class="inv-item">
            <div class="inv-item-main">
              <div class="inv-item-name">${esc(i.name)} <span class="tag rec">${esc(i.type)}</span></div>
              <div class="inv-item-sub">${cur ? `${icon('clock', 'i-xs')} Atualizado em ${fullDate(cur.date)} às ${cur.time} · ${esc(cur.by)}` : 'Saldo ainda não informado'}</div>
            </div>
            <div class="inv-item-val"><strong class="num">${cur ? money(cur.balance) : '—'}</strong>${cur && before ? chip(cur.balance - before.balance, before.balance) : ''}</div>
            <div class="inv-item-actions">
              <button class="btn btn-sm" data-open="snap" data-inv="${i.id}">${icon('pencil-line', 'i-sm')}Atualizar saldo</button>
              <button class="icon-btn edit" data-edit-inv="${i.id}" title="Editar aplicação" aria-label="Editar aplicação">${icon('pencil-line', 'i-sm')}</button>
              <button class="icon-btn" data-del-inv="${i.id}" title="Excluir aplicação" aria-label="Excluir aplicação">${icon('trash-2', 'i-sm')}</button>
            </div>
          </div>`;
        }).join('')}
      </div>`;
    }).join('') || `<div class="inv-empty">${icon('piggy-bank')}<strong>Nenhuma aplicação ainda</strong><span>${state.accounts.length ? 'Clique em “Nova aplicação”, escolha a conta e informe o saldo.' : 'Cadastre uma conta em “Contas” e depois adicione a aplicação aqui.'}</span></div>`;

    const fi = $('#fInv').value || 'all';
    const hist = state.snapshots.filter(s => fi === 'all' || s.invId === fi)
      .sort((a, b) => stamp(b).localeCompare(stamp(a))).slice(0, 60);
    $('#snapRows').innerHTML = hist.map(s => {
      const p = prevSnap(s);
      return `<tr>
        <td class="num">${fullDate(s.date)}</td>
        <td class="num t-muted">${s.time}</td>
        <td>${esc(invName(s.invId))}</td>
        <td class="t-muted">${esc(invAccName(state.investments.find(i => i.id === s.invId)))}</td>
        <td class="t-right num amount">${money(s.balance)}</td>
        <td class="t-right">${chip(p ? s.balance - p.balance : null, p?.balance)}</td>
        <td><span class="checked">${icon('user-round', 'i-sm')}${esc(s.by)}</span></td>
        <td class="t-right" style="width:44px"><button class="icon-btn" data-del-snap="${s.id}" aria-label="Excluir registro">${icon('trash-2', 'i-sm')}</button></td>
      </tr>`;
    }).join('') || '<tr><td colspan="8" class="empty">Nenhum saldo registrado ainda.</td></tr>';
  }

  function fillPeriod() {
    const ms = months();
    // Padrão: último mês com lançamentos até hoje; sem lançamentos, o mês atual
    if (!period || !ms.includes(period)) period = ms.find(m => m <= ym(todayISO()) && inMonth(m).length) || ym(todayISO());
    $('#period').innerHTML = ms.map(m => `<option value="${m}" ${m === period ? 'selected' : ''}>${monthLabel(m)}</option>`).join('');
  }

  function fillSelects() {
    const opts = state.accounts.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('');
    $('#txAcc').innerHTML = opts;
    $('#acAcc').innerHTML = opts;
    const fc = $('#fAccCheck').value;
    $('#fAccCheck').innerHTML = '<option value="all">Todas as contas</option>' + opts;
    if (fc && $(`#fAccCheck option[value="${fc}"]`)) $('#fAccCheck').value = fc;
    $('#tkAcc').innerHTML = opts;
    $('#pyAcc').innerHTML = opts;
    const fa = $('#fAccount').value;
    $('#fAccount').innerHTML = '<option value="all">Todas as contas</option>' + opts;
    if (fa && $(`#fAccount option[value="${fa}"]`)) $('#fAccount').value = fa;
    const payees = [...new Set([...state.payees, ...state.tasks.map(t => t.payee), ...state.txs.map(x => x.payee)].filter(Boolean))];
    $('#payeeList').innerHTML = payees.map(p => `<option value="${esc(p)}">`).join('');
    const inv = state.investments.map(i => `<option value="${i.id}">${esc(i.name)}</option>`).join('');
    const cur = $('#fInv').value;
    $('#fInv').innerHTML = '<option value="all">Todas as aplicações</option>' + inv;
    if (cur && $(`#fInv option[value="${cur}"]`)) $('#fInv').value = cur;
    $('#snapInv').innerHTML = state.investments.map(i => `<option value="${i.id}">${esc(i.name)} — ${esc(invAccName(i))}</option>`).join('');
    $('#invAcc').innerHTML = opts;
    $('#peopleList').innerHTML = state.people.map(p => `<option value="${esc(p)}">`).join('');
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
    view = v;
    $$('.view').forEach(s => s.classList.toggle('active', s.id === 'view-' + v));
    $$('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === v));
    $('#pageTitle').textContent = TITLES[v];
    document.title = `${TITLES[v]} · Matheus do Beiju`;
    window.scrollTo({ top: 0 });
    // Telas com ação própria (contas, aplicações, tarefas) não mostram o botão Lançamento, para não confundir
    $('#headTxBtn').hidden = ['investments', 'accounts', 'tasks'].includes(v);
    if (v === 'overview') flowChart(period);
    if (v === 'investments') investChart();
  }

  /* ---------- Modais ---------- */
  let lastFocus = null;
  function openModal(name, btn) {
    if (name === 'tx' && !state.accounts.length) { alert('Cadastre uma conta antes de lançar.'); return; }
    if (name === 'snap' && !state.investments.length) { alert('Cadastre uma aplicação antes de registrar o saldo.'); return; }
    if (name === 'task' && !isAdmin) { alert('Só admin pode criar ou editar tarefas.'); return; }
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
      $('#snapBy').value = state.people[0] || '';
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
    const l = latest($('#snapInv').value);
    $('#snapPrev').innerHTML = l
      ? `${icon('history', 'i-sm')}Último registro: ${money(l.balance)} em ${fullDate(l.date)} às ${l.time} (${esc(l.by)})`
      : `${icon('info', 'i-sm')}Nenhum saldo registrado para esta aplicação.`;
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
    else if (b.dataset.ttab) { taskTab = b.dataset.ttab; renderTasks(); }
    else if (b.dataset.pay) openPay(b.dataset.pay);
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
      if (!confirm(`Excluir a tarefa “${t.title}”? Os pagamentos já feitos continuam em Movimentações.`)) return;
      state.tasks = state.tasks.filter(x => x !== t);
      state.taskDone = state.taskDone.filter(d => d.taskId !== t.id);
      save(); refresh();
    } else if (b.dataset.delTx) {
      const tx = state.txs.find(x => x.id === b.dataset.delTx);
      if (!tx) return;
      if (!canDelete(tx)) { alert('Este lançamento veio de uma tarefa. Só admin pode desfazer a baixa.'); return; }
      const d = tx.taskId ? state.taskDone.find(x => x.txId === tx.id) : null;
      const msg = d ? `Excluir este lançamento? A tarefa “${tx.description}” volta a ficar pendente${tx.receiptId ? ' e o comprovante será apagado' : ''}.`
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
  $('#period').addEventListener('change', e => { period = e.target.value; periodManual = true; render(); });
  ['#q', '#fKind', '#fAccount'].forEach(s => $(s).addEventListener(s === '#q' ? 'input' : 'change', render));
  $('#fInv').addEventListener('change', renderInvestments);
  $('#snapInv').addEventListener('change', updateSnapPrev);
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
    save(); closeModals(); refresh();
  });

  $('#taskForm').addEventListener('submit', e => { e.preventDefault(); saveTaskForm(); });
  $('#taskForm').addEventListener('input', updateTaskForm);
  $('#taskForm').addEventListener('change', updateTaskForm);
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
    const invId = $('#snapInv').value, date = $('#snapDate').value, time = $('#snapTime').value, by = $('#snapBy').value.trim();
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
      Object.assign(state, {
        accounts: p.accounts || [], accChecks: p.accChecks || [], txs: p.txs || [], tasks: p.tasks || [],
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
    const note = document.querySelector('.storage-note span');
    if (note) note.innerHTML = 'Dados salvos no banco do sistema. <span id="syncStatus" class="sync-status"></span>';
    document.querySelector('#taskEditorNote span')?.insertAdjacentText('beforeend', '');
  }

  /* ---------- Início ---------- */
  $('#today').textContent = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
    .replace(/^./, c => c.toUpperCase());
  refresh();
  avisarPai({ type: 'fp-pronto' });
})();
