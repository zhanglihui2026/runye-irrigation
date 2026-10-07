/* =====================================================================
 * runye-map-enhance.js · 润野灌溉 · 地图实景叠加图层（隔离模块）
 * ---------------------------------------------------------------------
 * 命名空间：window.RunyeMapEnhance
 * 依赖：Leaflet(全局 L) + RunyeGeo（同目录 runye-geo.js）
 *
 * 职责：在已有 Leaflet 地图上叠加 地块/分区/管网/设备 图层；并提供地块
 *       GeoJSON/KML 的导出与导入解析。
 *
 * 隔离原则：不创建地图、不改地图页既有 DOM/状态；全程 try/catch；
 *          CSS 类名一律 rym- 前缀。用法：RunyeMapEnhance.attach(map);
 * ===================================================================== */
(function (root, factory) {
  var Geo = (typeof require === 'function') ? require('./runye-geo.js') : root.RunyeGeo;
  if (typeof module === 'object' && module.exports) module.exports = factory(Geo);
  else root.RunyeMapEnhance = factory(Geo);
})(typeof self !== 'undefined' ? self : this, function (RunyeGeo) {
  'use strict';

  function readPlotLibrary() {
    try { return JSON.parse(localStorage.getItem('runye_plot_library') || '[]'); }
    catch (e) { return []; }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* 按作物名给地块配色：卫星图上一眼区分哪块种什么；无匹配回退绿色 */
  function cropColor(crop) {
    var c = String(crop || '').toLowerCase();
    if (/火龙果/.test(c)) return '#dc2626';
    if (/芒果|柑橘|橙|柠檬|黄皮/.test(c)) return '#f59e0b';
    if (/荔枝|龙眼|葡萄|提子|蓝莓/.test(c)) return '#a855f7';
    if (/槟榔|椰子|橡胶/.test(c)) return '#0f766e';
    if (/西瓜|甜瓜|哈密瓜/.test(c)) return '#eab308';
    if (/水稻|莲|藕/.test(c)) return '#0891b2';
    if (/蔬菜|辣椒|番茄|茄子/.test(c)) return '#65a30d';
    return '#16a34a';
  }

  function injectCss() {
    if (document.getElementById('rym-layer-css')) return;
    var css = document.createElement('style');
    css.id = 'rym-layer-css';
    css.textContent =
      '.rym-layer-panel{position:absolute;top:12px;right:12px;z-index:1000;background:#fff;' +
      'border:1px solid #cbd5e1;box-shadow:0 1px 4px rgba(0,0,0,.12);padding:8px 10px;' +
      'font:12px/1.7 system-ui,-apple-system,"Segoe UI",sans-serif;color:#334155;min-width:120px}' +
      '.rym-layer-panel .rym-lp-t{font-weight:700;color:#15803d;border-left:3px solid #16a34a;' +
      'padding-left:6px;margin-bottom:4px;letter-spacing:1px}' +
      '.rym-layer-panel label{display:block;cursor:pointer;user-select:none}' +
      '.rym-layer-panel input{margin-right:5px;vertical-align:-1px}' +
      '.ry-field-mode #map path{stroke-width:3.5px !important}' +
      '.ry-field-mode .leaflet-popup-content{font-size:14px;font-weight:600}' +
      '.ry-field-mode .rym-layer-panel{background:#fff8e1;border:2px solid #f59e0b}' +
      /* [v185] 成组多选：选中地块加粗描边（Leaflet 图层级样式已另设，此处补一条 CSS 兜底） */
      '.rym-sel-badge{position:absolute;z-index:1000;background:#7c3aed;color:#fff;' +
      'font:11px/1.4 system-ui,sans-serif;padding:2px 6px;border-radius:9px;white-space:nowrap;' +
      'box-shadow:0 1px 3px rgba(0,0,0,.3);pointer-events:none}' +
      '.rym-merge-bar{position:absolute;left:50%;transform:translateX(-50%);bottom:16px;z-index:1200;' +
      'background:#fff;border:1px solid #cbd5e1;box-shadow:0 2px 10px rgba(0,0,0,.18);padding:7px 12px;' +
      'font:12px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;color:#334155;border-radius:6px;' +
      'display:flex;align-items:center;gap:9px}' +
      '.rym-merge-bar b{color:#7c3aed}' +
      '.rym-merge-bar button{font:12px/1.4 inherit;padding:3px 11px;border-radius:4px;' +
      'border:1px solid #cbd5e1;background:#f8fafc;cursor:pointer}' +
      '.rym-merge-bar button.rym-mb-go{background:#7c3aed;border-color:#7c3aed;color:#fff;font-weight:600}' +
      '.rym-merge-bar button.rym-mb-go:disabled{background:#c4b5fd;border-color:#c4b5fd;cursor:not-allowed}';
    document.head.appendChild(css);
  }

  function attach(map, opts) {
    opts = opts || {};
    try {
      if (typeof L === 'undefined' || !map) return { ok: false, reason: 'Leaflet 或 map 实例未就绪' };
      injectCss();
      var state = {
        map: map,
        plotGroup: L.layerGroup().addTo(map),
        networkGroup: L.layerGroup().addTo(map),
        dripGroup: L.layerGroup().addTo(map),
        deviceGroup: L.layerGroup().addTo(map),
        panelEl: null,
        /* [v185] 成组多选态：被选中的地块 id 集合。刷新渲染后按此重画高亮。 */
        selected: {},
        /* 每个地块 id → 它的 L.polygon 图层（供高亮与点击切换） */
        plotLayers: {}
      };
      state.mergeOpts = opts || {};
      state.mergePick = !!(opts && opts.mergePick);
      state.onMergeDone = (opts && typeof opts.onMergeDone === 'function') ? opts.onMergeDone : null;
      buildPanel(state, opts);
      renderPlots(state, opts);
      renderNetwork(state, opts);
      state.toggleSelect = function (id) {
        if (!id) return;
        if (state.selected[id]) delete state.selected[id]; else state.selected[id] = 1;
        applySelection(state);
      };
      state.getSelectedIds = function () {
        return Object.keys(state.selected);
      };
      state.clearSelection = function () {
        state.selected = {};
        applySelection(state);
      };
      state.mergeSelected = function (o) {
        return doMergeSelected(state, o);
      };
      /* 兜底入口：面板里没有「地块成组」勾选框时，宿主页仍可直接翻内部态 */
      state.mergeSetPick = function (on) {
        state.mergePick = !!on;
        if (!on) { try { state.clearSelection(); } catch (e) {} }
        try { if (state.refresh) state.refresh(); } catch (e) {}
        return state.mergePick;
      };
      function autoFit(){
        try{
          if(opts && opts.autoFit === false) return;
          var pts=[];
          function grab(l){
            if(l.getLatLngs){ l.getLatLngs().forEach(function(r){ (Array.isArray(r)?r:[r]).forEach(function(p){ if(p&&isFinite(p.lat)) pts.push(p); }); }); }
            if(l.getLatLng){ var c=l.getLatLng(); if(c&&isFinite(c.lat)) pts.push(c); }
          }
          state.plotGroup.eachLayer(grab);
          state.networkGroup.eachLayer(grab);
          state.deviceGroup.eachLayer(grab);
          if(pts.length>=2) state.map.fitBounds(L.latLngBounds(pts),{padding:[50,50],maxZoom:17});
        }catch(e){}
      }
      state.refresh = function () { renderPlots(state, opts); renderNetwork(state, opts); };
      autoFit();
      return {
        ok: true,
        refresh: state.refresh,
        setLayer: state.setLayer,
        toggleSelect: state.toggleSelect,
        getSelectedIds: state.getSelectedIds,
        clearSelection: state.clearSelection,
        mergeSelected: state.mergeSelected,
        mergeSetPick: state.mergeSetPick
      };
    } catch (e) {
      return { ok: false, reason: '初始化异常: ' + (e && e.message) };
    }
  }

  function buildPanel(state, opts) {
    var el = document.createElement('div');
    el.className = 'rym-layer-panel';
    /* [v151 2026-09-29] 行调整：删掉「分区」（zoneGroup 从未被他处填入，是勾了没反应的死控件）；
     * 新增「滴灌带」（管网里的青色虚线很密，单独开关实用）。
     * 勾选状态持久化到 localStorage['runye_map_layers']，下次打开保持原样。 */
    var LS_KEY = 'runye_map_layers';
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch (e) { saved = {}; }
    var ROWS = [['plot', '地块'], ['network', '管网'], ['drip', '滴灌带'], ['device', '设备']];
    /* [v152 2026-09-29] 「测量框」是宿主页面级的图层（poly/顶点/橡皮筋/面积文字都在页面里，
     * 不在本脚本的图层组里）⇒ 只在宿主页显式传了 opts.onMeasure 时才加这一行，
     * 别的引用页（如 index.html）不会凭空多出一个「勾了没反应」死控件。 */
    if (opts && typeof opts.onMeasure === 'function') ROWS.push(['measure', '测量框']);
    /* [v185] 成组模式：勾上后单击地块 = 多选（不弹气泡），底部出现「成组」操作条。
     * [v189 2026-10-03] 用户纠正：这里不是「拼接成一个大块」，而是**地块成组**（编组），
     *   各子地块的几何/轮廓/块间空隙（道路、间隔、水渠、无法利用的空地）**原样保留**。
     * 只在宿主页显式传了 opts.onMergeMode 时才出现，避免其它引用页多出死控件。 */
    var hasMergeRow = !!(opts && typeof opts.onMergeMode === 'function');
    if (hasMergeRow) ROWS.push(['mergepick', '🔗 地块成组']);
    el.innerHTML = '<div class="rym-lp-t">图层</div>' + ROWS.map(function (r) {
      var on = (saved[r[0]] !== false);   // 默认全开；只有显式存过 false 才关
      return '<label><input type="checkbox" data-rym="' + r[0] + '"' + (on ? ' checked' : '') + '> ' + r[1] + '</label>';
    }).join('') +
      '<label style="margin-top:4px;border-top:1px solid #e2e8f0;padding-top:4px">' +
      '<input type="checkbox" data-rym="fieldmode"' + (saved.fieldmode ? ' checked' : '') + '> ☀️ 田间模式</label>';
    state.map.getContainer().appendChild(el);
    L.DomEvent.disableClickPropagation(el);
    L.DomEvent.disableScrollPropagation(el);
    state.panelEl = el;
    function apply(k, on) {
      if (k === 'measure') {                 // 页面级测量框：转交宿主页实现
        if (opts && typeof opts.onMeasure === 'function') { try { opts.onMeasure(on); } catch (e) {} }
        return;
      }
      if (k === 'mergepick') {               // [v185] 地块成组模式：交给宿主页与本模块共同处理
        state.mergePick = !!on;
        if (!on) { try { state.clearSelection(); } catch (e) {} }
        if (opts && typeof opts.onMergeMode === 'function') { try { opts.onMergeMode(on); } catch (e) {} }
        try { if (state.refresh) state.refresh(); } catch (e) {}
        return;
      }
      var g = null;
      if (k === 'plot') g = state.plotGroup;
      else if (k === 'network') g = state.networkGroup;
      else if (k === 'drip') g = state.dripGroup;
      else if (k === 'device') g = state.deviceGroup;
      if (!g) return;
      if (on) g.addTo(state.map); else g.remove();
    }
    function save() {
      var o = {};
      el.querySelectorAll('input[data-rym]').forEach(function (c) { o[c.getAttribute('data-rym')] = c.checked; });
      try { localStorage.setItem(LS_KEY, JSON.stringify(o)); } catch (e) {}
    }
    el.addEventListener('change', function (e) {
      var k = e.target.getAttribute('data-rym');
      if (k === 'fieldmode') { document.body.classList.toggle('ry-field-mode', e.target.checked); save(); return; }
      apply(k, e.target.checked);
      save();
    });
    /* 初次按已存状态应用。buildPanel 在 renderPlots/renderNetwork 之前被调，
     * 用 setTimeout(0) 保证跑在渲染之后；组若被 remove 过，refresh 重画也不会自己回到地图上。 */
    setTimeout(function () {
      el.querySelectorAll('input[data-rym]').forEach(function (c) {
        var k = c.getAttribute('data-rym');
        if (k === 'fieldmode') { document.body.classList.toggle('ry-field-mode', c.checked); return; }
        apply(k, c.checked);
      });
    }, 0);
    /* 供宿主页反向同步勾选框（例：测量框关着时用户又开始画框 ⇒ 自动打开，面板须如实反映）。
     * checked 已一致就直接返回：既不重复重绘，也切断了「同步 → 回调 → 再同步」的循环。 */
    state.setLayer = function (k, on) {
      var c = el.querySelector('input[data-rym="' + k + '"]');
      if (!c) return false;
      on = !!on;
      if (c.checked === on) return true;
      c.checked = on;
      if (k === 'fieldmode') { document.body.classList.toggle('ry-field-mode', on); }
      else { apply(k, on); }
      save();
      return true;
    };
  }

  /* [v150 2026-09-29] 顶点清洗：剔除 null / 非有限数值 / 连续重复顶点。
   * 根因（用户报「在线地图的标点跟面积框不吻合，一放大缩小面积框就变」）：
   *   Leaflet 1.9.4 的 Renderer._onZoomEnd 是
   *     for (var id in this._layers) { this._layers[id]._project(); }
   *   —— 一个 for 循环遍历「共享同一 renderer 的全部矢量图层」，且没有 try/catch。
   *   地块库里若混入含 null 顶点的坏数据，L.polygon(含 null) 构造不会报错
   *   （toLatLng(null) 原样返回 null），但 _project() 里读 null.lat 会抛 TypeError
   *   ⇒ 循环中断 ⇒ 排在它之后入 renderer 的图层（测量框每次 refresh() 都 remove 再
   *   addTo，永远排在末尾）保持上一级缩放的旧投影 ⇒ 缩放级差 2^k 倍的
   *   「标点走了、框没走」。
   * 对策：任何交给 L.polygon/L.polyline 的坐标先在源头洗一遍；长度不足返回 null，
   *   调用方跳过该要素 —— 从根本上杜绝坏顶点进入 renderer 循环。 */
  function validRingLL(ll, minLen) {
    minLen = minLen || 3;
    if (!ll || !ll.length) return null;
    /* 形态必须随输入保持。本项目的权威坐标是**数组形式 [[lat,lng],...]**：
     *   runye-geo.js 的 polyM2ll/polyGcj2Wgs/polyWgs2Gcj 全部产出 [+lat,+lng]；
     *   geodesicArea() 只用 p[0]/p[1] 取值；baseOfFeature() 用 pts[k][0] 取值；
     *   地图页保存地块库时写的 plot.polyLatLng = latlngs()（数组形式）。
     * 但旧数据/管网里也存在 {lat,lng} 对象形式。⇒ 两种都接受，输出与输入同形。
     * 若统一改成对象形式，geodesicArea 会静默返回 0（面积显示 0.00 亩）、
     * polyGcj2Wgs 会算出 NaN —— 那是比崩溃更难发现的静默错误。 */
    var i, probe = null;
    for (i = 0; i < ll.length; i++) { if (ll[i]) { probe = ll[i]; break; } }
    if (!probe) return null;
    var arrForm = (typeof probe.lat === 'undefined');
    var out = [], q, la, lo, t, tl, tn;
    for (i = 0; i < ll.length; i++) {
      q = ll[i];
      if (!q || typeof q !== 'object') continue;
      if (typeof q.lat !== 'undefined') { la = numOrNull(q.lat); lo = numOrNull(q.lng); }
      else if (typeof q.length === 'number' && q.length >= 2) { la = numOrNull(q[0]); lo = numOrNull(q[1]); }
      else continue;
      if (la === null || lo === null) continue;
      if (out.length) {
        t = out[out.length - 1];
        tl = arrForm ? t[0] : t.lat;
        tn = arrForm ? t[1] : t.lng;
        if (tl === la && tn === lo) continue;   // 连续重复顶点（同一点双击两次）
      }
      out.push(arrForm ? [la, lo] : { lat: la, lng: lo });
    }
    return out.length >= minLen ? out : null;
  }
  /* 严格数值判定。注意全局 isFinite(null) === true（Number(null) === 0），
   * 直接用 isFinite 会把 {lat:null,lng:null} 放行成 (0,0) —— 那是一个不报错、
   * 但把地块画到几内亚湾的「静默错误」。必须排除 null/undefined/空串/非数值对象。 */
  function numOrNull(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (typeof v === 'string' && v.trim() !== '') { var n = +v; return isFinite(n) ? n : null; }
    return null;
  }

  /* [v149b 2026-09-28] 旧地块缺 polyLatLng 时兜底重建经纬度（否则框线被跳过不显示）。
   * 全链路米坐标约定一致（index.html applyMapMeasuredArea / 地图页保存/导入）：
   *   x = (lng - 首点经度)*MLAT*cos(平均纬度)，y = (lat - 平均纬度)*MLAT。
   * 三级兜底：geo 基准 → center 反推基准 → runyeMeasuredArea 按 plotId 匹配。
   * 重建结果由调用方回写地块库（自愈一次，幂等）。 */
  function healPlotLL(p) {
    if (p.polyLatLng && p.polyLatLng.length >= 3) {
      var keep = validRingLL(p.polyLatLng);
      if (keep) return keep;          // 合法才直接用；含 null/非法顶点则不认，继续往下兜底重建
    }
    var R = 6378137, MLAT = R * Math.PI / 180;
    var base = null;
    if (p.geo && isFinite(p.geo.refLat) && isFinite(p.geo.refLng)) {
      base = { refLat: p.geo.refLat, refLng: p.geo.refLng };
    } else if (p.center && isFinite(p.center.lat) && isFinite(p.center.lng) && p.poly && p.poly.length) {
      var mx = 0; p.poly.forEach(function (q) { mx += (q.x || 0); }); mx /= p.poly.length;
      var c = Math.cos(p.center.lat * Math.PI / 180);
      base = { refLat: p.center.lat, refLng: p.center.lng - mx / (MLAT * c) };
    }
    if (base && p.poly && p.poly.length >= 3) {
      var pll = RunyeGeo.polyM2ll(p.poly, base);
      if (pll && pll.length >= 3) { p.polyLatLng = pll; return pll; }
    }
    try {
      var ma = JSON.parse(localStorage.getItem('runyeMeasuredArea') || 'null');
      if (ma && ma.plotId === p.id && Array.isArray(ma.poly) && ma.poly.length >= 3) {
        p.polyLatLng = ma.poly; return p.polyLatLng;
      }
    } catch (e) {}
    return null;
  }

  function displayLL(ll, opts) {
    return ll.map(function(p){ var pair=RunyeGeo.coordPair(p); return opts && opts.toDisplay ? opts.toDisplay(pair) : pair; });
  }

  /* =====================================================================
   * [v185] 地块成组：状态 → 画面
   * ---------------------------------------------------------------------
   * 交互契约：opts.mergePick === true 时（地图页开启「地块成组」模式），
   *   单击地块 = 选中/取消（不弹气泡）；已成组地块 = 提示先「解散成组」。
   * [v189 2026-10-03] 用户纠正：这是**成组**，不是拼接 —— 子地块之间
   *   的道路/间隔/水渠/空地一律保留，几何不做任何合并。
   * 只改图层样式，不重建图层 —— 避免每次勾选都重画整张图。
   * ===================================================================== */

  /** 把 state.selected 反映到图层样式 + 底部操作条 */
  function applySelection(state) {
    var ids = Object.keys(state.selected || {});
    var SEL_STYLE = { color: '#7c3aed', weight: 4, fillColor: '#a78bfa', fillOpacity: 0.34, dashArray: null };
    Object.keys(state.plotLayers || {}).forEach(function (id) {
      var rec = state.plotLayers[id];
      if (!rec || !rec.layer) return;
      var on = !!state.selected[id];
      /* [v187] 成组地块由 N 个子地块环组成 ⇒ 选中/取消必须**逐圈**应用，
       *   否则只有第一圈变色，看起来像「选了半块」，很容易被当成 bug。
       *   普通地块的 rec.layers 长度就是 1，走同一条路径，无分支差异。 */
      var all = (rec.layers && rec.layers.length) ? rec.layers : [rec.layer];
      all.forEach(function (L2, i) {
        try {
          if (on) {
            L2.setStyle(SEL_STYLE);
          } else if (all.length > 1 && L2._rySubStyle) {
            L2.setStyle(L2._rySubStyle);       // 还原该子地块自己的作物色
          } else {
            L2.setStyle(rec.baseStyle);
          }
        } catch (e) {}
        if (rec.label) {
          try {
            if (on) L2.bindTooltip(rec.label, { permanent: true, direction: 'center', className: 'rym-sel-badge' });
            else L2.unbindTooltip();
          } catch (e) {}
        }
      });
    });
    renderMergeBar(state, ids);
  }

  /** 底部「已选 N 块」操作条：仅在成组模式下、且选中 ≥1 时出现 */
  function renderMergeBar(state, ids) {
    var host = state.map.getContainer();
    var bar = state.mergeBar;
    if (!state.mergePick || !ids || !ids.length) {
      if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
      state.mergeBar = null;
      return;
    }
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'rym-merge-bar';
      L.DomEvent.disableClickPropagation(bar);
      host.appendChild(bar);
      state.mergeBar = bar;
    }
    var names = ids.map(function (id) {
      var rec = state.plotLayers[id];
      return rec ? (rec.name || id) : id;
    });
    bar.innerHTML = '<span>已选 <b>' + ids.length + '</b> 块：' + escapeHtml(names.join('、')) + '</span>' +
      '<button type="button" class="rym-mb-go"' + (ids.length < 2 ? ' disabled' : '') + '>成组（保留各自轮廓）</button>' +
      '<button type="button" class="rym-mb-clear">清空选择</button>';
    var go = bar.querySelector('.rym-mb-go');
    var cl = bar.querySelector('.rym-mb-clear');
    if (go) go.onclick = function () { doMergeSelected(state, {}); };
    if (cl) cl.onclick = function () { state.clearSelection(); };
  }

  /** 执行成组：把当前选中的地块编为一个「成组地块」写入地块库。
   *  [v189 2026-10-03] 语义：**不改几何、不消除块间空隙**。原小地块移到 mergedInto 归档区，
   *   成组地块以 polyLatLngSet（各成员环集合）为权威几何，块间的道路/间隔/水渠/空地原样保留。 */
  function doMergeSelected(state, o) {
    o = o || {};
    var ids = Object.keys(state.selected || {});
    if (ids.length < 2) return { ok: false, reason: '至少选择 2 个地块' };
    var lib;
    try { lib = JSON.parse(localStorage.getItem('runye_plot_library') || '[]'); }
    catch (e) { return { ok: false, reason: '地块库读取失败' }; }
    if (!Array.isArray(lib)) lib = [];

    var picked = [];
    lib.forEach(function (p) { if (p && ids.indexOf(p.id) >= 0) picked.push(p); });
    if (picked.length < 2) return { ok: false, reason: '选中的地块已不存在（可能刚被删除）' };
    // 已成组的不能再重复成组（否则会丢失上一次的子地块归属）
    var nested = picked.filter(function (p) { return p.merged; });
    if (nested.length) {
      return { ok: false, reason: '「' + (nested[0].name || nested[0].id) + '」本身已是成组地块，请先「解散成组」后再成组' };
    }

    var big = mergePlots(picked, { name: o.name });
    if (!big) return { ok: false, reason: '成组失败：子地块缺少有效环' };

    // 原小地块保留在库里但标记归属：体现「保留子地块」，且它们可再被还原
    var rest = lib.map(function (p) {
      if (ids.indexOf(p.id) < 0) return p;
      var c = JSON.parse(JSON.stringify(p));
      c.mergedInto = big.id;
      return c;
    });
    rest.push(big);
    try { localStorage.setItem('runye_plot_library', JSON.stringify(rest)); }
    catch (e) { return { ok: false, reason: '写入地块库失败：' + e.message }; }

    state.selected = {};
    if (state.refresh) state.refresh();
    // 刷新后图层对象已重建，选中态自然清空；操作条也要收回
    state.mergePick = false;
    renderMergeBar(state, []);
    // 通知宿主页（地图页左栏「我的地块」列表需要跟着重列）
    if (state.onMergeDone) { try { state.onMergeDone(big); } catch (e) {} }
    return { ok: true, merged: big };
  }

  /** 解散成组：把成组地块拆回子地块（子地块原本就在库里，只需解除归档与成组地块本身） */
  function doUnmerge(state, bigId) {
    var lib;
    try { lib = JSON.parse(localStorage.getItem('runye_plot_library') || '[]'); }
    catch (e) { return { ok: false, reason: '地块库读取失败' }; }
    var big = lib.filter(function (p) { return p && p.id === bigId; })[0];
    var chk = canUnmerge(big);
    if (!chk.ok) return { ok: false, reason: chk.reason };
    var rest = [];
    lib.forEach(function (p) {
      if (!p) return;
      if (p.id === bigId) return;                 // 丢掉大地块本身
      if (p.mergedInto === bigId) { var c = JSON.parse(JSON.stringify(p)); delete c.mergedInto; rest.push(c); }
      else rest.push(p);
    });
    // 子地块如果已被删掉，就按大地块里的快照补回来
    var have = {};
    rest.forEach(function (p) { have[p.id] = 1; });
    (big.subPlots || []).forEach(function (s) {
      if (!have[s.id]) rest.push({
        id: s.id, name: s.name, mu: s.mu, sqm: s.sqm, crop: s.crop,
        polyLatLng: s.polyLatLng, center: s.center, source: 'map', crs: 'GCJ-02', ts: Date.now(), note: ''
      });
    });
    try { localStorage.setItem('runye_plot_library', JSON.stringify(rest)); }
    catch (e) { return { ok: false, reason: '写入地块库失败：' + e.message }; }
    if (state && state.refresh) state.refresh();
    return { ok: true, restored: chk.count };
  }

  function renderPlots(state, opts) {
    state.plotGroup.clearLayers();
    state.plotLayers = state.plotLayers || {};
    state.plotLayers = {};
    var plots = (opts && opts.plots) ? opts.plots : readPlotLibrary();
    var fromLib = !(opts && opts.plots);
    var drawn = 0, skipped = 0, healed = 0, cleaned = 0;
    /* [v185] 已成组的原小地块不单独画（由成组地块代表），
       但仍留在库里（保留子地块）→ 只在 popup 里提示它属于哪个成组地块。 */
    var mergedAway = {};
    plots.forEach(function (p) { if (p && p.mergedInto) mergedAway[p.id] = p.mergedInto; });
    plots.forEach(function (p) {
      try {
        if (p && p.mergedInto) return;   // 归档中的子地块：跳过绘制（由成组地块代表）
        var rawLL = p.polyLatLng;
        var ll = validRingLL(rawLL);
        if (!ll) {
          var rebuilt = validRingLL(healPlotLL(p));
          if (rebuilt) { ll = rebuilt; healed++; }
          else {
            skipped++;
            if (console && console.warn) console.warn('[map-enhance] 地块「' + (p.name || p.id) + '」缺经纬度且无法重建（缺 geo/center，且无回传记录），未叠加。可在地图页重新画框保存一次。');
            return;
          }
        } else if (rawLL && ll.length !== rawLL.length) {
          /* [v150 2026-09-29] 关键修复：含 null/非法顶点的地块以前会直接进 L.polygon，
           * 其 _project() 抛错会中断 Renderer._onZoomEnd 的整轮循环（无 try/catch），
           * 使排在后面的测量框停在上一级缩放 ⇒ 用户看到「面积框与标点不吻合」。 */
          cleaned++;
          p.polyLatLng = ll;
          if (console && console.warn) console.warn('[map-enhance] 地块「' + (p.name || p.id) + '」经纬度含 ' + (rawLL.length - ll.length) + ' 个非法/重复顶点，已剔除后绘制并回写地块库。');
        }
        if(typeof p.sqm!=='number' || !isFinite(p.sqm) || p.sqm<=0 || typeof p.mu!=='number' || !isFinite(p.mu) || p.mu<=0){
          p.sqm=Math.round(RunyeGeo.geodesicArea(ll)); p.mu=+(p.sqm/666.67).toFixed(2); healed++;
        }
        /* ★ v190 2026-10-03 成组地块面积自愈（用户截图反馈：「单独计算面积」「不要自动填充」）：
         * 老版本（v185 拼接）存进地块库的成组记录，sqm/mu 是**凸包口径** —— 把块间空隙
         * （道路/水渠/空地）也算了进去。v189 起面积口径 = **各成员之和**（空地不计入）。
         * 老记录sqm 合法但口径错误，上面的自愈拦不住 ⇒ 这里单独校正：
         * 若 merged 记录的 sqm 与成员之和偏差 >0.5%，按成员之和回写（含写回地块库，
         * 走下方既有的 healed 回写通道）。否则用户在老记录上看到的总面积仍是「吞了空地」的数。 */
        if(p.merged && p.subPlots && p.subPlots.length){
          var _sum=0, _ok=true;
          p.subPlots.forEach(function(s){
            var v=(typeof s.sqm==='number' && isFinite(s.sqm) && s.sqm>0) ? s.sqm
                : (s.polyLatLng && s.polyLatLng.length>=3 ? Math.round(RunyeGeo.geodesicArea(s.polyLatLng)) : 0);
            if(!(v>0)) _ok=false; else _sum+=v;
          });
          if(_ok && _sum>0 && Math.abs(_sum-(p.sqm||0)) > _sum*0.005){
            p.sqm=Math.round(_sum);
            p.mu=+(_sum/666.67).toFixed(2);
            healed++;
          }
        }
        var color = p.color || cropColor(p.crop);
        /* ===== [v187/v189 2026-10-03] 成组地块：只画「各自轮廓线」，外面不加框，也不合并几何 =====
         * 用户原话（v187）：「地块拼接之后 是各自的轮廓线，外面不用再加一个框。」
         * 用户原话（v189）：「正确理解地块拼接，实际上不是拼接是地块成组，我可能一个大地块分开画
         *   很多小地块，这些小地块在一起操作……这些小地块之间有的道路、间隔 那些都要保留，
         *   而不是给拼接起来，比如说两个地块间距有 3 米，那这个三米就留着。」
         *
         * ⇒ 权威几何是 `polyLatLngSet`（**各成员环的集合**，互不合并、块间空隙原样保留），
         *   而不是 `polyLatLng`（那是凸包，只作包围盒/飞行的参考外框，画出来会吞掉空隙）。
         * 绘制规则（优先级从高到低）：
         *   ① 成组地块 ⇒ 优先按 `polyLatLngSet` 的**每一个环**各画一圈独立闭合轮廓；
         *      环缺失时退回 `subPlots[].polyLatLng`（老库兼容）；再退回凸包（不让地块消失）。
         *   ② 普通地块 ⇒ 画它自己的单环。
         * 颜色用**各成员自己的作物色**（与未成组时观感一致，一眼区分不同子地块）。
         * 注意：交互层（popup / 点击选中 / 解散成组）必须保留，否则去掉外框就点不到。
         *   做法：给每个成员环挂上同一套 popup 与 click 处理器，任一块都能唤起。
         * 另加一个「描边兜底」的不可见外轮廓（opacity 0）——不参与视觉，
         *   仅用于 `fitBounds` / 选中态改样式时有一个代表整块的几何可引用。 */
        var isMerged = !!(p.merged && p.subPlots && p.subPlots.length);
        var baseStyle = isMerged
          ? { color: '#7c3aed', weight: 2.5, fillColor: '#a78bfa', fillOpacity: 0.12 }
          : { color: color, weight: 2, fillColor: color, fillOpacity: 0.18 };
        /* --- 图层集合：普通地块 = 1 个多边形；成组地块 = N 个成员各自一圈 ---
         * 统一放进 `layers` 数组，后面的 popup / click / 选中样式都按数组处理。 */
        var layers = [];
        if (isMerged) {
          /* ★ 权威几何：polyLatLngSet（各成员环集合）。与 subPlots 一一对应时用 subPlots 的
           *   颜色/名称；只有环、没有对应 subPlot 时（异常库）也照样画出来，不丢几何。 */
          var ringSet = (p.polyLatLngSet && p.polyLatLngSet.length) ? p.polyLatLngSet : null;
          if (ringSet) {
            ringSet.forEach(function (ring, si) {
              var sLL = validRingLL(ring);
              if (!sLL || sLL.length < 3) return;
              var meta = (p.subPlots && p.subPlots[si]) || {};
              var sColor = meta.color || cropColor(meta.crop || p.crop);
              var sStyle = { color: sColor, weight: 2.5, fillColor: sColor, fillOpacity: 0.22 };
              var sPoly = L.polygon(displayLL(sLL, opts), sStyle);
              sPoly._rySubIdx = si;
              sPoly._rySubStyle = sStyle;     // 取消选中时还原「这块自己的颜色」，而不是成组地块的底色
              layers.push(sPoly);
            });
          }
          /* 老库兼容：没有 polyLatLngSet 时退回 subPlots[].polyLatLng（几何等价，仍保留空隙） */
          if (!layers.length) {
            p.subPlots.forEach(function (s, si) {
              if (!s.polyLatLng || s.polyLatLng.length < 3) return;
              var sLL = validRingLL(s.polyLatLng);
              if (!sLL) return;
              /* 子地块自己的作物色：库里没写就退回成组地块的，再退回调色板 */
              var sColor = s.color || cropColor(s.crop || p.crop);
              var sStyle = { color: sColor, weight: 2.5, fillColor: sColor, fillOpacity: 0.22 };
              var sPoly = L.polygon(displayLL(sLL, opts), sStyle);
              sPoly._rySubIdx = si;
              sPoly._rySubStyle = sStyle;
              layers.push(sPoly);
            });
          }
        }
        if (!layers.length) {
          // 普通地块，或成组地块的成员环全不可用（退化兜底：画参考外框，别让地块消失）
          layers.push(L.polygon(displayLL(ll, opts), baseStyle));
        }
        var poly = layers[0];        // 代表层：fitBounds / 记录 plotLayers 用
        var outerGhost = null;
        if (isMerged && layers.length > 1) {
          /* 不可见外轮廓：不参与视觉，只为「整块的包围盒」留一个几何引用。
           * interactive:false + opacity 0 ⇒ 既看不到也点不到，不会挡子地块的点击。 */
          outerGhost = L.polygon(displayLL(ll, opts), {
            color: '#7c3aed', weight: 0, opacity: 0, fillOpacity: 0, interactive: false
          });
        }
        var mu = (p.mu != null) ? p.mu : (RunyeGeo.geodesicArea(ll) / 666.67);
        var subHtml = '';
        if (isMerged && p.subPlots && p.subPlots.length) {
          var subRows = p.subPlots.map(function (s, i) {
            return '<div style="margin-left:2px">· ' + escapeHtml(s.name || ('子地块' + (i + 1))) +
              (s.mu != null ? '（' + (+s.mu).toFixed(2) + ' 亩）' : '') + '</div>';
          }).join('');
          subHtml = '<div style="margin-top:5px;border-top:1px dashed #cbd5e1;padding-top:4px">' +
            '<b style="color:#7c3aed">由 ' + p.subPlots.length + ' 个子地块成组（各自轮廓 / 块间空隙保留）</b>' +
            '<div style="color:#64748b;margin-top:2px">各子地块可分别布置管道，再用总管互连</div>' +
            subRows + '</div>' +
            '<button id="rymUnmerge" style="margin-top:5px;padding:3px 12px;background:#7c3aed;color:#fff;border:0;cursor:pointer;font-size:12px">↩ 解散成组</button>';
        }
        /* ===== 交互绑定：popup / 点击 / 加入图层组 =====
         * 成组地块有 N 个成员环 ⇒ **每一圈都要能唤起同一套气泡与点击**，
         * 否则用户点到「没有外框的那部分」就没反应（去掉外框后最易踩的坑）。
         * 用 forEach 逐层绑定，行为与单层时完全一致。 */
        var popupHtml =
          '<div style="font:12px/1.6 system-ui,sans-serif;min-width:190px">' +
          '<b style="color:' + (isMerged ? '#7c3aed' : '#15803d') + '">' +
          escapeHtml(p.name || '未命名地块') + (isMerged ? '（成组地块）' : '') + '</b><br>' +
          '面积：<b>' + (+mu).toFixed(2) + '</b> 亩　顶点：' + ll.length + ' 个' +
          subHtml +
          '<label style="display:block;margin-top:5px">作物 <input id="rymCrop" style="width:88%;padding:2px 4px;border:1px solid #cbd5e1" value="' + escapeHtml(p.crop || '') + '" placeholder="如：七彩花生"></label>' +
          '<label style="display:block;margin-top:3px">备注 <textarea id="rymNote" rows="2" style="width:88%;padding:2px 4px;border:1px solid #cbd5e1" placeholder="地形/水源/备注">' + escapeHtml(p.note || '') + '</textarea></label>' +
          '<button id="rymSave" style="margin-top:5px;padding:3px 12px;background:#16a34a;color:#fff;border:0;cursor:pointer;font-size:12px">保存</button>' +
          /* [NEW MODULE: 地形模块 v286f] 弹窗回传按钮组：opts 回调跨作用域调页面局部函数， */
          /* 卸载 = 删除本按钮组 + onPopupOpen 里 rymSendDesign/rymSendTerrain 两段绑定。 */
          '<div style="margin-top:6px;display:flex;gap:4px">' +
          '<button id="rymSendDesign" style="flex:1;padding:3px 6px;background:#15803d;color:#fff;border:0;cursor:pointer;font-size:11.5px">回传地块绘制</button>' +
          '<button id="rymSendTerrain" style="flex:1;padding:3px 6px;background:#fff;color:#15803d;border:1px solid #15803d;cursor:pointer;font-size:11.5px">回传地形模块</button>' +
          '</div>' +
          '</div>';
        var onPopupOpen = function () {
          var btn = document.getElementById('rymSave');
          if (btn) btn.onclick = function () {
            var crop = (document.getElementById('rymCrop') || {}).value || '';
            var note = (document.getElementById('rymNote') || {}).value || '';
            try {
              var lib = JSON.parse(localStorage.getItem('runye_plot_library') || '[]');
              for (var i = 0; i < lib.length; i++) { if (lib[i].id === p.id) { lib[i].crop = crop; lib[i].note = note; break; } }
              localStorage.setItem('runye_plot_library', JSON.stringify(lib));
            } catch (e) { alert('保存失败：' + e.message); return; }
            try { state.refresh(); } catch (e) {}
            layers.forEach(function (L2) { try { L2.closePopup(); } catch (e) {} });
          };
          /* [NEW MODULE: 地形模块 v286f] 弹窗回传按钮绑定（opts 回调由 attach 传入） */
          var sd = document.getElementById('rymSendDesign');
          if (sd) sd.onclick = function () { if (typeof opts.onSendDesign === 'function') opts.onSendDesign(p); };
          var st = document.getElementById('rymSendTerrain');
          if (st) st.onclick = function () { if (typeof opts.onSendTerrain === 'function') opts.onSendTerrain(p); };
          var ub = document.getElementById('rymUnmerge');
          if (ub) ub.onclick = function () {
            if (!confirm('解散成组？\n将把「' + (p.name || '该地块') + '」拆回 ' + ((p.subPlots || []).length) + ' 个子地块（各自的轮廓与块间空隙本来就没动过）。')) return;
            var r = doUnmerge(state, p.id);
            if (!r.ok) alert('解散成组失败：' + r.reason);
          };
        };
        var onClickPick = function (e) { try { opts.onPick(p); } catch (err) {} };
        var onClickMerge = function (e) {
          try {
            if (L.DomEvent && e) L.DomEvent.stopPropagation(e);
            if (p.merged) { alert('「' + (p.name || '该地块') + '」已是成组地块。\n如需重新成组，请先在气泡里「解散成组」。'); return; }
            state.toggleSelect(p.id);
          } catch (err) {}
        };
        layers.forEach(function (L2) {
          L2.bindPopup(popupHtml);
          L2.on('popupopen', onPopupOpen);
          if (state.mergePick) L2.on('click', onClickMerge);
          else if (typeof opts.onPick === 'function') L2.on('click', onClickPick);
          L2.addTo(state.plotGroup);
        });
        if (outerGhost) outerGhost.addTo(state.plotGroup);
        /* 记录图层，供 applySelection 改样式 / 操作条取名字。
         * ★ layers 是数组：成组地块要能把**每一圈**都切成选中态，
         *   否则会出现「只有第一个成员变色、其余的没反应」的怪现象。 */
        state.plotLayers[p.id] = {
          layer: poly, layers: layers, ghost: outerGhost,
          baseStyle: baseStyle, name: p.name || p.id,
          label: (p.name || '地块') + ' ✓'
        };
        drawn++;
      } catch (e) {
        skipped++;
        if (console && console.warn) console.warn('[map-enhance] 地块「' + (p.name || p.id) + '」绘制失败已跳过：' + ((e && e.message) || e));
      }
    });
    if ((healed || cleaned) && fromLib) {
      try { localStorage.setItem('runye_plot_library', JSON.stringify(plots)); } catch (e) {}
      if (console && console.info) console.info('[map-enhance] 地块库自愈并回写：' + healed + ' 个重建经纬度，' + cleaned + ' 个剔除非法顶点。');
    }
    if (!drawn && skipped && console && console.warn) {
      console.warn('[map-enhance] ' + skipped + ' 个地块缺经纬度且无法重建，未叠加。');
    }
    return { drawn: drawn, skipped: skipped, healed: healed, cleaned: cleaned };
  }

  /* ---- 管网叠加：读 localStorage['runye_network_layout'] ---- */
  function readNetwork() {
    try { return JSON.parse(localStorage.getItem('runye_network_layout') || 'null'); }
    catch (e) { return null; }
  }
  function dnStyle(dn) {
    dn = +dn || 0;
    if (dn > 110) return { color: '#dc2626', weight: 5 };
    if (dn > 63) return { color: '#f59e0b', weight: 4 };
    return { color: '#3b82f6', weight: 3 };
  }
  /* ==== [v230] 地块回传后裁剪：地块以外的主管/支管/滴灌带不画；总管(front)与水源保留（2026-10-04 用户要求） ====
   * 用户原话：「在线地图页面中，地块回传回来之后，地块以外的滴灌带 主管 支管要裁剪掉。」
   * 做法：渲染管段/滴灌带前，收集地块库全部地块环作裁剪边界（与管网同一地图 GCJ 口径）；
   * 折线按相邻两点拆段，逐段对地块环做平面裁剪（单地块尺度内 lat/lng 当平面用）：
   *   1) 段与所有环边求交点参数 t∈[0,1]，连同端点 0/1 排序；
   *   2) 相邻 t 的中点做射线法包含测试，落在任一地块内 ⇒ 保留该子区间；
   *   3) 合并重叠区间后逐段重画（样式/弹窗与原整线一致）。
   * ★ 裁剪边界：普通地块用 polyLatLng；成组地块用 polyLatLngSet（各成员环集合）——
   *   不能用凸包 polyLatLng（会吞掉块间空隙，管子会画进空地里）；
   *   归档子地块（mergedInto）跳过（其环已由成组地块代表）。
   * ★ 地块库为空 ⇒ 不裁剪（与旧行为一致）。水源点/阀门/总管(front)（设备及跨地块互连总管）不受影响。 */
  function clipPlotRings() {
    var rings = [];
    function pushRing(rg) {
      var r = validRingLL(rg, 3);
      if (!r) return;
      var ring = [];
      for (var i = 0; i < r.length; i++) ring.push(RunyeGeo.coordPair(r[i]));
      if (ring.length >= 3) rings.push(ring);
    }
    (readPlotLibrary() || []).forEach(function (p) {
      if (!p || p.mergedInto) return;
      if (p.merged && p.subPlots && p.subPlots.length) {
        var set = (p.polyLatLngSet && p.polyLatLngSet.length) ? p.polyLatLngSet : null;
        if (set) set.forEach(pushRing);
        else p.subPlots.forEach(function (s) { if (s && s.polyLatLng) pushRing(s.polyLatLng); });
        return;
      }
      pushRing(p.polyLatLng);
    });
    return rings;
  }
  function _segX(a, b, c, d) {
    var d1l = b[0] - a[0], d1g = b[1] - a[1], d2l = d[0] - c[0], d2g = d[1] - c[1];
    var den = d1l * d2g - d1g * d2l;
    if (Math.abs(den) < 1e-15) return null;
    var t = ((c[0] - a[0]) * d2g - (c[1] - a[1]) * d2l) / den;
    var u = ((c[0] - a[0]) * d1g - (c[1] - a[1]) * d1l) / den;
    if (t < -1e-12 || t > 1 + 1e-12 || u < -1e-9 || u > 1 + 1e-9) return null;
    return Math.min(1, Math.max(0, t));
  }
  function _inRing(pt, ring) {
    var x = pt[0], y = pt[1], inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  function _inAnyRing(pt, rings) {
    for (var i = 0; i < rings.length; i++) if (_inRing(pt, rings[i])) return true;
    return false;
  }
  function lerpPair(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
  function clipSegIntervals(a, b, rings) {
    var hits = [0, 1], i, t;
    for (i = 0; i < rings.length; i++) {
      var ring = rings[i];
      for (var k = 0; k < ring.length; k++) {
        t = _segX(a, b, ring[k], ring[(k + 1) % ring.length]);
        if (t !== null) hits.push(t);
      }
    }
    hits.sort(function (x, y) { return x - y; });
    var ivs = [];
    for (i = 0; i < hits.length - 1; i++) {
      var mid = (hits[i] + hits[i + 1]) / 2;
      if (_inAnyRing(lerpPair(a, b, mid), rings)) ivs.push([hits[i], hits[i + 1]]);
    }
    var merged = [];
    ivs.forEach(function (iv) {
      var m0 = merged[merged.length - 1];
      if (m0 && iv[0] <= m0[1] + 1e-12) { if (iv[1] > m0[1]) m0[1] = iv[1]; }
      else merged.push([iv[0], iv[1]]);
    });
    return merged;
  }
  function renderNetwork(state, opts) {
    state.networkGroup.clearLayers();
    state.dripGroup.clearLayers();
    state.deviceGroup.clearLayers();
    var net = (opts && opts.network) ? opts.network : readNetwork();
    if (!net) return { drawn: 0 };
    var clipRings = clipPlotRings();   /* [v230] 有地块才裁剪 */
    (net.segments || []).forEach(function (s) {
      try {
        var sLL = validRingLL(s.latLng, 2);   // 同样挡住含 null 顶点的管段（否则 _project 抛错连累全部矢量层）
        if (!sLL) return;
        var st = dnStyle(s.dn);
        /* [v232] 总管(front) 不裁剪：地块回传后只裁 主管/支管/滴灌带，总管跨地块互连须整段可见。
           s.kind 由三级管路生成写入（'front'/'main'/'branch'）；旧 localStorage 无 kind 时回退 id/name 前缀 'front' 判定。 */
        var isTrunk = (s.kind === 'front') || (typeof s.id === 'string' && s.id.indexOf('front') === 0) || (typeof s.name === 'string' && s.name.indexOf('front') === 0);
        var length = s.len;
        if (typeof length !== 'number' || !isFinite(length) || length<0) {
          length=0;
          for(var i=1;i<sLL.length;i++) {
            var a=RunyeGeo.coordPair(sLL[i-1]), b=RunyeGeo.coordPair(sLL[i]);
            length+=RunyeGeo.hav({lat:a[0],lng:a[1]},{lat:b[0],lng:b[1]});
          }
        }
        var popup =
          '<div style="font:12px/1.6 system-ui,sans-serif;min-width:150px">' +
          '<b style="color:#15803d">' + escapeHtml(s.name || s.id || '管段') + '</b><br>' +
          '管径：DN' + escapeHtml(s.dn || '—') + '<br>' +
          '长度：' + escapeHtml(length.toFixed(1)) + ' m<br>' +
          (s.q != null ? '流量：' + escapeHtml((+s.q).toFixed(2)) + ' m³/h<br>' : '') +
          (s.v != null ? '流速：' + escapeHtml((+s.v).toFixed(2)) + ' m/s<br>' : '') +
          '</div>';
        /* [v230] 逐段裁剪：折线按相邻两点拆段，落在地块外的部分不画（弹窗随每一段保留） */
        var pts = sLL.map(RunyeGeo.coordPair), pieces = [];
        for (var pi = 1; pi < pts.length; pi++) {
          var pa = pts[pi - 1], pb = pts[pi];
          var ivs = (isTrunk || !clipRings.length) ? [[0, 1]] : clipSegIntervals(pa, pb, clipRings);
          for (var ii = 0; ii < ivs.length; ii++) pieces.push([lerpPair(pa, pb, ivs[ii][0]), lerpPair(pa, pb, ivs[ii][1])]);
        }
        pieces.forEach(function (pc) {
          var line = L.polyline(displayLL(pc, opts), { color: st.color, weight: st.weight, opacity: 0.9 });
          line.bindPopup(popup);
          line.addTo(state.networkGroup);
        });
      } catch (e) {}
    });
    if (net.sourcePos && isFinite(net.sourcePos.lat) && isFinite(net.sourcePos.lng)) {
      try {
        var pump = L.marker(displayLL([net.sourcePos], opts)[0], { icon: L.divIcon({
          className: 'rym-pump', iconSize: [22, 22], iconAnchor: [11, 11],
          html: '<div style="width:20px;height:20px;border-radius:50%;background:#15803d;' +
                'border:2px solid #fff;box-shadow:0 0 4px rgba(0,0,0,.4)"></div>'
        })});
        pump.bindTooltip('水源/泵站', { direction: 'top' });
        pump.addTo(state.deviceGroup);
      } catch (e) {}
    }
    /* 阀门：红色圆点（net.valves = [{lat,lng}]） */
    if (net.valves && net.valves.length) {
      net.valves.forEach(function (v) {
        try {
          if (!v || !isFinite(v.lat) || !isFinite(v.lng)) return;
          var m = L.circleMarker(displayLL([v], opts)[0], { radius: 6, color: '#ef4444', weight: 2, fillColor: '#ef4444', fillOpacity: 0.95 });
          m.bindTooltip('阀门', { direction: 'top' });
          m.addTo(state.deviceGroup);
        } catch (e) {}
      });
    }
    /* 滴灌带：青色细虚线（net.dripTapes = [[{lat,lng},{lat,lng}], ...]）；[v230] 同样裁剪到地块内 */
    if (net.dripTapes && net.dripTapes.length) {
      net.dripTapes.forEach(function (line) {
        try {
          var dLL = validRingLL(line, 2);
          if (!dLL) return;
          var dpts = dLL.map(RunyeGeo.coordPair), pieces = [];
          for (var pi = 1; pi < dpts.length; pi++) {
            var pa = dpts[pi - 1], pb = dpts[pi];
            var ivs = clipRings.length ? clipSegIntervals(pa, pb, clipRings) : [[0, 1]];
            for (var ii = 0; ii < ivs.length; ii++) pieces.push([lerpPair(pa, pb, ivs[ii][0]), lerpPair(pa, pb, ivs[ii][1])]);
          }
          pieces.forEach(function (pc) {
            L.polyline(displayLL(pc, opts), { color: '#06b6d4', weight: 1, opacity: 0.65, dashArray: '3,3' }).addTo(state.dripGroup);
          });
        } catch (e) {}
      });
    }
    return { drawn: (net.segments || []).length, valves: (net.valves || []).length, dripTapes: (net.dripTapes || []).length };
  }

  /* ---- 导出：地块 -> GeoJSON / KML ----
   * [GCJ-02 修复 2026-09-28] 本地 polyLatLng 是 GCJ-02(贴合高德影像)，
   * 导出给奥维/其他 GIS 的标准文件须还原为 WGS-84。 */
  function buildGeoJSON(plots) {
    var feats = (plots || []).filter(function (p) { return p.polyLatLng && p.polyLatLng.length >= 3; }).map(function (p) {
      var wgs = RunyeGeo.polyGcj2Wgs(RunyeGeo.normalizeRing(p.polyLatLng));
      var ring = wgs.map(function (ll) { return [ll[1], ll[0]]; });
      ring.push([wgs[0][1], wgs[0][0]]);
      return { type: 'Feature', properties: { name: p.name || '', mu: p.mu || 0, crop: p.crop || '' },
        geometry: { type: 'Polygon', coordinates: [ring] } };
    });
    return JSON.stringify({ type: 'FeatureCollection', features: feats }, null, 2);
  }
  function buildKML(plots) {
    function pm(p) {
      var ring = RunyeGeo.polyGcj2Wgs(RunyeGeo.normalizeRing(p.polyLatLng));
      ring.push(ring[0].slice());
      var coords = ring.map(function (ll) { return ll[1] + ',' + ll[0] + ',0'; }).join(' ');
      return '<Placemark><name>' + escapeHtml(p.name || '地块') + '</name>' +
        '<ExtendedData><Data name="mu"><value>' + escapeHtml(String(p.mu || '')) + '</value></Data>' +
        '<Data name="crop"><value>' + escapeHtml(p.crop || '') + '</value></Data></ExtendedData>' +
        '<Polygon><outerBoundaryIs><LinearRing><coordinates>' + coords +
        '</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>';
    }
    var placemarks = (plots || []).filter(function (p) { return p.polyLatLng && p.polyLatLng.length >= 3; }).map(pm).join('\n');
    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>润野灌溉地块</name>\n' +
      placemarks + '\n</Document></kml>';
  }
  function download(name, content, mime) {
    var blob = new Blob([content], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 100);
  }

  /* ---- 导入：GeoJSON / KML 文本 -> 标准地块数组（纯函数，浏览器/Node 均可测） ----
   * 返回 [{ name, mu, polyLatLng:[[lat,lng],...] }]，与导出格式互逆。 */
  function parseGeoJSON(text) {
    var plots = [], j = JSON.parse(text);
    var feats = j.type === 'FeatureCollection' ? j.features : (j.type === 'Feature' ? [j] : []);
    if (!Array.isArray(feats)) throw new Error('GeoJSON features 必须是数组');
    feats.forEach(function(f){
      var g=f && f.geometry, props=f && f.properties || {};
      if(!g) return;
      var polys=g.type==='Polygon' ? [g.coordinates] : (g.type==='MultiPolygon' ? g.coordinates : []);
      polys.forEach(function(rings){
        if(!Array.isArray(rings) || rings.length!==1) throw new Error('暂不支持带内孔的地块，请先拆分为无孔多边形');
        var ll=RunyeGeo.normalizeRing(rings[0].map(function(c){return [c[1],c[0]];}));
        plots.push({name:props.name || props.Name || '', crop:props.crop || '', polyLatLng:ll});
      });
    });
    return plots;
  }
  function parseKML(text) {
    if(typeof DOMParser==='undefined') throw new Error('KML 解析需要浏览器 XML 解析器');
    var doc=new DOMParser().parseFromString(text, 'application/xml');
    if(doc.getElementsByTagName('parsererror').length) throw new Error('KML XML 格式错误');
    function descendants(el, name){return Array.prototype.slice.call(el.getElementsByTagNameNS('*',name));}
    function firstText(el,name){var nodes=descendants(el,name);return nodes.length?nodes[0].textContent.trim():'';}
    // 标准 <coordinates>："lng,lat[,alt] lng,lat..." -> [[lat,lng],...]
    function ringFromCoordText(s){
      return s.split(/\s+/).filter(Boolean).map(function(pair){
        var c=pair.split(','); return [parseFloat(c[1]), parseFloat(c[0])];
      }).filter(function(p){return isFinite(p[0])&&isFinite(p[1]);});
    }
    var plots=[], skipped=[];   /* skipped：无效轨迹/环线（自相交、退化等），跳过而非抛错毁掉整份导入（2026-10-02 审查修复） */
    descendants(doc,'Placemark').forEach(function(pm){
      var name=firstText(pm,'name'), crop='';
      descendants(pm,'Data').forEach(function(d){if(d.getAttribute('name')==='crop') crop=firstText(d,'value');});
      // 1) 标准多边形
      descendants(pm,'Polygon').forEach(function(poly){
        if(descendants(poly,'innerBoundaryIs').length) throw new Error('暂不支持带内孔的地块，请先拆分为无孔多边形');
        var outer=descendants(poly,'outerBoundaryIs');
        if(outer.length!==1) throw new Error('KML 地块缺少唯一外边界');
        var coords=firstText(outer[0],'coordinates');
        var ll=RunyeGeo.normalizeRing(ringFromCoordText(coords));
        plots.push({name:name,crop:crop,polyLatLng:ll});
      });
      // 2) 奥维轨迹 <gx:Track>（.ovkml）：一串打点当作闭合地块边界
      descendants(pm,'Track').forEach(function(trk){
        var pts=descendants(trk,'coord').map(function(n){
          var p=n.textContent.trim().split(/\s+/);   // "lng lat alt"
          return [parseFloat(p[1]), parseFloat(p[0])]; // -> [lat,lng]
        }).filter(function(p){return isFinite(p[0])&&isFinite(p[1]);});
        if(pts.length<3) return;
        // 单条轨迹无效（自相交/共线退化 → normalizeRing 抛错）只跳过它，不毁整份导入
        try{
          var ll=RunyeGeo.normalizeRing(pts);          // 自动去首尾重复点并校验
          plots.push({name:name,crop:crop,polyLatLng:ll,source:'track'});
        }catch(e){ skipped.push(name||'未命名轨迹'); }
      });
      // 3) 普通 <LineString>：闭合环线当作地块边界（同样跳过无效环线）
      descendants(pm,'LineString').forEach(function(ls){
        var pts=ringFromCoordText(firstText(ls,'coordinates'));
        if(pts.length<3) return;
        try{
          var ll=RunyeGeo.normalizeRing(pts);
          plots.push({name:name,crop:crop,polyLatLng:ll,source:'linestring'});
        }catch(e){ skipped.push(name||'未命名环线'); }
      });
    });
    if(skipped.length) plots.skipped=skipped;   // 附加属性：调用方按需提示（旧调用方不受影响）
    return plots;
  }

  /* =====================================================================
   * [v185/v189 2026-10-03] 地块成组（group）
   * ---------------------------------------------------------------------
   * 用户诉求：在地图上画几个相邻小地块 → **成组**便于一起操作；各小地块各自
   *          布管，再用总管互连；成组后把**各子地块本身**传给二级管路页面。
   *
   * ★ v189 用户纠正后的设计口径：**只成组，不拼接几何**
   *   · 原小地块仍留在库里（只是被标记 mergedInto 归到组下）；
   *   · 另生成一个「成组地块」实体（进地块库、能传递到二级页）；
   *   · 权威几何 = polyLatLngSet（**各成员环的集合**），块与块之间的
   *     道路 / 间隔 / 水渠 / 空地**原样保留**，不得被并进来；
   *   · 凸包（hullLatLng / polyLatLng）**仅作参考外框**（包围盒 / 飞行定位 / 居中），
   *     不参与面积、不参与渲染，避免「看起来连成一片」的误导。
   *
   * 为什么不做几何并集、也不拿凸包当轮廓？两者都会抹掉子地块边界与块间空隙，
   * 就再也拆不回、也画不出「各自的地」了。
   *
   * 注意：本模块是纯函数，不依赖 Leaflet、不碰 DOM，浏览器/Node 均可测。
   * ===================================================================== */

  /** 凸包（Andrew monotone chain）。输入 [[lat,lng],...]，输出逆时针/顺时针环（首尾不重复）。
   *  退化情形（共线、重复点、<3 个不同点）返回入参的一个去重副本，由调用方判定是否可用。 */
  function convexHull(points) {
    var pts = (points || []).map(function (p) {
      return Array.isArray(p) ? [+p[0], +p[1]] : [+p.lat, +p.lng];
    }).filter(function (p) {
      return isFinite(p[0]) && isFinite(p[1]);
    });
    if (pts.length < 3) return pts;
    // 去重（同经纬度只留一个），并按 (lng, lat) 字典序排序
    var seen = {}, uniq = [];
    pts.forEach(function (p) {
      var k = p[0] + ',' + p[1];
      if (!seen[k]) { seen[k] = 1; uniq.push(p); }
    });
    if (uniq.length < 3) return uniq;
    uniq.sort(function (a, b) { return a[1] - b[1] || a[0] - b[0]; });

    function cross(o, a, b) {
      // 用经纬度直接叉积：局部范围内（<数公里）足够了，且与「米坐标」叉积符号一致
      return (a[1] - o[1]) * (b[0] - o[0]) - (a[0] - o[0]) * (b[1] - o[1]);
    }
    var lower = [];
    for (var i = 0; i < uniq.length; i++) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], uniq[i]) <= 0) lower.pop();
      lower.push(uniq[i]);
    }
    var upper = [];
    for (var j = uniq.length - 1; j >= 0; j--) {
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], uniq[j]) <= 0) upper.pop();
      upper.push(uniq[j]);
    }
    lower.pop(); upper.pop();
    return lower.concat(upper);
  }

  /** 把若干地块**成组**（纯函数，不改动入参）。
   *  @param {Array} subPlots  子地块数组，每个至少要有 id + polyLatLng（或可重建）
   *  @param {Object} opts     { name, crop, id, ts }
   *  @returns {Object|null}   组对象；子地块不足 2 个或有无效环时返回 null
   *
   *  ★★ 语义（v189 2026-10-03 用户纠正，务必守住）：
   *    用户原话：「这个不是拼接是地块成组，我可能一个大地块分开画很多小地块，
   *      这些小地块在一起操作，我是这个意思，而不是把这些地块拼成一个大地块，
   *      这些小地块之间有的道路、间隔 那些都要保留，而不是给拼接起来，
   *      比如说两个地块间距有 3 米，那这个三米就留着，是一块空地好了，
   *      这块空地可能是无法使用的地块，也可能是道路 也可能是水渠。」
   *    ⇒ 「成组」= 把这些小地块**编成一组便于批量操作**，几何上**各自独立**，
   *      块与块之间的空隙（道路/水渠/空地）**原样保留**，不得被并进来。
   *    ⇒ 旧实现（凸包当主轮廓）是**错的**：凸包会把 3 米间隔一起吞掉，
   *      二级页拿到的是一个「假装连成一片」的大块。
   *
   *  返回对象字段：
   *    grouped:true           标记这是**成组**地块（保留 merged 字段名做向后兼容）
   *    merged:true            （同 grouped，老代码/老库仍认这个键）
   *    subPlots:[...]         成员快照（各自完整几何/作物/面积）
   *    polyLatLngSet:[[...]]  **成组后的权威几何 = 各成员环的集合**（多环，互不合并）
   *    polyLatLng             仅供包围盒/飞行的**参考外框**（凸包）—— 不是可见轮廓，
   *                           二级页**不得**把它当作地块边界参与布管/划分
   *    hullLatLng             同上（显式命名，避免被误当轮廓）
   *    poly / geo / center / mu / sqm / crs  与普通地块同构，供下游兜底读取
   */
  function mergePlots(subPlots, opts) {
    opts = opts || {};
    var list = (subPlots || []).filter(function (p) { return p && p.polyLatLng && p.polyLatLng.length >= 3; });
    if (list.length < 2) return null;

    // 成员快照：只留下游真正要用的字段，避免把一堆临时字段带进库
    var subs = list.map(function (p) {
      var subRing = p.polyLatLng.map(function (q) { return [+q[0], +q[1]]; });
      // 子地块也要有 center：供「分别布管」定位、以及自身面积重算
      var ctr = p.center;
      if (!ctr || !isFinite(ctr.lat) || !isFinite(ctr.lng)) {
        var sLat = 0, sLng = 0;
        subRing.forEach(function (q) { sLat += q[0]; sLng += q[1]; });
        ctr = { lat: +(sLat / subRing.length).toFixed(6), lng: +(sLng / subRing.length).toFixed(6) };
      } else {
        ctr = { lat: +ctr.lat, lng: +ctr.lng };
      }
      /* 面积：★ v189 起**一律以几何实测为准**（RunyeGeo.geodesicArea(subRing)），
         不再优先采信入参的 sqm/mu —— 那两个字段可能是旧值/四舍五入值，
         而「成组面积」现在直接等于成员面积之和，一个陈旧数字会被放大成整组误差。
         （实测踩到过：入参 sqm=666.67 而真实几何只有 ~470㎡，成组后 1333 vs 941，
           差 41%，根因就是采信了入参。） */
      var sSqm = Math.round(RunyeGeo.geodesicArea(subRing));
      if (!(sSqm > 0)) sSqm = (typeof p.sqm === 'number' && p.sqm > 0) ? p.sqm : 0;
      var sMu = +(sSqm / 666.67).toFixed(2);
      return {
        id: p.id,
        name: p.name || '',
        mu: sMu,
        sqm: sSqm,
        crop: p.crop || '',
        polyLatLng: subRing,
        center: ctr
      };
    });

    // 参考外框 = 全部成员顶点凸包。★ 只作包围盒/飞行定位用，**不是**地块边界。
    var allPts = [];
    subs.forEach(function (s) { allPts = allPts.concat(s.polyLatLng); });
    var hull = convexHull(allPts);
    if (hull.length < 3) return null;
    var outer = RunyeGeo.normalizeRing(hull);

    /* ★ 权威几何 = 成员环集合（多环，互不合并，空隙保留）。
       GeoJSON MultiPolygon 的口径：每个成员一个独立 ring。 */
    var polySet = subs.map(function (s) { return s.polyLatLng.map(function (q) { return [+q[0], +q[1]]; }); });

    /* 面积 = 各成员面积之和（**不是**凸包面积 —— 凸包会把道路/水渠/空地算进来，
       那正是用户明确要求不要的）。 */
    var sqmSum = 0;
    subs.forEach(function (s) { sqmSum += (typeof s.sqm === 'number' && s.sqm > 0) ? s.sqm : 0; });
    if (!(sqmSum > 0)) sqmSum = Math.round(subs.reduce(function (a, s) { return a + RunyeGeo.geodesicArea(s.polyLatLng); }, 0));
    var sqm = Math.round(sqmSum);
    var mu = +(sqm / 666.67).toFixed(2);

    // 与普通地块同构的字段（按参考外框换算，仅供兜底显示/居中；下游应以 polyLatLngSet 为准）
    var lats = outer.map(function (p) { return p[0]; });
    var lngs = outer.map(function (p) { return p[1]; });
    var clat = lats.reduce(function (a, b) { return a + b; }, 0) / lats.length;
    var sn = lngs.reduce(function (a, b) { return a + b; }, 0) / lngs.length;
    var R = 6378137, mlat = R * Math.PI / 180, cosLat = Math.cos(clat * Math.PI / 180);
    var poly = outer.map(function (p) {
      return {
        x: Math.round((p[1] - lngs[0]) * mlat * cosLat * 100) / 100,
        y: Math.round((p[0] - clat) * mlat * 100) / 100
      };
    });
    /* 成员环的本地米坐标集合（供二级页直接画「各自轮廓」用，不必自己再换算一遍）。 */
    var polySetM = polySet.map(function (ring) {
      return ring.map(function (p) {
        return {
          x: Math.round((p[1] - lngs[0]) * mlat * cosLat * 100) / 100,
          y: Math.round((p[0] - clat) * mlat * 100) / 100
        };
      });
    });

    var ids = subs.map(function (s) { return s.id; }).filter(Boolean).join('|');
    return {
      id: opts.id || ('mg' + Date.now() + Math.floor(Math.random() * 1000)),
      name: opts.name || (list.length + ' 块成组地块'),
      grouped: true,          // v189 正式语义：成组（几何不合并）
      merged: true,           // 向后兼容：老库/老代码仍按 merged 判定
      subPlots: subs,
      subIds: ids,
      polyLatLngSet: polySet,   // ★ 权威：各成员环（空隙保留）
      polySetM: polySetM,       // 同上的本地米坐标版
      polyLatLng: outer,        // ⚠ 仅供包围盒/飞行定位（凸包），非可见轮廓
      hullLatLng: outer,        // 显式命名，防止被误当轮廓
      mu: mu,
      sqm: sqm,
      poly: poly,
      center: { lat: +clat.toFixed(6), lng: +sn.toFixed(6) },
      geo: { refLat: +clat.toFixed(6), refLng: +outer[0][1].toFixed(6), proj: 'mercatorLocal', ts: Date.now() },
      crop: opts.crop || (list[0] && list[0].crop) || '',
      source: 'group',
      crs: 'GCJ-02',
      ts: opts.ts || Date.now(),
      note: opts.note || ''
    };
  }

  /** 拆分校验：确认一个「成组地块」能否还原成子地块（供「解散成组」与闸门使用）。
   *  返回 {ok, count, reason}。 */
  function canUnmerge(plot) {
    if (!plot || !plot.merged) return { ok: false, count: 0, reason: '不是成组地块' };
    var subs = plot.subPlots || [];
    if (subs.length < 2) return { ok: false, count: subs.length, reason: '子地块少于 2 个' };
    for (var i = 0; i < subs.length; i++) {
      if (!subs[i].polyLatLng || subs[i].polyLatLng.length < 3) {
        return { ok: false, count: subs.length, reason: '第 ' + (i + 1) + ' 个子地块缺环' };
      }
    }
    return { ok: true, count: subs.length, reason: '' };
  }

  return {
    attach: attach,
    export: { geoJSON: buildGeoJSON, kml: buildKML, download: download },
    parse: { geoJSON: parseGeoJSON, kml: parseKML },
    merge: {
      plots: mergePlots,
      hull: convexHull,
      canUnmerge: canUnmerge,
      /* [v185] 宿主页离线用法：直接操作地块库，不需要地图实例 */
      unmerge: function (bigId) { return doUnmerge(null, bigId); }
    }
  };
});
