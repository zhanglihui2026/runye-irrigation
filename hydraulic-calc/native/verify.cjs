'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ref = require('../hc-core.js');
const create = require('../hydraulics-wasm.js');

const near = (a, b, tol) => {
  tol = tol || 1e-11;
  const m = Math.max(1, Math.abs(b));
  assert.ok(Math.abs(a - b) <= tol * m, `${a} != ${b}`);
};

/* createRunyeHydraulics() returns a Promise with SINGLE_FILE builds, so await it
 * regardless of whether the factory is sync or async. */
(async () => {
  const mod = await Promise.resolve(create());
  assert.equal(mod._ry_abi_version(), 1);

  // --- (a) equivalence vs the JS reference (regression guard) ---
  let count = 0;
  for (let i = 1; i <= 500; i++) {
    const L = i * 2.3, Q = (i % 173) * 1.7, d = 16 + (i % 450), C = 100 + i % 60;
    near(mod._ry_hazen(L, Q, d, C), ref.hazen(L, Q, d, C));
    near(mod._ry_velocity(Q, d), ref.velocity(Q, d));
    near(mod._ry_inner(d, 13.6), ref.innerDiam(d));
    near(mod._ry_local(i / 100, 0.7), ref.localLoss(i / 100, 0.7));
    near(mod._ry_christiansen(i), i <= 1 ? 1 : 1 / 2.852 + 1 / (2 * i) + Math.sqrt(0.852) / (6 * i * i));
    count += 5;
  }

  // --- (b) independent anchors (NOT derived from the JS reference) ---
  // Known value recomputed by hand: HF(200 m, 60 m³/h, Ø160 SDR13.6 inner, C=150).
  near(mod._ry_hazen(200, 60, mod._ry_inner(160, 13.6), 150), 1.6326760596746448);
  // Zero-flow / zero-diameter / zero-sdr properties must hold regardless of old code.
  assert.equal(mod._ry_hazen(100, 0, 110, 150), 0);
  assert.equal(mod._ry_hazen(100, 10, 0, 150), 0);
  assert.equal(mod._ry_inner(110, 0), 110);
  assert.equal(mod._ry_velocity(0, 100), 0);
  assert.equal(mod._ry_local(2, 0), 0);
  assert.equal(mod._ry_christiansen(1), 1);

  // --- (c) full-path integration through the bridge + hc-core ---
  const ctx = { console, createRunyeHydraulics: create };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../native-bridge.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../hc-core.js'), 'utf8'), ctx);
  // bridge may attach asynchronously → wait for ready before asserting backend.
  await ctx.RyHydraulicNative.ready;
  assert.equal(ctx.RyHydraulicNative.backend, 'cpp-wasm');
  const cfg = ref.defaultConfig();
  near(ctx.RyHcCore.summary(cfg).maxTotal, ref.summary(cfg).maxTotal);
  for (const mode of ['id', 'sdr17', 'sdr21']) {
    near(ctx.RyHcCore.innerDiam(225, mode), ref.innerDiam(225, mode));
  }

  // --- (d) head / power (only if this wasm build exports them) ---
  let headPowerNote = 'SKIP (rebuild wasm with ry_head/ry_power to activate)';
  if (typeof mod._ry_power === 'function' && typeof mod._ry_head === 'function') {
    near(mod._ry_power(48, 30, 0.75), 2.725 * 48 * 30 / 0.75 / 1000);
    near(mod._ry_head(10, 5, 2, 1.10), (10 + 5 + 2) * 1.10);
    near(ctx.RyHcCore.power(48, 30, 0.75), ref.power(48, 30, 0.75));
    near(ctx.RyHcCore.head(10, 5, 2, 1.10), ref.head(10, 5, 2, 1.10));
    assert.equal(mod._ry_power(0, 30, 0.75), 0, 'zero flow → zero power');
    assert.equal(mod._ry_head(10, 5, 2, 0), 0, 'zero safety → zero head');
    headPowerNote = 'OK (wasm exports ry_head/ry_power)';
  }
  console.log(`PASS: ${count} numeric comparisons + independent anchors + full-path integration. head/power: ${headPowerNote}`);
})().catch((e) => { console.error('FAIL:', e && e.message ? e.message : e); process.exitCode = 1; });
