/* ===== 路径水头损失测算（2026-09-24 任务⑦，用户需求）=====
 * 用户原话：「总管被主管分段之后，每段要变成可选择的，我想自己手动选择管道之后
 * 形成一个路径，然后测算这个路径的水头损失是多大。」
 *
 * 设计：
 * · 总管分段 = 纯读取视图，不写 tlDiagramData / AE（红线同前）：按每根主管靠总管
 *   端点在总管上的接入位置切成 N+1 段（同排共线多段主管接入点重合 → 一个分段点），
 *   命中线（透明粗线）叠在原 front/main path 之上，只在路径模式下显示。
 * · 用户依次点击总管分段 / 主管段（main-i，分区段）加入路径（再点取消），面板按
 *   选择顺序列出每段：管径 / 长度 / 流量 / 水头损失，并给出合计。
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

  var modeOn = false;
  var pathSegs = [];          /* 有序 pid 数组：'front-0' | 'main-3' */
  var segsCache = null;       /* front 分段缓存 {sig, cuts, Lpx, juncs, fpModel} */
  var panelEl = null;

  function el(id) { return document.getElementById(id); }
  function data() { return window.tlDiagramData; }
  function AE() { return window.RyTlAutoEdits; }

  function polyLenM(pts) {
    var L = 0;
    for (var i = 0; i + 1 < pts.length; i++) L += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    return L;
  }

  /* ---------- 流量模型（口径同 index.html 改径菜单 flowModel）---------- */
  function flowModel() {
    var d = data();
    var fm = d && d.meta && d.meta.flowModel;
    if (fm && fm.zoneFlow > 0) return fm;
    function rd(id, def) { var e = el(id); var v = e ? parseFloat(e.value) : NaN; return isFinite(v) && v > 0 ? v : def; }
    var areaM2 = rd('tl_zoneMu', 30) * (2000 / 3);
    var zoneFlow = areaM2 / rd('tl_tapeSpacing', 1.2) / rd('tl_emitterSpacing', 0.3) * rd('tl_emitterFlow', 2) / 1000;
    var zcEl = el('tl_zoneCount');
    var zcV = zcEl ? parseFloat(zcEl.value) : NaN;
    var zoneCount = isFinite(zcV) && zcV > 0 ? zcV : 2;
    return { zoneFlow: zoneFlow, combinedFlow: zoneFlow * zoneCount, zoneCount: zoneCount };
  }

  /* ---------- 总管分段 ---------- */
  function wsSvg() {
    var ctn = el('tlWsContent');
    return ctn ? ctn.querySelector('svg') : null;
  }
  function frontPathEl() { var s = wsSvg(); return s ? s.querySelector('[data-tlpipe="front"]') : null; }

  /* 每根主管靠总管一端的接入点（模型坐标，口径同渲染层连接段）+ 沿 front 的 px 弧长位置 */
  function computeSegs() {
    var d = data(), A = AE();
    var fpEl = frontPathEl();
    if (!d || !A || !fpEl) return null;
    var fp = A.effPts('front', d);
    if (!fp || fp.length !== 2) return null;               /* 仅支持直线总管（现状几何） */
    var Lpx = fpEl.getTotalLength();
    var Lm = polyLenM(fp);
    if (!(Lpx > 0) || !(Lm > 0)) return null;
    var horiz = Math.abs(fp[0].y - fp[1].y) < 1e-6;        /* 总管水平？ */
    var fxMin = Math.min(fp[0].x, fp[1].x), fxMax = Math.max(fp[0].x, fp[1].x);
    var fyMin = Math.min(fp[0].y, fp[1].y), fyMax = Math.max(fp[0].y, fp[1].y);
    var juncs = [];
    (d.mainPipes || []).forEach(function (line, mi) {
      var epts = A.effPts('main-' + mi, d);
      if (!epts || epts.length < 2) return;
      var pa = epts[0], pb = epts[epts.length - 1];
      var cpt = null;
      if (horiz && Math.abs(pa.y - pb.y) < 1e-6) {          /* 水平主管 → 朝总管一端 (x, frontY) */
        var pt = Math.abs(pa.y - fp[0].y) <= Math.abs(pb.y - fp[0].y) ? pa : pb;
        if (pt.x >= fxMin - 0.5 && pt.x <= fxMax + 0.5) cpt = { x: pt.x, y: fp[0].y };
      } else if (!horiz && Math.abs(pa.y - pb.y) < 1e-6) {  /* 垂直总管 → 接它的是水平主管（同渲染层连接段判定） */
        var pt2 = Math.abs(pa.x - fp[0].x) <= Math.abs(pb.x - fp[0].x) ? pa : pb;
        if (pt2.y >= fyMin - 0.5 && pt2.y <= fyMax + 0.5) cpt = { x: fp[0].x, y: pt2.y };
      }
      if (!cpt) return;
      var s = Math.hypot(cpt.x - fp[0].x, cpt.y - fp[0].y) / Lm * Lpx;   /* 模型弧长 → px 弧长 */
      juncs.push({ mi: mi, s: s });
    });
    juncs.sort(function (a, b) { return a.s - b.s; });
    var cuts = [0];
    juncs.forEach(function (j) {                             /* 同点接入去重（同排共线多段主管） */
      if (j.s - cuts[cuts.length - 1] > 1.5) cuts.push(j.s);
    });
    if (cuts[cuts.length - 1] < Lpx - 1.5) cuts.push(Lpx);
    else cuts[cuts.length - 1] = Lpx;
    var sig = fpEl.getAttribute('d') + '|' + (d.mainPipes || []).length;
    return { cuts: cuts, Lpx: Lpx, Lm: Lm, juncs: juncs, horiz: horiz, fp: fp, sig: sig };
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
    var mm = /^main-(\d+)$/.exec(pid);
    if (mm) return '主管#' + (Number(mm[1]) + 1);
    return pid;
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
    var epts = A.effPts(pid, d);
    return epts ? A.polylineLen(epts) : null;
  }
  /* 段流量（m³/h）：主管=单区流量；总管段=下游轮灌组最大流量和（口径同 pipe-path-loss） */
  function segFlow(pid) {
    var S = segs(), fm = flowModel();
    if (!S || !fm || !(fm.zoneFlow > 0)) return null;
    var m = /^main-(\d+)$/.exec(pid);
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
  /* 段外径：优先图面改径，否则水力计算值（meta.pipes） */
  function segOd(pid) {
    var A = AE(), d = data();
    var od = (A && A.caliberOf) ? A.caliberOf(pid) : null;
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

  /* ---------- 图面覆盖层 ---------- */
  function SVG(tag, attrs) {
    var n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }
  function buildLayer() {
    removeLayer();
    var svg = wsSvg(), S = segs();
    if (!svg || !S) return;
    var g = SVG('g', { id: 'tlPathLayer' });
    var fpEl = frontPathEl();

    /* 总管分段：命中线（透明）+ 分段刻度 */
    for (var i = 0; i + 1 < S.cuts.length; i++) {
      var a = fpEl.getPointAtLength(S.cuts[i]), b = fpEl.getPointAtLength(S.cuts[i + 1]);
      var hit = SVG('path', { d: 'M' + a.x.toFixed(2) + ' ' + a.y.toFixed(2) + ' L' + b.x.toFixed(2) + ' ' + b.y.toFixed(2),
        fill: 'none', stroke: 'rgba(0,0,0,0)', 'stroke-width': '16', 'stroke-linecap': 'butt',
        'data-tlpathseg': frontSegPid(i), 'pointer-events': 'stroke', style: 'cursor:pointer' });
      g.appendChild(hit);
      var mid = fpEl.getPointAtLength((S.cuts[i] + S.cuts[i + 1]) / 2);
      g.appendChild(SVG('circle', { cx: mid.x.toFixed(2), cy: mid.y.toFixed(2), r: '2.6', fill: '#f97316',
        stroke: '#ffffff', 'stroke-width': '1', 'pointer-events': 'none', opacity: '0.9' }));
    }
    /* 主管段：命中线 = 克隆原 path 的 d */
    var d = data();
    (d.mainPipes || []).forEach(function (line, mi) {
      var src = svg.querySelector('[data-tlpipe="main-' + mi + '"]');
      if (!src) return;
      g.appendChild(SVG('path', { d: src.getAttribute('d'), fill: 'none', stroke: 'rgba(0,0,0,0)',
        'stroke-width': '14', 'stroke-linecap': 'butt', 'data-tlpathseg': 'main-' + mi,
        'pointer-events': 'stroke', style: 'cursor:pointer' }));
    });
    /* 高亮层（最上、不吃事件） */
    g.appendChild(SVG('g', { id: 'tlPathHi', 'pointer-events': 'none' }));

    g.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('[data-tlpathseg]') : null;
      if (!t) return;
      e.stopPropagation();
      toggleSeg(t.getAttribute('data-tlpathseg'));
    });
    svg.appendChild(g);
    drawHi();
  }
  function removeLayer() {
    var svg = wsSvg();
    var old = svg ? svg.querySelector('#tlPathLayer') : null;
    if (old && old.parentNode) old.parentNode.removeChild(old);
  }
  function hiLayer() {
    var svg = wsSvg();
    return svg ? svg.querySelector('#tlPathHi') : null;
  }
  function segD(pid) {
    var svg = wsSvg(), S = segs();
    if (!svg || !S) return null;
    var m = /^front-(\d+)$/.exec(pid);
    if (m) {
      var i = Number(m[1]);
      if (i + 1 >= S.cuts.length) return null;
      var fpEl = frontPathEl();
      var a = fpEl.getPointAtLength(S.cuts[i]), b = fpEl.getPointAtLength(S.cuts[i + 1]);
      return 'M' + a.x.toFixed(2) + ' ' + a.y.toFixed(2) + ' L' + b.x.toFixed(2) + ' ' + b.y.toFixed(2);
    }
    var src = svg.querySelector('[data-tlpipe="' + pid + '"]');
    return src ? src.getAttribute('d') : null;
  }
  function drawHi() {
    var hi = hiLayer();
    if (!hi) return;
    while (hi.firstChild) hi.removeChild(hi.firstChild);
    pathSegs.forEach(function (pid, idx) {
      var dd = segD(pid);
      if (!dd) return;
      hi.appendChild(SVG('path', { d: dd, fill: 'none', stroke: '#7c3aed', 'stroke-width': '8',
        'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: '0.85' }));
      /* 序号标注放在段中点（主管取中点，总管取中点） */
      var svg = wsSvg(), S = segs(), cx = null, cy = null;
      var m = /^front-(\d+)$/.exec(pid);
      if (m && S) {
        var fpEl = frontPathEl();
        var p = fpEl.getPointAtLength((S.cuts[Number(m[1])] + S.cuts[Number(m[1]) + 1]) / 2);
        cx = p.x; cy = p.y;
      } else {
        var src = svg.querySelector('[data-tlpipe="' + pid + '"]');
        if (src) {
          var L = src.getTotalLength(), p2 = src.getPointAtLength(L / 2);
          cx = p2.x; cy = p2.y;
        }
      }
      if (cx != null) {
        var tx = SVG('text', { x: (cx + 6).toFixed(1), y: (cy - 6).toFixed(1), 'pointer-events': 'none',
          fill: '#6d28d9', 'font-size': '13', 'font-weight': '700', 'font-family': 'system-ui,sans-serif' });
        tx.textContent = String(idx + 1);
        hi.appendChild(tx);
      }
    });
  }

  /* ---------- 面板 ---------- */
  function fmt(v, n) { return Number(v).toFixed(n == null ? 2 : n); }
  function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  function ensurePanel() {
    if (panelEl && document.body.contains(panelEl)) return panelEl;
    panelEl = document.createElement('div');
    panelEl.id = 'tlPathPanel';
    panelEl.style.cssText = 'position:fixed;z-index:9998;background:#fff;border:1px solid #c4b5fd;border-radius:8px;'
      + 'box-shadow:0 8px 24px rgba(0,0,0,.16);padding:10px 12px;min-width:290px;max-width:360px;'
      + 'font:12px/1.7 system-ui,sans-serif;color:#1f2937;display:none';
    document.body.appendChild(panelEl);
    return panelEl;
  }
  function placePanel() {
    if (!panelEl) return;
    var w = panelEl.offsetWidth || 300;
    panelEl.style.left = Math.max(8, window.innerWidth - w - 16) + 'px';
    panelEl.style.top = '86px';
  }
  function renderPanel() {
    if (!modeOn) return;
    var p = ensurePanel();
    var h = '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">'
      + '<b style="color:#6d28d9;font-size:13px">🧭 路径水头损失测算</b>'
      + '<span style="flex:1"></span>'
      + '<button type="button" data-pathclear style="border:1px solid #cbd5e1;background:#fff;border-radius:4px;padding:1px 8px;cursor:pointer;font:inherit">清空</button>'
      + '<button type="button" data-pathclose style="border:1px solid #cbd5e1;background:#fff;border-radius:4px;padding:1px 8px;cursor:pointer;font:inherit">退出</button>'
      + '</div>';
    if (!pathSegs.length) {
      h += '<div style="color:#94a3b8">依次点击图上<b style="color:#f97316">总管分段</b>（橙色刻度点分段）'
        + '或<b style="color:#185FA5">主管段</b>加入路径；再点已选段取消。建议从水源一端起选。</div>';
    } else {
      h += '<div style="border-top:1px dashed #e2e8f0;margin-top:2px"></div>';
      var sumL = 0, sumHf = 0, rows = 0;
      pathSegs.forEach(function (pid, idx) {
        var L = segLen(pid), Q = segFlow(pid), od = segOd(pid), hfV = segHf(pid);
        var odTxt = od ? 'Ø' + od : '—';
        var lenTxt = (L != null) ? fmt(L, 1) + ' m' : '—';
        var qTxt = (Q != null) ? fmt(Q, 1) : '—';
        var hfTxt = (hfV != null) ? fmt(hfV, 2) + ' m' : '—';
        if (L != null) sumL += L;
        if (hfV != null) sumHf += hfV;
        rows++;
        h += '<div style="display:flex;gap:6px;align-items:baseline;margin:2px 0">'
          + '<b style="flex:none;width:16px;color:#6d28d9">' + (idx + 1) + '</b>'
          + '<span style="flex:1">' + esc(segName(pid)) + ' <span style="color:#64748b">' + odTxt + ' · ' + lenTxt
          + ' · Q ' + qTxt + ' · hf ' + hfTxt + '</span></span>'
          + '<button type="button" data-pathdel="' + esc(pid) + '" title="从路径移除"'
          + ' style="flex:none;border:0;background:none;color:#b91c1c;cursor:pointer;font:inherit">✕</button></div>';
      });
      h += '<div style="border-top:1px dashed #e2e8f0;margin-top:4px;padding-top:4px;font-weight:700">'
        + '路径 ' + rows + ' 段 · 合计 ' + fmt(sumL, 1) + ' m · 水头损失合计 <b style="color:#6d28d9">' + fmt(sumHf, 2) + ' m</b></div>';
      h += '<div style="margin-top:3px;color:#94a3b8;font-size:11px">口径：Hazen-Williams C=150、PE SDR13.6 内径；'
        + '主管=单区流量，总管段=下游轮灌组最大流量和（与水泵扬程校核同口径）；管长=图面有效几何（含改长），管径=图面改径优先。</div>';
    }
    p.innerHTML = h;
    p.style.display = 'block';
    placePanel();
  }
  function hidePanel() {
    if (panelEl) { panelEl.style.display = 'none'; }
  }
  document.addEventListener('click', function (e) {
    if (!panelEl || panelEl.style.display === 'none') return;
    var t = e.target && e.target.closest ? e.target.closest : null;
    if (t && e.target.closest('[data-pathdel]')) {
      var pid = e.target.closest('[data-pathdel]').getAttribute('data-pathdel');
      pathSegs = pathSegs.filter(function (x) { return x !== pid; });
      drawHi(); renderPanel();
      return;
    }
    if (t && e.target.closest('[data-pathclear]')) { pathSegs = []; drawHi(); renderPanel(); return; }
    if (t && e.target.closest('[data-pathclose]')) { setMode(false); return; }
  }, true);

  /* ---------- 模式 ---------- */
  function toggleSeg(pid) {
    var ix = pathSegs.indexOf(pid);
    if (ix >= 0) pathSegs.splice(ix, 1); else pathSegs.push(pid);
    drawHi(); renderPanel();
  }
  function drawBtn() {
    var b = el('tlPathBtn');
    if (b) { b.classList.toggle('active', modeOn); b.setAttribute('aria-pressed', modeOn ? 'true' : 'false'); }
  }
  function setMode(on) {
    modeOn = !!on;
    if (modeOn) {
      buildLayer();
      if (!segs()) { modeOn = false; }
    }
    if (!modeOn) { removeLayer(); pathSegs = []; hidePanel(); }
    drawBtn();
    if (modeOn) renderPanel();
    return modeOn;
  }
  function syncLayer() {
    /* 图面重渲染后 svg 重建 → 层丢失则按需重建；几何变化 → segs() 内按签名自动重切 */
    if (!modeOn) return;
    if (!wsSvg() || !wsSvg().querySelector('#tlPathLayer')) buildLayer();
    else drawHi();
  }

  window.RyTlPathMeasure = {
    toggle: function () { return setMode(!modeOn); },
    mode: function () { return modeOn; },
    clear: function () { pathSegs = []; drawHi(); renderPanel(); },
    segs: function () { return pathSegs.slice(); },
    segInfo: function (pid) {
      return { name: segName(pid), len: segLen(pid), flow: segFlow(pid), od: segOd(pid), hf: segHf(pid) };
    },
    syncLayer: syncLayer,
  };
})();
