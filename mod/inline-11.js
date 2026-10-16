
window.measuredArea = 0;

function updatePlan(){
  const area = window.measuredArea || 0;
  const tag = document.getElementById('planAreaTag');

  if(area <= 0){
    if(tag) tag.textContent = '未测量';
    /* [v436-pp-normalize] 原此处对 ppPlanBar/ppPlanBar2 写内联 style.display='flex'
       的语句已删除：参数栏显示方式归一至 ry-panel.css 皮肤块（display:block），
       不再需要 CSS 侧用 !important 反压内联样式。 */
    clearPlanResults();
    return;
  }

  const mu = area / 666.67;
  if(tag) tag.innerHTML = '实测 <b>' + area.toFixed(1) + ' m²</b> · ' + mu.toFixed(2) + ' 亩';
  calcPlan();
}

function clearPlanResults(){
  window.planData = null;
  window.runyePlanDims = null;
  var a=document.getElementById('planA'), b=document.getElementById('planB');
  if(a) a.textContent = '—';
  if(b) b.textContent = '—';
  var ids = ['planIntensity','planPumpFlow','planPumpHead','planPumpPower','planMotorPower','planMainPipe','planMainVelocity','planBranchPipe','planBranchVelocity','planBranchSingleLen'];
  ids.forEach(function(id){
    var el = document.getElementById(id);
    if(el) el.textContent = '—';
  });
}

function ppSyncManualZoneWarning(input){
  if(!input)return;
  var host=input.parentNode;
  if(!host)return;
  var warning=host.querySelector('[data-manual-zone-warning]');
  var state=window.__manualZoneLayoutWarning;
  if(!state){
    if(warning)warning.remove();
    input.removeAttribute('aria-describedby');
    return;
  }
  if(!warning){
    warning=document.createElement('span');
    warning.setAttribute('data-manual-zone-warning','1');
    warning.id='planZoneManualWarning';
    warning.style.cssText='display:block;flex-basis:100%;color:#b91c1c;font-size:11px;line-height:1.3;white-space:normal;max-width:340px';
    host.appendChild(warning);
  }
  warning.textContent='手动设置将超过500个分区，当前按自动分区计算；请增大亩/区。';
  input.setAttribute('aria-describedby',warning.id);
}

function calcPlan(){
  // v91：面板「水泵提升高度 / 地形高差」镜像框在这里回填。
  //   calcPlan 是所有「改了 fld_lift / fld_dh 想看到结果」路径的汇聚点（面板框 / 扬程计算式条
  //   内联编辑 / 联动同步都会走它），而内联编辑是**程序化赋值**、不冒事件，
  //   光靠 document 上的 input/change 捕获监听补不到 ⇒ 放在这里做不变量式回填（相等时无操作）。
  if (typeof ppPullLiftDh === 'function') ppPullLiftDh();
  const area = window.measuredArea || 0;
  if(area <= 0) return;

  const tapeLen = readNumber('planTapeLaySide', 100, { min: 0.01 });   /* 2026-09-28：单带长度取消，改读单边铺设长度（语义重复合并） */
  const tapeSpacing = readNumber('planTapeSpacing', 0.4, { min: 0.01 });
  const emitterSpacing = readNumber('planEmitterSpacing', 0.3, { min: 0.01 });
  const emitterFlow = readNumber('planEmitterFlow', 0.8, { min: 0 });
  const tapeRollLen = readNumber('planTapeRoll', 2000, { min: 0 });
  const targetV = readNumber('planTargetV', 1.5, { min: 0.01 });
  const branchCount = readSelectedInt('#branchGroup .selected', 2);
  const layoutSides = readSelectedInt('#layoutGroup .selected', 1);
  const lift = readNumber('fld_lift', 5);
  const dh = window.RyTerrain ? window.RyTerrain.resolveDh(readNumber('fld_dh', 5), false) : readNumber('fld_dh', 5);
  const tapePressure = readNumber('fld_tapePressure', 1, { min: 0 });
  const existPressure = readNumber('fld_existPressure', 0, { min: 0 });
  const filterLoss = readNumber('fld_filterLoss', 5, { min: 0 });
  const efficiency = readNumber('fld_efficiency', 65, { min: 1, max: 100 }) / 100;
  const requestedN = readNumber('planN', 1, { integer: true, min: 1 });
  const zoneModeEl = document.getElementById('planZoneMode');
  const manualZoneInput = document.getElementById('planZoneMuManual');

  // A/B from actual polygon bounding box (fallback to 1.5 ratio when no polygon)
  var A, B, bbOX = 0, bbOY = 0;
  if (window.measuredPolygon && window.measuredPolygon.length >= 3) {
    var bbMinX=Infinity,bbMinY=Infinity,bbMaxX=-Infinity,bbMaxY=-Infinity;
    for (var bbI=0;bbI<window.measuredPolygon.length;bbI++){
      var bbP=window.measuredPolygon[bbI];
      if(bbP.x<bbMinX)bbMinX=bbP.x; if(bbP.x>bbMaxX)bbMaxX=bbP.x;
      if(bbP.y<bbMinY)bbMinY=bbP.y; if(bbP.y>bbMaxY)bbMaxY=bbP.y;
    }
    bbOX = bbMinX; bbOY = bbMinY;
    A = Math.round(bbMaxX - bbMinX);
    B = Math.round(bbMaxY - bbMinY);
    if (A < 1 || B < 1) { A = Math.round(Math.sqrt(area * 1.5)); B = Math.round(area / A); }
  } else {
    A = Math.round(Math.sqrt(area * 1.5));
    B = Math.round(area / A);
  }
  const totalMu = area / 666.67;
  const autoZoneLayout = calcZoneLayout(A, B, requestedN);
  if (zoneModeEl && manualZoneInput) {
    const manualMode = zoneModeEl.value === 'manual';
    manualZoneInput.disabled = !manualMode;
    if (manualMode && document.activeElement !== manualZoneInput && (!parseFloat(manualZoneInput.value) || parseFloat(manualZoneInput.value) <= 0)) {
      manualZoneInput.value = Math.ceil(autoZoneLayout.zoneArea / MU_TO_SQM);
    }
  }
  const manualZoneMu = getManualPlanZoneMu(A, B);
  ppSyncManualZoneWarning(manualZoneInput);
  const zoneLayout = calcPlanZoneLayout(A, B, requestedN, manualZoneMu);
  const N = zoneLayout.N;
  const planNEl = document.getElementById('planN');
  if(planNEl){
    if(String(planNEl.value) !== String(N)) planNEl.value = N;
    planNEl.disabled = manualZoneMu > 0;
  }

  // ===== 水泵选型原则（用户确认 2026-08-31）=====
  // 水泵按【单个分区】选型，基准取「方正标准分区(外接矩形单格)」面积 = A×B / N：
  //  · 标准分区用此泵可正常运行；
  //  · 不规则(非标)分区的真实面积均 < 标准分区，用同一台(偏大)泵灌溉非标分区没问题；
  //  · 将来配变频泵，偏大更无忧。
  // 故单区面积取外接矩形单格 A×B/N（标准分区口径），不规则地块自然被“偏大覆盖”，不会欠灌。
  // 注：滴灌带总长/用量、灌溉强度等【面积量】仍按真实实测面积 area 计（真值），仅【选型】用标准分区。
  const drawZoneW = zoneLayout.drawZoneW || zoneLayout.zoneW || A;
  const drawZoneH = zoneLayout.drawZoneH || zoneLayout.zoneH || B;
  const gridArea = drawZoneW * drawZoneH;

  // 单区面积（水泵选型依据）：手动指定优先；否则按方正标准分区（外接矩形单格）A×B/N
  var zoneAreaForShape = manualZoneMu > 0 ? Math.min(manualZoneMu * MU_TO_SQM, area) : (A * B / N);
  // 单区等效边长按 单区面积/格面积 缩放，保证 等效宽 × 等效高 === 单区面积（面积与几何自洽）
  const shapeK = (gridArea > 0) ? Math.sqrt(zoneAreaForShape / gridArea) : 1;
  /* v178：原此处还有 zoneWEff = drawZoneW*shapeK —— 它与上方的 zoneSegmentsPerRow 成对
     （有效宽 / 横向分段数），自重构后双双无引用，一并删除（纯运算，无副作用）。
     纵向的 zoneHEff 仍在用（zoneRows / branchSpan），保留。 */
  const zoneHEff = drawZoneH * shapeK;

  // Drip tape computation: length drives flow and material quantity; segment count drives fittings/connectors.
  // 主管长度为几何量（须横跨地块最远端）；滴灌带用量按真实面积。
  const mainPipeLen = A;
  const tapeRows = Math.max(1, Math.ceil(B / tapeSpacing));
  const tapeTotalLen = area / tapeSpacing;
  const segmentsPerRow = Math.max(1, Math.ceil(tapeTotalLen / tapeRows / tapeLen));
  const totalTapes = Math.max(1, Math.ceil(tapeTotalLen / tapeLen));
  const tapeRolls = tapeRollLen > 0 ? Math.ceil(tapeTotalLen * 1.1 / tapeRollLen) : 0;

  // Per-zone flow (pump sized for single zone operation) — 按最大分区实际面积选型
  const zoneAreaM2 = zoneAreaForShape;
  /* v97（2026-09-21，用户口径）：二级「水泵流量」改为按【标准分区设计值】计，不再裁剪图面实测分区面积。
     原因：实测最大分区面积可能 > 标定亩数，按图面裁剪反而偏小（实测 >18 亩却取到 13.95 亩），与"分区划定 18 亩"对不上。
     用户要求二级始终按分区划定亩数选型；图面裁剪只作用于三级管线编辑页（手动调分区的影响在三级体现，不影响本页）。
     flowAreaM2 = 手动亩/区→亩×MU_TO_SQM；否则方正标准分区 A×B/N。flowAreaSrc='design'。 */
  var flowAreaM2 = manualZoneMu > 0 ? manualZoneMu * MU_TO_SQM : (A * B / N);
  var flowAreaSrc = 'design';
  const flowZoneMu = flowAreaM2 / MU_TO_SQM;
  const zoneTapeLen = flowAreaM2 / tapeSpacing;
  const zoneRows = Math.max(1, Math.ceil(zoneHEff / tapeSpacing));
  const tapesPerZone = Math.max(1, Math.ceil(zoneTapeLen / tapeLen));
  const emittersPerTape = tapeLen / emitterSpacing;
  const tapeFlow = emittersPerTape * emitterFlow / 1000; // m³/h per full-length tape segment
  const zoneFlow = zoneTapeLen / emitterSpacing * emitterFlow / 1000;  // single zone flow → pump sizing
  const zoneMu = zoneAreaM2 / MU_TO_SQM;
  const intensity = flowZoneMu > 0 ? zoneFlow / flowZoneMu : 0; // m³/h per mu（v95 起与流量同口径：最大分区实际面积）

  // Pump estimation (same head model as the main calculator)
  const mainPipe = selectPipe(zoneFlow, targetV, MAIN_PIPE_MIN_OD);
  const mainLoss = hazenWilliams(mainPipeLen, zoneFlow, mainPipe.id);
  const branchFlow = zoneFlow / branchCount;
  const branchPipe = selectPipe(branchFlow, targetV, 0, BRANCH_PIPE_MAX_OD);
  const branchSpan = Math.max(0, zoneHEff);
  const branchLen = branchSpan / (branchCount * layoutSides);
  const tapsPerBranch = Math.ceil(tapesPerZone / branchCount);
  const branchF = christiansenF(tapsPerBranch);
  const branchLoss = hazenWilliams(branchLen, branchFlow, branchPipe.id) * branchF;
  const tapePressureM = tapePressure * 10.2;
  const headBeforeSafetyRaw = lift + dh + tapePressureM - existPressure * 10.2 + mainLoss + branchLoss + filterLoss + MARGIN_HEAD;
  const headBeforeSafety = Math.max(0, headBeforeSafetyRaw);
  const pumpHead = RyDesignCore.head(headBeforeSafety, 0, 0, SAFETY_FACTOR);
  const pumpPower = RyDesignCore.power(zoneFlow, pumpHead, efficiency);
  const motorKW = selectMotorPower(pumpPower);

  // Update display — Row 1 (input area)
  // 2026-09-15 左栏取消长边A/宽边B显示（用户要求）；数值保留在 window.runyePlanDims
  window.runyePlanDims = { A: A, B: B };
  var planAEl = document.getElementById('planA');
  var planBEl = document.getElementById('planB');
  if (planAEl) planAEl.textContent = A;
  if (planBEl) planBEl.textContent = B;

  // Row 2 (computed results)
  document.getElementById('planIntensity').textContent = intensity.toFixed(2);
  document.getElementById('planPumpFlow').textContent = zoneFlow.toFixed(1);
  document.getElementById('planPumpHead').textContent = pumpHead.toFixed(1);
  document.getElementById('planPumpPower').textContent = pumpPower.toFixed(1);
  document.getElementById('planMotorPower').textContent = motorKW.toFixed(1);
  document.getElementById('planMainPipe').textContent = 'Ø '+mainPipe.od+' mm';
  document.getElementById('planMainVelocity').textContent = mainPipe.v.toFixed(2);
  document.getElementById('planBranchPipe').textContent = 'Ø '+branchPipe.od+' mm';
  document.getElementById('planBranchVelocity').textContent = branchPipe.v.toFixed(2);
  // 单根支管长度 = 分区垂直跨度 ÷ (支管根数 × 敷设边数)；超出地块边界的部分不计算。
  var branchSingleLen = Math.round(branchLen);
  document.getElementById('planBranchSingleLen').textContent = branchSingleLen;

  // 实时更新「计算过程」面板：仅刷新内容，不控制折叠状态
  ppRenderPlanCalcDetail({
    zoneMu, intensity, zoneFlow, zoneTapeLen, emitterSpacing, emitterFlow, tapeLen,
    tapePressure, tapePressureM, existPressure, lift, dh,
    mainLoss, branchLoss, filterLoss, marginHead: MARGIN_HEAD,
    headBeforeSafety, headBeforeSafetyRaw, safetyFactor: SAFETY_FACTOR,
    pumpHead, efficiency, pumpPowerRaw: pumpPower, motorKW,
    mainPipe, branchPipe, branchFlow, branchCount, branchSpan, branchLen, tapsPerBranch, branchF, mainPipeLen
  });

  // Update area tag in title
  const tag=document.getElementById('planAreaTag');
  const zoneModeLabel = manualZoneMu > 0 ? '单区划定' : '单区折算';
  if(tag) tag.innerHTML='实测 <b>'+area.toFixed(1)+' m²</b> · '+totalMu.toFixed(2)+' 亩 · '+(layoutSides===2?'双边':'单边')+' · '+zoneLayout.cols+'列×'+zoneLayout.rows+'行 · '+zoneModeLabel+'<b>'+Math.round(zoneLayout.zoneW)+'×'+Math.round(zoneLayout.zoneH)+'m</b>'+(flowAreaSrc==='figureMaxZone'?(' · 流量按图面最大分区 <b>'+(flowAreaM2/MU_TO_SQM).toFixed(2)+' 亩</b>'):(flowAreaSrc==='design'?(' · 流量按标准分区 <b>'+(flowAreaM2/MU_TO_SQM).toFixed(2)+' 亩</b>'):''));

  // Store all data for apply
  window.planData = { A, B, N, zoneCols: zoneLayout.cols, zoneRows: zoneLayout.rows, zoneW: zoneLayout.zoneW, zoneH: zoneLayout.zoneH, mainPipeLen, tapeLen, tapeSpacing, emitterSpacing, emitterFlow, tapeRollLen, tapeTotalLen, totalTapes, tapesPerZone, zoneTapeLen, lift, dh, totalMu, zoneFlow, pumpHead, pumpPower, motorKW, intensity, manualZoneMu, targetV, flowAreaM2, flowAreaSrc, mainPipeOD:'Ø '+mainPipe.od+' mm', branchPipeOD:'Ø '+branchPipe.od+' mm', mainPipeODValue:mainPipe.od, branchPipeODValue:branchPipe.od, mainVelocity:mainPipe.v, branchVelocity:branchPipe.v,
    // 水泵扬程计算中间量，用于施工简图展示
    tapePressure, tapePressureM, existPressure, mainLoss, branchLoss, filterLoss, headBeforeSafety, headBeforeSafetyRaw, safetyFactor: SAFETY_FACTOR, marginHead: MARGIN_HEAD, efficiency, branchCount, layoutSides
  };
  // 二级→三级 联动：二级计算完成后，自动把单区参数带入三级系统（若开启"与二级联动"）
  if (window.__tlLinkEnabled !== false && typeof syncThreeLevelFromPlan === 'function') {
    syncThreeLevelFromPlan();
    if (typeof renderThreeLevel === 'function') renderThreeLevel();
    if (typeof tlUpdatePlanBar === 'function') tlUpdatePlanBar();
  }
  if(typeof render==='function') render();
  if(typeof window.ppRender==='function') window.ppRender();
  if(typeof window.ppRefreshDiagramIfVisible==='function') window.ppRefreshDiagramIfVisible();
  if(typeof refreshRunyeCompare==='function') refreshRunyeCompare();
}

// 渲染流程独立于二级计算状态；保留历史全局入口供现有调用方使用。
function ppRenderPlanCalcDetail(p) {
  if (window.RyPlanCalcRenderer) window.RyPlanCalcRenderer.renderPlanCalcDetail(p);
}
window.ppRenderPlanCalcDetail = ppRenderPlanCalcDetail;

// 渲染「扬程计算过程」（#ppHeadBreak，三级左栏）：把结果栏的「水泵扬程」逐项拆开，
// 只列计算过程数值，不做文字解释（2026-09-16 第三十六轮按用户要求简化）。
// 纯展示：只读 computeThreeLevel 结果 r，不写回任何输入、不改动扬程结果本身。
function ppRenderHeadBreakdown(r) {
  if (window.RyPlanCalcRenderer) {
    window.RyPlanCalcRenderer.renderHeadBreakdown(r, { marginHead: MARGIN_HEAD, safetyFactor: SAFETY_FACTOR });
  }
}
window.ppRenderHeadBreakdown = ppRenderHeadBreakdown;

// Input listeners — all plan parameters
['planTapeLaySide','planTapeSpacing','planEmitterSpacing','planEmitterFlow','planN','planZoneMode','planZoneMuManual','planTargetV'].forEach(id=>{
  document.getElementById(id).addEventListener('input', calcPlan);
  document.getElementById(id).addEventListener('change', calcPlan);
});

/* ===== 任务⑮（2026-09-24 用户要求）：「水源距离」→ 三级总管长度/总管损失/水泵扬程 + 总管长度统计 =====
   输入即重算三级（renderThreeLevel + tlUpdatePlanBar→损失卡），与二级面板参数联动。 */
['planSrcDist'].forEach(id=>{
  var elx=document.getElementById(id);
  if(!elx) return;
  var refx=function(){ if(typeof renderThreeLevel==='function') renderThreeLevel(); if(typeof tlUpdatePlanBar==='function') tlUpdatePlanBar(); };
  elx.addEventListener('input', refx);
  elx.addEventListener('change', refx);
});

/* ===== 面板「水泵提升高度 / 地形高差」⇄ 一级表单 fld_lift / fld_dh 双向镜像（2026-09-20 v91）=====
   这两个量是**同一个物理量**：01 一级表单的「井/水池提升高度 fld_lift」「水源至最高点高差 fld_dh」；
   calcPlan（二级扬程）、ppRenderHeadBreakdown（05 扬程分解）、ppRenderPlanCalcDetail（扬程计算式条，
   其内联编辑框 data-target 就是 fld_lift/fld_dh）全都只认 fld_* ⇒ 沿用 fld_* 作唯一数据源，
   面板这两个框只做镜像。不变量：**两处 value 始终逐字相同**。
     · 面板框改值 → 写回 fld_*（document 捕获阶段，先于任何 input 监听落地，
       使既有 render() 也读到新值）→ calcPlan()
     · fld_* 变值（扬程计算式条内联编辑 / 恢复默认参数）→ 回填面板框
   注：赋值 .value 不触发事件，故不会形成回环。 */
/* v199：'planTapePressure' ⇄ 'fld_tapePressure'（二级左栏「入口压力」镜像，同 v91 机制） */
var PP_LIFTDH_PAIRS = [['planLift', 'fld_lift'], ['planDh', 'fld_dh'], ['planTapePressure', 'fld_tapePressure']];
function ppPullLiftDh() {                                   // fld_* → 面板
  PP_LIFTDH_PAIRS.forEach(function (pr) {
    var src = document.getElementById(pr[1]), dst = document.getElementById(pr[0]);
    if (src && dst && dst.value !== src.value) dst.value = src.value;
  });
}
function ppLiftDhCapture(ev) {                              // 捕获阶段：面板 → fld_*
  var t = ev.target;
  if (!t || !t.id) return;
  for (var i = 0; i < PP_LIFTDH_PAIRS.length; i++) {
    var pr = PP_LIFTDH_PAIRS[i];
    if (t.id === pr[0]) { var m = document.getElementById(pr[1]); if (m) m.value = t.value; return; }
    if (t.id === pr[1]) { ppPullLiftDh(); return; }
  }
}
document.addEventListener('input', ppLiftDhCapture, true);
document.addEventListener('change', ppLiftDhCapture, true);
['planLift', 'planDh', 'planTapePressure'].forEach(function (id) {   // 面板框改值后重算二级（v199 含入口压力）
  var el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input', calcPlan);
  el.addEventListener('change', calcPlan);
});
ppPullLiftDh();                                              // 首屏对齐一次
// （ppToggleCalc 的 click 已在 ppToggleCalcDetail 定义处立即绑定，无需再注册 DOMContentLoaded）
