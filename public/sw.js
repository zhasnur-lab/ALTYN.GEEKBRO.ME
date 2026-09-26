// ALTYN service worker: HTML/API — сеть, картинки — кэш.
const C = 'altyn-v1';
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/') || u.pathname.startsWith('/staff')) return;
  if (/\.(jpg|jpeg|png|webp|svg|woff2)$/.test(u.pathname)) {
    e.respondWith(caches.open(C).then(c => c.match(e.request).then(r => r || fetch(e.request).then(res => { if (res.ok) c.put(e.request, res.clone()); return res; }))));
  } else {
    e.respondWith(fetch(e.request).then(res => { if (res.ok) caches.open(C).then(c => c.put(e.request, res.clone())); return res; }).catch(() => caches.match(e.request)));
  }
});
