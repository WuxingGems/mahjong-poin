// Simpan file app supaya bisa dibuka tanpa internet. Naikkan VERSION tiap ada perubahan file.
const VERSION = 'mahjong-poin-v2';
const FILES = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest', 'icon.svg',
  'js/app.js', 'js/tiles.js', 'js/decompose.js',
  'js/rules/index.js', 'js/rules/common.js', 'js/rules/classical.js', 'js/rules/hongkong.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Jaringan dulu (supaya selalu versi terbaru), cadangan dari simpanan kalau offline.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request)),
  );
});
