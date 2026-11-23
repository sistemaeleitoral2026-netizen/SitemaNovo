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
  const TITLES = { overview: 'Visão geral', transactions: 'Movimentações', accounts: 'Contas', investments: 'Investimentos', reports: 'Relatórios' };

  /* ---------- Formatação ---------- */
  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const money = n => brl.format(n);
  const signed = n => (n >= 0 ? '+ ' : '− ') + brl.format(Math.abs(n));
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
  const uid = () => Math.random().toString(36).slice(2, 10);
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
    const target = { nu: 5420.5, itau: 4220, bb: 3200 };
    accounts.forEach(a => {
      const net = txs.filter(x => x.account === a.id).reduce((s, x) => s + (x.kind === 'income' ? x.amount : -x.amount), 0);
      a.initial = +(target[a.id] - net).toFixed(2);
    });

    const investments = [
      { id: 'res', name: 'Reserva de emergência', type: 'Poupança', institution: 'Banco do Brasil' },
      { id: 'cdb', name: 'CDB liquidez diária', type: 'Renda fixa', institution: 'Nubank' },
    ];
    // Verificações diárias de 10 a 23/11 (dias úteis), com o saldo final do layout original
    const days = ['10', '11', '12', '13', '14', '17', '18', '19', '20', '21', '23'];
    const times = ['09:12', '09:40', '08:55', '10:05', '09:20', '09:31', '08:47', '09:58', '09:15', '10:22', '09:08'];
    const snapshots = [];
    days.forEach((d, i) => {
      const back = days.length - 1 - i;
      snapshots.push({ id: uid(), invId: 'res', date: `2026-11-${d}`, time: times[i], balance: +(5000 - back * 1.35).toFixed(2), by: 'Responsável' });
      snapshots.push({ id: uid(), invId: 'cdb', date: `2026-11-${d}`, time: times[i], balance: +(3500 - back * 1.62 + (i === 6 ? -2.1 : 0)).toFixed(2), by: 'Responsável' });
    });
    return { accounts, txs, investments, snapshots, goal: 15000, people: ['Responsável'] };
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
  let state;
  try {
    state = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!state) { const old = JSON.parse(localStorage.getItem(OLD_KEY)); state = old ? migrate(old) : seed(); }
  } catch { state = seed(); }
  state.snapshots ||= []; state.people ||= [];
  const save = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* sem armazenamento */ } };

  let period = null;
  let view = 'overview';
  let chartMode = 'line';
  try { chartMode = localStorage.getItem('mf:chart') || 'line'; } catch { /* */ }

  const accName = id => state.accounts.find(a => a.id === id)?.name ?? '—';
  const invName = id => state.investments.find(a => a.id === id)?.name ?? '—';
  const value = x => (x.kind === 'income' ? x.amount : -x.amount);
  const sum = (list, kind) => list.filter(x => !kind || x.kind === kind).reduce((s, x) => s + (kind ? x.amount : value(x)), 0);
  const inMonth = k => state.txs.filter(x => ym(x.date) === k);
  const upTo = k => state.txs.filter(x => ym(x.date) <= k);
  const accBalance = (a, k) => a.initial + sum(upTo(k).filter(x => x.account === a.id));
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
    return [...set].sort().reverse();
  }

  /* ---------- Componentes ---------- */
  function txRow(x, withDelete) {
    return `<tr>
      <td><div class="t-desc"><span class="t-ico">${icon(CAT_ICON[x.category] || 'ellipsis', 'i-sm')}</span>${esc(x.description)}</div></td>
      <td>${esc(x.category)}</td>
      <td class="t-muted">${esc(accName(x.account))}</td>
      <td class="t-muted num">${shortDate(x.date)}</td>
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
    const W = svg.clientWidth || 600, H = 230, pad = { l: 52, r: 12, t: 18, b: 26 };
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
    const W = svg.clientWidth || 600, H = 220, pad = { l: 56, r: 14, t: 16, b: 26 };
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
    $('#goalBox').innerHTML = goalBox();

    // Movimentações
    const q = $('#q').value.trim().toLowerCase(), fk = $('#fKind').value, fa = $('#fAccount').value;
    const filtered = list.filter(x =>
      (fk === 'all' || x.kind === fk) && (fa === 'all' || x.account === fa) &&
      (!q || `${x.description} ${x.category} ${accName(x.account)}`.toLowerCase().includes(q)));
    $('#allRows').innerHTML = filtered.map(x => txRow(x, true)).join('') || '<tr><td colspan="6" class="empty">Nenhum lançamento encontrado.</td></tr>';

    // Contas
    $('#accFull').innerHTML = accRows(k, true);

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

    $('#investRows').innerHTML = state.investments.map(i => {
      const l = snapsOf(i.id), cur = l.at(-1), before = l.at(-2);
      return `<tr>
        <td><div class="t-desc"><span class="t-ico">${icon('piggy-bank', 'i-sm')}</span><div>${esc(i.name)}<div class="acc-type">${esc(i.type)}</div></div></div></td>
        <td class="t-muted">${esc(i.institution)}</td>
        <td class="t-right num amount">${cur ? money(cur.balance) : '—'}</td>
        <td class="t-right">${cur ? chip(before ? cur.balance - before.balance : null, before?.balance) : ''}</td>
        <td style="white-space:normal;min-width:170px">${cur ? `<span class="checked">${icon('clock', 'i-sm')}${fullDate(cur.date)} às ${cur.time} · ${esc(cur.by)}</span>` : '<span class="t-muted">sem verificação</span>'}</td>
        <td class="t-right" style="white-space:nowrap">
          <button class="btn btn-sm" data-open="snap" data-inv="${i.id}">${icon('pencil-line', 'i-sm')}Registrar saldo</button>
          <button class="icon-btn" data-del-inv="${i.id}" aria-label="Excluir aplicação">${icon('trash-2', 'i-sm')}</button>
        </td></tr>`;
    }).join('') || '<tr><td colspan="6" class="empty">Nenhuma aplicação cadastrada.</td></tr>';
    $('#investRows').insertAdjacentHTML('beforeend', state.investments.length
      ? `<tr><td colspan="2"><strong>Total</strong></td><td class="t-right num"><strong>${money(invTotal())}</strong></td><td colspan="3"></td></tr>` : '');

    const fi = $('#fInv').value || 'all';
    const hist = state.snapshots.filter(s => fi === 'all' || s.invId === fi)
      .sort((a, b) => stamp(b).localeCompare(stamp(a))).slice(0, 60);
    $('#snapRows').innerHTML = hist.map(s => {
      const p = prevSnap(s);
      return `<tr>
        <td class="num">${fullDate(s.date)}</td>
        <td class="num t-muted">${s.time}</td>
        <td>${esc(invName(s.invId))}</td>
        <td class="t-right num amount">${money(s.balance)}</td>
        <td class="t-right">${chip(p ? s.balance - p.balance : null, p?.balance)}</td>
        <td><span class="checked">${icon('user-round', 'i-sm')}${esc(s.by)}</span></td>
        <td class="t-right" style="width:44px"><button class="icon-btn" data-del-snap="${s.id}" aria-label="Excluir registro">${icon('trash-2', 'i-sm')}</button></td>
      </tr>`;
    }).join('') || '<tr><td colspan="7" class="empty">Nenhuma verificação registrada ainda.</td></tr>';
  }

  function fillPeriod() {
    const ms = months();
    if (!period || !ms.includes(period)) period = ms.find(m => inMonth(m).length) || ms[0];
    $('#period').innerHTML = ms.map(m => `<option value="${m}" ${m === period ? 'selected' : ''}>${monthLabel(m)}</option>`).join('');
  }

  function fillSelects() {
    const opts = state.accounts.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('');
    $('#txAcc').innerHTML = opts;
    $('#fAccount').innerHTML = '<option value="all">Todas as contas</option>' + opts;
    const inv = state.investments.map(i => `<option value="${i.id}">${esc(i.name)}</option>`).join('');
    const cur = $('#fInv').value;
    $('#fInv').innerHTML = '<option value="all">Todas as aplicações</option>' + inv;
    if (cur && $(`#fInv option[value="${cur}"]`)) $('#fInv').value = cur;
    $('#snapInv').innerHTML = inv;
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
    if (v === 'overview') flowChart(period);
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
    if (name === 'invest') $('#invBy').value = state.people[0] || '';
    setTimeout(() => {
      const target = name === 'snap' ? $('#snapBal') : $('input:not([type=radio])', m);
      target?.focus();
    }, 20);
  }
  function closeModals() {
    $$('.modal-backdrop.open').forEach(m => { m.classList.remove('open'); $('form', m)?.reset(); });
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
    else if (b.dataset.delTx) {
      if (confirm('Excluir este lançamento?')) { state.txs = state.txs.filter(x => x.id !== b.dataset.delTx); save(); refresh(); }
    } else if (b.dataset.delAcc) {
      const a = state.accounts.find(x => x.id === b.dataset.delAcc);
      const n = state.txs.filter(x => x.account === a.id).length;
      if (n) { alert(`"${a.name}" tem ${n} lançamento(s). Exclua-os antes de remover a conta.`); return; }
      if (confirm(`Excluir a conta "${a.name}"?`)) { state.accounts = state.accounts.filter(x => x.id !== a.id); save(); refresh(); }
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

  $('#period').addEventListener('change', e => { period = e.target.value; render(); });
  ['#q', '#fKind', '#fAccount'].forEach(s => $(s).addEventListener(s === '#q' ? 'input' : 'change', render));
  $('#fInv').addEventListener('change', renderInvestments);
  $('#snapInv').addEventListener('change', updateSnapPrev);
  $$('input[name="kind"]').forEach(r => r.addEventListener('change', fillCategories));

  $('#txForm').addEventListener('submit', e => {
    e.preventDefault();
    const amount = Math.round(Number($('#txAmount').value) * 100) / 100;
    if (!(amount > 0)) return;
    const date = $('#txDate').value;
    state.txs.push({
      id: uid(), date, amount,
      description: $('#txDesc').value.trim(),
      kind: $('input[name="kind"]:checked').value,
      category: $('#txCat').value,
      account: $('#txAcc').value,
    });
    period = ym(date);
    save(); closeModals(); refresh();
  });

  $('#accForm').addEventListener('submit', e => {
    e.preventDefault();
    state.accounts.push({ id: uid(), name: $('#accName').value.trim(), type: $('#accType').value, initial: Number($('#accInitial').value) || 0 });
    save(); closeModals(); refresh();
  });

  $('#invForm').addEventListener('submit', e => {
    e.preventDefault();
    const amount = Math.round(Number($('#invAmount').value) * 100) / 100;
    if (!(amount >= 0)) return;
    const id = uid(), by = $('#invBy').value.trim();
    state.investments.push({ id, name: $('#invName').value.trim(), type: $('#invType').value, institution: $('#invInst').value.trim() });
    state.snapshots.push({ id: uid(), invId: id, date: todayISO(), time: nowTime(), balance: amount, by });
    rememberPerson(by);
    save(); closeModals(); refresh();
  });

  $('#snapForm').addEventListener('submit', e => {
    e.preventDefault();
    const balance = Math.round(Number($('#snapBal').value) * 100) / 100;
    if (!(balance >= 0)) return;
    const invId = $('#snapInv').value, date = $('#snapDate').value, time = $('#snapTime').value, by = $('#snapBy').value.trim();
    const dup = state.snapshots.find(s => s.invId === invId && s.date === date && s.time === time);
    if (dup && !confirm(`Já existe um registro de ${invName(invId)} em ${fullDate(date)} às ${time}. Substituir?`)) return;
    if (dup) state.snapshots = state.snapshots.filter(s => s !== dup);
    state.snapshots.push({ id: uid(), invId, date, time, balance, by });
    rememberPerson(by);
    save(); closeModals(); refresh();
  });

  let rt; window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => { if (view === 'overview') flowChart(period); if (view === 'investments') investChart(); }, 120);
  });

  /* ---------- Ponte com o sistema (página React que carrega este iframe) ---------- */
  const embutido = window.parent !== window;
  const avisarPai = msg => { if (embutido) window.parent.postMessage(msg, window.location.origin); };
  window.addEventListener('message', ev => {
    if (ev.origin !== window.location.origin || ev.source !== window.parent) return;
    const d = ev.data || {};
    if (d.type === 'fp-user') {
      const nome = String(d.nome || 'Usuário');
      $('#userName').textContent = nome;
      $('#userAvatar').textContent = nome.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
      $('#userBox').hidden = false;
      $('#btnNerites').hidden = !d.neritesAdmin;
    }
  });
  $('#btnSair').addEventListener('click', () => avisarPai({ type: 'fp-sair' }));
  $('#btnNerites').addEventListener('click', () => avisarPai({ type: 'fp-nerites' }));

  /* ---------- Início ---------- */
  $('#today').textContent = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
    .replace(/^./, c => c.toUpperCase());
  refresh();
  avisarPai({ type: 'fp-pronto' });
})();
