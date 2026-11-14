#!/usr/bin/env node
/* v1073-design-view-map 回归锁：地图=设计页同图（发布快照=显示世界）。
 *
 * 用户拍板「直接把分区与管路的图传递过来不行吗」：
 *   主/支管物理重合的布局在真实坐标上必然叠成一条线（±10m 显示偏移就是为分开它们
 *   而生），v1071 把地图改回物理渲染后重叠重现。本版把发布快照 routeGeometry 整体
 *   升级为设计页同款显示世界（ppGetPipeDisplayGeometry 几何）：
 *   ① routeGeometry.mains/branches = 显示世界折线（network.segments.latLng 仍物理）；
 *   ② 阀门 anchorLL = routeDisplay.valveAnchors（跟随偏移主管）；
 *   ③ 施工节点冻结位 = 显示主管上的 shownLL（lat=displayLat）；
 *   ④ runye-map-enhance 线体画 displayLatLng||latLng；
 *   ⑤ 节点标记画 displayLat；
 *   ⑥ trunk-snap 点命中返回命中位（snapLat/snapLng）——命中=白圈=标记=所见=落点；
 *   ⑦ map-flow-demo 补支管端点直连（带状布局跨行连接）。
 * 平移不改变线长 ⇒ 水力路径长度不受影响；物理几何保留在 segments.latLng。
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

const i09 = read('mod/inline-09.js');
const enh = read('runye-map-enhance.js');
const oml = read('mod/online-map.js');
const snap = read('mod/trunk-snap.js');
const demo = read('mod/map-flow-demo.js');
const sw = read('sw.js');
const html = read('index.html');

/* 锁1：发布快照=显示世界 */
ok(i09.includes('[v1073] 寻路快照升级为「设计页同款显示世界」'), '[v1073] 发布块显示世界口径注释在位');
ok(i09.includes('routeGeometry.mains.push(disp||routeMainLLPhys[i])'), '[v1073] routeGeometry.mains = 显示世界折线');
ok(i09.includes('routeGeometry.branches.push(disp||routeBranchLLPhys[i])'), '[v1073] routeGeometry.branches = 显示世界折线');
ok(i09.includes('isMain?routeMainLLPhys[idx]:routeBranchLLPhys[idx]'), '[v1073] segments.latLng 仍为物理几何（水力/裁剪口径不变）');
ok(i09.includes('routeDisplay.valveAnchors||[])[i]'), '[v1073] 阀门锚点取显示世界 valveAnchors');
ok(i09.includes('var useLL=(shownLL&&isFinite(Number(shownLL[0]))&&isFinite(Number(shownLL[1])))?shownLL:ll;'), '[v1073] 施工节点冻结位=显示主管 shownLL');

/* 锁2：地图线体画显示副本（设计页同图） */
ok(enh.includes('var drawLL = validRingLL(s.displayLatLng, 2) || sLL;'), '[v1073] 管段绘制 = displayLatLng||latLng（设计页同图）');
ok(enh.includes('var pts = drawLL.map(RunyeGeo.coordPair)'), '[v1073] 裁剪/绘制输入 = drawLL');

/* 锁3：节点标记=显示位（旧快照回退 lat） */
ok(oml.includes("var markerLat=isFinite(Number(n.displayLat))?Number(n.displayLat):n.lat;"), '[v1073] 节点标记 = displayLat 优先');

/* 锁4：捕捉点命中=命中位（白圈/落点/所见三位一体） */
ok(snap.includes('isNum(Number(best.target.snapLat)) && isNum(Number(best.target.snapLng))'), '[v1073] 点命中返回 snapLat/snapLng（命中位）');
ok(snap.includes("push(cp.lat, cp.lng, 'main-coupler'"), '[v1073] main-coupler 捕捉目标照常注册');

/* 锁5：支管端点直连（跨行连接） */
ok(demo.includes("var id='branch-end:'+bk+':'+ei+':'+o.key;"), '[v1073] 支管端点直连补边块在位');
ok(demo.includes("if(p.d<=LINK_EPS_M){var id='branch-end:'"), '[v1073] 支管端点直连沿用 LINK_EPS_M（0.5m 接驳口径）');
ok(demo.includes("if(o.key===b.key||o.kind==='trunk')return;"), '[v1073] 支管端点直连不接总管（总管只喂主管，v988 口径）');

/* 锁5b：冗余路线打标不剔除——覆盖数「可达」，网格布局的备份路径不再双杀整图门禁 */
ok(demo.includes('var route={zi:t.zi,trunk:[],main:[],branch:[],redundant:redundant};'), '[v1073] 冗余路线入列并打标');
ok(demo.includes('routes=groupRoutes.filter(function(r){return !r.redundant;});'), '[v1073] 动画路线过滤冗余，覆盖判定不受影响');

/* 锁6：版本纪律——动态读 sw VERSION；17 处同值（主串 15 + map-enhance + trunk-snap） */
const m = /^const VERSION = '(v[\w-]+)';/m.exec(sw);
ok(!!m && /^v\d{3,4}-[\w-]+$/.test(m[1]), '[v1073] sw VERSION 存在且形如 vNNNN- slug：' + (m && m[1]));
const want = m ? m[1].replace(/^v/, '') : '';
const hits = html.split('?v=' + want).length - 1;
ok(hits === 17, '[v1073] index.html 版本串 17 处同值，实际 ' + hits);

console.log(process.exitCode ? '\n[v1073] 有断言失败' : '\n[v1073] 全部通过');
