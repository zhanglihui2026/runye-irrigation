'use strict';
const { isDeepStrictEqual } = require('node:util');

// Shared by the browser runner and negative controls. Missing evidence never passes.
function compareSnapshots(base, current, expectedIds) {
  const diffs = [];
  const cmp = (label, a, b) => {
    if (!isDeepStrictEqual(a, b)) diffs.push(label);
  };
  for (const [label, snapshot] of [['基线', base], ['当前', current]]) {
    if (!snapshot || !snapshot.scenes || !Object.keys(snapshot.scenes).length ||
        !snapshot.styles || !Object.keys(snapshot.styles).length || !Array.isArray(snapshot.errs)) {
      diffs.push(label + '证据不完整');
      continue;
    }
    cmp(label + '场景集合', Object.keys(snapshot.scenes).sort(), [...expectedIds].sort());
    for (const [id, scene] of Object.entries(snapshot.scenes)) {
      if (scene.ERROR || !scene.r || !Object.keys(scene.r).length) diffs.push(label + '场景 ' + id + ' 无有效计算结果');
      if (!scene.vis) diffs.push(label + '场景 ' + id + ' 缺少下载/打印入口证据');
    }
    if (snapshot.errs.some(e => String(e).startsWith('pageerror:'))) diffs.push(label + '存在页面运行异常');
    for (const [id, style] of Object.entries(snapshot.styles)) {
      if (!(style.count > 0) || !style.hash) diffs.push(label + '样式 ' + id + ' 无有效快照');
      if (!style.orderHash) diffs.push(label + '样式 ' + id + ' 缺少元素顺序证据');
    }
  }
  const fields = ['r', 'resultText', 'pipeTablesLen', 'pipeTablesHash', 'planBar', 'tlPlanBar',
    'pp', 'ppLastSvgLen', 'ppLastSvgHash', 'tl', 'materials', 'compare', 'sys', 'fns', 'vis'];
  for (const id of new Set([...expectedIds, ...Object.keys(base?.scenes || {}), ...Object.keys(current?.scenes || {})])) {
    const a = base?.scenes?.[id], b = current?.scenes?.[id];
    if (!a || !b) { diffs.push('场景 ' + id + ' 缺失'); continue; }
    for (const field of fields) {
      if (!Object.hasOwn(a, field) || !Object.hasOwn(b, field)) diffs.push(id + ' 缺少 ' + field);
      else cmp(id + ' ' + field, a[field], b[field]);
    }
  }
  cmp('逐功能区样式及元素顺序', base?.styles, current?.styles);
  const norm = a => (Array.isArray(a) ? a : []).map(e => String(e)
    .replace(/https?:\/\/[^\s'"]+/g, '<URL>').replace(/\b\d{2,}\b/g, '<N>')).sort();
  cmp('页面错误', norm(base?.errs), norm(current?.errs));
  return diffs;
}
module.exports = { compareSnapshots };

if (require.main === module) {
  const assert = require('node:assert/strict');
  const fs = require('node:fs');
  const file = process.argv[2];
  if (!file) throw Error('请传入已采集的当前快照路径');
  const original = JSON.parse(fs.readFileSync(file, 'utf8'));
  const ids = Object.keys(original.scenes);
  assert.deepEqual(compareSnapshots(original, structuredClone(original), ids), [], '正向对照必须通过');
  for (const [name, mutate] of [
    ['数值改变', s => {
      const result = s.scenes[ids[0]].r;
      const key = Object.keys(result).find(k => typeof result[k] === 'number');
      assert.ok(key, '正向快照必须包含可验证的数值');
      result[key] += 1;
    }],
    ['缺失场景', s => { delete s.scenes[ids[0]]; }],
    ['新增场景', s => { s.scenes.extra = structuredClone(s.scenes[ids[0]]); }],
    ['入口显隐改变', s => { s.scenes[ids[0]].vis.ppPrint = '__changed__'; }],
    ['元素顺序改变', s => { s.styles[Object.keys(s.styles)[0]].orderHash = '__changed__'; }],
    ['空证据', s => { s.scenes = {}; s.styles = {}; }],
    ['页面异常', s => { s.errs.push('pageerror: negative control'); }],
  ]) {
    const changed = structuredClone(original); mutate(changed);
    assert.ok(compareSnapshots(original, changed, ids).length, name + '必须检出');
    console.log('PASS: 负向对照检出' + name);
  }
  console.log('PASS: 比较器正向及七项负向对照，原快照未改写');
}
