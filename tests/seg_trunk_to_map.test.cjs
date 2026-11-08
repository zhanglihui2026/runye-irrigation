#!/usr/bin/env node
'use strict';
/* tests/seg_trunk_to_map.test.cjs —— 段总管反投在线地图（v878-seg-trunk-map）静态锁
 *
 * 用户要求（2026-11-02）：分区与管路自动生成的段总管（v859 分区主管串联干线）
 * 必须传递给在线地图。此前它只进 tlDiagramData.segTrunk（轮灌演示播放时临时画、
 * 停止即清；地图页只拿 couplers 做驳接点捕捉），常驻管网叠加层没有它。
 *
 * 锁三件事：
 *   ① inline-09 管网反投块必须把 dd.segTrunk 投成 kind:'segTrunk' 段（id/name/dn/latLng）；
 *   ② runye-map-enhance 的 front 抑制（v841）不得误伤 'segTrunk' —— 手绘总管
 *      （水源→驳接点）与段总管（驳接点串联干线）是互补两段，必须同时显示；
 *   ③ trunk-panel 联合复核必须把 'segTrunk' 归入 front 桶跳过 —— 段总管长度已折进
 *      frontLenUsed（v859 口径），再计入下游合计就是 v842 式双重计数。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const i09 = fs.readFileSync(path.join(ROOT, 'mod', 'inline-09.js'), 'utf8');
const enhance = fs.readFileSync(path.join(ROOT, 'runye-map-enhance.js'), 'utf8');
const panel = fs.readFileSync(path.join(ROOT, 'mod', 'trunk-panel.js'), 'utf8');

test('① 分区施工图必须向在线地图回传自动段总管', () => {
  /* [v1017] 契约随用户拍板恢复段总管链而反转（v900 误删 → 恢复，v878 原口径）：
     反投块必须把 dd.segTrunk 投成 kind:'segTrunk' 段；快照 segTrunk 由生成 IIFE 落地
     （不再恒 null）。手绘总管（地图）与段总管（干线）是互补两段。 */
  const block = i09.slice(i09.indexOf('[map-enhance] 管网反投卫星图'));
  assert.ok(block.length > 0, '反投块必须存在');
  assert.match(block, /segments\.push\(\{id:'segTrunk'/, 'segTrunk 段必须反投在线地图');
  assert.match(i09, /segTrunk: \(function\(\)\{/, '快照 segTrunk 必须由生成 IIFE 落地');
  assert.match(i09, /tlSegTrunkLoc = window\.RySegTrunk\.build\(mainPipes/, '段总管生成必须在场');
});

test('② renderNetwork 的 front 抑制不误伤 segTrunk（通用循环照画+弹窗）', () => {
  const fn = enhance.slice(enhance.indexOf('function renderNetwork('));
  assert.ok(fn.length > 0, 'renderNetwork 必须存在');
  assert.match(fn, /var suppressFront = mapTrunkExistsFor\(net\.plotId\);/, 'v841 抑制开关在场');
  assert.match(fn, /var isTrunk = \(s\.kind === 'front'\)/, 'isTrunk 判定只认 front');
  const isTrunkLine = fn.slice(fn.indexOf('var isTrunk ='), fn.indexOf(';', fn.indexOf('var isTrunk =')));
  assert.doesNotMatch(isTrunkLine, /segTrunk/, 'isTrunk 不得包含 segTrunk（否则手绘总管在场时段总管被整段吞掉）');
});

test("③ trunk-panel 联合复核把 segTrunk 归入 front 桶跳过（防 v842 式双重计数）", () => {
  assert.match(panel, /if \(k === 'front' \|\| k === 'segTrunk'\) return 'front';/,
    'kindOf 必须把 segTrunk 与 front 同桶（设计侧长度已折进 frontLenUsed）');
  assert.match(panel, /if \(k === 'front'\) continue;/, 'front 桶在下游合计里整段跳过');
});
