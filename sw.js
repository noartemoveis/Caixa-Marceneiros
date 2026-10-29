'use strict';

/* Service worker: guarda os arquivos do app para abrir rápido e sem internet.
   Sempre tenta a versão mais nova primeiro; se não tiver internet, usa a guardada. */

const CACHE = 'caixa-marceneiros-v9';
const FILES = [
  './',
  './index.html',
  './style.css',
  './firebase-config.js',
  './store.js',
  './app.js',
  './manifest.webmanifest',
  './favicon.png',
  './logo.png',
  './logo-simbolo.png',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;

  // "no-cache" confere no servidor se há versão nova, em vez de usar a cópia guardada pelo navegador
  event.respondWith(
    fetch(request, { cache: 'no-cache' })
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request))
  );
});
