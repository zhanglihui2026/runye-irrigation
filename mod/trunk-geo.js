/* 施工图坐标 ⇄ 经纬度（总管绘制捕捉 / DXF 导出用）。纯函数，可在 Node 里直接单测。
 *
 * 为什么单独一个模块（改之前先读）：
 *   判定逻辑留在宿主里就只能靠浏览器探针验，而"符号选错"这种错误在 angle=0 的
 *   矩形地块上看不出旋转情形，回归成本很高。按站内既有分工（见 mod/trunk-snap.js
 *   文件头同一条理由）——**判定在纯函数里，宿主只负责取素材 / 给结果落地**。
 *
 * ★ 这里最要紧的一条：**不许硬编码 y 的符号**。
 *   同一个 __runyeGeoBase 下：
 *     · plot.poly（地图页 saveCurrentDraftToLibrary 存的）  → 北 = +y
 *     · measuredPolygon / tlDiagramData（画布口径，v217 镜像后） → 北 = −y
 *   而地块库里的历史数据两种都有（inline-13 的 ryOrientPlotPoly 就是在判方向）。
 *   实测 300×170m 的地块，选错符号误差正好 170m —— 整块南北颠倒，
 *   表现是"吸附点跑到地块外面的空气里"。
 *   ⇒ 做法：拿地块库的 polyLatLng（权威 GCJ-02）当标尺，对 ±y 各算一次 RMS，
 *     选能对上的那个；对不上（或两个都像 ⇒ 地块退化）就**拒绝反算**。
 *     宁可少吸一个点，不要吸到错误位置。
 */
(function (root) {
  'use strict';

  var MLAT = 6378137 * Math.PI / 180;

  /* 判定阈值（米）。
     OK_M 取 0.5：站点反投用 toFixed(6)，1e-6° ≈ 0.11m，正常闭环误差远小于它。
     WRONG_M 取 1：另一个候选只差不到 1m ⇒ 说明地块近似一条东西向线，
       正反两个符号都"能对上"，此时无法定向，必须拒绝而不是随便挑一个。 */
  var OK_M = 0.5;
  var WRONG_M = 1;

  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  function baseOk(base) {
    return !!base && isNum(base.refLat) && isNum(base.refLng)
      && base.refLat >= -90 && base.refLat <= 90
      && base.refLng >= -180 && base.refLng <= 180;
  }

  /* 读一个折点，与 core/trunk-schema.js / mod/trunk-snap.js 同口径：
     [lat,lng] / [lat,lng,z] / {lat,lng} 都认。 */
  function readLatLng(q) {
    if (Array.isArray(q)) {
      var a = Number(q[0]), b = Number(q[1]);
      return isNum(a) && isNum(b) ? { lat: a, lng: b } : null;
    }
    if (q && typeof q === 'object') {
      var la = Number(q.lat), ln = Number(q.lng);
      return isNum(la) && isNum(ln) ? { lat: la, lng: ln } : null;
    }
    return null;
  }

  /* 米坐标 → 经纬度。sign=+1 表示北=+y（地图口径），-1 表示北=−y（画布口径）。 */
  function m2ll(x, y, base, sign) {
    if (!baseOk(base)) return null;
    var px = Number(x), py = Number(y);
    if (!isNum(px) || !isNum(py)) return null;
    var s = (sign < 0) ? -1 : 1;
    var cosLat = Math.cos(base.refLat * Math.PI / 180);
    return {
      lat: base.refLat + s * (py / MLAT),
      lng: base.refLng + px / (MLAT * cosLat)
    };
  }

  /* 经纬度 → 米坐标（m2ll 的逆）。sign 口径与 m2ll 完全一致：
     sign=+1 北=+y（地图口径），-1 北=−y（画布口径）。
     之所以要它：DXF 导出要把地图页的总管折线搬回施工图坐标系 —— 那条链是反的。 */
  function ll2m(q, base, sign) {
    if (!baseOk(base)) return null;
    var w = readLatLng(q);
    if (!w) return null;
    var s = (sign < 0) ? -1 : 1;
    var cosLat = Math.cos(base.refLat * Math.PI / 180);
    return {
      x: (w.lng - base.refLng) * MLAT * cosLat,
      y: s * (w.lat - base.refLat) * MLAT
    };
  }

  /* 地图总管折点 → 施工图 DXF 的 CAD 坐标（[[x,y],…]）。
   *
   * ★ y 必须取负，且理由要说清楚（这行符号错了整根干线南北翻转，
   *   而正南北走向的干线上看起来"只是挪了位置"，是最难查的那一类错）：
   *   runye-dxf.js 的 makeInv 把 SVG 屏幕坐标换回 CAD 时是
   *     CAD_y = -((sy - oy)/s + minY)
   *   而图面是 sy = (my - minY)*s + oy  ⇒  CAD_y = -my。
   *   x 方向则**完全相同**（minX / ox 在 ts 与 inv 里正好抵消）。
   *   ⇒ 图面米坐标 (x, my) 到 CAD 只差一个 y 取负，别在这里重新做一遍 view 变换。
   *
   * 任一折点非法就返回 null（宁可不画这根，也不要画一根缺段的线）。 */
  function trunkToCad(points, base, sign) {
    if (!Array.isArray(points) || !points.length) return null;
    var out = [];
    for (var i = 0; i < points.length; i++) {
      var m = ll2m(points[i], base, sign);
      if (!m || !isNum(m.x) || !isNum(m.y)) return null;
      out.push([m.x, -m.y]);
    }
    return out;
  }

  /* 分区网格交点：frame 局部坐标 → 世界米。
     口径与 mod/inline-09.js 的 tlFrameToWorld 逐字一致（frame 允许为 null = 恒等）。 */
  function frameToWorld(frame, p) {
    if (!frame) return { x: p.x, y: p.y };
    var c = frame.center || { x: 0, y: 0 }, o = frame.origin || { x: 0, y: 0 };
    var a = (Number(frame.angle) || 0) * Math.PI / 180;
    var cs = Math.cos(a), sn = Math.sin(a);
    var sx = Number(frame.scaleX) || 1, sy = Number(frame.scaleY) || 1;
    var dx = p.x - c.x, dy = p.y - c.y;
    return { x: o.x + (c.x + dx * cs - dy * sn) / sx, y: o.y + (c.y + dx * sn + dy * cs) / sy };
  }

  /* zones.xPos × zones.yPos 的全部交点（世界米）。 */
  function zoneWorlds(zones) {
    if (!zones) return [];
    var xs = Array.isArray(zones.xPos) ? zones.xPos : [];
    var ys = Array.isArray(zones.yPos) ? zones.yPos : [];
    if (!xs.length || !ys.length) return [];
    var f = zones.frame, out = [];
    for (var i = 0; i < xs.length; i++) {
      for (var j = 0; j < ys.length; j++) {
        if (!isNum(+xs[i]) || !isNum(+ys[j])) continue;
        out.push(frameToWorld(f, { x: +xs[i], y: +ys[j] }));
      }
    }
    return out;
  }

  /* 自校准：用地块环（权威经纬度）当标尺，在 ±y 两个候选里选。
     返回 { ok, sign, rms, other, why }；ok=false 时调用方必须放弃反算。 */
  function autoSign(poly, ring, base) {
    if (!baseOk(base)) return { ok: false, sign: 0, rms: Infinity, other: Infinity, why: 'no-base' };
    if (!Array.isArray(poly) || !Array.isArray(ring)) return { ok: false, sign: 0, rms: Infinity, other: Infinity, why: 'no-input' };
    if (poly.length < 3 || poly.length !== ring.length) {
      return { ok: false, sign: 0, rms: Infinity, other: Infinity, why: 'ring-mismatch' };
    }
    var cosLat = Math.cos(base.refLat * Math.PI / 180);
    var kLat = MLAT * MLAT, kLng = MLAT * MLAT * cosLat * cosLat;

    function rmsOf(sign) {
      var s = 0;
      for (var i = 0; i < poly.length; i++) {
        var q = poly[i], w = readLatLng(ring[i]);
        if (!q || !w) return Infinity;
        var qx = Number(q.x), qy = Number(q.y);
        if (!isNum(qx) || !isNum(qy)) return Infinity;
        var dLat = (base.refLat + sign * (qy / MLAT)) - w.lat;
        var dLng = (base.refLng + qx / (MLAT * cosLat)) - w.lng;
        if (!isFinite(dLat) || !isFinite(dLng)) return Infinity;
        s += dLat * dLat * kLat + dLng * dLng * kLng;
      }
      return Math.sqrt(s / poly.length);
    }

    var rNeg = rmsOf(-1), rPos = rmsOf(1);
    var sign = (rNeg <= rPos) ? -1 : 1;
    var best = Math.min(rNeg, rPos), other = Math.max(rNeg, rPos);
    if (!isFinite(best)) return { ok: false, sign: 0, rms: Infinity, other: Infinity, why: 'degenerate' };
    if (best > OK_M) return { ok: false, sign: 0, rms: best, other: other, why: 'not-aligned' };
    if (other <= WRONG_M) return { ok: false, sign: 0, rms: best, other: other, why: 'ambiguous' };
    return { ok: true, sign: sign, rms: best, other: other, why: '' };
  }

  root.RyTrunkGeo = {
    MLAT: MLAT,
    OK_M: OK_M,
    WRONG_M: WRONG_M,
    readLatLng: readLatLng,
    m2ll: m2ll,
    ll2m: ll2m,
    trunkToCad: trunkToCad,
    frameToWorld: frameToWorld,
    zoneWorlds: zoneWorlds,
    autoSign: autoSign
  };
})(typeof window !== 'undefined' ? window : this);
