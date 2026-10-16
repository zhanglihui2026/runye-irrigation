/* 地形喷灌成果到只读喷灌插件的快照桥；保留既有 key、v1 载荷和 remove/set 通知行为。 */
(function (root) {
  'use strict';

  var DEFAULT_KEY = 'runyeSprinklerResult';
  function keyOrDefault(key) { return typeof key === 'string' && key ? key : DEFAULT_KEY; }

  root.RySprinklerBridgeStore = {
    key: DEFAULT_KEY,
    writeSnapshot: function (value, key) {
      var storageKey = keyOrDefault(key);
      try {
        var serialized = JSON.stringify(value);
        root.localStorage.removeItem(storageKey);
        root.localStorage.setItem(storageKey, serialized);
        return true;
      } catch (e) { return false; }
    },
    removeSnapshot: function (key) {
      try { root.localStorage.removeItem(keyOrDefault(key)); return true; }
      catch (e) { return false; }
    },
    readSnapshot: function (key) {
      try {
        var raw = root.localStorage.getItem(keyOrDefault(key));
        if (!raw) return null;
        var value = JSON.parse(raw);
        return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : null;
      } catch (e) { return null; }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
