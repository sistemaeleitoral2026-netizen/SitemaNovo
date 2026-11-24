
// Adapta o Supabase simulado (nomes antigos) ao Chat Seguro embutido: tabelas/RPCs com prefixo sc_,
// sc_join/sc_directory, cliente com token externo (accessToken) e funções em /api/chat-*.
(function () {
  const orig = window.supabase.createClient;
  window.supabase.createClient = (url, key, opts) => {
    const c = orig(url, key, opts);
    const from = c.from.bind(c); const rpc = c.rpc.bind(c);
    c.from = (t) => { window.__lastTable = t; return from(String(t).replace(/^sc_/, '')); };
    c.rpc = (name, args) => {
      if (name === 'sc_join') return Promise.resolve({ data: { ok: true, admin: true }, error: null });
      if (name === 'sc_directory') return from('profiles').then(({ data }) => ({ data, error: null }));
      if (name === 'sc_touch_activity') return Promise.resolve({ data: null, error: null });
      return rpc(String(name).replace(/^sc_/, ''), args);
    };
    c.realtime = { setAuth() {} };
    if (opts && typeof opts.accessToken === 'function') window.__usesAccessToken = true;
    return c;
  };
  const f = window.fetch;
  window.fetch = (u, o) => {
    if (String(u) === '/api/chat-reveal') { window.__revealUrl = '/api/chat-reveal'; return f('https://mock.supabase.co/functions/v1/reveal', o); }
    if (String(u) === '/api/chat-delete-room') return f('https://mock.supabase.co/functions/v1/delete-room', o);
    return f(u, o);
  };
})();
