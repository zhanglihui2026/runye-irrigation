/* 地形喷灌成果到只读喷灌插件的快照桥；保留既有 key、v1 载荷和 remove/set 通知行为。 */
(function (root) {
  'use strict';

  var DEFAULT_KEY = 'runyeSprinklerResult';
  function keyOrDefault(key) { return typeof key === 'string' && key ? key : DEFAULT_KEY; }

  root.RySprinklerBridgeStore = {
    key: DEFAULT_KEY,
    writeSnapshot: function (value, key) {
      var storageKey = keyOrDefault(key);
      var previousRaw;
      try {
        var serialized = JSON.stringify(value);
        previousRaw = root.localStorage.getItem(storageKey);
        root.localStorage.removeItem(storageKey);
        root.localStorage.setItem(storageKey, serialized);
        return true;
      } catch (e) {
        /* Remove/set is retained to notify storage-event consumers even when
           the serialized value is unchanged. If set fails after removal,
           restore the previous bytes so a failed refresh does not erase the
           last usable snapshot. */
        try {
          if (previousRaw !== undefined && previousRaw !== null)
            root.localStorage.setItem(storageKey, previousRaw);
        } catch (restoreError) { /* storage may be unavailable; report failure */ }
        return false;
      }
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
