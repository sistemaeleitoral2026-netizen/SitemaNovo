/* Assessoria MB — módulo Relatórios (relatório geral e relatórios médicos).
   Telas dentro do iframe; banco, leitura de planilhas e PDF/Word ficam na
   página que hospeda o iframe (mensagens "mb-rel"). Valores em centavos. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (x) =>
    String(x ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  const icon = (n) => `<svg aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const fmt = (c) =>
    (Number(c || 0) / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  const localDate = (s) => (s ? new Date(s).toLocaleString("pt-BR") : "—");
  const dateBR = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "—");
  const makeId = () =>
    globalThis.crypto?.randomUUID?.() ||
    "r-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  const groupOrder = [
    "Veículos e máquinas",
    "Careca",
    "Cimar Transportes",
    "Setor de compras",
    "Abastecimento de água",
    "Outros",
  ];
  const MEDICAS = ["Plantonistas", "Especialistas"];
  const app = () => window.MBApp || {};
  const isAdmin = () => !!app().MB?.admin;
  const actor = () => app().MB?.nome || "Usuário";
  const toast = (t) => (app().toast ? app().toast(t) : alert(t));

  /* ---------- comunicação com a página ---------- */
  const pending = {};
  window.addEventListener("message", (e) => {
    if (e.origin !== location.origin) return;
    const d = e.data || {};
    if (d.type === "mb-rel-res" && pending[d.requestId]) {
      const p = pending[d.requestId];
      delete pending[d.requestId];
      d.ok ? p.res(d.data) : p.rej(new Error(d.erro || "Falha na operação."));
    }
    if ((d.type === "mb-file-data" || d.type === "mb-file-erro") && pending[d.requestId]) {
      const p = pending[d.requestId];
      delete pending[d.requestId];
      d.type === "mb-file-data" ? p.res(d) : p.rej(new Error(d.erro || "Falha ao baixar arquivo."));
    }
  });
  function post(msg, timeoutMs = 180000) {
    if (window.parent === window)
      return Promise.reject(new Error("Abra a Assessoria MB pelo sistema (logado) para usar relatórios."));
    return new Promise((res, rej) => {
      const requestId = makeId();
      pending[requestId] = { res, rej };
      window.parent.postMessage({ ...msg, requestId }, location.origin);
      setTimeout(() => {
        if (pending[requestId]) {
          delete pending[requestId];
          rej(new Error("O servidor demorou para responder. Tente de novo."));
        }
      }, timeoutMs);
    });
  }
  const api = (op, data = {}) => post({ type: "mb-rel", op, data });
  const fetchFile = (path) => post({ type: "mb-file-get", path }, 120000);

  /* ---------- estado ---------- */
  const fresh = () => ({
    mode: "import",
    id: "",
    kind: "general",
    title: "Relatório",
    start: "",
    end: "",
    percent: 25,
    company: "",
    author: actor(),
    status: "Rascunho",
    files: [],
    rows: [],
    events: [],
    snapshot: {},
  });
  let state = fresh(),
    view = "rel-novo",
    phase = 0,
    filter = "",
    query = "",
    busy = false,
    dirty = false,
    historyRows = [],
    historyLoaded = false,
    medicalTab = "Plantonistas";

  const editable = () => ["Rascunho", "Devolvido"].includes(state.status);
  const included = () =>
    state.rows.filter((r) => state.kind !== "medical" || MEDICAS.includes(r.category));
  const subtotal = () => included().reduce((s, r) => s + (r.value || 0), 0);
  const sectionTotal = (k) =>
    included()
      .filter((r) => r.category === k)
      .reduce((s, r) => s + (r.value || 0), 0);
  const addition = () =>
    state.kind === "medical"
      ? MEDICAS.reduce(
          (n, k) => n + Math.round((sectionTotal(k) * Number(state.percent || 0)) / 100),
          0,
        )
      : Math.trunc((subtotal() * Number(state.percent || 0)) / 100);
  const warnings = (r) =>
    !r.name ||
    !r.doc ||
    !r.ref ||
    !r.bank ||
    !r.account ||
    r.value === null ||
    r.value === undefined ||
    r.value < 0 ||
    (!r.checked && r.method === "Planilha");
  const duplicate = (r) =>
    state.rows.some(
      (s) =>
        s !== r &&
        (state.kind !== "medical" || s.category === r.category) &&
        r.doc &&
        r.value !== null &&
        String(s.doc || "").replace(/\D/g, "") === String(r.doc).replace(/\D/g, "") &&
        s.value === r.value &&
        s.ref === r.ref,
    );
  const tag = (s) =>
    `<span class="rl-tag ${
      s === "Aprovado" || s === "Extraído"
        ? "ok"
        : s === "Em análise" || s === "Visualizado"
          ? "blue"
          : s === "Devolvido" || s === "Revisar" || s === "Falha"
            ? "warn"
            : ""
    }">${esc(s)}</span>`;
  const mark = () => (dirty = true);
  const root = () => $("#rl-root-" + view.replace("rel-", ""));

  /* ---------- peças de tela ---------- */
  const btn = (text, action, cls = "", ic = "") =>
    `<button type="button" class="btn ${cls}" onclick="${action}">${ic ? icon(ic) : ""}${text}</button>`;
  const head = (title, desc, buttons = "") =>
    `<div class="heading"><div><h1>${title}</h1><p>${desc}</p></div><div class="rl-actions">${buttons}</div></div>`;
  const panel = (title, sub, body, actions = "") =>
    `<section class="rl-panel"><div class="rl-ph"><div><h2>${title}</h2>${sub ? `<div class="rl-muted">${sub}</div>` : ""}</div><div class="rl-actions">${actions}</div></div>${body}</section>`;
  function metrics() {
    return `<div class="rl-totals"><div class="rl-metric"><div class="rl-muted">Lançamentos</div><strong id="rl-mcount">${included().length}</strong><span class="rl-muted" id="rl-mreview">${included().filter((r) => warnings(r) || duplicate(r)).length} para revisar</span></div><div class="rl-metric"><div class="rl-muted">Subtotal</div><strong id="rl-msub">${fmt(subtotal())}</strong></div><div class="rl-metric"><div class="rl-muted" id="rl-maddl">Acréscimo (${esc(state.percent)}%)</div><strong id="rl-madd">${fmt(addition())}</strong></div><div class="rl-metric final"><div class="rl-muted">Total geral</div><strong id="rl-mtotal">${fmt(subtotal() + addition())}</strong></div></div>`;
  }
  function updateTotals() {
    if (!$("#rl-msub")) return;
    $("#rl-mcount").textContent = included().length;
    $("#rl-mreview").textContent =
      included().filter((r) => warnings(r) || duplicate(r)).length + " para revisar";
    $("#rl-msub").textContent = fmt(subtotal());
    $("#rl-maddl").textContent = `Acréscimo (${state.percent}%)`;
    $("#rl-madd").textContent = fmt(addition());
    $("#rl-mtotal").textContent = fmt(subtotal() + addition());
  }

  /* ---------- render ---------- */
  function render(page) {
    if (page) view = page;
    const el = root();
    if (!el) return;
    if (view !== "rel-novo") {
      renderHistory();
      if (!historyLoaded) loadHistory();
      return;
    }
    if (phase === 0) {
      el.innerHTML = chooser();
      return;
    }
    const isEdit = editable();
    const title =
      state.kind === "medical"
        ? "Gerar relatórios de médicos"
        : state.id
          ? "Relatório consolidado"
          : "Gerar relatório";
    let html = head(
      title,
      state.mode === "manual"
        ? "Preenchimento manual dos lançamentos."
        : "Consolidação de pagamentos a partir de documentos de origem.",
      btn("Trocar modelo", "MBRel.chooseReport()"),
    );
    html += `<div class="rl-steps">${["Dados e documentos", "Conferência", "Finalização"]
      .map(
        (s, i) =>
          `<button type="button" class="rl-step ${phase === i + 1 ? "active" : phase > i + 1 ? "done" : ""}" onclick="MBRel.go(${i + 1})"><b>${phase > i + 1 ? "✓" : i + 1}</b>${s}</button>`,
      )
      .join("")}</div>`;
    if (state.id)
      html += `<div class="rl-statusbar"><div>${tag(state.status)} &nbsp; <b>${esc(state.title)}</b> &nbsp; <span class="rl-muted">Criado em ${localDate(state.created)}</span></div><div class="rl-actions">${!isEdit ? btn("Criar cópia", "MBRel.cloneReport()", "", "plus") : ""}${btn("Visualizar PDF", "MBRel.printReport()", "", "print")}</div></div>`;
    if (phase === 1)
      html +=
        (state.kind === "medical"
          ? '<div class="rl-notice"><b>Relatórios médicos:</b> o PSF é referência cadastral. Classifique cada serviço e informe o valor comprovado. Plantonistas e especialistas são exportados separadamente.</div>'
          : "") + importView();
    else if (phase === 2) html += state.kind === "medical" ? medicalEditor() : editorView();
    else html += finishView();
    el.innerHTML = html;
    if (phase === 1) wireDrop();
  }

  function chooser() {
    return (
      head("Novo relatório", "Escolha o tipo e a forma de preenchimento.") +
      `<section class="rl-panel rl-choosepanel"><div class="rl-ph"><h2>Tipo de relatório</h2></div><div class="rl-choice-list">${[
        ["general", "Relatório geral", "Pagamentos, fornecedores, veículos, máquinas e serviços."],
        ["medical", "Relatórios médicos", "Plantonistas e especialistas, em arquivos separados."],
      ]
        .map(
          ([k, t, d]) =>
            `<div class="rl-choice"><div class="rl-choice-mark">${icon("file")}</div><div style="flex:1"><strong>${t}</strong><p>${d}</p><div class="rl-actions" style="margin-top:12px"><button type="button" class="btn primary" onclick="MBRel.selectKind('${k}','manual')">Preencher manualmente</button><button type="button" class="btn" onclick="MBRel.selectKind('${k}','import')">Importar documentos</button></div></div></div>`,
        )
        .join("")}</div></section>`
    );
  }

  function go(n) {
    if (n === 3 && !state.rows.length) {
      toast("Anexe documentos ou adicione um lançamento manual.");
      return;
    }
    phase = n;
    render();
  }

  function importView() {
    const lock = editable() ? "" : "disabled";
    let html = panel(
      "Dados do relatório",
      "Informe a identificação e o período de competência.",
      `<div class="rl-pb rl-fields"><div><label>Identificação</label><input class="control" ${lock} value="${esc(state.title)}" onchange="MBRel.setField('title',this.value)"></div><div><label>Competência inicial</label><input class="control" ${lock} type="date" value="${esc(state.start)}" onchange="MBRel.setField('start',this.value)"></div><div><label>Competência final</label><input class="control" ${lock} type="date" value="${esc(state.end)}" onchange="MBRel.setField('end',this.value)"></div><div><label>Acréscimo (%)</label><input class="control" ${lock} type="number" min="0" max="1000" step="0.01" value="${esc(state.percent)}" onchange="MBRel.setField('percent',this.value)"></div><div class="rl-wide2"><label>Empresa / identificação complementar</label><input class="control" ${lock} placeholder="Opcional" value="${esc(state.company)}" onchange="MBRel.setField('company',this.value)"></div></div>`,
    );
    if (state.mode === "manual" && !state.files.length) {
      return (
        html +
        panel(
          "Preenchimento manual",
          "Nenhum documento é obrigatório.",
          `<div class="rl-pb">Informe os dados acima e comece a inserir os lançamentos diretamente na tabela.</div><div class="rl-foot"><div class="rl-actions">${editable() ? btn("Anexar documentos (opcional)", "MBRel.enableImport()") : ""}</div><div class="rl-actions">${btn("Preencher relatório", "MBRel.manualFromImport()", "primary")}</div></div>`,
        )
      );
    }
    html += panel(
      "Documentos de origem",
      "Adicione os arquivos que compõem o relatório.",
      `<div class="rl-pb">${
        editable()
          ? `<div class="rl-drop" id="rl-drop">${icon("upload")}<strong>Arraste os documentos para esta área</strong><span class="rl-muted">Excel (.xlsx, .xls) e CSV são lidos automaticamente · PDF e imagem ficam como anexo · até 30 MB por arquivo</span><button type="button" class="btn primary" onclick="document.getElementById('rl-file').click()">${icon("plus")} Selecionar arquivos</button><input id="rl-file" type="file" multiple accept=".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.webp,.tif,.tiff" hidden></div>`
          : ""
      }</div><div class="rl-tablewrap"><table class="rl-table"><thead><tr><th>Arquivo</th><th>Tipo identificado</th><th>Leitura</th><th>Registros</th><th class="rl-right">Valor extraído</th><th>Situação</th><th>Ações</th></tr></thead><tbody>${
        state.files.length
          ? state.files
              .map(
                (f) =>
                  `<tr><td><b>${esc(f.name)}</b><div class="rl-muted">${((f.size || 0) / 1024).toFixed(0)} KB</div>${f.warnings?.length ? `<div class="rl-small rl-warn-text">${esc([...new Set(f.warnings)].join(" · "))}</div>` : ""}</td><td>${esc(f.group || "—")}</td><td>${esc(f.method || "—")}</td><td>${f.count ?? "—"}</td><td class="rl-right">${f.count !== undefined && f.count !== null ? fmt(f.total) : "—"}</td><td>${tag(f.status)}</td><td><div class="rl-actions">${btn("Ver", `MBRel.openSource('${f.id}')`, "", "eye")}${
                    editable()
                      ? btn("Remover", `MBRel.removeFile('${f.id}')`, "rl-danger", "trash") +
                        (!["Extraído", "Revisar", "Anexo manual"].includes(f.status)
                          ? btn("Usar como anexo", `MBRel.manualFile('${f.id}')`)
                          : "")
                      : ""
                  }</div></td></tr>`,
              )
              .join("")
          : `<tr><td colspan="7" class="rl-empty">Nenhum documento anexado.</td></tr>`
      }</tbody></table></div><div class="rl-foot"><span class="rl-muted">${state.files.length} arquivo(s) · ${state.rows.length} lançamento(s)</span><div class="rl-actions">${
        editable()
          ? btn("Inserir manualmente", "MBRel.manualFromImport()", "", "plus") +
            btn(busy ? "Processando…" : "Reconhecer documentos", "MBRel.extractAll()", "primary", "file")
          : ""
      }${state.rows.length ? btn("Conferir lançamentos", "MBRel.go(2)", "", "chev") : ""}</div></div>`,
    );
    html += `<div class="rl-notice"><b>Conferência necessária:</b> planilhas são lidas automaticamente; PDFs e imagens ficam como anexo para conferência e os lançamentos são preenchidos à mão. Nenhum valor ausente deve ser presumido.</div>`;
    return html;
  }

  function wireDrop() {
    const d = $("#rl-drop"),
      f = $("#rl-file");
    if (!d) return;
    f.onchange = () => addFiles([...f.files]);
    d.ondragover = (e) => {
      e.preventDefault();
      d.classList.add("over");
    };
    d.ondragleave = () => d.classList.remove("over");
    d.ondrop = (e) => {
      e.preventDefault();
      d.classList.remove("over");
      addFiles([...e.dataTransfer.files]);
    };
  }
  const readData = (f) =>
    new Promise((res, rej) => {
      const rd = new FileReader();
      rd.onload = () => res(String(rd.result).split(",")[1]);
      rd.onerror = rej;
      rd.readAsDataURL(f);
    });
  async function addFiles(fs) {
    for (const f of fs) {
      if (f.size > 30 * 1024 * 1024) {
        toast("Arquivo acima de 30 MB: " + f.name);
        continue;
      }
      if (state.files.some((x) => x.name === f.name && x.size === f.size)) {
        toast("Arquivo já anexado: " + f.name);
        continue;
      }
      state.files.push({
        id: makeId(),
        name: f.name,
        size: f.size,
        type: f.type,
        data: await readData(f),
        status: "Aguardando",
      });
    }
    mark();
    render();
  }

  async function extractAll() {
    if (busy || !editable()) return;
    const list = state.files.filter((f) => ["Aguardando", "Falha"].includes(f.status));
    if (!list.length) {
      toast("Nenhum documento pendente de reconhecimento.");
      return;
    }
    busy = true;
    for (const f of list) {
      f.status = "Processando";
      render();
      try {
        let data = f.data;
        if (!data && f.path) data = (await fetchFile(f.path)).dataBase64;
        const x = await api("extract", { name: f.name, dataBase64: data, kind: state.kind });
        Object.assign(f, {
          group: x.group,
          method: x.method,
          warnings: x.warnings,
          count: x.rows.length,
          total: x.rows.reduce((s, r) => s + (r.value || 0), 0),
          manual: !!x.manual,
          status: x.manual ? "Anexo manual" : x.warnings.length || !x.rows.length ? "Revisar" : "Extraído",
        });
        state.rows = state.rows.filter((r) => r.fileId !== f.id);
        for (const r of x.rows)
          state.rows.push({
            ...r,
            category: r.category || (state.kind === "medical" ? "PSF / referência" : undefined),
            id: makeId(),
            fileId: f.id,
            source: state.kind === "medical" ? f.name : x.group,
            method: x.method,
            checked: false,
          });
      } catch (e) {
        f.status = "Falha";
        f.warnings = ["Não foi possível reconhecer este arquivo. Tente novamente ou use o preenchimento manual."];
        toast(e.message);
      }
      mark();
      render();
    }
    busy = false;
    state.rows.sort(
      (a, b) =>
        ((groupOrder.indexOf(a.source) + 10) % 10) - ((groupOrder.indexOf(b.source) + 10) % 10),
    );
    toast(
      list.some((f) => f.status === "Falha")
        ? "Alguns documentos não foram reconhecidos. Revise os anexos ou preencha manualmente."
        : "Reconhecimento concluído. Confira os registros antes de encaminhar.",
    );
    if (state.rows.length) phase = 2;
    render();
  }
  function removeFile(id) {
    if (!editable() || busy) return;
    if (!confirm("Remover o arquivo e os lançamentos vinculados?")) return;
    state.files = state.files.filter((f) => f.id !== id);
    state.rows = state.rows.filter((r) => r.fileId !== id);
    mark();
    render();
  }
  function manualFile(id) {
    const f = state.files.find((x) => x.id === id);
    if (f && editable()) {
      f.manual = true;
      f.status = "Anexo manual";
      mark();
      render();
    }
  }

  function dialog(id) {
    let d = document.getElementById(id);
    if (!d) {
      d = document.createElement("dialog");
      d.id = id;
      d.className = "rl-dialog";
      document.body.append(d);
    }
    return d;
  }
  function b64Blob(b64, type) {
    return new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type });
  }
  async function openSource(id) {
    const f = state.files.find((x) => x.id === id);
    if (!f) return;
    let data = f.data;
    try {
      if (!data && f.path) data = (await fetchFile(f.path)).dataBase64;
    } catch (e) {
      toast(e.message);
      return;
    }
    if (!data) {
      toast("Arquivo indisponível.");
      return;
    }
    const ext = f.name.split(".").pop().toLowerCase();
    const type =
      ext === "pdf"
        ? "application/pdf"
        : ["png", "jpg", "jpeg", "webp", "tif", "tiff"].includes(ext)
          ? "image/" + (ext === "jpg" ? "jpeg" : ext === "tif" ? "tiff" : ext)
          : "application/octet-stream";
    const u = URL.createObjectURL(b64Blob(data, type));
    const d = dialog("rl-source");
    d.innerHTML = `<div class="rl-ph"><div><h2>${esc(f.name)}</h2><div class="rl-muted">Conferência com o arquivo enviado</div></div><button type="button" class="btn" onclick="this.closest('dialog').close()">Fechar</button></div>${
      type === "application/pdf"
        ? `<iframe class="rl-docview" src="${u}"></iframe>`
        : type.startsWith("image/")
          ? `<img class="rl-docview" src="${u}" alt="">`
          : `<div class="rl-pb">Planilha original disponível para conferência. <a class="btn" href="${u}" download="${esc(f.name)}">Baixar arquivo original</a></div>`
    }`;
    d.onclose = () => URL.revokeObjectURL(u);
    d.showModal();
  }

  function enableImport() {
    state.mode = "import";
    render();
  }
  function manualFromImport() {
    phase = 2;
    if (state.rows.length) {
      render();
      return;
    }
    if (state.kind === "medical") {
      medicalTab = "Plantonistas";
      addMedical();
    } else addRow();
  }
  function addRow() {
    if (!editable()) return;
    state.rows.push({
      id: makeId(),
      name: "",
      doc: "",
      ref: "",
      bank: "",
      account: "",
      value: null,
      profession: "",
      location: "",
      address: "",
      notes: "",
      source: "Manual",
      method: "Manual",
      checked: false,
    });
    mark();
    filter = "";
    query = "";
    render();
  }
  function delRow(id) {
    if (!editable() || !confirm("Excluir este lançamento?")) return;
    state.rows = state.rows.filter((r) => r.id !== id);
    mark();
    render();
  }
  function editRow(id, key, val) {
    if (!editable()) return;
    const r = state.rows.find((x) => x.id === id);
    if (!r) return;
    if (key === "value") {
      const s = String(val).trim().replace(/r\$\s*/i, "");
      r.value = s === "" ? null : Math.round(Number(s.replace(/\./g, "").replace(",", ".")) * 100);
      if (!Number.isFinite(r.value)) r.value = null;
    } else r[key] = val;
    r.checked = false;
    mark();
    updateTotals();
    const tr = document.querySelector(`[data-rl-row="${id}"]`);
    if (tr) {
      tr.classList.toggle("flag", warnings(r) || duplicate(r));
      const chk = tr.querySelector("input[type=checkbox]");
      if (chk) chk.checked = false;
    }
  }
  function checkRow(id, v) {
    const r = state.rows.find((x) => x.id === id);
    if (!r || !editable()) return;
    r.checked = v;
    mark();
    updateTotals();
    document.querySelector(`[data-rl-row="${id}"]`)?.classList.toggle("flag", warnings(r) || duplicate(r));
  }
  const field = (r, k, cls = "") =>
    `<textarea class="${cls}" rows="2" ${editable() ? "" : "readonly"} onchange="MBRel.editRow('${r.id}','${k}',this.value)">${esc(r[k])}</textarea>`;
  const moneyInput = (r) =>
    `<input class="rl-value rl-right" ${editable() ? "" : "readonly"} value="${r.value === null || r.value === undefined ? "" : (r.value / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}" onchange="MBRel.editRow('${r.id}','value',this.value)">`;

  function editorView() {
    const groups = [...new Set(state.rows.map((r) => r.source))];
    const shown = state.rows.filter(
      (r) =>
        (!filter || filter === "review" ? filter !== "review" || warnings(r) || duplicate(r) : r.source === filter) &&
        (!query ||
          [r.name, r.doc, r.ref, r.bank, r.account].join(" ").toLowerCase().includes(query.toLowerCase())),
    );
    let html = metrics();
    html += `<div class="rl-notice"><b>Pré-visualização editável:</b> altere diretamente os campos da tabela. Linhas destacadas têm campos pendentes, possível duplicidade ou leitura ainda não conferida. O acréscimo segue o truncamento do relatório original.</div>`;
    html += panel(
      "Lançamentos consolidados",
      `${shown.length} de ${state.rows.length} registros · clique nos campos para corrigir`,
      `<div class="rl-pb rl-filterbar"><input class="control" style="max-width:300px" placeholder="Buscar nome, CPF ou referência..." value="${esc(query)}" onchange="MBRel.setQuery(this.value)"><select class="control" style="max-width:220px" onchange="MBRel.setFilter(this.value)"><option value="">Todos os documentos</option><option value="review" ${filter === "review" ? "selected" : ""}>Somente pendências</option>${groups.map((g) => `<option ${filter === g ? "selected" : ""} value="${esc(g)}">${esc(g)}</option>`).join("")}</select><span class="rl-muted">${state.rows.filter((r) => r.checked).length} conferido(s)</span></div><div class="rl-tablewrap"><table class="rl-table rl-editor"><thead><tr><th>#</th><th>Nome titular</th><th>CPF/CNPJ</th><th>Referência</th><th>Banco / agência</th><th>Conta</th><th class="rl-right">Valor (R$)</th><th>Origem</th><th>Conferido</th><th></th></tr></thead><tbody>${
        shown.length
          ? shown
              .map(
                (r) =>
                  `<tr data-rl-row="${r.id}" class="${warnings(r) || duplicate(r) ? "flag" : ""}"><td>${state.rows.indexOf(r) + 1}</td><td>${field(r, "name", "name")}</td><td>${field(r, "doc")}</td><td>${field(r, "ref", "ref")}</td><td>${field(r, "bank", "bank")}</td><td>${field(r, "account", "account")}</td><td>${moneyInput(r)}</td><td class="source">${r.fileId ? `<button type="button" class="btn" onclick="MBRel.openSource('${r.fileId}')">${icon("eye")} ${esc(r.source)}</button>` : "Manual"}<div class="rl-muted">${r.page ? "Pág. " + r.page : esc(r.sheet || r.method || "")}</div>${duplicate(r) ? '<div class="rl-warn-text">Possível duplicado</div>' : ""}</td><td style="text-align:center"><input aria-label="Conferir lançamento" type="checkbox" ${r.checked ? "checked" : ""} ${editable() ? "" : "disabled"} onchange="MBRel.checkRow('${r.id}',this.checked)"></td><td>${editable() ? btn("", `MBRel.delRow('${r.id}')`, "rl-danger", "trash") : ""}</td></tr>`,
              )
              .join("")
          : `<tr><td colspan="10" class="rl-empty">Nenhum lançamento encontrado.</td></tr>`
      }</tbody></table></div><div class="rl-foot"><div class="rl-actions">${btn("Voltar aos documentos", "MBRel.go(1)")}</div><div class="rl-actions">${btn("Prévia para impressão", "MBRel.printReport()", "", "print")}${editable() ? btn("Salvar rascunho", "MBRel.save(false)") : ""}${btn("Continuar", "MBRel.go(3)", "primary", "chev")}</div></div>`,
      editable() ? btn("Adicionar lançamento", "MBRel.addRow()", "", "plus") : "",
    );
    return html;
  }

  function medicalEditor() {
    const cats = ["Plantonistas", "Especialistas", "PSF / referência"];
    const rows = state.rows.filter(
      (r) =>
        (r.category || "PSF / referência") === medicalTab &&
        (!query || [r.name, r.doc, r.ref].join(" ").toLowerCase().includes(query.toLowerCase())),
    );
    let html = metrics();
    html += `<div class="rl-notice">Os registros de PSF são referências, sem valor contabilizado. Use "Criar plantão" ou "Criar especialidade" para gerar um pagamento a partir do cadastro; não confunda pagamento PSF com plantão ou especialidade. Confira valores e CPFs no original.</div>`;
    html += `<section class="rl-panel"><div class="rl-ph"><div><h2>Prévia editável dos relatórios médicos</h2><div class="rl-muted">Selecione o grupo e corrija os campos diretamente na tabela.</div></div><div class="rl-actions">${editable() ? btn("Adicionar lançamento", "MBRel.addMedical()", "primary", "plus") : ""}</div></div><div class="rl-pb"><div class="rl-actions">${cats
      .map(
        (k) =>
          `<button type="button" class="btn ${medicalTab === k ? "primary" : ""}" onclick="MBRel.setMedicalTab('${k}')">${k} (${state.rows.filter((r) => (r.category || "PSF / referência") === k).length})</button>`,
      )
      .join("")}</div><div class="rl-filterbar" style="margin-top:12px"><input class="control" style="max-width:320px" placeholder="Buscar nome ou CPF" value="${esc(query)}" onchange="MBRel.setQuery(this.value)"><b>Subtotal do grupo: ${fmt(sectionTotal(medicalTab))}</b></div></div><div class="rl-tablewrap"><table class="rl-table rl-editor"><thead><tr><th>Nome / CPF</th><th>${medicalTab === "Especialistas" ? "Especialidade" : "Serviço / plantão / UBS"}</th><th>Profissão / local</th><th>Endereço</th><th>Banco / conta</th><th>Valor (R$)</th><th>Observações / origem</th><th>Conferido</th><th>Ações</th></tr></thead><tbody>${
      rows
        .map(
          (r) =>
            `<tr data-rl-row="${r.id}" class="${warnings(r) ? "flag" : ""}"><td>${field(r, "name", "name")}${field(r, "doc")}</td><td>${field(r, "ref", "ref")}</td><td>${field(r, "profession")}${field(r, "location")}</td><td>${field(r, "address", "ref")}</td><td>${field(r, "bank", "bank")}${field(r, "account", "account")}</td><td>${medicalTab === "PSF / referência" ? `<span class="rl-muted">Origem: ${r.referenceValue == null ? "—" : fmt(r.referenceValue)}</span>` : moneyInput(r)}</td><td>${field(r, "notes", "ref")}${r.fileId ? btn("Original", `MBRel.openSource('${r.fileId}')`) : "Manual"}<div class="rl-muted">${r.sheet ? esc(r.sheet) : ""}</div></td><td><input type="checkbox" aria-label="Conferir lançamento" ${r.checked ? "checked" : ""} ${editable() ? "" : "disabled"} onchange="MBRel.checkRow('${r.id}',this.checked)"></td><td><div class="rl-actions">${
              editable()
                ? (medicalTab === "PSF / referência"
                    ? btn("Criar plantão", `MBRel.copyPSF('${r.id}','Plantonistas')`) +
                      btn("Criar especialidade", `MBRel.copyPSF('${r.id}','Especialistas')`)
                    : `<select class="control" onchange="MBRel.moveMedical('${r.id}',this.value)">${cats.map((k) => `<option ${medicalTab === k ? "selected" : ""}>${k}</option>`).join("")}</select>`) +
                  btn("Excluir", `MBRel.delRow('${r.id}')`, "rl-danger")
                : ""
            }</div></td></tr>`,
        )
        .join("") ||
      '<tr><td colspan="9" class="rl-empty">Nenhum registro neste grupo. Importe um documento ou adicione manualmente.</td></tr>'
    }</tbody></table></div><div class="rl-foot"><div class="rl-actions">${btn("Voltar", "MBRel.go(1)")}${btn("Prévia A4", "MBRel.printReport()")}${btn("Baixar PDF", "MBRel.downloadDoc('pdf')")}${btn("Baixar Word", "MBRel.downloadDoc('doc')")}</div><div class="rl-actions">${editable() ? btn("Salvar rascunho", "MBRel.save(false)") : ""}${btn("Continuar", "MBRel.go(3)", "primary")}</div></div></section>`;
    return html;
  }
  function addMedical() {
    if (!editable()) return;
    state.rows.push({
      id: makeId(),
      name: "",
      doc: "",
      ref: "",
      bank: "",
      account: "",
      address: "",
      profession: "",
      location: "",
      notes: "",
      value: null,
      category: medicalTab,
      source: "Manual",
      method: "Manual",
      checked: false,
    });
    mark();
    render();
  }
  function moveMedical(id, k) {
    if (!editable()) return;
    const r = state.rows.find((x) => x.id === id);
    if (!r) return;
    r.category = k;
    r.checked = false;
    if (k === "PSF / referência") {
      r.referenceValue = r.value;
      r.value = null;
    }
    mark();
    render();
  }
  function copyPSF(id, k) {
    if (!editable()) return;
    const r = state.rows.find((x) => x.id === id);
    if (!r) return;
    state.rows.push({
      ...r,
      id: makeId(),
      category: k,
      ref: "",
      profession: "",
      location: "",
      notes: "",
      value: null,
      checked: false,
    });
    medicalTab = k;
    mark();
    render();
  }

  function finishView() {
    let html = metrics();
    const bad = state.rows.filter((r) => warnings(r) || duplicate(r)).length;
    const ro = editable() ? "" : "readonly";
    const admin = isAdmin();
    html += panel(
      "Fechamento do relatório",
      "Revise os totais e encaminhe para o administrador.",
      `<div class="rl-pb"><div class="rl-fields"><div><label>Identificação</label><input class="control" ${ro} value="${esc(state.title)}" onchange="MBRel.setField('title',this.value)"></div><div><label>Início</label><input class="control" ${ro} type="date" value="${esc(state.start)}" onchange="MBRel.setField('start',this.value)"></div><div><label>Fim</label><input class="control" ${ro} type="date" value="${esc(state.end)}" onchange="MBRel.setField('end',this.value)"></div><div><label>Acréscimo (%)</label><input class="control" ${ro} type="number" min="0" max="1000" step="0.01" value="${esc(state.percent)}" onchange="MBRel.setField('percent',this.value)"></div></div><div style="margin-top:16px">${bad ? `<div class="rl-notice">${bad} lançamento(s) com indicação de revisão. Confira com o original antes de enviar.</div>` : ""}<table class="rl-table"><thead><tr><th>Origem</th><th>Registros</th><th class="rl-right">Subtotal</th></tr></thead><tbody>${[
        ...new Set(included().map((r) => (state.kind === "medical" ? r.category : r.source))),
      ]
        .map((g) => {
          const rs = included().filter((r) => (state.kind === "medical" ? r.category : r.source) === g);
          return `<tr><td>${esc(g)}</td><td>${rs.length}</td><td class="rl-right">${fmt(rs.reduce((s, r) => s + (r.value || 0), 0))}</td></tr>`;
        })
        .join("") || '<tr><td colspan="3" class="rl-empty">Nenhum lançamento contabilizado.</td></tr>'}</tbody></table></div></div><div class="rl-foot"><div class="rl-actions">${btn("Voltar à conferência", "MBRel.go(2)")}${btn("Visualizar / imprimir", "MBRel.printReport()", "", "print")}${btn("Exportar Word", "MBRel.downloadDoc('doc')", "", "dl")}${btn("Baixar PDF", "MBRel.downloadDoc('pdf')", "", "dl")}</div><div class="rl-actions">${
        editable() ? btn("Salvar rascunho", "MBRel.save(false)") + btn("Enviar para análise", "MBRel.save(true)", "primary", "chev") : ""
      }${admin && state.status === "Em análise" ? btn("Registrar visto", "MBRel.action('view')", "primary", "eye") : ""}${
        admin && state.status === "Visualizado" ? btn("Aprovar relatório", "MBRel.action('approve')", "primary", "check") : ""
      }${admin && ["Em análise", "Visualizado"].includes(state.status) ? btn("Devolver para correção", "MBRel.action('return')", "rl-danger") : ""}</div></div>`,
    );
    html += panel(
      "Histórico de movimentações",
      "Registros de salvamento, visto e aprovação.",
      `<div class="rl-pb rl-audit">${
        state.events.length
          ? state.events
              .map(
                (e) =>
                  `<div class="rl-event"><span class="dot"></span><div><b>${esc(e.action)}</b><div class="rl-muted">${esc(e.by)} · ${localDate(e.at)}</div>${e.note ? `<div>${esc(e.note)}</div>` : ""}</div></div>`,
              )
              .join("")
          : '<div class="rl-muted">Nenhuma movimentação registrada.</div>'
      }</div>`,
    );
    return html;
  }

  /* ---------- gravação ---------- */
  const semDados = (r) => ({ ...r, files: (r.files || []).map(({ data, ...f }) => f) });
  async function save(submit) {
    if (!editable() || busy) return;
    if (!String(state.title).trim() || !state.rows.length) {
      toast("Informe a identificação e inclua pelo menos um lançamento.");
      return;
    }
    const pct = Number(state.percent);
    if (!Number.isFinite(pct) || pct < 0 || pct > 1000) {
      toast("Percentual inválido.");
      return;
    }
    if (state.start && state.end && state.start > state.end) {
      toast("A competência inicial não pode ser posterior à final.");
      return;
    }
    if (submit) {
      if (
        state.kind === "medical" &&
        included().some(
          (r) =>
            !r.doc ||
            !r.ref ||
            !r.bank ||
            !r.account ||
            (r.category === "Plantonistas" && (!r.profession || !r.location)),
        )
      ) {
        toast("Complete CPF, serviço, dados bancários e campos de plantão antes de enviar.");
        return;
      }
      if (!state.start || !state.end) {
        toast("Informe o período de competência.");
        return;
      }
      if (state.files.some((f) => ["Aguardando", "Falha", "Processando"].includes(f.status) && !f.manual)) {
        toast("Há documentos não processados. Revise ou remova-os.");
        return;
      }
      if (
        !included().length ||
        included().some(
          (r) =>
            !r.name || r.value === null || r.value === undefined || r.value < 0 || (!r.checked && (warnings(r) || duplicate(r))),
        )
      ) {
        toast("Confira as linhas destacadas (marque como conferido) e complete os campos obrigatórios.");
        return;
      }
      if (!confirm("Enviar relatório para análise? A edição ficará bloqueada.")) return;
    }
    busy = true;
    toast(submit ? "Enviando relatório…" : "Salvando rascunho…");
    try {
      const novos = state.files
        .filter((f) => f.data && !f.path)
        .map((f) => ({ id: f.id, name: f.name, type: f.type, dataBase64: f.data }));
      const keepTab = medicalTab;
      state = await api("save", { report: semDados(state), novos });
      dirty = false;
      if (submit) state = await api("action", { id: state.id, action: "submit" });
      medicalTab = keepTab;
      if (submit) phase = 3;
      historyLoaded = false;
      render();
      toast(submit ? "Relatório enviado para análise." : "Rascunho salvo no histórico.");
    } catch (e) {
      toast(e.message);
    } finally {
      busy = false;
    }
  }
  async function action(a) {
    let note = "";
    if (a === "return") {
      note = prompt("Motivo da devolução:") || "";
      if (!note.trim()) return;
    } else if (
      !confirm(a === "view" ? "Registrar que você visualizou este relatório?" : "Confirmar aprovação deste relatório?")
    )
      return;
    try {
      state = await api("action", { id: state.id, action: a, note });
      dirty = false;
      historyLoaded = false;
      render();
      toast("Situação atualizada: " + state.status);
    } catch (e) {
      toast(e.message);
    }
  }
  function cloneReport() {
    state = {
      ...state,
      id: "",
      created: undefined,
      updated: undefined,
      status: "Rascunho",
      events: [],
      snapshot: {},
      author: actor(),
      title: state.title + " — cópia",
    };
    mark();
    phase = 2;
    render();
  }

  /* ---------- histórico / aprovações ---------- */
  async function loadHistory() {
    historyLoaded = true;
    try {
      historyRows = await api("list");
      if (view !== "rel-novo") renderHistory();
    } catch (e) {
      historyLoaded = false;
      toast(e.message);
      const el = root();
      if (el && view !== "rel-novo")
        el.querySelector("tbody")?.replaceChildren(
          Object.assign(document.createElement("tr"), {
            innerHTML: `<td colspan="8" class="rl-empty">${esc(e.message)}</td>`,
          }),
        );
    }
  }
  function renderHistory() {
    const el = root();
    if (!el) return;
    const review = view === "rel-aprovacoes";
    const list = historyRows.filter(
      (r) =>
        (!review || ["Em análise", "Visualizado"].includes(r.status)) &&
        (!filter || r.status === filter) &&
        (!query || [r.title, r.company, r.author, r.created].join(" ").toLowerCase().includes(query.toLowerCase())),
    );
    el.innerHTML =
      head(
        review ? "Aprovações" : "Histórico de relatórios",
        review
          ? "Relatórios encaminhados para visto e aprovação."
          : "Consulte os relatórios gerados, rascunhos e aprovações.",
        btn("Atualizar", "MBRel.reload()", "", "refresh") + btn("Novo relatório", "MBRel.newFromList()", "primary", "plus"),
      ) +
      (review && !isAdmin() ? '<div class="rl-notice">Apenas o administrador pode registrar visto, aprovar ou devolver relatórios.</div>' : "") +
      panel(
        "Relatórios registrados",
        `${list.length} registro(s) encontrados`,
        `<div class="rl-pb rl-filterbar"><input class="control" style="max-width:280px" placeholder="Buscar relatório..." value="${esc(query)}" onchange="MBRel.setQuery(this.value)"><select class="control" style="max-width:180px" onchange="MBRel.setFilter(this.value)"><option value="">Todas as situações</option>${["Rascunho", "Em análise", "Visualizado", "Aprovado", "Devolvido"].map((s) => `<option ${filter === s ? "selected" : ""}>${s}</option>`).join("")}</select></div><div class="rl-tablewrap"><table class="rl-table"><thead><tr><th>Relatório</th><th>Competência</th><th>Data de geração</th><th>Responsável</th><th>Registros</th><th class="rl-right">Total geral</th><th>Situação</th><th>Ações</th></tr></thead><tbody>${
          list.length
            ? list
                .map(
                  (r) =>
                    `<tr><td><b>${esc(r.title)}</b><div class="rl-muted">${r.kind === "medical" ? "Relatórios médicos" : "Relatório geral"}${r.company ? " · " + esc(r.company) : ""}</div></td><td>${dateBR(r.start)} a ${dateBR(r.end)}</td><td>${localDate(r.created)}</td><td>${esc(r.author)}</td><td>${r.count}</td><td class="rl-right"><b>${fmt(r.total)}</b></td><td>${tag(r.status)}</td><td>${btn("Visualizar", `MBRel.openReport('${r.id}')`, "", "eye")}</td></tr>`,
                )
                .join("")
            : `<tr><td colspan="8" class="rl-empty">${historyLoaded ? "Nenhum relatório nesta situação." : "Carregando…"}</td></tr>`
        }</tbody></table></div>`,
      );
  }
  async function openReport(id) {
    try {
      state = await api("get", { id });
      phase = editable() ? 2 : 3;
      dirty = false;
      query = "";
      filter = "";
      medicalTab = "Plantonistas";
      app().goto?.("rel-novo");
      render("rel-novo");
    } catch (e) {
      toast(e.message);
    }
  }

  /* ---------- PDF / Word ---------- */
  const choices = () =>
    state.kind === "medical" ? MEDICAS.filter((k) => included().some((r) => r.category === k)) : ["Geral"];
  async function exportOne(k, ext) {
    const x = await api("export", { report: semDados(state), section: k, format: ext });
    return b64Blob(x.data, x.mime);
  }
  function baixar(blob, nome) {
    const u = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = u;
    a.download = nome;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 60000);
  }
  async function downloadDoc(ext) {
    try {
      const ks = choices();
      if (!ks.length) return toast("Nenhum lançamento médico classificado.");
      for (const k of ks) baixar(await exportOne(k, ext), `Assessoria MB - ${state.title} - ${k}.${ext}`);
    } catch (e) {
      toast(e.message);
    }
  }
  let previewURL;
  async function showPreview(k) {
    try {
      const b = await exportOne(k, "pdf");
      if (previewURL) URL.revokeObjectURL(previewURL);
      previewURL = URL.createObjectURL(b);
      $("#rl-pdf-frame").src = previewURL;
    } catch (e) {
      toast(e.message);
    }
  }
  function printReport() {
    const ks = choices();
    if (!ks.length) return toast("Nenhum lançamento classificado.");
    const admin = isAdmin();
    const d = dialog("rl-preview");
    d.innerHTML = `<div class="rl-ph"><h2>Pré-visualização A4</h2><button type="button" class="btn" onclick="this.closest('dialog').close()">Fechar</button></div><div class="rl-pb rl-actions">${ks.map((k) => `<button type="button" class="btn" onclick="MBRel.showPreview('${k}')">${k}</button>`).join("")}${btn("PDF", "MBRel.downloadDoc('pdf')", "", "dl")}${btn("Word", "MBRel.downloadDoc('doc')", "", "dl")}${state.id && Object.keys(state.snapshot || {}).length ? btn("Cópia original salva", "MBRel.downloadSnapshot()") : ""}${admin && state.status === "Em análise" ? btn("Registrar visto", "MBRel.previewAction('view')", "primary") : ""}${admin && state.status === "Visualizado" ? btn("Dar OK / Aprovar", "MBRel.previewAction('approve')", "primary") : ""}</div><iframe id="rl-pdf-frame" class="rl-docview" title="Prévia PDF"></iframe>`;
    d.showModal();
    showPreview(ks.includes(medicalTab) ? medicalTab : ks[0]);
  }
  function previewAction(a) {
    $("#rl-preview")?.close();
    action(a);
  }
  async function downloadSnapshot() {
    try {
      for (const [k, path] of Object.entries(state.snapshot || {})) {
        const x = await fetchFile(path);
        baixar(b64Blob(x.dataBase64, "application/pdf"), `Assessoria MB - ${state.title} - ${k} - copia enviada.pdf`);
      }
    } catch (e) {
      toast(e.message);
    }
  }

  /* ---------- navegação ---------- */
  function selectKind(kind, mode = "import") {
    state = fresh();
    state.kind = kind;
    state.mode = mode;
    state.title = kind === "medical" ? "Relatórios médicos" : "Relatório";
    phase = 1;
    dirty = false;
    query = "";
    filter = "";
    medicalTab = "Plantonistas";
    render();
  }
  function chooseReport() {
    if (dirty && !confirm("Descartar alterações não salvas?")) return;
    state = fresh();
    phase = 0;
    dirty = false;
    filter = "";
    query = "";
    render("rel-novo");
  }

  window.addEventListener("beforeunload", (e) => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  window.MBRel = {
    render,
    canLeave(next) {
      if (view === "rel-novo" && next !== "rel-novo" && dirty) {
        if (!confirm("Há alterações não salvas no relatório. Sair sem salvar?")) return false;
        dirty = false;
      }
      if (next !== view) {
        query = "";
        filter = "";
      }
      return true;
    },
    go,
    selectKind,
    chooseReport,
    newFromList() {
      app().goto?.("rel-novo");
      chooseReport();
    },
    reload() {
      historyLoaded = false;
      renderHistory();
      loadHistory();
    },
    setField(k, v) {
      state[k] = v;
      mark();
      if (k === "percent") updateTotals();
    },
    setQuery(v) {
      query = v;
      render();
    },
    setFilter(v) {
      filter = v;
      render();
    },
    setMedicalTab(k) {
      medicalTab = k;
      render();
    },
    enableImport,
    manualFromImport,
    extractAll,
    removeFile,
    manualFile,
    openSource,
    addRow,
    delRow,
    editRow,
    checkRow,
    addMedical,
    moveMedical,
    copyPSF,
    save,
    action,
    cloneReport,
    openReport,
    printReport,
    showPreview,
    previewAction,
    downloadDoc,
    downloadSnapshot,
  };
})();
