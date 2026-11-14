#!/usr/bin/env node
/* v1080-map-fresh-clear 回归锁：在线地图刷新即清空 + 清空管网按钮。
 *
 * 用户拍板「每次刷新都清空在线地图的地块跟管路内容吧，不然新旧内容叠加到一起，
 * 很乱，经常是手绘总管拾取不到节点，水路不能闭环。或者这样，加个清空按钮吧」——
 * 两个都要：①加载即清空（clearPublishedOverlays silent 跑在地图初始化末尾）；
 * ②工具栏「清空管网」按钮（confirm 后同款清空）。
 *
 * 清空口径：
 *   ① 管网发布快照：逐地块 scoped 网络键（readNetworkLayoutForPlot→writeNetworkLayout(null,id)）
 *      + legacy 键（writeNetworkLayout(null)）；
 *   ② 手绘总管：各地块 plot.trunk=null（地块库 replace 事务，与 commitTrunks 同口径；
 *      成组地块 merged/grouped/mergedInto 跳过——其总管由多地块规划管理）；
 *   ③ 本页显示态：trunkSaved/草稿/activeTrunkId 清零、施工节点标记层、水库标记、
 *      RyMapFlowDemo.stop、RunyeMapEnhance refresh 重渲染。
 * 不动：地块边界、分区划分（plot.partitions）、三级设计数据——由「生成施工图」重新发布。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }
function ok(cond, msg) {
  if (!cond) { console.error('FAIL: ' + msg); process.exitCode = 1; }
  else console.log('ok: ' + msg);
}

const oml = read('mod/online-map.js');
const html = read('index.html');
const sw = read('sw.js');

/* 锁1：清空函数定义 + 管网快照清理 */
ok(oml.includes('function clearPublishedOverlays(opts){'),
  '[v1080] clearPublishedOverlays 定义在位');
ok(oml.includes('store.writeNetworkLayout(null,String(p.id)); clearedNet++;'),
  '[v1080] 逐地块 scoped 管网快照写 null');
ok(oml.includes('if(store.readNetworkLayout&&store.readNetworkLayout()!=null){ store.writeNetworkLayout(null); clearedNet++; }'),
  '[v1080] legacy 管网快照写 null');

/* 锁2：手绘总管清理（地块库事务 + 成组地块跳过） */
ok(oml.includes('var copy=JSON.parse(JSON.stringify(p)); copy.trunk=null; changed=true; clearedTrunk++;'),
  '[v1080] 逐地块 trunk=null 走地块库事务');
ok(oml.includes('if(p.merged||p.grouped||p.mergedInto)return p;'),
  '[v1080] 成组地块跳过（总管由多地块规划管理）');
ok(oml.includes("var wr=lib.replace(nextPlots,snap2.revision);"),
  '[v1080] 用 RyPlotLibraryStore.replace 事务写回（与 commitTrunks 同口径）');

/* 锁3：本页显示态清理 */
ok(oml.includes('if(trunkMode!==\'idle\') setTrunkMode(\'idle\'); else renderTrunkDraft();'),
  '[v1080] 总管层/草稿态清零');
ok(oml.includes('if(couplerMarkerLayer)couplerMarkerLayer.clearLayers();'),
  '[v1080] 施工节点标记层清空');
ok(oml.includes('if(reservoirMarkerLayer)reservoirMarkerLayer.clearLayers();'),
  '[v1080] 水库标记层清空');
ok(oml.includes("if(window.RyMapFlowDemo&&typeof window.RyMapFlowDemo.stop==='function')window.RyMapFlowDemo.stop();"),
  '[v1080] 轮灌动画停止并清层');
ok(oml.includes("if(rymHandle&&typeof rymHandle.refresh==='function')rymHandle.refresh();"),
  '[v1080] 触发 RunyeMapEnhance 重渲染');

/* 锁4：刷新即清空（silent，加载时跑一次） */
ok(oml.includes('var r=clearPublishedOverlays({silent:true});'),
  '[v1080] 地图初始化末尾自动清空（silent）');
ok(oml.includes('本次加载已清空上次的管网图层'),
  '[v1080] 有清空内容时给一次性 tip 指引重新发布');

/* 锁5：清空管网按钮 */
ok(html.includes('<button class="mdt-btn" id="btnClearLayers"'),
  '[v1080] index.html 工具栏新增「清空管网」按钮');
ok(/clearLayersBtn\.onclick=function\(\)\{/.test(oml) && oml.includes('清空在线地图的管网图层与手绘总管？'),
  '[v1080] 按钮接线 + confirm 二次确认');

/* 锁6：版本纪律（动态读 sw VERSION，勿写死版本号） */
const m = /^const VERSION = '(v[\w-]+)';/m.exec(sw);
ok(!!m && /^v\d{3,4}-[\w-]+$/.test(m[1]), '[v1080] sw VERSION 存在且形如 vNNNN- slug：' + (m && m[1]));
const want = m ? m[1].replace(/^v/, '') : '';
ok(html.split('?v=' + want).length - 1 === 17, '[v1080] index.html 版本串 17 处同值');

console.log(process.exitCode ? '\n[v1080] 有断言失败' : '\n[v1080] 全部通过');
