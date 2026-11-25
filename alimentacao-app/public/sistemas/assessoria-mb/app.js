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
  /** Padrão dos lançamentos: texto sempre em maiúsculas. */
  const caps = (s) =>
    String(s ?? "")
      .trim()
      .toLocaleUpperCase("pt-BR");
  const FIN_CAPS_FIELDS = ["parceiro", "empresaDepositante", "observacao"];
  function withFinanceCaps(row) {
    if (!row || typeof row !== "object") return row;
    const next = { ...row };
    for (const key of FIN_CAPS_FIELDS) next[key] = caps(next[key]);
    return next;
  }
  function normalizeFinanceCaps(list, { mark = false } = {}) {
    if (!Array.isArray(list)) return 0;
    let changed = 0;
    for (let i = 0; i < list.length; i++) {
      const row = list[i];
      if (!row) continue;
      const next = withFinanceCaps(row);
      const dirty = FIN_CAPS_FIELDS.some(
        (key) => String(row[key] || "") !== String(next[key] || ""),
      );
      if (!dirty) continue;
      list[i] = next;
      changed++;
      if (mark && next.id) markMutation("financeUpserts", next.id);
    }
    return changed;
  }
  function wireFinanceCapsInputs() {
    for (const name of FIN_CAPS_FIELDS) {
      const el = $(`#modal-body [name="${name}"]`);
      if (!el) continue;
      el.classList.add("caps-input");
      el.addEventListener("input", () => {
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const next = String(el.value || "").toLocaleUpperCase("pt-BR");
        if (el.value === next) return;
        el.value = next;
        try {
          if (start != null && end != null) el.setSelectionRange(start, end);
        } catch {
          /* ignore */
        }
      });
    }
  }
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
    pendentes: "Pendentes",
    demandas: "Demandas e tarefas",
    minhas: "Minhas tarefas",
    anexos: "Comprovantes",
    auditoria: "Auditoria",
    "sem-data-recebida": "Sem Data Recebida",
    duplicados: "Lançamentos duplicados",
    configuracoes: "Configurações",
  };
  let monthlyHistory = [];
  const raw = [];
  const initial = () => ({ finance: [], tasks: [], audit: [] });
  const KEY = "assessoria-mb-demo-v4";
  const PENDING_KEY = "assessoria-mb-pending-v1";
  let COST_CODES = ["M1", "M2", "M3", "M4", "M5"];
  /** Ordem natural: M1, M2, M3… (sem centro no fim). */
  const compareCentro = (a, b) => {
    const left = String(a || "").trim();
    const right = String(b || "").trim();
    const leftEmpty = !left || /^sem centro$/i.test(left);
    const rightEmpty = !right || /^sem centro$/i.test(right);
    if (leftEmpty && rightEmpty) return 0;
    if (leftEmpty) return 1;
    if (rightEmpty) return -1;
    return left.localeCompare(right, "pt-BR", {
      numeric: true,
      sensitivity: "base",
    });
  };
  function refreshCostCodes() {
    if (typeof db === "undefined" || !db) return;
    if (!db.centers || typeof db.centers !== "object") db.centers = {};
    const keys = Object.keys(db.centers)
      .map((s) => String(s).trim())
      .filter(Boolean);
    if (keys.length) {
      COST_CODES = keys.sort(compareCentro);
    } else {
      COST_CODES = ["M1", "M2", "M3", "M4", "M5"];
      for (const c of COST_CODES) {
        if (db.centers[c] == null) db.centers[c] = "";
      }
    }
  }
  const isEmbed = window.parent !== window;
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
  let page = "dashboard",
    typeModal = "",
    editing = null;
  let removedAttachments = new Set();
  // No iframe, o localStorage pode ressuscitar lançamentos já excluídos no
  // banco até o mb-hydrate. Mantém só o que ainda tem upsert pendente.
  let awaitingCloudHydrate = isEmbed;
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
  if (isEmbed) {
    const keepFin = new Set(Object.keys(pendingMutations.financeUpserts || {}));
    const keepTask = new Set(Object.keys(pendingMutations.taskUpserts || {}));
    db.finance = db.finance.filter((r) => keepFin.has(r.id));
    db.tasks = Array.isArray(db.tasks)
      ? db.tasks.filter((t) => keepTask.has(t.id))
      : [];
  }
  refreshCostCodes();
  refreshCompanies();
  if (normalizeFinanceCaps(db.finance, { mark: true })) {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch {
      /* ignore */
    }
  }
  const state = {
    mes: "",
    demanda: "",
    pesquisa: "",
    finType: "",
    finStatus: "",
    finCost: "",
    finBank: "",
    finReconcileIds: null,
    finSelectionLabel: "",
    finSelectionKey: "",
    finSort: "desc",
    finSortBy: "data",
    finPage: 1,
    finPageSize: 5,
    finView: "table",
    finFiltersOpen: true,
    taskStatus: "",
    empresa: "",
    dashTipo: "",
    dashShowZero: false,
    dashSummarySortBy: "",
    dashSummarySort: "asc",
    dashMenuOpen: false,
    dashDe: "",
    dashAte: "",
    dashEmpQ: "",
    dashRecQ: "",
    dashRecSortBy: "",
    dashRecSort: "desc",
    dashColF: {},
    pendCost: "",
    pendSit: "",
    pendQ: "",
    pendSort: "falta:desc",
    pendPage: 1,
    pendPer: "10",
    pendFiltersOpen: true,
    historyQuery: "",
    finHistPeriod: "all",
    finHistMonth: "",
    finHistYear: new Date().toLocaleDateString("en-CA").slice(0, 4),
    finHistWeek: new Date().toLocaleDateString("en-CA"),
    finHistFrom: "",
    finHistTo: "",
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
    accountPeriod: "month",
    accountMonth: new Date().toLocaleDateString("en-CA").slice(0, 7),
    accountYear: new Date().toLocaleDateString("en-CA").slice(0, 4),
    accountWeek: new Date().toLocaleDateString("en-CA"),
    accountFrom: "",
    accountTo: "",
    accountCompany: "",
    accountFiles: "all",
    accountQuery: "",
  };
  if (state.empresa === "__ref__") state.empresa = "";
  if (state.finHistCompany === "__ref__") state.finHistCompany = "";
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
    const capsFixed = normalizeFinanceCaps(db.finance, { mark: true });
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch {}
    render();
    if (capsFixed) scheduleCloudSave();
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
    const capsFixed = normalizeFinanceCaps(db.finance, { mark: true });
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch {}
    render();
    if (capsFixed) scheduleCloudSave();
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
  /** Exclusão financeira permanente: somente administradores e editores. */
  function canDeleteFinance() {
    return MB.admin || MB.editor;
  }
  function deleteBtn(kind, id) {
    return `<button class='edit-action danger' type='button' data-delete-${kind}='${esc(id)}'>Excluir</button>`;
  }
  const pick = (arr, key, v) => !v || arr[key] === v;
  const month = (d) => String(d || "").slice(0, 7);
  function financeFiltered() {
    const auditIds = state.finReconcileIds;
    return db.finance.filter(
      (r) =>
        (auditIds || !state.mes || month(r.data) === state.mes) &&
        (!state.empresa || r.sub === state.empresa) &&
        (page !== "financeiro" ||
          ((!auditIds || auditIds.has(r.id)) &&
            (!state.finType || finTipo(r) === state.finType) &&
            (!state.finStatus || finStatus(r)[0] === state.finStatus) &&
            (!state.finCost || r.centro === state.finCost) &&
            (!state.finBank || (r.contaBancaria || "") === state.finBank) &&
            (!state.pesquisa ||
              [
                r.parceiro,
                r.centro,
                r.empresaDepositante,
                r.contaBancaria,
                r.demanda,
                r.sub,
              ]
                .join(" ")
                .toLocaleLowerCase("pt-BR")
                .includes(state.pesquisa.toLocaleLowerCase("pt-BR"))))),
    );
  }
  function financeAuditScope(source) {
    if (source === "dashboard")
      return db.finance.filter((record) =>
        state.empresa
          ? record.sub === state.empresa
          : subdivisions.includes(record.sub),
      );
    return db.finance.filter(
      (record) =>
        (!state.empresa || record.sub === state.empresa) &&
        (!state.finType || finTipo(record) === state.finType) &&
        (!state.finStatus || finStatus(record)[0] === state.finStatus) &&
        (!state.finCost || record.centro === state.finCost) &&
        (!state.finBank || (record.contaBancaria || "") === state.finBank) &&
        (!state.pesquisa ||
          [
            record.parceiro,
            record.centro,
            record.empresaDepositante,
            record.contaBancaria,
            record.demanda,
            record.sub,
          ]
            .join(" ")
            .toLocaleLowerCase("pt-BR")
            .includes(state.pesquisa.toLocaleLowerCase("pt-BR"))),
    );
  }
  function financeAuditOrigin(record) {
    if (!state.mes) return "";
    const key = state.finSelectionKey || "";
    // Em "Recebido", o selo segue a data do recebimento (caixa), não a
    // competência do lançamento — assim um lançamento de junho recebido em
    // julho não aparece como "Mês anterior" ao abrir Recebido em julho.
    if (key === "received" || key === "received-total") {
      const bounds = monthBounds(state.mes);
      if (!bounds) return "";
      const receivedInMonth = receiptCashEvents(record).some(
        (event) =>
          event.data && event.data >= bounds.start && event.data < bounds.end,
      );
      return receivedInMonth ? "Do mês" : "Mês anterior";
    }
    if (!isFinancialDate(record.data)) return "";
    return month(record.data) === state.mes ? "Do mês" : "Mês anterior";
  }
  function openFinanceFromKpi(button) {
    const key = button.dataset.finKpi || "";
    const label = button.dataset.finKpiLabel || key;
    const source = button.dataset.finKpiSource || "finance";
    const records = financeKpiRecords(
      financeAuditScope(source),
      source === "dashboard" ? dashRef() : state.mes,
      key,
    );
    state.finReconcileIds = new Set(records.map((record) => record.id));
    state.finSelectionLabel = label;
    state.finSelectionKey = key;
    state.finPage = 1;
    if (source === "dashboard") {
      state.finType = "";
      state.finStatus = "";
      state.finCost = "";
      state.finBank = "";
      state.pesquisa = "";
    }
    goto("financeiro");
  }
  function clearFinanceAuditFilter() {
    state.finReconcileIds = null;
    state.finSelectionLabel = "";
    state.finSelectionKey = "";
    state.finPage = 1;
  }
  /** Após excluir: tira o id do filtro de auditoria sem resetar tela/filtros. */
  function pruneDeletedFinanceId(id) {
    if (!id || !state.finReconcileIds) return;
    state.finReconcileIds.delete(id);
    if (!state.finReconcileIds.size) {
      state.finReconcileIds = null;
      state.finSelectionLabel = "";
      state.finSelectionKey = "";
    }
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
        (a.recReceita += finKind(r) === "receita" ? money(r.recebido) : 0),
        (a.recExtra +=
          finKind(r) === "entrada_por_fora" ? money(r.recebido) : 0),
        (a.sai += money(r.saida)),
        a
      ),
      { prev: 0, rec: 0, recReceita: 0, recExtra: 0, sai: 0 },
    );
  function financeMetricScope() {
    return financeAuditScope("finance");
  }
  function financeMonthTitle(reference) {
    return compLabel(reference).split(" / ")[0];
  }
  function metrics(container) {
    const scope = financeMetricScope();
    const stats = dashboardPeriodStats(scope, state.mes);
    const cash = cashSnapshot(scope, state.mes);
    const selectedMonth = /^\d{4}-\d{2}$/.test(state.mes);
    const priorLabel = selectedMonth
      ? `Ficou em ${financeMonthTitle(previousMonth(state.mes))}`
      : "";
    const periodLabel = selectedMonth
      ? financeMonthTitle(state.mes)
      : "Todo o período";
    const items = [];
    if (selectedMonth)
      items.push([
        "carry",
        "history",
        priorLabel,
        fmt(cash.prior),
        `Saldo transportado para ${periodLabel}`,
        "carry",
      ]);
    items.push(
      [
        "in",
        "down",
        selectedMonth ? `A Receber em ${periodLabel}` : "A Receber",
        fmt(stats.pending),
        selectedMonth
          ? `${fmt(stats.pendingMonth)} referente aos lançamentos de ${periodLabel}`
          : "Valores previstos ainda não recebidos",
        "pending",
      ],
      [
        "ok",
        "check",
        selectedMonth ? `Recebido em ${periodLabel}` : "Recebido",
        fmt(cash.entries),
        "Dinheiro efetivamente recebido no período",
        "received",
      ],
      [
        "out",
        "arrow",
        selectedMonth ? `Saídas em ${periodLabel}` : "Saídas",
        fmt(cash.exits),
        "Pagamentos e despesas do período",
        "out",
      ],
      [
        "bal",
        "database",
        selectedMonth ? `Total em ${periodLabel}` : "Saldo Total",
        fmt(cash.final),
        selectedMonth
          ? "Saldo anterior mais recebimentos menos saídas"
          : "Recebimentos menos saídas",
        "total",
      ],
    );
    const root = $(container);
    root.classList.toggle("is-month", selectedMonth);
    root.innerHTML = items
      .map((x) => {
        const active =
          state.finReconcileIds && state.finSelectionKey === x[5]
            ? " is-active"
            : "";
        return `<button type="button" class="kpi ${x[0]}${active}" data-fin-kpi="${x[5]}" data-fin-kpi-source="finance" data-fin-kpi-label="${esc(x[2])}" title="Ver lançamentos deste indicador"><span class="kpi-ico">${icon(x[1])}</span><span class="kpi-body"><span class="label">${x[2]}</span><strong class="${x[0] === "bal" && cash.final < 0 ? "neg" : ""}" title="${x[3]}">${x[3]}</strong><small>${x[4]}</small></span></button>`;
      })
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
  const launchedAt = (iso) => {
    if (!iso) return null;
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const launchedDateBR = (iso) => {
    const date = launchedAt(iso);
    return date ? date.toLocaleDateString("pt-BR") : "—";
  };
  const timeBR = (iso) => {
    const date = launchedAt(iso);
    return date
      ? date.toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";
  };
  const noRows = (s, col = 5) =>
    `<tr><td colspan="${col}" class="empty">${esc(s)}</td></tr>`;
  /** Período do painel: competência ou intervalo De/Até. */
  const dashRef = () =>
    state.dashDe || state.dashAte
      ? `R:${state.dashDe}:${state.dashAte}`
      : state.mes;
  const launchedDateTimeBR = (iso) => {
    const date = launchedAt(iso);
    if (!date) return "—";
    return `${date.toLocaleDateString("pt-BR")} ${date.toLocaleTimeString(
      "pt-BR",
      { hour: "2-digit", minute: "2-digit" },
    )}`;
  };
  const fold = (v) =>
    String(v ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  /* Colunas filtráveis das tabelas do painel */
  const DASH_COLS = {
    sum: {
      empresa: { label: "Empresa", type: "text" },
      prior: { label: "Saldo Anterior", type: "num" },
      entries: { label: "Entradas", type: "num" },
      exits: { label: "Saídas", type: "num" },
      final: { label: "Saldo Final", type: "num" },
    },
    pend: {
      data: { label: "Data", type: "text" },
      sub: { label: "Empresa", type: "list" },
      parceiro: { label: "Parceiro", type: "text" },
      contato: { label: "Contato", type: "list" },
      centro: { label: "Centro de custo", type: "list" },
      conta: { label: "Conta Bancária", type: "list" },
      prev: { label: "A receber (R$)", type: "num" },
      rec: { label: "Recebido (R$)", type: "num" },
      falta: { label: "Falta receber (R$)", type: "num" },
      sit: { label: "Situação", type: "list" },
      quem: { label: "Quem lançou", type: "list" },
      comp: { label: "Comprovante", type: "list" },
    },
    rec: {
      when: { label: "Data/hora do lançamento", type: "text" },
      user: { label: "Usuário", type: "list" },
      sub: { label: "Empresa", type: "list" },
      desc: { label: "Descrição", type: "text" },
      comp: { label: "Competência", type: "text" },
      tipo: { label: "Tipo", type: "list" },
      valor: { label: "Valor (R$)", type: "num" },
      status: { label: "Status", type: "list" },
    },
  };
  const NUM_FILTERS = [
    ["", "Todos os valores"],
    ["pos", "Somente positivos"],
    ["neg", "Somente negativos"],
    ["zero", "Somente zerados"],
    ["nz", "Diferentes de zero"],
  ];
  const numPass = (value, rule) => {
    const v = Number(value) || 0;
    if (rule === "pos") return v >= 0.005;
    if (rule === "neg") return v <= -0.005;
    if (rule === "zero") return Math.abs(v) < 0.005;
    if (rule === "nz") return Math.abs(v) >= 0.005;
    return true;
  };
  const recValue = (r) =>
    finTipo(r) === "Saída"
      ? money(r.saida)
      : money(r.previsto) || money(r.recebido);
  /** Texto exibido (para busca/filtro) e chave de ordenação de cada coluna. */
  function recCell(r, key) {
    if (key === "when") return launchedDateTimeBR(r.criadoEm);
    if (key === "user") return String(r.criadoPor || "—").toUpperCase();
    if (key === "sub") return r.sub || "—";
    if (key === "desc") return `${r.parceiro || ""} ${r.centro || ""}`.trim();
    if (key === "comp") return dateBR(r.data);
    if (key === "tipo") return finTipo(r);
    if (key === "valor") return n2(recValue(r));
    if (key === "status") return finStatus(r)[0];
    return "";
  }
  function recSortKey(r, key) {
    if (key === "when") return String(r.criadoEm || "");
    if (key === "comp") return String(r.data || "");
    if (key === "valor") return recValue(r);
    return fold(recCell(r, key));
  }
  function colPass(table, key, text, num) {
    const rule = (state.dashColF[table] || {})[key];
    if (!rule) return true;
    const type = DASH_COLS[table][key].type;
    if (type === "num") return numPass(num, rule);
    if (type === "list") return text === rule;
    return fold(text).includes(fold(rule));
  }
  const colActive = (table, key) => !!(state.dashColF[table] || {})[key];
  function dashTh(table, key, sortAttr, sortBy, direction, extraClass = "") {
    const col = DASH_COLS[table][key];
    const selected = sortBy === key;
    const ariaSort = selected
      ? ` aria-sort="${direction === 1 ? "ascending" : "descending"}"`
      : "";
    const arrow = selected
      ? `<span class="pn-arrow">${direction === 1 ? "↑" : "↓"}</span>`
      : `<svg class="pn-sort-ico"><use href="#i-sort"></use></svg>`;
    return `<th class="${extraClass}"${ariaSort}><div class="pn-th"><button type="button" class="fin-th-sort${selected ? " is-active" : ""}" ${sortAttr}="${key}" title="Ordenar por ${esc(col.label)}">${esc(col.label)}${arrow}</button><button type="button" class="pn-fbtn${colActive(table, key) ? " on" : ""}" data-dash-filter="${table}:${key}" title="Filtrar ${esc(col.label)}" aria-label="Filtrar ${esc(col.label)}">${icon("filter")}</button></div></th>`;
  }
  const DASH_KPI_ICONS = {
    in: "calendar",
    ok: "database",
    "cash-in": "database",
    out: "database",
    bal: "scale",
    carry: "history",
  };
  let dashSummaryShown = [];
  let dashSummaryTotal = null;
  let dashRecentShown = [];
  let dashRecentPool = [];
  function financeRowsByCompany() {
    const grouped = new Map(subdivisions.map((company) => [company, []]));
    db.finance.forEach((record) => {
      if (grouped.has(record.sub)) grouped.get(record.sub).push(record);
    });
    return grouped;
  }
  function companySnapshots(companyRows) {
    return new Map(
      subdivisions.map((company) => [
        company,
        cashSnapshot(companyRows.get(company) || [], dashRef()),
      ]),
    );
  }
  function drawDashboard(
    companyRows = financeRowsByCompany(),
    snapshots = companySnapshots(companyRows),
  ) {
    const ref = dashRef();
    const isRange = /^R:/.test(ref);
    const sel = $("#dash-comp");
    if (sel)
      sel.innerHTML = `${isRange ? '<option value="__range" selected>Período personalizado</option>' : ""}<option value="" ${!ref ? "selected" : ""}>Todo o período</option>${compOptions()
        .map(
          (m) =>
            `<option value="${m}" ${!isRange && m === state.mes ? "selected" : ""}>${compLabel(m)}</option>`,
        )
        .join("")}`;
    const deEl = $("#dash-de"),
      ateEl = $("#dash-ate");
    if (deEl && deEl.value !== state.dashDe) deEl.value = state.dashDe;
    if (ateEl && ateEl.value !== state.dashAte) ateEl.value = state.dashAte;
    if (deEl) deEl.max = state.dashAte || "";
    if (ateEl) ateEl.min = state.dashDe || "";
    const empQ = $("#dash-emp-q");
    if (empQ && document.activeElement !== empQ) empQ.value = state.dashEmpQ;
    const recQ = $("#dash-rec-q");
    if (recQ && document.activeElement !== recQ) recQ.value = state.dashRecQ;
    const scopeRows = state.empresa
      ? companyRows.get(state.empresa) || []
      : [...companyRows.values()].flat();
    const recentRows = db.finance.filter(
      (record) => !state.empresa || record.sub === state.empresa,
    );
    drawDashboardKpis(scopeRows);
    drawCashMovement(scopeRows);
    $("#dash-chart")
      ?.closest(".dash-row")
      ?.classList.toggle("is-company", !!state.empresa);
    const scopeLabel = state.empresa
      ? state.empresa
      : `Consolidado de ${subdivisions.length} empresas`;
    const dashSub = $("#dash-sub");
    if (dashSub)
      dashSub.textContent = `${scopeLabel} · ${compLabel(ref)}`;
    $("#dash-sum-month").textContent = compLabel(ref);
    const movSub = $("#dash-mov-sub");
    if (movSub)
      movSub.textContent = `${state.empresa || "Todas as empresas"} · ${compLabel(ref)}`;
    $("#dash-summary").innerHTML = cashSummaryTable(companyRows, snapshots);
    const recentSub = $("#dash-recent-sub");
    if (recentSub)
      recentSub.textContent = state.empresa
        ? `Últimos lançamentos · ${state.empresa} · todas as competências`
        : "Últimos lançamentos de todas as empresas · todas as competências";
    const tipoEl = $("#dash-tipo");
    if (tipoEl)
      tipoEl.innerHTML = [
        ["", "Todos"],
        ["in", "Entradas"],
        ["out", "Saídas"],
      ]
        .map(
          ([k, l]) =>
            `<button type="button" class="${state.dashTipo === k ? "on" : ""}" data-dash-tipo="${k}">${l}</button>`,
        )
        .join("");
    dashRecentPool = [...recentRows].filter((r) => {
      if (!state.dashTipo) return true;
      const isOut = finKind(r) === "saida";
      return state.dashTipo === "out" ? isOut : !isOut;
    });
    drawDashRecent();
  }
  function drawDashRecent() {
    const el = $("#dash-fin-table");
    if (!el) return;
    const q = fold(state.dashRecQ.trim());
    const keys = Object.keys(DASH_COLS.rec);
    const filtered = dashRecentPool.filter((r) => {
      if (
        q &&
        !keys.some((k) => fold(recCell(r, k)).includes(q)) &&
        !fold(r.observacao).includes(q)
      )
        return false;
      return keys.every((k) =>
        colPass("rec", k, recCell(r, k), recValue(r)),
      );
    });
    const sortBy = keys.includes(state.dashRecSortBy) ? state.dashRecSortBy : "";
    const direction = state.dashRecSort === "asc" ? 1 : -1;
    filtered.sort((a, b) => {
      if (sortBy) {
        const av = recSortKey(a, sortBy),
          bv = recSortKey(b, sortBy);
        const c =
          typeof av === "number"
            ? av - bv
            : String(av).localeCompare(String(bv), "pt-BR", { numeric: true });
        if (c) return c * direction;
      }
      const byCreated = String(b.criadoEm || "").localeCompare(
        String(a.criadoEm || ""),
      );
      if (byCreated) return byCreated;
      return String(b.data || "").localeCompare(String(a.data || ""));
    });
    const recent = filtered.slice(0, 12);
    dashRecentShown = recent;
    const th = (key, cls = "") =>
      dashTh("rec", key, "data-dash-rec-sort", sortBy, direction, cls);
    const hasFilter =
      q || Object.values(state.dashColF.rec || {}).some(Boolean);
    el.innerHTML =
      `<table class="recent-table dash-grid-table"><thead><tr>${th("when")}${th("user")}${th("sub")}${th("desc")}${th("comp")}${th("tipo")}${th("valor", "num")}${th("status")}</tr></thead><tbody>${recent
        .map((r) => {
          const tp = finTipo(r),
            out = tp === "Saída";
          return `<tr data-edit-fin="${esc(r.id)}" title="Editar lançamento"><td class="recent-col-when" data-label="Data/hora do lançamento">${launchedDateTimeBR(r.criadoEm)}</td><td data-label="Usuário">${esc(String(r.criadoPor || "—").toUpperCase())}</td><td data-label="Empresa"><b>${esc(r.sub || "—")}</b></td><td class="recent-col-desc" data-label="Descrição">${esc(r.parceiro)}${r.centro ? `<div class="muted">${esc(r.centro)}</div>` : ""}</td><td class="nowrap" data-label="Competência">${dateBR(r.data)}</td><td data-label="Tipo"><span class="dash-tipo ${out ? "out" : "in"}">${icon(out ? "out" : "in")}${tp}</span></td><td class="amount" data-label="Valor (R$)">${n2(recValue(r))}</td><td data-label="Status">${finStatusHTML(r)}</td></tr>`;
        })
        .join(
          "",
        )}${recent.length ? "" : `<tr><td colspan="8" class="empty">${hasFilter ? "Nenhum lançamento para esta busca ou filtro." : "Nenhum lançamento recente para este filtro."}</td></tr>`}</tbody></table>`;
  }
  function drawFinance() {
    if (awaitingCloudHydrate) {
      $("#finance-count").textContent = "Sincronizando com a nuvem…";
      $("#fin-reconcile-banner").innerHTML = "";
      $("#filter-financeiro").innerHTML = "";
      $("#finance-table").innerHTML =
        `<div class="fin-empty">Carregando lançamentos do banco…</div>`;
      $("#finance-pager").innerHTML = "";
      return;
    }
    const direction = state.finSort === "asc" ? 1 : -1;
    const FIN_SORT_KEYS = [
      "data",
      "empresa",
      "parceiro",
      "centro",
      "contaBancaria",
      "empresaDepositante",
      "tipo",
      "valor",
      "situacao",
    ];
    const sortBy = FIN_SORT_KEYS.includes(state.finSortBy)
      ? state.finSortBy
      : "data";
    const finDisplayValue = (r) => {
      const kind = finKind(r);
      if (kind === "saida") return money(r.saida);
      if (kind === "entrada_por_fora") return money(r.recebido);
      return money(r.previsto);
    };
    const compareFinSort = (a, b, key) => {
      if (key === "data")
        return String(a.data || "").localeCompare(String(b.data || ""));
      if (key === "empresa")
        return String(a.sub || "").localeCompare(String(b.sub || ""), "pt-BR", {
          sensitivity: "base",
        });
      if (key === "parceiro")
        return String(a.parceiro || "").localeCompare(
          String(b.parceiro || ""),
          "pt-BR",
          { sensitivity: "base" },
        );
      if (key === "centro") return compareCentro(a.centro, b.centro);
      if (key === "contaBancaria")
        return String(a.contaBancaria || "").localeCompare(
          String(b.contaBancaria || ""),
          "pt-BR",
          { sensitivity: "base" },
        );
      if (key === "empresaDepositante")
        return String(a.empresaDepositante || "").localeCompare(
          String(b.empresaDepositante || ""),
          "pt-BR",
          { sensitivity: "base" },
        );
      if (key === "tipo")
        return String(finTipo(a) || "").localeCompare(
          String(finTipo(b) || ""),
          "pt-BR",
          { sensitivity: "base" },
        );
      if (key === "valor") return finDisplayValue(a) - finDisplayValue(b);
      if (key === "situacao")
        return String(finStatus(a)?.[0] || "").localeCompare(
          String(finStatus(b)?.[0] || ""),
          "pt-BR",
          { sensitivity: "base" },
        );
      return 0;
    };
    const rows = [...financeFiltered()].sort((a, b) => {
      const primary = compareFinSort(a, b, sortBy);
      if (primary) return primary * direction;
      if (sortBy !== "data") {
        const byDate = compareFinSort(a, b, "data");
        if (byDate) return byDate;
      }
      return String(a.id || "").localeCompare(String(b.id || ""));
    });
    const finTh = (key, label, extraClass = "") => {
      const active = sortBy === key;
      const mark = active ? (direction === 1 ? " ↑" : " ↓") : "";
      return `<th class="${extraClass}"><button type="button" class="fin-th-sort${active ? " is-active" : ""}" data-fin-sort-by="${key}" title="Ordenar por ${label}">${label}${mark}</button></th>`;
    };
    metrics("#finance-metrics");
    const showAllPages = state.finPageSize === "all";
    const pageSize = showAllPages
      ? Math.max(rows.length, 1)
      : Math.max(1, Number(state.finPageSize) || 5);
    const pages = Math.max(1, Math.ceil(rows.length / pageSize) || 1);
    state.finPage = showAllPages
      ? 1
      : Math.min(Math.max(1, state.finPage || 1), pages);
    const shown = showAllPages
      ? rows
      : rows.slice((state.finPage - 1) * pageSize, state.finPage * pageSize);
    $("#finance-count").textContent = `Exibindo ${rows.length} registro(s)`;
    $("#fin-reconcile-banner").innerHTML = (() => {
      if (!state.finReconcileIds) return "";
      const count = state.finReconcileIds.size;
      if (state.finSelectionLabel) {
        let detail = "";
        if (
          state.mes &&
          (state.finSelectionKey === "pending" ||
            state.finSelectionKey === "received")
        ) {
          const ofMonth = rows.filter(
            (record) => financeAuditOrigin(record) === "Do mês",
          ).length;
          const prior = rows.filter(
            (record) => financeAuditOrigin(record) === "Mês anterior",
          ).length;
          detail = ` · ${ofMonth} do mês · ${prior} de meses anteriores`;
        }
        const companyBit = state.empresa
          ? ` · Empresa ${esc(state.empresa)}`
          : " · Consolidado";
        const monthBit = state.mes ? ` · ${esc(compLabel(state.mes))}` : "";
        return `<div class="fin-reconcile-banner">${icon("info")}<span>${count} lançamento${count === 1 ? "" : "s"} de “${esc(state.finSelectionLabel)}”${detail}${companyBit}${monthBit}.</span><button type="button" id="fin-reconcile-clear">Limpar filtro</button></div>`;
      }
      return `<div class="fin-reconcile-banner">${icon("info")}<span>${count} ${count === 1 ? "registro selecionado" : "registros selecionados"} sem data financeira.</span><button type="button" id="fin-reconcile-clear">Limpar filtro</button></div>`;
    })();
    const costs = [
      ...new Set(db.finance.map((r) => r.centro).filter(Boolean)),
    ].sort(compareCentro);
    const banks = [
      ...new Set([
        ...(db.banks || []),
        ...db.finance.map((r) => r.contaBancaria).filter(Boolean),
      ]),
    ].sort((a, b) => a.localeCompare(b, "pt-BR"));
    $("#filter-financeiro").innerHTML =
      `<div class="fin-filter-grid"><div class="field"><label>Período</label><select class="control" id="fin-period"><option value="" ${!state.mes ? "selected" : ""}>Todo o período</option>${compOptions()
        .map(
          (m) =>
            `<option value="${m}" ${m === state.mes ? "selected" : ""}>${compLabel(m)}</option>`,
        )
        .join(
          "",
        )}</select></div><div class="field"><label>Empresa</label><select class="control" id="fin-company"><option value="">Todas</option>${subdivisions.map((s) => `<option value="${esc(s)}" ${s === state.empresa ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></div><div class="field"><label>Tipo</label><select class="control" id="fin-type"><option value="">Todos</option>${["Receita", "Entrada por fora", "Saída"].map((s) => `<option value="${s}" ${state.finType === s ? "selected" : ""}>${s}</option>`).join("")}</select></div><div class="field"><label>Situação</label><select class="control" id="fin-status"><option value="">Todas</option>${["Concluído", "Em aberto", "Pendente", "Recebido", "Pago", "Valor excedente — revisar"].map((s) => `<option ${s === state.finStatus ? "selected" : ""}>${s}</option>`).join("")}</select></div><div class="field"><label>Centro de custo</label><select class="control" id="fin-cost"><option value="">Todos</option>${costs.map((s) => `<option value="${esc(s)}" ${s === state.finCost ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></div><div class="field"><label>Conta Bancária</label><select class="control" id="fin-bank"><option value="">Todas</option>${banks.map((s) => `<option value="${esc(s)}" ${s === state.finBank ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></div><div class="field fin-partner-field"><label>Parceiro / referência</label><div class="search-control"><svg><use href="#i-search"></use></svg><input id="fin-search" value="${esc(state.pesquisa)}" placeholder="Buscar parceiro ou referência..."></div></div><button type="button" class="btn primary fin-filter-btn" id="fin-apply"><svg><use href="#i-search"></use></svg>Filtrar</button><button type="button" class="btn fin-clear-btn" id="fin-clear"><svg><use href="#i-history"></use></svg>Limpar</button></div>`;
    // Valor da linha = valor do lançamento (previsto na receita; recebido na
    // entrada; saída na despesa). O rodapé NÃO soma tudo: separa caixa e pendência.
    const rowValue = finDisplayValue;
    const periodBreak = rows.reduce(
      (acc, r) => {
        const kind = finKind(r);
        if (kind === "saida") {
          acc.saidas += money(r.saida);
        } else {
          const recebido = money(r.recebido);
          acc.recebido += recebido;
          if (kind === "receita")
            acc.aReceber += Math.max(0, money(r.previsto) - recebido);
        }
        return acc;
      },
      { recebido: 0, saidas: 0, aReceber: 0 },
    );
    const periodSaldo = periodBreak.recebido - periodBreak.saidas;
    const periodFootLabel = `${rows.length} lançamento${rows.length === 1 ? "" : "s"}`;
    const periodFootHtml = rows.length
      ? `<div class="fin-period-break">
          <span class="fin-period-count">${periodFootLabel}</span>
          <span>Recebido <b>${fmt(periodBreak.recebido)}</b></span>
          <span>Saídas <b class="neg">${fmt(periodBreak.saidas)}</b></span>
          <span>A receber <b>${fmt(periodBreak.aReceber)}</b></span>
          <span class="fin-period-saldo">Saldo do filtro <b class="${periodSaldo < 0 ? "neg" : ""}">${fmt(periodSaldo)}</b></span>
        </div>`
      : "";
    const tableRows = shown
      .map((r) => {
        const tp = finTipo(r),
          st = finStatus(r),
          v = rowValue(r);
        const origin = state.finSelectionLabel ? financeAuditOrigin(r) : "";
        const kind = finKind(r);
        const recebido = money(r.recebido);
        const valorHint =
          kind === "receita" && money(r.previsto) > 0
            ? `<small class="received-date">Recebido: ${fmt(recebido)}${recebido + 0.009 < money(r.previsto) ? ` · falta ${fmt(money(r.previsto) - recebido)}` : ""}</small>`
            : "";
        return `<tr><td class="nowrap fin-col-data" data-label="Data">${dateBR(r.data)}${origin ? `<small class="fin-origin-tag ${origin === "Do mês" ? "is-month" : "is-prior"}">${esc(origin)}</small>` : ""}${r.dataRecebida ? `<small class="received-date">Recebida: ${dateBR(r.dataRecebida)}</small>` : ""}</td><td data-label="Empresa"><b>${esc(r.sub || "—")}</b></td><td class="fin-col-parceiro" data-label="Parceiro">${esc(r.parceiro || "—")}${r.observacao ? `<div class="muted">${esc(r.observacao)}</div>` : ""}</td><td class="contato-cell" data-label="Contato">${contatoCell(r)}</td><td data-label="Centro de Custo">${esc(r.centro || "—")}</td><td data-label="Conta Bancária">${esc(r.contaBancaria || "—")}</td><td class="description-cell" data-label="Empresa depositante">${esc(r.empresaDepositante || "—")}</td><td data-label="Tipo"><span class="tipo ${tp === "Saída" ? "desp" : "rec"}">${icon(tp === "Saída" ? "arrow" : "down")}${tp}</span></td><td class="amount nowrap" data-label="Valor (R$)"><b>${n2(v)}</b>${valorHint}</td><td data-label="Situação">${finStatusHTML(r)}</td><td class="fin-col-file" data-label="Comprovante">${fileCell(r.anexos, "fin:" + r.id)}</td><td class="action-cell"><div class="row-actions">${(r.anexos || []).length ? `<button type="button" class="row-icon" data-view-files="fin:${esc(r.id)}" title="Visualizar">${icon("eye")}</button>` : ""}<button type="button" class="edit-action" data-edit-fin="${esc(r.id)}" title="Editar" aria-label="Editar">${icon("edit")}<span class="ea-label">Editar</span></button>${canDeleteFinance() ? `<button type="button" class="edit-action danger" data-delete-fin="${esc(r.id)}" title="Excluir" aria-label="Excluir">${icon("trash")}<span class="ea-label">Excluir</span></button>` : ""}</div></td></tr>`;
      })
      .join("");
    $("#finance-table").innerHTML =
      state.finView === "detail"
        ? `<div class="fin-detail-list">${
            shown
              .map((r) => {
                const tp = finTipo(r),
                  st = finStatus(r),
                  v = rowValue(r);
                const origin = state.finSelectionLabel
                  ? financeAuditOrigin(r)
                  : "";
                return `<article><div><span>${dateBR(r.data)} · ${esc(r.sub || "—")}${origin ? ` · ${esc(origin)}` : ""}</span><h3>${esc(r.parceiro || "Lançamento financeiro")}</h3><p>${esc(r.centro || "Sem centro de custo")}${r.contaBancaria ? " · Conta: " + esc(r.contaBancaria) : ""}${r.dataRecebida ? " · Recebida em " + dateBR(r.dataRecebida) : ""}${r.empresaDepositante ? " · Depositante: " + esc(r.empresaDepositante) : ""}${r.observacao ? " · " + esc(r.observacao) : ""}</p></div><div><span class="tipo ${tp === "Saída" ? "desp" : "rec"}">${tp}</span><strong>${fmt(v)}</strong>${finStatusHTML(r)}<button class="inline-btn" data-edit-fin="${esc(r.id)}">Editar</button>${canDeleteFinance() ? `<button class="inline-btn danger" data-delete-fin="${esc(r.id)}">Excluir</button>` : ""}</div></article>`;
              })
              .join("") ||
            `<div class="fin-empty">Nenhum lançamento encontrado para os filtros selecionados.</div>`
          }${periodFootHtml ? `<div class="fin-detail-total fin-detail-break">${periodFootHtml}</div>` : ""}</div>`
        : `<div class="fin-table-scroll"><table class="fin-table"><thead><tr>${finTh("data", "Data")}${finTh("empresa", "Empresa")}${finTh("parceiro", "Parceiro")}<th>Contato</th>${finTh("centro", "Centro de Custo")}${finTh("contaBancaria", "Conta Bancária")}${finTh("empresaDepositante", "Empresa depositante")}${finTh("tipo", "Tipo")}${finTh("valor", "Valor (R$)", "num")}${finTh("situacao", "Situação")}<th>Comprovante</th><th class="action-cell">Ações</th></tr></thead><tbody>${tableRows || noRows("Nenhum lançamento encontrado para os filtros selecionados.", 12)}</tbody></table></div>${periodFootHtml ? `<div class="fin-table-foot">${periodFootHtml}</div>` : ""}`;
    $("#finance-pager").innerHTML =
      `<span>Mostrando ${rows.length ? (state.finPage - 1) * pageSize + 1 : 0} a ${Math.min(state.finPage * pageSize, rows.length)} de ${rows.length} registros</span><div class="fin-page-buttons"><button type="button" id="fin-first" ${state.finPage === 1 ? "disabled" : ""}>«</button><button type="button" id="fin-prev" ${state.finPage === 1 ? "disabled" : ""}>‹</button><span>${state.finPage}</span><button type="button" id="fin-next" ${state.finPage === pages ? "disabled" : ""}>›</button><button type="button" id="fin-last" ${state.finPage === pages ? "disabled" : ""}>»</button></div>`;
    const bind = (id, key, clearAudit = false) => {
      $("#" + id).onchange = (e) => {
        state[key] = e.target.value;
        state.finPage = 1;
        if (clearAudit) clearFinanceAuditFilter();
        render();
      };
    };
    bind("fin-period", "mes", true);
    bind("fin-company", "empresa", true);
    bind("fin-type", "finType", true);
    bind("fin-status", "finStatus", true);
    bind("fin-cost", "finCost", true);
    bind("fin-bank", "finBank", true);
    $$("[data-fin-sort-by]").forEach((btn) => {
      btn.onclick = () => {
        const key = btn.dataset.finSortBy;
        if (!FIN_SORT_KEYS.includes(key)) return;
        if (state.finSortBy === key) {
          state.finSort = state.finSort === "asc" ? "desc" : "asc";
        } else {
          state.finSortBy = key;
          state.finSort = key === "data" || key === "valor" ? "desc" : "asc";
        }
        state.finPage = 1;
        drawFinance();
      };
    });
    $("#fin-sort").value = state.finSortBy === "data" ? state.finSort : "desc";
    $("#fin-sort").onchange = (e) => {
      state.finSortBy = "data";
      state.finSort = e.target.value === "asc" ? "asc" : "desc";
      state.finPage = 1;
      drawFinance();
    };
    $("#fin-page-size").value =
      state.finPageSize === "all" ? "all" : String(state.finPageSize || 5);
    $("#fin-page-size").onchange = (e) => {
      const value = e.target.value;
      state.finPageSize =
        value === "all" ? "all" : Math.max(1, Number(value) || 5);
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
        finBank: "",
        pesquisa: "",
        empresa: "",
        finReconcileIds: null,
        finSelectionLabel: "",
        finSelectionKey: "",
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
  /** Marca a tarefa (sem valor) como concluída, sem nenhum vínculo financeiro. */
  function concluirTarefa(t, extras) {
    extras = extras || {};
    if (t.status === "Concluída") return "";
    t.status = "Concluída";
    t.concluidoPor = MB.nome || "";
    t.concluidoEm = new Date().toISOString();
    if (extras.dataExecucao) t.dataExecucao = extras.dataExecucao;
    if (extras.observacao) t.observacao = extras.observacao;
    markMutation("taskUpserts", t.id);
    audit(
      "Tarefa concluída",
      t.titulo + " · responsável " + (t.responsavel || "—"),
    );
    save();
    return "";
  }
  /** Lançamentos de saída ainda livres (ou já vinculados a esta tarefa) para selecionar. */
  function lancamentosVinculaveis(t) {
    return db.finance
      .filter(
        (f) => finKind(f) === "saida" && (!f.tarefaId || f.tarefaId === t.id),
      )
      .sort((a, b) =>
        String(b.criadoEm || b.data || "").localeCompare(
          String(a.criadoEm || a.data || ""),
        ),
      );
  }
  /** Total hoje vinculado a esta tarefa (soma das saídas já marcadas com tarefaId). */
  function totalVinculadoTarefa(t) {
    return db.finance
      .filter((f) => f.tarefaId === t.id)
      .reduce((s, f) => s + money(f.saida), 0);
  }
  /** Aplica a seleção de lançamentos da tarefa: vincula/desvincula e decide o status. */
  function vincularLancamentosNaTarefa(t, idsSelecionados) {
    const selecionados = new Set(idsSelecionados);
    const candidatos = lancamentosVinculaveis(t);
    let total = 0;
    for (const f of candidatos) {
      const deveVincular = selecionados.has(f.id);
      if (deveVincular) {
        f.tarefaId = t.id;
        total += money(f.saida);
        markMutation("financeUpserts", f.id);
      } else if (f.tarefaId === t.id) {
        f.tarefaId = null;
        markMutation("financeUpserts", f.id);
      }
    }
    const alvo = money(t.valor);
    const diff = Math.round((total - alvo) * 100) / 100;
    let msg;
    if (Math.abs(diff) < 0.01) {
      t.status = "Concluída";
      t.concluidoPor = MB.nome || "";
      t.concluidoEm = new Date().toISOString();
      msg = "Tarefa concluída — o valor vinculado bateu certinho.";
    } else if (diff < 0) {
      t.status = "Em andamento";
      msg = `Faltam ${fmt(-diff)} para bater com o valor da tarefa.`;
    } else {
      t.status = "Em andamento";
      msg = `Passou ${fmt(diff)} do valor da tarefa — aguardando revisão do admin.`;
    }
    markMutation("taskUpserts", t.id);
    audit(
      "Lançamentos vinculados à tarefa",
      t.titulo + " · total vinculado " + fmt(total),
    );
    save();
    return msg;
  }
  function taskRowHTML(t, hoje) {
    const meta = taskDeadlineMeta(t, hoje);
    const rec = t.recorrente
      ? `<span class='rec-badge' title='Tarefa recorrente (repete todo mês)'>🔁 Mensal</span>`
      : "";
    const isMine = !!MB.nome && samePerson(t.responsavel, MB.nome);
    const concluida = t.status === "Concluída";
    const quando = t.concluidoEm
      ? dateBR(String(t.concluidoEm).slice(0, 10))
      : "—";
    const concluidaBadge = `<span class='pill ok' title='Concluída por ${esc(t.concluidoPor || "—")} em ${quando}'>${icon("check")} Concluída</span>`;
    const temValor = money(t.valor) > 0;
    let primaryBtn = "";
    if (!concluida) {
      primaryBtn = temValor
        ? `<button class='edit-action primary' data-realizar-task='${esc(t.id)}'>${icon("check")} ${t.status === "Em andamento" ? "Selecionar lançamentos" : "Realizar tarefa"}</button>`
        : `<button class='edit-action primary' data-conclude-task='${esc(t.id)}'>${icon("check")} Concluir</button>`;
    }
    let actions;
    if (MB.admin) {
      // Admin vê os controles completos e, se ainda não concluída, também o
      // atalho rápido (não precisa abrir o formulário inteiro).
      actions = `${concluida ? concluidaBadge : primaryBtn}<button class='edit-action' data-edit-task='${esc(t.id)}'>${icon("list")} Editar</button>${canDeleteRec(t) ? deleteBtn("task", t.id) : ""}`;
    } else if (concluida) {
      actions = concluidaBadge;
    } else if (isMine) {
      actions = primaryBtn;
    } else {
      actions = `<span class='muted'>—</span>`;
    }
    return `<tr><td><div class='task-title-cell'><b>${esc(t.titulo)}</b>${rec}</div><div class='muted'>${esc(t.nome || "Favorecido não informado")}</div></td><td><div class='person-chip'><span class='avatar-sm'>${esc(taskInitials(t.responsavel))}</span>${esc(t.responsavel || "Sem responsável")}</div></td><td>${dateBR(t.prazo)}<div class='muted due-${meta.cls || "ok"}'>${esc(meta.label)}</div></td><td class='num'>${fmt(t.valor || 0)}</td><td>${statusPill(t.status)}</td><td>${fileCell(t.anexos, "task:" + t.id)}</td><td class='row-actions'>${actions}</td></tr>`;
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
    const mode = state.finHistPeriod || "all";
    if (!state.finHistMonth) state.finHistMonth = todayISO().slice(0, 7);
    if (!state.finHistYear) state.finHistYear = todayISO().slice(0, 4);
    if (!state.finHistWeek) state.finHistWeek = todayISO();
    if (mode === "custom") {
      if (!state.finHistFrom)
        state.finHistFrom = `${todayISO().slice(0, 7)}-01`;
      if (!state.finHistTo) state.finHistTo = todayISO();
    }
    const range = finHistRange();
    const rows = db.finance
      .filter(
        (r) =>
          inFinHistRange(r.data, range) &&
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
    const customFrom = state.finHistFrom || `${todayISO().slice(0, 7)}-01`;
    const customTo = state.finHistTo || todayISO();
    f.innerHTML = `<div class="field"><label>Periodicidade</label><select class="control" id="fh-period" lang="pt-BR"><option value="all" ${mode === "all" ? "selected" : ""}>Todo o período</option><option value="month" ${mode === "month" ? "selected" : ""}>Mensal</option><option value="week" ${mode === "week" ? "selected" : ""}>Semanal</option><option value="year" ${mode === "year" ? "selected" : ""}>Anual</option><option value="custom" ${mode === "custom" ? "selected" : ""}>Período personalizado</option></select></div><div class="field fh-mode fh-mode-month" ${mode === "month" ? "" : "hidden"}><label>Mês</label>${accountMonthSelectHTML("fh-month", state.finHistMonth)}</div><div class="field fh-mode fh-mode-week" ${mode === "week" ? "" : "hidden"}><label>Semana de referência</label>${accountDateSelectHTML("fh-week", state.finHistWeek)}</div><div class="field fh-mode fh-mode-year" ${mode === "year" ? "" : "hidden"}><label>Ano</label>${accountYearSelectHTML("fh-year", state.finHistYear)}</div><div class="field fh-mode fh-mode-custom fh-date" ${mode === "custom" ? "" : "hidden"}><label>Data inicial</label>${accountDateSelectHTML("fh-from", customFrom)}</div><div class="field fh-mode fh-mode-custom fh-date" ${mode === "custom" ? "" : "hidden"}><label>Data final</label>${accountDateSelectHTML("fh-to", customTo)}</div><div class="field"><label>Empresa</label><select class="control" id="fh-company"><option value="">Todas</option>${companies.map((c) => `<option value="${esc(c)}" ${c === state.finHistCompany ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></div>${selectField("Centro de custo", "fh-cost", COST_CODES, state.finHistCost)}<div class="field history-search"><label>Pesquisar parceiro</label><input class="control" type="search" id="fh-search" value="${esc(state.finHistSearch)}" placeholder="Parceiro ou centro de custo"></div><div class="field"><label>&nbsp;</label><button class="btn" id="fh-clear">Limpar filtros</button></div>`;
    const redraw = (key, value) => {
      state[key] = value;
      state.finHistPage = 1;
      drawFinancialHistory();
    };
    $("#fh-period").onchange = (e) => {
      state.finHistPeriod = e.target.value;
      if (state.finHistPeriod === "custom") {
        if (!state.finHistFrom)
          state.finHistFrom = `${todayISO().slice(0, 7)}-01`;
        if (!state.finHistTo) state.finHistTo = todayISO();
      }
      state.finHistPage = 1;
      drawFinancialHistory();
    };
    const monthEl = $("#fh-month");
    if (monthEl)
      monthEl.onchange = (e) => redraw("finHistMonth", e.target.value);
    const yearEl = $("#fh-year");
    if (yearEl) yearEl.onchange = (e) => redraw("finHistYear", e.target.value);
    if (mode === "week")
      wireAccountDateSelect("fh-week", "finHistWeek", () => {
        state.finHistPage = 1;
        drawFinancialHistory();
      });
    if (mode === "custom") {
      wireAccountDateSelect("fh-from", "finHistFrom", () => {
        state.finHistPage = 1;
        drawFinancialHistory();
      });
      wireAccountDateSelect("fh-to", "finHistTo", () => {
        state.finHistPage = 1;
        drawFinancialHistory();
      });
    }
    for (const [id, key] of [
      ["fh-company", "finHistCompany"],
      ["fh-cost", "finHistCost"],
      ["fh-search", "finHistSearch"],
    ])
      $("#" + id).onchange = (e) => redraw(key, e.target.value);
    $("#fh-clear").onclick = () => {
      Object.assign(state, {
        finHistPeriod: "all",
        finHistMonth: todayISO().slice(0, 7),
        finHistYear: todayISO().slice(0, 4),
        finHistWeek: todayISO(),
        finHistFrom: "",
        finHistTo: "",
        finHistCompany: "",
        finHistCost: "",
        finHistSearch: "",
        finHistPage: 1,
      });
      drawFinancialHistory();
    };
    const t = totals(rows);
    $("#fin-history-summary").innerHTML =
      `<div class="hsummary"><span>Registros</span><strong>${rows.length}</strong></div><div class="hsummary"><span>A receber</span><strong>${fmt(t.prev)}</strong></div><div class="hsummary"><span>Recebido</span><strong>${fmt(t.rec)}</strong></div><div class="hsummary"><span>Saídas</span><strong>${fmt(t.sai)}</strong></div><div class="hsummary"><span>Período</span><strong class="hsummary-period">${esc(range.label)}</strong></div>`;
    const size = 25,
      pages = Math.max(1, Math.ceil(rows.length / size));
    state.finHistPage = Math.min(state.finHistPage, pages);
    const shown = rows.slice(
      (state.finHistPage - 1) * size,
      state.finHistPage * size,
    );
    $("#fin-history-count").textContent = `${rows.length} registro(s)`;
    $("#fin-history-table").innerHTML =
      `<table class="ledger-table"><thead><tr><th>Data</th><th>Empresa / referência</th><th>Parceiro</th><th>Contato</th><th>Centro de custo</th><th>A receber</th><th>Recebido</th><th>Saída</th><th>Situação</th><th>Anexos</th><th class="action-cell">Ações</th></tr></thead><tbody>${
        shown
          .map((r) => {
            const st = finStatus(r);
            return `<tr><td>${dateBR(r.data)}</td><td>${esc(r.sub || "Não identificada")}</td><td>${esc(r.parceiro)}</td><td class="contato-cell">${contatoCell(r)}</td><td>${esc(r.centro)}</td><td class="amount">${fmt(r.previsto)}</td><td class="amount">${fmt(r.recebido)}</td><td class="amount">${fmt(r.saida)}</td><td>${finStatusHTML(r)}</td><td>${fileCell(r.anexos, "fin:" + r.id)}</td><td class="action-cell"><div class="row-actions"><button class="edit-action" data-edit-fin="${esc(r.id)}">${icon("edit")} Editar</button>${canDeleteFinance() ? `<button class="edit-action danger" type="button" data-delete-fin="${esc(r.id)}">${icon("trash")} Excluir</button>` : ""}</div></td></tr>`;
          })
          .join("") || noRows("Nenhum lançamento financeiro encontrado.", 11)
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

  function accountabilityRange() {
    const mode = state.accountPeriod || "month";
    if (mode === "all") return { start: "", end: "", label: "Todo o período" };
    if (mode === "year") {
      const year = /^\d{4}$/.test(state.accountYear)
        ? state.accountYear
        : todayISO().slice(0, 4);
      return {
        start: `${year}-01-01`,
        end: `${year}-12-31`,
        label: `Ano de ${year}`,
      };
    }
    if (mode === "custom") {
      const start = state.accountFrom || "";
      const end = state.accountTo || "";
      return {
        start,
        end,
        label:
          start && end
            ? `${dateBR(start)} a ${dateBR(end)}`
            : "Período personalizado",
      };
    }
    if (mode === "week") {
      const base = /^\d{4}-\d{2}-\d{2}$/.test(state.accountWeek)
        ? state.accountWeek
        : todayISO();
      const date = new Date(base + "T12:00:00");
      const day = date.getDay() || 7;
      date.setDate(date.getDate() - day + 1);
      const start = date.toLocaleDateString("en-CA");
      date.setDate(date.getDate() + 6);
      const end = date.toLocaleDateString("en-CA");
      return { start, end, label: `${dateBR(start)} a ${dateBR(end)}` };
    }
    const selected = /^\d{4}-\d{2}$/.test(state.accountMonth)
      ? state.accountMonth
      : todayISO().slice(0, 7);
    const bounds = monthBounds(selected);
    const endDate = new Date(bounds.end + "T12:00:00");
    endDate.setDate(endDate.getDate() - 1);
    return {
      start: bounds.start,
      end: endDate.toLocaleDateString("en-CA"),
      label: compLabel(selected),
    };
  }

  const inAccountRange = (value, range) =>
    isFinancialDate(value) &&
    (!range.start || value >= range.start) &&
    (!range.end || value <= range.end);

  function accountScopeRows(company = state.accountCompany) {
    return db.finance.filter((record) => !company || record.sub === company);
  }

  function accountReportRows(scope, range) {
    const query = String(state.accountQuery || "")
      .trim()
      .toLocaleLowerCase("pt-BR");
    return scope
      .filter((record) => {
        const launchInRange = inAccountRange(record.data, range);
        const receiptInRange = receiptCashEvents(record).some((event) =>
          inAccountRange(event.data, range),
        );
        if (!launchInRange && !receiptInRange) return false;
        const files = (record.anexos || []).length;
        if (state.accountFiles === "with" && !files) return false;
        if (state.accountFiles === "without" && files) return false;
        if (query) {
          const haystack = [
            record.sub,
            record.parceiro,
            record.centro,
            record.empresaDepositante,
            record.observacao,
            record.origem,
          ]
            .join(" ")
            .toLocaleLowerCase("pt-BR");
          if (!haystack.includes(query)) return false;
        }
        return true;
      })
      .sort(
        (a, b) =>
          compareCentro(a.centro, b.centro) ||
          String(a.data || "").localeCompare(String(b.data || "")) ||
          String(a.sub || "").localeCompare(String(b.sub || ""), "pt-BR"),
      );
  }

  function isProgramacaoCentro(centro) {
    return /^M[1-5]$/i.test(String(centro || "").trim());
  }
  function isPorForaRecord(record) {
    if (!record) return false;
    if (finKind(record) === "entrada_por_fora") return true;
    return /por\s*fora/i.test(String(record.centro || "").trim());
  }
  function accountCashSummary(scope, range) {
    const ledger = cashLedger(scope);
    const entries = ledger.entries.filter((event) =>
      inAccountRange(event.data, range),
    );
    const exits = ledger.exits.filter((event) =>
      inAccountRange(event.data, range),
    );
    const beforeEntries = range.start
      ? ledger.entries.filter((event) => event.data && event.data < range.start)
      : [];
    const beforeExits = range.start
      ? ledger.exits.filter((event) => event.data && event.data < range.start)
      : [];
    const sum = (items) =>
      items.reduce((total, item) => total + money(item.value), 0);
    const prior = range.start ? sum(beforeEntries) - sum(beforeExits) : null;
    const received = sum(entries);
    const outputs = sum(exits);
    const byId = new Map(scope.map((record) => [String(record.id), record]));
    let programacao = 0;
    let porFora = 0;
    entries.forEach((event) => {
      const record = byId.get(String(event.rowId));
      if (isPorForaRecord(record) || event.kind === "entrada_por_fora") {
        porFora += money(event.value);
        return;
      }
      // M1–M5 (e demais receitas de programação) entram como Programação
      if (
        !record ||
        isProgramacaoCentro(record.centro) ||
        finKind(record) === "receita"
      ) {
        programacao += money(event.value);
        return;
      }
      porFora += money(event.value);
    });
    return {
      prior,
      received,
      programacao,
      porFora,
      outputs,
      final: (prior || 0) + received - outputs,
      unknown:
        ledger.entries.filter((event) => !event.data).length +
        ledger.exits.filter((event) => !event.data).length,
    };
  }

  function accountReceivable(scope, range) {
    const cutoff = range.end || "9999-12-31";
    return scope
      .filter(
        (record) =>
          finKind(record) === "receita" &&
          isFinancialDate(record.data) &&
          record.data <= cutoff,
      )
      .reduce((total, record) => {
        const received = receiptCashEvents(record)
          .filter((event) => event.data && event.data <= cutoff)
          .reduce((sum, event) => sum + event.value, 0);
        return total + Math.max(0, money(record.previsto) - received);
      }, 0);
  }

  function accountCompanySummary(range) {
    const list = state.accountCompany ? [state.accountCompany] : subdivisions;
    return list.map((company) => {
      const scope = accountScopeRows(company);
      const reportRows = accountReportRows(scope, range);
      const cash = accountCashSummary(scope, range);
      return {
        company,
        records: reportRows.length,
        expected: reportRows
          .filter(
            (record) =>
              inAccountRange(record.data, range) &&
              finKind(record) === "receita",
          )
          .reduce((total, record) => total + money(record.previsto), 0),
        files: reportRows.reduce(
          (total, record) => total + (record.anexos || []).length,
          0,
        ),
        ...cash,
      };
    });
  }

  function accountAttachmentHTML(record, file, fileIndex, sequence) {
    const image = String(file.type || "").startsWith("image/");
    return `<article class="account-proof-card"><p class="account-proof-meta"><b>Comprovante ${sequence}</b> — ${esc(record.sub || "sem empresa")}, ${dateBR(record.data)}, ${esc(record.parceiro || "sem favorecido")}<br><span>${esc(file.name || "arquivo")}</span></p><div class="account-proof-preview">${image ? `<img data-account-proof="${esc(record.id)}:${fileIndex}" alt="${esc(file.name || "Comprovante")}">` : `<span>Arquivo PDF: ${esc(file.name || "comprovante")}</span>`}</div><button type="button" class="account-proof-open no-print" data-view-files="fin:${esc(record.id)}" data-file-index="${fileIndex}">abrir arquivo</button></article>`;
  }

  function accountMoneyClass(amount, mode) {
    const value = money(amount);
    if (Math.abs(value) < 0.005) return "val-zero";
    if (mode === "in") return "val-positivo";
    if (mode === "out" || value < 0) return "val-negativo";
    return "";
  }

  function accountDetailRowHTML(record, index, range) {
    const received = receiptCashEvents(record)
      .filter((event) => inAccountRange(event.data, range))
      .reduce((total, event) => total + event.value, 0);
    const output =
      finKind(record) === "saida" && inAccountRange(record.data, range)
        ? money(record.saida)
        : 0;
    const launchExpected =
      finKind(record) === "receita" && inAccountRange(record.data, range)
        ? money(record.previsto)
        : 0;
    const files = (record.anexos || []).length;
    const centroLabel = isPorForaRecord(record)
      ? String(record.centro || "POR FORA").toLocaleUpperCase("pt-BR")
      : record.centro || "";
    return `<tr>
      <td class="text-center">${index}</td>
      <td class="text-center nowrap">${dateBR(record.data)}</td>
      <td class="col-empresa">${esc(record.sub || "")}</td>
      <td>${esc(finTipo(record))}</td>
      <td>${esc(record.parceiro || "")}</td>
      <td class="text-center col-centro">${esc(centroLabel)}</td>
      <td class="text-right tabular-nums col-previsto ${accountMoneyClass(launchExpected)}">${fmt(launchExpected)}</td>
      <td class="text-right tabular-nums col-recebido ${accountMoneyClass(received, "in")}">${fmt(received)}</td>
      <td class="text-right tabular-nums ${accountMoneyClass(output, "out")}">${fmt(output)}</td>
      <td class="text-center col-comprov">${files || ""}</td>
    </tr>`;
  }

  function accountDetailTotalHTML(records, range) {
    const totals = records.reduce(
      (total, record) => {
        const received = receiptCashEvents(record)
          .filter((event) => inAccountRange(event.data, range))
          .reduce((sum, event) => sum + event.value, 0);
        const output =
          finKind(record) === "saida" && inAccountRange(record.data, range)
            ? money(record.saida)
            : 0;
        const expected =
          finKind(record) === "receita" && inAccountRange(record.data, range)
            ? money(record.previsto)
            : 0;
        return {
          expected: total.expected + expected,
          received: total.received + received,
          output: total.output + output,
          files: total.files + (record.anexos || []).length,
        };
      },
      { expected: 0, received: 0, output: 0, files: 0 },
    );
    return `<tr class="row-total account-detail-total">
      <td colspan="6" class="text-right">Total</td>
      <td class="text-right tabular-nums col-previsto ${accountMoneyClass(totals.expected)}">${fmt(totals.expected)}</td>
      <td class="text-right tabular-nums col-recebido ${accountMoneyClass(totals.received, "in")}">${fmt(totals.received)}</td>
      <td class="text-right tabular-nums ${accountMoneyClass(totals.output, "out")}">${fmt(totals.output)}</td>
      <td class="text-center col-comprov">${totals.files}</td>
    </tr>`;
  }

  function accountReportHTML(rows, range, cash, companies) {
    const companyLabel = state.accountCompany || "Consolidado";
    const attachments = rows.flatMap((record) =>
      (record.anexos || []).map((file, fileIndex) => ({
        record,
        file,
        fileIndex,
      })),
    );
    let proofNumber = 0;
    const entryRecords = rows.filter((record) => finKind(record) !== "saida");
    const programacaoRecords = entryRecords.filter(
      (record) => !isPorForaRecord(record),
    );
    const porForaRecords = entryRecords.filter((record) =>
      isPorForaRecord(record),
    );
    const exitRecords = rows.filter((record) => finKind(record) === "saida");
    const detailHead = `<thead><tr>
      <th class="text-center">N°</th>
      <th class="text-center">Data</th>
      <th class="text-left col-empresa">Empresa</th>
      <th class="text-left">Tipo</th>
      <th class="text-left">Parceiro</th>
      <th class="text-center col-centro">Centro</th>
      <th class="text-right col-previsto">Previsto</th>
      <th class="text-right col-recebido">Recebido</th>
      <th class="text-right">Saída</th>
      <th class="text-center col-comprov">Comprov.</th>
    </tr></thead>`;
    const emptyDetail = (label, cols = 10) =>
      `<tr><td colspan="${cols}" class="account-empty">${label}</td></tr>`;
    const programacaoRows = programacaoRecords
      .map((record, index) => accountDetailRowHTML(record, index + 1, range))
      .join("");
    const porForaRows = porForaRecords
      .map((record, index) => accountDetailRowHTML(record, index + 1, range))
      .join("");
    const exitRows = exitRecords
      .map((record, index) => accountDetailRowHTML(record, index + 1, range))
      .join("");
    const companyRows = companies
      .map(
        (item) => `<tr>
        <td>${esc(item.company)}</td>
        <td class="text-center">${item.records}</td>
        <td class="text-right tabular-nums">${fmt(item.expected)}</td>
        <td class="text-right tabular-nums ${accountMoneyClass(item.received, "in")}">${fmt(item.received)}</td>
        <td class="text-right tabular-nums ${accountMoneyClass(item.outputs, "out")}">${fmt(item.outputs)}</td>
        <td class="text-right tabular-nums ${accountMoneyClass(item.final)}">${fmt(item.final)}</td>
        <td class="text-center">${item.files}</td>
      </tr>`,
      )
      .join("");
    const totals = companies.reduce(
      (total, item) => ({
        records: total.records + item.records,
        expected: total.expected + item.expected,
        received: total.received + item.received,
        outputs: total.outputs + item.outputs,
        final: total.final + item.final,
        files: total.files + item.files,
      }),
      { records: 0, expected: 0, received: 0, outputs: 0, final: 0, files: 0 },
    );
    const generatedAt = new Date().toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    });
    const isMonthly =
      state.accountPeriod === "month" &&
      /^\d{4}-\d{2}$/.test(state.accountMonth);
    const selectedMonthLabel = isMonthly
      ? financeMonthTitle(state.accountMonth)
      : "";
    const previousMonthLabel = isMonthly
      ? financeMonthTitle(previousMonth(state.accountMonth))
      : "";
    const priorLabel = isMonthly
      ? `FICOU EM ${esc(String(previousMonthLabel || "").toLocaleUpperCase("pt-BR"))}`
      : "SALDO ANTERIOR";
    const saidaLabel = isMonthly
      ? `SAÍDA ${esc(String(selectedMonthLabel || "").toLocaleUpperCase("pt-BR"))}`
      : "SAÍDAS";
    const finalLabel = isMonthly
      ? `(=) SALDO DE ${esc(String(selectedMonthLabel || "").toLocaleUpperCase("pt-BR"))}`
      : "(=) SALDO FINAL";
    const priorValue = cash.prior == null ? "—" : fmt(cash.prior);
    const priorClass = cash.prior == null ? "" : accountMoneyClass(cash.prior);
    return `<header class="account-doc-header">
        <div>
          <h2>Prestação de Contas - Assessoria MB</h2>
          <div class="account-doc-meta"><strong>Empresa:</strong> ${esc(companyLabel)} &nbsp;|&nbsp; <strong>Período:</strong> ${esc(range.label)}</div>
        </div>
        <div class="account-doc-emitted tabular-nums">Emitido em: ${generatedAt}</div>
      </header>
      <section class="account-report-section">
        <h3 class="account-section-title">1. Resumo</h3>
        <table class="erp-table tabular-nums account-resumo-table">
          <thead><tr><th class="text-left">Descrição</th><th class="text-right">Valor</th></tr></thead>
          <tbody>
            <tr><td class="font-bold">${priorLabel}</td><td class="text-right font-bold ${priorClass}">${priorValue}</td></tr>
            <tr><td class="font-bold">PROGRAMAÇÃO</td><td class="text-right">${fmt(cash.programacao || 0)}</td></tr>
            <tr><td class="font-bold">POR FORA</td><td class="text-right">${fmt(cash.porFora || 0)}</td></tr>
            <tr><td class="font-bold">${saidaLabel}</td><td class="text-right">${fmt(cash.outputs)}</td></tr>
            <tr class="row-saldo"><td>${finalLabel}</td><td class="text-right ${accountMoneyClass(cash.final)}">${fmt(cash.final)}</td></tr>
          </tbody>
        </table>
      </section>
      <section class="account-report-section">
        <h3 class="account-section-title">2. Por empresa</h3>
        <div class="account-sheet-table">
          <table class="erp-table tabular-nums">
            <thead><tr>
              <th class="text-left">Empresa</th>
              <th class="text-center">Lanç.</th>
              <th class="text-right">Previsto</th>
              <th class="text-right">Recebido</th>
              <th class="text-right">Saídas</th>
              <th class="text-right">Saldo</th>
              <th class="text-center">Anexos</th>
            </tr></thead>
            <tbody>
              ${companyRows || emptyDetail("Sem movimentação no período.", 7)}
              <tr class="row-total">
                <td>Total</td>
                <td class="text-center">${totals.records}</td>
                <td class="text-right">${fmt(totals.expected)}</td>
                <td class="text-right ${accountMoneyClass(totals.received, "in")}">${fmt(totals.received)}</td>
                <td class="text-right ${accountMoneyClass(totals.outputs, "out")}">${fmt(totals.outputs)}</td>
                <td class="text-right ${accountMoneyClass(totals.final)}">${fmt(totals.final)}</td>
                <td class="text-center">${totals.files}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <section class="account-report-section account-detail-section">
        <h3 class="account-section-title">3. Entradas</h3>
        <div class="account-sub-banner">PROGRAMAÇÃO</div>
        <div class="account-sheet-table account-detail-table" style="margin-bottom:12px">
          <table class="erp-table tabular-nums">${detailHead}<tbody>${programacaoRows || emptyDetail("Nenhuma entrada de programação no período.")}${accountDetailTotalHTML(programacaoRecords, range)}</tbody></table>
        </div>
        <div class="account-sub-banner">POR FORA</div>
        <div class="account-sheet-table account-detail-table">
          <table class="erp-table tabular-nums">${detailHead}<tbody>${porForaRows || emptyDetail("Nenhuma entrada por fora no período.")}${accountDetailTotalHTML(porForaRecords, range)}</tbody></table>
        </div>
      </section>
      <section class="account-report-section account-detail-section account-saidas-section">
        <h3 class="account-section-title">4. Saídas</h3>
        <div class="account-sheet-table account-detail-table">
          <table class="erp-table tabular-nums account-saidas-table">${detailHead}<tbody>${exitRows || emptyDetail("Nenhuma saída no período.")}${accountDetailTotalHTML(exitRecords, range)}</tbody></table>
        </div>
      </section>
      ${
        attachments.length
          ? `<section class="account-report-section account-proof-section"><h3 class="account-section-title">5. Comprovantes</h3><div class="account-proof-grid">${attachments.map(({ record, file, fileIndex }) => accountAttachmentHTML(record, file, fileIndex, ++proofNumber)).join("")}</div></section>`
          : ""
      }`;
  }

  async function hydrateAccountProofs() {
    const images = $$("[data-account-proof]");
    await Promise.all(
      images.map(async (image) => {
        const [recordId, indexText] = image.dataset.accountProof.split(":");
        const record = db.finance.find((item) => String(item.id) === recordId);
        const file = record && (record.anexos || [])[Number(indexText)];
        if (!file) return;
        const blob = await resolveAnexoBlob(file);
        if (!blob || !String(blob.type || file.type).startsWith("image/"))
          return;
        image.src = URL.createObjectURL(blob);
      }),
    );
  }

  function exportAccountCSV(rows, range) {
    const columns = [
      "Data",
      "Empresa",
      "Tipo",
      "Parceiro",
      "Centro de custo",
      "Previsto",
      "Recebido no período",
      "Saída",
      "Comprovantes",
    ];
    const lines = rows.map((record) => {
      const received = receiptCashEvents(record)
        .filter((event) => inAccountRange(event.data, range))
        .reduce((total, event) => total + event.value, 0);
      const values = [
        record.data || "",
        record.sub || "",
        finTipo(record),
        record.parceiro || "",
        record.centro || "",
        money(record.previsto).toFixed(2),
        received.toFixed(2),
        money(record.saida).toFixed(2),
        (record.anexos || []).length,
      ];
      return values
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(";");
    });
    const blob = new Blob(
      ["\ufeff" + [columns.join(";"), ...lines].join("\r\n")],
      { type: "text/csv;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `prestacao-contas-${range.start || "completo"}-${range.end || "atual"}.csv`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function accountYearList() {
    const years = new Set(compOptions().map((item) => item.slice(0, 4)));
    const current = todayISO().slice(0, 4);
    years.add(current);
    for (let year = Number(current) - 4; year <= Number(current) + 1; year++)
      years.add(String(year));
    return [...years].sort().reverse();
  }
  function accountMonthSelectHTML(id, value) {
    const selected = /^\d{4}-\d{2}$/.test(value)
      ? value
      : todayISO().slice(0, 7);
    const months = new Set(compOptions());
    months.add(selected);
    return `<select class="control" id="${id}" lang="pt-BR">${[...months]
      .sort()
      .reverse()
      .map(
        (item) =>
          `<option value="${esc(item)}" ${item === selected ? "selected" : ""}>${esc(compLabel(item))}</option>`,
      )
      .join("")}</select>`;
  }
  function accountYearSelectHTML(id, value) {
    const selected = /^\d{4}$/.test(value) ? value : todayISO().slice(0, 4);
    return `<select class="control" id="${id}" lang="pt-BR">${accountYearList()
      .map(
        (year) =>
          `<option value="${esc(year)}" ${year === selected ? "selected" : ""}>${esc(year)}</option>`,
      )
      .join("")}</select>`;
  }
  function accountDateSelectHTML(id, value) {
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : todayISO();
    const year = iso.slice(0, 4);
    const month = iso.slice(5, 7);
    const daysInMonth = new Date(Number(year), Number(month), 0).getDate();
    const day = String(
      Math.min(Number(iso.slice(8, 10)) || 1, daysInMonth),
    ).padStart(2, "0");
    const days = Array.from({ length: daysInMonth }, (_, index) =>
      String(index + 1).padStart(2, "0"),
    );
    return `<div class="br-date-fields" data-br-date="${esc(id)}" lang="pt-BR"><select class="control" id="${id}-d" aria-label="Dia">${days.map((item) => `<option value="${item}" ${item === day ? "selected" : ""}>${Number(item)}</option>`).join("")}</select><select class="control" id="${id}-m" aria-label="Mês">${MESES.map(
      (name, index) => {
        const code = String(index + 1).padStart(2, "0");
        return `<option value="${code}" ${code === month ? "selected" : ""}>${name}</option>`;
      },
    ).join(
      "",
    )}</select><select class="control" id="${id}-y" aria-label="Ano">${accountYearList()
      .map(
        (item) =>
          `<option value="${esc(item)}" ${item === year ? "selected" : ""}>${esc(item)}</option>`,
      )
      .join("")}</select></div>`;
  }
  function readAccountDateSelect(id) {
    const dayEl = $("#" + id + "-d");
    const monthEl = $("#" + id + "-m");
    const yearEl = $("#" + id + "-y");
    if (!dayEl || !monthEl || !yearEl) return "";
    const year = yearEl.value;
    const month = monthEl.value;
    const maxDay = new Date(Number(year), Number(month), 0).getDate();
    const day = String(Math.min(Number(dayEl.value) || 1, maxDay)).padStart(
      2,
      "0",
    );
    return `${year}-${month}-${day}`;
  }
  function wireAccountDateSelect(id, stateKey, onDone) {
    const update = () => {
      state[stateKey] = readAccountDateSelect(id);
      (onDone || drawAccountability)();
    };
    ["d", "m", "y"].forEach((part) => {
      const element = $("#" + id + "-" + part);
      if (element) element.onchange = update;
    });
  }
  function finHistRange() {
    const mode = state.finHistPeriod || "all";
    if (mode === "all") return { start: "", end: "", label: "Todo o período" };
    if (mode === "year") {
      const year = /^\d{4}$/.test(state.finHistYear)
        ? state.finHistYear
        : todayISO().slice(0, 4);
      return {
        start: `${year}-01-01`,
        end: `${year}-12-31`,
        label: `Ano de ${year}`,
      };
    }
    if (mode === "custom") {
      const start = state.finHistFrom || "";
      const end = state.finHistTo || "";
      return {
        start,
        end,
        label:
          start && end
            ? `${dateBR(start)} a ${dateBR(end)}`
            : "Período personalizado",
      };
    }
    if (mode === "week") {
      const base = /^\d{4}-\d{2}-\d{2}$/.test(state.finHistWeek)
        ? state.finHistWeek
        : todayISO();
      const date = new Date(base + "T12:00:00");
      const day = date.getDay() || 7;
      date.setDate(date.getDate() - day + 1);
      const start = date.toLocaleDateString("en-CA");
      date.setDate(date.getDate() + 6);
      const end = date.toLocaleDateString("en-CA");
      return { start, end, label: `${dateBR(start)} a ${dateBR(end)}` };
    }
    const selected = /^\d{4}-\d{2}$/.test(state.finHistMonth)
      ? state.finHistMonth
      : todayISO().slice(0, 7);
    const bounds = monthBounds(selected);
    const endDate = new Date(bounds.end + "T12:00:00");
    endDate.setDate(endDate.getDate() - 1);
    return {
      start: bounds.start,
      end: endDate.toLocaleDateString("en-CA"),
      label: compLabel(selected),
    };
  }
  function inFinHistRange(date, range) {
    if (!range.start && !range.end) return true;
    if (!isFinancialDate(date)) return false;
    if (range.start && date < range.start) return false;
    if (range.end && date > range.end) return false;
    return true;
  }
  function drawAccountability() {
    const filters = $("#account-filters");
    const report = $("#account-report");
    if (!filters || !report) return;
    const mode = state.accountPeriod || "month";
    filters.innerHTML = `<div class="field"><label>Periodicidade</label><select class="control" id="account-period" lang="pt-BR"><option value="week" ${mode === "week" ? "selected" : ""}>Semanal</option><option value="month" ${mode === "month" ? "selected" : ""}>Mensal</option><option value="year" ${mode === "year" ? "selected" : ""}>Anual</option><option value="custom" ${mode === "custom" ? "selected" : ""}>Período personalizado</option><option value="all" ${mode === "all" ? "selected" : ""}>Todo o período</option></select></div><div class="field account-mode account-mode-week" ${mode === "week" ? "" : "hidden"}><label>Semana de referência</label>${accountDateSelectHTML("account-week", state.accountWeek)}</div><div class="field account-mode account-mode-month" ${mode === "month" ? "" : "hidden"}><label>Mês</label>${accountMonthSelectHTML("account-month", state.accountMonth)}</div><div class="field account-mode account-mode-year" ${mode === "year" ? "" : "hidden"}><label>Ano</label>${accountYearSelectHTML("account-year", state.accountYear)}</div><div class="field account-mode account-mode-custom" ${mode === "custom" ? "" : "hidden"}><label>Data inicial</label>${accountDateSelectHTML("account-from", state.accountFrom || todayISO())}</div><div class="field account-mode account-mode-custom" ${mode === "custom" ? "" : "hidden"}><label>Data final</label>${accountDateSelectHTML("account-to", state.accountTo || todayISO())}</div><div class="field"><label>Empresa</label><select class="control" id="account-company"><option value="">Consolidado</option>${subdivisions.map((company) => `<option value="${esc(company)}" ${state.accountCompany === company ? "selected" : ""}>${esc(company)}</option>`).join("")}</select></div><div class="field"><label>Comprovantes</label><select class="control" id="account-files"><option value="all" ${state.accountFiles === "all" ? "selected" : ""}>Todos os lançamentos</option><option value="with" ${state.accountFiles === "with" ? "selected" : ""}>Com comprovante</option><option value="without" ${state.accountFiles === "without" ? "selected" : ""}>Sem comprovante</option></select></div><div class="field account-search"><label>Localizar lançamento</label><input type="search" class="control" id="account-query" value="${esc(state.accountQuery)}" placeholder="Empresa, parceiro, centro ou observação"></div>`;
    const redraw = (key, value) => {
      state[key] = value;
      drawAccountability();
    };
    const links = [
      ["account-period", "accountPeriod"],
      ["account-month", "accountMonth"],
      ["account-year", "accountYear"],
      ["account-company", "accountCompany"],
      ["account-files", "accountFiles"],
      ["account-query", "accountQuery"],
    ];
    links.forEach(([id, key]) => {
      const element = $("#" + id);
      if (element)
        element.onchange = (event) => redraw(key, event.target.value);
    });
    if (mode === "week") wireAccountDateSelect("account-week", "accountWeek");
    if (mode === "custom") {
      if (!state.accountFrom) state.accountFrom = todayISO();
      if (!state.accountTo) state.accountTo = todayISO();
      wireAccountDateSelect("account-from", "accountFrom");
      wireAccountDateSelect("account-to", "accountTo");
    }
    const range = accountabilityRange();
    const scope = accountScopeRows();
    const rows = accountReportRows(scope, range);
    const cash = accountCashSummary(scope, range);
    const companies = accountCompanySummary(range);
    report.innerHTML = accountReportHTML(rows, range, cash, companies);
    $("#account-result-count").textContent =
      `${rows.length} lançamento${rows.length === 1 ? "" : "s"} no relatório`;
    $("#account-clear").onclick = () => {
      Object.assign(state, {
        accountPeriod: "month",
        accountMonth: todayISO().slice(0, 7),
        accountYear: todayISO().slice(0, 4),
        accountWeek: todayISO(),
        accountFrom: "",
        accountTo: "",
        accountCompany: "",
        accountFiles: "all",
        accountQuery: "",
      });
      drawAccountability();
    };
    $("#account-export-csv").onclick = () => exportAccountCSV(rows, range);
    $("#account-print").onclick = async () => {
      const button = $("#account-print");
      button.disabled = true;
      button.innerHTML = `${icon("clock")}Preparando…`;
      await hydrateAccountProofs();
      document.body.classList.add("printing-accountability");
      window.print();
      setTimeout(() => {
        document.body.classList.remove("printing-accountability");
        button.disabled = false;
        button.innerHTML = `${icon("file")}Imprimir`;
      }, 500);
    };
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
  function recordsWithoutReceivedDate() {
    return db.finance
      .filter((record) => {
        if (finKind(record) === "saida" || money(record.recebido) <= 0)
          return false;
        const events = receiptCashEvents(record);
        return (
          !isFinancialDate(record.dataRecebida) ||
          events.some((event) => !isFinancialDate(event.data))
        );
      })
      .sort(
        (a, b) =>
          String(b.data || "").localeCompare(String(a.data || "")) ||
          String(a.sub || "").localeCompare(String(b.sub || ""), "pt-BR"),
      );
  }
  function drawCorrections() {
    const table = $("#correction-table");
    if (!table) return;
    const rows = recordsWithoutReceivedDate();
    const total = rows.reduce((sum, record) => sum + money(record.recebido), 0);
    const count = $("#correction-count");
    if (count)
      count.textContent = `${rows.length} ${rows.length === 1 ? "lançamento pendente" : "lançamentos pendentes"}`;
    const summary = $("#correction-summary");
    if (summary)
      summary.innerHTML = `<span><small>Registros</small><strong>${rows.length}</strong></span><span><small>Valor recebido</small><strong>${fmt(total)}</strong></span>`;
    table.innerHTML = `<table class="correction-table"><thead><tr><th>Data do lançamento</th><th>Empresa</th><th>Parceiro / descrição</th><th>Tipo</th><th class="num">Valor recebido (R$)</th><th>Data recebida</th><th>Empresa depositante</th><th>Conta bancária</th><th>Responsável</th><th class="action-cell">Ações</th></tr></thead><tbody>${
      rows
        .map(
          (record) =>
            `<tr><td data-label="Data do lançamento" class="nowrap">${dateBR(record.data)}</td><td data-label="Empresa"><b>${esc(record.sub || "—")}</b></td><td data-label="Parceiro / descrição">${esc(record.parceiro || "—")}</td><td data-label="Tipo"><span class="tipo rec">${esc(finTipo(record))}</span></td><td data-label="Valor recebido (R$)" class="amount">${fmt(record.recebido)}</td><td data-label="Data recebida"><span class="correction-missing">Não informada</span></td><td data-label="Empresa depositante">${esc(record.empresaDepositante || "—")}</td><td data-label="Conta bancária">${esc(record.contaBancaria || "—")}</td><td data-label="Responsável">${esc(record.criadoPor || "—")}</td><td data-label="Ações" class="action-cell correction-actions"><button type="button" class="edit-action" data-edit-fin="${esc(record.id)}">${icon("edit")}Editar</button>${canDeleteFinance() ? `<button type="button" class="edit-action danger" data-delete-fin="${esc(record.id)}" data-delete-source="correction">${icon("trash")}Excluir</button>` : ""}</td></tr>`,
        )
        .join("") ||
      noRows(
        "Nenhum lançamento sem data recebida. O caixa está conciliado.",
        10,
      )
    }</tbody></table>`;
  }

  /* ---------- TEMPORÁRIO: lançamentos duplicados ----------
   * Suspeita de duplicidade = mesma empresa, mesmo tipo, mesmo valor,
   * datas iguais ou até DUP_DAYS dias de distância, descrição igual/parecida
   * e (quando as duas têm) a mesma conta bancária.
   * "Não é duplicado" fica gravado na auditoria (ação DUP_IGNORE_ACTION, com
   * os ids no detalhe), então vale para todo mundo e não precisa de tabela nova. */
  const DUP_DAYS = 3;
  const DUP_IGNORE_ACTION = "Lançamentos marcados como não duplicados";
  const UUID_RE =
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  function dupValor(r) {
    if (finKind(r) === "saida") return money(r.saida);
    return money(r.previsto) || money(r.recebido);
  }
  function dupText(v) {
    return String(v || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, " ")
      .trim();
  }
  function dupDay(d) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || ""));
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 : null;
  }
  function dupSimilarText(a, b) {
    const x = dupText(a),
      y = dupText(b);
    if (!x || !y || x === y) return true;
    if (Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x)))
      return true;
    const tx = new Set(x.split(" ").filter((w) => w.length > 1)),
      ty = new Set(y.split(" ").filter((w) => w.length > 1));
    if (!tx.size || !ty.size) return false;
    let common = 0;
    tx.forEach((w) => ty.has(w) && common++);
    return common / Math.min(tx.size, ty.size) >= 0.6;
  }
  /** Mesma empresa, tipo, valor e data igual/próxima (base da trava ao salvar). */
  function dupSameCore(a, b) {
    if (!a || !b || a.id === b.id) return false;
    const va = dupValor(a);
    if (va <= 0 || Math.abs(va - dupValor(b)) > 0.009) return false;
    if (dupText(a.sub) !== dupText(b.sub)) return false;
    if (finKind(a) !== finKind(b)) return false;
    const da = dupDay(a.data),
      dbDay = dupDay(b.data);
    if (da == null || dbDay == null) return a.data === b.data;
    return Math.abs(da - dbDay) <= DUP_DAYS;
  }
  function dupSuspect(a, b) {
    if (!dupSameCore(a, b)) return false;
    if (!dupSimilarText(a.parceiro, b.parceiro)) return false;
    const ca = dupText(a.contaBancaria),
      cb = dupText(b.contaBancaria);
    return !ca || !cb || ca === cb;
  }
  function dupIgnoredSets() {
    return (db.audit || [])
      .filter((a) => a && a.action === DUP_IGNORE_ACTION)
      .map(
        (a) =>
          new Set(
            (String(a.detail || "").match(UUID_RE) || []).map((x) =>
              x.toLowerCase(),
            ),
          ),
      )
      .filter((set) => set.size > 1);
  }
  function duplicateGroups() {
    const ignored = dupIgnoredSets();
    const isIgnored = (a, b) => {
      const x = String(a.id).toLowerCase(),
        y = String(b.id).toLowerCase();
      return ignored.some((set) => set.has(x) && set.has(y));
    };
    const buckets = new Map();
    for (const r of db.finance) {
      if (!r || !r.id) continue;
      const v = dupValor(r);
      if (v <= 0) continue;
      const key = dupText(r.sub) + "|" + finKind(r) + "|" + Math.round(v * 100);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(r);
    }
    const parent = new Map();
    const find = (id) => {
      while (parent.get(id) !== id) {
        parent.set(id, parent.get(parent.get(id)));
        id = parent.get(id);
      }
      return id;
    };
    for (const list of buckets.values()) {
      if (list.length < 2) continue;
      for (let i = 0; i < list.length; i++)
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i],
            b = list[j];
          if (!dupSuspect(a, b) || isIgnored(a, b)) continue;
          if (!parent.has(a.id)) parent.set(a.id, a.id);
          if (!parent.has(b.id)) parent.set(b.id, b.id);
          parent.set(find(a.id), find(b.id));
        }
    }
    const groups = new Map();
    for (const r of db.finance) {
      if (!r || !parent.has(r.id)) continue;
      const root = find(r.id);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(r);
    }
    const byCreated = (a, b) =>
      String(a.criadoEm || "").localeCompare(String(b.criadoEm || "")) ||
      String(a.data || "").localeCompare(String(b.data || ""));
    return [...groups.values()]
      .filter((g) => g.length > 1)
      .map((g) => g.sort(byCreated))
      .sort(
        (a, b) =>
          String(b[0].data || "").localeCompare(String(a[0].data || "")) ||
          String(a[0].sub || "").localeCompare(String(b[0].sub || ""), "pt-BR"),
      );
  }
  function dupWhen(iso) {
    return launchedAt(iso) ? `${launchedDateBR(iso)} ${timeBR(iso)}` : "—";
  }
  function drawDuplicates() {
    const wrap = $("#dup-groups");
    if (!wrap) return;
    const groups = duplicateGroups();
    const extras = groups.reduce((n, g) => n + g.length - 1, 0);
    const extraValue = groups.reduce(
      (n, g) => n + dupValor(g[0]) * (g.length - 1),
      0,
    );
    const summary = $("#dup-summary");
    if (summary)
      summary.innerHTML = `<span><small>Grupos</small><strong>${groups.length}</strong></span><span><small>Lançamentos a mais</small><strong>${extras}</strong></span><span><small>Valor repetido</small><strong>${fmt(extraValue)}</strong></span>`;
    if (!groups.length) {
      wrap.innerHTML = `<div class="panel panel-pad simple-empty"><h2>Nenhum lançamento duplicado</h2><p>Tudo certo por aqui. Este menu some sozinho quando não há duplicados.</p></div>`;
      return;
    }
    wrap.innerHTML = groups
      .map((g, gi) => {
        const first = g[0];
        const ids = g.map((r) => r.id).join(",");
        const rows = g
          .map((r, i) => {
            const del = canDeleteRec(r)
              ? `<button type="button" class="edit-action danger" data-delete-fin="${esc(r.id)}" data-delete-source="duplicate">${icon("trash")}Excluir</button>`
              : `<span class="muted dup-nodel" title="Editor só exclui o que ele mesmo lançou">Só quem lançou ou admin</span>`;
            return `<tr><td data-label="#">${i === 0 ? '<span class="pill ok">Mais antigo</span>' : `<span class="pill warn">Repetido ${i}</span>`}</td><td data-label="Data" class="nowrap">${dateBR(r.data)}</td><td data-label="Descrição"><b>${esc(r.parceiro || "—")}</b>${r.observacao ? `<div class="muted">${esc(r.observacao)}</div>` : ""}</td><td data-label="Valor" class="amount">${fmt(dupValor(r))}</td><td data-label="Empresa"><b>${esc(r.sub || "—")}</b></td><td data-label="Centro">${esc(r.centro || "—")}</td><td data-label="Conta / banco">${esc(r.contaBancaria || "—")}</td><td data-label="Quem lançou">${esc(r.criadoPor || "—")}</td><td data-label="Quando lançou" class="nowrap">${dupWhen(r.criadoEm)}</td><td data-label="Comprovante">${fileCell(r.anexos, "fin:" + r.id)}</td><td data-label="Ações" class="action-cell correction-actions"><button type="button" class="edit-action" data-edit-fin="${esc(r.id)}">${icon("edit")}Editar</button>${del}</td></tr>`;
          })
          .join("");
        return `<div class="panel correction-ledger dup-group"><div class="section-head panel-pad correction-ledger-head dup-group-head"><div><h2>Grupo ${gi + 1} · ${esc(first.sub || "Sem empresa")} · ${esc(finTipo(first))} · ${fmt(dupValor(first))}</h2><span class="muted">${g.length} lançamentos parecidos</span></div><button type="button" class="btn" data-dup-ignore="${esc(ids)}">${icon("check")}Não é duplicado</button></div><div class="table-wrap dup-table-wrap"><table class="correction-table dup-table"><thead><tr><th></th><th>Data</th><th>Descrição</th><th class="num">Valor</th><th>Empresa</th><th>Centro</th><th>Conta / banco</th><th>Quem lançou</th><th>Quando lançou</th><th>Comprovante</th><th class="action-cell">Ações</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
      })
      .join("");
  }
  /** Trava ao salvar: devolve o lançamento parecido que já existe (ou null). */
  function findExistingDuplicate(rec, old) {
    if (!rec) return null;
    if (
      old &&
      dupText(old.sub) === dupText(rec.sub) &&
      finKind(old) === finKind(rec) &&
      Math.abs(dupValor(old) - dupValor(rec)) < 0.01 &&
      old.data === rec.data
    )
      return null; // edição que não mexeu em empresa/tipo/valor/data
    const ids = new Set([rec.id, old?.id].filter(Boolean));
    const matches = db.finance.filter(
      (r) => r && !ids.has(r.id) && dupSameCore(rec, r),
    );
    if (!matches.length) return null;
    const recDay = dupDay(rec.data) ?? 0;
    matches.sort(
      (a, b) =>
        Number(dupSimilarText(b.parceiro, rec.parceiro)) -
          Number(dupSimilarText(a.parceiro, rec.parceiro)) ||
        Math.abs((dupDay(a.data) ?? 0) - recDay) -
          Math.abs((dupDay(b.data) ?? 0) - recDay),
    );
    return { match: matches[0], total: matches.length };
  }
  function confirmDuplicateSave(rec, old) {
    const found = findExistingDuplicate(rec, old);
    if (!found) return true;
    const r = found.match;
    const d = r.data ? dateBR(r.data).slice(0, 5) : "—";
    const more =
      found.total > 1 ? `\n(e mais ${found.total - 1} parecido(s))` : "";
    return confirm(
      `Atenção: possível lançamento repetido!\n\nJá existe um lançamento de ${fmt(dupValor(r))} para a empresa ${r.sub || "—"} em ${d}: ${r.parceiro || "sem descrição"}` +
        (r.criadoPor ? ` (lançado por ${r.criadoPor})` : "") +
        `.${more}\n\nOK = salvar mesmo assim\nCancelar = voltar sem salvar`,
    );
  }
  function companyPicker(where) {
    $(where).innerHTML =
      `<div class="ctx-companies" aria-label="Empresa"><button type="button" class="co ${!state.empresa ? "selected" : ""}" data-select-company="">Todas as Empresas</button>${subdivisions.map((n) => `<button type="button" class="co ${state.empresa === n ? "selected" : ""}" data-select-company="${esc(n)}">${esc(n)}</button>`).join("")}</div>`;
  }
  function costChart(rows) {
    const groups = [...new Set(rows.map((r) => r.centro || "Sem centro"))].sort(
      compareCentro,
    );
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
    if (page === "dashboard") {
      const companyRows = financeRowsByCompany();
      const snapshots = companySnapshots(companyRows);
      dashCompanyTabs(companyRows, snapshots);
      drawDashboard(companyRows, snapshots);
    } else if (page === "financeiro") {
      companyPicker("#company-picker-financeiro");
      costChart(financeFiltered());
      drawFinance();
    } else if (page === "empresas") {
      drawEmpresas();
    } else if (page === "pendentes") {
      drawPendentes();
    } else if (page === "receber") {
      drawReceber();
    } else if (page === "pagar") {
      drawPagar();
    } else if (page === "historico") {
      drawFinancialHistory();
    } else if (page === "tarefas-historico") {
      drawAccountability();
    } else if (page === "demandas" || page === "minhas") {
      drawTasks();
      renderTaskFilters();
    } else if (page === "anexos") {
      drawAnexos();
    } else if (page === "auditoria") {
      drawAudit();
    } else if (page === "sem-data-recebida") {
      drawCorrections();
    } else if (page === "duplicados") {
      drawDuplicates();
    } else if (page === "configuracoes") {
      drawSettings();
    }
    updateCounts();
    updateBell();
  }
  function goto(p) {
    if (p === "demandas" && !MB.admin) p = "minhas";
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
    $("#modal-layer .modal").className = "modal";
    $("#modal-body").innerHTML =
      `<p class="field-note wide">Registro original ${esc(r.aba)} · linha ${r.linha}. A edição fica registrada localmente, sem alterar o arquivo Excel.</p>${["nome", "descricao", "banco", "extrato", "situacao", "observacao"].map((k) => field({ nome: "Nome", descricao: "Descrição / tarefa", banco: "Banco / origem", extrato: "Nome no extrato", situacao: "Situação original", observacao: "Observação" }[k], k, r[k] || "")).join("")}${field("Data", "data", r.data || "", "date")}<div class="field"><label>Valor (R$)</label><input class="control money-input" inputmode="numeric" name="valor" value="${inputBRL(r.valor || 0)}"></div>${anexoField(r.anexos)}`;
    wireFinDropzones($("#modal-body"));
    $$(".money-input").forEach((el) =>
      el.addEventListener("input", () => maskBRL(el)),
    );
    $("#modal-layer").classList.add("open");
  }
  const TASK_MODAL_KINDS = ["task", "conclude", "realizar", "vincular"];
  function openModal(kind, id = null) {
    typeModal = kind;
    editing = id;
    removedAttachments = new Set();
    const obj = id
      ? (TASK_MODAL_KINDS.includes(kind) ? db.tasks : db.finance).find(
          (x) => x.id === id,
        )
      : null;
    $("#modal-title").textContent =
      kind === "conclude"
        ? "Concluir tarefa"
        : kind === "realizar"
          ? "Realizar tarefa"
          : kind === "vincular"
            ? "Selecionar lançamentos"
            : kind === "recebimento"
              ? "Registrar recebimento"
              : kind === "contato"
                ? "Registrar contato"
                : (id ? "Editar " : "Novo ") +
                  (kind === "task" ? "tarefa" : "lançamento financeiro");
    let html = "";
    if (kind === "recebimento") {
      if (!obj) {
        toast("Lançamento não encontrado.");
        return;
      }
      html += `<div class="fin-info-banner wide">${FIN_ICONS.info}<span>Informe a data e o valor recebido.</span></div><div class="field"><label>Data do recebimento *</label><input class="control" name="novaBaixaData" type="date" value="${esc(todayISO())}" required></div><div class="field"><label>Valor recebido (R$) *</label><input class="control money-input fin-money" name="novaBaixaValor" inputmode="numeric" value="${inputBRL(finFalta(obj))}" placeholder="R$ 0,00" required></div>`;
    } else if (kind === "contato") {
      if (!obj) {
        toast("Lançamento não encontrado.");
        return;
      }
      const hist = finContatos(obj)
        .slice()
        .sort((a, b) =>
          String(b.data + (b.at || "")).localeCompare(
            String(a.data + (a.at || "")),
          ),
        );
      html += `<div class="contato-register"><p class="field-note wide"><b>${esc(obj.sub || "—")}</b> · ${esc(obj.parceiro || "—")} · falta receber <b>${fmt(finFalta(obj))}</b></p><div class="field"><label>Data do contato</label><input class="control" name="contatoData" type="date" value="${esc(todayISO())}" required></div><div class="field"><label>Previsão de pagamento (opcional)</label><input class="control" name="contatoPrevisao" type="date"></div><div class="field wide"><label>O que foi dito</label><div class="contato-chips">${CONTATO_SUGESTOES.map((t) => `<button type="button" class="contato-chip" data-contato-chip="${esc(t)}">${esc(t)}</button>`).join("")}</div><textarea class="control" name="contatoNota" placeholder="Ex.: Diz que paga na segunda" required></textarea></div>${hist.length ? `<div class="form-section">Contatos anteriores</div><ul class="contato-hist wide">${hist.map((c) => `<li><span class="muted nowrap">${dateBR(c.data)}${c.actor ? " · " + esc(c.actor) : ""}</span> ${esc(c.nota)}${c.previsao ? ` <span class="pill info">prev. ${dateBR(c.previsao)}</span>` : ""}</li>`).join("")}</ul>` : ""}</div>`;
    } else if (kind === "task") {
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
    } else if (kind === "conclude") {
      html += `<div class="form-section">Tarefa</div><div class="conclude-summary"><b>${esc(obj?.titulo || "")}</b><div class="muted">${esc(obj?.nome || "Favorecido não informado")}</div><div class="muted">Prazo: ${dateBR(obj?.prazo)} · Valor: ${fmt(obj?.valor || 0)}</div></div>`;
      html += field(
        "Data de execução",
        "dataExecucao",
        obj?.dataExecucao || todayISO(),
        "date",
      );
      html += field(
        "Observação da prestação",
        "observacao",
        obj?.observacao || "",
      );
    } else if (kind === "realizar") {
      const recentes = lancamentosVinculaveis(obj).slice(0, 10);
      html += `<div class="form-section">Tarefa</div><div class="conclude-summary"><b>${esc(obj?.titulo || "")}</b><div class="muted">${esc(obj?.nome || "Favorecido não informado")}</div><div class="muted">Prazo: ${dateBR(obj?.prazo)} · Valor a bater: ${fmt(obj?.valor || 0)}</div></div>`;
      html += `<p class="field-note wide">Vá em <b>Financeiro</b> e registre o pagamento desse compromisso (um ou mais lançamentos de saída). Quando terminar, clique abaixo para selecionar o(s) lançamento(s) que correspondem a essa tarefa.</p>`;
      html += `<div class="form-section">Últimos lançamentos</div>`;
      html += recentes.length
        ? `<div class="vincular-list vincular-list-readonly">${recentes
            .map(
              (f) =>
                `<div class="vincular-row"><span class="vincular-desc">${dateBR(f.data)} · ${esc(f.parceiro)}${f.sub ? " · " + esc(f.sub) : ""}</span><b class="num">${fmt(f.saida)}</b></div>`,
            )
            .join("")}</div>`
        : `<p class="field-note wide">Nenhum lançamento de saída ainda.</p>`;
      html += `<div class="field wide"><button type="button" class="btn" id="realizar-ir-financeiro">${icon("wallet")} Abrir Financeiro</button></div>`;
    } else if (kind === "vincular") {
      const candidatos = lancamentosVinculaveis(obj);
      html += `<div class="form-section">Tarefa</div><div class="conclude-summary"><b>${esc(obj?.titulo || "")}</b><div class="muted">${esc(obj?.nome || "Favorecido não informado")}</div><div class="muted">Valor a bater: ${fmt(obj?.valor || 0)}</div></div>`;
      html += `<div class="form-section">Lançamentos de saída recentes</div><p class="field-note wide">Marque o(s) lançamento(s) que correspondem a essa tarefa. Um lançamento já vinculado a outra tarefa não aparece aqui.</p>`;
      html += `<div id="vincular-total" class="vincular-total"></div>`;
      html += candidatos.length
        ? `<div class="vincular-list" id="vincular-list">${candidatos
            .map(
              (f) =>
                `<label class="vincular-row"><input type="checkbox" name="lanc" value="${esc(f.id)}" ${f.tarefaId === obj.id ? "checked" : ""}><span class="vincular-desc">${dateBR(f.data)} · ${esc(f.parceiro)}${f.sub ? " · " + esc(f.sub) : ""}</span><b class="num">${fmt(f.saida)}</b></label>`,
            )
            .join("")}</div>`
        : `<p class="field-note wide">Nenhum lançamento de saída disponível ainda.</p>`;
      html += `<div class="field wide"><button type="button" class="btn" id="realizar-ir-financeiro">${icon("wallet")} Lançar mais um pagamento</button></div>`;
    } else {
      const locked = !!obj;
      const selectedType = locked ? finKind(obj) : "receita";
      const rx = locked ? finRecebimentos(obj) : [];
      const finValue = (name, value, types) =>
        `<div class="field" data-fin-types="${types}" data-fin-value="${value}"><label>${name} (R$)${value === "previsto" ? "" : `<span data-fin-types="${value === "saida" ? "saida" : "entrada_por_fora"}"> *</span>`}</label><input class="control money-input fin-money" type="text" inputmode="numeric" autocomplete="off" name="${value}" value="${inputBRL(locked ? (value === "recebido" ? sumRecebimentos(rx) || obj.recebido || 0 : obj[value] || 0) : 0)}" placeholder="R$ 0,00"></div>`;
      if (locked) {
        window.__finHist = { obj: obj, key: "data", dir: "asc" };
        html += `<div class="fin-modal-tabs" role="tablist" aria-label="Seções do lançamento"><button type="button" class="active" data-fin-tab="dados" role="tab">Lançamento</button><button type="button" data-fin-tab="historico" data-fin-history-tab role="tab">Histórico</button></div>`;
        html += `<div data-fin-pane="dados" id="fin-dados-pane"><div class="fin-edit-main">`;
      } else {
        html += `<div class="fin-kind-banner wide" id="fin-kind-banner"><span class="fin-kind-ico" id="fin-kind-ico"></span><div><b id="fin-kind-title"></b><small id="fin-kind-help"></small></div></div>`;
      }
      html += `<div class="field wide fin-type-field"><label>Tipo de lançamento *</label><select class="control" name="tipoLancamento" id="fin-entry-type" required><option value="receita" ${selectedType === "receita" ? "selected" : ""}>Receita</option><option value="entrada_por_fora" ${selectedType === "entrada_por_fora" ? "selected" : ""}>Entrada por fora</option><option value="saida" ${selectedType === "saida" ? "selected" : ""}>Saída</option></select></div>`;
      html += `<div class="field"><label>Empresa *</label><select class="control" name="sub" required><option value="">Selecione</option>${subdivisions.map((s) => `<option value="${esc(s)}" ${(locked ? obj.sub : state.empresa) === s ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></div>`;
      html += `<div class="field"><label id="fin-partner-label">Parceiro *</label><input class="control" name="parceiro" type="text" value="${esc(obj?.parceiro || "")}" required></div>`;
      html += `<div class="field" data-fin-center><label>Centro de custo</label><select class="control" name="centro"><option value="">Não informado</option>${COST_CODES.map((code) => `<option value="${code}" ${(obj?.centro || "") === code ? "selected" : ""}>${code}${db.centers[code] ? " — " + esc(db.centers[code]) : ""}</option>`).join("")}</select></div>`;
      html += field("Data *", "data", obj?.data || todayISO(), "date", true);
      html += `<div class="field" data-fin-types="receita entrada_por_fora"><label id="fin-received-date-label">Data recebida</label><input class="control" name="dataRecebida" type="date" value="${esc(obj?.dataRecebida || "")}"></div>`;
      html += `<div class="field" data-fin-types="receita entrada_por_fora"><label>Empresa que depositou o pagamento</label><input class="control" name="empresaDepositante" value="${esc(obj?.empresaDepositante || "")}"></div>`;
      html += `<div class="field"><label>Conta Bancária</label><select class="control" name="contaBancaria"><option value="">Não informada</option>${[...new Set([...(obj?.contaBancaria ? [obj.contaBancaria] : []), ...(db.banks || [])])].map((x) => `<option value="${esc(x)}" ${obj?.contaBancaria === x ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></div>`;
      html += `<div class="form-section" data-fin-types="receita">Valores</div>`;
      html += finValue("A receber", "previsto", "receita");
      html += finValue("Recebido", "recebido", "receita entrada_por_fora");
      html += finValue("Saída", "saida", "saida");
      html += `<div class="field wide"><label>Observação</label><textarea class="control" name="observacao" placeholder="Informações adicionais do lançamento">${esc(obj?.observacao || "")}</textarea></div>`;
      if (locked) {
        html += `</div><aside class="fin-edit-side">`;
        html += `<section class="fin-side-card" data-fin-types="receita"><h4>${FIN_ICONS.plusCircle}Registrar recebimento</h4><div class="fin-side-grid"><div class="field"><label>Data do recebimento</label><input class="control" name="novaBaixaData" type="date" value=""></div><div class="field"><label>Valor recebido (R$)</label><input class="control money-input fin-money" name="novaBaixaValor" inputmode="numeric" value="${inputBRL(0)}" placeholder="R$ 0,00"></div></div><button type="button" class="btn primary fin-side-btn" data-fin-register-receipt>Registrar recebimento</button></section>`;
        html += `<section class="fin-side-card"><h4>${FIN_ICONS.doc}Comprovantes</h4>${attachmentsListHTML(obj?.anexos)}${finDropzoneHTML()}</section>`;
        html += `</aside></div>`;
        html += `<div data-fin-pane="historico" id="fin-hist-pane" class="hidden">${rxSheetHTML(obj, "data", "asc")}</div>`;
      }
    }
    if (kind === "recebimento" || (kind === "finance" && !obj))
      html += `<div class="field wide"><label>Anexar comprovante (foto ou PDF)</label>${finDropzoneHTML()}</div>`;
    else if (kind === "task" || kind === "conclude")
      html += `<div class="form-section">Comprovantes</div><div class="field wide"><label>Anexar comprovante (foto ou PDF)</label>${attachmentsListHTML(obj?.anexos)}${finDropzoneHTML()}</div>`;
    const modalBox = $("#modal-layer .modal");
    modalBox.className =
      "modal" +
      (kind === "finance"
        ? obj
          ? " fin-modal fin-modal-edit"
          : " fin-modal fin-modal-new"
        : kind === "recebimento"
          ? " fin-modal fin-modal-receipt"
          : "");
    $("#modal-body").innerHTML = html;
    wireFinDropzones($("#modal-body"));
    $$(".money-input").forEach((el) =>
      el.addEventListener("input", () => maskBRL(el)),
    );
    $("#modal-layer").classList.add("open");
    const submitBtn = $("#modal-form .modal-foot button[type=submit]");
    if (submitBtn) {
      submitBtn.textContent =
        kind === "conclude"
          ? "Marcar como concluída"
          : kind === "realizar"
            ? "Já lancei — selecionar lançamentos"
            : kind === "vincular"
              ? "Vincular selecionados"
              : kind === "recebimento"
                ? "Registrar recebimento"
                : kind === "contato"
                  ? "Salvar contato"
                  : "Salvar";
      submitBtn.hidden =
        kind === "vincular" && !lancamentosVinculaveis(obj).length;
    }
    if (kind === "task") {
      const tpl = $("#task-template");
      tpl.onchange = () => {
        if (tpl.value && !$("#modal-body [name=titulo]").value)
          $("#modal-body [name=titulo]").value = tpl.value;
      };
    }
    $("#realizar-ir-financeiro")?.addEventListener("click", () => {
      closeModal();
      goto("financeiro");
    });
    if (kind === "vincular") {
      const valoresPorId = new Map(
        lancamentosVinculaveis(obj).map((f) => [f.id, money(f.saida)]),
      );
      const updateVincularTotal = () => {
        const total = $$('#vincular-list input[name="lanc"]:checked').reduce(
          (s, el) => s + (valoresPorId.get(el.value) || 0),
          0,
        );
        const alvo = money(obj?.valor || 0);
        const diff = Math.round((total - alvo) * 100) / 100;
        const info =
          Math.abs(diff) < 0.01
            ? `<b class="ok-text">Bateu certinho!</b>`
            : diff < 0
              ? `Falta <b>${fmt(-diff)}</b> para bater`
              : `Passou <b>${fmt(diff)}</b> do valor`;
        $("#vincular-total").innerHTML =
          `Selecionado: <b>${fmt(total)}</b> de ${fmt(alvo)} — ${info}`;
      };
      $$('#vincular-list input[name="lanc"]').forEach((el) =>
        el.addEventListener("change", updateVincularTotal),
      );
      updateVincularTotal();
    }
    if (kind === "contato") {
      const nota = $("#modal-body [name=contatoNota]");
      $$("#modal-body [data-contato-chip]").forEach((b) =>
        b.addEventListener("click", () => {
          nota.value = b.dataset.contatoChip;
          nota.focus();
        }),
      );
      setTimeout(() => nota?.focus(), 50);
    } else if (kind === "recebimento") {
      const valor = $("#modal-body [name=novaBaixaValor]");
      setTimeout(() => {
        valor?.focus();
        valor?.select?.();
      }, 50);
    } else {
      $("#modal-body input")?.focus();
    }
    if (kind === "finance" && obj) {
      wireFinModalTabs();
    }
    if (kind === "finance") {
      wireFinanceTypeForm();
      wireFinanceCapsInputs();
    }
    $("#modal-body [data-fin-register-receipt]")?.addEventListener(
      "click",
      (ev) => {
        const d = $("#modal-body [name=novaBaixaData]");
        const v = $("#modal-body [name=novaBaixaValor]");
        if (!d.value || money(v.value) <= 0) {
          toast("Informe a data e o valor recebido.");
          (d.value ? v : d).focus();
          return;
        }
        $("#modal-form").requestSubmit(
          $("#modal-form .modal-foot button[type=submit]"),
        );
      },
    );
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
      const partner = body.querySelector("#fin-partner-label");
      if (partner)
        partner.textContent =
          type === "receita"
            ? "Parceiro *"
            : type === "entrada_por_fora"
              ? "Descrição do crédito *"
              : "Beneficiário / descrição *";
      body.dataset.finKind = type;
      const banner = body.querySelector("#fin-kind-banner");
      if (banner) {
        banner.dataset.kind = type;
        body.querySelector("#fin-kind-ico").innerHTML =
          type === "receita"
            ? FIN_ICONS.up
            : type === "entrada_por_fora"
              ? FIN_ICONS.plus
              : FIN_ICONS.down;
        body.querySelector("#fin-kind-title").textContent =
          type === "receita"
            ? "Receita"
            : type === "entrada_por_fora"
              ? "Entrada por fora"
              : "Saída";
        body.querySelector("#fin-kind-help").textContent =
          type === "receita"
            ? "Receita prevista, com controle de recebimentos e pendências."
            : type === "entrada_por_fora"
              ? "Crédito recebido diretamente (sem gerar pendência a receber)."
              : "Pagamento ou despesa realizada.";
      }
      const historyTab = body.querySelector("[data-fin-history-tab]");
      if (historyTab) {
        historyTab.hidden = type === "saida";
        if (type === "saida" && historyTab.classList.contains("active"))
          body.querySelector('[data-fin-tab="dados"]')?.click();
      }
      const received = body.querySelector('[name="recebido"]');
      const receivedDate = body.querySelector('[name="dataRecebida"]');
      const receivedDateLabel = body.querySelector("#fin-received-date-label");
      const correctionEdit = !!editing && page === "sem-data-recebida";
      const mustHaveReceivedDate =
        type !== "saida" &&
        (!editing || correctionEdit) &&
        money(received?.value) > 0;
      if (receivedDate) receivedDate.required = mustHaveReceivedDate;
      if (receivedDateLabel)
        receivedDateLabel.textContent = `Data recebida${mustHaveReceivedDate ? " *" : ""}`;
    };
    body.querySelector('[name="recebido"]')?.addEventListener("input", sync);
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
    if (typeModal === "conclude") {
      const t = db.tasks.find((x) => x.id === editing);
      if (!t) return;
      t.anexos = collectAnexos(t.anexos, e.target);
      const aviso = concluirTarefa(t, {
        dataExecucao: String(f.get("dataExecucao") || ""),
        observacao: String(f.get("observacao") || ""),
      });
      closeModal();
      render();
      toast("Tarefa concluída." + aviso);
      return;
    }
    if (typeModal === "realizar") {
      const t = db.tasks.find((x) => x.id === editing);
      if (!t) return;
      if (t.status === "Pendente") {
        t.status = "Em andamento";
        markMutation("taskUpserts", t.id);
        audit("Tarefa em andamento", t.titulo);
        save();
      }
      openModal("vincular", t.id);
      return;
    }
    if (typeModal === "vincular") {
      const t = db.tasks.find((x) => x.id === editing);
      if (!t) return;
      const selecionados = f.getAll("lanc").map(String);
      const msg = vincularLancamentosNaTarefa(t, selecionados);
      closeModal();
      render();
      toast(msg);
      return;
    }
    if (typeModal === "contato") {
      const old = db.finance.find((x) => x.id === editing);
      if (!old) return;
      const data = String(f.get("contatoData") || "").trim();
      const nota = String(f.get("contatoNota") || "").trim();
      const previsao = String(f.get("contatoPrevisao") || "").trim();
      if (!data || !nota) {
        toast("Informe a data e o que foi dito no contato.");
        return;
      }
      const rec = {
        ...old,
        contatos: finContatos(old).concat([
          {
            id: crypto.randomUUID(),
            data,
            nota,
            previsao,
            actor: MB.nome || "",
            at: new Date().toISOString(),
          },
        ]),
      };
      const idx = db.finance.findIndex((x) => x.id === old.id);
      if (idx >= 0) db.finance[idx] = rec;
      markMutation("financeUpserts", rec.id);
      audit(
        "Contato registrado",
        `Financeiro: ${old.sub || "—"} / ${old.parceiro || "—"} · ${nota}`,
      );
      save();
      closeModal();
      render();
      toast("Contato registrado");
      return;
    }
    if (typeModal === "recebimento") {
      const old = db.finance.find((x) => x.id === editing);
      if (!old) return;
      const addData = String(f.get("novaBaixaData") || "").trim();
      const addValor = money(f.get("novaBaixaValor"));
      if (!addData || addValor <= 0) {
        toast("Informe a data e o valor recebido.");
        return;
      }
      const existing = (old.anexos || []).filter(
        (_, i) => !removedAttachments.has(i),
      );
      const anexos = [
        ...existing,
        ...Array.from(e.target.elements.anexo?.files || []).map(storeFile),
      ];
      const rx = finRecebimentos(old).concat([
        {
          id: crypto.randomUUID(),
          data: addData,
          valor: addValor,
          actor: MB.nome || "",
          at: new Date().toISOString(),
        },
      ]);
      const totalRec = sumRecebimentos(rx);
      const lastRx = rx
        .slice()
        .sort((a, b) => String(a.data).localeCompare(String(b.data)))
        .pop();
      const rec = {
        ...old,
        recebido: totalRec,
        recebimentos: rx,
        dataRecebida: lastRx ? lastRx.data : old.dataRecebida || addData,
        anexos,
      };
      const idx = db.finance.findIndex((x) => x.id === old.id);
      if (idx >= 0) db.finance[idx] = rec;
      markMutation("financeUpserts", rec.id);
      audit(
        "Recebimento registrado",
        `Financeiro: ${old.parceiro || "—"} / ${old.centro || "—"} · ${fmt(addValor)} em ${dateBR(addData)}`,
      );
      save();
      closeModal();
      render();
      toast("Recebimento registrado");
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
      if (selectedFinanceType === "entrada_por_fora" && recebido <= 0) {
        toast("Informe um valor recebido maior que zero.");
        return;
      }
      if (selectedFinanceType === "saida" && saida <= 0) {
        toast("Informe um valor de saída maior que zero.");
        return;
      }
      const correctionEdit = !!editing && page === "sem-data-recebida";
      if (
        selectedFinanceType !== "saida" &&
        recebido > 0 &&
        (!editing || correctionEdit) &&
        !isFinancialDate(f.get("dataRecebida"))
      ) {
        toast("Informe a Data recebida para salvar este lançamento.");
        e.target.elements.dataRecebida?.focus();
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
        concluidoPor: old?.concluidoPor || "",
        concluidoEm: old?.concluidoEm || "",
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
        const dataRecebidaForm =
          selectedFinanceType === "saida"
            ? ""
            : String(f.get("dataRecebida") || "").trim();
        // Se a usuária altera "Data recebida" (ex.: fechar o mês em 30/06),
        // o caixa segue o histórico de recebimentos — alinha o último/único.
        if (
          dataRecebidaForm &&
          rx.length &&
          !(addData && addValor > 0) &&
          selectedFinanceType !== "saida"
        ) {
          const sorted = rx
            .slice()
            .sort((a, b) => String(a.data).localeCompare(String(b.data)));
          const last = sorted[sorted.length - 1];
          if (last && last.data !== dataRecebidaForm) {
            rx = rx.map((item) =>
              item.id === last.id ? { ...item, data: dataRecebidaForm } : item,
            );
          }
        }
        const lastRx = rx
          .slice()
          .sort((a, b) => String(a.data).localeCompare(String(b.data)))
          .pop();
        const parceiro = caps(f.get("parceiro"));
        const centro = String(f.get("centro") || "").trim();
        const data = f.get("data") || old.data;
        const dataRecebida =
          selectedFinanceType === "saida"
            ? ""
            : dataRecebidaForm || (lastRx ? lastRx.data : "");
        const empresaDepositante =
          selectedFinanceType === "saida"
            ? ""
            : caps(f.get("empresaDepositante"));
        const contaBancaria = String(f.get("contaBancaria") || "").trim();
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
          contaBancaria,
          demanda: old.demanda || "",
          sub,
          previsto: formPrevisto,
          recebido: totalRec,
          saida: formSaida,
          recebimentos: rx,
          observacao: caps(f.get("observacao")),
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
          saida = selectedFinanceType === "saida" ? money(f.get("saida")) : 0;
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
          parceiro: caps(f.get("parceiro")),
          centro: String(f.get("centro")).trim(),
          data: f.get("data"),
          dataRecebida:
            selectedFinanceType === "saida"
              ? ""
              : String(f.get("dataRecebida") || ""),
          empresaDepositante:
            selectedFinanceType === "saida"
              ? ""
              : caps(f.get("empresaDepositante")),
          contaBancaria: String(f.get("contaBancaria") || "").trim(),
          demanda: "",
          sub: String(f.get("sub") || state.empresa),
          previsto,
          recebido: sumRecebimentos(rx) || recebido0,
          saida,
          recebimentos: rx,
          observacao: caps(f.get("observacao")),
          anexos,
          origem: "Cadastro manual",
          criadoPor: MB.nome || "",
          criadoPorId: MB.userId || "",
          criadoEm: new Date().toISOString(),
        };
      }
    }
    if (typeModal === "finance" && !confirmDuplicateSave(rec, old)) {
      window.__mbFinAudit = null;
      return;
    }
    if (old) {
      if (typeModal !== "task") {
        rec.criadoEm = old.criadoEm || rec.criadoEm || "";
        rec.criadoPor = old.criadoPor || rec.criadoPor || MB.nome || "";
        rec.criadoPorId = old.criadoPorId || rec.criadoPorId || MB.userId || "";
      }
      arr[arr.indexOf(old)] = rec;
    } else {
      arr.push(rec);
    }
    if (
      typeModal === "task" &&
      rec.status === "Concluída" &&
      old?.status !== "Concluída"
    ) {
      rec.concluidoPor = rec.concluidoPor || MB.nome || "";
      rec.concluidoEm = rec.concluidoEm || new Date().toISOString();
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
      state.dashMenuOpen = false;
      clearFinanceAuditFilter();
      render();
      return;
    }
    const concludeTask = e.target.closest("[data-conclude-task]");
    if (concludeTask) {
      const id = concludeTask.dataset.concludeTask;
      const t = db.tasks.find((x) => x.id === id);
      if (!t) return;
      if (!samePerson(t.responsavel, MB.nome) && !MB.admin) {
        toast("Essa tarefa não está atribuída a você.");
        return;
      }
      openModal("conclude", id);
      return;
    }
    const realizarTask = e.target.closest("[data-realizar-task]");
    if (realizarTask) {
      const id = realizarTask.dataset.realizarTask;
      const t = db.tasks.find((x) => x.id === id);
      if (!t) return;
      if (!samePerson(t.responsavel, MB.nome) && !MB.admin) {
        toast("Essa tarefa não está atribuída a você.");
        return;
      }
      openModal(t.status === "Em andamento" ? "vincular" : "realizar", id);
      return;
    }
    const contatoPend = e.target.closest("[data-contato-pendente]");
    if (contatoPend) {
      openModal("contato", contatoPend.dataset.contatoPendente);
      return;
    }
    const lancarPend = e.target.closest("[data-lancar-pendente]");
    if (lancarPend) {
      lancarPendente(lancarPend.dataset.lancarPendente);
      return;
    }
    const dupIgnore = e.target.closest("[data-dup-ignore]");
    if (dupIgnore) {
      const ids = String(dupIgnore.dataset.dupIgnore || "")
        .split(",")
        .filter(Boolean);
      const rows = db.finance.filter((r) => ids.includes(r.id));
      if (rows.length < 2) return;
      if (
        !confirm(
          `Marcar estes ${rows.length} lançamentos como "não é duplicado"?\n\nO grupo sai desta lista (fica registrado na auditoria).`,
        )
      )
        return;
      const first = rows[0];
      audit(
        DUP_IGNORE_ACTION,
        `${first.sub || "—"} · ${fmt(dupValor(first))} · ${first.parceiro || "—"} · ids: ${rows.map((r) => r.id).join(",")}`,
      );
      render();
      toast("Grupo marcado como não duplicado.");
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
      const permanentCorrection =
        delFin.dataset.deleteSource === "correction" ||
        delFin.dataset.deleteSource === "duplicate";
      if (!r) return;
      if (!canDeleteFinance()) {
        toast("Sem permissão para excluir lançamentos.");
        return;
      }
      if (delFin.dataset.deleteSource === "duplicate" && !canDeleteRec(r)) {
        toast("Você só pode excluir o que você mesmo lançou.");
        return;
      }
      if (
        !confirm(
          permanentCorrection
            ? 'Excluir permanentemente o lançamento "' +
                (r.parceiro || "sem parceiro") +
                '" de ' +
                (r.sub || "empresa não informada") +
                "?\n\nEsta ação remove o registro da nuvem, não pode ser desfeita e ficará registrada na auditoria."
            : 'Excluir o lançamento "' +
                (r.parceiro || "sem parceiro") +
                " / " +
                (r.centro || "—") +
                '"? A exclusão fica registrada na auditoria.',
        )
      )
        return;
      db.finance = db.finance.filter((x) => x.id !== id);
      pruneDeletedFinanceId(id);
      markMutation("financeDeletes", id);
      audit(
        permanentCorrection
          ? "Lançamento excluído permanentemente"
          : "Lançamento excluído",
        "Financeiro: " +
          (r.parceiro || id) +
          " / " +
          (r.centro || "—") +
          (r.sub ? " · " + r.sub : "") +
          (r.criadoPor ? " · lançado por " + r.criadoPor : ""),
      );
      // Permanecer na mesma tela/filtros/página; render() só redesenha a lista.
      save();
      render();
      toast(
        permanentCorrection
          ? "Excluído permanentemente. Salvando na nuvem…"
          : "Excluído. Salvando na nuvem…",
      );
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
      "Conta Bancária",
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
      r.contaBancaria || "",
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
  $("#csv-export-all").onclick = () => {
    const rows = [...db.finance].sort((a, b) =>
      String(b.data || "").localeCompare(String(a.data || "")),
    );
    const columns = [
      "Tipo de lançamento",
      "Data",
      "Data recebida",
      "Parceiro",
      "Centro de custo",
      "Conta Bancária",
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
      r.contaBancaria || "",
      r.empresaDepositante || "",
      r.sub,
      r.previsto,
      r.recebido,
      r.saida,
      r.observacao || "",
    ]);
    const csv =
      "﻿" +
      [columns, ...vals]
        .map((row) =>
          row
            .map((v) => '"' + String(v ?? "").replaceAll('"', '""') + '"')
            .join(";"),
        )
        .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "assessoria-mb-todos-os-lancamentos.csv";
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
    const pendCount = $("#count-pendentes");
    if (pendCount) {
      const total = pendingRecords().length;
      pendCount.textContent = total || "";
      pendCount.title = total
        ? `${total} lançamento(s) com valor pendente`
        : "";
    }
    const missingDateCount = $("#count-sem-data-recebida");
    if (missingDateCount) {
      const total = recordsWithoutReceivedDate().length;
      missingDateCount.textContent = total || "";
      missingDateCount.classList.toggle("alert", total > 0);
      missingDateCount.title = total
        ? `${total} lançamento(s) precisam de correção`
        : "Nenhum lançamento pendente";
    }
    const dupNav = $("#nav-duplicados");
    if (dupNav) {
      const groups = duplicateGroups();
      const extras = groups.reduce((n, g) => n + g.length - 1, 0);
      dupNav.hidden = !groups.length;
      const dupCount = $("#count-duplicados");
      if (dupCount) {
        dupCount.textContent = extras || "";
        dupCount.title = extras
          ? `${groups.length} grupo(s), ${extras} lançamento(s) a mais`
          : "";
      }
    }
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
        const meta = [fmtBytes(f.size), f.createdAt ? dateBR(f.createdAt) : ""]
          .filter(Boolean)
          .join(" · ");
        const ver = f.signedUrl
          ? `<a class='att-view' href='${esc(f.signedUrl)}' target='_blank' rel='noopener'>${FIN_ICONS.eye}Visualizar</a>`
          : "";
        return `<div class='att-card' data-attachment-index='${i}'><div class='att-icon'>${finFileBadge(f.name)}</div><div class='att-info'><strong>${esc(f.name)}</strong>${meta ? `<span class='muted'>${esc(meta)}</span>` : ""}</div><div class='att-actions'>${ver}<button type='button' class='att-remove' data-remove-attachment='${i}' title='Remover anexo'>${FIN_ICONS.trash}</button></div></div>`;
      })
      .join("");
    return `<div class='att-list'>${cards}</div>`;
  }
  function anexoField(list) {
    return `<div class="form-section">Comprovantes</div><div class="field wide"><label>Anexar comprovante (foto ou PDF)</label>${attachmentsListHTML(list)}${finDropzoneHTML()}</div>`;
  }
  const FIN_ICONS = {
    up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20V5m-6 6 6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v15m-6-6 6 6 6-6"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    plusCircle:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>',
    info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.01"/></svg>',
    doc: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
    cloud:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9"/><path d="M12 12v7m-3-4 3-3 3 3"/></svg>',
    eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    trash:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  };
  function finFileBadge(name) {
    const ext = String(name || "").split(".").pop().toLowerCase();
    const isPdf = ext === "pdf";
    return `<span class="fin-file-badge ${isPdf ? "pdf" : "img"}">${FIN_ICONS.doc}<i>${isPdf ? "PDF" : esc(ext.slice(0, 4).toUpperCase() || "ARQ")}</i></span>`;
  }
  function finDropzoneHTML() {
    return `<div class="fin-drop" data-fin-drop><div class="att-list fin-drop-files" data-fin-drop-files></div><label class="fin-drop-zone"><input type="file" name="anexo" accept="image/*,.pdf" multiple class="fin-drop-input">${FIN_ICONS.cloud}<b class="fin-drop-extra">Adicionar outro comprovante (opcional)</b><span>Clique ou arraste arquivos aqui</span><small>(PDF, JPG ou PNG)</small></label></div>`;
  }
  function wireFinDropzones(root) {
    root?.querySelectorAll("[data-fin-drop]").forEach((wrap) => {
      const input = wrap.querySelector("input[type=file]");
      const zone = wrap.querySelector(".fin-drop-zone");
      const list = wrap.querySelector("[data-fin-drop-files]");
      let dt;
      try {
        dt = new DataTransfer();
      } catch {
        return;
      }
      const urls = [];
      const ok = (f) =>
        /^image\//.test(f.type) ||
        f.type === "application/pdf" ||
        /\.pdf$/i.test(f.name);
      const draw = () => {
        urls.splice(0).forEach((u) => URL.revokeObjectURL(u));
        list.innerHTML = Array.from(dt.files)
          .map((f, i) => {
            const u = URL.createObjectURL(f);
            urls.push(u);
            return `<div class="att-card"><div class="att-icon">${finFileBadge(f.name)}</div><div class="att-info"><strong>${esc(f.name)}</strong><span class="muted">${esc(fmtBytes(f.size))}</span></div><div class="att-actions"><a class="att-view" href="${u}" target="_blank" rel="noopener">${FIN_ICONS.eye}Visualizar</a><button type="button" class="att-remove" data-fin-drop-remove="${i}" title="Remover arquivo">${FIN_ICONS.trash}</button></div></div>`;
          })
          .join("");
        wrap.classList.toggle("has-files", dt.files.length > 0);
      };
      const add = (files) => {
        Array.from(files || []).forEach((f) => {
          if (ok(f)) dt.items.add(f);
        });
        input.files = dt.files;
        draw();
      };
      input.addEventListener("change", () => {
        const picked = Array.from(input.files);
        add(picked);
      });
      list.addEventListener("click", (e) => {
        const b = e.target.closest("[data-fin-drop-remove]");
        if (!b) return;
        dt.items.remove(Number(b.dataset.finDropRemove));
        input.files = dt.files;
        draw();
      });
      ["dragenter", "dragover"].forEach((ev) =>
        zone.addEventListener(ev, (e) => {
          e.preventDefault();
          zone.classList.add("drag");
        }),
      );
      ["dragleave", "drop"].forEach((ev) =>
        zone.addEventListener(ev, (e) => {
          e.preventDefault();
          zone.classList.remove("drag");
        }),
      );
      zone.addEventListener("drop", (e) => add(e.dataTransfer?.files));
    });
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
      title: "Conta Bancária",
      desc: "Contas usadas no campo Conta Bancária dos lançamentos (controle interno). Também alimenta a origem de pagamento das tarefas.",
      key: "banks",
      item: "conta",
      usage: (v) =>
        db.finance.filter((r) => r.contaBancaria === v).length +
        db.tasks.filter((t) => t.origemPagamento === v).length,
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
      normalizeFinanceCaps(db.finance);
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
    if (/^R:/.test(String(m))) {
      const [, de, ate] = String(m).split(":");
      if (de && ate) return `${dateBR(de)} a ${dateBR(ate)}`;
      return de ? `A partir de ${dateBR(de)}` : `Até ${dateBR(ate)}`;
    }
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
          data: r.dataRecebida || "",
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
    const saved = Array.isArray(record.recebimentos) ? record.recebimentos : [];
    if (saved.length) {
      return saved
        .map((item, index) => ({
          id: item.id || `${record.id}-rx-${index}`,
          rowId: record.id,
          company: record.sub || "",
          kind: finKind(record),
          launchData: isFinancialDate(record.data) ? String(record.data) : "",
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
        launchData: isFinancialDate(record.data) ? String(record.data) : "",
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
  function nextDayISO(iso) {
    const date = new Date(`${iso}T12:00:00`);
    date.setDate(date.getDate() + 1);
    return date.toLocaleDateString("en-CA");
  }
  function monthBounds(reference) {
    if (/^R:/.test(String(reference || ""))) {
      const [, de, ate] = String(reference).split(":");
      return {
        start: de || "0000-01-01",
        end: ate ? nextDayISO(ate) : "9999-12-31",
        range: true,
      };
    }
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
    const monthEntries = datedEntries.filter(
      (event) => event.data >= bounds.start && event.data < bounds.end,
    );
    const monthExits = datedExits.filter(
      (event) => event.data >= bounds.start && event.data < bounds.end,
    );
    const sumOf = (events) =>
      events.reduce((sum, event) => sum + event.value, 0);
    const entries = sumOf(monthEntries);
    const exits = sumOf(monthExits);
    const entriesFromMonth = sumOf(
      monthEntries.filter(
        (event) =>
          event.launchData &&
          event.launchData >= bounds.start &&
          event.launchData < bounds.end,
      ),
    );
    const entriesFromPrior = sumOf(
      monthEntries.filter(
        (event) => event.launchData && event.launchData < bounds.start,
      ),
    );
    const prior = beforeEntries - beforeExits;
    return {
      prior,
      entries,
      exits,
      exitCount: monthExits.length,
      entriesFromMonth,
      entriesFromPrior,
      entriesFromOther:
        Math.round((entries - entriesFromMonth - entriesFromPrior) * 100) / 100,
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
    const openAtCutoff = (record) => {
      const receivedAtCutoff = receiptCashEvents(record)
        .filter((event) => event.data && event.data < cutoff)
        .reduce((total, event) => total + event.value, 0);
      return Math.max(0, money(record.previsto) - receivedAtCutoff);
    };
    const pending = rows
      .filter(
        (record) =>
          finKind(record) === "receita" &&
          isFinancialDate(record.data) &&
          record.data < cutoff,
      )
      .reduce((sum, record) => sum + openAtCutoff(record), 0);
    const pendingMonth = launchRows.reduce(
      (sum, record) => sum + openAtCutoff(record),
      0,
    );
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
      pendingMonth,
    };
  }
  function financeKpiRecords(rows, reference, key) {
    const bounds = monthBounds(reference);
    const ledger = cashLedger(rows);
    const byIds = (ids) => {
      const selected = new Set(ids);
      return rows.filter((record) => selected.has(record.id));
    };
    const eventIds = (events) => [
      ...new Set(events.map((event) => event.rowId)),
    ];
    const inCashPeriod = (date) =>
      bounds
        ? date && date >= bounds.start && date < bounds.end
        : isFinancialDate(date);

    if (key === "forecast")
      return rows.filter(
        (record) => finKind(record) === "receita" && money(record.previsto) > 0,
      );
    if (key === "received-total")
      return rows.filter(
        (record) => finKind(record) !== "saida" && money(record.recebido) > 0,
      );
    if (key === "out-total")
      return rows.filter((record) => money(record.saida) > 0);
    if (key === "total-all")
      return rows.filter(
        (record) => money(record.recebido) > 0 || money(record.saida) > 0,
      );

    if (key === "pending") {
      const cutoff = bounds?.end || "9999-12-31";
      return rows.filter((record) => {
        if (
          finKind(record) !== "receita" ||
          !isFinancialDate(record.data) ||
          record.data >= cutoff
        )
          return false;
        const receivedAtCutoff = receiptCashEvents(record)
          .filter((event) => event.data && event.data < cutoff)
          .reduce((total, event) => total + event.value, 0);
        return money(record.previsto) - receivedAtCutoff > 0.005;
      });
    }
    if (key === "received")
      return byIds(
        eventIds(ledger.entries.filter((event) => inCashPeriod(event.data))),
      );
    if (key === "out")
      return byIds(
        eventIds(ledger.exits.filter((event) => inCashPeriod(event.data))),
      );
    if (key === "carry" && bounds)
      return byIds(
        eventIds(
          [...ledger.entries, ...ledger.exits].filter(
            (event) => event.data && event.data < bounds.start,
          ),
        ),
      );
    if (key === "total")
      return byIds(
        eventIds(
          [...ledger.entries, ...ledger.exits].filter((event) =>
            bounds
              ? event.data && event.data < bounds.end
              : isFinancialDate(event.data),
          ),
        ),
      );
    return [];
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
        "forecast",
      ],
      [
        "ok",
        "check",
        "Recebido",
        fmt(a.rec),
        `<small class="pos">${pct}% do previsto${a.recExtra ? ` · ${fmt(a.recExtra)} por fora` : ""}</small><div class="meter"><i style="width:${Math.min(100, pct)}%"></i></div>`,
        "received-total",
      ],
      [
        "out",
        "arrow",
        "Despesas / Saídas",
        fmt(a.sai),
        "<small>Total de saídas no período</small>",
        "out-total",
      ],
      [
        "bal",
        "database",
        "Saldo Líquido",
        fmt(saldo),
        "<small>Recebido – Saídas</small>",
        "total-all",
      ],
    ];
    $(container).innerHTML = k
      .map((x) => {
        const active =
          state.finReconcileIds && state.finSelectionKey === x[5]
            ? " is-active"
            : "";
        return `<button type="button" class="kpi ${x[0]}${active}" data-fin-kpi="${x[5]}" data-fin-kpi-source="dashboard" data-fin-kpi-label="${esc(x[2])}" title="Ver lançamentos deste indicador"><span class="kpi-ico">${icon(container === "#dash-metrics" ? DASH_KPI_ICONS[x[0]] || x[1] : x[1])}</span><span class="kpi-body"><span class="label">${x[2]}</span><strong class="${x[0] === "bal" && saldo < 0 ? "neg" : ""}" title="${x[3]}">${x[3]}</strong>${x[4]}</span></button>`;
      })
      .join("");
  }
  function drawDashboardKpis(rows) {
    const root = $("#dash-metrics");
    const ref = dashRef();
    if (!ref) {
      root.classList.remove("is-month");
      kpis("#dash-metrics", rows);
      return;
    }
    const isRange = /^R:/.test(ref);
    const snapshot = cashSnapshot(rows, ref);
    const stats = dashboardPeriodStats(rows, ref);
    const selectedLabel = isRange ? "" : compLabel(ref).split(" /")[0];
    let previousLabel = "";
    if (!isRange) {
      const previous = previousMonth(ref);
      const previousParts = previous.split("-");
      previousLabel =
        previousParts[0] === ref.split("-")[0]
          ? MESES[Number(previousParts[1]) - 1]
          : compLabel(previous);
    }
    const inLabel = isRange ? "no período" : `em ${selectedLabel}`;
    const entryLines = isRange
      ? [
          `${fmt(snapshot.entriesFromMonth)} de lançamentos do período`,
          `${fmt(snapshot.entriesFromPrior)} de lançamentos anteriores`,
        ]
      : [
          `${fmt(snapshot.entriesFromMonth)} de lançamentos de ${selectedLabel.toLowerCase()}`,
          `${fmt(snapshot.entriesFromPrior)} de lançamentos de meses anteriores`,
        ];
    if (Math.abs(snapshot.entriesFromOther) >= 0.005)
      entryLines.push(
        `${fmt(snapshot.entriesFromOther)} de outros lançamentos`,
      );
    const items = [
      [
        "carry",
        "history",
        isRange
          ? state.dashDe
            ? `Saldo antes de ${dateBR(state.dashDe)}`
            : "Saldo anterior"
          : `Ficou em ${previousLabel}`,
        fmt(snapshot.prior),
        esc(
          isRange
            ? "Saldo transportado para o período"
            : `Saldo transportado para ${selectedLabel}`,
        ),
        "carry",
      ],
      [
        "in",
        "down",
        `A Receber ${inLabel}`,
        fmt(stats.pending),
        esc(
          isRange
            ? `${fmt(stats.pendingMonth)} referente aos lançamentos do período`
            : `${fmt(stats.pendingMonth)} referente aos lançamentos de ${selectedLabel}`,
        ),
        "pending",
      ],
      [
        "cash-in",
        "arrow",
        `Recebido ${inLabel}`,
        fmt(snapshot.entries),
        `${esc(isRange ? "Dinheiro efetivamente recebido no período" : "Dinheiro efetivamente recebido no mês")}${entryLines
          .map((line) => `<span class="kpi-break">${esc(line)}</span>`)
          .join("")}`,
        "received",
      ],
      [
        "out",
        "arrow",
        `Saídas ${inLabel}`,
        fmt(snapshot.exits),
        esc(
          snapshot.exitCount
            ? `Total geral que saiu ${isRange ? "no período" : "no mês"} · ${snapshot.exitCount} saída(s)`
            : `Nenhuma saída registrada ${isRange ? "no período" : "no mês"}`,
        ),
        "out",
      ],
      [
        "bal",
        "database",
        isRange ? "Saldo no fim do período" : `Total em ${selectedLabel}`,
        fmt(snapshot.final),
        esc("Saldo anterior mais recebimentos menos saídas"),
        "total",
      ],
    ];
    root.classList.add("is-month");
    root.innerHTML = items
      .map((item) => {
        const active =
          state.finReconcileIds && state.finSelectionKey === item[5]
            ? " is-active"
            : "";
        return `<button type="button" class="kpi ${item[0]}${active}" data-fin-kpi="${item[5]}" data-fin-kpi-source="dashboard" data-fin-kpi-label="${esc(item[2])}" title="Ver lançamentos deste indicador"><span class="kpi-ico">${icon(DASH_KPI_ICONS[item[0]] || item[1])}</span><span class="kpi-body"><span class="label">${esc(item[2])}</span><strong class="${item[0] === "bal" && snapshot.final < 0 ? "neg" : ""}" title="${esc(item[3])}">${item[3]}</strong><small>${item[4]}</small></span></button>`;
      })
      .join("");
  }
  function cashSummaryTable(
    companyRows = financeRowsByCompany(),
    snapshots = companySnapshots(companyRows),
  ) {
    const rows = subdivisions.map((company) => {
      return [company, snapshots.get(company)];
    });
    const total = cashSnapshot([...companyRows.values()].flat(), dashRef());
    const priorCell = (value) =>
      value == null ? '<span class="muted">—</span>' : fmt(value);
    const isZero = ([company, snapshot]) =>
      company !== state.empresa &&
      Math.abs(Number(snapshot.prior) || 0) < 0.005 &&
      Math.abs(Number(snapshot.entries) || 0) < 0.005 &&
      Math.abs(Number(snapshot.exits) || 0) < 0.005;
    const active = rows.filter((row) => !isZero(row));
    const zero = rows.filter(isZero);
    const SUMMARY_SORT_KEYS = ["empresa", "prior", "entries", "exits", "final"];
    const sortBy = SUMMARY_SORT_KEYS.includes(state.dashSummarySortBy)
      ? state.dashSummarySortBy
      : "";
    const direction = state.dashSummarySort === "desc" ? -1 : 1;
    const compareRows = (a, b) => {
      if (sortBy === "empresa")
        return a[0].localeCompare(b[0], "pt-BR", { sensitivity: "base" });
      const difference =
        (Number(a[1][sortBy]) || 0) - (Number(b[1][sortBy]) || 0);
      return (
        difference || a[0].localeCompare(b[0], "pt-BR", { sensitivity: "base" })
      );
    };
    const empQ = fold(state.dashEmpQ.trim());
    const filtering =
      !!empQ || Object.values(state.dashColF.sum || {}).some(Boolean);
    const passes = ([company, snapshot]) =>
      (!empQ || fold(company).includes(empQ)) &&
      colPass("sum", "empresa", company) &&
      ["prior", "entries", "exits", "final"].every((k) =>
        colPass("sum", k, "", snapshot[k]),
      );
    const shown = [
      ...active,
      ...zero,
    ].filter(passes);
    if (sortBy) shown.sort((a, b) => compareRows(a, b) * direction);
    dashSummaryShown = shown;
    dashSummaryTotal = total;
    const summaryTh = (key, label, extraClass = "") =>
      dashTh("sum", key, "data-dash-summary-sort", sortBy, direction, extraClass);
    const emptyRow =
      !shown.length && filtering
        ? `<tr class="dash-zero-row"><td colspan="5" class="empty">Nenhuma empresa para esta busca ou filtro.</td></tr>`
        : "";
    const zeroRow = emptyRow;
    return `<table class="sum-table data-table cash-summary-table dash-grid-table"><thead><tr>${summaryTh("empresa", "Empresa")}${summaryTh("prior", "Saldo Anterior", "num")}${summaryTh("entries", "Entradas", "num")}${summaryTh("exits", "Saídas", "num")}${summaryTh("final", "Saldo Final", "num")}</tr></thead><tbody>${shown
      .map(
        ([company, snapshot]) =>
          `<tr class="clickable ${state.empresa === company ? "sel" : ""}" data-select-company="${state.empresa === company ? "" : esc(company)}" title="${state.empresa === company ? "Voltar ao consolidado" : `Filtrar painel por ${esc(company)}`}"><td class="sum-col-company"><b>${esc(company)}</b></td><td class="amount" data-label="Saldo Anterior">${priorCell(snapshot.prior)}</td><td class="amount" data-label="Entradas">${fmt(snapshot.entries)}</td><td class="amount" data-label="Saídas">${fmt(snapshot.exits)}</td><td class="amount ${snapshot.final < 0 ? "neg" : ""}" data-label="Saldo Final">${fmt(snapshot.final)}</td></tr>`,
      )
      .join(
        "",
      )}${zeroRow}</tbody><tfoot><tr><td class="sum-col-company">Total</td><td class="amount" data-label="Saldo Anterior">${priorCell(total.prior)}</td><td class="amount" data-label="Entradas">${fmt(total.entries)}</td><td class="amount" data-label="Saídas">${fmt(total.exits)}</td><td class="amount ${total.final < 0 ? "neg" : ""}" data-label="Saldo Final">${fmt(total.final)}</td></tr></tfoot></table>`;
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
        prev: launches.reduce((sum, record) => sum + money(record.previsto), 0),
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
    const ref = dashRef();
    const isRange = /^R:/.test(ref);
    const snapshot = cashSnapshot(rows, ref);
    const stats = dashboardPeriodStats(rows, ref);
    const touched = rows.filter((record) => stats.rowIds.has(record.id));
    const receitas = touched.filter(
      (record) => finKind(record) === "receita",
    ).length;
    const entradasFora = touched.filter(
      (record) => finKind(record) === "entrada_por_fora",
    ).length;
    const saidas = touched.filter(
      (record) => finKind(record) === "saida",
    ).length;
    const pct = stats.previsto
      ? Math.round((stats.recebidoReceitas / stats.previsto) * 100)
      : stats.recebidoReceitas
        ? 100
        : 0;
    const unknownCount =
      snapshot.unknownEntries.length + snapshot.unknownExits.length;
    const unknownIds = [
      ...new Set(
        [...snapshot.unknownEntries, ...snapshot.unknownExits].map(
          (event) => event.rowId,
        ),
      ),
    ];
    const line = (cls, iconName, label, value, note = "") =>
      `<tr class="${cls}"><td class="ico">${icon(iconName)}</td><td class="lbl">${label}${note ? `<small>${note}</small>` : ""}</td><td class="amount">${value}</td></tr>`;
    const porFora = stats.entradaPorFora
      ? ` · ${n2(stats.entradaPorFora)} por fora`
      : "";
    const per = isRange ? "período" : "mês";
    const valueRows = ref
      ? line("is-forecast", "calendar", `Previsto no ${per}`, n2(stats.previsto)) +
        line(
          "is-received",
          "check",
          `Recebido no ${per}`,
          n2(stats.recebido),
          `${isRange ? "Inclui lançamentos anteriores" : "Inclui meses anteriores"}${porFora}`,
        ) +
        line(
          "is-pending",
          "clock",
          `Pendente do ${per}`,
          n2(stats.pendingMonth),
          `Acumulado até o fim do ${per}: ${n2(stats.pending)}`,
        )
      : line("is-forecast", "calendar", "Previsto", n2(stats.previsto)) +
        line(
          "is-received",
          "check",
          "Recebido",
          n2(stats.recebido),
          `${pct}% do previsto${porFora}`,
        ) +
        line("is-pending", "clock", "Pendente", n2(stats.pending));
    el.innerHTML = `<div class="dash-mov">
      <table class="dash-grid-table dash-mov-table"><thead><tr><th class="ico"></th><th>Indicador</th><th class="num">Valor (R$)</th></tr></thead><tbody>
        ${valueRows}
        ${line("is-expense", "down", "Saídas", n2(stats.saidas))}
      </tbody><tfoot>${line(snapshot.final < 0 ? "is-negative" : "is-balance", "wallet", "Saldo final", n2(snapshot.final))}</tfoot></table>
      <table class="dash-grid-table dash-mov-table"><thead><tr><th class="ico"></th><th>Lançamentos</th><th class="num">Qtd.</th></tr></thead><tbody>
        ${line("is-received", "receipt", "Receitas", receitas)}
        ${line("is-received", "banknote", "Entradas por fora", entradasFora)}
        ${line("is-expense", "out", "Saídas", saidas)}
      </tbody><tfoot>${line("is-total", "layers", "Total", stats.rowCount)}</tfoot></table>
    </div>`;
    const warnEl = $("#dash-mov-warn");
    if (warnEl)
      warnEl.innerHTML = unknownCount
        ? `<button type="button" class="dash-warn" data-reconcile-go="${esc(unknownIds.join(","))}" title="${unknownCount} ${unknownCount === 1 ? "registro sem data financeira" : "registros sem data financeira"} · ver em Lançamentos">${icon("info")}<span><b>${unknownCount} sem data</b> <u>Revisar</u></span></button>`
        : "";
  }
  let lastDashTabsWidth = 0;
  let dashResizeFrame = 0;
  function dashCompanyTabs(
    companyRows = financeRowsByCompany(),
    snapshots = companySnapshots(companyRows),
  ) {
    const el = $("#company-picker-dashboard");
    if (!el) return;
    const width = el.clientWidth || document.documentElement.clientWidth;
    lastDashTabsWidth = Math.round(width);
    const menuItems = [...subdivisions]
      .sort((a, b) => a.localeCompare(b, "pt-BR"))
      .map((n) => {
        const snap = snapshots.get(n);
        const has =
          Math.abs(Number(snap.entries) || 0) >= 0.005 ||
          Math.abs(Number(snap.exits) || 0) >= 0.005 ||
          Math.abs(Number(snap.prior) || 0) >= 0.005;
        return `<button type="button" class="dash-menu-item ${state.empresa === n ? "on" : ""}" role="menuitemradio" aria-checked="${state.empresa === n}" data-select-company="${esc(n)}" data-dash-menu-name="${esc(n.toUpperCase())}"><span class="dash-menu-icon">${icon("building")}</span><span class="dash-menu-copy"><b>${esc(n)}</b><small>${has ? `Saldo ${fmt(snap.final)}` : "Sem movimento no período"}</small></span><span class="dash-menu-check" aria-hidden="true">✓</span></button>`;
      })
      .join("");
    const selectedLabel = state.empresa || "Todas as empresas";
    const selectedMeta = state.empresa
      ? "Visualização individual"
      : `Visão consolidada · ${subdivisions.length} empresas`;
    el.innerHTML = `<div class="dash-company-filter">
      <span class="dash-company-label">Empresa do painel</span>
      <button type="button" class="dash-company-select ${state.dashMenuOpen ? "open" : ""}" data-dash-menu-toggle aria-haspopup="menu" aria-expanded="${state.dashMenuOpen}" aria-label="Selecionar empresa. Atual: ${esc(selectedLabel)}">
        <span class="dash-company-select-icon">${icon(state.empresa ? "building" : "grid")}</span>
        <span class="dash-company-select-copy"><strong>${esc(selectedLabel)}</strong><small>${esc(selectedMeta)}</small></span>
        ${icon("chevdown")}
      </button>
    </div>
    ${state.empresa ? `<button type="button" class="dash-consolidated-btn" data-select-company="" title="Voltar à visão de todas as empresas">${icon("grid")}Ver consolidado</button>` : ""}
      ${
        state.dashMenuOpen
          ? `<div class="dash-menu" role="menu" aria-label="Escolher empresa do painel">
        <div class="dash-menu-head"><strong>Escolher empresa</strong><span>${subdivisions.length} cadastradas</span></div>
        <div class="dash-menu-search"><label>${icon("search")}<input type="search" id="dash-menu-q" placeholder="Digite o nome da empresa" aria-label="Buscar empresa" autocomplete="off"></label></div>
        <div class="dash-menu-list">
          <button type="button" class="dash-menu-item dash-menu-all ${!state.empresa ? "on" : ""}" role="menuitemradio" aria-checked="${!state.empresa}" data-select-company="" data-dash-menu-name="TODAS AS EMPRESAS CONSOLIDADO"><span class="dash-menu-icon">${icon("grid")}</span><span class="dash-menu-copy"><b>Todas as empresas</b><small>Somar dados das ${subdivisions.length} empresas</small></span><span class="dash-menu-check" aria-hidden="true">✓</span></button>
          <div class="dash-menu-group-label">Empresas</div>
          ${menuItems}<div class="dash-menu-empty" hidden>Nenhuma empresa encontrada.</div>
        </div>
        <div class="dash-menu-foot"><span>${subdivisions.length} empresas cadastradas</span><button type="button" class="section-link" data-goto="empresas">Gerenciar</button></div>
      </div>`
          : ""
      }`;
    if (state.dashMenuOpen) setTimeout(() => $("#dash-menu-q")?.focus(), 0);
  }
  document.addEventListener("click", (e) => {
    const toggle = e.target.closest("[data-dash-menu-toggle]");
    if (toggle) {
      state.dashMenuOpen = !state.dashMenuOpen;
      dashCompanyTabs();
      return;
    }
    const tipo = e.target.closest("[data-dash-tipo]");
    if (tipo) {
      state.dashTipo = tipo.dataset.dashTipo;
      drawDashboard();
      return;
    }
    const summarySort = e.target.closest("[data-dash-summary-sort]");
    if (summarySort) {
      const key = summarySort.dataset.dashSummarySort;
      const valid = ["empresa", "prior", "entries", "exits", "final"];
      if (!valid.includes(key)) return;
      if (state.dashSummarySortBy === key) {
        state.dashSummarySort =
          state.dashSummarySort === "asc" ? "desc" : "asc";
      } else {
        state.dashSummarySortBy = key;
        state.dashSummarySort = key === "empresa" ? "asc" : "desc";
      }
      $("#dash-summary").innerHTML = cashSummaryTable();
      return;
    }
    const recSort = e.target.closest("[data-dash-rec-sort]");
    if (recSort) {
      const key = recSort.dataset.dashRecSort;
      if (!DASH_COLS.rec[key]) return;
      if (state.dashRecSortBy === key) {
        state.dashRecSort = state.dashRecSort === "asc" ? "desc" : "asc";
      } else {
        state.dashRecSortBy = key;
        state.dashRecSort =
          key === "when" || key === "comp" || key === "valor" ? "desc" : "asc";
      }
      drawDashRecent();
      return;
    }
    const fbtn = e.target.closest("[data-dash-filter]");
    if (fbtn) {
      openDashFilter(fbtn);
      return;
    }
    if (e.target.closest("[data-dash-filter-clear]")) {
      const [table, key] = dashFilterOpen.split(":");
      if (state.dashColF[table]) delete state.dashColF[table][key];
      closeDashFilter();
      redrawDashTable(table);
      return;
    }
    if (dashFilterOpen && !e.target.closest("#pn-filter-pop")) closeDashFilter();
    if (e.target.closest("#dash-export")) {
      const menu = $("#dash-export-menu");
      menu.hidden = !menu.hidden;
      $("#dash-export").setAttribute("aria-expanded", String(!menu.hidden));
      return;
    }
    const exp = e.target.closest("[data-dash-export]");
    if (exp) {
      $("#dash-export-menu").hidden = true;
      $("#dash-export").setAttribute("aria-expanded", "false");
      dashExport(exp.dataset.dashExport);
      return;
    }
    if (!e.target.closest(".pn-drop") && $("#dash-export-menu")) {
      $("#dash-export-menu").hidden = true;
      $("#dash-export")?.setAttribute("aria-expanded", "false");
    }
    if (e.target.closest("#dash-print")) {
      document.body.classList.add("printing-dashboard");
      window.print();
      setTimeout(() => document.body.classList.remove("printing-dashboard"), 500);
      return;
    }
    if (e.target.closest("#dash-manage")) {
      const cfg = document.querySelector('.nav-btn[data-page="configuracoes"]');
      if (cfg && !cfg.hidden && cfg.offsetParent !== null) {
        goto("configuracoes");
        setTimeout(
          () => document.querySelector('.sn-btn[data-set="companies"]')?.click(),
          0,
        );
      } else goto("empresas");
      return;
    }
    if (e.target.closest("[data-dash-toggle-zero]")) {
      state.dashShowZero = !state.dashShowZero;
      $("#dash-summary").innerHTML = cashSummaryTable();
      return;
    }
    if (
      state.dashMenuOpen &&
      (!e.target.closest(".dash-menu") || e.target.closest("[data-goto]")) &&
      !e.target.closest("[data-select-company]")
    ) {
      state.dashMenuOpen = false;
      dashCompanyTabs();
    }
  });
  /* Filtro por coluna (funil) das tabelas do painel */
  let dashFilterOpen = "";
  function redrawDashTable(table) {
    if (table === "sum") $("#dash-summary").innerHTML = cashSummaryTable();
    else if (table === "pend") {
      state.pendPage = 1;
      drawPendentes();
    } else drawDashRecent();
  }
  function closeDashFilter() {
    dashFilterOpen = "";
    $("#pn-filter-pop")?.remove();
  }
  function openDashFilter(btn) {
    const id = btn.dataset.dashFilter;
    if (dashFilterOpen === id) {
      closeDashFilter();
      return;
    }
    closeDashFilter();
    const [table, key] = id.split(":");
    const col = DASH_COLS[table]?.[key];
    if (!col) return;
    const current = (state.dashColF[table] || {})[key] || "";
    let control;
    if (col.type === "text") {
      control = `<input type="search" class="control" data-dash-filter-input placeholder="Contém..." value="${esc(current)}" autocomplete="off">`;
    } else {
      let options = NUM_FILTERS;
      if (col.type === "list") {
        const values = [
          ...new Set(
            table === "pend"
              ? pendPool.map((r) => pendCell(r, key))
              : dashRecentPool.map((r) => recCell(r, key)),
          ),
        ].sort((a, b) => a.localeCompare(b, "pt-BR"));
        options = [["", "Todos"], ...values.map((v) => [v, v])];
      }
      control = `<select class="control" data-dash-filter-input>${options
        .map(
          ([v, l]) =>
            `<option value="${esc(v)}" ${v === current ? "selected" : ""}>${esc(l)}</option>`,
        )
        .join("")}</select>`;
    }
    const pop = document.createElement("div");
    pop.id = "pn-filter-pop";
    pop.className = "pn-filter-pop";
    pop.innerHTML = `<div class="pn-filter-head">${icon("filter")}<b>${esc(col.label)}</b></div>${control}<div class="pn-filter-foot"><button type="button" class="section-link" data-dash-filter-clear>Limpar</button></div>`;
    document.body.appendChild(pop);
    const r = btn.getBoundingClientRect();
    const w = pop.offsetWidth;
    pop.style.top = `${r.bottom + window.scrollY + 6}px`;
    pop.style.left = `${Math.max(8, Math.min(r.right - w, document.documentElement.clientWidth - w - 8)) + window.scrollX}px`;
    dashFilterOpen = id;
    setTimeout(() => pop.querySelector("[data-dash-filter-input]")?.focus(), 0);
  }
  function applyDashFilter(input) {
    if (!dashFilterOpen) return;
    const [table, key] = dashFilterOpen.split(":");
    state.dashColF[table] = state.dashColF[table] || {};
    if (input.value) state.dashColF[table][key] = input.value;
    else delete state.dashColF[table][key];
    redrawDashTable(table);
  }
  document.addEventListener("input", (e) => {
    if (e.target.matches?.("[data-dash-filter-input]")) {
      applyDashFilter(e.target);
      return;
    }
    if (e.target.id === "dash-emp-q") {
      state.dashEmpQ = e.target.value;
      $("#dash-summary").innerHTML = cashSummaryTable();
      return;
    }
    if (e.target.id === "dash-rec-q") {
      state.dashRecQ = e.target.value;
      drawDashRecent();
      return;
    }
    if (e.target.id !== "dash-menu-q") return;
    const q = e.target.value.trim().toUpperCase();
    let visible = 0;
    $$(".dash-menu-item").forEach((b) => {
      const show = !q || b.dataset.dashMenuName.includes(q);
      b.hidden = !show;
      if (show) visible++;
    });
    const empty = $(".dash-menu-empty");
    if (empty) empty.hidden = visible > 0;
  });
  /* Exportar (CSV) a partir do painel */
  function downloadCsv(name, columns, rows) {
    const csv =
      "\ufeff" +
      [columns, ...rows]
        .map((row) =>
          row
            .map((v) => '"' + String(v ?? "").replaceAll('"', '""') + '"')
            .join(";"),
        )
        .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }
  function dashExport(kind) {
    const ref = dashRef();
    const tag = (ref || "todo-periodo").replace(/^R:/, "").replace(/:/g, "_a_");
    const scope = state.empresa ? `-${state.empresa}` : "";
    const num = (v) => (v == null ? "" : n2(v));
    if (kind === "summary") {
      const rows = dashSummaryShown.map(([company, snap]) => [
        company,
        num(snap.prior),
        num(snap.entries),
        num(snap.exits),
        num(snap.final),
      ]);
      if (dashSummaryTotal)
        rows.push([
          "Total",
          num(dashSummaryTotal.prior),
          num(dashSummaryTotal.entries),
          num(dashSummaryTotal.exits),
          num(dashSummaryTotal.final),
        ]);
      downloadCsv(
        `resumo-por-empresa-${tag}.csv`,
        ["Empresa", "Saldo Anterior", "Entradas", "Saídas", "Saldo Final"],
        rows,
      );
    } else if (kind === "recent") {
      downloadCsv(
        `lancamentos-recentes${scope}.csv`,
        Object.values(DASH_COLS.rec).map((c) => c.label),
        dashRecentShown.map((r) =>
          Object.keys(DASH_COLS.rec).map((k) => recCell(r, k)),
        ),
      );
    } else {
      const scopeRows = db.finance.filter(
        (r) => !state.empresa || r.sub === state.empresa,
      );
      const ids = ref ? dashboardPeriodStats(scopeRows, ref).rowIds : null;
      const rows = scopeRows
        .filter((r) => !ids || ids.has(r.id))
        .sort((a, b) => String(a.data || "").localeCompare(String(b.data || "")));
      downloadCsv(
        `lancamentos-${tag}${scope}.csv`,
        [
          "Tipo de lançamento",
          "Data",
          "Data recebida",
          "Parceiro",
          "Centro de custo",
          "Conta Bancária",
          "Empresa",
          "A receber",
          "Recebido",
          "Saída",
          "Situação",
          "Lançado por",
          "Observação",
        ],
        rows.map((r) => [
          finTipo(r),
          dateBR(r.data),
          r.dataRecebida ? dateBR(r.dataRecebida) : "",
          r.parceiro || "",
          r.centro || "",
          r.contaBancaria || "",
          r.sub || "",
          n2(r.previsto),
          n2(r.recebido),
          n2(r.saida),
          finStatus(r)[0],
          r.criadoPor || "",
          r.observacao || "",
        ]),
      );
    }
    toast("Planilha gerada");
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && dashFilterOpen) closeDashFilter();
    if (e.key === "Escape" && state.dashMenuOpen) {
      state.dashMenuOpen = false;
      dashCompanyTabs();
    }
  });
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
    return `<table class="sum-table data-table"><thead><tr><th>Empresa</th>${full ? '<th class="num">Lançamentos</th>' : ""}<th class="num">Previsto (R$)</th><th class="num">Recebido (R$)</th><th class="num">Despesas (R$)</th><th class="num">Saldo (R$)</th>${full ? '<th class="action-cell"></th>' : ""}</tr></thead><tbody>${list.map(([n, c, t]) => `<tr class="${full ? "" : "clickable"} ${state.empresa === n ? "sel" : ""}" ${full ? "" : `data-select-company="${esc(n)}" title="Ver ${esc(n)} no painel"`}><td><b>${esc(n)}</b></td>${full ? `<td class="amount">${c}</td>` : ""}<td class="amount">${fmt(t.prev)}</td><td class="amount">${fmt(t.rec)}</td><td class="amount">${fmt(t.sai)}</td><td class="amount ${t.rec - t.sai < 0 ? "neg" : ""}">${fmt(t.rec - t.sai)}</td>${full ? `<td class="action-cell"><button type="button" class="edit-action" data-company-go="${esc(n)}">Ver lançamentos</button></td>` : ""}</tr>`).join("")}</tbody><tfoot><tr><td>Total</td>${full ? `<td class="amount">${inMonth.length}</td>` : ""}<td class="amount">${fmt(all.prev)}</td><td class="amount">${fmt(all.rec)}</td><td class="amount">${fmt(all.sai)}</td><td class="amount">${fmt(all.rec - all.sai)}</td>${full ? "<td></td>" : ""}</tr></tfoot></table>`;
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
              (
                d,
              ) => `<div class="mbars" tabindex="0" aria-label="${esc(detail(d))}" data-chart-detail="${esc(detail(d))}">
                <span class="mbar"><em>${compactFmt(d.t.prev)}</em><i class="p" style="height:${h(d.t.prev)}%" title="Previsto ${fmt(d.t.prev)}"></i></span>
                <span class="mbar"><em>${compactFmt(d.t.rec)}</em><i class="r" style="height:${h(d.t.rec)}%" title="Recebido ${fmt(d.t.rec)}"></i></span>
                <span class="mbar"><em>${compactFmt(d.t.sai)}</em><i class="s" style="height:${h(d.t.sai)}%" title="Saídas ${fmt(d.t.sai)}"></i></span>
              </div>`,
            )
            .join("")}</div>
          <div class="mlabels">${data
            .map(
              (d) =>
                `<span><b>${d.lab}</b><small>${d.rows.length} lançamento(s)</small><em class="${d.t.rec - d.t.sai < 0 ? "neg" : ""}">Saldo ${compactFmt(d.t.rec - d.t.sai)}</em></span>`,
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
  const CONTATO_SUGESTOES = [
    "Diz que paga na segunda",
    "Diz que paga na próxima semana",
    "Diz que paga amanhã",
    "Não atendeu",
    "Pediu para ligar depois",
  ];
  function finContatos(r) {
    return Array.isArray(r?.contatos)
      ? r.contatos.filter((c) => c && c.nota)
      : [];
  }
  function ultimoContato(r) {
    return finContatos(r)
      .slice()
      .sort((a, b) =>
        String(a.data + (a.at || "")).localeCompare(
          String(b.data + (b.at || "")),
        ),
      )
      .pop();
  }
  function contatoCell(r) {
    const c = ultimoContato(r);
    const n = finContatos(r).length;
    const btn = `<button type="button" class="inline-btn contato-btn" data-contato-pendente="${esc(r.id)}">${icon("plus")}${c ? "Novo contato" : "Registrar contato"}</button>`;
    if (!c) return `<span class="muted contato-none">Sem contato</span>${btn}`;
    return `<div class="contato-last"><b>${esc(c.nota)}</b>${c.previsao ? `<span class="pill info">Prev. ${dateBR(c.previsao)}</span>` : ""}<span class="muted">${dateBR(c.data)}${c.actor ? " · " + esc(c.actor) : ""}${n > 1 ? ` · ${n} contatos` : ""}</span></div>${btn}`;
  }
  function pendingRecords() {
    return db.finance.filter(
      (r) => r && finKind(r) === "receita" && finFalta(r) > 0.009,
    );
  }
  /* ---------- Pendentes ---------- */
  let pendPool = [];
  let pendFiltered = [];
  const PEND_SORTS = [
    ["falta:desc", "Maior valor faltante"],
    ["falta:asc", "Menor valor faltante"],
    ["data:asc", "Data mais antiga"],
    ["data:desc", "Data mais recente"],
    ["prev:desc", "Maior valor a receber"],
    ["sub:asc", "Empresa (A–Z)"],
    ["parceiro:asc", "Parceiro (A–Z)"],
  ];
  function pendNum(r, key) {
    if (key === "prev") return money(r.previsto);
    if (key === "rec") return money(r.recebido);
    if (key === "falta") return finFalta(r);
    return 0;
  }
  function pendCell(r, key) {
    if (key === "data") return dateBR(r.data);
    if (key === "sub") return r.sub || "—";
    if (key === "parceiro") return r.parceiro || "—";
    if (key === "contato") return ultimoContato(r) ? "Com contato" : "Sem contato";
    if (key === "centro") return r.centro || "—";
    if (key === "conta") return r.contaBancaria || "—";
    if (key === "sit") return finStatus(r)[0];
    if (key === "quem") return r.criadoPor || "—";
    if (key === "comp")
      return (r.anexos || []).length ? "Com comprovante" : "Sem comprovante";
    return n2(pendNum(r, key));
  }
  function pendSortKey(r, key) {
    if (["prev", "rec", "falta"].includes(key)) return pendNum(r, key);
    if (key === "data") return String(r.data || "");
    if (key === "comp") return (r.anexos || []).length;
    return fold(pendCell(r, key));
  }
  const PEND_SORT_ICON = ["prev", "rec", "falta", "comp"];
  function pendTh(key, cls = "") {
    const col = DASH_COLS.pend[key];
    const [by, dir] = state.pendSort.split(":");
    const selected = by === key;
    const ariaSort = selected
      ? ` aria-sort="${dir === "asc" ? "ascending" : "descending"}"`
      : "";
    const mark = selected
      ? `<span class="pn-arrow">${dir === "asc" ? "↑" : "↓"}</span>`
      : PEND_SORT_ICON.includes(key)
        ? `<svg class="pend-sort-ico"><use href="#i-sort"></use></svg>`
        : "";
    const label = esc(col.label.replace(" (R$)", "")) + (col.type === "num" ? " (R$)" : "");
    const filter = PEND_SORT_ICON.includes(key) && key !== "comp"
      ? ""
      : `<button type="button" class="pn-fbtn${colActive("pend", key) ? " on" : ""}" data-dash-filter="pend:${key}" title="Filtrar ${esc(col.label)}" aria-label="Filtrar ${esc(col.label)}">${icon("filter")}</button>`;
    return `<th class="${cls}"${ariaSort}><div class="pn-th"><button type="button" class="fin-th-sort${selected ? " is-active" : ""}" data-pend-sort="${key}" title="Ordenar por ${esc(col.label)}">${label}${mark}</button>${key === "comp" ? "" : filter}</div></th>`;
  }
  function pendFiltersHTML() {
    const cm = state.contasMes ?? state.mes;
    const base = pendingRecords();
    const centros = [...new Set(base.map((r) => r.centro).filter(Boolean))].sort(
      (a, b) => a.localeCompare(b, "pt-BR", { numeric: true }),
    );
    const sel = (ico, attrs, options) =>
      `<span class="pend-select">${icon(ico)}<select class="control" ${attrs}>${options}</select>${icon("chevdown")}</span>`;
    const opt = (v, l, cur) =>
      `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(l)}</option>`;
    return `<label class="pend-field"><span>Competência</span>${sel(
      "calendar",
      'data-contas-mes aria-label="Competência"',
      opt("", "Todos os meses", cm || "") +
        compOptions()
          .map((m) => opt(m, compLabel(m), cm))
          .join(""),
    )}</label><label class="pend-field"><span>Empresa</span>${sel(
      "building",
      'data-contas-emp aria-label="Empresa"',
      opt("", "Todas", state.empresa) +
        subdivisions.map((n) => opt(n, n, state.empresa)).join(""),
    )}</label><label class="pend-field"><span>Centro de custo</span>${sel(
      "layers",
      'id="pend-cost" aria-label="Centro de custo"',
      opt("", "Todos", state.pendCost) +
        centros.map((c) => opt(c, c, state.pendCost)).join(""),
    )}</label><label class="pend-field"><span>Situação</span>${sel(
      "tag",
      'id="pend-sit" aria-label="Situação"',
      opt("", "Todas", state.pendSit) +
        opt("Pendente", "Pendente (nada recebido)", state.pendSit) +
        opt("Em aberto", "Em aberto (recebido em parte)", state.pendSit),
    )}</label><span class="pend-sep" aria-hidden="true"></span><label class="pend-search">${icon("search")}<input type="search" id="pend-q" placeholder="Buscar parceiro, contato ou valor..." value="${esc(state.pendQ)}" autocomplete="off" aria-label="Buscar parceiro, contato ou valor"></label><button type="button" class="btn primary pend-go" id="pend-go">${icon("filter")}Filtrar</button><button type="button" class="btn pn-tool pend-clear" id="pend-clear">${icon("refresh")}Limpar</button>`;
  }
  function pendPagerHTML(page, pages) {
    if (pages <= 1) return "";
    const btn = (p, label, cls = "", aria = "") =>
      `<button type="button" class="pend-pg ${cls}" data-pend-page="${p}" ${p < 1 || p > pages || p === page ? "disabled" : ""} ${aria ? `aria-label="${aria}"` : ""}>${label}</button>`;
    let from = Math.max(1, page - 2);
    let to = Math.min(pages, from + 4);
    from = Math.max(1, to - 4);
    let nums = "";
    for (let i = from; i <= to; i++)
      nums += `<button type="button" class="pend-pg num ${i === page ? "on" : ""}" data-pend-page="${i}" ${i === page ? 'aria-current="page"' : ""}>${i}</button>`;
    return `<div class="pend-pager">${btn(1, icon("dchevleft"), "", "Primeira página")}${btn(page - 1, icon("chevleft"), "", "Página anterior")}${nums}${btn(page + 1, icon("chev"), "", "Próxima página")}${btn(pages, icon("dchev"), "", "Última página")}</div>`;
  }
  function drawPendentes() {
    const el = $("#pend-table");
    if (!el) return;
    const filterRoot = $("#pend-filters");
    const qFocused = document.activeElement?.id === "pend-q";
    if (!qFocused) filterRoot.innerHTML = pendFiltersHTML();
    $("#pend-filter-card").classList.toggle("closed", !state.pendFiltersOpen);
    $("#pend-filter-toggle").setAttribute(
      "aria-expanded",
      String(state.pendFiltersOpen),
    );
    const ids = new Set(pendingRecords().map((r) => r.id));
    pendPool = contasRows().filter((r) => ids.has(r.id));
    const q = fold(state.pendQ.trim());
    const qNum = state.pendQ.replace(/[^\d,]/g, "");
    const keys = Object.keys(DASH_COLS.pend);
    const rows = pendPool.filter((r) => {
      if (state.pendCost && r.centro !== state.pendCost) return false;
      if (state.pendSit && finStatus(r)[0] !== state.pendSit) return false;
      if (q) {
        const contatos = finContatos(r)
          .map((c) => c.nota)
          .join(" ");
        const hay = fold(
          [r.parceiro, r.sub, r.centro, r.contaBancaria, r.observacao, r.criadoPor, contatos].join(" "),
        );
        const values = [r.previsto, r.recebido, finFalta(r)].map((v) => n2(v));
        if (
          !hay.includes(q) &&
          !(qNum && values.some((v) => v.includes(qNum) || v.replace(/\./g, "").includes(qNum)))
        )
          return false;
      }
      return keys.every((k) => colPass("pend", k, pendCell(r, k), pendNum(r, k)));
    });
    const [by, dir] = state.pendSort.split(":");
    const direction = dir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      const av = pendSortKey(a, by),
        bv = pendSortKey(b, by);
      const c =
        typeof av === "number"
          ? av - bv
          : String(av).localeCompare(String(bv), "pt-BR", { numeric: true });
      return c * direction || String(a.data).localeCompare(String(b.data));
    });
    pendFiltered = rows;
    const prev = rows.reduce((n, r) => n + money(r.previsto), 0),
      rec = rows.reduce((n, r) => n + money(r.recebido), 0),
      falta = rows.reduce((n, r) => n + finFalta(r), 0);
    const kpi = (cls, ico, label, value) =>
      `<div class="pend-kpi ${cls}"><span class="pend-kpi-ico">${icon(ico)}</span><div><span>${label}</span><strong>${value}</strong></div></div>`;
    $("#pend-summary").innerHTML =
      kpi("count", "clipcheck", "Lançamentos pendentes", rows.length) +
      kpi("prev", "down", "A receber", fmt(prev)) +
      kpi("rec", "check", "Já recebido", fmt(rec)) +
      kpi("falta", "database", "Falta receber", fmt(falta));
    $("#pend-count").textContent = `${rows.length} registro(s)`;
    const sortSel = $("#pend-sort");
    const known = PEND_SORTS.some(([v]) => v === state.pendSort);
    sortSel.innerHTML =
      (known
        ? ""
        : `<option value="${esc(state.pendSort)}" selected>${esc(DASH_COLS.pend[by]?.label || by)} (${dir === "asc" ? "crescente" : "decrescente"})</option>`) +
      PEND_SORTS.map(
        ([v, l]) =>
          `<option value="${v}" ${v === state.pendSort ? "selected" : ""}>${l}</option>`,
      ).join("");
    $("#pend-per").value = state.pendPer;
    const per = state.pendPer === "all" ? rows.length || 1 : Number(state.pendPer) || 10;
    const pages = Math.max(1, Math.ceil(rows.length / per));
    state.pendPage = Math.min(Math.max(1, state.pendPage), pages);
    const start = (state.pendPage - 1) * per;
    const pageRows = document.body.classList.contains("printing-pendentes")
      ? rows
      : rows.slice(start, start + per);
    const sitPill = (r) => {
      const st = finStatus(r)[0];
      const cls = st === "Em aberto" ? "open" : st === "Pendente" ? "wait" : "other";
      return `<span class="pend-pill ${cls}"><i></i>${esc(st)}</span>`;
    };
    const faltaCls = (r) => {
      const f = finFalta(r),
        p = money(r.previsto);
      if (p && f / p < 0.01) return "tiny";
      return "due";
    };
    el.innerHTML = `<table class="pend-table pend-grid"><thead><tr>${pendTh("data")}${pendTh("sub")}${pendTh("parceiro")}${pendTh("contato")}${pendTh("centro")}${pendTh("conta")}${pendTh("prev", "num")}${pendTh("rec", "num")}${pendTh("falta", "num")}${pendTh("sit")}${pendTh("quem")}${pendTh("comp")}<th class="pend-th-actions">Ações</th></tr></thead><tbody>${
      pageRows
        .map(
          (r) =>
            `<tr><td data-label="Data" class="nowrap">${dateBR(r.data)}</td><td data-label="Empresa"><b>${esc(r.sub || "—")}</b></td><td data-label="Parceiro" class="pend-col-partner">${esc(r.parceiro || "—")}${r.observacao ? `<div class="muted">${esc(r.observacao)}</div>` : ""}</td><td data-label="Contato" class="contato-cell">${contatoCell(r)}</td><td data-label="Centro de custo">${esc(r.centro || "—")}</td><td data-label="Conta Bancária">${esc(r.contaBancaria || "—")}</td><td data-label="A receber (R$)" class="amount">${fmt(r.previsto)}</td><td data-label="Recebido (R$)" class="amount">${fmt(r.recebido)}</td><td data-label="Falta receber (R$)" class="amount pend-falta ${faltaCls(r)}">${fmt(finFalta(r))}</td><td data-label="Situação">${sitPill(r)}</td><td data-label="Quem lançou" class="pend-col-who">${esc(r.criadoPor || "—")}</td><td data-label="Comprovante">${fileCell(r.anexos, "fin:" + r.id)}</td><td data-label="Ações" class="pend-actions-cell"><div class="pend-actions"><button type="button" class="btn primary pend-launch" data-lancar-pendente="${esc(r.id)}">${icon("plus")}Lançar recebimento</button><button type="button" class="pend-kebab" data-pend-menu="${esc(r.id)}" aria-label="Mais ações" title="Mais ações">${icon("dots")}</button></div></td></tr>`,
        )
        .join("") ||
      noRows("Nenhum valor pendente para os filtros selecionados.", 13)
    }</tbody></table>`;
    const shownTo = Math.min(rows.length, start + pageRows.length);
    $("#pend-foot").innerHTML = `<span class="pend-showing">${rows.length ? `Mostrando ${start + 1} a ${shownTo} de ${rows.length} registros` : "Nenhum registro"}</span><div class="pend-totals"><b>Totais (pendentes):</b><span>A receber: <b>${fmt(prev)}</b></span><i></i><span>Já recebido: <b>${fmt(rec)}</b></span><i></i><span>Falta receber: <b class="neg">${fmt(falta)}</b></span></div>${pendPagerHTML(state.pendPage, pages)}`;
  }
  function closePendMenu() {
    $("#pend-row-menu")?.remove();
  }
  function openPendMenu(btn) {
    const id = btn.dataset.pendMenu;
    const open = $("#pend-row-menu");
    if (open && open.dataset.for === id) {
      closePendMenu();
      return;
    }
    closePendMenu();
    const r = db.finance.find((x) => x.id === id);
    if (!r) return;
    const menu = document.createElement("div");
    menu.id = "pend-row-menu";
    menu.className = "pn-menu pend-row-menu";
    menu.dataset.for = id;
    menu.innerHTML = `<button type="button" data-edit-fin="${esc(id)}">${icon("edit")}Editar lançamento</button><button type="button" data-contato-pendente="${esc(id)}">${icon("users")}Registrar contato</button>${(r.anexos || []).length ? `<button type="button" data-view-files="fin:${esc(id)}">${icon("clip")}Ver comprovantes</button>` : ""}`;
    menu.addEventListener("pointerup", (ev) => {
      if (ev.target.closest("button")) setTimeout(closePendMenu, 0);
    });
    document.body.appendChild(menu);
    const b = btn.getBoundingClientRect();
    const w = menu.offsetWidth;
    menu.style.top = `${b.bottom + window.scrollY + 4}px`;
    menu.style.left = `${Math.max(8, b.right - w) + window.scrollX}px`;
  }
  function pendExport() {
    downloadCsv(
      `pendentes${state.empresa ? "-" + state.empresa : ""}.csv`,
      [
        "Data",
        "Empresa",
        "Parceiro",
        "Último contato",
        "Centro de custo",
        "Conta Bancária",
        "A receber",
        "Recebido",
        "Falta receber",
        "Situação",
        "Quem lançou",
        "Comprovantes",
        "Observação",
      ],
      pendFiltered.map((r) => [
        dateBR(r.data),
        r.sub || "",
        r.parceiro || "",
        ultimoContato(r)?.nota || "",
        r.centro || "",
        r.contaBancaria || "",
        n2(r.previsto),
        n2(r.recebido),
        n2(finFalta(r)),
        finStatus(r)[0],
        r.criadoPor || "",
        (r.anexos || []).length,
        r.observacao || "",
      ]),
    );
    toast("Planilha gerada");
  }
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#pend-row-menu") && !e.target.closest("[data-pend-menu]"))
      closePendMenu();
    else if (e.target.closest("#pend-row-menu button")) setTimeout(closePendMenu, 0);
    const kebab = e.target.closest("[data-pend-menu]");
    if (kebab) {
      openPendMenu(kebab);
      return;
    }
    const sortBtn = e.target.closest("[data-pend-sort]");
    if (sortBtn) {
      const key = sortBtn.dataset.pendSort;
      const [by, dir] = state.pendSort.split(":");
      state.pendSort =
        by === key
          ? `${key}:${dir === "asc" ? "desc" : "asc"}`
          : `${key}:${["prev", "rec", "falta", "comp", "data"].includes(key) ? "desc" : "asc"}`;
      drawPendentes();
      return;
    }
    const pg = e.target.closest("[data-pend-page]");
    if (pg && !pg.disabled) {
      state.pendPage = Number(pg.dataset.pendPage) || 1;
      drawPendentes();
      $("#pend-table")?.scrollIntoView({ block: "nearest" });
      return;
    }
    if (e.target.closest("#pend-filter-toggle")) {
      state.pendFiltersOpen = !state.pendFiltersOpen;
      drawPendentes();
      return;
    }
    if (e.target.closest("#pend-go")) {
      state.pendQ = $("#pend-q")?.value || "";
      state.pendPage = 1;
      drawPendentes();
      return;
    }
    if (e.target.closest("#pend-clear")) {
      state.pendCost = "";
      state.pendSit = "";
      state.pendQ = "";
      state.pendPage = 1;
      state.contasMes = "";
      state.empresa = "";
      delete state.dashColF.pend;
      $("#pend-q") && ($("#pend-q").value = "");
      render();
      return;
    }
    if (e.target.closest("#pend-export")) {
      pendExport();
      return;
    }
    if (e.target.closest("#pend-report")) {
      document.body.classList.add("printing-pendentes");
      drawPendentes();
      window.print();
      setTimeout(() => {
        document.body.classList.remove("printing-pendentes");
        drawPendentes();
      }, 500);
    }
  });
  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.id === "pend-cost") state.pendCost = t.value;
    else if (t.id === "pend-sit") state.pendSit = t.value;
    else if (t.id === "pend-sort") state.pendSort = t.value;
    else if (t.id === "pend-per") state.pendPer = t.value;
    else return;
    state.pendPage = 1;
    drawPendentes();
  });
  document.addEventListener("input", (e) => {
    if (e.target.id !== "pend-q") return;
    state.pendQ = e.target.value;
    state.pendPage = 1;
    drawPendentes();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePendMenu();
  });
  /** Abre só o formulário de recebimento (data, valor e comprovante). */
  function lancarPendente(id) {
    const r = db.finance.find((x) => x.id === id);
    if (!r) return;
    openModal("recebimento", id);
  }
  function drawReceber() {
    const el = $("#rec-table");
    if (!el) return;
    contasFilters("#rec-filters");
    const rows = contasRows().filter(
      (r) => finKind(r) === "receita" && money(r.previsto) > money(r.recebido),
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
    editor: false,
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
    const trocar = MB.embed
      ? `<button type="button" data-trocar-sistema>Trocar sistema</button>`
      : "";
    $("#site-links").innerHTML = trocar;
    $("#um-links").innerHTML = trocar;
    $("#um-links").hidden = !trocar;
    $("#um-sair").hidden = !MB.embed;
    // Quem não é admin só lança tarefa como responsável atribuída: sem
    // criação de tarefas e sem a visão "Todas as demandas" (que mostraria
    // edição/exclusão de tarefas de qualquer pessoa).
    $$('[data-open="task"]').forEach((el) => (el.hidden = !MB.admin));
    $$('[data-page="demandas"]').forEach((el) => (el.hidden = !MB.admin));
    if (!MB.admin && page === "demandas") goto("minhas");
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
      MB.editor = !!d.editor || MB.admin;
      MB.userId = String(d.userId || MB.userId || "");
      drawUser();
      if (page === "sem-data-recebida") drawCorrections();
      if (page === "duplicados") drawDuplicates();
      updateCounts();
    }
    if (d.type === "mb-hydrate" && d.payload) {
      const p = d.payload;
      awaitingCloudHydrate = false;
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
    const kpi = e.target.closest("[data-fin-kpi]");
    if (kpi) {
      openFinanceFromKpi(kpi);
      return;
    }
    const rg = e.target.closest("[data-reconcile-go]");
    if (rg) {
      const ids = rg.dataset.reconcileGo.split(",").filter(Boolean);
      state.finReconcileIds = new Set(ids);
      state.finSelectionLabel = "";
      state.finSelectionKey = "";
      state.mes = "";
      state.finType = "";
      state.finStatus = "";
      state.finCost = "";
      state.finBank = "";
      state.pesquisa = "";
      state.finPage = 1;
      goto("financeiro");
      return;
    }
    if (e.target.closest("#fin-reconcile-clear")) {
      clearFinanceAuditFilter();
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
    if (e.target.closest("[data-trocar-sistema]")) {
      userMenu(false);
      toParent({ type: "mb-trocar-sistema" });
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
    if (t.id === "dash-comp") {
      if (t.value === "__range") return;
      state.mes = t.value;
      state.dashDe = "";
      state.dashAte = "";
      clearFinanceAuditFilter();
      render();
    } else if (t.id === "dash-de" || t.id === "dash-ate") {
      if (t.id === "dash-de") state.dashDe = t.value;
      else state.dashAte = t.value;
      if (state.dashDe && state.dashAte && state.dashDe > state.dashAte) {
        if (t.id === "dash-de") state.dashAte = state.dashDe;
        else state.dashDe = state.dashAte;
      }
      if (state.dashDe || state.dashAte) state.mes = "";
      clearFinanceAuditFilter();
      render();
    } else if (t.matches("[data-comp]")) {
      state.mes = t.value;
      state.dashDe = "";
      state.dashAte = "";
      clearFinanceAuditFilter();
      render();
    } else if (t.matches("[data-contas-mes]")) {
      state.contasMes = t.value;
      state.pendPage = 1;
      render();
    } else if (t.matches("[data-contas-emp]")) {
      state.empresa = t.value;
      render();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") userMenu(false);
  });
  window.addEventListener("resize", () => {
    if (page !== "dashboard" || dashResizeFrame) return;
    dashResizeFrame = requestAnimationFrame(() => {
      dashResizeFrame = 0;
      const width = Math.round(
        $("#company-picker-dashboard")?.clientWidth || 0,
      );
      if (width && Math.abs(width - lastDashTabsWidth) >= 32) {
        dashCompanyTabs();
      }
    });
  });
  drawUser();

  render();
  toParent({ type: "mb-pronto" });
})();
