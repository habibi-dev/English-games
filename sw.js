// Service worker: makes the app installable and usable offline.
// Strategy: network first, so bank updates and code changes are picked up when online;
// every successful same-origin GET is cached, and the cache is used when the network fails.

// The version of the app. Change it on every release: the browser sees a new service worker (so the installed
// app updates), and the cache of the old version is deleted when the new one activates.
const VERSION = '2026-10-23.1';
const CACHE = `english-quest-${VERSION}`;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fetch(request);
        if (response.ok && response.type === 'basic') {
          cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        const cached = await cache.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') {
          const shell = await cache.match(new URL('./index.html', self.location.href));
          if (shell) return shell;
        }
        throw error;
      }
    })(),
  );
});
