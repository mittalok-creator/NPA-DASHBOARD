const CACHE_NAME = 'upgb-ots-shell-v142';
// These version strings drifted out of sync with index.html's actual
// ?v= query params (stuck on an old 20260724c while index.html moved
// through many later bumps) -- every precached URL here was therefore
// dead weight, never actually served, since the browser always requests
// the current versioned URL instead. Keep these in sync with index.html
// on every future version bump. pdf.min.js / pdf.worker.min.js were
// dropped entirely (2026-08-24) along with the Bank Dashboard tab that
// was their only consumer -- neither is loaded by index.html anymore.
// html2canvas.min.js / jspdf.umd.min.js (added 2026-08-29, for the
// WhatsApp share button) are deliberately NOT precached either, same
// reasoning -- most sessions never tap Share, so the runtime fetch
// handler below still caches them normally the first time someone does.
const SHELL_ASSETS = [
  './',
  './index.html',
  './css/styles.css?v=20260829b',
  './js/app.js?v=20260829b',
  './js/auth.js?v=20260829b',
  './js/publish.js?v=20260829b',
  './js/splash.js?v=20260829b',
  './js/vendor/xlsx.full.min.js?v=20260829b',
  './js/vendor/exceljs.min.js?v=20260829b',
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
// Files polled on a timer to pick up changes made from other devices. Each
// poll's URL carries a unique cache-busting timestamp, so it is never
// requested again with that exact URL: caching the response only ever adds
// a write and never serves a read, and over a long-running tab that
// silently filled Cache Storage with thousands of dead entries and visibly
// slowed the whole app down. Anything listed here goes straight to the
// network, nothing cached, nothing to grow unbounded.
//
// Both original entries are gone with the features that polled them (OTS
// lock sync, removed 2026-08-14; Daily NPA Projection, removed 2026-08-15).
// The list and its fetch branch stay because they are the guard rail that
// stops the next polled endpoint from reintroducing that bug.
const POLLED_ENDPOINTS = [];
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
