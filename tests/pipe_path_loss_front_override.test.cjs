'use strict';
/* tests/pipe_path_loss_front_override.test.cjs —— 总管总长外部覆盖（v843）
 *
 * 为什么需要这个入参：
 *   用户口径「扬程 = 在线地图总管长度 + 分区主管及支管长度」。总管那一段在图面里
 *   是 frontPipe（设计推出来的），在在线地图里是用户亲手画的那根 —— 两条路长度不一样。
 *   要让扬程用地图实测长，就得让路径校核按那个长度算总管沿程损失。
 *
 * 为什么是"按比例缩"而不是"整根替换"：
 *   总管是一根**带多处取水点**的管，各段流量沿程递减。直接「全长 × 组流量」会把后段
 *   流量算大、损失算大。按比例缩各取水点的 run（相对位置不变）既让总长等于实测值，
 *   又不动"取水点前后流量不同"这个物理事实。
 *
 * 最要紧的一条：**不传这个入参时结果必须与改动前逐位相同** —— 它是可选参数，
 *   老调用方（没有地图总管的场景）一个数都不该变。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const L = require(path.join(__dirname, '..', 'hydraulic-calc', 'pipe-path-loss.js'));

/* 假 hazen：损失 = L·Q/D。单调、可手算，用来验"按长度线性"这件事就够了。 */
const hazen = (len, q, d) => len * q / d;
const innerDiam = (od) => od / 1000;

const BASE = {
  zones: [
    { zi: 0, run: 100, main: 50, branch: 20, flow: 10 },
    { zi: 1, run: 200, main: 50, branch: 20, flow: 10 }
  ],
  groups: [[0, 1]],
  frontOd: 160, mainOd: 90, branchOd: 63,
  sourceDistance: 0,
  branchCount: 2, branchF: 1,
  innerDiam: innerDiam, hazen: hazen
};

test('① 不传 frontTotalOverride：front 就是各分区原始 run（老调用方零影响）', () => {
  const r = L.calculate({ ...BASE });
  assert.equal(r.paths.length, 2);
  assert.deepEqual(r.paths.map(p => p.front), [100, 200]);
  assert.equal(r.worst.front, 200);
});

test('② 传 400（原来是 200）：各取水点按比例缩到 [200, 400]', () => {
  const r = L.calculate({ ...BASE, frontTotalOverride: 400 });
  assert.deepEqual(r.paths.map(p => p.front), [200, 400]);
  assert.equal(r.worst.front, 400, '最远分区的 front 必须正好等于实测总长');
});

test('③ 传 100（缩短）：按比例缩到 [50, 100]，不是"最小也留 100"', () => {
  const r = L.calculate({ ...BASE, frontTotalOverride: 100 });
  assert.deepEqual(r.paths.map(p => p.front), [50, 100]);
});

test('④ 缩放后各段流量口径不变（后段仍小于前段）', () => {
  const r = L.calculate({ ...BASE, frontTotalOverride: 400 });
  /* 两段长度都是 200，但流量 20 → 10 ⇒ 第二段损失必须是第一段的一半 */
  const a = r.paths[0].frontPipeLoss;
  const b = r.paths[1].frontPipeLoss - a;
  assert.ok(Math.abs(b - a / 2) < 1e-9, '前段 ' + a + ' / 后段 ' + b);
});

test('⑤ 缩放对主管/支管损失没有任何影响（只动总管）', () => {
  const a = L.calculate({ ...BASE });
  const b = L.calculate({ ...BASE, frontTotalOverride: 400 });
  assert.equal(a.worst.mainLoss, b.worst.mainLoss);
  assert.equal(a.worst.branchLoss, b.worst.branchLoss);
});

test('⑥ 0 / 负数 / NaN / 字符串垃圾 ⇒ 不缩放（等同于没传）', () => {
  for (const bad of [0, -5, NaN, undefined, null, 'abc', '']) {
    const r = L.calculate({ ...BASE, frontTotalOverride: bad });
    assert.deepEqual(r.paths.map(p => p.front), [100, 200], '入参 ' + String(bad));
  }
});

test('⑦ 退化：所有取水点 run 都是 0 ⇒ 不缩放，也不出 NaN', () => {
  const z = BASE.zones.map(x => ({ ...x, run: 0 }));
  const r = L.calculate({ ...BASE, zones: z, frontTotalOverride: 400 });
  assert.deepEqual(r.paths.map(p => p.front), [0, 0]);
  assert.ok(isFinite(r.worst.frontPipeLoss), '损失必须有限：' + r.worst.frontPipeLoss);
});

test('⑧ 多组时每组各自按自己的 runMax 缩放（组之间互不影响）', () => {
  const r = L.calculate({
    ...BASE,
    zones: [
      { zi: 0, run: 100, main: 50, branch: 20, flow: 10 },
      { zi: 1, run: 200, main: 50, branch: 20, flow: 10 },
      { zi: 2, run: 50, main: 50, branch: 20, flow: 10 }
    ],
    groups: [[0, 1], [2]],
    frontTotalOverride: 400
  });
  /* 组 0：runMax=200 ⇒ ×2 ⇒ [200,400]；组 1：runMax=50 ⇒ ×8 ⇒ [400] */
  assert.deepEqual(r.paths.map(p => p.front), [200, 400, 400]);
});

test('⑨ worst 仍按 total 最大挑（缩放不改变"谁是最不利"）', () => {
  const a = L.calculate({ ...BASE });
  const b = L.calculate({ ...BASE, frontTotalOverride: 1000 });
  assert.equal(a.worst.zoneIndex, b.worst.zoneIndex);
});
