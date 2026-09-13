/* =====================================================================
 * tl_workspace.test.cjs — 三级设计工作区模块纯逻辑回归（Node，无 DOM）
 * 覆盖：几何工具 / 吸附点收集与挑选 / 渲染幂等与红线（不改数据）/
 *       手工层（undo/clear/引用变更清空）/ 模式切换 / 视口数学。
 * ===================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');

/* —— 在沙箱里加载模块（无 window → 走 globalThis 分支）—— */
const sandbox = { globalThis: {}, console };
sandbox.globalThis.globalThis = sandbox.globalThis;
vm.createContext(sandbox);
const src = require('fs').readFileSync(path.join(__dirname, '..', 'tl-workspace', 'tl-workspace.js'), 'utf8');
vm.runInContext(src, sandbox, { filename: 'tl-workspace.js' });
const W = sandbox.globalThis.RyTlWs;
if (!W) { console.error('FATAL: RyTlWs 未导出'); process.exit(1); }

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name + (extra !== undefined ? '（' + extra + '）' : '')); }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '（实际 ' + extra + '）' : '')); }
}
function eq(a, b, name) { ok(a === b, name, String(a) + ' vs ' + String(b)); }
function near(a, b, tol, name) { ok(Math.abs(a - b) <= (tol || 1e-9), name, String(a)); }

/* —— 测试数据（仿 tlDiagramData，米制）—— */
function mkData() {
  return {
    version: 1, world: 'meter',
    poly: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }],
    zones: { cols: 2, rows: 1, xPos: [0, 50, 100], yPos: [0, 50], xPlan: [50, 50], yPlan: [50], xSrc: [50, 50], ySrc: [50] },
    mainPipes: [[{ x: 5, y: 25 }, { x: 95, y: 25 }]],
    branchPipes: [[{ x: 10, y: 10 }, { x: 10, y: 40 }], [{ x: 60, y: 10 }, { x: 60, y: 40 }]],
    valves: [{ x: 10, y: 25 }, { x: 60, y: 25 }],
    dripTapes: [[{ x: 10, y: 12 }, { x: 10, y: 38 }]],
    frontPipe: [{ x: -2, y: 2 }, { x: 98, y: 2 }],
    sourcePos: { x: -2, y: 2 }
  };
}

console.log('== tl-workspace 纯逻辑回归 ==');

/* 1 几何工具 */
{
  const g = W._geo;
  const b = g.boundsOf([{ x: 0, y: 0 }, { x: 100, y: 50 }]);
  eq(b.w, 100, 'boundsOf 宽'); eq(b.h, 50, 'boundsOf 高');
  eq(g.boundsOf(null), null, 'boundsOf 空 → null');
  near(g.polylineLen([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 6 }]), 7, 1e-9, 'polylineLen 3-4-5 + 2');
  const c = g.closestOnSeg({ x: 5, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 });
  near(c.x, 5, 1e-9, 'closestOnSeg 垂足 x'); near(c.y, 0, 1e-9, 'closestOnSeg 垂足 y');
  const e = g.closestOnSeg({ x: -5, y: 1 }, { x: 0, y: 0 }, { x: 10, y: 0 });
  near(e.x, 0, 1e-9, 'closestOnSeg 端点钳制');
}

/* 2 吸附点收集：端点 + 阀门 + 水源 + 地块顶点，且去重 */
{
  const d = mkData();
  const pts = W._geo.collectSnapPts(d);
  ok(pts.length > 0, 'collectSnapPts 非空', pts.length);
  const has = (x, y) => pts.some(p => Math.abs(p.x - x) < 0.05 && Math.abs(p.y - y) < 0.05);
  ok(has(5, 25) && has(95, 25), '主管两端入列');
  ok(has(10, 25), '阀门入列（与支管端不重复）');
  ok(has(-2, 2), '水源入列');
  ok(has(100, 50), '地块顶点入列');
  /* 去重：水源(-2,2) 与总管端点(-2,2) 合并 */
  const dup = pts.filter(p => Math.abs(p.x + 2) < 0.05 && Math.abs(p.y - 2) < 0.05);
  eq(dup.length, 1, '同点去重（水源=总管端点）');
}

/* 3 pickSnap：容差内取最近、容差外原样返回 */
{
  const g = W._geo;
  const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
  const hit = g.pickSnap({ x: 0.8, y: 0.1 }, pts, 1);
  near(hit.x, 0, 1e-9, 'pickSnap 命中近点');
  const miss = g.pickSnap({ x: 5, y: 5 }, pts, 1);
  near(miss.x, 5, 1e-9, 'pickSnap 未命中返回原点'); near(miss.y, 5, 1e-9, 'pickSnap 未命中 y');
}

/* 4 渲染：幂等 + 红线（不改数据）+ 视口状态 */
{
  const d = mkData();
  const snap0 = JSON.stringify(d);
  const ctn = { innerHTML: '' };
  ok(W.render(ctn, d) === true, 'render 有效数据 → true');
  const svg1 = ctn.innerHTML;
  ok(svg1.indexOf('<svg') === 0 || svg1.indexOf('<div class="tl-ws-canvas"') === 0, '输出为容器 SVG 片段');
  ok(svg1.indexOf('tlWsManual') > 0, '含手工层分组');
  ok(svg1.indexOf('tlWsPreview') > 0, '含预览分组');
  W.render(ctn, d);
  eq(ctn.innerHTML, svg1, '同输入渲染逐字节一致（幂等）');
  eq(JSON.stringify(d), snap0, '红线：渲染不修改平面数据');
  const vs = W.getViewState();
  ok(vs && vs.k === 2.5 && vs.snapPts.length > 0, 'getViewState 就绪（k=2.5）', vs && vs.snapPts.length);
  const emptyCtn = { innerHTML: '' };
  eq(W.render(emptyCtn, null), false, 'render 无效数据 → false');
  ok(emptyCtn.innerHTML.indexOf('请先生成') > 0, '无效数据显示提示');
}

/* 5 手工层：注入 → undo / clear / 引用变更清空 */
{
  const d = mkData(), d2 = mkData();
  const ctn = { innerHTML: '' };
  W.render(ctn, d);
  W.pipes().push({ id: 'M-P01', kind: 'main', pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }], len: 10 });
  eq(W.pipes().length, 1, '手工管线注入 1 条');
  ok(W.undo() === true, 'undo 成功');
  eq(W.pipes().length, 0, 'undo 后清空');
  eq(W.undo(), false, '空层 undo 返回 false');
  W.pipes().push({ id: 'M-P01', kind: 'branch', pts: [{ x: 0, y: 0 }, { x: 5, y: 0 }], len: 5 });
  W.pipes().push({ id: 'M-P02', kind: 'main', pts: [{ x: 0, y: 0 }, { x: 6, y: 0 }], len: 6 });
  ok(W.clearManual() === true, 'clearManual 成功');
  eq(W.pipes().length, 0, 'clearManual 后清空');
  eq(W.clearManual(), false, '空层 clearManual 返回 false');
  /* 引用变更 → 自动清空（重生成平面图） */
  W.pipes().push({ id: 'M-P01', kind: 'main', pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }], len: 10 });
  W.render(ctn, d2);                    // 新引用（同内容）
  eq(W.pipes().length, 0, '数据引用变更 → 手工层自动清空');
  /* 同引用重复渲染 → 手工层保留 */
  W.pipes().push({ id: 'M-P01', kind: 'main', pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }], len: 10 });
  W.render(ctn, d2);
  eq(W.pipes().length, 1, '同引用重渲染 → 手工层保留');
}

/* 6 模式切换 */
{
  eq(W.setMode('main'), 'main', '进入主管插入模式');
  eq(W.setMode('main'), null, '再点同款 → 退出');
  eq(W.setMode('branch'), 'branch', '进入支管插入模式');
  eq(W.setMode('nonsense'), null, '非法模式 → 退出');
  eq(W.mode(), null, 'mode() 读取一致');
}

/* 7 视口数学（zoomAt 通过 getViewState 间接验证）——导出仅按钮级，此处验证 renderSVG 比例 */
{
  const d = mkData();
  const ctn = { innerHTML: '' };
  W.render(ctn, d);
  const vs = W.getViewState();
  /* 2026-09-13 契约更新：viewBox 需包住总管（frontPipe x=-2 在地块外）——
     宽 = (100+2 外扩 + 2×6 留白)×2.5，高不变；ox 相应右移 2m */
  near(vs.w, (100 + 2 + 12) * 2.5, 0.01, 'viewBox 宽含总管外扩（w+2pad+外扩）×K');
  near(vs.h, (50 + 12) * 2.5, 0.01, 'viewBox 高 = (h+2pad)×K');
  near(vs.ox, 6 + 2, 1e-9, 'ox = 留白 + 总管外扩');
  /* 分区可视化契约：分区填充 + 加粗分区线 + 总管可见 */
  const svg = ctn.innerHTML;
  ok(svg.indexOf('tlWsPlotClip') > 0, '含地块轮廓 clipPath（分区填充裁剪到轮廓内）');
  ok((svg.match(/<rect /g) || []).length >= 2, '分区棋盘底色 ≥2 格');
  ok(svg.indexOf('stroke-width="2" stroke-dasharray="5,5"') > 0, '分区线已加粗（width=2）');
  ok(svg.indexOf('stroke="#f97316"') > 0, '总管（橙色）路径在位');
  /* 总管在 viewBox 内：端点 x=-2 → (−2+ox)×K ≥ 0 */
  ok(vs.ox >= 2, '总管外沿在可视范围内（ox ≥ 外扩量）');
}

console.log('== 结论：PASS=' + pass + ' FAIL=' + fail + ' ==');
process.exit(fail ? 1 : 0);
