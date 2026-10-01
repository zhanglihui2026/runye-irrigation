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
      '.ry-field-mode .rym-layer-panel{background:#fff8e1;border:2px solid #f59e0b}';
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
        panelEl: null
      };
      buildPanel(state, opts);
      renderPlots(state, opts);
      renderNetwork(state, opts);
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
      return { ok: true, refresh: state.refresh, setLayer: state.setLayer };
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
  function renderPlots(state, opts) {
    state.plotGroup.clearLayers();
    var plots = (opts && opts.plots) ? opts.plots : readPlotLibrary();
    var fromLib = !(opts && opts.plots);
    var drawn = 0, skipped = 0, healed = 0, cleaned = 0;
    plots.forEach(function (p) {
      try {
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
        var poly = L.polygon(displayLL(ll, opts), { color: color, weight: 2, fillColor: color, fillOpacity: 0.18 });
        var mu = (p.mu != null) ? p.mu : (RunyeGeo.geodesicArea(ll) / 666.67);
        poly.bindPopup(
          '<div style="font:12px/1.6 system-ui,sans-serif;min-width:190px">' +
          '<b style="color:#15803d">' + escapeHtml(p.name || '未命名地块') + '</b><br>' +
          '面积：<b>' + (+mu).toFixed(2) + '</b> 亩　顶点：' + ll.length + ' 个' +
          '<label style="display:block;margin-top:5px">作物 <input id="rymCrop" style="width:88%;padding:2px 4px;border:1px solid #cbd5e1" value="' + escapeHtml(p.crop || '') + '" placeholder="如：七彩花生"></label>' +
          '<label style="display:block;margin-top:3px">备注 <textarea id="rymNote" rows="2" style="width:88%;padding:2px 4px;border:1px solid #cbd5e1" placeholder="地形/水源/备注">' + escapeHtml(p.note || '') + '</textarea></label>' +
          '<button id="rymSave" style="margin-top:5px;padding:3px 12px;background:#16a34a;color:#fff;border:0;cursor:pointer;font-size:12px">保存</button>' +
          '</div>'
        );
        poly.on('popupopen', function () {
          var btn = document.getElementById('rymSave');
          if (!btn) return;
          btn.onclick = function () {
            var crop = (document.getElementById('rymCrop') || {}).value || '';
            var note = (document.getElementById('rymNote') || {}).value || '';
            try {
              var lib = JSON.parse(localStorage.getItem('runye_plot_library') || '[]');
              for (var i = 0; i < lib.length; i++) { if (lib[i].id === p.id) { lib[i].crop = crop; lib[i].note = note; break; } }
              localStorage.setItem('runye_plot_library', JSON.stringify(lib));
            } catch (e) { alert('保存失败：' + e.message); return; }
            try { state.refresh(); } catch (e) {}
            poly.closePopup();
          };
        });
        if (typeof opts.onPick === 'function') {
          poly.on('click', function () { try { opts.onPick(p); } catch (e) {} });
        }
        poly.addTo(state.plotGroup);
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
    var plots=[];
    descendants(doc,'Placemark').forEach(function(pm){
      var name=firstText(pm,'name'), crop='';
      descendants(pm,'Data').forEach(function(d){if(d.getAttribute('name')==='crop') crop=firstText(d,'value');});
      descendants(pm,'Polygon').forEach(function(poly){
        if(descendants(poly,'innerBoundaryIs').length) throw new Error('暂不支持带内孔的地块，请先拆分为无孔多边形');
        var outer=descendants(poly,'outerBoundaryIs');
        if(outer.length!==1) throw new Error('KML 地块缺少唯一外边界');
        var coords=firstText(outer[0],'coordinates');
        var ll=RunyeGeo.normalizeRing(coords.split(/\s+/).map(function(pair){var c=pair.split(',');return [parseFloat(c[1]),parseFloat(c[0])];}));
        plots.push({name:name,crop:crop,polyLatLng:ll});
      });
    });
    return plots;
  }

  return {
    attach: attach,
    export: { geoJSON: buildGeoJSON, kml: buildKML, download: download },
    parse: { geoJSON: parseGeoJSON, kml: parseKML }
  };
});
