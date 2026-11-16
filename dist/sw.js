'use strict';

const CACHE_VERSION = 'd9c04682b3cfa7f7';
const scope = new URL(self.registration.scope);
const prefix = `space-atlas:${scope.pathname}:`;
const cacheName = `${prefix}${CACHE_VERSION}`;
const url = path => new URL(path, scope).href;
const homeUrl = url('./');
const indexUrl = url('index.html');
const catalogUrl = url('data/catalog.json');
const shell = new Map([
  [indexUrl, /^text\/html\b/],
  [url('app.js'), /^(?:text|application)\/(?:x-)?javascript\b/],
  [url('pwa.js'), /^(?:text|application)\/(?:x-)?javascript\b/],
  [url('styles.css'), /^text\/css\b/],
  [url('app.webmanifest'), /^application\/(?:manifest\+)?json\b/],
  [url('assets/icons/atlas-192.png'), /^image\/png\b/],
  [url('assets/icons/atlas-512.png'), /^image\/png\b/],
  [url('assets/icons/apple-touch-icon.png'), /^image\/png\b/]
]);

async function readCatalog(response) {
  const catalog = await response.json();
  if (!Array.isArray(catalog.objects) || !catalog.objects.length ||
      (CACHE_VERSION !== 'development' && catalog.cacheVersion !== CACHE_VERSION)) {
    throw new Error('Unexpected catalog version');
  }
  return catalog;
}

function assetsFor(catalog) {
  const assets = new Map(shell);
  for (const { image, gallery = [] } of catalog.objects) {
    for (const entry of [image, ...gallery]) {
      if (!entry?.file) continue;
      const address = new URL(entry.file, scope);
      if (address.origin === scope.origin && address.pathname.startsWith(scope.pathname)) {
        assets.set(address.href, /^image\//);
      }
    }
  }
  return assets;
}

async function fetchAsset(address, expectedType) {
  const response = await fetch(address, { cache: 'reload' });
  if (!response.ok || !expectedType.test(response.headers.get('Content-Type') || '')) {
    throw new Error(`Unexpected asset response: ${address}`);
  }
  return response;
}

async function missingAssets(cache, assets) {
  const checks = await Promise.all([...assets].map(async ([address, type]) =>
    (await cache.match(address)) ? null : [address, type]));
  return checks.filter(Boolean);
}

async function prepareCache() {
  const cache = await caches.open(cacheName);
  const cachedCatalog = await cache.match(catalogUrl);
  if (cachedCatalog) {
    const catalog = await readCatalog(cachedCatalog).catch(() => null);
    if (catalog && !(await missingAssets(cache, assetsFor(catalog))).length) return;
  }

  // Verify the catalog belongs to this deployment before repairing its cache.
  const response = await fetchAsset(catalogUrl, /^application\/json\b/);
  const catalog = await readCatalog(response.clone());
  const missing = await missingAssets(cache, assetsFor(catalog));
  const writes = await Promise.allSettled(missing.map(async ([address, type]) => {
    await cache.put(address, await fetchAsset(address, type));
  }));
  const failed = writes.find(write => write.status === 'rejected');
  if (failed) throw failed.reason;
  await cache.put(catalogUrl, response);
}

let preparing;
function ensureCache() {
  preparing ??= prepareCache().finally(() => { preparing = undefined; });
  return preparing;
}

self.addEventListener('install', event => {
  // An update waits for open pages on the old version to finish.
  event.waitUntil(ensureCache());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const oldCaches = (await caches.keys()).filter(name => name.startsWith(prefix) && name !== cacheName);
    await Promise.all(oldCaches.map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type !== 'atlas-offline-status' || !event.ports[0]) return;
  const port = event.ports[0];
  event.waitUntil(ensureCache().then(
    () => port.postMessage('ready'),
    () => port.postMessage('unavailable')
  ));
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || request.headers.has('Range')) return;
  const requested = new URL(request.url);
  if (requested.origin !== scope.origin || !requested.pathname.startsWith(scope.pathname)) return;
  requested.hash = '';
  if (request.mode === 'navigate') requested.search = '';
  const address = requested.href;
  const key = address === homeUrl ? indexUrl : address;
  event.respondWith(caches.open(cacheName)
    .then(cache => cache.match(key))
    .catch(() => undefined)
    .then(response => response || fetch(request)));
});
