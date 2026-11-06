#!/usr/bin/env node
'use strict';
/* [v997-zone-default-1 2026-11-06 用户要求]
   分区轮灌默认联合分区 = 1：三级页「联合灌溉」按钮组 #tlZoneCountGroup 初始选中 1区，
   tlGetZoneCount() 无选中兜底同为 1（两处必须同源，否则 HTML 被清选中态时行为分叉）。 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function t(name, cond) {
  if (cond) { pass++; console.log('  ok - ' + name); }
  else { fail++; console.error('  FAIL - ' + name); }
}

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const i09 = fs.readFileSync(path.join(ROOT, 'mod/inline-09.js'), 'utf8');
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

console.log('[html] 初始选中态');
const zcg = (html.match(/<div role="group" id="tlZoneCountGroup"[\s\S]*?<\/div>/) || [])[0] || '';
t('1区按钮带 .selected', zcg.includes('<button type="button" data-n="1" class="selected">1区</button>'));
t('组内 2/3/4 区均不默认选中', !!zcg &&
  ['2', '3', '4'].every(n => !new RegExp('<button type="button" data-n="' + n + '" class="selected"').test(zcg)));
t('data-init-n 同步为 1', /id="tlZoneCountGroup" data-init-n="1"/.test(html));

console.log('[js] tlGetZoneCount 兜底');
const m = i09.match(/function tlGetZoneCount\(\)\s*\{[\s\S]*?\}/);
t('函数存在', !!m);
t('无选中兜底返回 1', !!m && /parseInt\(btn\.dataset\.n\) : 1;/.test(m[0]));
t('兜底与 HTML 初始值同源（不回退到 2）', !!m && !/ : 2;/.test(m[0]));

console.log('[version] 同抬闸门（动态口径）');
const ver = (sw.match(/const VERSION = '([^']+)'/) || [])[1];
t('sw VERSION 形如 vNNN-xxx', /^v\d+-[a-z0-9-]+$/.test(ver || ''));
const vref = html.split('?v=' + (ver || '').replace(/^v/, '')).length - 1;
t('index.html ?v= 全部同抬（14 处）', vref === 14);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
