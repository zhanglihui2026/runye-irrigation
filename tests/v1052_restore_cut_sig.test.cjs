#!/usr/bin/env node
'use strict';
/* tests/v1052_restore_cut_sig.test.cjs —— 恢复链分区切割签名校验锁（数据唯一性）
 *
 * 用户实测（2026-11-13）：滴灌带纵向敷设、主管/支管竖直与滴灌带平行、方向报告还是
 * 旧布局的「30 个分区带长超单边铺设长度」、支管总米数对不上当前分区——
 * 画布上滴灌带/分区标签是实时几何，管线却是 v355 恢复链盖回来的旧分区布局存档。
 * 根因：v355 恢复签名只锚边界多边形，改了分区参数（分区数/角度/切割线/末排并入）
 * 边界没变 ⇒ 旧管线照样恢复。
 *
 * 用户拍板（v1051「数据唯一性」延续）：管线必须与当前分区切割同代；不同代宁可清空
 * 让用户点「生成施工图」，也不许异代数据同图。
 * 锁四件事：
 *   ① 管线生成时必须记录分区切割签名（两条成功路径 + ppGenerate 的 v355 记签）；
 *   ② 快照必须带 ppGenCutSig，恢复链必须做异代校验并清空过期管线；
 *   ③ 画布必须对过时管线常驻警示（右上，避开 v251 左上像素禁区）；
 *   ④ 生成时签名必须挂在 ppCurrentCutSignature 单一出口（含角度与末排并入）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const pe = fs.readFileSync(path.join(ROOT, 'mod', 'plot-editor.js'), 'utf8');
const i12 = fs.readFileSync(path.join(ROOT, 'mod', 'inline-12.js'), 'utf8');

test('① 管线生成成功必须记录分区切割签名（整组/单块两条路径 + v355 记签）', () => {
  const auto = pe.slice(pe.indexOf('function ppAutoGeneratePipes()'), pe.indexOf('function ppRepartitionDesign'));
  const hits = auto.match(/ppState\.__ppGenCutSig=ppCurrentCutSignature\(\);/g) || [];
  assert.ok(hits.length >= 2, 'ppAutoGeneratePipes 的整组与单块两条成功路径都必须写 __ppGenCutSig（实际 ' + hits.length + ' 处）');
  const gen = pe.slice(pe.indexOf("getElementById('ppGenerate')"), pe.indexOf("getElementById('ppDownload')"));
  assert.match(gen, /window\.__ryPpGenCutSig=ppState\.__ppGenCutSig\|\|ppCurrentCutSignature\(\)\|\|null/,
    'ppGenerate 成功后 v355 记签必须带上切割签名');
});

test('② 恢复链必须校验切割签名：异代清空管线，快照必须带 ppGenCutSig', () => {
  const save = i12.slice(i12.indexOf('ppGenSig:'), i12.indexOf('ppGenSig:') + 600);
  assert.match(save, /ppGenCutSig:\(!_groupActive&&window\.__ryPpGenCutSig\)\?window\.__ryPpGenCutSig:null/,
    'runyeSaveProject 快照必须带 ppGenCutSig');
  const restore = i12.slice(i12.indexOf('function ryPpGenRestoreProject()'), i12.indexOf('function ryPpGenRestoreProject()') + 4200);
  assert.match(restore, /snap\.ppGenCutSig\s*&&\s*snap\.ppGenCutSig!==_curSig/,
    '恢复链必须比较快照切割签名与现算签名');
  assert.match(restore, /window\.ppState\.mainPipes=\[\]/, '异代时必须清空旧主管');
  assert.match(restore, /window\.ppState\.couplerNodes=\[\]/, '异代时必须清空接驳节点');
  assert.match(restore, /分区参数已变化，旧管线已清空/, '异代清空必须 toast 让用户看见并指引重新生成');
  assert.match(i12, /window\.__ryPpGenCutSig=null/, '切地块时切割签名必须随边界签名一起清');
});

test('③ 画布必须对过时管线常驻右上警示（避开 v251 左上像素禁区）', () => {
  const render = pe.slice(pe.indexOf('function ppRender()'), pe.indexOf('var ppRenderBase=ppRender'));
  assert.match(render, /管线为旧分区布局生成，与当前分区不一致/, '过时警示文案必须在场');
  assert.match(render, /ppState\.__ppGenCutSig/, '警示判定必须读生成时签名');
  assert.match(render, /ppCurrentCutSignature\(\)/, '警示判定必须与现算签名比对');
  assert.ok(render.indexOf('ppCanvas.width-w-14') > -1, '警示画在画布右上');
});

test('④ 分区切割签名单一出口：含角度与末排并入，挂 window 供恢复链调用', () => {
  assert.match(pe, /window\.ppCurrentCutSignature=ppCurrentCutSignature/, '必须挂 window');
  const sig = pe.slice(pe.indexOf('function ppCurrentCutSignature()'), pe.indexOf('function ppGetZoneCutSignature'));
  assert.match(sig, /ppGetZoneCutSignature\(b,ppGetZoneLayout\(b,n\)\)/, '签名必须走 ppGetZoneCutSignature 单一口径');
  const inner = pe.slice(pe.indexOf('function ppGetZoneCutSignature('), pe.indexOf('function ppGetZoneCuts('));
  assert.match(inner, /\|a'\+ppZoneAngle\(\)\.toFixed\(3\)/, '签名必须含分区角度');
  assert.match(inner, /ppZoneMergeLastOn\(\)/, '签名必须含末排并入开关');
  assert.match(pe, /genCutSig:ppState\.__ppGenCutSig\|\|null/, 'ppGetState 必须导出 genCutSig');
  assert.match(pe, /ppState\.__ppGenCutSig=\(typeof saved\.genCutSig==='string'&&saved\.genCutSig\)\?saved\.genCutSig:null/,
    'ppSetState 必须回填 genCutSig（旧存档自然回退 null）');
});
