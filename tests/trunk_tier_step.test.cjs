'use strict';
/* tests/trunk_tier_step.test.cjs —— 档位台阶（v964，用户 2026-11-04）
 *
 * 「第 8 区扬程突然升高了…其他区域都没有超过 39 米，第 8 区快接近 45 米，不正常我认为」
 *
 * 现场（截图 + 复现）：8 个区分 8 组，1~7 区面积 34.1~35.1 亩、Q=94~97 m³/h ⇒ Ø180、
 * 扬程 38.4~39.2 m；第 8 区面积**最小**（31.6 亩）、Q=87.48 m³/h ⇒ 却选了 Ø160、44.6 m。
 * 逐项拆开：Ø160/Ø180 的就近选档分界是 88.25 m³/h，第 8 区只差 0.77 m³/h 没跨过去；
 * 管径小一档 ⇒ 510.4 m 总管 + 527 m 主管损失从 9.6 m 涨到 17.0 m ⇒ 乘 1.10 后多 6 m。
 *
 * 这个文件钉住的是「台阶算得对、不误报、且不偷改既有数字」：
 *   ① 数值锁：Q=87.48 / L=527 / Ø160 ⇒ 上一档 Ø180、流速 1.66/1.31、分界 88.25、省 3.78 m；
 *   ② 不误报：正常区（Ø180，v≈1.44）判 over=false，卡片不会处处冒提示；
 *   ③ 分界自洽：Q 正好等于分界时两档离目标流速等距（这是「就近」的定义，不是拍脑袋的门槛）；
 *   ④ 缺参不瞎算：没有该段长度 / 已是最大档 / 缺注入 ⇒ null；
 *   ⑤ 接线：inline-09 真的调它、且算的是**最不利区**，并把结果作为 tierNote 交给卡片；
 *   ⑥ 渲染：卡片只读 loss.tierNote 排版，不重算；
 *   ⑦ 反向锁：tierNote 只是说明，**不许**顶掉 head / totalLoss（估算数字口径不变）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'mod', 'trunk-size.js'), 'utf8');
const T = new Function('window', SRC + '\nreturn window.RyTrunkSize;')({});

const Core = require(path.join(ROOT, 'hydraulic-calc', 'design-core.js'));
const SDR = 13.6;
const OD = [50, 63, 75, 90, 110, 125, 140, 160, 180, 200, 225, 250, 280, 315, 355, 400, 450, 500];

/* 与产品同一条接线：内径走 Core.inner(od, SDR)、损失走 Core.hazen(..., C=150)、
   上一档走 PE 序列本身（inline-09 的 nextOd 就是这么实现的）。 */
const dep = {
  inner: (od) => Core.inner(od, SDR),
  hazen: (L, Q, id) => Core.hazen(L, Q, id, 150),
  nextOd: (od) => { const i = OD.indexOf(od); return (i >= 0 && i + 1 < OD.length) ? OD[i + 1] : null; }
};
const step = (o) => T.tierStep(Object.assign({ targetV: 1.5 }, dep, o));

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}：得 ${a}，期望 ${b}±${tol}`);

test('① 第 8 区：Ø160 被钉住，上一档 Ø180，差 0.77 m³/h、省 3.78 m（数值锁）', () => {
  const s = step({ flow: 87.48, length: 527.0, od: 160 });
  assert.ok(s, '应给出结果');
  assert.equal(s.fromOd, 160);
  assert.equal(s.toOd, 180);
  near(s.vNow, 1.6613, 0.001, 'Ø160 时流速');
  near(s.vAlt, 1.3126, 0.001, 'Ø180 时流速');
  near(s.gapFlow, 88.2488, 0.01, '两档就近分界流量');
  near(s.gap, 0.7688, 0.01, '距分界还差多少流量');
  near(s.lossNow, 8.6489, 0.01, 'Ø160 主管损失');
  near(s.lossAlt, 4.8736, 0.01, 'Ø180 主管损失');
  near(s.saved, 3.7753, 0.01, '升一档能省多少');
  assert.equal(s.over, true, '流速 1.66 > 目标 1.5×1.05 ⇒ 应判「被钉在细档」');
  /* 总管段同一条公式、只换长度（卡片上的 8.38 / 4.72 就是这么来的） */
  const f = step({ flow: 87.48, length: 510.4, od: 160 });
  near(f.lossNow, 8.3764, 0.01, 'Ø160 总管损失');
  near(f.saved, 3.6564, 0.01, '总管升一档省多少');
});

test('② 不误报：1~7 区按 Ø180（v≈1.44）⇒ over=false，卡片不冒提示', () => {
  [94.40, 95.79, 96.06, 96.34, 96.89, 97.17].forEach((q) => {
    const s = step({ flow: q, length: 527.0, od: 180 });
    assert.ok(s, q + ' 应给出结果');
    assert.equal(s.over, false, `Q=${q} 按 Ø180 时流速 ${s.vNow.toFixed(3)} 未超目标 5% ⇒ 不该提示`);
    assert.ok(s.vNow < 1.5, `Q=${q} 按 Ø180 流速应低于目标`);
  });
  /* 同一流量换成 Ø160 就超了 —— 说明判据看的是「选中档」，不是「流量大小」 */
  assert.equal(step({ flow: 96.89, length: 527.0, od: 160 }).over, true,
    'Q=96.89 若被选成 Ø160（v=1.84）必须判超速');
});

test('③ 分界自洽：Q=分界流量时两档离目标流速等距；略高于分界 ⇒ gap<0', () => {
  const s = step({ flow: 87.48, length: 527.0, od: 160 });
  const at = step({ flow: s.gapFlow, length: 527.0, od: 160 });
  near(Math.abs(at.vNow - at.targetV), Math.abs(at.vAlt - at.targetV), 1e-9,
    '分界处两档离目标流速必须等距（这就是「就近」的定义）');
  near(at.gap, 0, 1e-9, '分界点 gap 应为 0');
  assert.ok(step({ flow: s.gapFlow + 1, length: 527.0, od: 160 }).gap < 0,
    '流量越过分界后 gap 转负（选项已经该翻到上一档）');
});

test('④ 缺参不瞎算：没该段长度 / 已是最大档 / 缺注入 ⇒ null', () => {
  assert.equal(step({ flow: 87.48, length: 0, od: 160 }), null, '总管没画（长度 0）就没有这段可比较');
  assert.equal(step({ flow: 87.48, length: 527, od: 500 }), null, '已是最大档，没有上一档');
  assert.equal(step({ flow: 0, length: 527, od: 160 }), null, '流量非正');
  assert.equal(step({ flow: 87.48, length: 527, od: 160, inner: null }), null, '缺内径注入');
  assert.equal(step({ flow: 87.48, length: 527, od: 160, hazen: null }), null, '缺损失函数注入');
  assert.equal(step({ flow: 87.48, length: 527, od: 160, nextOd: () => null }), null, '注入的上一档为空');
});

/* ── 接线（剥注释后断言：v957/v959 两次被自己的注释咬到）────────────────────── */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('⑤ inline-09 真的接线：调 RyTrunkSize.tierStep，算最不利区，结果作为 tierNote 交出去', () => {
  const src = strip(fs.readFileSync(path.join(ROOT, 'mod', 'inline-09.js'), 'utf8'));
  assert.ok(/RyTrunkSize[\s\S]{0,40}\.tierStep/.test(src), 'inline-09 必须调用 RyTrunkSize.tierStep（不许只写注释不接线）');
  assert.ok(/tierStep\(\{[\s\S]{0,400}?nextOd:/.test(src), 'tierStep 必须注入 nextOd（档位表只许一份）');
  assert.ok(/PE_OD_SERIES\.indexOf\(od\)/.test(src), '上一档必须从本文件的 PE_OD_SERIES 取，不许另排一份序列');
  /* 算的是最不利区：tierNote 的 zi 必须来自 worst，不能拿 members[0] 顶 */
  assert.ok(/var wPick = picks\[worst\.zi\]/.test(src), '台阶必须按最不利区（worst.zi）算');
  assert.ok(/tierNote: tierNote/.test(src), '估算结果必须带 tierNote 字段给卡片');
  assert.ok(/stepSaved >= 1/.test(src), '省不到 1 m 就不提示（阈值要在，防止卡片被堆满）');
});

test('⑥ 卡片只排版不重算：读 loss.tierNote，且仍在 est（估算）分支里', () => {
  const src = strip(fs.readFileSync(path.join(ROOT, 'mod', 'map-flow-demo.js'), 'utf8'));
  assert.ok(/loss\.tierNote/.test(src), '卡片必须渲染 loss.tierNote');
  assert.ok(/mfg-tier-note/.test(src), '台阶行要有独立 class，便于探针/样式定位');
  assert.ok(/档位台阶/.test(src) && /档分界/.test(src), '文案要自己说清是「档位分界」');
  /* 不重算：卡片里不许出现 tierStep / selectPipe 的二次调用 */
  assert.ok(!/tierStep/.test(src), '卡片不许自己再算一遍台阶（重算=两处口径）');
  assert.ok(!/selectPipe/.test(src), '卡片不许自己选管');
});

test('⑦ 反向锁：台阶只做说明，不许顶掉估算的 head / totalLoss', () => {
  const src = strip(fs.readFileSync(path.join(ROOT, 'mod', 'inline-09.js'), 'utf8'));
  assert.ok(/head: worst\.head/.test(src), '组扬程仍取最不利区的估算值，不能被 altHead 顶替');
  assert.ok(/totalLoss: worst\.totalLoss/.test(src), '组管损仍取 worst.totalLoss');
  /* altHead 只许出现在 tierNote 对象里（作为「按大一档」的对照值），
     且不许赋值回 rows/worst —— 那才是「偷改既有数字」。 */
  assert.ok(/tierNote = \{[\s\S]{0,600}?head: altHead/.test(src), 'altHead 必须是 tierNote 的字段');
  assert.ok(!/worst\.head\s*=/.test(src), '不许把 altHead 写回 worst.head');
  assert.ok(!/\.head\s*=\s*altHead/.test(src), '不许把 altHead 写回任何区的 head');
});
