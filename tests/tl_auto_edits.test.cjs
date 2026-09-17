/* tl_auto_edits.test.cjs — 自动管线图面编辑层回归（node tests/tl_auto_edits.test.cjs）
 * 覆盖（2026-09-15 阶段2）：pid 体系 / applyTo 有效几何 / setLen 校验 /
 * 配件沿管弧长定位与 clamp / 几何签名绑定 / serialize-restore / LS 兜底 /
 * iso-diagram 消费（vm 同仓：打标、统计按有效几何、配件标记渲染）。 */
'use strict';
const assert = require('assert');

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

/* ---------- 测试数据工厂（与 iso_diagram.test.cjs 同口径） ---------- */
function mkData(opt) {
  opt = opt || {};
  const frontY = -20;
  const d = {
    version: 1, world: 'meter', generatedAt: '2026-09-15 10:00',
    plot: { w: 300, h: 200 },
    poly: [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 200 }, { x: 0, y: 200 }],
    zones: { cols: 3, rows: 2, xPos: [0, 100, 200, 300], yPos: [0, 100, 200] },
    frontPipe: [{ x: 0, y: frontY }, { x: 300, y: frontY }],
    sourcePos: { x: 0, y: frontY },
    mainPipes: [[{ x: 32, y: 0 }, { x: 32, y: 100 }], [{ x: 132, y: 0 }, { x: 132, y: 100 }], [{ x: 232, y: 0 }, { x: 232, y: 100 }],
                [{ x: 32, y: 100 }, { x: 32, y: 200 }], [{ x: 132, y: 100 }, { x: 132, y: 200 }], [{ x: 232, y: 100 }, { x: 232, y: 200 }]],
    branchPipes: [
      [{ x: 60, y: 6 }, { x: 60, y: 94 }], [{ x: 160, y: 6 }, { x: 160, y: 94 }], [{ x: 260, y: 6 }, { x: 260, y: 94 }],
      [{ x: 60, y: 106 }, { x: 60, y: 194 }], [{ x: 160, y: 106 }, { x: 160, y: 194 }], [{ x: 260, y: 106 }, { x: 260, y: 194 }]
    ],
    valves: [
      { x: 60, y: 50, ax: 32, ay: 18 }, { x: 160, y: 50, ax: 132, ay: 18 }, { x: 260, y: 50, ax: 232, ay: 18 },
      { x: 60, y: 150, ax: 32, ay: 118 }, { x: 160, y: 150, ax: 132, ay: 118 }, { x: 260, y: 150, ax: 232, ay: 118 }
    ],
    dripTapes: [[{ x: 40, y: 20 }, { x: 80, y: 20 }]],
    meta: { zoneCount: 6, pump: { flow: '120', head: '35', power: '18.5' }, pipes: { front: 'Ø200', main: 'Ø110', branch: 'Ø63' } }
  };
  if (opt.multiSegMain) d.mainPipes[0] = [{ x: 32, y: 0 }, { x: 32, y: 60 }, { x: 32, y: 100 }];  // 3 点折线
  return d;
}

console.log('== tl-auto-edits 自动管线图面编辑层回归 ==');
const AE = require('../tl-workspace/tl-auto-edits.js');

/* ---------- 1. pid 体系 ---------- */
{
  const d = mkData();
  ok(AE.pipePts('front', d) === d.frontPipe, 'pipePts(front) → frontPipe 原引用');
  ok(AE.pipePts('main-0', d) === d.mainPipes[0], 'pipePts(main-0) → mainPipes[0] 原引用');
  ok(AE.pipePts('branch-5', d) === d.branchPipes[5], 'pipePts(branch-5) → branchPipes[5]');
  ok(AE.pipePts('main-99', d) === null, '越界下标 → null');
  ok(AE.pipePts('nonsense', d) === null && AE.pipePts('main-x', d) === null, '非法 pid → null');
  ok(AE.pipeName('front') === '总管' && AE.pipeName('main-0') === '主管#1' && AE.pipeName('branch-2') === '支管#3', 'pipeName：总管/主管#1/支管#3');
  ok(AE.allPids(d).length === 13, 'allPids：1 总管 + 6 主管 + 6 支管 = 13（实际 ' + AE.allPids(d).length + '）');
  ok(AE.fixedLen([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }]) === 100, 'fixedLen：3 点折线前段和 = 100');
}

/* ---------- 2. applyTo 有效几何 ---------- */
{
  const d = mkData();
  ok(AE.applyTo(d) === d, '无编辑 → applyTo 原引用返回（零成本）');
  ok(AE.setLen('main-0', 150, d, 'test'), 'setLen main-0 → 150');
  const eff = AE.applyTo(d);
  ok(eff !== d, '有编辑 → 返回副本');
  ok(eff.mainPipes[0][1].y === 150, '主管#1 末段沿原方向拉伸：末端 y 100→150');
  ok(d.mainPipes[0][1].y === 100, '原始数据不被修改（红线：tlDiagramData 只读）');
  ok(eff.mainPipes[1] === d.mainPipes[1], '未改长管线共享原引用');
  ok(AE.setLen('front', 360, d, 'test') && AE.applyTo(d).frontPipe[1].x === 360, '总管改长：末端 x 300→360');
  AE.clearLen('main-0', 'test');
  ok(AE.applyTo(d).mainPipes[0] === d.mainPipes[0], 'clearLen → 恢复原引用');
}
{
  const d = mkData({ multiSegMain: true });
  AE.setLen('main-0', 150, d, 'test');   // 3 点折线：前段 60 固定，末段 40→90
  const e = AE.effPts('main-0', d);
  ok(Math.abs(AE.polylineLen(e) - 150) < 1e-9, '多段折线改长：总长 = 150');
  ok(e[1].y === 60 && e[0].y === 0, '前段保持不动（契约）');
  ok(Math.abs(e[2].y - 150) < 1e-9, '末段沿原方向拉伸到 90');
  ok(AE.setLen('main-0', 60.03, d, 'test') === false, '目标总长 ≤ 前段固定和 + 0.05 → 拒绝');
}

/* ---------- 3. setLen 校验 ---------- */
{
  const d = mkData();
  let fired = null;
  const un = AE.onChange(function (x) { fired = x; });
  ok(AE.setLen('main-0', 0, d) === false, 'len ≤ 0 → 拒绝');
  ok(AE.setLen('bad-pid', 100, d) === false, '非法 pid → 拒绝');
  ok(AE.setLen('main-99', 100, d) === false, '管线不存在 → 拒绝');
  ok(AE.setLen('main-0', 100.123, d) === true && AE.lensMap()['main-0'] === 100.12, '长度四舍五入到厘米');
  ok(fired && fired.action === 'len' && fired.source === '', 'setLen 触发 onChange{action:len}');
  un();
}

/* ---------- 4. 配件沿管弧长 ---------- */
{
  const d = mkData();
  const f1 = AE.addFitting('tee', 'main-0', 30, d, 'test');
  ok(f1 && f1.id === 'A-F01' && f1.kind === 'tee' && f1.atM === 30, 'addFitting 三通 → A-F01 @30m');
  ok(AE.fitsList().length === 1 && AE.fitsList()[0] === f1, 'fitsList 即时可见');
  const f2 = AE.addFitting('valve', 'front', 999, d, 'test');
  ok(f2.atM === 299.99, 'atM 超出管长 → clamp 到管长内（299.99）');
  ok(AE.addFitting('elbow', 'main-0', 10, d) === null, '不支持的配件类型 → null（弯头不在图面层）');
  ok(AE.addFitting('tee', 'main-99', 10, d) === null, '管线不存在 → null');
  AE.addFitting('valve', 'main-1', 10, d, 'test');
  ok(AE.fitCount() === 3, 'fitCount = 3');
  const p = AE.pointAt('main-0', d, 40);
  ok(p && Math.abs(p.x - 32) < 1e-9 && Math.abs(p.y - 40) < 1e-9, 'pointAt：沿管 40m → (32,40)');
  const loc = AE.locate('main-0', d, { x: 33, y: 40 });
  ok(loc && Math.abs(loc.along - 40) < 1e-9 && Math.abs(loc.dist - 1) < 1e-9, 'locate：→ along 40, dist 1');
  ok(AE.removeFitting('A-F01', 'test') && AE.fitCount() === 2, 'removeFitting → 2');
  ok(AE.removeFitting('A-F99') === false, '删除不存在配件 → false');
}
{
  /* 改长后配件随动 / clamp */
  const d = mkData();
  AE.addFitting('tee', 'main-0', 80, d, 'test');       // 基于原始管长 100
  AE.setLen('main-0', 150, d, 'test');                  // 拉伸到 150
  let p = AE.pointAt('main-0', d, 80);
  ok(Math.abs(p.y - 80) < 1e-9 && p.len === 150, '改长后配件随有效几何定位（沿管 80m 仍是 y=80）');
  AE.setLen('main-0', 50, d, 'test');                   // 收缩到 50
  p = AE.pointAt('main-0', d, 80);
  ok(Math.abs(p.y - 50) < 1e-9 && p.along === 50, '收缩后配件 clamp 到末端');
}

/* ---------- 5. 几何签名绑定 ---------- */
{
  const d = mkData();
  ok(AE.syncGeometry(d) === 'changed', '首次绑定几何签名 → changed（建立基线）');
  AE.setLen('main-0', 150, d, 'test');
  AE.addFitting('tee', 'front', 100, d, 'test');
  ok(AE.syncGeometry(d) === 'kept', '同几何再绑 → kept（编辑保留）');
  const d2 = mkData();
  d2.mainPipes[0][1].y = 120;                           // 几何变化
  ok(AE.syncGeometry(d2) === 'changed', '几何变化 → changed');
  ok(Object.keys(AE.lensMap()).length === 0 && AE.fitCount() === 0, '几何变化 → 改长/配件整层清空（防下标错位）');
}

/* ---------- 6. serialize / restore ---------- */
{
  const d = mkData();
  AE.setLen('main-0', 150, d, 'test');
  AE.addFitting('valve', 'front', 88, d, 'test');
  AE.addFitting('tee', 'main-2', 40, d, 'test');
  const snap = AE.serialize();
  ok(snap.version === 1 && snap.lens['main-0'] === 150 && snap.fits.length === 2, 'serialize 结构完整');
  AE.reset(); AE.discardSaved();
  ok(AE.restore(snap) === true && AE.lensMap()['main-0'] === 150 && AE.fitCount() === 2, 'restore 回环：改长+配件复原');
  const f3 = AE.addFitting('tee', 'branch-0', 10, d, 'test');
  ok(f3.id === 'A-F03', 'restore 后 seq 续号不撞号（A-F03）');
  const bad1 = JSON.parse(JSON.stringify(snap)); bad1.version = 2;
  ok(AE.restore(bad1) === false, '版本不符 → 拒绝');
  const bad2 = JSON.parse(JSON.stringify(snap)); bad2.fits[1].id = bad2.fits[0].id;
  ok(AE.restore(bad2) === false, '配件 id 重复 → 拒绝');
  const bad3 = JSON.parse(JSON.stringify(snap)); bad3.lens['hacker'] = 100;
  ok(AE.restore(bad3) === false, 'lens 非法 pid → 拒绝');
  const bad4 = JSON.parse(JSON.stringify(snap)); bad4.geoKey = 'other';
  ok(AE.restore(bad4) === false, 'geoKey 与当前绑定不符 → 拒绝');
  AE.reset(); AE.discardSaved();
}

/* ---------- 7. localStorage 兜底（同几何恢复 / 幽灵防护） ---------- */
{
  const store = {};
  global.localStorage = {
    getItem: function (k) { return k in store ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; }
  };
  delete require.cache[require.resolve('../tl-workspace/tl-auto-edits.js')];
  const A1 = require('../tl-workspace/tl-auto-edits.js');
  const d = mkData();
  ok(A1.syncGeometry(d) === 'changed', '先绑定几何签名（真实流程：渲染先于编辑）');
  A1.setLen('main-0', 150, d, 'test');
  A1.addFitting('tee', 'front', 100, d, 'test');
  ok(store['runye_tlAutoEdits_v1'], '编辑后已持久化到 localStorage');
  delete require.cache[require.resolve('../tl-workspace/tl-auto-edits.js')];
  const A2 = require('../tl-workspace/tl-auto-edits.js');   // 模拟刷新
  ok(Object.keys(A2.lensMap()).length === 0, '刷新后内存为空（等 syncGeometry 决定是否恢复）');
  ok(A2.syncGeometry(d) === 'changed' && A2.lensMap()['main-0'] === 150 && A2.fitCount() === 1, '同几何签名 → LS 兜底自动恢复');
  const d3 = mkData(); d3.branchPipes[0][1].y = 90;         // 换方案：几何变化
  A2.syncGeometry(d3);
  ok(Object.keys(A2.lensMap()).length === 0 && A2.fitCount() === 0, '几何变化 → 不复活旧编辑（幽灵防护）');
  A2.discardSaved();
  delete global.localStorage;
}

/* ---------- 8. iso-diagram 消费（vm 同仓：window 注入） ---------- */
{
  const vm = require('vm');
  const fs = require('fs');
  const sandbox = { console, JSON, Math, Number, Object, Array, Date, isFinite, RegExp, String };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext('var window = globalThis;', sandbox);   // 关键：typeof window 必须在上下文内已定义
  vm.runInContext(fs.readFileSync('tl-workspace/tl-auto-edits.js', 'utf8'), sandbox, { filename: 'tl-auto-edits.js' });
  vm.runInContext(fs.readFileSync('iso-diagram/iso-diagram.js', 'utf8'), sandbox, { filename: 'iso-diagram.js' });
  const A = sandbox.RyTlAutoEdits, ISO = sandbox.RyIsoDiagram;
  ok(!!A && !!ISO, 'vm 同仓加载：RyTlAutoEdits + RyIsoDiagram');
  const d = mkData();
  const svg0 = ISO.renderSVG(d);
  ok(svg0.includes('data-tlpipe="front"') && svg0.includes('data-tlpipe="main-0"') && svg0.includes('data-tlpipe="branch-5"'), '轴测图自动管线已打 data-tlpipe 标');
  ok(!svg0.includes('data-tlfit='), '无编辑时无图面配件层');
  ok(A.setLen('main-0', 150, d, 'vm') && A.setLen('front', 360, d, 'vm') && A.addFitting('tee', 'main-0', 50, d, 'vm') && A.addFitting('valve', 'front', 100, d, 'vm'), 'vm 内建编辑：改长 + 三通/阀门');
  const svg1 = ISO.renderSVG(d);
  ok(svg1.includes('data-tlfit="A-F01"') && svg1.includes('data-tlfit="A-F02"'), '轴测图渲染图面配件（data-tlfit）');
  ok(svg1.includes('三通 · 主管#1') && svg1.includes('阀门 · 总管'), '配件 title 含类型与所在管');
  const st = ISO.computeStats(d);
  ok(Math.abs(st.totals.mainLen - 650) < 0.01, '统计按有效几何：主管 600→650（改长 +50）');
  ok(Math.abs(st.totals.frontLen - 360) < 0.01, '统计按有效几何：总管 300→360');
  const before = JSON.stringify(d);
  ISO.renderSVG(d); ISO.computeStats(d);
  ok(JSON.stringify(d) === before, '渲染/统计不改平面数据（红线）');
  ok(A.syncGeometry(d) === 'changed' || A.syncGeometry(d) === 'kept', 'iso render 后 AE 几何绑定可用');
}

/* ---------- 8. moveFitting 沿管拖动/输入定位（阶段2b） ---------- */
{
  const d = mkData();
  AE.reset(); AE.syncGeometry(d); AE.discardSaved();
  const f = AE.addFitting('valve', 'front', 100, d, 'test');   // front 设计长 300
  ok(!!f && f.atM === 100, 'moveFitting 前置：addFitting front@100');
  ok(AE.moveFitting(f.id, 250, d, 'test') && f.atM === 250, 'moveFitting 250 → atM=250');
  ok(AE.moveFitting(f.id, 999, d, 'test') && f.atM === 300, 'moveFitting 超长 clamp 到管长 300');
  ok(AE.moveFitting(f.id, -5, d, 'test') && f.atM === 0, 'moveFitting 负值 clamp 到 0');
  ok(!AE.moveFitting('A-F99', 10, d, 'test'), '未知配件 id → false');
  ok(!AE.moveFitting(f.id, NaN, d, 'test'), 'NaN → false');
  ok(AE.moveFitting(f.id, 60.4567, d, 'test') && f.atM === 60.46, 'moveFitting 四舍五入 2 位（60.46）');
  /* 改长后 clamp 到「有效几何」长度（两侧距离之和恒等于有效管长） */
  ok(AE.setLen('front', 150, d, 'test'), 'setLen front 300→150');
  ok(AE.moveFitting(f.id, 200, d, 'test') && f.atM === 150, '有效几何 150m：拖到 200 clamp 到 150（实际 ' + f.atM + '）');
  const pa = AE.pointAt('front', d, 60);
  ok(Math.abs(pa.len - 150) < 1e-9, 'pointAt 返回 len=有效长 150');
  AE.reset(); AE.discardSaved();
}

/* ---------- 10. 管径覆盖 cals（2026-09-16 阶段2e 图面改径） ---------- */
{
  const d = mkData();
  ok(AE.syncGeometry(d) === 'changed' || AE.syncGeometry(d) === 'kept', 'cals 前置：几何绑定');
  ok(AE.caliberOf('main-0') === null && Object.keys(AE.calibersMap()).length === 0, '初始无改径');
  ok(AE.setCaliber('bad', 160, d) === false, '非法 pid → 拒绝');
  ok(AE.setCaliber('main-99', 160, d) === false, '管线不存在 → 拒绝');
  ok(AE.setCaliber('main-0', 0, d) === false && AE.setCaliber('main-0', -5, d) === false && AE.setCaliber('main-0', NaN, d) === false, 'od ≤0 / NaN → 拒绝');
  ok(AE.setCaliber('main-0', 160, d, 'test'), 'setCaliber main-0 → 160');
  ok(AE.caliberOf('main-0') === 160 && AE.calibersMap()['main-0'] === 160, 'caliberOf / calibersMap 即时可见');
  ok(AE.setCaliber('main-0', 110.5, d) && AE.caliberOf('main-0') === 110.5, '覆盖式改径：160 → 110.5');
  let fired = null;
  const off = AE.onChange(function (x) { fired = x; });
  AE.setCaliber('branch-0', 75, d, 'test');
  ok(fired && fired.action === 'caliber' && fired.cals === 2, 'setCaliber 触发 onChange{action:caliber}，cals 计数 = 2');
  off();
  const before = JSON.stringify(d);
  ok(AE.applyTo(d) === d, '只改径 → applyTo 原引用返回（几何零改动）');
  ok(JSON.stringify(d) === before, '改径不写平面数据（红线）');
  const snap = AE.serialize();
  ok(snap.cals && snap.cals['main-0'] === 110.5 && snap.cals['branch-0'] === 75, 'serialize 含 cals');
  ok(AE.clearCaliber('main-0', 'test') && AE.caliberOf('main-0') === null, 'clearCaliber → 移除');
  ok(AE.clearCaliber('main-0') === false, '重复清除 → false');
  ok(AE.restore(snap) === true && AE.caliberOf('main-0') === 110.5 && AE.caliberOf('branch-0') === 75, 'restore 回环：cals 复原');
  const legacy = JSON.parse(JSON.stringify(snap)); delete legacy.cals;
  ok(AE.restore(legacy) === true && Object.keys(AE.calibersMap()).length === 0, '旧存档无 cals 字段 → 兼容（清空）');
  const badc = JSON.parse(JSON.stringify(snap)); badc.cals = { 'bad-pid': 160 };
  ok(AE.restore(badc) === false, 'cals 非法 pid → 拒绝');
  const badc2 = JSON.parse(JSON.stringify(snap)); badc2.cals = { 'main-0': -1 };
  ok(AE.restore(badc2) === false, 'cals od ≤ 0 → 拒绝');
  AE.setCaliber('main-0', 160, d, 'test');
  ok(AE.reset() && Object.keys(AE.calibersMap()).length === 0, 'reset → cals 清空');
  AE.setCaliber('main-0', 160, d, 'test');
  const d2 = mkData(); d2.mainPipes[0] = [{ x: 40, y: 0 }, { x: 40, y: 100 }];
  AE.syncGeometry(d2);
  ok(Object.keys(AE.calibersMap()).length === 0, '几何变化 → cals 整层清空（防下标错位）');
}

/* ---------- 11. 改径渲染（vm 同仓：iso Ø 标注） ---------- */
{
  const vm = require('vm');
  const fs = require('fs');
  const sandbox = { console, JSON, Math, Number, Object, Array, Date, isFinite, RegExp, String };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext('var window = globalThis;', sandbox);
  vm.runInContext(fs.readFileSync('tl-workspace/tl-auto-edits.js', 'utf8'), sandbox, { filename: 'tl-auto-edits.js' });
  vm.runInContext(fs.readFileSync('iso-diagram/iso-diagram.js', 'utf8'), sandbox, { filename: 'iso-diagram.js' });
  const A = sandbox.RyTlAutoEdits, ISO2 = sandbox.RyIsoDiagram;
  const d = mkData();
  A.syncGeometry(d);
  const svg0 = ISO2.renderSVG(d);
  ok(!svg0.includes('data-tlcal='), '无改径时无 Ø 标注');
  ok(A.setCaliber('main-1', 160, d, 'vm') && A.setCaliber('front', 250, d, 'vm'), 'vm 内改径 main-1/front');
  const svg1 = ISO2.renderSVG(d);
  ok((svg1.match(/data-tlcal="/g) || []).length === 2, '改径管线渲染 Ø 标注（2 处）');
  ok(svg1.includes('>Ø160</text>') && svg1.includes('>Ø250</text>'), 'Ø 数值正确（160/250）');
  ok(!svg1.includes('data-tlhf='), '未注入 tlPipeHfMark → 不渲染 hf 标注');
  sandbox.window.tlPipeHfMark = function () { return { text: 'hf 1.00→0.50 ↓0.50', color: '#15803d' }; };
  const svg2 = ISO2.renderSVG(d);
  ok((svg2.match(/data-tlhf="/g) || []).length === 2 && svg2.includes('↓0.50'), '注入 tlPipeHfMark → hf 标注上图（2 处）');
  ok(A.setAutoCaliber === undefined && typeof ISO2.setAutoCaliber === 'function', 'iso 导出 setAutoCaliber');
  const before = JSON.stringify(d);
  ISO2.renderSVG(d);
  ok(JSON.stringify(d) === before, '改径渲染不改平面数据（红线）');
  A.reset(); A.discardSaved();
}

/* ---------- 12. 图面三通第三口旋转 spin + tangentAt（2026-09-16 第三十二轮） ----------
   背景：用户在轴测图右键插在总管上的三通（A-F01）毫无反应、不能旋转。除补齐右键
   链路外，旋转状态本身要有一个「随配件序列化、随几何清空」的落点，即 fits[i].spin。
   契约：0/缺省 = 垂直管道（不写键，旧档与未转图面逐字节一致）；阀门无第三口（拒绝）。 */
{
  const d = mkData();
  AE.syncGeometry(d);
  const tee = AE.addFitting('tee', 'main-0', 40, d, 'test');    // A-F01
  const val = AE.addFitting('valve', 'front', 60, d, 'test');   // A-F02
  ok(AE.fitSpinOf(tee.id) === 0 && AE.fitSpinOf(val.id) === 0, '缺省 spin = 0（未旋转）');
  ok(AE.fitSpinOf('A-F99') === 0, '未知配件 → 0（不抛错）');

  let fired = null;
  const off = AE.onChange(function (x) { fired = x; });
  ok(AE.setFitSpin(tee.id, 15, 'test') === true, 'setFitSpin 三通 +15 → true');
  ok(fired && fired.action === 'fitSpin' && fired.source === 'test', 'setFitSpin 触发 onChange{action:fitSpin}');
  ok(AE.fitSpinOf(tee.id) === 15, 'fitSpinOf 读回 15');
  ok(AE.setFitSpin(tee.id, 45.04, 'test') && AE.fitSpinOf(tee.id) === 45, '角度四舍五入到 0.1°');
  ok(AE.setFitSpin(tee.id, 0, 'test') && AE.fitSpinOf(tee.id) === 0 && AE._state().fits[0].spin === undefined,
    '复位 0 → 字段被删除（不写 spin=0，存档与未转一致）');
  ok(AE.setFitSpin(val.id, 15, 'test') === false && AE.fitSpinOf(val.id) === 0, '阀门无第三口 → 拒绝（不落字段）');
  ok(AE.setFitSpin(tee.id, -30, 'test') && AE.fitSpinOf(tee.id) === -30, '允许负角（反向旋转）');
  ok(AE.setFitSpin('A-F99', 15, 'test') === false, '未知配件 → false');
  ok(AE.setFitSpin(tee.id, NaN, 'test') === false && AE.setFitSpin(tee.id, Infinity, 'test') === false,
    'NaN / Infinity → false（防脏角）');
  ok(AE.fitSpinOf(tee.id) === -30, '被拒绝的写入不改变既有角度');
  off();

  const snap = AE.serialize();
  ok(snap.fits[0].spin === -30, 'serialize 携带 spin（随项目存档持久化）');
  ok(snap.fits[1].spin === undefined, '未旋转配件不写 spin 键（存档零冗余）');
  AE.reset(); AE.discardSaved();
  ok(AE.restore(snap) === true && AE.fitSpinOf('A-F01') === -30, 'restore 回环：spin 复原');
  const badSpin = JSON.parse(JSON.stringify(snap)); badSpin.fits[0].spin = 'abc';
  ok(AE.restore(badSpin) === false, 'spin 非数字 → 拒绝');
  const nullSpin = JSON.parse(JSON.stringify(snap)); nullSpin.fits[0].spin = null;
  ok(AE.restore(nullSpin) === true, 'spin=null → 兼容（视为未旋转）');
  AE.reset(); AE.discardSaved();

  /* tangentAt：第三口旋转的「宿管中心轴」来源（平面单位切向，沿走向给方向） */
  const t0 = AE.tangentAt('main-0', d, 50);
  ok(t0 && Math.abs(t0.x) < 1e-9 && Math.abs(Math.abs(t0.y) - 1) < 1e-9, 'tangentAt(沿 Y 主管) → (0,±1)');
  const t1 = AE.tangentAt('front', d, 150);
  ok(t1 && Math.abs(Math.abs(t1.x) - 1) < 1e-9 && Math.abs(t1.y) < 1e-9, 'tangentAt(沿 X 总管) → (±1,0)');
  const tm = AE.tangentAt('main-0', mkData({ multiSegMain: true }), 70);
  ok(tm && Math.abs(Math.abs(tm.y) - 1) < 1e-9, 'tangentAt 多段折线仍给所在段切向');
  ok(AE.tangentAt('main-99', d, 0) === null && AE.tangentAt('main-0', d, NaN) === null, '越界 / 非数值弧长 → null');

  /* 几何变化 → spin 随配件整层清空（防下标/位置错位） */
  AE.setFitSpin('A-F01', 30, 'test');
  const d2 = mkData(); d2.mainPipes[0][1].y = 120;
  AE.syncGeometry(d2);
  ok(AE.fitCount() === 0 && AE.fitSpinOf('A-F01') === 0, '几何变化 → spin 随配件整层清空');
  AE.reset(); AE.discardSaved();
}

console.log('== 结论：PASS=' + pass + ' FAIL=' + fail + ' ==');
process.exit(fail ? 1 : 0);
