(function (root) {
  'use strict';

  function length(pts) {
    var total = 0;
    for (var i = 0; i + 1 < pts.length; i++) {
      total += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    }
    return total;
  }

  function pointAt(pts, atM) {
    var total = length(pts), left = Math.max(0, Math.min(atM, total));
    for (var i = 0; i + 1 < pts.length; i++) {
      var seg = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
      if (seg > 0 && left <= seg) {
        var t = left / seg;
        return {
          x: pts[i].x + (pts[i + 1].x - pts[i].x) * t,
          y: pts[i].y + (pts[i + 1].y - pts[i].y) * t
        };
      }
      left -= seg;
    }
    var end = pts[pts.length - 1];
    return { x: end.x, y: end.y };
  }

  function sliceArc(pts, a, b) {
    if (!pts || pts.length < 2 || !(b - a > 1e-6)) return null;
    var out = [], total = 0;
    for (var i = 0; i + 1 < pts.length && total < b; i++) {
      var ax = pts[i].x, ay = pts[i].y, bx = pts[i + 1].x, by = pts[i + 1].y;
      var seg = Math.hypot(bx - ax, by - ay);
      if (total + seg <= a) { total += seg; continue; }
      var t0 = Math.max(0, seg > 0 ? (a - total) / seg : 0);
      var t1 = Math.min(1, seg > 0 ? (b - total) / seg : 1);
      if (!out.length) out.push({ x: ax + (bx - ax) * t0, y: ay + (by - ay) * t0 });
      if (t1 >= 1) out.push({ x: bx, y: by });
      else out.push({ x: ax + (bx - ax) * t1, y: ay + (by - ay) * t1 });
      total += seg;
      if (t1 < 1) break;
    }
    return out.length >= 2 ? out : null;
  }

  var api = { length: length, pointAt: pointAt, sliceArc: sliceArc };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.RyTlPolylineGeometry = api;
})(typeof window !== 'undefined' ? window : null);
