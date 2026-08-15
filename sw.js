const CACHE_NAME = 'upgb-ots-shell-v112';
// These version strings drifted out of sync with index.html's actual
// ?v= query params (stuck on an old 20260724c while index.html moved
// through many later bumps) -- every precached URL here was therefore
// dead weight, never actually served, since the browser always requests
// the current versioned URL instead. Keep these in sync with index.html
// on every future version bump. pdf.worker.min.js (~1.1MB) is deliberately
// NOT precached here -- it's only needed by the PDF-upload feature
// (parseBankPdf in js/app.js), which most sessions never touch; the
// runtime fetch handler below still caches it normally the first time it
// actually gets requested, so nothing is lost, just no longer forced on
// every single app load.
const SHELL_ASSETS = [
  './',
  './index.html',
  './css/styles.css?v=20260815g',
  './js/app.js?v=20260815g',
  './js/auth.js?v=20260815g',
  './js/publish.js?v=20260815g',
  './js/splash.js?v=20260815g',
  './js/vendor/xlsx.full.min.js?v=20260815g',
  './js/vendor/exceljs.min.js?v=20260815g',
  './js/vendor/pdf.min.js?v=20260815g',
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
