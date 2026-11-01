'use strict';
/* tests/measured_area_state.test.cjs —— measuredArea 状态一致性静态锁（2026-11-01 审计）
 *
 * 审计结论（先测后改，测试证明的一致性才许锁）：
 *   window.measuredArea 全程 m² 口径。写入方共 6 处主链 + 3 处只动边界的伴生场景，
 *   「面积 ↔ 边界 ↔ currentPlotId」三元组在每个写入点都同源同步落定：
 *     W1 inline-11:2    初始化 0（新页面，其余全局未定义）
 *     W2 inline-10      图片测量闭合：realUnit==='m' 才写 shoelace m²，否则 0；
 *                       伴随 measuredPolygon（米坐标）/source='area'/currentPlotId=null/清 geoBase
 *     W3 inline-13      地块库「设为当前」：p.sqm + p.poly + p.source + currentPlotId=id 同一记录整体落定
 *     W4 inline-16      地图回传：入口先校验（环≥3 且 isFinite(sqm)>0，否则抛错不动全局），
 *                       通过后 measuredArea=d.sqm / source='map' / currentPlotId=null，
 *                       measuredPolygon 三分支（XY 米坐标 / 经纬度投影 / 无效清空）必写其一
 *     W5 inline-16      「清除回传」按钮：area=0 与 polygon=[] 成对清空
 *     W6 inline-12      runyeLoadProject 存档恢复：resolveProjectPlotBinding 归属校验 +
 *                       锚点写入 + currentPlotId=plotBinding.id 全部先于 measuredArea 写入；
 *                       存档 JSON 无效 / 归属不可用 / 锚点写失败均早退不动全局
 *                       （行为已由 tests/project_restore_binding.test.cjs 锁定）
 *   只动边界不动面积的三处都是「同工程同地块」语义（面积是标量，几何翻转/兜底/成组
 *   frame 替换不改变其归属与量值口径）：
 *     W7 inline-13 v219 方向翻转（y 取反，鞋带面积绝对值不变）
 *     W8 inline-09 openThreeLevelView 兜底（measuredPolygon 缺失时从同工程 ppState 恢复）
 *     W9 inline-29 成组（frame=整块边界 ↔ measuredArea=整块面积，天然配对；inline-29
 *        全文件零 measuredArea 写入 = 成组路径不改面积口径）
 * 已知不修项（证据见 AGENT_HANDOFF §26.92）：W6 存档恢复不回写 measuredPolygonSource，
 *   恢复后该全局可能保留上一状态值。全站 grep 证明零计算分支消费（仅 inline-13「存为地块」
 *   的 provenance 标签、ry-diag 展示、legacy-adapter sourceRef——且存档快照从不携带该字段，
 *   恒走 'legacy-project' 兜底）；修复需动 canonical 投影层，对旧存档任何回填值都是猜测，
 *   按任务约束「无法证明安全就不改」。
 * 本测试锁：各写入点的伴随关系 + 全站写入点集合（防新增绕过审计的独立写入）+ 读方 m² 口径。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, ...p.split('/')), 'utf8');
const stripJs = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const inline16 = stripJs(read('mod/inline-16.js'));
const inline10 = stripJs(read('mod/inline-10.js'));
const inline13 = stripJs(read('mod/inline-13.js'));
const inline12 = stripJs(read('mod/inline-12.js'));
const inline29 = stripJs(read('mod/inline-29.js'));
const inline09 = stripJs(read('mod/inline-09.js'));
const inline11 = stripJs(read('mod/inline-11.js'));

test('① inline-16 地图回传：入口校验先于全局写入，面积/来源/地块解绑同链落定', () => {
  /* 校验（sqm<=0 或环<3 抛错）必须出现在 measuredArea 写入之前——
     无效载荷在碰任何全局前就失败，不留半套状态 */
  const v = inline16.indexOf('sqm<=0');
  const w = inline16.indexOf('window.measuredArea = d.sqm');
  assert.ok(v >= 0 && w >= 0, '校验与写入都要存在');
  assert.ok(v < w, '载荷校验必须先于 measuredArea 写入');

  /* 写入链：area → source='map' → currentPlotId=null，三者同链（同步，无早退间隔） */
  const chain = inline16.slice(w, w + 200);
  assert.ok(chain.includes("window.measuredPolygonSource='map'"), '回传要标记来源 map');
  assert.ok(chain.includes('window.currentPlotId=null'), '回传要解绑旧地块身份');
});

test('② inline-16 地图回传：measuredPolygon 三分支必写其一（防面积新、边界旧）', () => {
  /* if(isXY) / else if(经纬度投影) / else 三条路都要落 measuredPolygon */
  const start = inline16.indexOf('var isXY =');
  const end = inline16.indexOf('window.__runyeImportedTrunk = null;');
  const blk = inline16.slice(start, end);
  const hits = blk.match(/measuredPolygon\s*=(?!=)/g) || [];
  assert.equal(hits.length, 3, 'isXY/投影/清空三分支各写一次 measuredPolygon，实际：' + hits.length);
  assert.ok(blk.includes('window.measuredPolygon = []'), '无效边界分支要显式清空');
});

test('③ inline-16 清除回传：area=0 与 polygon=[] 成对清空', () => {
  const i = inline16.indexOf('window.measuredArea = 0;');
  assert.ok(i >= 0, '清除回传入口要存在');
  const blk = inline16.slice(i, i + 200);
  assert.ok(blk.includes('window.measuredPolygon = []'), '清面积必须连边界一起清');
  assert.ok(blk.includes('window.__runyeGeoBase=null'), 'geo 基准一并清');
  assert.ok(blk.includes('window.__runyeMapFramePoly = null'), '地图口径顶点一并清');
});

test('④ inline-10 图片测量：米制才写面积，伴随边界/来源/解绑整体落定', () => {
  const i = inline10.indexOf('window.measuredArea = (atState.realUnit');
  assert.ok(i >= 0, '图片测量写入点要存在');
  const blk = inline10.slice(i, i + 400);
  assert.ok(blk.includes("(atState.realUnit==='m') ? shoelaceVal : 0"), '非米制必须写 0（不许写像素面积）');
  assert.ok(blk.includes('window.measuredPolygon = atState.polygon.map'), '伴随边界（米坐标）');
  assert.ok(blk.includes("window.measuredPolygonSource='area'"), '来源标记 area');
  assert.ok(blk.includes('window.currentPlotId=null'), '解绑地块身份');
  assert.ok(blk.includes('window.__runyeGeoBase=null'), '清 geo 基准');
  assert.ok(blk.includes('window.__runyeMapFramePoly = null'), '清地图口径顶点');
});

test('⑤ inline-13 设为当前：同一地块记录的面积/边界/来源/身份整体落定', () => {
  const i = inline13.indexOf('window.measuredArea=p.sqm||0;');
  assert.ok(i >= 0, '设为当前写入点要存在');
  const blk = inline13.slice(i, i + 900);
  assert.ok(blk.includes('window.measuredPolygon=Array.isArray(p.poly)?p.poly:[];'), '边界取同一记录 p');
  assert.ok(blk.includes('window.measuredPolygonSource=p.source'), '来源取同一记录 p');
  assert.ok(blk.includes('window.currentPlotId=id;'), '地块身份取同一 id');
  assert.ok(blk.indexOf('window.currentPlotId=id;') > -1 &&
    blk.indexOf('window.currentPlotId=id;') > blk.indexOf('window.measuredPolygon=Array.isArray(p.poly)'),
    '身份锚点与几何同链落定（同步代码，无 await 间隔）');
});

test('⑥ inline-12 存档恢复：归属校验与身份锚点先于面积/边界写入，失败早退不动全局', () => {
  const iBind = inline12.indexOf('var plotBinding=resolveProjectPlotBinding(data.currentPlotId);');
  const iAnchor = inline12.indexOf('window.currentPlotId=plotBinding.id;');
  const iArea = inline12.indexOf('window.measuredArea=parseFloat(data.measuredArea)||0;');
  assert.ok(iBind >= 0 && iAnchor >= 0 && iArea >= 0, '三步都要存在');
  assert.ok(iBind < iAnchor && iAnchor < iArea, '归属校验 → 身份锚点 → 面积/边界，顺序不许倒');

  /* 归属不可用必须早退在写入之前 */
  const guard = inline12.slice(iBind, iAnchor);
  assert.ok(guard.includes("reason==='unavailable'") && guard.includes('return false'),
    '地块库不可用时恢复早退，不写任何全局');
  /* 恢复伴随边界与 geo 基准（同一存档 data） */
  const blk = inline12.slice(iArea, iArea + 1000);
  assert.ok(blk.includes('window.measuredPolygon=Array.isArray(data.measuredPolygon)?data.measuredPolygon:[];'),
    '边界取同一存档 data');
  assert.ok(blk.includes('window.__runyeGeoBase='), 'geo 基准随存档恢复');
  assert.ok(blk.includes('window.__runyeMapFramePoly ='), '地图口径顶点随存档恢复');
  /* 面积用 parseFloat||0：存档非法值落 0，不落 NaN */
  assert.ok(inline12.includes('parseFloat(data.measuredArea)||0'), '非法面积落 0 不落 NaN');
});

test('⑦ inline-29 成组路径零 measuredArea 写入（整块面积 ↔ 整块 frame 配对）', () => {
  assert.equal((inline29.match(/measuredArea/g) || []).length, 0,
    '成组模块不许改面积：frame 是整块边界，measuredArea 本就是整块面积');
  /* 成组的两处 frame 替换都还在（返回整组页 / 成组存档恢复） */
  assert.equal((inline29.match(/measuredPolygon\s*=(?!=)/g) || []).length, 2,
    '成组只允许 grBackFromTl / grRestoreState 两处边界替换');
});

test('⑧ inline-09/13 只动边界的两处是同工程语义（翻转不变面积、兜底同工程）', () => {
  /* inline-09 唯一写入是 openThreeLevelView 的 ppState 兜底 */
  const i = inline09.indexOf('window.measuredPolygon = ppPts;');
  assert.ok(i >= 0, '兜底写入要存在');
  const fn = inline09.slice(inline09.indexOf('function openThreeLevelView'), i);
  assert.ok(fn.includes('window.measuredPolygon || window.measuredPolygon.length < 3'),
    '只在边界缺失（<3 点）时兜底，不覆盖有效边界');
  assert.ok(fn.includes('ppGetPolyPts'), '兜底来源是同工程 ppState');
  /* inline-13 唯一另一处是 v219 翻转（y 取反，鞋带面积绝对值不变）：
     写入点必须包在 if(_o.flipped) 里 —— 只在几何判据判定需要翻转时生效 */
  const iFlip = inline13.indexOf('window.measuredPolygon = _o.pts;');
  assert.ok(iFlip >= 0, 'v219 翻转写入要存在');
  assert.ok(inline13.slice(iFlip - 120, iFlip).includes('if (_o.flipped)'),
    '翻转写入必须由 _o.flipped 判据守门');
});

test('⑨ 全站写入点集合锁：measuredArea/measuredPolygon 的写入文件与处数不许漂移', () => {
  const modDir = path.join(ROOT, 'mod');
  const files = fs.readdirSync(modDir).filter((f) => /^inline-\d+\.js$/.test(f));
  const areaWriters = {};
  const polyWriters = {};
  for (const f of files) {
    const live = stripJs(fs.readFileSync(path.join(modDir, f), 'utf8'));
    const a = (live.match(/measuredArea\s*=(?!=)/g) || []).length;
    const p = (live.match(/measuredPolygon\s*=(?!=)/g) || []).length;
    if (a) areaWriters[f] = a;
    if (p) polyWriters[f] = p;
  }
  assert.deepEqual(areaWriters, {
    'inline-10.js': 1, 'inline-11.js': 1, 'inline-12.js': 1,
    'inline-13.js': 1, 'inline-16.js': 2
  }, 'measuredArea 写入点集合（新增/删减写入必须过本测试评审）');
  assert.deepEqual(polyWriters, {
    'inline-09.js': 1, 'inline-10.js': 1, 'inline-12.js': 2,
    'inline-13.js': 2, 'inline-16.js': 4, 'inline-29.js': 2
  }, 'measuredPolygon 写入点集合（新增/删减写入必须过本测试评审）');
  /* index.html 内联脚本不得直接写这两个全局 */
  const html = read('index.html');
  assert.equal((html.match(/measuredArea\s*=(?!=)/g) || []).length, 0, 'index.html 不写 measuredArea');
  assert.equal((html.match(/measuredPolygon\s*=(?!=)/g) || []).length, 0, 'index.html 不写 measuredPolygon');
});

test('⑩ 读方 m² 口径锁（亩折算 / 滴灌带米数 / 展示层）', () => {
  assert.ok(inline09.includes('window.measuredArea / 666.67'), '材料清单按 m² 折亩');
  assert.ok(inline09.includes('window.measuredArea?(window.measuredArea/MU_TO_SQM)'), '出图按 m² 折亩');
  const ds = read('core/data-service.js');
  assert.ok(ds.includes("var area = Number(w.measuredArea) || 0;"), 'BOM 读全局 m²');
  assert.ok(ds.includes('area / spacing'), '滴灌带米数 = m² / 行距（m），口径自洽');
  const pe = read('mod/plot-editor.js');
  assert.ok(pe.includes('window.measuredArea?(window.measuredArea/666.67)'), '地块编辑器展示按 m² 折亩');
  /* inline-11 初始化 0 + 读方 ||0 兜底 */
  assert.ok(inline11.trimStart().startsWith('window.measuredArea = 0;'), 'inline-11 顶部初始化 0');
});
