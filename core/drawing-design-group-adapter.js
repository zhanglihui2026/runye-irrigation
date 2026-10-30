/* Explicit, loss-aware conversion between legacy group snapshots and the canonical model. */
(function (root) {
  'use strict';

  function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function fail(error, detail) { return { ok: false, error: error, detail: detail || null }; }
  function validRing(points) {
    if (!Array.isArray(points) || points.length < 3) return false;
    for (var i = 0; i < points.length; i++) {
      var point = points[i];
      if (!Object.prototype.hasOwnProperty.call(points, i) || !isObject(point) ||
          !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) return false;
    }
    return true;
  }
  function sameRing(a, b) {
    if (!validRing(a) || !validRing(b) || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (Number(a[i].x) !== Number(b[i].x) || Number(a[i].y) !== Number(b[i].y)) return false;
    }
    return true;
  }
  function sameJsonValue(a, b) {
    if (a === b) return true;
    if (Array.isArray(a) || Array.isArray(b)) {
      return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every(function (value, index) {
        return sameJsonValue(value, b[index]);
      });
    }
    if (!isObject(a) || !isObject(b)) return false;
    var aKeys = Object.keys(a).sort(), bKeys = Object.keys(b).sort();
    return aKeys.length === bKeys.length && aKeys.every(function (key, index) {
      return key === bKeys[index] && sameJsonValue(a[key], b[key]);
    });
  }
  function groupPlanOf(snapshot) {
    return isObject(snapshot) && isObject(snapshot.groupPlan) ? snapshot.groupPlan : snapshot;
  }
  function hasId(value) { return typeof value === 'string' && value.trim().length > 0; }
  function hasLevel3State(snapshot) {
    return !!(snapshot && (snapshot.tlDiagramData != null ||
      (snapshot.isoDiagram && snapshot.isoDiagram.data != null) ||
      snapshot.tlEditPipes != null || snapshot.tlAutoEdits != null ||
      (Array.isArray(snapshot.manualGroups) && snapshot.manualGroups.length) ||
      snapshot.tlAux != null));
  }
  function blockLevel3Snapshot(block) {
    var state = isObject(block && block.tlState) ? block.tlState : {};
    return {
      tlDiagramData: block && block.tlData,
      tlEditPipes: state.edits == null ? null : state.edits,
      tlAutoEdits: state.auto == null ? null : state.auto,
      manualGroups: Array.isArray(state.groups) ? state.groups : [],
      tlAux: state.nodes == null ? null : { nodes: state.nodes }
    };
  }
  function hasBlockLevel3State(block) {
    var state = isObject(block && block.tlState) ? block.tlState : {};
    return !!(block && block.tlData != null || state.edits != null || state.auto != null ||
      (Array.isArray(state.groups) && state.groups.length) || state.nodes != null);
  }

  function slotToPlot(model, sub, slot, block, index, frameId) {
    if (!isObject(slot) || !sameRing(slot.polyPts, sub.poly)) return fail('group-slot-geometry-mismatch', index);
    var cuts = slot.partitionCuts;
    if (cuts != null && (!isObject(cuts) || !Array.isArray(cuts.x) || !Array.isArray(cuts.y))) {
      return fail('invalid-group-partition-cuts', index);
    }
    if (!Array.isArray(slot.mainPipes) || !Array.isArray(slot.branchPipes) || !Array.isArray(slot.subBranchPipes) ||
      !Array.isArray(slot.valves) || !isObject(slot.pipeIds) || !isObject(slot.hiddenPipes) ||
      !Number.isSafeInteger(slot.nextPipeId) || slot.nextPipeId < 1) return fail('invalid-group-slot', index);
    var angle = Number.isFinite(Number(slot.zoneAngleDeg)) ? Number(slot.zoneAngleDeg) : (slot.zoneRotated ? 90 : 0);
    var overrides = slot.cutOverrides == null ? { x: {}, y: {} } : slot.cutOverrides;
    if (!isObject(overrides) || !isObject(overrides.x) || !isObject(overrides.y)) return fail('invalid-group-cut-overrides', index);
    var savedStep = isObject(block && block.tlState) ? block.tlState.step : null;
    if (savedStep != null && (!isObject(savedStep) || typeof savedStep.sig !== 'string' ||
      !isObject(savedStep.x) || !isObject(savedStep.y))) return fail('invalid-group-step-overrides', index);
    var plot = model.createPlot(String(sub.id), {
      coordinateSystem: 'local-meter',
      frameId: frameId,
      boundary: sub.poly.map(function (p) { return { x: Number(p.x), y: Number(p.y) }; }),
      sourceRef: { plotLibraryId: String(sub.id), source: 'legacy-group' }
    }, {
      revision: 0,
      partition: {
        angleDeg: angle,
        mode: slot.zoneAuto === false ? 'manual' : 'auto',
        xCuts: cuts ? clone(cuts.x) : [],
        yCuts: cuts ? clone(cuts.y) : [],
        cutSnap: slot.cutSnap == null ? null : clone(slot.cutSnap),
        stepOverrides: {
          sig: savedStep ? savedStep.sig : '',
          x: savedStep ? clone(savedStep.x) : {},
          y: savedStep ? clone(savedStep.y) : {},
          slotOverrides: clone(overrides)
        },
        areaLocked: slot.areaLocked === true
      },
      network: {
        mainPipes: clone(slot.mainPipes),
        branchPipes: clone(slot.branchPipes),
        subBranchPipes: clone(slot.subBranchPipes),
        source: slot.source == null ? null : clone(slot.source),
        valves: clone(slot.valves),
        ids: clone(slot.pipeIds),
        hidden: clone(slot.hiddenPipes),
        nextPipeId: slot.nextPipeId
      }
    });
    return plot && plot.ok === false ? fail('group-plot-conversion-failed', { index: index, detail: plot.detail }) : { ok: true, plot: plot };
  }

  function fromGroupSnapshot(snapshot, options) {
    var model = root.RyDrawingDesignModel;
    options = options || {};
    if (!model || typeof model.createEmpty !== 'function' || typeof model.addGroup !== 'function') return fail('model-not-loaded');
    if (!isObject(snapshot)) return fail('invalid-project-snapshot');
    var saved = groupPlanOf(snapshot), subs = saved && saved.subPlots, edit = saved && saved.edit;
    if (!isObject(saved) || saved.version !== 1 || !validRing(saved.frame) || !Array.isArray(subs) || subs.length < 2 ||
      !edit || !Array.isArray(edit.slots) || edit.slots.length !== subs.length) return fail('invalid-group-snapshot');
    if (typeof options.projectId !== 'string' || !options.projectId.trim()) return fail('project-id-required');
    if (!hasId(options.groupId)) return fail('group-id-required');
    if (typeof options.frameId !== 'string' || !options.frameId.trim()) return fail('coordinate-frame-id-required');
    if (!isObject(saved.trunk) || !Array.isArray(saved.trunk.lines) || !Number.isFinite(Number(saved.trunk.dn)) || Number(saved.trunk.dn) <= 0) {
      return fail('invalid-group-trunk');
    }
    if (!Array.isArray(edit.trunkPipes) || !sameJsonValue(edit.trunkPipes, saved.trunk.lines) ||
      !Number.isFinite(Number(edit.trunkDn)) || Number(edit.trunkDn) !== Number(saved.trunk.dn)) return fail('group-trunk-conflict');
    if (!Array.isArray(saved.blocks) || saved.blocks.length !== subs.length ||
      edit.slots.some(function (slot) { return !isObject(slot); })) return fail('invalid-group-blocks');

    var ids = Object.create(null), plots = [];
    for (var i = 0; i < subs.length; i++) {
      var sub = subs[i], block = saved.blocks[i];
      if (!isObject(sub) || !hasId(sub.id) || ids[sub.id] || !validRing(sub.poly)) return fail('invalid-or-duplicate-group-member', i);
      ids[sub.id] = true;
      if (!isObject(block) || String(block.id) !== sub.id || !sameRing(block.ring, sub.poly)) return fail('group-block-binding-mismatch', i);
      var converted = slotToPlot(model, sub, edit.slots[i], block, i, options.frameId);
      if (!converted.ok) return converted;
      plots.push(converted.plot);
    }

    var level3Adapter = root.RyDrawingDesignLevel3Adapter;
    var sessionByPlot = Object.create(null);
    for (var l = 0; l < plots.length; l++) {
      var memberBlock = saved.blocks[l];
      if (!hasBlockLevel3State(memberBlock)) continue;
      if (!isObject(memberBlock.tlData) || !sameRing(memberBlock.tlData.poly, subs[l].poly)) {
        return fail('level3-group-member-geometry-mismatch', l);
      }
      if (!level3Adapter || typeof level3Adapter.fromProjectSnapshot !== 'function') return fail('level3-adapter-not-loaded');
      var memberLevel3 = level3Adapter.fromProjectSnapshot(blockLevel3Snapshot(memberBlock), { sourceRevision: plots[l].revision });
      if (!memberLevel3.ok) return memberLevel3;
      if (memberLevel3.generated) plots[l].generated = clone(memberLevel3.generated);
      if (memberLevel3.edits) plots[l].network.level3Edits = clone(memberLevel3.edits);
      sessionByPlot[plots[l].plotId] = clone(memberLevel3.sessionState);
    }
    /* Project-level L3 fields have no stable member owner in a group snapshot.
       Never attach the currently visible block's state to the group itself. */
    if (hasLevel3State(snapshot) || (saved !== snapshot && hasLevel3State(saved))) {
      return fail('group-level3-member-binding-required');
    }

    var design = model.createEmpty(options.projectId);
    if (!design || design.ok === false) return fail('design-creation-failed', design && design.detail || design);
    for (var p = 0; p < plots.length; p++) {
      var addedPlot = model.addPlot(design, plots[p], design.revision);
      if (!addedPlot.ok) return addedPlot;
      design = addedPlot.design;
    }
    var group = {
      groupId: options.groupId,
      memberPlotIds: subs.map(function (subPlot) { return String(subPlot.id); }),
      trunkNetwork: { pipes: clone(saved.trunk.lines), nodes: [], source: null, dn: Number(saved.trunk.dn) }
    };
    var addedGroup = model.addGroup(design, group, design.revision);
    if (!addedGroup.ok) return addedGroup;

    return {
      ok: true,
      design: addedGroup.design,
      groupId: options.groupId,
      legacyBaseline: clone(snapshot),
      editorState: {
        groupMode: edit.mode === 'perPlot' ? 'perPlot' : 'whole',
        current: edit.current,
        frame: clone(saved.frame),
        trunkHidden: edit.trunkHidden == null ? null : clone(edit.trunkHidden),
        defaults: saved.defaults == null ? null : clone(saved.defaults),
        dnOver: saved.dnOver == null ? null : clone(saved.dnOver)
      },
      derived: {
        blocks: clone(saved.blocks),
        level3SessionStateByPlot: sessionByPlot
      }
    };
  }

  function plotToSlot(plot, slot) {
    var stepOverrides = isObject(plot.partition.stepOverrides) ? plot.partition.stepOverrides : {};
    var slotOverrides = isObject(stepOverrides.slotOverrides) ? stepOverrides.slotOverrides : stepOverrides;
    return Object.assign({}, clone(slot), {
      polyPts: clone(plot.geometry.boundary),
      mainPipes: clone(plot.network.mainPipes),
      branchPipes: clone(plot.network.branchPipes),
      subBranchPipes: clone(plot.network.subBranchPipes),
      source: clone(plot.network.source),
      valves: clone(plot.network.valves),
      pipeIds: clone(plot.network.ids),
      hiddenPipes: clone(plot.network.hidden),
      nextPipeId: plot.network.nextPipeId,
      partitionCuts: { x: clone(plot.partition.xCuts), y: clone(plot.partition.yCuts) },
      cutSnap: plot.partition.cutSnap == null ? null : clone(plot.partition.cutSnap),
      cutOverrides: clone(slotOverrides),
      areaLocked: plot.partition.areaLocked,
      zoneAngleDeg: plot.partition.angleDeg,
      zoneRotated: Math.abs(Math.abs(plot.partition.angleDeg) - 90) < 0.001,
      zoneAuto: plot.partition.mode === 'auto',
      mergePreview: null
    });
  }

  function toLegacyMemberSlot(design, groupId, plotId, baselineSlot) {
    var model = root.RyDrawingDesignModel;
    if (!model || typeof model.validate !== 'function') return fail('model-not-loaded');
    var check = model.validate(design);
    if (!check.ok) return fail('invalid-canonical-design', check.errors);
    if (!hasId(groupId) || !hasId(plotId)) return fail('group-member-binding-required');
    var groups = design.groups.filter(function (group) { return group.groupId === groupId; });
    if (groups.length !== 1) return fail(groups.length ? 'ambiguous-group-id' : 'group-not-found');
    if (groups[0].memberPlotIds.filter(function (id) { return id === plotId; }).length !== 1) {
      return fail('group-member-binding-mismatch');
    }
    var plots = design.plots.filter(function (plot) { return plot.plotId === plotId; });
    if (plots.length !== 1) return fail(plots.length ? 'ambiguous-plot-id' : 'group-member-plot-not-found');
    return { ok: true, slot: plotToSlot(plots[0], isObject(baselineSlot) ? baselineSlot : {}) };
  }

  function toLegacyPatch(design, groupId, baseline) {
    var model = root.RyDrawingDesignModel;
    if (!model || typeof model.validate !== 'function') return fail('model-not-loaded');
    var check = model.validate(design);
    if (!check.ok) return fail('invalid-canonical-design', check.errors);
    if (!hasId(groupId) || !isObject(baseline)) return fail('group-binding-required');
    var saved = groupPlanOf(baseline);
    if (!isObject(saved) || saved.version !== 1 || !Array.isArray(saved.subPlots) || !saved.edit || !Array.isArray(saved.edit.slots)) {
      return fail('legacy-group-baseline-required');
    }
    var groups = design.groups.filter(function (group) { return group.groupId === groupId; });
    if (groups.length !== 1) return fail(groups.length ? 'ambiguous-group-id' : 'group-not-found');
    var group = groups[0], subs = saved.subPlots;
    if (group.memberPlotIds.length !== subs.length || saved.edit.slots.length !== subs.length) return fail('group-membership-changed');
    var plots = Object.create(null);
    design.plots.forEach(function (plot) { plots[plot.plotId] = plot; });
    var nextGroupPlan = clone(saved);
    if (!Array.isArray(saved.blocks) || saved.blocks.length !== subs.length) return fail('invalid-group-blocks');
    for (var i = 0; i < subs.length; i++) {
      var sub = subs[i], plotId = String(sub && sub.id || ''), plot = plots[plotId];
      if (!isObject(sub) || !plot || group.memberPlotIds[i] !== plotId) return fail('group-member-binding-mismatch', i);
      if (!sameRing(plot.geometry.boundary, sub.poly)) return fail('group-geometry-export-requires-frame-adapter', i);
      nextGroupPlan.edit.slots[i] = plotToSlot(plot, nextGroupPlan.edit.slots[i]);
    }
    var trunk = group.trunkNetwork;
    if (!Array.isArray(trunk.pipes) || (Array.isArray(trunk.nodes) && trunk.nodes.length) || trunk.source != null ||
      !Number.isFinite(Number(trunk.dn)) || Number(trunk.dn) <= 0) return fail('legacy-group-trunk-not-representable');
    nextGroupPlan.trunk = Object.assign({}, nextGroupPlan.trunk, { lines: clone(trunk.pipes), dn: Number(trunk.dn) });
    nextGroupPlan.edit.trunkPipes = clone(trunk.pipes);
    nextGroupPlan.edit.trunkDn = Number(trunk.dn);

    var out = clone(baseline);
    if (hasLevel3State(out) || (saved !== baseline && hasLevel3State(saved))) {
      return fail('group-level3-member-binding-required');
    }
    for (var b = 0; b < subs.length; b++) {
      var block = nextGroupPlan.blocks[b], plot = plots[String(subs[b] && subs[b].id || '')];
      if (!isObject(block) || String(block.id) !== String(subs[b] && subs[b].id || '') ||
        !sameRing(block.ring, subs[b].poly)) return fail('group-block-binding-mismatch', b);
      var stepOverrides = plot.partition.stepOverrides || { sig: '', x: {}, y: {} };
      var stepState = { sig: stepOverrides.sig || '', x: clone(stepOverrides.x || {}), y: clone(stepOverrides.y || {}) };
      if (stepState.sig || Object.keys(stepState.x).length || Object.keys(stepState.y).length) {
        block.tlState = Object.assign({}, isObject(block.tlState) ? block.tlState : {}, { step: stepState });
      } else if (isObject(block.tlState) && Object.prototype.hasOwnProperty.call(block.tlState, 'step')) {
        delete block.tlState.step;
        if (!Object.keys(block.tlState).length) block.tlState = null;
      }
      var blockHasLevel3 = hasBlockLevel3State(block);
      if (!plot.generated) {
        if (blockHasLevel3) return fail('level3-adapter-state-missing', b);
        continue;
      }
      var level3Adapter = root.RyDrawingDesignLevel3Adapter;
      if (!level3Adapter || typeof level3Adapter.toProjectPatch !== 'function') return fail('level3-adapter-not-loaded');
      var blockSnapshot = blockLevel3Snapshot(block);
      var level3Patch = level3Adapter.toProjectPatch({ generated: plot.generated, edits: plot.network.level3Edits },
        plot.generated.level3Geometry, plot.revision, blockSnapshot);
      if (!level3Patch.ok) return fail('level3-regeneration-required', { index: b, error: level3Patch.error });
      block.tlData = clone(level3Patch.snapshot.tlDiagramData);
      block.tlState = Object.assign({}, isObject(block.tlState) ? block.tlState : {}, {
        edits: clone(level3Patch.snapshot.tlEditPipes),
        auto: clone(level3Patch.snapshot.tlAutoEdits),
        groups: clone(level3Patch.snapshot.manualGroups)
      });
      if (level3Patch.snapshot.tlAux && level3Patch.snapshot.tlAux.nodes != null) {
        block.tlState.nodes = clone(level3Patch.snapshot.tlAux.nodes);
      } else if (isObject(block.tlState) && Object.prototype.hasOwnProperty.call(block.tlState, 'nodes')) {
        delete block.tlState.nodes;
        if (!Object.keys(block.tlState).length) block.tlState = null;
      }
    }
    if (isObject(out.groupPlan)) out.groupPlan = nextGroupPlan;
    else return { ok: true, snapshot: nextGroupPlan, requiresDiagramRegeneration: true };
    return { ok: true, snapshot: out, requiresDiagramRegeneration: true };
  }

  root.RyDrawingDesignGroupAdapter = Object.freeze({
    fromGroupSnapshot: fromGroupSnapshot,
    toLegacyPatch: toLegacyPatch,
    toLegacyMemberSlot: toLegacyMemberSlot
  });
})(typeof window !== 'undefined' ? window : globalThis);
