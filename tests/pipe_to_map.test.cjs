#!/usr/bin/env node
'use strict';
/* tests/pipe_to_map.test.cjs —— 双生成按钮语义区分静态锁
 *
 * 用户拍板（2026-11-01）：分区与管路页两个生成入口必须区分开 ——
 *   ① 「生成施工图」(#ppGenerate)：生成施工图与三级图；
 *   ② 「回传在线地图」(#tlAutoPipe)：只显示已生成且角度匹配的管线，不重复生成。
 * 用户拍板（2026-11-13「数据唯一性」）：点「生成施工图」一律清空重算全部
 *   主管/支管/阀门，不再按「布局过时」条件复用旧管线——旧几何残留会与新布局
 *   混在同一张图上。ppAnglePipeRegenPending / ppMainDirectionOutdated /
 *   ppPartitionLayoutOutdated 三个过时检测/置脏机制一并退役。
 * 锁按钮职责、无条件清空重算与回传动作的分离。
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

test('① #tlAutoPipe 接线 tlAutoPipeToMap + 文案「回传在线地图」', () => {
  const m = html.match(/<button[^>]*id="tlAutoPipe"[^>]*>([\s\S]*?)<\/button>/);
  assert.ok(m, '#tlAutoPipe 必须存在');
  assert.match(m[0], /onclick="tlAutoPipeToMap\(\)"/, 'onclick 必须是 tlAutoPipeToMap()（不再是裸 tlAutoGenerate）');
  assert.match(m[1], /回传在线地图/, '按钮明确表达回传职责');
});

test('② tlAutoPipeToMap：校验当前地块已提交成果 + 跳地图并刷新地图图层', () => {
  assert.match(i09, /function tlAutoPipeToMap\(\)/, '包装函数必须定义');
  assert.match(i09, /window\.tlAutoPipeToMap = tlAutoPipeToMap/, '必须挂 window（onclick 依赖全局）');
  const transfer = i09.slice(i09.indexOf('function tlAutoPipeToMap()'), i09.indexOf('window.tlAutoPipeToMap = tlAutoPipeToMap'));
  assert.doesNotMatch(transfer, /tlAutoGenerate\(/, '回传动作不能重新生成管线');
  assert.match(transfer, /generatedAngle/, '必须读取生成成果中的分区角度');
  assert.match(transfer, /currentAngle/, '必须读取当前分区角度');
  assert.match(transfer, /角度已变化/, '角度不一致时提示先生成施工图');
  assert.match(transfer, /sourceGeneratedAt!==dd\.generatedAt/, '必须确认网络快照来自当前这次施工图生成');
  assert.match(transfer, /networkState\.status!=='current'/, '不能把其他地块或过期网络回传为成功');
  assert.match(i09, /onlineMapSection/, '必须跳 onlineMapSection');
  assert.match(transfer, /RyMapHost[\s\S]{0,100}\.refresh\(\)/, '同标签页写入后必须刷新地图网络图层');
  assert.match(i09, /RyMapFlowDemo[\s\S]{0,40}refresh/, '跳转后必须刷新轮灌演示');
});

test('③ 「生成施工图」一律清空重算管线，再生成二级图和三级图（v1051 数据唯一性）', () => {
  const seg = pe.slice(pe.indexOf("getElementById('ppGenerate')"));
  assert.match(seg, /if\(!ppAutoGeneratePipes\(\)\)\{/,
    '点「生成施工图」一律先清空重算全部主管/支管/阀门（替换式重算），不得按「布局过时」条件复用旧管线');
  assert.match(seg, /ppGenerateDiagram\(\{scroll:false\}\)/, '二级图面生成必须在场');
  assert.match(seg, /tlAutoGenerate\(\{scroll:false,rethrowError:true,publishToMap:true\}\)/, '三级管线内链重生成失败必须回报按钮');
  assert.match(seg, /tlShowWorkspace/, '生成后落三级管路编辑视图必须在场');
  assert.match(seg, /__runyeSingleL2CommitFailure/, '重生成失败必须弹窗让用户看见（fail-closed），不能只 console.warn');
});

test('④ 「生成施工图」无条件重算；角度待重建等过时检测机制已退役（v1051 数据唯一性）', () => {
  /* 剥掉注释后检查：历史沿革注释里允许提及旧机制名，但真实代码不得复活。 */
  const code = pe.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /ppAnglePipeRegenPending/, '角度待重建脏标记已退役，不得复活');
  assert.doesNotMatch(code, /ppMainDirectionOutdated/, '主管方向过时检测已退役——重算职责统一收敛到「生成施工图」按钮');
  assert.doesNotMatch(code, /ppPartitionLayoutOutdated/, '分区布局过时检测已退役——重算职责统一收敛到「生成施工图」按钮');
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
