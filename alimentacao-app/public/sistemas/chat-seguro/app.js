'use strict';
/* =====================================================================
   SecureChat — cliente
   Proteções implementadas aqui são DISSUASÓRIAS (CSS/JS no navegador).
   Elas impedem seleção, cópia, menu de contexto, atalhos de print e
   escondem o conteúdo quando a aba perde o foco. Não impedem captura
   nativa (Win+Shift+S, outro aparelho fotografando) — para isso o que
   vale de verdade é a auto-destruição no servidor (view-once / TTL).
   ===================================================================== */

// ---------------------------------------------------------------- proteções + monitor de segurança
// Tudo aqui é DISSUASÓRIO e de DETECÇÃO: o navegador não impede captura nativa
// (Win+Shift+S, Cmd+Shift+4, botões do celular). O que protege de verdade é a
// criptografia + autodestruição; isto aqui eleva a fricção e avisa a conversa.
const scAlert = (type, severity, extra) => { if (window.onSecurityEvent) window.onSecurityEvent(type, severity, extra); };
(function protect() {
  const editable = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);

  document.addEventListener('contextmenu', (e) => {
    if (!editable(e.target)) { e.preventDefault(); scAlert('context_menu', 'low'); }
  });
  document.addEventListener('dragstart', (e) => { if (!editable(e.target)) e.preventDefault(); });
  document.addEventListener('copy', (e) => {
    if (!editable(e.target)) { e.preventDefault(); scAlert('copy_attempt', 'medium'); }
  });
  document.addEventListener('cut', (e) => {
    if (!editable(e.target)) { e.preventDefault(); scAlert('cut_attempt', 'medium'); }
  });
  document.addEventListener('paste', (e) => {
    // colagem no campo de digitação é permitida; só registra (não bloqueia)
    if (editable(e.target)) scAlert('paste_detected', 'low', { meta: { where: 'composer', blocked: false } });
  });
  document.addEventListener('selectstart', (e) => {
    if (!editable(e.target)) { e.preventDefault(); scAlert('selection_attempt', 'low'); }
  });

  document.addEventListener('keydown', (e) => {
    const k = (e.key || '').toLowerCase();
    const mod = e.ctrlKey || e.metaKey;
    if (k === 'f12' || (mod && e.shiftKey && ['i', 'j', 'c'].includes(k)) || (mod && k === 'u')) {
      e.preventDefault(); scAlert('devtools_open', 'high'); return;
    }
    if (mod && k === 'p') { e.preventDefault(); scAlert('print_attempt', 'high'); return; }
    // atalho de captura recebido pela página (macOS); NÃO prova que a captura ocorreu
    if (e.metaKey && e.shiftKey && ['3', '4', '5'].includes(k)) scAlert('capture_shortcut', 'high');
    if (mod && ['c', 'x', 's', 'a'].includes(k) && !editable(e.target)) {
      e.preventDefault();
      if (k === 'c') scAlert('copy_attempt', 'medium');
      if (k === 'x') scAlert('cut_attempt', 'medium');
    }
  });
  document.addEventListener('keyup', (e) => {
    if (e.key === 'PrintScreen') {
      if (navigator.clipboard) navigator.clipboard.writeText('').catch(() => {});
      // evento recebido pela página — não afirma "o usuário tirou print"
      scAlert('screenshot_attempt', 'high');
    }
  });
  window.addEventListener('beforeprint', () => { document.body.classList.add('blurred'); scAlert('print_attempt', 'high'); });

  // esconde o conteúdo quando o app perde o foco; ao voltar, exige toque
  const lock = document.getElementById('lockscreen');
  const lockBtn = document.getElementById('lock-btn');
  let armado = false;
  function armar(reason) {
    if (!armado) scAlert('visibility_hidden', 'low', { meta: { reason: reason || 'hidden' } });
    armado = true; document.body.classList.add('blurred');
  }
  function desarmar() { armado = false; document.body.classList.remove('blurred'); lock.hidden = true; }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) armar('visibilitychange');
    else if (armado) lock.hidden = false;
  });
  window.addEventListener('blur', () => armar('blur'));
  window.addEventListener('focus', () => { if (armado) lock.hidden = false; });
  lockBtn.addEventListener('click', desarmar);

  // ferramentas de desenvolvedor acopladas (heurística, só no computador).
  // Zoom alto também dispara: por isso o aviso diz como voltar ao normal.
  const desktop = window.matchMedia('(pointer: fine)').matches && !/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  if (desktop) {
    let hits = 0, open = false;
    setInterval(() => {
      const gapW = window.outerWidth - window.innerWidth > 200;
      const gapH = window.outerHeight - window.innerHeight > 200;
      if (window.outerWidth > 0 && (gapW || gapH)) {
        hits++;
        if (hits >= 2 && !open) { open = true; document.body.classList.add('devtools'); scAlert('devtools_open', 'high', { meta: { how: 'size' } }); }
      } else {
        hits = 0;
        if (open) { open = false; document.body.classList.remove('devtools'); }
      }
    }, 1500);
  }
})();

// ---------------------------------------------------------------- Supabase
// Embutido no sistema (/chat): a página React manda URL, chave pública e o TOKEN do login do sistema.
// Este iframe nunca cria nem renova sessão (evita disputar o refresh token com o Nerites).
const BASE = '/sistemas/chat-seguro/';
const CFG = {};
let CONFIGURED = false;
let sb = null;
const BRIDGE = { token: null, exp: 0, email: '', nome: '', userId: '', waiters: [] };
function bridgeSend(msg) { if (window.parent !== window) window.parent.postMessage(msg, location.origin); }
function jwtExp(t) { try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp || 0; } catch { return 0; } }
function setToken(t) {
  if (!t) return;
  BRIDGE.token = t; BRIDGE.exp = jwtExp(t);
  BRIDGE.waiters.splice(0).forEach((w) => w(t));
  if (sb && sb.realtime) sb.realtime.setAuth(t);
}
// token válido; se estiver para vencer, pede um novo à página (que renova o login do sistema)
function getToken() {
  if (BRIDGE.token && BRIDGE.exp * 1000 - Date.now() > 60000) return Promise.resolve(BRIDGE.token);
  return new Promise((resolve) => {
    BRIDGE.waiters.push(resolve);
    bridgeSend({ type: 'chat-token' });
    setTimeout(() => { const i = BRIDGE.waiters.indexOf(resolve); if (i >= 0) { BRIDGE.waiters.splice(i, 1); resolve(BRIDGE.token); } }, 8000);
  });
}
// confere a senha sem mexer na sessão do sistema (cria e encerra uma sessão só para checar)
async function verifyPassword(password) {
  const r = await fetch(`${CFG.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: CFG.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: BRIDGE.email, password }),
  });
  if (!r.ok) return { message: 'Invalid login credentials' };
  const d = await r.json().catch(() => ({}));
  if (d.access_token) fetch(`${CFG.SUPABASE_URL}/auth/v1/logout?scope=local`, { method: 'POST', headers: { apikey: CFG.SUPABASE_ANON_KEY, Authorization: `Bearer ${d.access_token}` } }).catch(() => {});
  return null;
}
async function signOutOthers() {
  const t = await getToken();
  await fetch(`${CFG.SUPABASE_URL}/auth/v1/logout?scope=others`, { method: 'POST', headers: { apikey: CFG.SUPABASE_ANON_KEY, Authorization: `Bearer ${t}` } });
}
const E2EE = window.E2EE;
const MAX_FILE = 25 * 1024 * 1024;
const MSG_COLS = 'id,room_id,sender_id,kind,ciphertext,iv,sender_key,keys,file_path,created_at';

// ---------------------------------------------------------------- estado
const state = {
  me: null, device: null, rooms: [], users: [], profiles: {}, online: [],
  active: null, messages: [], unread: {}, objectURLs: [], blobs: {}, previews: {},
  filter: 'all', query: '', onceMode: false, uploadMode: 'keep', viewSeconds: 10,
  channel: null, presence: null, roomChannel: null, typing: {}, installPrompt: null,
  keyChanged: {}, alerts: [], receipts: [], locked: false, isAdmin: false,
};
const ALERT_COLS = 'id,room_id,user_id,alert_type,severity,source,reliability,created_at';
const RECEIPT_COLS = 'message_id,room_id,sender_id,sent_at,status,viewer_id,opened_at,had_file';
const LOCK_MS = 5 * 60 * 1000;   // bloqueio automático após 5 min sem uso
const app = document.getElementById('app');
const $ = (s, r = document) => r.querySelector(s);
const ICONS = BASE + 'icons.svg';
const ic = (name, cls = '') => `<svg class="i ${cls}" aria-hidden="true"><use href="${ICONS}#i-${name}"/></svg>`;
const isMobile = () => window.matchMedia('(max-width: 820px)').matches;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function toast(txt) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = txt; t.style.opacity = '1';
  clearTimeout(t._h); t._h = setTimeout(() => { t.style.opacity = '0'; }, 2400);
}

// escapa HTML (todo texto de usuário passa por aqui antes de ir para innerHTML)
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function errMsg(e) {
  const m = String((e && (e.message || e.error_description || e.error)) || e || 'erro');
  if (/invalid login credentials/i.test(m)) return 'Usuário ou senha incorretos.';
  if (/already registered|already exists/i.test(m)) return 'Esse usuário já existe.';
  if (/password should be at least/i.test(m)) return 'Senha muito curta (mínimo 6 caracteres).';
  if (/email not confirmed/i.test(m)) return 'Conta não confirmada: desligue "Confirm email" no Supabase (Authentication > Providers > Email).';
  if (/email.*invalid|invalid.*email/i.test(m)) return 'E-mail interno recusado pelo Supabase: ajuste EMAIL_DOMAIN em config.js.';
  if (/rate limit/i.test(m)) return 'Muitas tentativas. Aguarde um pouco e tente de novo.';
  if (/failed to fetch|network/i.test(m)) return 'Sem conexão com o servidor.';
  return m;
}

// ---------------------------------------------------------------- utilitários de exibição
const AV_COLORS = ['#e5734b', '#d6457a', '#a660e0', '#5e7ce2', '#1fa2c9', '#25a776', '#c49a1b', '#d65c5c', '#7a8c3a', '#3e8ed0'];
const NAME_COLORS = ['#ff8f6b', '#f07ab1', '#c79bff', '#8fa8ff', '#53bdeb', '#06cf9c', '#ffd279', '#ff7d85', '#b8d26a', '#7cc6ff'];
function hashIdx(s, n) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % n; }
function initials(name) {
  const p = String(name || '?').trim().split(/\s+/);
  return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}
function otherMember(r) { return (r.members || []).find((m) => m.id !== state.me.id); }
function avatarHTML(r, size = '') {
  if (r.type === 'global') return `<div class="av ${size} global">${ic('globe')}</div>`;
  if (r.type === 'temp') return `<div class="av ${size} temp">${ic('timer')}</div>`;
  return userAvatar(otherMember(r), size, size === 'lg');
}
function userAvatar(u, size = '', dot = false) {
  if (!u) return `<div class="av ${size} anon">${ic('user')}</div>`;
  const on = dot && state.online.includes(u.id);
  return `<div class="av ${size}" style="background:${AV_COLORS[hashIdx(u.username || u.display_name, AV_COLORS.length)]}">${esc(initials(u.display_name))}${on ? '<span class="on-dot"></span>' : ''}</div>`;
}
function roomName(r) {
  if (r.type === 'global') return 'Sala Geral';
  if (r.type === 'temp') return r.name || 'Conversa temporária';
  const o = otherMember(r);
  return o ? o.display_name : 'Conversa privada';
}
const activeRoom = () => state.rooms.find((x) => x.id === state.active);
function roomTime(r) { return (r.last_message && r.last_message.created_at) || r.created_at || 0; }
const toEpoch = (v) => (typeof v === 'number' ? v : Date.parse(v) / 1000);

function sameDay(a, b) { return a.toDateString() === b.toDateString(); }
function relDay(ts, todayFn) {
  const d = new Date(ts * 1000), now = new Date();
  if (sameDay(d, now)) return todayFn(d);
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return 'Ontem';
  if ((now - d) < 6 * 864e5) return d.toLocaleDateString('pt-BR', { weekday: 'long' });
  return d.toLocaleDateString('pt-BR');
}
const fmtListTime = (ts) => (ts ? relDay(ts, (d) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })) : '');
const fmtDay = (ts) => relDay(ts, () => 'Hoje');
const fmtClock = (ts) => new Date(ts * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
function fmtSize(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1).replace('.', ',') + ' KB';
  return (n / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB';
}
function fmtTTL(exp) {
  if (!exp) return '';
  const s = Math.max(0, Math.floor(exp - Date.now() / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  return h > 0 ? `${h}h ${m}min` : (m > 0 ? `${m}min ${ss}s` : `${ss}s`);
}

// ---------------------------------------------------------------- criptografia (camada do app)
const aadOf = (room, sender, kind) => `sc1|${room}|${sender}|${kind}`;
const envOf = (row) => (row && row.ciphertext ? { c: row.ciphertext, iv: row.iv, sk: row.sender_key, keys: row.keys } : null);

// linha do banco -> formato da interface (conteúdo é decifrado depois)
function normMsg(r) {
  const p = state.profiles[r.sender_id];
  return {
    id: r.id, room_id: r.room_id, sender_id: r.sender_id, sender: p ? p.display_name : 'Alguém',
    kind: r.kind, created_at: toEpoch(r.created_at), pending: r.kind === 'once',
    env: envOf(r), file_path: r.file_path, plain: null, K: null, err: null,
  };
}
async function decryptMsg(m) {
  if (!m.env || m.plain || m.err) return m;
  try {
    const { obj, K } = await E2EE.decrypt(state.device, m.env, aadOf(m.room_id, m.sender_id, m.kind));
    m.plain = obj; m.K = K;
  } catch (e) { m.err = e.message === 'nokey' ? 'nokey' : 'bad'; }
  return m;
}
const decryptAll = (list) => Promise.all(list.map(decryptMsg));

// chaves públicas ativas (até 3 aparelhos) de cada membro da sala
async function roomRecipients(room) {
  const ids = (room.members || []).map((m) => m.id);
  const { data, error } = await sb.from('sc_key_registry').select('user_id,public_key')
    .in('user_id', ids).is('revoked_at', null);
  if (error) throw error;
  const keys = (data || []).map((k) => k.public_key);
  if (!keys.includes(state.device.pub)) keys.push(state.device.pub);
  const without = ids.filter((id) => !(data || []).some((k) => k.user_id === id));
  return { keys, without };
}
async function sealFor(room, kind, obj, fileBytes) {
  const { keys, without } = await roomRecipients(room);
  if (without.length && room.type === 'direct') toast(`${roomName(room)} ainda não abriu o app com criptografia; vai ler quando entrar.`);
  return E2EE.encrypt(state.device, keys, obj, aadOf(room.id, state.me.id, kind), fileBytes);
}

// cria/carrega a chave deste aparelho e publica a parte pública
async function initDevice(uid) {
  await E2EE.detect();
  let dev = await E2EE.loadDevice(uid).catch(() => null);
  if (!dev) { dev = await E2EE.generate(); await E2EE.saveDevice(uid, dev); }
  const { data, error } = await sb.rpc('sc_register_device', {
    p_key: dev.pub, p_fingerprint: await deviceFingerprint(dev.pub), p_label: deviceLabel(),
  });
  if (error) throw error;
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  state.device = dev;
  return data || {};
}

// prévia da última mensagem na lista (decifrada localmente)
function previewOf(r) {
  const lm = r.last_message;
  if (!lm) return null;
  if (lm.kind === 'once') return { html: `${ic('once', 'xs')} <span>Mensagem de uma visão</span>` };
  const c = state.previews[lm.id];
  if (c === undefined) { schedulePreview(lm); return { html: `${ic('lock', 'xs')} <span>…</span>` }; }
  if (c === null) return { html: `${ic('lock', 'xs')} <span>Mensagem cifrada</span>` };
  return { html: lm.kind === 'file' ? `${ic('file', 'xs')} <span>${esc(c)}</span>` : `<span>${esc(c)}</span>` };
}
const _pending = new Set(); let _prevTimer = null;
function schedulePreview(lm) {
  if (_pending.has(lm.id) || !state.device) return;
  _pending.add(lm.id);
  const env = envOf(lm);
  const job = env ? E2EE.decrypt(state.device, env, aadOf(lm.room_id, lm.sender_id, lm.kind))
    .then(({ obj }) => (obj.t === 'file' ? obj.name : String(obj.body || '').slice(0, 80)))
    .catch(() => null) : Promise.resolve(null);
  job.then((txt) => {
    state.previews[lm.id] = txt; _pending.delete(lm.id);
    clearTimeout(_prevTimer); _prevTimer = setTimeout(renderRooms, 30);
  });
}

// altura real da tela no celular (teclado aberto encolhe a área visível)
function fitViewport() {
  const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  document.documentElement.style.setProperty('--app-h', h + 'px');
}
fitViewport();
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => {
    fitViewport(); window.scrollTo(0, 0);
    const b = $('#messages'); if (b && document.activeElement === $('#input')) b.scrollTop = b.scrollHeight;
  });
}

// ---------------------------------------------------------------- watermark
function drawWatermark() {
  const wm = document.getElementById('watermark');
  if (!wm || !state.me) return;
  wm.innerHTML = '';
  const txt = `${state.me.display_name} · ${state.me.username} · ${new Date().toLocaleString('pt-BR')}`;
  for (let y = -100; y < window.innerHeight + 200; y += 190) {
    for (let x = -200; x < window.innerWidth + 200; x += 340) {
      const s = document.createElement('span');
      s.textContent = txt; s.style.left = x + 'px'; s.style.top = y + 'px';
      wm.appendChild(s);
    }
  }
}

// ---------------------------------------------------------------- telas sem login
function renderConfigWarn(msg) {
  app.innerHTML = `<div class="config-warn"><div class="auth-card">
    <h1>${msg ? 'Não foi possível iniciar' : 'Falta configurar o Supabase'}</h1>
    <p class="sub">${msg ? esc(msg) : `Preencha <code>SUPABASE_URL</code> e <code>SUPABASE_ANON_KEY</code> em <code>config.js</code>
    (Supabase &gt; Project Settings &gt; API) e publique de novo. O passo a passo está em <code>SUPABASE_SETUP.md</code>.`}</p>
    ${window.supabase ? '' : '<p class="err">A biblioteca do Supabase não carregou (sem internet?).</p>'}
  </div></div>`;
}

function renderAuth() {
  app.innerHTML = `<div class="config-warn"><div class="auth-card">
    <h1>Chat Seguro</h1>
    <p class="sub">Abra o Chat Seguro pelo sistema: entre em <b>sitema-novo</b> e escolha <b>Chat Seguro</b> no seletor.</p>
  </div></div>`;
}

// ---------------------------------------------------------------- tela de conversa
function renderChat() {
  app.innerHTML = '';
  const wrap = document.createElement('div'); wrap.id = 'chat';
  wrap.innerHTML = `
    <aside id="sidebar">
      <header class="bar">
        <div class="brand">Chat Seguro</div>
        <div id="me-av"></div>
        <div class="grow" style="padding-left:10px"><div id="who" style="font-size:15px"></div></div>
        <button class="icon-btn" id="new-chat" title="Nova conversa">${ic('chat-plus')}</button>
        <button class="icon-btn" id="new-temp" title="Nova conversa temporária">${ic('timer')}</button>
        <button class="icon-btn" id="menu-btn" title="Mais opções">${ic('more')}</button>
        <div class="dropmenu" id="menu" hidden>
          <button data-act="new-chat">Nova conversa</button>
          <button data-act="new-temp">Nova conversa temporária</button>
          <button data-act="notify" id="m-notify">Ativar notificações</button>
          <button data-act="install" id="m-install" hidden>Instalar app</button>
          <button data-act="lock">Bloquear agora</button>
          <button data-act="pin" id="m-pin">Bloqueio com PIN</button>
          <button data-act="devices">Aparelhos conectados</button>
          <button data-act="audit">Atividade da conta</button>
          <button data-act="security" id="m-security" hidden>Central de Segurança</button>
          <button data-act="switch">Trocar de sistema</button>
          <button data-act="logout" id="logout">Sair</button>
        </div>
      </header>
      <div class="search"><div class="search-box">${ic('search', 'sm')}<input id="search" placeholder="Pesquisar" autocomplete="off"></div></div>
      <div class="banner" id="banner" hidden></div>
      <div class="chips">
        <button class="chip active" data-f="all">Tudo</button>
        <button class="chip" data-f="unread">Não lidas</button>
        <button class="chip" data-f="direct">Privadas</button>
        <button class="chip" data-f="temp">Temporárias</button>
      </div>
      <div id="rooms"></div>
      <div class="side-foot">${ic('lock', 'xs')} Criptografia de ponta a ponta</div>
      <button id="fab" title="Nova conversa">${ic('chat-plus')}</button>

      <div class="drawer" id="drawer">
        <div class="drawer-head"><button class="icon-btn" id="drawer-close" title="Voltar">${ic('back')}</button><h2>Nova conversa</h2></div>
        <div class="search"><div class="search-box">${ic('search', 'sm')}<input id="search-users" placeholder="Pesquisar nome" autocomplete="off"></div></div>
        <div class="drawer-body">
          <div class="action-row" id="d-temp">
            <div class="av temp">${ic('timer')}</div>
            <div class="meta"><div class="name">Nova conversa temporária</div><div class="sub">Apagada automaticamente ao fim do prazo</div></div>
          </div>
          <div class="action-row" id="d-global">
            <div class="av global">${ic('users')}</div>
            <div class="meta"><div class="name">Sala Geral</div><div class="sub">Conversa com todos</div></div>
          </div>
          <div class="section-t">Contatos no SecureChat</div>
          <div id="users"></div>
        </div>
      </div>
    </aside>

    <section id="main">
      <header class="bar" id="room-head" hidden></header>
      <div id="messages"></div>
      <div id="composer" hidden>
        <div class="once-banner" id="once-banner" hidden>
          ${ic('once', 'sm')}
          <span>Modo uma visão — prazo de visualização:</span>
          <select id="once-secs" title="Duração da visualização (controlada pelo servidor)">
            <option value="5">5 s</option>
            <option value="10" selected>10 s</option>
            <option value="15">15 s</option>
            <option value="30">30 s</option>
          </select>
        </div>
        <div class="popmenu" id="attach-menu" hidden>
          <button data-up="keep" data-accept="image/*"><span class="pic" style="background:#007bfc">${ic('image')}</span><span>Galeria<span class="sub">Fica salva na conversa</span></span></button>
          <button data-up="keep" data-accept=""><span class="pic" style="background:#7f66ff">${ic('file')}</span><span>Documento<span class="sub">Fica salvo na conversa</span></span></button>
          <div class="sep"></div>
          <button data-up="once" data-accept="image/*"><span class="pic" style="background:#0a6e8f">${ic('once')}</span><span>Foto 1 visão<span class="sub">Some depois de aberta</span></span></button>
          <button data-up="once" data-accept=""><span class="pic" style="background:#0a6e8f">${ic('once')}</span><span>Doc 1 visão<span class="sub">Some depois de aberto</span></span></button>
        </div>
        <div class="input-wrap">
          <textarea id="input" rows="1" placeholder="Mensagem" enterkeyhint="send"></textarea>
          <button class="icon-btn" id="btn-file" title="Anexar">${ic('paperclip')}</button>
          <button class="icon-btn" id="btn-once" title="Enviar como uma visão">${ic('once')}</button>
        </div>
        <button class="send" id="send" title="Enviar">${ic('send')}</button>
      </div>
      <input type="file" id="file" hidden>
    </section>
  `;
  app.appendChild(wrap);
  $('#who').textContent = state.me.display_name;
  $('#me-av').innerHTML = userAvatar(state.me);

  const menu = $('#menu');
  $('#menu-btn').addEventListener('click', (e) => { e.stopPropagation(); updateMenu(); menu.hidden = !menu.hidden; });
  menu.addEventListener('click', async (e) => {
    const act = e.target.dataset.act; menu.hidden = true;
    if (act === 'new-chat') openDrawer();
    if (act === 'new-temp') openTempModal();
    if (act === 'notify') setupPush(true);
    if (act === 'install') promptInstall();
    if (act === 'lock') lockApp('manual');
    if (act === 'pin') openPinModal();
    if (act === 'devices') openDevices();
    if (act === 'audit') openAudit();
    if (act === 'security' && window.SCSecurityCenter) {
      window.SCSecurityCenter.open({ sb, esc, ic, toast });
    }
    if (act === 'switch') bridgeSend({ type: 'chat-trocar-sistema' });
    if (act === 'logout') openLogoutSheet();
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#menu')) menu.hidden = true;
    if (!e.target.closest('#attach-menu') && !e.target.closest('#btn-file')) $('#attach-menu').hidden = true;
  });

  $('#new-chat').addEventListener('click', openDrawer);
  $('#fab').addEventListener('click', openDrawer);
  $('#new-temp').addEventListener('click', openTempModal);
  $('#drawer-close').addEventListener('click', () => (history.state && history.state.drawer ? history.back() : closeDrawer()));
  $('#d-temp').addEventListener('click', () => { closeDrawer(); openTempModal(); });
  $('#d-global').addEventListener('click', () => {
    closeDrawer();
    const g = state.rooms.find((r) => r.type === 'global'); if (g) selectRoom(g.id);
  });
  $('#search-users').addEventListener('input', renderUsers);
  $('#search').addEventListener('input', (e) => { state.query = e.target.value.trim().toLowerCase(); renderRooms(); });
  wrap.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => {
    wrap.querySelectorAll('.chip').forEach((x) => x.classList.toggle('active', x === c));
    state.filter = c.dataset.f; renderRooms();
  }));

  // composer
  // atencao: passar `sendText` direto entregaria o MouseEvent como `once` (truthy). Por isso a arrow function.
  $('#send').addEventListener('click', () => sendText());
  const ta = $('#input');
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !isMobile()) { e.preventDefault(); sendText(); }
  });
  ta.addEventListener('input', () => { autoGrow(); sendTyping(); });
  ta.addEventListener('focus', () => setTimeout(() => { const b = $('#messages'); b.scrollTop = b.scrollHeight; }, 300));
  $('#btn-file').addEventListener('click', (e) => { e.stopPropagation(); $('#attach-menu').hidden = !$('#attach-menu').hidden; });
  $('#attach-menu').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    state.uploadMode = b.dataset.up;
    $('#file').accept = b.dataset.accept;
    $('#attach-menu').hidden = true;
    $('#file').click();
  });
  $('#btn-once').addEventListener('click', () => {
    if ($('#input').value.trim()) sendText(true);
    else setOnceMode(!state.onceMode);
  });
  $('#file').addEventListener('change', uploadFile);

  renderRooms(); renderUsers(); renderHead(); renderMessages(); updateBanner();
}

function autoGrow() {
  const ta = $('#input'); if (!ta) return;
  const base = isMobile() ? 48 : 42;
  ta.style.height = base + 'px';
  ta.style.height = Math.min(ta.scrollHeight, 130) + 'px';
}
function setOnceMode(on) {
  state.onceMode = on;
  $('#btn-once').classList.toggle('on', on);
  const banner = $('#once-banner');
  if (banner) banner.hidden = !on;
  const sel = $('#once-secs');
  if (sel && on) {
    sel.value = String(state.viewSeconds || 10);
    sel.onchange = () => { state.viewSeconds = Number(sel.value) || 10; };
  }
}
function onceViewSeconds() {
  const sel = $('#once-secs');
  const v = Number(sel?.value || state.viewSeconds || 10);
  return [5, 10, 15, 30].includes(v) ? v : 10;
}
function openDrawer() {
  $('#search-users').value = ''; renderUsers(); $('#drawer').classList.add('open');
  if (isMobile()) history.pushState({ ...(history.state || {}), drawer: true }, '');
  else setTimeout(() => $('#search-users')?.focus(), 230);
}
function closeDrawer() { const d = $('#drawer'); if (d) d.classList.remove('open'); }

// ---------------------------------------------------------------- lista de conversas
function lastLine(r) {
  const lm = r.last_message;
  if (r.type === 'temp' && !lm) return `<span class="ttl-tag">${ic('timer', 'xs')}</span><span>Apaga em <span data-expire="${r.expires_at}">${fmtTTL(r.expires_at)}</span></span>`;
  if (!lm) return r.type === 'global' ? 'Conversa com todos' : 'Toque para conversar';
  const mine = lm.sender_id === state.me.id;
  let prefix = '';
  if (mine) prefix = `<span class="tick">${ic('check', 'xs')}</span>`;
  else if (r.type !== 'direct') prefix = `${esc(String(lm.display_name || '').split(' ')[0])}: `;
  return prefix + previewOf(r).html;
}

function renderRooms() {
  const box = $('#rooms'); if (!box) return;
  let list = [...state.rooms];
  if (state.filter === 'direct') list = list.filter((r) => r.type === 'direct');
  if (state.filter === 'temp') list = list.filter((r) => r.type === 'temp');
  if (state.filter === 'unread') list = list.filter((r) => state.unread[r.id]);
  if (state.query) list = list.filter((r) => roomName(r).toLowerCase().includes(state.query));
  list.sort((a, b) => (b.type === 'global') - (a.type === 'global') || roomTime(b) - roomTime(a));

  box.innerHTML = '';
  if (!list.length) {
    box.innerHTML = `<div class="list-empty">${state.query ? 'Nenhuma conversa encontrada.' : 'Nenhuma conversa aqui ainda.'}</div>`;
    updateAppBadge();
    return;
  }
  for (const r of list) {
    const unread = state.unread[r.id] || 0;
    const d = document.createElement('div');
    d.className = 'room' + (state.active === r.id ? ' active' : '') + (unread ? ' unread' : '');
    d.innerHTML = `${avatarHTML(r, 'lg')}
      <div class="meta">
        <div class="row"><span class="name">${esc(roomName(r))}</span><span class="when">${fmtListTime(roomTime(r))}</span></div>
        <div class="row"><span class="last">${lastLine(r)}</span>
          ${r.type === 'global' ? `<span class="pin" title="Fixada">${ic('pin', 'xs')}</span>` : ''}
          ${r.type === 'temp' && r.last_message ? `<span class="pin" title="Temporária">${ic('timer', 'xs')}</span>` : ''}
          ${unread ? `<span class="badge">${unread}</span>` : ''}</div>
      </div>`;
    d.addEventListener('click', () => selectRoom(r.id));
    box.appendChild(d);
  }
  updateAppBadge();
}

function renderUsers() {
  const box = $('#users'); if (!box) return;
  const q = ($('#search-users') && $('#search-users').value.trim().toLowerCase()) || '';
  const others = state.users.filter((u) => u.id !== state.me.id
    && (!q || u.display_name.toLowerCase().includes(q) || u.username.includes(q)));
  box.innerHTML = '';
  if (!others.length) { box.innerHTML = `<div class="list-empty">${q ? 'Ninguém encontrado.' : 'Ninguém mais por aqui ainda.<br>Peça para alguém criar uma conta.'}</div>`; return; }
  for (const u of others) {
    const on = state.online.includes(u.id);
    const d = document.createElement('div'); d.className = 'action-row user';
    d.innerHTML = `${userAvatar(u, 'lg', true)}
      <div class="meta"><div class="name">${esc(u.display_name)}</div><div class="sub">${on ? 'online' : '@' + esc(u.username)}</div></div>`;
    d.addEventListener('click', () => { closeDrawer(); openDirect(u.id); });
    box.appendChild(d);
  }
}

// ---------------------------------------------------------------- cabeçalho
function headStatus(r) {
  const typers = Object.entries(state.typing)
    .filter(([uid, t]) => t.room === r.id && t.until > Date.now() && uid !== state.me.id).map(([uid]) => uid);
  if (typers.length) {
    if (r.type === 'direct') return { txt: 'digitando…', cls: 'typing' };
    const names = typers.map((u) => (state.profiles[u] ? state.profiles[u].display_name.split(' ')[0] : 'Alguém'));
    return { txt: `${names.join(', ')} ${names.length > 1 ? 'estão' : 'está'} digitando…`, cls: 'typing' };
  }
  if (r.type === 'direct') {
    const o = otherMember(r);
    return o && state.online.includes(o.id) ? { txt: 'online', cls: 'online' } : { txt: 'toque para ver a criptografia', cls: '' };
  }
  const names = (r.members || []).map((m) => (m.id === state.me.id ? 'Você' : m.display_name));
  if (r.type === 'global') {
    const on = (r.members || []).filter((m) => state.online.includes(m.id)).length;
    return { txt: `${names.length} participantes · ${on} online`, cls: '' };
  }
  return { txt: names.join(', '), cls: '' };
}

function isVerified(r) {
  if (!r || r.type !== 'direct') return false;
  const o = otherMember(r); if (!o) return false;
  const s = JSON.parse(localStorage.getItem(`sc-fp-${state.me.id}-${o.id}`) || 'null');
  return !!(s && s.verified && !state.keyChanged[r.id]);
}

function renderHead() {
  const h = $('#room-head'); const main = $('#main');
  const r = activeRoom();
  if (!r) {
    h.hidden = true; h.innerHTML = ''; $('#composer').hidden = true; main.classList.add('idle');
    $('#chat').classList.remove('in-room');
    return;
  }
  main.classList.remove('idle');
  const st = headStatus(r);
  const canDelete = r.type === 'direct' || (r.type === 'temp' && r.created_by === state.me.id);
  h.hidden = false;
  h.innerHTML = `<button class="icon-btn" id="back" title="Voltar">${ic('back')}</button>
    ${avatarHTML(r)}
    <div class="grow" style="padding-left:6px" id="head-info">
      <div class="title">${esc(roomName(r))}${isVerified(r) ? `<span class="verified" title="Criptografia verificada">${ic('shield', 'xs')}</span>` : ''}</div>
      <div class="status ${st.cls}">${esc(st.txt)}</div>
    </div>
    ${r.type === 'temp' ? `<span class="ttl-pill">${ic('timer', 'xs')}<span data-expire="${r.expires_at}">${fmtTTL(r.expires_at)}</span></span>` : ''}
    ${r.type === 'direct' ? `<button class="icon-btn" id="head-safety" title="Verificar criptografia">${ic('shield', 'sm')}</button>` : ''}
    <button class="icon-btn" id="head-search" title="Pesquisar">${ic('search', 'sm')}</button>
    ${canDelete ? `<button class="icon-btn" id="head-more" title="Mais opções">${ic('more', 'sm')}</button>
      <div class="dropmenu" id="head-menu" hidden><button data-a="delete">${r.type === 'temp' ? 'Encerrar conversa agora' : 'Apagar conversa para os dois'}</button></div>` : ''}`;
  $('#back').addEventListener('click', () => (history.state && history.state.room ? history.back() : leaveRoom()));
  $('#head-search').addEventListener('click', () => { $('#search')?.focus(); });
  if (r.type === 'direct') {
    $('#head-info').addEventListener('click', () => openSafety(r));
    $('#head-safety').addEventListener('click', () => openSafety(r));
  }
  if (canDelete) {
    const hm = $('#head-menu');
    $('#head-more').addEventListener('click', (e) => { e.stopPropagation(); hm.hidden = !hm.hidden; });
    hm.addEventListener('click', (e) => { hm.hidden = true; if (e.target.dataset.a === 'delete') openDeleteRoom(r); });
    document.addEventListener('click', (e) => { if (!e.target.closest('#head-menu')) hm.hidden = true; }, { once: true });
  }
  $('#composer').hidden = false;
}

function refreshHeadStatus() {
  const r = activeRoom();
  const el = $('#room-head .status');
  if (r && el) { const st = headStatus(r); el.textContent = st.txt; el.className = 'status ' + st.cls; }
}

// ---------------------------------------------------------------- mensagens
function readByAll(m, r) {
  const others = (r.members || []).filter((x) => x.id !== state.me.id);
  return others.length > 0 && others.every((x) => (x.last_read_at || 0) >= m.created_at);
}

function renderMessages() {
  const box = $('#messages'); box.innerHTML = '';
  if (!state.active) {
    box.innerHTML = `<div class="empty-state">
      <svg class="logo"><use href="${ICONS}#i-logo"/></svg>
      <h2>Chat Seguro</h2>
      <p>Envie e receba mensagens privadas, em grupo ou temporárias.<br>
      Use o botão ${ic('once', 'xs')} para mensagens de uma visão.</p>
      <div class="lockline">${ic('lock', 'xs')} Criptografia de ponta a ponta</div></div>`;
    return;
  }
  const r = activeRoom();
  const notice = document.createElement('div'); notice.className = 'notice';
  notice.innerHTML = `${ic('lock', 'xs')} <span>As mensagens são protegidas com criptografia de ponta a ponta: ninguém fora desta conversa, nem o servidor, consegue lê-las.${
    r && r.type === 'temp' ? ` Tudo será apagado em <span data-expire="${r.expires_at}">${fmtTTL(r.expires_at)}</span>.` : ''}</span>`;
  box.appendChild(notice);
  if (state.keyChanged[state.active]) {
    const w = document.createElement('div'); w.className = 'sys warn';
    w.innerHTML = `${ic('shield', 'xs')} O código de segurança com ${esc(roomName(r))} mudou (novo aparelho?). Toque para verificar.`;
    w.addEventListener('click', () => openSafety(r));
    box.appendChild(w);
  }

  // mensagens + alertas de segurança na mesma linha do tempo
  const items = state.messages.map((m) => ({ t: m.created_at, m }))
    .concat(state.alerts.map((a) => ({ t: toEpoch(a.created_at), a })))
    .concat(state.receipts.map((rc) => ({ t: toEpoch(rc.sent_at), rc })))
    .sort((x, y) => x.t - y.t);
  let prev = null; let lastDay = null;
  const group = r && r.type !== 'direct';
  for (const it of items) {
    const d = new Date(it.t * 1000);
    if (!lastDay || !sameDay(lastDay, d)) {
      const sep = document.createElement('div'); sep.className = 'day'; sep.textContent = fmtDay(it.t);
      box.appendChild(sep); prev = null; lastDay = d;
    }
    if (it.a) { box.appendChild(alertNode(it.a)); prev = null; continue; }
    if (it.rc) { box.appendChild(receiptNode(it.rc, group)); prev = null; continue; }
    box.appendChild(msgNode(it.m, !prev || prev.sender_id !== it.m.sender_id, group, r));
    prev = it.m;
  }
  hydrateImages(box);
  box.scrollTop = box.scrollHeight;
}

function footHTML(m, mine, r) {
  let tick = '';
  if (mine) tick = readByAll(m, r) ? `<span class="tick read" title="Lida">${ic('check2', 'xs')}</span>` : `<span class="tick" title="Enviada">${ic('check', 'xs')}</span>`;
  return `<span class="foot">${fmtClock(m.created_at)}${tick}</span>`;
}

function msgNode(m, first, group, r) {
  const mine = m.sender_id === state.me.id;
  const d = document.createElement('div');
  d.className = 'msg' + (mine ? ' mine' : '') + (m.pending ? ' pending' : '') + (first ? ' first' : '') + (m.err ? ' locked' : '');
  d.dataset.mid = m.id;
  const who = (group && first && !mine)
    ? `<div class="who" style="color:${NAME_COLORS[hashIdx(m.sender, NAME_COLORS.length)]}">${esc(m.sender)}</div>` : '';
  const menuBtn = mine ? `<button class="mmenu" title="Opções">${ic('chevron', 'xs')}</button>` : '';

  if (m.pending) {
    d.innerHTML = `${menuBtn}${who}<div class="once-row">${ic('once')}
      ${mine
        ? '<div><div class="lbl">Mensagem de uma visão enviada</div><div class="sub">Ainda não foi aberta</div></div>'
        : '<div><button class="open-once">Abrir (uma visão)</button><div class="sub">Some depois de aberta</div></div>'}
      </div>${footHTML(m, mine, r)}`;
  } else if (m.err) {
    d.innerHTML = `${menuBtn}${who}<span class="txt">${ic('lock', 'xs')} ${m.err === 'nokey'
      ? 'Esta mensagem foi cifrada para outro aparelho e não pode ser lida aqui.'
      : 'Não foi possível decifrar esta mensagem.'}</span>${footHTML(m, mine, r)}`;
  } else if (m.kind === 'file' && m.plain) {
    d.innerHTML = menuBtn + who + fileHTML(m) + footHTML(m, mine, r);
    wireFile(d, m);
  } else {
    d.innerHTML = `${menuBtn}${who}<span class="txt">${esc(m.plain ? m.plain.body : '…')}</span>${footHTML(m, mine, r)}`;
  }
  if (mine) wireMsgActions(d, m);
  return d;
}

function fileHTML(m) {
  const f = m.plain;
  const isImg = (f.mime || '').startsWith('image/');
  if (isImg) {
    return `<div class="att-img"><canvas data-mid="${m.id}" class="att-canvas" width="330" height="200" aria-label="${esc(f.name)}"></canvas></div>`;
  }
  const ext = (String(f.name || '').split('.').pop() || '').toUpperCase().slice(0, 4);
  return `<div class="att"><div class="fic">${ic('file', 'sm')}</div>
    <div class="finfo"><div class="fname">${esc(f.name)}</div>
    <div class="fsub">${ext ? esc(ext) + ' · ' : ''}${fmtSize(f.size)}</div></div></div>`;
}

// baixa os bytes cifrados (URL assinada de 60 s) e decifra em memória
async function fileBlobURL(m) {
  if (state.blobs[m.id]) return state.blobs[m.id];
  const { data, error } = await sb.storage.from('sc-files').createSignedUrl(m.file_path, 60);
  if (error) throw error;
  const res = await fetch(data.signedUrl);
  if (!res.ok) throw new Error('arquivo indisponível');
  const plain = await E2EE.decryptFile(m.K, m.plain.fiv, new Uint8Array(await res.arrayBuffer()), aadOf(m.room_id, m.sender_id, 'file'));
  const url = URL.createObjectURL(new Blob([plain], { type: m.plain.mime || 'application/octet-stream' }));
  state.blobs[m.id] = url; state.objectURLs.push(url);
  return url;
}

function hydrateImages(root) {
  root.querySelectorAll('canvas[data-mid]').forEach(async (cv) => {
    const m = state.messages.find((x) => String(x.id) === cv.dataset.mid);
    if (!m) return;
    const box = $('#messages');
    const stick = box && box.scrollHeight - box.scrollTop - box.clientHeight < 400;
    try {
      await drawToCanvas(cv, await fileBlobURL(m), 1280);
      if (stick) box.scrollTop = box.scrollHeight;   // imagem carregou depois: mantém no fim da conversa
    } catch { cv.replaceWith(Object.assign(document.createElement('span'), { className: 'txt', textContent: 'imagem indisponível' })); }
  });
}

function wireFile(d, m) {
  const f = m.plain;
  if ((f.mime || '').startsWith('image/')) {
    const cv = d.querySelector('canvas'); cv.style.cursor = 'pointer';
    cv.addEventListener('click', async () => { try { openViewer({ title: f.name, imgSrc: await fileBlobURL(m) }); } catch (e) { toast(errMsg(e)); } });
    return;
  }
  const btn = document.createElement('button');
  btn.className = 'dl'; btn.title = 'Baixar';
  btn.innerHTML = ic('download', 'sm');
  btn.addEventListener('click', async () => {
    try {
      const url = await fileBlobURL(m);
      const a = document.createElement('a'); a.href = url; a.download = f.name; a.click();
    } catch (e) { toast(errMsg(e)); }
  });
  d.querySelector('.att').appendChild(btn);
}

// ações da própria mensagem: botão (computador) ou toque longo (celular)
function wireMsgActions(d, m) {
  const btn = d.querySelector('.mmenu');
  if (btn) btn.addEventListener('click', (e) => { e.stopPropagation(); openMsgSheet(m); });
  let t = null;
  d.addEventListener('touchstart', () => { t = setTimeout(() => { t = null; if (navigator.vibrate) navigator.vibrate(15); openMsgSheet(m); }, 480); }, { passive: true });
  ['touchend', 'touchmove', 'touchcancel'].forEach((ev) => d.addEventListener(ev, () => { if (t) clearTimeout(t); t = null; }, { passive: true }));
}
function openMsgSheet(m) {
  const w = document.createElement('div'); w.className = 'sheet-wrap';
  w.innerHTML = `<div class="sheet">
    <button class="danger" data-a="del">${ic('trash', 'sm')} Apagar para todos</button>
    <button data-a="x">${ic('x', 'sm')} Cancelar</button></div>`;
  const close = () => { if (history.state && history.state.overlay) history.back(); else w.remove(); };
  w.addEventListener('click', async (e) => {
    const a = e.target.closest('button') && e.target.closest('button').dataset.a;
    if (e.target === w || a === 'x') { close(); return; }
    if (a === 'del') { close(); await deleteMessage(m); }
  });
  document.body.appendChild(w);
  pushOverlay();
}

// no celular, "voltar" fecha menus/visualizador antes de sair da conversa
function pushOverlay() { if (isMobile()) history.pushState({ ...(history.state || {}), overlay: true }, ''); }

async function deleteMessage(m) {
  try {
    const { data, error } = await sb.rpc('sc_delete_message', { p_id: m.id });
    if (error) throw error;
    if (data && data.files) await sb.storage.from('sc-files').remove([data.files]);
    if (data && data.once) await sb.storage.from('sc-once').remove([data.once]);
    removeLocal(m.id);
    toast('Mensagem apagada para todos');
  } catch (e) { toast(errMsg(e)); }
}

function openBlob(blob, f, once = false, extra = {}) {
  const url = URL.createObjectURL(blob);
  if ((f.mime || blob.type || '').startsWith('image/')) {
    openViewer({ title: f.name, imgSrc: url, once, revoke: once, ...extra });
  } else if (once) {
    // documentos de uma visão: visualização temporária sem download persistente
    openViewer({
      title: f.name || 'Documento protegido',
      text: `Arquivo protegido (${f.mime || 'binário'}). Pré-visualização limitada; download permanente não está disponível neste modo.`,
      once: true, ...extra,
    });
    URL.revokeObjectURL(url);
  } else {
    state.objectURLs.push(url);
    const a = document.createElement('a'); a.href = url; a.download = f.name; a.click();
  }
}

// visualizador em tela cheia. Imagens são desenhadas em <canvas> com marca d'água nos pixels.
// Uma visão: fecha sozinho no fim do tempo, ao sair do app, ou com toque longo de 3 s ("queimar").
function openViewer({ title, imgSrc, text, once, seconds, revoke, messageId, serverExpiresAt }) {
  const v = document.createElement('div'); v.className = 'viewer' + (once ? ' once' : '');
  v.innerHTML = `${once ? '<div class="viewer-timer"><span></span></div>' : ''}
    <div class="viewer-head">${once ? ic('once') : ic('image')}
      <div class="grow">${esc(title || '')}</div>
      <button class="icon-btn" title="Fechar">${ic('x')}</button></div>
    <div class="viewer-body"></div>
    ${once ? `<div class="viewer-foot">${ic('once', 'xs')} Visualização única controlada pelo servidor. Fecha sozinha; reabertura é recusada. Segure 3 s para queimar agora. Não impede foto externa.</div>` : ''}`;
  const body = v.querySelector('.viewer-body');
  if (imgSrc) {
    const cv = document.createElement('canvas'); cv.className = 'viewer-canvas';
    body.appendChild(cv);
    drawToCanvas(cv, imgSrc, 2048).catch(() => { cv.replaceWith(Object.assign(document.createElement('div'), { className: 'viewer-card', textContent: 'imagem indisponível' })); })
      .finally(() => { if (revoke) URL.revokeObjectURL(imgSrc); });
  } else {
    const c = document.createElement('div'); c.className = 'viewer-card'; c.textContent = text || ''; body.appendChild(c);
  }
  let timer = null, press = null, done = false;
  const notifyClosed = () => {
    if (messageId && sb) sb.rpc('sc_close_protected_view', { p_message_id: Number(messageId) }).then(() => {}, () => {});
  };
  const close = (reason) => {
    if (done) return; done = true;
    clearTimeout(timer); clearTimeout(press);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onHide);
    if (once) notifyClosed(reason);
    if (history.state && history.state.overlay && document.body.contains(v)) history.back(); else v.remove();
  };
  const onKey = (e) => { if (e.key === 'Escape') close('escape'); };
  const onHide = () => { if (document.hidden) close('visibility'); };
  v.querySelector('.icon-btn').addEventListener('click', () => close('button'));
  v.addEventListener('click', (e) => { if (!once && (e.target === v || e.target === body)) close('backdrop'); });
  document.addEventListener('keydown', onKey);
  if (once) {
    // prazo: mínimo entre segundos configurados e expires_at do servidor
    let secs = seconds || 10;
    if (serverExpiresAt) {
      const left = Math.max(1, Math.round((Date.parse(serverExpiresAt) - Date.now()) / 1000));
      secs = Math.min(secs, left);
    }
    v.querySelector('.viewer-timer span').style.animationDuration = secs + 's';
    timer = setTimeout(() => close('timer'), secs * 1000);
    document.addEventListener('visibilitychange', onHide);
    const start = () => {
      clearTimeout(press);
      press = setTimeout(() => {
        close('burn'); toast('Conteúdo queimado.');
        scAlert('long_press', 'medium', { message_id: messageId });
      }, 3000);
    };
    const stop = () => clearTimeout(press);
    body.addEventListener('pointerdown', start);
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => body.addEventListener(ev, stop));
  }
  document.body.appendChild(v);
  pushOverlay();
}

// uma visão: a Edge Function entrega uma única vez e apaga; aqui decifra em memória
async function revealOnce(id) {
  const m = state.messages.find((x) => String(x.id) === String(id));
  if (!m) return;
  const aad = aadOf(m.room_id, m.sender_id, 'once');
  try {
    const session = { access_token: await getToken() };
    const res = await fetch('/api/chat-reveal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, apikey: CFG.SUPABASE_ANON_KEY },
      body: JSON.stringify({ id: Number(id) }),
    });
    if (!res.ok) {
      let code = '';
      try { code = (await res.json()).code || ''; } catch { /* ignore */ }
      toast(code === 'reopen_denied'
        ? 'Reabertura recusada: a visualização já foi consumida.'
        : 'Conteúdo já aberto ou indisponível');
      removeLocal(id);
      return;
    }
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const meta = await res.json();
      const { obj } = await E2EE.decrypt(state.device, meta.env, aad);
      const body = String(obj.body || '');
      const secs = meta.view_seconds || Math.min(30, Math.max(5, Math.round(10 + body.length / 40)));
      openViewer({
        title: `Mensagem de uma visão · ${m.sender}`, text: body, once: true,
        seconds: secs, messageId: meta.message_id || id, serverExpiresAt: meta.expires_at,
      });
    } else {
      const buf = new Uint8Array(await res.arrayBuffer());
      const n = new DataView(buf.buffer, buf.byteOffset).getUint32(0);
      const meta = JSON.parse(new TextDecoder().decode(buf.subarray(4, 4 + n)));
      const { obj, K } = await E2EE.decrypt(state.device, meta.env, aad);
      const plain = await E2EE.decryptFile(K, obj.fiv, buf.subarray(4 + n), aad);
      openBlob(new Blob([plain], { type: obj.mime || 'application/octet-stream' }), { name: obj.name || 'arquivo', mime: obj.mime }, true, {
        seconds: meta.view_seconds || 10,
        messageId: meta.message_id || id,
        serverExpiresAt: meta.expires_at,
      });
    }
    upsertReceipt({
      message_id: Number(id), room_id: m.room_id, sender_id: m.sender_id, sent_at: new Date(m.created_at * 1000).toISOString(),
      status: 'opened', viewer_id: state.me.id, opened_at: new Date().toISOString(), had_file: !ct.includes('application/json'),
    }, false);
    removeLocal(id);
  } catch (e) {
    toast(e && e.message === 'nokey' ? 'Esta mensagem foi cifrada para outro aparelho.' : errMsg(e));
    removeLocal(id);
  }
}

function removeLocal(id) {
  const before = state.messages.length;
  state.messages = state.messages.filter((x) => String(x.id) !== String(id));
  if (state.messages.length !== before) renderMessages();
}

// ---------------------------------------------------------------- comprovante de uma visão
function upsertReceipt(rc, fromServer) {
  if (!rc || !state.me) return;
  // a bolha pendente some quando vira comprovante
  state.messages = state.messages.filter((x) => String(x.id) !== String(rc.message_id));
  if (rc.room_id === state.active) {
    const i = state.receipts.findIndex((x) => String(x.message_id) === String(rc.message_id));
    if (i >= 0) state.receipts[i] = { ...state.receipts[i], ...rc }; else state.receipts.push(rc);
    if (!state.locked) renderMessages();
  }
  // quem enviou fica sabendo na hora
  if (fromServer && rc.status === 'opened' && rc.sender_id === state.me.id && rc.viewer_id !== state.me.id && !state.locked) {
    const who = (state.profiles[rc.viewer_id] || {}).display_name || 'Alguém';
    const r = state.rooms.find((x) => x.id === rc.room_id);
    toast(`${who} abriu sua mensagem de uma visão${r && r.id !== state.active ? ' em ' + roomName(r) : ''}`);
  }
}

function receiptNode(rc, group) {
  const mine = rc.sender_id === state.me.id;
  const opened = rc.status === 'opened';
  const viewerName = rc.viewer_id === state.me.id ? 'você' : esc((state.profiles[rc.viewer_id] || {}).display_name || 'alguém');
  const what = rc.had_file ? 'Foto/arquivo de uma visão' : 'Mensagem de uma visão';
  const sent = toEpoch(rc.sent_at);
  const d = document.createElement('div');
  d.className = 'msg receipt first' + (mine ? ' mine' : '') + (opened ? ' opened' : ' expired');
  d.dataset.receipt = rc.message_id;
  const who = (group && !mine)
    ? `<div class="who" style="color:${NAME_COLORS[hashIdx((state.profiles[rc.sender_id] || {}).display_name || '', NAME_COLORS.length)]}">${esc((state.profiles[rc.sender_id] || {}).display_name || 'Alguém')}</div>` : '';
  let status;
  if (opened) {
    const when = rc.opened_at ? toEpoch(rc.opened_at) : sent;
    const day = sameDay(new Date(when * 1000), new Date(sent * 1000)) ? '' : ` (${fmtDay(when).toLowerCase()})`;
    status = `<span class="rc-seen">${ic('check2', 'xs')} Aberta por ${viewerName} às ${fmtClock(when)}${day}</span>`;
  } else {
    status = `<span class="rc-expired">${ic('timer', 'xs')} Expirou sem ser aberta</span>`;
  }
  d.innerHTML = `${who}<div class="once-row">${ic('once')}
    <div><div class="lbl">${what}${mine ? ' enviada' : ''}</div><div class="sub">${status}</div></div></div>
    <span class="foot">${mine ? 'Enviada ' : 'Recebida '}${fmtClock(sent)}${mine ? `<span class="tick${opened ? ' read' : ''}">${ic(opened ? 'check2' : 'check', 'xs')}</span>` : ''}</span>`;
  d.title = opened ? 'O conteúdo foi apagado depois de aberto. Este comprovante é gerado pelo servidor.' : 'Ninguém abriu dentro do prazo; o conteúdo foi apagado.';
  return d;
}

// ---------------------------------------------------------------- número de segurança
async function safetyNumber(r) {
  const o = otherMember(r);
  const { data, error } = await sb.from('sc_key_registry').select('user_id,public_key')
    .in('user_id', [state.me.id, o.id]).is('revoked_at', null);
  if (error) throw error;
  const mine = data.filter((k) => k.user_id === state.me.id).map((k) => k.public_key);
  const theirs = data.filter((k) => k.user_id === o.id).map((k) => k.public_key);
  if (!theirs.length) return { o, groups: null };
  return { o, groups: await E2EE.fingerprint(state.me.id, mine, o.id, theirs) };
}

// confere se a chave do contato mudou desde a última vez (aviso como no WhatsApp)
async function checkKeyChange(r) {
  if (r.type !== 'direct') return;
  try {
    const { o, groups } = await safetyNumber(r);
    if (!groups) return;
    const k = `sc-fp-${state.me.id}-${o.id}`;
    const fp = groups.join('');
    const saved = JSON.parse(localStorage.getItem(k) || 'null');
    if (!saved) localStorage.setItem(k, JSON.stringify({ fp, verified: false }));
    else if (saved.fp !== fp) {
      state.keyChanged[r.id] = fp;
      if (state.active === r.id) { renderHead(); renderMessages(); }
    }
  } catch { /* sem rede: tenta na próxima vez */ }
}

async function openSafety(r) {
  try {
    const { o, groups } = await safetyNumber(r);
    const m = document.createElement('div'); m.id = 'modal';
    const k = `sc-fp-${state.me.id}-${o.id}`;
    const saved = JSON.parse(localStorage.getItem(k) || 'null');
    const fp = groups && groups.join('');
    const verified = saved && saved.verified && saved.fp === fp;
    m.innerHTML = `<div class="modal-box">
      <h3>Verificar criptografia</h3>
      ${groups ? `<p class="desc">Compare estes 60 números com os que aparecem no aparelho de <b>${esc(o.display_name)}</b>, pessoalmente ou por ligação.
        Se forem iguais, ninguém está interceptando a conversa.</p>
        <div class="safety-digits">${groups.map((g) => `<span>${g}</span>`).join('')}</div>
        ${verified ? `<div class="safety-ok">${ic('shield', 'xs')} Você marcou este contato como verificado.</div>` : ''}`
        : `<p class="desc">${esc(o.display_name)} ainda não abriu o app com criptografia. O número aparece quando ele entrar.</p>`}
      <div class="modal-actions"><button class="btn ghost sm" id="sf-close">Fechar</button>
        ${groups ? `<button class="btn sm" id="sf-ok">${verified ? 'Desmarcar verificação' : 'Marcar como verificado'}</button>` : ''}</div>
    </div>`;
    document.body.appendChild(m);
    $('#sf-close').addEventListener('click', () => m.remove());
    m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });
    const ok = $('#sf-ok');
    if (ok) ok.addEventListener('click', () => {
      localStorage.setItem(k, JSON.stringify({ fp, verified: !verified }));
      delete state.keyChanged[r.id];
      m.remove(); renderHead(); renderMessages();
      toast(verified ? 'Verificação removida' : 'Contato verificado');
    });
  } catch (e) { toast(errMsg(e)); }
}

// ---------------------------------------------------------------- dados
async function loadRooms() {
  const { data, error } = await sb.rpc('sc_get_rooms');
  if (error) throw error;
  state.rooms = data || [];
  for (const r of state.rooms) {
    for (const m of r.members || []) state.profiles[m.id] = state.profiles[m.id] || m;
    state.unread[r.id] = r.id === state.active ? 0 : (r.unread || 0);
  }
}

async function selectRoom(id) {
  id = Number(id);
  if (state.locked) return;
  if (!state.rooms.find((r) => r.id === id)) { try { await loadRooms(); } catch { /* ignora */ } }
  if (!state.rooms.find((r) => r.id === id)) { toast('Conversa indisponível'); return; }
  const wasIn = !!state.active;
  state.active = id; state.unread[id] = 0; state.messages = []; state.alerts = []; state.receipts = [];
  if (state.onceMode) setOnceMode(false);
  $('#chat').classList.add('in-room');
  if (isMobile()) {
    if (wasIn && history.state && history.state.room) history.replaceState({ room: id }, '');
    else history.pushState({ room: id }, '');
  }
  joinRoomChannel(id);
  renderRooms(); renderHead(); renderMessages();
  try {
    const [msgs, alerts, receipts] = await Promise.all([
      sb.from('sc_messages').select(MSG_COLS).eq('room_id', id).order('id', { ascending: false }).limit(200),
      sb.from('sc_security_alerts').select(ALERT_COLS).eq('room_id', id).in('severity', ['medium', 'high'])
        .order('created_at', { ascending: false }).limit(50),
      sb.from('sc_once_receipts').select(RECEIPT_COLS).eq('room_id', id).order('sent_at', { ascending: false }).limit(100),
    ]);
    if (msgs.error) throw msgs.error;
    const list = (msgs.data || []).reverse().map(normMsg);
    await decryptAll(list);
    if (state.active !== id) return;
    state.messages = list;
    state.alerts = (alerts.data || []).reverse();
    state.receipts = (receipts && !receipts.error ? receipts.data || [] : []).reverse();   // sem a migração 004: vazio
    renderMessages();
  } catch (e) { toast(errMsg(e)); }
  sb.rpc('sc_mark_read', { p_room: id }).then(() => {});
  checkKeyChange(activeRoom());
  if (!isMobile() && $('#input')) $('#input')?.focus();
}

function leaveRoom() {
  state.active = null; state.messages = [];
  joinRoomChannel(null);
  renderRooms(); renderHead(); renderMessages();
}

let _readTimer = null;
function markReadSoon(id) {
  clearTimeout(_readTimer);
  _readTimer = setTimeout(() => sb.rpc('sc_mark_read', { p_room: id }).then(() => {}), 800);
}

async function openDirect(uid) {
  try {
    const { data, error } = await sb.rpc('sc_open_direct', { p_other: uid });
    if (error) throw error;
    await loadRooms(); await selectRoom(data);
  } catch (e) { toast(errMsg(e)); }
}

function openTempModal() {
  const m = document.createElement('div'); m.id = 'modal';
  const others = state.users.filter((u) => u.id !== state.me.id);
  m.innerHTML = `<div class="modal-box">
    <h3>Nova conversa temporária</h3>
    <p class="desc">A conversa, as mensagens e os arquivos são apagados do servidor quando o prazo acabar.</p>
    <div class="field"><label>Nome da conversa</label><input id="t-name" maxlength="60" placeholder="Ex.: reunião de sexta"></div>
    <div class="field"><label>Apagar depois de</label><select id="t-ttl">
      <option value="1">1 hora</option><option value="24" selected>24 horas</option>
      <option value="72">3 dias</option><option value="168">7 dias</option></select></div>
    <div class="field"><label>Participantes</label>
      <div class="checks">${others.length ? others.map((u) => `<label class="check"><input type="checkbox" value="${esc(u.id)}">${userAvatar(u)}<span>${esc(u.display_name)}</span></label>`).join('') : '<span class="hint">Só você por enquanto.</span>'}</div>
    </div>
    <div class="modal-actions"><button class="btn ghost sm" id="t-cancel">Cancelar</button>
      <button class="btn sm" id="t-go">Criar conversa</button></div>
  </div>`;
  document.body.appendChild(m);
  $('#t-cancel').addEventListener('click', () => m.remove());
  m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });
  if (!isMobile()) setTimeout(() => $('#t-name')?.focus(), 30);
  $('#t-go').addEventListener('click', async () => {
    const members = [...m.querySelectorAll('input[type=checkbox]:checked')].map((x) => x.value);
    try {
      const { data, error } = await sb.rpc('sc_create_temp', { p_name: $('#t-name').value, p_hours: +$('#t-ttl').value, p_members: members });
      if (error) throw error;
      m.remove(); await loadRooms(); await selectRoom(data);
    } catch (e) { toast(errMsg(e)); }
  });
}

// atualiza a prévia/horário da conversa sem ir ao servidor
function touchRoom(m, row) {
  const r = state.rooms.find((x) => x.id === m.room_id); if (!r) return;
  r.last_message = {
    id: m.id, kind: m.kind, sender_id: m.sender_id, room_id: m.room_id, display_name: m.sender, created_at: m.created_at,
    ciphertext: row && row.ciphertext, iv: row && row.iv, sender_key: row && row.sender_key, keys: row && row.keys,
  };
  if (m.plain) state.previews[m.id] = m.plain.t === 'file' ? m.plain.name : String(m.plain.body || '').slice(0, 80);
}

function addMessage(m, row) {
  touchRoom(m, row);
  if (m.room_id === state.active && !state.messages.find((x) => x.id === m.id)) {
    state.messages.push(m);
    state.messages.sort((a, b) => a.id - b.id);
    renderMessages();
  }
  renderRooms();
}

async function sendText(once = false) {
  const ta = $('#input'); const body = ta.value.trim();
  const room = activeRoom();
  if (!body || !room) return;
  const asOnce = once || state.onceMode;
  ta.value = ''; autoGrow();
  if (state.onceMode) setOnceMode(false);
  if (isMobile()) ta.focus();
  try {
    if (asOnce) {
      const { env } = await sealFor(room, 'once', { t: 'text', body });
      const { data: id, error } = await sb.rpc('sc_send_once', {
        p_room: room.id, p_env: env, p_view_seconds: onceViewSeconds(),
      });
      if (error) throw error;
      addMessage({ id, room_id: room.id, sender_id: state.me.id, sender: state.me.display_name, kind: 'once', pending: true, created_at: Date.now() / 1000 });
    } else {
      const { env, payload } = await sealFor(room, 'text', { t: 'text', body });
      const { data, error } = await sb.from('sc_messages')
        .insert({ room_id: room.id, sender_id: state.me.id, kind: 'text', ciphertext: env.c, iv: env.iv, sender_key: env.sk, keys: env.keys })
        .select(MSG_COLS).single();
      if (error) throw error;
      const m = normMsg(data); m.plain = payload;
      addMessage(m, data);
    }
  } catch (e) {
    toast(errMsg(e));
    if (!ta.value) { ta.value = body; autoGrow(); }
  }
}

async function uploadFile() {
  const inp = $('#file'); const f = inp.files && inp.files[0];
  const room = activeRoom();
  if (!f || !room) return;
  const mode = state.onceMode ? 'once' : state.uploadMode;
  inp.value = ''; state.uploadMode = 'keep';
  if (state.onceMode) setOnceMode(false);
  if (f.size > MAX_FILE) { toast('Arquivo maior que 25 MB'); return; }
  const kind = mode === 'once' ? 'once' : 'file';
  const path = `${room.id}/${crypto.randomUUID()}`;   // nome real fica só dentro do envelope cifrado
  toast('Limpando metadados, cifrando e enviando…');
  try {
    const clean = await stripMetadata(f);
    const mime = clean.type || f.type || 'application/octet-stream';
    const { env, fileCipher, payload, K } = await sealFor(room, kind, { t: 'file', name: f.name, mime, size: clean.bytes.length }, clean.bytes);
    const { error: upErr } = await sb.storage.from(kind === 'once' ? 'sc-once' : 'sc-files')
      .upload(path, new Blob([fileCipher], { type: 'application/octet-stream' }), { contentType: 'application/octet-stream', upsert: false });
    if (upErr) throw upErr;
    if (kind === 'once') {
      const { data: id, error } = await sb.rpc('sc_send_once', {
        p_room: room.id, p_env: env, p_file_path: path, p_view_seconds: onceViewSeconds(),
      });
      if (error) throw error;
      addMessage({ id, room_id: room.id, sender_id: state.me.id, sender: state.me.display_name, kind: 'once', pending: true, created_at: Date.now() / 1000 });
    } else {
      const { data, error } = await sb.from('sc_messages')
        .insert({ room_id: room.id, sender_id: state.me.id, kind: 'file', ciphertext: env.c, iv: env.iv, sender_key: env.sk, keys: env.keys, file_path: path })
        .select(MSG_COLS).single();
      if (error) throw error;
      const m = normMsg(data); m.plain = payload; m.K = K;
      const url = URL.createObjectURL(new Blob([clean.bytes], { type: mime })); state.blobs[m.id] = url; state.objectURLs.push(url);
      addMessage(m, data);
    }
    toast(clean.stripped ? 'Enviado (localização e dados da câmera removidos)' : 'Arquivo enviado');
  } catch (e) { toast(errMsg(e)); }
}

async function logout(wipe = false) {
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg && await reg.pushManager.getSubscription();
      if (sub) {
        await sb.from('sc_push_subscriptions').delete().eq('endpoint', sub.endpoint);
        await sub.unsubscribe();
      }
    }
    if (wipe && state.device) await sb.rpc('sc_revoke_device', { p_key: state.device.pub });
    await sb.rpc('sc_audit_client_event', { p_action: wipe ? 'wipe_device' : 'logout' });
  } catch { /* segue o logout mesmo assim */ }
  if (wipe) await wipeDevice();
  bridgeSend({ type: 'chat-sair' });   // a página do sistema encerra o login
}

// ---------------------------------------------------------------- tempo real
function subscribeRealtime() {
  if (state.channel) sb.removeChannel(state.channel);
  state.channel = sb.channel('sc-db')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sc_messages' }, async ({ new: row }) => {
      if (!state.rooms.find((r) => r.id === row.room_id)) { await loadRooms().catch(() => {}); renderRooms(); }
      if (!state.profiles[row.sender_id]) {
        const { data } = await sb.rpc('sc_directory');
        setUsers(data); renderUsers();
      }
      const m = await decryptMsg(normMsg(row));
      const mine = m.sender_id === state.me.id;
      const visible = document.visibilityState === 'visible' && !state.locked;
      if (m.room_id === state.active) {
        addMessage(m, row);
        if (!mine && visible) markReadSoon(m.room_id);
      } else {
        touchRoom(m, row);
        if (!mine) {
          state.unread[m.room_id] = (state.unread[m.room_id] || 0) + 1;
          if (visible) {
            const r = state.rooms.find((x) => x.id === m.room_id);
            let txt = 'Nova mensagem';
            if (m.kind === 'once') txt = 'Mensagem de uma visão';
            else if (m.plain) txt = m.plain.t === 'file' ? `Arquivo: ${m.plain.name}` : m.plain.body;
            toast(`${r && r.type !== 'direct' ? roomName(r) + ' · ' : ''}${m.sender}: ${String(txt || '').slice(0, 60)}`);
          }
        }
        renderRooms();
      }
      if (state.typing[m.sender_id]) { delete state.typing[m.sender_id]; refreshHeadStatus(); }
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'sc_messages' }, ({ old }) => {
      if (old && old.id) {
        removeLocal(old.id);
        if (state.rooms.some((r) => r.last_message && r.last_message.id === old.id)) loadRooms().then(renderRooms).catch(() => {});
      }
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sc_room_members', filter: `user_id=eq.${state.me.id}` }, async () => {
      await loadRooms().catch(() => {}); renderRooms();
    })
    // alerta de segurança de outro participante (print, cópia, devtools...) ou novo aparelho na minha conta
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sc_security_alerts' }, ({ new: a }) => onRemoteAlert(a))
    // comprovante de uma visão: "aberta por…" / "expirou sem ser aberta"
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sc_once_receipts' }, ({ new: rc }) => upsertReceipt(rc, true))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sc_once_receipts' }, ({ new: rc }) => upsertReceipt(rc, true))
    // ✓✓ azul: alguém marcou a conversa como lida
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sc_room_members' }, ({ new: row }) => {
      const r = state.rooms.find((x) => x.id === row.room_id); if (!r) return;
      const mem = (r.members || []).find((x) => x.id === row.user_id); if (!mem) return;
      mem.last_read_at = toEpoch(row.last_read_at);
      if (r.id === state.active && row.user_id !== state.me.id) renderTicks();
    })
    .subscribe();

  if (state.presence) sb.removeChannel(state.presence);
  state.presence = sb.channel('sc-online', { config: { presence: { key: state.me.id } } });
  state.presence
    .on('presence', { event: 'sync' }, () => {
      state.online = Object.keys(state.presence.presenceState());
      renderUsers(); refreshHeadStatus();
    })
    .subscribe((status) => { if (status === 'SUBSCRIBED') state.presence.track({ at: Date.now() }); });
}

function renderTicks() {
  const r = activeRoom(); if (!r) return;
  document.querySelectorAll('#messages .msg.mine').forEach((el) => {
    const m = state.messages.find((x) => String(x.id) === el.dataset.mid);
    const t = el.querySelector('.foot .tick'); if (!m || !t) return;
    const read = readByAll(m, r);
    if (read !== t.classList.contains('read')) {
      t.classList.toggle('read', read);
      t.innerHTML = ic(read ? 'check2' : 'check', 'xs');
      t.title = read ? 'Lida' : 'Enviada';
    }
  });
}

// "digitando…": Broadcast em canal privado da sala (nada é gravado no banco)
function joinRoomChannel(id) {
  if (state.roomChannel) { sb.removeChannel(state.roomChannel); state.roomChannel = null; }
  if (!id) return;
  const ch = sb.channel(`sc-room:${id}`, { config: { private: true, broadcast: { self: false } } });
  ch.on('broadcast', { event: 'typing' }, ({ payload }) => {
    if (!payload || payload.user_id === state.me.id) return;
    state.typing[payload.user_id] = { room: id, until: Date.now() + 3500 };
    refreshHeadStatus();
    setTimeout(refreshHeadStatus, 3600);
  }).subscribe();
  state.roomChannel = ch;
}
let _lastTyping = 0;
function sendTyping() {
  if (!state.roomChannel || Date.now() - _lastTyping < 2500 || !$('#input').value) return;
  _lastTyping = Date.now();
  state.roomChannel.send({ type: 'broadcast', event: 'typing', payload: { user_id: state.me.id } });
}

let _hiddenAt = 0;
document.addEventListener('visibilitychange', async () => {
  if (document.hidden) { _hiddenAt = Date.now(); return; }
  if (!state.me) return;
  if (!state.locked && _hiddenAt && Date.now() - _hiddenAt > LOCK_MS) { lockApp('inatividade'); return; }
  if (state.locked) return;
  try {
    await loadRooms(); renderRooms();
    if (state.active) { state.unread[state.active] = 0; markReadSoon(state.active); }
  } catch { /* ignora */ }
});

function updateAppBadge() {
  const total = Object.values(state.unread).reduce((a, b) => a + (b || 0), 0);
  if ('setAppBadge' in navigator) { (total ? navigator.setAppBadge(total) : navigator.clearAppBadge()).catch(() => {}); }
  document.title = total ? `(${total}) Chat Seguro` : 'Chat Seguro';
}

function startCountdown() {
  setInterval(() => {
    document.querySelectorAll('[data-expire]').forEach((n) => { n.textContent = fmtTTL(+n.dataset.expire); });
  }, 1000);
  setInterval(() => { if (state.me) renderRooms(); }, 60000);
}

function setUsers(list) {
  state.users = list || [];
  for (const u of state.users) state.profiles[u.id] = u;
}

// ---------------------------------------------------------------- PWA: instalar e notificar
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register(BASE + 'sw.js', { scope: BASE }).catch(() => {}); });
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'open-room' && e.data.room_id && state.me) selectRoom(e.data.room_id);
  });
}
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); state.installPrompt = e; updateBanner(); });
window.addEventListener('appinstalled', () => { state.installPrompt = null; updateBanner(); toast('SecureChat instalado'); });

async function promptInstall() {
  if (state.installPrompt) {
    state.installPrompt.prompt();
    await state.installPrompt.userChoice.catch(() => {});
    state.installPrompt = null; updateBanner();
  } else if (isIOS()) {
    toast('No Safari: toque em Compartilhar e depois em "Adicionar à Tela de Início"');
  } else toast('Use o menu do navegador > "Instalar app"');
}

function b64ToU8(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function setupPush(interactive) {
  if (!pushSupported() || !CFG.VAPID_PUBLIC_KEY) {
    if (interactive) toast(isIOS() && !isStandalone()
      ? 'No iPhone, primeiro instale o app na Tela de Início; depois ative as notificações por ele.'
      : 'Este navegador não suporta notificações.');
    return false;
  }
  if (Notification.permission === 'denied') {
    if (interactive) toast('Notificações bloqueadas: libere nas configurações do navegador/celular.');
    return false;
  }
  try {
    if (Notification.permission !== 'granted') {
      if (!interactive) return false;
      if (await Notification.requestPermission() !== 'granted') { updateBanner(); return false; }
    }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(CFG.VAPID_PUBLIC_KEY) });
    const j = sub.toJSON();
    const { error } = await sb.from('sc_push_subscriptions')
      .upsert({ user_id: state.me.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: 'endpoint' });
    if (error) throw error;
    if (interactive) toast('Notificações ativadas');
    updateBanner();
    return true;
  } catch (e) {
    if (interactive) toast('Não foi possível ativar: ' + errMsg(e));
    return false;
  }
}

function updateMenu() {
  const n = $('#m-notify'); const i = $('#m-install'); const s = $('#m-security');
  if (n) n.hidden = pushSupported() && Notification.permission === 'granted';
  if (i) i.hidden = isStandalone() || !(state.installPrompt || isIOS());
  if (s) s.hidden = !state.isAdmin;
}

function updateBanner() {
  const b = $('#banner'); if (!b) return;
  const dismissed = (k) => localStorage.getItem('sc-dismiss-' + k) === '1';
  let html = '', kind = '';
  if (false) {   // embutido no sistema: instalação fica para o site principal
    kind = 'install';
    html = state.installPrompt
      ? `<div class="bic">${ic('download', 'sm')}</div><div class="btxt"><b>Instale o Chat Seguro</b>Abre em tela cheia e protege suas chaves de criptografia.</div><button class="bact" data-a="install">Instalar</button>`
      : `<div class="bic">${ic('download', 'sm')}</div><div class="btxt"><b>Instale no iPhone</b>Compartilhar → "Adicionar à Tela de Início". Sem instalar, o iPhone pode apagar suas chaves (e o histórico) após 7 dias sem uso.</div>`;
  } else if (pushSupported() && CFG.VAPID_PUBLIC_KEY && Notification.permission === 'default' && !dismissed('notify')
             && (!isIOS() || isStandalone())) {
    kind = 'notify';
    html = `<div class="bic">${ic('chat-plus', 'sm')}</div><div class="btxt"><b>Ative as notificações</b>Saiba na hora quando chegar mensagem.</div><button class="bact" data-a="notify">Ativar</button>`;
  }
  if (!kind) { b.hidden = true; b.innerHTML = ''; return; }
  b.innerHTML = html + `<button class="bx" data-a="close" title="Dispensar">${ic('x', 'sm')}</button>`;
  b.hidden = false;
  b.onclick = (e) => {
    const a = e.target.closest('button') && e.target.closest('button').dataset.a;
    if (a === 'install') promptInstall();
    if (a === 'notify') setupPush(true);
    if (a === 'close') { localStorage.setItem('sc-dismiss-' + kind, '1'); updateBanner(); }
  };
}

// ---------------------------------------------------------------- monitor de segurança (alertas)
// Textos honestos: descrevem o que o navegador observou — nunca "o usuário tirou print".
const ALERT_INFO = {
  screenshot_attempt: {
    me: 'Atalho PrintScreen recebido pela página. Registrado (não prova captura nativa).',
    other: 'acionou um atalho PrintScreen recebido pela página',
    icon: 'camera',
  },
  capture_shortcut: {
    me: 'Atalho de captura recebido pela página. Registrado.',
    other: 'acionou um atalho de captura recebido pela página',
    icon: 'camera',
  },
  print_attempt: { me: 'Atalho de impressão detectado e bloqueado.', other: 'utilizou um atalho de impressão', icon: 'file' },
  copy_attempt: { me: 'Tentativa de cópia detectada e bloqueada.', other: 'tentou copiar conteúdo protegido desta conversa', icon: 'file' },
  cut_attempt: { me: 'Tentativa de recorte detectada e bloqueada.', other: 'tentou recortar conteúdo protegido desta conversa', icon: 'file' },
  paste_detected: { me: null, other: 'realizou uma colagem no campo de mensagem', icon: 'file' },
  visibility_hidden: {
    me: 'Conteúdo protegido ocultado por perda de visibilidade.',
    other: 'ocultou o conteúdo protegido por perda de visibilidade',
    icon: 'shield',
  },
  image_opened: { me: null, other: 'abriu uma imagem/conteúdo confidencial', icon: 'once' },
  view_expired: { me: null, other: 'encerrou a visualização de conteúdo protegido', icon: 'once' },
  reopen_denied: { me: 'Tentativa de reabertura recusada pelo servidor.', other: 'tentou reabrir um conteúdo cuja visualização já havia expirado', icon: 'once' },
  devtools_open: { me: 'Ferramentas de desenvolvedor detectadas (heurística). Atividade registrada.', other: 'abriu ferramentas de desenvolvedor (heurística)', icon: 'shield' },
  long_press: { me: null, other: 'segurou conteúdo de uma visão (possível tentativa de salvar)', icon: 'once' },
  context_menu: { me: null, other: null, icon: 'shield' },
  selection_attempt: { me: null, other: null, icon: 'shield' },
  new_device: { me: null, other: null, icon: 'shield' },
};
const _alertLast = {};

// chamado pelo bloco de proteções: avisa quem fez, grava via RPC (autor = auth.uid()) e avisa a conversa
window.onSecurityEvent = (type, severity, extra = {}) => {
  const info = ALERT_INFO[type] || {};
  if (info.me) toast(info.me);
  if (!state.me || !sb) return;
  const now = Date.now();
  const key = type + ':' + (extra.message_id || '');
  if (_alertLast[key] && now - _alertLast[key] < 30000) return;
  _alertLast[key] = now;
  const room = state.locked ? null : activeRoom();
  sb.rpc('sc_report_client_event', {
    p_room: room ? room.id : null,
    p_type: type,
    p_severity: severity,
    p_message_id: extra.message_id || null,
    p_meta: extra.meta || null,
  }).then(({ data }) => {
    if (data && room && severity !== 'low' && info.other) {
      addAlert({
        id: data, room_id: room.id, user_id: state.me.id, alert_type: type, severity,
        source: 'client_reported', reliability: 'observed', created_at: new Date().toISOString(),
      });
    }
  }, () => {});
};

function addAlert(a) {
  if (state.alerts.some((x) => x.id === a.id)) return;
  state.alerts.push(a);
  renderMessages();
}

function alertNode(a) {
  const info = ALERT_INFO[a.alert_type] || {};
  const mine = a.user_id === state.me.id;
  const who = mine ? 'Você' : esc((state.profiles[a.user_id] || {}).display_name || 'Alguém');
  const proven = a.source === 'server_proven' || a.reliability === 'proven';
  const tag = proven ? ' · confirmado pelo servidor' : ' · observado no navegador';
  const s = document.createElement('div'); s.className = 'sys alert ' + (a.severity || 'medium');
  s.innerHTML = `${ic(info.icon || 'shield', 'xs')} ${who} ${esc(info.other || 'registrou um evento de segurança')}${esc(tag)} · ${fmtClock(toEpoch(a.created_at))}`;
  return s;
}

function onRemoteAlert(a) {
  if (!a) return;
  if (a.user_id === state.me.id) {
    if (a.alert_type === 'new_device') { toast('Alerta: um novo aparelho entrou na sua conta.'); beep(); }
    return;
  }
  // informativos de baixa severidade (ex.: abertura autorizada) aparecem na conversa sem toast/alarme
  const info = ALERT_INFO[a.alert_type] || {};
  if (a.room_id === state.active && !state.locked && info.other) addAlert(a);
  if (a.severity === 'low') return;
  const r = state.rooms.find((x) => x.id === a.room_id);
  const who = (state.profiles[a.user_id] || {}).display_name || 'Alguém';
  if (!state.locked && info.other) {
    toast(`⚠ ${who} ${info.other}${r && r.id !== state.active ? ' em ' + roomName(r) : ''}`);
    beep();
  }
}

// som curto de alerta (gerado na hora; sem arquivo de áudio)
let _audio = null;
function beep() {
  try {
    _audio = _audio || new (window.AudioContext || window.webkitAudioContext)();
    const t = _audio.currentTime;
    [0, 0.18].forEach((d, i) => {
      const o = _audio.createOscillator(); const g = _audio.createGain();
      o.frequency.value = i ? 660 : 880; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.18, t + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.15);
      o.connect(g).connect(_audio.destination); o.start(t + d); o.stop(t + d + 0.16);
    });
  } catch { /* sem áudio */ }
}

// ---------------------------------------------------------------- imagens em canvas + marca d'água nos pixels
async function drawToCanvas(cv, src, maxSide) {
  const img = new Image(); img.decoding = 'async'; img.src = src;
  await img.decode();
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  watermarkCanvas(ctx, w, h);
  cv.draggable = false;
}
function watermarkCanvas(ctx, w, h) {
  if (!state.me) return;
  const txt = `${state.me.display_name} · @${state.me.username} · ${new Date().toLocaleString('pt-BR')}`;
  const size = Math.max(11, Math.round(Math.min(w, h) / 22));
  ctx.save();
  ctx.font = `600 ${size}px system-ui, sans-serif`;
  ctx.translate(w / 2, h / 2); ctx.rotate(-Math.PI / 7);
  const step = ctx.measureText(txt).width + size * 3;
  for (let y = -h; y < h; y += size * 4) {
    for (let x = -w * 1.2; x < w * 1.2; x += step) {
      ctx.globalAlpha = 0.22; ctx.fillStyle = '#000'; ctx.fillText(txt, x + 1, y + 1);
      ctx.globalAlpha = 0.16; ctx.fillStyle = '#fff'; ctx.fillText(txt, x, y);
    }
  }
  ctx.restore();
}

// remove EXIF/GPS/modelo da câmera recodificando a imagem (JPEG, PNG, WebP)
async function stripMetadata(file) {
  const raw = () => file.arrayBuffer().then((b) => ({ bytes: new Uint8Array(b), stripped: false, type: file.type }));
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || !window.createImageBitmap) return raw();
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
    c.getContext('2d').drawImage(bmp, 0, 0);
    if (bmp.close) bmp.close();
    const blob = await new Promise((res) => c.toBlob(res, file.type, 0.92));
    if (!blob) return raw();
    return { bytes: new Uint8Array(await blob.arrayBuffer()), stripped: true, type: blob.type || file.type };
  } catch { return raw(); }
}

// ---------------------------------------------------------------- identificação do aparelho
async function sha256hex(str) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function deviceFingerprint(pub) {
  const parts = [pub, navigator.userAgent, navigator.language, (navigator.languages || []).join(','),
    screen.width, screen.height, screen.colorDepth, new Date().getTimezoneOffset(), navigator.hardwareConcurrency || 0];
  return (await sha256hex(parts.join('|'))).slice(0, 32);
}
function deviceLabel() {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Outro';
  const br = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
  return `${br} · ${os}${isStandalone() ? ' (app)' : ''}`;
}

// ---------------------------------------------------------------- bloqueio automático + PIN
let lastAct = Date.now();
function markActive() {
  lastAct = Date.now();
  if (!state.locked) localStorage.setItem('sc-last-active', String(lastAct));
}
function startIdleWatch() {
  let t = 0;
  const bump = () => { if (Date.now() - t > 5000) { t = Date.now(); markActive(); } };
  ['pointerdown', 'keydown', 'touchstart', 'wheel', 'mousemove'].forEach((ev) =>
    document.addEventListener(ev, bump, { passive: true, capture: true }));
  setInterval(checkIdle, 10000);
}
function checkIdle() {
  if (state.me && !state.locked && Date.now() - lastAct > LOCK_MS) lockApp('inatividade');
}

const pinKey = () => `sc-pin-${state.me.id}`;
const getPin = () => JSON.parse(localStorage.getItem(pinKey()) || 'null');
async function pinHash(pin, saltB64, iter) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: E2EE.unb64(saltB64), iterations: iter }, base, 256);
  return E2EE.b64(new Uint8Array(bits));
}

function lockApp(reason) {
  if (!state.me || state.locked) return;
  state.locked = true;
  localStorage.setItem('sc-locked', '1');
  // tira o conteúdo decifrado da tela e da memória
  document.querySelectorAll('.viewer, .sheet-wrap, #modal').forEach((o) => o.remove());
  Object.values(state.blobs).forEach((u) => URL.revokeObjectURL(u));
  state.blobs = {}; state.previews = {}; state.alerts = []; state.receipts = [];
  if (state.active) leaveRoom(); else { state.messages = []; renderRooms(); }
  closeDrawer();
  sb.rpc('sc_audit_client_event', { p_action: 'lock' }).then(() => {}, () => {});
  renderLock(reason);
}

function renderLock(reason) {
  let o = document.getElementById('applock');
  if (!o) { o = document.createElement('div'); o.id = 'applock'; document.body.appendChild(o); }
  const pin = getPin();
  const usePin = pin && (pin.fails || 0) < 5;
  o.innerHTML = `<div class="applock-box">
    <div class="lock-ic">${ic('lock')}</div>
    <h2>Chat Seguro bloqueado</h2>
    <p>${reason === 'inatividade' ? 'Bloqueado por inatividade. ' : ''}${usePin ? 'Digite seu PIN.' : `Digite a senha de <b>${esc(state.me.username)}</b>.`}</p>
    <input id="lk-input" type="password" ${usePin ? 'inputmode="numeric" maxlength="8" autocomplete="off" placeholder="PIN"' : 'autocomplete="current-password" placeholder="Senha"'}>
    <div class="err" id="lk-err"></div>
    <button class="btn" id="lk-go">Desbloquear</button>
    <div class="applock-links">${usePin ? '<a id="lk-pass">Usar senha</a> · ' : ''}<a id="lk-out">Sair</a></div>
  </div>`;
  const go = () => unlockApp($('#lk-input').value, usePin);
  $('#lk-go').addEventListener('click', go);
  $('#lk-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  if ($('#lk-pass')) $('#lk-pass').addEventListener('click', () => { const p = getPin(); p.fails = 5; localStorage.setItem(pinKey(), JSON.stringify(p)); renderLock(); });
  $('#lk-out').addEventListener('click', () => logout(false));
  setTimeout(() => $('#lk-input')?.focus(), 50);
}

async function unlockApp(value, usePin) {
  const err = $('#lk-err'); err.textContent = '';
  if (!value) return;
  const btn = $('#lk-go'); btn.disabled = true;
  try {
    if (usePin) {
      const p = getPin();
      if (await pinHash(value, p.salt, p.iter) !== p.hash) {
        p.fails = (p.fails || 0) + 1; localStorage.setItem(pinKey(), JSON.stringify(p));
        if (p.fails >= 5) { toast('PIN errado 5 vezes: use a senha.'); renderLock(); return; }
        err.textContent = `PIN incorreto (${5 - p.fails} tentativas restantes).`; return;
      }
      p.fails = 0; localStorage.setItem(pinKey(), JSON.stringify(p));
    } else {
      const error = await verifyPassword(value);
      if (error) { err.textContent = errMsg(error); return; }
      const p = getPin(); if (p && p.fails) { p.fails = 0; localStorage.setItem(pinKey(), JSON.stringify(p)); }
    }
    state.locked = false;
    localStorage.removeItem('sc-locked');
    document.getElementById('applock')?.remove();
    markActive();
    sb.rpc('sc_audit_client_event', { p_action: 'unlock' }).then(() => {}, () => {});
    await loadRooms().catch(() => {}); renderRooms();
  } finally { if (btn) btn.disabled = false; }
}

function openPinModal() {
  const has = !!getPin();
  const m = document.createElement('div'); m.id = 'modal';
  m.innerHTML = `<div class="modal-box">
    <h3>Bloqueio com PIN</h3>
    <p class="desc">O app bloqueia sozinho depois de 5 minutos sem uso (e ao reabrir). Com PIN, você desbloqueia mais rápido;
      sem PIN, pede a senha da conta. Depois de 5 PINs errados, só a senha desbloqueia.</p>
    ${has ? '' : `<div class="field"><label>Novo PIN (4 a 8 números)</label><input id="pn-1" type="password" inputmode="numeric" maxlength="8"></div>
    <div class="field"><label>Repita o PIN</label><input id="pn-2" type="password" inputmode="numeric" maxlength="8"></div>`}
    <div class="err" id="pn-err"></div>
    <div class="modal-actions"><button class="btn ghost sm" id="pn-x">Fechar</button>
      <button class="btn sm" id="pn-go">${has ? 'Remover PIN' : 'Salvar PIN'}</button></div></div>`;
  document.body.appendChild(m);
  $('#pn-x').addEventListener('click', () => m.remove());
  $('#pn-go').addEventListener('click', async () => {
    if (has) {
      localStorage.removeItem(pinKey()); m.remove(); toast('PIN removido');
      sb.rpc('sc_audit_client_event', { p_action: 'pin_removed' }).then(() => {}, () => {});
      return;
    }
    const a = $('#pn-1').value, b = $('#pn-2').value;
    if (!/^\d{4,8}$/.test(a)) { $('#pn-err').textContent = 'Use de 4 a 8 números.'; return; }
    if (a !== b) { $('#pn-err').textContent = 'Os PINs não conferem.'; return; }
    const salt = E2EE.b64(crypto.getRandomValues(new Uint8Array(16))); const iter = 310000;
    localStorage.setItem(pinKey(), JSON.stringify({ salt, iter, hash: await pinHash(a, salt, iter), fails: 0 }));
    m.remove(); toast('PIN salvo');
    sb.rpc('sc_audit_client_event', { p_action: 'pin_set' }).then(() => {}, () => {});
  });
}

// ---------------------------------------------------------------- sair (mantendo ou apagando o aparelho)
function openLogoutSheet() {
  const w = document.createElement('div'); w.className = 'sheet-wrap';
  w.innerHTML = `<div class="sheet">
    <button data-a="keep">${ic('logout', 'sm')} Sair (manter as chaves neste aparelho)</button>
    <button class="danger" data-a="wipe">${ic('trash', 'sm')} Sair e apagar tudo deste aparelho</button>
    <button data-a="x">${ic('x', 'sm')} Cancelar</button></div>`;
  w.addEventListener('click', (e) => {
    const a = e.target.closest('button') && e.target.closest('button').dataset.a;
    if (e.target === w || a === 'x') { w.remove(); return; }
    w.remove();
    if (a === 'keep') logout(false);
    if (a === 'wipe') confirmWipe();
  });
  document.body.appendChild(w);
}
function confirmWipe() {
  const m = document.createElement('div'); m.id = 'modal';
  m.innerHTML = `<div class="modal-box"><h3>Apagar tudo deste aparelho?</h3>
    <p class="desc">A chave de criptografia deste aparelho será destruída e revogada. As conversas antigas
    <b>não poderão mais ser lidas aqui</b>, nem se você entrar de novo. Isso não pode ser desfeito.</p>
    <div class="modal-actions"><button class="btn ghost sm" id="wp-x">Cancelar</button>
    <button class="btn sm danger-btn" id="wp-go">Apagar e sair</button></div></div>`;
  document.body.appendChild(m);
  $('#wp-x').addEventListener('click', () => m.remove());
  $('#wp-go').addEventListener('click', () => { m.remove(); logout(true); });
}
async function wipeDevice() {
  try { localStorage.clear(); sessionStorage.clear(); } catch { /* ignora */ }
  await new Promise((res) => {
    const r = indexedDB.deleteDatabase('securechat-e2ee');
    r.onsuccess = r.onerror = r.onblocked = () => res();
  });
  try {
    if (indexedDB.databases) {
      for (const d of await indexedDB.databases()) if (d.name) indexedDB.deleteDatabase(d.name);
    }
  } catch { /* ignora */ }
  try { if ('caches' in window) for (const k of await caches.keys()) await caches.delete(k); } catch { /* ignora */ }
}

// ---------------------------------------------------------------- aparelhos conectados
async function openDevices() {
  const { data, error } = await sb.from('sc_session_devices').select('id,label,ip,first_seen,last_seen,revoked_at,public_key')
    .order('last_seen', { ascending: false });
  if (error) { toast(errMsg(error)); return; }
  const rows = (data || []).map((d) => {
    const me = d.public_key === state.device.pub;
    return `<div class="dev-row ${d.revoked_at ? 'revoked' : ''}">
      <div class="dev-ic">${ic(/iPhone|Android/.test(d.label || '') ? 'image' : 'file', 'sm')}</div>
      <div class="dev-meta"><div class="dev-name">${esc(d.label || 'Aparelho')} ${me ? '<span class="tag">este aparelho</span>' : ''}${d.revoked_at ? '<span class="tag off">desconectado</span>' : ''}</div>
      <div class="dev-sub">Visto por último: ${esc(new Date(d.last_seen).toLocaleString('pt-BR'))}${d.ip ? ' · IP ' + esc(d.ip) : ''}</div></div></div>`;
  }).join('');
  const m = document.createElement('div'); m.id = 'modal';
  m.innerHTML = `<div class="modal-box wide"><h3>Aparelhos conectados</h3>
    <p class="desc">Se algum aparelho não for seu, desconecte todos os outros e troque a senha.</p>
    <div class="dev-list">${rows || '<p class="hint">Nenhum aparelho registrado.</p>'}</div>
    <div class="modal-actions"><button class="btn ghost sm" id="dv-x">Fechar</button>
    <button class="btn sm danger-btn" id="dv-out">Desconectar todos os outros</button></div></div>`;
  document.body.appendChild(m);
  $('#dv-x').addEventListener('click', () => m.remove());
  $('#dv-out').addEventListener('click', async () => {
    try {
      const { data: n, error: e1 } = await sb.rpc('sc_revoke_other_devices', { p_keep_key: state.device.pub });
      if (e1) throw e1;
      await signOutOthers();
      m.remove(); toast(`${n || 0} aparelho(s) desconectado(s). Troque a senha se suspeitar de invasão.`);
    } catch (e) { toast(errMsg(e)); }
  });
}

// ---------------------------------------------------------------- atividade da conta (log de auditoria)
const AUDIT_LABEL = {
  login: 'Entrou na conta', logout: 'Saiu da conta', message_sent: 'Enviou mensagem', once_opened: 'Abriu mensagem de uma visão',
  message_deleted: 'Apagou mensagem', security_alert: 'Alerta de segurança', device_key_registered: 'Nova chave de aparelho',
  devices_revoked: 'Desconectou outros aparelhos', device_revoked: 'Revogou este aparelho', room_deleted: 'Apagou conversa',
  lock: 'App bloqueado', unlock: 'App desbloqueado', wipe_device: 'Apagou os dados de um aparelho', pin_set: 'Criou PIN',
  pin_removed: 'Removeu PIN', rate_limit_blocked: 'Envio bloqueado por excesso',
};
const AUDIT_DETAIL = {
  copy_attempt: 'cópia', cut_attempt: 'recorte', paste_detected: 'colagem',
  screenshot_attempt: 'atalho PrintScreen', capture_shortcut: 'atalho de captura',
  print_attempt: 'impressão/PDF', devtools_open: 'ferramentas de desenvolvedor',
  visibility_hidden: 'perda de visibilidade', image_opened: 'abertura de conteúdo protegido',
  view_expired: 'fim de visualização', reopen_denied: 'reabertura recusada',
  long_press: 'toque longo em uma visão', new_device: 'novo aparelho', context_menu: 'menu bloqueado', selection_attempt: 'seleção',
  text: 'texto', file: 'arquivo', once: 'uma visão', temp: 'temporária', direct: 'privada',
};
async function openAudit() {
  const { data, error } = await sb.from('sc_audit_log').select('id,action,room_id,metadata,ip,created_at')
    .order('id', { ascending: false }).limit(60);
  if (error) { toast(errMsg(error)); return; }
  const rows = (data || []).map((r) => `<div class="audit-row"><div><b>${esc(AUDIT_LABEL[r.action] || r.action)}</b>${
    (() => { const t = r.metadata && (r.metadata.type || r.metadata.kind); return t ? ' · ' + esc(AUDIT_DETAIL[t] || t) : ''; })()}</div>
    <div class="dev-sub">${esc(new Date(r.created_at).toLocaleString('pt-BR'))}${r.ip ? ' · IP ' + esc(r.ip) : ''}</div></div>`).join('');
  const m = document.createElement('div'); m.id = 'modal';
  m.innerHTML = `<div class="modal-box wide"><h3>Atividade da conta</h3>
    <p class="desc">Registro imutável, encadeado por hash: se alguém alterar ou apagar um item, a verificação acusa.
    Nunca contém o conteúdo das mensagens.</p>
    <div class="dev-list">${rows || '<p class="hint">Nada registrado ainda.</p>'}</div>
    <div class="err" id="au-res"></div>
    <div class="modal-actions"><button class="btn ghost sm" id="au-x">Fechar</button>
    <button class="btn sm" id="au-check">Verificar integridade</button></div></div>`;
  document.body.appendChild(m);
  $('#au-x').addEventListener('click', () => m.remove());
  $('#au-check').addEventListener('click', async () => {
    const res = $('#au-res');
    const r = await verifyAudit();
    res.className = r.ok ? 'safety-ok' : 'err';
    res.textContent = r.ok ? `Cadeia íntegra: ${r.count} registro(s) conferido(s).` : `Cadeia quebrada no registro #${r.at}: o log foi alterado.`;
  });
}
async function verifyAudit() {
  const { data, error } = await sb.from('sc_audit_log').select('id,payload,prev_hash,hash').order('id', { ascending: true }).limit(5000);
  if (error) throw error;
  let prev = null;
  for (const row of data || []) {
    if ((row.prev_hash || null) !== prev) return { ok: false, at: row.id };
    if (await sha256hex((prev || '') + '|' + row.payload) !== row.hash) return { ok: false, at: row.id };
    prev = row.hash;
  }
  return { ok: true, count: (data || []).length };
}

// ---------------------------------------------------------------- apagar conversa inteira (com senha)
function openDeleteRoom(r) {
  const m = document.createElement('div'); m.id = 'modal';
  m.innerHTML = `<div class="modal-box"><h3>${r.type === 'temp' ? 'Encerrar conversa agora?' : 'Apagar conversa para os dois?'}</h3>
    <p class="desc">Todas as mensagens e arquivos de <b>${esc(roomName(r))}</b> serão apagados do servidor para todos os participantes.
    Isso não pode ser desfeito. Confirme com sua senha.</p>
    <div class="field"><label>Senha</label><input id="dr-pass" type="password" autocomplete="current-password"></div>
    <div class="err" id="dr-err"></div>
    <div class="modal-actions"><button class="btn ghost sm" id="dr-x">Cancelar</button>
    <button class="btn sm danger-btn" id="dr-go">Apagar</button></div></div>`;
  document.body.appendChild(m);
  $('#dr-x').addEventListener('click', () => m.remove());
  setTimeout(() => $('#dr-pass')?.focus(), 30);
  $('#dr-go').addEventListener('click', async () => {
    const password = $('#dr-pass').value; if (!password) return;
    try {
      const session = { access_token: await getToken() };
      const res = await fetch('/api/chat-delete-room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, apikey: CFG.SUPABASE_ANON_KEY },
        body: JSON.stringify({ room_id: r.id, password }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { $('#dr-err').textContent = d.error === 'senha incorreta' ? 'Senha incorreta.' : (d.error || 'Não foi possível apagar.'); return; }
      m.remove();
      state.rooms = state.rooms.filter((x) => x.id !== r.id);
      if (state.active === r.id) { if (history.state && history.state.room) history.back(); leaveRoom(); }
      renderRooms(); toast('Conversa apagada para todos');
    } catch (e) { $('#dr-err').textContent = errMsg(e); }
  });
}

// ---------------------------------------------------------------- navegação (botão voltar do Android)
window.addEventListener('popstate', (e) => {
  const st = e.state || {};
  const overlays = [...document.querySelectorAll('.viewer, .sheet-wrap, #modal')];
  if (overlays.length && !st.overlay) { overlays.forEach((o) => o.remove()); return; }   // fechou só o menu
  if (!st.drawer) closeDrawer();
  if (!st.room && state.active && isMobile()) leaveRoom();
});

// ---------------------------------------------------------------- boot (dentro do sistema)
let _booted = false;
async function boot() {
  if (!CONFIGURED) { renderConfigWarn(); return; }
  if (!E2EE) { renderConfigWarn('O módulo de criptografia não carregou.'); return; }
  try {
    const { data: join, error: joinErr } = await sb.rpc('sc_join');
    if (joinErr) {
      if (/sc_join|function .* does not exist|schema cache/i.test(joinErr.message || '')) {
        renderConfigWarn('O banco ainda não tem as tabelas do Chat Seguro. Rode alimentacao-app/supabase/migrations/20261127_chat_seguro.sql no Supabase do Nerites.');
      } else if (/sem acesso/i.test(joinErr.message || '')) {
        renderConfigWarn('Você não tem acesso ao Chat Seguro. Peça ao administrador para liberar em /admin.');
      } else throw joinErr;
      return;
    }
    const { data: profs, error: dirErr } = await sb.rpc('sc_directory');
    if (dirErr) throw dirErr;
    const uid = BRIDGE.userId;
    const meRow = (profs || []).find((p) => p.id === uid) || { id: uid, display_name: BRIDGE.nome || 'Você', username: (BRIDGE.email || '').split('@')[0] };
    state.me = { ...meRow, username: meRow.username || (BRIDGE.email || '').split('@')[0] };
    setUsers(profs);
    try { await initDevice(uid); } catch (e) {
      renderConfigWarn('Este navegador não conseguiu criar as chaves de criptografia (' + errMsg(e) + '). Atualize o navegador ou use Chrome/Safari recentes.');
      return;
    }
    state.isAdmin = !!(join && join.admin);
    sb.rpc('sc_touch_activity').then(() => {}, () => {});
    sb.rpc('sc_audit_client_event', { p_action: 'chat_open' }).then(() => {}, () => {});
    await loadRooms();
    renderChat();
    subscribeRealtime();
    drawWatermark();
    if (!_booted) { startCountdown(); startIdleWatch(); _booted = true; }
    const last = +localStorage.getItem('sc-last-active') || 0;
    if (localStorage.getItem('sc-locked') === '1' || (last && Date.now() - last > LOCK_MS)) { lockApp('inatividade'); return; }
    markActive();
    setupPush(false);
    const q = new URLSearchParams(location.search).get('room');
    if (q) { history.replaceState(null, '', location.pathname); selectRoom(q); }
  } catch (e) {
    renderConfigWarn('Não foi possível abrir o Chat Seguro: ' + errMsg(e));
  }
}

// a página do sistema manda a configuração e o token; depois, tokens renovados
window.addEventListener('message', (ev) => {
  if (ev.origin !== location.origin || ev.source !== window.parent) return;
  const d = ev.data || {};
  if (d.type === 'chat-config' && !CONFIGURED) {
    CFG.SUPABASE_URL = d.url; CFG.SUPABASE_ANON_KEY = d.anon; CFG.VAPID_PUBLIC_KEY = d.vapid || '';
    BRIDGE.email = d.email || ''; BRIDGE.nome = d.nome || ''; BRIDGE.userId = d.userId || '';
    setToken(d.token);
    if (!d.url || !d.anon || !window.supabase) { renderConfigWarn(); return; }
    sb = window.supabase.createClient(d.url, d.anon, { accessToken: () => getToken() });
    sb.realtime.setAuth(d.token);
    CONFIGURED = true;
    boot();
  } else if (d.type === 'chat-token') {
    setToken(d.token);
  } else if (d.type === 'chat-open-room' && d.room_id && state.me) {
    selectRoom(d.room_id);
  }
});
if (window.parent === window) renderAuth(); else bridgeSend({ type: 'chat-pronto' });

// botão "Abrir" de uma-visão
document.addEventListener('click', (e) => {
  const b = e.target.closest('.msg.pending .open-once');
  if (b) { e.preventDefault(); revealOnce(b.closest('.msg').dataset.mid); }
});

