/* ===== 管段分段与几何计算支持（原路径水头损失测算内核）=====
 * 手工选择路径和独立测算面板已移除。保留本模块的纯计算接口，因为工作区的
 * 管段选择/长度/损失展示及三级简图分段仍调用这些接口；此处不启动任何测量交互。
 * · 总管分段 = 纯读取视图：按每根主管靠总管一端的接入位置切成 N+1 段。
 * · 主管分段（2026-09-24 用户要求「主管被三通分成几段，这些段应可以分段选择」）：
 *   主管按管上三通/阀门切成若干段 —— 图面配件按 atM 定位；自动阀门按 45° 接点 (ax,ay)
 *   投影到主管有效几何上定位；贴端点 / 相邻过近（<1m）的切点不生效。段 pid 'main-i-j'；
 *   无分段点的主管保持整管可选（main-i，旧行为）。命中线按有效几何 + 底图坐标映射
 *   （tlPlanView，与 renderPipeBaseSVG 同式 T(p)=(p+OX)*s）重画 —— 改长过的主管分段也正确。
 *   段流量与整管同口径（单区流量 zoneFlow）；管径沿用整管图面改径 caliberOf('main-i')。
 * · 流量口径与水泵扬程校核（hydraulic-calc/pipe-path-loss.js）一致：
 *   - 主管段 = 单区流量 zoneFlow（每根主管经阀门一次过一区流量）；
 *   - 总管段 = 该段下游接入主管中，单个轮灌组（floor(分区号/联合区数)）的最大
 *     流量和——水源段即 combinedFlow，末端之后的尾段流量为 0（水已分完）。
 *   - 损失 Hazen-Williams：C=150、PE SDR13.6 内径 di=od·(1-2/13.6)，与
 *     computeThreeLevel / tlPipeCardInfo 同式同系数。
 * · 管径：优先图面改径 AE.caliberOf（main-i），否则水力计算值 meta.pipes。
 * · 几何：长度取有效几何（含改长/平移，AE.effPts）；总管分段长按 path 元素
 *   getTotalLength 弧长比例换算，完全复用图面坐标，不引入第二套几何。
 */
(function () {
  'use strict';

  var segsCache = null;       /* front 分段缓存 {sig, cuts, Lpx, juncs, fpModel} */

  function el(id) { return document.getElementById(id); }
  function data() { return window.tlDiagramData; }
  function AE() { return window.RyTlAutoEdits; }

  function polyLenM(pts) {
    var L = 0;
    for (var i = 0; i + 1 < pts.length; i++) L += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    return L;
  }
  /* 点到「直线段」最近投影：a→b 为总管；返回投影点 {x,y}、参数 t∈[0,1]、垂直距离 dist */
  function pointToSeg(p, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
    if (!isFinite(len2) || len2 <= 0) { var d0 = Math.hypot(p.x - a.x, p.y - a.y); return { x: a.x, y: a.y, t: 0, dist: d0 }; }
    var t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    var cx = a.x + t * dx, cy = a.y + t * dy;
    return { x: cx, y: cy, t: t, dist: Math.hypot(p.x - cx, p.y - cy) };
  }
  /* 主管端点距总管直线 ≤ 此值（米）视为接入：含渲染层把总管外移量（max(15, b.w*0.04)，大图可达 ~48m） */
  var FRONT_JUNC_TOL = 60;

  /* ---------- 主管分段（2026-09-24 用户要求：主管被三通分成几段后，每段可分段选择）---------- */
  var VALVE_SNAP_TOL = 2.5;   /* 阀门 45° 接点距主管 ≤2.5m 视为接在该主管上 */
  var CUT_MIN_SEG = 1.0;      /* 最小分段长度（米）：贴端点 / 相邻过近的切点不生效 */

  /* 沿折线取弧长 [a,b]（米）的子折线：端点线性插值；无有效子段返回 null */
  function slicePoly(pts, a, b) {
    if (!pts || pts.length < 2 || !isFinite(a) || !isFinite(b) || !(b - a > 1e-9)) return null;
    var out = [], total = 0;
    for (var i = 0; i + 1 < pts.length && total < b; i++) {
      var ax = pts[i].x, ay = pts[i].y, bx = pts[i + 1].x, by = pts[i + 1].y;
      var seg = Math.hypot(bx - ax, by - ay);
      if (total + seg <= a) { total += seg; continue; }            /* 整段在 a 之前 */
      var t0 = Math.max(0, seg > 0 ? (a - total) / seg : 0);
      var t1 = Math.min(1, seg > 0 ? (b - total) / seg : 1);
      if (!out.length) out.push({ x: ax + (bx - ax) * t0, y: ay + (by - ay) * t0 });
      if (t1 >= 1) out.push({ x: bx, y: by });
      else out.push({ x: ax + (bx - ax) * t1, y: ay + (by - ay) * t1 });
      total += seg;
      if (t1 < 1) break;                                           /* b 落在本段内，已取完 */
    }
    return out.length >= 2 ? out : null;
  }
  /* 单根主管的分段点：图面配件（三通/阀门 atM）+ 自动阀门 45° 接点在管上的投影位置；
   * 升序去重、贴端点剔除。返回 {epts, Lm, cuts[]}；无有效几何返回 null */
  function mainCuts(mi, d, A) {
    var pid = 'main-' + mi;
    var epts = A.effPts(pid, d);
    if (!epts || epts.length < 2) return null;
    var Lm = polyLenM(epts);
    var cuts = [];
    if (Lm > CUT_MIN_SEG * 2) {
      var raw = [];
      (A.fitsList() || []).forEach(function (f) {
        if (f.pid !== pid || !isFinite(f.atM)) return;
        if (f.kind !== 'tee' && f.kind !== 'valve') return;       /* 弯头挂端头，不产生分段 */
        raw.push(Math.max(0, Math.min(f.atM, Lm)));
      });
      (d.valves || []).forEach(function (v) {
        if (!v || !isFinite(v.ax) || !isFinite(v.ay)) return;
        var loc = A.locate(pid, d, { x: v.ax, y: v.ay });
        if (loc && loc.dist <= VALVE_SNAP_TOL) raw.push(Math.max(0, Math.min(loc.along, Lm)));
      });
      raw.sort(function (x, y) { return x - y; });
      raw.forEach(function (atM) {
        if (atM < CUT_MIN_SEG || atM > Lm - CUT_MIN_SEG) return;                /* 贴端点不切 */
        if (cuts.length && atM - cuts[cuts.length - 1] < CUT_MIN_SEG) return;   /* 重合/过近切点去重 */
        cuts.push(atM);
      });
    }
    return { epts: epts, Lm: Lm, cuts: cuts };
  }

  /* ---------- 流量模型（口径同 index.html 改径菜单 flowModel）---------- */
  function flowModel() {
    var d = data();
    var fm = d && d.meta && d.meta.flowModel;
    if (fm && fm.zoneFlow > 0) return fm;
    function rd(id, def) { var e = el(id); var v = e ? parseFloat(e.value) : NaN; return isFinite(v) && v > 0 ? v : def; }
    var areas=d&&Array.isArray(d.zoneAreasM2)?d.zoneAreasM2:null;
    if(!Array.isArray(areas)||!areas.length||areas.some(function(a){return !isFinite(Number(a))||Number(a)<=0;}))return null;
    var areaM2=Math.max.apply(null,areas.map(Number));
    var zoneFlow = areaM2 / rd('tl_tapeSpacing', 1.2) / rd('tl_emitterSpacing', 0.3) * rd('tl_emitterFlow', 2) / 1000;
    var zcEl = el('tl_zoneCount');
    var zcV = zcEl ? parseFloat(zcEl.value) : NaN;
    var zoneCount = isFinite(zcV) && zcV > 0 ? zcV : 2;
    return { zoneFlow: zoneFlow, combinedFlow: zoneFlow * zoneCount, zoneCount: zoneCount };
  }

  /* ---------- 总管分段比例（v165：数据驱动，不依赖 DOM）----------
   * 用户要求（2026-09-30）：「这个遮蔽功能遇到总管，不能分段遮蔽，要改一下，可以分段遮蔽。」
   * 分段 = 按「每根主管靠总管一端的接入点」把总管切成 N+1 段。本函数只认数据
   * （tlDiagramData + AE 设计几何），不看 SVG ⇒ 三级简图 / 三级工作区使用同一套分段，
   * 段号绝不会两处错位（v165 之前只有工作区 DOM 那一路能算，简图无从知道段边界）。
   * 返回 { juncs:[{mi,t}], cuts:[0,...,1], Lm }；总管非直线 / 数据缺失 → null。
   * cuts = 归一化位置（0..1，沿总管起点→终点）；同点接入（< FRONT_CUT_MIN_M 米）合并为一段。
   * dIn（可选）：数据对象。★ 三级简图渲染发生在 window.tlDiagramData 赋值**之前**
   *   （简图先拼 parts、末尾才落快照），那时无参调用会读到上一幅图的旧几何 ⇒ 必须能显式传入。
   * 几何取「设计几何」(pipePts) 而非有效几何：简图用设计几何、工作区可用有效几何，
   *   若各按自己那套算 t，改长后两边段边界就会错位；统一用设计几何 ⇒ 只有比例缩放，段号一致。 */
  var FRONT_CUT_MIN_M = 1.0;
  function ratioCuts(dIn) {
    var d = dIn || data(), A = AE();
    if (!d || !A) return null;
    var PTS = (typeof A.pipePts === 'function') ? A.pipePts : A.effPts;
    var fp = PTS('front', d);
    if (!fp || fp.length !== 2) return null;                /* 仅支持直线总管（现状几何） */
    var a = fp[0], b = fp[1];
    var Lm = Math.hypot(b.x - a.x, b.y - a.y);
    if (!(Lm > 0)) return null;
    var juncs = [];
    (d.mainPipes || []).forEach(function (line, mi) {
      var epts = PTS('main-' + mi, d);
      if (!epts || epts.length < 2) return;
      var pa = epts[0], pb = epts[epts.length - 1];
      var na = pointToSeg(pa, a, b), nb = pointToSeg(pb, a, b);
      var near = na.dist <= nb.dist ? na : nb;              /* 离总管更近的那一端 = 接入端 */
      if (near.dist > FRONT_JUNC_TOL) return;               /* 该主管不接总管（跳过） */
      if (near.t < -0.002 || near.t > 1.002) return;        /* 投影越出总管端点，非真实接入 */
      juncs.push({ mi: mi, t: near.t });
    });
    juncs.sort(function (x, y) { return x.t - y.t; });
    var minGap = FRONT_CUT_MIN_M / Lm;
    var cuts = [0];
    juncs.forEach(function (j) {
      var t = Math.max(0, Math.min(1, j.t));
      if (t <= cuts[cuts.length - 1] + minGap) return;      /* 同点/过近接入 → 合并（同排共线多段主管） */
      cuts.push(t);
    });
    if (cuts[cuts.length - 1] < 1 - minGap) cuts.push(1);
    else cuts[cuts.length - 1] = 1;
    if (cuts.length < 2) cuts = [0, 1];
    return { juncs: juncs, cuts: cuts, Lm: Lm };
  }

  /* ---------- 总管分段 ---------- */
  function wsSvg() {
    var ctn = el('tlWsContent');
    return ctn ? ctn.querySelector('svg') : null;
  }
  function frontPathEl() { var s = wsSvg(); return s ? s.querySelector('[data-tlpipe="front"]') : null; }

  /* 总管分段（px 弧长口径，供工作区定位/选中）：分段比例一律取自 ratioCuts()（唯一来源），
     再按本图 path 的 px 弧长换算 ⇒「简图显示的分段」与「工作区点选的分段」逐段一致。 */
  function computeSegs() {
    var d = data(), A = AE();
    var fpEl = frontPathEl();
    if (!d || !A || !fpEl) return null;
    var fp = A.effPts('front', d);
    if (!fp || fp.length !== 2) return null;               /* 仅支持直线总管（现状几何） */
    var Lpx = fpEl.getTotalLength();
    var Lm = polyLenM(fp);
    if (!(Lpx > 0) || !(Lm > 0)) return null;
    var RC = ratioCuts();
    if (!RC) return null;
    var cuts = RC.cuts.map(function (r) { return r * Lpx; });
    var juncs = RC.juncs.map(function (j) { return { mi: j.mi, s: j.t * Lpx, t: j.t }; });
    var horiz = Math.abs(fp[0].y - fp[1].y) < 1e-6;        /* 总管水平？仅用于签名/调试 */
    /* 主管分段：按管上三通/阀门切分（mainCuts），随缓存一起签名失效 */
    var mains = [];
    (d.mainPipes || []).forEach(function (line, mi) { mains.push(mainCuts(mi, d, A)); });
    /* v165：签名加入 Lpx/Lm/分段比例 —— 改长/平移会改有效几何，必须让缓存失效。
       （旧签名只取底图 path 的 d，而底图 path 是设计几何、改长后一字不变 ⇒ 缓存会一直吃旧分段。） */
    var sig = Lpx.toFixed(2) + '|' + Lm.toFixed(3) + '|' + RC.cuts.map(function (r) { return r.toFixed(5); }).join(',')
      + '|' + mains.map(function (M) {
        return M ? (M.Lm.toFixed(2) + ':' + M.cuts.map(function (c) { return c.toFixed(2); }).join(',')) : '-';
      }).join(';');
    return { cuts: cuts, Lpx: Lpx, Lm: Lm, juncs: juncs, horiz: horiz, fp: fp, mains: mains, sig: sig, ratios: RC.cuts.slice() };
  }

  function segs() {
    var fresh = computeSegs();
    if (!fresh) return null;
    if (!segsCache || segsCache.sig !== fresh.sig) segsCache = fresh;
    return segsCache;
  }

  function frontSegPid(i) { return 'front-' + i; }

  /* ---------- 段属性 ---------- */
  function segName(pid) {
    var m = /^front-(\d+)$/.exec(pid);
    if (m) return '总管' + (Number(m[1]) + 1) + '段';
    var mSeg = /^main-(\d+)-(\d+)$/.exec(pid);
    if (mSeg) return '主管#' + (Number(mSeg[1]) + 1) + '·段' + (Number(mSeg[2]) + 1);
    var mm = /^main-(\d+)$/.exec(pid);
    if (mm) return '主管#' + (Number(mm[1]) + 1);
    return pid;
  }
  /* 主管段边界：段 pid 'main-i-j' → 该主管 {epts, Lm, bounds}（无分段/无几何返回 null） */
  function mainSegBounds(pid) {
    var ms = /^main-(\d+)-(\d+)$/.exec(pid);
    if (!ms) return null;
    var S = segs();
    var M = (S && S.mains) ? S.mains[Number(ms[1])] : null;
    if (!M || !M.cuts.length) return null;
    var k = Number(ms[2]);
    var bounds = [0].concat(M.cuts, [M.Lm]);
    if (k + 1 >= bounds.length) return null;
    return { mi: Number(ms[1]), M: M, a: bounds[k], b: bounds[k + 1], k: k };
  }
  /* 段长度（米，有效几何） */
  function segLen(pid) {
    var d = data(), A = AE(), S = segs();
    if (!d || !A) return null;
    var m = /^front-(\d+)$/.exec(pid);
    if (m && S) {
      var i = Number(m[1]);
      if (i < 0 || i + 1 >= S.cuts.length) return null;
      return (S.cuts[i + 1] - S.cuts[i]) / S.Lpx * S.Lm;
    }
    var ms = mainSegBounds(pid);
    if (ms) return ms.b - ms.a;                            /* 切点即有效几何弧长 → 段长 = 边界差 */
    var epts = A.effPts(pid, d);
    return epts ? A.polylineLen(epts) : null;
  }
  /* 段流量（m³/h）：主管（整管/分段同口径）=单区流量；总管段=下游轮灌组最大流量和（口径同 pipe-path-loss） */
  function segFlow(pid) {
    var S = segs(), fm = flowModel();
    if (!S || !fm || !(fm.zoneFlow > 0)) return null;
    var m = /^main-(\d+)(?:-(\d+))?$/.exec(pid);
    if (m) return fm.zoneFlow;
    var mm = /^front-(\d+)$/.exec(pid);
    if (!mm) return null;
    var i = Number(mm[1]);
    if (i + 1 >= S.cuts.length) return null;
    var cutEnd = S.cuts[i + 1];
    var zc = (fm.zoneCount && fm.zoneCount > 0) ? fm.zoneCount : 2;
    var byGroup = {};
    S.juncs.forEach(function (j) {
      if (j.s < cutEnd - 0.5) return;                        /* 接入点在本段之内/上游 → 不由本段承载 */
      var g = Math.floor(j.mi / zc);
      byGroup[g] = (byGroup[g] || 0) + fm.zoneFlow;
    });
    var best = 0;
    Object.keys(byGroup).forEach(function (g) { if (byGroup[g] > best) best = byGroup[g]; });
    return best;
  }
  /* 段外径：优先图面改径（主管段沿用整管 main-i 的改径），否则水力计算值（meta.pipes） */
  function segOd(pid) {
    var A = AE(), d = data();
    var mBase = /^(main-\d+)(?:-\d+)?$/.exec(pid);
    var basePid = mBase ? mBase[1] : pid;
    if (/^front-\d+$/.test(pid)) basePid = 'front';   /* 总管段沿用整管 front 的图面改径 */
    var od = (A && A.caliberOf) ? A.caliberOf(basePid) : null;
    if (od) return od;
    var key = /^front-/.test(pid) ? 'front' : (/^main-/.test(pid) ? 'main' : null);
    if (!key || !d || !d.meta || !d.meta.pipes) return null;
    var mm = String(d.meta.pipes[key] || '').match(/\d+(?:\.\d+)?/);
    return mm ? parseFloat(mm[0]) : null;
  }
  /* Hazen-Williams（同 computeThreeLevel / tlPipeCardInfo：C=150、SDR13.6 内径） */
  function hf(L, Q, od) {
    if (!(L > 0) || !(Q > 0) || !(od > 0)) return 0;
    var di = od * (1 - 2 / 13.6);
    return 1.113e9 * L * Math.pow(Q, 1.852) / (Math.pow(150, 1.852) * Math.pow(di, 4.87));
  }
  function segHf(pid) {
    var L = segLen(pid), Q = segFlow(pid), od = segOd(pid);
    if (L == null || Q == null || od == null) return null;
    return hf(L, Q, od);
  }
  /* 段计算值外径（不受图面改径影响，= meta.pipes 对应键；front-N → front，main-i-j → main） */
  function segBaseOd(pid) {
    var d = data();
    if (!d || !d.meta || !d.meta.pipes) return null;
    var key = /^front-/.test(pid) ? 'front' : (/^main-/.test(pid) ? 'main' : 'branch');
    var mm = String(d.meta.pipes[key] || '').match(/\d+(?:\.\d+)?/);
    return mm ? parseFloat(mm[0]) : null;
  }
  /* 段水头损失（用计算值外径，便于对比改径前后的 delta） */
  function segBaseHf(pid) {
    var L = segLen(pid), Q = segFlow(pid), od = segBaseOd(pid);
    if (L == null || Q == null || od == null) return null;
    return hf(L, Q, od);
  }

  /* ---------- 保留给图面与损失卡片的纯管段几何辅助 ---------- */
  window.RyTlPathMeasure = {
    segInfo: function (pid) {
      return { name: segName(pid), len: segLen(pid), flow: segFlow(pid), od: segOd(pid), baseOd: segBaseOd(pid), hf: segHf(pid), baseHf: segBaseHf(pid) };
    },
    /* v150（2026-09-28 用户要求「总管被主管打断后应可独立选择」）：普通模式分段选择支撑，
       供 tl-workspace 选中信息/高亮复用。segIndexAt：沿管弧长（米）→ 所在总管段号；
       frontSegPts：段号 → 该段子折线（数据米坐标，改长/平移后仍正确）；segsData：分段缓存快照（诊断用） */
    segIndexAt: function (alongM) {
      var S = segs(); if (!S || !isFinite(alongM) || !(S.Lm > 0) || !(S.Lpx > 0)) return null;
      var sPx = alongM * S.Lpx / S.Lm;
      for (var i = 0; i + 1 < S.cuts.length; i++) {
        if (sPx >= S.cuts[i] - 1e-6 && sPx <= S.cuts[i + 1] + 1e-6) return i;
      }
      return null;
    },
    frontSegPts: function (i) {
      var S = segs(); if (!S || !isFinite(i) || i < 0 || i + 1 >= S.cuts.length) return null;
      var aM = S.cuts[i] / S.Lpx * S.Lm, bM = S.cuts[i + 1] / S.Lpx * S.Lm;
      return slicePoly(S.fp, aM, bM);
    },
    segsData: function () {
      var S = segs(); if (!S) return null;
      return { cuts: S.cuts.slice(), Lpx: S.Lpx, Lm: S.Lm, juncCount: S.juncs.length };
    },
    /* v165（总管分段遮蔽）：总管分段比例（0..1 数组，长度 = 段数 + 1）—— 数据驱动、不依赖 DOM，
       三级简图 / 三级工作区共用同一套段边界。取不到分段（无总管 / 非直线 / 数据未就绪）→ null。
       ★ 为什么需要它：总管在简图里要按段渲染（半遮蔽 = 一段灰虚线、其余实线），而简图渲染
         发生在工作区 svg 之前 —— 不能依赖 frontPathEl()。 */
    frontRatios: function (dIn) { var RC = ratioCuts(dIn); return RC ? RC.cuts.slice() : null },
  };
})();
