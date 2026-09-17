/* =====================================================================
 * tl_workspace.test.cjs — 三级设计工作区模块纯逻辑回归（Node，无 DOM）
 * 覆盖：几何工具 / 吸附点收集与挑选 / 渲染幂等与红线（不改数据）/
 *       手工层（共享数据层 RyTlEditPipes：undo/clear/几何签名清空）/
 *       模式切换 / 视口数学。
 * 2026-09-15 阶段1：手工管线迁入共享数据层 tl-edit-pipes.js（先加载）；
 *       清空契约由「引用变更」改为「几何签名变更」（同几何重生成保留）。
 * ===================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');

/* —— 在沙箱里加载模块（无 window → 走 globalThis 分支）—— */
const sandbox = { globalThis: {}, console };
sandbox.globalThis.globalThis = sandbox.globalThis;
vm.createContext(sandbox);
const srcEP = require('fs').readFileSync(path.join(__dirname, '..', 'tl-workspace', 'tl-edit-pipes.js'), 'utf8');
vm.runInContext(srcEP, sandbox, { filename: 'tl-edit-pipes.js' });
const src = require('fs').readFileSync(path.join(__dirname, '..', 'tl-workspace', 'tl-workspace.js'), 'utf8');
vm.runInContext(src, sandbox, { filename: 'tl-workspace.js' });
const W = sandbox.globalThis.RyTlWs;
const EP = sandbox.globalThis.RyTlEditPipes;
if (!W) { console.error('FATAL: RyTlWs 未导出'); process.exit(1); }
if (!EP) { console.error('FATAL: RyTlEditPipes 未导出'); process.exit(1); }

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

/* 2b 阶段2c：图面配件（A-F##）加入吸附点集（独立沙箱：AE 真模块 + ws） */
{
  const fs2 = require('fs');
  const sb = { globalThis: {}, console };
  sb.globalThis.globalThis = sb.globalThis;
  vm.createContext(sb);
  vm.runInContext(fs2.readFileSync(path.join(__dirname, '..', 'tl-workspace', 'tl-auto-edits.js'), 'utf8'), sb, { filename: 'tl-auto-edits.js' });
  vm.runInContext(fs2.readFileSync(path.join(__dirname, '..', 'tl-workspace', 'tl-edit-pipes.js'), 'utf8'), sb, { filename: 'tl-edit-pipes.js' });
  vm.runInContext(fs2.readFileSync(path.join(__dirname, '..', 'tl-workspace', 'tl-workspace.js'), 'utf8'), sb, { filename: 'tl-workspace.js' });
  const W2 = sb.globalThis.RyTlWs, AE2 = sb.globalThis.RyTlAutoEdits;
  ok(!!W2 && !!AE2, '独立沙箱：AE 真模块 + ws 加载');
  const d = mkData();
  AE2.syncGeometry(d); AE2.discardSaved();
  const f = AE2.addFitting('tee', 'front', 48, d, 'test');   // front (-2,2)→(98,2)：atM=48 → (46,2)
  const has = (pts, x, y) => pts.some(p => Math.abs(p.x - x) < 0.05 && Math.abs(p.y - y) < 0.05);
  ok(!!f && has(W2._geo.collectSnapPts(d), 46, 2), '配件点入列吸附点集（front@48 → 46,2）');
  AE2.moveFitting(f.id, 8, d, 'test');                        // 拖到 atM=8 → (6,2)
  ok(has(W2._geo.collectSnapPts(d), 6, 2), '配件拖动后吸附点跟随（6,2）');
  AE2.reset(); AE2.discardSaved();
}

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

/* 5 手工层（共享数据层）：注入 → undo / clear / 几何签名变更清空
 * 2026-09-15 阶段1 契约改写：旧「数据引用变更 → 清空」升级为
 * 「几何签名变更 → 清空；同几何（同引用或重生成内容一致）→ 保留」。 */
{
  const d = mkData(), d2 = mkData();           // d2 = 同内容新引用
  const d3 = mkData(); d3.poly.push({ x: 100, y: 0 });  // d3 = 几何变化
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
  /* 同引用重复渲染 → 手工层保留 */
  W.pipes().push({ id: 'M-P01', kind: 'main', pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }], len: 10 });
  W.render(ctn, d);
  eq(W.pipes().length, 1, '同引用重渲染 → 手工层保留');
  /* 同几何不同引用（重生成内容一致）→ 保留（2026-09-15 新契约） */
  W.render(ctn, d2);
  eq(W.pipes().length, 1, '同几何不同引用 → 手工层保留');
  /* 几何签名变化（重新生成、内容不同）→ 自动清空 */
  W.render(ctn, d3);
  eq(W.pipes().length, 0, '几何签名变更 → 手工层自动清空');
  /* 汇总：totals 按类型计数/求和（经共享层 add） */
  EP.add('main', [{ x: 0, y: 0 }, { x: 10, y: 0 }], 'ws');
  EP.add('branch', [{ x: 0, y: 0 }, { x: 3, y: 0 }], 'ws');
  const tt = W.totals();
  eq(tt.main.n, 1, 'totals 主管条数'); near(tt.main.len, 10, 1e-9, 'totals 主管长度');
  eq(tt.branch.n, 1, 'totals 支管条数'); near(tt.branch.len, 3, 1e-9, 'totals 支管长度');
  eq(tt.all.n, 2, 'totals 合计条数');
  EP.removeLast('ws'); EP.removeLast('ws');
  eq(W.pipes().length, 0, 'removeLast 清场');
  /* 拾取/选中/改长（2026-09-15 阶段1 新能力） */
  const mp = EP.add('main', [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }], 'ws');
  W.select(mp.id);
  const si = W.getSelected();
  ok(si && si.id === mp.id && si.kindLabel === '主管', '选中信息（主管）');
  ok(W.setSelLength(20) === true, '改长 20m 成功');
  near(W.getSelected().len, 20, 1e-9, '改长后 len=20');
  near(mp.pts[2].x, 10, 1e-9, '改长末段 x 不变（沿原方向）'); near(mp.pts[2].y, 10, 1e-9, '改长末段 y 拉伸到 10（末段 0→10）');
  ok(W.setSelLength(3) === false, '目标总长 < 前段和 → 拒绝');
  ok(W.deleteSelected() === true, '删除选中');
  eq(W.getSelected(), null, '删除后选中清空');
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
  ok((svg.match(/<rect /g) || []).length >= 2, '分区底色 ≥2 格');
  ok(svg.indexOf('stroke-width="2" stroke-dasharray="5,5"') > 0, '分区线已加粗（width=2）');
  ok(svg.indexOf('stroke="#f97316"') > 0, '总管（橙色）路径在位');
  /* 2026-09-16 契约更新：分区底色由「标准浅绿/非标琥珀」改为「联合灌溉分组色带」
     （组号 g=floor(zi/N)，同组同色 .30 透明度）+ 组边界深线；非标改为琥珀描边 overlay。
     反向断言：#e6f2ea / rgba(245,158,11,.18) 不得再作为分区底色出现。 */
  ok(svg.indexOf('rgba(239,68,68,.30)') > 0 && svg.indexOf('data-g="0"') > 0, '标准分区联合灌溉组底色在位（G1 同色带）');
  ok(svg.indexOf('#e6f2ea') < 0, '旧·标准浅绿底色已退出（反向）');
  ok(svg.indexOf('#67e8f9') < 0 && svg.indexOf('3,3" opacity="0.85"') < 0, '滴灌带已不再绘制');
  /* 2026-09-16 新增：联合灌溉分组（调色板 API / 组边界深线 / 底部读数 / 分组正确性） */
  ok(typeof W.groupFillCss === 'function' && W.groupFillCss(0) === 'rgba(239,68,68,.30)' && W.groupFillCss(1) === 'rgba(245,158,11,.30)', '调色板 API groupFillCss（G1/G2 色值）');
  {
    const d4 = mkData();
    d4.zones = { cols: 4, rows: 1, xPos: [0, 25, 50, 75, 100], yPos: [0, 50], xPlan: [25, 25, 25, 25], yPlan: [50], xSrc: [25, 25, 25, 25], ySrc: [50] };
    d4.combinedN = 2;                                // 4 区 / N=2 → 2 组
    const ctn4 = { innerHTML: '' };
    W.render(ctn4, d4);
    const s4 = ctn4.innerHTML;
    ok((s4.match(/data-g="0"/g) || []).length === 2 && (s4.match(/data-g="1"/g) || []).length === 2, '4区/N=2 → 前2区=G1、后2区=G2');
    ok(s4.indexOf('stroke-width="3.4" opacity="0.78"') > 0, '联合灌溉组边界深线在位');
    ok(s4.indexOf('联合灌溉 2区') > 0 && s4.indexOf('分 2 组') > 0, '底部读数：联合灌溉 N区 · 分 M 组');
  }
  {
    const d2 = mkData();
    d2.partialFlags = [false, true];               // 第 2 区为非标
    d2.zoneActMu = [7.5, 2.3];
    const ctn2 = { innerHTML: '' };
    W.render(ctn2, d2);
    const s2 = ctn2.innerHTML;
    ok(s2.indexOf('stroke="#d97706"') > 0, '非标分区琥珀描边在位（底色随联合灌溉组）');
    ok(s2.indexOf('rgba(245,158,11,.18)') < 0, '旧·非标琥珀底色已退出（反向）');
    ok(s2.indexOf('1区') > 0 && s2.indexOf('50×50m') > 0 && s2.indexOf('亩') > 0, '标准分区标注：编号+尺寸+亩数');
    ok(s2.indexOf('2区') > 0 && s2.indexOf('实际 2.3 亩') > 0, '非标分区标注：编号+实际亩数');
    ok(s2.indexOf('#b45309') > 0, '非标分区标注琥珀字色');
  }
  {
    const d3 = mkData();                            // 旧数据（无 partialFlags/zoneActMu）→ 全按标准区渲染不报错
    const ctn3 = { innerHTML: '' };
    W.render(ctn3, d3);
    ok(ctn3.innerHTML.indexOf('1区') > 0, '旧数据兼容：缺 flags 时仍出标准标注');
  }
  /* 总管在 viewBox 内：端点 x=-2 → (−2+ox)×K ≥ 0 */
  ok(vs.ox >= 2, '总管外沿在可视范围内（ox ≥ 外扩量）');
}

console.log('== 结论：PASS=' + pass + ' FAIL=' + fail + ' ==');
process.exit(fail ? 1 : 0);
