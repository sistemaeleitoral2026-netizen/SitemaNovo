// Supabase falso (com criptografia REAL das mensagens de exemplo), só para testar a interface.
(function () {
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  const P = {
    u1: { id: 'u1', username: 'ana.souza', display_name: 'Ana Souza' },
    u2: { id: 'u2', username: 'bruno.lima', display_name: 'Bruno Lima' },
    u3: { id: 'u3', username: 'carla.dias', display_name: 'Carla Dias' },
  };
  const rooms = [
    { id: 1, type: 'global', name: 'Sala Geral', members: ['u1', 'u2', 'u3'], created_at: now - 864e5 * 3 },
    { id: 2, type: 'direct', name: null, members: ['u1', 'u2'], created_at: now - 864e5 * 2 },
    { id: 3, type: 'temp', name: 'Projeto Sigilo', members: ['u1', 'u2', 'u3'], created_at: now - 36e5, expires_at: now + 864e5 - 36e5 },
  ];
  const readAt = {};               // `${room}|${user}` -> epoch ms
  const registry = [];             // {user_id, public_key, revoked}
  const msgs = []; const secrets = {}; const store = {};
  let mid = 100; let seeded = null;
  let session = localStorage.getItem('mock-session') ? { user: { id: 'u1' }, access_token: 'tok' } : null;
  const handlers = []; const typingHandlers = [];
  const ok = (data) => Promise.resolve({ data, error: null });
  window.__mock = { msgs, secrets, store, registry };

  function emit(ev, table, payload) {
    setTimeout(() => handlers.forEach((h) => h.ev === ev && h.table === table && h.cb(payload)), 120);
  }
  function lastRow(roomId) { const rm = msgs.filter((m) => m.room_id === roomId); return rm[rm.length - 1]; }
  function roomJSON(r) {
    const last = lastRow(r.id);
    return {
      id: r.id, type: r.type, name: r.name, created_by: r.created_by || null, created_at: r.created_at / 1000, expires_at: r.expires_at ? r.expires_at / 1000 : null,
      members: r.members.map((u) => ({ ...P[u], last_read_at: (readAt[r.id + '|' + u] || r.created_at) / 1000 })),
      last_message: last ? { id: last.id, kind: last.kind, sender_id: last.sender_id, room_id: last.room_id, display_name: P[last.sender_id].display_name,
        created_at: Date.parse(last.created_at) / 1000, ciphertext: last.ciphertext, iv: last.iv, sender_key: last.sender_key, keys: last.keys } : null,
      unread: r.id === 3 ? 1 : 0,
    };
  }
  const blank = { ciphertext: null, iv: null, sender_key: null, keys: null, file_path: null };
  const receipts = [];
  function addReceipt(rc) { receipts.push(rc); emit('INSERT', 'once_receipts', { new: rc }); }
  const alerts = []; const devices = []; const audit = []; const consumed = {}; let aid = 0;
  const stats = []; // {day, user_id, alert_type, source, cnt}
  window.__mock.alerts = alerts; window.__mock.audit = audit; window.__mock.devices = devices;
  window.__mock.consumed = consumed; window.__mock.isAdmin = false;
  async function sha(t) { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join(''); }
  let auditChain = Promise.resolve();
  function doAudit(user, action, room, meta) {
    auditChain = auditChain.then(async () => {
      const prev = [...audit].reverse().find((r) => r.user_id === user);
      const ts = new Date().toISOString();
      const payload = [user, action, room == null ? '' : String(room), JSON.stringify(meta || {}), '', '', ts].join('|');
      const hash = await sha((prev ? prev.hash : '') + '|' + payload);
      audit.push({ id: ++aid, user_id: user, action, room_id: room, metadata: meta || null, ip: null, created_at: ts, payload, prev_hash: prev ? prev.hash : null, hash });
    });
    return auditChain;
  }

  // gera chaves de Bruno/Carla e cifra as mensagens de exemplo para a chave real do aparelho da Ana
  async function seed(anaPub) {
    const E = window.E2EE;
    const bruno = await E.generate(), carla = await E.generate(), anaOld = await E.generate();
    registry.push({ user_id: 'u2', public_key: bruno.pub }, { user_id: 'u3', public_key: carla.pub },
      { user_id: 'u1', public_key: anaOld.pub, revoked: true });
    const dev = { u2: bruno, u3: carla };
    const keysOf = (room) => registry.filter((k) => !k.revoked && rooms.find((r) => r.id === room).members.includes(k.user_id)).map((k) => k.public_key);
    async function add(room, sender, kind, obj, t, file, recips) {
      const aad = `sc1|${room}|${sender}|${kind}`;
      const d = sender === 'u1' ? anaOld : dev[sender];
      const { env, fileCipher } = await E.encrypt(d, recips || keysOf(room), obj, aad, file);
      const row = { id: ++mid, room_id: room, sender_id: sender, kind, ...blank, created_at: iso(t) };
      let path = null;
      if (fileCipher) { path = `${room}/${crypto.randomUUID()}`; store[path] = fileCipher; }
      if (kind === 'once') secrets[row.id] = { env, file_path: path };
      else Object.assign(row, { ciphertext: env.c, iv: env.iv, sender_key: env.sk, keys: env.keys, file_path: path });
      msgs.push(row);
    }
    const img = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="260"><defs><linearGradient id="g" x2="1" y2="1"><stop offset="0" stop-color="#3a7bd5"/><stop offset="1" stop-color="#00d2a8"/></linearGradient></defs><rect width="400" height="260" fill="url(#g)"/><circle cx="300" cy="70" r="30" fill="#ffe08a"/><path d="M0 260 120 130l80 80 60-50 140 100Z" fill="#14532d" opacity=".8"/></svg>');
    await add(1, 'u3', 'text', { t: 'text', body: 'Bom dia, pessoal!' }, now - 864e5 - 4e6);
    await add(1, 'u2', 'text', { t: 'text', body: 'Bom dia, Carla! Reunião às 10h?' }, now - 3e6);
    await add(2, 'u2', 'text', { t: 'text', body: 'Oi Ana, conseguiu ver o contrato?' }, now - 864e5 - 2e6);
    await add(2, 'u1', 'text', { t: 'text', body: 'mensagem do aparelho antigo' }, now - 864e5 - 1e6, null, [anaOld.pub, bruno.pub]);
    await add(2, 'u2', 'file', { t: 'file', name: 'escritorio.svg', mime: 'image/svg+xml', size: img.length }, now - 9e5, img);
    await add(2, 'u2', 'file', { t: 'file', name: 'contrato_final.pdf', mime: 'application/pdf', size: 2700 }, now - 8e5, new Uint8Array(2700));
    await add(2, 'u2', 'once', { t: 'text', body: 'Senha do cofre: 4471' }, now - 6e5);
    await add(2, 'u2', 'text', { t: 'text', body: 'Te mando a versão final hoje à tarde.' }, now - 5e5);
    await add(3, 'u2', 'text', { t: 'text', body: 'Essa conversa some em 24h.' }, now - 2e6);
    window.__mockIncoming = async (body) => { await add(3, 'u3', 'text', { t: 'text', body }, Date.now()); emit('INSERT', 'messages', { new: msgs[msgs.length - 1] }); };
  }

  function builder(table) {
    const q = { op: 'select', filters: [], ins: null, payload: null, single: false };
    const b = {
      select() { return b; }, order() { return b; }, limit() { return b; }, neq() { return b; }, is() { return b; },
      eq(k, v) { q.filters.push([k, v]); return b; },
      in(k, v) { q.ins = [k, v]; return b; },
      single() { q.single = true; return b; }, maybeSingle() { q.single = true; return b; },
      insert(p) { q.op = 'insert'; q.payload = p; return b; },
      upsert(p) { q.op = 'upsert'; q.payload = p; return b; },
      delete() { q.op = 'delete'; return b; },
      then(res, rej) { return run().then(res, rej); },
    };
    function run() {
      if (table === 'profiles') {
        const list = Object.values(P).filter((p) => q.filters.every(([k, v]) => p[k] === v));
        return ok(q.single ? list[0] || null : list);
      }
      if (table === 'security_alerts' && q.op === 'insert') {
        // INSERT direto bloqueado (como no RLS pós-003); use report_client_event
        return Promise.resolve({ data: null, error: { message: 'permission denied' } });
      }
      if (table === 'security_alerts') {
        const room = (q.filters.find(([k]) => k === 'room_id') || [])[1];
        return ok(alerts.filter((a) => a.room_id === room && a.severity !== 'low').slice().reverse());
      }
      if (table === 'once_receipts') {
        const room = (q.filters.find(([k]) => k === 'room_id') || [])[1];
        return ok(receipts.filter((r) => r.room_id === room).slice().reverse());
      }
      if (table === 'session_devices') return ok(devices.slice());
      if (table === 'audit_log') return auditChain.then(() => ({ data: audit.filter((r) => r.user_id === 'u1').slice().sort((a, b) => (window.__auditDesc ? b.id - a.id : a.id - b.id)), error: null }));
      if (table === 'key_registry') {
        return ok(registry.filter((k) => !k.revoked && (!q.ins || q.ins[1].includes(k.user_id))).map(({ user_id, public_key }) => ({ user_id, public_key })));
      }
      if (table === 'messages' && q.op === 'select') {
        const room = (q.filters.find(([k]) => k === 'room_id') || [])[1];
        return ok(msgs.filter((m) => m.room_id === room).slice().reverse());
      }
      if (table === 'messages' && q.op === 'insert') {
        const row = { id: ++mid, ...blank, ...q.payload, created_at: iso(Date.now()) };
        msgs.push(row); emit('INSERT', 'messages', { new: row }); doAudit(row.sender_id, 'message_sent', row.room_id, { kind: row.kind });
        window.__lastInsert = row;
        return ok(row);
      }
      return ok(null);
    }
    return b;
  }

  // Edge Function "reveal" simulada
  const realFetch = window.fetch.bind(window);
  window.fetch = async (url, opts) => {
    if (String(url).includes('/functions/v1/delete-room')) {
      const { room_id, password } = JSON.parse(opts.body);
      if (password !== 'senha123') return new Response(JSON.stringify({ error: 'senha incorreta' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
      const i = rooms.findIndex((r) => r.id === room_id); if (i >= 0) rooms.splice(i, 1);
      for (let j = msgs.length - 1; j >= 0; j--) if (msgs[j].room_id === room_id) msgs.splice(j, 1);
      doAudit('u1', 'room_deleted', room_id, {});
      return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
    }
    if (String(url).includes('/functions/v1/reveal')) {
      window.__receiptPending = true;
      const { id } = JSON.parse(opts.body);
      const s = secrets[id]; const i = msgs.findIndex((m) => m.id === id);
      if ((!s || i < 0) && consumed[id]) {
        return new Response(JSON.stringify({ error: 'ja aberto', code: 'reopen_denied' }), { status: 410, headers: { 'Content-Type': 'application/json' } });
      }
      if (!s || i < 0) return new Response(JSON.stringify({ error: 'x' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
      const vs = s.view_seconds || 10;
      const expires = new Date(Date.now() + vs * 1000).toISOString();
      const roomId = msgs[i].room_id;
      consumed[id] = { viewer_id: 'u1', view_seconds: vs, room_id: roomId };
      const sentRow = msgs[i];
      msgs.splice(i, 1); delete secrets[id]; emit('DELETE', 'messages', { old: { id } });
      addReceipt({ message_id: id, room_id: roomId, sender_id: sentRow.sender_id, sent_at: sentRow.created_at,
        status: 'opened', viewer_id: 'u1', opened_at: iso(Date.now()), had_file: !!s.file_path });
      const meta = { env: s.env, view_seconds: vs, expires_at: expires, message_id: id };
      const row = {
        id: ++aid + 7000, room_id: roomId, user_id: 'u1', alert_type: 'image_opened', severity: 'low',
        source: 'server_proven', reliability: 'proven', created_at: iso(Date.now()),
      };
      alerts.push(row); emit('INSERT', 'security_alerts', { new: row });
      if (s.file_path) {
        const head = new TextEncoder().encode(JSON.stringify(meta)); const f = store[s.file_path];
        const out = new Uint8Array(4 + head.length + f.length); new DataView(out.buffer).setUint32(0, head.length);
        out.set(head, 4); out.set(f, 4 + head.length);
        return new Response(out, { headers: { 'Content-Type': 'application/octet-stream' } });
      }
      return new Response(JSON.stringify(meta), { headers: { 'Content-Type': 'application/json' } });
    }
    return realFetch(url, opts);
  };

  const client = {
    auth: {
      getSession: () => ok({ session }),
      signInWithPassword: ({ email, password }) => {
        if (!email.startsWith('ana.souza@') || password !== 'senha123') return Promise.resolve({ data: null, error: { message: 'Invalid login credentials' } });
        session = { user: { id: 'u1' }, access_token: 'tok' }; localStorage.setItem('mock-session', '1'); return ok({ session });
      },
      signUp: () => ok({ session: null }),
      signOut: (o) => { window.__signOutScope = (o && o.scope) || 'local'; if (o && o.scope === 'others') return ok(null); session = null; localStorage.removeItem('mock-session'); return ok(null); },
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from: builder,
    async rpc(name, a) {
      if (name === 'register_device') {
        if (!registry.some((k) => k.public_key === a.p_key)) registry.push({ user_id: 'u1', public_key: a.p_key });
        if (!devices.length) devices.push({ id: 1, label: 'Safari · iPhone/iPad', ip: '200.1.2.3', first_seen: iso(now - 864e5 * 9), last_seen: iso(now - 864e5 * 2), revoked_at: null, public_key: 'outro' });
        if (!devices.some((d) => d.public_key === a.p_key)) devices.push({ id: devices.length + 1, label: a.p_label, ip: '177.9.9.9', first_seen: iso(Date.now()), last_seen: iso(Date.now()), revoked_at: null, public_key: a.p_key });
        window.__lastFingerprint = a.p_fingerprint;
        if (!seeded) seeded = seed(a.p_key);
        await seeded; return { data: null, error: null };
      }
      if (seeded) await seeded;
      if (name === 'get_rooms') return ok(rooms.map(roomJSON));
      if (name === 'username_available') return ok(true);
      if (name === 'mark_read') { readAt[a.p_room + '|u1'] = Date.now(); return ok(null); }
      if (name === 'send_once') {
        const row = { id: ++mid, room_id: a.p_room, sender_id: 'u1', kind: 'once', ...blank, created_at: iso(Date.now()) };
        msgs.push(row);
        secrets[row.id] = { env: a.p_env, file_path: a.p_file_path || null, view_seconds: a.p_view_seconds || 10 };
        emit('INSERT', 'messages', { new: row }); return ok(row.id);
      }
      if (name === 'revoke_other_devices') { let n = 0; devices.forEach((d) => { if (d.public_key !== a.p_keep_key && !d.revoked_at) { d.revoked_at = iso(Date.now()); n++; } }); doAudit('u1', 'devices_revoked', null, { count: n }); return ok(n); }
      if (name === 'revoke_device') { window.__revoked = a.p_key; return ok(null); }
      if (name === 'audit_client_event') { await doAudit('u1', a.p_action, null, null); return ok(null); }
      if (name === 'delete_message') { const i = msgs.findIndex((m) => m.id === a.p_id); const row = msgs[i]; msgs.splice(i, 1); const s = secrets[a.p_id]; emit('DELETE', 'messages', { old: { id: a.p_id } }); return ok({ files: row && row.file_path, once: s && s.file_path }); }
      if (name === 'open_direct') { let r = rooms.find((x) => x.type === 'direct' && x.members.includes(a.p_other)); if (!r) { r = { id: rooms.length + 1, type: 'direct', members: ['u1', a.p_other], created_at: Date.now() }; rooms.push(r); } return ok(r.id); }
      if (name === 'create_temp') { const r = { id: Math.max(...rooms.map((x) => x.id)) + 1, type: 'temp', name: a.p_name || 'Conversa temporária', created_by: 'u1', members: ['u1', ...a.p_members], created_at: Date.now(), expires_at: Date.now() + a.p_hours * 36e5 }; rooms.push(r); return ok(r.id); }
      if (name === 'is_admin') return ok(!!window.__mock.isAdmin);
      if (name === 'touch_activity') return ok(null);
      if (name === 'admin_access_audit') { if (!window.__mock.isAdmin) return Promise.resolve({ data: null, error: { message: 'acesso negado' } }); await doAudit('u1', 'admin_panel_open', null, { panel: 'security_center' }); return ok(null); }
      if (name === 'report_client_event') {
        const row = {
          id: ++aid + 1000, room_id: a.p_room || null, message_id: a.p_message_id || null,
          user_id: 'u1', alert_type: a.p_type, severity: a.p_severity || 'medium',
          metadata: a.p_meta || null, source: 'client_reported', reliability: 'observed',
          created_at: iso(Date.now()),
        };
        // bloquear falsificação de tipos server-only
        if (['image_opened', 'reopen_denied', 'new_device'].includes(a.p_type)) {
          return Promise.resolve({ data: null, error: { message: 'tipo de evento nao permitido ao cliente' } });
        }
        alerts.push(row);
        doAudit('u1', 'security_alert', row.room_id, { type: row.alert_type, severity: row.severity });
        emit('INSERT', 'security_alerts', { new: row });
        return ok(row.id);
      }
      if (name === 'close_protected_view') return ok(null);
      if (name === 'admin_security_overview') {
        if (!window.__mock.isAdmin) return Promise.resolve({ data: null, error: { message: 'acesso negado' } });
        return ok({
          total: alerts.length, from: '2026-01-01', to: '2026-12-31',
          by_type: alerts.reduce((o, a) => { o[a.alert_type] = (o[a.alert_type] || 0) + 1; return o; }, {}),
          by_day: [], by_month: [], sources: { client_reported: alerts.length },
        });
      }
      if (name === 'admin_security_ranking') {
        if (!window.__mock.isAdmin) return Promise.resolve({ data: null, error: { message: 'acesso negado' } });
        return ok({
          total_rows: 1, limit: 40, offset: 0, rows: [{
            pos: 1, user_id: 'u1', display_name: 'Ana Souza', username: 'ana.souza',
            copies: 1, cuts: 0, pastes: 0, prints: 0, captures: 0, images: 0, reopens: 0, expired: 0,
            total: 1, sessions: 1, rate: 1,
          }],
          disclaimer: 'revisao humana',
        });
      }
      if (name === 'admin_security_series') {
        if (!window.__mock.isAdmin) return Promise.resolve({ data: null, error: { message: 'acesso negado' } });
        return ok([]);
      }
      return ok(null);
    },
    channel(name) {
      const ch = {
        on(type, filter, cb) {
          if (type === 'postgres_changes') handlers.push({ ev: filter.event, table: filter.table, cb });
          else if (type === 'broadcast') typingHandlers.push({ name, cb });
          else ch._sync = cb;
          return ch;
        },
        subscribe(cb) { if (cb) cb('SUBSCRIBED'); setTimeout(() => ch._sync && ch._sync(), 50); return ch; },
        presenceState() { return { u1: [{}], u2: [{}] }; },
        track() { return ok(null); },
        send() { window.__typingSent = (window.__typingSent || 0) + 1; return ok('ok'); },
      };
      return ch;
    },
    removeChannel() {},
    storage: {
      from: () => ({
        upload: (path, blob) => blob.arrayBuffer().then((b) => { store[path] = new Uint8Array(b); return { data: {}, error: null }; }),
        createSignedUrl: (path) => ok({ signedUrl: URL.createObjectURL(new Blob([store[path]])) }),
        remove: (paths) => { paths.forEach((p) => delete store[p]); return ok(null); },
      }),
    },
  };
  window.supabase = { createClient: () => client };
  window.__mockTyping = (uid, room) => typingHandlers.filter((h) => h.name === `room:${room}`).forEach((h) => h.cb({ payload: { user_id: uid } }));
  window.__mockAlert = (uid, room, type) => { const row = { id: ++aid + 5000, room_id: room, user_id: uid, alert_type: type, severity: 'high', created_at: iso(Date.now()) }; alerts.push(row); emit('INSERT', 'security_alerts', { new: row }); };
  window.__mockTamper = () => { const r = audit.find((x) => x.user_id === 'u1'); r.payload = r.payload.replace('message_sent', 'message_xxxx'); };
  // outra pessoa abre a MINHA uma visão (o servidor apaga e gera o comprovante)
  window.__mockOpenedBy = (uid, messageId) => {
    const i = msgs.findIndex((m) => m.id === messageId); if (i < 0) return false;
    const row = msgs[i]; msgs.splice(i, 1); delete secrets[messageId];
    emit('DELETE', 'messages', { old: { id: messageId } });
    addReceipt({ message_id: messageId, room_id: row.room_id, sender_id: row.sender_id, sent_at: row.created_at,
      status: 'opened', viewer_id: uid, opened_at: iso(Date.now()), had_file: false });
    return true;
  };
  window.__mockExpire = (messageId) => {
    const i = msgs.findIndex((m) => m.id === messageId); if (i < 0) return false;
    const row = msgs[i]; msgs.splice(i, 1); delete secrets[messageId];
    emit('DELETE', 'messages', { old: { id: messageId } });
    addReceipt({ message_id: messageId, room_id: row.room_id, sender_id: row.sender_id, sent_at: row.created_at,
      status: 'expired', viewer_id: null, opened_at: null, had_file: false });
    return true;
  };
  window.__mockRead = (room, uid) => { readAt[room + '|' + uid] = Date.now(); emit('UPDATE', 'room_members', { new: { room_id: room, user_id: uid, last_read_at: iso(Date.now()) } }); };
})();
