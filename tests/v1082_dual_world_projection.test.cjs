#!/usr/bin/env node
/* v1082-dual-world-projection 回归锁：把「画什么」和「存什么」拆开。
 *
 * 背景（用户第三次报同一类故障）：
 *   v1081「在线地图又变成一根主管 看不到支管了……改一个问题之后还有一个问题出现」。
 * 病根是 v1073↔v1081 反复换边，每次只统一一半：
 *   · 全渲染显示副本 ⇒ 总管落点/已存总管是实体坐标，白圈与折点比标记偏 gap/2（26~28px）；
 *   · 全渲染实体     ⇒ 主/支管两条显示副本叠成一根，支管看不见。
 * 定稿口径（本文件锁的就是它，别再翻烧饼）：
 *   · 存储 / 寻路 / 拓扑  = 实体中心线（routeGeometry.mains / branches）；
 *   · 渲染 / 命中        = 显示副本（displayMains / displayBranches，±gap/2 刚性平移）；
 *   · 两界之间只经 online-map 的投影片层（RyMapPointProjector.toShown / toEntity），
 *     且捕捉目标一律只登记实体坐标，投影只在宿主做一次。
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
const snap = read('mod/trunk-snap.js');
const demo = read('mod/map-flow-demo.js');
const enh = read('runye-map-enhance.js');
const sw = read('sw.js');
const html = read('index.html');

/* 锁1：投影片层在位且唯一导出 */
ok(oml.includes('window.RyMapPointProjector = { toShown: toShownPoint, toEntity: toEntityPoint, reachM: PIPE_SHIFT_REACH_M }'),
  '[v1082] 投影层导出 RyMapPointProjector{toShown,toEntity,reachM}');
ok(/function toShownPoint\(p\)/.test(oml), '[v1082] toShownPoint（实体→显示）在位');
ok(/function toEntityPoint\(p\)/.test(oml), '[v1082] toEntityPoint（显示→实体，减位移后取垂足）在位');
ok(oml.includes('PIPE_SHIFT_REACH_M = 30'), '[v1082] 投影作用半径 30m（水源等空中点原样）');
ok(/nearestPipeShift\(lat, lng, false\)/.test(oml) && /nearestPipeShift\(lat, lng, true\)/.test(oml),
  '[v1082] 测距按入参所在世界选口径（实体量实体段 / 显示量位移后的段）');
ok(oml.includes('route.displayMains') && oml.includes('route.displayBranches'),
  '[v1082] 位移取自 mains↔displayMains / branches↔displayBranches 首点差');

/* 锁2：捕捉三件套全部经投影（白圈落在可见位置，命中仍回实体） */
ok(/S\.setProjector\(function\(ll\)\{[\s\S]{0,400}toShownPoint/.test(oml),
  '[v1082] setProjector：目标实体坐标先投到显示位再换算屏幕点');
ok(/S\.setUnprojector\(function\(cp\)\{[\s\S]{0,300}toEntityPoint/.test(oml),
  '[v1082] setUnprojector：屏幕点先换实体再交给引擎');
ok(/setMarkerApi\(\{[\s\S]{0,300}var shown=toShownPoint\(\{lat:hit\.lat,lng:hit\.lng\}\)/.test(oml),
  '[v1082] 捕捉白圈画在显示位（压在可见标记上）');
ok(snap.includes("push(cp.lat, cp.lng, 'main-coupler', (c && c.label) ? c.label : ('主管节点 ' + mcValid));"),
  '[v1082] trunk-snap 7b 只登记实体坐标（投影只在宿主做一次，避免二次平移）');
ok(!snap.includes('var displayLat=c&&isNum(Number(c.displayLat))'),
  '[v1082] trunk-snap 7b 不再自取 displayLat（那是第二次平移）');

/* 锁3：总管渲染走投影（线、草稿、橡皮筋、手柄、节点标记同一口径） */
ok(oml.includes('return rd?toDisplay(toShownPoint({lat:rd.lat,lng:rd.lng})):null;'),
  '[v1082] 已存总管线经 toShownPoint 投影后上屏');
ok(oml.includes("trunkPoints.map(function(q){ return toDisplay(toShownPoint(q)); })"),
  '[v1082] 草稿总管线同样投影（落点即所见）');
ok(/function shownLatLngOf\(lat,lng\)/.test(oml), '[v1082] 渲染唯一入口 shownLatLngOf 在位');
ok(oml.includes('var mk=L.marker(shownLatLngOf(rd.lat,rd.lng)'), '[v1082] 折点手柄画显示位');
ok(oml.includes('var mk=L.circleMarker(shownLatLngOf(rd.lat,rd.lng)'), '[v1082] 总管节点标记画显示位');
ok(oml.includes('reservoirMarker=L.marker(shownLatLngOf(point.lat,point.lng)'), '[v1082] 蓄水池图标同世界');
ok(/var last=toDisplay\(toShownPoint\(trunkPoints\[trunkPoints\.length-1\]\)\)/.test(oml),
  '[v1082] 橡皮筋起点与草稿线同点');

/* 锁4：命中 / 拖拽回存必须换回实体 */
ok(/function projectToContainer\(lat,lng\)\{[\s\S]{0,400}toShownPoint/.test(oml),
  '[v1082] projectToContainer 返回可见位（选线/命中不再整体偏 gap）');
ok(oml.includes('var gcjRaw=toEntityPoint(fromDisplay(ev.target.getLatLng()));'),
  '[v1082] 拖点结束先换实体再捕捉（否则永远差一个 gap）');
ok(oml.includes('var gcjDrag=toEntityPoint(fromDisplay(ll));'),
  '[v1082] 拖点预览同步换实体');
ok(oml.includes('var moved=toEntityPoint(fromDisplay(reservoirMarker.getLatLng()));'),
  '[v1082] 蓄水池拖动存实体');

/* 锁5：显示副本仍是渲染源（v1081 的实体渲染已回退，主/支管必须分得开） */
ok(enh.includes('var drawLL = validRingLL(s.displayLatLng, 2) || sLL;'),
  '[v1082] 管段线体画显示副本（否则主/支管叠成一根）');
ok(oml.includes('var markerLat=isFinite(Number(n.displayLat))?Number(n.displayLat):n.lat;'),
  '[v1082] 节点标记画显示位');
ok(demo.includes('displayMainsLL') && demo.includes('displayBranchLL'),
  '[v1082] 轮灌演示底图仍用显示副本');
ok(/var shown=n\.displayLL\|\|n\.ll;/.test(demo), '[v1082] 演示入口/断线用节点显示位');

/* 锁6：位移缓存（mousemove 每帧调用，不许每帧读库解析） */
ok(/var PIPE_SHIFT_TTL_MS = 2000;/.test(oml), '[v1082] 位移缓存 TTL 兜底');
ok(/function invalidatePipeShift\(\)/.test(oml), '[v1082] 位移缓存可显式失效');
ok(/if\(!S\) return 0;\s*\n\s*\/\* \[v1082\][\s\S]{0,200}invalidatePipeShift\(\);/.test(oml),
  '[v1082] refreshSnapTargets 进入即失效缓存（重新生成施工图后立刻生效）');
ok(/function clearPublishedOverlays\(opts\)\{[\s\S]{0,300}invalidatePipeShift\(\)/.test(oml),
  '[v1082] 清空管网同时失效位移缓存');

/* 锁7：版本纪律（动态读 sw VERSION，禁止写死版本号） */
const m = /^const VERSION = '(v[\w-]+)';/m.exec(sw);
ok(!!m && /^v\d{3,4}-[\w-]+$/.test(m[1]), '[v1082] sw VERSION 存在且形如 vNNNN- slug：' + (m && m[1]));
const want = m ? m[1].replace(/^v/, '') : '';
ok(html.split('?v=' + want).length - 1 === 17, '[v1082] index.html 版本串 17 处同值');

console.log(process.exitCode ? '\n[v1082] 有断言失败' : '\n[v1082] 全部通过');
