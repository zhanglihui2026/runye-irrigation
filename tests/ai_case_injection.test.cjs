'use strict';
/* [v845 众包案例库打包] AI 规划的相似案例注入：
 *   ① bboxRatioOf 口径与 runye-case-library.js build() 的 feature.bbox_ratio 一致；
 *   ② buildUserPrompt 注入段：有 similars 出「五、相似工程案例参考」，输出要求顺延为「六」；
 *      无 similars 时与旧版逐字一致（输出要求仍是「五」），且不出现案例段；
 *   ③ caseLine 只取 feature/engine_check 规范化字段，null 字段不出现；
 *   ④ similarCases fail-open：案例库为空/未配置/抛错一律 null，绝不炸 AI。
 * 注意：process.env 在 require 前设置。NODE_ENV=test 使 lib/case-library.cjs 走进程内存（空库）。 */
process.env.NODE_ENV = 'test';
const test = require('node:test'), assert = require('node:assert/strict');
const ai = require('../api/ai-irrigation.js');
const T = ai.__test;

const POLY = [{x:0,y:0},{x:120,y:0},{x:120,y:100},{x:0,y:100}];

test('bboxRatioOf matches feature.bbox_ratio formula (max/min edge ratio)', () => {
  /* 与前端 build() 同公式：12000m² 的 120×100 地块 → 1.2 */
  const r = T.bboxRatioOf(POLY);
  assert.ok(Math.abs(r - 1.2) < 1e-9);
  assert.equal(T.bboxRatioOf([{x:0,y:0},{x:1,y:0}]), null);
  assert.equal(T.bboxRatioOf(null), null);
});

test('buildUserPrompt without similars is byte-identical to legacy shape (no case section)', () => {
  const p = T.buildUserPrompt({ polygon: POLY, area: 12000, terrain_dh: 5, pump_lift: 5, src_distance: 30, tape_pressure: 1, slope: 2, user_text: '种玉米', cur: {} });
  assert.ok(!p.includes('相似工程案例'));
  assert.ok(p.includes('## 五、输出要求'));
  assert.ok(!p.includes('## 六、'));
});

test('buildUserPrompt with similars injects case section and shifts output section to six', () => {
  const sim = [{ source: 'manual', status: 'deployed', rating: 5,
    feature: { area_m2: 12000, mu: 18, tape_spacing: 0.7, emitter_spacing: 0.3, emitter_flow: 0.8, zone_mu: 18 },
    engine_check: { pump_head_m: 31, pump_flow_m3h: 11, main_od_mm: 90, branch_od_mm: 63 } }];
  const p = T.buildUserPrompt({ polygon: POLY, area: 12000, cur: {}, similars: sim });
  assert.ok(p.includes('## 五、相似工程案例参考'));
  assert.ok(p.includes('## 六、输出要求'));
  /* 案例行来自 feature/engine_check，不出现 input_values 的页面原始 key */
  assert.ok(p.includes('带距0.70m'));
  assert.ok(p.includes('扬程31.0m'));
  assert.ok(p.includes('不得照抄为本地块结论'));
  assert.ok(!p.includes('planTapeSpacing'));
  assert.ok(!p.includes('input_values'));
});

test('caseLine omits null fields and never throws on empty case', () => {
  const line = T.caseLine(0, { source: 'ai', status: 'pending', rating: 0, feature: {}, engine_check: {} });
  assert.ok(/^\d?1?\. /.test(line) && line.startsWith('1. '));
  assert.ok(!line.includes('undefined') && !line.includes('NaN'));
  assert.ok(line.includes('待施工'));
});

test('similarCases fail-open: empty library / bad input / missing area → null', async () => {
  assert.equal(await T.similarCases({ area: 12000, polygon: POLY }), null); /* 空库 */
  assert.equal(await T.similarCases({ area: 0, polygon: POLY }), null);
  assert.equal(await T.similarCases({ area: 12000, polygon: [] }), null);
  assert.equal(await T.similarCases({ polygon: POLY }), null);
  assert.equal(await T.similarCases(null), null);
});
