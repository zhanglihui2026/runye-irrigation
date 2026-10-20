/* One-time, tab-addressed handoff from the map page to the main planner. */
(function (root) {
  'use strict';

  var KEY = 'runyeMeasuredArea';
  var KEY_PREFIX = KEY + ':';
  var URL_PARAM = 'ryPlotTransfer';
  var sequence = 0;

  function normalizeTransferId(value) {
    if (value == null || value === '') return null;
    var id = String(value);
    return /^[a-z0-9-]{12,80}$/i.test(id) ? id : null;
  }

  function currentTransferId() {
    try {
      var search = root.location && root.location.search;
      return normalizeTransferId(new URLSearchParams(search || '').get(URL_PARAM));
    } catch (error) { return null; }
  }

  function makeTransferId() {
    sequence++;
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12) + '-' + sequence.toString(36);
  }

  function transferKey(id) {
    var normalized = normalizeTransferId(id);
    return normalized ? KEY_PREFIX + normalized : null;
  }

  function clearUrlTransferId(id) {
    try {
      var normalized = normalizeTransferId(id);
      if (!normalized || currentTransferId() !== normalized || !root.history || typeof root.history.replaceState !== 'function') return;
      var params = new URLSearchParams(root.location.search || '');
      params.delete(URL_PARAM);
      var search = params.toString();
      var next = (root.location.pathname || '') + (search ? '?' + search : '') + (root.location.hash || '');
      root.history.replaceState(root.history.state, '', next);
    } catch (error) { }
  }

  root.RyMeasuredAreaBridgeStore = {
    key: KEY,
    keyPrefix: KEY_PREFIX,
    urlParam: URL_PARAM,
    currentTransferId: currentTransferId,
    write: function (payload) {
      var serialized;
      try { serialized = JSON.stringify(payload); } catch (error) { return null; }
      if (typeof serialized !== 'string') return null;
      var id = makeTransferId();
      try {
        root.localStorage.setItem(KEY_PREFIX + id, serialized);
        return id;
      } catch (error) { return null; }
    },
    readRaw: function (transferId) {
      var key = transferKey(transferId || currentTransferId());
      if (!key) return null;
      try { return root.localStorage.getItem(key); } catch (error) { return null; }
    },
    read: function (transferId) {
      var raw = this.readRaw(transferId);
      if (!raw) return null;
      try { return JSON.parse(raw); } catch (error) { return null; }
    },
    /* Keep failed transfers addressable for recovery; remove only the matching successful handoff. */
    remove: function (transferId) {
      var id = normalizeTransferId(transferId || currentTransferId());
      var key = transferKey(id);
      if (!key) return false;
      try { root.localStorage.removeItem(key); } catch (error) { return false; }
      clearUrlTransferId(id);
      return true;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
