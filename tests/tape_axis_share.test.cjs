#!/usr/bin/env node
'use strict';
/* tests/tape_axis_share.test.cjs —— 滴灌带轴跟随传导主管（v881-tape-axis-share）静态锁
 *
 * 用户实测：统一工作区里滴灌带与主管平行（应垂直）。根因：二级传导管线（ppHasPipes）时
 * 主管/支管来自二级 cuts，三级却用自己的网格变量（设计口径 xPlan/yPlan，与二级 bbox
 * 均分 cuts 尺寸不同）重跑 tapeAxisOf 投票 → 两票翻转（实测二级 y:8 / 三级 x:8）→
 * 带 ∥ 主管。v416 的「单一事实源」实际是两份事实源。
 * 锁定：ppHasPipes 时必须先按传导主管最长主向定带轴（构造性垂直），tapeAxisOf 投票
 * 只允许在无二级管线（三级自布管）时兜底；segs 复用二级报告需形状校验。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const i09 = fs.readFileSync(path.join(ROOT, 'mod', 'inline-09.js'), 'utf8');

test('① majFixedH：ppShare 主向推导先于 tapeAxisOf 投票（构造性保证带⊥主管）', () => {
  const start = i09.indexOf('var majFixedH=(function(){');
  const end = i09.indexOf('})();', start);
  const block = i09.slice(start, end);
  assert.ok(block.length > 0, 'majFixedH IIFE 必须存在');
  const atShare = block.indexOf('if(ppHasPipes){');
  const atVote = block.indexOf('var G=window.RyZoneGeometry;');
  assert.ok(atShare >= 0, '必须保留 ppHasPipes 传导分支');
  assert.ok(atVote > atShare, 'ppShare 主向推导必须先于 tapeAxisOf 投票（投票只兜底自布管）');
  assert.match(block, /function dominantVertical\(lines\)/, '主向统计函数在场');
  assert.match(block, /dominantVertical\(ppShare\.mainPipes\)/, '首选主管主向');
  assert.match(block, /dominantVertical\(ppShare\.branchPipes\)/, '主管缺失时退支管主向');
  assert.match(block, /return dv;/, '传导分支直接返回主向结论');
});

test('② segs 复用必须形状校验（segs.length===cols*rows），否则弃用', () => {
  const start = i09.indexOf('var majFixedH=(function(){');
  const block = i09.slice(start, i09.indexOf('})();', start));
  assert.match(block, /rep0\.segs\.length===cols\*rows/, '二级报告 segs 与三级网格数对不上必须弃用');
});

test('③ 带几何继续由 majFixedH 单点驱动（fixedH 分支横向带 / else 竖向带）', () => {
  const tapeBlock = i09.slice(i09.indexOf('var dripTapes=[];'), i09.indexOf('// ===== Map-owned trunk geometry'));
  assert.ok(tapeBlock.length > 0, '滴灌带生成块在场');
  assert.match(tapeBlock, /var fixedH=majFixedH;/, '带方向必须唯一来自 majFixedH（不得逐区重判）');
  assert.match(tapeBlock, /if\(fixedH\)\{[\s\S]*?cxT-halfX[\s\S]*?cxT\+halfX/, 'fixedH ⇒ 横向带');
});
