/* Public app shell only. Private API responses and signed Blob URLs never enter Cache Storage. */
const CACHE = 'worship-shell-dev';
let preparing;
async function prepare() {
  if (preparing) return preparing;
  preparing = (async () => {
    const response = await fetch('/precache.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Missing build precache index');
    const urls = await response.json(); const cache = await caches.open(CACHE);
    for (let i = 0; i < urls.length; i += 8) await Promise.all(urls.slice(i, i + 8).map(async url => {
      if (url.startsWith('/_next/static/') && await cache.match(url)) return;
      const result = await fetch(url, { cache: 'reload' });
      if (!result.ok) throw new Error('Precache failed');
      await cache.put(url, result);
    }));
  })().finally(() => { preparing = null; });
  return preparing;
}
self.addEventListener('install', event => { event.waitUntil(prepare().then(() => self.skipWaiting())); });
self.addEventListener('activate', event => { event.waitUntil((async () => {
  // Retain one previous shell for an already-open operator while an update completes.
  const keys = (await caches.keys()).filter(key => key.startsWith('worship-shell-'));
  await Promise.all(keys.slice(0, -2).map(key => caches.delete(key)));
  await self.clients.claim();
})()); });
self.addEventListener('message', event => {
  if (event.data?.type === 'PREPARE') event.waitUntil(prepare().then(() => event.ports[0]?.postMessage({ ok: true })).catch(() => event.ports[0]?.postMessage({ ok: false })));
});
self.addEventListener('fetch', event => {
  const req = event.request; const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(async () => (await caches.open(CACHE)).match(url.pathname === '/' ? '/admin' : url.pathname).then(r => r || new Response('온라인에서 예배 자료 다운로드를 먼저 실행해 주세요.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }))));
  } else if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/vendor/') || url.pathname.startsWith('/icons/') || ['/favicon.ico', '/manifest.webmanifest'].includes(url.pathname)) {
    event.respondWith((async () => { const cache = await caches.open(CACHE); const existing = await cache.match(req) || await caches.match(req); if (existing) return existing; const result = await fetch(req); if (result.ok) await cache.put(req, result.clone()); return result; })());
  }
});
