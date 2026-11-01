'use strict';
/* tests/map_panel_merge.test.cjs —— 分区角度面板并入图层面板（v849 用户反馈）
 *
 * 用户原话：两个工具栏（浮面板）合并到一起，旋转分区角度就用上下箭头调节就行，
 * 单独的正一度负一度的按钮取消。
 *
 * 实现口径：
 *   · index.html 的独立 #ryAnglePanel 浮卡删除；runye-map-enhance.js 建图层面板时
 *     预留 [data-rym-angle-host] 宿主，挂载后把 #ryAnglePanel body 子节点整体搬入
 *     （节点移动不丢监听，runye-map-partition.js 按 id/子节点取控件零改动）；
 *   · ±1° 按钮（data-angle-plus/minus）DOM 与 partition JS 绑定一并删除——
 *     那两行是裸 querySelector 赋 onclick，只删 DOM 不删绑定会炸 IIFE；
 *   · number input 自带上下箭头（step=1），交互等价；
 *   · 移动端预览页（runye-mobile-map-preview.html）有自己的角度实现（anglePlus/Minus
 *     按 id），与本次无关，不许误删。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const enhance = fs.readFileSync(path.join(ROOT, 'runye-map-enhance.js'), 'utf8');
const partition = fs.readFileSync(path.join(ROOT, 'runye-map-partition.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'mod', 'online-map.css'), 'utf8');
const mobile = fs.readFileSync(path.join(ROOT, 'runye-mobile-map-preview.html'), 'utf8');

const stripJs = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const stripHtml = (s) => s.replace(/<!--[\s\S]*?-->/g, '');
const stripCss = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

test('① 独立分区角度浮卡已从 index.html 删除（内容暂存于 #ryAngleParts）', () => {
  const live = stripHtml(html);
  assert.equal(live.includes('id="ryAnglePanel"'), false, '#ryAnglePanel 壳要删');
  assert.equal(live.includes('ryAngleHead') || live.includes('ryAngleFold'), false, '头部/折叠按钮随之删除');
  /* 内容暂存容器必须在（hidden），等 enhance 搬进图层面板 */
  assert.ok(live.includes('id="ryAngleParts"'), '#ryAngleParts 暂存容器要在');
  assert.ok(live.includes('id="mapPartitionTools"'), '分区角度 section 内容要保留（随容器搬运）');
  /* ±1° 按钮不随内容恢复 */
  assert.equal(live.includes('data-angle-plus') || live.includes('data-angle-minus'), false, '±1° 按钮不许回来');
  /* 移动端预览页自己的角度实现不许误删 */
  assert.ok(mobile.includes('anglePlus') && mobile.includes('angleMinus'), '移动页 ±1° 是独立实现，保留');
});

test('② ±1° 按钮 DOM 与 partition JS 绑定一并删除（裸 onclick 留一条就炸 IIFE）', () => {
  const liveHtml = stripHtml(html);
  const liveJs = stripJs(partition);
  assert.equal(liveHtml.includes('data-angle-plus') || liveHtml.includes('data-angle-minus'), false, '按钮 DOM');
  assert.equal(liveJs.includes('data-angle-plus') || liveJs.includes('data-angle-minus'), false, 'JS 绑定/变量');
  assert.equal(liveJs.includes('plusBtn') || liveJs.includes('minusBtn'), false, '变量引用也要清');
  /* number 输入框仍是 step=1（上下箭头交互等价性）——在 enhance 搬运后由 partition JS 操作，
     input 在 partition 里靠 box.querySelector('input') 取，不需要 id */
  assert.ok(liveJs.includes("box.querySelector('input')"), '角度输入仍由 partition JS 接管');
});

test('③ enhance 面板有宿主小节 + 判空搬运逻辑', () => {
  const live = stripJs(enhance);
  assert.ok(live.includes('data-rym-angle-host'), '宿主容器要存在');
  assert.ok(live.includes('rym-angle-title'), '小节标题要存在');
  assert.ok(live.includes("getElementById('ryAngleParts')"), '搬运逻辑要找暂存容器');
  assert.ok(live.includes('wrap.hidden = false'), '搬运成功才展开小节（判空页保持 hidden）');
  assert.ok(/while\s*\(\s*src\.firstChild\s*\)\s*host\.appendChild\(src\.firstChild\)/.test(live),
    '逐子节点搬运（事件监听随节点走）');
  assert.ok(/src\.parentNode\)\s*src\.parentNode\.removeChild\(src\)/.test(live), '暂存容器搬运后移除');
});

test('④ partition JS 锚点不变：仍按 mapPartitionTools 取控件', () => {
  const live = stripJs(partition);
  assert.ok(live.includes("getElementById('mapPartitionTools')"), '锚点 id 不变（搬运后由 getElementById 找到新位置）');
  assert.ok(live.includes('[data-angle-apply]') && live.includes('[data-angle-send]'), '应用/回二级按钮保留');
});

test('⑤ CSS：壳规则退场，host 规则在场', () => {
  const live = stripCss(css);
  assert.equal(live.includes('.ry-angle-panel{'), false, '壳定位规则删除');
  assert.equal(live.includes('.ry-angle-head'), false, '头部规则删除');
  assert.equal(live.includes('.ry-angle-body'), false, 'body 折叠规则删除');
  assert.ok(live.includes('.rym-angle-host{'), 'host 容器规则在场');
  assert.ok(live.includes('.rym-angle-title{'), '小节标题规则在场');
  assert.ok(live.includes('.rym-angle-host .save-row'), 'save-row 前缀已改到 host');
  assert.ok(live.includes('.rym-angle-host .hint'), 'hint 前缀已改到 host');
  assert.equal(live.includes('.ry-angle-panel .save-row'), false, '旧前缀不许残留');
});
