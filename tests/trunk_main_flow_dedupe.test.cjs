#!/usr/bin/env node
'use strict';
/* tests/trunk_main_flow_dedupe.test.cjs —— [v1098] 主管分段流量「每区只计一次」
 *
 * 现象：在线地图轮灌演示卡「第 8 区」主管流速显示 2.48 m/s，同组三级页写 1.24 ——
 *   恰为两倍。定位链：
 *   mod/map-flow-demo.js  targets 给每区支管**两端各建一条路线**（branch-start / branch-end），
 *   两条路线的主干段完全相同；
 *   mod/inline-09.js      tlRoutesWorstPath 旧 edgeZones 按**路线** push ⇒ downZi=[8,8]；
 *   hydraulic-calc/pipe-path-loss.js + 卡片流速  逐项累加 ⇒ 8 区 101.94 m³/h 被算两遍。
 *
 * 修复口径：downZi 是「分区号集」，同一物理切片上每区只计一次；不同区共用同一段时
 *   仍按各区流量相加（真实合流不允许被去重掉）。
 *
 * 锁定：
 * ① 生产端：同一区两条端点路线经过同一主管切片 ⇒ downZi 只有一个 8；
 * ② 生产端：两个不同区共用切片 ⇒ 两区都在、且各一次（顺序 = 首次出现顺序）；
 * ③ 消费端：pipe-path-loss 收到重复 downZi（旧快照/外部调用）仍然幂等；
 * ④ 真实数值：8 区 101.94 m³/h @ Ø200 由 2.478 m/s 回到 1.239 m/s，
 *    主管损失由 7.240 m 回到 2.006 m（272.9 m 反算长度，2^1.852 = 3.610 倍）；
 * ⑤ 防复活：三处修复点必须在位（源头去重 + 两个消费点幂等）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'mod', 'inline-09.js'), 'utf8');
const lossSrc = fs.readFileSync(path.join(ROOT, 'hydraulic-calc', 'pipe-path-loss.js'), 'utf8');
const { calculate } = require('../hydraulic-calc/pipe-path-loss.js');
const H = require('../hydraulic-calc/hc-core.js');

const near = (a, b, msg, tol) => assert.ok(Math.abs(a - b) < (tol || 1e-6),
  (msg || '') + ' 期望 ' + b + '，实得 ' + a);

/* —— 与 tests/worst_path_seg.test.cjs 同款：文本抽取 tlRoutesWorstPath 到本地跑 —— */
function extract(s, name) {
  const start = s.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name + ' 缺失');
  const begin = s.indexOf('{', start);
  let depth = 1, i = begin + 1;
  while (depth && i < s.length) {
    const c = s[i];
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      for (i++; i < s.length; i++) {
        if (s[i] === '\\') i++;
        else if (s[i] === quote) { i++; break; }
      }
    } else if (s.slice(i, i + 2) === '/*') i = s.indexOf('*/', i + 2) + 2;
    else if (s.slice(i, i + 2) === '//') i = s.indexOf('\n', i + 2) + 1;
    else { if (c === '{') depth++; if (c === '}') depth--; i++; }
  }
  assert.equal(depth, 0, name + ' 函数提取失败');
  return s.slice(start, i);
}

const MLAT = 6378137 * Math.PI / 180, CL30 = Math.cos(30 * Math.PI / 180);
const llOf = (x, y) => ({ lat: 30 + y / MLAT, lng: 120 + x / (MLAT * CL30) });

/* 三根竖直主管 + 手绘总管（与段总管用例同夹具，只在 routes 引擎分支里用得上主管）。 */
function fixture() {
  return {
    world: 'meter',
    mainPipes: [
      [{ x: 0, y: 0 }, { x: 0, y: 100 }],
      [{ x: 10, y: 0 }, { x: 10, y: 100 }],
      [{ x: 20, y: 0 }, { x: 20, y: 100 }]
    ],
    branchPipes: [], branchFullSpans: [], branchDrawnLens: [],
    frontPipe: null, sourcePos: null
  };
}

function worstPathOf(routes) {
  const extracted = ['tlRoutesWorstPath', 'tlBranchCalcLenOf'].map(n => extract(src, n)).join('\n');
  const win = {
    tlDiagramData: fixture(),
    __runyeGeoBase: { refLat: 30, refLng: 120 },
    RyMapFlowDemo: { routesAll: () => ({ routes: routes, total: 3, missing: [] }) }
  };
  const factory = new Function('window', 'readSelectedInt', 'readNumber', 'tlMapTrunkLen',
    extracted + '\nreturn tlRoutesWorstPath;');
  const fn = factory(win, (sel, def) => def, (id, def) => def, () => null);
  return fn(false, {});
}

/* 一条主管切片：key=main:zi，弧长区间 [a,b]。 */
const seg = (zi, a, b) => ({ key: 'main:' + zi, points: [llOf(zi * 10, a), llOf(zi * 10, b)], a: a, b: b });

test('① 同一区两条端点路线经过同一主管切片 ⇒ downZi 只含该区一次', () => {
  const s = seg(2, 0, 100);
  /* routesAll 的现实形态：同一 zi 出现两次（支管 start / end 两个目标），主干段逐字段相同。 */
  const wp = worstPathOf([
    { zi: 2, trunk: [], main: [s], branch: [] },
    { zi: 2, trunk: [], main: [s], branch: [] }
  ]);
  assert.equal(wp.fromRoutes, true);
  const z2 = wp.zones.find(z => z.zi === 2);
  assert.equal(z2.mainSegs.length, 1);
  assert.deepEqual(z2.mainSegs[0].downZi, [2], 'v1098 前这里是 [2,2]（同一区被算两遍）');
});

test('② 两个不同区共用同一切片 ⇒ 两区各一次（真实合流不被去重掉）', () => {
  const s = seg(2, 0, 100);
  const wp = worstPathOf([
    { zi: 0, trunk: [], main: [s], branch: [] },
    { zi: 0, trunk: [], main: [s], branch: [] },
    { zi: 2, trunk: [], main: [s], branch: [] },
    { zi: 2, trunk: [], main: [s], branch: [] }
  ]);
  assert.deepEqual(wp.zones.find(z => z.zi === 2).mainSegs[0].downZi, [0, 2]);
  assert.deepEqual(wp.zones.find(z => z.zi === 0).mainSegs[0].downZi, [0, 2]);
});

test('③ 消费端幂等：downZi 带重复（旧快照/外部调用）也把每区算一次', () => {
  const base = {
    zones: [{ zi: 8, run: 10, main: 272.9, branch: 0, flow: 101.94,
      mainSegs: [{ key: 'main:8', len: 272.9, downZi: [8, 8] }] }],
    groups: [[8]], calibers: {}, frontOd: 250, mainOd: 200, branchOd: 140,
    branchCount: 2, branchF: 0.4, innerDiam: H.innerDiam, hazen: H.hazen
  };
  const dup = calculate(base);
  const once = calculate({ ...base, zones: [{ ...base.zones[0],
    mainSegs: [{ key: 'main:8', len: 272.9, downZi: [8] }] }] });
  near(dup.paths[0].mainLoss, once.paths[0].mainLoss, '重复 downZi 不得改变主管损失');
  near(dup.paths[0].mainSegFlowMax, 101.94, '段流量应为单区 101.94，不是 203.88', 1e-9);
  /* 合流仍相加：两区共用一段 ⇒ 流量为两区之和，不被去重逻辑吃掉 */
  const joined = calculate({ ...base, groups: [[8, 4]], zones: [
    { zi: 8, run: 10, main: 272.9, branch: 0, flow: 101.94,
      mainSegs: [{ key: 'main:8', len: 272.9, downZi: [8, 4, 8] }] },
    { zi: 4, run: 10, main: 272.9, branch: 0, flow: 50 }] });
  near(joined.paths[0].mainSegFlowMax, 151.94, '两区共用同段 ⇒ 101.94+50', 1e-9);
});

test('④ 真实数值：8 区 101.94 m³/h 经 Ø200 由 2.478 回到 1.239 m/s，主管损失 7.24→2.01 m', () => {
  const d = H.innerDiam(200, 13.6);
  near(d, 170.588, 'PE Ø200（SDR 13.6）内径', 1e-3);
  near(H.velocity(101.94, d), 1.239, '单区真实流速', 1e-3);
  near(H.velocity(203.88, d), 2.478, '旧 bug 的翻倍流速', 1e-3);
  /* 反算：卡片「主管损失 7.24 m」对应 203.88 m³/h ⇒ 长度 272.9 m（与实测路径同量级） */
  const L = 7.24 / H.hazen(1, 203.88, d);
  near(L, 272.9, '反算主管长度', 0.2);
  near(H.hazen(L, 203.88, d), 7.24, '旧口径主管损失', 1e-6);
  near(H.hazen(L, 101.94, d), 2.006, '修后主管损失（÷2^1.852=3.610）', 1e-3);
  /* 扬程：损失少 5.234 m ⇒ 含 1.10 安全系数后少 5.757 m */
  near(H.head(100, 7.24, 2.0, 1.1) - H.head(100, 2.006, 2.0, 1.1), 5.757, '泵扬程降幅', 1e-3);
});

test('⑤ 防复活：源头按区去重 + 两个消费点幂等三处都在位', () => {
  assert.ok(/arr\.indexOf\(rt\.zi\) < 0/.test(src),
    'tlRoutesWorstPath 的 edgeZones 必须按区去重（按路线 push 会把同一区算两遍）');
  assert.ok(/seenDz/.test(src), '卡片最高流速的段流量累加必须对 downZi 幂等');
  assert.ok(/seenZd/.test(lossSrc), 'pipe-path-loss 的段流量累加必须对 downZi 幂等');
  /* 支管两端路线不得为了去重被删掉：routesAll 仍按 target 建路，覆盖判定靠它 */
  const flowSrc = fs.readFileSync(path.join(ROOT, 'mod', 'map-flow-demo.js'), 'utf8');
  assert.ok(/targets\.push\(\{zi:i,id:startId\},\{zi:i,id:endId\}\)/.test(flowSrc),
    '每区支管两端两条路线必须保留（动画覆盖与全场闭合判定依赖它）');
});
