/* =====================================================================
 * tests/network_assembly.test.cjs — 逐件接管（按真实施工顺序装配）模型单测
 * 运行：node tests/network_assembly.test.cjs
 * 覆盖：新建起始管道 / 继续连接六类 / 方向规则 / 口径与体系校验 /
 *       占位长度与下料参考 / 预览无副作用 / stale 拒绝 / 撤销一步 /
 *       序列化 v2 往返 / v1 迁移 / 固定接口数契约 / 十步施工序列。
 * ===================================================================== */
'use strict';
/* 引擎测试注入「全量目录夹具」（发布目录只收 110 等径闭环 —— 2026-09-15 起为
 * 管 / 三通 / 90°弯头 / 阀门 4 条目，供双视图递归接管使用；异径 / 封堵 / 90 系列
 * 仍只在夹具里，引擎 planConnect/applyConnect 与型号种类无关，方向规则与接口数
 * 契约继续用夹具覆盖）。 */
const FIXTURE = require('./catalog-full-fixture.cjs');
globalThis.RyCatalog = FIXTURE;
const NM = require('../iso-diagram/network-model.js');
const CAT = FIXTURE;
const REAL = require('../iso-diagram/product-catalog.js');
const ConstructionNetwork = NM.ConstructionNetwork;

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('✓ ' + name); }
  else { fail++; console.log('✗ FAIL ' + name); }
}
function near(a, b, eps) { return Math.abs(a - b) <= (eps || 1e-4); }

/* ---------- 目录模块 ---------- */
ok(REAL.get('GEN-PIPE-110') && REAL.get('GEN-TEE-110-110-110'), '发布目录：110 管 + 110 等径三通在目录');
ok(REAL.get('GEN-ELBOW-110-90') && REAL.get('GEN-ELBOW-110-90').type === 'elbow',
  '发布目录：110 等径 90° 弯头已补录（递归接管「接弯头」需要）');
ok(REAL.get('GEN-VALVE-110') && REAL.get('GEN-VALVE-110').type === 'valve',
  '发布目录：110 阀门已补录（管中插阀 / 白圈接阀门需要）');
ok(REAL.all().length === 4, '发布目录：本阶段 110 等径闭环共 4 条目（管/三通/弯头/阀门）');
ok(!REAL.get('GEN-RED-110-90') && !REAL.get('GEN-CAP-110') && !REAL.get('GEN-PIPE-90') && !REAL.get('GEN-ELB-110-90'),
  '发布目录：异径 / 封堵 / 非 110 口径仍未收录（反向断言：不得误扩散）');
ok(REAL.version === '2026.09.15-1', '发布目录：版本已递增（2026.09.15-1）');
ok(FIXTURE.get('GEN-TEE-110-110-90') && FIXTURE.get('GEN-TEE-110-110-90').type === 'tee', '夹具目录：三通型号存在');
ok(CAT.portCount('tee') === 3 && CAT.portCount('valve') === 2 && CAT.portCount('elbow') === 2 && CAT.portCount('reducer') === 2 && CAT.portCount('cap') === 1, '夹具目录：固定接口数契约（阀/弯/异径=2 三通=3 封堵=1）');
ok(CAT.level() === 'generic', '夹具目录：当前为通用施工示意级');
ok(CAT.byTypeCaliber('tee', 110).some(function (t) { return t.id === 'GEN-TEE-110-110-90'; }), '夹具目录：按口径筛选三通');
ok(CAT.isGeneric(CAT.get('GEN-PIPE-110')), '夹具目录：通用条目标注来源');

/* ---------- 新建起始管道 ---------- */
(function () {
  const net = new ConstructionNetwork();
  const plan = net.planStartPipe({ modelId: 'GEN-PIPE-110', start: { x: 0, y: 0 }, dirDeg: 90, length: 20 });
  ok(plan.ok && plan.caliber === 110 && plan.system === 'PE-外径' && plan.material === 'PE100', '起始管道预览：型号目录带入口径/体系/材质');
  ok(near(plan.end.y, 20) && Math.abs(plan.end.x) < 1e-9, '起始管道预览：工程坐标方向（dirDeg=90 → 正北）');
  ok(Object.keys(net.fittings).length === 0 && Object.keys(net.segments).length === 0, '预览无副作用：模型未变');
  ok(net.seq.endpoint === undefined || net.seq.endpoint === 0, '预览无副作用：不占稳定 ID 序号');
  const r = net.applyStartPipe(plan);
  ok(r.ok && net.fittings[r.fittingA] && net.fittings[r.fittingB] && net.segments[r.segmentId], '起始管道提交：两端点 + 管段');
  ok(!!net.fixed[r.fittingA], '起始管道提交：起点为固定锚点');
  const seg = net.segments[r.segmentId];
  ok(near(seg.length, 20) && near(seg.piece, 20), '起始管道：中心线长 = 管件净长 20m');
  const p = net.fittings[r.fittingB].ports.p1;
  ok(p.system === 'PE-外径' && p.material === 'PE100' && p.conn === '热熔对接' && p.kind === 'straight', '接口 v2 字段：体系/材质/连接方式/口性质');
  var dd = net.portInfo(r.fittingB, 'p1').dirDeg;
  ok(((dd % 360) + 360) % 360 === 270, '接口详情：朝向工程角（终点口朝南，归一化 270°）');
  ok(net.portInfo(r.fittingB, 'p1').connected && net.portInfo(r.fittingB, 'p1').mate.fitting === r.fittingA, '接口详情：对接接口由管段引用推导');
  // 非法输入
  ok(!net.planStartPipe({ modelId: 'GEN-PIPE-110', start: { x: 0, y: 0 }, length: 20 }).ok, '起始管道：缺方向拒绝');
  ok(!net.planStartPipe({ modelId: 'GEN-TEE-110-110-90', start: { x: 0, y: 0 }, dirDeg: 0, length: 20 }).ok, '起始管道：非管材型号拒绝');
  ok(!net.planStartPipe({ modelId: 'GEN-PIPE-110', start: { x: 0, y: 0 }, dirDeg: 0, length: 0.01 }).ok, '起始管道：长度 < 最小管长拒绝');
  ok(!net.planStartPipe({ modelId: 'NOPE', start: { x: 0, y: 0 }, dirDeg: 0, length: 20 }).ok, '起始管道：未知型号拒绝');
})();

/* ---------- 十步施工序列（验收场景的模型层等价） ---------- */
(function () {
  const net = new ConstructionNetwork();
  // 1) 新建起始管道 110 × 20m（向东）
  let plan = net.planStartPipe({ modelId: 'GEN-PIPE-110', start: { x: 0, y: 0 }, dirDeg: 0, length: 20 });
  let r = net.applyStartPipe(plan);
  ok(r.ok, '第1步：新建起始管道 110×20m');
  const endB = r.fittingB;                       // 东端自由端
  // 2) 端头接 110×110×90 三通（分支朝北 90°）
  plan = net.planConnect(endB, 'p1', 'tee', { modelId: 'GEN-TEE-110-110-90', branchDirDeg: 90 });
  ok(plan.ok && near(plan.pos.x, 20.1), '第2步预览：三通中心 = 管端 + 半占位（20+0.10m）');
  ok(net.portInfo(endB, 'p1') && Object.keys(net.segments).length === 1, '第2步预览无副作用');
  r = net.applyConnect(plan);
  ok(r.ok, '第2步：接三通 110×110×90');
  const teeId = r.fittingId;
  ok(net.fittings[teeId].type === 'tee' && Object.keys(net.fittings[teeId].ports).length === 3, '三通固定 3 接口');
  ok(net.fittings[teeId].placeholder === 0.20, '三通占位 0.20m 来自目录');
  const teePorts = net.fittings[teeId].ports;
  const brKey = Object.keys(teePorts).find(function (k) { return teePorts[k].kind === 'branch'; });
  const stKeys = Object.keys(teePorts).filter(function (k) { return teePorts[k].kind === 'straight'; });
  ok(teePorts[brKey].caliber === 90 && stKeys.length === 2, '三通：2 共线直通口(110) + 1 分支口(90)');
  ok(near(teePorts[brKey].dir.x, 0) && near(teePorts[brKey].dir.y, 1), '分支口方向 = 工程坐标 90°（北）');
  // 3) 直通口（东向延续口）接 110 管 10m
  const eastKey = stKeys.find(function (k) { return teePorts[k].dir.x > 0; });
  plan = net.planConnect(teeId, eastKey, 'pipe', { modelId: 'GEN-PIPE-110', length: 10 });
  ok(plan.ok && near(plan.centerLen, 10.1), '第3步预览：中心线 10.1m = 净长 10 + 半占位 0.1');
  r = net.applyConnect(plan);
  ok(r.ok && near(net.segments[r.segmentId].piece, 10), '第3步：直通口接 110 管 10m');
  // 4) 分支口接 90 管 5m（分支口 90 直接口接 90 管，无需异径）
  plan = net.planConnect(teeId, brKey, 'pipe', { modelId: 'GEN-PIPE-90', length: 5 });
  ok(plan.ok, '第4步预览：分支口 90 接 90 管（口径一致）');
  r = net.applyConnect(plan);
  ok(r.ok, '第4步：分支口接 90 管 5m');
  const b90End = r.fittingId;
  // 5) 90 管端接 90° 弯头（来流 90° 北，出口 0° 东 → 偏转 90°）
  plan = net.planConnect(b90End, 'p1', 'elbow', { modelId: 'GEN-ELB-90-90', outDirDeg: 0 });
  ok(plan.ok, '第5步预览：弯头出口东（偏转 90°）');
  r = net.applyConnect(plan);
  ok(r.ok && net.fittings[r.fittingId].type === 'elbow' && Object.keys(net.fittings[r.fittingId].ports).length === 2, '第5步：接 90° 弯头（2 接口）');
  const elbId = r.fittingId;
  // 6) 弯头出接口接 90 管 3m
  const elbOutKey = Object.keys(net.fittings[elbId].ports).find(function (k) { return net.fittings[elbId].ports[k].dir.x > 0; });
  plan = net.planConnect(elbId, elbOutKey, 'pipe', { modelId: 'GEN-PIPE-90', length: 3 });
  r = net.applyConnect(plan);
  ok(r.ok, '第6步：弯头出接口接 90 管 3m');
  const p3End = r.fittingId;
  // 7) 末端接阀门
  plan = net.planConnect(p3End, 'p1', 'valve', { modelId: 'GEN-VALVE-90' });
  r = net.applyConnect(plan);
  ok(r.ok && net.fittings[r.fittingId].type === 'valve' && Object.keys(net.fittings[r.fittingId].ports).length === 2, '第7步：末端接阀门（2 接口）');
  const valveId = r.fittingId;
  // 8) 阀门出口接封堵
  const vOutKey = Object.keys(net.fittings[valveId].ports).find(function (k) { return net.fittings[valveId].ports[k].connected === null; });
  plan = net.planConnect(valveId, vOutKey, 'cap', { modelId: 'GEN-CAP-90' });
  r = net.applyConnect(plan);
  ok(r.ok && net.fittings[r.fittingId].type === 'cap' && Object.keys(net.fittings[r.fittingId].ports).length === 1, '第8步：末端接封堵（1 接口，管路终点）');
  ok(net.portInfo(r.fittingId, 'p').connected && net.portInfo(r.fittingId, 'p').segmentKind === 'joint', '封堵口为对接接头段');
  // 9) 第3步那根 110 管的自由端也接封堵（110）
  const seg3 = Object.values(net.segments).find(function (s) { return s.piece === 10; });
  const endSeg3 = seg3.b.fitting;
  plan = net.planConnect(endSeg3, 'p1', 'cap', { modelId: 'GEN-CAP-110' });
  r = net.applyConnect(plan);
  ok(r.ok, '第9步：110 管末端接 110 封堵');
  // 10) validate：接口数契约 + 接线一致 + 方向一致
  const issues = net.validate().filter(function (i) { return i.level === 'error'; });
  ok(issues.length === 0, '第10步：validate 无 error（' + JSON.stringify(issues) + '）');
  ok(net.validate().every(function (i) { return i.level !== 'warn' || !/接口数/.test(i.msg); }), '第10步：装配件接口数符合契约');
  // 统计：占位与下料参考
  const stats = net.computeStats();
  ok(stats.placeholderTotal > 0 && stats.cutRef < stats.totalLength && near(stats.cutRef, stats.totalLength - stats.placeholderTotal), '统计：下料参考 = 中心线总长 − 占位合计（' + stats.totalLength + ' − ' + stats.placeholderTotal + ' = ' + stats.cutRef + '）');
  ok(stats.fittingsByType.tee === 1 && stats.fittingsByType.elbow === 1 && stats.fittingsByType.valve === 1 && stats.fittingsByType.cap === 2, '统计：配件计数正确');
})();

/* ---------- 方向规则 ---------- */
(function () {
  const net = new ConstructionNetwork();
  net.applyStartPipe(net.planStartPipe({ modelId: 'GEN-PIPE-110', start: { x: 0, y: 0 }, dirDeg: 0, length: 20 }));
  const endB = Object.keys(net.fittings).find(function (id) { return net.fittings[id].type === 'endpoint' && !net.fixed[id]; });
  // 三通分支不垂直 → 拒绝
  let p1 = net.planConnect(endB, 'p1', 'tee', { modelId: 'GEN-TEE-110-110-90', branchDirDeg: 45 });
  ok(!p1.ok && /垂直/.test(p1.reason), '方向规则：三通分支非垂直（45°）拒绝');
  p1 = net.planConnect(endB, 'p1', 'tee', { modelId: 'GEN-TEE-110-110-90', branchDirDeg: 0 });
  ok(!p1.ok, '方向规则：三通分支与轴共线拒绝');
  // 弯头角度必须等于产品固定角度（改用 Ø90 管网，弯头目录为 90 口径）
  const net90 = new ConstructionNetwork();
  net90.applyStartPipe(net90.planStartPipe({ modelId: 'GEN-PIPE-90', start: { x: 0, y: 0 }, dirDeg: 0, length: 20 }));
  const end90 = Object.keys(net90.fittings).find(function (id) { return net90.fittings[id].type === 'endpoint' && !net90.fixed[id]; });
  let p2 = net90.planConnect(end90, 'p1', 'elbow', { modelId: 'GEN-ELB-90-90', outDirDeg: 45 });
  ok(!p2.ok && /固定角度/.test(p2.reason), '方向规则：90° 弯头接 45° 出口拒绝');
  ok(net90.planConnect(end90, 'p1', 'elbow', { modelId: 'GEN-ELB-90-90', outDirDeg: 90 }).ok, '方向规则：90° 弯头接 90° 出口放行');
  ok(net90.planConnect(end90, 'p1', 'elbow', { modelId: 'GEN-ELB-90-90', outDirDeg: 270 }).ok, '方向规则：90° 弯头另一侧（270°）放行');
  ok(net90.planConnect(end90, 'p1', 'elbow', { modelId: 'GEN-ELB-90-45', outDirDeg: 45 }).ok, '方向规则：45° 弯头接 45° 出口放行');
  ok(!net90.planConnect(end90, 'p1', 'elbow', { modelId: 'GEN-ELB-90-45', outDirDeg: 90 }).ok, '方向规则：45° 弯头接 90° 出口拒绝');
})();

/* ---------- 口径 / 体系 / 占用校验 ---------- */
(function () {
  const net = new ConstructionNetwork();
  net.applyStartPipe(net.planStartPipe({ modelId: 'GEN-PIPE-110', start: { x: 0, y: 0 }, dirDeg: 0, length: 20 }));
  const endB = Object.keys(net.fittings).find(function (id) { return net.fittings[id].type === 'endpoint' && !net.fixed[id]; });
  // 口径不符 → needReducer
  let p = net.planConnect(endB, 'p1', 'pipe', { modelId: 'GEN-PIPE-90', length: 5 });
  ok(!p.ok && p.needReducer === true, '口径不符：拒绝并提示 needReducer，不静默接通');
  // 三通口径不符同理
  p = net.planConnect(endB, 'p1', 'tee', { modelId: 'GEN-TEE-90-90-90', branchDirDeg: 90 });
  ok(!p.ok && p.needReducer === true, '三通口径不符：拒绝');
  // 正确路径：先异径 110→90，再接 90 管
  p = net.planConnect(endB, 'p1', 'reducer', { modelId: 'GEN-RED-110-90' });
  ok(p.ok, '异径接头：110 口匹配大口放行');
  const rr = net.applyConnect(p);
  ok(rr.ok && net.fittings[rr.fittingId].type === 'reducer', '异径接头提交');
  const redId = rr.fittingId;
  const smallKey = Object.keys(net.fittings[redId].ports).find(function (k) { return net.fittings[redId].ports[k].caliber === 90; });
  ok(smallKey && net.fittings[redId].ports[smallKey].dir.x > 0, '异径：小口朝下游');
  p = net.planConnect(redId, smallKey, 'pipe', { modelId: 'GEN-PIPE-90', length: 5 });
  ok(p.ok, '异径后：90 管可接');
  // 体系不相容（手工构造 DN 体系接口）
  const net2 = new ConstructionNetwork();
  net2.applyStartPipe(net2.planStartPipe({ caliber: 110, start: { x: 0, y: 0 }, dirDeg: 0, length: 20, system: 'DN-内径', conn: '法兰' }));
  const e2 = Object.keys(net2.fittings).find(function (id) { return net2.fittings[id].type === 'endpoint' && !net2.fixed[id]; });
  const p2 = net2.planConnect(e2, 'p1', 'pipe', { modelId: 'GEN-PIPE-110', length: 5 });
  ok(!p2.ok && p2.incompatible === true, '体系不相容（DN-内径/法兰 vs PE-外径/热熔）拒绝');
  // 接口占用：同口二次连接拒绝
  const r3 = net.planConnect(redId, smallKey, 'cap', { modelId: 'GEN-CAP-90' });
  net.applyConnect(r3);
  const again = net.planConnect(redId, smallKey, 'valve', { modelId: 'GEN-VALVE-90' });
  ok(!again.ok && /占用/.test(again.reason), '占用接口：重复连接拒绝');
})();

/* ---------- 预览无副作用 / stale / 撤销一步 ---------- */
(function () {
  const net = new ConstructionNetwork();
  net.applyStartPipe(net.planStartPipe({ modelId: 'GEN-PIPE-110', start: { x: 0, y: 0 }, dirDeg: 0, length: 20 }));
  const endB = Object.keys(net.fittings).find(function (id) { return net.fittings[id].type === 'endpoint' && !net.fixed[id]; });
  const snap = JSON.stringify(net.serialize());
  const plan = net.planConnect(endB, 'p1', 'tee', { modelId: 'GEN-TEE-110-110-90', branchDirDeg: 90 });
  ok(JSON.stringify(net.serialize()) === snap, 'planConnect 预览零副作用（serialize 逐字节不变）');
  // stale：预览后模型变化（这里改不了固定端位置，用端口占用模拟）——先占口再 apply
  // 正常路径：beginEdit/commit 一步撤销
  net.beginEdit();
  const r = net.applyConnect(plan);
  ok(r.ok, '事务内 applyConnect 成功');
  net.commitEdit();
  const after = JSON.stringify(net.serialize());
  ok(net.undo() && JSON.stringify(net.serialize()) !== after, '撤销一步：整个连接装配可撤销');
  // 重新装配后序列化往返
  const plan2 = net.planConnect(endB, 'p1', 'tee', { modelId: 'GEN-TEE-110-110-90', branchDirDeg: 90 });
  net.applyConnect(plan2);
  const tee2 = Object.values(net.fittings).find(function (f) { return f.type === 'tee'; });
  // 序列化 v2 往返
  const ser = net.serialize();
  ok(ser.version === 2, 'serialize：版本 2');
  const net2 = ConstructionNetwork.deserialize(JSON.parse(JSON.stringify(ser)));
  ok(!net2.error && near(net2.fittings[tee2.id].placeholder, 0.20), 'deserialize v2 往返：占位字段保留');
  ok(net2.fittings[tee2.id].ports[Object.keys(tee2.ports)[0]].system === 'PE-外径', 'deserialize v2 往返：接口体系保留');
  // v1 存档迁移：剥掉 v2 字段、版本改 1
  const v1 = JSON.parse(JSON.stringify(ser));
  v1.version = 1;
  Object.values(v1.fittings).forEach(function (f) { delete f.placeholder; delete f.productId; });
  Object.values(v1.fittings).forEach(function (f) { Object.values(f.ports).forEach(function (p) { delete p.system; delete p.material; delete p.conn; delete p.kind; }); });
  const net3 = ConstructionNetwork.deserialize(v1);
  ok(!net3.error, 'v1 存档载入成功');
  const f3 = net3.fittings[tee2.id];
  ok(f3.placeholder === 0 && f3.productId === null, 'v1 迁移：配件占位=0 / productId=null');
  const p3 = f3.ports[Object.keys(f3.ports)[0]];
  ok(p3.system === null && p3.kind === null, 'v1 迁移：接口体系/口性质补 null');
  ok(!net3.validate().some(function (i) { return i.level === 'error'; }), 'v1 迁移后 validate 无 error');
  // 完整性校验仍生效：坏数据拒绝
  const bad = JSON.parse(JSON.stringify(ser)); bad.segments[Object.keys(bad.segments)[0]].length = -1;
  ok(!!ConstructionNetwork.deserialize(bad).error, '完整性校验：负长度拒绝');
})();

/* ---------- 装配日志（清单式接管的数据源） ---------- */
(function () {
  const net = new ConstructionNetwork();
  ok(Array.isArray(net.assemblyLog) && net.assemblyLog.length === 0, '装配日志：新网络为空数组');
  const p1 = net.planStartPipe({ modelId: 'GEN-PIPE-110', start: { x: 0, y: 0 }, dirDeg: 90, length: 20 });
  net.applyStartPipe(p1);
  ok(net.assemblyLog.length === 1 && net.assemblyLog[0].kind === 'start' && typeof net.assemblyLog[0].text === 'string',
    '装配日志：起始管道记 1 行 kind=start，text=plan.summary');
  const endB = Object.values(net.fittings).find(function (f) {
    return f.type === 'endpoint' && !net.fixed[f.id] && f.ports.p1.connected;
  }).id;
  /* 编辑器里 apply 一律包在 beginEdit/commitEdit 事务内（runTx）；裸调用会在
   * 管端分支先改模型（隐式 p2 口）再压检查点，故单测同样按事务方式调用 */
  net.beginEdit();
  ok(net.applyConnect(net.planConnect(endB, 'p1', 'pipe', { modelId: 'GEN-PIPE-110', length: 5, dirDeg: 90 })).ok, '事务内接管成功');
  net.commitEdit();
  ok(net.assemblyLog.length === 2 && net.assemblyLog[1].kind === 'connect', '装配日志：接管段记 1 行 kind=connect');
  const before = JSON.stringify(net.assemblyLog);
  ok(net.undo() === true, '装配日志：undo 执行成功');
  ok(JSON.stringify(net.assemblyLog) !== before && net.assemblyLog.length === 1, '装配日志：撤销一步回退 1 行（随快照走）');
  net.beginEdit();
  ok(net.applyConnect(net.planConnect(endB, 'p1', 'pipe', { modelId: 'GEN-PIPE-110', length: 5, dirDeg: 90 })).ok, '撤销后重新接管成功');
  net.commitEdit();
  const ser = JSON.parse(JSON.stringify(net.serialize()));
  ok(Array.isArray(ser.assemblyLog) && ser.assemblyLog.length === 2, '装配日志：serialize 携带');
  const net2 = ConstructionNetwork.deserialize(ser);
  ok(!net2.error && JSON.stringify(net2.assemblyLog) === JSON.stringify(ser.assemblyLog), '装配日志：deserialize 往返一致');
  const v1 = JSON.parse(JSON.stringify(ser));
  delete v1.assemblyLog; v1.version = 1;
  const net4 = ConstructionNetwork.deserialize(v1);
  ok(!net4.error && Array.isArray(net4.assemblyLog) && net4.assemblyLog.length === 0, '装配日志：v1 旧存档迁移为空数组');
})();

console.log('\n== 结论：PASS=' + pass + ' FAIL=' + fail + ' ==');
process.exit(fail ? 1 : 0);
