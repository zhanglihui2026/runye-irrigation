#!/usr/bin/env node
'use strict';
/* tests/worst_path_seg.test.cjs —— 段总管时代最不利路径引擎（v879-worst-path-seg）
 *
 * 背景旧引擎 tlWorstPathLen 读 frontPipe —— 自 v873 生成时恒 null ⇒ 引擎整体失效，
 * 扬程退化为「手绘全长/输入值 + 段总管全长」的全长近似：最不利分区不在干线末端时
 * 虚高（用户体感「计算麻烦/泵偏大」的根源）。
 *
 * 锁定：
 * ① segWorstPath：run = 手绘全长 + 沿段总管到该区串联点的部分长度；worst = totPath 最大区；
 *    输出形状与 legacy 引擎逐字段兼容（fromFigure/front/main/branch/zones/taps，另加 fromSeg）。
 * ② tlSegAnchorIdx：手绘总管折线端点与干线两端（管网快照 latLng，v878）haversine 最近匹配；
 *    读不到 ⇒ 退回起点 0。
 * ③ tlFrontLenUse：fromSeg 时段总管不再按全长叠加；引擎不可用时兜底口径逐字节保持 v859。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');


const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'mod', 'inline-09.js'), 'utf8');

function extract(s, name) {
  const start = s.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name + ' 缺失');
  const begin = s.indexOf('{', start);
  let depth = 1, i = begin + 1;
  while (depth && i < s.length) {
    const c = s[i];
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      for (i++; i < s.length; i++) {
        if (s[i] === '\\') i++;
        else if (s[i] === quote) { i++; break; }
      }
    } else if (s.slice(i, i + 2) === '/*') i = s.indexOf('*/', i + 2) + 2;
    else if (s.slice(i, i + 2) === '//') i = s.indexOf('\n', i + 2) + 1;
    else { if (c === '{') depth++; if (c === '}') depth--; i++; }
  }
  assert.equal(depth, 0, name + ' 函数提取失败');
  return s.slice(start, i);
}

function makeCtx(fixture, stubs) {
  const schemaSrc = fs.readFileSync(path.join(ROOT, 'core', 'trunk-schema.js'), 'utf8');
  const geoSrc = fs.readFileSync(path.join(ROOT, 'mod', 'trunk-geo.js'), 'utf8');
  const extracted = ['tlWorstPathLen', 'legacyWorstPath', 'segWorstPath', 'tlSegAnchorIdx', 'tlFrontLenUse']
    .map(n => extract(src, n)).join('\n');
  const win = Object.assign({ tlDiagramData: fixture }, stubs.win || {});
  /* new Function 在当前 realm 执行（不用 vm）：跨 realm 的数组原型不同，
     deepStrictEqual 会报「结构相同但非引用相等」（trunk_panel.test 同款教训）。 */
  const factory = new Function('window', 'readSelectedInt', 'readNumber', 'tlMapTrunkLen',
    geoSrc + '\n' + schemaSrc + '\n' + extracted +
    '\nreturn { tlWorstPathLen: tlWorstPathLen, segWorstPath: segWorstPath,' +
    ' tlSegAnchorIdx: tlSegAnchorIdx, tlFrontLenUse: tlFrontLenUse };');
  return factory(win,
    function (sel, def) { return (stubs.readSelectedInt !== undefined) ? stubs.readSelectedInt : def; },
    function (id, def) { return def; },
    stubs.tlMapTrunkLen || function () { return null; });
}

/* 干线横穿三根竖直主管：干线 y=50，主管 x=0/10/20，各长 100；手绘总管 200 m。 */
function fixture() {
  return {
    world: 'meter',
    mainPipes: [
      [{ x: 0, y: 0 }, { x: 0, y: 100 }],
      [{ x: 10, y: 0 }, { x: 10, y: 100 }],
      [{ x: 20, y: 0 }, { x: 20, y: 100 }]
    ],
    branchPipes: [], branchFullSpans: [], branchDrawnLens: [],
    segTrunk: {
      axis: 'x', base: 50, side: 'lo', stub: 0, len: 30, lenJoin: 30,
      points: [{ x: -5, y: 50 }, { x: 25, y: 50 }],
      couplers: [{ x: -5, y: 50 }, { x: 25, y: 50 }],
      joinPts: [{ x: 0, y: 50 }, { x: 10, y: 50 }, { x: 20, y: 50 }]
    },
    frontPipe: null, sourcePos: null
  };
}

const MT_OK = { ok: true, len: 200, id: 't1', source: 'map', count: 1 };

test('① segWorstPath：run=手绘全长+干线部分长度，worst 取 totPath 最大区（锚点=起点）', () => {
  const ctx = makeCtx(fixture(), { tlMapTrunkLen: () => MT_OK });
  const wp = ctx.tlWorstPathLen();
  assert.equal(wp.fromFigure, true);
  assert.equal(wp.fromSeg, true);
  /* 锚点=起点 (-5,50)：runs = 200 + |join.x-(-5)| = 205/215/225 */
  assert.deepEqual(wp.zones.map(z => z.run), [205, 215, 225]);
  assert.deepEqual(wp.zones.map(z => z.main), [100, 100, 100]);
  assert.equal(wp.zoneIndex, 2);
  assert.equal(wp.front, 225);
  assert.equal(wp.main, 100);
  assert.equal(wp.link, 0);
});

test('② 锚点=终点（手绘驳接下/右端）：runs 镜像，worst 换到首区', () => {
  const net = { plotId: 'p1', segments: [{ id: 'segTrunk', kind: 'segTrunk', latLng: [[30, 120], [30.01, 120]] }] };
  const trunkDoc = { schema: 2, source: 'map', coordinateSystem: 'GCJ-02', revision: 1,
    trunks: [{ id: 't1', main: true, points: [[30.000, 119.999], [30.0095, 120.000]], params: {} }] };
  const ctx = makeCtx(fixture(), {
    tlMapTrunkLen: () => MT_OK,
    win: {
      currentPlotId: 'p1',
      RyIrrigationDataStore: { readNetworkLayout: () => net },
      RyPlotLibraryStore: { read: () => ({ plots: [{ id: 'p1', trunk: trunkDoc }] }) }
    }
  });
  /* 手绘折线首端 (30.0008,120) 离 LB(30.01,120) 最近 ⇒ 驳接端=终点 ⇒ 锚点=points[1] */
  assert.equal(ctx.tlSegAnchorIdx(), 1);
  const wp = ctx.tlWorstPathLen();
  assert.deepEqual(wp.zones.map(z => z.run), [225, 215, 205]);
  assert.equal(wp.zoneIndex, 0);
  assert.equal(wp.front, 225);
});

test('③ 无快照/无手绘：锚点退回起点，handLen=0', () => {
  const ctx = makeCtx(fixture(), {});
  assert.equal(ctx.tlSegAnchorIdx(), 0);
  const wp = ctx.tlWorstPathLen();
  assert.deepEqual(wp.zones.map(z => z.run), [5, 15, 25]);
  assert.equal(wp.zoneIndex, 2);
});

test('④ 标注几何（needGeom）：frontPts=锚点→串联点，endPt=主管远端，len 与扬程同源', () => {
  const ctx = makeCtx(fixture(), { tlMapTrunkLen: () => MT_OK });
  const wp = ctx.tlWorstPathLen(true);
  assert.ok(wp.geom);
  assert.deepEqual(wp.geom.frontPts, [{ x: -5, y: 50 }, { x: 20, y: 50 }]);
  assert.equal(wp.geom.zoneIndex, 2);
  assert.equal(wp.geom.len, 325);           /* run 225 + main 100（含手绘 200，与扬程同源） */
  assert.deepEqual(wp.geom.endPt, { x: 20, y: 0 });  /* join(20,50) 到两端等距 ⇒ 取起点端 */
});

test('⑤ 无段总管/缺 joinPts ⇒ EMPTY（兜底口径不变）', () => {
  const f1 = fixture(); delete f1.segTrunk;
  const f2 = fixture(); f2.segTrunk.joinPts = [];
  for (const f of [f1, f2]) {
    const ctx = makeCtx(f, { tlMapTrunkLen: () => MT_OK });
    const wp = ctx.tlWorstPathLen();
    assert.equal(wp.fromFigure, false);
    assert.equal(wp.front, 0);
  }
});

test('⑥ tlFrontLenUse：fromSeg 时段总管不按全长叠加；引擎不可用兜底口径逐字节保持 v859', () => {
  /* 引擎可用 + 手绘总管：len = run(含手绘+部分干线)，无 segLen */
  let ctx = makeCtx(fixture(), { tlMapTrunkLen: () => MT_OK });
  assert.deepEqual(
    ctx.tlFrontLenUse(225, 0, true),
    { len: 225, src: 'mapTrunk', mapLen: 200, mapId: 't1', segLen: 30 });
  /* 引擎可用 + 无手绘：input 长度照加（run 只含干线部分长度） */
  ctx = makeCtx(fixture(), {});
  assert.deepEqual(
    ctx.tlFrontLenUse(25, 150, true),
    { len: 175, src: 'input', mapLen: null, mapId: null, segLen: 30 });
  /* 引擎不可用（wpFront=0）+ 手绘：v859 全长兜底逐字节保持 */
  ctx = makeCtx(fixture(), { tlMapTrunkLen: () => MT_OK });
  assert.deepEqual(
    ctx.tlFrontLenUse(0, 150, false),
    { len: 230, src: 'mapTrunk', mapLen: 200, mapId: 't1', segLen: 30 });
  /* 引擎不可用 + 无手绘：input + 全长 */
  ctx = makeCtx(fixture(), {});
  assert.deepEqual(
    ctx.tlFrontLenUse(0, 150, false),
    { len: 180, src: 'input', mapLen: null, mapId: null, segLen: 30 });
});
