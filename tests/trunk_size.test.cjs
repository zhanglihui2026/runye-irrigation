'use strict';
/* tests/trunk_size.test.cjs —— 总管口径反推（由规划分区推算手绘总管外径）
 *
 * 用户口径（2026-11-04）：「地图上画的总管只是路由，直径要通过实际规划地块的分区推算出来」。
 * 本文件钉住的是这条推算链**算得对、缺数据时不瞎算**：
 *
 *   ① 分区流量 q = 面积 ÷ 滴带间距 ÷ 滴孔间距 × 滴头流量 ÷ 1000（与三级页同一条公式）；
 *   ② 轮灌组合流 = 组内分区流量**之和**（同组同时灌溉），绝不把全部区相加；
 *   ③ 总管要满足**最不利组**（Q 最大那一组）；也能只看指定的某一组；
 *   ④ **不缩颈**：总管外径 ≥ 下游最大主管/支管外径（且 ≥ 主管最小档 90mm）；
 *   ⑤ 缺面积/缺滴灌参数/缺分组/缺选档器 ⇒ ok:false + 明确的 reason，不拿 0 顶；
 *   ⑥ 面积缺失的分区记进 missingZones（不补 0 —— 补 0 会让合流偏小、总管选细）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const T = (function load() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'mod', 'trunk-size.js'), 'utf8');
  return new Function('window', src + '\nreturn window.RyTrunkSize;')({});
})();

/* 真实选档器（唯一出处 hydraulic-calc/design-core.js）+ 与 inline-09 同值的档位参数。
   注意签名：产品里注入的是 inline-09 的 **4 参包装器**（序列/SDR 固化），trunk-size 只传
   前三个位置参数 ⇒ 这里的适配器也必须只吃三个参数，否则等于把「接线错误」写进了测试
   （v945 的测试与探针都吃了 6 个参数，于是产品坏了测试还是绿的）。 */
const Core = require(path.join(__dirname, '..', 'hydraulic-calc', 'design-core.js'));
const OD = [50, 63, 75, 90, 110, 125, 140, 160, 180, 200, 225, 250, 280, 315, 355, 400, 450, 500];
const SDR = 13.6;
const picker = (q, tv, minOd) => Core.selectPipe(q, tv, OD, SDR, minOd, Infinity);

/* 4 个区各 10000 m²（1 公顷），滴带间距 0.6m、滴孔间距 0.3m、滴头 2 L/h
   ⇒ 单位面积流量 = 2/1000/0.6/0.3 = 0.011111 m³/h·m²
   ⇒ 每区 q = 10000 × 0.011111 = 111.11 m³/h（数值刻意做大，便于观察档位） */
const BASE = {
  zoneAreas: [10000, 10000, 10000, 10000],
  groups: [[0, 1], [2, 3]],
  tapeSpacing: 0.6, emitterSpacing: 0.3, emitterFlow: 2,
  targetV: 1.5, minOd: 90,
  selectPipe: picker
};

test('① zoneFlows：面积 ÷ 间距 ÷ 间距 × 滴头流量/1000，缺面积给 null 不补 0', () => {
  const q = T.zoneFlows([10000, null, 0, 5000], 0.6, 0.3, 2);
  assert.ok(Math.abs(q[0] - 111.1111) < 1e-3, '10000 m² 应为 111.11 m³/h');
  assert.equal(q[1], null, '面积缺失 ⇒ null（补 0 会让合流偏小）');
  assert.equal(q[2], null, '面积为 0 ⇒ null');
  assert.ok(Math.abs(q[3] - 55.5556) < 1e-3, '5000 m² 应为 55.56 m³/h');
});

test('② groupFlows：组内相加、组间独立、同一区重复出现只算一次', () => {
  const flows = [10, 20, 30, 40, 50];
  const rows = T.groupFlows(flows, [[0, 1], [2, 3], [4, 4]]);
  assert.equal(rows[0].flow, 30);
  assert.equal(rows[1].flow, 70);
  assert.equal(rows[2].zones.length, 1, '组内重复写同一个区 ⇒ 只算一次');
  assert.equal(rows[2].flow, 50);
  assert.equal(rows[0].flow + rows[1].flow + rows[2].flow, 150, '累计不重复计水');
  /* 跨组重复：前面的组已占用 ⇒ 后面的组读不到这个区（分组本身应当互斥，脏数据先到先得） */
  const dup = T.groupFlows(flows, [[0, 1], [0]]);
  assert.equal(dup[1].zones.length, 0);
  assert.equal(dup[1].flow, 0);
});

test('③ suggest：默认取最不利组（Q 最大），并报出是第几组、几个区', () => {
  const bigger = Object.assign({}, BASE, {
    zoneAreas: [10000, 10000, 20000, 20000]   /* 组1（2、3 区）面积翻倍 ⇒ 最不利 */
  });
  const r = T.suggest(bigger);
  assert.equal(r.ok, true);
  assert.equal(r.groupIndex, 1, '最不利组 = 组1');
  assert.equal(r.zoneCount, 2);
  assert.ok(Math.abs(r.flow - 444.4444) < 1e-2, '两组各 222.22 与 444.44，应取 444.44');
  assert.ok(r.od >= 90 && r.od <= 500, '外径必须落在标准档位上');
  assert.ok(r.velocity > 0, '流速要有值');
  assert.match(r.basis, /2 区同轮灌溉合计 444\.44 m³\/h/, '依据文案必须能自证');
});

test('④ suggest：指定 groupIndex 时只看那一组（不看是不是最大）', () => {
  const r = T.suggest(Object.assign({}, BASE, { groupIndex: 0 }));
  assert.equal(r.ok, true);
  assert.equal(r.groupIndex, 0);
  assert.ok(Math.abs(r.flow - 222.2222) < 1e-2);
});

test('⑤ 不缩颈：下游主管 Ø160 ⇒ 总管外径不得小于 160（哪怕流量选出来是 110）', () => {
  const small = Object.assign({}, BASE, {
    zoneAreas: [1000, 1000, 1000, 1000],   /* 每区 11.1 m³/h，合流 22.2 ⇒ 按流速只需 Ø75/90 */
    mainOd: 160, branchOd: 90
  });
  const r = T.suggest(small);
  assert.equal(r.ok, true);
  assert.equal(r.minDownstreamOd, 160);
  assert.ok(r.od >= 160, '总管不能比它供的主管还细');
});

test('⑥ 缺数据一律 ok:false + 明确 reason，不拿 0 或默认档顶', () => {
  const noArea = T.suggest(Object.assign({}, BASE, { zoneAreas: [] }));
  assert.equal(noArea.ok, false);
  assert.equal(noArea.reason, 'no-zone-area');

  const noParams = T.suggest(Object.assign({}, BASE, { tapeSpacing: null }));
  assert.equal(noParams.ok, false);
  assert.equal(noParams.reason, 'no-drip-params');

  const noGroups = T.suggest(Object.assign({}, BASE, { groups: [] }));
  assert.equal(noGroups.ok, false);
  assert.equal(noGroups.reason, 'no-groups');

  const noPicker = T.suggest(Object.assign({}, BASE, { selectPipe: null }));
  assert.equal(noPicker.ok, false);
  assert.equal(noPicker.reason, 'no-picker');

  const allZero = T.suggest(Object.assign({}, BASE, { zoneAreas: [0, 0, 0, 0] }));
  assert.equal(allZero.ok, false);
  assert.equal(allZero.reason, 'no-flow');
});

test('⑦ 面积缺失的分区进 missingZones（合流只算读得到的，且明说缺谁）', () => {
  /* 夹具推导（别心算，按公式走）：
     zoneAreas=[10000,null,10000,10000]，每组 111.11 m³/h
       组0=[0,1] ⇒ zi0 有值 111.11 + zi1 缺(null) ⇒ flow 111.11，missing=[1]
       组1=[2,3] ⇒ 111.11+111.11 = 222.22，missing=[]
     ⇒ 默认取最不利 = 组1（不缺区）；要看缺区报告就指定组0。 */
  const dflt = T.suggest(Object.assign({}, BASE, { zoneAreas: [10000, null, 10000, 10000] }));
  assert.equal(dflt.ok, true);
  assert.equal(dflt.groupIndex, 1, '最不利组是 222.22 的组1');
  assert.deepEqual(dflt.missingZones, [], '组1 不缺区');

  const g0 = T.suggest(Object.assign({}, BASE, { zoneAreas: [10000, null, 10000, 10000], groupIndex: 0 }));
  assert.equal(g0.ok, true);
  assert.equal(g0.groupIndex, 0);
  assert.ok(Math.abs(g0.flow - 111.1111) < 1e-2, '缺区不补 0：合流只算读得到的那一个区');
  assert.deepEqual(g0.missingZones, [1], '缺面积的分区必须点名');
});

/* ⑧~⑩ 接线静态锁（防止将来重构把这条链拆断，而纯函数测试仍然"绿"）：
   · inline-09 必须导出 window.tlTrunkOdAdvice，并**注入** selectPipe / 档位序列（不复制一份）；
   · map-flow-demo 的浮层必须导出 updateGroupInfo，且三条分支文案都在；
   · online-map 必须把逐区面积递进去（getZoneAreas / getOdAdvice）；
   · trunk-panel 必须有「推算管径」行与「采用」按钮；
   · index.html 引用 trunk-size.js，sw.js 的 CORE 名单收录它。 */
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('⑧ 接线：inline-09 导出 tlTrunkOdAdvice 且注入站内唯一的选档器', () => {
  const src = read('mod/inline-09.js');
  assert.ok(/window\.tlTrunkOdAdvice\s*=\s*function/.test(src), '必须导出 window.tlTrunkOdAdvice');
  assert.ok(/selectPipe:\s*selectPipe/.test(src), '必须注入本文件的 selectPipe（唯一选档口径）');
  assert.ok(!/series:\s*PE_OD_SERIES/.test(src.split('window.tlTrunkOdAdvice')[1] || ''),
    '注入里不许再传 series：包装器只吃 4 参，多传会把档位表顶进 minOd（v946 的坑）');
  assert.ok(/minOd:\s*MAIN_PIPE_MIN_OD/.test(src), '管径下限必须沿用 MAIN_PIPE_MIN_OD');
  assert.ok(/zoneAreas:\s*zoneStat\s*\?\s*zoneStat\.cells\.slice\(\)\s*:\s*null/.test(src),
    'computeThreeLevel 必须导出逐区面积（zoneAreas）');
  assert.equal((src.match(/const PE_OD_SERIES = \[/g) || []).length, 1, 'PE_OD_SERIES 只允许定义一次');

  /* 被调用侧：trunk-size 只能按 (flow, targetV, floorOd) 三个位置参数调选档器 */
  const size = read('mod/trunk-size.js');
  assert.ok(/picker\(pick\.flow,\s*targetV,\s*floorOd\)/.test(size),
    'trunk-size 必须按 3 参调用 picker(flow, targetV, floorOd)');
  assert.ok(!/picker\([^)]*series/.test(size), 'trunk-size 不许把 series/sdr 塞进 picker');
});

test('⑨ 接线：浮层三条分支（有反推/反推失败/无接口）', () => {
  const src = read('mod/map-flow-demo.js');
  assert.ok(/updateGroupInfo:\s*updateGroupInfo/.test(src), '浮层必须导出（探针/宿主可驱动）');
  assert.ok(/window\.tlTrunkOdAdvice\(/.test(src), '浮层必须调用反推接口');
  assert.ok(/按分区反推/.test(src), '有反推时必须标明「按分区反推」');
  assert.ok(/adv&&adv\.ok===false&&adv\.text/.test(src), '反推失败必须原样转述原因');
  assert.ok(/分区管路路径或水力参数尚未齐备/.test(src), '无接口时才退回旧文案');
});

test('⑩ 接线：宿主取数 + 面板行 + 页面/SW 登记', () => {
  const map = read('mod/online-map.js');
  assert.ok(/getOdAdvice:\s*currentOdAdvice/.test(map), '面板建议必须由宿主现算（getOdAdvice）');
  assert.ok(/getZoneAreas:\s*currentZoneAreas/.test(map), '演示浮层必须拿到逐区面积（getZoneAreas）');
  assert.ok(/zoneIndex/.test(map) && /\.area/.test(map), '面积必须按分区序号对位（不是数组顺序瞎猜）');

  const panel = read('mod/trunk-panel.js');
  for (const id of ['tpDnAdviceRow', 'tpDnAdvice', 'tpDnAdopt']) {
    assert.ok(panel.includes(id), '面板必须有 ' + id);
  }
  assert.ok(/function paintOdAdvice/.test(panel), '必须有 paintOdAdvice');
  assert.ok(/btn\.hidden = \(cur !== null && cur === adv\.od\)/.test(panel),
    '管径已等于推算值时应隐藏「采用」');

  /* v947：反推失败不许整行隐藏（否则用户只看到「管径 未选择」，读不到为什么没推算），
     并且"外径未选"时下拉占位要带建议值 —— 这两条是用户第二次追问的直接原因。 */
  assert.ok(/function setDnPlaceholder/.test(panel), '必须有 setDnPlaceholder（占位提示建议值）');
  assert.ok(/建议 Ø/.test(panel), '占位文案要写明「建议 Ø」');
  assert.ok(!/if \(!adv \|\| adv\.ok !== true\)[\s\S]{0,80}row\.hidden = true/.test(panel),
    '反推失败不许把整行藏掉');

  /* 下拉档位必须是 PE 序列里的真值（不许自造 DN），且要覆盖到按分区反推的常见结果。 */
  const presetSrc = (panel.match(/var DN_PRESETS = \[([^\]]+)\]/) || [])[1];
  assert.ok(presetSrc, '必须能找到 DN_PRESETS');
  const presets = presetSrc.split(',').map(s => Number(s.trim())).filter(n => n > 0);
  assert.ok(presets.every(v => OD.indexOf(v) >= 0), 'DN_PRESETS 只允许 PE 序列里的值，实际 ' + presets.join('/'));
  assert.ok(presets.indexOf(355) >= 0, '必须含 Ø355（一组 70 亩的合流常推到这一档）');

  const idx = read('index.html');
  assert.ok(/mod\/trunk-size\.js\?v=/.test(idx), 'index.html 必须引用 trunk-size.js（带缓存串）');
  const sw = read('sw.js');
  assert.ok(/"mod\/trunk-size\.js"/.test(sw), 'sw.js 的 CORE 名单必须收录 trunk-size.js');
});

/* ⑪ 数值锁（v946）：用**真实**选档器复算一次田块级算例，钉住「总管比主管粗」这个方向。
   算例来自用户截图：G1 = 1、2 区，各 34.8 / 35.0 亩 ≈ 23400 m²，滴带 0.6m、滴孔 0.3m、滴头 1.6 L/h
     · 单位面积流量 = 1.6/1000/0.6/0.3 = 0.0088889 m³/h·m²
     · 每区 q = 23400 × 0.0088889 = 208.0 m³/h ⇒ 两区合流 Q = 416.0 m³/h
     · 按 1.5 m/s 经济流速：Ø315 时 v≈2.03、Ø355 时 v≈1.60 ⇒ 取最接近 1.5 的 Ø355
   ⇒ 总管 Ø355 **远大于**下游主管 Ø160（截图里主管已经是 160 上限），方向没错。
   这条锁也是「选档器接线错了」的探测器：接线错 ⇒ picker 返回 undefined ⇒ ok:false ⇒ 直接红。 */
test('⑪ 数值锁：G1（2 区×23400 m²，滴头 1.6 L/h）⇒ 416 m³/h ⇒ Ø355，且远大于主管 Ø160', () => {
  const r = T.suggest({
    zoneAreas: [23400, 23400, 23400, 23400],
    groups: [[0, 1], [2, 3]],
    tapeSpacing: 0.6, emitterSpacing: 0.3, emitterFlow: 1.6,
    targetV: 1.5, minOd: 90, mainOd: 160, branchOd: 160,
    selectPipe: picker
  });
  assert.equal(r.ok, true, '有面积有参数有分组 ⇒ 必须出结果（ok:false 说明选档器接线又断了）');
  assert.ok(Math.abs(r.flow - 416.0) < 0.2, '两区合流应约 416 m³/h，实际 ' + r.flow);
  assert.equal(r.od, 355, '按 1.5 m/s 应选 Ø355');
  assert.ok(r.od > 160, '总管必须比它供的主管（Ø160）粗 —— 这正是用户直觉的那条口径');
  assert.ok(r.velocity > 1.2 && r.velocity < 1.9, '落档流速应在经济区间附近，实际 ' + r.velocity);
});

/* ⑫ 档位封顶：下限被抬到序列之外 ⇒ 说清「没有可选档位」，不再吐「低于下限…选不出结果」 */
test('⑫ 下限超出序列上限 ⇒ reason=no-candidate + 指名下限值', () => {
  const r = T.suggest(Object.assign({}, BASE, { minOd: 600 }));
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no-candidate');
  assert.match(r.text, /Ø600/);
  assert.match(r.text, /超出|没有可选档位/);
});
