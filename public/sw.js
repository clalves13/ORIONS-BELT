// Service Worker do Orion Belt — cobre tanto o Gestão (/) quanto o Portal do Cliente (/portal).
// Estratégia:
//  - Chamadas de API (/api/*) NUNCA são cacheadas — sempre busca dado fresco da rede.
//    Isso evita o risco real de mostrar dado desatualizado (ex.: status de OS, contador de toner).
//  - Arquivos estáticos (HTML, CSS, ícones, manifest) usam "stale-while-revalidate":
//    mostra o que já está em cache na hora (rápido, funciona offline), e atualiza em segundo
//    plano para a próxima visita.
//
// IMPORTANTE: ao fazer mudanças grandes no front-end, suba o número da versão abaixo —
// isso força os navegadores a descartar o cache antigo automaticamente.
const CACHE_VERSION = 'orion-v1';

const PRECACHE_URLS = [
  '/',
  '/portal',
  '/manifest.json',
  '/manifest-portal.json',
  '/orion-theme-v8.css',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((nomes) =>
      Promise.all(nomes.filter((n) => n !== CACHE_VERSION).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // nunca intercepta POST/PUT/DELETE (login, salvar, etc.)

  const url = new URL(request.url);

  // API: sempre rede, nunca cache. Se estiver offline, devolve um erro claro em JSON
  // em vez de deixar a tela travada esperando uma resposta que nunca chega.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ error: 'Sem conexão com o servidor. Verifique sua internet.' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    return;
  }

  // Estático: stale-while-revalidate
  event.respondWith(
    caches.open(CACHE_VERSION).then(async (cache) => {
      const cached = await cache.match(request);
      const fresh = fetch(request)
        .then((resp) => { if (resp.ok) cache.put(request, resp.clone()); return resp; })
        .catch(() => null);
      return cached || fresh || new Response('Offline', { status: 503 });
    })
  );
});
