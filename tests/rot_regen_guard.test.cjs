'use strict';
/* tests/rot_regen_guard.test.cjs —— [v892] 旋转角度后「生成施工图管线消失」防御锁
 *
 * 用户报：从在线地图进分区与管路页能看到管线，旋转分区角度后点「生成施工图」管线消失。
 * 本地探针（矩形/不规则/30°/90°/分区模式/手动编辑/存档恢复 7 轮）未能复现数据层丢失，
 * 但确认两条真实缺陷并堵死：
 *   ① ppAutoGeneratePipes 重建产物为空时（如旋转角度下裁剪异常把管线裁光），
 *      旧代码会静默应用空结果 ⇒ 画布管线凭空消失。现在：视为失败，保留原管线 + 显式 alert。
 *   ② __runyeSingleL2CommitFailure 不在入口重置 ⇒ canonical 桥之外的失败沿用上轮旧原因，
 *      alert 文案误导归因（探针实录：恒为兜底文案「布管或设计提交失败」）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'mod', 'plot-editor.js'), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const live = strip(src);

test('① 空结果保护：重建一根不剩时按失败处理，保留原管线', () => {
  assert.ok(live.includes('var prevMainCount=(ppState.mainPipes||[]).length;'),
    '重建前必须记录原主管数量');
  assert.ok(live.includes("if(!r2.main.length && !r2.branch.length && prevMainCount>0)"),
    '空结果守卫必须存在（主/支管全空且原有管线非零）');
  /* 守卫内必须回滚历史 + 恢复前像 + 显式 alert + return false */
  const guardPos = live.indexOf("if(!r2.main.length && !r2.branch.length && prevMainCount>0)");
  const guardSeg = live.slice(guardPos, guardPos + 900);
  assert.ok(guardSeg.includes('ppDiscardLatestHistoryEntry()'), '必须丢弃本次历史');
  assert.ok(guardSeg.includes('ppApplySlot(singlePreimage)'), '必须恢复前像');
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

test('④ alert 文案必须可行动：告知已保留原管线并指向调整角度', () => {
  assert.ok(live.includes('重建管线结果为空（可能被地块裁剪全部丢弃）。已保留原管线与画面'),
    '空结果 alert 必须说明现象与保留动作');
});
