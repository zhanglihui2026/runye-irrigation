'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const ROOT = path.join(__dirname, '..');

function loadStore(options = {}) {
  const values = new Map();
  const localStorage = {
    getItem(key) {
      if (options.getError) throw new Error('get failed');
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      if (options.setError) throw new Error('set failed');
      values.set(key, String(value));
    },
    removeItem(key) {
      if (options.removeError) throw new Error('remove failed');
      values.delete(key);
    }
  };
  const context = { localStorage, JSON, globalThis: null };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core/plot-library-store.js'), 'utf8'), context,
    { filename: 'core/plot-library-store.js' });
  return { store: context.RyPlotLibraryStore, values };
}

test('plot library store distinguishes missing, malformed, and unreadable storage', () => {
  const missing = loadStore();
  assert.deepEqual(JSON.parse(JSON.stringify(missing.store.read())), { ok: true, plots: [], revision: null });
  missing.values.set('runye_plot_library', '{bad json');
  assert.equal(missing.store.read().error, 'plot-library-read-failed');
  missing.values.set('runye_plot_library', '{"not":"an array"}');
  assert.equal(missing.store.read().error, 'invalid-plot-library');
  assert.equal(loadStore({ getError: true }).store.read().error, 'plot-library-read-failed');
});

test('plot library store commits only against the revision it read', () => {
  const { store, values } = loadStore();
  const first = store.read();
  assert.equal(store.replace([{ id: 'a' }], first.revision).ok, true);
  const snapshot = store.read();
  values.set('runye_plot_library', JSON.stringify([{ id: 'external' }]));
  assert.equal(store.replace([{ id: 'stale-write' }], snapshot.revision).error, 'plot-library-conflict');
  assert.deepEqual(JSON.parse(values.get('runye_plot_library')), [{ id: 'external' }]);
});

test('plot library replace refuses duplicate normalized IDs without changing stored data', () => {
  const { store, values } = loadStore();
  assert.equal(store.replace([{ id: 'same' }, { id: 'same' }], null).error, 'duplicate-plot-id');
  assert.equal(values.has('runye_plot_library'), false);

  values.set('runye_plot_library', JSON.stringify([{ id: 'before' }]));
  const current = store.read();
  assert.equal(store.replace([{ id: 7 }, { id: '7' }], current.revision).error, 'duplicate-plot-id');
  assert.deepEqual(JSON.parse(values.get('runye_plot_library')), [{ id: 'before' }]);
});

test('plot library store updates a copy and preserves stored data on failures', () => {
  const { store, values } = loadStore();
  values.set('runye_plot_library', JSON.stringify([{ id: 'a', name: 'original' }]));
  const result = store.update(plots => { plots[0].name = 'updated'; });
  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(values.get('runye_plot_library')), [{ id: 'a', name: 'updated' }]);
  assert.equal(store.update(() => { throw new Error('abort'); }).error, 'plot-library-update-failed');
  assert.deepEqual(JSON.parse(values.get('runye_plot_library')), [{ id: 'a', name: 'updated' }]);
  assert.equal(loadStore({ setError: true }).store.update(() => [{ id: 'x' }]).error, 'plot-library-write-failed');
});

test('plot library unique upsert preserves unrelated entries and rejects duplicate identities', () => {
  const { store, values } = loadStore();
  values.set('runye_plot_library', JSON.stringify([{ id: 'saved', name: 'keep' }, { id: 'auto-current', name: 'old' }]));
  assert.equal(store.upsertUnique('auto-current', { id: 'auto-current', name: 'new' }).ok, true);
  assert.deepEqual(JSON.parse(values.get('runye_plot_library')), [
    { id: 'saved', name: 'keep' }, { id: 'auto-current', name: 'new' }
  ]);
  values.set('runye_plot_library', JSON.stringify([{ id: 'auto-current' }, { id: 'auto-current' }]));
  const before = values.get('runye_plot_library');
  assert.equal(store.upsertUnique('auto-current', { id: 'auto-current', name: 'unsafe' }).error, 'duplicate-plot-id');
  assert.equal(values.get('runye_plot_library'), before);
});

test('plot library unique removal rejects ambiguous records and leaves missing identities untouched', () => {
  const { store, values } = loadStore();
  values.set('runye_plot_library', JSON.stringify([{ id: 'saved' }, { id: 'auto-current' }]));
  assert.equal(store.removeUnique('auto-current').ok, true);
  assert.deepEqual(JSON.parse(values.get('runye_plot_library')), [{ id: 'saved' }]);
  const before = values.get('runye_plot_library');
  assert.equal(store.removeUnique('missing').unchanged, true);
  assert.equal(values.get('runye_plot_library'), before);
  values.set('runye_plot_library', JSON.stringify([{ id: 'auto-current' }, { id: 'auto-current' }]));
  const duplicate = values.get('runye_plot_library');
  assert.equal(store.removeUnique('auto-current').error, 'duplicate-plot-id');
  assert.equal(values.get('runye_plot_library'), duplicate);
});

test('generated current plot records are scoped to their design plot and cannot overwrite another owner', () => {
  const { store, values } = loadStore();
  const idA = store.generatedCurrentId('plot-a');
  const idB = store.generatedCurrentId('plot-b');
  assert.notEqual(idA, idB);
  const entry = (id, owner, name) => ({ id, source: 'auto', designPlotId: owner, name });

  assert.equal(store.upsertGeneratedCurrent('plot-a', entry(idA, 'plot-a', 'A')).ok, true);
  assert.equal(store.upsertGeneratedCurrent('plot-b', entry(idB, 'plot-b', 'B')).ok, true);
  assert.equal(store.upsertGeneratedCurrent('plot-a', entry(idA, 'plot-a', 'A updated')).ok, true);
  assert.deepEqual(JSON.parse(values.get('runye_plot_library')), [
    entry(idA, 'plot-a', 'A updated'), entry(idB, 'plot-b', 'B')
  ]);
  assert.equal(store.generatedCurrentOwner(entry(idB, 'plot-b', 'B')), 'plot-b');
  assert.equal(store.removeGeneratedCurrent('plot-a').ok, true);
  assert.deepEqual(JSON.parse(values.get('runye_plot_library')), [entry(idB, 'plot-b', 'B')]);
});

test('generated current plot migration removes only a legacy record with matching owner', () => {
  const { store, values } = loadStore();
  const oldB = { id: 'auto-current', source: 'auto', designPlotId: 'plot-b', name: 'old B' };
  values.set('runye_plot_library', JSON.stringify([oldB]));
  const idA = store.generatedCurrentId('plot-a');
  assert.equal(store.upsertGeneratedCurrent('plot-a', {
    id: idA, source: 'auto', designPlotId: 'plot-a', name: 'new A'
  }).ok, true);
  const entryA = {
    id: idA, source: 'auto', designPlotId: 'plot-a', name: 'new A'
  };
  assert.deepEqual(JSON.parse(values.get('runye_plot_library')), [oldB, entryA],
    'a legacy entry owned by another plot must be preserved');
  const idB = store.generatedCurrentId('plot-b');
  const entryB = { id: idB, source: 'auto', designPlotId: 'plot-b', name: 'new B' };
  assert.equal(store.upsertGeneratedCurrent('plot-b', entryB).ok, true);
  assert.deepEqual(JSON.parse(values.get('runye_plot_library')), [entryA, entryB],
    'the matching legacy entry migrates to its scoped identity');
});

test('generated current plot identity refuses to replace an unrelated entry', () => {
  const { store, values } = loadStore();
  const id = store.generatedCurrentId('plot-a');
  const manual = { id, source: 'map', name: 'user plot' };
  values.set('runye_plot_library', JSON.stringify([manual]));
  assert.equal(store.upsertGeneratedCurrent('plot-a', {
    id, source: 'auto', designPlotId: 'plot-a', name: 'generated'
  }).error, 'plot-id-owned-by-other-entry');
  assert.deepEqual(JSON.parse(values.get('runye_plot_library')), [manual]);
});

test('generated current plot migration refuses ambiguous matching legacy owners and missing owners', () => {
  const { store, values } = loadStore();
  const old = { id: 'auto-current', source: 'auto', designPlotId: 'plot-a' };
  values.set('runye_plot_library', JSON.stringify([old, { ...old }]));
  const id = store.generatedCurrentId('plot-a');
  assert.equal(store.upsertGeneratedCurrent('plot-a', {
    id, source: 'auto', designPlotId: 'plot-a'
  }).error, 'duplicate-plot-id');
  assert.deepEqual(JSON.parse(values.get('runye_plot_library')), [old, old]);
  assert.equal(store.upsertGeneratedCurrent(null, {
    id: 'auto-current:undefined', source: 'auto', designPlotId: 'undefined'
  }).error, 'invalid-generated-current-plot');
  assert.equal(store.generatedCurrentOwner({ id: 'auto-current', source: 'auto' }), null);
});

test('plot library unique writes refuse malformed data and stale revisions', () => {
  const { store, values } = loadStore();
  values.set('runye_plot_library', '{bad json');
  assert.equal(store.upsertUnique('auto-current', { id: 'auto-current' }).error, 'plot-library-read-failed');
  assert.equal(values.get('runye_plot_library'), '{bad json');
  values.set('runye_plot_library', JSON.stringify([{ id: 'auto-current' }]));
  const snapshot = store.read();
  values.set('runye_plot_library', JSON.stringify([{ id: 'other' }]));
  assert.equal(store.replace([{ id: 'auto-current' }], snapshot.revision).error, 'plot-library-conflict');
  assert.deepEqual(JSON.parse(values.get('runye_plot_library')), [{ id: 'other' }]);
});

test('plot library rollback restores the exact prior revision, including an absent key, and refuses conflicts', () => {
  const { store, values } = loadStore();
  const absent = store.read();
  const written = store.replace([{ id: 'imported' }], absent.revision);
  assert.equal(store.restoreSnapshot(absent, written.revision).ok, true);
  assert.equal(values.has('runye_plot_library'), false);

  values.set('runye_plot_library', '[{"id":"before"}]');
  const original = store.read();
  const imported = store.replace([{ id: 'imported' }], original.revision);
  values.set('runye_plot_library', '[{"id":"concurrent"}]');
  assert.equal(store.restoreSnapshot(original, imported.revision).error, 'plot-library-conflict');
  assert.deepEqual(JSON.parse(values.get('runye_plot_library')), [{ id: 'concurrent' }]);
});
