#!/usr/bin/env node
'use strict';
/* tests/v1053_pipe_reuse_generation.test.cjs —— 三级复用二级管线的代际校验锁（数据唯一性续篇）
 *
 * 用户拍板：二级/三级合并后，地块唯一、分区唯一、管线只生成一次（入口=二级「生成施工图」）。
 * 深挖发现合并不彻底的残留：三级 tlAutoGenerate 里滴灌带**每次**按当前分区切割现算，
 * 而主管/支管走 ppHasPipes 分支**无校验复用**二级 ppState 存档——分区参数改过之后
 * （边界没变），同一张三级图上就是「新滴灌带 + 旧管线」两代数据并存
 * （用户实测：滴灌带纵向、管线竖直与其平行，方向报告还是旧布局的）。
 *
 * 锁三件事：
 *   ① RunyeBridge.getPartitionSnapshot 必须带 genCutSig（二级生成时签名随管线走）；
 *   ② 三级复用分支必须校验代际：签名不一致不复用（走兜底自布管，与滴灌带同一 cuts 恒同代）；
 *   ③ 兜底生成时图面必须红字常驻提示回二级重新生成。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const pe = fs.readFileSync(path.join(ROOT, 'mod', 'plot-editor.js'), 'utf8');
const i09 = fs.readFileSync(path.join(ROOT, 'mod', 'inline-09.js'), 'utf8');

test('① RunyeBridge.getPartitionSnapshot 必须带 genCutSig（生成时签名随管线走）', () => {
  const bridge = pe.slice(pe.indexOf('getPartitionSnapshot: function()'), pe.indexOf('hasPlot: function()'));
  assert.match(bridge, /genCutSig:ppState\.__ppGenCutSig\|\|null/,
    'getPartitionSnapshot 必须导出 genCutSig，供三级复用分支校验代际');
});

test('② 三级复用二级管线必须先校验代际，签名不一致不复用', () => {
  const guard = i09.slice(i09.indexOf('var ppPipesStale=false;'), i09.indexOf('if(ppHasPipes&&!ppPipesStale){'));
  assert.match(guard, /ppShare\.genCutSig\s*&&\s*ppShare\.genCutSig!==_curSig/,
    '复用前必须比较 ppShare.genCutSig 与现算签名');
  assert.match(i09, /if\(ppHasPipes&&!ppPipesStale\)\{/,
    '复用分支必须被代际校验拦截：stale 时不复用二级管线');
  assert.match(i09, /window\.__tlPipesReusedStale=ppPipesStale;/,
    '校验结果必须落全局标志（状态行/探针消费）');
  /* 兜底自布管与滴灌带共用同一套 cuts（同一 xPos/ySrc/xPlan/yPlan），恒同代。 */
  const fallback = i09.slice(i09.indexOf('if(ppHasPipes&&!ppPipesStale){'), i09.indexOf('===== 滴灌带示意'));
  assert.match(fallback, /tlActualCellCenter/, '兜底自布管必须在场（else 分支）');
  assert.match(fallback, /滴灌带沿长边；支管横跨分区短边中心/, '兜底自布管与滴灌带同一分区几何');
});

test('③ 兜底生成时图面必须红字常驻提示回二级重新生成', () => {
  assert.match(i09, /二级管线与当前分区不同代，本次图面按当前分区兜底生成/,
    '红字提示文案必须在场');
  assert.match(i09, /tlAxisHintStaleGroup/, '提示必须是独立 SVG 组（随图导出/剥离口径一致）');
  assert.match(i09, /__tlPipesReusedStale\)\s*\{[\s\S]{0,400}请回「分区与管路」页点「生成施工图」/,
    '提示必须挂全局标志，独立于方向报告条件渲染');
});
