/* eslint-disable no-restricted-globals */
// Service Worker pentru Manele Cadou Admin — Web Push notifications.
// Servit la /sw.js. Scope: '/'.

self.addEventListener('install', (event) => {
  // Activează imediat noul SW fără să aștepte tab-urile vechi.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/**
 * Push event — primește payload JSON-encoded.
 * Format așteptat: { title, body, icon?, badge?, tag?, url?, data? }
 */
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: 'Mesaj nou', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'Manele Cadou — Admin';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icon-512.png',
    badge: payload.badge || '/icon-512.png',
    tag: payload.tag,
    data: { url: payload.url || '/chat', ...(payload.data || {}) },
    requireInteraction: false,
    vibrate: [120, 60, 120],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/**
 * Click pe notificare → deschide tab nou cu URL-ul țintă, sau focus pe cel existent.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/chat';

  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Caută un tab existent al admin-ului
    for (const client of all) {
      try {
        const url = new URL(client.url);
        if (url.origin === self.location.origin) {
          await client.focus();
          // Trimite mesaj să navigheze către conversație (admin SPA)
          client.postMessage({ type: 'push-click', url: targetUrl });
          return;
        }
      } catch (e) {
        /* ignore */
      }
    }
    // Niciun tab — deschide unul nou
    if (self.clients.openWindow) {
      await self.clients.openWindow(targetUrl);
    }
  })());
});

self.addEventListener('pushsubscriptionchange', (event) => {
  // Browser-ul a invalidat sub-ul vechi (rotație de keys). Reabonament silent ar necesita
  // VAPID key persistat în SW — în loc, lăsăm clientul să detecteze la load și să refacă subscribe.
  event.waitUntil(self.registration.showNotification('Manele Cadou — Admin', {
    body: 'Reactivează notificările din setări (subscription expirat).',
    tag: 'sub-expired',
  }));
});
