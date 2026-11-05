(function (root) {
  'use strict';

  var MAX_AUTO_ZONE_COUNT = 500;
  var MAX_AUTO_ZONE_DIMENSION = 1000000000;

  /* [v891 2026-11-05 用户拍板「方案C」] 第 4 参 mergeLast：末排并入上一排。
     背景：地块高除不尽设计格高时，末排是被边界裁出来的余排（如 423.6 / 160
     → [160,160,103.6]，末排每格只有 ~15.7 亩）。勾选「末排并入上排」后把
     末段并进前一段 → [160,263.6]，分区数减少、单区面积增大（15 区 → 10 区）。
     仅在调用方显式传 true 时生效，缺省行为与 v877（窄条吸收）逐字节一致。 */
  function splitZoneLength(total, step, limit, mergeLast) {
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
      /* [v877] 窄条吸收：余数小于半个设计步长时不再独立成末段——窄条行/列会照常
         生成主管、参与材料计算并被段总管串联，用户实测手动亩/区模式下底部/右缘
         多出一条贴边主管（如 total=500、step=160 → [160,160,160,20]）。改为把
         余数均摊进已有分段 → [166.7,166.7,166.7]，分段数不增、与分区标签口径
         （均分段长）一致；rest ≥ 0.5×step 时仍视为正常分区保留独立段。 */
      if (parts.length > 0 && rest < boundedStep * 0.5) {
        var add = rest / parts.length;
        for (var ai = 0; ai < parts.length; ai++) parts[ai] += add;
      } else {
        if (parts.length >= limit) {
          var restError = new RangeError('手动分区数量超过 ' + limit + ' 个上限');
          restError.code = 'manual_zone_count_exceeded';
          restError.requestedCount = parts.length + 1;
          restError.maxCount = limit;
          throw restError;
        }
        parts.push(rest);
      }
    }
    /* [v891] mergeLast 在窄条吸收之后执行：单段不并（并无可并对象）；
       并入是整段相加，不重新均摊——设计口径仍是「末排 = 上排 + 余排」。 */
    if (mergeLast && parts.length >= 2) {
      var lastSum = parts[parts.length - 2] + parts[parts.length - 1];
      parts = parts.slice(0, parts.length - 2);
      parts.push(lastSum);
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

  /* [v891] 第 7 参 mergeLastRow：行方向末排并入上一排（列方向不变）。
     yCount 的上限校验用「并入后」的行数，避免误报 manual_zone_count_exceeded；
     zoneArea / designW / designH 仍返回「设计口径」（未并入的目标值），
     实划口径由调用方按 yParts（并入后）与 drift 双口径展示。 */
  function manualZoneLayout(width, height, manualMu, fixedSide, muToSqm, limit, mergeLastRow) {
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
    /* [v969] 上限校验改按「实际分段数」（先切后校验）。原先用 splitZoneLengthCount
       预估，但该函数不做 v877 窄条吸收——余条（rest < 0.5×step）会被多计一格，
       导致「实际 5 列」被按 6 列校验、贴着上限的合法布局被误抛
       manual_zone_count_exceeded（实测 521/24亩/limit=10）。逐段函数自身仍带
       limit 硬顶，超大轴不会失控。 */
    var xParts = splitZoneLength(safeW, xDesign, limit);
    var yParts = splitZoneLength(safeH, yDesign, limit, !!mergeLastRow);
    var cols = xParts.length, rows = yParts.length;
    if (cols * rows > limit) {
      var countError = new RangeError('手动分区数量超过 ' + limit + ' 个上限');
      countError.code = 'manual_zone_count_exceeded';
      countError.requestedCount = cols * rows;
      countError.maxCount = limit;
      throw countError;
    }
    return {
      cols: cols, rows: rows, N: cols * rows,
      zoneW: side, zoneH: derivedSide, zoneArea: side * derivedSide,
      drawZoneW: safeW / cols, drawZoneH: safeH / rows,
      designW: xDesign, designH: yDesign, manual: true,
      mergeLastRow: !!mergeLastRow, yParts: yParts
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
       ② 第1分区沿自身长边铺带，其余分区跟随第1分区的轴；
       ③ 主管/支管取垂直轴，总管再垂直于主管；
       ④ 单边铺设长度只决定分段数，不改变方向。
     segs[]：沿 tapeAxis 的滴灌带分段数（带长 > S 时自动切段，杜绝画出超长带）。 */
  function axisFit(extent, S) {
    if (!(extent > 0) || !(S > 0)) return 0;
    var r = extent / S;
    return r <= 1 ? r : 1 / r;
  }

  function firstZoneSpans(cuts) {
    if (!cuts || !cuts.xPos || cuts.xPos.length < 2 || !cuts.yPos || cuts.yPos.length < 2) {
      return {
        horizontal: Number(cuts && cuts.xSrc && cuts.xSrc[0]) || Number(cuts && cuts.xPlan && cuts.xPlan[0]) || 0,
        vertical: Number(cuts && cuts.ySrc && cuts.ySrc[0]) || Number(cuts && cuts.yPlan && cuts.yPlan[0]) || 0
      };
    }
    var x0 = zoneGx(cuts, 0, 0), x1 = zoneGx(cuts, 0, 1);
    var x2 = zoneGx(cuts, 1, 1), x3 = zoneGx(cuts, 1, 0);
    var y0 = zoneGy(cuts, 0, 0), y1 = zoneGy(cuts, 1, 0);
    var y2 = zoneGy(cuts, 1, 1), y3 = zoneGy(cuts, 0, 1);
    var horizontal = (Math.hypot(x1 - x0, y1 - y0) + Math.hypot(x2 - x3, y2 - y3)) / 2;
    var vertical = (Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x0, y3 - y0)) / 2;
    if (!(horizontal > 0) || !(vertical > 0)) {
      horizontal = Number(cuts.xSrc && cuts.xSrc[0]) || Number(cuts.xPlan && cuts.xPlan[0]) || 0;
      vertical = Number(cuts.ySrc && cuts.ySrc[0]) || Number(cuts.yPlan && cuts.yPlan[0]) || 0;
    }
    return { horizontal: horizontal, vertical: vertical };
  }

  function tapeAxisOf(cuts, fixedSide) {
    var out = { ok: false, tapeAxis: 'x', pipeAxis: 'y', votes: { x: 0, y: 0 }, segs: [],
                report: { shortZones: 0, overZones: 0, avgTape: 0, avgOpt: 0, branchRatio: 1 } };
    if (!cuts || !(cuts.cols > 0) || !(cuts.rows > 0) || !cuts.xPlan || !cuts.yPlan) return out;
    var S = Number(fixedSide) > 0 ? Number(fixedSide) : 200;
    var votes = { x: 0, y: 0 }, n = 0, sumTape = 0, sumOpt = 0, short = 0, over = 0;
    var axis = 'x';
    for (var zr = 0; zr < cuts.rows; zr++) {
      for (var zc = 0; zc < cuts.cols; zc++) {
        var ex = Number(cuts.xSrc && cuts.xSrc[zc]) || Number(cuts.xPlan[zc]) || 0;
        var ey = Number(cuts.ySrc && cuts.ySrc[zr]) || Number(cuts.yPlan[zr]) || 0;
        var fx = axisFit(ex, S), fy = axisFit(ey, S);
        if (fx >= fy) votes.x++; else votes.y++;
      }
    }
    /* 第1分区是行优先序列的左上格；用实际四条边（含阶梯切线覆盖）定向，正方形固定取 x。
       后续格子不能通过投票或铺设长度覆盖这个方向。 */
    var firstSpan = firstZoneSpans(cuts);
    var firstW = firstSpan.horizontal, firstH = firstSpan.vertical;
    axis = firstH > firstW ? 'y' : 'x';
    for (var r2 = 0; r2 < cuts.rows; r2++) {
      for (var c2 = 0; c2 < cuts.cols; c2++) {
        var ex2 = Number(cuts.xSrc && cuts.xSrc[c2]) || Number(cuts.xPlan[c2]) || 0;
        var ey2 = Number(cuts.ySrc && cuts.ySrc[r2]) || Number(cuts.yPlan[r2]) || 0;
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

  /* [v890 2026-11-05 用户要求] 「设计亩数」与「图面实划亩数」双口径对照。
     起因：手填「分区划定 N 亩/区」时，设计格宽 = N x 666.67 / 分区固定边长；
     地块外接宽除不尽设计格宽，只能落成整数列数，余数按 splitZoneLength 的
     「余数均摊」规则并入已有各列 => 每格实际大于 N 亩（实测 24 -> 25.0，+4.2%）。
     此前界面只显示实划值，用户读作「算错了」。本函数给出统一对照口径，
     供二级画布标签 / 施工简图 / 三级「依据」行共用，避免三处各写一套阈值。
     designM2 / actualM2 均为平方米；tolPct 缺省 3（正常取整不打扰）。
     返回 text 即可直接上屏：未漂移时是「25.0亩」，漂移时是「25.0亩 设24.0」。 */
  function zoneAreaDrift(designM2, actualM2, tolPct) {
    var d = Number(designM2), a = Number(actualM2), tol = Number(tolPct);
    if (!isFinite(tol) || tol <= 0) tol = 3;
    var out = { ok: false, drift: false, designMu: 0, actualMu: 0, deltaPct: 0, text: '', shortText: '' };
    if (!isFinite(a) || a <= 0) return out;
    out.ok = true;
    out.actualMu = a / 666.67;
    out.text = out.actualMu.toFixed(1) + '亩';
    out.shortText = out.text;
    if (!isFinite(d) || d <= 0) return out;
    out.designMu = d / 666.67;
    var delta = out.actualMu - out.designMu;
    out.deltaPct = out.designMu > 0 ? (delta / out.designMu) * 100 : 0;
    /* 0.1 亩以内的差按「显示精度噪声」处理，不当漂移（避免 24.00 对 24.04 误标） */
    out.drift = Math.abs(out.deltaPct) > tol && Math.abs(delta) > 0.1;
    /* text 用于宽格子（实划 + 设计并列）；shortText 用于窄格子 —— 后者只写实划值，
       设计值与偏差由图面表头 / 三级「依据」行承担，避免 42px 窄格里文字顶穿左边界。 */
    if (out.drift) out.text = out.actualMu.toFixed(1) + '亩 设' + out.designMu.toFixed(1);
    return out;
  }

  var api = {
    /* [v889 2026-11-03] 本文件每次改变方向规则时，须同步更新版本号、页面资源串和SW版本；
       用户浏览器弱网/旧标签页拿到旧 tapeAxisOf，方向修复看起来「没生效」。
       现以数字版本号暴露，plot-editor 页面级闸门校验：加载到的版本 < 页面要求
       ⇒ 强制硬刷新一次（sessionStorage 防循环）。往后本文件每改一次，此号与
       index.html 的 ?v= 串、sw.js VERSION 三处同步上抬。 */
    VERSION: 891,
    MAX_AUTO_ZONE_COUNT: MAX_AUTO_ZONE_COUNT,
    manualZoneLayout: manualZoneLayout,
    splitZoneLength: splitZoneLength,
    splitZoneLengthCount: splitZoneLengthCount,
    autoZoneLayout: autoZoneLayout,
    axisFit: axisFit,
    firstZoneSpans: firstZoneSpans,
    tapeAxisOf: tapeAxisOf,
    polyAreaM2: polyAreaM2,
    clipPolyToRect: clipPolyToRect,
    zoneGx: zoneGx,
    zoneGy: zoneGy,
    zoneAreaGroups: zoneAreaGroups,
    zoneAreaDrift: zoneAreaDrift
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.RyZoneGeometry = api;
})(typeof window !== 'undefined' ? window : null);
