'use strict';
/* tests/v982_coupler_entry_removed.test.cjs —— [v982] 接驳节点入口下线锁
 *
 * 用户拍板（2026-11-05）：「这个接驳点似乎没什么用了，取消吧」——v916 之后演示水流入
 * 走 buildFlowRoutes 自动裁剪，手工放置接驳点已无必要。
 * 取消口径与「自动管路」（2026-11-02）同款：**只删入口，底层全保留**——
 * ppState.couplerNodes / ppCouplerSetPlacing / 地图捕捉 / 演示入口标记不动，
 * 旧存档里的既有节点照常渲染，plot-editor 对缺失元素全部 if 守卫不炸。
 *
 * 钉三件事：
 *  ① index.html 不再有 #ppCouplerBtn / #ppCouplerPanel（入口+面板都删）；
 *  ② plot-editor 的绑定仍带 if(btn)/if(panel) 守卫（元素缺失不炸，恢复入口零成本）；
 *  ③ 底层数据链仍在（ppState.couplerNodes / ppCouplerSetPlacing）——旧存档兼容。
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const pe = fs.readFileSync(path.join(ROOT, 'mod', 'plot-editor.js'), 'utf8');

test('[v982] 接驳节点入口与面板已从 index.html 移除', () => {
  assert.ok(!html.includes('id="ppCouplerBtn"'), '⚓ 接驳节点按钮必须删除');
  assert.ok(!html.includes('id="ppCouplerPanel"'), '接驳节点定位面板必须删除');
  assert.ok(!html.includes('⚓ 接驳节点'), '按钮文案不得残留');
  assert.ok(html.includes('[2026-11-05 用户拍板 取消] 「接驳节点」入口已删'), '必须留取消存照注释');
});

test('[v982] plot-editor 绑定保留 if 守卫（元素缺失不炸，恢复入口零成本）', () => {
  assert.ok(pe.includes("var btn=document.getElementById('ppCouplerBtn');\n    if(btn)"), '按钮绑定必须 if(btn) 守卫');
  assert.ok((pe.match(/var panel=document\.getElementById\('ppCouplerPanel'\);\n    if\(panel\)/g) || []).length >= 2,
    '面板绑定必须全部 if(panel) 守卫');
});

test('[v982] 底层数据链保留（旧存档兼容）', () => {
  assert.ok(pe.includes('ppState.couplerNodes'), 'couplerNodes 数据层必须保留');
  assert.ok(pe.includes('function ppCouplerSetPlacing('), '放置模式函数必须保留（dormant）');
  assert.ok(fs.existsSync(path.join(ROOT, 'tests', 'coupler_nodes.test.cjs')), '底层落点锁仍在');
});

test('[v982] 版本同抬：14 处主版本串动态等于 sw VERSION', () => {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const v = sw.match(/^const VERSION = '([^']+)';/m);
  const want = v[1].replace(/^v/, '');
  assert.equal(html.split('?v=' + want).length - 1, 14);
});
