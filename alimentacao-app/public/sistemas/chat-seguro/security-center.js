'use strict';
/* Central de Segurança — somente administradores (validado no servidor via is_admin / RPCs).
   Nunca exibe conteúdo de mensagens, room_id, chaves ou anexos. */
(function () {
  const TYPE_LABEL = {
    copy_attempt: 'Cópias',
    cut_attempt: 'Recortes',
    paste_detected: 'Colagens',
    print_attempt: 'Impressões',
    screenshot_attempt: 'Atalhos PrintScreen',
    capture_shortcut: 'Atalhos de captura',
    image_opened: 'Imagens abertas',
    view_expired: 'Visualizações expiradas',
    reopen_denied: 'Reaberturas recusadas',
    visibility_hidden: 'Perda de visibilidade',
    long_press: 'Toque longo',
    context_menu: 'Menu de contexto',
    selection_attempt: 'Seleção',
    devtools_open: 'DevTools',
    new_device: 'Novo aparelho',
  };

  function periodRange(key, customFrom, customTo) {
    const now = new Date();
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59));
    let start;
    if (key === 'today') {
      start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    } else if (key === '7d') {
      start = new Date(end); start.setUTCDate(start.getUTCDate() - 6); start.setUTCHours(0, 0, 0, 0);
    } else if (key === '30d') {
      start = new Date(end); start.setUTCDate(start.getUTCDate() - 29); start.setUTCHours(0, 0, 0, 0);
    } else if (key === 'month') {
      start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    } else if (key === 'custom' && customFrom && customTo) {
      start = new Date(customFrom + 'T00:00:00Z');
      return { from: start.toISOString(), to: new Date(customTo + 'T23:59:59Z').toISOString() };
    } else {
      start = new Date(end); start.setUTCDate(start.getUTCDate() - 29); start.setUTCHours(0, 0, 0, 0);
    }
    return { from: start.toISOString(), to: end.toISOString() };
  }

  function n(v) { return Number(v || 0).toLocaleString('pt-BR'); }

  async function openSecurityCenter(ctx) {
    const { sb, esc, ic, toast } = ctx;
    const { data: isAdmin, error: admErr } = await sb.rpc('sc_is_admin');
    if (admErr || !isAdmin) {
      toast('Acesso restrito a administradores.');
      return;
    }
    await sb.rpc('sc_admin_access_audit').catch(() => {});

    const root = document.createElement('div');
    root.id = 'sec-center';
    root.innerHTML = `
      <div class="sec-shell">
        <header class="sec-head">
          <div>
            <div class="sec-kicker">Administração</div>
            <h1>Central de Segurança</h1>
            <p class="sec-sub">Estatísticas agregadas. Sem conteúdo de conversas, sem chaves, sem destinatários.</p>
          </div>
          <button class="icon-btn" id="sec-close" title="Fechar">${ic('x')}</button>
        </header>

        <div class="sec-filters">
          <div class="sec-period">
            <button data-p="today">Hoje</button>
            <button data-p="7d">7 dias</button>
            <button data-p="30d" class="on">30 dias</button>
            <button data-p="month">Mês atual</button>
            <button data-p="custom">Personalizado</button>
          </div>
          <div class="sec-custom" id="sec-custom" hidden>
            <input type="date" id="sec-from">
            <span>—</span>
            <input type="date" id="sec-to">
            <button class="btn sm" id="sec-apply">Aplicar</button>
          </div>
          <input id="sec-q" class="sec-search" placeholder="Pesquisar funcionário" autocomplete="off">
          <select id="sec-type">
            <option value="">Todos os tipos</option>
            ${Object.entries(TYPE_LABEL).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}
          </select>
        </div>

        <div class="sec-disclaimer">
          ${ic('shield', 'xs')}
          Eventos do navegador são <b>observações</b> (ex.: “atalho de impressão detectado”), não prova de captura de tela,
          gravação ou vazamento. Aberturas de imagem autorizadas não são tratadas como suspeitas. Use para revisão humana.
        </div>

        <section class="sec-kpis" id="sec-kpis"></section>

        <section class="sec-charts">
          <div class="sec-card"><h3>Eventos por dia</h3><canvas id="c-day"></canvas></div>
          <div class="sec-card"><h3>Cópias por funcionário</h3><canvas id="c-copy"></canvas></div>
          <div class="sec-card"><h3>Impressões por período</h3><canvas id="c-print"></canvas></div>
          <div class="sec-card"><h3>Tipos mais frequentes</h3><canvas id="c-types"></canvas></div>
          <div class="sec-card"><h3>Imagens protegidas</h3><canvas id="c-img"></canvas></div>
          <div class="sec-card"><h3>Evolução mensal</h3><canvas id="c-month"></canvas></div>
        </section>

        <section class="sec-rank-wrap">
          <div class="sec-rank-head">
            <h2>Ranking de Eventos de Segurança</h2>
            <div class="sec-pager">
              <button id="sec-prev" class="btn ghost sm">Anterior</button>
              <span id="sec-pageinfo">—</span>
              <button id="sec-next" class="btn ghost sm">Próxima</button>
            </div>
          </div>
          <div class="sec-table-scroll">
            <table class="sec-table" id="sec-table">
              <thead>
                <tr>
                  <th data-s="pos">Posição</th>
                  <th data-s="name">Funcionário</th>
                  <th data-s="copies">Cópias</th>
                  <th data-s="cuts">Recortes</th>
                  <th data-s="pastes">Colagens</th>
                  <th data-s="prints">Impressões</th>
                  <th data-s="captures">Capturas*</th>
                  <th data-s="images">Imagens</th>
                  <th data-s="reopens">Reaberturas</th>
                  <th data-s="total">Total</th>
                  <th data-s="rate">Taxa</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
          <p class="sec-foot">* “Capturas” = atalhos observados pela página (PrintScreen / atalho). Não inclui Win+Shift+S, botões do celular ou fotos externas.</p>
        </section>
      </div>`;
    document.body.appendChild(root);

    const state = {
      period: '30d', from: '', to: '', q: '', type: '',
      sort: 'total', dir: 'desc', offset: 0, limit: 40, totalRows: 0,
    };

    const close = () => root.remove();
    root.querySelector('#sec-close').addEventListener('click', close);
    root.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

    root.querySelector('.sec-period').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      root.querySelectorAll('.sec-period button').forEach((x) => x.classList.toggle('on', x === b));
      state.period = b.dataset.p;
      root.querySelector('#sec-custom').hidden = state.period !== 'custom';
      state.offset = 0;
      if (state.period !== 'custom') reload();
    });
    root.querySelector('#sec-apply').addEventListener('click', () => {
      state.from = root.querySelector('#sec-from').value;
      state.to = root.querySelector('#sec-to').value;
      state.offset = 0; reload();
    });
    let qTimer = 0;
    root.querySelector('#sec-q').addEventListener('input', (e) => {
      clearTimeout(qTimer);
      qTimer = setTimeout(() => { state.q = e.target.value.trim(); state.offset = 0; reloadRanking(); }, 250);
    });
    root.querySelector('#sec-type').addEventListener('change', (e) => {
      state.type = e.target.value; state.offset = 0; reload();
    });
    root.querySelector('#sec-table thead').addEventListener('click', (e) => {
      const th = e.target.closest('th'); if (!th || !th.dataset.s) return;
      if (state.sort === th.dataset.s) state.dir = state.dir === 'desc' ? 'asc' : 'desc';
      else { state.sort = th.dataset.s; state.dir = th.dataset.s === 'name' ? 'asc' : 'desc'; }
      state.offset = 0; reloadRanking();
    });
    root.querySelector('#sec-prev').addEventListener('click', () => {
      state.offset = Math.max(0, state.offset - state.limit); reloadRanking();
    });
    root.querySelector('#sec-next').addEventListener('click', () => {
      if (state.offset + state.limit < state.totalRows) {
        state.offset += state.limit; reloadRanking();
      }
    });

    function range() {
      return periodRange(state.period, state.from, state.to);
    }

    async function reload() {
      const { from, to } = range();
      const [{ data: overview, error: oErr }, seriesPack] = await Promise.all([
        sb.rpc('sc_admin_security_overview', { p_from: from, p_to: to }),
        Promise.all([
          sb.rpc('sc_admin_security_series', { p_from: from, p_to: to, p_metric: 'by_day' }),
          sb.rpc('sc_admin_security_series', { p_from: from, p_to: to, p_metric: 'copy_by_user' }),
          sb.rpc('sc_admin_security_series', { p_from: from, p_to: to, p_metric: 'print_by_day' }),
          sb.rpc('sc_admin_security_series', { p_from: from, p_to: to, p_metric: 'types' }),
          sb.rpc('sc_admin_security_series', { p_from: from, p_to: to, p_metric: 'images' }),
          sb.rpc('sc_admin_security_series', { p_from: from, p_to: to, p_metric: 'monthly' }),
        ]),
      ]);
      if (oErr) { toast(oErr.message || 'Falha ao carregar estatísticas'); return; }
      renderKpis(overview || {});
      const charts = window.SCCharts;
      if (charts) {
        charts.lineChart(root.querySelector('#c-day'), seriesPack[0].data || []);
        charts.barChart(root.querySelector('#c-copy'), seriesPack[1].data || []);
        charts.lineChart(root.querySelector('#c-print'), seriesPack[2].data || [], { color: '#f59e0b' });
        charts.doughnut(root.querySelector('#c-types'), seriesPack[3].data || []);
        charts.dualLine(root.querySelector('#c-img'), seriesPack[4].data || []);
        charts.barChart(root.querySelector('#c-month'), (seriesPack[5].data || []).map((x) => ({ name: x.month, count: x.count })));
      }
      await reloadRanking();
    }

    function renderKpis(o) {
      const by = o.by_type || {};
      const captures = (by.screenshot_attempt || 0) + (by.capture_shortcut || 0);
      const cards = [
        ['Total de eventos', o.total],
        ['Cópias', by.copy_attempt],
        ['Recortes', by.cut_attempt],
        ['Colagens', by.paste_detected],
        ['Impressões', by.print_attempt],
        ['Atalhos de captura*', captures],
        ['Imagens abertas', by.image_opened],
        ['Visualizações expiradas', by.view_expired],
        ['Reaberturas recusadas', by.reopen_denied],
      ];
      root.querySelector('#sec-kpis').innerHTML = cards.map(([label, val]) =>
        `<div class="sec-kpi"><div class="sec-kpi-v">${n(val)}</div><div class="sec-kpi-l">${esc(label)}</div></div>`
      ).join('');
    }

    async function reloadRanking() {
      const { from, to } = range();
      const { data, error } = await sb.rpc('sc_admin_security_ranking', {
        p_from: from, p_to: to,
        p_user: null,
        p_type: state.type || null,
        p_q: state.q || null,
        p_sort: state.sort === 'name' ? 'name' : state.sort,
        p_dir: state.dir,
        p_limit: state.limit,
        p_offset: state.offset,
      });
      if (error) { toast(error.message || 'Falha no ranking'); return; }
      state.totalRows = data?.total_rows || 0;
      const tbody = root.querySelector('#sec-table tbody');
      const rows = data?.rows || [];
      tbody.innerHTML = rows.length ? rows.map((r) => `<tr>
        <td>${esc(r.pos)}</td>
        <td><div class="sec-user">${esc(r.display_name)}</div><div class="sec-user-sub">@${esc(r.username)}</div></td>
        <td>${n(r.copies)}</td><td>${n(r.cuts)}</td><td>${n(r.pastes)}</td>
        <td>${n(r.prints)}</td><td>${n(r.captures)}</td><td>${n(r.images)}</td>
        <td>${n(r.reopens)}</td><td><b>${n(r.total)}</b></td>
        <td title="Eventos / toques de sessão no período">${Number(r.rate || 0).toFixed(2)}</td>
      </tr>`).join('') : `<tr><td colspan="11" class="sec-empty">Nenhum evento no período filtrado.</td></tr>`;

      const page = Math.floor(state.offset / state.limit) + 1;
      const pages = Math.max(1, Math.ceil(state.totalRows / state.limit));
      root.querySelector('#sec-pageinfo').textContent = `${page} / ${pages} · ${n(state.totalRows)} funcionários`;
      root.querySelectorAll('#sec-table thead th').forEach((th) => {
        th.classList.toggle('sorted', th.dataset.s === state.sort);
        th.dataset.dir = th.dataset.s === state.sort ? state.dir : '';
      });
    }

    await reload();
    window.addEventListener('resize', () => { /* charts redraw on next filter */ }, { once: true });
  }

  window.SCSecurityCenter = { open: openSecurityCenter };
})();
