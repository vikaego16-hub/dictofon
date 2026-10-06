// Кэширует страницу, библиотеку и модель, чтобы всё работало без интернета.
// Заодно добавляет заголовки для многопоточного режима (быстрее расшифровка).
const SHELL = 'dikt-shell-v1';
const BIG = 'dikt-big-v1'; // vendor/ и models/ (тяжёлые, не меняются)
const FILES = ['./', 'index.html', 'worker.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
// vendor/ или корень: кэшируются при первом обращении (см. fetch ниже)

function iso(res) {
  if (!res || res.type === 'opaque' || res.status === 0) return res;
  const h = new Headers(res.headers);
  h.set('Cross-Origin-Opener-Policy', 'same-origin');
  h.set('Cross-Origin-Embedder-Policy', 'require-corp');
  h.set('Cross-Origin-Resource-Policy', 'same-origin');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== SHELL && k !== BIG).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  const r = e.request;
  const u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  const big = u.pathname.includes('/models/') || u.pathname.includes('/vendor/') || /ort-wasm|transformers\.min\.js/.test(u.pathname);
  e.respondWith((async () => {
    const c = await caches.open(big ? BIG : SHELL);
    const hit = await c.match(r, { ignoreSearch: true });
    if (big && hit) return iso(hit);
    try {
      const net = await fetch(r);
      if (net.ok && net.status === 200 && !r.headers.has('range')) c.put(r, net.clone());
      return iso(net);
    } catch (err) {
      if (hit) return iso(hit);
      throw err;
    }
  })());
});
