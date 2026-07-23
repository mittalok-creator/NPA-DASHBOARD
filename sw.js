const CACHE_NAME = 'upgb-ots-shell-v45';
const SHELL_ASSETS = [
  './',
  './index.html',
  './css/styles.css?v=20260723z',
  './js/app.js?v=20260723z',
  './js/auth.js?v=20260723z',
  './js/publish.js?v=20260723z',
  './js/splash.js?v=20260723z',
  './js/vendor/xlsx.full.min.js?v=20260723z',
  './js/vendor/pdf.min.js?v=20260723z',
  './js/vendor/pdf.worker.min.js?v=20260723z',
  './manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

/* Network-first: this app embeds its NPA data directly in index.html, so we
   always try the network first for the freshest data/app version, falling
   back to the cached copy only when genuinely offline. Never silently serve
   stale banking data while a real connection is available. */
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
