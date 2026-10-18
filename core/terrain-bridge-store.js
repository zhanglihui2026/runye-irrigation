/* 在线地图到地形模块的一次性地块交接；保留既有 localStorage key 与消费 payload。 */
(function (root) {
  'use strict';

  var KEY = 'runye_terrain_incoming';
  var TAB_TOKEN_KEY = 'runye_terrain_incoming_tab_token';
  var PAYLOAD_TOKEN_KEY = '__runyeTerrainTransferId';
  var ENVELOPE = 'runye-terrain-transfer/v1';

  function clearTabToken() {
    try { root.sessionStorage.removeItem(TAB_TOKEN_KEY); } catch (e) { }
  }

  root.RyTerrainBridgeStore = {
    key: KEY,
    writeIncoming: function (payload) {
      var id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
      var previousToken;
      try {
        if (!root.sessionStorage) return false;
        previousToken = root.sessionStorage.getItem(TAB_TOKEN_KEY);
        root.sessionStorage.setItem(TAB_TOKEN_KEY, id);
      } catch (e) { return false; }
      try {
        var stored = payload;
        if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
          stored = Object.assign({}, payload);
          stored[PAYLOAD_TOKEN_KEY] = id;
        } else {
          stored = { bridge: ENVELOPE, transferId: id, payload: payload };
        }
        root.localStorage.setItem(KEY, JSON.stringify(
          stored === payload ? { bridge: ENVELOPE, transferId: id, payload: payload } : stored
        ));
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
      var raw, tabToken;
      try {
        tabToken = root.sessionStorage ? root.sessionStorage.getItem(TAB_TOKEN_KEY) : null;
        raw = root.localStorage.getItem(KEY);
      } catch (e) { return null; }
      if (raw === null) {
        clearTabToken();
        return null;
      }

      var value;
      try {
        value = JSON.parse(raw);
        if (value && value.bridge === ENVELOPE) {
          if (!tabToken || value.transferId !== tabToken) {
            clearTabToken();
            return null;
          }
          value = value.payload;
        } else if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, PAYLOAD_TOKEN_KEY)) {
          if (!tabToken || value[PAYLOAD_TOKEN_KEY] !== tabToken) {
            clearTabToken();
            return null;
          }
          delete value[PAYLOAD_TOKEN_KEY];
        } else if (tabToken) {
          /* A pending tab handoff must not consume an unrelated legacy/overwritten payload. */
          clearTabToken();
          return null;
        }
      } catch (e) {
        value = null;
      }

      if (!value || typeof value !== 'object') {
        try {
          if (root.localStorage.getItem(KEY) === raw) root.localStorage.removeItem(KEY);
        } catch (e) { return null; }
        clearTabToken();
        return null;
      }

      try {
        /* Do not delete a payload another tab replaced after this tab read it. */
        if (root.localStorage.getItem(KEY) !== raw) {
          clearTabToken();
          return null;
        }
        root.localStorage.removeItem(KEY);
      } catch (e) { return null; }
      clearTabToken();
      return value;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
