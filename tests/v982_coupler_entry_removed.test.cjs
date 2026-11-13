'use strict';
/* tests/v982_coupler_entry_removed.test.cjs —— [v982] 接驳节点入口下线锁
 *                                      [v1057 M13 反转] 入口回归二级页
 *
 * v982 原拍板（2026-11-05）：「这个接驳点似乎没什么用了，取消吧」——只删入口、
 * 底层全保留，恢复入口零成本。
 * M13 2026-11-13 主线拍板反转：「加节点放在分区与管路页。接驳节点按主管身份和
 * 沿线桩号绑定；分区、切线或角度变化后，节点随管线重算并重新投影。不要把地图
 * 手绘总管或轮灌动画节点编辑挪进来。」——入口与面板回归 index.html（v982 预留
 * 的「恢复零成本」路径兑现），底层数据链与绑定守卫不变。
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const pe = fs.readFileSync(path.join(ROOT, 'mod', 'plot-editor.js'), 'utf8');

test('[v1057 M13] 接驳节点入口与面板回归 index.html（恢复 v982 预留路径）', () => {
  assert.ok(html.includes('id="ppCouplerBtn"'), '⚓ 接驳节点按钮必须回归');
  assert.ok(html.includes('id="ppCouplerPanel"'), '接驳节点定位面板必须回归');
  assert.ok(html.includes('⚓ 接驳节点'), '按钮文案回归');
  assert.ok(html.includes('[M13 2026-11-13 主线任务恢复]'), '必须留 M13 恢复存照注释');
});

test('[v982→M13] plot-editor 绑定保留 if 守卫（原锁不变）', () => {
  assert.ok(pe.includes("var btn=document.getElementById('ppCouplerBtn');\n    if(btn)"), '按钮绑定必须 if(btn) 守卫');
  assert.ok((pe.match(/var panel=document\.getElementById\('ppCouplerPanel'\);\n    if\(panel\)/g) || []).length >= 2,
    '面板绑定必须全部 if(panel) 守卫');
});

test('[v982→M13] 底层数据链保留（pipeKey+桩号绑定）', () => {
  assert.ok(pe.includes('ppState.couplerNodes'), 'couplerNodes 数据层必须保留');
  assert.ok(pe.includes('function ppCouplerSetPlacing('), '放置模式函数必须保留');
  assert.ok(fs.existsSync(path.join(ROOT, 'tests', 'coupler_nodes.test.cjs')), '底层落点锁仍在');
});

test('[v982→M13] 版本同抬：14 处主版本串动态等于 sw VERSION', () => {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const v = sw.match(/^const VERSION = '([^']+)';/m);
  const want = v[1].replace(/^v/, '');
  assert.equal(html.split('?v=' + want).length - 1, 14);
});
