'use strict';
/* 分区网格 frame ↔ 世界米 换算（core/coord-frame.js）的**特征化**契约。
 *
 * 这里钉的不是"我觉得应该怎样"，而是**抽取前 inline-09.js 的既有行为**：
 * 下表的期望值由 `mod/inline-09.js` 里 tlFrameToWorld / tlFrameToGrid 的源码切片
 * 直接跑出来（不是手抄 —— 手抄一行就把 c.y 写成 c.x，误差 65 m）。
 * 所以这些断言的作用是：一旦换算语义漂了，这里先红，而不是等材料量算错。
 *
 * 覆盖六类：
 *   ① 正常换算：旋转 / 缩放 / 平移 三种自由度各自的真实 frame 形态
 *   ② 边界：frame=null、空对象、只给 origin、scaleX:0
 *   ③ 无效输入：angle 非数字、p 缺字段、p=null（钉住"抛什么"）
 *   ④ 回调委托：frame 自带 toWorld/toGrid 时必须走回调，不许自己算
 *   ⑤ 往返：frameToGrid(frameToWorld(p)) ≈ p
 *   ⑥ 副本漂移锁：mod/trunk-geo.js 里那第 4 份副本必须与本文模块**逐位相同**
 *      （收口只做了 1 份迁移，剩下 3 份还在原地 —— 这一节负责让它们不许悄悄漂）
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const MOD = path.join(__dirname, '..', 'core', 'coord-frame.js');
const INLINE09 = path.join(__dirname, '..', 'mod', 'inline-09.js');

/* 用 new Function 在**当前 realm** 里执行（与 tests/trunk_geo.test.cjs 同法：
   不用 vm.runInNewContext，跨 realm 原型不同会让 deepEqual 报"结构相同但不相等"）。 */
function load() {
  const src = fs.readFileSync(MOD, 'utf8');
  const win = {};
  return new Function('window', src + '\nreturn window.RyCoordFrame;')(win);
}
const CF = load();

function near(actual, expected, eps) {
  const e = eps == null ? 1e-9 : eps;
  assert.equal(typeof actual, 'number', `期望数字，实际 ${typeof actual}`);
  const tol = e * Math.max(1, Math.abs(expected));
  assert.ok(Math.abs(actual - expected) <= tol, `期望 ${expected}，实际 ${actual}（容差 ${tol}）`);
}
function nearPoint(actual, expected) {
  assert.ok(actual && typeof actual === 'object', '期望返回点对象，实际 ' + actual);
  near(actual.x, expected.x);
  near(actual.y, expected.y);
}

/* ---------- 真实 frame 形态：来自 plot-editor.js ppGridFrame() ---------- */
/* 300×170 m 地块 → 图纸 300000×170000 mm，scaleX=scaleY=1000，中心在图纸中心 */
const F_PLAIN = { angle: 0, center: { x: 150000, y: 85000 }, origin: { x: 0, y: 0 }, scaleX: 1000, scaleY: 1000 };
const F_ROT30 = { angle: 30, center: { x: 150000, y: 85000 }, origin: { x: 0, y: 0 }, scaleX: 1000, scaleY: 1000 };
const F_ORIGIN = { angle: 0, center: { x: 150000, y: 85000 }, origin: { x: 500, y: 300 }, scaleX: 1000, scaleY: 1000 };
const F_SCALED = { angle: 12.5, center: { x: 600, y: 340 }, origin: { x: -20, y: -10 }, scaleX: 2, scaleY: 2 };

/* ---------- ① 正常换算（期望值 = 抽取前源码的实测输出） ---------- */
const CASES = [
  {
    name: 'mm-center：地块中心',
    frame: F_PLAIN, p: { x: 150, y: 85 },
    world: { x: 0.15, y: 0.085 }, grid: { x: 150000, y: 85000 }
  },
  {
    name: 'mm-far-corner：地块右下角',
    frame: F_PLAIN, p: { x: 300, y: 170 },
    world: { x: 0.3, y: 0.17 }, grid: { x: 300000, y: 170000 }
  },
  {
    name: 'rot30-corner：旋转 30° 的角点',
    frame: F_ROT30, p: { x: 300, y: 170 },
    world: { x: 62.77099705346952, y: -63.31493500303392 },
    grid: { x: 322403.8105676658, y: 83612.1593216773 }
  },
  {
    name: 'rot30-center：旋转不移动中心',
    frame: F_ROT30, p: { x: 150, y: 85 },
    world: { x: 62.68359324290185, y: -63.463547162355596 },
    grid: { x: 150000, y: 85000 }
  },
  {
    name: 'origin-shift：origin 是地块 min 角（世界系）',
    frame: F_ORIGIN, p: { x: 800, y: 470 },
    world: { x: 500.8, y: 300.47 }, grid: { x: 300000, y: 170000 }
  },
  {
    name: 'scaled-neg：scale=2 + 负坐标',
    frame: F_SCALED, p: { x: 100, y: -50 },
    world: { x: 78.1317229379467, y: -84.48762487291273 },
    grid: { x: 157.62879958282076, y: 7.873938027345048 }
  }
];

for (const c of CASES) {
  test('世界 ← 图纸：' + c.name, () => nearPoint(CF.frameToWorld(c.frame, c.p), c.world));
  test('图纸 ← 世界：' + c.name, () => nearPoint(CF.frameToGrid(c.frame, c.p), c.grid));
}

/* ---------- ② 边界 ---------- */
test('边界：frame=null 两个方向都是恒等（原样透传，不做数值转换）', () => {
  const p = { x: 12.5, y: -7.25 };
  assert.deepEqual(CF.frameToWorld(null, p), p);
  assert.deepEqual(CF.frameToGrid(null, p), p);
});

test('边界：空 frame {} 等价于全零 + 单位缩放', () => {
  nearPoint(CF.frameToWorld({}, { x: 10, y: 10 }), { x: 10, y: 10 });
  nearPoint(CF.frameToGrid({}, { x: 10, y: 10 }), { x: 10, y: 10 });
});

test('边界：只给 origin（center 缺省 = 0）', () => {
  const f = { origin: { x: 5, y: 7 }, scaleX: 2, scaleY: 2 };
  nearPoint(CF.frameToWorld(f, { x: 10, y: 10 }), { x: 10, y: 12 });
  nearPoint(CF.frameToGrid(f, { x: 10, y: 10 }), { x: 10, y: 6 });
});

test('边界陷阱：scaleX:0 被 `|| 1` 静默当成 1（不是除以零）', () => {
  const f = { angle: 0, center: { x: 0, y: 0 }, origin: { x: 0, y: 0 }, scaleX: 0, scaleY: 0 };
  nearPoint(CF.frameToWorld(f, { x: 10, y: 10 }), { x: 10, y: 10 });
  nearPoint(CF.frameToGrid(f, { x: 10, y: 10 }), { x: 10, y: 10 });
});

test('边界：scaleX 缺失同样按 1 处理', () => {
  nearPoint(CF.frameToWorld({ angle: 0 }, { x: 10, y: 10 }), { x: 10, y: 10 });
});

/* ---------- ③ 无效输入：钉住"抛什么 / 产什么"，不许悄悄变成另一种 ---------- */
test('无效输入：angle 是非数字字符串 → 按 0 度处理', () => {
  const f = { angle: 'abc', center: { x: 0, y: 0 }, origin: { x: 0, y: 0 } };
  nearPoint(CF.frameToWorld(f, { x: 10, y: 0 }), { x: 10, y: 0 });
  nearPoint(CF.frameToGrid(f, { x: 10, y: 0 }), { x: 10, y: 0 });
});

test('无效输入：angle 是数字字符串 → 正常参与换算', () => {
  const f = { angle: '30', center: { x: 0, y: 0 }, origin: { x: 0, y: 0 } };
  nearPoint(CF.frameToWorld(f, { x: 10, y: 0 }), { x: 8.660254037844387, y: 4.999999999999999 });
  nearPoint(CF.frameToGrid(f, { x: 10, y: 0 }), { x: 8.660254037844387, y: -4.999999999999999 });
});

test('无效输入：点缺 y → 两个分量全是 NaN，且不抛（调用方必须自己校验输入）', () => {
  const out = CF.frameToWorld(F_PLAIN, { x: 10 });
  /* 注意不是"只有 y 坏"：dy=NaN 之后 NaN*0 还是 NaN，x 会被一起污染。
     这是既有行为（抽取前实测），钉住它是为了别有人以为"至少 x 还能用"。 */
  assert.ok(Number.isNaN(out.x), 'x 应为 NaN，实际 ' + out.x);
  assert.ok(Number.isNaN(out.y), 'y 应为 NaN，实际 ' + out.y);
  assert.doesNotThrow(() => CF.frameToWorld(F_PLAIN, { x: 10 }));
});

test('无效输入：p=null → 抛 TypeError（不做静默兜底）', () => {
  assert.throws(() => CF.frameToWorld(F_PLAIN, null), TypeError);
  assert.throws(() => CF.frameToGrid(F_PLAIN, null), TypeError);
});

/* ---------- ④ 回调委托 ---------- */
test('回调委托：frame 自带 toWorld/toGrid 时优先调用它', () => {
  let worldCalls = 0, gridCalls = 0;
  const f = {
    angle: 0, center: { x: 0, y: 0 }, origin: { x: 0, y: 0 },
    toWorld(p) { worldCalls++; return { x: p.x * 7 + 1, y: p.y * 7 + 2 }; },
    toGrid(p) { gridCalls++; return { x: p.x / 7 - 1, y: p.y / 7 - 2 }; }
  };
  nearPoint(CF.frameToWorld(f, { x: 3, y: 4 }), { x: 22, y: 30 });
  nearPoint(CF.frameToGrid(f, { x: 3, y: 4 }), { x: -0.5714285714285714, y: -1.4285714285714286 });
  assert.equal(worldCalls, 1, 'toWorld 应被调用一次');
  assert.equal(gridCalls, 1, 'toGrid 应被调用一次');
});

test('回调委托：只有 toWorld 时，frameToGrid 仍走自算（两个方向互不牵连）', () => {
  const f = { angle: 0, center: { x: 0, y: 0 }, origin: { x: 0, y: 0 }, toWorld: p => ({ x: p.x + 100, y: p.y + 100 }) };
  nearPoint(CF.frameToWorld(f, { x: 1, y: 1 }), { x: 101, y: 101 });
  nearPoint(CF.frameToGrid(f, { x: 1, y: 1 }), { x: 1, y: 1 });
});

/* ---------- ⑤ 往返 ---------- */
for (const [name, frame] of [['平移+mm 缩放', F_PLAIN], ['旋转 30°', F_ROT30], ['缩放 2 倍 + 旋转 12.5°', F_SCALED], ['origin 偏移', F_ORIGIN]]) {
  test('往返闭合：' + name, () => {
    let maxErr = 0, worst = null;
    for (let i = 0; i < 50; i++) {
      const p = { x: (i * 37) % 300 - 50 + i * 0.25, y: (i * 53) % 170 - 40 + i * 0.125 };
      const back = CF.frameToGrid(frame, CF.frameToWorld(frame, p));
      const e = Math.max(Math.abs(back.x - p.x), Math.abs(back.y - p.y));
      if (e > maxErr) { maxErr = e; worst = p; }
    }
    assert.ok(maxErr < 1e-6, `往返误差 ${maxErr} 超限（点 ${JSON.stringify(worst)}）`);
  });
}

/* ---------- 单位契约：别把 m 和 mm 混了 ---------- */
test('单位契约：300×170 m 地块经 scaleX=1000 后跨度是 300000×170000 mm', () => {
  const a = CF.frameToGrid(F_PLAIN, { x: 0, y: 0 });
  const b = CF.frameToGrid(F_PLAIN, { x: 300, y: 170 });
  near(Math.abs(b.x - a.x), 300000, 1e-9);
  near(Math.abs(b.y - a.y), 170000, 1e-9);
});

/* ---------- 防倒退：inline-09 不许再长出第二份实现 ---------- */
test('防倒退：mod/inline-09.js 只转发，不再自带 frame 换算的数学', () => {
  const src = fs.readFileSync(INLINE09, 'utf8');
  assert.ok(
    src.includes('RyCoordFrame.frameToWorld') && src.includes('RyCoordFrame.frameToGrid'),
    'inline-09 应通过 window.RyCoordFrame 转发（与 RyZoneGeometry 同一套收口方式）'
  );
  /* 这句是原实现的指纹：一旦有人把公式抄回来，这里立刻红 */
  assert.ok(
    !src.includes('dx * cs - dy * sn'),
    'inline-09 里又出现了 frame 换算的原始公式 —— 应改为调用 core/coord-frame.js'
  );
});

/* ---------- ⑥ 第 4 份副本（mod/trunk-geo.js）的漂移锁 ----------
 * 背景：v836 只迁了 inline-09 那一份。`mod/trunk-geo.js` 里还留着一份自算副本，
 *      注释写着「与 tlFrameToWorld 逐字一致」—— 但**没有任何机制保证这句话继续成立**。
 *      它的下游是总管绘制时的分区交点捕捉，漂了的表现是"吸附点整体偏移"，
 *      肉眼在 angle=0 的矩形地块上完全看不出来。
 * 这里不迁移它（会把 coord-frame 的加载顺序依赖塞进 5 个读取方的链路），
 * 只把「逐位相同」变成一条会响的断言。等真要收口时，这条锁就是现成的前置条件。
 */
const TRUNKGEO = path.join(__dirname, '..', 'mod', 'trunk-geo.js');
const TG = new Function('window', fs.readFileSync(TRUNKGEO, 'utf8') + '\nreturn window.RyTrunkGeo;')({});

const DRIFT_FRAMES = [
  ['plain 0°', F_PLAIN],
  ['rot 30°', F_ROT30],
  ['origin 偏移', F_ORIGIN],
  ['scale 2 + 负坐标', F_SCALED],
  ['null frame（恒等）', null],
  ['空对象', {}],
  ['scaleX:0（钉住 `|| 1`）', { angle: 0, center: { x: 5, y: 5 }, origin: { x: 1, y: 2 }, scaleX: 0, scaleY: 0 }],
  ['angle 是数字字符串', { angle: '30', center: { x: 0, y: 0 }, origin: { x: 0, y: 0 }, scaleX: 1000, scaleY: 1000 }],
  ['负角度 + 非整缩放', { angle: -47, center: { x: 12345, y: 6789 }, origin: { x: -100, y: -50 }, scaleX: 2.5, scaleY: 2.5 }]
];

const DRIFT_PTS = [];
for (let i = 0; i < 40; i++) {
  DRIFT_PTS.push({ x: (i * 37) % 300 - 50 + i * 0.137, y: (i * 53) % 170 - 40 + i * 0.311 });
}

for (const [name, frame] of DRIFT_FRAMES) {
  test('副本漂移锁：trunk-geo.frameToWorld 与 RyCoordFrame 逐位相同（' + name + '）', () => {
    for (const p of DRIFT_PTS) {
      const a = TG.frameToWorld(frame, p);
      const b = CF.frameToWorld(frame, p);
      /* 用 assert.equal（strict）而不是 near()：要求的是**逐位相同**，
         允许 1e-9 容差就等于允许两份实现各算各的。 */
      assert.equal(a.x, b.x, `x 分叉于 p=${JSON.stringify(p)}：${a.x} ≠ ${b.x}`);
      assert.equal(a.y, b.y, `y 分叉于 p=${JSON.stringify(p)}：${a.y} ≠ ${b.y}`);
    }
  });
}

test('副本漂移锁：trunk-geo 只暴露一个方向（frameToGrid 由 coord-frame 独占）', () => {
  assert.equal(typeof TG.frameToWorld, 'function', 'RyTrunkGeo.frameToWorld 应存在');
  assert.equal(typeof TG.frameToGrid, 'undefined',
    'trunk-geo 若长出 frameToGrid，说明有人在往里加第二套语义 —— 应先迁到 coord-frame');
});

test('副本漂移锁：两份实现对「带 toWorld 回调的 frame」结果不同（差异是既知且被生产者屏蔽的）', () => {
  const f = { angle: 0, center: { x: 0, y: 0 }, origin: { x: 0, y: 0 }, toWorld: p => ({ x: p.x * 7, y: p.y * 7 }) };
  nearPoint(CF.frameToWorld(f, { x: 3, y: 4 }), { x: 21, y: 28 });   /* 委托 */
  nearPoint(TG.frameToWorld(f, { x: 3, y: 4 }), { x: 3, y: 4 });     /* 自算 = 恒等 */
  /* 这不是 bug：trunk-geo 只吃 tlDiagramData.zones.frame，而那个帧已被生产者
     剥成纯数据（见下一条）。一旦下一条红了，本条立刻从"已知差异"升级成"真故障"。 */
});

test('副本漂移锁的前提：tlDiagramData.zones.frame 按 5 字段白名单重建，闭包进不来', () => {
  const src = fs.readFileSync(INLINE09, 'utf8');
  const m = src.match(/frame:\s*tlZoneCuts\.frame\s*\?([\s\S]{0,400}?):\s*null/);
  assert.ok(m, '没找到 tlDiagramData.zones.frame 的构造点（inline-09 里应唯一）');
  const build = m[1];
  for (const k of ['angle', 'center', 'origin', 'scaleX', 'scaleY']) {
    assert.ok(new RegExp('\\b' + k + ':').test(build), '白名单应包含 ' + k + '，实际：' + build);
  }
  assert.ok(!/toWorld|toGrid/.test(build),
    '白名单里出现了回调 ⇒ trunk-geo 的自算副本会与 coord-frame 分叉（上一条会同时变红）');
  assert.ok(!/frame:\s*tlZoneCuts\.frame\s*[,}]/.test(src),
    'zones.frame 不许按引用透传：会把带闭包的活 frame 交给 trunk-geo');
});

/* ---------- ⑦ 第 3 份副本（plot-editor.js ppGridFrame 的闭包）----------
 * 这一份和第⑥节不同：它是**活 frame 的生成器**，返回的 frame 自带 toWorld/toGrid 闭包，
 * coord-frame 见到这种 frame 会直接委托（文件头规则 1）。
 *
 * 于是有一条从没被验证过的隐含假设被整条链路依赖：
 *     「把 frame 的闭包剥掉、只留 {angle,center,origin,scaleX,scaleY}，
 *       下游用 coord-frame 自算，结果必须一位数字都不差。」
 * inline-09:4631 正是这么剥的（tlDiagramData.zones.frame 白名单重建）。
 * 剥了之后数字变了 ⇒ 画布上看到的点位与总管捕捉用的点位不是同一个点，且没人会报错。
 *
 * ★ 怎么验而不改 plot-editor.js（它有别人的未提交改动）：
 *   按源码切片取出 ppGridFrame 的函数体（大括号配平），用「一调用就抛」的桩替掉它的三个
 *   依赖。若它真去用了默认参数，桩会立刻抛 —— 这同时证明了测试是把四个入参全传齐的，
 *   而不是靠内部兜底算出个碰巧对的结果。
 */
const PLOTEDITOR = path.join(__dirname, '..', 'mod', 'plot-editor.js');

function sliceFunction(src, name) {
  const lines = src.split('\n');
  const start = lines.findIndex((l) => new RegExp('function\\s+' + name + '\\s*\\(').test(l));
  if (start < 0) throw new Error('plot-editor.js 里找不到 ' + name);
  let depth = 0, end = -1;
  for (let i = start; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end >= 0) break;
  }
  if (end < 0) throw new Error(name + ' 的大括号没配平');
  return lines.slice(start, end + 1).join('\n');
}

const ppSrc = fs.readFileSync(PLOTEDITOR, 'utf8');
const ppFnSrc = sliceFunction(ppSrc, 'ppGridFrame');

/* 切片自检：切歪了就别拿它当证据 */
assert.ok(ppFnSrc.length > 400 && ppFnSrc.length < 2500,
  'ppGridFrame 切片长度异常（' + ppFnSrc.length + '），切片可能切歪了');
assert.ok(/function toWorld/.test(ppFnSrc) && /function toGrid/.test(ppFnSrc),
  'ppGridFrame 切片里应同时含 toWorld / toGrid 两个闭包');
assert.ok(/scaleX:sx/.test(ppFnSrc), '切片里应含 scaleX:sx（口径锚点）');

const boom = (what) => () => { throw new Error('测试不应触发 ppGridFrame 的内部兜底：' + what); };
const ppGridFrame = new Function(
  'ppState', 'ppGetBounds', 'ppGetPlanDims', 'ppZoneAngle',
  ppFnSrc + '\nreturn ppGridFrame;'
)(undefined, boom('ppGetBounds'), boom('ppGetPlanDims'), boom('ppZoneAngle'));

/* 300×170 m 地块 → 图纸 300000×170000 mm（与上方 F_* 同一套口径） */
const B = { minX: 0, minY: 0, maxX: 300, maxY: 170, w: 300, h: 170 };
const DIMS = { w: 300000, h: 170000 };
const POLY = [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 170 }, { x: 0, y: 170 }];

test('副本漂移锁：ppGridFrame 的闭包口径 = coord-frame 的口径（center 在图纸系 / origin 在世界系）', () => {
  const f = ppGridFrame(POLY, B, DIMS, 0);
  assert.ok(f, 'ppGridFrame 应返回 frame');
  assert.deepEqual(f.center, { x: 150000, y: 85000 }, 'center 应是图纸中心（mm）');
  assert.deepEqual(f.origin, { x: 0, y: 0 }, 'origin 应是地块 min 角（世界 m）');
  assert.equal(f.scaleX, 1000, 'scaleX = 图纸mm ÷ 地块m');
  assert.equal(f.scaleY, 1000, 'scaleY = 图纸mm ÷ 地块m');
});

for (const angle of [0, 30, 12.5, -47]) {
  test('副本漂移锁：剥掉闭包后 coord-frame 自算与闭包逐位相同（' + angle + '°）', () => {
    const f = ppGridFrame(POLY, B, DIMS, angle);
    /* 剥法照抄 inline-09:4631 的白名单 */
    const thinned = {
      angle: f.angle, center: f.center, origin: f.origin, scaleX: f.scaleX, scaleY: f.scaleY
    };
    assert.equal(typeof f.toWorld, 'function', '原 frame 应带 toWorld 闭包');
    assert.equal(typeof thinned.toWorld, 'undefined', '剥完不该再带闭包');

    for (const p of DRIFT_PTS) {
      const viaClosure = f.toWorld(p);
      const viaMath = CF.frameToWorld(thinned, p);
      assert.equal(viaMath.x, viaClosure.x, `world.x 分叉于 p=${JSON.stringify(p)}`);
      assert.equal(viaMath.y, viaClosure.y, `world.y 分叉于 p=${JSON.stringify(p)}`);

      const viaGridClosure = f.toGrid(p);
      const viaGridMath = CF.frameToGrid(thinned, p);
      assert.equal(viaGridMath.x, viaGridClosure.x, `grid.x 分叉于 p=${JSON.stringify(p)}`);
      assert.equal(viaGridMath.y, viaGridClosure.y, `grid.y 分叉于 p=${JSON.stringify(p)}`);
    }
  });
}
