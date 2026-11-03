'use strict';
/* zero_angle_frame_lock.test.cjs — v865「0° 也走格系统一变换」防回退静态锁。
 *
 * 背景（plot-editor ppBuildAutoPipes [v865] 注释）：旧代码 0° 时不把 ppState.polyPts
 * 换成格系环（条件 Math.abs(angle)>0.001），格系管线被拿去裁世界系环，
 * 地块 min 角不在原点时两系错开 ⇒ 管线全空（静默，无报错）。
 * v865 修复 = 无条件走 frame 变换（0° 的 frame 是纯平移+缩放，toGrid/toWorld 互逆）。
 * 该缺陷「未触发时无声」，一旦有人把条件加回去也不会报错 —— 用静态锁钉住。
 * 同族：readPoint 空位坐标防御已有 trunk_schema_v2.test ⑮ 锁，此处不重复。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'mod', 'plot-editor.js'), 'utf8');

test('v865 锁①：ppBuildAutoPipes 的 frame 变换无角度条件（0° 也换格系环）', () => {
  const i = src.indexOf('function ppBuildAutoPipes(');
  assert.ok(i > 0, 'ppBuildAutoPipes 存在');
  const body = src.slice(i, i + 4000);
  // 修复本体：拿到 frame 后无条件把 polyPts 换成格系环
  assert.ok(
    /if\(frame\)\{\s*ppState\.polyPts=frame\.poly\.map/.test(body),
    'ppState.polyPts=frame.poly(...) 必须在 if(frame){} 内且无角度前置条件'
  );
});

test('v865 锁②：旧缺陷条件 Math.abs(angle)>0.001 不得回归到 ppBuildAutoPipes 代码', () => {
  const i = src.indexOf('function ppBuildAutoPipes(');
  const body = src.slice(i, i + 4000);
  /* v865 注释里引用了旧条件原文 —— 剥掉注释只查可执行代码 */
  const code = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.ok(
    !code.includes('Math.abs(angle)>0.001'),
    '0° 跳过格系变换的旧条件不得回到 ppBuildAutoPipes 代码（会复活「0°+原点偏移 ⇒ 管线全空」）'
  );
});

test('v865 锁③：裁剪环=格系环（ppPipeClipPoly 取 ppState.polyPts 而非外部世界环）', () => {
  const i = src.indexOf('function ppBuildAutoPipes(');
  const body = src.slice(i, i + 6000);
  assert.ok(
    /var ppPipeClipPoly = ppState\.polyPts;/.test(body),
    '裁剪环必须与管坐标同系（格系）——这是 v865 修复的核心不变量'
  );
});
