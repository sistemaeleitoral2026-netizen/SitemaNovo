/* Service worker do SecureChat: instalação como app, cache do "casco" e notificações push. */
const VERSION = 'chat-seguro-v1';
const BASE = '/sistemas/chat-seguro/';
const SHELL = [
  BASE + 'index.html', BASE + 'style.css', BASE + 'app.js', BASE + 'e2ee.js',
  BASE + 'icons.svg', BASE + 'chat-bg.svg', BASE + 'icons/icon-192.png', BASE + 'icons/badge-96.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// só arquivos do próprio site; Supabase (dados, arquivos, login) nunca vai para o cache
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (e.request.mode === 'navigate') {
    // rede primeiro para a página (pega versão nova), cache se estiver offline
    e.respondWith(fetch(e.request).catch(() => caches.match(BASE + 'index.html')));
    return;
  }
  e.respondWith(caches.match(e.request).then((hit) => {
    const net = fetch(e.request).then((res) => {
      if (res.ok) caches.open(VERSION).then((c) => c.put(e.request, res.clone()));
      return res;
    }).catch(() => hit);
    return hit || net;
  }));
});

// ---------------------------------------------------------------- push
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  const title = d.title || 'SecureChat';
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || 'Nova mensagem',
    icon: BASE + 'icons/icon-192.png',
    badge: BASE + 'icons/badge-96.png',
    tag: d.tag || 'securechat',
    renotify: true,
    data: { room_id: d.room_id },
    vibrate: [80, 40, 80],
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const room = e.notification.data && e.notification.data.room_id;
  const target = room ? `/chat?room=${room}` : '/chat';
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (new URL(c.url).pathname.startsWith('/chat')) {
        await c.focus();
        c.postMessage({ type: 'chat-open-room', room_id: room });
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});
