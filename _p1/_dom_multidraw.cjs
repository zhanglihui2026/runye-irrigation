/* _p1/_dom_multidraw.cjs · v186 连续绘制「功能诊断」（**真 DOM，跑页面自己的事件处理器**）
 *
 * 为什么必须用真 DOM：本轮修的是**行为**（点「完成」后能否接着画第二块/第三块），
 *   只翻源码找「有没有 clearDraft()」查不出「点了完成面板没清空 / 继续画串到上一块」。
 * 做法：jsdom 加载 runye-map-measure.html，桩掉 Leaflet / RunyeGeo / RunyeMapEnhance，
 *   然后**真点按钮**（触发页面注册的 onclick）＋**真 fire 地图 click**（触发页面注册的 map.on('click')）。
 *
 * ★ 关键设计（吸取「测了却不是被测对象」的教训）：
 *   面板上 #pts / #mu 是**渲染结果**，被桩掉的 refresh() 不会去更新它，
 *   所以断言一律走**页面的真值来源**：
 *     - 落点是否被记录  → 桩住 RunyeGeo.polyLL2m，统计「实际被记进 points 的点数」；
 *     - 画布是否被清空  → 同一路观测，点「完成」后再落点，只应看到「新块的落点」；
 *     - 是否入库        → 读 localStorage['runye_plot_library']（页面自己写的）；
 *     - 提示是否更新    → 读 #tip.textContent（页面直接 textContent= 赋值的）。
 *   这样才能真正回答用户那句：「点完成之后，应该能让我画第二块、第三块」。
 *
 * 自带 --inject：把「完成」里的 clearDraft() 注释掉，断言本诊断**必须变红**
 *   —— 证明这些断言非空、非恒绿。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const INJECT = process.argv.includes('--inject');
const HTML = 'runye-map-measure.html';

let SRC = fs.readFileSync(path.join(ROOT, HTML), 'utf8');

/* --inject [1|2|all]：人工注入「语法合法但语义错」的缺陷，断言本诊断必须变红。
 *   ① 只证明「断言能拦住缺陷」，不代表仓库里有缺陷（跑完不落盘、不改文件）。
 *   两种注入各自必须命中（未命中即锚点漂移 ⇒ 显式 exit 2，绝不静默放行）：
 *     1 · 「完成」不再清空画布（points/markers/poly 留着）⇒ 下一块串到上一块（用户报的原症状）
 *     2 · 「完成」不再自动入库 ⇒ 画了却存不进地块库（等于白画）
 *   两条分开验而非合成一条：合成后只能证明「至少一条断言是活的」，
 *   而分开能证明「这两类缺陷各自都有断言兜住」——这正是「分别验证」的意义。 */
const INJ = (() => {
  if (!INJECT) return null;
  const i = process.argv.indexOf('--inject');
  const arg = process.argv[i + 1];
  const want = (arg && /^[12]$/.test(arg)) ? arg : 'all';
  return { want, shots: [] };
})();
if (INJ) {
  const cases = {
    '1': { name: '「完成」不再清空画布',
           from: '      clearDraft();\n      if(!drawing) setDrawing(true);',
           to:   '      /*clearDraft();*/\n      if(!drawing) setDrawing(true);' },
    '2': { name: '「完成」不再自动入库',
           from: 'var saved = saveCurrentDraftToLibrary({silent:true});',
           to:   'var saved = null;' }
  };
  for (const k of Object.keys(cases)) {
    if (INJ.want !== 'all' && INJ.want !== k) continue;
    const c = cases[k], b4 = SRC;
    SRC = SRC.replace(c.from, c.to);
    if (SRC === b4) { console.log('!! 注入 ' + k + '（' + c.name + '）未命中：锚点已漂移，请核对 ' + HTML + ' 的 btnFinish'); process.exitCode = 2; return; }
    INJ.shots.push(k + ':' + c.name);
  }
  console.log('【注入模式】已注入 ' + INJ.shots.join(' + ') + ' —— 期望本诊断变红\n');
}

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; fails.push(name); console.log('  FAIL  ' + name + (extra ? '   <<< ' + extra : '')); }
}

/* ---------- 桩：Leaflet / RunyeGeo / RunyeMapEnhance ---------- */
function boot() {
  /* ★ url 必须给「非 opaque」来源：不传 url 时 jsdom 是 about:blank，
   *   localStorage 会抛 DOMException「not available for opaque origins」⇒
   *   页面 try/catch 吞掉写入，地块库永远空，诊断全红 —— 看似功能坏了，实则测试环境坏了。
   *   （这是本轮踩到的坑，记在验收清单里。） */
  const dom = new JSDOM(SRC, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://localhost/runye-map-measure.html' });
  const w = dom.window;
  w.onerror = null;                 // 别让 jsdom 把页面里的未捕获错误升级成 DOMException 打断 boot
  w.alert = () => {};
  w.confirm = () => true;
  try { w.localStorage.clear(); } catch (e) { throw new Error('localStorage 不可用（origin=' + w.location.origin + '）'); }

  /* --- 观测点：记录「画布上此刻的多边形」状态演变 ---
   * ★ 坑：只盯 L.polygon(ring) 是不够的 —— 清空走的是 drawPoly(null)，
   *   它**根本不会**调 L.polygon，于是「清空」在观测里完全消失（假红：明明清了却看着没清）。
   *   正确做法是观测**生命周期**：
   *     ① L.polygon(...) 创建 → 画布有一个 n 顶点的多边形；
   *     ② measureGroup.removeLayer(layer) 移除 → 若移除的是当前 polygon 则画布变空。
   *   两条合起来才是「画布上现在有几个顶点」的完整真值。
   */
  const obs = { rings: [], current: 0, coordPair: 0, polyCreated: 0, polyRemoved: 0 };
  let currentPoly = null;

  /* --- Leaflet 桩：只要被调用不抛错，并保留 on() 注册的处理器（供 fire 用） --- */
  function mkLayer(kind) {
    const o = {
      _kind: kind, _latlngs: [],
      addTo(grp) { if (grp && typeof grp.addLayer === 'function') { try { grp.addLayer(o); } catch (e) {} } return o; },
      on() { return this; }, off() { return this; },
      bindPopup() { return this; }, bindTooltip() { return this; }, unbindTooltip() { return this; },
      setStyle() { return this; }, setLatLng() { return this; },
      getTooltip() { return null; }, closePopup() { return this; },
      setTooltipContent() { return this; }, getLatLng() { return null; }
    };
    return o;
  }
  const handlers = {};
  const map = {
    _h: handlers,
    on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return this; },
    fire(ev, data) { (handlers[ev] || []).forEach(fn => { try { fn(data); } catch (e) { console.log('    [map handler err] ' + e.message); } }); },
    addLayer() { return this; }, removeLayer() { return this; },
    getContainer() { return { classList: { toggle() {}, add() {}, remove() {}, contains: () => false }, appendChild() {}, style: {} }; },
    getCenter() { return { lat: 18.2528, lng: 109.5119 }; },
    getZoom() { return 17; }, setView() { return this; }, fitBounds() { return this; },
    dragging: { enable() {}, disable() {} },
    invalidateSize() {}, hasLayer: () => false, setZoom() { return this; },
    openPopup() { return this; }, closePopup() { return this; }, eachLayer() {},
    getBounds() { return { isValid: () => true, getCenter: () => ({ lat: 18.2528, lng: 109.5119 }) }; }
  };
  function grp() {
    const g = mkLayer('group');
    g.clearLayers = () => {};
    g.eachLayer = () => {};
    g.addLayer = () => {};
    /* ★ 观测点②：drawPoly 清空/重建时都会先 removeLayer(旧 poly)，
     *   命中当前 poly ⇒ 画布此刻「无多边形」，current 归 0 并记一条轨迹。 */
    g.removeLayer = function (layer) {
      if (layer && layer === currentPoly) { currentPoly = null; obs.current = 0; obs.polyRemoved++; obs.rings.push(0); }
      return this;
    };
    return g;
  }
  w.L = {
    map: () => map,
    tileLayer: () => mkLayer('tile'),
    /* ★ 观测点①：drawPoly(ring) → L.polygon(displayRing(ring), ...)
     *   ring 的长度就是「画布上这块多边形有几个顶点」——画布真值口径。 */
    polygon: function (ll, st) {
      const n = Array.isArray(ll) ? ll.length : 0;
      const l = mkLayer('polygon'); l._style = st; l._latlngsRaw = ll; l._ringLen = n;
      currentPoly = l; obs.current = n; obs.polyCreated++; obs.rings.push(n);
      return l;
    },
    polyline: () => mkLayer('polyline'),
    marker: () => mkLayer('marker'),
    circleMarker: () => mkLayer('circle'),
    circle: () => mkLayer('circle'),
    layerGroup: grp,
    featureGroup: grp,
    latLngBounds: () => ({ extend() {}, isValid: () => true }),
    divIcon: () => ({}),
    point: (x, y) => ({ x: x || 0, y: y || 0 }),
    DomEvent: { stopPropagation() {}, disableClickPropagation() {}, disableScrollPropagation() {} },
    control: { layers: () => ({ addTo() { return this; } }) },
    Util: { template: s => s, setOptions() {} },
    Browser: {}, Point: null
  };

  /* --- RunyeGeo 桩：真实球面面积 + 观测式 polyLL2m --- */
  const R = 6378137, toRad = d => d * Math.PI / 180;
  function coordPair(p) {
    obs.coordPair++;
    const lat = Array.isArray(p) ? p[0] : p && p.lat;
    const lng = Array.isArray(p) ? p[1] : p && p.lng;
    return [lat, lng];
  }
  w.RunyeGeo = {
    coordPair,
    normalizeRing(pts) {
      const a = (pts || []).map(coordPair);
      if (a.length > 1 && a[0][0] === a[a.length - 1][0] && a[0][1] === a[a.length - 1][1]) a.pop();
      return a;
    },
    geodesicArea(latlngs) {
      const pts = latlngs || []; if (pts.length < 3) return 0;
      let area = 0;
      for (let i = 0; i < pts.length; i++) {
        const p1 = coordPair(pts[i]), p2 = coordPair(pts[(i + 1) % pts.length]);
        area += (toRad(p2[1]) - toRad(p1[1])) * (2 + Math.sin(toRad(p1[0])) + Math.sin(toRad(p2[0])));
      }
      return Math.abs(area * R * R / 2);
    },
    hav(a, b) {
      const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
      const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(s));
    },
    baseOfFeature(f) { return (f && f.geo) || { refLat: 18.2528, refLng: 109.5119 }; },
    polyWgs2Gcj: p => p, polyGcj2Wgs: p => p,
    wgs2gcj: (lat, lng) => ({ lat, lng }), gcj2wgs: (lat, lng) => ({ lat, lng }),
    ll2m: () => ({ x: 0, y: 0 }), m2ll: () => ({ lat: 0, lng: 0 }),
    /* ★ 观测点②：drawPoly → displayRing(ring) → 每个顶点一次 toDisplay → coordPair。
     *   这里改成记录「这一轮 drawPoly 收到的环长度」，即画布上此刻多边形的顶点数。 */
    polyLL2m(poly) { return (poly || []).map(() => ({ x: 0, y: 0 })); },
    polyM2ll: () => [], toCanvasPoly: () => [],
    getBase: () => ({ refLat: 18.2528, refLng: 109.5119 })
  };

  /* --- RunyeMapEnhance 桩（拼接真逻辑另用真模块测，见 T4） --- */
  w.RunyeMapEnhance = {
    attach: () => ({ ok: true, refresh: () => true, setLayer: () => true }),
    export: { download() {}, geoJSON: () => '', kml: () => '' },
    parse: { geoJSON: () => [], kml: () => [] },
    merge: { plots: () => null, hull: () => [], canUnmerge: () => ({ ok: false }), unmerge: () => ({ ok: false }) }
  };
  w.setInterval = () => 0; w.clearInterval = () => {};   // 页面里的定时器不要在 jsdom 里真的跑

  /* --- 执行页面内联脚本 --- */
  const inline = SRC.match(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/i);
  const code = inline ? inline[1] : '';
  try {
    w.eval(code);
  } catch (e) {
    throw new Error('页面内联脚本初始化失败：' + e.message);
  }
  if (typeof w.document.getElementById('btnFinish').onclick !== 'function') {
    throw new Error('页面未完成初始化：btnFinish.onclick 未绑定（内联脚本可能在中途抛错）');
  }
  return { w, map, obs };
}

/* ---------- 工具 ---------- */
function clickRect(map, lat0, lng0, dLat, dLng) {
  const pts = [[lat0, lng0], [lat0, lng0 + dLng], [lat0 + dLat, lng0 + dLng], [lat0 + dLat, lng0]];
  pts.forEach(p => map.fire('click', { latlng: { lat: p[0], lng: p[1] } }));
}
function clickPts(map, pts) { pts.forEach(p => map.fire('click', { latlng: { lat: p[0], lng: p[1] } })); }
/* 页面初始 drawing=false（「✏️ 开始画框」未激活）——真实用户第一步就是点它。
 * 之前诊断漏了这一步，导致「落点全无效」被误读成「功能坏了」：先补上。 */
function startDraw(w) { const b = w.document.getElementById('btnDraw'); if (!/绘制中/.test(b.textContent)) b.click(); }
function lib(w) { try { return JSON.parse(w.localStorage.getItem('runye_plot_library') || '[]'); } catch (e) { return []; } }
function tip(w) { const t = w.document.getElementById('tip'); return t ? t.textContent : ''; }
function drawBtn(w) { const b = w.document.getElementById('btnDraw'); return b ? b.textContent : ''; }

/* 辅助：读「画布上此刻的多边形顶点数」——
 *  obs.current 由【L.polygon 创建】与【removeLayer 移除】两条事件共同维护，
 *  因此它同时能反映「画出了 4 边形」与「被清空成 0」。
 *  ★ 踩坑记录：起初只看 L.polygon(ring)，而清空走 drawPoly(null) 不调 L.polygon
 *    ⇒ 「已清空」在观测里凭空消失，导致 6 条断言假红。单事件观测要问一句：
 *      「这个动作的相反动作，我观测得到吗？」*/
function canvasPts(obs) { return obs.current; }
function ringsSince(obs, from) { return obs.rings.slice(from); }
/* 清空过就置 0；轨迹 = 每次「创建 n」或「移除 → 0」按序追加 */
function sawClear(obs, from) { return ringsSince(obs, from).indexOf(0) >= 0; }

const B = [18.2528, 109.5119];
const D = 0.0002;   // 约 22m 见方，够算面积

console.log('=== T0 页面能初始化，且「开始画框」可激活 ===');
{
  const { w } = boot();
  ok('btnFinish 已绑定事件处理器', typeof w.document.getElementById('btnFinish').onclick === 'function');
  ok('初始为未绘制态（按钮显示「开始画框」）', /开始画框/.test(drawBtn(w)), '实际「' + drawBtn(w) + '」');
  startDraw(w);
  ok('点击后进入绘制态（显示「绘制中」）', /绘制中/.test(drawBtn(w)), '实际「' + drawBtn(w) + '」');
  ok('初始地块库为空', lib(w).length === 0, '库里 ' + lib(w).length + ' 块');
}

console.log('\n=== T1 画第一块 → 点「完成」：应入库 + 画布清空 + 仍是绘制态 ===');
let T1 = null;
{
  const { w, map, obs } = boot();
  startDraw(w);                       // 用户真实第一步：点「✏️ 开始画框」
  const before = obs.rings.length;
  clickRect(map, B[0], B[1], D, D);
  const seq = ringsSince(obs, before);
  ok('第一块落点后画布画出 4 边形', canvasPts(obs) === 4,
     '环长序列 = ' + seq.join(',') + '（' + obs.coordPair + ' 次坐标换算）');

  const beforeFinish = obs.rings.length;
  w.document.getElementById('btnFinish').click();
  const L = lib(w);
  ok('★ 完成后地块库新增 1 块', L.length === 1, '库里 ' + L.length + ' 块');
  ok('入库地块带面积（mu > 0）', L.length === 1 && L[0].mu > 0, L.length ? 'mu=' + L[0].mu : '未入库');
  ok('入库地块带 polyLatLng（供地图叠加/回传二级页）', L.length === 1 && Array.isArray(L[0].polyLatLng) && L[0].polyLatLng.length === 4,
     L.length ? 'polyLatLng 顶点数=' + L[0].polyLatLng.length : '未入库');
  ok('入库地块带 geo 基准（米坐标反投要靠它）', L.length === 1 && !!L[0].geo && L[0].geo.proj === 'mercatorLocal',
     L.length ? JSON.stringify(L[0].geo) : '未入库');
  ok('入库地块带 crs = GCJ-02', L.length === 1 && L[0].crs === 'GCJ-02');
  ok('★ 完成后画布被清空（渲染序列里出现 drawPoly(null)）', sawClear(obs, beforeFinish),
     '清空后渲染序列 = ' + ringsSince(obs, beforeFinish).join(','));
  ok('★ 完成后画布回到「无多边形」状态', canvasPts(obs) === 0,
     '尾部序列 = ' + obs.rings.slice(-3).join(','));
  ok('★ 完成后仍处于绘制态（可接着画）', /绘制中/.test(drawBtn(w)), '实际「' + drawBtn(w) + '」');
  ok('提示语告知「已保存 + 可继续画下一块」', /已保存/.test(tip(w)) && /下一块/.test(tip(w)), '实际「' + tip(w) + '」');
  T1 = { w, map, obs };
}

console.log('\n=== T2 紧接着画第二块（紧挨第一块右侧）→ 完成：累计 2 块、两块互不污染 ===');
{
  const { w, map, obs } = T1;
  const before = obs.rings.length;
  clickRect(map, B[0], B[1] + D, D, D);
  const seq = ringsSince(obs, before);
  ok('★ 第二块只画出 4 边形（未叠加成 8 顶点）', canvasPts(obs) === 4,
     '第二块环长序列 = ' + seq.join(','));
  w.document.getElementById('btnFinish').click();
  const L = lib(w);
  ok('★ 地块库累计 2 块', L.length === 2, '库里 ' + L.length + ' 块');
  ok('两块 id 不同（未被覆盖同一块）', L.length === 2 && L[0].id !== L[1].id);
  ok('两块顶点数均为 4（各自独立）', L.length === 2 && L.every(p => p.polyLatLng.length === 4),
     L.map(p => p.polyLatLng.length).join(','));
  ok('两块中心点不同（确实是两块地，不是同块重存）', L.length === 2 && L[0].center.lng !== L[1].center.lng,
     L.map(p => p.center && p.center.lng).join(' vs '));
  ok('第二块完成后画布再次回到 0 边形', canvasPts(obs) === 0, '实际 ' + canvasPts(obs));
}

console.log('\n=== T3 画第三块（L 形 6 顶点）→ 完成：3 块全走通（用户要的「第二块、第三块」）===');
{
  const { w, map, obs } = T1;
  const before = obs.rings.length;
  clickPts(map, [[B[0] + D, B[1] + D], [B[0] + 2 * D, B[1] + D], [B[0] + 2 * D, B[1] + 2 * D],
                 [B[0] + 1.5 * D, B[1] + 2 * D], [B[0] + 1.5 * D, B[1] + 1.5 * D], [B[0] + D, B[1] + 1.5 * D]]);
  const seq = ringsSince(obs, before);
  ok('第三块画出 6 边形', canvasPts(obs) === 6, '环长序列 = ' + seq.join(','));
  w.document.getElementById('btnFinish').click();
  const L = lib(w);
  ok('★ 地块库累计 3 块', L.length === 3, '库里 ' + L.length + ' 块');
  ok('三块 id 全不同', new Set(L.map(p => p.id)).size === 3, 'id = ' + L.map(p => p.id).join(','));
  ok('三块顶点数分别为 4 / 4 / 6（互不串点）', L.map(p => p.polyLatLng.length).join(',') === '4,4,6',
     '实际 ' + L.map(p => p.polyLatLng.length).join(','));
  ok('三块面积各自 > 0', L.every(p => p.mu > 0), 'mu = ' + L.map(p => p.mu).join(','));
  ok('第三块完成后画布回到 0 边形', canvasPts(obs) === 0, '实际 ' + canvasPts(obs));

  console.log('\n=== T4 用真 merge 模块拼接这三块（联动 v185，非桩）===');
  const M = require(path.join(ROOT, 'runye-map-enhance.js'));
  const merged = M.merge.plots(L, { name: '三块拼接' });
  ok('三块能拼成一个大地块', !!merged && merged.subPlots.length === 3, merged ? '子块 ' + merged.subPlots.length : 'null');
  ok('拼接后保留 3 个子地块环（供分别布管）', !!merged && merged.subPlots.every(s => Array.isArray(s.polyLatLng) && s.polyLatLng.length >= 3));
  ok('拼接后外层为综合轮廓（面积 ≥ 任一子块）', !!merged && merged.mu >= Math.max(...L.map(p => p.mu)) - 1e-6,
     merged ? 'big=' + merged.mu + ' vs max sub=' + Math.max(...L.map(p => p.mu)) : 'null');
}

console.log('\n=== T5 无效草稿（顶点不足 3）：只清空、不入库 ===');
{
  const { w, map, obs } = boot();
  startDraw(w);
  clickPts(map, [[B[0], B[1]], [B[0], B[1] + D]]);
  ok('画布画出 2 点线段（2 顶点多边形）', canvasPts(obs) === 2, '实际 ' + canvasPts(obs));
  const before = obs.rings.length;
  w.document.getElementById('btnFinish').click();
  ok('★ 不足 3 点不入库', lib(w).length === 0, '库里 ' + lib(w).length + ' 块');
  ok('画布已清空', sawClear(obs, before) && canvasPts(obs) === 0,
     '渲染序列 = ' + ringsSince(obs, before).join(','));
  ok('仍是绘制态', /绘制中/.test(drawBtn(w)), '实际「' + drawBtn(w) + '」');
  ok('提示语说明「顶点不足/已清空」', /不足|已清空/.test(tip(w)), '实际「' + tip(w) + '」');
}

console.log('\n=== T6 「🗑 清除」未被重构改坏，且与「完成」语义区分清楚 ===');
{
  const { w, map, obs } = boot();
  startDraw(w);
  clickRect(map, B[0], B[1], D, D);
  const before = obs.rings.length;
  w.document.getElementById('btnClear').click();
  ok('清除后画布回到 0 边形', canvasPts(obs) === 0 && sawClear(obs, before),
     '渲染序列 = ' + ringsSince(obs, before).join(','));
  ok('清除**不**入库（清空 ≠ 定稿）', lib(w).length === 0, '库里 ' + lib(w).length + ' 块');
}

console.log('\n=== T7 「💾 保存地块」仍可用，且保留画布（可继续微调）===');
{
  const { w, map, obs } = boot();
  startDraw(w);
  clickRect(map, B[0], B[1], D * 1.5, D * 1.5);
  const before = obs.rings.length;
  w.document.getElementById('btnSavePlot').click();
  ok('手动保存入库 1 块', lib(w).length === 1, '库里 ' + lib(w).length + ' 块');
  ok('手动保存后画布仍保留 4 边形（未被误清）', canvasPts(obs) === 4,
     '保存后渲染序列 = ' + ringsSince(obs, before).join(',') + '（尾部 ' + obs.rings.slice(-2).join(',') + '）');
}

console.log('\n========================================');
console.log((INJ ? '【注入模式 ' + INJ.want + '】' : '') + '连续绘制功能诊断：PASS=' + pass + '  FAIL=' + fail);
if (fail) console.log('  失败项：' + fails.join(' / '));
if (INJ) {
  /* 注入模式下的「合格」判据是**必须红**：全绿说明断言是恒绿的（什么也没测到）。
   * 反过来，正常模式下必须全绿 —— 两头都验过，这条闸门才算装上。 */
  const caught = fail > 0;
  console.log(caught ? '  ✓ 注入被捕获（' + fail + ' 条断言变红）—— 断言非恒绿'
                     : '  ✗ 注入未被捕获！所有断言恒绿，本诊断无鉴别力');
  console.log('========================================');
  process.exitCode = caught ? 0 : 1;
} else {
  console.log('========================================');
  process.exitCode = fail ? 1 : 0;
}
