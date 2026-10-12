/* ============================================================
   terrain_sprinkler_layout.test.cjs — v289 喷灌布置图纯函数测试
   断言必须「能变红」：网格偏移/三角形错位/分组/管道几何用精确期望值；
   反例注入：非法参数、无地块、极小地块兜底、超限拦截。
   运行：node tests/terrain_sprinkler_layout.test.cjs
   ============================================================ */
'use strict';
const path = require('path');
const core = require(path.join(__dirname, '..', 'terrain', 'terrain-core.js'));

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name); }
}

/* ---------- 1. pointInPolygon ---------- */
console.log('[1] pointInPolygon（正例 + 反例）');
const sq = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
ok(core.pointInPolygon(50, 50, sq) === true, '正方形中心 → 内');
ok(core.pointInPolygon(150, 50, sq) === false, '反例：右侧外 → 外');
ok(core.pointInPolygon(-1, 50, sq) === false, '反例：左侧外 → 外');
ok(core.pointInPolygon(50, 50, sq.slice(0, 2)) === false, '反例：2 点退化 → 外');
ok(core.pointInPolygon(NaN, 50, sq) === false, '反例：NaN x → 外（不抛异常）');
const concave = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 60, y: 40 }, { x: 20, y: 100 }, { x: 0, y: 100 }];
ok(core.pointInPolygon(10, 50, concave) === true, '凹多边形：左侧凹口外仍在内');
ok(core.pointInPolygon(50, 80, concave) === false, '凹多边形：凹口内 → 外');

/* ---------- 2. 方形布置：精确网格 ---------- */
console.log('[2] sprinklerLayout 方形布置（精确期望）');
const sq100 = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
const L2 = core.sprinklerLayout([{ poly: sq100 }], { range_m: 10, spacing_k: 2.0 * 0.55, layout: 'square', heads_per_shift: 12 });
/* S = 10*1.1 = 11, row = 11, 偏移 5.5 → x/y ∈ {5.5,16.5,...,93.5} = 9x9 = 81 */
ok(L2.ok === true, '正常出图');
ok(L2.heads.length === 81, 'S=11 100x100 方形 → 精确 81 喷头（实际 ' + L2.heads.length + '）');
const xs = [...new Set(L2.heads.map(h => Math.round(h.x * 100) / 100))].sort((a, b) => a - b);
ok(JSON.stringify(xs) === JSON.stringify([5.5, 16.5, 27.5, 38.5, 49.5, 60.5, 71.5, 82.5, 93.5]), '列位置精确（居中偏移 5.5 起、步距 11）');
ok(L2.heads.every(h => core.pointInPolygon(h.x, h.y, sq100)), '全部喷头落在地块内');

/* ---------- 3. 三角形布置：奇数行错位 S/2 ---------- */
console.log('[3] 三角形错位 + 行距');
const L3 = core.sprinklerLayout([{ poly: sq100 }], { range_m: 10, spacing_k: 1.1, layout: 'tri', heads_per_shift: 12 });
const row = 11 * Math.sqrt(3) / 2;
const ys = [...new Set(L3.heads.map(h => h.y))].sort((a, b) => a - b);
ok(Math.abs(ys[1] - ys[0] - row) < 1e-9, '相邻行距 = 0.866S（' + row.toFixed(3) + '）');
const r0xs = L3.heads.filter(h => Math.abs(h.y - ys[0]) < 1e-9).map(h => h.x).sort((a, b) => a - b);
const r1xs = L3.heads.filter(h => Math.abs(h.y - ys[1]) < 1e-9).map(h => h.x).sort((a, b) => a - b);
ok(Math.abs((r1xs[0] - r0xs[0]) - 5.5) < 1e-9, '奇数行相对偶数行错位 S/2=5.5（注入「去掉错位」的缺陷会在此变红）');

/* ---------- 4. 轮灌组 ---------- */
console.log('[4] 轮灌组编号');
ok(L2.groupCount === Math.ceil(81 / 12), 'groupCount = ceil(81/12) = ' + L2.groupCount);
const counts = {};
L2.heads.forEach(h => { counts[h.g] = (counts[h.g] || 0) + 1; });
ok(Object.values(counts).every(c => c <= 12), '每组 ≤ heads_per_shift=12');
ok(Object.keys(counts).length === L2.groupCount, '组号连续无空洞');
ok(counts[L2.groupCount] === 81 % 12, '末组 = 余数 9 个（注入「floor 越界」会变红）');

/* ---------- 5. 管道几何 ---------- */
console.log('[5] 干管 + 支管');
const ys2 = [...new Set(L2.heads.map(h => h.y))].sort((a, b) => a - b);
ok(L2.laterals.length === ys2.length, '支管条数 = 行数（' + L2.laterals.length + '）');
ok(L2.laterals.every(l => Math.abs(l.pts[0].y - l.pts[1].y) < 1e-9), '支管水平（两端 y 相同）');
ok(Math.abs(L2.mainline.pts[0].x - L2.mainline.pts[1].x) < 1e-9, '干管竖直（两端 x 相同）');
ok(Math.abs(L2.mainline.pts[0].y - Math.max(...ys2)) < 1e-6 && Math.abs(L2.mainline.pts[1].y - Math.min(...ys2)) < 1e-6, '干管纵跨首末行');

/* ---------- 5b. 轮灌组分区线（v289c） ---------- */
console.log('[5b] 分区线');
ok(L2.dividers.length === L2.groupCount - 1, '分区线恰 = 组数-1（' + L2.dividers.length + ' 条，注入「漏画/多画」会变红）');
ok(L2.dividers.every(d => Math.abs(d.pts[0].x - d.pts[1].x) < 1e-9 || Math.abs(d.pts[0].y - d.pts[1].y) < 1e-9), '每条分区线为水平或垂直的直段');
const vCount = L2.dividers.filter(d => Math.abs(d.pts[0].x - d.pts[1].x) < 1e-9).length;
const hCount = L2.dividers.filter(d => Math.abs(d.pts[0].y - d.pts[1].y) < 1e-9).length;
ok(vCount === 4 && hCount === 2, '81头/每组12：精确 4 竖 + 2 横（实际 ' + vCount + '+' + hCount + '）');

/* ---------- 5c. 分区范围多边形（v290） ---------- */
console.log('[5c] 分区范围多边形');
ok(L2.zonePolys.length === L2.groupCount, '每组一个闭合多边形（' + L2.zonePolys.length + ' 个）');
const zoneAreaSum = L2.zonePolys.reduce((t, z) => t + core.polygonAreaM2(z.pts), 0);
ok(Math.abs(zoneAreaSum - 81 * 11 * 11) < 1e-6, 'Σ分区面积 = 81头×S×row = 9801（实际 ' + zoneAreaSum.toFixed(3) + '，注入「描迹错边」会变红）');
let perOk = true;
L2.zonePolys.forEach(z => {
  const n = L2.heads.filter(h => h.g === z.g).length;
  if (Math.abs(core.polygonAreaM2(z.pts) - n * 11 * 11) > 1e-6) perOk = false;
});
ok(perOk, '每组面积 = 组内喷头数×S×row（含首末部分行组）');

/* ---------- 5d. 管径初估（v293） ---------- */
console.log('[5d] 管径');
const d30 = core.pipeDN(30, 1.5);
ok(d30 && Math.abs(d30.theory - 84.1) < 0.1 && d30.dn === 90, '干管 30 m³/h@1.5m/s → 理论 84.1mm → DN90（实际 ' + (d30 && d30.theory.toFixed(1)) + '→' + (d30 && d30.dn) + '）');
const d10 = core.pipeDN(10, 1.5);
ok(d10.dn === 50, '10 m³/h → 理论 48.6mm → DN50（向上贴标，注入「向下取」会变红）');
ok(core.pipeDN(0, 1.5) === null && core.pipeDN(30, 0) === null, '反例：零流量/零流速 → null');
const L2b = core.sprinklerLayout([{ poly: sq100 }], { range_m: 10, spacing_k: 1.1, layout: 'square', heads_per_shift: 12, flow_m3h: 2.5 });
ok(L2b.mainDN && L2b.mainDN.dn === 110 && Math.abs(L2b.mainDN.theory - 94.0) < 0.1 && Math.abs(L2b.mainFlow - 30) < 1e-9, '布置图：干管 30 m³/h@1.2m/s → 理论 94.0mm → Φ110');
ok(L2b.latDN && Math.abs(L2b.latFlow - 22.5) < 1e-9 && L2b.latDN.dn === 75, '布置图：最不利支管 22.5 m³/h@1.5m/s → 理论 72.9mm → Φ75（注入「流速不换位」会变红）');
ok(L2b.mainDN.dn >= L2b.latDN.dn, '主管 ≥ 支管（工程惯例不变量）');
const L2c = core.sprinklerLayout([{ poly: sq100 }], { range_m: 10, spacing_k: 1.1, layout: 'square' });
ok(L2c.mainDN === null, '未填喷头流量 → 不出管径（图例不显示 Φ）');

/* ---------- 6. 错误路径（注入缺陷必须命中） ---------- */
console.log('[6] 错误路径');
ok(core.sprinklerLayout([{ poly: sq100 }], { range_m: 0 }).ok === false, '反例：R=0 → 报错');
ok(core.sprinklerLayout([], { range_m: 15 }).ok === false, '反例：无地块 → 报错');
ok(core.sprinklerLayout([{ poly: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }], { range_m: 15 }).ok === false, '反例：2 点退化地块 → 报错');
const tiny = core.sprinklerLayout([{ poly: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }] }], { range_m: 10, spacing_k: 1.1, layout: 'tri' });
ok(tiny.ok === true && tiny.heads.length === 1, '极小地块：网格全落空 → 兜底 1 喷头（不改契约）');
/* 超限拦截：构造超大 bbox 拦截（用极小 R + 大地块模拟网格爆炸） */
const big = core.sprinklerLayout([{ poly: [{ x: 0, y: 0 }, { x: 90000, y: 0 }, { x: 90000, y: 90000 }, { x: 0, y: 90000 }] }], { range_m: 1, spacing_k: 0.5, layout: 'square' });
ok(big.ok === false && /过大|4000/.test(big.error), '反例：网格规模超限 → 生成前拦截（防 OOM/SVG 爆炸）');

/* ---------- 7. 多地块联合 ---------- */
console.log('[7] 多地块');
const two = core.sprinklerLayout(
  [{ poly: sq100 }, { poly: [{ x: 200, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 100 }, { x: 200, y: 100 }] }],
  { range_m: 10, spacing_k: 1.1, layout: 'square' });
ok(two.ok && two.heads.length === 162, '两个 100x100 地块 → 162 喷头（实际 ' + two.heads.length + '）');
ok(two.heads.every(h => core.pointInPolygon(h.x, h.y, sq100) || core.pointInPolygon(h.x, h.y, [{ x: 200, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 100 }, { x: 200, y: 100 }])), '全部落进所属地块（地块间隙无喷头）');

/* ---------- 8. 直接填间距（v384 任务书 P0） ---------- */
console.log('[8] 直接填间距 spacing_m');
const L8 = core.sprinklerLayout([{ poly: sq100 }], { range_m: 10, spacing_m: 12, layout: 'square', heads_per_shift: 12 });
ok(L8.ok === true, 'spacing_m=12 正常出图');
ok(L8.spacing === 12 && L8.rowSpacing === 12, '方形布置 S=row=12（实际 ' + L8.spacing + '/' + L8.rowSpacing + '）');
ok(L8.spacingMode === 'fixed' && L8.spacing_m === 12, 'spacingMode=fixed 且回带 spacing_m');
ok(L8.heads.length === 64, '100x100 地块 12x12 网格 → 精确 64 喷头（实际 ' + L8.heads.length + '）');
ok(L8.heads.every(h => Math.abs(h.x - 6 - Math.round((h.x - 6) / 12) * 12) < 1e-9), '网格步距恰 12（x=6+12c，注入「k 混入推导」会变红）');
ok(L8.heads.every(h => core.pointInPolygon(h.x, h.y, sq100)), '全部喷头落在地块内');
const L8w = core.sprinklerLayout([{ poly: sq100 }], { range_m: 10, spacing_m: 17, layout: 'square' });
ok(L8w.ok === true && L8w.spacing === 17 && Array.isArray(L8w.warn) && L8w.warn.length >= 1, '17m=1.7R 超区间 → warn 不硬拦（12×12 硬参数语义）');
ok(core.sprinklerLayout([{ poly: sq100 }], { range_m: 10, spacing_m: 0, layout: 'square' }).heads.length === 81, '反例：spacing_m=0 无效 → 回落 R×k 原行为');
/* 估算同样支持直接填间距 */
const E8 = core.sprinklerEstimate({ range_m: 10, flow_m3h: 2.5, pressure_kpa: 300, spacing_m: 12, layout: 'square' }, 14400);
ok(E8.ok === true && E8.spacing === 12 && E8.headArea === 144 && E8.headCount === 100, 'estimate：12×12 → headArea=144、14400㎡ → 100 头');
ok(E8.spacingMode === 'fixed' && E8.spacing_m === 12, 'estimate 返回 spacingMode/spacing_m');
ok(!E8.warn.some(w => w.indexOf('偏离') >= 0), '1.2R 在常规区间 → 无偏离告警');
const E8w = core.sprinklerEstimate({ range_m: 10, flow_m3h: 2.5, pressure_kpa: 300, spacing_m: 17, layout: 'square' }, 14400);
ok(E8w.ok === true && E8w.warn.some(w => w.indexOf('偏离') >= 0), 'estimate：1.7R → 偏离告警');
/* 回归：不传 spacing_m 行为与旧版完全一致 */
ok(L2.heads.length === 81 && L2.spacingMode === 'factor' && L2.spacing_m === null, '回归：不传 spacing_m → S=R×k=11、spacingMode=factor、spacing_m=null');
const E8p = core.sprinklerEstimate({ range_m: 8.5, flow_m3h: 0.35, pressure_kpa: 250, spacing_m: 12, layout: 'square' }, 550 * 666.67);
ok(E8p.ok && E8p.headCount === Math.ceil(550 * 666.67 / 144), '任务书喷头参数 350L/h、12×12m：按面积计算点位数');
ok(core.sprinklerEstimate({ range_m: 8.5, flow_m3h: 0.35, pressure_kpa: 2500, spacing_m: 12 }, 550 * 666.67).ok === false, '反例：2500kPa（2.5MPa）压力拒绝估算，避免单位错误');
const P8 = core.sprinklerProjectPlan({ zone_min_mu: 50, zone_max_mu: 60, macro_min_mu: 200, macro_max_mu: 250, flow_m3h: 0.35, range_m: 8.5 }, 500, L8);
ok(P8.ok && P8.zones.recommended === 9 && P8.zones.feasible && Math.abs(P8.zones.average_mu - 55.56) < 0.01, '500亩按50–60亩目标分为9区，均值55.56亩');
ok(P8.macrozones.feasible && P8.macrozones.min === 2 && P8.macrozones.max === 2, '500亩按200–250亩划分为2个大灌溉区');
ok(P8.specifiedNetwork.main_dn_mm === 160 && P8.specifiedNetwork.distribution_dn_mm === 110 && P8.specifiedNetwork.branch_dn_mm === 50 && P8.specifiedNetwork.sprinkler_flow_lh === 350, '任务书规格按字段保留，不被自动管径建议覆盖');
ok(core.sprinklerProjectPlan({}, 121).zones.feasible === false, '反例：无法整分到50–60亩范围时显式报不可行');

/* ---------- 9. 喷灌 BOM 统计（v384 任务书 P0） ---------- */
console.log('[9] sprinklerBom');
const B9 = core.sprinklerBom(L2b, { riser_od_mm: 25, riser_height_m: 3 });
ok(B9.ok === true && B9.version === 1, 'BOM 正常生成');
ok(B9.heads.count === 81 && B9.heads.flowLh === 2500 && B9.heads.radius_m === 10 && B9.heads.spacing_m === 11, '喷头：81 个 × 2500 L/h · R=10 · 间距 11（实际 ' + JSON.stringify(B9.heads) + '）');
ok(B9.risers.count === 81 && B9.risers.od_mm === 25 && B9.risers.height_m === 3, '立管数 = 喷头数，默认 25mm×3m');
ok(Math.abs(B9.pipes.mainline.len_m - 88) < 1e-6 && B9.pipes.mainline.dn_mm === 110, '干管长 = 竖跨 88m、Φ110（实际 ' + B9.pipes.mainline.len_m + '）');
ok(Math.abs(B9.pipes.laterals.len_m - 792) < 1e-6 && B9.pipes.laterals.dn_mm === 75, '支管长 = 9 行×88m = 792m、Φ75（实际 ' + B9.pipes.laterals.len_m + '）');
ok(B9.shifts.groupCount === 7 && B9.shifts.headsPerShift === 12, '轮灌组 = ceil(81/12) = 7 组 × 12 头');
ok(B9.valves.count === null, '未提供地理分区方案时阀门数留空，不再冒用轮灌组数');
const B9P = core.sprinklerBom(L2b, { project: P8 });
ok(B9P.valves.count === 9 && B9P.valves.basis === 'geographic-irrigation-zones', '提供分区方案后按地理小区数统计独立阀门');
ok(B9.tank === null && B9.boost === null && B9.filter === null && B9.fert === null, '未填 tank/boost/filter/fert → 恒 null（不造假数）');
ok(B9.trench && Math.abs(B9.trench.depth_m - 0.5) < 1e-9 && Math.abs(B9.trench.widths.sub_m - 0.4) < 1e-9 && Math.abs(B9.trench.widths.lat_m - 0.3) < 1e-9, 'P2 沟槽默认档：深 0.5 / 干管宽 0.4 / 支管宽 0.3');
const B9n = core.sprinklerBom(L2c);
ok(B9n.ok === true && B9n.heads.flowLh === null && B9n.pipes.mainline.dn_mm === null, '未填喷头流量 → flowLh/管径 null（不造假数）');
ok(core.sprinklerBom(null).ok === false, '反例：null 布置 → 报错');
ok(core.sprinklerBom({ ok: false, error: 'x' }).ok === false, '反例：失败布置 → 报错');
ok(core.sprinklerBom({ ok: true, heads: [] }).ok === false, '反例：零喷头 → 报错');

/* ---------- 10. 蓄水池容积估算（v384 任务书 P1） ---------- */
console.log('[10] tankVolumeEstimate');
const T10 = core.tankVolumeEstimate({ area_mu: 60, etc_mm: 4.5, days: 2, eta: 0.7 });
ok(T10.ok === true && T10.volume_m3 === 515, '60亩×4.5mm×2d/η0.7 → 514.5 → ceil 515 m³（实际 ' + T10.volume_m3 + '）');
ok(T10.formula.indexOf('514.5') >= 0, 'formula 可复算（' + T10.formula + '）');
const T10d = core.tankVolumeEstimate({ area_mu: 1, etc_mm: 1 });
ok(T10d.days === 2 && T10d.eta === 0.7 && T10d.volume_m3 === 2, 'days 缺省=2、eta 缺省=0.7 → ceil(1.905)=2');
ok(core.tankVolumeEstimate({ area_mu: 0, etc_mm: 4.5 }).ok === false, '反例：亩数 0 → 报错');
ok(core.tankVolumeEstimate({ area_mu: 10 }).ok === false, '反例：缺 ETc → 报错');

/* ---------- 11. 二次加压两段泵（v384 任务书 P1，与 hc-core power 同口径） ---------- */
console.log('[11] boostModel');
const B11 = core.boostModel({ q_m3h: 30, total_head_m: 40, split_at_m: 25 });
ok(B11.ok === true, '两段泵正常生成');
ok(B11.stage1.head === 25 && Math.abs(B11.stage1.power_kw - 2.92) < 1e-9, '一段泵 25m：2.725×30×25/0.7/1000 = 2.92 kW（实际 ' + B11.stage1.power_kw + '）');
ok(B11.stage2.head === 15 && Math.abs(B11.stage2.power_kw - 1.75) < 1e-9, '二段泵 15m：= 1.75 kW（实际 ' + B11.stage2.power_kw + '）');
ok(B11.stage1.motor_kw === 3 && B11.stage2.motor_kw === 2.2, '电机贴标：2.92→3、1.75→2.2（标准序列）');
ok(typeof B11.note === 'string' && B11.note.length > 0, 'note 存在');
ok(core.boostModel({ q_m3h: 30, total_head_m: 40, split_at_m: 40 }).ok === false, '反例：起点 ≥ 总扬程 → 报错');
ok(core.boostModel({ q_m3h: 30, total_head_m: 40 }).ok === false, '反例：缺起点 → 报错');
ok(core.boostModel({ q_m3h: 0, total_head_m: 40, split_at_m: 10 }).ok === false, '反例：零流量 → 报错');

/* ---------- 11b. BOM 装配 tank/boost（P1） ---------- */
console.log('[11b] sprinklerBom + tank/boost');
const B11b = core.sprinklerBom(L2b, { riser_od_mm: 25, riser_height_m: 3, tank: { volume_m3: 515, note: '建议值' }, boost: B11 });
ok(B11b.tank && B11b.tank.volume_m3 === 515 && B11b.tank.note === '建议值', 'BOM.tank 装配（UI 算好传入）');
ok(B11b.boost && B11b.boost.stage1.power_kw === 2.92 && B11b.boost.stage2.power_kw === 1.75, 'BOM.boost 两段泵装配');
ok(core.sprinklerBom(L2b, { tank: null, boost: null }).tank === null, '未填 → tank 恒 null（不造假数）');

/* ---------- 12. 沟槽土方 + 板框过滤/溶肥（v384 任务书 P2） ---------- */
console.log('[12] trench / filter / fert');
/* L2b：干管 88m、支管 792m → V = 88×0.5×0.4 + 792×0.5×0.3 = 17.6 + 118.8 = 136.4 m³ */
const B12 = core.sprinklerBom(L2b, { filter: { enabled: true }, fert: { enabled: true } });
ok(B12.trench && Math.abs(B12.trench.volume_m3 - 136.4) < 0.05, '沟槽体积 = 88×0.5×0.4 + 792×0.5×0.3 = 136.4 m³（实际 ' + (B12.trench && B12.trench.volume_m3) + '）');
ok(B12.trench.widths.main_m === 0.5, '主管档沟宽 0.5m 字段保留（主管段不在 terrain 几何内未计入，note 明示）');
ok(B12.filter && B12.filter.type === '板框过滤' && B12.filter.sets === 1 && /茶枯/.test(B12.filter.note), '板框过滤 1 套（茶枯有机肥液过滤，防喷头堵塞）');
ok(B12.fert && B12.fert.tank === '溶肥容器' && B12.fert.pool === '肥液中转池' && B12.fert.sets === 1, '溶肥容器 + 肥液中转池 1 套');
const B12c = core.sprinklerBom(L2b, { trench_depth_m: 0.8, trench_w_sub_m: 0.5, trench_w_lat_m: 0.4, filter: { enabled: true, sets: 2 }, fert: { enabled: true, sets: 3 } });
ok(Math.abs(B12c.trench.volume_m3 - (88 * 0.8 * 0.5 + 792 * 0.8 * 0.4)) < 0.05, '自定义沟深/沟宽 → 体积可复算（实际 ' + B12c.trench.volume_m3 + '）');
ok(B12c.filter.sets === 2 && B12c.fert.sets === 3, '过滤/溶肥数量可配');
const B12n = core.sprinklerBom(L2b, { filter: { enabled: false }, fert: { enabled: false } });
ok(B12n.filter === null && B12n.fert === null, '不勾选 → filter/fert 恒 null（不造假数）');

console.log('===== sprinkler layout: PASS=' + pass + ' FAIL=' + fail + ' =====');
if (fail > 0) process.exitCode = 1;
