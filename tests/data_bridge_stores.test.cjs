'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadStore(file, options = {}) {
  const values = options.values || new Map();
  const sessionValues = options.sessionValues || new Map();
  const calls = [];
  const sessionCalls = [];
  const storage = {
    getItem(key) {
      calls.push(['get', key]);
      if (options.getError) throw new Error('get failed');
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      calls.push(['set', key, value]);
      if (options.setError === true || (typeof options.setError === 'function' && options.setError(key, String(value))))
        throw new Error('set failed');
      values.set(key, String(value));
    },
    removeItem(key) {
      calls.push(['remove', key]);
      if (options.removeError) throw new Error('remove failed');
      values.delete(key);
    }
  };
  const sessionStorage = {
    getItem(key) {
      sessionCalls.push(['get', key]);
      if (options.sessionGetError) throw new Error('session get failed');
      return sessionValues.has(key) ? sessionValues.get(key) : null;
    },
    setItem(key, value) {
      sessionCalls.push(['set', key, value]);
      if (options.sessionSetError) throw new Error('session set failed');
      sessionValues.set(key, String(value));
    },
    removeItem(key) {
      sessionCalls.push(['remove', key]);
      if (options.sessionRemoveError) throw new Error('session remove failed');
      sessionValues.delete(key);
    }
  };
  const context = { localStorage: storage, sessionStorage, JSON, console };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, { filename: file });
  return { store: context[options.exportName], values, calls, sessionValues, sessionCalls };
}

function json(value) { return JSON.stringify(value); }

test('economic settings store preserves legacy keys, merges assumptions, and replaces/clears price overrides', () => {
  const { store, values, calls } = loadStore('core/economic-settings-store.js', { exportName: 'RyEconomicSettingsStore' });
  assert.deepEqual(JSON.parse(JSON.stringify(store.keys)), {
    assumptions: 'runye_tlEconAssum', prices: 'runye_tlEconPrices'
  });
  values.set(store.keys.assumptions, json({ price: 0.65, pf: 4, future: 'keep' }));
  assert.deepEqual(JSON.parse(JSON.stringify(store.readAssumptions())), { price: 0.65, pf: 4, future: 'keep' });
  assert.equal(store.patchAssumptions({ hours: 1200, pf: 0, years: -1 }), true);
  assert.deepEqual(JSON.parse(values.get(store.keys.assumptions)), { price: 0.65, future: 'keep', hours: 1200 });
  assert.equal(store.writePriceOverrides({ 110: 24, 140: 37 }), true);
  assert.deepEqual(JSON.parse(JSON.stringify(store.readPriceOverrides())), { 110: 24, 140: 37 });
  assert.equal(store.clearPriceOverrides(), true);
  assert.equal(values.has(store.keys.prices), false);
  assert.deepEqual(calls.filter(call => call[0] === 'set').map(call => call[1]), [store.keys.assumptions, store.keys.prices]);
});

test('economic settings store preserves legacy forgiving reads and reports storage write failures', () => {
  const broken = loadStore('core/economic-settings-store.js', { exportName: 'RyEconomicSettingsStore' });
  broken.values.set(broken.store.keys.assumptions, '{bad json');
  assert.deepEqual(JSON.parse(JSON.stringify(broken.store.readAssumptions())), {});
  assert.deepEqual(JSON.parse(JSON.stringify(loadStore('core/economic-settings-store.js', {
    exportName: 'RyEconomicSettingsStore', getError: true
  }).store.readPriceOverrides())), {});
  assert.equal(loadStore('core/economic-settings-store.js', { exportName: 'RyEconomicSettingsStore', setError: true })
    .store.patchAssumptions({ price: 1 }), false);
  assert.equal(loadStore('core/economic-settings-store.js', { exportName: 'RyEconomicSettingsStore', removeError: true })
    .store.clearPriceOverrides(), false);
});

function loadDataService(windowOverrides = {}) {
  const source = fs.readFileSync(path.join(ROOT, 'core/data-service.js'), 'utf8')
    .replace(/^export\s+/gm, '');
  const window = Object.assign({ dispatchEvent() {} }, windowOverrides);
  const context = {
    window,
    localStorage: { getItem() { return null; }, setItem() {} },
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init && init.detail; },
    JSON, Date, Math, Number, String, Object, Array, isFinite, console
  };
  vm.createContext(context);
  vm.runInContext(source + '\nglobalThis.__createDataService = createDataService;', context,
    { filename: 'core/data-service.js' });
  return { service: context.__createDataService(), window };
}

function builtinHazen(L, Q, d, C) {
  return 1.113e9 * L * Math.pow(Q, 1.852) / (Math.pow(C, 1.852) * Math.pow(d, 4.87));
}

// These bridges intentionally have different exception and lifecycle contracts.
// Keep each assertion against the real classic-script implementation.
const irrigationKeys = {
  networkLayout: 'runye_network_layout',
  networkLayoutByPlot: 'runye_network_layout_by_plot_v1:',
  hydraulicDesign: 'runye_hydraulic_design_v1',
  hydraulicDesignByPlot: 'runye_hydraulic_design_by_plot_v1:',
  hydraulicOverlay: 'runye_hydraulic_overlay_v1',
  hydraulicOverlayByPlot: 'runye_hydraulic_overlay_by_plot_v1:',
  currentPlotAnchor: 'runye_current_plot_v1',
  currentPlotAnchorByTab: 'runye_current_plot_tab_v1'
};

test('data service uses the built-in Hazen fallback and validates its inputs', () => {
  const { service } = loadDataService({ C_HAZEN: 145 });
  const input = { L: 120, Q: 18, d: 140, C: 145 };
  const expected = Math.round(builtinHazen(input.L, input.Q, input.d, input.C) * 10000) / 10000;

  assert.equal(service.hazenDefaults().engine, 'builtin');
  assert.equal(service.hazenDefaults().C, 145);
  assert.equal(service.hazenLoss(input), expected);
  assert.equal(service.invertHazenC({ ...input, hf: builtinHazen(input.L, input.Q, input.d, input.C) }), 145);
  for (const invalid of [
    {}, { ...input, L: 0 }, { ...input, Q: -1 }, { ...input, d: 0 }, { ...input, C: 0 }
  ]) assert.equal(service.hazenLoss(invalid), null);
  assert.equal(service.invertHazenC({ ...input, hf: 0 }), null);
});

test('data service detects a dynamically loaded or removed hydraulic core on each call', () => {
  const { service, window } = loadDataService();
  const input = { L: 120, Q: 18, d: 140, C: 150 };
  const fallback = Math.round(builtinHazen(input.L, input.Q, input.d, input.C) * 10000) / 10000;
  assert.equal(service.hazenDefaults().engine, 'builtin');
  assert.equal(service.hazenLoss(input), fallback);

  let calls = 0;
  window.RyHcCore = { hazen() { calls++; return 12.345678; } };
  assert.equal(service.hazenDefaults().engine, 'hc-core');
  assert.equal(service.hazenLoss(input), 12.3457);
  assert.equal(calls, 1);

  delete window.RyHcCore;
  assert.equal(service.hazenDefaults().engine, 'builtin');
  assert.equal(service.hazenLoss(input), fallback);
});

test('data service falls back when the hydraulic core accessor is incomplete or throws', () => {
  const { service, window } = loadDataService();
  const input = { L: 120, Q: 18, d: 140, C: 150 };
  const fallback = Math.round(builtinHazen(input.L, input.Q, input.d, input.C) * 10000) / 10000;

  window.RyHcCore = {};
  assert.equal(service.hazenDefaults().engine, 'builtin');
  assert.equal(service.hazenLoss(input), fallback);

  Object.defineProperty(window, 'RyHcCore', { configurable: true, get() { throw new Error('not ready'); } });
  assert.equal(service.hazenDefaults().engine, 'builtin');
  assert.equal(service.hazenLoss(input), fallback);
});

test('data service resolves plot references through the shared plot-library store', () => {
  const plot = { id: 'plot-1', name: 'North', sqm: 1000, polyLatLng: [[1, 1], [1, 2], [2, 2]] };
  let reads = 0;
  const { service } = loadDataService({
    currentPlotId: plot.id,
    RyPlotLibraryStore: { read() { reads++; return { ok: true, plots: [plot], revision: 'v1' }; } }
  });

  const context = service.getPlotContext();
  assert.equal(reads, 1);
  assert.equal(context.id, plot.id);
  assert.equal(context.name, plot.name);
  assert.deepEqual(JSON.parse(JSON.stringify(context.source)), plot);
});

test('Irrigation data store preserves fixed keys, JSON roundtrips, and nullish deletion', () => {
  const { store, values } = loadStore('core/irrigation-data-store.js', { exportName: 'RyIrrigationDataStore' });
  assert.deepEqual(JSON.parse(JSON.stringify(store.keys)), irrigationKeys);

  const projectPlots = [{ id: 'plot-a' }, { id: 'plot-b' }];
  assert.deepEqual(JSON.parse(JSON.stringify(store.validateNetworkPlotBinding(null, projectPlots))),
    { ok: true, status: 'missing', plotId: null });
  assert.deepEqual(JSON.parse(JSON.stringify(store.validateNetworkPlotBinding({ plotId: null }, projectPlots))),
    { ok: true, status: 'unbound', plotId: null }, 'legacy ownerless networks remain importable but are not authorized for map rendering');
  assert.deepEqual(JSON.parse(JSON.stringify(store.validateNetworkPlotBinding({ plotId: 'plot-a' }, projectPlots))),
    { ok: true, status: 'bound', plotId: 'plot-a' });
  assert.equal(store.validateNetworkPlotBinding({ plotId: 'plot-c' }, projectPlots).error, 'network-plot-not-in-project');
  assert.equal(store.validateNetworkPlotBinding({ plotId: 'plot-a' }, [{ id: 'plot-a' }, { id: 'plot-a' }]).error,
    'network-plot-ambiguous');
  assert.equal(store.validateNetworkPlotBinding({ plotId: 'plot-a' }, null).error, 'plot-library-unavailable');
  assert.equal(store.validateNetworkPlotBinding([], projectPlots).error, 'invalid-network-layout');

  const layout = { segments: [{ id: 'main-1', od: 200 }], plotId: 'plot-a' };
  const design = { version: 1, plotId: 'plot-a', flow: 12.5, pump: { head: 30 } };
  const overlay = { version: 2, networkTs: 123, plotId: 'plot-a', designRevisionId: 'rev-a', items: { 'main-1': { status: 'ok' } } };
  const networkAKey = irrigationKeys.networkLayoutByPlot + encodeURIComponent('plot-a');
  const designAKey = irrigationKeys.hydraulicDesignByPlot + encodeURIComponent('plot-a');
  const overlayAKey = irrigationKeys.hydraulicOverlayByPlot + encodeURIComponent('plot-a');
  assert.equal(store.writeNetworkLayout(layout), true);
  assert.equal(store.writeHydraulicDesign(design), true);
  assert.equal(store.writeHydraulicOverlay(overlay), true);
  assert.equal(values.get(networkAKey), json(layout));
  assert.equal(values.get(designAKey), json(design));
  assert.equal(values.get(overlayAKey), json(overlay));
  assert.equal(values.has(irrigationKeys.networkLayout), false, 'new owner-bound snapshots do not use the shared legacy slot');
  assert.equal(store.readNetworkLayout(), null, 'without an active plot, current-network reads fail closed');
  assert.equal(store.readHydraulicDesign(), null, 'without an active plot, current-design reads fail closed');
  values.set(irrigationKeys.currentPlotAnchor, json({ id: 'plot-a' }));
  assert.equal(json(store.readNetworkLayout()), json(layout));
  assert.equal(store.readRawNetworkLayout(), json(layout));
  assert.equal(json(store.readHydraulicDesign()), json(design));
  values.set(irrigationKeys.currentPlotAnchor, json({ id: 'plot-b' }));
  assert.equal(store.readNetworkLayout(), null, 'a plot without its own network cannot inherit another plot network');
  assert.equal(store.readHydraulicDesign(), null, 'a plot without its own design cannot inherit another plot design');
  const layoutB = { segments: [{ id: 'branch-b', od: 110 }], plotId: 'plot-b' };
  const designB = { version: 1, plotId: 'plot-b', flow: 5 };
  assert.equal(store.writeNetworkLayout(layoutB), true);
  assert.equal(store.writeHydraulicDesign(designB), true);
  assert.equal(json(store.readNetworkLayoutForPlot('plot-a')), json(layout),
    'explicit per-plot reads remain bound to their requested owner when another tab changes the shared anchor');
  assert.equal(json(store.readNetworkLayout()), json(layoutB),
    'an explicit read for another plot must not change the shared current-plot read');
  values.set(irrigationKeys.currentPlotAnchor, json({ id: 'plot-a' }));
  assert.equal(json(store.readNetworkLayout()), json(layout), 'switching the active plot preserves its previous network');
  assert.equal(json(store.readHydraulicDesign()), json(design), 'switching the active plot preserves its previous design');
  const linkedDesign = { version: 1, ts: 101, plotId: 'plot-a' };
  store.writeHydraulicDesign(linkedDesign);
  assert.equal(store.readHydraulicDesignStateForNetwork({ plotId: 'plot-a', designTs: 101 }).status, 'current');
  assert.equal(store.readHydraulicDesignStateForNetwork({ plotId: 'plot-a', designTs: 100 }).reason, 'design-timestamp-mismatch');
  assert.equal(store.readHydraulicDesignStateForNetwork({ plotId: 'plot-b', designTs: 101 }).reason, 'design-timestamp-mismatch',
    'design status is read from the matching plot scope before validating its own timestamp');
  assert.equal(store.readHydraulicDesignStateForNetwork({ designTs: 101 }).reason, 'plot-id-mismatch',
    'a timestamp match must not bypass a missing network plot identity');
  store.writeHydraulicDesign({ version: 1, ts: 101, plotId: 'plot-a', designRevisionId: 'rev-1' });
  assert.equal(store.readHydraulicDesignStateForNetwork({ plotId: 'plot-a', designTs: 101, designRevisionId: 'rev-1' }).status, 'current');
  assert.equal(store.readHydraulicDesignStateForNetwork({ plotId: 'plot-a', designTs: 101, designRevisionId: 'rev-2' }).reason, 'design-revision-mismatch');
  assert.equal(store.readHydraulicDesignStateForNetwork({ plotId: 'plot-a', designTs: 101 }).reason, 'design-revision-mismatch',
    'a network without the design revision must not consume a revision-bound design');
  assert.equal(store.readHydraulicDesignStateForNetwork({ plotId: 'plot-a', designTs: 101, needsReplan: true }).reason, 'network-needs-replan');
  assert.equal(store.readHydraulicDesignStateForNetwork({ plotId: 'plot-a' }).reason, 'design-revision-mismatch');
  assert.equal(store.readHydraulicDesignStateForNetwork(null).status, 'unverified');
  store.writeHydraulicDesign({ version: 1, flow: 12.5 });
  assert.equal(store.readHydraulicDesignStateForNetwork({ needsReplan: true }).reason, 'network-needs-replan',
    'a network awaiting replanning stays blocked even if its old design snapshot was removed');
  values.set(irrigationKeys.currentPlotAnchor, json({ id: 'plot-a' }));
  assert.equal(json(store.readHydraulicOverlayForNetwork({ ts: 123, plotId: 'plot-a', designRevisionId: 'rev-a' })), json(overlay));
  values.set(irrigationKeys.currentPlotAnchor, json({ id: 'plot-b' }));
  assert.equal(store.readHydraulicOverlayForNetwork({ ts: 123, plotId: 'plot-b', designRevisionId: 'rev-a' }), null,
    'an overlay from another plot is rejected even if its timestamp collides and the other plot is active');
  values.set(irrigationKeys.currentPlotAnchor, json({ id: 'plot-a' }));
  assert.equal(store.readHydraulicOverlayForNetwork({ ts: 123, plotId: 'plot-b', designRevisionId: 'rev-a' }), null,
    'a network from another active-plot identity cannot receive the overlay');
  assert.equal(store.readHydraulicOverlayForNetwork({ ts: 123, plotId: 'plot-a', designRevisionId: 'rev-b' }), null,
    'an overlay from another design revision is rejected');
  assert.equal(store.readHydraulicOverlayForNetwork({ ts: 124, plotId: 'plot-a', designRevisionId: 'rev-a' }), null,
    'an overlay from another network revision is rejected');
  assert.equal(store.readHydraulicOverlayForNetwork({ ts: 123, plotId: 'plot-a' }), null,
    'legacy or incomplete overlays fail closed');
  assert.equal(store.readHydraulicOverlayForNetwork({}), null, 'a network without a revision cannot accept an overlay');

  assert.equal(store.readNetworkLayoutStateForCurrentPlot({ plotId: 'plot-a' }).status, 'current');
  assert.equal(store.readNetworkLayoutStateForCurrentPlot({ plotId: 'plot-b' }).reason, 'active-plot-mismatch');
  assert.equal(store.readNetworkLayoutStateForCurrentPlot({ plotId: null }).reason, 'network-plot-unbound',
    'a legacy network without an owner must never be treated as current');
  values.set(irrigationKeys.currentPlotAnchor, '{bad json');
  assert.equal(store.readNetworkLayoutStateForCurrentPlot({ plotId: 'plot-a' }).reason, 'active-plot-unavailable',
    'an unreadable active plot anchor must not authorize a network snapshot');
  values.set(irrigationKeys.currentPlotAnchor, 'null');
  assert.equal(store.readNetworkLayoutStateForCurrentPlot({ plotId: 'plot-a' }).reason, 'active-plot-unavailable',
    'a bound network must not be treated as current when there is no active plot');
  values.set(irrigationKeys.networkLayout, json({ plotId: 'plot-a', segments: [{ id: 'legacy-main' }] }));
  values.set(irrigationKeys.hydraulicDesign, json({ version: 1, plotId: 'plot-a', flow: 12.5 }));
  assert.equal(store.readNetworkLayout(), null, 'an owner-bound legacy network is not a current read without an active plot');
  assert.equal(store.readHydraulicDesign(), null, 'an owner-bound legacy design is not a current read without an active plot');
  assert.equal(store.readHydraulicOverlayForNetwork({ ts: 123, plotId: null, designRevisionId: null }), null,
    'an unowned network cannot receive a saved hydraulic overlay');
  assert.equal(store.readNetworkLayoutStateForCurrentPlot(null).status, 'missing');

  values.set(irrigationKeys.currentPlotAnchor, json({ id: 'plot-a' }));
  assert.equal(store.writeNetworkLayout(null), true);
  assert.equal(values.has(networkAKey), false);
  assert.deepEqual(JSON.parse(JSON.stringify(store.restoreNetworkLayoutIfCurrent(null, json(layout), 'plot-a'))), { ok: true });
  assert.equal(values.get(networkAKey), json(layout), 'rollback restores the exact previous plot-scoped snapshot');
  assert.deepEqual(JSON.parse(JSON.stringify(store.restoreNetworkLayoutIfCurrent(null, null, 'plot-a'))), { ok: false, error: 'network-layout-conflict' });
  assert.deepEqual(JSON.parse(JSON.stringify(store.restoreNetworkLayoutIfCurrent(undefined, null, 'plot-a'))), { ok: false, error: 'invalid-network-layout-snapshot' });
  assert.deepEqual(JSON.parse(JSON.stringify(store.restoreNetworkLayoutIfCurrent(json(layout), null, 'plot-a'))), { ok: true });
  assert.equal(values.has(networkAKey), false);
  assert.equal(store.writeHydraulicDesign(undefined), true);
  assert.equal(values.has(designAKey), false, 'deleting the active plot design leaves the ownerless legacy slot untouched');
  assert.equal(store.writeHydraulicOverlay(null), true);
  assert.equal(values.has(overlayAKey), false);
});

test('current plot identity stays isolated per tab while the legacy anchor seeds new tabs', () => {
  const sharedValues = new Map();
  const tabAValues = new Map();
  const tabBValues = new Map();
  sharedValues.set(irrigationKeys.currentPlotAnchor, json({ id: 'plot-b' }));
  sharedValues.set(irrigationKeys.networkLayoutByPlot + encodeURIComponent('plot-a'), json({ plotId: 'plot-a', segments: ['A'] }));
  sharedValues.set(irrigationKeys.networkLayoutByPlot + encodeURIComponent('plot-b'), json({ plotId: 'plot-b', segments: ['B'] }));

  const tabA = loadStore('core/irrigation-data-store.js', {
    exportName: 'RyIrrigationDataStore', values: sharedValues, sessionValues: tabAValues
  }).store;
  const tabB = loadStore('core/irrigation-data-store.js', {
    exportName: 'RyIrrigationDataStore', values: sharedValues, sessionValues: tabBValues
  }).store;

  assert.equal(tabA.readCurrentPlotAnchor().id, 'plot-b', 'a fresh tab can use the legacy shared default');
  assert.equal(tabA.writeCurrentPlotAnchor('plot-a'), true);
  assert.equal(tabB.writeCurrentPlotAnchor('plot-b'), true);
  assert.equal(tabA.readCurrentPlotAnchor().id, 'plot-a');
  assert.equal(tabB.readCurrentPlotAnchor().id, 'plot-b');
  assert.deepEqual(JSON.parse(JSON.stringify(tabA.readNetworkLayout())), { plotId: 'plot-a', segments: ['A'] });
  assert.deepEqual(JSON.parse(JSON.stringify(tabB.readNetworkLayout())), { plotId: 'plot-b', segments: ['B'] });

  assert.equal(tabA.writeCurrentPlotAnchor(null), true);
  assert.equal(tabA.readCurrentPlotAnchor().id, null, 'an explicit cleared tab anchor must not fall back to another tab default');
  assert.equal(tabA.readNetworkLayout(), null);
  assert.equal(tabB.readCurrentPlotAnchor().id, 'plot-b', 'clearing tab A does not clear tab B identity');
});

test('current plot anchor storage errors fail closed without changing the shared default', () => {
  const values = new Map([[irrigationKeys.currentPlotAnchor, json({ id: 'plot-b' })]]);
  const brokenRead = loadStore('core/irrigation-data-store.js', {
    exportName: 'RyIrrigationDataStore', values, sessionGetError: true
  }).store;
  assert.deepEqual(JSON.parse(JSON.stringify(brokenRead.readCurrentPlotAnchor())), { ok: false, id: null });
  assert.equal(brokenRead.readNetworkLayout(), null);

  const brokenWrite = loadStore('core/irrigation-data-store.js', {
    exportName: 'RyIrrigationDataStore', values, sessionSetError: true
  }).store;
  assert.equal(brokenWrite.writeCurrentPlotAnchor('plot-a'), false);
  assert.equal(values.get(irrigationKeys.currentPlotAnchor), json({ id: 'plot-b' }),
    'a failed per-tab write must not silently redirect the shared default');
});

test('Irrigation data store returns null for read/parse failures but lets write failures throw', () => {
  const brokenJson = loadStore('core/irrigation-data-store.js', { exportName: 'RyIrrigationDataStore' });
  brokenJson.values.set(irrigationKeys.networkLayout, '{bad json');
  assert.equal(brokenJson.store.readNetworkLayout(), null);
  assert.equal(loadStore('core/irrigation-data-store.js', { exportName: 'RyIrrigationDataStore', getError: true })
    .store.readHydraulicDesign(), null);
  assert.equal(loadStore('core/irrigation-data-store.js', { exportName: 'RyIrrigationDataStore', getError: true })
    .store.readHydraulicOverlayForNetwork({ ts: 123 }), null);

  const failedSet = loadStore('core/irrigation-data-store.js', { exportName: 'RyIrrigationDataStore', setError: true });
  assert.throws(() => failedSet.store.writeNetworkLayout({ segments: [] }), /set failed/);
  const failedRemove = loadStore('core/irrigation-data-store.js', { exportName: 'RyIrrigationDataStore', removeError: true });
  assert.throws(() => failedRemove.store.writeHydraulicDesign(null), /remove failed/);
  assert.throws(() => failedSet.store.writeHydraulicOverlay({ version: 1 }), /set failed/);
});

test('Irrigation scoped stores preserve matching legacy data and refuse ownerless deletion of bound legacy data', () => {
  const { store, values } = loadStore('core/irrigation-data-store.js', { exportName: 'RyIrrigationDataStore' });
  const legacy = { plotId: 'plot-a', segments: [{ id: 'legacy-main' }] };
  values.set(irrigationKeys.networkLayout, json(legacy));
  assert.equal(store.writeNetworkLayout(null), false,
    'without an active plot, a clear operation must not erase a bound legacy network');
  assert.equal(values.get(irrigationKeys.networkLayout), json(legacy));

  values.set(irrigationKeys.currentPlotAnchor, json({ id: 'plot-a' }));
  assert.equal(json(store.readNetworkLayout()), json(legacy), 'a legacy slot remains readable by its matching owner');
  const ownerless = { plotId: null, segments: [{ id: 'legacy-unbound' }] };
  assert.equal(store.writeNetworkLayout(ownerless), true);
  const scopedLegacyKey = irrigationKeys.networkLayoutByPlot + encodeURIComponent('plot-a');
  assert.equal(values.get(scopedLegacyKey), json(legacy), 'legacy bound bytes are copied before the global slot is reused');
  assert.equal(values.get(irrigationKeys.networkLayout), json(ownerless));
  assert.equal(json(store.readNetworkLayout()), json(legacy), 'matching scoped legacy data takes precedence over the reused global slot');
  values.set(irrigationKeys.currentPlotAnchor, json({ id: 'plot-b' }));
  assert.equal(store.readNetworkLayout(), null, 'current reads do not fall back to an ownerless legacy record');
  assert.equal(json(store.readNetworkLayoutForPlot(null)), json(ownerless), 'explicit migration reads can still inspect ownerless legacy data');
  assert.equal(store.readNetworkLayoutStateForCurrentPlot(store.readNetworkLayoutForPlot(null)).reason, 'network-plot-unbound');
});

test('Irrigation scoped writes reject mismatched owners and protect bound legacy slots from explicit ownerless deletion', () => {
  const { store, values } = loadStore('core/irrigation-data-store.js', { exportName: 'RyIrrigationDataStore' });
  const network = { plotId: 'plot-a', segments: [{ id: 'main-a' }] };
  const design = { version: 1, plotId: 'plot-a', flow: 12.5 };
  const overlay = { version: 2, plotId: 'plot-a', networkTs: 1, designRevisionId: 'rev-a', items: {} };

  assert.equal(store.writeNetworkLayout(network, 'plot-b'), false,
    'an explicit network destination must match the payload plot owner');
  assert.equal(store.writeHydraulicDesign(design, 'plot-b'), false,
    'an explicit design destination must match the payload plot owner');
  assert.equal(store.writeHydraulicOverlay(overlay, 'plot-b'), false,
    'an explicit overlay destination must match the payload plot owner');
  assert.equal(values.size, 0, 'rejected mismatched writes must not create or alter any slot');

  values.set(irrigationKeys.networkLayout, json(network));
  values.set(irrigationKeys.hydraulicDesign, json(design));
  assert.equal(store.writeNetworkLayout(null, null), false,
    'an explicit ownerless clear must not erase a legacy network owned by another plot');
  assert.equal(store.writeHydraulicDesign(null, null), false,
    'an explicit ownerless clear must not erase a legacy design owned by another plot');
  assert.equal(values.get(irrigationKeys.networkLayout), json(network));
  assert.equal(values.get(irrigationKeys.hydraulicDesign), json(design));
});

test('Irrigation scoped reads reject a scoped snapshot whose embedded owner disagrees with its key', () => {
  const { store, values } = loadStore('core/irrigation-data-store.js', { exportName: 'RyIrrigationDataStore' });
  const networkAKey = irrigationKeys.networkLayoutByPlot + encodeURIComponent('plot-a');
  const designAKey = irrigationKeys.hydraulicDesignByPlot + encodeURIComponent('plot-a');
  values.set(networkAKey, json({ plotId: 'plot-b', segments: [{ id: 'wrong-owner' }] }));
  values.set(designAKey, json({ version: 1, plotId: 'plot-b', flow: 99 }));
  values.set(irrigationKeys.networkLayout, json({ plotId: 'plot-a', segments: [{ id: 'legacy-a' }] }));
  values.set(irrigationKeys.hydraulicDesign, json({ version: 1, plotId: 'plot-a', flow: 1 }));

  assert.equal(store.readNetworkLayoutForPlot('plot-a'), null,
    'a conflicting scoped network must fail closed instead of exposing its embedded foreign owner');
  assert.equal(store.readHydraulicDesignForPlot('plot-a'), null,
    'a conflicting scoped design must fail closed instead of exposing its embedded foreign owner');
  assert.equal(values.get(irrigationKeys.networkLayout), json({ plotId: 'plot-a', segments: [{ id: 'legacy-a' }] }),
    'a present but conflicting scoped slot must not fall back to a legacy snapshot');
});

test('Terrain bridge preserves its payload API and consumes a tab-bound handoff exactly once', () => {
  const { store, values, sessionValues } = loadStore('core/terrain-bridge-store.js', { exportName: 'RyTerrainBridgeStore' });
  const key = 'runye_terrain_incoming';
  assert.equal(store.key, key);

  const payload = { polygon: [[1, 2], [3, 4]], source: 'online-map' };
  assert.equal(store.writeIncoming(payload), true);
  const storedPayload = JSON.parse(values.get(key));
  assert.equal(storedPayload.__runyeTerrainTransferId, sessionValues.get('runye_terrain_incoming_tab_token'));
  delete storedPayload.__runyeTerrainTransferId;
  assert.deepEqual(storedPayload, payload, 'the stored object keeps the legacy payload fields at top level');
  assert.ok(sessionValues.has('runye_terrain_incoming_tab_token'));
  assert.equal(json(store.consumeIncoming()), json(payload));
  assert.equal(values.has(key), false, 'consume removes the payload before returning it');
  assert.equal(sessionValues.has('runye_terrain_incoming_tab_token'), false);
  assert.equal(store.consumeIncoming(), null, 'the same handoff cannot be consumed twice');

  const array = [{ x: 1 }, 2];
  values.set(key, json(array));
  assert.equal(json(store.consumeIncoming()), json(array), 'arrays are valid object payloads');
  assert.equal(values.has(key), false);
});

test('Terrain bridge rejects another tab handoff without deleting or importing it', () => {
  const tabA = loadStore('core/terrain-bridge-store.js', { exportName: 'RyTerrainBridgeStore' });
  const tabB = loadStore('core/terrain-bridge-store.js', { exportName: 'RyTerrainBridgeStore', values: tabA.values });
  const key = tabA.store.key;
  const plotA = { plotId: 'plot-a', poly: [[1, 2], [3, 4], [5, 6]] };
  const plotB = { plotId: 'plot-b', poly: [[7, 8], [9, 10], [11, 12]] };

  assert.equal(tabA.store.writeIncoming(plotA), true);
  assert.equal(tabB.store.consumeIncoming(), null);
  assert.ok(tabA.values.has(key), 'a non-owning tab leaves the pending payload intact');
  assert.equal(json(tabA.store.consumeIncoming()), json(plotA));

  assert.equal(tabA.store.writeIncoming(plotA), true);
  assert.equal(tabB.store.writeIncoming(plotB), true);
  assert.equal(tabA.store.consumeIncoming(), null, 'a payload overwritten by another tab is not misattributed');
  assert.equal(json(tabB.store.consumeIncoming()), json(plotB));
  assert.equal(tabA.values.has(key), false);
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

test('Sprinkler bridge uses default/custom keys, notifies by remove/set, and isolates returned snapshots', () => {
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
    'if storage rejects both the replacement and rollback writes, it cannot restore the old snapshot');

  const transientSetFailure = loadStore('core/sprinkler-bridge-store.js', {
    exportName: 'RySprinklerBridgeStore',
    setError: (key, value) => value !== 'previous snapshot'
  });
  transientSetFailure.values.set(transientSetFailure.store.key, 'previous snapshot');
  assert.equal(transientSetFailure.store.writeSnapshot({ fresh: true }), false);
  assert.equal(transientSetFailure.values.get(transientSetFailure.store.key), 'previous snapshot');
  assert.deepEqual(transientSetFailure.calls.slice(-4).map(call => call[0]), ['get', 'remove', 'set', 'set']);
});

test('Measured-area bridge preserves the fixed key, both payload shapes, and deferred one-shot removal', () => {
  const { store, values, calls } = loadStore('core/measured-area-bridge-store.js', { exportName: 'RyMeasuredAreaBridgeStore' });
  const reference = { ryPlotRef: { id: 'plot-a', savedAt: 10, areaM2: 1200 } };
  const terrain = { plotId: 'plot-b', isXY: true, poly: [{ x: 1, y: 2 }], terrainProfile: { source: 'rtk_xyz' } };
  assert.equal(store.key, 'runyeMeasuredArea');
  assert.equal(store.write(reference), true);
  assert.equal(values.get(store.key), json(reference));
  assert.equal(store.readRaw(), json(reference));
  assert.equal(json(store.read()), json(reference));
  assert.deepEqual(calls.slice(-3).map(call => call[0]), ['set', 'get', 'get']);

  assert.equal(store.write(terrain), true);
  assert.equal(json(store.read()), json(terrain), 'terrain XY payload remains unchanged');
  assert.equal(store.readRaw(), json(terrain));
  assert.equal(values.has(store.key), true, 'reading does not consume a payload before receiver validation');
  assert.equal(store.remove(), true);
  assert.equal(values.has(store.key), false);
  assert.equal(store.readRaw(), null);

  values.set(store.key, '{bad json');
  assert.equal(store.read(), null, 'map enhance fallback safely ignores corrupt data');
  assert.equal(values.has(store.key), true, 'corrupt payload stays available for explicit recovery');
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
    window: { localStorage: null, dispatchEvent() {} },
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init.detail; },
    JSON, Date, Math, Number, String, Object, Array, isFinite, console
  };
  context.window.localStorage = context.localStorage;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core/plot-library-store.js'), 'utf8'), context,
    { filename: 'core/plot-library-store.js' });
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

test('data service source upsert uses plot store and preserves existing non-source fields', () => {
  const source = fs.readFileSync(path.join(ROOT, 'core/data-service.js'), 'utf8').replace(/^export\s+/gm, '');
  const values = new Map([['runye_plot_library', JSON.stringify([
    { id: 'plot-1', name: 'North', notes: 'retain', sqm: 1000, polyLatLng: [[1, 1], [1, 2], [2, 2]] }
  ])]]);
  const localStorage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); }
  };
  const context = {
    localStorage, window: { localStorage, dispatchEvent() {} },
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init.detail; },
    JSON, Date, Math, Number, String, Object, Array, isFinite, console
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core/plot-library-store.js'), 'utf8'), context,
    { filename: 'core/plot-library-store.js' });
  vm.runInContext(source + '\nglobalThis.__createDataService = createDataService;', context,
    { filename: 'core/data-service.js' });
  const result = context.__createDataService().mutateLayer('source', {
    id: 'plot-1', name: 'Updated', sqm: 1500, polyLatLng: [[3, 3], [3, 4], [4, 4]]
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { ok: true, schemaVersion: 1 });
  assert.deepEqual(JSON.parse(values.get('runye_plot_library')), [
    { id: 'plot-1', name: 'Updated', notes: 'retain', sqm: 1500, polyLatLng: [[3, 3], [3, 4], [4, 4]] }
  ]);
});

test('map partition commit rolls back its network write when plot-library persistence fails', () => {
  const previousNetwork = JSON.stringify({ plotId: 'plot-1', ts: 10, segments: [{ id: 'main-1' }] });
  let networkRaw = previousNetwork;
  const scopedOwners = [];
  const irrigation = {
    readRawNetworkLayout(plotId) { scopedOwners.push(['read', plotId]); return networkRaw; },
    writeNetworkLayout(value) { networkRaw = JSON.stringify(value); return true; },
    restoreNetworkLayoutIfCurrent(expectedRaw, previousRaw, plotId) {
      scopedOwners.push(['restore', plotId]);
      if (networkRaw !== expectedRaw) return { ok: false, error: 'network-layout-conflict' };
      networkRaw = previousRaw;
      return { ok: true };
    }
  };
  const plotStore = {
    replace() { return { ok: false, error: 'plot-library-write-failed' }; }
  };
  const ctx = { RyIrrigationDataStore: irrigation, RyPlotLibraryStore: plotStore };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'runye-map-partition.js'), 'utf8'), ctx,
    { filename: 'runye-map-partition.js' });

  const result = ctx.RyMapPartition.commitPartitionResult(
    { plots: [{ id: 'plot-1', partitionPlan: { angle: 0 } }], revision: 'plot-library-before' },
    { plotId: 'plot-1', ts: 10, needsReplan: true }, previousNetwork
  );
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    ok: false, error: 'plot-library-write-failed', rollbackError: null
  });
  assert.equal(networkRaw, previousNetwork, 'network layout must return to its exact previous raw snapshot');
  assert.deepEqual(scopedOwners, [['read', 'plot-1'], ['restore', 'plot-1']],
    'partition rollback must compare and restore only the network slot belonging to the selected plot');
});
