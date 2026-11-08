/* 图面改径后的路径校核。长度 m、流量 m³/h、外径 mm；总管按出水点分段。
 *
 * [v843] 新增可选入参 `frontTotalOverride`（米）：总管**总长**改用外部实测值
 *   （用户在在线地图上画的那根总管），各分区取水点按原比例缩放保持相对位置。
 *   · 为什么按比例缩而不是整根替换：总管是一根带多处取水点的管，各段流量沿程递减，
 *     直接"全长 × 组流量"会把后段流量算大。按比例缩既让总长等于实测值，
 *     又不动"取水点前后流量不同"这个物理事实。
 *   · 不传 / 传 0 / 传非法值 ⇒ runScale=1，**结果与改动前逐位相同**（老调用方零影响）。
 *   · 传了但各分区取水点 run 全为 0（退化）⇒ 同样不缩放，不去除零。 */
(function (root) {
  'use strict';
  function calculate(input) {
    var zones = input.zones, cals = input.calibers || {}, worst = null, paths = [];
    function diameter(pid, fallback) { return input.innerDiam(cals[pid] || fallback); }
    var ov = Number(input.frontTotalOverride);
    input.groups.forEach(function (group, gi) {
      var active = group.map(function (id) { return zones.find(function (z) { return z.zi === id; }); })
        .filter(function (z) { return z && z.flow > 0; }).sort(function (a, b) { return a.run - b.run; });
      var frontLoss = 0, from = 0;
      var groupFlow = active.reduce(function (sum, z) { return sum + z.flow; }, 0);
      var sourceDistance = Math.max(0, Number(input.sourceDistance) || 0);
      var runMax = active.reduce(function (m, z) { return Math.max(m, z.run); }, 0);
      var runScale = (isFinite(ov) && ov > 0 && runMax > 0) ? (ov / runMax) : 1;
      if (sourceDistance > 0 && groupFlow > 0) {
        frontLoss = input.hazen(sourceDistance, groupFlow, diameter('front', input.frontOd));
      }
      active.forEach(function (z, i) {
        var flow = active.slice(i).reduce(function (sum, x) { return sum + x.flow; }, 0);
        var zr = z.run * runScale;
        frontLoss += input.hazen(Math.max(0, zr - from), flow, diameter('front', input.frontOd));
        from = zr;
        /* [v1020 待办③] 链式主管逐段组合流量：z.mainSegs 非空时逐段 hazen——
           过境段（本区主管链上、为下游区输水的段）按「下游覆盖分区流量和」计损，
           旧口径（全程按本区单区流量）系统性低估链式布局的过境损失。
           每段 {len, flow}；len/flow 非法值按 0 兜底（不产生负长度/负流量）。
           无 mainSegs ⇒ 与旧口径逐位相同（老调用方零影响）。 */
        var mainLen = z.main, mainLoss = 0;
        if (Array.isArray(z.mainSegs) && z.mainSegs.length) {
          mainLen = 0;
          z.mainSegs.forEach(function (g) {
            var gl = Math.max(0, Number(g && g.len) || 0);
            var gf = Math.max(0, Number(g && g.flow) || 0);
            mainLen += gl;
            mainLoss += input.hazen(gl, gf, diameter('main-' + z.zi, input.mainOd));
          });
        } else {
          mainLoss = input.hazen(z.main, z.flow, diameter('main-' + z.zi, input.mainOd));
        }
        /* branchCount is the physical parallel branch count (selected roots × layout sides). */
        var branchLoss = input.hazen(z.branch, z.flow / input.branchCount,
          diameter('branch-' + z.zi, input.branchOd)) * input.branchF;
        var row = { zoneIndex: z.zi, groupIndex: gi, front: zr, main: mainLen, branch: z.branch,
          frontFlow: groupFlow, mainFlow: z.flow, branchFlow: z.flow / input.branchCount,
          frontPipeLoss: frontLoss, mainLoss: mainLoss, branchLoss: branchLoss,
          total: frontLoss + mainLoss + branchLoss };
        if (Array.isArray(z.mainSegs) && z.mainSegs.length) {
          row.mainSegFlowMax = z.mainSegs.reduce(function (m, g) { return Math.max(m, Math.max(0, Number(g && g.flow) || 0)); }, 0);
        }
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
