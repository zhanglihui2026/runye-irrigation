'use strict';
/* tests/trunk_joint_review.test.cjs —— 联合复核（总管 + 下游分区管网）的对照与合计算口径
 *
 * 口径已定（v843，用户 2026-11-01）：「扬程按 在线地图总管长度 + 分区主管及支管长度 算」。
 * ⇒ 合计 = 总管 + 主管 + 支管 三段损失相加，而那个和就是三级页 computeThreeLevel 的
 *   totalPipeLoss，**本模块不另算一份**。这个文件钉住的是"没算错、没多算、没少算"：
 *
 *   ① 缺数据一律 info（"暂不可做"），不许拿 0 或默认档顶上去；
 *   ② 下游流量取**最大段流量**，绝不 Σq —— 并联支管相加是重复计数，
 *      那个数看着像总流量，其实没有物理意义，而它一旦出现在界面上就会被当成结论；
 *   ③ front 段不属于"下游"，**数量、长度都不许算**（它是掌管自己那根管的代理线）；
 *   ④ 地块绑定失配时要说"属于另一块地"，不能含糊成"下游没做"；
 *   ⑤ 不改入参（面板每次 refresh 都会重算，就地改会把库里的数据带脏）；
 *   ⑥ 段长度**必须能从 latLng 现算** —— 生产数据里根本没有 len 字段，
 *      只认 len 会让面板上的"管长"永远是「—」（v842 的真缺陷）。
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

test('⑨ 管长合计只加主/支管，**不含 front**（v842 把 front 也加进去了，同一条管数两遍）', () => {
  const jr = P.jointReview(ENTRY, LAYOUT);
  assert.equal(jr.down.lenMainM, 120 + 90);
  assert.equal(jr.down.lenBranchM, 40 + 40);
  assert.equal(jr.down.lenM, 120 + 90 + 40 + 40, '200 m 的 front 不许进来');
});

test('⑨b 段上没有 len 时从 latLng 现算（生产数据就是这种情况）', () => {
  const noLen = { plotId: 'p1', segments: [{ id: 'main_1', name: 'main1', kind: 'main', dn: 90, latLng: [[18.25, 109.52], [18.2501, 109.5201]] }] };
  const jr = P.jointReview(ENTRY, noLen);
  assert.equal(jr.down.lenMainM !== null, true, '没有 len 必须能靠 latLng 算出来，不能给 —');
  /* 0.0001° 纬度 ≈ 11.13 m、0.0001° 经度（18.25°N）≈ 10.57 m ⇒ 约 15.4 m */
  assert.ok(Math.abs(jr.down.lenMainM - 15.35) < 0.3, '实际 ' + jr.down.lenMainM);
});

test('⑨c len 和 latLng 都没有 ⇒ null（不补 0，也不猜）', () => {
  const bare = { plotId: 'p1', segments: [{ id: 'main_1', name: 'main1', kind: 'main', dn: 90 }] };
  const jr = P.jointReview(ENTRY, bare);
  assert.equal(jr.down.lenM, null);
});

test('⑨d latLng 里有坏点 ⇒ 整段不给长度（不跳过坏点抄近道）', () => {
  const bad = { plotId: 'p1', segments: [{ id: 'main_1', kind: 'main', dn: 90, latLng: [[18.25, 109.52], ['x', 1], [18.2502, 109.5202]] }] };
  const jr = P.jointReview(ENTRY, bad);
  assert.equal(jr.down.lenM, null);
});

test('⑩ 没有三级计算式时明说"暂不给出"，不编一个数', () => {
  const jr = P.jointReview(ENTRY, LAYOUT);
  assert.equal(jr.design, null);
  assert.match(jr.note, /暂不给出/);
});

/* ---------- 合计（v843）：三段损失相加 ---------- */

const DESIGN = {
  frontLenUsed: 342.6, mainLenUsed: 120, branchLenUsed: 40,
  frontPipeLoss: 0.85, mainLoss: 0.32, branchLoss: 0.11,
  totalPipeLoss: 1.28, frontLenSrc: 'mapTrunk', frontLenMap: 342.6, pumpHead: 23.4
};

test('⑬ 三段长度与损失原样带出，管路总长 = 三段相加', () => {
  const jr = P.jointReview(ENTRY, LAYOUT, null, DESIGN);
  assert.ok(jr.design);
  assert.equal(jr.design.front, 342.6);
  assert.equal(jr.design.main, 120);
  assert.equal(jr.design.branch, 40);
  assert.ok(Math.abs(jr.design.lenSum - 502.6) < 1e-9);
});

test('⑭ 合计直接用 totalPipeLoss（与三级页同一个数，不重新加一遍）', () => {
  const jr = P.jointReview(ENTRY, LAYOUT, null, DESIGN);
  assert.equal(jr.design.totalLoss, 1.28);
  /* 故意给一个"三项相加 ≠ totalPipeLoss"的脏输入：必须信 totalPipeLoss */
  const dirty = Object.assign({}, DESIGN, { totalPipeLoss: 9.99 });
  assert.equal(P.jointReview(ENTRY, LAYOUT, null, dirty).design.totalLoss, 9.99);
});

test('⑭b 没有 totalPipeLoss 时退回三项相加', () => {
  const d = Object.assign({}, DESIGN); delete d.totalPipeLoss;
  const jr = P.jointReview(ENTRY, LAYOUT, null, d);
  assert.ok(Math.abs(jr.design.totalLoss - (0.85 + 0.32 + 0.11)) < 1e-9);
});

test('⑭c 三段长度缺一个 ⇒ design=null（不拿两段当合计）', () => {
  const d = Object.assign({}, DESIGN); delete d.branchLenUsed;
  assert.equal(P.jointReview(ENTRY, LAYOUT, null, d).design, null);
});

/* [v959] 原 ⑭d 断言「note 必须写清 不含静扬程 / 1.10 安全系数 / 扬程计算式」——
   用户 2026-11-04 明确要求删掉那段说明（226px 面板里四行字太占地方），断言随之反转。 */
test('⑭d 口径说明段已取消：有 design 时 note 必须为空', () => {
  const jr = P.jointReview(ENTRY, LAYOUT, null, DESIGN);
  assert.ok(!jr.note, '有三级计算式时不再往面板底部塞说明文字，实际=' + JSON.stringify(jr.note));
});

test('⑭d2 说明段不许从别处溜回面板（反向锁）', () => {
  /* ★ 反向断言的铁律：先剥注释再查。
     trunk-panel.js 里留着「[v959] 删掉了哪句话」的注释（故意保留来防止有人好心加回去），
     注释里当然带着原文 —— 不剥就会把自己的注释当成违规（v957 已踩一次）。 */
  const raw = fs.readFileSync(path.join(__dirname, '..', 'mod', 'trunk-panel.js'), 'utf8');
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/不含静扬程/.test(src), '面板代码里不许再出现「不含静扬程…」那段说明');
  assert.ok(!/1\.10 安全系数/.test(src), '面板代码里不许再出现「1.10 安全系数」解释');
  assert.ok(!/扬程计算式/.test(src), '面板代码里不许再引用「三级页扬程计算式」');
  /* 但「取不到数据」的提示必须留着：那不是解释，是缺数据的诊断。 */
  assert.ok(/未取到三级计算式/.test(src), '缺三级计算式时的提示不能一起删掉');
});

test('⑭e 总管长度来源要带出来（地图实测 / 图面 / 试算输入）', () => {
  assert.equal(P.jointReview(ENTRY, LAYOUT, null, DESIGN).design.src, 'mapTrunk');
  const d2 = Object.assign({}, DESIGN, { frontLenSrc: 'figure', frontLenMap: null });
  assert.equal(P.jointReview(ENTRY, LAYOUT, null, d2).design.src, 'figure');
  const d3 = Object.assign({}, DESIGN, { frontLenSrc: '乱写的' });
  assert.equal(P.jointReview(ENTRY, LAYOUT, null, d3).design.src, '', '未知来源一律清空，不硬塞');
});

test('⑭f 地块失配时仍然不给 checks，但 design 可以带出来（那是另一回事）', () => {
  const jr = P.jointReview(ENTRY, { mismatch: true, plotId: 'p9' }, null, DESIGN);
  assert.equal(jr.checks.length, 0);
  assert.match(jr.note, /属于另一块地/);
});

test('⑮ segLenOf：len 优先于 latLng（图面改长后以库里的值为准）', () => {
  assert.equal(P.segLenOf({ len: 77, latLng: [[18.25, 109.52], [18.26, 109.53]] }), 77);
  assert.equal(P.segLenOf({ len: 0 }), 0, '0 是合法长度，不能被当成"没有"');
  assert.equal(P.segLenOf(null), null);
  assert.equal(P.segLenOf({ latLng: [[18.25, 109.52]] }), null, '单点不是一段');
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
