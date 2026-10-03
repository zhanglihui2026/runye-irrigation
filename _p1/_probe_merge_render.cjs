/* _p1/_probe_merge_render.cjs · v187/v189 成组块「只画各自轮廓线」绘制契约
 *
 * 用户诉求（原话 v187）：「地块拼接之后 是各自的轮廓线，外面不用再加一个框。」
 * 用户纠正（原话 v189）：「这个不是拼接是地块成组……这些小地块之间有的道路、间隔
 *   那些都要保留，而不是给拼接起来，比如说两个地块间距有 3 米，那这个三米就留着。」
 *
 * 为什么必须观测**实际绘制**而不是查源码文本：
 *   「有没有调 L.polygon」在源码里一眼可见，但「调了几次、每次画的是谁、什么颜色、
 *    交互层还在不在」只有真跑 renderPlots 才知道。旧实现的两层（凸包外框 + 子块虚线）
 *   也是「调了 L.polygon」—— 光看有没有调用完全分不出来。
 *
 * ★ v189 新增：权威几何必须是 polyLatLngSet（各成员环集合，块间空隙保留），
 *   而不是 polyLatLng（凸包）。故断言里额外构造一个「凸包 ≠ 成员环集合」的样本：
 *   故意把两个子地块之间留 3m 缝，若渲染改回凸包，可见环数会掉到 1 ⇒ 精确报红。
 *
 * 做法：桩掉 Leaflet（记录每一次 L.polygon 的环长与样式）+ 桩 localStorage 提供地块库，
 *       真调 RunyeMapEnhance.attach(...) → renderPlots 走一遍，对**绘制结果**下断言。
 *
 * 自带 --inject：把「去掉外层凸包框」这个改动回退成旧行为（即重新把凸包当可见外框画），
 *   断言本诊断必须变红 —— 证明断言非空、非恒绿。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const INJECT = process.argv.includes('--inject');
const SRC_FILE = 'runye-map-enhance.js';

let SRC = fs.readFileSync(path.join(ROOT, SRC_FILE), 'utf8');

/* --inject：把成组块改回「画可见的外层凸包框」（旧 v185 行为） */
if (INJECT) {
  const before = SRC;
  // 让「成组地块」重新走单层凸包路径（等价于 v185 的可见外框）
  SRC = SRC.replace('var isMerged = !!(p.merged && p.subPlots && p.subPlots.length);',
                    'var isMerged = false; // [inject] 回退为旧行为：把凸包当可见外框画');
  if (SRC === before) { console.log('!! 注入未命中（锚点已漂移），请核对 ' + SRC_FILE + ' 的 isMerged 定义'); process.exitCode = 2; return; }
}

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; fails.push(name); console.log('  FAIL  ' + name + (extra ? '   <<< ' + extra : '')); }
}

/* ---------- 桩 ---------- */
function boot(plots) {
  const dom = new JSDOM('<!doctype html><html><body><div id="map"></div></body></html>',
    { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://localhost/x.html' });
  const w = dom.window;
  w.onerror = null; w.alert = () => {};

  /* ★ 观测：每一次 L.polygon 的「环长 / 样式 / 是否交互」 */
  const drawnPolys = [];
  function mkLayer(kind) {
    const o = {
      _kind: kind, _handlers: {}, _tooltip: null, _popup: null, _style: null,
      addTo(grp) { if (grp && typeof grp.addLayer === 'function') { try { grp.addLayer(o); } catch (e) {} } return o; },
      on(ev, fn) { (o._handlers[ev] = o._handlers[ev] || []).push(fn); return o; },
      off() { return o; },
      bindPopup(html) { o._popup = html; return o; },
      bindTooltip(html) { o._tooltip = html; return o; },
      unbindTooltip() { o._tooltip = null; return o; },
      setStyle(st) { o._style = Object.assign({}, o._style, st); return o; },
      setLatLng() { return o; }, getTooltip() { return o._tooltip; },
      closePopup() { return o; }, openPopup() { return o; },
      setTooltipContent() { return o; }, getLatLng() { return null; }
    };
    return o;
  }
  function grp() {
    const g = mkLayer('group');
    g._children = [];
    g.clearLayers = () => { g._children = []; };
    g.addLayer = (l) => { g._children.push(l); };
    g.removeLayer = () => {};
    g.eachLayer = (fn) => { g._children.forEach(fn); };
    return g;
  }
  const handlers = {};
  const map = {
    on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return this; },
    fire(ev, d) { (handlers[ev] || []).forEach(f => f(d)); },
    addLayer() { return this; }, removeLayer() { return this; },
    getContainer() { return { classList: { toggle() {}, add() {}, remove() {}, contains: () => false }, appendChild() {}, style: {} }; },
    getCenter() { return { lat: 18.2528, lng: 109.5119 }; }, getZoom() { return 17; },
    setView() { return this; }, fitBounds() { return this; },
    dragging: { enable() {}, disable() {} }, invalidateSize() {},
    hasLayer: () => false, openPopup() { return this; }, closePopup() { return this; }, eachLayer() {},
    getBounds() { return { isValid: () => true, getCenter: () => ({ lat: 18.2528, lng: 109.5119 }) }; }
  };
  w.L = {
    map: () => map, tileLayer: () => mkLayer('tile'),
    polygon: (ll, st) => {
      const l = mkLayer('polygon');
      l._style = Object.assign({}, st);
      l._ringLen = Array.isArray(ll) ? ll.length : 0;
      l._interactive = !(st && st.interactive === false);
      drawnPolys.push(l);
      return l;
    },
    polyline: () => mkLayer('polyline'), marker: () => mkLayer('marker'),
    circleMarker: () => mkLayer('circle'), circle: () => mkLayer('circle'),
    layerGroup: grp, featureGroup: grp, latLngBounds: () => ({ extend() {}, isValid: () => true }),
    divIcon: () => ({}), point: (x, y) => ({ x: x || 0, y: y || 0 }),
    DomEvent: { stopPropagation() {}, disableClickPropagation() {}, disableScrollPropagation() {} },
    control: { layers: () => ({ addTo() { return this; } }) }
  };

  const R = 6378137, toRad = d => d * Math.PI / 180;
  const cp = p => [Array.isArray(p) ? p[0] : p && p.lat, Array.isArray(p) ? p[1] : p && p.lng];
  w.RunyeGeo = {
    coordPair: cp,
    normalizeRing(a) { a = (a || []).map(cp); if (a.length > 1 && a[0][0] === a[a.length - 1][0]) a.pop(); return a; },
    geodesicArea(pts) {
      pts = pts || []; if (pts.length < 3) return 0;
      let a = 0;
      for (let i = 0; i < pts.length; i++) {
        const p1 = cp(pts[i]), p2 = cp(pts[(i + 1) % pts.length]);
        a += (toRad(p2[1]) - toRad(p1[1])) * (2 + Math.sin(toRad(p1[0])) + Math.sin(toRad(p2[0])));
      }
      return Math.abs(a * R * R / 2);
    },
    hav(a, b) { return 1; },
    baseOfFeature: f => (f && f.geo) || { refLat: 18.2528, refLng: 109.5119 },
    polyWgs2Gcj: p => p, polyGcj2Wgs: p => p,
    wgs2gcj: (lat, lng) => ({ lat, lng }), gcj2wgs: (lat, lng) => ({ lat, lng }),
    ll2m: () => ({ x: 0, y: 0 }), m2ll: () => ({ lat: 0, lng: 0 }),
    polyLL2m: p => (p || []).map(() => ({ x: 0, y: 0 })),
    polyM2ll: () => [], toCanvasPoly: () => [],
    getBase: () => ({ refLat: 18.2528, refLng: 109.5119 })
  };

  const store = { runye_plot_library: JSON.stringify(plots) };
  Object.defineProperty(w, 'localStorage', {
    value: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
      clear: () => { for (const k in store) delete store[k]; }
    }
  });
  w.setInterval = () => 0; w.clearInterval = () => {};

  // 加载被测模块（用注入后的源码）
  /* ★ 坑：模块内部是**裸引用** `L` / `document` / `localStorage`（浏览器全局），
   *   不是从参数进来的。所以必须把它们注入到**求值作用域**里 ——
   *   用 new Function(...,'L','document','localStorage',...) 把名字声明成形参，
   *   模块里的裸 `L` 才会解析到我们的桩。只往 window 上挂 `w.L` 是不够的（它不在链上）。 */
  const mod = { exports: {} };
  /* ★★ 这个模块是 **UMD**：(function(root, factory){ ... })(self||this, function(RunyeGeo){...})
   *   ⇒ `RunyeGeo` 是 factory 的形参，由 UMD 头自己灌进去（有 require 时走
   *     `require('./runye-geo.js')`）。所以我往 new Function 里塞 `RunyeGeo` 形参**根本用不上**，
   *     真正生效的是 UMD 头那条 require 分支 —— 这也是为什么加了形参仍然 undefined。
   *   正确做法：把模块源码当**函数体**执行，但要先屏蔽掉 `require`/`module`，
   *     逼 UMD 走 `root.RunyeGeo` 分支（root 传我们的 window 桩），同时把 `L`/`document`/
   *     `localStorage` 声明成形参。这样三者的来源就都受控了。 */
  const fn = new Function(
    'window', 'document', 'localStorage', 'L', 'console', 'setTimeout', 'clearTimeout',
    'var self = window;\n' + SRC + '\nreturn window.RunyeMapEnhance;'
  );
  const DBG = process.argv.includes('--verbose');
  const con = {
    warn: (...a) => { if (DBG) console.log('    [warn] ' + a.join(' ')); },
    info: (...a) => { if (DBG) console.log('    [info] ' + a.join(' ')); },
    error: (...a) => console.log('    [error] ' + a.join(' ')),
    log: (...a) => { if (DBG) console.log('    [log] ' + a.join(' ')); }
  };
  const exported = fn(w, w.document, w.localStorage, w.L, con, () => 0, () => {});
  return { w, mod: exported || mod.exports, map, drawnPolys, store };
}

/* ---------- 造数据：3 块相邻小地块 + 1 块独立地块 ---------- */
const B = [18.2528, 109.5119], D = 0.0002;
function rect(lat, lng, dLat, dLng, extra) {
  return Object.assign({
    id: 'p_' + lat + '_' + lng, name: '地块', mu: 0.71, sqm: 471, crop: '七彩花生',
    polyLatLng: [[lat, lng], [lat, lng + dLng], [lat + dLat, lng + dLng], [lat + dLat, lng]],
    center: { lat: lat + dLat / 2, lng: lng + dLng / 2 },
    geo: { refLat: lat + dLat / 2, refLng: lng, proj: 'mercatorLocal' },
    source: 'map', crs: 'GCJ-02'
  }, extra || {});
}
const S1 = rect(B[0], B[1], D, D, { id: 's1', name: '子块1', crop: '七彩花生' });
const S2 = rect(B[0], B[1] + D, D, D, { id: 's2', name: '子块2', crop: '水稻' });
const S3 = rect(B[0] + D, B[1], D, D, { id: 's3', name: '子块3', crop: '玉米' });
const SOLO = rect(B[0] + 0.01, B[1] + 0.01, D, D, { id: 'solo', name: '单块地', crop: '大豆' });

/* 用真 merge 模块造出成组地块 */
const M = require(path.join(ROOT, SRC_FILE));
const BIG = M.merge.plots([S1, S2, S3], { name: '三块成组' });
if (!BIG) { console.log('!! 造数据失败：merge.plots 返回 null'); process.exitCode = 2; return; }
const LIB = [BIG, SOLO,
  Object.assign({}, S1, { mergedInto: BIG.id }),
  Object.assign({}, S2, { mergedInto: BIG.id }),
  Object.assign({}, S3, { mergedInto: BIG.id })];

/* ---------- 跑 ---------- */
const { mod: M2, map: MAP, drawnPolys } = boot(LIB);
console.log('[dbg] LIB len=' + LIB.length + ' BIG.subPlots=' + (BIG.subPlots ? BIG.subPlots.length : '-') +
            ' BIG.hullLen=' + BIG.polyLatLng.length);
const ATTACH = M2.attach(MAP, { plots: LIB });   // 传 plots 绕过 localStorage 读取路径
if (!ATTACH || !ATTACH.ok) {
  console.log('!! attach 未成功：' + JSON.stringify(ATTACH));
  console.log('   （改造桩或 attach 守卫后需同步本探针）');
  process.exitCode = 2;
  return;
}

console.log('=== T1 成组块只画「各自轮廓线」，不画可见外框 ===');
{
  /* 成组地块 3 个子块 + 独立地块 1 块 = 应有 4 个多边形。
   * 另有 1 个不可见外轮廓（ghost，interactive:false + opacity 0）——它不算「可见外框」。 */
  const visible = drawnPolys.filter(l => l._interactive);
  const ghosts = drawnPolys.filter(l => !l._interactive);
  ok('可见多边形共 4 个（3 子块 + 1 独立地块）', visible.length === 4,
     '实际 ' + visible.length + ' 个（环长 ' + visible.map(l => l._ringLen).join(',') + '）');
  /* ★ 判据必须用**凸包顶点数**当锚点，而不是「weight>=3 且 fillOpacity>=0.16」。
   *   —— 后者是「用样式反推几何」的间接判据：凸包 layer 的样式由 `baseStyle` 决定，
   *   万一将来 baseStyle 变细/变淡（合理改动），这条断言就会**恒绿**，失去鉴别力。
   *   实测：--inject（把成组块退化成画凸包）时，凸包=1 个可见环、环长=5（= hull 顶点数），
   *   而旧写法仍 PASS ⇒ 假绿。改用环长锚点后注入必红。 */
  ok('★ 不存在「环长 = 凸包顶点数」的可见大框',
     !visible.some(l => l._ringLen === BIG.polyLatLng.length && BIG.polyLatLng.length > 4),
     '凸包环长=' + BIG.polyLatLng.length + ' 可见环长=' + visible.map(l => l._ringLen).join(','));
  ok('不可见外轮廓 ≤ 1 个（仅作包围盒引用，opacity 0）', ghosts.length <= 1,
     '实际 ' + ghosts.length + ' 个');
  if (ghosts.length) {
    const g = ghosts[0];
    ok('不可见外轮廓确实不可见（weight 0 + opacity 0 + fillOpacity 0）',
       g._style.weight === 0 && g._style.opacity === 0 && g._style.fillOpacity === 0,
       JSON.stringify(g._style));
    ok('不可见外轮廓确实不可点（interactive:false）', g._style.interactive === false);
  }
}

console.log('\n=== T2 子地块用「各自作物色」，不再统一紫色 ===');
{
  const visible = drawnPolys.filter(l => l._interactive);
  const colors = visible.map(l => (l._style && l._style.color) || '').filter(Boolean);
  /* ★ 期望值的写法要贴合**真实的调色板**：cropColor() 里「七彩花生」与「玉米」都落
   *   绿色系（#16a34a），所以只看「颜色种类数」会误判成失败。真正该断言的是：
   *     ① 三种作物各自的颜色 = 调色板的真实输出（逐块核对，而不是数种类）；
   *     ② 紫色只允许出现在**不可见**的 ghost 上，可见层一个都不许有。
   *   调色板期望值直接从源码里读（不硬编码），源码改了这里会跟着红 —— 比手抄更可靠。 */
  const palette = (() => {
    const m = SRC.match(/function cropColor\(crop\)\s*\{([\s\S]*?)\n  \}/);
    const body = m ? m[1] : '';
    const rules = [];
    const re = /\/\.?([^/]+)\/\.test\(c\)\)\s*return\s*'([^']+)'/g;
    let x;
    while ((x = re.exec(body))) rules.push([x[1], x[2]]);
    const dflt = (body.match(/return\s*'(#[0-9a-fA-F]{6})'\s*;?\s*$/) || [])[1];
    return { rules, dflt };
  })();
  const expectColor = crop => {
    for (const [pat, col] of palette.rules) { try { if (new RegExp(pat).test(crop)) return col; } catch (e) {} }
    return palette.dflt;
  };
  const subColors = visible.slice(0, 3).map(l => l._style && l._style.color);
  const expectColors = ['七彩花生', '水稻', '玉米'].map(expectColor);
  ok('3 个子地块的颜色分别等于各自作物色（七彩花生/水稻/玉米）',
     subColors.join(',') === expectColors.join(','),
     '实际 ' + subColors.join(',') + ' 期望 ' + expectColors.join(','));
  ok('★ 可见层没有任何紫色（旧实现所有子块统一 #7c3aed）',
     !colors.some(c => /#7c3aed/i.test(c)), '可见色 = ' + colors.join(' '));
  const dash = visible.filter(l => l._style && l._style.dashArray);
  ok('★ 不再有「紫色虚线子块环」这种旧画法', dash.length === 0,
     '虚线层 = ' + dash.length + ' 个');
}

console.log('\n=== T3 每个子地块都是「独立闭合」的一圈（顶点数与源环一致）===');
{
  const visible = drawnPolys.filter(l => l._interactive);
  const lens = visible.map(l => l._ringLen).sort((a, b) => a - b);
  // 4 块矩形，每块 4 顶点
  ok('4 个可见环的顶点数均为 4（各自闭合成块）', lens.length === 4 && lens.every(n => n === 4),
     '实际 ' + lens.join(','));
  ok('★ 没有出现「合并后的大环」（若是凸包/公共边会 > 4 顶点',
     !lens.some(n => n > 4), '实际 ' + lens.join(','));
}

console.log('\n=== T4 交互不能因为「去掉外框」而丢：popup / 点击仍可唤起 ===');
{
  const visible = drawnPolys.filter(l => l._interactive);
  const withPopup = visible.filter(l => l._popup);
  ok('★ 每个可见子地块环都挂了 popup（任一块都能点出气泡）',
     withPopup.length === visible.length, withPopup.length + '/' + visible.length);
  ok('popup 含「解散成组」按钮（成组地块仍可拆回）',
     withPopup.some(l => /rymUnmerge/.test(l._popup)));
  const withClick = visible.filter(l => (l._handlers.click || []).length > 0);
  /* ⚠ 原断言「visible 全部必须绑 click」是**期望写错**，不是功能坏：
     源码 L609 的口径是「state.mergePick 时绑 onClickMerge，否则**仅当 opts.onPick 是函数**
     才绑 onClickPick」—— 本探针的 attach() 没传 onPick ⇒ 此时**本就不该**有 click。
     正确做法不是放宽（改成 <=），而是把两个分支都覆盖上（加强契约）：
       A) 不传 onPick → 可见层应当**都没有** click（避免无意义绑定）
       B) 传 onPick   → 可见层应当**都有** click（拾取入口不能因去掉外框而丢） */
  ok('A) 未传 onPick 时可见层不绑 click（避免无意义绑定）',
     withClick.length === 0, withClick.length + '/' + visible.length);

  /* B) 另起一次 boot()（全新的桩 + 全新的 drawnPolys），显式传 onPick，
        断言「每个可见子地块都能被拾取」—— 证明「去掉可见外框」后拾取入口没丢。 */
  const B2 = boot(LIB);
  B2.mod.attach(B2.map, { plots: LIB, onPick: function () {} });
  const vis2 = B2.drawnPolys.filter(l => l._interactive);
  const withClick2 = vis2.filter(l => (l._handlers.click || []).length > 0);
  ok('★ B) 传了 onPick 时每个可见子地块都绑了 click（拾取入口未因去外框而丢）',
     vis2.length > 0 && withClick2.length === vis2.length,
     withClick2.length + '/' + vis2.length);
}

console.log('\n=== T5 mergedInto 归档的原小地块不重复绘制 ===');
{
  const visible = drawnPolys.filter(l => l._interactive);
  ok('★ 归档子地块未额外出现（3 个子块只在成组块里各画 1 次）',
     visible.length === 4, '可见层 ' + visible.length + ' 个（期望 4：3 子块 + 1 独立）');
}

console.log('\n=== T6 ★★ v189 核心：块间有缝时必须逐块画（拿凸包画会并成一块）===');
{
  /* 构造两块**中间留 3.3m 空隙**（模拟道路/水渠/无法利用的空地）。
   * 期望：可见环数 = 2（各自独立）。
   * 若渲染改回凸包/并集，会出现 1 个「含全部顶点的大环」⇒ 本断言精确报红。
   * 这正是 v189 用户纠正的核心：「那这个三米就留着」。 */
  const GAP = 0.00003;                       // ≈3.3m
  const gapA = rect(B[0], B[1], 0.0002, 0.0002, { id: 'ga', name: '左块', crop: '七彩花生' });
  const gapB = rect(B[0], B[1] + 0.0002 + GAP, 0.0002, 0.0002, { id: 'gb', name: '右块', crop: '水稻' });
  const G = M.merge.plots([gapA, gapB], { name: '带缝成组' });
  if (!G) { console.log('!! 带缝样本造数据失败'); process.exitCode = 2; return; }
  /* 反向对照：凸包顶点数（若渲染走凸包，可见大环就是这个长度） */
  const hullLen = G.polyLatLng.length;
  const ringSetLen = (G.polyLatLngSet || []).length;

  const B3 = boot([G, Object.assign({}, gapA, { mergedInto: G.id }), Object.assign({}, gapB, { mergedInto: G.id })]);
  B3.mod.attach(B3.map, { plots: [G, Object.assign({}, gapA, { mergedInto: G.id }), Object.assign({}, gapB, { mergedInto: G.id })] });
  const vis3 = B3.drawnPolys.filter(l => l._interactive);
  ok('★★ 带缝成组：可见环 = 2 个（逐块各自一圈，缝保留）',
     vis3.length === 2, '实际 ' + vis3.length + ' 个（环长 ' + vis3.map(l => l._ringLen).join(',') + '）');
  ok('★★ 不存在「环长 = 凸包顶点数」的可见大环（= 没被并成一块）',
     !vis3.some(l => l._ringLen === hullLen && hullLen > 4),
     '凸包环长=' + hullLen + ' 权威环数=' + ringSetLen + ' 可见环长=' + vis3.map(l => l._ringLen).join(','));
  const c3 = vis3.map(l => l._style && l._style.color);
  ok('★ 两块各自作物色（七彩花生 / 水稻），不是统一底色',
     c3.length === 2 && c3[0] !== c3[1], '实际 ' + c3.join(','));
}

console.log('\n========================================');
console.log((INJECT ? '【注入模式】' : '') + '成组块绘制契约：PASS=' + pass + '  FAIL=' + fail);
if (fail) console.log('  失败项：' + fails.join(' / '));
if (INJECT) {
  const caught = fail > 0;
  console.log(caught ? '  ✓ 注入被捕获（' + fail + ' 条断言变红）—— 断言非恒绿'
                     : '  ✗ 注入未被捕获！断言恒绿，本诊断无鉴别力');
  console.log('========================================');
  process.exitCode = caught ? 0 : 1;
} else {
  console.log('========================================');
  process.exitCode = fail ? 1 : 0;
}
