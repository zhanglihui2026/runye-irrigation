/* UI-free design calculations. Q m³/h, lengths/head m, OD/ID mm, efficiency 0..1.
 * Selection retains the existing nearest-velocity rule; ties keep the first OD.
 * Path topology stays in pipe-path-loss.js. DOM/input parsing stays in index.html. */
(function (root, factory) {
  var core = typeof module !== 'undefined' && module.exports ? require('./hc-core.js') : root.RyHcCore;
  var api = factory(core, root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RyDesignCore = api;
})(typeof window !== 'undefined' ? window : globalThis, function (core, root) {
  'use strict';
  function inner(od, sdr) {
    var native = root.RyHydraulicNative;
    return native && native.inner ? native.inner(od, sdr) : od * (1 - 2 / sdr);
  }
  function hazen(L, Q, d, C) {
    var native = root.RyHydraulicNative;
    if (native && native.hazen) return native.hazen(L, Q, d, C);
    if (d <= 0 || Q <= 0) return 0;
    return 1.113e9 * L * Math.pow(Q, 1.852) / (Math.pow(C, 1.852) * Math.pow(d, 4.87));
  }
  function christiansen(N) {
    var native = root.RyHydraulicNative;
    if (native && native.christiansen) return native.christiansen(N);
    if (N <= 1) return 1;
    return 1 / 2.852 + 1 / (2 * N) + Math.sqrt(0.852) / (6 * N * N);
  }
  function pipes(Q, series, sdr, minOd, maxOd) {
    return series.filter(function (od) { return od >= minOd && od <= maxOd; }).map(function (od) {
      var id = inner(od, sdr), area = Math.PI * Math.pow(id / 1000, 2) / 4;
      return { od: od, id: id, v: core.velocity(Q, id), area: area };
    });
  }
  function selectPipe(Q, targetV, series, sdr, minOd, maxOd) {
    var best = null;
    pipes(Q, series, sdr, minOd, maxOd).forEach(function (p) {
      if (!best || Math.abs(p.v - targetV) < Math.abs(best.v - targetV)) best = p;
    });
    return best;
  }
  function motor(requiredKW) {
    if (!Number.isFinite(requiredKW) || requiredKW <= 0) return 0;
    var series = [0.37, 0.55, 0.75, 1.1, 1.5, 2.2, 3, 4, 5.5, 7.5, 11, 15, 18.5, 22, 30, 37, 45, 55, 75, 90, 110, 132, 160, 200, 250, 315];
    for (var i = 0; i < series.length; i++) if (series[i] >= requiredKW) return series[i];
    return Math.ceil(requiredKW / 5) * 5;
  }
  return { inner: inner, hazen: hazen, christiansen: christiansen, pipes: pipes,
    selectPipe: selectPipe, motor: motor, head: core.head, power: core.power };
});
