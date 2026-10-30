'use strict';

/* Service worker: guarda os arquivos do app para abrir rápido e sem internet.
   - Arquivos do próprio app: sempre tenta a versão mais nova; sem internet, usa a guardada.
   - Bibliotecas externas com versão fixa (Firebase, fontes, planilha): usa a guardada,
     porque elas nunca mudam. Assim o app abre mesmo sem sinal.
   Os dados (saldos, extratos) quem guarda é o próprio Firebase, no aparelho. */

const CACHE = 'caixa-marceneiros-v23';
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
  `${FIREBASE}/firebase-messaging.js`,
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

// Só guarda resposta boa: um erro do servidor não pode substituir a cópia que funciona sem internet
const guardar = (request, response) => {
  if (!response.ok) return response;
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

// ---------- Notificações no celular ----------
// O script do Google manda { titulo, corpo, url }; aqui vira a notificação na tela,
// mesmo com o app fechado.

self.addEventListener('push', event => {
  let mensagem = {};
  try {
    const recebido = event.data ? event.data.json() : {};
    mensagem = recebido.data ?? recebido;
  } catch {
    mensagem = { corpo: event.data?.text() };
  }
  event.waitUntil(self.registration.showNotification(mensagem.titulo || 'Caixa dos Marceneiros', {
    body: mensagem.corpo || '',
    icon: 'icon-192.png',
    badge: 'favicon.png',
    data: { url: mensagem.url || self.registration.scope },
  }));
});

// Tocar na notificação abre o app (ou traz para frente, se já estiver aberto)
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(janelas => {
      const aberta = janelas.find(j => j.url.startsWith(self.registration.scope));
      return aberta ? aberta.focus() : self.clients.openWindow(event.notification.data.url);
    })
  );
});
