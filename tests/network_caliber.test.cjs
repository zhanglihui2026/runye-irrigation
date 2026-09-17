/* =====================================================================
 * tests/network_caliber.test.cjs — 「点管段改管径」验收（2026-09-15 用户要求）
 * 运行：node tests/network_caliber.test.cjs
 *
 * 契约：
 *  1) setCaliber(segmentId, od) —— 修改管段 caliber（PE 外径 mm），并同步本段两端
 *     接口的口径（端口只连本段，不影响邻段）；非法值（NaN/0/负数/超范围）拒绝、零副作用。
 *  2) caliberJoints(segmentId) —— 报告两端与之相连、管径不同的邻段（= 需异径接头位置）。
 *  3) 事务：beginEdit→setCaliber→cancelEdit 逐字节复原；runTx 路径一步撤销。
 *  4) serialize/deserialize 往返保留改径结果。
 * ===================================================================== */
'use strict';
const NM = require('../iso-diagram/network-model.js');
const ConstructionNetwork = NM.ConstructionNetwork;

let pass = 0, fail = 0;
function ok(c, n) { if (c) { pass++; console.log('✓ ' + n); } else { fail++; console.log('✗ FAIL ' + n); } }
function near(a, b, eps) { return Math.abs(a - b) <= (eps || 1e-3); }

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
function other(net, seg, fid) { return seg.a.fitting === fid ? seg.b.fitting : seg.a.fitting; }

/* === C1) 基本改径：caliber 与两端接口口径同步更新 === */
console.log('== C1) 改管径基本功能：本段与两端接口同步，返回 reducerNeeded ==');
{
  const net = new ConstructionNetwork().fromPlan(mkSimple());
  const seg = Object.values(net.segments).find(function (s) { return s.kind === 'main'; });
  ok(near(seg.caliber, 110), '前置：主管默认 Ø110');
  const r = net.setCaliber(seg.id, 180);
  ok(r.ok && near(net.segments[seg.id].caliber, 180), 'setCaliber(180) 生效');
  ok(net.fittings[seg.a.fitting].ports[seg.a.port].caliber === 180 &&
     net.fittings[seg.b.fitting].ports[seg.b.port].caliber === 180, '两端接口口径同步为 180');
  ok(Array.isArray(r.reducerNeeded) && r.reducerNeeded.length === 1 &&
     r.reducerNeeded[0].caliber === 110 && r.reducerNeeded[0].fitting === seg.a.fitting,
     '与立管(riser Ø110)相连端报出异径需求（mkSimple 中主管起点接 T-M1 立管）');
}

/* === C2) 非法值拒绝 + 零副作用 === */
console.log('== C2) 非法管径拒绝：NaN/0/负数/超范围，逐字节零副作用 ==');
{
  const net = new ConstructionNetwork().fromPlan(mkSimple());
  const seg = Object.values(net.segments).find(function (s) { return s.kind === 'main'; });
  const snap = net._snap();
  [NaN, 0, -63, 8, 5000, Infinity].forEach(function (bad) {
    const r = net.setCaliber(seg.id, bad);
    ok(!r.ok && /管径/.test(r.reason || ''), '拒绝 ' + bad + '：' + (r.reason || '').slice(0, 30));
  });
  ok(net._snap() === snap, '全部拒绝后模型逐字节零变化');
  ok(!net.segments['nope'] && !net.setCaliber('nope', 180).ok, '不存在的管段 → 拒绝');
}

/* === C3) 事务与撤销 === */
console.log('== C3) 事务：取消逐字节复原；确认后一步撤销 ==');
{
  const net = new ConstructionNetwork().fromPlan(mkSimple());
  const seg = Object.values(net.segments).find(function (s) { return s.kind === 'main'; });
  const snap = net._snap();
  net.beginEdit();
  net.setCaliber(seg.id, 220);
  ok(net._snap() !== snap, '事务内改径立即生效（预览可见）');
  net.cancelEdit();
  ok(net._snap() === snap, '取消后逐字节复原');
  net.beginEdit();
  net.setCaliber(seg.id, 220);
  net.commitEdit();
  ok(net.undo() && net._snap() === snap, '确认后一步撤销完整恢复');
}

/* === C4) 异径提示：插三通+支管后改主管径 → caliberJoints 报出邻段 === */
console.log('== C4) caliberJoints：三通处改主管径 → 相邻 110 主管段与 63 支管均报出 ==');
{
  const net = new ConstructionNetwork().fromPlan(mkSimple());
  const mainSeg = Object.values(net.segments).find(function (s) { return s.kind === 'main'; });
  const ins = net.insertFittingOnSegment(mainSeg.id, 5, 'tee');
  const tee = net.fittings[ins.fittingId];
  const p3 = Object.keys(tee.ports).find(function (p) { return !tee.ports[p].connected; });
  const br = net.addBranch(ins.fittingId, p3, { length: 4 });
  ok(!!br && !!br.segmentId, '前置：三通分支已接一段支管');
  const r = net.setCaliber(ins.segA, 180);
  ok(r.ok, '改三通上游主管段为 Ø180');
  const fits = r.reducerNeeded || [];
  const segIds = fits.map(function (x) { return x.segment; });
  ok(segIds.indexOf(ins.segB) >= 0, '报出下游主管段 ' + ins.segB + '（仍 Ø110）');
  ok(segIds.indexOf(br.segmentId) >= 0, '报出支管段 ' + br.segmentId + '（Ø63）');
  ok(fits.every(function (x) { return x.fitting === ins.fittingId || x.fitting === net.segments[ins.segA].a.fitting; }),
    '异径位置只出现在三通处或上游远端（立管侧）');
  /* 未改径的段：在三通处同样对着 Ø180/Ø63 → 也报异径（110 vs 180/63） */
  const j2 = net.caliberJoints(ins.segB);
  ok(j2.length === 2 && j2.every(function (x) { return x.fitting === ins.fittingId; }),
    '下游 Ø110 段在三通处同样报出 2 处异径（对 180 与 63）');
}

/* === C5) 序列化往返保留改径 === */
console.log('== C5) serialize/deserialize 往返保留改径结果 ==');
{
  const net = new ConstructionNetwork().fromPlan(mkSimple());
  const seg = Object.values(net.segments).find(function (s) { return s.kind === 'main'; });
  net.setCaliber(seg.id, 180);
  const saved = net.serialize();
  const net2 = ConstructionNetwork.deserialize(saved, '');
  ok(!net2.error && near(net2.segments[seg.id].caliber, 180) &&
     net2.fittings[seg.a.fitting].ports[seg.a.port].caliber === 180, '存档往返后 Ø180 保留');
}

/* === C6) 拆段继承：改径后插三通，两侧新段继承新管径 === */
console.log('== C6) 改径后插三通：拆出的两段继承新管径 ==');
{
  const net = new ConstructionNetwork().fromPlan(mkSimple());
  const seg = Object.values(net.segments).find(function (s) { return s.kind === 'main'; });
  net.setCaliber(seg.id, 180);
  const ins = net.insertFittingOnSegment(seg.id, 7, 'valve');
  ok(near(net.segments[ins.segA].caliber, 180) && near(net.segments[ins.segB].caliber, 180),
    '拆分段均 Ø180');
  ok(net.segmentsOf(ins.fittingId).length === 2, '前置：阀门两侧各一段');
}

console.log('');
console.log('合计：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
