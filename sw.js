// Service Worker for 武大生活地图 PWA
const CACHE_NAME = 'whu-guide-v3';

const ASSETS = [
  '/wuhan-uni-guide/',
  '/wuhan-uni-guide/index.html',
  '/wuhan-uni-guide/css/style.css',
  '/wuhan-uni-guide/js/app.js',
  '/wuhan-uni-guide/js/map.js',
  '/wuhan-uni-guide/js/search.js',
  '/wuhan-uni-guide/js/storage.js',
  '/wuhan-uni-guide/js/routing.js',
  '/wuhan-uni-guide/js/ui.js',
  '/wuhan-uni-guide/js/image-utils.js',
  '/wuhan-uni-guide/js/memory.js',
  '/wuhan-uni-guide/js/love-counter.js',
  '/wuhan-uni-guide/js/surprise.js',
  '/wuhan-uni-guide/data/places.json',
  '/wuhan-uni-guide/manifest.json',
  '/wuhan-uni-guide/icon-192.png',
  '/wuhan-uni-guide/icon-512.png',
];

// Install: cache all assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch((err) => {
        console.warn('SW: Some assets failed to cache', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch: cache-first strategy
self.addEventListener('fetch', (event) => {
  // Skip non-GET and external (CDN) requests
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
