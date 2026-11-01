'use strict';
/* tests/map_hint_bottom.test.cjs —— 总管常驻提示条挪到地图底部（v847 用户反馈）
 *
 * 用户原话：点击按钮弹出的文字跟下面的文字合并一处，放在下面，不然上面点击弹出的
 * 文字遮挡其他按钮（右侧「图层」面板被顶部黑条盖住一行）。
 *
 * 静态锁口径：.map-trunk-hint 的定位必须是 bottom 吸底 + left:14（与 #tip 对齐），
 * 顶部定位（top / 水平居中 translateX）不许回来。显隐逻辑与文案在 JS（updateTrunkHint），
 * 与位置无关，探针 p2 C4/C9 照旧能过。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(ROOT, 'mod', 'online-map.css'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

/* 去注释再扫：负向断言最容易被自己的注释误伤（v841 踩过） */
const stripCssComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

function hintRule() {
  const live = stripCssComments(css);
  const i = live.indexOf('.map-trunk-hint{');
  assert.ok(i >= 0, '.map-trunk-hint 规则必须存在');
  return live.slice(i, live.indexOf('}', i));
}

test('① 提示条吸底：bottom 定位，不再出现在顶部', () => {
  const r = hintRule();
  assert.ok(r.includes('bottom:50px'), '要贴在状态栏(0~24)与 #tip(14~47) 上方');
  assert.ok(!/top:\s*\d/.test(r), '顶部定位不许回来（用户反馈：遮挡顶部按钮）');
  assert.ok(!r.includes('translateX'), '水平居中定位也不该有（现在靠左与 #tip 对齐）');
  assert.ok(r.includes('left:14px'), 'left:14 与底部 #tip 对齐，视觉上合并成一处提示区');
});

test('② 右下角 PWA 安装条存在时 hint 右侧让位', () => {
  const live = stripCssComments(css);
  assert.ok(live.includes('body:has(.ry-pwa-install) #onlineMapSection .map-trunk-hint{max-width:calc(100% - 210px)}'),
    'PWA 安装条(z2000)在右下角，hint 右端要收窄不被盖');
});

test('③ DOM 节点仍在，旧「吸顶」注释已更新', () => {
  assert.ok(html.includes('id="mapTrunkHint"'), 'mapTrunkHint DOM 必须保留（updateTrunkHint 靠它）');
  assert.equal(/提示条吸顶/.test(html), false, '旧注释「吸顶」要更新，防止下个人照注释改回去');
});
