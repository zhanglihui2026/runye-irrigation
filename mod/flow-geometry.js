(function (root) {
  'use strict';

  function parsePath(d) {
    var nums = String(d || '').match(/-?\d+(?:\.\d+)?/g) || [];
    var pts = [];
    for (var i = 0; i + 1 < nums.length; i += 2) pts.push([+nums[i], +nums[i + 1]]);
    return pts;
  }

  function nearestPoint(p, pts) {
    var best = null;
    for (var i = 0; i + 1 < pts.length; i++) {
      var a = pts[i], b = pts[i + 1];
      var dx = b[0] - a[0], dy = b[1] - a[1], c = dx * dx + dy * dy;
      var t = c === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / c;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      var q = [a[0] + dx * t, a[1] + dy * t];
      var dd = Math.sqrt(Math.pow(p[0] - q[0], 2) + Math.pow(p[1] - q[1], 2));
      if (!best || dd < best.d) best = { q: q, i: i, d: dd };
    }
    return best || { q: pts[0], i: 0, d: Infinity };
  }

  function distance(p, q) {
    return Math.sqrt(Math.pow(p[0] - q[0], 2) + Math.pow(p[1] - q[1], 2));
  }

  var api = { parsePath: parsePath, nearestPoint: nearestPoint, distance: distance };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.RyFlowGeometry = api;
})(typeof window !== 'undefined' ? window : null);
