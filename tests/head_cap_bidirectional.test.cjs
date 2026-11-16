#!/usr/bin/env node
'use strict';
/* tests/head_cap_bidirectional.test.cjs —— [v1100] 扬程反推双向化（加大 + 缩小省钱）
 *
 * 用户原话（2026-11-16）：「我设定40米，那就加大管道，如果上限是45米，那就可以自动缩小管道，
 * 按照这个逻辑执行呢」+ 拍板「流速 2.0 m/s 封顶」「尽量贴上限」。
 *
 * 做法：把 mod/inline-09.js 里的 tlHeadCapAdvice 原文抽出来，在最小桩上真跑一遍
 * （不是只读源码字符串），用 hydraulic-calc/hc-core.js 的真实 hazen/velocity/head 做水力模型：
 *  · 上限 45（远高于当前 33.72）⇒ 必须产生**缩小**变更、扬程上升、费用为负、ok=true；
 *  · 缩小后任一管段流速不得 > 2.0 m/s（原本就超的除外）；
 *  · 上限低于物理地板 ⇒ 仍只加大不缩小、ok=false（老行为不回归）；
 *  · 主管不得低于 MAIN_PIPE_MIN_OD，总管≥主管≥支管层级保持。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('../hydraulic-calc/hc-core.js');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'mod', 'inline-09.js'), 'utf8');
const DEMO = fs.readFileSync(path.join(ROOT, 'mod', 'map-flow-demo.js'), 'utf8');
const PE = [50, 63, 75, 90, 110, 125, 140, 160, 180, 200, 225, 250, 280, 315, 355, 400, 450, 500];
const MAIN_MIN = 90;
const VMAX = 2.0;
const Q = 113.89, Lf = 242.7, Lm = 179.4, Lb = 66.7;    // 与用户 G2 卡同量级
const BASE_OD = { front: 250, 'main-0': 225, 'branch-0': 140 };
const FIXED = 26.0565;                                    // 由 33.72 m 反标定（见模型下方）

/* 用真实 hc-core 公式构造单调水力模型：管径越大 → 损失越小、流速越低。 */
function evalModel(cal) {
  const c = Object.assign({}, BASE_OD, cal || {});
  const dF = H.innerDiam(c.front, 13.6), dM = H.innerDiam(c['main-0'], 13.6), dB = H.innerDiam(c['branch-0'], 13.6);
  const loss = H.hazen(Lf, Q, dF) + H.hazen(Lm, Q, dM) + H.hazen(Lb, Q / 2, dB);
  return {
    head: H.head(FIXED, loss + 2, 0, 1.1),
    zones: [{ zi: 0, flow: Q, head: H.head(FIXED, loss + 2, 0, 1.1) }],
    pipes: { frontV: H.velocity(Q, dF), mainV: H.velocity(Q, dM), branchV: H.velocity(Q / 2, dB) }
  };
}
function near(a, b, tol, msg) { assert.ok(Math.abs(a - b) < tol, (msg || '') + ' 期望 ' + b + '，实得 ' + a); }

/* 抽取 window.tlHeadCapAdvice = function (...) {...};（源码锚点是赋值式，不是函数声明） */
function extractAssigned() {
  const anchor = 'window.tlHeadCapAdvice = function (';
  const start = SRC.indexOf(anchor);
  assert.ok(start >= 0, anchor + ' 缺失');
  const begin = SRC.indexOf('{', start);
  let depth = 1, i = begin + 1;
  while (depth && i < SRC.length) {
    const c = SRC[i];
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      for (i++; i < SRC.length; i++) { if (SRC[i] === '\\') i++; else if (SRC[i] === q) { i++; break; } }
    } else if (SRC.slice(i, i + 2) === '/*') i = SRC.indexOf('*/', i + 2) + 2;
    else if (SRC.slice(i, i + 2) === '//') i = SRC.indexOf('\n', i + 2) + 1;
    else { if (c === '{') depth++; if (c === '}') depth--; i++; }
  }
  assert.equal(depth, 0, '抽取失败');
  return SRC.slice(start, i + 1);
}

function makeAdvisor() {
  const AE = {
    allPids: () => ['front', 'main-0', 'branch-0'],
    effPts: () => [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    pipePts: () => null,
    polylineLen: () => 100,
    geometryKey: () => 'G1'
  };
  const win = {
    RyTlAutoEdits: AE,
    tlDiagramData: {},
    tlMapGroupHydraulicsOf: (_groups, opts) => evalModel(opts && opts.calibers)
  };
  const r = {
    wp: { fromFigure: true, zones: [{ zi: 0, mainSegs: [{ key: 'main:0' }] }] },
    zoneAreas: [1000],
    frontLenSrc: 'mapTrunk', frontLenMap: Lf, frontLenUsed: Lf,
    frontPipe: BASE_OD.front ? { od: 250 } : null, mainPipe: { od: 225 }, branchPipe: { od: 140 },
    inversePath: { calibers: {} }
  };
  const factory = new Function('window', 'computeThreeLevel', 'tlSharedTrunkPick',
    'tlPipePriceByOd', 'tlMapTrunkLen', 'PE_OD_SERIES', 'MAIN_PIPE_MIN_OD',
    extractAssigned() + '\nreturn window.tlHeadCapAdvice;');
  return factory(win,
    () => r,
    () => ({ od: 250 }),
    od => od * od,
    () => ({ ok: true, od: 250, plotId: 'p1', revision: 1, dnById: 250 }),
    PE, MAIN_MIN);
}

test('① 模型自检：当前 33.72 m，缩放单调', () => {
  const base = evalModel({});
  near(base.head, 33.72, 0.01, '基准扬程');
  const big = evalModel({ front: 500, 'main-0': 500, 'branch-0': 500 });
  const small = evalModel({ front: 110, 'main-0': 110, 'branch-0': 110 });
  assert.ok(big.head < base.head && base.head < small.head, '管径变大必须让扬程下降');
});

test('② 上限 45（高于现状）⇒ 主动缩小、扬程上升、费用为负', () => {
  const advice = makeAdvisor()(45, [[0]]);
  assert.equal(advice.ok, true, JSON.stringify(advice));
  near(advice.before, 33.72, 0.01, '反推前扬程');
  assert.ok(advice.after > advice.before, '缩小后扬程应上升，实得 ' + advice.after);
  assert.ok(advice.after <= 45.001, '不得超过上限');
  assert.ok(advice.changes.length > 0, '设 45 必须产生缩小变更，不能空手灰按钮');
  assert.ok(advice.changes.every(c => c.to < c.from), '本次全是缩小项：' + JSON.stringify(advice.changes));
  assert.ok(advice.extraCost < 0, '费用应为负（省钱），实得 ' + advice.extraCost);
  near(advice.extraCost, advice.changes.reduce((s, c) => s + c.extraCost, 0), 1e-9);
});

test('③ 缩小受 2.0 m/s 流速封顶与物理下限约束', () => {
  const advice = makeAdvisor()(45, [[0]]);
  const final = {};
  Object.assign(final, BASE_OD);
  advice.changes.forEach(c => { final[c.pid] = c.to; });
  const m = evalModel(final);
  ['frontV', 'mainV', 'branchV'].forEach(k => {
    assert.ok(m.pipes[k] <= VMAX + 0.001, k + ' 不得超过 2.0 m/s，实得 ' + m.pipes[k]);
  });
  assert.ok(final['main-0'] >= MAIN_MIN, '主管不得低于 Ø90，实得 ' + final['main-0']);
  assert.ok(final.front >= final['main-0'] && final['main-0'] >= final['branch-0'],
    '总管≥主管≥支管层级必须保持：' + JSON.stringify(final));
  /* 若去掉流速闸，模型允许缩到 Ø110（支管流速 2.29 m/s）——本条确保闸门真的拦住 */
  const tooSmall = evalModel({ 'branch-0': 110 });
  assert.ok(tooSmall.pipes.branchV > VMAX, '模型里 Ø110 支管应超流速（否则本用例无意义）');
});

test('④ 上限低于物理地板 ⇒ 仍只加大、ok=false（老行为不回归）', () => {
  const advice = makeAdvisor()(30.5, [[0]]);
  assert.equal(advice.ok, false, JSON.stringify(advice));
  assert.ok(advice.changes.length > 0);
  assert.ok(advice.changes.every(c => c.to > c.from), '不可达时只能加大，不能出现缩小项');
  assert.ok(advice.extraCost > 0);
  assert.match(advice.reason, /现有标准管径仍无法达到上限/);
});

test('⑤ 源码锁：双向变更/带符号费用/流速闸/省钱文案四处都在位', () => {
  assert.ok(/Number\(current\[pid\] \|\| ods\[pid\]\) !== ods\[pid\]/.test(SRC), 'changes 必须双向');
  assert.ok(/return sum \+ \(price\(od\) - price\(old\)\) \* lengths\[pid\];/.test(SRC), 'cost 必须带符号');
  assert.ok(/function minOdOf\(pid\)/.test(SRC) && /MAIN_PIPE_MIN_OD/.test(SRC), '必须有物理下限');
  assert.ok(/function velocityOk\(st\)/.test(SRC) && /VMAX \+ 0\.001/.test(SRC), '必须有 2.0 m/s 流速闸');
  assert.ok(!/PE_OD_SERIES\[idx - 1\] < ods\[pid\]/.test(SRC), '旧的原档下限必须移除');
  assert.ok(/advice\.extraCost < 0 \? '节省' : '增加'/.test(DEMO), '文案区分节省/增加');
  /* 加大阶段的 score 不能被带符号 cost 破坏 */
  assert.ok(/Math\.max\(0\.01, cost\(trial\) - cost\(current\)\)/.test(SRC), '加大阶段的费用下限仍在');
});
