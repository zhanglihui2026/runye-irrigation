/* [v217 取证] 定性既有闸门 J2「求逆写成正向」为何不再命中。
   复算链路：地图径 framePoly → 垂直镜像 measuredPolygon → 旋转45° dd.poly
   → 按 index.html:12267 的公式解出 L: p(mapframe) → q(dd)，再求真逆 L⁻¹。
   若 L == L⁻¹（对合/involution），则「把逆写成正向」在数学上就是恒等变换 ⇒ 注入不可观测。 */
const R = 6378137, mlat = R * Math.PI / 180, cosLat = Math.cos(18.25 * Math.PI / 180);
const c = { lat: 18.25, lng: 109.51 }, a = 60, b = 20, t = 25 * Math.PI / 180;
const u = [Math.cos(t), Math.sin(t)], v = [-Math.sin(t), Math.cos(t)];
const ringLL = [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(function (s) {
  const e = a * s[0] * u[0] + b * s[1] * v[0], n = a * s[0] * u[1] + b * s[1] * v[1];
  return [c.lat + n / mlat, c.lng + e / (mlat * cosLat)];
});
/* applyMapMeasuredArea 的换算（含 toFixed(x.xxxxxxx) 量化） */
const clat = 18.25, lng0 = ringLL.map(q => q[1]).reduce((m, x) => Math.min(m, x), Infinity);
const xs = [], ys = [];
ringLL.forEach(function (p) {
  xs.push(+((p[1] - lng0) * mlat * cosLat).toFixed(2) * 1);
  ys.push(+((p[0] - clat) * mlat).toFixed(2) * 1);
});
const p = xs.map((x, i) => ({ x: x, y: ys[i] }));           // 地图口径 framePoly
const mpMirror = xs.map((x, i) => ({ x: x, y: -ys[i] }));   // [v217] measuredPolygon（垂直镜像）
const mpOld = xs.map((x, i) => ({ x: x, y: ys[i] }));       // [v216 及以前] 不镜像

function bounds(pts) {
  const xsx = pts.map(q => q.x), ysy = pts.map(q => q.y);
  const minX = Math.min.apply(null, xsx), maxX = Math.max.apply(null, xsx);
  const minY = Math.min.apply(null, ysy), maxY = Math.max.apply(null, ysy);
  return { minX, minY, w: maxX - minX, h: maxY - minY };
}
function rot(pts, deg) {
  const b = bounds(pts), cx = b.minX + b.w / 2, cy = b.minY + b.h / 2, r = deg * Math.PI / 180;
  const cs = Math.cos(r), sn = Math.sin(r);
  return pts.map(q => ({ x: cx + (q.x - cx) * cs - (q.y - cy) * sn, y: cy + (q.x - cx) * sn + (q.y - cy) * cs }));
}
/* 复刻 index.html:12271-12282 */
function solve(mf, dd) {
  const p0 = mf[0], p1 = mf[1], p2 = mf[2], q0 = dd[0], q1 = dd[1], q2 = dd[2];
  const ux = p1.x - p0.x, uy = p1.y - p0.y, vx = p2.x - p0.x, vy = p2.y - p0.y;
  const detM = ux * vy - uy * vx;
  const Ux = q1.x - q0.x, Uy = q1.y - q0.y, Vx = q2.x - q0.x, Vy = q2.y - q0.y;
  const im = 1 / detM;
  const A = (Ux * vy - Vx * uy) * im, B = (Vx * ux - Ux * vx) * im;
  const C = (Uy * vy - Vy * uy) * im, D = (Vy * ux - Uy * vx) * im;
  const detL = A * D - B * C, il = 1 / detL;
  const tx = q0.x - (A * p0.x + B * p0.y), ty = q0.y - (C * p0.x + D * p0.y);
  return {
    L: { ax: A, ay: C, bx: B, by: D, tx, ty },
    Inv: { ax: D * il, ay: -C * il, bx: -B * il, by: A * il, tx, ty },
    detL
  };
}
function maxDiff(m1, m2) {
  return Math.max(Math.abs(m1.ax - m2.ax), Math.abs(m1.ay - m2.ay), Math.abs(m1.bx - m2.bx), Math.abs(m1.by - m2.by),
    Math.abs(m1.tx - m2.tx), Math.abs(m1.ty - m2.ty));
}
function mirrorH(pts) {
  const b = bounds(pts), cx = b.minX + b.w / 2;
  return pts.map(q => ({ x: 2 * cx - q.x, y: q.y }));   // index.html:16374 mode==='h'
}
function mirrorV(pts) {
  const b = bounds(pts), cy = b.minY + b.h / 2;
  return pts.map(q => ({ x: q.x, y: 2 * cy - q.y }));   // index.html:16375 mode==='v'
}
function report(tag, mpPt) {
  ['0', '45'].forEach(function (d) {
    const dd = rot(mpPt, +d);
    const s = solve(p, dd);
    const dev = maxDiff(s.L, s.Inv);
    console.log(tag + ' 旋转' + d + '°  det(L)=' + s.detL.toFixed(6) +
      '   max|L - L⁻¹| = ' + dev.toExponential(3) +
      '   ⇒ ' + (dev < 1e-9 ? '★ 对合：正向==逆向 ⇒ J2 注入不可观测（退化）' : '可观测（注入应命中）'));
  });
}
report('[v216 旧口径 不镜像]', mpOld);
report('[v217 新口径 垂直镜像]', mpMirror);
console.log('\n再取 30°/60°/120° 多角度交叉验证（v217 口径）：');
[30, 60, 120, -75].forEach(function (d) {
  const s = solve(p, rot(mpMirror, d));
  console.log('  旋转' + d + '°  det(L)=' + s.detL.toFixed(6) + '  max|L-L⁻¹|=' + maxDiff(s.L, s.Inv).toExponential(3));
});
console.log('\n=== 对策：v217 口径下再加一步「水平镜像」（det 回到 +1 ⇒ 纯旋转，非对合）===');
[0, 45, -75].forEach(function (d) {
  [[mirrorH, '水平镜像'], [mirrorV, '垂直镜像']].forEach(function (pair) {
    const dd = pair[0](rot(mpMirror, d));           // 流程：先旋转 → 再镜像（对应闸门 REPART 之后点镜像钮）
    const s = solve(p, dd);
    const dev = maxDiff(s.L, s.Inv);
    console.log('  旋转' + d + '° + ' + pair[1] + '  det(L)=' + s.detL.toFixed(6) +
      '  max|L-L⁻¹|=' + dev.toExponential(3) + '  ⇒ ' + (dev < 1e-9 ? '仍对合（无效）' : '★ 可观测'));
  });
});
