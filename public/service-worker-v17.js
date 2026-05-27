const CACHE_NAME = 'coda-express-v17';
const ASSETS = [
  '/Gabriel_CodaExpress/android-chrome-192x192.png',
  '/Gabriel_CodaExpress/android-chrome-512x512.png',
  '/Gabriel_CodaExpress/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  if (
    event.request.mode === 'navigate' || 
    url.pathname.endsWith('index.html') || 
    url.pathname.endsWith('manifest.json') ||
    url.pathname.includes('service-worker')
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
