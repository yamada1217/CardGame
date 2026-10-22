// オフラインでも開けるように、アプリ本体をキャッシュする
const CACHE = 'ijinden-v18';
const ASSETS = ['./', 'index.html', 'css/style.css', 'css/builder.css', 'js/app.js', 'js/engine.js', 'js/cards.js', 'js/ai.js', 'js/cardview.js', 'js/zoom.js', 'js/fx.js', 'js/cpu-decks.js', 'js/art.js', 'js/sfx.js', 'js/online.js', 'js/decks.js', 'js/builder.js', 'js/firebase-config.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// 新しい版を優先し、つながらない時だけキャッシュを使う
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && new URL(e.request.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request)),
  );
});
