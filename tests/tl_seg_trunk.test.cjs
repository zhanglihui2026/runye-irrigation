'use strict';
/* tests/tl_seg_trunk.test.cjs —— 段总管生成器（v859 需求 / v862 判定重写 / v868 起止定版）
 *
 * 钉的是几何契约：
 *   ① 垂直于主管主方向：水平主管 ⇒ 干线竖直；竖直主管 ⇒ 干线水平。
 *   ② 干线位置 = 各主管走向范围交集的中点；斜主管 / 交集为空 ⇒ null（宁可不出）。
 *   ③ 单区（<2 条）不生成。
 *   ④ [v868] 起止 = 首末主管：points[0]=起点=最上/最左分区主管（vMin 端），
 *      points[1]=终点=最下/最右分区主管（vMax 端）；两端不再外延（stub=0，
 *      lenJoin=len）。方向依据：简图世界系北=−y ⇒ 上/左恒为 vMin 端。
 *   ⑤ len = 两端点（首末主管间距）；lenJoin = len − 2×stub = len。
 *   ⑥ [v862 回归] 多行网格的竖直主管（行间走向范围恰好相接）⇒ 必须生成 ——
 *      v859 的「同侧端点共线」判定在此场景恒返 null（用户线上「没看到」的根因）。
 *   ⑦ [v868] 方向语义与输入顺序无关：主管乱序给出，起点仍锁 vMin 端。
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

test('① 水平主管 ⇒ 干线竖直，base = 走向范围交集的中点', () => {
  const mains = [
    [{ x: 10, y: 25 }, { x: 95, y: 25 }],
    [{ x: 10, y: 75 }, { x: 95, y: 75 }],
    [{ x: 10, y: 125 }, { x: 95, y: 125 }]
  ];
  const g = S.build(mains);
  assert.ok(g, '应生成');
  assert.equal(g.axis, 'y', '干线垂直于水平主管（沿 y 延伸）');
  assert.equal(R(g.base), 52.5, '交集 [10,95] 的中点');
  assert.equal(g.side, 'ends', 'v868 起止=首末主管');
  assert.equal(g.joinPts.length, 3);
  g.joinPts.forEach((p, i) => {
    assert.equal(R(p.x), 52.5, '交点在干线上');
    assert.equal(R(p.y), [25, 75, 125][i]);
  });
});

test('② 竖直主管 ⇒ 干线水平，base = y 范围交集的中点', () => {
  const mains = [
    [{ x: 30, y: 5 }, { x: 30, y: 90 }],
    [{ x: 70, y: 5 }, { x: 70, y: 90 }]
  ];
  const g = S.build(mains);
  assert.ok(g);
  assert.equal(g.axis, 'x');
  assert.equal(R(g.base), 47.5, 'y 交集 [5,90] 的中点');
  assert.equal(g.joinPts.length, 2);
});

test('④ [v868] 起止=首末主管：两端不外延（stub=0）、len/lenJoin 口径', () => {
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
  assert.equal(R(ys[0]), 25, '起点端 = 最上分区主管（不再外延）');
  assert.equal(R(ys[1]), 75, '终点端 = 最下分区主管（不再外延）');
  assert.equal(g.stub, 0, 'v868 无外延驳接段');
  assert.equal(R(g.len), 50, '全长 = 首末主管间距');
  assert.equal(R(g.lenJoin), R(g.len - 2 * g.stub));
  assert.equal(R(g.lenJoin), 50);
  /* 驳接点与首末主管串联点重合（方案B 语义：驳接点落在主管上） */
  assert.deepEqual(g.couplers[0], g.joinPts[0]);
  assert.deepEqual(g.couplers[1], g.joinPts[g.joinPts.length - 1]);
});

test('③ 单区不生成；走向错开无交集 / 斜主管 ⇒ null', () => {
  assert.equal(S.build([[{ x: 10, y: 25 }, { x: 95, y: 25 }]]), null, '单区无需串联');
  assert.equal(S.build(null), null);
  assert.equal(S.build([]), null);
  /* 走向轴完全错开：x 区间 [10,50] 与 [60,95] 无交集，垂直干线穿不过两根主管 */
  const apart = [
    [{ x: 10, y: 25 }, { x: 50, y: 25 }],
    [{ x: 60, y: 75 }, { x: 95, y: 75 }]
  ];
  assert.equal(S.build(apart), null, '交集为空不出');
  /* 斜主管：两端 y 差远超 EPS ⇒ 不猜 */
  const slant = [
    [{ x: 10, y: 25 }, { x: 95, y: 25 }],
    [{ x: 14.2, y: 75 }, { x: 91, y: 75.8 }]
  ];
  assert.equal(S.build(slant), null, '斜主管不出');
});

test('⑤ 残线过滤；方向不一致（水平+竖直混合）⇒ null（宁可不出）', () => {
  assert.equal(S.build([[{ x: 1 }]]), null, '残线过滤');
  /* 2 条水平 + 1 条竖直：竖直主管在干线延伸轴（y）上两端坐标差 35m ⇒ 斜 ⇒ null */
  const mixed = [
    [{ x: 10, y: 25 }, { x: 95, y: 25 }],
    [{ x: 10, y: 75 }, { x: 95, y: 75 }],
    [{ x: 10, y: 125 }, { x: 10, y: 160 }]
  ];
  assert.equal(S.build(mixed), null, '方向不一致不出');
});

test('⑥ [v862 回归] 2×2 多行网格竖直主管（v859 恒 null 的用户场景）⇒ 必须生成', () => {
  const mains = [
    [{ x: 12, y: 0 }, { x: 12, y: 50 }],
    [{ x: 37, y: 0 }, { x: 37, y: 50 }],
    [{ x: 12, y: 50 }, { x: 12, y: 100 }],
    [{ x: 37, y: 50 }, { x: 37, y: 100 }]
  ];
  const g = S.build(mains);
  assert.ok(g, '行间范围相接（交集 {50}）必须生成，这是线上用户场景');
  assert.equal(g.axis, 'x', '干线水平（垂直于竖直主管）');
  assert.equal(R(g.base), 50, 'base 落在行间分界上');
  assert.equal(g.joinPts.length, 4, '穿过全部 4 根主管');
  const xs = g.points.map(p => p.x).sort((a, b) => a - b);
  assert.equal(R(xs[0]), 12, '起点端 = 最左分区主管（不外延）');
  assert.equal(R(xs[1]), 37, '终点端 = 最右分区主管（不外延）');
});

test('⑦ 部分错开但仍有交集 ⇒ 生成（相邻行共享边即可）', () => {
  const mains = [
    [{ x: 10, y: 0 }, { x: 10, y: 60 }],
    [{ x: 40, y: 0 }, { x: 40, y: 60 }],
    [{ x: 10, y: 60 }, { x: 10, y: 95 }],
    [{ x: 40, y: 60 }, { x: 40, y: 95 }]
  ];
  const g = S.build(mains);
  assert.ok(g);
  assert.equal(R(g.base), 60, '交集 [60,60]');
});

test('⑧ [v868] 方向语义与输入顺序无关：起点恒=上/左（vMin 端）、终点恒=下/右（vMax 端）', () => {
  /* 同一对主管，倒序给出 ⇒ points 顺序不变（起点=vMin=上/北） */
  const a = [{ x: 10, y: 25 }, { x: 95, y: 25 }];
  const b = [{ x: 10, y: 75 }, { x: 95, y: 75 }];
  const g1 = S.build([a, b]);
  const g2 = S.build([b, a]);
  assert.deepEqual(g1.points, g2.points, '输入顺序不影响起止');
  assert.equal(R(g1.points[0].y), 25, '起点=上分区（世界系北=−y ⇒ vMin）');
  assert.equal(R(g1.points[1].y), 75, '终点=下分区（vMax）');
  /* 竖直主管（干线水平沿 x）：起点=左（vMin x）、终点=右（vMax x） */
  const g3 = S.build([
    [{ x: 70, y: 5 }, { x: 70, y: 90 }],
    [{ x: 30, y: 5 }, { x: 30, y: 90 }]
  ]);
  assert.equal(R(g3.points[0].x), 30, '起点=左分区（西=−x ⇒ vMin）');
  assert.equal(R(g3.points[1].x), 70, '终点=右分区（vMax）');
});
