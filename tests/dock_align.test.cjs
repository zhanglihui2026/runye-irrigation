'use strict';
/* tests/dock_align.test.cjs —— 地图左栏 dock 里「联合灌溉 / 面积成组」与下方
   「轮灌演示（在线地图）」左沿对齐（v953，用户 2026-11-04 截图）。
 *
 * 病因（不是"少写了个 margin"，是**作用域漏了**）：#tlPlanBar 用的是基础
 * .pp-plan-bar{padding:10px 14px}；在「分区与管路」页里那条 padding 被
 * `#tlPipePlanSection .pp-side .pp-plan-bar{padding:0}` 清零，而地图端是把
 * #tlPlanBar 搬进 #mapDemoDock —— 不在那两个选择器覆盖范围内，于是 14px 又回来了，
 * 内容整体比 #mapDemoBar 里的标题多缩进 14px（实测 24 vs 10）。
 *
 * 钉两件事：
 *   ① 地图 dock 内必须清零左右内距（否则又是 24 vs 10）；
 *   ② 这条覆盖**只能**挂在 #mapDemoDock 下 —— 写成全局 .pp-plan-bar{padding:0}
 *      会把「分区与管路」「管路规划」几页的分组条一起扒平（那几页正在用 14px）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(ROOT, 'mod', 'online-map.css'), 'utf8');
const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');

test('① 地图 dock 内 #tlPlanBar 左右内距清零（与「轮灌演示（在线地图）」同左沿）', () => {
  const i = css.indexOf('#mapDemoDock #tlPlanBar{');
  assert.ok(i >= 0, '必须存在 #mapDemoDock #tlPlanBar 规则（否则搬进 dock 后吃回 14px）');
  const rule = css.slice(i, css.indexOf('}', i));
  assert.ok(/padding-left:\s*0/.test(rule), '缺 padding-left:0');
  assert.ok(/padding-right:\s*0/.test(rule), '缺 padding-right:0（左右对称，别只改左边）');
});

test('② 该覆盖只许挂在 #mapDemoDock 下，不许写全局 .pp-plan-bar', () => {
  /* 全局扒平会波及分区与管路 / 管路规划几页（它们靠 14px 内距与卡片对齐） */
  const globalFlat = /(^|[}\n;])\s*\.pp-plan-bar\{[^}]*padding:\s*0/.test(css);
  assert.equal(globalFlat, false, '不许把 .pp-plan-bar 的内距全局清零');
});
