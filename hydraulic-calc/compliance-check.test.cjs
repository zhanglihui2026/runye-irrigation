'use strict';
const assert = require('node:assert/strict');
const C = require('./compliance-check.js');
const Hc = require('./hc-core.js');

const good = C.check({
  emitter: { designFlow: 10, flowIndex: 0.5, designHead: 20, actualFlows: [9.2, 9.5, 9.8], headPressures: [19.8, 20, 20.2], cv: 0.05, qvAllow: 10 },
  sprinkler: { systemType: 'fixed', designPressure: 20, headPressures: [20, 22], catchCanDepths: [98, 100, 102] },
  groups: { flows: [100, 90, 95], ny4368Applicable: true, emitterFlows: [9, 10, 10], emitterDesignFlow: 10 }
});
assert.equal(good.checks.find(x => x.id === 'mv-qv').status, 'pass');
assert.equal(good.checks.find(x => x.id === 'mv-hv').status, 'pass');
assert.equal(good.checks.find(x => x.id === 'mv-cv').status, 'pass');
assert.equal(good.checks.find(x => x.id === 'sp-pressure').status, 'pass');
assert.equal(good.checks.find(x => x.id === 'sp-diff').status, 'pass');
assert.equal(good.checks.find(x => x.id === 'sp-cu').status, 'pass');
assert.equal(good.checks.find(x => x.id === 'grp-dev').status, 'pass');
assert.equal(good.checks.find(x => x.id === 'grp-emit').status, 'pass');
assert.equal(good.summary.fail, 0);

const bad = C.check({
  emitter: { designFlow: 10, actualFlows: [8.5, 10], qvAllow: 10 },
  sprinkler: { designPressure: 20, headPressures: [20, 26] },
  groups: { flows: [100, 60], ny4368Applicable: true }
});
for (const id of ['mv-qv', 'sp-diff', 'grp-dev']) {
  const row = bad.checks.find(x => x.id === id);
  assert.equal(row.status, 'fail', id);
  assert.ok(row.suggestion, id + ' suggestion');
}

assert.deepEqual(C.check({}).checks, [], 'absent data yields no fabricated checks');
const defaultLimit = C.check({ emitter: { designFlow: 10, actualFlows: [9, 10] } }).checks.find(x => x.id === 'mv-qv');
assert.equal(defaultLimit.status, 'pass');
assert.equal(defaultLimit.limit, '≤20', 'GB/T 50485-2020 4.0.6 default is 20%, not 10%');
const missingFlow = C.check({ emitter: { designFlow: 10, qvAllow: 15 } }).checks.find(x => x.id === 'mv-qv');
assert.equal(missingFlow.status, 'unassessed', 'missing flow observations cannot be fabricated');
assert.equal(missingFlow.actual, null);
const pressureDerived = C.check({ emitter: { designFlow: 10, designHead: 20, flowIndex: 0.5, headPressures: [16, 25], qvAllow: 20 } });
assert.equal(pressureDerived.checks.find(x => x.id === 'mv-qv').status, 'fail', 'derive qv from emitter pressure-flow law, not hv × x');
const outOfScope = C.check({ groups: { flows: [100, 60] } }).checks.find(x => x.id === 'grp-dev');
assert.equal(outOfScope.status, 'unassessed', 'NY/T 4368 is not applied without scope confirmation');
const overridden = C.check({ sprinkler: { designPressure: 20, headPressures: [20, 22] }, overrides: { 'sp-diff': { limit: 8 } } });
assert.equal(overridden.checks.find(x => x.id === 'sp-diff').status, 'fail');
const cuNeedsType = C.check({ sprinkler: { cu: 80 } }).checks.find(x => x.id === 'sp-cu');
assert.equal(cuNeedsType.status, 'unassessed', 'CU threshold depends on fixed vs moving sprinkler system');

const cfg = Hc.defaultConfig();
const realPaths = Hc.allPaths(cfg).rows;
const snapshot = JSON.stringify(global.tlDiagramData = { segments: realPaths, marker: { keep: true } });
const fromRealHydraulics = C.check({ r: { paths: realPaths }, emitter: { designFlow: 10, actualFlows: [9.2, 9.5, 9.8], qvAllow: 10 } });
assert.ok(fromRealHydraulics.checks.length);
assert.equal(JSON.stringify(global.tlDiagramData), snapshot, 'checker is pure and leaves diagram data unchanged');

console.log('PASS: compliance criteria, missing-input behavior, overrides, and purity');
console.log('PASS: real hc-core path fixture count=' + realPaths.length + '; checks=' + fromRealHydraulics.checks.length);
