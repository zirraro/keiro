/**
 * KeiroAI Service Worker — push notifications only.
 *
 * Responsible for:
 *   1. Receiving Web Push events from the server and showing a native
 *      notification (Android / Windows / macOS / iOS 16.4+ on iPhone).
 *   2. Routing clicks back into the app at the right URL.
 *
 * Kept intentionally tiny — no caching strategy, no offline support.
 * Adding those later should NOT break push handling.
 */

self.addEventListener('install', (event) => {
  // Activate immediately so users don't need to close/reopen the tab
  // to get the new worker after deploys.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: 'KeiroAI', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'KeiroAI';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icon.svg',
    badge: payload.badge || '/icon.svg',
    data: payload.data || {},
    tag: payload.tag || 'keiroai',
    // `renotify: true` lets the same tag re-alert the user — we want
    // today's follow reminder to make a sound even if yesterday's is
    // still sitting in the notification tray.
    renotify: true,
    requireInteraction: payload.requireInteraction || false,
    actions: payload.actions || [],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Deep-link into the specific workspace view that the push points to.
  // Falls back to the app root if no URL is provided in the payload.
  const targetUrl = (event.notification.data && event.notification.data.url) || '/assistant';

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // If a tab is already open on KeiroAI, focus it and navigate.
      for (const client of allClients) {
        if (client.url.includes(self.location.origin)) {
          client.focus();
          try { client.navigate(targetUrl); } catch {}
          return;
        }
      }
      // Otherwise, open a new tab.
      await self.clients.openWindow(targetUrl);
    })(),
  );
});
