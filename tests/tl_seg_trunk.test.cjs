'use strict';
/* tests/tl_seg_trunk.test.cjs —— 段总管生成器（v859 用户需求）
 *
 * 钉的是几何契约：
 *   ① 垂直于主管主方向：水平主管 ⇒ 段总管沿 y；竖直主管 ⇒ 沿 x。
 *   ② 串联点落在各主管端点上（同一侧，共线）；单区（<2 条）不生成。
 *   ③ 两端驳接点 = 线段两端，含 stub 延伸（≥3m）。
 *   ④ 不平行/两侧都不共线 ⇒ 返回 null，绝不猜一条错位置的总管。
 *   ⑤ len = 两端点距离；lenJoin = len − 2×stub（扣除两段驳接延伸）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'mod', 'tl-seg-trunk.js');
function load() {
  const win = {};
  new Function('window', fs.readFileSync(SRC, 'utf8'))(win);
  return win.RySegTrunk;
}
const S = load();
const R = (v) => Math.round(v * 1e6) / 1e6;

test('① 水平主管 ⇒ 段总管沿 y（垂直），base = 共同端点 x', () => {
  const mains = [
    [{ x: 10, y: 25 }, { x: 95, y: 25 }],
    [{ x: 10, y: 75 }, { x: 95, y: 75 }],
    [{ x: 10, y: 125 }, { x: 95, y: 125 }]
  ];
  const g = S.build(mains);
  assert.ok(g, '应生成');
  assert.equal(g.axis, 'y', '段总管垂直于水平主管');
  assert.equal(R(g.base), 10, '串联左端（min 侧共线）');
  assert.equal(g.side, 'lo');
  assert.equal(g.joinPts.length, 3);
  g.joinPts.forEach((p, i) => {
    assert.equal(R(p.x), 10);
    assert.equal(R(p.y), [25, 75, 125][i]);
  });
});

test('② 竖直主管 ⇒ 段总管沿 x（垂直），base = 共同端点 y', () => {
  const mains = [
    [{ x: 30, y: 5 }, { x: 30, y: 90 }],
    [{ x: 70, y: 5 }, { x: 70, y: 90 }]
  ];
  const g = S.build(mains);
  assert.ok(g);
  assert.equal(g.axis, 'x');
  assert.equal(R(g.base), 5, '串联上端（lo 侧）');
  assert.equal(g.joinPts.length, 2);
});

test('③ 驳接点 = 线段两端，stub ≥ 3m；len/lenJoin 口径正确', () => {
  const mains = [
    [{ x: 10, y: 25 }, { x: 95, y: 25 }],
    [{ x: 10, y: 75 }, { x: 95, y: 75 }]
  ];
  const g = S.build(mains);
  assert.ok(g);
  assert.equal(g.couplers.length, 2);
  assert.deepEqual(g.couplers[0], g.points[0]);
  assert.deepEqual(g.couplers[1], g.points[1]);
  const ys = g.points.map(p => p.y).sort((a, b) => a - b);
  assert.ok(ys[0] < 25 && 25 - ys[0] >= 3, '下端驳接段 ≥3m');
  assert.ok(ys[1] > 75 && ys[1] - 75 >= 3, '上端驳接段 ≥3m');
  assert.equal(R(g.len), R(ys[1] - ys[0]));
  assert.equal(R(g.lenJoin), R(g.len - 2 * g.stub));
});

test('④ 单区不生成；两侧都不共线返回 null', () => {
  assert.equal(S.build([[{ x: 10, y: 25 }, { x: 95, y: 25 }]]), null, '单区无需串联');
  assert.equal(S.build(null), null);
  assert.equal(S.build([]), null);
  /* 参差：两条主管的 min 端 x 与 max 端 x 都对不齐 */
  const mess = [
    [{ x: 10, y: 25 }, { x: 95, y: 25 }],
    [{ x: 14.2, y: 75 }, { x: 91, y: 75 }]
  ];
  const g = S.build(mess);
  assert.equal(g, null, '不硬生成错位的总管');
});

test('⑤ 高程无关 & 空输入安全；多数投票定主方向', () => {
  assert.equal(S.build([[{ x: 1 }]]), null, '残线过滤');
  /* 2 条水平 + 1 条竖直 ⇒ 多数仍是水平 ⇒ 沿 y（竖线被当参与端点） */
  const mixed = [
    [{ x: 10, y: 25 }, { x: 95, y: 25 }],
    [{ x: 10, y: 75 }, { x: 95, y: 75 }],
    [{ x: 10, y: 125 }, { x: 10, y: 160 }]
  ];
  const g = S.build(mixed);
  assert.ok(g);
  assert.equal(g.axis, 'y');
});
