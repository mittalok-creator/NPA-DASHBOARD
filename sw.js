const CACHE_NAME = 'upgb-ots-shell-v263';
// These version strings drifted out of sync with index.html's actual
// ?v= query params (stuck on an old 20260724c while index.html moved
// through many later bumps) -- every precached URL here was therefore
// dead weight, never actually served, since the browser always requests
// the current versioned URL instead. Keep these in sync with index.html
// on every future version bump. None of the vendor libraries (xlsx,
// exceljs, html2canvas, jsPDF, msal-browser, pdf.js/pdf.worker) are
// precached here -- as of 2026-09-17 every one of them is loaded lazily,
// injected by js/app.js on first actual use (OneDrive login, Excel
// import/export, WhatsApp PDF share) rather than eagerly on page load, so
// precaching them here would just spend an install-time download on
// something a given session may never touch. The runtime fetch handler
// below still caches each one normally the first time a session does.
const SHELL_ASSETS = [
  './',
  './index.html',
  './css/styles.css?v=20260922c',
  './js/app.js?v=20260923d',
  './js/auth.js?v=20260912a',
  './js/publish.js?v=20260920f',
  './js/splash.js?v=20260917a',
  './manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

// Holds the last successfully-fetched data/latest.json, separately from
// CACHE_NAME (Alok's request, 2026-09-12: work offline once data has been
// loaded once, work online normally otherwise). Deliberately its own
// never-versioned cache, not part of CACHE_NAME: activate() below wipes
// every cache except CACHE_NAME on each app update, and CACHE_NAME changes
// on every deploy in this project -- if the saved data lived there too, a
// user who updated the app while offline would lose their only offline
// copy at the exact moment the new service worker took over.
const DATA_CACHE_NAME = 'upgb-ots-data';

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME && n !== DATA_CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

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
// data/latest.json is fetched with a `?t=<timestamp>` cache-buster that's a
// different URL on every single load (see loadNpaData() in js/app.js) --
// exactly the "polled endpoint" shape the comment above warns about, so it
// needs the same care POLLED_ENDPOINTS gets, but the opposite handling:
// this one DOES need a cached fallback for offline use, just keyed on the
// path alone (ignoring the ever-changing query) so every fetch overwrites
// one entry instead of piling up a new one per load.
const DATA_URL_PATTERN = /\/data\/latest\.json$/;
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (POLLED_ENDPOINTS.some((p) => url.pathname.endsWith(p))) {
    event.respondWith(fetch(event.request));
    return;
  }
  if (DATA_URL_PATTERN.test(url.pathname)) {
    const cacheKey = url.pathname;
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(DATA_CACHE_NAME).then((cache) => cache.put(cacheKey, copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.open(DATA_CACHE_NAME).then((cache) => cache.match(cacheKey)))
    );
    return;
  }
  // Stale-while-revalidate for the app shell (HTML/CSS/JS/manifest/vendor
  // libraries): serve the cached copy instantly if one exists -- no live
  // network round-trip standing between the click and first paint -- while
  // a background fetch refreshes the cache for next time. Safe together
  // with this app's versioned-URL cache-busting (every asset carries
  // ?v=...): a version bump is a brand-new URL with nothing cached yet, so
  // that one request is a normal network fetch same as before, and only a
  // repeat load of an already-seen URL gets the instant-from-cache
  // benefit. This used to be network-first for literally everything,
  // meaning even a repeat visit to an unchanged app had to wait on a live
  // round-trip before anything appeared at all -- worse the weaker the
  // network, and a real contributor to "the app is slow to open" reported
  // across several branch computers on different networks (2026-09-17).
  // Data (above) deliberately keeps the old network-first behavior --
  // Alok's explicit request, 2026-09-12: never show stale banking figures
  // while genuinely online.
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(event.request).then((cached) => {
        const network = fetch(event.request)
          .then((response) => { cache.put(event.request, response.clone()).catch(() => {}); return response; })
          .catch(() => cached);
        return cached || network;
      })
    )
  );
});
