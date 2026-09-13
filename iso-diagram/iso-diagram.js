/* =====================================================================
 * iso-diagram.js — 三级管线轴测示意图模块（润野灌溉）
 * ---------------------------------------------------------------------
 * 职责：读取三级平面图最终几何数据（window.tlDiagramData，由 tlAutoGenerate
 *       末尾导出），做表达转换：等轴测投影 + 连接识别（三通）+ 阀门 + SVG。
 * 红线：只读不写。不参与任何水力计算，不修改流量/管径/扬程/分区/材料清单，
 *       不回调灌溉计算，不写 localStorage，不改变平面图几何数据。
 * 数据契约见 iso-diagram/README.md；版本 version:1，单位米。
 * ===================================================================== */
(function () {
  'use strict';

  /* ---------- 常量（绘图表达参数，不参与水力计算） ---------- */
  var EPS = 0.01;                 // 连接点吸附容差（米）
  var VALVE_OFFSET = 1.5;         // 阀门与三通沿下游管线的间距（米）
  var TEE_SNAP = 0.5;             // 阀门斜拉点视为落在主管上的容差（与平面图一致）
  var MAX_VALVE_LABELS = 24;      // 阀门数 ≤ 此值时在图上标注编号（避免拥挤）
  /* 层级表达（z 仅用于轴测图上下关系，不代表真实埋深，不参与水力计算）：
   * 总管/主管为埋地管 → 位于地面之下（z<0，画在支管下方）；
   * 支管/滴灌带为地表管（z≥0）。 */
  var HEIGHTS = { front: -1.5, main: -1.0, branch: 0.3, tape: 0.0, source: 0.9, inletValveZ: -1.5 };
  var RISE45 = 14;                // 三通 45° 斜拉段固定长度（viewBox 单位，2026-09-13 用户指定：不管阀位远近、方向统一）
  var COLORS = {
    front: '#202020',   // 单线工程表达，线宽区分管线层级
    main: '#202020',
    branch: '#202020',
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
  var KIND_LABEL = { tee: '三通', elbow: '弯头', valve: '阀门' };
  var MANUAL_PREFIX = { tee: 'M-T', elbow: 'M-E', valve: 'M-V' };
  var SEG_Z = { front: HEIGHTS.front, main: HEIGHTS.main, branch: HEIGHTS.branch };
  var SEG_NAME = { front: '总管', main: '主管', branch: '支管' };
  var manual = [];
  var edits = {}, history = [], draft = null, dataKey = '';
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function geometryKey(data) {
    if (!data) return '';
    return JSON.stringify([data.frontPipe, data.mainPipes, data.branchPipes, data.valves, data.poly]);
  }
  function snapshot() { return copy({ edits: edits, manual: manual, seq: manualSeq }); }
  function restore(s) { edits = copy(s.edits || {}); manual = copy(s.manual || []); manualSeq = copy(s.seq || {tee:0,elbow:0,valve:0}); }
  function checkpoint() { history.push(snapshot()); if (history.length > 40) history.shift(); }
  function params(id) {
    var item=manual.filter(function(m){return m.id===id;})[0];
    return Object.assign({ spec:item ? item.spec : '', branchSpec:'', valveType:'通用阀门', connection:'未指定', angle:90,
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
    if (!Object.keys(s.edits).every(function(id){return /^(TEE-[FB]|V-[FB]|R-V-B|M-[TEV])\d+$/.test(id) && validParams(Object.assign({}, params(''),s.edits[id]));})) return false;
    if (!s.manual.every(function(m){return /^M-[TEV]\d+$/.test(m.id) && KIND_LABEL[m.kind] && SEG_NAME[m.segType] && Number.isInteger(m.segIndex) && m.segIndex >= 0 && m.point && Number.isFinite(m.point.x) && Number.isFinite(m.point.y) && typeof m.spec === 'string';})) return false;
    if(!['tee','elbow','valve'].every(function(k){return Number.isInteger(s.seq[k])&&s.seq[k]>=0&&s.seq[k]<=1000000;}))return false;
    if(new Set(s.manual.map(function(m){return m.id;})).size!==s.manual.length)return false;
    attachData(data); restore(s); manual.forEach(function(m){m.z=SEG_Z[m.segType];manualSeq[m.kind]=Math.max(manualSeq[m.kind],Number(m.id.slice(3)));}); history=[]; draft=null; rerenderKeepView(); return true;
  }
  var manualSeq = { tee: 0, elbow: 0, valve: 0 };
  var lastDataRef = null;
  var placing = null;        /* {kind, spec} | null —— 放置模式 */
  var viewState = null;      /* {k, ox, oy, model} —— renderSVG 记录，供命中测试 */
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
    function zoneOf(v, zs) {
      if (!zs || !zs.xPos || !zs.yPos) return null;
      for (var c = 0; c + 1 < zs.xPos.length; c++) {
        if (v.x >= zs.xPos[c] - EPS && v.x <= zs.xPos[c + 1] + EPS) {
          for (var r = 0; r + 1 < zs.yPos.length; r++) {
            if (v.y >= zs.yPos[r] - EPS && v.y <= zs.yPos[r + 1] + EPS) return 'R' + (r + 1) + 'C' + (c + 1);
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
  function valveSymbol(q, angle) {
    return '<g data-symbol="valve" transform="translate(' + fmt(q.x) + ' ' + fmt(q.y) + ') rotate(' + fmt(angle) + ')">'
      + '<rect x="-8" y="-6" width="16" height="12" fill="transparent"/>'
      + '<path d="M-7 -4 L7 4 L7 -4 L-7 4 Z" fill="white" stroke="#202020" stroke-width="1.2"/></g>';
  }

  function renderSVG(data) {
    var model = buildModel(data);
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
    var zoneCount = (meta.zoneCount !== undefined) ? meta.zoneCount : ((model.zones && model.zones.cols) ? model.zones.cols * model.zones.rows : '—');
    var now = data.generatedAt ? String(data.generatedAt).replace('T', ' ').slice(0, 16) : new Date().toISOString().slice(0, 16).replace('T', ' ');
    s.push('<g font-family="system-ui,sans-serif">');
    s.push('<text x="' + (svgW / 2) + '" y="34" text-anchor="middle" font-size="19" font-weight="700" fill="' + COLORS.label + '">三级管线轴测示意图</text>');
    s.push('<text x="' + (svgW / 2) + '" y="54" text-anchor="middle" font-size="11" fill="#5b6b66">'
      + '分区 ' + zoneCount + ' 区 · 总管 ' + esc(meta.pipes && meta.pipes.front || '—')
      + ' · 主管 ' + esc(meta.pipes && meta.pipes.main || '—')
      + ' · 支管 ' + esc(meta.pipes && meta.pipes.branch || '—')
      + ' · 生成 ' + esc(String(now)) + '</text>');
    s.push('</g>');

    /* 3a) 地块轮廓线（z=0，2026-09-13 用户要求显示；分区分割线保留） */
    if (model.poly && model.poly.length >= 3) {
      s.push('<polygon data-plot-outline="1" points="' + model.poly.map(function (p) {
        var q = P(p.x, p.y, 0);
        return fmt(q.x) + ',' + fmt(q.y);
      }).join(' ') + '" fill="none" stroke="#55655e" stroke-width="1.8" stroke-linejoin="round"/>');
    }

    /* 3b) 地块裁剪（2026-09-13 用户要求：管线超出地块的部分不显示）。
       以地块轮廓 polygon 作 clipPath；无有效轮廓（<3 点）时不裁剪。
       仅显示层裁剪：包围盒取景仍按原始几何计算，取景/缩放不受影响。 */
    var clipAttr = '';
    if (model.poly && model.poly.length >= 3) {
      clipAttr = ' clip-path="url(#isoPlotClip)"';
      s.push('<defs><clipPath id="isoPlotClip"><polygon points="' + model.poly.map(function (p) {
        var q = P(p.x, p.y, 0);
        return fmt(q.x) + ',' + fmt(q.y);
      }).join(' ') + '"/></clipPath></defs>');
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
    s.push('<g fill="none" stroke="' + COLORS.front + '" stroke-width="1.5"' + clipAttr + '>');
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
    model.mains.forEach(function (l) { s.push('<path d="' + path3(l, function () { return HEIGHTS.main; }) + '"/>'); });
    s.push('</g>');

    /* 4c) 总管（埋地，带流向箭头） */
    s.push('<defs><marker id="isoArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
      + '<path d="M0 0 L10 5 L0 10 z" fill="' + COLORS.front + '"/></marker></defs>');
    if (model.front && model.front.length >= 2) {
      s.push('<g' + clipAttr + '>');
      s.push('<path d="' + path3(model.front, function () { return HEIGHTS.front; })
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
    model.branches.forEach(function (l,i) { s.push('<path data-branch="' + i + '" d="' + path3(l, function () { return HEIGHTS.branch; }, branchOffsets[i]) + '"/>'); });
    s.push('</g>');

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
        + fitLabel(v.id,q,model.valves.length <= MAX_VALVE_LABELS)
        + '</g>');
    });
    s.push('</g>');

    /* 10) 三通符号（T 形短杆 + 圆点） */
    s.push('<g' + clipAttr + '>');
    model.tees.forEach(function (t) {
      var z = t.type === 'front-main' ? HEIGHTS.front : HEIGHTS.main;
      var q = P(t.point.x, t.point.y, z);
      s.push('<g class="iso-fit" data-fit="' + esc(t.id) + '" style="cursor:pointer"><title>' + esc(t.id + ' · ' + t.upstream + ' → ' + t.downstream) + '</title>'
        + '<circle cx="' + fmt(q.x) + '" cy="' + fmt(q.y) + '" r="7" fill="transparent"/>'
        + '<circle cx="' + fmt(q.x) + '" cy="' + fmt(q.y) + '" r="' + (2*params(t.id).size) + '" fill="' + COLORS.tee + '"/>' + fitLabel(t.id,q,false) + '</g>');
    });
    s.push('</g>');

    /* 10b) 手工配件层（编辑层：三通/弯头/阀门，非水力计算对象；点击可查参数） */
    if (manual.length) {
      s.push('<g' + clipAttr + '>');
      manual.forEach(function (m) {
        var q = shifted(P(m.point.x, m.point.y, m.z), m.segType === 'branch' ? branchOffsets[m.segIndex] : null);
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
        } else {
          sym = '<circle cx="' + fmt(q.x) + '" cy="' + fmt(q.y) + '" r="5.2" fill="' + COLORS.tee + '" stroke="#fff" stroke-width="1.6"/>'
            + '<path d="M' + fmt(q.x - 6.5) + ' ' + fmt(q.y) + ' H' + fmt(q.x + 6.5) + ' M' + fmt(q.x) + ' ' + fmt(q.y) + ' V' + fmt(q.y + 6.5) + '" stroke="#fff" stroke-width="1.4" fill="none"/>';
        }
        s.push('<g class="iso-fit" data-fit="' + esc(m.id) + '" style="cursor:pointer"><title>'
          + esc(m.id + ' · ' + KIND_LABEL[m.kind] + ' · ' + (m.spec || '与管道同径')) + '</title>' + scaledSymbol(sym,q,m.id) + fitLabel(m.id,q,!!edits[m.id]) + '</g>');
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
      s.push('<g data-pipe-note="1" font-size="10" font-family="system-ui" fill="#202020"><path d="M' + fmt(q.x) + ' ' + fmt(q.y) + ' l12 ' + offset + ' h70" fill="none" stroke="#555" stroke-width="0.6"/><text x="' + fmt(q.x + 14) + '" y="' + fmt(q.y + offset - 3) + '" paint-order="stroke" stroke="white" stroke-width="3">' + esc(text) + '</text></g>');
    }
    pipeNote(model.front, HEIGHTS.front, '总管 ' + (meta.pipes && meta.pipes.front || '管径待定'), 20);
    model.mains.forEach(function(line, i) { pipeNote(line, HEIGHTS.main, 'G' + (i + 1) + ' ' + (meta.pipes && meta.pipes.main || '待定'), -16); });
    model.branches.forEach(function(line, i) { pipeNote(line, HEIGHTS.branch, 'Z' + (i + 1) + ' ' + (meta.pipes && meta.pipes.branch || '待定'), 18, branchOffsets[i]); });
    s.push('<g transform="translate(65 655)" fill="none" stroke="#555" stroke-width="0.8"><path d="M0 -32 V0 H38 M0 0 L27 -27"/><g stroke="none" fill="#333" font-family="system-ui" font-size="10"><text x="40" y="4">X</text><text x="28" y="-29">Y</text><text x="-4" y="-37">Z</text></g></g>');

    /* 12) 图例 + 底部参数 */
    var ly = svgH - footerH + 30, lx = 60;
    s.push('<g font-family="system-ui,sans-serif" font-size="10.5" font-weight="600">');
    function legItem(x, draw, label, color) {
      s.push(draw(x, ly));
      s.push('<text x="' + (x + 20) + '" y="' + (ly + 4) + '" fill="' + (color || '#334155') + '">' + esc(label) + '</text>');
      return x + 92;
    }
    var x0 = lx;
    x0 = legItem(x0, function (x, y) { return '<rect x="' + x + '" y="' + (y - 4) + '" width="14" height="4" rx="2" fill="' + COLORS.front + '"/>'; }, '总管');
    x0 = legItem(x0, function (x, y) { return '<rect x="' + x + '" y="' + (y - 4) + '" width="14" height="4" rx="2" fill="' + COLORS.main + '"/>'; }, '主管');
    x0 = legItem(x0, function (x, y) { return '<rect x="' + x + '" y="' + (y - 3) + '" width="14" height="3" rx="1.5" fill="' + COLORS.branch + '"/>'; }, '支管');
    /* 滴灌带图例已随绘制一并移除（2026-09-13） */
    x0 = legItem(x0, function (x, y) { return '<path d="M' + x + ' ' + y + ' h14 m-7 0 v-9" fill="none" stroke="#202020" stroke-width="1.5"/>'; }, '三通连接');
    x0 = legItem(x0, function (x, y) { return valveSymbol({x:x + 7,y:y}, 0); }, '阀门(通用)');
    x0 = legItem(x0, function (x, y) { return '<circle cx="' + (x + 7) + '" cy="' + (y - 2) + '" r="6" fill="' + COLORS.source + '"/>'; }, '水源/泵');
    var pumpTxt = '水泵 ' + ((meta.pump && meta.pump.flow) || '—') + ' m³/h · ' + ((meta.pump && meta.pump.head) || '—') + ' m · ' + ((meta.pump && meta.pump.power) || '—') + ' kW';
    s.push('<text x="' + lx + '" y="' + (ly + 26) + '" fill="#334155">' + esc('联合灌溉 ' + zoneCount + ' 区 · ' + pumpTxt) + '</text>');
    s.push('<text x="' + lx + '" y="' + (ly + 44) + '" font-size="10" font-weight="400" fill="#444">45°正面斜轴测 · 不按比例 · 支管按Z向立管展开；标高/埋深待设计确认，非施工放样依据。G=主管，Z=支管。</text>');
    s.push('</g>');
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
    ctn.addEventListener('wheel', function (e) {
      var el = currentEL(ctn); if (!el) return;
      e.preventDefault();
      var r = ctn.getBoundingClientRect();
      zoomAt(ctn, el, e.clientX - r.left, e.clientY - r.top, e.deltaY > 0 ? 0.9 : 1.1);
    }, { passive: false });
    var drag = null;
    ctn.addEventListener('pointerdown', function (e) {
      var el = currentEL(ctn); if (!el) return;
      drag = { x: e.clientX - view.x, y: e.clientY - view.y, id: e.pointerId };
      el.classList.add('iso-dragging');
      if (el.setPointerCapture) { try { el.setPointerCapture(e.pointerId); } catch (err) { } }
      e.preventDefault();
    });
    ctn.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var el = currentEL(ctn); if (!el) return;
      view.x = e.clientX - drag.x; view.y = e.clientY - drag.y;
      applyView(ctn, el);
    });
    function up(e) {
      if (!drag || (e.pointerId !== undefined && e.pointerId !== drag.id)) return;
      drag = null;
      var el = currentEL(ctn); if (el) el.classList.remove('iso-dragging');
    }
    ctn.addEventListener('pointerup', up);
    ctn.addEventListener('pointercancel', up);
    ctn.addEventListener('dblclick', function () { zoomFit(); });
    /* 点击（与拖拽平移区分：按下到抬起位移 ≤5px 才算点击）：
       放置模式 → 沿管线放置配件；否则 → 命中构件显示参数 */
    var downPos = null;
    ctn.addEventListener('pointerdown', function (e) { downPos = { x: e.clientX, y: e.clientY }; });
    ctn.addEventListener('click', function (e) {
      if (!downPos || Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 5) return;
      handleClick(ctn, e);
    });
  }

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
    if (placing) { placeFromEvent(ctn, el, e); return; }
    /* 注意：平移拖拽用 setPointerCapture 捕获到 svg，click 事件的 target 会被重定向
       到 svg 根——必须用 elementFromPoint 取指针位置下的真实元素再找构件分组。 */
    var t = document.elementFromPoint(e.clientX, e.clientY);
    var g = t && t.closest ? t.closest('g[data-fit]') : null;
    if (g && typeof api.onFittingClick === 'function') api.onFittingClick(fittingInfo(g.getAttribute('data-fit')));
  }
  function placeFromEvent(ctn, el, e) {
    var kind = placing.kind, spec = placing.spec || '';
    if (!viewState || !lastDataRef) { endPlace(); notifyPlace({ ok: false, reason: '尚未生成轴测图' }); return; }
    var u = svgUserPoint(el, e.clientX, e.clientY);
    if (!u) { notifyPlace({ ok: false, reason: '坐标解析失败，请重试' }); return; }
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
    if (!best.segType) { notifyPlace({ ok: false, reason: '未命中管线：请沿总管/主管/支管的管段点击' }); return; }
    var line = best.line, i = best.i, z = best.z;
    var shift = best.segType === 'branch' && viewState.branchOffsets[best.segIndex] || {x:0,y:0};
    var c = closestOnSeg(unprojectIso(u.x - viewState.ox - shift.x, u.y - viewState.oy - shift.y, z, viewState.k), line[i], line[i + 1]);
    if (dist(c, line[i]) < 0.5 || dist(c, line[i + 1]) < 0.5) {
      notifyPlace({ ok: false, reason: '位置太靠近管段端点（避免与自动三通重叠），请点在管段中部' }); return;
    }
    var m = addManual(kind, spec, best.segType, best.segIndex, c);
    endPlace();
    rerenderKeepView();
    notifyPlace({ ok: true, id: m.id, kind: kind, spec: spec });
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
    render(ctn, lastDataRef);
    view = keep;
    var el = currentEL(ctn); if (el) applyView(ctn, el);
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
  function addManual(kind, spec, segType, segIndex, point) {
    if (!MANUAL_PREFIX[kind] || !point || !SEG_Z[segType]) return null;
    cancelEdit(); checkpoint();
    manualSeq[kind]++;
    var m = {
      id: MANUAL_PREFIX[kind] + pad2(manualSeq[kind]), kind: kind, spec: spec || '',
      segType: segType, segIndex: segIndex || 0,
      point: { x: point.x, y: point.y }, z: SEG_Z[segType]
    };
    manual.push(m);
    notifyEdit();
    return m;
  }
  function removeManual(id) {
    for (var i = 0; i < manual.length; i++) {
      if (manual[i].id === id) { cancelEdit(); checkpoint(); manual.splice(i, 1); delete edits[id]; rerenderKeepView(); notifyEdit(); return true; }
    }
    return false;
  }
  function clearManual() { manual = []; manualSeq = { tee: 0, elbow: 0, valve: 0 }; }
  function manualCount() { return manual.length; }
  /* 数据引用变更（重新生成平面图）→ 清空手工层；同引用重渲染 → 保留 */
  function attachData(data) {
    var nextKey=geometryKey(data);
    if (nextKey !== dataKey) { clearManual(); edits={}; history=[]; draft=null; dataKey=nextKey; }
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
        upstream: t.upstream, downstream: t.downstream, point: t.point, spec: '随所在管段管径'
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
      return {
        id: m.id, manual: true, kind: m.kind, kindLabel: KIND_LABEL[m.kind],
        typeName: KIND_LABEL[m.kind] + '（手工布置）',
        segName: SEG_NAME[m.segType] + (m.segType === 'front' ? '' : (m.segIndex + 1)),
        point: m.point, spec: m.spec || '与管道同径'
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
    var model = buildModel(data);
    if (!model) return null;
    var zs = model.zones, cells = [];
    if (zs && zs.xPos && zs.yPos) {
      for (var r = 0; r + 1 < zs.yPos.length; r++) {
        for (var c = 0; c + 1 < zs.xPos.length; c++) {
          cells.push({
            id: 'R' + (r + 1) + 'C' + (c + 1),
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

  /* ---------- 容器渲染（幂等：innerHTML 替换，不叠加；重渲染后视口复位） ---------- */
  function render(container, data) {
    if (!container) return null;
    attachData(data);
    if (!data) {
      container.innerHTML = '<div class="pp-diagram-empty">请先生成三级管线平面图</div>';
      return null;
    }
    var svg = renderSVG(data);
    if (!svg) {
      container.innerHTML = '<div class="pp-diagram-empty">轴测图生成失败：几何数据不完整（version 需为 1）</div>';
      return null;
    }
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
    redraw:rerenderKeepView, onEditChange:null,
    getViewState: function () { return viewState; }, /* 只读钩子：E2E 坐标换算 */
    PLACE_TOL: PLACE_TOL, onFittingClick: null, onPlaceResult: null
  };
  if (typeof window !== 'undefined') window.RyIsoDiagram = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
