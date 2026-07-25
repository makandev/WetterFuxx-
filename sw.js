/* Wetterfux service worker — offline app shell + fresh weather data */
const CACHE = 'wetterfux-v2';
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
  './js/radar.js',
  './vendor/leaflet/leaflet.js',
  './vendor/leaflet/leaflet.css',
  './manifest.webmanifest',
  './icons/icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
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
  if (/open-meteo\.com|bigdatacloud\.net|brightsky\.dev|api\.rainviewer\.com/.test(url.hostname)) {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // App shell → cache-first
  e.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      if (url.origin === location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
