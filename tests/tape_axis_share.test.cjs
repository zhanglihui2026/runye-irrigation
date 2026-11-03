#!/usr/bin/env node
'use strict';
/* tests/tape_axis_share.test.cjs —— 第一分区长边为布管方向唯一来源的静态锁
 * 用户确认：第一分区的实际长边决定滴灌带方向，所有后续分区跟随；主管和支管垂直于带。
 * 既有二级管线方向、其他分区多数票、旧的方向报告均不得覆盖第一分区规则。
 * 三级重生成还必须把阶梯切线覆盖交给几何函数，以实际第一分区边长判向。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const i09 = fs.readFileSync(path.join(ROOT, 'mod', 'inline-09.js'), 'utf8');

test('① majFixedH：始终由第一分区几何判轴，不由已有主管或多数票覆盖', () => {
  const start = i09.indexOf('var majFixedH=(function(){');
  const end = i09.indexOf('})();', start);
  const block = i09.slice(start, end);
  assert.ok(block.length > 0, 'majFixedH IIFE 必须存在');
  assert.match(block, /var G=window\.RyZoneGeometry;/, '共享几何函数必须参与方向判定');
  assert.match(block, /G\.tapeAxisOf\(/, '方向来自第一分区几何');
  assert.match(block, /return ax\.tapeAxis==='x';/, '主管方向由第一分区轴的垂直轴派生');
  assert.doesNotMatch(block, /dominantVertical|ppShare\.mainPipes/, '已有管线方向不能覆盖第一分区规则');
  assert.match(block, /cutOffX:tlZoneStepRef\?tlZoneStepRef\.x:null/, '传入实际阶梯X切线');
  assert.match(block, /cutOffY:tlZoneStepRef\?tlZoneStepRef\.y:null/, '传入实际阶梯Y切线');
});

test('② 三级方向和分段数从当前几何重算，不复用旧方向报告', () => {
  const start = i09.indexOf('var majFixedH=(function(){');
  const block = i09.slice(start, i09.indexOf('})();', start));
  assert.match(block, /tlAxisReport=ax/, '当前网格的方向报告由统一几何函数生成');
  assert.doesNotMatch(block, /rep0\.segs/, '不得读取旧的方向报告分段数');
});

test('③ 带几何继续由 majFixedH 单点驱动（fixedH 分支横向带 / else 竖向带）', () => {
  const tapeBlock = i09.slice(i09.indexOf('var dripTapes=[];'), i09.indexOf('// ===== Map-owned trunk geometry'));
  assert.ok(tapeBlock.length > 0, '滴灌带生成块在场');
  assert.match(tapeBlock, /var fixedH=majFixedH;/, '带方向必须唯一来自 majFixedH（不得逐区重判）');
  assert.match(tapeBlock, /if\(fixedH\)\{[\s\S]*?cxT-halfX[\s\S]*?cxT\+halfX/, 'fixedH ⇒ 横向带');
});
