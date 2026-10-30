/* Pure canonical drawing-design model. No DOM, storage, or editor dependencies. */
(function (root) {
  'use strict';

  var SCHEMA = 'runye-drawing-design';
  var VERSION = 1;

  function own(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }
  function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function isDenseArray(value) {
    if (!Array.isArray(value)) return false;
    for (var i = 0; i < value.length; i++) if (!own(value, i)) return false;
    return true;
  }
  function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }
  function fail(code, detail) { return { ok: false, error: code, detail: detail || null }; }
  function isFiniteNumberMap(value) {
    return isObject(value) && Object.keys(value).every(function (key) {
      return Number.isFinite(value[key]);
    });
  }
  function isDenseFiniteNumberArray(value) {
    if (!isDenseArray(value)) return false;
    for (var i = 0; i < value.length; i++) {
      if (!own(value, i) || !Number.isFinite(value[i])) return false;
    }
    return true;
  }
  function isOptionalFiniteNumberArray(value) {
    return value == null || isDenseFiniteNumberArray(value);
  }

  function validateNetwork(network, label, errors) {
    var required = ['mainPipes', 'branchPipes', 'subBranchPipes', 'valves'];
    if (!isObject(network)) { errors.push(label + ':invalid-network'); return; }
    required.forEach(function (key) {
      if (!isDenseArray(network[key])) errors.push(label + ':' + key + '-must-be-array');
    });
    if (network.source !== null && !isObject(network.source)) errors.push(label + ':invalid-source');
    if (!isObject(network.ids) || !isDenseArray(network.ids.main) || !isDenseArray(network.ids.branch) || !isDenseArray(network.ids.subbranch)) {
      errors.push(label + ':invalid-pipe-ids');
    }
    if (!isObject(network.hidden) || !isObject(network.hidden.main) || !isObject(network.hidden.branch) || !isObject(network.hidden.subbranch)) {
      errors.push(label + ':invalid-hidden-state');
    }
    if (!Number.isSafeInteger(network.nextPipeId) || network.nextPipeId < 1) errors.push(label + ':invalid-next-pipe-id');
  }

  function validatePlot(plot, index, errors) {
    var prefix = 'plots[' + index + ']';
    if (!isObject(plot)) { errors.push(prefix + ':invalid-plot'); return; }
    if (typeof plot.plotId !== 'string' || !plot.plotId.trim()) errors.push(prefix + ':missing-plot-id');
    if (!isObject(plot.geometry)) errors.push(prefix + ':missing-geometry');
    else {
      var geometry = plot.geometry;
      if (geometry.coordinateSystem !== 'local-meter') errors.push(prefix + ':unsupported-coordinate-system');
      if (typeof geometry.frameId !== 'string' || !geometry.frameId.trim()) errors.push(prefix + ':missing-frame-id');
      if (!Array.isArray(geometry.boundary) || geometry.boundary.length < 3) errors.push(prefix + ':invalid-boundary');
      else for (var pointIndex = 0; pointIndex < geometry.boundary.length; pointIndex++) {
        var point = geometry.boundary[pointIndex];
        if (!own(geometry.boundary, pointIndex) || !isObject(point) || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
          errors.push(prefix + ':invalid-boundary-point-' + pointIndex);
        }
      }
    }
    if (!isObject(plot.partition)) errors.push(prefix + ':missing-partition');
    else {
      var partition = plot.partition;
      if (!Number.isFinite(partition.angleDeg) || partition.angleDeg < -180 || partition.angleDeg > 180) errors.push(prefix + ':invalid-partition-angle');
      if (partition.mode !== 'auto' && partition.mode !== 'manual') errors.push(prefix + ':invalid-partition-mode');
      ['xCuts', 'yCuts'].forEach(function (key) {
        if (!isDenseFiniteNumberArray(partition[key])) {
          errors.push(prefix + ':invalid-' + key);
        }
      });
      if (partition.cutSnap != null && (!isObject(partition.cutSnap) || typeof partition.cutSnap.sig !== 'string' ||
        !isOptionalFiniteNumberArray(partition.cutSnap.x) || !isOptionalFiniteNumberArray(partition.cutSnap.y))) {
        errors.push(prefix + ':invalid-cut-snapshot');
      }
      if (!isObject(partition.stepOverrides) || !isObject(partition.stepOverrides.x) || !isObject(partition.stepOverrides.y)) {
        errors.push(prefix + ':invalid-step-overrides');
      } else {
        if (partition.stepOverrides.sig != null && typeof partition.stepOverrides.sig !== 'string') errors.push(prefix + ':invalid-step-signature');
        ['x', 'y'].forEach(function (axis) {
          if (Object.keys(partition.stepOverrides[axis]).some(function (key) { return !Number.isFinite(partition.stepOverrides[axis][key]); })) {
            errors.push(prefix + ':invalid-step-override-value-' + axis);
          }
        });
        var slotOverrides = partition.stepOverrides.slotOverrides;
        if (slotOverrides != null && (!isObject(slotOverrides) || !isFiniteNumberMap(slotOverrides.x) || !isFiniteNumberMap(slotOverrides.y))) {
          errors.push(prefix + ':invalid-slot-cut-overrides');
        }
      }
      if (typeof partition.areaLocked !== 'boolean') errors.push(prefix + ':invalid-area-lock');
    }
    validateNetwork(plot.network, prefix + '.network', errors);
    if (!Number.isSafeInteger(plot.revision) || plot.revision < 0) errors.push(prefix + ':invalid-revision');
  }

  function validate(design) {
    var errors = [];
    if (!isObject(design)) return { ok: false, errors: ['invalid-design'] };
    if (design.schema !== SCHEMA) errors.push('invalid-schema');
    if (design.version !== VERSION) errors.push('unsupported-version');
    if (typeof design.projectId !== 'string' || !design.projectId.trim()) errors.push('missing-project-id');
    if (!Number.isSafeInteger(design.revision) || design.revision < 0) errors.push('invalid-design-revision');
    if (!isDenseArray(design.plots)) errors.push('plots-must-be-array');
    else {
      var plotIds = Object.create(null);
      design.plots.forEach(function (plot, index) {
        validatePlot(plot, index, errors);
        if (plot && typeof plot.plotId === 'string') {
          if (own(plotIds, plot.plotId)) errors.push('duplicate-plot-id:' + plot.plotId);
          plotIds[plot.plotId] = true;
        }
      });
    }
    if (!isDenseArray(design.groups)) errors.push('groups-must-be-array');
    else {
      var groupIds = Object.create(null);
      design.groups.forEach(function (group, index) {
        var prefix = 'groups[' + index + ']';
        if (!isObject(group)) { errors.push(prefix + ':invalid-group'); return; }
        if (typeof group.groupId !== 'string' || !group.groupId.trim()) errors.push(prefix + ':missing-group-id');
        if (group.revision != null && (!Number.isSafeInteger(group.revision) || group.revision < 0)) errors.push(prefix + ':invalid-group-revision');
        else if (own(groupIds, group.groupId)) errors.push('duplicate-group-id:' + group.groupId);
        else groupIds[group.groupId] = true;
        if (!isDenseArray(group.memberPlotIds)) errors.push(prefix + ':invalid-members');
        else {
          var members = Object.create(null);
          group.memberPlotIds.forEach(function (id) {
            if (typeof id !== 'string' || !id.trim() || members[id]) errors.push(prefix + ':invalid-or-duplicate-member');
            else {
              members[id] = true;
              if (!Array.isArray(design.plots) || !design.plots.some(function (plot) { return plot && plot.plotId === id; })) {
                errors.push(prefix + ':unknown-member:' + id);
              }
            }
          });
        }
        if (!isObject(group.trunkNetwork) || !Array.isArray(group.trunkNetwork.pipes) || !Array.isArray(group.trunkNetwork.nodes)) {
          errors.push(prefix + ':invalid-trunk-network');
        }
      });
    }
    return { ok: errors.length === 0, errors: errors };
  }

  /* Plot revision is the source revision for level-three generation. Generated
     geometry and its geometry-bound edits live in the canonical plot record, but
     changing those downstream records must not make their own source revision
     stale. L2 design inputs still advance the plot revision. */
  function plotRevisionComparable(plot) {
    var value = clone(plot);
    if (!value) return null;
    delete value.revision;
    delete value.generated;
    if (value.network) delete value.network.level3Edits;
    return JSON.stringify(value);
  }

  function createEmpty(projectId) {
    var design = { schema: SCHEMA, version: VERSION, projectId: String(projectId || ''), revision: 0, plots: [], groups: [] };
    var result = validate(design);
    return result.ok ? design : fail('invalid-project-id', result.errors);
  }

  function createPlot(plotId, geometry, initial) {
    var source = initial || {};
    var plot = {
      plotId: String(plotId || ''),
      revision: Number.isSafeInteger(source.revision) && source.revision >= 0 ? source.revision : 0,
      geometry: clone(geometry),
      partition: clone(source.partition || { angleDeg: 0, mode: 'auto', xCuts: [], yCuts: [], cutSnap: null, stepOverrides: { x: {}, y: {} }, areaLocked: false }),
      network: clone(source.network || { mainPipes: [], branchPipes: [], subBranchPipes: [], source: null, valves: [], ids: { main: [], branch: [], subbranch: [] }, hidden: { main: {}, branch: {}, subbranch: {} }, nextPipeId: 1 })
    };
    var errors = [];
    validatePlot(plot, 0, errors);
    return errors.length ? fail('invalid-plot', errors) : plot;
  }

  function transact(design, expectedRevision, operation) {
    var before = validate(design);
    if (!before.ok) return fail('invalid-current-design', before.errors);
    if (design.revision !== expectedRevision) return fail('revision-conflict', { expected: expectedRevision, actual: design.revision });
    if (typeof operation !== 'function') return fail('invalid-operation');
    var next;
    try {
      next = clone(design);
      operation(next);
    } catch (error) {
      return fail('operation-failed', String(error && error.message || error));
    }
    if (!isObject(next) || next.schema !== SCHEMA || next.version !== VERSION || next.projectId !== design.projectId) {
      return fail('immutable-design-identity');
    }
    var priorPlots = Object.create(null);
    design.plots.forEach(function (plot) { priorPlots[plot.plotId] = plot; });
    next.plots.forEach(function (plot) {
      var prior = priorPlots[plot.plotId];
      if (!prior) return;
      plot.revision = prior.revision + (plotRevisionComparable(prior) === plotRevisionComparable(plot) ? 0 : 1);
    });
    var priorGroups = Object.create(null);
    design.groups.forEach(function (group) { priorGroups[group.groupId] = group; });
    next.groups.forEach(function (group) {
      var prior = priorGroups[group.groupId];
      if (!prior) { group.revision = Number.isSafeInteger(group.revision) && group.revision >= 0 ? group.revision : 0; return; }
      var beforeGroup = clone(prior), afterGroup = clone(group);
      delete beforeGroup.revision;
      delete afterGroup.revision;
      group.revision = (Number.isSafeInteger(prior.revision) ? prior.revision : 0) +
        (JSON.stringify(beforeGroup) === JSON.stringify(afterGroup) ? 0 : 1);
    });
    next.revision = design.revision + 1;
    var after = validate(next);
    if (!after.ok) return fail('invalid-transaction-result', after.errors);
    return { ok: true, design: next };
  }

  function updatePlot(design, plotId, expectedRevision, operation) {
    return transact(design, expectedRevision, function (next) {
      var matches = next.plots.filter(function (plot) { return plot.plotId === plotId; });
      if (matches.length !== 1) throw new Error(matches.length ? 'ambiguous-plot-id' : 'plot-not-found');
      operation(matches[0]);
    });
  }

  function updateGroup(design, groupId, expectedRevision, operation) {
    return transact(design, expectedRevision, function (next) {
      var matches = next.groups.filter(function (group) { return group.groupId === groupId; });
      if (matches.length !== 1) throw new Error(matches.length ? 'ambiguous-group-id' : 'group-not-found');
      operation(matches[0]);
    });
  }

  function addPlot(design, plot, expectedRevision) {
    return transact(design, expectedRevision, function (next) {
      if (next.plots.some(function (item) { return item.plotId === plot.plotId; })) throw new Error('duplicate-plot-id');
      next.plots.push(clone(plot));
    });
  }

  function addGroup(design, group, expectedRevision) {
    return transact(design, expectedRevision, function (next) {
      if (next.groups.some(function (item) { return item.groupId === group.groupId; })) throw new Error('duplicate-group-id');
      next.groups.push(clone(group));
    });
  }

  function removePlot(design, plotId, expectedRevision) {
    return transact(design, expectedRevision, function (next) {
      if (next.groups.some(function (group) { return group.memberPlotIds.indexOf(plotId) !== -1; })) throw new Error('plot-is-group-member');
      var index = next.plots.findIndex(function (plot) { return plot.plotId === plotId; });
      if (index < 0) throw new Error('plot-not-found');
      next.plots.splice(index, 1);
    });
  }

  var api = Object.freeze({
    schema: SCHEMA,
    version: VERSION,
    clone: clone,
    validate: validate,
    createEmpty: createEmpty,
    createPlot: createPlot,
    updatePlot: updatePlot,
    updateGroup: updateGroup,
    addPlot: addPlot,
    addGroup: addGroup,
    removePlot: removePlot
  });
  root.RyDrawingDesignModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
