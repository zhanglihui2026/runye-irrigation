#!/usr/bin/env node
/* v1084b —— 只加「诊断」，不动任何画图/建图逻辑。
 *
 * 起因（2026-11-14）：用户在 v1053 / v1030 上仍报「动画还是不能演示」，提示条只给
 * 通用建议（「请检查手绘总管、捕捉节点、主管、分区阀门和支管连接」），看不出是哪一区、
 * 缺什么 ⇒ 只能靠「退一个版本试一次」来猜，越猜越乱。
 *
 * 本版两件事：
 *   ① mergeDiagForTip：按 allCovered 逐区补原因（切口与端点重合 ⇒ 段长 0 ⇒ diag 空）；
 *   ② whyNot() / whyNotText()：控制台一句话问清「卡在哪一道门、计数多少、哪几区没覆盖完」；
 *   ③ 失败提示把【诊断】放到最前（提示条 max-height:25vh 可滚动，建议在后等于没写）。
 *
 * 明确不动：buildFlowRoutes / 管路几何 / 双世界投影 / 发布快照 / 水力 —— 一行都没改。
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

/* 锁1：源码锚点 */
ok(/function mergeDiagForTip\(diag,allCovered,total\)/.test(demo), '[v1084b] mergeDiagForTip 在位');
ok(demo.includes('mergeDiag: mergeDiagForTip'), '[v1084b] mergeDiag 导出（单测直测）');
ok(demo.includes('var dgTip=mergeDiagForTip(diagAll,allCovered,d.total);'), '[v1084b] 失败提示按 allCovered 补齐诊断');
ok(/if\(ctx\.tip\)ctx\.tip\(demoDiagText\(dgTip\)/.test(demo), '[v1084b] 诊断放在提示最前（先原因后建议）');
ok(!/ctx\.tip\('当前地块尚未形成覆盖所有分区支管两端的连续管路/.test(demo),
  '[v1084b] 旧「只有通用建议」的提示已撤');
ok(/whyNot: function \(g, dInj\)/.test(demo) && /whyNotText: function \(g, dInj\)/.test(demo),
  '[v1084b] whyNot / whyNotText 导出');

/* 锁2：不动建图与几何（防"修诊断顺手改了逻辑"） */
ok(/function buildFlowRoutes\(d,g,allZones\)/.test(demo), '[v1084b] buildFlowRoutes 入口未变');
ok(demo.includes('var FIT_DEDUPE_M = 0.25'), '[v1084b] 配件去重口径未变（仍 0.25m）');
ok(!/displayMains/.test(demo) || demo.includes('displayMainsLL'), '[v1084b] 未引入新的坐标世界');

/* 锁3：功能直测 */
global.window = {}; global.document = {};
new Function(demo)();
const D = global.window.RyMapFlowDemo;

/* 3a mergeDiag */
const m1 = D.mergeDiag({ zones: [{ zi: 2, reason: '没有分区阀门' }], fittings: { placed: 1 } },
  { 0: 2, 1: 2, 2: 0, 3: 1 }, 4);
ok(m1.zones.length === 2, '[v1084b] 已有一条 + 补一条 = 2 条（已达 2 的区不产生噪声）');
ok(m1.zones.some(z => z.zi === 2 && /没有分区阀门/.test(z.reason)), '[v1084b] 原条目不被覆盖（同区不重复补）');
ok(!m1.zones.some(z => z.zi === 0 || z.zi === 1), '[v1084b] 两端都通的区不入诊断');
ok(m1.zones.some(z => z.zi === 3 && /只通一端/.test(z.reason)), '[v1084b] allCovered=1 → 「只通一端」');
const m0 = D.mergeDiag({ zones: [] }, { 0: 0 }, 1);
ok(m0.zones.length === 1 && /支管两端都没进入水路/.test(m0.zones[0].reason),
  '[v1084b] allCovered=0 且无条目 → 「支管两端都没进入水路」');
ok(/^ 【诊断】/.test(D.diagText(m1)) && /第4区/.test(D.diagText(m1)), '[v1084b] 文案以【诊断】开头并点名分区');

/* 3b whyNot：无数据（未注入、页面无简图） */
const w0 = D.whyNot();
ok(w0.ok === false && w0.gate === 'collect', '[v1084b] 无简图 → gate=collect');
ok(/tlDiagramData/.test(w0.hint), '[v1084b] 无简图时把人话说清（点名 tlDiagramData）');

/* 3c whyNot：注入合成数据（走真校验链，不该抛错） */
const P = (a, b) => ({ lat: a, lng: b });
const base = {
  trunkLL: [P(30.00005, 100.00055), P(30, 100.00055)],
  trunkLinesLL: [[P(30.00005, 100.00055), P(30, 100.00055)]],
  mainsLL: [[P(30.00005, 100.00055), P(30.00025, 100.00055)]],
  branchLL: [[P(30.0001, 100.00045), P(30.0001, 100.00065)]],
  nodesLL: [{ kind: 'main', mi: 0, ll: P(30.00005, 100.00055), pipeKey: 'm1' }],
  couplersLL: [], segLL: null, valves: [{ ll: P(30.0001, 100.00055), anchorLL: null, mi: 0, tier: 'zone' }],
  fittings: [], total: 1, manual: null, nPer: 1, gCount: 1
};
const w1 = D.whyNot(0, base);
ok(!!w1 && typeof w1.gate === 'string' && w1.gate !== 'collect', '[v1084b] 注入数据后不再走 collect 门');
ok(w1.counts && w1.counts.mains === 1 && w1.counts.branches === 1 && w1.counts.valves === 1,
  '[v1084b] counts 如实报主管/支管/阀门条数');
ok(Array.isArray(w1.zones), '[v1084b] zones 始终是数组（未过校验时不填，调用方不必判空）');
/* [v1084c] 判据统一后，本合成场景（总管穿过节点 ≤1.5m）已判「接通」，不再卡 validation。
   用一条 3m 外擦过的总管制造真正的 validation 失败，锁住「门禁名+code 一定要报出来」。 */
/* 总管整体东移约 3m（lng +0.00003°），在节点旁边擦过而不断开 → 真·未接通 */
const farTrunk = [P(30, 100.00058), P(30.00005, 100.00058)];
const far = Object.assign({}, base, { trunkLL: farTrunk, trunkLinesLL: [farTrunk] });
const wFar = D.whyNot(0, far);
ok(wFar.gate === 'validation' && !!wFar.code,
  '[v1084b] 未接通 → gate=validation 且给出 code（' + wFar.code + '）');

/* 3d whyNotText：一段可直接截图/粘贴的话 */
const t1 = D.whyNotText(0, base);
ok(/^【演示诊断】门禁=/.test(t1), '[v1084b] whyNotText 以【演示诊断】开头');
ok(/主管 1 \/ 支管 1 \/ 阀门 1/.test(t1), '[v1084b] whyNotText 带计数');
ok(/门禁=route/.test(t1) || /门禁=pass/.test(t1) || /门禁=validation/.test(t1), '[v1084b] whyNotText 带门禁名');

/* 锁4：版本纪律（动态读 sw VERSION） */
const m = /^const VERSION = '(v[\w-]+)';/m.exec(sw);
ok(!!m && /^v\d{3,4}-[\w-]+$/.test(m[1]), '[v1084b] sw VERSION 形如 vNNNN- slug：' + (m && m[1]));
const want = m ? m[1].replace(/^v/, '') : '';
ok(html.split('?v=' + want).length - 1 === 17, '[v1084b] index.html 版本串 17 处同值');

console.log(process.exitCode ? '\n[v1084b] 有断言失败' : '\n[v1084b] 全部通过');
