'use strict';
/* tests/rot_regen_guard.test.cjs —— [v892] 旋转角度后「生成施工图管线消失」防御锁
 *                            [v1057 M13 反转] 失败不显旧版（主线任务拍板）
 *
 * v892 原拍板：重建产物为空时保留原管线 + 显式 alert（防「凭空消失」恐慌）。
 * M13 2026-11-13 主线拍板反转：「刷新失败时不得继续显示旧版管线或旧版标注」——
 *   旧管线对应旧分区几何，叠在新分区图上正是「新旧两版管线叠在一起」的来源之一。
 *   现口径：空结果守卫仍按失败处理（丢弃历史 + 显式 alert + return false），
 *   但**不再回滚前像**——分区参数保持用户刚调整的新值，自动管线（主管/支管/
 *   一级管/阀门/接驳节点）清空，图面只留新分区，提示明示「旧版管线已移除」。
 *   ② canonical 提交顺序守卫与 ③ 失败原因入口重置不受反转影响，保持原锁。 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'mod', 'plot-editor.js'), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const live = strip(src);

test('① 空结果保护：重建一根不剩时按失败处理，清空自动管线（v1057 M13 反转）', () => {
  assert.ok(live.includes('var prevMainCount=(ppState.mainPipes||[]).length;'),
    '重建前必须记录原主管数量');
  assert.ok(live.includes("if(!r2.main.length && !r2.branch.length && prevMainCount>0)"),
    '空结果守卫必须存在（主/支管全空且原有管线非零）');
  /* 守卫内必须丢弃历史 + 清空自动管线 + 显式 alert + return false */
  const guardPos = live.indexOf("if(!r2.main.length && !r2.branch.length && prevMainCount>0)");
  const guardSeg = live.slice(guardPos, guardPos + 900);
  assert.ok(guardSeg.includes('ppDiscardLatestHistoryEntry()'), '必须丢弃本次历史');
  assert.ok(guardSeg.includes('ppState.mainPipes=[];ppState.branchPipes=[];ppState.subBranchPipes=[];'),
    '必须清空自动管线（M13：失败不显旧版）');
  assert.ok(guardSeg.includes('ppState.valves=[];ppState.couplerNodes=[];'),
    '阀门与接驳节点一并清空');
  assert.ok(!guardSeg.includes('ppApplySlot(singlePreimage)'), '不得再回滚前像（分区保持新值）');
  assert.ok(guardSeg.includes('return false'), '必须按失败返回');
});

test('② 空结果保护必须在 canonical 提交之前（不能先把空结果写进规范模型）', () => {
  const guardPos = live.indexOf("if(!r2.main.length && !r2.branch.length && prevMainCount>0)");
  const commitPos = live.indexOf("ryCommitSinglePlotL2Snapshot(singlePreimage,window.ppGetState())", guardPos);
  assert.ok(commitPos > guardPos, '空结果守卫必须先于规范事务提交执行');
});

test('③ 失败原因入口重置：ppAutoGeneratePipes 开头清 __runyeSingleL2CommitFailure', () => {
  const fnPos = live.indexOf('function ppAutoGeneratePipes()');
  const resetPos = live.indexOf('window.__runyeSingleL2CommitFailure=null;', fnPos);
  assert.ok(fnPos > -1 && resetPos > fnPos,
    '入口必须重置失败原因，alert 不再沿用上轮旧值误导归因');
});

test('④ alert 文案必须可行动：明示旧版管线已移除并指向调整参数（v1057 M13 反转）', () => {
  assert.ok(live.includes('重建结果为空（可能被地块裁剪全部丢弃），旧版管线已移除以免误导'),
    '空结果 alert 必须说明现象与清空动作');
  assert.ok(!live.includes('已保留原管线与画面'), 'v892 旧文案（保留原管线）必须退役');
});

test('⑤ 自动重算失败分支同样清空旧版管线 + 签名置空（v1057 M13）', () => {
  const autoPos = live.indexOf("if(!ppAutoGeneratePipes()){");
  assert.ok(autoPos > -1, '自动重算失败分支存在');
  const autoSeg = live.slice(autoPos, autoPos + 900);
  assert.ok(autoSeg.includes('ppAutoRegenFailSig=cur;'), '失败冷却保留');
  assert.ok(autoSeg.includes('ppState.mainPipes=[];ppState.branchPipes=[];ppState.subBranchPipes=[];'),
    '失败分支清空自动管线');
  assert.ok(autoSeg.includes('ppState.__ppGenCutSig=null;window.__ryPpGenCutSig=null;'),
    '生成签名一并置空');
  assert.ok(autoSeg.includes('旧版管线已移除，请调整分区参数后重试'), '提示明示清空动作');
});
