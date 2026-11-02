'use strict';
/* [v898 2026-11-02] slot 捕获清单与规范提交检测清单的同步锁。
   plot-editor.js 有两张字段清单：
     · PP_SLOT_KEYS（~971）：ppCaptureSlot/ppApplySlot 的**捕获完整性**清单——
       成员 slot 存什么（含 mergePreview 瞬态预览，v898 评估定案保留）；
     · designKeys（~130）：ppCommitSinglePlotEdit 的**提交触发变化检测**清单——
       哪些字段变了才走 ryCommitSinglePlotL2Snapshot（不含 mergePreview：
       预览变化不该触发 canonical 提交，v898 评估定案）。
   两张清单覆盖的设计字段必须一致（仅 mergePreview 一键单侧差异）：
   新增设计字段只加一边 ⇒ 要么 slot 丢字段（恢复后设计缺失），要么字段变了不触发提交
   （canonical 静默落后于画布——正是双轨时代「总会有 bug」的那类病灶）。 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const peSrc = fs.readFileSync(path.join(ROOT, 'mod', 'plot-editor.js'), 'utf8');

function extractList(name) {
  const re = new RegExp('var ' + name + '=\\[([^\\]]+)\\]');
  const m = peSrc.match(re);
  assert.ok(m, 'plot-editor.js 必须存在 var ' + name + '=[...] 清单定义');
  return m[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
}

test('[v898] PP_SLOT_KEYS 与 designKeys 的设计字段必须同步（防漂移）', () => {
  const slotKeys = extractList('PP_SLOT_KEYS');
  const designKeys = extractList('designKeys');
  assert.ok(slotKeys.length >= 15, 'PP_SLOT_KEYS 字段数异常：' + slotKeys.length);
  assert.ok(designKeys.length >= 15, 'designKeys 字段数异常：' + designKeys.length);
  const slotSet = new Set(slotKeys);
  const missingInSlot = designKeys.filter(k => !slotSet.has(k));
  assert.deepStrictEqual(missingInSlot, [],
    'designKeys 里有字段不在 PP_SLOT_KEYS：' + missingInSlot.join(',') +
    ' —— 新设计字段必须同时进两张清单，否则 slot 捕获丢字段');
});

test('[v898] mergePreview 的单侧语义必须保持（进 slot 捕获、不进提交触发）', () => {
  const slotKeys = extractList('PP_SLOT_KEYS');
  const designKeys = extractList('designKeys');
  assert.ok(slotKeys.includes('mergePreview'), 'mergePreview 必须留在 PP_SLOT_KEYS（v898 评估定案：捕获一致性）');
  assert.ok(!designKeys.includes('mergePreview'),
    'mergePreview 不得进 designKeys——预览标志变化不该触发 canonical 提交（CAS 会把瞬态预览当设计变更）');
});
