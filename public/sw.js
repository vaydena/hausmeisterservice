/* Hausmeisterservice — Service Worker fuer Web Push */
/* eslint-disable no-restricted-globals */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = { title: 'Hausmeisterservice', body: '', url: '/' };
  if (event.data) {
    try {
      payload = Object.assign({}, payload, event.data.json());
    } catch (e) {
      try {
        payload.body = event.data.text();
      } catch (_) {
        // ignore
      }
    }
  }
  const opts = {
    body: payload.body || '',
    icon: payload.icon || '/icon-192.png',
    badge: payload.badge || '/badge-72.png',
    tag: payload.tag || undefined,
    data: { url: payload.url || '/', ...(payload.data || {}) },
  };
  event.waitUntil(self.registration.showNotification(payload.title || 'Hausmeisterservice', opts));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of all) {
        try {
          const u = new URL(c.url);
          if (u.origin === self.location.origin) {
            await c.focus();
            try {
              await c.navigate(targetUrl);
            } catch (_) {
              // fallback: open new window
              return self.clients.openWindow(targetUrl);
            }
            return;
          }
        } catch (_) {
          // ignore malformed
        }
      }
      return self.clients.openWindow(targetUrl);
    })(),
  );
});
