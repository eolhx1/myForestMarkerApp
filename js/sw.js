//
// filename: sw.js
// Service Worker för offline-stöd, resurs-caching och livscykelhantering
//

// ==========================================
// 1. GLOBALA KONSTANTER OCH ASSETS
// ==========================================

const CACHE_NAME = 'skogsmarkoren-v1';
const ASSETS = [
  './',
  './index.html',
  './js/app.js',
  './manifest.json',
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// ==========================================
// 2. SERVICE WORKER LIVSCYKEL
// ==========================================

// --------------------------------------
// 2A. INSTALLATION OCH CACHING
// --------------------------------------
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// --------------------------------------
// 2B. AKTIVERING OCH RENSNING AV GAMMAL CACHE
// --------------------------------------
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// ==========================================
// 3. NÄTVERKS- OCH CACHE-HANTERING (FETCH)
// ==========================================

// --------------------------------------
// 3A. FETCH-STRATEGI (CACHE FIRST)
// --------------------------------------
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => response || fetch(e.request))
  );
});
