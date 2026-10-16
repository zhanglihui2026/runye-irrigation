'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadStore(file, options = {}) {
  const values = new Map();
  const calls = [];
  const storage = {
    getItem(key) {
      calls.push(['get', key]);
      if (options.getError) throw new Error('get failed');
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      calls.push(['set', key, value]);
      if (options.setError) throw new Error('set failed');
      values.set(key, String(value));
    },
    removeItem(key) {
      calls.push(['remove', key]);
      if (options.removeError) throw new Error('remove failed');
      values.delete(key);
    }
  };
  const context = { localStorage: storage, JSON, console };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, { filename: file });
  return { store: context[options.exportName], values, calls };
}

function json(value) { return JSON.stringify(value); }

// These bridges intentionally have different exception and lifecycle contracts.
// Keep each assertion against the real classic-script implementation.
const irrigationKeys = {
  networkLayout: 'runye_network_layout',
  hydraulicDesign: 'runye_hydraulic_design_v1'
};

test('Irrigation data store preserves fixed keys, JSON roundtrips, and nullish deletion', () => {
  const { store, values } = loadStore('core/irrigation-data-store.js', { exportName: 'RyIrrigationDataStore' });
  assert.deepEqual(JSON.parse(JSON.stringify(store.keys)), irrigationKeys);

  const layout = { segments: [{ id: 'main-1', od: 200 }], plotId: 'plot-a' };
  const design = { version: 1, flow: 12.5, pump: { head: 30 } };
  assert.equal(store.writeNetworkLayout(layout), true);
  assert.equal(store.writeHydraulicDesign(design), true);
  assert.equal(values.get(irrigationKeys.networkLayout), json(layout));
  assert.equal(values.get(irrigationKeys.hydraulicDesign), json(design));
  assert.equal(json(store.readNetworkLayout()), json(layout));
  assert.equal(json(store.readHydraulicDesign()), json(design));

  assert.equal(store.writeNetworkLayout(null), true);
  assert.equal(values.has(irrigationKeys.networkLayout), false);
  assert.equal(store.writeHydraulicDesign(undefined), true);
  assert.equal(values.has(irrigationKeys.hydraulicDesign), false);
});

test('Irrigation data store returns null for read/parse failures but lets write failures throw', () => {
  const brokenJson = loadStore('core/irrigation-data-store.js', { exportName: 'RyIrrigationDataStore' });
  brokenJson.values.set(irrigationKeys.networkLayout, '{bad json');
  assert.equal(brokenJson.store.readNetworkLayout(), null);
  assert.equal(loadStore('core/irrigation-data-store.js', { exportName: 'RyIrrigationDataStore', getError: true })
    .store.readHydraulicDesign(), null);

  const failedSet = loadStore('core/irrigation-data-store.js', { exportName: 'RyIrrigationDataStore', setError: true });
  assert.throws(() => failedSet.store.writeNetworkLayout({ segments: [] }), /set failed/);
  const failedRemove = loadStore('core/irrigation-data-store.js', { exportName: 'RyIrrigationDataStore', removeError: true });
  assert.throws(() => failedRemove.store.writeHydraulicDesign(null), /remove failed/);
});

test('Terrain bridge writes and consumes one fixed-key payload exactly once', () => {
  const { store, values } = loadStore('core/terrain-bridge-store.js', { exportName: 'RyTerrainBridgeStore' });
  const key = 'runye_terrain_incoming';
  assert.equal(store.key, key);

  const payload = { polygon: [[1, 2], [3, 4]], source: 'online-map' };
  assert.equal(store.writeIncoming(payload), true);
  assert.equal(values.get(key), json(payload));
  assert.equal(json(store.consumeIncoming()), json(payload));
  assert.equal(values.has(key), false, 'consume removes the payload before returning it');
  assert.equal(store.consumeIncoming(), null, 'the same handoff cannot be consumed twice');

  const array = [{ x: 1 }, 2];
  values.set(key, json(array));
  assert.equal(json(store.consumeIncoming()), json(array), 'arrays are valid object payloads');
  assert.equal(values.has(key), false);
});

test('Terrain bridge deletes corrupt payloads before returning null and fails closed on storage errors', () => {
  const broken = loadStore('core/terrain-bridge-store.js', { exportName: 'RyTerrainBridgeStore' });
  const key = broken.store.key;
  broken.values.set(key, '{bad json');
  assert.equal(broken.store.consumeIncoming(), null);
  assert.equal(broken.values.has(key), false, 'corrupt payload is still consumed/deleted');
  assert.deepEqual(broken.calls.slice(-2).map(call => call[0]), ['get', 'remove']);

  for (const scalar of ['null', 'false', '0', '"text"']) {
    broken.values.set(key, scalar);
    assert.equal(broken.store.consumeIncoming(), null, `${scalar} is not a valid object payload`);
    assert.equal(broken.values.has(key), false);
  }

  assert.equal(loadStore('core/terrain-bridge-store.js', { exportName: 'RyTerrainBridgeStore', setError: true })
    .store.writeIncoming({ polygon: [] }), false);
  assert.equal(loadStore('core/terrain-bridge-store.js', { exportName: 'RyTerrainBridgeStore', getError: true })
    .store.consumeIncoming(), null);
  const failedRemove = loadStore('core/terrain-bridge-store.js', { exportName: 'RyTerrainBridgeStore', removeError: true });
  failedRemove.values.set(failedRemove.store.key, '{"polygon":[]}');
  assert.equal(failedRemove.store.consumeIncoming(), null);
});

test('Sprinkler bridge uses default/custom keys, removes before setting, and isolates returned snapshots', () => {
  const { store, values, calls } = loadStore('core/sprinkler-bridge-store.js', { exportName: 'RySprinklerBridgeStore' });
  const defaultKey = 'runyeSprinklerResult';
  const customKey = 'project:sprinkler:v1';
  assert.equal(store.key, defaultKey);

  values.set(defaultKey, 'old');
  const snapshot = { layout: { rows: [1, 2] }, bom: [{ id: 'emitter', count: 12 }] };
  assert.equal(store.writeSnapshot(snapshot), true);
  assert.deepEqual(calls.slice(-2).map(call => call[0]), ['remove', 'set']);
  assert.equal(values.get(defaultKey), json(snapshot));

  const copy = store.readSnapshot();
  assert.equal(json(copy), json(snapshot));
  copy.layout.rows.push(3);
  copy.bom[0].count = 99;
  assert.equal(json(store.readSnapshot()), json(snapshot), 'returned object must not alias stored JSON data');

  const array = [{ zones: [1, 2] }];
  assert.equal(store.writeSnapshot(array, customKey), true);
  const arrayCopy = store.readSnapshot(customKey);
  assert.equal(json(arrayCopy), json(array), 'arrays are valid snapshots');
  arrayCopy[0].zones[0] = 9;
  assert.equal(json(store.readSnapshot(customKey)), json(array));
  assert.equal(store.removeSnapshot(customKey), true);
  assert.equal(values.has(customKey), false);
});

test('Sprinkler bridge rejects corrupt/non-object snapshots and reports failures with its own return values', () => {
  const { store, values } = loadStore('core/sprinkler-bridge-store.js', { exportName: 'RySprinklerBridgeStore' });
  for (const raw of ['{bad json', 'null', 'false', '0', '"text"']) {
    values.set(store.key, raw);
    assert.equal(store.readSnapshot(), null, `${raw} must not be exposed as a snapshot`);
  }

  const cyclic = {};
  cyclic.self = cyclic;
  assert.equal(store.writeSnapshot(cyclic), false, 'serialization errors are reported as false');
  assert.equal(loadStore('core/sprinkler-bridge-store.js', { exportName: 'RySprinklerBridgeStore', getError: true })
    .store.readSnapshot(), null);
  assert.equal(loadStore('core/sprinkler-bridge-store.js', { exportName: 'RySprinklerBridgeStore', removeError: true })
    .store.removeSnapshot(), false);

  const failedSet = loadStore('core/sprinkler-bridge-store.js', { exportName: 'RySprinklerBridgeStore', setError: true });
  failedSet.values.set(failedSet.store.key, 'previous snapshot');
  assert.equal(failedSet.store.writeSnapshot({ fresh: true }), false);
  assert.equal(failedSet.values.has(failedSet.store.key), false,
    'the old snapshot has already been removed when replacement set fails');
  assert.deepEqual(failedSet.calls.slice(-2).map(call => call[0]), ['remove', 'set']);
});

test('data service refuses to update an ambiguous duplicate plot id', () => {
  const source = fs.readFileSync(path.join(ROOT, 'core/data-service.js'), 'utf8')
    .replace(/^export\s+/gm, '');
  const values = new Map();
  const context = {
    localStorage: {
      getItem(key) { return values.has(key) ? values.get(key) : null; },
      setItem(key, value) { values.set(key, String(value)); }
    },
    window: { dispatchEvent() {} },
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init.detail; },
    JSON, Date, Math, Number, String, Object, Array, isFinite, console
  };
  vm.createContext(context);
  vm.runInContext(source + '\nglobalThis.__createDataService = createDataService;', context,
    { filename: 'core/data-service.js' });
  const original = [
    { id: 'duplicate', name: 'A', sqm: 1000, polyLatLng: [[1, 1], [1, 2], [2, 2]] },
    { id: 'duplicate', name: 'B', sqm: 2000, polyLatLng: [[3, 3], [3, 4], [4, 4]] }
  ];
  values.set('runye_plot_library', JSON.stringify(original));
  const result = context.__createDataService().mutateLayer('source', {
    id: 'duplicate', name: 'changed', sqm: 3000,
    polyLatLng: [[5, 5], [5, 6], [6, 6]]
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { ok: false, error: 'duplicate-plot-id' });
  assert.deepEqual(JSON.parse(values.get('runye_plot_library')), original,
    'ambiguous source update must leave every library entry unchanged');
});
