/* tests/plot_merge.smoke.cjs · v185 地块拼接 + 二级「地块划分」开关 契约闸门
 *
 * 覆盖三件事（对应用户三条诉求）：
 *   ① 拼接：mergePlots 真的产出「保留子地块 + 外层综合轮廓」的大地块（几何正确）
 *   ② 传递：拼接地块带齐 merged/subPlots/poly/geo/polyLatLng，能走既有 measuredPolygon 链路
 *   ③ 开关：二级页「地块划分」开关的存在、默认开、门控 CSS、以及「关闭不改计算结果」的口径
 *
 * 设计要点（吃过亏的地方）：
 *   · 每条断言都要有「能让它变红」的反例 —— 不做恒真断言。
 *   · 「开关关闭不影响计算」这条必须查**实现方式**（CSS 门控 + 计算路径不含开关条件），
 *     而不是只查「有个 checkbox」。否则改坏了（比如在 calcPlan 里 early-return）也照样绿。
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const M = require(path.join(ROOT, 'runye-map-enhance.js'));
const Geo = require(path.join(ROOT, 'runye-geo.js'));
const ENHANCE_SRC = fs.readFileSync(path.join(ROOT, 'runye-map-enhance.js'), 'utf8');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const MAP_SRC = fs.readFileSync(path.join(ROOT, 'runye-map-measure.html'), 'utf8');

/* ---------- 测试夹具：三亚附近两块相邻矩形 ---------- */
const B = [18.25, 109.51];
function rect(lat0, lng0, dLat, dLng) {
  return [[lat0, lng0], [lat0, lng0 + dLng], [lat0 + dLat, lng0 + dLng], [lat0 + dLat, lng0]];
}
const plotA = { id: 'A', name: '地块A', crop: '七彩花生', polyLatLng: rect(B[0], B[1], 0.0002, 0.0002), mu: 0.71, sqm: 470.7 };
const plotB = { id: 'B', name: '地块B', crop: '七彩花生', polyLatLng: rect(B[0], B[1] + 0.0002, 0.0002, 0.0002), mu: 0.71, sqm: 470.7 };

/* =========================================================================
 * ① 拼接几何：保留子地块 + 外层综合轮廓
 * ========================================================================= */
test('①-a 两块相邻小地块拼成大地块，子地块环被逐点原样保留', () => {
  const m = M.merge.plots([plotA, plotB], { name: '拼接大地块' });
  assert.ok(m, 'mergePlots 应返回大地块');
  assert.strictEqual(m.merged, true, '必须打 merged:true 标记（二级页据此识别）');
  assert.strictEqual(m.subPlots.length, 2, '子地块应保留 2 个');
  assert.deepStrictEqual(m.subPlots[0].polyLatLng, plotA.polyLatLng, '子地块 A 的环必须逐点保留');
  assert.deepStrictEqual(m.subPlots[1].polyLatLng, plotB.polyLatLng, '子地块 B 的环必须逐点保留');
});

test('①-b 参考外框 = 凸包（仅供包围盒/飞行定位，不是可见轮廓）', () => {
  const m = M.merge.plots([plotA, plotB], {});
  /* 两个矩形共享一条边 → 8 个顶点里有 2 个落在并集内部 → 凸包只剩 4 个外侧角 */
  assert.strictEqual(m.polyLatLng.length, 4,
    '两块相邻矩形的凸包应为 4 顶点，实得 ' + m.polyLatLng.length);
  /* ★ v189：凸包必须被**显式命名**为 hullLatLng，防止下游误当成轮廓。
     同时权威几何 polyLatLngSet 必须是「两个独立环」（不是被并成一个 4 顶点大环）。 */
  assert.strictEqual(m.hullLatLng, m.polyLatLng, 'hullLatLng 应与 polyLatLng 同源（显式标注为参考外框）');
  assert.strictEqual(m.polyLatLngSet.length, 2, '★ 权威几何应是 2 个成员环，而不是 1 个合并环');
  assert.strictEqual(m.polyLatLngSet[0].length, 4, '成员环 0 应是自己的 4 顶点矩形');
  assert.strictEqual(m.polyLatLngSet[1].length, 4, '成员环 1 应是自己的 4 顶点矩形');
  // 凸包必须包含全部子地块顶点（任意子地块顶点都不应在凸包外）
  const hull = m.polyLatLng;
  function insideOrOn(p, poly) {
    // 用「所有边的叉积同号」判凸多边形内含（含边界）
    let pos = 0, neg = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const cr = (b[1] - a[1]) * (p[0] - a[0]) - (b[0] - a[0]) * (p[1] - a[1]);
      if (cr > 1e-12) pos++; else if (cr < -1e-12) neg++;
    }
    return pos === 0 || neg === 0;
  }
  [plotA, plotB].forEach((pl, pi) => {
    pl.polyLatLng.forEach((pt, i) => {
      assert.ok(insideOrOn(pt, hull), `子地块 ${pi} 第 ${i} 个顶点落在凸包外`);
    });
  });
});

test('①-c 面积口径（v189）：取各成员之和，且 ≤ 凸包面积', () => {
  const m = M.merge.plots([plotA, plotB], {});
  const sum = Geo.geodesicArea(plotA.polyLatLng) + Geo.geodesicArea(plotB.polyLatLng);
  const d = Math.abs(m.sqm - sum) / sum;
  /* ★ v189：面积必须 = 各成员之和（不含块间空隙），而不是凸包面积。
     两块**正好相邻**（无缝）时二者数值相等 ⇒ 本用例只能证「等于成员和」。
     真正能区分「凸包 vs 成员和」的用例在 ①-d（L 形有缺角）与 ①-g（留 3m 缝）。 */
  assert.ok(d < 0.005, `成组面积 ${m.sqm} 与两块之和 ${sum.toFixed(1)} 相对差 ${(d * 100).toFixed(3)}% 应 <0.5%`);
  /* 反向保护：面积绝不能等于凸包面积（凸包 ≥ 成员和，实测只在无缝时相等）。
     断言 ≤ 凸包 + 容差，确保量纲没错到「用了凸包还偏大」。 */
  const hullArea = Geo.geodesicArea(m.polyLatLng);
  assert.ok(m.sqm <= hullArea * 1.005,
    `成组面积 ${m.sqm} 不应超过凸包面积 ${hullArea.toFixed(1)} —— 否则说明面积算错了（多算了被吞的空地）`);
});

test('①-d ★ L 形三块：凸包 > 成员之和（证明「用凸包当面积」会多算被吞的空地）', () => {
  const p1 = { id: 'p1', polyLatLng: rect(B[0], B[1], 0.0002, 0.0002) };
  const p2 = { id: 'p2', polyLatLng: rect(B[0], B[1] + 0.0002, 0.0002, 0.0002) };
  const p3 = { id: 'p3', polyLatLng: rect(B[0] + 0.0002, B[1] + 0.0002, 0.0002, 0.0002) };
  const m = M.merge.plots([p1, p2, p3], {});
  assert.strictEqual(m.subPlots.length, 3, '三块都应保留');
  const sum = [p1, p2, p3].reduce((a, p) => a + Geo.geodesicArea(p.polyLatLng), 0);
  /* ★ v189 核心：成组面积 = 三块之和（缺角那格不计入） */
  assert.ok(Math.abs(m.sqm - sum) / sum < 0.005,
    `成组面积 ${m.sqm} 应 = 三块之和 ${sum.toFixed(1)}（±0.5%）`);
  /* ★ 反向对照：凸包必须**严格大于**成员之和 —— 这才是「不能用凸包当面积」的证明。
     L 形缺角被凸包补满，凸包必然 > 真实面积。若这条不成立，说明样本退化了。 */
  const hullArea = Geo.geodesicArea(m.polyLatLng);
  assert.ok(hullArea > sum * 1.05,
    `凸包面积 ${hullArea.toFixed(1)} 应显著大于成员之和 ${sum.toFixed(1)}（L 形缺角被补满）——` +
    `否则本用例无法区分「凸包口径」与「成员和口径」，是个退化样本`);
});

test('①-g ★★ 核心（v189）：块间留缝时，缝必须保留、不许被并掉', () => {
  /* 用户原话：「比如说两个地块间距有 3 米，那这个三米就留着，是一块空地好了，
     这块空地可能是无法使用的地块，也可能是道路 也可能是水渠。」
     ⇒ 构造两块中间留 ≈3.3m 缝（模拟道路/水渠），断言：
       ① 成组面积 = 两块之和（**不含**缝的面积）
       ② 权威几何是两个独立环（不是被并成一个）
       ③ 两环最近点距离 ≈ 3.3m（缝真的还在）
       ④ 反向对照：凸包只有 1 个环（证明「并成一块」会丢缝） */
  const GAP = 0.00003;   // ≈3.3m
  const gA = { id: 'gA', name: '左块', crop: '七彩花生', polyLatLng: rect(B[0], B[1], 0.0002, 0.0002) };
  const gB = { id: 'gB', name: '右块', crop: '水稻', polyLatLng: rect(B[0], B[1] + 0.0002 + GAP, 0.0002, 0.0002) };
  const g = M.merge.plots([gA, gB], { name: '带缝成组' });
  assert.ok(g, '带缝成组应成功');

  const sum = Geo.geodesicArea(gA.polyLatLng) + Geo.geodesicArea(gB.polyLatLng);
  assert.ok(Math.abs(g.sqm - sum) / sum < 0.005,
    `★ 成组面积 ${g.sqm} 应 = 两块之和 ${sum.toFixed(1)}（缝不计入）`);

  assert.strictEqual(g.polyLatLngSet.length, 2, '★ 权威几何应是两个独立环（不是并成一个）');

  // ③ 两环最近点距离 ≈ 缝宽
  let minD = Infinity;
  g.polyLatLngSet[0].forEach(a => {
    g.polyLatLngSet[1].forEach(b => {
      const d = Geo.hav({ lat: a[0], lng: a[1] }, { lat: b[0], lng: b[1] });
      if (d < minD) minD = d;
    });
  });
  assert.ok(minD > 2.0 && minD < 5.0,
    `★ 两成员环最近点距离应 ≈3.3m（缝保留），实得 ${minD.toFixed(2)}m`);

  /* ④ 反向对照：凸包面积 > 成员之和 —— 差额就是那条被吞掉的缝。
     ⚠ 不能用「凸包环长 ≠ 成员环长」当判据：两个**分离**矩形的凸包恰好是 4 顶点，
       与单个成员环长相同（几何上正确）⇒ 那条断言是错的判据（实测红）。
       真正有鉴别力的对照是**面积**：凸包必然含住那条缝。 */
  const hullArea2 = Geo.geodesicArea(g.polyLatLng);
  const gapArea = hullArea2 - sum;
  assert.ok(gapArea > 0,
    `★ 反向对照：凸包面积 ${hullArea2.toFixed(1)} 应大于成员之和 ${sum.toFixed(1)}，` +
    `差额（≈${gapArea.toFixed(1)}㎡）就是被吞掉的缝 —— 证明「用凸包当几何」确实会丢缝`);
  /* 且差额量级应≈缝面积（3.3m × 22m ≈ 73㎡），确认不是数值噪声 */
  assert.ok(gapArea > 20 && gapArea < 200,
    `缝面积量级应在 20~200㎡ 之间（实测 ${gapArea.toFixed(1)}㎡），确认差额就是那条缝而非舍入误差`);
});

test('①-e 拼接前提：<2 块 / 空集 / 含无效环 → 返回 null（不能拼）', () => {
  assert.strictEqual(M.merge.plots([plotA], {}), null, '单块不能拼');
  assert.strictEqual(M.merge.plots([], {}), null, '空集不能拼');
  assert.strictEqual(M.merge.plots([plotA, { id: 'X', polyLatLng: [[1, 1], [1, 1]] }], {}), null,
    '含无效环的子地块应被过滤，只余 1 块 → null');
});

test('①-f mergePlots 不改动入参（纯函数）', () => {
  const before = JSON.stringify(plotA);
  M.merge.plots([plotA, plotB], {});
  assert.strictEqual(JSON.stringify(plotA), before, '入参对象不得被污染');
  assert.strictEqual(plotA.merged, undefined, '入参不得被加上 merged 字段');
});

/* =========================================================================
 * ② 传递：拼接地块与普通地块同构，能走既有 measuredPolygon 链路
 * ========================================================================= */
test('②-a 成组地块具备普通地块的全部关键字段（下游零改动可用）', () => {
  const m = M.merge.plots([plotA, plotB], {});
  /* ★ v189：权威几何字段 polyLatLngSet（各成员环集合）是新增的必备字段 —— 少了它
     下游就只能退回凸包，块间空隙会被吞掉。故一并纳入「关键字段」清单。 */
  ['id', 'name', 'mu', 'sqm', 'poly', 'polyLatLng', 'polyLatLngSet', 'hullLatLng', 'center', 'geo', 'crop', 'source', 'crs', 'ts']
    .forEach(k => assert.ok(m[k] !== undefined && m[k] !== null, `成组地块缺字段 ${k}`));
  /* v189 语义：source 由 'merge' 改为 'group'（成组）。断言写死 'group'，
     旧值 'merge' 会红 —— 正是「语义纠正必须留痕」的意图。 */
  assert.strictEqual(m.source, 'group', "source 应为 group（v189 成组语义；旧值 'merge' 已废弃）");
  assert.strictEqual(m.crs, 'GCJ-02', 'crs 应为 GCJ-02');
  assert.strictEqual(m.geo.proj, 'mercatorLocal', 'geo 基准应为 mercatorLocal');
  assert.strictEqual(m.grouped, true, 'v189 正式语义字段 grouped 应为 true');
  assert.strictEqual(m.merged, true, 'merged 保留为向后兼容字段，应仍为 true');
});

test('②-b poly（本地米坐标）经 geo 基准反投回经纬度，逐点残差 <2m', () => {
  const m = M.merge.plots([plotA, plotB], {});
  const base = { refLat: m.geo.refLat, refLng: m.geo.refLng };
  const back = m.poly.map(p => Geo.m2ll(p.x, p.y, base));
  let maxRes = 0;
  back.forEach((b, i) => {
    const d = Geo.hav({ lat: b.lat, lng: b.lng }, { lat: m.polyLatLng[i][0], lng: m.polyLatLng[i][1] });
    if (d > maxRes) maxRes = d;
  });
  assert.ok(maxRes < 2, `反投最大残差 ${maxRes.toFixed(3)}m 应 <2m（说明 geo 基准与 poly 原点自洽）`);
});

test('②-c 每个子地块都带 id/name/mu/sqm/center/polyLatLng（供「分别布管」定位）', () => {
  const m = M.merge.plots([
    { id: 'A', name: 'A', polyLatLng: plotA.polyLatLng },      // 故意不给 mu/sqm/center
    { id: 'B', name: 'B', polyLatLng: plotB.polyLatLng }
  ], {});
  m.subPlots.forEach((s, i) => {
    ['id', 'name', 'mu', 'sqm', 'center', 'polyLatLng'].forEach(k =>
      assert.ok(s[k] !== undefined && s[k] !== null, `子地块 ${i} 缺字段 ${k}（缺了就没法分别布管/定位）`));
    assert.ok(isFinite(s.center.lat) && isFinite(s.center.lng), `子地块 ${i} center 必须是有限数`);
    assert.ok(s.sqm > 0 && s.mu > 0, `子地块 ${i} 面积应由环重算出来，不能是 null`);
  });
});

test('②-d canUnmerge 校验 + 撤销拼接的数据完整性', () => {
  const m = M.merge.plots([plotA, plotB], {});
  const ok = M.merge.canUnmerge(m);
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(ok.count, 2);
  assert.strictEqual(M.merge.canUnmerge(plotA).ok, false, '普通地块不能拆');
  const broken = JSON.parse(JSON.stringify(m));
  broken.subPlots[1].polyLatLng = [[1, 1]];
  const bad = M.merge.canUnmerge(broken);
  assert.strictEqual(bad.ok, false);
  assert.match(bad.reason, /第 2 个/, '应指明是第几个子地块缺环');
});

test('②-e 模块导出 merge 命名空间（plots/hull/canUnmerge/unmerge 四件套）', () => {
  assert.strictEqual(typeof M.merge.plots, 'function');
  assert.strictEqual(typeof M.merge.hull, 'function');
  assert.strictEqual(typeof M.merge.canUnmerge, 'function');
  assert.strictEqual(typeof M.merge.unmerge, 'function', 'unmerge 供地图页列表按钮离线调用');
});

/* =========================================================================
 * ③ 二级页「地块划分」开关
 * ========================================================================= */
test('③-a 开关控件存在且 id/文案齐全，默认 checked（=自动划分，向后兼容）', () => {
  assert.match(MAP_SRC, /id="btnMerge"/, '地图页应有「拼接地块」入口');
  const mChk = INDEX_SRC.match(/<input type="checkbox" id="ppZoneAutoChk"([^>]*)>/);
  assert.ok(mChk, 'index.html 必须有 #ppZoneAutoChk');
  assert.match(mChk[1], /checked/, '#ppZoneAutoChk 默认应为 checked（默认自动划分）');
  assert.match(INDEX_SRC, /id="ppZoneAutoTxt"/, '应有文案节点 #ppZoneAutoTxt');
  assert.match(INDEX_SRC, /id="ppZoneAutoWrap"/, '应有包裹节点 #ppZoneAutoWrap');
});

test('③-b 门控口径（v189）：关开关 = **真的不划分**，必须进入分区计算路径', () => {
  /* ★ 语义反转（v189 用户纠正）：
     旧口径「关开关只隐藏显示、不参与计算」已被用户明确否定 ——
     用户原话：「如果这个开关关闭之后，地块就不自动划分分区了，你修改过来。」
     ⇒ 新口径：开关**必须**影响分区计算（在最上游 ppGetZoneLayout 短路成 1×1）。
     故本测试从「断言计算路径不含 zoneAuto」翻转为「断言计算路径**确实**含 zoneAuto」。 */

  // (1) 上游短路存在：ppGetZoneLayout 里必须有开关判断 + 返回 1 列 1 行
  const k = INDEX_SRC.indexOf('function ppGetZoneLayout(');
  assert.ok(k > 0, '应有 ppGetZoneLayout');
  const seg = INDEX_SRC.slice(k, k + 3600);
  assert.match(seg, /if\s*\(\s*!ppZoneAutoOn\(\)\s*\)\s*\{/,
    'ppGetZoneLayout 必须以「开关关闭」短路开头（这是「真的不划分」的唯一实现点）');
  assert.match(seg, /cols:1,\s*rows:1,\s*N:1/,
    '短路分支必须返回 1 列 × 1 行（整块当一个区）');

  /* (2) ★★ 单位口径：短路的 zoneW/zoneH 必须 **≥ 整块任何边长**（否则仍会切出多格）。
     为什么单独断言：下游 ppGetZoneCuts 有**长短边互换**逻辑
       longIsX = dims.w >= dims.h;  xDesign = longIsX ? shortSide : longSide;
     ⇒ xDesign 取的是 zoneW/zoneH 里**较短**那条。只把「对应轴」给足（如 zoneW=planW）
       仍会被换成较短值 ⇒ ppSplitLength(600,400)=[400,200] ⇒ 残留 2 格（实测踩到）。
     正确做法：两条都给 ≥ max(planW,planH) 的上界（本实现取 hypot）。
     ⇒ 断言：短路分支内必须出现 Math.hypot（或等价的「两条同值且取自同一上界」写法），
       且**不得**直接写 zoneW:b.w（像素单位，量纲错误）。 */
  assert.match(seg, /Math\.hypot\s*\(/, '短路分支的 zoneW/zoneH 应取「≥ 任何边长」的统一上界（Math.hypot）');
  const shortSeg = seg.slice(0, seg.indexOf('autoOff:true'));
  assert.ok(!/zoneW\s*:\s*b\.w|zoneH\s*:\s*b\.h/.test(shortSeg),
    '短路分支不得用 b.w/b.h（那是 SVG 像素包围盒，与下游 plan 米量纲不符 ⇒ 会多切一格）');

  // (3) 门控 CSS 仍保留（作为「万一某处没走短路」的最后兜底）
  assert.match(INDEX_SRC, /body\.ry-zoneauto-off\s+#ppDiagramContent\s+\.pp-zone-layer\{display:none\}/,
    '应保留 body.ry-zoneauto-off 门控 .pp-zone-layer 的 CSS（末级兜底）');
  // (4) SVG 里分区层真的挂了这两个类（否则 CSS 门控打不到东西）
  assert.match(INDEX_SRC, /class="pp-zone-layer"/, '分区底色层应挂 class="pp-zone-layer"');
  const labelGroups = (INDEX_SRC.match(/class="pp-zone-label"/g) || []).length;
  assert.ok(labelGroups >= 2, `分区标注层 + 分区线层都应挂 class="pp-zone-label"，实得 ${labelGroups} 处`);

  /* (5) 反向保护：分区计算路径里读开关的地方**只允许 ppGetZoneLayout 一处**。
     其余读开关的点必须都是「纯 UI」用途（判文案 / 回填勾选框），不得参与几何或水力计算。
     怎么写才不是硬编码数字：把「读开关」的行**按所在函数**归类，逐个核对。
     实测 4 处调用：13903(ppGetZoneLayout 短路 ✓计算) / 15536(ppApplyZoneAutoUI 判文案 ✓UI)
     / 15586(ppInitZoneAuto 回填 checked，同一行 2 次 ✓UI) / 15590(挂 window，无括号)。
     ⇒ 断言：**恰好 1 处**出现在几何计算函数 ppGetZoneLayout 里；其余都在 UI 函数里。 */
  const lines = INDEX_SRC.split('\n');
  const readSites = [];
  lines.forEach((ln, i) => {
    if (/ppZoneAutoOn\s*\(/.test(ln) && !/function\s+ppZoneAutoOn\s*\(/.test(ln)) readSites.push(i);
  });
  assert.ok(readSites.length >= 2, '至少应有「短路」与「判文案」两处读开关');
  const inLayout = readSites.filter(i => {
    /* 从该行往上找最近的 function 定义，判断归属 */
    for (let j = i; j >= 0 && j > i - 400; j--) {
      const m = lines[j].match(/^\s*function\s+([A-Za-z_$][\w$]*)\s*\(/);
      if (m) return m[1] === 'ppGetZoneLayout';
    }
    return false;
  });
  assert.strictEqual(inLayout.length, 1,
    `读开关应恰好 1 处落在几何计算函数 ppGetZoneLayout 内（实得 ${inLayout.length} 处）；` +
    `其余读开关点必须只做 UI（判文案/回填勾选框），不得参与几何或水力计算。`);
  /* 再显式点名那几处 UI 用途，防止有人把开关判断挪进 calcPlan 之类的计算函数。
     ⚠ 归属判定要取**最近**的包裹函数：ppInitZoneAuto 是一个 IIFE，物理上嵌在
       ppSetZoneAuto 之后，缩进不同 ⇒ 必须取「往上第一个 function 定义」，
       而不是「第一个缩进为 2 空格的 function」。实测按缩进判会误归到 ppSetZoneAuto。 */
  const UI_FUNCS = ['ppApplyZoneAutoUI', 'ppInitZoneAuto', 'ppSetZoneAuto'];
  readSites.forEach(i => {
    if (inLayout.includes(i)) return;
    let owner = null;
    for (let j = i; j >= 0 && j > i - 400; j--) {
      const m = lines[j].match(/^\s*(?:IIFE\s*)?function\s+([A-Za-z_$][\w$]*)\s*\(/) ||
                lines[j].match(/^\s*\(function\s+([A-Za-z_$][\w$]*)\s*\(/);
      if (m) { owner = m[1]; break; }
    }
    assert.ok(UI_FUNCS.includes(owner),
      `第 ${i + 1} 行读开关，归属函数「${owner}」不在允许的 UI 白名单 ${UI_FUNCS.join('/')} 内 —— ` +
      `若它参与计算，就会出现「画面一个区、数据 N 个区」的分裂。`);
  });
});

test('③-c 关闭开关的处理（v189）：退出 adjustCut + 重算下游，不自动切手动划分', () => {
  assert.match(INDEX_SRC, /function ppSetZoneAuto\(on\)/, '应有 ppSetZoneAuto');
  const k = INDEX_SRC.indexOf('function ppSetZoneAuto(on)');
  const seg = INDEX_SRC.slice(k, k + 2600);
  /* ★ v189 语义：关闭时**不再**自动切到 adjustCut（那条路已被用户否定）。
     改为：若当时恰在 adjustCut → 退出回 main（因为没有内部线可拖了）。 */
  assert.match(seg, /ppState\.mode\s*=\s*'main'/, "关闭时应退出 adjustCut 回到 'main'");
  assert.ok(!/ppState\.mode\s*=\s*'adjustCut'/.test(seg),
    "关闭分支不得再把 mode 设为 'adjustCut'（v189 已删除「关闭→自动切手动划分」这条旧行为）");
  // 必须重算下游（这才是「真的不划分」的落地动作），而不只是切 CSS 类
  assert.match(seg, /ppRender\(\)/, '开关改变后必须调 ppRender() 重算二级画布');
  assert.match(seg, /ppRefreshDiagramIfVisible/, '开关改变后必须重建施工简图（否则画面仍显示旧分区数）');
  assert.match(seg, /localStorage\.setItem\('runye_zone_auto'/, '开关状态应持久化到 runye_zone_auto');
  assert.ok(INDEX_SRC.includes('getItem(\'runye_zone_auto\')'), '初始态应读存档 runye_zone_auto');
});

test('③-d 默认口径：无存档时 zoneAuto=true（老流程零变化）', () => {
  // ppState 初始值
  assert.match(INDEX_SRC, /zoneAuto:true/, 'ppState.zoneAuto 初值应为 true');
  // 初始化分支：s===null → true
  const k = INDEX_SRC.indexOf('function ppInitZoneAuto');
  assert.ok(k > 0, '应有 ppInitZoneAuto');
  const seg = INDEX_SRC.slice(k, k + 900);
  assert.match(seg, /s===null\)?\s*\?\s*true/, '无存档时必须回落为 true（默认自动划分）');
});

test('③-e 地图页成组模式开关与图层面板勾选框双向一致（不留分裂状态）', () => {
  assert.match(MAP_SRC, /function setMergeMode\(on\)/, '地图页应有 setMergeMode');
  assert.match(MAP_SRC, /onMergeMode:\s*onMergeModeChange/, 'attach 时应传 onMergeMode 回调');
  assert.match(MAP_SRC, /rymHandle\.setLayer\('mergepick'/, '地图页应通过面板 setLayer 同步「地块成组」勾选框');
  assert.match(ENHANCE_SRC, /k === 'mergepick'/, 'enhance 侧应处理 mergepick 开关');
  /* v189：面板文案由「拼接多选」改为「地块成组」（用户纠正后统一口径）。
     断言写死新文案 —— 旧文案会红，确保「改名」这件事被契约记住。 */
  assert.match(ENHANCE_SRC, /\['mergepick',\s*'🔗 地块成组'\]/, '面板应只有宿主页传了 onMergeMode 时才加这一行');
});

test('③-f 地图页「成组」口径（v189）：不出现「拼接为大地块」这类会误导的实现', () => {
  /* 用户纠正后，地图页所有面向用户的「拼接」措辞都应改为「成组」；
     唯一允许保留「拼接」字样的地方是**引述用户原话的注释**（含「不是拼接」等否定语境）。 */
  const uiHits = [];
  MAP_SRC.split('\n').forEach((ln, i) => {
    if (!/拼接/.test(ln)) return;
    // 注释里引述用户原话（含否定/纠正语境）不算违规
    if (/不是拼接|拼接是|用户原话|旧的?实现|旧行为|v189|v187/.test(ln)) return;
    // 纯注释行里解释历史也不违规
    if (/^\s*(\/\*|\*|\/\/)/.test(ln)) return;
    uiHits.push((i + 1) + ': ' + ln.trim().slice(0, 90));
  });
  assert.strictEqual(uiHits.length, 0,
    '地图页面向用户的文案不应再出现「拼接」措辞（v189 已统一改为「成组」）；仍存在：\n  ' + uiHits.join('\n  '));
  // 关键 UI 串必须已改
  assert.match(MAP_SRC, /🔗 地块成组/, '按钮文案应为「🔗 地块成组」');
  assert.match(MAP_SRC, /✓ 完成成组/, '退出按钮文案应为「✓ 完成成组」');
  assert.match(MAP_SRC, /成组（保留各自轮廓）/, '底部操作条按钮应为「成组（保留各自轮廓）」');
  assert.ok(!/拼接为大地块/.test(MAP_SRC), "不应再出现「拼接为大地块」（旧措辞，会误导为「并成一块」)");
});

test('③-g 传递口径（v189）：回传二级页的是**各子地块本身**，不是合并后的大块', () => {
  /* 用户原话：「在在线地图中成组之后，不是拼接，我一说拼接你就把小地块之间的空地给我取消了，
     传递到二级管路页面，」⇒ 回传 payload 必须逐子地块带各自的环（保留块间空隙）。 */
  const k = MAP_SRC.indexOf("localStorage.setItem('runyeMeasuredArea'");
  assert.ok(k > 0, '应能找到回传写入点');
  const seg = MAP_SRC.slice(Math.max(0, k - 2600), k);
  assert.match(seg, /payload\.subPlots\s*=/, '成组地块回传时应带 subPlots（各子地块本身）');
  assert.match(seg, /payload\.grouped\s*=\s*true/, 'v189 应显式打 grouped:true 标记');
  /* 权威几何优先：先取 polyLatLngSet，缺失才退回 subPlots[].polyLatLng */
  assert.match(seg, /polyLatLngSet/, '应优先用权威几何 polyLatLngSet（各成员环集合）');
  assert.match(seg, /ringSet\s*&&\s*ringSet\[i\]/, '应逐环取 polyLatLngSet[i]，保证「各子地块本身」被传出');

  /* 二级页消费段：必须逐子地块换算成本地米坐标，而不是只留一个外轮廓 */
  const k2 = INDEX_SRC.indexOf('window.__runyeSubPlots');
  assert.ok(k2 > 0, '二级页应把子地块存到 window.__runyeSubPlots');
  const seg2 = INDEX_SRC.slice(Math.max(0, k2 - 900), k2 + 900);
  assert.match(seg2, /Array\.isArray\(d\.subPlots\)/, '应校验 d.subPlots 是数组');
  assert.match(seg2, /polyLatLng:\s*ll\.map/, '应保留每个子地块自己的 polyLatLng');
  assert.match(seg2, /poly:\s*ll\.map/, '应换算每个子地块自己的本地米坐标 poly');
});
