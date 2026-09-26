/* =====================================================================
 * network-editor.js — 施工管网编辑器（尺寸驱动 · 润野灌溉三级管路）
 * ---------------------------------------------------------------------
 * 依赖：network-model.js（window.RyNetModel）、iso-diagram.js（window.RyIsoDiagram，
 *       只读复用其 projectIso / getViewState 口径）、index.html 的
 *       window.tlDiagramData（只读平面数据）。
 * 职责：
 *  - 在**平面图与轴测图两个视图**内叠加施工管网层（g.cn-layer）：管段 / 配件 / 空接口 /
 *    尺寸标签（节点中心到中心长度，米）/ 固定端标记 / 选中高亮 / 预览高亮。
 *    视图自适应：平面走 window.tlPlanView 正投影换算，轴测走 projectIso（2026-09-15）。
 *  - 就地小菜单（2026-09-15 用户要求）：点白圈空口 → 接管道/三通/弯头/阀门（就地选，
 *    接完新管端继续出现白圈，可无限递归往下接）；点管段中部 → 插入阀门/三通。
 *  - 编辑事务：改尺寸等操作先「预览」（模型 beginEdit），面板出现【确认/取消】；
 *    确认提交（一个撤销步骤）、取消恢复（未修改直接取消不撤销历史）。
 *    保存/撤销在有未确认预览时被拒绝，保存内容不含未确认预览。
 *  - 中文按钮流程：插入配件 / 延伸管道 / 修剪管道（均为点击按钮→按提示点图
 *    →预览→确认）。延伸：选自由端→选目标管→自动三通/节点复用/端点对接。
 *    修剪：选边界配件→选要去掉一侧的管段→单段修剪到自由端。
 *  - 存档：localStorage 按方案/地块隔离（runye_construction_net_v1:<plotId>）；
 *    几何签名不符时不自动套用，提供「查看旧快照 / 从当前管网新建」选择；
 *    旧存档归档保留不删除。并提供 exportForProject/importForProject 纳入
 *    主方案保存/打开流程。
 * 红线：不修改 iso-diagram.js / 平面数据 / 水力计算；本模块只写自己的模型与 DOM。
 * ===================================================================== */
(function () {
  'use strict';

  var NM = (typeof window !== 'undefined' && window.RyNetModel) ||
           (typeof require !== 'undefined' ? require('./network-model.js') : null);
  if (!NM) return;

  /* 2026-09-15 用户下线（EDITOR_OFF 总开关）：平面 + 轴测的施工编辑操作
     （接管/延伸/修剪/改径/沿线统计）整体取消，左栏位置保留空置，
     待用户重定方案后再恢复 —— 恢复时把 EDITOR_OFF 改回 false 即可。
     模型引擎（network-model.js）与全部单测不受影响；
     exportClean 无层可摘 → 直通；exportForProject 恒 null（主方案保存不受影响）。 */
  var EDITOR_OFF = false;

  var KEY_PREFIX = 'runye_construction_net_v1';
  function storeKey() { return KEY_PREFIX + ':' + (window.currentPlotId || 'current'); }
  var SVG_NS = 'http://www.w3.org/2000/svg';

  var SEG_COLOR = { front: '#1d4ed8', main: '#15803d', branch: '#b45309', riser: '#7c3aed', takeoff: '#7c3aed', manual: '#0f766e', joint: '#64748b' };
  var SEG_NAME = { front: '总管', main: '主管', branch: '支管', riser: '总管接驳', takeoff: '阀接驳', manual: '手工接管', joint: '接头' };
  var FIT_COLOR = { valve: '#d97706', tee: '#15803d', 'tee-front': '#1d4ed8', endpoint: '#334155', source: '#1d4ed8', elbow: '#64748b', reducer: '#0d9488', cap: '#991b1b' };
  var FIT_NAME = { valve: '阀门', tee: '三通', 'tee-front': '总管三通', endpoint: '端点', source: '水源', elbow: '弯头', reducer: '异径接头', cap: '封堵' };

  var st = {
    net: null,          // ConstructionNetwork
    active: false,
    viewOnly: false,    // 旧快照只读查看模式
    pendingChoice: null,// {saved} 几何签名不符时的旧存档（等待用户选择）
    projectNet: null,   // 主方案带来的施工模型（enable/import 时消费）
    sel: null,          // {type:'fitting'|'segment'|'port', id, port?}
    anchor: 'auto',     // 改尺寸时的基准端（不动的一端）：'auto' | 'a' | 'b'
    anchorFor: null,    // anchor 所属管段 id（切换选中管段时重置为 auto）
    mode: null,         // 'insert' | 'extend' | 'trim'
    flow: null,         // 多步流程状态 {kind, step, ...}
    preview: null,      // {kind:'extend'|'trim'|'start'|'connect', plan}
    connChoice: null,   // 继续连接当前类型：pipe/tee/elbow/valve/reducer/cap
    path: { ids: [], map: {} }, // 沿线统计选中的管段（2026-09-15 用户要求）
    caliberBase: {},            // 建模默认管径快照（segId→od），改径可视化/统计基线用
    pathQ: null,                // 沿线统计的设计流量 Q（m³/h；缺省取 sourceMeta 泵流量）
    layer: null,
    obs: null,
    msg: '',
    msgKind: 'info'
  };

  /* ---------- 工具 ---------- */
  function iso() { return window.RyIsoDiagram || null; }
  function planData() { return window.tlDiagramData || null; }
  function view() { var i = iso(); return i ? i.getViewState() : null; }
  /* ---------- 视图适配（2026-09-15 用户要求：平面图 / 轴测图共用一套工具） ---------- */
  function activeView() {
    var sec = typeof document !== 'undefined' ? document.getElementById('tlPipePlanSection') : null;
    var v = sec && sec.getAttribute('data-ry-view');
    return v === 'iso' ? 'iso' : 'plan';
  }
  function hostSvg() {
    var id = activeView() === 'iso' ? 'tlIsoDiagramContent' : 'tlDiagramContent';
    var ctn = document.getElementById(id);
    return ctn ? ctn.querySelector('svg') : null;
  }
  /* 平面视图换算：世界坐标 → 平面 SVG 坐标。s/ox/oy/minX/minY 由 tlAutoGenerate 只读导出
     （window.tlPlanView）；地块组被用户拖动过时再叠加其 translate。 */
  function planXform() {
    var t = (typeof window !== 'undefined') ? window.tlPlanView : null;
    if (!t || !isFinite(t.s) || !t.s) return null;
    var tx = 0, ty = 0;
    var g = typeof document !== 'undefined' ? document.getElementById('tlPlotGroup') : null;
    var tr = g && g.getAttribute('transform');
    if (tr) {
      var mt = /translate\(\s*(-?[\d.]+)[ ,]+(-?[\d.]+)\s*\)/.exec(tr);
      if (mt) { tx = parseFloat(mt[1]) || 0; ty = parseFloat(mt[2]) || 0; }
    }
    return { s: t.s, ox: t.ox, oy: t.oy, minX: t.minX, minY: t.minY, tx: tx, ty: ty };
  }
  function mk(tag, attrs) {
    var e = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function msg(text, kind) { st.msg = text; st.msgKind = kind || 'info'; renderPanel(); }
  function fitLabel(id) {
    var f = st.net && st.net.fittings[id];
    return f ? (FIT_NAME[f.type] || f.type) + ' ' + id : id;
  }
  function segLabel(s) {
    return (SEG_NAME[s.kind] || s.kind) + ' ' + s.id + ' · ' + s.length.toFixed(1) + ' m' +
      (s.caliber != null ? ' · Ø' + s.caliber : '') + (s.rigid ? ' · 刚性' : ' · 柔性');
  }
  /* 是否自由端：单段叶端点且未固定（可作延伸起点/修剪对象） */
  function isFreeEnd(id) {
    var f = st.net && st.net.fittings[id];
    return !!f && f.type === 'endpoint' && st.net.segmentsOf(id).length === 1 && !st.net.fixed[id];
  }
  /* 装配件判定（2026-09-15）：fromPlan 出来的配件/管段是图纸自带的，id 形如
     V1 / T-V1 / T-M1 / E-P1 / SRC（无 "-N<序号>" 后缀）；编辑器装配或管中插入出来的
     配件 id 一律形如 T-N1 / V-N1 / EL-N1 / E-N1（applyConnect/insertFittingOnSegment
     分配），管段则带 productId 或 kind=manual/joint。用于「底图已画的就不再重复描边」。 */
  function isAsmId(id) { return /-N\d+$/.test(String(id)); }
  function isAsmSeg(s) { return !!s && (s.kind === 'manual' || s.kind === 'joint' || !!s.productId); }
  function isAsmFit(f) { return !!f && (!!f.productId || isAsmId(f.id)); }
  /* 编辑互斥：有未确认预览时禁止其他修改入口 */
  function busy() { return (st.net && st.net.isEditing()) || !!st.preview; }
  /* 即时操作事务包装：成功=一个撤销步骤；失败零痕迹 */
  function runTx(fn) {
    if (!st.net.beginEdit()) { msg('已有未确认的编辑，请先点【确认】或【取消】', 'warn'); return null; }
    var r;
    try { r = fn(); } catch (err) { r = { ok: false, reason: err.message }; }
    if (r && r.ok) st.net.commitEdit();
    else st.net.cancelEdit();
    return r;
  }
  /* 网格模型被替换（启用/恢复存档/新建）→ 重建管径基线快照、清空沿线统计与设计流量 */
  function netReplaced() {
    st.caliberBase = {};
    if (st.net) Object.keys(st.net.segments).forEach(function (id) { st.caliberBase[id] = st.net.segments[id].caliber; });
    st.path = { ids: [], map: {} };
    st.pathQ = null;
  }

  /* ---------- 屏幕投影（复用 iso 的投影与视图状态；缩放平移为 SVG 的 CSS transform，叠加层自动跟随） ---------- */
  function P(fit) {
    if (!fit) return null;
    return Pxy(fit.pos.x, fit.pos.y, fit.z || 0);
  }
  function Pxy(x, y, z) {
    if (activeView() === 'plan') {
      /* 平面视图是正投影俯视：只用 x/y，标高与 z 不参与平面表达 */
      var t = planXform();
      if (!t) return null;
      return { x: (x - t.minX) * t.s + t.ox + t.tx, y: (y - t.minY) * t.s + t.oy + t.ty };
    }
    var v = view(), i = iso();
    if (!v || !i) return null;
    var q = i.projectIso(x, y, z || 0, v.k);
    return { x: v.ox + q.x, y: v.oy + q.y };
  }

  /* ---------- 叠加层绘制 ---------- */
  function drawLayer() {
    var svg = hostSvg();
    if (!svg) return;
    if (st.layer && st.layer.parentNode) st.layer.parentNode.removeChild(st.layer);
    st.layer = null;
    st.hoverKey = null;
    if (st.hoverLayer && st.hoverLayer.parentNode) st.hoverLayer.parentNode.removeChild(st.hoverLayer);
    st.hoverLayer = null;
    if (!st.active || !st.net) return;
    var g = mk('g', { 'class': 'cn-layer', 'pointer-events': 'none', 'data-ry-export-skip': '1' });

    /* 管段：白色描边垫底 + 彩色线；拾取用宽透明线 */
    var segs = Object.values(st.net.segments);
    var anchors = dimAnchors();
    segs.forEach(function (s) {
      var a = P(st.net.fittings[s.a.fitting]), b = P(st.net.fittings[s.b.fitting]);
      if (!a || !b) return;
      var color = SEG_COLOR[s.kind] || '#475569';
      var sel = st.sel && st.sel.type === 'segment' && st.sel.id === s.id;
      var trimmed = st.preview && st.preview.kind === 'trim' && st.preview.plan.seg === s.id;
      /* 装配段（编辑器接出来的：手工接管 / 接头 / 带型号）实画；图纸自带管段（总管/主管/支管）
         底图已经画过，叠加层不再重复描边，只保留下面那条透明拾取线保证可点，
         悬停/选中时另用高亮层提示。这样平面图与轴测图的观感与原图一致，导出图纸也干净。 */
      var asm = isAsmSeg(s);
      if (asm || sel) {
        g.appendChild(mk('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: '#fff', 'stroke-width': sel ? 7 : 5.5, 'stroke-linecap': 'round' }));
        g.appendChild(mk('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: color, 'stroke-width': sel ? 4.5 : 3, 'stroke-linecap': 'round', opacity: sel ? 1 : 0.92 }));
      }
      if (trimmed) g.appendChild(mk('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: '#dc2626', 'stroke-width': 4, 'stroke-dasharray': '7 4', 'stroke-linecap': 'round' }));
      var pick = mk('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: 'rgba(0,0,0,0)', 'stroke-width': 12, 'pointer-events': 'stroke', 'data-cn-seg': s.id, cursor: 'pointer' });
      g.appendChild(pick);
      /* 尺寸标签：位置由 dimAnchors() 统一计算（与命中测试一致） */
      /* 2026-09-15 用户要求「改动配件两侧的数值，配件随之移动」：
         插配件把原图纸管段拆成两段（kind 仍是 main 等），这两段必须显示尺寸数值，
         否则「两侧的数值」根本看不见。判定=任一端点是装配配件（isAsmFit）。 */
      var touchesAsm = isAsmFit(st.net.fittings[s.a.fitting]) || isAsmFit(st.net.fittings[s.b.fitting]);
      var an = anchors[s.id];
      if (an && (asm || sel || touchesAsm)) {
        var t = mk('text', { x: an.x, y: an.y, 'class': 'cn-dim', 'text-anchor': 'middle', 'pointer-events': 'all', 'data-cn-seg': s.id, cursor: 'pointer' });
        t.textContent = s.length.toFixed(1) + 'm';
        g.appendChild(t);
      }
    });

    /* 改径可视化 + 沿线统计选中标记（2026-09-15 用户要求）：
     * 改过管径的段（与建模默认不同）画琥珀色实线 + 「Ø180」标注；
     * 加入沿线统计的段画蓝色虚线。底图未改的管段仍不重复描边（零痕迹设计）。 */
    segs.forEach(function (s) {
      var a = P(st.net.fittings[s.a.fitting]), b = P(st.net.fittings[s.b.fitting]);
      if (!a || !b) return;
      var calChanged = s.caliber != null && st.caliberBase[s.id] !== s.caliber;
      var inPath = !!(st.path && st.path.map[s.id]);
      if (calChanged) {
        g.appendChild(mk('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: '#d97706', 'stroke-width': 4, 'stroke-linecap': 'round', opacity: 0.88, 'data-cn-seg': s.id }));
      }
      /* 只标改过管径的段（2026-09-26 用户要求简化：普通段不逐根标，看图例即可） */
      if (calChanged && s.caliber != null) {
        var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        var ddx = b.x - a.x, ddy = b.y - a.y, LL = Math.hypot(ddx, ddy) || 1;
        var cal = mk('text', { x: mx - ddy / LL * 22, y: my + ddx / LL * 22, 'class': 'cn-cal', 'text-anchor': 'middle', 'pointer-events': 'none', 'data-cn-seg': s.id,
          fill: '#b45309', 'font-size': 12, 'font-weight': 700 });
        cal.textContent = 'Ø' + s.caliber;
        g.appendChild(cal);
      }
      if (inPath) {
        g.appendChild(mk('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: '#2563eb', 'stroke-width': 2.4, 'stroke-dasharray': '6 4', 'stroke-linecap': 'round', 'data-cn-seg': s.id }));
      }
    });

    /* 配件：圆形符号；固定端用菱形标记 */
    Object.values(st.net.fittings).forEach(function (f) {
      var p = P(f); if (!p) return;
      var sel = st.sel && ((st.sel.type === 'fitting' && st.sel.id === f.id) || (st.sel.type === 'port' && st.sel.id === f.id));
      var color = FIT_COLOR[f.type] || '#475569';
      /* 图纸自带的阀门/三通/弯头/端点（无 productId）底图已画符号，叠加层不再重复画；
         编辑器装配出来的配件必须画（底图没有）。选中时一律画，用于给出高亮与虚线框。 */
      if (isAsmFit(f) || sel) {
        if (st.net.fixed[f.id]) {
          /* ◆ 实线菱形 = 硬固定锚（用户【固定】/水源/施工起点，传播时是墙）；
             ◇ 虚线菱形 = 图纸拐点锚（fromPlan 折线拐点/链端点，允许随下游整链平移） */
          var hardAnc = st.net._isHardAnchor(f.id);
          g.appendChild(mk('rect', { x: p.x - 4.2, y: p.y - 4.2, width: 8.4, height: 8.4,
            transform: 'rotate(45 ' + p.x + ' ' + p.y + ')', fill: 'none',
            stroke: hardAnc ? '#111827' : '#94a3b8', 'stroke-width': hardAnc ? 1.6 : 1.3,
            'stroke-dasharray': hardAnc ? null : '2 1.6' }));
        }
        g.appendChild(mk('circle', { cx: p.x, cy: p.y, r: sel ? 6 : 4.5, fill: color, stroke: sel ? '#111827' : '#fff', 'stroke-width': sel ? 2.4 : 1.6, 'data-cn-fit': f.id, 'pointer-events': 'all', cursor: 'pointer' }));
      }
      if (sel) g.appendChild(mk('circle', { cx: p.x, cy: p.y, r: 10, fill: 'none', stroke: '#111827', 'stroke-width': 1.4, 'stroke-dasharray': '3 2', 'pointer-events': 'none' }));
      /* 修剪预览：远端画 X 标记 */
      if (st.preview && st.preview.kind === 'trim' && st.preview.plan.farFitting === f.id) {
        g.appendChild(mk('line', { x1: p.x - 5, y1: p.y - 5, x2: p.x + 5, y2: p.y + 5, stroke: '#dc2626', 'stroke-width': 2.2 }));
        g.appendChild(mk('line', { x1: p.x - 5, y1: p.y + 5, x2: p.x + 5, y2: p.y - 5, stroke: '#dc2626', 'stroke-width': 2.2 }));
      }
      /* 延伸流程：可选的自由端画绿色提示圈 */
      if (st.flow && st.flow.kind === 'extend' && st.flow.step === 1 && isFreeEnd(f.id)) {
        g.appendChild(mk('circle', { cx: p.x, cy: p.y, r: 8, fill: 'none', stroke: '#15803d', 'stroke-width': 1.6, 'stroke-dasharray': '3 2' }));
      }
    });

    /* 空接口：白底橙圈，可点击接管 */
    Object.values(st.net.fittings).forEach(function (f) {
      var p = P(f); if (!p) return;
      st.net.freePorts(f.id).forEach(function (fp) {
        var dir = fp.portDef.dir || { x: 1, y: 0 };
        var q = { x: p.x + dir.x * 9, y: p.y + dir.y * 9 };
        g.appendChild(mk('circle', { cx: q.x, cy: q.y, r: 7, fill: 'rgba(0,0,0,0)', 'pointer-events': 'all', 'data-cn-port': f.id + '|' + fp.port, cursor: 'pointer' }));
        g.appendChild(mk('circle', { cx: q.x, cy: q.y, r: 3.4, fill: '#fff', stroke: '#d97706', 'stroke-width': 2, 'pointer-events': 'none' }));
        if (st.flashId === f.id) {
          g.appendChild(mk('circle', { cx: q.x, cy: q.y, r: 11, fill: 'none', stroke: '#d97706', 'stroke-width': 2, opacity: 0.6, 'pointer-events': 'none' }));
          g.appendChild(mk('circle', { cx: q.x, cy: q.y, r: 16, fill: 'none', stroke: '#d97706', 'stroke-width': 1.2, opacity: 0.25, 'pointer-events': 'none' }));
        }
      });
      /* 自由管端（口被自身管段占用）：非延伸/修剪/插入模式下画续接口白圈 */
      if ((!st.mode || st.mode === 'start') && f.type === 'endpoint' && !st.net.fixed[f.id] &&
          Object.keys(f.ports).length === 1 && st.net.segmentsOf(f.id).length === 1) {
        var s0 = st.net.segmentsOf(f.id)[0];
        var out0 = (s0.a.fitting === f.id) ? { x: -s0.dir.x, y: -s0.dir.y } : s0.dir;
        var q0 = { x: p.x + out0.x * 9, y: p.y + out0.y * 9 };
        g.appendChild(mk('circle', { cx: q0.x, cy: q0.y, r: 7, fill: 'rgba(0,0,0,0)', 'pointer-events': 'all', 'data-cn-port': f.id + '|p1', cursor: 'pointer' }));
        g.appendChild(mk('circle', { cx: q0.x, cy: q0.y, r: 3.4, fill: '#fff', stroke: '#d97706', 'stroke-width': 2, 'pointer-events': 'none' }));
      }
    });

    /* 延伸预览：虚线延长线 + 交点标记 */
    if (st.preview && st.preview.kind === 'extend') {
      var plan = st.preview.plan;
      var seg = st.net.segments[plan.seg];
      if (seg) {
        var E = P(st.net.fittings[seg[plan.side].fitting]);
        var H = Pxy(plan.hit.x, plan.hit.y, st.net.fittings[seg[plan.side].fitting].z);
        if (E && H) {
          g.appendChild(mk('line', { x1: E.x, y1: E.y, x2: H.x, y2: H.y, stroke: '#15803d', 'stroke-width': 3, 'stroke-dasharray': '8 5', 'stroke-linecap': 'round' }));
          g.appendChild(mk('circle', { cx: H.x, cy: H.y, r: 8, fill: 'rgba(21,128,61,0.15)', stroke: '#15803d', 'stroke-width': 2 }));
          var lbl = mk('text', { x: H.x, y: H.y - 13, 'class': 'cn-dim', 'text-anchor': 'middle', 'pointer-events': 'none' });
          lbl.textContent = '延伸 ' + plan.extendLen.toFixed(1) + 'm';
          g.appendChild(lbl);
        }
      }
    }

    svg.appendChild(g);
    st.layer = g;
    autoReport();
  }
  /* ---------- 悬停提示（2026-09-15）----------
   * 底图自带的管段/配件不再常驻描边，靠这里给一个「可点」的即时反馈：
   * 指针悬停时对命中的管段/配件画一层柔和橙色高亮，移开即撤；独立的 g，随指针重建，
   * 由 rAF 节流且只在命中对象变化时重画，开销恒定。 */
  function drawHover(key, hit) {
    var svg = hostSvg();
    if (!svg) return;
    if (st.hoverLayer && st.hoverLayer.parentNode) st.hoverLayer.parentNode.removeChild(st.hoverLayer);
    st.hoverLayer = null;
    if (!hit || !st.active || !st.net) return;
    var g = mk('g', { 'class': 'cn-hover', 'pointer-events': 'none', 'data-ry-export-skip': '1' });
    if (hit.type === 'segment' || (hit.type === 'port' && !hit.fitting)) {
      var s = st.net.segments[hit.id]; if (!s) return;
      var a = P(st.net.fittings[s.a.fitting]), b = P(st.net.fittings[s.b.fitting]);
      if (!a || !b) return;
      g.appendChild(mk('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: '#d97706', 'stroke-width': 6.5, 'stroke-linecap': 'round', opacity: 0.32 }));
    } else {
      var fid = (hit.type === 'port') ? hit.fitting : hit.id;
      var f = st.net.fittings[fid]; if (!f) return;
      var p = P(f); if (!p) return;
      g.appendChild(mk('circle', { cx: p.x, cy: p.y, r: 9.5, fill: 'none', stroke: '#d97706', 'stroke-width': 1.6, opacity: 0.65 }));
    }
    svg.appendChild(g);
    st.hoverLayer = g;
  }
  function onMove(e) {
    if (!st.active || !st.net || st.viewOnly) return;
    if (st.down && Math.hypot(e.clientX - st.down.x, e.clientY - st.down.y) > 5) return;  /* 拖拽中不提示 */
    if (e.buttons) return;                                                              /* 按住键时保持不动 */
    if (st.movePending) return;
    st.movePending = true;
    var cx = e.clientX, cy = e.clientY;
    requestAnimationFrame(function () {
      st.movePending = false;
      var svg = hostSvg(); if (!svg) return;
      var pt = null;
      var m = svg.getScreenCTM();
      if (m) pt = new DOMPoint(cx, cy).matrixTransform(m.inverse());
      var hit = pt ? hitTest(pt) : null;
      var key = hit ? (hit.type + ':' + (hit.id || hit.fitting) + ':' + (hit.port || '')) : '';
      if (key === st.hoverKey) return;
      st.hoverKey = key;
      drawHover(key, hit);
    });
  }

  /* ---------- 点击交互 ----------
   * 关键：iso-diagram 在 pointerdown 时对 svg setPointerCapture，真实点击的
   * e.target 会被重定向到 svg 根（closest 无法命中子元素）。因此与 iso 的
   * handleClick 同模式：用坐标 + 数学命中测试（空口 > 配件 > 尺寸标签 > 管段）。
   * 命中即 stopPropagation，避免误触发 iso 的构件参数面板。 */
  function dimAnchors() {
    var out = {}, idx = 0;
    if (!st.net) return out;
    Object.values(st.net.segments).forEach(function (s) {
      var a = P(st.net.fittings[s.a.fitting]), b = P(st.net.fittings[s.b.fitting]);
      if (!a || !b) return;
      var dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy);
      if (L < 14) return;
      var off = (idx % 2 ? -1 : 1) * 11;
      out[s.id] = { x: (a.x + b.x) / 2 - dy / L * off, y: (a.y + b.y) / 2 + dx / L * off };
      idx++;
    });
    return out;
  }
  function svgPoint(e) {
    var svg = hostSvg(); if (!svg) return null;
    var m = svg.getScreenCTM(); if (!m) return null;
    var pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return pt;
  }
  function dist2Pt(p, q) { return Math.hypot(p.x - q.x, p.y - q.y); }
  function hitTest(pt) {
    if (!st.net) return null;
    var best = null;
    /* 1) 空接口（优先，命中半径 10px）；自由管端续接口仅在默认/起始模式参与命中，
     *    避免抢走延伸/修剪流程对自由端配件的点击 */
    var allowPE = !st.mode || st.mode === 'start';
    Object.values(st.net.fittings).forEach(function (f) {
      var p = P(f); if (!p) return;
      var dBody = dist2Pt(pt, p);
      st.net.freePorts(f.id).forEach(function (fp) {
        var dir = fp.portDef.dir || { x: 1, y: 0 };
        var q = { x: p.x + dir.x * 9, y: p.y + dir.y * 9 };
        var d = dist2Pt(pt, q);
        /* 点在接头本体（非管端 endpoint）上、且离本体比离白圈更近 → 让给配件选中。
         * 否则三通分支白圈（画在 9px 外、命中 10px）会抢走本体点击，
         * 用户点三通符号想选中它却弹出接管菜单（2026-09-15）。 */
        if (f.type !== 'endpoint' && dBody < d) return;
        if (d <= 10 && (!best || d < best.d)) best = { type: 'port', d: d, fitting: f.id, port: fp.port };
      });
      if (allowPE && f.type === 'endpoint' && !st.net.fixed[f.id] &&
          Object.keys(f.ports).length === 1 && st.net.segmentsOf(f.id).length === 1) {
        var s0 = st.net.segmentsOf(f.id)[0];
        var out0 = (s0.a.fitting === f.id) ? { x: -s0.dir.x, y: -s0.dir.y } : s0.dir;
        var q0 = { x: p.x + out0.x * 9, y: p.y + out0.y * 9 };
        var d0 = dist2Pt(pt, q0);
        /* 半径 7（与画圈一致）：点击配件中心（距圈心 9px）仍应选中配件本身 */
        if (d0 <= 7 && (!best || d0 < best.d)) best = { type: 'port', d: d0, fitting: f.id, port: 'p1' };
      }
    });
    if (best) return best;
    /* 2) 配件（命中半径 9px） */
    Object.values(st.net.fittings).forEach(function (f) {
      var p = P(f); if (!p) return;
      var d = dist2Pt(pt, p);
      if (d <= 9 && (!best || d < best.d)) best = { type: 'fitting', d: d, id: f.id };
    });
    if (best) return best;
    /* 2.5) 尺寸标签（半径 10px，视同选中该管段，t 取中点） */
    var anchors = dimAnchors();
    Object.keys(anchors).forEach(function (sid) {
      var d = dist2Pt(pt, anchors[sid]);
      if (d <= 10 && (!best || d < best.d)) best = { type: 'segment', d: d, id: sid, t: 0.5, via: 'dim' };
    });
    if (best) return best;
    /* 3) 管段（到线段距离 ≤ 7px，取最近；记录沿线参数 t 供插入/端点定位） */
    Object.values(st.net.segments).forEach(function (s) {
      var a = P(st.net.fittings[s.a.fitting]), b = P(st.net.fittings[s.b.fitting]);
      if (!a || !b) return;
      var dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
      if (L2 < 1e-6) return;
      var t = ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / L2;
      var tc = Math.max(0, Math.min(1, t));
      var q = { x: a.x + dx * tc, y: a.y + dy * tc };
      var d = dist2Pt(pt, q);
      if (d <= 7 && (!best || d < best.d)) best = { type: 'segment', d: d, id: s.id, t: t };
    });
    return best;
  }
  function onClick(e) {
    if (!st.active || !st.net || st.viewOnly) return;
    /* 与拖拽平移区分：按下到抬起位移 >5px 视为拖拽，不选中 */
    if (st.down && Math.hypot(e.clientX - st.down.x, e.clientY - st.down.y) > 5) return;
    var pt = svgPoint(e);
    if (!pt) return;
    var hit = hitTest(pt);
    if (!hit) {
      if (st.sel) { st.sel = null; drawLayer(); renderPanel(); }
      return; /* 未命中：放行给 iso 的构件参数面板 */
    }
    e.stopPropagation();
    /* 端口/对象选择只读，不受预览互斥限制；修改性动作受 busy() 拦截 */
    if (hit.type === 'port') {
      st.connChoice = null;
      st.sel = { type: 'port', id: hit.fitting, port: hit.port };
      drawLayer(); renderPanel();
      openPortMenu(hit, e);   /* 2026-09-15：白圈就地弹菜单，接完新管端可继续点（递归） */
      return;
    }
    if (st.mode === 'extend') { extendFlow(hit); return; }
    if (st.mode === 'trim') { trimFlow(hit); return; }
    if (hit.type === 'fitting') {
      st.connChoice = null;
      st.sel = { type: 'fitting', id: hit.id };
      drawLayer(); renderPanel(); return;
    }
    /* segment */
    if (st.mode === 'insert') { insertAtClick(hit.id, hit.t); return; }
    st.connChoice = null;
    st.sel = { type: 'segment', id: hit.id };
    st.anchorFor = hit.id; st.anchor = 'auto';    // 每次点选管段都从「自动」基准端开始
    drawLayer(); renderPanel();
    /* 点在尺寸数值上 → 就地改长（接头沿管轴随动）；点管身其它位置 → 插入阀门/三通 */
    if (hit.via === 'dim') { openLenMenu(hit, e); return; }
    openSegmentMenu(hit, e);  /* 2026-09-15：点总管/主管中部落位插阀门 / 三通 */
  }

  /* ---------- 就地小菜单 + 递归接管（2026-09-15 用户要求） ----------
   * 交互：点自由端白圈（或任何空接口）→ 就地弹菜单「接管道 / 接三通 / 接弯头 / 接阀门」→
   *       第二步选长度或分支朝向 → 立即提交。接完的管件自身带新的空接口，白圈立刻可再点，
   *       因此「管 → 三通 → 分支管 → 弯头 → …」可以无限递归往下接。
   * 实现：菜单是 body 下的绝对定位 div（不进入 SVG，避免与底图点击互相干扰）；
   *       提交走引擎 planConnect + applyConnect（两段式，事务内 = 一步撤销）。 */
  var CAT_ID = { pipe: 'GEN-PIPE-110', tee: 'GEN-TEE-110-110-110', elbow: 'GEN-ELBOW-110-90', valve: 'GEN-VALVE-110' };
  var CAT_NAME = { pipe: '管道', tee: '三通', elbow: '弯头', valve: '阀门' };
  /* [enrich] 接管时自动随上游管径：查上游 caliber + 按 caliber 选产品型号（2026-09-26） */
  function upstreamCaliber(fid, pid) {
    if (!st.net || !st.net.segments) return null;
    var found = null;
    Object.keys(st.net.segments).forEach(function (sid) {
      var s = st.net.segments[sid];
      if (!s || s.caliber == null) return;
      var str = JSON.stringify(s);
      if (str.indexOf(fid) >= 0) { if (found == null) found = s.caliber; }
    });
    return found;
  }
  function pickCatalogId(type, caliber) {
    var d = caliber || 110;
    var map = {
      pipe: 'GEN-PIPE-' + d,
      tee: 'GEN-TEE-' + d + '-' + d + '-' + d,
      elbow: 'GEN-ELBOW-' + d + '-90',
      valve: 'GEN-VALVE-' + d
    };
    try { if (window.RyCatalog && window.RyCatalog.get(map[type])) return map[type]; } catch (e) {}
    return CAT_ID[type];
  }
  /* 接三通分支口默认小一级：225→160→110→90（灌溉常用主管变支管） */
  function downCaliber(d) {
    var SEQ = [90, 110, 140, 160, 200, 225];
    for (var i = SEQ.length - 1; i > 0; i--) { if (SEQ[i] <= d) return SEQ[i - 1]; }
    return 90;
  }
  /* 与 index.html 主计算保持一致的水力常数与 PE 外径序列（C_HAZEN=150 / SDR=13.6 / PE_OD_SERIES）；
     220 为用户点名的非标规格，一并放进菜单（setCaliber 接受任意合理值） */
  var CAL_C = 150, CAL_SDR = 13.6;
  var CAL_SERIES = [50, 63, 75, 90, 110, 125, 140, 160, 180, 200, 220, 225, 250, 280, 315, 355, 400, 450, 500];
  var popEl = null;
  function popupNode() {
    if (typeof document === 'undefined') return null;
    if (!popEl) {
      popEl = document.createElement('div');
      popEl.id = 'cnPop';
      popEl.className = 'cn-pop';
      popEl.style.display = 'none';
      document.body.appendChild(popEl);
    }
    return popEl;
  }
  function popupHide() { if (popEl) { popEl.style.display = 'none'; popEl.innerHTML = ''; } }
  function popupShow(cx, cy, build) {
    var el = popupNode(); if (!el) return;
    el.innerHTML = '';
    el.style.display = 'block';
    el.style.left = Math.round(cx + 12) + 'px';
    el.style.top = Math.round(cy + 8) + 'px';
    build(el);
    var r = el.getBoundingClientRect();
    if (r.right > window.innerWidth - 8) el.style.left = Math.max(8, window.innerWidth - r.width - 12) + 'px';
    if (r.bottom > window.innerHeight - 8) el.style.top = Math.max(8, window.innerHeight - r.height - 12) + 'px';
  }
  function popHead(el, text) {
    var h = document.createElement('div');
    h.className = 'cn-pop-head';
    h.textContent = text;
    el.appendChild(h);
    return h;
  }
  function popBtn(el, label, fn, cls) {
    var b = btn(label, function (ev) { if (ev && ev.stopPropagation) ev.stopPropagation(); fn(); }, cls);
    el.appendChild(b);
    return b;
  }
  /* 有效来流方向：自由管端取管轴向外（与引擎 planConnect 口径一致） */
  function portEdir(fittingId, portId) {
    var F = st.net && st.net.fittings[fittingId]; if (!F) return null;
    var p = F.ports[portId]; if (!p || !p.dir) return null;
    var pipeEnd = !!p.connected && F.type === 'endpoint' && Object.keys(F.ports).length === 1 &&
      !st.net.fixed[F.id] && st.net.segmentsOf(F.id).length === 1;
    return pipeEnd ? { x: -p.dir.x, y: -p.dir.y } : { x: p.dir.x, y: p.dir.y };
  }
  function openPortMenu(hit, e) {
    if (!st.net || st.viewOnly) return;
    var fid = hit.fitting, pid = hit.port;
    var edir = portEdir(fid, pid);
    var uc = upstreamCaliber(fid, pid) || 110;
    var pc = { pipe: pickCatalogId('pipe', uc), tee: pickCatalogId('tee', uc), elbow: pickCatalogId('elbow', uc), valve: pickCatalogId('valve', uc) };
    popupShow(e.clientX, e.clientY, function (el) {
      popHead(el, '空口 ' + fid + '.' + pid + ' · 接什么（随管 Ø' + uc + '）');
      popBtn(el, '接管道（继续铺管 Ø' + uc + '）', function () { stepPipe(fid, pid, e, pc); });
      popBtn(el, '接三通（主管Ø' + uc + ' × 分支Ø' + downCaliber(uc) + '）', function () { stepPerp('tee', fid, pid, edir, e, pc, uc); });
      popBtn(el, '接弯头 90°（Ø' + uc + '）', function () { stepPerp('elbow', fid, pid, edir, e, pc); });
      popBtn(el, '接阀门（Ø' + uc + '）', function () { doConnect(fid, pid, 'valve', { modelId: pc.valve }); });
      popBtn(el, '取消', popupHide, 'cn-ghost');
    });
  }
  function openSegmentMenu(hit, e) {
    if (!st.net || st.viewOnly) return;
    var sid = hit.id, t = hit.t;
    var inPath = st.path.map[sid];
    popupShow(e.clientX, e.clientY, function (el) {
      popHead(el, '管段 ' + sid + ' · 操作');
      popBtn(el, '插入阀门', function () { popupHide(); insertAtClick(sid, t, 'valve'); });
      popBtn(el, '插入三通', function () { popupHide(); insertAtClick(sid, t, 'tee'); });
      popBtn(el, inPath ? '移出沿线统计' : '加入沿线统计', function () { popupHide(); togglePathSeg(sid); });
      popBtn(el, '改管径…', function () { openCaliberMenu(sid, e); });
      popBtn(el, '取消', popupHide, 'cn-ghost');
    });
  }
  /* ---------- 点管段改管径（2026-09-15 用户要求）----------
   * 选 PE 标准外径（与主计算 PE_OD_SERIES 同序列）→ setCaliber 一步事务（runTx，可撤销）。
   * 与相邻段管径不同时提示连接处需异径接头；改径段在图上画琥珀色线 + Ø 标注。 */
  function openCaliberMenu(sid, e) {
    var s = st.net && st.net.segments[sid]; if (!s) return;
    var cx = (e && e.clientX) || (typeof window !== 'undefined' ? window.innerWidth / 2 : 0);
    var cy = (e && e.clientY) || (typeof window !== 'undefined' ? window.innerHeight / 3 : 0);
    popupShow(cx, cy, function (el) {
      popHead(el, segLabel(s));
      var hint = document.createElement('div');
      hint.className = 'cn-pop-head';
      hint.style.fontWeight = '400';
      hint.textContent = '改 PE 外径（mm）· 当前 ' + (s.caliber != null ? 'Ø' + s.caliber : '未定');
      el.appendChild(hint);
      var grid = document.createElement('div');
      grid.className = 'cn-cal-grid';
      CAL_SERIES.forEach(function (od) {
        var b = btn(od === s.caliber ? '✓ ' + od : String(od), function () {
          var r = runTx(function () { return st.net.setCaliber(sid, od); });
          if (!r || !r.ok) { msg('改径被拒：' + (r ? r.reason : '未知错误'), 'warn'); drawLayer(); renderPanel(); return; }
          popupHide();
          msg('已将 ' + sid + ' 改为 Ø' + od +
            (r.reducerNeeded.length ? '；' + r.reducerNeeded.length + ' 处连接两侧管径不同，需异径接头' : '') +
            '（可撤销）', 'ok');
          drawLayer(); renderPanel();
        }, od === s.caliber ? 'cn-primary' : '');
        b.classList.add('cn-cal-btn');
        grid.appendChild(b);
      });
      el.appendChild(grid);
      popBtn(el, '取消', popupHide, 'cn-ghost');
    });
  }
  /* ---------- 沿线统计（2026-09-15 用户要求）----------
   * 点沿途管段加入统计 → 面板按管径分组合计长度、合计沿程扬程损失
   * （Hazen-Williams，与 index.html 主计算同式同参数：C=150、SDR 13.6 内径、Q 单段同流量）。 */
  function togglePathSeg(sid) {
    if (!st.net || !st.net.segments[sid]) return;
    var i = st.path.ids.indexOf(sid);
    if (i >= 0) { st.path.ids.splice(i, 1); delete st.path.map[sid]; msg('已从沿线统计移除 ' + sid, 'info'); }
    else { st.path.ids.push(sid); st.path.map[sid] = true; msg('已加入沿线统计（共 ' + st.path.ids.length + ' 段）', 'ok'); }
    drawLayer(); renderPanel();
  }
  /* 沿程水头损失：L m、q m³/h、od=PE 外径 mm → m（1.113e9 系数与 index.html hazenWilliams 一致） */
  function hwLoss(L, q, od) {
    var din = od * (1 - 2 / CAL_SDR);            // 内径 mm
    return 1.113e9 * L * Math.pow(q, 1.852) / (Math.pow(CAL_C, 1.852) * Math.pow(din, 4.87));
  }
  /* 流速：q m³/h、od mm → m/s */
  function hwVel(q, od) {
    var din = od * (1 - 2 / CAL_SDR) / 1000;     // m
    return (q / 3600) / (Math.PI * din * din / 4);
  }
  function pathDefaultQ() {
    if (st.pathQ != null) return st.pathQ;
    var pm = st.net && st.net.sourceMeta && st.net.sourceMeta.pump;
    var f = pm ? parseFloat(pm.flow) : NaN;
    return isFinite(f) && f > 0 ? f : null;
  }
  function renderPathStats() {
    var box = document.createElement('div');
    box.className = 'cn-pathstats';
    var groups = {}, totalLen = 0, n = 0;
    st.path.ids.forEach(function (sid) {
      var s = st.net.segments[sid]; if (!s) return;
      var key = s.caliber != null ? s.caliber : 0;
      if (!groups[key]) groups[key] = { len: 0, cnt: 0 };
      groups[key].len += s.length; groups[key].cnt++;
      totalLen += s.length; n++;
    });
    var head = document.createElement('div');
    head.className = 'cn-sel-title';
    head.textContent = '沿线统计 · ' + n + ' 段 · 合计 ' + totalLen.toFixed(1) + ' m';
    box.appendChild(head);
    var q = pathDefaultQ();
    var sumLoss = 0, anyCal = false;
    Object.keys(groups).map(Number).sort(function (a, b) { return a - b; }).forEach(function (od) {
      var g = groups[od];
      var line = document.createElement('div');
      line.className = 'cn-path-row';
      var txt = (od ? 'Ø' + od : '管径未定') + ' × ' + g.cnt + ' 段 · ' + g.len.toFixed(1) + ' m';
      if (od && q) {
        var v = hwVel(q, od), hf = hwLoss(g.len, q, od);
        sumLoss += hf; anyCal = true;
        txt += ' · 流速 ' + v.toFixed(2) + ' m/s · 损失 ' + hf.toFixed(2) + ' m' + ((v < 0.8 || v > 2.0) ? ' ⚠' : '');
        if (v < 0.8 || v > 2.0) line.classList.add('cn-warn-txt');
      }
      line.textContent = txt;
      box.appendChild(line);
    });
    var qrow = document.createElement('div');
    qrow.className = 'cn-row';
    var qlbl = document.createElement('span');
    qlbl.className = 'cn-note';
    qlbl.textContent = '设计流量 Q：';
    qrow.appendChild(qlbl);
    var qin = document.createElement('input');
    qin.type = 'number'; qin.step = '1'; qin.min = '0'; qin.className = 'cn-input cn-input-sm cn-path-q';
    qin.value = q != null ? String(q) : '';
    qin.addEventListener('change', function () {
      var v = parseFloat(qin.value);
      st.pathQ = isFinite(v) && v > 0 ? v : null;
      renderPanel();
    });
    qrow.appendChild(qin);
    qrow.appendChild(document.createTextNode(' m³/h'));
    box.appendChild(qrow);
    var sumRow = document.createElement('div');
    sumRow.className = 'cn-path-sum';
    sumRow.textContent = anyCal
      ? '沿程扬程损失 Σhf = ' + sumLoss.toFixed(2) + ' m（Hazen-Williams，C=' + CAL_C + '，按 SDR ' + CAL_SDR + ' 内径、各段同一设计流量 Q 估算；不含局部损失与配件占位）'
      : '填入设计流量后按 Hazen-Williams（C=' + CAL_C + '，SDR ' + CAL_SDR + ' 内径）估算沿程扬程损失';
    box.appendChild(sumRow);
    var crow = document.createElement('div');
    crow.className = 'cn-row';
    crow.appendChild(btn('清空统计', function () {
      st.path = { ids: [], map: {} };
      msg('已清空沿线统计', 'info');
      drawLayer(); renderPanel();
    }, 'cn-ghost'));
    box.appendChild(crow);
    return box;
  }
  /* ---------- 就地改长（2026-09-15 用户要求）----------
   * 点管段尺寸数值 → 弹菜单填新值 → setSegmentLength 一步事务（runTx，可撤销）。
   * 「自动」基准端 = 引擎优先移动未固定端：改插配件一侧的数值，配件沿管轴滑到新位置，
   *   另一侧管段长度自动吸收（两段之和守恒）；相连管道一起随动。 */
  function openLenMenu(hit, e) {
    if (!st.net || st.viewOnly) return;
    var sid = hit.id;
    var s = st.net.segments[sid]; if (!s) return;
    var aId = s.a.fitting, bId = s.b.fitting;
    var aFix = !!st.net.fixed[aId], bFix = !!st.net.fixed[bId];
    popupShow(e.clientX, e.clientY, function (el) {
      popHead(el, segLabel(s));
      var ends = document.createElement('div');
      ends.className = 'cn-pop-head';
      ends.style.fontWeight = '400';
      ends.textContent = '两端：' + fitLabel(aId) + (aFix ? '◆固定' : '') + ' ⇄ ' + fitLabel(bId) + (bFix ? '◆固定' : '');
      el.appendChild(ends);
      var inp = document.createElement('input');
      inp.type = 'number'; inp.step = '0.1'; inp.min = '0.05'; inp.value = s.length.toFixed(1);
      el.appendChild(inp);
      var sel = document.createElement('select');
      sel.className = 'cn-selbox';
      [['', '基准端（不动）：自动'], ['a', '基准端＝' + fitLabel(aId)], ['b', '基准端＝' + fitLabel(bId)]]
        .forEach(function (o) {
          var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; sel.appendChild(op);
        });
      el.appendChild(sel);
      var pred = document.createElement('div');
      pred.className = 'cn-pop-head';
      pred.style.fontWeight = '400';
      function updPred() {
        var mv = sel.value === 'a' ? bId : sel.value === 'b' ? aId : (bFix ? aId : bId);
        var hard = st.net._isHardAnchor(mv), soft = !!st.net.fixed[mv] && !hard;
        pred.textContent = '将移动：' + fitLabel(mv) + (hard
          ? '（◆硬固定锚点 → 会被拒绝，请换基准端或先解除固定）'
          : soft ? '（◇图纸拐点锚 → 随动平移，下游管网整体跟随）' : '（相连管道一起随动）');
      }
      sel.addEventListener('change', updPred); updPred();
      el.appendChild(pred);
      popBtn(el, '确定（接头随动）', function () {
        var v = parseFloat(inp.value);
        if (!isFinite(v) || v <= 0) { msg('长度必须是正数', 'warn'); return; }
        var opts = (sel.value === 'a' || sel.value === 'b') ? { anchor: sel.value } : {};
        var r = runTx(function () { return st.net.setSegmentLength(sid, v, opts); });
        if (!r || !r.ok) { msg('改长被拒：' + (r ? r.reason : '未知错误'), 'warn'); drawLayer(); renderPanel(); return; }
        st.sel = { type: 'segment', id: sid };
        msg('已改 ' + sid + ' → ' + v + ' m，' + movedSummary(r) + '（可撤销）', 'ok');
        drawLayer(); renderPanel();
      }, 'cn-primary');
      popBtn(el, '取消', popupHide, 'cn-ghost');
      try { inp.focus(); inp.select(); } catch (err) {}
    });
  }
  function stepPipe(fid, pid, e, pc) {
    pc = pc || {};
    popupShow(e.clientX, e.clientY, function (el) {
      popHead(el, '接管道 · ' + (pc.pipe || CAT_ID.pipe) + ' · 填长度');
      var inp = document.createElement('input');
      inp.type = 'number'; inp.step = '0.1'; inp.min = '0.05';
      var lastLen = '1';
      try { lastLen = localStorage.getItem('runye_last_pipe_len') || '1'; } catch (e) {}
      inp.value = lastLen;
      el.appendChild(inp);
      popBtn(el, '确定', function () {
        var v = parseFloat(inp.value);
        if (!isFinite(v) || v <= 0) { msg('长度必须是正数', 'warn'); return; }
        try { localStorage.setItem('runye_last_pipe_len', String(v)); } catch (e) {}
        doConnect(fid, pid, 'pipe', { modelId: pc.pipe || CAT_ID.pipe, length: v });
      }, 'cn-primary');
      popBtn(el, '取消', popupHide, 'cn-ghost');
      try { inp.focus(); inp.select(); } catch (err) {}
    });
  }
  /* 三通分支 / 弯头出口：垂直于来流轴（产品固定 90°），左右两侧可选 */
  function stepPerp(choice, fid, pid, edir, e, pc, uc) {
    if (!edir) return;
    pc = pc || {};
    var modelId;
    if (choice === 'tee') {
      var big = uc || 110, small = downCaliber(big);
      var rid = 'GEN-TEE-' + big + '-' + big + '-' + small;
      modelId = (window.RyCatalog && window.RyCatalog.get(rid)) ? rid : (pc.tee || CAT_ID.tee);
    } else {
      modelId = pc[choice] || CAT_ID[choice];
    }
    var opts = [
      { label: (choice === 'tee' ? '分支' : '出口') + '向右侧', dir: { x: round2(-edir.y), y: round2(edir.x) } },
      { label: (choice === 'tee' ? '分支' : '出口') + '向左侧', dir: { x: round2(edir.y), y: round2(-edir.x) } }
    ];
    popupShow(e.clientX, e.clientY, function (el) {
      popHead(el, (choice === 'tee' ? '接三通 · ' : '接弯头 · ') + modelId + ' · 朝哪边');
      opts.forEach(function (o) {
        popBtn(el, o.label, function () { doConnect(fid, pid, choice, { modelId: modelId, dir: o.dir }); });
      });
      popBtn(el, '取消', popupHide, 'cn-ghost');
    });
  }
  function round2(v) { return Math.round(v * 100) / 100; }
  function doConnect(fid, pid, choice, spec) {
    popupHide();
    if (busy()) { msg('有未确认的预览，请先点【确认】或【取消】', 'warn'); return; }
    var r = runTx(function () {
      var p = st.net.planConnect(fid, pid, choice, spec);
      if (!p.ok) return p;
      return st.net.applyConnect(p);
    });
    if (!r || !r.ok) {
      msg('连接失败：' + (r ? r.reason : '未知错误'), 'warn');
      drawLayer(); renderPanel(); return;
    }
    st.sel = { type: 'fitting', id: r.fittingId };
    st.flashId = r.fittingId;
    setTimeout(function () { st.flashId = null; drawLayer(); }, 2200);
    var tail = (choice === 'pipe') ? '，新管另一端的白圈可继续点着往下接' : '';
    msg('已接' + CAT_NAME[choice] + ' ' + r.fittingId + tail, 'ok');
    drawLayer(); renderPanel();
  }
  /* 点菜单外的任何位置 → 收起菜单（捕获阶段，先于画布点击） */
  if (typeof document !== 'undefined') {
    document.addEventListener('pointerdown', function (ev) {
      if (!popEl || popEl.style.display === 'none') return;
      if (popEl.contains(ev.target)) return;
      popupHide();
    }, true);
  }

  /* ---------- 插入配件 ---------- */
  function insertAtClick(sid, t, typeArg) {
    if (busy()) { msg('有未确认的预览，请先点【确认】或【取消】', 'warn'); return; }
    var s = st.net.segments[sid]; if (!s) return;
    var dAlong = Math.max(0.5, Math.min(s.length - 0.5, t * s.length));
    var type = typeArg || st.insertType || 'valve';
    var r = runTx(function () { return st.net.insertFittingOnSegment(sid, dAlong, type); });
    if (!r.ok) { msg('插入失败：' + r.reason, 'warn'); drawLayer(); renderPanel(); return; }
    st.mode = null; st.flow = null;   // 一次插入完成后退出插入模式
    st.sel = { type: 'fitting', id: r.fittingId };
    msg('已在 ' + sid + ' 上插入' + (type === 'valve' ? '阀门' : '三通') + ' ' + r.fittingId + '，原段拆为 ' + r.segA + ' / ' + r.segB, 'ok');
    drawLayer(); renderPanel();
  }

  /* ---------- 延伸管道流程 ---------- */
  function extendFlow(hit) {
    if (busy()) { msg('有未确认的预览，请先点【确认】或【取消】', 'warn'); return; }
    if (st.flow.step === 1) {
      /* 选自由端：直接点自由端配件，或点管段端部（t<0.12 / >0.88）取该端 */
      var endFitId = null;
      if (hit.type === 'fitting' && isFreeEnd(hit.id)) endFitId = hit.id;
      else if (hit.type === 'segment') {
        var s = st.net.segments[hit.id];
        var nearEnd = hit.t < 0.12 ? 'a' : (hit.t > 0.88 ? 'b' : null);
        if (s && nearEnd && isFreeEnd(s[nearEnd].fitting)) endFitId = s[nearEnd].fitting;
      }
      if (!endFitId) { msg('延伸第 1 步：请点击一个自由端（绿色虚线圈标记的端点）', 'info'); return; }
      var segRef = st.net.segmentsOf(endFitId)[0];
      st.flow = { kind: 'extend', step: 2, endFit: endFitId, segId: segRef.id, side: segRef.a.fitting === endFitId ? 'a' : 'b' };
      msg('延伸第 2 步：点击要接入的目标管段', 'info');
      drawLayer(); renderPanel(); return;
    }
    /* step2：选目标管 */
    if (hit.type !== 'segment') { msg('延伸第 2 步：请点击目标管段', 'info'); return; }
    var plan = st.net.planExtend(st.flow.segId, st.flow.side, hit.id);
    if (!plan.ok) {
      msg('延伸被拒：' + plan.reason + (plan.needReducer ? '（可先调整口径或手动加异径配件）' : ''), 'warn');
      drawLayer(); renderPanel(); return;
    }
    st.preview = { kind: 'extend', plan: plan };
    var note = plan.crossingNote ? '（注意：' + plan.crossingNote + '）' : '';
    msg('延伸预览：' + (plan.summary || '') + note + '。请【确认】提交或【取消】', 'info');
    drawLayer(); renderPanel();
  }
  function applyExtendPreview() {
    var plan = st.preview && st.preview.plan;
    if (!plan) return;
    var r = runTx(function () { return st.net.applyExtend(plan); });
    st.preview = null; st.flow = null; st.mode = null;
    if (!r || !r.ok) { msg('延伸失败：' + (r ? r.reason : '未知'), 'warn'); }
    else {
      st.sel = { type: 'fitting', id: r.fittingId };
      msg('延伸完成' + (r.mode === 'tee' ? '（已生成三通）' : r.mode === 'node' ? '（已接入已有配件空接口）' : '（端点对接）') + '，可撤销', 'ok');
    }
    drawLayer(); renderPanel();
  }

  /* ---------- 修剪管道流程 ---------- */
  function trimFlow(hit) {
    if (busy()) { msg('有未确认的预览，请先点【确认】或【取消】', 'warn'); return; }
    if (st.flow.step === 1) {
      if (hit.type !== 'fitting') { msg('修剪第 1 步：请点击作为边界的配件（阀门/三通等）', 'info'); return; }
      st.flow = { kind: 'trim', step: 2, boundary: hit.id };
      msg('修剪第 2 步：点击边界上要去掉那一侧的管段（红色虚线=将被修剪）', 'info');
      drawLayer(); renderPanel(); return;
    }
    if (hit.type !== 'segment') { msg('修剪第 2 步：请点击要去掉一侧的管段', 'info'); return; }
    var plan = st.net.planTrim(st.flow.boundary, hit.id);
    if (!plan.ok) { msg('修剪被拒：' + plan.reason, 'warn'); drawLayer(); renderPanel(); return; }
    st.preview = { kind: 'trim', plan: plan };
    msg('修剪预览：' + (plan.summary || '') + '。请【确认】提交或【取消】', 'info');
    drawLayer(); renderPanel();
  }
  function applyTrimPreview() {
    var plan = st.preview && st.preview.plan;
    if (!plan) return;
    var r = runTx(function () { return st.net.applyTrim(plan); });
    st.preview = null; st.flow = null; st.mode = null; st.sel = null;
    if (!r || !r.ok) { msg('修剪失败：' + (r ? r.reason : '未知'), 'warn'); }
    else msg('修剪完成：已移除 ' + r.removedSegment + ' 与自由端 ' + r.removedFitting + '，边界接口已释放（可撤销）', 'ok');
    drawLayer(); renderPanel();
  }

  /* ---------- 模型操作 ---------- */
  /* 基准端 → setSegmentLength 的 opts（'auto' 交由模型按「优先移未固定端」决定） */
  function anchorOpts() { return (st.anchor === 'a' || st.anchor === 'b') ? { anchor: st.anchor } : {}; }
  function movedSummary(r) {
    var aff = (r.affectedFittings || []).length, abs = (r.absorbedSegments || []).length;
    var mv = (r.translatedSegments || []).length, rel = (r.releasedFittings || []).length;
    var s = '移动 ' + (r.movedFitting || '');
    if (aff) s += '，带动 ' + aff + ' 个相连配件一起移动';
    if (mv) s += '，' + mv + ' 段管道整体平移（管长和方向保持不变）';
    if (abs) s += '，' + abs + ' 段锚固管线沿原管线重新切分（两侧长度此消彼长，和守恒）';
    if (rel) s += '，下游管网整体跟随（' + rel + ' 个图纸拐点锚随动）';
    if (r.switchedBase) s += '；已自动改以另一端为基准端推进' + (r.blockedBy ? '（原方向被固定端 ' + r.blockedBy + ' 挡住）' : '');
    return s;
  }
  /* 长度输入 = 进入预览事务（模型 beginEdit），确认/取消见面板事务条 */
  function previewSegmentLen(sid, len) {
    var opened = false;
    if (!st.net.isEditing()) {
      if (!st.net.beginEdit()) { msg('无法进入编辑事务', 'warn'); return; }
      opened = true;
    }
    var r = st.net.setSegmentLength(sid, len, anchorOpts());
    if (!r.ok) {
      /* 纯拒绝（本次预览自己开的事务）：直接收掉，避免留下空事务要用户点取消 */
      if (opened) st.net.cancelEdit();
      msg('预览被拒：' + r.reason, 'warn');
    } else {
      msg('预览：' + sid + ' → ' + len + ' m，' + movedSummary(r) + '。请【确认】提交或【取消】', 'info');
    }
    drawLayer(); renderPanel();
  }
  function confirmTx() {
    if (st.preview) {
      applyExtendOrTrim();
      return;
    }
    if (st.net.isEditing()) {
      st.net.commitEdit();
      msg('已确认本次修改（一次撤销步骤）', 'ok');
      drawLayer(); renderPanel();
    }
  }
  function applyExtendOrTrim() {
    if (st.preview && st.preview.kind === 'extend') applyExtendPreview();
    else if (st.preview && st.preview.kind === 'trim') applyTrimPreview();
  }
  function cancelTx() {
    if (st.preview) { st.preview = null; st.flow = null; st.mode = null; st.connChoice = null; msg('已取消预览（未改动模型）', 'info'); drawLayer(); renderPanel(); return; }
    if (st.net.isEditing()) {
      st.net.cancelEdit();
      msg('已取消本次预览，模型恢复到编辑前（不影响历史操作）', 'info');
      drawLayer(); renderPanel();
    }
  }
  function addBranchFromPort(fitId, portId, spec) {
    if (busy()) { msg('有未确认的预览，请先点【确认】或【取消】', 'warn'); return; }
    var r = runTx(function () { return st.net.addBranch(fitId, portId, spec); });
    if (!r || !r.ok) { msg('接管失败：' + (r ? r.reason : ''), 'warn'); drawLayer(); renderPanel(); return; }
    st.sel = { type: 'segment', id: r.segmentId };
    msg('已从空口接管 ' + r.segmentId + '（' + spec.length + ' m），末端为自由端', 'ok');
    drawLayer(); renderPanel();
  }
  function doUndo() {
    if (!st.net) return;
    if (busy()) { msg('有未确认的预览，请先点【确认】或【取消】再撤销', 'warn'); return; }
    if (st.net.undo()) { msg('已撤销一步', 'ok'); } else { msg('没有可撤销的操作', 'info'); }
    drawLayer(); renderPanel();
  }
  /* [enrich] Ctrl+Z 撤销快捷键（2026-09-26） */
  if (typeof document !== 'undefined') {
    document.addEventListener('keydown', function (e) {
      if (!st.active || busy()) return;
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        var tag = (document.activeElement && document.activeElement.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault(); doUndo();
      }
    });
  }
  /* [enrich] 把施工管网主管长上报回主程序水力计算（2026-09-26，打破只读红线） */
  function doReportToMain() {
    if (!st.net) return;
    var groups = {};
    Object.keys(st.net.segments).forEach(function (sid) {
      var s = st.net.segments[sid];
      if (!s || s.caliber == null) return;
      if (!groups[s.caliber]) groups[s.caliber] = 0;
      groups[s.caliber] += s.length || 0;
    });
    var keys = Object.keys(groups).map(Number).sort(function (a, b) { return b - a; });
    if (!keys.length) { msg('施工管网还没有带管径的管段，先接管或改径', 'warn'); return; }
    var mainCal = keys[0], mainLen = groups[mainCal];
    var summary = keys.map(function (k) { return 'Ø' + k + ' ' + groups[k].toFixed(1) + 'm'; }).join(' · ');
    if (!confirm('施工管网按管径统计：\n' + summary + '\n\n把主管（Ø' + mainCal + '）总长 ' + mainLen.toFixed(1) + ' m\n填回主程序「主管长度」并触发重算？\n（会覆盖当前主程序里填的值）')) return;
    var el = document.getElementById('fld_mainPipeLen') || document.getElementById('tl_mainPipeLen');
    if (!el) { msg('找不到主程序主管长度输入框', 'warn'); return; }
    el.value = Math.round(mainLen);
    el.dispatchEvent(new Event('change', { bubbles: true }));
    msg('已上报 Ø' + mainCal + ' 主管 ' + mainLen.toFixed(1) + ' m 到主程序，已触发重算', 'ok');
  }
  function doSave() {
    if (!st.net) return;
    if (busy()) { msg('有未确认的预览：请先【确认】提交或【取消】，保存不含未确认的预览', 'warn'); return; }
    try {
      /* 几何签名不同的旧存档先归档保留（不删除） */
      var raw = localStorage.getItem(storeKey());
      if (raw) {
        try {
          var old = JSON.parse(raw);
          if (old && old.saved && old.saved.sourceKey && old.saved.sourceKey !== st.net.sourceKey)
            localStorage.setItem(storeKey() + ':legacy-' + Date.now(), raw);
        } catch (e) { /* 损坏旧档不归档 */ }
      }
      localStorage.setItem(storeKey(), JSON.stringify({ sourceKey: st.net.sourceKey, saved: st.net.serialize(), at: new Date().toISOString() }));
      msg('已保存本机（' + Object.keys(st.net.fittings).length + ' 配件 / ' + Object.keys(st.net.segments).length + ' 管段，方案 ' + (window.currentPlotId || 'current') + '）。刷新页面后点【启用】自动恢复。', 'ok');
    } catch (err) { msg('保存失败：' + err.message, 'warn'); }
  }
  function doRemoveFitting(id) {
    if (busy()) { msg('有未确认的预览，请先点【确认】或【取消】', 'warn'); return; }
    var r = runTx(function () { return st.net.removeFitting(id); });
    if (!r || !r.ok) { msg('删除失败：' + (r ? r.reason : ''), 'warn'); return; }
    st.sel = null;
    msg('已删除 ' + id + ' 及其相连管段（可撤销）', 'ok');
    drawLayer(); renderPanel();
  }

  /* ---------- 模式切换 ---------- */
  function setMode(m) {
    if (busy()) { msg('有未确认的预览，请先点【确认】或【取消】', 'warn'); return; }
    if (st.mode === m) { st.mode = null; st.flow = null; }
    else { st.mode = m; st.flow = m === 'extend' ? { kind: 'extend', step: 1 } : m === 'trim' ? { kind: 'trim', step: 1 } : null; }
    var tips = {
      insert: st.mode === 'insert' ? '插入模式：点击图中管段，按点击位置插入' : null,
      extend: st.mode === 'extend' ? '延伸第 1 步：点击一个自由端（绿色虚线圈标记的端点）' : null,
      trim: st.mode === 'trim' ? '修剪第 1 步：点击作为边界的配件' : null,
    };
    if (tips[m]) msg(tips[m], 'info');
    drawLayer(); renderPanel();
  }

  /* ---------- 启用 / 退出 / 存档选择 ---------- */
  function adoptSaved(savedObj, source) {
    var d = planData();
    var res = NM.ConstructionNetwork.deserialize(savedObj, NM.geometryKey(d));
    if (res.error) { msg((source || '存档') + '校验失败：' + res.error + '，已忽略并从当前管网新建', 'warn'); return false; }
    if (res._legacyMismatch) {
      /* 几何签名不符：不自动套用，给出明确选择 */
      st.pendingChoice = { saved: savedObj, source: source || '本机旧存档' };
      st.net = res;
      st.viewOnly = true;
      netReplaced();
      msg('存档来自不同平面图几何，未自动套用：可【查看旧快照】（只读）或【从当前管网新建】。旧存档会保留。', 'warn');
      return true;
    }
    st.net = res; st.viewOnly = false;
    netReplaced();
    msg('已恢复' + (source || '上次保存的施工方案'), 'ok');
    return true;
  }
  function viewLegacySnapshot() {
    if (!st.pendingChoice) return;
    var res = NM.ConstructionNetwork.deserialize(st.pendingChoice.saved, NM.geometryKey(planData()));
    if (res.error) { msg('旧快照校验失败：' + res.error, 'warn'); return; }
    st.net = res; st.viewOnly = true;
    netReplaced();
    msg('正在查看旧快照（只读，不会改动）。要编辑当前方案请点【从当前管网新建】。', 'info');
    drawLayer(); renderPanel();
  }
  function newFromCurrentPlan() {
    var d = planData();
    if (!d) { msg('请先生成三级管线平面图', 'warn'); return; }
    /* 旧存档归档保留（本机存档场景）；主方案场景旧数据仍存于主方案文件 */
    var raw = localStorage.getItem(storeKey());
    if (raw) {
      try {
        var old = JSON.parse(raw);
        if (old && old.saved && old.saved.sourceKey && d && old.saved.sourceKey !== NM.geometryKey(d))
          localStorage.setItem(storeKey() + ':legacy-' + Date.now(), raw);
      } catch (e) { /* ignore */ }
    }
    st.net = new NM.ConstructionNetwork().fromPlan(d);
    netReplaced();
    st.viewOnly = false; st.pendingChoice = null; st.sel = null;
    if (!st.net) { msg('平面数据版本不支持，无法建立施工模型', 'warn'); return; }
    var u = st.net.notes.uncertain.length;
    msg('已从当前平面图新建施工管网副本' + (u ? '（' + u + ' 处连接待确认）' : ''), u ? 'warn' : 'ok');
    drawLayer(); renderPanel();
  }
  function enable() {
    if (EDITOR_OFF) return;   /* 2026-09-15 已下线：任何入口（含旧存档/主方案导入）都不得再启用 */
    var d = planData();
    if (!d) { msg('请先生成三级管线平面图，再启用施工编辑', 'warn'); return; }
    /* 关键：切换方案/无存档时必须重建模型——绝不能沿用上一方案的 st.net（串方案） */
    st.net = null; st.viewOnly = false; st.pendingChoice = null;
    st.sel = null; st.mode = null; st.flow = null; st.preview = null; st.connChoice = null;
    var restored = false;
    if (st.projectNet) {
      var pn = st.projectNet; st.projectNet = null;
      restored = adoptSaved(pn.saved, '主方案中的施工模型');
    }
    if (!restored) {
      try {
        var raw = localStorage.getItem(storeKey());
        if (raw) {
          var obj = JSON.parse(raw);
          if (obj && obj.saved) restored = adoptSaved(obj.saved, null);
        }
      } catch (err) { /* 存档损坏则重建 */ }
    }
    if (!st.net) {
      st.net = new NM.ConstructionNetwork().fromPlan(d);
      netReplaced();
      if (!st.net) { msg('平面数据版本不支持，无法建立施工模型', 'warn'); return; }
      if (!restored) {
        var u = st.net.notes.uncertain.length;
        msg('已从平面图建立施工管网副本' + (u ? '（' + u + ' 处连接待确认，见明细）' : ''), u ? 'warn' : 'ok');
      }
    }
    /* [cleanup] 隐藏与施工编辑器重复的旧左栏卡片（2026-09-26 用户要求只留施工接管一套） */
    try {
      ['tlIsoAutoCard','tlIsoInfoCard'].forEach(function(id){ var el=document.getElementById(id); if(el) el.style.display='none'; });
      var kinds=document.getElementById('tlIsoKinds'); if(kinds){ var card=kinds.closest('.tl-iso-card'); if(card) card.style.display='none'; }
      var hint=document.getElementById('tlIsoPipeHint'); if(hint){ var hc=hint.closest('.tl-iso-card'); if(hc) hc.style.display='none'; }
    } catch(e) {}
    st.active = true;
    wireHost();
    watchHosts();
    drawLayer(); renderPanel();
  }
  /* 监听宿主：两个视图容器都可能被整体重绘（重新生成管线图 / 轴测重渲染），
     外加 data-ry-view 切换（平面 ↔ 轴测）都要重新挂接并重画叠加层 */
  function wireHost() {
    watchPlotGroup();     /* 平面图地块组被拖动时叠加层要跟着走 */
    var svg = hostSvg();
    if (!svg || st.hostSvg === svg) return;
    detachHost();
    st.onClick = onClick;
    st.onDown = function (e) { st.down = { x: e.clientX, y: e.clientY }; };
    st.onMove = onMove;
    st.onLeave = function () { st.hoverKey = null; drawHover('', null); };
    svg.addEventListener('click', st.onClick);
    svg.addEventListener('pointerdown', st.onDown);
    svg.addEventListener('pointermove', st.onMove);
    svg.addEventListener('pointerleave', st.onLeave);
    st.hostSvg = svg;
  }
  function detachHost() {
    var prev = st.hostSvg;
    if (prev) {
      if (st.onClick) prev.removeEventListener('click', st.onClick);
      if (st.onDown) prev.removeEventListener('pointerdown', st.onDown);
      if (st.onMove) prev.removeEventListener('pointermove', st.onMove);
      if (st.onLeave) prev.removeEventListener('pointerleave', st.onLeave);
    }
    st.hostSvg = null;
  }
  function watchHosts() {
    if (typeof document === 'undefined' || st.obs) return;
    st.obs = new MutationObserver(function () { requestAnimationFrame(onHostMutated); });
    ['tlIsoDiagramContent', 'tlDiagramContent'].forEach(function (id) {
      var ctn = document.getElementById(id);
      if (ctn) st.obs.observe(ctn, { childList: true, subtree: false });
    });
    var sec = document.getElementById('tlPipePlanSection');
    if (sec) st.obs.observe(sec, { attributes: true, attributeFilter: ['data-ry-view'] });
  }
  /* 平面图 #tlPlotGroup 的 translate 变了（用户拖动地块组）→ 叠加层跟着重画。
     重新生成图纸会整块换掉该节点，故每次 wireHost 都复核一次观察目标。 */
  function watchPlotGroup() {
    if (typeof document === 'undefined') return;
    var pg = document.getElementById('tlPlotGroup');
    if (st.plotObs && st.plotObsTarget === pg) return;
    if (st.plotObs) { st.plotObs.disconnect(); st.plotObs = null; }
    st.plotObsTarget = null;
    if (!pg) return;
    st.plotObsTarget = pg;
    st.plotObs = new MutationObserver(function () {
      requestAnimationFrame(function () { if (st.active && st.net) drawLayer(); });
    });
    st.plotObs.observe(pg, { attributes: true, attributeFilter: ['transform'] });
  }
  function onHostMutated() {
    if (typeof document === 'undefined') return;
    /* 尚未启用但已有平面数据（刚生成管线图）→ 自动启用，免去用户找入口 */
    if (!st.active && planData && planData()) { try { enable(); } catch (e) { return; } }
    if (!st.active) return;
    wireHost();
    popupHide();
    drawLayer(); renderPanel();
  }
  function disable() {
    /* 有未确认预览时退出：取消预览（不静默提交） */
    if (st.net && st.net.isEditing()) st.net.cancelEdit();
    st.active = false; st.sel = null; st.mode = null; st.flow = null; st.preview = null; st.connChoice = null; st.viewOnly = false;
    detachHost();
    popupHide();
    if (st.layer && st.layer.parentNode) st.layer.parentNode.removeChild(st.layer);
    st.layer = null;
    if (st.hoverLayer && st.hoverLayer.parentNode) st.hoverLayer.parentNode.removeChild(st.hoverLayer);
    st.hoverLayer = null;
    st.hoverKey = null;
    renderPanel();
  }

  /* ---------- 面板（#tlIsoSide 注入卡片） ---------- */
  function panelCard() { return document.getElementById('cnPanelCard'); }
  /* 面板挂在当前视图的左栏：轴测 → #tlIsoSide，平面 → #tlSide（同一节点按需搬移，
     id/事件随身走，业务 JS 无感）。 */
  function sideHost() {
    var want = activeView() === 'iso' ? 'tlIsoSide' : 'tlSide';
    var alt = want === 'tlIsoSide' ? 'tlSide' : 'tlIsoSide';
    return document.getElementById(want) || document.getElementById(alt);
  }
  function ensureCard() {
    var side = sideHost();
    if (!side) return;
    var card = panelCard();
    if (card) {
      if (card.parentNode !== side) side.appendChild(card);
      return;
    }
    card = document.createElement('div');
    card.className = 'tl-iso-card cn-card';
    card.id = 'cnPanelCard';
    side.appendChild(card);
  }
  function btn(label, fn, cls) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'cn-btn' + (cls ? ' ' + cls : '');
    b.textContent = label; b.addEventListener('click', fn);
    return b;
  }
  function numInput(value, step, fn) {
    var i = document.createElement('input');
    i.type = 'number'; i.step = step || '0.1'; i.min = '0.05';
    i.value = value; i.className = 'cn-input';
    i.addEventListener('change', function () { var v = parseFloat(i.value); if (Number.isFinite(v)) fn(v); });
    return i;
  }

  function renderPanel() {
    ensureCard();
    var card = panelCard(); if (!card) return;
    card.innerHTML = '';
    var h = document.createElement('div');
    h.className = 'cn-head';
    h.innerHTML = '<span class="cn-title">管网装配（' + (activeView() === 'iso' ? '轴测图' : '平面图') + '）</span>';
    h.appendChild(st.active ? btn('退出', disable, 'cn-ghost') : btn('启用', enable, 'cn-primary'));
    card.appendChild(h);

    if (!st.active) {
      var tip0 = document.createElement('div');
      tip0.className = 'cn-note';
      tip0.textContent = '按施工逻辑编辑管道：点总管/主管中部插入阀门或三通；点白圈（空口）就地接管道/三通/弯头/阀门（可无限递归）；点尺寸数值就地改长，插上的配件沿管轴随动；点管身可改管径（Ø160→180/220…）或加入沿线统计（自动合计各管径长度与沿程扬程损失）。尺寸为中心到中心长度（米），非切管下料长度。';
      card.appendChild(tip0);
      return;
    }
    if (!st.net) { return; }

    /* 摘要 */
    var sum = st.net.computeStats();
    var catLvl = (typeof window !== 'undefined' && window.RyCatalog) ? window.RyCatalog.level() : 'generic';
    var info = document.createElement('div');
    info.className = 'cn-summary';
    info.innerHTML = '配件 <b>' + sum.fittingCount + '</b> · 管段 <b>' + sum.segmentCount + '</b> · 总长 <b>' +
      sum.totalLength.toFixed(1) + '</b> m · 下料参考 <b>' + sum.cutRef.toFixed(1) + '</b> m（扣占位）· 空口 <b>' + sum.freePorts + '</b>' +
      (catLvl === 'generic' ? ' · <span class="cn-warn-txt">通用施工示意</span>' : '') +
      (sum.uncertain ? ' · <span class="cn-warn-txt">待确认 ' + sum.uncertain + '</span>' : '') +
      (st.viewOnly ? ' · <span class="cn-warn-txt">只读查看</span>' : '');
    card.appendChild(info);
    /* [enrich] 配件分类明细 + 按管径管长汇总（2026-09-26） */
    (function () {
      var KN = { valve: '阀门', tee: '三通', elbow: '弯头', reducer: '异径接头', cap: '封堵', source: '水源', endpoint: '端点' };
      var byKind = sum.fittingsByType || {};
      var parts = [];
      Object.keys(byKind).forEach(function (k) { if (KN[k]) parts.push(KN[k] + ' ' + byKind[k]); });
      if (parts.length) {
        var d1 = document.createElement('div'); d1.className = 'cn-note';
        d1.textContent = '配件明细：' + parts.join(' · ');
        card.appendChild(d1);
      }
      var byCal = {};
      Object.keys(st.net.segments).forEach(function (id) {
        var s = st.net.segments[id]; var c = s.caliber || '?';
        byCal[c] = (byCal[c] || 0) + s.length;
      });
      var cp = Object.keys(byCal).sort(function (a, b) { return (+b) - (+a); }).map(function (c) { return 'Ø' + c + ' ' + byCal[c].toFixed(1) + 'm'; });
      if (cp.length) {
        var d2 = document.createElement('div'); d2.className = 'cn-note';
        d2.textContent = '按管径：' + cp.join(' · ');
        card.appendChild(d2);
      }
    })();
    if (catLvl === 'generic') {
      var prec = document.createElement('div');
      prec.className = 'cn-note';
      prec.textContent = '精度标注：当前型号均为「通用施工示意」，仅作方案示意；替换为已核实厂家资料后可作选型依据，实测核减后才能精确下料。';
      card.appendChild(prec);
    }

    /* 沿线统计（2026-09-15 用户要求）：点沿途管段 → 各管径长度合计 + 沿程扬程损失 */
    if (st.path.ids.length && st.net) {
      card.appendChild(renderPathStats());
    }

    /* 消息 */
    if (st.msg) {
      var m = document.createElement('div');
      m.className = 'cn-msg cn-msg-' + st.msgKind;
      m.textContent = st.msg;
      card.appendChild(m);
    }

    /* 旧存档选择（几何签名不符，未自动套用） */
    if (st.pendingChoice) {
      var pc = document.createElement('div');
      pc.className = 'cn-legacy';
      pc.innerHTML = '<div class="cn-note cn-legacy-title">发现与当前平面图不符的' + (st.pendingChoice.source || '旧存档') + '（未自动套用）</div>';
      pc.appendChild(btn('查看旧快照', viewLegacySnapshot));
      pc.appendChild(btn('从当前管网新建', newFromCurrentPlan, 'cn-primary'));
      card.appendChild(pc);
      if (st.viewOnly) {
        var vo = document.createElement('div');
        vo.className = 'cn-note';
        vo.textContent = '只读查看模式：图中为旧快照内容，任何编辑均已停用。';
        card.appendChild(vo);
      }
    }

    /* 编辑事务条：预览中 → 确认 / 取消 */
    if (busy()) {
      var tx = document.createElement('div');
      tx.className = 'cn-txbar';
      var label = st.preview
        ? (st.preview.kind === 'extend' ? '延伸预览中（未提交）' : '修剪预览中（未提交）')
        : '尺寸预览中（未确认）';
      tx.innerHTML = '<span class="cn-tx-label">' + label + '</span>';
      tx.appendChild(btn('确认', confirmTx, 'cn-primary'));
      tx.appendChild(btn('取消', cancelTx, 'cn-danger'));
      card.appendChild(tx);
    }

    /* 操作行 */
    var row = document.createElement('div');
    row.className = 'cn-row';
    var undoBtn = btn('↩ 撤销', doUndo);
    if (busy()) undoBtn.disabled = true;
    row.appendChild(undoBtn);
    row.appendChild(btn('📤 上报主管长', doReportToMain, 'cn-ghost'));
    var saveBtn = btn('💾 保存', doSave);
    if (busy()) saveBtn.disabled = true;
    row.appendChild(saveBtn);
    card.appendChild(row);

    /* 功能模式：插入 / 延伸 / 修剪（中文按钮，无快捷键依赖） */
    if (!st.viewOnly) {
      var tools = document.createElement('div');
      tools.className = 'cn-row';
      var insBtn = btn('插入配件', function () { setMode('insert'); }, st.mode === 'insert' ? 'cn-active' : '');
      var extBtn = btn('延伸管道', function () { setMode('extend'); }, st.mode === 'extend' ? 'cn-active' : '');
      var trimBtn = btn('修剪管道', function () { setMode('trim'); }, st.mode === 'trim' ? 'cn-active' : '');
      if (busy()) { insBtn.disabled = extBtn.disabled = trimBtn.disabled = true; }
      tools.appendChild(insBtn); tools.appendChild(extBtn); tools.appendChild(trimBtn);
      card.appendChild(tools);

      /* 插入类型选择（插入模式时显示） */
      if (st.mode === 'insert') {
        var insRow = document.createElement('div');
        insRow.className = 'cn-row';
        var sel1 = document.createElement('label');
        sel1.className = 'cn-radio';
        sel1.innerHTML = '<input type="radio" name="cnInsertType" value="valve"' + ((st.insertType || 'valve') === 'valve' ? ' checked' : '') + '>阀门';
        var sel2 = document.createElement('label');
        sel2.className = 'cn-radio';
        sel2.innerHTML = '<input type="radio" name="cnInsertType" value="tee"' + (st.insertType === 'tee' ? ' checked' : '') + '>三通';
        insRow.appendChild(sel1); insRow.appendChild(sel2);
        insRow.appendChild(btn('收起', function () { setMode('insert'); }, 'cn-ghost'));
        card.appendChild(insRow);
        insRow.querySelectorAll('input[name=cnInsertType]').forEach(function (r) {
          r.addEventListener('change', function () { st.insertType = r.value; });
        });
      }
      /* 延伸/修剪流程步骤提示（2026-09-14 起始管道流程已随逐件接管功能下线） */
      if (st.flow && !st.preview) {
        var fh = document.createElement('div');
        fh.className = 'cn-flow';
        fh.textContent = st.flow.kind === 'extend'
          ? (st.flow.step === 1 ? '延伸 · 第 1/2 步：点击自由端（图中绿色虚线圈）' : '延伸 · 第 2/2 步：点击目标管段')
          : (st.flow.step === 1 ? '修剪 · 第 1/2 步：点击边界配件' : '修剪 · 第 2/2 步：点击要去掉一侧的管段');
        fh.appendChild(btn('取消流程', function () { setMode(st.flow.kind); }, 'cn-ghost'));
        card.appendChild(fh);
      }
    }

    /* 待确认明细（有则展示） */
    if (st.net.notes.uncertain.length || st.net.notes.elevations.length) {
      var det = document.createElement('details');
      det.className = 'cn-details';
      var s2 = document.createElement('summary');
      s2.textContent = '待确认明细（' + (st.net.notes.uncertain.length + st.net.notes.elevations.length) + '）';
      det.appendChild(s2);
      st.net.notes.uncertain.concat(st.net.notes.elevations).forEach(function (u) {
        var li = document.createElement('div');
        li.className = 'cn-detail-item';
        li.textContent = '· ' + u;
        det.appendChild(li);
      });
      card.appendChild(det);
    }

    /* 选中对象 */
    var selBox = document.createElement('div');
    selBox.className = 'cn-sel';
    if (!st.sel) {
      /* ★ 文案长度须 ≤ 补丁前的「◆=固定端」版（85 < 87 字）：常驻说明多折一行会让
         verify_simplify_equivalence.js 第 3 层全站计算样式多出 6 项 +16.8px 差异。 */
      selBox.innerHTML = '<div class="cn-note">点击配件/尺寸/管身/空口编辑：管身可改管径或加入沿线统计（蓝虚线=统计选中，琥珀=已改径）。图例：◆硬锚（墙），◇图纸拐点锚（随下游整段平移），○空接口，绿虚圈可延伸。</div>';
    } else if (st.sel.type === 'fitting') {
      var f = st.net.fittings[st.sel.id];
      if (f) {
        selBox.innerHTML = '<div class="cn-sel-title">' + fitLabel(f.id) +
          ' <span class="cn-badge">' + (st.net.fixed[f.id] ? '已固定' : '自由') + '</span></div>';
        if (f.productId && typeof window !== 'undefined' && window.RyCatalog) {
          var pit = window.RyCatalog.get(f.productId);
          if (pit) {
            var pl = document.createElement('div');
            pl.className = 'cn-note';
            pl.textContent = '型号：' + pit.model + ' · ' + pit.brand + ' · ' + pit.material +
              (pit.pressure ? ' · ' + pit.pressure : '') + ' · 占位 ' + (pit.placeholder || 0) + ' m · 来源：' + pit.source;
            selBox.appendChild(pl);
          }
        }
        var segsOf = st.net.segmentsOf(f.id);
        segsOf.forEach(function (s) {
          var line = document.createElement('button');
          line.type = 'button'; line.className = 'cn-segref';
          line.textContent = segLabel(s);
          line.addEventListener('click', function () { st.sel = { type: 'segment', id: s.id }; st.anchorFor = s.id; st.anchor = 'auto'; drawLayer(); renderPanel(); });
          selBox.appendChild(line);
        });
        var free = st.net.freePorts(f.id);
        if (free.length) {
          var hint = document.createElement('div');
          hint.className = 'cn-note';
          hint.textContent = '空接口 ' + free.map(function (x) { return x.port; }).join('、') + '：点击图中白圈空口即可接管';
          selBox.appendChild(hint);
        }
        if (!st.viewOnly) {
          var brow = document.createElement('div');
          brow.className = 'cn-row';
        /* 真实工程高程：未确认=null；左栏提供确认/输入入口（需求一） */
        var elevRow = document.createElement('div');
        elevRow.className = 'cn-row cn-elev';
        var elevLbl = document.createElement('span');
        elevLbl.className = 'cn-elev-lbl';
        elevLbl.textContent = '真实高程：' + (f.elevation == null ? '未确认' : (f.elevation + ' m'));
        elevRow.appendChild(elevLbl);
        if (!st.viewOnly) {
          var elevInput = document.createElement('input');
          elevInput.type = 'number'; elevInput.step = '0.1'; elevInput.min = '-100'; elevInput.placeholder = '如 12.5';
          elevInput.className = 'cn-input cn-elev-input';
          var elevSet = btn('确认高程', function () {
            if (busy()) { msg('有未确认的预览，请先点【确认】或【取消】', 'warn'); return; }
            var v = parseFloat(elevInput.value);
            if (!Number.isFinite(v)) { msg('请输入真实高程（米），如 12.5；暂无法测量时保持「未确认」', 'warn'); return; }
            var fid = f.id;
            var r = runTx(function () { st.net.fittings[fid].elevation = v; return { ok: true }; });
            if (r && r.ok) { msg('已确认 ' + fid + ' 真实高程 ' + v + ' m', 'ok'); drawLayer(); renderPanel(); }
          }, 'cn-primary');
          var elevUnk = btn('标为未确认', function () {
            if (busy()) { msg('有未确认的预览，请先点【确认】或【取消】', 'warn'); return; }
            var fid = f.id;
            var r = runTx(function () { st.net.fittings[fid].elevation = null; return { ok: true }; });
            if (r && r.ok) { msg('已将 ' + fid + ' 真实高程标为未确认', 'info'); drawLayer(); renderPanel(); }
          }, 'cn-ghost');
          if (busy()) { elevInput.disabled = true; elevSet.disabled = true; elevUnk.disabled = true; }
          elevRow.appendChild(elevInput);
          elevRow.appendChild(elevSet);
          elevRow.appendChild(elevUnk);
        }
        selBox.appendChild(elevRow);
          var pinBtn = btn(st.net.fixed[f.id] ? '解除固定' : '固定', function () {
            if (busy()) { msg('有未确认的预览，请先点【确认】或【取消】', 'warn'); return; }
            if (st.net.fixed[f.id]) { runTx(function () { return { ok: st.net.unpin(f.id) }; }); msg(f.id + ' 已解除固定', 'ok'); }
            else { runTx(function () { return { ok: st.net.pin(f.id) }; }); msg(f.id + ' 已固定（作为约束锚点）', 'ok'); }
            drawLayer(); renderPanel();
          });
          var delBtn = btn('删除', function () { doRemoveFitting(f.id); }, 'cn-danger');
          if (busy()) pinBtn.disabled = delBtn.disabled = true;
          brow.appendChild(pinBtn); brow.appendChild(delBtn);
          selBox.appendChild(brow);

          /* 沿管轴移动接头（三通/阀门）：接头沿所在直管滑动，相连管道一起随动 */
          if (f.type === 'valve' || f.type === 'tee' || f.type === 'tee-front') {
            var segsAll = st.net.segmentsOf(f.id);
            if (segsAll.length) {
              /* 管轴 = 共线对数最多的那条直通轴（与模型 moveFitting 的轴向守卫同口径）：
                 三通上挂着垂直分支时，管轴仍是它所在的那条直管，不会因分支被判成「不共线」而消失 */
              var bestAxis = null, bestCnt = 0;
              segsAll.forEach(function (s0) {
                var cnt = segsAll.filter(function (s) {
                  return Math.abs(s.dir.x * s0.dir.y - s.dir.y * s0.dir.x) < 1e-3;
                }).length;
                if (cnt > bestCnt) { bestCnt = cnt; bestAxis = s0.dir; }
              });
              var coll = bestAxis ? segsAll.filter(function (s) {
                return Math.abs(s.dir.x * bestAxis.y - s.dir.y * bestAxis.x) < 1e-3;
              }) : [];
              if (bestAxis && bestCnt >= 2) {
                var axisSeg = coll.filter(function (s) { return s.a.fitting === f.id; })[0] || coll[0];
                var axis = axisSeg.dir;
                var mvRow = document.createElement('div');
                mvRow.className = 'cn-row cn-axmove';
                var mvLbl = document.createElement('span');
                mvLbl.className = 'cn-note';
                mvLbl.textContent = '沿管轴移动：';
                mvRow.appendChild(mvLbl);
                var mvIn = document.createElement('input');
                mvIn.type = 'number'; mvIn.step = '0.5'; mvIn.value = '1'; mvIn.className = 'cn-input cn-input-sm';
                var mvBtn = btn('移动', function () {
                  if (busy()) { msg('有未确认的预览，请先点【确认】或【取消】', 'warn'); return; }
                  var d = parseFloat(mvIn.value);
                  if (!Number.isFinite(d) || d === 0) { msg('请输入非零位移（米）', 'warn'); return; }
                  var fid0 = f.id, np = { x: f.pos.x + axis.x * d, y: f.pos.y + axis.y * d };
                  var r = runTx(function () { return st.net.moveFitting(fid0, np); });
                  if (!r || !r.ok) msg('移动被拒：' + (r ? r.reason : ''), 'warn');
                  else msg('已沿管轴移动 ' + fid0 + ' ' + d + ' m，' + movedSummary(r) + '（可撤销）', 'ok');
                  drawLayer(); renderPanel();
                }, 'cn-primary');
                if (busy()) { mvIn.disabled = true; mvBtn.disabled = true; }
                mvRow.appendChild(mvIn);
                mvRow.appendChild(document.createTextNode(' m'));
                mvRow.appendChild(mvBtn);
                selBox.appendChild(mvRow);
                var mvh = document.createElement('div');
                mvh.className = 'cn-note';
                mvh.textContent = '正值＝沿 ' + axisSeg.a.fitting + ' → ' + axisSeg.b.fitting + ' 方向。接头沿管轴滑动时相连管道一起随动：自由端与图纸拐点锚（◇）整体平移（管长与方向保持不变），落在锚固管线上的沿该管线重新切分；离开管轴、推过锚固端或撞上硬固定端（◆）会被拒绝。';
                selBox.appendChild(mvh);
              }
            }
          }
        }
      }
    } else if (st.sel.type === 'segment') {
      var s3 = st.net.segments[st.sel.id];
      if (s3) {
        if (st.anchorFor !== s3.id) { st.anchorFor = s3.id; st.anchor = 'auto'; }   // 换管段→基准端回自动
        var aId = s3.a.fitting, bId = s3.b.fitting;
        var aFix = !!st.net.fixed[aId], bFix = !!st.net.fixed[bId];
        selBox.innerHTML = '<div class="cn-sel-title">' + segLabel(s3) + '</div>' +
          '<div class="cn-note">两端：' + fitLabel(aId) + (aFix ? ' ◆固定' : ' 自由') + ' ⇄ ' +
            fitLabel(bId) + (bFix ? ' ◆固定' : ' 自由') + '</div>' +
          '<div class="cn-note">长度为中心到中心距离（米）。改长时，另一端的接头（三通/阀门）按新长度移动，' +
            '它上面相连的管道一起随动：连接的自由分支/阀门/弯头整体平移（管长与方向保持不变），' +
            '落在锚固管线上的沿该管线重新切分（两侧长度此消彼长）；只有硬固定端（◆）才可能拦下操作。</div>';
        if (!st.viewOnly) {
          /* 基准端选择：不动的一端；另一端按新长度移动 */
          var arow = document.createElement('div');
          arow.className = 'cn-row cn-anchor';
          var albl = document.createElement('span');
          albl.className = 'cn-note';
          albl.textContent = '基准端（不动）：';
          arow.appendChild(albl);
          [['auto', '自动'], ['a', fitLabel(aId).replace(/^(\S+)\s/, '$1') + (aFix ? '◆' : '')],
           ['b', fitLabel(bId).replace(/^(\S+)\s/, '$1') + (bFix ? '◆' : '')]].forEach(function (o) {
            var lab = document.createElement('label');
            lab.className = 'cn-radio';
            var rd = document.createElement('input');
            rd.type = 'radio'; rd.name = 'cnAnchor'; rd.value = o[0];
            if ((st.anchor || 'auto') === o[0]) rd.checked = true;
            rd.addEventListener('change', function () { st.anchor = o[0]; renderPanel(); });
            lab.appendChild(rd);
            lab.appendChild(document.createTextNode(o[1]));
            arow.appendChild(lab);
          });
          selBox.appendChild(arow);

          /* 预测提示：本次改长将移动哪一个接头 */
          var moveEnd = st.anchor === 'a' ? 'b' : st.anchor === 'b' ? 'a' : (bFix ? 'a' : 'b');
          var moveId = moveEnd === 'a' ? aId : bId;
          var mh = document.createElement('div');
          var mvHard = st.net._isHardAnchor(moveId);
          var mvSoft = !!st.net.fixed[moveId] && !mvHard;
          mh.className = 'cn-note' + (mvHard ? ' cn-warn-txt' : '');
          mh.textContent = '将移动：' + fitLabel(moveId) + '（' + (mvHard
            ? '◆硬固定锚点 → 会被拒绝，请改选基准端或先解除固定'
            : mvSoft ? '◇图纸拐点锚 → 允许随动平移，下游管网整体跟随' : '自由接头，相连管道一起随动') + '）';
          selBox.appendChild(mh);

          var lrow = document.createElement('div');
          lrow.className = 'cn-row';
          var lenInput = numInput(s3.length.toFixed(1), '0.1', function (v) { previewSegmentLen(s3.id, v); });
          lenInput.classList.add('cn-len-input');
          if (busy() && !st.net.isEditing()) lenInput.disabled = true;
          lrow.appendChild(lenInput);
          lrow.appendChild(document.createTextNode(' m（输入即预览，上方确认/取消）'));
          selBox.appendChild(lrow);
          /* 改管径 / 沿线统计（2026-09-15 用户要求）——与图中右键菜单同功能 */
          var crow2 = document.createElement('div');
          crow2.className = 'cn-row';
          var calBtn = btn('改管径…', function (ev) { openCaliberMenu(s3.id, ev); });
          var pathBtn = btn(st.path.map[s3.id] ? '移出沿线统计' : '加入沿线统计', function () { togglePathSeg(s3.id); });
          if (busy()) { calBtn.disabled = pathBtn.disabled = true; }
          crow2.appendChild(calBtn); crow2.appendChild(pathBtn);
          selBox.appendChild(crow2);

          var orow = document.createElement('div');
          orow.className = 'cn-row';
          var cutBtn = btn('断开此段', function () {
            if (busy()) { msg('有未确认的预览，请先点【确认】或【取消】', 'warn'); return; }
            var r = runTx(function () { return st.net.disconnect({ fitting: s3.a.fitting, port: s3.a.port }); });
            if (r && r.ok) { st.sel = null; msg('已断开 ' + s3.id + '（可撤销）', 'ok'); drawLayer(); renderPanel(); }
            else msg('断开失败：' + (r ? r.reason : ''), 'warn');
          }, 'cn-danger');
          if (busy()) cutBtn.disabled = true;
          orow.appendChild(cutBtn);
          selBox.appendChild(orow);
        }
      }
    } else if (st.sel.type === 'port') {
      var pf = st.net.fittings[st.sel.id];
      var port = pf && pf.ports[st.sel.port];
      var peSel = pf && port && port.connected && pf.type === 'endpoint' && !st.net.fixed[pf.id] &&
        Object.keys(pf.ports).length === 1 && st.net.segmentsOf(pf.id).length === 1;
      if (pf && port && (!port.connected || peSel) && !st.viewOnly) {
        selBox.innerHTML = '<div class="cn-sel-title">' + fitLabel(pf.id) + ' · 空口 ' + st.sel.port + '（口径 ' + (port.caliber != null ? 'Ø' + port.caliber : '待定') + '）</div>';
        /* 2026-09-14：旧「接管 / 继续连接」与清单式接管均已按用户要求取消，此处仅显示接口信息。 */
        var pd0 = document.createElement('div');
        pd0.className = 'cn-note';
        pd0.textContent = '接口详情如上。「逐件接管」入口已按用户要求取消（2026-09-14）；自由管端仍可用【延伸管道】继续铺管。';
        selBox.appendChild(pd0);
      } else if (pf && port && port.connected) {
        var inf2 = st.net.portInfo(st.sel.id, st.sel.port);
        selBox.innerHTML = '<div class="cn-note">接口详情：Ø' + (port.caliber != null ? port.caliber : '?') +
          (inf2.system ? ' · ' + inf2.system : '') + (inf2.conn ? ' · ' + inf2.conn : '') +
          ' · 状态：已连接 · 对接接口 ' + (inf2.mate ? inf2.mate.fitting + '.' + inf2.mate.port : '—') + '</div>';
      }
    }
    card.appendChild(selBox);
  }

  /* ---------- 主方案保存 / 打开集成 ---------- */
  /* 保存主方案时导出施工模型；有未确认预览则先取消（保存不含预览） */
  function exportForProject() {
    if (!st.active || !st.net) return null;
    if (st.net.isEditing()) { st.net.cancelEdit(); msg('保存方案时未确认的尺寸预览已取消', 'info'); }
    if (st.preview) { st.preview = null; st.flow = null; st.mode = null; }
    return { saved: st.net.serialize(), savedAt: new Date().toISOString() };
  }
  /* 打开主方案时导入施工模型（校验完整性；几何不符走旧快照选择流程） */
  function importForProject(obj) {
    if (!obj || !obj.saved) { st.projectNet = null; return; }
    st.projectNet = obj;
    if (st.active) {
      var pn = st.projectNet; st.projectNet = null;
      st.sel = null; st.mode = null; st.flow = null; st.preview = null; st.connChoice = null;
      if (st.net && st.net.isEditing()) st.net.cancelEdit();
      adoptSaved(pn.saved, '主方案中的施工模型');
      drawLayer(); renderPanel();
    }
  }

  /* ---------- 挂载入口 ---------- */
  /* 自动把「管网装配」卡片挂进当前视图左栏（平面 → #tlSide，轴测 → #tlIsoSide，
     同一节点按视图搬移）。未启用时卡片显示标题 +【启用】按钮；启用后显示工具条
     与就地接管入口。⚠ 卡片必须在 enable()/refresh() 之外创建 —— 否则页面加载后
     左栏没有任何入口，用户找不到功能。2026-09-14 修复为加载即挂载；
     2026-09-15 升级为双视图 + 有平面数据时默认启用。 */
  function autoMount() {
    if (EDITOR_OFF) return;   /* 2026-09-15 已下线：不挂卡片、不建层、不启观察器 */
    if (typeof document === 'undefined') return;
    if (!document.getElementById('tlIsoSide') && !document.getElementById('tlSide')) return;
    renderPanel();     // 内部 ensureCard()：创建 #cnPanelCard 并按 active 渲染
    watchHosts();      // 观察两个宿主容器：生成管线图 / 视图切换后自动挂接
    /* 2026-09-15 用户要求「两个视图都能直接操作」：已有平面数据时默认启用 */
    if (!st.active && planData && planData()) { try { enable(); } catch (e) {} }
  }

  /* ---------- 导出 ---------- */
  var api = {
    version: 2,
    enable: enable, disable: disable, toggle: function () { st.active ? disable() : enable(); },
    isActive: function () { return st.active; },
    mount: autoMount,
    refresh: function () { if (EDITOR_OFF) return; autoMount(); drawLayer(); renderPanel(); },
    undo: doUndo, save: doSave,
    confirm: confirmTx, cancel: cancelTx,
    setMode: setMode,
    exportForProject: exportForProject,
    importForProject: importForProject,
    getNet: function () { return st.net; },
    getState: function () {
      return { active: st.active, viewOnly: st.viewOnly, mode: st.mode, flow: st.flow,
        editing: st.net ? st.net.isEditing() : false, preview: st.preview ? st.preview.kind : null,
        previewPlan: st.preview ? st.preview.plan : null,
        msg: st.msg, hasPendingChoice: !!st.pendingChoice };
    },
    select: function (sel) { st.sel = sel; drawLayer(); renderPanel(); },
    view: activeView,                                   // 'plan' | 'iso'（E2E 断言用）
    /* 导出用：临时摘掉编辑叠加层（含悬停层）再序列化，序列化后原样复原（2026-09-15） */
    exportClean: function (fn) {
      var had = !!(st.layer && st.layer.parentNode);
      var hadHover = !!(st.hoverLayer && st.hoverLayer.parentNode);
      if (had) st.layer.parentNode.removeChild(st.layer);
      if (hadHover) st.hoverLayer.parentNode.removeChild(st.hoverLayer);
      st.hoverLayer = null; st.hoverKey = null;
      try { return fn(); } finally { if (st.active && st.net && had) drawLayer(); }
    },
    popupItems: function () {                            /* 就地菜单当前项（E2E 断言用） */
      if (!popEl || popEl.style.display === 'none') return [];
      return Array.prototype.map.call(popEl.querySelectorAll('button'), function (b) { return b.textContent; });
    },
    freePorts: function () {                             /* 全部可用空口（E2E/面板用） */
      var out = [];
      if (!st.net) return out;
      Object.keys(st.net.fittings).forEach(function (id) {
        var f = st.net.fittings[id];
        st.net.freePorts(id).forEach(function (fp) { out.push({ fitting: id, port: fp.port, implicit: false }); });
        /* 自由管端：唯一接口被自身管段占用，但工程上可继续向外接（图上画的是续接白圈）。
           引擎侧 applyConnect 会为其隐式补口，所以这里也一并报出来，与图面口径一致。 */
        if (f.type === 'endpoint' && !st.net.fixed[id] &&
            Object.keys(f.ports).length === 1 && st.net.segmentsOf(id).length === 1) {
          out.push({ fitting: id, port: 'p1', implicit: true });
        }
      });
      return out;
    },
    /* 沿线统计当前状态（E2E 对账用）：按口径分组的长度合计 + 同口径 Q 的 Σhf */
    pathInfo: function () {
      var groups = {}, total = 0, ids = [];
      if (!st.net) return { ids: ids, groups: groups, total: 0 };
      st.path.ids.forEach(function (sid) {
        var s = st.net.segments[sid]; if (!s) return;
        ids.push(sid);
        var k = s.caliber != null ? String(s.caliber) : '0';
        if (!groups[k]) groups[k] = { caliber: s.caliber, len: 0, cnt: 0 };
        groups[k].len += s.length; groups[k].cnt++;
        total += s.length;
      });
      return { ids: ids, groups: groups, total: total, q: pathDefaultQ() };
    }
  };
  if (typeof window !== 'undefined') window.RyNetEditor = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  /* 加载即挂载（脚本位于 body 末尾，DOM 已就绪；若仍解析中则等 DOMContentLoaded） */
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoMount);
    else autoMount();
  }
})();
