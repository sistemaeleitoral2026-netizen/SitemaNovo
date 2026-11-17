const ST = {
  Nova: ["#EAF1FE", "#1B5BD0"],
  "Em andamento": ["#FFF3DE", "#9A5800"],
  Encaminhada: ["#F1ECFD", "#6741C9"],
  Resolvida: ["#E5F5EB", "#157A3E"],
  Atrasada: ["#FDECEC", "#B42318"],
  "Em comissão": ["#FFF3DE", "#9A5800"],
  "Em pauta": ["#EAF1FE", "#1B5BD0"],
  Aprovado: ["#E5F5EB", "#157A3E"],
  Sancionado: ["#E5F5EB", "#157A3E"],
  Protocolado: ["#F2F5FA", "#33425C"],
  Respondido: ["#E5F5EB", "#157A3E"],
  "Aguardando resposta": ["#FFF3DE", "#9A5800"],
  Agendado: ["#EAF1FE", "#1B5BD0"],
  "Em revisão": ["#FFF3DE", "#9A5800"],
  Publicado: ["#E5F5EB", "#157A3E"],
};
const DEM = [
  [
    "2026-1284",
    "Maria do Socorro Lima",
    "(98) 98812-4471",
    "Cidade Operária",
    "Infraestrutura",
    "Buraco na avenida principal próximo à feira, risco para motociclistas",
    "SEMOSP",
    "Em andamento",
    "Carlos Mendes",
    "30/10",
    "06/11",
  ],
  [
    "2026-1283",
    "José Ribamar Costa",
    "(98) 99134-2208",
    "Coroadinho",
    "Iluminação",
    "Três postes apagados na Rua São Sebastião",
    "SEMOSP · Iluminação Pública",
    "Encaminhada",
    "Thiago Serra",
    "29/10",
    "05/11",
  ],
  [
    "2026-1282",
    "Antônia Ferreira",
    "(98) 98701-5532",
    "Anil",
    "Saúde",
    "Agendamento de cirurgia de catarata pelo SUS",
    "SEMUS",
    "Nova",
    "Débora Castro",
    "29/10",
    "12/11",
  ],
  [
    "2026-1281",
    "Raimundo Nonato Silva",
    "(98) 98455-1190",
    "São Cristóvão",
    "Saneamento",
    "Esgoto a céu aberto na Travessa Boa Esperança",
    "CAEMA",
    "Atrasada",
    "Carlos Mendes",
    "14/10",
    "28/10",
  ],
  [
    "2026-1280",
    "Francisca Sousa",
    "(98) 99288-6714",
    "Vila Embratel",
    "Educação",
    "Vaga em creche para criança de 3 anos",
    "SEMED",
    "Resolvida",
    "Débora Castro",
    "10/10",
    "24/10",
  ],
  [
    "2026-1279",
    "Assoc. de Moradores do Turu",
    "(98) 98122-0453",
    "Turu",
    "Infraestrutura",
    "Capina e limpeza do canal da Rua 7",
    "SEMOSP",
    "Em andamento",
    "Thiago Serra",
    "27/10",
    "10/11",
  ],
  [
    "2026-1278",
    "Luiz Carlos Pereira",
    "(98) 99610-3387",
    "Liberdade",
    "Mobilidade",
    "Atrasos frequentes na linha Liberdade/Centro",
    "SMTT",
    "Encaminhada",
    "Carlos Mendes",
    "25/10",
    "08/11",
  ],
  [
    "2026-1277",
    "Joana Darc Mendes",
    "(98) 98877-9021",
    "João Paulo",
    "Saúde",
    "Falta de medicamento de uso contínuo na UBS do bairro",
    "SEMUS",
    "Nova",
    "Débora Castro",
    "31/10",
    "07/11",
  ],
  [
    "2026-1276",
    "Pedro Henrique Araújo",
    "(98) 99012-7765",
    "Cohab",
    "Esporte e lazer",
    "Reforma da quadra poliesportiva da praça",
    "SEMDEL",
    "Em andamento",
    "Thiago Serra",
    "20/10",
    "20/11",
  ],
  [
    "2026-1275",
    "Rosângela Batista",
    "(98) 98345-6610",
    "Bequimão",
    "Iluminação",
    "Iluminação insuficiente na parada de ônibus da Av. dos Holandeses",
    "SEMOSP · Iluminação Pública",
    "Resolvida",
    "Carlos Mendes",
    "08/10",
    "22/10",
  ],
  [
    "2026-1274",
    "Edvaldo Moraes",
    "(98) 98990-1145",
    "Coroadinho",
    "Assistência social",
    "Orientação para inscrição no CadÚnico",
    "SEMCAS",
    "Resolvida",
    "Débora Castro",
    "06/10",
    "13/10",
  ],
  [
    "2026-1273",
    "Conceição Almeida",
    "(98) 99701-2284",
    "Cidade Operária",
    "Saneamento",
    "Falta de água há cinco dias na Unidade 201",
    "CAEMA",
    "Atrasada",
    "Carlos Mendes",
    "17/10",
    "24/10",
  ],
].map((a, i, arr) => ({
  ord: arr.length - i + "º",
  id: a[0],
  cid: a[1],
  tel: a[2],
  bairro: a[3],
  area: a[4],
  desc: a[5],
  orgao: a[6],
  status: a[7],
  resp: a[8],
  data: a[9],
  prazo: a[10],
}));

const BAIRROS = [
  ["Cidade Operária", "Zona Leste", 142, 71, 6],
  ["Coroadinho", "Zona Sul", 118, 76, 5],
  ["Anil", "Zona Norte", 97, 82, 4],
  ["São Cristóvão", "Zona Leste", 86, 69, 4],
  ["Vila Embratel", "Zona Sul", 74, 85, 3],
  ["Turu", "Zona Norte", 64, 78, 3],
  ["Liberdade", "Centro", 55, 80, 4],
  ["João Paulo", "Centro", 49, 84, 2],
  ["Cohab", "Zona Leste", 46, 74, 3],
  ["Bequimão", "Zona Norte", 41, 88, 2],
  ["Centro", "Centro", 38, 79, 2],
  ["Vinhais", "Zona Norte", 33, 90, 1],
].map((b) => ({ n: b[0], reg: b[1], v: b[2], res: b[3], lid: b[4] }));

const SERIES = {
  "6m": {
    l: ["Mai", "Jun", "Jul", "Ago", "Set", "Out"],
    a: [0, 0, 0, 0, 0, 0],
    b: [0, 0, 0, 0, 0, 0],
  },
  "1a": {
    l: [
      "Nov",
      "Dez",
      "Jan",
      "Fev",
      "Mar",
      "Abr",
      "Mai",
      "Jun",
      "Jul",
      "Ago",
      "Set",
      "Out",
    ],
    a: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    b: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  mandato: {
    l: ["T1/25", "T2/25", "T3/25", "T4/25", "T1/26", "T2/26", "T3/26"],
    a: [0, 0, 0, 0, 0, 0, 0],
    b: [0, 0, 0, 0, 0, 0, 0],
  },
};

const EMPTY_FORM = {
  cid: "",
  cpf: "",
  nasc: "",
  genero: "Não informado",
  whats: "",
  tel: "",
  email: "",
  cep: "",
  rua: "",
  num: "",
  comp: "",
  bairro: "Cidade Operária",
  ref: "",
  area: "Infraestrutura",
  prio: "Normal",
  origem: "Gabinete",
  resp: "",
  orgao: "A definir",
  desc: "",
  lgpd: false,
};
const digits = (v) => v.replace(/\D/g, "");
const MASK = {
  cpf: (v) => {
    const d = digits(v).slice(0, 11);
    return d
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  },
  whats: (v) => {
    const d = digits(v).slice(0, 11);
    return d.length < 3
      ? d
      : d.length < 8
        ? `(${d.slice(0, 2)}) ${d.slice(2)}`
        : `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
  },
  cep: (v) => {
    const d = digits(v).slice(0, 8);
    return d.length > 5 ? d.slice(0, 5) + "-" + d.slice(5) : d;
  },
};
MASK.tel = MASK.whats;
function spark(arr) {
  const mx = Math.max(...arr),
    mn = Math.min(...arr);
  return arr
    .map(
      (v, i) =>
        `${(i * (70 / (arr.length - 1)) + 1).toFixed(1)},${(24 - ((v - mn) / (mx - mn || 1)) * 20).toFixed(1)}`,
    )
    .join(" ");
}
function sty(o) {
  const s = ST[o.status] || ["#F2F5FA", "#33425C"];
  return { ...o, sbg: s[0], sc: s[1] };
}

class Component extends DCLogic {
  state = {
    page: "painel",
    finTab: "painel",
    finMes: "",
    finPageDesp: 0,
    finPageVerbas: 0,
    finFil: { origem: "", todos: "mes" },
    finForm: null,
    eqForm: null,
    verbaForm: null,
    confTab: "fundos",
    fundoForm: null,
    fundoLancForm: null,
    w: window.innerWidth,
    drawer: false,
    notif: false,
    filter: "Todas",
    q: "",
    propTab: "pl",
    range: "6m",
    sel: null,
    newOpen: false,
    pick: null,
    pickQ: "",
    pickCom: "",
    propAberta: "",
    fil: {
      dBairro: "",
      dArea: "",
      dResp: "",
      dSort: "recentes",
      cBairro: "",
      cOrigem: "",
      cSit: "",
      lReg: "",
      lSit: "",
      lSort: "cid",
    },
    toast: "",
    dem: [],
    form: { ...EMPTY_FORM },
  };
  componentDidMount() {
    window.__mandatoApp = this;
    this.onDados = (e) => {
      if (
        e.origin !== window.location.origin ||
        !e.data ||
        e.data.type !== "mandato-dados"
      )
        return;
      window.__MANDATO__ = e.data.payload || {};
      const lista = window.__MANDATO__.busca || [];
      const cpfDig = String(
        (this.state.form && this.state.form.cpf) || "",
      ).replace(/\D/g, "");
      if (
        this.state.newOpen &&
        this.state.demSugOpen &&
        cpfDig.length === 11 &&
        lista.length === 1 &&
        String(lista[0].cpf || "").replace(/\D/g, "") === cpfDig
      ) {
        this.aplicarDemandaPessoa(lista[0]);
        return;
      }
      this.setState({ real: Date.now() });
      setTimeout(() => this.pintarDemSug(), 0);
    };
    window.addEventListener("message", this.onDados);
    window.parent.postMessage(
      { type: "mandato-pronto" },
      window.location.origin,
    );
    this.onR = () => this.setState({ w: window.innerWidth });
    window.addEventListener("resize", this.onR);
  }
  componentWillUnmount() {
    window.removeEventListener("message", this.onDados);
    window.removeEventListener("resize", this.onR);
    clearTimeout(this.tt);
  }
  mostrarBusca = () => {
    let box = document.getElementById("mandato-busca");
    if (!box) {
      box = document.createElement("div");
      box.id = "mandato-busca";
      box.style.cssText =
        "position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;padding:12px;background:rgba(8,18,40,.45)";
      box.innerHTML =
        '<section style="background:#fff;border-radius:14px;width:min(520px,100%);max-height:80vh;overflow:auto;padding:18px;display:flex;flex-direction:column;gap:10px"><h2 style="margin:0;font-size:18px;font-weight:800"></h2><p style="margin:0;font-size:13px;color:#5B6B85">A busca é feita nas fichas do Nerites. Só entra aqui quem você escolher.</p><input placeholder="Nome na ficha" style="height:42px;border:1px solid #DCE3EE;border-radius:10px;padding:0 12px;font-size:14px"><div class="lista" style="display:flex;flex-direction:column;gap:8px"></div><button type="button" class="fechar" style="height:40px;border:1px solid #DCE3EE;background:#fff;border-radius:10px;font-weight:600;cursor:pointer">Fechar</button></section>';
      document.body.appendChild(box);
      box.addEventListener("click", (e) => {
        if (e.target === box || e.target.classList.contains("fechar")) {
          box.style.display = "none";
          this.setState({ pick: null, pickQ: "" });
        }
      });
      box
        .querySelector("input")
        .addEventListener("input", (e) => this.onPick(e));
    }
    box.style.display = "flex";
    box.querySelector("h2").textContent =
      this.state.pick === "agenda"
        ? "Novo compromisso"
        : "Cadastrar cidadão da ficha";
    this.atualizarBusca();
  };
  atualizarBusca = () => {
    const box = document.getElementById("mandato-busca");
    if (!box) return;
    if (this.state.pick) box.style.display = "flex";
    else if (box.style.display === "none") return;
    const lista = box.querySelector(".lista");
    const itens = (window.__MANDATO__ && window.__MANDATO__.busca) || [];
    const qBusca = (
      (box.querySelector("input") && box.querySelector("input").value) ||
      this.state.pickQ ||
      ""
    ).trim();
    const digBusca = qBusca.replace(/\D/g, "");
    const aviso =
      qBusca.length < 2 && digBusca.length < 4
        ? "Digite o nome (2+ letras) ou CPF."
        : itens.length
          ? ""
          : "Nenhuma pessoa encontrada.";
    lista.innerHTML =
      (aviso
        ? '<p style="margin:0;font-size:12px;color:#5B6B85">' + aviso + "</p>"
        : "") +
      itens
        .map(
          (p, i) =>
            '<button type="button" data-i="' +
            i +
            '" style="display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:100%;text-align:left;border:1px solid #E3E8F0;background:#fff;border-radius:10px;padding:10px 12px;cursor:pointer"><strong style="font-size:14px"></strong><span class="tel" style="font-size:12px;color:#33425C"></span><span class="doc" style="font-size:12px;color:#5B6B85"></span><span class="onde" style="font-size:12px;color:#5B6B85"></span></button>',
        )
        .join("");
    [...lista.querySelectorAll("button")].forEach((btn) => {
      const p = itens[Number(btn.dataset.i)];
      btn.querySelector("strong").textContent = p.n;
      btn.querySelector(".tel").textContent = p.telefone
        ? "Telefone " + p.telefone
        : "Sem telefone";
      btn.querySelector(".doc").textContent =
        [
          p.titulo ? "Título " + p.titulo : "",
          p.zona ? "Zona " + p.zona : "",
          p.secao ? "Seção " + p.secao : "",
        ]
          .filter(Boolean)
          .join(" · ") || "Ficha Nerites";
      btn.querySelector(".onde").textContent = [p.bairro, p.lider]
        .filter(Boolean)
        .join(" · ");
      btn.onclick = () => {
        this.confirmaPick(p);
        box.style.display = "none";
      };
    });
  };
  pintarDemSug = () => {
    let box = document.getElementById("demanda-sug");
    const ancora = document.getElementById("demanda-nome-ancora");
    if (!this.state.newOpen || !this.state.demSugOpen || !ancora) {
      if (box) box.style.display = "none";
      return;
    }
    if (!box) {
      box = document.createElement("div");
      box.id = "demanda-sug";
      document.body.appendChild(box);
    }
    const rect = ancora.getBoundingClientRect();
    box.style.cssText =
      "position:fixed;left:" +
      Math.round(rect.left) +
      "px;top:" +
      Math.round(rect.bottom + 4) +
      "px;width:" +
      Math.round(rect.width) +
      "px;z-index:90;display:flex;flex-direction:column;gap:6px;max-height:220px;overflow:auto;border:1px solid #E3E8F0;border-radius:10px;padding:8px;background:#fff;box-shadow:0 8px 24px rgba(15,23,42,.14)";
    const itens = (window.__MANDATO__ && window.__MANDATO__.busca) || [];
    const q = String(
      (this.state.form && (this.state.form.cid || this.state.form.cpf)) || "",
    ).trim();
    const dig = q.replace(/\D/g, "");
    if (!q || (q.length < 2 && dig.length < 4)) {
      box.style.display = "none";
      box.innerHTML = "";
      return;
    }
    if (!itens.length) {
      box.innerHTML =
        '<p style="margin:0;font-size:12px;color:#5B6B85">Nenhuma pessoa encontrada no Nerites.</p>';
      return;
    }
    box.innerHTML =
      '<span style="font-size:12px;color:#5B6B85;font-weight:600">Selecione para preencher os dados</span>' +
      itens
        .map(
          (p, i) =>
            '<button type="button" data-i="' +
            i +
            '" style="display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:100%;text-align:left;border:1px solid #E3E8F0;background:#F7F9FC;border-radius:10px;padding:10px 12px;cursor:pointer"><strong style="font-size:14px"></strong><span class="sub" style="font-size:12px;color:#5B6B85"></span></button>',
        )
        .join("");
    [...box.querySelectorAll("button")].forEach((btn) => {
      const p = itens[Number(btn.dataset.i)];
      btn.querySelector("strong").textContent = p.n || "";
      btn.querySelector(".sub").textContent = p.sub || p.tipoLabel || "";
      btn.onclick = () => this.aplicarDemandaPessoa(p);
    });
  };
  aplicarDemandaPessoa = (p) => {
    if (!p) return;
    const form = Object.assign({}, this.state.form, {
      cid: p.n || this.state.form.cid,
      cpf: p.cpf ? (MASK.cpf ? MASK.cpf(p.cpf) : p.cpf) : this.state.form.cpf,
      nasc: p.nasc || this.state.form.nasc,
      whats: p.telefone
        ? MASK.whats
          ? MASK.whats(p.telefone)
          : p.telefone
        : this.state.form.whats,
      email: p.email || this.state.form.email,
      cep: p.cep ? (MASK.cep ? MASK.cep(p.cep) : p.cep) : this.state.form.cep,
      rua: p.rua || this.state.form.rua,
      num: p.num || this.state.form.num,
      comp: p.comp || this.state.form.comp,
      bairro: p.bairro || this.state.form.bairro,
    });
    const w = window.__MANDATO__ || (window.__MANDATO__ = {});
    w.busca = [];
    this.setState({ form: form, demSugOpen: false, real: Date.now() });
    const box = document.getElementById("demanda-sug");
    if (box) {
      box.style.display = "none";
      box.innerHTML = "";
    }
    this.flash((p.tipoLabel || "Pessoa") + " preenchida na demanda");
  };
  abrirBusca = (modo, com) => {
    this.setState({ pick: modo, pickCom: com || "", pickQ: "" });
    const w = window.__MANDATO__ || (window.__MANDATO__ = {});
    w.busca = [];
    this.mostrarBusca();
  };
  onPick = (e) => {
    const q = e.target.value;
    this.setState({ pickQ: q });
    window.parent.postMessage(
      { type: "mandato-buscar", q },
      window.location.origin,
    );
  };
  confirmaPick = (p) => {
    const modo = this.state.pick;
    window.parent.postMessage(
      {
        type: modo === "agenda" ? "mandato-agenda" : "mandato-vincular",
        pessoa: p,
      },
      window.location.origin,
    );
    this.setState({ pick: null, pickQ: "" });
  };
  fechaPick = () => this.setState({ pick: null });
  go = (p) => {
    this.setState({ page: p, drawer: false, notif: false });
    window.scrollTo(0, 0);
  };
  goFin = (tab) => {
    this.setState({ page: "fin", finTab: tab, drawer: false, notif: false });
    window.scrollTo(0, 0);
  };
  goConf = (tab) => {
    this.setState({ page: "conf", confTab: tab, drawer: false, notif: false });
    window.scrollTo(0, 0);
  };
  flash = (t) => {
    clearTimeout(this.tt);
    this.setState({ toast: t });
    this.tt = setTimeout(() => this.setState({ toast: "" }), 2600);
  };
  link = (p) => (e) => {
    e.preventDefault();
    this.go(p);
  };
  setFil = (k) => (e) => {
    const v = e.target.value;
    this.setState((s) => ({ fil: { ...s.fil, [k]: v } }));
  };
  clearFil = (keys) => () =>
    this.setState((s) => {
      const f = { ...s.fil };
      keys.forEach(
        (k) => (f[k] = k === "dSort" ? "recentes" : k === "lSort" ? "cid" : ""),
      );
      return { fil: f, filter: keys.includes("dBairro") ? "Todas" : s.filter };
    });
  setF = (k) => (e) => {
    const v =
      k === "lgpd"
        ? e.target.checked
        : MASK[k]
          ? MASK[k](e.target.value)
          : e.target.value;
    this.setState((s) => ({
      form: { ...s.form, [k]: v },
      demSugOpen: k === "cid" || k === "cpf" ? true : s.demSugOpen,
    }));
    if ((k === "cid" || k === "cpf") && this.state.newOpen) {
      clearTimeout(this._demBuscaT);
      const q = String(v || "").trim();
      this._demBuscaT = setTimeout(() => {
        const dig = q.replace(/\D/g, "");
        const letras = q.replace(/[0-9.\-/() ]/g, "").trim();
        if (dig.length >= 4 || letras.length >= 2) {
          window.parent.postMessage(
            { type: "mandato-buscar", q },
            window.location.origin,
          );
        } else {
          const w = window.__MANDATO__ || (window.__MANDATO__ = {});
          w.busca = [];
          this.pintarDemSug();
        }
      }, 220);
    }
  };

  renderVals() {
    const s = this.state,
      mobile = s.w < 1024;
    const openCount = s.dem.filter((d) => d.status !== "Resolvida").length;
    const agendaHoje =
      window.__MANDATO__ &&
      window.__MANDATO__.agenda &&
      window.__MANDATO__.agenda[0] &&
      window.__MANDATO__.agenda[0].ev
        ? window.__MANDATO__.agenda[0].ev.length
        : 0;
    const pautaCount =
      window.__MANDATO__ && Array.isArray(window.__MANDATO__.props)
        ? window.__MANDATO__.props.filter(function (p) {
            return /pauta/i.test(p.status || "");
          }).length
        : 0;
    const NAV = [
      ["painel", "Painel do Mandato", "layout-dashboard"],
      ["fin", "Financeiro", "wallet"],
      ["demandas", "Demandas", "message-2", openCount],
      ["cidadaos", "Cidadãos atendidos", "users"],
      ["prop", "Proposições", "gavel"],
      ["agenda", "Agenda", "calendar"],
      ["bairros", "Mapa dos Bairros", "map-2"],
      ["lid", "Lideranças", "user-star"],
      ["com", "Comunicação", "speakerphone"],
      ["rel", "Relatórios", "chart-bar"],
      ["conf", "Configurações", "settings"],
    ];
    const GRUPOS = {
      fin: {
        tabAtivo: s.finTab,
        ir: (tab) => this.goFin(tab),
        filhos: [
          ["painel", "Painel", "layout-dashboard"],
          ["desp", "Despesas", "receipt"],
          ["verbas", "Verbas da Câmara", "building-bank"],
          ["equipe", "Equipe do gabinete", "users-group"],
        ],
      },
      conf: {
        tabAtivo: s.confTab,
        ir: (tab) => this.goConf(tab),
        filhos: [["fundos", "Fundos", "building-bank"]],
      },
    };
    const navItems = NAV.flatMap(([id, label, icon, badge]) => {
      const a = s.page === id;
      const grupo = GRUPOS[id];
      const aberto = grupo && a;
      const item = {
        label,
        icon: grupo ? (aberto ? "chevron-down" : "chevron-right") : icon,
        badge,
        hasBadge: !!badge,
        onClick: grupo ? () => grupo.ir(grupo.filhos[0][0]) : () => this.go(id),
        bg: a ? "#1B5BD0" : "transparent",
        color: a ? "#fff" : "#C9D5EA",
        fw: a ? 600 : 500,
        pl: "12px",
        fsz: "14.5px",
        isz: "19px",
      };
      if (!grupo || !aberto) return [item];
      const children = grupo.filhos.map(([tab, tlabel, ticon]) => ({
        label: tlabel,
        icon: ticon,
        hasBadge: false,
        onClick: () => grupo.ir(tab),
        bg: grupo.tabAtivo === tab ? "#16366B" : "transparent",
        color: grupo.tabAtivo === tab ? "#fff" : "#9FB2D6",
        fw: grupo.tabAtivo === tab ? 600 : 500,
        pl: "34px",
        fsz: "13.5px",
        isz: "16px",
      }));
      return [item, ...children];
    });
    const bottomNav = [
      ["painel", "Painel", "layout-dashboard"],
      ["demandas", "Demandas", "message-2"],
      ["agenda", "Agenda", "calendar"],
      ["cidadaos", "Cidadãos", "users"],
      ["mais", "Mais", "dots"],
    ].map(([id, label, icon]) => {
      const a =
        id === "mais"
          ? !["painel", "demandas", "agenda", "cidadaos"].includes(s.page)
          : s.page === id;
      return {
        label,
        icon,
        color: a ? "#1B5BD0" : "#5B6B85",
        onClick:
          id === "mais"
            ? () => this.setState({ drawer: true })
            : () => this.go(id),
      };
    });

    const ser = SERIES[s.range],
      mx = Math.max(...ser.a, 1) * 1.1;
    const bars = ser.l.map((l, i) => ({
      label: l,
      v1: ser.a[i],
      v2: ser.b[i],
      h1: ((ser.a[i] / mx) * 100).toFixed(1),
      h2: ((ser.b[i] / mx) * 100).toFixed(1),
    }));
    const ranges = [
      ["6m", "6 meses"],
      ["1a", "1 ano"],
      ["mandato", "Mandato"],
    ].map(([k, label]) => ({
      label,
      onClick: () => this.setState({ range: k }),
      bg: s.range === k ? "#0D2350" : "transparent",
      color: s.range === k ? "#fff" : "#5B6B85",
    }));

    const q = s.q.trim().toLowerCase();
    const match = (d) =>
      !q ||
      [d.cid, d.bairro, d.desc, d.ord, d.area]
        .join(" ")
        .toLowerCase()
        .includes(q);
    const openD = (d) => () => this.setState({ sel: d.id });
    const tabs = [
      "Todas",
      "Nova",
      "Em andamento",
      "Encaminhada",
      "Atrasada",
      "Resolvida",
    ];
    const statusTabs = tabs.map((t) => {
      const a = s.filter === t;
      return {
        label: t,
        count:
          t === "Todas"
            ? s.dem.length
            : s.dem.filter((d) => d.status === t).length,
        onClick: () => this.setState({ filter: t }),
        bg: a ? "#0D2350" : "#fff",
        color: a ? "#fff" : "#33425C",
        bd: a ? "#0D2350" : "#DCE3EE",
      };
    });
    const F = s.fil,
      pz = (x) => {
        const [dd, mm] = x.split("/");
        return +mm * 100 + +dd;
      };
    let demArr = s.dem.filter(
      (d) =>
        (s.filter === "Todas" || d.status === s.filter) &&
        match(d) &&
        (!F.dBairro || d.bairro === F.dBairro) &&
        (!F.dArea || d.area === F.dArea) &&
        (!F.dResp || d.resp === F.dResp),
    );
    if (F.dSort === "prazo")
      demArr = [...demArr].sort((a, b) => pz(a.prazo) - pz(b.prazo));
    if (F.dSort === "antigas") demArr = [...demArr].reverse();
    const demList = demArr.map((d) => ({
      ...sty(d),
      open: openD(d),
      prazoC: d.status === "Atrasada" ? "#B42318" : "#13213A",
    }));
    const opt = (all, arr) => [
      { v: "", l: all },
      ...arr.map((x) => ({ v: x, l: x })),
    ];
    const uniq = (a) =>
      [...new Set(a)].sort((x, y) => x.localeCompare(y, "pt"));
    const regOf = (n) => (BAIRROS.find((b) => b.n === n) || {}).reg || "Centro";
    const CID =
      window.__MANDATO__ && Array.isArray(window.__MANDATO__.cidadoes)
        ? window.__MANDATO__.cidadoes
        : [];
    const CID_DEMO = [
      [
        "Maria do Socorro Lima",
        "(98) 98812-4471",
        "Cidade Operária",
        "Gabinete itinerante",
        "Dona Zefa Nascimento",
        4,
        1,
        "30/10/2026",
      ],
      [
        "José Ribamar Costa",
        "(98) 99134-2208",
        "Coroadinho",
        "WhatsApp",
        "Raimundo “Mundico” Lopes",
        2,
        1,
        "29/10/2026",
      ],
      [
        "Antônia Ferreira",
        "(98) 98701-5532",
        "Anil",
        "Gabinete",
        "Irmã Lúcia Serra",
        1,
        1,
        "29/10/2026",
      ],
      [
        "Raimundo Nonato Silva",
        "(98) 98455-1190",
        "São Cristóvão",
        "Liderança",
        "Josué Pinheiro",
        3,
        1,
        "27/10/2026",
      ],
      [
        "Francisca Sousa",
        "(98) 99288-6714",
        "Vila Embratel",
        "WhatsApp",
        "Kátia Rocha",
        2,
        0,
        "24/10/2026",
      ],
      [
        "Luiz Carlos Pereira",
        "(98) 99610-3387",
        "Liberdade",
        "Gabinete",
        "—",
        1,
        1,
        "25/10/2026",
      ],
      [
        "Joana Darc Mendes",
        "(98) 98877-9021",
        "João Paulo",
        "Instagram",
        "—",
        1,
        1,
        "31/10/2026",
      ],
      [
        "Pedro Henrique Araújo",
        "(98) 99012-7765",
        "Cohab",
        "Gabinete itinerante",
        "—",
        2,
        1,
        "20/10/2026",
      ],
      [
        "Rosângela Batista",
        "(98) 98345-6610",
        "Bequimão",
        "WhatsApp",
        "—",
        3,
        0,
        "22/10/2026",
      ],
      [
        "Edvaldo Moraes",
        "(98) 98990-1145",
        "Coroadinho",
        "Liderança",
        "Raimundo “Mundico” Lopes",
        1,
        0,
        "13/10/2026",
      ],
      [
        "Conceição Almeida",
        "(98) 99701-2284",
        "Cidade Operária",
        "Liderança",
        "Dona Zefa Nascimento",
        2,
        1,
        "17/10/2026",
      ],
      [
        "Gilberto Sá",
        "(98) 98213-5590",
        "Turu",
        "Gabinete itinerante",
        "Marcos Batalha",
        1,
        0,
        "02/09/2026",
      ],
    ];
    const OI = {
      WhatsApp: "brand-whatsapp",
      Instagram: "brand-instagram",
      Gabinete: "building",
      "Gabinete itinerante": "route",
      Liderança: "user-star",
    };
    const cidList = CID.filter(
      (c) =>
        (!q || c.join(" ").toLowerCase().includes(q)) &&
        (!F.cBairro || c[2] === F.cBairro) &&
        (!F.cOrigem || c[3] === F.cOrigem) &&
        (!F.cSit || (F.cSit === "abertas" ? c[6] > 0 : c[6] === 0)),
    ).map((c) => ({
      n: c[0],
      tel: c[1],
      bairro: c[2],
      origem: c[3],
      oIcon: OI[c[3]],
      lid: c[4],
      dem: c[5],
      abertas: c[6],
      ult: c[7],
      ini: c[0]
        .split(" ")
        .filter((w) => w.length > 2)
        .slice(0, 2)
        .map((w) => w[0])
        .join(""),
      excluir: () =>
        window.parent.postMessage(
          { type: "mandato-excluir", alvo: "cidadao", id: c[8] },
          window.location.origin,
        ),
    }));
    const LID =
      window.__MANDATO__ && Array.isArray(window.__MANDATO__.lideres)
        ? window.__MANDATO__.lideres
        : [];
    const LID_DEMO = [
      [
        "Dona Zefa Nascimento",
        "Presidente da associação de moradores",
        "Cidade Operária",
        412,
        38,
        "28/10/2026",
        "Carlos Mendes",
      ],
      [
        "Raimundo “Mundico” Lopes",
        "Líder comunitário",
        "Coroadinho",
        356,
        31,
        "24/10/2026",
        "Thiago Serra",
      ],
      [
        "Irmã Lúcia Serra",
        "Coordenadora de pastoral",
        "Anil",
        298,
        22,
        "21/10/2026",
        "Thiago Serra",
      ],
      [
        "Josué Pinheiro",
        "Presidente do clube de mães",
        "São Cristóvão",
        241,
        19,
        "17/10/2026",
        "Carlos Mendes",
      ],
      [
        "Kátia Rocha",
        "Agente comunitária de saúde",
        "Vila Embratel",
        220,
        17,
        "30/10/2026",
        "Débora Castro",
      ],
      [
        "Marcos Batalha",
        "Treinador de escolinha de futebol",
        "Turu",
        187,
        12,
        "15/09/2026",
        "Thiago Serra",
      ],
      [
        "Sebastiana Campos",
        "Presidente de associação de feirantes",
        "João Paulo",
        164,
        14,
        "08/10/2026",
        "Débora Castro",
      ],
      [
        "Wellington Barros",
        "Líder de juventude",
        "Liberdade",
        132,
        9,
        "02/09/2026",
        "Carlos Mendes",
      ],
      [
        "Graça Mendonça",
        "Diretora de escola comunitária",
        "Bequimão",
        118,
        8,
        "26/10/2026",
        "Débora Castro",
      ],
    ];
    const days = (d) => {
      const [dd, mm] = d.split("/");
      return (11 - +mm) * 30 + (1 - +dd) + 30;
    };
    let lidArr = LID.map((l) => {
      const late = days(l[5]) > 40;
      return {
        n: l[0],
        papel: l[1],
        bairro: l[2],
        reg: regOf(l[2]),
        cid: l[3],
        dem: l[4],
        vis: l[5],
        ass: l[6],
        sit: late ? "Visita atrasada" : "Em dia",
        sbg: late ? "#FFF3DE" : "#E5F5EB",
        sc: late ? "#9A5800" : "#157A3E",
        ini: l[0]
          .replace(/[“”]/g, "")
          .split(" ")
          .filter((w) => w.length > 2)
          .slice(0, 2)
          .map((w) => w[0])
          .join(""),
        agendar: () => {
          window.parent.postMessage(
            {
              type: "mandato-agenda",
              pessoa: { n: l[0], sub: l[2] || "", id: "lider:" + l[0] },
            },
            window.location.origin,
          );
          this.flash("Compromisso marcado com " + l[0]);
        },
      };
    }).filter(
      (l) =>
        (!q || [l.n, l.bairro, l.papel].join(" ").toLowerCase().includes(q)) &&
        (!F.lReg || l.reg === F.lReg) &&
        (!F.lSit || l.sit === F.lSit),
    );
    lidArr.sort((a, b) =>
      F.lSort === "dem"
        ? b.dem - a.dem
        : F.lSort === "nome"
          ? a.n.localeCompare(b.n, "pt")
          : b.cid - a.cid,
    );
    const urgentes = s.dem
      .filter((d) => d.status === "Atrasada" || d.status === "Nova")
      .slice(0, 4)
      .map((d) => ({ ...sty(d), open: openD(d) }));

    const selD = s.dem.find((d) => d.id === s.sel);
    const sel = selD
      ? {
          ...sty(selD),
          endereco: selD.endereco || `${selD.bairro} · São Luís – MA`,
          hist: [
            {
              t: "Demanda registrada no gabinete",
              w: `${selD.data}/2026 · por ${selD.resp}`,
            },
            ...(selD.status !== "Nova"
              ? [
                  {
                    t: `Ofício enviado à ${selD.orgao}`,
                    w: `${selD.data}/2026 · Ofício nº ${selD.id.slice(-3)}/2026-GAB`,
                  },
                ]
              : []),
            ...(selD.status === "Em andamento"
              ? [{ t: "Órgão confirmou vistoria no local", w: "há 2 dias" }]
              : []),
            ...(selD.status === "Atrasada"
              ? [
                  {
                    t: "Prazo de resposta do órgão vencido",
                    w: `${selD.prazo}/2026`,
                  },
                ]
              : []),
            ...(selD.status === "Resolvida"
              ? [
                  {
                    t: "Cidadão informado da solução",
                    w: `${selD.prazo}/2026 · via WhatsApp`,
                  },
                ]
              : []),
          ],
        }
      : {};

    const PROPS_DEMO = {
      pl: [
        [
          "PL 112/2026",
          "Institui o programa Feira Limpa nos mercados e feiras municipais",
          "Em comissão",
          "Comissão de Constituição e Justiça · protocolado em 14/10",
        ],
        [
          "PL 098/2026",
          "Prioridade de vagas em creches para filhos de mães atípicas",
          "Em pauta",
          "Ordem do dia de 05/11 · 1ª discussão",
        ],
        [
          "PL 071/2026",
          "Cria o Selo Empresa Amiga do Centro Histórico",
          "Aprovado",
          "Aprovado em 2º turno · aguardando sanção",
        ],
        [
          "PL 045/2026",
          "Institui a Semana Municipal do Beiju e da Culinária Maranhense",
          "Sancionado",
          "Sancionado em 18/08/2026",
        ],
        [
          "PL 019/2026",
          "Obriga a divulgação da fila de cirurgias eletivas no portal da SEMUS",
          "Em pauta",
          "Ordem do dia de 05/11 · 2ª discussão",
        ],
      ],
      ind: [
        [
          "IND 1.204/2026",
          "Recuperação asfáltica da avenida principal da Cidade Operária",
          "Protocolado",
          "Destinatário: Prefeitura · SEMOSP",
        ],
        [
          "IND 1.188/2026",
          "Instalação de lâmpadas de LED na Rua São Sebastião, Coroadinho",
          "Protocolado",
          "Destinatário: SEMOSP · Iluminação Pública",
        ],
        [
          "IND 1.150/2026",
          "Ampliação do horário da UBS do João Paulo até as 22h",
          "Respondido",
          "Resposta da SEMUS recebida em 21/10",
        ],
        [
          "IND 1.097/2026",
          "Construção de abrigo na parada de ônibus do Bequimão",
          "Respondido",
          "Obra incluída no cronograma de 2027",
        ],
      ],
      req: [
        [
          "REQ 356/2026",
          "Solicita à SEMUS informações sobre a fila de cirurgias eletivas",
          "Aguardando resposta",
          "Aprovado em plenário em 07/10",
        ],
        [
          "REQ 341/2026",
          "Convoca a CAEMA para audiência sobre abastecimento na Zona Leste",
          "Aprovado",
          "Audiência marcada para 12/11",
        ],
        [
          "REQ 322/2026",
          "Voto de aplauso às quebradeiras de coco babaçu",
          "Aprovado",
          "Aprovado por unanimidade",
        ],
      ],
    };
    const PROPS = (window.__MANDATO__ && window.__MANDATO__.propsByTab) || {
      pl: [],
      req: [],
      ind: [],
    };
    const cortar = (o) => {
      const cheia = o.ementa || "";
      const aberta = s.propAberta === o.num;
      const grande = cheia.length > 160;
      o.resumo =
        !grande || aberta
          ? cheia
          : cheia.slice(0, 160).replace(/\s+\S*$/, "") + "…";
      o.grande = grande;
      o.lerMais = aberta ? "Ler menos" : "Ler mais";
      o.ler = () =>
        this.setState({
          propAberta: this.state.propAberta === o.num ? "" : o.num,
        });
      return o;
    };
    const propList = (PROPS[s.propTab] || []).map(
      ([num, ementa, status, info]) =>
        cortar(sty({ num, ementa, status, info })),
    );
    const propTabs = [
      ["pl", "Projetos de Lei"],
      ["ind", "Indicações"],
      ["req", "Requerimentos"],
    ].map(([k, label]) => ({
      label,
      onClick: () => this.setState({ propTab: k }),
      color: s.propTab === k ? "#1B5BD0" : "#5B6B85",
      line: s.propTab === k ? "#1B5BD0" : "transparent",
    }));
    const propTramitando =
      window.__MANDATO__ && Array.isArray(window.__MANDATO__.props)
        ? window.__MANDATO__.props.map((p) => cortar(sty(p)))
        : [...PROPS.pl.filter((p) => p[2] !== "Sancionado"), PROPS.req[0]]
            .filter(Boolean)
            .slice(0, 4)
            .map(([num, ementa, status]) =>
              cortar(sty({ num, ementa, status })),
            );

    const EVT = {
      Plenário: ["#EAF1FE", "#1B5BD0"],
      Comunidade: ["#E5F5EB", "#157A3E"],
      Reunião: ["#F1ECFD", "#6741C9"],
      Imprensa: ["#FFF3DE", "#9A5800"],
    };
    const ev = (h, t, l, tipo) => ({
      h,
      t,
      l,
      tipo,
      bg: EVT[tipo][0],
      c: EVT[tipo][1],
    });
    const agendaWeek = (
      window.__MANDATO__ && Array.isArray(window.__MANDATO__.agenda)
        ? window.__MANDATO__.agenda
        : []
    ).map(function (day) {
      return {
        d: day.d,
        w: day.w,
        ev: (day.ev || []).map(function (ev) {
          return Object.assign({}, ev, {
            excluir: function () {
              window.parent.postMessage(
                { type: "mandato-excluir", alvo: "agenda", id: ev.id },
                window.location.origin,
              );
            },
          });
        }),
      };
    });
    const AGENDA_DEMO = [
      {
        d: "03",
        w: "Terça",
        ev: [
          ev(
            "09:00",
            "Sessão ordinária",
            "Plenário da Câmara Municipal",
            "Plenário",
          ),
          ev(
            "14:30",
            "Visita à associação de moradores",
            "Cidade Operária",
            "Comunidade",
          ),
          ev(
            "17:00",
            "Reunião com lideranças",
            "Anil · gabinete itinerante",
            "Reunião",
          ),
        ],
      },
      {
        d: "04",
        w: "Quarta",
        ev: [
          ev("08:30", "Reunião semanal da equipe", "Gabinete", "Reunião"),
          ev(
            "10:00",
            "Comissão de Obras e Serviços Públicos",
            "Sala das Comissões",
            "Plenário",
          ),
          ev("15:00", "Atendimento ao público", "Gabinete", "Comunidade"),
        ],
      },
      {
        d: "05",
        w: "Quinta",
        ev: [
          ev(
            "09:00",
            "Sessão ordinária · PL 098 e PL 019 em pauta",
            "Plenário da Câmara Municipal",
            "Plenário",
          ),
          ev(
            "16:00",
            "Audiência com a SEMOSP",
            "Secretaria de Obras",
            "Reunião",
          ),
        ],
      },
      {
        d: "06",
        w: "Sexta",
        ev: [
          ev(
            "09:00",
            "Gabinete itinerante",
            "Coroadinho · escola municipal",
            "Comunidade",
          ),
          ev(
            "19:00",
            "Entrevista em rádio local",
            "Estúdio · Centro",
            "Imprensa",
          ),
        ],
      },
    ];

    // ===================== FINANCEIRO =====================
    // Só monta listas pesadas na página Financeiro/Config (fundos).
    // Antes isso rodava em TODO render e deixava o menu lento.
    const precisaFinUi = s.page === "fin" || s.page === "conf";
    const FIN = (window.__MANDATO__ && window.__MANDATO__.fin) || null;
    const finErro = (window.__MANDATO__ && window.__MANDATO__.finErro) || "";
    const brl = (n) =>
      (Number(n) || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });
    const dataBr = (d) => {
      const t = String(d || "")
        .slice(0, 10)
        .split("-");
      return t.length === 3 ? `${t[2]}/${t[1]}/${t[0]}` : "—";
    };
    const NM = [
      "Jan",
      "Fev",
      "Mar",
      "Abr",
      "Mai",
      "Jun",
      "Jul",
      "Ago",
      "Set",
      "Out",
      "Nov",
      "Dez",
    ];
    const rot = (m) => (m ? `${NM[+m.slice(5, 7) - 1]}/${m.slice(0, 4)}` : "—");
    const finMeses = (FIN && FIN.meses) || [];
    const finMes = s.finMes || (finMeses[0] && finMeses[0].mes) || "";
    const mesAtual = finMeses.find((m) => m.mes === finMes) || null;
    const podeEditar = !!(FIN && FIN.podeEditar);
    const ORIG = {
      VIEP: ["VIEP (reembolso da Câmara)", "#E5F5EB", "#157A3E", "receipt"],
      PROPRIO: ["Recurso próprio (salário)", "#F1ECFD", "#6741C9", "wallet"],
      OUTRO: ["Outra fonte", "#F2F5FA", "#33425C", "coin"],
    };
    const STF = {
      pendente: ["Pendente", "#FFF3DE", "#9A5800"],
      enviado: ["Enviado à Câmara", "#EAF1FE", "#1B5BD0"],
      reembolsado: ["Reembolsado", "#E5F5EB", "#157A3E"],
      glosado: ["Glosado", "#FDECEC", "#B42318"],
      pago: ["Pago", "#E5F5EB", "#157A3E"],
    };
    const statusOpts = Object.keys(STF).map((k) => ({ v: k, l: STF[k][0] }));
    const post = (msg) =>
      window.parent.postMessage(msg, window.location.origin);
    const lancRaw = precisaFinUi ? (FIN && FIN.lancamentos) || [] : [];
    const lanc = lancRaw.map((l) => {
      const o = ORIG[l.origem] || ORIG.OUTRO,
        st = STF[l.status] || STF.pendente;
      return {
        ...l,
        dataBr: dataBr(l.data),
        compRotulo: rot(l.competencia),
        valorBr: brl(l.valor),
        origemTxt: o[0],
        obg: o[1],
        oc: o[2],
        icon: o[3],
        statusTxt: st[0],
        sbg: st[1],
        sc: st[2],
        statusOpts,
        origemCurta:
          { VIEP: "VIEP", PROPRIO: "Recurso próprio", OUTRO: "Outra fonte" }[
            l.origem
          ] || "—",
        fornecedorTxt: l.fornecedor || "sem fornecedor",
        documentoTxt: l.documento || "—",
        editar: () =>
          this.setState({
            finForm: {
              id: l.id,
              origem: l.origem,
              categoria: l.categoria,
              descricao: l.descricao,
              valor: String(l.valor).replace(".", ","),
              data: String(l.data).slice(0, 10),
              competencia: l.competencia,
              fornecedor: l.fornecedor || "",
              documento: l.documento || "",
              status: l.status,
              observacao: l.observacao || "",
            },
          }),
        excluir: () => {
          if (window.confirm("Excluir este lançamento?"))
            post({ type: "mandato-fin-excluir", id: l.id });
        },
        onStatus: (e) =>
          post({
            type: "mandato-fin-status",
            id: l.id,
            status: e.target.value,
          }),
      };
    });
    const lancMes = lanc.filter((l) => l.competencia === finMes);
    const vp = mesAtual
      ? mesAtual.viep
      : {
          teto: (FIN && FIN.config && FIN.config.tetoViep) || 20000,
          gasto: 0,
          saldo: 0,
          reembolsado: 0,
          aReceber: 0,
          aComprovar: 0,
          qtdNotas: 0,
        };
    const pctV = Math.min(100, vp.teto ? (vp.gasto / vp.teto) * 100 : 0);
    const gab = (FIN && FIN.gabinete) || { teto: 0, total: 0, saldo: 0, pessoas: 0 };
    const pctG = gab.teto ? Math.min(100, (gab.total / gab.teto) * 100) : 0;
    const sal = mesAtual && mesAtual.salario;
    const tt = (mesAtual && mesAtual.totais) || {
      salarioBruto: 0,
      descontos: 0,
      salarioLiquido: 0,
      despesasProprias: 0,
      sobraSalario: 0,
    };
    const CINZA = "#5B6B85",
      TXT = "#13213A",
      NEG = "#B42318";
    const L = (rotulo, valor, o = {}) => ({
      rotulo,
      valor,
      cor: o.cor || TXT,
      corRotulo: o.total ? TXT : CINZA,
      peso: o.total ? 700 : 400,
      borda: o.total ? "1px solid #E3E8F0" : "0",
    });
    const menos = (n) => (n ? `− ${brl(n)}` : brl(0));
    const saldoViep = vp.reembolsado - vp.gasto;
    const blocoSal = {
      titulo: "Subsídio do vereador",
      fonte: "Folha da Câmara",
      rotuloPrincipal: "Subsídio bruto",
      principal: brl(tt.salarioBruto),
      corPrincipal: TXT,
      linhas:
        sal && sal.recebeu
          ? [
              L("Descontos (INSS e IR)", menos(tt.descontos), {
                cor: tt.descontos ? NEG : TXT,
              }),
              L("Líquido creditado", brl(tt.salarioLiquido), { total: true }),
              ...(tt.despesasProprias
                ? [
                    L(
                      "Despesas pagas com o salário",
                      menos(tt.despesasProprias),
                      { cor: NEG },
                    ),
                    L("Sobra do salário", brl(tt.sobraSalario), {
                      total: true,
                      cor: tt.sobraSalario < 0 ? NEG : TXT,
                    }),
                  ]
                : []),
            ]
          : [L("Situação", "Fora da folha neste mês")],
      temBarra: false,
      temAviso: !!(sal && sal.recebeu && sal.bruto < 15000),
      corAviso: CINZA,
      aviso:
        sal && sal.recebeu && sal.bruto < 15000
          ? "Mês parcial: valor proporcional aos dias no exercício do mandato."
          : "",
    };
    const blocoViep = {
      titulo: "Verba indenizatória",
      fonte: "VIEP · reembolso",
      rotuloPrincipal:
        saldoViep < 0 ? "A receber da Câmara" : "Saldo a comprovar com notas",
      principal: brl(Math.abs(saldoViep)),
      corPrincipal: saldoViep < 0 ? "#9A5800" : TXT,
      linhas: [
        L("Recebido da Câmara", brl(vp.reembolsado)),
        L(`Notas lançadas (${vp.qtdNotas})`, menos(vp.gasto), {
          cor: vp.gasto ? NEG : TXT,
        }),
        L(saldoViep < 0 ? "A receber" : "Saldo", brl(Math.abs(saldoViep)), {
          total: true,
          cor: saldoViep < 0 ? "#9A5800" : TXT,
        }),
      ],
      temBarra: true,
      barra: pctV.toFixed(1),
      corBarra: vp.gasto > vp.teto ? NEG : "#1B5BD0",
      legendaBarra: `${brl(vp.gasto)} de ${brl(vp.teto)} do limite mensal (${pctV.toFixed(0)}%)`,
      temAviso: vp.gasto > vp.teto || (vp.reembolsado > 0 && vp.gasto === 0),
      corAviso: vp.gasto > vp.teto ? NEG : "#9A5800",
      aviso:
        vp.gasto > vp.teto
          ? `Notas acima do limite mensal em ${brl(vp.gasto - vp.teto)}: o excedente não é reembolsável.`
          : vp.reembolsado > 0 && vp.gasto === 0
            ? "VIEP recebida sem notas lançadas neste mês. Lance as notas em Despesas."
            : "",
    };
    const blocoGab = {
      titulo: "Cota de gabinete",
      fonte: "Cadastro manual · atual",
      rotuloPrincipal: "Folha do gabinete",
      principal: brl(gab.total),
      corPrincipal: TXT,
      linhas: gab.pessoas
        ? [
            L("Limite estimado", brl(gab.teto)),
            L("Saldo da cota", brl(gab.saldo), {
              total: true,
              cor: gab.saldo < 0 ? NEG : TXT,
            }),
            L("Pessoas cadastradas", String(gab.pessoas)),
          ]
        : [L("Situação", "Nenhuma pessoa cadastrada")],
      temBarra: gab.pessoas > 0,
      barra: pctG.toFixed(1),
      corBarra: gab.saldo < 0 ? NEG : "#1B5BD0",
      legendaBarra: `${pctG.toFixed(0)}% da cota estimada`,
      temAviso: false,
      corAviso: CINZA,
      aviso: "",
    };
    const blocos = [blocoSal, blocoViep, blocoGab];
    const cats = (mesAtual && mesAtual.porCategoria) || [];
    const catSoma = cats.reduce((a, c) => a + c.valor, 0);
    const porCat = cats.map((c) => ({
      n: c.categoria,
      q: lancMes.filter(
        (l) => l.categoria === c.categoria && l.status !== "glosado",
      ).length,
      v: brl(c.valor),
      p: catSoma ? `${((c.valor / catSoma) * 100).toFixed(0)}%` : "—",
    }));
    const hist = finMeses.slice(0, 8).map((m) => {
      const sv = m.viep.reembolsado - m.viep.gasto;
      return {
        rotulo: m.rotulo,
        bruto: brl(m.salario ? m.salario.bruto : 0),
        recebido: brl(m.viep.reembolsado),
        notas: brl(m.viep.gasto),
        saldo: sv < 0 ? `− ${brl(-sv)}` : brl(sv),
        corSaldo: sv < 0 ? "#9A5800" : TXT,
        bg: m.mes === finMes ? "#F2F6FD" : "transparent",
        peso: m.mes === finMes ? 700 : 400,
        abrir: () => this.setState({ finMes: m.mes }),
      };
    });
    const FF = s.finFil;
    const despAll = lanc.filter(
      (l) =>
        (FF.todos === "todos" || l.competencia === finMes) &&
        (!FF.origem || l.origem === FF.origem),
    );
    const despTotal = despAll.reduce(
      (a, l) => a + (l.status === "glosado" ? 0 : l.valor),
      0,
    );
    const FIN_PAGE = 10;
    const paginar = (lista, pageKey) => {
      const total = lista.length;
      const pages = Math.max(1, Math.ceil(total / FIN_PAGE) || 1);
      const page = Math.min(Math.max(0, s[pageKey] || 0), pages - 1);
      return {
        lista: lista.slice(page * FIN_PAGE, (page + 1) * FIN_PAGE),
        page,
        pages,
        total,
        tem: total > FIN_PAGE,
        rotulo: total
          ? page * FIN_PAGE +
            1 +
            "–" +
            Math.min(total, (page + 1) * FIN_PAGE) +
            " de " +
            total
          : "0 itens",
        ant: () => this.setState({ [pageKey]: Math.max(0, page - 1) }),
        prox: () => this.setState({ [pageKey]: Math.min(pages - 1, page + 1) }),
      };
    };
    const despPg = paginar(despAll, "finPageDesp");
    const despList = despPg.lista;
    const salarioRows = finMeses
      .filter((m) => m.salario && (m.salario.bruto > 0 || m.salario.liquido > 0 || m.salario.recebeu))
      .map((m) => ({
        mes: m.mes,
        rotulo: m.rotulo,
        bruto: brl(m.salario ? m.salario.bruto : 0),
        desconto: brl(m.salario ? m.salario.desconto : 0),
        liquido: brl(m.salario ? m.salario.liquido : 0),
      }));
    const verbasLanc = ((FIN && FIN.verbas) || []).map((v) => ({
      id: v.id,
      mes: v.mes,
      rotulo: v.rotulo || rot(v.mes),
      tipo: v.tipo || "VIEP",
      tipoTxt: v.tipoTxt || v.tipo || "VIEP",
      descricao: v.descricao || "—",
      dataBr: v.data ? dataBr(v.data) : "—",
      valorBr: brl(v.valor),
      observacao: v.observacao || "",
      editar: () =>
        this.setState({
          verbaForm: {
            id: v.id,
            mes: v.mes,
            tipo: v.tipo || "VIEP",
            descricao: v.descricao || "",
            valor: String(v.valor || "").replace(".", ","),
            data: v.data || "",
            observacao: v.observacao || "",
          },
        }),
      excluir: () => {
        if (window.confirm("Excluir esta verba da Câmara?"))
          post({ type: "mandato-fin-verba-excluir", id: v.id });
      },
    }));
    const verbasPg = paginar(verbasLanc, "finPageVerbas");
    const verbasRows = verbasPg.lista;
    const vF = s.verbaForm || {};
    const setVF = (k) => (e) => {
      const val = e.target.value;
      this.setState((st) => ({ verbaForm: { ...st.verbaForm, [k]: val } }));
    };
    const eqTodos = (FIN && FIN.equipeGabinete) || [];
    const eqAll = eqTodos.map((e) => ({
      ...e,
      ini: String(e.nome || "")
        .split(" ")
        .filter((w) => w.length > 2)
        .slice(0, 2)
        .map((w) => w[0])
        .join(""),
      cargoTxt: e.cargo || "cargo não informado",
      admissaoBr: e.admissao ? dataBr(e.admissao) : "—",
      salarioBr: brl(e.salario),
      fundoTxt: e.fundoNome || "sem fundo definido",
      editar: () =>
        this.setState({
          eqForm: {
            id: e.id,
            nome: e.nome,
            cargo: e.cargo || "",
            admissao: e.admissao || "",
            salario: String(e.salario || "").replace(".", ","),
            fundoId: e.fundo_id || "",
          },
        }),
      excluir: () => {
        if (window.confirm(`Remover ${e.nome} do gabinete?`))
          post({ type: "mandato-fin-equipe-excluir", id: e.id });
      },
    }));
    const fF = s.finForm || {};
    const setFF = (k) => (e) => {
      const val = e.target.value;
      this.setState((st) => {
        const f = { ...st.finForm, [k]: val };
        if (
          k === "data" &&
          val &&
          (!st.finForm.competencia ||
            st.finForm.competencia ===
              String(st.finForm.data || "").slice(0, 7))
        )
          f.competencia = val.slice(0, 7);
        if (k === "origem") f.status = val === "VIEP" ? "pendente" : "pago";
        return { finForm: f };
      });
    };
    const setEF = (k) => (e) => {
      const val = e.target.value;
      this.setState((st) => ({ eqForm: { ...st.eqForm, [k]: val } }));
    };
    const setFDF = (k) => (e) => {
      const val = e.target.value;
      this.setState((st) => ({ fundoForm: { ...st.fundoForm, [k]: val } }));
    };
    const setFLF = (k) => (e) => {
      const val = e.target.value;
      this.setState((st) => ({ fundoLancForm: { ...st.fundoLancForm, [k]: val } }));
    };
    const hojeISO = new Date().toISOString().slice(0, 10);
    const fundosTodos = (FIN && FIN.fundos) || [];
    const fundoOpts = fundosTodos
      .filter((f) => f.ativo !== false)
      .map((f) => ({ v: f.id, l: f.nome }));
    const fundosAll = fundosTodos.map((f) => ({
      id: f.id,
      nome: f.nome,
      descricao: f.descricao || "",
      totalBr: brl(f.total),
      noLanc: !f.lancamentos.length,
      lancamentos: f.lancamentos.map((l) => ({
        dataBr: dataBr(l.data),
        valorBr: brl(l.valor),
        origem: l.origem || "—",
        observacao: l.observacao || "—",
        excluir: () => {
          if (window.confirm("Excluir este lançamento do fundo?"))
            post({ type: "mandato-fin-fundo-lancamento-excluir", id: l.id });
        },
      })),
      editar: () =>
        this.setState({
          fundoForm: { id: f.id, nome: f.nome, descricao: f.descricao || "" },
        }),
      excluir: () => {
        if (window.confirm(`Remover o fundo "${f.nome}"?`))
          post({ type: "mandato-fin-fundo-excluir", id: f.id });
      },
      novoLancamento: () =>
        this.setState({
          fundoLancForm: {
            fundoId: f.id,
            fundoNome: f.nome,
            data: hojeISO,
            valor: "",
            origem: "",
            observacao: "",
          },
        }),
    }));
    const noFundos = fundosAll.length === 0;
    const CONF_CAB = {
      fundos: ["Fundos", "De onde sai o dinheiro que paga a equipe do gabinete"],
    };
    const FIN_CAB = {
      painel: [
        "Financeiro",
        `Demonstrativo de ${rot(finMes)}: subsídio, verba indenizatória e gabinete, cada um no seu lugar`,
      ],
      desp: [
        "Despesas",
        "Notas e recibos do mandato — padrão VIEP; pode usar recurso próprio ou outra fonte",
      ],
      verbas: [
        "Verbas da Câmara",
        "Salário do vereador vem automático da folha; lance VIEP e outras verbas à mão",
      ],
      equipe: [
        "Equipe do gabinete",
        "Cadastro manual de quem recebe pela cota de gabinete",
      ],
    };
    const FIN_TABS = [
      ["painel", "Painel", "layout-dashboard"],
      ["desp", "Despesas", "receipt"],
      ["verbas", "Verbas da Câmara", "building-bank"],
      ["equipe", "Equipe do gabinete", "users-group"],
    ];

    const toBottom = mobile ? "84px" : "24px";
    return {
      isDesktop: !mobile,
      showDate: s.w >= 1180,
      isMobile: mobile,
      pad: mobile ? "14px" : "28px 32px",
      padBottom: mobile ? "96px" : "40px",
      navItems,
      bottomNav,
      drawerOpen: mobile && s.drawer,
      openDrawer: () => this.setState({ drawer: true }),
      closeDrawer: () => this.setState({ drawer: false }),
      pageTitle: (NAV.find((n) => n[0] === s.page) || [])[1],
      isPainel: s.page === "painel",
      isDemandas: s.page === "demandas",
      isCidadaos: s.page === "cidadaos",
      isProp: s.page === "prop",
      isAgenda: s.page === "agenda",
      isBairros: s.page === "bairros",
      isLid: s.page === "lid",
      isCom: s.page === "com",
      isRel: s.page === "rel",
      isConf: s.page === "conf",
      isConfFundos: true,
      confTitulo: CONF_CAB.fundos[0],
      confSub: CONF_CAB.fundos[1],
      q: s.q,
      onSearch: (e) => {
        const v = e.target.value;
        this.setState({
          q: v,
          page:
            v && !["demandas", "cidadaos", "lid"].includes(s.page)
              ? "demandas"
              : s.page,
          filter: "Todas",
        });
      },
      notifOpen: s.notif,
      toggleNotif: () => this.setState({ notif: !s.notif }),
      notifs: [],
      openCount,
      agendaHoje,
      pautaCount,
      goDemandas: () => this.go("demandas"),
      goAgenda: () => this.go("agenda"),
      goProp: () => this.go("prop"),
      goAgendaLink: this.link("agenda"),
      goBairrosLink: this.link("bairros"),
      goDemandasLink: this.link("demandas"),
      goPropLink: this.link("prop"),
      agendaToday: ((agendaWeek[0] && agendaWeek[0].ev) || []).map((e) => ({
        h: e.h,
        t: e.t,
        l: e.l,
        excluir: e.excluir,
      })),
      kpis: [
        {
          icon: "message-2",
          label: "Demandas recebidas",
          value: (window.__MANDATO__ && window.__MANDATO__.demandasN) || "0",
          trend: "",
          note: "lançadas no mandato",
          tc: "#157A3E",
          pts: spark([150, 158, 155, 170, 168, 182, 190]),
        },
        {
          icon: "circle-check",
          label: "Demandas resolvidas",
          value: "0",
          trend: "",
          note: "lançadas no mandato",
          tc: "#157A3E",
          pts: spark([120, 125, 131, 130, 140, 146, 152]),
        },
        {
          icon: "file-text",
          label: "Proposições apresentadas",
          value: (window.__MANDATO__ && window.__MANDATO__.propsTotal) || "0",
          trend: "",
          note: "no mandato",
          tc: "#157A3E",
          pts: spark([18, 20, 17, 22, 21, 24, 26]),
        },
        {
          icon: "users",
          label: "Cidadãos cadastrados",
          value: (window.__MANDATO__ && window.__MANDATO__.cidadaos) || "0",
          trend: "",
          note: "fichas de eleitores",
          tc: "#157A3E",
          pts: spark([16.9, 17.2, 17.5, 17.7, 18, 18.2, 18.45]),
        },
        {
          icon: "map-pin",
          label: "Bairros alcançados",
          value: (window.__MANDATO__ && window.__MANDATO__.bairrosN) || "0",
          trend: "",
          note: "bairros das fichas",
          tc: "#157A3E",
          pts: spark([86, 86, 87, 88, 89, 91, 92]),
        },
        {
          icon: "hourglass",
          label: "Tempo médio de resposta",
          value: "—",
          trend: "",
          note: "sem prazo inventado",
          tc: "#B42318",
          pts: spark([5.4, 5.5, 5.3, 5.7, 5.9, 6.0, 6.2]),
        },
      ],
      pubIndicators: [
        {
          v: "746.828",
          l: "Eleitores aptos",
          s: "TSE · Eleições 2024",
          c: "#1B5BD0",
          bg: "#EEF4FE",
          bd: "#D3E1FB",
        },
        {
          v: "80,7%",
          l: "Comparecimento",
          s: "TSE · 1º turno 2024",
          c: "#157A3E",
          bg: "#EDF8F1",
          bd: "#CDEBD8",
        },
        {
          v: "19,3%",
          l: "Abstenção",
          s: "TSE · 1º turno 2024",
          c: "#9A5800",
          bg: "#FFF6E8",
          bd: "#F6DFB8",
        },
        {
          v: "1.037.775",
          l: "População",
          s: "IBGE · Censo 2022",
          c: "#6741C9",
          bg: "#F4F0FD",
          bd: "#DFD5F7",
        },
        {
          v: "0,768",
          l: "IDH Municipal",
          s: "PNUD · IDHM 2010",
          c: "#8A6A00",
          bg: "#FFF9E6",
          bd: "#F2E3B0",
        },
        {
          v: "31",
          l: "Vereadores",
          s: "Câmara Municipal · 2025–2028",
          c: "#B42318",
          bg: "#FEF0EF",
          bd: "#F6D2CF",
        },
      ],
      ranges,
      bars,
      topBairros: (window.__MANDATO__ &&
      Array.isArray(window.__MANDATO__.bairros)
        ? window.__MANDATO__.bairros
        : []
      )
        .slice(0, 7)
        .map((b) => ({
          n: b.n,
          v: b.v,
          pct: (
            (b.v /
              ((window.__MANDATO__ && window.__MANDATO__.maxBairro) || 142)) *
            100
          ).toFixed(0),
        })),
      areas: [
        { n: "Infraestrutura", p: 0, c: "#1B5BD0" },
        { n: "Saúde", p: 0, c: "#17994B" },
        { n: "Iluminação", p: 0, c: "#E2A111" },
        { n: "Educação", p: 0, c: "#7651D6" },
        { n: "Outros", p: 0, c: "#C6CFDC" },
      ],
      urgentes,
      propTramitando,
      statusTabs,
      demList,
      noDem: demList.length === 0,
      fil: F,
      fDBairro: this.setFil("dBairro"),
      fDArea: this.setFil("dArea"),
      fDResp: this.setFil("dResp"),
      fDSort: this.setFil("dSort"),
      clearDem: this.clearFil(["dBairro", "dArea", "dResp", "dSort"]),
      fCBairro: this.setFil("cBairro"),
      fCOrigem: this.setFil("cOrigem"),
      fCSit: this.setFil("cSit"),
      clearCid: this.clearFil(["cBairro", "cOrigem", "cSit"]),
      fLReg: this.setFil("lReg"),
      fLSit: this.setFil("lSit"),
      fLSort: this.setFil("lSort"),
      clearLid: this.clearFil(["lReg", "lSit", "lSort"]),
      optBairros: opt("Todos os bairros", uniq(BAIRROS.map((b) => b.n))),
      optAreas: opt("Todas as áreas", uniq(s.dem.map((d) => d.area))),
      optResp: opt("Todos os assessores", uniq(s.dem.map((d) => d.resp))),
      optSort: [
        { v: "recentes", l: "Mais recentes" },
        { v: "antigas", l: "Mais antigas" },
        { v: "prazo", l: "Prazo mais próximo" },
      ],
      optOrigem: opt("Todas as origens", [
        "Gabinete",
        "Gabinete itinerante",
        "WhatsApp",
        "Instagram",
        "Liderança",
      ]),
      optCSit: [
        { v: "", l: "Qualquer situação" },
        { v: "abertas", l: "Com demanda aberta" },
        { v: "sem", l: "Sem demanda aberta" },
      ],
      optReg: opt("Todas as regiões", [
        "Centro",
        "Zona Norte",
        "Zona Sul",
        "Zona Leste",
      ]),
      optLSit: opt("Qualquer situação", ["Em dia", "Visita atrasada"]),
      optLSort: [
        { v: "cid", l: "Mais fichas" },
        { v: "dem", l: "Mais demandas" },
        { v: "nome", l: "Nome (A–Z)" },
      ],
      demCount:
        demList.length + (demList.length === 1 ? " resultado" : " resultados"),
      cidList,
      noCid: cidList.length === 0,
      cidCount:
        cidList.length + (cidList.length === 1 ? " cidadão" : " cidadãos"),
      liderancas: lidArr,
      noLid: lidArr.length === 0,
      lidCount:
        lidArr.length + (lidArr.length === 1 ? " liderança" : " lideranças"),
      exportCid: () => this.flash("Planilha de cidadãos gerada"),
      exportCsv: () => this.flash("Planilha de demandas gerada"),
      openNew: () => this.setState({ newOpen: true }),
      closeNew: () => {
        const b = document.getElementById("demanda-sug");
        if (b) {
          b.style.display = "none";
          b.innerHTML = "";
        }
        this.setState({ newOpen: false, demSugOpen: false });
      },
      newOpen: s.newOpen,
      form: s.form,
      ...Object.fromEntries(
        Object.keys(EMPTY_FORM).map((k) => ["f_" + k, this.setF(k)]),
      ),
      demSug: (s.newOpen && s.demSugOpen
        ? (window.__MANDATO__ && window.__MANDATO__.busca) || []
        : []
      ).map((p) => ({
        n: p.n,
        sub: p.sub || p.tipoLabel || "",
        escolhe: () => this.aplicarDemandaPessoa(p),
      })),
      nextOrd: s.dem.length + 1 + "ª",
      optGenero: ["Não informado", "Feminino", "Masculino", "Outro"],
      optPrio: ["Normal", "Alta", "Urgente"],
      optOrigemF: [
        "Gabinete",
        "Gabinete itinerante",
        "WhatsApp",
        "Instagram",
        "Liderança",
        "Telefone",
      ],
      optRespF: [],
      optOrgao: [
        "A definir",
        "SEMOSP",
        "SEMOSP · Iluminação Pública",
        "SEMUS",
        "SEMED",
        "SEMCAS",
        "SMTT",
        "SEMDEL",
        "CAEMA",
      ],
      bairroNames: BAIRROS.map((b) => b.n),
      areaNames: [
        "Infraestrutura",
        "Saúde",
        "Iluminação",
        "Educação",
        "Saneamento",
        "Mobilidade",
        "Assistência social",
        "Esporte e lazer",
      ],
      submitNew: (e) => {
        e.preventDefault();
        const f = s.form;
        const n = 1285 + s.dem.length - 12;
        const d = {
          ord: s.dem.length + 1 + "º",
          id: `2026-${n}`,
          cid: f.cid,
          tel: f.whats || "—",
          endereco:
            [f.rua, f.num, f.comp].filter(Boolean).join(", ") +
            ` · ${f.bairro}` +
            (f.cep ? ` · CEP ${f.cep}` : ""),
          bairro: f.bairro,
          area: f.area,
          desc: f.desc,
          orgao: f.orgao,
          status: "Nova",
          resp: f.resp,
          data: "01/11",
          prazo:
            f.prio === "Urgente"
              ? "04/11"
              : f.prio === "Alta"
                ? "08/11"
                : "15/11",
        };
        this.setState({
          dem: [d, ...s.dem],
          newOpen: false,
          filter: "Todas",
          page: "demandas",
          form: { ...EMPTY_FORM },
        });
        this.flash(`${d.ord.replace("º", "ª")} demanda registrada`);
      },
      hasSel: !!selD,
      sel,
      closeSel: () => this.setState({ sel: null }),
      resolveSel: () => {
        this.setState({
          dem: s.dem.map((d) =>
            d.id === s.sel ? { ...d, status: "Resolvida" } : d,
          ),
        });
        this.flash("Demanda marcada como resolvida");
      },
      retornoSel: () => this.flash("Mensagem de retorno enviada ao cidadão"),
      toastCad: () => this.abrirBusca("cidadao"),
      pickOpen: !!s.pick,
      pickTitulo:
        s.pick === "agenda" ? "Novo compromisso" : "Cadastrar cidadão da ficha",
      pickQ: s.pickQ || "",
      pickAviso:
        (s.pickQ || "").trim().length < 2 &&
        (s.pickQ || "").replace(/\D/g, "").length < 4
          ? "Digite o nome (2+ letras) ou CPF."
          : "",
      pickLista: ((window.__MANDATO__ && window.__MANDATO__.busca) || []).map(
        (p) => ({ n: p.n, sub: p.sub, escolhe: () => this.confirmaPick(p) }),
      ),
      onPick: (e) => this.onPick(e),
      fechaPick: () => this.fechaPick(),
      propStats: (window.__MANDATO__ && window.__MANDATO__.propStats) || [
        { v: "0", l: "Projetos de Lei" },
        { v: "84", l: "Indicações" },
        { v: "24", l: "Requerimentos" },
        { v: "6", l: "Leis sancionadas" },
      ],
      propTabs,
      propList,
      toastProp: () => this.flash("Rascunho de proposição criado"),
      agendaWeek,
      toastAg: () => this.abrirBusca("agenda"),
      bairros:
        window.__MANDATO__ && Array.isArray(window.__MANDATO__.bairros)
          ? window.__MANDATO__.bairros
          : [],
      cidResumo:
        (window.__MANDATO__ && window.__MANDATO__.cidResumo) ||
        "0 cadastros · 0 bairros",
      toastLid: () =>
        this.flash(
          "As lideranças vêm do Nerites. O cadastro novo é feito lá, na equipe.",
        ),
      canais: [
        {
          icon: "brand-whatsapp",
          v: "0",
          l: "contatos na lista de transmissão",
          bg: "#E5F5EB",
          c: "#157A3E",
        },
        {
          icon: "brand-instagram",
          v: "0",
          l: "seguidores no Instagram",
          bg: "#FDEEF4",
          c: "#B4235F",
        },
        {
          icon: "news",
          v: "0",
          l: "boletins enviados no mandato",
          bg: "#EAF1FE",
          c: "#1B5BD0",
        },
      ],
      posts: [].map((p) => {
        const c = ST[p[3]];
        return { icon: p[0], t: p[1], q: p[2], s: p[3], sbg: c[0], sc: c[1] };
      }),
      imprensa: [],
      relatorios: [
        [
          "chart-bar",
          "Demandas · Outubro/2026",
          "Recebidas, resolvidas e pendentes por bairro e área",
        ],
        [
          "file-text",
          "Prestação de contas do mandato",
          "Consolidado do 2º semestre de 2026",
        ],
        [
          "map-2",
          "Atendimentos por bairro",
          "Distribuição territorial dos cidadãos atendidos",
        ],
        [
          "gavel",
          "Produção legislativa",
          "Projetos, indicações e requerimentos com tramitação",
        ],
        [
          "users",
          "Equipe e produtividade",
          "Demandas por assessor e tempo de resposta",
        ],
        [
          "calendar",
          "Agenda do vereador",
          "Compromissos realizados no período",
        ],
      ].map((r) => ({
        icon: r[0],
        t: r[1],
        d: r[2],
        pdf: () => this.flash(`PDF gerado: ${r[1]}`),
        xls: () => this.flash(`Planilha gerada: ${r[1]}`),
      })),
      hasToast: !!s.toast,
      toast: s.toast,
      toastBottom: toBottom,
      isFin: s.page === "fin",
      finTemErro: !!finErro,
      finErro,
      finIsPainel: s.finTab === "painel",
      finIsDesp: s.finTab === "desp",
      finIsVerbas: s.finTab === "verbas",
      finIsEquipe: s.finTab === "equipe",
      finTitulo: FIN_CAB[s.finTab][0],
      finSub: FIN_CAB[s.finTab][1],
      finMostraMes: s.finTab === "painel" || s.finTab === "desp",
      finMostraLancar:
        podeEditar && (s.finTab === "painel" || s.finTab === "desp"),
      finPodeEditar: podeEditar,
      finMesSel: finMes,
      finMesRotulo: rot(finMes),
      finMesOpts: finMeses.length
        ? finMeses.map((m) => ({ v: m.mes, l: m.rotulo }))
        : [{ v: "", l: "Sem dados ainda" }],
      finOnMes: (e) =>
        this.setState({ finMes: e.target.value, finPageDesp: 0 }),
      blocos,
      porCat,
      noCat: porCat.length === 0,
      temCat: porCat.length > 0,
      catTotal: brl(catSoma),
      hist,
      ultimas: lancMes.slice(0, 6),
      noUltimas: lancMes.length === 0,
      finVerDespesas: () => this.setState({ finTab: "desp" }),
      finFilOrigem: FF.origem,
      finFilTodos: FF.todos,
      finOnFilOrigem: (e) => {
        const x = e.target.value;
        this.setState((st) => ({
          finFil: { ...st.finFil, origem: x },
          finPageDesp: 0,
        }));
      },
      finOnFilTodos: (e) => {
        const x = e.target.value;
        this.setState((st) => ({
          finFil: { ...st.finFil, todos: x },
          finPageDesp: 0,
        }));
      },
      finOrigemFiltro: [
        { v: "", l: "Todas as origens" },
        { v: "VIEP", l: "VIEP" },
        { v: "PROPRIO", l: "Recurso próprio" },
        { v: "OUTRO", l: "Outra fonte" },
      ],
      despList,
      noDesp: despAll.length === 0,
      despResumo: `${despAll.length} lançamento(s) · ${brl(despTotal)}`,
      despTemPag: despPg.tem,
      despRotulo: despPg.rotulo,
      despPagina: despPg.page + 1,
      despPaginas: despPg.pages,
      despAnt: despPg.ant,
      despProx: despPg.prox,
      salarioRows,
      noSalario: salarioRows.length === 0,
      verbasRows,
      noVerbas: verbasLanc.length === 0,
      verbasTemPag: verbasPg.tem,
      verbasRotulo: verbasPg.rotulo,
      verbasPagina: verbasPg.page + 1,
      verbasPaginas: verbasPg.pages,
      verbasAnt: verbasPg.ant,
      verbasProx: verbasPg.prox,
      verbasResumo: `${verbasLanc.length} verba(s) lançada(s)`,
      verbaNova: () =>
        this.setState({
          verbaForm: {
            id: "",
            mes: finMes || hojeISO.slice(0, 7),
            tipo: "VIEP",
            descricao: "VIEP recebida",
            valor: "",
            data: hojeISO,
            observacao: "",
          },
        }),
      verbaFormOpen: !!s.verbaForm,
      verbaFormTitulo: vF.id ? "Editar verba" : "Nova verba da Câmara",
      verbaForm: vF,
      verbaFechar: () => this.setState({ verbaForm: null }),
      vf_mes: setVF("mes"),
      vf_tipo: setVF("tipo"),
      vf_descricao: setVF("descricao"),
      vf_valor: setVF("valor"),
      vf_data: setVF("data"),
      vf_observacao: setVF("observacao"),
      verbaTipoOpts: [
        { v: "VIEP", l: "VIEP — reembolso da Câmara" },
        { v: "DIARIA", l: "Diária" },
        { v: "OUTRA", l: "Outra verba" },
      ],
      verbaSalvar: (e) => {
        e.preventDefault();
        const f = this.state.verbaForm || {};
        const valor = Number(String(f.valor).replace(/\./g, "").replace(",", "."));
        if (!(valor > 0)) {
          this.flash("Informe um valor válido");
          return;
        }
        if (!f.mes) {
          this.flash("Informe o mês da verba");
          return;
        }
        post({
          type: "mandato-fin-verba-salvar",
          verba: {
            id: f.id || undefined,
            mes: f.mes,
            tipo: f.tipo || "VIEP",
            descricao: f.descricao || "",
            valor,
            data: f.data || undefined,
            observacao: f.observacao || "",
          },
        });
        this.setState({ verbaForm: null });
      },
      finAtualizado:
        FIN && FIN.ultimaFolha
          ? `Última folha publicada: ${rot(FIN.ultimaFolha)}.`
          : "",
      eqAll,
      noEq: eqAll.length === 0,
      eqResumo: `${eqAll.length} pessoa(s) · ${brl((FIN && FIN.gabinete && FIN.gabinete.total) || 0)} de ${brl((FIN && FIN.gabinete && FIN.gabinete.teto) || 0)}`,
      eqNova: () =>
        this.setState({ eqForm: { nome: "", cargo: "", admissao: "", salario: "", fundoId: "" } }),
      finNovo: () =>
        this.setState({
          finForm: {
            id: "",
            origem: "VIEP",
            categoria: "Combustível",
            descricao: "",
            valor: "",
            data: hojeISO,
            competencia: finMes || hojeISO.slice(0, 7),
            fornecedor: "",
            documento: "",
            status: "pendente",
            observacao: "",
          },
        }),
      finFormOpen: !!s.finForm,
      finFormTitulo: fF.id ? "Editar despesa" : "Lançar despesa",
      finForm: fF,
      finFechar: () => this.setState({ finForm: null }),
      ff_origem: setFF("origem"),
      ff_categoria: setFF("categoria"),
      ff_descricao: setFF("descricao"),
      ff_valor: setFF("valor"),
      ff_data: setFF("data"),
      ff_competencia: setFF("competencia"),
      ff_fornecedor: setFF("fornecedor"),
      ff_documento: setFF("documento"),
      ff_status: setFF("status"),
      ff_observacao: setFF("observacao"),
      finOrigemOpts: [
        { v: "VIEP", l: "VIEP — reembolso da Câmara" },
        { v: "PROPRIO", l: "Recurso próprio (salário)" },
        { v: "OUTRO", l: "Outra fonte" },
      ],
      finCatOpts: (FIN && FIN.categorias) || ["Combustível", "Outros"],
      finStatusOpts: statusOpts,
      finOrigemAjuda:
        fF.origem === "VIEP"
          ? `VIEP: gasto do mandato que a Câmara devolve, até ${brl(vp.teto)} por mês, com nota fiscal.`
          : fF.origem === "PROPRIO"
            ? "Recurso próprio: pago com o salário do vereador; não é reembolsado."
            : "Outra fonte: doação, partido ou outro recurso fora da Câmara.",
      finSalvar: (e) => {
        e.preventDefault();
        const f = this.state.finForm;
        const valor = Number(
          String(f.valor).replace(/\./g, "").replace(",", "."),
        );
        if (!(valor > 0)) {
          this.flash("Informe um valor válido");
          return;
        }
        post({
          type: "mandato-fin-salvar",
          lancamento: { ...f, id: f.id || undefined, valor },
        });
        this.setState({ finForm: null });
      },
      eqFormOpen: !!s.eqForm,
      eqFormTitulo: s.eqForm && s.eqForm.id ? "Editar pessoa" : "Nova pessoa no gabinete",
      eqForm: s.eqForm || {},
      eqFundoOpts: fundoOpts,
      eqFechar: () => this.setState({ eqForm: null }),
      ef_nome: setEF("nome"),
      ef_cargo: setEF("cargo"),
      ef_admissao: setEF("admissao"),
      ef_salario: setEF("salario"),
      ef_fundo: setEF("fundoId"),
      eqSalvar: (e) => {
        e.preventDefault();
        const f = this.state.eqForm;
        if (!String(f.nome || "").trim()) {
          this.flash("Informe o nome.");
          return;
        }
        if (!f.fundoId) {
          this.flash("Informe de onde sai o dinheiro.");
          return;
        }
        post({
          type: "mandato-fin-equipe-salvar",
          pessoa: {
            id: f.id,
            nome: f.nome,
            cargo: f.cargo,
            admissao: f.admissao,
            salario: Number(String(f.salario || "0").replace(/\./g, "").replace(",", ".")) || 0,
            fundo_id: f.fundoId,
          },
        });
        this.setState({ eqForm: null });
      },
      fundosAll,
      noFundos,
      fundoNovo: () => this.setState({ fundoForm: { nome: "", descricao: "" } }),
      fundoFormOpen: !!s.fundoForm,
      fundoFormTitulo: s.fundoForm && s.fundoForm.id ? "Editar fundo" : "Novo fundo",
      fundoForm: s.fundoForm || {},
      fundoFechar: () => this.setState({ fundoForm: null }),
      fdf_nome: setFDF("nome"),
      fdf_descricao: setFDF("descricao"),
      fundoSalvar: (e) => {
        e.preventDefault();
        const f = this.state.fundoForm;
        if (!String(f.nome || "").trim()) {
          this.flash("Informe o nome do fundo.");
          return;
        }
        post({
          type: "mandato-fin-fundo-salvar",
          fundo: { id: f.id, nome: f.nome, descricao: f.descricao },
        });
        this.setState({ fundoForm: null });
      },
      fundoLancFormOpen: !!s.fundoLancForm,
      fundoLancForm: s.fundoLancForm || {},
      fundoLancFechar: () => this.setState({ fundoLancForm: null }),
      flf_data: setFLF("data"),
      flf_valor: setFLF("valor"),
      flf_origem: setFLF("origem"),
      flf_observacao: setFLF("observacao"),
      fundoLancSalvar: (e) => {
        e.preventDefault();
        const f = this.state.fundoLancForm;
        const valor = Number(
          String(f.valor || "0").replace(/\./g, "").replace(",", "."),
        );
        if (!(valor > 0)) {
          this.flash("Informe um valor válido.");
          return;
        }
        post({
          type: "mandato-fin-fundo-lancamento-salvar",
          fundoLancamento: {
            fundo_id: f.fundoId,
            data: f.data || hojeISO,
            valor,
            origem: f.origem,
            observacao: f.observacao,
          },
        });
        this.setState({ fundoLancForm: null });
      },
    };
  }
}
