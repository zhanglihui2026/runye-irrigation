/* Hydraulic native bridge.
 *
 * The Emscripten build (hydraulics-wasm.js, SINGLE_FILE) returns a Promise from
 * createRunyeHydraulics() — instantiation is async even though ASYNC_COMPILATION
 * was requested off, because the embedded wasm is instantiated lazily. This bridge
 * therefore handles BOTH sync and async factories:
 *   · sync factory  → attach immediately, backend = 'cpp-wasm'
 *   · async factory → attach on resolution; backend flips to 'cpp-wasm' then.
 * Until the wasm is ready (or if it fails to load), backend stays 'javascript' and
 * every hydraulics function in hc-core / index.html keeps using its JS formula.
 * No code path mixes JS and C++ inside a single computation: a primitive only uses
 * C++ once `RyHydraulicNative.<fn>` is defined, which happens atomically on resolve.
 *
 * `RyHydraulicNative.ready` is a promise that resolves to the api object; hosts that
 * want to wait for C++ before the first computation can `await RyHydraulicNative.ready`.
 */
(function (root) {
  'use strict';
  var api = { backend: 'javascript', abi: 1, error: null, ready: null };

  function attach(mod) {
    if (!mod || typeof mod._ry_abi_version !== 'function' || mod._ry_abi_version() !== 1) {
      throw new Error('Unsupported hydraulic ABI');
    }
    api.inner = mod._ry_inner;
    api.hazen = mod._ry_hazen;
    api.velocity = mod._ry_velocity;
    api.localLoss = mod._ry_local;
    api.christiansen = mod._ry_christiansen;
    /* head / power are optional: only present after a rebuild that includes
     * ry_head / ry_power in the C++ source. Until then these stay undefined and
     * hc-core falls back to its JS implementation. */
    if (typeof mod._ry_head === 'function') api.head = mod._ry_head;
    if (typeof mod._ry_power === 'function') api.power = mod._ry_power;
    api.backend = 'cpp-wasm';
  }

  function fail(error) {
    api.error = String((error && error.message) || error);
    if (root.console) root.console.warn('[Runye hydraulic] JavaScript fallback:', api.error);
  }

  try {
    if (typeof root.createRunyeHydraulics !== 'function') throw new Error('WASM bundle unavailable');
    var r = root.createRunyeHydraulics();
    if (r && typeof r.then === 'function') {
      api.ready = r.then(function (mod) { attach(mod); return api; }).catch(function (e) {
        fail(e);
        return api;
      });
    } else {
      attach(r);
      api.ready = Promise.resolve(api);
    }
  } catch (error) {
    fail(error);
    api.ready = Promise.resolve(api);
  }

  root.RyHydraulicNative = api;
})(typeof window !== 'undefined' ? window : globalThis);
