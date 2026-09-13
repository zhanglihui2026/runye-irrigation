/* =====================================================================
 * tl-workspace.js — 三级管线设计工作区模块（润野灌溉）
 * ---------------------------------------------------------------------
 * 职责：读取三级平面图最终几何数据（window.tlDiagramData，由 tlAutoGenerate
 *       末尾导出），在「三级制图」视图渲染可缩放/平移的设计底图，
 *       并提供手工插入管线层（主管/支管折线）。
 * 红线：只读不写（与 iso-diagram 同一红线）。手工管线只存本模块自有状态，
 *       不写回 tlDiagramData、不参与水力计算、不写 localStorage；
 *       平面数据对象引用变更（重新生成平面图）→ 手工层自动清空。
 * 交互：滚轮缩放（光标为中心）· 非插入模式拖拽平移 · 双击/按钮适应窗口；
 *       插入模式点击逐点画折线（端点吸附），双击/Enter 结束，Esc 取消/退出。
 * ===================================================================== */
(function (global) {
  'use strict';

  /* ---------- 常量（绘图表达参数，不参与水力计算） ---------- */
  var K = 2.5;            // viewBox 单位/米
  var PAD_M = 6;          // 图形四周留白（米）
  var ZMIN = 0.2, ZMAX = 8;
  var SNAP_PX = 12;       // 端点吸附半径（屏幕像素）
  var CLICK_PX = 5;       // 按下-抬起位移 ≤ 此值才算点击（与拖拽平移区分）
  var COLORS = {
    plotFill: '#f6faf7', plotLine: '#3f7a55',
    zone: '#8fae9b', zoneDash: '5,5',
    zoneFillA: '#e6f2ea', zoneFillB: '#f2f9f4',   /* 分区棋盘底色（2026-09-13 用户要求可见填充） */
    tape: '#67e8f9', branch: '#16a34a', main: '#185FA5', front: '#f97316',
    valve: '#ef4444', source: '#f59e0b',
    manualMain: '#185FA5', manualBranch: '#16a34a',
    draft: '#7c3aed', snap: '#7c3aed',
    label: '#47555e'
  };
  var KIND_LABEL = { main: '主管', branch: '支管' };

  /* ---------- 模块状态 ---------- */
  var manual = [];            // [{id, kind:'main'|'branch', pts:[{x,y}(米)], len}]
  var manualSeq = { main: 0, branch: 0 };
  var lastDataRef = null;
  var mode = null;            // null | 'main' | 'branch' —— 插入模式
  var draft = null;           // {kind, pts:[{x,y}(米)]} —— 进行中的折线
  var view = { z: 1, x: 0, y: 0 };
  var viewState = null;       // {k,ox,oy,w,h,model,snapPts} —— render 记录，供命中测试
  var api = {};               // 导出对象（回调必须挂这里，页面注入才生效）

  /* ---------- 基础几何 ---------- */
  function boundsOf(poly) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    (poly || []).forEach(function (p) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    });
    if (!isFinite(minX)) return null;
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY, w: maxX - minX, h: maxY - minY };
  }
  function polylineLen(pts) {
    var L = 0;
    for (var i = 0; i + 1 < pts.length; i++) L += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    return L;
  }
  function closestOnSeg(p, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y, c = dx * dx + dy * dy;
    if (c === 0) return { x: a.x, y: a.y };
    var t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / c;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    return { x: a.x + dx * t, y: a.y + dy * t };
  }

  /* ---------- 吸附点收集（数据坐标，米）----------
   * 候选 = 总管/主管/支管折线端点 + 阀门圆心 + 水源 + 地块顶点 + 手工管线端点 */
  function collectSnapPts(data) {
    var pts = [];
    function add(p) { if (p && isFinite(p.x) && isFinite(p.y)) pts.push({ x: p.x, y: p.y }); }
    function ends(line) { if (line && line.length >= 2) { add(line[0]); add(line[line.length - 1]); } }
    ends(data.frontPipe);
    (data.mainPipes || []).forEach(ends);
    (data.branchPipes || []).forEach(ends);
    (data.valves || []).forEach(function (v) { add(v); });
    add(data.sourcePos);
    (data.poly || []).forEach(add);
    manual.forEach(function (m) { ends(m.pts); });
    /* 去重（0.05m 内视为同一点） */
    var out = [];
    pts.forEach(function (p) {
      var dup = out.some(function (q) { return Math.hypot(q.x - p.x, q.y - p.y) < 0.05; });
      if (!dup) out.push(p);
    });
    return out;
  }

  /* pickSnap：在 tol（米）内找最近吸附点，命中返回吸附点，否则返回原点 */
  function pickSnap(p, snapPts, tol) {
    var best = null, bd = tol;
    for (var i = 0; i < snapPts.length; i++) {
      var d = Math.hypot(snapPts[i].x - p.x, snapPts[i].y - p.y);
      if (d <= tol && d < bd) { bd = d; best = snapPts[i]; }
    }
    return best || { x: p.x, y: p.y };
  }

  /* ---------- SVG 构建 ---------- */
  function fmt(v) { return Math.round(v * 100) / 100; }
  function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  function renderSVG(data) {
    var poly = data.poly || [];
    var b = boundsOf(poly);
    if (!b) return '<div class="tl-ws-empty">平面数据缺少地块轮廓，请重新「生成管线图」</div>';
    /* 2026-09-13：总管画在地块外沿（min 15m），边界必须把总管/水源一并包进来，
       否则 viewBox 只按地块轮廓算会把它裁在可视范围外（用户反馈“总管显示不出来”） */
    (data.frontPipe || []).forEach(function (p) {
      if (!p || !isFinite(p.x) || !isFinite(p.y)) return;
      if (p.x < b.minX) b.minX = p.x; if (p.x > b.maxX) b.maxX = p.x;
      if (p.y < b.minY) b.minY = p.y; if (p.y > b.maxY) b.maxY = p.y;
    });
    if (data.sourcePos && isFinite(data.sourcePos.x) && isFinite(data.sourcePos.y)) {
      if (data.sourcePos.x < b.minX) b.minX = data.sourcePos.x;
      if (data.sourcePos.x > b.maxX) b.maxX = data.sourcePos.x;
      if (data.sourcePos.y < b.minY) b.minY = data.sourcePos.y;
      if (data.sourcePos.y > b.maxY) b.maxY = data.sourcePos.y;
    }
    b.w = b.maxX - b.minX; b.h = b.maxY - b.minY;
    var ox = -(b.minX - PAD_M), oy = -(b.minY - PAD_M);   // 米 → viewBox 平移
    var W = (b.w + 2 * PAD_M) * K, H = (b.h + 2 * PAD_M) * K;
    function T(p) { return { x: (p.x + ox) * K, y: (p.y + oy) * K }; }
    function pl(pts) {
      var d = '';
      pts.forEach(function (p, i) { var q = T(p); d += (i ? 'L' : 'M') + fmt(q.x) + ' ' + fmt(q.y); });
      return d;
    }
    var s = [];
    s.push('<svg viewBox="0 0 ' + fmt(W) + ' ' + fmt(H) + '" preserveAspectRatio="xMidYMid meet" class="tl-ws-svg" xmlns="http://www.w3.org/2000/svg">');
    /* 1) 地块轮廓 + 分区网格 */
    s.push('<g id="tlWsBase">');
    var polyD = pl(poly) + ' Z';
    s.push('<defs><clipPath id="tlWsPlotClip"><path d="' + polyD + '"/></clipPath></defs>');
    s.push('<path d="' + polyD + '" fill="' + COLORS.plotFill + '"/>');
    var z = data.zones;
    if (z && z.xPos && z.yPos) {
      /* 分区底色：按 xPos/yPos 划分单元格，棋盘两色交替，裁剪到地块轮廓内 */
      var xs = [b.minX], ys = [b.minY];
      (z.xPos || []).forEach(function (x) { if (x > b.minX + 0.5 && x < b.maxX - 0.5) xs.push(x); });
      (z.yPos || []).forEach(function (y) { if (y > b.minY + 0.5 && y < b.maxY - 0.5) ys.push(y); });
      xs.push(b.maxX); ys.push(b.maxY);
      xs.sort(function (a, c) { return a - c; }); ys.sort(function (a, c) { return a - c; });
      var zf = [];
      for (var ri = 0; ri + 1 < ys.length; ri++) {
        for (var ci = 0; ci + 1 < xs.length; ci++) {
          zf.push('<rect x="' + fmt((xs[ci] + ox) * K) + '" y="' + fmt((ys[ri] + oy) * K) + '" width="' + fmt((xs[ci + 1] - xs[ci]) * K) + '" height="' + fmt((ys[ri + 1] - ys[ri]) * K) + '" fill="' + ((ri + ci) % 2 === 0 ? COLORS.zoneFillA : COLORS.zoneFillB) + '"/>');
        }
      }
      /* 分区线加粗（1→2，颜色加深；仍为虚线以示与实体管线的区别） */
      var zg = [];
      (z.xPos || []).forEach(function (x) { zg.push('<line x1="' + fmt((x + ox) * K) + '" y1="' + fmt((b.minY + oy) * K) + '" x2="' + fmt((x + ox) * K) + '" y2="' + fmt((b.maxY + oy) * K) + '" stroke="' + COLORS.zone + '" stroke-width="2" stroke-dasharray="' + COLORS.zoneDash + '"/>'); });
      (z.yPos || []).forEach(function (y) { zg.push('<line x1="' + fmt((b.minX + ox) * K) + '" y1="' + fmt((y + oy) * K) + '" x2="' + fmt((b.maxX + ox) * K) + '" y2="' + fmt((y + oy) * K) + '" stroke="' + COLORS.zone + '" stroke-width="2" stroke-dasharray="' + COLORS.zoneDash + '"/>'); });
      s.push('<g clip-path="url(#tlWsPlotClip)"><g>' + zf.join('') + '</g><g>' + zg.join('') + '</g></g>');
    }
    /* 2) 滴灌带（浅青细线） */
    (data.dripTapes || []).forEach(function (t) {
      if (!t || t.length < 2) return;
      s.push('<path d="' + pl(t) + '" fill="none" stroke="' + COLORS.tape + '" stroke-width="1" stroke-dasharray="3,3" opacity="0.85"/>');
    });
    /* 3) 支管 → 主管 → 总管（下位先画） */
    (data.branchPipes || []).forEach(function (l) { if (l && l.length >= 2) s.push('<path d="' + pl(l) + '" fill="none" stroke="' + COLORS.branch + '" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>'); });
    (data.mainPipes || []).forEach(function (l) { if (l && l.length >= 2) s.push('<path d="' + pl(l) + '" fill="none" stroke="' + COLORS.main + '" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>'); });
    if (data.frontPipe && data.frontPipe.length >= 2) s.push('<path d="' + pl(data.frontPipe) + '" fill="none" stroke="' + COLORS.front + '" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>');
    /* 4) 水源 + 阀门 */
    if (data.sourcePos) {
      var sp = T(data.sourcePos);
      s.push('<circle cx="' + fmt(sp.x) + '" cy="' + fmt(sp.y) + '" r="5" fill="' + COLORS.source + '" stroke="#fff" stroke-width="1.6"/>');
    }
    (data.valves || []).forEach(function (v) {
      var q = T(v);
      s.push('<circle cx="' + fmt(q.x) + '" cy="' + fmt(q.y) + '" r="3.6" fill="' + COLORS.valve + '" stroke="#fff" stroke-width="1.2"/>');
    });
    /* 地块轮廓描边压顶（分区底色/裁剪不遮边线） */
    s.push('<path d="' + polyD + '" fill="none" stroke="' + COLORS.plotLine + '" stroke-width="2"/>');
    s.push('</g>');
    /* 5) 手工管线层（本模块自有状态，不写回 tlDiagramData） */
    s.push('<g id="tlWsManual">' + manualSVG(T) + '</g>');
    /* 6) 进行中折线预览 */
    s.push('<g id="tlWsPreview"></g>');
    s.push('</svg>');
    viewState = { k: K, ox: ox, oy: oy, w: W, h: H, snapPts: collectSnapPts(data), poly: poly };
    return s.join('');
  }

  function manualSVG(T) {
    var s = [];
    manual.forEach(function (m) {
      if (!m.pts || m.pts.length < 2) return;
      var col = m.kind === 'main' ? COLORS.manualMain : COLORS.manualBranch;
      var d = '';
      m.pts.forEach(function (p, i) { var q = T(p); d += (i ? 'L' : 'M') + fmt(q.x) + ' ' + fmt(q.y); });
      s.push('<g class="tl-ws-man" data-man="' + esc(m.id) + '">');
      s.push('<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="' + (m.kind === 'main' ? 2.6 : 1.6) + '" stroke-linecap="round" stroke-linejoin="round" opacity="0.95"/>');
      /* 顶点小方块（区别自动管的“设计痕迹”） */
      m.pts.forEach(function (p) { var q = T(p); s.push('<rect x="' + fmt(q.x - 1.8) + '" y="' + fmt(q.y - 1.8) + '" width="3.6" height="3.6" fill="#fff" stroke="' + col + '" stroke-width="1"/>'); });
      /* 长度标注（米） */
      var mid = m.pts[Math.floor(m.pts.length / 2)], mq = T(mid);
      s.push('<text x="' + fmt(mq.x + 6) + '" y="' + fmt(mq.y - 4) + '" font-size="9" fill="' + COLORS.label + '" font-family="system-ui">' + esc(m.id + ' ' + m.len.toFixed(1) + 'm') + '</text>');
      s.push('</g>');
    });
    return s.join('');
  }

  /* ---------- DOM / 视口 ---------- */
  function currentCTN() {
    if (typeof document === 'undefined') return null;   // Node 单测无 DOM
    return document.getElementById('tlWsContent');
  }
  function currentEL(ctn) { return ctn ? ctn.querySelector('svg') : null; }
  function zoomPctEl() { return document.getElementById('tlWsZoomPct'); }

  function applyView(ctn, el) {
    el.style.transformOrigin = '0 0';
    el.style.transform = 'translate(' + fmt(view.x) + 'px,' + fmt(view.y) + 'px) scale(' + fmt(view.z) + ')';
    var pct = zoomPctEl(); if (pct) pct.textContent = Math.round(view.z * 100) + '%';
  }
  function baseFit(ctn, el) {
    var w = (ctn.clientWidth || 900) - 8;
    if (!(w > 120)) w = 900;
    var r = ctn.getBoundingClientRect();
    var h = (r.height || 480) - 8;
    if (!(h > 120)) h = 480;
    /* 2026-09-13 晚：铺满容器即可 —— svg 带 preserveAspectRatio="xMidYMid meet"，
       viewBox 与容器比例不同时图形自动等比居中（letterbox 留白在 SVG 内部），
       el 左上角仍位于容器原点 → zoomAt / 拖拽平移 / getScreenCTM 命中的坐标数学全部不变。
       （旧做法把 el 缩成适配尺寸，容器高出的部分空白，竖向工具轨加高画布后很难看。） */
    el.style.width = w + 'px';
    el.style.height = h + 'px';
  }
  function zoomAt(ctn, el, cx, cy, factor) {
    var nz = Math.max(ZMIN, Math.min(ZMAX, view.z * factor));
    if (nz === view.z) return;
    view.x = cx - (cx - view.x) * (nz / view.z);
    view.y = cy - (cy - view.y) * (nz / view.z);
    view.z = nz;
    applyView(ctn, el);
  }
  function requireSVG() {
    var ctn = currentCTN(), el = currentEL(ctn);
    if (!el) return null;
    return { ctn: ctn, el: el };
  }
  function zoomIn() { var t = requireSVG(); if (!t) return; var r = t.ctn.getBoundingClientRect(); zoomAt(t.ctn, t.el, r.width / 2, r.height / 2, 1.25); }
  function zoomOut() { var t = requireSVG(); if (!t) return; var r = t.ctn.getBoundingClientRect(); zoomAt(t.ctn, t.el, r.width / 2, r.height / 2, 0.8); }
  function zoomFit() {
    var t = requireSVG(); if (!t) return;
    view.z = 1; view.x = 0; view.y = 0;
    baseFit(t.ctn, t.el); applyView(t.ctn, t.el);
  }

  /* ---------- 手工层操作 ---------- */
  function rerenderKeepView() {
    var ctn = currentCTN(), el = currentEL(ctn);
    if (!ctn || !el || !lastDataRef) return;
    /* 只重建图形内容，保持视口变换不变 */
    var tmp = document.createElement('div');
    tmp.innerHTML = renderSVG(lastDataRef);
    var fresh = tmp.querySelector('svg');
    if (!fresh) return;
    el.parentNode.replaceChild(fresh, el);
    applyView(ctn, fresh);
    wireInteractions(ctn);
  }
  function commitDraft() {
    if (!draft || draft.pts.length < 2) { draft = null; updatePreview(); return false; }
    manualSeq[draft.kind]++;
    var m = { id: 'M-P' + (manualSeq[draft.kind] < 10 ? '0' : '') + manualSeq[draft.kind], kind: draft.kind, pts: draft.pts, len: polylineLen(draft.pts) };
    manual.push(m);
    draft = null;
    rerenderKeepView();
    notifyChange();
    return true;
  }
  function cancelDraft() { draft = null; updatePreview(); }
  function undo() {
    if (!manual.length) return false;
    manual.pop(); rerenderKeepView(); notifyChange(); return true;
  }
  function clearManual() {
    if (!manual.length) return false;
    manual = []; rerenderKeepView(); notifyChange(); return true;
  }
  function setMode(m) {
    if (m !== 'main' && m !== 'branch') m = null;
    if (mode === m) m = null;                    // 再点同款 = 退出插入模式
    mode = m;
    if (!mode) cancelDraft();
    updatePreview();
    return mode;
  }
  function notifyChange() {
    if (typeof api.onManualChange === 'function') api.onManualChange(manual.length);
  }

  /* ---------- 指针坐标 → 数据坐标（米） ---------- */
  function svgUserPoint(el, clientX, clientY) {
    try {
      var pt = el.createSVGPoint(); pt.x = clientX; pt.y = clientY;
      var m = el.getScreenCTM(); if (!m) return null;
      var p = pt.matrixTransform(m.inverse());
      return { x: p.x, y: p.y };
    } catch (e) { return null; }
  }
  function userToData(u) {
    if (!u || !viewState) return null;
    return { x: u.x / viewState.k - viewState.ox, y: u.y / viewState.k - viewState.oy };
  }
  function snapTolUnits(el) {
    /* 12 屏幕像素对应的 viewBox 单位数（getScreenCTM.a = 每像素单位数，含 CSS 缩放） */
    try { var m = el.getScreenCTM(); if (m && m.a) return SNAP_PX * m.a; } catch (e) {}
    return SNAP_PX;
  }
  function dataPointFromEvent(el, e) {
    var u = svgUserPoint(el, e.clientX, e.clientY);
    if (!u || !viewState) return null;
    var d = userToData(u);
    var tolM = snapTolUnits(el) / viewState.k;   // 吸附半径换算到米
    return pickSnap(d, viewState.snapPts, tolM);
  }

  /* ---------- 预览（进行中折线 + 吸附提示） ---------- */
  function updatePreview(cursorData) {
    var ctn = currentCTN(); if (!ctn) return;
    var g = ctn.querySelector('#tlWsPreview'); if (!g) return;
    if (!draft || !viewState) { g.innerHTML = ''; return; }
    var pts = draft.pts.slice();
    var snapHit = null;
    if (cursorData) {
      var el = currentEL(ctn);
      var tolM = snapTolUnits(el) / viewState.k;
      var hit = pickSnap(cursorData, viewState.snapPts, tolM);
      if (hit !== cursorData) snapHit = hit;
      pts.push(hit);
    }
    function T(p) { return { x: (p.x + viewState.ox) * viewState.k, y: (p.y + viewState.oy) * viewState.k }; }
    var s = '';
    if (pts.length) {
      var d = '';
      pts.forEach(function (p, i) { var q = T(p); d += (i ? 'L' : 'M') + fmt(q.x) + ' ' + fmt(q.y); });
      s += '<path d="' + d + '" fill="none" stroke="' + COLORS.draft + '" stroke-width="2" stroke-dasharray="6,4" opacity="0.9"/>';
      pts.forEach(function (p) { var q = T(p); s += '<circle cx="' + fmt(q.x) + '" cy="' + fmt(q.y) + '" r="2.6" fill="' + COLORS.draft + '"/>'; });
    }
    if (snapHit) { var q2 = T(snapHit); s += '<circle cx="' + fmt(q2.x) + '" cy="' + fmt(q2.y) + '" r="5" fill="none" stroke="' + COLORS.snap + '" stroke-width="1.6" stroke-dasharray="2,2"/>'; }
    g.innerHTML = s;
  }

  /* ---------- 交互接线 ---------- */
  function wireInteractions(ctn) {
    if (ctn._tlwsWired) return;
    ctn._tlwsWired = true;
    ctn.style.touchAction = 'none';
    ctn.tabIndex = -1;
    ctn.addEventListener('wheel', function (e) {
      var el = currentEL(ctn); if (!el) return;
      e.preventDefault();
      var r = ctn.getBoundingClientRect();
      zoomAt(ctn, el, e.clientX - r.left, e.clientY - r.top, e.deltaY > 0 ? 0.9 : 1.1);
    }, { passive: false });

    var drag = null, downPos = null;
    ctn.addEventListener('pointerdown', function (e) {
      var el = currentEL(ctn); if (!el) return;
      try { ctn.focus({ preventScroll: true }); } catch (err) { ctn.focus(); }
      downPos = { x: e.clientX, y: e.clientY };
      if (e.button === 1 || (e.button === 0 && !mode)) {          // 非插入模式左键 / 任意中键 = 平移
        drag = { x: e.clientX - view.x, y: e.clientY - view.y, id: e.pointerId };
        el.classList.add('tl-ws-dragging');
        if (el.setPointerCapture) { try { el.setPointerCapture(e.pointerId); } catch (err) {} }
        e.preventDefault();
      }
    });
    ctn.addEventListener('pointermove', function (e) {
      if (drag && e.pointerId === drag.id) {
        var el = currentEL(ctn); if (!el) return;
        view.x = e.clientX - drag.x; view.y = e.clientY - drag.y;
        applyView(ctn, el);
        return;
      }
      if (mode && draft) {                                        // 插入模式：预览跟随
        var el2 = currentEL(ctn); if (!el2) return;
        updatePreview(dataPointFromEvent(el2, e));
      }
    });
    function up(e) {
      if (drag && (e.pointerId === undefined || e.pointerId === drag.id)) {
        drag = null;
        var el = currentEL(ctn); if (el) el.classList.remove('tl-ws-dragging');
      }
    }
    ctn.addEventListener('pointerup', up);
    ctn.addEventListener('pointercancel', up);

    ctn.addEventListener('click', function (e) {
      if (!mode || !downPos || Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > CLICK_PX) return;
      var el = currentEL(ctn); if (!el || !lastDataRef) return;
      var p = dataPointFromEvent(el, e); if (!p) return;
      if (!draft) draft = { kind: mode, pts: [] };
      /* 连续点击同一点（双击的第二击）不重复入列 */
      var last = draft.pts[draft.pts.length - 1];
      if (last && Math.hypot(last.x - p.x, last.y - p.y) < 0.05) return;
      draft.pts.push(p);
      updatePreview(p);
    });
    ctn.addEventListener('dblclick', function (e) {
      e.preventDefault();
      if (mode && draft && draft.pts.length >= 2) {
        /* 双击的第二次 click 已入列一个重复点，剔除后再提交 */
        var n = draft.pts.length;
        if (n >= 2 && Math.hypot(draft.pts[n - 1].x - draft.pts[n - 2].x, draft.pts[n - 1].y - draft.pts[n - 2].y) < 0.05) draft.pts.pop();
        commitDraft();
      } else if (!mode) { zoomFit(); }      // 非插入模式双击 = 适应窗口（对齐轴测图交互）
    });
    /* 键盘：Enter 结束 / Esc 取消草稿（无草稿时退出插入模式）。挂容器（tabIndex=-1 可聚焦） */
    ctn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && draft) { commitDraft(); e.preventDefault(); }
      else if (e.key === 'Escape') {
        if (draft) cancelDraft();
        else if (mode) { mode = null; updatePreview(); if (typeof api.onModeChange === 'function') api.onModeChange(null); }
        e.preventDefault();
      }
    });
    /* 容器尺寸变化（左栏拖宽/窗口缩放）→ 未缩放时保持整幅适配 */
    if (!ctn._tlwsResize) {
      ctn._tlwsResize = true;
      window.addEventListener('resize', function () {
        var el = currentEL(ctn);
        if (!el || view.z !== 1 || view.x !== 0 || view.y !== 0) return;
        baseFit(ctn, el); applyView(ctn, el);
      });
    }
  }

  /* ---------- 渲染入口 ---------- */
  function render(ctn, data) {
    if (!ctn) return false;
    if (!data || data.version !== 1) {
      ctn.innerHTML = '<div class="tl-ws-empty">请先生成三级管线平面图（点左侧「生成管线图」）</div>';
      viewState = null; lastDataRef = null;
      return false;
    }
    if (lastDataRef && lastDataRef !== data) { manual = []; manualSeq = { main: 0, branch: 0 }; }  // 数据重生成 → 手工层清空
    lastDataRef = data;
    ctn.innerHTML = '<div class="tl-ws-canvas" id="tlWsCanvas">' + renderSVG(data) + '</div>';
    view.z = 1; view.x = 0; view.y = 0;
    var c2 = currentCTN(), el = currentEL(c2);
    if (c2) {
      if (el) { baseFit(c2, el); applyView(c2, el); }
      wireInteractions(c2);
    }
    return true;
  }

  /* ---------- 导出 ---------- */
  api.render = render;
  api.zoomIn = zoomIn; api.zoomOut = zoomOut; api.zoomFit = zoomFit;
  api.setMode = setMode;
  api.mode = function () { return mode; };
  api.undo = undo;
  api.clearManual = clearManual;
  api.pipes = function () { return manual; };
  api.commitDraft = commitDraft;      // 测试/外部结束当前折线
  api.cancelDraft = cancelDraft;
  api.getViewState = function () { return viewState; };   // 只读钩子：E2E 数据坐标→屏幕换算
  api._geo = { boundsOf: boundsOf, polylineLen: polylineLen, collectSnapPts: collectSnapPts, pickSnap: pickSnap, closestOnSeg: closestOnSeg };

  global.RyTlWs = api;
})(typeof window !== 'undefined' ? window : globalThis);
