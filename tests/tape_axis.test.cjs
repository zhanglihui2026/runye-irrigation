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

/* [v883 2026-11-02 用户拍板] 硬规则：滴灌带沿地块长边布置。
   用户实测地块：竖向 364×509（长边在 Y），手动 30 亩/区 → 4 列 × 2 行，
   分区 91×254.5，S=80。旧「贴合 S 投票」必投 X（0.879 > 0.314 ⇒ 带横在短边）；
   v883 起长边差 40% ≫ 5% ⇒ 直接取 Y 为带轴 ⇒ 主管/支管横向 ⊥ 带。 */
test('tape follows the plot long side (tall plot → vertical tape)', () => {
  const cuts = {
    cols: 4, rows: 2,
    xPos: [0, 91, 182, 273, 364], yPos: [0, 254.5, 509],
    xPlan: [91, 91, 91, 91], yPlan: [254.5, 254.5]
  };
  const ax = geometry.tapeAxisOf(cuts, 80);
  assert.equal(ax.ok, true);
  assert.equal(ax.tapeAxis, 'y');       /* 滴灌带沿长边（竖铺） */
  assert.equal(ax.pipeAxis, 'x');       /* 主管/支管横向 ⊥ 滴灌带 */
  /* 每区带长 254.5 / S=80 → 4 段 */
  assert.deepEqual(ax.segs, [4, 4, 4, 4, 4, 4, 4, 4]);
});

/* 宽版孪生：509×364（长边在 X）⇒ 带横向、主管/支管竖向 —— 长边规则随地块翻转 */
test('tape follows the plot long side (wide plot → horizontal tape)', () => {
  const cuts = {
    cols: 2, rows: 4,
    xPos: [0, 254.5, 509], yPos: [0, 91, 182, 273, 364],
    xPlan: [254.5, 254.5], yPlan: [91, 91, 91, 91]
  };
  const ax = geometry.tapeAxisOf(cuts, 80);
  assert.equal(ax.tapeAxis, 'x');
  assert.equal(ax.pipeAxis, 'y');
});

/* 混合朝向地块（上排 58×195 高瘦 + 下排 58×47 扁宽）：网格 527×242，
   长边差 >5% ⇒ v883 长边规则直接取 X（不再走贴合票；旧判据此时会投 Y，
   带横在 58 短边上——正是用户要求废掉的口径）。 */
test('mixed-aspect plot: long-side rule wins over fit vote', () => {
  const cuts = {
    cols: 9, rows: 2,
    xPos: [0, 58, 116, 174, 232, 290, 348, 406, 464, 527],
    yPos: [0, 195, 242],
    xPlan: [58, 58, 58, 58, 58, 58, 58, 58, 58],
    yPlan: [195, 47]
  };
  const ax = geometry.tapeAxisOf(cuts, 240);
  assert.equal(ax.ok, true);
  assert.equal(ax.tapeAxis, 'x');       /* 网格 522×242：长边在 X ⇒ 带横铺 */
  assert.equal(ax.pipeAxis, 'y');       /* 主管/支管竖向 ⊥ 滴灌带 */
  /* 贴合票仍照算（仅作报告信息）：上排投 y、下排投 x → 9:9 平票记录在案 */
  assert.equal(ax.votes.y, 9);
  assert.equal(ax.votes.x, 9);
  /* 带轴取 X 后每区带长 58 ≪ S=240 → 全部记 shortZones（软目标被长边硬规则牺牲） */
  assert.equal(ax.report.shortZones, 18);
  assert.equal(ax.report.overZones, 0);
  assert.ok(ax.report.branchRatio > 1);
  assert.deepEqual(ax.segs.slice(0, 9), [1, 1, 1, 1, 1, 1, 1, 1, 1]);
});

/* 接近正方形（≤5%）无明确长边 ⇒ 退回「贴合单边铺设长度」投票 */
test('near-square plot falls back to the fit vote', () => {
  const cuts = {
    cols: 2, rows: 2,
    xPos: [0, 100, 200], yPos: [0, 100, 200],
    xPlan: [100, 100], yPlan: [100, 100]
  };
  const ax = geometry.tapeAxisOf(cuts, 120);
  assert.equal(ax.ok, true);
  /* 200×200 正方：无长边；S=120 → axisFit(100,120)=0.833 两向相同 → 平票 → 贴合度加权相等 → 默认 x */
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
  assert.equal(ax.tapeAxis, 'y');       /* 60×500：长边在 Y ⇒ 带竖铺 */
  assert.equal(ax.segs[0], 3);          /* ceil(500/200) = 3 段 */
  assert.equal(ax.report.overZones, 1);
});

test('tapeAxisOf degrades gracefully on missing cuts', () => {
  assert.equal(geometry.tapeAxisOf(null, 200).ok, false);
  assert.equal(geometry.tapeAxisOf({ cols: 0, rows: 0 }, 200).ok, false);
});
