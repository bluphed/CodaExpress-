const CACHE_NAME = 'coda-express-v2';
const urlsToCache = [
  '/Gabriel_CodaExpress/',
  '/Gabriel_CodaExpress/index.html',
  '/Gabriel_CodaExpress/manifest.json',
  '/Gabriel_CodaExpress/android-chrome-192x192.png',
  '/Gabriel_CodaExpress/android-chrome-512x512.png'
];

self.addEventListener('install', event => {
  console.log('[SW] Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Cacheando archivos');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  console.log('[SW] Activando...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('[SW] Eliminando caché antigua:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request).catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match('/Gabriel_CodaExpress/index.html');
          }
        });
      })
  );
});
