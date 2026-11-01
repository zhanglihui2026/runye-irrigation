'use strict';
/* 地图总管数据契约 v2 的静态单元测试（一期）。
 *
 * 这一层的价值不在于"测函数能不能跑"，而在于钉住三条**会静默破坏下游**的约束：
 *   ① v1→v2 迁移必须让 points 逐元素原样透传（形状、精度、顺序都不许动）——
 *      下游四个读取方都拿它做米制投影，动一点坐标就漂，而且不会报错，只会"管子偏了"。
 *   ② 下游只认主干：pickMainTrunk 的兜底顺序不能变，否则施工图会突然读到第二条线。
 *   ③ main 最多一条：两条都标 main 时，不同读取方可能各自取到不同那条。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC_PATH = path.join(__dirname, '..', 'core', 'trunk-schema.js');

function loadSchema() {
  const src = fs.readFileSync(SRC_PATH, 'utf8');
  const sandbox = { window: {} };
  sandbox.window.window = sandbox.window;
  vm.runInNewContext(src, sandbox);
  return sandbox.window.RyTrunkSchema;
}

const S = loadSchema();

/* 一份典型的 v1 记录：地图侧写进去的就是这种 */
function v1() {
  return {
    schema: 1, source: 'map', coordinateSystem: 'GCJ-02', revision: 7,
    points: [[18.2001, 109.5002], [18.2006, 109.5008], [18.2012, 109.5015]]
  };
}

test('① v1 → v2：points 逐元素原样透传（形状/精度/顺序都不许动）', () => {
  const raw = v1();
  const out = S.normalize(raw);
  assert.ok(out, 'v1 必须能归一');
  assert.equal(out.schema, 2);
  assert.equal(out.trunks.length, 1);
  assert.equal(out.trunks[0].id, 'T1');
  assert.equal(out.trunks[0].main, true);
  /* 深度相等 —— 这是"坐标不许漂"的硬断言 */
  assert.deepEqual(out.trunks[0].points, raw.points);
  /* 而且必须是新数组（不能让调用方改到原记录） */
  assert.notEqual(out.trunks[0].points, raw.points);
  assert.equal(out.revision, 7, 'revision 要带过来');
  assert.equal(out.coordinateSystem, 'GCJ-02');
  assert.equal(out.source, 'map');
});

test('① b 混形点（[lat,lng] 与 {lat,lng}）都要保住原形', () => {
  const raw = {
    schema: 1, coordinateSystem: 'GCJ-02',
    points: [[18.2, 109.5], { lat: 18.21, lng: 109.51 }, [18.22, 109.52, 33.5]]
  };
  const out = S.normalize(raw);
  assert.deepEqual(out.trunks[0].points, raw.points);
  /* 第三位高程不许被抹掉（冲突 3 的裁决：缺就缺，有就留） */
  assert.equal(out.trunks[0].points[2][2], 33.5);
});

test('① c 无 schema 的老记录也按 v1 认（宽容读取）', () => {
  const out = S.normalize({ points: [[18.2, 109.5], [18.21, 109.51]] });
  assert.ok(out);
  assert.equal(out.trunks[0].points.length, 2);
});

test('② v2 输入幂等：再归一一次内容不漂', () => {
  const once = S.normalize(v1());
  const twice = S.normalize(once);
  assert.deepEqual(twice, once);
});

test('③ 垃圾输入一律 null（下游据此判"没有总管"）', () => {
  [null, undefined, 0, '', 'x', [], {}, { points: [[18.2]] },
    { points: [[1, 2]] },                       // 只有一个点
    { points: [['a', 'b'], [1, 2]] },           // 非法坐标
    { points: [[999, 109.5], [18.2, 109.5]] },  // 纬度越界
    { trunks: [] }].forEach((bad) => {
    assert.equal(S.normalize(bad), null, '应判无效：' + JSON.stringify(bad));
  });
});

test('④ pickMainTrunk：main 优先 → 否则第一条 → 空则 null', () => {
  const two = S.normalize({
    schema: 2, trunks: [
      { id: 'T1', main: false, points: [[18.2, 109.5], [18.21, 109.51]] },
      { id: 'T2', main: true, points: [[18.3, 109.6], [18.31, 109.61]] }
    ]
  });
  assert.equal(S.pickMainTrunk(two).id, 'T2', '有 main 标记时必须取它，不是第 0 条');

  const noMain = S.normalize({
    schema: 2, trunks: [
      { id: 'T1', points: [[18.2, 109.5], [18.21, 109.51]] },
      { id: 'T2', points: [[18.3, 109.6], [18.31, 109.61]] }
    ]
  });
  assert.equal(S.pickMainTrunk(noMain).id, 'T1', '没有标记时取第一条');

  assert.equal(S.pickMainTrunk(null), null);
  assert.equal(S.pickMainTrunk({ schema: 2, trunks: [] }), null);

  /* 直接喂 v1 也要能取到（下游可能还没归一就调） */
  assert.equal(S.pickMainTrunk(v1()).id, 'T1');
});

test('⑤ main 最多一条：两条都标 main 时只保留第一个', () => {
  const out = S.normalize({
    schema: 2, trunks: [
      { id: 'A', main: true, points: [[18.2, 109.5], [18.21, 109.51]] },
      { id: 'B', main: true, points: [[18.3, 109.6], [18.31, 109.61]] }
    ]
  });
  assert.equal(out.trunks.filter((t) => t.main).length, 1);
  assert.equal(out.trunks[0].main, true);
});

test('⑥ id 撞车时跳过重复项，不留两条同名', () => {
  const out = S.normalize({
    schema: 2, trunks: [
      { id: 'T1', points: [[18.2, 109.5], [18.21, 109.51]] },
      { id: 'T1', points: [[18.3, 109.6], [18.31, 109.61]] }
    ]
  });
  assert.equal(out.trunks.length, 1);
});

test('⑦ makeId：补空位、不撞号', () => {
  assert.equal(S.makeId(null), 'T1');
  const one = S.normalize(v1());
  assert.equal(S.makeId(one), 'T2');
  const gap = S.normalize({
    schema: 2, trunks: [
      { id: 'T1', points: [[18.2, 109.5], [18.21, 109.51]] },
      { id: 'T3', points: [[18.3, 109.6], [18.31, 109.61]] }
    ]
  });
  assert.equal(S.makeId(gap), 'T2', '应补空位 T2 而不是接 T4');
});

test('⑧ validate：合法 / 重复 id / main 两条 / 点不足', () => {
  assert.equal(S.validate(S.normalize(v1())).ok, true);

  const dup = {
    schema: 2, trunks: [
      { id: 'X', points: [[18.2, 109.5], [18.21, 109.51]] },
      { id: 'X', points: [[18.3, 109.6], [18.31, 109.61]] }
    ]
  };
  const r1 = S.validate(dup);
  assert.equal(r1.ok, false);
  assert.ok(r1.errors.some((e) => e.includes('重复')), r1.errors.join('|'));

  const twoMain = {
    schema: 2, trunks: [
      { id: 'A', main: true, points: [[18.2, 109.5], [18.21, 109.51]] },
      { id: 'B', main: true, points: [[18.3, 109.6], [18.31, 109.61]] }
    ]
  };
  assert.equal(S.validate(twoMain).ok, false);

  const short = { schema: 2, trunks: [{ id: 'A', points: [[18.2, 109.5]] }] };
  assert.equal(S.validate(short).ok, false);

  assert.equal(S.validate(null).ok, false);
});

test('⑨ hasUsableTrunk：成组/已归档一律 false，v1/v2 都认', () => {
  assert.equal(S.hasUsableTrunk({ id: 'a', trunk: v1() }), true);
  assert.equal(S.hasUsableTrunk({ id: 'a', merged: true, trunk: v1() }), false);
  assert.equal(S.hasUsableTrunk({ id: 'a', grouped: true, trunk: v1() }), false);
  assert.equal(S.hasUsableTrunk({ id: 'a', mergedInto: 'g1', trunk: v1() }), false);
  assert.equal(S.hasUsableTrunk({ id: 'a' }), false);
  assert.equal(S.hasUsableTrunk(null), false);
});

test('⑩ toV1：降级视图把主干参数提到顶层', () => {
  const v2 = S.normalize({
    schema: 2, revision: 3, trunks: [
      { id: 'T1', main: true, points: [[18.2, 109.5], [18.21, 109.51]],
        params: { material: 'PE', dn: 110, designFlow: 12 } }
    ]
  });
  const back = S.toV1(v2);
  assert.equal(back.schema, 1);
  assert.deepEqual(back.points, v2.trunks[0].points);
  assert.equal(back.dn, 110);
  assert.equal(back.designFlow, 12);
  assert.equal(back.revision, 3);
  assert.equal(S.toV1(null), null);
});

test('⑪ appendTrunk：追加不改已有那条', () => {
  const base = S.normalize(v1());
  const next = S.appendTrunk(base);
  assert.equal(next.trunks.length, 2);
  assert.deepEqual(next.trunks[0].points, base.trunks[0].points);
  assert.equal(next.trunks[1].id, 'T2');
  assert.equal(next.trunks[1].main, false, '新增的线不该抢 main');
  assert.equal(next.trunks[1].points.length, 0);
  /* 原对象没被改 */
  assert.equal(base.trunks.length, 1);
});

test('⑫ normalizeParams：保留自定义字段，只补最小默认值', () => {
  const p = S.normalizeParams({ material: 'PVC', dn: 160, label: '北干', buried: 0.8 });
  assert.equal(p.material, 'PVC');
  assert.equal(p.dn, 160);
  assert.equal(p.label, '北干', '未来新增的参数不能被白名单裁掉');
  assert.equal(p.buried, 0.8);
  assert.equal(p.designFlow, null, '缺的补 null，不补 0');

  const empty = S.normalizeParams(null);
  assert.equal(empty.material, 'PE');
  assert.equal(empty.dn, null);
  assert.equal(empty.designFlow, null);
});

test('⑬ migratePlot：返回新对象、不改入参', () => {
  const plot = { id: 'p1', name: '甲', trunk: v1() };
  const before = JSON.stringify(plot);
  const r = S.migratePlot(plot);
  assert.equal(r.ok, true);
  assert.equal(r.changed, true);
  assert.equal(r.plot.trunk.schema, 2);
  assert.equal(JSON.stringify(plot), before, '入参必须原封不动');
  assert.notEqual(r.plot, plot);

  /* 已经是 v2 就不再标 changed，调用方可以不写库 */
  const r2 = S.migratePlot({ id: 'p2', trunk: S.normalize(v1()) });
  assert.equal(r2.ok, true);
  assert.equal(r2.changed, false);

  /* 无 trunk 也 ok，但 changed=false */
  assert.deepEqual(S.migratePlot({ id: 'p3' }).changed, false);

  /* 坏的 trunk 要报错而不是静默丢掉 */
  const bad = S.migratePlot({ id: 'p4', trunk: { schema: 1, points: [[1]] } });
  assert.equal(bad.ok, false);
  assert.ok(bad.error);
});

test('⑭ mainPoints 便捷取点', () => {
  assert.equal(S.mainPoints(v1()).length, 3);
  assert.equal(S.mainPoints({ schema: 2, trunks: [] }), null);
  assert.equal(S.mainPoints(null), null);
});

test('⑮ [v854 专项] 空位坐标非法：readPoint 不再 Number(null)===0，normalize 按既有契约判废干线', () => {
  /* readPoint 本体：空位 ⇒ null（此前 [null,1] 被读成 {lat:0,lng:1}） */
  assert.equal(S.readPoint([null, 1]), null);
  assert.equal(S.readPoint([18.2, null]), null);
  assert.equal(S.readPoint({ lat: null, lng: 109.5 }), null);
  assert.equal(S.readPoint({ lat: '', lng: 109.5 }), null);
  assert.equal(S.readPoint([18.2, 109.5]).lat, 18.2, '合法点不受影响');
  assert.equal(S.readPoint([18.2, 109.5, 12]).z, 12, 'z 口径不变');

  /* v1 形状：含空位点 ⇒ pointsOk 判废 ⇒ normalize null（垃圾几何不再带进库） */
  assert.equal(S.normalize({ points: [[null, 1], [18.2, 109.5]] }), null);

  /* v2 形状：含空位干线被逐条判废（"无法识别 ⇒ null ⇒ continue"），全空 ⇒ null */
  assert.equal(S.normalize({
    schema: 2, trunks: [{ id: 'T1', points: [[18.2, 109.5], [null, 1]] }]
  }), null, '空位干线丢弃后 trunks 为空 ⇒ null');

  /* 同一批里好干线不受牵连（逐条判废，不是整库丢弃） */
  const mixed = S.normalize({
    schema: 2, trunks: [
      { id: 'T1', points: [[18.2, 109.5], [null, 1]] },
      { id: 'T2', points: [[18.3, 109.6], [18.31, 109.61]] }
    ]
  });
  assert.ok(mixed && mixed.trunks.length === 1 && mixed.trunks[0].id === 'T2',
    '坏干线丢弃、好干线保留');
});
