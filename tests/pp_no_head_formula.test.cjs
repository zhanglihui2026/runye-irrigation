'use strict';
/* tests/pp_no_head_formula.test.cjs —— 二级左栏「扬程计算式」已取消（v963）
 *
 * 用户 2026-11-04（截图红框圈住灰条 + 式子带）：「二级管网的扬程计算式取消吧。」
 *
 * 取消的是**这一条拆解算式**，不是水泵扬程：扬程仍在上面「水力计算结果」条里（planPumpHead），
 * 三级页也有自己的「扬程计算式」（#ppHeadBreak，不共用节点）。
 *
 * 这条锁钉四件事：
 *   ① 二级 aside 里 `#ppCalcDetail` 与那枚 `.ry-props-head` 灰条都不在了（不是 display:none）；
 *   ② 三级 `#ppHeadBreak` 与它的「扬程计算式」标题**仍在**（别顺手把三级的也删了）；
 *   ③ 两个消费方必须判空 —— 元素不在就静默 no-op，不能抛错把后面的渲染链带停；
 *   ④ 样式 `.pp-calc-formula` 保留（三级算式带还在用同族类名）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const calcRaw = fs.readFileSync(path.join(ROOT, 'mod', 'plan-calc-render.js'), 'utf8');
const calc = calcRaw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const editorRaw = fs.readFileSync(path.join(ROOT, 'mod', 'plot-editor.js'), 'utf8');
const editor = editorRaw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const css = fs.readFileSync(path.join(ROOT, 'mod', 'ry-panel.css'), 'utf8');

const asideIdx = html.indexOf('<aside class="pp-side ry-props" id="ppSide"');
const asideEnd = html.indexOf('</aside>', asideIdx);
const aside = html.slice(asideIdx, asideEnd);

test('① 二级左栏不再有扬程计算式（节点真的删了，不是隐藏）', () => {
  assert.ok(asideIdx > 0 && asideEnd > asideIdx, '找不到二级左栏 #ppSide');
  assert.ok(!/id="ppCalcDetail"/.test(aside), '二级左栏里还有 #ppCalcDetail');
  assert.ok(!/id="ppCalcDetail"/.test(html), 'index.html 里还残留 #ppCalcDetail（要删干净，别留 display:none 死节点）');
  assert.ok(!/class="ry-props-head">扬程计算式</.test(aside), '二级左栏里还有「扬程计算式」灰条');
});

test('② 三级那套也已取消（v984，用户 2026-11-05 点名三级）', () => {
  assert.ok(!/id="ppHeadBreak"/.test(html), '三级 #ppHeadBreak 应已随 v984 删除');
  /* 渲染器 dormant 保留：标题串与判空都要在，恢复时插回一行 DOM 即可 */
  assert.ok(/tl-flat-head">扬程计算式</.test(calc), '三级算式带的「扬程计算式」标题（dormant）没了');
  assert.ok(/getElementById\('ppHeadBreak'\);\s*\n\s*if \(!el \|\| !r\) return;/.test(calc),
    'renderHeadBreakdown 必须判空 no-op（节点已删，不能抛错带停渲染链）');
});

test('③ 消费方必须判空：元素不在就 no-op，不许抛错', () => {
  assert.ok(/var el = root\.document\.getElementById\('ppCalcDetail'\);\s*\n\s*if \(!el\) return;/.test(calc),
    'plan-calc-render.renderPlanCalcDetail 必须先取元素再判空（否则删了节点就抛 TypeError，把调用链带停）');
  assert.ok(/var d2 = document\.getElementById\('ppCalcDetail'\);/.test(editor),
    'plot-editor 的 ppFormulaFold 找不到 #ppCalcDetail 了，语义应同步改');
  assert.ok(/var h2 = d2 && d2\.previousElementSibling;[\s\S]{0,160}if \(h2 && h2\.classList/.test(editor),
    '折叠逻辑必须容得下 d2 为空（d2 && … 再判 h2），不能直接 h2.xxx');
});

test('④ 样式保留：要恢复这条算式带时不用再补 CSS', () => {
  /* 二级那条算式带的皮肤在 mod/ry-panel.css（.pp-side .pp-calc-formula 一族）。
     节点删了，规则留着是**有意的**：renderPlanCalcDetail 与这套样式都还在，
     将来把三行 DOM 加回来就能原样恢复（见 index.html v963 注释里的恢复说明）。 */
  assert.ok(/\.pp-calc-formula/.test(css), 'mod/ry-panel.css 里 .pp-calc-formula 被删了 —— 恢复时得重写一套皮肤');
  assert.ok(/\.pp-cf-num/.test(css) && /\.pp-cf-final/.test(css), '算式带的高亮类（pp-cf-num / pp-cf-final）被删了');
});
