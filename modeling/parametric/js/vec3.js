/* =========================================================
   vec3.js — 轻量三维向量工具库
   仅依赖纯数组 [x, y, z]，无任何外部依赖，可在浏览器与 Node 中复用。
   ========================================================= */
(function (global) {
  'use strict';

  const V = {
    add:  (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub:  (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    scale:(a, s) => [a[0] * s, a[1] * s, a[2] * s],
    dot:  (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross:(a, b) => [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ],
    len:  (a) => Math.hypot(a[0], a[1], a[2]),
    // 归一化（零向量返回 [0,0,0]，避免 NaN）
    norm: (a) => {
      const l = Math.hypot(a[0], a[1], a[2]);
      return l < 1e-12 ? [0, 0, 0] : [a[0] / l, a[1] / l, a[2] / l];
    },
    mid:  (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
    avg:  (pts) => {
      const s = [0, 0, 0];
      for (const p of pts) { s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; }
      return [s[0] / pts.length, s[1] / pts.length, s[2] / pts.length];
    },
  };

  // 挂载到全局命名空间，方便其它模块以 GH.vec3 调用
  global.GH = global.GH || {};
  global.GH.vec3 = V;

  // 兼容 Node 环境下的单元测试
  if (typeof module !== 'undefined' && module.exports) module.exports = V;
})(typeof window !== 'undefined' ? window : globalThis);
