/* ============================================================
   runye-hydraulics-core.js — 水力校核 · 计算核心（2026-10-08 v299）
   [v299 用户决策] ① 自研轻量引擎 + epanet-js WASM 对照；② 自动读已布置管网；
                    ③ 全链路校核（总管/主管/支管/滴灌带多孔出流/水泵选型）。

   纯计算、零 DOM：Node 探针 require 加载；浏览器挂 window.RyHydCore
   （须先载 hydraulic-calc/hc-core.js 与 hydraulic-calc/design-core.js ——
   单段水损/流速/内径折算复用 RyHcCore，Christiansen F / 电机功率档复用
   RyDesignCore，保证与 index.html 三级水力计算**同口径**，不另立公式）。

   界面见 runye-hydraulics.html；数据源 localStorage['runye_network_layout']
   （只读！写入方仍是 index.html 管网反投）。

   ── 数据契约（index.html:13013-13041 实测口径）────────────────────────
     { sourcePos:{lat,lng}|null,
       segments:[{id:'front0',name:'front1',dn:<外径mm>,kind:'front'|'main'|'branch',
                  latLng:[[lat,lng],...]}],   <- 无 len/q/v，长度/流量全靠本模块
       dripTapes:[[{lat,lng},...],...], valves:[{lat,lng},...],
       crs:'GCJ-02', ts, plotId, needsReplan? }
     * needsReplan:true 时 segments=[]，调用方须走空态。

   ── 拓扑重建（第一版：平面近似 + 端点聚类 + BFS 建树）────────────────────
     经纬度 -> 等距圆柱局部平面(米)；段端点按 snapTol 聚成节点；
     水源 sourcePos 最近节点为根；BFS 逐段定向。
     两端均已可达的段记为「环」(loops) 并跳过；BFS 结束仍未入树的段记 orphans。
     滴灌带：近端(距 branch 最近端点)为进水端挂到该支管，带损按全长保守计。

   ── 流量递推 ──────────────────────────────────────────────────────────
     滴灌带流量 = 出口数 N = floor(带长/滴头间距) x 滴头单流量 q_drip(L/h)；
     支管 Q = 挂接滴灌带之和 (+ branchTailQ 手动补)；
     主管/总管 Q = 下游子树需求之和（叶向根累加）。

   ── 水力公式（与全站一致，Q: m3/h, L: m, D: 内径 mm, 水头: m）────────────
     Hazen-Williams hf = 1.113e9·L·Q^1.852/(C^1.852·D^4.87)   <- RyHcCore.hazen
     流速 v = 4Q/(3600·π·(D/1000)^2)                           <- RyHcCore.velocity
     内径 = OD·(1−2/SDR)                                        <- RyHcCore.innerDiam
     滴灌带多孔出流：hf_带 = hf(全长, Q带) × F，
     F = 1/2.852 + 1/(2N) + √0.852/(6N^2)                       <- RyDesignCore.christiansen
     局部损失：第一版按沿程比例 localRatio（默认 10%）——弯头/三通随布置差异大，
     精确 K 值表（waterkit 口径 23 项）留后续版本逐项录入。
     需求扬程 TDH = 滴头工作压力 + 高差 + 最不利路径(沿程+局部) + 首部损失；
     轴功率 P = ρgQH/η = 2.725e-3·Q·H/η (kW)；电机档 <- RyDesignCore.motor。

   ── 建议管径（Guyri 口径第一版：逐段，不做全局档位归并）──────────────────
     对每段在 PE 外径系列内选「流速 ≤ vmax 的最小外径」，重算 hf 对比现况。
   ============================================================ */
(function (root, factory) {
  'use strict';
  var hc = null, dc = null;
  if (typeof module !== 'undefined' && module.exports) {
    hc = require('./hydraulic-calc/hc-core.js');       /* Node：相对本文件路径 */
    try { dc = require('./hydraulic-calc/design-core.js'); } catch (e) { dc = null; }
  } else {
    hc = root.RyHcCore || null;
    dc = root.RyDesignCore || null;
  }
  var API = factory(hc, dc);
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.RyHydCore = API;
})(typeof window !== 'undefined' ? window : null, function (hc, dc) {
  'use strict';

  if (!hc) throw new Error('[RyHydCore] 缺少 RyHcCore：请先加载 hydraulic-calc/hc-core.js');

  /* ---------------- 默认参数（可被 opts 覆盖） ---------------- */
  var DEF = {
    snapTol: 3,          /* 端点聚类容差 m */
    tapeSnapTol: 8,      /* 滴灌带端点→支管挂接容差 m */
    C: hc.C_DEFAULT,     /* 150 Hazen-Williams 系数 */
    caliber: 'sdr13.6',  /* PE100 SDR13.6 外径→内径 */
    localRatio: 0.10,    /* 局部损失 = 沿程 x 比例（第一版口径） */
    qDrip: 1.38,         /* 滴头单流量 L/h */
    dripSpacing: 0.3,    /* 滴头间距 m */
    tapeID: 14.2,        /* 滴灌带内径 mm */
    dripHead: 10,        /* 滴头工作压力 m（0.1 MPa） */
    elev: 0,             /* 水源→最不利点高差 m */
    headLoss: 3,         /* 首部（过滤/施肥）损失 m */
    pumpEff: 0.6,        /* 泵组总效率 */
    vmax: hc.ECON_VMAX   /* 2.0 m/s 流速上限 */
  };

  /* ---------------- 几何工具 ---------------- */
  /* 地图回传的管线使用 [lat,lng]，滴灌带使用 {lat,lng}；两种格式必须同等处理。 */
  function latOf(p) { return Array.isArray(p) ? +p[0] : +(p && p.lat); }
  function lngOf(p) { return Array.isArray(p) ? +p[1] : +(p && p.lng); }
  function toPlane(latLng, origin) {
    var m = 6378137 * Math.PI / 180;
    var co = Math.cos(origin.lat * Math.PI / 180);
    return { x: (lngOf(latLng) - origin.lng) * m * co, y: (latOf(latLng) - origin.lat) * m };
  }
  function polylineLen(latLng) {
    var R = 6378137, s = 0;
    for (var i = 1; i < latLng.length; i++) {
      var a = latLng[i - 1], b = latLng[i];
      var dLa = (latOf(b) - latOf(a)) * Math.PI / 180, dLo = (lngOf(b) - lngOf(a)) * Math.PI / 180;
      var h = Math.sin(dLa / 2) * Math.sin(dLa / 2) +
        Math.cos(latOf(a) * Math.PI / 180) * Math.cos(latOf(b) * Math.PI / 180) *
        Math.sin(dLo / 2) * Math.sin(dLo / 2);
      s += 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
    }
    return s;
  }
  function ptSegDist(p, a, b) {
    var vx = b.x - a.x, vy = b.y - a.y, wx = p.x - a.x, wy = p.y - a.y;
    var L2 = vx * vx + vy * vy;
    var t = L2 > 0 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / L2)) : 0;
    var dx = p.x - (a.x + t * vx), dy = p.y - (a.y + t * vy);
    return Math.sqrt(dx * dx + dy * dy);
  }
  function ptPolyDist(p, poly) {
    var d = Infinity;
    for (var i = 1; i < poly.length; i++) d = Math.min(d, ptSegDist(p, poly[i - 1], poly[i]));
    return d;
  }

  /* ---------------- T 形搭接分裂 ----------------
     真实布置里支管起点常落在主管折线**中间**（三通），并非主管端点。
     不处理则端点聚类全部断链、下游流量丢失。此处把「段端点距另一段折线 < tol」
     的位置在垂足处把目标段切成两段（_a/_b 继承 dn/kind），再进入端点聚类。
     每个区间至多一次分裂（判重），分裂基于原始几何统一收集、统一应用。 */
  function splitAtTaps(segsIn, origin, tol) {
    var segs = segsIn.map(function (s) { return Object.assign({}, s); });
    var ev = {};                                       /* segIdx -> [{k, t, ins}]（k=区间右端索引） */
    segs.forEach(function (e, ei) {
      [0, e.latLng.length - 1].forEach(function (endIdx) {
        var p = toPlane(e.latLng[endIdx], origin);
        for (var fi = 0; fi < segs.length; fi++) {
          if (fi === ei) continue;
          var ll = segs[fi].latLng;
          var poly = ll.map(function (q) { return toPlane(q, origin); });
          /* 真 T 形判据：端点距目标段**两端点**都 > tol（否则是点对点接头，聚类即可处理，
             若当 T 形分裂会制造零长度段与假环 —— 2026-10-08 冒烟实测教训） */
          var dA2 = Math.sqrt((p.x - poly[0].x) * (p.x - poly[0].x) + (p.y - poly[0].y) * (p.y - poly[0].y));
          var dB2 = Math.sqrt((p.x - poly[poly.length - 1].x) * (p.x - poly[poly.length - 1].x) +
            (p.y - poly[poly.length - 1].y) * (p.y - poly[poly.length - 1].y));
          if (dA2 <= tol || dB2 <= tol) continue;
          var bi = -1, bt = 0, bd = Infinity;
          for (var k = 1; k < poly.length; k++) {
            var d = ptSegDist(p, poly[k - 1], poly[k]);
            if (d < bd) {                              /* 严格小于：同距取首区间 */
              var vx = poly[k].x - poly[k - 1].x, vy = poly[k].y - poly[k - 1].y;
              var wx = p.x - poly[k - 1].x, wy = p.y - poly[k - 1].y;
              var L2 = vx * vx + vy * vy;
              var t = L2 > 0 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / L2)) : 0;
              bd = d; bi = k; bt = t;
            }
          }
          if (bi > 0 && bd <= tol) {
            var a = ll[bi - 1], b = ll[bi];
            var ins = [a[0] + (b[0] - a[0]) * bt, a[1] + (b[1] - a[1]) * bt];
            (ev[fi] = ev[fi] || []);
            /* 同一条直管可能接入多条支管：不能只按区间 k 去重，否则第二个三通会
               被吞掉并成为孤立段。只合并同一投影点（约 1 mm）即可。 */
            if (!ev[fi].some(function (x) { return x.k === bi && Math.abs(x.t - bt) < 1e-5; })) {
              ev[fi].push({ k: bi, t: bt, ins: ins });
            }
            break;                                     /* 该端点只挂在最近的一段上 */
          }
        }
      });
    });
    var out = [], splitCount = 0;
    segs.forEach(function (s, fi) {
      var es = ev[fi];
      if (!es || !es.length) { out.push(s); return; }
      es.sort(function (x, y) { return x.k === y.k ? x.t - y.t : x.k - y.k; });
      var newLL = [s.latLng[0]], cuts = [];
      for (var k = 1; k < s.latLng.length; k++) {
        /* 一段折线区间内可有多个三通，按投影位置依次插入。 */
        var atK = es.filter(function (x) { return x.k === k; });
        atK.forEach(function (e2) { newLL.push(e2.ins); cuts.push(newLL.length - 1); });
        newLL.push(s.latLng[k]);
      }
      if (!cuts.length) { out.push(s); return; }
      var bounds = [0].concat(cuts, [newLL.length - 1]);
      var parts = [];
      for (var b = 0; b < bounds.length - 1; b++) {
        var seg = newLL.slice(bounds[b], bounds[b + 1] + 1);
        if (seg.length >= 2) parts.push(seg);
      }
      parts.forEach(function (ll, pi) {
        var suf = 'abcdefghijklmnop'[pi] || 'x';
        out.push(Object.assign({}, s, { latLng: ll,
          id: (s.id || 'seg' + fi) + '_' + suf,
          name: (s.name || s.id || 'seg' + (fi + 1)) + '_' + suf,
          sourceId: s.sourceId || s.id || ('seg' + fi) }));
      });
      splitCount++;
    });
    return { segs: out, splitCount: splitCount };
  }

  /* ---------------- 拓扑重建 ---------------- */
  /* 永不抛异常：异常/缺数据走 warnings 返回空树。 */
  function buildTree(net, opts) {
    var o = Object.assign({}, DEF, opts || {});
    var res = { segs: [], nodes: [], edges: [], root: -1, loops: [], orphans: [],
      order: [], parent: {}, warnings: [], origin: null };
    var segs = [];
    (net && net.segments || []).forEach(function (s, i) {
      if (!s || !Array.isArray(s.latLng) || s.latLng.length < 2) {
        res.warnings.push('段 #' + i + ' 缺坐标，已忽略');
        return;
      }
      segs.push(s);
    });
    res.segs = segs;
    if (!segs.length) { res.warnings.push('管网无有效管段'); return res; }

    /* 局部平面原点 = 全部点包围盒中心 */
    var mnLa = 90, mxLa = -90, mnLo = 180, mxLo = -180;
    segs.forEach(function (s) { s.latLng.forEach(function (p) {
      var lat = latOf(p), lng = lngOf(p);
      if (lat < mnLa) mnLa = lat; if (lat > mxLa) mxLa = lat;
      if (lng < mnLo) mnLo = lng; if (lng > mxLo) mxLo = lng;
    }); });
    res.origin = { lat: (mnLa + mxLa) / 2, lng: (mnLo + mxLo) / 2 };

    /* T 形搭接分裂（支管搭在主管折线中间的三通处） */
    var sp = splitAtTaps(segs, res.origin, o.snapTol);
    segs = sp.segs;
    res.segs = segs;
    if (sp.splitCount) res.warnings.push('T 形搭接分裂：' + sp.splitCount + ' 条段在搭接点被切分');

    /* 段端点平面化 */
    var ends = segs.map(function (s) {
      return { a: toPlane(s.latLng[0], res.origin), b: toPlane(s.latLng[s.latLng.length - 1], res.origin) };
    });

    /* O(n^2) 端点聚类（段数几百内即可） */
    var nodes = [];                      /* [{x,y,ids:[endIdx]}] */
    var endNode = [];                    /* endIdx -> nodeIdx */
    for (var i = 0; i < ends.length * 2; i++) endNode.push(-1);
    for (var e = 0; e < ends.length; e++) {
      [ends[e].a, ends[e].b].forEach(function (p, k) {
        var idx = e * 2 + k, hit = -1;
        for (var n = 0; n < nodes.length; n++) {
          var dx = nodes[n].x - p.x, dy = nodes[n].y - p.y;
          if (dx * dx + dy * dy <= o.snapTol * o.snapTol) { hit = n; break; }
        }
        if (hit < 0) { hit = nodes.length; nodes.push({ x: p.x, y: p.y }); }
        endNode[idx] = hit;
      });
    }
    res.nodes = nodes;

    /* 根：水源最近节点 */
    if (net && net.sourcePos) {
      var sp = toPlane([net.sourcePos.lat, net.sourcePos.lng], res.origin);
      var best = -1, bd = Infinity;
      for (var n2 = 0; n2 < nodes.length; n2++) {
        var dx2 = nodes[n2].x - sp.x, dy2 = nodes[n2].y - sp.y, d2 = dx2 * dx2 + dy2 * dy2;
        if (d2 < bd) { bd = d2; best = n2; }
      }
      res.root = best;
      if (bd > 50 * 50) res.warnings.push('水源点距最近管段端点 ' + Math.sqrt(bd).toFixed(1) + ' m，请核对');
    } else {
      res.warnings.push('无水源坐标：以第一条总管段起点为根（仅供参考）');
      res.root = endNode[0];
    }

    /* BFS 建树：邻接表（node -> [{end, segIdx}]） */
    var adj = nodes.map(function () { return []; });
    for (var e2 = 0; e2 < segs.length; e2++) {
      adj[endNode[e2 * 2]].push({ end: e2 * 2, seg: e2 });
      adj[endNode[e2 * 2 + 1]].push({ end: e2 * 2 + 1, seg: e2 });
    }
    var seenSeg = {}, seenNode = {};
    seenNode[res.root] = true;
    var queue = [res.root];
    res.edges = segs.map(function () { return { up: -1, down: -1 }; });
    var order = [];
    while (queue.length) {
      var cur = queue.shift();
      for (var ai = 0; ai < adj[cur].length; ai++) {   /* 上界 = 本节点邻接数（非段总数） */
        var link = adj[cur][ai];
        var sIdx = link.seg;
        if (seenSeg[sIdx]) continue;
        var otherEnd = link.end ^ 1;                   /* 0/1 翻转：另一端 */
        var downNode = endNode[otherEnd];
        if (seenNode[downNode]) {                      /* 两端均可达：环，跳过 */
          res.loops.push({ seg: sIdx, name: segs[sIdx].name || segs[sIdx].id });
          seenSeg[sIdx] = true;                        /* 标记已见，避免重复报环 */
          continue;
        }
        seenSeg[sIdx] = true;
        seenNode[downNode] = true;
        res.edges[sIdx] = { up: cur, down: downNode };
        res.parent[sIdx] = cur;
        order.push(sIdx);
        queue.push(downNode);
      }
    }
    res.order = order;                                 /* 上游→下游 BFS 序：流量递推按逆序 */
    for (var s3 = 0; s3 < segs.length; s3++) {
      if (!seenSeg[s3] && res.edges[s3].up < 0) res.orphans.push(s3);
    }
    if (res.loops.length) res.warnings.push('发现 ' + res.loops.length + ' 条成环管段（树状网不应成环），未计入水损：' +
      res.loops.map(function (l) { return l.name; }).join('、'));
    if (res.orphans.length) res.warnings.push('发现 ' + res.orphans.length + ' 条未连通管段（不接水源）：' +
      res.orphans.map(function (i) { return segs[i].name || segs[i].id; }).join('、'));
    return res;
  }

  /* ---------------- 滴灌带挂接 ---------------- */
  /* 每条带：两端点中距某支管折线最近者 = 进水端；全局取最近的 (tape, branch) 配对 */
  function attachTapes(tree, net, opts) {
    var o = Object.assign({}, DEF, opts || {});
    var out = { tapes: [], unattached: [], warnings: [] };
    var branchIdx = [];
    tree.segs.forEach(function (s, i) { if (s.kind === 'branch') branchIdx.push(i); });
    if (!branchIdx.length) out.warnings.push('管网中无支管段（kind=branch），滴灌带无处挂接');
    (net && net.dripTapes || []).forEach(function (tape, ti) {
      if (!Array.isArray(tape) || tape.length < 2) return;
      var pa = toPlane(tape[0], tree.origin);
      var pb = toPlane(tape[tape.length - 1], tree.origin);
      var best = { d: Infinity, seg: -1, end: 0 };
      branchIdx.forEach(function (si) {
        var ll = tree.segs[si].latLng.map(function (p) { return toPlane(p, tree.origin); });
        var da = ptPolyDist(pa, ll), db = ptPolyDist(pb, ll);
        if (da < best.d) best = { d: da, seg: si, end: 0 };
        if (db < best.d) best = { d: db, seg: si, end: 1 };
      });
      var len = polylineLen(tape);
      var N = Math.max(0, Math.floor(len / o.dripSpacing));
      var q = N * o.qDrip;                             /* L/h */
      var rec = { idx: ti, len: len, N: N, qLh: q, q: q / 1000 /* [v320] L/h→m³/h 应 ÷1000（原 ÷3600 得 L/s，流量低 3.6 倍）*/, seg: -1, end: 0, dist: best.d, attached: false };
      if (best.seg >= 0 && best.d <= o.tapeSnapTol) { rec.seg = best.seg; rec.end = best.end; rec.attached = true; }
      else out.unattached.push(ti);
      out.tapes.push(rec);
    });
    if (out.unattached.length) out.warnings.push(out.unattached.length + ' 条滴灌带距支管超过 ' +
      o.tapeSnapTol + ' m 未挂接（不计流量）');
    return out;
  }

  /* ---------------- 流量递推（BFS 逆序叶→根） ---------------- */
  /* 返回每段 Q（m³/h）与挂接明细 */
  function assignFlows(tree, tapes, opts) {
    var o = Object.assign({}, DEF, opts || {});
    var n = tree.segs.length;
    var Q = new Array(n); for (var i = 0; i < n; i++) Q[i] = 0;
    var tapesBySeg = {};                               /* segIdx -> [tapeRec] */
    tapes.tapes.forEach(function (t) {
      if (t.seg < 0) return;
      (tapesBySeg[t.seg] = tapesBySeg[t.seg] || []).push(t);
    });
    /* 滴灌带流量（L/h）落段；branchTailQ 约定 [{seg, q(L/h)}] 手动补末端需求（只累加一次） */
    var qLh = new Array(n); for (var j = 0; j < n; j++) qLh[j] = 0;
    for (var k = 0; k < n; k++) {
      qLh[k] = (tapesBySeg[k] || []).reduce(function (s, t) { return s + t.qLh; }, 0);
    }
    (o.branchTailQ || []).forEach(function (r) { if (r && r.seg >= 0) qLh[r.seg] += (+r.q || 0); });
    var order = tree.order.slice().reverse();          /* 反转 BFS 序：叶→根（反转序头部=最下游） */
    /* 从叶向根累加：处理某段时其全部子段贡献必须已到位 —— 反转序头→尾遍历。
       （方向写反会让上游段拿到 0 流量，qTotal 归零 —— 2026-10-08 冒烟实测教训） */
    for (var m = 0; m < order.length; m++) {
      var si = order[m];
      var upNode = tree.edges[si].up;
      if (upNode < 0) continue;                        /* 孤立段不入递推 */
      for (var p = 0; p < tree.segs.length; p++) {     /* 累加给父段：down==本段上游节点 的段唯一 */
        if (tree.edges[p].down !== upNode) continue;
        qLh[p] += qLh[si];
        break;                                         /* 树中父段唯一 */
      }
    }
    for (var f = 0; f < n; f++) Q[f] = qLh[f] / 1000; /* [v320] L/h→m³/h ÷1000：hc.hazen(1.113e9)/velocity/泵 2.725e-3/EPANET demand 契约均为 m³/h；原 ÷3600 全链路低 3.6 倍 */
    return { Q: Q, qLh: qLh, tapesBySeg: tapesBySeg, zero: Q.map(function (q, i) { return q <= 0 ? i : -1; }).filter(function (i) { return i >= 0; }) };
  }

  /* ---------------- 逐段水力 + 滴灌带 + 最不利路径 + 水泵（一键全算） ---------------- */
  function compute(net, opts) {
    var o = Object.assign({}, DEF, opts || {});
    var tree = buildTree(net, o);
    var tapes = attachTapes(tree, net, o);
    var flows = assignFlows(tree, tapes, o);
    var warnings = tree.warnings.concat(tapes.warnings);
    var blockers = [];
    if (!tree.order.length) blockers.push('没有从水源连通的有效管网');
    if (!tapes.tapes.length) blockers.push('未读到滴灌带，无法建立灌水需求');
    if (tapes.tapes.length && !tapes.tapes.some(function (t) { return t.attached && t.q > 0; })) {
      blockers.push('滴灌带均未成功挂接到支管，不能以零流量进行校核');
    }
    /* 地图反投会把同一施工线拆成独立显示段，偶有未连通/成环不应把其余已连通
       分区的校核一并封死。它们保留在 warnings；只有系统总流量为零时才阻断。 */

    /* 逐段 */
    var segRows = tree.segs.map(function (s, i) {
      var L = polylineLen(s.latLng);
      var Q = flows.Q[i] || 0;
      var od = +s.dn || 0;
      var idm = hc.innerDiam(od, o.caliber);           /* mm */
      var v = Q > 0 ? hc.velocity(Q, idm) : 0;
      var hf = (Q > 0 && od > 0) ? hc.hazen(L, Q, idm, o.C) : 0;
      var hloc = hf * o.localRatio;
      return { i: i, name: s.name || s.id, kind: s.kind || '?', L: L, Q: Q, od: od, idm: idm,
        v: v, over: v > o.vmax + 1e-9, hf: hf, hloc: hloc, htot: hf + hloc };
    });
    var orphanSet = {}, loopSet = {};
    tree.orphans.forEach(function (i) { orphanSet[i] = true; });
    tree.loops.forEach(function (r) { loopSet[r.seg] = true; });
    segRows.forEach(function (r) {
      var s = tree.segs[r.i] || {};
      r.sourceId = s.sourceId || s.id || r.name;
      r.connected = tree.edges[r.i] && tree.edges[r.i].up >= 0;
      r.status = r.over ? 'over_velocity' : (orphanSet[r.i] ? 'disconnected' :
        (loopSet[r.i] ? 'loop' : (r.Q <= 0 ? 'no_demand' : 'ok')));
    });
    flows.zero.forEach(function (i) { warnings.push('段「' + segRows[i].name + '」流量为 0（无滴灌带挂接）'); });

    /* 滴灌带行 */
    var tapeRows = tapes.tapes.map(function (t) {
      var idt = o.tapeID;
      var hfFull = (t.q > 0 && idt > 0) ? hc.hazen(t.len, t.q, idt, o.C) : 0;
      var F = dc && dc.christiansen ? dc.christiansen(t.N) : christiansenF(t.N);
      var hf = hfFull * F;
      var v = t.q > 0 ? hc.velocity(t.q, idt) : 0;
      return { idx: t.idx, segIdx: t.seg, segName: t.seg >= 0 ? (tree.segs[t.seg].name || tree.segs[t.seg].id) : '—',
        len: t.len, N: t.N, qLh: t.qLh, q: t.q, F: F, hf: hf, v: v, attached: t.seg >= 0 };
    });

    /* 最不利路径：叶→根各路径累计（段损+局部+末端带损+滴头压力） */
    var down = {};                                     /* 段 i 的下游邻接段列表 */
    tree.order.forEach(function (si) {
      var upNode = tree.edges[si].up;
      for (var p = 0; p < tree.segs.length; p++) {
        if (tree.edges[p].down === upNode && p !== si) { (down[p] = down[p] || []).push(si); break; }
      }
    });
    function walk(si, path, acc) {
      var r = segRows[si];
      var acc2 = acc + r.htot;
      var path2 = path.concat([si]);
      var kids = down[si] || [];
      if (!kids.length) {                              /* 叶：加挂接带损（取该段带损最大者）+ 滴头压力 */
        var maxTape = 0;
        tapeRows.forEach(function (t) { if (t.attached && t.segIdx === si && t.hf > maxTape) maxTape = t.hf; });
        return [{ path: path2, loss: acc2 + maxTape + o.dripHead, tapeHf: maxTape }];
      }
      var outs = [];
      kids.forEach(function (k) { outs = outs.concat(walk(k, path2, acc2)); });
      return outs;
    }
    /* 从所有「根侧段」（上游节点=root 或无父段）出发 */
    var starts = [];
    for (var s4 = 0; s4 < tree.segs.length; s4++) {
      if (tree.edges[s4].up < 0) continue;
      var isStart = true;
      for (var p4 = 0; p4 < tree.segs.length; p4++) {
        if (tree.edges[p4].down === tree.edges[s4].up) { isStart = false; break; }
      }
      if (isStart) starts.push(s4);
    }
    var paths = [];
    starts.forEach(function (s5) { paths = paths.concat(walk(s5, [], 0)); });
    var worst = null;
    paths.forEach(function (p) { if (!worst || p.loss > worst.loss) worst = p; });
    if (!worst) warnings.push('未能构建最不利路径（拓扑为空或全部成环/孤立）');

    /* 汇总 + 水泵：总流量 = 根侧段（无父段）流量之和 */
    var qTotal = starts.reduce(function (s, si) { return s + segRows[si].Q; }, 0);
    var pathLoss = worst ? worst.loss - o.dripHead : 0;  /* 纯管路损失 */
    var tdh = worst ? worst.loss + o.elev + o.headLoss : 0;
    var P = qTotal > 0 ? 2.725e-3 * qTotal * tdh / o.pumpEff : 0;   /* kW */
    var motorKw = dc && dc.motor ? dc.motor(P) : 0;

    if (qTotal <= 0 && !blockers.length) blockers.push('系统总流量为零，不能生成水力结果');
    return { valid: !blockers.length, blockers: blockers, opts: o, tree: tree, segRows: segRows, tapeRows: tapeRows, paths: paths,
      worst: worst, pathLoss: pathLoss, tdh: tdh, qTotal: qTotal, power: P,
      motorKw: motorKw, pumpEffUsed: o.pumpEff, warnings: warnings };
  }

  /* ---------------- 建议管径（逐段，Guyri 口径第一版） ---------------- */
  function suggestOD(net, opts) {
    var o = Object.assign({}, DEF, opts || {});
    var full = compute(net, o);
    var series = hc.PE_OD_SERIES || [50, 63, 75, 90, 110, 125, 140, 160, 180, 200, 225, 250, 280, 315, 355, 400, 450, 500];
    var rows = full.segRows.map(function (r) {
      var cand = null;
      for (var i = 0; i < series.length; i++) {       /* 上界 = 系列真实长度 */
        var idm = hc.innerDiam(series[i], o.caliber);
        var v = r.Q > 0 ? hc.velocity(r.Q, idm) : 0;
        if (r.Q <= 0 || v <= o.vmax + 1e-9) { cand = { od: series[i], idm: idm, v: v }; break; }
      }
      if (!cand) cand = { od: series[series.length - 1], idm: hc.innerDiam(series[series.length - 1], o.caliber), v: Infinity };
      var hf = (r.Q > 0) ? hc.hazen(r.L, r.Q, cand.idm, o.C) : 0;
      return { name: r.name, kind: r.kind, Q: r.Q, curOd: r.od, curHf: r.htot,
        sugOd: cand.od, sugIdm: cand.idm, sugV: cand.v, sugHf: hf * (1 + o.localRatio),
        needChange: cand.od !== r.od };
    });
    return { rows: rows, full: full };
  }

  /* ---------------- EPANET .inp 生成（树状网 → inp 文本） ---------------- */
  /* 长度 m / 管径 mm / 流量 LPM（UNITS LPM = SI：水头 m，与本站口径一致）。
     对照设计：不用功率泵，水库 head = 本页算得的 TDH —— EPANET 在「给定水源压力」下
     独立解水损，末端 junction 压力应≈滴头工作压力、head 沿程递减，与本页最不利路径互证。
     需求口径：每条支管段的流量落到其**下游节点** demand（主干流量由 EPANET 沿树自算，
     与本模块递推互为对照）。孤立/成环段不入 inp。 */
  function toInp(full, net, opts) {
    if (!full || !full.valid) return '';
    var o = full.opts || Object.assign({}, DEF, opts || {});
    var demand = {};                                   /* nodeIdx -> 该节点的直接滴灌需求 m³/h */
    full.tapeRows.forEach(function (t) {
      if (!t.attached || t.segIdx < 0) return;
      var e = full.tree.edges[t.segIdx];
      if (e.down >= 0) demand[e.down] = (demand[e.down] || 0) + (t.q || 0);
    });
    var m3hToLpm = function (q) { return Math.round(q * 1000 / 60 * 100) / 100; };
    var L = [];
    L.push('[TITLE]');
    L.push(';; Runye EPANET hydraulic check, auto-generated from runye_network_layout');
    L.push('[OPTIONS]');
    L.push(' UNITS           LPM');               /* 实测 EPANET 2.3.5 只认 UNITS，"FLOW UNITS" 报 200 */
    L.push(' TRIALS         400');                /* 宽收敛：管路水损相对水头极小的网络（滴灌常见，
                                                    压损大头在滴灌带，不在 inp 里）DDA 易不收敛 */
    L.push(' ACCURACY       0.01');
    L.push('[JUNCTIONS]');
    L.push(';ID           Elev    Demand');
    full.tree.nodes.forEach(function (nd, ni) {
      /* 根节点由 Rsrc 水库直接代表；同时生成 Jroot 会造成未连接节点（EPANET 233）。 */
      if (ni === full.tree.root) return;
      var dm = m3hToLpm(demand[ni] || 0);
      L.push(' J' + String(ni).padEnd(11) + ' 0        ' + dm);
    });
    L.push('[RESERVOIRS]');
    L.push(' Rsrc         ' + (Math.round((full.tdh || 0) * 100) / 100));
    L.push('[PIPES]');
    L.push(';ID           Node1          Node2           Length  Diam    Roughness  MinorLoss Status');
    full.tree.segs.forEach(function (s, i) {
      var e = full.tree.edges[i];
      if (e.up < 0) return;
      var idm = hc.innerDiam(+s.dn || 0, o.caliber);   /* mm */
      var from = e.up === full.tree.root ? 'Rsrc' : ('J' + e.up);
      var v = full.segRows[i].v || 0;
      var minor = v > 0 ? (full.segRows[i].hloc || 0) / (v * v / (2 * 9.80665)) : 0;
      L.push(' P' + String(i).padEnd(11) +
        from.padEnd(14) + ' ' + ('J' + e.down).padEnd(14) +
        String(Math.round(polylineLen(s.latLng) * 100) / 100).padEnd(7) + ' ' +
        (Math.round(idm * 1000) / 1000).toFixed(3).padEnd(7) + ' ' +
        String(o.C).padEnd(10) + ' ' + minor.toFixed(5).padEnd(9) + ' Open');
    });
    L.push('[COORDINATES]');
    L.push(';Node           X-Coord          Y-Coord');
    full.tree.nodes.forEach(function (nd, ni) {
      if (ni === full.tree.root) return;
      L.push(' J' + String(ni).padEnd(11) + ' ' + nd.x.toFixed(2).padEnd(16) + ' ' + nd.y.toFixed(2));
    });
    var root = full.tree.nodes[full.tree.root] || { x: 0, y: 0 };
    L.push(' Rsrc         ' + root.x.toFixed(2) + '             ' + root.y.toFixed(2));
    L.push('[END]');
    return L.join('\n') + '\n';
  }

  function epanetNodeLabels(full) {
    if (full && full.epanetLabels) return full.epanetLabels.slice();
    if (!full || !full.tree) return [];
    var out = [];
    full.tree.nodes.forEach(function (nd, ni) { if (ni !== full.tree.root) out.push('节点 J' + ni); });
    out.push('供水边界 Rsrc');
    return out;
  }

  /* 三级规划快照以米制平面坐标保存。按端点聚类恢复供水拓扑供 EPANET 求解：
     总管起点为水源，支管远端为直接需水点。滴灌带的带内多孔出流仍由
     Christiansen 校核，但入口流量会作为 EPANET 的节点需求参与管网求解。 */
  function toInpDesign(full) {
    if (!full || !full.valid || full.mode !== 'design') return '';
    var rows = (full.segRows || []).filter(function (r) { return r.points && r.points.length >= 2 && r.L > 0; });
    if (!rows.length) return '';
    var tol = Math.max(0.05, Math.min(1, +(full.opts && full.opts.snapTol) || 0.5));
    var nodes = [], edges = [];
    function nodeFor(p) {
      for (var i = 0; i < nodes.length; i++) {
        var dx = nodes[i].x - p.x, dy = nodes[i].y - p.y;
        if (dx * dx + dy * dy <= tol * tol) return i;
      }
      nodes.push({ x: +p.x, y: +p.y, edges: [] });
      return nodes.length - 1;
    }
    rows.forEach(function (r, i) {
      var a = nodeFor(r.points[0]), b = nodeFor(r.points[r.points.length - 1]);
      if (a === b) return;
      var e = { row: r, idx: i, a: a, b: b };
      edges.push(e); nodes[a].edges.push(e); nodes[b].edges.push(e);
    });
    if (!edges.length) return '';
    var root = edges[0].a;
    for (var f = 0; f < edges.length; f++) if (edges[f].row.kind === 'front') { root = edges[f].a; break; }
    var dist = nodes.map(function () { return Infinity; }), queue = [root]; dist[root] = 0;
    while (queue.length) {
      var u = queue.shift();
      nodes[u].edges.forEach(function (e) {
        var v = e.a === u ? e.b : e.a;
        if (dist[v] !== Infinity) return;
        dist[v] = dist[u] + (e.row.L || 0); queue.push(v);
      });
    }
    var demand = nodes.map(function () { return 0; });
    edges.forEach(function (e) {
      if (e.row.kind !== 'branch' || dist[e.a] === Infinity || dist[e.b] === Infinity) return;
      var end = dist[e.a] > dist[e.b] ? e.a : e.b;
      demand[end] += Math.max(0, +e.row.Q || 0);
    });
    var m3hToLpm = function (q) { return Math.round(q * 1000 / 60 * 100) / 100; };
    var L = ['[TITLE]', ';; Runye EPANET check generated from final three-level irrigation plan',
      '[OPTIONS]', ' UNITS           LPM', ' TRIALS         400', ' ACCURACY       0.01',
      '[JUNCTIONS]', ';ID           Elev    Demand'];
    nodes.forEach(function (n, i) { if (i !== root && dist[i] !== Infinity) L.push(' J' + String(i).padEnd(11) + ' 0        ' + m3hToLpm(demand[i])); });
    L.push('[RESERVOIRS]', ' Rsrc         ' + (Math.round((full.tdh || 0) * 100) / 100));
    L.push('[PIPES]', ';ID           Node1          Node2           Length  Diam    Roughness  MinorLoss Status');
    edges.forEach(function (e, i) {
      if (dist[e.a] === Infinity || dist[e.b] === Infinity) return;
      var r = e.row, d = hc.innerDiam(+r.od || 0, full.opts && full.opts.caliber), v = r.v || 0;
      var minor = v > 0 ? (r.hloc || 0) / (v * v / (2 * 9.80665)) : 0;
      var from = e.a === root ? 'Rsrc' : ('J' + e.a), to = e.b === root ? 'Rsrc' : ('J' + e.b);
      L.push(' P' + String(i).padEnd(11) + from.padEnd(14) + ' ' + to.padEnd(14) + ' ' +
        String(Math.round(r.L * 100) / 100).padEnd(7) + ' ' + (Math.round(d * 1000) / 1000).toFixed(3).padEnd(7) + ' ' +
        String(full.opts.C).padEnd(10) + ' ' + minor.toFixed(5).padEnd(9) + ' Open');
    });
    L.push('[COORDINATES]', ';Node           X-Coord          Y-Coord');
    nodes.forEach(function (n, i) { if (i !== root && dist[i] !== Infinity) L.push(' J' + String(i).padEnd(11) + ' ' + n.x.toFixed(2).padEnd(16) + ' ' + n.y.toFixed(2)); });
    L.push(' Rsrc         ' + nodes[root].x.toFixed(2) + '             ' + nodes[root].y.toFixed(2), '[END]');
    /* EPANET 的 getNodeValues 顺序为 Junctions 后 Reservoirs；显示标签须与之同序。 */
    full.epanetLabels = nodes.map(function (n, i) { return i === root || dist[i] === Infinity ? null : ('节点 J' + i); })
      .filter(Boolean).concat(['供水边界 Rsrc']);
    return L.join('\n') + '\n';
  }

  /* 地图图层只读快照：把分裂后的计算段按原始管段合并，绝不改写设计管网。 */
  function mapOverlay(full, net) {
    if (!full || !full.valid) return null;
    var priority = { ok: 0, no_demand: 1, loop: 2, disconnected: 3, over_velocity: 4 };
    var items = {};
    full.segRows.forEach(function (r) {
      var id = r.sourceId || r.name;
      var old = items[id];
      if (!old || priority[r.status] >= priority[old.status]) {
        items[id] = { status: r.status, name: r.name, kind: r.kind, flow: r.Q, velocity: r.v,
          loss: r.htot, connected: r.connected };
      } else {
        old.flow += r.Q;
        old.loss += r.htot;
        old.velocity = Math.max(old.velocity, r.v);
      }
    });
    return { version: 1, networkTs: net && net.ts || null, calculatedAt: Date.now(),
      vmax: full.opts.vmax, qTotal: full.qTotal, tdh: full.tdh, items: items };
  }

  function meterPolylineLen(points) {
    var total = 0;
    for (var i = 1; points && i < points.length; i++) {
      var a = points[i - 1], b = points[i];
      if (!a || !b || !isFinite(a.x) || !isFinite(a.y) || !isFinite(b.x) || !isFinite(b.y)) continue;
      total += Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2));
    }
    return total;
  }

  /* 三级规划最终数据的专用入口：不从地图/滴灌带几何反推，而是直接使用规划时已算定的
     联合流量、单区流量和滴灌带入口压力，只校核输水管至滴灌带入口。 */
  function computeDesign(design, opts) {
    var o = Object.assign({}, DEF, opts || {});
    var h = design && design.hydraulics, g = design && design.geometry;
    if (!h || !g) return { valid: false, blockers: ['未找到三级管路规划最终数据'], warnings: [] };
    var rows = [], sourceSeq = 0;
    function add(role, lines, q, pipe) {
      (lines || []).forEach(function (line, i) {
        var L = meterPolylineLen(line);
        if (!(L > 0) || !(q > 0)) return;
        var od = +(pipe && pipe.od) || 0;
        var idm = hc.innerDiam(od, o.caliber);
        var v = hc.velocity(q, idm);
        var hf = hc.hazen(L, q, idm, o.C);
        var hloc = hf * o.localRatio;
        var prefix = role === 'front' ? 'front' : role;
        rows.push({ i: sourceSeq, sourceId: prefix + (role === 'front' ? '0' : '-' + i),
          name: role === 'front' ? '总管' : (role === 'main' ? '主管' : '支管') + (i + 1), kind: role,
          points: JSON.parse(JSON.stringify(line)), L: L, Q: q, od: od, idm: idm, v: v, over: v > o.vmax + 1e-9,
          hf: hf, hloc: hloc, htot: hf + hloc, connected: true, status: v > o.vmax + 1e-9 ? 'over_velocity' : 'ok' });
        sourceSeq++;
      });
    }
    add('front', g.frontPipe ? [g.frontPipe] : [], +h.combinedFlow || 0, h.frontPipe);
    add('main', g.mainPipes, +h.zoneFlow || 0, h.mainPipe);
    add('branch', g.branchPipes, +h.branchFlow || 0, h.branchPipe);
    if (!rows.length) return { valid: false, blockers: ['三级规划最终数据中没有可校核的管段或流量'], warnings: [] };
    function maxRole(role) {
      var best = null;
      rows.forEach(function (r) { if (r.kind === role && (!best || r.htot > best.htot)) best = r; });
      return best;
    }
    var path = [maxRole('front'), maxRole('main'), maxRole('branch')].filter(Boolean).map(function (r) { return r.i; });
    var worstLoss = path.reduce(function (sum, i) { return sum + rows[i].htot; }, 0);
    var tapeHead = +h.tapePressureM || 0;
    var baseHead = (+h.lift || 0) + (+h.dh || 0) + tapeHead + (+h.filterLoss || 0);
    var tdh = Math.max(baseHead + worstLoss, +h.pumpHead || 0);
    var qTotal = +h.combinedFlow || +h.zoneFlow || 0;
    var pumpEffUsed = +h.efficiency || 0.65;
    var power = qTotal > 0 ? 2.725e-3 * qTotal * tdh / pumpEffUsed : 0;
    /* EPANET 将每根支管远端作为一个需水节点。只有这些节点流量之和与三级联合流量
       一致时，两套结果才可作数值对照；不一致时仍允许导出，但必须醒目提示。 */
    var epanetDemandTotal = rows.filter(function (r) { return r.kind === 'branch'; }).reduce(function (sum, r) { return sum + r.Q; }, 0);
    var warnings = ['数据源：三级管路规划最终结果。仅校核总管、主管、支管至滴灌带入口；不计滴灌带多孔出流损失。'];
    if (qTotal > 0 && epanetDemandTotal > 0 && Math.abs(epanetDemandTotal - qTotal) / qTotal > 0.02) {
      warnings.push('EPANET 末端需水量合计 ' + epanetDemandTotal.toFixed(3) + ' m³/h，与三级联合流量 ' + qTotal.toFixed(3) +
        ' m³/h 不一致；请回三级规划检查分区、轮灌组和支管数量后再将两套结果作数值对照。');
    }
    var tree = { segs: rows.map(function (r) { return { id: r.sourceId, name: r.name, kind: r.kind }; }),
      nodes: [], order: rows.map(function (r) { return r.i; }), loops: [], orphans: [] };
    return { valid: true, mode: 'design', blockers: [], opts: o, tree: tree, segRows: rows, tapeRows: [],
      paths: [{ path: path, loss: worstLoss + tapeHead, tapeHf: 0 }],
      worst: { path: path, loss: worstLoss + tapeHead, tapeHf: 0 }, pathLoss: worstLoss,
      tdh: tdh, qTotal: qTotal, power: power, motorKw: dc && dc.motor ? dc.motor(power) : 0, pumpEffUsed: pumpEffUsed,
      epanetDemandTotal: epanetDemandTotal, warnings: warnings };
  }

  /* 兜底 Christiansen（design-core 缺席时，公式同式） */
  function christiansenF(N) {
    if (N <= 1) return 1;
    return 1 / 2.852 + 1 / (2 * N) + Math.sqrt(0.852) / (6 * N * N);
  }

  /* ============================================================
     逐滴头毛管模拟（Per-emitter lateral simulation）
     ── 输入 ──────────────────────────────────────────────────
       tapeLen    毛管总长 m
       tapeID     滴灌带内径 mm
       spacing    滴头间距 m
       qRef       滴头额定流量 L/h（在 P_ref 下）
       pRef       额定压力 m（默认 10 m = 0.1 MPa）
       xExp       流量指数（紊流非补偿≈0.5，压力补偿≈0.1~0.2）
       pInlet     毛管入口压力 m（支管出口压力）
       C          Hazen-Williams 系数
       slope      毛管坡度（上坡=+m/m，下坡=−m/m；水平=0）
     ── 输出 ──────────────────────────────────────────────────
       emitters: [{dist, pressure, q, pipeQ, v}]  逐滴头
       DU         分配均匀度 = 最低25%平均流量 / 整体平均流量
       qMin/qMax/qAvg  滴头流量极值
       pMin/pMax       压力极值
       warn       超流速/低压等提示
     ── 算法 ────────────────────────────────────────────────────
       迭代3轮：先按均匀流量估压→按实际压力算各滴头流量→
       按新流量重算管内流速与沿程损失→更新压力分布。
     ============================================================ */
  function simulateLateral(opts) {
    var o = Object.assign({
      tapeLen: 80, tapeID: 14.2, spacing: 0.3,
      qRef: 1.38, pRef: 10, xExp: 0.5,
      pInlet: 12, C: 150, slope: 0
    }, opts || {});

    var N = Math.max(2, Math.floor(o.tapeLen / o.spacing));
    var s = o.spacing;
    var idm = o.tapeID;

    /* 每段（相邻两滴头之间）长度 = spacing；最后一段可能不足 */
    var segLen = new Array(N);
    for (var i = 0; i < N; i++) {
      var d0 = i * s, d1 = Math.min((i + 1) * s, o.tapeLen);
      segLen[i] = Math.max(0.1, d1 - d0);
    }

    /* 初始化：所有滴头按额定流量 */
    var q = new Array(N);
    for (var j = 0; j < N; j++) q[j] = o.qRef;

    var emitters = [];
    var DU = 0, qMin = 0, qMax = 0, qAvg = 0, pMin = 0, pMax = 0;
    var warn = [];

    for (var iter = 0; iter < 4; iter++) {
      /* 从末端往入口累加管内流量：pipeQ[i] = 滴头 i 到末端的总流量（m³/h） */
      var pipeQ = new Array(N);
      pipeQ[N - 1] = q[N - 1];
      for (var k = N - 2; k >= 0; k--) pipeQ[k] = pipeQ[k + 1] + q[k];
      /* pipeQ 单位 L/h → m³/h */
      for (var k2 = 0; k2 < N; k2++) pipeQ[k2] = pipeQ[k2] / 1000;

      /* 从入口往末端推压力 */
      var P = o.pInlet;
      emitters = [];
      var maxV = 0;
      for (var m = 0; m < N; m++) {
        var dist = m * s + segLen[m] / 2;
        /* 该滴头处管内流速（m/s） */
        var area = Math.PI * Math.pow(idm / 1000, 2) / 4;
        var v = pipeQ[m] > 0 ? pipeQ[m] / 3600 / area : 0;
        if (v > maxV) maxV = v;

        /* 该滴头压力（当前位置） */
        emitters.push({
          dist: dist, pressure: P, q: q[m],
          pipeQ: pipeQ[m], v: v
        });

        /* 算本段损失，推到下一个滴头 */
        if (m < N - 1) {
          var hf = hc.hazen(segLen[m], pipeQ[m], idm, o.C);
          /* 坡度：上坡压力降低（重力），下坡压力升高 */
          var dh_elev = o.slope * segLen[m];
          P = P - hf - dh_elev;
        }
      }

      /* 按新压力更新滴头流量 q = qRef * (P/PRef)^x */
      for (var n = 0; n < N; n++) {
        var pr = Math.max(0.5, emitters[n].pressure);
        q[n] = o.qRef * Math.pow(pr / o.pRef, o.xExp);
      }
    }

    /* 统计 */
    var flows = emitters.map(function (e) { return e.q; });
    var pressures = emitters.map(function (e) { return e.pressure; });
    qAvg = flows.reduce(function (a, b) { return a + b; }, 0) / N;
    qMin = Math.min.apply(null, flows);
    qMax = Math.max.apply(null, flows);
    pMin = Math.min.apply(null, pressures);
    pMax = Math.max.apply(null, pressures);

    /* DU = 最低25%滴头平均流量 / 整体平均流量 */
    var sorted = flows.slice().sort(function (a, b) { return a - b; });
    var lowCount = Math.max(1, Math.floor(N * 0.25));
    var lowAvg = 0;
    for (var li = 0; li < lowCount; li++) lowAvg += sorted[li];
    lowAvg /= lowCount;
    DU = qAvg > 0 ? (lowAvg / qAvg * 100) : 0;

    /* 报警 */
    if (maxV > 2.0) warn.push('毛管内最大流速 ' + maxV.toFixed(2) + ' m/s，超过 2.0 m/s 上限');
    if (pMin < 5) warn.push('最远端滴头压力仅 ' + pMin.toFixed(1) + ' m，低于 5 m，滴头可能不工作');
    if (DU < 80) warn.push('DU = ' + DU.toFixed(1) + '%，低于 80% 合格线，出水不均匀');

    return {
      N: N, spacing: s, emitters: emitters,
      DU: DU, qMin: qMin, qMax: qMax, qAvg: qAvg,
      pMin: pMin, pMax: pMax, maxV: maxV,
      slope: o.slope, tapeLen: o.tapeLen, tapeID: o.tapeID,
      warn: warn
    };
  }

  return {
    DEF: DEF, polylineLen: polylineLen, ptPolyDist: ptPolyDist,
    christiansenF: christiansenF,
    buildTree: buildTree, attachTapes: attachTapes, assignFlows: assignFlows,
    compute: compute, suggestOD: suggestOD, toInp: toInp, toInpDesign: toInpDesign, epanetNodeLabels: epanetNodeLabels,
    mapOverlay: mapOverlay, computeDesign: computeDesign,
    simulateLateral: simulateLateral
  };
});
