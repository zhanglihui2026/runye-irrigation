#!/usr/bin/env node
/* v1078-snap-priority-demote 回归锁：手绘总管捕捉节点偏移深挖收口。
 *
 * 背景：用户实测「手绘总管不能有效的捕捉节点，有偏移，这个要深挖原因，查清楚」。
 * 深挖定案两个偏移机制：
 *   机制一 —— 捕捉命中位与实体保存位混用：v1076（acac830）已修复——点目标
 *             lat/lng=显示位（屏幕命中跟随可见位置）、snapLat/snapLng=实体位
 *             （写回总管拓扑），显示偏移绝不进入拓扑；publishedCouplersForPlot
 *             的 items 保持 lat=实体、displayLat=显示，trunk-snap 7b 以 item.lat
 *             作 snapPoint。本版本加锁防止回退（曾试过把 items.lat 改成显示位，
 *             那会让 snapPoint 变显示位，总管点存偏 10~20m，1.5m 接驳门禁必挂）。
 *   机制二 —— 重画总管（draw 态）时旧干线拐点 prio 3 抢在施工节点 prio 4 前，
 *             白圈落旧线拐点，新线继承旧坐标。修复：demoteTrunkTargets —— draw 态
 *             旧干线拐点/线体优先级整体 +6（拐点 3→9、线体 9→15），让位节点；
 *             edit 态不降级（v914「编辑时抢点行为不变」口径保留）。
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

const snap = read('mod/trunk-snap.js');
const oml = read('mod/online-map.js');
const sw = read('sw.js');
const html = read('index.html');

/* 锁1：机制一保持修复态 —— 双坐标链路（v1076 口径不许回退） */
ok(oml.includes('out.items.push({lat:lat,lng:lng,displayLat:isFinite(Number(n.displayLat))?Number(n.displayLat):lat,'),
  '[v1078] publishedCouplers items 保持 lat=实体、displayLat=显示（不许改成显示位当 lat）');
ok(snap.includes("push(displayLat, displayLng, 'main-coupler', (c && c.label) ? c.label : ('主管节点 ' + mcValid), {lat:cp.lat,lng:cp.lng})"),
  '[v1078] trunk-snap 7b 命中显示位 + snapPoint=实体位');
ok(snap.includes('命中测试跟随画面可见位置；snapLat/snapLng 仍是保存到总管的实体坐标'),
  '[v1078] nearest 双坐标注释在位');
ok(snap.includes('? { lat: Number(best.target.snapLat), lng: Number(best.target.snapLng) }'),
  '[v1078] nearest 点命中回传实体 snap 坐标');

/* 锁2：机制二 —— demote 降级机制（trunk-snap 引擎侧） */
ok(snap.includes('var demoteTrunk = input.demoteTrunkTargets === true;'),
  '[v1078] buildTargets 读 input.demoteTrunkTargets');
ok(/function push\(lat, lng, kind, label, snapPoint, demote\)/.test(snap),
  '[v1078] push 签名带第 6 参 demote');
ok(snap.includes('demote: !!demote'),
  '[v1078] 点目标对象携带 demote 标');
ok(snap.includes("'trunk-vertex', '干线 ' + tk.id + ' 拐点 ' + (pi + 1), null, demoteTrunk"),
  '[v1078] 旧干线拐点推入按 draw 态打 demote 标');
ok(/function addEdges\(lines, kind, labelOf, demote\)/.test(snap),
  '[v1078] addEdges 支持第 4 参 demote');
ok(snap.includes("out.push({ kind: kind, label: labelOf(li, ei), a: a, b: b, demote: !!demote })"),
  '[v1078] 段目标对象携带 demote 标');
ok(snap.includes("}, demoteTrunk);"),
  '[v1078] trunk-edge 线段 draw 态降级');
ok(snap.includes('prio: prioOf(t.kind) + (t.demote ? 6 : 0)'),
  '[v1078] setTargets 段优先级应用 demote（+6）');
ok(/prio: prioOf\(kind\) \+ \(t\.demote \? 6 : 0\)/.test(snap),
  '[v1078] setTargets 点优先级应用 demote（+6）');

/* 锁3：宿主侧 draw 态传参 */
ok(/if\(trunkMode==='draw'\) input\.demoteTrunkTargets=true;/.test(oml),
  '[v1078] refreshSnapTargets 在 draw 态传 demoteTrunkTargets');
ok(oml.includes('编辑态（edit）不降级，v914「编辑时抢点行为不变」口径保留'),
  '[v1078] edit 态不降级口径注释在位');

/* 锁4：版本纪律（动态读 sw VERSION，勿写死版本号） */
const m = /^const VERSION = '(v[\w-]+)';/m.exec(sw);
ok(!!m && /^v\d{3,4}-[\w-]+$/.test(m[1]), '[v1078] sw VERSION 存在且形如 vNNNN- slug：' + (m && m[1]));
const want = m ? m[1].replace(/^v/, '') : '';
ok(html.split('?v=' + want).length - 1 === 17, '[v1078] index.html 版本串 17 处同值');

console.log(process.exitCode ? '\n[v1078] 有断言失败' : '\n[v1078] 全部通过');
