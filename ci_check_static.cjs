#!/usr/bin/env node
/* =====================================================================
 * ci_check_static.cjs — CI 可跑的「零依赖静态闸门」（2026-10-02 v184 / P6）
 *
 * 为什么单独有这么一个文件（而不是直接跑 verify_ry_tool.js）：
 *   · verify_ry_tool.js（178 项 DOM/JS 契约）与 verify_settings.js 都被 .gitignore 的
 *     `verify_*.js` 排除 —— **不在版本库里** ⇒ GitHub Actions 的 checkout 上看不到它们；
 *   · `tests/` 目录整体被 .gitignore 排除（既有 13 个测试因「已跟踪」而保留在库中）；
 *   · 浏览器 smoke（tests/*.smoke.cjs）需要本机 Edge + puppeteer-core，CI 跑不了
 *     —— 它们仍由本机批跑 `_p1/_gates.cjs` 覆盖（P1/P5 的 5 条已纳入该批跑清单）。
 * 所以本文件只做「零依赖 + 纯文本」那一层，把四类最容易在改动中被静默改坏、
 * 而本地又没人跑的问题拦在推送/PR 上：
 *   ① 内联 <script> 语法（vm.Script 编译，不执行、无副作用）；
 *   ② HTML 内重复 id（**先剥 <script> 体与注释**，否则注释里引用的 id 会假红）；
 *   ③ 常量单一来源（管径 CAL_SERIES / PE_OD_SERIES、单价 TL_PIPE_PRICE_DEF 各只允许一处定义）；
 *   ⑥ 面板皮肤「双副本」不许漂移（scripts/check_panel_drift.cjs，v532）；
 *   ⑦ 全局滚动条只允许在 runye-theme.css 定义一次（v533）；
 *   ④ 主页面关键同步脚本的依赖顺序正确；主页面本地脚本、样式表、样式表本地 url()
 *      资源及插件清单声明的 manifest/入口与 Service Worker CORE 清单一致，未缓存项必须
 *      登记为有明确降级行为的可选项，且 CORE 资源必须存在且不重复。
 * 退出码：全过 0，任一不过 1（CI 靠退出码判定，别只 console.log 不设码）。
 *
 * 用法：node ci_check_static.cjs
 * ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const INDEX = path.join(ROOT, 'index.html');
const SW = path.join(ROOT, 'sw.js');

let pass = 0, fail = 0;
function check(name, ok, extra) {
  console.log((ok ? '  ✓ ' : '  ✗ FAIL ') + name + (extra ? ' — ' + extra : ''));
  if (ok) pass++; else fail++;
}

/* [v357] 单文件已拆分：mod/ 外链拼回虚拟单文件视图，①②③ 锚不变 */
const expandIndex = require('./expand_index.cjs');
const indexSource = fs.readFileSync(INDEX, 'utf8');
const html = expandIndex(INDEX);
const sw = fs.readFileSync(SW, 'utf8');

/* ---------- ① 内联 <script> 语法 ---------- */
const inline = [];
const reScript = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
let m;
while ((m = reScript.exec(html)) !== null) {
  if (/\bsrc\s*=/.test(m[1])) continue;          // 外链脚本跳过
  if (/\btype\s*=\s*["']?(?!text\/javascript|module|application\/javascript)/i.test(m[1])) continue;
  inline.push({ code: m[2], line: html.slice(0, m.index).split('\n').length + 1 });
}
let syntaxBad = [];
inline.forEach((b, i) => {
  try { new vm.Script(b.code, { filename: 'index.html#inline' + (i + 1) + '(line ' + b.line + ')' }); }
  catch (e) { syntaxBad.push('#' + (i + 1) + '@行' + b.line + ' ' + e.message); }
});
check('① 内联 <script> 语法（共 ' + inline.length + ' 段，vm.Script 编译）',
  inline.length > 0 && syntaxBad.length === 0, syntaxBad.slice(0, 3).join(' | '));

/* ---------- ② HTML 内重复 id ---------- */
/* 先剥 <script>…</script> 与 <style>…</style> 体（JS 里拼的 HTML 字符串不属于静态 DOM，
   CSS 注释里引用的 id 也不是元素 —— plotLibStyle 的两次历史假红，一次来自 <style> 内注释、
   一次来自 <!-- --> 注释），再剥 <!-- … -->。 */
const htmlOnly = html
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
  .replace(/<!--[\s\S]*?-->/g, '');
const ids = {};
const reId = /\bid\s*=\s*["']([^"']+)["']/g;
let k;
while ((k = reId.exec(htmlOnly)) !== null) { ids[k[1]] = (ids[k[1]] || 0) + 1; }
const dupIds = Object.keys(ids).filter((x) => ids[x] > 1);
check('② HTML 内 id 唯一（静态 DOM 共 ' + Object.keys(ids).length + ' 个 id）',
  dupIds.length === 0, dupIds.map((x) => x + '×' + ids[x]).join(','));

/* ---------- ④ 主页面脚本顺序与离线 CORE ---------- */
const coreMatch = sw.match(/const CORE = \[([\s\S]*?)\n\];/);
const coreSource = coreMatch ? coreMatch[1] : '';
const coreEntries = [...coreSource.matchAll(/^\s*"([^"\r\n]+)"\s*,?(?:\s*\/\*[^\r\n]*\*\/)?\s*$/gm)]
  .map((entry) => entry[1]);
const coreSet = new Set(coreEntries);
/* Detached 3D/axonometric code is retained only under feature-archive. Guard
   the live entry, navigation, plugin registry, and offline CORE against
   accidentally reconnecting its runtime assets. */
const archived3dMarkers = ['runye-pipe3d.js', 'pwa/vendor/three.min.js', 'iso-diagram/', 'network-editor.js', 'plugins/iso-view/'];
const archived3dSources = [
  ['index.html', indexSource],
  ['runye-nav.js', fs.readFileSync(path.join(ROOT, 'runye-nav.js'), 'utf8')],
  ['plugins.json', fs.readFileSync(path.join(ROOT, 'plugins.json'), 'utf8')],
  ['Service Worker CORE', coreEntries.join('\n')]
];
const archived3dReferences = [];
for (const [sourceName, sourceText] of archived3dSources) {
  for (const marker of archived3dMarkers) {
    if (sourceText.includes(marker)) archived3dReferences.push(sourceName + ' → ' + marker);
  }
}
check('④0 归档三维/轴测图不连接主程序、导航、插件清单或离线缓存', archived3dReferences.length === 0,
  archived3dReferences.join(' | '));
/* The old iframe navigation shell was retired after terrain and map tools were
   integrated into the main page. Keep its script/API/container out of active
   assembly and offline CORE so it cannot silently return as a parallel route. */
const legacyFrameShellSources = [
  ['index.html', indexSource],
  ['runye-nav.js', fs.readFileSync(path.join(ROOT, 'runye-nav.js'), 'utf8')],
  ['mod/inline-32.js', fs.readFileSync(path.join(ROOT, 'mod/inline-32.js'), 'utf8')],
  ['Service Worker CORE', coreEntries.join('\n')]
];
const legacyFrameShellMarkers = ['mod/inline-31.js', 'RyFrameShell', '#ryFrameShell', 'data-fr-page'];
const legacyFrameShellReferences = [];
for (const [sourceName, sourceText] of legacyFrameShellSources) {
  for (const marker of legacyFrameShellMarkers) {
    if (sourceText.includes(marker)) legacyFrameShellReferences.push(sourceName + ' → ' + marker);
  }
}
check('④0b 退役 iframe 导航壳不连接主页面、导航或离线缓存', legacyFrameShellReferences.length === 0,
  legacyFrameShellReferences.join(' | '));
const localPageScripts = new Set();
const missingPageScripts = [];
const pageScriptTags = [...indexSource.matchAll(/<script\b([^>]*)>/gi)];
const orderedPageScripts = [];
for (const match of pageScriptTags) {
  const attrs = match[1];
  const srcMatch = attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
  if (!srcMatch) continue;
  let url;
  try { url = new URL(srcMatch[1], 'https://runye.invalid/'); } catch (_) { continue; }
  if (url.origin !== 'https://runye.invalid') continue;
  const asset = decodeURIComponent(url.pathname.replace(/^\//, ''));
  orderedPageScripts.push({ asset, attrs });
  localPageScripts.add(asset);
  if (!fs.existsSync(path.join(ROOT, asset))) missingPageScripts.push(asset);
}
const localPageStylesheets = new Set();
const missingPageStylesheets = [];
for (const match of indexSource.matchAll(/<link\b([^>]*)>/gi)) {
  const attrs = match[1];
  if (!/\brel\s*=\s*["']?stylesheet\b/i.test(attrs)) continue;
  const hrefMatch = attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i);
  if (!hrefMatch) continue;
  let url;
  try { url = new URL(hrefMatch[1], 'https://runye.invalid/'); } catch (_) { continue; }
  if (url.origin !== 'https://runye.invalid') continue;
  const asset = decodeURIComponent(url.pathname.replace(/^\//, ''));
  localPageStylesheets.add(asset);
  if (!fs.existsSync(path.join(ROOT, asset))) missingPageStylesheets.push(asset);
}
const localStylesheetAssets = new Set();
const missingStylesheetAssets = [];
for (const stylesheet of localPageStylesheets) {
  let source;
  try { source = fs.readFileSync(path.join(ROOT, stylesheet), 'utf8'); }
  catch (_) { continue; }
  for (const match of source.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
    const reference = match[1].trim();
    if (!reference || reference[0] === '#' || /^(?:data:|blob:|https?:)/i.test(reference)) continue;
    let url;
    try { url = new URL(reference, 'https://runye.invalid/' + stylesheet); } catch (_) { continue; }
    if (url.origin !== 'https://runye.invalid') continue;
    const asset = decodeURIComponent(url.pathname.replace(/^\//, ''));
    localStylesheetAssets.add(asset);
    if (!fs.existsSync(path.join(ROOT, asset))) missingStylesheetAssets.push(asset);
  }
}

/* index.html 的经典脚本执行顺序是同步依赖契约。CORE 资源检查使用原始入口，
   因 expandIndex 会把 mod/ 外链替换成内联正文，不能从展开视图恢复真实资源列表或顺序。 */
const scriptOrderRules = [
  ['core/irrigation-data-store.js', 'mod/inline-09.js'],
  ['core/plot-library-store.js', 'mod/inline-13.js'],
  ['core/irrigation-data-store.js', 'runye-map-partition.js'],
  ['core/plot-library-store.js', 'runye-map-partition.js'],
  ['core/irrigation-data-store.js', 'mod/online-map.js'],
  ['core/plot-library-store.js', 'mod/online-map.js'],
  ['core/measured-area-bridge-store.js', 'mod/online-map.js'],
  ['core/irrigation-data-store.js', 'runye-map-enhance.js'],
  ['core/plot-library-store.js', 'runye-map-enhance.js'],
  ['core/measured-area-bridge-store.js', 'runye-map-enhance.js'],
  ['core/terrain-bridge-store.js', 'mod/online-map.js'],
  ['core/sprinkler-bridge-store.js', 'terrain/terrain-ui.js'],
  ['core/measured-area-bridge-store.js', 'terrain/terrain-ui.js'],
  ['hydraulic-calc/hc-core.js', 'terrain/terrain-core.js'],
  ['terrain/terrain-core.js', 'terrain/terrain-ui.js'],
  ['mod/material-formulas.js', 'mod/material-table.js'],
  ['mod/material-table.js', 'mod/inline-09.js'],
  ['mod/tl-polyline-geometry.js', 'mod/inline-09.js'],
  ['mod/plan-calc-render.js', 'mod/inline-09.js'],
  ['mod/inline-09.js', 'mod/tl-header-layout.js'],
  ['mod/inline-11.js', 'mod/plot-editor.js'],
  ['mod/head-system-svg.js', 'mod/inline-14.js']
];
const scriptOrderErrors = [];
for (const [before, after] of scriptOrderRules) {
  const beforeMatches = orderedPageScripts.filter((item) => item.asset === before);
  const afterMatches = orderedPageScripts.filter((item) => item.asset === after);
  if (beforeMatches.length !== 1 || afterMatches.length !== 1) {
    scriptOrderErrors.push(`${before} → ${after}：两项都必须在 index.html 中且各出现一次`);
    continue;
  }
  const beforeIndex = orderedPageScripts.indexOf(beforeMatches[0]);
  const afterIndex = orderedPageScripts.indexOf(afterMatches[0]);
  if (beforeIndex >= afterIndex) scriptOrderErrors.push(`${before} 必须先于 ${after}`);
}
const synchronousScriptAssets = [...new Set(scriptOrderRules.flat())];
for (const asset of synchronousScriptAssets) {
  const item = orderedPageScripts.find((candidate) => candidate.asset === asset);
  if (item && (/\b(?:async|defer)(?=\s|=|$)/i.test(item.attrs) || /\btype\s*=\s*["']module["']/i.test(item.attrs))) {
    scriptOrderErrors.push(`${asset} 必须保持同步经典脚本`);
  }
}
check('④a 同步脚本依赖顺序', scriptOrderErrors.length === 0, scriptOrderErrors.join(' | '));

/* A hydraulic design snapshot is valid for a network only when its explicit
   binding matches. Partition changes mark layouts needsReplan; keep the page
   from calculating against the retained, older design snapshot. */
const irrigationStoreSource = fs.readFileSync(path.join(ROOT, 'core/irrigation-data-store.js'), 'utf8');
const hydraulicsPageSource = fs.readFileSync(path.join(ROOT, 'runye-hydraulics-page.js'), 'utf8');
const hydraulicsRunMatch = hydraulicsPageSource.match(/function run\(\)\s*\{([\s\S]*?)\n\s*\}\s*\n\s*function kindTag/);
const hydraulicsRunSource = hydraulicsRunMatch ? hydraulicsRunMatch[1] : '';
const staleGateIndex = hydraulicsRunSource.indexOf("designState.status === 'stale'");
const hydraulicComputeIndex = hydraulicsRunSource.indexOf('Core.computeDesign');
const hydraulicSnapshotProducer = fs.readFileSync(path.join(ROOT, 'mod/inline-09.js'), 'utf8');
const hydraulicSnapshotBindingOk = irrigationStoreSource.includes('readHydraulicDesignStateForNetwork') &&
  !!hydraulicsRunMatch && staleGateIndex >= 0 && hydraulicComputeIndex > staleGateIndex &&
  hydraulicSnapshotProducer.includes('plotId: window.currentPlotId || null,') &&
  hydraulicSnapshotProducer.includes('designTs=hydraulicDesignSaved?hydraulicDesignTs:null');
check('④a2 水力校核拒绝重划/失配快照，三级新快照写入关联标识', hydraulicSnapshotBindingOk,
  hydraulicSnapshotBindingOk ? '' : '桥接状态校验、先于计算的过期门禁或生产端关联字段缺失');

const hydraulicCompatPage = fs.readFileSync(path.join(ROOT, 'runye-hydraulics.html'), 'utf8');
const hydraulicCompatRunMatch = hydraulicCompatPage.match(/function run\(\)\s*\{([\s\S]*?)\n\s*\}\s*\n\s*function kindTag/);
const hydraulicCompatRunSource = hydraulicCompatRunMatch ? hydraulicCompatRunMatch[1] : '';
const compatStaleGateIndex = hydraulicCompatRunSource.indexOf("designState.status === 'stale'");
const compatComputeIndex = hydraulicCompatRunSource.indexOf('Core.computeDesign');
const hydraulicCoreSource = fs.readFileSync(path.join(ROOT, 'runye-hydraulics-core.js'), 'utf8');
const hydraulicOverlayIdentityOk = irrigationStoreSource.includes('readNetworkLayoutStateForCurrentPlot') &&
  irrigationStoreSource.includes("overlay.version !== 2") &&
  irrigationStoreSource.includes("networkState.status !== 'current'") &&
  irrigationStoreSource.includes("normalizedId(overlay.plotId) !== normalizedId(network.plotId)") &&
  irrigationStoreSource.includes("normalizedId(overlay.designRevisionId) !== normalizedId(network.designRevisionId)") &&
  hydraulicCoreSource.includes('version: 2, networkTs:') && hydraulicCoreSource.includes('designRevisionId: net') &&
  hydraulicsPageSource.includes('readNetworkLayoutStateForCurrentPlot') &&
  !!hydraulicCompatRunMatch && hydraulicCompatPage.includes('readNetworkLayoutStateForCurrentPlot') &&
  compatStaleGateIndex >= 0 && compatComputeIndex > compatStaleGateIndex;
check('④a3 水力快照按当前地块与修订号配对，兼容页先拒绝失配再计算', hydraulicOverlayIdentityOk,
  hydraulicOverlayIdentityOk ? '' : '兼容页失配门禁、叠加层地块/修订身份校验或 v2 写入契约缺失');

/* Map geometry comes from the same global network slot as hydraulic checks.
   Require an explicit current-plot owner before drawing any pipe/device layer;
   if the storage adapter is absent, keep the plot map usable and suppress only
   the unavailable network overlay. */
const mapOwnershipSource = fs.readFileSync(path.join(ROOT, 'runye-map-enhance.js'), 'utf8');
const mapNetworkOwnerMatch = mapOwnershipSource.match(/function networkMatchesCurrentPlot\(network\)\s*\{([\s\S]*?)\n\s*\}\s*\n\s*function dnStyle/);
const mapNetworkOwnerBody = mapNetworkOwnerMatch ? mapNetworkOwnerMatch[1] : '';
const mapReadNetworkMatch = mapOwnershipSource.match(/function readNetwork\(\)\s*\{([\s\S]*?)\n\s*\}\s*\n\s*\/\* 地图只显示/);
const mapReadNetworkBody = mapReadNetworkMatch ? mapReadNetworkMatch[1] : '';
const mapRenderNetworkMatch = mapOwnershipSource.match(/function renderNetwork\(state, opts\)\s*\{([\s\S]*?)\n\s*\}\s*\n\s*\/\* ---- 导出：地块/);
const mapRenderNetworkBody = mapRenderNetworkMatch ? mapRenderNetworkMatch[1] : '';
const mapOwnerGateIndex = mapRenderNetworkBody.indexOf('networkMatchesCurrentPlot(net)');
const mapHydraulicReadIndex = mapRenderNetworkBody.indexOf('readHydraulicOverlay(net)');
const mapGeometryDrawIndex = mapRenderNetworkBody.indexOf('(net.segments || []).forEach');
const mapSourceDrawIndex = mapRenderNetworkBody.indexOf('if (net.sourcePos &&');
const mapValveDrawIndex = mapRenderNetworkBody.indexOf('if (net.valves &&');
const mapDripDrawIndex = mapRenderNetworkBody.indexOf('if (net.dripTapes &&');
const mapNetworkOwnershipOk = !!mapNetworkOwnerMatch &&
  mapNetworkOwnerBody.includes("network.plotId == null || network.plotId === ''") &&
  mapNetworkOwnerBody.includes('readNetworkLayoutStateForCurrentPlot') &&
  mapNetworkOwnerBody.includes("ownership.status === 'current'") &&
  !!mapReadNetworkMatch && mapReadNetworkBody.includes('readNetworkLayout') &&
  mapReadNetworkBody.includes('return null') &&
  !!mapRenderNetworkMatch && mapOwnerGateIndex >= 0 &&
  mapRenderNetworkBody.includes("reason: 'network-plot-binding-mismatch'") &&
  mapHydraulicReadIndex > mapOwnerGateIndex && mapGeometryDrawIndex > mapOwnerGateIndex &&
  mapSourceDrawIndex > mapOwnerGateIndex && mapValveDrawIndex > mapOwnerGateIndex &&
  mapDripDrawIndex > mapOwnerGateIndex;
check('④a4 在线地图管网几何只绘制当前地块快照，存储桥缺失时只隐藏管网层', mapNetworkOwnershipOk,
  mapNetworkOwnershipOk ? '' : '管网地块归属门禁、失配早退、存储桥缺失兜底或绘制前顺序契约缺失');

const networkOwnerFailClosed = irrigationStoreSource.includes("reason: 'network-plot-unbound'") &&
  irrigationStoreSource.includes('!anchor.ok || anchor.id == null') &&
  hydraulicsPageSource.includes("designState.reason === 'network-plot-unbound'") &&
  fs.readFileSync(path.join(ROOT, 'runye-hydraulics.html'), 'utf8').includes("designState.reason === 'network-plot-unbound'");
check('④a4b 水力与地图共用归属门禁：无地块ID或无当前锚点一律失效关闭', networkOwnerFailClosed,
  networkOwnerFailClosed ? '' : '归属身份缺失仍可能被判为 current，或页面未提示停止使用');

const onlineMapProjectSource = fs.readFileSync(path.join(ROOT, 'mod/online-map.js'), 'utf8');
const projectBindingValidationIndex = onlineMapProjectSource.indexOf('irrigationStore.validateNetworkPlotBinding(d.network,d.plots)');
const projectPlotWriteIndex = onlineMapProjectSource.indexOf('plotWrite=plotStore.replace(d.plots,plotSnapshot.revision)');
const projectNetworkOwnershipOk = irrigationStoreSource.includes('function validateNetworkPlotBinding(network, plots)') &&
  irrigationStoreSource.includes("error: 'network-plot-not-in-project'") &&
  irrigationStoreSource.includes("error: 'network-plot-ambiguous'") &&
  projectBindingValidationIndex >= 0 && projectBindingValidationIndex < projectPlotWriteIndex &&
  onlineMapProjectSource.includes('networkBinding.status===\'unbound\'') &&
  onlineMapProjectSource.includes('当前地块不匹配，地图暂不显示');
check('④a5 工程导入先验证管网归属，旧/失配快照明确提示并避免串图', projectNetworkOwnershipOk,
  projectNetworkOwnershipOk ? '' : '工程管网owner校验未在写入前运行，或成功提示未解释安全隐藏状态');

const mapPartitionSource = fs.readFileSync(path.join(ROOT, 'runye-map-partition.js'), 'utf8');
const partitionGeneratedNetworkScopeOk = mapPartitionSource.includes("plotsStore.generatedCurrentOwner(p)") &&
  mapPartitionSource.includes('var networkPlotId=designPlotId||p.id') &&
  mapPartitionSource.includes('readRawNetworkLayout(networkPlotId)') &&
  mapPartitionSource.includes('net.plotId===networkPlotId');
const scopedStoreOwnershipOk = irrigationStoreSource.includes("networkLayoutByPlot: 'runye_network_layout_by_plot_v1:'") &&
  irrigationStoreSource.includes("hydraulicDesignByPlot: 'runye_hydraulic_design_by_plot_v1:'") &&
  irrigationStoreSource.includes("hydraulicOverlayByPlot: 'runye_hydraulic_overlay_by_plot_v1:'") &&
  irrigationStoreSource.includes('function readScopedOrLegacy') &&
  irrigationStoreSource.includes('normalizedId(legacy.plotId) !== normalizedId(plotId)') &&
  irrigationStoreSource.includes('if (!anchor.ok || !anchor.id) return null;') &&
  irrigationStoreSource.includes('function preserveBoundLegacySnapshot') &&
  irrigationStoreSource.includes('readNetworkLayoutForPlot') &&
  irrigationStoreSource.includes('readHydraulicDesignForPlot(network.plotId)') &&
  irrigationStoreSource.includes('readHydraulicOverlayForPlot(network.plotId)') &&
  partitionGeneratedNetworkScopeOk &&
  mapPartitionSource.includes('restoreNetworkLayoutIfCurrent(expectedRaw,previousRaw,plotId)') &&
  onlineMapProjectSource.includes('networkScopeId=d.network==null?undefined:(d.network.plotId||null)') &&
  onlineMapProjectSource.includes('restoreNetworkLayoutIfCurrent(d.network==null?null:JSON.stringify(d.network),oldNetworkRaw,networkScopeId)');
check('④a6 管网/设计/叠加按地块隔离，自动地块映射回原设计管网，导入与分区回滚使用同一地块作用域', scopedStoreOwnershipOk,
  scopedStoreOwnershipOk ? '' : '地块作用域存储、旧槽兼容保全或按同一owner compare-and-restore 契约缺失');

/* Main-page network projection must follow the page's in-memory plot identity,
   not the cross-tab shared current-plot anchor used by convenience reads. */
const projectionStart = hydraulicSnapshotProducer.indexOf('/* [map-enhance] 管网反投卫星图');
const projectionEnd = hydraulicSnapshotProducer.indexOf('/* 系统简图图框同步', projectionStart);
const projectionSource = projectionStart >= 0 && projectionEnd > projectionStart
  ? hydraulicSnapshotProducer.slice(projectionStart, projectionEnd) : '';
const projectionWrites = [...projectionSource.matchAll(/writeNetworkLayout\(([^;]+)\);/g)].map((match) => match[1]);
const projectionPlotScopeOk = !!projectionSource &&
  projectionSource.includes('var plotId=window.currentPlotId || null;') &&
  projectionSource.includes('readRawNetworkLayout(plotId)') &&
  !projectionSource.includes('readNetworkLayout()') &&
  projectionSource.includes('if(plotId){') &&
  projectionSource.includes('capture(candidateNet,previousNetworkRaw)') &&
  projectionSource.includes('if(net && dd.poly && dd.poly.length>=3)') &&
  projectionWrites.length >= 2 && projectionWrites.every((args) => /,\s*plotId\s*$/.test(args)) &&
  mapPartitionSource.includes('writeNetworkLayout(network,network.plotId)') &&
  mapPartitionSource.includes('return commitPartitionResult(state,net,previousNetworkRaw)');
check('④a7 三级图面反投按页面地块读写，避免跨标签活动锚点串用', projectionPlotScopeOk,
  projectionPlotScopeOk ? '' : '反投必须读取页面地块原始快照、显式限定管网owner，并让分区库与管网事务一致');

const projectSessionSource = fs.readFileSync(path.join(ROOT, 'mod/inline-12.js'), 'utf8');
/* [v662 门禁维护] writeCurrentPlotAnchor 签名扩为 (id, options)（AI 跨标签 handoff 隔离：
   isolated 恢复时带 {sharedDefault:false}，不再写共享 localStorage 默认槽）——
   提取正则与调用断言放宽为兼容新旧签名，契约语义不变：标签页锚点只走 sessionStorage 适配器。 */
const projectAnchorWriterMatch = projectSessionSource.match(/function writeCurrentPlotAnchor\(id(?:,\s*options)?\)\s*\{([\s\S]*?)\n\s*\}/);
const projectAutoRestoreMatch = projectSessionSource.match(/function ryAutoRestoreProject\(\)\s*\{([\s\S]*?)\n\s*\}\s*\n\s*\/\* \[v327\]/);
const projectAnchorWriterBody = projectAnchorWriterMatch ? projectAnchorWriterMatch[1] : '';
const projectAutoRestoreBody = projectAutoRestoreMatch ? projectAutoRestoreMatch[1] : '';
const tabAnchorOwnershipOk = irrigationStoreSource.includes("currentPlotAnchorByTab: 'runye_current_plot_tab_v1'") &&
  irrigationStoreSource.includes('root.sessionStorage.getItem(KEYS.currentPlotAnchorByTab)') &&
  irrigationStoreSource.includes('root.sessionStorage.setItem(KEYS.currentPlotAnchorByTab, raw)') &&
  irrigationStoreSource.includes('readCurrentPlotAnchor: readCurrentPlotAnchor') &&
  projectAnchorWriterBody.includes("typeof store.writeCurrentPlotAnchor!=='function') return false") &&
  /store\.writeCurrentPlotAnchor\(id[),]/.test(projectAnchorWriterBody) &&
  !projectAnchorWriterBody.includes('localStorage.') &&
  projectAutoRestoreBody.includes("typeof store.readCurrentPlotAnchor!=='function') return") &&
  projectAutoRestoreBody.includes('store.readCurrentPlotAnchor()') &&
  !projectAutoRestoreBody.includes("getItem('runye_current_plot_v1'") &&
  !projectAutoRestoreBody.includes('getItem(CUR_PLOT_KEY') &&
  !projectAutoRestoreBody.includes('CUR_PLOT_KEY');
check('④a8 当前标签页只经锚点适配器读写，适配器缺失时不回退共享锚点', tabAnchorOwnershipOk,
  tabAnchorOwnershipOk ? '' : '工程存取未通过sessionStorage适配器，或适配器缺失时仍读写共享锚点');

/* The standalone terrain page has its own classic-script assembly. Keep its
   storage bridges and shared hydraulic core ahead of the terrain consumers,
   and make sure these assets remain available to the offline CORE cache. */
const terrainPage = path.join(ROOT, 'terrain', 'index.html');
const terrainSource = fs.readFileSync(terrainPage, 'utf8');
const terrainScripts = [];
for (const match of terrainSource.matchAll(/<script\b([^>]*)>/gi)) {
  const srcMatch = match[1].match(/\bsrc\s*=\s*["']([^"']+)["']/i);
  if (!srcMatch) continue;
  const asset = path.posix.normalize(path.posix.join('terrain', decodeURIComponent(srcMatch[1].split(/[?#]/, 1)[0])));
  terrainScripts.push({ asset, attrs: match[1] });
}
const terrainOrderRules = [
  ['core/terrain-bridge-store.js', 'terrain/terrain-core.js'],
  ['core/sprinkler-bridge-store.js', 'terrain/terrain-core.js'],
  ['core/measured-area-bridge-store.js', 'terrain/terrain-core.js'],
  ['hydraulic-calc/hc-core.js', 'terrain/terrain-core.js'],
  ['terrain/terrain-core.js', 'terrain/terrain-ui.js']
];
const terrainOrderErrors = [];
const terrainRequiredAssets = [...new Set(terrainOrderRules.flat())];
for (const asset of terrainRequiredAssets) {
  const matches = terrainScripts.filter((item) => item.asset === asset);
  if (matches.length !== 1) {
    terrainOrderErrors.push(`${asset}：terrain/index.html 中必须且只出现一次`);
    continue;
  }
  if (/\b(?:async|defer)(?=\s|=|$)/i.test(matches[0].attrs) || /\btype\s*=\s*["']module["']/i.test(matches[0].attrs)) {
    terrainOrderErrors.push(`${asset} 必须保持同步经典脚本`);
  }
  if (!coreSet.has(asset)) terrainOrderErrors.push(`${asset} 未纳入 Service Worker CORE`);
  if (!fs.existsSync(path.join(ROOT, asset))) terrainOrderErrors.push(`${asset} 文件缺失`);
}
for (const [before, after] of terrainOrderRules) {
  const beforeIndex = terrainScripts.findIndex((item) => item.asset === before);
  const afterIndex = terrainScripts.findIndex((item) => item.asset === after);
  if (beforeIndex >= 0 && afterIndex >= 0 && beforeIndex >= afterIndex) terrainOrderErrors.push(`${before} 必须先于 ${after}`);
}
check('④b 独立地形页桥接、公式与计算脚本顺序及 CORE 缓存', terrainOrderErrors.length === 0,
  terrainOrderErrors.join(' | '));

/* The standalone map page also uses map-enhance for plot overlays and
   hydraulic overlays. Keep both stores loaded before that adapter. */
const mapPage = path.join(ROOT, 'runye-map-measure.html');
const mapPageSource = fs.readFileSync(mapPage, 'utf8');
const mapPageScripts = [];
for (const match of mapPageSource.matchAll(/<script\b([^>]*)>/gi)) {
  const srcMatch = match[1].match(/\bsrc\s*=\s*["']([^"']+)["']/i);
  if (!srcMatch) continue;
  const asset = path.posix.normalize(decodeURIComponent(srcMatch[1].split(/[?#]/, 1)[0]));
  mapPageScripts.push({ asset, attrs: match[1] });
}
const mapPageOrderRules = [
  ['core/irrigation-data-store.js', 'runye-map-enhance.js'],
  ['core/plot-library-store.js', 'runye-map-enhance.js'],
  ['core/measured-area-bridge-store.js', 'runye-map-enhance.js'],
  ['core/irrigation-data-store.js', 'runye-map-partition.js'],
  ['core/plot-library-store.js', 'runye-map-partition.js']
];
const mapPageOrderErrors = [];
for (const asset of [...new Set(mapPageOrderRules.flat())]) {
  const matches = mapPageScripts.filter((item) => item.asset === asset);
  if (matches.length !== 1) {
    mapPageOrderErrors.push(`${asset}：runye-map-measure.html 中必须且只出现一次`);
    continue;
  }
  if (!coreSet.has(asset)) mapPageOrderErrors.push(`${asset} 未纳入 Service Worker CORE`);
  if (!fs.existsSync(path.join(ROOT, asset))) mapPageOrderErrors.push(`${asset} 文件缺失`);
}
for (const [before, after] of mapPageOrderRules) {
  const beforeIndex = mapPageScripts.findIndex((item) => item.asset === before);
  const afterIndex = mapPageScripts.findIndex((item) => item.asset === after);
  if (beforeIndex >= 0 && afterIndex >= 0 && beforeIndex >= afterIndex) mapPageOrderErrors.push(`${before} 必须先于 ${after}`);
}
check('④c 独立地图页存储桥先于地图适配器并纳入 CORE', mapPageOrderErrors.length === 0,
  mapPageOrderErrors.join(' | '));

/* CloudBase 仅提供云端能力；cloud-sync.js 在 SDK 缺失时保留本地模式。 */
const optionalPageScripts = new Map([
  ['pwa/vendor/cloudbase-js-sdk-3.8.2.bundle.js', '云端 SDK 可选；缺失时 cloud-sync.js 降级到本地模式']
]);
const notCached = [...localPageScripts].filter((asset) => !coreSet.has(asset) && !optionalPageScripts.has(asset));
const uncachedPageStylesheets = [...localPageStylesheets].filter((asset) => !coreSet.has(asset));
const uncachedStylesheetAssets = [...localStylesheetAssets].filter((asset) => !coreSet.has(asset));
const missingCoreFiles = coreEntries.filter((asset) => !fs.existsSync(path.join(ROOT, asset)));
const duplicateCoreEntries = coreEntries.filter((asset, index) => coreEntries.indexOf(asset) !== index);
const pluginAssets = ['plugins.json'];
const pluginManifestErrors = [];
const pluginStylesheets = new Set();
try {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'plugins.json'), 'utf8'));
  for (const plugin of (Array.isArray(config.plugins) ? config.plugins : [])) {
    const base = String(plugin.path || '').replace(/\\/g, '/').replace(/\/+$/, '') + '/';
    const manifestPath = base + 'manifest.json';
    pluginAssets.push(manifestPath);
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, manifestPath), 'utf8'));
      const entryAsset = base + (manifest.entry || 'main.js');
      pluginAssets.push(entryAsset);
      const entrySource = fs.readFileSync(path.join(ROOT, entryAsset), 'utf8');
      /* 插件经 import.meta.url 拼出的本地脚本/样式也属于运行时资源契约。
         例如 contour-dxf 懒加载 terrain-core.js，多个插件在 activate 时再挂 style.css。 */
      for (const reference of entrySource.matchAll(/new\s+URL\(\s*["']([^"']+\.(?:css|js|mjs|json|wasm|svg|png|jpe?g|gif|woff2?))([?#][^"']*)?["']\s*,\s*import\.meta\.url\s*\)/gi)) {
        const resource = path.posix.normalize(path.posix.join(path.posix.dirname(entryAsset), reference[1]));
        pluginAssets.push(resource);
        if (/\.css$/i.test(resource)) pluginStylesheets.add(resource);
      }
      /* 覆盖通过路径常量拼出 SITE_ROOT + file 的串行脚本注入（例如 CORE_CHAIN/CORE_FILE）。 */
      for (const reference of entrySource.matchAll(/\b(?:file\s*:|CORE_FILE\s*=)\s*["']([^"']+\.(?:js|mjs))["']/gi)) {
        pluginAssets.push(reference[1].replace(/\\/g, '/'));
      }
    } catch (error) {
      pluginManifestErrors.push(manifestPath + '：' + error.message);
    }
  }
} catch (error) {
  pluginManifestErrors.push('plugins.json：' + error.message);
}
const missingPluginAssets = pluginAssets.filter((asset) => !fs.existsSync(path.join(ROOT, asset)));
const uncachedPluginAssets = pluginAssets.filter((asset) => !coreSet.has(asset));
const pluginStyleDependencies = new Set();
const missingPluginStyleDependencies = [];
for (const stylesheet of pluginStylesheets) {
  let source;
  try { source = fs.readFileSync(path.join(ROOT, stylesheet), 'utf8'); }
  catch (_) { continue; }
  for (const match of source.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
    const reference = match[1].trim();
    if (!reference || reference[0] === '#' || /^(?:data:|blob:|https?:)/i.test(reference)) continue;
    let url;
    try { url = new URL(reference, 'https://runye.invalid/' + stylesheet); } catch (_) { continue; }
    if (url.origin !== 'https://runye.invalid') continue;
    const asset = decodeURIComponent(url.pathname.replace(/^\//, ''));
    pluginStyleDependencies.add(asset);
    if (!fs.existsSync(path.join(ROOT, asset))) missingPluginStyleDependencies.push(asset);
  }
}
const uncachedPluginStyleDependencies = [...pluginStyleDependencies].filter((asset) => !coreSet.has(asset));
check('④ 主页面本地脚本/样式表已纳入 Service Worker CORE（可选脚本须有明确降级理由）',
  !!coreMatch && notCached.length === 0 && uncachedPageStylesheets.length === 0 && uncachedStylesheetAssets.length === 0 && missingCoreFiles.length === 0 && missingPageScripts.length === 0 && missingPageStylesheets.length === 0 && missingStylesheetAssets.length === 0 && duplicateCoreEntries.length === 0 &&
    missingPluginAssets.length === 0 && uncachedPluginAssets.length === 0 && missingPluginStyleDependencies.length === 0 && uncachedPluginStyleDependencies.length === 0 && pluginManifestErrors.length === 0,
  [
    notCached.length ? '未缓存：' + notCached.join(', ') : '',
    uncachedPageStylesheets.length ? '样式表未缓存：' + uncachedPageStylesheets.join(', ') : '',
    uncachedStylesheetAssets.length ? '样式依赖未缓存：' + uncachedStylesheetAssets.join(', ') : '',
    missingCoreFiles.length ? 'CORE 文件缺失：' + missingCoreFiles.join(', ') : '',
    missingPageScripts.length ? '页面脚本文件缺失：' + missingPageScripts.join(', ') : '',
    missingPageStylesheets.length ? '页面样式表文件缺失：' + missingPageStylesheets.join(', ') : '',
    missingStylesheetAssets.length ? '样式依赖文件缺失：' + missingStylesheetAssets.join(', ') : '',
    duplicateCoreEntries.length ? 'CORE 重复：' + duplicateCoreEntries.join(', ') : '',
    missingPluginAssets.length ? '插件文件缺失：' + missingPluginAssets.join(', ') : '',
    uncachedPluginAssets.length ? '插件资源未缓存：' + uncachedPluginAssets.join(', ') : '',
    missingPluginStyleDependencies.length ? '插件样式依赖缺失：' + missingPluginStyleDependencies.join(', ') : '',
    uncachedPluginStyleDependencies.length ? '插件样式依赖未缓存：' + uncachedPluginStyleDependencies.join(', ') : '',
    pluginManifestErrors.length ? '插件清单错误：' + pluginManifestErrors.join('; ') : '',
    optionalPageScripts.size ? '显式可选：' + [...optionalPageScripts].map(([asset, reason]) => asset + '（' + reason + '）').join('; ') : ''
  ].filter(Boolean).join(' | '));

/* Economic settings are shared by several classic-script consumers. Keep their
   localStorage ownership in the adapter and preserve synchronous load order. */
const economicStoreAsset = 'core/economic-settings-store.js';
const economicConsumers = [
  'mod/inline-07.js', 'mod/inline-27.js', 'mod/inline-28.js', 'mod/material-table.js'
];
const economicKeys = ['runye_tlEconAssum', 'runye_tlEconPrices'];
const economicBoundaryErrors = [];
const economicStoreSource = fs.readFileSync(path.join(ROOT, economicStoreAsset), 'utf8');
for (const key of economicKeys) {
  if (!economicStoreSource.includes("'" + key + "'")) economicBoundaryErrors.push('适配器缺少键 ' + key);
}
for (const asset of economicConsumers) {
  const item = orderedPageScripts.find((candidate) => candidate.asset === asset);
  if (!item) { economicBoundaryErrors.push('消费者未在 index.html 装配：' + asset); continue; }
  const source = fs.readFileSync(path.join(ROOT, asset), 'utf8');
  if (!source.includes('RyEconomicSettingsStore.')) economicBoundaryErrors.push('消费者未调用适配器：' + asset);
  for (const key of economicKeys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const directAccess = new RegExp("(?:window\\.)?localStorage\\.(?:getItem|setItem|removeItem)\\s*\\(\\s*['\"]" + escaped + "['\"]");
    if (directAccess.test(source)) economicBoundaryErrors.push('消费者绕过适配器直接访问 ' + key + '：' + asset);
  }
  const storeIndex = orderedPageScripts.findIndex((candidate) => candidate.asset === economicStoreAsset);
  const consumerIndex = orderedPageScripts.indexOf(item);
  if (storeIndex < 0 || storeIndex >= consumerIndex) economicBoundaryErrors.push(economicStoreAsset + ' 必须先于 ' + asset + ' 加载');
}
check('⑤ 经济设置共享键由适配器统一读写并先行加载', economicBoundaryErrors.length === 0,
  economicBoundaryErrors.join(' | '));

/* runye-map-enhance supports standalone embedding when the shared plot store is
   absent. Keep the raw-key read strictly as a last-resort compatibility path,
   and require all writes to go through the revision-aware store. */
const mapEnhanceSource = fs.readFileSync(path.join(ROOT, 'runye-map-enhance.js'), 'utf8');
const plotReadBody = mapEnhanceSource.match(/function readPlotLibraryState\(\)\s*\{([\s\S]*?)\n\s*\}\s*\n\s*function readPlotLibrary\(\)/);
const plotReadBodyText = plotReadBody ? plotReadBody[1] : '';
const plotStoreProbeIndex = plotReadBodyText.indexOf("store && typeof store.read === 'function'");
const plotFallbackIndex = plotReadBodyText.indexOf("localStorage.getItem('runye_plot_library')");
const plotStoreWrite = /localStorage\.(?:setItem|removeItem)\s*\(\s*['"]runye_plot_library['"]/.test(mapEnhanceSource);
const plotReplaceUsesStore = /function replacePlotLibrary\(plots, revision\)\s*\{[\s\S]*?store\.replace\(plots, revision\)/.test(mapEnhanceSource);
const plotLibraryBoundaryOk = !!plotReadBody && plotStoreProbeIndex >= 0 && plotFallbackIndex > plotStoreProbeIndex &&
  !plotStoreWrite && plotReplaceUsesStore;
check('⑤b 地块库裸读仅为适配器缺席时的回退，写入必须经版本校验适配器', plotLibraryBoundaryOk,
  [plotReadBody ? '' : '读取函数结构变化', plotStoreProbeIndex >= 0 && plotFallbackIndex > plotStoreProbeIndex ? '' : '裸读未处于适配器缺席回退后',
    plotStoreWrite ? '发现适配器外直接写入' : '', plotReplaceUsesStore ? '' : '写入未委托适配器'].filter(Boolean).join(' | '));

/* High-risk cross-page snapshots have one storage owner. Consumer pages must
   call their bridge API instead of reaching into local/sessionStorage by key. */
const bridgeConsumerSources = [
  ['index.html', indexSource],
  ['mod/inline-09.js', fs.readFileSync(path.join(ROOT, 'mod/inline-09.js'), 'utf8')],
  ['mod/inline-12.js', fs.readFileSync(path.join(ROOT, 'mod/inline-12.js'), 'utf8')],
  ['mod/inline-13.js', fs.readFileSync(path.join(ROOT, 'mod/inline-13.js'), 'utf8')],
  ['mod/inline-16.js', fs.readFileSync(path.join(ROOT, 'mod/inline-16.js'), 'utf8')],
  ['mod/online-map.js', onlineMapProjectSource],
  ['runye-map-enhance.js', mapEnhanceSource],
  ['runye-map-partition.js', fs.readFileSync(path.join(ROOT, 'runye-map-partition.js'), 'utf8')],
  ['runye-hydraulics-page.js', hydraulicsPageSource],
  ['runye-hydraulics.html', hydraulicCompatPage],
  ['terrain/terrain-ui.js', fs.readFileSync(path.join(ROOT, 'terrain/terrain-ui.js'), 'utf8')],
  ['plugins/sprinkler/main.js', fs.readFileSync(path.join(ROOT, 'plugins/sprinkler/main.js'), 'utf8')]
];
const bridgeOwnedKeys = [
  'runye_network_layout', 'runye_hydraulic_design_v1', 'runye_hydraulic_overlay_v1',
  'runye_terrain_incoming', 'runye_terrain_incoming_tab_token', 'runyeMeasuredArea', 'runyeSprinklerResult'
];
const bridgeRawAccess = [];
for (const [sourceName, sourceText] of bridgeConsumerSources) {
  for (const key of bridgeOwnedKeys) {
    const keyLiteral = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const directStoreCall = new RegExp("(?:\\bwindow\\s*\\.\\s*|\\broot\\s*\\.\\s*|\\bglobal(?:This)?\\s*\\.\\s*)?(?:localStorage|sessionStorage)\\s*\\.\\s*(?:getItem|setItem|removeItem)\\s*\\(\\s*([\\\"'`])" + keyLiteral + "\\1");
    if (directStoreCall.test(sourceText)) bridgeRawAccess.push(sourceName + ' → ' + key);
  }
}
check('⑤c 跨页面地块/管网/地形/喷灌快照只通过存储桥访问', bridgeRawAccess.length === 0,
  bridgeRawAccess.join(' | '));

/* ---------- ③ 常量单一来源 ---------- */
function countDef(re) { return (html.match(re) || []).length; }
const calDef = countDef(/const CAL_SERIES = \[/g);
const peDef = countDef(/const PE_OD_SERIES = \[/g);
const priceDef = countDef(/var TL_PIPE_PRICE_DEF = \{/g);
check('③a 管径档位单一来源：CAL_SERIES 定义 1 处 / PE_OD_SERIES 定义 1 处',
  calDef === 1 && peDef === 1, 'CAL=' + calDef + ' PE_OD=' + peDef);
check('③b 管材单价默认表单一来源：TL_PIPE_PRICE_DEF 定义 1 处',
  priceDef === 1, 'n=' + priceDef);
/* 三处消费点必须引用同一全局（防有人把字面量塞回去） */
const priceRefs = ['var DEF=TL_PIPE_PRICE_DEF;', 'var PRICES_DEFAULT = TL_PIPE_PRICE_DEF;',
  'var PDEF = TL_PIPE_PRICE_DEF;'].filter((r) => html.indexOf(r) < 0);
check('③c 单价表三个消费点均引用同一全局', priceRefs.length === 0,
  priceRefs.length ? '缺引用：' + priceRefs.join(' | ') : '3/3');
/* 引用计数：定义之外至少各有一处使用，防「收敛成孤儿常量」 */
const calUse = countDef(/CAL_SERIES/g), peUse = countDef(/PE_OD_SERIES/g);
check('③d 常量确有使用点（不是收敛成孤儿）', calUse > 1 && peUse > 1 && priceDef >= 1,
  'CAL 出现 ' + calUse + ' 次 / PE_OD 出现 ' + peUse + ' 次');

/* ---------- ⑥ 面板双副本漂移（v532） ---------- */
/* 地块分区/三级管路的左栏在 body.ry-tool 下被 ry-cad-toolbar.js 搬进 #ryCadSide，
   搬走后 `#X .pp-yyy` 不再匹配 ⇒ index.html 内联 <style> 里长期存在一份换前缀的孪生规则
   （`#ryCadSide [data-pp="X"] .pp-yyy`）。这两份**必须逐条同值**，且无法合并
   （副本特异性 (1,1,0) 比原版高一级，是 rail 态赢过竞争者的依据；v531 试过合并，
   A/B 实测 base 60~74 处、rail 113~120 处视觉变化，已回滚）。这里只守「不许漂移」：
   v530 删 style-01 的 .pp-side{border-radius:12px} 时内联没跟上，正是该闸门要拦的形态。 */
const driftRes = require('child_process').spawnSync(process.execPath,
  [path.join(ROOT, 'scripts', 'check_panel_drift.cjs')], { encoding: 'utf8' });
const driftLines = (driftRes.stdout || '').trim().split('\n');
check('⑥ 面板双副本无新增漂移（index.html 的 rail 副本 vs mod/style-01.css / mod/ry-panel.css）',
  driftRes.status === 0,
  driftLines[driftLines.length - 1] || (driftRes.stderr || '').slice(0, 200));

/* ---------- ⑥b 面板样式单一归属（v543） ---------- */
/* v542 的审计结论：面板相关规则 1673 条里只有 97 条真正命中，418 条从不命中——
   根因是同一套皮肤被抄在 index.html 内联里（结构搬走后留下 252 条 #threeLevelView 死块、
   125 条 .pp-title 死块）。v543 把内联里 179 条面板规则全部迁回 ry-panel.css / style-01.css，
   内联从 45.8KB 降到 6.3KB。这条闸门守住「别再抄回去」：内联 <style> 里一旦再出现
   面板选择器（去掉注释后判断），直接红灯。 */
const inlineStyleCss = (() => {
  const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const blocks = [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]);
  return blocks.map(c => c.replace(/\/\*[\s\S]*?\*\//g, '')).join('\n');
})();
const panelSelectorsInline = [];
{
  const re = /([^{}]+)\{[^{}]*\}/g;
  let m;
  while ((m = re.exec(inlineStyleCss))) {
    const sel = m[1].trim();
    if (!sel || sel.startsWith('@')) continue;
    if (/(\.pp-|#ppSide|#tlSide|#pipePlanSection|#tlPipePlanSection|#ryCadSide|ry-cad-)/.test(sel)) panelSelectorsInline.push(sel.slice(0, 90));
  }
}
check('⑥b 面板样式单一归属：index.html 内联不得再抄面板规则（v543）',
  panelSelectorsInline.length === 0,
  panelSelectorsInline.slice(0, 5).join(' | '));

/* ---------- ⑦ 全局滚动条单一出处（v533） ---------- */
/* `*::-webkit-scrollbar` 是纯特异性 0 的全局规则，谁后加载谁赢 ⇒ 历史上 index.html 内联、
   mod/style-05.css、terrain/terrain.css 各复制了一份（值还各不相同：5px 绿 / 4px 灰 / 5px 灰绿）。
   v533 实测三处副本从未生效（runye-theme.css 在 :head 里最后加载，通用滚动条恒为
   4px + rgba(100,116,139,.45) + 圆角 999px），已全部删除，只留 runye-theme.css 一处。
   本项守「不许再复制」：容器级细条（`.pp-side`、`#ryCadSide .ry-cad-grps` 等选择器更具体的）
   不在此列，那是真在生效的例外。 */
const SCROLLBAR_OWNER = 'runye-theme.css';
const scrollbarScopeDirs = ['', 'mod', 'terrain', 'hydraulic-calc', 'filter-system', 'tl-workspace', 'modeling', 'digital-agriculture'];
const scrollbarFiles = [];
for (const dir of scrollbarScopeDirs) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) continue;
  for (const name of fs.readdirSync(abs)) {
    if (!/\.(css|html)$/i.test(name)) continue;
    scrollbarFiles.push(path.posix.join(dir, name));
  }
}
const scrollbarViolations = [];
for (const rel of scrollbarFiles) {
  if (rel === SCROLLBAR_OWNER) continue;
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  src.split('\n').forEach((line, i) => {
    if (/^\s*\*::-(webkit-)?scrollbar/.test(line)) scrollbarViolations.push(rel + ':' + (i + 1));
  });
}
const themeSrc = fs.readFileSync(path.join(ROOT, SCROLLBAR_OWNER), 'utf8');
const themeHasGlobal = /^\s*\*::-webkit-scrollbar\s*\{/m.test(themeSrc);
check('⑦ 全局滚动条只在 runye-theme.css 定义一次（容器级细条例外）',
  scrollbarViolations.length === 0 && themeHasGlobal,
  (themeHasGlobal ? '' : 'runye-theme.css 缺少 *::-webkit-scrollbar 定义；') +
  (scrollbarViolations.length ? '重复定义：' + scrollbarViolations.join(', ') : ''));

/* ---------- ⑧ 悬浮卡片外壳单一归属（v544） ---------- */
/* v544 的审计结论：全站有 4 张「浮在地图/画布上的卡片」——三级图层控制、驳接点面板、
   AI 侧栏面板、在线地图图层卡 —— 各自把外壳（背景/描边/圆角/阴影/字体）写在自己的
   创建代码里（3 份 JS 字符串 + 1 份 CSS），值还不一样：#fff / rgba(255,255,255,.97)、
   圆角 8 / 10 / 0、字号 12 / 11.5 / 11。v544 把外壳收敛成 mod/ry-panel.css 的
   .ry-float-card / -head / -title / -grip / -caret / -body 一组。
   本项守两件事：
     正向 —— 四张卡的根节点必须挂 .ry-float-card（新增第 5 张卡时同样必须挂，
             漏挂就会掉回「自己写一套壳」的老路）；
     反向 —— 挂了这个类之后，紧跟其后的 `X.style.cssText` 里**不许**再写外壳视觉属性
             （定位/尺寸/z-index/overflow 这些照旧写在 cssText 上，属正当差异）。
   判定口径说明：只扫「className 赋值行 + 其后 3 行内的 style.cssText」，不做全文模糊匹配 ——
   全文匹配会被注释、图例色块、`background` 出现在 `innerHTML` 里的图例等误伤（实测 25 处误报）。 */
const FLOAT_CARD_ANCHORS = [
  ['mod/inline-27.js', 'panel.className = \'ry-float-card\''],
  ['mod/inline-30.js', 'panel.className = \'ry-float-card\'' ],
  ['runye-ai-plan.js', 'ry-float-card' ],
  ['runye-map-enhance.js', 'ry-float-card' ],
];
const SKIN_PROPS = /(background|box-shadow|border-radius|border\s*:|font\s*:)/;
const floatCardProblems = [];
/* ① owner 必须存在且真的定义了外壳 */
const rpCss = fs.readFileSync(path.join(ROOT, 'mod/ry-panel.css'), 'utf8');
const rpCardRule = (rpCss.match(/\.ry-float-card\s*\{([^}]*)\}/) || [])[1] || '';
if (!/\bbackground\s*:/.test(rpCardRule) || !/\bbox-shadow\s*:/.test(rpCardRule)) {
  floatCardProblems.push('mod/ry-panel.css 的 .ry-float-card 缺少 background / box-shadow（外壳唯一出处坏了）');
}
/* ② 四张卡必须挂类；挂类之后紧随的 cssText 不得写外壳 */
for (const [rel, anchor] of FLOAT_CARD_ANCHORS) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) { floatCardProblems.push(rel + ' 不存在'); continue; }
  const lines = fs.readFileSync(abs, 'utf8').split('\n');
  const hitIdx = lines.findIndex(l => l.includes(anchor));
  if (hitIdx < 0) { floatCardProblems.push(rel + ' 未挂 .ry-float-card（锚点：' + anchor + '）'); continue; }
  const ownerVar = (lines[hitIdx].match(/([A-Za-z_$][\w$]*)\.className\s*=/) || [])[1];
  if (!ownerVar) continue;                     /* 如 map-enhance 用字符串拼 innerHTML，跳过 */
  for (let k = hitIdx + 1; k <= hitIdx + 3 && k < lines.length; k++) {
    const m = lines[k].match(new RegExp(ownerVar.replace(/\$/g, '\\$') + '\\.style\\.cssText\\s*=\\s*(.+)$'));
    if (!m) continue;
    /* 卡根节点的 cssText 只该有「定位 / 尺寸 / 层级 / 溢出 / 布局方向」，
       一旦出现背景、描边、圆角、阴影、字体，就是又抄了一套壳。 */
    if (SKIN_PROPS.test(m[1])) {
      floatCardProblems.push(rel + ':' + (k + 1) + ' 的 ' + ownerVar + '.style.cssText 里又写了外壳视觉（' +
        m[1].trim().slice(0, 70) + '）—— 应挪进 .ry-float-card');
    }
  }
}
check('⑧ 悬浮卡片外壳单一归属：四张卡挂 .ry-float-card，且不再各自写一套壳（v544）',
  floatCardProblems.length === 0,
  floatCardProblems.slice(0, 4).join(' | '));

/* ---------- ⑨ 发布脚本只能推送本次确认的提交 ---------- */
const publishScript = fs.readFileSync(path.join(ROOT, '推送更新.bat'), 'utf8');
const publishRequired = [
  'git fetch --quiet origin +refs/heads/master:refs/remotes/origin/master',
  'if not "%START_HEAD%"=="%PUBLISH_BASE%"',
  'if not "%PUSH_REMOTE%"=="%PUBLISH_BASE%"',
  'if not "%PUSH_HEAD%"=="%COMMIT_SHA%"',
  'if not "%PUSH_PARENT%"=="%PUBLISH_BASE%"',
  'powershell -NoProfile -Command "$m=[Environment]::GetEnvironmentVariable(\'MSG\'); if (($m -match \'[&|<>^()!]\') -or $m.Contains([char]37) -or $m.Contains([char]34)) { exit 1 }"',
  'for /f "delims=" %%T in (\'git write-tree 2^>nul\') do set "APPROVED_TREE=%%T"',
  'for /f "delims=" %%T in (\'git rev-parse HEAD^{tree} 2^>nul\') do set "COMMIT_TREE=%%T"',
  'if not "%COMMIT_TREE%"=="%APPROVED_TREE%"',
  'git push origin "%COMMIT_SHA%:refs/heads/master"'
];
const publishMissing = publishRequired.filter((text) => !publishScript.includes(text));
const publishUnsafePush = /^\s*git\s+push\s+origin\s+master\s*$/im.test(publishScript);
const publishAutoStage = /^\s*git\s+add\b/im.test(publishScript);
const publishBoundaryOk = publishMissing.length === 0 && !publishUnsafePush && !publishAutoStage;
check('⑨ 发布脚本校验远端基线、提交快照与命令输入并只推本次确认提交', publishBoundaryOk,
  [publishMissing.length ? '缺少校验：' + publishMissing.join(' | ') : '',
    publishUnsafePush ? '发现无范围限制的 master 推送' : '',
    publishAutoStage ? '发现自动暂存' : ''].filter(Boolean).join(' | '));

/* ---------- ⑩ 页面引用必须都已入库（防线上 404） ----------
   由来（v619 发布时差点踩到）：index.html 引用 core/cloud-design-binding-store.js，
   但那是新建文件、没进过仓库；`git add -u` 只暂存「已跟踪文件的修改」会静默跳过新文件
   ⇒ 首页照常提交、被引用的脚本没上传 ⇒ 线上 404、功能整块哑掉，而页面看起来一切正常。
   实现放在独立脚本里（推送更新.bat 也用同一份，避免两处判据漂移）。 */
const refCheck = require('child_process').spawnSync(process.execPath,
  [path.join(ROOT, 'check_publish_refs.cjs'), '--quiet'], { encoding: 'utf8' });
const refOut = ((refCheck.stdout || '') + (refCheck.stderr || '')).trim();
check('⑩ 页面引用的本地脚本/样式都已入库（防「引用了但没上传 ⇒ 线上 404」）',
  refCheck.status === 0,
  refCheck.status === 0 ? '' : refOut.split('\n').slice(0, 6).join(' | '));

console.log('\n== ci_check_static：PASS=' + pass + ' FAIL=' + fail + ' ==');
process.exit(fail ? 1 : 0);
