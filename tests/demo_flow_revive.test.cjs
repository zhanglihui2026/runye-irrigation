'use strict';
/* [v882-demo-flow-revive] 轮灌演示水流动画复活 · 静态锁。
 *
 * 病史：v873「分区图只拥有段总管」起 frontPipe 生成时恒 null ⇒ 简图不再画
 * path[data-tlpipe="front"]，tlDemoRenderFlow 第一步找不到总管 path 就静默 return
 * ⇒ 水流动画整链消失（chips 高亮还在、水流线没了），用户实测「彻底失效」。
 * 修复：干线兜底改走 path[data-tlpipe="segTrunk"]，入口端 = tlSegAnchorIdx()
 * （手绘总管驳接端，0=起点 1=终点）。地图端演示同步补完整闭环：
 * 手绘总管 + 段总管在演示时叠青色流动虚线（实线骨架之上）。
 * 这些都是回归高发的选择器/分支结构，用源码静态锁钉住。 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const inline09 = fs.readFileSync(path.join(ROOT, 'mod', 'inline-09.js'), 'utf8');
const demo = fs.readFileSync(path.join(ROOT, 'mod', 'map-flow-demo.js'), 'utf8');

function region(src, from, to) {
  const i = src.indexOf(from);
  assert.notStrictEqual(i, -1, 'anchor not found: ' + from);
  const j = src.indexOf(to, i);
  assert.notStrictEqual(j, -1, 'end anchor not found: ' + to);
  return src.slice(i, j);
}

/* 锁 1：简图水流干线兜底 —— tlDemoRenderFlow 里 front 查询失败后必须先试 segTrunk，
   再判空返回（v882 前是「找不到 front 直接 return」⇒ 整链失效）。 */
{
  const flow = region(inline09, 'function tlDemoRenderFlow', 'window.tlDemoRenderFlow');
  const frontQ = flow.indexOf('path[data-tlpipe="front"][data-tlpipe-ref]');
  const segQ = flow.indexOf('path[data-tlpipe="segTrunk"]');
  const emptyRet = flow.indexOf('if (!fEl) return;');
  assert.ok(frontQ !== -1, 'front path 查询必须存在');
  assert.ok(segQ !== -1, 'segTrunk 兜底查询必须存在');
  assert.ok(emptyRet !== -1, '判空返回必须存在');
  assert.ok(frontQ < segQ && segQ < emptyRet,
    '顺序必须是 front 查询 → segTrunk 兜底 → 判空返回（兜底写在 return 之前）');
}

/* 锁 2：入口端方向 —— 段总管时代水流入口 = tlSegAnchorIdx() 驳接端，为 1 时反序。 */
{
  const flow = region(inline09, 'function tlDemoRenderFlow', 'window.tlDemoRenderFlow');
  assert.ok(/tlSegAnchorIdx\(\)\s*===\s*1/.test(flow), '必须用 tlSegAnchorIdx()===1 判定驳接端');
  assert.ok(/segEntryRev\)\s*fPts\s*=\s*fPts\.slice\(\)\.reverse\(\)/.test(flow) ||
           /if\s*\(segEntryRev\)\s*fPts/.test(flow), '驳接端为终点时必须反序 fPts');
}

/* 锁 3：地图演示完整闭环 —— 手绘总管与段总管都要有「实线骨架 + 青色流动叠层」两笔。 */
{
  const render = region(demo, 'function render(g)', 'function stop(');
  assert.ok(render.includes("poly(line, '#111827', 5, false)"), '每条手绘总管实线骨架必须保留');
  assert.ok(render.includes("poly(line, '#38bdf8', 2.4, true)"), '每条手绘总管必须叠青色流动层');
  assert.ok(render.includes('(d.trunkLinesLL ||'), '多条总管必须逐线渲染，不能拼出虚构线段');
  assert.ok(render.includes("poly(d.segLL, '#111827', 4, false)"), '段总管实线骨架必须保留');
  assert.ok(render.includes("poly(d.segLL, '#38bdf8', 2.2, true)"), '段总管必须叠青色流动层');
}

/* 锁 4：连通校验门槛不放松 —— 闭合系统 = 手绘总管接上段总管/主管，未连仍报错不播放。 */
{
  assert.ok(demo.includes("code === 'no-trunk'"), '无手绘总管的报错提示必须保留');
  assert.ok(demo.includes("'connected' : 'disconnected'"), '未连通判定（disconnected）必须保留');
  assert.ok(demo.includes('没有连接'), '未连通的报错提示文案必须保留');
  assert.ok(demo.includes('TOL_M'), '容差口径必须保留');
}
/* 锁 5：[v884] dock 搬 #tlPlanBar 不得按工具模式跳过 —— 绘图轨只在绘图区块显示
   （ry-cad-vp 门控不含 onlineMapSection），工具模式切地图若不搬 = 联合灌溉 chips
   全消失（用户实测）。dockDockIn 里不允许再出现工具模式判定拦截 pb。 */
{
  const dockIn = region(demo, 'function dockDockIn(', 'function dockDockBack(');
  assert.ok(dockIn.includes("getElementById('tlPlanBar')"), 'dock 必须搬 #tlPlanBar');
  assert.ok(!/tool\s*&&\s*pb|!tool\s*&&\s*pb|contains\('ry-tool'\)/.test(dockIn),
    'dockDockIn 不得再按工具模式跳过 #tlPlanBar（v884 废除 v864 的工具模式豁免）');
}
console.log('demo_flow_revive: 5 locks OK');
