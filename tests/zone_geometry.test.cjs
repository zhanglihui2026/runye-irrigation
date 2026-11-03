'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const geometry = require('../mod/zone-geometry.js');

test('polygon area and rectangle clipping preserve the measured intersection', () => {
  const polygon = [{ x: -5, y: 0 }, { x: 15, y: 0 }, { x: 15, y: 10 }, { x: -5, y: 10 }];
  const clipped = geometry.clipPolyToRect(polygon, 0, 0, 10, 10);
  assert.equal(geometry.polyAreaM2(polygon), 200);
  assert.equal(geometry.polyAreaM2(clipped), 100);
  assert.equal(geometry.polyAreaM2([]), 0);
});

test('zone areas honor staircase overrides and group cells in row-major order', () => {
  const cuts = {
    cols: 2, rows: 1,
    xPos: [0, 10, 20], yPos: [0, 10],
    cutOffX: { '0,1': 12 },
    xPlan: [10, 10], yPlan: [10]
  };
  const polygon = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 }];
  assert.equal(geometry.zoneGx(cuts, 0, 1), 12);
  assert.equal(geometry.zoneGy(cuts, 0, 0), 0);
  assert.deepEqual(geometry.zoneAreaGroups(cuts, polygon, 1), {
    ok: true, cells: [120, 80], maxCell: 120, maxCellIndex: 0,
    groups: [{ g: 0, sum: 120, zones: [0] }, { g: 1, sum: 80, zones: [1] }],
    maxGroup: 120, maxGroupIndex: 0, groupCount: 2
  });
  assert.equal(geometry.zoneAreaGroups(cuts, polygon, 2).groups[0].sum, 200);
});

test('splitZoneLength absorbs sub-half-step remainder instead of creating a sliver strip', () => {
  /* [v877] 余数 < 0.5×步长 → 均摊进已有分段，不新增贴边窄条 */
  assert.deepEqual(
    geometry.splitZoneLength(500, 160, 100).map(function (v) { return Math.round(v * 10) / 10; }),
    [166.7, 166.7, 166.7]
  );
  /* 余数 ≥ 0.5×步长 → 仍是正常独立分区 */
  assert.deepEqual(geometry.splitZoneLength(560, 160, 100), [160, 160, 160, 80]);
  /* 恰好整除 → 无余数路径 */
  assert.deepEqual(geometry.splitZoneLength(480, 160, 100), [160, 160, 160]);
  /* 无已有分段（total ≤ step）→ 单段返回 */
  assert.deepEqual(geometry.splitZoneLength(120, 160, 100), [120]);
  /* 均摊后总和守恒 */
  const parts = geometry.splitZoneLength(501, 200, 100);
  assert.equal(parts.length, 3);
  assert.ok(Math.abs(parts.reduce(function (a, b) { return a + b; }, 0) - 501) < 1e-9);
});

test('manualZoneLayout stays sliver-free when the remainder is sub-half-step', () => {
  /* 高度 500、设计行高 160 → 3 行均分（旧实现会出 4 行、末行 20m 窄条） */
  const layout = geometry.manualZoneLayout(480, 500, 40, 160, 666.6667, 200);
  assert.equal(layout.rows, 3);
  assert.equal(layout.cols, 3);
  assert.equal(layout.N, 9);
  assert.ok(Math.abs(layout.drawZoneH - 500 / 3) < 1e-6);
  /* 余数超半步时行数不变（独立窄区保留）：600/166.67 → 3 步长段 + 余 100 ≥ 半步 83.3 */
  const layout2 = geometry.manualZoneLayout(480, 600, 40, 160, 666.6667, 200);
  assert.equal(layout2.rows, 4);
});

test('zone grouping preserves planned-area fallback and invalid-input result', () => {
  const fallback = geometry.zoneAreaGroups({
    cols: 2, rows: 2, xPos: [0, 1, 2], yPos: [0, 1, 2],
    xPlan: [3, 4], yPlan: [5, 6]
  }, null, 3);
  assert.deepEqual(fallback.cells, [15, 20, 18, 24]);
  assert.deepEqual(fallback.groups, [{ g: 0, sum: 53, zones: [0, 1, 2] }, { g: 1, sum: 24, zones: [3] }]);
  assert.equal(geometry.zoneAreaGroups(null, null, 1).ok, false);
});

test('127×187.5m portrait first zone sets tape direction regardless of grid bounds', () => {
  const cuts = { cols: 4, rows: 2, xPlan: [127.2, 127.2, 127.2, 127.2], yPlan: [187.2, 187.2] };
  const axis = geometry.tapeAxisOf(cuts, 160);
  /* 第一分区是竖长方形（127.2×187.2）⇒ 带竖铺沿第一分区长边；主管/支管横向 ⊥ 带。 */
  assert.equal(axis.tapeAxis, 'y');
  assert.equal(axis.pipeAxis, 'x');
});

test('actual zone spans override planned dimensions when choosing the tape long side', () => {
  const cuts = { cols: 2, rows: 1, xPlan: [210, 210], yPlan: [100],
    xSrc: [120, 120], ySrc: [185] };
  const axis = geometry.tapeAxisOf(cuts, 160);
  assert.equal(axis.tapeAxis, 'y');
  assert.equal(axis.pipeAxis, 'x');
});

test('first zone fixes the tape axis even when later zones have the opposite long side', () => {
  const cuts = { cols: 2, rows: 2, xSrc: [90, 180], ySrc: [200, 70],
    xPlan: [90, 180], yPlan: [200, 70] };
  const axis = geometry.tapeAxisOf(cuts, 160);
  assert.equal(axis.tapeAxis, 'y');
  assert.equal(axis.pipeAxis, 'x');
  assert.ok(axis.votes.x > axis.votes.y, 'majority telemetry points the other way but must not choose orientation');
  assert.deepEqual(axis.segs, [2, 2, 1, 1]);
});

test('first zone direction uses actual edited cut edges instead of nominal spans', () => {
  const cuts = { cols: 2, rows: 2, xPos: [0, 100, 300], yPos: [0, 120, 300],
    xSrc: [100, 200], ySrc: [120, 180], xPlan: [100, 200], yPlan: [120, 180],
    cutOffX: { '0,1': 160, '1,1': 160 }, cutOffY: { '0,1': 80, '1,1': 80 } };
  const spans = geometry.firstZoneSpans(cuts);
  assert.equal(spans.horizontal, 160);
  assert.equal(spans.vertical, 80);
  const axis = geometry.tapeAxisOf(cuts, 160);
  assert.equal(axis.tapeAxis, 'x', 'the edited first zone is wide even though nominal xSrc/ySrc say it is tall');
});
