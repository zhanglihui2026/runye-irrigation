/* =====================================================================
 * tl-edit-pipes.js — 三级图面共享编辑数据层（润野灌溉，2026-09-15）
 * ---------------------------------------------------------------------
 * 职责：三级设计工作区（RyTlWs）与轴测图（RyIsoDiagram）共用的
 *       「手工管线」单一数据源。任一视图 插入/删除 主管/支管折线，
 *       另一视图通过 onChange 订阅立即重渲染（双向同步）。
 * 数据：条目 {id, kind:'main'|'branch', pts:[{x,y}(米)], len(米)}，
 *       数据坐标与 window.tlDiagramData 同系（米）。
 * 红线：只增本模块自有状态，不写回 tlDiagramData、不参与水力计算、
 *       不进材料清单；绑定平面几何签名（geometryKey），平面图重生成
 *       几何变化 → 自动清空；同几何（同引用或重生成内容一致）→ 保留。
 * 持久：serialize/restore 供主方案存档（index.html runyeSaveProject）；
 *       浏览器端 localStorage 兜底（几何签名不符的旧存档不复活）。
 * 通知：notify 带 {action, source, count}；source 标记发起方
 *       （'ws'|'iso'|'project'|''），防重入（emitting 期间再入不广播）。
 * ===================================================================== */
(function (global) {
  'use strict';

  var VERSION = 1;
  var LS_KEY = 'runye_tlEditPipes_v1';
  var KINDS = { main: '主管', branch: '支管' };
  var ID_RE = /^M-P\d+$/;
  var FIT_KINDS = { tee: '三通', elbow: '弯头' };   // 手工配件（2026-09-16）
  var FIT_ID_RE = /^MP-F\d+$/;

  /* ---------- 状态 ---------- */
  var pipes = [];                       // {id, kind, pts, len}
  var seq = { n: 0 };                   // 全局单计数器：主管/支管同前缀 M-P，禁分计数（防撞号，2026-09-15）
  var geoKey = '';                      // 当前绑定的平面几何签名
  var subs = [];                        // 订阅者 fn(detail)
  var emitting = false;
  var savedLS = null;                   // localStorage 兜底存档（init 时读一次）
  var fits = [];                        // 手工配件 [{id, kind:'tee'|'elbow', pid, atM(tee)|end(elbow), side(tee ±1)}]（2026-09-16）
  var fseq = { n: 0 };                  // 配件计数器（MP-F 前缀）

  /* ---------- 基础 ---------- */
  function copy(v) { return JSON.parse(JSON.stringify(v)); }
  function polylineLen(pts) {
    var L = 0;
    for (var i = 0; i + 1 < pts.length; i++) L += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    return L;
  }
  /* 几何签名：与 iso-diagram.geometryKey 同口径（总管/主管/支管/阀门/地块轮廓） */
  function geometryKey(data) {
    if (!data) return '';
    return JSON.stringify([data.frontPipe, data.mainPipes, data.branchPipes, data.valves, data.poly]);
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function persist() {
    if (typeof localStorage === 'undefined') return;
    try { localStorage.setItem(LS_KEY, JSON.stringify(serialize())); } catch (e) {}
  }
  function notify(action, source) {
    if (emitting) return;               // 防重入：订阅者内再改数据不二次广播
    emitting = true;
    try {
      var detail = { action: action, source: source || '', count: pipes.length, fits: fits.length };
      for (var i = 0; i < subs.length; i++) {
        try { subs[i](detail); } catch (e) {}
      }
    } finally { emitting = false; }
    persist();
  }

  function validPts(pts) {
    return Array.isArray(pts) && pts.length >= 2 && pts.every(function (p) {
      return p && isFinite(p.x) && isFinite(p.y);
    });
  }

  /* ---------- 对外 API ---------- */
  function list() { return pipes; }

  function add(kind, pts, source) {
    if (!KINDS[kind] || !validPts(pts)) return null;
    seq.n++;
    var m = { id: 'M-P' + pad2(seq.n), kind: kind, pts: copy(pts), len: Math.round(polylineLen(pts) * 100) / 100 };
    pipes.push(m);
    notify('add', source);
    return m;
  }

  function remove(id, source) {
    for (var i = 0; i < pipes.length; i++) {
      if (pipes[i].id === id) {
        pipes.splice(i, 1);
        for (var j = fits.length - 1; j >= 0; j--) if (fits[j].pid === id) fits.splice(j, 1);   // 宿主没了，配件随之（2026-09-16）
        notify('remove', source); return true;
      }
    }
    return false;
  }

  function removeLast(source) {
    if (!pipes.length) return false;
    pipes.pop();
    notify('remove', source);
    return true;
  }

  /* ---------- 手工配件（2026-09-16）：三通/弯头 ----------
   * 三通挂管身（atM 沿管弧长，side 决定分支朝向哪一侧）；弯头挂端头（end 0=起点 1=终点）。
   * 「接管道」由工作区读 fitPos 锚点后调 add() 引出新管段（默认 1m，选中即改长）——链式生长。
   * 红线不变：配件只增本模块自有状态，不参与水力计算、不进材料清单。 */
  function fitById(id) {
    for (var i = 0; i < fits.length; i++) if (fits[i].id === id) return fits[i];
    return null;
  }
  function pipeById(id) {
    for (var i = 0; i < pipes.length; i++) if (pipes[i].id === id) return pipes[i];
    return null;
  }
  /* 锚点几何：{x, y, dir:{x,y}单位向量, kind(宿主管 kind), hostLen}；宿主不存在返回 null。
   * 三通 dir = 垂直宿管（side ±1 选侧）；弯头 dir = 端头沿管延伸方向。 */
  function fitPos(id) {
    var f = (typeof id === 'string') ? fitById(id) : id;
    if (!f) return null;
    var m = pipeById(f.pid);
    if (!m || !m.pts || m.pts.length < 2) return null;
    var pts = m.pts, a = null, d = null;
    if (f.kind === 'elbow') {
      if (f.end === 0) {
        a = pts[0];
        d = { x: pts[0].x - pts[1].x, y: pts[0].y - pts[1].y };
      } else {
        a = pts[pts.length - 1];
        d = { x: pts[pts.length - 1].x - pts[pts.length - 2].x, y: pts[pts.length - 1].y - pts[pts.length - 2].y };
      }
    } else {
      var L = polylineLen(pts), left = Math.max(0, Math.min(f.atM, L));
      for (var i = 0; i + 1 < pts.length; i++) {
        var seg = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
        if (seg > 0 && left <= seg) {
          var t = left / seg;
          a = { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t };
          d = { x: (pts[i + 1].x - pts[i].x) / seg, y: (pts[i + 1].y - pts[i].y) / seg };
          break;
        }
        left -= seg;
      }
      if (!a) { a = { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y }; d = { x: 1, y: 0 }; }
      d = { x: -d.y * (f.side || 1), y: d.x * (f.side || 1) };   // 分支方向 = 垂直宿管
    }
    var dl = Math.hypot(d.x, d.y) || 1;
    return { x: a.x, y: a.y, dir: { x: d.x / dl, y: d.y / dl }, kind: m.kind, hostLen: Math.round(polylineLen(pts) * 100) / 100 };
  }
  function addFit(kind, pid, opts, source) {
    if (!FIT_KINDS[kind]) return null;
    var m = pipeById(pid);
    if (!m || !m.pts || m.pts.length < 2) return null;
    var o = opts || {}, f;
    if (kind === 'elbow') {
      f = { id: 'MP-F' + pad2(++fseq.n), kind: kind, pid: pid, end: (o.end === 0 ? 0 : 1) };
    } else {
      var L = polylineLen(m.pts);
      var at = Math.max(0.01, Math.min(Number(o.atM) || 0, L - 0.01));
      f = { id: 'MP-F' + pad2(++fseq.n), kind: kind, pid: pid, atM: Math.round(at * 100) / 100, side: (o.side === -1 ? -1 : 1) };
    }
    fits.push(f);
    notify('addFit', source);
    return f;
  }
  function removeFit(id, source) {
    for (var i = 0; i < fits.length; i++) {
      if (fits[i].id === id) { fits.splice(i, 1); notify('removeFit', source); return true; }
    }
    return false;
  }
  function moveFit(id, atM, source) {
    var f = fitById(id);
    if (!f || f.kind !== 'tee' || !isFinite(atM)) return false;
    var m = pipeById(f.pid);
    if (!m) return false;
    var L = polylineLen(m.pts);
    f.atM = Math.round(Math.max(0.01, Math.min(atM, L - 0.01)) * 100) / 100;
    notify('moveFit', source);
    return true;
  }
  /* 三通分支换向（side 翻转） */
  function flipFit(id, source) {
    var f = fitById(id);
    if (!f || f.kind !== 'tee') return false;
    f.side = (f.side === -1) ? 1 : -1;
    notify('moveFit', source);
    return true;
  }
  function fitsList() { return fits; }

  /* 原位更新条目（改长等视图策略性修改）：fn(entry) 做几何变更，成功后广播。
   * 返回该条目；找不到返回 null。 */
  function update(id, fn, source) {
    for (var i = 0; i < pipes.length; i++) {
      if (pipes[i].id === id) {
        if (typeof fn === 'function') fn(pipes[i]);
        notify('update', source);
        return pipes[i];
      }
    }
    return null;
  }

  function clear(source) {
    if (!pipes.length && !fits.length) return false;
    pipes = []; fits = [];
    notify('clear', source);
    return true;
  }

  /* 静默清空（不广播；换方案/几何失配等由渲染方自行重绘），仍持久化 */
  function reset() {
    if (!pipes.length && !seq.n && !fits.length && !fseq.n) return false;
    pipes = []; seq = { n: 0 }; fits = []; fseq = { n: 0 };
    persist();
    return true;
  }

  /* 作废 localStorage 兜底档（内存 savedLS + 磁盘）：防止换方案后
     同几何签名的旧会话存档被 syncGeometry 幽灵恢复（2026-09-15）。 */
  function discardSaved() {
    savedLS = null;
    if (typeof localStorage !== 'undefined') {
      try { localStorage.removeItem(LS_KEY); } catch (e) {}
    }
  }

  function count() { return pipes.length; }
  function totals() {
    var t = { main: { n: 0, len: 0 }, branch: { n: 0, len: 0 } };
    pipes.forEach(function (m) { if (t[m.kind]) { t[m.kind].n++; t[m.kind].len += m.len; } });
    t.main.len = Math.round(t.main.len * 100) / 100;
    t.branch.len = Math.round(t.branch.len * 100) / 100;
    t.all = { n: pipes.length, len: Math.round((t.main.len + t.branch.len) * 100) / 100 };
    return t;
  }

  /* 平面几何绑定：渲染平面数据前调用。几何签名变化 → 清空（同几何保留）。
   * 返回 'kept' | 'changed'（changed 时渲染方本就会整体重绘，无需通知）。 */
  function syncGeometry(data) {
    var k = geometryKey(data);
    if (!k) return 'kept';
    if (k === geoKey) return 'kept';
    pipes = []; seq = { n: 0 };
    geoKey = k;
    /* localStorage 兜底：同几何签名的旧存档自动恢复（刷新不丢手工管线） */
    if (savedLS && savedLS.geoKey === k && Array.isArray(savedLS.pipes)) {
      restore(savedLS, true);
      return 'changed';
    }
    persist();
    return 'changed';
  }

  function serialize() {
    return { version: VERSION, geoKey: geoKey, pipes: copy(pipes), seq: copy(seq), fits: copy(fits), fseq: copy(fseq) };
  }

  /* 恢复（主方案存档 / localStorage）。几何签名不符 → 拒绝（返回 false）。
   * silent=true 供 syncGeometry 内部恢复用（不广播）。 */
  function restore(state, silent) {
    if (!state || state.version !== VERSION || !Array.isArray(state.pipes)) return false;
    if (state.geoKey && geoKey && state.geoKey !== geoKey) return false;
    if (!state.seq || !Number.isInteger(state.seq.n) || state.seq.n < 0) return false;
    if (state.pipes.length > 2000) return false;
    var seen = {}, maxN = 0;
    for (var i = 0; i < state.pipes.length; i++) {
      var m = state.pipes[i];
      if (!ID_RE.test(m.id) || !KINDS[m.kind] || !validPts(m.pts) || !isFinite(m.len)) return false;
      if (seen[m.id]) return false;
      seen[m.id] = 1;
      maxN = Math.max(maxN, parseInt(m.id.slice(3), 10) || 0);
    }
    pipes = copy(state.pipes);
    seq = { n: Math.max(state.seq.n, maxN) };
    /* 配件（2026-09-16）：旧存档无 fits 字段视为空；有则逐条校验（宿主必须存在） */
    var nf = [];
    if (state.fits != null) {
      if (!Array.isArray(state.fits) || state.fits.length > 2000) return false;
      var seenF = {}, fmax = 0;
      for (var k = 0; k < state.fits.length; k++) {
        var ft = state.fits[k];
        if (!FIT_ID_RE.test(ft.id) || !FIT_KINDS[ft.kind] || !pipeById(ft.pid)) return false;
        if (ft.kind === 'elbow') { if (ft.end !== 0 && ft.end !== 1) return false; }
        else { if (!isFinite(ft.atM) || ft.atM < 0 || (ft.side !== -1 && ft.side !== 1)) return false; }
        if (seenF[ft.id]) return false;
        seenF[ft.id] = 1;
        fmax = Math.max(fmax, parseInt(ft.id.slice(4), 10) || 0);
      }
      nf = copy(state.fits);
      fseq = { n: Math.max(state.fseq && Number.isInteger(state.fseq.n) ? state.fseq.n : 0, fmax) };
    }
    fits = nf;
    if (state.geoKey) geoKey = state.geoKey;
    if (!silent) notify('restore', 'project');
    return true;
  }

  /* 订阅：fn({action, source, count})；返回退订函数 */
  function onChange(fn) {
    if (typeof fn !== 'function') return function () {};
    subs.push(fn);
    return function () {
      for (var i = 0; i < subs.length; i++) if (subs[i] === fn) { subs.splice(i, 1); break; }
    };
  }

  /* ---------- 导出 ---------- */
  var api = {
    version: VERSION, KINDS: KINDS, geometryKey: geometryKey, polylineLen: polylineLen,
    list: list, add: add, remove: remove, removeLast: removeLast, update: update, clear: clear, reset: reset, discardSaved: discardSaved,
    count: count, totals: totals, syncGeometry: syncGeometry,
    fitsList: fitsList, addFit: addFit, removeFit: removeFit, moveFit: moveFit, flipFit: flipFit, fitById: fitById, fitPos: fitPos, pipeById: pipeById,
    serialize: serialize, restore: restore, onChange: onChange,
    _state: function () { return { pipes: pipes, seq: seq, geoKey: geoKey, fits: fits, fseq: fseq, subs: subs.length }; }
  };
  global.RyTlEditPipes = api;

  /* 浏览器端：读 localStorage 兜底存档（syncGeometry 同几何签名时恢复） */
  if (typeof localStorage !== 'undefined') {
    try { savedLS = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) { savedLS = null; }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
