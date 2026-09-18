/* =====================================================================
 * tl-workspace.js — 三级管线设计工作区模块（润野灌溉）
 * ---------------------------------------------------------------------
 * 职责：读取三级平面图最终几何数据（window.tlDiagramData，由 tlAutoGenerate
 *       末尾导出），在「三级制图」视图渲染可缩放/平移的设计底图，
 *       并提供手工插入管线层（主管/支管折线）。
 * 2026-09-15 用户要求：底图改为直接显示「三级简图」成图内容（仅去滴灌带示意，
 *       三级简图本身不变）；简图未生成时回退本模块原有自绘底图。
 * 2026-09-15 阶段1（用户批准）：手工管线迁入共享图面数据层 RyTlEditPipes
 *       （tl-edit-pipes.js）——三级工作区 ⇄ 轴测图 双向同步：任一视图插入/删除
 *       主管/支管，另一视图立即重渲染；支持拾取选中、改长（末段拉伸）、删除、
 *       数量/长度自动汇总。
 * 2026-09-15 阶段2（用户批准）：接入自动管线图面编辑层 RyTlAutoEdits
 *       （tl-auto-edits.js）—— 二级传递的自动管线（简图底图内）可点选（高亮+信息）、
 *       就地改长（克隆底图隐藏原 path，覆盖层按简图原色重画有效几何）、
 *       在点击位置插三通/阀门；与轴测图双向同步。tlDiagramData 仍只读不写。
 * 红线：只读不写（与 iso-diagram 同一红线）。手工管线只存共享数据层自有状态，
 *       不写回 tlDiagramData、不参与水力计算、不进材料清单；
 *       平面几何签名变更（重新生成平面图）→ 共享层自动清空（同几何保留）。
 * 交互：滚轮缩放（光标为中心）· 非插入模式拖拽平移 · 双击/按钮适应窗口；
 *       插入模式点击逐点画折线（端点吸附），双击/Enter 结束，Esc 取消/退出；
 *       非插入模式点击手工管线 → 选中（页面工具栏可改长/删除）。
 * ===================================================================== */
(function (global) {
  'use strict';

  /* ---------- 共享图面数据层（2026-09-15 阶段1）----------
   * 手工管线单一数据源：三级工作区 ⇄ 轴测图共用。缺失时退化为只读空层
   * （本模块仍可独立渲染/单测，插入操作不可用）。 */
  var EP = global.RyTlEditPipes || {
    list: function () { return []; },
    add: function () { return null; }, remove: function () { return false; },
    removeLast: function () { return false; }, update: function () { return null; },
    clear: function () { return false; },
    totals: function () { return { main: { n: 0, len: 0 }, branch: { n: 0, len: 0 }, all: { n: 0, len: 0 } }; },
    syncGeometry: function () { return 'kept'; },
    onChange: function () { return function () {}; },
    serialize: function () { return null; }, restore: function () { return false; }
  };
  /* 自动管线图面编辑层（2026-09-15 阶段2）：缺失（Node 旧测试/加载顺序异常）时退化为空层 */
  var AE = global.RyTlAutoEdits || {
    lensMap: function () { return {}; }, fitsList: function () { return []; },
    pipePts: function () { return null; }, pipeName: function (p) { return p; },
    allPids: function () { return []; }, effPts: function () { return null; },
    pointAt: function () { return null; }, locate: function () { return null; },
    polylineLen: polylineLen,
    setLen: function () { return false; }, addFitting: function () { return null; },
    removeFitting: function () { return false; }, moveFitting: function () { return false; },
    calibersMap: function () { return {}; }, caliberOf: function () { return null; },
    setCaliber: function () { return false; }, clearCaliber: function () { return false; },
    syncGeometry: function () { return 'kept'; }, onChange: function () { return function () {}; }
  };

  /* ---------- 常量（绘图表达参数，不参与水力计算） ---------- */
  var K = 2.5;            // viewBox 单位/米
  var PAD_M = 6;          // 图形四周留白（米）
  var ZMIN = 0.2, ZMAX = 8;
  var SNAP_PX = 12;       // 端点吸附半径（屏幕像素）
  var CLICK_PX = 5;       // 按下-抬起位移 ≤ 此值才算点击（与拖拽平移区分）
  var COLORS = {
    plotFill: '#f6faf7', plotLine: '#3f7a55',
    zone: '#8fae9b', zoneDash: '5,5',
    zoneFill: '#e6f2ea', zoneFillPartial: 'rgba(245,158,11,.18)',   /* 分区底色：标准=浅绿、非标=琥珀（2026-09-15 用户要求二色区分） */
    branch: '#16a34a', main: '#185FA5', front: '#f97316',
    valve: '#ef4444', source: '#f59e0b',
    manualMain: '#185FA5', manualBranch: '#16a34a',
    draft: '#7c3aed', snap: '#7c3aed',
    label: '#47555e',
    manTee: '#e11d48', manElbow: '#7c3aed',   /* 手工配件（2026-09-16）：三通玫红 / 弯头紫（玫红区别于蓝主管，易辨认） */
    manValve: '#0891b2'                       /* 手工阀门（2026-09-18 第七十轮）：靛青，与玫红三通、紫弯头三色区分 */
  };
  /* 联合灌溉分组底色（2026-09-16）：仅工作区按 N=combinedN 顺序分组（分组轮流 + 余数单独成组）。
     每组一个独立浅色；同组同色、组间一眼区分；超出调色板循环并降透明度避免与首轮混淆。
     非标区在主 render 中保留琥珀描边（仍归入其序号所在组）。 */
  var GROUP_FILLS = [
    'rgba(239,68,68,.30)', 'rgba(245,158,11,.30)', 'rgba(234,179,8,.32)', 'rgba(34,197,94,.30)',
    'rgba(20,184,166,.30)', 'rgba(6,182,212,.30)', 'rgba(59,130,246,.30)', 'rgba(99,102,241,.30)',
    'rgba(139,92,246,.30)', 'rgba(168,85,247,.30)', 'rgba(217,70,239,.28)', 'rgba(236,72,153,.30)',
    'rgba(244,63,94,.28)', 'rgba(132,204,22,.32)'
  ];
  function groupFill(g) {
    var base = GROUP_FILLS[g % GROUP_FILLS.length];
    if (g >= GROUP_FILLS.length) { return base.replace(/[\d.]+\)$/, '0.20)'); } /* 循环：略浅 */
    return base;
  }
  /* 分区标注组号前缀：G{组}·{区号}（2026-09-16） */
  function tlZoneGrpTag(zi2, n) { var g = Math.floor(zi2 / n) + 1; return 'G' + g + '·' + (zi2+1); }
  /* 联合灌溉分组交互（2026-09-16 补全）：点选区→整组高亮 + 执行说明面板 */
  var selGroup = null;                                  // 当前高亮的联合灌溉组号（null=无）
  function groupFillHi(g) {                             // 高亮态：同色加深（透明度 0.30→0.55）
    var base = GROUP_FILLS[g % GROUP_FILLS.length];
    return base.replace(/[\d.]+\)$/, '0.55)');
  }
  function tlGroupMembers(g, tlN, tlTotal) {
    var a = [];
    for (var zi = g * tlN; zi < Math.min((g + 1) * tlN, tlTotal); zi++) a.push(zi + 1);
    return a;
  }
  function buildGroupInfo(g) {
    var d = lastDataRef; if (!d || !d.zones) return '';
    var tlN = (typeof d.combinedN === 'number' && d.combinedN >= 1) ? d.combinedN : 2;
    var z = d.zones, zcN = z.cols || (z.xPos.length - 1), zrN = z.rows || (z.yPos.length - 1);
    var tlTotal = zcN * zrN, M = Math.ceil(tlTotal / tlN);
    var members = tlGroupMembers(g, tlN, tlTotal);
    var cf = (d.meta && d.meta.flowModel) ? d.meta.flowModel.combinedFlow : null;
    var cfTxt = (cf != null && cf !== '') ? ('本轮合灌流量 ≈ ' + cf + ' L/h') : '';
    return '联合灌溉组 G' + (g + 1) + ' · 共 ' + M + ' 组之一<br>'
      + '含 区 ' + members.join('、') + '<br>'
      + members.length + ' 区同轮灌溉'
      + (cfTxt ? ('<br>' + cfTxt) : '');
  }
  function applyGroupHighlight() {
    var cv = document.getElementById('tlWsCanvas'); if (!cv) return;
    var rects = cv.querySelectorAll('rect[data-zi]');
    for (var i = 0; i < rects.length; i++) {
      var r = rects[i], g = parseInt(r.getAttribute('data-g'), 10);
      if (selGroup === null) {
        r.setAttribute('fill', r.getAttribute('data-fill'));
        r.removeAttribute('stroke'); r.removeAttribute('stroke-width');
      } else if (g === selGroup) {
        r.setAttribute('fill', groupFillHi(g));
        r.setAttribute('stroke', '#1f2937'); r.setAttribute('stroke-width', '1.6');
      } else {
        r.setAttribute('fill', 'rgba(100,116,139,0.06)');
        r.removeAttribute('stroke'); r.removeAttribute('stroke-width');
      }
    }
    var bs = cv.querySelectorAll('line[data-gb]');
    for (var j = 0; j < bs.length; j++) {
      var gbv = parseInt(bs[j].getAttribute('data-gb'), 10);
      bs[j].setAttribute('opacity', (selGroup !== null && (gbv === selGroup || gbv === selGroup - 1)) ? '1' : '0.7');
    }
    var info = document.getElementById('tlWsGroupInfo');
    if (info) info.innerHTML = (selGroup === null) ? '' : buildGroupInfo(selGroup);
  }
  function groupInfoHtml() {
    return '<div id="tlWsGroupInfo" style="display:block;position:absolute;bottom:10px;left:10px;max-width:42%;background:rgba(255,255,255,.96);border:1px solid #1f2937;border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.12);padding:6px 11px;font:11.5px/1.55 system-ui,sans-serif;color:#1f2937;pointer-events:none;text-align:left;z-index:6"></div>';
  }
  var KIND_LABEL = { main: '主管', branch: '支管' };
  /* 图面/手工配件类型 → 中文名（2026-09-18 第七十轮）：阀门进入手工层后，原「非三通即弯头」的
     三元表达式会张冠李戴，统一走这张表。 */
  var MAN_FIT_LABEL = { tee: '三通', valve: '阀门', elbow: '弯头' };

  /* ---------- 模块状态 ---------- */
  /* 手工管线在共享数据层 EP（2026-09-15 阶段1）；本模块只保留视图态 */
  var selId = null;           // 选中手工管线 id（非插入模式点击拾取）
  var selAutoId = null;       // 选中自动管线 pid：'front'|'main-i'|'branch-i'（阶段2）
  var selAutoAt = 0;          // 选中自动管线时的点击位置（沿管弧长，米）——插配件用
  var selFitId = null;        // 选中图面配件 id（A-F##，阶段2）
  var selManFitId = null;     // 选中手工配件 id（MP-F## 三通/弯头，2026-09-16）
  var selSet = [];            // 同类型多选：自动管线 pid 数组（第三十九轮）
  var multiMode = false;      // 多选开关（第五十八轮）：开启后普通点管身 = 逐段加选（不必按 Ctrl）
  var suppressAutoPick = false;  // pointerdown 已处理过本次「点管身」（多选）→ 抑制随后的合成 click 重复处理
  var fitDrag = null;         // 配件沿管拖动态 {id, pointerId, atM}（阶段2b）
  var fitDragRaf = 0;         // 拖动提交 rAF 节流句柄
  var pipeDrag = null;        // 整条拖动手工管线（2026-09-16）{id, pointerId, last, acc, moved}
  var pipeDragRaf = 0;        // 拖动提交 rAF 节流句柄
  var autoDrag = null;        // 整条拖动自动管线（2026-09-16）{pid, pointerId, last, acc, moved, sx, sy}
  var autoDragRaf = 0;        // 拖动提交 rAF 节流句柄
  var lastDataRef = null;
  var mode = null;            // null | 'main' | 'branch' —— 插入模式
  var fitMode = null;         // null | 'valve' | 'tee' | 'elbow' —— 配件插入模式（2026-09-18 第七十轮）
  var orthoLock = false;      // 横竖锁定（2026-09-16）：画线新点约束与上一点水平/垂直
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
    EP.list().forEach(function (m) { ends(m.pts); });   // 共享数据层手工管线端点也吸附（2026-09-15）
    /* 自动管线改长后的有效端点也吸附（阶段2） */
    Object.keys(AE.lensMap()).forEach(function (pid) { var e = AE.effPts(pid, data); if (e) ends(e); });
    /* 图面配件（三通/阀门 A-F##，阶段2c）：沿有效几何定位，画新管线自动吸附 */
    (AE.fitsList() || []).forEach(function (f) { var p = AE.pointAt(f.pid, data, f.atM); if (p) add(p); });
    /* 手工配件锚点（MP-F## 三通/弯头，2026-09-16）：画线自动吸附到配件 */
    (EP.fitsList ? EP.fitsList() : []).forEach(function (f) { var p = EP.fitPos(f.id); if (p) add(p); });
    /* 三通锚点（2026-09-17 指令 C）：吸附到自动/手工三通，使手绘管端点精确落在三通上 →
       三通旋转时该管被认作连接管跟随旋转（轴测图 teeSubtree.nearPt 判定）。 */
    (global.RyIsoDiagram && global.RyIsoDiagram.teeSnapPts ? global.RyIsoDiagram.teeSnapPts() : []).forEach(function (t) { add(t); });
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

  /* ---------- 三级简图底图接管（2026-09-15 用户要求）----------
   * 工作区底图 = 「三级简图」成图内容（标题/信息行/图面/图例全套），仅剔除滴灌带示意
   * （只在本页取消；三级简图本身不变）。
   * 做法：克隆 #tlDiagramContent svg → ①去滴灌带（stroke #67e8f9 的 path）；
   * ②#tlPlotGroup 拖动 translate 清零（本页无该交互，图面坐标保持 = ts 公式）；
   * ③全部 id 加前缀 tlWsPipe_ 并同步 url(# 引用，避免与管线视图同 id 冲突。
   * 坐标对齐：viewState 改用 window.tlPlanView（简图 s/ox/oy/minX/minY），
   * ts 公式 svg=(data−minX)*s+ox → T(p)=(p+OX)*s 的 OX 合并 = ox简图/s − minX
   * （2026-09-15 阶段2 修正单位折算；命中/吸附/手工层/预览数学全部随之对齐）。
   * 简图未生成或 Node 无 DOM → 返回 null，走原有自绘路径（单测兼容）。 */
  function pipeBaseSVG() {
    if (typeof document === 'undefined') return null;
    var pv = global.tlPlanView;
    var src = document.querySelector('#tlDiagramContent svg');
    if (!src || !pv || !isFinite(pv.s) || !isFinite(pv.minX)) return null;
    try {
      var clone = src.cloneNode(true);
      var drips = clone.querySelectorAll('path[stroke="#67e8f9"]');
      for (var i = 0; i < drips.length; i++) drips[i].parentNode.removeChild(drips[i]);
      /* 最不利路径标注（第四十七轮）：简图那份标注只留在简图；工作区由 renderPipeBaseSVG 按**当前
         有效几何**（AE.effPts）重画 —— 先剥掉克隆来的旧标注，避免重复、也避免与改长后的几何不符。 */
      var wg = clone.querySelectorAll('[data-tlworst]');
      for (var wi = 0; wi < wg.length; wi++) wg[wi].parentNode.removeChild(wg[wi]);
      /* 图例里的「滴灌带」项一并去掉（本页不画滴灌带，图例不留空项）：文本 + 前面的色样 <line> 成对删 */
      var lgTexts = clone.querySelectorAll('text');
      for (var k = 0; k < lgTexts.length; k++) {
        if ((lgTexts[k].textContent || '').trim() !== '滴灌带') continue;
        var prev = lgTexts[k].previousElementSibling;
        if (prev && prev.tagName && prev.tagName.toLowerCase() === 'line') prev.parentNode.removeChild(prev);
        lgTexts[k].parentNode.removeChild(lgTexts[k]);
      }
      /* 2026-09-16：页眉信息/底部参数/图例三组在工作区改由固定 HTML 覆盖层呈现（不随缩放平移），
         克隆底图剥离；标题/图框恢复于简图源头（2026-09-16），工作区同样剥离（做图区不显示）。 */
      ['tlHeaderGroup', 'tlParamsGroup', 'tlLegendGroup', 'tlTitleGroup', 'tlFrameGroup'].forEach(function (gid) {
        var g = clone.querySelector('#' + gid);
        if (g && g.parentNode) g.parentNode.removeChild(g);
      });
      var pg = clone.querySelector('#tlPlotGroup');
      if (pg) pg.removeAttribute('transform');
      /* 阶段2：已改长的自动管线在克隆底图中隐藏原 path —— 有效几何由 tlWsAuto 覆盖层重画 */
      var lensMap = AE.lensMap();
      Object.keys(lensMap).forEach(function (pid) {
        var p = clone.querySelector('[data-tlpipe="' + pid + '"]');
        if (p) p.setAttribute('visibility', 'hidden');
      });
      var ids = clone.querySelectorAll('[id]');
      for (var j = 0; j < ids.length; j++) ids[j].setAttribute('id', 'tlWsPipe_' + ids[j].getAttribute('id'));
      var html = clone.innerHTML
        .split('url(#').join('url(#tlWsPipe_')
        .split('href="#').join('href="#tlWsPipe_');
      var vb = (src.getAttribute('viewBox') || '0 0 1190 900').split(/[\s,]+/).map(Number);
      return { inner: html, w: vb[2] || 1190, h: vb[3] || 900, pv: pv };
    } catch (e) { return null; }
  }

  function renderPipeBaseSVG(data, base) {
    var pv = base.pv;
    /* 简图 ts 公式：svg = (data − minX)*s + ox（offset 在缩放之后、单位为 viewBox 单位）。
       合并成 T(p)=(p+OX)*k 时 OX 必须先除回 s 折算成米（2026-09-15 阶段2 修正：
       旧式 OX=pv.ox−minX*s 单位错位，克隆路径下手工层/拾取相对底图整体偏移）。 */
    var OX = pv.ox / pv.s - pv.minX, OY = pv.oy / pv.s - pv.minY;
    function T(p) { return { x: (p.x + OX) * pv.s, y: (p.y + OY) * pv.s }; }
    var s = [];
    s.push('<svg viewBox="0 0 ' + fmt(base.w) + ' ' + fmt(base.h) + '" preserveAspectRatio="xMidYMid meet" class="tl-ws-svg" xmlns="http://www.w3.org/2000/svg">');
    s.push('<rect x="0" y="0" width="' + fmt(base.w) + '" height="' + fmt(base.h) + '" fill="#fff"/>');
    s.push(base.inner);
    /* 自动管线图面编辑覆盖层（阶段2）：改长有效几何 + 配件标记 + 选中高亮 */
    s.push('<g id="tlWsAuto">' + autoSVG(T) + '</g>');
    /* 手工管线层 + 预览层：T 与简图 ts 同一坐标系（偏移合并进 viewState） */
    s.push('<g id="tlWsManual">' + manualSVG(T) + '</g>');
    s.push('<g id="tlWsPreview"></g>');
    /* 最不利路径标注（第四十七轮）：水源 → 最远分区（总管段 + 该区主管，支管不标），与水泵扬程同源 */
    /* ⚠ 签名适配：本文件 T 是「点对象」签名 T(p)；而 tlWorstPathMarkSVG 用的是简图 ts 的
       「两参数」签名 ts(x,y)。直接传 T 会让 p 收到数字 → p.x 为 undefined → 坐标全 NaN
       （浏览器逐条报 <path> attribute d: Expected number）。故包一层适配器。 */
    try {
      if (global.tlWorstPathMarkSVG) s.push(global.tlWorstPathMarkSVG(function (x, y) { return T({ x: x, y: y }); }));
    } catch (e) { }
    s.push('</svg>');
    viewState = { k: pv.s, ox: OX, oy: OY, w: base.w, h: base.h, snapPts: collectSnapPts(data), poly: data.poly || [], base: true };
    return s.join('');
  }

  /* 接出的支管跟随三通/阀门移动：渲染前把支管起点对齐到配件锚点、整体平移（不动通知/不进数据层）。
     覆盖：宿主管/自动管被拖动 -> fitPos/pointAt 实时重算锚点而支管是独立管段；以及三通沿管移动/换向。 */
  function syncBranchPipes() {
    if (!lastDataRef) return;
    (EP.fitsList() || []).forEach(function (f) {
      if (f.kind !== 'tee' || !f.branchId) return;
      var p = EP.pipeById(f.branchId);
      if (!p || !p.pts || p.pts.length < 1) return;
      var a = EP.fitPos(f.id);
      if (!a) return;
      var s0 = p.pts[0], dx = a.x - s0.x, dy = a.y - s0.y;
      if (dx === 0 && dy === 0) return;
      p.pts = p.pts.map(function (q) { return { x: q.x + dx, y: q.y + dy }; });
      p.len = Math.round(AE.polylineLen(p.pts) * 100) / 100;
    });
    (AE.fitsList() || []).forEach(function (f) {
      if (!f.branchId) return;
      var p = EP.pipeById(f.branchId);
      if (!p || !p.pts || p.pts.length < 1) return;
      var a = AE.pointAt(f.pid, lastDataRef, f.atM);
      if (!a) return;
      var s0 = p.pts[0], dx = a.x - s0.x, dy = a.y - s0.y;
      if (dx === 0 && dy === 0) return;
      p.pts = p.pts.map(function (q) { return { x: q.x + dx, y: q.y + dy }; });
      p.len = Math.round(AE.polylineLen(p.pts) * 100) / 100;
    });
  }
  function renderSVG(data) {
    syncBranchPipes();              // 支管跟随三通/阀门（宿主管/自动管/三通移动后对齐锚点）
    var _pipeBase = pipeBaseSVG();
    if (_pipeBase) return renderPipeBaseSVG(data, _pipeBase);
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
      /* 2026-09-16 联合灌溉分组：仅工作区按 N=combinedN 顺序分组（分组轮流 + 余数单独成组）。
         组号 g = floor(zi / N)；同组同色（groupFill），组间一眼区分；非标区保留琥珀描边。 */
      var flags = data.partialFlags || [];
      var zcN = z.cols || (z.xPos.length - 1);
      var zrN = z.rows || (z.yPos.length - 1);
      var tlN = (typeof data.combinedN === 'number' && data.combinedN >= 1) ? data.combinedN : 2;
      var tlTotal = zcN * zrN;
      var zf = [], zp = [];
      for (var ri = 0; ri + 1 < z.yPos.length; ri++) {
        for (var ci = 0; ci + 1 < z.xPos.length; ci++) {
          var zi = ri * zcN + ci;
          var g = Math.floor(zi / tlN);
          zf.push('<rect x="' + fmt((z.xPos[ci] + ox) * K) + '" y="' + fmt((z.yPos[ri] + oy) * K) + '" width="' + fmt((z.xPos[ci + 1] - z.xPos[ci]) * K) + '" height="' + fmt((z.yPos[ri + 1] - z.yPos[ri]) * K) + '" fill="' + groupFill(g) + '" data-zi="' + zi + '" data-g="' + g + '" data-fill="' + groupFill(g) + '"/>');
          /* 非标区：组色底 + 琥珀描边（2026-09-15 二色区分的延续，仍归入其序号所在组） */
          if (flags[zi]) {
            zp.push('<rect x="' + fmt((z.xPos[ci] + ox) * K) + '" y="' + fmt((z.yPos[ri] + oy) * K) + '" width="' + fmt((z.xPos[ci + 1] - z.xPos[ci]) * K) + '" height="' + fmt((z.yPos[ri + 1] - z.yPos[ri]) * K) + '" fill="none" stroke="#d97706" stroke-width="2" stroke-dasharray="6,3"/>');
          }
        }
      }
      /* 分区线（绿虚线，仍示与实体管线区别） */
      var zg = [];
      (z.xPos || []).forEach(function (x) { zg.push('<line x1="' + fmt((x + ox) * K) + '" y1="' + fmt((b.minY + oy) * K) + '" x2="' + fmt((x + ox) * K) + '" y2="' + fmt((b.maxY + oy) * K) + '" stroke="' + COLORS.zone + '" stroke-width="2" stroke-dasharray="' + COLORS.zoneDash + '"/>'); });
      (z.yPos || []).forEach(function (y) { zg.push('<line x1="' + fmt((b.minX + ox) * K) + '" y1="' + fmt((y + oy) * K) + '" x2="' + fmt((b.maxX + ox) * K) + '" y2="' + fmt((y + oy) * K) + '" stroke="' + COLORS.zone + '" stroke-width="2" stroke-dasharray="' + COLORS.zoneDash + '"/>'); });
      /* 联合灌溉组边界（粗深色实线，强调「哪些区是一组」）：
         竖向：每行内 (ri*zcN + ci + 1) % N == 0 处；横向：行首序号 (ri+1)*zcN % N == 0 处（仅内部线，不画地块外框）。 */
      var gb = [];
      for (var bri = 0; bri < zrN; bri++) {
        for (var bci = 0; bci + 1 < zcN; bci++) {
          if ((bri * zcN + bci + 1) % tlN === 0) {
            var gx = (z.xPos[bci + 1] + ox) * K;
            gb.push('<line x1="' + fmt(gx) + '" y1="' + fmt((z.yPos[bri] + oy) * K) + '" x2="' + fmt(gx) + '" y2="' + fmt((z.yPos[bri + 1] + oy) * K) + '" stroke="#1f2937" stroke-width="3.4" opacity="0.78" data-gb="' + Math.floor((bri * zcN + bci) / tlN) + '"/>');
          }
        }
        if ((bri + 1) < zrN && (bri + 1) * zcN % tlN === 0) {
          var gy = (z.yPos[bri + 1] + oy) * K;
          gb.push('<line x1="' + fmt((z.xPos[0] + ox) * K) + '" y1="' + fmt(gy) + '" x2="' + fmt((z.xPos[zcN] + ox) * K) + '" y2="' + fmt(gy) + '" stroke="#1f2937" stroke-width="3.4" opacity="0.78" data-gb="' + Math.floor(((bri + 1) * zcN - 1) / tlN) + '"/>');
        }
      }
      s.push('<g clip-path="url(#tlWsPlotClip)"><g>' + zf.join('') + '</g><g>' + zp.join('') + '</g><g>' + zg.join('') + '</g><g>' + gb.join('') + '</g></g>');
      /* 分区标注层（2026-09-15 用户要求）：画在裁剪之外，避免被地块边界切掉。
         标准区=编号+设计尺寸+亩数；非标区=编号+实际亩数（与三级施工简图口径一致）。 */
      var actMus = data.zoneActMu || [];
      function muTxt(v) { if (!isFinite(v)) return '—'; var r = Math.round(v); return Math.abs(v - r) < 0.05 ? String(r) : v.toFixed(1); }
      var lp = [];
      for (var ri2 = 0; ri2 + 1 < z.yPos.length; ri2++) {
        for (var ci2 = 0; ci2 + 1 < z.xPos.length; ci2++) {
          var zi2 = ri2 * zcN + ci2;
          var stdMu2 = (z.xPlan && z.yPlan) ? z.xPlan[ci2] * z.yPlan[ri2] / 666.67 : 0;
          var actMu2 = isFinite(actMus[zi2]) ? actMus[zi2] : stdMu2;
          if (!(actMu2 > 0.05)) continue;
          var rx = (z.xPos[ci2] + ox) * K, ry = (z.yPos[ri2] + oy) * K;
          var rw = (z.xPos[ci2 + 1] - z.xPos[ci2]) * K, rh = (z.yPos[ri2 + 1] - z.yPos[ri2]) * K;
          var aw = Math.abs(rw), ah = Math.abs(rh);
          var lx = rx + rw - 5, ly = ry + 13;
          var FF = ' font-family="system-ui"';
          if (flags[zi2]) {
            /* 非标准分区：琥珀色，编号 + 实际亩数 */
            if (aw > 78 && ah > 44) {
              lp.push('<text x="' + fmt(lx) + '" y="' + fmt(ly) + '" text-anchor="end" font-size="12" font-weight="700" fill="#b45309"' + FF + '>' + tlZoneGrpTag(zi2, tlN) + '区</text>');
              lp.push('<text x="' + fmt(lx) + '" y="' + fmt(ly + 13) + '" text-anchor="end" font-size="9" font-weight="700" fill="#b45309"' + FF + '>实际 ' + muTxt(actMu2) + ' 亩</text>');
            } else if (aw > 34 && ah > 22) {
              lp.push('<text x="' + fmt(lx) + '" y="' + fmt(ly) + '" text-anchor="end" font-size="8" font-weight="700" fill="#b45309"' + FF + '>' + tlZoneGrpTag(zi2, tlN) + '区 实际' + muTxt(actMu2) + '亩</text>');
            }
          } else {
            /* 标准分区：深灰，编号 + 设计尺寸 + 亩数 */
            var dw = (z.xPlan && z.yPlan) ? Math.max(z.xPlan[ci2], z.yPlan[ri2]) : Math.max(z.xPos[ci2 + 1] - z.xPos[ci2], z.yPos[ri2 + 1] - z.yPos[ri2]);
            var dh2 = (z.xPlan && z.yPlan) ? Math.min(z.xPlan[ci2], z.yPlan[ri2]) : Math.min(z.xPos[ci2 + 1] - z.xPos[ci2], z.yPos[ri2 + 1] - z.yPos[ri2]);
            var sizeTxt = muTxt(dw) + '×' + muTxt(dh2) + 'm';
            var areaTxt = muTxt(stdMu2) + '亩';
            if (aw > 120 && ah > 68) {
              lp.push('<text x="' + fmt(lx) + '" y="' + fmt(ly) + '" text-anchor="end" font-size="13" font-weight="700" fill="#111827"' + FF + '>' + tlZoneGrpTag(zi2, tlN) + '区</text>');
              lp.push('<text x="' + fmt(lx) + '" y="' + fmt(ly + 14) + '" text-anchor="end" font-size="9.5" font-weight="600" fill="#111827"' + FF + '>' + sizeTxt + '</text>');
              lp.push('<text x="' + fmt(lx) + '" y="' + fmt(ly + 26) + '" text-anchor="end" font-size="9" fill="#111827"' + FF + '>' + areaTxt + '</text>');
            } else if (ah > 90) {
              lp.push('<g transform="translate(' + fmt(rx + rw / 2) + ' ' + fmt(ry + rh / 2) + ') rotate(-90)">');
              lp.push('<text x="0" y="3" text-anchor="middle" font-size="9" font-weight="700" fill="#111827"' + FF + '>' + tlZoneGrpTag(zi2, tlN) + '区 ' + sizeTxt + ' ' + areaTxt + '</text></g>');
            } else if (aw > 46 && ah > 34) {
              lp.push('<text x="' + fmt(lx) + '" y="' + fmt(ly) + '" text-anchor="end" font-size="11" font-weight="700" fill="#111827"' + FF + '>' + tlZoneGrpTag(zi2, tlN) + '区</text>');
              lp.push('<text x="' + fmt(lx) + '" y="' + fmt(ly + 12) + '" text-anchor="end" font-size="8.5" fill="#111827"' + FF + '>' + sizeTxt + ' ' + areaTxt + '</text>');
            } else if (aw > 30 && ah > 22) {
              lp.push('<text x="' + fmt(rx + rw / 2) + '" y="' + fmt(ry + rh / 2 + 3) + '" text-anchor="middle" font-size="7.5" font-weight="700" fill="#111827"' + FF + '>' + tlZoneGrpTag(zi2, tlN) + '区 ' + areaTxt + '</text>');
            }
          }
        }
      }
      if (lp.length) s.push('<g>' + lp.join('') + '</g>');
    }
    /* 2) 滴灌带 —— 2026-09-15 按用户要求工作区不再绘制（数据仍由 tlDiagramData 导出，不影响轴测图） */
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
    /* 2026-09-16 联合灌溉分组读数（仅工作区显示，不进简图） */
    var tlM = Math.ceil(tlTotal / tlN);
    s.push('<text x="8" y="' + fmt(H - 8) + '" font-size="11" font-weight="700" fill="#1f2937" font-family="system-ui">联合灌溉 ' + tlN + '区 · 分 ' + tlM + ' 组</text>');
    s.push('</g>');
    /* 5) 手工管线层（本模块自有状态，不写回 tlDiagramData） */
    s.push('<g id="tlWsManual">' + manualSVG(T) + '</g>');
    /* 6) 进行中折线预览 */
    s.push('<g id="tlWsPreview"></g>');
    /* 最不利路径标注（第四十七轮）：水源 → 最远分区（总管段 + 该区主管，支管不标），与水泵扬程同源 */
    /* ⚠ 签名适配：本文件 T 是「点对象」签名 T(p)；而 tlWorstPathMarkSVG 用的是简图 ts 的
       「两参数」签名 ts(x,y)。直接传 T 会让 p 收到数字 → p.x 为 undefined → 坐标全 NaN
       （浏览器逐条报 <path> attribute d: Expected number）。故包一层适配器。 */
    try {
      if (global.tlWorstPathMarkSVG) s.push(global.tlWorstPathMarkSVG(function (x, y) { return T({ x: x, y: y }); }));
    } catch (e) { }
    s.push('</svg>');
    viewState = { k: K, ox: ox, oy: oy, w: W, h: H, snapPts: collectSnapPts(data), poly: poly, base: false };
    return s.join('');
  }

  /* ---------- 自动管线图面编辑覆盖层（2026-09-15 阶段2）----------
   * 仅在「三级简图底图克隆」路径叠加（自绘底图不画自动管线，拾取亦不启用）：
   * ① 改长管线按简图原色重画有效几何 + 琥珀长度标注；
   * ② 配件标记（三通/阀门，按沿管弧长定位在有效几何上，改长随动/clamp）；
   * ③ 选中高亮（琥珀虚线加粗）。 */
  var AUTO_STYLE = { front: { c: '#f97316', w: 6 }, main: { c: '#185FA5', w: 5 }, branch: { c: '#16a34a', w: 3 } };
  function autoStyle(pid) { return AUTO_STYLE[pid === 'front' ? 'front' : (pid.indexOf('main-') === 0 ? 'main' : 'branch')]; }
  function autoSVG(T) {
    var data = lastDataRef;
    if (!data) return '';
    var s = [];
    /* 1) 改长后的管线（有效几何） */
    var lm = AE.lensMap();
    Object.keys(lm).forEach(function (pid) {
      var epts = AE.effPts(pid, data);
      if (!epts) return;
      var st = autoStyle(pid);
      var d = '';
      epts.forEach(function (p, i) { var q = T(p); d += (i ? 'L' : 'M') + fmt(q.x) + ' ' + fmt(q.y); });
      s.push('<path d="' + d + '" fill="none" stroke="' + st.c + '" stroke-width="' + st.w + '" stroke-linecap="round" stroke-linejoin="round"/>');
      var mid = epts[Math.floor(epts.length / 2)], mq = T(mid);
      s.push('<text x="' + fmt(mq.x + 6) + '" y="' + fmt(mq.y - 4) + '" font-size="9" font-family="system-ui" fill="#b45309">' + esc(AE.polylineLen(epts).toFixed(1) + 'm') + '</text>');
    });
    /* 1b) 改径标注（2026-09-16 阶段2e）：琥珀虚线套壳 + Ø 数值（对齐施工编辑器口径） */
    var cm = AE.calibersMap ? AE.calibersMap() : {};
    Object.keys(cm).forEach(function (pid) {
      var epts = AE.effPts(pid, data);
      if (!epts) return;
      var st = autoStyle(pid);
      var d = '';
      epts.forEach(function (p, i) { var q = T(p); d += (i ? 'L' : 'M') + fmt(q.x) + ' ' + fmt(q.y); });
      s.push('<path data-tlcal="' + esc(pid) + '" d="' + d + '" fill="none" stroke="#f59e0b" stroke-width="' + (st.w + 2.6) + '" stroke-dasharray="10,5" stroke-linecap="round" stroke-linejoin="round" opacity="0.55" pointer-events="none"/>');
      var mid = epts[Math.floor(epts.length / 2)], mq = T(mid);
      s.push('<text data-tlcaltxt="' + esc(pid) + '" x="' + fmt(mq.x + 6) + '" y="' + fmt(mq.y + 12) + '" font-size="9.5" font-family="system-ui" font-weight="700" fill="#b45309" paint-order="stroke" stroke="#fff" stroke-width="2.5" pointer-events="none">Ø' + cm[pid] + '</text>');
      if (typeof window !== 'undefined' && window.tlPipeHfMark) {
        var hm = window.tlPipeHfMark(pid);
        if (hm) s.push('<text data-tlhf="' + esc(pid) + '" x="' + fmt(mq.x + 6) + '" y="' + fmt(mq.y + 24) + '" font-size="9" font-family="system-ui" font-weight="600" fill="' + hm.color + '" paint-order="stroke" stroke="#fff" stroke-width="2.5" pointer-events="none">' + esc(hm.text) + '</text>');
      }
    });
    /* 2) 配件标记（三通/阀门） */
    (AE.fitsList() || []).forEach(function (f) {
      var pos = AE.pointAt(f.pid, data, f.atM);
      if (!pos) return;
      var q = T(pos);
      var fSel = f.id === selFitId;
      var col = '#202020';   /* 配件符号近黑（2026-09-16 用户要求）：与彩色管线区分，且与轴测图 tee/valve 色一致 */
      var sym;
      if (f.kind === 'valve') {
        sym = '<path d="M' + fmt(q.x - 4.5) + ' ' + fmt(q.y - 3.6) + ' L' + fmt(q.x + 4.5) + ' ' + fmt(q.y + 3.6) + ' L' + fmt(q.x + 4.5) + ' ' + fmt(q.y - 3.6) + ' L' + fmt(q.x - 4.5) + ' ' + fmt(q.y + 3.6) + ' Z" fill="' + col + '" stroke="#fff" stroke-width="1.3"/>';
      } else if (f.kind === 'elbow') {
        /* 图面弯头（第七十轮）：旋转方块——与手工层弯头同款符号，吸附在管线折点/端头 */
        sym = '<rect x="' + fmt(q.x - 4.6) + '" y="' + fmt(q.y - 4.6) + '" width="9.2" height="9.2" fill="' + col + '" stroke="#fff" stroke-width="1.3" transform="rotate(45 ' + fmt(q.x) + ' ' + fmt(q.y) + ')"/>';
      } else {
        sym = '<circle cx="' + fmt(q.x) + '" cy="' + fmt(q.y) + '" r="4.6" fill="' + col + '" stroke="#fff" stroke-width="1.3"/>'
          + '<path d="M' + fmt(q.x - 6) + ' ' + fmt(q.y) + ' H' + fmt(q.x + 6) + ' M' + fmt(q.x) + ' ' + fmt(q.y) + ' V' + fmt(q.y + 6) + '" stroke="#fff" stroke-width="1.2" fill="none"/>';
      }
      var distLabels = '';
      if (fSel) {   /* 选中/拖动：距起点·距终点两段距离（和=当前有效管长，阶段2b） */
        var fepts = AE.effPts(f.pid, data);
        if (fepts) {
          var fLen = AE.polylineLen(fepts);
          var fD1 = Math.max(0, Math.min(f.atM, fLen)), fD2 = fLen - fD1;
          var fLab = function (at, tag) {
            var p2 = AE.pointAt(f.pid, data, at);
            if (!p2) return '';
            var q2 = T(p2);
            return '<text data-tlfitdist="' + tag + '" x="' + fmt(q2.x + 5) + '" y="' + fmt(q2.y - 5) + '" font-size="9.5" font-family="system-ui" font-weight="700" fill="#b45309" paint-order="stroke" stroke="#fff" stroke-width="2.5" pointer-events="none">' + esc(at.toFixed(1) + 'm') + '</text>';
          };
          distLabels = fLab(fD1 / 2, 'start') + fLab(fD1 + fD2 / 2, 'end');
        }
      }
      s.push('<g class="tl-ws-tlfit" data-tlfit="' + esc(f.id) + '">'
        + (fSel ? '<circle cx="' + fmt(q.x) + '" cy="' + fmt(q.y) + '" r="9" fill="none" stroke="#7c3aed" stroke-width="1.6" stroke-dasharray="4,3"/>' : '')
        + sym + distLabels + '</g>');
    });
    /* 3) 选中自动管线 / 同类型多选集合 高亮（第三十九轮扩展 selSet） */
    var hlSet = {};
    if (selAutoId) hlSet[selAutoId] = 1;
    selSet.forEach(function (p) { hlSet[p] = 1; });
    Object.keys(hlSet).forEach(function (pid) {
      var epts2 = AE.effPts(pid, data);
      if (!epts2) return;
      var st2 = autoStyle(pid);
      var d2 = '';
      epts2.forEach(function (p, i) { var q2 = T(p); d2 += (i ? 'L' : 'M') + fmt(q2.x) + ' ' + fmt(q2.y); });
      s.push('<path d="' + d2 + '" fill="none" stroke="#f59e0b" stroke-width="' + (st2.w + 1.4) + '" stroke-dasharray="8,4" stroke-linecap="round" stroke-linejoin="round" opacity="0.85" pointer-events="none"/>');
    });
    return s.join('');
  }

  function manualSVG(T) {
    var s = [];
    EP.list().forEach(function (m) {
      if (!m.pts || m.pts.length < 2) return;
      var col = m.kind === 'main' ? COLORS.manualMain : COLORS.manualBranch;
      var sel = m.id === selId;
      var d = '';
      m.pts.forEach(function (p, i) { var q = T(p); d += (i ? 'L' : 'M') + fmt(q.x) + ' ' + fmt(q.y); });
      s.push('<g class="tl-ws-man" data-man="' + esc(m.id) + '">');
      s.push('<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="' + (sel ? 4 : (m.kind === 'main' ? 2.6 : 1.6)) + '" stroke-linecap="round" stroke-linejoin="round" opacity="0.95"' + (sel ? ' stroke-dasharray="8,4"' : '') + '/>');
      /* 顶点小方块（区别自动管的“设计痕迹”） */
      m.pts.forEach(function (p) { var q = T(p); s.push('<rect x="' + fmt(q.x - 1.8) + '" y="' + fmt(q.y - 1.8) + '" width="3.6" height="3.6" fill="#fff" stroke="' + col + '" stroke-width="1"/>'); });
      /* 长度标注（米）；选中时加「已选」提示 */
      var mid = m.pts[Math.floor(m.pts.length / 2)], mq = T(mid);
      s.push('<text x="' + fmt(mq.x + 6) + '" y="' + fmt(mq.y - 4) + '" font-size="9" fill="' + (sel ? '#7c3aed' : COLORS.label) + '" font-family="system-ui"' + (sel ? ' font-weight="700"' : '') + '>' + esc(m.id + ' ' + m.len.toFixed(1) + 'm' + (sel ? ' · 已选' : '')) + '</text>');
      s.push('</g>');
    });
    /* 手工配件（三通/弯头 MP-F##，2026-09-16）：右键配件 = 接管道/换向/删除菜单 */
    (EP.fitsList ? EP.fitsList() : []).forEach(function (f) {
      var a = EP.fitPos(f.id);
      if (!a) return;
      var q = T(a), fSel = f.id === selManFitId;
      var col = f.kind === 'tee' ? COLORS.manTee : (f.kind === 'valve' ? COLORS.manValve : COLORS.manElbow);
      var sym;
      if (f.kind === 'valve') {
        /* 手工阀门（第七十轮）：与图面层同款蝶形符号，靛青配色 */
        sym = '<path d="M' + fmt(q.x - 4.5) + ' ' + fmt(q.y - 3.6) + ' L' + fmt(q.x + 4.5) + ' ' + fmt(q.y + 3.6) + ' L' + fmt(q.x + 4.5) + ' ' + fmt(q.y - 3.6) + ' L' + fmt(q.x - 4.5) + ' ' + fmt(q.y + 3.6) + ' Z" fill="' + col + '" stroke="#fff" stroke-width="1.3"/>';
      } else if (f.kind === 'tee') {
        sym = '<circle cx="' + fmt(q.x) + '" cy="' + fmt(q.y) + '" r="4.6" fill="' + col + '" stroke="#fff" stroke-width="1.3"/>'
            + '<path d="M' + fmt(q.x - 6) + ' ' + fmt(q.y) + ' H' + fmt(q.x + 6) + ' M' + fmt(q.x) + ' ' + fmt(q.y) + ' V' + fmt(q.y + 6) + '" stroke="#fff" stroke-width="1.2" fill="none"/>';
      } else {
        sym = '<rect x="' + fmt(q.x - 4.6) + '" y="' + fmt(q.y - 4.6) + '" width="9.2" height="9.2" fill="' + col + '" stroke="#fff" stroke-width="1.3" transform="rotate(45 ' + fmt(q.x) + ' ' + fmt(q.y) + ')"/>';
      }
      s.push('<g class="tl-ws-manfit" data-manfit="' + esc(f.id) + '">'
        + (fSel ? '<circle cx="' + fmt(q.x) + '" cy="' + fmt(q.y) + '" r="9" fill="none" stroke="#e11d48" stroke-width="1.6" stroke-dasharray="4,3"/>' : '')
        + sym
        + (fSel ? '<text x="' + fmt(q.x + 7) + '" y="' + fmt(q.y - 6) + '" font-size="9" font-weight="700" fill="#e11d48" font-family="system-ui" paint-order="stroke" stroke="#fff" stroke-width="2.5">已选 · 右键接管道</text>' : '')
        + '</g>');
    });
    return s.join('');
  }

  /* ---------- DOM / 视口 ---------- */
  function currentCTN() {
    if (typeof document === 'undefined') return null;   // Node 单测无 DOM
    return document.getElementById('tlWsContent');
  }
  function currentEL(ctn) { return ctn ? ctn.querySelector('svg') : null; }
  /* 2026-09-17（第五十三轮，用户要求取消该显示）：百分之元素 tlWsZoomPct 已移除，
     原 zoomPctEl 取值函数与 applyView 内的百分比写入行一并删除。 */

  function applyView(ctn, el) {
    el.style.transformOrigin = '0 0';
    el.style.transform = 'translate(' + fmt(view.x) + 'px,' + fmt(view.y) + 'px) scale(' + fmt(view.z) + ')';
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
    /* ★ 2026-09-17（第四十二轮修正）：新 svg 必须继承旧 svg 的「铺满容器」尺寸。
       renderSVG 产出的 svg 只有 viewBox / preserveAspectRatio、没有 width/height 属性，
       铺满容器靠 baseFit() 写内联样式；重建时不补这一笔，新 svg 会落回 CSS 默认尺寸
       （宽 = 容器宽、高 = 按 viewBox 等比），画布内 letterbox 随之变化 → 整幅图在屏幕上跳位，
       而拾取 / 拖拽用的屏幕坐标与 getScreenCTM 基准随之错位（实测：点选管线后拖动失效，
       拖拽退化成画布平移；_autodrag 的 A4、_fitdrag 的 D4 报红）。
       窗口尺寸变化另有 resize 监听 baseFit+applyView 兜底，故此处继承旧值安全。 */
    if (el.style.width && el.style.height) {
      fresh.style.width = el.style.width; fresh.style.height = el.style.height;
    } else {
      baseFit(ctn, fresh);
    }
    el.parentNode.replaceChild(fresh, el);
    applyView(ctn, fresh);
    wireInteractions(ctn);
    updateCalChip('tlWsCalChip');
    if (selGroup !== null) applyGroupHighlight();     // 分组高亮在局部重渲染后保持
  }
  function commitDraft() {
    if (!draft || draft.pts.length < 2) { draft = null; updatePreview(); return false; }
    var m = EP.add(draft.kind, draft.pts, 'ws');   // 共享层 add → onChange 广播 → 本视图订阅重渲染
    draft = null;
    updatePreview();
    return !!m;
  }
  function cancelDraft() { draft = null; updatePreview(); }
  function undo() {
    return EP.removeLast('ws');
  }
  function clearManual() {
    return EP.clear('ws');
  }
  function setMode(m) {
    if (m !== 'main' && m !== 'branch') m = null;
    if (mode === m) m = null;                    // 再点同款 = 退出插入模式
    mode = m;
    if (mode) clearFitMode();                    // 与配件插入模式互斥（第七十轮）
    if (!mode) cancelDraft();
    if (mode && multiMode) setMultiMode(false);   // 进插入模式自动退出多选（第五十八轮），否则点管身没反应
    updatePreview();
    return mode;
  }
  /* 配件插入模式（2026-09-18 第七十轮，用户要求「右侧工具栏增加阀门/三通/弯头插入按钮」）：
     工具轨点按钮进入 → 点管线即在点击处插入 → 弯头吸附到该管线最近的折点/端头 → 再点同按钮或 Esc 退出。
     与画线模式 mode 互斥（点管线不会被拖管/加选抢走）；插入后保持模式，可连续布点。
     ★ 所有写入都落在共享 AE/EP 层（不走 tlDiagramData），不进水力计算与材料清单（红线不变）。 */
  function clearFitMode() {
    if (!fitMode) return fitMode;
    fitMode = null;
    if (typeof api.onFitModeChange === 'function') api.onFitModeChange(null);
    return fitMode;
  }
  function setFitMode(m) {
    if (m !== 'valve' && m !== 'tee' && m !== 'elbow') m = null;
    if (fitMode === m) m = null;                 // 再点同款 = 退出配件插入模式
    fitMode = m;
    if (fitMode) {
      if (mode) { mode = null; cancelDraft(); updatePreview(); if (typeof api.onModeChange === 'function') api.onModeChange(null); }
      if (multiMode) setMultiMode(false);        // 多选开关会把「点管身」吃掉
    }
    if (typeof api.onFitModeChange === 'function') api.onFitModeChange(fitMode);
    return fitMode;
  }
  function notifyChange() {
    if (typeof api.onManualChange === 'function') api.onManualChange(EP.count());
  }

  /* ---------- 拾取 / 选中 / 改长 / 删除（2026-09-15 阶段1）---------- */
  function selectedEntry() {
    var list = EP.list();
    for (var i = 0; i < list.length; i++) if (list[i].id === selId) return list[i];
    return null;
  }
  function selInfo() {
    var m = selectedEntry();
    if (m) return { id: m.id, kind: m.kind, kindLabel: m.kind === 'main' ? '主管' : '支管', len: m.len, pts: m.pts.length };
    /* 手工配件选中信息（MP-F##，2026-09-16） */
    if (selManFitId) {
      var mf = EP.fitById ? EP.fitById(selManFitId) : null;
      if (mf) {
        var fp = EP.fitPos(mf.id);
        return { manFit: true, id: mf.id, kind: mf.kind, kindLabel: MAN_FIT_LABEL[mf.kind] || '配件', pid: mf.pid, pipeName: mf.pid, atM: (mf.atM != null ? mf.atM : null), pipeLen: fp ? fp.hostLen : null };
      }
      return null;
    }
    /* 自动管线 / 图面配件选中信息（阶段2） */
    if (selFitId) {
      var f = null;
      (AE.fitsList() || []).forEach(function (x) { if (x.id === selFitId) f = x; });
      if (f) {
        var fpos = AE.pointAt(f.pid, lastDataRef, f.atM);
        return { fit: true, id: f.id, kind: f.kind, kindLabel: MAN_FIT_LABEL[f.kind] || '配件', pid: f.pid, pipeName: AE.pipeName(f.pid), atM: f.atM, pipeLen: fpos ? fpos.len : null };
      }
      return null;
    }
    if (selAutoId && lastDataRef) {
      var epts = AE.effPts(selAutoId, lastDataRef), bpts = AE.pipePts(selAutoId, lastDataRef);
      if (epts) return { auto: true, id: selAutoId, kindLabel: AE.pipeName(selAutoId), len: AE.polylineLen(epts), baseLen: bpts ? AE.polylineLen(bpts) : 0, pickAt: selAutoAt, od: AE.caliberOf ? AE.caliberOf(selAutoId) : null };
    }
    return null;
  }
  /* 点 → 最近手工管线（tolM 米容差内），未命中返回 null */
  function pickPipe(p, tolM) {
    var best = null, bd = tolM;
    EP.list().forEach(function (m) {
      for (var i = 0; m.pts && i + 1 < m.pts.length; i++) {
        var c = closestOnSeg(p, m.pts[i], m.pts[i + 1]);
        var d = Math.hypot(c.x - p.x, c.y - p.y);
        if (d < bd) { bd = d; best = m; }
      }
    });
    return best;
  }
  /* 点 → 最近手工配件（tolM 米容差），未命中 null（2026-09-16） */
  function pickManFit(p, tolM) {
    if (!EP.fitsList) return null;
    var best = null, bd = tolM;
    EP.fitsList().forEach(function (f) {
      var a = EP.fitPos(f.id);
      if (!a) return;
      var d = Math.hypot(a.x - p.x, a.y - p.y);
      if (d < bd) { bd = d; best = f; }
    });
    return best;
  }
  function selectManFit(id) {
    selId = null; selAutoId = null; selFitId = null;
    selManFitId = id || null;
    rerenderKeepView();
    if (typeof api.onPipeSelect === 'function') api.onPipeSelect(selInfo());
    return selManFitId;
  }
  /* ---------- 手工配件右键菜单（2026-09-16）：接管道（默认 1m，选中即改长）/换向/删除 ---------- */
  var ctxMenuEl = null;
  function closeCtxMenu() { if (ctxMenuEl) ctxMenuEl.style.display = 'none'; }
  function openCtxMenu(x, y, items) {
    if (typeof document === 'undefined') return;
    if (!ctxMenuEl) {
      ctxMenuEl = document.createElement('div');
      ctxMenuEl.id = 'tlWsManFitMenu';
      ctxMenuEl.style.cssText = 'display:none;position:fixed;z-index:9999;background:#fff;border:1px solid #cbd5e1;border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,.18);padding:4px;min-width:150px;font:12px/1.7 system-ui,sans-serif;color:#1f2937';
      document.body.appendChild(ctxMenuEl);
      document.addEventListener('click', closeCtxMenu, true);
      window.addEventListener('blur', closeCtxMenu);
    }
    var h = '';
    items.forEach(function (it, i) {
      h += '<button type="button" data-mfi="' + i + '" style="display:block;width:100%;text-align:left;border:0;background:none;padding:4px 10px;cursor:pointer;border-radius:4px;font:inherit;color:inherit">' + esc(it.label) + '</button>';
    });
    ctxMenuEl.innerHTML = h;
    ctxMenuEl.onclick = function (e) {
      var b = e.target.closest ? e.target.closest('button[data-mfi]') : null;
      if (!b) return;
      var it = items[Number(b.getAttribute('data-mfi'))];
      closeCtxMenu();
      if (it && typeof it.fn === 'function') it.fn();
    };
    ctxMenuEl.style.display = 'block';
    ctxMenuEl.style.left = Math.max(4, Math.min(x, window.innerWidth - 170)) + 'px';
    ctxMenuEl.style.top = Math.max(4, y) + 'px';
    var r = ctxMenuEl.getBoundingClientRect();
    if (r.bottom > window.innerHeight - 8) ctxMenuEl.style.top = Math.max(4, window.innerHeight - r.height - 12) + 'px';
  }
  /* 接管道：从配件锚点引出新管段（宿主管 kind，默认 5m，创建即选中 → 工具栏改长可直接输入）。
     挂 branchId 链到配件：配件（沿管弧长/换向）或宿主管移动时，syncBranchPipes 把支管起点对齐锚点整体平移。 */
  var BRANCH_SPAWN_LEN = 5;   /* 接管道引出长度（米）：菜单文案与几何共用同一处，防再次漂移 */
  function attachBranchPipe(fitId) {
    var a = EP.fitPos(fitId);
    if (!a || !a.dir) return null;
    var m = EP.add(a.kind, [{ x: a.x, y: a.y }, { x: a.x + a.dir.x * BRANCH_SPAWN_LEN, y: a.y + a.dir.y * BRANCH_SPAWN_LEN }], 'ws');
    if (m) {
      var f0 = EP.fitById(fitId); if (f0) f0.branchId = m.id;   // 链：三通 <-> 支管（深拷贝序列化自动持久化）
      select(m.id);
    }
    return m;
  }
  /* 自动配件（A-F## 三通/阀门）接管道：从配件锚点沿管线切线垂直方向（屏幕朝上侧）引出 5m 手动支管
     （默认 5m，创建即选中 → 工具栏改长可直接输入，与手工配件 attachBranchPipe 同口径）；
     走手工管层（EP），不写回 tlDiagramData → 轴测图/三级简图/材料清单数据不受影响；可继续右键延长/改长（链式） */
  function attachAutoBranchPipe(fitId) {
    var f = null;
    (AE.fitsList() || []).forEach(function (x) { if (x.id === fitId) f = x; });
    if (!f || !lastDataRef) return null;
    var a = AE.pointAt(f.pid, lastDataRef, f.atM);
    if (!a) return null;
    var pts = AE.effPts(f.pid, lastDataRef);
    var L = AE.polylineLen(pts);
    var p1 = AE.pointAt(f.pid, lastDataRef, Math.max(0, f.atM - 0.05));
    var p2 = AE.pointAt(f.pid, lastDataRef, Math.min(L, f.atM + 0.05));
    var tx = p2.x - p1.x, ty = p2.y - p1.y;
    var tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    /* 垂直方向两组，取「屏幕朝上侧」（y 为负）的一支；平局取 x 负（左） */
    var c0 = { x: -ty, y: tx }, c1 = { x: ty, y: -tx };
    var bd = c0;
    if (c0.y > 0 && c1.y < 0) bd = c1;
    else if (c0.y >= 0 && c0.y === c1.y && c0.x > 0) bd = c1;
    var m = EP.add('branch', [{ x: a.x, y: a.y }, { x: a.x + bd.x * BRANCH_SPAWN_LEN, y: a.y + bd.y * BRANCH_SPAWN_LEN }], 'ws');
    if (m) { f.branchId = m.id; select(m.id); }   // 链：自动三通/阀门 <-> 支管
    return m;
  }
  /* 点在管线上的沿管弧长（米） */
  function alongOnPts(pts, p) {
    var total = 0, best = Infinity, along = 0;
    for (var i = 0; i + 1 < pts.length; i++) {
      var c = closestOnSeg(p, pts[i], pts[i + 1]);
      var d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < best) { best = d; along = total + Math.hypot(c.x - pts[i].x, c.y - pts[i].y); }
      total += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    }
    return along;
  }
  function openManFitMenu(fitId, x, y) {
    var f = EP.fitById(fitId);
    if (!f) return;
    var items = [];
    /* 内部拐点弯头（f.vi）没有「延伸出去的端头」，接管道会画在自身管身上 → 不给这一项（第七十轮） */
    if (f.kind === 'tee' || (f.kind === 'elbow' && !Number.isInteger(f.vi))) items.push({ label: ('🔗 接管道（默认 ' + BRANCH_SPAWN_LEN + 'm）'), fn: function () { attachBranchPipe(fitId); } });
    if (f.kind === 'tee') items.push({ label: '⇄ 分支换向', fn: function () { EP.flipFit(fitId, 'ws'); } });
    items.push({ label: '🗑 删除' + (MAN_FIT_LABEL[f.kind] || '配件'), fn: function () {
      if (f.branchId) EP.remove(f.branchId, 'ws');   // 删三通连带删接出的支管
      EP.removeFit(fitId, 'ws');
      if (selManFitId === fitId) { selManFitId = null; if (typeof api.onPipeSelect === 'function') api.onPipeSelect(null); }
    } });
    openCtxMenu(x, y, items);
  }
  /* 自动配件（三通/阀门）右键菜单：接管道（默认 1m）/ 删除（2026-09-16 补：原只有手工配件才接管道） */
  function openAutoFitMenu(fitId, x, y) {
    var f = null;
    (AE.fitsList() || []).forEach(function (z) { if (z.id === fitId) f = z; });
    if (!f) return;
    var items = [];
    if (f.kind === 'tee' && AE.setFitSpin) {   /* 图面三通第三口旋转（2026-09-16，与轴测图同源 AE.spin） */
      items.push({ label: '↻ 第三口 +15°（绕管道轴）', fn: function () { AE.setFitSpin(fitId, (AE.fitSpinOf(fitId) || 0) + 15, 'ws-menu'); } });
      items.push({ label: '↺ 第三口 -15°（绕管道轴）', fn: function () { AE.setFitSpin(fitId, (AE.fitSpinOf(fitId) || 0) - 15, 'ws-menu'); } });
      items.push({ label: '⌂ 复位第三口（垂直管道）', fn: function () { AE.setFitSpin(fitId, 0, 'ws-menu'); } });
    }
    items.push({ label: ('🔗 接管道（默认 ' + BRANCH_SPAWN_LEN + 'm）'), fn: function () { attachAutoBranchPipe(fitId); } });
    items.push({ label: '🗑 删除' + (MAN_FIT_LABEL[f.kind] || '配件'), fn: function () {
      if (f.branchId) EP.remove(f.branchId, 'ws');   // 删三通/阀门连带删接出的支管
      var ok = AE.removeFitting(fitId, 'ws');
      if (ok) { if (selFitId === fitId) selFitId = null; rerenderKeepView(); if (typeof api.onPipeSelect === 'function') api.onPipeSelect(null); }
    } });
    openCtxMenu(x, y, items);
  }
  function openManPipeMenu(m, raw, x, y) {
    var d0 = Math.hypot(raw.x - m.pts[0].x, raw.y - m.pts[0].y);
    var dn = Math.hypot(raw.x - m.pts[m.pts.length - 1].x, raw.y - m.pts[m.pts.length - 1].y);
    var endIdx = d0 <= dn ? 0 : 1;
    var items = [
      { label: '＋ 在此处加三通', fn: function () { EP.addFit('tee', m.id, { atM: alongOnPts(m.pts, raw) }, 'ws'); } },
      { label: '⌐ ' + (endIdx ? '终点' : '起点') + '加弯头', fn: function () { EP.addFit('elbow', m.id, { end: endIdx }, 'ws'); } },
      { label: '✎ 改长度…', fn: function () {
          var info = selInfo();
          var v = prompt('新总长度（米）——前段保持不动，末段沿原方向拉伸/收缩', info && info.len != null ? info.len.toFixed(1) : '1');
          if (v === null) return;
          if (!setSelLength(parseFloat(v))) alert('改长失败：请输入大于前段总长的正数');
        } },
      { label: '🗑 删除管线', fn: function () { EP.remove(m.id, 'ws'); } }
    ];
    openCtxMenu(x, y, items);
  }
  function select(id) {
    selId = id || null;
    if (selId) { selAutoId = null; selFitId = null; }   // 手工选中与自动/配件互斥（阶段2）
    rerenderKeepView();          // 重画高亮（虚线加粗）
    if (typeof api.onPipeSelect === 'function') api.onPipeSelect(selInfo());
    return selId;
  }
  /* 选中自动管线（pid + 点击位置沿管弧长）（阶段2） */
  function selectAuto(pid, along) {
    selId = null; selFitId = null;
    selAutoId = pid || null; selAutoAt = along || 0;
    rerenderKeepView();
    if (typeof api.onPipeSelect === 'function') api.onPipeSelect(selInfo());
    return selAutoId;
  }
  /* 选中图面配件（A-F##）（阶段2） */
  function selectFit(id) {
    selId = null; selAutoId = null;
    selFitId = id || null;
    rerenderKeepView();
    if (typeof api.onPipeSelect === 'function') api.onPipeSelect(selInfo());
    return selFitId;
  }
  /* 清空全部选中（点空处；保持旧「点击即重渲染+通知」口径） */
  function clearSel() {
    selId = null; selAutoId = null; selFitId = null; selManFitId = null;
    rerenderKeepView();
    if (typeof api.onPipeSelect === 'function') api.onPipeSelect(selInfo());
    exitMulti();   // 清空选中同时退出多选（第三十九轮）
  }
  /* 同类型管道多选（2026-09-17 第三十九轮）：selSet 存自动管线 pid；整体改径 + 长度求和 */
  function pipeType(pid) { return pid === 'front' ? 'front' : (String(pid).indexOf('main-') === 0 ? 'main' : 'branch'); }
  function exitMulti() {
    if (selSet.length) {
      selSet = [];
      if (typeof api.onMultiSelect === 'function') api.onMultiSelect(null);
    }
  }
  function selSetInfo() {
    if (!selSet.length || !lastDataRef) return null;
    var total = 0;
    selSet.forEach(function (pid) {
      var epts = AE.effPts(pid, lastDataRef);
      if (epts) total += AE.polylineLen(epts);
    });
    return { count: selSet.length, type: pipeType(selSet[0]), totalLen: total, pids: selSet.slice() };
  }
  function toggleSelSet(pid) {
    if (!lastDataRef || !pid) return;
    var t = pipeType(pid);
    selId = null; selAutoId = null; selFitId = null; selManFitId = null;   // 多选态只以 selSet 高亮
    if (selSet.length && pipeType(selSet[0]) !== t) selSet = [pid];        // 不同类型 → 重置为新类型起点
    else {
      var i = selSet.indexOf(pid);
      if (i >= 0) selSet.splice(i, 1); else selSet.push(pid);
    }
    rerenderKeepView();
    if (typeof api.onPipeSelect === 'function') api.onPipeSelect(null);
    if (typeof api.onMultiSelect === 'function') api.onMultiSelect(selSetInfo());
  }
  function deleteSelected() {
    if (selManFitId) { var okf = EP.removeFit(selManFitId, 'ws'); selManFitId = null; return okf; }   // 手工配件（2026-09-16）
    if (!selId) return false;
    var ok = EP.remove(selId, 'ws');
    selId = null;
    return ok;
  }
  /* 就地改长：前段保持不动，末段沿原方向拉伸/收缩到目标总长（米） */
  function setSelLength(v) {
    var L = Number(v);
    if (!isFinite(L) || L <= 0) return false;
    if (selAutoId) return AE.setLen(selAutoId, L, lastDataRef, 'ws');   // 自动管线：共享编辑层覆盖式改长（阶段2）
    var m = selectedEntry();
    if (!m || !EP.update) return false;
    var pts = m.pts;
    if (!pts || pts.length < 2) return false;
    var fixed = 0;
    for (var i = 0; i + 2 < pts.length; i++) fixed += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    if (L <= fixed + 0.05) return false;   // 目标总长 ≤ 已有前段和，无法只动末段
    var ok = EP.update(m.id, function (e) {
      var p = e.pts;
      var dx = p[p.length - 1].x - p[p.length - 2].x, dy = p[p.length - 1].y - p[p.length - 2].y;
      var dl = Math.hypot(dx, dy) || 1;
      var seg = L - fixed;
      p[p.length - 1] = { x: p[p.length - 2].x + dx / dl * seg, y: p[p.length - 2].y + dy / dl * seg };
      e.len = Math.round(L * 100) / 100;
    }, 'ws');
    return !!ok;
  }

  /* ---------- 自动管线拾取（共享编辑层，2026-09-15 阶段2）---------- */
  function rawDataPoint(el, e) {
    var u = svgUserPoint(el, e.clientX, e.clientY);
    if (!u || !viewState) return null;
    return userToData(u);
  }
  /* 点 → 最近自动管线（有效几何，tolM 米）：{pid, along}；仅底图克隆路径启用 */
  function pickAutoPipe(p, tolM) {
    var data = lastDataRef;
    if (!data || !viewState || !viewState.base) return null;
    var best = null, bd = tolM;
    AE.allPids(data).forEach(function (pid) {
      var epts = AE.effPts(pid, data);
      if (!epts) return;
      for (var i = 0; i + 1 < epts.length; i++) {
        var c = closestOnSeg(p, epts[i], epts[i + 1]);
        var d = Math.hypot(c.x - p.x, c.y - p.y);
        if (d < bd) {
          bd = d;
          var loc = AE.locate(pid, data, c);
          best = { pid: pid, along: loc ? loc.along : 0 };
        }
      }
    });
    return best;
  }
  /* 点 → 最近图面配件（tolM 米）：配件标记在管线上方，先于管线命中 */
  function pickAutoFit(p, tolM) {
    var data = lastDataRef;
    if (!data || !viewState || !viewState.base) return null;
    var best = null, bd = Math.max(tolM, 0.8);
    (AE.fitsList() || []).forEach(function (f) {
      var pos = AE.pointAt(f.pid, data, f.atM);
      if (!pos) return;
      var d = Math.hypot(pos.x - p.x, pos.y - p.y);
      if (d < bd) { bd = d; best = f; }
    });
    return best;
  }

  /* ---------- 配件插入模式的命中小工具（2026-09-18 第七十轮）---------- */
  /* 点 → 最近管线（自动层 AE + 手工层 EP 一起比，取真正最近的）：
     {layer:'auto', pid, along} | {layer:'manual', id, atM, pts}；未命中返回 null。 */
  function pickAnyPipe(p, tolM) {
    var best = null, bd = tolM;
    function consider(d, rec) { if (d < bd) { bd = d; best = rec; } }
    EP.list().forEach(function (m) {
      if (!m.pts || m.pts.length < 2) return;
      var pre = 0;
      for (var i = 0; i + 1 < m.pts.length; i++) {
        var c = closestOnSeg(p, m.pts[i], m.pts[i + 1]);
        consider(Math.hypot(c.x - p.x, c.y - p.y), { layer: 'manual', id: m.id, pts: m.pts,
          atM: pre + Math.hypot(c.x - m.pts[i].x, c.y - m.pts[i].y) });
        pre += Math.hypot(m.pts[i + 1].x - m.pts[i].x, m.pts[i + 1].y - m.pts[i].y);
      }
    });
    if (lastDataRef && viewState && viewState.base) {
      AE.allPids(lastDataRef).forEach(function (pid) {
        var epts = AE.effPts(pid, lastDataRef);
        if (!epts) return;
        for (var i = 0; i + 1 < epts.length; i++) {
          var c = closestOnSeg(p, epts[i], epts[i + 1]);
          var loc = AE.locate(pid, lastDataRef, c);
          consider(Math.hypot(c.x - p.x, c.y - p.y), { layer: 'auto', pid: pid, pts: epts, along: loc ? loc.along : 0 });
        }
      });
    }
    return best;
  }
  /* 折线上距 p 最近的顶点（端头或内部拐点）→ {vi, atM, end}：弯头落点吸附用 */
  function nearestVertex(pts, p) {
    if (!pts || !pts.length) return null;
    var best = -1, bd = Infinity;
    for (var i = 0; i < pts.length; i++) {
      var d = Math.hypot(pts[i].x - p.x, pts[i].y - p.y);
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0) return null;
    var pre = 0;
    for (var j = 0; j < best; j++) pre += Math.hypot(pts[j + 1].x - pts[j].x, pts[j + 1].y - pts[j].y);
    return { vi: best, atM: pre, end: (best === 0 ? 0 : (best === pts.length - 1 ? 1 : null)) };
  }
  /* 插入配件：命中记录 → 新配件 id（写共享层并广播，两视图自动重渲染），失败返回 null。
     自动管线写 AE（tee/valve/elbow 全支持）；手工管线写 EP（弯头用 end/vi，其余用弧长 atM）。 */
  function insertFitAt(hit, p) {
    if (!hit || !fitMode) return null;
    var kind = fitMode, id = null;
    if (hit.layer === 'auto' && lastDataRef) {
      var at = hit.along;
      if (kind === 'elbow') {                    // 弯头：吸附到该管线最近的折点/端头
        var nv = nearestVertex(AE.effPts(hit.pid, lastDataRef) || [], p || { x: 0, y: 0 });
        if (nv) at = nv.atM;
      }
      var nf = AE.addFitting(kind, hit.pid, at, lastDataRef, 'ws');
      if (nf) { selManFitId = null; id = nf.id; selectFit(id); }
    } else if (hit.layer === 'manual') {
      var mf = null;
      if (kind === 'elbow') {
        var m = EP.pipeById ? EP.pipeById(hit.id) : null;
        var nv2 = nearestVertex((m && m.pts) || [], p || { x: 0, y: 0 });
        if (nv2 && nv2.end !== null) mf = EP.addFit('elbow', hit.id, { end: nv2.end }, 'ws');
        else if (nv2) mf = EP.addFit('elbow', hit.id, { vi: nv2.vi }, 'ws');   // 内部拐点
      } else {
        mf = EP.addFit(kind, hit.id, { atM: hit.atM }, 'ws');
      }
      if (mf) { id = mf.id; selectManFit(id); }
    }
    return id;
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

  /* ---------- 横竖锁定（2026-09-16）：新点约束为与上一点水平/垂直 ----------
   * 取 |dx|、|dy| 中较大者的轴（偏差小的方向让位）；吸附点恰可直连（已横/竖）原样保留。
   * force：undefined = 按 orthoLock 开关；布尔 = 按住 Shift 临时取反。 */
  function applyOrtho(p, force) {
    if (!p) return p;
    var on = (force === undefined) ? orthoLock : force;
    if (!on || !draft || !draft.pts.length) return p;
    var last = draft.pts[draft.pts.length - 1];
    if (p.x === last.x || p.y === last.y) return p;
    return Math.abs(p.x - last.x) >= Math.abs(p.y - last.y)
      ? { x: p.x, y: last.y }
      : { x: last.x, y: p.y };
  }
  /* ---------- 预览（进行中折线 + 吸附提示） ---------- */
  function updatePreview(cursorData, noSnap) {
    var ctn = currentCTN(); if (!ctn) return;
    var g = ctn.querySelector('#tlWsPreview'); if (!g) return;
    if (!draft || !viewState) { g.innerHTML = ''; return; }
    var pts = draft.pts.slice();
    var snapHit = null;
    if (cursorData) {
      var el = currentEL(ctn);
      var tolM = snapTolUnits(el) / viewState.k;
      var hit = noSnap ? cursorData : pickSnap(cursorData, viewState.snapPts, tolM);
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
      suppressAutoPick = false;                  // 每次按下重新开始（第五十八轮）
      /* 配件插入模式（2026-09-18 第七十轮）：工具轨已选好类型 → 点管线即在点击处插入。
         必须排在配件拖动/管身拖动/平移之前，否则点管身会被它们截走；
         点空白不退出模式（便于连续布点），退出靠再点按钮或 Esc。 */
      if (e.button === 0 && fitMode && !mode && viewState && viewState.base && lastDataRef) {
        var rawFitPt = rawDataPoint(el, e);
        if (rawFitPt) {
          var hitFit = pickAnyPipe(rawFitPt, snapTolUnits(el) / viewState.k * 1.5);
          if (hitFit) insertFitAt(hitFit, rawFitPt);
        }
        e.preventDefault();
        return;
      }
      /* 配件沿管拖动（阶段2b）：左键按在图面配件上 → 进入拖动（平移让位）；capture 挂容器（重渲染不丢） */
      if (e.button === 0 && !mode && viewState && viewState.base && lastDataRef) {
        var rawD = rawDataPoint(el, e);
        var grabTol = snapTolUnits(el) / viewState.k;
        var gf = rawD ? pickAutoFit(rawD, grabTol) : null;
        if (gf) {
          fitDrag = { id: gf.id, pointerId: e.pointerId, atM: gf.atM };
          selectFit(gf.id);                       // 拖动即选中（卡/输入框随之显示）
          if (ctn.setPointerCapture) { try { ctn.setPointerCapture(e.pointerId); } catch (err2) {} }
          e.preventDefault();
          return;
        }
      }
      /* 手工配件按下（2026-09-16）：选中即止（不进入管身拖动；接管道走右键菜单） */
      if (e.button === 0 && !mode && viewState && viewState.base && lastDataRef) {
        var rawF = rawDataPoint(el, e);
        var mfp = rawF ? pickManFit(rawF, snapTolUnits(el) / viewState.k * 0.6) : null;
        if (mfp) { selectManFit(mfp.id); e.preventDefault(); return; }
      }
      /* 整条拖动手工管线（2026-09-16）：按在管线上 → 拖动平移（平移让位）；只点不拖 = 选中 */
      if (e.button === 0 && !mode && viewState && viewState.base && lastDataRef) {
        var rawPipe = rawDataPoint(el, e);
        var mp = rawPipe ? pickPipe(rawPipe, snapTolUnits(el) / viewState.k * 1.2) : null;
        if (mp) {
          if (selId !== mp.id) select(mp.id);     // 拖哪条选哪条（信息卡/改长/删除随之）
          pipeDrag = { id: mp.id, pointerId: e.pointerId, last: rawPipe, acc: { x: 0, y: 0 }, moved: false,
                       sx: e.clientX, sy: e.clientY };
          if (ctn.setPointerCapture) { try { ctn.setPointerCapture(e.pointerId); } catch (err3) {} }
          e.preventDefault();
          return;
        }
      }
      /* 整条拖动自动管线（2026-09-16）：图面平移覆盖（AE.moves，不改 tlDiagramData/管长，红线安全） */
      if (e.button === 0 && !mode && viewState && viewState.base && lastDataRef) {
        var rawAuto = rawDataPoint(el, e);
        var apd = rawAuto ? pickAutoPipe(rawAuto, snapTolUnits(el) / viewState.k * 1.2) : null;
        if (apd) {
          /* ★ 多选（2026-09-17 第五十八轮开关；第三十九轮 Ctrl/⌘ 捷径）必须放在这里：
             自动管线命中后本分支会 setPointerCapture + preventDefault，真实鼠标路径下随后的
             click 事件到不了容器（实测 3 次 pointerdown / 0 次 click）—— 判定写在 click 里
             等于「按钮点了没反应」，第三十九轮的 Ctrl+点 同因失效（只对测试的手工派发生效）。 */
          if (multiMode || e.ctrlKey || e.metaKey) {
            toggleSelSet(apd.pid);             // 同类型加选 / 再点取消该段
            suppressAutoPick = true;           // 三段派发（测试路径）时 click 也会到，避免二次切换
            e.preventDefault();
            return;
          }
          selectAuto(apd.pid, apd.along);         // 拖哪条选哪条（信息卡/改长/右键菜单随之）
          autoDrag = { pid: apd.pid, pointerId: e.pointerId, last: rawAuto, acc: { x: 0, y: 0 }, moved: false,
                       sx: e.clientX, sy: e.clientY };
          if (ctn.setPointerCapture) { try { ctn.setPointerCapture(e.pointerId); } catch (err4) {} }
          e.preventDefault();
          return;
        }
      }
      if (e.button === 1 || (e.button === 0 && !mode)) {          // 非插入模式左键 / 任意中键 = 平移
        drag = { x: e.clientX - view.x, y: e.clientY - view.y, id: e.pointerId };
        el.classList.add('tl-ws-dragging');
        if (el.setPointerCapture) { try { el.setPointerCapture(e.pointerId); } catch (err) {} }
        e.preventDefault();
      }
    });
    ctn.addEventListener('pointermove', function (e) {
      if (fitDrag && e.pointerId === fitDrag.pointerId) {         // 配件沿管拖动：沿管弧长实时跟随（rAF 节流提交）
        var elM = currentEL(ctn);
        var fM = null;
        (AE.fitsList() || []).forEach(function (x) { if (x.id === fitDrag.id) fM = x; });
        if (elM && fM && lastDataRef) {
          var rawM = rawDataPoint(elM, e);
          var locM = rawM ? AE.locate(fM.pid, lastDataRef, rawM) : null;
          if (locM) {
            fitDrag.atM = locM.along;
            if (!fitDragRaf) fitDragRaf = requestAnimationFrame(function () {
              fitDragRaf = 0;
              if (fitDrag) AE.moveFitting(fitDrag.id, fitDrag.atM, lastDataRef, 'ws');
            });
          }
        }
        return;
      }
      if (autoDrag && e.pointerId === autoDrag.pointerId) {       // 整条拖动自动管线：图面平移（AE.moves 累加）
        var elA2 = currentEL(ctn); if (!elA2) return;
        var pdA = rawDataPoint(elA2, e);
        if (!pdA) return;
        if (!autoDrag.moved && Math.hypot(e.clientX - autoDrag.sx, e.clientY - autoDrag.sy) < 3) return;  // 3px 启动阈值
        autoDrag.acc.x += pdA.x - autoDrag.last.x; autoDrag.acc.y += pdA.y - autoDrag.last.y;
        autoDrag.last = pdA; autoDrag.moved = true;
        if (!autoDragRaf) autoDragRaf = requestAnimationFrame(function () {
          autoDragRaf = 0;
          if (!autoDrag) return;
          var ax = autoDrag.acc.x, ay = autoDrag.acc.y;
          autoDrag.acc = { x: 0, y: 0 };
          if ((ax || ay) && lastDataRef) AE.movePipe(autoDrag.pid, ax, ay, lastDataRef, 'ws');  // 广播 → ws/iso 重渲染
        });
        return;
      }
      if (pipeDrag && e.pointerId === pipeDrag.pointerId) {       // 整条拖动手工管线：平移所有点（长度/形状不变）
        var elP = currentEL(ctn); if (!elP) return;
        var pd = rawDataPoint(elP, e);
        if (!pd) return;
        if (!pipeDrag.moved && Math.hypot(e.clientX - pipeDrag.sx, e.clientY - pipeDrag.sy) < 3) return;  // 3px 启动阈值（防误触）
        pipeDrag.acc.x += pd.x - pipeDrag.last.x; pipeDrag.acc.y += pd.y - pipeDrag.last.y;
        pipeDrag.last = pd; pipeDrag.moved = true;
        if (!pipeDragRaf) pipeDragRaf = requestAnimationFrame(function () {
          pipeDragRaf = 0;
          if (!pipeDrag) return;
          var ax = pipeDrag.acc.x, ay = pipeDrag.acc.y;
          pipeDrag.acc = { x: 0, y: 0 };
          if (ax || ay) EP.update(pipeDrag.id, function (m) {
            m.pts = m.pts.map(function (q) { return { x: q.x + ax, y: q.y + ay }; });   // len 不变（平移不改长度）
          }, 'ws');                                                     // 广播 → ws/iso 同步重渲染
        });
        return;
      }
      if (drag && e.pointerId === drag.id) {
        var el = currentEL(ctn); if (!el) return;
        view.x = e.clientX - drag.x; view.y = e.clientY - drag.y;
        applyView(ctn, el);
        return;
      }
      if (mode && draft) {                                        // 插入模式：预览跟随（横竖锁定：Shift 临时反向）
        var el2 = currentEL(ctn); if (!el2) return;
        var p0 = dataPointFromEvent(el2, e);
        var p1 = applyOrtho(p0, e.shiftKey ? !orthoLock : undefined);
        updatePreview(p1, p1 !== p0);
      }
    });
    function up(e) {
      if (pipeDrag && (e.pointerId === undefined || e.pointerId === pipeDrag.pointerId)) {
        if (pipeDragRaf) { cancelAnimationFrame(pipeDragRaf); pipeDragRaf = 0; }
        pipeDrag = null;
      }
      if (autoDrag && (e.pointerId === undefined || e.pointerId === autoDrag.pointerId)) {
        if (autoDragRaf) { cancelAnimationFrame(autoDragRaf); autoDragRaf = 0; }
        autoDrag = null;
      }
      if (fitDrag && (e.pointerId === undefined || e.pointerId === fitDrag.pointerId)) fitDrag = null;
      if (drag && (e.pointerId === undefined || e.pointerId === drag.id)) {
        drag = null;
        var el = currentEL(ctn); if (el) el.classList.remove('tl-ws-dragging');
      }
    }
    ctn.addEventListener('pointerup', up);
    ctn.addEventListener('pointercancel', up);

    ctn.addEventListener('click', function (e) {
      if (!downPos || Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > CLICK_PX) return;
      var el = currentEL(ctn); if (!el || !lastDataRef) return;
      if (!mode) {
        if (suppressAutoPick) { suppressAutoPick = false; return; }   // 本次按下已由 pointerdown 处理（第五十八轮多选）
        /* 非插入模式：点击拾取（阶段1 手工管线 → 阶段2 配件/自动管线）——点空处取消选中 */
        var ps = dataPointFromEvent(el, e); if (!ps) return;
        var mfit = pickManFit(ps, snapTolUnits(el) / viewState.k * 0.6);
        if (mfit) { exitMulti(); selectManFit(mfit.id); return; }  // 配件标记优先于管身（2026-09-16）
        var hit = pickPipe(ps, snapTolUnits(el) / viewState.k * 1.2);
        if (hit) { exitMulti(); select(hit.id); return; }          // 手工管线层在最上，优先命中
        if (viewState.base && lastDataRef) {
          var raw = rawDataPoint(el, e);
          var tolM2 = snapTolUnits(el) / viewState.k;
          if (raw) {
            var ff = pickAutoFit(raw, tolM2);
            if (ff) { exitMulti(); selectFit(ff.id); return; }     // 配件标记优先于所在管线
            var ap = pickAutoPipe(raw, tolM2 * 1.2);
            if (ap) {
              if (e.ctrlKey || e.metaKey) { toggleSelSet(ap.pid); return; }   // 同类型多选（第三十九轮）
              exitMulti(); selectAuto(ap.pid, ap.along); return;
            }
          }
        }
        /* 联合灌溉分组交互（2026-09-16 补全）：点分区→整组高亮；点空白取消 */
        var zt = e.target;
        if (zt && zt.getAttribute && zt.getAttribute('data-zi') != null) {
          var g = parseInt(zt.getAttribute('data-g'), 10);
          selGroup = (selGroup === g) ? null : g;
          applyGroupHighlight();
          return;
        }
        if (selGroup !== null) { selGroup = null; applyGroupHighlight(); }
        clearSel();
        return;
      }
      var p = applyOrtho(dataPointFromEvent(el, e), e.shiftKey ? !orthoLock : undefined); if (!p) return;
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
        else if (fitMode) setFitMode(null);      // Esc 退出配件插入模式（第七十轮）
        e.preventDefault();
      }
    });
    /* 右键自动管线（2026-09-16 阶段2e）：命中才拦截默认菜单，选中该管并交页面弹管径菜单 */
    ctn.addEventListener('contextmenu', function (e) {
      if (mode) return;
      var el = currentEL(ctn); if (!el || !lastDataRef || !viewState || !viewState.base) return;
      var raw = rawDataPoint(el, e);
      if (!raw) return;
      var tolM = snapTolUnits(el) / viewState.k;
      var mf = pickManFit(raw, tolM * 0.6);
      if (mf) {                                     // 手工配件右键（2026-09-16）
        e.preventDefault();
        selectManFit(mf.id);
        openManFitMenu(mf.id, e.clientX, e.clientY);
        return;
      }
      var af = pickAutoFit(raw, tolM * 0.7);
      if (af) {                                     // 自动配件（三通/阀门）右键：接管道/删除（2026-09-16 补原缺口）
        e.preventDefault();
        selectFit(af.id);
        openAutoFitMenu(af.id, e.clientX, e.clientY);
        return;
      }
      var mh = pickPipe(raw, tolM * 1.2);
      if (mh) {                                     // 手工管线右键：加三通/端头弯头/改长/删除
        e.preventDefault();
        select(mh.id);
        openManPipeMenu(mh, raw, e.clientX, e.clientY);
        return;
      }
      var hit = pickAutoPipe(raw, tolM * 1.2);
      if (!hit) return;
      e.preventDefault();
      selectAuto(hit.pid, hit.along);
      if (typeof api.onAutoPipeContextMenu === 'function') api.onAutoPipeContextMenu(hit.pid, e.clientX, e.clientY);
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

  /* 图面改径汇总条（阶段2f）：画布右上角，内容来自 index.html 的 tlCalSummaryText（松耦合，
     未注入/无改径时空占位隐藏）；render 建占位，rerenderKeepView 就地刷新内容。
     2026-09-17 第四十九轮（用户：「这里互相遮挡了，水力计算这个框调整一下位置可以任意移动吧」）：
       ① 整块可拖动（指针捕获），双击复位回右上角；位置存 localStorage —— **没拖过不写任何变量**，
          默认仍是 top:10 / right:10（视觉逐像素不变），同一约定见工具轨宽度拖拽（第四十四轮）；
       ② z-index 5 → 6：汇总条浮在 #tlWsOverlays（图面页眉/参数覆盖层，z-index:5、DOM 靠后）**之上**，
          否则长页眉（如「… | 非标准 19 区」）会把汇总条第一行盖掉一半（用户截图即此）；
       ③ pointer-events 由 none 改 auto：要能拖就必须收指针事件；按下/点击/右键一律 stopPropagation，
          避免落到画布上被当成平移或拾取管线。 */
  var CHIP_CSS = 'display:block;position:absolute;top:10px;right:10px;max-width:46%;background:rgba(255,255,255,.96);border:1px solid #f59e0b;border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.12);padding:5px 12px;font:11px/1.6 system-ui,sans-serif;color:#92400e;pointer-events:auto;cursor:move;text-align:left;z-index:6';
  var CHIP_POS_KEY = 'runye_tlWsCalChip_pos';
  var chipPos = null;                     /* {x,y} 相对 .tl-ws-canvas 左上角；null = 默认（右上角） */
  function loadChipPos() {
    if (typeof localStorage === 'undefined') return;
    try {
      var s = localStorage.getItem(CHIP_POS_KEY);
      if (!s) return;
      var a = String(s).split(',');
      var x = parseFloat(a[0]), y = parseFloat(a[1]);
      if (isFinite(x) && isFinite(y)) chipPos = { x: x, y: y };
    } catch (e) { }
  }
  function saveChipPos() {
    if (typeof localStorage === 'undefined') return;
    try {
      if (chipPos) localStorage.setItem(CHIP_POS_KEY, chipPos.x + ',' + chipPos.y);
      else localStorage.removeItem(CHIP_POS_KEY);
    } catch (e) { }
  }
  loadChipPos();
  function chipCss() {
    return CHIP_CSS + (chipPos ? ';left:' + chipPos.x + 'px;top:' + chipPos.y + 'px;right:auto' : '');
  }
  /* 画布变小（窗口缩/工具轨拖宽）后旧位置可能落到可见区外 —— 夹回可见范围，
     否则就「拖也拖不着、双击也点不到」了 */
  function clampChipToHost(chip) {
    if (!chip || !chipPos) return;
    var host = chip.parentNode;
    if (!host || !host.getBoundingClientRect) return;
    var hr = host.getBoundingClientRect(), cr = chip.getBoundingClientRect();
    if (!hr.width || !hr.height || !cr.width) return;
    var x = Math.max(0, Math.min(Math.max(0, hr.width - cr.width), chipPos.x));
    var y = Math.max(0, Math.min(Math.max(0, hr.height - cr.height), chipPos.y));
    if (x !== chipPos.x || y !== chipPos.y) {
      chipPos = { x: x, y: y };
      chip.style.left = x + 'px'; chip.style.top = y + 'px'; chip.style.right = 'auto';
      saveChipPos();
    }
  }
  /* 整块拖动（第四十九轮）：指针捕获 + 夹在画布内；双击复位；位置持久化 */
  function wireCalChipDrag(chip) {
    if (!chip || chip.__chipDragWired) return;
    chip.__chipDragWired = true;
    if (!chip.title) chip.title = '拖动可移动到任意位置（双击复位到右上角）';
    var drag = null;
    chip.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      var host = chip.parentNode; if (!host) return;
      var hr = host.getBoundingClientRect(), cr = chip.getBoundingClientRect();
      drag = { hr: hr, dx: e.clientX - cr.left, dy: e.clientY - cr.top, w: cr.width, h: cr.height };
      try { if (chip.setPointerCapture) chip.setPointerCapture(e.pointerId); } catch (err) { }
      if (typeof document !== 'undefined' && document.body) document.body.style.userSelect = 'none';
      e.preventDefault(); e.stopPropagation();
    });
    chip.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var x = Math.round(Math.max(0, Math.min(Math.max(0, drag.hr.width - drag.w), e.clientX - drag.hr.left - drag.dx)));
      var y = Math.round(Math.max(0, Math.min(Math.max(0, drag.hr.height - drag.h), e.clientY - drag.hr.top - drag.dy)));
      chipPos = { x: x, y: y };
      chip.style.left = x + 'px'; chip.style.top = y + 'px'; chip.style.right = 'auto';
      e.preventDefault(); e.stopPropagation();
    });
    function endChipDrag(e) {
      if (!drag) return;
      drag = null;
      if (typeof document !== 'undefined' && document.body) document.body.style.userSelect = '';
      saveChipPos();
      if (e) e.stopPropagation();
    }
    chip.addEventListener('pointerup', endChipDrag);
    chip.addEventListener('pointercancel', endChipDrag);
    chip.addEventListener('dblclick', function (e) {
      chipPos = null; saveChipPos();
      /* ★ 必须整块重写 cssText：逐条 chip.style.top='' 会把 cssText 里的 top:10px 一起删掉，
         元素失去 top 后落回静态位置（SVG 之后）→ 跑到容器底部（2026-09-17 C6 实测抓到）。 */
      chip.style.cssText = chipCss();
      e.preventDefault(); e.stopPropagation();
    });
    /* 汇总条上的点击 / 右键不落到画布（否则会被当成平移或拾取管线） */
    chip.addEventListener('click', function (e) { e.stopPropagation(); });
    chip.addEventListener('contextmenu', function (e) { e.stopPropagation(); e.preventDefault(); });
    clampChipToHost(chip);
  }
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('resize', function () {
      if (typeof document === 'undefined') return;
      var ctn = currentCTN();
      var chip = ctn ? ctn.querySelector('#tlWsCalChip') : null;
      if (chip) clampChipToHost(chip);
    });
  }
  function calChipHtml(id) {
    var t = (typeof window !== 'undefined' && window.tlCalSummaryText) ? window.tlCalSummaryText() : '';
    if (!t) return ''; /* 无改径 → 零 DOM 增量（eq 基线不受占位元素影响） */
    return '<div id="' + id + '" style="' + chipCss() + '">' + t + '</div>';
  }
  function updateCalChip(id) {
    if (typeof document === 'undefined') return;
    var ctn = currentCTN(); if (!ctn) return;
    var t = (typeof window !== 'undefined' && window.tlCalSummaryText) ? window.tlCalSummaryText() : '';
    var chip = ctn.querySelector('#' + id);
    if (!t) { if (chip && chip.parentNode) chip.parentNode.removeChild(chip); return; }
    if (!chip) {
      var host = ctn.querySelector('.tl-ws-canvas') || ctn;
      chip = document.createElement('div'); chip.id = id;
      host.appendChild(chip);
    }
    chip.innerHTML = t;
    chip.style.cssText = chipCss();
    wireCalChipDrag(chip);
  }
  /* ---------- 渲染入口 ---------- */
  function render(ctn, data) {
    selGroup = null;                                  // 切换/重渲染 → 清空分组高亮
    if (!ctn) return false;
    if (!data || data.version !== 1) {
      ctn.innerHTML = '<div class="tl-ws-empty">请先生成三级管线平面图（点左侧「生成管线图」）</div>';
      viewState = null; lastDataRef = null;
      return false;
    }
    /* 几何签名绑定（2026-09-15 阶段1）：几何变化 → 共享层自动清空（同几何保留） */
    EP.syncGeometry(data);
    /* 自动管线图面编辑层几何绑定（阶段2）：几何变化 → 改长/配件自动清空 */
    AE.syncGeometry(data);
    lastDataRef = data;
    closeCtxMenu();
    ctn.innerHTML = '<div class="tl-ws-canvas" id="tlWsCanvas">' + renderSVG(data) + calChipHtml('tlWsCalChip') + groupInfoHtml() + '</div>';
    /* 第四十九轮：汇总条重建后重挂拖拽。
       ⚠ 必须守卫 querySelector：纯逻辑单测（tests/tl_workspace.test.cjs）传的是最小桩容器
       `{ innerHTML: '' }`，直接调用会 TypeError（2026-09-17 实测踩到，单测 20/22 报红）。 */
    if (ctn.querySelector) wireCalChipDrag(ctn.querySelector('#tlWsCalChip'));
    view.z = 1; view.x = 0; view.y = 0;
    var c2 = currentCTN(), el = currentEL(c2);
    if (c2) {
      if (el) { baseFit(c2, el); applyView(c2, el); }
      wireInteractions(c2);
    }
    return true;
  }

  /* ---------- 共享层订阅（双向同步核心，2026-09-15 阶段1）----------
   * 轴测图/主方案存档发起的变更 → 本视图保持视口重渲染；
   * 本视图发起的变更（source='ws'）在 add/remove 等入口已触发同一订阅，
   * 统一走这里重渲染，避免双份。 */
  EP.onChange(function (d) {
    if (typeof document === 'undefined') return;
    /* 选中条目被别处删除 → 清除选中态并同步页面工具栏 */
    if (selId && !selectedEntry()) { selId = null; if (typeof api.onPipeSelect === 'function') api.onPipeSelect(null); }
    if (selManFitId && !(EP.fitById && EP.fitById(selManFitId))) { selManFitId = null; if (typeof api.onPipeSelect === 'function') api.onPipeSelect(null); }
    rerenderKeepView();
    notifyChange();
  });
  /* 自动管线编辑层订阅（阶段2）：轴测图/存档发起的改长/配件变更 → 保持视口重渲染 */
  AE.onChange(function () {
    if (typeof document === 'undefined') return;
    var stillFit = selFitId && (AE.fitsList() || []).some(function (x) { return x.id === selFitId; });
    var stillAuto = selAutoId && lastDataRef && AE.effPts(selAutoId, lastDataRef);
    if ((selAutoId || selFitId) && !stillFit && !stillAuto) {
      selAutoId = null; selFitId = null;
      selManFitId = null;
      if (typeof api.onPipeSelect === 'function') api.onPipeSelect(null);
    }
    rerenderKeepView();
    if (stillFit && typeof api.onPipeSelect === 'function') api.onPipeSelect(selInfo());
    if (stillAuto && typeof api.onPipeSelect === 'function') api.onPipeSelect(selInfo());   // 拖动/恢复位置后刷新信息卡与「恢复位置」按钮（2026-09-16）
  });

  /* ---------- 导出 ---------- */
  api.render = render;
  api.groupFillCss = function (g) { return groupFill(g); };   /* 供三级简图分区上色带（单一调色板） */
  /* 三级简图「联合灌溉分组」图例（2026-09-16 补全）：纯 HTML 覆盖层，不进简图 SVG（不破坏下载/打印成图）。
     仅展示色带+每组含哪些区+本轮合灌流量；不重涂简图分区（保持简图既有配色）。 */
  api.buildGroupLegend = function (data) {
    var d = data || lastDataRef; if (!d || !d.zones) return '';
    var tlN = (typeof d.combinedN === 'number' && d.combinedN >= 1) ? d.combinedN : 2;
    var z = d.zones, zcN = z.cols || (z.xPos.length - 1), zrN = z.rows || (z.yPos.length - 1);
    var tlTotal = zcN * zrN, M = Math.ceil(tlTotal / tlN);
    var cf = (d.meta && d.meta.flowModel) ? d.meta.flowModel.combinedFlow : null;
    /* 取整 + 修正单位（原误标 L/h，combinedFlow 实为 m³/h；第三十九轮补：图例可拖动/改宽/默认图框内） */
    var cfTxt = (cf != null && isFinite(cf)) ? ('本轮合灌流量 ≈ ' + Math.round(cf) + ' m³/h') : '';
    var html = '<div id="tlGroupLegend" style="position:absolute;left:12px;top:12px;min-width:150px;background:rgba(255,255,255,.94);border:1px solid #1f2937;border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.12);font:11px/1.5 system-ui,sans-serif;color:#1f2937;pointer-events:auto;z-index:6;user-select:none">';
    html += '<div class="tl-legend-drag" style="cursor:move;font-weight:700;padding:6px 24px 4px 10px;border-bottom:1px solid rgba(31,41,55,.15);position:relative">联合灌溉分组（N=' + tlN + '，共 ' + M + ' 组）<span style="position:absolute;right:7px;top:5px;color:#94a3b8;font-size:11px;line-height:1">⋮⋮</span></div>';
    html += '<div style="padding:4px 10px 6px">';
    for (var g = 0; g < M; g++) {
      var mem = tlGroupMembers(g, tlN, tlTotal);
      html += '<div style="display:flex;align-items:center;gap:6px;margin:1px 0"><i style="display:inline-block;width:12px;height:12px;border-radius:3px;background:' + GROUP_FILLS[g % GROUP_FILLS.length] + ';border:1px solid rgba(31,41,55,.35)"></i><span>G' + (g + 1) + '：区 ' + mem.join('、') + '</span></div>';
    }
    if (cfTxt) html += '<div style="margin-top:3px;color:#92400e">' + cfTxt + '</div>';
    html += '</div>';
    html += '<div class="tl-legend-resize" style="position:absolute;right:0;top:0;height:100%;width:7px;cursor:ew-resize"></div>';
    html += '</div>';
    return html;
  };
  api.zoomIn = zoomIn; api.zoomOut = zoomOut; api.zoomFit = zoomFit;
  api.setMode = setMode;
  api.mode = function () { return mode; };
  api.setFitMode = setFitMode;                            // 配件插入模式（第七十轮）：'valve'|'tee'|'elbow'|null
  api.fitMode = function () { return fitMode; };
  api.onFitModeChange = null;                             // 模式变化 → 页面重画工具轨按钮高亮（页面注入）
  api.onFitChange = null;                                 // 插入成功 → 页面提示（页面注入，可选）
  api.setOrtho = function (v) { orthoLock = !!v; return orthoLock; };   // 横竖锁定开关（2026-09-16）
  api.ortho = function () { return orthoLock; };
  api.undo = undo;
  api.clearManual = clearManual;
  api.pipes = function () { return EP.list(); };
  api.totals = function () { return EP.totals(); };        // {main:{n,len}, branch:{n,len}, all:{n,len}}
  api.select = select;                                      // 选中/取消（null）
  api.getSelected = function () { return selInfo(); };
  api.deleteSelected = deleteSelected;                      // 删除选中手工管线
  api.setSelLength = setSelLength;                          // 选中管线就地改长（米；阶段2起兼容自动管线）
  /* 自动管线图面编辑（阶段2）：在点击位置插三通/阀门 / 删除选中配件 */
  api.insertAutoFit = function (kind) {
    if (!selAutoId || !lastDataRef) return null;
    return AE.addFitting(kind, selAutoId, selAutoAt, lastDataRef, 'ws');
  };
  api.deleteSelFit = function () {
    if (!selFitId) return false;
    var ok = AE.removeFitting(selFitId, 'ws');
    if (ok) { selFitId = null; rerenderKeepView(); if (typeof api.onPipeSelect === 'function') api.onPipeSelect(null); }
    return ok;
  };
  /* 选中配件精确定位（输入框，阶段2b）：atM = 距起点弧长（米）；距终点输入由页面换算 pipeLen−v */
  api.moveSelFit = function (atM) {
    if (!selFitId || !lastDataRef) return false;
    var ok = AE.moveFitting(selFitId, Number(atM), lastDataRef, 'ws');
    if (ok && typeof api.onPipeSelect === 'function') api.onPipeSelect(selInfo());
    return ok;
  };
  /* 图面改径（2026-09-16 阶段2e）：右键菜单选 pid 一步设置/恢复；AE 广播 → 两视图重渲染 */
  api.setAutoCaliber = function (pid, od) {
    if (!lastDataRef) return false;
    var ok = AE.setCaliber(pid, Number(od), lastDataRef, 'ws');
    if (ok) {
      selId = null; selFitId = null; selAutoId = pid; selAutoAt = 0;
      rerenderKeepView();
      if (typeof api.onPipeSelect === 'function') api.onPipeSelect(selInfo());
    }
    return ok;
  };
  api.clearAutoCaliber = function (pid) {
    if (!lastDataRef) return false;
    var ok = AE.clearCaliber(pid, 'ws');
    if (ok) {
      rerenderKeepView();
      if (selAutoId === pid && typeof api.onPipeSelect === 'function') api.onPipeSelect(selInfo());
    }
    return ok;
  };
  api.onAutoPipeContextMenu = null;   /* 右键自动管线 → 页面弹管径菜单（阶段2e），页面注入 */
  api.onMultiSelect = null;           /* 同类型多选变化 → 页面渲染多选面板（第三十九轮），页面注入 */
  api.onMultiMode = null;             /* 多选开关状态变化 → 页面重画工具轨按钮（第五十八轮），页面注入 */
  /* 多选开关（2026-09-17 第五十八轮，用户要求「工具轨加一个控制按钮，点了就能多选管道」）：
     开启 = 清掉单选态、清空多选集合，之后 pointerdown 命中自动管线即 toggleSelSet（同类型逐段累加）；
     关闭 = 清空多选集合并回到单选。第三十九轮的「Ctrl/⌘ + 点」捷径同时修好（现在真实鼠标也走通）。 */
  function setMultiMode(on) {
    on = !!on;
    if (multiMode === on) return multiMode;
    multiMode = on;
    if (on) {
      if (mode) { mode = null; cancelDraft(); updatePreview(); if (typeof api.onModeChange === 'function') api.onModeChange(null); }
      selId = null; selAutoId = null; selFitId = null; selManFitId = null;
      selSet = [];
      rerenderKeepView();
      if (typeof api.onPipeSelect === 'function') api.onPipeSelect(null);
      if (typeof api.onMultiSelect === 'function') api.onMultiSelect(null);
    } else if (selSet.length) { exitMulti(); }
    if (typeof api.onMultiMode === 'function') api.onMultiMode(multiMode);
    return multiMode;
  }
  api.setMultiMode = setMultiMode;
  api.isMultiMode = function () { return multiMode; };
  api.getSelSet = function () { return selSet.slice(); };
  api.clearSelSet = function () {
    if (!selSet.length) return;
    selSet = [];
    rerenderKeepView();
    if (typeof api.onPipeSelect === 'function') api.onPipeSelect(null);
    if (typeof api.onMultiSelect === 'function') api.onMultiSelect(null);
  };
  api.setAutoCaliberMulti = function (pids, od) {
    if (!lastDataRef || !pids || !pids.length) return false;
    var ok = true;
    pids.forEach(function (pid) {
      var r = AE.setCaliber(pid, Number(od), lastDataRef, 'ws');
      if (!r) ok = false;
    });
    rerenderKeepView();
    if (typeof api.onMultiSelect === 'function') api.onMultiSelect(selSetInfo());
    return ok;
  };
  api.clearAutoCaliberMulti = function (pids) {
    if (!lastDataRef || !pids || !pids.length) return false;
    pids.forEach(function (pid) { if (AE.clearCaliber) AE.clearCaliber(pid, 'ws'); });
    rerenderKeepView();
    if (typeof api.onMultiSelect === 'function') api.onMultiSelect(selSetInfo());
    return true;
  };
  api.pipeType = pipeType;
  api.autoSelInfo = function () { return (selAutoId || selFitId) ? selInfo() : null; };
  api.commitDraft = commitDraft;      // 测试/外部结束当前折线
  api.cancelDraft = cancelDraft;
  api.getViewState = function () { return viewState; };   // 只读钩子：E2E 数据坐标→屏幕换算
  api._geo = { boundsOf: boundsOf, polylineLen: polylineLen, collectSnapPts: collectSnapPts, pickSnap: pickSnap, closestOnSeg: closestOnSeg };

  global.RyTlWs = api;
})(typeof window !== 'undefined' ? window : globalThis);
