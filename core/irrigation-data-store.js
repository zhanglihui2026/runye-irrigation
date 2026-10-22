/* 水力跨页面数据桥：保留既有键名与兼容读取，并为新快照校验显式关联。 */
(function (root) {
  'use strict';

  var KEYS = {
    networkLayout: 'runye_network_layout',
    networkLayoutByPlot: 'runye_network_layout_by_plot_v1:',
    hydraulicDesign: 'runye_hydraulic_design_v1',
    hydraulicDesignByPlot: 'runye_hydraulic_design_by_plot_v1:',
    hydraulicOverlay: 'runye_hydraulic_overlay_v1',
    hydraulicOverlayByPlot: 'runye_hydraulic_overlay_by_plot_v1:',
    currentPlotAnchor: 'runye_current_plot_v1',
    currentPlotAnchorByTab: 'runye_current_plot_tab_v1'
  };

  function normalizedId(value) {
    return value == null || value === '' ? null : String(value);
  }

  function readCurrentPlotAnchor() {
    try {
      var raw = root.sessionStorage.getItem(KEYS.currentPlotAnchorByTab);
      if (raw) {
        var tabAnchor = JSON.parse(raw);
        if (tabAnchor == null) return { ok: true, id: null };
        if (typeof tabAnchor !== 'object' || Array.isArray(tabAnchor)) return { ok: false, id: null };
        return { ok: true, id: normalizedId(tabAnchor.id) };
      }
      raw = root.localStorage.getItem(KEYS.currentPlotAnchor);
      if (!raw) return { ok: true, id: null };
      var anchor = JSON.parse(raw);
      if (anchor == null) return { ok: true, id: null };
      if (typeof anchor !== 'object' || Array.isArray(anchor)) return { ok: false, id: null };
      return { ok: true, id: normalizedId(anchor.id) };
    } catch (e) { return { ok: false, id: null }; }
  }

  function writeCurrentPlotAnchor(plotId, options) {
    var id = normalizedId(plotId);
    var raw = JSON.stringify({ id: id, ts: Date.now() });
    try {
      root.sessionStorage.setItem(KEYS.currentPlotAnchorByTab, raw);
    } catch (e) { return false; }
    /* Keep the old shared key as a default for a newly opened tab. Existing
       tabs use their session-scoped anchor, so this write cannot switch them. */
    if (!options || options.sharedDefault !== false) {
      try {
        if (id) root.localStorage.setItem(KEYS.currentPlotAnchor, raw);
        else root.localStorage.removeItem(KEYS.currentPlotAnchor);
      } catch (e) { }
    }
    return true;
  }

  function networkLayoutStateForCurrentPlot(network) {
    if (!network) return { status: 'missing', network: null, reason: 'network-missing' };
    var networkPlotId = normalizedId(network.plotId);
    if (networkPlotId == null) return { status: 'stale', network: network, reason: 'network-plot-unbound' };
    var anchor = readCurrentPlotAnchor();
    if (!anchor.ok || anchor.id == null) return { status: 'stale', network: network, reason: 'active-plot-unavailable' };
    if (networkPlotId !== anchor.id) {
      return { status: 'stale', network: network, reason: 'active-plot-mismatch' };
    }
    return { status: 'current', network: network, reason: null };
  }

  function validateNetworkPlotBinding(network, plots) {
    if (network == null) return { ok: true, status: 'missing', plotId: null };
    if (typeof network !== 'object' || Array.isArray(network)) {
      return { ok: false, status: 'invalid', error: 'invalid-network-layout' };
    }
    var plotId = normalizedId(network.plotId);
    if (plotId == null) return { ok: true, status: 'unbound', plotId: null };
    if (!Array.isArray(plots)) return { ok: false, status: 'invalid', error: 'plot-library-unavailable' };
    var matches = 0;
    for (var i = 0; i < plots.length; i++) {
      if (plots[i] && normalizedId(plots[i].id) === plotId) matches++;
    }
    if (matches === 0) return { ok: false, status: 'invalid', error: 'network-plot-not-in-project', plotId: plotId };
    if (matches !== 1) return { ok: false, status: 'invalid', error: 'network-plot-ambiguous', plotId: plotId };
    return { ok: true, status: 'bound', plotId: plotId };
  }

  function read(key) {
    try {
      var raw = root.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function scopedKey(prefix, plotId) {
    var id = normalizedId(plotId);
    return id == null ? null : prefix + encodeURIComponent(id);
  }

  function readParsedRaw(raw) {
    if (raw == null || raw === '') return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function readScopedOrLegacy(baseKey, scopedPrefix, plotId) {
    var key = scopedKey(scopedPrefix, plotId);
    if (key) {
      var scopedRaw = readRaw(key);
      if (scopedRaw !== null) {
        var scopedValue = readParsedRaw(scopedRaw);
        if (!scopedValue || normalizedId(scopedValue.plotId) !== normalizedId(plotId)) return null;
        return scopedValue;
      }
    }
    var legacy = read(baseKey);
    if (!legacy || normalizedId(legacy.plotId) !== normalizedId(plotId)) return null;
    return legacy;
  }

  function preserveBoundLegacySnapshot(baseKey, scopedPrefix) {
    var raw = readRaw(baseKey);
    var current = readParsedRaw(raw);
    var owner = current && normalizedId(current.plotId);
    if (owner == null) return;
    var key = scopedKey(scopedPrefix, owner);
    if (!key || readRaw(key) !== null) return;
    /* Before reusing the legacy slot for an ownerless record, preserve its
       bound value in that owner's slot. A failed preservation stops overwrite. */
    root.localStorage.setItem(key, raw);
  }

  function writeScopedOrLegacy(baseKey, scopedPrefix, value, plotId) {
    if (value == null) {
      var explicitScope = typeof plotId !== 'undefined';
      var anchor = explicitScope ? null : readCurrentPlotAnchor();
      var id = explicitScope ? normalizedId(plotId) : (anchor && anchor.ok ? anchor.id : null);
      var key = scopedKey(scopedPrefix, id);
      if (key) {
        root.localStorage.removeItem(key);
        var legacy = read(baseKey);
        if (legacy && normalizedId(legacy.plotId) === id) root.localStorage.removeItem(baseKey);
        return true;
      }
      var legacyValue = read(baseKey);
      if (legacyValue && normalizedId(legacyValue.plotId) != null) return false;
      root.localStorage.removeItem(baseKey);
      return true;
    }
    var owner = normalizedId(value.plotId);
    if (typeof plotId !== 'undefined' && normalizedId(plotId) !== owner) return false;
    if (owner == null) preserveBoundLegacySnapshot(baseKey, scopedPrefix);
    return write(scopedKey(scopedPrefix, owner) || baseKey, value);
  }

  function rawForScope(baseKey, scopedPrefix, plotId, hasExplicitScope) {
    var id = hasExplicitScope ? normalizedId(plotId) : readCurrentPlotAnchor().id;
    var key = scopedKey(scopedPrefix, id);
    if (key) {
      var scopedRaw = readRaw(key);
      if (scopedRaw !== null) return scopedRaw;
      var legacyRaw = readRaw(baseKey);
      var legacyValue = readParsedRaw(legacyRaw);
      return legacyValue && normalizedId(legacyValue.plotId) === id ? legacyRaw : null;
    }
    return readRaw(baseKey);
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

  function restoreNetworkLayoutInScope(expectedRaw, previousRaw, plotId, hasExplicitScope) {
    var id = hasExplicitScope ? normalizedId(plotId) : readCurrentPlotAnchor().id;
    var key = scopedKey(KEYS.networkLayoutByPlot, id) || KEYS.networkLayout;
    return restoreIfCurrent(key, expectedRaw, previousRaw);
  }

  function readNetworkLayoutForPlot(plotId) {
    return readScopedOrLegacy(KEYS.networkLayout, KEYS.networkLayoutByPlot, plotId);
  }

  function readHydraulicDesignForPlot(plotId) {
    return readScopedOrLegacy(KEYS.hydraulicDesign, KEYS.hydraulicDesignByPlot, plotId);
  }

  function readHydraulicOverlayForPlot(plotId) {
    return readScopedOrLegacy(KEYS.hydraulicOverlay, KEYS.hydraulicOverlayByPlot, plotId);
  }

  root.RyIrrigationDataStore = {
    keys: KEYS,
    readCurrentPlotAnchor: readCurrentPlotAnchor,
    writeCurrentPlotAnchor: writeCurrentPlotAnchor,
    readNetworkLayout: function () {
      var anchor = readCurrentPlotAnchor();
      if (!anchor.ok || !anchor.id) return null;
      return readNetworkLayoutForPlot(anchor.id);
    },
    readNetworkLayoutForPlot: readNetworkLayoutForPlot,
    writeNetworkLayout: function (value, plotId) {
      return writeScopedOrLegacy(KEYS.networkLayout, KEYS.networkLayoutByPlot, value, plotId);
    },
    readNetworkLayoutStateForCurrentPlot: networkLayoutStateForCurrentPlot,
    validateNetworkPlotBinding: validateNetworkPlotBinding,
    readRawNetworkLayout: function (plotId) {
      return rawForScope(KEYS.networkLayout, KEYS.networkLayoutByPlot, plotId, arguments.length > 0);
    },
    restoreNetworkLayoutIfCurrent: function (expectedRaw, previousRaw, plotId) {
      return restoreNetworkLayoutInScope(expectedRaw, previousRaw, plotId, arguments.length > 2);
    },
    readHydraulicDesign: function () {
      var anchor = readCurrentPlotAnchor();
      if (!anchor.ok || !anchor.id) return null;
      return readHydraulicDesignForPlot(anchor.id);
    },
    readHydraulicDesignForPlot: readHydraulicDesignForPlot,
    readHydraulicDesignStateForNetwork: function (network) {
      var anchor = readCurrentPlotAnchor();
      var design = network && normalizedId(network.plotId)
        ? readHydraulicDesignForPlot(network.plotId)
        : (anchor.ok && anchor.id ? readHydraulicDesignForPlot(anchor.id) : read(KEYS.hydraulicDesign));
      if (network && network.needsReplan) {
        return { status: 'stale', design: design, reason: 'network-needs-replan' };
      }
      if (!design || design.version !== 1) return { status: 'missing', design: null, reason: 'design-missing' };
      if (!network) return { status: 'unverified', design: design, reason: 'network-missing' };
      var networkPlotId = network.plotId == null || network.plotId === '' ? null : String(network.plotId);
      var designPlotId = design.plotId == null || design.plotId === '' ? null : String(design.plotId);
      if (networkPlotId !== designPlotId) {
        return { status: 'stale', design: design, reason: 'plot-id-mismatch' };
      }
      var networkHasRevision = Object.prototype.hasOwnProperty.call(network, 'designRevisionId');
      var designHasRevision = Object.prototype.hasOwnProperty.call(design, 'designRevisionId');
      if (networkHasRevision || designHasRevision) {
        if (!networkHasRevision || !designHasRevision || !network.designRevisionId ||
            network.designRevisionId !== design.designRevisionId) {
          return { status: 'stale', design: design, reason: 'design-revision-mismatch' };
        }
      }
      if (Object.prototype.hasOwnProperty.call(network, 'designTs')) {
        if (network.designTs == null || design.ts == null || network.designTs !== design.ts) {
          return { status: 'stale', design: design, reason: 'design-timestamp-mismatch' };
        }
        return { status: 'current', design: design, reason: null };
      }
      return { status: 'legacy-unverified', design: design, reason: 'legacy-network-without-design-binding' };
    },
    writeHydraulicDesign: function (value, plotId) {
      return writeScopedOrLegacy(KEYS.hydraulicDesign, KEYS.hydraulicDesignByPlot, value, plotId);
    },
    readHydraulicOverlayForNetwork: function (network) {
      var overlay = network && normalizedId(network.plotId)
        ? readHydraulicOverlayForPlot(network.plotId) : read(KEYS.hydraulicOverlay);
      var networkState = network && networkLayoutStateForCurrentPlot(network);
      if (!overlay || overlay.version !== 2 || !overlay.items || !network || !networkState ||
          networkState.status !== 'current' || normalizedId(network.plotId) == null ||
          network.ts == null || overlay.networkTs == null || overlay.networkTs !== network.ts ||
          !Object.prototype.hasOwnProperty.call(overlay, 'plotId') ||
          !Object.prototype.hasOwnProperty.call(overlay, 'designRevisionId') ||
          normalizedId(overlay.plotId) !== normalizedId(network.plotId) ||
          normalizedId(overlay.designRevisionId) !== normalizedId(network.designRevisionId)) return null;
      return overlay;
    },
    writeHydraulicOverlay: function (value, plotId) {
      return writeScopedOrLegacy(KEYS.hydraulicOverlay, KEYS.hydraulicOverlayByPlot, value, plotId);
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
