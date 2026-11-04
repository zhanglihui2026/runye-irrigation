'use strict';
/* tests/map_right_drawer.test.cjs —— 在线地图右缘抽屉：图层面板 + 总管参数面板（v961）
 *
 * 用户 2026-11-04：「在线地图的图层悬浮面板及总管参数设置面板都靠右侧收起来，
 * 做法参照分区与管路页面中的多地块编辑 与图层控制面板。」
 *
 * 参照物口径（mod/inline-18.js + mod/style-01.css 的 #ppPlotDrawerTab / #tlWsLayerDrawerTab）：
 * 平时收起 → 右缘一枚竖排标签（vertical-rl / 12px / min-height 96）→ 点击展开、再点收起 →
 * 展开态深绿底白字 → 面板贴标签左侧（right:36）不压住标签。
 *
 * 这个文件钉住的是「抽屉语义不许退化」：
 *   ① 两份 CSS 必须都在（标签条 / 展开态 / 收起时面板真消失）；
 *   ② 面板的 hidden 是唯一真相：标签态由 MutationObserver 跟，不许"标签说了算"；
 *   ③ 互斥必须**同步**收另一张卡 —— 只写 hidden 不刷标签，会出现"两个标签同时亮"；
 *   ④ 没选中总管时不许硬弹空面板（refresh 里 !entry 会立刻 hide，表现为闪一下）；
 *   ⑤ 两张卡的坐标系不同（#map 有 40px 工具条偏移），top 必须分两档写；
 *   ⑥ 资源必须真的被引入（index.html + sw.js CORE 同名版本串），否则线上永远不生效。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const cssRaw = fs.readFileSync(path.join(ROOT, 'mod', 'online-map.css'), 'utf8');
const css = cssRaw.replace(/\/\*[\s\S]*?\*\//g, '');
const jsRaw = fs.readFileSync(path.join(ROOT, 'mod', 'map-right-drawer.js'), 'utf8');
/* 反向断言（"代码里不许出现 X"）必须先剥注释 —— 注释里常写着"不要用 X"，不剥就自己咬自己（v957/v959 各踩一次） */
const js = jsRaw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

const block = (startSel) => {
  const i = css.indexOf(startSel);
  assert.ok(i >= 0, '缺 CSS 规则：' + startSel);
  const j = css.indexOf('}', i);
  assert.ok(j > i, 'CSS 规则没闭合：' + startSel);
  return css.slice(i, j);
};

test('① 右缘标签条与标签样式齐全（竖排 12px / 96px / 展开态深绿）', () => {
  const rail = block('#onlineMapSection .ry-map-rail{');
  assert.ok(/position:\s*absolute/.test(rail), '标签条必须绝对定位贴右缘（不出流，不挤地图）');
  assert.ok(/right:\s*0/.test(rail), '标签条必须贴右缘 right:0');
  assert.ok(/z-index:\s*11\d\d/.test(rail), '标签条层级要高于两张面板（面板 z 1000/1170），否则点不到');
  assert.ok(/pointer-events:\s*none/.test(rail), '标签条容器不吃事件（否则整条 26px 竖带挡住地图拖动）');

  const tab = block('#onlineMapSection .ry-map-rail-tab{');
  assert.ok(/writing-mode:\s*vertical-rl/.test(tab), '标签必须竖排（参照页 .pp-plot-drawer-tab 同款）');
  assert.ok(/font-size:\s*12px\s*!important/.test(tab),
    '字号必须 12px + !important：runye-typography 的 button{font-size:13px!important} 会顶掉（v825 实测）');
  assert.ok(/min-height:\s*96px/.test(tab), '标签高度 96px（与参照页一致）');
  assert.ok(/pointer-events:\s*auto/.test(tab), '容器 none 了，标签自己必须 auto，否则点不动');
  assert.ok(/width:\s*26px/.test(tab), '标签宽度 26px（面板 right:36 才留得出 10px 间距）');

  assert.ok(/\.ry-map-rail-tab\.open\{[^}]*background:\s*#2d604b/.test(css), '展开态要深绿底（与参照页 .open 同色系）');
  assert.ok(/\.ry-map-rail-tab\.is-hint\{/.test(css), '缺 is-hint 提示态（面板没准备好 / 未选中总管时闪一下）');
  assert.ok(/\.rym-layer-panel\[hidden\]\{display:\s*none\s*!important\}/.test(css),
    '图层面板收起必须真的 display:none（将来有人给 .ry-float-card 补 display 就会漏）');
});

test('② 两张面板都按选择器接管，且默认收起', () => {
  assert.ok(/sel:\s*'\.rym-layer-panel'/.test(js), '没接管图层面板 .rym-layer-panel');
  assert.ok(/sel:\s*'#trunkPropPanel'/.test(js), '没接管总管参数面板 #trunkPropPanel');
  assert.ok(/label:\s*'图层'/.test(js) && /label:\s*'总管参数'/.test(js), '标签文字应为「图层」「总管参数」');
  assert.ok(/panel\.hidden\s*=\s*true/.test(js), 'attach 时必须把面板压成收起（用户口径：平时折叠在右侧）');
});

test('③ 标签态跟 hidden 走（MutationObserver），且互斥要同步刷标签', () => {
  assert.ok(/new MutationObserver/.test(js), '必须监听面板 hidden 变化：面板也会被别处开关（选中总管自动弹、点 ×）');
  assert.ok(/attributeFilter:\s*\['hidden'\]/.test(js), '只监听 hidden 属性即可（面板内部刷新不改它）');
  const closeOther = (() => {
    const i = js.indexOf('function closeOther(');
    assert.ok(i >= 0, '缺 closeOther');
    return js.slice(i, js.indexOf('\n  }', i));
  })();
  assert.ok(/sync\(d\)/.test(closeOther),
    '互斥收另一张卡时必须**同步**调 sync：只写 hidden 的话标签高亮要等下一个微任务，同一 tick 会读到两个标签都亮');
  assert.ok(!/style\.display/.test(js), '收起统一用 hidden 属性，不许各写一套 display');
});

test('④ 未选中总管时不硬弹空面板（否则会闪一下就没）', () => {
  assert.ok(/data-ry-has-trunk/.test(js), '缺 has-trunk 判定：没选中总管时 refresh 会立刻 hide');
  assert.ok(/flash\(railTab\(def\.key\)/.test(js), '该给提示而不是硬弹');
  const om = fs.readFileSync(path.join(ROOT, 'mod', 'online-map.js'), 'utf8');
  assert.ok(/setAttribute\('data-ry-has-trunk'/.test(om),
    'online-map.js 的 syncTrunkPanel 必须写 data-ry-has-trunk（抽屉据此判断能否展开）');
  assert.ok(/ensureTrunkPanel\(\); if\(P0\) P0\.hide\(\)/.test(om),
    '总管面板要在建图时预热挂载（否则标签只能报"面板还没准备好"）');
});

test('⑤ 两张卡坐标系不同：top 必须分两档（#map 有 40px 工具条偏移）', () => {
  assert.ok(/PANEL_TOP_IN_MAP\s*=\s*12/.test(js), '图层面板在 #map 内，top 应为 12px（视觉上 = map-wrap 顶 + 52）');
  assert.ok(/PANEL_TOP\s*=\s*52/.test(js), '总管面板在 .map-wrap 内，top 应为 52px（工具条 40 + 12）');
  assert.ok(/PANEL_RIGHT\s*=\s*36/.test(js), '面板右缘要留出标签宽度 + 间距（36px）');
  assert.ok(/panel\.style\.left\s*=\s*'auto'/.test(js) && /panel\.style\.bottom\s*=\s*'auto'/.test(js),
    '每次展开必须先清 left/bottom：ry-panel 拖拽写的是 left/top，只改 right/top 会被同时生效撑变形');
  assert.ok(/maxHeight = 'calc\(100% - 70px\)'/.test(js), '总管面板吸顶后要重算 max-height（原来那条是按 bottom:30 量的）');
});

test('⑥ 资源真的被引入：index.html + sw.js CORE 同名版本串', () => {
  const m = html.match(/<script src="mod\/map-right-drawer\.js\?v=([0-9a-zA-Z._-]+)"><\/script>/);
  assert.ok(m, 'index.html 里没有 mod/map-right-drawer.js 的 <script>（线上永远不生效）');
  const ver = m[1];
  assert.ok(sw.includes('"mod/map-right-drawer.js"'), 'sw.js 的 CORE 名单里没有它 ⇒ 离线/首屏拿不到');
  assert.ok(html.includes('style-01.css?v=' + ver), 'index.html 版本串没抬：css 与脚本必须同一个 v');
  assert.match(sw, new RegExp("const VERSION = 'v" + ver.replace(/[-.]/g, '\\$&') + "'"),
    'sw.js 的 VERSION 必须是 v' + ver + '（去 v 后与 ?v= 逐字相等）');
});
