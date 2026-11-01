'use strict';
/* tests/trunk_geo_ll2m.test.cjs —— 经纬度 → 图纸米 → DXF 的 CAD 坐标
 *
 * 为什么要有这个文件：
 *   DXF「ZG_TRUNK」图层要把地图页的总管折线搬回施工图坐标系，这是站点里**第一次**
 *   走「经纬度 → 米」这条反向链路（此前只有 m2ll：米 → 经纬度）。
 *   反链路上有两处一旦错了**在正南北走向的干线上看不出来**的符号问题：
 *     ① ±y 选边（北=+y 还是 −y，取决于这张地是怎么来的：地图回传 / 手画 / 地形）
 *     ② CAD 的 y 取负（SVG y 向下、CAD y 向上）
 *   正南北的干线在 ① 错了只是"上下挪了一段"，在 ② 错了只是"图上下半截位置怪"，
 *   肉眼极难判定 ⇒ 只能靠纯函数单测钉住。
 *
 * 口径来源（改之前先读）：
 *   · plot.poly       北 = +y   （地图页回传时 ys = (lat−clat)·mlat）
 *   · measuredPolygon 北 = −y   （v217 镜像：同一份数据取负，让"北在上"）
 *   · CAD_y = −图面_y （runye-dxf.js makeInv：-((sy-oy)/s+minY)，而 sy=(my-minY)*s+oy）
 *   ⇒ 选边交给 autoSign（±y 各算一次 RMS 取小），y 取负交给 trunkToCad。
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/* 与 tests/trunk_geo.test.cjs 同一个加载器：在**当前 realm** 里执行
   （不用 vm.runInNewContext —— 跨 realm 的原型不同，deepStrictEqual 会报
   "结构相同但不相等"）。 */
const G = (function load() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'mod', 'trunk-geo.js'), 'utf8');
  return new Function('window', src + '\nreturn window.RyTrunkGeo;')({});
})();

const BASE = { refLat: 30, refLng: 114 };
const MLAT = G.MLAT;
/* 环按 toFixed(6) 存（站点就是这么落库的），1e-6° ≈ 0.11m —— 所以"还原回来了"
   的判据只能是 0.2m，不能写 1e-6。这只是量化误差，与符号无关；符号错是 100m 级。 */
const TOL_M = 0.2;

/* 矩形地块 300×170（米），按给定 y 符号生成「图面米坐标 → 经纬度」的权威环。 */
function ringOf(poly, sign) {
  return poly.map((q) => {
    const ll = G.m2ll(q.x, q.y, BASE, sign);
    return [+ll.lat.toFixed(6), +ll.lng.toFixed(6)];
  });
}
const RECT = [
  { x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: -170 }, { x: 0, y: -170 }
];

test('① ll2m 是 m2ll 的逆（±sign 各一组）', () => {
  for (const sign of [1, -1]) {
    const m = { x: 123.456, y: -78.9 };
    const ll = G.m2ll(m.x, m.y, BASE, sign);
    const back = G.ll2m(ll, BASE, sign);
    assert.ok(Math.abs(back.x - m.x) < 1e-6, 'sign=' + sign + ' x 回不去：' + back.x);
    assert.ok(Math.abs(back.y - m.y) < 1e-6, 'sign=' + sign + ' y 回不去：' + back.y);
  }
});

test('② 北=−y 的画布地块：autoSign 选 −1，ll2m 逐点还原（≤0.2m）', () => {
  const ring = ringOf(RECT, -1);
  const cal = G.autoSign(RECT, ring, BASE);
  assert.equal(cal.ok, true, '应该能定方向，why=' + cal.why);
  assert.equal(cal.sign, -1, '北=−y 的地块必须选 −1');
  RECT.forEach((q, i) => {
    const back = G.ll2m(ring[i], BASE, cal.sign);
    assert.ok(Math.abs(back.x - q.x) < TOL_M && Math.abs(back.y - q.y) < TOL_M,
      '第 ' + i + ' 点偏了：' + JSON.stringify(back) + ' vs ' + JSON.stringify(q));
  });
});

test('③ 北=+y 的地块（地图口径 / 手画）：autoSign 选 +1', () => {
  const ring = ringOf(RECT, 1);
  const cal = G.autoSign(RECT, ring, BASE);
  assert.equal(cal.ok, true);
  assert.equal(cal.sign, 1);
  const back = G.ll2m(ring[2], BASE, cal.sign);
  assert.ok(Math.abs(back.y - RECT[2].y) < TOL_M);
});

test('④ 退化地块（y 全等 ⇒ 两个符号都对得上）必须拒绝，不许瞎选一个', () => {
  const flat = [{ x: 0, y: 0 }, { x: 150, y: 0 }, { x: 300, y: 0 }];
  const ring = ringOf(flat, -1);
  const cal = G.autoSign(flat, ring, BASE);
  assert.equal(cal.ok, false, '压成一条东西向线段时必须拒绝反算');
  assert.equal(cal.why, 'ambiguous');
});

test('⑤ 环对不上（换了地块 / 图不是从这块地生成的）必须拒绝', () => {
  const ring = ringOf(RECT, -1);
  // 把权威环整体挪 40m：模拟"库里是这块地，图是别的地块画的"
  const moved = ring.map((q) => [+(q[0] + 40 / MLAT).toFixed(8), q[1]]);
  const cal = G.autoSign(RECT, moved, BASE);
  assert.equal(cal.ok, false, '环对不上时不能导总管（跨地块会整体错位）');
  assert.ok(cal.rms > G.OK_M, 'rms 应远超阈值，实际 ' + cal.rms);
});

test('⑥ trunkToCad：CAD 的 y 取负（北为正），x 与图面米坐标相同', () => {
  const ring = ringOf(RECT, -1);
  const cal = G.autoSign(RECT, ring, BASE);
  const cad = G.trunkToCad(ring, BASE, cal.sign);
  assert.equal(cad.length, 4);
  RECT.forEach((q, i) => {
    assert.ok(Math.abs(cad[i][0] - q.x) < TOL_M, 'x 不该被改动');
    assert.ok(Math.abs(cad[i][1] + q.y) < TOL_M, 'CAD y 必须是 −图面 y');
  });
  // 北在上：最北的两个角（图面 y=−170）在 CAD 里 y=+170
  assert.equal(Math.round(cad[2][1]), 170);
  assert.equal(Math.round(cad[0][1]), 0);
});

test('⑦ trunkToCad 与 runye-dxf 的 makeInv 逐位一致（不许再做一遍 view 变换）', () => {
  /* 复刻 runye-dxf.js 的两段：ts（图面 → SVG 屏幕）与 makeInv（屏幕 → CAD）。
     谁在中间多乘/少乘一次 scale 或 min，这条就会炸。 */
  const pv = { s: 2, ox: 100, oy: 120, minX: -50, minY: -80 };
  const ts = (mx, my) => ({ x: (mx - pv.minX) * pv.s + pv.ox, y: (my - pv.minY) * pv.s + pv.oy });
  const inv = (sx, sy) => [(sx - pv.ox) / pv.s + pv.minX, -((sy - pv.oy) / pv.s + pv.minY)];

  const world = [{ x: 12.3, y: -45.6 }, { x: -49.9, y: 71.2 }];
  const ring = world.map((q) => {
    const ll = G.m2ll(q.x, q.y, BASE, -1);
    return [+ll.lat.toFixed(6), +ll.lng.toFixed(6)];
  });
  const cad = G.trunkToCad(ring, BASE, -1);
  world.forEach((q, i) => {
    const p = ts(q.x, q.y);
    const viaSvg = inv(p.x, p.y);
    assert.ok(Math.abs(cad[i][0] - viaSvg[0]) < TOL_M, 'x 与 makeInv 不一致');
    assert.ok(Math.abs(cad[i][1] - viaSvg[1]) < TOL_M, 'y 与 makeInv 不一致');
  });
});

test('⑧ trunkToCad 遇到坏点整根返回 null（宁可不画，不要画半根）', () => {
  assert.equal(G.trunkToCad(null, BASE, -1), null);
  assert.equal(G.trunkToCad([], BASE, -1), null);
  const bad = [[30, 114], [NaN, 114]];
  assert.equal(G.trunkToCad(bad, BASE, -1), null);
  assert.equal(G.trunkToCad([[30, 114]], null, -1), null, '缺基准必须返回 null');
});

test('⑨ 单点也能回（不打补丁、不插值）', () => {
  const one = [[30.001, 114.002]];
  const cad = G.trunkToCad(one, BASE, -1);
  assert.equal(cad.length, 1);
  assert.ok(cad[0][0] > 0 && cad[0][1] > 0, '东北方向 => x>0 且 CAD y>0（北为正）');
});
