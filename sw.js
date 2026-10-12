/* Runye PWA v1. Increment VERSION when changing the offline shell. */
'use strict';
/* VERSION 沿革：v380-cache-fix（另一会话的缓存修复）→ v381-plugin-aiplan（本次新增 ai-plan
   插件 + core/data-service.js、core/event-bus.js、core/ui-shell.js 均在 CORE 白名单内，必须抬版本，
   否则离线态会取旧文件）→ v382-da-decouple（数字农业与灌溉工具完全剥离：
   删桥接层文件及其在 index.html 的引入与调用点，CORE 列表同步移除该项）→
   v383-thin-scrollbar（两项：① 用户要求全站滚动条最窄最短——runye-theme.css 删除压制自定义的
   标准属性 scrollbar-width（有头实测 Chrome/143 下 thin=10px、默认=15px、仅 webkit 4px=4px），
   全局 webkit 4px 半透明灰圆角丸，mod/style-01/02/05.css、filter-system、network-editor.css 的
   5px 覆盖同步对齐；② 用户要求「管网装配（平面图）」功能全部取消——network-editor.js
   EDITOR_OFF 总开关置 true，卡片/叠加层/观察器整体下线。以上均在 CORE 白名单内，必须抬版本）→
   v384-sprinkler（喷灌专项 TASK_sprinkler-pipeline_20261012 全链路：terrain 直接填间距 12×12 +
   sprinklerBom/tankVolumeEstimate/boostModel + terrain 页 BOM 落桥 + 新增 plugins/sprinkler 壳插件
   两文件进 CORE 白名单，必须抬版本）→ v385-global-open（并行会话：全站功能暂全开放）→
   v386-undock（用户指令剥离四功能入口：多地块规划/管路拼装/经济指标分析/数字化建模——runye-nav.js
   MORE_ITEMS 摘四行、智能规划侧栏摘四链接、plugins.json 移除 pipe-assemble 壳插件、CORE 同步移除
   其两文件；业务文件全部保留，将来把对应行/条目加回即可恢复，必须抬版本）→
   v387-nav-flat（用户指令：「更多」内容全部展开到顶栏——runye-nav.js 六项移入 ITEMS、
   MORE_ITEMS 置空保留面板承接管网优化详细分析，必须抬版本）→ v388-plugin-control（全站外挂插件开关：
   loader 启动前读取服务端配置，新增 plugin-admin.html 与云函数接口；后台纳入 CORE，必须抬版本）→
   v389-nav-panel-preserve（修复 v388 引入的时序回归：loader 的 controlPromise 网络等待把 pipe-optim
   插件接管推迟到权益重渲染之后，「更多」面板随导航重建被清空、注入的「管网优化详细分析」按钮丢失
   → 插件容器判定 null 错落顶栏、面板恒空（compact 闸门 M2/M3/M4 红）。runye-nav.js mount()
   重建前保留面板内外部注入按钮（排除 data-ry-navitem / data-ry-plugin-nav / data-ry-mbr，
   后两者由 ui-shell 自行重挂防双份），新面板建好后回插。runye-nav.js 在 CORE 白名单内，必须抬版本）→
   v390-plugin-migrate-4（用户指令：过滤系统/材料清单/轴测图/系统图四项作为外挂插件接入主程序；
   生成系统图与地块绘制留在主程序不动。新增 plugins/filter-system、material-list、iso-view、sys-view
   四个壳插件（业务零改动，接管 runye-nav 老导航项 + 重渲染抑制器），八文件进 CORE 白名单，必须抬版本）。 */
const VERSION = 'v390-plugin-migrate-4';
const BASE = new URL('./', self.location.href);
const PREFIX = 'runye-pwa-' + BASE.pathname + '-';
const CORE_CACHE = PREFIX + VERSION + '-core';
const RUNTIME_CACHE = PREFIX + VERSION + '-runtime';
const CORE = [
  /* [插件化阶段一 2026-10-11] 插件体系静态资源。
     ★ 新增插件必须同步登记到本列表，否则 PWA 离线态取不到（在线仍可用：本 SW 为 network-first）。
     ★ 注意：key() 会抹掉 ?v= 查询串，因此带版本号破缓存与这里的登记互不冲突。 */
  "plugins.json",
  "core/bootstrap.js",
  "core/loader.js",
  "core/event-bus.js",
  "core/data-service.js",
  "core/ui-shell.js",
  "core/runtime-guard.js",
  "plugins/hello-world/manifest.json",
  "plugins/hello-world/main.js",
  "plugins/archive/manifest.json",
  "plugins/archive/main.js",
  "plugins/archive/style.css",
  "plugins/bom/manifest.json",
  "plugins/bom/main.js",
  "plugins/bom/style.css",
  "plugins/case-lib/manifest.json",
  "plugins/case-lib/main.js",
  "plugins/case-lib/style.css",
  "plugins/pipe-optim/manifest.json",
  "plugins/pipe-optim/main.js",
  "plugins/calib/manifest.json",
  "plugins/calib/main.js",
  "plugins/calib/style.css",
  /* [v377] 水力校核壳迁移插件 */
  "plugins/hydraulics/manifest.json",
  "plugins/hydraulics/main.js",
  /* [v385] 管路拼装壳插件随四功能剥离下线（页面文件保留，恢复时把两行加回） */
  /* [v381] 智能规划壳迁移插件（独立窗口入口） */
  "plugins/ai-plan/manifest.json",
  "plugins/ai-plan/main.js",
  /* [v384] 喷灌成果壳插件（terrain 内核宿主，任务书 TASK_sprinkler-pipeline_20261012） */
  "plugins/sprinkler/manifest.json",
  "plugins/sprinkler/main.js",
  /* [v390] 四功能壳迁移插件：过滤系统 / 材料清单 / 轴测图 / 系统图（业务零改动，只接管导航入口） */
  "plugins/filter-system/manifest.json",
  "plugins/filter-system/main.js",
  "plugins/material-list/manifest.json",
  "plugins/material-list/main.js",
  "plugins/iso-view/manifest.json",
  "plugins/iso-view/main.js",
  "plugins/sys-view/manifest.json",
  "plugins/sys-view/main.js",
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
  "plugin-admin.html",
  "runye-inverse-design.js",
  "runye-inverse-design.css",
  "runye-terrain.js",
  "runye-terrain.css",
  "runye-ai-plan.js",
  "runye-ai-plan.css",
  "runye-ai-chat-test.html",
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
  "runye-typography.css",
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
