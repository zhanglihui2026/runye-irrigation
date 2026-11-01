'use strict';
/* tests/trunk_palette.test.cjs —— 「总管 = 粗深蓝」的两处同值锁 + 图层顺序锁
 *
 * 为什么要一个"读源码"的测试（不是风格洁癖）：
 *   规格五要求总管在地图上「粗深蓝」，DXF 的 ZG_TRUNK 层也是这个颜色。
 *   这两处一旦各写各的，用户拿到的图纸和屏幕就对不上，而这种差 1 个色号的事
 *   没有任何运行时断言会响 —— 只能在这里钉。
 *   同理，「总管盖在 AI 管网之上」靠的是一个 z-index 常量（430）：
 *   把它改小到 400 以下，屏幕上只是"细管偶尔盖住粗管"，重绘一次顺序又变，
 *   靠肉眼根本判不出来。
 *
 * 这个文件只读源码做静态断言，不启动浏览器（浏览器侧的判据在
 * _probe_trunk_p10_layers.mjs，18 项）。
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

/* 负向断言（"不许再出现 X"）必须**去掉注释**再扫：
   正经改动会在注释里写下"原来是 #475569"，照原文扫会把说明本身判成违规 —— 
   那种红最先被"顺手改成绿"，然后规则就没了。 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/([^:'"\\])\/\/.*$/gm, '$1');
}

const DXF = read('runye-dxf.js');
const MAP = read(path.join('mod', 'online-map.js'));
const ENHANCE = read('runye-map-enhance.js');
const MAP_CODE = stripComments(MAP);
const ENHANCE_CODE = stripComments(ENHANCE);

function hex6(n) { return '#' + Number(n).toString(16).padStart(6, '0').toLowerCase(); }

test('① 地图总管与 DXF 的 ZG_TRUNK 是同一个色值（深蓝）', () => {
  const dxf = DXF.match(/var TRUNK_RGB\s*=\s*0x([0-9a-fA-F]{6})\s*;/);
  assert.ok(dxf, 'runye-dxf.js 里找不到 TRUNK_RGB = 0x……');
  const want = hex6(parseInt(dxf[1], 16));
  const mainMatch = MAP.match(/main:\s*\{\s*color:\s*'(#[0-9a-fA-F]{6})'/);
  assert.ok(mainMatch, 'mod/online-map.js 的 TRUNK_STYLE.main 找不到色值');
  assert.equal(mainMatch[1].toLowerCase(), want,
    '屏幕上画的总管与图纸 ZG_TRUNK 层必须是同一个颜色，实际 ' + mainMatch[1] + ' vs ' + want);
  assert.equal(want, '#1e3a8a', '规格「粗深蓝」的取值被改动了，确认是有意的再改这里');
});

test('② 旧的深灰/浅灰已从总管样式里彻底退场', () => {
  for (const grey of ['#475569', '#94a3b8']) {
    assert.ok(!MAP_CODE.includes(grey),
      'mod/online-map.js 里还留着旧总管的灰色 ' + grey +
      '（规格要深蓝；卫星图上深灰跟田埂/道路几乎同色，用户分不出哪根是总管）');
  }
});

test('③ 主次只差粗细、不差颜色；草稿仍是紫色（还不是总管）', () => {
  const styles = {};
  const re = /(\w+):\s*\{\s*color:\s*'(#[0-9a-fA-F]{6})',\s*weight:\s*(\d+)/g;
  let m;
  while ((m = re.exec(MAP))) styles[m[1]] = { color: m[2].toLowerCase(), weight: Number(m[3]) };
  assert.ok(styles.main && styles.sub && styles.active && styles.draft,
    'TRUNK_STYLE 的四个键没解析全：' + Object.keys(styles).join(','));
  assert.equal(styles.main.color, styles.sub.color,
    '主干/次干必须同色 —— 同一根总管换条线就换个色，用户会以为是两种东西');
  assert.ok(styles.main.weight > styles.sub.weight, '主干要比次干粗');
  assert.equal(styles.draft.color, '#7c3aed',
    '草稿必须与总管区分开（它还没保存，不是总管）；改成深蓝会让人以为已完成');
  assert.notEqual(styles.active.color, styles.main.color, '选中态需要明显区别');
});

test('④ 总管 pane 的 z-index 必须夹在 overlayPane(400) 与 markerPane(600) 之间', () => {
  const z = MAP.match(/trunkPaneEl\.style\.zIndex\s*=\s*'(\d+)'/);
  assert.ok(z, 'mod/online-map.js 里找不到总管 pane 的 z-index 赋值');
  const v = Number(z[1]);
  assert.ok(v > 400, '低于 overlayPane(400) ⇒ 总管会压在 AI 分区管网下面（细管盖粗管）');
  assert.ok(v < 600, '高于 markerPane(600) ⇒ 编辑手柄/捕捉点会被总管线盖住');
  assert.equal(v, 430, 'z-index 被改动了，确认是有意的再改这里');
});

test('⑤ 设计 front 段只在"有真总管"时被跳过，且只在渲染层跳过', () => {
  assert.ok(/function mapTrunkExistsFor\s*\(/.test(ENHANCE),
    'runye-map-enhance.js 缺少 mapTrunkExistsFor（判"这块地地图上有没有真总管"）');
  assert.ok(/hasUsableTrunk\s*\(/.test(ENHANCE),
    '判据必须复用 RyTrunkSchema.hasUsableTrunk（排除成组/合并地块），不要另写一套');
  assert.ok(/if \(isTrunk && suppressFront\) return;/.test(ENHANCE),
    'renderNetwork 里没有跳过设计 front 段 ⇒ 屏幕上会同时出现两根总管（一红一深蓝）');
  /* 只在渲染层跳过：绝不能把存下来的快照改掉（水力校核读的就是它） */
  assert.ok(!/net\.segments\s*=\s*/.test(ENHANCE_CODE),
    '不许改写 net.segments（runye_network_layout 是水力校核的输入，渲染层不能动）');
});
