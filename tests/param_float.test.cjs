#!/usr/bin/env node
'use strict';
/* [v996-param-float 2026-11-06 用户要求]
   蓝框内容（#ppRecipeBar 选择方案/调用 + #ppPlanBar 10 项输入行）从左栏抽成画布旁悬浮面板
   #ppParamFloat（.pp-stage #ppCanvasWrap 内，默认画布右上）。锁四个契约：
   ① 面板结构：挂 .ry-float-card 外壳（⑧ 单一归属）+ data-ry-* 声明式折叠/拖动/记忆；
   ② 内容搬移：#ppRecipeBar / #ppPlanBar 必须位于 #ppParamFloat 内，且不再出现在左栏
      #ppSide 段；10 项输入 id 原样保留（消费点 getElementById 零改动）；
   ③ 入口与显隐：左栏 #ppParamLauncherBar / #ppParamFloatToggle 存在，plot-editor.js 有
      接线与 runye_panel_ppParamFloat:hidden 记忆键；
   ④ 定位皮肤：style-01.css 基础态 + 搬移态孪生作用域两段同值；新增样式不进 index.html
      内联（⑥b 面板选择器禁入内联）。 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function t(name, cond) {
  if (cond) { pass++; console.log('  ok - ' + name); }
  else { fail++; console.error('  FAIL - ' + name); }
}

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const pe = fs.readFileSync(path.join(ROOT, 'mod/plot-editor.js'), 'utf8');
const s01 = fs.readFileSync(path.join(ROOT, 'mod/style-01.css'), 'utf8');
const rp = fs.readFileSync(path.join(ROOT, 'mod/ry-panel.css'), 'utf8');
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

console.log('[structure] 悬浮面板结构');
const floatIdx = html.indexOf('id="ppParamFloat"');
t('面板存在且挂 .ry-float-card 外壳', floatIdx > 0 && /class="pp-param-float ry-float-card"/.test(html));
t('声明式折叠/拖动/记忆 data-ry-* 齐全',
  /data-ry-panel\b/.test(html.slice(floatIdx, floatIdx + 600)) &&
  html.includes('data-ry-position-key="ppParamFloatPos"') &&
  html.includes('data-ry-fold-key="runye_panel_ppParamFloat:fold"') &&
  html.includes('data-ry-keep-default="1"'));
/* [v998] 约定对齐：head=拖动（cursor:move）、grip=调宽（cursor:ew-resize）——v996 做反了 */
const headIdx = html.indexOf('class="ry-float-head" data-ry-toggle data-ry-drag');
t('标题栏整条可拖动（head 带 data-ry-drag）', headIdx > floatIdx);
t('抓手负责调宽（grip 带 data-ry-resize，不再兼拖动）',
  /<span class="ry-float-grip" data-ry-resize title="左右拖动调节面板宽度/.test(html) &&
  !html.includes('<span class="ry-float-grip" data-ry-drag'));
t('调宽范围声明 200~420（rypResizePanel 夹紧）',
  html.includes('data-ry-resize-min="200"') && html.includes('data-ry-resize-max="420"'));
const bodyIdx = html.indexOf('class="ry-float-body pp-side" data-ry-body');
t('body 复用 .pp-side 类（皮肤零拷贝）', bodyIdx > floatIdx);
const planBarIdx = html.indexOf('<div class="pp-plan-bar" id="ppPlanBar">');
/* [v1000] 配方行已退役，悬浮窗 body 只剩 10 项输入行；库迁左栏（契约见 recipe_library.test） */
t('#ppPlanBar 在悬浮面板 body 内，配方下拉不在 DOM 层',
  planBarIdx > bodyIdx && !html.replace(/<!--[\s\S]*?-->/g, '').includes('id="ppRecipeBar"'));
t('全页只有一份 #ppPlanBar（无重复 id）',
  planBarIdx === html.lastIndexOf('<div class="pp-plan-bar" id="ppPlanBar">'));
t('输入行位于画布容器（#ppCanvasWrap 之后、.pp-stage 内）',
  html.indexOf('id="ppCanvasWrap"') < floatIdx &&
  html.indexOf('pp-rail-toggle') > planBarIdx);

console.log('[left-rail] 左栏入口（[v999] 已取消，悬浮窗为唯一入口）');
/* 剥注释再判：历史沿革注释里允许提及旧 id，只有真实 DOM/代码不许再有 */
const htmlCode = html.replace(/<!--[\s\S]*?-->/g, '');
const peCode = pe.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
t('左栏入口按钮/容器已删除（DOM 层）',
  !htmlCode.includes('ppParamFloatToggle') && !htmlCode.includes('ppParamLauncherBar'));
t('左栏「灌溉参数」灰分组条已删除（悬浮窗标题栏替代）',
  !htmlCode.includes('<div class="ry-props-head">灌溉参数</div>'));
t('plot-editor 显隐接线已退役（代码层）',
  !peCode.includes('bindParamFloatToggle') && !peCode.includes('runye_panel_ppParamFloat:hidden'));
t('v990 隐藏 checkbox #planZoneMergeLast 留在左栏',
  /<!-- ===== \[v999[\s\S]*?<input type="checkbox" id="planZoneMergeLast" hidden>/.test(html));

console.log('[wiring] 消费点未动');
const i09 = fs.readFileSync(path.join(ROOT, 'mod/inline-09.js'), 'utf8');
t('planZoneFixedSide / ppRecipeFlow 消费点未动',
  i09.includes('function planZoneFixedSide()') && /ppRecipeFlow|window\.RyRecipes/.test(pe));

console.log('[css] 定位样式与⑥b纪律');
const base = '#pipePlanSection .pp-canvas-wrap>.pp-param-float{';
const twin = '#ryCadSide [data-pp="pipePlanSection"] .pp-canvas-wrap>.pp-param-float{';
t('style-01.css 基础态 + 搬移态孪生段都在', s01.includes(base) && s01.includes(twin));
t('两段定位值同源（top/right/z-index/width）', (() => {
  const grab = (src, sel) => { const i = src.indexOf(sel); if (i < 0) return ''; return src.slice(i, i + 260); };
  const a = grab(s01, base), b = grab(s01, twin);
  return ['top:8px;right:12px;z-index:4;', 'width:220px;'].every(v => a.includes(v) && b.includes(v));
})());
t('index.html 内联 style 无 .pp-param-float / .pp-side 新选择器（⑥b）', (() => {
  const blocks = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1].replace(/\/\*[\s\S]*?\*\//g, '')).join('\n');
  return !blocks.includes('.pp-param-float');
})());
t('折叠兜底规则在（.pp-side 的 display:flex 会压过 [hidden]，必须强制收起）',
  rp.includes('.ry-float-card>.ry-float-body[hidden]{display:none!important}'));

console.log('[v1002] 首行标签改四字 + 悬浮面板标签列收窄');
t('首行显示标签为「提升高度」四字', /<span class="pp-plan-label">提升高度<\/span>/.test(html));
t('显示标签不再用全称「水泵提升高度」', !html.includes('<span class="pp-plan-label">水泵提升高度</span>'));
t('aria-label 保留全称（读屏/镜像语义不变）', html.includes('aria-label="水泵提升高度"'));
t('ry-panel.css 悬浮面板标签列收窄 28%（[v1004] 二次压缩，.ry-float-body.pp-side 凑齐 (1,5,0)）',
  rp.includes('#ppParamFloat .ry-float-body.pp-side .pp-plan-item > .pp-plan-label:first-child{ flex-basis:28%; }'));
/* [v1012c] 原先只有「基础态 + ryCadSide 搬移态孪生」两处；统一绘图工作区把面板
   提进 .ry-drawing-canvas 直属后，第三段定位规则也必须给回 220px（否则基础态
   选择器失效、面板宽度塌成内容宽）。三处同值，缺一不可。 */
t('[v1004/v1012c] 面板默认宽 220（基础态 + 搬移态孪生 + 统一工作区搬移态）',
  s01.split('width:220px;').length - 1 === 3 &&
  /#ryDrawingHost \.ry-drawing-canvas>#ppParamFloat\{[\s\S]{0,240}width:220px;/.test(s01));
t('[v1004] 单位列 margin-left:auto 贴右（竖线-单位间距不随宽度漂移）',
  (rp.match(/\.pp-plan-unit\{\r?\n  margin-left:auto;/g) || []).length === 2 ||
  /pp-plan-unit\{\s*margin-left:auto;/s.test(rp));

console.log('[version] 同抬闸门（动态口径，后续抬号零维护）');
const ver = (sw.match(/const VERSION = '([^']+)'/) || [])[1];
t('sw VERSION 形如 vNNN-xxx', /^v\d+-[a-z0-9-]+$/.test(ver || ''));
const verPlain = (ver || '').replace(/^v/, '');
const vref = html.split('?v=' + verPlain).length - 1;
t('index.html ?v= 全部同抬（14 处）', vref === 14);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
