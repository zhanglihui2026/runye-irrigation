'use strict';
/* tests/hbar_weight.test.cjs —— 横向工具栏按钮文字不加粗（v848 用户反馈）
 *
 * 用户原话：工具栏的文字都不要加粗。加粗来源 = ry-panel.css v544 统一工具栏时写的
 * font-weight:600（地图绘制条 .ry-hbar-btn 与分区快捷条 #ppQuickBar 共用这一条）。
 *
 * 静态锁口径：
 *   ① .ry-hbar .ry-hbar-btn 必须显式 font-weight:400 —— 不能删掉声明靠继承：
 *      runye-theme.css 的 .ry-btn 有 --ry-btn-weight 等来源，省略会回到加粗；
 *   ② 不许再写 600/700 —— 回潮即红。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(ROOT, 'mod', 'ry-panel.css'), 'utf8');
const stripCssComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

function hbarRule() {
  const live = stripCssComments(css);
  const i = live.indexOf('.ry-hbar .ry-hbar-btn{');
  assert.ok(i >= 0, '.ry-hbar .ry-hbar-btn 规则必须存在');
  return live.slice(i, live.indexOf('}', i));
}

test('① 工具栏按钮字重必须是显式 400', () => {
  const r = hbarRule();
  assert.ok(r.includes('font-weight:400'), '显式 400（省略会吃全局 button 加粗）');
});

test('② 不许回潮到 600/700/bold', () => {
  const r = hbarRule();
  assert.equal(/font-weight:(600|700|bold)/.test(r), false, '用户反馈过：工具栏文字不要加粗');
});
