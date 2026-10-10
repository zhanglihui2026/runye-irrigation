/* Runye PWA v1. Increment VERSION when changing the offline shell. */
'use strict';
const VERSION = 'v362-invite-h5';
const BASE = new URL('./', self.location.href);
const PREFIX = 'runye-pwa-' + BASE.pathname + '-';
const CORE_CACHE = PREFIX + VERSION + '-core';
const RUNTIME_CACHE = PREFIX + VERSION + '-runtime';
const CORE = [
  /* [v357] 单文件拆分产物 */
  "mod/inline-01.js",
  "mod/inline-02.js",
  "mod/inline-03.js",
  "mod/inline-04.js",
  "mod/inline-05.js",
  "mod/inline-06.js",
  "mod/inline-07.js",
  "mod/inline-08.js",
  "mod/inline-09.js",
  "mod/inline-10.js",
  "mod/inline-11.js",
  "mod/inline-12.js",
  "mod/inline-13.js",
  "mod/inline-14.js",
  "mod/inline-15.js",
  "mod/inline-16.js",
  "mod/inline-17.js",
  "mod/inline-18.js",
  "mod/inline-19.js",
  "mod/inline-20.js",
  "mod/inline-21.js",
  "mod/inline-22.js",
  "mod/inline-23.js",
  "mod/inline-24.js",
  "mod/inline-25.js",
  "mod/inline-26.js",
  "mod/inline-27.js",
  "mod/inline-28.js",
  "mod/inline-29.js",
  "mod/inline-30.js",
  "mod/style-01.css",
  "mod/style-02.css",
  "mod/style-03.css",
  "mod/style-04.css",
  "mod/style-05.css",
  "filter-system/filter-system.css",
  "filter-system/filter-system.js",
  "hydraulic-calc/design-core.js",
  "hydraulic-calc/hc-core.js",
  "hydraulic-calc/hydraulic-calc.css",
  "hydraulic-calc/hydraulic-calc.js",
  "hydraulic-calc/hydraulics-wasm.js",
  "hydraulic-calc/native-bridge.js",
  "hydraulic-calc/pipe-path-loss.js",
  "index.html",
  "runye-inverse-design.js",
  "runye-inverse-design.css",
  "runye-terrain.js",
  "runye-terrain.css",
  "runye-ai-plan.js",
  "runye-ai-plan.css",
  "runye-ai-chat-test.html",
  "irrigation-bridge.js",
  "iso-diagram/editor.js",
  "iso-diagram/iso-diagram.css",
  "iso-diagram/iso-diagram.js",
  "iso-diagram/network-editor.css",
  "iso-diagram/network-editor.js",
  "iso-diagram/network-model.js",
  "iso-diagram/product-catalog.js",
  "manifest.webmanifest",
  "modeling/integration.js",
  "modeling/workspace.css",
  "pipe_optim_ui.js",
  "pwa/icons/apple-touch-icon.png",
  "pwa/icons/icon-192.png",
  "pwa/icons/icon-512.png",
  "pwa/icons/icon-maskable-512.png",
  "pwa/offline.html",
  "pwa/pwa.css",
  "pwa/pwa.js",
  "pwa/vendor/LICENSE",
  "pwa/vendor/epanet/index.mjs",
  "pwa/vendor/epanet/slim/index.mjs",
  "pwa/vendor/images/layers-2x.png",
  "pwa/vendor/images/layers.png",
  "pwa/vendor/images/marker-icon-2x.png",
  "pwa/vendor/images/marker-icon.png",
  "pwa/vendor/images/marker-shadow.png",
  "pwa/vendor/leaflet.css",
  "pwa/vendor/leaflet.js",
  "runye-dxf.js",
  "runye-material-audit.js",
  "runye-geo.js",
  "runye-hydraulics.html",
  "runye-hydraulics-core.js",
  "runye-landing.html",
  "runye-map-enhance.js",
  "runye-map-partition.js",
  "runye-map-measure.html",
  "runye-mobile-map-preview.css",
  "runye-mobile-map-preview.html",
  "runye-mobile-map-preview.js",
  "runye-mobile-partition.js",
  "runye-mobile.css",
  "runye-mobile.js",
  "runye-nav.css",
  "runye-nav.js",
  "runye-theme.css",
  "terrain/index.html",
  "terrain/terrain-core.js",
  "terrain/terrain-ui.js",
  "terrain/terrain.css",
  "tl-workspace/tl-auto-edits.js",
  "tl-workspace/tl-edit-pipes.js",
  "tl-workspace/tl-nodes.js",
  "tl-workspace/tl-path-measure.js",
  "tl-workspace/tl-workspace.css",
  "tl-workspace/tl-workspace.js"
];
const LEAFLET_CDN = 'https://unpkg.com/leaflet@1.9.4/dist/';
const LEAFLET_FILES = ['leaflet.js','leaflet.css','images/layers.png','images/layers-2x.png','images/marker-icon.png','images/marker-icon-2x.png','images/marker-shadow.png'];
const CORE_URLS = new Set(CORE.map(path => new URL(path, BASE).href));

self.addEventListener('install', event => {
  // Atomic install: retain the previous working worker if any required file fails.
  event.waitUntil(caches.open(CORE_CACHE).then(cache => cache.addAll(CORE.map(path => new Request(new URL(path, BASE), {cache:'reload'})))));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(PREFIX) && name !== CORE_CACHE && name !== RUNTIME_CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});
function key(url) {
  const result = new URL(url); result.search = ''; result.hash = '';
  if (result.pathname === BASE.pathname) result.pathname += 'index.html';
  return result.href;
}
async function save(request, response) {
  if (!response.ok || response.type === 'opaque' || /no-store/i.test(response.headers.get('Cache-Control') || '')) return;
  const url = key(request.url);
  if (CORE_URLS.has(url)) {
    await (await caches.open(CORE_CACHE)).put(url, response.clone());
    return;
  }
  // Only small static resources; never cache user uploads, APIs, tracking or map tiles.
  if (!/\.(?:html|js|css|png|svg|ico|woff2?)$/i.test(new URL(url).pathname)) return;
  const length = Number(response.headers.get('Content-Length'));
  if (!length || length > 2 * 1024 * 1024) return;
  const cache = await caches.open(RUNTIME_CACHE);
  await cache.put(url, response.clone());
  const entries = await cache.keys();
  for (const entry of entries.slice(0, Math.max(0, entries.length - 80))) await cache.delete(entry);
}
async function local(request, event) {
  try {
    const response = await fetch(request);
    if (response.ok) { event.waitUntil(save(request, response).catch(() => {})); return response; }
    const cached = await caches.match(key(request.url));
    if (!cached && request.mode === 'navigate' && (response.type === 'error' || response.status >= 500)) return caches.match(new URL('pwa/offline.html', BASE).href);
    return cached || response;
  } catch (error) {
    const cached = await caches.match(key(request.url));
    if (cached) return cached;
    if (request.mode === 'navigate') return caches.match(new URL('pwa/offline.html', BASE).href);
    throw error;
  }
}
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.href.startsWith(LEAFLET_CDN)) {
    const path = url.href.slice(LEAFLET_CDN.length).split('?')[0];
    if (LEAFLET_FILES.includes(path)) {
      event.respondWith(caches.match(new URL('pwa/vendor/' + path, BASE).href).then(cached => cached || fetch(request)));
    }
    return;
  }
  if (url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname) || url.pathname.endsWith('/sw.js')) return;
  if (request.mode === 'navigate' || /\.(?:js|css|png|svg|ico|woff2?|webmanifest)$/i.test(url.pathname)) {
    // Online always uses the server so subsequent releases cannot get stuck on old UI.
    event.respondWith(local(request, event));
  }
});
