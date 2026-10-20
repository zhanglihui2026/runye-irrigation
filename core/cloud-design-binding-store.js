/* Bind a cloud plot id to the exact local plot imported and selected in this tab. */
(function (root) {
  'use strict';

  var PENDING_KEY = 'ry_cloud_plot_import_context_v1';
  var BINDING_KEY = 'ry_cloud_design_binding_v1';
  var LEGACY_KEY = 'ry_cloud_plot_id';

  function normalizedId(value) {
    return value == null || value === '' ? null : String(value);
  }

  function validCloudId(value) {
    if (value == null || value === '') return null;
    var text = String(value).trim();
    if (!/^\d+$/.test(text)) return null;
    var id = Number(text);
    return Number.isSafeInteger(id) && id > 0 ? String(id) : null;
  }

  function ringKey(ring) {
    if (!Array.isArray(ring) || ring.length < 3) return null;
    var result = [];
    for (var i = 0; i < ring.length; i++) {
      var point = ring[i];
      var lat = Array.isArray(point) ? Number(point[0]) : Number(point && point.lat);
      var lng = Array.isArray(point) ? Number(point[1]) : Number(point && point.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
      result.push([+lat.toFixed(7), +lng.toFixed(7)]);
    }
    return result;
  }

  function geometryKey(plotOrRing) {
    var rings = [];
    if (Array.isArray(plotOrRing)) {
      rings.push(ringKey(plotOrRing));
    } else if (plotOrRing && plotOrRing.merged) {
      var set = Array.isArray(plotOrRing.polyLatLngSet) ? plotOrRing.polyLatLngSet : [];
      var subs = Array.isArray(plotOrRing.subPlots) ? plotOrRing.subPlots : [];
      var count = Math.max(set.length, subs.length);
      for (var i = 0; i < count; i++) rings.push(ringKey(set[i] || (subs[i] && subs[i].polyLatLng)));
    } else {
      rings.push(ringKey(plotOrRing && plotOrRing.polyLatLng));
    }
    if (!rings.length || rings.some(function (ring) { return !ring; })) return null;
    return JSON.stringify(rings);
  }

  function readSession(key) {
    try {
      var raw = root.sessionStorage.getItem(key);
      if (!raw) return null;
      var value = JSON.parse(raw);
      return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
    } catch (error) { return null; }
  }

  function writeSession(key, value) {
    try {
      root.sessionStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) { return false; }
  }

  function removeSession(key) {
    try { root.sessionStorage.removeItem(key); } catch (error) { }
  }

  function clear() {
    removeSession(PENDING_KEY);
    removeSession(BINDING_KEY);
    try { root.localStorage.removeItem(LEGACY_KEY); } catch (error) { }
    return true;
  }

  function beginCloudImport(cloudPlotId, ring) {
    clear();
    var cloudId = validCloudId(cloudPlotId);
    var key = geometryKey(ring);
    if (!cloudId || !key) return { ok: false, error: !cloudId ? 'invalid-cloud-plot-id' : 'invalid-cloud-ring' };
    var saved = writeSession(PENDING_KEY, { version: 1, cloudPlotId: cloudId, geometryKey: key });
    return saved ? { ok: true } : { ok: false, error: 'session-storage-unavailable' };
  }

  function bindTransferredPlot(plot) {
    var pending = readSession(PENDING_KEY);
    if (!pending) return { ok: false, error: 'no-pending-cloud-import' };
    var localPlotId = normalizedId(plot && plot.id);
    var key = geometryKey(plot);
    if (!localPlotId || !key || key !== pending.geometryKey) {
      clear();
      return { ok: false, error: 'transferred-plot-does-not-match-cloud-ring' };
    }
    var plotStore = root.RyPlotLibraryStore;
    var library = plotStore && typeof plotStore.read === 'function' ? plotStore.read() : null;
    if (!library || library.ok !== true || !Array.isArray(library.plots)) {
      clear();
      return { ok: false, error: 'plot-library-unavailable' };
    }
    var idMatches = library.plots.filter(function (entry) { return entry && normalizedId(entry.id) === localPlotId; });
    if (idMatches.length !== 1 || geometryKey(idMatches[0]) !== key) {
      clear();
      return { ok: false, error: idMatches.length > 1 ? 'duplicate-local-plot-id' : 'local-plot-changed' };
    }
    var geometryMatches = library.plots.filter(function (entry) { return entry && geometryKey(entry) === key; });
    if (geometryMatches.length !== 1) {
      clear();
      return { ok: false, error: 'ambiguous-local-plot-geometry' };
    }
    if (!writeSession(BINDING_KEY, {
      version: 1,
      cloudPlotId: pending.cloudPlotId,
      localPlotId: localPlotId,
      geometryKey: key
    })) {
      clear();
      return { ok: false, error: 'session-storage-unavailable' };
    }
    removeSession(PENDING_KEY);
    try { root.localStorage.removeItem(LEGACY_KEY); } catch (error) { }
    return { ok: true, cloudPlotId: pending.cloudPlotId, localPlotId: localPlotId };
  }

  function resolveForCurrentPlot() {
    var binding = readSession(BINDING_KEY);
    if (!binding || binding.version !== 1 || !validCloudId(binding.cloudPlotId) || !normalizedId(binding.localPlotId) || !binding.geometryKey) {
      return { ok: false, error: 'cloud-plot-not-bound' };
    }
    var localPlotId = normalizedId(root.currentPlotId);
    if (!localPlotId || localPlotId !== normalizedId(binding.localPlotId)) {
      return { ok: false, error: 'current-plot-mismatch' };
    }
    var irrigationStore = root.RyIrrigationDataStore;
    var anchor = irrigationStore && typeof irrigationStore.readCurrentPlotAnchor === 'function'
      ? irrigationStore.readCurrentPlotAnchor() : null;
    if (!anchor || anchor.ok !== true || normalizedId(anchor.id) !== localPlotId) {
      return { ok: false, error: 'current-plot-anchor-mismatch' };
    }
    var plotStore = root.RyPlotLibraryStore;
    var library = plotStore && typeof plotStore.read === 'function' ? plotStore.read() : null;
    if (!library || library.ok !== true || !Array.isArray(library.plots)) {
      return { ok: false, error: 'plot-library-unavailable' };
    }
    var matches = library.plots.filter(function (entry) { return entry && normalizedId(entry.id) === localPlotId; });
    if (matches.length !== 1) return { ok: false, error: matches.length ? 'duplicate-local-plot-id' : 'local-plot-not-found' };
    if (geometryKey(matches[0]) !== binding.geometryKey) return { ok: false, error: 'local-plot-geometry-mismatch' };
    return { ok: true, cloudPlotId: validCloudId(binding.cloudPlotId), localPlotId: localPlotId };
  }

  root.RyCloudDesignBindingStore = {
    keys: { pending: PENDING_KEY, binding: BINDING_KEY, legacy: LEGACY_KEY },
    geometryKey: geometryKey,
    clear: clear,
    beginCloudImport: beginCloudImport,
    bindTransferredPlot: bindTransferredPlot,
    resolveForCurrentPlot: resolveForCurrentPlot
  };
})(typeof window !== 'undefined' ? window : globalThis);
