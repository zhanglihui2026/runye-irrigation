/* 水力跨页面数据桥：集中管理既有 localStorage 契约，不改变键名或快照格式。 */
(function (root) {
  'use strict';

  var KEYS = {
    networkLayout: 'runye_network_layout',
    hydraulicDesign: 'runye_hydraulic_design_v1',
    hydraulicOverlay: 'runye_hydraulic_overlay_v1'
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

  function readRaw(key) {
    return root.localStorage.getItem(key);
  }

  function restoreIfCurrent(key, expectedRaw, previousRaw) {
    if ((expectedRaw !== null && typeof expectedRaw !== 'string') ||
        (previousRaw !== null && typeof previousRaw !== 'string')) {
      return { ok: false, error: 'invalid-network-layout-snapshot' };
    }
    if (readRaw(key) !== expectedRaw) return { ok: false, error: 'network-layout-conflict' };
    if (previousRaw === null) root.localStorage.removeItem(key);
    else root.localStorage.setItem(key, previousRaw);
    return { ok: true };
  }

  root.RyIrrigationDataStore = {
    keys: KEYS,
    readNetworkLayout: function () { return read(KEYS.networkLayout); },
    writeNetworkLayout: function (value) { return write(KEYS.networkLayout, value); },
    readRawNetworkLayout: function () { return readRaw(KEYS.networkLayout); },
    restoreNetworkLayoutIfCurrent: function (expectedRaw, previousRaw) {
      return restoreIfCurrent(KEYS.networkLayout, expectedRaw, previousRaw);
    },
    readHydraulicDesign: function () { return read(KEYS.hydraulicDesign); },
    writeHydraulicDesign: function (value) { return write(KEYS.hydraulicDesign, value); },
    readHydraulicOverlayForNetwork: function (network) {
      var overlay = read(KEYS.hydraulicOverlay);
      if (!overlay || overlay.version !== 1 || !overlay.items || !network ||
          network.ts == null || overlay.networkTs == null || overlay.networkTs !== network.ts) return null;
      return overlay;
    },
    writeHydraulicOverlay: function (value) { return write(KEYS.hydraulicOverlay, value); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
