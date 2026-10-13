(function (root) {
  'use strict';

  function polyAreaM2(poly) {
    if (!poly || poly.length < 3) return 0;
    var s = 0;
    for (var i = 0; i < poly.length; i++) {
      var a = poly[i], b = poly[(i + 1) % poly.length];
      s += a.x * b.y - b.x * a.y;
    }
    return Math.abs(s) / 2;
  }

  function clipPolyToRect(poly, x0, y0, x1, y1) {
    function half(pts, inside, inter) {
      var res = [];
      for (var i = 0; i < pts.length; i++) {
        var cur = pts[i], prev = pts[(i - 1 + pts.length) % pts.length];
        var ci = inside(cur), pi = inside(prev);
        if (ci) { if (!pi) res.push(inter(prev, cur)); res.push(cur); }
        else if (pi) { res.push(inter(prev, cur)); }
      }
      return res;
    }
    if (!poly || poly.length < 3) return [];
    var o = poly;
    o = half(o, function (p) { return p.x >= x0; }, function (a, b) { var t = (x0 - a.x) / (b.x - a.x); return { x: x0, y: a.y + t * (b.y - a.y) }; });
    o = half(o, function (p) { return p.x <= x1; }, function (a, b) { var t = (x1 - a.x) / (b.x - a.x); return { x: x1, y: a.y + t * (b.y - a.y) }; });
    o = half(o, function (p) { return p.y >= y0; }, function (a, b) { var t = (y0 - a.y) / (b.y - a.y); return { x: a.x + t * (b.x - a.x), y: y0 }; });
    o = half(o, function (p) { return p.y <= y1; }, function (a, b) { var t = (y1 - a.y) / (b.y - a.y); return { x: a.x + t * (b.x - a.x), y: y1 }; });
    return o;
  }

  function zoneGx(cuts, ri, ci) {
    var o = cuts && cuts.cutOffX, v = o ? o[ri + ',' + ci] : null;
    return (v != null && isFinite(v)) ? v : cuts.xPos[ci];
  }

  function zoneGy(cuts, ci, ri) {
    var o = cuts && cuts.cutOffY, v = o ? o[ci + ',' + ri] : null;
    return (v != null && isFinite(v)) ? v : cuts.yPos[ri];
  }

  function zoneAreaGroups(cuts, poly, n) {
    var out = { ok: false, cells: [], maxCell: 0, maxCellIndex: -1, groups: [], maxGroup: 0, maxGroupIndex: -1, groupCount: 0 };
    try {
      if (!cuts || !cuts.cols || !cuts.rows || !cuts.xPos || !cuts.yPos) return out;
      var total = cuts.cols * cuts.rows;
      if (!(total > 0)) return out;
      var N = Math.max(1, Math.round(n || 1));
      var usePoly = !!(poly && poly.length >= 3);
      for (var zi = 0; zi < total; zi++) {
        var zc = zi % cuts.cols, zr = Math.floor(zi / cuts.cols);
        var x0 = zoneGx(cuts, zr, zc), y0 = zoneGy(cuts, zc, zr), x1 = zoneGx(cuts, zr, zc + 1), y1 = zoneGy(cuts, zc, zr + 1);
        var a = 0;
        if (usePoly && x1 > x0 && y1 > y0) a = polyAreaM2(clipPolyToRect(poly, x0, y0, x1, y1));
        else if (cuts.xPlan && cuts.yPlan) a = cuts.xPlan[zc] * cuts.yPlan[zr];
        if (!(a > 0)) a = 0;
        out.cells.push(a);
        if (a > out.maxCell) { out.maxCell = a; out.maxCellIndex = zi; }
      }
      var gc = Math.max(1, Math.ceil(total / N));
      for (var g = 0; g < gc; g++) {
        var sum = 0, zs = [];
        for (var zz = g * N; zz < Math.min((g + 1) * N, total); zz++) { sum += out.cells[zz]; zs.push(zz); }
        out.groups.push({ g: g, sum: sum, zones: zs });
        if (sum > out.maxGroup) { out.maxGroup = sum; out.maxGroupIndex = g; }
      }
      out.groupCount = out.groups.length;
      out.ok = true;
    } catch (e) { out.ok = false; }
    return out;
  }

  var api = {
    polyAreaM2: polyAreaM2,
    clipPolyToRect: clipPolyToRect,
    zoneGx: zoneGx,
    zoneGy: zoneGy,
    zoneAreaGroups: zoneAreaGroups
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.RyZoneGeometry = api;
})(typeof window !== 'undefined' ? window : null);
