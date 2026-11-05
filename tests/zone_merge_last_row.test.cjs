/* tests/zone_merge_last_row.test.cjs —— v969「末排并入上排」纯函数锁
   ═══════════════════════════════════════════════════════════════════════════
   背景（2026-11-05 用户拍板「方案C」）：手动亩/区模式下，地块高除不尽设计格高
   时末排是被边界裁出来的余排（521×423.6 / 24亩 / 固定边160 → 行 [160,160,103.6]，
   末排每格仅 ~15.7 亩）。勾选 #planZoneMergeLast 后末排整排并入上一排
   → [160,263.6]，15 区 → 10 区，单区面积增大、水力与材料全链路跟随。

   本锁验证 mod/zone-geometry.js 的纯函数行为（不进页面）：
     A. splitZoneLength 缺省行为与 v877 逐字节一致（不传 mergeLast 不变）
     B. mergeLast=true：末段整段并入前一段，单段不并，窄条吸收先于合并
     C. manualZoneLayout：行数/N 按「并入后」计；设计口径（zoneArea/designW/H）不变；
        yParts 返回并入后数组；mergeLastRow 标志回传
     D. 上限校验用「并入后」行数：15>10 会抛，并入后 10≤10 通过
     E. VERSION = 891（与 index.html ?v=969-zone-merge-last、sw.js 同批上抬）
   用法：node tests/zone_merge_last_row.test.cjs   exit 0=全过 / 1=有失败
   ═══════════════════════════════════════════════════════════════════════════ */
const assert = require('assert');
const G = require('../mod/zone-geometry.js');

const results = [];
function check(name, fn) {
  try { fn(); results.push(true); console.log('[PASS] ' + name); }
  catch (e) { results.push(false); console.log('[FAIL] ' + name + '  :: ' + e.message); }
}
const close = (a, b, eps) => Math.abs(a - b) < (eps == null ? 1e-6 : eps);
const arrClose = (a, b, eps) => Array.isArray(a) && a.length === b.length && a.every((v, i) => close(v, b[i], eps == null ? 1e-6 : eps));

/* ---------- A. 缺省行为不变（v877 口径回归锚） ---------- */
check('A1 423.6/160 → [160,160,103.6]（余排独立成段）', () => {
  assert.ok(arrClose(G.splitZoneLength(423.6, 160, 500), [160, 160, 103.6], 1e-9));
});
check('A2 480/160 → [160,160,160]（整除）', () => {
  assert.ok(arrClose(G.splitZoneLength(480, 160, 500), [160, 160, 160], 1e-9));
});
check('A3 521/100 → [104.2 ×5]（窄条吸收均摊，不因本次改动变化）', () => {
  const p = G.splitZoneLength(521, 100, 500);
  assert.strictEqual(p.length, 5);
  p.forEach(v => assert.ok(close(v, 104.2, 1e-9)));
});
check('A4 显式传 false 与缺省逐字节一致', () => {
  const a = G.splitZoneLength(423.6, 160, 500);
  const b = G.splitZoneLength(423.6, 160, 500, false);
  assert.deepStrictEqual(b, a);
});

/* ---------- B. mergeLast 合并行为 ---------- */
check('B1 423.6/160+merge → [160,263.6]（末排并入上一排）', () => {
  assert.ok(arrClose(G.splitZoneLength(423.6, 160, 500, true), [160, 263.6], 1e-9));
});
check('B2 480/160+merge → [160,320]', () => {
  assert.ok(arrClose(G.splitZoneLength(480, 160, 500, true), [160, 320], 1e-9));
});
check('B3 单段不并：160/160+merge → [160]；80/160+merge → [80]', () => {
  assert.ok(arrClose(G.splitZoneLength(160, 160, 500, true), [160], 1e-9));
  assert.ok(arrClose(G.splitZoneLength(80, 160, 500, true), [80], 1e-9));
});
check('B4 总和守恒：并入前后 Σ=total', () => {
  const before = G.splitZoneLength(423.6, 160, 500);
  const after = G.splitZoneLength(423.6, 160, 500, true);
  assert.ok(close(before.reduce((s, v) => s + v, 0), after.reduce((s, v) => s + v, 0), 1e-9));
});

/* ---------- C. manualZoneLayout ---------- */
check('C1 不勾选：521×423.6 / 24亩 / 160 → 5列×3行=15区', () => {
  const L = G.manualZoneLayout(521, 423.6, 24, 160, 666.67, 500);
  assert.strictEqual(L.cols, 5); assert.strictEqual(L.rows, 3); assert.strictEqual(L.N, 15);
});
check('C2 勾选：同参数 → 5列×2行=10区，yParts=[160,263.6]，mergeLastRow=true', () => {
  const L = G.manualZoneLayout(521, 423.6, 24, 160, 666.67, 500, true);
  assert.strictEqual(L.cols, 5); assert.strictEqual(L.rows, 2); assert.strictEqual(L.N, 10);
  assert.ok(arrClose(L.yParts, [160, 263.6], 1e-9));
  assert.strictEqual(L.mergeLastRow, true);
});
check('C3 设计口径不变：zoneArea≈24亩、designW≈100（666.67 舍入容差内，不随并入改变）', () => {
  const L0 = G.manualZoneLayout(521, 423.6, 24, 160, 666.67, 500);
  const L1 = G.manualZoneLayout(521, 423.6, 24, 160, 666.67, 500, true);
  assert.ok(close(L0.zoneArea / 666.67, 24, 0.001) && close(L1.zoneArea / 666.67, 24, 0.001));
  assert.ok(close(L0.designW, 100, 0.001) && close(L1.designW, 100, 0.001));
  assert.ok(close(L0.designH, 160, 1e-9) && close(L1.designH, 160, 1e-9));
});
check('C4 并入后末排格面积 ≈41.2 亩（104.2 × 263.6）', () => {
  const L = G.manualZoneLayout(521, 423.6, 24, 160, 666.67, 500, true);
  const xP = G.splitZoneLength(521, L.designW, 500);
  const cellMu = xP[0] * L.yParts[1] / 666.67;
  assert.ok(close(cellMu, 41.2, 0.05));
});

/* ---------- D. 上限校验用「并入后」行数 ---------- */
check('D1 limit=10：不勾选 15>10 抛 manual_zone_count_exceeded', () => {
  assert.throws(() => G.manualZoneLayout(521, 423.6, 24, 160, 666.67, 10),
    e => e.code === 'manual_zone_count_exceeded');
});
check('D2 limit=10：勾选后 10≤10 通过且 N=10', () => {
  const L = G.manualZoneLayout(521, 423.6, 24, 160, 666.67, 10, true);
  assert.strictEqual(L.N, 10);
});

/* ---------- E. 版本 ---------- */
check('E1 VERSION = 891', () => { assert.strictEqual(Number(G.VERSION), 891); });

const ok = results.length > 0 && results.every(Boolean);
console.log('\n' + (ok ? '== 全部通过 ==' : '== 存在失败项 =='));
process.exit(ok ? 0 : 1);
