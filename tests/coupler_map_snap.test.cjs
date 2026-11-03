'use strict';
/* [v914 2026-11-03] 步骤 2b：接驳节点接入地图捕捉 + trunk-edge 补滤。
   锁四件事：
     1. buildTargets 收 mainCouplers → kind 'main-coupler'（label 透传，非法坐标跳过）
     2. main-coupler 优先级 4 —— 与 seg-coupler 同档，10px 内压过 mainpipe-edge(8)/阀门(5)
     3. excludeTrunkId 过滤 trunk-edge 线段（v911 审核记过#2 收口），label 编号与 v911 一致
     4. 宿主接线：online-map 采 dd.couplerNodes（失配坐标跳过）+ edit 态传 excludeTrunkId；
        设计页面板 ppCouplerLL 经纬度真值链在位
   附录：任务清单 §5.5/§9.4 步骤 2b；handoff §26.134。 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/* trunk-snap.js 是 UMD（window 注入），Node 里用 new Function 造 window 取 RyTrunkSnap
   （与 tests/trunk_snap.test.cjs 同款加载方式） */
const snapSrc = fs.readFileSync(path.join(ROOT, 'mod', 'trunk-snap.js'), 'utf8');
const snap = new Function('window', snapSrc + '\nreturn window.RyTrunkSnap;')({});

function setupTargets(input) {
  const list = snap.buildTargets(input);
  snap.setTargets(list, null);
  snap.setProjector(p => ({ x: p.lng * 1000, y: p.lat * 1000 }));   /* 恒等线性投影（测试专用） */
  snap.setUnprojector(p => ({ lat: p.y / 1000, lng: p.x / 1000 }));
  snap.setEnabled(true);
  return list;
}

test('[v914] buildTargets 收 mainCouplers：kind/label/非法坐标跳过', () => {
  const list = snap.buildTargets({
    mainCouplers: [
      { lat: 30.001, lng: 120.001, label: '主管节点 m1 · 距起点 20m' },
      { lat: 'x', lng: 120 },          /* 非法 lat → 跳过 */
      { lat: 30.002, lng: 120.002 }    /* 无 label → 默认 '主管节点 n' */
    ]
  });
  const mc = list.filter(t => t.kind === 'main-coupler');
  assert.equal(mc.length, 2, '非法坐标必须跳过，只剩 2 个节点');
  assert.equal(mc[0].label, '主管节点 m1 · 距起点 20m', '宿主 label 必须透传');
  assert.equal(mc[1].label, '主管节点 2', '缺 label 时给默认编号');
  assert.equal(snap.prioOf('main-coupler'), 4, 'main-coupler 必须注册优先级 4（禁落 99 垫底档，v872 同款坑）');
});

test('[v914] 同距竞争：main-coupler(4) 压过 mainpipe-edge(8) 与 valve-node(5)', () => {
  setupTargets({
    mainCouplers: [{ lat: 30, lng: 120, label: '节点' }],
    valves: [{ lat: 30.00001, lng: 120 }],
    mainPipeLines: [[[30.00001, 120.00001], [30.00001, 120.00002]]]
  });
  const hit = snap.nearest({ lat: 30, lng: 120 }, 20);
  assert.ok(hit, '必须有命中');
  assert.equal(hit.kind, 'main-coupler', '节点是设计落点，必须压过顺路的阀门与主管线段');
});

test('[v914] excludeTrunkId 过滤 trunk-edge 线段（v911 记过#2 收口）', () => {
  const T1 = { id: 't1', points: [[30, 120], [30.001, 120.001]] };
  const T2 = { id: 't2', points: [[30.1, 120.1], [30.101, 120.101]] };

  /* 不传 excludeTrunkId：两条 trunk-edge 都在 */
  setupTargets({ savedTrunks: [T1, T2] });
  assert.equal(snap.stats().byKind['trunk-edge'], 2, '无 exclude 时两条各 1 段');

  /* exclude t1：只剩 t2 的段 */
  setupTargets({ savedTrunks: [T1, T2], excludeTrunkId: 't1' });
  assert.equal(snap.stats().byKind['trunk-edge'], 1, '被编辑线的 trunk-edge 必须过滤');

  /* label 编号保持 v911 口径「总管 <原序号> · 段 n」——t2 仍是 总管 2 */
  const seg = snap.stats();
  assert.ok(seg.total >= 1);
  const list = snap.buildTargets({ savedTrunks: [T1, T2], excludeTrunkId: 't1' });
  const t2seg = list.filter(t => t.kind === 'trunk-edge')[0];
  assert.equal(t2seg.label, '总管 2 · 段 1', 'label 编号必须与 v911 逐字节一致');

  /* exclude t2：只剩 t1；字符串/数字 id 均可比（String() 归一） */
  setupTargets({ savedTrunks: [T1, T2], excludeTrunkId: 2 });
  /* id 't2' vs excludeTrunkId 2 → String 不等，不过滤（宿主传的是真实 id） */
  assert.equal(snap.stats().byKind['trunk-edge'], 2, 'id 不同型不可误滤');

  /* 点目标拐点同步过滤的既有行为回归（:102） */
  setupTargets({ savedTrunks: [T1, T2], excludeTrunkId: 't1' });
  assert.equal(snap.stats().byKind['trunk-vertex'], 2, '拐点过滤行为不回归（t1 两拐点滤掉，t2 保留）');
});

test('[v914] 宿主接线：online-map 采 dd.couplerNodes + edit 态 excludeTrunkId；设计页 ppCouplerLL', () => {
  const omSrc = fs.readFileSync(path.join(ROOT, 'mod', 'online-map.js'), 'utf8');
  const peSrc = fs.readFileSync(path.join(ROOT, 'mod', 'plot-editor.js'), 'utf8');
  const idxSrc = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

  assert.ok(/\?dd\.couplerNodes:\[\]\)\.forEach/.test(omSrc),
    'extraSnapTargets 必须遍历 dd.couplerNodes');
  assert.ok(/if\(!n\|\|n\.x==null\|\|n\.y==null\) return;/.test(omSrc),
    '失配节点（坐标 null，v913 missing）必须静默跳过');
  assert.ok(/mainCouplers\.length\) input\.mainCouplers=snapExtras\.mainCouplers/.test(omSrc),
    'refreshSnapTargets 必须把 mainCouplers 传进 buildTargets');
  assert.ok(/trunkMode==='edit'&&activeTrunkId!=null\) input\.excludeTrunkId=activeTrunkId/.test(omSrc),
    'edit 态必须传 excludeTrunkId（否则自吸死锁）');

  assert.ok(/function ppCouplerLL\(/.test(peSrc), '设计页缺节点经纬度换算');
  assert.ok(/G\.autoSign\(ctx\.dd\.poly,plot\.polyLatLng,base\)/.test(peSrc),
    '±y 方向必须走 autoSign 标尺（禁猜符号）');
  assert.ok(/ppCouplerLLMemo/.test(peSrc), 'autoSign 必须 memo（拖动 mousemove 每帧调用）');
  assert.ok(/llEl\.textContent=ll\.lat\.toFixed\(6\)\+\', \'\+ll\.lng\.toFixed\(6\)/.test(peSrc.replace(/\r\n/g, '\n')),
    '面板必须把经纬度写进 .pp-coupler-lng');
  assert.ok(idxSrc.indexOf('pp-coupler-lng') > 0, '面板 DOM 缺经纬度占位 span');
});

test('[v917] 宿主接线：三级 N 节点按有效管线桩号投影为地图捕捉点', () => {
  const omSrc = fs.readFileSync(path.join(ROOT, 'mod', 'online-map.js'), 'utf8');
  const flowSrc = fs.readFileSync(path.join(ROOT, 'mod', 'map-flow-demo.js'), 'utf8');
  assert.ok(/window\.RyTlNodes/.test(omSrc) && /A\.pointAt\(n\.pid,dd,Number\(n\.atM\)\)/.test(omSrc),
    '在线地图必须通过 RyTlNodes + RyTlAutoEdits.pointAt 读取施工节点位置');
  assert.ok(/label:'施工节点 '\+String\(n\.id\|\|''\)/.test(omSrc), '吸附提示应显示节点ID');
  assert.ok(/collectWorkspaceNodes\(dd,tlNodes\.list\(\),autoEdits\.pointAt,toLLSafe\)/.test(flowSrc),
    '水路校验与演示必须读取同一批施工节点');
});

test('[v918] 节点常显标记：地图上手绘总管前可见「节点在哪」（真机反馈缺口）', () => {
  const omSrc = fs.readFileSync(path.join(ROOT, 'mod', 'online-map.js'), 'utf8');
  /* ① refreshSnapTargets 无条件重建标记层（含无地块时清层） */
  assert.ok(/renderCouplerMarkers\(snapExtras\);\s*\n\s*return rc;/.test(omSrc),
    'refreshSnapTargets 末尾必须调用 renderCouplerMarkers（snapExtras=null 时清层）');
  /* ② 双环样式与演示层入口同语言：外环 #b45309 fillOpacity:0 + 橙芯 #f59e0b */
  assert.ok(/radius:9,\s*color:'#b45309',\s*weight:2\.5,\s*fillOpacity:0,\s*interactive:false/.test(omSrc),
    '外环参数必须与演示入口标记同语言');
  assert.ok(/radius:5,\s*color:'#ffffff',\s*weight:2,\s*fillColor:'#f59e0b',\s*fillOpacity:1,\s*interactive:false/.test(omSrc),
    '橙芯参数错误');
  /* ③ 永久 tooltip 常显标签 + 不吃绘制点击 + 不挡地图操作 */
  assert.ok(/bindTooltip\(n\.label\|\|'主管节点',\{[\s\S]*?permanent:true/.test(omSrc),
    '标签必须常显（permanent）——用户靠它分辨 m1/m2 与桩号');
  assert.ok(/interactive:false/.test(omSrc), '标记必须 interactive:false（不吃绘制点击）');
  assert.ok(/\.ry-coupler-tip\{pointer-events:none/.test(omSrc),
    'tooltip CSS 必须 pointer-events:none（不挡地图操作）');
  /* ④ 无主标注兜底 */
  assert.ok(/n\.label\|\|'主管节点'/.test(omSrc), 'label 缺失须有兜底文案');
});
