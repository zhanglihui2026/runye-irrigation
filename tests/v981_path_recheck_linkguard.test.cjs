'use strict';
/* tests/v981_path_recheck_linkguard.test.cjs —— 决策点②③落地锁
 *
 * ② 联动防覆盖（用户 2026-11-05 拍板）：三级字段被用户手改后（dataset.ryDirty=1），
 *   二级联动（syncThreeLevelFromPlan→setv）不得悄悄覆盖；「↻ 同步」按钮改为
 *   tlForceSyncFromPlan（先清脏再全量同步）= 用户主动要求覆盖；三级复位清脏。
 * ③ 路径模式补 v976 主管复核：v976 只加在估算链（tlEstimateGroupHead），有段总管时
 *   路径链主管口径直接吃设计侧 r.mainPipe.od，复核缺席。补齐后两条链语义一致：
 *   mainOdEff = max(设计侧档, 复核档)，复核档 = 全部分区最大区流量现选；
 *   返回对象补 pipes/lengths/lengthSource（figure 实长），v977 卡片三行表两条链都能渲染。
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const inline09 = fs.readFileSync(path.join(ROOT, 'mod', 'inline-09.js'), 'utf8');
const inline33 = fs.readFileSync(path.join(ROOT, 'mod', 'inline-33.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

/* ---------- ② 联动防覆盖 ---------- */

test('[v981②] setv 遇 ryDirty 跳过——联动不再覆盖手改值', () => {
  const i = inline09.indexOf('function setv(id, v)');
  assert.ok(i > 0, 'syncThreeLevelFromPlan.setv 必须存在');
  const blk = inline09.slice(i, inline09.indexOf('}', inline09.indexOf('ryDirty', i)));
  assert.ok(blk.includes("el.dataset.ryDirty === '1'"), 'setv 必须先查脏标记再赋值');
  const checkAt = blk.indexOf('ryDirty');
  const setAt = blk.indexOf('el.value = v');
  assert.ok(checkAt < setAt, '先判脏后赋值，顺序不能反');
});

test('[v981②] inline-33 打脏/清脏/强制同步三件套', () => {
  assert.ok(/markDirty\(t\)[\s\S]{0,200}indexOf\('tl_'\) === 0/.test(inline33),
    '只给三级字段打脏标记');
  assert.ok(inline33.includes("t.dataset.ryDirty = '1'"), '脏标记写 dataset');
  const force = inline33.indexOf('window.tlForceSyncFromPlan');
  assert.ok(force > 0, 'tlForceSyncFromPlan 必须导出');
  const blk = inline33.slice(force, inline33.indexOf('};', force));
  const clearAt = blk.indexOf('clearDirty()');
  const syncAt = blk.indexOf('syncThreeLevelFromPlan');
  assert.ok(clearAt > -1 && syncAt > clearAt, '强制同步必须先清脏再联动');
  const resetAt = inline33.indexOf("if (fn === 'resetThreeLevelDefaults') clearDirty();");
  assert.ok(resetAt > force || resetAt > 0, '三级复位必须清脏（复位后联动恢复覆盖权）');
});

test('[v981②] 「↻ 同步」按钮走 tlForceSyncFromPlan 并说明会覆盖手改值', () => {
  assert.ok(html.includes('onclick="tlForceSyncFromPlan()"'), '按钮必须改走强制同步入口');
  assert.ok(html.includes('会覆盖你在三级页手动改过的值'), '按钮提示必须写明覆盖语义');
  assert.ok(!html.includes('onclick="syncThreeLevelFromPlan();renderThreeLevel()'),
    '旧的三连 onclick 必须移除');
});

/* ---------- ③ 路径模式补复核 ---------- */

test('[v981③] 两条链各有一份复核选档（估算 + 路径）', () => {
  const n = (inline09.match(/mainRecheckPick = \(qMaxAll > 0\) \? selectPipe/g) || []).length;
  assert.equal(n, 2, '复核选档必须估算链、路径链各一份');
  const pathAt = inline09.indexOf('mainOdEff');
  assert.ok(pathAt > 0, '路径链必须有 mainOdEff');
  assert.ok(inline09.includes('if (mainRecheckPick && mainRecheckPick.od > mainOdEff) mainOdEff = mainRecheckPick.od;'),
    '实际主管口径 = max(设计档, 复核档)');
  assert.ok(inline09.includes('mainOd: mainOdEff || r.mainPipe.od'),
    '路径水力复算必须吃复核后的口径');
});

test('[v981③] 路径链返回与估算链同构：pipes.mainRecheck + figure 实长 + 逐区流速', () => {
  const retAt = inline09.indexOf('var worstRaw = check.paths[rows.indexOf(worst)]');
  assert.ok(retAt > 0, '必须用最不利路径的图面实长');
  const ret = inline09.slice(retAt, inline09.indexOf('frontLoss: worst.frontLoss', retAt));
  assert.ok(ret.includes('mainRecheck: mainRecheckPick ? { od: mainRecheckPick.od, flow: qMaxAll } : null'),
    'pipes.mainRecheck 必须回传（与估算链同字段）');
  assert.ok(ret.includes("lengthSource: { front: 'figure', main: 'figure', branch: 'figure' }"),
    '路径模式长度来源=figure 实长（卡片不标试算 *）');
  assert.ok(ret.includes('mainV: mainVEff, branchV: branchVEff'), '三行表流速必须回传');
  assert.ok(ret.includes('marginHead: MARGIN_HEAD') && ret.includes('safetyFactor: SAFETY_FACTOR'),
    '富余/安全系数与估算链同口径出卡');
  /* 复核块必须在 downstreamMinOd/sharedOd 之前（先算出 mainOdEff 才能参与口径门限） */
  const brAt = inline09.indexOf('[v981] 决策点③');
  const dsAt = inline09.indexOf('var downstreamMinOd = Math.max(MAIN_PIPE_MIN_OD, mainOdEff', brAt);
  assert.ok(brAt > 0 && dsAt > brAt, '复核块必须先于口径门限计算');
});

test('[v981③] 逐区确认改径仍优先：calibers 入参原样传递', () => {
  const cAt = inline09.indexOf('calibers: r.inversePath.calibers');
  assert.ok(cAt > 0, '路径复算必须继续传 calibers（手动改径不被复核冲掉）');
});
