'use strict';
/* tests/map_flow_demo.test.cjs —— 在线地图轮灌演示（v861 用户需求）
 *
 * 钉纯逻辑契约（图层/动画靠实机验证）：
 *   ① 分组：手动分组（面积成组）优先；自动均分每组 nPer=combinedN 个分区；越界 -1。
 *   ② groupCount：手动 = mg.length；均分 = ceil(total/nPer)；单区至少 1 组。
 *   ③ validateConnection：无总管 no-trunk / 无主管 no-data / 贴驳接点连通 /
 *      贴主管端点连通 / 都不贴 disconnected 且给出最近距离。
 *   ④ 容差边界：5m 连通、5.1m 断开（tolM=5）。
 *   ⑤ 无段总管时驳接点不参与判定（hasSeg=false 时 couplers 贴近也不算连通）。
 */
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
/* 米制平面距离（测试用，替代 haversine） */
const dist = (a, b) => Math.hypot(a.lat - b.lat, a.lng - b.lng);
const P = (x, y) => ({ lat: x, lng: y });   /* 用平面值冒充经纬度，dist 注入后口径一致 */

test('① groupOf：手动优先、均分口径、越界 -1', () => {
  assert.equal(M.groupOf(3, null, 2), 1, '均分 nPer=2：zi3 → 组1');
  assert.equal(M.groupOf(0, null, 2), 0);
  assert.equal(M.groupOf(2, [[0, 2], [1, 3]], 1), 0, '手动组0 含 zi0/2');
  assert.equal(M.groupOf(1, [[0, 2], [1, 3]], 1), 1);
  assert.equal(M.groupOf(9, [[0], [1]], 1), -1, '手动模式未分组区 → -1');
  assert.equal(M.groupOf(-1, null, 2), -1);
});

test('② groupCount：手动取组数、均分向上取整、单区至少 1', () => {
  assert.equal(M.groupCount(12, null, 4), 3);
  assert.equal(M.groupCount(10, null, 4), 3, 'ceil(10/4)=3');
  assert.equal(M.groupCount(10, [[0, 1], [2], [3, 4, 5]], 4), 3);
  assert.equal(M.groupCount(1, null, 4), 1);
  assert.equal(M.groupCount(0, null, 4), 0);
});

test('③ validateConnection：四种 code', () => {
  const mains = [[P(0, 0), P(100, 0)], [P(0, 50), P(100, 50)]];
  const trunkNear = [P(-3, 0), P(-50, 20)];       /* 距主管0端点 3m */
  const r1 = M.validateConnection({ hasTrunk: false, trunkLL: trunkNear, mainsLL: mains, tolM: 5, dist });
  assert.equal(r1.code, 'no-trunk');
  const r2 = M.validateConnection({ hasTrunk: true, trunkLL: trunkNear, mainsLL: [], tolM: 5, dist });
  assert.equal(r2.code, 'no-data');
  const r3 = M.validateConnection({ hasTrunk: true, trunkLL: trunkNear, mainsLL: mains, tolM: 5, dist });
  assert.equal(r3.ok, true, '总管贴主管端点 3m ≤ 5m ⇒ 连通');
  const trunkFar = [P(-30, 0), P(-80, 20)];
  const r4 = M.validateConnection({ hasTrunk: true, trunkLL: trunkFar, mainsLL: mains, tolM: 5, dist });
  assert.equal(r4.ok, false, '最近 30m > 5m ⇒ 断开');
  assert.equal(r4.code, 'disconnected');
  assert.equal(Math.round(r4.minM), 30);
});

test('④ 容差边界 + ⑤ 驳接点仅在 hasSeg 时参与', () => {
  const mains = [[P(0, 0), P(100, 0)]];
  const t5 = [P(-5, 0)], t51 = [P(-5.1, 0)];
  assert.equal(M.validateConnection({ hasTrunk: true, trunkLL: t5, mainsLL: mains, tolM: 5, dist }).ok, true);
  assert.equal(M.validateConnection({ hasTrunk: true, trunkLL: t51, mainsLL: mains, tolM: 5, dist }).ok, false);
  /* 总管远离主管但贴近驳接点：有段总管 ⇒ 连通；无段总管 ⇒ 断开 */
  const couplers = [P(200, 50)];
  const tCoup = [P(203, 50)];
  const base = { hasTrunk: true, trunkLL: tCoup, mainsLL: mains, tolM: 5, dist };
  assert.equal(M.validateConnection(Object.assign({ couplersLL: couplers, hasSeg: true }, base)).ok, true, '段总管驳接点 3m');
  assert.equal(M.validateConnection(Object.assign({ couplersLL: couplers, hasSeg: false }, base)).ok, false, '无段总管时驳接点不算');
});
