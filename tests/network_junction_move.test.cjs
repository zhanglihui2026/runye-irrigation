/* =====================================================================
 * tests/network_junction_move.test.cjs — 「改管长→接头随动/连锁」验收
 * 运行：node tests/network_junction_move.test.cjs
 *
 * 用户需求：调节某根管道的长度时，它连接的三通/阀门按调整后的长度移动，
 *          三通上所有相连的管道一起随动（保持连接、不静默拉断）。
 *
 * 契约：
 *  1) setSegmentLength(segId, len, { anchor:'a'|'b' }) —— 指定基准端（不动的一端），
 *     另一端（接头）按新长度移动；缺省沿用自动规则（优先移未固定端）。
 *  2) setSegmentLength(segId, len, { moveFitting: id }) —— 显式指定要移动的接头。
 *  3) 随动传播：自由端被推动平移；远端为固定锚点且保持同轴 → 沿锚固管线重新切分
 *     （子段长度自动调整，长度和守恒）；离开原管轴 / 越过锚固端 / 两端皆锚固 → 拦截。
 *  4) 返回值给出随动报告：affectedFittings（被带动的配件）、absorbedSegments（自动改长的管段）。
 * ===================================================================== */
'use strict';
const NM = require('../iso-diagram/network-model.js');
const ConstructionNetwork = NM.ConstructionNetwork;

let pass = 0, fail = 0;
function ok(c, n) { if (c) { pass++; console.log('✓ ' + n); } else { fail++; console.log('✗ FAIL ' + n); } }
function near(a, b, eps) { return Math.abs(a - b) <= (eps || 1e-3); }
function P(f) { return f.pos.x + ',' + f.pos.y; }

/* ---------- 合成数据（与 network_model.test.cjs 同源） ---------- */
function mkSimple() {
  return {
    version: 1, world: 'meter', plot: { w: 40, h: 40 },
    poly: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }],
    frontPipe: [{ x: 0, y: -20 }, { x: 40, y: -20 }],
    sourcePos: null,
    mainPipes: [[{ x: 10, y: 0 }, { x: 10, y: 20 }]],
    branchPipes: [], valves: [], dripTapes: [],
    meta: { pipes: { front: 'O200', main: 'O110', branch: 'O63' } }
  };
}
function mkData() {
  const frontY = -20;
  return {
    version: 1, world: 'meter', plot: { w: 300, h: 200 },
    poly: [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 200 }, { x: 0, y: 200 }],
    zones: { cols: 3, rows: 2, xPos: [0, 100, 200, 300], yPos: [0, 100, 200] },
    frontPipe: [{ x: 0, y: frontY }, { x: 300, y: frontY }],
    sourcePos: { x: 0, y: frontY },
    mainPipes: [
      [{ x: 32, y: 0 }, { x: 32, y: 200 }],
      [{ x: 132, y: 0 }, { x: 132, y: 200 }],
      [{ x: 232, y: 0 }, { x: 232, y: 200 }]
    ],
    branchPipes: [
      [{ x: 60, y: 6 }, { x: 60, y: 94 }], [{ x: 160, y: 6 }, { x: 160, y: 94 }], [{ x: 260, y: 6 }, { x: 260, y: 94 }],
      [{ x: 60, y: 106 }, { x: 60, y: 194 }], [{ x: 160, y: 106 }, { x: 160, y: 194 }], [{ x: 260, y: 106 }, { x: 260, y: 194 }]
    ],
    valves: [
      { x: 60, y: 50, ax: 32, ay: 18 }, { x: 160, y: 50, ax: 132, ay: 18 }, { x: 260, y: 50, ax: 232, ay: 18 },
      { x: 60, y: 150, ax: 32, ay: 118 }, { x: 160, y: 150, ax: 132, ay: 118 }, { x: 260, y: 150, ax: 232, ay: 118 }
    ],
    dripTapes: [],
    meta: { zoneCount: 6, pump: { flow: '120', head: '35', power: '18.5' }, pipes: { front: 'O200', main: 'O110', branch: 'O63' } }
  };
}
function portWiringOk(net) {
  let bad = 0;
  Object.values(net.segments).forEach(function (s) {
    [s.a, s.b].forEach(function (r) {
      const f = net.fittings[r.fitting];
      if (!f || !f.ports[r.port] || f.ports[r.port].connected !== s.id) bad++;
    });
  });
  return bad === 0;
}
/* 直线锚固链：未锚固端 + 插三通 + 从空口接自由支管 */
function mkTeeWithFreeBranch() {
  const net = new ConstructionNetwork().fromPlan(mkSimple());
  const mainSeg = Object.values(net.segments).find(function (s) { return s.kind === 'main'; });
  const ins = net.insertFittingOnSegment(mainSeg.id, 5, 'tee');
  const tee = net.fittings[ins.fittingId];
  const p3 = Object.keys(tee.ports).find(function (p) { return !tee.ports[p].connected; });
  const br = net.addBranch(ins.fittingId, p3, { length: 4 });
  return { net: net, teeId: ins.fittingId, brSeg: br.segmentId, brEnd: br.fittingId, up: ins.segA, down: ins.segB };
}
function mkFlatStart() {          // 主管起点正好落在总管上 → 0m 立管接驳段（常见的真实地块布局）
  const d = mkData();
  d.frontPipe = [{ x: 0, y: 0 }, { x: 300, y: 0 }];
  d.sourcePos = { x: 0, y: 0 };
  return d;
}
function endPos(net, id) { return { x: net.fittings[id].pos.x, y: net.fittings[id].pos.y }; }
function other(net, seg, fid) { return seg.a.fitting === fid ? seg.b.fitting : seg.a.fitting; }
function cpOf(net) { const n = new ConstructionNetwork(); n._restore(net._snap()); return n; }
/* 手工构造（M9–M15 用）：总管两端为**硬锚** + 中间两个三通 + 每个三通一条**刚性支管**（末端自由）
 *   E-A(0,0) —S1(10)— T1(10,0) —S2(10)— T2(20,0) —S3(10)— E-B(30,0)
 *   T1.p3 —S4(6)— B1(10,6)   T2.p3 —S5(6)— B2(20,6)   （支管刚性、末端自由） */
function mkTrunk() {
  const net = new ConstructionNetwork();
  net.fittings = {}; net.segments = {}; net.fixed = {}; net.hardFixed = {};
  net.seq = { valve: 0, tee: 0, endpoint: 0, elbow: 0, seg: 0 };
  net.notes = { uncertain: [], elevations: [] };
  net.assemblyLog = [];
  const endpoint = function (id, x, y, dx, dy, cal) {
    net.fittings[id] = { id: id, type: 'endpoint', pos: { x: x, y: y }, z: 0, elevation: null,
      ports: { p1: { id: 'p1', dir: { x: dx, y: dy }, caliber: cal, connected: null } } };
  };
  const tee = function (id, x, y) {
    net.fittings[id] = { id: id, type: 'tee', pos: { x: x, y: y }, z: 0, elevation: null, ports: {
      p1: { id: 'p1', dir: { x: -1, y: 0 }, caliber: 110, connected: null },
      p2: { id: 'p2', dir: { x: 1, y: 0 }, caliber: 110, connected: null },
      p3: { id: 'p3', dir: { x: 0, y: 1 }, caliber: 63, connected: null } } };
  };
  const seg = function (id, a, ap, b, bp, len, dir, rigid, kind) {
    net.segments[id] = { id: id, a: { fitting: a, port: ap }, b: { fitting: b, port: bp },
      length: len, dir: dir, caliber: 110, rigid: !!rigid, kind: kind };
    net.fittings[a].ports[ap].connected = id;
    net.fittings[b].ports[bp].connected = id;
  };
  endpoint('E-A', 0, 0, -1, 0, 110); endpoint('E-B', 30, 0, 1, 0, 110);
  net.fixed['E-A'] = true; net.hardFixed['E-A'] = true;      // 总管两端 = 硬锚（地块/水源骨架）
  net.fixed['E-B'] = true; net.hardFixed['E-B'] = true;
  tee('T1', 10, 0); tee('T2', 20, 0);
  seg('S1', 'E-A', 'p1', 'T1', 'p1', 10, { x: 1, y: 0 }, false, 'front');
  seg('S2', 'T1', 'p2', 'T2', 'p1', 10, { x: 1, y: 0 }, false, 'front');
  seg('S3', 'T2', 'p2', 'E-B', 'p1', 10, { x: 1, y: 0 }, false, 'front');
  [['T1', 'B1', 'S4'], ['T2', 'B2', 'S5']].forEach(function (t) {
    endpoint(t[1], net.fittings[t[0]].pos.x, 6, 0, -1, 63);   // 支管末端（自由）
    seg(t[2], t[0], 'p3', t[1], 'p1', 6, { x: 0, y: 1 }, true, 'branch');
  });
  net.seq = { valve: 0, tee: 2, endpoint: 2, elbow: 0, seg: 5 };
  return net;
}

/* 图纸拐点锚（◇）专用夹具（M16 用）：
 *   总管 E-X(0,0)[◆] —P1(10)— J(10,0)[三通,自由滑动] —P2(10)— E-Y(20,0)[◆]
 *   立管 R1(6m,刚性) J ↕ C(10,6)[◇ 图纸拐点锚：fixed 但**不** hardFixed]
 *   主管 M1(10m,刚性) C ↕ D(10,16)[自由端]
 * C 的相连两段（R1/M1）共线（均沿 +y）→ 属「直管上的折点」，移动须落回该轴；
 * 它是图纸锚而非硬锚 ⇒ 显式把它当移动端时应当**放行尝试**（旧代码按分类一律误拒）。 */
function mkSoftCorner() {
  const net = new ConstructionNetwork();
  net.fittings = {}; net.segments = {}; net.fixed = {}; net.hardFixed = {};
  net.seq = { valve: 0, tee: 0, endpoint: 0, elbow: 0, seg: 0 };
  net.notes = { uncertain: [], elevations: [] };
  net.assemblyLog = [];
  const dir = function (dx, dy) { return { x: dx, y: dy }; };
  const ep = function (id, x, y, dx, dy, cal) {
    net.fittings[id] = { id: id, type: 'endpoint', pos: { x: x, y: y }, z: 0, elevation: null,
      ports: { p1: { id: 'p1', dir: dir(dx, dy), caliber: cal, connected: null } } };
  };
  const tee = function (id, x, y) {
    net.fittings[id] = { id: id, type: 'tee', pos: { x: x, y: y }, z: 0, elevation: null, ports: {
      p1: { id: 'p1', dir: dir(-1, 0), caliber: 200, connected: null },
      p2: { id: 'p2', dir: dir(1, 0), caliber: 200, connected: null },
      p3: { id: 'p3', dir: dir(0, 1), caliber: 110, connected: null } } };
  };
  const elbow = function (id, x, y) {
    net.fittings[id] = { id: id, type: 'elbow', pos: { x: x, y: y }, z: 0, elevation: null, ports: {
      p1: { id: 'p1', dir: dir(0, -1), caliber: 110, connected: null },
      p2: { id: 'p2', dir: dir(0, 1), caliber: 110, connected: null } } };
  };
  const seg = function (id, a, ap, b, bp, len, d, rigid, kind) {
    net.segments[id] = { id: id, a: { fitting: a, port: ap }, b: { fitting: b, port: bp },
      length: len, dir: d, caliber: 110, rigid: !!rigid, kind: kind };
    net.fittings[a].ports[ap].connected = id;
    net.fittings[b].ports[bp].connected = id;
  };
  ep('E-X', 0, 0, -1, 0, 200); ep('E-Y', 20, 0, 1, 0, 200);
  net.fixed['E-X'] = true; net.hardFixed['E-X'] = true;      // 总管两端 = 硬锚（地块骨架）
  net.fixed['E-Y'] = true; net.hardFixed['E-Y'] = true;
  tee('J', 10, 0);                                          // 总管上的三通（自由滑动端）
  elbow('C', 10, 6); net.fixed['C'] = true;                 // ◇ 图纸拐点锚（fixed，非 hardFixed）
  ep('D', 10, 16, 0, -1, 110);                              // 自由端
  seg('P1', 'E-X', 'p1', 'J', 'p1', 10, dir(1, 0), false, 'front');
  seg('P2', 'J', 'p2', 'E-Y', 'p1', 10, dir(1, 0), false, 'front');
  seg('R1', 'J', 'p3', 'C', 'p1', 6, dir(0, 1), true, 'branch');
  seg('M1', 'C', 'p2', 'D', 'p1', 10, dir(0, 1), true, 'branch');
  net.seq = { valve: 0, tee: 1, endpoint: 3, elbow: 1, seg: 4 };
  return net;
}

/* === M1) 显式基准端：anchor / moveFitting 决定「哪一端不动」 === */
console.log('== M1) 显式基准端 anchor：指定不动的一端，另一端（接头）按新长度移动 ==');
{
  /* 主管 E-P3(10,0)—E-P4(10,20) 两端锚固；插两个三通 → 中段 TA→TB 两端皆自由 */
  const net = new ConstructionNetwork().fromPlan(mkSimple());
  const mainSeg = Object.values(net.segments).find(function (s) { return s.kind === 'main'; });
  const iA = net.insertFittingOnSegment(mainSeg.id, 5, 'tee');
  const TA = iA.fittingId;
  const iB = net.insertFittingOnSegment(iA.segB, 7, 'tee');     // 距 TA 7m
  const TB = iB.fittingId;
  const midSeg = iB.segA;                                        // TA → TB（管段 id）
  const mid = net.segments[midSeg];
  ok(!!mid && near(mid.length, 7) && mid.a.fitting === TA && mid.b.fitting === TB,
    '前置：' + TA + '(y=5)→' + TB + '(y=12) 中段 7m，两端皆自由（不受锚点约束）');
  const cp = function () { const n = new ConstructionNetwork(); n._restore(net._snap()); return n; };
  /* 缺省：两端皆自由 → 移动 b 端（TB） */
  const n1 = cp();
  const rAuto = n1.setSegmentLength(midSeg, 10);
  ok(rAuto.ok && rAuto.movedFitting === TB, '缺省（两端皆自由）移动 b 端＝' + TB);
  ok(near(n1.fittings[TB].pos.y, 15) && near(n1.fittings[TA].pos.y, 5), '缺省把 b 端沿轴推到 y=15，a 端原地不动');
  /* anchor:'a' → 固定 TA 为基准，移 TB */
  const n2 = cp();
  const rA = n2.setSegmentLength(midSeg, 10, { anchor: 'a' });
  ok(rA.ok && rA.movedFitting === TB && near(n2.fittings[TA].pos.y, 5), "anchor:'a' → 固定 TA，移动 " + TB + " 到 y=15");
  ok(near(n2.fittings[TB].pos.y, 15) && near(n2.segments[iB.segB].length, 5), '下游锚固段随之吸收为 5m');
  /* anchor:'b' → 固定 TB 为基准，移 TA（接头随长度反向移动） */
  const n3 = cp();
  const rB = n3.setSegmentLength(midSeg, 10, { anchor: 'b' });
  ok(rB.ok && rB.movedFitting === TA, "anchor:'b' → 被移动的是 " + TA + '（TB 作为基准不动）');
  ok(near(n3.fittings[TA].pos.y, 2) && near(n3.fittings[TB].pos.y, 12), 'TA 按新长度移到 y=2，TB 原地不动');
  ok(near(n3.segments[iA.segA].length, 2), 'TA 上游锚固段随动吸收为 2m');
  ok(near(n3.segments[iB.segB].length, 8), 'TB 下游锚固段保持 8m');
  ok(portWiringOk(n3) && n3.validate().every(function (i) { return i.level !== 'error'; }), '接线完整、validate 无 error');
  /* moveFitting 显式指定移动端配件 */
  const n4 = cp();
  const rM = n4.setSegmentLength(midSeg, 10, { moveFitting: TA });
  ok(rM.ok && rM.movedFitting === TA, 'moveFitting 显式指定移动 ' + TA + ' 生效');
  /* 反向：垂直支管上以三通为移动端 → 必然把三通推离主管轴 → 必须拒绝并给出替代操作提示 */
  const c = mkTeeWithFreeBranch();
  const snap = c.net._snap();
  const rPerp = c.net.setSegmentLength(c.brSeg, 9, { anchor: 'b' });
  ok(!rPerp.ok && /轴|弯折/.test(rPerp.reason || ''),
    '垂直支管上以三通为移动端 → 拒绝（三通须始终落在主管轴线上）：' + (rPerp.reason || '').slice(0, 34));
  ok(/提示/.test(rPerp.reason || ''), '拒绝原因附带可操作的替代建议');
  ok(c.net._snap() === snap, '拒绝后模型逐字节零副作用');
}

/* === M2) 显式指定移动一个「固定锚点」→ 拒绝并给出原因 === */
console.log('== M2) 显式把固定锚点当移动端 → 拒绝（不静默破坏约束）==');
{
  const net = new ConstructionNetwork().fromPlan(mkSimple());
  const mainSeg = Object.values(net.segments).find(function (s) { return s.kind === 'main'; });
  const anchorEnd = net.fixed[mainSeg.a.fitting] ? mainSeg.a.fitting : mainSeg.b.fitting;
  const r = net.setSegmentLength(mainSeg.id, 12, { moveFitting: anchorEnd });
  ok(!r.ok && /固定/.test(r.reason || ''), '拒绝并说明该端是固定锚点：' + (r.reason || '').slice(0, 40));
  ok(near(net.segments[mainSeg.id].length, 20), '被拒后长度零变化');
  const r2 = net.setSegmentLength(mainSeg.id, 12, { anchor: 'a', moveEnd: 'a' });
  ok(!r2.ok, 'anchor 与 moveEnd 自相矛盾 → 拒绝');
}

/* === M3) 直管两端锚固 + 三通 + 自由分支：改段长 → 三通沿轴移动、分支整体随动 === */
console.log('== M3) 直管上的三通：改相邻段长 → 三通沿轴移动，自由分支整体随动（位移一致）==');
{
  const c = mkTeeWithFreeBranch();
  const net = c.net;
  const teeBefore = endPos(net, c.teeId), endBefore = endPos(net, c.brEnd);
  const brLenBefore = net.segments[c.brSeg].length;
  const r = net.setSegmentLength(c.up, 8);
  ok(r.ok, '改上游锚固段(5→8m)成功');
  ok(near(net.fittings[c.teeId].pos.x, 10) && near(net.fittings[c.teeId].pos.y, 8), '三通沿主管轴移到 y=8');
  const dx = net.fittings[c.teeId].pos.x - teeBefore.x, dy = net.fittings[c.teeId].pos.y - teeBefore.y;
  const ex = net.fittings[c.brEnd].pos.x - endBefore.x, ey = net.fittings[c.brEnd].pos.y - endBefore.y;
  ok(near(dx, ex) && near(dy, ey), '自由分支末端位移与三通完全一致（整体平移）');
  ok(near(net.segments[c.brSeg].length, brLenBefore), '分支长度保持不变（未拉断/未拉伸）');
  ok(near(net.segments[c.down].length, 12), '下游段吸收为剩余长度 12m');
  ok(portWiringOk(net), '接线完整');
}

/* === M4) 真实三级网：改主管段长 → 三通/阀门随动、支管在锚固线上重新切分 === */
console.log('== M4) 真实三级网：改主管段长 → 三通+阀门随动，锚固支管沿轴线重新切分 ==');
{
  const net = new ConstructionNetwork().fromPlan(mkData());
  const tee = net.fittings['T-V1'], v1 = net.fittings['V1'];
  const teeY0 = tee.pos.y, v1Y0 = v1.pos.y;
  const brSegs = net.segmentsOf('V1').filter(function (s) { return s.kind === 'branch'; });
  const brSum0 = brSegs.reduce(function (a, s) { return a + s.length; }, 0);
  ok(brSegs.length === 2 && near(brSum0, 88), '前置：阀门 V1 位于支管链内部（两段合计 88m）');
  const up = net.segmentsOf('T-V1').find(function (s) { return s.kind === 'main' && net.fittings[other(net, s, 'T-V1')].pos.y < teeY0; });
  ok(!!up, '前置：找到三通上游主管段 ' + (up && up.id));
  const r = net.setSegmentLength(up.id, up.length + 5);
  ok(r.ok, '改上游主管段长(+5m)成功（不再误报刚性冲突）：' + (r.ok ? '' : r.reason));
  if (r.ok) {
    ok(near(tee.pos.y, teeY0 + 5), '三通 T-V1 沿主管轴随长度移动 5m');
    ok(near(v1.pos.x, 60) && near(v1.pos.y, v1Y0 + 5), '阀门 V1 随三通整体随动 5m（仍落在支管轴线上）');
    const brSum1 = net.segmentsOf('V1').filter(function (s) { return s.kind === 'branch'; }).reduce(function (a, s) { return a + s.length; }, 0);
    ok(near(brSum1, brSum0), '锚固支管两子段长度和守恒（沿原管线重新切分，未拉长）');
    ok(net.segmentsOf('V1').filter(function (s) { return s.kind === 'branch'; }).every(function (s) { return s.length > 0.05; }),
      '子段均大于最小管长');
    ok(portWiringOk(net) && net.validate().every(function (i) { return i.level !== 'error'; }),
      '随动后接线完整、validate 无 error');
    /* 报告 */
    ok(Array.isArray(r.affectedFittings) && r.affectedFittings.indexOf('V1') >= 0, '报告 affectedFittings 含阀门 V1');
    ok(Array.isArray(r.absorbedSegments) && r.absorbedSegments.length >= 3, '报告 absorbedSegments 记录自动改长的锚固段');
  }
}

/* === M5) 反向：三通横向离开主管 → 拦截、零副作用 === */
console.log('== M5) 反向：接头离开原管轴 → 拦截、逐字节零副作用 ==');
{
  const net = new ConstructionNetwork().fromPlan(mkData());
  const snap = net._snap();
  const t = net.fittings['T-V1'];
  const r = net.moveFitting('T-V1', { x: t.pos.x + 10, y: t.pos.y });
  ok(!r.ok && /轴|弯折|折返/.test(r.reason || ''), '离开原管轴被拦截：' + (r.reason || '').slice(0, 44));
  ok(net._snap() === snap, '拦截后模型逐字节复原');
}

/* === M6) 反向：沿轴推过头（越过支管锚固端）→ 拦截、零副作用 === */
console.log('== M6) 反向：沿轴推过锚固端 → 拦截、零副作用 ==');
{
  const net = new ConstructionNetwork().fromPlan(mkData());
  const snap = net._snap();
  const r = net.setSegmentLength(
    net.segmentsOf('T-V1').find(function (s) { return s.kind === 'main' && net.fittings[other(net, s, 'T-V1')].pos.y < net.fittings['T-V1'].pos.y; }).id,
    63);
  ok(!r.ok, '推过支管锚固端被拦截：' + (r.reason || '').slice(0, 44));
  ok(net._snap() === snap, '拦截后模型逐字节复原（无静默拉断）');
  ok(portWiringOk(net), '接线完好');
}

/* === M7) 反向：管段两端皆固定锚点 → 拒绝，并提示可解除固定 === */
console.log('== M7) 反向：两端皆锚固 → 拒绝并提示解除固定 ==');
{
  const net = new ConstructionNetwork().fromPlan(mkData());
  /* 总管链两端锚固，中间插一个阀门 → 得到「两端锚固」的直段需要人为构造：
     取总管第一段，其 a 端为锚点；把 b 端也固定后改长 → 必拒 */
  const frontSeg = Object.values(net.segments).find(function (s) { return s.kind === 'front'; });
  net.pin(frontSeg.a.fitting); net.pin(frontSeg.b.fitting);
  const r = net.setSegmentLength(frontSeg.id, frontSeg.length + 3);
  ok(!r.ok && /固定/.test(r.reason || ''), '两端锚固拒绝：' + (r.reason || '').slice(0, 44));
  ok(/解除/.test(r.reason || ''), '提示可解除固定（给出可行路径）');
}

/* === M8) 预览无副作用：事务内改长 → 取消 → 逐字节复原 === */
console.log('== M8) 预览无副作用：事务内联动手柄改长 → 取消逐字节复原 ==');
{
  const net = new ConstructionNetwork().fromPlan(mkData());
  const snap = net._snap();
  net.beginEdit();
  const up = net.segmentsOf('T-V1').find(function (s) { return s.kind === 'main' && net.fittings[other(net, s, 'T-V1')].pos.y < net.fittings['T-V1'].pos.y; });
  net.setSegmentLength(up.id, up.length + 5);
  ok(net._snap() !== snap, '预览已产生联动效果（图中可见）');
  net.cancelEdit();
  ok(net._snap() === snap, '取消后逐字节复原（含所有随动配件）');
  /* 确认提交 → 一步撤销 */
  net.beginEdit();
  net.setSegmentLength(up.id, up.length + 5);
  net.commitEdit();
  ok(net.undo() && net._snap() === snap, '确认后一步撤销完整恢复全部随动');
}

/* =====================================================================
 * M9–M15（2026-09-15）修复验收：「改长被拒：移动将使管段离开原管轴弯折」
 *
 * 契约（用户 7 条要求）：
 *  1) 配件沿当前管道轴线移动 → 下游管段**整体平移**（length 与 dir 保持不变），
 *     不再把「远端锚点位置随动」误判成「离开原管轴弯折」；
 *  2) 三通沿总管轴线移动时，相连的自由分支/阀门/弯头/管段一起平移，刚性段 length+dir 保持；
 *  3) 下游远端是**硬锚**（用户【固定】/水源 SRC/施工起点）→ 才拒绝，且指名冲突锚点并给出
 *     替代基准端；fromPlan 的**图纸折线拐点/链端点（图纸锚）**可随动平移（releasedFittings）；
 *  4) 总管两端硬锚时改中段：一侧增长、另一侧缩短（末段沿既有管线重新切分吸收），
 *     三通沿轴滑动、下游跟随，总长/两侧长度满足输入；
 *  5) 失败时模型（长度/位置/接口）与撤销栈完整恢复；成功时给出随动报告。
 * 反向保留（真实安全拦截）：离开原管轴、越过锚固端折返、两端硬锚、闭环不一致。
 * ===================================================================== */
console.log('== M9) 用户报错场景复现：改总管段长 → 三通沿轴滑动、下游整体跟随，不再误报弯折 ==');
{
  const net = new ConstructionNetwork().fromPlan(mkData());
  const S1 = Object.values(net.segments).find(function (s) { return s.kind === 'front' && near(s.length, 32); });
  const riser = net.segmentsOf('T-M1').find(function (s) { return s.kind === 'riser'; });
  const brSeg = net.segmentsOf('V1').find(function (s) { return s.kind === 'branch' && net.fittings[s.b.fitting].pos.y > 50; });
  const teeX0 = net.fittings['T-M1'].pos.x, ep3X0 = net.fittings['E-P3'].pos.x;
  const rLen0 = riser.length, rDir0 = JSON.stringify(riser.dir);
  const bLen0 = brSeg.length, bDir0 = JSON.stringify(brSeg.dir), be0 = endPos(net, 'E-P9');
  const r = net.setSegmentLength(S1.id, 34);
  ok(r.ok, '改总管段 32→34m 成功（不再误报「离开原管轴弯折」）：' + (r.ok ? '' : r.reason));
  if (r.ok) {
    ok(near(net.fittings['T-M1'].pos.x, teeX0 + 2) && near(net.fittings['T-M1'].pos.y, -20), '三通 T-M1 沿总管轴线滑动 +2m');
    ok(near(riser.length, rLen0) && JSON.stringify(riser.dir) === rDir0, '立管长度与方向逐字段保持（整体平移）');
    ok(near(brSeg.length, bLen0) && JSON.stringify(brSeg.dir) === bDir0, '刚性支管段长度与方向保持（未被拉长/旋转）');
    ok(near(endPos(net, 'E-P9').x, be0.x + 2) && near(endPos(net, 'E-P9').y, be0.y), '支管链整体平移 +2m（位移与三通一致）');
    ok(near(net.fittings['E-P3'].pos.x, ep3X0 + 2), '主管起点（图纸锚）随动平移 +2m');
    const front = Object.values(net.segments).filter(function (s) { return s.kind === 'front'; });
    ok(near(front.reduce(function (a, s) { return a + s.length; }, 0), 34 + 100 + 100 + 66), '总管：一侧增长(S1 32→34)、另一侧缩短(末段 68→66)');
    ok((r.translatedSegments || []).indexOf(riser.id) >= 0, '报告 translatedSegments 含整体平移的立管段');
    ok((r.releasedFittings || []).indexOf('E-P3') >= 0, '报告 releasedFittings 含随动的图纸锚 E-P3');
    ok((r.affectedFittings || []).length > 0 && (r.absorbedSegments || []).indexOf(front[3].id) >= 0,
      '报告带动配件数与重新切分的锚固段（末段）');
    ok(portWiringOk(net) && net.validate().every(function (i) { return i.level !== 'error'; }), '随动后接线完整、validate 无 error');
  }
}

console.log('== M10) 总管中间三通 + 刚性支管（末端自由）：改总管长 → 三通沿轴滑动、支管整体平移 ==');
{
  const net = mkTrunk();
  const b1Len0 = net.segments.S4.length, b1Dir0 = JSON.stringify(net.segments.S4.dir);
  const r = net.setSegmentLength('S2', 14);                        // 缺省：移动 b 端（T2）
  ok(r.ok && r.movedFitting === 'T2', '改中间总管段 10→14m 成功，移动 T2');
  ok(near(net.fittings.T2.pos.x, 24) && near(net.fittings.T1.pos.x, 10), 'T2 沿总管轴滑到 x=24，T1 不动');
  ok(near(net.segments.S5.length, 6) && JSON.stringify(net.segments.S5.dir) === JSON.stringify({ x: 0, y: 1 }),
    'T2 的刚性支管 length/dir 保持');
  ok(near(endPos(net, 'B2').x, 24) && near(endPos(net, 'B2').y, 6), '支管末端整体平移（T2→B2 相对位形不变）');
  ok(near(endPos(net, 'B1').x, 10) && near(net.segments.S4.length, b1Len0) && JSON.stringify(net.segments.S4.dir) === b1Dir0,
    '未涉及的另一条支管零变化');
  ok(near(net.segments.S3.length, 6), '下游末端段沿既有总管重新切分（10→6，长度和守恒）');
  ok(portWiringOk(net) && net.validate().every(function (i) { return i.level !== 'error'; }), '接线完整、validate 无 error');
  /* 以另一端为基准端（移 T1）→ 三通反向滑动，支管同样整体跟随（新网，避免沿用上一步位移） */
  const n2 = mkTrunk();
  const r2 = n2.setSegmentLength('S2', 14, { anchor: 'b' });
  ok(r2.ok && r2.movedFitting === 'T1', "anchor:'b' → 移动 T1");
  ok(near(n2.fittings.T1.pos.x, 6) && near(endPos(n2, 'B1').x, 6), 'T1 滑到 x=6，支管 B1 整体跟随');
  ok(near(n2.segments.S1.length, 6) && near(n2.segments.S5.length, 6), '上游端段重新切分吸收，支管长度不变');
}

console.log('== M11) 支管末端【固定】(硬锚) → 才拒绝：指名锚点 + 零副作用 + 不残留撤销 ==');
{
  const net = mkTrunk();
  net.pin('B1');                                    // 用户【固定】= 硬锚（墙）
  const snap = net._snap(), undo0 = net.canUndo();
  const r = net.setSegmentLength('S1', 12);         // 移 T1 会拉直支管 → 几何无法满足
  ok(!r.ok, '支管末端为硬锚且几何无法满足 → 拒绝：' + (r.reason || '').slice(0, 40));
  ok(/B1/.test(r.reason || ''), '拒绝原因指名冲突锚点 B1');
  ok(r.blockedBy === 'B1' && r.conflict && r.conflict.kind === 'hardAnchor', '结构化报告 blockedBy / kind=hardAnchor');
  ok(Array.isArray(r.alternatives) && r.alternatives.length === 1, '给出替代基准端建议');
  ok(net._snap() === snap, '拒绝后模型逐字节零副作用（长度/位置/接口）');
  ok(net.canUndo() === undo0, '撤销栈无残留');
}

console.log('== M12) 零长接驳段（主管起点正好落在总管上）改总管长：不挂死、主管链随动 ==');
{
  const net = new ConstructionNetwork().fromPlan(mkFlatStart());
  const riser = Object.values(net.segments).find(function (s) { return s.kind === 'riser'; });
  ok(near(riser.length, 0), '前置：主管起点与总管重合 → 立管为 0m 接驳段');
  const S1 = Object.values(net.segments).find(function (s) { return s.kind === 'front' && near(s.length, 32); });
  const r = net.setSegmentLength(S1.id, 34);
  ok(r.ok, '改总管长成功（零长段随动保持重合，不进入不收敛分支）：' + (r.ok ? '' : r.reason));
  ok(near(net.fittings['T-M1'].pos.x, 34) && near(net.fittings['E-P3'].pos.x, 34) && near(net.fittings['E-P3'].pos.y, 0),
    '三通与主管起点重合且整体随动到 x=34');
  ok(net.validate().every(function (i) { return i.level !== 'error'; }), 'validate 无 error');
}

console.log('== M13) 保留真实拦截：离开原管轴 / 越过锚固端折返 / 两端硬锚 ==');
{
  /* a) 横向推三通（离开主管轴）→ 拒绝（共轴守卫），且零副作用 */
  const n1 = new ConstructionNetwork().fromPlan(mkData());
  const s1 = n1._snap(), t1 = n1.fittings['T-V1'];
  const rA = n1.moveFitting('T-V1', { x: t1.pos.x + 10, y: t1.pos.y });
  ok(!rA.ok && /共轴|管轴/.test(rA.reason || ''), '离开原管轴被拦截：' + (rA.reason || '').slice(0, 34));
  ok(n1._snap() === s1, '拦截后模型逐字节零变化');
  /* b) 沿轴推过支管锚固端（折返）→ 拒绝 */
  const n2 = new ConstructionNetwork().fromPlan(mkData());
  const up2 = n2.segmentsOf('T-V1').find(function (s) { return s.kind === 'main' && n2.fittings[other(n2, s, 'T-V1')].pos.y < 18; });
  const rB = n2.setSegmentLength(up2.id, 63);
  ok(!rB.ok && (rB.conflict && rB.conflict.kind === 'overshoot'), '越过锚固端折返被拦截：' + (rB.reason || '').slice(0, 34));
  /* c) 两端硬锚 → 拒绝 */
  const n3 = new ConstructionNetwork().fromPlan(mkData());
  const fs = Object.values(n3.segments).find(function (s) { return s.kind === 'front' && near(s.length, 32); });
  n3.pin(fs.a.fitting); n3.pin(fs.b.fitting);
  const rC = n3.setSegmentLength(fs.id, fs.length + 3);
  ok(!rC.ok && /两端|固定/.test(rC.reason || ''), '两端硬锚改长被拒：' + (rC.reason || '').slice(0, 34));
}

console.log('== M14) 自动换基准端：一侧被硬锚挡住 → 自动改用另一端（一侧增长、另一侧缩短）==');
{
  const net = mkTrunk();
  net.pin('B2');                                    // T2 的支管末端固定 → 动 T2 必冲突
  const r = net.setSegmentLength('S2', 14);         // 缺省先试 b 端(T2) → 失败 → 自动改 a 端(T1)
  ok(r.ok && r.switchedBase === true, '自动改用另一端为基准端并成功：' + (r.ok ? '' : r.reason));
  ok(r.movedFitting === 'T1' && r.blockedBaseEnd === 'b' && r.blockedBy === 'B2',
    '报告 switchedBase/blockedBaseEnd= b/blockedBy=B2');
  ok(near(net.fittings.T1.pos.x, 6) && near(net.segments.S1.length, 6), 'T1 反向滑动，上游端段随之缩短');
  ok(near(net.segments.S5.length, 6) && near(endPos(net, 'B2').x, 20), '被固定一侧模型保持（B2 未被动过）');
  ok(portWiringOk(net) && net.validate().every(function (i) { return i.level !== 'error'; }), '接线完整、validate 无 error');
}

console.log('== M15) 预览无副作用：事务内联动改长 → 取消/撤销逐字节复原（含图纸锚随动）==');
{
  const net = new ConstructionNetwork().fromPlan(mkData());
  const S1 = Object.values(net.segments).find(function (s) { return s.kind === 'front' && near(s.length, 32); });
  const snap = net._snap();
  net.beginEdit();
  const r = net.setSegmentLength(S1.id, 34);
  ok(r.ok && net._snap() !== snap, '事务内改长产生联动效果（图中可见）');
  net.cancelEdit();
  ok(net._snap() === snap, '取消后逐字节复原（含所有随动配件与图纸锚）');
  net.beginEdit();
  net.setSegmentLength(S1.id, 34);
  net.commitEdit();
  ok(net.undo() && net._snap() === snap, '确认后一步撤销完整恢复全部随动');
}

console.log('== M16) 图纸拐点锚（◇）显式作为移动端 → 放行尝试（不再按「它是锚点」分类误拒）==');
{
  /* (a) 移得动 → 必须成功：显式指定 ◇ 拐点 C 为移动端，下游刚性主管 M1 整体平移（len/dir 不变）。
   *     修复前这里会被「指定移动端 C 是固定锚点（◆）」直接拒掉（面板却写「◇允许随动平移」）。 */
  const net = mkSoftCorner();
  const m1 = net.segments.M1, d0 = { x: m1.dir.x, y: m1.dir.y };
  const r = net.setSegmentLength('R1', 8, { moveFitting: 'C' });
  ok(r.ok, '◇ 拐点 C 显式作为移动端 → 放行并成功：' + (r.ok ? '' : (r.reason || '').slice(0, 60)));
  ok(r.ok && r.movedFitting === 'C' && near(net.fittings.C.pos.y, 8), 'C 沿共线轴移到 y=8，R1 落到 8m');
  ok(near(net.segments.M1.length, 10) && near(m1.dir.x, d0.x) && near(m1.dir.y, d0.y),
    '下游刚性主管 M1 长度(10m)与方向均保持不变（整体平移，未拉伸/未旋转）');
  ok(near(endPos(net, 'D').y, 18) && near(endPos(net, 'D').x, 10), 'M1 自由端 D 随之整体平移 +2m（下游连接未破）');
  ok((r.affectedFittings || []).indexOf('D') >= 0, '随动报告 applicable：affectedFittings 含 D');
  ok(near(endPos(net, 'J').y, 0), '总管三通 J 未被带离总管轴（仍在 y=0）');
  ok(portWiringOk(net) && net.validate().every(function (i) { return i.level !== 'error'; }), '接线完整、validate 无 error');

  /* (b) 移不动 → 仍须拒绝，但理由必须是**真实几何冲突**（端点无法保持长度/方向），
   *    不得再回「是固定锚点（◆）」这类分类理由。 */
  const net2 = mkSoftCorner();
  const snap2 = net2._snap();
  const r2 = net2.setSegmentLength('M1', 8, { moveFitting: 'C' });
  ok(!r2.ok, '几何上真做不到时仍然拒绝（不放行非法结果）');
  ok(!/是固定锚点（◆）/.test(r2.reason || ''), '拒绝理由不再是「是固定锚点（◆）」分类误报');
  ok(/无法保持长度\/方向|折返|越过锚固端|轴线/.test(r2.reason || ''),
    '拒绝理由是真实几何冲突：' + (r2.reason || '').slice(0, 60));
  ok(net2._snap() === snap2, '拒绝后模型逐字节零副作用');
}

console.log('== M17) 硬固定锚（◆）显式作为移动端 → 分类拒绝（真墙，快捷失败）==');
{
  const net = mkTrunk();                          // E-A / E-B = 硬锚（◆）
  const snap = net._snap();
  const r = net.setSegmentLength('S1', 12, { moveFitting: 'E-A' });
  ok(!r.ok && /硬固定锚点（◆）/.test(r.reason || ''),
    '◆ 硬锚作移动端 → 分类拒绝（措辞不再混用「固定锚点」）：' + (r.reason || '').slice(0, 44));
  ok(net._snap() === snap, '零副作用');
  const net2 = mkTrunk();
  net2.fixed['T1'] = true; net2.hardFixed['T1'] = true;   // 造出「两端皆硬锚」的管段 S1
  const r2 = net2.setSegmentLength('S1', 12, { moveFitting: 'T1' });
  ok(!r2.ok && /两端均为硬固定锚点（◆）/.test(r2.reason || ''),
    '两端皆硬锚 → 分类拒绝并提示可先解除固定：' + (r2.reason || '').slice(0, 44));
}

console.log('');
console.log('合计：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
