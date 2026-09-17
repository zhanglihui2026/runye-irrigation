/* =====================================================================
 * tests/network_model_acceptance.test.cjs — 五项修复验收（需求一至五 + 验收12项）
 * 运行：node tests/network_model_acceptance.test.cjs
 * 目标：锁定「真实高程/显示层高分离、端点驳接、中途交点、边界截断、预览无副作用」
 *       五处修复的成果，并覆盖高程组合 / 刷新恢复 / 撤销 / 过期计划等场景。
 * 每项测试在「已实现」的行为上做断言；若失败即暴露回归或实现缺口。
 * ===================================================================== */
'use strict';
const NM = require('../iso-diagram/network-model.js');
const ConstructionNetwork = NM.ConstructionNetwork;

let pass = 0, fail = 0;
function ok(c, n) { if (c) { pass++; console.log('✓ ' + n); } else { fail++; console.log('✗ FAIL ' + n); } }
function near(a, b, eps) { return Math.abs(a - b) <= (eps || 1e-4); }

/* ---------- 合成数据 ---------- */
function buildNet(mainPipes, branchPipes, opts) {
  opts = opts || {};
  const data = {
    version: 1, world: 'meter', plot: { w: 100, h: 100 },
    poly: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
    frontPipe: [], sourcePos: null,
    mainPipes: mainPipes || [], branchPipes: branchPipes || [], valves: [], dripTapes: [],
    meta: { pipes: { front: 'O200', main: 'O110', branch: 'O110' } }
  };
  const net = new ConstructionNetwork().fromPlan(data);
  if (opts.elevation != null) Object.values(net.fittings).forEach(f => { f.elevation = opts.elevation; });
  if (opts.z != null) Object.values(net.fittings).forEach(f => { f.z = opts.z; });
  if (opts.unpinAll !== false) Object.keys(net.fittings).forEach(id => net.unpin(id)); // 编辑场景：放开固定锚点
  return net;
}
function segBetween(net, ax, ay, bx, by) {
  return Object.values(net.segments).find(s => {
    const A = net.fittings[s.a.fitting].pos, B = net.fittings[s.b.fitting].pos;
    const m1 = near(A.x, ax) && near(A.y, ay) && near(B.x, bx) && near(B.y, by);
    const m2 = near(A.x, bx) && near(A.y, by) && near(B.x, ax) && near(B.y, ay);
    return m1 || m2;
  });
}
function fitAt(net, x, y) { return Object.values(net.fittings).find(f => near(f.pos.x, x) && near(f.pos.y, y)); }
function portWiringOk(net) {
  let bad = 0;
  Object.values(net.segments).forEach(s => {
    [s.a, s.b].forEach(r => { const f = net.fittings[r.fitting]; if (!f || !f.ports[r.port] || f.ports[r.port].connected !== s.id) bad++; });
  });
  return bad === 0;
}

/* === A) 真实高程与显示层高分离（需求一）=== */
console.log('== A) 真实高程与显示层高分离（需求一）==');
{
  const net = buildNet([[{ x: 0, y: 10 }, { x: 10, y: 10 }]], [[{ x: 0, y: 0 }, { x: 0, y: 5 }]]); // 不设 elevation → 全部 null
  ok(Object.values(net.fittings).every(f => f.elevation === null), 'fromPlan 后所有配件真实高程 elevation 默认未确认(null)');
  const mainFits = Object.values(net.fittings).filter(f => near(f.z, -1));
  const branchFits = Object.values(net.fittings).filter(f => near(f.z, 0.3));
  ok(mainFits.length > 0 && branchFits.length > 0, '显示层高 z 按管路类型区分（主管≈-1 / 支管≈0.3）');
  const any = Object.values(net.fittings)[0];
  any.z = -99;
  ok(any.elevation === null, '修改显示层高 z 不改变真实高程 elevation（仍为未确认）');
  const br = segBetween(net, 0, 0, 0, 5), main = segBetween(net, 0, 10, 10, 10);
  const plan = net.planExtend(br.id, 'b', main.id);
  ok(!plan.ok && /未确认/.test(plan.reason), '真实高程未确认时 planExtend 拒绝（含「未确认」），不依赖 z 放通');
}

/* === B) 真实高程为连接依据，显示层高不参与判定 === */
console.log('== B) 真实高程为连接依据，显示层高不参与判定 ==');
{
  const net = buildNet([[{ x: 0, y: 10 }, { x: 10, y: 10 }]], [[{ x: 0, y: 0 }, { x: 0, y: 5 }]], { elevation: 0 });
  const br = segBetween(net, 0, 0, 0, 5), main = segBetween(net, 0, 10, 10, 10);
  const p1 = net.planExtend(br.id, 'b', main.id);
  ok(p1.ok, '真实高程相同(0==0)即便显示层高 z 不同(-1 vs 0.3)仍可延伸');
  const ta = fitAt(net, 0, 10); // 目标管 a 端（在 (0,10)）
  ta.elevation = 1;
  const p2 = net.planExtend(br.id, 'b', main.id);
  ok(!p2.ok && p2.differentElevation === true, '真实高程不同(0≠1)即便显示层高 z 相同也拒绝（differentElevation）');
}

/* === C) 老存档迁移：z 保留、真实高程默认未确认 === */
console.log('== C) 老存档迁移：z 保留、真实高程默认未确认 ==');
{
  const net = buildNet([[{ x: 0, y: 10 }, { x: 10, y: 10 }]], [[{ x: 0, y: 0 }, { x: 0, y: 5 }]], { elevation: 0 });
  const saved = net.serialize();
  const legacy = JSON.parse(JSON.stringify(saved));
  Object.values(legacy.fittings).forEach(f => { delete f.elevation; }); // 模拟旧存档无 elevation 字段
  const net2 = ConstructionNetwork.deserialize(legacy);
  ok(net2 && !net2.error, '缺 elevation 字段的老存档可载入（不报错）');
  ok(Object.values(net2.fittings).every(f => f.elevation === null), '迁移后 elevation 默认 null（未确认）');
  ok(Object.values(net2.fittings).every(f => typeof f.z === 'number'), '迁移后显示层高 z 原样保留');
}

/* === D) 目标端点驳接（需求二）：不误报「接口已占用」=== */
console.log('== D) 目标端点驳接（需求二）：复现场景 (0,0)→(0,5) 接 (0,10)→(10,10) 端点 ==');
{
  const net = buildNet([[{ x: 0, y: 10 }, { x: 10, y: 10 }]], [[{ x: 0, y: 0 }, { x: 0, y: 5 }]], { elevation: 0 });
  const br = segBetween(net, 0, 0, 0, 5), main = segBetween(net, 0, 10, 10, 10);
  const plan = net.planExtend(br.id, 'b', main.id);
  ok(plan.ok && plan.mode === 'endpoint', '复现场景 → endpoint 模式（不报「接口已占用」）');
  const Eid = br.b.fitting;
  net.beginEdit();
  const ap = net.applyExtend(plan);
  ok(ap.ok && ap.mode === 'endpoint', 'applyExtend 成功形成端点连接');
  ok(!net.fittings[Eid], '原延伸自由端被吸收删除');
  const tFit = net.fittings[plan.targetFitting];
  const np = Object.values(tFit.ports).find(p => p.connected === br.id);
  ok(np && near(np.dir.x, 0) && near(np.dir.y, -1), '新端口朝向下方延伸自由端(-y)，方向正确');
  ok(near(net.segments[br.id].length, 10), '延伸段长度 = 5+5 = 10m');
  ok(portWiringOk(net) && net.validate().every(i => i.level !== 'error'), '接线/校验完整');
  net.cancelEdit();
}

/* === E) 端点驳接 a 端朝向正确 === */
console.log('== E) 端点驳接 a 端朝向正确 ==');
{
  const net = buildNet([[{ x: 0, y: 0 }, { x: 10, y: 0 }]], [[{ x: 0, y: 5 }, { x: 0, y: 10 }]], { elevation: 0 });
  const br = segBetween(net, 0, 5, 0, 10), main = segBetween(net, 0, 0, 10, 0);
  const plan = net.planExtend(br.id, 'a', main.id);
  ok(plan.ok && plan.mode === 'endpoint', 'a 端延伸接到目标端点 → endpoint');
  const Eid = br.a.fitting;
  net.beginEdit();
  const ap = net.applyExtend(plan);
  ok(ap.ok, 'applyExtend 成功');
  const tFit = net.fittings[plan.targetFitting]; // (0,0)
  const np = Object.values(tFit.ports).find(p => p.connected === br.id);
  ok(np && near(np.dir.x, 0) && near(np.dir.y, 1), 'a 端延伸：新端口朝向上方延伸自由端(+y)');
  ok(!net.fittings[Eid], '原 a 端自由端被吸收删除');
  net.cancelEdit();
}

/* === F) 中途同层交点检测（需求三）=== */
console.log('== F) 中途同层交点检测（需求三）==');
{
  const net = buildNet(
    [[{ x: 0, y: 10 }, { x: 10, y: 10 }], [{ x: -5, y: 7 }, { x: 5, y: 7 }]], // 目标 + 中途横管(y=7)
    [[{ x: 0, y: 0 }, { x: 0, y: 5 }]], { elevation: 0 });
  const br = segBetween(net, 0, 0, 0, 5);
  const target = segBetween(net, 0, 10, 10, 10);
  const plan = net.planExtend(br.id, 'b', target.id);
  ok(!plan.ok && plan.midObstruction === true, '中途同层交点(y=7)阻止直接延伸（midObstruction）');
}
{
  const net = buildNet(
    [[{ x: 0, y: 10 }, { x: 10, y: 10 }], [{ x: -5, y: 7 }, { x: 5, y: 7 }]],
    [[{ x: 0, y: 0 }, { x: 0, y: 5 }]], { elevation: 0 });
  Object.values(net.fittings).forEach(f => { if (near(f.pos.y, 7)) f.elevation = 5; }); // 中途横管不同高程
  const br = segBetween(net, 0, 0, 0, 5);
  const target = segBetween(net, 0, 10, 10, 10);
  const plan = net.planExtend(br.id, 'b', target.id);
  ok(plan.ok && /空间交叉/.test(plan.crossingNote || ''), '不同确认高程的中途交点 → 放行并标注「空间交叉」（非连接）');
}

/* === G) 边界截断（需求四）：交叉管截断 === */
console.log('== G) 边界截断（需求四）：交叉管截断，位置精确 ===');
{
  const net = buildNet(
    [[{ x: 0, y: 0 }, { x: 0, y: 10 }], [{ x: -5, y: 5 }, { x: 5, y: 5 }]], // 竖管A(0,0)-(0,10) + 横管B(y=5)交叉
    [], { elevation: 0 });
  const A = segBetween(net, 0, 0, 0, 10), B = segBetween(net, -5, 5, 5, 5);
  const plan = net.planTrim(B.id, A.id);
  ok(plan.ok && plan.mode === 'cut', '同高程交叉管可作边界截断（mode:cut）');
  ok(near(plan.tA, 5), '截断点实际距离为 5m（非归一化分数 0.5）——锁定 tA 单位修复');
  net.beginEdit();
  const ap = net.applyTrim(plan);
  ok(ap.ok, 'applyTrim 截断成功');
  const kept = Object.values(net.segments).find(s => {
    const a = net.fittings[s.a.fitting].pos, b = net.fittings[s.b.fitting].pos;
    return (near(a.x, 0) && near(a.y, 0) && near(b.x, 0) && near(b.y, 5)) ||
           (near(a.x, 0) && near(a.y, 5) && near(b.x, 0) && near(b.y, 0));
  });
  ok(kept && near(kept.length, 5), '保留侧管段长度/口径/系统归属保持（5m）');
  const ne = Object.values(net.fittings).find(f => near(f.pos.x, 0) && near(f.pos.y, 5) && f.type === 'endpoint');
  ok(!!ne, '新截断点建立自由端（不生成三通）');
  ok(!fitAt(net, 0, 10), '被删侧自由端 (0,10) 已移除');
  ok(portWiringOk(net) && net.validate().every(i => i.level !== 'error'), '截断后接线/校验完整');
  net.cancelEdit();
  ok(!!segBetween(net, 0, 0, 0, 10), '取消后竖管恢复为完整 10m（事务回滚）');
}
console.log('== H) 高程未确认/不同 → 截断拒绝 ==');
{
  const net = buildNet(
    [[{ x: 0, y: 0 }, { x: 0, y: 10 }], [{ x: -5, y: 5 }, { x: 5, y: 5 }]],
    [], {}); // 不设 elevation → 全部 null
  const A = segBetween(net, 0, 0, 0, 10), B = segBetween(net, -5, 5, 5, 5);
  const plan = net.planTrim(B.id, A.id);
  ok(!plan.ok && plan.incompatible === true, '真实高程未确认 → 交叉截断拒绝（incompatible）');
}

/* === I) 预览无副作用（需求五）：确认前不分配序号/不改模型 === */
console.log('== I) 预览无副作用（需求五）：确认前不分配序号/不改模型 ==');
{
  const net = buildNet([[{ x: 0, y: 10 }, { x: 10, y: 10 }]], [[{ x: 5, y: 0 }, { x: 5, y: 5 }]], { elevation: 0 }); // 中段垂直接入→tee
  const br = segBetween(net, 5, 0, 5, 5), main = segBetween(net, 0, 10, 10, 10);
  const teeBefore = net.seq.tee;
  const plan = net.planExtend(br.id, 'b', main.id);
  ok(plan.ok && plan.mode === 'tee' && plan.teeId === null, 'tee 模式预览：teeId 为 null（不预分配）');
  ok(net.seq.tee === teeBefore, '预览后 seq.tee 不变（无副作用）');
  const snap = net._snap();
  net.planExtend(br.id, 'b', main.id);
  net.planExtend(br.id, 'b', main.id);
  ok(net._snap() === snap, '反复预览后模型与撤销历史不变');
  net.beginEdit();
  const ap = net.applyExtend(plan);
  ok(ap.ok && net.seq.tee === teeBefore + 1, '确认提交才分配 tee 序号');
  net.commitEdit();
  ok(net._history.length >= 1, '提交产生一条撤销记录');
}

/* === J) 过期计划拒绝（需求五）：预览后模型变化则失效 === */
console.log('== J) 过期计划拒绝（需求五）：预览后模型变化则失效 ==');
{
  const net = buildNet([[{ x: 0, y: 10 }, { x: 10, y: 10 }], [{ x: 5, y: 0 }, { x: 5, y: 5 }]], [], { elevation: 0 }); // 延伸管设为非刚性 main
  const br = segBetween(net, 5, 0, 5, 5), main = segBetween(net, 0, 10, 10, 10);
  const plan = net.planExtend(br.id, 'b', main.id);
  ok(plan.ok, '预览成功');
  const teeBefore = net.seq.tee;
  net.setSegmentLength(br.id, 2); // 预览后模型变化
  const ap = net.applyExtend(plan); // 未 beginEdit（确认即自带校验）
  ok(!ap.ok && ap.stale === true, '模型变化后旧计划失效 → 拒绝（stale）');
  ok(net.seq.tee === teeBefore && !Object.keys(net.fittings).some(id => id.indexOf('T-N') === 0), '拒绝后未分配三通、无半连接残留');
  ok(portWiringOk(net), '拒绝后模型无悬挂引用');
}

/* === K) 刷新恢复：序列化→反序列化等价 === */
console.log('== K) 刷新恢复：序列化→反序列化等价 ==');
{
  const net = buildNet([[{ x: 0, y: 10 }, { x: 10, y: 10 }]], [[{ x: 0, y: 0 }, { x: 0, y: 5 }]], { elevation: 0 });
  const net2 = ConstructionNetwork.deserialize(net.serialize());
  ok(net2 && !net2.error, '序列化→反序列化可恢复');
  ok(net2._snap() === net._snap(), '刷新恢复后模型等价（_snap 一致）');
  ok(Object.values(net2.fittings).every(f => f.elevation === 0), '已确认真实高程刷新后保留');
}

/* === L) 撤销：提交后一步完整恢复 === */
console.log('== L) 撤销：提交后一步完整恢复 ==');
{
  const net = buildNet([[{ x: 0, y: 10 }, { x: 10, y: 10 }]], [[{ x: 0, y: 0 }, { x: 0, y: 5 }]], { elevation: 0 });
  const br = segBetween(net, 0, 0, 0, 5), main = segBetween(net, 0, 10, 10, 10);
  const snap0 = net._snap();
  const plan = net.planExtend(br.id, 'b', main.id);
  net.beginEdit(); net.applyExtend(plan); net.commitEdit();
  ok(net._snap() !== snap0, '提交后模型变化');
  ok(net.undo() && net._snap() === snap0, 'undo 一步完整恢复到提交前');
}

console.log('\n== 结论：PASS=' + pass + ' FAIL=' + fail + ' ==');
process.exit(fail ? 1 : 0);
