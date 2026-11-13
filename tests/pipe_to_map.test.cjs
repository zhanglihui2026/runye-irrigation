#!/usr/bin/env node
'use strict';
/* tests/pipe_to_map.test.cjs —— 双生成入口语义区分静态锁
 *
 * 用户拍板（2026-11-01）：分区与管路页两个生成入口必须区分开。
 * 用户拍板（2026-11-13「数据唯一性」）：点「生成施工图」一律清空重算全部
 *   主管/支管/阀门，不再按「布局过时」条件复用旧管线。
 * 用户拍板（2026-11-13 晚「流程顺序」）：「生成施工图」移到三级之后——
 *   ① 二级不再有生成按钮：分区完成后管线自动生成（ppRender 签名比对 → 防抖
 *      自动重算，永远同代）；
 *   ② 三级画完总管等所有信息后点 #tlGenerateDiagram「生成施工图」：刷新简图 +
 *      同步最新成果到在线地图 + 跳在线地图。
 * 锁按钮职责、自动重算与三级定稿动作的分离。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const i09 = fs.readFileSync(path.join(ROOT, 'mod', 'inline-09.js'), 'utf8');
const i12 = fs.readFileSync(path.join(ROOT, 'mod', 'inline-12.js'), 'utf8');
const pe = fs.readFileSync(path.join(ROOT, 'mod', 'plot-editor.js'), 'utf8');

test('① 三级「生成施工图」按钮：定稿 + 同步在线地图（v1054 流程顺序）', () => {
  const m = html.match(/<button[^>]*id="tlGenerateDiagram"[^>]*>([\s\S]*?)<\/button>/);
  assert.ok(m, '#tlGenerateDiagram 必须存在（三级工具栏顶部）');
  assert.match(m[0], /生成施工图/, '按钮文案明确表达定稿职责');
  assert.match(i09, /function tlGenerateDiagramToMap\(\)/, '绑定函数必须定义');
  assert.match(i09, /window\.tlGenerateDiagramToMap=tlGenerateDiagramToMap/, '必须挂 window');
  assert.match(i09, /getElementById\('tlGenerateDiagram'\)[\s\S]{0,120}addEventListener\('click'/, '按钮必须绑定点击');
  assert.match(i09, /tlSyncGeneratedMapSnapshot\(\)!==true/, '定稿必须同步在线地图快照');
  assert.match(i09, /ryJumpToSection\('onlineMapSection'\)|rySetTab\('onlineMapSection'\)/, '成功后跳在线地图');
});

test('② 二级不再有「生成施工图」按钮；ppRunGenerateFlow 解绑保留', () => {
  assert.ok(!html.includes('id="ppGenerate"'), '#ppGenerate 按钮必须已从二级移除（v1054：生成施工图在三级之后）');
  assert.match(pe, /function ppRunGenerateFlow\(\)/, '成组按块分发链保留在 ppRunGenerateFlow（解绑不删）');
  assert.ok(!pe.includes("getElementById('ppGenerate').addEventListener"), '不得再绑 #ppGenerate 点击');
  assert.match(pe, /window\.ppRunGenerateFlow=ppRunGenerateFlow/, '保留函数挂 window 备查');
});

test('③ 分区变化自动重算：ppRender 尾部签名比对 → 防抖调 ppAutoGeneratePipes', () => {
  const render = pe.slice(pe.indexOf('function ppRender()'), pe.indexOf('var ppRenderBase=ppRender'));
  assert.match(render, /ppAutoRegenRunning/, '自动重算必须有重入标志（防 ppAutoGeneratePipes 内部 render 递归）');
  assert.match(render, /clearTimeout\(ppAutoRegenTimer\)/, '必须有防抖');
  assert.match(render, /ppAutoGeneratePipes\(\)/, '防抖到点必须调替换式重算');
  assert.match(render, /if\(gen&&gen===cur\)return;/, '同代不得重算（无谓刷新）');
  assert.match(render, /if\(ge&&ge\.active&&ge\.mode==='perPlot'\)return;/, '三级逐块编辑态不自动重算');
  const auto = pe.slice(pe.indexOf('function ppAutoGeneratePipes()'), pe.indexOf('function ppRepartitionDesign'));
  assert.match(auto, /window\.__ryPpGenCutSig=ppState\.__ppGenCutSig\|\|null/, '两条成功路径必须把签名同步到 window（恢复链消费）');
});

test('④ 自动重算后机制退役与初始管线交接保持（v1051/v1052 延续）', () => {
  const code = pe.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /ppAnglePipeRegenPending/, '角度待重建脏标记已退役，不得复活');
  assert.doesNotMatch(code, /ppMainDirectionOutdated/, '主管方向过时检测已退役——重算职责由自动重算接管');
  assert.doesNotMatch(code, /ppPartitionLayoutOutdated/, '分区布局过时检测已退役——重算职责由自动重算接管');
  assert.match(pe, /ensureInitialPipes:\s*function\(\)[\s\S]*?runye_plot_design_v1:[\s\S]*?ppAutoGeneratePipes\(\)/,
    '地图首次交接仅为没有地块L2档案的初始空地块自动建立管线');
});

test('⑤ 生成快照绑定本次三级图时间戳', () => {
  assert.match(i09, /sourceGeneratedAt:dd\.generatedAt/, '网络投影必须带出tlDiagramData生成时间');
});

test('⑥ 单地块L2规范事务保留地图来源与坐标框架身份', () => {
  const commit = i12.slice(i12.indexOf('window.ryCommitSinglePlotL2Snapshot='), i12.indexOf('function singlePlotCanonical('));
  assert.match(commit, /measuredPolygonSource:sourceRef\.source/, '重导入L2编辑态时不得把地图来源重分类为legacy');
  assert.match(commit, /geoBase:sourceRef\.geoBase\|\|null/, '地图投影基准要从规范preimage保留');
  assert.match(commit, /mapFramePoly:sourceRef\.mapFrameBoundary\|\|null/, '地图坐标边界基准要从规范preimage保留');
  assert.match(commit, /geometryRevision:sourceRef\.geometryRevision/, '地块几何修订身份要从规范preimage保留');
});

test('⑦ 角度重算先刷新分区切线，再提交规范L2状态', () => {
  const angle = pe.slice(pe.indexOf('function ppApplyZoneAngle('), pe.indexOf('function ppGridFrame('));
  assert.ok(angle.indexOf("if(refreshPlan&&typeof updatePlan==='function')updatePlan()") <
    angle.indexOf('window.ryCommitSinglePlotL2Snapshot'),
  '角度引起的partitionCuts/cutSnap变化须在规范事务比较前完成');
  assert.match(angle, /ppCommitGroupMemberEdit\(groupPreimage\)/, '组成员也必须在刷新后提交');
});

test('⑧ 角度输入只做轻量预览，不再置脏管线重建（v1051 数据唯一性）', () => {
  const bind = pe.slice(pe.indexOf('function bindZoneAngleInput()'), pe.indexOf('ppAiPlanFlow()'));
  const inputHandler = bind.slice(bind.indexOf("input.addEventListener('input'"), bind.indexOf("input.addEventListener('change'"));
  const handlerCode = inputHandler.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(handlerCode, /ppAnglePipeRegenPending/,
    'input 阶段不再置脏——管线重算统一由「生成施工图」按钮无条件执行');
  assert.match(inputHandler, /ppApplyZoneAngle\(raw,false,true\)/,
    '输入预览仍保持轻量，不在每个键入事件提交设计事务');
});

test('⑨ 分区预像漂移可由当前角度提交修复，管网预像漂移仍拒绝', () => {
  const vm = require('node:vm');
  const ctx = { console, JSON };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const file of ['core/drawing-design-model.js', 'core/drawing-design-legacy-adapter.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx, { filename: file });
  }
  const commit = i12.slice(i12.indexOf('window.ryCommitSinglePlotL2Snapshot='), i12.indexOf('function singlePlotCanonical('));
  vm.runInContext(commit, ctx);
  const poly = [{x:0,y:0},{x:100,y:0},{x:100,y:80},{x:0,y:80}];
  const before = {polyPts:poly,zoneAngleDeg:2,mainPipes:[]};
  const after = {polyPts:poly,zoneAngleDeg:2,mainPipes:[[{x:0,y:20},{x:100,y:20}]]};
  const seed = ctx.RyDrawingDesignLegacyAdapter.fromProjectSnapshot(
    {currentPlotId:'p',measuredPolygon:poly,pipePlan:before},
    {projectId:'legacy-project:p',plotId:'p',frameId:'legacy-frame:p'});
  assert.equal(seed.ok, true);
  ctx.currentPlotId = 'p';
  ctx.__runyeSingleCanonicalDesign = JSON.parse(JSON.stringify(seed.design));
  ctx.__runyeSingleCanonicalDesign.plots[0].partition.angleDeg = 0;
  assert.equal(ctx.ryCommitSinglePlotL2Snapshot(before, after), true);
  assert.equal(ctx.__runyeSingleCanonicalDesign.plots[0].partition.angleDeg, 2);
  assert.equal(ctx.__runyeSingleCanonicalDesign.plots[0].network.mainPipes.length, 1);
  ctx.__runyeSingleCanonicalDesign = JSON.parse(JSON.stringify(seed.design));
  ctx.__runyeSingleCanonicalDesign.plots[0].network.mainPipes = [[{x:1,y:1},{x:2,y:2}]];
  assert.equal(ctx.ryCommitSinglePlotL2Snapshot(before, after), false);
  assert.match(ctx.__runyeSingleL2CommitFailure, /network/);
});
