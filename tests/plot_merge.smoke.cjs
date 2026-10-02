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

test('①-b 外层综合轮廓 = 凸包（共享边上的中间点被剔除）', () => {
  const m = M.merge.plots([plotA, plotB], {});
  // 两个矩形共享一条边 → 8 个顶点里有 2 个落在并集内部 → 凸包只剩 4 个外侧角
  assert.strictEqual(m.polyLatLng.length, 4,
    '两块相邻矩形的凸包应为 4 顶点，实得 ' + m.polyLatLng.length);
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

test('①-c 面积：矩形相邻时凸包面积 == 两块之和（±0.5%）', () => {
  const m = M.merge.plots([plotA, plotB], {});
  const sum = Geo.geodesicArea(plotA.polyLatLng) + Geo.geodesicArea(plotB.polyLatLng);
  const d = Math.abs(m.sqm - sum) / sum;
  assert.ok(d < 0.005, `拼接面积 ${m.sqm} 与两块之和 ${sum.toFixed(1)} 相对差 ${(d * 100).toFixed(3)}% 应 <0.5%`);
});

test('①-d L 形三块：凸包面积 ≥ 三块之和（凸包补角是已知偏差，必须显式成立）', () => {
  const p1 = { id: 'p1', polyLatLng: rect(B[0], B[1], 0.0002, 0.0002) };
  const p2 = { id: 'p2', polyLatLng: rect(B[0], B[1] + 0.0002, 0.0002, 0.0002) };
  const p3 = { id: 'p3', polyLatLng: rect(B[0] + 0.0002, B[1] + 0.0002, 0.0002, 0.0002) };
  const m = M.merge.plots([p1, p2, p3], {});
  assert.strictEqual(m.subPlots.length, 3, '三块都应保留');
  const sum = [p1, p2, p3].reduce((a, p) => a + Geo.geodesicArea(p.polyLatLng), 0);
  assert.ok(m.sqm >= sum, `凸包 ${m.sqm} 应 ≥ 三块之和 ${sum.toFixed(1)}`);
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
test('②-a 拼接地块具备普通地块的全部关键字段（下游零改动可用）', () => {
  const m = M.merge.plots([plotA, plotB], {});
  ['id', 'name', 'mu', 'sqm', 'poly', 'polyLatLng', 'center', 'geo', 'crop', 'source', 'crs', 'ts']
    .forEach(k => assert.ok(m[k] !== undefined && m[k] !== null, `拼接地块缺字段 ${k}`));
  assert.strictEqual(m.source, 'merge', 'source 应为 merge');
  assert.strictEqual(m.crs, 'GCJ-02', 'crs 应为 GCJ-02');
  assert.strictEqual(m.geo.proj, 'mercatorLocal', 'geo 基准应为 mercatorLocal');
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

test('③-b 门控口径：关开关只隐藏显示，不参与计算（CSS 门控 + 计算路径不含开关条件）', () => {
  // (1) 门控 CSS 存在，且指向 body 类
  assert.match(INDEX_SRC, /body\.ry-zoneauto-off\s+#ppDiagramContent\s+\.pp-zone-layer\{display:none\}/,
    '必须有 body.ry-zoneauto-off 门控 .pp-zone-layer 的 CSS');
  assert.match(INDEX_SRC, /body\.ry-zoneauto-off\s+#ppDiagramContent\s+\.pp-zone-label\{display:none\}/,
    '必须有门控 .pp-zone-label 的 CSS');
  // (2) SVG 里分区层真的挂了这两个类（否则 CSS 门控打不到东西 → 开关点了没反应）
  assert.match(INDEX_SRC, /class="pp-zone-layer"/, '分区底色层应挂 class="pp-zone-layer"');
  const labelGroups = (INDEX_SRC.match(/class="pp-zone-label"/g) || []).length;
  assert.ok(labelGroups >= 2, `分区标注层 + 分区线层都应挂 class="pp-zone-label"，实得 ${labelGroups} 处`);

  /* (3) 关键反例断言：分区计算路径里不得出现「开关」判断。
   *
   * 上一版写法（截取函数体片段再 /zoneAuto/ 匹配）**被证明是假绿**：
   * 注入 `function ppGetZoneLayout(b,planN){ if(!ppZoneAutoOn()) return null;` 后闸门纹丝不动。
   * 根因是那个片段提取靠 '\n  }\n' 找收尾，而本文件缩进/收尾形态不匹配 ⇒ 截出的内容
   * 根本没覆盖到插入点。⇒ 改为**直接对整份源码做定位断言**，不依赖任何片段切分：
   * 逐个函数名，取其 "function NAME(" 之后到**下一个顶层 function 定义**之间的真实区间，
   * 断言区间内既无 zoneAuto 也无可读取开关状态的调用（ppZoneAutoOn / ppZoneAutoChk）。
   */
  const FUNCS = ['calcPlan', 'ppGetZoneLayout', 'ppGetZoneCuts', 'ppDrawZones', 'ppGenerateDiagram'];
  // 全部顶层函数定义的位置表（按出现顺序），用来精确切出每段区间
  const tops = [];
  const fnRe = /(^|\n)(\s*)function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let mm;
  while ((mm = fnRe.exec(INDEX_SRC))) {
    tops.push({ name: mm[3], at: mm.index, indent: mm[2].length });
  }
  FUNCS.forEach(fn => {
    const idx = tops.findIndex(t => t.name === fn);
    assert.ok(idx >= 0, `找不到顶层函数 ${fn}`);
    const start = tops[idx].at;
    const end = (idx + 1 < tops.length) ? tops[idx + 1].at : INDEX_SRC.length;
    const body = INDEX_SRC.slice(start, end);
    assert.ok(body.length > 100, `${fn} 区间过短（${body.length} 字节），切分可能失效 —— 闸门自身要先可信`);
    assert.ok(!/zoneAuto/i.test(body),
      `${fn} 区间内不得出现 zoneAuto：划分开关只能控显隐，绝不能影响分区计算`);
    assert.ok(!/ppZoneAutoOn\s*\(/.test(body) && !/ppZoneAutoChk/.test(body),
      `${fn} 区间内不得读取开关状态（ppZoneAutoOn / ppZoneAutoChk）—— 一旦读，结果就会随开关变`);
  });
});

test('③-c 关闭时把「手动划分」入口递到手上（切到 adjustCut 模式）', () => {
  assert.match(INDEX_SRC, /function ppSetZoneAuto\(on\)/, '应有 ppSetZoneAuto');
  // 关闭分支里应把 mode 设为 adjustCut（复用已有「调网格」），而不是新造一套手动画线
  const k = INDEX_SRC.indexOf('function ppSetZoneAuto(on)');
  const seg = INDEX_SRC.slice(k, k + 2200);
  assert.match(seg, /ppState\.mode\s*=\s*'adjustCut'/, '关闭开关后应自动切到 adjustCut（手动划分入口）');
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

test('③-e 地图页拼接模式开关与图层面板勾选框双向一致（不留分裂状态）', () => {
  assert.match(MAP_SRC, /function setMergeMode\(on\)/, '地图页应有 setMergeMode');
  assert.match(MAP_SRC, /onMergeMode:\s*onMergeModeChange/, 'attach 时应传 onMergeMode 回调');
  assert.match(MAP_SRC, /rymHandle\.setLayer\('mergepick'/, '地图页应通过面板 setLayer 同步「拼接多选」勾选框');
  assert.match(ENHANCE_SRC, /k === 'mergepick'/, 'enhance 侧应处理 mergepick 开关');
  assert.match(ENHANCE_SRC, /\['mergepick',\s*'🔗 拼接多选'\]/, '面板应只有宿主页传了 onMergeMode 时才加这一行');
});
