/* =====================================================================
 * tl-auto-edits.js — 自动管线图面编辑层（润野灌溉，2026-09-15 阶段2）
 * ---------------------------------------------------------------------
 * 职责：二级生成的自动管线（window.tlDiagramData 的 frontPipe/mainPipes/
 *       branchPipes）在 三级设计工作区（RyTlWs）与轴测图（RyIsoDiagram）
 *       共用的「图面编辑」单一数据源：
 *       ① 长度覆盖 lens —— pid → 新总长度（米）。改长策略与手工管线一致：
 *          前段保持不动，末段沿原方向拉伸/收缩到目标总长。
 *       ② 配件 fits —— 三通/阀门，按沿管弧长 atM（米，基于设计原始几何）
 *          定位；改长后位置随有效几何平移/截断（clamp）。
 *       ③ 管径覆盖 cals —— pid → 外径 od（mm，2026-09-16 阶段2e 图面改径）：
 *          只作显示标注（琥珀 Ø），不改几何、不参与水力计算、不进材料清单。
 * 管线标识 pid：'front' | 'main-<i>' | 'branch-<i>'（下标 = tlDiagramData
 *       数组下标；平面图重生成后下标可能重排 → 几何签名不符时整层清空）。
 * 红线：只增本模块自有状态，不写回 tlDiagramData、不参与水力计算、
 *       不进材料清单；applyTo 仅返回显示用有效几何副本（无编辑时原引用返回）。
 * 绑定：geometryKey 与 tl-edit-pipes 同口径（front/main/branch/valves/poly），
 *       几何变化 → 自动清空；同几何 → 保留（localStorage 同签名才恢复）。
 * 通知：notify 带 {action, source, lens, fits}；emitting 防重入。
 * ===================================================================== */
(function (global) {
  'use strict';

  var VERSION = 1;
  var LS_KEY = 'runye_tlAutoEdits_v1';
  var KINDS = { tee: '三通', valve: '阀门' };
  var PID_RE = /^(front|main-\d+|branch-\d+)$/;
  var FIT_ID_RE = /^A-F\d+$/;

  /* ---------- 状态 ---------- */
  var lens = {};                        // { pid: 新总长度(米) }
  var fits = [];                        // [{id, kind:'tee'|'valve', pid, atM}]
  var cals = {};                        // { pid: 外径 od(mm) }（阶段2e 改径，显示标注）
  var moves = {};                       // { pid: {dx,dy} } 图面平移覆盖（米，2026-09-16；不改管长，红线安全）
  var seq = { n: 0 };                   // 配件全局单计数器（A-F 前缀，禁分计数防撞号）
  var geoKey = '';                      // 当前绑定的平面几何签名
  var subs = [];
  var emitting = false;
  var savedLS = null;                   // localStorage 兜底存档（init 时读一次）

  /* ---------- 基础 ---------- */
  function copy(v) { return JSON.parse(JSON.stringify(v)); }
  function polylineLen(pts) {
    var L = 0;
    for (var i = 0; i + 1 < pts.length; i++) L += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    return L;
  }
  function geometryKey(data) {
    if (!data) return '';
    return JSON.stringify([data.frontPipe, data.mainPipes, data.branchPipes, data.valves, data.poly]);
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function validPid(pid) { return typeof pid === 'string' && PID_RE.test(pid); }

  function persist() {
    if (typeof localStorage === 'undefined') return;
    try { localStorage.setItem(LS_KEY, JSON.stringify(serialize())); } catch (e) {}
  }
  function notify(action, source) {
    if (emitting) return;
    emitting = true;
    try {
      var detail = { action: action, source: source || '', lens: Object.keys(lens).length, fits: fits.length, cals: Object.keys(cals).length, moves: Object.keys(moves).length };
      for (var i = 0; i < subs.length; i++) { try { subs[i](detail); } catch (e) {} }
    } finally { emitting = false; }
    persist();
  }

  /* ---------- 管线几何 ---------- */
  /* 设计原始几何：pid → 折线（米）；无此管线返回 null */
  function pipePts(pid, data) {
    if (!validPid(pid) || !data) return null;
    if (pid === 'front') return (data.frontPipe && data.frontPipe.length >= 2) ? data.frontPipe : null;
    var m = /^(main|branch)-(\d+)$/.exec(pid);
    var arr = m[1] === 'main' ? data.mainPipes : data.branchPipes;
    var line = arr && arr[Number(m[2])];
    return (line && line.length >= 2) ? line : null;
  }
  function pipeName(pid) {
    if (pid === 'front') return '总管';
    var m = /^(main|branch)-(\d+)$/.exec(pid);
    if (!m) return pid;
    return (m[1] === 'main' ? '主管#' : '支管#') + (Number(m[2]) + 1);
  }
  /* 全部 pid（渲染/拾取枚举用）：front + main-0.. + branch-0..（仅存在的） */
  function allPids(data) {
    if (!data) return [];
    var out = [];
    if (pipePts('front', data)) out.push('front');
    var i;
    if (data.mainPipes) for (i = 0; i < data.mainPipes.length; i++) if (pipePts('main-' + i, data)) out.push('main-' + i);
    if (data.branchPipes) for (i = 0; i < data.branchPipes.length; i++) if (pipePts('branch-' + i, data)) out.push('branch-' + i);
    return out;
  }
  /* 前段固定长度：除末段外的段长和（改长策略约束） */
  function fixedLen(pts) {
    var f = 0;
    for (var i = 0; i + 2 < pts.length; i++) f += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    return f;
  }
  /* 末段沿原方向拉伸/收缩到目标总长 L（不修改入参，返回新折线） */
  function stretch(pts, L) {
    var p = copy(pts);
    var fixed = fixedLen(p);
    var seg = Math.max(0.05, L - fixed);
    var dx = p[p.length - 1].x - p[p.length - 2].x, dy = p[p.length - 1].y - p[p.length - 2].y;
    var dl = Math.hypot(dx, dy) || 1;
    p[p.length - 1] = { x: p[p.length - 2].x + dx / dl * seg, y: p[p.length - 2].y + dy / dl * seg };
    return p;
  }
  /* 有效几何（应用长度覆盖后）：无覆盖 → 设计原始折线（原引用）；有 → 拉伸副本 */
  function effPts(pid, data) {
    var base = pipePts(pid, data);
    if (!base) return null;
    var p = lens[pid] ? stretch(base, lens[pid]) : base;
    var mv = moves[pid];
    if (mv) p = p.map(function (q) { return { x: q.x + mv.dx, y: q.y + mv.dy }; });   // 图面平移（2026-09-16）
    return p;
  }
  /* 显示用平面数据副本：应用改长 + 平移覆盖（无编辑时原引用返回，零成本）。
   * 单管线变换顺序：先改长（沿原设计几何拉伸）→ 再平移（整体刚性移动）。 */
  function applyTo(data) {
    if (!data || data.version !== 1) return data;
    var hasLens = Object.keys(lens).length, hasMoves = Object.keys(moves).length;
    if (!hasLens && !hasMoves) return data;
    var need = {};
    Object.keys(lens).forEach(function (pid) { if (pipePts(pid, data)) need[pid] = 1; });
    Object.keys(moves).forEach(function (pid) { if (pipePts(pid, data)) need[pid] = 1; });
    if (!Object.keys(need).length) return data;
    function xf(pid, pts) {
      var p = lens[pid] ? stretch(pts, lens[pid]) : pts;
      var mv = moves[pid];
      if (mv) p = p.map(function (q) { return { x: q.x + mv.dx, y: q.y + mv.dy }; });
      return p;
    }
    var out = Object.assign({}, data);
    if (need['front']) out.frontPipe = xf('front', data.frontPipe);
    ['mainPipes', 'branchPipes'].forEach(function (key) {
      var prefix = key === 'mainPipes' ? 'main-' : 'branch-';
      var arr = data[key];
      if (!arr) return;
      var touched = false, i;
      for (i = 0; i < arr.length; i++) if (need[prefix + i]) { touched = true; break; }
      if (!touched) return;
      var n = arr.slice();
      for (i = 0; i < arr.length; i++) if (need[prefix + i]) n[i] = xf(prefix + i, arr[i]);
      out[key] = n;
    });
    return out;
  }

  /* ---------- 沿管弧长定位 ---------- */
  /* 点 → 最近点沿管弧长（基于有效几何）：{along, dist, len}；无管线返回 null */
  function locate(pid, data, pt) {
    var pts = effPts(pid, data);
    if (!pts || !pt) return null;
    var total = 0, best = Infinity, along = 0;
    for (var i = 0; i + 1 < pts.length; i++) {
      var a = pts[i], b = pts[i + 1];
      var dx = b.x - a.x, dy = b.y - a.y;
      var c = dx * dx + dy * dy;
      var t = c === 0 ? 0 : ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / c;
      t = t < 0 ? 0 : (t > 1 ? 1 : t);
      var qx = a.x + dx * t, qy = a.y + dy * t;
      var d = Math.hypot(qx - pt.x, qy - pt.y);
      if (d < best) { best = d; along = total + Math.hypot(qx - a.x, qy - a.y); }
      total += Math.hypot(dx, dy);
    }
    return { along: along, dist: best, len: total };
  }
  /* 沿管弧长 → 点（基于有效几何，atM 超长时 clamp 到末端）：{x, y, along, len} */
  function pointAt(pid, data, atM) {
    var pts = effPts(pid, data);
    if (!pts || !isFinite(atM)) return null;
    var len = polylineLen(pts);
    var left = Math.max(0, Math.min(atM, len));
    for (var i = 0; i + 1 < pts.length; i++) {
      var seg = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
      if (seg > 0 && left <= seg) {
        var t = left / seg;
        return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t, along: left, len: len };
      }
      left -= seg;
    }
    var e = pts[pts.length - 1];
    return { x: e.x, y: e.y, along: len, len: len };
  }

  /* 沿管弧长处的切线方向（平面单位向量，基于有效几何）：图面三通第三口旋转的宿管轴用（2026-09-16） */
  function tangentAt(pid, data, atM) {
    var pts = effPts(pid, data);
    if (!pts || !isFinite(atM) || pts.length < 2) return null;
    var len = polylineLen(pts);
    var left = Math.max(0, Math.min(atM, len));
    for (var i = 0; i + 1 < pts.length; i++) {
      var seg = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
      if (seg > 0 && left <= seg) return { x: (pts[i + 1].x - pts[i].x) / seg, y: (pts[i + 1].y - pts[i].y) / seg };
      left -= seg;
    }
    var a = pts[pts.length - 2], b = pts[pts.length - 1], dd = Math.hypot(b.x - a.x, b.y - a.y);
    return dd > 0 ? { x: (b.x - a.x) / dd, y: (b.y - a.y) / dd } : null;
  }

  /* ---------- 对外 API ---------- */
  function lensMap() { return lens; }
  function fitsList() { return fits; }

  /* 改长（覆盖式）：目标总长须 > 前段固定和 + 0.05m；成功后广播 */
  function setLen(pid, len, data, source) {
    if (!validPid(pid) || !isFinite(len) || len <= 0) return false;
    var base = pipePts(pid, data);
    if (!base) return false;
    if (len <= fixedLen(base) + 0.05) return false;
    lens[pid] = Math.round(len * 100) / 100;
    notify('len', source);
    return true;
  }
  function clearLen(pid, source) {
    if (!lens[pid]) return false;
    delete lens[pid];
    notify('len', source);
    return true;
  }

  /* ---------- 管径覆盖（2026-09-16 阶段2e 图面改径）---------- */
  function calibersMap() { return cals; }
  function caliberOf(pid) { return (pid && cals[pid]) ? cals[pid] : null; }
  /* 改径（覆盖式）：pid 须为现有管线，od 为 PE 外径 mm（0<od≤2000）；只作显示标注 */
  function setCaliber(pid, od, data, source) {
    if (!validPid(pid) || !isFinite(od) || od <= 0 || od > 2000) return false;
    if (!pipePts(pid, data)) return false;
    cals[pid] = Math.round(od * 10) / 10;
    notify('caliber', source);
    return true;
  }
  function clearCaliber(pid, source) {
    if (!cals[pid]) return false;
    delete cals[pid];
    notify('caliber', source);
    return true;
  }

  /* ---------- 图面平移（2026-09-16）：整条自动管线刚性移动 ---------- */
  function movesMap() { return moves; }
  function moveOf(pid) { return (pid && moves[pid]) ? moves[pid] : null; }
  /* 累加式平移：拖动中每帧调一次，dx/dy 为相对增量（米）。不改管长 → 水力口径不变。 */
  function movePipe(pid, dx, dy, data, source) {
    if (!validPid(pid) || !isFinite(dx) || !isFinite(dy) || !pipePts(pid, data)) return false;
    var cur = moves[pid] || { dx: 0, dy: 0 };
    moves[pid] = { dx: Math.round((cur.dx + dx) * 1000) / 1000, dy: Math.round((cur.dy + dy) * 1000) / 1000 };
    notify('move', source);
    return true;
  }
  function clearMove(pid, source) {
    if (!moves[pid]) return false;
    delete moves[pid];
    notify('move', source);
    return true;
  }

  /* 插入配件：atM 为沿设计原始几何的弧长（米，越界 clamp 到管长内 0.01m） */
  function addFitting(kind, pid, atM, data, source) {
    if (!KINDS[kind] || !validPid(pid) || !isFinite(atM)) return null;
    var base = pipePts(pid, data);
    if (!base) return null;
    var L = polylineLen(base);
    var a = Math.max(0, Math.min(atM, Math.max(0, L - 0.01)));
    seq.n++;
    var f = { id: 'A-F' + pad2(seq.n), kind: kind, pid: pid, atM: Math.round(a * 100) / 100 };
    fits.push(f);
    notify('addFit', source);
    return f;
  }
  function removeFitting(id, source) {
    for (var i = 0; i < fits.length; i++) {
      if (fits[i].id === id) { fits.splice(i, 1); notify('removeFit', source); return true; }
    }
    return false;
  }
  /* 沿管拖动/输入定位（阶段2b）：把配件移到沿有效几何的弧长 atM（米，clamp 到 [0, 管长]）。
   * 两侧距离 = atM 与 管长−atM（和恒等于当前有效管长）。成功后广播 moveFit（两视图订阅重渲染）。 */
  function moveFitting(id, atM, data, source) {
    var f = null;
    for (var i = 0; i < fits.length; i++) if (fits[i].id === id) { f = fits[i]; break; }
    if (!f || !isFinite(atM)) return false;
    var pts = effPts(f.pid, data);
    if (!pts) return false;
    var L = polylineLen(pts);
    f.atM = Math.round(Math.max(0, Math.min(atM, L)) * 100) / 100;
    notify('moveFit', source);
    return true;
  }
  function fitCount() { return fits.length; }

  /* 图面三通第三口旋转（2026-09-16）：spin = 绕宿管中心轴累计旋转角（度，0/缺省=垂直管道）。
   * 仅示意层（轴测图渲染第三口短线），不进水力计算/材料清单；随配件序列化、随几何变化清空。 */
  function fitSpinOf(id) {
    for (var i = 0; i < fits.length; i++) {
      if (fits[i].id === id) return (fits[i].kind === 'tee' && isFinite(fits[i].spin)) ? fits[i].spin : 0;
    }
    return 0;
  }
  function setFitSpin(id, ang, source) {
    for (var i = 0; i < fits.length; i++) {
      if (fits[i].id !== id) continue;
      if (fits[i].kind !== 'tee') return false;   /* 阀门无第三口 */
      var v = Math.round(Number(ang) * 10) / 10;
      if (!isFinite(v)) return false;
      if (v === 0) delete fits[i].spin; else fits[i].spin = v;   /* 0=复位：不写键，序列化与未转一致 */
      notify('fitSpin', source);
      return true;
    }
    return false;
  }

  /* 静默清空（不广播；换方案/几何失配由渲染方整体重绘），仍持久化 */
  function reset() {
    if (!Object.keys(lens).length && !fits.length && !Object.keys(cals).length && !Object.keys(moves).length && !seq.n) return false;
    lens = {}; fits = []; cals = {}; moves = {}; seq = { n: 0 };
    persist();
    return true;
  }
  /* 作废 localStorage 兜底档（内存 savedLS + 磁盘）：防同几何签名的旧存档幽灵恢复 */
  function discardSaved() {
    savedLS = null;
    if (typeof localStorage !== 'undefined') {
      try { localStorage.removeItem(LS_KEY); } catch (e) {}
    }
  }

  /* 平面几何绑定：渲染平面数据前调用。几何签名变化 → 清空（同几何保留）。
   * 返回 'kept' | 'changed'。 */
  function syncGeometry(data) {
    var k = geometryKey(data);
    if (!k) return 'kept';
    if (k === geoKey) return 'kept';
    lens = {}; fits = []; cals = {}; moves = {}; seq = { n: 0 };
    geoKey = k;
    if (savedLS && savedLS.geoKey === k) {
      restore(savedLS, true);
      return 'changed';
    }
    persist();
    return 'changed';
  }

  function serialize() {
    return { version: VERSION, geoKey: geoKey, lens: copy(lens), fits: copy(fits), cals: copy(cals), moves: copy(moves), seq: copy(seq) };
  }
  /* 恢复（主方案存档 / localStorage）。几何签名不符 → 拒绝（返回 false）。
   * silent=true 供 syncGeometry 内部恢复用（不广播）。 */
  function restore(state, silent) {
    if (!state || state.version !== VERSION) return false;
    if (state.geoKey && geoKey && state.geoKey !== geoKey) return false;
    if (!state.lens || typeof state.lens !== 'object' || Array.isArray(state.lens)) return false;
    if (state.cals != null && (typeof state.cals !== 'object' || Array.isArray(state.cals))) return false;
    if (state.moves != null && (typeof state.moves !== 'object' || Array.isArray(state.moves))) return false;
    if (!Array.isArray(state.fits) || state.fits.length > 2000) return false;
    if (!state.seq || !Number.isInteger(state.seq.n) || state.seq.n < 0) return false;
    var pids = Object.keys(state.lens), i;
    for (i = 0; i < pids.length; i++) {
      if (!validPid(pids[i]) || !isFinite(state.lens[pids[i]]) || state.lens[pids[i]] <= 0) return false;
    }
    var cids = state.cals ? Object.keys(state.cals) : [], ci;
    for (ci = 0; ci < cids.length; ci++) {
      if (!validPid(cids[ci]) || !isFinite(state.cals[cids[ci]]) || state.cals[cids[ci]] <= 0 || state.cals[cids[ci]] > 2000) return false;
    }
    var mids = state.moves ? Object.keys(state.moves) : [], mi;
    for (mi = 0; mi < mids.length; mi++) {
      var mv = state.moves[mids[mi]];
      if (!validPid(mids[mi]) || !mv || !isFinite(mv.dx) || !isFinite(mv.dy)) return false;
    }
    var seen = {}, maxN = 0;
    for (i = 0; i < state.fits.length; i++) {
      var f = state.fits[i];
      if (!FIT_ID_RE.test(f.id) || !KINDS[f.kind] || !validPid(f.pid) || !isFinite(f.atM) || f.atM < 0) return false;
      if (f.spin != null && !isFinite(f.spin)) return false;   /* 可选字段：第三口旋转角（旧档无此键） */
      if (seen[f.id]) return false;
      seen[f.id] = 1;
      maxN = Math.max(maxN, parseInt(f.id.slice(3), 10) || 0);
    }
    lens = copy(state.lens);
    fits = copy(state.fits);
    cals = state.cals ? copy(state.cals) : {};
    moves = state.moves ? copy(state.moves) : {};
    seq = { n: Math.max(state.seq.n, maxN) };
    if (state.geoKey) geoKey = state.geoKey;
    if (!silent) notify('restore', 'project');
    return true;
  }

  /* 订阅：fn({action, source, lens, fits})；返回退订函数 */
  function onChange(fn) {
    if (typeof fn !== 'function') return function () {};
    subs.push(fn);
    return function () {
      for (var i = 0; i < subs.length; i++) if (subs[i] === fn) { subs.splice(i, 1); break; }
    };
  }

  /* ---------- 导出 ---------- */
  var api = {
    version: VERSION, KINDS: KINDS, geometryKey: geometryKey, polylineLen: polylineLen, fixedLen: fixedLen,
    pipePts: pipePts, pipeName: pipeName, allPids: allPids, effPts: effPts, applyTo: applyTo,
    locate: locate, pointAt: pointAt,
    lensMap: lensMap, setLen: setLen, clearLen: clearLen,
    calibersMap: calibersMap, caliberOf: caliberOf, setCaliber: setCaliber, clearCaliber: clearCaliber,
    movesMap: movesMap, moveOf: moveOf, movePipe: movePipe, clearMove: clearMove,
    fitsList: fitsList, addFitting: addFitting, removeFitting: removeFitting, moveFitting: moveFitting, fitCount: fitCount,
    fitSpinOf: fitSpinOf, setFitSpin: setFitSpin, tangentAt: tangentAt,
    reset: reset, discardSaved: discardSaved, syncGeometry: syncGeometry,
    serialize: serialize, restore: restore, onChange: onChange,
    _state: function () { return { lens: lens, fits: fits, cals: cals, moves: moves, seq: seq, geoKey: geoKey, subs: subs.length }; }
  };
  global.RyTlAutoEdits = api;

  /* 浏览器端：读 localStorage 兜底存档（syncGeometry 同几何签名时恢复） */
  if (typeof localStorage !== 'undefined') {
    try { savedLS = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) { savedLS = null; }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
