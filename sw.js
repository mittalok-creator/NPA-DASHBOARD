const CACHE_NAME = 'upgb-ots-shell-v90';
const SHELL_ASSETS = [
  './',
  './index.html',
  './css/styles.css?v=20260724c',
  './js/app.js?v=20260724c',
  './js/auth.js?v=20260724c',
  './js/publish.js?v=20260724c',
  './js/splash.js?v=20260724c',
  './js/vendor/xlsx.full.min.js?v=20260724c',
  './js/vendor/exceljs.min.js?v=20260724c',
  './js/vendor/pdf.min.js?v=20260724c',
  './js/vendor/pdf.worker.min.js?v=20260724c',
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
// These two files are polled on a timer purely to pick up changes made from
// other devices -- OTS lock sync every 45s, Daily NPA Projection live-sync
// every 3s (js/app.js) -- and each poll's URL carries a unique cache-busting
// timestamp, so it is never requested again with that exact URL. Caching the
// response therefore only ever adds a write and never serves a read: over a
// long-running tab this silently filled up Cache Storage with thousands of
// dead entries and visibly slowed the whole app down. These two always go
// straight to the network, nothing cached, nothing to grow unbounded.
const POLLED_ENDPOINTS = ['/data/locked-ots.json', '/data/daily-npa-projection.json'];
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (POLLED_ENDPOINTS.some((p) => url.pathname.endsWith(p))) {
    event.respondWith(fetch(event.request));
    return;
  }
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
