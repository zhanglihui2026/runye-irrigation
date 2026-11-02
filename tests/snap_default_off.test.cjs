'use strict';
/* tests/snap_default_off.test.cjs —— 总管捕捉「重开默认关闭」（v846）
 *
 * 规格意见记录在待办清单：「snapOn 默认 true，规格要『重开默认关闭』」。
 * 为什么用静态锁：默认值是一行字，回归方式就是有人把 false 改回 true（或重写这段时
 * 照抄旧版）——探针要开页面画线才能发现，静态锁在闸门里就拦住。
 *
 * 口径：会话内切换照旧（按钮 / S 键），不落库；mount 时 setSnapOn(snapOn) 把
 * 引擎 enabled、按钮 DOM、提示条三处一次同步——只改变量不动这三处是 v846 踩过的坑
 * （按钮文字是 HTML 写死的初始值，变量改了按钮还说「开启」）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const mapJs = fs.readFileSync(path.join(ROOT, 'mod', 'online-map.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const stripJsComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const stripHtmlComments = (s) => s.replace(/<!--[\s\S]*?-->/g, '');

test('① 默认值是 false：var snapOn = false;', () => {
  const live = stripJsComments(mapJs);
  assert.ok(live.includes('var snapOn = false;'), '默认值必须是 false（规格：重开默认关闭）');
  assert.equal(live.includes('var snapOn = true;'), false, '别两个默认值并存');
});

test('② mount 时用 setSnapOn(snapOn) 同步三处（引擎/按钮/提示条）', () => {
  const live = stripJsComments(mapJs);
  assert.ok(live.includes('setSnapOn(snapOn);'), '初始化必须调 setSnapOn，只改变量按钮会说谎');
  /* setSnapOn 本体要仍然有牙：写按钮文字 + aria-pressed + 引擎 setEnabled */
  assert.ok(/function setSnapOn\(on\)[\s\S]*?setEnabled\(snapOn\)[\s\S]*?aria-pressed/.test(live),
    'setSnapOn 里必须同时管引擎 setEnabled 与按钮 aria-pressed');
});

test('③ index.html 按钮初始态与默认值一致：aria-pressed="false" + 「捕捉：关闭」', () => {
  const live = stripHtmlComments(html);
  const m = live.match(/id="btnSnapToggle"[^>]*aria-pressed="([^"]*)"[^>]*>([^<]*)</);
  assert.ok(m, 'btnSnapToggle 按钮必须存在');
  assert.equal(m[1], 'false', '初始 aria-pressed 要与 snapOn=false 一致');
  assert.equal(m[2].trim(), '捕捉：关闭', '初始文案要与默认值一致');
});

test('④ 运行时切换入口都在：按钮 onclick 取反 + 提示条动态文案', () => {
  const live = stripJsComments(mapJs);
  assert.ok(live.includes("snapToggleBtn.onclick=function(){ setSnapOn(!snapOn); }"), '按钮取反切换还在');
  assert.ok(live.includes("(snapOn?'开启':'关闭')"), '提示条/按钮的动态文案还在');
});
