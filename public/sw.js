/* Tinselby service worker (registered by src/pwa: production https host, or localhost with ?pwa).
 *
 * The whole game is ONE index.html. Rules:
 *  - Page loads (navigations, /index.html): NETWORK FIRST. Online you always get the newest release from the server;
 *    each good response is copied into the cache. Only when the network fails (offline) is the cached copy served.
 *    There is deliberately no timeout fallback: a slow connection still waits for the fresh build.
 *  - /icons/*, /og.png, /manifest.webmanifest: cache first (they rarely change; bump VERSION when they do).
 *  - Everything else, and every request to another origin (PostHog, Supabase, Google Fonts), is not touched at all.
 */
const VERSION = 'v2'; // v2: knitted T icons (new file names so launchers and caches pick them up)
const CACHE = `tinselby-${VERSION}`;
const SCOPE = new URL(self.registration.scope);
const PAGE_KEY = new URL('./', SCOPE).href; // every page load (any ?query) is stored under the scope root
const STATIC = ['icons/tinselby-192.png', 'icons/tinselby-512.png', 'icons/tinselby-maskable-512.png', 'icons/tinselby-apple-180.png', 'manifest.webmanifest']
  .map((p) => new URL(p, SCOPE).href);

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // the page the player has open right now (revalidated against the server, so usually a cheap 304 from the HTTP cache)
    try {
      const res = await fetch(PAGE_KEY, { cache: 'no-cache', credentials: 'same-origin' });
      if (res.ok && res.type === 'basic') await c.put(PAGE_KEY, res);
    } catch (err) { /* offline while installing: the next online page load fills it */ }
    await Promise.all(STATIC.map((u) => c.add(new Request(u, { cache: 'no-cache' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('tinselby-') && k !== CACHE).map((k) => caches.delete(k)));
    try { if (self.registration.navigationPreload) await self.registration.navigationPreload.enable(); } catch (err) { /* */ }
    await self.clients.claim();
  })());
});

const isPage = (req, url) => req.mode === 'navigate' || (req.method === 'GET' && (url.pathname === SCOPE.pathname || url.pathname === `${SCOPE.pathname}index.html`) && (req.headers.get('accept') || '').includes('text/html'));
const isStatic = (url) => url.pathname.startsWith(`${SCOPE.pathname}icons/`) || url.pathname === `${SCOPE.pathname}og.png` || url.pathname === `${SCOPE.pathname}manifest.webmanifest`;

async function page(e) {
  try {
    const res = (await e.preloadResponse) || (await fetch(e.request));
    if (res && res.ok && res.type === 'basic' && (res.headers.get('content-type') || '').includes('text/html')) {
      const copy = res.clone();
      e.waitUntil(caches.open(CACHE).then((c) => c.put(PAGE_KEY, copy)).catch(() => {}));
    }
    return res;
  } catch (err) {
    // network failed (offline): the last release this device saw
    const hit = await caches.match(PAGE_KEY, { cacheName: CACHE });
    if (hit) return hit;
    throw err;
  }
}
async function staticFirst(e) {
  const c = await caches.open(CACHE);
  const hit = await c.match(e.request, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(e.request);
  if (res.ok && res.type === 'basic') e.waitUntil(c.put(e.request, res.clone()).catch(() => {}));
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== SCOPE.origin) return; // third-party (PostHog CDN, Supabase, fonts): straight to the network, never cached
  if (isPage(req, url)) { e.respondWith(page(e)); return; }
  if (isStatic(url)) { e.respondWith(staticFirst(e)); return; }
  // anything else (sw.js, pings, future assets): browser default
});
