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
 *
 * 另一个身份（v843 起）：**经纬度测距的唯一实现**（haversine / lineLen / trunkLen）。
 *   扬程要把「在线地图总管实测长度」算进总管沿程损失，而面板又要在自己那一栏显示同一个长度，
 *   两处必须同源 —— 差 0.2m 不影响结论，但两个数不一致会让人不信任整张表。
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
     [lat,lng] / [lat,lng,z] / {lat,lng} 都认。
     [v854 专项] 空位（null/undefined/''）一律非法 —— 与 rawPointOk / schema.readPoint
     同语义（Number(null)===0 会把空位读成几内亚湾上的点）。本函数的全部调用方
     （ll2m / autoSign 的 rmsOf / lineLen 经 rawPointOk 前置）都已对 null 返回值
     做失败关闭处理：ll2m 返回 null 调用方跳过、rmsOf 判 Infinity 走默认 sign。 */
  function readLatLng(q) {
    if (Array.isArray(q)) {
      if (q[0] == null || q[0] === '' || q[1] == null || q[1] === '') return null;
      var a = Number(q[0]), b = Number(q[1]);
      return isNum(a) && isNum(b) ? { lat: a, lng: b } : null;
    }
    if (q && typeof q === 'object') {
      if (q.lat == null || q.lat === '' || q.lng == null || q.lng === '') return null;
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

  /* 两点球面距离（米）。
     ★ R 必须是 **6378137** —— 和 `__runyeGeoBase` 的 mlat（`m2ll`/`ll2m` 用的那个）、
       以及 inline-09/13/16、online-map 里所有「米 ⇄ 经纬度」换算**同一个 R**。
       取 IUGG 平均半径 6371008.8 看着更"正确"，但那样量出来的米和图上量出来的米
       差 0.11%（342 m 上差 0.38 m），而扬程要把「地图总管长」和「图面主管/支管长」
       直接相加 —— 两段不在同一个米里的数加起来，就不是长度了。
     （自检闭环：tests/trunk_geo_ll2m.test.cjs ⑫ 用 m2ll 造 100 m、lineLen 量回来必须
       等于 100.000；R 一旦取错这条立刻红。） */
  function haversine(a, b) {
    var R = 6378137;
    var rad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * rad;
    var dLng = (b.lng - a.lng) * rad;
    var s1 = Math.sin(dLat / 2), s2 = Math.sin(dLng / 2);
    var h = s1 * s1 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * s2 * s2;
    if (h < 0) h = 0;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  /* 折点"原始值是否像一个坐标"。
     ★ 为什么要多这一层：`Number(null)` 是 0、`Number('')` 也是 0，宽容读会把
       空位变成「几内亚湾上的点」，历史数据里真出现一个空位就会让整根干线
       量出几千公里。
     ★ [v854 专项] readLatLng 本体现在也按同语义收紧了（空位 ⇒ null，全部调用方
       均失败关闭）——本函数保留：lineLen 需要区分「坏点计数」与「读出但越界」，
       且它是这条收紧链的历史出处。 */
  function rawPointOk(q) {
    if (Array.isArray(q)) {
      if (q.length < 2) return false;
      return q[0] !== null && q[0] !== undefined && q[0] !== '' &&
             q[1] !== null && q[1] !== undefined && q[1] !== '';
    }
    if (q && typeof q === 'object') {
      return q.lat !== null && q.lat !== undefined && q.lat !== '' &&
             q.lng !== null && q.lng !== undefined && q.lng !== '';
    }
    return false;
  }

  /* 一条折线的投影长度。返回 { ok, len, bad }：
     ★ 有一个折点读不出来就 ok=false —— **不跳过坏点硬连**。跳过会让折线抄近道，
       长度偏小、扬程偏小，而这种偏差在矩形地块上看不出来（视觉上还是"沿着画的"）。
       宁可让调用方退回上一种长度来源，也不要给一个悄悄变短的数。 */
  function lineLen(points) {
    if (!Array.isArray(points)) return { ok: false, len: 0, bad: 0 };
    var pts = [], bad = 0;
    for (var i = 0; i < points.length; i++) {
      var p = rawPointOk(points[i]) ? readLatLng(points[i]) : null;
      if (p) pts.push(p); else bad++;
    }
    if (pts.length < 2) return { ok: false, len: 0, bad: bad + (2 - pts.length) };
    var L = 0;
    for (var j = 1; j < pts.length; j++) L += haversine(pts[j - 1], pts[j]);
    return { ok: bad === 0, len: L, bad: bad };
  }

  /* 一组干线里「总管」的长度。
   *
   * 选哪一条：优先 main===true 的那条；没有标记就取**最长**的一条。
   *   理由：地块里可能同时画了总管和支线，扬程走的是最不利那一条，
   *   按最长取既符合"最不利"的物理含义，也不需要依赖用户记得给干线打 main 标记。
   *
   * 返回 { ok, len, id, source, count }。source='main' 表示按 main 标记取的，
   * 'longest' 表示按最长取的（界面要能说清这个数是哪来的）。
   * 任意一条被选中的干线折点不全 ⇒ ok=false，调用方退回原来的长度来源。
   */
  function trunkLen(trunks) {
    if (!Array.isArray(trunks) || !trunks.length) {
      return { ok: false, len: 0, id: null, source: 'none', count: 0 };
    }
    var mains = [], all = [];
    for (var i = 0; i < trunks.length; i++) {
      var t = trunks[i];
      if (!t || typeof t !== 'object') continue;
      var L = lineLen(t.points);
      var rec = { ok: L.ok, len: L.len, id: (typeof t.id === 'string') ? t.id : null, main: t.main === true };
      all.push(rec);
      if (rec.main) mains.push(rec);
    }
    if (!all.length) return { ok: false, len: 0, id: null, source: 'none', count: 0 };
    var pool = mains.length ? mains : all;
    var pick = pool[0];
    for (var k = 1; k < pool.length; k++) if (pool[k].len > pick.len) pick = pool[k];
    return { ok: pick.ok, len: pick.len, id: pick.id, source: mains.length ? 'main' : 'longest', count: all.length };
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
    haversine: haversine,
    lineLen: lineLen,
    trunkLen: trunkLen,
    trunkToCad: trunkToCad,
    frameToWorld: frameToWorld,
    zoneWorlds: zoneWorlds,
    autoSign: autoSign
  };
})(typeof window !== 'undefined' ? window : this);
