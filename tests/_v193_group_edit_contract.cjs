/* Current shared-canvas group editing and canonical model contract. */
'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const GROUP_ADAPTER = fs.readFileSync(path.join(ROOT, 'core', 'drawing-design-group-adapter.js'), 'utf8');
const SNAPSHOT_ADAPTER = fs.readFileSync(path.join(ROOT, 'mod', 'inline-29.js'), 'utf8');

module.exports = function sharedCanvasGroupContracts(INDEX_SRC, helpers) {
  const { bodyOf } = helpers;

  ['ppGroupEditWrap', 'ppGeWhole', 'ppGePerPlot', 'ppGePlotSel', 'ppPlotWorkflow']
    .forEach(function (id) {
      assert.ok(INDEX_SRC.indexOf('id="' + id + '"') > 0, '共享绘图区应保留 #' + id);
    });

  assert.match(INDEX_SRC, /function ppInitGroupEdit\(/, '应初始化当前组编辑状态');
  assert.match(INDEX_SRC, /function ppGroupActiveSubs\(/, '整组/逐块模式应统一选择成员几何');
  assert.match(INDEX_SRC, /function ppSetGroupMode\(/, '模式切换应由单一状态入口处理');
  assert.match(INDEX_SRC, /function ppSelectGroupPlot\(/, '逐块成员应支持明确选择');
  assert.match(INDEX_SRC, /function ppGroupEditBlocks\(/, '整组只读视图应拦截块级编辑');

  assert.match(bodyOf(INDEX_SRC, 'ppGroupActiveSubs'), /ge\.mode==='perPlot'/,
    '逐块模式只向下游提供当前成员');
  assert.match(bodyOf(INDEX_SRC, 'ppGetSubPlotRings'), /ppGroupActiveSubs\(\)/,
    '绘图、面积和点位计算应从当前规范成员选择读取几何');
  assert.match(bodyOf(INDEX_SRC, 'ppSetGroupMode'), /ppReadGroupMemberSlot\(/,
    '切换到逐块模式前应从规范模型读取成员槽');
  assert.match(bodyOf(INDEX_SRC, 'ppSetGroupMode'), /ppSaveGroupMemberSlot\(/,
    '切回整组前应提交当前成员编辑');
  assert.match(bodyOf(INDEX_SRC, 'ppSelectGroupPlot'), /ppSaveGroupMemberSlot\(/,
    '切换成员前应提交当前成员编辑');
  assert.match(bodyOf(INDEX_SRC, 'ppGroupEditBlocks'), /ge\.mode!=='whole'/,
    '只有整组模式拦截块级编辑');

  assert.match(GROUP_ADAPTER, /function toLegacyMemberSlot\(/,
    '规范组适配器应按组与成员身份投影兼容成员槽');
  assert.match(SNAPSHOT_ADAPTER, /grCommitGroupMemberSlots/,
    '成员槽写入应经过规范组事务桥');
  assert.match(SNAPSHOT_ADAPTER, /canonicalDrawingDesign/,
    '组快照应持久化规范绘图模型');
  assert.match(SNAPSHOT_ADAPTER, /canonical-group-roundtrip-mismatch/,
    '恢复与导出发现规范模型和兼容投影分歧时必须失败关闭');

  const diagram = bodyOf(INDEX_SRC, 'ppGenerateDiagram');
  assert.match(diagram, /ppCollectGroupAllPipes\(/,
    '逐块态生成施工图应汇总全部成员管线');
  assert.match(diagram, /finally[\s\S]*ppApplySlot\(back\)/,
    '总图生成完成或失败后都应恢复活动成员编辑态');
};
