'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const ROOT = path.join(__dirname, '..');
const PROJECT_KEY = 'runye_irrigation_saved_project_v1';

function createContext(plots, options = {}) {
  const localValues = new Map();
  const sessionValues = new Map();
  const windowListeners = new Map();
  const timeoutQueue = [];
  const localStorage = {
    getItem(key) { return localValues.has(key) ? localValues.get(key) : null; },
    setItem(key, value) { localValues.set(key, String(value)); },
    removeItem(key) { localValues.delete(key); }
  };
  const sessionStorage = {
    getItem(key) { return sessionValues.has(key) ? sessionValues.get(key) : null; },
    setItem(key, value) {
      if (options.failAnchorWrite && key === 'runye_current_plot_tab_v1') throw new Error('session storage unavailable');
      sessionValues.set(key, String(value));
    },
    removeItem(key) { sessionValues.delete(key); }
  };
  const document = {
    readyState: 'loading',
    addEventListener() {},
    getElementById() { return null; },
    querySelectorAll() { return []; }
  };
  const context = {
    document,
    addEventListener(type, handler) {
      const handlers = windowListeners.get(type) || [];
      handlers.push(handler);
      windowListeners.set(type, handlers);
    },
    localStorage,
    sessionStorage,
    RyPlotLibraryStore: { read() { return { ok: true, plots }; } },
    RyMeasuredAreaBridgeStore: { readRaw() { return null; } },
    tlNormalizePipeOverride() { return null; },
    tlAppliedPipeOverride() { return false; },
    renderThreeLevel() {},
    console,
    Date,
    JSON,
    Math,
    alert() {},
    setTimeout(callback) { timeoutQueue.push(callback); return timeoutQueue.length; }
  };
  context.window = context;
  vm.createContext(context);
  if (!options.omitIrrigationStore) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'core/irrigation-data-store.js'), 'utf8'), context,
      { filename: 'core/irrigation-data-store.js' });
  }
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'mod/inline-12.js'), 'utf8'), context,
    { filename: 'mod/inline-12.js' });
  return { context, localValues, sessionValues, windowListeners, timeoutQueue };
}

function setAnchor(fixture, id) {
  fixture.context.RyIrrigationDataStore.writeCurrentPlotAnchor(id);
}

function seedNetworks(fixture) {
  fixture.context.RyIrrigationDataStore.writeNetworkLayout({ plotId: 'plot-a', marker: 'A' }, 'plot-a');
  fixture.context.RyIrrigationDataStore.writeNetworkLayout({ plotId: 'plot-b', marker: 'B' }, 'plot-b');
}

function loadSnapshot(fixture, snapshot) {
  fixture.localValues.set(PROJECT_KEY, JSON.stringify(snapshot));
  fixture.context.runyeLoadProject({ key: PROJECT_KEY, silent: true });
}

function fireLoad(fixture) {
  for (const handler of fixture.windowListeners.get('load') || []) handler();
  while (fixture.timeoutQueue.length) fixture.timeoutQueue.shift()();
}

test('project restore switches the current network scope to its uniquely bound plot', () => {
  const fixture = createContext([{ id: 'plot-a' }, { id: 'plot-b' }]);
  seedNetworks(fixture);
  setAnchor(fixture, 'plot-b');

  loadSnapshot(fixture, { currentPlotId: 'plot-a', measuredArea: 1200, measuredPolygon: [{ x: 1, y: 2 }] });

  assert.equal(fixture.context.currentPlotId, 'plot-a');
  assert.equal(fixture.context.RyIrrigationDataStore.readCurrentPlotAnchor().id, 'plot-a');
  assert.deepEqual(JSON.parse(JSON.stringify(fixture.context.RyIrrigationDataStore.readNetworkLayout())), {
    plotId: 'plot-a', marker: 'A'
  });
});

test('missing, deleted, or ambiguous saved plot IDs restore unbound and cannot expose the prior plot network', () => {
  for (const { plots, snapshot } of [
    { plots: [{ id: 'plot-b' }], snapshot: { currentPlotId: 'deleted-plot', measuredArea: 2000, measuredPolygon: [{ x: 3, y: 4 }] } },
    { plots: [{ id: 'plot-b' }], snapshot: { measuredArea: 3000, measuredPolygon: [{ x: 5, y: 6 }] } },
    { plots: [{ id: 'plot-a' }, { id: 'plot-a' }, { id: 'plot-b' }], snapshot: { currentPlotId: 'plot-a', measuredArea: 4000, measuredPolygon: [{ x: 7, y: 8 }] } }
  ]) {
    const fixture = createContext(plots);
    seedNetworks(fixture);
    setAnchor(fixture, 'plot-b');

    loadSnapshot(fixture, snapshot);

    assert.equal(fixture.context.currentPlotId, null);
    assert.equal(fixture.context.RyIrrigationDataStore.readCurrentPlotAnchor().id, null);
    assert.equal(fixture.context.RyIrrigationDataStore.readNetworkLayout(), null,
      'an unbound restored project must not read the previously active plot network');
    assert.deepEqual(JSON.parse(JSON.stringify(fixture.context.measuredPolygon)), snapshot.measuredPolygon);
  }
});

test('project restore stops before changing project state when the per-tab plot anchor cannot be written', () => {
  const fixture = createContext([{ id: 'plot-a' }, { id: 'plot-b' }], { failAnchorWrite: true });
  fixture.context.currentPlotId = 'plot-b';
  fixture.context.measuredPolygon = [{ x: 9, y: 9 }];
  fixture.localValues.set('runye_current_plot_v1', JSON.stringify({ id: 'plot-b', ts: 1 }));

  loadSnapshot(fixture, { currentPlotId: 'plot-a', measuredArea: 1200, measuredPolygon: [{ x: 1, y: 2 }] });

  assert.equal(fixture.context.currentPlotId, 'plot-b');
  assert.deepEqual(JSON.parse(JSON.stringify(fixture.context.measuredPolygon)), [{ x: 9, y: 9 }]);
  assert.equal(fixture.context.measuredArea, undefined);
});

test('project restore fails closed when the per-tab anchor adapter is unavailable', () => {
  const fixture = createContext([{ id: 'plot-a' }, { id: 'plot-b' }], { omitIrrigationStore: true });
  fixture.context.currentPlotId = 'plot-b';
  fixture.context.measuredPolygon = [{ x: 9, y: 9 }];
  const oldSharedAnchor = JSON.stringify({ id: 'plot-b', ts: 1 });
  fixture.localValues.set('runye_current_plot_v1', oldSharedAnchor);

  loadSnapshot(fixture, { currentPlotId: 'plot-a', measuredArea: 1200, measuredPolygon: [{ x: 1, y: 2 }] });

  assert.equal(fixture.context.currentPlotId, 'plot-b');
  assert.deepEqual(JSON.parse(JSON.stringify(fixture.context.measuredPolygon)), [{ x: 9, y: 9 }]);
  assert.equal(fixture.localValues.get('runye_current_plot_v1'), oldSharedAnchor,
    'the project loader must not bypass the per-tab adapter and rewrite the shared default');
});

test('automatic project restore does not use the shared anchor when the per-tab adapter is unavailable', () => {
  const fixture = createContext([{ id: 'plot-a' }], { omitIrrigationStore: true });
  fixture.context.currentPlotId = 'plot-b';
  fixture.context.measuredPolygon = [{ x: 9, y: 9 }];
  fixture.localValues.set('runye_current_plot_v1', JSON.stringify({ id: 'plot-a', ts: 1 }));
  fixture.localValues.set(PROJECT_KEY, JSON.stringify({
    currentPlotId: 'plot-a', measuredArea: 1200, measuredPolygon: [{ x: 1, y: 2 }]
  }));

  fireLoad(fixture);

  assert.equal(fixture.context.currentPlotId, 'plot-b');
  assert.deepEqual(JSON.parse(JSON.stringify(fixture.context.measuredPolygon)), [{ x: 9, y: 9 }]);
  assert.equal(fixture.context.__runyeAutoRestored, undefined);
});

test('project restore stops before changing project state when the plot library cannot verify ownership', () => {
  const fixture = createContext([{ id: 'plot-a' }, { id: 'plot-b' }]);
  setAnchor(fixture, 'plot-b');
  fixture.context.currentPlotId = 'plot-b';
  fixture.context.measuredPolygon = [{ x: 9, y: 9 }];
  fixture.context.RyPlotLibraryStore.read = () => ({ ok: false, error: 'plot-library-read-failed' });

  loadSnapshot(fixture, { currentPlotId: 'plot-a', measuredArea: 1200, measuredPolygon: [{ x: 1, y: 2 }] });

  assert.equal(fixture.context.currentPlotId, 'plot-b');
  assert.equal(fixture.context.RyIrrigationDataStore.readCurrentPlotAnchor().id, 'plot-b');
  assert.deepEqual(JSON.parse(JSON.stringify(fixture.context.measuredPolygon)), [{ x: 9, y: 9 }]);
  assert.equal(fixture.context.measuredArea, undefined);
});
