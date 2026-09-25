/* hc_core.test.cjs — 水力计算器核心（hydraulic-calc/hc-core.js）回归
 * 运行：node tests/hc_core.test.cjs   （或随 _p1/_gates.cjs 的「单测」项一起跑）
 *
 * 覆盖（2026-09-17 第六十二轮）：
 *   · 内径折算（SDR13.6 / 17 / 21 / 直接内径）
 *   · Hazen-Williams 数值（与手写独立算式逐值比对）
 *   · 默认预设 = 用户描述的那套拓扑（总管 225×200 → 2 根 160×500，每根 4 个三通接 110×80）
 *   · 流量自下而上累加（支管 → 主管 → 总管）
 *   · 指定路径逐段累加（含「同一条主管上不同三通 → 段流量不同」）
 *   · 局部损失（ζ / 开关）
 *   · 全部组合矩阵 + 最不利 / 最有利
 *   · normalize 兜底（clamp / 排序 / 白名单 / 非法值）
 *   · ★ 交叉校验：本模块公式必须与 index.html 里的 hazenWilliams / peInnerDiam / 经济流速常数**同口径**
 *     —— 这是防「两处口径各自漂移」的关键一条。
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const H = require(path.join(__dirname, '..', 'hydraulic-calc', 'hc-core.js'));

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ FAIL ' + name + (extra !== undefined ? ' — ' + extra : '')); }
}
function near(a, b, tol, name) { ok(Math.abs(a - b) <= tol, name, a + ' vs ' + b); }

/* ---------- 1. 内径折算 ---------- */
console.log('\n[1] 内径折算');
near(H.innerDiam(225, 'sdr13.6'), 225 * (1 - 2 / 13.6), 1e-9, '225 外径 → 内径（SDR13.6）');
near(H.innerDiam(160, 'sdr13.6'), 160 * (1 - 2 / 13.6), 1e-9, '160 外径 → 内径（SDR13.6）');
near(H.innerDiam(110, 'sdr13.6'), 110 * (1 - 2 / 13.6), 1e-9, '110 外径 → 内径（SDR13.6）');
near(H.innerDiam(225, 'sdr17'), 225 * (1 - 2 / 17), 1e-9, 'SDR17 折算');
near(H.innerDiam(225, 'sdr21'), 225 * (1 - 2 / 21), 1e-9, 'SDR21 折算');
ok(H.innerDiam(225, 'id') === 225, '「直接按内径」模式：输入即内径');
ok(H.validCaliber('bogus') === 'sdr13.6' && H.validCaliber('id') === 'id', '口径白名单兜底');

/* ---------- 2. Hazen-Williams 与独立算式比对 ---------- */
console.log('\n[2] Hazen-Williams');
function hw(L, Q, d, C) { return 1.113e9 * L * Math.pow(Q, 1.852) / (Math.pow(C, 1.852) * Math.pow(d, 4.87)); }
[[200, 48, 191.9], [125, 24, 136.5], [80, 6, 93.8], [500, 1.5, 50.0]].forEach(function (c) {
  near(H.hazen(c[0], c[1], c[2], 150), hw(c[0], c[1], c[2], 150), 1e-12,
    'hf(' + c[0] + 'm, ' + c[1] + 'm³/h, ' + c[2] + 'mm) 与独立算式一致');
});
ok(H.hazen(100, 0, 100, 150) === 0 && H.hazen(0, 10, 100, 150) === 0 && H.hazen(100, 10, 0, 150) === 0,
  '零流量 / 零长度 / 零管径 → 0（不产生 NaN/Infinity）');
ok(H.hazen(100, 10, 100, 140) > H.hazen(100, 10, 100, 150), 'C 越小损失越大（140 > 150）');
near(H.hazen(100, 10, 100, 150) / H.hazen(100, 5, 100, 150), Math.pow(2, 1.852), 1e-9,
  '流量加倍 → 损失 ×2^1.852（指数口径正确）');
near(H.hazen(100, 10, 100, 150) / H.hazen(50, 10, 100, 150), 2, 1e-12, '长度加倍 → 损失加倍');

/* ---------- 3. 流速 / 状态 ---------- */
console.log('\n[3] 流速与状态');
near(H.velocity(48, H.innerDiam(225)), 48 / 3600 / (Math.PI * Math.pow(H.innerDiam(225) / 1000, 2) / 4), 1e-12, 'v = Q/3600/A');
ok(H.velocity(0, 100) === 0, '零流量 → 0 m/s');
ok(H.statusOf(0.5) === '流速偏低' && H.statusOf(1.2) === '可选' && H.statusOf(2.5) === '流速偏高', '经济流速状态词表');

/* ---------- 4. 默认预设 = 用户描述的拓扑 ---------- */
console.log('\n[4] 默认预设（用户描述）');
const d0 = H.normalize(H.defaultConfig());
ok(d0.trunk.od === 225 && d0.trunk.len === 200, '总管 225 / 200 m');
ok(d0.mains.length === 2, '三通后分出两路 → 主管 2 根');
ok(d0.mains.every(function (m) { return m.od === 160 && m.len === 500; }), '两路主管都是 160 / 500 m');
ok(d0.mains.every(function (m) { return m.taps.length === 4; }), '每根主管 4 个三通');
ok(d0.mains.every(function (m) { return m.taps.every(function (t) { return t.od === 110 && t.len === 80 && t.flow === 6; }); }),
  '每个三通接 110 / 80 m 支管（默认流量 6 m³/h）');
ok(JSON.stringify(d0.mains[0].taps.map(function (t) { return t.at; })) === JSON.stringify([125, 250, 375, 500]),
  '三通沿 500 m 均分（125/250/375/500，末端无零流量死管段）');
ok(d0.includeLocal === true && d0.juncZeta === 1 && d0.C === 150, '默认：计入局部损失 ζ=1.0、C=150');

/* ---------- 5. 流量自下而上累加 ---------- */
console.log('\n[5] 流量累加');
ok(H.trunkFlow(d0) === 48, '总管流量 = 8×6 = 48 m³/h');
ok(H.mainFlow(d0, 0) === 24 && H.mainFlow(d0, 1) === 24, '每根主管 24 m³/h');
const mixed = H.normalize({
  trunk: { od: 225, len: 200 }, caliber: 'sdr13.6',
  mains: [{ od: 160, len: 500, taps: [{ at: 125, od: 110, len: 80, flow: 3 }, { at: 250, od: 110, len: 80, flow: 9 }] }]
});
ok(H.mainFlow(mixed, 0) === 12 && H.trunkFlow(mixed) === 12, '支管流量不等时按和各异（3+9=12）');

/* ---------- 6. 指定路径逐段累加 ---------- */
console.log('\n[6] 路径分段累加（核心）');
const p11 = H.pathLoss(d0, 0, 0);
ok(p11.legs.length === 3, '主管1→支管1 = 3 段（总管 + 主管 + 支管）');
ok(JSON.stringify(p11.legs.map(function (l) { return l.L; })) === JSON.stringify([200, 125, 80]),
  '段长 = 200 / 125 / 80 m');
ok(JSON.stringify(p11.legs.map(function (l) { return l.Q; })) === JSON.stringify([48, 24, 6]),
  '段流量 = 48 / 24 / 6 m³/h');
near(p11.legs[0].hf, hw(200, 48, H.innerDiam(225), 150), 1e-12, '总管段损失与独立算式一致');
near(p11.hf, p11.legs.reduce(function (s, l) { return s + l.hf; }, 0), 1e-12, '沿程合计 = 各段之和');
near(p11.total, p11.hf + p11.hlocal, 1e-12, '合计 = 沿程 + 局部');

const p23 = H.pathLoss(d0, 1, 2);
ok(p23.legs.length === 5, '主管2→支管3 = 总管 + 3 段主管 + 支管 = 5 段');
ok(JSON.stringify(p23.legs.filter(function (l) { return l.kind === 'main'; }).map(function (l) { return l.Q; })) === JSON.stringify([24, 18, 12]),
  '主管逐段流量递减 24 → 18 → 12 m³/h（每过一个三通掉一根支管的流量）');
ok(p23.total > p11.total, '走到第 3 个三通的路径损失 > 走到第 1 个三通的路径损失');
const p14 = H.pathLoss(d0, 0, 3);
ok(p14.total > p23.total, '同根主管走到第 4 个三通 > 第 3 个三通');
near(H.pathLoss(d0, 0, 0).total, H.pathLoss(d0, 1, 0).total, 1e-12, '两根主管对称 → 第 1 根支管的路径损失相同');
ok(/主管2 .*支管3/.test(p23.label), '路径标签含「主管2 / 支管3」', p23.label);

/* ---------- 7. 局部损失 ---------- */
console.log('\n[7] 局部损失');
const noLocal = H.normalize(Object.assign({}, d0, { includeLocal: false }));
near(H.pathLoss(noLocal, 1, 2).hlocal, 0, 1e-12, '关掉局部损失 → 局部合计 = 0');
near(H.pathLoss(noLocal, 1, 2).total, H.pathLoss(noLocal, 1, 2).hf, 1e-12, '关掉后 合计 = 沿程');
const z2 = H.normalize(Object.assign({}, d0, { juncZeta: 2 }));
near(H.pathLoss(z2, 1, 2).hlocal, 2 * H.pathLoss(d0, 1, 2).hlocal, 1e-9, 'ζ 加倍 → 局部损失加倍');
ok(H.pathLoss(d0, 0, 0).localLegs.length === 2, '主管1→支管1 经过 2 个三通（1 个总管分水 + 1 个分水口）');
ok(H.pathLoss(d0, 1, 2).localLegs.length === 4, '主管2→支管3 经过 4 个三通（1 + 3）');
near(H.localLoss(2, 1), 2 * 2 / 19.62, 1e-12, 'ζ·v²/(2g) 算式');

/* ---------- 8. 全部组合 + 最不利 ---------- */
console.log('\n[8] 任意组合');
const all = H.allPaths(d0);
ok(all.rows.length === 8, '2 根主管 × 4 根支管 = 8 条组合路径');
ok(all.rows.filter(function (r) { return r.isWorst; }).length === 1, '恰好 1 条标为最不利');
ok(all.rows.filter(function (r) { return r.isBest; }).length === 1, '恰好 1 条标为最有利');
const worst = H.worstPath(d0);
ok(worst.mi === 0 && worst.ti === 3, '默认拓扑最不利 = 主管1 → 支管4（走到最末三通）',
  JSON.stringify(worst));
near(all.rows[all.worstIndex].total, Math.max.apply(null, all.rows.map(function (r) { return r.total; })), 1e-12,
  'worstIndex 对齐最大值');
const s = H.summary(d0);
near(s.totalLen, 200 + 2 * 500 + 8 * 80, 1e-9, '全部管道总长 = 200 + 2×500 + 8×80 m');
ok(s.taps === 8 && s.mains === 2, '汇总：2 主管 / 8 支管');

/* ---------- 9. normalize 兜底 ---------- */
console.log('\n[9] normalize 兜底');
const bad = H.normalize({
  C: 0, caliber: 'xxx',
  trunk: { od: 0, len: -5 },
  mains: [{ od: 160, len: 500, taps: [{ at: 900, od: 110, len: 80, flow: -3 }, { at: 100, od: 110, len: 80, flow: 5 }] }]
});
ok(bad.C === 150, 'C=0 → 回落 150');
ok(bad.caliber === 'sdr13.6', '非法口径 → 回落 SDR13.6');
ok(bad.trunk.od === 225 && bad.trunk.len === 0, '总管管径 0 → 回落 225；长度负数 → 0');
ok(bad.mains[0].taps[0].at === 100 && bad.mains[0].taps[1].at === 500, '三通位置升序重排且 clamp 到主管长（900→500）');
ok(bad.mains[0].taps.filter(function (t) { return t.at === 100; })[0].flow === 5, '负流量 → 0');
ok(H.normalize({}).mains.length === 2, '空配置 → 回落默认预设');
ok(H.normalize({ mains: [{ od: 160, len: 300 }] }).mains[0].taps.length === 1, '主管没有三通 → 补 1 个（在末端）');
/* 主管列表为空时 normalize 回落到默认预设（而非算成 0 的「假结果」）——
   界面上「删除主管」在只剩 1 根时是禁用的，故这条只兜存档损坏。 */
ok(H.pathLoss({ mains: [] }, 0, 0).total > 0, '主管为空 → 回落默认预设，不产生 0 的假结果');
ok(H.summary(null).taps === 8, 'summary(null) 走默认预设，不抛异常');

/* ---------- 10. ★ 与 index.html 同口径交叉校验 ---------- */
console.log('\n[10] 与 index.html 同口径交叉校验');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function grab(re, label) {
  const m = html.match(re);
  ok(!!m, '能从 index.html 抽到 ' + label);
  return m ? m[0] : '';
}
const srcHw = grab(/function hazenWilliams\(L, Q, d\) \{[\s\S]*?\n\}/, 'hazenWilliams()');
const srcId = grab(/function peInnerDiam\(od\) \{[^\n]*\}/, 'peInnerDiam()');
const srcC = grab(/const C_HAZEN = \d+;/, 'C_HAZEN 常量');
const srcSdr = grab(/const SDR = [\d.]+;/, 'SDR 常量');
const srcEconMin = grab(/const ECON_VMIN = [\d.]+;/, 'ECON_VMIN 常量');
const srcEconMax = grab(/const ECON_VMAX = [\d.]+;/, 'ECON_VMAX 常量');

const design = require('../hydraulic-calc/design-core.js');
const hostHw = new Function('C_HAZEN', 'RyDesignCore', srcHw + '\nreturn hazenWilliams;')(parseInt(srcC.match(/\d+/)[0], 10), design);
const hostId = new Function('SDR', 'RyDesignCore', srcId + '\nreturn peInnerDiam;')(parseFloat(srcSdr.match(/[\d.]+/)[0]), design);

[[200, 48, 191.9], [125, 24, 136.5], [80, 6, 93.8], [333, 7.25, 61.3]].forEach(function (c) {
  near(H.hazen(c[0], c[1], c[2], H.C_DEFAULT), hostHw(c[0], c[1], c[2]), 1e-12,
    'hc-core.hazen 与 index.html hazenWilliams 同值 (' + c.join(',') + ')');
});
[50, 110, 160, 225, 315].forEach(function (od) {
  near(H.innerDiam(od, 'sdr13.6'), hostId(od), 1e-12, 'hc-core.innerDiam 与 index.html peInnerDiam 同值 (OD' + od + ')');
});
ok(H.C_DEFAULT === parseInt(srcC.match(/\d+/)[0], 10), 'C 默认值与 index.html C_HAZEN 一致');
ok(H.SDR_DEFAULT === parseFloat(srcSdr.match(/[\d.]+/)[0]), 'SDR 默认值与 index.html SDR 一致');
ok(H.ECON_VMIN === parseFloat(srcEconMin.match(/[\d.]+/)[0]) && H.ECON_VMAX === parseFloat(srcEconMax.match(/[\d.]+/)[0]),
  '经济流速区间与 index.html 一致（Vmin/Vmax）');
ok(H.PE_OD_SERIES.join(',') === (html.match(/const PE_OD_SERIES = \[([^\]]+)\];/)[1].replace(/\s/g, '')),
  'PE 管径序列与 index.html PE_OD_SERIES 完全一致');

console.log('\n== 结论：PASS=' + pass + ' FAIL=' + fail + ' ==');
process.exit(fail ? 1 : 0);
