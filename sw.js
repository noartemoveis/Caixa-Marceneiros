'use strict';

/* Service worker: guarda os arquivos do app para abrir rápido e sem internet.
   - Arquivos do próprio app: sempre tenta a versão mais nova; sem internet, usa a guardada.
   - Bibliotecas externas com versão fixa (Firebase, fontes, planilha): usa a guardada,
     porque elas nunca mudam. Assim o app abre mesmo sem sinal.
   Os dados (saldos, extratos) quem guarda é o próprio Firebase, no aparelho. */

const CACHE = 'caixa-marceneiros-v19';
const FIREBASE = 'https://www.gstatic.com/firebasejs/10.12.2';
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
  `${FIREBASE}/firebase-app.js`,
  `${FIREBASE}/firebase-auth.js`,
  `${FIREBASE}/firebase-firestore.js`,
];

// Endereços externos que podem ser guardados (versões fixas, nunca mudam)
const EXTERNOS = [FIREBASE, 'https://fonts.googleapis.com', 'https://fonts.gstatic.com', 'https://cdn.sheetjs.com'];

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

const guardar = (request, response) => {
  const copy = response.clone();
  caches.open(CACHE).then(cache => cache.put(request, copy));
  return response;
};

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  if (new URL(request.url).origin === location.origin) {
    // "no-cache" confere no servidor se há versão nova, em vez de usar a cópia guardada pelo navegador
    event.respondWith(
      fetch(request, { cache: 'no-cache' })
        .then(response => guardar(request, response))
        .catch(() => caches.match(request))
    );
  } else if (EXTERNOS.some(base => request.url.startsWith(base))) {
    event.respondWith(
      caches.match(request).then(guardado => guardado || fetch(request).then(response => guardar(request, response)))
    );
  }
  // Todo o resto (conexão com o banco, login, e-mails) passa direto, sem guardar
});
