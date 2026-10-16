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
