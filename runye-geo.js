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
      var p1 = pts[i], p2 = pts[(i + 1) % pts.length];
      area += (toRad(p2[1]) - toRad(p1[1])) * (2 + Math.sin(toRad(p1[0])) + Math.sin(toRad(p2[0])));
    }
    return Math.abs(area * R * R / 2);
  }

  return {
    R: R, MLAT: MLAT, GEO_KEY: GEO_KEY,
    getBase: getBase,
    ensureGeo: ensureGeo,
    ll2m: ll2m,
    m2ll: m2ll,
    polyLL2m: polyLL2m,
    polyM2ll: polyM2ll,
    baseOfFeature: baseOfFeature,
    toCanvasPoly: toCanvasPoly,
    hav: hav,
    geodesicArea: geodesicArea
  };
});
