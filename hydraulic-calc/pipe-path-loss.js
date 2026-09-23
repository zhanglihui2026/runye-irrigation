/* 图面改径后的路径校核。长度 m、流量 m³/h、外径 mm；总管按出水点分段。 */
(function (root) {
  'use strict';
  function calculate(input) {
    var zones = input.zones, cals = input.calibers || {}, worst = null, paths = [];
    function diameter(pid, fallback) { return input.innerDiam(cals[pid] || fallback); }
    input.groups.forEach(function (group, gi) {
      var active = group.map(function (id) { return zones.find(function (z) { return z.zi === id; }); })
        .filter(function (z) { return z && z.flow > 0; }).sort(function (a, b) { return a.run - b.run; });
      var frontLoss = 0, from = 0;
      var groupFlow = active.reduce(function (sum, z) { return sum + z.flow; }, 0);
      active.forEach(function (z, i) {
        var flow = active.slice(i).reduce(function (sum, x) { return sum + x.flow; }, 0);
        frontLoss += input.hazen(Math.max(0, z.run - from), flow, diameter('front', input.frontOd));
        from = z.run;
        var mainLoss = input.hazen(z.main, z.flow, diameter('main-' + z.zi, input.mainOd));
        var branchLoss = input.hazen(z.branch, z.flow / input.branchCount,
          diameter('branch-' + z.zi, input.branchOd)) * input.branchF;
        var row = { zoneIndex: z.zi, groupIndex: gi, front: z.run, main: z.main, branch: z.branch,
          frontFlow: groupFlow, mainFlow: z.flow, branchFlow: z.flow / input.branchCount,
          frontPipeLoss: frontLoss, mainLoss: mainLoss, branchLoss: branchLoss,
          total: frontLoss + mainLoss + branchLoss };
        paths.push(row);
        if (!worst || row.total > worst.total) worst = row;
      });
    });
    return { worst: worst, paths: paths };
  }
  var api = { calculate: calculate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.RyPipePathLoss = api;
})(typeof window !== 'undefined' ? window : globalThis);
