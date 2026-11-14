#!/usr/bin/env node
/* v1084c —— 轮灌演示「总管明明贴在节点上却 12 区全挂」的根因回归锁。
 *
 * 用户实测（2026-11-14 截图）：3 列 × 4 行 = 12 区、3 根主管、12 个阀门，
 * 总管从 N-01 一路拉到 N-03（三个节点都落在线上），点「演示轮灌」却报
 * 「未接通 12 处 —— 第1区/第2区/第3区：支管两端都没进入水路」，
 * 而且（v1084b 起）诊断里连一条具体原因都写不出来。
 *
 * 根因：同一件事有两套判据
 *   · validateConnection.strictNodeEntry：只认「总管折点顶点」距节点 ≤1.5m（质检过关）
 *   · buildFlowRoutes coupler：顶点过滤 + 节点到主管垂距 ≤0.5m（两道门，任一不过就
 *     静默丢弃该节点）⇒ 0 个 coupler ⇒ 根节点成孤岛 ⇒ 全图不可达 ⇒ 12 区全报未覆盖
 * 修复：两处统一为「点到线段垂距 ≤ NODE_ATTACH_EPS_M」，穿过即接通，判据只留一份。
 *
 * 本文件用与用户地块同构的合成数据锁死：这种布局必须能建出 24 条路线、12 区全覆盖。
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

/* 锁1：判据只有一份（两处都用线段垂距，不再出现折点顶点判据） */
ok(!/o\.raw\.some\(function\(p\)\{return gap\(xy\(p\),xy\(n\.ll\)\)<=NODE_ATTACH_EPS_M;\}\)/.test(demo),
  '[v1084c] buildFlowRoutes 的「折点顶点」前置过滤已删除');
ok(/function distToLineM\(line,p\)/.test(demo) && /distToLineM\(line,n\.ll\)<=NODE_ATTACH_EPS_M/.test(demo),
  '[v1084c] validateConnection 改为点到线段垂距（与建图同口径）');
ok(/var p=project\(o,n\.ll\);if\(p\.d<=NODE_ATTACH_EPS_M/.test(demo),
  '[v1084c] 建图侧仍用 project() 垂距（同一套等距投影数学）');

/* 锁2：5 个静默口子全部说话 */
ok(/diag\.missing\+\+;diag\.zones\.push\(\{zi:t\.zi,reason:'路径回溯不到水源根/.test(demo),
  '[v1084c] 第 5 个静默 return（路径回溯失败）已记账');

/* 锁3：观测三件 */
ok(/diag\.debug=\{zi:i,mainLen:/.test(demo), '[v1084c] diag.debug 记录首区真实数字');
ok(/lastDiag\.couplers=\(lastDiag\.couplers\|\|0\)\+1/.test(demo), '[v1084c] 统计总管实际接上几个节点');
ok(/diag\.graphNodes=Object\.keys\(graph\)\.length/.test(demo), '[v1084c] 图体检（节点数/根度数/目标在不在图里）');
ok(/function demoDebugText\(diag,d\)/.test(demo), '[v1084c] 【数据】一行渲染函数在位');

/* 锁4：功能直测 —— 与用户地块同构的 12 区，必须全通 */
global.window = {}; global.document = {};
new Function(demo)();
const D = global.window.RyMapFlowDemo;
const LAT0 = 38.725, LNG0 = 107.24671, K = 111320 * Math.cos(LAT0 * Math.PI / 180);
/* 注意：这里刻意用「总管只有首尾两个折点」——正是用户那种「一条直线拉过去」的画法 */
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

const v = D.whyNot(0, d);
ok(v.gate !== 'collect', '[v1084c] 合成地块不被 collect 门拦');
ok(v.code === 'connected', '[v1084c] 总管穿过节点即判接通（code=' + v.code + '）');

const routes = D.buildRoutes(d, 0, true);
ok(!!routes, '[v1084c] 建图成功（v1084c 前此处为 null —— 12 区全挂的直接原因）');
ok(routes && routes.length === 24, '[v1084c] 12 区 × 支管两端 = 24 条路线（实测 ' + (routes ? routes.length : 0) + '）');

const covered = {};
(routes || []).forEach(r => {
  if (r.branch && r.branch.some(s => s.key.indexOf('branch:') === 0)) covered[r.zi] = (covered[r.zi] || 0) + 1;
});
const bad = [];
for (let i = 0; i < 12; i++) if (covered[i] !== 2) bad.push(i + 1);
ok(bad.length === 0, '[v1084c] 12 区全部覆盖 2/2（未覆盖：' + (bad.length ? bad.join(',') : '无') + '）');
ok((D.lastDiagnostics().zones || []).length === 0, '[v1084c] 正常地块不产生诊断噪声');

/* 锁5：反向 —— 总管整体挪开 3m 时必须仍然报未接通（不能为了"通"而放水） */
const farTrunk = [P(-40, -3), P(160, -3)];
const dFar = Object.assign({}, d, { trunkLL: farTrunk, trunkLinesLL: [farTrunk] });
const vFar = D.whyNot(0, dFar);
ok(vFar.code === 'node-not-connected', '[v1084c] 总管离节点 3m 仍判未接通（容差没放水）');

/* 锁6：版本纪律 */
const m = /^const VERSION = '(v[\w-]+)';/m.exec(sw);
ok(!!m && /^v\d{3,4}-[\w-]+$/.test(m[1]), '[v1084c] sw VERSION 形如 vNNNN- slug：' + (m && m[1]));
const want = m ? m[1].replace(/^v/, '') : '';
ok(html.split('?v=' + want).length - 1 === 17, '[v1084c] index.html 版本串 17 处同值');

console.log(process.exitCode ? '\n[v1084c] 有断言失败' : '\n[v1084c] 全部通过');
