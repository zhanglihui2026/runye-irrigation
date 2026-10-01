/* =====================================================================
 * runye-geo.js  ·  润野灌溉 · 统一坐标换算库（隔离模块）
 * ---------------------------------------------------------------------
 * 命名空间：window.RunyeGeo（浏览器）/ module.exports（Node 验证用）
 *
 * 职责：
 *   1. 维护一个项目级投影基准 runye_geo = { refLat, refLng }，
 *      让所有地块/管网落到同一本地米坐标平面（修复"每块各自原点、无法叠加"的问题）。
 *   2. 双向换算 ll2m / m2ll，算法与现有 runye-map-measure.html 完全一致
 *      （R=6378137, mlat=R*PI/180, cosLat=cos(refLat)），保证主程序画布几何不变。
 *   3. 兼容旧数据：feature 无 geo 字段时，按其自身首点为原点换算（回退）。
 *
 * 隔离原则：本文件不读写任何业务对象，只做纯坐标运算；
 *          持久化仅通过 lsGet/lsSet 读写 runye_geo 这一个 key。
 * 不依赖 Leaflet，可在 Node 中直接 require 做往返精度验证。
 * ===================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.RunyeGeo = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var R = 6378137;                 // 地球半径（米，WGS84 长半轴）
  var MLAT = R * Math.PI / 180;   // 纬度方向 1 度 ≈ 111319.49 m

  var GEO_KEY = 'runye_geo';

  function toRad(d) { return d * Math.PI / 180; }

  function lsGet(k, d) {
    try {
      var s = localStorage.getItem(k);
      return s ? JSON.parse(s) : d;
    } catch (e) { return d; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) { return false; }
  }

  /* ---- 当前项目基准（浏览器环境）；Node 验证时为 null，用传参基准 ---- */
  function getBase() {
    if (typeof localStorage === 'undefined') return null;
    var g = lsGet(GEO_KEY, null);
    if (g && isFinite(g.refLat) && isFinite(g.refLng)) return g;
    return null;
  }

  /**
   * 以某个经纬度点确立（或沿用）项目基准。仅在无基准时写入。
   * @returns {{refLat:number, refLng:number}}
   */
  function ensureGeo(lat, lng) {
    var cur = getBase();
    if (cur) return cur;
    if (!isFinite(lat) || !isFinite(lng)) {
      // 兜底默认：三亚崖州（与地图页默认中心一致）
      lat = 18.2528; lng = 109.5119;
    }
    var g = { refLat: +lat.toFixed(6), refLng: +lng.toFixed(6), proj: 'mercatorLocal', ts: Date.now() };
    lsSet(GEO_KEY, g);
    return g;
  }

  function cosLatOf(refLat) { return Math.cos(toRad(refLat)); }

  /**
   * 经纬度 → 本地米坐标。
   * @param {number} lat
   * @param {number} lng
   * @param {{refLat:number,refLng:number}} [base] 省略则用项目基准；都没有则用三亚默认
   * @returns {{x:number,y:number}}
   */
  function ll2m(lat, lng, base) {
    base = base || getBase() || { refLat: 18.2528, refLng: 109.5119 };
    var c = cosLatOf(base.refLat);
    return {
      x: (lng - base.refLng) * MLAT * c,
      y: (lat - base.refLat) * MLAT
    };
  }

  /**
   * 本地米坐标 → 经纬度（ll2m 的逆运算，用于把管网几何回投卫星图）。
   */
  function m2ll(x, y, base) {
    base = base || getBase() || { refLat: 18.2528, refLng: 109.5119 };
    var c = cosLatOf(base.refLat);
    return {
      lat: base.refLat + y / MLAT,
      lng: base.refLng + x / (MLAT * c)
    };
  }

  /** 多边形批量换算：[[lat,lng],...] -> [{x,y},...] */
  function polyLL2m(latlngs, base) {
    return (latlngs || []).map(function (p) {
      var m = ll2m(p[0], p[1], base);
      return { x: +m.x.toFixed(2), y: +m.y.toFixed(2) };
    });
  }

  /** 多边形批量换算：[{x,y},...] -> [[lat,lng],...] */
  function polyM2ll(poly, base) {
    return (poly || []).map(function (p) {
      var ll = m2ll(p.x, p.y, base);
      return [+ll.lat.toFixed(7), +ll.lng.toFixed(7)];
    });
  }

  /* ---- 兼容旧地块：无 geo 字段时，按 runye-map-measure.html 现行保存逻辑复刻原点 ----
   * 旧逻辑：x 原点 = 首点经度；y 原点 = 多边形平均纬度；cosLat 也用平均纬度。
   * 这样旧地块转出来的本地米坐标与主程序画布上已有的地块逐点重合，不产生整体平移。 */
  function baseOfFeature(feature) {
    if (feature && feature.geo && isFinite(feature.geo.refLat) && isFinite(feature.geo.refLng)) {
      return feature.geo;
    }
    if (feature && Array.isArray(feature.polyLatLng) && feature.polyLatLng.length >= 1) {
      var pts = feature.polyLatLng, sumLat = 0;
      for (var k = 0; k < pts.length; k++) sumLat += pts[k][0];
      return { refLat: sumLat / pts.length, refLng: pts[0][1] };
    }
    return getBase(); // 最终回退到项目基准
  }

  /**
   * 把一个 PlotFeature 的权威经纬度多边形转成主程序画布用的本地米坐标。
   * 保留原 poly 字段不动，返回新的 polyXY（供叠加/渲染）。
   */
  function toCanvasPoly(feature) {
    var base = baseOfFeature(feature);
    if (feature && Array.isArray(feature.polyLatLng) && feature.polyLatLng.length >= 3) {
      return polyLL2m(feature.polyLatLng, base);
    }
    return (feature && feature.poly) ? feature.poly : [];
  }

  /* =====================================================================
   * GCJ-02（高德/国测局火星坐标）转换 —— 2026-09-28 修复地图叠加偏移
   * 背景：高德卫星瓦片本身是 GCJ-02，而 Leaflet 按 WGS-84 网格摆放；
   *       因此"人工在高德影像上点击/读出的坐标"天然是 GCJ-02（贴合影像），
   *       而外部数据（搜索定位、导入 KML/GeoJSON 等）是真实 WGS-84，
   *       直接叠加就整体偏移。统一约定：本地存储与显示都用 GCJ-02，
   *       仅在 WGS-84 外部入口做 wgs2gcj 转换、导出时做 gcj2wgs 还原。
   * ===================================================================== */
  var GCJ_A = 6378245.0;                       // GCJ-02 参考椭球长半轴
  var GCJ_EE = 0.00669342162296594323;         // 偏心率平方
  function _outOfChina(lat, lng) {
    return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
  }
  function _transfLat(x, y) {
    var ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin(y / 3.0 * Math.PI)) * 2.0 / 3.0;
    ret += (160.0 * Math.sin(y / 12.0 * Math.PI) + 320 * Math.sin(y * Math.PI / 30.0)) * 2.0 / 3.0;
    return ret;
  }
  function _transfLng(x, y) {
    var ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin(x / 3.0 * Math.PI)) * 2.0 / 3.0;
    ret += (150.0 * Math.sin(x / 12.0 * Math.PI) + 300.0 * Math.sin(x / 30.0 * Math.PI)) * 2.0 / 3.0;
    return ret;
  }
  /** WGS-84 → GCJ-02（火星坐标）；境外点不转换原样返回 */
  function wgs2gcj(lat, lng) {
    if (_outOfChina(lat, lng)) return { lat: lat, lng: lng };
    var dLat = _transfLat(lng - 105.0, lat - 35.0);
    var dLng = _transfLng(lng - 105.0, lat - 35.0);
    var radLat = lat / 180.0 * Math.PI;
    var magic = Math.sin(radLat); magic = 1 - GCJ_EE * magic * magic;
    var sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / ((GCJ_A * (1 - GCJ_EE)) / (magic * sqrtMagic) * Math.PI);
    dLng = (dLng * 180.0) / (GCJ_A / sqrtMagic * Math.cos(radLat) * Math.PI);
    return { lat: lat + dLat, lng: lng + dLng };
  }
  /** GCJ-02 → WGS-84（迭代求逆，精度亚米级）；境外点不转换 */
  function gcj2wgs(lat, lng) {
    if (_outOfChina(lat, lng)) return { lat: lat, lng: lng };
    var wLat = lat, wLng = lng;
    for (var i = 0; i < 30; i++) {
      var g = wgs2gcj(wLat, wLng);
      var dLat = g.lat - lat, dLng = g.lng - lng;
      wLat -= dLat; wLng -= dLng;
      if (Math.abs(dLat) < 1e-9 && Math.abs(dLng) < 1e-9) break;
    }
    return { lat: wLat, lng: wLng };
  }
  /** 多边形 WGS-84 [[lat,lng],...] → GCJ-02 */
  function polyWgs2Gcj(pts) {
    return (pts || []).map(function (p) {
      var g = wgs2gcj(p[0], p[1]);
      return [+g.lat.toFixed(7), +g.lng.toFixed(7)];
    });
  }
  /** 多边形 GCJ-02 → WGS-84 */
  function polyGcj2Wgs(pts) {
    return (pts || []).map(function (p) {
      var g = gcj2wgs(p[0], p[1]);
      return [+g.lat.toFixed(7), +g.lng.toFixed(7)];
    });
  }

  /** haversine 两点距离（米），与地图页一致 */
  function hav(a, b) {
    var dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  /** 球面多边形面积（平方米），与地图页 geodesicArea 一致 */
  function geodesicArea(latlngs) {
    var pts = (latlngs || []);
    if (pts.length < 3) return 0;
    var area = 0;
    for (var i = 0; i < pts.length; i++) {
      var p1 = coordPair(pts[i]), p2 = coordPair(pts[(i + 1) % pts.length]);
      area += (toRad(p2[1]) - toRad(p1[1])) * (2 + Math.sin(toRad(p1[0])) + Math.sin(toRad(p2[0])));
    }
    return Math.abs(area * R * R / 2);
  }

  // 坐标边界统一支持历史数组和对象；拒绝 null、非有限数及越界值。
  function coordPair(p) {
    var lat = Array.isArray(p) ? p[0] : p && p.lat;
    var lng = Array.isArray(p) ? p[1] : p && p.lng;
    if (typeof lat !== 'number' || typeof lng !== 'number' || !isFinite(lat) || !isFinite(lng) || Math.abs(lat)>90 || Math.abs(lng)>180) throw new Error('无效的经纬度坐标');
    return [lat, lng];
  }
  function normalizeRing(points) {
    if (!Array.isArray(points)) throw new Error('地块缺少多边形坐标');
    var pts = points.map(coordPair);
    if (pts.length>1 && pts[0][0]===pts[pts.length-1][0] && pts[0][1]===pts[pts.length-1][1]) pts.pop();
    var seen = {};
    pts.forEach(function(p){ seen[p.join(',')] = true; });
    if (Object.keys(seen).length<3 || !(geodesicArea(pts)>0)) throw new Error('地块至少需要三个不同顶点及有效面积');
    return pts;
  }

  return {
    coordPair: coordPair, normalizeRing: normalizeRing,
    R: R, MLAT: MLAT, GEO_KEY: GEO_KEY,
    getBase: getBase,
    ensureGeo: ensureGeo,
    ll2m: ll2m,
    m2ll: m2ll,
    polyLL2m: polyLL2m,
    polyM2ll: polyM2ll,
    baseOfFeature: baseOfFeature,
    toCanvasPoly: toCanvasPoly,
    wgs2gcj: wgs2gcj,
    gcj2wgs: gcj2wgs,
    polyWgs2Gcj: polyWgs2Gcj,
    polyGcj2Wgs: polyGcj2Wgs,
    hav: hav,
    geodesicArea: geodesicArea
  };
});
