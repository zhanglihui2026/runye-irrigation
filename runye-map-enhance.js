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
        zoneGroup: L.layerGroup().addTo(map),
        networkGroup: L.layerGroup().addTo(map),
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
          if(pts.length>=2) state.map.fitBounds(L.latLngBounds(pts),{padding:[50,50],maxZoom:17});
        }catch(e){}
      }
      state.refresh = function () { renderPlots(state, opts); renderNetwork(state, opts); autoFit(); };
      autoFit();
      return { ok: true, refresh: state.refresh };
    } catch (e) {
      return { ok: false, reason: '初始化异常: ' + (e && e.message) };
    }
  }

  function buildPanel(state, opts) {
    var el = document.createElement('div');
    el.className = 'rym-layer-panel';
    el.innerHTML =
      '<div class="rym-lp-t">图层</div>' +
      '<label><input type="checkbox" data-rym="plot" checked> 地块</label>' +
      '<label><input type="checkbox" data-rym="zone" checked> 分区</label>' +
      '<label><input type="checkbox" data-rym="network" checked> 管网</label>' +
      '<label><input type="checkbox" data-rym="device" checked> 设备</label>' +
      '<label style="margin-top:4px;border-top:1px solid #e2e8f0;padding-top:4px"><input type="checkbox" data-rym="fieldmode"> ☀️ 田间模式</label>';
    state.map.getContainer().appendChild(el);
    state.panelEl = el;
    el.addEventListener('change', function (e) {
      var k = e.target.getAttribute('data-rym');
      if (k === 'fieldmode') { document.body.classList.toggle('ry-field-mode', e.target.checked); return; }
      var on = e.target.checked, g = null;
      if (k === 'plot') g = state.plotGroup;
      else if (k === 'zone') g = state.zoneGroup;
      else if (k === 'network') g = state.networkGroup;
      else if (k === 'device') g = state.deviceGroup;
      if (!g) return;
      if (on) g.addTo(state.map); else g.remove();
    });
  }

  function renderPlots(state, opts) {
    state.plotGroup.clearLayers();
    var plots = (opts && opts.plots) ? opts.plots : readPlotLibrary();
    var drawn = 0, skipped = 0;
    plots.forEach(function (p) {
      try {
        var ll = p.polyLatLng;
        if (!ll || !ll.length || ll.length < 3) { skipped++; return; }
        var color = p.color || cropColor(p.crop);
        var poly = L.polygon(ll, { color: color, weight: 2, fillColor: color, fillOpacity: 0.18 });
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
            } catch (e) {}
            try { state.refresh(); } catch (e) {}
            poly.closePopup();
          };
        });
        if (typeof opts.onPick === 'function') {
          poly.on('click', function () { try { opts.onPick(p); } catch (e) {} });
        }
        poly.addTo(state.plotGroup);
        drawn++;
      } catch (e) {}
    });
    if (!drawn && skipped && console && console.warn) {
      console.warn('[map-enhance] ' + skipped + ' 个旧地块缺少 polyLatLng，暂不叠加。');
    }
    return { drawn: drawn, skipped: skipped };
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
    var net = (opts && opts.network) ? opts.network : readNetwork();
    if (!net || !net.segments || !net.segments.length) return { drawn: 0 };
    net.segments.forEach(function (s) {
      try {
        if (!s.latLng || s.latLng.length < 2) return;
        var st = dnStyle(s.dn);
        var line = L.polyline(s.latLng, { color: st.color, weight: st.weight, opacity: 0.9 });
        line.bindPopup(
          '<div style="font:12px/1.6 system-ui,sans-serif;min-width:150px">' +
          '<b style="color:#15803d">' + escapeHtml(s.name || s.id || '管段') + '</b><br>' +
          '管径：DN' + escapeHtml(s.dn || '—') + '<br>' +
          '长度：' + escapeHtml((+s.len).toFixed ? (+s.len).toFixed(1) : s.len) + ' m<br>' +
          (s.q != null ? '流量：' + escapeHtml((+s.q).toFixed(2)) + ' m³/h<br>' : '') +
          (s.v != null ? '流速：' + escapeHtml((+s.v).toFixed(2)) + ' m/s<br>' : '') +
          '</div>'
        );
        line.addTo(state.networkGroup);
      } catch (e) {}
    });
    if (net.sourcePos && isFinite(net.sourcePos.lat) && isFinite(net.sourcePos.lng)) {
      try {
        var pump = L.marker([net.sourcePos.lat, net.sourcePos.lng], { icon: L.divIcon({
          className: 'rym-pump', iconSize: [22, 22], iconAnchor: [11, 11],
          html: '<div style="width:20px;height:20px;border-radius:50%;background:#15803d;' +
                'border:2px solid #fff;box-shadow:0 0 4px rgba(0,0,0,.4)"></div>'
        })});
        pump.bindTooltip('水源/泵站', { direction: 'top' });
        pump.addTo(state.networkGroup);
      } catch (e) {}
    }
    /* 阀门：红色圆点（net.valves = [{lat,lng}]） */
    if (net.valves && net.valves.length) {
      net.valves.forEach(function (v) {
        try {
          if (!v || !isFinite(v.lat) || !isFinite(v.lng)) return;
          var m = L.circleMarker([v.lat, v.lng], { radius: 6, color: '#ef4444', weight: 2, fillColor: '#ef4444', fillOpacity: 0.95 });
          m.bindTooltip('阀门', { direction: 'top' });
          m.addTo(state.networkGroup);
        } catch (e) {}
      });
    }
    /* 滴灌带：青色细虚线（net.dripTapes = [[{lat,lng},{lat,lng}], ...]） */
    if (net.dripTapes && net.dripTapes.length) {
      net.dripTapes.forEach(function (line) {
        try {
          if (!line || line.length < 2) return;
          var ll = line.map(function (p) { return [p.lat, p.lng]; });
          L.polyline(ll, { color: '#06b6d4', weight: 1, opacity: 0.65, dashArray: '3,3' }).addTo(state.networkGroup);
        } catch (e) {}
      });
    }
    return { drawn: net.segments.length, valves: (net.valves || []).length, dripTapes: (net.dripTapes || []).length };
  }

  /* ---- 导出：地块 -> GeoJSON / KML ---- */
  function buildGeoJSON(plots) {
    var feats = (plots || []).filter(function (p) { return p.polyLatLng && p.polyLatLng.length >= 3; }).map(function (p) {
      var ring = p.polyLatLng.map(function (ll) { return [ll[1], ll[0]]; });
      ring.push([p.polyLatLng[0][1], p.polyLatLng[0][0]]);
      return { type: 'Feature', properties: { name: p.name || '', mu: p.mu || 0, crop: p.crop || '' },
        geometry: { type: 'Polygon', coordinates: [ring] } };
    });
    return JSON.stringify({ type: 'FeatureCollection', features: feats }, null, 2);
  }
  function buildKML(plots) {
    function pm(p) {
      var coords = p.polyLatLng.map(function (ll) { return ll[1] + ',' + ll[0] + ',0'; }).join(' ');
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
    var plots = [];
    var j = JSON.parse(text);
    var feats = j.type === 'FeatureCollection' ? j.features : (j.type === 'Feature' ? [j] : []);
    (feats || []).forEach(function (f) {
      var g = f.geometry, props = f.properties || {};
      if (!g) return;
      var rings = [];
      if (g.type === 'Polygon') rings = [g.coordinates[0]];
      else if (g.type === 'MultiPolygon') rings = g.coordinates.map(function (pg) { return pg[0]; });
      rings.forEach(function (ring) {
        if (!ring || ring.length < 4) return;
        var ll = ring.map(function (c) { return [c[1], c[0]]; }); // [lng,lat] -> [lat,lng]
        var first = ll[0], last = ll[ll.length - 1];
        if (first[0] === last[0] && first[1] === last[1]) ll.pop();
        plots.push({ name: props.name || props.Name || '', mu: +props.mu || 0, polyLatLng: ll });
      });
    });
    return plots;
  }
  function parseKML(text) {
    var plots = [];
    var re = /<Placemark[\s>][\s\S]*?<\/Placemark>/gi, m;
    while ((m = re.exec(text)) !== null) {
      var block = m[0];
      var nm = block.match(/<name>([\s\S]*?)<\/name>/i);
      var name = nm ? nm[1].trim() : '';
      var co = block.match(/<coordinates>([\s\S]*?)<\/coordinates>/i);
      if (!co) continue;
      var ll = [];
      co[1].trim().split(/\s+/).forEach(function (pair) {
        var c = pair.split(',');
        if (c.length >= 2) {
          var lng = parseFloat(c[0]), lat = parseFloat(c[1]);
          if (isFinite(lat) && isFinite(lng)) ll.push([lat, lng]);
        }
      });
      if (ll.length >= 3) {
        var first = ll[0], last = ll[ll.length - 1];
        if (first[0] === last[0] && first[1] === last[1]) ll.pop();
        plots.push({ name: name, mu: 0, polyLatLng: ll });
      }
    }
    return plots;
  }

  return {
    attach: attach,
    export: { geoJSON: buildGeoJSON, kml: buildKML, download: download },
    parse: { geoJSON: parseGeoJSON, kml: parseKML }
  };
});
