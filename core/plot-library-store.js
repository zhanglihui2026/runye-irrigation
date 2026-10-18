/* Shared synchronous store for runye_plot_library. */
(function (root) {
  'use strict';

  var KEY = 'runye_plot_library';

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function hasUniqueIds(plots) {
    var seen = Object.create(null);
    for (var i = 0; i < plots.length; i++) {
      var plot = plots[i];
      if (!plot || typeof plot !== 'object' || Array.isArray(plot) || plot.id == null || plot.id === '') continue;
      var id = String(plot.id);
      if (seen[id]) return false;
      seen[id] = true;
    }
    return true;
  }

  function generatedCurrentId(plotId) {
    if (plotId == null || plotId === '') return null;
    try { return 'auto-current:' + encodeURIComponent(String(plotId)); }
    catch (error) { return null; }
  }

  function generatedCurrentOwner(plot) {
    if (!plot || plot.source !== 'auto' || plot.designPlotId == null || plot.designPlotId === '') return null;
    var owner = String(plot.designPlotId);
    /* The bare ID is recognized only as a legacy record, and only when its
       explicit design owner is present. New records use a project-scoped ID. */
    return plot.id === 'auto-current' || plot.id === generatedCurrentId(owner) ? owner : null;
  }

  function ownsGeneratedCurrent(plot, owner, id) {
    return !!plot && plot.id === id && generatedCurrentOwner(plot) === owner;
  }

  function read() {
    try {
      var raw = root.localStorage.getItem(KEY);
      if (raw === null) return { ok: true, plots: [], revision: null };
      var plots = JSON.parse(raw);
      if (!Array.isArray(plots)) return { ok: false, error: 'invalid-plot-library' };
      return { ok: true, plots: plots, revision: raw };
    } catch (error) {
      return { ok: false, error: 'plot-library-read-failed', cause: error };
    }
  }

  function replace(plots, expectedRevision) {
    if (!Array.isArray(plots)) return { ok: false, error: 'invalid-plot-library' };
    if (!hasUniqueIds(plots)) return { ok: false, error: 'duplicate-plot-id' };
    var current = read();
    if (!current.ok) return current;
    if (current.revision !== expectedRevision) return { ok: false, error: 'plot-library-conflict' };
    var serialized;
    try { serialized = JSON.stringify(plots); }
    catch (error) { return { ok: false, error: 'plot-library-serialize-failed', cause: error }; }
    if (typeof serialized !== 'string') return { ok: false, error: 'plot-library-serialize-failed' };
    try {
      root.localStorage.setItem(KEY, serialized);
      return { ok: true, plots: clone(plots), revision: serialized };
    } catch (error) {
      return { ok: false, error: 'plot-library-write-failed', cause: error };
    }
  }

  function update(mutator) {
    if (typeof mutator !== 'function') return { ok: false, error: 'invalid-mutator' };
    var current = read();
    if (!current.ok) return current;
    var plots;
    try { plots = clone(current.plots); }
    catch (error) { return { ok: false, error: 'plot-library-clone-failed', cause: error }; }
    try {
      var next = mutator(plots);
      return replace(next === undefined ? plots : next, current.revision);
    } catch (error) {
      return { ok: false, error: 'plot-library-update-failed', cause: error };
    }
  }

  function upsertUnique(id, entry, expectedRevision) {
    if (typeof id !== 'string' || !id || !entry || typeof entry !== 'object' || Array.isArray(entry) || entry.id !== id) {
      return { ok: false, error: 'invalid-plot-entry' };
    }
    var current = read();
    if (!current.ok) return current;
    if (arguments.length >= 3 && current.revision !== expectedRevision) return { ok: false, error: 'plot-library-conflict' };
    var matches = [];
    for (var i = 0; i < current.plots.length; i++) {
      if (current.plots[i] && current.plots[i].id === id) matches.push(i);
    }
    if (matches.length > 1) return { ok: false, error: 'duplicate-plot-id' };
    var next = current.plots.slice();
    if (matches.length) next[matches[0]] = entry;
    else next.push(entry);
    return replace(next, current.revision);
  }

  function removeUnique(id) {
    if (typeof id !== 'string' || !id) return { ok: false, error: 'invalid-plot-id' };
    var current = read();
    if (!current.ok) return current;
    var matches = 0;
    for (var i = 0; i < current.plots.length; i++) {
      if (current.plots[i] && current.plots[i].id === id) matches++;
    }
    if (matches > 1) return { ok: false, error: 'duplicate-plot-id' };
    if (!matches) return { ok: true, plots: current.plots, revision: current.revision, unchanged: true };
    return replace(current.plots.filter(function (plot) { return !plot || plot.id !== id; }), current.revision);
  }

  function upsertGeneratedCurrent(plotId, entry) {
    var owner = plotId == null || plotId === '' ? null : String(plotId);
    var id = generatedCurrentId(owner);
    if (!owner || !id || !entry || typeof entry !== 'object' || Array.isArray(entry) ||
        entry.id !== id || entry.source !== 'auto' || String(entry.designPlotId || '') !== owner) {
      return { ok: false, error: 'invalid-generated-current-plot' };
    }
    var current = read();
    if (!current.ok) return current;
    var matches = current.plots.filter(function (plot) { return plot && plot.id === id; });
    if (matches.length > 1) return { ok: false, error: 'duplicate-plot-id' };
    if (matches.length === 1 && !ownsGeneratedCurrent(matches[0], owner, id)) {
      return { ok: false, error: 'plot-id-owned-by-other-entry' };
    }
    var legacy = current.plots.filter(function (plot) { return plot && plot.id === 'auto-current'; });
    if (legacy.length > 1 && legacy.some(function (plot) { return generatedCurrentOwner(plot) === owner; })) {
      return { ok: false, error: 'duplicate-plot-id' };
    }
    var removableLegacy = legacy.length === 1 && generatedCurrentOwner(legacy[0]) === owner ? legacy[0] : null;
    var next = [], replaced = false;
    current.plots.forEach(function (plot) {
      if (plot && plot.id === id) {
        next.push(entry);
        replaced = true;
      } else if (removableLegacy && plot === removableLegacy) {
        /* Migrate only a legacy record whose explicit owner matches. */
      } else next.push(plot);
    });
    if (!replaced) next.push(entry);
    return replace(next, current.revision);
  }

  function removeGeneratedCurrent(plotId) {
    var owner = plotId == null || plotId === '' ? null : String(plotId);
    var id = generatedCurrentId(owner);
    if (!owner || !id) return { ok: false, error: 'invalid-generated-current-plot' };
    var current = read();
    if (!current.ok) return current;
    var matches = current.plots.filter(function (plot) { return plot && plot.id === id; });
    if (matches.length > 1) return { ok: false, error: 'duplicate-plot-id' };
    if (matches.length === 1 && !ownsGeneratedCurrent(matches[0], owner, id)) {
      return { ok: false, error: 'plot-id-owned-by-other-entry' };
    }
    var legacy = current.plots.filter(function (plot) { return plot && plot.id === 'auto-current'; });
    if (legacy.length > 1 && legacy.some(function (plot) { return generatedCurrentOwner(plot) === owner; })) {
      return { ok: false, error: 'duplicate-plot-id' };
    }
    var removableLegacy = legacy.length === 1 && generatedCurrentOwner(legacy[0]) === owner ? legacy[0] : null;
    if (!matches.length && !removableLegacy) {
      return { ok: true, plots: current.plots, revision: current.revision, unchanged: true };
    }
    return replace(current.plots.filter(function (plot) {
      return !(plot && (plot.id === id && ownsGeneratedCurrent(plot, owner, id))) && plot !== removableLegacy;
    }), current.revision);
  }

  function restoreSnapshot(snapshot, expectedRevision) {
    if (!snapshot || snapshot.ok !== true || !Array.isArray(snapshot.plots) ||
        (snapshot.revision !== null && typeof snapshot.revision !== 'string')) {
      return { ok: false, error: 'invalid-plot-library-snapshot' };
    }
    if (snapshot.revision !== null) {
      try {
        if (!Array.isArray(JSON.parse(snapshot.revision))) return { ok: false, error: 'invalid-plot-library-snapshot' };
      } catch (error) { return { ok: false, error: 'invalid-plot-library-snapshot', cause: error }; }
    }
    var current = read();
    if (!current.ok) return current;
    if (current.revision !== expectedRevision) return { ok: false, error: 'plot-library-conflict' };
    try {
      if (snapshot.revision === null) root.localStorage.removeItem(KEY);
      else root.localStorage.setItem(KEY, snapshot.revision);
      return { ok: true, plots: clone(snapshot.plots), revision: snapshot.revision };
    } catch (error) {
      return { ok: false, error: 'plot-library-write-failed', cause: error };
    }
  }

  root.RyPlotLibraryStore = {
    key: KEY,
    generatedCurrentId: generatedCurrentId,
    generatedCurrentOwner: generatedCurrentOwner,
    upsertGeneratedCurrent: upsertGeneratedCurrent,
    removeGeneratedCurrent: removeGeneratedCurrent,
    read: read,
    replace: replace,
    update: update,
    upsertUnique: upsertUnique,
    removeUnique: removeUnique,
    restoreSnapshot: restoreSnapshot
  };
})(typeof window !== 'undefined' ? window : globalThis);
