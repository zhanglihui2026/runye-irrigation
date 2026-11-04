'use strict';
/* tests/trunk_panel_chrome.test.cjs —— 总管参数面板外壳（v855-panel-drag-fold）
 *
 * 钉「面板可拖动 + 可折叠」的结构契约，不是交互细节（交互靠 p7 探针）：
 *   ① DOM：标题栏里折叠按钮 #tpFold 必须存在且在 #tpClose 之前；原 11 个 tp* 控件 id 不动
 *      （探针 p7 与宿主 refresh() 都按 id 取件，改名=静默故障）。
 *   ② 绑定：setupPanelChrome 必须存在且在 mount 里调用，且用 __ryTpChrome 标记防重复绑定
 *      （mount 可能复用已存在的面板元素，重复绑定会让一次 pointerdown 挂 N 个 move 监听）。
 *   ③ 拖拽把手是 .tp-head，且 #tpFold/#tpClose 必须被排除（否则点不到按钮）。
 *   ④ 持久化键：位置 ryTrunkPanelPos、折叠 ryTrunkPanelFolded（localStorage）。
 *   ⑤ 折叠切换 is-folded 类、拖拽中 is-dragging 类。
 *   ⑥ CSS：tp-head 有 cursor:move + touch-action:none（触屏可拖）；is-folded 隐藏
 *      tp-body/tp-foot；.tp-fold 有样式；外壳不写 border-radius 数值
 *      （全站 body *{border-radius:0!important} 会压掉它，写了也白写）。
 *   ⑦ 版本三处同抬：index.html 的 style-01.css?v= 逐字等于 sw.js 的 VERSION（去 v）；
 *      本次改的 online-map.css / trunk-panel.js 两个 CORE 文件 ?v= 同抬。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const panelSrc = read('mod/trunk-panel.js');
const cssSrc = read('mod/online-map.css');
const indexSrc = read('index.html');
const swSrc = read('sw.js');

test('① DOM：#tpFold 存在、位于 #tpClose 之前、核心 tp* 控件 id 未动', () => {
  const buildDom = panelSrc.match(/function buildDom\(\)[\s\S]*?\n  \}/);
  assert.ok(buildDom, 'buildDom 函数应存在');
  const src = buildDom[0];
  assert.ok(src.includes("id=\"tpFold\""), 'buildDom 应包含折叠按钮 #tpFold');
  assert.ok(src.indexOf('tpFold') < src.indexOf('tpClose'), 'tpFold 应在 tpClose 之前');
  /* [v965] 'tpJoint' 从这份「不得改名」名单里移除：那个容器是「联合复核」块的宿主，
     已被用户要求整块取消（见 tests/trunk_panel_joint_removed.test.cjs）。其余 id 一个都不许动。 */
  for (const id of ['tpCode', 'tpMaterial', 'tpDn', 'tpDnCustom', 'tpFlow', 'tpProj',
    'tpSlope', 'tpZ0', 'tpZ1', 'tpDz', 'tpV', 'tpHf', 'tpHj', 'tpRecheck',
    'tpMarkNode', 'tpWarnToggle']) {
    assert.ok(src.includes('id="' + id + '"'), '核心控件 id 不得改名：' + id);
  }
});

test('② setupPanelChrome 存在、mount 调用、__ryTpChrome 防重复绑定', () => {
  assert.ok(/function setupPanelChrome\(/.test(panelSrc), 'setupPanelChrome 应存在');
  assert.ok(/setupPanelChrome\(el\)/.test(panelSrc), 'mount 里应调用 setupPanelChrome(el)');
  assert.ok(panelSrc.includes('__ryTpChrome'), '应有 __ryTpChrome 防重复绑定标记');
  assert.ok(panelSrc.includes("if (el.__ryTpChrome) return;"), '重复绑定时应直接返回');
});

test('③ 拖拽把手 = .tp-head，排除 #tpFold/#tpClose', () => {
  assert.ok(/querySelector\('\.tp-head'\)/.test(panelSrc), '把手应为 .tp-head');
  assert.ok(/closest\('#tpFold,#tpClose'\)/.test(panelSrc), '按钮必须排除在拖拽之外');
  assert.ok(panelSrc.includes("addEventListener('pointerdown'"), '应绑定 pointerdown');
});

test('④ 持久化键固定：ryTrunkPanelPos / ryTrunkPanelFolded', () => {
  assert.ok(panelSrc.includes("'ryTrunkPanelPos'"), '位置键 ryTrunkPanelPos');
  assert.ok(panelSrc.includes("'ryTrunkPanelFolded'"), '折叠键 ryTrunkPanelFolded');
});

test('⑤ 状态类：is-folded / is-dragging', () => {
  assert.ok(/classList\.toggle\('is-folded'/.test(panelSrc), '折叠应切 is-folded');
  assert.ok(/classList\.add\('is-dragging'\)/.test(panelSrc), '拖拽中应加 is-dragging');
  assert.ok(/classList\.remove\('is-dragging'\)/.test(panelSrc), '拖拽结束应移除 is-dragging');
});

test('⑥ CSS：把手可拖、折叠生效、tp-fold 有样式、不写 border-radius 数值', () => {
  const idx = cssSrc.indexOf('v855-panel-drag-fold');
  const chrome = cssSrc.slice(cssSrc.lastIndexOf('/*', idx));
  assert.ok(chrome.length > 0, 'online-map.css 尾部应有 v855 段');
  assert.ok(/\.tp-head\{[^}]*cursor:move/.test(chrome), 'tp-head 应 cursor:move');
  assert.ok(/\.tp-head\{[^}]*touch-action:none/.test(chrome), 'tp-head 应 touch-action:none（触屏）');
  assert.ok(/\.is-folded \.tp-body/.test(chrome) && /\.is-folded \.tp-foot/.test(chrome),
    'is-folded 应隐藏 tp-body 与 tp-foot');
  assert.ok(/\.tp-fold\{/.test(chrome), '.tp-fold 应有样式');
  /* v855 新增段不得引入 border-radius 数值（全站统一切角，写了必被 !important 压掉）。
     先剥掉块注释再判——注释里的反例文字（body * 带 border-radius:0 加 important）不算违规。 */
  const cssNoComment = chrome.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/border-radius:\s*\d/.test(cssNoComment), 'v855 段禁止写 border-radius 数值');
});

test('⑦ 版本三处同抬：855-panel-drag-fold', () => {
  const swV = (swSrc.match(/const VERSION = '([^']+)';/) || [])[1];
  assert.ok(swV, 'sw.js 应有 VERSION');
  const tag = swV.replace(/^v/, '');
  const styleV = (indexSrc.match(/mod\/style-01\.css\?v=([^"]+)/) || [])[1];
  assert.equal(styleV, tag, 'style-01.css?v= 必须逐字等于 sw VERSION（去 v）');
  for (const f of ['mod/online-map.css', 'mod/trunk-panel.js', 'mod/online-map.js']) {
    const v = (indexSrc.match(new RegExp(f.replace(/\//g, '\\/') + '\\?v=([^"]+)')) || [])[1];
    assert.equal(v, tag, f + ' 的 ?v= 应同抬为 ' + tag);
  }
  assert.ok(panelSrc.includes('v855-panel-drag-fold') && cssSrc.includes('v855-panel-drag-fold'),
    '改动文件应带 v855 标记注释');
});
