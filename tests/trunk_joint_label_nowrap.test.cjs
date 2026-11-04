'use strict';
/* tests/trunk_joint_label_nowrap.test.cjs —— 总管面板「联合复核 · 损失拆分」的行排版（v954）
 *
 * 用户 2026-11-04 截图指出两处折行：
 *   ① 「管路总长」「三级页扬程」的**标签**被压成两行（管路总/长、三级页/扬程）；
 *   ② 「总管」那行的值断成「… · 5.35 / m」，单位被甩到下一行。
 *
 * 病因：
 *   ① `.tp-jt-row>span{flex:0 0 30px}` —— 30px 只够 3 个汉字（标签字号 10px），
 *      而「管路总长」「三级页扬程」是 4~5 个汉字，且标签没写 nowrap；
 *      另外 .tp-jt-loss/.tp-jt-sum 又单独覆盖成 48px，两套宽度让值列左沿参差。
 *   ② 值是一整串纯文本，`word-break:break-word` 允许在任意位置断，于是「5.35」和「m」被拆开；
 *      再加上「在线地图实测」5 个字，226px 面板里那一行本来就装不下。
 *
 * 钉四件事：标签列够宽且不折行 / 值片段 nowrap / 断行只许发生在「 · 」处 / 来源标签是短词。
 * 这些全是"看起来对了但下次改字号就悄悄坏"的东西，所以都做成数值断言而不是快照比对。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const rawCss = fs.readFileSync(path.join(ROOT, 'mod', 'online-map.css'), 'utf8');
const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, '');
const rawJs = fs.readFileSync(path.join(ROOT, 'mod', 'trunk-panel.js'), 'utf8');
/* 只看 paintJoint 那段（别把面板别处的 <span> 标签也算进来） */
const jsPaint = (() => {
  const i = rawJs.indexOf('function paintJoint(');
  assert.ok(i >= 0, 'trunk-panel.js 里必须还有 paintJoint');
  const j = rawJs.indexOf('function refresh(', i);
  return rawJs.slice(i, j > i ? j : i + 20000);
})();

function ruleOf(sel) {
  const i = css.indexOf(sel);
  assert.ok(i >= 0, '缺少规则 ' + sel);
  return css.slice(i, css.indexOf('}', i));
}

/* ① 标签列：宽度按最长标签算，且 nowrap */
test('① 标签列宽够最长标签（5 汉字 × 10px）且 nowrap', () => {
  const rule = ruleOf('#onlineMapSection .ry-trunk-panel .tp-jt-row>span{');
  const flex = /flex:\s*0 0 (\d+(?:\.\d+)?)px/.exec(rule);
  assert.ok(flex, '标签列必须写 flex:0 0 <n>px（auto 会让各行值列左沿参差）');
  assert.ok(/white-space:\s*nowrap/.test(rule), '标签一律不许折行（定长词折行永远不是想要的效果）');
  const fs10 = /font-size:\s*([\d.]+)px/.exec(rule);
  assert.ok(fs10, '标签字号必须显式写在同一条规则里（下面的宽度计算依赖它）');

  const labels = [...jsPaint.matchAll(/<div class="tp-jt-row[^"]*"><span>([^<]+)<\/span>/g)].map(m => m[1]);
  assert.ok(labels.length >= 6, '应当解析到至少 6 个行标签，实际 ' + labels.length + ' 个：' + labels.join('/'));
  const longest = labels.reduce((a, b) => (b.length > a.length ? b : a), '');
  const need = longest.length * Number(fs10[1]);
  assert.ok(Number(flex[1]) >= need,
    '标签列 ' + flex[1] + 'px 装不下最长的「' + longest + '」（' + longest.length + ' 字 × ' +
    fs10[1] + 'px = ' + need + 'px）—— 会又折成两行。标签全表：' + labels.join('/'));
});

/* ② 旧的 30px / 48px 两套列宽必须清掉（否则值列左沿参差，且 30px 一定折行） */
test('② 不许再出现 30px / 48px 的标签列宽覆盖', () => {
  const all = [...css.matchAll(/\.tp-jt-(?:row|loss|sum)>span\b[^{]*\{([^}]*)\}/g)].map(m => m[1]).join('\n');
  assert.equal(/flex:\s*0 0 30px/.test(all), false, 'tp-jt-row>span 仍是 30px ⇒ 管路总长/三级页扬程必折行');
  assert.equal(/flex:\s*0 0 48px/.test(all), false, 'tp-jt-loss/sum 又单独覆盖了 48px ⇒ 值列左沿会与别的行差 18px');
});

/* ③ 值片段 nowrap：.tp-jt-nw 存在，且渲染时真的用上了 */
test('③ 值一律包 .tp-jt-nw（nowrap），且分隔点粘在后一段里', () => {
  assert.ok(/\.tp-jt-nw\{[^}]*white-space:\s*nowrap/.test(css), '缺 .tp-jt-nw{white-space:nowrap}');
  assert.ok(/var nw = function/.test(jsPaint), 'paintJoint 里要有 nw() 包裹器');
  /* 单值行走 nw(...)，多段行走 sepJoin(...) */
  const single = [...jsPaint.matchAll(/nw\(fmt(?:Len|M)\(/g)].length;
  const multi = [...jsPaint.matchAll(/sepJoin\(\[/g)].length;
  assert.ok(single >= 3, '合计损失/管路总长/三级页扬程 三行应各走一次 nw()，实际 ' + single + ' 处');
  assert.ok(multi >= 4, '总管(信息)/下游/总管(损失)/主管/支管 应走 sepJoin()，实际 ' + multi + ' 处');
  /* ★ 分隔点必须写进**后一段**的 span 里：写成 join(' · ') 会让行尾吊一个孤零零的「·」（v954 第一版） */
  assert.ok(/nw\(\(out\.length \? '· ' : ''\) \+ t/.test(jsPaint),
    'sepJoin 必须把「· 」拼进后一段再 nowrap，否则行尾会吊一个分隔点');
  assert.equal(/join\(' · '\)/.test(jsPaint), false, '又用回 join(\' · \') 了 —— 分隔点在段外，行尾必吊点');
  /* 反向自检：裸拼（'<b>' + fmtM(...)）会让 word-break 又把单位拆走 */
  assert.equal(/<b>'?\s*\+\s*fmt(?:Len|M)\(/.test(jsPaint), false, '还有直接拼 fmtLen/fmtM 的地方，没走 nw()/sepJoin()');
});

/* ④ 来源标签必须短：它和长度、损失挤在同一行 */
test('④ 长度来源标签是两个字的短词，全文只放 title', () => {
  assert.ok(/G\.src === 'mapTrunk' \? '实测'/.test(jsPaint), 'mapTrunk 的可见标签应是「实测」');
  assert.ok(/'figure' \? '图面'/.test(jsPaint) && /'input' \? '试算'/.test(jsPaint), '图面/试算 两个字短词');
  /* 全长文案只能进 title，不许当可见文案 */
  assert.ok(/title: srcFull/.test(jsPaint), '来源全文应作为 {t,title} 的 title 传进去');
  assert.equal(/<b>' \+ esc\(srcTag\)/.test(jsPaint), false, '可见来源标签不许再直拼长文案');
});

/* ⑤ 那两行标签本身还在（别为了不折行把标签改短/删掉） */
test('⑤ 「管路总长」「三级页扬程」两个标签仍在，且各自是一个值', () => {
  assert.ok(/<span>管路总长<\/span><b>/.test(jsPaint), '管路总长 行不见了');
  assert.ok(/<span>三级页扬程<\/span><b>/.test(jsPaint), '三级页扬程 行不见了（pumpHead 有值时必须显示）');
});

/* ⑥ 「下游」那行同样要按段 nowrap —— 它是最长的一行，拆开就会出现「1.91 / km」 */
test('⑥ 「下游」行四段各自 nowrap（不许把 1.91 km 拆成 1.91 / km）', () => {
  const i = jsPaint.indexOf('<span>下游</span>');
  assert.ok(i >= 0, '下游 行不见了');
  const block = jsPaint.slice(i, i + 600);
  assert.ok(/sepJoin\(\[/.test(block), '下游 的四段必须走 sepJoin（逐段 nowrap），否则单位会被拆到下一行');
  assert.ok(/管长合计 ' \+ fmtLen\(D\.lenM\)/.test(block), '管长合计 段要保留（材料量口径，别删）');
});
