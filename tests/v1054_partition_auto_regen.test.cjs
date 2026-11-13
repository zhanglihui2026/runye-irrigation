#!/usr/bin/env node
'use strict';
/* tests/v1054_partition_auto_regen.test.cjs —— 流程顺序重排锁（数据唯一性终极形态）
 *
 * 用户拍板（2026-11-13 晚）：「生成施工图应该是在三级后面，而不是在二级后面」。
 * 目标流程：在线地图取面积 → 二级分区（管线自动生成，无需按钮）→ 三级管路编辑
 * （手绘总管/改径）→ 三级点「生成施工图」= 刷新简图 + 同步在线地图。
 *
 * 锁四件事：
 *   ① 二级 #ppGenerate 按钮已移除（连绑定一起），ppRunGenerateFlow 解绑保留；
 *   ② 自动重算挂在 ppRender 尾部：签名比对 + 防抖 + 重入标志 + 逐块态豁免；
 *   ③ 三级 #tlGenerateDiagram「生成施工图」：刷新简图 + tlSyncGeneratedMapSnapshot + 跳地图；
 *   ④ 二级不再有 tlAutoPipe 旧回传按钮（此前已被删，测试既存红至此收编）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const pe = fs.readFileSync(path.join(ROOT, 'mod', 'plot-editor.js'), 'utf8');
const i09 = fs.readFileSync(path.join(ROOT, 'mod', 'inline-09.js'), 'utf8');

test('① 二级生成按钮已移除，handler 解绑为 ppRunGenerateFlow 保留', () => {
  assert.ok(!html.includes('id="ppGenerate"'), '二级不得再有 #ppGenerate 按钮');
  assert.match(pe, /function ppRunGenerateFlow\(\)/, '流程函数解绑保留（成组按块分发链备查）');
  assert.match(pe, /window\.ppRunGenerateFlow=ppRunGenerateFlow/, '挂 window 备查');
  assert.ok(!/getElementById\('ppGenerate'\)\.addEventListener/.test(pe), '不得再绑定已删除的按钮');
});

test('② 自动重算：签名比对 + 防抖 400ms + 重入标志 + 逐块态豁免', () => {
  const render = pe.slice(pe.indexOf('function ppRender()'), pe.indexOf('var ppRenderBase=ppRender'));
  assert.match(render, /分区变化 → 管线自动重算/, '设计注释必须在场（改这里必须是有意的）');
  assert.match(render, /ppAutoRegenTimer=setTimeout\(function\(\)\{/, '防抖触发');
  assert.match(render, /ppAutoRegenRunning=true/, '重算前立标志');
  assert.match(render, /finally\{ ppAutoRegenRunning=false; \}/, 'finally 里复位标志');
  assert.match(render, /\},400\);/, '防抖 400ms');
  assert.match(render, /分区已变化，管线已自动重新生成/, '覆盖手绘管线时必须 toast 告知（可从历史找回）');
  const decl = pe.slice(pe.indexOf('var ppAutoRegenTimer'), pe.indexOf('var ppRenderBase=ppRender'));
  assert.match(decl, /ppAutoRegenRunning=false/, '标志必须初始化为 false');
  /* [v1055 用户实测] 旧档案管线（无签名）曾被 `if(!gen&&hasPipes)return` 挡死——
     改角度/改面积后管线纹丝不动。隔断必须保持取消：不得出现该条件。 */
  assert.ok(!/if\(!gen&&hasPipes\)return/.test(render), '不得复活「无签名不重算」隔断（v1055 死锁根因）');
  assert.match(render, /cur===ppAutoRegenFailSig/, '失败冷却必须在场（同一签名失败过不重试，防 alert 骚扰）');
  assert.match(render, /ppAutoRegenFailSig=cur/, '失败时记录冷却签名');
});

test('③ 三级「生成施工图」：刷新简图 → 同步地图 → 跳地图查看', () => {
  const m = html.match(/<button[^>]*id="tlGenerateDiagram"[^>]*>[\s\S]*?<\/button>/);
  assert.ok(m, '#tlGenerateDiagram 按钮必须在三级工具栏');
  const fn = i09.slice(i09.indexOf('function tlGenerateDiagramToMap()'), i09.indexOf('window.tlGenerateDiagramToMap=tlGenerateDiagramToMap'));
  assert.match(fn, /measuredPolygon\|\|\[\]/, '先校验地块存在');
  assert.match(fn, /ppShare\.mainPipes&&ppShare\.mainPipes\.length/, '先校验二级管线成果存在（分区先于定稿）');
  assert.match(fn, /tlAutoGenerate\(\{scroll:false,rethrowError:true,publishToMap:true\}\)/, '强制刷新简图保同代');
  assert.match(fn, /window\.tlSyncGeneratedMapSnapshot\(\)!==true/, '同步在线地图快照');
  assert.match(fn, /onlineMapSection/, '成功后跳在线地图');
});

test('④ 旧二级回传按钮 #tlAutoPipe 不得复活（v1054 收编既存红）', () => {
  assert.ok(!html.includes('id="tlAutoPipe"'), '#tlAutoPipe 已删不得复活（回传职责由 #tlGenerateDiagram 承担）');
  assert.ok(!/tlAutoPipeToMap/.test(i09.replace(/\/\*[\s\S]*?\*\//g, '')), 'tlAutoPipeToMap 旧函数不得复活');
});

const i18 = fs.readFileSync(path.join(ROOT, 'mod', 'inline-18.js'), 'utf8');

test('⑤ v1056 图层统一：管路开关控制二级层 + 自动重算联动刷新三级层 + 一级管残留不上屏', () => {
  /* 用户实测「管线有多层数据」：统一工作区两层叠放，隐藏管路开关只藏三级层；
     自动重算后三级层未刷新 → v875 同代抑制失效 → 两套管线叠加显示。 */
  const render = pe.slice(pe.indexOf('function ppRender()'), pe.indexOf('var ppRenderBase=ppRender'));
  const hits = render.match(/window\.__ryPipelineLayerVisible!==false/g) || [];
  assert.ok(hits.length >= 2, '主管/支管块与阀门必须受管路开关控制（实际 ' + hits.length + ' 处）');
  assert.match(render, /if\(window\.__ryPipelineLayerVisible===false\)return;/, '接驳节点必须受管路开关控制');
  const subHits = render.match(/ppState\.subBranchPipes && ppState\.pipeLevel==='three'/g) || [];
  assert.ok(subHits.length >= 2, '一级管（含其滴灌带）只在三级模式绘制，旧存档残留不得上屏（实际 ' + subHits.length + ' 处）');
  assert.match(render, /三级管路图层同步刷新|tlAutoGenerate\(\{scroll:false,rethrowError:true\}\)/,
    '自动重算成功后必须联动刷新三级层（不传 publishToMap，定稿才传地图）');
  assert.match(i18, /window\.__ryPipelineLayerVisible=layerState\.pipeline!==false/,
    '管路开关必须写入二级层显隐标志');
  assert.match(i18, /__ryPipelineLayerVisible[\s\S]{0,120}window\.ppRender\(\)/,
    '开关切换后必须重绘二级画布');
});
