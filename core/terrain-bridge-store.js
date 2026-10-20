/* 在线地图到地形模块的一次性地块交接；保留既有 key 与消费 payload。 */
(function (root) {
  'use strict';

  var KEY = 'runye_terrain_incoming';
  var KEY_PREFIX = KEY + ':';
  var TAB_TOKEN_KEY = 'runye_terrain_incoming_tab_token';
  var PAYLOAD_TOKEN_KEY = '__runyeTerrainTransferId';
  var ENVELOPE = 'runye-terrain-transfer/v1';

  function validId(id) {
    return typeof id === 'string' && /^[a-z0-9-]{8,80}$/i.test(id) ? id : null;
  }

  function transferKey(id) {
    id = validId(id);
    return id ? KEY_PREFIX + id : null;
  }

  function makeId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  }

  function clearTabToken() {
    try { root.sessionStorage.removeItem(TAB_TOKEN_KEY); } catch (e) { }
  }

  function removeIfCurrent(key, raw) {
    try {
      if (root.localStorage.getItem(key) !== raw) return false;
      root.localStorage.removeItem(key);
      return true;
    } catch (e) { return false; }
  }

  function decode(raw, tabToken) {
    var value;
    try { value = JSON.parse(raw); }
    catch (e) { return { ok: false, preserve: false }; }

    if (value && value.bridge === ENVELOPE) {
      if (!tabToken || value.transferId !== tabToken) return { ok: false, preserve: true };
      value = value.payload;
    } else if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, PAYLOAD_TOKEN_KEY)) {
      if (!tabToken || value[PAYLOAD_TOKEN_KEY] !== tabToken) return { ok: false, preserve: true };
      value = Object.assign({}, value);
      delete value[PAYLOAD_TOKEN_KEY];
    } else if (tabToken) {
      /* A pending tab handoff must not consume an unrelated legacy payload. */
      return { ok: false, preserve: true };
    }

    if (!value || typeof value !== 'object') return { ok: false, preserve: false };
    return { ok: true, value: value };
  }

  root.RyTerrainBridgeStore = {
    key: KEY,
    keyPrefix: KEY_PREFIX,
    tabTokenKey: TAB_TOKEN_KEY,
    writeIncoming: function (payload) {
      var id = makeId();
      var previousToken;
      var storageKey = transferKey(id);
      try {
        if (!root.sessionStorage || !storageKey) return false;
        previousToken = root.sessionStorage.getItem(TAB_TOKEN_KEY);
        root.sessionStorage.setItem(TAB_TOKEN_KEY, id);
      } catch (e) { return false; }

      try {
        root.localStorage.setItem(storageKey, JSON.stringify({
          bridge: ENVELOPE,
          transferId: id,
          payload: payload
        }));
        /* A newer handoff from this same tab supersedes only its own older item. */
        var previousKey = transferKey(previousToken);
        if (previousKey && previousKey !== storageKey) {
          try { root.localStorage.removeItem(previousKey); } catch (cleanupError) { }
        }
        return true;
      } catch (e) {
        try {
          if (previousToken == null) root.sessionStorage.removeItem(TAB_TOKEN_KEY);
          else root.sessionStorage.setItem(TAB_TOKEN_KEY, previousToken);
        } catch (restoreError) { }
        return false;
      }
    },
    consumeIncoming: function () {
      var tabToken, raw, key;
      try {
        tabToken = root.sessionStorage ? root.sessionStorage.getItem(TAB_TOKEN_KEY) : null;
        key = transferKey(tabToken);
        raw = key ? root.localStorage.getItem(key) : null;
        if (raw === null) {
          /* Read old single-slot handoffs during an app update. */
          key = KEY;
          raw = root.localStorage.getItem(KEY);
        }
      } catch (e) { return null; }

      if (raw === null) {
        clearTabToken();
        return null;
      }

      var decoded = decode(raw, tabToken);
      if (!decoded.ok) {
        if (!decoded.preserve && !removeIfCurrent(key, raw)) return null;
        clearTabToken();
        return null;
      }

      /* Do not delete a payload another writer replaced after this tab read it. */
      if (!removeIfCurrent(key, raw)) {
        clearTabToken();
        return null;
      }
      clearTabToken();
      return decoded.value;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
