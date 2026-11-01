'use strict';
/* tests/trunk_joint_review.test.cjs —— 联合复核（总管 + 下游分区管网）的对照口径
 *
 * 这个函数**故意不算合计损失**。要钉住的正是"没算"和"算的是什么"：
 *   ① 缺数据一律 info（"暂不可做"），不许拿 0 或默认档顶上去；
 *   ② 下游流量取**最大段流量**，绝不 Σq —— 并联支管相加是重复计数，
 *      那个数看着像总流量，其实没有物理意义，而它一旦出现在界面上就会被当成结论；
 *   ③ front 段不属于"下游"，不许混进统计（它是总管自己）；
 *   ④ 地块绑定失配时要说"属于另一块地"，不能含糊成"下游没做"；
 *   ⑤ 不改入参（面板每次 refresh 都会重算，就地改会把库里的数据带脏）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const P = (function load() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'mod', 'trunk-panel.js'), 'utf8');
  return new Function('window', src + '\nreturn window.RyTrunkPanel;')({});
})();

const ENTRY = {
  id: 'T1',
  points: [[18.2500, 109.5180], [18.2509, 109.5205], [18.2518, 109.5220]],
  params: { material: 'PE', dn: 160, designFlow: 60, code: 'ZG-001' }
};
const seg = (kind, dn, q, len) => ({ id: kind + '_1', name: kind + '1', kind: kind, dn: dn, q: q, len: len, latLng: [[18.25, 109.52], [18.2501, 109.5201]] });
const LAYOUT = {
  plotId: 'p1',
  segments: [
    seg('front', 160, 60, 200),
    seg('main', 90, 45, 120),
    seg('main', 75, 30, 90),
    seg('branch', 63, 10, 40),
    seg('branch', 63, 10, 40)
  ]
};

test('① 没有下游快照：hasLayout=false，说明"要先出图"，不给任何 check', () => {
  const jr = P.jointReview(ENTRY, null);
  assert.equal(jr.hasLayout, false);
  assert.equal(jr.checks.length, 0);
  assert.match(jr.note, /未找到本块的下游设计快照/);
});

test('② 地块绑定失配：说清"属于另一块地"，不是"下游没做"', () => {
  const jr = P.jointReview(ENTRY, { mismatch: true, plotId: 'p9-other' });
  assert.equal(jr.hasLayout, false);
  assert.match(jr.note, /属于另一块地/);
  assert.match(jr.note, /p9-other/);
});

test('③ 管径自洽：总管 DN160 ≥ 最大主管 DN90 ⇒ ok', () => {
  const jr = P.jointReview(ENTRY, LAYOUT);
  assert.equal(jr.hasLayout, true);
  assert.equal(jr.down.mainMaxDn, 90);
  const c = jr.checks.find(x => /DN/.test(x.text));
  assert.equal(c.level, 'ok');
  assert.match(c.text, /DN160/);
  assert.match(c.text, /DN90/);
});

test('④ 总管比主管细 ⇒ warn（总管不可能比它供的管子细）', () => {
  const e = JSON.parse(JSON.stringify(ENTRY));
  e.params.dn = 63;
  const jr = P.jointReview(e, LAYOUT);
  const c = jr.checks.find(x => /比下游最大主管/.test(x.text));
  assert.ok(c, '应给出"总管比主管细"的告警：' + JSON.stringify(jr.checks));
  assert.equal(c.level, 'warn');
});

test('⑤ 下游流量取最大段流量，**不是 Σq**（并联相加无物理意义）', () => {
  const jr = P.jointReview(ENTRY, LAYOUT);
  assert.equal(jr.down.qMax, 45, 'qMax 应是 45（最大段），不是 45+30+10+10=95');
  const c = jr.checks.find(x => /设计流量/.test(x.text));
  assert.equal(c.level, 'ok', JSON.stringify(c));
  assert.match(c.text, /45/);
});

test('⑥ 总管设计流量小于下游最大段流量 ⇒ warn', () => {
  const e = JSON.parse(JSON.stringify(ENTRY));
  e.params.designFlow = 20;
  const jr = P.jointReview(e, LAYOUT);
  const c = jr.checks.find(x => /设计流量/.test(x.text));
  assert.equal(c.level, 'warn');
  assert.match(c.text, /20/);
  assert.match(c.text, /45/);
});

test('⑦ 缺管径 / 缺流量：info（"暂不可做"），不当成错误也不补 0', () => {
  const a = JSON.parse(JSON.stringify(ENTRY)); delete a.params.dn;
  const jrA = P.jointReview(a, LAYOUT);
  const cA = jrA.checks.find(x => /管径对照暂不可做/.test(x.text));
  assert.ok(cA && cA.level === 'info', JSON.stringify(jrA.checks));

  const b = JSON.parse(JSON.stringify(ENTRY)); delete b.params.designFlow;
  const jrB = P.jointReview(b, LAYOUT);
  const cB = jrB.checks.find(x => /流量对照暂不可做/.test(x.text));
  assert.ok(cB && cB.level === 'info', JSON.stringify(jrB.checks));
});

test('⑧ front 段不算"下游"（它是总管自己）', () => {
  const jr = P.jointReview(ENTRY, LAYOUT);
  assert.equal(jr.down.segCount, 4, '5 段里 front 那一段不算下游');
  assert.equal(jr.down.mainCount, 2);
  assert.equal(jr.down.branchCount, 2);
});

test('⑨ 总长只在每段都有 len 时求和，缺一段就整栏给 null', () => {
  const ok = P.jointReview(ENTRY, LAYOUT);
  assert.equal(ok.down.lenM, 200 + 120 + 90 + 40 + 40);
  const broken = JSON.parse(JSON.stringify(LAYOUT));
  delete broken.segments[3].len;
  const jr = P.jointReview(ENTRY, broken);
  assert.equal(jr.down.lenM, null, '缺一段长度就不能给一个"看起来完整"的总长');
});

test('⑩ 永远说明"合计损失暂不给出"（口径未定，别让人以为漏了）', () => {
  const jr = P.jointReview(ENTRY, LAYOUT);
  assert.match(jr.note, /合计损失暂不给出/);
});

test('⑪ 不改入参（面板每次 refresh 都重算）', () => {
  const e = JSON.parse(JSON.stringify(ENTRY));
  const l = JSON.parse(JSON.stringify(LAYOUT));
  const before = JSON.stringify([e, l]);
  P.jointReview(e, l);
  assert.equal(JSON.stringify([e, l]), before);
});

test('⑫ 结构完整：trunk/down/checks 字段齐全，level 只用三种值', () => {
  const jr = P.jointReview(ENTRY, LAYOUT);
  for (const k of ['code', 'material', 'dn', 'flow', 'v', 'hf', 'len']) {
    assert.ok(k in jr.trunk, 'trunk 缺字段 ' + k);
  }
  for (const k of ['segCount', 'mainCount', 'branchCount', 'mainMaxDn', 'lenM', 'qMax']) {
    assert.ok(k in jr.down, 'down 缺字段 ' + k);
  }
  for (const c of jr.checks) assert.ok(['ok', 'warn', 'info'].includes(c.level), '未知 level: ' + c.level);
});
