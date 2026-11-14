#!/usr/bin/env node
/* v1081-map-physical-render 回归锁：在线地图统一实体世界（点哪存哪、所见即所连）。
 *
 * 用户实测「你怎么就捕捉不上主管上的节点呢？」——像素级诊断：总管折点（白点）与
 * 紫色节点标记恒偏 26~28px、纯 +x 方向，正是显示偏移 gap/2 的量级与方向。
 * 病根：地图还在「显示世界」画线体和节点标记（displayLatLng/displayLat），而总管
 * 捕获落点、已存总管、发布快照节点 ll、动画寻路全是实体坐标 ⇒ 用户点节点时白圈
 * 吸在标记上，松手后折点跳到 10m 外的实体位；没吸中的点存的是显示位，又让
 * trunk-entry(5m)/node-attach(1.5m) 接不上 ⇒ 水路不闭环。
 *
 * 修复（一处口径、全线一致）：地图统一实体世界——
 *   ① runye-map-enhance 线体画 sLL（不再用 displayLatLng 副本）；
 *   ② online-map 节点标记画 n.lat/n.lng（实体）；
 *   ③ trunk-snap 7b 命中与落点都用实体（push(cp.lat,cp.lng,...)）；
 *   ④ map-flow-demo 描边/底图/断线/入口标记全用实体几何（mainsLL/branchLL/ll）。
 * 设计页（分区与管路/三级）的错开显示不受影响；主/支管 v1079 后本就同一根线。
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
const demo = read('mod/map-flow-demo.js');
const sw = read('sw.js');
const html = read('index.html');

/* 锁1：线体实体绘制 */
ok(enh.includes('var drawLL = sLL;'),
  '[v1081] 地图线体按实体中心线绘制（drawLL = sLL）');
ok(!enh.includes('validRingLL(s.displayLatLng, 2) || sLL'),
  '[v1081] 不再用 displayLatLng 作为线体绘制源');

/* 锁2：节点标记实体位 */
ok(oml.includes('var markerLat=n.lat, markerLng=n.lng;'),
  '[v1081] 节点标记画实体位（与落点/寻路同世界）');

/* 锁3：捕捉命中与落点统一实体 */
ok(snap.includes("push(cp.lat, cp.lng, 'main-coupler'"),
  '[v1081] main-coupler 命中位=实体落点');
ok(snap.includes('[v1081] 地图统一实体世界：命中测试与保存点同为实体坐标'),
  '[v1081] nearest 实体口径注释在位');

/* 锁4：动画/描边/入口标记实体几何 */
ok(demo.includes('(d.mainsLL||[]).forEach(function (l) { if (l) ly.addLayer(poly(l, \'#cbd5e1\', 2, false)); });'),
  '[v1081] 底态主管用实体几何');
ok(demo.includes('var shown=n.ll;   /* [v1081] 实体位 */'),
  '[v1081] 常驻节点标记用实体位');
ok(demo.includes('var shown=n.ll;   /* [v1081] 入口坐标=节点实体位'),
  '[v1081] 水路入口标记用实体位');
ok(demo.includes("[v1081] 地图全线实体渲染（管线/标记/总管/捕捉同一世界）：描边直接用实体点"),
  '[v1081] 路线描边不再按显示副本平移');
ok(!demo.includes('(main?d.displayMainsLL:d.displayBranchLL)[index]'),
  '[v1081] 描边映射已移除显示副本分支');

/* 锁5：版本纪律（动态读 sw VERSION，勿写死版本号） */
const m = /^const VERSION = '(v[\w-]+)';/m.exec(sw);
ok(!!m && /^v\d{3,4}-[\w-]+$/.test(m[1]), '[v1081] sw VERSION 存在且形如 vNNNN- slug：' + (m && m[1]));
const want = m ? m[1].replace(/^v/, '') : '';
ok(html.split('?v=' + want).length - 1 === 17, '[v1081] index.html 版本串 17 处同值');

console.log(process.exitCode ? '\n[v1081] 有断言失败' : '\n[v1081] 全部通过');
