'use strict';
/* tests/area_lock_merge_guard.test.cjs —— [v994] 「锁定面积」合并豁免契约
 *
 * 背景（用户 2026-11-06：「检查一下锁定面积的功能是否还在，功能是否还完整？」）
 *   入口、状态四件套（图标 / 文案 / active / aria-pressed）、整轴平移、持久化、
 *   自动解锁其实都在，CDP 实点也全部正常（_probe_lock_click.mjs）。
 *   真正漏的是 **ppBmFreeOk 的豁免口径**：原实现只要「是最外侧内线」就放行单线自由拖动，
 *   不看拖到哪里 ⇒ CDP 合成拖拽实测（12×2 分区地块、锁定态）：
 *     · 最外侧 x 内线小幅拖动：首格 60m → 32.5m（锁定完全没生效，只动了那一条线）
 *     · 纵向只有 1 条内线（2 分区）：200 → 227.06（该轴整轴被豁免，锁定形同虚设）
 *   用户 2026-09-28 拍板的例外只有一句「最外侧分区线拖到地块边线可直接合并减区」，
 *   所以豁免必须**同时**满足「最外侧内线」+「本帧坐标已贴近/越过地块边线」。
 *
 * 本测试两Layer：① 剥注释后的源码契约（防改回旧口径）；② 把 ppBmFreeOk /
 *   ppDragCutAxis 的函数体直接放进 vm 用桩数据跑，验证真实分支行为。
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripJs = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const code = stripJs(read('mod/plot-editor.js'));
const html = read('index.html');
const sw = read('sw.js');
/* verify_ry_tool.js 是本机闸门、按项目惯例未入库；全新克隆里没有它，
   本测试不能因此崩掉（否则远端 CI 会假红）。有就顺带核对契约。 */
const verifyPath = path.join(ROOT, 'verify_ry_tool.js');
const verify = fs.existsSync(verifyPath) ? fs.readFileSync(verifyPath, 'utf8') : '';

/* 按花括号配对取一个完整函数体（不依赖缩进，避免下一个函数声明切错位置） */
function fnBody(src, name) {
  const head = 'function ' + name + '(';
  const i = src.indexOf(head);
  assert.ok(i > 0, '找不到函数 ' + name);
  const open = src.indexOf('{', i);
  let depth = 0;
  for (let k = open; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}' && --depth === 0) return src.slice(i, k + 1);
  }
  throw new Error('函数 ' + name + ' 花括号不配对');
}

const bmSrc = fnBody(code, 'ppBmFreeOk');
const axisSrc = fnBody(code, 'ppDragCutAxis');

/* 造一个 vm 沙箱：桩数据 + 真实函数体，跑分支而不是只看字符串 */
function sandbox(bm, axisSrcText, opts) {
  const cuts = opts.cuts;
  const state = { areaLocked: !!opts.locked, mergePreview: null };
  const written = [];
  const ctx = {
    ppState: state,
    ppCurrentCuts: () => cuts,
    ppWorldPerPixel: () => 0.4,      // thr = max(2, 25*0.4) = 10 世界米
    ppSetCutPos: (ax, i, v) => written.push([ax, i, v]),
    written,
    Math,
    isFinite
  };
  vm.createContext(ctx);
  vm.runInContext(bm + (axisSrcText ? '\n' + axisSrcText : '') +
    '\nglobalThis.__bm = ppBmFreeOk;' + (axisSrcText ? '\nglobalThis.__axis = ppDragCutAxis;' : ''), ctx);
  return ctx;
}

/* 12 分区 x 轴：边界 0 / 700，内线 60..660；y 轴 2 分区：边界 -150 / 150，内线 50 */
const x12 = [0, 60, 120, 180, 240, 300, 360, 420, 480, 540, 600, 660, 700];
const y2 = [-150, 50, 150];
const cuts = { xPos: x12.slice(), yPos: y2.slice() };

test('源码契约：合并豁免必须吃本帧坐标，且末帧模式由 dragCut 记录', () => {
  assert.match(bmSrc, /function ppBmFreeOk\(axis,index,coord\)/, 'ppBmFreeOk 必须接收 coord');
  assert.match(bmSrc, /coord<=arr\[0\]\+thr/, '第一条内线只有拖到左/上边线才豁免');
  assert.match(bmSrc, /coord>=arr\[arr\.length-1\]-thr/, '最后一条内线只有拖到右/下边线才豁免');
  assert.doesNotMatch(bmSrc, /return index===1\|\|index===arr\.length-2/, '旧的无条件豁免不得复活');
  assert.ok(code.includes('ppBmFreeOk(dcK.axis,dcK.index,dcCoord)'), 'mousemove 必须传本帧坐标');
  assert.ok(code.includes('ppState.dragCut.mergeMode=dcFree'), '必须把合并模式记在 dragCut 上');
  assert.ok(code.includes('var ppBmWasOk=!!(ppState.dragCut&&ppState.dragCut.mergeMode)'),
    'mouseup 不能用静态线索引反推合并权限');
});

test('源码契约：2 分区轴锁定态冻结（拖动 + 键盘微调）', () => {
  assert.match(axisSrc, /if\(arr\.length<=3\)/, 'ppDragCutAxis 必须冻结单内线轴');
  assert.match(code, /if\(arr2\.length<=3\)return;/, 'ppNudgeCut 锁定分支同样要冻结');
  assert.ok(code.includes("tip('已锁定面积：该方向只有 2 个分区"), '冻结时须给用户明确提示，不能「拖了没反应」');
});

test('源码契约：按钮状态同步 aria-label 且 title 无双重前缀', () => {
  assert.ok(code.includes("btn.setAttribute('aria-label',on?'已锁定面积':'锁定面积')"),
    '读屏器在锁定态不能还念「锁定面积」');
  assert.ok(code.includes("?'已锁定面积：拖动网格线") && code.includes(":'锁定面积：开启后拖动网格线"),
    'title 必须以当前可见文案开头（inline-18.js 的归一化规则）');
  assert.ok(html.includes('title="锁定面积：开启后拖动网格线'), 'index.html 初始 title 同口径');
});

test('源码契约：静态闸门 + 版本引用同步', () => {
  if (verify) assert.ok(verify.includes("'ppBmFreeOk(dcK.axis,dcK.index,dcCoord)'"),
    '主闸门 must 要锁新调用点');
  const version = (sw.match(/const VERSION = '([^']+)'/) || [])[1];
  assert.ok(version, 'sw.js 必须能读出 VERSION');
  /* sw.VERSION 带前缀 v（v994-…），页面 ?v= 后缀不带（994-…），按项目既有口径比对 */
  assert.ok(html.includes('mod/plot-editor.js?v=' + version.replace(/^v/, '') + '"'),
    'index.html 的 plot-editor.js ?v= 必须与 sw VERSION 一致，否则 PWA 拿旧脚本');
});

test('行为：未锁定时一律不豁免（走原有单线拖动 / 吸附合并）', () => {
  const c = sandbox(bmSrc, '', { cuts, locked: false });
  assert.equal(c.__bm('x', 1, 0), false);
  assert.equal(c.__bm('x', 1, 300), false);
});

test('行为：锁定态中间内线永不豁免，一律整轴刚性平移', () => {
  const c = sandbox(bmSrc, '', { cuts, locked: true });
  for (const idx of [2, 5, 9, 10]) assert.equal(c.__bm('x', idx, 0), false, 'index=' + idx);
});

test('行为：最外侧内线「小幅拖动」不再豁免（原缺陷 ①）', () => {
  const c = sandbox(bmSrc, '', { cuts, locked: true });
  assert.equal(c.__bm('x', 1, 85), false, '第一条内线在中部拖动必须走整轴平移');
  assert.equal(c.__bm('x', 11, 640), false, '最后一条内线在中部拖动必须走整轴平移');
});

test('行为：最外侧内线「拖到地块边线」仍放行合并（用户拍板的例外）', () => {
  const c = sandbox(bmSrc, '', { cuts, locked: true });
  assert.equal(c.__bm('x', 1, 5), true, '第一条内线拖到左边线');
  assert.equal(c.__bm('x', 1, -20), true, '越过左边线也算');
  assert.equal(c.__bm('x', 11, 695), true, '最后一条内线拖到右边线');
  assert.equal(c.__bm('x', 11, 730), true, '越过右边线也算');
});

test('行为：2 分区轴普通拖动不再整轴豁免（原缺陷 ②）', () => {
  const c = sandbox(bmSrc, '', { cuts, locked: true });
  assert.equal(c.__bm('y', 1, 55), false, '唯一内线在中部拖动不得自由移动');
  assert.equal(c.__bm('y', 1, -145), true, '拖到上边线仍可合并减区');
  assert.equal(c.__bm('y', 1, 145), true, '拖到下边线仍可合并减区');
});

test('行为：2 分区轴 ppDragCutAxis 冻结且不清空已有合并预览之外的数据', () => {
  const c = sandbox(bmSrc, axisSrc, { cuts, locked: true });
  const r = c.__axis('y', 1, 90);
  assert.equal(r.frozen, true);
  assert.equal(r.delta, 0);
  assert.equal(c.written.length, 0, '不得写任何切割线位置');
  assert.equal(c.ppState.mergePreview, null);
});

test('行为：多分区轴 ppDragCutAxis 仍做整轴刚性平移（不能修过头）', () => {
  const c = sandbox(bmSrc, axisSrc, { cuts, locked: true });
  const r = c.__axis('x', 5, 330);
  assert.notEqual(r.frozen, true);
  assert.equal(c.written.length, 11, '11 条内线全部同步平移');
  assert.ok(c.written.every(([, , v]) => Number.isFinite(v)), '平移量必须都是有限数');
  const shifted = c.written.map((w) => +w[2].toFixed(3));
  for (let i = 1; i < shifted.length; i++) {
    assert.ok(Math.abs((shifted[i] - shifted[i - 1]) - 60) < 1e-6, '相邻内线间距保持 60m');
  }
});
