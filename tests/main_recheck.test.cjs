/* ============================================================================
   主管共享段复核（v976）测试
   ----------------------------------------------------------------------------
   用户 2026-11-05 拍板：「7区水流过来的时候，一定是有一部分管道之前是给到6区的，
   6、7区共用的管道应该取大的计算值，以此类推」——后台自动复核、无开关无额外操作。

   背景（用户截图实测，联合灌溉组 G6/G7/G11/G12，主管试算长 538.0 m 全区相同）：
     6区  Q=109.03  距 Ø200 档分界 110.46 差 1.43 ⇒ 被钉 Ø180，主管损失 7.48，扬程 42.33
     7区  Q=111.69  刚过分界 ⇒ Ø200，主管损失 4.68，扬程 39.44   ← 路径更远扬程反而低
     11区 Q=68.03   距 Ø160 档分界 68.50 差 0.47 ⇒ 被钉 Ø140，主管损失 10.62，扬程 43.59
     12区 Q=70.48   刚过分界 ⇒ Ø160，扬程 38.56                   ← 同上

   修复：估算路径主管档位 = max(本区档, 全项目最大区流量复核档)。
   本测试两部分：
     ① 静态锁：inline-09 有复核块、map-flow-demo 卡片文案同步；
     ② 数值锁：用真实 RyDesignCore（selectPipe/hazen）复算四区场景 ——
        旧行为必现反超（锁住 bug 的存在性），新行为必须消除反超。
   用法：node tests/main_recheck.test.cjs   exit 0=全过
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('assert');

const WS = path.join(__dirname, '..');
const inline09 = fs.readFileSync(path.join(WS, 'mod', 'inline-09.js'), 'utf8');
const mapDemo = fs.readFileSync(path.join(WS, 'mod', 'map-flow-demo.js'), 'utf8');
const DesignCore = require(path.join(WS, 'hydraulic-calc', 'design-core.js'));

const SDR = 13.6;
const PE_OD_SERIES = [50, 63, 75, 90, 110, 125, 140, 160, 180, 200, 225, 250, 280, 315, 355, 400, 450, 500];
const MAIN_PIPE_MIN_OD = 90;
const TARGET_V = 1.5;
const MAIN_LEN = 538.0;   // 卡片实测：主管试算长全区相同

function selectPipe(Q) {
  return DesignCore.selectPipe(Q, TARGET_V, PE_OD_SERIES, SDR, MAIN_PIPE_MIN_OD, Infinity);
}
function hazen(L, Q, od) {
  return DesignCore.hazen(L, Q, DesignCore.inner(od, SDR), 140); // C=140 与 inline-09 C_HAZEN 同口径
}

/* ① 静态锁 */
test('① inline-09 估算路径有主管共享段复核块', () => {
  assert.ok(/主管共享段复核（用户 2026-11-05 拍板，后台自动执行、\*\*无开关无额外操作\*\*）/.test(inline09),
    '复核块注释要在');
  assert.ok(/var mainRecheckPick = \(qMaxAll > 0\) \? selectPipe\(Math\.max\(qMaxAll, 0\.01\), r\.targetV, MAIN_PIPE_MIN_OD\) : null;/.test(inline09),
    '复核档 = 按全项目最大区流量现选一档');
  assert.ok(/if \(mainRecheckPick && \(!mp \|\| mainRecheckPick\.od > mp\.od\)\) mp = mainRecheckPick;/.test(inline09),
    '各区主管统一取 本区档 与 复核档 的较大者');
  assert.ok(/mainRecheck: mainRecheckPick \? \{ od: mainRecheckPick\.od, flow: qMaxAll \} : null/.test(inline09),
    '返回结构要带 mainRecheck（卡片口径行自证用）');
});

test('② map-flow-demo 卡片口径说明点名最不利点（v977 列表版式）', () => {
  assert.ok(/主管按最大区复核取大/.test(mapDemo), '口径说明要写明主管是复核取大');
  assert.ok(/总管按最不利点 <b class="mfg-king-flow">/.test(mapDemo), '口径说明要点名最不利组（v979 流量王蓝字）');
  assert.ok(/TA.sharedGroupIndex===g/.test(mapDemo), '本组即最不利点要有高亮分支');
  assert.ok(/mfg-seg/.test(mapDemo), '卡片要有管径/长度/流速三行列表');
});

/* ③ 数值锁：复算用户截图的四区场景 */
test('③ 旧行为必现反超（bug 存在性锁：改动若被回退这里先红）', () => {
  // 旧：各区主管按本区流量就近选档
  const q6 = 109.03, q7 = 111.69;
  const old6 = selectPipe(q6), old7 = selectPipe(q7);
  assert.equal(old6.od, 180, '6区 109.03 就近选档 = Ø180（距 Ø200 分界差 1.43）');
  assert.equal(old7.od, 200, '7区 111.69 就近选档 = Ø200');
  const loss6 = hazen(MAIN_LEN, q6, old6.od), loss7 = hazen(MAIN_LEN, q7, old7.od);
  assert.ok(loss6 > loss7, '旧规则下 6区主管损失(' + loss6.toFixed(2) + ') 反超 7区(' + loss7.toFixed(2) + ')——这正是用户看到的问题');
});

test('④ 新行为：主管按共享复核取大后，反超消除', () => {
  const flows = [109.03, 111.69, 68.03, 70.48];   // 6/7/11/12 区
  const qMaxAll = Math.max.apply(null, flows);
  const recheck = selectPipe(qMaxAll);
  assert.equal(recheck.od, 200, '复核档 = 最大区流量 111.69 → Ø200');
  // 各区主管档 = max(本区档, 复核档) ⇒ 四区全部 Ø200，损失只随流量单调
  const losses = flows.map(q => hazen(MAIN_LEN, q, Math.max(selectPipe(q).od, recheck.od)));
  assert.deepEqual(flows.map(q => Math.max(selectPipe(q).od, recheck.od)), [200, 200, 200, 200],
    '四区主管统一 Ø200');
  for (let i = 1; i < losses.length; i++) {
    if (flows[i] > flows[i - 1]) assert.ok(losses[i] > losses[i - 1],
      '流量更大的区主管损失必须更大（单调，无反超）');
  }
  // 与用户截图对账：6区新主管损失 ≈ 7区同口径按 109.03 算，扬程应低于 7区
  const loss6new = hazen(MAIN_LEN, 109.03, 200), loss7new = hazen(MAIN_LEN, 111.69, 200);
  assert.ok(loss6new < loss7new, '6区(' + loss6new.toFixed(2) + ') < 7区(' + loss7new.toFixed(2) + ')，扬程反序消除');
});
