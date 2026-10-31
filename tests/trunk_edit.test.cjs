'use strict';
/* 总管编辑纯逻辑契约（三期）。
 *
 * 钉住四条会静默毁数据的行为：
 *   ① 合并后**编号与参数必须沿用「列表里在前的那条」**（用户明确要求）。
 *   ② 合并/打断后 main 标记不能丢 —— 丢了整块地会突然"没有主干线"，下游读到 T2。
 *   ③ 打断后两条线的 params 必须是**各自独立**的副本，共享会出现"改一条另一条也变"。
 *   ④ 删点删到不足 2 个必须拒绝（返回 ok:false），让调用方回滚，而不是写进一条 1 点的线。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'mod', 'trunk-edit.js');

function loadEdit() {
  const src = fs.readFileSync(SRC, 'utf8');
  const win = {};
  const fn = new Function('window', src + '\nreturn window.RyTrunkEdit;');
  return fn(win);
}

const E = loadEdit();

/* 经纬度近似米（只用于测试；生产走 map.distance） */
function distFn(a, b) {
  const dy = (a.lat - b.lat) * 111320;
  const dx = (a.lng - b.lng) * 111320 * Math.cos(a.lat * Math.PI / 180);
  return Math.hypot(dx, dy);
}

function mkTrunk(spec) {
  return {
    schema: 2, source: 'map', coordinateSystem: 'GCJ-02', revision: 1,
    trunks: spec
  };
}

/* 两条首尾相接的线：T1 从 A 到 B，T2 从 B 到 C */
function jointTrunk() {
  return mkTrunk([
    { id: 'T1', main: true, points: [[18.2, 109.5], [18.201, 109.5], [18.202, 109.5]], params: { material: 'PE', dn: 110 } },
    { id: 'T2', main: false, points: [[18.202, 109.5], [18.203, 109.5]], params: { material: 'PVC', dn: 160 } }
  ]);
}

test('① jointOf：识别 A末→B首 / B末→A首 / 不相接', () => {
  const t = jointTrunk();
  assert.equal(E.jointOf(t.trunks[0], t.trunks[1], distFn), 'ab');

  const rev = mkTrunk([
    { id: 'A', points: [[18.2, 109.5], [18.201, 109.5]] },
    { id: 'B', points: [[18.199, 109.5], [18.2, 109.5]] }   // B 的末点接 A 的首点
  ]);
  assert.equal(E.jointOf(rev.trunks[0], rev.trunks[1], distFn), 'ba');

  const apart = mkTrunk([
    { id: 'X', points: [[18.2, 109.5], [18.201, 109.5]] },
    { id: 'Y', points: [[18.3, 109.6], [18.31, 109.6]] }
  ]);
  assert.equal(E.jointOf(apart.trunks[0], apart.trunks[1], distFn), null);
});

test('② jointOf：0.3m 容差边界（超一点就不算相接）', () => {
  const near = mkTrunk([
    { id: 'A', points: [[18.2, 109.5], [18.201, 109.5]] },
    /* 18.201 → 与 A 末点相同纬度，经度差 0.000002 度 ≈ 0.21m */
    { id: 'B', points: [[18.201, 109.500002], [18.202, 109.5]] }
  ]);
  assert.equal(E.jointOf(near.trunks[0], near.trunks[1], distFn), 'ab', '0.21m 内应算相接');

  const far = mkTrunk([
    { id: 'A', points: [[18.2, 109.5], [18.201, 109.5]] },
    /* 经度差 0.00001 度 ≈ 1.06m */
    { id: 'B', points: [[18.201, 109.50001], [18.202, 109.5]] }
  ]);
  assert.equal(E.jointOf(far.trunks[0], far.trunks[1], distFn), null, '1m 外不算相接');
});

test('③ connectedIds：只列首尾相接的，不含自己', () => {
  const t = jointTrunk();
  assert.deepEqual(E.connectedIds(t, 'T1', distFn), ['T2']);
  assert.deepEqual(E.connectedIds(t, 'T2', distFn), ['T1']);

  const solo = mkTrunk([{ id: 'S', points: [[18.2, 109.5], [18.21, 109.5]] }]);
  assert.deepEqual(E.connectedIds(solo, 'S', distFn), []);
});

test('④ nearestVertexIndex：容差内取最近，超出返回 -1', () => {
  const pts = [[18.2, 109.5], [18.201, 109.5], [18.202, 109.5]];
  /* 0.00001° 纬度 ≈ 1.1 m；容差 5 m ⇒ 命中。别写成 0.0001（那是 11 m，会超容差）。 */
  assert.equal(E.nearestVertexIndex(pts, 18.20001, 109.5, distFn, 5), 0);
  assert.equal(E.nearestVertexIndex(pts, 18.20102, 109.5, distFn, 5), 1);
  assert.equal(E.nearestVertexIndex(pts, 18.2, 109.9, distFn, 5), -1);
  assert.equal(E.nearestVertexIndex([], 18.2, 109.5, distFn, 5), -1);
});

test('⑤ splitTrunk：前段留原 id，后段是新 id，中间点两边共用', () => {
  const t = mkTrunk([{ id: 'T1', main: true, points: [[18.2, 109.5], [18.201, 109.5], [18.202, 109.5], [18.203, 109.5]], params: { dn: 110 } }]);
  const r = E.splitTrunk(t, 'T1', 1, () => 'T2');
  assert.equal(r.ok, true);
  assert.equal(r.trunk.trunks.length, 2);
  assert.equal(r.trunk.trunks[0].id, 'T1');
  assert.equal(r.trunk.trunks[0].points.length, 2, '前段 0..1 共 2 点');
  assert.equal(r.trunk.trunks[1].id, 'T2');
  assert.equal(r.trunk.trunks[1].points.length, 3, '后段 1..3 共 3 点');
  /* 首尾相接：前段末点 === 后段首点 */
  assert.deepEqual(r.trunk.trunks[0].points[1], r.trunk.trunks[1].points[0]);
  /* 主干跟着前段 */
  assert.equal(r.trunk.trunks[0].main, true);
  assert.equal(r.trunk.trunks[1].main, false);
});

test('⑥ splitTrunk：参数是各自独立的副本（改一条不影响另一条）', () => {
  const t = mkTrunk([{ id: 'T1', points: [[18.2, 109.5], [18.201, 109.5], [18.202, 109.5]], params: { dn: 110, label: '北干' } }]);
  const r = E.splitTrunk(t, 'T1', 1, () => 'T2');
  r.trunk.trunks[1].params.dn = 250;
  assert.equal(r.trunk.trunks[0].params.dn, 110, '改后段不能影响前段');
  assert.equal(r.trunk.trunks[1].params.label, '北干', '其它字段要带过去');
});

test('⑦ splitTrunk：首尾点、点数不足、找不到 都拒绝', () => {
  const two = mkTrunk([{ id: 'T1', points: [[18.2, 109.5], [18.201, 109.5]] }]);
  assert.equal(E.splitTrunk(two, 'T1', 1, () => 'T2').ok, false, '2 点不能打断');

  const three = mkTrunk([{ id: 'T1', points: [[18.2, 109.5], [18.201, 109.5], [18.202, 109.5]] }]);
  assert.equal(E.splitTrunk(three, 'T1', 0, () => 'T2').ok, false, '首点不能打断');
  assert.equal(E.splitTrunk(three, 'T1', 2, () => 'T2').ok, false, '末点不能打断');
  assert.equal(E.splitTrunk(three, 'T1', 1, () => 'T2').ok, true);

  assert.equal(E.splitTrunk(three, 'NOPE', 1, () => 'T2').ok, false);
  assert.equal(E.splitTrunk(null, 'T1', 1, () => 'T2').ok, false);
});

test('⑧ mergeTrunks：A末接B首 → 拼接、编号参数沿用 A、B 删除', () => {
  const t = jointTrunk();
  const r = E.mergeTrunks(t, 'T1', 'T2', distFn);
  assert.equal(r.ok, true);
  assert.equal(r.mergedId, 'T1');
  assert.equal(r.joint, 'ab');
  assert.equal(r.trunk.trunks.length, 1, 'B 应被删除');
  assert.equal(r.trunk.trunks[0].id, 'T1', '编号沿用第一段');
  assert.equal(r.trunk.trunks[0].params.dn, 110, '参数沿用第一段（不是 B 的 160）');
  assert.equal(r.trunk.trunks[0].points.length, 4, '3+2 去掉重合的 1 点 = 4');
});

test('⑨ mergeTrunks：反向接（B末接A首）时编号参数仍取 A', () => {
  const t = mkTrunk([
    { id: 'A', main: false, points: [[18.2, 109.5], [18.201, 109.5]], params: { dn: 90 } },
    { id: 'B', main: true, points: [[18.199, 109.5], [18.2, 109.5]], params: { dn: 200 } }
  ]);
  const r = E.mergeTrunks(t, 'A', 'B', distFn);
  assert.equal(r.ok, true);
  assert.equal(r.joint, 'ba');
  assert.equal(r.trunk.trunks.length, 1);
  assert.equal(r.trunk.trunks[0].id, 'A');
  assert.equal(r.trunk.trunks[0].params.dn, 90);
  /* 方向：B 的点在前，A 的点在后 */
  const pts = r.trunk.trunks[0].points;
  assert.deepEqual(pts[0], [18.199, 109.5]);
  assert.deepEqual(pts[pts.length - 1], [18.201, 109.5]);
  /* main 取"或"：B 原本是主干，合并后必须保住 */
  assert.equal(r.trunk.trunks[0].main, true, '合并掉主干不能导致没有主干');
});

test('⑩ mergeTrunks：不相接 / 自己合并 都拒绝', () => {
  const t = mkTrunk([
    { id: 'A', points: [[18.2, 109.5], [18.201, 109.5]] },
    { id: 'B', points: [[18.3, 109.6], [18.301, 109.6]] }
  ]);
  assert.equal(E.mergeTrunks(t, 'A', 'B', distFn).ok, false);
  assert.equal(E.mergeTrunks(t, 'A', 'A', distFn).ok, false);
});

test('⑪ removeTrunk：删主干后 main 顺延给第一条', () => {
  const t = jointTrunk();
  const r = E.removeTrunk(t, 'T1');
  assert.equal(r.ok, true);
  assert.equal(r.trunk.trunks.length, 1);
  assert.equal(r.trunk.trunks[0].id, 'T2');
  assert.equal(r.trunk.trunks[0].main, true, '删掉主干必须顺延，否则整块地没有主干');
});

test('⑫ removeTrunk：删到空要标 empty', () => {
  const t = mkTrunk([{ id: 'T1', main: true, points: [[18.2, 109.5], [18.201, 109.5]] }]);
  const r = E.removeTrunk(t, 'T1');
  assert.equal(r.ok, true);
  assert.equal(r.empty, true);
  assert.equal(r.trunk.trunks.length, 0);
});

test('⑬ moveVertex：改坐标、保留高程、越界拒绝', () => {
  const t = mkTrunk([{ id: 'T1', points: [[18.2, 109.5, 12.5], [18.201, 109.5]], params: {} }]);
  const r = E.moveVertex(t, 'T1', 0, 18.2005, 109.5005);
  assert.equal(r.ok, true);
  assert.deepEqual(r.trunk.trunks[0].points[0], [18.2005, 109.5005, 12.5], '原来有 z 就要保住');
  assert.equal(E.moveVertex(t, 'T1', 9, 1, 1).ok, false);
  assert.equal(E.moveVertex(t, 'NOPE', 0, 1, 1).ok, false);
});

test('⑭ removeVertex：删到只剩 1 点必须拒绝（调用方据此回滚）', () => {
  const two = mkTrunk([{ id: 'T1', points: [[18.2, 109.5], [18.201, 109.5]] }]);
  assert.equal(E.removeVertex(two, 'T1', 0).ok, false, '2 点不能再删');

  const three = mkTrunk([{ id: 'T1', points: [[18.2, 109.5], [18.201, 109.5], [18.202, 109.5]] }]);
  const r = E.removeVertex(three, 'T1', 1);
  assert.equal(r.ok, true);
  assert.equal(r.trunk.trunks[0].points.length, 2);
});

test('⑮ buildMenuItems：6 项顺序固定（探针按这个顺序逐字校验）', () => {
  const items = E.buildMenuItems({ activeId: 'T1', points: [[1, 1], [1, 2], [1, 3]], vertexIndex: 1, connectedIds: ['T2'], clipboardEmpty: false });
  assert.deepEqual(items.map((x) => x.key), ['delete', 'split', 'merge', 'copyParams', 'pasteParams', 'markVertex']);
  assert.deepEqual(items.map((x) => x.label), ['删除这条干线', '在拐点处打断', '与相连干线合并', '复制参数', '粘贴参数', '标记当前拐点']);
  assert.equal(items.every((x) => x.enabled), true, '条件齐备时六项都应可用');
});

test('⑯ buildMenuItems：条件不满足时逐项禁用', () => {
  const noVertex = E.buildMenuItems({ activeId: 'T1', points: [[1, 1], [1, 2]], vertexIndex: -1, connectedIds: [], clipboardEmpty: true });
  assert.equal(noVertex.find((x) => x.key === 'split').enabled, false, '2 点不能打断');
  assert.equal(noVertex.find((x) => x.key === 'merge').enabled, false, '没有相连线');
  assert.equal(noVertex.find((x) => x.key === 'pasteParams').enabled, false, '剪贴板空');
  assert.equal(noVertex.find((x) => x.key === 'markVertex').enabled, false, '没命中拐点');
  assert.equal(noVertex.find((x) => x.key === 'delete').enabled, true);
  assert.equal(noVertex.find((x) => x.key === 'copyParams').enabled, true);

  const noActive = E.buildMenuItems({ activeId: null });
  assert.equal(noActive.every((x) => x.enabled === false), true, '没选中任何线时全禁用');
});
