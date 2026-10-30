'use strict';
/* tests/toolbar_single_layer.test.cjs —— 绘图工具栏「单层样式 + 图标不被擦掉」契约（v824 起）
 *
 * 一、图标为什么必须由这两个函数改（用户 2026-10-30：「锁定面积那个按钮目前还不能正常显示」）
 *   病根不是「看不见」，而是**点了就永久空**：
 *     ppUpdateLockAreaBtn() 里写 `btn.textContent='已锁定面积'`，
 *     textContent 是整体替换子节点，会把 mod/ry-icons.js 的 decorate() 刚插进去的
 *     <svg class="ry-ico"> 一起清掉；而 decorate() 只在初始化跑一次 ⇒ 图标再也回不来。
 *   实测（_probe_lock_click.mjs，线上同版）：点一下 #ppLockArea，
 *     hasSvg: true → false，再点一次仍是 false；按钮 font-size:0 又藏起文字 ⇒ 空白方块。
 *   所以：状态一律走 RyIcons.setIcon / setLabel（只换图标、只换文字，保住 SVG）。
 *
 * 二、单层样式（用户同一条指令后半句：「是不是有多层样式，把覆盖掉的、没有用的样式
 *   代码都删除了」）
 *   `_probe_lock_btn.mjs` 用 CDP 把 #ppLockArea 命中的 18 条规则原样导出，实测同一件事
 *   被写了两三遍、靠源码顺序决胜负。v824 收口后本文件把「唯一出处」钉死：
 *     · 条带盒模型 → 只有 #ryDrawingHost>.ry-drawing-toolbar 一处；
 *     · 按钮尺寸   → 只有 v802 段 `.ry-drawing-toolbar button[data-ry-icon]` 一处；
 *     · 图标通道   → 只有 v815 段（SVG），::before 字形通道彻底退役。
 *
 * 判定在**剥掉注释**的源码上做：原地留的退役说明里会写「原来写的是 width:100%」，
 * 不剥注释就自打自脸。
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripCss = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const stripJs = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const css = stripCss(read('mod/style-01.css'));
const plotEditor = stripJs(read('mod/plot-editor.js'));
const inline24 = stripJs(read('mod/inline-24.js'));
const ryIcons = stripJs(read('mod/ry-icons.js'));

/* 取一个函数体：从 function 名到下一个同级 function 声明 */
function fnBody(src, name) {
  const i = src.indexOf('function ' + name + '(');
  assert.ok(i > 0, '找不到函数 ' + name + '（改名或删了？）');
  const rest = src.slice(i);
  const j = rest.indexOf('\n  function ', 10);
  return j > 0 ? rest.slice(0, j) : rest;
}

test('v824 ry-icons 提供 setIcon / setLabel，且 setLabel 保住首子节点 SVG', () => {
  for (const fn of ['setIcon', 'setLabel']) {
    assert.ok(new RegExp('function ' + fn + '\\(').test(ryIcons), 'ry-icons.js 应定义 ' + fn);
    assert.ok(new RegExp('window\\.RyIcons[^;]*' + fn).test(ryIcons), 'RyIcons 应对外暴露 ' + fn);
  }
  assert.ok(/unlock:/.test(ryIcons), '应提供 unlock（解锁态）图标，锁定/解锁要能看出区别');
  const body = fnBody(ryIcons, 'setLabel');
  assert.ok(/:scope > \.ry-ico/.test(body), 'setLabel 必须先找 .ry-ico 再动文字（否则照样会清掉图标）');
  assert.ok(/insertAdjacentHTML|setIcon/.test(body), 'setLabel 在图标已丢时应能补挂回来');
});

test('v824 锁定面积状态同步：不许 textContent，必须换图标 + aria-pressed', () => {
  const body = fnBody(plotEditor, 'ppUpdateLockAreaBtn');
  assert.ok(!/\.textContent\s*=/.test(body),
    'ppUpdateLockAreaBtn 不许写 textContent —— 会把 decorate() 挂的 <svg> 一起清掉，'
    + '图标再也回不来（用户实测「点一下按钮就空白」）');
  assert.ok(/areaLocked/.test(body), '状态源应仍是 ppState.areaLocked');
  assert.ok(/ppSetBtnIcon|RyIcons\.setIcon/.test(body),
    '应通过 ppSetBtnIcon → RyIcons.setIcon 切换图标');
  assert.ok(/window\.RyIcons[\s\S]*?setIcon/.test(fnBody(plotEditor, 'ppSetBtnIcon')),
    'ppSetBtnIcon 包装函数必须真的调到 RyIcons.setIcon');
  assert.ok(/unlock/.test(body) && /lock/.test(body), '应同时用到 lock 与 unlock 两个图标');
  assert.ok(/aria-pressed/.test(body), '应同步 aria-pressed，读屏与 CSS 都依赖它');
  assert.ok(/title\s*=/.test(body), '应同步 title，文字被 font-size:0 藏起来后只剩提示可读');
});

test('v824 其它会改文案的工具栏按钮同样不许 textContent', () => {
  for (const name of ['ppUpdateAutoPipeButton', 'ppApplyZoneAutoUI']) {
    const body = fnBody(plotEditor, name);
    assert.ok(!/\.textContent\s*=/.test(body),
      name + ' 不许写 textContent（同一根因：会擦掉按钮里的 SVG 图标）');
  }
  for (const v of ['delBtn', 'multiBtn', 'maskBtn']) {
    assert.ok(!new RegExp('\\b' + v + '\\.textContent\\s*=').test(inline24),
      'inline-24.js 的 ' + v + ' 不许写 textContent，应走 setBtnLabel / RyIcons.setLabel');
  }
});

test('v824 工具栏不再有 ::before 字形图标通道（与 SVG 双份渲染）', () => {
  assert.strictEqual((css.match(/content:attr\(data-ry-icon\)/g) || []).length, 0,
    'content:attr(data-ry-icon) 已随 v815 的 SVG 通道退役，不许回来 —— 它会和 SVG 叠成两份图标');
});

test('v824 条带盒模型只有一处出处', () => {
  assert.strictEqual((css.match(/#ryDrawingHost>\.ry-drawing-toolbar\{/g) || []).length, 1,
    '工具栏条带（高度/内边距/底色/下边框）只允许在一处定义；'
    + '此前 46px/#f8fbf9 与 40px/#fff 两份并存，靠源码顺序后者赢，改哪份都不生效');
});

test('v824 工具栏按钮尺寸只有一处出处（32×32）', () => {
  assert.strictEqual((css.match(/flex:0 0 32px!important/g) || []).length, 1,
    '按钮 32×32 只允许一处 !important 定义（v782 的 28×28 那套已删，别再平行加一层）');
  assert.strictEqual((css.match(/[^\d]28px!important/g) || []).length, 0,
    '工具栏里不该再有 28×28 那套尺寸（实测从未生效，纯粹是第二层）');
});

test('v824 #ppToolbar 不再是「贴右缘竖排」的老布局', () => {
  assert.ok(!/#ppToolbar\{[^}]*flex-direction:column/.test(css),
    '#ppToolbar 已是宿主顶部一行（flex-direction:row），竖排容器规则已删，不许回来');
  assert.ok(!/#ppToolbar>[^{]*\.pp-btn-ghost[^{]*\{[^}]*width:100%/.test(css),
    '竖排时代「按钮独占一行、铺满列宽」（width:100%）已删 —— 它会让图标按钮被拉成整宽');
});

test('v824 被覆盖的「实心绿 active」与重复隐藏规则不许回来', () => {
  assert.ok(!/#ppToolbar>button\.pp-btn[^{]*\.active/.test(css),
    'v597 的 .pp-btn.active{background:#2d604b} 在 v815 之后从未生效（34 个按钮全有 data-ry-icon），'
    + '已删；工具栏激活态的唯一出处是 v815 段的 #e6f2ec / #1c6b4f');
  assert.strictEqual((css.match(/#ppQuickBar\[hidden\]/g) || []).length, 1,
    '#ppQuickBar[hidden] 只应出现一次（合并进 ppToolbar/tlWsToolbar 那条）');
  assert.strictEqual((css.match(/data-ry-tool-group\] button\[data-ry-icon\]/g) || []).length, 1,
    '[data-ry-tool-group] 只在 :focus-visible 那条里出现；尺寸/悬停/字形那三条重复规则已删');
});

test('v825 右缘两个竖排抽屉标签统一 12px（不许被全局 13px 顶回去）', () => {
  /* 两个标签都是 <button>，会被 runye-typography 的
     `p,li,input,select,button{font-size:13px!important}` 统一顶成 13px，
     而左栏一级标题是 <summary>（12px）⇒ 右侧标签比左栏显眼。
     用户截图要求「红箭头（图层控制）跟蓝箭头（多地块编辑/左栏标题）文字尺寸统一」。
     ⇒ 本规则必须：① 两个 id 写在同一条规则里；② 带 font-size:12px!important。 */
  const idx = css.indexOf('#ryDrawingHost #ppPlotDrawerTab');
  assert.ok(idx > 0, '找不到抽屉标签规则（改名了？）');
  const rule = css.slice(idx, css.indexOf('}', idx) + 1);
  assert.ok(rule.includes('#ryDrawingHost #tlWsLayerDrawerTab'),
    '两个抽屉标签必须在同一条规则里，字号才不会各走一套');
  assert.ok(/font-size\s*:\s*12px\s*!important/.test(rule),
    '必须写 font-size:12px!important —— 不写 !important 会被全局 button{font-size:13px!important} 顶成 13px'
    + '（历史实测：样式里写着 12px，计算值一直是 13px）');
});

test('v826 顶部工具栏只有条带一个绘制面：组容器不许自己画底色/边框', () => {
  /* 用户 2026-10-30 红框截图：「这个工具栏与其他的样式不一样，有若隐若现的浅绿色」。
     根因是 v597 给 #ppToolbar 单独画了一层 linear-gradient(#f8fbf9→#f2f7f4) + border-left，
     而 #tlWsToolbar 没有 ⇒ 同一条工具栏左半截发绿、右半截纯白（CDP 计算样式实测）。 */
  assert.ok(!/#ppToolbar\{[^}]*linear-gradient/.test(css),
    '#ppToolbar 不许再有自己的渐变底色 —— 那就是「若隐若现的浅绿色」，'
    + '工具栏的底色只能由 #ryDrawingHost>.ry-drawing-toolbar 一处给');
  assert.ok(!/#tlWsToolbar\{[^}]*linear-gradient/.test(css),
    '#tlWsToolbar 同理：组容器只是透明排版盒');

  const i = css.indexOf('#ryDrawingHost #ppToolbar,#ryDrawingHost #tlWsToolbar{');
  assert.ok(i > 0, '找不到组容器的透明护栏规则');
  const rule = css.slice(i, css.indexOf('}', i) + 1);
  assert.ok(/background\s*:\s*transparent/.test(rule), '组容器必须 background:transparent');
  assert.ok(/border\s*:\s*0\s*!important/.test(rule), '组容器必须 border:0!important（防止哪天又加一条边线）');
  assert.ok(/box-shadow\s*:\s*none\s*!important/.test(rule), '组容器必须 box-shadow:none!important');
});
