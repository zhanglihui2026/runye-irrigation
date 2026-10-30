/* Explicit, loss-aware conversion between a legacy project snapshot and the canonical model. */
(function (root) {
  'use strict';

  function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function fail(error, detail) { return { ok: false, error: error, detail: detail || null }; }
  function validRing(points) {
    return Array.isArray(points) && points.length >= 3 && points.every(function (p) {
      return isObject(p) && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y));
    });
  }
  function sameRing(a, b) {
    if (!validRing(a) || !validRing(b) || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (Number(a[i].x) !== Number(b[i].x) || Number(a[i].y) !== Number(b[i].y)) return false;
    }
    return true;
  }
  function asArray(value, label) {
    if (value == null) return [];
    if (!Array.isArray(value)) throw new Error('invalid-' + label);
    return clone(value);
  }
  function rejectGroup(snapshot) {
    var group = snapshot && snapshot.groupPlan;
    return !!(group && ((Array.isArray(group.subPlots) && group.subPlots.length > 1) ||
      (group.edit && Array.isArray(group.edit.slots) && group.edit.slots.length > 1)));
  }

  function fromProjectSnapshot(snapshot, options) {
    var model = root.RyDrawingDesignModel;
    options = options || {};
    if (!model || typeof model.createEmpty !== 'function') return fail('model-not-loaded');
    if (!isObject(snapshot)) return fail('invalid-project-snapshot');
    if (rejectGroup(snapshot)) return fail('group-snapshot-requires-group-adapter');

    var plotId = options.plotId == null ? snapshot.currentPlotId : options.plotId;
    if (plotId == null || String(plotId).trim() === '') return fail('plot-id-required');
    plotId = String(plotId);
    if (snapshot.currentPlotId != null && String(snapshot.currentPlotId) !== plotId) return fail('plot-binding-mismatch');
    if (typeof options.projectId !== 'string' || !options.projectId.trim()) return fail('project-id-required');
    if (typeof options.frameId !== 'string' || !options.frameId.trim()) return fail('coordinate-frame-id-required');

    var boundary = snapshot.measuredPolygon;
    var pipePlan = isObject(snapshot.pipePlan) ? snapshot.pipePlan : {};
    if ((!validRing(boundary)) && validRing(pipePlan.polyPts)) boundary = pipePlan.polyPts;
    if (!validRing(boundary)) return fail('valid-meter-boundary-required');
    if (validRing(pipePlan.polyPts) && !sameRing(boundary, pipePlan.polyPts)) return fail('boundary-snapshot-conflict');

    var partitionCuts = pipePlan.partitionCuts;
    if (partitionCuts != null && (!isObject(partitionCuts) || !Array.isArray(partitionCuts.x) || !Array.isArray(partitionCuts.y))) {
      return fail('invalid-partition-cuts');
    }
    var cutOverrides = pipePlan.cutOverrides || { x: {}, y: {} };
    if (!isObject(cutOverrides) || !isObject(cutOverrides.x) || !isObject(cutOverrides.y)) return fail('invalid-cut-overrides');

    var initial = {
      revision: 0,
      partition: {
        angleDeg: Number.isFinite(Number(pipePlan.zoneAngleDeg)) ? Number(pipePlan.zoneAngleDeg) : (pipePlan.zoneRotated ? 90 : 0),
        mode: pipePlan.zoneAuto === false ? 'manual' : 'auto',
        xCuts: partitionCuts ? asArray(partitionCuts.x, 'x-cuts') : [],
        yCuts: partitionCuts ? asArray(partitionCuts.y, 'y-cuts') : [],
        cutSnap: pipePlan.cutSnap == null ? null : clone(pipePlan.cutSnap),
        stepOverrides: clone(cutOverrides),
        areaLocked: pipePlan.areaLocked === true
      },
      network: {
        mainPipes: asArray(pipePlan.mainPipes, 'main-pipes'),
        branchPipes: asArray(pipePlan.branchPipes, 'branch-pipes'),
        subBranchPipes: asArray(pipePlan.subBranchPipes, 'sub-branch-pipes'),
        source: pipePlan.source == null ? null : clone(pipePlan.source),
        valves: asArray(pipePlan.valves, 'valves'),
        ids: clone(pipePlan.pipeIds || { main: [], branch: [], subbranch: [] }),
        hidden: clone(pipePlan.hiddenPipes || { main: {}, branch: {}, subbranch: {} }),
        nextPipeId: Number.isSafeInteger(pipePlan.nextPipeId) && pipePlan.nextPipeId > 0 ? pipePlan.nextPipeId : 1
      }
    };
    var sourceRef = {
      plotLibraryId: plotId,
      source: typeof snapshot.measuredPolygonSource === 'string' ? snapshot.measuredPolygonSource : 'legacy-project'
    };
    if (options.geometryRevision != null) sourceRef.geometryRevision = String(options.geometryRevision);
    if (snapshot.geoBase && Number.isFinite(snapshot.geoBase.refLat) && Number.isFinite(snapshot.geoBase.refLng)) {
      sourceRef.geoBase = clone(snapshot.geoBase);
    }
    if (validRing(snapshot.mapFramePoly)) sourceRef.mapFrameBoundary = clone(snapshot.mapFramePoly);

    var plot = model.createPlot(plotId, {
      coordinateSystem: 'local-meter',
      frameId: options.frameId,
      boundary: boundary.map(function (p) { return { x: Number(p.x), y: Number(p.y) }; }),
      sourceRef: sourceRef
    }, initial);
    if (!plot || plot.ok === false) return fail('legacy-plot-conversion-failed', plot && plot.detail || plot);
    var hasLevel3 = snapshot.tlDiagramData != null || (snapshot.isoDiagram && snapshot.isoDiagram.data != null);
    if (!hasLevel3 && snapshot.tlAux && snapshot.tlAux.nodes != null) {
      return fail('level3-node-state-without-geometry');
    }
    var level3 = null;
    if (hasLevel3) {
      var level3Adapter = root.RyDrawingDesignLevel3Adapter;
      if (!level3Adapter || typeof level3Adapter.fromProjectSnapshot !== 'function') return fail('level3-adapter-not-loaded');
      level3 = level3Adapter.fromProjectSnapshot(snapshot, { sourceRevision: 0 });
      if (!level3.ok) return level3;
      if (level3.generated) plot.generated = clone(level3.generated);
      if (level3.edits) plot.network.level3Edits = clone(level3.edits);
    }
    var design = model.createEmpty(options.projectId);
    if (!design || design.ok === false) return fail('design-creation-failed', design && design.detail || design);
    var added = model.addPlot(design, plot, design.revision);
    if (!added.ok) return added;
    if (level3 && level3.generated) added.design.plots[0].generated.sourceRevision = added.design.plots[0].revision;

    return {
      ok: true,
      design: added.design,
      plotId: plotId,
      /* These remain outside the canonical model until their ownership is migrated. */
      legacyBaseline: clone(snapshot),
      editorState: {
        lineDrawMode: pipePlan.lineDrawMode === 'ortho' ? 'ortho' : 'free',
        zoom: Number(pipePlan.zoom) || 1,
        panX: Number(pipePlan.panX) || 0,
        panY: Number(pipePlan.panY) || 0,
        lastSVG: typeof pipePlan.lastSVG === 'string' ? pipePlan.lastSVG : '',
        tlAux: snapshot.tlAux == null ? null : clone(snapshot.tlAux)
      },
      derived: {
        level3SessionState: level3 ? clone(level3.sessionState) : null
      }
    };
  }

  function toLegacyPatch(design, plotId, baseline) {
    var model = root.RyDrawingDesignModel;
    if (!model || typeof model.validate !== 'function') return fail('model-not-loaded');
    var check = model.validate(design);
    if (!check.ok) return fail('invalid-canonical-design', check.errors);
    if (!isObject(baseline)) return fail('legacy-baseline-required');
    if (rejectGroup(baseline)) return fail('group-snapshot-requires-group-adapter');
    if (baseline.currentPlotId == null) return fail('legacy-plot-binding-required');
    if (String(baseline.currentPlotId) !== String(plotId)) return fail('plot-binding-mismatch');
    var matches = design.plots.filter(function (plot) { return plot.plotId === String(plotId); });
    if (matches.length !== 1) return fail(matches.length ? 'ambiguous-plot-id' : 'plot-not-found');

    var plot = matches[0];
    var baselineBoundary = validRing(baseline.measuredPolygon) ? baseline.measuredPolygon
      : (baseline.pipePlan && validRing(baseline.pipePlan.polyPts) ? baseline.pipePlan.polyPts : null);
    if (!baselineBoundary || !sameRing(plot.geometry.boundary, baselineBoundary)) {
      return fail('geometry-export-requires-frame-adapter');
    }
    var out = clone(baseline);
    var oldPlan = isObject(out.pipePlan) ? out.pipePlan : {};
    var angle = plot.partition.angleDeg;
    out.currentPlotId = String(plotId);
    out.measuredPolygon = clone(plot.geometry.boundary);
    out.pipePlan = Object.assign({}, oldPlan, {
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
      cutOverrides: clone(plot.partition.stepOverrides),
      areaLocked: plot.partition.areaLocked,
      zoneAngleDeg: angle,
      zoneRotated: Math.abs(Math.abs(angle) - 90) < 0.001,
      zoneAuto: plot.partition.mode === 'auto',
      /* SVG is a presentation cache. Never replay a drawing rendered from an older design. */
      lastSVG: ''
    });
    if (plot.generated) {
      var level3Adapter = root.RyDrawingDesignLevel3Adapter;
      if (!level3Adapter || typeof level3Adapter.toProjectPatch !== 'function') return fail('level3-adapter-not-loaded');
      var level3Patch = level3Adapter.toProjectPatch({ generated: plot.generated, edits: plot.network.level3Edits },
        plot.generated.level3Geometry, plot.revision, out);
      if (!level3Patch.ok) return fail('level3-regeneration-required', level3Patch.error);
      out = level3Patch.snapshot;
    } else if (out.tlDiagramData != null || out.tlEditPipes != null || out.tlAutoEdits != null ||
      (Array.isArray(out.manualGroups) && out.manualGroups.length) ||
      (out.tlAux && out.tlAux.nodes != null)) {
      return fail('level3-adapter-state-missing');
    }
    return { ok: true, snapshot: out, requiresDiagramRegeneration: true };
  }

  root.RyDrawingDesignLegacyAdapter = Object.freeze({
    fromProjectSnapshot: fromProjectSnapshot,
    toLegacyPatch: toLegacyPatch
  });
})(typeof window !== 'undefined' ? window : globalThis);
