'use strict';
/* tests/map_group_card_drag.test.cjs —— 地图「本轮需求扬程」悬浮卡片可拖动（v957）
 *
 * 用户 2026-11-04：「这个悬浮卡片要变成可拖动的」。
 *
 * 它原来是 `pointer-events:none` 的纯展示浮层（v924 定的：点击穿透给地图，绝不挡操作）。
 * 要能拖就必须吃指针事件，所以这条改动有两个"反过来"的约束必须同时钉住：
 *   ① 必须真的吃到事件（pointer-events:auto）、手机端必须 touch-action:none（否则一拖变页面滚动）；
 *   ② 拖动事件必须覆盖 pointer 全家 + capture 阶段 —— 手指划出卡片/指针被别处接管时不能丢；
 *   ③ 位置必须夹在宿主内并存档（拖出可视区就再也抓不回来）；
 *   ④ 不许回到 mousedown/touchstart 二选一的老写法（手机端直接失效）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(ROOT, 'mod', 'online-map.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rawJs = fs.readFileSync(path.join(ROOT, 'mod', 'map-flow-demo.js'), 'utf8');
/* 反向断言要判"代码里不许出现 X"，所以先剥注释 —— 否则注释里提到旧写法也会被误判（踩过） */
const js = rawJs.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const rule = (() => {
  const i = css.indexOf('#onlineMapSection .map-flow-group-info{');
  assert.ok(i >= 0, '缺 .map-flow-group-info 基础规则');
  return css.slice(i, css.indexOf('}', i));
})();
const dragBody = (() => {
  const i = js.indexOf('function setupGroupCardDrag(');
  assert.ok(i >= 0, 'map-flow-demo.js 里必须有 setupGroupCardDrag');
  const j = js.indexOf('function restoreGroupCardPos(', i);
  assert.ok(j > i, '缺 restoreGroupCardPos');
  return js.slice(i, j);
})();

test('① 卡片必须吃指针事件，手机端必须 touch-action:none，默认光标 grab', () => {
  assert.ok(/pointer-events:\s*auto/.test(rule), '还是 pointer-events:none ⇒ 根本收不到 pointerdown');
  assert.ok(/touch-action:\s*none/.test(rule), '缺 touch-action:none ⇒ 手指一拖变成页面滚动');
  assert.ok(/cursor:\s*grab/.test(rule), '缺 cursor:grab（看不出来能拖）');
  assert.ok(/\.map-flow-group-info\.is-dragging\{[^}]*cursor:\s*grabbing/.test(css), '拖动中应换 grabbing 光标');
  assert.ok(/\.map-flow-group-info\.is-dragging\{[^}]*user-select:\s*none/.test(css), '拖动中必须禁选中，否则会选中半屏文字');
});

test('② 用 pointer 全家（down/move/up/cancel）+ capture 阶段监听', () => {
  ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'].forEach(function (ev) {
    assert.ok(dragBody.indexOf(ev) >= 0, '缺 ' + ev);
  });
  assert.ok(/setPointerCapture/.test(dragBody), '缺 setPointerCapture（拖出卡片就丢事件）');
  const cap = [...dragBody.matchAll(/addEventListener\('pointer(move|up|cancel)',\s*\w+,\s*true\)/g)].length;
  assert.equal(cap, 3, 'move/up/cancel 三条都要 capture=true，实际 ' + cap + ' 条');
  /* 反向自检：老写法（只管 mousedown / 只管 touchmove）在另一类设备上直接失效 */
  assert.equal(/addEventListener\('mousedown'/.test(dragBody), false, '不许退回 mousedown 老写法');
});

test('③ 位置必须过 clamp 并存档（拖出可视区就抓不回来）', () => {
  assert.ok(/function clampCardPos\(/.test(js), '缺 clampCardPos');
  assert.ok(/clampCardPos\(el, host,/.test(dragBody), 'onMove 必须经 clampCardPos，否则能把卡片拖到地图外');
  assert.ok(/localStorage\.setItem\(GROUP_CARD_POS_KEY/.test(dragBody), '松手要存位置');
  assert.ok(/localStorage\.getItem\(GROUP_CARD_POS_KEY/.test(js), '显示时要读回位置');
  /* 反向自检：直接拿 clientX 赋给 left 就等于没夹边界 */
  assert.equal(/style\.left\s*=\s*(e2|ev)\.clientX/.test(js), false, '不许把 clientX 直接当 left');
});

test('④ 双击标题复位，且不许把按钮/输入框的点击当成拖动', () => {
  assert.ok(/addEventListener\('dblclick'/.test(dragBody), '缺双击复位');
  /* ★ 必须按**坐标命中标题矩形**判断：卡片的 innerHTML 每次更新都会换掉标题节点，
     按下与松开之间换过节点时 dblclick 的 target 会退化成整个 section（探针实测过），
     `ev.target.closest('.mfg-title')` 那种写法在真实使用里会随机失效。 */
  assert.ok(/querySelector\('\.mfg-title'\)/.test(dragBody) && /getBoundingClientRect\(\)/.test(dragBody),
    '双击复位要用标题矩形 + 坐标判定');
  assert.equal(/ev\.target\.closest\('\.mfg-title'\)/.test(dragBody), false,
    '不许用 ev.target.closest(\'.mfg-title\')（重渲染后会命中不到）');
  assert.ok(/closest\('a,button,input,select,textarea'\)/.test(dragBody),
    '卡片以后加按钮时，按钮上的按下不该被当拖动');
  assert.ok(/GROUP_CARD_DEFAULT/.test(js), '复位要有个明确的默认位');
});

test('⑤ 显示时接管拖动（hidden 时量不到宿主尺寸）', () => {
  const i = js.indexOf('el.hidden=false;');
  assert.ok(i >= 0, '缺 el.hidden=false');
  const after = js.slice(i, i + 300);
  assert.ok(/setupGroupCardDrag\(el\)/.test(after), '显示后必须调用 setupGroupCardDrag');
  assert.ok(/restoreGroupCardPos\(el\)/.test(after), '显示后必须 restoreGroupCardPos');
  assert.ok(/if\(el\.__ryDragBound\) return;/.test(dragBody), '必须幂等（每帧 updateGroupInfo 都会调）');
});
