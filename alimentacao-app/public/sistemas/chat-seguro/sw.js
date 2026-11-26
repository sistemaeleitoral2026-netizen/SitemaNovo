/* Service worker do SecureChat: notificações push, sem cache de interface. */
const BASE = '/sistemas/chat-seguro/';

self.addEventListener('install', (e) => {
  e.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', (e) => {
  // Remove inclusive caches criados por versões antigas do Chat Seguro.
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
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
