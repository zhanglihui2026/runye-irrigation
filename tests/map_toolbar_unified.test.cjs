'use strict';
/* tests/map_toolbar_unified.test.cjs —— 在线地图绘制条「吸附顶部 + 图标钮 + 悬停提示」（v951）
 *
 * 用户诉求（原话）：「红框中的工具栏跟分区与管路页面一样，也放在顶部吧，能用图例（图标）的
 * 尽量用图例，手放在上面提示功能，图例样式跟分区与管路页面的统一。」
 *
 * 这个文件守四件事（每件都能独立红）：
 *   ① 位置：条带吸附在画布顶部（不再是浮在卫星图上、位置可拖的浮条）。
 *      浮条的两个"味道"标记 ryp-float / data-ry-panel 一旦回来就是回潮。
 *   ② 让位：条带 40px ⇒ #map 的 top 必须同步 40px，否则地图顶进条带底下（地图交互被压）。
 *   ③ 图标 + 提示：11 个按钮**每个**都要有 title（悬停说明）且在 ry-icons.js 的 BY_ID 有映射，
 *      且映射到的图标名在 P 里真实存在（拼错名字 = 空白方块，静态期就抓）。
 *   ④ 文案不许用 textContent：v824 踩过 —— decorate() 只在启动跑一次，之后任何
 *      `btn.textContent=` 都会把 SVG 一起擦掉，按钮永久变空白。只许走 RyIcons.setLabel。
 *   ⑤ 外观与分区与管路同源：两边的条带高度 / 按钮尺寸 / 三组配色必须在**两份 CSS**里
 *      都有字面值（改一边不改另一边 ⇒ 红）。这是「统一」唯一可执行的判据 ——
 *      两处选择器隔着三层 id 没法共用，只能靠这个锁对齐。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const html = read('index.html');
const cssMap = read('mod/online-map.css');
const cssTool = read('mod/style-01.css');
const icons = read('mod/ry-icons.js');
const onlineJs = read('mod/online-map.js');

const IDS = ['btnDrawTrunk', 'btnFinishTrunk', 'btnUndoTrunk', 'btnEditTrunk',
  'btnDraw', 'btnFinish', 'btnAddPt', 'btnUndo',
  'btnPlaceReservoir', 'btnMeasure', 'btnClear'];

const stripCss = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const stripHtml = (s) => s.replace(/<!--[\s\S]*?-->/g, '');

/* ---------- 纯函数（便于反向自检：拿合成文本喂它，证明它会红） ---------- */
function tagOf(text, id) {
  const m = text.match(new RegExp('<[a-z]+[^>]*id="' + id + '"[^>]*>'));
  return m ? m[0] : null;
}
function missingTitles(text, ids) {
  return ids.filter((id) => {
    const t = tagOf(text, id);
    if (!t) return true;
    const m = t.match(/title="([^"]*)"/);
    return !m || m[1].trim().length < 6;
  });
}
function textContentWrites(js, ids) {
  return ids.filter((id) => new RegExp('\\b' + id + '\\.textContent\\s*=').test(js));
}
function byIdMap(src) {
  const m = src.match(/var BY_ID = \{([\s\S]*?)\n  \};/);
  if (!m) return null;
  const out = {};
  for (const x of m[1].matchAll(/(\w+)\s*:\s*'([^']+)'/g)) out[x[1]] = x[2];
  return out;
}
function iconKeys(src) {
  const m = src.match(/var P = \{([\s\S]*?)\n  \};/);
  if (!m) return [];
  return [...m[1].matchAll(/^\s{4}(\w+):\s*'/gm)].map((x) => x[1]);
}

/* ---------- ① 位置：吸附，不再浮动 ---------- */
test('① 条带吸附画布顶部：不带浮动/可拖标记', () => {
  const live = stripHtml(html);
  const tag = tagOf(live, 'mapDrawTools');
  assert.ok(tag, '#mapDrawTools 必须存在');
  assert.equal(/ryp-float/.test(tag), false, 'ryp-float 是「浮在卫星图上」的标记，已按用户要求去掉');
  assert.equal(/data-ry-panel/.test(tag), false, 'data-ry-panel 会让 ry-panel.js 接管拖动与位置记忆');
  assert.equal(/ry-hbar/.test(tag), false, 'ry-hbar 是旧的文字横条皮肤（26px/11px/绿蓝胶囊），与图标条冲突');
  const css = stripCss(cssMap);
  const i = css.indexOf('.map-draw-tools{');
  assert.ok(i >= 0, '#onlineMapSection .map-draw-tools{ 规则必须存在');
  const rule = css.slice(i, css.indexOf('}', i));
  for (const decl of ['position:absolute', 'left:0', 'top:0', 'right:0']) {
    assert.ok(rule.includes(decl), '条带必须贴画布上沿（缺 ' + decl + '）');
  }
});

/* ---------- ② 让位：条带高度 = #map top ---------- */
test('② 条带 40px 高 ⇒ #map top 同步 40px（地图不被压）', () => {
  const css = stripCss(cssMap);
  const i = css.indexOf('.map-draw-tools{');
  const rule = css.slice(i, css.indexOf('}', i));
  const m = rule.match(/height:(\d+)px/);
  assert.ok(m, '条带必须写死高度（靠 min-height 会被 padding+border 撑成 41px，实测过）');
  const h = Number(m[1]);
  assert.equal(h, 40, '分区与管路那条是 40px，两边必须同高');
  const mapRule = css.match(/#onlineMapSection #map\{(?:[^}]*\})/g) || [];
  const topDecl = mapRule.map((r) => (r.match(/top:(\d+)px/) || [])[1]).filter(Boolean);
  assert.ok(topDecl.includes(String(h)),
    '#map 必须从 ' + h + 'px 起（当前规则里的 top：' + topDecl.join('/') + '）');
});

/* ---------- ③ 悬停提示 ---------- */
test('③ 11 个按钮每个都有 title（悬停说明功能）', () => {
  const live = stripHtml(html);
  const miss = missingTitles(live, IDS);
  assert.deepEqual(miss, [], '这些按钮没有 title 或太短：' + miss.join(', '));
  /* 反向自检：拿掉一个 title 必须被抓到（否则这条是空断言） */
  const broken = live.replace(/(id="btnMeasure"[^>]*?)\stitle="[^"]*"/, '$1');
  assert.deepEqual(missingTitles(broken, IDS), ['btnMeasure'], '审计函数必须能抓出缺 title 的按钮');
});

/* ---------- ④ 图标映射 ---------- */
test('④ 11 个按钮都在 ry-icons 的 BY_ID 里，且图标名真实存在', () => {
  const map = byIdMap(icons);
  assert.ok(map, 'ry-icons.js 里必须能找到 BY_ID 精确表');
  const keys = iconKeys(icons);
  assert.ok(keys.length > 30, 'P 图标库解析异常（只解析到 ' + keys.length + ' 个）');
  const bad = IDS.filter((id) => !map[id] || !keys.includes(map[id]));
  assert.deepEqual(bad, [], '缺映射或图标名拼错（会渲染成空白方块）：' + bad.join(', '));
  /* 同一条里不许两个按钮共用一个图标 —— 并排同形等于没有图标 */
  const used = IDS.map((id) => map[id]);
  assert.equal(new Set(used).size, used.length,
    '工具条内图标重复：' + used.join(','));
});

/* ---------- ⑤ 文案不许写 textContent ---------- */
test('⑤ online-map.js 不许对工具条按钮写 textContent（会擦掉 SVG）', () => {
  const bad = textContentWrites(onlineJs, IDS);
  assert.deepEqual(bad, [], '这些按钮还在用 textContent 改文案（改用 setBtnLabel）：' + bad.join(', '));
  assert.ok(onlineJs.includes('function setBtnLabel'), 'setBtnLabel 必须存在');
  /* 反向自检 */
  assert.deepEqual(textContentWrites('btnClear.textContent = "x";', IDS), ['btnClear']);
  assert.deepEqual(textContentWrites('setBtnLabel(btnClear, "x");', IDS), []);
});

/* ---------- ⑦ 图标未就绪时不许出现空方块 ---------- */
/* ---------- ⑥ 图标未就绪时不许出现空方块（v972 起地图工具栏为纯文字，锁「不再图标化」） ---------- */
test('⑥ 图标未挂上前先显示文案（慢网不许闪一排空方块）', () => {
  const css = stripCss(cssMap);
  /* 基础按钮规则里不许有 font-size:0 —— 那会让「图标脚本还没跑」的那段时间里
     按钮既没文字也没图标，线上实测就是 11 个空方块。字号 0 只许挂在
     [data-ry-ico-svg]（= decorate 已挂 SVG）的规则上。 */
  const i = css.indexOf('.map-draw-tools .mdt-btn{');
  assert.ok(i >= 0, '.mdt-btn 基础规则必须存在');
  const base = css.slice(i, css.indexOf('}', i));
  assert.equal(/font-size:\s*0/.test(base), false,
    '基础规则不能写 font-size:0（会在图标脚本执行前露出一排空方块）');
  const j = css.indexOf('.mdt-btn[data-ry-ico-svg]{');
  assert.ok(j >= 0, '必须有 [data-ry-ico-svg] 的图标态规则');
  assert.equal(/font-size:\s*0/.test(css.slice(j, css.indexOf('}', j))), true,
    '图标态必须把字号压成 0（否则图标旁边还挂着文字）');
  /* [v972] 用户拍板：地图顶部工具栏恢复**纯文字**，不再图标化 ——
     #mapDrawTools 已摘掉 data-ry-iconize（ry-icons.js 不再装饰此容器）。
     若这里红了，说明有人把图标化加回来了。 */
  assert.equal(/id="mapDrawTools"[^>]*data-ry-iconize/.test(stripHtml(html)), false,
    '#mapDrawTools 是纯文字工具栏，不许带 data-ry-iconize（v972 用户拍板）');
  assert.ok(icons.includes('iconizeAll'), 'ry-icons.js 仍保留容器级自动装饰能力（别的工具栏在用）');
  assert.ok(/iconizeAll\(\);/.test(icons), 'ry-icons.js 载入时自动装饰的调用要保留');
});

/* ---------- ⑦ 与分区与管路同源 ---------- */
test('⑦ 外观数值在两份 CSS 里逐项同名同值（改一边不改另一边 = 红）', () => {
  /* 这些字面值必须在 #ryDrawingHost 那条工具栏（style-01.css）与
     地图条（online-map.css）里**同时**出现，否则就是「样式没统一」。 */
  const tokens = ['#e4ebee', '#eef2f6', '#e6f2ec', '#1c6b4f', '32px', '18px', '40px'];
  const a = stripCss(cssTool);
  const b = stripCss(cssMap);
  for (const t of tokens) {
    assert.ok(a.includes(t), '分区与管路工具栏丢了 ' + t + '（本锁的地基）');
    assert.ok(b.includes(t), '地图条缺 ' + t + ' —— 与分区与管路不一致');
  }
  /* 图标单元本身来自同一个 .ry-ico 通道，别再单独写一套 */
  assert.ok(b.includes('.ry-ico'), '地图条必须复用 .ry-ico 图标通道');
});
