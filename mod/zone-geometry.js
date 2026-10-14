(function (root) {
  'use strict';

  var MAX_AUTO_ZONE_COUNT = 500;
  var MAX_AUTO_ZONE_DIMENSION = 1000000000;

  function splitZoneLength(total, step, limit) {
    var parts = [];
    var used = 0;
    var boundedStep = Math.max(1, Number(step) || 1);
    while (total - used > boundedStep + 0.05) {
      if (parts.length >= limit) {
        var error = new RangeError('手动分区数量超过 ' + limit + ' 个上限');
        error.code = 'manual_zone_count_exceeded';
        error.requestedCount = parts.length + 1;
        error.maxCount = limit;
        throw error;
      }
      parts.push(boundedStep);
      used += boundedStep;
    }
    var rest = total - used;
    if (rest > 0.05) {
      if (parts.length >= limit) {
        var restError = new RangeError('手动分区数量超过 ' + limit + ' 个上限');
        restError.code = 'manual_zone_count_exceeded';
        restError.requestedCount = parts.length + 1;
        restError.maxCount = limit;
        throw restError;
      }
      parts.push(rest);
    }
    return parts.length ? parts : [total];
  }

  function splitZoneLengthCount(total, step, limit) {
    var used = 0, count = 0;
    var boundedStep = Math.max(1, Number(step) || 1);
    while (total - used > boundedStep + 0.05) {
      count++;
      if (count > limit) return count;
      used += boundedStep;
    }
    var rest = total - used;
    return count + (rest > 0.05 ? 1 : 0) || 1;
  }

  function manualZoneLayout(width, height, manualMu, fixedSide, muToSqm, limit) {
    var w = Number(width), h = Number(height);
    var safeW = isFinite(w) && w > 0 ? Math.min(w, MAX_AUTO_ZONE_DIMENSION) : 1;
    var safeH = isFinite(h) && h > 0 ? Math.min(h, MAX_AUTO_ZONE_DIMENSION) : 1;
    var targetArea = Math.max(0.1, manualMu || 0.1) * muToSqm;
    var side = Number(fixedSide);
    if (!isFinite(targetArea) || !isFinite(side) || side <= 0) {
      var parameterError = new RangeError('手动分区参数超出可计算范围');
      parameterError.code = 'manual_zone_count_exceeded';
      parameterError.maxCount = limit;
      throw parameterError;
    }
    var derivedSide = Math.max(1, targetArea / side);
    if (!isFinite(derivedSide)) {
      var derivedError = new RangeError('手动分区参数超出可计算范围');
      derivedError.code = 'manual_zone_count_exceeded';
      derivedError.maxCount = limit;
      throw derivedError;
    }
    var longIsX = safeW >= safeH;
    var xDesign = longIsX ? derivedSide : side;
    var yDesign = longIsX ? side : derivedSide;
    var xCount = splitZoneLengthCount(safeW, xDesign, limit);
    var yCount = splitZoneLengthCount(safeH, yDesign, limit);
    if (xCount * yCount > limit) {
      var countError = new RangeError('手动分区数量超过 ' + limit + ' 个上限');
      countError.code = 'manual_zone_count_exceeded';
      countError.requestedCount = xCount * yCount;
      countError.maxCount = limit;
      throw countError;
    }
    var xParts = splitZoneLength(safeW, xDesign, limit);
    var yParts = splitZoneLength(safeH, yDesign, limit);
    var cols = xParts.length, rows = yParts.length;
    return {
      cols: cols, rows: rows, N: cols * rows,
      zoneW: side, zoneH: derivedSide, zoneArea: side * derivedSide,
      drawZoneW: safeW / cols, drawZoneH: safeH / rows,
      designW: xDesign, designH: yDesign, manual: true
    };
  }

  function autoZoneLayout(width, height, requestedN, fixedSide) {
    var side = Number(fixedSide), w = Number(width), h = Number(height);
    var S = isFinite(side) && side > 0 ? side : 200;
    var safeW = isFinite(w) && w > 0 ? Math.min(w, MAX_AUTO_ZONE_DIMENSION) : 1;
    var safeH = isFinite(h) && h > 0 ? Math.min(h, MAX_AUTO_ZONE_DIMENSION) : 1;
    var totalArea = safeW * safeH;
    var minCols = Math.max(1, Math.ceil(safeW / S));
    var minRows = Math.max(1, Math.ceil(safeH / S));
    var minNBySide = minCols * minRows;
    var minNByArea = Math.max(1, Math.ceil(totalArea / (S * S)));
    var minN = Math.max(minNBySide, minNByArea);
    var requested = parseInt(requestedN, 10) || minN;
    /* Geometry may itself imply millions of cells (for example imported corrupt
       coordinates). Keep both the search and downstream grid bounded. In that
       exceptional case the 500-cell cap takes precedence over the nominal side. */
    var targetN = Math.min(MAX_AUTO_ZONE_COUNT, Math.max(requested, minN));
    var geometryFitsCap = minN <= MAX_AUTO_ZONE_COUNT;
    var firstCol = geometryFitsCap ? Math.min(minCols, targetN) : 1;
    var minRowForSearch = geometryFitsCap ? Math.min(minRows, targetN) : 1;
    var best = null;

    for (var cols = firstCol; cols <= targetN; cols++) {
      var rows = Math.max(minRowForSearch, Math.ceil(targetN / cols));
      var n = cols * rows;
      if (n > MAX_AUTO_ZONE_COUNT) continue;
      var drawZoneW = safeW / cols;
      var drawZoneH = safeH / rows;
      var zoneArea = totalArea / n;
      var derivedSide = zoneArea / S;
      var aspectError = Math.abs(drawZoneW - drawZoneH);
      if (!best || n < best.N || (n === best.N && aspectError < best.aspectError)) {
        best = {
          cols: cols, rows: rows, N: n,
          zoneW: S, zoneH: derivedSide, zoneArea: zoneArea,
          drawZoneW: drawZoneW, drawZoneH: drawZoneH,
          designW: drawZoneW, designH: drawZoneH, aspectError: aspectError
        };
      }
    }

    if (best) return best;
    /* The requested/minimum count can be prime-adjacent to the cap and have no
       valid ceil-grid under it. Use the largest bounded grid below the target. */
    var fallbackCols = Math.max(1, Math.min(targetN, Math.floor(Math.sqrt(targetN * safeW / safeH)) || 1));
    var fallbackRows = Math.max(1, Math.floor(MAX_AUTO_ZONE_COUNT / fallbackCols));
    while (fallbackCols * fallbackRows > targetN && fallbackRows > 1) fallbackRows--;
    var fallbackN = fallbackCols * fallbackRows;
    var fw = safeW / fallbackCols, fh = safeH / fallbackRows;
    var fa = totalArea / fallbackN;
    return { cols: fallbackCols, rows: fallbackRows, N: fallbackN,
      zoneW: S, zoneH: fa / S, zoneArea: fa,
      drawZoneW: fw, drawZoneH: fh, designW: fw, designH: fh };
  }

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


  /* [v416 2026-10-13 用户口径] 布管方向单一事实来源 —— 彻底解决「主管/支管与滴灌带不垂直」。
     规则优先级（硬约束在前，冲突时牺牲后者）：
       ① 滴灌带 ∥ tapeAxis，主管 ∥ 支管 ⊥ tapeAxis（由本函数单一输出保证，不可能被违反）；
       ② 全图（同一地块）方向统一：少数服从多数；
       ③ 各分区滴灌带长度尽量贴合「单边铺设长度×2」（= 固定边 S）：软目标，冲突时牺牲（支管略增）。
     投票判据由旧的「宽高比」改为「贴合 S 的程度」（fit = extent/S，>1 反向惩罚）——
     多数派天然是更省支管、更贴合铺设长度的方向。
     segs[]：沿 tapeAxis 的滴灌带分段数（带长 > S 时自动切段，杜绝画出超长带）。 */
  function axisFit(extent, S) {
    if (!(extent > 0) || !(S > 0)) return 0;
    var r = extent / S;
    return r <= 1 ? r : 1 / r;
  }

  function tapeAxisOf(cuts, fixedSide) {
    var out = { ok: false, tapeAxis: 'x', pipeAxis: 'y', votes: { x: 0, y: 0 }, segs: [],
                report: { shortZones: 0, overZones: 0, avgTape: 0, avgOpt: 0, branchRatio: 1 } };
    if (!cuts || !(cuts.cols > 0) || !(cuts.rows > 0) || !cuts.xPlan || !cuts.yPlan) return out;
    var S = Number(fixedSide) > 0 ? Number(fixedSide) : 200;
    var votes = { x: 0, y: 0 }, fitSum = { x: 0, y: 0 }, n = 0, sumTape = 0, sumOpt = 0, short = 0, over = 0;
    var axis = 'x';
    for (var zr = 0; zr < cuts.rows; zr++) {
      for (var zc = 0; zc < cuts.cols; zc++) {
        var ex = Number(cuts.xPlan[zc]) || 0, ey = Number(cuts.yPlan[zr]) || 0;
        var fx = axisFit(ex, S), fy = axisFit(ey, S);
        fitSum.x += fx; fitSum.y += fy;
        if (fx >= fy) votes.x++; else votes.y++;
      }
    }
    /* 平票（如上下两排分区数相同）→ 由「贴合度加权」更高的一侧破平：
       即选更省支管、更贴合单边铺设长度的方向，而不是任意取默认轴。 */
    axis = (votes.x === votes.y) ? (fitSum.y > fitSum.x ? 'y' : 'x')
                                 : (votes.x > votes.y ? 'x' : 'y');
    for (var r2 = 0; r2 < cuts.rows; r2++) {
      for (var c2 = 0; c2 < cuts.cols; c2++) {
        var ex2 = Number(cuts.xPlan[c2]) || 0, ey2 = Number(cuts.yPlan[r2]) || 0;
        var tape = axis === 'x' ? ex2 : ey2;
        var opt = Math.max(ex2, ey2);
        out.segs.push(Math.max(1, Math.ceil(tape / S)));
        if (tape > S + 0.5) over++;
        if (tape < S * 0.5) short++;
        sumTape += tape; sumOpt += opt; n++;
      }
    }
    if (n > 0) {
      out.report.shortZones = short; out.report.overZones = over;
      out.report.avgTape = sumTape / n; out.report.avgOpt = sumOpt / n;
      out.report.branchRatio = sumTape > 0 ? (sumOpt / sumTape) : 1;
    }
    out.votes = votes; out.tapeAxis = axis; out.pipeAxis = axis === 'x' ? 'y' : 'x'; out.ok = true;
    return out;
  }

  var api = {
    MAX_AUTO_ZONE_COUNT: MAX_AUTO_ZONE_COUNT,
    manualZoneLayout: manualZoneLayout,
    splitZoneLength: splitZoneLength,
    splitZoneLengthCount: splitZoneLengthCount,
    autoZoneLayout: autoZoneLayout,
    axisFit: axisFit,
    tapeAxisOf: tapeAxisOf,
    polyAreaM2: polyAreaM2,
    clipPolyToRect: clipPolyToRect,
    zoneGx: zoneGx,
    zoneGy: zoneGy,
    zoneAreaGroups: zoneAreaGroups
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.RyZoneGeometry = api;
})(typeof window !== 'undefined' ? window : null);
