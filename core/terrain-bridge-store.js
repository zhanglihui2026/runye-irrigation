/* 在线地图到地形模块的一次性地块交接；保持既有 localStorage key 与 payload 格式。 */
(function (root) {
  'use strict';

  var KEY = 'runye_terrain_incoming';

  root.RyTerrainBridgeStore = {
    key: KEY,
    writeIncoming: function (payload) {
      try {
        root.localStorage.setItem(KEY, JSON.stringify(payload));
        return true;
      } catch (e) { return false; }
    },
    consumeIncoming: function () {
      var raw;
      try {
        raw = root.localStorage.getItem(KEY);
        if (raw !== null) root.localStorage.removeItem(KEY);
      } catch (e) { return null; }
      if (!raw) return null;
      try {
        var value = JSON.parse(raw);
        return value && typeof value === 'object' ? value : null;
      } catch (e) { return null; }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
