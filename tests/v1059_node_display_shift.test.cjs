'use strict';
/* tests/v1059_node_display_shift.test.cjs —— [v1059] 节点捕捉主管：偏移显示口径统一
 *
 * 用户实测（v1058 偏移假象显示上线后）：「节点要捕捉到主管是行，节点可以在主管上
 * 移动，这个一直要求是这样的，现在这个功能实现不了了。」截图：紫色节点悬在主管
 * 显示线上方空白处。
 * 根因（M13 偏移显示的遗留错位）：主管可见线体是 ppGetPipeDisplayGeometry 偏移
 * 副本（±gap/2，纯渲染），而三级叠加层（RyTlNodes 节点/连线/配件标记/改径套壳/
 * 标注/选中高亮）与二级接驳节点全部基于设计几何（AE.effPts/pointAt、dd.mainPipes）
 * 定位 → 节点整体悬空一个偏移量；拾取（pickAutoPipe/pickAutoFit）与拖拽投影
 * （nodeDrag/fitDrag mousemove）也按设计线算 → 鼠标点在显示线上永远命中不到。
 * 修复（纯显示层口径统一，数据/水力/材料零改动）：
 *   A. tl-workspace.js：dispShift 辅助层——dispShiftMap（从 window.ppGetPipeDisplay-
 *      Geometry 取各管刚体平移向量：显示线首点−设计线首点，缓存 _dispShiftCache，
 *      render() 数据换代置 null）、dispPts/dispPointAt（输出显示位）、dispShiftUndo
 *      （鼠标显示位反算设计位）；渲染消费点（节点 nodePos、连线、配件标记、配件
 *      距离标注、改径套壳、改长管线、选中高亮）与命中/拖拽（pickAutoPipe、
 *      pickAutoFit、pickAnyPipe、nodeDrag/fitDrag mousemove）全部换显示口径。
 *   B. plot-editor.js 二级接驳节点同口径：ppCouplerShiftMap（与 ppRender 的
 *      __ppDisplayGeometry/__tlEffMains 完全同链）+ ppCouplerProjectDisp（格系入参，
 *      先按各主管偏移向量反算再 frameToWorld 投影 dd.mainPipes 设计线求 s——刚体
 *      平移不改弧长，s 口径不变）；2D 画布与 SVG 简图（__ppSvgDisplay）节点渲染
 *      加偏移向量贴显示线；放置点击与拖拽 mousemove 改走 ppCouplerProjectDisp。
 *   C. ppCouplerProject（world 入参原口径）保留：外部/探针兼容。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const ws = fs.readFileSync(path.join(ROOT, 'tl-workspace', 'tl-workspace.js'), 'utf8');
const pe = fs.readFileSync(path.join(ROOT, 'mod', 'plot-editor.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

/* ---------- A. tl-workspace.js dispShift 辅助层 ---------- */

test('[v1059-ws] dispShift 辅助层六函数齐备', () => {
  ['function dispShiftMap()', 'function dispShiftOf(', 'function dispShiftApply(',
   'function dispPts(', 'function dispPointAt(', 'function dispShiftUndo(']
    .forEach(fn => assert.ok(ws.includes(fn), 'tl-workspace.js 必须定义 ' + fn));
});

test('[v1059-ws] dispShiftMap 取自 ppGetPipeDisplayGeometry + RyMainBranchGap，缓存随数据换代失效', () => {
  assert.ok(ws.includes('window.ppGetPipeDisplayGeometry'),
    '偏移向量必须与二级显示层同源（ppGetPipeDisplayGeometry）');
  assert.ok(ws.includes('window.RyMainBranchGap'), 'gap 必须走共享基准 RyMainBranchGap');
  assert.ok(ws.includes('显示线首点') || ws.includes("l[0].x - src[0].x"),
    '向量口径=显示线首点−设计线首点（刚体平移）');
  assert.ok(ws.includes('_dispShiftCache = null'),
    'render() 数据换代时必须置空 _dispShiftCache');
});

test('[v1059-ws] 渲染消费点全部换显示口径', () => {
  assert.ok(ws.includes('function nodePos(') && ws.includes('dispPointAt(nd.pid'),
    '三级节点 nodePos 必须输出显示位（dispPointAt）');
  assert.ok(ws.includes('dispPointAt(f.pid'),
    '配件标记必须输出显示位（dispPointAt）');
  assert.ok(ws.includes('dispPts('), '连线/套壳/高亮/改长管必须走 dispPts');
});

test('[v1059-ws] 命中与拖拽换显示口径（dispShiftUndo 反算）', () => {
  assert.ok(ws.includes('dispShiftUndo(pid, c)'),
    'pickAutoPipe 命中必须把鼠标显示位反算回设计几何再 locate');
  assert.ok(ws.includes('dispShiftUndo(nodeDrag.pid'),
    'nodeDrag mousemove 必须先 dispShiftUndo 再投影');
  assert.ok(ws.includes('dispShiftUndo(fM.pid'),
    'fitDrag mousemove 必须先 dispShiftUndo 再投影');
  assert.ok(ws.includes('dispPointAt(pid, data') || ws.includes('dispPointAt(pid,lastDataRef'),
    'pickAutoFit 必须按显示位取控制点');
});

/* ---------- B. plot-editor.js 二级接驳节点同口径 ---------- */

test('[v1059-pe] ppCouplerShiftMap 与显示链同口径', () => {
  assert.ok(pe.includes('function ppCouplerShiftMap()'), '必须定义 ppCouplerShiftMap');
  const pos = pe.indexOf('function ppCouplerShiftMap()');
  const seg = pe.slice(pos, pos + 1600);
  assert.ok(seg.includes('window.ppGetPipeDisplayGeometry'),
    '偏移向量必须与二级显示层同源');
  assert.ok(seg.includes('AE.effPts(pid,ddw)||l'), '必须走 AE effPts 覆盖链（与 __tlEffMains 同链）');
  assert.ok(pe.includes('function ppCouplerShiftOf('), '必须定义 ppCouplerShiftOf');
});

test('[v1059-pe] ppCouplerProjectDisp：先反算偏移再投影设计线，s 口径不变', () => {
  assert.ok(pe.includes('function ppCouplerProjectDisp('), '必须定义 ppCouplerProjectDisp');
  const pos = pe.indexOf('function ppCouplerProjectDisp(');
  const seg = pe.slice(pos, pos + 1800);
  assert.ok(seg.includes('gridPt.x-sh.x'), '必须按主管偏移向量反算鼠标显示位');
  assert.ok(seg.includes('frameToWorld'), '反算后必须 frameToWorld 进世界米系');
  assert.ok(seg.includes("best.pipeKey='m'+(best.idx+1)"), 'pipeKey 身份口径不变');
});

test('[v1059-pe] 交互链改走显示反算投影', () => {
  assert.ok(pe.includes('var chit=ppCouplerProjectDisp(ppToMeters(pos.x,pos.y));'),
    '放置点击必须走 ppCouplerProjectDisp（显示反算）');
  assert.ok(pe.includes('var cmHit=ppCouplerProjectDisp(ppToMeters(pos.x,pos.y));'),
    '拖拽 mousemove 必须走 ppCouplerProjectDisp（显示反算）');
  assert.ok(pe.includes('function ppCouplerProject(worldPt)'),
    'ppCouplerProject（world 入参原口径）必须保留：外部/探针兼容');
  assert.ok(!pe.includes('var chit=ppCouplerProject(wpt);') && !pe.includes('var cmHit=ppCouplerProject(cmWpt);'),
    '交互链不得再直连设计几何投影（旧错位路径必须退役）');
});

test('[v1059→M14] 二级节点渲染已随 M14 退役：节点唯一源=RyTlNodes', () => {
  /* M14（ee4a91b 起）二级不再绘制/编辑接驳节点——旧 dd.couplerNodes 仅为存档兼容字段；
     可见/可编辑/可传地图的接驳点统一使用工作区 N-xx 节点。本条锁 M14 取代后的契约。 */
  assert.ok(pe.includes('[M14] 旧 dd.couplerNodes 仅为存档兼容字段，不再绘制'),
    'plot-editor 必须保留 M14 退役存照');
  assert.ok(!pe.includes('cShifts=ppCouplerShiftMap()'),
    'M14 后二级 2D 画布不得再渲染接驳节点（偏移标记已随功能退役）');
});

/* ---------- C. 版本纪律 ---------- */

test('[v1059] 版本纪律：主串动态等于 sw VERSION；tl-nodes 独立串', () => {
  const v = sw.match(/^const VERSION = '([^']+)';/m);
  assert.ok(v, 'sw.js 必须有 VERSION');
  const want = v[1].replace(/^v/, '');
  /* [v1069] 口径演进：v1059 时代 14 处（tl-workspace 独立串）；M14 起 tl-workspace.js
     并入主串同抬 ⇒ 15 处；[v1071] 起 runye-map-enhance.js 与 trunk-snap.js 并入同值 ⇒ 17 处。
     tl-nodes.js 另有独立串（随版本演进）。 */
  assert.equal(html.split('?v=' + want).length - 1, 17, '版本串必须恰好 17 处（主串 15 + map-enhance + trunk-snap）');
  assert.ok(/tl-workspace\/tl-nodes\.js\?v=(1069-nodes-resync|10[7-9]\d-|11\d\d-)/.test(html),
    'tl-nodes.js 必须有独立抬版串');
});
