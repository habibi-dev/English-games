// Service worker: installable app that works offline after the first visit (or after install precache).
// Strategy: network first when online so code and lesson files update; cache every successful GET and fall
// back to it when the network is down. Lesson questions also live in IndexedDB (see repository.js).

// The version of the app. Change it on every release: the browser sees a new service worker (so the installed
// app updates), and the cache of the old version is deleted when the new one activates.
const VERSION = '2026-10-24.2';
const CACHE = `english-quest-${VERSION}`;

/** Same-origin assets to cache on install so the shell and course files open without a live network. */
const PRECACHE = [
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './css/vazirmatn.css',
  './content/index.json',
  './content/evolve-1/lesson-01.json',
  './content/covers/evolve-1.png',
  './content/covers/evolve-logo.png',
  './js/app.js',
  './js/bank/content.js',
  './js/bank/csv.js',
  './js/bank/importer.js',
  './js/bank/lesson-vocabulary.js',
  './js/bank/question-prompt.js',
  './js/bank/repository.js',
  './js/bank/schema.js',
  './js/engine/game-engine.js',
  './js/engine/spelling.js',
  './js/engine/validator.js',
  './js/progress/activity.js',
  './js/progress/backup.js',
  './js/progress/lesson-progress.js',
  './js/progress/mission-report.js',
  './js/progress/player.js',
  './js/progress/report.js',
  './js/progress/spaced-repetition.js',
  './js/progress/tracker.js',
  './js/storage/db.js',
  './js/storage/lesson-playbar.js',
  './js/storage/settings.js',
  './js/storage/typing-quota.js',
  './js/ui/admin.js',
  './js/ui/answer-widgets.js',
  './js/ui/dom.js',
  './js/ui/drag-scroll.js',
  './js/ui/icons.js',
  './js/ui/lesson-content.js',
  './js/ui/mascot.js',
  './js/ui/native-feel.js',
  './js/ui/play.js',
  './js/ui/prompt.js',
  './js/ui/reports.js',
  './js/ui/result-card.js',
  './js/ui/result-stage.js',
  './js/ui/review-handoff.js',
  './js/ui/sounds.js',
  './js/ui/speech-out.js',
  './js/ui/wake-lock.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const base = self.location.href;
      for (const path of PRECACHE) {
        try {
          await cache.add(new URL(path, base).href);
        } catch {
          // A missing optional asset (e.g. icon in dev) must not block activation.
        }
      }
      await self.skipWaiting();
    })(),
  );
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
