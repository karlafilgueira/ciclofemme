/* ===========================================================
   CICLO FEMME — service worker

   Estratégias:
   - Navegação (abrir o app): rede primeiro, cache como reserva.
     Assim você recebe a versão nova quando estiver online e o app
     continua abrindo quando não estiver.
   - Ícones, manifest, fontes e SDK do Firebase: cache primeiro.
     São arquivos que praticamente não mudam.
   - Chamadas ao Firestore e ao Authentication: NUNCA passam pelo
     cache. O próprio SDK do Firebase guarda os dados offline e
     sincroniza sozinho quando a conexão volta.

   Ao publicar uma versão nova do app, troque o número em VERSAO.
   =========================================================== */

const VERSAO = 'ciclo-femme-v1';
const CACHE_APP = `${VERSAO}-app`;
const CACHE_EXTERNO = `${VERSAO}-externo`;

const ARQUIVOS_DO_APP = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon.png'
];

/* Domínios cujas respostas podem ser guardadas em cache. */
const EXTERNOS_CACHEAVEIS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'www.gstatic.com'
];

/* Domínios que precisam sempre falar com a rede. */
const SEMPRE_REDE = [
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firebaseinstallations.googleapis.com',
  'firebase.googleapis.com'
];

/* ---------- Instalação ---------- */
self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE_APP)
      .then((cache) => cache.addAll(ARQUIVOS_DO_APP))
      .then(() => self.skipWaiting())
  );
});

/* ---------- Ativação: limpa versões antigas ---------- */
self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(
        nomes
          .filter((n) => !n.startsWith(VERSAO))
          .map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

/* ---------- Interceptação das requisições ---------- */
self.addEventListener('fetch', (evento) => {
  const req = evento.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Firebase fala direto com a rede, sem intermediário.
  if (SEMPRE_REDE.some((d) => url.hostname.endsWith(d))) return;

  // Abrir o app: rede primeiro, cache como reserva.
  if (req.mode === 'navigate') {
    evento.respondWith(
      fetch(req)
        .then((resp) => {
          const copia = resp.clone();
          caches.open(CACHE_APP).then((c) => c.put('./index.html', copia));
          return resp;
        })
        .catch(() => caches.match('./index.html', { ignoreSearch: true }))
    );
    return;
  }

  // Fontes e SDK: cache primeiro, buscando na rede só na primeira vez.
  if (EXTERNOS_CACHEAVEIS.some((d) => url.hostname.endsWith(d))) {
    evento.respondWith(
      caches.match(req).then((cacheado) => cacheado || fetch(req).then((resp) => {
        if (resp.ok || resp.type === 'opaque') {
          const copia = resp.clone();
          caches.open(CACHE_EXTERNO).then((c) => c.put(req, copia));
        }
        return resp;
      }))
    );
    return;
  }

  // Arquivos do próprio app: cache primeiro, atualizando em segundo plano.
  if (url.origin === self.location.origin) {
    evento.respondWith(
      caches.match(req).then((cacheado) => {
        const daRede = fetch(req).then((resp) => {
          if (resp.ok) {
            const copia = resp.clone();
            caches.open(CACHE_APP).then((c) => c.put(req, copia));
          }
          return resp;
        }).catch(() => cacheado);
        return cacheado || daRede;
      })
    );
  }
});

/* ---------- Mensagem vinda da página ---------- */
self.addEventListener('message', (evento) => {
  if (evento.data === 'atualizar-agora') self.skipWaiting();
});
