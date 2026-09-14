/* ===========================================================
   CICLO FEMME — service worker

   Estratégias:
   - Navegação (abrir o app): rede primeiro, cache como reserva.
   - Ícones, manifest, fontes e SDK do Firebase: cache primeiro.
   - Firestore e Authentication: NUNCA passam pelo cache.

   COMO PUBLICAR UMA VERSÃO NOVA
   1. Troque o número em VERSAO (obrigatório, sempre).
   2. Se trocou algum ícone, renomeie os arquivos com o sufixo novo
      (icon-192-v5.png etc.), troque ICONES_V aqui e atualize o
      manifest.json, o <head> do index.html e o VERSAO_APP do app.
      Nome de arquivo novo é o único jeito garantido de o celular
      reconhecer que o ícone mudou.

   Esta versão NÃO usa skipWaiting() na instalação: a versão nova
   fica esperando e só entra quando a usuária tocar no aviso
   "Nova versão disponível". É isso que faz o aviso aparecer.
   =========================================================== */

const VERSAO = 'ciclo-femme-v4';
const ICONES_V = '4';                 // troque junto com os ícones
const CACHE_APP = `${VERSAO}-app`;
const CACHE_EXTERNO = `${VERSAO}-externo`;

const ARQUIVOS_DO_APP = [
  './',
  './index.html',
  './manifest.json?v=' + ICONES_V,
  './icons/icon-192-v' + ICONES_V + '.png',
  './icons/icon-512-v' + ICONES_V + '.png',
  './icons/icon-maskable-192-v' + ICONES_V + '.png',
  './icons/icon-maskable-512-v' + ICONES_V + '.png',
  './icons/apple-touch-icon-v' + ICONES_V + '.png',
  './icons/favicon-v' + ICONES_V + '.png',
  './icons/marcadagua-v' + ICONES_V + '.png'
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
    caches.open(CACHE_APP).then((cache) =>
      // cache: 'reload' ignora o cache HTTP do navegador e busca
      // os arquivos direto do servidor — sem isso o GitHub Pages
      // pode devolver a cópia antiga que o navegador guardou.
      cache.addAll(ARQUIVOS_DO_APP.map((u) => new Request(u, { cache: 'reload' })))
    )
    // sem skipWaiting aqui: quem decide é a usuária
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

/* ---------- Mensagens vindas da página ---------- */
self.addEventListener('message', (evento) => {
  if (evento.data === 'atualizar-agora') self.skipWaiting();

  // A página pergunta qual versão está rodando (tela "Mais").
  if (evento.data === 'qual-versao' && evento.source) {
    evento.source.postMessage({ tipo: 'versao', versao: VERSAO });
  }
});
