/* AREA VM CONTROL TOWER V3 — shell cache only (see PWA notes in pwa.js) */
const V = 'avct-v3-v2-mobile-auth';
const SHELL = [
  './',
  './index.html',
  './css/styles.css',
  './js/vendor/xlsx.full.min.js',
  './js/vendor/chart.umd.min.js',
  './js/config.js',
  './js/supabase-loader.js',
  './js/store.js',
  './js/seed.js',
  './js/i18n.js',
  './js/engine.js',
  './js/charts.js',
  './js/exporter.js',
  './js/speech.js',
  './js/dataservice.js',
  './js/auth.js',
  './js/status.js',
  './js/pwa.js',
  './js/excelimport.js',
  './js/app.js',
  './js/views/advance.js',
  './js/views/tracking.js',
  './js/views/analysis.js',
  './js/views/misc.js',
  './js/views/member.js',
  './js/views/dashboard.js',
  './js/views/branches.js',
  './js/views/alerts.js',
  './manifest.json',
  './js/pwa/icon-192.png',
  './js/pwa/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(V).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== V).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // never proxy CDN/API/storage

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(V).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((c) => c || caches.match('./index.html')))
  );
});