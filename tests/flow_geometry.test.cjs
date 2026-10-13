const test = require('node:test');
const assert = require('node:assert/strict');
const flow = require('../mod/flow-geometry.js');

test('parses signed decimal SVG move and line coordinates', () => {
  assert.deepEqual(flow.parsePath('M -1.5 2 L 3.25 -4'), [[-1.5, 2], [3.25, -4]]);
  assert.deepEqual(flow.parsePath(''), []);
});

test('finds and clamps the nearest point along a polyline', () => {
  assert.deepEqual(flow.nearestPoint([2, 3], [[0, 0], [4, 0], [4, 4]]), { q: [4, 3], i: 1, d: 2 });
  assert.deepEqual(flow.nearestPoint([9, 2], [[0, 0], [4, 0]]), { q: [4, 0], i: 0, d: Math.sqrt(29) });
});

test('handles degenerate segments and empty polylines compatibly', () => {
  assert.deepEqual(flow.nearestPoint([3, 5], [[1, 1], [1, 1]]), { q: [1, 1], i: 0, d: Math.sqrt(20) });
  assert.deepEqual(flow.nearestPoint([3, 5], []), { q: undefined, i: 0, d: Infinity });
  assert.equal(flow.distance([0, 0], [3, 4]), 5);
});
