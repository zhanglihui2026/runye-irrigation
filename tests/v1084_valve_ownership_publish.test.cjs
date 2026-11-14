#!/usr/bin/env node
/* v1084-valve-ownership-publish 回归锁：阀门/三通「归属」进发布快照 + 演示按归属建图 + 断点诊断。
 *
 * 用户原话（2026-11-14）：
 *   「之前把二级 三级的闸门跟层级取消了，导致所有东西都乱套了，这个地图上的
 *     轮灌区演示，到现在都查不清原因。」
 * 用户拍板方案 A：「阀门归属进快照」。
 *
 * 病根（三条，逐条锁死）：
 *   ① 发布快照 routeGeometry.valves 只有 {ll,anchorLL,mi}，没有层级，地图端分不清
 *      「分区阀门」和「管段阀门」，只能靠 0.5m 几何容差猜；
 *   ② 三级页插入的阀门/三通（RyTlAutoEdits.fits = {id,kind,pid,atM}，本来是精确归属）
 *      从未进过发布快照 —— 插了阀门对演示毫无影响，这就是"闸门层级被取消"的观感来源；
 *   ③ buildFlowRoutes 里「没主管/没支管/没阀门/阀门锚点不在主管上」全是静默 return，
 *      最后只报一句「尚未覆盖所有分区支管」，用户对着几十个区根本查不出是哪个区。
 *
 * 本版契约：
 *   · 发布：valves 带 tier:'zone'；新增 fittings[{id,kind,tier:'pipe',pid,pipeKind,mi,atM,lat,lng,displayLat,displayLng}]；
 *   · 演示：按 pipeKind+mi 找线、用 ll 投影定桩号（atM 兜底）切点入图，与已有切口 ≤0.25m 去重；
 *   · 诊断：lastDiagnostics() 逐区给出原因，失败提示用 diagText() 拼进 tip；
 *   · 兼容：老快照没有 fittings 字段 ⇒ 空数组，行为与 v1083 一致（不许因此拦演示）。
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

const in09 = read('mod/inline-09.js');
const demo = read('mod/map-flow-demo.js');
const sw = read('sw.js');
const html = read('index.html');

/* 锁1：发布侧 —— 归属与层级 */
ok(in09.includes('valves:[],nodes:[],fittings:[],segTrunk:null'),
  '[v1084] routeGeometry 快照带 fittings 字段（形状稳定，老读方不受影响）');
ok(in09.includes("routeGeometry.valves.push({ll:ll,anchorLL:anchor,mi:Number.isFinite(Number(v.mi))?Number(v.mi):i,tier:'zone'})"),
  '[v1084] 分区阀门显式标 tier=zone');
ok(in09.includes("if(publishEdits&&typeof publishEdits.fitsList==='function')"),
  '[v1084] 三级配件经 RyTlAutoEdits.fitsList 逐件发布');
ok(in09.includes("pipeKind:fm[1],mi:fIdx,atM:Number(f.atM)||0"),
  '[v1084] 配件带所属管线 pipeKind+mi+桩号（精确归属，不靠容差）');
ok(in09.includes("lat:fLL[0],lng:fLL[1],displayLat:fDispLL[0],displayLng:fDispLL[1]"),
  '[v1084] 配件同时发实体位与显示位（渲染/命中双世界口径）');
ok(in09.includes("catch(eFits){ console.warn('[publish] 配件归属发布失败（不影响管线/节点）',eFits); }"),
  '[v1084] 配件发布宽容失败：不因一个坏配件阻断整次定稿发布');

/* 锁2：演示侧 —— 读入与老快照兼容 */
ok(demo.includes("(Array.isArray(routeGeometry.fittings)?routeGeometry.fittings:[]).forEach"),
  '[v1084] collect 读 fittings，老快照缺字段按空数组');
ok(demo.includes('fittings: fittings,'), '[v1084] 快照对象透出 fittings');
ok(demo.includes('var FIT_DEDUPE_M = 0.25;'), '[v1084] 配件切口去重半径常量在位');
ok(demo.includes("addCut(o,s,'fit:'+(f.id||(f.pipeKind+':'+f.mi+':'+f.atM)));"),
  '[v1084] 配件按归属在所属管线上切点入图');
ok(demo.includes('var dup=o.cuts.some(function(c){return Math.abs(c.s-s)<=FIT_DEDUPE_M;});'),
  '[v1084] 与已有切口重合即复用（不把一段管子劈成 0.1m 碎片）');

/* 锁3：诊断 —— 静默分支全部改成带原因 */
ok(demo.includes("diag.zones.push({zi:i,reason:'没有主管管段'})"), '[v1084] 缺主管 → 记录原因');
ok(demo.includes("diag.zones.push({zi:i,reason:'没有支管管段'})"), '[v1084] 缺支管 → 记录原因');
ok(demo.includes("diag.zones.push({zi:i,reason:'没有分区阀门（阀门数组里缺 mi='"),
  '[v1084] 缺分区阀门 → 记录原因（并指出缺的是哪个 mi）');
ok(demo.includes("reason:'阀门/锚点不在本区主管上（垂距 '"),
  '[v1084] 阀门锚点不在主管上 → 记录垂距米数');
ok(demo.includes("reason:'水路走不到支管端（图在总管/主管/阀门处断开）'"),
  '[v1084] 目标不可达 → 记录断点');
ok(demo.includes('lastDiag={zones:[],fittings:{placed:0,dup:0,offLine:0,noPipe:0},active:0,missing:0,blocked:null};'),
  '[v1084] 每轮建图重置诊断');
ok(demo.includes('lastDiagnostics: function () { return lastDiag; }'),
  '[v1084] lastDiagnostics() 对外可读（探针/单测/宿主共用）');
ok(demo.includes("return bits.length?' 【诊断】'+bits.join('；')+'。':''"),
  '[v1084] diagText 把诊断翻成人话');
ok(/\+demoDiagText\(diagAll\)\);/.test(demo), '[v1084] 演示失败提示拼接诊断清单');

/* 锁4：功能 —— 用合成数据直测纯函数导出（不经地图） */
global.window = {}; global.document = {};
new Function(demo)();
const D = global.window.RyMapFlowDemo;
const P = (a, b) => ({ lat: a, lng: b });
const base = {
  trunkLinesLL: [[P(30.00005, 100.00055), P(30, 100.00055)]],
  mainsLL: [[P(30.00005, 100.00055), P(30.00025, 100.00055)]],
  branchLL: [[P(30.0001, 100.00045), P(30.0001, 100.00065)]],
  nodesLL: [{ kind: 'main', mi: 0, ll: P(30.00005, 100.00055), pipeKey: 'm1' }],
  segLL: null, total: 1, manual: null, nPer: 1
};

/* 4a：完整场景（含一件配属支管的阀门）→ 两条路线 + 配件 placed=1 */
const full = Object.assign({}, base, {
  valves: [{ ll: P(30.0001, 100.00055), anchorLL: null, mi: 0, tier: 'zone' }],
  fittings: [{ id: 'F01', kind: 'valve', pipeKind: 'branch', mi: 0, atM: 5, ll: P(30.0001, 100.00052) }]
});
const rFull = D.buildRoutes(full, 0, true);
ok(!!rFull && rFull.length === 2, '[v1084] 合成场景建图成功（支管两端各一条路线）');
ok(D.lastDiagnostics().fittings.placed === 1, '[v1084] 配件按归属入图 1 件');
ok((D.lastDiagnostics().zones || []).length === 0, '[v1084] 正常场景无诊断噪声');

/* 4b：缺分区阀门 → 不再是静默丢弃，必须点名「第几区 / 缺什么」 */
const noValve = Object.assign({}, base, { valves: [], fittings: [] });
ok(D.buildRoutes(noValve, 0, true) === null, '[v1084] 缺阀门时不建图（行为不变）');
const zA = D.lastDiagnostics().zones;
ok(zA.length === 1 && zA[0].zi === 0 && /没有分区阀门/.test(zA[0].reason),
  '[v1084] 缺阀门 → 诊断点名分区与原因');
ok(/第1区：没有分区阀门/.test(D.diagText(D.lastDiagnostics())), '[v1084] diagText 输出「第1区：没有分区阀门」');

/* 4c：阀门锚点离主管 13m → 报出垂距，而不是只说"未覆盖" */
const offMain = Object.assign({}, base, {
  valves: [{ ll: P(30.00037, 100.00055), anchorLL: P(30.00037, 100.00055), mi: 0 }], fittings: []
});
offMain.branchLL = [[P(30.00037, 100.00045), P(30.00037, 100.00065)]];
D.buildRoutes(offMain, 0, true);
const zB = D.lastDiagnostics().zones;
ok(zB.length === 1 && /垂距\s*\d+\.\d+m/.test(zB[0].reason), '[v1084] 锚点离主管 → 诊断带垂距米数');

/* 4d：老快照（无 fittings 字段）→ 仍能建图，不拦演示 */
const legacy = Object.assign({}, base, { valves: [{ ll: P(30.0001, 100.00055), anchorLL: null, mi: 0 }] });
ok(!!D.buildRoutes(legacy, 0, true), '[v1084] 老快照无 fittings 仍可建图（向后兼容）');
ok(D.lastDiagnostics().fittings.placed === 0, '[v1084] 老快照配件计数为 0，不误报');

/* 锁5：版本纪律（动态读 sw VERSION） */
const m = /^const VERSION = '(v[\w-]+)';/m.exec(sw);
ok(!!m && /^v\d{3,4}-[\w-]+$/.test(m[1]), '[v1084] sw VERSION 存在且形如 vNNNN- slug：' + (m && m[1]));
const want = m ? m[1].replace(/^v/, '') : '';
ok(html.split('?v=' + want).length - 1 === 17, '[v1084] index.html 版本串 17 处同值');

console.log(process.exitCode ? '\n[v1084] 有断言失败' : '\n[v1084] 全部通过');
