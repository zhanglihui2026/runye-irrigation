'use strict';
// Analytic fixtures: Q=C=150 and ID=1 give hf/L=1.113e9 exactly.
// These deliberately non-design inputs cancel exponents and expose routing errors.
const assert = require('node:assert/strict');
const paths = require('../pipe-path-loss.js');
module.exports = function verifyPaths(hazen) {
  const unit = 1.113e9;
  const near = (value, expected) => assert.ok(Math.abs(value / unit - expected) < 1e-9);
  const input = {
    zones: [{ zi: 1, run: 1, main: 2, branch: 3, flow: 150 },
      { zi: 2, run: 2, main: 1, branch: 4, flow: 150 }],
    groups: [[1], [2]], frontOd: 1, mainOd: 1, branchOd: 1,
    branchCount: 1, branchF: 1, innerDiam: d => d,
    hazen: (l, q, d) => hazen(l, q, d, 150)
  };
  let r = paths.calculate(input);
  near(r.paths[0].total, 6);
  near(r.paths[1].total, 7);
  assert.equal(r.worst.zoneIndex, 2);
  assert.deepEqual(r.paths.map(p => p.frontFlow), [150, 150]);
  // Simultaneous group: first metre carries 300, second only 150.
  r = paths.calculate({ ...input, groups: [[1, 2]] });
  near(r.paths[0].total, Math.pow(2, 1.852) + 5);
  near(r.paths[1].total, Math.pow(2, 1.852) + 6);
  // Change ONLY first zone's branch diameter: other path is unaffected.
  r = paths.calculate({ ...input, calibers: { 'branch-1': 2 } });
  near(r.paths[0].total, 3 + 3 / Math.pow(2, 4.87));
  near(r.paths[1].total, 7);
  r = paths.calculate({ ...input, zones: input.zones.map(z => ({ ...z, flow: 0 })) });
  assert.equal(r.worst, null);
  assert.equal(r.paths.length, 0);
};
