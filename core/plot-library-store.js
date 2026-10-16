/* Shared synchronous store for runye_plot_library. */
(function (root) {
  'use strict';

  var KEY = 'runye_plot_library';

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
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

  root.RyPlotLibraryStore = { key: KEY, read: read, replace: replace, update: update };
})(typeof window !== 'undefined' ? window : globalThis);
