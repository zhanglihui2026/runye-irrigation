'use strict';
/* tests/est_group_pipes_source.test.cjs —— 地图「本轮需求扬程」估算的**流量/管径/长度同源**（v955）
 *
 * 用户 2026-11-04 两条口径：
 *   ① 「在 tlEstimateGroupHead 内按本组实际流量重选三段管径（selectPipe(qGroup, targetV, downstreamMinOd)
 *       / 各区 selectPipe(q, …)），让损失和卡片上的建议口径一致」；
 *   ② 「总管就按照地图实测多长就是多长来计算，不要再加这个 200 米」。
 *
 * 病史（为什么必须有锁）：
 *   v950 的估算是「拿 computeThreeLevel 的 r.frontPipe/r.mainPipe/r.branchPipe 直接算损失」——
 *   那三档管是按**输入框面积**（fluxAreaM2）选的，而损失按**地图分区实测面积**算。
 *   实测面积更大 ⇒ 流量高 ~17% ⇒ Q^1.852 放大 1.34 倍，再叠加管径低一档（D^-4.87）
 *   ⇒ 主管损失凭空接近翻倍（实测 7.63 m，同源后 3.98 m）；同时卡片建议 Ø225、损失按 Ø200 算，
 *   同一张卡两个口径。总管长度同理：地图上明明画了 510.4 m，却被 tl_frontPipeLen 的默认 200 m 顶掉。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const rawInline = fs.readFileSync(path.join(ROOT, 'mod', 'inline-09.js'), 'utf8');
const rawDemo = fs.readFileSync(path.join(ROOT, 'mod', 'map-flow-demo.js'), 'utf8');

const estBody = (() => {
  const i = rawInline.indexOf('function tlEstimateGroupHead(');
  assert.ok(i >= 0, 'inline-09.js 里必须还有 tlEstimateGroupHead');
  const j = rawInline.indexOf('\nwindow.tlMapGroupHydraulicsOf', i);
  assert.ok(j > i, '找不到估算函数体的结束位置');
  return rawInline.slice(i, j);
})();

/* ① 损失必须用**本函数自己选的**管径，不许再借 computeThreeLevel 的 r.*Pipe */
test('① 损失不再借 r.frontPipe / r.mainPipe / r.branchPipe', () => {
  assert.equal(/hazenWilliams\(\s*r\.frontLenUsed/.test(estBody), false, '总管损失还在用 r.frontLenUsed（试算 200 m 会漏进来）');
  assert.equal(/hazenWilliams\([^)]*r\.mainPipe\.id/.test(estBody), false, '主管损失还在用 r.mainPipe.id（按输入面积选的档）');
  assert.equal(/hazenWilliams\([^)]*r\.branchPipe\.id/.test(estBody), false, '支管损失还在用 r.branchPipe.id（同上）');
});

/* ② 三段各自按**本组/本区实际流量**重选 */
test('② 总管按 qGroup、主管按本区 q、支管按 q/并联数现选', () => {
  assert.ok(/selectPipe\(qGroup,\s*r\.targetV,\s*downstreamMinOd\)/.test(estBody),
    '总管必须 selectPipe(qGroup, targetV, downstreamMinOd)');
  assert.ok(/selectPipe\(q \/ par,\s*r\.targetV,\s*0,\s*BRANCH_PIPE_MAX_OD\)/.test(estBody),
    '支管必须 selectPipe(q / par, targetV, 0, BRANCH_PIPE_MAX_OD)');
  assert.ok(/selectPipe\(q,\s*r\.targetV,\s*MAIN_PIPE_MIN_OD\)/.test(estBody),
    '主管必须 selectPipe(q, targetV, MAIN_PIPE_MIN_OD)');
  /* trunkAdvice 必须回填这几档，否则「建议口径」与「计算口径」又会分叉 */
  assert.ok(/mainOd:\s*maxMainOd/.test(estBody) && /branchOd:\s*maxBranchOd/.test(estBody),
    'trunkAdvice 的 mainOd/branchOd 必须是本次选出来的档（v950 写的是 r.mainPipe.od）');
});

/* ③ 总管长度只认地图实测/图面，试算输入不参与 */
test('③ 总管长度：只有 mapTrunk / figure 才计入，input（200 m）一律归零', () => {
  assert.ok(/r\.frontLenSrc === 'mapTrunk' \|\| r\.frontLenSrc === 'figure'/.test(estBody),
    '缺少长度来源白名单判断');
  assert.ok(/frontSource = 'none'/.test(estBody), '取不到实测时必须标 frontSource=none，界面才能说「未绘制」');
  assert.ok(/lengths:\s*\{\s*front:\s*frontLen/.test(estBody), 'lengths.front 必须是本地算出的 frontLen，不是 r.frontLenUsed');
});

/* ④ 卡片要能自证：管径 / 长度来源 / 富余+系数都从返回值取 */
test('④ 返回值带 pipes / marginHead / safetyFactor，卡片照抄', () => {
  ['pipes:', 'marginHead:', 'safetyFactor:', 'staticHead:', 'lengthSource:'].forEach(function (k) {
    assert.ok(estBody.indexOf(k) >= 0, '估算返回值缺字段 ' + k);
  });
  /* [v977] 卡片改列表版式：口径自证改为 管段×管径/长度/流速 三行表（mfg-seg）。 */
  assert.ok(/mfg-seg/.test(rawDemo) && /管段/.test(rawDemo), '卡片要有管径/长度/流速三行列表');
  assert.ok(/另加富余 /.test(rawDemo), '卡片缺「另加富余 … × 安全系数 …」尾行');
  assert.ok(/未绘制/.test(rawDemo), '卡片必须能明说总管「未绘制」');
  assert.equal(/按长度估算：总管/.test(rawDemo), false, '旧的「按长度估算：总管 …」文案应已替换（它会把 200 m 当实长展示）');
});
