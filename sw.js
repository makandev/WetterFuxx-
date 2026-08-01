/* Wetterfux service worker — offline app shell + fresh weather data */
const CACHE = 'wetterfux-v34';
const SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/api.js',
  './js/ui.js',
  './js/effects.js',
  './js/store.js',
  './js/format.js',
  './js/i18n.js',
  './js/weathercodes.js',
  './js/advice.js',
  './js/mascot.js',
  './js/moment.js',
  './js/journal.js',
  './js/sharecard.js',
  './js/qr.js',
  './js/skyshow.js',
  './js/analytics.js',
  './js/radar.js',
  './js/worldweather.js',
  './vendor/leaflet/leaflet.js',
  './vendor/leaflet/leaflet.css',
  './manifest.webmanifest',
  './icons/icon.svg',
];

self.addEventListener('install', (e) => {
  // Cache each asset independently so one 404 can't fail the whole install.
  // Activate the new version immediately so fixes reach users on the next load
  // instead of getting stuck behind a still-running old service worker.
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))));
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Map & radar tiles → straight to network, never cache (avoids storage bloat)
  if (/tile\.openstreetmap\.org|tilecache\.rainviewer\.com/.test(url.hostname)) {
    e.respondWith(fetch(req).catch(() => new Response('', { status: 504 })));
    return;
  }

  // Weather APIs → network-first (always try fresh, fall back to cache when offline)
  if (/open-meteo\.com|bigdatacloud\.net|brightsky\.dev|api\.rainviewer\.com|photon\.komoot\.io|eonet\.gsfc\.nasa\.gov|earthquake\.usgs\.gov|services\.swpc\.noaa\.gov/.test(url.hostname)) {
    e.respondWith(
      fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // Third-party requests (analytics, etc.) → straight to network, untouched.
  // Never substitute the app shell for a cross-origin request — that returned
  // index.html for the visitor-counter fetch/image and broke it.
  if (url.origin !== location.origin) {
    e.respondWith(fetch(req).catch(() => new Response('', { status: 504 })));
    return;
  }

  // App shell → stale-while-revalidate for same-origin (fresh after deploy)
  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached || caches.match('./index.html'));
      return cached || network;
    })
  );
});
