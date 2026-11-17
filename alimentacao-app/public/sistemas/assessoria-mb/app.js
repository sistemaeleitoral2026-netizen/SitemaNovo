(() => {
  "use strict";
  const $ = (s) => document.querySelector(s),
    $$ = (s) => [...document.querySelectorAll(s)];
  const icon = (name) =>
    `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const fmt = (n) =>
    (Number(n) || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  const esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const money = (n) => {
    if (typeof n === "number") return n;
    const v = String(n ?? "").trim();
    if (!v) return 0;
    const x = v.replace(/[^\d,.-]/g, "");
    return (
      Number(x.includes(",") ? x.replace(/\./g, "").replace(",", ".") : x) || 0
    );
  };
  const inputBRL = (n) => fmt(n);
  const maskBRL = (el) => {
    const digits = el.value.replace(/\D/g, "");
    el.value = fmt(Number(digits || 0) / 100);
  };
  let subdivisions = [
    "ESP",
    "MTAREIA",
    "MTEX",
    "MARI",
    "IMP",
    "SONIGNF",
    "CAST",
    "PREF GNF",
    "PREF ZD",
  ];
  function refreshCompanies() {
    if (typeof db === "undefined" || !db) return;
    if (Array.isArray(db.companies) && db.companies.length) {
      subdivisions = db.companies.slice();
    } else {
      db.companies = subdivisions.slice();
    }
  }
  const names = {
    empresas: "Empresas",
    receber: "Contas a receber",
    pagar: "Contas a pagar",
    historico: "Histórico financeiro",
    "tarefas-historico": "Prestação de contas",
    dashboard: "Painel",
    financeiro: "Lançamentos",
    demandas: "Demandas e tarefas",
    minhas: "Minhas tarefas",
    anexos: "Comprovantes",
    auditoria: "Auditoria",
    configuracoes: "Configurações",
  };
  let monthlyHistory = [];
  const raw = [];
  const initial = () => ({ finance: [], tasks: [], audit: [] });
  const KEY = "assessoria-mb-demo-v4";
  const PENDING_KEY = "assessoria-mb-pending-v1";
  let COST_CODES = ["M1", "M2", "M3", "M4", "M5"];
  function refreshCostCodes() {
    if (typeof db === "undefined" || !db) return;
    if (!db.centers || typeof db.centers !== "object") db.centers = {};
    const keys = Object.keys(db.centers)
      .map((s) => String(s).trim())
      .filter(Boolean);
    if (keys.length) {
      COST_CODES = keys.sort((a, b) =>
        a.localeCompare(b, "pt-BR", { numeric: true }),
      );
    } else {
      COST_CODES = ["M1", "M2", "M3", "M4", "M5"];
      for (const c of COST_CODES) {
        if (db.centers[c] == null) db.centers[c] = "";
      }
    }
  }
  let db;
  try {
    db = JSON.parse(localStorage.getItem(KEY)) || initial();
  } catch {
    db = initial();
  }
  if (!Array.isArray(db.finance)) db.finance = [];
  db.finance = db.finance.filter(
    (r) =>
      r.origem !== "Planilha TURIEX" && !String(r.id || "").match(/^ref\d+$/),
  );
  if (!db.centers || typeof db.centers !== "object") db.centers = {};
  const defaultBanks = [
    "INTER",
    "RB",
    "ITAU",
    "GRUPO LEANDRO",
    "PB ITAU",
    "MATHEUS BB",
    "BB MATHEUS PJ",
    "RE FASHION SANTANDER",
    "BNB",
    "Espécie",
  ];
  const defaultTemplates = [
    "Abastecimento",
    "Estúdio",
    "Lanche escritório",
    "Starlink",
    "Óleo avião",
    "Pagamento de condomínio",
    "Pagamento de conta",
  ];
  if (!Array.isArray(db.banks)) db.banks = defaultBanks.slice();
  if (!Array.isArray(db.templates)) db.templates = defaultTemplates.slice();
  if (!Array.isArray(db.staff)) db.staff = [];
  if (!db.historyEdits) db.historyEdits = {};
  if (!Array.isArray(db.companies)) db.companies = [];
  refreshCostCodes();
  refreshCompanies();
  let page = "dashboard",
    typeModal = "",
    editing = null;
  let removedAttachments = new Set();
  const state = {
    mes: "",
    demanda: "",
    pesquisa: "",
    finType: "",
    finStatus: "",
    finCost: "",
    finReconcileIds: null,
    finSort: "desc",
    finPage: 1,
    finPageSize: 5,
    finView: "table",
    finFiltersOpen: true,
    taskStatus: "",
    empresa: "",
    historyQuery: "",
    finHistMonth: "",
    finHistCompany: "",
    finHistCost: "",
    finHistSearch: "",
    finHistPage: 1,
    historyCentro: "",
    historyBank: "",
    histMonth: "",
    histStatus: "",
    histFrom: "",
    histTo: "",
    histPage: 1,
    auditPage: 1,
    taskQuery: "",
    role: "admin",
    taskMonth: "",
  };
  if (state.empresa === "__ref__") state.empresa = "";
  if (state.finHistCompany === "__ref__") state.finHistCompany = "";
  const emptyMutations = () => ({
    financeUpserts: {},
    financeDeletes: {},
    taskUpserts: {},
    taskDeletes: {},
    auditUpserts: {},
    historyUpserts: {},
    settings: {},
  });
  let pendingMutations;
  try {
    pendingMutations = {
      ...emptyMutations(),
      ...(JSON.parse(localStorage.getItem(PENDING_KEY)) || {}),
    };
  } catch {
    pendingMutations = emptyMutations();
  }
  for (const key of Object.keys(emptyMutations())) {
    if (!pendingMutations[key] || typeof pendingMutations[key] !== "object")
      pendingMutations[key] = {};
  }
  let mutationVersion = Math.max(
    0,
    ...Object.values(pendingMutations).flatMap((group) =>
      Object.values(group).map(Number),
    ),
  );
  function persistPendingMutations() {
    try {
      localStorage.setItem(PENDING_KEY, JSON.stringify(pendingMutations));
    } catch {
      toast("Não foi possível guardar a fila de sincronização");
    }
  }
  function markMutation(group, id) {
    if (!id) return;
    const opposite = {
      financeUpserts: "financeDeletes",
      financeDeletes: "financeUpserts",
      taskUpserts: "taskDeletes",
      taskDeletes: "taskUpserts",
    }[group];
    if (opposite) delete pendingMutations[opposite][id];
    pendingMutations[group][id] = ++mutationVersion;
    persistPendingMutations();
  }
  function markSetting(key) {
    pendingMutations.settings[key] = ++mutationVersion;
    persistPendingMutations();
  }
  function mutationPayload() {
    return {
      financeUpserts: Object.keys(pendingMutations.financeUpserts),
      financeDeletes: Object.keys(pendingMutations.financeDeletes),
      taskUpserts: Object.keys(pendingMutations.taskUpserts),
      taskDeletes: Object.keys(pendingMutations.taskDeletes),
      auditUpserts: Object.keys(pendingMutations.auditUpserts),
      historyUpserts: Object.keys(pendingMutations.historyUpserts),
      settings: Object.keys(pendingMutations.settings),
    };
  }
  function hasPendingMutations() {
    return Object.values(pendingMutations).some(
      (group) => Object.keys(group).length > 0,
    );
  }
  function captureMutationBatch() {
    return {
      versions: Object.fromEntries(
        Object.entries(pendingMutations).map(([key, group]) => [
          key,
          { ...group },
        ]),
      ),
      payload: mutationPayload(),
    };
  }
  function acknowledgeMutationBatch(batch) {
    if (!batch) return;
    for (const [group, entries] of Object.entries(batch.versions)) {
      for (const [id, version] of Object.entries(entries)) {
        if (pendingMutations[group][id] === version)
          delete pendingMutations[group][id];
      }
    }
    persistPendingMutations();
  }
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch {
      toast("Não foi possível salvar no navegador");
    }
    scheduleCloudSave();
  };
  let cloudTimer = null,
    cloudReq = 0,
    cloudPending = {};
  let persistBusyRetries = 0;
  async function blobToB64(blob) {
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }
  async function collectPendingFiles(snapshot) {
    const files = {};
    const lists = [];
    for (const r of snapshot.finance || [])
      for (const a of r.anexos || []) lists.push(a);
    for (const t of snapshot.tasks || [])
      for (const a of t.anexos || []) lists.push(a);
    for (const ed of Object.values(snapshot.historyEdits || {}))
      for (const a of ed.anexos || []) lists.push(a);
    for (const a of lists) {
      if (!a || !a.id || a.path || a.signedUrl) continue;
      const blob = fileMem[a.id] || (await fileStore.get(a.id));
      if (!blob) {
        console.warn("anexo sem blob", a.id, a.name);
        continue;
      }
      files[a.id] = {
        name: a.name || "arquivo",
        type: a.type || blob.type || "application/octet-stream",
        size: a.size || blob.size || 0,
        dataBase64: await blobToB64(blob),
      };
    }
    return files;
  }
  function scheduleCloudSave() {
    if (!MB.embed) return;
    clearTimeout(cloudTimer);
    cloudTimer = setTimeout(() => void cloudSave(), 600);
  }
  async function cloudSave() {
    if (!MB.embed || !hasPendingMutations()) return;
    const requestId = "p" + ++cloudReq;
    const batch = captureMutationBatch();
    let snapshot = {
      finance: db.finance,
      tasks: db.tasks,
      audit: db.audit,
      banks: db.banks,
      templates: db.templates,
      staff: db.staff,
      centers: db.centers || {},
      companies: db.companies || subdivisions.slice(),
      historyEdits: db.historyEdits || {},
      prestacao: [],
      _mutations: batch.payload,
    };
    try {
      snapshot._files = await collectPendingFiles(snapshot);
    } catch (err) {
      toast("Falha ao ler comprovantes para nuvem");
      return;
    }
    snapshot = {
      finance: db.finance,
      tasks: db.tasks,
      audit: db.audit,
      banks: db.banks,
      templates: db.templates,
      staff: db.staff,
      centers: db.centers || {},
      companies: db.companies || subdivisions.slice(),
      historyEdits: db.historyEdits || {},
      prestacao: [],
      _files: snapshot._files,
      _mutations: batch.payload,
    };
    cloudPending[requestId] = batch;
    try {
      toParent({ type: "mb-persist", requestId, payload: snapshot });
    } catch (err) {
      delete cloudPending[requestId];
      toast("Arquivo grande demais para enviar. Use PDF/imagem menor.");
    }
  }
  function applyCloudDb(payload) {
    if (!payload || typeof payload !== "object") return;
    db.finance = Array.isArray(payload.finance) ? payload.finance : [];
    db.tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
    db.audit = Array.isArray(payload.audit) ? payload.audit : [];
    if (Array.isArray(payload.banks) && payload.banks.length)
      db.banks = payload.banks.slice();
    if (Array.isArray(payload.templates) && payload.templates.length)
      db.templates = payload.templates.slice();
    if (Array.isArray(payload.staff)) db.staff = payload.staff.slice();
    if (payload.centers && typeof payload.centers === "object")
      db.centers = payload.centers;
    if (Array.isArray(payload.companies))
      db.companies = payload.companies.slice();
    refreshCostCodes();
    refreshCompanies();
    db.historyEdits =
      payload.historyEdits && typeof payload.historyEdits === "object"
        ? payload.historyEdits
        : {};
    monthlyHistory = [];
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch {}
    render();
  }
  function applyCloudDbPreservingPending(payload) {
    const local = {
      finance: db.finance.slice(),
      tasks: db.tasks.slice(),
      audit: db.audit.slice(),
      banks: db.banks.slice(),
      templates: db.templates.slice(),
      staff: db.staff.slice(),
      centers: { ...(db.centers || {}) },
      companies: (db.companies || []).slice(),
      historyEdits: { ...(db.historyEdits || {}) },
    };
    applyCloudDb(payload);
    const mergeRecords = (remote, localRows, upserts, deletes) => {
      const result = new Map(remote.map((row) => [row.id, row]));
      for (const id of Object.keys(upserts)) {
        const row = localRows.find((item) => item.id === id);
        if (row) result.set(id, row);
      }
      for (const id of Object.keys(deletes)) result.delete(id);
      return [...result.values()];
    };
    db.finance = mergeRecords(
      db.finance,
      local.finance,
      pendingMutations.financeUpserts,
      pendingMutations.financeDeletes,
    );
    db.tasks = mergeRecords(
      db.tasks,
      local.tasks,
      pendingMutations.taskUpserts,
      pendingMutations.taskDeletes,
    );
    const auditById = new Map(db.audit.map((row) => [row.id, row]));
    for (const id of Object.keys(pendingMutations.auditUpserts)) {
      const row = local.audit.find((item) => item.id === id);
      if (row) auditById.set(id, row);
    }
    db.audit = [...auditById.values()].sort((a, b) =>
      String(b.at).localeCompare(String(a.at)),
    );
    for (const id of Object.keys(pendingMutations.historyUpserts)) {
      if (local.historyEdits[id]) db.historyEdits[id] = local.historyEdits[id];
    }
    for (const key of Object.keys(pendingMutations.settings)) {
      if (key === "centers") db.centers = local.centers;
      else if (key === "companies") db.companies = local.companies;
      else db[key] = local[key];
    }
    refreshCostCodes();
    refreshCompanies();
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch {}
    render();
  }
  function toast(t) {
    const e = $("#toast");
    e.textContent = t;
    e.classList.add("show");
    setTimeout(() => e.classList.remove("show"), 3300);
  }
  function audit(action, detail) {
    const record = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      actor: MB.nome || "Usuário",
      action,
      detail,
    };
    db.audit.unshift(record);
    markMutation("auditUpserts", record.id);
    save();
  }
  function samePerson(a, b) {
    return (
      String(a || "")
        .trim()
        .toLowerCase() ===
        String(b || "")
          .trim()
          .toLowerCase() && !!String(a || "").trim()
    );
  }
  function canDeleteRec(r) {
    if (!r) return false;
    if (MB.admin) return true;
    if (
      MB.userId &&
      r.criadoPorId &&
      String(r.criadoPorId) === String(MB.userId)
    )
      return true;
    return !MB.userId && samePerson(r.criadoPor, MB.nome);
  }
  function deleteBtn(kind, id) {
    return `<button class='edit-action danger' type='button' data-delete-${kind}='${esc(id)}'>Excluir</button>`;
  }
  const pick = (arr, key, v) => !v || arr[key] === v;
  const month = (d) => String(d || "").slice(0, 7);
  function financeFiltered() {
    return db.finance.filter(
      (r) =>
        (!state.mes || month(r.data) === state.mes) &&
        (!state.empresa || r.sub === state.empresa) &&
        (page !== "financeiro" ||
          ((!state.finReconcileIds || state.finReconcileIds.has(r.id)) &&
            (!state.finType || finTipo(r) === state.finType) &&
            (!state.finStatus || finStatus(r)[0] === state.finStatus) &&
            (!state.finCost || r.centro === state.finCost) &&
            (!state.pesquisa ||
              [r.parceiro, r.centro, r.empresaDepositante, r.demanda, r.sub]
                .join(" ")
                .toLocaleLowerCase("pt-BR")
                .includes(state.pesquisa.toLocaleLowerCase("pt-BR"))))),
    );
  }
  function taskFiltered() {
    return db.tasks.filter(
      (t) =>
        (!state.taskStatus || t.status === state.taskStatus) &&
        (!state.taskMonth || month(t.prazo) === state.taskMonth) &&
        (!state.taskQuery ||
          [t.titulo, t.nome, t.responsavel, t.origemPagamento, t.sub]
            .join(" ")
            .toLowerCase()
            .includes(state.taskQuery.toLowerCase())) &&
        (!state.taskResponsavel || t.responsavel === state.taskResponsavel),
    );
  }
  const totals = (rows) =>
    rows.reduce(
      (a, r) => (
        (a.prev += money(r.previsto)),
        (a.rec += money(r.recebido)),
        (a.recReceita +=
          finKind(r) === "receita" ? money(r.recebido) : 0),
        (a.recExtra +=
          finKind(r) === "entrada_por_fora" ? money(r.recebido) : 0),
        (a.sai += money(r.saida)),
        a
      ),
      { prev: 0, rec: 0, recReceita: 0, recExtra: 0, sai: 0 },
    );
  function metrics(container, rows) {
    const a = totals(rows),
      pct = a.prev ? Math.round((a.recReceita / a.prev) * 100) : 0,
      saldo = a.rec - a.sai;
    const items = [
      [
        "in",
        "down",
        "A Receber (Previsto)",
        fmt(a.prev),
        `${rows.length} lançamento(s)`,
      ],
      [
        "ok",
        "check",
        "Recebido",
        fmt(a.rec),
        `<span class="pos">${pct}% do previsto${a.recExtra ? ` · ${fmt(a.recExtra)} por fora` : ""}</span><div class="meter"><i style="width:${Math.min(100, pct)}%"></i></div>`,
      ],
      [
        "out",
        "arrow",
        "Despesas / Saídas",
        fmt(a.sai),
        `${rows.length} lançamento(s)`,
      ],
      ["bal", "database", "Saldo Líquido", fmt(saldo), "Recebido – Saídas"],
    ];
    $(container).innerHTML = items
      .map(
        (x) =>
          `<article class="kpi ${x[0]}"><span class="kpi-ico">${icon(x[1])}</span><div class="kpi-body"><div class="label">${x[2]}</div><strong class="${x[0] === "bal" && saldo < 0 ? "neg" : ""}" title="${x[3]}">${x[3]}</strong><small>${x[4]}</small></div></article>`,
      )
      .join("");
  }
  function selectField(label, id, opts, value = "", first = "Todos") {
    return `<div class="field"><label for="${id}">${label}</label><select class="control" id="${id}"><option value="">${first}</option>${opts.map((v) => `<option value="${esc(v)}" ${value === v ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></div>`;
  }
  function drawFilters(id) {
    $(id).innerHTML =
      `<div class="filters"><div class="field"><label for="${id.slice(1)}-month">Mês de referência</label><input class="control" type="month" id="${id.slice(1)}-month" value="${state.mes}"></div>${selectField("Demanda", id.slice(1) + "-demanda", ["Demanda J", "Demanda D"], state.demanda, "Todas")}${id === "#filter-financeiro" ? `<div class="field"><label>Pesquisar</label><input class="control" id="fin-search" placeholder="Parceiro, centro de custo..." value="${esc(state.pesquisa)}"></div>` : ""}</div>`;
    const prefix = id.slice(1);
    $("#" + prefix + "-month").onchange = (e) => {
      state.mes = e.target.value;
      render();
    };
    $("#" + prefix + "-demanda").onchange = (e) => {
      state.demanda = e.target.value;
      render();
    };
    if ($("#fin-search"))
      $("#fin-search").oninput = (e) => {
        state.pesquisa = e.target.value;
        drawFinance();
      };
  }
  const statusPill = (s) =>
    `<span class="pill ${s === "Concluída" ? "ok" : s === "Em andamento" ? "info" : "warn"}">${esc(s)}</span>`;
  const dateBR = (d) =>
    d ? new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR") : "—";
  const noRows = (s, col = 5) =>
    `<tr><td colspan="${col}" class="empty">${esc(s)}</td></tr>`;
  function drawDashboard() {
    const sel = $("#dash-comp");
    if (sel)
      sel.innerHTML = `<option value="" ${!state.mes ? "selected" : ""}>Todo o período</option>${compOptions()
        .map(
          (m) =>
            `<option value="${m}" ${m === state.mes ? "selected" : ""}>${compLabel(m)}</option>`,
        )
        .join("")}`;
    const scopeRows = db.finance.filter(
      (record) => !state.empresa || record.sub === state.empresa,
    );
    const rows = financeFiltered();
    drawDashboardKpis(scopeRows);
    drawCashMovement(scopeRows);
    $("#dash-sum-month").textContent = `(${compLabel(state.mes)})`;
    $("#dash-summary").innerHTML = cashSummaryTable();
    const recent = [...rows]
      .sort((a, b) => String(b.data).localeCompare(String(a.data)))
      .slice(0, 6);
    $("#dash-fin-table").innerHTML =
      `<table class="recent-table"><thead><tr><th>Data</th><th>Empresa</th><th>Descrição</th><th>Tipo</th><th class="num">Valor (R$)</th><th>Status</th></tr></thead><tbody>${recent
        .map((r) => {
          const tp = finTipo(r),
            st = finStatus(r),
            v =
              tp === "Saída"
                ? money(r.saida)
                : money(r.previsto) || money(r.recebido);
          return `<tr data-edit-fin="${esc(r.id)}" title="Editar lançamento"><td>${dateBR(r.data)}</td><td><b>${esc(r.sub || "—")}</b></td><td>${esc(r.parceiro)}${r.centro ? `<div class="muted">${esc(r.centro)}</div>` : ""}</td><td><span class="tipo ${tp === "Saída" ? "desp" : "rec"}">${tp}</span></td><td class="amount">${n2(v)}</td><td>${finStatusHTML(r)}</td></tr>`;
        })
        .join(
          "",
        )}</tbody></table>${recent.length ? "" : `<div class="chart-empty sm">${icon("file")}<strong>Nenhum lançamento registrado.</strong><p>Clique em “Novo Lançamento” para começar.</p></div>`}`;
  }
  function drawFinance() {
    const direction = state.finSort === "asc" ? 1 : -1;
    const rows = [...financeFiltered()].sort((a, b) => {
      const byDate = String(a.data || "").localeCompare(String(b.data || ""));
      if (byDate) return byDate * direction;
      return String(a.id || "").localeCompare(String(b.id || "")) * direction;
    });
    metrics("#finance-metrics", rows);
    const pageSize = state.finPageSize || 5,
      pages = Math.max(1, Math.ceil(rows.length / pageSize));
    state.finPage = Math.min(Math.max(1, state.finPage || 1), pages);
    const shown = rows.slice(
      (state.finPage - 1) * pageSize,
      state.finPage * pageSize,
    );
    $("#finance-count").textContent = `Exibindo ${rows.length} registro(s)`;
    $("#fin-reconcile-banner").innerHTML = state.finReconcileIds
      ? `<div class="fin-reconcile-banner">${icon("info")}<span>Filtrando ${state.finReconcileIds.size} movimentação(ões) sem data efetiva que aguardam conciliação.</span><button type="button" id="fin-reconcile-clear">Limpar filtro</button></div>`
      : "";
    const costs = [
      ...new Set(db.finance.map((r) => r.centro).filter(Boolean)),
    ].sort();
    $("#filter-financeiro").innerHTML =
      `<div class="fin-filter-grid"><div class="field"><label>Período</label><select class="control" id="fin-period"><option value="" ${!state.mes ? "selected" : ""}>Todo o período</option>${compOptions()
        .map(
          (m) =>
            `<option value="${m}" ${m === state.mes ? "selected" : ""}>${compLabel(m)}</option>`,
        )
        .join(
          "",
        )}</select></div><div class="field"><label>Empresa</label><select class="control" id="fin-company"><option value="">Todas</option>${subdivisions.map((s) => `<option value="${esc(s)}" ${s === state.empresa ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></div><div class="field"><label>Tipo</label><select class="control" id="fin-type"><option value="">Todos</option>${["Receita", "Entrada por fora", "Saída"].map((s) => `<option value="${s}" ${state.finType === s ? "selected" : ""}>${s}</option>`).join("")}</select></div><div class="field"><label>Situação</label><select class="control" id="fin-status"><option value="">Todas</option>${["Concluído", "Em aberto", "Pendente", "Recebido", "Pago", "Valor excedente — revisar"].map((s) => `<option ${s === state.finStatus ? "selected" : ""}>${s}</option>`).join("")}</select></div><div class="field"><label>Centro de custo</label><select class="control" id="fin-cost"><option value="">Todos</option>${costs.map((s) => `<option value="${esc(s)}" ${s === state.finCost ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></div><div class="field fin-partner-field"><label>Parceiro / referência</label><div class="search-control"><svg><use href="#i-search"></use></svg><input id="fin-search" value="${esc(state.pesquisa)}" placeholder="Buscar parceiro ou referência..."></div></div><button type="button" class="btn primary fin-filter-btn" id="fin-apply"><svg><use href="#i-search"></use></svg>Filtrar</button><button type="button" class="btn fin-clear-btn" id="fin-clear"><svg><use href="#i-history"></use></svg>Limpar</button></div>`;
    const tableRows = shown
      .map((r) => {
        const tp = finTipo(r),
          st = finStatus(r),
          v =
            tp === "Saída"
              ? money(r.saida)
              : money(r.recebido) || money(r.previsto);
        return `<tr><td class="nowrap">${dateBR(r.data)}${r.dataRecebida ? `<small class="received-date">Recebida: ${dateBR(r.dataRecebida)}</small>` : ""}</td><td><b>${esc(r.sub || "—")}</b></td><td>${esc(r.parceiro || "—")}${r.observacao ? `<div class="muted">${esc(r.observacao)}</div>` : ""}</td><td>${esc(r.centro || "—")}</td><td class="description-cell">${esc(r.empresaDepositante || "—")}</td><td><span class="tipo ${tp === "Saída" ? "desp" : "rec"}">${icon(tp === "Saída" ? "arrow" : "down")}${tp}</span></td><td class="amount nowrap"><b>${n2(v)}</b></td><td>${finStatusHTML(r)}</td><td>${fileCell(r.anexos, "fin:" + r.id)}</td><td class="action-cell"><div class="row-actions">${(r.anexos || []).length ? `<button type="button" class="row-icon" data-view-files="fin:${esc(r.id)}" title="Visualizar">${icon("eye")}</button>` : ""}<button type="button" class="edit-action" data-edit-fin="${esc(r.id)}">${icon("edit")} Editar</button>${canDeleteRec(r) ? `<button type="button" class="edit-action danger" data-delete-fin="${esc(r.id)}">${icon("trash")} Excluir</button>` : ""}</div></td></tr>`;
      })
      .join("");
    $("#finance-table").innerHTML =
      state.finView === "detail"
        ? `<div class="fin-detail-list">${
            shown
              .map((r) => {
                const tp = finTipo(r),
                  st = finStatus(r),
                  v =
                    tp === "Saída"
                      ? money(r.saida)
                      : money(r.recebido) || money(r.previsto);
                return `<article><div><span>${dateBR(r.data)} · ${esc(r.sub || "—")}</span><h3>${esc(r.parceiro || "Lançamento financeiro")}</h3><p>${esc(r.centro || "Sem centro de custo")}${r.dataRecebida ? " · Recebida em " + dateBR(r.dataRecebida) : ""}${r.empresaDepositante ? " · Depositante: " + esc(r.empresaDepositante) : ""}${r.observacao ? " · " + esc(r.observacao) : ""}</p></div><div><span class="tipo ${tp === "Saída" ? "desp" : "rec"}">${tp}</span><strong>${fmt(v)}</strong>${finStatusHTML(r)}<button class="inline-btn" data-edit-fin="${esc(r.id)}">Editar</button>${canDeleteRec(r) ? `<button class="inline-btn danger" data-delete-fin="${esc(r.id)}">Excluir</button>` : ""}</div></article>`;
              })
              .join("") ||
            `<div class="fin-empty">Nenhum lançamento encontrado para os filtros selecionados.</div>`
          }</div>`
        : `<table class="fin-table"><thead><tr><th>Data</th><th>Empresa</th><th>Parceiro</th><th>Centro de Custo</th><th>Empresa depositante</th><th>Tipo</th><th class="num">Valor (R$)</th><th>Situação</th><th>Comprovante</th><th class="action-cell">Ações</th></tr></thead><tbody>${tableRows || noRows("Nenhum lançamento encontrado para os filtros selecionados.", 10)}</tbody></table>`;
    $("#finance-pager").innerHTML =
      `<span>Mostrando ${rows.length ? (state.finPage - 1) * pageSize + 1 : 0} a ${Math.min(state.finPage * pageSize, rows.length)} de ${rows.length} registros</span><div class="fin-page-buttons"><button type="button" id="fin-first" ${state.finPage === 1 ? "disabled" : ""}>«</button><button type="button" id="fin-prev" ${state.finPage === 1 ? "disabled" : ""}>‹</button><span>${state.finPage}</span><button type="button" id="fin-next" ${state.finPage === pages ? "disabled" : ""}>›</button><button type="button" id="fin-last" ${state.finPage === pages ? "disabled" : ""}>»</button></div>`;
    const bind = (id, key) => {
      $("#" + id).onchange = (e) => {
        state[key] = e.target.value;
        state.finPage = 1;
        render();
      };
    };
    bind("fin-period", "mes");
    bind("fin-company", "empresa");
    bind("fin-type", "finType");
    bind("fin-status", "finStatus");
    bind("fin-cost", "finCost");
    $("#fin-sort").value = state.finSort;
    $("#fin-sort").onchange = (e) => {
      state.finSort = e.target.value === "asc" ? "asc" : "desc";
      state.finPage = 1;
      drawFinance();
    };
    $("#fin-page-size").value = String(state.finPageSize);
    $("#fin-page-size").onchange = (e) => {
      state.finPageSize = Number(e.target.value) || 5;
      state.finPage = 1;
      drawFinance();
    };
    $("#fin-search").oninput = (e) => {
      state.pesquisa = e.target.value;
    };
    $("#fin-apply").onclick = () => {
      state.finPage = 1;
      render();
    };
    $("#fin-clear").onclick = () => {
      Object.assign(state, {
        finType: "",
        finStatus: "",
        finCost: "",
        pesquisa: "",
        empresa: "",
        finReconcileIds: null,
        finPage: 1,
      });
      render();
    };
    $("#fin-filter-toggle").onclick = () => {
      state.finFiltersOpen = !state.finFiltersOpen;
      $("#filter-financeiro").classList.toggle(
        "collapsed",
        !state.finFiltersOpen,
      );
      $("#fin-filter-toggle").setAttribute(
        "aria-expanded",
        String(state.finFiltersOpen),
      );
    };
    $("#filter-financeiro").classList.toggle(
      "collapsed",
      !state.finFiltersOpen,
    );
    $$("[data-fin-view]").forEach((b) => {
      b.classList.toggle("active", b.dataset.finView === state.finView);
      b.onclick = () => {
        state.finView = b.dataset.finView;
        drawFinance();
      };
    });
    $("#fin-first").onclick = () => {
      state.finPage = 1;
      drawFinance();
    };
    $("#fin-prev").onclick = () => {
      state.finPage--;
      drawFinance();
    };
    $("#fin-next").onclick = () => {
      state.finPage++;
      drawFinance();
    };
    $("#fin-last").onclick = () => {
      state.finPage = pages;
      drawFinance();
    };
  }
  function taskHoje() {
    return todayISO();
  }
  function taskDeadlineMeta(t, hoje) {
    if (!t.prazo) return { label: "Sem prazo definido", cls: "" };
    if (t.status === "Concluída") return { label: "Concluída", cls: "ok" };
    const d = daysBetween(hoje, t.prazo);
    if (d < 0) return { label: -d + " dia(s) em atraso", cls: "late" };
    if (d === 0) return { label: "Vence hoje", cls: "soon" };
    if (d <= 7) return { label: "Em " + d + " dia(s)", cls: "soon" };
    return { label: "Em " + d + " dias", cls: "" };
  }
  function taskQuickPass(t, hoje, qf) {
    if (!qf || qf === "all") return true;
    if (qf === "sem_anexo") return !(t.anexos && t.anexos.length);
    const late = t.status !== "Concluída" && t.prazo && t.prazo < hoje;
    const soon =
      t.status !== "Concluída" &&
      t.prazo &&
      t.prazo >= hoje &&
      daysBetween(hoje, t.prazo) <= 7;
    if (qf === "atrasada") return late;
    if (qf === "proximas") return soon;
    return true;
  }
  function taskInitials(nome) {
    const parts = String(nome || "")
      .split(" ")
      .filter(Boolean);
    if (!parts.length) return "?";
    return parts
      .slice(0, 2)
      .map(function (p) {
        return p[0];
      })
      .join("")
      .toUpperCase();
  }
  function kpiCardsHTML(rows, prefix) {
    const hoje = taskHoje();
    const total = rows.length;
    const totalAmount = rows.reduce(function (n, r) {
      return n + (Number(r.valor) || 0);
    }, 0);
    const paidAmount = rows
      .filter(function (r) {
        return r.status === "Concluída";
      })
      .reduce(function (n, r) {
        return n + (Number(r.valor) || 0);
      }, 0);
    const atrasadas = rows.filter(function (r) {
      return r.status !== "Concluída" && r.prazo && r.prazo < hoje;
    }).length;
    const proximas = rows.filter(function (r) {
      return (
        r.status !== "Concluída" &&
        r.prazo &&
        r.prazo >= hoje &&
        daysBetween(hoje, r.prazo) <= 7
      );
    }).length;
    const semAnexo = rows.filter(function (r) {
      return !(r.anexos && r.anexos.length);
    }).length;
    const qf = state[prefix + "QuickFilter"] || "all";
    function card(key, label, value, sub, tone) {
      return `<button type='button' class='kpi-card ${tone || ""} ${qf === key ? "active" : ""}' data-kpi='${prefix}:${key}'><span class='kpi-label'>${esc(label)}</span><span class='kpi-value'>${esc(String(value))}</span><span class='kpi-sub'>${esc(sub)}</span></button>`;
    }
    return (
      card("all", "Total de demandas", total, "ativas", "") +
      `<div class='kpi-card kpi-static'><span class='kpi-label'>Valores</span><span class='kpi-value'>${fmt(totalAmount)}</span><span class='kpi-sub'>${fmt(paidAmount)} concl.</span></div>` +
      card("atrasada", "Prazo vencido", atrasadas, "requer atenção", "danger") +
      card("proximas", "Próximos 7 dias", proximas, "a vencer", "warn") +
      card("sem_anexo", "Sem comprovante", semAnexo, "pendentes", "")
    );
  }
  function taskRowHTML(t, hoje) {
    const meta = taskDeadlineMeta(t, hoje);
    const rec = t.recorrente
      ? `<span class='rec-badge' title='Tarefa recorrente (repete todo mês)'>🔁 Mensal</span>`
      : "";
    return `<tr><td><div class='task-title-cell'><b>${esc(t.titulo)}</b>${rec}</div><div class='muted'>${esc(t.nome || "Favorecido não informado")}</div></td><td><div class='person-chip'><span class='avatar-sm'>${esc(taskInitials(t.responsavel))}</span>${esc(t.responsavel || "Sem responsável")}</div></td><td>${dateBR(t.prazo)}<div class='muted due-${meta.cls || "ok"}'>${esc(meta.label)}</div></td><td class='num'>${fmt(t.valor || 0)}</td><td>${statusPill(t.status)}</td><td>${fileCell(t.anexos, "task:" + t.id)}</td><td class='row-actions'><button class='edit-action' data-edit-task='${esc(t.id)}'>${icon("list")} Editar</button>${canDeleteRec(t) ? deleteBtn("task", t.id) : ""}</td></tr>`;
  }
  function renderTaskFilters() {
    const respList = [
      ...new Set([
        ...(db.staff || []),
        ...db.tasks
          .map(function (t) {
            return t.responsavel;
          })
          .filter(Boolean),
      ]),
    ].sort(function (a, b) {
      return a.localeCompare(b, "pt-BR");
    });
    function html(prefix) {
      const statusOpts = ["Pendente", "Em andamento", "Concluída"]
        .map(function (s) {
          return `<option value="${s}" ${state.taskStatus === s ? "selected" : ""}>${s}</option>`;
        })
        .join("");
      const respOpts = respList
        .map(function (n) {
          return `<option value="${esc(n)}" ${state.taskResponsavel === n ? "selected" : ""}>${esc(n)}</option>`;
        })
        .join("");
      return (
        `<div class="field"><label for="${prefix}-status">Situação</label><select class="control" id="${prefix}-status"><option value="">Todas</option>${statusOpts}</select></div>` +
        `<div class="field"><label for="${prefix}-search">Pesquisar</label><input class="control" id="${prefix}-search" value="${esc(state.taskQuery || "")}" placeholder="Tarefa, favorecido ou responsável"></div>` +
        `<div class="field"><label for="${prefix}-responsavel">Responsável</label><select class="control" id="${prefix}-responsavel"><option value="">Todos</option>${respOpts}</select></div>` +
        `<div class="field" style="align-self:flex-end"><button type="button" class="btn" id="${prefix}-clear">Limpar</button></div>`
      );
    }
    function wire(prefix) {
      const st = $("#" + prefix + "-status");
      if (st)
        st.onchange = function (e) {
          state.taskStatus = e.target.value;
          drawTasks();
        };
      const sr = $("#" + prefix + "-search");
      if (sr)
        sr.oninput = function (e) {
          state.taskQuery = e.target.value;
          drawTasks();
        };
      const rs = $("#" + prefix + "-responsavel");
      if (rs)
        rs.onchange = function (e) {
          state.taskResponsavel = e.target.value;
          drawTasks();
        };
      const cl = $("#" + prefix + "-clear");
      if (cl)
        cl.onclick = function () {
          state.taskStatus = "";
          state.taskQuery = "";
          state.taskResponsavel = "";
          state.taskQuickFilter = "all";
          state.myQuickFilter = "all";
          drawTasks();
        };
    }
    const a = $("#task-filters");
    if (a) {
      a.innerHTML = html("tf");
      wire("tf");
    }
    const b = $("#my-task-filters");
    if (b) {
      b.innerHTML = html("mtf");
      wire("mtf");
    }
  }
  function minhasBaseFiltered() {
    const myName = String(MB.nome || "")
      .trim()
      .toLowerCase();
    return db.tasks.filter(function (t) {
      if (!myName) return false;
      if (
        String(t.responsavel || "")
          .trim()
          .toLowerCase() !== myName
      )
        return false;
      if (state.taskStatus && t.status !== state.taskStatus) return false;
      if (state.taskMonth && month(t.prazo) !== state.taskMonth) return false;
      if (state.taskResponsavel && t.responsavel !== state.taskResponsavel)
        return false;
      if (state.taskQuery) {
        const q = state.taskQuery.toLowerCase();
        const hay = [t.titulo, t.nome, t.responsavel, t.origemPagamento, t.sub]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }
  function drawTasks() {
    const hoje = taskHoje();
    const baseAll = taskFiltered();
    $("#task-kpis").innerHTML = kpiCardsHTML(baseAll, "task");
    const qfAll = state.taskQuickFilter || "all";
    const rows = baseAll.filter(function (t) {
      return taskQuickPass(t, hoje, qfAll);
    });
    $("#task-count").textContent =
      rows.length + " registro" + (rows.length === 1 ? "" : "s");
    $("#task-table").innerHTML =
      `<table><thead><tr><th>Tarefa / Favorecido</th><th>Responsável</th><th>Prazo</th><th>Valor</th><th>Situação</th><th>Anexos</th><th></th></tr></thead><tbody>${
        rows
          .map(function (t) {
            return taskRowHTML(t, hoje);
          })
          .join("") ||
        noRows(
          "Nenhuma tarefa encontrada. Ajuste os filtros ou cadastre uma nova demanda em “Nova tarefa”.",
          7,
        )
      }</tbody></table>`;
    const minhasBase = minhasBaseFiltered();
    $("#my-task-kpis").innerHTML = kpiCardsHTML(minhasBase, "my");
    const qfMy = state.myQuickFilter || "all";
    const myRows = minhasBase
      .filter(function (t) {
        return taskQuickPass(t, hoje, qfMy);
      })
      .sort(function (a, b) {
        const la =
          a.status !== "Concluída" && a.prazo && a.prazo < hoje ? 0 : 1;
        const lb =
          b.status !== "Concluída" && b.prazo && b.prazo < hoje ? 0 : 1;
        if (la !== lb) return la - lb;
        return String(a.prazo || "9999-12-31").localeCompare(
          String(b.prazo || "9999-12-31"),
        );
      });
    const myCount = $("#my-task-count");
    if (myCount)
      myCount.textContent =
        myRows.length + " registro" + (myRows.length === 1 ? "" : "s");
    $("#my-task-table").innerHTML =
      `<table><thead><tr><th>Tarefa / Favorecido</th><th>Responsável</th><th>Prazo</th><th>Valor</th><th>Situação</th><th>Anexos</th><th></th></tr></thead><tbody>${
        myRows
          .map(function (t) {
            return taskRowHTML(t, hoje);
          })
          .join("") ||
        noRows(
          "Nenhuma tarefa atribuída a " +
            esc(MB.nome || "você") +
            " com os filtros atuais.",
          7,
        )
      }</tbody></table>`;
    const sub = $("#minhas-subtitle");
    if (sub)
      sub.textContent =
        "Atividades atribuídas a " +
        (MB.nome || "você") +
        ", ordenadas por prioridade e prazo.";
    document
      .querySelectorAll(".view-toggle button[data-page]")
      .forEach(function (btn) {
        const isActive = btn.dataset.page === page;
        btn.classList.toggle("active", isActive);
        btn.setAttribute("aria-selected", String(isActive));
      });
    renderTaskFilters();
  }
  function drawHistory() {
    const all = [
      ...monthlyHistory.map((r) => ({
        ...r,
        ...(db.historyEdits[r.id] || {}),
      })),
      ...db.tasks
        .filter((t) => t.dataExecucao && t.valor)
        .map((t) => ({
          id: t.id,
          mes: month(t.dataExecucao),
          aba: "CADASTRO NO SISTEMA",
          nome: t.nome || "",
          descricao: t.titulo,
          data: t.dataExecucao,
          valor: t.valor,
          banco: t.origemPagamento || "",
          extrato: t.nomeExtrato || "",
          situacao: t.situacaoRegistro || "",
          observacao: t.observacao || "",
          anexos: t.anexos || [],
          tipo: "task",
        })),
    ];
    const unique = (key) =>
      [...new Set(all.map((r) => r[key]).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, "pt-BR"),
      );
    const selectedMonth = state.histMonth || "";
    const active = all
      .filter(
        (r) =>
          (!selectedMonth || r.mes === selectedMonth) &&
          (!state.historyBank || r.banco === state.historyBank) &&
          (!state.histStatus || r.situacao === state.histStatus) &&
          (!state.histFrom || r.data >= state.histFrom) &&
          (!state.histTo || r.data <= state.histTo) &&
          (!state.histFiles ||
            (state.histFiles === "com"
              ? (r.anexos || []).length > 0
              : !(r.anexos || []).length)) &&
          (!state.historyQuery ||
            [r.nome, r.descricao, r.banco, r.extrato, r.situacao, r.observacao]
              .join(" ")
              .toLocaleLowerCase("pt-BR")
              .includes(state.historyQuery.toLocaleLowerCase("pt-BR"))),
      )
      .sort(
        (a, b) =>
          b.data.localeCompare(a.data) ||
          String(b.id).localeCompare(String(a.id)),
      );
    const months = [...new Set(all.map((r) => r.mes))].sort();
    const monthOpts = months
      .map(
        (m) =>
          `<option value="${esc(m)}" ${selectedMonth === m ? "selected" : ""}>${new Date(m + "-15T12:00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</option>`,
      )
      .join("");
    $("#history-filters").innerHTML =
      `<div class="field"><label>Mês da planilha</label><select class="control" id="hist-month"><option value="">Todos os meses</option>${monthOpts}</select></div>${selectField("Banco / origem", "hist-bank", unique("banco"), state.historyBank)}${selectField("Situação original", "hist-status", unique("situacao"), state.histStatus)}<div class="field"><label>Comprovantes</label><select class="control" id="hist-files"><option value="">Todos</option><option value="com" ${state.histFiles === "com" ? "selected" : ""}>Com comprovante</option><option value="sem" ${state.histFiles === "sem" ? "selected" : ""}>Sem comprovante</option></select></div><div class="field"><label>Data inicial</label><input type="date" class="control" id="hist-from" value="${esc(state.histFrom || "")}"></div><div class="field"><label>Data final</label><input type="date" class="control" id="hist-to" value="${esc(state.histTo || "")}"></div><div class="field history-search"><label>Pesquisar nome, descrição ou extrato</label><input type="search" class="control" id="hist-query" value="${esc(state.historyQuery)}" placeholder="Ex.: abastecimento, energia, pessoa..."></div><div class="field"><label>&nbsp;</label><button class="btn" id="hist-clear" type="button">Limpar filtros</button></div>`;
    const link = (id, key, fn = "onchange") => {
      $("#" + id)[fn] = (e) => {
        state[key] = e.target.value;
        state.histPage = 1;
        drawHistory();
      };
    };
    link("hist-month", "histMonth");
    link("hist-bank", "historyBank");
    link("hist-status", "histStatus");
    link("hist-from", "histFrom");
    link("hist-to", "histTo");
    link("hist-files", "histFiles");
    link("hist-query", "historyQuery", "onchange");
    $("#hist-clear").onclick = () => {
      Object.assign(state, {
        histMonth: "",
        historyBank: "",
        histStatus: "",
        historyQuery: "",
        histFrom: "",
        histTo: "",
        histFiles: "",
        histPage: 1,
      });
      drawHistory();
    };
    const total = active.reduce((n, r) => n + r.valor, 0);
    const pageSize = 25,
      pages = Math.max(1, Math.ceil(active.length / pageSize));
    state.histPage = Math.min(state.histPage || 1, pages);
    const shown = active.slice(
      (state.histPage - 1) * pageSize,
      state.histPage * pageSize,
    );
    $("#history-summary").innerHTML =
      `<div class="hsummary"><span>Registros encontrados</span><strong>${active.length.toLocaleString("pt-BR")}</strong></div><div class="hsummary"><span>Valor dos registros filtrados</span><strong>${fmt(total)}</strong></div><div class="hsummary"><span>Período selecionado</span><strong>${selectedMonth ? new Date(selectedMonth + "-15T12:00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) : "Todos"}</strong></div>`;
    $("#history-count").textContent =
      `${active.length} registros · página ${state.histPage}/${pages}`;
    $("#history-table").innerHTML =
      `<table class="ledger-table"><thead><tr><th>Data</th><th>Nome</th><th>Descrição</th><th>Valor</th><th>Banco / origem</th><th>Nome no extrato</th><th>Situação</th><th>Observação</th><th>Comprovantes</th><th>Origem</th><th class="action-cell">Ações</th></tr></thead><tbody>${shown.map((r) => `<tr><td class="nowrap">${dateBR(r.data)}</td><td>${esc(r.nome || "—")}</td><td class="description-cell">${esc(r.descricao || "—")}</td><td class="amount nowrap">${fmt(r.valor)}</td><td>${esc(r.banco || "—")}</td><td>${esc(r.extrato || "—")}</td><td>${r.situacao ? `<span class="ledger-status">${esc(r.situacao)}</span>` : "—"}</td><td>${esc(r.observacao || "—")}</td><td>${fileCell(r.anexos, (r.tipo === "task" ? "task:" : "history:") + r.id)}</td><td class="muted">${r.tipo === "task" ? '<button class="inline-btn" data-edit-task="' + esc(r.id) + '">Abrir</button>' : esc(r.aba)}</td><td class="action-cell"><button class="edit-action" ${r.tipo === "task" ? "data-edit-task" : "data-edit-history"}="${esc(r.id)}">${icon("edit")}Editar</button></td></tr>`).join("") || noRows("Nenhum registro encontrado para estes filtros.", 11)}</tbody></table>`;
    $("#history-pager").innerHTML =
      `<span>Exibindo ${active.length ? (state.histPage - 1) * pageSize + 1 : 0}–${Math.min(state.histPage * pageSize, active.length)} de ${active.length}</span><div class="actions"><button class="btn" id="hist-prev" ${state.histPage === 1 ? "disabled" : ""}>Anterior</button><button class="btn" id="hist-next" ${state.histPage === pages ? "disabled" : ""}>Próxima</button></div>`;
    $("#hist-prev").onclick = () => {
      state.histPage--;
      drawHistory();
    };
    $("#hist-next").onclick = () => {
      state.histPage++;
      drawHistory();
    };
  }
  function drawFinancialHistory() {
    const companies = [...subdivisions];
    const rows = db.finance
      .filter(
        (r) =>
          (!state.finHistMonth || month(r.data) === state.finHistMonth) &&
          (!state.finHistCompany || r.sub === state.finHistCompany) &&
          (!state.finHistCost || r.centro === state.finHistCost) &&
          (!state.finHistSearch ||
            [r.parceiro, r.centro, r.sub, r.origem]
              .join(" ")
              .toLocaleLowerCase("pt-BR")
              .includes(state.finHistSearch.toLocaleLowerCase("pt-BR"))),
      )
      .sort((a, b) => b.data.localeCompare(a.data));
    const f = $("#fin-history-filters");
    f.innerHTML = `<div class="field"><label>Mês</label><input type="month" class="control" id="fh-month" value="${esc(state.finHistMonth)}"></div><div class="field"><label>Empresa</label><select class="control" id="fh-company"><option value="">Todas</option>${companies.map((c) => `<option value="${esc(c)}" ${c === state.finHistCompany ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></div>${selectField("Centro de custo", "fh-cost", COST_CODES, state.finHistCost)}<div class="field history-search"><label>Pesquisar parceiro</label><input class="control" type="search" id="fh-search" value="${esc(state.finHistSearch)}" placeholder="Parceiro ou centro de custo"></div><div class="field"><label>&nbsp;</label><button class="btn" id="fh-clear">Limpar filtros</button></div>`;
    for (const [id, key] of [
      ["fh-month", "finHistMonth"],
      ["fh-company", "finHistCompany"],
      ["fh-cost", "finHistCost"],
      ["fh-search", "finHistSearch"],
    ])
      $("#" + id).onchange = (e) => {
        state[key] = e.target.value;
        state.finHistPage = 1;
        drawFinancialHistory();
      };
    $("#fh-clear").onclick = () => {
      Object.assign(state, {
        finHistMonth: "",
        finHistCompany: "",
        finHistCost: "",
        finHistSearch: "",
        finHistPage: 1,
      });
      drawFinancialHistory();
    };
    const t = totals(rows);
    $("#fin-history-summary").innerHTML =
      `<div class="hsummary"><span>Registros</span><strong>${rows.length}</strong></div><div class="hsummary"><span>A receber</span><strong>${fmt(t.prev)}</strong></div><div class="hsummary"><span>Recebido</span><strong>${fmt(t.rec)}</strong></div><div class="hsummary"><span>Saídas</span><strong>${fmt(t.sai)}</strong></div>`;
    const size = 25,
      pages = Math.max(1, Math.ceil(rows.length / size));
    state.finHistPage = Math.min(state.finHistPage, pages);
    const shown = rows.slice(
      (state.finHistPage - 1) * size,
      state.finHistPage * size,
    );
    $("#fin-history-count").textContent = `${rows.length} registro(s)`;
    $("#fin-history-table").innerHTML =
      `<table class="ledger-table"><thead><tr><th>Data</th><th>Empresa / referência</th><th>Parceiro</th><th>Centro de custo</th><th>A receber</th><th>Recebido</th><th>Saída</th><th>Situação</th><th>Anexos</th><th class="action-cell">Ações</th></tr></thead><tbody>${
        shown
          .map((r) => {
            const st = finStatus(r);
            return `<tr><td>${dateBR(r.data)}</td><td>${esc(r.sub || "Não identificada")}</td><td>${esc(r.parceiro)}</td><td>${esc(r.centro)}</td><td class="amount">${fmt(r.previsto)}</td><td class="amount">${fmt(r.recebido)}</td><td class="amount">${fmt(r.saida)}</td><td>${finStatusHTML(r)}</td><td>${fileCell(r.anexos, "fin:" + r.id)}</td><td class="action-cell"><div class="row-actions"><button class="edit-action" data-edit-fin="${esc(r.id)}">${icon("edit")} Editar</button>${canDeleteRec(r) ? `<button class="edit-action danger" type="button" data-delete-fin="${esc(r.id)}">${icon("trash")} Excluir</button>` : ""}</div></td></tr>`;
          })
          .join("") || noRows("Nenhum lançamento financeiro encontrado.", 10)
      }</tbody></table>`;
    $("#fin-history-pager").innerHTML =
      `<span>Página ${state.finHistPage} de ${pages}</span><div class="actions"><button class="btn" id="fh-prev" ${state.finHistPage === 1 ? "disabled" : ""}>Anterior</button><button class="btn" id="fh-next" ${state.finHistPage === pages ? "disabled" : ""}>Próxima</button></div>`;
    $("#fh-prev").onclick = () => {
      state.finHistPage--;
      drawFinancialHistory();
    };
    $("#fh-next").onclick = () => {
      state.finHistPage++;
      drawFinancialHistory();
    };
  }
  function drawTaskHistory() {
    const rows = [...taskFiltered()].reverse();
    $("#tasks-history-filters").innerHTML =
      `<div class="field"><label>Mês do prazo</label><input class="control" type="month" id="th-month" value="${state.taskMonth}"></div><div class="field"><label>Situação</label><select id="th-status" class="control"><option value="">Todas</option>${["Pendente", "Em andamento", "Concluída"].map((x) => `<option ${state.taskStatus === x ? "selected" : ""}>${x}</option>`).join("")}</select></div><div class="field"><label>Pesquisar</label><input id="th-query" class="control" placeholder="Tarefa, responsável, origem" value="${esc(state.taskQuery)}"></div>`;
    $("#th-month").onchange = (e) => {
      state.taskMonth = e.target.value;
      drawTaskHistory();
    };
    $("#th-status").onchange = (e) => {
      state.taskStatus = e.target.value;
      render();
    };
    $("#th-query").onchange = (e) => {
      state.taskQuery = e.target.value;
      drawTaskHistory();
    };
    $("#tasks-history-table").innerHTML =
      `<table><thead><tr><th>Tarefa</th><th>Nome</th><th>Responsável</th><th>Origem de pagamento</th><th>Prazo</th><th>Situação</th><th>Anexos</th><th></th></tr></thead><tbody>${rows.map((t) => `<tr><td><b>${esc(t.titulo)}</b></td><td>${esc(t.nome || "—")}</td><td>${esc(t.responsavel)}</td><td>${esc(t.origemPagamento || "—")}</td><td>${dateBR(t.prazo)}</td><td>${statusPill(t.status)}</td><td>${fileCell(t.anexos, "task:" + t.id)}</td><td><button class="edit-action" data-edit-task="${esc(t.id)}">${icon("list")} Editar</button></td></tr>`).join("") || noRows("Sem tarefas registradas.", 8)}</tbody></table>`;
  }
  function drawAnexos() {
    const all = [
      ...db.finance.map((r) => ({
        ref: "fin:" + r.id,
        kind: "Financeiro",
        title: `${r.parceiro} · ${r.centro}`,
        date: r.data,
        files: r.anexos || [],
      })),
      ...db.tasks.map((t) => ({
        ref: "task:" + t.id,
        kind: "Tarefa",
        title: t.titulo,
        date: t.dataExecucao || t.prazo,
        files: t.anexos || [],
      })),
      ...Object.entries(db.historyEdits)
        .filter(([, v]) => v && v.anexos && v.anexos.length)
        .map(([id, v]) => {
          const b = monthlyHistory.find((x) => x.id === id) || {};
          return {
            ref: "history:" + id,
            kind: "Prestação de contas",
            title: v.nome || b.nome || v.descricao || b.descricao,
            date: v.data || b.data,
            files: v.anexos,
          };
        }),
    ].flatMap((e) => e.files.map((f, i) => ({ ...e, f, i })));
    $("#attachment-list").innerHTML = all.length
      ? `<table><thead><tr><th>Arquivo</th><th>Origem</th><th>Registro</th><th>Data</th><th>Tamanho</th><th class="action-cell">Ações</th></tr></thead><tbody>${all.map((x) => `<tr><td><span class="file-name">${icon(ficon(x.f))}${esc(x.f.name)}</span></td><td><span class="pill ${x.kind === "Financeiro" ? "ok" : x.kind === "Tarefa" ? "info" : ""}">${x.kind}</span></td><td>${esc(x.title || "—")}</td><td>${dateBR(x.date)}</td><td class="muted">${fsize(x.f.size)}</td><td class="action-cell"><button class="edit-action" data-view-files="${esc(x.ref)}" data-file-index="${x.i}">${icon("eye")}Visualizar</button></td></tr>`).join("")}</tbody></table>`
      : `<div class="empty">${icon("clip")}<strong>Nenhum comprovante anexado</strong><p>Anexe fotos ou PDFs ao editar um lançamento, uma tarefa ou um registro da prestação de contas.</p></div>`;
  }
  function drawAudit() {
    const rows = [...db.audit].sort((a, b) =>
      String(b.at || "").localeCompare(String(a.at || "")),
    );
    const pageSize = 10;
    const pages = Math.max(1, Math.ceil(rows.length / pageSize));
    state.auditPage = Math.min(Math.max(1, state.auditPage || 1), pages);
    const shown = rows.slice(
      (state.auditPage - 1) * pageSize,
      state.auditPage * pageSize,
    );
    $("#audit-table").innerHTML = rows.length
      ? `<table><thead><tr><th>Data</th><th>Responsável</th><th>Ação</th><th>Detalhe</th></tr></thead><tbody>${shown.map((a) => `<tr><td class="nowrap">${new Date(a.at).toLocaleString("pt-BR")}</td><td>${esc(a.actor)}</td><td>${esc(a.action)}</td><td class="kebab">${esc(a.detail)}</td></tr>`).join("")}</tbody></table>`
      : `<div class="empty">${icon("history")}<strong>Nenhuma alteração registrada</strong><p>As ações feitas nesta versão aparecerão aqui.</p></div>`;
    const pager = $("#audit-pager");
    if (!pager) return;
    pager.hidden = !rows.length;
    if (!rows.length) {
      pager.innerHTML = "";
      return;
    }
    const first = (state.auditPage - 1) * pageSize + 1;
    const last = Math.min(state.auditPage * pageSize, rows.length);
    pager.innerHTML = `<span>Mostrando ${first} a ${last} de ${rows.length} registros · Página ${state.auditPage} de ${pages}</span><div class="fin-page-buttons"><button type="button" id="audit-first" title="Primeira página" ${state.auditPage === 1 ? "disabled" : ""}>«</button><button type="button" id="audit-prev" title="Página anterior" ${state.auditPage === 1 ? "disabled" : ""}>‹</button><span>${state.auditPage}</span><button type="button" id="audit-next" title="Próxima página" ${state.auditPage === pages ? "disabled" : ""}>›</button><button type="button" id="audit-last" title="Última página" ${state.auditPage === pages ? "disabled" : ""}>»</button></div>`;
    $("#audit-first").onclick = () => {
      state.auditPage = 1;
      drawAudit();
    };
    $("#audit-prev").onclick = () => {
      state.auditPage = Math.max(1, state.auditPage - 1);
      drawAudit();
    };
    $("#audit-next").onclick = () => {
      state.auditPage = Math.min(pages, state.auditPage + 1);
      drawAudit();
    };
    $("#audit-last").onclick = () => {
      state.auditPage = pages;
      drawAudit();
    };
  }
  function companyPicker(where) {
    $(where).innerHTML =
      `<div class="ctx-companies" aria-label="Empresa"><button type="button" class="co ${!state.empresa ? "selected" : ""}" data-select-company="">Todas as Empresas</button>${subdivisions.map((n) => `<button type="button" class="co ${state.empresa === n ? "selected" : ""}" data-select-company="${esc(n)}">${esc(n)}</button>`).join("")}</div>`;
  }
  function costChart(rows) {
    const groups = [
      ...new Set(rows.map((r) => r.centro || "Sem centro")),
    ].sort();
    $("#cost-center-section").innerHTML = rows.length
      ? `<div class="panel panel-pad"><div class="section-head"><div><h2>Recebimentos por centro de custo</h2><div class="sub">Comparativo do período e da seleção atual</div></div></div><div class="cost-chart">${groups
          .map((c) => {
            let rr = rows.filter((r) => (r.centro || "Sem centro") === c);
            let a = totals(rr);
            let maximum = Math.max(
              ...groups.map(
                (g) =>
                  totals(rows.filter((r) => (r.centro || "Sem centro") === g))
                    .prev,
              ),
              1,
            );
            return `<div class="chart-row"><b>${esc(c)}</b><div class="chart-bars"><div class="bar-background"><span class="bar-planned" style="width:${((a.prev / maximum) * 100).toFixed(2)}%"></span><span class="bar-paid" style="width:${((a.rec / maximum) * 100).toFixed(2)}%"></span></div></div><div class="chart-values"><strong>${fmt(a.rec)}</strong><small>de ${fmt(a.prev)}</small></div></div>`;
          })
          .join(
            "",
          )}</div><div class="chart-legend"><i></i> A receber <i class="paid"></i> Recebido</div></div>`
      : `<div class="panel panel-pad simple-empty"><h2>Recebimentos por centro de custo</h2><p>Sem lançamentos no período para a seleção atual.</p></div>`;
  }
  function render() {
    companyTiles("#company-picker-dashboard");
    companyPicker("#company-picker-financeiro");
    drawDashboard();
    costChart(financeFiltered());
    drawEmpresas();
    drawReceber();
    drawPagar();
    drawDeadlines();
    drawSpend();
    drawFinance();
    drawTasks();
    drawFinancialHistory();
    drawHistory();
    drawTaskHistory();
    drawAnexos();
    drawAudit();
    drawSettings();
    renderTaskFilters();
    updateCounts();
    updateBell();
  }
  function goto(p) {
    page = p;
    $$(".page-section").forEach((e) =>
      e.classList.toggle("active", e.id === "page-" + p),
    );
    $$("[data-page]").forEach((e) =>
      e.classList.toggle("active", e.dataset.page === p),
    );
    $("#crumb").textContent = names[p];
    document.title = names[p] + " · Financeiro";
    document.body.classList.remove("nav-open");
    const gb = document.querySelector('.nav-btn[data-page="' + p + '"]');
    $("#crumb-group").textContent = gb ? gb.dataset.group : "";
    window.scrollTo({ top: 0, behavior: "smooth" });
    render();
  }
  const field = (label, name, value = "", type = "text", required = false) =>
    `<div class="field ${name === "descricao" ? "wide" : ""}"><label>${label}</label><input class="control" name="${name}" type="${type}" value="${esc(value)}" ${required ? "required" : ""}></div>`;
  function editHistoryRecord(id) {
    const record = monthlyHistory.find((r) => r.id === id);
    if (!record) {
      toast("Registro não encontrado");
      return;
    }
    const r = { ...record, ...(db.historyEdits[id] || {}) };
    typeModal = "history";
    editing = id;
    removedAttachments = new Set();
    $("#modal-title").textContent = "Editar registro da planilha";
    $("#modal-body").innerHTML =
      `<p class="field-note wide">Registro original ${esc(r.aba)} · linha ${r.linha}. A edição fica registrada localmente, sem alterar o arquivo Excel.</p>${["nome", "descricao", "banco", "extrato", "situacao", "observacao"].map((k) => field({ nome: "Nome", descricao: "Descrição / tarefa", banco: "Banco / origem", extrato: "Nome no extrato", situacao: "Situação original", observacao: "Observação" }[k], k, r[k] || "")).join("")}${field("Data", "data", r.data || "", "date")}<div class="field"><label>Valor (R$)</label><input class="control money-input" inputmode="numeric" name="valor" value="${inputBRL(r.valor || 0)}"></div>${anexoField(r.anexos)}`;
    $$(".money-input").forEach((el) =>
      el.addEventListener("input", () => maskBRL(el)),
    );
    $("#modal-layer").classList.add("open");
  }
  function openModal(kind, id = null) {
    typeModal = kind;
    editing = id;
    removedAttachments = new Set();
    const obj = id
      ? (kind === "task" ? db.tasks : db.finance).find((x) => x.id === id)
      : null;
    $("#modal-title").textContent =
      (id ? "Editar " : "Novo ") +
      (kind === "task" ? "tarefa" : "lançamento financeiro");
    let html = "";
    if (kind === "task") {
      html += `<div class="form-section">Atividade</div><div class="field"><label>Modelo de tarefa</label><select class="control" id="task-template"><option value="">Tarefa livre</option>${db.templates.map((x) => `<option>${esc(x)}</option>`).join("")}</select></div>`;
      html += field(
        "Título da tarefa *",
        "titulo",
        obj?.titulo || "",
        "text",
        true,
      );
      html += field(
        "Nome (favorecido / identificação)",
        "nome",
        obj?.nome || "",
      );
      html += (() => {
        const respOpts = [
          ...new Set([
            ...(obj && obj.responsavel ? [obj.responsavel] : []),
            ...db.staff,
          ]),
        ];
        return `<div class='field'><label>Responsável *</label><select class='control' name='responsavel' required><option value=''>Selecione</option>${respOpts.map((n) => `<option value='${esc(n)}' ${obj && obj.responsavel === n ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></div>`;
      })();
      html += `<div class="field"><label style="display:flex;align-items:center;gap:.4rem;cursor:pointer"><input type="checkbox" name="recorrente" value="on" ${obj?.recorrente ? "checked" : ""}> Tarefa recorrente (repete todo mês)</label></div>`;
      html += `<div class="form-section">Pagamento e prestação de contas</div><div class="field"><label>Origem do pagamento (opcional)</label><select class="control" name="origemPagamento"><option value="">Não informada</option>${db.banks.map((x) => `<option ${obj?.origemPagamento === x ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></div>`;
      html += field("Prazo", "prazo", obj?.prazo || "", "date");
      html += field(
        "Data do lançamento / execução",
        "dataExecucao",
        obj?.dataExecucao || "",
        "date",
      );
      html += `<div class="field"><label>Valor (R$)</label><input class="control money-input" name="valor" inputmode="numeric" value="${inputBRL(obj?.valor || 0)}"></div>`;
      html += field("Nome no extrato", "nomeExtrato", obj?.nomeExtrato || "");
      html += field(
        "Situação na prestação de contas",
        "situacaoRegistro",
        obj?.situacaoRegistro || "",
      );
      html += field(
        "Observação da prestação",
        "observacao",
        obj?.observacao || "",
      );
      html += `<div class="form-section">Andamento</div><div class="field"><label>Situação</label><select class="control" name="status">${["Pendente", "Em andamento", "Concluída"].map((s) => `<option ${obj?.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>`;
      html += `<div class="field wide"><label>Observações</label><textarea class="control" name="descricao">${esc(obj?.descricao || "")}</textarea></div>`;
    } else {
      const locked = !!obj;
      const selectedType = locked ? finKind(obj) : "receita";
      const rx = locked ? finRecebimentos(obj) : [];
      const finValue = (name, value, types) =>
        `<div class="field" data-fin-types="${types}"><label>${name} (R$)</label><input class="control money-input" type="text" inputmode="numeric" autocomplete="off" name="${value}" value="${inputBRL(locked ? (value === "recebido" ? sumRecebimentos(rx) || obj.recebido || 0 : obj[value] || 0) : 0)}" placeholder="R$ 0,00"></div>`;
      if (locked) {
        window.__finHist = { obj: obj, key: "data", dir: "asc" };
        html += `<div class="fin-modal-tabs" role="tablist" aria-label="Seções do lançamento"><button type="button" class="active" data-fin-tab="dados" role="tab">Lançamento</button><button type="button" data-fin-tab="historico" data-fin-history-tab role="tab">Histórico</button></div>`;
        html += `<div data-fin-pane="dados" id="fin-dados-pane">`;
      }
      html += `<div class="field wide fin-type-field"><label>Tipo de lançamento *</label><select class="control" name="tipoLancamento" id="fin-entry-type" required><option value="receita" ${selectedType === "receita" ? "selected" : ""}>Receita</option><option value="entrada_por_fora" ${selectedType === "entrada_por_fora" ? "selected" : ""}>Entrada por fora</option><option value="saida" ${selectedType === "saida" ? "selected" : ""}>Saída</option></select><small class="fin-type-help" id="fin-type-help"></small></div>`;
      html += `<div class="form-section">Identificação</div>`;
      html += `<div class="field"><label>Empresa *</label><select class="control" name="sub" required><option value="">Selecione</option>${subdivisions.map((s) => `<option value="${esc(s)}" ${(locked ? obj.sub : state.empresa) === s ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></div>`;
      html += `<div class="field"><label id="fin-partner-label">Parceiro *</label><input class="control" name="parceiro" type="text" value="${esc(obj?.parceiro || "")}" required></div>`;
      html += `<div class="field" data-fin-center><label>Centro de custo <span id="fin-center-required">*</span></label><select class="control" name="centro"><option value="">Não informado</option>${COST_CODES.map((code) => `<option value="${code}" ${(obj?.centro || "") === code ? "selected" : ""}>${code}${db.centers[code] ? " — " + esc(db.centers[code]) : ""}</option>`).join("")}</select></div>`;
      html += field("Data *", "data", obj?.data || todayISO(), "date", true);
      html += `<div class="field" data-fin-types="receita entrada_por_fora"><label>Data recebida</label><input class="control" name="dataRecebida" type="date" value="${esc(obj?.dataRecebida || "")}"></div>`;
      html += `<div class="field" data-fin-types="receita entrada_por_fora"><label>Empresa que depositou o pagamento</label><input class="control" name="empresaDepositante" value="${esc(obj?.empresaDepositante || "")}"></div>`;
      html += `<div class="form-section">Valores</div>`;
      html += finValue("A receber", "previsto", "receita");
      html += finValue("Recebido", "recebido", "receita entrada_por_fora");
      html += finValue("Saída", "saida", "saida");
      html += `<div class="field wide"><label>Observação</label><textarea class="control" name="observacao" placeholder="Informações adicionais do lançamento">${esc(obj?.observacao || "")}</textarea></div>`;
      if (locked) {
        html += `<div data-fin-types="receita" class="fin-receipt-register"><div class="form-section">Registrar recebimento</div><p class="field-note wide">Informe a data e o valor recebido. O status muda para <b>Concluído</b> quando o total recebido atingir o valor a receber. O detalhe fica na aba <b>Histórico</b>.</p><div class="field"><label>Data do recebimento</label><input class="control" name="novaBaixaData" type="date" value="${esc(todayISO())}"></div><div class="field"><label>Valor recebido (R$)</label><input class="control money-input" name="novaBaixaValor" inputmode="numeric" value="${inputBRL(0)}" placeholder="R$ 0,00"></div></div>`;
        html += `</div>`;
        html += `<div data-fin-pane="historico" id="fin-hist-pane" class="hidden">${rxSheetHTML(obj, "data", "asc")}</div>`;
      }
    }
    html += `<div class="form-section">Comprovantes</div><div class="field wide"><label>Anexar comprovante (foto ou PDF)</label><input class="control" name="anexo" type="file" accept="image/*,.pdf" multiple><div class="attachment-note">Os comprovantes são salvos na nuvem (Supabase) e podem ser visualizados em Comprovantes.</div>${attachmentsListHTML(obj?.anexos)}</div>`;
    $("#modal-body").innerHTML = html;
    $$(".money-input").forEach((el) =>
      el.addEventListener("input", () => maskBRL(el)),
    );
    $("#modal-layer").classList.add("open");
    if (kind === "task") {
      const tpl = $("#task-template");
      tpl.onchange = () => {
        if (tpl.value && !$("#modal-body [name=titulo]").value)
          $("#modal-body [name=titulo]").value = tpl.value;
      };
    }
    $("#modal-body input")?.focus();
    if (kind === "finance" && obj) {
      wireFinModalTabs();
    }
    if (kind === "finance") {
      wireFinanceTypeForm();
    }
  }
  function wireFinanceTypeForm() {
    const body = $("#modal-body");
    const select = body?.querySelector('[name="tipoLancamento"]');
    if (!select) return;
    const sync = () => {
      const type = ["receita", "entrada_por_fora", "saida"].includes(
        select.value,
      )
        ? select.value
        : "receita";
      body.querySelectorAll("[data-fin-types]").forEach((el) => {
        const visible = String(el.dataset.finTypes || "")
          .split(/\s+/)
          .includes(type);
        el.classList.toggle("fin-type-hidden", !visible);
        el.querySelectorAll("input,select,textarea").forEach((control) => {
          control.disabled = !visible;
        });
      });
      const center = body.querySelector('[name="centro"]');
      if (center) center.required = type === "receita";
      const required = body.querySelector("#fin-center-required");
      if (required) required.hidden = type !== "receita";
      const partner = body.querySelector("#fin-partner-label");
      if (partner)
        partner.textContent =
          type === "receita"
            ? "Parceiro *"
            : type === "entrada_por_fora"
              ? "Referência *"
              : "Beneficiário / descrição *";
      const help = body.querySelector("#fin-type-help");
      if (help)
        help.textContent =
          type === "receita"
            ? "Receita prevista, com controle de recebimentos e pendências."
            : type === "entrada_por_fora"
              ? "Crédito direto no caixa, sem gerar valor pendente a receber."
              : "Pagamento ou retirada que reduz o saldo da empresa.";
      const historyTab = body.querySelector("[data-fin-history-tab]");
      if (historyTab) {
        historyTab.hidden = type === "saida";
        if (type === "saida" && historyTab.classList.contains("active"))
          body.querySelector('[data-fin-tab="dados"]')?.click();
      }
    };
    select.onchange = sync;
    sync();
  }
  function closeModal() {
    $("#modal-layer").classList.remove("open");
    editing = null;
  }
  $("#modal-form").onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    if (typeModal === "history") {
      const rec = monthlyHistory.find((x) => x.id === editing);
      if (!rec) return;
      db.historyEdits[editing] = {
        ...Object.fromEntries(
          [
            "nome",
            "descricao",
            "banco",
            "extrato",
            "situacao",
            "observacao",
            "data",
          ].map((k) => [k, String(f.get(k) || "")]),
        ),
        valor: money(f.get("valor")),
        anexos: collectAnexos(
          (db.historyEdits[editing] || {}).anexos,
          e.target,
        ),
      };
      markMutation("historyUpserts", editing);
      audit("Histórico da planilha editado", rec.aba + " · linha " + rec.linha);
      save();
      closeModal();
      render();
      toast("Registro histórico atualizado");
      return;
    }
    let selectedFinanceType = "";
    if (typeModal === "finance") {
      selectedFinanceType = ["receita", "entrada_por_fora", "saida"].includes(
        String(f.get("tipoLancamento")),
      )
        ? String(f.get("tipoLancamento"))
        : "receita";
      const previsto = money(f.get("previsto"));
      const recebido = money(f.get("recebido"));
      const saida = money(f.get("saida"));
      if (selectedFinanceType === "receita" && !String(f.get("centro") || "")) {
        toast("Selecione o centro de custo da receita.");
        return;
      }
      if (selectedFinanceType === "entrada_por_fora" && recebido <= 0) {
        toast("Informe um valor recebido maior que zero.");
        return;
      }
      if (selectedFinanceType === "saida" && saida <= 0) {
        toast("Informe um valor de saída maior que zero.");
        return;
      }
      if (previsto < 0 || recebido < 0 || saida < 0) {
        toast("Os valores do lançamento não podem ser negativos.");
        return;
      }
    }
    let arr = typeModal === "task" ? db.tasks : db.finance;
    let old = editing ? arr.find((r) => r.id === editing) : null;
    const existing = (old?.anexos || []).filter(
      (_, i) => !removedAttachments.has(i),
    );
    const anexos = [
      ...existing,
      ...Array.from(e.target.elements.anexo.files).map(storeFile),
    ];
    let rec;
    if (typeModal === "task") {
      rec = {
        id: editing || crypto.randomUUID(),
        titulo: String(f.get("titulo")).trim(),
        nome: String(f.get("nome") || "").trim(),
        dataExecucao: String(f.get("dataExecucao") || ""),
        valor: money(f.get("valor")),
        nomeExtrato: String(f.get("nomeExtrato") || ""),
        situacaoRegistro: String(f.get("situacaoRegistro") || ""),
        observacao: String(f.get("observacao") || ""),
        responsavel: String(f.get("responsavel")).trim(),
        demanda: "",
        sub: "",
        origemPagamento: String(f.get("origemPagamento") || ""),
        prazo: f.get("prazo"),
        status: f.get("status"),
        descricao: f.get("descricao"),
        recorrente: f.get("recorrente") === "on",
        recorrenteOrigemId: old?.recorrenteOrigemId || null,
        anexos,
        criadoPor: old?.criadoPor || MB.nome || "",
        criadoPorId: old?.criadoPorId || MB.userId || "",
      };
    } else {
      if (old) {
        let rx = selectedFinanceType === "saida" ? [] : finRecebimentos(old);
        const addData =
          selectedFinanceType === "receita"
            ? String(f.get("novaBaixaData") || "").trim()
            : "";
        const addValor =
          selectedFinanceType === "receita"
            ? money(f.get("novaBaixaValor"))
            : 0;
        window.__mbFinAudit = null;
        if (addData && addValor > 0) {
          rx = rx.concat([
            {
              id: crypto.randomUUID(),
              data: addData,
              valor: addValor,
              actor: MB.nome || "",
              at: new Date().toISOString(),
            },
          ]);
          window.__mbFinAudit = [
            "Recebimento registrado",
            `Financeiro: ${String(f.get("parceiro") || old.parceiro).trim()} / ${String(f.get("centro") || old.centro).trim()} · ${fmt(addValor)} em ${dateBR(addData)}`,
          ];
        }
        const formPrevisto =
          selectedFinanceType === "receita" ? money(f.get("previsto")) : 0;
        const formSaida =
          selectedFinanceType === "saida" ? money(f.get("saida")) : 0;
        const formRecebido =
          selectedFinanceType === "saida" ? 0 : money(f.get("recebido"));
        let totalRec = sumRecebimentos(rx);
        if (
          !(addData && addValor > 0) &&
          Math.abs(formRecebido - totalRec) > 0.009
        ) {
          if (formRecebido > 0) {
            rx = [
              {
                id: crypto.randomUUID(),
                data:
                  selectedFinanceType === "entrada_por_fora"
                    ? String(f.get("dataRecebida") || "")
                    : String(f.get("dataRecebida") || f.get("data") || ""),
                valor: formRecebido,
                actor: MB.nome || "",
                at: new Date().toISOString(),
              },
            ];
            totalRec = formRecebido;
          } else {
            rx = [];
            totalRec = 0;
          }
        }
        const lastRx = rx
          .slice()
          .sort((a, b) => String(a.data).localeCompare(String(b.data)))
          .pop();
        const parceiro = String(f.get("parceiro") || "").trim();
        const centro = String(f.get("centro") || "").trim();
        const data = f.get("data") || old.data;
        const dataRecebida =
          selectedFinanceType === "saida"
            ? ""
            : String(f.get("dataRecebida") || "") ||
              (lastRx ? lastRx.data : "");
        const empresaDepositante =
          selectedFinanceType === "saida"
            ? ""
            : String(f.get("empresaDepositante") || "").trim();
        const sub = String(f.get("sub") || state.empresa || old.sub || "");
        if (!window.__mbFinAudit)
          window.__mbFinAudit = [
            "Lançamento atualizado",
            `Financeiro: ${parceiro || old.parceiro} / ${centro || old.centro || "—"}`,
          ];
        rec = {
          ...old,
          tipoLancamento: selectedFinanceType,
          parceiro,
          centro,
          data,
          dataRecebida,
          empresaDepositante,
          demanda: old.demanda || "",
          sub,
          previsto: formPrevisto,
          recebido: totalRec,
          saida: formSaida,
          recebimentos: rx,
          observacao: String(f.get("observacao") || "").trim(),
          anexos,
          origem: old.origem || "Cadastro manual",
          criadoPor: old.criadoPor || MB.nome || "",
          criadoPorId: old.criadoPorId || MB.userId || "",
        };
      } else {
        const previsto =
            selectedFinanceType === "receita" ? money(f.get("previsto")) : 0,
          recebido0 =
            selectedFinanceType === "saida" ? 0 : money(f.get("recebido")),
          saida =
            selectedFinanceType === "saida" ? money(f.get("saida")) : 0;
        let rx = [];
        if (recebido0 > 0) {
          rx = [
            {
              id: crypto.randomUUID(),
              data:
                selectedFinanceType === "entrada_por_fora"
                  ? String(f.get("dataRecebida") || "")
                  : String(f.get("dataRecebida") || f.get("data") || ""),
              valor: recebido0,
              actor: MB.nome || "",
              at: new Date().toISOString(),
            },
          ];
        }
        rec = {
          id: crypto.randomUUID(),
          tipoLancamento: selectedFinanceType,
          parceiro: String(f.get("parceiro")).trim(),
          centro: String(f.get("centro")).trim(),
          data: f.get("data"),
          dataRecebida:
            selectedFinanceType === "saida"
              ? ""
              : String(f.get("dataRecebida") || ""),
          empresaDepositante:
            selectedFinanceType === "saida"
              ? ""
              : String(f.get("empresaDepositante") || "").trim(),
          demanda: "",
          sub: String(f.get("sub") || state.empresa),
          previsto,
          recebido: sumRecebimentos(rx) || recebido0,
          saida,
          recebimentos: rx,
          observacao: String(f.get("observacao") || "").trim(),
          anexos,
          origem: "Cadastro manual",
          criadoPor: MB.nome || "",
          criadoPorId: MB.userId || "",
        };
      }
    }
    if (old) {
      arr[arr.indexOf(old)] = rec;
    } else {
      arr.push(rec);
    }
    markMutation(
      typeModal === "task" ? "taskUpserts" : "financeUpserts",
      rec.id,
    );
    if (window.__mbFinAudit) {
      audit(window.__mbFinAudit[0], window.__mbFinAudit[1]);
      window.__mbFinAudit = null;
    } else {
      audit(
        old ? "Registro editado" : "Registro criado",
        typeModal === "task"
          ? `Tarefa: ${rec.titulo}`
          : `Financeiro: ${rec.parceiro} / ${rec.centro}`,
      );
    }
    save();
    const again = e.submitter && e.submitter.id === "save-next",
      kindAgain = typeModal;
    closeModal();
    render();
    toast("Salvando na nuvem…");
    if (again) openModal(kindAgain);
  };
  $$("[data-page]").forEach((b) => (b.onclick = () => goto(b.dataset.page)));
  document.addEventListener("click", (e) => {
    const del = e.target.closest("[data-remove-attachment]");
    if (del) {
      const i = Number(del.dataset.removeAttachment);
      removedAttachments.add(i);
      del.closest("[data-attachment-index]")?.remove();
      return;
    }
    const he = e.target.closest("[data-edit-history]");
    if (he) {
      editHistoryRecord(he.dataset.editHistory);
      return;
    }
    let sel = e.target.closest("[data-select-company]");
    if (sel) {
      state.empresa = sel.dataset.selectCompany;
      render();
      return;
    }
    const delTask = e.target.closest("[data-delete-task]");
    if (delTask) {
      const id = delTask.dataset.deleteTask;
      const t = db.tasks.find((x) => x.id === id);
      if (!t) return;
      if (!canDeleteRec(t)) {
        toast("Você só pode excluir o que você mesmo lançou.");
        return;
      }
      if (
        !confirm(
          'Excluir a demanda "' +
            (t.titulo || "sem título") +
            '"? Esta ação remove a tarefa da listagem.',
        )
      )
        return;
      db.tasks = db.tasks.filter((x) => x.id !== id);
      markMutation("taskDeletes", id);
      audit("Tarefa excluída", "Tarefa: " + (t.titulo || id));
      save();
      render();
      toast("Excluindo na nuvem…");
      return;
    }
    const delFin = e.target.closest("[data-delete-fin]");
    if (delFin) {
      const id = delFin.dataset.deleteFin;
      const r = db.finance.find((x) => x.id === id);
      if (!r) return;
      if (!canDeleteRec(r)) {
        toast("Você só pode excluir o que você mesmo lançou.");
        return;
      }
      if (
        !confirm(
          'Excluir o lançamento "' +
            (r.parceiro || "sem parceiro") +
            " / " +
            (r.centro || "—") +
            '"? A exclusão fica registrada na auditoria.',
        )
      )
        return;
      db.finance = db.finance.filter((x) => x.id !== id);
      markMutation("financeDeletes", id);
      audit(
        "Lançamento excluído",
        "Financeiro: " +
          (r.parceiro || id) +
          " / " +
          (r.centro || "—") +
          (r.sub ? " · " + r.sub : ""),
      );
      save();
      render();
      toast("Excluindo na nuvem…");
      return;
    }
    let target = e.target.closest(
      "[data-open],[data-goto],[data-edit-fin],[data-edit-task]",
    );
    if (!target) return;
    if (target.dataset.open) openModal(target.dataset.open);
    if (target.dataset.goto) goto(target.dataset.goto);
    if (target.dataset.editFin) openModal("finance", target.dataset.editFin);
    if (target.dataset.editTask) openModal("task", target.dataset.editTask);
  });
  $("#close-modal").onclick = closeModal;
  $("#cancel-modal").onclick = closeModal;
  $("#modal-layer").onclick = (e) => {
    if (e.target.id === "modal-layer") closeModal();
  };
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
  $("#csv-export").onclick = () => {
    const rows = financeFiltered();
    const columns = [
      "Tipo de lançamento",
      "Data",
      "Data recebida",
      "Parceiro",
      "Centro de custo",
      "Empresa depositante",
      "Empresa",
      "A receber",
      "Recebido",
      "Saída",
      "Observação",
    ];
    const vals = rows.map((r) => [
      finTipo(r),
      r.data,
      r.dataRecebida || "",
      r.parceiro,
      r.centro,
      r.empresaDepositante || "",
      r.sub,
      r.previsto,
      r.recebido,
      r.saida,
      r.observacao || "",
    ]);
    const csv =
      "\ufeff" +
      [columns, ...vals]
        .map((row) =>
          row
            .map((v) => '"' + String(v ?? "").replaceAll('"', '""') + '"')
            .join(";"),
        )
        .join("\r\n");
    let url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `assessoria-mb-${state.mes}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  };
  const todayISO = () => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 6e4)
      .toISOString()
      .slice(0, 10);
  };
  const daysBetween = (a, b) =>
    Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 864e5);
  function drawDeadlines() {
    const el = $("#dash-deadlines");
    if (!el) return;
    const t = todayISO();
    const open = db.tasks.filter((x) => x.status !== "Concluída" && x.prazo);
    const late = open
      .filter((x) => x.prazo < t)
      .sort((a, b) => a.prazo.localeCompare(b.prazo));
    const soon = open
      .filter((x) => x.prazo >= t && daysBetween(t, x.prazo) <= 7)
      .sort((a, b) => a.prazo.localeCompare(b.prazo));
    const list = [...late, ...soon].slice(0, 6);
    el.innerHTML = list.length
      ? `<ul class="deadline-list">${list
          .map((x) => {
            const d = daysBetween(t, x.prazo);
            const w =
              d < 0
                ? `${-d} dia(s) em atraso`
                : d === 0
                  ? "Vence hoje"
                  : `Em ${d} dia(s)`;
            return `<li><div class="dl-main"><b>${esc(x.titulo)}</b><span>${esc(x.responsavel || "Sem responsável")} · ${dateBR(x.prazo)}</span></div><span class="dl-when ${d < 0 ? "late" : "soon"}">${w}</span><button class="inline-btn" data-edit-task="${esc(x.id)}">Abrir</button></li>`;
          })
          .join("")}</ul>`
      : `<div class="empty">${icon("check")}<strong>Nenhum prazo crítico</strong><p>${db.tasks.length ? "Não há tarefas atrasadas ou vencendo nos próximos 7 dias." : "Cadastre tarefas com prazo para acompanhá-las aqui."}</p></div>`;
  }
  function drawSpend() {
    const el = $("#dash-spend");
    if (!el) return;
    const m = state.mes;
    const label = m
      ? new Date(m + "-15T12:00:00").toLocaleDateString("pt-BR", {
          month: "long",
          year: "numeric",
        })
      : "todos os meses";
    const rows = monthlyHistory
      .map((r) => ({ ...r, ...(db.historyEdits[r.id] || {}) }))
      .filter((r) => !m || r.mes === m);
    $("#spend-sub").textContent =
      `Registros da planilha em ${label}, por banco / origem`;
    if (!rows.length) {
      el.innerHTML = `<div class="simple-empty"><p>Sem registros na planilha para ${label}.</p></div>`;
      return;
    }
    const total = rows.reduce((n, r) => n + (Number(r.valor) || 0), 0);
    const by = {};
    rows.forEach((r) => {
      const k = r.banco || "Não informado";
      by[k] = (by[k] || 0) + (Number(r.valor) || 0);
    });
    const top = Object.entries(by).sort((a, b) => b[1] - a[1]);
    const shown = top.slice(0, 6),
      rest = top.slice(6).reduce((n, x) => n + x[1], 0);
    if (rest) shown.push([`Outras ${top.length - 6} origens`, rest]);
    const max = Math.max(...shown.map((x) => x[1]), 1);
    el.innerHTML = `<div class="spend-total"><div><span>Total no mês</span><strong>${fmt(total)}</strong></div><div><span>Registros</span><strong>${rows.length.toLocaleString("pt-BR")}</strong></div><div><span>Valor médio</span><strong>${fmt(total / rows.length)}</strong></div></div><div class="spend">${shown.map(([k, v]) => `<div class="spend-row"><span title="${esc(k)}">${esc(k)}</span><div class="spend-bar"><i style="width:${((v / max) * 100).toFixed(1)}%"></i></div><b>${fmt(v)}</b></div>`).join("")}</div>`;
  }
  function updateCounts() {
    const t = todayISO();
    const open = db.tasks.filter((x) => x.status !== "Concluída");
    const late = open.filter((x) => x.prazo && x.prazo < t).length;
    const c = $("#count-demandas");
    c.textContent = open.length || "";
    c.classList.toggle("alert", late > 0);
    c.title = late ? late + " tarefa(s) em atraso" : "";
    $("#count-minhas").textContent =
      open.filter(
        (x) =>
          String(x.responsavel || "")
            .trim()
            .toLowerCase() ===
          String(MB.nome || "")
            .trim()
            .toLowerCase(),
      ).length || "";
  }
  const closeNav = () => document.body.classList.remove("nav-open");
  $("#menu-btn").onclick = () => document.body.classList.toggle("nav-open");
  $("#more-btn").onclick = () => document.body.classList.toggle("nav-open");
  $("#scrim").onclick = closeNav;
  document.addEventListener("click", (e) => {
    const tf = e.target.closest("[data-task-filter]");
    if (tf) {
      state.taskStatus = tf.dataset.taskFilter;
      goto("demandas");
    }
    const kb = e.target.closest("[data-kpi]");
    if (kb) {
      const parts = kb.dataset.kpi.split(":");
      const pfx = parts[0];
      const key = parts[1];
      const cur = state[pfx + "QuickFilter"] || "all";
      state[pfx + "QuickFilter"] = cur === key && key !== "all" ? "all" : key;
      drawTasks();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeNav();
  });
  const alignNums = () => {
    document.querySelectorAll(".content table").forEach((tb) => {
      const row = tb.querySelector("tbody tr");
      if (!row) return;
      const ths = tb.querySelectorAll("thead th");
      [...row.children].forEach((td, i) => {
        if (td.classList.contains("amount") && ths[i])
          ths[i].classList.add("num");
      });
    });
  };
  new MutationObserver(() => {
    cancelAnimationFrame(alignNums.f);
    alignNums.f = requestAnimationFrame(alignNums);
  }).observe($(".content"), { childList: true, subtree: true });
  const fileDB = new Promise((res, rej) => {
    try {
      const r = indexedDB.open("assessoria-mb-files", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("files");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    } catch (err) {
      rej(err);
    }
  });
  fileDB.catch(() => {});
  const fileMem = {};
  let fileStore = {
    put: (id, blob) => {
      fileMem[id] = blob;
      return fileDB
        .then(
          (d) =>
            new Promise((res, rej) => {
              const tx = d.transaction("files", "readwrite");
              tx.objectStore("files").put(blob, id);
              tx.oncomplete = res;
              tx.onerror = () => rej(tx.error);
            }),
        )
        .catch(() =>
          toast("Não foi possível guardar o arquivo neste navegador"),
        );
    },
    get: async (id) => {
      if (fileMem[id]) return fileMem[id];
      const blob = await fileDB
        .then(
          (d) =>
            new Promise((res) => {
              const q = d.transaction("files").objectStore("files").get(id);
              q.onsuccess = () => res(q.result || null);
              q.onerror = () => res(null);
            }),
        )
        .catch(() => null);
      if (blob) fileMem[id] = blob;
      return blob;
    },
  };
  const fileWait = {};
  function requestCloudFile(path) {
    return new Promise((resolve, reject) => {
      if (!path) {
        reject(new Error("sem path"));
        return;
      }
      const requestId =
        "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      fileWait[requestId] = { resolve, reject };
      toParent({ type: "mb-file-get", requestId, path });
      setTimeout(() => {
        if (fileWait[requestId]) {
          fileWait[requestId].reject(new Error("timeout arquivo"));
          delete fileWait[requestId];
        }
      }, 20000);
    });
  }
  async function resolveAnexoBlob(f) {
    if (!f) return null;
    const local = await fileStore.get(f.id);
    if (local) return local;
    if (f.signedUrl) {
      try {
        const r = await fetch(f.signedUrl);
        if (r.ok) {
          const b = await r.blob();
          fileStore.put(f.id, b);
          return b;
        }
      } catch {}
    }
    if (f.path) {
      try {
        const data = await requestCloudFile(f.path);
        const bin = atob(data.dataBase64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const b = new Blob([bytes], {
          type: data.mime || f.type || "application/octet-stream",
        });
        fileStore.put(f.id, b);
        return b;
      } catch {}
    }
    return null;
  }

  function storeFile(file) {
    const id = crypto.randomUUID();
    fileMem[id] = file;
    fileStore.put(id, file);
    return { id, name: file.name, type: file.type, size: file.size };
  }
  function collectAnexos(existing, form) {
    return [
      ...(existing || []).filter((_, i) => !removedAttachments.has(i)),
      ...Array.from(form.elements.anexo?.files || []).map(storeFile),
    ];
  }
  const fsize = (n) =>
    !n
      ? "—"
      : n < 1048576
        ? Math.max(1, Math.round(n / 1024)) + " KB"
        : (n / 1048576).toFixed(1).replace(".", ",") + " MB";
  const ficon = (f) =>
    String(f.type || "").startsWith("image/") ? "image" : "file";
  function fileCell(list, ref) {
    const n = (list || []).length;
    return n
      ? `<button type="button" class="file-btn" data-view-files="${esc(ref)}" title="Visualizar comprovantes">${icon("clip")}${n}</button>`
      : '<span class="muted">—</span>';
  }
  function fmtBytes(n) {
    const num = Number(n) || 0;
    if (!num) return "";
    if (num >= 1024 * 1024) return (num / 1024 / 1024).toFixed(1) + " MB";
    return Math.max(1, Math.round(num / 1024)) + " KB";
  }
  function attachmentsListHTML(list) {
    if (!list || !list.length) return "";
    const cards = list
      .map((f, i) => {
        const meta = [
          fmtBytes(f.size),
          f.createdAt ? "Anexado em " + dateBR(f.createdAt) : "",
        ]
          .filter(Boolean)
          .join(" · ");
        const ver = f.signedUrl
          ? `<a class='att-view' href='${esc(f.signedUrl)}' target='_blank' rel='noopener'>Ver</a>`
          : "";
        return `<div class='att-card' data-attachment-index='${i}'><div class='att-icon'>${icon("clip")}</div><div class='att-info'><strong>${esc(f.name)}</strong>${meta ? `<span class='muted'>${esc(meta)}</span>` : ""}</div><div class='att-actions'>${ver}<button type='button' class='att-remove' data-remove-attachment='${i}' title='Remover anexo'>${icon("trash")}</button></div></div>`;
      })
      .join("");
    return `<div class='att-list'>${cards}</div>`;
  }
  function anexoField(list) {
    return `<div class="form-section">Comprovantes</div><div class="field wide"><label>Anexar comprovante (foto ou PDF)</label><input class="control" name="anexo" type="file" accept="image/*,.pdf" multiple><div class="attachment-note">Os comprovantes são salvos na nuvem (Supabase) e podem ser visualizados em Comprovantes.</div>${attachmentsListHTML(list)}</div>`;
  }
  function filesFor(ref) {
    const p = ref.indexOf(":"),
      k = ref.slice(0, p),
      id = ref.slice(p + 1);
    if (k === "fin") {
      const r = db.finance.find((x) => x.id === id);
      return (
        r && {
          title: `${r.parceiro} · ${r.centro}`,
          sub: `Lançamento financeiro · ${r.sub || ""} · ${dateBR(r.data)} · ${fmt(r.previsto)}`,
          files: r.anexos || [],
        }
      );
    }
    if (k === "task") {
      const t = db.tasks.find((x) => x.id === id);
      return (
        t && {
          title: t.titulo,
          sub: `Tarefa · ${t.responsavel || "Sem responsável"}${t.valor ? " · " + fmt(t.valor) : ""}`,
          files: t.anexos || [],
        }
      );
    }
    if (k === "history") {
      const b = monthlyHistory.find((x) => x.id === id);
      if (!b) return null;
      const r = { ...b, ...(db.historyEdits[id] || {}) };
      return {
        title: r.nome || r.descricao || "Registro",
        sub: `Prestação de contas · ${dateBR(r.data)} · ${fmt(r.valor)}${r.banco ? " · " + r.banco : ""}`,
        files: r.anexos || [],
      };
    }
    return null;
  }
  let viewerURL = null,
    viewerData = null;
  function openViewer(ref, idx = 0) {
    const d = filesFor(ref);
    if (!d || !d.files.length) {
      toast("Nenhum comprovante neste registro");
      return;
    }
    viewerData = d;
    $("#viewer-title").textContent = d.title;
    $("#viewer-sub").textContent = d.sub;
    $("#viewer-list").innerHTML = d.files
      .map(
        (f, i) =>
          `<li><button type="button" data-viewer-index="${i}">${icon(ficon(f))}<span class="vl-text"><b>${esc(f.name)}</b><span>${esc((f.type || "arquivo").split("/").pop().toUpperCase())} · ${fsize(f.size)}</span></span></button></li>`,
      )
      .join("");
    $("#viewer-layer").classList.add("open");
    showFile(Math.min(idx, d.files.length - 1));
  }
  async function showFile(i) {
    const f = viewerData.files[i];
    $$("#viewer-list button").forEach((b, j) =>
      b.classList.toggle("active", j === i),
    );
    if (viewerURL) {
      URL.revokeObjectURL(viewerURL);
      viewerURL = null;
    }
    const pv = $("#viewer-preview");
    pv.innerHTML = `<div class="vp-stage"><div class="vp-empty">Carregando…</div></div>`;
    const blob = await resolveAnexoBlob(f);
    if (!blob) {
      pv.innerHTML = `<div class="vp-bar"><b>${esc(f.name)}</b></div><div class="vp-stage"><div class="vp-empty">${icon("file")}<strong>Pré-visualização indisponível</strong>Este arquivo foi registrado apenas pelo nome, antes do armazenamento local. Anexe-o novamente para visualizar.</div></div>`;
      return;
    }
    viewerURL = URL.createObjectURL(blob);
    const isImg = String(blob.type || f.type).startsWith("image/"),
      isPdf = String(blob.type || f.type).includes("pdf");
    pv.innerHTML = `<div class="vp-bar"><b>${esc(f.name)}</b><a class="btn" href="${viewerURL}" target="_blank" rel="noopener">${icon("external")}Abrir</a><a class="btn" href="${viewerURL}" download="${esc(f.name)}">${icon("dl")}Baixar</a></div><div class="vp-stage">${isImg ? `<img src="${viewerURL}" alt="${esc(f.name)}">` : isPdf ? `<iframe src="${viewerURL}" title="${esc(f.name)}"></iframe>` : `<div class="vp-empty">${icon("file")}<strong>Formato sem pré-visualização</strong>Use “Baixar” para abrir o arquivo.</div>`}</div>`;
  }
  function closeViewer() {
    $("#viewer-layer").classList.remove("open");
    if (viewerURL) {
      URL.revokeObjectURL(viewerURL);
      viewerURL = null;
    }
  }
  $("#viewer-close").onclick = closeViewer;
  $("#viewer-layer").onclick = (e) => {
    if (e.target.id === "viewer-layer") closeViewer();
  };
  document.addEventListener(
    "click",
    (e) => {
      const v = e.target.closest("[data-view-files]");
      if (v) {
        e.stopPropagation();
        openViewer(v.dataset.viewFiles, Number(v.dataset.fileIndex || 0));
        return;
      }
      const vi = e.target.closest("[data-viewer-index]");
      if (vi) showFile(Number(vi.dataset.viewerIndex));
    },
    true,
  );
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeViewer();
  });
  /* Settings */
  const SET = { tab: "centers", edit: false, draft: null };
  const SETDEF = {
    centers: {
      title: "Centros de custo",
      desc: "Cadastre códigos e descrições usados nos lançamentos. Você pode incluir novos centros além de M1–M5.",
      key: "centers",
      item: "centro",
      usage: (v) => db.finance.filter((r) => r.centro === v).length,
    },
    banks: {
      title: "Contas e origens de pagamento",
      desc: "Opções do campo “Origem do pagamento” nas tarefas e prestações de contas.",
      key: "banks",
      item: "origem",
      usage: (v) => db.tasks.filter((t) => t.origemPagamento === v).length,
    },
    templates: {
      title: "Modelos de tarefas",
      desc: "Títulos sugeridos ao cadastrar uma nova tarefa. O cadastro continua aceitando tarefa livre.",
      key: "templates",
      item: "modelo",
      usage: (v) => db.tasks.filter((t) => t.titulo === v).length,
    },
    staff: {
      title: "Equipe administrativa",
      desc: "Pessoas sugeridas no campo “Responsável” das tarefas.",
      key: "staff",
      item: "pessoa",
      usage: (v) => db.tasks.filter((t) => t.responsavel === v).length,
    },
    companies: {
      title: "Empresas",
      desc: "Empresas do módulo financeiro. Inclua, edite ou remova conforme a operação.",
      key: "companies",
      item: "empresa",
      usage: (v) => db.finance.filter((r) => r.sub === v).length,
    },
  };

  const setOriginal = () => {
    if (SET.tab === "centers") {
      refreshCostCodes();
      return COST_CODES.map((c) => ({ code: c, desc: db.centers[c] || "" }));
    }
    return [...(db[SETDEF[SET.tab].key] || [])];
  };
  const setClean = (d) => {
    if (SET.tab === "centers") {
      const rows = (d || [])
        .map((r) => ({
          code: String(r.code || "")
            .trim()
            .toUpperCase(),
          desc: String(r.desc || "").trim(),
        }))
        .filter((r) => r.code);
      const seen = new Set();
      const out = [];
      for (const r of rows) {
        if (seen.has(r.code)) continue;
        seen.add(r.code);
        out.push(r);
      }
      return out;
    }
    return [...new Set((d || []).map((s) => String(s).trim()).filter(Boolean))];
  };
  const setDirty = () =>
    SET.edit &&
    JSON.stringify(setClean(SET.draft)) !==
      JSON.stringify(setClean(setOriginal()));
  function updateDirty() {
    const on = setDirty();
    const ind = $("#dirty-ind"),
      btn = $("#set-save");
    if (ind) {
      ind.classList.toggle("on", on);
      ind.textContent = on ? "Alterações não salvas" : "Nenhuma alteração";
    }
    if (btn) btn.disabled = !on;
    const sel =
      SET.tab === "centers"
        ? ".edit-row input[data-code-i]"
        : ".edit-row input[data-i]";
    const seen = {};
    $$(sel).forEach((inp) => {
      const v =
        SET.tab === "centers"
          ? inp.value.trim().toUpperCase()
          : inp.value.trim().toLowerCase();
      inp.classList.toggle("dup", !!v && !!seen[v]);
      if (v) seen[v] = 1;
    });
  }
  function drawSettings() {
    refreshCostCodes();
    refreshCompanies();
    const c = {
      centers: COST_CODES.length,
      banks: db.banks.length,
      templates: db.templates.length,
      staff: db.staff.length,
      companies: subdivisions.length,
    };
    for (const k in c) {
      const el = $("#snc-" + k);
      if (el) el.textContent = c[k];
    }
    $$(".sn-btn").forEach((b) =>
      b.classList.toggle("active", b.dataset.set === SET.tab),
    );
    $("#set-env").classList.toggle("hide", SET.tab !== "env");
    $("#set-dynamic").classList.toggle("hide", SET.tab === "env");
    if (SET.tab === "env") {
      const files = [
        ...db.finance,
        ...db.tasks,
        ...Object.values(db.historyEdits),
      ].reduce((n, r) => n + ((r && r.anexos) || []).length, 0);
      $("#env-stats").innerHTML = [
        ["Lançamentos", db.finance.length],
        ["Tarefas", db.tasks.length],
        ["Edições na planilha", Object.keys(db.historyEdits).length],
        ["Comprovantes", files],
        ["Registros de auditoria", db.audit.length],
      ]
        .map(
          (x) =>
            "<div><span>" +
            x[0] +
            "</span><strong>" +
            x[1].toLocaleString("pt-BR") +
            "</strong></div>",
        )
        .join("");
      return;
    }
    const def = SETDEF[SET.tab];
    let body = "",
      foot = "",
      head = "";
    if (!SET.edit) {
      head =
        '<button type="button" class="btn" data-set-act="edit">' +
        icon("edit") +
        'Editar</button><button type="button" class="btn primary" data-set-act="edit-add">' +
        icon("plus") +
        "Adicionar</button>";
      if (SET.tab === "centers") {
        const rows = COST_CODES.map((k) => {
          const n = db.finance.filter((r) => r.centro === k).length;
          return (
            '<tr><td class="code">' +
            esc(k) +
            '</td><td class="wrap">' +
            (db.centers[k]
              ? esc(db.centers[k])
              : '<span class="muted">Sem descrição</span>') +
            '</td><td class="amount">' +
            n +
            "</td></tr>"
          );
        }).join("");
        body =
          '<table class="set-table"><thead><tr><th>Código</th><th>Descrição</th><th>Lançamentos</th></tr></thead><tbody>' +
          (rows ||
            '<tr><td colspan="3" class="empty">Nenhum centro cadastrado</td></tr>') +
          "</tbody></table>";
      } else {
        const list = db[def.key] || [];
        body = list.length
          ? '<table class="set-table"><thead><tr><th>#</th><th>Nome</th><th>Uso</th></tr></thead><tbody>' +
            list
              .map(
                (v, i) =>
                  '<tr><td class="idx">' +
                  String(i + 1).padStart(2, "0") +
                  "</td><td><b>" +
                  esc(v) +
                  '</b></td><td class="amount">' +
                  def.usage(v) +
                  "</td></tr>",
              )
              .join("") +
            "</tbody></table>"
          : '<div class="empty">' +
            icon("list") +
            '<strong>Nenhum item cadastrado</strong><p>Adicione opções para agilizar o preenchimento dos formulários.</p><button type="button" class="btn primary" data-set-act="edit-add" style="margin-top:10px">' +
            icon("plus") +
            "Adicionar " +
            def.item +
            "</button></div>";
      }
    } else {
      if (SET.tab === "centers") {
        body =
          '<div class="edit-list">' +
          SET.draft
            .map(
              (r, i) =>
                '<div class="edit-row" style="grid-template-columns:110px minmax(0,1fr) 36px"><input class="control" data-code-i="' +
                i +
                '" maxlength="24" placeholder="Código" value="' +
                esc(r.code || "") +
                '"><input class="control" data-desc-i="' +
                i +
                '" maxlength="180" placeholder="Descrição" value="' +
                esc(r.desc || "") +
                '"><button type="button" class="icon-btn sm danger" data-set-act="remove" data-i="' +
                i +
                '" aria-label="Remover" title="Remover">' +
                icon("trash") +
                "</button></div>",
            )
            .join("") +
          '<button type="button" class="add-row" data-set-act="add">' +
          icon("plus") +
          "Adicionar centro</button></div>";
      } else {
        body =
          '<div class="edit-list">' +
          SET.draft
            .map(
              (v, i) =>
                '<div class="edit-row"><span class="er-idx">' +
                String(i + 1).padStart(2, "0") +
                '</span><input class="control" data-i="' +
                i +
                '" maxlength="120" placeholder="Nome da ' +
                def.item +
                '" value="' +
                esc(v) +
                '"><button type="button" class="icon-btn sm danger" data-set-act="remove" data-i="' +
                i +
                '" aria-label="Remover" title="Remover">' +
                icon("trash") +
                "</button></div>",
            )
            .join("") +
          '<button type="button" class="add-row" data-set-act="add">' +
          icon("plus") +
          "Adicionar " +
          def.item +
          "</button></div>";
      }
      foot =
        '<div class="set-foot"><span class="dirty-ind" id="dirty-ind">Nenhuma alteração</span><button type="button" class="btn" data-set-act="cancel">Cancelar</button><button type="button" class="btn primary" data-set-act="save" id="set-save" disabled>' +
        icon("check") +
        "Salvar alterações</button></div>";
      head = '<span class="pill info">Modo de edição</span>';
    }
    $("#set-dynamic").innerHTML =
      '<div class="set-card"><div class="set-head"><div><h2>' +
      def.title +
      "</h2><p>" +
      def.desc +
      '</p></div><div class="actions">' +
      head +
      '</div></div><div class="set-body">' +
      body +
      "</div>" +
      foot +
      (SET.edit
        ? '<div class="set-note">Itens vazios e duplicados são ignorados ao salvar. Pressione Enter para adicionar uma nova linha.</div>'
        : "") +
      "</div>";
    if (SET.edit) updateDirty();
  }
  function setTab(t) {
    if (t === SET.tab) return;
    if (setDirty() && !confirm("Descartar as alterações não salvas?")) return;
    SET.tab = t;
    SET.edit = false;
    SET.draft = null;
    drawSettings();
  }
  function focusRow(i) {
    const el = $(`.edit-row input[data-i="${i}"]`);
    if (el) el.focus();
  }
  $(".settings-nav").addEventListener("click", (e) => {
    const b = e.target.closest("[data-set]");
    if (b) setTab(b.dataset.set);
  });
  $("#set-dynamic").addEventListener("click", (e) => {
    const b = e.target.closest("[data-set-act]");
    if (!b) return;
    const a = b.dataset.setAct;
    if ((a === "edit" || a === "edit-add") && !MB.admin) {
      toast("Só admin edita essas opções.");
      return;
    }
    if (a === "edit" || a === "edit-add") {
      SET.edit = true;
      SET.draft = setOriginal();
      if (a === "edit-add" || (Array.isArray(SET.draft) && !SET.draft.length)) {
        if (SET.tab === "centers") SET.draft.push({ code: "", desc: "" });
        else SET.draft.push("");
      }
      drawSettings();
      const f = $("#set-dynamic input");
      if (f) f.focus();
    } else if (a === "cancel") {
      if (setDirty() && !confirm("Descartar as alterações não salvas?")) return;
      SET.edit = false;
      SET.draft = null;
      drawSettings();
    } else if (a === "add") {
      if (SET.tab === "centers") {
        SET.draft.push({ code: "", desc: "" });
        drawSettings();
        const el = $(
          '.edit-row input[data-code-i="' + (SET.draft.length - 1) + '"]',
        );
        if (el) el.focus();
      } else {
        SET.draft.push("");
        drawSettings();
        focusRow(SET.draft.length - 1);
      }
    } else if (a === "remove") {
      SET.draft.splice(Number(b.dataset.i), 1);
      drawSettings();
    } else if (a === "save") {
      const clean = setClean(SET.draft),
        def = SETDEF[SET.tab];
      if (SET.tab === "centers") {
        const map = {};
        for (const r of clean) map[r.code] = r.desc;
        db.centers = map;
        refreshCostCodes();
        audit("Centros de custo atualizados", clean.length + " centros");
      } else if (SET.tab === "companies") {
        db.companies = clean;
        refreshCompanies();
        audit("Empresas atualizadas", clean.length + " empresas");
      } else {
        db[def.key] = clean;
        audit(def.title + " atualizados", clean.length + " opções");
      }
      markSetting(SET.tab);
      save();
      SET.edit = false;
      SET.draft = null;
      render();
      toast("Salvando " + def.title.toLowerCase() + " na nuvem…");
    }
  });
  $("#set-dynamic").addEventListener("input", (e) => {
    const t = e.target;
    if (!SET.edit) return;
    if (t.dataset.codeI != null) {
      const i = Number(t.dataset.codeI);
      SET.draft[i] = SET.draft[i] || { code: "", desc: "" };
      SET.draft[i].code = t.value;
    } else if (t.dataset.descI != null) {
      const i = Number(t.dataset.descI);
      SET.draft[i] = SET.draft[i] || { code: "", desc: "" };
      SET.draft[i].desc = t.value;
    } else if (t.dataset.code) SET.draft[t.dataset.code] = t.value;
    else if (t.dataset.i != null) SET.draft[Number(t.dataset.i)] = t.value;
    updateDirty();
  });
  $("#set-dynamic").addEventListener("keydown", (e) => {
    const t = e.target;
    if (e.key !== "Enter" || !t.dataset) return;
    if (t.dataset.i != null) {
      e.preventDefault();
      const i = Number(t.dataset.i) + 1;
      SET.draft.splice(i, 0, "");
      drawSettings();
      focusRow(i);
    } else if (t.dataset.codeI != null || t.dataset.descI != null) {
      e.preventDefault();
      const i =
        Number(t.dataset.codeI != null ? t.dataset.codeI : t.dataset.descI) + 1;
      SET.draft.splice(i, 0, { code: "", desc: "" });
      drawSettings();
      const el = $('.edit-row input[data-code-i="' + i + '"]');
      if (el) el.focus();
    }
  });
  window.addEventListener("beforeunload", (e) => {
    if (setDirty() || hasPendingMutations()) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  $("#backup-export").onclick = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            app: "assessoria-mb",
            version: 3,
            exportedAt: new Date().toISOString(),
            db,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `assessoria-mb-backup-${todayISO()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
    audit("Backup exportado", "Arquivo JSON gerado");
    toast("Backup exportado");
  };
  $("#backup-import").onclick = () => $("#backup-file").click();
  $("#backup-file").onchange = async (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      const d = j.db || j;
      if (!Array.isArray(d.finance) || !Array.isArray(d.tasks)) throw 0;
      if (
        !confirm(
          `Substituir os dados atuais por este backup? (${d.finance.length} lançamentos, ${d.tasks.length} tarefas)`,
        )
      )
        return;
      const previousDb = db;
      db = Object.assign(
        initial(),
        { centers: {}, banks: [], templates: [], staff: [], historyEdits: {} },
        d,
      );
      const financeIds = new Set(db.finance.map((row) => row.id));
      const taskIds = new Set(db.tasks.map((row) => row.id));
      db.finance.forEach((row) => markMutation("financeUpserts", row.id));
      db.tasks.forEach((row) => markMutation("taskUpserts", row.id));
      previousDb.finance
        .filter((row) => !financeIds.has(row.id))
        .forEach((row) => markMutation("financeDeletes", row.id));
      previousDb.tasks
        .filter((row) => !taskIds.has(row.id))
        .forEach((row) => markMutation("taskDeletes", row.id));
      Object.keys(db.historyEdits || {}).forEach((id) =>
        markMutation("historyUpserts", id),
      );
      ["banks", "templates", "staff", "centers", "companies"].forEach(
        markSetting,
      );
      audit("Backup importado", f.name);
      save();
      render();
      toast("Backup importado");
    } catch {
      toast("Arquivo de backup inválido");
    }
  };
  /* Visual 2026-11: painel financeiro, empresas, contas e topo */
  const MESES = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];
  const compLabel = (m) => {
    if (!m) return "Todo o período";
    const p = String(m).split("-");
    return (MESES[Number(p[1]) - 1] || p[1]) + " / " + p[0];
  };
  const n2 = (v) =>
    (Number(v) || 0).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  function compOptions() {
    const set = new Set();
    db.finance.forEach((r) => {
      const launchMonth = month(r.data);
      if (/^\d{4}-\d{2}$/.test(launchMonth)) set.add(launchMonth);
      receiptCashEvents(r).forEach((event) => {
        const receiptMonth = month(event.data);
        if (/^\d{4}-\d{2}$/.test(receiptMonth)) set.add(receiptMonth);
      });
    });
    if (state.mes) set.add(state.mes);
    if (state.contasMes) set.add(state.contasMes);
    set.add(todayISO().slice(0, 7));
    const list = [...set].sort();
    let [y, m] = list[0].split("-").map(Number);
    const [ly, lm] = list[list.length - 1].split("-").map(Number);
    const out = [];
    while (y < ly || (y === ly && m <= lm)) {
      out.push(`${y}-${String(m).padStart(2, "0")}`);
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
    }
    return out.reverse();
  }
  const finKind = (r) => {
    const saved = String(r?.tipoLancamento || "");
    if (["receita", "entrada_por_fora", "saida"].includes(saved)) return saved;
    return money(r?.saida) > 0 && !money(r?.previsto) && !money(r?.recebido)
      ? "saida"
      : "receita";
  };
  const finTipo = (r) =>
    ({
      receita: "Receita",
      entrada_por_fora: "Entrada por fora",
      saida: "Saída",
    })[finKind(r)];
  const finStatus = (r) => {
    const kind = finKind(r);
    if (kind === "saida") return ["Pago", "ok"];
    if (kind === "entrada_por_fora")
      return money(r.recebido) > 0 ? ["Recebido", "ok"] : ["Pendente", "warn"];
    const p = money(r.previsto),
      v = money(r.recebido);
    if (p && v > p) return ["Valor excedente — revisar", "danger"];
    if (p && v === p) return ["Concluído", "ok"];
    if (v > 0) return ["Em aberto", "danger"];
    return ["Pendente", "warn"];
  };
  function finFalta(r) {
    return Math.max(0, money(r.previsto) - money(r.recebido));
  }
  function finStatusHTML(r) {
    const st = finStatus(r);
    if (st[0] === "Em aberto") {
      const falta = finFalta(r);
      return `<span class="status-em-aberto"><b>Em aberto</b><span class="status-faltam">Falta ${fmt(falta)}</span></span>`;
    }
    if (st[0] === "Valor excedente — revisar") {
      const excedente = Math.max(0, money(r.recebido) - money(r.previsto));
      return `<span class="status-em-aberto"><b>Valor excedente — revisar</b><span class="status-faltam">Excedente ${fmt(excedente)}</span></span>`;
    }
    return `<span class="pill ${st[1]}">${st[0]}</span>`;
  }
  function finRecebimentos(r) {
    let arr = Array.isArray(r && r.recebimentos) ? r.recebimentos.slice() : [];
    if (!arr.length && r && money(r.recebido) > 0) {
      arr = [
        {
          id: "seed-" + r.id,
          data:
            finKind(r) === "entrada_por_fora"
              ? r.dataRecebida || ""
              : r.dataRecebida || r.data || "",
          valor: money(r.recebido),
          actor: r.criadoPor || "",
          at: "",
        },
      ];
    }
    return arr;
  }
  function sumRecebimentos(arr) {
    return (arr || []).reduce((s, x) => s + money(x.valor), 0);
  }
  const isFinancialDate = (value) =>
    /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
  function receiptCashEvents(record) {
    if (!record || finKind(record) === "saida") return [];
    const saved = Array.isArray(record.recebimentos)
      ? record.recebimentos
      : [];
    if (saved.length) {
      return saved
        .map((item, index) => ({
          id: item.id || `${record.id}-rx-${index}`,
          rowId: record.id,
          company: record.sub || "",
          kind: finKind(record),
          data: isFinancialDate(item.data) ? String(item.data) : "",
          value: money(item.valor),
        }))
        .filter((event) => event.value > 0);
    }
    const value = money(record.recebido);
    if (value <= 0) return [];
    return [
      {
        id: `${record.id}-received`,
        rowId: record.id,
        company: record.sub || "",
        kind: finKind(record),
        data: isFinancialDate(record.dataRecebida)
          ? String(record.dataRecebida)
          : "",
        value,
      },
    ];
  }
  function cashLedger(rows) {
    const entries = [];
    const exits = [];
    rows.forEach((record) => {
      receiptCashEvents(record).forEach((event) => entries.push(event));
      if (finKind(record) === "saida" && money(record.saida) > 0) {
        exits.push({
          id: `${record.id}-out`,
          rowId: record.id,
          company: record.sub || "",
          data: isFinancialDate(record.data) ? String(record.data) : "",
          value: money(record.saida),
        });
      }
    });
    return { entries, exits };
  }
  function monthBounds(reference) {
    if (!/^\d{4}-\d{2}$/.test(String(reference || ""))) return null;
    let [year, monthNumber] = String(reference).split("-").map(Number);
    const start = `${year}-${String(monthNumber).padStart(2, "0")}-01`;
    monthNumber++;
    if (monthNumber > 12) {
      monthNumber = 1;
      year++;
    }
    return {
      start,
      end: `${year}-${String(monthNumber).padStart(2, "0")}-01`,
    };
  }
  function previousMonth(reference) {
    let [year, monthNumber] = String(reference).split("-").map(Number);
    monthNumber--;
    if (monthNumber < 1) {
      monthNumber = 12;
      year--;
    }
    return `${year}-${String(monthNumber).padStart(2, "0")}`;
  }
  function cashSnapshot(rows, reference = "") {
    const ledger = cashLedger(rows);
    const unknownEntries = ledger.entries.filter((event) => !event.data);
    const unknownExits = ledger.exits.filter((event) => !event.data);
    const datedEntries = ledger.entries.filter((event) => event.data);
    const datedExits = ledger.exits.filter((event) => event.data);
    const bounds = monthBounds(reference);
    if (!bounds) {
      const entries = datedEntries.reduce((sum, event) => sum + event.value, 0);
      const exits = datedExits.reduce((sum, event) => sum + event.value, 0);
      return {
        prior: null,
        entries,
        exits,
        final: entries - exits,
        unknownEntries,
        unknownExits,
      };
    }
    const beforeEntries = datedEntries
      .filter((event) => event.data < bounds.start)
      .reduce((sum, event) => sum + event.value, 0);
    const beforeExits = datedExits
      .filter((event) => event.data < bounds.start)
      .reduce((sum, event) => sum + event.value, 0);
    const entries = datedEntries
      .filter(
        (event) => event.data >= bounds.start && event.data < bounds.end,
      )
      .reduce((sum, event) => sum + event.value, 0);
    const exits = datedExits
      .filter(
        (event) => event.data >= bounds.start && event.data < bounds.end,
      )
      .reduce((sum, event) => sum + event.value, 0);
    const prior = beforeEntries - beforeExits;
    return {
      prior,
      entries,
      exits,
      final: prior + entries - exits,
      unknownEntries,
      unknownExits,
    };
  }
  function dashboardPeriodStats(rows, reference = "") {
    const bounds = monthBounds(reference);
    const ledger = cashLedger(rows);
    const inPeriod = (date) =>
      !bounds || (date && date >= bounds.start && date < bounds.end);
    const launchRows = rows.filter(
      (record) =>
        finKind(record) === "receita" &&
        isFinancialDate(record.data) &&
        inPeriod(record.data),
    );
    const entries = ledger.entries.filter((event) => inPeriod(event.data));
    const exits = ledger.exits.filter((event) => inPeriod(event.data));
    const ids = new Set([
      ...launchRows.map((record) => record.id),
      ...entries.map((event) => event.rowId),
      ...exits.map((event) => event.rowId),
    ]);
    const cutoff = bounds?.end || "9999-12-31";
    const pending = rows
      .filter(
        (record) =>
          finKind(record) === "receita" &&
          isFinancialDate(record.data) &&
          record.data < cutoff,
      )
      .reduce((sum, record) => {
        const receivedAtCutoff = receiptCashEvents(record)
          .filter((event) => event.data && event.data < cutoff)
          .reduce((total, event) => total + event.value, 0);
        return sum + Math.max(0, money(record.previsto) - receivedAtCutoff);
      }, 0);
    return {
      rowIds: ids,
      rowCount: ids.size,
      previsto: launchRows.reduce(
        (sum, record) => sum + money(record.previsto),
        0,
      ),
      recebido: entries.reduce((sum, event) => sum + event.value, 0),
      recebidoReceitas: entries
        .filter((event) => event.kind === "receita")
        .reduce((sum, event) => sum + event.value, 0),
      entradaPorFora: entries
        .filter((event) => event.kind === "entrada_por_fora")
        .reduce((sum, event) => sum + event.value, 0),
      saidas: exits.reduce((sum, event) => sum + event.value, 0),
      pending,
    };
  }
  function rxHistoryRows(obj) {
    const rows = [];
    if (finKind(obj) === "receita")
      rows.push({
        tipo: "Lançamento",
        data: String(obj.data || ""),
        valor: money(obj.previsto),
        actor: obj.criadoPor || "—",
        kind: "previsto",
      });
    finRecebimentos(obj).forEach(function (x, i) {
      rows.push({
        tipo: "Recebimento " + (i + 1),
        data: String(x.data || ""),
        valor: money(x.valor),
        actor: x.actor || "—",
        kind: "recebido",
      });
    });
    return rows;
  }
  function rxSheetHTML(obj, sortKey, sortDir) {
    sortKey = sortKey || "data";
    sortDir = sortDir || "asc";
    const rx = finRecebimentos(obj);
    let rows = rxHistoryRows(obj).slice();
    rows.sort(function (a, b) {
      if (sortKey === "valor") {
        const av = money(a.valor),
          bv = money(b.valor);
        return sortDir === "asc" ? av - bv : bv - av;
      }
      const av = String(a[sortKey] || ""),
        bv = String(b[sortKey] || "");
      const c = av.localeCompare(bv, "pt-BR", {
        numeric: true,
        sensitivity: "base",
      });
      return sortDir === "asc" ? c : -c;
    });
    const arrow = function (k) {
      return sortKey === k ? (sortDir === "asc" ? " ▲" : " ▼") : "";
    };
    const totalRecebido = sumRecebimentos(rx) || money(obj.recebido);
    const resumo =
      finKind(obj) === "entrada_por_fora"
        ? `Crédito registrado <b>${fmt(totalRecebido)}</b>`
        : `Recebido <b>${fmt(totalRecebido)}</b> de <b>${fmt(obj.previsto || 0)}</b>`;
    let h = `<div class='rx-sheet-wrap'><div class='rx-sheet-sum'>Situação: ${finStatusHTML(obj)} · ${resumo}</div>`;
    h +=
      `<table class='rx-sheet'><thead><tr>` +
      `<th class='rx-num'>#</th>` +
      `<th data-rx-sort='data'>Data${arrow("data")}</th>` +
      `<th data-rx-sort='tipo'>Tipo${arrow("tipo")}</th>` +
      `<th data-rx-sort='valor' class='num'>Valor${arrow("valor")}</th>` +
      `<th data-rx-sort='actor'>Responsável${arrow("actor")}</th>` +
      `</tr></thead><tbody>`;
    rows.forEach(function (r, idx) {
      h += `<tr class='${r.kind}'><td class='rx-num'>${idx + 1}</td><td>${dateBR(r.data)}</td><td>${esc(r.tipo)}</td><td class='num'><b>${fmt(r.valor)}</b></td><td>${esc(r.actor)}</td></tr>`;
    });
    if (!rows.length)
      h += `<tr><td colspan='5' class='empty'>Sem histórico ainda.</td></tr>`;
    h += `</tbody></table><p class='rx-sheet-hint'>Clique no cabeçalho para ordenar (crescente / decrescente).</p></div>`;
    return h;
  }
  window.__finHist = { obj: null, key: "data", dir: "asc" };
  function renderFinHistSheet() {
    const pane = document.getElementById("fin-hist-pane");
    if (!pane || !window.__finHist.obj) return;
    pane.innerHTML = rxSheetHTML(
      window.__finHist.obj,
      window.__finHist.key,
      window.__finHist.dir,
    );
  }
  function sortFinHist(key) {
    if (window.__finHist.key === key)
      window.__finHist.dir = window.__finHist.dir === "asc" ? "desc" : "asc";
    else {
      window.__finHist.key = key;
      window.__finHist.dir = "asc";
    }
    renderFinHistSheet();
  }
  function wireFinModalTabs() {
    const body = document.getElementById("modal-body");
    if (!body) return;
    body.querySelectorAll("[data-fin-tab]").forEach(function (btn) {
      btn.onclick = function () {
        body.querySelectorAll("[data-fin-tab]").forEach(function (b) {
          b.classList.toggle("active", b === btn);
        });
        body.querySelectorAll("[data-fin-pane]").forEach(function (p) {
          p.classList.toggle(
            "hidden",
            p.getAttribute("data-fin-pane") !==
              btn.getAttribute("data-fin-tab"),
          );
        });
      };
    });
    body.onclick = function (e) {
      const th = e.target.closest("[data-rx-sort]");
      if (!th || !body.contains(th)) return;
      sortFinHist(th.getAttribute("data-rx-sort"));
    };
  }
  const hs = (l, v) =>
    `<div class="hsummary"><span>${l}</span><strong>${v}</strong></div>`;
  function kpis(container, rows) {
    const a = totals(rows),
      pct = a.prev ? Math.round((a.recReceita / a.prev) * 100) : 0,
      saldo = a.rec - a.sai;
    const k = [
      [
        "in",
        "down",
        "Previsto a Receber",
        fmt(a.prev),
        `<small>${rows.length} lançamento(s) no período</small>`,
      ],
      [
        "ok",
        "check",
        "Recebido",
        fmt(a.rec),
        `<small class="pos">${pct}% do previsto${a.recExtra ? ` · ${fmt(a.recExtra)} por fora` : ""}</small><div class="meter"><i style="width:${Math.min(100, pct)}%"></i></div>`,
      ],
      [
        "out",
        "arrow",
        "Despesas / Saídas",
        fmt(a.sai),
        "<small>Total de saídas no período</small>",
      ],
      [
        "bal",
        "database",
        "Saldo Líquido",
        fmt(saldo),
        "<small>Recebido – Saídas</small>",
      ],
    ];
    $(container).innerHTML = k
      .map(
        (x) =>
          `<article class="kpi ${x[0]}"><span class="kpi-ico">${icon(x[1])}</span><div class="kpi-body"><div class="label">${x[2]}</div><strong class="${x[0] === "bal" && saldo < 0 ? "neg" : ""}" title="${x[3]}">${x[3]}</strong>${x[4]}</div></article>`,
      )
      .join("");
  }
  function drawDashboardKpis(rows) {
    if (!state.mes) {
      kpis("#dash-metrics", rows);
      return;
    }
    const snapshot = cashSnapshot(rows, state.mes);
    const selectedLabel = compLabel(state.mes).split(" /")[0];
    const previous = previousMonth(state.mes);
    const previousParts = previous.split("-");
    const previousLabel =
      previousParts[0] === state.mes.split("-")[0]
        ? MESES[Number(previousParts[1]) - 1]
        : compLabel(previous);
    const items = [
      [
        "in",
        "down",
        `Ficou em ${previousLabel}`,
        fmt(snapshot.prior),
        `Saldo acumulado até ${compLabel(previous)}`,
      ],
      [
        "cash-in",
        "arrow",
        `Entrada ${selectedLabel}`,
        fmt(snapshot.entries),
        "Total de recebimentos efetivos do mês",
      ],
      [
        "out",
        "arrow",
        `Saída ${selectedLabel}`,
        fmt(snapshot.exits),
        "Pagamentos e despesas do mês",
      ],
      [
        "bal",
        "database",
        `Saldo ${selectedLabel}`,
        fmt(snapshot.final),
        "Saldo anterior + entradas − saídas",
      ],
    ];
    $("#dash-metrics").innerHTML = items
      .map(
        (item) =>
          `<article class="kpi ${item[0]}"><span class="kpi-ico">${icon(item[1])}</span><div class="kpi-body"><div class="label">${esc(item[2])}</div><strong class="${item[0] === "bal" && snapshot.final < 0 ? "neg" : ""}" title="${esc(item[3])}">${item[3]}</strong><small>${esc(item[4])}</small></div></article>`,
      )
      .join("");
  }
  function cashSummaryTable() {
    const rows = subdivisions.map((company) => {
      const companyRows = db.finance.filter(
        (record) => record.sub === company,
      );
      return [company, cashSnapshot(companyRows, state.mes)];
    });
    const total = cashSnapshot(db.finance, state.mes);
    const priorCell = (value) =>
      value == null ? '<span class="muted">—</span>' : n2(value);
    const unknownEntries = rows.reduce(
      (sum, [, snapshot]) => sum + snapshot.unknownEntries.length,
      0,
    );
    const unknownExits = rows.reduce(
      (sum, [, snapshot]) => sum + snapshot.unknownExits.length,
      0,
    );
    const note =
      unknownEntries || unknownExits
        ? `<div class="cash-reconcile-note">${icon("info")}<span>${unknownEntries + unknownExits} movimentação(ões) sem data efetiva aguardam conciliação e não foram atribuídas ao fluxo mensal.</span></div>`
        : "";
    return `<table class="sum-table data-table cash-summary-table"><thead><tr><th>Empresa</th><th class="num">Saldo Anterior</th><th class="num">Entradas</th><th class="num">Saídas</th><th class="num">Saldo Final</th></tr></thead><tbody>${rows
      .map(
        ([company, snapshot]) =>
          `<tr class="clickable ${state.empresa === company ? "sel" : ""}" data-select-company="${esc(company)}" title="Filtrar painel por ${esc(company)}"><td><b>${esc(company)}</b></td><td class="amount">${priorCell(snapshot.prior)}</td><td class="amount">${n2(snapshot.entries)}</td><td class="amount">${n2(snapshot.exits)}</td><td class="amount ${snapshot.final < 0 ? "neg" : ""}">${n2(snapshot.final)}</td></tr>`,
      )
      .join("")}</tbody><tfoot><tr><td>Total</td><td class="amount">${priorCell(total.prior)}</td><td class="amount">${n2(total.entries)}</td><td class="amount">${n2(total.exits)}</td><td class="amount ${total.final < 0 ? "neg" : ""}">${n2(total.final)}</td></tr></tfoot></table>${note}`;
  }
  function cashBucket(rows, start, end, label, fullLabel) {
    const ledger = cashLedger(rows);
    const launches = rows.filter(
      (record) =>
        finKind(record) === "receita" &&
        isFinancialDate(record.data) &&
        record.data >= start &&
        record.data < end,
    );
    const entries = ledger.entries.filter(
      (event) => event.data && event.data >= start && event.data < end,
    );
    const exits = ledger.exits.filter(
      (event) => event.data && event.data >= start && event.data < end,
    );
    const ids = new Set([
      ...launches.map((record) => record.id),
      ...entries.map((event) => event.rowId),
      ...exits.map((event) => event.rowId),
    ]);
    return {
      lab: label,
      fullLabel,
      rowCount: ids.size,
      t: {
        prev: launches.reduce(
          (sum, record) => sum + money(record.previsto),
          0,
        ),
        rec: entries.reduce((sum, event) => sum + event.value, 0),
        recReceita: entries
          .filter((event) => event.kind === "receita")
          .reduce((sum, event) => sum + event.value, 0),
        recExtra: entries
          .filter((event) => event.kind === "entrada_por_fora")
          .reduce((sum, event) => sum + event.value, 0),
        sai: exits.reduce((sum, event) => sum + event.value, 0),
      },
    };
  }
  function drawCashMovement(rows) {
    const el = $("#dash-chart");
    if (!el) return;
    const snapshot = cashSnapshot(rows, state.mes);
    const stats = dashboardPeriodStats(rows, state.mes);
    let data = [];
    if (state.mes) {
      const bounds = monthBounds(state.mes);
      const [year, monthNumber] = state.mes.split("-").map(Number);
      const days = new Date(year, monthNumber, 0).getDate();
      const ranges = [
        [1, 7],
        [8, 14],
        [15, 21],
        [22, 28],
        [29, days],
      ].filter(([start]) => start <= days);
      const pad = (value) => String(value).padStart(2, "0");
      data = ranges.map(([startDay, endDay]) =>
        cashBucket(
          rows,
          `${state.mes}-${pad(startDay)}`,
          endDay === days ? bounds.end : `${state.mes}-${pad(endDay + 1)}`,
          `${pad(startDay)}–${pad(endDay)}`,
          `${pad(startDay)} a ${pad(endDay)} de ${compLabel(state.mes)}`,
        ),
      );
    } else {
      data = compOptions()
        .slice()
        .reverse()
        .map((reference) => {
          const bounds = monthBounds(reference);
          const [year, monthNumber] = reference.split("-");
          return cashBucket(
            rows,
            bounds.start,
            bounds.end,
            `${MESES[Number(monthNumber) - 1].slice(0, 3)}/${year.slice(2)}`,
            compLabel(reference),
          );
        });
    }
    let runningBalance = state.mes ? snapshot.prior : 0;
    data.forEach((bucket) => {
      runningBalance += bucket.t.rec - bucket.t.sai;
      bucket.closing = runningBalance;
    });
    const touched = rows.filter((record) => stats.rowIds.has(record.id));
    const receitas = touched.filter((record) => finKind(record) === "receita").length;
    const entradasFora = touched.filter(
      (record) => finKind(record) === "entrada_por_fora",
    ).length;
    const saidas = touched.filter((record) => finKind(record) === "saida").length;
    const pct = stats.previsto
      ? Math.round((stats.recebidoReceitas / stats.previsto) * 100)
      : stats.recebidoReceitas
        ? 100
        : 0;
    const compactFmt = (value) =>
      (Number(value) || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        notation: Math.abs(Number(value) || 0) >= 1000 ? "compact" : "standard",
        maximumFractionDigits: 1,
      });
    const max = Math.max(
      1,
      ...data.flatMap((bucket) => [bucket.t.prev, bucket.t.rec, bucket.t.sai]),
    );
    const height = (value) =>
      value > 0 ? Math.max(1.5, (value / max) * 100).toFixed(2) : 0;
    const detail = (bucket) =>
      `${bucket.fullLabel}\n${bucket.rowCount} lançamento(s)\nPrevisto: ${fmt(bucket.t.prev)}\nRecebido: ${fmt(bucket.t.rec)}\nEntrada por fora: ${fmt(bucket.t.recExtra)}\nSaídas: ${fmt(bucket.t.sai)}\nSaldo acumulado: ${fmt(bucket.closing)}`;
    const unknownCount =
      snapshot.unknownEntries.length + snapshot.unknownExits.length;
    const unknownIds = [
      ...new Set(
        [...snapshot.unknownEntries, ...snapshot.unknownExits].map(
          (event) => event.rowId,
        ),
      ),
    ];
    el.innerHTML = `<div class="mchart">
      <div class="mchart-context">
        <div><span>Empresa</span><strong>${esc(state.empresa || "Todas as empresas")}</strong></div>
        <div><span>Período</span><strong>${esc(compLabel(state.mes))}</strong></div>
        <div><span>Lançamentos</span><strong>${stats.rowCount}</strong><small>${receitas} receita(s) · ${entradasFora} entrada(s) por fora · ${saidas} saída(s)</small></div>
      </div>
      <div class="mchart-kpis">
        <div><span>Previsto</span><strong>${fmt(stats.previsto)}</strong></div>
        <div class="is-received"><span>Recebido</span><strong>${fmt(stats.recebido)}</strong><small>${pct}% do previsto${stats.entradaPorFora ? ` · ${fmt(stats.entradaPorFora)} por fora` : ""}</small></div>
        <div class="is-pending"><span>Pendente</span><strong>${fmt(stats.pending)}</strong></div>
        <div class="is-expense"><span>Saídas</span><strong>${fmt(stats.saidas)}</strong></div>
        <div class="${snapshot.final < 0 ? "is-negative" : "is-balance"}"><span>Saldo final</span><strong>${fmt(snapshot.final)}</strong></div>
      </div>
      <div class="mchart-scroll"><div class="mchart-canvas" style="--chart-cols:${Math.max(data.length, 1)}">
        <div class="mchart-plot">${data
          .map(
            (bucket) => `<div class="mbars" tabindex="0" aria-label="${esc(detail(bucket))}" data-chart-detail="${esc(detail(bucket))}">
              <span class="mbar"><em>${compactFmt(bucket.t.prev)}</em><i class="p" style="height:${height(bucket.t.prev)}%" title="Previsto ${fmt(bucket.t.prev)}"></i></span>
              <span class="mbar"><em>${compactFmt(bucket.t.rec)}</em><i class="r" style="height:${height(bucket.t.rec)}%" title="Recebido ${fmt(bucket.t.rec)}"></i></span>
              <span class="mbar"><em>${compactFmt(bucket.t.sai)}</em><i class="s" style="height:${height(bucket.t.sai)}%" title="Saídas ${fmt(bucket.t.sai)}"></i></span>
            </div>`,
          )
          .join("")}</div>
        <div class="mlabels">${data
          .map(
            (bucket) => `<span><b>${bucket.lab}</b><small>${bucket.rowCount} lançamento(s)</small><em class="${bucket.closing < 0 ? "neg" : ""}">Saldo ${compactFmt(bucket.closing)}</em></span>`,
          )
          .join("")}</div>
      </div></div>
      <div class="mchart-legend"><span><i class="p"></i>Previsto</span><span><i class="r"></i>Recebido</span><span><i class="s"></i>Saídas</span><span>Escala máxima: ${fmt(max)}</span>${unknownCount ? `<button type="button" class="mchart-reconcile" data-reconcile-go="${esc(unknownIds.join(","))}" title="Ver estes lançamentos em Lançamentos">${unknownCount} movimentação(ões) aguardam conciliação de data</button>` : ""}<span class="mchart-help">Passe o mouse ou toque nas barras para ver todos os valores.</span></div>
    </div>`;
  }
  function companyTiles(where) {
    const el = $(where);
    if (!el) return;
    el.innerHTML =
      `<button type="button" class="co-tile ${!state.empresa ? "selected" : ""}" data-select-company="">${icon("grid")}<span>Consolidado</span></button>` +
      subdivisions
        .map(
          (n) =>
            `<button type="button" class="co-tile ${state.empresa === n ? "selected" : ""}" data-select-company="${esc(n)}">${icon("building")}<b>${esc(n)}</b></button>`,
        )
        .join("");
  }
  function summaryTable(full) {
    const inMonth = db.finance.filter(
      (r) => !state.mes || month(r.data) === state.mes,
    );
    const list = subdivisions.map((n) => {
      const rr = inMonth.filter((r) => r.sub === n);
      return [n, rr.length, totals(rr)];
    });
    const all = totals(inMonth);
    return `<table class="sum-table data-table"><thead><tr><th>Empresa</th>${full ? '<th class="num">Lançamentos</th>' : ""}<th class="num">Previsto (R$)</th><th class="num">Recebido (R$)</th><th class="num">Despesas (R$)</th><th class="num">Saldo (R$)</th>${full ? '<th class="action-cell"></th>' : ""}</tr></thead><tbody>${list.map(([n, c, t]) => `<tr class="${full ? "" : "clickable"} ${state.empresa === n ? "sel" : ""}" ${full ? "" : `data-select-company="${esc(n)}" title="Ver ${esc(n)} no painel"`}><td><b>${esc(n)}</b></td>${full ? `<td class="amount">${c}</td>` : ""}<td class="amount">${n2(t.prev)}</td><td class="amount">${n2(t.rec)}</td><td class="amount">${n2(t.sai)}</td><td class="amount ${t.rec - t.sai < 0 ? "neg" : ""}">${n2(t.rec - t.sai)}</td>${full ? `<td class="action-cell"><button type="button" class="edit-action" data-company-go="${esc(n)}">Ver lançamentos</button></td>` : ""}</tr>`).join("")}</tbody><tfoot><tr><td>Total</td>${full ? `<td class="amount">${inMonth.length}</td>` : ""}<td class="amount">${n2(all.prev)}</td><td class="amount">${n2(all.rec)}</td><td class="amount">${n2(all.sai)}</td><td class="amount">${n2(all.rec - all.sai)}</td>${full ? "<td></td>" : ""}</tr></tfoot></table>`;
  }
  function movChart(rows) {
    const el = $("#dash-chart");
    if (!el) return;
    if (!rows.length) {
      el.innerHTML = `<div class="chart-empty">${icon("chart")}<strong>Sem movimentação no período</strong><p>Registre lançamentos para visualizar o gráfico.</p></div>`;
      return;
    }
    let data;
    if (!state.mes) {
      const months = [
        ...new Set(
          rows.map((r) => month(r.data)).filter((m) => /^\d{4}-\d{2}$/.test(m)),
        ),
      ].sort();
      data = months.map((m) => {
        const [y, mm] = m.split("-");
        const lab =
          (MESES[Number(mm) - 1] || mm).slice(0, 3) + "/" + String(y).slice(2);
        const periodRows = rows.filter((r) => month(r.data) === m);
        return {
          lab,
          fullLabel: compLabel(m),
          rows: periodRows,
          t: totals(periodRows),
        };
      });
    } else {
      const p = state.mes.split("-").map(Number);
      const days = new Date(p[0], p[1], 0).getDate();
      const b = [
        [1, 7],
        [8, 14],
        [15, 21],
        [22, 28],
        [29, days],
      ].filter(([a]) => a <= days);
      const pad = (n) => String(n).padStart(2, "0");
      data = b.map(([a, z]) => {
        const rr = rows.filter((r) => {
          const d = Number(String(r.data).slice(8, 10));
          return d >= a && d <= z;
        });
        return {
          lab: `${pad(a)}–${pad(z)}`,
          fullLabel: `${pad(a)} a ${pad(z)} de ${compLabel(state.mes)}`,
          rows: rr,
          t: totals(rr),
        };
      });
    }
    const total = totals(rows);
    const saldo = total.rec - total.sai;
    const pendente = Math.max(0, total.prev - total.recReceita);
    const recebidoPct = total.prev
      ? Math.round((total.recReceita / total.prev) * 100)
      : total.recReceita
        ? 100
        : 0;
    const receitas = rows.filter((r) => finKind(r) === "receita").length;
    const entradasFora = rows.filter(
      (r) => finKind(r) === "entrada_por_fora",
    ).length;
    const despesas = rows.filter((r) => finKind(r) === "saida").length;
    const compactFmt = (value) =>
      (Number(value) || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        notation: Math.abs(Number(value) || 0) >= 1000 ? "compact" : "standard",
        maximumFractionDigits: 1,
      });
    const max = Math.max(
      1,
      ...data.flatMap((d) => [d.t.prev, d.t.rec, d.t.sai]),
    );
    const h = (v) => (v > 0 ? Math.max(1.5, (v / max) * 100).toFixed(2) : 0);
    const detail = (d) => {
      const periodSaldo = d.t.rec - d.t.sai;
      const periodPendente = Math.max(0, d.t.prev - d.t.recReceita);
      const periodPct = d.t.prev
        ? Math.round((d.t.recReceita / d.t.prev) * 100)
        : d.t.recReceita
          ? 100
          : 0;
      return `${d.fullLabel}\n${d.rows.length} lançamento(s)\nPrevisto: ${fmt(d.t.prev)}\nRecebido de receitas: ${fmt(d.t.recReceita)} (${periodPct}%)\nEntradas por fora: ${fmt(d.t.recExtra)}\nTotal recebido: ${fmt(d.t.rec)}\nPendente: ${fmt(periodPendente)}\nSaídas: ${fmt(d.t.sai)}\nSaldo: ${fmt(periodSaldo)}`;
    };
    el.innerHTML = `<div class="mchart">
      <div class="mchart-context">
        <div><span>Empresa</span><strong>${esc(state.empresa || "Todas as empresas")}</strong></div>
        <div><span>Período</span><strong>${esc(compLabel(state.mes))}</strong></div>
        <div><span>Lançamentos</span><strong>${rows.length}</strong><small>${receitas} receita(s) · ${entradasFora} entrada(s) por fora · ${despesas} saída(s)</small></div>
      </div>
      <div class="mchart-kpis">
        <div><span>Previsto</span><strong>${fmt(total.prev)}</strong></div>
        <div class="is-received"><span>Recebido</span><strong>${fmt(total.rec)}</strong><small>${recebidoPct}% do previsto${total.recExtra ? ` · ${fmt(total.recExtra)} por fora` : ""}</small></div>
        <div class="is-pending"><span>Pendente</span><strong>${fmt(pendente)}</strong></div>
        <div class="is-expense"><span>Saídas</span><strong>${fmt(total.sai)}</strong></div>
        <div class="${saldo < 0 ? "is-negative" : "is-balance"}"><span>Saldo líquido</span><strong>${fmt(saldo)}</strong></div>
      </div>
      <div class="mchart-scroll">
        <div class="mchart-canvas" style="--chart-cols:${Math.max(data.length, 1)}">
          <div class="mchart-plot">${data
            .map(
              (d) => `<div class="mbars" tabindex="0" aria-label="${esc(detail(d))}" data-chart-detail="${esc(detail(d))}">
                <span class="mbar"><em>${compactFmt(d.t.prev)}</em><i class="p" style="height:${h(d.t.prev)}%" title="Previsto ${fmt(d.t.prev)}"></i></span>
                <span class="mbar"><em>${compactFmt(d.t.rec)}</em><i class="r" style="height:${h(d.t.rec)}%" title="Recebido ${fmt(d.t.rec)}"></i></span>
                <span class="mbar"><em>${compactFmt(d.t.sai)}</em><i class="s" style="height:${h(d.t.sai)}%" title="Saídas ${fmt(d.t.sai)}"></i></span>
              </div>`,
            )
            .join("")}</div>
          <div class="mlabels">${data
            .map(
              (d) => `<span><b>${d.lab}</b><small>${d.rows.length} lançamento(s)</small><em class="${d.t.rec - d.t.sai < 0 ? "neg" : ""}">Saldo ${compactFmt(d.t.rec - d.t.sai)}</em></span>`,
            )
            .join("")}</div>
        </div>
      </div>
      <div class="mchart-legend"><span><i class="p"></i>Previsto</span><span><i class="r"></i>Recebido</span><span><i class="s"></i>Saídas</span><span>Escala máxima: ${fmt(max)}</span><span class="mchart-help">Passe o mouse ou toque nas barras para ver todos os valores.</span></div>
    </div>`;
  }
  function drawEmpresas() {
    const el = $("#emp-table");
    if (!el) return;
    $("#emp-filters").innerHTML =
      `<div class="field" style="flex:0 1 240px"><label>Competência</label><select class="control" data-comp><option value="" ${!state.mes ? "selected" : ""}>Todo o período</option>${compOptions()
        .map(
          (m) =>
            `<option value="${m}" ${m === state.mes ? "selected" : ""}>${compLabel(m)}</option>`,
        )
        .join("")}</select></div>`;
    el.innerHTML = summaryTable(true);
  }
  function contasFilters(id) {
    const cm = state.contasMes ?? state.mes;
    $(id).innerHTML =
      `<div class="field"><label>Competência</label><select class="control" data-contas-mes><option value="" ${!cm ? "selected" : ""}>Todos os meses</option>${compOptions()
        .map(
          (m) =>
            `<option value="${m}" ${m === cm ? "selected" : ""}>${compLabel(m)}</option>`,
        )
        .join(
          "",
        )}</select></div><div class="field"><label>Empresa</label><select class="control" data-contas-emp><option value="">Todas</option>${subdivisions.map((s) => `<option value="${esc(s)}" ${state.empresa === s ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></div>`;
  }
  const contasRows = () => {
    const cm = state.contasMes ?? state.mes;
    return db.finance
      .filter(
        (r) =>
          (!cm || month(r.data) === cm) &&
          (!state.empresa || r.sub === state.empresa),
      )
      .sort((a, b) => String(b.data).localeCompare(String(a.data)));
  };
  function drawReceber() {
    const el = $("#rec-table");
    if (!el) return;
    contasFilters("#rec-filters");
    const rows = contasRows().filter(
      (r) =>
        finKind(r) === "receita" && money(r.previsto) > money(r.recebido),
    );
    const prev = rows.reduce((n, r) => n + money(r.previsto), 0),
      rec = rows.reduce((n, r) => n + money(r.recebido), 0);
    $("#rec-summary").innerHTML =
      hs("Lançamentos em aberto", rows.length) +
      hs("Previsto", fmt(prev)) +
      hs("Já recebido", fmt(rec)) +
      hs("Pendente", fmt(prev - rec));
    el.innerHTML = `<table><thead><tr><th>Data</th><th>Empresa</th><th>Parceiro</th><th>Centro de custo</th><th>Previsto</th><th>Recebido</th><th>Pendente</th><th>Situação</th><th class="action-cell"></th></tr></thead><tbody>${
      rows
        .map((r) => {
          const st = finStatus(r);
          return `<tr><td>${dateBR(r.data)}</td><td><b>${esc(r.sub || "—")}</b></td><td>${esc(r.parceiro)}</td><td>${esc(r.centro || "—")}</td><td class="amount">${fmt(r.previsto)}</td><td class="amount">${fmt(r.recebido)}</td><td class="amount"><b>${fmt(money(r.previsto) - money(r.recebido))}</b></td><td><span class="pill ${st[1]}">${st[0]}</span></td><td class="action-cell"><button type="button" class="edit-action" data-edit-fin="${esc(r.id)}">${icon("edit")}Editar</button></td></tr>`;
        })
        .join("") || noRows("Nenhuma conta a receber em aberto.", 9)
    }</tbody></table>`;
  }
  function drawPagar() {
    const el = $("#pag-table");
    if (!el) return;
    contasFilters("#pag-filters");
    const rows = contasRows().filter((r) => money(r.saida) > 0);
    const total = rows.reduce((n, r) => n + money(r.saida), 0),
      comp = rows.filter((r) => (r.anexos || []).length).length;
    $("#pag-summary").innerHTML =
      hs("Pagamentos", rows.length) +
      hs("Total de saídas", fmt(total)) +
      hs("Com comprovante", comp) +
      hs("Sem comprovante", rows.length - comp);
    el.innerHTML = `<table><thead><tr><th>Data</th><th>Empresa</th><th>Parceiro</th><th>Centro de custo</th><th>Valor</th><th>Comprovantes</th><th class="action-cell"></th></tr></thead><tbody>${rows.map((r) => `<tr><td>${dateBR(r.data)}</td><td><b>${esc(r.sub || "—")}</b></td><td>${esc(r.parceiro)}</td><td>${esc(r.centro || "—")}</td><td class="amount">${fmt(r.saida)}</td><td>${fileCell(r.anexos, "fin:" + r.id)}</td><td class="action-cell"><button type="button" class="edit-action" data-edit-fin="${esc(r.id)}">${icon("edit")}Editar</button></td></tr>`).join("") || noRows("Nenhuma saída registrada.", 7)}</tbody></table>`;
  }
  function updateBell() {
    const t = todayISO();
    const open = db.tasks.filter((x) => x.status !== "Concluída" && x.prazo);
    const late = open.filter((x) => x.prazo < t).length,
      soon = open.filter(
        (x) => x.prazo >= t && daysBetween(t, x.prazo) <= 7,
      ).length;
    const d = $("#bell-dot");
    if (d) d.classList.toggle("on", late + soon > 0);
    const b = $("#bell-btn");
    if (b)
      b.title =
        late || soon
          ? `${late} tarefa(s) em atraso · ${soon} vencendo em 7 dias`
          : "Nenhum prazo crítico";
  }
  /* Usuário e navegação entre sistemas (vem da página que hospeda o iframe) */
  const MB = {
    nome: "Usuário",
    admin: false,
    userId: "",
    embed: window.parent !== window,
  };
  function toParent(msg) {
    if (!MB.embed) return;
    try {
      window.parent.postMessage(msg, location.origin);
    } catch {}
  }
  function drawUser() {
    const w = MB.nome.trim().split(/\s+/).filter(Boolean);
    const ini = (
      (w[0] || "?")[0] + (w.length > 1 ? w[w.length - 1][0] : "")
    ).toUpperCase();
    $("#user-ini").textContent = ini;
    $("#user-name").textContent = MB.nome;
    const links = MB.admin
      ? [
          ["nerites", "Sistema Nerites"],
          ["mr-terceiriza", "Empresas"],
          ["painel-do-mandato", "Painel do Mandato"],
        ]
      : [];
    const h = links
      .map(([id, n]) => `<button type="button" data-site="${id}">${n}</button>`)
      .join("");
    $("#site-links").innerHTML = h;
    $("#um-links").innerHTML = h;
    $("#um-links").hidden = !h;
    $("#um-sair").hidden = !MB.embed;
  }
  const userMenu = (open) => {
    const m = $("#user-menu");
    m.hidden = !open;
    $("#user-btn").setAttribute("aria-expanded", String(open));
  };
  window.addEventListener("message", (e) => {
    if (e.origin !== location.origin) return;
    const d = e.data || {};
    if (d.type === "mb-user") {
      MB.nome = String(d.nome || MB.nome);
      MB.admin = !!d.admin;
      MB.userId = String(d.userId || MB.userId || "");
      drawUser();
    }
    if (d.type === "mb-hydrate" && d.payload) {
      const p = d.payload;
      if (hasPendingMutations()) {
        applyCloudDbPreservingPending(p);
        toast("Reenviando alterações pendentes…");
        scheduleCloudSave();
      } else {
        applyCloudDb(p);
        toast("Dados sincronizados");
      }
    }
    if (d.type === "mb-persist-ok") {
      const batch = cloudPending[d.requestId];
      delete cloudPending[d.requestId];
      acknowledgeMutationBatch(batch);
      persistBusyRetries = 0;
      toast("Salvo na nuvem");
      if (hasPendingMutations()) scheduleCloudSave();
    }
    if (d.type === "mb-persist-erro") {
      delete cloudPending[d.requestId];
      const persistErroMsg = d.erro || "Falha ao salvar na nuvem";
      if (/em andamento/i.test(persistErroMsg) && persistBusyRetries < 20) {
        persistBusyRetries++;
        scheduleCloudSave();
      } else {
        persistBusyRetries = 0;
        toast(persistErroMsg);
      }
    }
    if (d.type === "mb-retry-save") scheduleCloudSave();
    if (d.type === "mb-file-data" && d.requestId && fileWait[d.requestId]) {
      fileWait[d.requestId].resolve(d);
      delete fileWait[d.requestId];
    }
    if (d.type === "mb-file-erro" && d.requestId && fileWait[d.requestId]) {
      fileWait[d.requestId].reject(new Error(d.erro || "erro arquivo"));
      delete fileWait[d.requestId];
    }
  });
  document.addEventListener("click", (e) => {
    const cg = e.target.closest("[data-company-go]");
    if (cg) {
      state.empresa = cg.dataset.companyGo;
      goto("financeiro");
      return;
    }
    const rg = e.target.closest("[data-reconcile-go]");
    if (rg) {
      const ids = rg.dataset.reconcileGo.split(",").filter(Boolean);
      state.finReconcileIds = new Set(ids);
      state.mes = "";
      state.finType = "";
      state.finStatus = "";
      state.finCost = "";
      state.pesquisa = "";
      state.finPage = 1;
      goto("financeiro");
      return;
    }
    if (e.target.closest("#fin-reconcile-clear")) {
      state.finReconcileIds = null;
      state.finPage = 1;
      render();
      return;
    }
    const qd = e.target.closest("[data-open-despesa]");
    if (qd) {
      openModal("finance");
      $("#modal-title").textContent = "Nova despesa / pagamento";
      const type = $('#modal-form [name="tipoLancamento"]');
      if (type) {
        type.value = "saida";
        type.dispatchEvent(new Event("change"));
      }
      const s = $('#modal-form [name="saida"]');
      if (s) setTimeout(() => s.focus(), 80);
      return;
    }
    const st = e.target.closest("[data-site]");
    if (st) {
      userMenu(false);
      toParent({ type: "mb-nav", site: st.dataset.site });
      return;
    }
    if (e.target.closest("#user-btn")) {
      userMenu($("#user-menu").hidden);
      return;
    }
    if (e.target.closest("#um-sair")) {
      userMenu(false);
      toParent({ type: "mb-sair" });
      return;
    }
    if (!e.target.closest("#user-menu")) userMenu(false);
    if (e.target.closest("#bell-btn")) goto("demandas");
  });
  document.addEventListener("change", (e) => {
    const t = e.target;
    if (!t.matches) return;
    if (t.matches("[data-comp]")) {
      state.mes = t.value;
      render();
    } else if (t.matches("[data-contas-mes]")) {
      state.contasMes = t.value;
      render();
    } else if (t.matches("[data-contas-emp]")) {
      state.empresa = t.value;
      render();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") userMenu(false);
  });
  drawUser();

  render();
  toParent({ type: "mb-pronto" });
})();
