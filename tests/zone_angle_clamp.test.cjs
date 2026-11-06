#!/usr/bin/env node
'use strict';
/* [v995-angle-90-clamp 2026-11-06 用户约定]
   ① 分区角度输入只允许 90° 以内（input/change 两个 handler 都钳 ±90），
      超过 90° 提示改用「↻ +90°」按钮；
   ② 「↻ +90°」按钮负责换向：旋转后格系 frame.bounds 宽高互换 ⇒ 地块长/短边
      重算 ⇒ tapeAxisOf 按首分区实际跨度定带轴（分区级长边，v886 口径，
      2026-11-06 用户再次拍板：177×166.7 就用 177 定带向）⇒ 主管/支管垂直自动跟随。
   本测试锁：源码契约（钳制两处 + 提示语）+ 页面标记（min/max/title）+ 版本同抬闸门。 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

let pass = 0, fail = 0;
function t(name, cond) {
  if (cond) { pass++; console.log('  ok - ' + name); }
  else { fail++; console.error('  FAIL - ' + name); }
}

const pe = stripComments(fs.readFileSync(path.join(ROOT, 'mod/plot-editor.js'), 'utf8'));
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

console.log('[source] plot-editor.js 角度输入钳制');
t('input handler 钳 ±90（第 1 处）', (pe.match(/Math\.max\(-90,Math\.min\(90,raw\)\)/g) || []).length === 2);
t('change handler 钳 ±90（第 2 处）', (pe.match(/Math\.max\(-90,Math\.min\(90,raw\)\)/g) || []).length === 2);
t('不再有 ±180 钳制残留', !/Math\.max\(-180,Math\.min\(180/.test(pe));
t('input 事件超限提示存在', pe.includes('分区角度只能旋转 90° 以内'));
t('提示引导使用「↻ +90°」按钮', pe.includes('请用「↻ +90°」按钮'));
t('提示带 typeof tip 守卫（两处）', (pe.match(/Math\.abs\(raw\)>90&&typeof tip==='function'\)tip\(/g) || []).length === 2);
t('ppRotateZones 按钮仍为 +90 叠加（换向唯一入口）', pe.includes("ppApplyZoneAngle(ppZoneAngle()+90,true)"));

console.log('[page] index.html 角度控件标记');
t('输入框 min=-90', html.includes('id="ppZoneAngleInput" type="number" min="-90" max="90"'));
t('输入框 aria 写明 90 度约定', html.includes('仅支持90度以内，超过请用旋转90度按钮'));
t('旋转按钮 title 写明长/短边重算与带向跟随',
  html.includes('旋转后地块长/短边重算，滴灌带方向按分区长边重定，主管/支管自动跟随'));

console.log('[version] 同抬闸门');
const ver = (sw.match(/const VERSION = '([^']+)'/) || [])[1];
t('sw VERSION = v995-angle-90-clamp', ver === 'v995-angle-90-clamp');
const vref = html.split('?v=' + ver.replace(/^v/, '')).length - 1;
t('index.html ?v= 全部同抬（14 处）', vref === 14);
t('index.html 无旧版残留', !html.includes('?v=994-'));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
