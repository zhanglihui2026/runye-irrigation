
window.measuredArea = 0;

function updatePlan(){
  const area = Number(window.measuredArea)||0;
  const tag = document.getElementById('planAreaTag');

  if(area <= 0){
    if(tag) tag.textContent = '请先从在线地图取得有效地块边界和实测总面积';
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
  const mapZoneAreas = (typeof readCurrentPlanningZoneAreas === 'function') ? readCurrentPlanningZoneAreas() : null;
  if(!mapZoneAreas){ clearPlanResults(); return; }
  const area = Number(window.measuredArea)||0;
  if(area <= 0) { clearPlanResults(); return; }

  const tapeLen = readNumber('planTapeLaySide', 100, { min: 0.01 });   /* 2026-09-28：单带长度取消，改读单边铺设长度（语义重复合并） */
  const tapeSpacing = readNumber('planTapeSpacing', 0.4, { min: 0.01 });
  const emitterSpacing = readNumber('planEmitterSpacing', 0.3, { min: 0.01 });
  const emitterFlow = readNumber('planEmitterFlow', 0.8, { min: 0 });
  const tapeRollLen = readNumber('planTapeRoll', 2000, { min: 0 });
  const targetV = readNumber('planTargetV', 1.5, { min: 0.01 });
  const branchCount = readSelectedInt('#branchGroup .selected', 2);
  const layoutSides = readSelectedInt('#layoutGroup .selected', 1);
  const branchParallelCount = branchCount * layoutSides;
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

  // 总量固定取地图实测面积；单区水力与管径按本页当前分区几何分配的实切面积计算。
  const flowAreaM2 = Math.max.apply(null, mapZoneAreas);
  const flowAreaSrc = 'currentPlanGeometry+measuredPlotArea';
  const zoneAreaM2 = flowAreaM2;
  var __ppActuals = mapZoneAreas.map(function(m2, zi){ return {zi:zi, m2:m2, mu:m2/MU_TO_SQM}; });
  var __ppCaliberActual = true;
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
  const branchFlow = zoneFlow / branchParallelCount;
  const branchPipe = selectPipe(branchFlow, targetV, 0, BRANCH_PIPE_MAX_OD);
  const branchSpan = Math.max(0, zoneHEff);
  const branchLen = branchSpan / (branchCount * layoutSides);
  const tapsPerBranch = Math.ceil(tapesPerZone / branchParallelCount);
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
  /* [v972 2026-11-05 用户要求] 二级「水力计算结果」结果条（#ppPlanBar2）整条裁撤，
     仅「每亩流量」(#planIntensity) 移入灌溉参数区（目标流速之下）。写入全部改走
     ppResPut 守卫：元素不在即跳过，不再因 getElementById(...).textContent 抛错；
     数据仍全量存 window.planData（系统图联动/施工简图改读数据源）。 */
  function ppResPut(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; }
  ppResPut('planIntensity', intensity.toFixed(2));
  ppResPut('planPumpFlow', zoneFlow.toFixed(1));
  ppResPut('planPumpHead', pumpHead.toFixed(1));
  ppResPut('planPumpPower', pumpPower.toFixed(1));
  ppResPut('planMotorPower', motorKW.toFixed(1));
  ppResPut('planMainPipe', 'Ø ' + mainPipe.od + ' mm');
  ppResPut('planMainVelocity', mainPipe.v.toFixed(2));
  ppResPut('planBranchPipe', 'Ø ' + branchPipe.od + ' mm');
  ppResPut('planBranchVelocity', branchPipe.v.toFixed(2));
  // 单根支管长度 = 分区垂直跨度 ÷ (支管根数 × 敷设边数)；超出地块边界的部分不计算。
  var branchSingleLen = Math.round(branchLen);
  ppResPut('planBranchSingleLen', branchSingleLen);

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
  if(tag) tag.innerHTML='地图实测总面积 <b>'+area.toFixed(1)+' m²</b> · '+totalMu.toFixed(2)+' 亩 · 本页最大分区 '+(flowAreaM2/MU_TO_SQM).toFixed(2)+' 亩 · '+(layoutSides===2?'双边':'单边')+' · '+zoneLayout.cols+'列×'+zoneLayout.rows+'行';

  // Store all data for apply
  window.planData = { A, B, N, zoneCols: zoneLayout.cols, zoneRows: zoneLayout.rows, zoneW: zoneLayout.zoneW, zoneH: zoneLayout.zoneH, mainPipeLen, tapeLen, tapeSpacing, emitterSpacing, emitterFlow, tapeRollLen, tapeTotalLen, totalTapes, tapesPerZone, zoneTapeLen, lift, dh, totalMu, zoneFlow, pumpHead, pumpPower, motorKW, intensity, manualZoneMu, targetV, flowAreaM2, flowAreaSrc, zoneAreas: mapZoneAreas.slice(), mainPipeOD:'Ø '+mainPipe.od+' mm', branchPipeOD:'Ø '+branchPipe.od+' mm', mainPipeODValue:mainPipe.od, branchPipeODValue:branchPipe.od, mainVelocity:mainPipe.v, branchVelocity:branchPipe.v,
    // 水泵扬程计算中间量，用于施工简图展示
    tapePressure, tapePressureM, existPressure, mainLoss, branchLoss, filterLoss, headBeforeSafety, headBeforeSafetyRaw, safetyFactor: SAFETY_FACTOR, marginHead: MARGIN_HEAD, efficiency, branchCount, branchParallelCount, layoutSides
  };
  /* [v653] 分区管径明细：逐区实切面积 → 各区自己的主/支管建议档（ryZonePipePick 单源，
     与画布逐区标注同一条）。设计值模式下整块隐藏 —— 那时全区一档，明细只会重复同一个数。 */
  (function(){
    var box = document.getElementById('ppZoneCalDetail');
    var head = document.getElementById('ppZoneCalHead');
    if (!box) return;
    if (!__ppCaliberActual || !__ppActuals || !__ppActuals.length) {
      box.style.display = 'none'; box.innerHTML = '';
      if (head) head.style.display = 'none';
      return;
    }
    var rows = '';
    __ppActuals.forEach(function(z){
      var p = window.ryZonePipePick(z.m2, tapeSpacing, emitterSpacing, emitterFlow, targetV, branchParallelCount);
      rows += '<span class="pp-plan-item"><span class="pp-plan-label">' + (z.zi + 1) + '区 · ' + z.mu.toFixed(1) + ' 亩</span>'
        + '<span class="pp-plan-val">' + p.flow.toFixed(1) + '</span><span class="pp-plan-unit">m³/h</span>'
        + '<span class="pp-plan-val">Ø' + p.main.od + '</span><span class="pp-plan-unit">主管</span>'
        + '<span class="pp-plan-val">Ø' + p.branch.od + '</span><span class="pp-plan-unit">支管</span></span>';
    });
    box.innerHTML = rows;
    box.style.display = '';
    if (head) head.style.display = '';
  })();
  // 二级→三级 联动：二级计算完成后，自动把单区参数带入三级系统（若开启"与二级联动"）
  if (window.__tlLinkEnabled !== false && typeof syncThreeLevelFromPlan === 'function') {
    syncThreeLevelFromPlan();
    if (typeof renderThreeLevel === 'function') renderThreeLevel();
    if (typeof tlUpdatePlanBar === 'function') tlUpdatePlanBar();
  }
  if(typeof render==='function') render();
  if(typeof window.ppRender==='function') window.ppRender();
  if(typeof window.ppRefreshDiagramIfVisible==='function') window.ppRefreshDiagramIfVisible();
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
/* [v973] 加入 'planZoneMergeLast'（隐藏 checkbox，由 #planZoneMergeLastBtn 切换）：
   v969 起它从未绑过重算——勾选/取消后面板与画布都不刷新，属遗留缺口。 */
['planTapeLaySide','planTapeSpacing','planEmitterSpacing','planEmitterFlow','planN','planZoneMode','planZoneMuManual','planTargetV','planZoneMergeLast'].forEach(id=>{
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

/* ===== 管径与流量按本页当前分区几何计算：最大分区为单区基准，
   全部分区面积之和严格归一为地图实测总面积。画布逐区标注建议管径，
   「分区管径明细」显示每区的实切亩数 / 流量 / 主管Ø / 支管Ø（小分区自动变细）。 */
function ppCaliberMode(){
  return 'actual';
}
function ppApplyCaliberModeUI(){
  var btn = document.getElementById('ppCaliberModeBtn');
  if (!btn) return;
  var actual = ppCaliberMode() === 'actual';
  btn.classList.toggle('active', actual);
  /* [v973→v990] 按钮搬进顶部工具栏后文案再简化：「设计口径 / 实切口径」两态各 4 字，
     工具栏是图标钮，短名同时用于 aria-label 与 title 前缀；完整语义仍在 title 正文。 */
  var label = '地图面积';
  /* [v990] 工具栏按钮已由 RyIcons 挂上 SVG，直接写 textContent 会把图标子节点
     一并清掉（ry-icons.js v824 记录的病根：点一下按钮图标永久消失、只剩空白方块）
     ⇒ 改走 setLabel 只替换文字节点；RyIcons 尚未加载时退回原写法（那时还没挂 SVG）。 */
  if (window.RyIcons && typeof window.RyIcons.setLabel === 'function') window.RyIcons.setLabel(btn, label);
  else btn.textContent = label;
  /* 工具栏把文字压成图标（font-size:0），aria-label 由 decorateToolbar 按初始文字写入；
     切态后必须自己同步，否则读屏仍报旧口径。 */
  btn.setAttribute('aria-label', label);
  btn.title = '总面积唯一来源：在线地图地块实测面积；分区面积由本页当前分区几何计算并按实测总面积归一。';
}
function ppSetCaliberMode(m){
  ppApplyCaliberModeUI();
  calcPlan();
}
window.ppCaliberMode = ppCaliberMode;
window.ppSetCaliberMode = ppSetCaliberMode;
(function(){
  var b = document.getElementById('ppCaliberModeBtn');
  if (b) b.addEventListener('click', function(){ ppSetCaliberMode(ppCaliberMode() === 'actual' ? 'design' : 'actual'); });
  ppApplyCaliberModeUI();
})();

/* ===== [v973 2026-11-05 用户要求] 「末排并入上排」从 checkbox 行改为切换按钮
   [v990 2026-11-06] 按钮已搬到顶部工具栏、文案简化为「并末排」；隐藏 checkbox #planZoneMergeLast
   仍是数据源（planZoneMergeLastOn() 等消费点零改动），按钮只负责翻转 + 视觉态。
   ★ 顺带补缺口：v969 起该 checkbox 的 change 从未绑过 calcPlan，勾选后不重算；
   现已加入上方输入监听数组（input/change → calcPlan），按钮切换时派发 change。 */
(function(){
  var mb = document.getElementById('planZoneMergeLastBtn');
  var ck = document.getElementById('planZoneMergeLast');
  if (!mb || !ck) return;
  function ppApplyMergeLastUI(){
    mb.classList.toggle('active', !!ck.checked);
    mb.setAttribute('aria-pressed', ck.checked ? 'true' : 'false');
    mb.title = ck.checked
      ? '并末排 · 已开启：末排（含余排）整排并入上一排，分区数减少、单区面积增大。再点一次恢复逐段划分。'
      : '并末排：开启后末排（含被地块边裁出的余排）整排并入上一排，分区数减少、单区面积增大（如 15 区 → 10 区）';
  }
  mb.addEventListener('click', function(){
    ck.checked = !ck.checked;
    ppApplyMergeLastUI();
    ck.dispatchEvent(new Event('change', { bubbles: true }));   // 触发 calcPlan（见输入监听数组）
  });
  ppApplyMergeLastUI();
})();
