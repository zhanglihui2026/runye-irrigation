'use strict';
/* [v896 2026-11-02] 合并页面遗留 bug 修复锁（优先级 1，用户拍板「彻底合并」第一步）。
   锁两件事：
     ① inline-18.js syncLayers 只能在「首次渲染」（renderedPipelineData 从 null → 有值）
        时调 ppFitView 适应窗口——v784 起「每次数据变化都 fit」会重置用户手动缩放/平移；
     ② plot-editor.js 的「缩放 xx%」文字必须画在画布左下角——右下角被
        .ry-pwa-install 浮条（position:fixed;right:16px;bottom:16px;z-index:2000）遮挡。 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const i18Src = fs.readFileSync(path.join(ROOT, 'mod', 'inline-18.js'), 'utf8');
const peSrc = fs.readFileSync(path.join(ROOT, 'mod', 'plot-editor.js'), 'utf8');

test('[v896] syncLayers 仅首次渲染适应窗口（数据更新不得重置用户视图）', () => {
  const syncPos = i18Src.indexOf('function syncLayers()');
  assert.ok(syncPos > -1, '必须存在 syncLayers 函数');
  const seg = i18Src.slice(syncPos, syncPos + 1200);
  assert.ok(seg.includes('var firstRender=!renderedPipelineData'), '必须在 render 前记录 firstRender（renderedPipelineData 为 null 即首次）');
  assert.ok(seg.includes('if(firstRender&&layerState.pipeline)'), 'ppFitView 必须以 firstRender 为前置条件');
  /* 旧形态「无条件 fit」不得复活：if(layerState.pipeline){...ppFitView} 中间没有 firstRender */
  assert.doesNotMatch(seg, /if\(layerState\.pipeline\)\{try\{if\(typeof window\.ppFitView/, '旧的无条件 ppFitView 形态不得回归');
});

test('[v896] 缩放文字画在左下角（右下角被 PWA 浮条遮挡）', () => {
  /* 两处「缩放」绘制都必须 x=8 + textAlign='left' */
  const spots = [];
  let idx = peSrc.indexOf("fillText('缩放 ");
  while (idx > -1) { spots.push(idx); idx = peSrc.indexOf("fillText('缩放 ", idx + 1); }
  assert.ok(spots.length === 2, 'plot-editor.js 必须恰好两处「缩放」绘制（空态+正常），实际 ' + spots.length);
  for (const pos of spots) {
    const seg = peSrc.slice(Math.max(0, pos - 200), pos + 120);
    assert.ok(seg.includes("textAlign='left'"), '「缩放」绘制必须 textAlign=left');
    assert.ok(/,8,ppCanvas\.height-18\)/.test(seg), '「缩放」绘制必须画在左下角 (x=8)，实际片段缺失左下角坐标');
    assert.ok(!/ppCanvas\.width-8,ppCanvas\.height-18/.test(seg), '不得再画在右下角（ppCanvas.width-8）');
  }
});
