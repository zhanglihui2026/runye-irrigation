'use strict';
/* tests/gr_trunk_draw_removed.test.cjs —— 分区成组页「✎ 画总管」入口移除（v844）
 *
 * 为什么用静态锁而不是探针：
 *   要钉的是「入口不许回来」这件事本身 —— DOM 上的按钮、JS 里的绑定、用户看得见的文案。
 *   这类「删除」回归的表现不是报错，而是按钮悄悄出现在页面上（谁也不会去点它），
 *   等发现时三套总管又并存了。
 *
 * 口径（用户拍板，AGENT_HANDOFF §26.83）：
 *   总管只在在线地图页画（plot.trunk v2 是唯一权威）；本页（分区成组）不再支持手画，
 *   但**已画的存量总管照旧渲染、可点选删除、照旧计入材料汇总** —— 删的是入口，不是数据。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'mod', 'inline-29.js'), 'utf8');

/* 去注释再扫 —— 负向断言最容易被自己的注释误伤（v841 踩过：注释里写「原来是 #475569」） */
const stripJsComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const stripHtmlComments = (s) => s.replace(/<!--[\s\S]*?-->/g, '');

test('① index.html：不再有 id="grTrunkDraw" 按钮', () => {
  const live = stripHtmlComments(html);
  assert.equal(live.includes('id="grTrunkDraw"'), false, '按钮回来了？删掉 DOM');
  assert.equal(live.includes('grTrunkDraw'), false, '连引用都不该有（注释除外，上面已剥离）');
});

test('② inline-29：不再有 grTrunkDraw 的绑定与引用', () => {
  const live = stripJsComments(js);
  assert.equal(live.includes('grTrunkDraw'), false, '绑定/active 同步要一起删，别留死引用');
});

test('③ 活代码里不再出现「✎ 画总管」这种入口指引文案', () => {
  const liveJs = stripJsComments(js);
  const liveHtml = stripHtmlComments(html);
  assert.equal(liveJs.includes('✎ 画总管'), false);
  assert.equal(liveHtml.includes('✎ 画总管'), false);
});

test('④ 提示文案要指路：告诉用户去「在线地图」画', () => {
  const liveHtml = stripHtmlComments(html);
  const m = liveHtml.match(/id="grTrunkHint">([^<]*)</);
  assert.ok(m, 'grTrunkHint 还在');
  assert.match(m[1], /在线地图/);
  assert.match(m[1], /编辑总管/);
  const liveJs = stripJsComments(js);
  assert.match(liveJs, /总管在「在线地图」页绘制/);
});

test('⑤ 存量能力必须还在：渲染 / 选中删除 / 清空 / 参考线', () => {
  const liveJs = stripJsComments(js);
  for (const k of ['grRenderTrunk', "click('grTrunkDel'", "click('grTrunkClear'", "$('grTrunkGhost'",
                   'grCommitTrunk', 'grComputeHydraulics']) {
    assert.ok(liveJs.includes(k), '缺 ' + k);
  }
  const liveHtml = stripHtmlComments(html);
  for (const id of ['grTrunkGhost', 'grTrunkDel', 'grTrunkClear', 'grTrunkHint',
                    'grTrunkLen', 'grTrunkN', 'grTrunkMat', 'grTrunkVelRow']) {
    assert.ok(liveHtml.includes('id="' + id + '"'), 'index.html 缺 #' + id);
  }
});

test('⑥ 画线状态机保留（W.mode/W.draw/grExitDraw）—— 恢复入口时不用重写', () => {
  const liveJs = stripJsComments(js);
  for (const k of ['W.mode', 'W.draw', 'grExitDraw']) {
    assert.ok(liveJs.includes(k), '状态机被误删了？' + k);
  }
  /* 但它必须不可达：没有任何活代码把 W.mode 置成 'draw' */
  assert.equal(/mode\s*=\s*['"]draw['"]/.test(liveJs), false,
    '有活代码还在进入画线模式 —— 入口没删干净');
});
