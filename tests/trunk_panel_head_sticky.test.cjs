'use strict';
/* tests/trunk_panel_head_sticky.test.cjs —— 「总管参数设置」面板滚动时标题锁顶（v958）
 *
 * 用户 2026-11-04：「总管参数设置滚动时 标题锁定不能跟着滚动。」
 *
 * 关键取舍（写在这里防止以后有人"优化"掉）：
 *   ✔ 用 `position:sticky` —— **滚动容器仍是面板本身**，所有子元素宽度与改前逐像素相同。
 *   ✘ 不要把面板拆成「flex 三段 + .tp-body 自己滚」：body 一旦有自己的滚动条，
 *     值列立刻窄 8~15px（Chrome classic scrollbar），而 v956 刚量过
 *     「510.4 m · 地图实测 · 5.35 m」正好塞满 150px，一窄就重新折行。
 *
 * 钉四件事：sticky+top:0 / 有 z-index（不然滚过去的字会叠在标题上）/
 *           滚动容器没换（sticky 在 overflow:visible 的父级里不生效）/ 不许用 absolute/fixed 顶替。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(ROOT, 'mod', 'online-map.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function ruleOf(sel, from) {
  const i = css.indexOf(sel, from || 0);
  assert.ok(i >= 0, '缺少规则 ' + sel);
  return css.slice(i, css.indexOf('}', i));
}

test('① 标题栏 sticky 到顶部（滚动时不动）', () => {
  const head = ruleOf('#onlineMapSection .ry-trunk-panel .tp-head{');
  assert.ok(/position:\s*sticky/.test(head), '标题栏必须 position:sticky（否则跟着内容一起滚走）');
  assert.ok(/top:\s*0(px)?[;}]/.test(head), '缺 top:0（sticky 没有 top 就不粘）');
});

test('② sticky 元素必须有 z-index，否则滚过去的正文压在标题上', () => {
  const head = ruleOf('#onlineMapSection .ry-trunk-panel .tp-head{');
  const m = /z-index:\s*(-?\d+)/.exec(head);
  assert.ok(m, '缺 z-index');
  assert.ok(Number(m[1]) >= 1, 'z-index 必须 ≥1，实际 ' + m[1]);
});

test('③ 滚动容器仍然是面板本身（sticky 只在真滚动容器里生效）', () => {
  const panel = ruleOf('#onlineMapSection .ry-trunk-panel{');
  assert.ok(/overflow-y:\s*auto/.test(panel), '面板必须保留 overflow-y:auto —— 换成 hidden 就没有滚动容器，sticky 不生效');
  assert.equal(/\.tp-body\{[^}]*overflow-y:\s*auto/.test(css), false,
    '不许给 .tp-body 自己加 overflow-y:auto（会多一条 8~15px 滚动条，值列变窄 ⇒ 损失拆分行重新折行）');
});

test('④ 不许用 absolute / fixed 顶替（会脱离文档流，折叠与拖动都会错位）', () => {
  const head = ruleOf('#onlineMapSection .ry-trunk-panel .tp-head{');
  assert.equal(/position:\s*(absolute|fixed)/.test(head), false, '标题栏不许 absolute/fixed，只能 sticky');
});
