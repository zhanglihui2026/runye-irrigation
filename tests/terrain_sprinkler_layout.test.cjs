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
ok(L2b.mainDN && L2b.mainDN.dn === 90 && Math.abs(L2b.mainFlow - 30) < 1e-9, '布置图：干管流量 12×2.5=30 → Φ90');
ok(L2b.latDN && Math.abs(L2b.latFlow - 22.5) < 1e-9 && L2b.latDN.dn === 90, '布置图：最不利支管 min(12,9)×2.5=22.5 m³/h → Φ90');
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

console.log('===== sprinkler layout: PASS=' + pass + ' FAIL=' + fail + ' =====');
if (fail > 0) process.exitCode = 1;
