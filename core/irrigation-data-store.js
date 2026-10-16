/* 水力跨页面数据桥：集中管理既有 localStorage 契约，不改变键名或快照格式。 */
(function (root) {
  'use strict';

  var KEYS = {
    networkLayout: 'runye_network_layout',
    hydraulicDesign: 'runye_hydraulic_design_v1'
  };

  function read(key) {
    try {
      var raw = root.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function write(key, value) {
    if (value == null) {
      root.localStorage.removeItem(key);
      return true;
    }
    root.localStorage.setItem(key, JSON.stringify(value));
    return true;
  }

  root.RyIrrigationDataStore = {
    keys: KEYS,
    readNetworkLayout: function () { return read(KEYS.networkLayout); },
    writeNetworkLayout: function (value) { return write(KEYS.networkLayout, value); },
    readHydraulicDesign: function () { return read(KEYS.hydraulicDesign); },
    writeHydraulicDesign: function (value) { return write(KEYS.hydraulicDesign, value); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
