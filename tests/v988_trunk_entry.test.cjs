'use strict';
/* tests/v988_trunk_entry.test.cjs —— 轮灌演示「断流/不经过上游区」修复锁（2026-11-05）
 *
 * 用户地块实测：接驳点列表为空（couplers=[]），连通性验证按「主管端点贴近总管 ≤tol」
 * 通过、演示能开始；但找路图里只有接驳节点/施工节点能连总管 ⇒ 图全断 ⇒ routes=null
 * 走兜底动画（只亮本区、无源头路径）= 用户看到的「断流、3 区不经过 2 区」。
 *
 * v988 修复：buildFlowRoutes 补「总管↔主管贴近直连」——主管两端点投影到任一总管
 * 折线 ≤TOL_M 即在垂足打通（与验证同口径）。四把锁：
 *   ① 源码补边块与口径注释存在；
 *   ② 真实拓扑复现（couplers 空 + 主管链完好）：第 3 区路线必须经过第 1、2 列主管；
 *   ③ 第 4 区路线必须串过前三列；
 *   ④ 已放接驳节点的老地块行为不变（节点路径照常）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const demo = fs.readFileSync(path.join(ROOT, 'mod', 'map-flow-demo.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

function loadDemo() {
  let src = demo.replace('})(window);',
    ';window.__RY_DBG={buildFlowRoutes:buildFlowRoutes,collect:collect,setCtx:function(c){ctx=c;}};})(window);');
  const sandbox = { console, setInterval, clearInterval };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'map-flow-demo.js' });
  return { DBG: sandbox.window.__RY_DBG, sandbox };
}

/* 用户真实拓扑（2026-11-05 导出）：3 行 × 4 列，主管链完好，总管在左边缘 */
function realWorldData() {
  const mains = [
    [[-2.4,-167.9],[125.1,-161.2]],[[125.1,-161.2],[259.6,-154.2]],[[259.6,-154.2],[394,-147.1]],[[394,-147.1],[518.1,-140.6]],
    [[-9.1,-7.8],[116.8,-1.2]],[[116.8,-1.2],[251.2,5.8]],[[251.2,5.8],[385.6,12.8]],[[385.6,12.8],[510.2,19.4]],
    [[-15.1,135.7],[109.2,142.2]],[[109.2,142.2],[243.7,149.3]],[[243.7,149.3],[378.1,156.3]],[[378.1,156.3],[503.2,162.9]]
  ].map(l=>l.map(p=>({x:p[0],y:p[1]})));
  const branches = [
    [[-2.3,-147.8],[116,-141.6]],[[132.2,-140.8],[250.5,-134.6]],[[266.6,-133.7],[384.9,-127.5]],[[401,-126.7],[510.4,-121]],
    [[-9.9,12.2],[107.6,18.3]],[[123.8,19.2],[242.1,25.4]],[[258.2,26.2],[376.5,32.4]],[[392.6,33.3],[502.1,39]],
    [[-16,155.7],[100.1,161.8]],[[116.3,162.6],[234.6,168.8]],[[250.7,169.7],[369,175.9]],[[385.1,176.7],[494.5,182.5]]
  ].map(l=>l.map(p=>({x:p[0],y:p[1]})));
  const valves = [[56.9,-144.7],[191.3,-137.7],[325.7,-130.6],[460.2,-123.6],[48.5,15.2],[182.9,22.3],[317.4,29.3],[451.8,36.4],[41,158.7],[175.4,165.7],[309.8,172.8],[444.3,179.8]]
    .map(p=>({x:p[0],y:p[1]}));
  const trunkLL = [{lat:-260,lng:-4},{lat:-160,lng:-4.5},{lat:0,lng:-10},{lat:145,lng:-16},{lat:260,lng:-17}]
    .map(p=>({lat:p.lat/110540, lng:p.lng/111320}));
  const toLL = p => ({ lat: p.y/110540, lng: p.x/111320 });
  return { mains, branches, valves, trunkLL, toLL };
}

function seqKeys(route) {
  const seq = [];
  route.trunk.concat(route.main).concat(route.branch).forEach(s => seq.push(s.key));
  return seq;
}

test('① 源码锁：总管↔主管贴近直连块（端点+线体双口径）存在', () => {
  assert.ok(/总管↔主管贴近直连（口径与 validateConnection 对齐）/.test(demo), 'v988/v989 口径注释丢了');
  assert.ok(/var id='trunk-entry:'\+mk\+':body:'\+ti;/.test(demo), '线体口径补边 id 丢了（v989）');
  assert.ok(/var id2='trunk-entry:'\+mk\+':body-end:'\+tj;/.test(demo), '末端补扫 id 丢了（v989）');
  assert.ok(/for\(var s=0;s<=m\.len&&!done;s\+=step\)\{/.test(demo), '线体 2m 步长扫描丢了（v989）');
  assert.ok(/if\(tp\.d<=TOL_M\)\{/.test(demo), '贴近容差必须沿用 TOL_M（与连通性验证同口径）');
  assert.ok(/addCut\(m,s,id\);addCut\(t,tp\.s,id\);|addCut\(m,s,id\);addCut\(byTrunk\[ti\],tp\.s,id\);/.test(demo),
    '同一 id 要切进主管与总管（零权相连）');
  assert.ok(/debugGraph: function \(g\) \{/.test(demo), 'v989 只读诊断出口 debugGraph 丢了');
});

test('② 真实拓扑（couplers 空）：第 3 区路线经过第 1、2 区主管', () => {
  const { DBG, sandbox } = loadDemo();
  const w = realWorldData();
  DBG.setCtx({ toLL: w.toLL, getTrunkLines: () => [w.trunkLL],
    getWaterSource: () => ({ lat: -258/110540, lng: -4/111320 }), tip: () => {} });
  const dd = { world: 'meter', mainPipes: w.mains, branchPipes: w.branches, valves: w.valves,
    couplerNodes: [], combinedN: 1, segTrunk: null };
  sandbox.window.tlDiagramData = dd;
  sandbox.window.tlManualGroups = [[0,4,8],[1,5,9],[2,6,10],[3,7,11]];
  const d = DBG.collect();
  assert.ok(d, 'collect() 不应为 null');
  const routes = DBG.buildFlowRoutes(d, 2);
  assert.ok(routes && routes.length, '第 3 区 routes 不应为 null（修复前断流）');
  const zs = routes.filter(r => r.zi === 2);
  assert.ok(zs.length, 'zi=2 应有路线');
  const keys = seqKeys(zs[0]);
  assert.ok(keys.indexOf('main:0') >= 0, '第 3 区路线必须经过第 1 区主管 main:0');
  assert.ok(keys.indexOf('main:1') >= 0, '第 3 区路线必须经过第 2 区主管 main:1');
  assert.ok(keys.indexOf('main:2') >= 0, '第 3 区路线要到达本区主管 main:2');
});

test('③ 真实拓扑：第 4 区路线串过第 1、2、3 区主管', () => {
  const { DBG, sandbox } = loadDemo();
  const w = realWorldData();
  DBG.setCtx({ toLL: w.toLL, getTrunkLines: () => [w.trunkLL],
    getWaterSource: () => ({ lat: -258/110540, lng: -4/111320 }), tip: () => {} });
  const dd = { world: 'meter', mainPipes: w.mains, branchPipes: w.branches, valves: w.valves,
    couplerNodes: [], combinedN: 1, segTrunk: null };
  sandbox.window.tlDiagramData = dd;
  sandbox.window.tlManualGroups = [[0,4,8],[1,5,9],[2,6,10],[3,7,11]];
  const d = DBG.collect();
  const routes = DBG.buildFlowRoutes(d, 3);
  assert.ok(routes && routes.length, '第 4 区 routes 不应为 null');
  const zs = routes.filter(r => r.zi === 3);
  assert.ok(zs.length, 'zi=3 应有路线');
  const keys = seqKeys(zs[0]);
  ['main:0','main:1','main:2','main:3'].forEach(k =>
    assert.ok(keys.indexOf(k) >= 0, '第 4 区路线必须串过 ' + k));
});

test('④ 老地块行为不变：已放接驳节点时节点路径照常', () => {
  const { DBG, sandbox } = loadDemo();
  const w = realWorldData();
  DBG.setCtx({ toLL: w.toLL, getTrunkLines: () => [w.trunkLL],
    getWaterSource: () => ({ lat: -258/110540, lng: -4/111320 }), tip: () => {} });
  const couplers = [0, 4, 8].map(mi => {
    const line = w.mains[mi];
    return { pipeKey: 'm' + (mi + 1), s: 2, x: line[0].x + 2, y: line[0].y };
  });
  const dd = { world: 'meter', mainPipes: w.mains, branchPipes: w.branches, valves: w.valves,
    couplerNodes: couplers, combinedN: 1, segTrunk: null };
  sandbox.window.tlDiagramData = dd;
  sandbox.window.tlManualGroups = [[0,4,8],[1,5,9],[2,6,10],[3,7,11]];
  const d = DBG.collect();
  const routes = DBG.buildFlowRoutes(d, 2);
  assert.ok(routes && routes.length, '有节点的地块第 3 区仍应有路线');
  const zs = routes.filter(r => r.zi === 2);
  const keys = seqKeys(zs[0]);
  assert.ok(keys.indexOf('main:1') >= 0, '节点场景下第 3 区依旧要经过第 2 区主管');
});

test('⑤ 版本锁：index.html 14 处与 sw.js VERSION 动态同抬（v989-trunk-body）', () => {
  const m = sw.match(/const VERSION = '(v\d+[^']*)';/);
  assert.ok(m, 'sw.js 缺 VERSION');
  const num = m[1].replace(/^v/, '');
  assert.strictEqual(html.split('?v=' + num).length - 1, 14, 'index.html 应有 14 处 ?v=' + num);
  assert.ok(/v989-trunk-body/.test(m[1]), '本次应为 v989-trunk-body');
});

test('⑥ v989 新场景：总管中段横穿、端点距离 >5m——线体口径必须接通', () => {
  const { DBG, sandbox } = loadDemo();
  const w = realWorldData();
  /* 总管竖线在平面 x=60m 处纵穿全场：横穿主管 0（y=-167.9，x∈[-2.4,125.1]）的中段，
     且距所有主管端点都远（主管 0 端点 x=-2.4/125.1 距竖线 62m+）——v988 端点口径接不通，
     v989 线体口径（与验证的「线体×线体」一致）必须接通。 */
  const trunkLL = [{lat:-300/110540, lng:60/111320},{lat:300/110540, lng:60/111320}];
  const toLL = p => ({ lat: p.y/110540, lng: p.x/111320 });
  DBG.setCtx({ toLL, getTrunkLines: () => [trunkLL],
    getWaterSource: () => ({ lat: -280/110540, lng: 60/111320 }), tip: () => {} });
  const dd = { world: 'meter', mainPipes: w.mains, branchPipes: w.branches, valves: w.valves,
    couplerNodes: [], combinedN: 1, segTrunk: null };
  sandbox.window.tlDiagramData = dd;
  sandbox.window.tlManualGroups = [[0,4,8],[1,5,9],[2,6,10],[3,7,11]];
  const d = DBG.collect();
  const routes = DBG.buildFlowRoutes(d, 2);
  assert.ok(routes && routes.length, '中段穿越场景第 3 区不应再断流（v988 端点口径接不通）');
  const zs = routes.filter(r => r.zi === 2);
  const keys = seqKeys(zs[0]);
  assert.ok(keys.indexOf('main:1') >= 0, '中段穿越场景第 3 区也要经过第 2 区主管');
});
