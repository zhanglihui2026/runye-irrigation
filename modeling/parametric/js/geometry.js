/* =========================================================
   geometry.js — 放样（Loft）几何计算
   核心：以「直线」为放样路径，以「圆形/方形」为截面，
   沿路径全程扫描放样，生成封闭三维管状实体的三角网格。
   输出三角形列表（带顶点），供 3D 预览渲染器使用。
   ========================================================= */
(function (global) {
  'use strict';

  const V = (global.GH && global.GH.vec3) ||
            (typeof require !== 'undefined' ? require('./vec3.js') : null);

  /**
   * 计算放样结果
   * @param {Object|null} path    路径图形，要求 type==='line'，含 x1,y1,x2,y2（世界坐标，z 视为 0）
   * @param {Object|null} section 截面图形，type==='circle'(含 r) 或 'rect'(含 w,h)
   * @returns {{tris:Array, A:Array, B:Array}|{error:string}}
   *         成功返回三角网格 tris（每项为一三角形，含 3 个 [x,y,z] 顶点）；
   *         失败返回 {error}（缺失输入 / 路径长度为 0 等），不抛异常。
   */
  function computeLoft(path, section) {
    // —— 容错：缺失输入静默提示，不报错 ——
    if (!path || path.type !== 'line') {
      return { error: '缺失输入数据：放样路径（请拾取一条直线）' };
    }
    if (!section) {
      return { error: '缺失输入数据：放样截面（请拾取圆形或方形）' };
    }

    const A = [path.x1, path.y1, 0];
    const B = [path.x2, path.y2, 0];

    // 路径方向
    let dir = V.sub(B, A);
    const pathLen = V.len(dir);
    if (pathLen < 1e-6) {
      return { error: '路径长度为 0，无法放样（请调整直线长度）' };
    }
    dir = V.scale(dir, 1 / pathLen); // 单位方向向量

    // 构造与 dir 垂直的截面基向量 (u, v)
    let up = [0, 0, 1];
    if (Math.abs(V.dot(dir, up)) > 0.99) up = [0, 1, 0]; // 退化保护：路径与 z 轴平行
    const u = V.norm(V.cross(up, dir));
    const v = V.cross(dir, u); // 已为单位向量

    // 截面分段数：圆形足够细，方形为 4
    const isCircle = section.type === 'circle';
    const N = isCircle ? 40 : 4;

    // 生成某一中心处的截面环点
    function ringPoints(center) {
      const pts = [];
      if (isCircle) {
        const r = Math.max(0, section.r || 0);
        for (let k = 0; k < N; k++) {
          const a = (2 * Math.PI * k) / N;
          pts.push(V.add(center, V.add(V.scale(u, r * Math.cos(a)), V.scale(v, r * Math.sin(a)))));
        }
      } else {
        const w = Math.max(0, section.w || 0) / 2;
        const h = Math.max(0, section.h || 0) / 2;
        // 逆时针：左下、右下、右上、左上
        pts.push(V.add(center, V.add(V.scale(u, -w), V.scale(v, -h))));
        pts.push(V.add(center, V.add(V.scale(u,  w), V.scale(v, -h))));
        pts.push(V.add(center, V.add(V.scale(u,  w), V.scale(v,  h))));
        pts.push(V.add(center, V.add(V.scale(u, -w), V.scale(v,  h))));
      }
      return pts;
    }

    const start = ringPoints(A);
    const end = ringPoints(B);
    const tris = [];

    // 侧面：相邻环点连成四边形 → 两个三角形
    for (let k = 0; k < N; k++) {
      const k2 = (k + 1) % N;
      tris.push([start[k], start[k2], end[k2]]);
      tris.push([start[k], end[k2], end[k]]);
    }

    // 端盖（扇形三角化），形成封闭实体
    for (let k = 0; k < N; k++) {
      const k2 = (k + 1) % N;
      tris.push([A, start[k2], start[k]]); // 起点端盖
      tris.push([B, end[k], end[k2]]);     // 终点端盖
    }

    return { tris, A, B };
  }

  global.GH = global.GH || {};
  global.GH.computeLoft = computeLoft;

  if (typeof module !== 'undefined' && module.exports) module.exports = { computeLoft };
})(typeof window !== 'undefined' ? window : globalThis);
