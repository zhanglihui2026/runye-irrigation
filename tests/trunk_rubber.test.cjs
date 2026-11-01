'use strict';
/* tests/trunk_rubber.test.cjs —— 总管绘制橡皮筋虚线（v852 用户反馈）
 *
 * 用户原话：点一个点然后随着鼠标有虚线显示，再点击第二个点形成直线。
 *
 * 实现口径（静态锁）：
 *   ① click 落点与 mousemove 预览必须走同一个 trunkSnapPoint——
 *     两边各写一份迟早漂移（预览吸到了、落点没吸上是最迷惑的 bug）；
 *   ② 橡皮筋挂 trunkGroup（关「测量框」不连坐，v841 纪律）、TRUNK_PANE、
 *     interactive:false（不吃地图点击）、虚线 dashArray；
 *   ③ 清理必须统一走 setTrunkMode（Esc/完成/双击收线/互斥切换全都经过它）；
 *   ④ 落点后虚线要更新（不然旧橡皮筋与新草稿线双重显示）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const js = fs.readFileSync(path.join(ROOT, 'mod', 'online-map.js'), 'utf8');
const stripJs = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

test('① click 与 mousemove 共用 trunkSnapPoint（预览=落点，不许两份逻辑）', () => {
  const live = stripJs(js);
  assert.ok(/function trunkSnapPoint\(cur, shiftOn\)/.test(live), 'trunkSnapPoint 要存在');
  /* click 里不许再有独立的 snap/ortho 分支 */
  const clickBlock = live.slice(live.indexOf("map.on('click'"), live.indexOf("function orthoPoint"));
  assert.equal(clickBlock.includes('orthoPoint('), false, 'click 里不许手写 orthoPoint（走 trunkSnapPoint）');
  assert.equal(clickBlock.includes('_snap.nearest'), false, 'click 里不许手写 nearest');
  assert.ok(clickBlock.includes('trunkSnapPoint(trunkPoint, shiftOn)'), 'click 走公共换算');
  assert.ok(live.includes('var pv=trunkSnapPoint(lastCursorLatLng, shiftOn)'), 'mousemove 预览走同一换算');
});

test('② 橡皮筋挂 trunkGroup / TRUNK_PANE / interactive:false / 虚线', () => {
  const live = stripJs(js);
  const i = live.indexOf('function updateTrunkRubber');
  assert.ok(i >= 0, 'updateTrunkRubber 要存在');
  const blk = live.slice(i, live.indexOf('}', live.indexOf('addTo(trunkGroup)', i)));
  assert.ok(blk.includes('trunkGroup.removeLayer(trunkRubber)') || live.includes('function removeTrunkRubber'), '清理函数在');
  assert.ok(blk.includes('pane:TRUNK_PANE'), '挂总管 pane');
  assert.ok(blk.includes('interactive:false'), '不吃地图点击');
  assert.ok(blk.includes('dashArray'), '是虚线');
});

test('③ 清理统一走 setTrunkMode', () => {
  const live = stripJs(js);
  const i = live.indexOf('function setTrunkMode');
  const blk = live.slice(i, live.indexOf('\n', live.indexOf('removeTrunkRubber();', i)));
  assert.ok(blk.includes('removeTrunkRubber()'), 'setTrunkMode 里要清橡皮筋');
});

test('④ click 落点后更新橡皮筋（防旧线与新草稿双重显示）', () => {
  const live = stripJs(js);
  const clickBlock = live.slice(live.indexOf("map.on('click'"), live.indexOf('function orthoPoint'));
  assert.ok(clickBlock.includes('updateTrunkRubber('), '落点后要刷新橡皮筋');
});
