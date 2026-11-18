// Szókártyák service worker: the game works offline; photos are kept once seen or saved.
const VERSION = 'szokartyak-v1';
const PHOTOS = 'szokartyak-photos';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('szokartyak-') && k !== VERSION && k !== PHOTOS).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// cross-origin files are fetched in CORS mode so the browser stores their real size
// (an opaque response is counted as several megabytes and would fill the storage quickly)
async function getFresh(req){
  if (new URL(req.url).origin === self.location.origin) return fetch(req);
  try { return await fetch(new Request(req.url, { mode:'cors', credentials:'omit' })); }
  catch (e){ return fetch(req); }
}
async function networkFirst(req, cacheName){
  const cache = await caches.open(cacheName);
  try {
    const res = await getFresh(req);
    if (res && res.ok) await cache.put(req.url, res.clone()).catch(() => {});
    return res;
  } catch (err){
    const hit = await cache.match(req.url, { ignoreSearch: req.mode === 'navigate', ignoreVary: true });
    if (hit) return hit;
    if (req.mode === 'navigate') { const page = await cache.match('./index.html'); if (page) return page; }
    throw err;
  }
}
async function cacheFirst(req, cacheName){
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req.url, { ignoreVary: true });
  if (hit) return hit;
  const res = await getFresh(req);
  if (res && res.ok) await cache.put(req.url, res.clone()).catch(() => {});
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin){
    // the game page itself: always try for the newest version, fall back to the saved one offline
    if (req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/')) e.respondWith(networkFirst(req, VERSION));
    else e.respondWith(cacheFirst(req, VERSION));
  } else if (url.hostname === 'upload.wikimedia.org'){
    e.respondWith(cacheFirst(req, PHOTOS));
  } else if (url.hostname.endsWith('wikipedia.org')){
    e.respondWith(networkFirst(req, PHOTOS));
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'){
    e.respondWith(cacheFirst(req, VERSION));
  }
});
