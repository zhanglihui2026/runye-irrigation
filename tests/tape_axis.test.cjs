'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const geometry = require('../mod/zone-geometry.js');

/* 硬约束：滴灌带 ∥ tapeAxis，主管 ∥ 支管 ⊥ tapeAxis —— 由单一事实来源保证 */
test('axis fit rewards贴合单边铺设长度 and penalizes overlong runs', () => {
  assert.equal(geometry.axisFit(100, 200), 0.5);      /* 短于 S：贴合度 0.5 */
  assert.equal(geometry.axisFit(200, 200), 1);        /* 恰好 = S：最优 */
  assert.equal(geometry.axisFit(400, 200), 0.5);      /* 超长：反向惩罚 */
  assert.equal(geometry.axisFit(0, 200), 0);
  assert.equal(geometry.axisFit(100, 0), 0);
});

/* [v886 2026-11-02 用户拍板] 硬规则：滴灌带始终沿分区（每块）的长边布置。
   用户实测地块：竖长分区 91×254.5（4 列 × 2 行）→ 全区投 y ⇒ 带竖铺。 */
test('tape follows the zone long side (portrait zones → vertical tape)', () => {
  const cuts = {
    cols: 4, rows: 2,
    xPos: [0, 91, 182, 273, 364], yPos: [0, 254.5, 509],
    xPlan: [91, 91, 91, 91], yPlan: [254.5, 254.5]
  };
  const ax = geometry.tapeAxisOf(cuts, 80);
  assert.equal(ax.ok, true);
  assert.equal(ax.tapeAxis, 'y');       /* 滴灌带沿分区长边（竖铺） */
  assert.equal(ax.pipeAxis, 'x');       /* 主管/支管横向 ⊥ 滴灌带 */
  /* 每区带长 254.5 / S=80 → 4 段 */
  assert.deepEqual(ax.segs, [4, 4, 4, 4, 4, 4, 4, 4]);
});

/* 宽扁分区孪生：254.5×91（2 列 × 4 行）⇒ 带横向 —— 分区长边规则随分区形状翻转 */
test('tape follows the zone long side (landscape zones → horizontal tape)', () => {
  const cuts = {
    cols: 2, rows: 4,
    xPos: [0, 254.5, 509], yPos: [0, 91, 182, 273, 364],
    xPlan: [254.5, 254.5], yPlan: [91, 91, 91, 91]
  };
  const ax = geometry.tapeAxisOf(cuts, 80);
  assert.equal(ax.tapeAxis, 'x');
  assert.equal(ax.pipeAxis, 'y');
});

/* [v886 用户实测案例] 分区 127.5×187.5（竖长，4 列 × 2 行，网格 510×375 未铺满
   地块 527×584）：v883 的「网格总宽/高」判据会取 x（510>375）⇒ 带横在 127.5
   短边上；v886 分区长边规则 ⇒ 全区投 y，带竖铺沿 187.5 长边。 */
test('user case 127.5×187.5 portrait zones: zone long side wins over grid extent', () => {
  const cuts = {
    cols: 4, rows: 2,
    xPos: [0, 127.5, 255, 382.5, 510], yPos: [0, 187.5, 375],
    xPlan: [127.5, 127.5, 127.5, 127.5], yPlan: [187.5, 187.5]
  };
  const ax = geometry.tapeAxisOf(cuts, 160);
  assert.equal(ax.tapeAxis, 'y');       /* 分区长边在 y ⇒ 带竖铺 */
  assert.equal(ax.pipeAxis, 'x');       /* 主管/支管横向 ⊥ 滴灌带 */
});

/* 混合朝向地块（上排 58×195 高瘦 + 下排 58×47 扁宽）：逐区投票 9:9 平票
   ⇒ 退回「贴合 S」加权破平（fitSum.y 9.08 > fitSum.x 4.35）⇒ 带竖铺。 */
test('mixed-aspect plot: tie falls back to fit weighting', () => {
  const cuts = {
    cols: 9, rows: 2,
    xPos: [0, 58, 116, 174, 232, 290, 348, 406, 464, 527],
    yPos: [0, 195, 242],
    xPlan: [58, 58, 58, 58, 58, 58, 58, 58, 58],
    yPlan: [195, 47]
  };
  const ax = geometry.tapeAxisOf(cuts, 240);
  assert.equal(ax.ok, true);
  assert.equal(ax.tapeAxis, 'y');
  assert.equal(ax.pipeAxis, 'x');
  assert.equal(ax.votes.y, 9);
  assert.equal(ax.votes.x, 9);
  assert.deepEqual(ax.segs.slice(0, 9), [1, 1, 1, 1, 1, 1, 1, 1, 1]);
});

/* 全正方形网格：无区投票（votes2 平票）→ 贴合票（fx==fy 投 x）⇒ 默认 x */
test('all-square zones fall back to the fit vote', () => {
  const cuts = {
    cols: 2, rows: 2,
    xPos: [0, 100, 200], yPos: [0, 100, 200],
    xPlan: [100, 100], yPlan: [100, 100]
  };
  const ax = geometry.tapeAxisOf(cuts, 120);
  assert.equal(ax.ok, true);
  assert.equal(ax.tapeAxis, 'x');
});

/* 兜底：带长超过单边铺设长度 ×2 时自动分段（杜绝画出超长带） */
test('overlong tape runs are segmented along the tape axis', () => {
  const cuts = {
    cols: 1, rows: 1,
    xPos: [0, 60], yPos: [0, 500],
    xPlan: [60], yPlan: [500]
  };
  const ax = geometry.tapeAxisOf(cuts, 200);
  assert.equal(ax.tapeAxis, 'y');       /* 60×500 竖长分区：长边在 y ⇒ 带竖铺 */
  assert.equal(ax.segs[0], 3);          /* ceil(500/200) = 3 段 */
  assert.equal(ax.report.overZones, 1);
});

test('tapeAxisOf degrades gracefully on missing cuts', () => {
  assert.equal(geometry.tapeAxisOf(null, 200).ok, false);
  assert.equal(geometry.tapeAxisOf({ cols: 0, rows: 0 }, 200).ok, false);
});
