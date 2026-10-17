/* Shared persistence for pipe-price overrides and economic assumptions. */
(function (root) {
  'use strict';

  var KEYS = {
    assumptions: 'runye_tlEconAssum',
    prices: 'runye_tlEconPrices'
  };

  function read(key) {
    try { return JSON.parse(root.localStorage.getItem(key) || '{}') || {}; }
    catch (e) { return {}; }
  }

  function write(key, value) {
    try {
      if (value == null) root.localStorage.removeItem(key);
      else root.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) { return false; }
  }

  root.RyEconomicSettingsStore = {
    keys: KEYS,
    readAssumptions: function () { return read(KEYS.assumptions); },
    patchAssumptions: function (patch) {
      var current = read(KEYS.assumptions), key, value;
      for (key in patch) {
        if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
        value = patch[key];
        if (typeof value === 'number' && isFinite(value) && value > 0) current[key] = value;
        else delete current[key];
      }
      return write(KEYS.assumptions, current);
    },
    readPriceOverrides: function () { return read(KEYS.prices); },
    writePriceOverrides: function (prices) { return write(KEYS.prices, prices); },
    clearPriceOverrides: function () { return write(KEYS.prices, null); }
  };
})(window);
