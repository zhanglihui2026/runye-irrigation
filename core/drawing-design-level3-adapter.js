/* Explicit conversion for level-three generated geometry and its geometry-bound edits. */
(function (root) {
  'use strict';

  function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function fail(error, detail) { return { ok: false, error: error, detail: detail || null }; }

  /* Keep byte-for-byte semantic parity with RyTlEditPipes/RyTlAutoEdits geometryKey. */
  function geometrySignature(data) {
    if (!isObject(data)) return '';
    return JSON.stringify([data.frontPipe, data.mainPipes, data.branchPipes, data.valves, data.poly]);
  }

  function fromProjectSnapshot(snapshot, options) {
    options = options || {};
    if (!isObject(snapshot)) return fail('invalid-project-snapshot');
    var geometry = snapshot.tlDiagramData;
    if (geometry == null && snapshot.isoDiagram && isObject(snapshot.isoDiagram.data)) geometry = snapshot.isoDiagram.data;
    if (geometry == null) return { ok: true, generated: null, edits: null, sessionState: null };
    if (!isObject(geometry) || geometry.version !== 1) return fail('unsupported-level3-geometry');
    if (!Number.isSafeInteger(options.sourceRevision) || options.sourceRevision < 0) return fail('source-revision-required');
    var signature = geometrySignature(geometry);
    if (!signature) return fail('level3-geometry-signature-unavailable');

    var manual = snapshot.tlEditPipes == null ? null : snapshot.tlEditPipes;
    var automatic = snapshot.tlAutoEdits == null ? null : snapshot.tlAutoEdits;
    var nodes = snapshot.tlAux && snapshot.tlAux.nodes != null ? snapshot.tlAux.nodes : null;
    var auxiliary = null;
    if (Object.prototype.hasOwnProperty.call(snapshot, 'tlAux')) {
      if (snapshot.tlAux != null && !isObject(snapshot.tlAux)) return fail('invalid-level3-auxiliary-state');
      if (snapshot.tlAux != null) {
        auxiliary = clone(snapshot.tlAux);
        delete auxiliary.nodes;   // Nodes have their own canonical edit field and signature check.
      }
    }
    if ((manual && manual.geoKey && manual.geoKey !== signature) ||
      (automatic && automatic.geoKey && automatic.geoKey !== signature)) return fail('level3-edit-signature-mismatch');
    if (nodes && nodes.geoSig && nodes.geoSig !== signature) return fail('level3-node-signature-mismatch');
    try {
      if (manual && (!Array.isArray(manual.pipes) || !Array.isArray(manual.fits || []))) return fail('invalid-manual-pipe-state');
      if (automatic && (!isObject(automatic.lens || {}) || !Array.isArray(automatic.fits || []) ||
        !isObject(automatic.moves || {}) || !isObject(automatic.hidden || {}))) return fail('invalid-automatic-edit-state');
    } catch (error) { return fail(String(error.message || error)); }
    if (nodes && (!Array.isArray(nodes.nodes || []) || !Array.isArray(nodes.links || []))) return fail('invalid-level3-node-state');

    var edits = {
      geometrySignature: signature,
      manualPipes: manual ? clone(manual) : null,
      automatic: automatic ? {
        version: automatic.version,
        geoKey: signature,
        lens: clone(automatic.lens || {}),
        fits: clone(automatic.fits || []),
        moves: clone(automatic.moves || {}),
        hidden: clone(automatic.hidden || {}),
        seq: clone(automatic.seq || { n: 0 })
      } : null,
      nodes: nodes ? clone(nodes) : null,
      manualGroups: Array.isArray(snapshot.manualGroups) ? clone(snapshot.manualGroups) : []
    };
    if (Object.prototype.hasOwnProperty.call(snapshot, 'tlAux')) edits.auxiliary = auxiliary;

    return {
      ok: true,
      generated: { sourceRevision: options.sourceRevision, geometrySignature: signature, level3Geometry: clone(geometry) },
      edits: edits,
      /* Pipe caliber labels are intentionally session-only and excluded from the persisted model. */
      sessionState: { calibers: automatic && isObject(automatic.cals) ? clone(automatic.cals) : {} }
    };
  }

  function isCurrent(generated, currentGeometry, currentRevision) {
    return !!generated && Number.isSafeInteger(currentRevision) &&
      generated.sourceRevision === currentRevision &&
      generated.geometrySignature === geometrySignature(currentGeometry);
  }

  function toProjectPatch(target, currentGeometry, currentRevision, baseline) {
    if (!isObject(target) || !isObject(baseline)) return fail('level3-export-target-required');
    if (!isCurrent(target.generated, currentGeometry, currentRevision)) return fail('stale-level3-generation');
    var signature = geometrySignature(currentGeometry), edits = target.edits || {};
    if (edits.geometrySignature && edits.geometrySignature !== signature) return fail('level3-edit-signature-mismatch');
    var out = clone(baseline);
    out.tlDiagramData = clone(target.generated.level3Geometry);
    out.tlEditPipes = edits.manualPipes == null ? null : clone(edits.manualPipes);
    out.tlAutoEdits = edits.automatic == null ? null : clone(edits.automatic);
    if (out.tlAutoEdits) out.tlAutoEdits.cals = {};
    out.manualGroups = Array.isArray(edits.manualGroups) ? clone(edits.manualGroups) : [];
    var hasAuxiliary = Object.prototype.hasOwnProperty.call(edits, 'auxiliary');
    if (hasAuxiliary) {
      if (edits.auxiliary != null && !isObject(edits.auxiliary)) return fail('invalid-level3-auxiliary-state');
      out.tlAux = edits.auxiliary == null ? null : clone(edits.auxiliary);
    }
    /* `nodes` is part of the canonical edit snapshot, so project both presence and
       absence. Preserve the other legacy auxiliary fields from the baseline. */
    if (Object.prototype.hasOwnProperty.call(edits, 'nodes')) {
      if (edits.nodes == null) {
        if (isObject(out.tlAux)) {
          delete out.tlAux.nodes;
          /* Keep an explicitly captured empty auxiliary object distinct from null. */
          if (!Object.keys(out.tlAux).length && !hasAuxiliary) out.tlAux = null;
        }
      } else {
        if (!isObject(out.tlAux)) out.tlAux = {};
        out.tlAux.nodes = clone(edits.nodes);
      }
    }
    return { ok: true, snapshot: out };
  }

  root.RyDrawingDesignLevel3Adapter = Object.freeze({
    geometrySignature: geometrySignature,
    fromProjectSnapshot: fromProjectSnapshot,
    isCurrent: isCurrent,
    toProjectPatch: toProjectPatch
  });
})(typeof window !== 'undefined' ? window : globalThis);
