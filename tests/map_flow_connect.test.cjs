'use strict';
/* [v915 2026-11-03] 步骤 3：贯通判据升级 Node 单测（任务清单 §9.4 次序 4）。
   锁五类场景：
     ① 逐组可达性：全部组通 ⇒ connected；部分组断 ⇒ partial + brokenGroups；
        全断 ⇒ partial 且全组列出（不再被「任一处贴近=整体连通」的旧口径掩盖）
     ② 节点结构化匹配：总管拐点贴近接驳节点 ⇒ 该主管（mi）贯通，哪怕端点远离
     ③ 兼容：不传 nodesLL/groupOfZi ⇒ v861 原口径（整体 min），旧测试场景零变化
     ④ 单组（groups=1）不启用逐组判定（退旧口径，避免单组重复报 partial）
     ⑤ 未连通仍报错：partial / disconnected 的 ok=false 语义不回退（用户要求保留）
   既有 tests/map_flow_demo.test.cjs 的 ③④⑤ 场景继续守旧口径。 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'mod', 'map-flow-demo.js');
function load() {
  const win = { L: undefined };
  new Function('window', fs.readFileSync(SRC, 'utf8'))(win);
  return win.RyMapFlowDemo;
}
const M = load();
const dist = (a, b) => Math.hypot(a.lat - b.lat, a.lng - b.lng);
const P = (x, y) => ({ lat: x, lng: y });

/* 场地：4 根主管（zi0~3），手动两组：组0=[0,1]，组1=[2,3] */
const mains = [
  [P(0, 0), P(100, 0)],      /* zi0，端点 (0,0) */
  [P(0, 50), P(100, 50)],    /* zi1，端点 (0,50) */
  [P(0, 100), P(100, 100)],  /* zi2，端点 (0,100) */
  [P(0, 150), P(100, 150)]   /* zi3，端点 (0,150) */
];
const manual = [[0, 1], [2, 3]];
const groups = 2;
const groupOfZi = zi => M.groupOf(zi, manual, 1);
const tol = 5;

test('①a 逐组连通：总管贯穿两组主管端点 ⇒ connected', () => {
  const trunk = [P(-2, 0), P(-2, 50), P(-2, 100), P(-2, 150)];   /* 每根主管端点 2m 内 */
  const r = M.validateConnection({ hasTrunk: true, trunkLL: trunk, mainsLL: mains, tolM: tol, dist, groupOfZi, groups });
  assert.equal(r.code, 'connected');
  assert.equal(r.ok, true);
});

test('①b 部分断开：总管只贴组0，组1 主管端点 100m 外 ⇒ partial + brokenGroups=[1]', () => {
  const trunk = [P(-2, 0), P(-2, 50)];   /* 组0 两根贴上；组1 无任何贴近 */
  const r = M.validateConnection({ hasTrunk: true, trunkLL: trunk, mainsLL: mains, tolM: tol, dist, groupOfZi, groups });
  assert.equal(r.code, 'partial');
  assert.equal(r.ok, false, '部分断开必须拦截（旧口径此处误报 connected）');
  assert.deepEqual(r.brokenGroups, [1]);
  assert.ok(r.minM > 0 && isFinite(r.minM), 'minM 给出最近距离供文案');
});

test('①c 全断：总管远离一切 ⇒ partial 且列出全部组', () => {
  const trunk = [P(500, 500), P(600, 600)];
  const r = M.validateConnection({ hasTrunk: true, trunkLL: trunk, mainsLL: mains, tolM: tol, dist, groupOfZi, groups });
  assert.equal(r.code, 'partial');
  assert.deepEqual(r.brokenGroups, [0, 1]);
});

test('② 节点结构化匹配：总管拐点贴节点 ⇒ 该主管贯通（端点不必贴近）', () => {
  /* 组1 的主管 zi2 端点 (0,100) 远离总管；但其节点在 (60,100)，总管拐点路过节点 3m 处 */
  const trunk = [P(-2, 0), P(-2, 50), P(57, 100), P(500, 120)];
  const nodes = [{ pipeKey: 'm3', mi: 2, ll: P(60, 100) }];
  const r = M.validateConnection({ hasTrunk: true, trunkLL: trunk, mainsLL: mains, tolM: tol, dist, groupOfZi, groups, nodesLL: nodes });
  assert.equal(r.code, 'connected', '节点被总管拐点匹配 ⇒ zi2 贯通 ⇒ 组1 连通');
  /* 对照：同样的总管，没有节点数据 ⇒ 组1 断（partial），证明节点匹配真的参与判定 */
  const rNoNode = M.validateConnection({ hasTrunk: true, trunkLL: trunk, mainsLL: mains, tolM: tol, dist, groupOfZi, groups });
  assert.equal(rNoNode.code, 'partial');
  assert.deepEqual(rNoNode.brokenGroups, [1]);
});

test('②b 节点未命中（拐点距离 > tol）不贯通', () => {
  const trunk = [P(-2, 0), P(-2, 50), P(57, 100), P(500, 120)];   /* 距节点 3m */
  const nodes = [{ pipeKey: 'm3', mi: 2, ll: P(70, 100) }];       /* 节点在 13m 外 */
  const r = M.validateConnection({ hasTrunk: true, trunkLL: trunk, mainsLL: mains, tolM: tol, dist, groupOfZi, groups, nodesLL: nodes });
  assert.equal(r.code, 'partial', '节点 13m 外不构成匹配');
});

test('③ 兼容：不传 groupOfZi/groups ⇒ v861 原口径（整体 min，任一处贴近即连通）', () => {
  const trunk = [P(-2, 0), P(-50, 20)];   /* 只贴 zi0 */
  const r = M.validateConnection({ hasTrunk: true, trunkLL: trunk, mainsLL: mains, tolM: tol, dist });
  assert.equal(r.code, 'connected', '旧口径语义不变（多组也不会 partial）');
  assert.ok(r.minM <= tol);
});

test('③b 兼容：nodesLL 有但 groups=1 ⇒ 不启用逐组，退旧口径', () => {
  const trunk = [P(-2, 0), P(-50, 20)];
  const r = M.validateConnection({ hasTrunk: true, trunkLL: trunk, mainsLL: mains, tolM: tol, dist, groupOfZi, groups: 1, nodesLL: [] });
  assert.equal(r.code, 'connected');
});

test('③c 兼容：旧驳接点口径不回归（hasSeg+couplersLL 贴近连通）', () => {
  const trunk = [P(0.003, 0.003), P(-50, 20)];   /* 平面距离≈4.2m */
  const r = M.validateConnection({ hasTrunk: true, trunkLL: trunk, mainsLL: mains, tolM: tol, dist,
    hasSeg: true, couplersLL: [P(0, 0)] });
  assert.equal(r.code, 'connected');
});

test('④ no-trunk / no-data 优先级不变', () => {
  assert.equal(M.validateConnection({ hasTrunk: false, trunkLL: [], mainsLL: mains, tolM: tol, dist, groupOfZi, groups }).code, 'no-trunk');
  assert.equal(M.validateConnection({ hasTrunk: true, trunkLL: [P(0, 0)], mainsLL: [], tolM: tol, dist, groupOfZi, groups }).code, 'no-data');
});

test('⑤ 失败语义不回退：partial/disconnected 均 ok=false（未连通不播放）', () => {
  const trunk = [P(500, 500)];
  const r1 = M.validateConnection({ hasTrunk: true, trunkLL: trunk, mainsLL: mains, tolM: tol, dist, groupOfZi, groups });
  assert.equal(r1.ok, false);
  const r2 = M.validateConnection({ hasTrunk: true, trunkLL: trunk, mainsLL: mains, tolM: tol, dist });
  assert.equal(r2.ok, false);
});

test('⑥ 宿主接线：collect 采 dd.couplerNodes + start 传逐组参数 + partial 文案', () => {
  const src = fs.readFileSync(SRC, 'utf8');
  assert.ok(/\(dd\.couplerNodes \|\| \[\]\)\.forEach/.test(src), 'collect 必须采 dd.couplerNodes');
  assert.ok(/if \(!n \|\| n\.x == null \|\| n\.y == null\) return;/.test(src),
    '失配节点（坐标 null，v913 missing）必须跳过（宁缺不错）');
  assert.ok(/nodesLL: d\.nodesLL/.test(src) && /groupOfZi: function \(zi\)/.test(src) && /groups: d\.gCount/.test(src),
    'start 必须把 nodesLL/groupOfZi/groups 传给 validateConnection');
  assert.ok(/轮灌组 ' \+ gs/.test(src), 'partial 必须逐组报错（列出断组号）');
});

test('⑥b 施工节点：主管/支管节点按有效几何和桩号映射到所属轮灌区', () => {
  const dd = { mainPipes: [[{}, {}]], branchPipes: [[{}, {}]] };
  const nodes = [
    { id: 'N-01', pid: 'main-0', atM: 30 },
    { id: 'N-02', pid: 'branch-0', atM: 12 },
    { id: 'N-03', pid: 'front', atM: 8 },
    { id: 'N-04', pid: 'main-2', atM: 5 }
  ];
  const pointAt = (pid, _dd, atM) => ({ x: atM, y: pid.startsWith('branch-') ? 2 : 1 });
  const toLL = p => ({ lat: p.y, lng: p.x });
  const out = M.collectWorkspaceNodes(dd, nodes, pointAt, toLL);
  assert.deepEqual(out.map(n => [n.nodeId, n.pipeKey, n.mi, n.ll]), [
    ['N-01', 'm1', 0, P(1, 30)],
    ['N-02', 'b1', 0, P(2, 12)]
  ]);
});

test('⑥c 多条已保存总管各自投影与绘制，不拼出不存在的线段', () => {
  const onlineSrc = fs.readFileSync(path.join(__dirname, '..', 'mod', 'online-map.js'), 'utf8');
  const src = fs.readFileSync(SRC, 'utf8');
  assert.ok(/getTrunkLines: function \(\)/.test(onlineSrc), '地图宿主必须逐条交付已保存总管');
  assert.ok(/trunkLinesLL\.forEach\(function\(line\)/.test(src), '演示采集保留总管分线');
  assert.ok(/\(d\.trunkLinesLL \|\|/.test(src), '演示渲染按每条总管独立画线');
});

/* ── [v916 步骤 4] 演示水路入口精确化 ─────────────────────────────── */
const d4 = () => ({
  nodesLL: [
    { pipeKey: 'm1', mi: 0, ll: P(10, 0) },    /* 组0 */
    { pipeKey: 'm3', mi: 2, ll: P(60, 100) },  /* 组1 */
    { pipeKey: 'm2', mi: 1, ll: null },        /* 失配（防御：collect 不该给，入口兜底跳过） */
    { pipeKey: 'm9', mi: 8, ll: P(5, 5) }      /* mi 越界 */
  ],
  manual: [[0, 1], [2, 3]], nPer: 1
});

test('⑦a entrancesOf：活动组入口=该组节点，组间互不串', () => {
  const d = d4();
  const e0 = M.entrancesOf(d, 0);
  assert.equal(e0.length, 1);
  assert.equal(e0[0].pipeKey, 'm1');
  const e1 = M.entrancesOf(d, 1);
  assert.equal(e1.length, 1);
  assert.equal(e1[0].pipeKey, 'm3');
});

test('⑦b entrancesOf：失配/越界节点过滤，空数据返回 []', () => {
  const d = d4();
  assert.ok(!M.entrancesOf(d, 0).some(n => n.pipeKey === 'm9'), 'mi 越界不进入口');
  assert.ok(!M.entrancesOf(d, 0).some(n => n.pipeKey === 'm2'), 'll null 不进入口');
  assert.deepEqual(M.entrancesOf({ nodesLL: [] }, 0), [], '无节点数据 ⇒ 空（渲染退化零破坏）');
  assert.deepEqual(M.entrancesOf(null, 0), []);
});

test('⑦c 渲染接线：render 画节点标记+活动组入口双环', () => {
  const src = fs.readFileSync(SRC, 'utf8');
  assert.ok(/entrancesOf\(d, g\)\.forEach/.test(src), 'render 必须为活动组画入口标记');
  assert.ok(/radius: 9, color: '#b45309'/.test(src), '入口外环（描边 #b45309）');
  assert.ok(/radius: 4, color: '#b45309'/.test(src), '全部节点常驻小橙点');
  assert.ok(/entrancesOf: entrancesOf/.test(src), '纯函数必须导出（Node 单测口径）');
});
