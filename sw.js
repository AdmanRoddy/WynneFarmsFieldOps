// Field Ops service worker: lets the app open with no signal, and keeps aerial photo tiles on the phone.
const APP = 'fieldops-app-v4';
const TILES = 'fieldops-tiles-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './apple-touch-icon.png', './icon-192.png', './icon-512.png'];
const TILE_HOSTS = ['server.arcgisonline.com', 'tnmap.tn.gov', 'basemap.nationalmap.gov', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const MAX_TILES = 12000;

self.addEventListener('install', (e) => { e.waitUntil(caches.open(APP).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== APP && k !== TILES).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

let puts = 0;
async function trim() {
  const c = await caches.open(TILES); const keys = await c.keys();
  if (keys.length > MAX_TILES) for (const k of keys.slice(0, keys.length - MAX_TILES)) await c.delete(k);
}

self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Aerial tiles and fonts: from the phone first, then the network (and keep a copy)
  if (TILE_HOSTS.includes(url.hostname)) {
    e.respondWith((async () => {
      const c = await caches.open(TILES);
      const hit = await c.match(req, { ignoreVary: true });
      if (hit && (req.mode !== 'cors' || hit.type !== 'opaque')) return hit;
      try {
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') { c.put(req, res.clone()); if (++puts % 200 === 0) trim(); }
        return res;
      } catch (err) { if (hit) return hit; throw err; }
    })());
    return;
  }
  // The app itself: try the network so updates show up, fall back to the saved copy with no signal
  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      try { const res = await fetch(req); if (res.ok) { const c = await caches.open(APP); c.put(req, res.clone()); } return res; }
      catch (err) { const hit = await caches.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' ? await caches.match('./index.html') : null); if (hit) return hit; throw err; }
    })());
  }
});
