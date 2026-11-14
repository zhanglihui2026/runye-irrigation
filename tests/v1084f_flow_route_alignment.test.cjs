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

/* ---------- C. [v1084g] 阀门是支管唯一进水口 + 支管整段流动 ---------- */
ok(/valveOnOwnMain\[v\.mi\]=1/.test(demo), '[v1084g] 能识别「阀门落在自己主管上」的区');
ok(/Object\.keys\(branchLines\)\.forEach\(function\(bk\)\{[\s\S]{0,120}?if\(valveOnOwnMain\[bk\]\)return;/.test(demo),
  '[v1084h] 有阀门的区：支管两端一律不打洞（阀门是唯一进水口）');
ok(/if\(o\.kind==='branch'&&valveOnOwnMain\[o\.index\]\)return;/.test(demo),
  '[v1084h] 反方向也挡：别的支管不许往「有阀门的支管」上打洞');
ok(/zoneBranch\[i\]=\[/.test(demo), '[v1084g] 每区支管整段（阀门两侧各一段）单独给出');
ok(/concat\(route\.zoneBranch\|\|\[\]\)/.test(demo), '[v1084g] 渲染消费 zoneBranch（与路线条数无关）');

/* 支管整段：两段之和必须等于整条支管长（45m），且分界点落在阀门上 */
const rs4 = D.buildRoutes(d, 0, true).filter(r => r.zi === 3);
ok(rs4.length > 0 && rs4[0].zoneBranch && rs4[0].zoneBranch.length === 2,
  '[v1084g] 第 4 区带 zoneBranch 两段');
if (rs4.length && rs4[0].zoneBranch) {
  const zb = rs4[0].zoneBranch;
  const segLenOf = (s) => {
    const a = s.points[0], b = s.points[s.points.length - 1];
    const cos = Math.max(.01, Math.cos(a.lat * Math.PI / 180));
    return Math.hypot((b.lng - a.lng) * 111320 * cos, (b.lat - a.lat) * 110540);
  };
  const total = segLenOf(zb[0]) + segLenOf(zb[1]);
  ok(Math.abs(total - COLW) < 0.5, '[v1084g] 两段之和 = 整条支管 ' + total.toFixed(1) + 'm（应 45m）');
  ok(Math.abs(segLenOf(zb[0]) - COLW / 2) < 0.5 && Math.abs(segLenOf(zb[1]) - COLW / 2) < 0.5,
    '[v1084g] 分界点落在阀门（两段各 ' + segLenOf(zb[0]).toFixed(1) + ' / ' + segLenOf(zb[1]).toFixed(1) + 'm）');
}

/* ---------- D. [v1084h] 真实场地形状：主/支管**同列定线** ----------
 * 上面 B 段的夹具是「支管横穿、主管竖穿」的十字布局，支管端点到主管有 22.5m，
 * 永远不会触发端点打洞 —— 所以 v1084f/v1084g 两轮测试全绿，用户现场仍然错。
 * 真实场地（v1079 主/支管同列定线）是：每个区的**主管和支管都在同一列**上、
 * 实体坐标完全重合，只在显示副本里左右错开 0.96m。此时支管端点与上游
 * main:N-1 端点距离恰为 0，v1073 的端点打洞会把支管顶端直接焊到上一区主管末端，
 * 最短路「沿主管到本区顶部 → 0 米跳进支管」，本区那段主管（顶部→阀门）一段不走。
 * 这一段就是照这个形状建的：4 行 × 3 列，每区主管=支管=同一竖线，阀门在区中点。 */
const cMains = [], cBranches = [], cValves = [], cNodes = [];
const CCOLS = [0, 60, 100], CBH = 60;
for (let row = 0; row < 4; row++) {
  for (let col = 0; col < 3; col++) {
    const zi = row * 3 + col, x = CCOLS[col], yt = row * CBH, yb = yt + CBH, ym = (yt + yb) / 2;
    cMains.push([P(x, yt), P(x, yb)]);
    cBranches.push([P(x, yt), P(x, yb)]);
    cValves.push({ ll: P(x, ym), anchorLL: P(x, ym), mi: zi, tier: 'zone' });
    if (row === 0) cNodes.push({ kind: 'main', mi: zi, ll: P(x, yt), pipeKey: 'm' + (zi + 1) });
  }
}
const cTrunk = [P(-40, 0), P(140, 0)];
const cd = { trunkLL: cTrunk, trunkLinesLL: [cTrunk], mainsLL: cMains, branchLL: cBranches,
  valves: cValves, fittings: [], nodesLL: cNodes, couplersLL: [], segLL: null,
  total: 12, manual: null, nPer: 1, gCount: 4 };
function cKeys(zi) {
  const r = D.routeSegments(zi, cd);
  return (r && r.routes && r.routes.length) ? r.routes[0].segs.map(s => s.key) : [];
}
const c7 = cKeys(6);
ok(c7.indexOf('main:6') >= 0,
  '[v1084h] 同列定线下 7 区必须走完本区主管 main:6（7 区顶部→阀门那段）：' + c7.join('→'));
ok(c7.indexOf('branch-feed:6') >= 0 && c7.indexOf('branch-feed:6') > c7.indexOf('main:6'),
  '[v1084h] 7 区必须是「main:6 → branch-feed:6（阀门）→ 支管」的顺序');
ok(c7[c7.length - 1].indexOf('branch:') === 0,
  '[v1084h] 7 区路线以支管段收尾（不是停在 main:3 上）：' + (c7[c7.length - 1] || '空'));
/* 12 个区一律「先走本区主管、再进阀门」，一个都不许抄近路 */
let shortcut = [];
for (let zi = 0; zi < 12; zi++) {
  const k = cKeys(zi);
  if (!k.length || k.indexOf('main:' + zi) < 0 || k.indexOf('branch-feed:' + zi) < 0) shortcut.push(zi + 1);
}
ok(shortcut.length === 0,
  '[v1084h] 12 区全部「本区主管 → 阀门 → 支管」，抄近路的区：' + (shortcut.join(',') || '无'));
/* 支管整段必须仍给出两段（阀门两侧），且合计等于区高 */
const c7route = D.buildRoutes(cd, 0, true).filter(r => r.zi === 6);
ok(c7route.length > 0 && c7route[0].zoneBranch && c7route[0].zoneBranch.length === 2,
  '[v1084h] 同列定线下 7 区仍给出支管整段（阀门两侧各一段）');

/* ---------- E. [v1084i] 管路 vs 分区框配准审计 ----------
 * 用户 2026-11-14 第二问：「支管主管位于本分区的位置对不对？分区与管路页面对在线地图
 * 页面是不是本身就不对？」——演示的描边与发布管线是重合的（红管与绿水同点衔接），
 * 所以偏移不在动画，而在「分区框」与「管路」两份几何的配准上。这里锁住审计工具本身：
 * 已知平移量必须被量出来，且方向要对（+ = 伸到上游隔壁区）；全同向同量必须判「系统性」。 */
ok(/function placementAudit\(d\)/.test(demo), '[v1084i] 配准审计纯函数 placementAudit() 在位');
ok(/auditZones: function \(zi, dInj\)/.test(demo), '[v1084i] 导出 auditZones()');
ok(/placement: placement/.test(demo), '[v1084i] collect() 把配准结论挂到 d.placement');
ok(/placementWarned = true/.test(demo), '[v1084i] 系统错位只 console.warn 一次（不刷屏）');

function fieldWithShift(shiftY) {
  const m = [], b = [], v = [], polys = [];
  const COLS2 = [0, 60, 100];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 3; col++) {
      const zi = row * 3 + col, x = COLS2[col], yt = row * 60, yb = yt + 60;
      m.push([P(x, yt + shiftY), P(x, yb + shiftY)]);
      b.push([P(x, yt + shiftY), P(x, yb + shiftY)]);
      v.push({ ll: P(x, yt + 30 + shiftY), anchorLL: P(x, yt + 30 + shiftY), mi: zi });
      const hw = 18;
      polys.push({ zi, ll: [P(x - hw, yt), P(x + hw, yt), P(x + hw, yb), P(x - hw, yb)] });
    }
  }
  return { mainsLL: m, branchLL: b, zonePolygons: polys, valves: v, total: 12 };
}
const aligned = D.auditZones(undefined, fieldWithShift(0));
ok(aligned.rows.every(r => r.skip || Math.abs(r.branch.startOut) < 0.5),
  '[v1084i] 对齐时每区支管起点超出量 ≈ 0');
ok(aligned.verdict.systematic === false, '[v1084i] 对齐时不报系统性错位');

const shifted = D.auditZones(4, fieldWithShift(-16));
const r4s = shifted.rows.filter(r => r.zi === 3)[0];
ok(r4s && Math.abs(r4s.branch.startOut - 16) < 0.5 && Math.abs(r4s.branch.endOut + 16) < 0.5,
  '[v1084i] 支管整体上移 16m ⇒ 起点外 +16m、终点外 -16m（实测 ' +
  (r4s ? r4s.branch.startOut.toFixed(1) + ' / ' + r4s.branch.endOut.toFixed(1) : '无') + '）');
ok(shifted.verdict.systematic === true && shifted.verdict.off === 12,
  '[v1084i] 12 区同向同量 ⇒ 判「系统性错位」（分区框与管路不是同一代）');

/* ---------- F. [v1084j] 审计不许依赖演示门禁 ----------
 * 用户 2026-11-14 实测：控制台敲 auditZones() 只回 `{rows:[], verdict:null, error:'无可用简图数据'}`
 * ——因为当时 collect() 正被门禁拦下（快照待更新）。**诊断工具在最该说话的时候闭嘴了。**
 * 这里锁住：被拦时要回退去读「网络快照本身的 partitions + routeGeometry」，照量不误。 */
ok(/function placementDataFromNetwork\(net\)/.test(demo),
  '[v1084j] 有绕过门禁的快照读取 placementDataFromNetwork()');
ok(/auditSnapshot: function \(net, zi\)/.test(demo), '[v1084j] 导出 auditSnapshot(net)');
ok(/function auditText\(res, opt\)/.test(demo), '[v1084j] 报告文本只有 auditText() 一个出口');
ok(/out\.blocked = collectBlockReason/.test(demo), '[v1084j] 被拦时把门禁原因带进报告');

/* 造一个「分区框 12 个 + 管路整体上移 12m」的网络快照，直接喂给 auditSnapshot */
const netParts = [], netMains = [], netBranches = [], netValves = [];
const NCOLS = [0, 60, 100];
for (let row = 0; row < 4; row++) {
  for (let col = 0; col < 3; col++) {
    const zi = row * 3 + col, x = NCOLS[col], yt = row * 60, yb = yt + 60, hw = 18;
    netParts.push({ zoneIndex: zi, latLng: [P(x - hw, yt), P(x + hw, yt), P(x + hw, yb), P(x - hw, yb)].map(p => [p.lat, p.lng]) });
    netMains.push([P(x, yt - 12), P(x, yb - 12)].map(p => [p.lat, p.lng]));
    netBranches.push([P(x, yt - 12), P(x, yb - 12)].map(p => [p.lat, p.lng]));
    netValves.push({ ll: [P(x, yt + 18).lat, P(x, yt + 18).lng], mi: zi });
  }
}
const netSnap = { partitions: netParts, routeGeometry: { mains: netMains, branches: netBranches, valves: netValves } };
const snapAudit = D.auditSnapshot(netSnap);
ok(snapAudit.counts && snapAudit.counts.zones === 12 && snapAudit.counts.branches === 12,
  '[v1084j] 快照审计数出 12 框 / 12 支管（实测 ' +
  (snapAudit.counts ? snapAudit.counts.zones + ' / ' + snapAudit.counts.branches : '无') + '）');
ok(snapAudit.verdict && snapAudit.verdict.systematic === true &&
  Math.abs(snapAudit.verdict.medianStartOver - 12) < 0.5,
  '[v1084j] 快照里管路整体上移 12m ⇒ 判系统性、中位 +12m（实测 ' +
  (snapAudit.verdict ? snapAudit.verdict.medianStartOver.toFixed(1) : '无') + '）');
ok(typeof snapAudit.text === 'string' && snapAudit.text.indexOf('结论：') > 0,
  '[v1084j] 快照审计也给出人可读的报告文本');

/* ---------- 版本纪律 ---------- */
const m = /^const VERSION = '(v[\w-]+)';/m.exec(sw);
ok(!!m && /^v\d{3,4}-[\w-]+$/.test(m[1]), '[v1084f] sw VERSION 形如 vNNNN- slug：' + (m && m[1]));
const want = m ? m[1].replace(/^v/, '') : '';
ok(html.split('?v=' + want).length - 1 === 17, '[v1084f] index.html 版本串 17 处同值');

console.log(process.exitCode ? '\n[v1084f] 有断言失败' : '\n[v1084f] 全部通过');
