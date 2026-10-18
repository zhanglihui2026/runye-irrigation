'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const ROOT = path.join(__dirname, '..');

function loadPlugin(window) {
  const fileUrl = new URL('file:///' + path.join(ROOT, 'plugins/hydraulics/main.js').replace(/\\/g, '/'));
  const source = fs.readFileSync(path.join(ROOT, 'plugins/hydraulics/main.js'), 'utf8')
    .replace('import.meta.url', JSON.stringify(fileUrl.href))
    .replace('export { activate, deactivate };', 'module.exports = { activate, deactivate };');
  const context = {
    URL, console, setTimeout(fn) { fn(); return 1; },
    document: { querySelectorAll() { return []; }, querySelector() { return null; } },
    module: { exports: {} },
    Number, String, Object, Array, Promise, Date, Math, isFinite
  };
  context.window = window;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'plugins/hydraulics/main.js' });
  return context.module.exports;
}

test('hydraulics plugin API forwards network/options and Christiansen single argument', () => {
  const calls = [];
  const network = { segments: [{ id: 'main-1' }] };
  const options = { C: 145, localRatio: 0.1 };
  const window = {
    location: { hash: '' },
    RyHydCore: {
      compute(...args) { calls.push(['compute', ...args]); return { valid: true }; },
      christiansenF(...args) { calls.push(['christiansenF', ...args]); return 0.82; }
    },
    RyHcCore: { hazen(...args) { calls.push(['hazen', ...args]); return 3.7; } }
  };
  const { activate } = loadPlugin(window);
  const api = activate({
    id: 'hydraulics',
    manifest: { config: { autoloadCore: false, takeOverNav: false }, ui: { nav: {} } },
    ui: { registerNav() { return function () {}; } },
    runtime: { log() {}, reportError(error) { throw error; } }
  });

  assert.deepEqual(api.compute(network, options), { valid: true });
  assert.equal(api.christiansenF(12), 0.82);
  assert.equal(api.hazen(10, 2, 80, 150), 3.7);
  assert.equal(calls[0][0], 'compute');
  assert.equal(calls[0][1], network);
  assert.equal(calls[0][2], options);
  assert.deepEqual(calls[1], ['christiansenF', 12]);
  assert.deepEqual(calls[2], ['hazen', 10, 2, 80, 150]);
});
