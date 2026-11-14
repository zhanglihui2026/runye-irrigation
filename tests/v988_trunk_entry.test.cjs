'use strict';
/* Strict construction-node entry contract for the online irrigation animation. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'mod', 'map-flow-demo.js'), 'utf8');
function load() {
  const src = source.replace('})(window);', ';window.__test={buildFlowRoutes,validateConnection};})(window);');
  const sandbox = { console, setInterval, clearInterval };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox.__test;
}
const ll = (x, y) => ({ lat: y / 110540, lng: x / 111320 });
const dist = (a, b) => Math.hypot((a.lng - b.lng) * 111320, (a.lat - b.lat) * 110540);
function fixture(trunk, nodes) {
  return {
    trunkLL: trunk, trunkLinesLL: [trunk], mainsLL: [[ll(0, 0), ll(10, 0)]],
    branchLL: [[ll(5, -5), ll(5, 5)]],
    valves: [{ mi: 0, ll: ll(5, 0), anchorLL: ll(5, 0) }],
    nodesLL: nodes, segLL: null, manual: null, nPer: 1, total: 1, gCount: 1
  };
}
function validate(api, d) {
  return api.validateConnection({ hasTrunk: true, trunkLinesLL: d.trunkLinesLL,
    mainsLL: d.mainsLL, nodesLL: d.nodesLL, strictNodeEntry: true, dist });
}

test('nearby trunk without a published main node does not connect', () => {
  const api = load();
  const d = fixture([ll(-5, 2), ll(10, 2)], []);
  assert.equal(validate(api, d).code, 'no-node');
  assert.equal(api.buildFlowRoutes(d, 0), null);
});

test('a trunk crossing a main node without a saved vertex does not connect', () => {
  const api = load();
  const node = { kind: 'main', mi: 0, ll: ll(0, 0), nodeId: 'N-01' };
  const d = fixture([ll(-5, 0), ll(5, 0)], [node]);
  assert.equal(validate(api, d).code, 'node-not-connected');
  assert.equal(api.buildFlowRoutes(d, 0), null);
});

test('a saved trunk vertex snapped to a published main node reaches both branch ends', () => {
  const api = load();
  const node = { kind: 'main', mi: 0, ll: ll(0, 0), nodeId: 'N-01' };
  const d = fixture([ll(-5, 0), ll(0, 0)], [node]);
  assert.equal(validate(api, d).ok, true);
  const routes = api.buildFlowRoutes(d, 0, true);
  assert.ok(routes);
  assert.equal(routes.filter(r => r.zi === 0 && r.branch.some(s => s.key === 'branch:0')).length, 2);
});

test('a branch construction node cannot substitute for the main entry node', () => {
  const api = load();
  const d = fixture([ll(-5, 0), ll(0, 0)], [{ kind: 'branch', mi: 0, ll: ll(0, 0) }]);
  assert.equal(validate(api, d).code, 'no-node');
  assert.equal(api.buildFlowRoutes(d, 0), null);
});
