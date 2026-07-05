const CACHE_NAME = 'hermes-cache-v1';
const urlsToCache = [
  './',
  './index.html',
  './src/main.tsx',
  './src/App.tsx',
  './src/index.css'
];

self.addEventListener('install', (event: any) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener('fetch', (event: any) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
