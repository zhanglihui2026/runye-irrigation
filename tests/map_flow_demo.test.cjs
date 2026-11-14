'use strict';
/* tests/map_flow_demo.test.cjs —— 在线地图轮灌演示（v861 用户需求）
 *
 * 钉纯逻辑契约（图层/动画靠实机验证）：
 *   ① 分组：手动分组（面积成组）优先；自动均分每组 nPer=combinedN 个分区；越界 -1。
 *   ② groupCount：手动 = mg.length；均分 = ceil(total/nPer)；单区至少 1 组。
 *   ③ validateConnection：无总管 no-trunk / 无主管 no-data / 贴驳接点连通 /
 *      贴主管端点连通 / 都不贴 disconnected 且给出最近距离。
 *   ④ 容差边界：5m 连通、5.1m 断开（tolM=5）。
 *   ⑤ 无段总管时驳接点不参与判定（hasSeg=false 时 couplers 贴近也不算连通）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'mod', 'map-flow-demo.js');
function load() {
  const win = { L: undefined };
  new Function('window', fs.readFileSync(SRC, 'utf8'))(win);
  return win.RyMapFlowDemo;
}
const M = load();
/* 米制平面距离（测试用，替代 haversine） */
const dist = (a, b) => Math.hypot(a.lat - b.lat, a.lng - b.lng);
const P = (x, y) => ({ lat: x, lng: y });   /* 用平面值冒充经纬度，dist 注入后口径一致 */

test('① groupOf：手动优先、均分口径、越界 -1', () => {
  assert.equal(M.groupOf(3, null, 2), 1, '均分 nPer=2：zi3 → 组1');
  assert.equal(M.groupOf(0, null, 2), 0);
  assert.equal(M.groupOf(2, [[0, 2], [1, 3]], 1), 0, '手动组0 含 zi0/2');
  assert.equal(M.groupOf(1, [[0, 2], [1, 3]], 1), 1);
  assert.equal(M.groupOf(9, [[0], [1]], 1), -1, '手动模式未分组区 → -1');
  assert.equal(M.groupOf(-1, null, 2), -1);
});

test('② groupCount：手动取组数、均分向上取整、单区至少 1', () => {
  assert.equal(M.groupCount(12, null, 4), 3);
  assert.equal(M.groupCount(10, null, 4), 3, 'ceil(10/4)=3');
  assert.equal(M.groupCount(10, [[0, 1], [2], [3, 4, 5]], 4), 3);
  assert.equal(M.groupCount(1, null, 4), 1);
  assert.equal(M.groupCount(0, null, 4), 0);
});

test('③ validateConnection：四种 code', () => {
  const mains = [[P(0, 0), P(100, 0)], [P(0, 50), P(100, 50)]];
  const trunkNear = [P(-3, 0), P(-50, 20)];       /* 距主管0端点 3m */
  const r1 = M.validateConnection({ hasTrunk: false, trunkLL: trunkNear, mainsLL: mains, tolM: 5, dist });
  assert.equal(r1.code, 'no-trunk');
  const r2 = M.validateConnection({ hasTrunk: true, trunkLL: trunkNear, mainsLL: [], tolM: 5, dist });
  assert.equal(r2.code, 'no-data');
  const r3 = M.validateConnection({ hasTrunk: true, trunkLL: trunkNear, mainsLL: mains, tolM: 5, dist });
  assert.equal(r3.ok, true, '总管贴主管端点 3m ≤ 5m ⇒ 连通');
  const trunkFar = [P(-30, 0), P(-80, 20)];
  const r4 = M.validateConnection({ hasTrunk: true, trunkLL: trunkFar, mainsLL: mains, tolM: 5, dist });
  assert.equal(r4.ok, false, '最近 30m > 5m ⇒ 断开');
  assert.equal(r4.code, 'disconnected');
  assert.equal(Math.round(r4.minM), 30);
});

test('④ 容差边界 + ⑤ 驳接点仅在 hasSeg 时参与', () => {
  const mains = [[P(0, 0), P(100, 0)]];
  const t5 = [P(-5, 0)], t51 = [P(-5.1, 0)];
  assert.equal(M.validateConnection({ hasTrunk: true, trunkLL: t5, mainsLL: mains, tolM: 5, dist }).ok, true);
  assert.equal(M.validateConnection({ hasTrunk: true, trunkLL: t51, mainsLL: mains, tolM: 5, dist }).ok, false);
  /* 总管远离主管但贴近驳接点：有段总管 ⇒ 连通；无段总管 ⇒ 断开 */
  const couplers = [P(200, 50)];
  const tCoup = [P(203, 50)];
  const base = { hasTrunk: true, trunkLL: tCoup, mainsLL: mains, tolM: 5, dist };
  assert.equal(M.validateConnection(Object.assign({ couplersLL: couplers, hasSeg: true }, base)).ok, true, '段总管驳接点 3m');
  assert.equal(M.validateConnection(Object.assign({ couplersLL: couplers, hasSeg: false }, base)).ok, false, '无段总管时驳接点不算');
});

/* [v867] 地图演示 chips「原来的圆形样式」同源锁（用户要求：还用原来的圆形样式）：
   ① style-01.css 的圆点/选中环/图标钮规则必须同时覆盖 #tlDemoChips 与 #mapDemoChips；
   ② border-radius:50%!important 豁免必须在场（对抗全站 body *{border-radius:0!important} 扁平化）；
   ③ syncChipsState 用 .selected 类（与简图版同源的白+绿双环），不许回退内联 outline。 */
test('⑥ 地图演示 chips 与简图版圆形样式同源（CSS 覆盖 + selected 类）', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'mod', 'style-01.css'), 'utf8');
  assert.ok(/#tlDemoChips button\.tl-demo-dot,\s*#mapDemoChips button\.tl-demo-dot\{/.test(css),
    '圆点几何规则必须同时选择 #tlDemoChips 与 #mapDemoChips');
  const dotRule = css.match(/#tlDemoChips button\.tl-demo-dot[^}]*\}/);
  assert.ok(dotRule && /border-radius:50%!important/.test(dotRule[0]), 'border-radius:50%!important 豁免必须在场');
  const selRule = css.match(/button\.tl-demo-dot\.selected[^}]*\}/g);
  assert.ok(selRule && selRule.length >= 1 && /#mapDemoChips/.test(selRule.join('')),
    '选中环（白+绿 box-shadow）必须覆盖 #mapDemoChips');
  assert.ok(/#tlDemoChips button\.tl-demo-ctl,\s*#mapDemoChips button\.tl-demo-ctl\{/.test(css),
    '▶/■ 图标钮规则必须同时覆盖两个演示条');
  const src = fs.readFileSync(SRC, 'utf8');
  assert.ok(/classList\.toggle\('selected'/.test(src), 'syncChipsState 必须切 .selected 类（同源双环）');
});

/* [v1025] 切组多 id 时 downZi 身份统一：相邻切组间只建「组代表」一条边。
 * 背景：同一弧长位置 ±0.05 内两个以上切口（三条主管 T 接、阀切口与接点重合）时，
 * 旧写法按 id 笛卡尔积建多条同几何边，不同分区 Dijkstra 可能走不同 (a,b) 边对象，
 * tlRoutesWorstPath 的 edgeZones 以 (key,a,b) 为切片身份 ⇒ 同段拆多份、downZi 各拿
 * 一部分，过境段流量被低估（v1023 重算链的输入源头分裂）。 */
test('⑪ v1025 切组间只建组代表边（downZi 身份不分裂）', () => {
  const src = fs.readFileSync(SRC, 'utf8');
  assert.ok(src.includes('link(ga.ids[0],gb.ids[0],weight,{key:o.key,kind:o.kind,points:pts,a:ga.ids[0],b:gb.ids[0]})'),
    '相邻切组必须只连组代表 id（组内 0 权边保证连通，代表边不改变最短路）');
  assert.ok(!src.includes('for(var ai=0;ai<ga.ids.length;ai++)for(var bi=0;bi<gb.ids.length;bi++)'),
    '禁止恢复 id 笛卡尔积建边（downZi 身份分裂根因）');
});

test('⑫ v1026 面积通道导出 + 扬程王估算口径明示（方案C）', () => {
  const src = fs.readFileSync(SRC, 'utf8');
  assert.ok(src.includes('zoneAreasOf: function () {'), '必须导出 zoneAreasOf 只读通道（ctx.getZoneAreas 安全封装）');
  assert.ok(src.includes('ctx.getZoneAreas() : null'), '通道内必须走 ctx.getZoneAreas');
  assert.ok(src.includes('est:_LK.estimated===true'), 'headKing 必须记录王组是否估算口径');
  assert.ok(src.includes("(headKing.est?'（估算口径）':'')"), '校核行必须按 est 明示「（估算口径）」');
  assert.ok(!src.includes("headKing={gi:gk,head:Number(_LK.head)};"), '旧的无 est 标记写法必须移除');
});

test('⑬ v1027 段总管反投底图：有手绘总管时不画（用户拍板B）', () => {
  const src = fs.readFileSync(SRC, 'utf8');
  assert.ok(src.includes("if (d.segLL && !(d.trunkLinesLL && d.trunkLinesLL.length)) {"),
    'segLL 底图必须只在无手绘总管时绘制（v1019 兼任干线场景保水源结构可见）');
  assert.ok(!src.includes("if (d.segLL) {\n      ly.addLayer(poly(d.segLL, '#cbd5e1', 2, false));\n    }"),
    '禁止恢复 segLL 无条件底图绘制（v878 口径已被 v1027 拍板取代）');
  assert.ok(src.includes("makeLine('segment:0','trunk',0,d.segLL)"),
    '寻路切片仍用 d.segLL（数据链零改动，只关视觉）');
  assert.ok(src.includes("a.push(line(d.segLL))"), '连通校验签名仍含 segLL（零改动）');
});
