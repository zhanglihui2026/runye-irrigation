'use strict';
/* diagram_fit.test.cjs —— 「图纸整幅可见」的结构契约（v627，2026-10-20）
 *
 * 背景（真实 bug）：视图切换在 `.pp-stage` 与 `.pp-diagram-wrap` 之间插了一层 `.ry-pane`，
 * 而给图纸卡设 `min-height:0` 的 CSS 还写着 `.pp-stage>.pp-diagram-wrap`（直接子节点），
 * 匹配不到 ⇒ 图纸卡退回 `min-height:auto`，作为 flex 列的子项不能缩到内容以下
 * ⇒ 被 SVG（width:100% 算出的高度）撑高，超出 main{overflow:hidden} 的部分被裁掉。
 * 实测 1400×620 窗口：section 553px、图纸卡 818px，溢出 265px。
 *
 * 这类 bug 的共同点是「DOM 多了一层，CSS 选择器没跟上」，静态检查能直接锁住：
 * 改 DOM 层级必须同步改选择器，否则这里立刻红。
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'mod', 'style-01.css'), 'utf8');

/* ---------- 1. 结构：三张图纸卡的父节点都是 .ry-pane ---------- */
['tlDiagramWrap', 'tlSysDiagramWrap', 'ppDiagramWrap'].forEach(function (id) {
  const re = new RegExp('<div class="ry-pane[^"]*">\\s*<div class="pp-diagram-wrap" id="' + id + '">');
  assert.ok(re.test(html),
    '#' + id + ' 的父节点应是 .ry-pane —— 若 DOM 层级变了，style-01.css 里那条 ' +
    '`.pp-stage > .ry-pane > .pp-diagram-wrap{min-height:0}` 就要同步改，否则图纸会被裁');
});

/* ---------- 2. 样式：图纸卡的高度链（min-height:0）必须按真实路径写 ---------- */
assert.ok(/#tlPipePlanSection \.pp-stage>\.ry-pane>\.pp-diagram-wrap[\s\S]{0,200}?min-height:0/.test(css),
  'style-01.css 必须存在 `#tlPipePlanSection .pp-stage>.ry-pane>.pp-diagram-wrap{...min-height:0...}`');
assert.ok(/#ryCadSide \[data-pp="tlPipePlanSection"\] \.pp-stage>\.ry-pane>\.pp-diagram-wrap/.test(css),
  'CAD 侧栏克隆（#ryCadSide）的同一条规则也要覆盖，否则工具模式下仍是旧行为');

/* ---------- 3. 样式：SVG 宽高都取容器尺寸，配合 viewBox meet 等比缩放 ---------- */
assert.ok(/body\.ry-tool #tlDiagramContent > svg,[\s\S]{0,120}?body\.ry-tool #ppDiagramContent > svg\{height:100%;max-height:100%\}/.test(css),
  '图纸 SVG 需要 `height:100%;max-height:100%`，否则宽扁窗口下按宽度算出的高度必然超出可用高度');

/* ---------- 4. 系统图容器：必须可滚动，不能 hidden ---------- */
const sysHidden = /#tlSysDiagramWrap > #tlSysDiagramContent\{\s*flex:1 1 auto;min-height:0;overflow:hidden;?\s*\}/g;
assert.equal((css.match(sysHidden) || []).length, 0,
  '系统图视图容器不能是 overflow:hidden —— 下方还叠着「三级管线施工简图」图框，hidden 会让它整块不可达');
assert.ok(/#tlSysDiagramWrap > #tlSysDiagramContent\{\s*flex:1 1 auto;min-height:0;overflow:auto;?\s*\}/.test(css),
  '系统图视图容器应为 overflow:auto');

/* ---------- 5. 系统图内嵌的简图框：SVG 不得横向撑破 ---------- */
assert.ok(/#tlSysPipeBoxBody svg\{max-width:100%;height:auto;display:block\}/.test(css),
  '#tlSysPipeBoxBody 里的克隆 SVG 需要 max-width:100% + height:auto');

console.log('diagram_fit：结构 × 样式契约 5 项通过');
