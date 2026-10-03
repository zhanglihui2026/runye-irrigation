/* _probe_merge_geom.cjs · v185 拼接几何探针
 * 目的：先用真实数值验证 mergePlots 的「外层综合轮廓」是否真等于全部子地块顶点的凸包，
 *       以及子地块是否被原样保留（这是「各自布管」的前提）。
 * 不依赖 Leaflet / DOM。 */
'use strict';
const path = require('path');
const M = require(path.join(__dirname, '..', 'runye-map-enhance.js'));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  <<< ' + extra : '')); }
}

/* ---- 构造：两个紧挨着的矩形小地块（三亚附近），共享一条边 ---- */
// 基准点 18.25, 109.51；1e-5 度 ≈ 1.11m
const B = [18.25, 109.51];
function rect(lat0, lng0, dLat, dLng) {
  return [[lat0, lng0], [lat0, lng0 + dLng], [lat0 + dLat, lng0 + dLng], [lat0 + dLat, lng0]];
}
// A 在左，B 在右，共享 lng0+dLng 这条边 → 「挨着」
const plotA = { id: 'A', name: '地块A', crop: '七彩花生', polyLatLng: rect(B[0], B[1], 0.0002, 0.0002), mu: 1.0, sqm: 666.67 };
const plotB = { id: 'B', name: '地块B', crop: '七彩花生', polyLatLng: rect(B[0], B[1] + 0.0002, 0.0002, 0.0002), mu: 1.0, sqm: 666.67 };

console.log('=== T1 基本拼接：两块相邻矩形 ===');
const merged = M.merge.plots([plotA, plotB], { name: '拼接大地块' });
ok('mergePlots 返回非空', !!merged);
ok('标记 merged:true', merged && merged.merged === true);
ok('子地块数 = 2', merged && merged.subPlots && merged.subPlots.length === 2);
ok('子地块环被原样保留（A 的环与入参逐点相同）',
  merged && JSON.stringify(merged.subPlots[0].polyLatLng) === JSON.stringify(plotA.polyLatLng));
ok('子地块环被原样保留（B 的环与入参逐点相同）',
  merged && JSON.stringify(merged.subPlots[1].polyLatLng) === JSON.stringify(plotB.polyLatLng));

// 外轮廓：2 个矩形并集的外轮廓应为 4 个外侧角（凸包）—— 共享边上的 2 个点必被剔除
console.log('  外轮廓顶点数 = ' + (merged ? merged.polyLatLng.length : '?') + '（凸包应为 4）');
ok('外轮廓 = 凸包 4 顶点（共享边上 2 点被剔除）', merged && merged.polyLatLng.length === 4);

// ★ v189 语义（用户纠正 2026-10-03）：成组**不是**把小块并成一个大地块，
//    面积必须是「各成员之和」，**不能**是凸包面积（凸包会把块间道路/水渠/空地算进来）。
const areaA = require(path.join(__dirname, '..', 'runye-geo.js')).geodesicArea(plotA.polyLatLng);
const areaB = require(path.join(__dirname, '..', 'runye-geo.js')).geodesicArea(plotB.polyLatLng);
const areaM = merged ? merged.sqm : 0;
console.log('  A=' + areaA.toFixed(1) + '㎡  B=' + areaB.toFixed(1) + '㎡  成组=' + areaM + '㎡  和=' + (areaA + areaB).toFixed(1) + '㎡');
ok('★ 成组面积 = 各成员之和（不是凸包面积）', Math.abs(areaM - (areaA + areaB)) / (areaA + areaB) < 0.005,
  '差 ' + ((areaM - (areaA + areaB)) / (areaA + areaB) * 100).toFixed(3) + '%');
// 权威几何必须是「成员环集合」，且环数与成员数一致（空隙靠「环之间不合并」保留）
ok('★ 权威几何 polyLatLngSet = 各成员环（环数 = 成员数）',
  merged && Array.isArray(merged.polyLatLngSet) && merged.polyLatLngSet.length === 2,
  merged ? '环数 ' + (merged.polyLatLngSet || []).length : '');
ok('★ polySetM 有对应的本地米坐标版（二级页可直接画各自轮廓）',
  merged && Array.isArray(merged.polySetM) && merged.polySetM.length === merged.polyLatLngSet.length);

console.log('\n=== T2 子地块快照字段完备（供二级页「分别布管」）===');
ok('每个子地块都有 id/name/mu/sqm/polyLatLng/center',
  merged && merged.subPlots.every(s => s.id && s.name && s.mu != null && s.sqm != null && Array.isArray(s.polyLatLng) && s.center),
  merged ? JSON.stringify(merged.subPlots.map(s => ({ id: s.id, hasCenter: !!s.center }))) : '');
ok('subIds 串起来 = A|B', merged && merged.subIds === 'A|B', merged && merged.subIds);

console.log('\n=== T3 与普通地块同构（下游零改动可用）===');
const Geo = require(path.join(__dirname, '..', 'runye-geo.js'));
ok('有 poly（本地米坐标）且顶点数与外轮廓一致', merged && Array.isArray(merged.poly) && merged.poly.length === merged.polyLatLng.length);
ok('有 geo 基准（proj=mercatorLocal）', merged && merged.geo && merged.geo.proj === 'mercatorLocal');
ok('有 center', merged && merged.center && isFinite(merged.center.lat));
ok('crs=GCJ-02', merged && merged.crs === 'GCJ-02');
ok('source=group（v189 语义：成组，不再是 merge）', merged && merged.source === 'group');
ok('★ grouped=true 且 merged=true（新键 + 向后兼容键都在）',
  merged && merged.grouped === true && merged.merged === true);
ok('★ 凸包只作参考外框：显式暴露为 hullLatLng（防止被误当轮廓）',
  merged && Array.isArray(merged.hullLatLng) && merged.hullLatLng.length === merged.polyLatLng.length);
// poly 米坐标能否经 geo 反投回原点一致（自洽性）：m2ll(x,y,base) → {lat,lng}
const base = { refLat: merged.geo.refLat, refLng: merged.geo.refLng };
const back = merged.poly.map(p => Geo.m2ll(p.x, p.y, base));
const d0 = Math.abs(back[0].lat - merged.polyLatLng[0][0]) * 111000;
ok('poly → 经纬度反投与 polyLatLng 首点差 < 2m', isFinite(d0) && d0 < 2, '差 ' + d0 + 'm');
// 再逐点验一遍：全部顶点的反投残差都应 < 2m（说明 geo 基准与 poly 原点确实自洽）
const maxRes = Math.max.apply(null, back.map((b, i) =>
  Geo.hav({ lat: b.lat, lng: b.lng }, { lat: merged.polyLatLng[i][0], lng: merged.polyLatLng[i][1] })));
console.log('  逐点反投最大残差 = ' + maxRes.toFixed(3) + 'm');
ok('全部顶点反投残差 < 2m（geo 基准与 poly 原点自洽）', maxRes < 2, '最大 ' + maxRes.toFixed(3) + 'm');
const muFromPoly = Geo.geodesicArea(back.map(b => [b.lat, b.lng])) / 666.67;
/* ★ v189：`poly` 是**凸包**的米坐标（仅供包围盒/飞行定位），而 `mu` 是**成员之和**。
   两者不再相等（差的就是块间空隙）—— 所以这里不能再断言「反投 == merged.mu」，
   改为断言「反投面积 ≈ 凸包面积」，这才是 self-consistent 的口径。 */
const hullSqm = Geo.geodesicArea(back.map(b => [b.lat, b.lng]));
console.log('  凸包反投 = ' + hullSqm.toFixed(1) + '㎡（' + (hullSqm / 666.67).toFixed(3) + ' 亩）；成员之和 = ' + merged.mu + ' 亩');
ok('★ 参考外框（凸包）反投自洽：凸包面积 ≥ 成员之和（含空隙，故应更大或相等）',
  hullSqm >= merged.sqm * 0.995 && hullSqm > 0,
  '凸包 ' + hullSqm.toFixed(1) + '㎡ vs 成员和 ' + merged.sqm + '㎡');
/* 真正的面积自洽：把 polyLatLngSet（各成员环）反投重算，应 ≈ merged.mu */
const muSet = merged.polyLatLngSet.reduce(function (a, ring) {
  return a + Geo.geodesicArea(ring.map(function (q) { return [q[0], q[1]]; }));
}, 0) / 666.67;
ok('★ 权威几何（成员环集合）反投重算面积 ≈ merged.mu（±1%）',
  Math.abs(muSet - merged.mu) / merged.mu < 0.01,
  '集合 ' + muSet.toFixed(3) + ' 亩 vs 记录 ' + merged.mu + ' 亩');

console.log('\n=== T4 拼接前提与边界 ===');
ok('只有 1 块 → 返回 null（不能拼）', M.merge.plots([plotA], {}) === null);
ok('空数组 → null', M.merge.plots([], {}) === null);
ok('含无效环的子地块被过滤后不足 2 → null',
  M.merge.plots([plotA, { id: 'X', polyLatLng: [[1, 1], [1, 1]] }], {}) === null);
ok('入参对象未被污染（plotA 上没多出 merged 字段）', plotA.merged === undefined && plotA.subPlots === undefined);

console.log('\n=== T5 canUnmerge 拆分校验 ===');
const c1 = M.merge.canUnmerge(merged);
ok('拼接地块 → ok:true, count:2', c1.ok === true && c1.count === 2, JSON.stringify(c1));
const c2 = M.merge.canUnmerge(plotA);
ok('普通地块 → ok:false', c2.ok === false, JSON.stringify(c2));
const broken = JSON.parse(JSON.stringify(merged));
broken.subPlots[1].polyLatLng = [[1, 1]];
const c3 = M.merge.canUnmerge(broken);
ok('子地块缺环 → ok:false 且指明第几个', c3.ok === false && /第 2 个/.test(c3.reason), JSON.stringify(c3));

console.log('\n=== T6 三块 L 形（凸包 ⊃ 并集，须能看出差异）===');
// L 形：两块在下、一块在右上 → 凸包会把左上角「补」出来
const p1 = { id: 'p1', polyLatLng: rect(B[0], B[1], 0.0002, 0.0002) };
const p2 = { id: 'p2', polyLatLng: rect(B[0], B[1] + 0.0002, 0.0002, 0.0002) };
const p3 = { id: 'p3', polyLatLng: rect(B[0] + 0.0002, B[1] + 0.0002, 0.0002, 0.0002) };
const L3 = M.merge.plots([p1, p2, p3], { name: 'L 形三块' });
ok('三块成组成功', !!L3 && L3.subPlots.length === 3);
const sum3 = [p1, p2, p3].reduce((a, p) => a + Geo.geodesicArea(p.polyLatLng), 0);
console.log('  三块之和 = ' + sum3.toFixed(1) + '㎡   成组记录 = ' + (L3 ? L3.sqm : 0) + '㎡');
ok('★ 三块 L 形：成组面积 = 三块之和（凸包会把缺角补上，所以不能用凸包）',
  L3 && Math.abs(L3.sqm - sum3) / sum3 < 0.005,
  '记录 ' + (L3 && L3.sqm) + ' vs 和 ' + sum3.toFixed(1));
/* 凸包面积应**大于**成员之和（补了角），这正好说明「用凸包当面积会多算」。 */
const hullOnly = Math.round(Geo.geodesicArea(L3.hullLatLng));
console.log('  参考外框（凸包）= ' + hullOnly + '㎡ —— 比成员之和大 ' +
  ((hullOnly - sum3) / sum3 * 100).toFixed(2) + '%（这就是「被吞掉的空地」）');
ok('★ 凸包确实比成员之和大（证明用凸包当面积会多算被吞的空地）',
  hullOnly >= sum3, hullOnly + ' vs ' + sum3.toFixed(1));

console.log('\n=== T7 ★★ 核心诉求：块与块之间的空隙必须保留（不许被并掉）===');
/* 用户原话：「两个地块间距有 3 米，那这个三米就留着，是一块空地好了，
   这块空地可能是无法使用的地块，也可能是道路 也可能是水渠。」
   构造：两块各 0.0002°（≈22.2m）见方的小块，中间空出 0.00003°（≈3.3m）的缝。 */
const GAP = 0.00003;   // ≈3.3m 的间隔（道路/水渠）
const gA = { id: 'gA', name: '左块', crop: '七彩花生', polyLatLng: rect(B[0], B[1], 0.0002, 0.0002) };
const gB = { id: 'gB', name: '右块', crop: '水稻', polyLatLng: rect(B[0], B[1] + 0.0002 + GAP, 0.0002, 0.0002) };
const GRP = M.merge.plots([gA, gB], { name: '带缝成组' });
const gapA = Geo.geodesicArea(gA.polyLatLng), gapB = Geo.geodesicArea(gB.polyLatLng);
const gapSum = gapA + gapB;
console.log('  左块=' + gapA.toFixed(1) + '㎡  右块=' + gapB.toFixed(1) + '㎡  ' +
  '缝隙面积≈' + (Geo.geodesicArea(GRP.hullLatLng) - gapSum).toFixed(1) + '㎡');
ok('★★ 成组面积 = 左右两块之和，**不含**中间那条 3m 缝',
  Math.abs(GRP.sqm - gapSum) / gapSum < 0.01,
  '成组 ' + GRP.sqm + '㎡ vs 两块和 ' + gapSum.toFixed(1) + '㎡');
ok('★★ 权威几何是两个独立环（不是被并成一个大环）',
  GRP.polyLatLngSet.length === 2, '环数 ' + GRP.polyLatLngSet.length);
/* 关键：两个环必须**不接触** —— 即存在一条缝。用「两环最近点距离」证明。 */
function minGapMiles(ringX, ringY) {
  let best = Infinity;
  ringX.forEach((ax) => ringY.forEach((ay) => {
    const d = Geo.hav({ lat: ax[0], lng: ax[1] }, { lat: ay[0], lng: ay[1] });
    if (d < best) best = d;
  }));
  return best;
}
const sep = minGapMiles(GRP.polyLatLngSet[0], GRP.polyLatLngSet[1]);
console.log('  两环最近点距离 = ' + sep.toFixed(2) + 'm（期望 ≈ 3.3m 的缝）');
ok('★★ 两个成员环之间确实留着缝（最近点距离 ≈ 3.3m，未被并到一起）',
  sep > 2 && sep < 5, sep.toFixed(2) + 'm');
/* 反向对照：若把缝隙「并掉」（旧凸包当唯一轮廓），就只剩 1 个环、缝消失。 */
ok('★ 反向对照：凸包只有 1 个环（说明「并成一块」会丢缝）',
  Array.isArray(GRP.hullLatLng) && GRP.hullLatLng.length >= 3 && !Array.isArray(GRP.hullLatLng[0][0]));

console.log('\n========================================');
console.log('  成组几何探针：PASS=' + pass + '  FAIL=' + fail);
console.log('========================================');
process.exitCode = fail ? 1 : 0;
