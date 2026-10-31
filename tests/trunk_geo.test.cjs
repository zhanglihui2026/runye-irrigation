'use strict';
/* 施工图坐标 → 经纬度（mod/trunk-geo.js）的纯函数契约。
 *
 * 这里钉的是四条「错了但屏幕上看不出来」的规则：
 *   ① 符号不许硬编码：同一个 geoBase，plot.poly 是 +y、tlDiagramData 是 −y，
 *      而地块库里两种历史数据都有 ⇒ 必须由 autoSign 用地块环当标尺自己判。
 *      判错的表现是"吸附点整块南北颠倒"，300×170m 地块差 170m。
 *   ② 判不出方向时必须**拒绝**，不许"挑一个看着像的"：
 *      地块近似东西向一条线时，±y 都能对上，随便挑就是 50% 概率吸到半个地块外。
 *   ③ 环点数不一致时不猜（少一个点就配错，误差会藏在 RMS 里）。
 *   ④ 网格交点的 frame 换算必须与 inline-09 的 tlFrameToWorld 同口径
 *      （旋转/缩放都要生效，否则分区角点会整体偏移）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'mod', 'trunk-geo.js');

/* 用 new Function 在**当前 realm** 里执行（不用 vm.runInNewContext：
   跨 realm 的原型不同，deepStrictEqual 会报"结构相同但不相等"）。 */
function load() {
  const src = fs.readFileSync(SRC, 'utf8');
  const win = {};
  const fn = new Function('window', src + '\nreturn window.RyTrunkGeo;');
  return fn(win);
}
const G = load();

/* ---- 造基准：300m × 170m 的地块，口径与 inline-16 完全一致 ---- */
const MLAT = G.MLAT;
const LAT0 = 18.25, LNG0 = 109.518;
const DLAT = 170 / MLAT;
const DLNG = 300 / (MLAT * Math.cos(LAT0 * Math.PI / 180));
const RING = [[LAT0, LNG0], [LAT0, LNG0 + DLNG], [LAT0 - DLAT, LNG0 + DLNG], [LAT0 - DLAT, LNG0]];
const CLAT = (RING[0][0] + RING[1][0] + RING[2][0] + RING[3][0]) / 4;
const COS = Math.cos(CLAT * Math.PI / 180);
const BASE = { refLat: CLAT, refLng: LNG0 };

/* 画布口径（北 = −y）：measuredPolygon / tlDiagramData */
const CANVAS = RING.map(p => ({ x: (p[1] - LNG0) * MLAT * COS, y: -(p[0] - CLAT) * MLAT }));
/* 地图口径（北 = +y）：plot.poly / __runyeMapFramePoly */
const FRAME = RING.map(p => ({ x: (p[1] - LNG0) * MLAT * COS, y: (p[0] - CLAT) * MLAT }));

test('① 画布口径（−y）能认出来：sign=−1 且 RMS≈0', () => {
  const r = G.autoSign(CANVAS, RING, BASE);
  assert.equal(r.ok, true);
  assert.equal(r.sign, -1);
  assert.ok(r.rms < 1e-6, 'rms=' + r.rms);
  assert.ok(r.other > 100, '另一候选应显著错，实际 ' + r.other);
});

test('①b 地图口径（+y）也能认出来：sign=+1', () => {
  const r = G.autoSign(FRAME, RING, BASE);
  assert.equal(r.ok, true);
  assert.equal(r.sign, 1);
  assert.ok(r.rms < 1e-6);
});

test('①c 选错符号的误差量级 = 地块南北向高度（这就是"吸到地块外"的来源）', () => {
  const r = G.autoSign(CANVAS, RING, BASE);
  /* 170m 高、关于平均纬度对称 ⇒ 镜像后最大偏差正好是半高的 2 倍 = 170m */
  assert.ok(Math.abs(r.other - 170) < 1, 'other=' + r.other);
});

test('② 地块近似东西向一条线时，±y 都能对上 ⇒ 必须拒绝（不许随便挑）', () => {
  /* 纬度几乎不变（只差 1cm），环仍能构成多边形但南北方向退化 */
  const thin = [[LAT0, LNG0], [LAT0, LNG0 + DLNG], [LAT0 - 0.0000001, LNG0 + DLNG], [LAT0 - 0.0000001, LNG0]];
  const c = (thin[0][0] + thin[1][0] + thin[2][0] + thin[3][0]) / 4;
  const cos = Math.cos(c * Math.PI / 180);
  const poly = thin.map(p => ({ x: (p[1] - LNG0) * MLAT * cos, y: -(p[0] - c) * MLAT }));
  const r = G.autoSign(poly, thin, { refLat: c, refLng: LNG0 });
  assert.equal(r.ok, false, '不该判成可用：' + JSON.stringify(r));
  assert.equal(r.why, 'ambiguous');
});

test('③ 环点数不一致 ⇒ 拒绝（少一个点就会配错，误差藏在 RMS 里）', () => {
  const r = G.autoSign(CANVAS, RING.slice(0, 3), BASE);
  assert.equal(r.ok, false);
  assert.equal(r.why, 'ring-mismatch');
});

test('③b 环点数是完全不同的多边形 ⇒ 拒绝（不是"最像的那个也行"）', () => {
  const far = RING.map(p => [p[0] + 0.01, p[1] + 0.01]);   // 整体挪 1km 以上
  const r = G.autoSign(CANVAS, far, BASE);
  assert.equal(r.ok, false);
  assert.equal(r.why, 'not-aligned');
});

test('③c 基准缺失/非法 ⇒ 拒绝，不抛异常', () => {
  for (const bad of [null, undefined, {}, { refLat: NaN, refLng: 1 }, { refLat: 91, refLng: 0 }]) {
    const r = G.autoSign(CANVAS, RING, bad);
    assert.equal(r.ok, false, '基准 ' + JSON.stringify(bad) + ' 应被拒');
    assert.equal(r.why, 'no-base');
  }
  assert.equal(G.m2ll(1, 2, null, -1), null);
});

test('③d 折点两种形状都认：[lat,lng] 与 {lat,lng}', () => {
  const asObj = RING.map(p => ({ lat: p[0], lng: p[1] }));
  const r = G.autoSign(CANVAS, asObj, BASE);
  assert.equal(r.ok, true);
  assert.equal(r.sign, -1);
});

test('④ m2ll 与 autoSign 选出的符号自洽：反算回环逐点重合', () => {
  const r = G.autoSign(CANVAS, RING, BASE);
  assert.equal(r.ok, true);
  CANVAS.forEach((q, i) => {
    const ll = G.m2ll(q.x, q.y, BASE, r.sign);
    const dy = (ll.lat - RING[i][0]) * MLAT;
    const dx = (ll.lng - RING[i][1]) * MLAT * COS;
    assert.ok(Math.hypot(dx, dy) < 1e-6, '第 ' + i + ' 点偏了 ' + Math.hypot(dx, dy) + 'm');
  });
});

test('④b m2ll 对非数字输入返回 null（不许产出 NaN 坐标去吸附）', () => {
  assert.equal(G.m2ll(undefined, 0, BASE, -1), null);
  assert.equal(G.m2ll(0, 'abc', BASE, -1), null);
  assert.equal(G.m2ll(NaN, 0, BASE, -1), null);
});

test('⑤ frameToWorld：angle=0 / 平移 / 缩放 / 旋转 都按 inline-09 口径', () => {
  const p = { x: 10, y: 20 };
  assert.deepEqual(G.frameToWorld(null, p), { x: 10, y: 20 });
  assert.deepEqual(G.frameToWorld({}, p), { x: 10, y: 20 });

  const moved = G.frameToWorld({ center: { x: 0, y: 0 }, origin: { x: 5, y: 7 } }, p);
  assert.deepEqual(moved, { x: 15, y: 27 });

  const scaled = G.frameToWorld({ center: { x: 0, y: 0 }, origin: { x: 0, y: 0 }, scaleX: 2, scaleY: 4 }, p);
  assert.deepEqual(scaled, { x: 5, y: 5 });

  /* 绕 center 旋转 90°：局部 (10,0) 应落到 center 的「下方」——画布 y 向下，
     所以与数学习惯相反，这里钉的是与 inline-09 逐字一致的这条公式。 */
  const rot = G.frameToWorld({ center: { x: 0, y: 0 }, angle: 90 }, { x: 10, y: 0 });
  assert.ok(Math.abs(rot.x - 0) < 1e-9 && Math.abs(rot.y - 10) < 1e-9, JSON.stringify(rot));
});

test('⑤b frameToWorld 绕 center 旋转保持 center 不动（转到中心不该漂）', () => {
  const c = { x: 123.5, y: -44.25 };
  for (const angle of [0, 17, 30, 90, 180, -45]) {
    const out = G.frameToWorld({ center: c, origin: { x: 0, y: 0 }, angle: angle }, c);
    assert.ok(Math.abs(out.x - c.x) < 1e-9 && Math.abs(out.y - c.y) < 1e-9,
      'angle=' + angle + ' 时中心漂到 ' + JSON.stringify(out));
  }
});

test('⑥ zoneWorlds：交点数 = 列 × 行，且空/坏数据返回空数组', () => {
  const zones = { xPos: [0, 100, 200], yPos: [0, 80] };
  assert.equal(G.zoneWorlds(zones).length, 6);
  assert.equal(G.zoneWorlds(null).length, 0);
  assert.equal(G.zoneWorlds({}).length, 0);
  assert.equal(G.zoneWorlds({ xPos: [], yPos: [1] }).length, 0);
  assert.equal(G.zoneWorlds({ xPos: [0, NaN], yPos: [0] }).length, 1, 'NaN 交点应被跳过');
});

test('⑥b zoneWorlds 的每个交点经 frame 旋转后，仍在区域外接框内（不跑飞）', () => {
  const frame = { center: { x: 150, y: 85 }, origin: { x: 0, y: 0 }, angle: 30 };
  const zones = { xPos: [0, 75, 150, 225, 300], yPos: [0, 42.5, 85, 127.5, 170], frame };
  const pts = G.zoneWorlds(zones);
  assert.equal(pts.length, 25);
  for (const q of pts) {
    assert.ok(Number.isFinite(q.x) && Number.isFinite(q.y), JSON.stringify(q));
    /* 绕 (150,85) 旋转 30° 后，300×170 的外接框半对角线约 173m ⇒ 不会超过 200m */
    assert.ok(Math.abs(q.x - 150) <= 200 && Math.abs(q.y - 85) <= 200, JSON.stringify(q));
  }
  /* 中心交点必须钉在原地 */
  const mid = pts[12];
  assert.ok(Math.abs(mid.x - 150) < 1e-9 && Math.abs(mid.y - 85) < 1e-9, JSON.stringify(mid));
});

test('⑦ 阈值对外可见（宿主打印诊断时用同一份数字，避免两处各写一个）', () => {
  assert.equal(G.OK_M, 0.5);
  assert.equal(G.WRONG_M, 1);
  assert.ok(Math.abs(G.MLAT - 111319.49079327357) < 1e-6);
});
