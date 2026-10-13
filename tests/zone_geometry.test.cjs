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

test('zone grouping preserves planned-area fallback and invalid-input result', () => {
  const fallback = geometry.zoneAreaGroups({
    cols: 2, rows: 2, xPos: [0, 1, 2], yPos: [0, 1, 2],
    xPlan: [3, 4], yPlan: [5, 6]
  }, null, 3);
  assert.deepEqual(fallback.cells, [15, 20, 18, 24]);
  assert.deepEqual(fallback.groups, [{ g: 0, sum: 53, zones: [0, 1, 2] }, { g: 1, sum: 24, zones: [3] }]);
  assert.equal(geometry.zoneAreaGroups(null, null, 1).ok, false);
});
