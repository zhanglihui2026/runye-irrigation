'use strict';
/* tests/tl_seg_trunk.test.cjs —— 段总管生成器（v859 需求 / v862 判定重写 /
 * v868 起止定版 / v869 自动选侧 / v870 内移定位定版）
 *
 * 钉的是几何契约：
 *   ① 垂直于主管主方向：水平主管 ⇒ 干线竖直；竖直主管 ⇒ 干线水平。
 *   ② [v870] 干线位置 = 主管走向中心 C 向水源侧偏移 跨度×1/4（用户方案甲）：
 *      base = C ± (H-L)×0.25，恒在交集 [L,H] 内（必穿过每根主管、必在地块内
 *      1/4 分位附近，不再贴边界/总管被盖住）。水源在交集哪一半 ⇒ 向哪侧偏；
 *      无水源/坐标非法 ⇒ 默认 lo（左/上）。交集仅一点时 offset=0（位置不变）。
 *      斜主管 / 交集为空 ⇒ null（宁可不出）。
 *   ③ 单区（<2 条）不生成。
 *   ④ [v868] 起止 = 首末主管：points[0]=起点=最上/最左分区主管（vMin 端），
 *      points[1]=终点=最下/最右分区主管（vMax 端）；两端不再外延（stub=0，
 *      lenJoin=len）。方向依据：简图世界系北=−y ⇒ 上/左恒为 vMin 端。
 *   ⑤ [v862 回归] 多行网格的竖直主管 ⇒ 必须生成。
 *   ⑥ [v868] 方向语义与输入顺序无关。
 *   ⑦ [v869/v870] 选侧与水源：左右/上下各验 + 非法 src 回退 lo + 参差主管。
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

test('① 水平主管 ⇒ 干线竖直；无水源 ⇒ 默认向左/上偏移 跨度×1/4', () => {
  const mains = [
    [{ x: 10, y: 25 }, { x: 95, y: 25 }],
    [{ x: 10, y: 75 }, { x: 95, y: 75 }],
    [{ x: 10, y: 125 }, { x: 95, y: 125 }]
  ];
  const g = S.build(mains);
  assert.ok(g, '应生成');
  assert.equal(g.axis, 'y', '干线垂直于水平主管（沿 y 延伸）');
  assert.equal(g.side, 'lo', '无水源 ⇒ 默认向左/上侧偏');
  assert.equal(R(g.base), 31.25, 'C=52.5 向 lo 偏 (95-10)×1/4=21.25 ⇒ 31.25（地块内 1/4 分位）');
  assert.equal(g.joinPts.length, 3);
  g.joinPts.forEach((p, i) => {
    assert.equal(R(p.x), 31.25, '交点在干线上');
    assert.equal(R(p.y), [25, 75, 125][i]);
  });
  assert.ok(g.base > 10 && g.base < 95, 'base 必在主管范围内（穿过每根主管、不再贴边）');
});

test('② 竖直主管 ⇒ 干线水平；无水源 ⇒ 默认向上/下偏移 跨度×1/4', () => {
  const mains = [
    [{ x: 30, y: 5 }, { x: 30, y: 90 }],
    [{ x: 70, y: 5 }, { x: 70, y: 90 }]
  ];
  const g = S.build(mains);
  assert.ok(g);
  assert.equal(g.axis, 'x');
  assert.equal(g.side, 'lo');
  assert.equal(R(g.base), 26.25, 'C=47.5 向 lo 偏 (90-5)×1/4=21.25 ⇒ 26.25（北=−y ⇒ lo=上侧）');
  assert.equal(g.joinPts.length, 2);
});

test('④ [v868] 起止=首末主管：两端不外延（stub=0）、len/lenJoin 口径、驳接点=首末交点', () => {
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
  const mixed = [
    [{ x: 10, y: 25 }, { x: 95, y: 25 }],
    [{ x: 10, y: 75 }, { x: 95, y: 75 }],
    [{ x: 10, y: 125 }, { x: 10, y: 160 }]
  ];
  assert.equal(S.build(mixed), null, '方向不一致不出');
});

test('⑤b [v862 回归] 2×2 多行网格竖直主管（v859 恒 null 的用户场景）⇒ 必须生成', () => {
  const mains = [
    [{ x: 12, y: 0 }, { x: 12, y: 50 }],
    [{ x: 37, y: 0 }, { x: 37, y: 50 }],
    [{ x: 12, y: 50 }, { x: 12, y: 100 }],
    [{ x: 37, y: 50 }, { x: 37, y: 100 }]
  ];
  const g = S.build(mains);
  assert.ok(g, '行间范围相接（交集 {50}）必须生成，这是线上用户场景');
  assert.equal(g.axis, 'x', '干线水平（垂直于竖直主管）');
  assert.equal(R(g.base), 50, '交集仅一点 ⇒ C=50、offset=0，位置不变');
  assert.equal(g.joinPts.length, 4, '穿过全部 4 根主管');
  const xs = g.points.map(p => p.x).sort((a, b) => a - b);
  assert.equal(R(xs[0]), 12, '起点端 = 最左分区主管（不外延）');
  assert.equal(R(xs[1]), 37, '终点端 = 最右分区主管（不外延）');
});

test('⑤c 部分错开但仍有交集 ⇒ 生成（相邻行共享边即可）', () => {
  const mains = [
    [{ x: 10, y: 0 }, { x: 10, y: 60 }],
    [{ x: 40, y: 0 }, { x: 40, y: 60 }],
    [{ x: 10, y: 60 }, { x: 10, y: 95 }],
    [{ x: 40, y: 60 }, { x: 40, y: 95 }]
  ];
  const g = S.build(mains);
  assert.ok(g);
  assert.equal(R(g.base), 60, '交集 [60,60] ⇒ offset=0');
});

test('⑥ [v868] 方向语义与输入顺序无关：起点恒=上/左（vMin 端）、终点恒=下/右（vMax 端）', () => {
  const a = [{ x: 10, y: 25 }, { x: 95, y: 25 }];
  const b = [{ x: 10, y: 75 }, { x: 95, y: 75 }];
  const g1 = S.build([a, b]);
  const g2 = S.build([b, a]);
  assert.deepEqual(g1.points, g2.points, '输入顺序不影响起止');
  assert.equal(R(g1.points[0].y), 25, '起点=上分区（世界系北=−y ⇒ vMin）');
  assert.equal(R(g1.points[1].y), 75, '终点=下分区（vMax）');
  const g3 = S.build([
    [{ x: 70, y: 5 }, { x: 70, y: 90 }],
    [{ x: 30, y: 5 }, { x: 30, y: 90 }]
  ]);
  assert.equal(R(g3.points[0].x), 30, '起点=左分区（西=−x ⇒ vMin）');
  assert.equal(R(g3.points[1].x), 70, '终点=右分区（vMax）');
});

test('⑦ [v869/v870] 选侧：水源在交集哪一半 ⇒ 向哪侧偏 跨度×1/4；非法 src 回退 lo', () => {
  const mains = [
    [{ x: 10, y: 25 }, { x: 95, y: 25 }],
    [{ x: 10, y: 75 }, { x: 95, y: 75 }],
    [{ x: 10, y: 125 }, { x: 95, y: 125 }]
  ];
  /* 水源在左半（x<52.5）⇒ 向左偏：base = 52.5-21.25 = 31.25 */
  const gl = S.build(mains, { src: { x: 0, y: 60 } });
  assert.equal(gl.side, 'lo');
  assert.equal(R(gl.base), 31.25);
  /* 水源在右半 ⇒ 向右偏：base = 52.5+21.25 = 73.75 */
  const gr = S.build(mains, { src: { x: 120, y: 60 } });
  assert.equal(gr.side, 'hi');
  assert.equal(R(gr.base), 73.75);
  assert.equal(R(gr.joinPts[0].x), 73.75, '交点随 base 移到右侧 1/4 分位');
  /* 竖直主管：水源在上（y<47.5）⇒ 向上偏；在下 ⇒ 向下偏 */
  const vm = [
    [{ x: 30, y: 5 }, { x: 30, y: 90 }],
    [{ x: 70, y: 5 }, { x: 70, y: 90 }]
  ];
  const gt = S.build(vm, { src: { x: 50, y: -20 } });
  assert.equal(gt.side, 'lo');
  assert.equal(R(gt.base), 26.25, '向上偏');
  const gb = S.build(vm, { src: { x: 50, y: 200 } });
  assert.equal(gb.side, 'hi');
  assert.equal(R(gb.base), 68.75, '向下偏');
  /* 非法/缺失 src ⇒ 回退 lo */
  const gf = S.build(mains, { src: { x: NaN, y: 60 } });
  assert.equal(gf.side, 'lo');
  assert.equal(S.build(mains, {}).side, 'lo');
  assert.equal(S.build(mains, null).side, 'lo');
  /* 参差主管：交集 [30,95]，向 lo 偏 (95-30)/4=16.25 ⇒ base=62.5-16.25=46.25 */
  const stag = [
    [{ x: 10, y: 25 }, { x: 95, y: 25 }],
    [{ x: 30, y: 75 }, { x: 95, y: 75 }]
  ];
  const gs = S.build(stag);
  assert.equal(R(gs.base), 46.25, '参差交集按实际 [L,H] 取 1/4 偏移');
  assert.ok(gs.base >= 30 && gs.base <= 95, 'base 恒在交集内');
});
