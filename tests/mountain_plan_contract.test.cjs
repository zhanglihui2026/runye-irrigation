'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = {};
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core/mountain-plan-contract.js'), 'utf8'), context);
const contract = context.RyMountainPlanContract;

function sample() {
  return {
    schema: 'runye-mountain-plan', version: '0.1', projectId: 'p1', plotId: 'plot1', revision: 0,
    status: 'draft',
    frame: { id: 'f1', units: 'm', sourceCrs: 'LOCAL_TEST_METERS', localToSource: [1, 0, 0, 1, 0, 0], engineeringEligible: false },
    basemap: { kind: 'none', sourceId: null, crs: null, calibration: { status: 'not-calibrated', rmsMeters: null, maxMeters: null } },
    site: { boundary: { outer: [[0, 0], [100, 0], [100, 100], [0, 100]], holes: [] }, features: [] },
    zones: [{ id: 'z1', name: '1区', polygon: { outer: [[0, 0], [50, 0], [50, 100], [0, 100]], holes: [] }, targetAreaM2: 6667, locked: false, valveId: 'v1', status: 'draft' }],
    devices: [{ id: 'v1', kind: 'valve', nodeId: 'n2', properties: {} }],
    network: {
      nodes: [{ id: 'n1', point: [0, 50], kind: 'junction' }, { id: 'n2', point: [25, 50], kind: 'valve', deviceId: 'v1' }],
      segments: [{ id: 's1', kind: 'branch', fromNodeId: 'n1', toNodeId: 'n2', vertices: [[0, 50], [25, 50]] }],
      zoneInlets: [{ zoneId: 'z1', valveDeviceId: 'v1', segmentId: 's1' }]
    },
    operation: { groups: [{ id: 'g1', name: '首轮', zoneIds: ['z1'] }], agronomy: null, designLimits: null },
    drawing: { annotations: [], visibleLayers: [] }
  };
}

function codes(result) { return result.errors.map(item => item.code); }

test('valid draft exchange sample has stable object references', () => {
  const plan = sample();
  const before = JSON.stringify(plan);
  assert.equal(contract.validate(plan).ok, true);
  assert.equal(JSON.stringify(plan), before);
});

test('broken zone inlet and visual endpoint match are rejected independently', () => {
  const plan = sample();
  plan.network.zoneInlets[0].zoneId = 'missing-zone';
  plan.network.segments[0].vertices[1] = [25.5, 50];
  const result = contract.validate(plan);
  assert.equal(result.ok, false);
  assert.ok(codes(result).includes('invalid-reference'));
  assert.ok(codes(result).includes('segment-endpoint-mismatch'));
});

test('a local synthetic frame cannot claim engineering eligibility', () => {
  const plan = sample();
  plan.frame.engineeringEligible = true;
  assert.ok(codes(contract.validate(plan)).includes('unknown-crs'));
});

test('sparse and nonfinite geometry is rejected without repairing input', () => {
  const plan = sample();
  plan.site.boundary.holes = [[[40, 40], [60, 40], [Infinity, 60]]];
  plan.zones.length = 2;
  const result = contract.validate(plan);
  assert.equal(result.ok, false);
  assert.ok(codes(result).includes('invalid-ring'));
  assert.ok(codes(result).includes('invalid-array'));
});
