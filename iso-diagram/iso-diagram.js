/* =====================================================================
 * iso-diagram.js — 三级管线轴测示意图模块（润野灌溉）
 * ---------------------------------------------------------------------
 * 职责：读取三级平面图最终几何数据（window.tlDiagramData，由 tlAutoGenerate
 *       末尾导出），做表达转换：等轴测投影 + 连接识别（三通）+ 阀门 + SVG。
 * 红线：只读不写。不参与任何水力计算，不修改流量/管径/扬程/分区/材料清单，
 *       不回调灌溉计算，不改变平面图几何数据。
 * 2026-09-15 阶段1（用户批准）：接入共享图面数据层 RyTlEditPipes
 *       （tl-edit-pipes.js）—— 显示三级工作区手工管线（等轴测层，含长度标注），
 *       新增「插入主管/插入支管」画线模式；两视图双向同步：任一处增删，
 *       另一视图立即重渲染。手工管线仍只存共享层自有状态，不写回 tlDiagramData。
 * 2026-09-15 阶段2（用户批准）：接入自动管线图面编辑层 RyTlAutoEdits
 *       （tl-auto-edits.js）—— 二级传递的自动管线（front/main/branch）可点选
 *       （高亮+信息）、就地改长（末段沿原方向拉伸）、插三通/阀门（沿管弧长定位）。
 *       渲染/统计用 applyTo 有效几何副本，tlDiagramData 仍只读不写。
 * 数据契约见 iso-diagram/README.md；版本 version:1，单位米。
 * ===================================================================== */
(function () {
  'use strict';

  /* ---------- 常量（绘图表达参数，不参与水力计算） ---------- */
  var EPS = 0.01;                 // 连接点吸附容差（米）
  var TEE_LINK_TOL = 0.06;        // 三通「连接管」判定容差（米）：端点落在三通点 ±6cm 内即视为接管跟随旋转
  var VALVE_OFFSET = 1.5;         // 阀门与三通沿下游管线的间距（米）
  var TEE_SNAP = 0.5;             // 阀门斜拉点视为落在主管上的容差（与平面图一致）
  /* 2026-09-15 用户要求：同类型管道/阀门不逐个标注 —— 阀门仅在编辑过参数后显示编号 */
  /* 层级表达（z 仅用于轴测图上下关系，不代表真实埋深，不参与水力计算）：
   * 总管/主管为埋地管 → 位于地面之下（z<0，画在支管下方）；
   * 支管/滴灌带为地表管（z≥0）。 */
  var HEIGHTS = { front: -1.5, main: -1.0, branch: 0.3, tape: 0.0, source: 0.9, inletValveZ: -1.5 };
  var RISE45 = 14;                // 三通 45° 斜拉段固定长度（viewBox 单位，2026-09-13 用户指定：不管阀位远近、方向统一）
  var COLORS = {
    front: '#f97316',   // 2026-09-16 用户要求：轴测图管线颜色同三级简图（总管橙/主管蓝/支管绿）
    main: '#185FA5',
    branch: '#16a34a',
    tape: '#888888',
    tee: '#202020',
    valve: '#202020',
    source: '#202020',
    zone: '#6b7280',    // 分区辅助线（浅灰）
    label: '#243c35',
    elbow: '#7c3aed'    // 手工弯头（紫，仅轴测编辑层）
  };

  /* ---------- 手工配件层（编辑表达层，2026-09-13）----------
   * 性质：轴测图上的编辑标注（三通/弯头/阀门），不写回平面数据、不参与水力计算
   * （维持「只读不写」红线：只增本模块自有状态，不修改 tlDiagramData）。
   * 平面数据对象引用变更（重新生成平面图）→ 自动清空。
   * 条目：{id, kind:'tee'|'elbow'|'valve', spec, segType:'front'|'main'|'branch',
   *        segIndex, point:{x,y}（数据坐标，米）, z（随管段层高）} */
  var KIND_LABEL = { tee: '三通', elbow: '弯头', valve: '阀门', pipe: '接管' };
  var MANUAL_PREFIX = { tee: 'M-T', elbow: 'M-E', valve: 'M-V', pipe: 'M-G' };
  var SEG_Z = { front: HEIGHTS.front, main: HEIGHTS.main, branch: HEIGHTS.branch };
  var SEG_NAME = { front: '总管', main: '主管', branch: '支管' };
  var manual = [];
  /* ---------- 自动三通「第三口旋转」覆盖层（2026-09-16 用户口径）----------
   * 用户口径：图上右键的三通多半是**自动三通**（TEE-F01 在总管上 / TEE-B01 在主管上），
   * 它们由模型派生、不能改模型（维持只读红线），故第三口旋转只记在本表达层覆盖里：
   *   id（TEE-F01/TEE-B01）→ {branchDir:{x,y,z} 单位向量, branchSpin:累计角(度)}
   * 渲染时若有覆盖则画成 T 形（贯通杆 = 宿管中心轴、第三口 = branchDir）。
   * ★ 无覆盖时渲染输出逐字节不变 → 等价性基线零差异。 */
  var autoSpin = {};
  /* 所在管段类的管径数字串（如 '110'），解析自 meta.pipes（'Ø 110 mm'/'O110' 等），无则 '' */
  function hostDia(segType) {
    var meta = lastDataRef && lastDataRef.meta, v = meta && meta.pipes && meta.pipes[segType];
    var mm = v ? String(v).match(/\d+(?:\.\d+)?/) : null;
    return mm ? mm[0] : '';
  }
  var edits = {}, history = [], draft = null, dataKey = '';
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function geometryKey(data) {
    if (!data) return '';
    return JSON.stringify([data.frontPipe, data.mainPipes, data.branchPipes, data.valves, data.poly]);
  }
  function snapshot() {
    /* epPipes：三通旋转会刚体修改共享层 EP 管 pts，撤销须一并还原，否则撤销后管子不归位。 */
    var ep = (typeof EP !== 'undefined' && EP.list) ? EP.list() : [];
    var epPipes = ep.map(function (p) { return { id: p.id, pts: copy(p.pts) }; });
    return copy({ edits: edits, manual: manual, seq: manualSeq, autoSpin: autoSpin, epPipes: epPipes });
  }
  function restore(s) {
    edits = copy(s.edits || {});
    manual = copy(s.manual || []);
    manualSeq = copy(s.seq || {tee:0,elbow:0,valve:0,pipe:0});
    autoSpin = copy(s.autoSpin || {});
    if (Array.isArray(s.epPipes) && typeof EP !== 'undefined' && EP.list) {
      var byId = {}; EP.list().forEach(function (p) { byId[p.id] = p; });
      s.epPipes.forEach(function (e) { var p = byId[e.id]; if (p && Array.isArray(e.pts)) p.pts = copy(e.pts); });
    }
  }
  function checkpoint() { history.push(snapshot()); if (history.length > 40) history.shift(); }
  function params(id) {
    var item=manual.filter(function(m){return m.id===id;})[0];
    return Object.assign({ spec:item ? item.spec : '', branchSpec:'', teeType:null, branchLen:1, valveType:'通用阀门', connection:'未指定', angle:90,
      size:1, label:true, labelX:9, labelY:3, rise:28, position:0.57, height:null }, edits[id] || {});
  }
  function manualPosition(id, value) {
    var m=manual.filter(function(m){return m.id===id;})[0];
    if(!m || !lastDataRef)return null;
    var line=m.segType==='front'?lastDataRef.frontPipe:(m.segType==='main'?lastDataRef.mainPipes:lastDataRef.branchPipes)[m.segIndex];
    if(!line || line.length<2)return null;
    var total=0,best=Infinity,along=0;
    for(var i=0;i+1<line.length;i++){
      var len=dist(line[i],line[i+1]), point=closestOnSeg(m.point,line[i],line[i+1]), d=dist(point,m.point);
      if(d<best){best=d;along=total+dist(line[i],point);} total+=len;
    }
    if(value===undefined)return {distance:along,length:total};
    if(!Number.isFinite(value)||value<0.5||value>total-0.5)return false;
    var left=value;
    for(var j=0;j+1<line.length;j++){
      var length=dist(line[j],line[j+1]);
      if(left<=length && length>0){m.point={x:line[j].x+(line[j+1].x-line[j].x)*left/length,y:line[j].y+(line[j+1].y-line[j].y)*left/length};return true;}
      left-=length;
    }
    return false;
  }
  function validParams(p) {
    return typeof p.spec === 'string' && p.spec.length <= 40 && typeof p.branchSpec === 'string' && p.branchSpec.length <= 40 &&
      (p.teeType === null || p.teeType === 'equal' || p.teeType === 'reducing') &&
      Number.isFinite(p.branchLen) && p.branchLen >= 0.5 && p.branchLen <= 10 &&
      ['通用阀门','闸阀','球阀','蝶阀','止回阀'].indexOf(p.valveType) >= 0 &&
      ['未指定','法兰','螺纹','热熔','承插'].indexOf(p.connection) >= 0 &&
      [45,90].indexOf(p.angle) >= 0 && typeof p.label === 'boolean' &&
      Number.isFinite(p.size) && p.size >= 0.5 && p.size <= 2 &&
      Number.isFinite(p.labelX) && Math.abs(p.labelX) <= 100 && Number.isFinite(p.labelY) && Math.abs(p.labelY) <= 100 &&
      Number.isFinite(p.rise) && p.rise >= 24 && p.rise <= 120 &&
      Number.isFinite(p.position) && p.position >= 0.15 && p.position <= 0.85 &&
      (p.height === null || (Number.isFinite(p.height) && p.height > 0 && p.height <= 100));
  }
  function notifyEdit() { if (api.onEditChange) api.onEditChange(); }
  function beginEdit(id) {
    cancelEdit();
    if (!fittingInfo(id)) return false;
    draft = {id:id, before:snapshot()}; rerenderKeepView(); return params(id);
  }
  function previewEdit(values) {
    if (!draft) return false;
    var p = Object.assign({}, params(draft.id), values);
    if (!validParams(p)) return false;
    if(values.distance!==undefined && !manualPosition(draft.id,values.distance))return false;
    delete p.distance;
    edits[draft.id] = p; rerenderKeepView(); return true;
  }
  function applyEdit() {
    if (!draft) return false;
    history.push(draft.before); if(history.length > 40) history.shift();
    draft = null; notifyEdit(); return true;
  }
  function cancelEdit() {
    if (!draft) return;
    restore(draft.before); draft = null; rerenderKeepView();
  }
  function resetEdit(id) { cancelEdit(); checkpoint(); delete edits[id]; rerenderKeepView(); notifyEdit(); }
  function undoEdit() { cancelEdit(); if (!history.length) return false; restore(history.pop()); rerenderKeepView(); notifyEdit(); return true; }
  function exportState() { return {version:1, geometry:dataKey, state:draft ? copy(draft.before) : snapshot()}; }
  function importState(saved, data) {
    if (!saved || saved.version !== 1 || saved.geometry !== geometryKey(data) || !saved.state) return false;
    var s = saved.state;
    if (!s.edits || !Array.isArray(s.manual) || s.manual.length > 2000 || !s.seq) return false;
    /* 自动三通第三口旋转覆盖（可选字段：旧存档无此键 → 视为空覆盖，向后兼容） */
    if (s.autoSpin !== undefined) {
      if (!s.autoSpin || typeof s.autoSpin !== 'object' || Array.isArray(s.autoSpin)) return false;
      if (!Object.keys(s.autoSpin).every(function (id) {
        var v = s.autoSpin[id];
        return /^TEE-[FB]\d+$/.test(id) && v && v.branchDir
          && isFinite(v.branchDir.x) && isFinite(v.branchDir.y) && isFinite(v.branchDir.z) && isFinite(v.branchSpin);
      })) return false;
    }
    if (!Object.keys(s.edits).every(function(id){return /^(TEE-[FB]|V-[FB]|R-V-B|M-[TEV])\d+$/.test(id) && validParams(Object.assign({}, params(''),s.edits[id]));})) return false;
    if (!s.manual.every(function(m){
      if (m.kind === 'pipe') return /^M-G\d+$/.test(m.id) && Array.isArray(m.pts) && m.pts.length >= 2 && m.pts.every(function(p){return p && isFinite(p.x) && isFinite(p.y) && isFinite(p.z);}) && typeof m.spec === 'string' && (m.teeId === undefined || typeof m.teeId === 'string');
      return /^M-[TEV]\d+$/.test(m.id) && KIND_LABEL[m.kind] && SEG_NAME[m.segType] && Number.isInteger(m.segIndex) && m.segIndex >= 0 && m.point && isFinite(m.point.x) && isFinite(m.point.y) && typeof m.spec === 'string' && (m.hostPipe === undefined || (typeof m.hostPipe === 'string' && /^M-G\d+$/.test(m.hostPipe)));
    })) return false;
    if(!['tee','elbow','valve'].every(function(k){return Number.isInteger(s.seq[k])&&s.seq[k]>=0&&s.seq[k]<=1000000;}))return false;
    if(new Set(s.manual.map(function(m){return m.id;})).size!==s.manual.length)return false;
    attachData(data); restore(s); manual.forEach(function(m){m.z = (m.hostPipe && isFinite(m.z)) ? m.z : SEG_Z[m.segType];manualSeq[m.kind]=Math.max(manualSeq[m.kind],Number(m.id.slice(3)));}); history=[]; draft=null; rerenderKeepView(); return true;
  }
  var manualSeq = { tee: 0, elbow: 0, valve: 0, pipe: 0 };
  var lastDataRef = null;
  var placing = null;        /* {kind, spec} | null —— 放置模式 */
  var viewState = null;      /* {k, ox, oy, model} —— renderSVG 记录，供命中测试 */
  /* ---------- 共享图面数据层（2026-09-15 阶段1）----------
   * 手工管线（主管/支管折线）单一数据源：三级工作区 ⇄ 轴测图双向同步。
   * 缺失（加载顺序异常/Node 旧测试）时退化为空层，本模块仍可独立运行。 */
  var EP = (typeof window !== 'undefined' && window.RyTlEditPipes) ? window.RyTlEditPipes : {
    list: function () { return []; }, add: function () { return null; },
    syncGeometry: function () { return 'kept'; }, onChange: function () { return function () {}; }
  };
  /* 自动管线图面编辑层（2026-09-15 阶段2）：缺失（Node 旧测试/加载顺序异常）时退化为空层 */
  var AE = (typeof window !== 'undefined' && window.RyTlAutoEdits) ? window.RyTlAutoEdits : {
    applyTo: function (d) { return d; }, syncGeometry: function () { return 'kept'; },
    lensMap: function () { return {}; }, fitsList: function () { return []; },
    pipePts: function () { return null; }, pipeName: function (p) { return p; },
    allPids: function () { return []; }, effPts: function () { return null; },
    pointAt: function () { return null; }, locate: function () { return null; },
    setLen: function () { return false; }, addFitting: function () { return null; },
    removeFitting: function () { return false; }, moveFitting: function () { return false; },
    calibersMap: function () { return {}; }, caliberOf: function () { return null; },
    setCaliber: function () { return false; }, clearCaliber: function () { return false; },
    onChange: function () { return function () {}; }
  };
  var pipeMode = null;       /* 'main' | 'branch' | null —— 插入管线模式 */
  var pipeDraft = null;      /* {kind, pts:[{x,y}(米)]} —— 进行中的手工管线折线 */
  var selPipeId = null;      /* 选中的手工管线 id（点击拾取，虚线加粗高亮） */
  var selAutoId = null;      /* 选中的自动管线 pid：'front'|'main-i'|'branch-i'（阶段2） */
  var selAutoAt = 0;         /* 选中自动管线时的点击位置（沿管弧长，米）——插配件用 */
  var selFitId = null;       /* 选中的图面配件 id（A-F##，阶段2） */
  var fitDrag = null;        /* 配件沿管拖动态 {id, pointerId, atM}（阶段2b） */
  var fitDragRaf = 0;        /* 拖动提交 rAF 节流句柄 */
  var PLACE_TOL = 16;        /* 放置吸附容差（SVG viewBox 单位 px）
   * 回调 onFittingClick / onPlaceResult 挂在导出对象 api 上（页面注入） */

  /* ---------- 基础几何 ---------- */
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  /* 点到线段最近点（用于连接识别与容差吸附） */
  function closestOnSeg(p, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var c = dx * dx + dy * dy;
    if (c === 0) return { x: a.x, y: a.y };
    var t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / c;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    return { x: a.x + dx * t, y: a.y + dy * t };
  }
  function segDist(p, a, b) { return dist(p, closestOnSeg(p, a, b)); }

  /* snapPoint：在已有点集中找 EPS 内的匹配点，找不到返回原点 */
  function snapPoint(point, points, eps) {
    for (var i = 0; i < points.length; i++) {
      if (Math.hypot(points[i].x - point.x, points[i].y - point.y) <= eps) return points[i];
    }
    return point;
  }

  /* 45°正面斜轴测：X 水平，Y 向右上45°，Z 竖直；轴向比例1:1:1。
   * 先按空间坐标构造管线，再投影，禁止在屏幕坐标硬造管道折点。 */
  function projectIso(x, y, z, k) {
    k = k || 1;
    return { x: (x + y * Math.SQRT1_2) * k, y: (-y * Math.SQRT1_2 - z) * k };
  }
  /* 同层逆投影（z 已知）：用于可逆性自检 */
  function unprojectIso(sx, sy, z, k) {
    k = k || 1;
    var y = -(sy / k + z) / Math.SQRT1_2;
    return { x: sx / k - y * Math.SQRT1_2, y: y };
  }

  /* ---------- 连接识别与构件生成 ----------
   * 输入 tlDiagramData，输出 { tees:[], valves:[], edges:{front,mains,branches,tapes,connectors}, zones, source }
   * 三通规则：
   *  1) 总管↔主管：每条主管上游端向总管作垂直接入，接入点在总管上 → 三通（平面图总管在外侧，
   *     平面未画接入段，轴测图补画该表达段，属表达不属计算）。
   *  2) 主管↔支管：只认平面图已有阀门数据（v.ax/v.ay 为 45° 斜拉连接点，落在主管上）→ 三通；
   *     无阀门数据的交叉一律不生成三通。
   * 阀门规则：优先使用平面图已有阀门位置（出水口，位于支管中点）；
   *   总管↔主管接入段平面图无阀门 → 自动生成（三通之后 VALVE_OFFSET 处）。 */
  function buildModel(data) {
    if (!data || data.version !== 1) return null;
    var mains = data.mainPipes || [], branches = data.branchPipes || [];
    var valvesIn = data.valves || [], tapes = data.dripTapes || [];
    var front = data.frontPipe || null, source = data.sourcePos || null;
    var zones = data.zones || null;

    var tees = [], vlist = [], fid = 0, bid = 0, vfid = 0, vbid = 0;

    /* ---- 1) 总管 ↔ 主管 三通 + 接入阀门 ---- */
    if (front && front.length >= 2 && mains.length) {
      var fh = Math.abs(front[0].y - front[1].y) <= EPS; // 总管水平？
      mains.forEach(function (m, mi) {
        if (!m || m.length < 2) return;
        // 上游端 = 距总管最近的端点
        var d0 = segDist(m[0], front[0], front[1]);
        var d1 = segDist(m[m.length - 1], front[0], front[1]);
        var upEnd = d0 <= d1 ? m[0] : m[m.length - 1];
        var j = fh ? { x: upEnd.x, y: front[0].y } : { x: front[0].x, y: upEnd.y };
        j = snapPoint(j, [front[0], front[1]], EPS); // 归位到端点（若重合）
        // 接入点必须落在总管线段范围内（含 EPS），否则不算真实连接
        var pj = closestOnSeg(j, front[0], front[1]);
        if (dist(pj, j) > EPS) return;
        fid++;
        var tee = { id: 'TEE-F' + pad(fid), type: 'front-main', point: j, upstream: 'front', downstream: 'main-' + mi };
        tees.push(tee);
        // 自动接入阀门：沿接入段从三通向主管方向偏移 VALVE_OFFSET
        var dir = { x: upEnd.x - j.x, y: upEnd.y - j.y };
        var dl = Math.hypot(dir.x, dir.y);
        var offset = Math.min(VALVE_OFFSET, dl / 2);
        var vp = { x: j.x + dir.x / (dl || 1) * offset, y: j.y + dir.y / (dl || 1) * offset };
        vfid++;
        vlist.push({
          id: 'V-F' + pad(vfid), auto: true, point: vp, z: HEIGHTS.inletValveZ,
          tee: tee.id, upstream: 'front', downstream: 'main-' + mi, zone: null
        });
        tee.valveId = 'V-F' + pad(vfid);
      });
    }

    /* ---- 2) 主管 ↔ 支管 三通（仅平面图已有阀门处）+ 已有阀门 ---- */
    valvesIn.forEach(function (v, vi) {
      if (v.ax === undefined || v.ay === undefined) return;
      // 斜拉点必须落在某条主管上（容差 TEE_SNAP，与平面图"补算连接点"口径一致）
      var onMain = -1, best = TEE_SNAP;
      mains.forEach(function (m, mi) {
        for (var i = 0; i + 1 < m.length; i++) {
          var d = segDist({ x: v.ax, y: v.ay }, m[i], m[i + 1]);
          if (d < best) { best = d; onMain = mi; }
        }
      });
      if (onMain < 0) return; // 无真实连接关系，不生成三通
      bid++;
      var tee = { id: 'TEE-B' + pad(bid), type: 'main-branch', point: { x: v.ax, y: v.ay }, upstream: 'main-' + onMain, downstream: 'branch?' };
      // 下游支管 = 距阀门点最近且距离 ≤1m 的支管（阀门在支管中点上）
      var bdist = 1.0, bi = -1;
      branches.forEach(function (b, i) {
        for (var k = 0; k + 1 < b.length; k++) {
          var d = segDist({ x: v.x, y: v.y }, b[k], b[k + 1]);
          if (d < bdist) { bdist = d; bi = i; }
        }
      });
      if (bi >= 0) tee.downstream = 'branch-' + bi;
      tees.push(tee);
      vbid++;
      vlist.push({
        id: 'V-B' + pad(vbid), auto: false, point: { x: v.x, y: v.y }, z: HEIGHTS.branch,
        tee: tee.id, upstream: 'main-' + onMain, downstream: bi >= 0 ? 'branch-' + bi : '?', zone: v.zone || zoneOf(v, zones), conn: { x: v.ax, y: v.ay }
      });
      tee.valveId = 'V-B' + pad(vbid);
    });

    function pad(n) { return (n < 10 ? '0' : '') + n; }
    /* 阀门所在分区：**区号与地块分区标注同口径**（行主序 zi+1 →「37区」），
       与 index.html 三级工作区统计表的 wsRectZone 保持同一公式（2026-09-17 第四十三轮）。 */
    function zoneOf(v, zs) {
      if (!zs || !zs.xPos || !zs.yPos) return null;
      var znC = zs.cols || (zs.xPos.length - 1);   /* 列数：区号 = r * cols + c + 1 */
      for (var c = 0; c + 1 < zs.xPos.length; c++) {
        if (v.x >= zs.xPos[c] - EPS && v.x <= zs.xPos[c + 1] + EPS) {
          for (var r = 0; r + 1 < zs.yPos.length; r++) {
            if (v.y >= zs.yPos[r] - EPS && v.y <= zs.yPos[r + 1] + EPS) return (r * znC + c + 1) + '区';
          }
        }
      }
      return null;
    }

    return {
      tees: tees, valves: vlist,
      front: front, mains: mains, branches: branches, tapes: tapes,
      source: source, zones: zones, poly: data.poly || [],
      meta: data.meta || {}, plot: data.plot || {}
    };
  }

  /* ---------- SVG 生成 ---------- */
  function fmt(v) { return (Math.round(v * 10) / 10).toString(); }

  // 阀门通用符号：两三角尖端相对，沿安装管段方向旋转；不推定具体阀型。
  // 2026-09-16 用户要求：可见蝶形缩小（0.7×：14×8 → 9.8×5.6）；
  // 透明命中区 rect 保持 16×12 不缩（不可见，保证点击目标稳定，否则 bbox 中心会被标签拉偏）。
  function valveSymbol(q, angle) {
    return '<g data-symbol="valve" transform="translate(' + fmt(q.x) + ' ' + fmt(q.y) + ') rotate(' + fmt(angle) + ')">'
      + '<rect x="-8" y="-6" width="16" height="12" fill="transparent"/>'
      + '<path d="M-4.9 -2.8 L4.9 2.8 L4.9 -2.8 L-4.9 2.8 Z" fill="white" stroke="#202020" stroke-width="1.2"/></g>';
  }

  function renderSVG(data) {
    /* 阶段2：渲染用有效几何（改长后的副本）；data 本身只读不写 */
    var model = buildModel(AE.applyTo(data));
    if (!model) return null;

    /* 1) 收集全部 3D 点 → 等轴测投影 →包围盒 → 自适应缩放 */
    var pts = [];
    function pushPt(x, y, z) { pts.push({ x: x, y: y, z: z === undefined ? 0 : z }); }
    (model.front || []).forEach(function (p) { pushPt(p.x, p.y, HEIGHTS.front); });
    model.mains.forEach(function (l) { l.forEach(function (p) { pushPt(p.x, p.y, HEIGHTS.main); }); });
    model.branches.forEach(function (l) { l.forEach(function (p) { pushPt(p.x, p.y, HEIGHTS.branch); }); });
    model.tapes.forEach(function (l) { l.forEach(function (p) { pushPt(p.x, p.y, HEIGHTS.tape); }); });
    (model.poly || []).forEach(function (p) { pushPt(p.x, p.y, 0); });
    if (model.source) pushPt(model.source.x, model.source.y, HEIGHTS.source);
    model.tees.forEach(function (t) { pushPt(t.point.x, t.point.y, t.type === 'front-main' ? HEIGHTS.front : HEIGHTS.main); });
    model.valves.forEach(function (v) { pushPt(v.point.x, v.point.y, v.z); });
    /* 共享层手工管线也参与取景（2026-09-15 阶段1） */
    (EP.list() || []).forEach(function (m) {
      var z = m.kind === 'main' ? HEIGHTS.main : HEIGHTS.branch;
      (m.pts || []).forEach(function (p) { pushPt(p.x, p.y, z); });
    });
    if (!pts.length) return null;

    var i, p, pr = pts.map(function (p) { return projectIso(p.x, p.y, p.z, 1); });
    var mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
    for (i = 0; i < pr.length; i++) {
      if (pr[i].x < mnx) mnx = pr[i].x; if (pr[i].x > mxx) mxx = pr[i].x;
      if (pr[i].y < mny) mny = pr[i].y; if (pr[i].y > mxy) mxy = pr[i].y;
    }
    var svgW = 1190, svgH = 820, pad = 70;
    var headerH = 64, footerH = 96;
    var availW = svgW - 2 * pad, availH = svgH - headerH - footerH - pad;
    var k = Math.min(availW / Math.max(mxx - mnx, 1e-6), availH / Math.max(mxy - mny, 1e-6), 2);
    var ox = pad + (availW - (mxx - mnx) * k) / 2 - mnx * k;
    var oy = headerH + pad / 2 + (availH - (mxy - mny) * k) / 2 - mny * k;
    viewState = { k: k, ox: ox, oy: oy, model: model }; /* 供放置模式命中测试 */
    function P(x, y, z) { var q = projectIso(x, y, z, k); return { x: ox + q.x, y: oy + q.y }; }
    // 立管展开示意：每条支管整体平移，使接入阀位处于主管三通的Z轴线上。
    // 偏移只属于图纸表达；命中测试逆向扣除偏移，不改原始几何。
    var branchOffsets = {};
    model.valves.forEach(function(v) {
      if (!v.conn || v.downstream === '?') return;
      var i = Number(v.downstream.slice(7));
      var a = P(v.conn.x, v.conn.y, HEIGHTS.main), b = P(v.point.x, v.point.y, v.z);
      branchOffsets[i] = { x: a.x - b.x, y: a.y - params('R-' + v.id).rise - b.y };
    });
    viewState.branchOffsets = branchOffsets;
    function shifted(q, offset) { return {x:q.x + (offset ? offset.x : 0), y:q.y + (offset ? offset.y : 0)}; }
    function valvePoint(v) { return shifted(P(v.point.x, v.point.y, v.z), v.conn ? branchOffsets[Number(v.downstream.slice(7))] : null); }
    function fitLabel(id, q, fallback) {
      var p = params(id), custom = edits[id];
      if (!p.label || (!custom && !fallback)) return '';
      var text = id + (p.spec ? ' ' + p.spec : '') + (p.branchSpec ? ' × ' + p.branchSpec : '');
      if (custom && id.indexOf('V') >= 0) text += ' ' + p.valveType;
      if (custom && p.connection !== '未指定') text += ' ' + p.connection;
      if (custom && id.indexOf('M-E') === 0) text += ' ' + p.angle + '°';
      if (id.indexOf('R-') === 0) text += p.height === null ? ' 高度待定' : ' H=' + p.height + 'm';
      return '<text x="' + fmt(q.x+p.labelX) + '" y="' + fmt(q.y+p.labelY) + '" font-size="9" fill="#333" paint-order="stroke" stroke="white" stroke-width="2" font-family="system-ui">' + esc(text) + '</text>';
    }
    function scaledSymbol(symbol, q, id) {
      var size=params(id).size;
      return '<g transform="translate('+fmt(q.x)+' '+fmt(q.y)+') scale('+size+') translate('+fmt(-q.x)+' '+fmt(-q.y)+')">'+symbol+'</g>';
    }
    function path3(list, zOf, offset) {
      var d = '';
      for (var i = 0; i < list.length; i++) {
        var q = shifted(P(list[i].x, list[i].y, zOf(list[i], i)), offset);
        d += (i === 0 ? 'M' : 'L') + fmt(q.x) + ' ' + fmt(q.y) + ' ';
      }
      return d;
    }

    var s = [];
    s.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + svgW + ' ' + svgH + '" style="background:#fff" data-iso="1">');
    s.push('<title>三级管线轴测示意图</title>');

    /* 2) 标题/信息行 */
    var meta = model.meta || {};
    /* v136（2026-09-23 用户反馈「应用到图面后左下角图例不更新」）：信息行/引线标注/图例/水泵行
       优先读 meta.live（图面实际管径与水泵值，tlPumpUpdateRun 收口实时刷新）；
       无 live（旧存档/未初始化）退回设计口径 meta.pipes/meta.pump，行为与旧版一致。
       hostDia(65) 与 network-model 的设计口径消费方一律不动。 */
    var LV = meta.live || null;
    function pipeTxt(k, dflt) { return (LV && LV.pipes && LV.pipes[k]) || (meta.pipes && meta.pipes[k]) || dflt; }
    function pumpTxtOf(k) { return (LV && LV.pump && LV.pump[k]) || (meta.pump && meta.pump[k]) || '—'; }
    var zoneCount = (meta.zoneCount !== undefined) ? meta.zoneCount : ((model.zones && model.zones.cols) ? model.zones.cols * model.zones.rows : '—');
    var now = data.generatedAt ? String(data.generatedAt).replace('T', ' ').slice(0, 16) : new Date().toISOString().slice(0, 16).replace('T', ' ');
    s.push('<g font-family="system-ui,sans-serif">');
    s.push('<text x="' + (svgW / 2) + '" y="34" text-anchor="middle" font-size="19" font-weight="700" fill="' + COLORS.label + '">三级管线轴测示意图</text>');
    s.push('<text x="' + (svgW / 2) + '" y="54" text-anchor="middle" font-size="11" fill="#5b6b66">'
      + '分区 ' + zoneCount + ' 区 · 总管 ' + esc(pipeTxt('front', '—'))
      + ' · 主管 ' + esc(pipeTxt('main', '—'))
      + ' · 支管 ' + esc(pipeTxt('branch', '—'))
      + ' · 生成 ' + esc(String(now)) + '</text>');
    s.push('</g>');

    /* 3b) 地块轮廓：仅作可见参考线，不再裁剪管线（2026-09-16 用户要求：轴测图管线
       不被地块剪切，完整显示；管线长度统计仍以地块内有效几何为准，与三级简图/
       材料清单一致）。主管/支管/三通/阀件/配件均不被裁剪；总管与手工管线本就
       允许在地块外敷设。 */
    var clipAttr = '';   /* 占位：下方管线组仍引用 clipAttr，置空即不裁剪 */
    if (model.poly && model.poly.length >= 3) {
      var isoPlotPts = model.poly.map(function (p) { var q = P(p.x, p.y, 0); return fmt(q.x) + ',' + fmt(q.y); }).join(' ');
      s.push('<polygon points="' + isoPlotPts + '" fill="none" stroke="#94a3b8" stroke-width="1" stroke-dasharray="6,4" opacity="0.7"/>');
    }

    /* 3) 分区地面辅助线（z=0 平行四边形） */
    if (model.zones && model.zones.xPos && model.zones.yPos) {
      s.push('<g fill="none" stroke="' + COLORS.zone + '" stroke-width="0.8" opacity="0.5">');
      var xs = model.zones.xPos, ys = model.zones.yPos;
      for (var c = 0; c + 1 < xs.length; c++) {
        for (var r = 0; r + 1 < ys.length; r++) {
          var cs = [P(xs[c], ys[r], 0), P(xs[c + 1], ys[r], 0), P(xs[c + 1], ys[r + 1], 0), P(xs[c], ys[r + 1], 0)];
          s.push('<polygon points="' + cs.map(function (q) { return fmt(q.x) + ',' + fmt(q.y); }).join(' ') + '"/>');
        }
      }
      s.push('</g>');
    }

    /* 4) 埋地管网（z<0，画在地面之下 → 先绘制，被地表图元覆盖）
       4a) 总管↔主管接入段（表达段：三通→阀门→主管上游端，均位于地下） */
    s.push('<g fill="none" stroke="' + COLORS.front + '" stroke-width="1.5">');
    model.tees.filter(function (t) { return t.type === 'front-main'; }).forEach(function (t) {
      var vl = model.valves.filter(function (v) { return v.tee === t.id; })[0];
      var mi = parseInt(String(t.downstream).slice(5), 10);
      var m = model.mains[mi]; if (!m || !vl) return;
      var d0 = segDist(m[0], model.front[0], model.front[model.front.length - 1]);
      var upEnd = d0 <= segDist(m[m.length - 1], model.front[0], model.front[model.front.length - 1]) ? m[0] : m[m.length - 1];
      var points = [P(t.point.x, t.point.y, HEIGHTS.front), P(upEnd.x, upEnd.y, HEIGHTS.front), P(upEnd.x, upEnd.y, HEIGHTS.main)];
      s.push('<path data-connector="front-main" d="' + points.map(function(q, i) { return (i ? 'L' : 'M') + fmt(q.x) + ' ' + fmt(q.y); }).join(' ') + '"/>');
    });
    s.push('</g>');

    /* 4b) 主管（埋地） */
    s.push('<g fill="none" stroke="' + COLORS.main + '" stroke-width="1.8" stroke-linejoin="round"' + clipAttr + '>');
    model.mains.forEach(function (l, mi) { s.push('<path data-tlpipe="main-' + mi + '" style="cursor:pointer" d="' + path3(l, function () { return HEIGHTS.main; }) + '"/>'); });
    s.push('</g>');

    /* 4c) 总管（埋地，带流向箭头） */
    s.push('<defs><marker id="isoArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
      + '<path d="M0 0 L10 5 L0 10 z" fill="' + COLORS.front + '"/></marker></defs>');
    if (model.front && model.front.length >= 2) {
      /* 总管豁免地块裁剪（2026-09-14）：管线在地块外，裁剪会把整条总管裁没 */
      s.push('<g>');
      s.push('<path data-tlpipe="front" style="cursor:pointer" d="' + path3(model.front, function () { return HEIGHTS.front; })
        + '" fill="none" stroke="' + COLORS.front + '" stroke-width="2.2" marker-mid="url(#isoArrow)" marker-end="url(#isoArrow)"/>');
      /* 中点补一个箭头（两点线段无 mid） */
      if (model.front.length === 2) {
        var mp = { x: (model.front[0].x + model.front[1].x) / 2, y: (model.front[0].y + model.front[1].y) / 2 };
        var mq = P(mp.x, mp.y, HEIGHTS.front);
        s.push('<polygon points="0,-4 8,0 0,4" fill="' + COLORS.front + '" transform="translate(' + fmt(mq.x) + ',' + fmt(mq.y) + ') rotate('
          + fmt(Math.atan2(P(model.front[1].x, model.front[1].y, HEIGHTS.front).y - P(model.front[0].x, model.front[0].y, HEIGHTS.front).y,
            P(model.front[1].x, model.front[1].y, HEIGHTS.front).x - P(model.front[0].x, model.front[0].y, HEIGHTS.front).x) * 180 / Math.PI) + ')"/>');
      }
      s.push('</g>');
    }

    /* 5) 滴灌带 —— 2026-09-13 按用户要求轴测图不再绘制（图例同步移除）。
       model.tapes 仍参与边界计算（保持取景/缩放不变），仅跳过绘制。 */

    /* 6) 支管（地表 z=0.3，覆盖埋地管网之上） */
    s.push('<g fill="none" stroke="' + COLORS.branch + '" stroke-width="1.2" stroke-linejoin="round"' + clipAttr + '>');
    model.branches.forEach(function (l,i) { s.push('<path data-branch="' + i + '" data-tlpipe="branch-' + i + '" style="cursor:pointer" d="' + path3(l, function () { return HEIGHTS.branch; }, branchOffsets[i]) + '"/>'); });
    s.push('</g>');

    /* 6b) 手工管线层（共享图面数据层 RyTlEditPipes，2026-09-15 阶段1 双向同步）
       颜色与三级设计工作区一致（主管蓝/支管绿）；点击可选中（data-manpipe，
       虚线加粗高亮）。不做地块裁剪：手工管线允许画在地块外（与工作区口径一致）。 */
    var manPipes = EP.list() || [];
    if (manPipes.length) {
      s.push('<g fill="none" stroke-linecap="round" stroke-linejoin="round">');
      manPipes.forEach(function (m) {
        if (!m.pts || m.pts.length < 2) return;
        var z = m.kind === 'main' ? HEIGHTS.main : HEIGHTS.branch;
        var col = m.kind === 'main' ? '#185FA5' : '#16a34a';
        var isSel = m.id === selPipeId;
        var d = '';
        m.pts.forEach(function (p, i) { var q = P(p.x, p.y, z); d += (i ? 'L' : 'M') + fmt(q.x) + ' ' + fmt(q.y); });
        var mid = m.pts[Math.floor(m.pts.length / 2)], mq = P(mid.x, mid.y, z);
        s.push('<g class="iso-manpipe" data-manpipe="' + esc(m.id) + '" style="cursor:pointer"><title>'
          + esc(m.id + ' · ' + (m.kind === 'main' ? '主管' : '支管') + ' · ' + m.len.toFixed(1) + 'm') + '</title>'
          + '<path d="' + d + '" stroke="' + col + '" stroke-width="' + (isSel ? 3.4 : (m.kind === 'main' ? 2.4 : 1.6)) + '"' + (isSel ? ' stroke-dasharray="8,4"' : '') + '/>'
          + m.pts.map(function (p) { var q = P(p.x, p.y, z); return '<rect x="' + fmt(q.x - 2) + '" y="' + fmt(q.y - 2) + '" width="4" height="4" fill="#fff" stroke="' + col + '" stroke-width="1"/>'; }).join('')
          + '<text x="' + fmt(mq.x + 6) + '" y="' + fmt(mq.y - 4) + '" font-size="9" font-family="system-ui" fill="' + (isSel ? '#7c3aed' : '#47555e') + '"' + (isSel ? ' font-weight="700"' : '') + ' paint-order="stroke" stroke="white" stroke-width="2">' + esc(m.id + ' ' + m.len.toFixed(1) + 'm' + (isSel ? ' · 已选' : '')) + '</text>'
          + '</g>');
      });
      s.push('</g>');
    }

    /* 6b-2) 改长管线长度标注（阶段2）：琥珀色显示有效长度（对齐工作区口径） */
    var elens = AE.lensMap();
    Object.keys(elens).forEach(function (epid) {
      var eepts = AE.effPts(epid, data);
      if (!eepts) return;
      var ez2 = epid === 'front' ? HEIGHTS.front : (epid.indexOf('main-') === 0 ? HEIGHTS.main : HEIGHTS.branch);
      var emid = eepts[Math.floor(eepts.length / 2)];
      var emq = P(emid.x, emid.y, ez2);
      s.push('<text data-tlens="1" x="' + fmt(emq.x + 6) + '" y="' + fmt(emq.y - 4) + '" font-size="9" font-family="system-ui" fill="#b45309" paint-order="stroke" stroke="white" stroke-width="2">' + esc(AE.polylineLen(eepts).toFixed(1) + 'm') + '</text>');
    });
    /* 6b-3) 改径标注（2026-09-16 阶段2e）：琥珀 Ø 数值（对齐工作区/施工编辑器口径） */
    var ecals = AE.calibersMap ? AE.calibersMap() : {};
    Object.keys(ecals).forEach(function (cpid) {
      var cepts = AE.effPts(cpid, data);
      if (!cepts) return;
      var cz2 = cpid === 'front' ? HEIGHTS.front : (cpid.indexOf('main-') === 0 ? HEIGHTS.main : HEIGHTS.branch);
      var cmid = cepts[Math.floor(cepts.length / 2)];
      var cmq = P(cmid.x, cmid.y, cz2);
      s.push('<text data-tlcal="' + esc(cpid) + '" x="' + fmt(cmq.x + 6) + '" y="' + fmt(cmq.y + 12) + '" font-size="9.5" font-family="system-ui" font-weight="700" fill="#b45309" paint-order="stroke" stroke="white" stroke-width="2" pointer-events="none">' + esc('Ø' + ecals[cpid]) + '</text>');
      if (typeof window !== 'undefined' && window.tlPipeHfMark) {
        var chm = window.tlPipeHfMark(cpid);
        if (chm) s.push('<text data-tlhf="' + esc(cpid) + '" x="' + fmt(cmq.x + 6) + '" y="' + fmt(cmq.y + 24) + '" font-size="9" font-family="system-ui" font-weight="600" fill="' + chm.color + '" paint-order="stroke" stroke="white" stroke-width="2.5" pointer-events="none">' + esc(chm.text) + '</text>');
      }
    });

    /* 6c) 自动管线选中高亮（阶段2）：有效几何虚线加粗覆盖 */
    if (selAutoId) {
      var septs = AE.effPts(selAutoId, data);
      if (septs) {
        var sz = selAutoId === 'front' ? HEIGHTS.front : (selAutoId.indexOf('main-') === 0 ? HEIGHTS.main : HEIGHTS.branch);
        var sw = selAutoId === 'front' ? 3.4 : (selAutoId.indexOf('main-') === 0 ? 2.9 : 2.4);
        s.push('<path data-tlsel="1" d="' + path3(septs, function () { return sz; }) + '" fill="none" stroke="#f59e0b" stroke-width="' + fmt(sw) + '" stroke-dasharray="8,4" stroke-linecap="round" stroke-linejoin="round" pointer-events="none"/>');
      }
    }

    /* 6d) 自动管线图面配件层（共享编辑层 RyTlAutoEdits，阶段2）：
       三通/阀门按沿管弧长定位在有效几何上（改长后随动/clamp）；点击可选中。 */
    var autoFits = AE.fitsList() || [];
    if (autoFits.length) {
      s.push('<g' + clipAttr + '>');
      autoFits.forEach(function (f) {
        var pos = AE.pointAt(f.pid, data, f.atM);
        if (!pos) return;
        var fz = f.pid === 'front' ? HEIGHTS.front : (f.pid.indexOf('main-') === 0 ? HEIGHTS.main : HEIGHTS.branch);
        var fq = P(pos.x, pos.y, fz);
        var fSel = f.id === selFitId;
        var fCol = '#b45309';
        var fsym;
        if (f.kind === 'valve') {
          fsym = '<path d="M' + fmt(fq.x - 4.5) + ' ' + fmt(fq.y - 3.6) + ' L' + fmt(fq.x + 4.5) + ' ' + fmt(fq.y + 3.6)
            + ' L' + fmt(fq.x + 4.5) + ' ' + fmt(fq.y - 3.6) + ' L' + fmt(fq.x - 4.5) + ' ' + fmt(fq.y + 3.6)
            + ' Z" fill="' + fCol + '" stroke="#fff" stroke-width="1.3"/>';
        } else if (f.kind === 'elbow') {
          /* 图面弯头（2026-09-18 第七十轮）：旋转方块，与三级工作区 AE 层同款 */
          fsym = '<rect x="' + fmt(fq.x - 4.6) + '" y="' + fmt(fq.y - 4.6) + '" width="9.2" height="9.2" fill="' + fCol + '" stroke="#fff" stroke-width="1.3" transform="rotate(45 ' + fmt(fq.x) + ' ' + fmt(fq.y) + ')"/>';
        } else {
          fsym = '<circle cx="' + fmt(fq.x) + '" cy="' + fmt(fq.y) + '" r="4.6" fill="' + fCol + '" stroke="#fff" stroke-width="1.3"/>'
            + '<path d="M' + fmt(fq.x - 6) + ' ' + fmt(fq.y) + ' H' + fmt(fq.x + 6) + ' M' + fmt(fq.x) + ' ' + fmt(fq.y) + ' V' + fmt(fq.y + 6) + '" stroke="#fff" stroke-width="1.2" fill="none"/>';
        }
        /* 图面三通第三口旋转（2026-09-16）：spin≠0 时补画 T 形（贯通杆=宿管中心轴、
           第三口=绕宿管轴旋转后的方向，与模型三通 autoSpin 同款画法）。
           ★ spin 缺省（0/未转）时 spinSym 为空串 —— 未旋转图面输出与旧版逐字节一致。 */
        var spinSym = '';
        if (f.kind === 'tee' && f.spin && typeof AE.tangentAt === 'function') {
          var fdir = AE.tangentAt(f.pid, data, f.atM);
          if (fdir) {
            var fqa = P(pos.x - fdir.x, pos.y - fdir.y, fz), fqb = P(pos.x + fdir.x, pos.y + fdir.y, fz);
            var ftAng = Math.atan2(fqb.y - fqa.y, fqb.x - fqa.x) * 180 / Math.PI;
            var fper = { x: -fdir.y, y: fdir.x };
            var fb3 = rotateAboutAxis({ x: fper.x, y: fper.y, z: 0 }, { x: fdir.x, y: fdir.y, z: 0 }, f.spin * Math.PI / 180);
            var fqb2 = P(pos.x + fb3.x, pos.y + fb3.y, fz + fb3.z);
            var fbAng = Math.atan2(fqb2.y - fq.y, fqb2.x - fq.x) * 180 / Math.PI;
            spinSym = '<path d="M' + fmt(fq.x - 8) + ' ' + fmt(fq.y) + ' H' + fmt(fq.x + 8) + '" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" transform="rotate(' + fmt(ftAng) + ' ' + fmt(fq.x) + ' ' + fmt(fq.y) + ')"/>'
              + '<path d="M' + fmt(fq.x) + ' ' + fmt(fq.y) + ' L' + fmt(fq.x + 9.4) + ' ' + fmt(fq.y) + '" stroke="' + COLORS.branch + '" stroke-width="2.4" fill="none" stroke-linecap="round" transform="rotate(' + fmt(fbAng) + ' ' + fmt(fq.x) + ' ' + fmt(fq.y) + ')"/>';
          }
        }
        var fLabels = '';
        /* 第三口口径标注（2026-09-24 任务⑨）：设置了 branchSpec 的图面三通在符号右上显示 Ø 值 */
        if (f.kind === 'tee' && AE.fitBranchSpecOf && AE.fitBranchSpecOf(f.id)) {
          fLabels += '<text x="' + fmt(fq.x + 8) + '" y="' + fmt(fq.y - 7) + '" font-size="9.5" font-family="system-ui" font-weight="700" fill="#166534" paint-order="stroke" stroke="white" stroke-width="2.5" pointer-events="none">第三口 Ø' + esc(AE.fitBranchSpecOf(f.id)) + '</text>';
        }
        if (fSel) {   /* 选中/拖动：距起点·距终点两段距离（和=当前有效管长，阶段2b） */
          var fepts = AE.effPts(f.pid, data);
          if (fepts) {
            var fLen = AE.polylineLen(fepts);
            var fD1 = Math.max(0, Math.min(f.atM, fLen)), fD2 = fLen - fD1;
            var fLab = function (at, tag) {
              var p2 = AE.pointAt(f.pid, data, at);
              if (!p2) return '';
              var q2 = P(p2.x, p2.y, fz);
              return '<text data-tlfitdist="' + tag + '" x="' + fmt(q2.x + 5) + '" y="' + fmt(q2.y - 5) + '" font-size="9.5" font-family="system-ui" font-weight="700" fill="#b45309" paint-order="stroke" stroke="white" stroke-width="2.5" pointer-events="none">' + esc(at.toFixed(1) + 'm') + '</text>';
            };
            fLabels += fLab(fD1 / 2, 'start') + fLab(fD1 + fD2 / 2, 'end');   /* +=（任务⑨）：保留前置的第三口口径标注，勿覆盖 */
          }
        }
        s.push('<g class="iso-tlfit" data-tlfit="' + esc(f.id) + '" style="cursor:pointer"><title>'
          + esc(f.id + ' · ' + (KIND_LABEL[f.kind] || '配件') + ' · ' + AE.pipeName(f.pid) + ' ' + pos.along.toFixed(1) + 'm') + '</title>'
          + (fSel ? '<circle cx="' + fmt(fq.x) + '" cy="' + fmt(fq.y) + '" r="9" fill="none" stroke="#7c3aed" stroke-width="1.6" stroke-dasharray="4,3"/>' : '')
          + fsym + spinSym + fLabels + '</g>');
      });
      s.push('</g>');
    }

    /* 9) 连接平面路径保持不变；三通处用真正竖直立管表达层差。 */
    s.push('<g' + clipAttr + '>');
    model.valves.forEach(function (v) {
      var q = valvePoint(v);
      if (v.conn) {
        var t0 = P(v.conn.x, v.conn.y, HEIGHTS.main);
        s.push('<g class="iso-fit" data-fit="R-' + esc(v.id) + '"><title>连接立管（展开示意）</title><path d="M'+fmt(t0.x)+' '+fmt(t0.y)+' L'+fmt(q.x)+' '+fmt(q.y)+'" stroke="transparent" stroke-width="10"/>');
        s.push('<path data-connector="main-branch" d="M' + fmt(t0.x) + ' ' + fmt(t0.y) + ' L' + fmt(q.x) + ' ' + fmt(q.y) + '" fill="none" stroke="' + COLORS.main + '" stroke-width="1.5"/>' + fitLabel('R-'+v.id,q,false) + '</g>');
      }
    });
    s.push('</g>');
    s.push('<g' + clipAttr + '>');
    model.valves.forEach(function (v) {
      var q = valvePoint(v);
      var tee = model.tees.filter(function(t) { return t.id === v.tee; })[0];
      var before = P(tee.point.x, tee.point.y, v.z);
      var angle = Math.atan2(q.y - before.y, q.x - before.x) * 180 / Math.PI;
      // 支管阀画在立管中部，三通—阀门—支管依次连接。
      if (v.conn) { q.y += params('R-'+v.id).rise * (1-params('R-'+v.id).position); angle = -90; }
      s.push('<g class="iso-fit" data-fit="' + esc(v.id) + '" style="cursor:pointer"><title>' + esc(v.id + (v.zone ? ' · ' + v.zone : '') + ' · 上游 ' + v.upstream + ' · 下游 ' + v.downstream) + '</title>'
        + scaledSymbol(valveSymbol(q, angle),q,v.id)
        + fitLabel(v.id,q,false)
        + '</g>');
    });
    s.push('</g>');

    /* 10) 三通符号（T 形短杆 + 圆点） */
    s.push('<g' + clipAttr + '>');
    model.tees.forEach(function (t) {
      var z = t.type === 'front-main' ? HEIGHTS.front : HEIGHTS.main;
      var q = P(t.point.x, t.point.y, z);
      /* 第三口旋转覆盖（2026-09-16）：该自动三通被右键旋转过 → 补画 T 形
         （贯通杆 = 宿管中心轴、第三口 = branchDir，各自投影后旋转）。
         ★ 无覆盖时 spinSym 为空串 → 本段输出与改动前逐字节一致（等价性零差异）。 */
      var spinSym = '';
      if (autoSpin[t.id]) {
        var sTdir = teeThroughDir(t);
        var sqt = P(t.point.x + sTdir.x, t.point.y + sTdir.y, z);
        var sTAng = Math.atan2(sqt.y - q.y, sqt.x - q.x) * 180 / Math.PI;
        var sBdir = teeBranchDir(t);
        var sqb = P(t.point.x + sBdir.x, t.point.y + sBdir.y, z);
        var sBAng = Math.atan2(sqb.y - q.y, sqb.x - q.x) * 180 / Math.PI;
        spinSym = '<path d="M' + fmt(q.x - 8) + ' ' + fmt(q.y) + ' H' + fmt(q.x + 8) + '" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" transform="rotate(' + fmt(sTAng) + ' ' + fmt(q.x) + ' ' + fmt(q.y) + ')"/>'
          + '<path d="M' + fmt(q.x) + ' ' + fmt(q.y) + ' L' + fmt(q.x + 9.4) + ' ' + fmt(q.y) + '" stroke="' + COLORS.branch + '" stroke-width="2.4" fill="none" stroke-linecap="round" transform="rotate(' + fmt(sBAng) + ' ' + fmt(q.x) + ' ' + fmt(q.y) + ')"/>';
      }
      s.push('<g class="iso-fit" data-fit="' + esc(t.id) + '" style="cursor:pointer"><title>' + esc(t.id + ' · ' + t.upstream + ' → ' + t.downstream) + '</title>'
        + '<circle cx="' + fmt(q.x) + '" cy="' + fmt(q.y) + '" r="7" fill="transparent"/>'
        + spinSym
        + '<circle cx="' + fmt(q.x) + '" cy="' + fmt(q.y) + '" r="' + (2*params(t.id).size) + '" fill="' + COLORS.tee + '"/>' + fitLabel(t.id,q,false) + '</g>');
    });
    s.push('</g>');

    /* 节点圆（2026-09-24 任务⑥）：可捕捉的空口画白心圆（三通空分支口 / 接管自由端），
       与 nearNode 吸附点一一对应 —— 图上看得见的「节点」，供右键接管/画线捕捉。 */
    function nodeDot(q) {
      return '<circle class="iso-node" cx="' + fmt(q.x) + '" cy="' + fmt(q.y) + '" r="3.1" fill="#fff" stroke="' + COLORS.tee + '" stroke-width="1.5" pointer-events="none"/>';
    }
    /* 10b) 手工配件层（编辑层：三通/弯头/阀门，非水力计算对象；点击可查参数） */
    if (manual.length) {
      s.push('<g' + clipAttr + '>');
      manual.forEach(function (m) {
        /* 接管（kind='pipe'）没有 point，只有 pts 折线：取中点作标签/缩放锚点，
           否则下方 scaledSymbol/fitLabel 会解引用 undefined.x（2026-09-16 修复）。 */
        var isPipe = m.kind === 'pipe';
        if (isPipe && (!m.pts || m.pts.length < 2)) return;
        var anchor = isPipe ? m.pts[Math.floor((m.pts.length - 1) / 2)] : m.point;
        var q = shifted(P(anchor.x, anchor.y, isPipe ? anchor.z : m.z), m.segType === 'branch' ? branchOffsets[m.segIndex] : null);
        var sym = '';
        if (m.kind === 'valve') {
          var line = m.segType === 'front' ? model.front : (m.segType === 'main' ? model.mains : model.branches)[m.segIndex];
          var angle = 0, nearest = Infinity;
          for (var j = 0; line && j + 1 < line.length; j++) {
            var distance = segDist(m.point, line[j], line[j + 1]);
            if (distance < nearest) {
              nearest = distance;
              var a = P(line[j].x, line[j].y, m.z), b = P(line[j + 1].x, line[j + 1].y, m.z);
              angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
            }
          }
          sym = valveSymbol(q, angle);
        } else if (m.kind === 'elbow') {
          sym = '<rect x="' + fmt(q.x - 5) + '" y="' + fmt(q.y - 5) + '" width="10" height="10" fill="' + COLORS.elbow + '" stroke="#fff" stroke-width="1.6" transform="rotate(45 ' + fmt(q.x) + ' ' + fmt(q.y) + ')"/>';
        } else if (m.kind === 'pipe') {
          sym = '';   /* 接管：无符号，仅画管段（下方 att） */
        } else {
          /* 三通符号（2026-09-16 用户口径）：**贯通杆 = 宿管中心轴方向**（两端接管道），
             **第三口短杆 = branchDir**。两者分别投影后各自旋转，屏幕上仍是「T 形」，
             且第三口绕管轴旋转时贯通杆始终贴合管道、不会被拧歪。 */
          var tdir = teeThroughDir(m);
          var qt = P(m.point.x + tdir.x, m.point.y + tdir.y, m.z + tdir.z);
          var tAng = Math.atan2(qt.y - q.y, qt.x - q.x) * 180 / Math.PI;
          var bdir = teeBranchDir(m);
          var qb = P(m.point.x + bdir.x, m.point.y + bdir.y, m.z + bdir.z);
          var bAng = Math.atan2(qb.y - q.y, qb.x - q.x) * 180 / Math.PI;
          sym = '<circle cx="' + fmt(q.x) + '" cy="' + fmt(q.y) + '" r="5.2" fill="' + COLORS.tee + '" stroke="#fff" stroke-width="1.6"/>'
            + '<path d="M' + fmt(q.x - 7) + ' ' + fmt(q.y) + ' H' + fmt(q.x + 7) + '" stroke="#fff" stroke-width="1.5" fill="none" transform="rotate(' + fmt(tAng) + ' ' + fmt(q.x) + ' ' + fmt(q.y) + ')"/>'
            + '<path d="M' + fmt(q.x) + ' ' + fmt(q.y) + ' L' + fmt(q.x + 7.4) + ' ' + fmt(q.y) + '" stroke="#fff" stroke-width="1.5" fill="none" transform="rotate(' + fmt(bAng) + ' ' + fmt(q.x) + ' ' + fmt(q.y) + ')"/>';
        }
        /* 分支口 / 接管绘制（2026-09-16）：接管画整段折线；三通按是否旋转画 3D 分支或保留原水平分支 */
        var att = '';
        var mp = params(m.id);
        if (m.kind === 'pipe' && m.pts && m.pts.length >= 2) {
          var pp = m.pts.map(function (pt) { return shifted(P(pt.x, pt.y, pt.z), m.segType === 'branch' ? branchOffsets[m.segIndex] : null); });
          var pd = pp.map(function (p) { return fmt(p.x) + ' ' + fmt(p.y); }).join(' L');
          att = '<path d="M' + pd + '" fill="none" stroke="' + COLORS.branch + '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>';
        } else if (m.kind === 'tee') {
          if (m.branchDir && isFinite(m.branchDir.x)) {
            /* 已绕 X/Y/Z 旋转：沿 3D 方向画分支口（未转换时画短虚线指示方向） */
            var bd = teeBranchDir(m);
            var blen = (mp.teeType && Number.isFinite(mp.branchLen) && mp.branchLen > 0) ? mp.branchLen : 0.6;
            var boff = m.segType === 'branch' ? branchOffsets[m.segIndex] : null;
            var e3 = shifted(P(m.point.x + bd.x * blen, m.point.y + bd.y * blen, m.z + bd.z * blen), boff);
            att = '<path d="M' + fmt(q.x) + ' ' + fmt(q.y) + ' L' + fmt(e3.x) + ' ' + fmt(e3.y) + '" fill="none" stroke="' + (mp.teeType ? COLORS.branch : '#94a3b8') + '" stroke-width="' + (mp.teeType ? 2.4 : 1.6) + '" stroke-linecap="round"' + (mp.teeType ? '' : ' stroke-dasharray="3 3"') + '/>';
            if (mp.teeType && mp.branchSpec) att += '<text x="' + fmt(e3.x + 4) + '" y="' + fmt(e3.y - 4) + '" font-size="9" font-family="system-ui" fill="#166534" paint-order="stroke" stroke="white" stroke-width="2.5">' + esc(mp.branchSpec + '×' + mp.branchLen + 'm') + '</text>';
          } else if (mp.teeType && mp.branchSpec && Number.isFinite(mp.branchLen) && mp.branchLen > 0) {
            /* 未旋转：保留原水平分支画法（屏幕朝上侧，2026-09-14） */
            var attLine = m.segType === 'front' ? model.front : (m.segType === 'main' ? model.mains : model.branches)[m.segIndex];
            var attDir = null, attBest = Infinity;
            for (var aj = 0; attLine && aj + 1 < attLine.length; aj++) {
              var attD = segDist(m.point, attLine[aj], attLine[aj + 1]);
              if (attD < attBest) {
                attBest = attD;
                var adx = attLine[aj + 1].x - attLine[aj].x, ady = attLine[aj + 1].y - attLine[aj].y, adl = Math.hypot(adx, ady) || 1;
                attDir = { x: adx / adl, y: ady / adl };
              }
            }
            if (attDir) {
              var attOff = m.segType === 'branch' ? branchOffsets[m.segIndex] : null;
              var attE1 = shifted(P(m.point.x - attDir.y * mp.branchLen, m.point.y + attDir.x * mp.branchLen, m.z), attOff);
              var attE2 = shifted(P(m.point.x + attDir.y * mp.branchLen, m.point.y - attDir.x * mp.branchLen, m.z), attOff);
              var attE = attE1.y <= attE2.y ? attE1 : attE2; /* 屏幕朝上的一侧 */
              att = '<path d="M' + fmt(q.x) + ' ' + fmt(q.y) + ' L' + fmt(attE.x) + ' ' + fmt(attE.y) + '" fill="none" stroke="' + COLORS.branch + '" stroke-width="2.4" stroke-linecap="round"/>'
                + '<text x="' + fmt(attE.x + 4) + '" y="' + fmt(attE.y - 4) + '" font-size="9" font-family="system-ui" fill="#166534" paint-order="stroke" stroke="white" stroke-width="2.5">' + esc(mp.branchSpec + '×' + mp.branchLen + 'm') + '</text>';
            }
          }
        }
        /* 节点圆（2026-09-24 任务⑥）：三通尚无分支接管 → 分支口画节点圆；
           接管两端中未贴在其它节点上的自由端画节点圆（贴了 = 口已占用）。 */
        var nodeDots = '';
        if (m.kind === 'tee') {
          var hasBP = manual.some(function (x) { return x.kind === 'pipe' && x.teeId === m.id; });
          if (!hasBP) {
            var bdN = teeBranchDir(m);
            var blN = (mp.teeType && Number.isFinite(mp.branchLen) && mp.branchLen > 0) ? mp.branchLen : 0.6;
            var boN = m.segType === 'branch' ? branchOffsets[m.segIndex] : null;
            nodeDots = nodeDot(shifted(P(m.point.x + bdN.x * blN, m.point.y + bdN.y * blN, m.z + bdN.z * blN), boN));
          }
        } else if (m.kind === 'pipe' && m.pts && m.pts.length >= 2) {
          for (var ei = 0; ei < 2; ei++) {
            var epN = ei === 0 ? m.pts[0] : m.pts[m.pts.length - 1];
            if (nearNode(epN, m.id)) continue;   /* 端点已贴在其它节点（宿三通/对端）上：口已占用 */
            var eoN = m.segType === 'branch' ? branchOffsets[m.segIndex] : null;
            nodeDots += nodeDot(shifted(P(epN.x, epN.y, epN.z || 0), eoN));
          }
        }
        att += nodeDots;
        s.push('<g class="iso-fit" data-fit="' + esc(m.id) + '" style="cursor:pointer"><title>'
          + esc(m.id + ' · ' + KIND_LABEL[m.kind] + ' · ' + (m.spec || '与管道同径')) + '</title>' + att + scaledSymbol(sym,q,m.id) + fitLabel(m.id,q,!!edits[m.id]) + '</g>');
      });
      s.push('</g>');
    }

    /* 11) 水源/泵符号 */
    if (model.source) {
      var q0 = P(model.source.x, model.source.y, HEIGHTS.source);
      s.push('<g><circle cx="' + fmt(q0.x) + '" cy="' + fmt(q0.y) + '" r="9" fill="' + COLORS.source + '" stroke="#fff" stroke-width="2"/>'
        + '<text x="' + fmt(q0.x) + '" y="' + fmt(q0.y + 3.5) + '" text-anchor="middle" font-size="9" font-weight="700" fill="#fff">P</text></g>');
    }

    /* 管径引线保持数据原文，不能把PE外径自动冒充DN。 */
    function pipeNote(line, z, text, offset, shift) {
      if (!line || line.length < 2) return;
      var a = line[0], b = line[line.length - 1];
      var q = shifted(P((a.x + b.x) / 2, (a.y + b.y) / 2, z), shift);
      s.push('<g data-pipe-note="1" pointer-events="none" font-size="10" font-family="system-ui" fill="#202020"><path d="M' + fmt(q.x) + ' ' + fmt(q.y) + ' l12 ' + offset + ' h70" fill="none" stroke="#555" stroke-width="0.6"/><text x="' + fmt(q.x + 14) + '" y="' + fmt(q.y + offset - 3) + '" paint-order="stroke" stroke="white" stroke-width="3">' + esc(text) + '</text></g>');
    }
    /* 2026-09-15 用户要求：标注简化 —— 同类型管道不逐根引出标注（图里只剩总管一条），
       主管/支管规格改由图例文字给出，用颜色区分类型；点击管件仍可查看参数。 */
    pipeNote(model.front, HEIGHTS.front, '总管 ' + pipeTxt('front', '管径待定'), 20);
    s.push('<g transform="translate(65 655)" pointer-events="none" fill="none" stroke="#555" stroke-width="0.8"><path d="M0 -32 V0 H38 M0 0 L27 -27"/><g stroke="none" fill="#333" font-family="system-ui" font-size="10"><text x="40" y="4">X</text><text x="28" y="-29">Y</text><text x="-4" y="-37">Z</text></g></g>');

    /* 11b) 最远水路（轴测图，2026-09-24 用户要求）—— 与平面图 tlWorstPathMarkSVG 同款紫色标注：
       总管段(z=front 高程) + 接入立管(front→main) + 主管段(z=main 高程) + 末端圆点 + 标签。
       复用 [data-tlworst] / .tl-worst-flow 通用 CSS：「显示最不利路径」开关与流动动画自动继承。
       数据源 tlWorstPathLen(true).geom 与平面图同源；仅当渲染数据=当前图面数据时绘制（防快照错配）。 */
    (function () {
      var wpG = null, wpZi = -1, wpLen = 0;
      try {
        if (window.tlWorstPathLen && window.tlDiagramData && data === window.tlDiagramData) {
          var wp = window.tlWorstPathLen(true);
          if (wp && wp.fromFigure && wp.geom && wp.geom.frontPts && wp.geom.frontPts.length >= 2
              && wp.geom.mainPts && wp.geom.mainPts.length >= 2) {
            wpG = wp.geom; wpZi = wp.zoneIndex | 0; wpLen = Number(wp.geom.len);
          }
        }
      } catch (e) { wpG = null; }
      if (!wpG) return;
      function projLine(pts, z) {
        var d = '';
        for (var i = 0; i < pts.length; i++) {
          var q = P(pts[i].x, pts[i].y, z);
          if (!Number.isFinite(q.x) || !Number.isFinite(q.y)) return null;
          d += (i ? 'L' : 'M') + fmt(q.x) + ' ' + fmt(q.y);
        }
        return d;
      }
      var dF = projLine(wpG.frontPts, HEIGHTS.front);
      var dM = projLine(wpG.mainPts, HEIGHTS.main);
      if (!dF || !dM) return;
      /* 接入立管：接点处 front 高程水平段 → 升到 main 高程（与 §4a 总管↔主管接入段同构） */
      var dL = null;
      if (wpG.linkPts && wpG.linkPts.length === 2) {
        var qa = P(wpG.linkPts[0].x, wpG.linkPts[0].y, HEIGHTS.front);
        var qb0 = P(wpG.linkPts[1].x, wpG.linkPts[1].y, HEIGHTS.front);
        var qb1 = P(wpG.linkPts[1].x, wpG.linkPts[1].y, HEIGHTS.main);
        if (Number.isFinite(qa.x) && Number.isFinite(qa.y) && Number.isFinite(qb1.x) && Number.isFinite(qb1.y))
          dL = 'M' + fmt(qa.x) + ' ' + fmt(qa.y) + 'L' + fmt(qb0.x) + ' ' + fmt(qb0.y) + 'L' + fmt(qb1.x) + ' ' + fmt(qb1.y);
      }
      var glow = 'fill="none" stroke="#a855f7" stroke-opacity="0.40" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"';
      var flow = 'fill="none" stroke="#7e22ce" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
      var segs = '<path d="' + dF + '"/><path d="' + dM + '"/>' + (dL ? '<path d="' + dL + '"/>' : '');
      var g = '<g data-tlworst="1" pointer-events="none">';
      g += '<g ' + glow + '>' + segs + '</g>';
      g += '<g ' + flow + ' class="tl-worst-flow">' + segs + '</g>';
      if (wpG.endPt && Number.isFinite(wpLen)) {
        var qe = P(wpG.endPt.x, wpG.endPt.y, HEIGHTS.main);
        if (Number.isFinite(qe.x) && Number.isFinite(qe.y)) {
          g += '<circle cx="' + fmt(qe.x) + '" cy="' + fmt(qe.y) + '" r="3.5" fill="#fff" stroke="#7e22ce" stroke-width="1.8"/>';
          /* 标签分档：末端点在图纸右半区时改向左侧延伸（text-anchor:end）——
             右侧浮动面板（经济性对比等）会盖住 SVG 右缘，右半区一律朝左写最稳妥 */
          var wpLabelRight = qe.x > svgW / 2;
          g += '<text x="' + fmt(qe.x + (wpLabelRight ? -7 : 7)) + '" y="' + fmt(qe.y - 6) + '"'
            + (wpLabelRight ? ' text-anchor="end"' : '')
            + ' font-size="10" font-weight="700" font-family="system-ui" fill="#7e22ce" paint-order="stroke" stroke="white" stroke-width="2.5">最远 ' + (wpZi + 1) + ' 区 · ' + fmt(wpLen) + ' m</text>';
        }
      }
      g += '</g>';
      s.push(g);
    })();

    /* 12) 图例 + 底部参数 —— 图例含管径规格（2026-09-15：管道逐根标注已取消，规格看这里） */
    var ly = svgH - footerH + 30, lx = 60;
    s.push('<g font-family="system-ui,sans-serif" font-size="10.5" font-weight="600">');
    function legItem(x, draw, label, color) {
      s.push(draw(x, ly));
      s.push('<text x="' + (x + 20) + '" y="' + (ly + 4) + '" fill="' + (color || '#334155') + '">' + esc(label) + '</text>');
      var w = 24;
      for (var li = 0; li < label.length; li++) w += label.charCodeAt(li) > 255 ? 10.5 : 6; /* 中文≈10.5px，数字/字母≈6px */
      return x + w + 14;
    }
    var x0 = lx;
    x0 = legItem(x0, function (x, y) { return '<rect x="' + x + '" y="' + (y - 4) + '" width="14" height="4" rx="2" fill="' + COLORS.front + '"/>'; }, '总管 ' + pipeTxt('front', '管径待定'));
    x0 = legItem(x0, function (x, y) { return '<rect x="' + x + '" y="' + (y - 4) + '" width="14" height="4" rx="2" fill="' + COLORS.main + '"/>'; }, '主管 ' + pipeTxt('main', '管径待定'));
    x0 = legItem(x0, function (x, y) { return '<rect x="' + x + '" y="' + (y - 3) + '" width="14" height="3" rx="1.5" fill="' + COLORS.branch + '"/>'; }, '支管 ' + pipeTxt('branch', '管径待定'));
    /* 滴灌带图例已随绘制一并移除（2026-09-13） */
    x0 = legItem(x0, function (x, y) { return '<path d="M' + x + ' ' + y + ' h14 m-7 0 v-9" fill="none" stroke="#202020" stroke-width="1.5"/>'; }, '三通连接');
    x0 = legItem(x0, function (x, y) { return valveSymbol({x:x + 7,y:y}, 0); }, '阀门(通用)');
    x0 = legItem(x0, function (x, y) { return '<circle cx="' + (x + 7) + '" cy="' + (y - 2) + '" r="6" fill="' + COLORS.source + '"/>'; }, '水源/泵');
    /* v136 发现的既有小 bug 顺手修：meta.pump/live.pump 存的是结果条文本（自带单位），
       旧模板再拼一次单位 → 「40.0 m³/h m³/h」。此处只取数字，单位由本模板统一拼。 */
    function isoNum(v) { var m2 = String(v == null ? '' : v).match(/\d+(?:\.\d+)?/); return m2 ? m2[0] : '—'; }
    var pumpTxt = '水泵 ' + isoNum(pumpTxtOf('flow')) + ' m³/h · ' + isoNum(pumpTxtOf('head')) + ' m · ' + isoNum(pumpTxtOf('power')) + ' kW';
    s.push('<text x="' + lx + '" y="' + (ly + 26) + '" fill="#334155">' + esc('联合灌溉 ' + zoneCount + ' 区 · ' + pumpTxt) + '</text>');
    s.push('<text x="' + lx + '" y="' + (ly + 44) + '" font-size="10" font-weight="400" fill="#444">45°正面斜轴测 · 不按比例 · 支管按Z向立管展开；标高/埋深待设计确认，非施工放样依据。G=主管，Z=支管。</text>');
    s.push('</g>');
    /* 进行中手工管线折线预览（插入模式，2026-09-15 阶段1） */
    if (pipeDraft && pipeDraft.pts.length && viewState) {
      (function () {
        function PD(x, y, z) { var q = projectIso(x, y, z, viewState.k); return { x: viewState.ox + q.x, y: viewState.oy + q.y }; }
        var z = pipeDraft.kind === 'main' ? HEIGHTS.main : HEIGHTS.branch;
        var d = '';
        pipeDraft.pts.forEach(function (p, i) { var q = PD(p.x, p.y, z); d += (i ? 'L' : 'M') + fmt(q.x) + ' ' + fmt(q.y); });
        var g = '<g id="isoPipeDraft" pointer-events="none"><path d="' + d + '" fill="none" stroke="#7c3aed" stroke-width="2" stroke-dasharray="6,4" opacity="0.9"/>';
        pipeDraft.pts.forEach(function (p) { var q = PD(p.x, p.y, z); g += '<circle cx="' + fmt(q.x) + '" cy="' + fmt(q.y) + '" r="2.6" fill="#7c3aed"/>'; });
        s.push(g + '</g>');
      })();
    }
    s.push('</svg>');
    var output=s.join('');
    if(draft)output=output.replace('data-fit="'+draft.id+'"','data-selected="true" data-fit="'+draft.id+'"');
    return output;
  }

  function esc(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ---------- 视口交互（平移/缩放，对齐二级管线制图区体验） ----------
   * · 滚轮：以鼠标位置为中心缩放；
   * · 拖拽（按住左键）：平移；
   * · 双击 / 工具条「适应窗口」：复位到适应窗口；
   * · 工具条「放大 / 缩小」：以画布中心缩放。
   * 仅变换显示（CSS transform），不改 SVG 内容，导出不受影响。 */
  var view = { z: 1, x: 0, y: 0 };
  function zoomPct() { return document.getElementById('tlIsoZoomPct'); }
  function applyView(ctn, el) {
    el.style.transformOrigin = '0 0';
    el.style.transform = 'translate(' + fmt2(view.x) + 'px,' + fmt2(view.y) + 'px) scale(' + fmt2(view.z) + ')';
    var pct = zoomPct(); if (pct) pct.textContent = Math.round(view.z * 100) + '%';
  }
  function fmt2(v) { return Math.round(v * 100) / 100; }
  function baseFit(ctn, el) { /* 基准宽度=容器宽（适应窗口时 z=1、位移 0） */
    var w = (ctn.clientWidth || 900) - 8;
    if (!(w > 120)) w = 900;
    el.style.width = w + 'px';
    el.style.height = 'auto';
  }
  function zoomAt(ctn, el, cx, cy, factor) {
    var nz = Math.max(0.2, Math.min(8, view.z * factor));
    if (nz === view.z) return;
    view.x = cx - (cx - view.x) * (nz / view.z);
    view.y = cy - (cy - view.y) * (nz / view.z);
    view.z = nz;
    applyView(ctn, el);
  }
  function currentCTN() {
    if (typeof document === 'undefined') return null; /* Node 测试环境无 DOM */
    return document.getElementById('tlIsoDiagramContent');
  }
  function currentEL(ctn) { return ctn ? ctn.querySelector('svg') : null; }
  function requireSVG() {
    var ctn = currentCTN(), el = currentEL(ctn);
    if (!el) { alert('请先生成轴测图'); return null; }
    return { ctn: ctn, el: el };
  }
  function zoomIn() { var t = requireSVG(); if (!t) return; var r = t.ctn.getBoundingClientRect(); zoomAt(t.ctn, t.el, r.width / 2, r.height / 2, 1.25); }
  function zoomOut() { var t = requireSVG(); if (!t) return; var r = t.ctn.getBoundingClientRect(); zoomAt(t.ctn, t.el, r.width / 2, r.height / 2, 0.8); }
  function zoomFit() {
    var t = requireSVG(); if (!t) return;
    view.z = 1; view.x = 0; view.y = 0;
    baseFit(t.ctn, t.el); applyView(t.ctn, t.el);
  }
  function wireInteractions(ctn) {
    if (ctn._isoWired) return; /* 容器只挂一次监听，重渲染不叠加 */
    ctn._isoWired = true;
    ctn.style.touchAction = 'none';
    ctn.tabIndex = -1;   /* 可聚焦：插入管线模式下 Enter/Esc 键盘接线（2026-09-15 阶段1） */
    ctn.addEventListener('wheel', function (e) {
      var el = currentEL(ctn); if (!el) return;
      e.preventDefault();
      var r = ctn.getBoundingClientRect();
      zoomAt(ctn, el, e.clientX - r.left, e.clientY - r.top, e.deltaY > 0 ? 0.9 : 1.1);
    }, { passive: false });
    var drag = null;
    ctn.addEventListener('pointerdown', function (e) {
      var el = currentEL(ctn); if (!el) return;
      try { ctn.focus({ preventScroll: true }); } catch (err) { try { ctn.focus(); } catch (e2) {} }
      /* 配件沿管拖动（阶段2b）：左键按在图面配件上 → 进入拖动（平移让位）；capture 挂容器（重渲染不丢） */
      if (e.button === 0 && !pipeMode && viewState && lastDataRef) {
        var tD = document.elementFromPoint(e.clientX, e.clientY);
        var fgD = tD && tD.closest ? tD.closest('[data-tlfit]') : null;
        if (fgD) {
          var fidD = fgD.getAttribute('data-tlfit');
          var gfD = (AE.fitsList() || []).filter(function (x) { return x.id === fidD; })[0];
          if (gfD) {
            fitDrag = { id: gfD.id, pointerId: e.pointerId, atM: gfD.atM };
            selFitId = gfD.id; selAutoId = null; selPipeId = null;
            rerenderKeepView();
            if (typeof api.onAutoSel === 'function') api.onAutoSel(autoSelInfo());
            if (ctn.setPointerCapture) { try { ctn.setPointerCapture(e.pointerId); } catch (e3) {} }
            e.preventDefault();
            return;
          }
        }
      }
      /* 插入管线模式下左键用于逐点画线，平移让位（与三级工作区口径一致） */
      if (e.button === 1 || (e.button === 0 && !pipeMode)) {
        drag = { x: e.clientX - view.x, y: e.clientY - view.y, id: e.pointerId };
        el.classList.add('iso-dragging');
        if (el.setPointerCapture) { try { el.setPointerCapture(e.pointerId); } catch (err) { } }
        e.preventDefault();
      }
    });
    ctn.addEventListener('pointermove', function (e) {
      if (fitDrag && e.pointerId === fitDrag.pointerId) {   /* 配件沿管拖动：逆投影→沿管弧长（rAF 节流提交，阶段2b） */
        var elF = currentEL(ctn);
        var fF = (AE.fitsList() || []).filter(function (x) { return x.id === fitDrag.id; })[0];
        if (elF && fF && lastDataRef && viewState) {
          var uF = svgUserPoint(elF, e.clientX, e.clientY);
          if (uF) {
            var zF = fF.pid === 'front' ? HEIGHTS.front : (fF.pid.indexOf('main-') === 0 ? HEIGHTS.main : HEIGHTS.branch);
            var dF = unprojectIso(uF.x - viewState.ox, uF.y - viewState.oy, zF, viewState.k);
            var locF = AE.locate(fF.pid, lastDataRef, dF);
            if (locF) {
              fitDrag.atM = locF.along;
              if (!fitDragRaf) fitDragRaf = requestAnimationFrame(function () {
                fitDragRaf = 0;
                if (fitDrag) AE.moveFitting(fitDrag.id, fitDrag.atM, lastDataRef, 'iso');
              });
            }
          }
        }
        return;
      }
      if (!drag || e.pointerId !== drag.id) {
        /* 插入管线模式：悬停跟随预览（只更新 isoPipeDraft 组，不重建整图） */
        if (pipeMode && pipeDraft && pipeDraft.pts.length && viewState) {
          var elp = currentEL(ctn);
          var u = elp && svgUserPoint(elp, e.clientX, e.clientY);
          var dg = elp && ctn.querySelector('#isoPipeDraft');
          if (u && dg) {
            var z = pipeMode === 'main' ? HEIGHTS.main : HEIGHTS.branch;
            function PD(x, y) { var q = projectIso(x, y, z, viewState.k); return { x: viewState.ox + q.x, y: viewState.oy + q.y }; }
            var pd = unprojectIso(u.x - viewState.ox, u.y - viewState.oy, z, viewState.k);
            var d = '';
            pipeDraft.pts.forEach(function (p, i) { var q = PD(p.x, p.y); d += (i ? 'L' : 'M') + fmt(q.x) + ' ' + fmt(q.y); });
            var qe = PD(pd.x, pd.y);
            d += 'L' + fmt(qe.x) + ' ' + fmt(qe.y);
            var h = '<path d="' + d + '" fill="none" stroke="#7c3aed" stroke-width="2" stroke-dasharray="6,4" opacity="0.9"/>';
            pipeDraft.pts.forEach(function (p) { var q = PD(p.x, p.y); h += '<circle cx="' + fmt(q.x) + '" cy="' + fmt(q.y) + '" r="2.6" fill="#7c3aed"/>'; });
            dg.innerHTML = h;
          }
        }
        return;
      }
      var el = currentEL(ctn); if (!el) return;
      view.x = e.clientX - drag.x; view.y = e.clientY - drag.y;
      applyView(ctn, el);
    });
    function up(e) {
      if (fitDrag && (e.pointerId === undefined || e.pointerId === fitDrag.pointerId)) fitDrag = null;
      if (!drag || (e.pointerId !== undefined && e.pointerId !== drag.id)) return;
      drag = null;
      var el = currentEL(ctn); if (el) el.classList.remove('iso-dragging');
    }
    ctn.addEventListener('pointerup', up);
    ctn.addEventListener('pointercancel', up);
    ctn.addEventListener('dblclick', function () {
      /* 插入管线模式：双击结束画线（对齐三级工作区交互）；否则适应窗口 */
      if (pipeMode && pipeDraft && pipeDraft.pts.length >= 2) { commitPipeDraft(); return; }
      zoomFit();
    });
    /* 键盘：Enter 结束 / Esc 取消草稿（无草稿时退出插入模式）。容器 tabIndex=-1 可聚焦 */
    ctn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && pipeDraft) { commitPipeDraft(); e.preventDefault(); }
      else if (e.key === 'Escape') {
        if (pipeDraft) { pipeDraft = null; rerenderKeepView(); }
        else if (pipeMode) endPipeMode();
        e.preventDefault();
      }
    });
    /* 点击（与拖拽平移区分：按下到抬起位移 ≤5px 才算点击）：
       放置模式 → 沿管线放置配件；否则 → 命中构件显示参数 */
    var downPos = null;
    ctn.addEventListener('pointerdown', function (e) { downPos = { x: e.clientX, y: e.clientY }; });
    ctn.addEventListener('click', function (e) {
      if (!downPos || Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 5) return;
      handleClick(ctn, e);
    });
    /* 右键构件（2026-09-14）：命中 g[data-fit] 时拦截默认菜单，交页面弹出
       转换菜单（手工三通 同径/异径）；未命中构件不拦截。 */
    ctn.addEventListener('contextmenu', function (e) {
      /* 2026-09-16：先精确命中；未中则在 FIT_HIT_PAD 内找最近构件（见 nearestFitEl 注释），
         避免「右键三通没反应／误弹改径菜单」导致旋转入口不可发现。 */
      var t = document.elementFromPoint(e.clientX, e.clientY);
      var g = t && t.closest ? t.closest('g[data-fit]') : null;
      var tf = t && t.closest ? t.closest('g[data-tlfit]') : null;
      if (!g && !tf) {
        /* 都未精确命中：FIT_HIT_PAD 内找最近的（模型构件 / 图面配件分开扫，取更近者；
           等距取模型构件 —— 其绘制在上层，与 elementFromPoint 的精确命中优先级一致） */
        g = nearestFitEl(currentEL(ctn), e.clientX, e.clientY, FIT_HIT_PAD);
        tf = nearestTlFitEl(currentEL(ctn), e.clientX, e.clientY, FIT_HIT_PAD);
        if (g && tf) {
          var dgf = rectDist(g, e.clientX, e.clientY), dtf = rectDist(tf, e.clientX, e.clientY);
          if (dtf < dgf) g = null; else tf = null;
        }
      }
      if (g) {
        e.preventDefault();
        if (typeof api.onFittingContextMenu === 'function') api.onFittingContextMenu(fittingInfo(g.getAttribute('data-fit')), e.clientX, e.clientY);
        return;
      }
      if (tf) {
        /* 图面配件（A-F## 共享编辑层）右键（2026-09-16）：选中并交页面弹旋转菜单 ——
           旧链路只认 g[data-fit] 与 [data-tlpipe]，A-F## 右键毫无反应（用户实测）。 */
        e.preventDefault();
        selFitId = tf.getAttribute('data-tlfit');
        selAutoId = null; selPipeId = null;
        rerenderKeepView();
        if (typeof api.onAutoSel === 'function') api.onAutoSel(autoSelInfo());
        if (typeof api.onTlFitContextMenu === 'function') api.onTlFitContextMenu(selFitId, e.clientX, e.clientY);
        return;
      }
      /* 右键自动管线（2026-09-16 阶段2e）：选中该管并交页面弹管径菜单；未命中不拦截 */
      var ap = t && t.closest ? t.closest('[data-tlpipe]') : null;
      if (!ap) return;
      e.preventDefault();
      var pid = ap.getAttribute('data-tlpipe');
      var u3 = svgUserPoint(currentEL(ctn), e.clientX, e.clientY);
      var loc3 = null;
      if (u3 && viewState && lastDataRef) {
        var z3 = pid === 'front' ? HEIGHTS.front : (pid.indexOf('main-') === 0 ? HEIGHTS.main : HEIGHTS.branch);
        var d3 = unprojectIso(u3.x - viewState.ox, u3.y - viewState.oy, z3, viewState.k);
        loc3 = AE.locate(pid, lastDataRef, d3);
      }
      selAutoId = pid; selAutoAt = loc3 ? loc3.along : 0;
      selFitId = null; selPipeId = null;
      rerenderKeepView();
      if (typeof api.onAutoSel === 'function') api.onAutoSel(autoSelInfo());
      if (typeof api.onAutoPipeContextMenu === 'function') api.onAutoPipeContextMenu(pid, e.clientX, e.clientY);
    });
  }

  /* ---------- 命中容差：邻近构件（2026-09-16） ----------
     三通/阀门/立管符号在图面上多为细描边（bbox 中心是空的），用户「点在配件上」
     往往落在符号边缘或紧邻的空白处 → elementFromPoint 精确命中失败。旧行为下：
     右键毫无反应，或右偏一点落到自动管线分支弹出改径菜单，用户即「找不到旋转入口」
     （2026-09-16 实测：某个三通中心 ±12px 的 81 个采样点里只有 6 个能弹出旋转菜单）。
     故精确命中失败时，在 pad（屏幕像素）内找最近的 g[data-fit]，仍按命中该构件处理。 */
  var FIT_HIT_PAD = 12;
  function rectDist(el, clientX, clientY) {
    var r = el.getBoundingClientRect();
    if (!r || (r.width === 0 && r.height === 0)) return Infinity;   /* 不可见/零尺寸构件：跳过 */
    var dx = clientX < r.left ? r.left - clientX : (clientX > r.right ? clientX - r.right : 0);
    var dy = clientY < r.top ? r.top - clientY : (clientY > r.bottom ? clientY - r.bottom : 0);
    return Math.sqrt(dx * dx + dy * dy);
  }
  function nearestElBy(svg, sel, clientX, clientY, pad) {
    if (!svg || !svg.querySelectorAll) return null;
    var list = svg.querySelectorAll(sel);
    var best = null, bestD = pad;
    for (var i = 0; i < list.length; i++) {
      var d = rectDist(list[i], clientX, clientY);
      /* <=：等距时取遍历靠后者＝DOM 靠后者＝绘制在上层者（重叠三通优先命中最上层） */
      if (d <= bestD) { bestD = d; best = list[i]; }
    }
    return best;
  }
  function nearestFitEl(svg, clientX, clientY, pad) { return nearestElBy(svg, 'g[data-fit]', clientX, clientY, pad); }
  function nearestTlFitEl(svg, clientX, clientY, pad) { return nearestElBy(svg, 'g[data-tlfit]', clientX, clientY, pad); }
  /* ---------- 点击处理：放置 / 构件参数 ---------- */
  function svgUserPoint(el, clientX, clientY) {
    try {
      var pt = el.createSVGPoint(); pt.x = clientX; pt.y = clientY;
      var m = el.getScreenCTM(); if (!m) return null;
      var p = pt.matrixTransform(m.inverse());
      return { x: p.x, y: p.y };
    } catch (e) { return null; }
  }
  function handleClick(ctn, e) {
    var el = currentEL(ctn); if (!el) return;
    if (pipeMode) { handlePipeClick(ctn, el, e); return; }
    if (placing) { placeFromEvent(ctn, el, e); return; }
    /* 注意：平移拖拽用 setPointerCapture 捕获到 svg，click 事件的 target 会被重定向
       到 svg 根——必须用 elementFromPoint 取指针位置下的真实元素再找构件分组。 */
    var t = document.elementFromPoint(e.clientX, e.clientY);
    /* 手工管线拾取（共享图面数据层，2026-09-15 阶段1）：点击选中/取消并通知页面 */
    var mg = t && t.closest ? t.closest('g[data-manpipe]') : null;
    if (mg) {
      var id = mg.getAttribute('data-manpipe');
      selPipeId = (selPipeId === id) ? null : id;
      rerenderKeepView();
      if (typeof api.onPipeClick === 'function') api.onPipeClick(selPipeId, selPipeInfo());
      return;
    }
    /* 自动管线图面配件拾取（阶段2）：点击选中/取消 */
    var fg = t && t.closest ? t.closest('[data-tlfit]') : null;
    if (fg) {
      var fid = fg.getAttribute('data-tlfit');
      selFitId = (selFitId === fid) ? null : fid;
      selAutoId = null; selPipeId = null;
      rerenderKeepView();
      if (typeof api.onAutoSel === 'function') api.onAutoSel(autoSelInfo());
      return;
    }
    /* 自动管线拾取（阶段2）：命中 path → 逆投影到所在层高平面 → 沿管弧长 */
    var ag = t && t.closest ? t.closest('[data-tlpipe]') : null;
    if (ag) {
      var pid = ag.getAttribute('data-tlpipe');
      var u2 = svgUserPoint(el, e.clientX, e.clientY);
      var loc = null;
      if (u2 && viewState && lastDataRef) {
        var z2 = pid === 'front' ? HEIGHTS.front : (pid.indexOf('main-') === 0 ? HEIGHTS.main : HEIGHTS.branch);
        var d2 = unprojectIso(u2.x - viewState.ox, u2.y - viewState.oy, z2, viewState.k);
        loc = AE.locate(pid, lastDataRef, d2);
      }
      if (loc) {
        selAutoId = (selAutoId === pid) ? null : pid;   // 再点同管 = 取消选中
        selAutoAt = loc.along;
        selFitId = null; selPipeId = null;
        rerenderKeepView();
        if (typeof api.onAutoSel === 'function') api.onAutoSel(autoSelInfo());
        return;
      }
    }
    var g = t && t.closest ? t.closest('g[data-fit]') : null;
    /* 2026-09-16：左键同样给容差，否则点在三通符号的镂空中心/边缘会毫无反馈 */
    if (!g) g = nearestFitEl(el, e.clientX, e.clientY, FIT_HIT_PAD);
    if (g && typeof api.onFittingClick === 'function') api.onFittingClick(fittingInfo(g.getAttribute('data-fit')));
  }
  /* 选中手工管线信息（页面/测试用），未选中返回 null */
  function selPipeInfo() {
    if (!selPipeId) return null;
    var list = EP.list() || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === selPipeId) {
        var m = list[i];
        return { id: m.id, kind: m.kind, kindLabel: m.kind === 'main' ? '主管' : '支管', len: m.len, pts: m.pts.length };
      }
    }
    return null;
  }

  /* ---------- 插入主管/支管画线模式（共享图面数据层，2026-09-15 阶段1）---------- */
  function startPipeMode(kind) {
    if (kind !== 'main' && kind !== 'branch') return null;
    if (pipeMode === kind) { endPipeMode(); return null; }   // 再点同款 = 退出
    pipeMode = kind; pipeDraft = null; selPipeId = null; selAutoId = null; selFitId = null;
    var ctn = currentCTN();
    if (ctn) { ctn.classList.add('iso-pipe-drafting'); try { ctn.focus({ preventScroll: true }); } catch (e) { try { ctn.focus(); } catch (e2) {} } }
    if (typeof api.onPipeModeChange === 'function') api.onPipeModeChange(kind, null);
    return kind;
  }
  function endPipeMode(silent) {
    pipeMode = null; pipeDraft = null;
    var ctn = currentCTN();
    if (ctn) ctn.classList.remove('iso-pipe-drafting');
    if (!silent && typeof api.onPipeModeChange === 'function') api.onPipeModeChange(null, null);
  }
  function pipeModeKind() { return pipeMode; }
  /* 图面三通的锚点（数据坐标，米）：自动三通（TEE-F/B，模型派生）+ 手工三通（M-T##）。
     两视图画线时都吸附到这些点 —— 用户手绘管端点能精确落在三通上，
     三通旋转时该管才会被 teeSubtree 的 nearPt 认作「连接管」跟随旋转
     （2026-09-17 指令 C：三通转动后连接管随之转动）。 */
  function teeSnapPts() {
    var out = [];
    var model = viewState && viewState.model;
    if (model && model.tees) {
      model.tees.forEach(function (t) { if (t && t.point && isFinite(t.point.x)) out.push({ x: t.point.x, y: t.point.y, z: isFinite(t.z) ? t.z : 0 }); });
    }
    manual.forEach(function (m) { if (m.kind === 'tee' && m.point) out.push({ x: m.point.x, y: m.point.y, z: isFinite(m.z) ? m.z : 0 }); });
    return out;
  }
  /* 吸附点收集（数据坐标，米）：平面几何端点 + 阀门/水源 + 地块顶点 + 手工管线端点 + 三通锚点 */
  function pipeSnapPts() {
    var data = lastDataRef, pts = [];
    if (!data) return pts;
    function add(p) { if (p && isFinite(p.x) && isFinite(p.y)) pts.push({ x: p.x, y: p.y }); }
    function ends(line) { if (line && line.length >= 2) { add(line[0]); add(line[line.length - 1]); } }
    ends(data.frontPipe);
    (data.mainPipes || []).forEach(ends);
    (data.branchPipes || []).forEach(ends);
    (data.valves || []).forEach(function (v) { add(v); });
    add(data.sourcePos);
    (data.poly || []).forEach(add);
    (EP.list() || []).forEach(function (m) { ends(m.pts); });
    /* 自动管线改长后的有效端点 + 图面配件（三通/阀门 A-F##）也吸附（阶段2c，与工作区口径一致） */
    Object.keys(AE.lensMap() || {}).forEach(function (pid) { var e = AE.effPts(pid, data); if (e) ends(e); });
    (AE.fitsList() || []).forEach(function (f) { var p = AE.pointAt(f.pid, data, f.atM); if (p) add(p); });
    /* 三通锚点（2026-09-17）：画线可吸附到自动/手工三通，使连接管跟随旋转成立 */
    teeSnapPts().forEach(add);
    var out = [];
    pts.forEach(function (p) {
      var dup = out.some(function (q) { return Math.hypot(q.x - p.x, q.y - p.y) < 0.05; });
      if (!dup) out.push(p);
    });
    return out;
  }
  /* 屏幕点击 → 数据坐标（kind 对应层高平面上的逆投影）+ 端点吸附 */
  function pipeDataPoint(el, e, kind) {
    var u = svgUserPoint(el, e.clientX, e.clientY);
    if (!u || !viewState) return null;
    var z = kind === 'main' ? HEIGHTS.main : HEIGHTS.branch;
    var d = unprojectIso(u.x - viewState.ox, u.y - viewState.oy, z, viewState.k);
    var tolU = 12;   // 12 屏幕像素 → SVG 用户单位（getScreenCTM.a = 每用户单位屏幕像素）
    try { var m = el.getScreenCTM(); if (m && m.a) tolU = 12 / m.a; } catch (err) {}
    var best = null, bd = tolU;
    pipeSnapPts().forEach(function (sp) {
      var q = projectIso(sp.x, sp.y, z, viewState.k);
      q = { x: viewState.ox + q.x, y: viewState.oy + q.y };
      var dd = Math.hypot(q.x - u.x, q.y - u.y);
      if (dd < bd) { bd = dd; best = sp; }
    });
    return best || { x: d.x, y: d.y };
  }
  function handlePipeClick(ctn, el, e) {
    if (!viewState || !lastDataRef) return;
    var p = pipeDataPoint(el, e, pipeMode);
    if (!p) return;
    if (!pipeDraft) pipeDraft = { kind: pipeMode, pts: [] };
    /* 连续点击同一点（双击的第二击）不重复入列 */
    var last = pipeDraft.pts[pipeDraft.pts.length - 1];
    if (last && Math.hypot(last.x - p.x, last.y - p.y) < 0.05) return;
    pipeDraft.pts.push(p);
    rerenderKeepView();
  }
  function commitPipeDraft() {
    if (!pipeDraft) return false;
    if (pipeDraft.pts.length < 2) { pipeDraft = null; rerenderKeepView(); return false; }
    var n = pipeDraft.pts.length;
    /* 双击的第二次 click 已入列一个重复点，剔除后再提交 */
    if (n >= 2 && Math.hypot(pipeDraft.pts[n - 1].x - pipeDraft.pts[n - 2].x, pipeDraft.pts[n - 1].y - pipeDraft.pts[n - 2].y) < 0.05) pipeDraft.pts.pop();
    var m = EP.add(pipeDraft.kind, pipeDraft.pts, 'iso');   // 共享层广播 → 两视图订阅重渲染
    pipeDraft = null;
    rerenderKeepView();
    return !!m;
  }
  function placeFromEvent(ctn, el, e) {
    if (!placing) return;
    /* 复用 scanAndAdd（与右键管道直接加同一套命中/端点校验，2026-09-16） */
    var m = scanAndAdd(placing.kind, e.clientX, e.clientY);
    if (!m) { notifyPlace({ ok: false, reason: '未命中管线：请沿总管/主管/支管的管段点击' }); return; }
    endPlace();
    notifyPlace({ ok: true, id: m.id, kind: placing.kind, spec: m.spec });
  }
  function endPlace() {
    placing = null;
    var ctn = currentCTN();
    if (ctn) ctn.classList.remove('iso-placing');
  }
  function notifyPlace(res) { if (typeof api.onPlaceResult === 'function') api.onPlaceResult(res); }
  function rerenderKeepView() {
    var ctn = currentCTN(); if (!ctn || !lastDataRef) return;
    var keep = { z: view.z, x: view.x, y: view.y };
    /* 保留显示宽度（2026-09-24 任务⑥）：render→baseFit 会按「当前」容器宽重设 svg，
       若初始 render 时容器布局未稳（宽度过时），放置/加管一触发 rerender 图面就跳变
       （实测 1273→1551px，同屏点映射漂移 1.218 倍）。恢复旧宽 → 所见即所得不跳变，
       rerender 前后同一屏幕点指向同一模型位置（节点复用/连续放置的前提）。 */
    var el0 = currentEL(ctn), w0 = el0 ? el0.style.width : '';
    render(ctn, lastDataRef);
    view = keep;
    var el = currentEL(ctn);
    if (el) {
      if (w0 && el.style.width !== w0) el.style.width = w0;
      applyView(ctn, el);
    }
  }

  /* ---------- 手工配件管理 API（页面工具栏 / 测试使用） ---------- */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function startPlace(kind, spec) {
    if (!KIND_LABEL[kind]) return false;
    placing = { kind: kind, spec: spec || '' };
    var ctn = currentCTN();
    if (ctn) ctn.classList.add('iso-placing');
    return true;
  }
  function cancelPlace() { endPlace(); notifyPlace({ ok: false, reason: '已取消放置' }); }
  function placingKind() { return placing ? placing.kind : null; }
  function addManual(kind, spec, segType, segIndex, point, opts) {
    if (!MANUAL_PREFIX[kind] || !point || !SEG_Z[segType]) return null;
    cancelEdit(); checkpoint();
    manualSeq[kind]++;
    var o = opts || {};
    var m = {
      id: MANUAL_PREFIX[kind] + pad2(manualSeq[kind]), kind: kind, spec: spec || '',
      segType: segType, segIndex: segIndex || 0,
      point: { x: point.x, y: point.y }, z: SEG_Z[segType]
    };
    /* 挂在接管（M-G##）上的配件（2026-09-17 链式跟随）：hostPipe 记宿管 id；
       z 取命中点插值高程 —— 接管可绕管轴转到任意高度，不能再套用 SEG_Z 固定层高。 */
    if (o.hostPipe) m.hostPipe = o.hostPipe;
    if (isFinite(o.z)) m.z = o.z;
    manual.push(m);
    notifyEdit();
    return m;
  }
  /* 按 id 取手工层条目（三通/接管共用；避免各处重复 manual.filter） */
  function manualById(id) {
    for (var i = 0; i < manual.length; i++) if (manual[i].id === id) return manual[i];
    return null;
  }
  /* 接管（M-G##）上某点的 **3D** 切线：接管可绕宿管轴转到任意高度 → 切线必须带 z，
     否则挂在接管上的三通仍按「水平面内垂直」求第三口，转到竖直时会算错。 */
  function hostPipeTangent(m) {
    var p = manualById(m.hostPipe);
    if (!p || !p.pts || p.pts.length < 2) return null;
    var cz = isFinite(m.z) ? m.z : 0, best = null, bd = Infinity;
    for (var i = 0; i + 1 < p.pts.length; i++) {
      var a = p.pts[i], b = p.pts[i + 1];
      var dx = b.x - a.x, dy = b.y - a.y, dz = (b.z || 0) - (a.z || 0), L = Math.hypot(dx, dy, dz);
      if (!(L > 0)) continue;
      var t = ((m.point.x - a.x) * dx + (m.point.y - a.y) * dy + (cz - (a.z || 0)) * dz) / (L * L);
      if (t < 0) t = 0; else if (t > 1) t = 1;
      var d = Math.hypot(a.x + dx * t - m.point.x, a.y + dy * t - m.point.y, (a.z || 0) + dz * t - cz);
      if (d < bd) { bd = d; best = { x: dx / L, y: dy / L, z: dz / L }; }
    }
    return best;
  }
  /* ───────── 三通第三口 绕「宿管中心轴」旋转（2026-09-16 用户口径修正）─────────
   * 用户口径：**旋转轴 = 该三通所在管道的中心轴**，不是世界 X/Y/Z ——
   *   管道沿 Y 轴走向 → 旋转轴就是 Y 轴；沿 X 轴走向 → 旋转轴就是 X 轴；斜向同理。
   * 三通的**两端接管道**（贯通方向 = 管轴 teeThroughDir），**第三个口** branchDir
   * 绕管轴扫出 → 可指向侧面 / 正上方 / 正下方（立管）。
   * 用 Rodrigues 公式绕管轴旋转的好处：天然保持「第三口 ⊥ 管轴」，管口不会被拧歪；
   * 未旋转时缺省 = 水平面内垂直宿管（与 2026-09-14 原画法一致）。
   * 红线：仅编辑表达层，不写回 tlDiagramData、不参与水力计算/材料清单。 */
  function hostTangentAt(m) {
    if (m.hostPipe) { var hp = hostPipeTangent(m); if (hp) return hp; }
    var line = m.segType === 'front' ? lastDataRef.frontPipe : (m.segType === 'main' ? lastDataRef.mainPipes : lastDataRef.branchPipes)[m.segIndex];
    if (!line || line.length < 2) return { x: 1, y: 0 };
    for (var i = 0; i + 1 < line.length; i++) {
      var a = line[i], b = line[i + 1], len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len <= 0) continue;
      var t = ((m.point.x - a.x) * (b.x - a.x) + (m.point.y - a.y) * (b.y - a.y)) / (len * len);
      if (t >= -0.05 && t <= 1.05) return { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    }
    return { x: 1, y: 0 };
  }
  /* 归一化「三通」记录：手工三通（M-T01，自带 segType/segIndex）与**自动三通**
     （TEE-F01 在总管上 / TEE-B01 在 main-N 主管上，自带 type/upstream）统一成
     {segType,segIndex,point} —— 使宿管中心轴 / 缺省第三口方向对两者复用同一套几何。 */
  function asTeeRec(x) {
    if (!x) return null;
    if (x.segType && x.point) return x;
    if (x.type === 'front-main') return { segType: 'front', segIndex: 0, point: x.point };
    if (x.type === 'main-branch') {
      var mm = /^main-(\d+)$/.exec(String(x.upstream || ''));
      return { segType: 'main', segIndex: mm ? parseInt(mm[1], 10) : 0, point: x.point };
    }
    return null;
  }
  function autoTeeById(id) {
    if (!viewState || !viewState.model) return null;
    var list = viewState.model.tees || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  /* 宿管中心轴（3D 单位向量；本项目管道均为水平敷设 → z 分量 0） */
  function teeThroughDir(m) {
    var rec = asTeeRec(m) || m;
    var t = hostTangentAt(rec), tz = isFinite(t.z) ? t.z : 0;
    var L = Math.hypot(t.x, t.y, tz) || 1;
    return { x: t.x / L, y: t.y / L, z: tz / L };
  }
  /* 宿管走向文字（供菜单说明「旋转轴是哪个轴」） */
  function teeAxisLabel(m) {
    var t = teeThroughDir(m), ax = Math.abs(t.x), ay = Math.abs(t.y);
    if (ax >= 0.94) return '沿 X 轴走向';
    if (ay >= 0.94) return '沿 Y 轴走向';
    return '斜向 ' + (Math.atan2(t.y, t.x) * 180 / Math.PI).toFixed(0) + '°';
  }
  function defaultBranchDir(m) {
    var rec = asTeeRec(m) || m;
    var k = teeThroughDir(rec), d = { x: -k.y, y: k.x, z: 0 }, L = Math.hypot(d.x, d.y) || 1;
    /* 缺省第三口 = 竖直轴 ẑ × 管轴 k（天然 ⊥ 管轴）；管轴水平（k.z=0）时退化为旧的
       (-ty, tx, 0)，与 2026-09-14 原画法逐字节一致。管轴竖直时叉积为零 → 兜底 X 向。 */
    if (!(L > 1e-9)) return { x: 1, y: 0, z: 0 };
    return { x: d.x / L, y: d.y / L, z: 0 };
  }
  /* 第三口当前方向：手工三通读自身 branchDir，自动三通读覆盖表 autoSpin[id]，
     两者皆无 = 缺省（水平面内垂直宿管） */
  function teeBranchDir(m) {
    var b = m.branchDir || (m.id && autoSpin[m.id] ? autoSpin[m.id].branchDir : null);
    if (b && isFinite(b.x) && isFinite(b.y) && isFinite(b.z)) {
      var L = Math.hypot(b.x, b.y, b.z) || 1;
      return { x: b.x / L, y: b.y / L, z: b.z / L };
    }
    return defaultBranchDir(m);
  }
  /* Rodrigues 旋转：向量 v 绕单位轴 k 旋转 rad（右手定则），返回单位向量 */
  function rotateAboutAxis(v, k, rad) {
    var c = Math.cos(rad), s = Math.sin(rad);
    var dot = v.x * k.x + v.y * k.y + v.z * k.z;
    var cx = k.y * v.z - k.z * v.y, cy = k.z * v.x - k.x * v.z, cz = k.x * v.y - k.y * v.x;
    var x = v.x * c + cx * s + k.x * dot * (1 - c);
    var y = v.y * c + cy * s + k.y * dot * (1 - c);
    var z = v.z * c + cz * s + k.z * dot * (1 - c);
    var L = Math.hypot(x, y, z) || 1;
    return { x: x / L, y: y / L, z: z / L };
  }
  /* 从三通分支口接出的生长管（pipe.teeId 指回该三通）跟随旋转（2026-09-16 用户需求：
     「三通接一段主管，方向不对，想转动这根主管」）—— 整根折线绕三通点 C、绕宿管中心轴 k
     刚体旋转（管长/管形不变），起点严格回贴三通点，保证管子始终从第三口长出来。
     ★ 这里必须用**不归一化**的 Rodrigues（rotateAboutAxis 会把向量归一化成单位长，
     位移向量会被压成 1m —— e2e 实测 len 2.000→1.000 抓到）。 */
  function rotateVecAbout(v, k, rad) {
    var c = Math.cos(rad), s = Math.sin(rad);
    var dot = v.x * k.x + v.y * k.y + v.z * k.z;
    var cx = k.y * v.z - k.z * v.y, cy = k.z * v.x - k.x * v.z, cz = k.x * v.y - k.y * v.x;
    return {
      x: v.x * c + cx * s + k.x * dot * (1 - c),
      y: v.y * c + cy * s + k.y * dot * (1 - c),
      z: v.z * c + cz * s + k.z * dot * (1 - c)
    };
  }
  /* 链式下游整串（2026-09-17 第三十八轮）：根三通 → 接出的接管 → 接管上的子三通
     → 子三通再接出的管 … 递归收集整棵子树，统一绕 (根三通点 C, 根管轴 k) 做 3D 刚体旋转；
     管点用不归一化的 rotateVecAbout（管长/管形不变），三通第三口方向用 rotateAboutAxis。
     ★ 种子扩展（2026-09-17 完善细节）：除显式 teeId 链外，凡端点恰好落在三通点 C 上的手工管
     （如自动三通 TEE-F/B 用左栏「插入管线」手绘接出的管，没有 teeId）也算接管，一并跟随旋转。 */
  /* 全部候选「接管」：① 内部手工层 manual 中的 kind='pipe'（M-G##，菜单从分支口接出）；
     ② 共享图面数据层 EP.list() 中的手工管线（M-P##，三级工作区/轴测图左栏手绘接出）。
     两者都要参与三通旋转跟随 —— 旧逻辑只扫 manual，漏掉用户在三级工作区手绘、
     端点落在三通上的 M-P## 管，导致「三通转了、管子没转」（2026-09-17 指令 C 缺口）。 */
  function allPipes() {
    var list = [];
    manual.forEach(function (p) { if (p.kind === 'pipe' && p.pts && p.pts.length >= 2) list.push(p); });
    var ep = (typeof EP !== 'undefined' && EP.list) ? EP.list() : [];
    ep.forEach(function (p) { if (p && p.pts && p.pts.length >= 2) list.push(p); });
    return list;
  }
  function teeSubtree(id, anchorPt) {
    var pipes = [], tees = [], guard = 0;
    function nearPt(q) {
      if (!anchorPt || !q) return false;
      return Math.abs(q.x - anchorPt.x) < TEE_LINK_TOL && Math.abs(q.y - anchorPt.y) < TEE_LINK_TOL
        && Math.abs((q.z || 0) - (anchorPt.z || 0)) < TEE_LINK_TOL;
    }
    function seedPipes() {
      return allPipes().filter(function (p) {
        var linked = (p.teeId === id) || nearPt(p.pts[0]) || nearPt(p.pts[p.pts.length - 1]);
        return linked;
      });
    }
    (function walk(list) {
      if ((guard += 1) > 4000) return;
      list.forEach(function (p) {
        if (pipes.indexOf(p) >= 0) return;
        pipes.push(p);
        manual.forEach(function (t) {
          if (t.kind !== 'tee' || t.hostPipe !== p.id) return;
          if (tees.indexOf(t) < 0) tees.push(t);
          var child = allPipes().filter(function (cp) { return cp.teeId === t.id && cp.pts && cp.pts.length >= 2; });
          walk(child);
        });
      });
    })(seedPipes());
    return { pipes: pipes, tees: tees };
  }
  function teeCenter3(t) { return { x: t.point.x, y: t.point.y, z: isFinite(t.z) ? t.z : 0 }; }
  function rotateTeePipes(id, C, k, rad, anchorPt) {
    var sub = teeSubtree(id, anchorPt);
    if (!sub.pipes.length && !sub.tees.length) return 0;
    sub.tees.forEach(function (t) {
      var r = rotateVecAbout({ x: t.point.x - C.x, y: t.point.y - C.y, z: (isFinite(t.z) ? t.z : 0) - C.z }, k, rad);
      t.point = { x: C.x + r.x, y: C.y + r.y };
      t.z = C.z + r.z;
      if (t.branchDir && isFinite(t.branchDir.x) && isFinite(t.branchDir.y) && isFinite(t.branchDir.z)) {
        t.branchDir = rotateAboutAxis(t.branchDir, k, rad);
      }
    });
    sub.pipes.forEach(function (p) {
      var rpts = p.pts.map(function (pt) {
        var r = rotateVecAbout({ x: pt.x - C.x, y: pt.y - C.y, z: (pt.z || 0) - C.z }, k, rad);
        return { x: C.x + r.x, y: C.y + r.y, z: C.z + r.z };
      });
      /* 内部 manual 管直接改 pts；共享层 EP 管（M-P##）走 EP.update 写回并通知
         另一视图（三级工作区）实时重渲染，保持双向同步（2026-09-17 指令 C）。 */
      if (manual.indexOf(p) < 0) {
        if (typeof EP !== 'undefined' && EP.update) EP.update(p.id, function (q) { q.pts = rpts; }, 'iso');
        else p.pts = rpts;
      } else {
        p.pts = rpts;
      }
    });
    /* 起点回贴宿主三通旋转后的中心：执行两轮（子三通先落位 → 其下游管再贴一次），
       消除逐级累积的浮点漂移，保证管子接口始终咬合。仅对带 teeId 的内部接管生效
       （共享层 M-P## 手绘管无 teeId，不强制回贴，避免误移动非链式管）。 */
    function snapAll() {
      sub.pipes.forEach(function (p) {
        if (manual.indexOf(p) < 0) return;
        var h = manualById(p.teeId);
        if (h) p.pts[0] = teeCenter3(h);
      });
    }
    snapAll(); snapAll();
    return sub.pipes.length + sub.tees.length;
  }
  /* 第三口绕**宿管中心轴**旋转 deg 度（正号 = 右手定则绕轴正向）。累加记录 branchSpin。
     手工三通写自身；**自动三通**写覆盖表 autoSpin（不改模型，维持只读红线）。
     其接出的生长管（teeId 链）同步刚体旋转。checkpoint 必须在改动**前**（undo 语义）。 */
  function rotateTee(id, deg) {
    var d = Number(deg);
    if (!isFinite(d) || d === 0) return false;
    var m = manual.filter(function (x) { return x.id === id; })[0];
    if (m && m.kind === 'tee') {
      var k = teeThroughDir(m), rad = d * Math.PI / 180;
      var C3 = { x: m.point.x, y: m.point.y, z: m.z };
      checkpoint();
      m.branchDir = rotateAboutAxis(teeBranchDir(m), k, rad);
      m.branchSpin = Math.round(((Number(m.branchSpin) || 0) + d) * 1000) / 1000;
      rotateTeePipes(id, C3, k, rad, C3);
      rerenderKeepView(); notifyEdit();
      return true;
    }
    var t = autoTeeById(id), rec = asTeeRec(t);
    if (!rec) return false;
    var k2 = teeThroughDir(rec);
    var C2 = { x: t.point.x, y: t.point.y, z: (isFinite(t.z) ? t.z : 0) };
    var cur = (autoSpin[id] && autoSpin[id].branchDir) || defaultBranchDir(rec);
    var spin = ((autoSpin[id] && Number(autoSpin[id].branchSpin)) || 0) + d;
    checkpoint();
    autoSpin[id] = {
      branchDir: rotateAboutAxis(cur, k2, d * Math.PI / 180),
      branchSpin: Math.round(spin * 1000) / 1000
    };
    /* 同步刚体旋转其连接的手绘管（M-P## 共享层 / 端点贴三通的内部管），
       与手工三通同一套语义：绕三通点 C2、绕宿管中心轴 k2。 */
    rotateTeePipes(id, C2, k2, d * Math.PI / 180, C2);
    rerenderKeepView(); notifyEdit();
    return true;
  }
  /* 第三口复位：回到水平面内垂直宿管（branchSpin 归零）；生长管按累计角反转回原位 */
  function resetTeeBranch(id) {
    var m = manual.filter(function (x) { return x.id === id; })[0];
    if (m && m.kind === 'tee') {
      var spin = Number(m.branchSpin) || 0;
      checkpoint();
      if (spin) rotateTeePipes(id, { x: m.point.x, y: m.point.y, z: m.z }, teeThroughDir(m), -spin * Math.PI / 180, { x: m.point.x, y: m.point.y, z: m.z });
      delete m.branchDir;
      m.branchSpin = 0;
      rerenderKeepView(); notifyEdit();
      return true;
    }
    if (autoSpin[id]) {
      var ta = autoTeeById(id), reca = ta ? asTeeRec(ta) : null;
      var spinA = (autoSpin[id] && Number(autoSpin[id].branchSpin)) || 0;
      checkpoint();
      if (reca && spinA) {
        var C2r = { x: ta.point.x, y: ta.point.y, z: (isFinite(ta.z) ? ta.z : 0) };
        rotateTeePipes(id, C2r, teeThroughDir(reca), -spinA * Math.PI / 180, C2r);
      }
      delete autoSpin[id];
      rerenderKeepView(); notifyEdit(); return true;
    }
    return !!autoTeeById(id);
  }
  /* 第三口相对缺省方向的累计转角（度；未旋转 = 0） */
  function teeBranchSpin(id) {
    var m = manual.filter(function (x) { return x.id === id; })[0];
    if (m) return Number(m.branchSpin) || 0;
    return (autoSpin[id] && Number(autoSpin[id].branchSpin)) || 0;
  }
  /* ---------- 节点吸附（2026-09-24 任务⑥）----------
     「节点」= 手工层已存在的可捕捉点：三通/弯头/阀门中心 + 接管（M-G##）两端。
     右键三通「从分支口接管道」的末端、接管「延长」的续端都会自动吸附到最近节点
     （容差 NODE_SNAP_TOL 米），从节点上再画管/接管时端点天然精确对齐。 */
  var NODE_SNAP_TOL = 0.6;   /* 米 */
  function nearNode(p, excludeId) {
    if (!p || !isFinite(p.x) || !isFinite(p.y)) return null;
    var best = null;
    manual.forEach(function (m) {
      if (m.id === excludeId) return;
      var pts = [];
      /* z 修正（2026-09-24 任务⑥）：m.point 无 z（存于 m.z），补齐后接管端（z=SEG_Z）
         才能与配件节点正确比对，否则虚高 1.0m 误判不占用 */
      if (m.kind === 'tee' || m.kind === 'elbow' || m.kind === 'valve') pts.push({ x: m.point.x, y: m.point.y, z: m.z });
      else if (m.kind === 'pipe' && m.pts && m.pts.length >= 2) pts = [m.pts[0], m.pts[m.pts.length - 1]];
      for (var i = 0; i < pts.length; i++) {
        var q = pts[i]; if (!q) continue;
        var d = Math.hypot(q.x - p.x, q.y - p.y, (q.z || 0) - (p.z || 0));
        if (d <= NODE_SNAP_TOL && (!best || d < best.d)) {
          best = { d: d, id: m.id, kind: m.kind, point: q, end: m.kind === 'pipe' ? (i === 0 ? 0 : m.pts.length - 1) : -1 };
        }
      }
    });
    return best;
  }
  function spawnPipeFromTee(id) {
    var m = manual.filter(function (x) { return x.id === id; })[0];
    if (!m || m.kind !== 'tee') return false;
    var bd = teeBranchDir(m), mp = params(id);
    var len = (mp.teeType && Number.isFinite(mp.branchLen) && mp.branchLen > 0) ? mp.branchLen : 1;
    var tip = { x: m.point.x + bd.x * len, y: m.point.y + bd.y * len, z: m.z + bd.z * len };
    /* 末端节点吸附（2026-09-24 任务⑥）：生长管末端落在已有节点（其它三通/阀门/接管端）容差内
       → 精确接到该节点上，而不是差几厘米悬空。排除宿三通自身；吸附点与宿点重合则不吸。 */
    var nnT = nearNode(tip, id);
    if (nnT && Math.hypot(nnT.point.x - m.point.x, nnT.point.y - m.point.y, (nnT.point.z || 0) - m.z) > 0.15) {
      tip = { x: nnT.point.x, y: nnT.point.y, z: isFinite(nnT.point.z) ? nnT.point.z : m.z };
    }
    var n = 0;
    manual.forEach(function (x) { if (x.kind === 'pipe') { var mm = /^M-G(\d+)$/.exec(x.id); if (mm) n = Math.max(n, parseInt(mm[1], 10)); } });
    var pid = 'M-G' + pad2(n + 1);
    checkpoint();
    manual.push({ id: pid, kind: 'pipe', spec: mp.teeType ? (mp.branchSpec || '') : (m.spec || ''), segType: m.segType, segIndex: m.segIndex,
      teeId: id,   /* 指回宿三通：第三口旋转/复位时本管跟随刚体旋转（rotateTeePipes） */
      pts: [{ x: m.point.x, y: m.point.y, z: m.z }, tip] });
    rerenderKeepView(); notifyEdit();
    return pid;
  }
  function extendManualPipe(id, len) {
    var m = manual.filter(function (x) { return x.id === id; })[0];
    if (!m || m.kind !== 'pipe' || !m.pts || m.pts.length < 2) return false;
    len = Number.isFinite(len) && len > 0 ? len : 1;
    var a = m.pts[m.pts.length - 2], b = m.pts[m.pts.length - 1];
    var dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L = Math.hypot(dx, dy, dz) || 1;
    var np = { x: b.x + dx / L * len, y: b.y + dy / L * len, z: b.z + dz / L * len };
    /* 续接端节点吸附（2026-09-24 任务⑥）：延长后的新端点落在已有节点容差内 → 精确接上 */
    var nnE = nearNode(np, id);
    if (nnE && Math.hypot(nnE.point.x - b.x, nnE.point.y - b.y, (nnE.point.z || 0) - b.z) > 0.15) {
      np = { x: nnE.point.x, y: nnE.point.y, z: isFinite(nnE.point.z) ? nnE.point.z : np.z };
    }
    m.pts.push(np);
    checkpoint(); rerenderKeepView(); notifyEdit();
    return true;
  }
  /* —— 自动三通（AE 图面配件 A-F##）第三口接管道（2026-09-24 任务⑨）—— */
  /* AE 三通第三口 3D 方向：缺省 = 水平面内垂直宿管；spin≠0 = 绕宿管轴旋转（与渲染符号 L622-624 同式） */
  function autoFitBranchDir(f) {
    var t = (AE.tangentAt && lastDataRef) ? AE.tangentAt(f.pid, lastDataRef, f.atM) : null;
    var tx = t ? t.x : 1, ty = t ? t.y : 0, tz = t && isFinite(t.z) ? t.z : 0;
    var L = Math.hypot(tx, ty, tz) || 1;
    var k = { x: tx / L, y: ty / L, z: tz / L };
    var d = { x: -k.y, y: k.x, z: 0 }, L2 = Math.hypot(d.x, d.y, d.z) || 1;
    var perp = { x: d.x / L2, y: d.y / L2, z: d.z / L2 };
    var spin = Number(f.spin) || 0;
    if (!spin) return perp;
    return rotateAboutAxis(perp, k, spin * Math.PI / 180);
  }
  function aeFitById(id, kind) {
    var list = (AE.fitsList && AE.fitsList()) || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id && (!kind || list[i].kind === kind)) return list[i];
    return null;
  }
  function pidSegType(pid) { return pid === 'front' ? 'front' : (pid.indexOf('main-') === 0 ? 'main' : 'branch'); }
  /* 从自动三通第三口生成手工接管（M-G##，teeId 回链；len 缺省 30 m，末端节点吸附） */
  function spawnPipeFromAutoTee(id, len) {
    var f = aeFitById(id, 'tee');
    if (!f || !lastDataRef) return false;
    var pos = AE.pointAt(f.pid, lastDataRef, f.atM);
    if (!pos) return false;
    var segType = pidSegType(f.pid);
    var segIndex = segType === 'front' ? 0 : (parseInt(f.pid.split('-')[1], 10) || 0);
    var z = SEG_Z[segType];
    var bd = autoFitBranchDir(f);
    len = Number.isFinite(len) && len > 0 ? len : 30;
    var tip = { x: pos.x + bd.x * len, y: pos.y + bd.y * len, z: z + bd.z * len };
    var nnT = nearNode(tip, null);
    if (nnT && Math.hypot(nnT.point.x - pos.x, nnT.point.y - pos.y, (nnT.point.z || 0) - z) > 0.15) {
      tip = { x: nnT.point.x, y: nnT.point.y, z: isFinite(nnT.point.z) ? nnT.point.z : tip.z };
    }
    var n = 0;
    manual.forEach(function (x) { if (x.kind === 'pipe') { var mm = /^M-G(\d+)$/.exec(x.id); if (mm) n = Math.max(n, parseInt(mm[1], 10)); } });
    var pid = 'M-G' + pad2(n + 1);
    checkpoint();
    manual.push({ id: pid, kind: 'pipe', spec: (AE.fitBranchSpecOf ? (AE.fitBranchSpecOf(id) || '') : '') || hostDia(segType),
      segType: segType, segIndex: segIndex, teeId: id, pts: [{ x: pos.x, y: pos.y, z: z }, tip] });
    rerenderKeepView(); notifyEdit();
    return pid;
  }
  /* 面板「第三口 ±15°」旋转后同步：teeId 回链的接出管道绕 (第三口点 C, 宿管轴 k) 刚体跟随 */
  function syncAutoFitSpin(id, newSpin, oldSpin) {
    var f = aeFitById(id, 'tee');
    if (!f || !lastDataRef) return false;
    var d = (Number(newSpin) || 0) - (Number(oldSpin) || 0);
    if (!d) return true;
    var pos = AE.pointAt(f.pid, lastDataRef, f.atM);
    if (!pos) return false;
    var C = { x: pos.x, y: pos.y, z: SEG_Z[pidSegType(f.pid)] };
    var tan = AE.tangentAt(f.pid, lastDataRef, f.atM) || { x: 1, y: 0 };
    var k = { x: tan.x, y: tan.y, z: 0 }, L = Math.hypot(k.x, k.y) || 1;
    k.x /= L; k.y /= L;
    var rad = d * Math.PI / 180;
    manual.forEach(function (p) {
      if (p.kind !== 'pipe' || p.teeId !== id || !p.pts) return;
      p.pts = p.pts.map(function (q) {
        var v = rotateVecAbout({ x: q.x - C.x, y: q.y - C.y, z: (q.z || 0) - C.z }, k, rad);
        return { x: C.x + v.x, y: C.y + v.y, z: C.z + v.z };
      });
    });
    rerenderKeepView(); notifyEdit();
    return true;
  }
  /* —— 管道接入捕捉模式：mousemove 吸附最近自动三通第三口（≤PLACE_TOL），click 生成 30m 接管 —— */
  var connectMode = false, connectHover = null, connectWire = null;
  function connectTargets() {
    var out = [];
    if (!lastDataRef || !viewState) return out;
    (AE.fitsList() || []).forEach(function (f) {
      if (f.kind !== 'tee') return;
      var pos = AE.pointAt(f.pid, lastDataRef, f.atM);
      if (!pos) return;
      var pr = projectIso(pos.x, pos.y, SEG_Z[pidSegType(f.pid)], viewState.k);
      out.push({ id: f.id, sx: viewState.ox + pr.x, sy: viewState.oy + pr.y, spec: AE.fitBranchSpecOf ? AE.fitBranchSpecOf(f.id) : '' });
    });
    return out;
  }
  function connectHintEl() {
    var svg = currentCTN() ? currentEL(currentCTN()) : null;
    return svg ? svg.querySelector('#isoConnectHint') : null;
  }
  function drawConnectHint(t) {
    var svg = currentCTN() ? currentEL(currentCTN()) : null;
    if (!svg) return;
    var old = svg.querySelector('#isoConnectHint');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    if (!t) return;
    var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('id', 'isoConnectHint');
    g.setAttribute('pointer-events', 'none');
    g.innerHTML = '<circle cx="' + t.sx.toFixed(1) + '" cy="' + t.sy.toFixed(1) + '" r="9" fill="none" stroke="#7c3aed" stroke-width="2" stroke-dasharray="4,3"/>'
      + '<text x="' + (t.sx + 12).toFixed(1) + '" y="' + (t.sy - 8).toFixed(1) + '" font-size="10.5" font-weight="700" font-family="system-ui" fill="#6d28d9" paint-order="stroke" stroke="white" stroke-width="2.5">'
      + '接入 ' + t.id + (t.spec ? ' · 第三口 Ø' + t.spec : '') + '</text>';
    svg.appendChild(g);
  }
  function setConnectMode(on) {
    on = !!on;
    if (on && connectMode) { setConnectMode(false); return false; }   /* 重复点击 = 退出 */
    connectMode = on;
    var ctn = currentCTN();
    if (connectWire) { ctn.removeEventListener('mousemove', connectWire.move, true); ctn.removeEventListener('click', connectWire.click, true); connectWire = null; }
    connectHover = null;
    drawConnectHint(null);
    if (!on) { if (typeof api.onConnectModeChange === 'function') api.onConnectModeChange(false); return false; }
    function nearest(e) {
      var ctn2 = currentCTN(), el = ctn2 ? currentEL(ctn2) : null;
      var u = el ? svgUserPoint(el, e.clientX, e.clientY) : null;
      if (!u) return null;
      var best = null;
      connectTargets().forEach(function (t) {
        var d = Math.hypot(t.sx - u.x, t.sy - u.y);
        if (d <= PLACE_TOL && (!best || d < best.d)) best = { d: d, t: t };
      });
      return best ? best.t : null;
    }
    connectWire = {
      move: function (e) {
        if (!connectMode) return;
        var t = nearest(e);
        if ((t && t.id) !== (connectHover && connectHover.id)) { connectHover = t; drawConnectHint(t); }
      },
      click: function (e) {
        if (!connectMode) return;
        var t = nearest(e);
        setConnectMode(false);
        if (!t) { setHintMsg('管道接入已取消'); return; }
        var pid = spawnPipeFromAutoTee(t.id, 30);
        setHintMsg(pid ? ('已从 ' + t.id + ' 第三口接入管道 ' + pid + '（30 m' + (t.spec ? ' · Ø' + t.spec : '') + '）；再次点「管道接入」可继续') : '接入失败');
      }
    };
    ctn.addEventListener('mousemove', connectWire.move, true);
    ctn.addEventListener('click', connectWire.click, true);
    if (typeof api.onConnectModeChange === 'function') api.onConnectModeChange(true);
    setHintMsg('管道接入：移动鼠标到三通第三口附近（紫色虚线圈吸附），点击生成 30 m 接管');
    return true;
  }
  function setHintMsg(s) { var h = document.getElementById('tlIsoPipeHint'); if (h) h.textContent = s; }

  /* 扫描命中管线并在命中点放置配件（放置模式 / 右键管道直接加 共用）。返回 manual 条目或 null。 */
  function scanAndAdd(kind, clientX, clientY) {
    if (!viewState || !lastDataRef) return null;
    var ctn = currentCTN(); if (!ctn) return null;
    var el = currentEL(ctn); if (!el) return null;
    var u = svgUserPoint(el, clientX, clientY); if (!u) return null;
    var model = viewState.model, best = { d: PLACE_TOL };
    function scan(list, segType) {
      (list || []).forEach(function (line, li) {
        for (var i = 0; i + 1 < line.length; i++) {
          var z = SEG_Z[segType];
          var pa = projectIso(line[i].x, line[i].y, z, viewState.k), pb = projectIso(line[i + 1].x, line[i + 1].y, z, viewState.k);
          var offset = segType === 'branch' && viewState.branchOffsets[li];
          if (offset) { pa.x += offset.x; pa.y += offset.y; pb.x += offset.x; pb.y += offset.y; }
          var d = segDist(u, { x: viewState.ox + pa.x, y: viewState.oy + pa.y }, { x: viewState.ox + pb.x, y: viewState.oy + pb.y });
          if (d < best.d) best = { d: d, segType: segType, segIndex: segType === 'front' ? 0 : li, line: line, i: i, z: z };
        }
      });
    }
    scan(model.front ? [model.front] : [], 'front'); scan(model.mains, 'main'); scan(model.branches, 'branch');
    /* 接管（M-G##）同样可挂载配件（2026-09-17 链式跟随的前提）：投影后取最近段，
       命中点按同一参数 t 在 3D 折线上插值（仿射投影 → 参数不变）。 */
    var bestPipe = null;
    manual.forEach(function (p) {
      if (p.kind !== 'pipe' || !p.pts || p.pts.length < 2) return;
      var poff = (p.segType === 'branch' && viewState.branchOffsets[p.segIndex]) || { x: 0, y: 0 };
      for (var i = 0; i + 1 < p.pts.length; i++) {
        var a = p.pts[i], b = p.pts[i + 1];
        var pa = projectIso(a.x, a.y, a.z || 0, viewState.k), pb = projectIso(b.x, b.y, b.z || 0, viewState.k);
        var A = { x: viewState.ox + pa.x + poff.x, y: viewState.oy + pa.y + poff.y };
        var B = { x: viewState.ox + pb.x + poff.x, y: viewState.oy + pb.y + poff.y };
        var cp = closestOnSeg(u, A, B);
        var abx = B.x - A.x, aby = B.y - A.y, ab2 = abx * abx + aby * aby;
        var t = ab2 > 0 ? ((cp.x - A.x) * abx + (cp.y - A.y) * aby) / ab2 : 0;
        if (t < 0) t = 0; else if (t > 1) t = 1;
        var L3 = Math.hypot(b.x - a.x, b.y - a.y, (b.z || 0) - (a.z || 0));
        var guard = Math.min(0.2, L3 * 0.25);
        if (t * L3 < guard || (1 - t) * L3 < guard) continue;   /* 贴端点不放：不压住已有三通/管口 */
        var d = dist(u, cp);
        if (d < best.d && (!bestPipe || d < bestPipe.d)) bestPipe = { d: d, p: p, i: i, t: t };
      }
    });
    if (bestPipe && (!best.segType || bestPipe.d < best.d)) {
      var qa = bestPipe.p.pts[bestPipe.i], qb = bestPipe.p.pts[bestPipe.i + 1], qt = bestPipe.t;
      var c3 = { x: qa.x + (qb.x - qa.x) * qt, y: qa.y + (qb.y - qa.y) * qt };
      var z3 = (qa.z || 0) + ((qb.z || 0) - (qa.z || 0)) * qt;
      var useSpec3 = (kind === 'tee' || kind === 'valve') ? (bestPipe.p.spec || hostDia(bestPipe.p.segType)) : '';
      /* 节点复用（2026-09-24 任务⑥）：放三通的位置已在某节点容差内 → 返回既有三通，不重复叠放 */
      if (kind === 'tee') { var nnP = nearNode({ x: c3.x, y: c3.y, z: z3 }); if (nnP && nnP.kind === 'tee') return nnP; }
      return addManual(kind, useSpec3, bestPipe.p.segType, bestPipe.p.segIndex || 0, c3,
        { hostPipe: bestPipe.p.id, z: z3 });
    }
    if (!best.segType) return null;
    var line = best.line, i = best.i, z = best.z;
    var shift = best.segType === 'branch' && viewState.branchOffsets[best.segIndex] || { x: 0, y: 0 };
    var c = closestOnSeg(unprojectIso(u.x - viewState.ox - shift.x, u.y - viewState.oy - shift.y, z, viewState.k), line[i], line[i + 1]);
    if (dist(c, line[i]) < 0.5 || dist(c, line[i + 1]) < 0.5) return null;
    var useSpec = (kind === 'tee' || kind === 'valve') ? hostDia(best.segType) : '';
    /* 节点复用（2026-09-24 任务⑥）：同 A4a —— 节点附近放三通不再产生重叠副本 */
    if (kind === 'tee') { var nnA = nearNode({ x: c.x, y: c.y, z: z }); if (nnA && nnA.kind === 'tee') return nnA; }
    return addManual(kind, useSpec, best.segType, best.segIndex, c);
  }
  function addManualAtScreen(kind, clientX, clientY) {
    if (!KIND_LABEL[kind]) return null;
    var m = scanAndAdd(kind, clientX, clientY);
    if (!m) return null;
    rerenderKeepView();
    notifyPlace({ ok: true, id: m.id, kind: kind, spec: m.spec });
    return m;
  }
  function removeManual(id) {
    for (var i = 0; i < manual.length; i++) {
      if (manual[i].id === id) { cancelEdit(); checkpoint(); manual.splice(i, 1); delete edits[id]; rerenderKeepView(); notifyEdit(); return true; }
    }
    return false;
  }
  function clearManual() { manual = []; manualSeq = { tee: 0, elbow: 0, valve: 0, pipe: 0 }; }
  function manualCount() { return manual.length; }
  /* ---------- 手工三通转换（2026-09-14 用户要求）----------
   * 右键手工三通选「同径 / 异径」后，分支口自动接一段管道（默认 1 m，可改长）。
   * 状态存于编辑参数：teeType('equal'|'reducing')/branchSpec/branchLen(0.5~10 m)，
   * 走 beginEdit→previewEdit→applyEdit 事务 —— 撤销/存档/编辑面板预览天然打通，
   * 且不能持有 manual 条目引用跨 cancelEdit（restore 会整组换数组，旧引用变孤儿）。 */
  function convertTee(id, type) {
    var info = fittingInfo(id);
    if (!info || !info.manual || info.kind !== 'tee') return false;
    if (['equal', 'reducing'].indexOf(type) < 0) return false;
    var other = hostDia(info.segType === 'branch' ? 'main' : 'branch');
    if (type === 'reducing' && !other) return false;
    var cur = params(id);
    if (!beginEdit(id)) return false;
    var values = {
      teeType: type,
      branchSpec: type === 'equal' ? (cur.spec || '') : other,
      branchLen: (cur.teeType && Number.isFinite(cur.branchLen)) ? cur.branchLen : 1
    };
    if (!previewEdit(values)) { cancelEdit(); return false; }
    applyEdit();
    return true;
  }
  function setBranchLen(id, len) {
    var info = fittingInfo(id);
    if (!info || !info.manual || info.kind !== 'tee' || !info.teeType) return false;
    var v = Number(len);
    if (!Number.isFinite(v) || v < 0.5 || v > 10) return false;
    if (!beginEdit(id)) return false;
    if (!previewEdit({ branchLen: Math.round(v * 100) / 100 })) { cancelEdit(); return false; }
    applyEdit();
    return true;
  }
  /* 数据引用变更（重新生成平面图）→ 清空手工层；同引用重渲染 → 保留 */
  function attachData(data) {
    var nextKey=geometryKey(data);
    if (nextKey !== dataKey) { clearManual(); autoSpin={}; edits={}; history=[]; draft=null; dataKey=nextKey; }
    lastDataRef = data || null;
  }
  /* 构件参数查询（自动三通/阀门 + 手工配件统一入口），找不到返回 null */
  function fittingInfo(id) {
    if (!viewState || !viewState.model) return null;
    var model = viewState.model, i, t, v, m;
    if (id.indexOf('R-') === 0) {
      v=model.valves.filter(function(v){return 'R-'+v.id===id && v.conn;})[0];
      if(v) return {id:id, manual:false, kind:'riser', kindLabel:'连接立管', typeName:'主管—支管连接立管', upstream:v.upstream, downstream:v.downstream, point:v.conn};
      return null;
    }
    for (i = 0; i < model.tees.length; i++) if (model.tees[i].id === id) {
      t = model.tees[i];
      return {
        id: t.id, manual: false, kind: 'tee', kindLabel: '三通',
        typeName: t.type === 'front-main' ? '三通（总管×主管，自动）' : '三通（主管×支管，自动）',
        upstream: t.upstream, downstream: t.downstream, point: t.point, spec: '随所在管段管径',
        type: t.type,                    /* 供 teeThroughDir/teeAxisLabel 直接吃 info（宿管判定） */
        /* 第三口绕宿管中心轴旋转（2026-09-16）：自动三通同样可旋转（记在表达层覆盖表） */
        axisLabel: teeAxisLabel(t),
        branchSpin: teeBranchSpin(t.id)
      };
    }
    for (i = 0; i < model.valves.length; i++) if (model.valves[i].id === id) {
      v = model.valves[i];
      return {
        id: v.id, manual: false, kind: 'valve', kindLabel: '阀门',
        typeName: v.auto ? '阀门（主管接入阀，自动）' : '阀门（支管出水阀）',
        upstream: v.upstream, downstream: v.downstream, zone: v.zone || null,
        point: v.point, spec: '随所在管段管径'
      };
    }
    for (i = 0; i < manual.length; i++) if (manual[i].id === id) {
      m = manual[i];
      var mp = params(m.id);
      return {
        id: m.id, manual: true, kind: m.kind, kindLabel: KIND_LABEL[m.kind],
        typeName: (m.kind === 'tee' && mp.teeType)
          ? '三通（手工布置·' + (m.spec || '?') + '转' + (mp.branchSpec || '?') + '）'
          : KIND_LABEL[m.kind] + '（手工布置）',
        segName: SEG_NAME[m.segType] + (m.segType === 'front' ? '' : (m.segIndex + 1)),
        segType: m.segType, segIndex: m.segIndex,
        point: m.kind === 'pipe' ? ((m.pts && m.pts[0]) || null) : m.point, spec: m.spec || '与管道同径',
        teeType: mp.teeType || null, branchSpec: mp.teeType ? (mp.branchSpec || null) : null,
        branchLen: mp.teeType ? mp.branchLen : null,
        /* 绕宿管中心轴的旋转口径（2026-09-16）：轴 = 该三通所在管道的中心轴 */
        axisLabel: m.kind === 'tee' ? teeAxisLabel(m) : null,
        branchSpin: m.kind === 'tee' ? teeBranchSpin(m.id) : null,
        branchDir: m.kind === 'tee' ? teeBranchDir(m) : null
      };
    }
    return null;
  }

  /* ---------- 分区材料统计（2026-09-13，只读汇总） ----------
   * 口径：
   * · 分区面积 = 网格单元宽×高（米²，1 亩 = 666.67 米²）
   * · 阀门 = 平面图出水阀（v.zone 归区）+ 主管接入阀（仅合计）+ 手工阀门
   * · 三通 = 主管×支管自动三通（随阀归区）+ 手工三通；总管×主管三通仅计入合计
   * · 弯头 = 手工弯头（自动几何无弯头，按「配件布置」统计）
   * · 管道长度 = 折线段长求和（米）；分区内 = 主管+支管，总管仅计入合计
   * 手工配件按 segType/segIndex 经「主/支管 ↔ 分区」映射归区
   * （映射依据：阀 v.zone ↔ v.upstream=main-i / v.downstream=branch-i）；
   * 总管上的手工配件与未映射管段仅计入合计（unmappedPipe 单列）。 */
  var MU_M2 = 2000 / 3; /* 1 亩 = 666.67 米² */
  function polyLen(line) {
    var L = 0;
    for (var i = 0; i + 1 < line.length; i++) L += Math.hypot(line[i + 1].x - line[i].x, line[i + 1].y - line[i].y);
    return L;
  }
  function computeStats(data) {
    /* 阶段2：统计按有效几何（改长后）口径显示；data 只读不写 */
    var model = buildModel(AE.applyTo(data));
    if (!model) return null;
    var zs = model.zones, cells = [];
    if (zs && zs.xPos && zs.yPos) {
      var znC = zs.cols || (zs.xPos.length - 1);   /* 区号与地块分区标注同口径（行主序 zi+1） */
      for (var r = 0; r + 1 < zs.yPos.length; r++) {
        for (var c = 0; c + 1 < zs.xPos.length; c++) {
          cells.push({
            id: (r * znC + c + 1) + '区',
            w: zs.xPos[c + 1] - zs.xPos[c], h: zs.yPos[r + 1] - zs.yPos[r],
            area: (zs.xPos[c + 1] - zs.xPos[c]) * (zs.yPos[r + 1] - zs.yPos[r]),
            valves: 0, tees: 0, elbows: 0, mainLen: 0, branchLen: 0, pipeLen: 0, areaMu: 0
          });
        }
      }
    }
    function cell(id) { for (var i = 0; i < cells.length; i++) if (cells[i].id === id) return cells[i]; return null; }
    function zoneOfMain(mi) {
      for (var i = 0; i < model.valves.length; i++) {
        var v = model.valves[i];
        if (v.zone && String(v.upstream) === 'main-' + mi) return v.zone;
      }
      return null;
    }
    function zoneOfBranch(bi) {
      for (var i = 0; i < model.valves.length; i++) {
        var v = model.valves[i];
        if (v.zone && String(v.downstream) === 'branch-' + bi) return v.zone;
      }
      return null;
    }
    /* 管长归区（主/支管未归区分开计） */
    var unmappedMain = 0, unmappedBranch = 0;
    model.mains.forEach(function (m, mi) {
      var cl = cell(zoneOfMain(mi)), L = polyLen(m);
      if (cl) cl.mainLen += L; else unmappedMain += L;
    });
    model.branches.forEach(function (b, bi) {
      var cl = cell(zoneOfBranch(bi)), L = polyLen(b);
      if (cl) cl.branchLen += L; else unmappedBranch += L;
    });
    /* 自动三通/阀门归区（无分区者计入合计：zonelessTee / zonelessValve） */
    var frontTeeCount = 0, zonelessTee = 0, zonelessValve = 0;
    model.tees.forEach(function (t) {
      if (t.type === 'front-main') { frontTeeCount++; return; }
      var v = null;
      for (var i = 0; i < model.valves.length; i++) if (model.valves[i].tee === t.id) { v = model.valves[i]; break; }
      var cl = v && v.zone ? cell(v.zone) : null;
      if (cl) cl.tees++; else zonelessTee++;
    });
    model.valves.forEach(function (v) {
      var cl = v.zone ? cell(v.zone) : null;
      if (cl) cl.valves++; else if (!v.auto) zonelessValve++;
    });
    /* 手工配件归区 */
    var man = { tee: 0, elbow: 0, valve: 0 }, manInZone = { tee: 0, elbow: 0, valve: 0 };
    manual.forEach(function (m) {
      var cl = null;
      if (m.segType === 'main') cl = cell(zoneOfMain(m.segIndex));
      else if (m.segType === 'branch') cl = cell(zoneOfBranch(m.segIndex));
      man[m.kind]++;
      if (cl) { manInZone[m.kind]++; if (m.kind === 'tee') cl.tees++; else if (m.kind === 'elbow') cl.elbows++; else cl.valves++; }
    });
    /* 手工三通接管长度（2026-09-14）：计入支管长度，随三通归区；总管上未归区进合计 */
    manual.forEach(function (m) {
      if (m.kind === 'tee') {
        var mp = params(m.id);
        if (mp.teeType && mp.branchSpec && Number.isFinite(mp.branchLen) && mp.branchLen > 0) {
          var cl2 = m.segType === 'main' ? cell(zoneOfMain(m.segIndex)) : (m.segType === 'branch' ? cell(zoneOfBranch(m.segIndex)) : null);
          if (cl2) cl2.branchLen += mp.branchLen; else unmappedBranch += mp.branchLen;
        }
      }
    });
    cells.forEach(function (cl) { cl.areaMu = cl.area / MU_M2; cl.pipeLen = cl.mainLen + cl.branchLen; });
    var tot = {
      zones: cells.length, area: 0, areaMu: 0,
      valves: 0, tees: frontTeeCount, elbows: 0,
      frontLen: (model.front && model.front.length >= 2) ? polyLen(model.front) : 0,
      mainLen: 0, branchLen: 0, pipeLen: 0,
      inletValves: model.valves.filter(function (v) { return v.auto; }).length,
      unmappedPipe: unmappedMain + unmappedBranch, manual: man
    };
    cells.forEach(function (cl) {
      tot.area += cl.area; tot.valves += cl.valves; tot.tees += cl.tees; tot.elbows += cl.elbows;
      tot.mainLen += cl.mainLen; tot.branchLen += cl.branchLen;
    });
    tot.areaMu = tot.area / MU_M2;
    tot.valves += tot.inletValves + zonelessValve + (man.valve - manInZone.valve); /* 接入阀 + 无分区出水阀 + 未归区手工阀 */
    tot.tees += zonelessTee + (man.tee - manInZone.tee);                           /* 无分区分支三通 + 未归区手工三通 */
    tot.elbows += (man.elbow - manInZone.elbow);                                   /* 未归区手工弯头 */
    tot.mainLen += unmappedMain;   /* 未归区主管计入合计 */
    tot.branchLen += unmappedBranch; /* 未归区支管计入合计 */
    tot.pipeLen = tot.frontLen + tot.mainLen + tot.branchLen;
    return { zones: cells, totals: tot };
  }

  /* ---------- 自动管线图面编辑 API（共享编辑层，2026-09-15 阶段2）---------- */
  function autoSelInfo() {
    if (selFitId) {
      var f = (AE.fitsList() || []).filter(function (x) { return x.id === selFitId; })[0];
      if (!f) return null;
      var fpos = AE.pointAt(f.pid, lastDataRef, f.atM);
      return { fit: true, id: f.id, kind: f.kind, kindLabel: KIND_LABEL[f.kind] || '配件', pid: f.pid, pipeName: AE.pipeName(f.pid), atM: f.atM, pipeLen: fpos ? fpos.len : null, spin: (f.kind === 'tee' && isFinite(f.spin)) ? f.spin : 0 };
    }
    if (!selAutoId || !lastDataRef) return null;
    var epts = AE.effPts(selAutoId, lastDataRef), bpts = AE.pipePts(selAutoId, lastDataRef);
    if (!epts) return null;
    return { auto: true, id: selAutoId, kindLabel: AE.pipeName(selAutoId), len: AE.polylineLen(epts), baseLen: bpts ? AE.polylineLen(bpts) : 0, pickAt: selAutoAt, od: AE.caliberOf ? AE.caliberOf(selAutoId) : null };
  }
  /* 选中自动管线就地改长（米）；成功后 AE 广播 → 两视图重渲染 */
  function setAutoLen(v) {
    if (!selAutoId || !lastDataRef) return false;
    return AE.setLen(selAutoId, Number(v), lastDataRef, 'iso');
  }
  /* 在选中自动管线的点击位置插入三通/阀门 */
  function insertAutoFit(kind) {
    if (!selAutoId || !lastDataRef) return null;
    return AE.addFitting(kind, selAutoId, selAutoAt, lastDataRef, 'iso');
  }
  function deleteSelFit() {
    if (!selFitId) return false;
    var ok = AE.removeFitting(selFitId, 'iso');
    if (ok) { selFitId = null; rerenderKeepView(); if (typeof api.onAutoSel === 'function') api.onAutoSel(null); }
    return ok;
  }
  /* 选中配件精确定位（输入框，阶段2b）：atM = 距起点弧长（米）；距终点输入由页面换算 pipeLen−v */
  function moveSelFit(atM) {
    if (!selFitId || !lastDataRef) return false;
    var ok = AE.moveFitting(selFitId, Number(atM), lastDataRef, 'iso');
    if (ok && typeof api.onAutoSel === 'function') api.onAutoSel(autoSelInfo());
    return ok;
  }
  /* 图面改径（2026-09-16 阶段2e）：右键菜单选 pid 一步设置/恢复；AE 广播 → 两视图重渲染 */
  function setAutoCaliber(pid, od) {
    if (!lastDataRef) return false;
    var ok = AE.setCaliber(pid, Number(od), lastDataRef, 'iso');
    if (ok) {
      selPipeId = null; selFitId = null; selAutoId = pid; selAutoAt = 0;
      rerenderKeepView();
      if (typeof api.onAutoSel === 'function') api.onAutoSel(autoSelInfo());
    }
    return ok;
  }
  function clearAutoCaliber(pid) {
    if (!lastDataRef) return false;
    var ok = AE.clearCaliber(pid, 'iso');
    if (ok) {
      rerenderKeepView();
      if (selAutoId === pid && typeof api.onAutoSel === 'function') api.onAutoSel(autoSelInfo());
    }
    return ok;
  }

  /* ---------- 容器渲染（幂等：innerHTML 替换，不叠加；重渲染后视口复位） ---------- */
  function render(container, data) {
    if (!container) return null;
    attachData(data);
    /* 共享图面数据层几何绑定（2026-09-15 阶段1）：几何变化 → 手工管线自动清空 */
    if (data && EP.syncGeometry) EP.syncGeometry(data);
    /* 自动管线图面编辑层几何绑定（阶段2）：几何变化 → 改长/配件自动清空 */
    if (data && AE.syncGeometry) AE.syncGeometry(data);
    if (!data) {
      container.innerHTML = '<div class="pp-diagram-empty">请先生成三级管线平面图</div>';
      return null;
    }
    var svg = renderSVG(data);
    if (!svg) {
      container.innerHTML = '<div class="pp-diagram-empty">轴测图生成失败：几何数据不完整（version 需为 1）</div>';
      return null;
    }
    /* 2026-09-17 第六十三轮：轴测图「改径汇总条」（原 #tlIsoCalChip）已按用户要求取消，
       画布右上角不再叠加任何卡片；三级工作区那份 #tlWsCalChip 保留不动。 */
    container.innerHTML = svg;
    var el = container.querySelector('svg');
    view.z = 1; view.x = 0; view.y = 0;
    baseFit(container, el);
    applyView(container, el);
    wireInteractions(container);
    return svg;
  }

  /* ---------- 下载 / 打印（操作 #tlIsoDiagramContent 内的 SVG） ---------- */
  function currentSVG() {
    var ctn = document.getElementById('tlIsoDiagramContent');
    return ctn ? ctn.querySelector('svg') : null;
  }
  /* 导出用干净副本：剥离视口变换（translate/scale）与拖拽态 class，保证所见即所得尺寸 */
  function cleanExportSVG() {
    var el = currentSVG();
    if (!el) { alert('请先生成轴测图'); return null; }
    var clone = el.cloneNode(true);
    /* 剔除施工管网编辑器的叠加层（含悬停高亮）：导出图纸只保留图纸本身（2026-09-15） */
    Array.prototype.forEach.call(clone.querySelectorAll('[data-ry-export-skip]'), function (n) {
      if (n.parentNode) n.parentNode.removeChild(n);
    });
    clone.style.transform = '';
    clone.style.width = '';
    clone.style.height = '';
    clone.classList.remove('iso-dragging');
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    return clone;
  }
  function downloadSVG() {
    var clone = cleanExportSVG(); if (!clone) return;
    var blob = new Blob([clone.outerHTML], { type: 'image/svg+xml;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '三级管线轴测图-' + new Date().toISOString().slice(0, 10) + '.svg';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
  }
  function printSVG() {
    var clone = cleanExportSVG(); if (!clone) return;
    var w = window.open('', '_blank');
    if (!w) { alert('浏览器阻止了打印窗口，请允许弹出窗口后重试'); return; }
    w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>三级管线轴测图</title>'
      + '<style>@media print{body{margin:0}} body{display:flex;align-items:center;justify-content:center;min-height:100vh} svg{max-width:100%;height:auto}</style>'
      + '</head><body>' + clone.outerHTML + '</body></html>');
    w.document.close();
    w.focus();
    setTimeout(function () { try { w.print(); } catch (e) { } }, 350);
  }

  /* ---------- 导出 ---------- */
  var api = {
    version: 1,
    EPS: EPS, VALVE_OFFSET: VALVE_OFFSET, HEIGHTS: HEIGHTS, RISE45: RISE45, COLORS: COLORS,
    projectIso: projectIso, unprojectIso: unprojectIso,
    snapPoint: snapPoint, closestOnSeg: closestOnSeg, segDist: segDist,
    buildModel: buildModel, computeStats: computeStats, renderSVG: renderSVG, render: render,
    zoomIn: zoomIn, zoomOut: zoomOut, zoomFit: zoomFit,
    downloadSVG: downloadSVG, printSVG: printSVG,
    /* 手工配件层（编辑表达层） */
    startPlace: startPlace, cancelPlace: cancelPlace, placingKind: placingKind,
    addManual: addManual, removeManual: removeManual, clearManual: clearManual,
    manualCount: manualCount, fittingInfo: fittingInfo, attachData: attachData,
    getParams:params, beginEdit:beginEdit, previewEdit:previewEdit, applyEdit:applyEdit, cancelEdit:cancelEdit,
    manualPosition:manualPosition,
    resetEdit:resetEdit, undoEdit:undoEdit, exportState:exportState, importState:importState,
    convertTee:convertTee, setBranchLen:setBranchLen,
    rotateTee:rotateTee, resetTeeBranch:resetTeeBranch, teeBranchSpin:teeBranchSpin,
    teeThroughDir:teeThroughDir, teeAxisLabel:teeAxisLabel, teeBranchDir:teeBranchDir, asTeeRec:asTeeRec,
    addManualAtScreen:addManualAtScreen, spawnPipeFromTee:spawnPipeFromTee, extendManualPipe:extendManualPipe,
    spawnPipeFromAutoTee:spawnPipeFromAutoTee, syncAutoFitSpin:syncAutoFitSpin, setConnectMode:setConnectMode,
    connectMode:function(){ return connectMode; }, autoFitBranchDir:autoFitBranchDir,
    nearNode:nearNode, manualEntries:function(){ return manual; }, NODE_SNAP_TOL:NODE_SNAP_TOL,   /* 节点吸附（2026-09-24 任务⑥，E2E 只读） */
    teeSubtree:teeSubtree, hostTangentAt:hostTangentAt, teeSnapPts:teeSnapPts,
    /* 手工管线画线模式 + 拾取（共享图面数据层，2026-09-15 阶段1） */
    startPipeMode: startPipeMode, endPipeMode: endPipeMode, pipeModeKind: pipeModeKind,
    selPipeInfo: selPipeInfo, pipeDataPoint: pipeDataPoint,
    onPipeClick: null, onPipeModeChange: null,
    /* 自动管线图面编辑（阶段2） */
    setAutoLen: setAutoLen, insertAutoFit: insertAutoFit, deleteSelFit: deleteSelFit, moveSelFit: moveSelFit,
    setAutoCaliber: setAutoCaliber, clearAutoCaliber: clearAutoCaliber, onAutoPipeContextMenu: null,
    autoSelInfo: autoSelInfo, onAutoSel: null,
    redraw:rerenderKeepView, onEditChange:null,
    getViewState: function () { return viewState; }, /* 只读钩子：E2E 坐标换算 */
    PLACE_TOL: PLACE_TOL, onFittingClick: null, onPlaceResult: null, onFittingContextMenu: null
  };
  if (typeof window !== 'undefined') window.RyIsoDiagram = api;
  /* 共享层订阅（双向同步核心，2026-09-15 阶段1）：三级工作区/主方案存档发起的
     手工管线变更 → 本视图保持视口重渲染（Node 环境无 DOM 自动跳过）。 */
  EP.onChange(function () {
    if (typeof document === 'undefined' || !lastDataRef) return;
    if (selPipeId && !selPipeInfo()) { selPipeId = null; if (typeof api.onPipeClick === 'function') api.onPipeClick(null, null); }
    rerenderKeepView();
  });
  /* 自动管线编辑层订阅（阶段2）：工作区/存档发起的改长/配件变更 → 本视图保持视口重渲染 */
  AE.onChange(function () {
    if (typeof document === 'undefined' || !lastDataRef) return;
    if ((selAutoId || selFitId) && !autoSelInfo()) {
      selAutoId = null; selFitId = null;
      if (typeof api.onAutoSel === 'function') api.onAutoSel(null);
    }
    rerenderKeepView();
    if (selFitId && autoSelInfo() && typeof api.onAutoSel === 'function') api.onAutoSel(autoSelInfo());
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
