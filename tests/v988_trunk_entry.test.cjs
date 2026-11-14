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

/* [v1084c 契约反转·已拍板] 原锁：「总管穿过节点但没有折点 ⇒ 不算接通」。
   反转理由（2026-11-14 用户实测截图）：总管是「从 N-01 一路拉到 N-03」的一段直线，
   中间 N-02/N-03 落在段中间、不是折点 ⇒ 校验说没接通 / 建图说断了，用户看到的
   却是「线明明从节点上过」「明明吸附上去了」，12 个区全报未覆盖。
   现在判据统一为**点到线段的垂距 ≤ NODE_ATTACH_EPS_M(1.5m)**（与建图 project() 同一套
   数学），"穿过即接通"；仍然保留「3m 外擦过不算」的负例，容差没有变松到随便连。 */
test('a trunk crossing a main node within tolerance connects (no saved vertex required)', () => {
  const api = load();
  const node = { kind: 'main', mi: 0, ll: ll(0, 0), nodeId: 'N-01' };
  const d = fixture([ll(-5, 0), ll(5, 0)], [node]);
  assert.equal(validate(api, d).code, 'connected');
  const routes = api.buildFlowRoutes(d, 0, true);
  assert.ok(routes, '建图必须成功（v1084c 前此处为 null，正是 12 区全挂的根因）');
  assert.equal(routes.filter(r => r.zi === 0 && r.branch.some(s => s.key === 'branch:0')).length, 2);
});

test('a trunk passing 3m off the main node still does not connect', () => {
  const api = load();
  const node = { kind: 'main', mi: 0, ll: ll(0, 0), nodeId: 'N-01' };
  const d = fixture([ll(-5, 3), ll(5, 3)], [node]);
  assert.equal(validate(api, d).code, 'node-not-connected');
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
