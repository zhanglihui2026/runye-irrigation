'use strict';
/* 捕捉引擎的纯函数契约（二期）。
 *
 * 这里钉的是三条"错了但看不出来"的规则：
 *   ① 优先级是**主键**、距离是次键 —— 否则白圈标记会在两类目标之间来回跳。
 *   ② 半径外的目标一律不参与，哪怕它的优先级更高。
 *   ③ 正在编辑的那条干线不吃自己的拐点，否则拐点永远吸在自己脚下、拖不动。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'mod', 'trunk-snap.js');

/* 用 new Function 在**当前 realm** 里执行，而不是 vm.runInNewContext。
   跨 realm 返回的对象原型不同，assert.deepStrictEqual 会报
   "Values have same structure but are not reference-equal"，看着像数据错了、其实是原型差异。 */
function loadSnap() {
  const src = fs.readFileSync(SRC, 'utf8');
  const win = {};
  const fn = new Function('window', src + '\nreturn window.RyTrunkSnap;');
  return fn(win);
}

/* 每个用例拿一份全新的实例，避免 targets/lastHit 相互串味 */
function fresh() {
  const S = loadSnap();
  /* 身份投影：直接把经纬度当像素用，测试只关心相对距离 */
  S.setProjector((p) => ({ x: p.lng * 10000, y: p.lat * 10000 }));
  return S;
}

test('① prioOf：7 类目标各有固定优先级，未知类型垫底', () => {
  const S = fresh();
  assert.equal(S.prioOf('plot-vertex'), 1);
  assert.equal(S.prioOf('water-source'), 2);
  assert.equal(S.prioOf('trunk-vertex'), 3);
  assert.equal(S.prioOf('seg-coupler'), 4, '[v872] 驳接点必须注册（此前漏注册落 99 垫底档）');
  assert.equal(S.prioOf('valve-node'), 5);
  assert.equal(S.prioOf('branch-start'), 6);
  assert.equal(S.prioOf('zone-vertex'), 7);
  assert.equal(S.prioOf('whatever'), 99);
  /* 顺序不能乱：地块顶点必须最高；驳接点压过阀门/支管起点（设计落点不被抢） */
  assert.ok(S.prioOf('plot-vertex') < S.prioOf('water-source'));
  assert.ok(S.prioOf('water-source') < S.prioOf('trunk-vertex'));
  assert.ok(S.prioOf('trunk-vertex') < S.prioOf('seg-coupler'));
  assert.ok(S.prioOf('seg-coupler') < S.prioOf('valve-node'));
});

test('② readPoint：三种历史形状都认，非法一律 null', () => {
  const S = fresh();
  assert.deepEqual(S.readPoint([18.2, 109.5]), { lat: 18.2, lng: 109.5 });
  assert.deepEqual(S.readPoint([18.2, 109.5, 33]), { lat: 18.2, lng: 109.5 });
  assert.deepEqual(S.readPoint({ lat: 18.2, lng: 109.5 }), { lat: 18.2, lng: 109.5 });
  assert.deepEqual(S.readPoint({ lat: 18.2, lng: 109.5, z: 9 }), { lat: 18.2, lng: 109.5 });
  assert.equal(S.readPoint([18.2]), null);
  assert.equal(S.readPoint(['a', 'b']), null);
  assert.equal(S.readPoint(null), null);
});

test('③ buildTargets：七类目标各自生成，标签带序号', () => {
  const S = fresh();
  const list = S.buildTargets({
    plotRing: [[18.2, 109.5], [18.2, 109.51], [18.21, 109.51]],
    waterSource: { lat: 18.19, lng: 109.49 },
    savedTrunks: [{ id: 'T1', points: [[18.22, 109.52], [18.23, 109.53]] }],
    valves: [[18.24, 109.54]],
    branchStarts: [[18.25, 109.55]],
    zoneVerts: [[18.26, 109.56]],
    couplers: [[18.27, 109.57], [18.28, 109.58]]
  });
  const kinds = list.map((x) => x.kind);
  assert.equal(kinds.filter((k) => k === 'plot-vertex').length, 3);
  assert.equal(kinds.filter((k) => k === 'water-source').length, 1);
  assert.equal(kinds.filter((k) => k === 'trunk-vertex').length, 2);
  assert.equal(kinds.filter((k) => k === 'valve-node').length, 1);
  assert.equal(kinds.filter((k) => k === 'branch-start').length, 1);
  assert.equal(kinds.filter((k) => k === 'zone-vertex').length, 1);
  assert.equal(kinds.filter((k) => k === 'seg-coupler').length, 2, '[v872] 驳接点目标必须生成');
  assert.equal(list.length, 11);
  assert.ok(list.some((x) => x.label === '地块顶点 1'));
  assert.ok(list.some((x) => x.label.indexOf('T1') >= 0));
  assert.ok(list.some((x) => x.label === '驳接点 1'), '驳接点标签带序号');
});

test('③ b 没有显式水源时退到主干首点', () => {
  const S = fresh();
  const list = S.buildTargets({
    plotRing: [],
    mainTrunkPoints: [[18.2, 109.5], [18.21, 109.51]]
  });
  const ws = list.filter((x) => x.kind === 'water-source');
  assert.equal(ws.length, 1);
  assert.equal(ws[0].lat, 18.2);
  assert.ok(ws[0].label.indexOf('首点') >= 0);
});

test('③ c excludeTrunkId：正在编辑的线不吃自己的拐点', () => {
  const S = fresh();
  const list = S.buildTargets({
    savedTrunks: [
      { id: 'T1', points: [[18.2, 109.5], [18.21, 109.51]] },
      { id: 'T2', points: [[18.3, 109.6]] }
    ],
    excludeTrunkId: 'T1'
  });
  const ids = list.filter((x) => x.kind === 'trunk-vertex').map((x) => x.label);
  assert.equal(ids.length, 1, 'T1 的两个拐点都应被排除');
  assert.ok(ids[0].indexOf('T2') >= 0);
});

test('③ d 非法素材不炸，也不产生脏点', () => {
  const S = fresh();
  const list = S.buildTargets({
    plotRing: [[999, 109.5], [18.2, 109.5], null, ['x', 'y']],
    valves: [null, {}, 'x'],
    savedTrunks: [null, { id: 'T1' }, { id: 'T2', points: 'nope' }]
  });
  assert.equal(list.length, 1, '只有 [18.2,109.5] 是合法的');
  assert.equal(list[0].kind, 'plot-vertex');
});

test('④ nearest：半径内才吸，半径外返回 null', () => {
  const S = fresh();
  S.setTargets([{ lat: 18.2, lng: 109.5, kind: 'plot-vertex' }]);
  /* 投影是 lng*10000 / lat*10000 ⇒ 0.0001 度 ≈ 1px */
  const hit = S.nearest({ lat: 18.2, lng: 109.5001 });      // 约 1px
  assert.ok(hit, '1px 内应命中');
  assert.equal(hit.kind, 'plot-vertex');
  assert.ok(hit.dist <= 2);

  assert.equal(S.nearest({ lat: 18.21, lng: 109.51 }), null, '远距离不吸');
});

test('⑤ 优先级是主键：更近的低优先级目标也会输给半径内的高优先级目标', () => {
  const S = fresh();
  S.setTargets([
    { lat: 18.2, lng: 109.5, kind: 'valve-node' },     // prio 4，几乎贴脸
    { lat: 18.2, lng: 109.5005, kind: 'plot-vertex' }  // prio 1，约 5px
  ]);
  const hit = S.nearest({ lat: 18.2, lng: 109.5 });
  assert.equal(hit.kind, 'plot-vertex', '同半径内优先级高的胜，即使它更远');
});

test('⑥ 同优先级时按距离取最近', () => {
  const S = fresh();
  S.setTargets([
    { lat: 18.2, lng: 109.5004, kind: 'plot-vertex' },
    { lat: 18.2, lng: 109.5001, kind: 'plot-vertex' }
  ]);
  const hit = S.nearest({ lat: 18.2, lng: 109.5 });
  assert.equal(hit.dist <= 2, true, '应取到那个 1px 的');
  assert.ok(Math.abs(hit.lng - 109.5001) < 1e-9);
});

test('⑦ 关闭开关后一律不吸', () => {
  const S = fresh();
  S.setTargets([{ lat: 18.2, lng: 109.5, kind: 'plot-vertex' }]);
  S.setEnabled(false);
  assert.equal(S.nearest({ lat: 18.2, lng: 109.5 }), null);
  assert.equal(S.isEnabled(), false);
  S.setEnabled(true);
  assert.ok(S.nearest({ lat: 18.2, lng: 109.5 }));
});

test('⑧ 没有 projector / 没有目标时安全返回 null', () => {
  const S = loadSnap();
  assert.equal(S.nearest({ lat: 18.2, lng: 109.5 }), null, '无 projector');
  S.setProjector((p) => ({ x: p.lng, y: p.lat }));
  assert.equal(S.nearest({ lat: 18.2, lng: 109.5 }), null, '无目标');
  assert.equal(S.nearest(null), null);
});

test('⑨ 标记回调：命中 show、落空 hide；关闭开关也 hide', () => {
  const S = fresh();
  const calls = [];
  S.setMarkerApi({ show: (h) => calls.push('show:' + h.kind), hide: () => calls.push('hide') });
  S.setTargets([{ lat: 18.2, lng: 109.5, kind: 'plot-vertex' }]);
  S.nearest({ lat: 18.2, lng: 109.5 });
  S.nearest({ lat: 18.9, lng: 109.9 });
  S.nearest({ lat: 18.2, lng: 109.5 });
  S.setEnabled(false);
  assert.deepEqual(calls, ['show:plot-vertex', 'hide', 'show:plot-vertex', 'hide']);
});

test('⑩ setTargets 会丢掉非法项，stats 给出分类计数', () => {
  const S = fresh();
  const n = S.setTargets([
    { lat: 18.2, lng: 109.5, kind: 'plot-vertex' },
    { lat: NaN, lng: 109.5 },
    { lat: 18.3, lng: 109.6 },              // 缺 kind → 默认 plot-vertex
    { lat: 18.4, lng: 109.7, kind: 'valve-node' }
  ]);
  assert.equal(n, 3);
  const s = S.stats();
  assert.equal(s.total, 3);
  assert.equal(s.byKind['plot-vertex'], 2);
  assert.equal(s.byKind['valve-node'], 1);
  assert.equal(s.snapPx, 10);
  assert.equal(s.mergeM, 0.3);
});

test('⑪ 阈值常量：吸附 10px / 合并 0.3m 必须是两个不同的量', () => {
  const S = loadSnap();
  assert.equal(S.SNAP_PX, 10);
  assert.equal(S.MERGE_M, 0.3);
  assert.notEqual(S.SNAP_PX, S.MERGE_M);
});

/* [v872] 审核修正锁：驳接点优先级缺口（此前 seg-coupler 漏注册落 99 垫底档，
   v870 起驳接点进地块内与阀门共享空间 ⇒ 想吸驳接点被阀门抢走）。
   ① 驳接点压过阀门（即使阀门更近）；② 驳接点仍输给干线拐点（编辑抢点不变）。 */
test('⑫ 驳接点优先级：同半径内压过更近的阀门；仍让位于干线拐点', () => {
  const S = fresh();
  S.setTargets([
    { lat: 18.2, lng: 109.5, kind: 'valve-node' },        // prio 5，几乎贴脸（0px）
    { lat: 18.2, lng: 109.5005, kind: 'seg-coupler' }     // prio 4，约 5px
  ]);
  const hit = S.nearest({ lat: 18.2, lng: 109.5 });
  assert.equal(hit.kind, 'seg-coupler', '同半径内驳接点胜过更近的阀门（设计落点不被抢）');

  const S2 = fresh();
  S2.setTargets([
    { lat: 18.2, lng: 109.5, kind: 'seg-coupler' },       // prio 4，贴脸
    { lat: 18.2, lng: 109.5005, kind: 'trunk-vertex' }    // prio 3，约 5px
  ]);
  const hit2 = S2.nearest({ lat: 18.2, lng: 109.5 });
  assert.equal(hit2.kind, 'trunk-vertex', '编辑已有干线时拐点抢点行为不变');
});

/* [v888 2026-11-02 用户口径] 类别闸门：捕捉开关关掉普通类，但「段总管驳接点」
   常开 —— 用户原话「断点接近驳接点时要能自动吸附，形成完整水流闭环」。
   闸门只过滤，优先级/半径判定照旧走同一套 ⇒ 落点与橡皮筋预览天然一致。 */
test('⑬ 类别闸门：被过滤的类别等同不存在（不命中、不显示标记）', () => {
  const S = fresh();
  const calls = [];
  S.setMarkerApi({ show: (h) => calls.push('show:' + h.kind), hide: () => calls.push('hide') });
  S.setTargets([
    { lat: 18.2, lng: 109.5, kind: 'plot-vertex' },
    { lat: 18.2001, lng: 109.5001, kind: 'seg-coupler' }
  ]);
  /* 闸门=只放行驳接点：贴脸的地块顶点被滤掉，命中驳接点 */
  S.setKindGate((t) => t.kind === 'seg-coupler');
  const hit = S.nearest({ lat: 18.2, lng: 109.5 });
  assert.equal(hit.kind, 'seg-coupler', '闸门外（plot-vertex）不参与判定');
  assert.ok(S.stats().gateActive, 'stats 报告闸门激活');

  /* 闸门把所有目标都滤掉 = 无命中 + 清标记（setKindGate 每次设置都 hide：首调一次、
     切水闸门一次；nearest 落空再一次） */
  S.setKindGate((t) => t.kind === 'water-source');
  assert.equal(S.nearest({ lat: 18.2, lng: 109.5 }), null, '全被滤掉 ⇒ null');
  assert.deepEqual(calls, ['hide', 'show:seg-coupler', 'hide', 'hide'], '切换/落空时清标记（防上一态白圈残留）');

  /* 清除闸门（null/非函数）= 全放行 */
  S.setKindGate(null);
  const hit2 = S.nearest({ lat: 18.2, lng: 109.5 });
  assert.equal(hit2.kind, 'plot-vertex', '无闸门时按优先级/距离正常判定');
  assert.equal(S.stats().gateActive, false);
});

test('⑭ 驳接点在闸门内仍守优先级规则（v872 锁不因 v888 回退）', () => {
  const S = fresh();
  S.setKindGate((t) => t.kind === 'seg-coupler');
  S.setTargets([
    { lat: 18.2, lng: 109.5, kind: 'valve-node' },       // 更近但被闸门滤掉
    { lat: 18.2001, lng: 109.5001, kind: 'seg-coupler' }
  ]);
  const hit = S.nearest({ lat: 18.2, lng: 109.5 });
  assert.equal(hit.kind, 'seg-coupler', '闸门放行的一类里按半径/优先级判定');
});
