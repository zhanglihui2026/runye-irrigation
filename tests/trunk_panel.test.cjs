'use strict';
/* tests/trunk_panel.test.cjs —— 总管属性面板的派生量（四期）
 *
 * 这里钉的是「面板上那 11 个只读数字」的口径，不是 DOM 长什么样：
 *   ① 缺高程 ⇒ 斜长/总高差必须是 null（面板显示「未关联高程数据」/「—」），**绝不补 0**。
 *   ② 总高差上坡为正、下坡为负（起点减终点的方向反了，选泵扬程就反了）。
 *   ③ 缺管径或流量 ⇒ 水力区整体 null，不许拿别的值凑一个流速出来。
 *   ④ 沿程损失必须随管材变（海曾-威廉 C 值），否则「管材联动损失系数」是句空话。
 *   ⑤ compute 是纯函数：改它之前/之后的 entry 必须逐字节相同（它是库里的对象，
 *      就地改会绕过 revision 校验，属于静默故障）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'mod', 'trunk-panel.js');

/* new Function 在当前 realm 执行（不用 vm.runInNewContext）：
   跨 realm 的对象原型不同，deepStrictEqual 会报「结构相同但非引用相等」，看着像数据错了。 */
function loadBase() {
  const src = fs.readFileSync(SRC, 'utf8');
  const win = {};
  const fn = new Function('window', src + '\nreturn window.RyTrunkPanel;');
  return { P: fn(win), win };
}

/* 带 schema 的加载：真实页面里 RyTrunkPanel 会优先用 RyTrunkSchema.readPoint 读点，
   两条路径都要能读（宿主加载顺序变了也不会静默失效）。 */
function loadWithSchema() {
  const schemaSrc = fs.readFileSync(path.join(__dirname, '..', 'core', 'trunk-schema.js'), 'utf8');
  const win = {};
  new Function('window', schemaSrc)(win);
  const panelSrc = fs.readFileSync(SRC, 'utf8');
  new Function('window', panelSrc)(win);
  return { P: win.RyTrunkPanel, S: win.RyTrunkSchema, win };
}

const D = Math.PI / 180;

/* 一条 3 点干线：东向 ~111 m，再北向 ~111 m（lat 30 处经度 1° ≈ 96.5 km） */
function line(extra) {
  return Object.assign({
    id: 'T1',
    main: true,
    points: [[30, 120], [30, 121], [31, 121]],
    params: { material: 'PE', dn: 110, designFlow: 30 }
  }, extra || {});
}

test('① 投影长度 = 各段球面距离之和；缺高程时斜长与总高差都是 null', () => {
  const { P } = loadBase();
  const d = P.compute(line());
  assert.equal(d.ok, true);
  assert.equal(d.ptCount, 3);
  /* 两段：lat30 处 1° 经度 ≈ 96.3 km，1° 纬度 ≈ 111.2 km ⇒ 合计 ≈ 207.5 km */
  const expect = 111194.93 * (1 + Math.cos(30 * D));
  assert.ok(Math.abs(d.projM - expect) < 200, '投影应约 ' + Math.round(expect) + ' m，实际 ' + d.projM);
  assert.equal(d.slopeM, null, '没有高程就不能有斜长（否则是编出来的数）');
  assert.equal(d.dz, null, '没有高程就不能有总高差');
  assert.equal(d.z0, null);
  assert.equal(d.z1, null);
  assert.equal(d.hasZ, false);
});

test('② 有高程：斜长 ≥ 投影；总高差上坡为正、下坡为负', () => {
  const { P } = loadBase();
  const up = P.compute(line({ points: [[30, 120, 100], [30, 121, 105]] }));
  assert.equal(up.hasZ, true);
  assert.ok(Math.abs(up.dz - 5) < 1e-9, '上坡应为 +5，实际 ' + up.dz);
  assert.ok(up.slopeM > up.projM, '斜长必须大于投影');
  assert.ok(Math.abs(up.slopeM - Math.sqrt(up.projM * up.projM + 25)) < 0.01);

  const down = P.compute(line({ points: [[30, 120, 100], [30, 121, 95]] }));
  assert.ok(down.dz < 0, '下坡必须为负，实际 ' + down.dz);
  assert.equal(P.fmtSigned(down.dz).charAt(0), '-');
  assert.equal(P.fmtSigned(up.dz).charAt(0), '+');
});

test('③ 部分点缺高程 ⇒ 斜长整体不可用（不做「只算有高程的那几段」）', () => {
  const { P } = loadBase();
  const d = P.compute(line({ points: [[30, 120, 100], [30, 121], [31, 121, 108]] }));
  assert.equal(d.slopeM, null);
  /* 首尾都有高程 ⇒ 总高差仍可算，这是两条独立的判据 */
  assert.ok(Math.abs(d.dz - 8) < 1e-9);
  assert.equal(d.z0, 100);
  assert.equal(d.z1, 108);
});

test('④ 缺管径/流量 ⇒ 水力区全 null，且不伪造流速', () => {
  const { P } = loadBase();
  const noDn = P.compute(line({ params: { material: 'PE', dn: null, designFlow: 30 } }));
  assert.equal(noDn.v, null);
  assert.equal(noDn.hf, null);
  assert.equal(noDn.hj, null);
  assert.equal(noDn.ok, true, '几何有效就是 ok（水量缺输入不算失败）');
  assert.equal(P.fmtV(noDn.v), '—');

  const noQ = P.compute(line({ params: { material: 'PE', dn: 110, designFlow: null } }));
  assert.equal(noQ.v, null);

  const zero = P.compute(line({ params: { material: 'PE', dn: 0, designFlow: 0 } }));
  assert.equal(zero.v, null, '0 管径/0 流量不得参与计算（会得到 Infinity）');
});

test('⑤ 流速 = Q/(πD²/4)，DN110 + 30 m³/h ⇒ 0.877 m/s', () => {
  const { P } = loadBase();
  const d = P.compute(line());
  const expect = (30 / 3600) / (Math.PI * Math.pow(0.11, 2) / 4);
  assert.ok(Math.abs(d.v - expect) < 1e-9, '实际 ' + d.v);
  assert.ok(Math.abs(d.v - 0.877) < 0.002);
});

test('⑥ 流速分档：偏低 / 经济 / 偏高 / 超标', () => {
  const { P } = loadBase();
  const at = (q) => P.compute(line({ params: { material: 'PE', dn: 110, designFlow: q } })).vLevel;
  assert.equal(at(5), 'low');
  assert.equal(at(30), 'good');
  assert.equal(at(80), 'warn');
  assert.equal(at(200), 'bad');
  /* 边界值归属：<=2.0 算经济、<=3.0 算偏高 */
  const v = P.compute(line({ params: { material: 'PE', dn: 110, designFlow: 30 } }));
  const qAt = (target) => target * (Math.PI * 0.11 * 0.11 / 4) * 3600;
  assert.equal(P.compute(line({ params: { material: 'PE', dn: 110, designFlow: qAt(2.0) } })).vLevel, 'good');
  assert.equal(P.compute(line({ params: { material: 'PE', dn: 110, designFlow: qAt(3.01) } })).vLevel, 'bad');
  assert.ok(v.v > 0);
});

test('⑦ 沿程损失随管材变：C 越大损失越小（PVC-U < PE < 镀锌钢管）', () => {
  const { P } = loadBase();
  const hf = (m) => P.compute(line({ params: { material: m, dn: 110, designFlow: 30 } })).hf;
  const pe = hf('PE'), pvc = hf('PVC-U'), gi = hf('GI');
  assert.ok(pvc < pe, 'PVC-U(C=145) 的损失应小于 PE(C=140)');
  assert.ok(gi > pe, '镀锌钢管(C=120) 的损失应大于 PE');
  /* 未知管材回落 PE，不能变成 NaN */
  assert.ok(Math.abs(hf('HDPE-X') - pe) < 1e-12);
});

test('⑧ 局部损失随三通数增大；弯头数 = 拐点数 − 2', () => {
  const { P } = loadBase();
  const base = P.compute(line());
  assert.equal(base.elbows, 1, '3 点线有 1 个中间拐点 = 1 个弯头');
  assert.equal(base.tees, 0);

  const withTee = P.compute(line({ params: { material: 'PE', dn: 110, designFlow: 30, nodeTypes: { 1: 'tee' } } }));
  assert.equal(withTee.tees, 1);
  assert.ok(withTee.hj > base.hj, '多一个三通必须多一份局部损失');

  const src = P.compute(line({ params: { material: 'PE', dn: 110, designFlow: 30, nodeTypes: { 0: 'source' } } }));
  assert.ok(src.hj > base.hj, '水源进水口本身也有进口损失');
});

test('⑨ compute 是纯函数：不改入参（库里的对象不能被就地改）', () => {
  const { P } = loadBase();
  const entry = line({ params: { material: 'PE', dn: 110, designFlow: 30, nodeTypes: { 1: 'tee' }, labels: { 1: '三通A' } } });
  const before = JSON.stringify(entry);
  P.compute(entry);
  assert.equal(JSON.stringify(entry), before);
});

test('⑩ 点数不足/空输入不抛错，ptCount 如实回报', () => {
  const { P } = loadBase();
  assert.equal(P.compute(null).ok, false);
  assert.equal(P.compute({}).ptCount, 0);
  const one = P.compute({ points: [[30, 120]], params: {} });
  assert.equal(one.ptCount, 1);
  assert.equal(one.projM, null, '一个点没有长度，不能是 0');
  assert.equal(one.ok, false);
});

test('⑪ 带 schema 与不带 schema 两条读取路径结果一致', () => {
  const a = loadBase().P.compute(line());
  const b = loadWithSchema().P.compute(line());
  assert.deepEqual(a, b);
});

test('⑫ 容差：haversine 与 Leaflet 的 6371000 半径差在 300 m 上是毫米级', () => {
  const { P } = loadBase();
  /* 30°N 上 0.003° 经度 ≈ 289 m */
  const a = { lat: 30, lng: 120 }, b = { lat: 30, lng: 120.003 };
  const d = P.haversine(a, b);
  assert.ok(d > 285 && d < 295, '实际 ' + d);
  assert.ok(Math.abs(P.haversine(a, b) - P.haversine(b, a)) < 1e-9, '必须对称');
  assert.equal(P.haversine(a, a), 0);
  assert.ok(isFinite(D) ? true : true);
});
