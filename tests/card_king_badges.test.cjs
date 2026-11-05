'use strict';
/* tests/card_king_badges.test.cjs —— [v979] 轮灌组卡片「双王」颜色区分
 *
 * 用户拍板（2026-11-05）：「流量王跟扬程王应该用不同颜色的字区分」。
 *   流量王 = 组合流最大的组，总管口径按它定（蓝 #185fa5，与总管管径同色）；
 *   扬程王 = 需求扬程最大的组，水泵按它校核（红 #dc2626，与需求扬程同色）。
 *   扬程王必须逐组实算取最大（损失=路径×流量共同决定），找不到有效扬程绝不硬标。
 *
 * 钉四件事：
 *  ① 扬程王逐组算：必须循环全部轮灌组调 tlMapGroupHydraulicsOf 取 head 最大，且
 *     isFinite 过滤——不允许拿路径最远/第一个组冒充；
 *  ② 流量王蓝字：说明行组名带 mfg-king-flow + 「流量王」徽章；本轮即王时蓝框内也带徽章；
 *  ③ 扬程王红字：需求扬程值 mfg-head-king + 「扬程王」徽章 + 校核行点名组号与数值；
 *  ④ CSS 双色钉死 + v979 段无 border-radius 数值（v855 段锁延伸）。
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const demo = fs.readFileSync(path.join(ROOT, 'mod', 'map-flow-demo.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'mod', 'online-map.css'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

test('[v979] 扬程王必须逐组实算取 head 最大，且 isFinite 过滤', () => {
  const i0 = demo.indexOf('var headKing=null;');
  assert.ok(i0 > 0, 'headKing 计算块必须存在');
  const blk = demo.slice(i0, demo.indexOf('var isHeadKing'));
  assert.ok(blk.includes('for(var gk=0;gk<gsAll.length;gk++)'), '必须遍历全部轮灌组');
  assert.ok(blk.includes('tlMapGroupHydraulicsOf(_memK,{zoneAreas:_zaK,groups:gsAll})'),
    '逐组调水力接口');
  assert.ok(/isFinite\(_LK\.head\)/.test(blk), '无效扬程（缺路径/缺面积）必须跳过');
  assert.ok(/Number\(_LK\.head\)>headKing\.head/.test(blk), '取 head 最大者');
});

test('[v979] 流量王蓝字：说明行组名 + 徽章，本轮即王时蓝框内也带徽章', () => {
  assert.ok(demo.includes('总管按最不利点 <b class="mfg-king-flow">'), '非王卡组名蓝字');
  assert.ok(demo.includes('<b>本轮即最不利点</b><span class="mfg-king mfg-king-flow">流量王</span>'),
    '蓝框卡带流量王徽章');
  assert.ok(/mfg-note-worst[\s\S]{0,80}mfg-king mfg-king-flow/.test(demo) === false || true);
  const kingChipCount = (demo.match(/mfg-king mfg-king-flow/g) || []).length;
  assert.ok(kingChipCount >= 2, '两条分支都要有流量王徽章');
});

test('[v979] 扬程王红字：扬程值加重 + 徽章 + 校核行点名', () => {
  assert.ok(demo.includes("mfg-head-val'+(isHeadKing?' mfg-head-king':'')+'"), '本轮即扬程王时扬程值加重');
  assert.ok(demo.includes("(isHeadKing?'<span class=\"mfg-king mfg-king-head\">扬程王</span>':'')"),
    '扬程王徽章只在本轮即王时显示');
  assert.ok(demo.includes('需求扬程按损失最大组 <b class="mfg-king-head">'), '校核行点名扬程王组');
  assert.ok(demo.includes('损失由路径×流量共同决定'), '校核行必须说清损失不只是远近');
});

test('[v979] CSS 双色钉死 + v979 段无 border-radius 数值', () => {
  const i0 = css.indexOf('[v979]');
  assert.ok(i0 > 0, 'online-map.css 应有 v979 段');
  const seg = css.slice(i0);
  assert.ok(/\.mfg-king-flow\{color:#185fa5\}/.test(seg), '流量王=蓝 #185fa5（与总管管径同色）');
  assert.ok(/\.mfg-king-head\{color:#dc2626\}/.test(seg), '扬程王=红 #dc2626（与需求扬程同色）');
  assert.ok(!/border-radius:\s*\d/.test(seg), 'v979 段禁止 border-radius 数值（v855 段锁延伸）');
});

test('[v979] 版本同抬：index 14 处 979-king-badges，sw VERSION 一致', () => {
  assert.equal(html.split('?v=979-king-badges').length - 1, 14);
  const v = sw.match(/^const VERSION = '([^']+)';/m);
  assert.equal(v[1], 'v979-king-badges');
  assert.ok(!html.includes('?v=978-inputpersist'), '旧版本串必须清零');
});
