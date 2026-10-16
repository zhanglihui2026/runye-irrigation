/* =====================================================================
 * network-model.js — 尺寸驱动的施工管网模型（润野灌溉 · 三级管路）
 * ---------------------------------------------------------------------
 * 职责：在「三维管线平面图」几何之上，建立一份**独立、版本化**的施工管网
 *       模型，支持按现场施工逻辑编辑管道：在直管上插入阀门/三通、修改管段
 *       尺寸并让相连配件联动、从空接口接管、移动三通时分支联动、约束冲突
 *       拦截、撤销/重做、保存到本机并刷新恢复。
 *
 * 红线：
 *  - 只读平面图几何（window.tlDiagramData），**不修改原平面数据、不回写水力
 *    计算、不改变分区规则或材料清单**。第一版编辑结果只存于本模型。
 *  - 图形、尺寸、连接关系来自同一模型；不在 SVG 里改坐标或叠加符号假装编辑。
 *  - 内部长度单位统一为米；第一版尺寸采用「节点中心到中心」长度，明确标注，
 *    不冒充实际切管长度（实际切管需减管件插入损耗，本期未实现）。
 *  - 真实长度/高程与图上展开高度严格区分；本模型只使用工程坐标(x,y)与平面
 *    层级 z（z 仅作绘制分层，不参与长度/水力计算）。
 *
 * 可同时被 Node（require，用于测试）与浏览器（window.RyNetModel）加载。
 * 不依赖 DOM。
 * ===================================================================== */
(function () {
  'use strict';

  var EPS = 1e-6;            // 几何一致性容差（米）
  var MIN_LEN = 0.05;       // 管段最小允许长度（米）
  var SNAP_TOL = 0.2;       // 工程吸附容差（米）：临近已有节点吸附复用，避免重叠配件/极短段
  var ANG_TOL = 1e-3;       // 方向判定容差（归一化向量点积/叉积）：垂直/平行/共线判定
  var DIR_TOL = 1e-3;       // 传播时方向一致性容差（归一化叉积）：防弯折/折返
  var MU_M2 = 2000 / 3;     // 1 亩 = 666.67 米²（与 iso-diagram 同口径，仅统计用）

  /* ---------- 基础向量数学 ---------- */
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function add(a, b) { return { x: a.x + b.x, y: a.y + b.y }; }
  function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y }; }
  function scale(a, s) { return { x: a.x * s, y: a.y * s }; }
  function neg(a) { return { x: -a.x, y: -a.y }; }
  function len(a) { return Math.hypot(a.x, a.y); }
  function unit(a) {
    var l = len(a);
    if (l < EPS) return { x: 1, y: 0 };
    return { x: a.x / l, y: a.y / l };
  }
  function eq(a, b) { return Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9; }
  function round3(v) { return Math.round(v * 1e6) / 1e6; }
  function dot(a, b) { return a.x * b.x + a.y * b.y; }
  function cross(a, b) { return a.x * b.y - a.y * b.x; }
  /* 有限数校验：NaN / ±Infinity 一律拒绝进入模型 */
  function fin(v) { return typeof v === 'number' && Number.isFinite(v); }
  /* 非零方向向量校验 */
  function vecOk(v) { return !!v && fin(v.x) && fin(v.y) && len(v) > EPS; }

  /* ---------- 口径解析（meta.pipes 形如 {front:'O200',main:'O110',branch:'O63'}） ---------- */
  function parseCal(s) {
    if (s == null) return null;
    var m = String(s).match(/(\d+)/);
    return m ? Number(m[1]) : null;
  }
  function caliberMap(meta) {
    meta = meta || {};
    var p = meta.pipes || {};
    return { front: parseCal(p.front), main: parseCal(p.main), branch: parseCal(p.branch) };
  }

  /* 几何签名：用于判断已保存施工模型是否匹配当前平面图（迁移校验） */
  function geometryKey(data) {
    if (!data) return '';
    return JSON.stringify([data.frontPipe, data.mainPipes, data.branchPipes, data.valves, data.poly]);
  }

  /* ---------- 施工管网模型 ---------- */
  function ConstructionNetwork() {
    this.version = 1;
    this.units = 'm';
    this.coords = 'engineering';              // 工程坐标（x,y 平面；z 仅绘制分层）
    this.fittings = {};                        // id -> Fitting
    this.segments = {};                        // id -> Segment
    this.fixed = {};                           // id -> true：锚点（传播中位置已知，作为基准）
    this.hardFixed = {};                       // id -> true：**硬锚**（用户【固定】/水源/施工起点）
                                               //   —— 传播时是「墙」；未列入者（图纸折线拐点/链端点）
                                               //   为「图纸锚」：配件沿管轴移动时下游整链可整体平移
    this.notes = { uncertain: [], elevations: [] }; // 待确认标记（不擅自连接/推断高程）
    this.sourceKey = '';                       // 来源平面图几何签名
    this.sourceMeta = null;                    // 来源 meta 快照（口径等）
    this.seq = { valve: 0, tee: 0, endpoint: 0, elbow: 0, seg: 0 };
    this.assemblyLog = [];                     // 装配日志：清单式接管的行序（随快照/撤销/序列化走）
    this._history = [];
    this._draft = null;
    this._tx = null;           // 编辑事务快照（beginEdit→commitEdit/cancelEdit）
  }

  /* ===== Fitting =====
   * { id, type, pos:{x,y}, z, ports:{ portId: Port }, label? }
   * Port: { id, dir:{x,y}（单位向量，指向接口外侧）, caliber:number|null,
   *         connected:segmentId|null } */
  /* ===== Segment =====
   * { id, a:{fitting,port}, b:{fitting,port}, length:number, dir:{x,y}(a→b 单位),
   *   caliber:number|null, rigid:boolean, kind:'front'|'main'|'branch'|'manual' } */

  ConstructionNetwork.prototype._snap = function () {
    return JSON.stringify({
      fittings: this.fittings, segments: this.segments, fixed: this.fixed, hardFixed: this.hardFixed,
      seq: this.seq, notes: this.notes, sourceKey: this.sourceKey, assemblyLog: this.assemblyLog
    });
  };
  ConstructionNetwork.prototype._restore = function (s) {
    var o = JSON.parse(s);
    this.fittings = o.fittings; this.segments = o.segments; this.fixed = o.fixed;
    this.hardFixed = o.hardFixed || {};
    this.seq = o.seq; this.notes = o.notes; this.sourceKey = o.sourceKey;
    this.assemblyLog = o.assemblyLog || [];
  };
  /* 事务内的操作失败回滚：恢复到事务起点，不产生/不弹出撤销记录 */
  ConstructionNetwork.prototype._rollback = function () {
    if (this._tx) { this._restore(this._tx); }
    else if (this._history.length) { this._restore(this._history.pop()); }
  };
  ConstructionNetwork.prototype._checkpoint = function () {
    if (this._tx) return;   // 事务内不再逐操作压栈：一次事务=一个撤销步骤
    this._history.push(this._snap());
    if (this._history.length > 50) this._history.shift();
  };
  ConstructionNetwork.prototype.canUndo = function () { return this._history.length > 0; };
  ConstructionNetwork.prototype.undo = function () {
    if (!this._history.length) return false;
    this._restore(this._history.pop());
    return true;
  };
  /* ===== 编辑事务：进入操作→保存操作前状态→预览→确认提交或取消恢复 =====
   * beginEdit：记住当前状态（不含未确认预览时不得保存/撤销）。
   * commitEdit：整个事务压入【一条】撤销记录。
   * cancelEdit：恢复到 beginEdit 时状态，撤销栈不变——未修改直接取消不会
   *   撤掉历史操作（取消≠撤销）。 */
  ConstructionNetwork.prototype.beginEdit = function () {
    if (this._tx) return false;
    this._tx = this._snap();
    return true;
  };
  ConstructionNetwork.prototype.commitEdit = function () {
    if (!this._tx) return false;
    this._history.push(this._tx);
    if (this._history.length > 50) this._history.shift();
    this._tx = null;
    return true;
  };
  ConstructionNetwork.prototype.cancelEdit = function () {
    if (!this._tx) return false;
    this._restore(this._tx);
    this._tx = null;
    return true;
  };
  ConstructionNetwork.prototype.isEditing = function () { return !!this._tx; };

  ConstructionNetwork.prototype.getFitting = function (id) { return this.fittings[id] || null; };
  ConstructionNetwork.prototype.getSegment = function (id) { return this.segments[id] || null; };
  ConstructionNetwork.prototype.isPinned = function (id) { return !!this.fixed[id]; };
  ConstructionNetwork.prototype.pin = function (id, opts) {
    if (!this.fittings[id]) return false;
    this._checkpoint(); this.fixed[id] = true;
    if (!opts || opts.hard !== false) this.hardFixed[id] = true;   // 用户【固定】= 硬锚（墙）
    return true;
  };
  ConstructionNetwork.prototype.unpin = function (id) {
    this._checkpoint(); delete this.fixed[id]; delete this.hardFixed[id]; return true;
  };
  /* 硬锚判定：位置被真实约束（用户【固定】/水源 SRC/施工起点）→ 传播时不可平移（墙）。
   * fixed 中其余项为「图纸锚」（fromPlan 的折线拐点/链端点）：定义初始图面位置，
   * 但当配件沿管轴移动时，下游整链可**整体平移**（每段 length/dir 保持不变），
   * 这类锚点随之平移（见 _propagate 的 released/translated 报告）。 */
  ConstructionNetwork.prototype._isHardAnchor = function (id) {
    if (!this.fixed[id]) return false;
    var f = this.fittings[id];
    if (f && f.type === 'source') return true;      // 水源
    return !!this.hardFixed[id];
  };

  /* 某配件相连的所有管段（返回 Segment 数组） */
  ConstructionNetwork.prototype.segmentsOf = function (fittingId) {
    var self = this, out = [];
    Object.keys(this.segments).forEach(function (sid) {
      var s = self.segments[sid];
      if (s.a.fitting === fittingId || s.b.fitting === fittingId) out.push(s);
    });
    return out;
  };
  /* 某配件的空接口（未连接段） */
  ConstructionNetwork.prototype.freePorts = function (fittingId) {
    var fit = this.fittings[fittingId]; if (!fit) return [];
    return Object.keys(fit.ports).filter(function (pid) { return !fit.ports[pid].connected; })
      .map(function (pid) { return { fitting: fittingId, port: pid, portDef: fit.ports[pid] }; });
  };

  /* ---------- 从三级管线平面数据建立可编辑副本 ----------
   * 连接识别规则（纯几何投影、容差受限、可复核；绝不根据图形交叉擅自连接）：
   *  1) 每条折线（front/main/branch）独立成链：两端各建一个固定 endpoint，
   *     线上的阀门/三通按沿线距离把链拆成管段。
   *  2) 总管→主管：主管起点到总管折线的垂足处建三通（tee-front），接驳段柔性。
   *  3) 主管→阀门：阀门接点 (ax,ay) 投影到容差内最近的主管，垂足建三通；
   *     三通→阀门本体为接驳段（takeoff，刚性），保证移动三通时阀门随动。
   *  4) 阀门→支管：阀门 (x,y) 投影到容差内最近的支管，支管在阀门处拆分。
   *  5) 水源→总管：直连段（柔性）。
   *  - 投影残差超容差 / 找不到归属 → 记入 notes.uncertain（待确认），不连接。
   *  - 接驳/立管段的长度按图面几何量取，可能包含高程展开 → 记入 notes.elevations。
   * rigid 语义：front/main/riser=柔性（显式改长时相邻段重新分配）；branch /
   * takeoff / manual=刚性（上游移动时长度保持；两端固定的刚性段改长被拦截）。
   * 平面链两端 endpoint 一律固定（地块/基础设施锚点）；addBranch 产生的新支管
   * 末端为自由端（不固定）→ 即需求中的「自由分支」。 */
  var PROJ_TOL = 2.0;      // 投影归属容差（米）
  var RISER_TOL = 30.0;    // 总管→主管接驳识别容差（米；图面立管展开距离通常约 20）

  ConstructionNetwork.prototype.fromPlan = function (data) {
    if (!data || data.version !== 1) return null;
    this.fittings = {}; this.segments = {}; this.fixed = {}; this.hardFixed = {};
    this.notes = { uncertain: [], elevations: [] };
    this.seq = { valve: 0, tee: 0, endpoint: 0, elbow: 0, seg: 0 };
    this.assemblyLog = [];
    this.sourceKey = geometryKey(data);
    this.sourceMeta = data.meta || null;
    var cal = caliberMap(data.meta);
    var self = this;

    function addFitting(type, pos, z, presetId) {
      var id = presetId || (type === 'valve' ? 'V' : (type === 'tee' || type === 'tee-front') ? 'T' : 'E') + '-P' + (++self.seq[type === 'valve' ? 'valve' : (type === 'tee' || type === 'tee-front') ? 'tee' : 'endpoint']);
      self.fittings[id] = { id: id, type: type, pos: { x: round3(pos.x), y: round3(pos.y) }, z: z || 0, elevation: null, ports: {} };
      return id;
    }
    /* 在配件上新增一个未占用端口（唯一命名 p1..pn），返回端口名 */
    function addPort(fitId, dir, caliber) {
      var fit = self.fittings[fitId], n = 1;
      while (fit.ports['p' + n]) n++;
      fit.ports['p' + n] = { id: 'p' + n, dir: dir, caliber: caliber == null ? null : caliber, connected: null };
      return 'p' + n;
    }
    function addSeg(aRef, bRef, length, dir, caliber, rigid, kind) {
      var sid = 'S' + (++self.seq.seg);
      self.segments[sid] = { id: sid, a: aRef, b: bRef, length: round3(length), dir: dir, caliber: caliber == null ? null : caliber, rigid: !!rigid, kind: kind };
      self.fittings[aRef.fitting].ports[aRef.port].connected = sid;
      self.fittings[bRef.fitting].ports[bRef.port].connected = sid;
      return sid;
    }

    /* 折线 → 链。marks: [{d, fit}]（d=沿线全局距离）。两端 endpoint 固定，
     * **每个中间转折点建弯头（elbow，固定）**——折线不会被压成一根弦线，
     * 每条直腿各自成段、各自记录长度与方向。marks 落在腿内部才拆段。
     * 返回 { startId, endId, total }。 */
    function buildChain(kind, pts, caliber, z, marks) {
      if (!pts || pts.length < 2) return null;
      var total = polyLen(pts);
      /* 转折点配件：首末=endpoint（固定），中间=elbow（固定，作折线形状锚点） */
      var cornerFits = pts.map(function (p, i) {
        var isEnd = (i === 0 || i === pts.length - 1);
        var id = addFitting(isEnd ? 'endpoint' : 'elbow', p, z);
        self.fixed[id] = true;
        // 总管链 = 地块骨架（硬锚，不被下游随动带跑）；主管/支管链拐点 = 图纸锚（可随动平移）
        if (kind === 'front') self.hardFixed[id] = true;
        return id;
      });
      marks = marks || [];
      for (var i = 0; i + 1 < pts.length; i++) {
        var A = pts[i], B = pts[i + 1], legLen = dist(A, B), legStart = 0;
        for (var k = 0; k < i; k++) legStart += dist(pts[k], pts[k + 1]);
        var dirLeg = legLen < EPS ? { x: 1, y: 0 } : unit(sub(B, A));
        var nodes = [{ d: 0, fit: cornerFits[i], pt: A }]
          .concat(marks.filter(function (mk) { return mk.d > legStart + MIN_LEN && mk.d < legStart + legLen - MIN_LEN; })
            .map(function (mk) { return { d: mk.d - legStart, fit: mk.fit, pt: add(A, scale(dirLeg, mk.d - legStart)) }; }))
          .concat([{ d: legLen, fit: cornerFits[i + 1], pt: B }]);
        nodes.sort(function (a, b) { return a.d - b.d; });
        for (var j = 0; j + 1 < nodes.length; j++) {
          var NA = nodes[j], NB = nodes[j + 1], L = NB.d - NA.d;
          if (L < MIN_LEN) { self.notes.uncertain.push(kind + ' 链上两个配件间距仅 ' + L.toFixed(2) + 'm，其间管段未建立，待确认'); continue; }
          var dir2 = unit(sub(NB.pt, NA.pt));
          var portA = addPort(NA.fit, dir2, caliber);
          var portB = addPort(NB.fit, neg(dir2), caliber);
          addSeg({ fitting: NA.fit, port: portA }, { fitting: NB.fit, port: portB }, L, dir2, caliber, kind === 'branch', kind);
        }
      }
      return { startId: cornerFits[0], endId: cornerFits[cornerFits.length - 1], total: total };
    }

    var front = data.frontPipe, mains = data.mainPipes || [], branches = data.branchPipes || [];

    /* --- 阀门归属匹配：(ax,ay)→主管、(x,y)→支管（容差内最近者）--- */
    var valveDefs = (data.valves || []).map(function (v, i) {
      return { i: i, pt: { x: v.x, y: v.y }, ax: (v.ax != null ? { x: v.ax, y: v.ay } : null), mainIdx: null, mainD: 0, branchIdx: null, branchD: 0, teeId: null };
    });
    valveDefs.forEach(function (v) {
      if (v.ax) {
        var bm = nearestLine(mains, v.ax);
        if (bm && bm.residual <= PROJ_TOL) { v.mainIdx = bm.idx; v.mainD = bm.d; }
        else self.notes.uncertain.push('阀门 #' + (v.i + 1) + ' 的主管接点未能匹配到主管（残差 ' + (bm ? bm.residual.toFixed(2) : '∞') + 'm），其接驳待确认');
      } else {
        self.notes.uncertain.push('阀门 #' + (v.i + 1) + ' 缺少主管接点坐标（ax/ay），其接驳待确认');
      }
      var bb = nearestLine(branches, v.pt);
      if (bb && bb.residual <= PROJ_TOL) { v.branchIdx = bb.idx; v.branchD = bb.d; }
      else self.notes.uncertain.push('阀门 #' + (v.i + 1) + ' 的支管落点未能匹配到支管线，其连接待确认');
    });

    /* --- 配件预建：阀门本体、主管上的阀门三通、总管上的接驳三通 --- */
    valveDefs.forEach(function (v) {
      addFitting('valve', v.pt, 0.3, 'V' + (v.i + 1));
      if (v.mainIdx != null) {
        v.teeId = addFitting('tee', pointAtDist(mains[v.mainIdx], v.mainD), -1.0, 'T-V' + (v.i + 1));
      }
    });
    var frontTees = [];   // {tee, mainIdx, start, d}
    if (front && front.length >= 2) {
      mains.forEach(function (line, i) {
        if (!line || line.length < 2) return;
        var pr = projLine(front, line[0]);
        if (pr.residual > RISER_TOL) { self.notes.uncertain.push('主管 ' + (i + 1) + ' 起点距总管 ' + pr.residual.toFixed(1) + 'm，超出接驳识别容差，接驳待确认'); return; }
        var teeId = addFitting('tee-front', pointAtDist(front, pr.d), -1.5, 'T-M' + (i + 1));
        frontTees.push({ tee: teeId, mainIdx: i, start: line[0], d: pr.d });
      });
    }

    /* --- 建链（front/main/branch 各自成链，线上配件拆段）--- */
    var frontChain = buildChain('front', front, cal.front, -1.5,
      frontTees.map(function (ft) { return { d: ft.d, fit: ft.tee }; }));
    var mainChains = mains.map(function (line, i) {
      var marks = valveDefs.filter(function (v) { return v.mainIdx === i && v.teeId; })
        .map(function (v) { return { d: v.mainD, fit: v.teeId }; });
      return buildChain('main', line, cal.main, -1.0, marks);
    });
    var branchChains = branches.map(function (line, i) {
      var marks = valveDefs.filter(function (v) { return v.branchIdx === i; })
        .map(function (v) { return { d: v.branchD, fit: 'V' + (v.i + 1) }; });
      return buildChain('branch', line, cal.branch, 0.3, marks);
    });

    /* --- 总管→主管接驳段（riser，柔性；长度含图面展开，高程待确认）--- */
    frontTees.forEach(function (ft) {
      var mc = mainChains[ft.mainIdx]; if (!mc) return;
      var teePos = self.fittings[ft.tee].pos;
      var dir = unit(sub(ft.start, teePos));
      var portT = addPort(ft.tee, dir, cal.front);
      var portM = addPort(mc.startId, neg(dir), cal.main);
      addSeg({ fitting: ft.tee, port: portT }, { fitting: mc.startId, port: portM }, dist(teePos, ft.start), dir, cal.main, false, 'riser');
    });
    if (frontTees.length) self.notes.elevations.push('总管→主管接驳段（' + frontTees.length + ' 处）长度按图面几何量取，可能含立管高程展开，施工下料前待确认');

    /* --- 主管三通→阀门接驳段（takeoff，刚性：移动三通时阀门/下游随动）--- */
    valveDefs.forEach(function (v) {
      if (!v.teeId) return;
      var teePos = self.fittings[v.teeId].pos;
      var vid = 'V' + (v.i + 1), vpos = self.fittings[vid].pos;
      var dir = unit(sub(vpos, teePos));
      var portT = addPort(v.teeId, dir, cal.main);
      var portV = addPort(vid, neg(dir), cal.main);
      addSeg({ fitting: v.teeId, port: portT }, { fitting: vid, port: portV }, dist(teePos, vpos), dir, cal.main, true, 'takeoff');
    });

    /* --- 水源→总管 --- */
    if (data.sourcePos && frontChain) {
      var sId = addFitting('source', data.sourcePos, 0.9, 'SRC');
      self.fixed[sId] = true; self.hardFixed[sId] = true;
      var dS = dist(data.sourcePos, front[0]);
      if (dS >= MIN_LEN) {
        var dirS = unit(sub(front[0], data.sourcePos));
        var portS = addPort(sId, dirS, cal.front);
        var portF = addPort(frontChain.startId, neg(dirS), cal.front);
        addSeg({ fitting: sId, port: portS }, { fitting: frontChain.startId, port: portF }, dS, dirS, cal.front, false, 'front');
      } else {
        self.notes.uncertain.push('水源与总管起点重合/过近（' + dS.toFixed(2) + 'm），接驳段未建立，待确认');
      }
    }

    return this;
  };

  /* ---------- 折线辅助 ---------- */
  function polyLen(pts) { var s = 0; for (var i = 0; i + 1 < pts.length; i++) s += dist(pts[i], pts[i + 1]); return s; }
  /* 点到折线的投影：返回 { d:沿线距离, residual:垂距 }（取垂距最小处） */
  function projLine(pts, p) {
    var total = 0, best = Infinity, along = 0;
    for (var i = 0; i + 1 < pts.length; i++) {
      var a = pts[i], b = pts[i + 1], l = dist(a, b);
      var t = l < EPS ? 0 : (((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (l * l));
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      var cp = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      var dd = dist(cp, p);
      if (dd < best) { best = dd; along = total + dist(a, cp); }
      total += l;
    }
    return { d: along, residual: best };
  }
  /* 点到一组折线中最近的一条：返回 { idx, d, residual } 或 null */
  function nearestLine(lines, p) {
    var best = null;
    (lines || []).forEach(function (line, idx) {
      if (!line || line.length < 2) return;
      var pr = projLine(line, p);
      if (!best || pr.residual < best.residual) best = { idx: idx, d: pr.d, residual: pr.residual };
    });
    return best;
  }
  function pointAtDist(pts, target) {
    var total = 0;
    for (var i = 0; i + 1 < pts.length; i++) {
      var l = dist(pts[i], pts[i + 1]);
      if (total + l >= target) { var t = (target - total) / (l || 1); return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t }; }
      total += l;
    }
    return pts[pts.length - 1];
  }

  /* ---------- 约束传播 ----------
   * 给定一组「已知位置」的种子（seed: {fitId:{x,y}}，含固定配件），沿管段 BFS：
   *  - 自由端未知 → 用管段长度推进其位置（长度保持不变）。
   *  - 另一端已知：
   *      · 柔性段（rigid=false，如主干段）：若远端固定 → 重算本段长度以贴合固定端（吸收）；
   *        若远端自由且不一致 → 闭环冲突。
   *      · 刚性段（rigid=true，如支管）：长度不得变；若 |距离−长度|>EPS → 冲突（拦截）。
   * 返回 {known} 或 {conflict:true, reason}。 */
  /* 以 seedFitId 的已知位置为种子（固定配件作为墙）沿管段 BFS 传播。
   * 返回 {known} 或 {conflict:true, reason}。冲突时立即中止（用标志位，
   * 而非在 forEach 内 return——后者不会真正跳出循环）。 */
  /* 以 seedFitId 的已知位置为种子（固定配件作为墙）沿管段 BFS 传播。
   * 返回 {known, moved, absorbed} 或 {conflict:true, reason}。冲突时立即中止（用标志位，
   * 而非在 forEach 内 return——后者不会真正跳出循环）。
   *
   * 长度语义（本次升级）：
   *  - 远端自由且未知 → 整段**平移**（长度不变），该远端及其下游一同随动；
   *  - 远端为**固定锚点**且已验证与管段同向共线 → 节点沿该锚固管线**滑动**，
   *    管段长度按实际距离吸收（= 在既有管线上重新切分；柔性/刚性段皆然，
   *    因为管线总长由锚点决定，未拉断任何连接）；
   *  - 远端自由但长度不符（闭环尺寸不一致）/ 方向不符（弯折、折返、越过锚固端）
   *    → 一律冲突拦截。 */
  /* ---------- 直管轴向约束（守卫） ----------
   * 配件若处在一条直通管段上（相连管段中有 ≥2 段共线，如主管上的三通/阀门、总管上的三通），
   * 取「共线对数最多的轴」为该配件的**管轴**：任何移动都必须落回该轴，离轴即拒绝
   * （防擅改管路走向 / 把三通推离主管轴）。各段互不共线（90° 弯头等）时不施加约束。
   * 返回 null（通过）或 {ok:false, reason}。 */
  ConstructionNetwork.prototype._axisGuard = function (fittingId, newPos) {
    var segs = this.segmentsOf(fittingId);
    if (segs.length < 2) return null;
    var fpos = this.fittings[fittingId].pos;
    var bestAxis = null, bestCnt = 0;
    segs.forEach(function (s0) {
      var cnt = segs.filter(function (s) {
        return Math.abs(s.dir.x * s0.dir.y - s.dir.y * s0.dir.x) < ANG_TOL;
      }).length;
      if (cnt > bestCnt) { bestCnt = cnt; bestAxis = s0.dir; }
    });
    if (!bestAxis || bestCnt < 2) return null;
    var off = Math.abs((newPos.x - fpos.x) * bestAxis.y - (newPos.y - fpos.y) * bestAxis.x);
    if (off > 0.05) return { ok: false, reason: '该配件位于直管上（' + bestCnt +
      ' 段共轴），只能沿管轴移动（离轴 ' + off.toFixed(2) + 'm，已阻止擅改变管路走向）' };
    return null;
  };
  ConstructionNetwork.prototype._propagate = function (seedFitId, seedPos) {
    var known = {}, self = this, conflict = null;
    var absorbed = [];                       // 沿既有锚固管线重新切分（长度按实际距离改写）
    var translated = [];                     // 整体平移的管段（length 与 dir 均保持不变）
    var released = [];                       // 随下游整链平移的「图纸锚」配件
    var releasedOnce = {};                   // 每个图纸锚每轮最多释放一次（环形约束防抖）
    var LEN_TOL = 1e-4, steps = 0;
    known[seedFitId] = { x: round3(seedPos.x), y: round3(seedPos.y) };
    Object.keys(this.fixed).forEach(function (id) {
      if (id === seedFitId) return;          // 种子端按操作结果落位，绝不被锚点快照覆盖
      if (self.fixed[id] && self.fittings[id]) known[id] = self.fittings[id].pos;
    });
    var queue = [seedFitId];
    while (queue.length && !conflict) {
      if (++steps > 20000) {                 // 兜底：绝不静默挂死
        conflict = { reason: '随动传播未收敛（存在环形约束或零长接驳链），已阻止', kind: 'noConverge' };
        break;
      }
      var fid = queue.shift(), fpos = known[fid];
      var segs = this.segmentsOf(fid);
      for (var si = 0; si < segs.length && !conflict; si++) {
        var seg = segs[si];
        var otherId = seg.a.fitting === fid ? seg.b.fitting : seg.a.fitting;
        var dirFromF = seg.a.fitting === fid ? seg.dir : neg(seg.dir);
        /* ① 远端未知（自由端）→ 整段平移：远端 = 种子端 + 管段方向 × 管段长度（length/dir 不变） */
        if (!known[otherId]) {
          if (self.fixed[otherId]) continue;                 // 防御：锚点必已进入 known
          known[otherId] = add(fpos, scale(dirFromF, seg.length));
          queue.push(otherId);
          continue;
        }
        /* ② 零长接驳段（如总管三通与主管起点图面重合）：方向/长度无意义 → 保持重合随动 */
        if (seg.length < MIN_LEN) {
          if (otherId === seedFitId) continue;      // 种子端是操作目标，绝不被回程改写（防振荡）
          var np0 = { x: round3(fpos.x), y: round3(fpos.y) };
          if (known[otherId].x === np0.x && known[otherId].y === np0.y) continue;  // 已重合 → 无需再动
          if (self._isHardAnchor(otherId)) {
            conflict = { reason: '零长接驳段 ' + seg.id + ' 的另一端 ' + otherId +
              ' 是固定锚点（◆），无法随动，已阻止；请先【解除固定】或调整相邻管段', seg: seg.id, other: otherId, kind: 'hardAnchor' };
            break;
          }
          known[otherId] = { x: round3(fpos.x), y: round3(fpos.y) };
          if (released.indexOf(otherId) < 0) released.push(otherId);
          if (translated.indexOf(seg.id) < 0) translated.push(seg.id);
          queue.push(otherId);
          continue;
        }
        /* ③ 两端位置都已知：校验实际连线与管段记录的方向/长度 */
        var d = dist(fpos, known[otherId]);
        if (d < MIN_LEN) {
          conflict = { reason: '调整后 ' + seg.id + ' 长度仅 ' + d.toFixed(2) + 'm，小于最小管长 ' + MIN_LEN + 'm，已阻止',
            seg: seg.id, other: otherId, kind: 'tooShort' };
          break;
        }
        var u2 = { x: (known[otherId].x - fpos.x) / d, y: (known[otherId].y - fpos.y) / d };
        var cr2 = Math.abs(u2.x * dirFromF.y - u2.y * dirFromF.x);
        var dt2 = u2.x * dirFromF.x + u2.y * dirFromF.y;
        var dirBad = cr2 > DIR_TOL || dt2 < 1 - 1e-3;
        if (!dirBad && Math.abs(d - seg.length) <= LEN_TOL) continue;      // 完全一致
        if (!dirBad) {
          /* ④ 同轴但长度不符：锚点端原地不动 → 本段重新切分吸收（接头沿既有管线滑动，
           *    子段长度和守恒，未拉断任何连接），柔性/刚性段皆然 */
          if (self.fixed[otherId]) { seg.length = round3(d); absorbed.push(seg.id); continue; }
          conflict = { reason: '闭环尺寸不一致（管段 ' + seg.id + ' 实际 ' + d.toFixed(2) + 'm ≠ 记录 ' + seg.length.toFixed(2) + 'm），已阻止',
            seg: seg.id, other: otherId, kind: 'loop' };
          break;
        }
        /* ⑤ 方向不符（会弯折 / 折返） */
        if (self.fixed[otherId]) {
          if (dt2 < 0) {
            conflict = { reason: '移动将越过锚固端 ' + otherId + '，使管段 ' + seg.id + ' 折返，已阻止以免翻转/拉断连接',
              seg: seg.id, other: otherId, kind: 'overshoot' };
            break;
          }
          if (self._isHardAnchor(otherId)) {
            conflict = { reason: '固定端 ' + otherId + ' 使管段 ' + seg.id + ' 无法保持长度/方向（会弯折 ' +
              (cr2 * 180 / Math.PI).toFixed(1) + '°），已阻止', seg: seg.id, other: otherId, kind: 'hardAnchor' };
            break;
          }
          /* 图纸锚（折线拐点/链端点）→ 下游整链**整体平移**：本段 length 与 dir 保持不变，
           * 远端随之平移并继续向下游传播（这就是「三通沿总管轴线移动、支管整体跟随」） */
          if (releasedOnce[otherId]) {
            conflict = { reason: '环形约束：图纸锚 ' + otherId + ' 与管段 ' + seg.id +
              ' 无法同时满足长度/方向（平移也闭合不上），已阻止', seg: seg.id, other: otherId, kind: 'loop' };
            break;
          }
          releasedOnce[otherId] = true;
          known[otherId] = add(fpos, scale(dirFromF, seg.length));
          if (released.indexOf(otherId) < 0) released.push(otherId);
          if (translated.indexOf(seg.id) < 0) translated.push(seg.id);
          queue.push(otherId);
          continue;
        }
        conflict = { reason: '闭环方向不一致（管段 ' + seg.id + '，两端自由却被两条路径定位），已阻止',
          seg: seg.id, other: otherId, kind: 'loop' };
        break;
      }
    }
    if (conflict) return { conflict: true, reason: conflict.reason, seg: conflict.seg, other: conflict.other, kind: conflict.kind };
    /* 随动报告：被带动的配件（排除种子） + 随动的图纸锚 */
    var moved = [];
    Object.keys(known).forEach(function (id) {
      if (id === seedFitId || self.fixed[id] || !self.fittings[id]) return;
      var p = self.fittings[id].pos;
      if (Math.abs(p.x - known[id].x) > 1e-6 || Math.abs(p.y - known[id].y) > 1e-6) moved.push(id);
    });
    released.forEach(function (id) { if (moved.indexOf(id) < 0) moved.push(id); });
    return { known: known, moved: moved, absorbed: absorbed, translated: translated, released: released };
  };
  /* 冲突补充提示：移动端位于「多向交点」（相连管段不同轴，如主管上的三通/阀门）时，
   * 改单段长度必然把它推离另一条管道的轴线 → 告诉用户可行的替代操作。 */
  ConstructionNetwork.prototype._axisHint = function (fitId) {
    var ms = this.segmentsOf(fitId);
    if (ms.length < 2) return '';
    var u0 = ms[0].dir, cross = ms.some(function (s) {
      return Math.abs(s.dir.x * u0.y - s.dir.y * u0.x) >= ANG_TOL;
    });
    if (!cross) return '';
    return '（提示：' + fitId + ' 位于多向交点，改本段长度会把它推离其他管道的轴线；' +
      '可改选「以该接头为基准端」移动自由端，或改调该接头另一侧相邻管段的长度；' +
      '若被固定端（◆）挡住，可先【解除固定】再移动）';
  };

  ConstructionNetwork.prototype._applyKnown = function (known) {
    var self = this;
    Object.keys(known).forEach(function (id) { if (self.fittings[id]) self.fittings[id].pos = { x: round3(known[id].x), y: round3(known[id].y) }; });
  };

  /* ---------- 1) 在直管上插入阀门/三通，拆段并建立真实接口 ---------- */
  /* 通用拆段：在 segId 上 atDist 处放入带 portsSpec 端口的既有配件 newFitId，
   * 原段拆除、两侧新段接管原端口。供插阀/插三通/延伸自动三通复用。
   * 返回 {ok, segA, segB} 或 {ok:false, reason}。 */
  ConstructionNetwork.prototype._splitSegment = function (segId, atDist, newFitId, portsSpec) {
    var seg = this.segments[segId], newFit = this.fittings[newFitId];
    if (!seg || !newFit) return { ok: false, reason: '管段或配件不存在' };
    if (!fin(atDist) || atDist <= MIN_LEN || atDist >= seg.length - MIN_LEN)
      return { ok: false, reason: '拆分点须在管段内部（距两端 ≥ ' + MIN_LEN + 'm）' };
    var aFit = this.fittings[seg.a.fitting], bFit = this.fittings[seg.b.fitting];
    var dir = seg.dir, caliber = seg.caliber;
    var segAId = 'S' + (++this.seq.seg), segBId = 'S' + (++this.seq.seg);
    // 端口接线：aFit/bFit 原连 seg 的端口 → segA/segB；新配件端口 → 两侧新段
    aFit.ports[seg.a.port].connected = segAId;
    bFit.ports[seg.b.port].connected = segBId;
    var self = this;
    ['p1', 'p2'].forEach(function (pk, i) {
      var port = newFit.ports[pk] || (newFit.ports[pk] = { id: pk, dir: i ? neg(dir) : dir, caliber: caliber, connected: null });
      port.connected = i ? segBId : segAId;
      self.segments[i ? segBId : segAId] = {
        id: i ? segBId : segAId,
        a: i ? { fitting: newFitId, port: pk } : { fitting: seg.a.fitting, port: seg.a.port },
        b: i ? { fitting: seg.b.fitting, port: seg.b.port } : { fitting: newFitId, port: pk },
        length: round3(i ? seg.length - atDist : atDist), dir: dir, caliber: caliber, rigid: seg.rigid, kind: seg.kind
      };
    });
    delete this.segments[segId];
    return { ok: true, segA: segAId, segB: segBId, removedSegment: segId };
  };

  ConstructionNetwork.prototype.insertFittingOnSegment = function (segmentId, distAlong, type, opts) {
    opts = opts || {};
    var seg = this.segments[segmentId];
    if (!seg) return { ok: false, reason: '管段不存在' };
    if (!fin(distAlong)) return { ok: false, reason: '插入距离必须是有限数（拒绝 NaN/Infinity）' };
    if (distAlong <= MIN_LEN || distAlong >= seg.length - MIN_LEN)
      return { ok: false, reason: '插入点须在管段内部（距两端 ≥ ' + MIN_LEN + 'm）' };
    type = type || 'valve';
    if (type !== 'valve' && type !== 'tee') return { ok: false, reason: '仅支持插入阀门或三通' };

    this._checkpoint();
    var aFit = this.fittings[seg.a.fitting];
    var dir = seg.dir, caliber = seg.caliber;
    var point = add(aFit.pos, scale(dir, distAlong));
    var newId = (type === 'valve' ? 'V-N' : 'T-N') + (++this.seq[type === 'valve' ? 'valve' : 'tee']);
    var ports = {};
    ports.p1 = { id: 'p1', dir: dir, caliber: caliber, connected: null };
    ports.p2 = { id: 'p2', dir: neg(dir), caliber: caliber, connected: null };
    if (type === 'tee') {
      // 分支口：默认垂直于主管（工程坐标），初始未连接 → 即「空接口」
      ports.p3 = { id: 'p3', dir: { x: -dir.y, y: dir.x }, caliber: (opts.branchCaliber != null ? opts.branchCaliber : (this.sourceMeta ? caliberMap(this.sourceMeta).branch : caliber)), connected: null };
    }
    this.fittings[newId] = { id: newId, type: type, pos: { x: round3(point.x), y: round3(point.y) }, z: aFit.z, elevation: aFit.elevation, ports: ports };

    var r = this._splitSegment(segmentId, distAlong, newId, ports);
    if (!r.ok) { this._rollback(); return r; }
    return { ok: true, fittingId: newId, segA: r.segA, segB: r.segB, removedSegment: segmentId };
  };

  /* ---------- 2/5) 修改管段长度：接头按新长度移动，相连管道一起随动 ----------
   * 移动端解析优先级：moveFitting（配件 id）> moveEnd（'a'/'b'）> anchor（不动的基准端）
   *   > 自动（优先移动未固定端）。显式指定的移动端若为固定锚点（◆）→ 拒绝并给出解除路径。
   * 随动：自由端平移随行；远端为锚固点时沿锚固管线重新切分（absorbedSegments）；
   *   离开管轴/越过锚固端/闭环尺寸不一致 → 整笔回滚。
   * 返回 { ok, movedFitting, newPos, affectedFittings, absorbedSegments }。 */
  /* 单次改长尝试：移动端按新长度落位 → 传播随动；冲突则整笔回滚（零副作用）。
   * 返回 { ok, movedFitting, newPos, affectedFittings, absorbedSegments,
   *        translatedSegments, releasedFittings } 或 { ok:false, reason, conflict }。 */
  ConstructionNetwork.prototype._applyLenMove = function (segmentId, length, moveEnd) {
    var seg = this.segments[segmentId];
    if (!seg) return { ok: false, reason: '管段不存在' };
    var moveFitId = moveEnd === 'a' ? seg.a.fitting : seg.b.fitting;
    var otherFitId = moveEnd === 'a' ? seg.b.fitting : seg.a.fitting;
    var otherPos = this.fittings[otherFitId].pos;
    var dir = moveEnd === 'b' ? seg.dir : neg(seg.dir);
    var newPos = add(otherPos, scale(dir, length));
    var axis = this._axisGuard(moveFitId, newPos);
    if (axis) return { ok: false, reason: axis.reason, movedFitting: moveFitId,
      conflict: { kind: 'offAxis', seg: segmentId, other: null } };

    this._checkpoint();
    seg.length = round3(length);
    this.fittings[moveFitId].pos = { x: round3(newPos.x), y: round3(newPos.y) };
    var r = this._propagate(moveFitId, newPos);
    if (r.conflict) {
      this._rollback();
      return { ok: false, reason: r.reason, conflict: r, movedFitting: moveFitId };
    }
    this._applyKnown(r.known);
    return {
      ok: true, movedFitting: moveFitId, newPos: this.fittings[moveFitId].pos,
      affectedFittings: r.moved || [], absorbedSegments: r.absorbed || [],
      translatedSegments: r.translated || [], releasedFittings: r.released || []
    };
  };
  ConstructionNetwork.prototype.setSegmentLength = function (segmentId, length, opts) {
    opts = opts || {};
    var seg = this.segments[segmentId];
    if (!seg) return { ok: false, reason: '管段不存在' };
    if (!fin(length)) return { ok: false, reason: '长度必须是有限数（拒绝 NaN/Infinity）' };
    if (!(length > MIN_LEN)) return { ok: false, reason: '管段长度必须大于 ' + MIN_LEN + 'm（零长/负值非法）' };

    var aFixed = this.fixed[seg.a.fitting], bFixed = this.fixed[seg.b.fitting];
    var explicit = (opts.moveFitting != null) || (opts.moveEnd != null) || (opts.anchor != null);

    /* 移动端解析（谁按新长度走，另一端原地作为基准） */
    var moveEnd = null;
    if (opts.moveFitting != null) {
      if (opts.moveFitting === seg.a.fitting) moveEnd = 'a';
      else if (opts.moveFitting === seg.b.fitting) moveEnd = 'b';
      else return { ok: false, reason: 'opts.moveFitting 必须是本管段的端点配件（' + seg.a.fitting + ' / ' + seg.b.fitting + '）' };
    }
    if (opts.moveEnd != null) {
      if (opts.moveEnd !== 'a' && opts.moveEnd !== 'b') return { ok: false, reason: "opts.moveEnd 只能是 'a' 或 'b'" };
      if (moveEnd && moveEnd !== opts.moveEnd) return { ok: false, reason: 'moveFitting 与 moveEnd 指向不同端点，已阻止' };
      moveEnd = opts.moveEnd;
    }
    if (opts.anchor != null) {
      if (opts.anchor !== 'a' && opts.anchor !== 'b') return { ok: false, reason: "opts.anchor 只能是 'a' 或 'b'" };
      var fromAnchor = opts.anchor === 'a' ? 'b' : 'a';
      if (moveEnd && moveEnd !== fromAnchor) return { ok: false, reason: 'anchor 与 moveEnd/moveFitting 自相矛盾（基准端与移动端重合），已阻止' };
      moveEnd = fromAnchor;
    }
    if (!moveEnd) moveEnd = bFixed ? 'a' : 'b';        // 自动：优先移动未固定端

    var moveFitId = moveEnd === 'a' ? seg.a.fitting : seg.b.fitting;
    var otherFitId = moveEnd === 'a' ? seg.b.fitting : seg.a.fitting;
    /* 移动端解析结果为锚点时：**只有硬锚（◆）才是墙** ——
     *  · 硬锚（用户【固定】/水源/施工起点）→ 一律拒绝（隐式、显式都不许当移动端）；
     *  · 图纸锚（◇，fromPlan 折线拐点/链端点）→ 一律**放行尝试**：允许它随下游整链平移
     *    （管长与方向保持不变，下游连接不破）。若几何上确实做不到（相连刚性段拉不动 /
     *    会弯折 / 推过锚固端 / 闭环闭合不上），由 _propagate 给出**真实**冲突原因后再拒绝。
     *    ★ 2026-09-15 修复：不得再用「它是锚点」这种分类理由误报——否则面板提示
     *      写「◇图纸拐点锚 → 允许随动平移」、消息却回「是固定锚点（◆）」，自相矛盾。 */
    if (this._isHardAnchor(moveFitId)) {
      if (this._isHardAnchor(otherFitId)) {
        return { ok: false, reason: '管段两端均为硬固定锚点（◆），改长会拉断连接，已阻止；如需调整请先在配件面板【解除固定】一端' };
      }
      return { ok: false, reason: '指定移动端 ' + moveFitId + ' 是硬固定锚点（◆），已阻止；请先【解除固定】，或改以另一端为基准' };
    }

    /* 第一次尝试：按解析出的移动端推进 */
    var r1 = this._applyLenMove(segmentId, length, moveEnd);
    if (r1.ok) return r1;
    if (explicit) {                    // 用户显式指定了移动端 → 不擅自换成另一端
                                      //   （注意：explicit 只影响此处，**不再**用于锚点分类拒绝）
      r1.reason = r1.reason + this._axisHint(moveFitId);
      return r1;
    }
    /* 自动基准端失败 → 改试另一端（总管/干管改长时「一侧增长、另一侧缩短」的关键路径） */
    var alt = moveEnd === 'a' ? 'b' : 'a';
    var altFit = alt === 'a' ? seg.a.fitting : seg.b.fitting;
    var altTry = { base: alt, fitting: altFit, ok: false, reason: '' };
    if (this._isHardAnchor(altFit)) {
      altTry.reason = altFit + ' 是硬固定锚点（◆），不能作为移动端';
    } else {
      var r2 = this._applyLenMove(segmentId, length, alt);      // 首次尝试已完整回滚 → 重新执行
      if (r2.ok) {
        r2.switchedBase = true;
        r2.blockedBaseEnd = moveEnd;
        r2.blockedBy = (r1.conflict && r1.conflict.other) || null;
        r2.note = '已自动改以另一端（' + altFit + '）为基准端推进' +
          (r2.blockedBy ? '：原方向被 ' + r2.blockedBy + ' 挡住' : '');
        return r2;
      }
      altTry.reason = r2.reason;
      altTry.kind = r2.conflict && r2.conflict.kind;
    }
    r1.reason = r1.reason + this._axisHint(moveFitId) +
      '（已试另一端为基准端，同样无法完成：' + altTry.reason + '）';
    r1.alternatives = [altTry];
    r1.blockedBy = (r1.conflict && r1.conflict.other) || null;
    return r1;
  };
  /* ---------- 6) 修改管段管径（2026-09-15 用户要求：点管段直接改 Ø160→180/220） ----------
   * 只改本段 caliber（PE 外径 mm），并同步本段两端接口的口径（端口只连本段，不影响邻段）。
   * 与相邻段管径不同 = 连接处需要异径（变径）接头，caliberJoints() 供 UI 提示；
   * 引擎不擅自插异径件。runTx 事务内一步撤销。 */
  ConstructionNetwork.prototype.setCaliber = function (segmentId, od) {
    var seg = this.segments[segmentId];
    if (!seg) return { ok: false, reason: '管段不存在' };
    if (!fin(od)) return { ok: false, reason: '管径必须是有限数（mm）' };
    if (od < 16 || od > 1200) return { ok: false, reason: '管径超出合理范围（16–1200mm），已拒绝' };
    this._checkpoint();
    seg.caliber = round3(od);
    var self = this;
    [seg.a, seg.b].forEach(function (end) {
      var F = self.fittings[end.fitting];
      if (F && F.ports[end.port]) F.ports[end.port].caliber = seg.caliber;
    });
    return { ok: true, segmentId: segmentId, caliber: seg.caliber, reducerNeeded: this.caliberJoints(segmentId) };
  };
  /* 与本段两端相连、但管径不同的邻段（= 需要异径接头的位置） */
  ConstructionNetwork.prototype.caliberJoints = function (segmentId) {
    var seg = this.segments[segmentId]; if (!seg) return [];
    var out = [], self = this;
    [seg.a, seg.b].forEach(function (end) {
      Object.keys(self.segments).forEach(function (oid) {
        if (oid === segmentId) return;
        var o = self.segments[oid];
        if ((o.a.fitting === end.fitting || o.b.fitting === end.fitting) &&
            o.caliber != null && seg.caliber != null && o.caliber !== seg.caliber)
          out.push({ fitting: end.fitting, segment: oid, caliber: o.caliber });
      });
    });
    return out;
  };

  /* ---------- 3) 点击空接口新增管道（水平/竖直/直角，工程坐标定义方向） ----------
   * 统一入口校验：接口存在/占用、长度与方向为有限数且在合法范围、口径与接口
   * 一致（不一致拒绝并提示需异径配件，不静默接通）。 */
  ConstructionNetwork.prototype.addBranch = function (fittingId, portId, spec) {
    spec = spec || {};
    var fit = this.fittings[fittingId];
    if (!fit) return { ok: false, reason: '配件不存在' };
    var port = fit.ports[portId];
    if (!port) return { ok: false, reason: '接口不存在' };
    if (port.connected) return { ok: false, reason: '该接口已被占用，不能重复连接' };
    var length = spec.length;
    if (!fin(length)) return { ok: false, reason: '接管长度必须是有限数（拒绝 NaN/Infinity）' };
    if (!(length > MIN_LEN)) return { ok: false, reason: '接管长度必须大于 ' + MIN_LEN + 'm' };
    if (length > 10000) return { ok: false, reason: '接管长度超出合理范围（>10000m）' };

    // 方向：优先显式 dir{x,y}；否则 dirDeg（工程坐标，0=+x 东，90=+y 北）；否则用接口朝向
    var dir;
    if (spec.dir && (spec.dir.x || spec.dir.y)) {
      if (!vecOk(spec.dir)) return { ok: false, reason: '接管方向非法（零向量或非有限数）' };
      dir = unit(spec.dir);
    } else if (spec.dirDeg != null) {
      if (!fin(spec.dirDeg)) return { ok: false, reason: '接管方向角度必须是有限数' };
      var a = spec.dirDeg * Math.PI / 180; dir = { x: Math.cos(a), y: Math.sin(a) };
    } else dir = port.dir;

    // 口径统一校验：显式口径与接口口径不符 → 拒绝并提示需异径配件
    var caliber;
    if (spec.caliber != null) {
      if (!fin(spec.caliber) || spec.caliber <= 0) return { ok: false, reason: '口径必须是正有限数' };
      if (port.caliber != null && spec.caliber !== port.caliber)
        return { ok: false, reason: '口径不匹配（接口 ' + port.caliber + ' ≠ 指定 ' + spec.caliber + '），需要异径配件，未静默接通', needReducer: true };
      caliber = spec.caliber;
    } else caliber = port.caliber;

    this._checkpoint();
    var endId = 'E-N' + (++this.seq.endpoint);
    var endPos = add(fit.pos, scale(dir, length));
    this.fittings[endId] = { id: endId, type: 'endpoint', pos: { x: round3(endPos.x), y: round3(endPos.y) }, z: fit.z, elevation: fit.elevation,
      ports: { p1: { id: 'p1', dir: neg(dir), caliber: caliber, connected: null } } };

    var sid = 'S' + (++this.seq.seg);
    port.connected = sid;
    this.fittings[endId].ports.p1.connected = sid;
    this.segments[sid] = { id: sid, a: { fitting: fittingId, port: portId }, b: { fitting: endId, port: 'p1' }, length: round3(length), dir: dir, caliber: caliber, rigid: true, kind: 'branch' };

    return { ok: true, fittingId: endId, portId: 'p1', segmentId: sid };
  };

  /* ---------- 4/6) 移动配件：自由分支随动、长度不变；固定冲突/离轴弯折拦截 ----------
   * 直管上的阀门/三通受管轴约束：先按相邻管段求轴线，目标位置偏离轴线即拒绝
   * （校验位置，不只比较距离）；随后 _propagate 同时校验位置、方向、长度与
   * 接口朝向，任一不满足整笔回滚。 */
  ConstructionNetwork.prototype.moveFitting = function (fittingId, newPos) {
    if (!this.fittings[fittingId]) return { ok: false, reason: '配件不存在' };
    if (this.fixed[fittingId]) return { ok: false, reason: '该配件已固定，不能移动' };
    if (!newPos || !fin(newPos.x) || !fin(newPos.y)) return { ok: false, reason: '目标位置非法' };

    /* 直管轴向约束（离开原管轴一律拦截；「三通推离主管轴」不得靠下游整链平移绕过） */
    var g = this._axisGuard(fittingId, newPos);
    if (g) return g;

    this._checkpoint();
    this.fittings[fittingId].pos = { x: round3(newPos.x), y: round3(newPos.y) };
    var r = this._propagate(fittingId, newPos);
    if (r.conflict) { this._rollback(); return { ok: false, reason: r.reason }; }
    this._applyKnown(r.known);
    return { ok: true, movedFitting: fittingId, newPos: this.fittings[fittingId].pos,
      affectedFittings: r.moved || [], absorbedSegments: r.absorbed || [],
      translatedSegments: r.translated || [], releasedFittings: r.released || [] };
  };

  /* ---------- 8) 接口连接 / 口径校验 ---------- */
  ConstructionNetwork.prototype.connectPorts = function (refA, refB) {
    var a = this._portOf(refA), b = this._portOf(refB);
    if (!a || !b) return { ok: false, reason: '接口不存在' };
    if (a.fitId === b.fitId) return { ok: false, reason: '不能连接同一配件的两个接口' };
    if (a.port.connected) return { ok: false, reason: '接口 ' + a.fitId + '.' + a.portId + ' 已被占用，不能重复连接' };
    if (b.port.connected) return { ok: false, reason: '接口 ' + b.fitId + '.' + b.portId + ' 已被占用，不能重复连接' };
    var ca = a.port.caliber, cb = b.port.caliber;
    if (ca != null && cb != null && ca !== cb) return { ok: false, reason: '口径不匹配（' + ca + '≠' + cb + '），需要异径配件，未静默接通', needReducer: true };
    this._checkpoint();
    var length = round3(dist(a.fit.pos, b.fit.pos));
    var dir = unit(sub(b.fit.pos, a.fit.pos));
    var sid = 'S' + (++this.seq.seg);
    a.port.connected = sid; b.port.connected = sid;
    this.segments[sid] = { id: sid, a: { fitting: a.fitId, port: a.portId }, b: { fitting: b.fitId, port: b.portId }, length: length, dir: dir, caliber: ca || cb, rigid: true, kind: 'manual' };
    return { ok: true, segmentId: sid };
  };
  ConstructionNetwork.prototype._portOf = function (ref) {
    if (!ref) return null;
    var fit = this.fittings[ref.fitting || ref.fittingId]; if (!fit) return null;
    var pid = ref.port || ref.portId; var port = fit.ports[pid]; if (!port) return null;
    return { fitId: ref.fitting || ref.fittingId, portId: pid, port: port, fit: fit };
  };
  ConstructionNetwork.prototype.disconnect = function (ref) {
    var p = this._portOf(ref); if (!p || !p.port.connected) return { ok: false, reason: '接口未连接' };
    this._checkpoint();
    var sid = p.port.connected, seg = this.segments[sid];
    delete this.segments[sid];
    p.port.connected = null;
    if (seg) {
      var otherRef = (seg.a.fitting === p.fitId && seg.a.port === p.portId) ? seg.b : seg.a;
      var of = this.fittings[otherRef.fitting];
      if (of && of.ports[otherRef.port] && of.ports[otherRef.port].connected === sid) of.ports[otherRef.port].connected = null;
    }
    return { ok: true, segmentId: sid };
  };

  /* ---------- 端口口径 / 删除 ---------- */
  ConstructionNetwork.prototype.setPortCaliber = function (ref, caliber) {
    var p = this._portOf(ref); if (!p) return false;
    if (caliber != null && (!fin(caliber) || caliber <= 0)) return false;
    this._checkpoint(); p.port.caliber = caliber; return true;
  };
  ConstructionNetwork.prototype.removeFitting = function (id) {
    var fit = this.fittings[id]; if (!fit) return { ok: false, reason: '配件不存在' };
    var segs = this.segmentsOf(id);
    var self = this;
    this._checkpoint();
    // v1 允许删除任意配件（配合撤销恢复）；删除时清理对端端口的悬挂引用
    segs.forEach(function (s) {
      delete self.segments[s.id];
      [s.a, s.b].forEach(function (ref) {
        if (ref.fitting === id) return;
        var of = self.fittings[ref.fitting];
        if (of && of.ports[ref.port] && of.ports[ref.port].connected === s.id) of.ports[ref.port].connected = null;
      });
    });
    delete this.fittings[id]; delete this.fixed[id];
    return { ok: true };
  };

  /* ---------- 9) 延伸管道（自动驳接）----------
   * 两段式：planExtend 只算不改（供预览），applyExtend 原子提交。
   * 规则：
   *  - 仅从「未固定的自由端」（叶端点）沿其管段原方向向外延伸，另一端不动。
   *  - 目标命中判定全部用工程坐标：交点不在目标管段范围内、目标平行/反方向
   *    均拒绝；不偷偷延长目标管。
   *  - 中段垂直接入 → 自动三通（直通口=目标口径，分支口=延伸管口径）；
   *    第一版限定同高程、垂直 90° 接入。
   *  - 命中已有节点（工程容差 SNAP_TOL 吸附）：复用其面向 -d 的空接口；接口
   *    被占用/方向不符/口径不符 → 拒绝，不强行生成三通。
   *  - 接到目标端点：同口径直连（共线为对接、相交为弯头）；口径不同拒绝并
   *    提示需异径组合（自动异径配件未实现）。 */
  ConstructionNetwork.prototype.planExtend = function (segId, side, targetSegId) {
    var seg = this.segments[segId], target = this.segments[targetSegId];
    if (!seg) return { ok: false, reason: '管段不存在' };
    if (!target) return { ok: false, reason: '目标管段不存在' };
    if (segId === targetSegId) return { ok: false, reason: '不能延伸到管段自身（会形成闭环）' };
    if (side !== 'a' && side !== 'b') return { ok: false, reason: '延伸端必须是 a 或 b' };
    var endRef = seg[side], endFitId = endRef.fitting;
    var E = this.fittings[endFitId];
    if (!E) return { ok: false, reason: '延伸端配件缺失' };
    if (this.fixed[endFitId]) return { ok: false, reason: '延伸端是固定锚点，不是自由端' };
    if (this.segmentsOf(endFitId).length !== 1 || E.type !== 'endpoint')
      return { ok: false, reason: '延伸起点必须是自由端（单段叶端点），当前配件不符合' };
    /* 几何一致性：端点位置应等于另一端 + 方向×长度 */
    var otherRef = side === 'a' ? seg.b : seg.a;
    var otherPos = this.fittings[otherRef.fitting].pos;
    var d = side === 'b' ? seg.dir : neg(seg.dir);
    /* 几何一致性：延伸端位置应等于另一端 ± 方向×长度（a 端在起点侧） */
    var expect = side === 'b' ? add(otherPos, scale(seg.dir, seg.length))
                              : sub(otherPos, scale(seg.dir, seg.length));
    if (dist(E.pos, expect) > 1e-3) return { ok: false, reason: '管段几何与记录不一致，请先校验模型' };
    /* 真实工程高程（与显示层高 z 严格分离）：未确认不得默认 0 / 继承显示层高 */
    var eE = E.elevation, eT = this.fittings[target.a.fitting].elevation;
    if (eE == null || eT == null)
      return { ok: false, reason: '延伸管或目标管真实高程未确认（标记为「未确认」），请先在左栏确认管段真实高程后再操作' };
    if (Math.abs(eE - eT) > 1e-6)
      return { ok: false, reason: '延伸管与目标管真实高程不同（' + eE + ' ≠ ' + eT + '），第一版不支持直接接通（真实竖向/偏移接管未实现）', differentElevation: true };

    var TA = this.fittings[target.a.fitting].pos, TB = this.fittings[target.b.fitting].pos;
    var u = target.dir;

    /* 1) 节点吸附：延伸端已在某配件 SNAP_TOL 内 → 复用其空接口 */
    var nearFit = null, nearD = Infinity;
    var self = this;
    Object.keys(this.fittings).forEach(function (id) {
      if (id === endFitId) return;
      var dd = dist(self.fittings[id].pos, E.pos);
      if (dd <= SNAP_TOL && dd < nearD) { nearFit = id; nearD = dd; }
    });
    if (nearFit) {
      var nfFit = this.fittings[nearFit];
      if (nfFit.type === 'endpoint' && this.segmentsOf(nearFit).length === 1)
        return this._finalizeExtend(this._planEndpointJoin(seg, side, nearFit, E, d, dist(E.pos, nfFit.pos)), seg, target, E, d, dist(E.pos, nfFit.pos));
      return this._finalizeExtend(this._planNodeJoin(seg, side, nearFit, d), seg, target, E, d, dist(E.pos, nfFit.pos));
    }

    /* 2) 射线求交：E + t·d = TA + s·u */
    var denom = cross(d, u);
    if (Math.abs(denom) < ANG_TOL) {
      /* 平行：共线且目标端点在前方 → 端点对接（取最近端点，只填缺口不重叠）；
       * 延伸端落在目标管段跨度内 / 反方向 → 拒绝。 */
      var coll = Math.abs(cross(sub(TA, E.pos), d)) < 1e-6 * Math.max(1, seg.length);
      if (!coll) return { ok: false, reason: '延伸方向与目标管平行，不相交，已拒绝' };
      var tC1 = dot(sub(TA, E.pos), d), tC2 = dot(sub(TB, E.pos), d);
      var tMin = Math.min(tC1, tC2), tMax = Math.max(tC1, tC2);
      if (tMin > MIN_LEN) {
        var nearEnd = tC1 < tC2 ? 'a' : 'b';
        return this._finalizeExtend(this._planEndpointJoin(seg, side, target[nearEnd].fitting, E, d, tMin), seg, target, E, d, tMin);
      }
      if (tMax > MIN_LEN) return { ok: false, reason: '延伸端已落在目标管段轴线上（共线重叠），已拒绝' };
      return { ok: false, reason: '目标在延伸的反方向，无法延伸' };
    }
    var t = cross(sub(TA, E.pos), u) / denom;     // 沿 d 的距离
    var s = cross(sub(TA, E.pos), d) / denom;     // 沿目标的距离
    if (t <= MIN_LEN) return { ok: false, reason: '目标在延伸的反方向或就在起点处，已拒绝' };
    if (s < -SNAP_TOL || s > target.length + SNAP_TOL)
      return { ok: false, reason: '交点不在目标管段范围内（不偷偷延长目标管），已拒绝' };
    /* 命中点附近已有配件（工程吸附容差内）→ 优先复用其空接口，不生成重复节点 */
    var hit0 = add(E.pos, scale(d, t));
    var hitFit = null, hitFd = Infinity;
    Object.keys(this.fittings).forEach(function (id) {
      if (id === endFitId) return;
      var dd = dist(self.fittings[id].pos, hit0);
      if (dd <= SNAP_TOL && dd < hitFd) { hitFit = id; hitFd = dd; }
    });
    if (hitFit) {
      var hfFit = this.fittings[hitFit];
      if (hfFit.type === 'endpoint' && this.segmentsOf(hitFit).length === 1)
        return this._finalizeExtend(this._planEndpointJoin(seg, side, hitFit, E, d, dist(E.pos, hfFit.pos)), seg, target, E, d, dist(E.pos, hfFit.pos));
      return this._finalizeExtend(this._planNodeJoin(seg, side, hitFit, d), seg, target, E, d, dist(E.pos, hfFit.pos));
    }
    /* 端点吸附：交点贴近目标端点 → 端点对接 */
    if (s <= SNAP_TOL || s >= target.length - SNAP_TOL)
      return this._finalizeExtend(this._planEndpointJoin(seg, side, target[s <= SNAP_TOL ? 'a' : 'b'].fitting, E, d, t), seg, target, E, d, t);
    /* 中段接入：第一版限定垂直 90°、同高程 */
    if (Math.abs(dot(d, u)) > ANG_TOL)
      return { ok: false, reason: '第一版自动三通仅支持同高程垂直接入（延伸方向与目标管不垂直），已拒绝' };
    var hit = add(E.pos, scale(d, t));
    /* 注意：teeId 不在规划阶段分配（预览无副作用）；由 applyExtend 在提交时生成 */
    return {
      ok: true, mode: 'tee', seg: segId, side: side, target: targetSegId,
      extendLen: round3(t), splitAt: round3(s), hit: { x: round3(hit.x), y: round3(hit.y) },
      teeId: null, calibers: { run: target.caliber, branch: seg.caliber },
      summary: '延伸 ' + round3(t) + 'm 接入 ' + targetSegId + '，切目标为两段并生成三通（' +
        (target.caliber != null ? 'Ø' + target.caliber : '?') + '×' + (target.caliber != null ? 'Ø' + target.caliber : '?') + '×' +
        (seg.caliber != null ? 'Ø' + seg.caliber : '?') + '）'
    };
  };
  /* 中途交点检测 + 计划收口（Fix 3 / Fix 5 共用） */
  ConstructionNetwork.prototype._finalizeExtend = function (plan, seg, target, E, d, pathLen) {
    if (!plan.ok) return plan;
    var ob = this._midObstruction(E.pos, d, pathLen, [seg.id, target.id], plan.hit, E.elevation);
    if (ob) {
      if (ob.differentElevation) {
        plan.crossingNote = '中途与 ' + ob.segId + ' 为不同确认高程的空间交叉（非连接），已放行；延伸仍只接入目标管';
        return plan;
      }
      return { ok: false, reason: '中途在 (' + round3(ob.pt.x) + ',' + round3(ob.pt.y) + ') 处与 ' + ob.segId + ' 同层相交，第一版阻止直接延伸；请先处理该交点或选择该管为目标', midObstruction: true };
    }
    return plan;
  };
  ConstructionNetwork.prototype._midObstruction = function (from, dir, length, excludeSegIds, hitPt, eE) {
    var self = this, exSet = {}; excludeSegIds.forEach(function (id) { exSet[id] = true; });
    var best = null;
    Object.keys(this.segments).forEach(function (sid) {
      if (exSet[sid]) return;
      var s = self.segments[sid];
      var A = self.fittings[s.a.fitting].pos, B = self.fittings[s.b.fitting].pos;
      var xi = self._segIntersect(from, add(from, scale(dir, length)), A, B);
      if (!xi) return;
      if (xi.t <= 1e-6 || xi.t >= 1 - 1e-6) return;   // 排除延伸起点与接入点
      if (xi.s <= 1e-6 || xi.s >= 1 - 1e-6) return;   // 排除被穿管自身端点
      /* 高程判定：未知或等于延伸高程 → 同层阻挡；确认不同 → 空间交叉放行 */
      var eO = self.fittings[s.a.fitting].elevation;
      var diff = (eO != null && eE != null) ? Math.abs(eO - eE) > 1e-6 : false;
      if (best && best.differentElevation && !diff) { /* 优先报同层阻挡 */ }
      best = { segId: sid, pt: xi.pt, differentElevation: diff };
    });
    return best;
  };
  /* 节点复用计划：延伸端接到已有配件面向 -d 的空接口（口径一致才允许） */
  ConstructionNetwork.prototype._planNodeJoin = function (seg, side, fitId, d) {
    var F = this.fittings[fitId];
    var pid = Object.keys(F.ports).find(function (p) {
      var pt = F.ports[p];
      return !pt.connected && dot(pt.dir, d) < -0.99;
    });
    if (pid == null)
      return { ok: false, reason: '交点处已有配件 ' + fitId + '，但其空接口方向不符或已被占用，已拒绝（不重复生成配件）' };
    var fp = F.ports[pid];
    if (seg.caliber != null && fp.caliber != null && seg.caliber !== fp.caliber)
      return { ok: false, reason: '口径不匹配（' + seg.caliber + ' ≠ ' + fp.caliber + '），需要异径配件，未静默接通', needReducer: true };
    var extLen = dist(this.fittings[seg[side].fitting].pos, F.pos);
    return { ok: true, mode: 'node', seg: seg.id, side: side, targetFitting: fitId, port: pid,
      extendLen: round3(extLen), hit: { x: round3(F.pos.x), y: round3(F.pos.y) }, calibers: { ext: seg.caliber, node: fp.caliber } };
  };
  /* 端点对接计划：接到普通自由管端（单段叶端点补口/共线对接/相交弯头），不强行生成三通。
   * 多接口配件（阀门/三通）只复用其面向 -d 的空接口（_planNodeJoin），不额外增口。 */
  ConstructionNetwork.prototype._planEndpointJoin = function (seg, side, endFitId, E, d, extLen) {
    var F = this.fittings[endFitId];
    if (!F) return { ok: false, reason: '目标端点配件缺失' };
    /* 优先：已有面向 -d 的空接口 → 复用（如多接口配件的空口/分支口） */
    var reuse = this._planNodeJoin(seg, side, endFitId, d);
    if (reuse.ok || reuse.needReducer) return reuse;
    /* 普通自由管端（单段叶端点）→ 增端口对接（共线=对接，相交=弯头表达） */
    if (F.type === 'endpoint' && this.segmentsOf(endFitId).length === 1) {
      var existPort = F.ports[Object.keys(F.ports)[0]];
      var calF = existPort ? existPort.caliber : null;
      if (seg.caliber != null && calF != null && seg.caliber !== calF)
        return { ok: false, reason: '接到管端口径不匹配（' + seg.caliber + ' ≠ ' + calF + '），需接头/弯头/异径组合，第一版不强行生成，已拒绝', needReducer: true };
      return { ok: true, mode: 'endpoint', seg: seg.id, side: side, targetFitting: endFitId,
        extendLen: round3(extLen), hit: { x: round3(F.pos.x), y: round3(F.pos.y) }, calibers: { ext: seg.caliber, node: calF },
        summary: '延伸 ' + round3(extLen) + 'm 对接到目标端点 ' + endFitId + '（不生成三通）' };
    }
    return { ok: false, reason: '目标端点 ' + endFitId + ' 已连接 ' + this.segmentsOf(endFitId).length + ' 根管且无可用空接口，已拒绝' };
  };
  /* 应用延伸计划（原子；调用方负责 beginEdit/commitEdit 或由本方法自带 checkpoint） */
  ConstructionNetwork.prototype.applyExtend = function (plan) {
    if (!plan || !plan.ok) return { ok: false, reason: '延伸计划无效' };
    var seg = this.segments[plan.seg];
    if (!seg) return { ok: false, reason: '管段不存在（模型已变化）' };
    var E = this.fittings[seg[plan.side].fitting];
    if (!E) return { ok: false, reason: '延伸端配件缺失' };
    var self = this;
    /* 预览后模型可能已变化：重算计划并比对关键参数，不符则拒绝旧计划（要求重新预览），不残留半连接 */
    if (!this._stalePlan(plan, seg, E))
      return { ok: false, reason: '预览后模型已变化（管段/高程/交点改变），旧计划已失效，请重新预览', stale: true };
    if (!this._tx) this._checkpoint();
    /* 公共：延伸段变长，末端改接到目标节点/三通，删除原叶端点配件 */
    function absorbInto(fitId, portId) {
      seg.length = round3(seg.length + plan.extendLen);
      seg[plan.side] = { fitting: fitId, port: portId };
      self.fittings[fitId].ports[portId].connected = seg.id;
      delete self.fittings[E.id];
    }
    if (plan.mode === 'node') {
      absorbInto(plan.targetFitting, plan.port);
      var F2 = this.fittings[plan.targetFitting];
      var segs2 = this.segmentsOf(plan.targetFitting);
      if (F2.type === 'endpoint' && segs2.length === 2 &&
          Math.abs(segs2[0].dir.x * segs2[1].dir.y - segs2[0].dir.y * segs2[1].dir.x) > ANG_TOL) F2.type = 'elbow';
      return { ok: true, mode: 'node', fittingId: plan.targetFitting, segmentId: seg.id };
    }
    if (plan.mode === 'endpoint') {
      var F = this.fittings[plan.targetFitting];
      var n = 1; while (F.ports['p' + n]) n++;
      /* 新端口朝向：指向延伸自由端 E（d = side==='b'?seg.dir:neg(seg.dir)，端口朝 -d） */
      var portDir = (plan.side === 'b') ? neg(seg.dir) : seg.dir;
      F.ports['p' + n] = { id: 'p' + n, dir: portDir, caliber: seg.caliber, connected: null, elevation: F.elevation };
      absorbInto(plan.targetFitting, 'p' + n);
      var segs3 = this.segmentsOf(plan.targetFitting);
      if (F.type === 'endpoint' && segs3.length === 2 &&
          Math.abs(segs3[0].dir.x * segs3[1].dir.y - segs3[0].dir.y * segs3[1].dir.x) > ANG_TOL) F.type = 'elbow';
      return { ok: true, mode: 'endpoint', fittingId: plan.targetFitting, segmentId: seg.id };
    }
    if (plan.mode === 'tee') {
      var target = this.segments[plan.target];
      if (!target) return { ok: false, reason: '目标管段不存在（模型已变化）' };
      /* 提交时才分配稳定 ID（预览阶段不占用 seq） */
      var teeId = 'T-N' + (++this.seq.tee);
      var hitFit = this.fittings[teeId] || (this.fittings[teeId] = { id: teeId, type: 'tee', pos: { x: plan.hit.x, y: plan.hit.y }, z: E.z, elevation: E.elevation, ports: {} });
      var u = target.dir, d = plan.side === 'b' ? seg.dir : neg(seg.dir);
      hitFit.ports.p1 = { id: 'p1', dir: u, caliber: target.caliber, connected: null };
      hitFit.ports.p2 = { id: 'p2', dir: neg(u), caliber: target.caliber, connected: null };
      hitFit.ports.p3 = { id: 'p3', dir: neg(d), caliber: seg.caliber, connected: null };
      var r = this._splitSegment(plan.target, plan.splitAt, teeId, hitFit.ports);
      if (!r.ok) { this._rollback(); return r; }
      absorbInto(teeId, 'p3');
      return { ok: true, mode: 'tee', fittingId: teeId, segmentId: seg.id, segA: r.segA, segB: r.segB };
    }
    return { ok: false, reason: '未知延伸模式' };
  };
  /* 判断预览计划是否仍适用于当前已提交模型（纯函数，不修改模型） */
  ConstructionNetwork.prototype._stalePlan = function (plan, seg, E) {
    if (plan.target) {
      var live = this.planExtend(plan.seg, plan.side, plan.target);
      return !!(live.ok && live.mode === plan.mode &&
        Math.abs((live.extendLen || 0) - (plan.extendLen || 0)) < 1e-6 &&
        Math.abs((live.splitAt || 0) - (plan.splitAt || 0)) < 1e-6 &&
        (live.hit ? live.hit.x : 0) === (plan.hit ? plan.hit.x : 0) &&
        (live.hit ? live.hit.y : 0) === (plan.hit ? plan.hit.y : 0));
    }
    if (plan.mode === 'node') {
      var pid = this._planNodeJoin(seg, plan.side, plan.targetFitting,
        (plan.side === 'b') ? seg.dir : neg(seg.dir));
      return !!(pid && pid.ok);
    }
    if (plan.mode === 'endpoint') {
      var ef = this.fittings[plan.targetFitting];
      return !!(ef && ef.type === 'endpoint' && this.segmentsOf(plan.targetFitting).length === 1);
    }
    return false;
  };

  /* ---------- 修剪几何辅助 ---------- */
  ConstructionNetwork.prototype._projOnSeg = function (A, B, P) {
    var ab = sub(B, A), L2 = dot(ab, ab);
    if (L2 < EPS) return { onSeg: false };
    var t = dot(sub(P, A), ab) / L2;
    var pt = add(A, scale(ab, Math.max(0, Math.min(1, t))));
    return { t: t, pt: pt, onSeg: t > 1e-9 && t < 1 - 1e-9 };
  };
  /* 两线段相交（工程坐标，统一容差）；返回 {pt,t,s} 或 null（平行/无交点/交点在任一线段外） */
  ConstructionNetwork.prototype._segIntersect = function (A, B, C, D) {
    var r = sub(B, A), q = sub(D, C), den = cross(r, q);
    if (Math.abs(den) < 1e-9) return null;
    var ac = sub(C, A);
    var t = cross(ac, q) / den, s = cross(ac, r) / den;
    if (t < -1e-9 || t > 1 + 1e-9 || s < -1e-9 || s > 1 + 1e-9) return null;
    return { pt: add(A, scale(r, Math.max(0, Math.min(1, t)))), t: t, s: s };
  };
  ConstructionNetwork.prototype._elevCompatible = function (id1, id2) {
    var f1 = this.fittings[id1], f2 = this.fittings[id2];
    if (!f1 || !f2) return false;
    var e1 = f1.elevation, e2 = f2.elevation;
    if (e1 == null || e2 == null) return false;
    return Math.abs(e1 - e2) <= 1e-6;
  };
  /* ---------- 10) 修剪管道 ----------
   * 第一版：单段修剪——从边界配件出发，去掉所选一侧通向「自由叶端点」的那一段。
   * 不隐式驳接、不生成三通、不把三通替换成直通；边界配件保留并释放接口。
   * 远端不是自由叶端点（还有其他连接/是配件/被固定）→ 拒绝并给出完整影响范围。 */
  ConstructionNetwork.prototype.planTrim = function (boundaryRef, segId, opts) {
    opts = opts || {};
    var seg = this.segments[segId];
    if (!seg) return { ok: false, reason: '管段不存在' };
    var boundarySeg = this.segments[boundaryRef];
    var boundaryFit = boundarySeg ? null : this.fittings[boundaryRef];
    if (!boundarySeg && !boundaryFit) return { ok: false, reason: '边界配件/管段不存在' };
    var A = this.fittings[seg.a.fitting].pos, B = this.fittings[seg.b.fitting].pos;
    var len = seg.length;
    var P = null, tA = null, isEndBoundary = false;
    var elevRef = null;
    if (boundarySeg) {
      var C = this.fittings[boundarySeg.a.fitting].pos, D = this.fittings[boundarySeg.b.fitting].pos;
      var xi = this._segIntersect(A, B, C, D);
      if (!xi) return { ok: false, reason: '所选边界管与待修剪管无交点（不暗中延长边界管），已拒绝' };
      P = xi.pt; tA = xi.t;
      elevRef = boundarySeg.a.fitting;
      // 高程一致性在越过端点边界后统一判定（端点边界即本段端点，无需高程判定）
    } else {
      P = { x: boundaryFit.pos.x, y: boundaryFit.pos.y };
      var proj = this._projOnSeg(A, B, P);
      tA = proj.t;
      if (tA <= 1e-6 || tA >= len - 1e-6) isEndBoundary = true;
      else if (!proj.onSeg) return { ok: false, reason: '边界节点不在待修剪管段上（交点在管段外），已拒绝' };
      elevRef = boundaryFit.id;
      // 高程一致性在越过端点边界后统一判定
    }
    /* 边界恰为所选管段的端点 → 保留原「删除相邻整段自由支管」行为 */
    if (isEndBoundary) {
      var farRef2 = seg.a.fitting === boundaryRef ? seg.b : seg.a;
      var far = this.fittings[farRef2.fitting];
      if (!far) return { ok: false, reason: '远端配件缺失' };
      var deg = this.segmentsOf(far.id).length;
      if (deg > 1 || far.type !== 'endpoint') {
        var affected = [];
        if (far.type !== 'endpoint') affected.push(({ valve: '阀门', tee: '三通', 'tee-front': '总管三通', elbow: '弯头', reducer: '异径接头', cap: '封堵', source: '水源', endpoint: '端点' }[far.type] || far.type) + ' ' + far.id);
        this.segmentsOf(far.id).forEach(function (s) { if (s.id !== segId) affected.push('管段 ' + s.id); });
        if (this.fixed[far.id]) affected.push('固定锚点 ' + far.id);
        return { ok: false, reason: '修剪将连带影响：' + affected.join('、') + '。第一版仅支持单段修剪到自由端，已阻止（不会静默连带删除）' };
      }
      if (this.fixed[far.id]) return { ok: false, reason: '远端 ' + far.id + ' 是固定锚点，修剪将移除固定约束，已阻止' };
      return { ok: true, mode: 'branch', seg: segId, farFitting: far.id, boundaryPort: seg.a.fitting === boundaryRef ? seg.a.port : seg.b.port,
        summary: '修剪管段 ' + segId + '（' + seg.length.toFixed(1) + 'm）及自由端 ' + far.id + '，边界 ' + boundaryRef + ' 保留' };
    }
    /* 中段/交叉截断：需确认两管真实高程相同（未确认则无法判定可截断，已拒绝） */
    if (!this._elevCompatible(seg.a.fitting, elevRef))
      return { ok: false, reason: '边界与待修剪管真实高程未知或不同（无法确认同层截断），请先确认两管高程', incompatible: true };
    /* 中段截断（边界为另一根管，或所选管段上的内部节点） */
    /* tA 为交点在管段上的归一化参数(0..1)，换算为实际拆分距离(米)供 _splitSegment 使用 */
    var tLen = round3(tA * len);
    if (tLen <= MIN_LEN || tLen >= len - MIN_LEN)
      return { ok: false, reason: '交点过于靠近端点（' + tLen + 'm / 总长 ' + round3(len) + 'm），无有效修剪，已拒绝' };
    var keep = (opts.keep === 'a' || opts.keep === 'b') ? opts.keep : 'a';
    var removedSideEnd = (keep === 'a') ? seg.b.fitting : seg.a.fitting;
    if (this.fixed[removedSideEnd]) return { ok: false, reason: '被修剪侧末端 ' + removedSideEnd + ' 为固定锚点，修剪将移除约束，已阻止' };
    if (this.segmentsOf(removedSideEnd).length !== 1) {
      var aff = []; this.segmentsOf(removedSideEnd).forEach(function (s) { if (s.id !== segId) aff.push('管段 ' + s.id); });
      return { ok: false, reason: '被修剪侧连带影响：' + (aff.join('、') || '其他连接') + '。第一版仅支持单一直管截断，已阻止（不会静默删除）', cascade: true };
    }
    return { ok: true, mode: 'cut', seg: segId, boundaryRef: boundaryRef, boundaryKind: boundarySeg ? 'segment' : 'fitting', keep: keep, tA: tLen, P: { x: round3(P.x), y: round3(P.y) }, removedEnd: removedSideEnd,
      summary: '在交点 (' + round3(P.x) + ',' + round3(P.y) + ') 截断 ' + segId + '，保留 ' + keep + ' 端侧，删除另一侧自由端 ' + removedSideEnd };
  };
  ConstructionNetwork.prototype.applyTrim = function (plan) {
    if (!plan || !plan.ok) return { ok: false, reason: '修剪计划无效' };
    if (plan.mode === 'cut') return this._applyTrimCut(plan);
    var seg = this.segments[plan.seg], far = this.fittings[plan.farFitting];
    if (!seg || !far) return { ok: false, reason: '模型已变化，请重新预览' };
    if (!this._tx) this._checkpoint();
    var boundaryFit = this.fittings[seg.a.fitting === plan.farFitting ? seg.b.fitting : seg.a.fitting];
    var boundaryPortRef = seg.a.fitting === plan.farFitting ? seg.b : seg.a;
    delete this.segments[seg.id];
    if (boundaryFit && boundaryFit.ports[boundaryPortRef.port] && boundaryFit.ports[boundaryPortRef.port].connected === seg.id)
      boundaryFit.ports[boundaryPortRef.port].connected = null;   // 释放边界接口（配件保留）
    delete this.fittings[far.id]; delete this.fixed[far.id];
    return { ok: true, removedSegment: seg.id, removedFitting: far.id };
  };
  /* 边界管截断：在交点处把所选管切成两段，仅删选中侧，保留另一侧长度/口径/材质/系统，
   * 新截断点为自由端（不生成三通/驳接）；全部引用更新为单事务，失败完整回滚。 */
  ConstructionNetwork.prototype._applyTrimCut = function (plan) {
    var seg = this.segments[plan.seg];
    if (!seg) return { ok: false, reason: '模型已变化，请重新预览' };
    if (!this._tx) this._checkpoint();
    var Apos = this.fittings[seg.a.fitting].pos, Bpos = this.fittings[seg.b.fitting].pos;
    var P = plan.P;
    var dirA = unit(sub(P, Apos));                 // A -> P 方向
    var newFitId = 'E-N' + (++this.seq.endpoint);
    var ports = { p1: { id: 'p1', dir: dirA, caliber: seg.caliber, connected: null },
                  p2: { id: 'p2', dir: neg(dirA), caliber: seg.caliber, connected: null } };
    this.fittings[newFitId] = { id: newFitId, type: 'endpoint', pos: { x: round3(P.x), y: round3(P.y) },
      z: this.fittings[seg.a.fitting].z, elevation: this.fittings[seg.a.fitting].elevation, ports: ports };
    var r = this._splitSegment(plan.seg, plan.tA, newFitId, ports);
    if (!r.ok) { this._rollback(); return r; }
    /* 删除选中侧（被切掉的子段与其远端自由端） */
    var delSegId = (plan.keep === 'a') ? r.segB : r.segA;
    var newFit = this.fittings[newFitId];
    ['p1', 'p2'].forEach(function (pk) { if (newFit.ports[pk] && newFit.ports[pk].connected === delSegId) newFit.ports[pk].connected = null; });
    delete this.segments[delSegId];
    var farId = plan.removedEnd;
    var farFit = this.fittings[farId];
    if (farFit) {
      Object.keys(farFit.ports).forEach(function (pk) { if (farFit.ports[pk].connected === delSegId) farFit.ports[pk].connected = null; });
      delete this.fittings[farId]; delete this.fixed[farId];
    }
    return { ok: true, mode: 'cut', removedSegment: delSegId, removedFitting: farId, newEndpoint: newFitId, keptSegment: (plan.keep === 'a') ? r.segA : r.segB };
  };

  /* =====================================================================
   * 逐件接管（按真实施工顺序装配）：新建起始管道 + 从空接口继续连接
   * ---------------------------------------------------------------------
   * 与既有延伸/修剪共用两段式纪律：
   *  - planStartPipe / planConnect 只算不改（预览零副作用，不占 seq/ID）；
   *  - applyStartPipe / applyConnect 原子提交（事务内 = 一步撤销）；
   *  - 提交前按 plan 快照复核源配件位置/接口，模型已变化即拒绝（stale）。
   * 接口（Port）v2 扩展字段（老存档载入自动迁移补齐）：
   *  - system   口径体系（'PE-外径' / 'DN-内径' / null=未标注）
   *  - material 材质体系（'PE100' / null）；conn 连接方式（'热熔对接' / null）
   *  - kind     口性质（'straight' 直通 / 'branch' 分支 / null）
   *  - 「对接接口」由管段 a/b 引用推导（单一事实来源），用 portInfo 读取。
   * 配件 v2 扩展：productId（目录型号 id）、placeholder（本体占位长度，米）。
   * 固定接口数契约：阀门/弯头/异径=2、三通=3、封堵=1（validate 巡检装配件）。
   * 方向规则（工程坐标）：三通分支口必须垂直于直通轴；弯头出口与来流夹角
   * 必须等于产品固定角度（45°/90°）；阀门/异径/封堵沿现有接口方向。
   * 长度语义：length=节点中心距；对接产生 kind='joint' 接头段（刚性，
   * 长=两端各占本体占位之半）；接管段 piece=管件净长；
   * computeStats 给出 中心线总长/占位合计/下料参考（估算，非下料单）。
   * ===================================================================== */

  var CAT = (typeof window !== 'undefined' && window.RyCatalog) ||
            (typeof globalThis !== 'undefined' && globalThis.RyCatalog) || (typeof require !== 'undefined' ? require('./product-catalog.js') : null);

  function seqOf(net, key) { if (!net.seq[key]) net.seq[key] = 0; return ++net.seq[key]; }
  function dirFromSpec(spec, fallback) {
    if (spec && spec.dir && (spec.dir.x || spec.dir.y)) {
      if (!vecOk(spec.dir)) return null;
      return unit(spec.dir);
    }
    /* 角度别名：dirDeg / branchDirDeg（三通分支）/ outDirDeg（弯头出口） */
    var dg = spec ? (spec.dirDeg != null ? spec.dirDeg
      : spec.branchDirDeg != null ? spec.branchDirDeg
      : spec.outDirDeg) : null;
    if (dg != null) {
      if (!fin(dg)) return null;
      var a = dg * Math.PI / 180;
      return { x: Math.cos(a), y: Math.sin(a) };
    }
    return fallback || null;
  }
  function degOf(d) { return Math.round(Math.atan2(d.y, d.x) * 180 / Math.PI * 1000) / 1000; }
  /* 体系/连接方式相容：双方都标注时必须一致，任一未标注放行（UI 提示补标） */
  function sysCompatible(a, b) {
    if (a.system && b.system && a.system !== b.system) return false;
    if (a.conn && b.conn && a.conn !== b.conn) return false;
    return true;
  }
  var CONN_NAME = { valve: '阀门', reducer: '异径接头', cap: '封堵', tee: '三通', elbow: '弯头' };

  /* 接口详情（含对接接口推导），供左栏展示 */
  ConstructionNetwork.prototype.portInfo = function (fittingId, portId) {
    var fit = this.fittings[fittingId]; if (!fit) return null;
    var p = fit.ports[portId]; if (!p) return null;
    var sid = p.connected, mate = null, seg = sid ? this.segments[sid] : null;
    if (seg) {
      if (seg.a.fitting === fittingId && seg.a.port === portId) mate = { fitting: seg.b.fitting, port: seg.b.port };
      else mate = { fitting: seg.a.fitting, port: seg.a.port };
    }
    return {
      fitting: fittingId, port: portId, type: fit.type,
      dir: p.dir ? { x: p.dir.x, y: p.dir.y } : null,
      dirDeg: p.dir ? degOf(p.dir) : null,
      caliber: p.caliber, system: p.system || null, material: p.material || null,
      conn: p.conn || null, portKind: p.kind || null,
      connected: !!sid, segmentId: sid || null, segmentKind: seg ? seg.kind : null,
      mate: mate,
      product: fit.productId ? (CAT ? CAT.get(fit.productId) : null) : null,
      placeholder: fin(fit.placeholder) ? fit.placeholder : 0
    };
  };

  /* ---------- A) 新建起始管道（两段式） ----------
   * spec: { modelId?, caliber?, system?, material?, conn?,
   *         start:{x,y}, dir|dirDeg, length, kind? }
   * 起点建为固定锚点（施工起点），终点为自由端。 */
  ConstructionNetwork.prototype.planStartPipe = function (spec) {
    spec = spec || {};
    var cat = null;
    if (spec.modelId) {
      if (!CAT) return { ok: false, reason: '型号目录模块（product-catalog.js）未加载' };
      cat = CAT.get(spec.modelId);
      if (!cat) return { ok: false, reason: '目录中无型号 ' + spec.modelId };
      if (cat.type !== 'pipe') return { ok: false, reason: '起始管道须选择管材型号' };
    }
    var caliber = cat ? cat.calibers[0].caliber : spec.caliber;
    if (!fin(caliber) || caliber <= 0) return { ok: false, reason: '口径必须是正数' };
    if (!spec.start || !fin(spec.start.x) || !fin(spec.start.y)) return { ok: false, reason: '起点坐标非法' };
    var dir = dirFromSpec(spec, null);
    if (!dir) return { ok: false, reason: '方向非法（需 dir{x,y} 或 dirDeg）' };
    var length = spec.length;
    if (!fin(length) || !(length > MIN_LEN)) return { ok: false, reason: '长度必须大于 ' + MIN_LEN + 'm' };
    if (length > 10000) return { ok: false, reason: '长度超出合理范围（>10000m）' };
    var end = add(spec.start, scale(dir, length));
    return { ok: true, mode: 'start',
      start: { x: round3(spec.start.x), y: round3(spec.start.y) },
      end: { x: round3(end.x), y: round3(end.y) },
      dir: dir, dirDeg: degOf(dir), length: round3(length), caliber: caliber,
      system: cat ? cat.calibers[0].system : (spec.system || null),
      material: cat ? cat.material : (spec.material || null),
      conn: cat ? cat.calibers[0].conn : (spec.conn || null),
      modelId: spec.modelId || null,
      summary: '新建起始管道 ' + (caliber ? 'Ø' + caliber : '?') + ' × ' + round3(length) + 'm，方向 ' + degOf(dir) + '°' };
  };
  ConstructionNetwork.prototype.applyStartPipe = function (plan) {
    if (!plan || !plan.ok || plan.mode !== 'start') return { ok: false, reason: '起始管道计划无效' };
    var live = this.planStartPipe(plan);
    if (!live.ok || live.end.x !== plan.end.x || live.end.y !== plan.end.y)
      return { ok: false, reason: '预览后参数已变化，请重新预览', stale: true };
    if (!this._tx) this._checkpoint();
    var aId = 'E-N' + seqOf(this, 'endpoint'), bId = 'E-N' + seqOf(this, 'endpoint');
    function mkPort(dir) { return { id: 'p1', dir: dir, caliber: plan.caliber, connected: null,
      system: plan.system || null, material: plan.material || null, conn: plan.conn || null, kind: 'straight' }; }
    this.fittings[aId] = { id: aId, type: 'endpoint', pos: { x: plan.start.x, y: plan.start.y },
      z: 0, elevation: null, productId: plan.modelId, placeholder: 0, ports: { p1: mkPort(plan.dir) } };
    this.fittings[bId] = { id: bId, type: 'endpoint', pos: { x: plan.end.x, y: plan.end.y },
      z: 0, elevation: null, productId: plan.modelId, placeholder: 0, ports: { p1: mkPort(neg(plan.dir)) } };
    this.fixed[aId] = true;                       // 施工起点 = 锚点
    var sid = 'S' + seqOf(this, 'seg');
    this.fittings[aId].ports.p1.connected = sid;
    this.fittings[bId].ports.p1.connected = sid;
    this.segments[sid] = { id: sid, a: { fitting: aId, port: 'p1' }, b: { fitting: bId, port: 'p1' },
      length: plan.length, dir: plan.dir, caliber: plan.caliber, rigid: true,
      kind: plan.kind || 'manual', piece: plan.length,
      system: plan.system || null, material: plan.material || null, conn: plan.conn || null,
      productId: plan.modelId };
    this.assemblyLog.push({ kind: 'start', text: plan.summary });
    return { ok: true, fittingA: aId, fittingB: bId, segmentId: sid };
  };

  /* ---------- B) 从空接口继续连接（两段式） ----------
   * choice: 'pipe'|'tee'|'elbow'|'valve'|'reducer'|'cap'
   * 公共校验：接口空闲、型号存在且类型匹配、入口口径一致（不符提示
   * needReducer）、体系/连接方式相容、方向规则（三通分支垂直/弯头固定角度）。
   * 预览阶段不分配任何稳定 ID；applyConnect 提交前复核源配件位置。 */
  ConstructionNetwork.prototype.planConnect = function (fittingId, portId, choice, spec) {
    spec = spec || {};
    var F = this.fittings[fittingId];
    if (!F) return { ok: false, reason: '配件不存在' };
    var port = F.ports[portId];
    if (!port) return { ok: false, reason: '接口不存在' };
    /* 自由管端：endpoint 仅 1 段且恰占用该口 → 允许在管端续接（提交时隐式新增口 p2+） */
    var pipeEnd = false;
    if (port.connected) {
      if (F.type === 'endpoint' && Object.keys(F.ports).length === 1 && !this.fixed[F.id]) {
        var segs1 = this.segmentsOf(F.id);
        if (segs1.length === 1) {
          var s1 = segs1[0];
          if ((s1.a.fitting === F.id && s1.a.port === portId) || (s1.b.fitting === F.id && s1.b.port === portId)) pipeEnd = true;
        }
      }
      if (!pipeEnd) return { ok: false, reason: '接口 ' + fittingId + '.' + portId + ' 已被占用，不能重复连接' };
    }
    /* 有效来流方向：自由管端 = 管轴向外（端口朝向管内，取反向）；普通接口 = 口朝向 */
    var edir = port.dir;
    if (pipeEnd) {
      edir = { x: -port.dir.x, y: -port.dir.y };
    }
    if (!CAT) return { ok: false, reason: '型号目录模块（product-catalog.js）未加载' };
    var item = CAT.get(spec.modelId);
    if (!item) return { ok: false, reason: '目录中无型号 ' + spec.modelId };
    if (item.type !== choice) return { ok: false, reason: '型号 ' + item.id + ' 类型是 ' + item.type + '，与操作不符' };
    /* 管材条目无 ports，用 calibers 归一化 */
    var ports = item.ports;
    if (!ports && item.calibers)
      ports = [{ key: 'pipe', label: '管口', caliber: item.calibers[0].caliber,
        system: item.calibers[0].system, conn: item.calibers[0].conn, kind: 'straight' }];
    var src = { caliber: port.caliber, system: port.system, conn: port.conn };
    var inletKey;
    if (choice === 'reducer') {
      var m = ports.filter(function (p) { return p.caliber === src.caliber; });
      if (!m.length) return { ok: false, reason: '异径型号 ' + item.id + ' 没有 Ø' + src.caliber + ' 的口，请改选其他组合', needReducer: true };
      inletKey = m[0].key;
    } else {
      inletKey = ports[0].key;
      if (ports[0].caliber != null && src.caliber != null && ports[0].caliber !== src.caliber)
        return { ok: false, reason: '口径不匹配（现有接口 Ø' + src.caliber + ' ≠ 型号口 Ø' + ports[0].caliber + '），需要异径配件，未静默接通', needReducer: true };
    }
    var inlet = ports.filter(function (p) { return p.key === inletKey; })[0];
    if (!sysCompatible(src, inlet))
      return { ok: false, reason: '口径体系/连接方式不相容（' + (src.system || '未标注') + '/' + (src.conn || '未标注') + ' vs ' + (inlet.system || '未标注') + '/' + (inlet.conn || '未标注') + '），未静默接通', incompatible: true };
    var phF = fin(F.placeholder) ? F.placeholder : 0;
    var jointLen = round3(phF / 2 + (fin(item.placeholder) ? item.placeholder : 0) / 2);
    var c = { ok: true, mode: 'connect', choice: choice, fitting: fittingId, port: portId, pipeEnd: pipeEnd,
      modelId: item.id, jointLen: jointLen, inletKey: inletKey, item: item };

    if (choice === 'pipe') {
      var dir = dirFromSpec(spec, edir);
      if (!dir) return { ok: false, reason: '接管方向非法（需 dir{x,y} 或 dirDeg）' };
      var L = spec.length;
      if (!fin(L) || !(L > MIN_LEN)) return { ok: false, reason: '接管长度必须大于 ' + MIN_LEN + 'm' };
      if (L > 10000) return { ok: false, reason: '接管长度超出合理范围（>10000m）' };
      var centerLen = round3(jointLen + L);
      var endPos = add(F.pos, scale(dir, centerLen));
      c.dir = dir; c.piece = round3(L); c.centerLen = centerLen;
      c.end = { x: round3(endPos.x), y: round3(endPos.y) };
      c.summary = '接 Ø' + (item.calibers[0].caliber || src.caliber) + ' 管 ' + round3(L) + 'm（中心线 ' + centerLen + 'm）';
      return c;
    }
    if (choice === 'tee') {
      var br = dirFromSpec(spec, null);
      if (!br) return { ok: false, reason: '三通分支方向必须显式给出（dir 或 branchDirDeg，工程坐标）' };
      if (Math.abs(dot(br, edir)) > 0.01)
        return { ok: false, reason: '三通分支口必须垂直于直通轴（90°），当前分支方向不符' };
      var posT = add(F.pos, scale(edir, jointLen));
      c.pos = { x: round3(posT.x), y: round3(posT.y) }; c.axis = edir; c.branch = br;
      c.summary = '接三通 ' + item.model + '（分支朝 ' + degOf(br) + '°）';
      return c;
    }
    if (choice === 'elbow') {
      var od = dirFromSpec(spec, null);
      if (!od) return { ok: false, reason: '弯头出口方向必须显式给出（dir 或 outDirDeg，工程坐标）' };
      var ang = item.angle != null ? item.angle : 90;
      var want = Math.cos(ang * Math.PI / 180);
      if (Math.abs(dot(od, edir) - want) > 1e-3)
        return { ok: false, reason: '弯头出口方向与来流夹角必须是产品固定角度 ' + ang + '°，当前不符' };
      var posE = add(F.pos, scale(edir, jointLen));
      c.pos = { x: round3(posE.x), y: round3(posE.y) }; c.axis = edir; c.outDir = od;
      c.summary = '接弯头 ' + item.model + '（出口朝 ' + degOf(od) + '°）';
      return c;
    }
    if (choice === 'valve' || choice === 'reducer' || choice === 'cap') {
      var posC = add(F.pos, scale(edir, jointLen));
      c.pos = { x: round3(posC.x), y: round3(posC.y) }; c.axis = edir;
      c.summary = '接' + CONN_NAME[choice] + ' ' + item.model;
      return c;
    }
    return { ok: false, reason: '未知连接类型 ' + choice };
  };
  ConstructionNetwork.prototype.applyConnect = function (plan) {
    if (!plan || !plan.ok || plan.mode !== 'connect') return { ok: false, reason: '连接计划无效' };
    var F = this.fittings[plan.fitting];
    if (!F) return { ok: false, reason: '配件不存在（模型已变化）' };
    var port = F.ports[plan.port];
    if (!port) return { ok: false, reason: '接口不存在（模型已变化），请重新预览', stale: true };
    /* 自由管端续接：提交时在端点上隐式新增一个朝外端口（不占用原管口） */
    if (plan.pipeEnd) {
      if (!port.connected) return { ok: false, reason: '预览的管端接口已变化，请重新预览', stale: true };
      var segs1 = this.segmentsOf(F.id);
      if (F.type !== 'endpoint' || segs1.length !== 1 || this.fixed[F.id])
        return { ok: false, reason: '管端状态已变化，请重新预览', stale: true };
      var s1 = segs1[0];
      if (!((s1.a.fitting === F.id && s1.a.port === plan.port) || (s1.b.fitting === F.id && s1.b.port === plan.port)))
        return { ok: false, reason: '管端接口已变化，请重新预览', stale: true };
      var outDir0 = { x: -port.dir.x, y: -port.dir.y };
      var n = 1; while (F.ports['p' + n]) n++;
      var npid = 'p' + n;
      F.ports[npid] = { id: npid, dir: outDir0, caliber: port.caliber, connected: null,
        system: port.system || null, material: port.material || null, conn: port.conn || null, kind: 'straight' };
      port = F.ports[npid];
      plan = Object.assign({}, plan, { port: npid, axis: outDir0 });
    } else if (port.connected) {
      return { ok: false, reason: '接口已被占用（模型已变化），请重新预览', stale: true };
    }
    if (!CAT) return { ok: false, reason: '型号目录模块（product-catalog.js）未加载' };
    var item = CAT.get(plan.modelId);
    if (!item) return { ok: false, reason: '型号 ' + plan.modelId + ' 已不在目录中' };
    /* 提交前复核：源配件位置/接口方向与预览一致（防过期预览） */
    var phF = fin(F.placeholder) ? F.placeholder : 0;
    var expectLen = round3(phF / 2 + (fin(item.placeholder) ? item.placeholder : 0) / 2);
    if (plan.choice === 'pipe') {
      var expEnd = add(F.pos, scale(plan.dir, expectLen + (plan.piece || 0)));
      if (dist(expEnd, { x: plan.end.x, y: plan.end.y }) > 1e-4)
        return { ok: false, reason: '预览后模型已变化（源配件移动），请重新预览', stale: true };
    } else {
      var expPos = add(F.pos, scale(port.dir, expectLen));
      if (dist(expPos, { x: plan.pos.x, y: plan.pos.y }) > 1e-4)
        return { ok: false, reason: '预览后模型已变化（源配件移动），请重新预览', stale: true };
    }
    if (!this._tx) this._checkpoint();
    var srcCal = port.caliber;
    var sid = 'S' + seqOf(this, 'seg');
    function v2Port(key, dir, caliber, def) {
      return { id: key, dir: dir, caliber: caliber == null ? null : caliber, connected: null,
        system: (def && def.system) || null, material: item.material || null,
        conn: (def && def.conn) || null, kind: (def && def.kind) || null };
    }
    if (plan.choice === 'pipe') {
      var endId = 'E-N' + seqOf(this, 'endpoint');
      var cal0 = item.calibers[0];
      this.fittings[endId] = { id: endId, type: 'endpoint', pos: { x: plan.end.x, y: plan.end.y },
        z: F.z, elevation: F.elevation, productId: plan.modelId, placeholder: 0,
        ports: { p1: v2Port('p1', neg(plan.dir), cal0.caliber, cal0) } };
      port.connected = sid;
      this.fittings[endId].ports.p1.connected = sid;
      this.segments[sid] = { id: sid, a: { fitting: plan.fitting, port: plan.port }, b: { fitting: endId, port: 'p1' },
        length: plan.centerLen, dir: plan.dir, caliber: srcCal, rigid: true, kind: 'manual',
        piece: plan.piece, system: cal0.system || null, material: item.material || null,
        conn: cal0.conn || null, productId: plan.modelId };
      this.assemblyLog.push({ kind: 'connect', text: plan.summary });
      return { ok: true, fittingId: endId, segmentId: sid };
    }
    var PFX = { tee: 'T-N', valve: 'V-N', elbow: 'EL-N', reducer: 'RD-N', cap: 'CP-N' };
    var SEQK = { tee: 'tee', valve: 'valve', elbow: 'elbow', reducer: 'reducer', cap: 'cap' };
    var newId = PFX[plan.choice] + seqOf(this, SEQK[plan.choice]);
    var ports = item.ports;
    var inletDef = null, outDefs = [];
    ports.forEach(function (p) { if (p.key === plan.inletKey) inletDef = p; else outDefs.push(p); });
    var newFit = { id: newId, type: plan.choice, pos: { x: plan.pos.x, y: plan.pos.y },
      z: F.z, elevation: F.elevation, productId: plan.modelId,
      placeholder: fin(item.placeholder) ? item.placeholder : 0, ports: {} };
    newFit.ports[inletDef.key] = v2Port(inletDef.key, neg(plan.axis), inletDef.caliber, inletDef);
    if (plan.choice === 'tee') {
      var st = outDefs[0], bd = outDefs[1];
      newFit.ports[st.key] = v2Port(st.key, plan.axis, st.caliber, st);
      newFit.ports[bd.key] = v2Port(bd.key, plan.branch, bd.caliber, bd);
    } else if (plan.choice === 'elbow') {
      newFit.ports[outDefs[0].key] = v2Port(outDefs[0].key, plan.outDir, outDefs[0].caliber, outDefs[0]);
    } else {
      outDefs.forEach(function (d) { newFit.ports[d.key] = v2Port(d.key, plan.axis, d.caliber, d); });
    }
    this.fittings[newId] = newFit;
    port.connected = sid;
    newFit.ports[inletDef.key].connected = sid;
    this.segments[sid] = { id: sid, a: { fitting: plan.fitting, port: plan.port }, b: { fitting: newId, port: inletDef.key },
      length: plan.jointLen, dir: plan.axis, caliber: srcCal, rigid: true, kind: 'joint',
      productId: plan.modelId };
    this.assemblyLog.push({ kind: 'connect', text: plan.summary });
    return { ok: true, fittingId: newId, segmentId: sid };
  };

  /* ---------- 序列化 / 迁移 ---------- */
  ConstructionNetwork.prototype.serialize = function () {
    return { version: 2, units: this.units, coords: this.coords, sourceKey: this.sourceKey,
      sourceMeta: this.sourceMeta, fittings: this.fittings, segments: this.segments, fixed: this.fixed,
      hardFixed: this.hardFixed,
      notes: this.notes, seq: this.seq, assemblyLog: this.assemblyLog || [] };
  };
  ConstructionNetwork.deserialize = function (obj, currentKey) {
    if (!obj || (obj.version !== 1 && obj.version !== 2)) return { error: '版本不支持' };
    /* 完整性校验：ID/接口引用/连接占用/数值范围，任一不满足即拒绝载入 */
    var err = null, fitIds = {}, segIds = {};
    Object.keys(obj.fittings || {}).forEach(function (id) {
      var f = obj.fittings[id];
      if (err) return;
      if (!f || f.id !== id) { err = '配件 ' + id + ' 数据不完整'; return; }
      if (!f.pos || !Number.isFinite(f.pos.x) || !Number.isFinite(f.pos.y)) { err = '配件 ' + id + ' 坐标非法'; return; }
      if (!f.ports || typeof f.ports !== 'object') { err = '配件 ' + id + ' 缺少接口表'; return; }
      fitIds[id] = true;
    });
    if (!err) {
      Object.keys(obj.segments || {}).forEach(function (sid) {
        if (err) return;
        var s = obj.segments[sid];
        if (!s || s.id !== sid) { err = '管段 ' + sid + ' 数据不完整'; return; }
        if (!Number.isFinite(s.length) || s.length <= 0) { err = '管段 ' + sid + ' 长度非法'; return; }
        if (!s.dir || !Number.isFinite(s.dir.x) || !Number.isFinite(s.dir.y)) { err = '管段 ' + sid + ' 方向非法'; return; }
        [s.a, s.b].forEach(function (r) {
          if (err) return;
          var f = r && obj.fittings[r.fitting];
          if (!f) { err = '管段 ' + sid + ' 引用了不存在的配件'; return; }
          var port = f.ports[r.port];
          if (!port) { err = '管段 ' + sid + ' 引用了配件 ' + r.fitting + ' 上不存在的接口'; return; }
          if (port.connected !== sid) { err = '接口 ' + r.fitting + '.' + r.port + ' 连接占用与管段 ' + sid + ' 不一致'; return; }
        });
        segIds[sid] = true;
      });
    }
    if (!err) {
      /* 每个已连接接口必须恰好被其段引用（防重复占口/悬挂引用） */
      Object.keys(obj.fittings).forEach(function (id) {
        if (err) return;
        var f = obj.fittings[id];
        Object.keys(f.ports).forEach(function (pid) {
          if (err) return;
          var c = f.ports[pid].connected;
          if (c != null && !segIds[c]) { err = '接口 ' + id + '.' + pid + ' 悬空引用管段 ' + c; return; }
        });
      });
      Object.keys(obj.fixed || {}).forEach(function (id) {
        if (err) return;
        if (!fitIds[id]) { err = '固定约束引用了不存在的配件 ' + id; return; }
      });
    }
    if (err) return { error: err };

    var net = new ConstructionNetwork();
    net.fittings = obj.fittings || {}; net.segments = obj.segments || {}; net.fixed = obj.fixed || {};
    /* 锚点性质迁移：老存档无 hardFixed → 保守地把全部锚点当硬锚（与旧行为一致，
     * 不自动释放）；新存档按写入的 hardFixed 区分「硬锚」与「图纸锚」 */
    net.hardFixed = {};
    Object.keys(net.fixed).forEach(function (id) {
      if (obj.hardFixed && typeof obj.hardFixed === 'object') { if (obj.hardFixed[id]) net.hardFixed[id] = true; }
      else net.hardFixed[id] = true;
    });
    /* 老存档兼容迁移：原 z 保留为显示层高；真实高程默认未确认 */
    /* 老存档兼容迁移：elevation/接口体系/材质/连接方式/配件占位 缺省补齐 */
    Object.keys(net.fittings).forEach(function (id) {
      var f = net.fittings[id];
      if (f.elevation === undefined) f.elevation = null;
      if (f.placeholder === undefined) f.placeholder = 0;
      if (f.productId === undefined) f.productId = null;
      Object.keys(f.ports).forEach(function (pid) {
        var p = f.ports[pid];
        if (p.system === undefined) p.system = null;
        if (p.material === undefined) p.material = null;
        if (p.conn === undefined) p.conn = null;
        if (p.kind === undefined) p.kind = null;
      });
    });
    net.notes = obj.notes || { uncertain: [], elevations: [] }; net.seq = obj.seq || { valve: 0, tee: 0, endpoint: 0, elbow: 0, seg: 0 };
    net.assemblyLog = Array.isArray(obj.assemblyLog) ? obj.assemblyLog : [];
    net.sourceKey = obj.sourceKey || ''; net.sourceMeta = obj.sourceMeta || null;
    if (currentKey && obj.sourceKey && obj.sourceKey !== currentKey) {
      // 几何已变：旧数据不能可靠迁移，保留并标记（不丢弃、不静默套用）
      net.notes.uncertain.push('已保存施工模型来自不同平面图几何（旧快照），部分连接可能已失效，已保留旧数据并标记待核对');
      net._legacyMismatch = true;
    }
    return net;
  };

  /* ---------- 统计（与分区材料统计口径独立；仅本模型汇总） ---------- */
  ConstructionNetwork.prototype.computeStats = function () {
    var byType = {}, totalLen = 0, freePorts = 0, uncertain = this.notes.uncertain.length + this.notes.elevations.length;
    var self = this;
    Object.keys(this.fittings).forEach(function (id) {
      var t = self.fittings[id].type; byType[t] = (byType[t] || 0) + 1;
      self.freePorts(id).forEach(function () { freePorts++; });
    });
    Object.keys(this.segments).forEach(function (id) { totalLen += self.segments[id].length; });
    var phTotal = 0;
    Object.keys(this.fittings).forEach(function (id) { var f = self.fittings[id]; if (fin(f.placeholder)) phTotal += f.placeholder; });
    return { fittingsByType: byType, fittingCount: Object.keys(this.fittings).length, segmentCount: Object.keys(this.segments).length, totalLength: round3(totalLen), placeholderTotal: round3(phTotal), cutRef: round3(Math.max(0, totalLen - phTotal)), freePorts: freePorts, uncertain: uncertain };
  };

  /* ---------- 校验（对外暴露待确认/冲突） ---------- */
  ConstructionNetwork.prototype.validate = function () {
    var issues = [], self = this;
    this.notes.uncertain.forEach(function (u) { issues.push({ level: 'warn', msg: u }); });
    this.notes.elevations.forEach(function (u) { issues.push({ level: 'warn', msg: u }); });
    Object.keys(this.segments).forEach(function (sid) {
      var s = self.segments[sid];
      var a = self.fittings[s.a.fitting], b = self.fittings[s.b.fitting];
      if (!a || !b) { issues.push({ level: 'error', msg: '管段 ' + sid + ' 端点缺失' }); return; }
      /* 接线完整性：端口必须回指本段 */
      [s.a, s.b].forEach(function (r) {
        var f = self.fittings[r.fitting];
        if (!f || !f.ports[r.port] || f.ports[r.port].connected !== sid)
          issues.push({ level: 'error', msg: '管段 ' + sid + ' 与接口 ' + r.fitting + '.' + r.port + ' 接线不一致' });
      });
      var real = dist(a.pos, b.pos);
      if (Math.abs(real - s.length) > 0.05) issues.push({ level: 'error', msg: '管段 ' + sid + ' 实长 ' + real.toFixed(2) + 'm 与记录 ' + s.length.toFixed(2) + 'm 不一致' });
      /* 方向一致性：实向量必须与记录方向同向共线（防弯折/折返残留） */
      if (real > EPS) {
        var u = { x: (b.pos.x - a.pos.x) / real, y: (b.pos.y - a.pos.y) / real };
        var cr = Math.abs(u.x * s.dir.y - u.y * s.dir.x), dt = u.x * s.dir.x + u.y * s.dir.y;
        if (cr > 0.01 || dt < 0.99) issues.push({ level: 'error', msg: '管段 ' + sid + ' 实际方向与记录方向不一致（可能弯折/折返）' });
      }
    });
    /* 固定接口数契约：阀门/弯头/异径=2、三通=3、封堵=1（仅装配件，老数据不巡检） */
    var PORT_N = { valve: 2, tee: 3, elbow: 2, reducer: 2, cap: 1 };
    Object.keys(this.fittings).forEach(function (id) {
      var f = self.fittings[id];
      var want = f.productId ? PORT_N[f.type] : null;
      if (want && Object.keys(f.ports).length !== want)
        issues.push({ level: 'warn', msg: '配件 ' + id + '（' + f.type + '）接口数 ' + Object.keys(f.ports).length + ' ≠ 契约 ' + want });
    });
    return issues;
  };

  /* ---------- 导出 ---------- */
  var API = { ConstructionNetwork: ConstructionNetwork, geometryKey: geometryKey, parseCal: parseCal, MU_M2: MU_M2 };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window !== 'undefined') window.RyNetModel = API;
  if (typeof globalThis !== 'undefined') globalThis.RyNetModel = API;
})();
