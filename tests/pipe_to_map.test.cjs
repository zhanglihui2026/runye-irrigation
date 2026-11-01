#!/usr/bin/env node
'use strict';
/* tests/pipe_to_map.test.cjs —— [v871] 双生成按钮语义区分静态锁
 *
 * 用户拍板（2026-11-01）：分区与管路页两个生成入口必须区分开 ——
 *   ① 「生成施工图」(#ppGenerate)：旋转分区角度后**本页**重新生成主管/支管
 *      （plot-editor 处理器内链 tlAutoGenerate({scroll:false})，v104 既有行为，不许回退）；
 *   ② 「生成并回传地图」(#tlAutoPipe)：重新生成三级管线 + 成功后**自动切到在线地图**
 *      并刷新轮灌演示（tlAutoPipeToMap，v871 新增）。
 * 锁三件事：按钮接线/文案、包装函数的成败判定与跳页、①的内链不许丢。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const i09 = fs.readFileSync(path.join(ROOT, 'mod', 'inline-09.js'), 'utf8');
const pe = fs.readFileSync(path.join(ROOT, 'mod', 'plot-editor.js'), 'utf8');

test('① #tlAutoPipe 接线 tlAutoPipeToMap + 文案「生成并回传地图」', () => {
  const m = html.match(/<button[^>]*id="tlAutoPipe"[^>]*>([\s\S]*?)<\/button>/);
  assert.ok(m, '#tlAutoPipe 必须存在');
  assert.match(m[0], /onclick="tlAutoPipeToMap\(\)"/, 'onclick 必须是 tlAutoPipeToMap()（不再是裸 tlAutoGenerate）');
  assert.match(m[1], /生成并回传地图/, '按钮文案必须与「生成施工图」可区分');
});

test('② tlAutoPipeToMap：generatedAt 判成败 + 跳在线地图 + 刷新演示', () => {
  assert.match(i09, /function tlAutoPipeToMap\(\)/, '包装函数必须定义');
  assert.match(i09, /window\.tlAutoPipeToMap = tlAutoPipeToMap/, '必须挂 window（onclick 依赖全局）');
  assert.match(i09, /tlAutoGenerate\(\{ scroll: false \}\)/, '内部必须走 tlAutoGenerate({scroll:false})');
  assert.match(i09, /dd\.generatedAt !== before/, '必须用 generatedAt 前后对比判定生成是否落地');
  assert.match(i09, /onlineMapSection/, '必须跳 onlineMapSection');
  assert.match(i09, /RyMapFlowDemo[\s\S]{0,40}refresh/, '跳转后必须刷新轮灌演示');
});

test('③ 「生成施工图」内链三级重生成不许回退（旋转角度后主管/支管随点随新）', () => {
  const seg = pe.slice(pe.indexOf("getElementById('ppGenerate')"));
  assert.match(seg, /ppGenerateDiagram\(\{scroll:false\}\)/, '二级图面生成必须在场');
  assert.match(seg, /tlAutoGenerate\(\{scroll:false\}\)/, '三级管线内链重生成必须在场（v104 行为）');
  assert.match(seg, /tlShowWorkspace/, '生成后落三级管路编辑视图必须在场');
});
