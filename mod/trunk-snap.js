/* 总管绘制捕捉引擎（二期）。
 *
 * 设计口径（改之前先读）：
 *   · **判定在屏幕像素里做，不在经纬度里做**。zoom 16 时 1px ≈ 1.2m，按米算会随纬度漂；
 *     而且 mousemove 每帧都跑，用 map.distance() 逐点算会掉帧。
 *     ⇒ 宿主注入一个 projector(latlng) → {x,y}（online-map 传的是 map.latLngToContainerPoint）。
 *   · **阈值拆两档**：SNAP_PX=10 是"手感"（吸附半径，屏幕像素）；
 *     MERGE_M=0.3 是"几何"（两个拐点是否算同一个点，实地米，三期用）。不要合成一个。
 *   · **优先级是主键，距离是次键**（先按半径筛，再按 prio 排序）。理由不是"哪个更重要"，
 *     而是**确定性**：同一鼠标位置永远得到同一个目标，不会因亚像素抖动在两类目标间来回跳
 *     —— 那种表现是"白圈标记自己在闪"，用户会以为鼠标漂了。
 *   · 本模块**不直接碰 Leaflet**：标记的显示/隐藏由宿主注入 showMarker/hideMarker，
 *     这样纯函数部分能在 Node 里单测，不必起浏览器。
 */
(function (root) {
  'use strict';

  var SNAP_PX = 10;
  var MERGE_M = 0.3;

  /* 数字越小越优先。顺序按任务书 §5.3：地块顶点 > 水源 > 已存干线拐点 > 阀门 > 支管起点 > 分区顶点。
     [v872 补缺口]（用户审核发现）：seg-coupler（段总管驳接点）此前漏注册 ⇒ 落到 99 垫底档；
     v870 起驳接点已进地块内（首末主管 1/4 分位处），与阀门/支管起点共享空间 —— 审核属实：
     不注册则用户想吸驳接点时被 10px 内的阀门抢走。定 4：驳接点是手绘总管的**设计落点**
     （接到这里即贯通），应压过顺路的阀门/支管起点；仍低于地块顶点/水源/干线拐点
     （编辑已有干线时抢点行为不变）。
     [v914] main-coupler（设计页接驳节点，dd.couplerNodes 投影）同档 4：同为手绘总管的
     设计落点——节点在哪，总管就应接到哪（接到即贯通该主管）。 */
  var PRIORITY = {
    'plot-vertex': 1,
    'water-source': 2,
    'trunk-vertex': 3,
    'seg-coupler': 4,
    'main-coupler': 4,
    'valve-node': 5,
    'branch-start': 6,
    'zone-vertex': 7,
    'mainpipe-edge': 8,
    'trunk-edge': 9
  };

  var enabled = true;
  var targets = [];
  var segments = [];
  var projector = null;
  var unprojector = null;
  var markerApi = null;     // {show(hit), hide()}
  var lastHit = null;
  var buildStats = null;

  function prioOf(kind) { return PRIORITY[kind] || 99; }

  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  /* 读一个折点：与 core/trunk-schema.js 同口径（[lat,lng] / [lat,lng,z] / {lat,lng}）。
     这里不引 schema 模块，避免加载顺序耦合 —— 但形状判断必须一致，否则捕捉会把
     {lat,lng} 形状的旧记录漏掉。 */
  function readPoint(q) {
    if (Array.isArray(q)) {
      if (q.length < 2) return null;
      var lat = Number(q[0]), lng = Number(q[1]);
      return isNum(lat) && isNum(lng) ? { lat: lat, lng: lng } : null;
    }
    if (q && typeof q === 'object') {
      var la = Number(q.lat), ln = Number(q.lng);
      return isNum(la) && isNum(ln) ? { lat: la, lng: ln } : null;
    }
    return null;
  }

  /* 由宿主提供原始素材，这里只做"摊平成候选点 + 打标签"。
     返回 [{lat,lng,kind,label}]；宿主不必关心优先级与去重。 */
  function buildTargets(input) {
    input = input || {};
    var out = [];

    function push(lat, lng, kind, label, snapPoint) {
      if (!isNum(lat) || !isNum(lng)) return;
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;
      var sp=readPoint(snapPoint);
      out.push({ lat: lat, lng: lng, snapLat:sp?sp.lat:lat, snapLng:sp?sp.lng:lng, kind: kind, label: label || '' });
    }

    /* 1. 地块顶点（最常用：贴着地块边界起步） */
    var ring = Array.isArray(input.plotRing) ? input.plotRing : [];
    for (var i = 0; i < ring.length; i++) {
      var rp = readPoint(ring[i]);
      if (rp) push(rp.lat, rp.lng, 'plot-vertex', '地块顶点 ' + (i + 1));
    }

    /* 2. 水源节点：优先用显式记录的，没有就退到主干首点（用户通常从水源画起） */
    var ws = readPoint(input.waterSource);
    if (ws) push(ws.lat, ws.lng, 'water-source', '水源');
    else {
      var mainPts = Array.isArray(input.mainTrunkPoints) ? input.mainTrunkPoints : [];
      var first = mainPts.length ? readPoint(mainPts[0]) : null;
      if (first) push(first.lat, first.lng, 'water-source', '水源（主干首点）');
    }

    /* 3. 已保存干线拐点。excludeTrunkId 用于"正在编辑的那条线不吃自己的点"，
          否则拐点永远吸在自己脚下，拖不动。 */
    var trunks = Array.isArray(input.savedTrunks) ? input.savedTrunks : [];
    for (var ti = 0; ti < trunks.length; ti++) {
      var tk = trunks[ti];
      if (!tk) continue;
      if (input.excludeTrunkId != null && String(tk.id) === String(input.excludeTrunkId)) continue;
      var pts = Array.isArray(tk.points) ? tk.points : [];
      for (var pi = 0; pi < pts.length; pi++) {
        var tp = readPoint(pts[pi]);
        if (tp) push(tp.lat, tp.lng, 'trunk-vertex', '干线 ' + tk.id + ' 拐点 ' + (pi + 1));
      }
    }

    /* 4~6. 阀门 / 支管起点 / 分区顶点：这些是"施工图算过才有"的数据，缺就跳过，
           不要让整个采集失败。 */
    (Array.isArray(input.valves) ? input.valves : []).forEach(function (v, vi) {
      var vp = readPoint(v);
      if (vp) push(vp.lat, vp.lng, 'valve-node', '阀门 ' + (vi + 1));
    });
    (Array.isArray(input.branchStarts) ? input.branchStarts : []).forEach(function (b, bi) {
      var bp = readPoint(b);
      if (bp) push(bp.lat, bp.lng, 'branch-start', '支管起点 ' + (bi + 1));
    });
    (Array.isArray(input.zoneVerts) ? input.zoneVerts : []).forEach(function (z, zi) {
      var zp = readPoint(z);
      if (zp) push(zp.lat, zp.lng, 'zone-vertex', '分区顶点 ' + (zi + 1));
    });

    /* 7. [v859] 段总管驳接点：三级规划自动生成的串联干线两端，手绘总管接到这里
          即与地块内水路贯通（经纬度由宿主 geoBridge 从世界米坐标反算）。 */
    (Array.isArray(input.couplers) ? input.couplers : []).forEach(function (c, ci) {
      var cp = readPoint(c);
      if (cp) push(cp.lat, cp.lng, 'seg-coupler', '驳接点 ' + (ci + 1));
    });

    /* 7b. [v914] 设计页接驳节点（发布快照 publishedNodes 投影）。
          宿主已把失配节点（坐标 null，v913 missing）剔除，这里照收；
          label 由宿主带 pipeKey+沿管距离，拾取气泡直接可读。编号按有效项计（跳过不占号）。
          [v1071] 命中坐标回归物理中心线（c.lat/c.lng）：此前按 displayLat（v1059 显示偏移
          副本）命中、返回物理坐标——白色捕捉圈画在物理位、紫色标记画在偏移位，两边错开
          ~1m，用户看到「捕捉不准」。地图统一物理口径后（runye-map-enhance/online-map 同版
          改回物理绘制），命中=白圈=标记=落点四位一体；桩号换算仍走 pid+atM 不受影响。 */
    var mcValid = 0;
    (Array.isArray(input.mainCouplers) ? input.mainCouplers : []).forEach(function (c) {
      var cp = readPoint(c);
      if (!cp) return;
      mcValid++;
      push(cp.lat, cp.lng, 'main-coupler', (c && c.label) ? c.label : ('主管节点 ' + mcValid));
    });

    /* 8~9. 垂足兜底：主管和已存手绘总管的线段只在没有更高优先级点命中时胜出。 */
    function addEdges(lines, kind, labelOf) {
      (Array.isArray(lines) ? lines : []).forEach(function (line, li) {
        if (!Array.isArray(line) || line.length < 2) return;
        for (var ei = 0; ei + 1 < line.length; ei++) {
          var a = readPoint(line[ei]), b = readPoint(line[ei + 1]);
          if (!a || !b || (a.lat === b.lat && a.lng === b.lng)) continue;
          out.push({ kind: kind, label: labelOf(li, ei), a: a, b: b });
        }
      });
    }
    addEdges(input.mainPipeLines, 'mainpipe-edge', function (li, ei) {
      return '主管 ' + (li + 1) + ' · 段 ' + (ei + 1);
    });
    /* [v914] trunk-edge 补 excludeTrunkId 过滤（v911 审核记过#2 收口）：编辑已有总管时，
       该线的 trunk-edge 线段与自身拐点（上方已滤）同死——否则线段垂足永远吸在自己脚下，
       拖不动/画不出偏离。label 编号与 v911 保持逐字节一致。 */
    (Array.isArray(trunks) ? trunks : []).forEach(function (tk, li) {
      if (!tk) return;
      if (input.excludeTrunkId != null && String(tk.id) === String(input.excludeTrunkId)) return;
      addEdges([tk.points], 'trunk-edge', function (_li, ei) {
        return '总管 ' + (li + 1) + ' · 段 ' + (ei + 1);
      });
    });

    return out;
  }

  function setTargets(list, meta) {
    targets = [];
    segments = [];
    if (Array.isArray(list)) {
      for (var i = 0; i < list.length; i++) {
        var t = list[i];
        if (t && (t.kind === 'mainpipe-edge' || t.kind === 'trunk-edge')) {
          var a = readPoint(t.a), b = readPoint(t.b);
          if (a && b) segments.push({ a: a, b: b, kind: t.kind, label: t.label || '', prio: prioOf(t.kind) });
          continue;
        }
        if (!t || !isNum(t.lat) || !isNum(t.lng)) continue;
        var kind = t.kind || 'plot-vertex';
        targets.push({ lat: t.lat, lng: t.lng, snapLat:isNum(Number(t.snapLat))?Number(t.snapLat):t.lat,
          snapLng:isNum(Number(t.snapLng))?Number(t.snapLng):t.lng, kind: kind, label: t.label || '', prio: prioOf(kind) });
      }
    }
    buildStats = meta || null;
    lastHit = null;
    return targets.length;
  }

  function setProjector(fn) { projector = typeof fn === 'function' ? fn : null; }
  function setUnprojector(fn) { unprojector = typeof fn === 'function' ? fn : null; }
  function setMarkerApi(api) { markerApi = api || null; }

  function setEnabled(on) {
    enabled = on !== false;
    if (!enabled) clearMarker();
    return enabled;
  }
  function isEnabled() { return enabled; }

  function clearMarker() {
    lastHit = null;
    if (markerApi && typeof markerApi.hide === 'function') markerApi.hide();
  }

  /* 核心判定。点目标优先；无点命中时，对线段做屏幕像素正交投影并反算落点。 */
  function nearest(latlng, pxTol) {
    if (!enabled || !projector || (!targets.length && !segments.length) || !latlng) return null;
    var tol = typeof pxTol === 'number' ? pxTol : SNAP_PX;
    var p = projector(latlng);
    if (!p) return null;
    var best = null;
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      var q = projector({lat:t.snapLat,lng:t.snapLng});
      if (!q) continue;
      var dx = q.x - p.x, dy = q.y - p.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d > tol) continue;
      var score = t.prio * 1e6 + d;
      if (!best || score < best.score) best = { target: t, dist: d, score: score };
    }
    if (!best) {
      for (var si = 0; si < segments.length; si++) {
        var s = segments[si], qa = projector(s.a), qb = projector(s.b);
        if (!qa || !qb) continue;
        var vx = qb.x - qa.x, vy = qb.y - qa.y, denom = vx * vx + vy * vy;
        if (!denom) continue;
        var rawT = ((p.x - qa.x) * vx + (p.y - qa.y) * vy) / denom;
        var t = Math.max(0, Math.min(1, rawT));
        var fx = qa.x + t * vx, fy = qa.y + t * vy;
        var sd = Math.sqrt((p.x - fx) * (p.x - fx) + (p.y - fy) * (p.y - fy));
        if (sd > tol) continue;
        var segmentScore = s.prio * 1e6 + sd;
        if (!best || segmentScore < best.score) best = { target: s, dist: sd, score: segmentScore, screen: { x: fx, y: fy } };
      }
    }
    if (!best) { clearMarker(); return null; }
    /* [v1073] 点目标返回**命中位**（snapLat/snapLng，与屏幕上标记/线体同一坐标世界），
       线段垂足返回反算落点——白圈、落点、所见三者自此恒重合。v1071 曾把点命中改成
       返回物理中心线坐标，结果白圈/落点与可见标记错开（旧世界两套口径的残留病灶）；
       v1073 起发布快照整体是「设计页同款显示世界」，命中位即唯一口径。 */
    var hitPoint = best.screen && unprojector ? unprojector(best.screen)
      : (best.target && isNum(Number(best.target.snapLat)) && isNum(Number(best.target.snapLng))
        ? { lat: Number(best.target.snapLat), lng: Number(best.target.snapLng) }
        : best.target);
    if (!hitPoint || !isNum(hitPoint.lat) || !isNum(hitPoint.lng)) { clearMarker(); return null; }
    lastHit = {
      lat: hitPoint.lat,
      lng: hitPoint.lng,
      kind: best.target.kind,
      label: best.target.label,
      dist: Math.round(best.dist * 100) / 100
    };
    if (markerApi && typeof markerApi.show === 'function') markerApi.show(lastHit);
    return lastHit;
  }

  function stats() {
    var byKind = {};
    for (var i = 0; i < targets.length; i++) byKind[targets[i].kind] = (byKind[targets[i].kind] || 0) + 1;
    for (var si = 0; si < segments.length; si++) byKind[segments[si].kind] = (byKind[segments[si].kind] || 0) + 1;
    return {
      enabled: enabled,
      total: targets.length + segments.length,
      byKind: byKind,
      lastHit: lastHit,
      snapPx: SNAP_PX,
      mergeM: MERGE_M,
      build: buildStats
    };
  }

  root.RyTrunkSnap = {
    SNAP_PX: SNAP_PX,
    MERGE_M: MERGE_M,
    PRIORITY: PRIORITY,
    readPoint: readPoint,
    prioOf: prioOf,
    buildTargets: buildTargets,
    setTargets: setTargets,
    setProjector: setProjector,
    setUnprojector: setUnprojector,
    setMarkerApi: setMarkerApi,
    setEnabled: setEnabled,
    isEnabled: isEnabled,
    nearest: nearest,
    clearMarker: clearMarker,
    stats: stats
  };
})(typeof window !== 'undefined' ? window : this);
