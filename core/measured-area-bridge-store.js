/* 地图与地形模块到主规划页的兼容载荷桥；原样保留两类既有载荷和单次消费语义。 */
(function (root) {
  'use strict';

  var KEY = 'runyeMeasuredArea';

  root.RyMeasuredAreaBridgeStore = {
    key: KEY,
    write: function (payload) {
      root.localStorage.setItem(KEY, JSON.stringify(payload));
      return true;
    },
    readRaw: function () {
      return root.localStorage.getItem(KEY);
    },
    read: function () {
      var raw = root.localStorage.getItem(KEY);
      if (!raw) return null;
      try { return JSON.parse(raw); } catch (e) { return null; }
    },
    /* Receiver removes only after a successful import (or an explicitly invalid payload).
       Read and delete stay separate so reference failures remain available for recovery. */
    remove: function () { root.localStorage.removeItem(KEY); return true; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
