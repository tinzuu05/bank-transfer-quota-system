/** PWA: cache static local assets; never cache credentials or Firebase cloud requests. */
const CACHE_NAME = 'three-bank-quota-v6-secure-20261123';
const ASSETS = [
  './', './index.html', './login.html', './logout.html', './styles.css',
  './app.js', './firebase-sync.js', './manifest.webmanifest',
  './assets/icon.svg', './assets/icon-192.png', './assets/icon-512.png'
];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Generated Firebase config is fetched fresh. Offline fallback disables cloud only.
  if (url.pathname.endsWith('/firebase-config.js')) {
    event.respondWith(fetch(request).catch(() => new Response('window.BANK_FIREBASE_CONFIG = {};', { headers: { 'Content-Type': 'application/javascript' } })));
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then((response) => {
      const copy = response.clone();
      if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      return response;
    }).catch(() => caches.match(request).then((matched) => matched || caches.match('./index.html'))));
    return;
  }
  event.respondWith(caches.match(request).then((hit) => hit || fetch(request)));
});
