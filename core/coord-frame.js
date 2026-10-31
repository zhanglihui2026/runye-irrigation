/* ============================================================
   core/coord-frame.js — 分区网格 frame ↔ 世界米 的坐标换算（纯函数）
   ------------------------------------------------------------
   两个方向：
     frameToGrid(frame, p)   世界米 → 图纸 mm（地块多边形落进施工图坐标系）
     frameToWorld(frame, p)  图纸 mm → 世界米（图纸上的点回投成地块坐标）

   ★ 为什么单独成模块（v836）
     这段换算原先在 mod/inline-09.js 里有两份局部实现（tlFrameToWorld /
     tlFrameToGrid），mod/plot-editor.js 的 ppGridFrame() 里又用闭包写了同一套
     数学的第三份，mod/trunk-geo.js 还按「与 tlFrameToWorld 逐字一致」抄了第四份。
     它的下游是分区网格 → 管路布局 → 材料量，换算错一位不是"画歪了"而是整套量错。
     收口到这里之后由 tests/coord_frame.test.cjs 钉住数值。

   ★ 单位与坐标系（改之前必须确认的四个字段）
     p（世界）：地块米坐标，与 measuredPolygon 同系，原点 = 地块 bounds 的 minX/minY
     p（图纸）：施工图局部坐标，单位 mm，与 plot.dims.w/h 同系
     frame.scaleX / scaleY：图纸mm ÷ 地块m。**不是 1**，典型 1000（300 m → 300000 mm）
     frame.center：在**图纸系**（图纸中心，mm）
     frame.origin：在**世界系**（地块 min 角，m）
     frame.angle：度；0 = 不旋转

   ★ 两条不显然的规则（别"顺手优化"）
     1. frame 自带 toWorld / toGrid 时**优先调用它**。plot-editor 的 frame 是带闭包
        的活对象，不是纯数据；跳过委托会拿到与它自己渲染不一致的坐标。
     2. `Number(frame.scaleX) || 1` 会把 0 静默当成 1。这是既有行为，已由测试钉住；
        不要改成 `?? 1` —— 那会让历史数据里的 scaleX:0 从"按 1 算"变成"除以 0 = Infinity"。

   逆变换是独立实现（不是求逆矩阵），往返误差约 3e-11（见单测）。
   ============================================================ */
(function (root) {
  'use strict';

  /* 图纸 mm → 世界米。frame 为 null 时代入恒等。 */
  function frameToWorld(frame, p) {
    if (!frame) return { x: p.x, y: p.y };
    if (typeof frame.toWorld === 'function') return frame.toWorld(p);
    var c = frame.center || { x: 0, y: 0 }, o = frame.origin || { x: 0, y: 0 };
    var a = (Number(frame.angle) || 0) * Math.PI / 180;
    var cs = Math.cos(a), sn = Math.sin(a);
    var sx = Number(frame.scaleX) || 1, sy = Number(frame.scaleY) || 1;
    var dx = p.x - c.x, dy = p.y - c.y;
    return { x: o.x + (c.x + dx * cs - dy * sn) / sx, y: o.y + (c.y + dx * sn + dy * cs) / sy };
  }

  /* 世界米 → 图纸 mm。frame 为 null 时代入恒等。 */
  function frameToGrid(frame, p) {
    if (!frame) return { x: p.x, y: p.y };
    if (typeof frame.toGrid === 'function') return frame.toGrid(p);
    var c = frame.center || { x: 0, y: 0 }, o = frame.origin || { x: 0, y: 0 };
    var a = (Number(frame.angle) || 0) * Math.PI / 180;
    var cs = Math.cos(a), sn = Math.sin(a);
    var sx = Number(frame.scaleX) || 1, sy = Number(frame.scaleY) || 1;
    var dx = (p.x - o.x) * sx - c.x, dy = (p.y - o.y) * sy - c.y;
    return { x: c.x + dx * cs + dy * sn, y: c.y - dx * sn + dy * cs };
  }

  root.RyCoordFrame = {
    frameToWorld: frameToWorld,
    frameToGrid: frameToGrid
  };
})(typeof window !== 'undefined' ? window : this);
