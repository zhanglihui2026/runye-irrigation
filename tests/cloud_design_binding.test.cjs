const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const ringA = [[18.2,109.5],[18.2,109.501],[18.201,109.501]];
const ringB = [[18.4,109.7],[18.4,109.701],[18.401,109.701]];
const makePlot = (id, ring) => ({ id, polyLatLng: ring });

function fixture(plots) {
  const session = new Map();
  const local = new Map([['ry_cloud_plot_id', '999']]);
  let anchorId = 'local-a';
  const ctx = {
    currentPlotId: 'local-a',
    sessionStorage: {
      getItem: key => session.has(key) ? session.get(key) : null,
      setItem: (key, value) => session.set(key, value),
      removeItem: key => session.delete(key)
    },
    localStorage: {
      getItem: key => local.has(key) ? local.get(key) : null,
      setItem: (key, value) => local.set(key, value),
      removeItem: key => local.delete(key)
    },
    RyPlotLibraryStore: { read: () => ({ ok: true, plots }) },
    RyIrrigationDataStore: { readCurrentPlotAnchor: () => ({ ok: true, id: anchorId }) }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  const file = 'core/cloud-design-binding-store.js';
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx, { filename: file });
  return { ctx, session, local, setAnchor(value) { anchorId = value; } };
}

test('cloud design binding requires same imported geometry and current local plot anchor', () => {
  const plot = makePlot('local-a', ringA);
  const f = fixture([plot]);
  const store = f.ctx.RyCloudDesignBindingStore;

  assert.equal(store.beginCloudImport('42', ringA).ok, true);
  assert.equal(f.local.has('ry_cloud_plot_id'), false, 'obsolete global cloud id is removed');
  const bound = store.bindTransferredPlot(plot);
  assert.equal(bound.ok, true);
  assert.equal(bound.cloudPlotId, '42');
  assert.equal(bound.localPlotId, 'local-a');
  const resolved = store.resolveForCurrentPlot();
  assert.equal(resolved.ok, true);
  assert.equal(resolved.cloudPlotId, '42');
  assert.equal(resolved.localPlotId, 'local-a');

  f.ctx.currentPlotId = 'local-b';
  assert.equal(store.resolveForCurrentPlot().error, 'current-plot-mismatch');
  f.ctx.currentPlotId = 'local-a';
  f.setAnchor('local-b');
  assert.equal(store.resolveForCurrentPlot().error, 'current-plot-anchor-mismatch');
  f.setAnchor('local-a');

  plot.polyLatLng = ringB;
  assert.equal(store.resolveForCurrentPlot().error, 'local-plot-geometry-mismatch');
});

test('new or invalid cloud imports cannot inherit an earlier cloud plot id', () => {
  const f = fixture([makePlot('local-a', ringA)]);
  const store = f.ctx.RyCloudDesignBindingStore;
  assert.equal(store.beginCloudImport('42', ringA).ok, true);
  assert.equal(store.bindTransferredPlot(makePlot('local-a', ringA)).ok, true);

  assert.equal(store.beginCloudImport('', ringB).error, 'invalid-cloud-plot-id');
  assert.equal(store.resolveForCurrentPlot().error, 'cloud-plot-not-bound');
  assert.equal(f.session.has(store.keys.pending), false);

  assert.equal(store.beginCloudImport('43', ringB).ok, true);
  assert.equal(store.bindTransferredPlot(makePlot('local-a', ringA)).error, 'transferred-plot-does-not-match-cloud-ring');
  assert.equal(store.resolveForCurrentPlot().error, 'cloud-plot-not-bound');
});

test('ambiguous local identity or duplicate geometry fails closed', () => {
  const duplicateId = fixture([makePlot('local-a', ringA), makePlot('local-a', ringB)]);
  duplicateId.ctx.RyCloudDesignBindingStore.beginCloudImport('42', ringA);
  assert.equal(duplicateId.ctx.RyCloudDesignBindingStore.bindTransferredPlot(makePlot('local-a', ringA)).error, 'duplicate-local-plot-id');

  const duplicateGeometry = fixture([makePlot('local-a', ringA), makePlot('local-b', ringA)]);
  duplicateGeometry.ctx.RyCloudDesignBindingStore.beginCloudImport('42', ringA);
  assert.equal(duplicateGeometry.ctx.RyCloudDesignBindingStore.bindTransferredPlot(makePlot('local-a', ringA)).error, 'ambiguous-local-plot-geometry');
});

test('upload path resolves a checked binding and does not read the legacy global key', () => {
  const uploadSource = fs.readFileSync(path.join(root, 'mod/inline-09.js'), 'utf8');
  const mapSource = fs.readFileSync(path.join(root, 'mod/online-map.js'), 'utf8');
  const start = uploadSource.indexOf('window.tlUploadDesign=function(){');
  const end = uploadSource.indexOf('window.tlFrontNodeReset=function(){', start);
  assert.ok(start >= 0 && end > start);
  const upload = uploadSource.slice(start, end);
  assert.match(upload, /resolveForCurrentPlot\(\)/);
  assert.doesNotMatch(upload, /localStorage\.getItem\(['"]ry_cloud_plot_id['"]\)/);
  assert.match(mapSource, /cloudBinding\.bindTransferredPlot\(saved\)/);
  assert.match(mapSource, /cloudBinding\.beginCloudImport\(pid,ring\)/);
});
