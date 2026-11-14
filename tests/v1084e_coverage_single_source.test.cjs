#!/usr/bin/env node
/* v1084e —— 「覆盖口径只许有一份」的回归锁。
 *
 * 背景（2026-11-14 连续排障的收尾）：v1084d 把覆盖判定从「数 branch: 边」改成
 * 「数到达目标点」，但只改了 start() 和 routesAll() 两处，控制台诊断 whyNot()
 * 里还留着旧口径。后果是**排查工具自己会撒谎**：
 *   · 控制台 `RyMapFlowDemo.whyNotText()` 报「12 区覆盖 0/2」
 *   · 点「演示轮灌」却正常播放
 * 这种分叉比没有诊断更糟 —— 用户会拿着错数字去改一张本来没问题的图。
 * v1084e 把口径抽成 coverageOf(routes,total) 纯函数，start / routesAll / whyNot
 * 三处共用，并把 whyNot 的 pass 判定与 start() 的四道条件逐一对齐。
 *
 * 本文件锁两件事：
 *   1）源码层：三处都调 coverageOf，whyNot 内不再出现按边种类计数的代码；
 *   2）行为层：主支管同列重合（v1079 起的正常布局）时，whyNot 与 buildRoutes
 *      必须给出同一个覆盖结果（旧口径在这里会得出 0/2）。
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

/* ---------- 锁1：口径唯一实现 ---------- */
ok(/function coverageOf\(routes,total\)/.test(demo), '[v1084e] coverageOf() 纯函数存在（覆盖口径唯一实现）');
ok(/var cov=coverageOf\(allRoutes,d\.total\),allCovered=cov\.covered;/.test(demo),
  '[v1084e] start() 走 coverageOf（不再就地数边）');
ok(/var wholeFieldClosed=!!allRoutes&&cov\.closed;/.test(demo),
  '[v1084e] start() 的 wholeFieldClosed 改读 cov.closed（与 coverageOf 同源）');
ok(/var cov = coverageOf\(routes, d\.total\);/.test(demo), '[v1084e] routesAll() 走 coverageOf');
ok(/var cov = coverageOf\(allRoutes, d\.total\);/.test(demo), '[v1084e] whyNot() 走 coverageOf');

/* ---------- 锁2：whyNot 内不许再有第二套口径 ---------- */
const whyNotBody = (function () {
  const i = demo.indexOf('whyNot: function (g, dInj) {');
  const j = demo.indexOf('whyNotText: function');
  return (i >= 0 && j > i) ? demo.slice(i, j) : '';
})();
ok(whyNotBody.length > 0, '[v1084e] 能取到 whyNot 函数体');
ok(whyNotBody && !/indexOf\('branch:'\)\s*===\s*0/.test(whyNotBody),
  '[v1084e] whyNot 内已无「数 branch: 边」的旧口径');
ok(whyNotBody && !/var covered = \{\};/.test(whyNotBody), '[v1084e] whyNot 内不再自建 covered 计数表');
ok(/out\.coverage\.incompleteInGroup/.test(whyNotBody), '[v1084e] whyNot 报出本组覆盖是否齐全');
ok(/cov\.closed && groupRoutes\.length && !incompleteInGroup && expected/.test(whyNotBody),
  '[v1084e] whyNot 的 pass 判定与 start() 四条件对齐');

/* ---------- 锁3：行为层 —— 重合布局下两个入口必须同结论 ---------- */
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
    branches.push([P(xC, yTop + 2), P(xC, yBot - 2)]);   /* 与主管同一条线：v1079 起的正常布局 */
    valves.push({ ll: P(xC, yTop + ROWH / 2), anchorLL: null, mi: zi, tier: 'zone' });
    if (row === 0) nodes.push({ kind: 'main', mi: zi, ll: P(xC, yTop), pipeKey: 'm' + (zi + 1) });
  }
}
const trunk = [P(-40, 0), P(160, 0)];
const dC = { trunkLL: trunk, trunkLinesLL: [trunk], mainsLL: mains, branchLL: branches, valves,
  fittings: [], nodesLL: nodes, couplersLL: [], segLL: null, total: 12, manual: null, nPer: 1, gCount: 4 };

const routes = D.buildRoutes(dC, 0, true);
ok(!!routes && routes.length === 24, '[v1084e] 重合布局建出 24 条路线（实测 ' + (routes ? routes.length : 0) + '）');

const perZone = {};
(routes || []).forEach(r => { if (r && r.zi != null) perZone[r.zi] = (perZone[r.zi] || 0) + 1; });
let buildBad = 0;
for (let i = 0; i < 12; i++) if (perZone[i] !== 2) buildBad++;

const w = D.whyNot(0, dC);
const whyBad = (w.zones || []).filter(z => z.covered !== 2).length;

ok(w.coverage && w.coverage.counted === 24, '[v1084e] whyNot 计数与 buildRoutes 一致：counted=' + (w.coverage && w.coverage.counted));
ok(w.coverage && w.coverage.wholeFieldClosed === true,
  '[v1084e] whyNot 判全程闭合（旧口径此处为 false，因为它数不到 branch: 边）');
ok(whyBad === 0 && buildBad === 0,
  '[v1084e] 两个入口覆盖结论一致（whyNot 未覆盖 ' + whyBad + ' 区 / 建图未覆盖 ' + buildBad + ' 区）');
ok(w.gate === 'pass', '[v1084e] whyNot gate=pass（能演示就必须报 pass，不能自相矛盾）');
ok(/本组覆盖≠2|可以演示/.test(w.hint || ''), '[v1084e] hint 说得清（' + (w.hint || '').slice(0, 40) + '）');

const txt = D.whyNotText(0, dC);
ok(/覆盖口径=按目标点数/.test(txt), '[v1084e] whyNotText 明写口径，避免下次又按边种类误读');

/* ---------- 锁4：版本纪律 ---------- */
const m = /^const VERSION = '(v[\w-]+)';/m.exec(sw);
ok(!!m && /^v\d{3,4}-[\w-]+$/.test(m[1]), '[v1084e] sw VERSION 形如 vNNNN- slug：' + (m && m[1]));
const want = m ? m[1].replace(/^v/, '') : '';
ok(html.split('?v=' + want).length - 1 === 17, '[v1084e] index.html 版本串 17 处同值');

console.log(process.exitCode ? '\n[v1084e] 有断言失败' : '\n[v1084e] 全部通过');
