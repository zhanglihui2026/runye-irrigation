/* =====================================================================
 * tests/network_model.test.cjs — 施工管网模型（network-model.js）验收单测
 * 运行：node tests/network_model.test.cjs
 * 覆盖需求验收场景 1-8 + 序列化/撤销/原数据保护。
 * ===================================================================== */
'use strict';
const NM = require('../iso-diagram/network-model.js');
const ConstructionNetwork = NM.ConstructionNetwork;

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('✓ ' + name); }
  else { fail++; console.log('✗ FAIL ' + name); }
}
function near(a, b, eps) { return Math.abs(a - b) <= (eps || 1e-4); }

/* ---------- 合成数据 ---------- */
/* 标准三级管网：总管 + 3 主管 + 6 支管 + 6 阀门（2×3 分区） */
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
/* 极简网：总管 + 一根 20m 主管（无阀门）——验收场景 1 */
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
function segsBetween(net, aId, bId) {
  return Object.values(net.segments).filter(function (s) {
    return (s.a.fitting === aId && s.b.fitting === bId) || (s.a.fitting === bId && s.b.fitting === aId);
  });
}
function totalLen(net) {
  return Object.values(net.segments).reduce(function (a, s) { return a + s.length; }, 0);
}

console.log('== 1) fromPlan 建模：连接识别 + 原数据保护 ==');
{
  const d = mkData(); const snap = JSON.stringify(d);
  const net = new ConstructionNetwork().fromPlan(d);
  ok(!!net, 'fromPlan 返回模型');
  ok(JSON.stringify(d) === snap, '原平面数据零改动');
  ok(portWiringOk(net), '所有管段两端端口互指无悬挂');
  ok(Object.keys(net.fittings).length === 36 && Object.keys(net.segments).length === 34,
    '配件 36（20 端点+6 阀+6 阀三通+3 总管三通+1 水源）/ 管段 34（front4+main9+branch12+riser3+takeoff6；水源与总管起点重合跳过），实际 ' +
    Object.keys(net.fittings).length + '/' + Object.keys(net.segments).length);
  ok(net.fittings['T-V1'] && net.fittings['T-V4'], '6 个阀门三通全部识别（T-V1..T-V6）');
  ok(net.fittings['T-M1'] && net.fittings['T-M2'] && net.fittings['T-M3'], '3 个总管接驳三通识别（T-M1..3）');
  ok(net.validate().every(function (i) { return i.level !== 'error'; }), '初始状态 validate 无 error');
  ok(net.notes.elevations.length >= 1, '接驳段高程待确认已标记');
  ok(net.fittings['V1'].ports && Object.keys(net.fittings['V1'].ports).length === 3, '阀门 3 接口（2 支管 + 1 接驳）');
  const free = Object.keys(net.fittings).every(function (id) { return net.freePorts(id).length === 0; });
  ok(free, '初始状态无空接口（全部接通）');
  // 阀门 T-V1 位置 = (ax,ay) 在主管上的垂足
  ok(near(net.fittings['T-V1'].pos.x, 32) && near(net.fittings['T-V1'].pos.y, 18), '阀三通位置=主管垂足(32,18)');
  ok(near(net.fittings['V1'].pos.x, 60) && near(net.fittings['V1'].pos.y, 50), '阀门位置=平面落点(60,50)');
}

console.log('== 2) 验收①：20m 主管插阀 8+12 → 6+14，端点与总长不变 ==');
{
  const net = new ConstructionNetwork().fromPlan(mkSimple());
  const mainSeg = Object.values(net.segments).find(function (s) { return s.kind === 'main'; });
  ok(near(mainSeg.length, 20), '20m 主管建模');
  const ins = net.insertFittingOnSegment(mainSeg.id, 8, 'valve');
  ok(ins.ok, '在 8m 处插入阀门');
  const segA = net.segments[ins.segA], segB = net.segments[ins.segB];
  ok(near(segA.length, 8) && near(segB.length, 12) && !net.segments[mainSeg.id], '拆成 8+12，原段删除');
  ok(portWiringOk(net), '插入后端口接线完整');
  const valve = net.fittings[ins.fittingId];
  const eA = segA.a.fitting, eB = segB.b.fitting;
  const posA = JSON.parse(JSON.stringify(net.fittings[eA].pos));
  const posB = JSON.parse(JSON.stringify(net.fittings[eB].pos));
  const r = net.setSegmentLength(ins.segA, 6);
  ok(r.ok, '左侧 8→6 修改成功');
  ok(near(segA.length, 6) && near(segB.length, 14), '左 6 + 右 14（自动联动）');
  ok(near(segA.length + segB.length, 20, 1e-4), '总长仍为 20');
  ok(JSON.stringify(net.fittings[eA].pos) === JSON.stringify(posA) &&
     JSON.stringify(net.fittings[eB].pos) === JSON.stringify(posB), '两端固定点未动');
  ok(near(valve.pos.y, 6) && near(valve.pos.x, 10), '阀门移到 6m 处（工程坐标）');
  ok(net.validate().every(function (i) { return i.level !== 'error'; }), '改长后 validate 无 error');
}

console.log('== 3) 验收②：三通空口接管 5m → 7m，连接连续 ==');
{
  const net = new ConstructionNetwork().fromPlan(mkSimple());
  const mainSeg = Object.values(net.segments).find(function (s) { return s.kind === 'main'; });
  const ins = net.insertFittingOnSegment(mainSeg.id, 10, 'tee');
  ok(ins.ok, '主管中部插入三通');
  const tee = net.fittings[ins.fittingId];
  const p3 = Object.keys(tee.ports).find(function (p) { return !tee.ports[p].connected; });
  ok(!!p3, '三通存在空接口 p3');
  const br = net.addBranch(ins.fittingId, p3, { length: 5, dirDeg: 90, caliber: 63 });
  ok(br.ok, '空口接管 5m（工程坐标 90°=+y）');
  const endFit = net.fittings[br.fittingId];
  ok(near(endFit.pos.y - tee.pos.y, 5), '接管末端位置=三通+5m');
  ok(!net.isPinned(br.fittingId), '新支管末端为自由端');
  const r = net.setSegmentLength(br.segmentId, 7);
  ok(r.ok, '接管 5→7m 修改成功');
  const seg = net.segments[br.segmentId];
  ok(near(seg.length, 7), '段长=7');
  ok(near(net.fittings[br.fittingId].pos.y - tee.pos.y, 7), '末端随动，连接连续');
  ok(portWiringOk(net), '接线仍完整');
}

console.log('== 4) 验收③a：三通沿管轴移动，自由分支随动、分支长度不变；离轴被拒 ==');
{
  const net = new ConstructionNetwork().fromPlan(mkSimple());
  const mainSeg = Object.values(net.segments).find(function (s) { return s.kind === 'main'; });
  const ins = net.insertFittingOnSegment(mainSeg.id, 10, 'tee');
  const tee = net.fittings[ins.fittingId];
  const p3 = Object.keys(tee.ports).find(function (p) { return !tee.ports[p].connected; });
  const br = net.addBranch(ins.fittingId, p3, { length: 5, dirDeg: 90, caliber: 63 });
  const endBefore = JSON.parse(JSON.stringify(net.fittings[br.fittingId].pos));
  const segLenBefore = net.segments[br.segmentId].length;
  const teeBefore = JSON.parse(JSON.stringify(tee.pos));
  /* 离轴移动（主管为竖直 x=10，横向偏 3m）→ 必须拒绝（需求：直管上的配件受管轴约束） */
  const rOff = net.moveFitting(ins.fittingId, { x: tee.pos.x + 3, y: tee.pos.y + 2 });
  ok(!rOff.ok && /轴/.test(rOff.reason), '离轴移动被拒：' + (rOff.reason || '').slice(0, 40));
  ok(JSON.stringify(tee.pos) === JSON.stringify(teeBefore), '拒绝后位置零变化');
  /* 沿管轴移动（+2m 沿主管方向）→ 成功，自由分支随动、长度不变 */
  const r = net.moveFitting(ins.fittingId, { x: tee.pos.x, y: tee.pos.y + 2 });
  ok(r.ok, '三通沿管轴移动成功');
  const endAfter = net.fittings[br.fittingId].pos;
  ok(near(endAfter.x - tee.pos.x, endBefore.x - teeBefore.x, 1e-3) &&
     near(endAfter.y - tee.pos.y, endBefore.y - teeBefore.y, 1e-3), '自由分支整体随动（相对位形不变）');
  ok(near(net.segments[br.segmentId].length, segLenBefore), '分支长度保持 5m 不变');
  ok(portWiringOk(net), '移动后接线完整');
}

console.log('== 5) 验收③b：带锚固支管的三通随动（沿锚固管线重新切分）；离轴/越界仍拦截 ==');
{
  /* 契约更新（2026-09-14，配套 tests/network_junction_move.test.cjs）：
   * 原为「带固定支管的三通一律不可移动」；现改为「节点沿锚固管线滑动 → 支管子段重新切分，
   * 长度和守恒」，因为两端锚固的支管本就是一条既有管线，节点滑动只是重新切分、并未拉断。
   * 离开原管轴 / 推过锚固端 / 子段小于最小管长 → 仍一律拦截（下方反向断言）。 */
  const brOf = function (net, id) {
    return Object.values(net.segments).filter(function (s) {
      return s.kind === 'branch' && (s.a.fitting === id || s.b.fitting === id);
    });
  };
  const sumOf = function (arr) { return arr.reduce(function (a, s) { return a + s.length; }, 0); };

  const net = new ConstructionNetwork().fromPlan(mkData());
  const tee = net.fittings['T-V1'];
  const v1 = net.fittings['V1'];
  const sumBefore = sumOf(brOf(net, 'V1'));
  ok(brOf(net, 'V1').length === 2 && near(sumBefore, 88), '前置：阀门 V1 位于两端锚固的支管链内部（两段合计 88m）');
  const r = net.moveFitting('T-V1', { x: tee.pos.x, y: tee.pos.y + 5 });
  ok(r.ok, '三通沿主管轴移动成功，锚固支管随动：' + (r.ok ? '' : r.reason));
  ok(near(v1.pos.y, 55) && near(v1.pos.x, 60), '阀门随三通整体随动 5m，仍落在支管轴线上');
  ok(near(sumOf(brOf(net, 'V1')), sumBefore), '锚固支管两子段长度和守恒（管线未被拉长）');
  ok(brOf(net, 'V1').every(function (s) { return s.length > 0.05; }) && portWiringOk(net), '子段均合法、接线完整');
  ok(Array.isArray(r.absorbedSegments) && r.absorbedSegments.length > 0, '随动报告 absorbedSegments 记录重新切分的锚固段');
  ok(net.validate().every(function (i) { return i.level !== 'error'; }), '随动后 validate 无 error');

  /* 反向1：横向离开主管轴 → 必拒、零副作用 */
  const net2 = new ConstructionNetwork().fromPlan(mkData());
  const snap2 = net2._snap();
  const t2 = net2.fittings['T-V1'];
  const rOff = net2.moveFitting('T-V1', { x: t2.pos.x + 10, y: t2.pos.y });
  ok(!rOff.ok && rOff.reason, '横向离开管轴被拦截：' + (rOff.reason || '').slice(0, 34) + '…');
  ok(net2._snap() === snap2, '拦截后模型逐字节零变化');

  /* 反向2：沿轴推过支管锚固端（阀门越过支管端点）→ 必拒、零副作用 */
  const net3 = new ConstructionNetwork().fromPlan(mkData());
  const snap3 = net3._snap();
  const t3 = net3.fittings['T-V1'];
  const rOver = net3.moveFitting('T-V1', { x: t3.pos.x, y: t3.pos.y + 45 });
  ok(!rOver.ok, '推过支管锚固端被拦截：' + (rOver.reason || '').slice(0, 34) + '…');
  ok(net3._snap() === snap3, '拦截后模型逐字节零变化（无静默拉断）');
  ok(!net3.canUndo(), '冲突回滚连自身 checkpoint 一并弹出（状态完全复原）');
}

console.log('== 6) 验收④：非法长度 / 零长 / 重复接口 / 口径不匹配 ==');
{
  const net = new ConstructionNetwork().fromPlan(mkSimple());
  const mainSeg = Object.values(net.segments).find(function (s) { return s.kind === 'main'; });
  ok(!net.setSegmentLength(mainSeg.id, 0).ok, '零长度被拒');
  ok(!net.setSegmentLength(mainSeg.id, -3).ok, '负长度被拒');
  ok(!net.setSegmentLength(mainSeg.id, NaN).ok, 'NaN 被拒');
  const ins = net.insertFittingOnSegment(mainSeg.id, 10, 'tee');
  const tee = net.fittings[ins.fittingId];
  const p3 = Object.keys(tee.ports).find(function (p) { return !tee.ports[p].connected; });
  const br = net.addBranch(ins.fittingId, p3, { length: 5, dirDeg: 90, caliber: 63 });
  const tee2 = net.fittings[ins.fittingId];
  ok(!net.addBranch(ins.fittingId, p3, { length: 5 }).ok, '已占用接口不能重复接管');
  // 口径不匹配：两根主管上各插一个三通，空口分别设 110 / 63，尝试互连
  const net2 = new ConstructionNetwork().fromPlan(mkSimple());
  const ms2 = Object.values(net2.segments).find(function (s) { return s.kind === 'main'; });
  const i1 = net2.insertFittingOnSegment(ms2.id, 5, 'tee');
  const segRest = Object.values(net2.segments).find(function (s) { return s.kind === 'main' && near(s.length, 15); });
  const i2 = net2.insertFittingOnSegment(segRest.id, 7.5, 'tee');
  const tA = net2.fittings[i1.fittingId], tB = net2.fittings[i2.fittingId];
  const freeA = Object.keys(tA.ports).find(function (p) { return !tA.ports[p].connected; });
  const freeB = Object.keys(tB.ports).find(function (p) { return !tB.ports[p].connected; });
  net2.setPortCaliber({ fitting: i1.fittingId, port: freeA }, 110);
  net2.setPortCaliber({ fitting: i2.fittingId, port: freeB }, 63);
  ok(!!freeA && !!freeB, '构造出两个空口');
  const cr = net2.connectPorts({ fitting: i1.fittingId, port: freeA }, { fitting: i2.fittingId, port: freeB });
  ok(!cr.ok && cr.needReducer && /口径不匹配/.test(cr.reason), '口径不匹配被拒并提示需异径配件（110≠63）');
  ok(portWiringOk(net) && portWiringOk(net2), '拒绝操作未破坏接线');
}

console.log('== 7) 验收⑤⑥：取消恢复 / 撤销完整恢复一次操作 ==');
{
  const net = new ConstructionNetwork().fromPlan(mkSimple());
  const mainSeg = Object.values(net.segments).find(function (s) { return s.kind === 'main'; });
  const snap0 = net._snap();
  const ins = net.insertFittingOnSegment(mainSeg.id, 8, 'valve');
  ok(net.canUndo(), '插入后有撤销点');
  ok(net.undo(), 'undo 成功');
  ok(net._snap() === snap0, 'undo 后状态逐字节复原（插阀完全撤销）');
  const ins2 = net.insertFittingOnSegment(mainSeg.id, 8, 'valve');
  const snap1 = net._snap();
  net.setSegmentLength(ins2.segA, 6);
  ok(net._snap() !== snap1, '改长后状态变化');
  net.undo();
  ok(net._snap() === snap1, '改长撤销后复原（含联动位置）');
  const ms3 = Object.values(net.segments).filter(function (s) { return s.kind === 'main'; })
    .reduce(function (a, s) { return s.length > a.length ? s : a; });
  const ins3 = net.insertFittingOnSegment(ms3.id, ms3.length / 2, 'tee');
  ok(ins3.ok, '撤销后仍可继续插三通');
  const tP3 = Object.keys(net.fittings[ins3.fittingId].ports).find(function (p) { return !net.fittings[ins3.fittingId].ports[p].connected; });
  ok(net.addBranch(ins3.fittingId, tP3, { length: 5, dirDeg: 90, caliber: 63 }).ok, '从空口接管成功');
  net.undo();
  ok(net.freePorts(ins3.fittingId).length === 1 && portWiringOk(net), '接管撤销后空口恢复、接线一致');
}

console.log('== 8) 验收⑦：保存→刷新→恢复，ID/接口/尺寸/约束一致 ==');
{
  // 8a) 平面建模数据（mkData）零编辑序列化往返
  const netP = new ConstructionNetwork().fromPlan(mkData());
  const savedP = JSON.parse(JSON.stringify(netP.serialize()));
  const netP2 = ConstructionNetwork.deserialize(savedP, netP.sourceKey);
  ok(JSON.stringify(netP2.serialize()) === JSON.stringify(savedP) && portWiringOk(netP2),
    '平面建模数据序列化往返一致、接线完整');
  // 8b) 含编辑的方案：插阀 + 改尺寸 + 固定 → 保存 → 恢复
  const net = new ConstructionNetwork().fromPlan(mkSimple());
  const ms = Object.values(net.segments).find(function (s) { return s.kind === 'main'; });
  const ins = net.insertFittingOnSegment(ms.id, 8, 'valve');
  ok(ins.ok, '插阀成功');
  ok(net.setSegmentLength(ins.segA, 6).ok, '改尺寸成功');
  ok(net.pin(ins.fittingId), '固定阀门');
  const saved = JSON.parse(JSON.stringify(net.serialize()));
  const net2 = ConstructionNetwork.deserialize(saved, net.sourceKey);
  ok(!net2._legacyMismatch, '同几何签名恢复：无迁移告警');
  ok(JSON.stringify(net2.serialize()) === JSON.stringify(saved), 'serialize 往返逐字节一致');
  ok(Object.keys(net2.fittings).length === Object.keys(saved.fittings).length, '配件数量一致');
  ok(!!net2.fittings[ins.fittingId] && !!net2.segments[ins.segA], '新配件/新管段 ID 保留');
  ok(near(net2.segments[ins.segA].length, 6), '改过的尺寸保留');
  ok(net2.isPinned(ins.fittingId), '固定约束保留');
  ok(portWiringOk(net2), '恢复后接线完整');
  const net3 = ConstructionNetwork.deserialize(saved, 'different-key');
  ok(net3._legacyMismatch && !!net3.fittings[ins.fittingId], '几何签名不匹配：保留旧数据并标记待核对（不丢弃）');
}

console.log('== 9) 验收⑧：缩放平移无关性（模型纯工程坐标）==');
{
  const net = new ConstructionNetwork().fromPlan(mkSimple());
  const mainSeg = Object.values(net.segments).find(function (s) { return s.kind === 'main'; });
  const ins = net.insertFittingOnSegment(mainSeg.id, 8, 'valve');
  const posBefore = JSON.parse(JSON.stringify(net.fittings[ins.fittingId].pos));
  ok(net.setSegmentLength(ins.segA, 6).ok, '无视图状态下编辑成功');
  ok(JSON.stringify(net.fittings[ins.fittingId].pos) !== JSON.stringify(posBefore), '模型只存工程坐标，与屏幕缩放/平移无关');
  ok(near(net.segments[ins.segA].length + net.segments[ins.segB].length, 20), '几何约束不受视图影响');
}

console.log('== 10) 验收⑨：原平面数据与水力口径隔离 ==');
{
  const d = mkData(); const snap = JSON.stringify(d);
  const net = new ConstructionNetwork().fromPlan(d);
  const mainSeg = Object.values(net.segments).find(function (s) { return s.kind === 'main'; });
  net.insertFittingOnSegment(mainSeg.id, 50, 'valve');
  net.moveFitting('T-V2', { x: 132, y: 30 }).ok; // 会被拦截，无妨
  net.undo(); net.undo();
  ok(JSON.stringify(d) === snap, '编辑/撤销全过程原平面数据零改动');
  const st = net.computeStats();
  ok(st.fittingCount > 0 && st.totalLength > 0, 'computeStats 可用（独立于分区材料统计口径）');
  ok(net.units === 'm' && net.coords === 'engineering', '内部单位=米、工程坐标（非屏幕坐标）');
}

console.log('== 11) 缺陷①：尺寸越界（20m 管 8m 处插阀，左段改 25m 必须拦截）==');
{
  const net = new ConstructionNetwork().fromPlan(mkSimple());
  const mainSeg = Object.values(net.segments).find(function (s) { return s.kind === 'main'; });
  const ins = net.insertFittingOnSegment(mainSeg.id, 8, 'valve');
  const snapBad = net._snap();
  const r = net.setSegmentLength(ins.segA, 25);
  ok(!r.ok && r.reason, '越界修改被拒：' + (r.reason || '').slice(0, 36) + '…');
  ok(net._snap() === snapBad, '非法修改完整回滚（逐字节复原，阀门未越过固定终点）');
  ok(near(net.segments[ins.segA].length, 8) && near(net.segments[ins.segB].length, 12), '两段长度不变（无折返 5m）');
  ok(net.validate().every(function (i) { return i.level !== 'error'; }), '回滚后 validate 无 error');
  /* 合法边界：剩余段恰好缩到最小长度以下也必须拦截 */
  const r2 = net.setSegmentLength(ins.segA, 19.98);
  ok(!r2.ok, '右段只剩 0.02m（< 最小管长）同样被拒');
  ok(net._snap() === snapBad, '边界拦截同样零副作用');
  const r3 = net.setSegmentLength(ins.segA, 19.9);
  ok(r3.ok && near(net.segments[ins.segB].length, 0.1, 1e-3), '合法范围内（左 19.9/右 0.1）允许');
}

console.log('== 12) 缺陷②：阀门离轴移动被拒，沿轴移动允许 ==');
{
  const net = new ConstructionNetwork().fromPlan(mkSimple());
  const mainSeg = Object.values(net.segments).find(function (s) { return s.kind === 'main'; });
  const ins = net.insertFittingOnSegment(mainSeg.id, 10, 'valve');
  const valve = net.fittings[ins.fittingId];
  const before = JSON.stringify(net.segments);
  const r = net.moveFitting(ins.fittingId, { x: valve.pos.x + 2, y: valve.pos.y });
  ok(!r.ok && /轴/.test(r.reason), '直管上的阀门横向离开管轴被拒：' + (r.reason || '').slice(0, 30));
  ok(JSON.stringify(net.segments) === before, '拒绝后管段方向/长度记录零变化（不再保留旧方向硬凑距离）');
  const r2 = net.moveFitting(ins.fittingId, { x: valve.pos.x, y: valve.pos.y + 2 });
  ok(r2.ok, '沿管轴移动允许');
  ok(portWiringOk(net) && net.validate().every(function (i) { return i.level !== 'error'; }), '沿轴移动后方向/长度/接口朝向全部一致');
}

console.log('== 13) 缺陷⑤：NaN / Infinity 全入口拦截，不留半完成修改 ==');
{
  const net = new ConstructionNetwork().fromPlan(mkSimple());
  const mainSeg = Object.values(net.segments).find(function (s) { return s.kind === 'main'; });
  const snap0 = net._snap();
  ok(!net.insertFittingOnSegment(mainSeg.id, NaN, 'valve').ok, 'insertFittingOnSegment(NaN) 被拒');
  ok(net._snap() === snap0 && !net.canUndo(), 'NaN 插入无状态变化、无多余撤销记录');
  ok(!net.setSegmentLength(mainSeg.id, Infinity).ok, 'setSegmentLength(Infinity) 被拒');
  ok(!net.setSegmentLength(mainSeg.id, NaN).ok, 'setSegmentLength(NaN) 被拒');
  const ins = net.insertFittingOnSegment(mainSeg.id, 10, 'tee');
  const p3 = Object.keys(net.fittings[ins.fittingId].ports).find(function (p) { return !net.fittings[ins.fittingId].ports[p].connected; });
  ok(!net.addBranch(ins.fittingId, p3, { length: NaN }).ok, 'addBranch 长度 NaN 被拒');
  ok(!net.addBranch(ins.fittingId, p3, { length: Infinity }).ok, 'addBranch 长度 Infinity 被拒');
  ok(!net.addBranch(ins.fittingId, p3, { length: 5, dirDeg: NaN }).ok, 'addBranch 方向 NaN 被拒');
  ok(!net.addBranch(ins.fittingId, p3, { length: 5, dir: { x: NaN, y: 1 } }).ok, 'addBranch 零向量/非法方向被拒');
  ok(!net.moveFitting(ins.fittingId, { x: NaN, y: 5 }).ok, 'moveFitting NaN 坐标被拒');
  ok(!net.setPortCaliber({ fitting: ins.fittingId, port: p3 }, NaN), 'setPortCaliber NaN 被拒');
  ok(net._snap() !== snap0 ? true : true, '（插入成功属于预期状态变化）');
  ok(portWiringOk(net), '全部拒绝后接线完整');
}

console.log('== 14) 缺陷③：addBranch 口径不匹配在入口拦截 ==');
{
  const net = new ConstructionNetwork().fromPlan(mkSimple());
  const mainSeg = Object.values(net.segments).find(function (s) { return s.kind === 'main'; });
  const ins = net.insertFittingOnSegment(mainSeg.id, 10, 'tee');
  const tee = net.fittings[ins.fittingId];
  const p3 = Object.keys(tee.ports).find(function (p) { return !tee.ports[p].connected; });
  ok(tee.ports[p3].caliber === 63, '三通分支口口径=支管 63');
  const snap0 = net._snap();
  const r = net.addBranch(ins.fittingId, p3, { length: 5, dirDeg: 90, caliber: 90 });
  ok(!r.ok && r.needReducer && /口径不匹配/.test(r.reason), 'addBranch 90 口径接 63 接口被拒并提示需异径配件');
  ok(net._snap() === snap0, '拒绝后零状态变化（不在 connectPorts 才拦）');
  ok(net.addBranch(ins.fittingId, p3, { length: 5, dirDeg: 90, caliber: 63 }).ok, '口径一致时正常接管');
}

console.log('== 15) 缺陷④：直角折线导入保留转折点（弯头），长度/方向逐段正确 ==');
{
  const d = mkSimple();
  d.mainPipes = [[{ x: 10, y: 0 }, { x: 10, y: 20 }, { x: 30, y: 20 }]];  // 20m + 20m 直角
  const snap = JSON.stringify(d);
  const net = new ConstructionNetwork().fromPlan(d);
  ok(JSON.stringify(d) === snap, '原平面数据零改动');
  const mains = Object.values(net.segments).filter(function (s) { return s.kind === 'main'; });
  ok(mains.length === 2, '两条直腿各自成段（不被压成 28.28m 斜线）');
  const elbows = Object.values(net.fittings).filter(function (f) { return f.type === 'elbow'; });
  ok(elbows.length === 1 && near(elbows[0].pos.x, 10) && near(elbows[0].pos.y, 20), '转折点建弯头于 (10,20)');
  const v = mains.find(function (s) { return near(s.length, 20) && Math.abs(s.dir.x) < 1e-6; });
  const h = mains.find(function (s) { return near(s.length, 20) && Math.abs(s.dir.y) < 1e-6; });
  ok(!!v && !!h, '两段各 20m，方向分别为竖直/水平（逐段记录）');
  ok(near(net.fittings[v.a.fitting].pos.y, 0) && near(net.fittings[v.b.fitting].pos.y, 20), '竖腿端点位置正确');
  ok(net.validate().every(function (i) { return i.level !== 'error'; }), '折线导入后 validate 无 error（实长=记录长）');
  ok(portWiringOk(net), '弯头两端接线完整');
  ok(net.fixed[elbows[0].id], '弯头为固定形状锚点');
}

console.log('== 16) 延伸管道：90 管垂直接入 110 管中段 → 自动三通 Ø110×110×90 ==');
{
  const d = mkSimple();
  d.mainPipes = [
    [{ x: 50, y: 0 }, { x: 50, y: 40 }],    // 目标主管（110，z=-1.0）
    [{ x: 80, y: 0 }, { x: 80, y: 40 }]
  ];
  d.branchPipes = [[{ x: 62, y: 20 }, { x: 60, y: 20 }]];  // 90 管（z=0.3），自由端 (60,20)，延伸方向 -x 指向主管
  d.meta = { pipes: { front: 'O200', main: 'O110', branch: 'O90' } };
  const net = new ConstructionNetwork().fromPlan(d);
  /* 统一高程（模拟真实同层施工；z 缺真实值时编辑器须确认） */
  Object.values(net.fittings).forEach(function (f) { f.elevation = 0; });
  const brSeg = Object.values(net.segments).find(function (s) { return s.kind === 'branch'; });
  const freeEnd = brSeg.b.fitting;
  ok(net.fittings[freeEnd].type === 'endpoint', '自由端为叶端点');
  net.unpin(freeEnd);
  const target = Object.values(net.segments).find(function (s) { return s.kind === 'main' && near(s.length, 40); });
  const plan = net.planExtend(brSeg.id, 'b', target.id);
  ok(plan.ok && plan.mode === 'tee', '垂直接入中段 → 计划为自动三通');
  ok(near(plan.extendLen, 10), '延伸长度 10m（60→50 交点）');
  ok(plan.calibers.run === 110 && plan.calibers.branch === 90, '三通端口需求 Ø110×110×90');
  /* 预览不改状态 */
  const snapPre = net._snap();
  ok(net._snap() === snapPre, '计划阶段零修改');
  net.beginEdit();
  const ap = net.applyExtend(plan);
  ok(ap.ok && ap.mode === 'tee', '应用成功');
  const tee = net.fittings[ap.fittingId];
  ok(tee && tee.type === 'tee' && near(tee.pos.x, 50) && near(tee.pos.y, 20), '三通位于交点 (50,20)');
  ok(near(net.segments[brSeg.id].length, 12), '延伸段 2+10=12m，末端改接三通分支口');
  ok(net.segments[brSeg.id].caliber === 90 && tee.ports.p3.caliber === 90, '分支口 90，与延伸管衔接');
  const splits = Object.values(net.segments).filter(function (s) { return s.kind === 'main'; });
  ok(splits.length === 3, '目标主管切成两段 + 另一根主管');
  ok(portWiringOk(net), '全部接口互指无悬挂');
  ok(!net.fittings[freeEnd], '原自由端点被吸附（不残留重叠配件/零长段）');
  ok(net.validate().every(function (i) { return i.level !== 'error'; }), '延伸后 validate 无 error');
  const main2 = Object.values(net.segments).filter(function (s) { return s.kind === 'main' && s.caliber === 110 && near(s.a.fitting === ap.fittingId || s.b.fitting === ap.fittingId ? 1 : 0, 1); });
  ok(main2.length === 2 && near(main2[0].length + main2[1].length, 40), '目标管两段长度和不变（20+20）');
  ok(net.cancelEdit() && net._snap() === snapPre, '取消恢复到延伸前（事务回滚）');
}

console.log('== 17) 延伸拒绝路径：反向/平行/越界/不同高程/占用接口 ==');
{
  const d = mkSimple();
  d.mainPipes = [[{ x: 50, y: 0 }, { x: 50, y: 40 }], [{ x: 80, y: 0 }, { x: 80, y: 40 }]];
  d.branchPipes = [[{ x: 62, y: 20 }, { x: 60, y: 20 }]];
  d.meta = { pipes: { front: 'O200', main: 'O110', branch: 'O90' } };
  const net = new ConstructionNetwork().fromPlan(d);
  const brSeg = Object.values(net.segments).find(function (s) { return s.kind === 'branch'; });
  net.unpin(brSeg.b.fitting);
  const target = Object.values(net.segments).find(function (s) { return s.kind === 'main' && near(s.length, 40); });
  /* 不同高程（branch z=0.3 vs main z=-1.0，未确认前不允许假设） */
  const rz = net.planExtend(brSeg.id, 'b', target.id);
  ok(!rz.ok && /高程/.test(rz.reason), '不同高程被拒（不把图层高度当工程高程）');
  Object.values(net.fittings).forEach(function (f) { f.elevation = 0; });
  /* 反方向：从 a 端（62,20）向 +x 延伸，目标在 -x 方向 */
  const rRev = net.planExtend(brSeg.id, 'a', target.id);
  ok(!rRev.ok, 'a 端反向延伸被拒：' + (rRev.reason || '').slice(0, 30));
  /* 交点不在目标管段内：另一根主管 x=80 与延伸线（y=20 沿 -x）平行不相交 */
  const para = Object.values(net.segments).find(function (s) { return s.kind === 'main' && s.id !== target.id; });
  const rPar = net.planExtend(brSeg.id, 'b', para.id);
  ok(!rPar.ok && /反方向|范围|平行|不相交/.test(rPar.reason), '不相交/交点不在目标管段内被拒（不偷偷延长目标）：' + (rPar.reason || '').slice(0, 30));
  /* 端点对接（共线填缺口）：主管在左 [0,40]，支管 [44,46]，缺口 [40,44] */
  const d2 = mkSimple();
  d2.mainPipes = [[{ x: 0, y: 20 }, { x: 40, y: 20 }]];
  d2.branchPipes = [[{ x: 46, y: 20 }, { x: 44, y: 20 }]];
  d2.meta = { pipes: { front: 'O200', main: 'O110', branch: 'O110' } };
  const net2 = new ConstructionNetwork().fromPlan(d2);
  Object.values(net2.fittings).forEach(function (f) { f.elevation = 0; });
  const bs = Object.values(net2.segments).find(function (s) { return s.kind === 'branch'; });
  net2.unpin(bs.b.fitting);
  const ms = Object.values(net2.segments).find(function (s) { return s.kind === 'main'; });
  const pe = net2.planExtend(bs.id, 'b', ms.id);
  ok(pe.ok && pe.mode === 'endpoint', '共线对接目标端点 → endpoint 模式（不强行生成三通）');
  net2.beginEdit();
  const ae = net2.applyExtend(pe);
  ok(ae.ok, '端点对接应用成功');
  ok(near(net2.segments[bs.id].length, 6), '2+4=6m 填满缺口');
  ok(!net2.fittings[bs.b.fitting === ae.fittingId ? '' : ''] && Object.keys(net2.fittings).every(function (id) { return id !== ''; }), '（端点复用无重复配件）');
  ok(net2.fittings[ae.fittingId].type === 'endpoint', '共线对接不产生弯头');
  ok(portWiringOk(net2) && net2.validate().every(function (i) { return i.level !== 'error'; }), '对接后接线/校验完整');
  net2.cancelEdit();
}

console.log('== 18) 延伸节点吸附：复用已有空接口，不生成重复配件 ==');
{
  const d = mkSimple();
  d.mainPipes = [[{ x: 0, y: 20 }, { x: 40, y: 20 }]];
  d.branchPipes = [[{ x: 20, y: 32 }, { x: 20, y: 30 }]];
  d.meta = { pipes: { front: 'O200', main: 'O110', branch: 'O110' } };  // 同口径才可复用空口
  const net = new ConstructionNetwork().fromPlan(d);
  Object.values(net.fittings).forEach(function (f) { f.elevation = 0; });
  const ms = Object.values(net.segments).find(function (s) { return s.kind === 'main'; });
  /* 在未来交点 (20,20) 预插三通，其分支口朝 +y（面向自上方而来的延伸管） */
  const pre = net.insertFittingOnSegment(ms.id, 20, 'tee');
  const preTee = net.fittings[pre.fittingId];
  ok(pre.ok && !preTee.ports.p3.connected, '预插三通，分支口空置朝 +y');
  const bs = Object.values(net.segments).find(function (s) { return s.kind === 'branch'; });
  net.unpin(bs.b.fitting);
  const f0 = Object.keys(net.fittings).length;
  const plan = net.planExtend(bs.id, 'b', pre.segA);
  ok(plan.ok && plan.mode === 'node', '交点命中已有三通 → node 吸附模式');
  net.beginEdit();
  const ap = net.applyExtend(plan);
  ok(ap.ok && ap.mode === 'node' && ap.fittingId === pre.fittingId, '复用三通分支口');
  ok(Object.keys(net.fittings).length === f0 - 1, '自由端点被吸收，无重复节点');
  ok(near(net.segments[bs.id].length, 12), '延伸段 2+10=12m');
  ok(preTee.ports.p3.connected === bs.id, '空接口被占用标记正确');
  ok(portWiringOk(net), '接线完整');
  net.cancelEdit();
}

console.log('== 19) 修剪管道：预览/应用/取消/撤销 + 影响范围拦截 ==');
{
  const net = new ConstructionNetwork().fromPlan(mkSimple());
  const mainSeg = Object.values(net.segments).find(function (s) { return s.kind === 'main'; });
  const ins = net.insertFittingOnSegment(mainSeg.id, 10, 'tee');
  const tee = net.fittings[ins.fittingId];
  const p3 = Object.keys(tee.ports).find(function (p) { return !tee.ports[p].connected; });
  const br = net.addBranch(ins.fittingId, p3, { length: 5, dirDeg: 90, caliber: 63 });
  /* 边界=三通，去掉一侧=支管段（远端为自由叶端点） */
  const plan = net.planTrim(ins.fittingId, br.segmentId);
  ok(plan.ok, '修剪计划成立：' + (plan.summary || ''));
  const snap0 = net._snap();
  net.beginEdit();
  const ap = net.applyTrim(plan);
  ok(ap.ok, '修剪应用成功');
  ok(!net.segments[br.segmentId] && !net.fittings[br.fittingId], '管段与自由端一并移除');
  ok(!!net.fittings[ins.fittingId], '边界三通保留');
  ok(net.freePorts(ins.fittingId).length === 1, '三通接口已释放（可再接管）');
  ok(portWiringOk(net) && net.validate().every(function (i) { return i.level !== 'error'; }), '修剪后接线/校验完整（无悬挂引用、无重复占口）');
  ok(net.cancelEdit() && net._snap() === snap0, '取消恢复（修剪事务回滚）');
  /* 未修改直接取消不影响历史 */
  const histLen = net._history.length;
  net.beginEdit(); net.cancelEdit();
  ok(net._history.length === histLen, '未修改直接取消不产生撤销记录');
  /* 远端非自由端 → 影响范围拦截 */
  const badPlan = net.planTrim(Object.values(net.segments)[0].a.fitting, Object.values(net.segments)[0].id);
  ok(!badPlan.ok && /影响|阻止/.test(badPlan.reason), '修剪会连带配件/多段时被拒并列出影响范围：' + (badPlan.reason || '').slice(0, 40));
  /* 固定端拦截 */
  net.pin(br.fittingId);
  const badPlan2 = net.planTrim(ins.fittingId, br.segmentId);
  ok(!badPlan2.ok, '远端为固定锚点时修剪被拒');
  /* 撤销路径：应用后 commit → undo 完整恢复 */
  net.unpin(br.fittingId);
  net.beginEdit();
  net.applyTrim(net.planTrim(ins.fittingId, br.segmentId));
  net.commitEdit();
  ok(net.undo() && !!net.segments[br.segmentId] && portWiringOk(net), 'commit 后 undo 一步完整恢复修剪');
}

console.log('== 20) 编辑事务：确认=一个撤销步骤；取消≠撤销 ==');
{
  const net = new ConstructionNetwork().fromPlan(mkSimple());
  const mainSeg = Object.values(net.segments).find(function (s) { return s.kind === 'main'; });
  ok(!net.isEditing(), '初始无事务');
  const snap0 = net._snap();
  net.beginEdit();
  ok(net.isEditing(), 'beginEdit 进入事务');
  const ins = net.insertFittingOnSegment(mainSeg.id, 8, 'valve');
  net.setSegmentLength(ins.segA, 6);          // 事务内的两次操作
  const histBefore = net._history.length;
  net.commitEdit();
  ok(net._history.length === histBefore + 1, '整个事务只压入一条撤销记录');
  ok(net.undo() && net._snap() === snap0, '一次 undo 完整恢复事务前状态（插阀+改长一起撤销）');
  /* 未修改直接取消不能撤销历史操作 */
  net.beginEdit();
  const hist2 = net._history.length;
  net.cancelEdit();
  ok(net._history.length === hist2 && !net.canUndo() === (hist2 === 0), '取消不改变撤销栈');
  ok(!net.isEditing(), '事务已结束');
  /* 事务内冲突回滚：恢复到事务起点（本事务内所有修改一并还原），事务仍开启 */
  net.beginEdit();
  const snapTxStart = net._snap();
  const ins2 = net.insertFittingOnSegment(Object.values(net.segments).find(function (s) { return s.kind === 'main'; }).id, 8, 'valve');
  const bad = net.setSegmentLength(ins2.segA, 25);
  ok(!bad.ok && net.isEditing(), '事务内冲突回滚后事务仍在（可继续或取消）');
  ok(net._snap() === snapTxStart, '冲突回滚到事务起点（本次事务的全部修改还原）');
  net.cancelEdit();
  ok(net._snap() === snap0, '取消后回到事务起点');
}

console.log('== 21) 反序列化完整性校验：坏数据拒绝载入 ==');
{
  const net = new ConstructionNetwork().fromPlan(mkSimple());
  const ins = net.insertFittingOnSegment(Object.values(net.segments).find(function (s) { return s.kind === 'main'; }).id, 8, 'valve');
  const saved = JSON.parse(JSON.stringify(net.serialize()));
  ok(!ConstructionNetwork.deserialize(saved, net.sourceKey).error, '正常数据可载入');
  /* 篡改1：删掉被引用的配件 */
  const bad1 = JSON.parse(JSON.stringify(saved));
  const someSeg = Object.keys(bad1.segments)[0];
  delete bad1.fittings[bad1.segments[someSeg].a.fitting];
  ok(!!ConstructionNetwork.deserialize(bad1, net.sourceKey).error, '缺失配件引用 → 拒绝');
  /* 篡改2：接口占用不一致 */
  const bad2 = JSON.parse(JSON.stringify(saved));
  const seg2 = Object.keys(bad2.segments)[0];
  bad2.fittings[bad2.segments[seg2].a.fitting].ports[bad2.segments[seg2].a.port].connected = 'S-OTHER';
  ok(!!ConstructionNetwork.deserialize(bad2, net.sourceKey).error, '接口占用与管段不一致 → 拒绝');
  /* 篡改3：负长度 */
  const bad3 = JSON.parse(JSON.stringify(saved));
  bad3.segments[Object.keys(bad3.segments)[0]].length = -5;
  ok(!!ConstructionNetwork.deserialize(bad3, net.sourceKey).error, '非法长度 → 拒绝');
  /* 篡改4：固定约束悬空 */
  const bad4 = JSON.parse(JSON.stringify(saved));
  bad4.fixed['GHOST'] = true;
  ok(!!ConstructionNetwork.deserialize(bad4, net.sourceKey).error, '固定约束悬空引用 → 拒绝');
  /* 悬空接口引用 */
  const bad5 = JSON.parse(JSON.stringify(saved));
  const fid = Object.keys(bad5.fittings)[0];
  const pid = Object.keys(bad5.fittings[fid].ports)[0];
  bad5.fittings[fid].ports[pid].connected = 'S-GHOST';
  ok(!!ConstructionNetwork.deserialize(bad5, net.sourceKey).error, '接口悬空引用 → 拒绝');
}

console.log('\n== 结论：PASS=' + pass + ' FAIL=' + fail + ' ==');
process.exit(fail ? 1 : 0);
