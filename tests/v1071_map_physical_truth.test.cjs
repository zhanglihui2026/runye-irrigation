#!/usr/bin/env node
/* v1071-map-physical-truth 回归锁：地图「所见即物理」统一口径。
 *
 * 背景（用户实测「手绘总管捕捉点精度有问题」）：
 *   046ba7a（Fix map pipe display offsets）把 v1059 设计画布的显示偏移副本搬上地图——
 *   ① runye-map-enhance 画 seg.displayLatLng（偏移 ±gap/2≈1m）；
 *   ② online-map 节点标记画 displayLat/displayLng；
 *   ③ trunk-snap 节点捕捉按 displayLat 命中（返回物理）。
 *   而手绘总管落点、白色捕捉圈（displayLatLngOf(hit)=物理）、轮灌演示寻路全按物理坐标——
 *   两套口径在一张图上混用 ⇒ 捕捉吸偏、画线贴不上标记、0.5m 接驳门禁挂、演示路径偏 1m。
 * 修复（本版三改）：
 *   ① runye-map-enhance renderNetwork 画 sLL（物理），displayLatLng 副本退役；
 *   ② renderCouplerMarkers 画 n.lat/n.lng（物理）；
 *   ③ trunk-snap main-coupler 命中物理坐标（c.lat/c.lng），不再吃 displayLat。
 * 设计画布（plot-editor ppGetPipeDisplayGeometry）偏移看图不变——错位只服务于看图（v1059 口径）。
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

const enh = read('runye-map-enhance.js');
const oml = read('mod/online-map.js');
const snap = read('mod/trunk-snap.js');
const sw = read('sw.js');
const html = read('index.html');

/* 锁1：管段渲染回到物理几何，displayLatLng 绘制副本退役 */
ok(!enh.includes('drawLL'), '[v1071] renderNetwork 不再用 drawLL 显示副本绘制管段');
ok(enh.includes('var pts = sLL.map(RunyeGeo.coordPair)'), '[v1071] 管段裁剪/绘制输入 = sLL（发布物理几何）');
ok(enh.includes('[v1071] 地图只画物理几何'), '[v1071] 地图物理口径注释在位（防回退）');

/* 锁2：节点标记画物理坐标 */
const rcmPos = oml.indexOf('function renderCouplerMarkers');
const rcmBody = oml.slice(rcmPos, oml.indexOf('/* ===== [v861]', rcmPos));
ok(rcmBody.includes('var markerLat=n.lat,markerLng=n.lng;'), '[v1071] 节点标记 = n.lat/n.lng（物理坐标）');
ok(!rcmBody.includes('Number(n.displayLat)'), '[v1071] renderCouplerMarkers 不再消费 displayLat（偏移标记退役）');

/* 锁3：节点捕捉命中物理坐标（命中=白圈=标记=落点四位一体） */
ok(!snap.includes('c.displayLat'), '[v1071] trunk-snap 不再按 displayLat 命中');
ok(snap.includes("push(cp.lat, cp.lng, 'main-coupler'"), '[v1071] main-coupler 捕捉目标 = 物理中心线坐标');

/* 锁4：发布链仍冻结显示副本字段（存档兼容），但地图端不再消费——发布块不动 */
const i09 = read('mod/inline-09.js');
ok(i09.includes('displayLat:shownLL'), '[v1071] 发布快照仍写 displayLat 字段（存档兼容，不影响本版修复）');

/* 锁5：版本纪律——动态读 sw VERSION；主串 15 处 + runye-map-enhance/trunk-snap 独立串同值 */
const m = /^const VERSION = '(v[\w-]+)';/m.exec(sw);
ok(!!m && m[1] === 'v1071-map-physical-truth', '[v1071] sw VERSION = v1071-map-physical-truth');
const want = m ? m[1].replace(/^v/, '') : '';
const hits = html.split('?v=' + want).length - 1;
ok(hits === 17, '[v1071] index.html 版本串 17 处同值（主串 15 + runye-map-enhance + trunk-snap），实际 ' + hits);
ok(html.includes('runye-map-enhance.js?v=' + want), '[v1071] runye-map-enhance.js 已抬串');
ok(html.includes('mod/trunk-snap.js?v=' + want), '[v1071] trunk-snap.js 已抬串');

console.log(process.exitCode ? '\n[v1071] 有断言失败' : '\n[v1071] 全部通过');
