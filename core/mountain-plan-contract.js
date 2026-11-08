/* Structural contract for runye-mountain-plan/v0.1. Geometry and hydraulics
   remain the responsibility of their dedicated modules. No DOM or storage. */
(function (root) {
  'use strict';

  var SCHEMA = 'runye-mountain-plan';
  var VERSION = '0.1';
  var STATUSES = ['draft', 'geometry-valid', 'network-valid', 'hydraulics-verified'];
  var BASEMAP_KINDS = ['none', 'online-map', 'georeferenced-raster', 'calibrated-image'];
  var SEGMENT_KINDS = ['trunk', 'main', 'branch', 'lateral'];
  var DEVICE_KINDS = ['reservoir', 'filter', 'pump', 'valve'];

  function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function id(value) { return typeof value === 'string' && value.trim().length > 0; }
  function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
  function dense(value) {
    if (!Array.isArray(value)) return false;
    for (var i = 0; i < value.length; i++) if (!Object.prototype.hasOwnProperty.call(value, i)) return false;
    return true;
  }
  function point(value) { return dense(value) && value.length === 2 && finite(value[0]) && finite(value[1]); }
  function near(a, b, tolerance) {
    return Math.hypot(a[0] - b[0], a[1] - b[1]) <= tolerance;
  }

  function validate(plan, options) {
    var errors = [];
    var tolerance = options && finite(options.endpointToleranceM) && options.endpointToleranceM >= 0
      ? options.endpointToleranceM : 0.01;
    function error(code, at) { errors.push({ code: code, at: at }); }
    function list(value, at) {
      if (!dense(value)) { error('invalid-array', at); return []; }
      return value;
    }
    function unique(items, at) {
      var seen = Object.create(null);
      items.forEach(function (item, i) {
        if (!object(item) || !id(item.id)) { error('invalid-id', at + '[' + i + ']'); return; }
        if (seen[item.id]) error('duplicate-id', at + '[' + i + ']');
        seen[item.id] = true;
      });
      return seen;
    }
    function polygon(value, at) {
      if (!object(value)) { error('invalid-polygon', at); return; }
      var outer = list(value.outer, at + '.outer');
      if (outer.length < 3 || outer.some(function (p) { return !point(p); })) error('invalid-ring', at + '.outer');
      list(value.holes, at + '.holes').forEach(function (ring, i) {
        if (!dense(ring) || ring.length < 3 || ring.some(function (p) { return !point(p); })) {
          error('invalid-ring', at + '.holes[' + i + ']');
        }
      });
    }

    if (!object(plan)) return { ok: false, errors: [{ code: 'invalid-plan', at: '$' }] };
    if (plan.schema !== SCHEMA) error('invalid-schema', 'schema');
    if (plan.version !== VERSION) error('unsupported-version', 'version');
    if (!id(plan.projectId)) error('invalid-id', 'projectId');
    if (!id(plan.plotId)) error('invalid-id', 'plotId');
    if (!Number.isSafeInteger(plan.revision) || plan.revision < 0) error('invalid-revision', 'revision');
    if (STATUSES.indexOf(plan.status) < 0) error('invalid-status', 'status');

    if (!object(plan.frame)) error('invalid-frame', 'frame');
    else {
      if (!id(plan.frame.id) || plan.frame.units !== 'm' || !id(plan.frame.sourceCrs) ||
          !dense(plan.frame.localToSource) || plan.frame.localToSource.length !== 6 ||
          plan.frame.localToSource.some(function (n) { return !finite(n); }) ||
          typeof plan.frame.engineeringEligible !== 'boolean') error('invalid-frame', 'frame');
      else {
        var m = plan.frame.localToSource;
        if (Math.abs(m[0] * m[3] - m[1] * m[2]) < 1e-12) error('invalid-frame', 'frame.localToSource');
        if (plan.frame.engineeringEligible && plan.frame.sourceCrs === 'LOCAL_TEST_METERS') error('unknown-crs', 'frame.sourceCrs');
      }
    }

    if (!object(plan.basemap) || BASEMAP_KINDS.indexOf(plan.basemap.kind) < 0 ||
        !object(plan.basemap.calibration)) error('invalid-basemap', 'basemap');
    if (!object(plan.site)) error('invalid-site', 'site');
    else {
      polygon(plan.site.boundary, 'site.boundary');
      unique(list(plan.site.features, 'site.features'), 'site.features');
    }

    var zones = list(plan.zones, 'zones');
    var zoneIds = unique(zones, 'zones');
    zones.forEach(function (zone, i) {
      if (!object(zone)) return;
      polygon(zone.polygon, 'zones[' + i + '].polygon');
      if (!id(zone.name)) error('invalid-name', 'zones[' + i + '].name');
      if (zone.targetAreaM2 != null && (!finite(zone.targetAreaM2) || zone.targetAreaM2 <= 0)) {
        error('invalid-area', 'zones[' + i + '].targetAreaM2');
      }
      if (typeof zone.locked !== 'boolean') error('invalid-lock', 'zones[' + i + '].locked');
      if (zone.valveId != null && !id(zone.valveId)) error('invalid-reference', 'zones[' + i + '].valveId');
    });

    var devices = list(plan.devices, 'devices');
    var deviceIds = unique(devices, 'devices');
    if (!object(plan.network)) error('invalid-network', 'network');
    var network = object(plan.network) ? plan.network : {};
    var nodes = list(network.nodes, 'network.nodes');
    var nodeIds = unique(nodes, 'network.nodes');
    var nodeById = Object.create(null);
    nodes.forEach(function (node, i) {
      if (!object(node)) return;
      if (!point(node.point)) error('invalid-point', 'network.nodes[' + i + '].point');
      if (id(node.id)) nodeById[node.id] = node;
      if (node.deviceId != null && !deviceIds[node.deviceId]) error('invalid-reference', 'network.nodes[' + i + '].deviceId');
    });
    devices.forEach(function (device, i) {
      if (!object(device)) return;
      if (DEVICE_KINDS.indexOf(device.kind) < 0) error('invalid-device-kind', 'devices[' + i + '].kind');
      if (!nodeIds[device.nodeId]) error('invalid-reference', 'devices[' + i + '].nodeId');
    });
    zones.forEach(function (zone, i) {
      if (object(zone) && zone.valveId != null && !deviceIds[zone.valveId]) {
        error('invalid-reference', 'zones[' + i + '].valveId');
      }
    });

    var segments = list(network.segments, 'network.segments');
    var segmentIds = unique(segments, 'network.segments');
    segments.forEach(function (segment, i) {
      if (!object(segment)) return;
      var at = 'network.segments[' + i + ']';
      if (SEGMENT_KINDS.indexOf(segment.kind) < 0) error('invalid-segment-kind', at + '.kind');
      var from = nodeById[segment.fromNodeId], to = nodeById[segment.toNodeId];
      if (!from || !to || segment.fromNodeId === segment.toNodeId) error('invalid-reference', at + '.nodes');
      if (!dense(segment.vertices) || segment.vertices.length < 2 ||
          segment.vertices.some(function (p) { return !point(p); })) error('invalid-polyline', at + '.vertices');
      else if (from && to && point(from.point) && point(to.point) &&
          (!near(segment.vertices[0], from.point, tolerance) ||
           !near(segment.vertices[segment.vertices.length - 1], to.point, tolerance))) {
        error('segment-endpoint-mismatch', at + '.vertices');
      }
      if (segment.chosenOuterDiameterMm != null &&
          (!finite(segment.chosenOuterDiameterMm) || segment.chosenOuterDiameterMm <= 0)) {
        error('invalid-diameter', at + '.chosenOuterDiameterMm');
      }
    });
    list(network.zoneInlets, 'network.zoneInlets').forEach(function (inlet, i) {
      if (!object(inlet) || !zoneIds[inlet.zoneId] || !deviceIds[inlet.valveDeviceId] ||
          !segmentIds[inlet.segmentId]) error('invalid-reference', 'network.zoneInlets[' + i + ']');
    });

    if (!object(plan.operation)) error('invalid-operation', 'operation');
    else {
      var groups = list(plan.operation.groups, 'operation.groups');
      unique(groups, 'operation.groups');
      groups.forEach(function (group, i) {
        if (!object(group)) return;
        list(group.zoneIds, 'operation.groups[' + i + '].zoneIds').forEach(function (zoneId) {
          if (!zoneIds[zoneId]) error('invalid-reference', 'operation.groups[' + i + '].zoneIds');
        });
      });
    }
    if (!object(plan.drawing)) error('invalid-drawing', 'drawing');
    else {
      unique(list(plan.drawing.annotations, 'drawing.annotations'), 'drawing.annotations');
      list(plan.drawing.visibleLayers, 'drawing.visibleLayers');
    }
    return { ok: errors.length === 0, errors: errors };
  }

  root.RyMountainPlanContract = Object.freeze({ schema: SCHEMA, version: VERSION, validate: validate });
})(typeof window !== 'undefined' ? window : globalThis);
