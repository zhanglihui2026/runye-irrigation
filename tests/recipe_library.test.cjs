#!/usr/bin/env node
'use strict';
/* [v1000-recipe-library 2026-11-06 用户要求]
   灌溉参数库升级为左栏列表（#ppRecipeLib，像在线地图·地块库）：
   点列表项 = 直接套用（免「调用」按钮）+「💾 存当前」一键保存；
   悬浮窗「选择方案+调用」行（#ppRecipeBar）退役；
   设置弹窗「灌溉参数」页签（#ryRecipe* + window.RyRecipes）管理能力保持。 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function t(name, cond) {
  if (cond) { pass++; console.log('  ok - ' + name); }
  else { fail++; console.error('  FAIL - ' + name); }
}
function stripHtmlComments(s) { return s.replace(/<!--[\s\S]*?-->/g, ''); }
function stripJsComments(s) { return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, ''); }

const htmlCode = stripHtmlComments(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const peCode = stripJsComments(fs.readFileSync(path.join(ROOT, 'mod/plot-editor.js'), 'utf8'));
const rp = fs.readFileSync(path.join(ROOT, 'mod/ry-panel.css'), 'utf8');
const i28 = fs.readFileSync(path.join(ROOT, 'mod/inline-28.js'), 'utf8');
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

console.log('[rail] 左栏方案库结构');
const libIdx = htmlCode.indexOf('id="ppRecipeLib"');
const sideIdx = htmlCode.indexOf('id="ppSide"');
t('#ppRecipeLib 在 #ppSide 内（组内第一项）', libIdx > sideIdx && htmlCode.indexOf('id="ppRecipeList"', libIdx) > libIdx);
t('头部带「💾 存当前」按钮', htmlCode.includes('id="ppRecipeSaveCur"'));
t('#ppRecipeStatus 自悬浮窗迁来（id 不变）', libIdx > 0 && htmlCode.indexOf('id="ppRecipeStatus"') > libIdx && htmlCode.indexOf('id="ppRecipeStatus"') < htmlCode.indexOf('id="ppPlanBar"'));
t('列表容器 role=listbox（可访问性）', /id="ppRecipeList" role="listbox"/.test(html));

console.log('[float] 悬浮窗配方行退役');
t('#ppRecipeBar/#ppRecipeSelect/#ppRecipeApply 不再出现在 DOM 层',
  !htmlCode.includes('id="ppRecipeBar"') && !htmlCode.includes('id="ppRecipeSelect"') && !htmlCode.includes('id="ppRecipeApply"'));
t('悬浮窗 10 项输入仍在', htmlCode.includes('id="planTapeLaySide"') && htmlCode.includes('id="planTargetV"'));

console.log('[js] ppRecipeFlow 重构');
t('锚点改为列表容器（下拉不在时不再整体早退）', peCode.includes("var listEl=$('ppRecipeList')") && !peCode.includes("if(!selEl||!$('ppRecipeApply'))return;"));
t('列表点击套用（事件委托 data-rid）', peCode.includes("listEl.addEventListener('click'") && peCode.includes("closest('[data-rid]')"));
t('套用即高亮（lastApplied + aria-selected）', peCode.includes('lastApplied=r.id') && peCode.includes("aria-selected"));
t('「💾 存当前」接线（复用 doSave 同名覆盖语义）', peCode.includes("$('ppRecipeSaveCur')") && /ppRecipeSaveCur.*doSave|doSave.*ppRecipeSaveCur/.test(peCode.replace(/\n/g, '')) || peCode.includes("_saveCur.onclick=function(){doSave();}"));
t('applyParams 单一入口重算链未动', peCode.includes('window.RyPlanParams.set(patch)') && peCode.includes('ppRepartitionDesign({aiApply:true})'));
t('window.RyRecipes API 保持（设置弹窗依赖）', peCode.includes('window.RyRecipes={ read:read, save:doSave, rename:doRename, del:doDel, refresh:refreshSelect }'));
t('XSS 防护：列表项名称经 esc() 转义', peCode.includes("function esc(s)") && peCode.includes('esc(r.name)'));

console.log('[settings] 设置弹窗管理不受影响');
t('#ryRecipe* 页签仍在 inline-28', i28.includes('id="ryRecipeName"') && i28.includes('id="ryRecipeSelect"'));

console.log('[css] 库皮肤（v609 同族作用域）');
const S = ':is(#pipePlanSection,#ryCadSide [data-pp="pipePlanSection"]) .pp-side ';
t('.pp-recipe-lib 一族规则齐全',
  rp.includes(S + '.pp-recipe-lib{') &&
  rp.includes(S + '.pp-recipe-lib-item{') &&
  rp.includes(S + '.pp-recipe-lib-item.selected{') &&
  rp.includes(S + '.pp-recipe-lib-empty{'));
t('选中态 = 淡绿底 + 品牌绿左条', /pp-recipe-lib-item\.selected\{[^}]*#e8f3ec[^}]*#16a34a/.test(rp));
t('index.html 内联 style 无 .pp-recipe-lib 新选择器（⑥b）', (() => {
  const blocks = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1].replace(/\/\*[\s\S]*?\*\//g, '')).join('\n');
  return !blocks.includes('.pp-recipe-lib');
})());

console.log('[version] 同抬闸门（动态口径）');
const ver = (sw.match(/const VERSION = '([^']+)'/) || [])[1];
t('sw VERSION 形如 vNNN-xxx', /^v\d+-[a-z0-9-]+$/.test(ver || ''));
const vref = html.split('?v=' + (ver || '').replace(/^v/, '')).length - 1;
t('index.html ?v= 全部同抬（14 处）', vref === 14);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
