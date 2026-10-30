'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const context = { console };
context.window = context;
vm.createContext(context);
for (const file of [
  'core/drawing-design-model.js',
  'core/drawing-design-level3-adapter.js',
  'core/drawing-design-group-adapter.js'
]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}

const model = context.RyDrawingDesignModel;
const groupAdapter = context.RyDrawingDesignGroupAdapter;
const ringA = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }, { x: 0, y: 80 }];
const ringB = ringA.map(point => ({ x: point.x + 120, y: point.y }));
const plain = value => JSON.parse(JSON.stringify(value));

function emptyPlot(id, ring) {
  return model.createPlot(id, { coordinateSystem: 'local-meter', frameId: 'frame-1', boundary: ring }, {});
}

function legacyGroupSnapshot() {
  const slot = ring => ({
    polyPts: ring,
    mainPipes: [], branchPipes: [], subBranchPipes: [], source: null, valves: [],
    pipeIds: { main: [], branch: [], subbranch: [] },
    hiddenPipes: { main: {}, branch: {}, subbranch: {} },
    nextPipeId: 1,
    partitionCuts: { x: [], y: [] },
    cutSnap: null,
    cutOverrides: { x: {}, y: {} },
    areaLocked: false,
    zoneAngleDeg: 0,
    zoneAuto: true
  });
  return {
    version: 1,
    frame: ringA,
    subPlots: [{ id: 'plot-a', poly: ringA }, { id: 'plot-b', poly: ringB }],
    blocks: [
      { id: 'plot-a', ring: ringA, tlData: null, tlState: null },
      { id: 'plot-b', ring: ringB, tlData: null, tlState: null }
    ],
    trunk: { lines: [], dn: 50 },
    edit: { mode: 'whole', current: 0, slots: [slot(ringA), slot(ringB)], trunkPipes: [], trunkDn: 50 }
  };
}

function importGroup(snapshot = legacyGroupSnapshot()) {
  return groupAdapter.fromGroupSnapshot(snapshot, { projectId: 'project-1', groupId: 'group-1', frameId: 'frame-1' });
}

test('L2 source edits advance plot revision, while L3 derived and edit state do not', () => {
  let design = model.createEmpty('project-1');
  const added = model.addPlot(design, emptyPlot('plot-a', ringA), design.revision);
  assert.equal(added.ok, true);
  design = added.design;

  let result = model.updatePlot(design, 'plot-a', design.revision, plot => {
    plot.generated = { level3Geometry: { key: 'geometry-a' }, sourceRevision: plot.revision };
    plot.network.level3Edits = { manual: [{ id: 'manual-1' }] };
  });
  assert.equal(result.ok, true);
  assert.equal(result.design.plots[0].revision, 0);

  result = model.updatePlot(result.design, 'plot-a', result.design.revision, plot => {
    plot.partition.angleDeg = 15;
  });
  assert.equal(result.ok, true);
  assert.equal(result.design.plots[0].revision, 1);
  assert.equal(model.updatePlot(result.design, 'plot-a', 0, () => {}).error, 'revision-conflict');
});

test('group trunk edits advance only group revision and preserve member revisions', () => {
  let imported = importGroup();
  assert.equal(imported.ok, true);
  const group = imported.design.groups[0];
  const beforePlotRevisions = imported.design.plots.map(plot => plot.revision);
  const updated = model.updateGroup(imported.design, 'group-1', imported.design.revision, item => {
    item.trunkNetwork.pipes.push([{ x: 0, y: 0 }, { x: 40, y: 0 }]);
  });

  assert.equal(updated.ok, true);
  assert.equal(updated.design.groups[0].revision, group.revision + 1);
  assert.deepEqual(updated.design.plots.map(plot => plot.revision), beforePlotRevisions);
});

test('legacy group adapter round-trips member slots and rejects unbound project L3 state', () => {
  const imported = importGroup();
  assert.equal(imported.ok, true);
  const slot = groupAdapter.toLegacyMemberSlot(imported.design, 'group-1', 'plot-a', {});
  assert.equal(slot.ok, true);
  assert.deepEqual(plain(slot.slot.polyPts), ringA);
  assert.deepEqual(plain(slot.slot.partitionCuts), { x: [], y: [] });

  const exported = groupAdapter.toLegacyPatch(imported.design, 'group-1', imported.legacyBaseline);
  assert.equal(exported.ok, true);
  const roundTrip = importGroup(exported.snapshot);
  assert.equal(roundTrip.ok, true);
  assert.deepEqual(plain(roundTrip.design.plots.map(plot => plot.plotId)), ['plot-a', 'plot-b']);

  const ambiguous = legacyGroupSnapshot();
  ambiguous.tlDiagramData = { poly: ringA };
  assert.equal(importGroup(ambiguous).error, 'group-level3-member-binding-required');
});

test('canonical validation rejects sparse member arrays and duplicate identities', () => {
  const imported = importGroup();
  assert.equal(imported.ok, true);
  const sparse = model.clone(imported.design);
  delete sparse.plots[1];
  assert.equal(model.validate(sparse).ok, false);

  const duplicate = model.clone(imported.design);
  duplicate.plots[1].plotId = duplicate.plots[0].plotId;
  assert.equal(model.validate(duplicate).errors.some(error => error.startsWith('duplicate-plot-id:')), true);
});
