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
      /* [v185] 拼接多选：选中地块加粗描边（Leaflet 图层级样式已另设，此处补一条 CSS 兜底） */
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
        /* [v185] 拼接多选态：被选中的地块 id 集合。刷新渲染后按此重画高亮。 */
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
      /* 兜底入口：面板里没有「拼接多选」勾选框时，宿主页仍可直接翻内部态 */
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
    /* [v185] 拼接模式：勾上后单击地块 = 多选（不弹气泡），底部出现「拼接为大地块」操作条。
     * 只在宿主页显式传了 opts.onMergeMode 时才出现，避免其它引用页多出死控件。 */
    var hasMergeRow = !!(opts && typeof opts.onMergeMode === 'function');
    if (hasMergeRow) ROWS.push(['mergepick', '🔗 拼接多选']);
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
      if (k === 'mergepick') {               // [v185] 拼接多选模式：交给宿主页与本模块共同处理
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
   * [v185] 拼接多选：状态 → 画面
   * ---------------------------------------------------------------------
   * 交互契约：opts.mergePick === true 时（地图页开启「拼接」模式），
   *   单击地块 = 选中/取消（不弹气泡）；已是拼接地块 = 提示先「撤销拼接」。
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
      /* [v187] 拼接地块由 N 个子地块环组成 ⇒ 选中/取消必须**逐圈**应用，
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

  /** 底部「已选 N 块」操作条：仅在拼接模式下、且选中 ≥1 时出现 */
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
      '<button type="button" class="rym-mb-go"' + (ids.length < 2 ? ' disabled' : '') + '>拼接为大地块</button>' +
      '<button type="button" class="rym-mb-clear">清空选择</button>';
    var go = bar.querySelector('.rym-mb-go');
    var cl = bar.querySelector('.rym-mb-clear');
    if (go) go.onclick = function () { doMergeSelected(state, {}); };
    if (cl) cl.onclick = function () { state.clearSelection(); };
  }

  /** 执行拼接：把当前选中的地块合成一个大地块写入地块库，原小地块移到 mergedInto 归档区 */
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
    // 已是拼接地块的不能重复拼（否则会丢失上一次的子地块归属）
    var nested = picked.filter(function (p) { return p.merged; });
    if (nested.length) {
      return { ok: false, reason: '「' + (nested[0].name || nested[0].id) + '」本身已是拼接地块，请先「撤销拼接」后再拼' };
    }

    var big = mergePlots(picked, { name: o.name });
    if (!big) return { ok: false, reason: '拼接失败：子地块缺少有效环' };

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

  /** 撤销拼接：把大地块拆回子地块（子地块原本就在库里，只需解除归档与大地块） */
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
    /* [v185] 已被拼接进大地块的原小地块不单独画（大地块的外轮廓已含它），
       但仍留在库里（保留子地块）→ 只在 popup 里提示它属于哪个大地块。 */
    var mergedAway = {};
    plots.forEach(function (p) { if (p && p.mergedInto) mergedAway[p.id] = p.mergedInto; });
    plots.forEach(function (p) {
      try {
        if (p && p.mergedInto) return;   // 归档中的子地块：跳过绘制（由大地块代表）
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
        var color = p.color || cropColor(p.crop);
        /* ===== [v187 2026-10-03] 拼接地块：只画「各自轮廓线」，外面不再加外框 =====
         * 用户原话：「地块拼接之后 是各自的轮廓线，外面不用再加一个框。」
         * 旧实现画两层：① 外层凸包大框（紫粗实线）② 子地块环（紫细虚线，且**只在拼接模式下**画）
         *   ⇒ 平时视图看到的是「一个包住所有小地块的大框」，等于把子地块信息藏起来了，
         *     而子地块恰恰是后续「分别布管」的依据。且凸包会把 L 形/凹形地块的角补满，
         *     面积比实际大（已知偏差），画出来还误导。
         * 新实现：**去掉外层凸包框**，改为把每个子地块各自画一圈**独立闭合**的轮廓线，
         *   颜色用**各自的作物色**（与未拼接时观感一致，一眼区分不同子地块）。
         * 这样「拼接」在数据上仍是一个大地块（传递到二级页仍带 subPlots），
         *   但在地图上呈现为「几块各自的地」——正是用户要的。
         * 注意：交互层（popup / 点击选中 / 撤销拼接）必须保留，否则去掉外框就点不到。
         *   做法：给每个子地块环挂上同一套 popup 与 click 处理器，任一块都能唤起。
         * 另加一个「描边兜底」的不可见外轮廓（opacity 0）——不参与视觉，
         *   仅用于 `fitBounds` / 选中态改样式时有一个代表整块的几何可引用。 */
        var isMerged = !!(p.merged && p.subPlots && p.subPlots.length);
        var baseStyle = isMerged
          ? { color: '#7c3aed', weight: 2.5, fillColor: '#a78bfa', fillOpacity: 0.12 }
          : { color: color, weight: 2, fillColor: color, fillOpacity: 0.18 };
        /* --- 图层集合：普通地块 = 1 个多边形；拼接地块 = N 个子地块各自一圈 ---
         * 统一放进 `layers` 数组，后面的 popup / click / 选中样式都按数组处理。 */
        var layers = [];
        if (isMerged) {
          p.subPlots.forEach(function (s, si) {
            if (!s.polyLatLng || s.polyLatLng.length < 3) return;
            var sLL = validRingLL(s.polyLatLng);
            if (!sLL) return;
            /* 子地块自己的作物色：库里没写就退回大地块的，再退回调色板 */
            var sColor = s.color || cropColor(s.crop || p.crop);
            var sStyle = { color: sColor, weight: 2.5, fillColor: sColor, fillOpacity: 0.22 };
            var sPoly = L.polygon(displayLL(sLL, opts), sStyle);
            sPoly._rySubIdx = si;
            sPoly._rySubStyle = sStyle;     // 取消选中时还原「这块自己的颜色」，而不是大地块的底色
            layers.push(sPoly);
          });
        }
        if (!layers.length) {
          // 普通地块，或拼接地块的 subPlots 全不可用（退化兜底：画凸包外轮廓，别让地块消失）
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
            '<b style="color:#7c3aed">由 ' + p.subPlots.length + ' 个子地块拼接</b>' +
            '<div style="color:#64748b;margin-top:2px">各子地块可分别布置管道，再用总管互连</div>' +
            subRows + '</div>' +
            '<button id="rymUnmerge" style="margin-top:5px;padding:3px 12px;background:#7c3aed;color:#fff;border:0;cursor:pointer;font-size:12px">↩ 撤销拼接</button>';
        }
        /* ===== 交互绑定：popup / 点击 / 加入图层组 =====
         * 拼接地块有 N 个子地块环 ⇒ **每一圈都要能唤起同一套气泡与点击**，
         * 否则用户点到「没有外框的那部分」就没反应（去掉外框后最易踩的坑）。
         * 用 forEach 逐层绑定，行为与单层时完全一致。 */
        var popupHtml =
          '<div style="font:12px/1.6 system-ui,sans-serif;min-width:190px">' +
          '<b style="color:' + (isMerged ? '#7c3aed' : '#15803d') + '">' +
          escapeHtml(p.name || '未命名地块') + (isMerged ? '（拼接地块）' : '') + '</b><br>' +
          '面积：<b>' + (+mu).toFixed(2) + '</b> 亩　顶点：' + ll.length + ' 个' +
          subHtml +
          '<label style="display:block;margin-top:5px">作物 <input id="rymCrop" style="width:88%;padding:2px 4px;border:1px solid #cbd5e1" value="' + escapeHtml(p.crop || '') + '" placeholder="如：七彩花生"></label>' +
          '<label style="display:block;margin-top:3px">备注 <textarea id="rymNote" rows="2" style="width:88%;padding:2px 4px;border:1px solid #cbd5e1" placeholder="地形/水源/备注">' + escapeHtml(p.note || '') + '</textarea></label>' +
          '<button id="rymSave" style="margin-top:5px;padding:3px 12px;background:#16a34a;color:#fff;border:0;cursor:pointer;font-size:12px">保存</button>' +
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
          var ub = document.getElementById('rymUnmerge');
          if (ub) ub.onclick = function () {
            if (!confirm('撤销拼接？\n将把「' + (p.name || '该地块') + '」拆回 ' + ((p.subPlots || []).length) + ' 个子地块。')) return;
            var r = doUnmerge(state, p.id);
            if (!r.ok) alert('撤销拼接失败：' + r.reason);
          };
        };
        var onClickPick = function (e) { try { opts.onPick(p); } catch (err) {} };
        var onClickMerge = function (e) {
          try {
            if (L.DomEvent && e) L.DomEvent.stopPropagation(e);
            if (p.merged) { alert('「' + (p.name || '该地块') + '」已是拼接地块。\n如需重拼，请先在气泡里「撤销拼接」。'); return; }
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
         * ★ layers 是数组：拼接地块要能把**每一圈**都切成选中态，
         *   否则会出现「只有第一个子地块变色、其余的没反应」的怪现象。 */
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
  function renderNetwork(state, opts) {
    state.networkGroup.clearLayers();
    state.dripGroup.clearLayers();
    state.deviceGroup.clearLayers();
    var net = (opts && opts.network) ? opts.network : readNetwork();
    if (!net) return { drawn: 0 };
    (net.segments || []).forEach(function (s) {
      try {
        var sLL = validRingLL(s.latLng, 2);   // 同样挡住含 null 顶点的管段（否则 _project 抛错连累全部矢量层）
        if (!sLL) return;
        var st = dnStyle(s.dn);
        var length = s.len;
        if (typeof length !== 'number' || !isFinite(length) || length<0) {
          length=0;
          for(var i=1;i<sLL.length;i++) {
            var a=RunyeGeo.coordPair(sLL[i-1]), b=RunyeGeo.coordPair(sLL[i]);
            length+=RunyeGeo.hav({lat:a[0],lng:a[1]},{lat:b[0],lng:b[1]});
          }
        }
        var line = L.polyline(displayLL(sLL, opts), { color: st.color, weight: st.weight, opacity: 0.9 });
        line.bindPopup(
          '<div style="font:12px/1.6 system-ui,sans-serif;min-width:150px">' +
          '<b style="color:#15803d">' + escapeHtml(s.name || s.id || '管段') + '</b><br>' +
          '管径：DN' + escapeHtml(s.dn || '—') + '<br>' +
          '长度：' + escapeHtml(length.toFixed(1)) + ' m<br>' +
          (s.q != null ? '流量：' + escapeHtml((+s.q).toFixed(2)) + ' m³/h<br>' : '') +
          (s.v != null ? '流速：' + escapeHtml((+s.v).toFixed(2)) + ' m/s<br>' : '') +
          '</div>'
        );
        line.addTo(state.networkGroup);
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
    /* 滴灌带：青色细虚线（net.dripTapes = [[{lat,lng},{lat,lng}], ...]） */
    if (net.dripTapes && net.dripTapes.length) {
      net.dripTapes.forEach(function (line) {
        try {
          var dLL = validRingLL(line, 2);
          if (!dLL) return;
          L.polyline(displayLL(dLL, opts), { color: '#06b6d4', weight: 1, opacity: 0.65, dashArray: '3,3' }).addTo(state.dripGroup);
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
   * [v185 2026-10-03] 地块拼接（merge）
   * ---------------------------------------------------------------------
   * 用户诉求：在地图上画几个相邻小地块 → 拼接成一个大地块；各小地块各自
   *          布管，再用总管互连；拼接后的大地块传给二级管路页面。
   *
   * 设计口径（已与用户确认）：**保留子地块 + 外层综合轮廓**
   *   · 大地块仍是一个地块实体（进地块库、能传递到二级页）；
   *   · 但内部记住由哪几个子地块组成（subPlots），子地块环各自保留
   *     —— 这样后续才能「分别对每个子地块布管」。
   *
   * 为什么不做几何并集？并集会抹掉子地块边界，就再也拆不回子地块了。
   * 本模块只做「外层综合轮廓」的构造：取全部子地块顶点的凸包。
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

  /** 把若干地块拼成「大地块」数据对象（纯函数，不改动入参）。
   *  @param {Array} subPlots  子地块数组，每个至少要有 id + polyLatLng（或可重建）
   *  @param {Object} opts     { name, crop, id, ts }
   *  @returns {Object|null}   大地块对象；子地块不足 2 个或有无效环时返回 null
   *
   *  返回对象新增字段：
   *    merged:true            标记这是拼接地块（二级页据此进入「手动划分」默认态）
   *    subPlots:[{id,name,mu,sqm,polyLatLng,center,crop}]  子地块快照（各自保留环）
   *    polyLatLng             外层综合轮廓（凸包）
   *    poly / geo / center / mu / sqm / crs  与普通地块同构，下游零改动可用
   */
  function mergePlots(subPlots, opts) {
    opts = opts || {};
    var list = (subPlots || []).filter(function (p) { return p && p.polyLatLng && p.polyLatLng.length >= 3; });
    if (list.length < 2) return null;

    // 子地块快照：只留下游真正要用的字段，避免把一堆临时字段带进库
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
      // 面积同理：入参没带就算一个，别让下游拿到 null
      var sSqm = (typeof p.sqm === 'number' && p.sqm > 0) ? p.sqm : Math.round(RunyeGeo.geodesicArea(subRing));
      var sMu = (typeof p.mu === 'number' && p.mu > 0) ? p.mu : +(sSqm / 666.67).toFixed(2);
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

    // 外层综合轮廓 = 全部子地块顶点凸包
    var allPts = [];
    subs.forEach(function (s) { allPts = allPts.concat(s.polyLatLng); });
    var hull = convexHull(allPts);
    if (hull.length < 3) return null;
    var outer = RunyeGeo.normalizeRing(hull);

    var sqm = Math.round(RunyeGeo.geodesicArea(outer));
    var mu = +(sqm / 666.67).toFixed(2);

    // 与普通地块同构的字段：本地米坐标（原点=首点经度 / 平均纬度，与地图页保存地块一致）
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

    var ids = subs.map(function (s) { return s.id; }).filter(Boolean).join('|');
    return {
      id: opts.id || ('mg' + Date.now() + Math.floor(Math.random() * 1000)),
      name: opts.name || (list.length + ' 块拼接地块'),
      merged: true,
      subPlots: subs,
      subIds: ids,
      mu: mu,
      sqm: sqm,
      poly: poly,
      polyLatLng: outer,
      center: { lat: +clat.toFixed(6), lng: +sn.toFixed(6) },
      geo: { refLat: +clat.toFixed(6), refLng: +outer[0][1].toFixed(6), proj: 'mercatorLocal', ts: Date.now() },
      crop: opts.crop || (list[0] && list[0].crop) || '',
      source: 'merge',
      crs: 'GCJ-02',
      ts: opts.ts || Date.now(),
      note: opts.note || ''
    };
  }

  /** 拆分校验：确认一个「拼接地块」能否还原成子地块（供「撤销拼接」与闸门使用）。
   *  返回 {ok, count, reason}。 */
  function canUnmerge(plot) {
    if (!plot || !plot.merged) return { ok: false, count: 0, reason: '不是拼接地块' };
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
