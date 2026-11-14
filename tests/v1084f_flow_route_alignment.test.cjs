#!/usr/bin/env node
/* v1084f —— 轮灌演示「动画路径不对 / 动画与管线不重叠」两个抱怨的回归锁。
 *
 * 用户 2026-11-14 实测（12 区 3 列 × 4 行，手绘总管在最北，串 N-01/N-02/N-03）：
 *   ①「1、2、3 区逻辑对，4 区、7 区不对：4 区要经过 1 区总管到 4 区总管、支管，
 *      7 区要经过 1 区、4 区总管，到 7 区总管、支管」
 *   ②「每个分区总管跟支管的水流动画位置跟主管、支管不重叠 —— 动画位置不对，
 *      要按照管线的位置来」
 *
 * 查证结论：
 *   ① 路径**本来就是对的**（合成同构数据实测：4 区 = trunk → main:0 → main:3 → branch）。
 *      视觉上"没沿 1 区那根管走"是 ② 的连带症状。
 *   ② 真缺陷在 render()：只有 main:N / branch:N 两种段做了「实体→显示副本」换算，
 *      branch-feed:N（主管接点→阀门的分水段）、trunk:N（手绘总管）仍画在实体坐标，
 *      整段浮在可见管线旁边约半个显示间距（≈0.96m）。阀门图标、水源图标同样漏换算。
 *
 * 本文件锁两件事：
 *   A. 源码：四类段/图标都走显示世界换算，且换算只经两个 helper 出口；
 *   B. 行为：routeSegments(zi) 能给出「水实际走哪几段」，且 4/7 区必须含上游主管段。
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

const demo = read('mod/map-flow-demo.js');
const sw = read('sw.js');
const html = read('index.html');

/* ---------- A. 源码锁：可见元素一律落在显示世界 ---------- */
ok(/function shiftToBranchDisplay\(d, zi, p\)/.test(demo),
  '[v1084f] 支管显示位移有唯一出口 shiftToBranchDisplay()');
ok(/function shiftToShown\(p\)/.test(demo) && /PR\.toShown\(p\)/.test(demo),
  '[v1084f] 总管/空中点走地图投影层同一实现（RyMapPointProjector.toShown）');
ok(/var feedMatch=\/\^branch-feed:\(\\d\+\)\$\/\.exec\(segKey\)/.test(demo),
  '[v1084f] branch-feed 段单独识别（主管接点→阀门的分水段）');
ok(/mD\.lat\*\(1-t\)\+bD\.lat\*t/.test(demo),
  '[v1084f] 分水段按点序混合「主管位移→支管位移」，不是整段用一个偏移');
ok(/shownPoints=seg\.points\.map\(shiftToShown\)/.test(demo),
  '[v1084f] trunk/segment 段逐点走 toShown');
ok(/var vll=shiftToBranchDisplay\(d,v\.mi,v\.ll\)\|\|v\.ll;/.test(demo),
  '[v1084f] 阀门图标画在支管显示副本上');
ok(/var sll=shiftToShown\(d\.sourceLL\);/.test(demo),
  '[v1084f] 水源/蓄水池走显示位');
ok(/routeSegments: function \(zi, dInj\)/.test(demo),
  '[v1084f] 导出 routeSegments()：能打出「水实际走哪几段」');

/* ---------- B. 行为锁：4/7 区路径必须经过上游主管段 ---------- */
global.window = {}; global.document = {};
new Function(demo)();
const D = global.window.RyMapFlowDemo;

const LAT0 = 38.725, LNG0 = 107.24671, K = 111320 * Math.cos(LAT0 * Math.PI / 180);
const P = (x, y) => ({ lat: LAT0 + y / 110540, lng: LNG0 + x / K });
const COLW = 45, ROWH = 60;
const mains = [], branches = [], valves = [], nodes = [];
for (let row = 0; row < 4; row++) {
  for (let col = 0; col < 3; col++) {
    const zi = row * 3 + col, xC = col * COLW + COLW / 2, yTop = row * ROWH, yBot = yTop + ROWH;
    mains.push([P(xC, yTop), P(xC, yBot)]);
    branches.push([P(col * COLW, yTop + ROWH / 2), P(col * COLW + COLW, yTop + ROWH / 2)]);
    valves.push({ ll: P(xC, yTop + ROWH / 2), anchorLL: null, mi: zi, tier: 'zone' });
    if (row === 0) nodes.push({ kind: 'main', mi: zi, ll: P(xC, yTop), pipeKey: 'm' + (zi + 1) });
  }
}
const trunk = [P(-40, 0), P(160, 0)];
const d = { trunkLL: trunk, trunkLinesLL: [trunk], mainsLL: mains, branchLL: branches, valves,
  fittings: [], nodesLL: nodes, couplersLL: [], segLL: null, total: 12, manual: null, nPer: 1, gCount: 4 };

function keysOf(zi) {
  const r = D.routeSegments(zi, d);
  if (!r || !r.routes || !r.routes.length) return [];
  return r.routes[0].segs.map(s => s.key);
}

const k4 = keysOf(3), k7 = keysOf(6), k1 = keysOf(0);
ok(k4.length > 0 && k4.indexOf('main:0') >= 0, '[v1084f] 第 4 区路线含 main:0（1 区那段主管）：' + k4.join('→'));
ok(k4.indexOf('main:3') >= 0, '[v1084f] 第 4 区路线含 main:3（本区主管）');
ok(k4.indexOf('main:0') < k4.indexOf('main:3'), '[v1084f] 第 4 区顺序是「先 1 区段、后 4 区段」');
ok(k7.indexOf('main:0') >= 0 && k7.indexOf('main:3') >= 0 && k7.indexOf('main:6') >= 0,
  '[v1084f] 第 7 区路线含 main:0 → main:3 → main:6：' + k7.join('→'));
ok(k7.indexOf('main:0') < k7.indexOf('main:3') && k7.indexOf('main:3') < k7.indexOf('main:6'),
  '[v1084f] 第 7 区三段顺序正确（1 区→4 区→7 区）');
ok(k1.indexOf('main:3') < 0, '[v1084f] 第 1 区不被多算上游段（只 main:0）');
ok(k4[0] === 'trunk:0', '[v1084f] 每条路线都从手绘总管段起步（trunk:0）');

/* 段长要真（不是零长切片把动画画成一个点） */
const r4 = D.routeSegments(3, d).routes[0].segs;
const m0 = r4.filter(s => s.key === 'main:0').reduce((a, s) => a + s.lenM, 0);
ok(m0 > 50, '[v1084f] 第 4 区走的 main:0 累计长 ' + m0.toFixed(1) + 'm（1 区整段 60m）');
ok(r4.some(s => s.key.indexOf('branch:') === 0 && s.lenM > 5),
  '[v1084f] 支管段有实际长度（不是零长切口）');

/* ---------- 版本纪律 ---------- */
const m = /^const VERSION = '(v[\w-]+)';/m.exec(sw);
ok(!!m && /^v\d{3,4}-[\w-]+$/.test(m[1]), '[v1084f] sw VERSION 形如 vNNNN- slug：' + (m && m[1]));
const want = m ? m[1].replace(/^v/, '') : '';
ok(html.split('?v=' + want).length - 1 === 17, '[v1084f] index.html 版本串 17 处同值');

console.log(process.exitCode ? '\n[v1084f] 有断言失败' : '\n[v1084f] 全部通过');
