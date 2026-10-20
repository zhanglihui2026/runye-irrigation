'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route(/^https?:/, route => route.abort());
    const url = pathToFileURL(path.resolve(__dirname, '../index.html')).href;
    await page.goto(url, { waitUntil: 'load' });
    await page.evaluate(() => {
      window.measuredPolygon = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 200 }, { x: 0, y: 200 }];
      window.measuredArea = 80000;
      ppLoadPolygon();
      document.getElementById('ppGenerate').click();
      selectTLBranch(4); selectTLLayout(2);
      tlAutoGenerate({ scroll: false });
    });
    const saved = await page.evaluate(() => {
      if (!window.tlDiagramData) throw Error('未生成图面');
      const ae = window.RyTlAutoEdits;
      ae.setCaliber('main-0', 200, window.tlDiagramData, 'test');
      if (!tlAppliedPipeOverride()) throw Error('改径后未自动应用');
      const r = computeThreeLevel();
      const inputIds = ['tl_zoneMu', 'tl_zoneCount', 'tl_tapeSpacing', 'tl_emitterSpacing', 'tl_emitterFlow',
        'tl_targetV', 'tl_frontPipeLen', 'tl_mainPipeLen', 'tl_lift', 'tl_dh', 'tl_filterLoss', 'tl_efficiency'];
      const inputs = Object.fromEntries(inputIds.map(id => [id, document.getElementById(id)?.value ?? null]));
      runyeSaveProject(true);
      const snapshot = JSON.parse(localStorage.getItem('runye_irrigation_saved_project_v1') || 'null');
      const storedInputs = Object.fromEntries(inputIds.map(id => [id, snapshot?.inputValues?.[id] ?? null]));
      return { head: r.pumpHead, loss: r.totalPipeLoss, override: tlPipeOdOverride,
        branchCount: r.branchCount, layoutSides: r.layoutSides, path: r.hydraulicPath,
        flow: r.combinedFlow, zoneFlow: r.zoneFlow, area: r.flowAreaM2, wp: r.wp, mainOd: r.mainPipe.od,
        inputs, storedInputs, geometryKey: ae.geometryKey(window.tlDiagramData) };
    });
    assert.ok(saved.path, '已进入逐路径校核');
    assert.equal(saved.branchCount, 4); assert.equal(saved.layoutSides, 2);
    const realtime = await page.evaluate(() => {
      const zi = computeThreeLevel().hydraulicPath.zoneIndex;
      RyTlAutoEdits.setCaliber('branch-' + zi, 63, tlDiagramData, 'test');
      const r = computeThreeLevel();
      const text = tlCalSummaryText();
      const right = document.getElementById('tlPlanPumpHeadReal').textContent;
      const detail = document.getElementById('tlPumpUpdateDelta').textContent;
      const velocity = document.getElementById('tlPlanBranchVelocityReal').textContent;
      const expectedV = r.hydraulicPath.branchFlow / 3600 / (Math.PI * Math.pow(peInnerDiam(63) / 1000, 2) / 4);
      RyTlAutoEdits.clearCaliber('branch-' + zi, 'test');
      return { head: r.pumpHead.toFixed(1), text, right, detail, velocity, expectedV: expectedV.toFixed(2) };
    });
    assert.ok(realtime.text.includes(realtime.head + ' m'), '汇总条引用当前正式扬程');
    assert.ok(realtime.right.includes(realtime.head), '右栏随改径立即更新');
    assert.ok(realtime.detail.includes(realtime.head + ' m'), '差值卡与右栏一致');
    assert.ok(realtime.velocity.includes(realtime.expectedV), '实际流速使用改后内径');
    assert.ok(!realtime.text.includes('Σ水头损失'), '不再跨路径累加');
    const projectFile = await page.evaluate(() => {
      const key = Object.keys(localStorage).find(k => {
        try { const o = JSON.parse(localStorage.getItem(k)); return o && o.inputValues && o.savedAt; } catch (_) { return false; }
      });
      const raw = localStorage.getItem(key);
      const snapshot = raw ? JSON.parse(raw) : null;
      return { key, raw, autoRestoreEligible: !!(snapshot && snapshot.ppGenSig && snapshot.measuredPolygon?.length >= 3) };
    });
    assert.ok(projectFile.autoRestoreEligible, '存档应满足页面自动恢复条件');
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.__runyeAutoRestored === true, null, { timeout: 5000 });
    const restored = await page.evaluate(() => {
      const r = computeThreeLevel();
      const inputIds = ['tl_zoneMu', 'tl_zoneCount', 'tl_tapeSpacing', 'tl_emitterSpacing', 'tl_emitterFlow',
        'tl_targetV', 'tl_frontPipeLen', 'tl_mainPipeLen', 'tl_lift', 'tl_dh', 'tl_filterLoss', 'tl_efficiency'];
      const inputs = Object.fromEntries(inputIds.map(id => [id, document.getElementById(id)?.value ?? null]));
      return { head: r.pumpHead, loss: r.totalPipeLoss, override: tlPipeOdOverride,
        branchCount: r.branchCount, layoutSides: r.layoutSides, od: RyTlAutoEdits.caliberOf('main-0'),
        flow: r.combinedFlow, zoneFlow: r.zoneFlow, area: r.flowAreaM2, wp: r.wp, mainOd: r.mainPipe.od, path: r.hydraulicPath,
        inputs, geometryKey: RyTlAutoEdits.geometryKey(window.tlDiagramData),
        overrideApplied: !!tlAppliedPipeOverride(), autoRestored: !!window.__runyeAutoRestored };
    });
    if (Math.abs(restored.head - saved.head) > 1e-8) {
      const inputDifferences = Object.keys(saved.inputs).filter(id => saved.inputs[id] !== restored.inputs[id])
        .map(id => ({ id, saved: saved.inputs[id], restored: restored.inputs[id] }));
      console.log(JSON.stringify({
        mismatch: 'saved vs restored hydraulic state',
        saved: { head: saved.head, loss: saved.loss, flow: saved.flow, zoneFlow: saved.zoneFlow,
          area: saved.area, mainOd: saved.mainOd, overrideCalibers: saved.override?.calibers,
          inputs: saved.inputs, storedInputs: saved.storedInputs },
        restored: { head: restored.head, loss: restored.loss, flow: restored.flow, zoneFlow: restored.zoneFlow,
          area: restored.area, mainOd: restored.mainOd, overrideCalibers: restored.override?.calibers,
          overrideApplied: restored.overrideApplied, autoRestored: restored.autoRestored, inputs: restored.inputs },
        geometryKeyMatches: restored.geometryKey === saved.geometryKey,
        inputDifferences
      }, null, 2));
    }
    assert.deepEqual(saved.storedInputs, saved.inputs, '存档中的水力输入应与保存时实际使用的输入一致');
    assert.deepEqual(restored.inputs, saved.inputs, '刷新恢复后的水力输入应与存档一致');
    assert.equal(restored.geometryKey, saved.geometryKey, '刷新恢复后的管网几何签名应与存档一致');
    assert.equal(restored.autoRestored, true, '应由页面自动恢复链路完成恢复');
    near(restored.head, saved.head); near(restored.loss, saved.loss);
    assert.deepEqual(restored.override, saved.override);
    assert.equal(restored.branchCount, 4); assert.equal(restored.layoutSides, 2);
    assert.equal(restored.od, null, '图面改径标注按约定不进存档');
    assert.equal(restored.overrideApplied, true, '已确认的水力管径覆盖应随工程存档恢复');
    assert.equal(restored.override.calibers['main-0'], 200);
    const reset = await page.evaluate(() => {
      RyTlAutoEdits.clearCaliber('main-0', 'test');
      const applied = tlPumpUpdateRun();
      return { applied, override: tlPipeOdOverride, path: computeThreeLevel().hydraulicPath };
    });
    assert.equal(reset.applied, true);
    assert.equal(reset.override, null, '撤销图面改径后应清除已应用的管径覆盖');
    assert.ok(reset.path && Number.isFinite(reset.path.total), '清除覆盖后仍应按设计管径计算最不利路径');
    // 经实际面板选择器操作，固定流量和几何下支管改细一档，
    // 每条候选路径损失及泵扬程/轴功率都不能反向下降。
    const branchReduction = await page.evaluate(() => {
      const select = document.getElementById('tlCalSelBranch');
      if (!select) throw Error('缺少支管管径选择器');
      const available = Array.from(select.options).map(option => Number(option.value))
        .filter(Number.isFinite).sort((a, b) => a - b);
      if (available.length < 2) throw Error('支管管径选择器少于两个有效选项：' + available.join(', '));
      const smallerOd = available[available.length - 2];
      const largerOd = available[available.length - 1];
      const choose = od => {
        select.value = String(od);
        select.dispatchEvent(new Event('change', { bubbles: true }));
        const r = computeThreeLevel();
        return {
          flow: r.combinedFlow, loss: r.totalPipeLoss, head: r.pumpHead, power: r.pumpPower,
          motor: r.motorKW_rounded, path: r.hydraulicPath && r.hydraulicPath.total,
          shownHead: document.getElementById('tlPlanPumpHeadReal').textContent,
          shownPower: document.getElementById('tlPlanPumpPowerReal').textContent,
          shownMotor: document.getElementById('tlPlanMotorPowerReal').textContent,
          delta: document.getElementById('tlPumpUpdateDelta').textContent
        };
      };
      const oldManual = Object.assign({}, tlManualCals), oldOverride = tlPipeOdOverride;
      const oldSelectedOd = select.value;
      try {
        const larger = choose(largerOd);
        const smaller = choose(smallerOd);
        return {
          largerOd, smallerOd,
          flowLarger: larger.flow, flowSmaller: smaller.flow,
          lossLarger: larger.loss, lossSmaller: smaller.loss,
          headLarger: larger.head, headSmaller: smaller.head,
          powerLarger: larger.power, powerSmaller: smaller.power,
          motorLarger: larger.motor, motorSmaller: smaller.motor,
          pathLarger: larger.path, pathSmaller: smaller.path,
          shownLarger: larger, shownSmaller: smaller
        };
      } finally {
        window.tlManualCals = oldManual; tlPipeOdOverride = oldOverride;
        select.value = oldSelectedOd; tlUpdatePlanBar();
      }
    });
    near(branchReduction.flowSmaller, branchReduction.flowLarger);
    assert.ok(branchReduction.lossSmaller > branchReduction.lossLarger, '支管从 Ø' + branchReduction.largerOd + ' 改细到 Ø' + branchReduction.smallerOd + ' 后总管路损失应增加');
    assert.ok(branchReduction.pathSmaller > branchReduction.pathLarger, '支管改细后最不利路径损失应增加');
    assert.ok(branchReduction.headSmaller > branchReduction.headLarger, '支管改细后泵扬程应增加');
    assert.ok(branchReduction.powerSmaller > branchReduction.powerLarger, '流量不变且扬程增加时轴功率应增加');
    assert.ok(branchReduction.motorSmaller >= branchReduction.motorLarger, '轴功率上升时建议电机档位不得下降');
    assert.ok(branchReduction.shownSmaller.shownHead.includes(branchReduction.headSmaller.toFixed(1)), '面板扬程与当前管径计算一致');
    assert.ok(branchReduction.shownSmaller.shownPower.includes(branchReduction.powerSmaller.toFixed(1)), '界面轴功率显示计算功率');
    assert.ok(branchReduction.shownSmaller.shownMotor.includes(String(branchReduction.motorSmaller)), '界面另行显示建议电机功率');
    assert.ok(branchReduction.shownSmaller.delta.includes(branchReduction.headSmaller.toFixed(1) + ' m'), '改径确认摘要与面板扬程一致');
    // 对用户报告的精确 Ø140 → Ø110 场景，固定全部其他输入，只覆盖支管外径比较计算核心。
    const exactBranchReduction = await page.evaluate(() => {
      const oldManual = Object.assign({}, window.tlManualCals);
      const oldOverride = window.tlPipeOdOverride;
      const calculate = od => {
        window.tlManualCals = Object.assign({}, oldManual, { branch: od });
        tlBuildPipeOverride();
        const r = computeThreeLevel();
        return { flow: r.combinedFlow, loss: r.totalPipeLoss, head: r.pumpHead, power: r.pumpPower };
      };
      try { return { od140: calculate(140), od110: calculate(110) }; }
      finally {
        window.tlManualCals = oldManual; window.tlPipeOdOverride = oldOverride;
        if (typeof tlUpdatePlanBar === 'function') tlUpdatePlanBar();
      }
    });
    near(exactBranchReduction.od110.flow, exactBranchReduction.od140.flow);
    assert.ok(exactBranchReduction.od110.loss > exactBranchReduction.od140.loss, '固定工况下 Ø140 改为 Ø110 后总管路损失应增加');
    assert.ok(exactBranchReduction.od110.head > exactBranchReduction.od140.head, '固定工况下 Ø140 改为 Ø110 后泵扬程应增加');
    assert.ok(exactBranchReduction.od110.power > exactBranchReduction.od140.power, '固定工况下 Ø140 改为 Ø110 后轴功率应增加');
    // 改变当前图纸后打开旧方案：管径和已确认计算快照均应恢复。
    const cross = await page.evaluate(file => {
      window.measuredPolygon = [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 100 }, { x: 0, y: 100 }];
      ppLoadPolygon(); document.getElementById('ppGenerate').click(); tlAutoGenerate({ scroll: false });
      localStorage.setItem(file.key, file.raw);
      runyeLoadProject();
      return { head: computeThreeLevel().pumpHead, od: RyTlAutoEdits.caliberOf('main-0'),
        override: tlPipeOdOverride, overrideApplied: !!tlAppliedPipeOverride() };
    }, projectFile);
    near(cross.head, saved.head);
    assert.equal(cross.od, null, '临时图面改径标记不随工程存档');
    assert.equal(cross.overrideApplied, true, '跨图恢复应恢复已确认的计算口径覆盖');
    assert.equal(cross.override.calibers['main-0'], 200);
    // 老方案没有新增字段时，不继承当前内存中的选项和覆盖。
    const legacy = await page.evaluate(() => {
      const key = Object.keys(localStorage).find(k => {
        try { const o = JSON.parse(localStorage.getItem(k)); return o && o.inputValues && o.savedAt; } catch (_) { return false; }
      });
      if (!key) throw Error('未找到方案存档');
      const data = JSON.parse(localStorage.getItem(key));
      delete data.pipeOdOverride; delete data.tlBranchCount; delete data.tlLayoutSides;
      localStorage.setItem(key, JSON.stringify(data)); runyeLoadProject();
      const r = computeThreeLevel();
      return { override: tlPipeOdOverride, branchCount: r.branchCount, layoutSides: r.layoutSides };
    });
    assert.equal(legacy.override, null); assert.equal(legacy.branchCount, 2); assert.equal(legacy.layoutSides, 1);
    assert.deepEqual(errors, [], '页面运行时错误');
    console.log('PASS: 浏览器改径、刷新恢复、跨图恢复、撤回覆盖、旧档默认值，零页面异常');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
