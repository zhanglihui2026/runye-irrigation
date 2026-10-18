'use strict';

/* P3 回归：活跃水力引擎的端点聚类、根选择、T 形拆段和闭环边界。 */
const assert = require('node:assert/strict');
const Core = require('../runye-hydraulics-core.js');

/* 在赤道附近把米坐标映射成 [lat,lng]，便于构造确定性快照。 */
const meterPoint = (x, y) => [y / 111319.49, x / 111319.49];

/* 支管端点落在主管中段 1 m 内，应将主管拆为两段并接入同一棵树。 */
const tJunction = {
  sourcePos: { lat: 0, lng: 0 },
  segments: [
    { id: 'main-t', kind: 'main', dn: 90, latLng: [meterPoint(0, 0), meterPoint(100, 0)] },
    { id: 'branch-t', kind: 'branch', dn: 63, latLng: [meterPoint(50, 1), meterPoint(50, 40)] }
  ],
  dripTapes: []
};
const tTree = Core.buildTree(tJunction, { snapTol: 3 });
assert.equal(tTree.orphans.length, 0, 'T 形搭接应将主管和支管连到同一棵树');
assert.equal(tTree.segs.filter(s => s.sourceId === 'main-t').length, 2, '主管应在搭接处拆成两段');
assert.equal(tTree.order.length, 3, '拆分后的两段主管和一段支管都应进入 BFS 树');
const splitMain = tTree.segs.filter(s => s.sourceId === 'main-t');
assert.deepEqual(splitMain.map(s => s.id), ['main-t_a', 'main-t_b'], '拆分段应有稳定且不同的派生 ID');
assert.ok(splitMain.every(s => s.kind === 'main' && s.dn === 90), '拆分段应继承主管类型和管径');
assert.equal(tTree.segs.find(s => s.id === 'branch-t').dn, 63, '支管管径映射应保留');

/* 同一条折线主管的不同区间各接一条支管时，两处三通都必须保留。 */
const multiT = {
  sourcePos: { lat: 0, lng: 0 },
  segments: [
    { id: 'main-multi', kind: 'main', dn: 90,
      latLng: [meterPoint(0, 0), meterPoint(50, 0), meterPoint(100, 0)] },
    { id: 'branch-west', kind: 'branch', dn: 63, latLng: [meterPoint(25, 1), meterPoint(25, 30)] },
    { id: 'branch-east', kind: 'branch', dn: 63, latLng: [meterPoint(75, 1), meterPoint(75, 30)] }
  ],
  dripTapes: []
};
const multiTree = Core.buildTree(multiT, { snapTol: 3 });
assert.equal(multiTree.orphans.length, 0, '主管上的多个 T 形支管都应接入水源树');
assert.equal(multiTree.segs.filter(s => s.sourceId === 'main-multi').length, 3,
  '同一主管应按两个三通位置拆成三段');
assert.equal(multiTree.order.length, 5, '拆出的三段主管与两条支管都应进入 BFS 树');

/* 水源靠近管网末端时，BFS 应从末端向上游遍历，而不是固定从首段首点开始。 */
const reversedRoot = {
  sourcePos: { lat: 0, lng: 10 / 111319.49 },
  segments: [
    { id: 'main-r', kind: 'main', dn: 90, latLng: [meterPoint(0, 0), meterPoint(5, 0)] },
    { id: 'branch-r', kind: 'branch', dn: 63, latLng: [meterPoint(5, 0), meterPoint(10, 0)] }
  ],
  dripTapes: []
};
const rootTree = Core.buildTree(reversedRoot, { snapTol: 0.5 });
assert.equal(rootTree.orphans.length, 0);
assert.deepEqual(rootTree.order, [1, 0], '水源根应决定下游段优先的遍历方向');

/* 三段闭环仅取两条边构建生成树；额外闭合边记录为 loop，不记为 orphan。 */
const triangle = {
  sourcePos: { lat: 0, lng: 0 },
  segments: [
    { id: 'ab', kind: 'main', dn: 90, latLng: [meterPoint(0, 0), meterPoint(20, 0)] },
    { id: 'bc', kind: 'main', dn: 90, latLng: [meterPoint(20, 0), meterPoint(20, 20)] },
    { id: 'ca', kind: 'main', dn: 90, latLng: [meterPoint(20, 20), meterPoint(0, 0)] }
  ],
  dripTapes: []
};
const cycleTree = Core.buildTree(triangle, { snapTol: 0.5 });
assert.equal(cycleTree.order.length, 2, '闭环只允许两条边进入生成树');
assert.equal(cycleTree.loops.length, 1, '第三条闭合边应被识别为环');
assert.equal(cycleTree.orphans.length, 0, '环边不应同时报告为孤立管段');

/* 端点间距小于容差时连接，超过容差时保留为孤立段。 */
function gapNetwork(gap) {
  return {
    sourcePos: { lat: 0, lng: 0 },
    segments: [
      { id: 'left', kind: 'main', dn: 90, latLng: [meterPoint(0, 0), meterPoint(10, 0)] },
      { id: 'right', kind: 'branch', dn: 63, latLng: [meterPoint(10 + gap, 0), meterPoint(20 + gap, 0)] }
    ],
    dripTapes: []
  };
}
assert.equal(Core.buildTree(gapNetwork(2.5), { snapTol: 3 }).orphans.length, 0,
  '端点间距小于吸附容差时应连通');
assert.equal(Core.buildTree(gapNetwork(3.5), { snapTol: 3 }).orphans.length, 1,
  '端点间距超过吸附容差时应保留一个孤立段');

/* 异常坐标段不能进入长度/流量计算；有效相邻管段仍可正常建树。 */
const malformedCoordinates = Core.buildTree({
  sourcePos: { lat: 0, lng: 0 },
  segments: [
    { id: 'bad-nan', kind: 'main', dn: 90, latLng: [[0, 0], [NaN, 0.001]] },
    { id: 'bad-range', kind: 'branch', dn: 63, latLng: [[0, 181], [0, 182]] },
    { id: 'valid', kind: 'main', dn: 90, latLng: [meterPoint(0, 0), meterPoint(10, 0)] }
  ],
  dripTapes: []
}, { snapTol: 0.5 });
assert.deepEqual(malformedCoordinates.segs.map(segment => segment.id), ['valid'],
  'NaN 和超出经纬度范围的管段应被排除');
assert.equal(malformedCoordinates.order.length, 1, '有效管段仍进入树');
assert.equal(malformedCoordinates.warnings.filter(message => message.includes('无效经纬度')).length, 2,
  '每条被排除的异常坐标段都应给出诊断');

const overlay = Core.mapOverlay({ valid: true, segRows: [], opts: { vmax: 2 }, qTotal: 8, tdh: 21 }, {
  ts: 123, plotId: 'plot-a', designRevisionId: 'rev-a'
});
assert.deepEqual(overlay, {
  version: 2, networkTs: 123, plotId: 'plot-a', designRevisionId: 'rev-a',
  calculatedAt: overlay.calculatedAt, vmax: 2, qTotal: 8, tdh: 21, items: {}
}, 'map status snapshots must bind to the plot and design revision as well as network timestamp');

console.log('runye_hydraulics_topology.test.cjs: passed');
