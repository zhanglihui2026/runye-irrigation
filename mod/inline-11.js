
window.measuredArea = 0;

function updatePlan(){
  const area = window.measuredArea || 0;
  const tag = document.getElementById('planAreaTag');
  const bar = document.getElementById('ppPlanBar');
  const bar2 = document.getElementById('ppPlanBar2');

  if(area <= 0){
    if(tag) tag.textContent = '未测量';
    if(bar) bar.style.display = 'flex';
    if(bar2) bar2.style.display = 'flex';
    clearPlanResults();
    return;
  }

  const mu = area / 666.67;
  if(tag) tag.innerHTML = '实测 <b>' + area.toFixed(1) + ' m²</b> · ' + mu.toFixed(2) + ' 亩';
  if(bar) bar.style.display = 'flex';
  if(bar2) bar2.style.display = 'flex';
  calcPlan();
}

function clearPlanResults(){
  window.planData = null;
  window.runyePlanDims = null;
  var a=document.getElementById('planA'), b=document.getElementById('planB');
  if(a) a.textContent = '—';
  if(b) b.textContent = '—';
  var ids = ['planIntensity','planPumpFlow','planPumpHead','planPumpPower','planMainPipe','planMainVelocity','planBranchPipe','planBranchVelocity','planBranchSingleLen'];
  ids.forEach(function(id){
    var el = document.getElementById(id);
    if(el) el.textContent = '—';
  });
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
  const manualZoneMu = getManualPlanZoneMu();
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
  document.getElementById('planPumpPower').textContent = motorKW.toFixed(1);
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

// 渲染「扬程计算式」条（紧贴结果栏下方，仅扬程一行紧凑算式，常驻显示；输入实时更新，不换行）
function ppRenderPlanCalcDetail(p) {
  try {
  const el = document.getElementById('ppCalcDetail');
  if (!el) return;
  const N = '<span class="pp-cf-num">';   // 数值
  const O = '<span class="pp-cf-op">';    // 运算符
  const Q = '<span class="pp-cf-eq">';    // 等号
  const R = '<span class="pp-cf-final">'; // 最终结果
  const E = '</span>';

  // 扬程 H = (提升 + 地形 + 入口×10.2 - 已有×10.2 + 主管损失 + 支管损失 + 过滤阀门 + 富余) × 1.10
  const tapeM = p.tapePressure * 10.2;
  const existM = (p.existPressure || 0) * 10.2;
  // 「已有压力」默认 0，对扬程无贡献，从公式行隐藏（计算仍保留）
  // 「主管损失/支管损失」后括弧注明对应管长，便于理解损失对应的几何尺度
  const parts = [
    { lbl: '提升',    v: p.lift },
    { lbl: '地形',    v: p.dh },
    { lbl: '入口压力', v: tapeM },
    { lbl: '主管损失', v: p.mainLoss,  note: '主管 '+Math.round(p.mainPipeLen)+'m' },
    { lbl: '支管损失', v: p.branchLoss, note: p.branchCount+'根×'+Math.round(p.branchLen)+'m/根' },
    { lbl: '过滤阀门', v: p.filterLoss },
    { lbl: '富余',     v: p.marginHead }
  ];
  // 提升/地形 在「精准灌溉」一级系统中对应的表单字段是 fld_lift / fld_dh
  // （calcPlan 只读这两个字段），故 inline 修改必须写回它们，calcPlan 才会连带刷新扬程结果
  const EDITABLE_PARTS = { '提升': 'fld_lift', '地形': 'fld_dh' };
  const partsHtml = parts.map((it, i) => {
    // 已有压力用「−」号，0 时显示为 0.0 保持格式一致
    const sign = it.v < 0 ? '−' : (i === 0 ? '' : '+');
    const abs = Math.abs(it.v);
    const target = EDITABLE_PARTS[it.lbl];
    const valHtml = target
      ? `<input type="number" step="any" min="0" class="pp-cf-num pp-cf-input" data-target="${target}" value="${abs.toFixed(2)}" title="可调节：写回「井/水池提升高度 / 水源至最高点高差」并触发重算，扬程结果实时变化">`
      : `${N}${abs.toFixed(2)}${E}`;
    const noteHtml = it.note ? `<span class="pp-cf-note">（${it.note}）</span>` : '';
    return (i > 0 ? `${O}${sign}${E} ` : '') +
           `${it.lbl} ${valHtml}${noteHtml}`;
  }).join(' ');
  const lineH = `<span class="pp-cf-name">扬程 H</span>` +
                `<span class="pp-cf-eq">= (</span>` +
                partsHtml +
                `<span class="pp-cf-eq">)</span> ` +
                `<span class="pp-cf-op">×</span> ` +
                `${N}${p.safetyFactor.toFixed(2)}${E} ` +
                `<span class="pp-cf-eq">=</span>` +
                `${R}${p.pumpHead.toFixed(2)} m${E}`;

  el.innerHTML = `<span class="pp-cf-line pp-cf-line-h">${lineH}</span>`;
  // 委托：提升/地形 inline input → 写回表单字段并触发重算
  if (!el.dataset._editableBound) {
    el.addEventListener('change', (ev) => {
      const inp = ev.target.closest && ev.target.closest('input.pp-cf-input');
      if (!inp) return;
      const targetId = inp.dataset.target;
      const v = parseFloat(inp.value);
      if (Number.isFinite(v) && targetId) {
        const tgt = document.getElementById(targetId);
        if (tgt) { tgt.value = v; if (typeof calcPlan === 'function') calcPlan(); }
      }
    });
    el.dataset._editableBound = '1';
  }
  } catch(e) { console.error('[ppCalc] 渲染失败：', e); }
}
window.ppRenderPlanCalcDetail = ppRenderPlanCalcDetail;

// 渲染「扬程计算过程」（#ppHeadBreak，三级左栏）：把结果栏的「水泵扬程」逐项拆开，
// 只列计算过程数值，不做文字解释（2026-09-16 第三十六轮按用户要求简化）。
// 纯展示：只读 computeThreeLevel 结果 r，不写回任何输入、不改动扬程结果本身。
function ppRenderHeadBreakdown(r) {
  try {
    const el = document.getElementById('ppHeadBreak');
    if (!el || !r) return;
    const num = (v, d) => (Number.isFinite(v) ? v : 0).toFixed(d === undefined ? 2 : d);
    const tapeM = Number.isFinite(r.tapePressureM) ? r.tapePressureM : (r.tapePressure || 0) * 10.2;
    const existM = (r.existPressure || 0) * 10.2;
    const rows = [
      { k: '提升',     v: r.lift },
      { k: '地形',     v: r.dh },
      { k: '入口压力', v: tapeM },
      { k: '已有压力', v: -existM },
      { k: '总管损失', v: r.frontPipeLoss },
      { k: '主管损失', v: r.mainLoss },
      { k: '支管损失', v: r.branchLoss },
      { k: '过滤阀门', v: r.filterLoss },
      { k: '富余',     v: (r.marginHead !== undefined) ? r.marginHead : MARGIN_HEAD }
    ];
    const sf = Number.isFinite(r.safetyFactor) ? r.safetyFactor : SAFETY_FACTOR;
    const sum = rows.reduce((a, x) => a + (Number.isFinite(x.v) ? x.v : 0), 0);
    const sub = Number.isFinite(r.headBeforeSafety) ? r.headBeforeSafety : Math.max(0, sum);
    const total = Number.isFinite(r.pumpHead) ? r.pumpHead : sub * sf;
    const rowHtml = rows.map(function (x) {
      const v = Number.isFinite(x.v) ? x.v : 0;
      return '<div class="pphb-row"><span class="pphb-k">' + x.k + '</span>'
        + '<span class="pphb-v">' + (v < 0 ? '\u2212' : '') + num(Math.abs(v)) + '</span></div>';
    }).join('');
    el.innerHTML = '<summary>水泵扬程 ' + num(total, 1) + ' m（' + num(sub, 1) + ' \u00d7 ' + num(sf, 2) + '）</summary>'
      + rowHtml
      + '<div class="pphb-row pphb-sum"><span class="pphb-k">小计</span>'
      + '<span class="pphb-v">' + num(sub) + '</span></div>'
      + '<div class="pphb-row pphb-sum pphb-final"><span class="pphb-k">扬程（\u00d7' + num(sf, 2) + '）</span>'
      + '<span class="pphb-v">' + num(total) + '</span></div>';
    el.hidden = false;
  } catch (e) { console.error('[ppHeadBreak] 渲染失败：', e); }
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

// ===== 07 管路规划与施工简图 =====
(function(){
  var ppCanvas=document.getElementById('ppCanvas');
  var ppCtx=ppCanvas.getContext('2d');
  var ppWrap=document.getElementById('ppCanvasWrap');
  var ppHintEl=document.getElementById('ppHint');
  var ppToolbar=document.getElementById('ppToolbar');
  var ppEmpty=document.getElementById('ppEmpty');
  var ppLegend=document.getElementById('ppLegend');
  var ppPickResult=document.getElementById('ppPickResult');

  var ppState={
    mode:'main',
    mainPipes:[],branchPipes:[],subBranchPipes:[],source:null,valves:[],
    currentLine:[],polyPts:[],transform:null,hoverPt:null,mouseWorld:null,lastSVG:null,
    lineDrawMode:'free',
    pipeLevel:'two',
    pickedPipe:null,
    hiddenPipes:{main:{},branch:{},subbranch:{}},
    pipeIds:{main:[],branch:[],subbranch:[]},
    nextPipeId:1,
    zoneRotated:false,
    plotRotationDeg:0,
    plotMirror:'none',
    zoom:1, panX:0, panY:0, isPanning:false, panStartX:0, panStartY:0,
    cutOverrides:{x:{},y:{}},
    // 手动调整后的内部切割线位置快照（世界坐标，升序）；sig 用于识别基础划分是否变化
    cutSnap:{sig:'',x:null,y:null},
    mergePreview:null, // 拖动中待合并预览 {axis,index,target}
    dragCut:null,
    hoverCut:null,
    lastSelectedCut:null,
    areaLocked:false, // 分区面积锁定：开启后拖动/微调网格线只整体平移、各区面积不变（任务K 2026-09-26）
    zoneAuto:true,    // [v185] 地块划分开关：true=自动划分并显示分区线；false=隐藏自动分区线（改手动，见 ppSetZoneAuto）
    history:[]
  };

  /* [v201] 「此刻正在按**某一块自己的环**算分区」的临时开关。
     ★ 为什么还需要它（v197 只认 mode==='perPlot' 不够）：
        ① 整组态跑「自动管路」是逐块调 ppBuildAutoPipes —— 彼时 ge.mode 仍是
           'whole'，若无此开关就会拿**整组估算 dims** 去切每一块 ⇒ 同一块
           在整组态生成 36 根主管、切到逐块态却只有 14 根（实测），口径串了；
        ② 「成组管路」页画各块分区线走 RunyeBridge.zoneCutsFor(bb,…)，
           bb 就是那一块的 bbox ⇒ 同样必须按本块尺寸算。
       单地块 / 二级页整组视图不受影响（那条路径不置此标志）。 */
  var ppOwnDimOverride=false;

  function ppGetPlanDims(b){
    /* [v197] 成组**逐块**模式：分区以「本块真实尺寸」为准（sx=sy=1）。
       ★★ 为什么（2026-10-04 用户实测截图抓到）：runyePlanDims 是按**回传时刻的
         实测面积**（整组）算的全局规划尺寸（如 650×420）；逐块编辑拿本块 bounds
         （如 300×400）去除以整组 dims ⇒ sx·sy≈块/整组面积比 ≈0.44
         ⇒ 「18 亩/区」实际切出 ≈7.9 亩的区（用户截图 6.4~8.9 亩），且区数按
         整组 dims 切（11×3），整组 9 区 vs 逐块 33 区对不上 —— 设定形同虚设。
       ⇒ 修在上游（v189 原则：改这里而不是改渲染）：逐块时 dims=本块 bounds，
         每区 = 固定边×另一边 = 真实的 18 亩；布管/材料/水力/三级页（走
         Bridge.getZoneCuts / getPlanDims）**全链路自动跟随**，无需各自改。
       ★ 单地块与整组模式不变：dims 本来就由实测面积推算（sx≈1），是设定口径；
         整组视图用户已认可（截图 1），不动。 */
    var gePer=window.__runyeGroupEdit;
    if((ppOwnDimOverride||(gePer&&gePer.active&&gePer.mode==='perPlot'))&&b&&b.w>0&&b.h>0){
      return { w:b.w, h:b.h };
    }
    var aEl=document.getElementById('planA');
    var bEl=document.getElementById('planB');
    var stDims=window.runyePlanDims||{};
    var planW=(isFinite(stDims.A)&&stDims.A>0)?stDims.A:parseFloat(aEl?aEl.textContent:'');
    var planH=(isFinite(stDims.B)&&stDims.B>0)?stDims.B:parseFloat(bEl?bEl.textContent:'');
    return {
      w:(isFinite(planW)&&planW>0)?planW:b.w,
      h:(isFinite(planH)&&planH>0)?planH:b.h
    };
  }

  function ppGetZoneLayout(b,planN){
    /* [v189 2026-10-03] 用户纠正口径（务必守住）：
       「地块划分」开关**关闭** = 该地块**完全不自动划分分区**（整块当一个区），
       而**不是**之前实现的「只是把分区线藏起来、数据照常算」。
       用户原话：「如果这个开关关闭之后，地块就不自动划分分区了，你修改过来。」
       ⇒ 做法：在最上游 ppGetZoneLayout 直接返回「1 列 × 1 行」的单区布局，
         于是所有下游（分区线渲染 / 分区数 / 面积 / 水力 / 材料 / 三级工作区）
         拿到的都是「一个区」，**天然全链路一致**，不会出现「画面是一个区、
         计算按四个区」这种自相矛盾。
       ⇒ 为什么改这里而不是改渲染：渲染只是末端；改末端会留下「数据仍是 4 区」
         的半吊子状态（正是上一版被用户否掉的那种做法）。
       ⇒ 三个开关口径的分工（别混）：
         · 本开关 = 要不要**自动划分**（关闭 → 不划，整块一区）；
         · 「调网格」= 自动划分之后，**手动微调**分区线位置；
         · 「重置网格」= 把分区线恢复成系统默认位置。
       ★★ 单位口径（v189 修正，踩过坑）：`zoneW/zoneH` 必须是 **plan 米**，
         而不是 `b.w/b.h`（后者是 SVG 像素包围盒）。原因：下游 `ppGetZoneCuts`
         拿 `zoneW/zoneH` 去和 `ppGetPlanDims()` 的 plan 米（planA/planB）做运算
         (`ppSplitLength(dims.w, xDesign)`)；单位一旦混用，像素值通常远大于 plan 米，
         `ppSplitLength` 的 `while` 会多切一刀 ⇒ 关闭分区后仍会残留 2 个分区（实测）。
       ★★ 第二个坑（也是实测踩到）：`ppGetZoneCuts` 里有**长短边互换**逻辑 ——
         `longIsX = dims.w >= dims.h; xDesign = longIsX ? shortSide : longSide;`
         ⇒ `xDesign` 取的是 `zoneW/zoneH` 里**较短**的那条！所以只把「对应轴」给足
         （如 zoneW=planW=600 / zoneH=planH=400）会被换成 xDesign=400 < 600
         ⇒ `ppSplitLength(600,400)` = [400,200] ⇒ **仍切 2 格**。
         ⇒ 正确做法：`zoneW/zoneH` **两条都给「整块的对角上限」**（≥ max(planW,planH)），
           这样无论长短边怎么互换，`ppSplitLength(total, step>=total)` 都只返回 1 段。
           取 `Math.hypot(w,h)` 作为统一的「比任何边都大」的安全上界，
           保证 `step ≥ total` 恒成立（hypot ≥ max(W,H) ≥ 任何单边）。 */
    if(!ppZoneAutoOn()){
      /* 取「根本不切」的等价布局：设计边长给「比整块任何边都大」的值，
         `ppSplitLength(total,total)` 的 `while(total-used > step+0.05)` 立即为假 ⇒ 返回 [total]（1 段）。
         ⇒ 1 × 1 = 1 个区，全链路一致。 */
      var _d0=ppGetPlanDims(b);
      var _big=Math.hypot(_d0.w||1,_d0.h||1);   // ≥ max(planW,planH)，长短边互换后仍 ≥ 任何边
      return {
        cols:1, rows:1, N:1,
        zoneW:_big, zoneH:_big,
        drawZoneW:_big, drawZoneH:_big,
        zoneArea:(_d0.w||1)*(_d0.h||1), rotated:false,
        autoOff:true
      };
    }
    var dims=ppGetPlanDims(b);
    var base=calcPlanZoneLayout(dims.w,dims.h,planN,getManualPlanZoneMu());
    // 计算与图面共用轴向切分尺寸；旋转后按地块实际边长重新计数。
    var xDesign=ppState.zoneRotated?base.designH:base.designW;
    var yDesign=ppState.zoneRotated?base.designW:base.designH;
    var cols=splitZoneLength(dims.w,xDesign).length;
    var rows=splitZoneLength(dims.h,yDesign).length;
    return {
      cols:cols,
      rows:rows,
      N:cols*rows,
      designW:xDesign, designH:yDesign,
      zoneW:ppState.zoneRotated?base.zoneH:base.zoneW,
      zoneH:ppState.zoneRotated?base.zoneW:base.zoneH,
      drawZoneW:ppState.zoneRotated?base.drawZoneH:base.drawZoneW,
      drawZoneH:ppState.zoneRotated?base.drawZoneW:base.drawZoneH,
      zoneArea:base.zoneArea,
      rotated:ppState.zoneRotated
    };
  }

  function ppResize(){
    ppCanvas.width=ppWrap.clientWidth;
    ppCanvas.height=ppWrap.clientHeight;
    ppUpdateTransform();ppRender();
  }

  function ppLoadPolygon(){
    if(!window.measuredPolygon||window.measuredPolygon.length<3){
      ppHintEl.style.display='block';ppToolbar.style.display='flex';
      ppEmpty.style.display='block';ppLegend.style.display='none';
      ppState.polyPts=[];ppState.transform=null;ppRender();return;
    }
    ppHintEl.style.display='none';ppToolbar.style.display='flex';
    ppEmpty.style.display='none';ppLegend.style.display='flex';
    ppState.polyPts=window.measuredPolygon.map(function(p){return{x:p.x,y:p.y};});
    /* [v193] 成组地块：初始化「整组 / 逐块」编辑状态（非成组 → 置 null，UI 自动隐藏）。
       必须在 ppUpdateTransform 之前，因为整组/逐块会决定 bounds 用的是外框还是某一块。 */
    ppInitGroupEdit();
    ppResetCutSnap('');
    ppUpdateTransform();ppRender();
  }
  window.ppLoadPolygon=ppLoadPolygon;
  window.ppGetPolyPts=function(){ return ppState.polyPts.map(function(p){return{x:p.x,y:p.y};}); };

  // ===== 数据传导桥：供三级页读取二级页的分区网格与管线几何（二级页状态 ppState 为 IIFE 私有，三级页顶层函数访问不到，故在此暴露）=====
  window.RunyeBridge = {
    get state(){ return ppState; },
    getZoneCuts: function(){
      if(!ppState.polyPts.length) return null;
      var b=ppGetBounds();
      var planN=parseInt((document.getElementById('planN')&&document.getElementById('planN').value))||4;
      var zl=ppGetZoneLayout(b,planN);
      return ppGetZoneCuts(b,zl);
    },
    getPlanDims: function(){ return ppGetPlanDims(ppGetBounds()); },
    /* [v194] 供「成组管路」页驱动二级页的整组/逐块状态机（pp* 全在 IIFE 里，外面够不着）。
       成组管路页要「按块进入三级页」，必须先让二级页切到那一块 —— 因为三级页的
       分区网格走 getZoneCuts()（读 ppState.polyPts），不切就会拿错那一块的分区。 */
    groupEdit: function(){ return window.__runyeGroupEdit||null; },
    setGroupMode: function(m){ if(typeof ppSetGroupMode==='function') ppSetGroupMode(m); },
    selectGroupPlot: function(i){ if(typeof ppSelectGroupPlot==='function') ppSelectGroupPlot(i); },
    /* [v242] 成组编辑区的 UI 同步（含「◀ 返回成组管路」的显隐，它读 window.__runyeGroupPlotEdit）。
       成组管路页切进来 / 退回去都要立刻刷一次，否则按钮要等到下一次选块才跟上。 */
    syncGroupEditUI: function(){ if(typeof ppSyncGroupEditUI==='function') ppSyncGroupEditUI(); },
    /* [v194] 把二级页**此刻正在编辑**的那一块取出来（逐块态才有意义；整组态是合并视图）。
       ★ 为什么必须有它：ge.slots[i] 只在「切块 / 切模式」时才从 ppState 捕获，
         用户在二级页画完管**直接切到成组管路页**时，slots[i] 还是旧的 ⇒ 刚画的管看不见。
         （_p1/_probe_group_work.cjs 的 G5c 实测抓到：二级页 mainPipes=1，组页 slot=0。）
       ppCaptureSlot() 是纯函数（只读 ppState 造一个新对象），不会动 ge.slots。 */
    /* [v201] 成组管路页要能「一键给全组各块布管 / 清管」。
       ppAutoGeneratePipes / ppClearPipes 全在 IIFE 里 ⇒ 只在本侧暴露入口，
       内部**就是二级页同一套**（已按整组态逐块生成、写回各块 slot）—— 不写第二份算法。 */
    autoPipesWhole: function(){ try{ ppAutoGeneratePipes(); return true; }catch(e){ return false; } },
    clearPipesWhole: function(){ try{ ppClearPipes(); return true; }catch(e){ return false; } },
    groupLiveSlot: function(){
      var ge=window.__runyeGroupEdit;
      if(!ge||!ge.active||ge.mode!=='perPlot') return null;
      try{ return ppCaptureSlot(); }catch(e){ return null; }
    },
    /* [v196] 供「成组管路」页按块画分区线（用户原话：「这个页面要把管路跟每个地块
       分区都显示出来」）。分区几何**必须复用本 IIFE 内的同一套函数**（ppGetZoneLayout /
       ppGetZoneCuts），不写第二份算法 —— 但这两个函数内部读全局 ppState.cutSnap /
       cutOverrides，而每块自己的快照在 slot 里 ⇒ 由本桥做「换入 → 算 → 还原」
       （try/finally；ppGetZoneCuts 在 sig 不匹配时会经 ppResetCutSnap 改写
       cutSnap 和 mergePreview，两个都要还原）。
       ★ 成组页 IIFE 里没有 ppState / ppGetZoneCuts（跨 IIFE 够不着）——
         v196 第一版直接引用直接 ReferenceError（group_work 探针 FATAL 抓到）。 */
    zoneCutsFor: function(bb, planN, cutSnap, cutOverrides){
      if(!bb||!(bb.w>0.5)||!(bb.h>0.5))return null;
      var keepSnap=ppState.cutSnap, keepOv=ppState.cutOverrides, keepMp=ppState.mergePreview, keepOwn=ppOwnDimOverride;
      try{
        ppState.cutSnap=cutSnap||{sig:'',x:null,y:null};
        ppState.cutOverrides=cutOverrides||{x:{},y:{}};
        ppOwnDimOverride=true;   /* [v201] 传进来的 bb 就是某一块的 bbox ⇒ 按本块尺寸分区 */
        var zl=ppGetZoneLayout(bb,planN);
        return ppGetZoneCuts(bb,zl);
      }catch(e){ return null; }
      finally{ ppState.cutSnap=keepSnap; ppState.cutOverrides=keepOv; ppState.mergePreview=keepMp; ppOwnDimOverride=keepOwn; }
    },
    /* 非标分区判断用的两个纯函数桥（成组页只算本块自己的环，不能走
       ppZoneActualAreaM2 —— 那个在成组时会经 ppGetSubPlotRings() 把全部
       成员环都裁剪进来，本块 cell 会被别的块污染）。 */
    clipPolyToRect: function(poly,x0,y0,x1,y1){ try{ return ppClipPolyToRect(poly,x0,y0,x1,y1); }catch(e){ return null; } },
    polyArea: function(poly){ try{ return ppPolyArea(poly); }catch(e){ return 0; } },
    /* v98d：三级画布拖动「组边界线」→ 复用二级的分区线位置（写回共享 cutSnap），二级/三级同步。
       allowMerge=false 时不触发「拖到邻线即合并」，以保护手动分组的区号不失效。 */
    cutDragBegin: function(){ try{ ppPushHistory(); }catch(e){} },
    cutDragTo: function(axis,index,worldVal,allowMerge){
      var r=null;
      try{ r = allowMerge ? ppDragCutTo(axis,index,worldVal) : ppDragCutPosOnly(axis,index,worldVal); }catch(e){}
      try{ ppRender(); }catch(e){}
      return r;
    },
    cutDragEnd: function(allowMerge){
      var merged=false;
      if(allowMerge){ try{ merged=ppCommitMerge(); }catch(e){} }
      else { try{ ppState.mergePreview=null; }catch(e){} }
      try{ ppRender(); }catch(e){}
      ppRefreshTLAfterCuts();
      return merged;
    },
    getCuts: function(){ var c=ppCurrentCuts(); return c?{xPos:c.xPos.slice(),yPos:c.yPos.slice(),cols:c.cols,rows:c.rows}:null; },
    /* ===== v98h 三级「阶梯分区」拖动（只动被抓的那一段，不动同一线上的其它段）=====
       lane = 行号（axis='x' 时）/ 列号（axis='y' 时），由工作区命中时给出。
       写入 window.tlZoneStep（稀疏覆盖表）并同步当前快照 zones.cutOffX/cutOffY
       （画布克隆底图 / 逐格面积 / 流量都读它）；返回值把两张表回给工作区做防御性同步。 */
    cutStepDragBegin: function(){ try{ ppPushHistory(); }catch(e){} },
    cutStepDragTo: function(axis,index,lane,worldVal){
      try{
        if(lane==null) return null;
        var base=ppCurrentCuts(); if(!base) return null;
        var arr=(axis==='x')?base.xPos:base.yPos;
        if(index<=0||index>=arr.length-1) return null;
        var spec={cols:base.cols,rows:base.rows,xPos:base.xPos,yPos:base.yPos};
        var st=tlZoneStepFor(spec);
        if(!st){ window.tlZoneStep={sig:tlZoneGridSig(spec),x:{},y:{}}; st=window.tlZoneStep; }
        var map=(axis==='x')?st.x:st.y;
        var key=lane+','+index;
        var getv=function(k){ var v=map[lane+','+k]; if(v!=null&&isFinite(v)) return v; return arr[k]; };
        var lo=getv(index-1), hi=getv(index+1);
        var minGap=Math.max(2,4*ppWorldPerPixel(axis));
        var lo2=lo+minGap, hi2=hi-minGap;
        if(lo2>hi2) lo2=hi2=(lo+hi)/2;
        map[key]=Math.max(lo2,Math.min(hi2,worldVal));
        if(window.tlDiagramData&&window.tlDiagramData.zones){
          window.tlDiagramData.zones.cutOffX=st.x;
          window.tlDiagramData.zones.cutOffY=st.y;
        }
        return {ok:true,x:st.x,y:st.y,pos:map[key]};
      }catch(e){ return null; }
    },
    cutStepDragEnd: function(){
      var st=window.tlZoneStep;
      if(st&&st.x&&st.y&&window.tlDiagramData&&window.tlDiagramData.zones){
        window.tlDiagramData.zones.cutOffX=st.x;
        window.tlDiagramData.zones.cutOffY=st.y;
      }
      /* ⚠ 这里**故意不**调 runyeSaveProject()：它内部会 projectToast('方案已保存到本机')，
         等于每松一次手就弹一次提示（v98d 真渲染闸门的「生成图过程中无 alert 弹窗」会因此变红）。
         旧路径 cutDragEnd 同样不落盘 —— 拖动只改内存，落盘交给用户点「保存」。
         阶梯覆盖表不会丢：它既进 saveProject 的 zoneStep 字段，也随
         tlDiagramData.zones.cutOffX/Y 走 isoDiagram.data。 */
      return tlZoneStepCount();
    },
    cutStepReset: function(){
      tlZoneStepClear();
      if(window.tlDiagramData&&window.tlDiagramData.zones){
        window.tlDiagramData.zones.cutOffX=null; window.tlDiagramData.zones.cutOffY=null;
      }
      return true;
    },
    zoneStepCount: function(){ return tlZoneStepCount(); }
  };

  function ppGetBounds(){
    var minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(var i=0;i<ppState.polyPts.length;i++){
      var p=ppState.polyPts[i];
      if(p.x<minX)minX=p.x;if(p.x>maxX)maxX=p.x;
      if(p.y<minY)minY=p.y;if(p.y>maxY)maxY=p.y;
    }
    return{minX:minX,minY:minY,w:maxX-minX,h:maxY-minY};
  }

  function ppBoundsFromPoints(points){
    var minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(var i=0;i<points.length;i++){
      var p=points[i];
      if(p.x<minX)minX=p.x;if(p.x>maxX)maxX=p.x;
      if(p.y<minY)minY=p.y;if(p.y>maxY)maxY=p.y;
    }
    return{minX:minX,minY:minY,w:maxX-minX,h:maxY-minY};
  }

  function ppRotatePoint(pt,deg,center){
    if(!deg)return{x:pt.x,y:pt.y};
    var rad=deg*Math.PI/180;
    var c=Math.cos(rad),s=Math.sin(rad);
    var dx=pt.x-center.x,dy=pt.y-center.y;
    return{x:center.x+dx*c-dy*s,y:center.y+dx*s+dy*c};
  }

  function ppPointInPlot(point){
    if(!ppState.polyPts||ppState.polyPts.length<3)return true;
    var fn=window.atPointInPolygon||atPointInPolygon;
    if(typeof fn!=='function')return true;
    /* [v190] 成组地块：落在**任一成员环**内才算地块内 —— 落在块间空隙里不算
       （否则空隙里能放阀门/吸管线，与「空隙不算面积」矛盾）。 */
    var rings=ppGetSubPlotRings();
    if(rings){
      for(var i=0;i<rings.length;i++){
        if(rings[i].length>=3&&fn(point,rings[i]))return true;
      }
      return false;
    }
    return fn(point,ppState.polyPts);
  }

  function ppGetRotatedPlotPoints(){
    if(!ppState.polyPts.length)return [];
    var deg=parseFloat(ppState.plotRotationDeg)||0;
    if(!deg)return ppState.polyPts.map(function(p){return{x:p.x,y:p.y};});
    var b=ppGetBounds();
    var center={x:b.minX+b.w/2,y:b.minY+b.h/2};
    return ppState.polyPts.map(function(p){return ppRotatePoint(p,deg,center);});
  }

  /* ===== [v190 2026-10-03] 成组地块的「各子地块环」（本地米坐标） =====
   * 用户原话：「在线地图中两个地块之间明显是有空隙的，你怎么就给吃掉了。」
   * 地图侧回传的 payload.subPlots（各子地块自己的环）由 applyMapMeasuredArea 存到
   * window.__runyeSubPlots。v189 只存不用 ⇒ 二级页仍画 ppState.polyPts（凸包），空隙被吞。
   * v190 起绘制/算面积优先按这些环：
   *   · 画布（ppTracePlotPath）与施工图（ppGenerateDiagram 的 d）按每个环各画一圈，
   *     块间空隙自然留空；
   *   · 分区实际面积（ppZoneActualAreaM2）= Σ 各环裁剪到分区内的面积（空隙不计入）；
   *   · 点位判定（ppPointInPlot）= 落在任一成员环内（落在空隙里不算地块内）。
   * ★ 坐标同步：这些环与 ppState.polyPts 同一世界坐标系，但**必须跟随旋转/镜像同步变换**
   *   （同步点：ppRepartitionFromRotatedPlot 旋转落定、ppApplyMirror 两次镜像），
   *   否则主轮廓转了、子地块环没转，两者错位。
   * 「地块角度」输入框（ppState.plotRotationDeg）只影响显示、不重写数据 —— 所以显示层的
   * 环用 ppGetRotatedSubRings()（与 ppGetRotatedPlotPoints 同口径临时旋转），
   * 数据/面积层用 ppGetSubPlotRings()（数据坐标，与 polyPts/zoneCuts 同空间）。 */
  function ppGetSubPlotRings(){
    /* [v193] 按编辑模式取环：整组=全部成员环；逐块=只有当前那一块。
       ⇒ 下游（画布 / 施工图 / 面积 / 点位判定）不用改一行就自动跟着模式走。 */
    var subs=ppGroupActiveSubs();
    if(!subs||!subs.length)return null;
    var rings=[];
    subs.forEach(function(s){
      if(s&&Array.isArray(s.poly)&&s.poly.length>=3){
        rings.push(s.poly.map(function(q){return{x:+q.x,y:+q.y};}));
      }
    });
    return rings.length?rings:null;
  }
  function ppGetRotatedSubRings(){
    var rings=ppGetSubPlotRings();
    if(!rings)return null;
    var deg=parseFloat(ppState.plotRotationDeg)||0;
    if(!deg)return rings;
    var b=ppGetBounds();
    var center={x:b.minX+b.w/2,y:b.minY+b.h/2};
    return rings.map(function(r){return r.map(function(p){return ppRotatePoint(p,deg,center);});});
  }
  /* 对 window.__runyeSubPlots 里的环就地应用变换（旋转落定 / 镜像时随主轮廓一起变） */
  function ppXformSubRings(fn){
    var subs=window.__runyeSubPlots;
    if(!subs||!subs.length)return;
    subs.forEach(function(s){
      if(s&&Array.isArray(s.poly)&&s.poly.length>=3)s.poly=s.poly.map(fn);
    });
  }

  /* ================= [v193 2026-10-03] 成组地块「整组 / 逐块」编辑 =================
   * 用户原话：「成组地块传到二级管路之后，进一步编辑的话，再给我一个切换按钮，这个
   *   单独编辑，跟三级管路编辑页面分开，否则我担心跟原来的一些计算规则跟逻辑搞混了。」
   * 用户拍板：① 逐块单独编辑 ② 先不让成组地块进三级页 ③ 各块结果完全独立
   *          ④ 旋转/镜像作用于整组 ⑤ 施工图出一张总图
   *
   * ★★ 设计原则：**不写成组的“新算法”，而是让成组退化成“多次单块”**。
   *   逐块模式下 ppState.polyPts 就是那一块自己的环 ⇒ 分区 / 布管 / 面积 / 材料 / 水力
   *   **全部走现有单地块逻辑，一行都不改** ⇒ 结构上不可能与单块规则串味。
   *   这正是用户担心的那件事的解法：不是“小心别搞混”，而是“根本没有两套规则”。
   *
   * 两种模式：
   *   · whole   整组：只读总览 —— 画全部成员环 + 全部块的管线（合并显示）+ 总管；
   *                    **不可编辑管线**（编辑必须切到逐块，否则分不清画的是哪块）
   *   · perPlot 逐块：一次只编辑一块，ppState 整份换成本块的 slot
   *
   * 每块一份 slot 的字段（PP_SLOT_KEYS）—— 视图类（zoom/pan/transform）与
   * 整组类（plotRotationDeg / plotMirror / zoneAuto / mode）**不进 slot**，切块时保持不变。
   */
  var PP_SLOT_KEYS=['polyPts','mainPipes','branchPipes','subBranchPipes','source','valves',
    'pipeIds','nextPipeId','hiddenPipes','cutOverrides','cutSnap','mergePreview','areaLocked'];

  function ppCloneJSON(v){ try{ return JSON.parse(JSON.stringify(v===undefined?null:v)); }catch(e){ return null; } }

  function ppCaptureSlot(){
    var s={};
    PP_SLOT_KEYS.forEach(function(k){ s[k]=ppCloneJSON(ppState[k]); });
    return s;
  }
  function ppApplySlot(s){
    if(!s)return;
    PP_SLOT_KEYS.forEach(function(k){ ppState[k]=ppCloneJSON(s[k]); });
    /* [v242] 根因修复（「双击地块进三级页」这条路上实测撞出来的）：
       ppCloneJSON(undefined) 走的是 JSON.stringify(null) ⇒ **null**，于是「缺字段的
       slot」（老版本存档、或只带 mainPipes/branchPipes 的最简 slot）会把
       polyPts / mainPipes… 直接置成 null；而下游到处是 `if(!ppState.polyPts.length)`
       这种判空 —— null.length 自己就 TypeError。触发链很短：rySetTab 末尾派发一次
       resize → ppResize → ppRender / ppUpdateTransform 就炸，控制台连刷
       「Cannot read properties of null」。这里按 ppState 初值的语义把**数组型**字段
       补齐成空数组（只补 null/undefined，不动已有值），一处修根，不再逐个补防御。 */
    ['polyPts','mainPipes','branchPipes','subBranchPipes','valves'].forEach(function(k){
      if(ppState[k]==null) ppState[k]=[];
    });
  }
  function ppBlankSlot(polyPts){
    return {
      polyPts:(polyPts||[]).map(function(q){return{x:+q.x,y:+q.y};}),
      mainPipes:[],branchPipes:[],subBranchPipes:[],source:null,valves:[],
      pipeIds:{main:[],branch:[],subbranch:[]},nextPipeId:1,
      hiddenPipes:{main:{},branch:{},subbranch:{}},
      cutOverrides:{x:{},y:{}},cutSnap:{sig:'',x:null,y:null},mergePreview:null,areaLocked:false
    };
  }

  /* 载入成组地块时初始化（非成组 → 置 null，UI 自动隐藏） */
  function ppInitGroupEdit(){
    var subs=window.__runyeSubPlots;
    if(!subs||subs.length<2){ window.__runyeGroupEdit=null; ppSyncGroupEditUI(); return false; }
    var frame=(window.measuredPolygon||[]).map(function(p){return{x:+p.x,y:+p.y};});
    window.__runyeGroupEdit={
      active:true, mode:'whole', current:0,
      framePts:frame,                                   // 整组模式用的参考外框（不参与面积）
      slots:subs.map(function(s){ return ppBlankSlot(s.poly); }),
      trunkPipes:[], trunkHidden:{}                     // 总管：跨块手动画，不进各块统计
    };
    ppSyncGroupEditUI();
    return true;
  }

  /* 当前编辑对象的环：非成组=null（走 polyPts）；整组=全部成员环；逐块=[当前块] */
  function ppGroupActiveSubs(){
    var subs=window.__runyeSubPlots;
    if(!subs||!subs.length)return null;
    var ge=window.__runyeGroupEdit;
    if(ge&&ge.active&&ge.mode==='perPlot'){
      var one=subs[ge.current];
      return one?[one]:null;
    }
    return subs;
  }

  function ppSetGroupMode(mode){
    var ge=window.__runyeGroupEdit;
    if(!ge||!ge.active)return;
    mode=(mode==='perPlot')?'perPlot':'whole';
    if(ge.mode===mode){ ppSyncGroupEditUI(); return; }
    if(mode==='perPlot'){
      /* 整组 → 逐块：整组态的管线是「各块合并出来的只读视图」，不存档；
         直接载入当前块的 slot（坐标都是同一世界坐标系，无需换算） */
      ge.mode='perPlot';
      ppApplySlot(ge.slots[ge.current]);
      ppState.history=[];                 // 撤销栈不跨块
    }else{
      /* 逐块 → 整组：先把当前块存回 slot，再切成外框 + 合并视图 */
      ge.slots[ge.current]=ppCaptureSlot();
      ge.mode='whole';
      ppState.polyPts=ge.framePts.map(function(p){return{x:p.x,y:p.y};});
      var merged=ppCollectGroupAllPipes();
      ppState.mainPipes=merged.main; ppState.branchPipes=merged.branch;
      ppState.subBranchPipes=merged.subbranch;
      ppState.source=null; ppState.valves=[];
      ppState.pipeIds={main:[],branch:[],subbranch:[]}; ppState.nextPipeId=1;
      ppState.hiddenPipes={main:{},branch:{},subbranch:{}};
      ppEnsurePipeIds('main');ppEnsurePipeIds('branch');ppEnsurePipeIds('subbranch');
      ppState.history=[];
    }
    /* 模式跟着切：[v194] 整组态没有任何可画的块级模式了（总管已迁去「成组管路」页），
       统一落到「管线拾取」（只读量长度）；逐块态回到「主管」。
       不跟着切的话，切完仍停在被禁用的模式上，画面上看不出为什么点不动。 */
    if(mode==='whole'){ if(ppGroupEditBlocks(ppState.mode))ppState.mode='pickPipe'; }
    else { if(ppState.mode==='pickPipe')ppState.mode='main'; }
    ppState.currentLine=[]; ppState.hoverPt=null; ppState.dragCut=null; ppState.hoverCut=null;
    if(mode==='whole') ppResetCutSnap('');
    ppUpdateTransform(); ppRender();
    ppSyncGroupEditUI();
    ppRefreshDiagramOrReset();
  }

  function ppSelectGroupPlot(i){
    var ge=window.__runyeGroupEdit;
    if(!ge||!ge.active)return;
    i=parseInt(i,10)||0;
    if(i<0||i>=ge.slots.length||i===ge.current)return;
    if(ge.mode==='perPlot') ge.slots[ge.current]=ppCaptureSlot();   // 存档旧块
    ge.current=i;
    /* [v242] 「从成组页进来」时换块 ⇒ 返回落点跟着换（退回成组页要停在用户最后看的那一块，
       否则按块高亮会指回原来那块，用户会以为没生效）。非该路径进来的不置标记。 */
    if(window.__runyeGroupPlotEdit!=null)window.__runyeGroupPlotEdit=i;
    if(ge.mode==='perPlot') ppApplySlot(ge.slots[i]);               // 载入新块
    ppState.currentLine=[]; ppState.hoverPt=null;
    ppState.dragCut=null; ppState.hoverCut=null; ppState.history=[];
    // Keep the selected block's saved cuts; getZoneCuts validates the geometry signature.
    ppUpdateTransform(); ppRender();
    ppSyncGroupEditUI();
    ppUpdateAutoPipeButton(); ppUpdatePickResult(null);
    ppRefreshDiagramOrReset();
  }

  /* 整组态的「只读合并视图」：各块管线 + 总管（用于总览与出总图） */
  function ppCollectGroupAllPipes(){
    var ge=window.__runyeGroupEdit;
    var out={main:[],branch:[],subbranch:[]};
    if(!ge||!ge.active)return out;
    ge.slots.forEach(function(s){
      (s.mainPipes||[]).forEach(function(l){out.main.push(l.map(function(p){return{x:p.x,y:p.y};}));});
      (s.branchPipes||[]).forEach(function(l){out.branch.push(l.map(function(p){return{x:p.x,y:p.y};}));});
      (s.subBranchPipes||[]).forEach(function(l){out.subbranch.push(l.map(function(p){return{x:p.x,y:p.y};}));});
    });
    return out;
  }

  /* [v193] 旋转落定 / 镜像后：把变换作用到**整组的全部对象** ——
     各块的环与管线、参考外框、总管（用户拍板 ④：旋转/镜像作用于整组）。
     opt.clearPipes=true（重新分区会清空管线）时只转几何、顺带清空各块管线与总管。
     结束后把当前块 slot 回灌 ppState —— 这样调用方里对 ppState 的那一份变换会被
     正确结果覆盖，不会「转两次」。 */
  function ppXformGroupAll(fn,opt){
    var ge=window.__runyeGroupEdit;
    if(!ge||!ge.active)return false;
    opt=opt||{};
    if(Array.isArray(ge.framePts))ge.framePts=ge.framePts.map(fn);
    ge.slots.forEach(function(s){
      if(Array.isArray(s.polyPts))s.polyPts=s.polyPts.map(fn);
      if(opt.clearPipes){
        s.mainPipes=[];s.branchPipes=[];s.subBranchPipes=[];s.source=null;s.valves=[];
      }else{
        ['mainPipes','branchPipes','subBranchPipes'].forEach(function(k){
          if(Array.isArray(s[k]))s[k]=s[k].map(function(l){return l.map(fn);});
        });
        if(s.source)s.source=fn(s.source);
        if(Array.isArray(s.valves))s.valves=s.valves.map(fn);
      }
    });
    if(opt.clearPipes)ge.trunkPipes=[];
    else if(Array.isArray(ge.trunkPipes))ge.trunkPipes=ge.trunkPipes.map(function(l){return l.map(fn);});
    if(ge.mode==='perPlot'&&ge.slots[ge.current])ppApplySlot(ge.slots[ge.current]);
    else if(ge.mode==='whole')ppState.polyPts=ge.framePts.map(function(p){return{x:p.x,y:p.y};});
    return true;
  }

  /* 整组态：块级编辑一律拦掉，只留「管线拾取」（只读量长度）。
     ★ 不拦的后果：整组态画的管线落在哪个块、算进谁的水力，无从判断 —— 正是用户担心的串味。
     [v194] 总管改为在「成组管路」页统一编辑，二级页不再有总管模式 ⇒ 放行表里去掉 'trunk'。 */
  function ppGroupEditBlocks(mode){
    var ge=window.__runyeGroupEdit;
    if(!ge||!ge.active||ge.mode!=='whole')return false;
    return mode!=='pickPipe';
  }
  /* 总管：成组地块专属的跨块连接层，独立于 ppState（不进任何一块的水力/材料统计）。
     [v194] 这里只剩**只读渲染** —— 编辑入口已迁到「成组管路」页（#grPipeSection），
     二级页不再提供 ppAddTrunkPipe / trunk 模式，避免同一份数据两个入口。 */
  function ppDrawGroupTrunk(){
    var ge=window.__runyeGroupEdit;
    if(!ge||!ge.active||!ge.trunkPipes||!ge.trunkPipes.length)return;
    ge.trunkPipes.forEach(function(l,i){
      if(ge.trunkHidden&&ge.trunkHidden['t'+i])ppDrawLine(l,'rgba(100,116,139,.55)',4,[7,5]);
      else ppDrawLine(l,'#7c3aed',5);
    });
  }

  function ppSyncGroupEditUI(){
    var ge=window.__runyeGroupEdit;
    var wrap=document.getElementById('ppGroupEditWrap');
    var bWhole=document.getElementById('ppGeWhole');
    var bPer=document.getElementById('ppGePerPlot');
    var sel=document.getElementById('ppGePlotSel');
    var on=!!(ge&&ge.active&&ge.slots&&ge.slots.length>=2);
    if(!wrap)return;
    wrap.style.display=on?'':'none';
    /* [v242] 「◀ 返回成组管路」只在**从成组页双击地块进来的**时候显示 ——
       window.__runyeGroupPlotEdit 就是那条手势的标记（由 grEnterPlotL2 写、grBackFromPlotEdit 清）。
       手动点「逐块」切进来的不显示：那时并没有「上一页」可退，摆一个返回键只会让人误会。 */
    var back=document.getElementById('ppBackToGroupBtn');
    if(back)back.style.display=(window.__runyeGroupPlotEdit==null)?'none':'';
    if(!on){ grSyncSecondLevelToGroupPage(); return; }
    /* [v194] 成组态有变化就同步给「成组管路」页（它俩看的是同一份 __runyeGroupEdit） */
    grSyncSecondLevelToGroupPage();
    if(bWhole)bWhole.classList.toggle('active',ge.mode==='whole');
    if(bPer)bPer.classList.toggle('active',ge.mode==='perPlot');
    if(sel){
      /* [v228] 下拉已由块按钮列表（#ppGePlotChips）取代 → select 恒隐藏，
         仅作值同步锚点（旧逻辑读 sel.value 的引用路径不变）。 */
      sel.style.display='none';
      var subs=window.__runyeSubPlots||[];
      var keep=sel.value;
      sel.innerHTML='';
      subs.forEach(function(s,i){
        var op=document.createElement('option');
        op.value=String(i);
        op.textContent=(s&&s.name)||('子地块'+(i+1));
        sel.appendChild(op);
      });
      sel.value=String(ge.current);
      if(keep&&sel.value!==keep)sel.value=String(ge.current);
    }
    /* [v228 2026-10-05 用户要求] 逐块模式：子地块平铺块按钮 —— 一块一钮、当前块高亮，
       点钮即切（事件委托见 bindGroupEditUI）。整组态隐藏；签名校验避免每帧重建。 */
    var chips=document.getElementById('ppGePlotChips');
    if(chips){
      chips.style.display=(ge.mode==='perPlot')?'flex':'none';
      var subsC=window.__runyeSubPlots||[];
      var sig=subsC.length+':'+ge.current;
      if(chips.getAttribute('data-sig')!==sig){
        chips.innerHTML='';
        subsC.forEach(function(s,i){
          var c=document.createElement('button');
          c.type='button';
          c.className='pp-btn-ghost pp-ge-chip';
          c.setAttribute('data-idx',String(i));
          c.textContent=(s&&s.name)||('块'+(i+1));
          chips.appendChild(c);
        });
        chips.setAttribute('data-sig',sig);
      }
      Array.prototype.forEach.call(chips.children,function(c){
        c.classList.toggle('active',parseInt(c.getAttribute('data-idx'),10)===ge.current);
      });
    }
    /* 整组态：把块级编辑按钮（主管/支管/一级管/水源/阀门/调网格）置灰禁用 ——
       与其点了再弹窗报错，不如根本点不动，从交互上杜绝「在整组态画了不知算哪块的管」。 */
    document.querySelectorAll('#ppToolbar [data-mode]').forEach(function(b){
      var m=b.getAttribute('data-mode');
      var blocked=on&&ge.mode==='whole'&&ppGroupEditBlocks(m);
      b.classList.toggle('pp-ge-disabled',!!blocked);
      if(blocked){
        /* 原 title 先存起来，解除禁用时原样还回去（调网格的 title 是长说明，不能丢） */
        if(!b.hasAttribute('data-ge-title0'))b.setAttribute('data-ge-title0', b.getAttribute('title')||'');
        b.setAttribute('disabled','disabled');
        b.title='整组为总览态：块级编辑请切到「逐块」';
      }else{
        b.removeAttribute('disabled');
        if(b.hasAttribute('data-ge-title0')){
          var t0=b.getAttribute('data-ge-title0');
          if(t0)b.setAttribute('title',t0); else b.removeAttribute('title');
          b.removeAttribute('data-ge-title0');
        }
      }
    });
  }

  // Deep clone pipe planning state for undo
  function ppCloneState(){
    return {
      mainPipes:ppState.mainPipes.map(function(l){return l.map(function(p){return{x:p.x,y:p.y};});}),
      branchPipes:ppState.branchPipes.map(function(l){return l.map(function(p){return{x:p.x,y:p.y};});}),
      subBranchPipes:(ppState.subBranchPipes||[]).map(function(l){return l.map(function(p){return{x:p.x,y:p.y};});}),
      source:ppState.source?{x:ppState.source.x,y:ppState.source.y}:null,
      valves:ppState.valves.map(function(p){return{x:p.x,y:p.y};}),
      currentLine:ppState.currentLine.map(function(p){return{x:p.x,y:p.y};}),
      pipeLevel:ppState.pipeLevel||'two',
      hiddenPipes:{main:Object.assign({},ppState.hiddenPipes.main),branch:Object.assign({},ppState.hiddenPipes.branch),subbranch:Object.assign({},ppState.hiddenPipes.subbranch||{})},
      pipeIds:{main:ppState.pipeIds.main.slice(),branch:ppState.pipeIds.branch.slice(),subbranch:(ppState.pipeIds.subbranch||[]).slice()},
      nextPipeId:ppState.nextPipeId,
      cutOverrides:{
        x:Object.assign({},ppState.cutOverrides.x),
        y:Object.assign({},ppState.cutOverrides.y)
      },
      cutSnap:{
        sig:(ppState.cutSnap&&ppState.cutSnap.sig)||'',
        x:(ppState.cutSnap&&ppState.cutSnap.x)?ppState.cutSnap.x.slice():null,
        y:(ppState.cutSnap&&ppState.cutSnap.y)?ppState.cutSnap.y.slice():null
      }
    };
  }

  function ppPushHistory(){
    if(!ppState.history)ppState.history=[];
    ppState.history.push(ppCloneState());
    if(ppState.history.length>50)ppState.history.shift();
  }

  function ppRestoreState(snap){
    ppState.mainPipes=snap.mainPipes.map(function(l){return l.map(function(p){return{x:p.x,y:p.y};});});
    ppState.branchPipes=snap.branchPipes.map(function(l){return l.map(function(p){return{x:p.x,y:p.y};});});
    ppState.subBranchPipes=(snap.subBranchPipes||[]).map(function(l){return l.map(function(p){return{x:p.x,y:p.y};});});
    ppState.source=snap.source?{x:snap.source.x,y:snap.source.y}:null;
    ppState.valves=snap.valves.map(function(p){return{x:p.x,y:p.y};});
    ppState.currentLine=snap.currentLine.map(function(p){return{x:p.x,y:p.y};});
    ppState.pipeLevel=snap.pipeLevel||'two';
    ppState.hiddenPipes={main:Object.assign({},snap.hiddenPipes.main),branch:Object.assign({},snap.hiddenPipes.branch),subbranch:Object.assign({},snap.hiddenPipes.subbranch||{})};
    ppState.pipeIds={main:snap.pipeIds.main.slice(),branch:snap.pipeIds.branch.slice(),subbranch:(snap.pipeIds.subbranch||[]).slice()};
    ppState.nextPipeId=snap.nextPipeId;
    ppState.cutOverrides={
      x:Object.assign({},snap.cutOverrides.x),
      y:Object.assign({},snap.cutOverrides.y)
    };
    ppState.cutSnap={
      sig:(snap.cutSnap&&snap.cutSnap.sig)||'',
      x:(snap.cutSnap&&snap.cutSnap.x)?snap.cutSnap.x.slice():null,
      y:(snap.cutSnap&&snap.cutSnap.y)?snap.cutSnap.y.slice():null
    };
    ppState.mergePreview=null;
    if(typeof ppSyncPipeLevelUI==='function')ppSyncPipeLevelUI(); // 该函数未定义时跳过，避免回退中断
    ppState.plotMirror='none';
    ppSyncMirrorUI();
  }

  function ppUndoStep(){
    if(!ppState.history||ppState.history.length===0)return false;
    var snap=ppState.history.pop();
    ppRestoreState(snap);
    return true;
  }

  function ppGetDisplayBounds(){
    if(!ppState.polyPts.length)return{minX:0,minY:0,w:1,h:1};
    var base=ppGetBounds();
    var rotated=ppBoundsFromPoints(ppGetRotatedPlotPoints());
    var minX=Math.min(base.minX,rotated.minX);
    var minY=Math.min(base.minY,rotated.minY);
    var maxX=Math.max(base.minX+base.w,rotated.minX+rotated.w);
    var maxY=Math.max(base.minY+base.h,rotated.minY+rotated.h);
    return{minX:minX,minY:minY,w:maxX-minX,h:maxY-minY};
  }

  function ppNiceStep(range,targetCount){
    if(range<=0||!isFinite(range))return 10;
    var raw=range/targetCount;
    var mag=Math.pow(10,Math.floor(Math.log10(raw)));
    var norm=raw/mag;
    var step;
    if(norm<1.5)step=1;else if(norm<3)step=2;else if(norm<7)step=5;else step=10;
    return step*mag;
  }

  function ppZoneSizeLabel(w,h){
    function f(v){
      if(!isFinite(v))return '—';
      var rounded=Math.round(v);
      return Math.abs(v-rounded)<0.05?String(rounded):v.toFixed(1);
    }
    return f(w)+'×'+f(h)+'m';
  }

  function ppSplitLength(total,step){
    var parts=[],used=0;
    step=Math.max(1,step||1);
    while(total-used>step+0.05){
      parts.push(step);
      used+=step;
    }
    var rest=total-used;
    if(rest>0.05)parts.push(rest);
    return parts.length?parts:[total];
  }

  // ===== 分区线快照（支持拖动合并减区）=====
  // 基础划分签名：地块尺寸/分区行列数/设计分区尺寸任一变化，手动调整即失效并重置
  function ppCutSig(dims,nx,ny,xDesign,yDesign){
    return [Math.round((dims.w||0)*100),Math.round((dims.h||0)*100),nx,ny,Math.round((xDesign||0)*100),Math.round((yDesign||0)*100)].join('_');
  }
  // 1 画布像素对应的世界坐标长度（用于把"像素阈值"换算成世界距离）
  function ppWorldPerPixel(axis){
    var t=ppState.transform;
    if(!t)return 1;
    var ps=(axis==='x'?t.scaleX:t.scaleY)*(t.scale||1);
    if(!ps||!isFinite(ps)||ps===0)return 1;
    return 1/Math.abs(ps);
  }
  function ppResetCutSnap(sig){
    ppState.cutSnap={sig:sig||'',x:null,y:null};
    ppState.mergePreview=null;
    return ppState.cutSnap;
  }
  // 用快照中的内部线位置重建 [起点, ...内部线, 终点]
  function ppApplyCutSnap(pos,snapArr){
    if(!snapArr||!snapArr.length)return pos;
    var lo=pos[0],hi=pos[pos.length-1];
    var mid=snapArr.filter(function(v){return isFinite(v)&&v>lo+0.5&&v<hi-0.5;}).sort(function(a,b){return a-b;});
    var out=[],prev=lo;
    for(var i=0;i<mid.length;i++){
      if(mid[i]-prev>=0.5){out.push(mid[i]);prev=mid[i];}
    }
    return [lo].concat(out,[hi]);
  }
  // 取当前分区线数组（含手动调整与合并结果），index 为内部线索引（1..len-2）
  function ppCurrentCuts(){
    if(!ppState.polyPts||ppState.polyPts.length<3)return null;
    var b=ppGetBounds();
    var planN=parseInt(document.getElementById('planN')?.value)||parseInt(document.getElementById('fld_N')?.value)||4;
    return ppGetZoneCuts(b,ppGetZoneLayout(b,planN));
  }
  // 设置第 index 条内部线的位置（写入快照）
  function ppSetCutPos(axis,index,pos){
    var cuts=ppCurrentCuts();
    if(!cuts)return;
    var arr=cuts[axis==='x'?'xPos':'yPos'];
    if(index<=0||index>=arr.length-1)return;
    var snap=ppState.cutSnap;
    if(!snap||snap.sig!==cuts.sig)snap=ppResetCutSnap(cuts.sig);
    var seed=snap[axis];
    if(!seed||seed.length!==arr.length-2){
      seed=[];
      for(var i=1;i<arr.length-1;i++)seed.push(arr[i]);
      snap[axis]=seed;
    }
    seed[index-1]=pos;
  }
  // 拖动某条内部线：靠近相邻内部线 OR 地块边界时吸附并标记待合并；否则夹在两邻线之间
  // target 含义：
  //   1..arr.length-2 → 合并到那条相邻内部线（保留目标线位置）
  //   0               → 合并到地块上边界 / 左边界（整条线消失）
  //   arr.length-1    → 合并到地块下边界 / 右边界（整条线消失）
  function ppDragCutTo(axis,index,newPos){
    var cuts=ppCurrentCuts();
    if(!cuts)return null;
    var arr=cuts[axis==='x'?'xPos':'yPos'];
    if(index<=0||index>=arr.length-1)return null;
    var lo=arr[index-1],hi=arr[index+1];
    var thr=Math.max(2,25*ppWorldPerPixel(axis));   // 合并吸附阈值 ≈25 画布像素（放宽，拖到边线即合并）
    var minGap=Math.max(2,4*ppWorldPerPixel(axis)); // 与相邻线的最小间距
    var target=-1;
    if(index===1 && newPos<=lo+thr)target=0;                              // 第一条线拖到上/左边线(可越过)→合并到边线
    else if(index===arr.length-2 && newPos>=hi-thr)target=arr.length-1;     // 最后一条线拖到下/右边线(可越过)→合并到边线
    else if(index-1>=1 && newPos>lo-minGap && newPos<=lo+thr)target=index-1; // 中间线拖到上一条内部线附近
    else if(index+1<=arr.length-2 && newPos<hi+minGap && newPos>=hi-thr)target=index+1; // 中间线拖到下一条内部线附近
    if(target>=0){
      // 几乎重合：保留极小偏移（>过滤阈值）让线在拖动中仍可见，松手时真正合并
      var off=Math.max(0.6,0.75*ppWorldPerPixel(axis));
      var tp;
      if(target===0)tp=lo+off;
      else if(target===arr.length-1)tp=hi-off;
      else tp=(target<index)?(arr[target]+off):(arr[target]-off);
      ppSetCutPos(axis,index,tp);
      ppState.mergePreview={axis:axis,index:index,target:target};
      return {merge:true,target:target,count:arr.length-1};
    }
    ppState.mergePreview=null;
    var lo2=lo+minGap,hi2=hi-minGap;
    if(lo2>hi2)lo2=hi2=(lo+hi)/2;
    ppSetCutPos(axis,index,Math.max(lo2,Math.min(hi2,newPos)));
    return {merge:false,count:arr.length-1};
  }
  // 松手时执行合并：删除被拖动的那条线。target=0/length-1 表示合并到边界（整条消失），其他表示合并到相邻内部线
  function ppCommitMerge(){
    var mp=ppState.mergePreview;
    ppState.mergePreview=null;
    if(!mp)return false;
    var snap=ppState.cutSnap;
    var arr=snap&&snap[mp.axis];
    if(!arr||arr.length===0)return false;
    var i=mp.index-1;
    if(i<0||i>=arr.length)return false;
    arr.splice(i,1);
    // 选中线索引：合并到边界时已无线可选；合并到相邻内部线时指向目标
    if(mp.target===0||mp.target===(arr.length+1))ppState.lastSelectedCut=null;
    else{
      var newIdx=(mp.target<mp.index)?mp.target:(mp.target-1);
      if(newIdx>=1&&newIdx<=arr.length)ppState.lastSelectedCut={axis:mp.axis,index:newIdx};
      else ppState.lastSelectedCut=null;
    }
    return true;
  }

  /* v98d：只移动第 index 条内部线（夹在左右邻线之间），不做「拖到邻线即合并」。
     三级画布拖「组边界线」用，避免误合并导致手动分组的区号失效。 */
  function ppDragCutPosOnly(axis,index,newPos){
    var cuts=ppCurrentCuts(); if(!cuts)return null;
    var arr=cuts[axis==='x'?'xPos':'yPos'];
    if(index<=0||index>=arr.length-1)return null;
    var lo=arr[index-1],hi=arr[index+1];
    var minGap=Math.max(2,4*ppWorldPerPixel(axis));
    var lo2=lo+minGap,hi2=hi-minGap;
    if(lo2>hi2)lo2=hi2=(lo+hi)/2;
    ppState.mergePreview=null;
    ppSetCutPos(axis,index,Math.max(lo2,Math.min(hi2,newPos)));
    return {merge:false,count:arr.length-1};
  }

  /* 任务K（2026-09-26）：面积锁定状态下的整轴刚性平移。
     拖动任一条内部线时，整条轴（所有内部线）按相同 delta 平移，格宽不变 → 各区面积不变。
     不做合并、不夹在邻线之间，仅在地块边界内做整体平移约束。 */
  function ppDragCutAxis(axis,anchorIndex,newPos){
    var cuts=ppCurrentCuts();
    if(!cuts)return null;
    var key=axis==='x'?'xPos':'yPos';
    var arr=cuts[key];
    if(anchorIndex<=0||anchorIndex>=arr.length-1)return null;
    var minGap=Math.max(2,4*ppWorldPerPixel(axis));
    var delta=newPos-arr[anchorIndex];
    // 约束整体平移，使最外侧两条内部线仍落在地块边界内（保持格序）
    var dMin=arr[0]+minGap-arr[1];
    var dMax=arr[arr.length-1]-minGap-arr[arr.length-2];
    if(dMin>dMax){ delta=0; }
    else { if(delta<dMin)delta=dMin; if(delta>dMax)delta=dMax; }
    var orig=arr.slice();
    for(var i=1;i<arr.length-1;i++){ ppSetCutPos(axis,i,orig[i]+delta); }
    ppState.mergePreview=null;
    return {merge:false,count:arr.length-1,axis:axis,delta:delta};
  }

  function ppGetZoneCuts(b,layout){
    var dims=ppGetPlanDims(b);
    // 不再按长短边重排；手动/自动布局给出的轴向尺寸是唯一来源。
    var longIsX=dims.w>=dims.h;
    var xDesign=layout.designW || (longIsX?layout.zoneH:layout.zoneW);
    var yDesign=layout.designH || (longIsX?layout.zoneW:layout.zoneH);
    var xPlan=ppSplitLength(dims.w,xDesign);
    var yPlan=ppSplitLength(dims.h,yDesign);
    var sx=b.w/dims.w,sy=b.h/dims.h;
    var xSrc=[],ySrc=[],xPos=[b.minX],yPos=[b.minY];
    for(var xi=0;xi<xPlan.length;xi++){xSrc.push(xPlan[xi]*sx);xPos.push(xPos[xPos.length-1]+xSrc[xi]);}
    for(var yi=0;yi<yPlan.length;yi++){ySrc.push(yPlan[yi]*sy);yPos.push(yPos[yPos.length-1]+ySrc[yi]);}
    xPos[xPos.length-1]=b.minX+b.w;
    yPos[yPos.length-1]=b.minY+b.h;
    // 应用手动拖动/合并后的内部切割线快照（线数量可变 → 分区数随之变化）
    var sig=ppCutSig(dims,xPlan.length,yPlan.length,xDesign,yDesign);
    var snap=ppState.cutSnap;
    if(!snap||snap.sig!==sig)snap=ppResetCutSnap(sig);
    xPos=ppApplyCutSnap(xPos,snap.x);
    yPos=ppApplyCutSnap(yPos,snap.y);
    xSrc=[];xPlan=[];
    for(var xa=0;xa<xPos.length-1;xa++){
      var wSrc=xPos[xa+1]-xPos[xa];
      xSrc.push(wSrc);
      xPlan.push(sx>0?wSrc/sx:0);
    }
    ySrc=[];yPlan=[];
    for(var ya=0;ya<yPos.length-1;ya++){
      var hSrc=yPos[ya+1]-yPos[ya];
      ySrc.push(hSrc);
      yPlan.push(sy>0?hSrc/sy:0);
    }
    return {xPlan:xPlan,yPlan:yPlan,xSrc:xSrc,ySrc:ySrc,xPos:xPos,yPos:yPos,cols:xPlan.length,rows:yPlan.length,designW:xDesign,designH:yDesign,sig:sig,zoneCount:xPlan.length*yPlan.length};
  }

  // ===== 分区真实面积（裁剪到地块多边形）=====
  // 多边形面积（鞋带公式），pts: [{x,y},...]
  function ppPolyArea(pts){
    if(!pts||pts.length<3)return 0;
    var a=0;
    for(var i=0;i<pts.length;i++){
      var j=(i+1)%pts.length;
      a+=pts[i].x*pts[j].y - pts[j].x*pts[i].y;
    }
    return Math.abs(a)/2;
  }
  // Sutherland-Hodgman：将多边形裁剪到轴对齐矩形 [x0,y0]-[x1,y1]
  function ppClipPolyToRect(poly,x0,y0,x1,y1){
    if(!poly||poly.length===0)return [];
    var out=poly.map(function(p){return{x:p.x,y:p.y};});
    var planes=[
      {inside:function(p){return p.x>=x0;}, inter:function(a,b){var t=(x0-a.x)/(b.x-a.x);return{x:x0,y:a.y+t*(b.y-a.y)};}},
      {inside:function(p){return p.y>=y0;}, inter:function(a,b){var t=(y0-a.y)/(b.y-a.y);return{x:a.x+t*(b.x-a.x),y:y0};}},
      {inside:function(p){return p.x<=x1;}, inter:function(a,b){var t=(x1-a.x)/(b.x-a.x);return{x:x1,y:a.y+t*(b.y-a.y)};}},
      {inside:function(p){return p.y<=y1;}, inter:function(a,b){var t=(y1-a.y)/(b.y-a.y);return{x:a.x+t*(b.x-a.x),y:y1};}}
    ];
    for(var e=0;e<planes.length;e++){
      var inp=out; out=[];
      if(inp.length===0)break;
      var prev=inp[inp.length-1];
      for(var i=0;i<inp.length;i++){
        var cur=inp[i];
        if(planes[e].inside(cur)){
          if(!planes[e].inside(prev))out.push(planes[e].inter(prev,cur));
          out.push(cur);
        }else if(planes[e].inside(prev)){
          out.push(planes[e].inter(prev,cur));
        }
        prev=cur;
      }
    }
    return out;
  }
  // 分区网格 cell(zc,zr) 实际落在线段多边形内的面积（m²）
  // plotPoly 与 zoneCuts 须处于同一世界坐标（米）
  function ppZoneActualAreaM2(zc,zr,zoneCuts,plotPoly){
    var nom=zoneCuts.xPlan[zc]*zoneCuts.yPlan[zr];
    var x0=zoneCuts.xPos[zc], y0=zoneCuts.yPos[zr];
    var x1=zoneCuts.xPos[zc+1], y1=zoneCuts.yPos[zr+1];
    /* [v190] 成组地块：分区实际面积 = Σ「各成员环裁剪到本分区」的面积。
       ★ 块间空隙不属于任何一个成员环 ⇒ 不计入面积（用户原话：
         「两个地块之间有 3 米，那这个三米就留着…不要自动填充面积，这里就空着」）。
       若按 ppState.polyPts（= 外框/凸包）算，空隙会被当成地块面积吞掉。 */
    var rings=ppGetSubPlotRings();
    if(rings){
      var sum=0;
      for(var ri=0;ri<rings.length;ri++){
        sum+=ppPolyArea(ppClipPolyToRect(rings[ri],x0,y0,x1,y1));
      }
      return sum;
    }
    if(!plotPoly||plotPoly.length<3)return nom;
    var clipped=ppClipPolyToRect(plotPoly,x0,y0,x1,y1);
    return ppPolyArea(clipped);
  }

  function ppUpdateTransform(){
    if(!ppState.polyPts.length)return;
    var b=ppGetBounds();var displayB=ppGetDisplayBounds();var pad=50;
    var dims=ppGetPlanDims(b);
    var planScaleX=b.w>0?dims.w/b.w:1;
    var planScaleY=b.h>0?dims.h/b.h:1;
    var displayW=displayB.w*planScaleX;
    var displayH=displayB.h*planScaleY;
    var s=0.5*ppState.zoom; // 固定比例 1px=2m，乘以zoom
    ppState.transform={
      scale:s,minX:displayB.minX,minY:displayB.minY,scaleX:planScaleX,scaleY:planScaleY,
      offsetX:pad+(ppCanvas.width-2*pad-displayW*s)/2,
      offsetY:pad+(ppCanvas.height-2*pad-displayH*s)/2
    };
  }

  function ppToCanvas(mx,my){
    var t=ppState.transform;if(!t)return{x:mx,y:my};
    return{x:(mx-t.minX)*t.scaleX*t.scale+t.offsetX+ppState.panX,y:(my-t.minY)*t.scaleY*t.scale+t.offsetY+ppState.panY};
  }
  function ppToMeters(cx,cy){
    var t=ppState.transform;if(!t)return{x:cx,y:cy};
    return{x:(cx-t.offsetX-ppState.panX)/(t.scaleX*t.scale)+t.minX,y:(cy-t.offsetY-ppState.panY)/(t.scaleY*t.scale)+t.minY};
  }

  function ppCanConstrainLine(){
    return ppState.mode==='main'||ppState.mode==='branch';
  }

  function ppGetConstrainedPoint(raw){
    if(!raw)return raw;
    if(ppState.lineDrawMode!=='ortho'||!ppCanConstrainLine()||ppState.currentLine.length<1){
      return{x:raw.x,y:raw.y};
    }
    var last=ppState.currentLine[ppState.currentLine.length-1];
    var dx=raw.x-last.x;
    var dy=raw.y-last.y;
    if(Math.abs(dx)>=Math.abs(dy)){
      return{x:raw.x,y:last.y};
    }
    return{x:last.x,y:raw.y};
  }

  function ppLineLen(line){
    var len=0;
    if(!line)return len;
    var sx=1,sy=1;
    if(ppState.polyPts&&ppState.polyPts.length>=3){
      var bounds=ppGetBounds();
      var dims=ppGetPlanDims(bounds);
      sx=bounds.w>0?dims.w/bounds.w:1;
      sy=bounds.h>0?dims.h/bounds.h:1;
    }
    for(var i=1;i<line.length;i++){
      var a=line[i-1],b=line[i];
      var dx=(b.x-a.x)*sx;
      var dy=(b.y-a.y)*sy;
      len+=Math.sqrt(dx*dx+dy*dy);
    }
    return len;
  }

  function ppPointToSegmentDistance(p,a,b){
    var vx=b.x-a.x,vy=b.y-a.y;
    var wx=p.x-a.x,wy=p.y-a.y;
    var c1=vx*vx+vy*vy;
    if(c1<=0)return Math.sqrt(wx*wx+wy*wy);
    var t=(wx*vx+wy*vy)/c1;
    t=Math.max(0,Math.min(1,t));
    var px=a.x+t*vx,py=a.y+t*vy;
    var dx=p.x-px,dy=p.y-py;
    return Math.sqrt(dx*dx+dy*dy);
  }

  function ppFindNearestPipe(worldPt){
    var best=null;
    function scan(list,type,label){
      for(var i=0;i<list.length;i++){
        var line=list[i];
        for(var j=1;j<line.length;j++){
          var dist=ppPointToSegmentDistance(worldPt,line[j-1],line[j]);
          if(!best||dist<best.dist){
            best={type:type,label:label,index:i,line:line,dist:dist,length:ppLineLen(line)};
          }
        }
      }
    }
    scan(ppState.mainPipes,'main','主管');
    scan(ppState.branchPipes,'branch','支管');
    if(ppState.subBranchPipes)scan(ppState.subBranchPipes,'subbranch','一级管');
    if(!best)return null;
    var scale=(ppState.transform&&ppState.transform.scale)?ppState.transform.scale:1;
    var sx=(ppState.transform&&ppState.transform.scaleX)?ppState.transform.scaleX:1;
    var sy=(ppState.transform&&ppState.transform.scaleY)?ppState.transform.scaleY:1;
    var avgCanvasScale=Math.max(0.0001,scale*(Math.abs(sx)+Math.abs(sy))/2);
    return best.dist*avgCanvasScale<=14?best:null;
  }

  function ppPipeKey(type,index){
    var group=type==='main'?'main':type==='subbranch'?'subbranch':'branch';
    ppEnsurePipeIds(group);
    var ids=ppState.pipeIds&&ppState.pipeIds[group]?ppState.pipeIds[group]:[];
    var prefix=group==='main'?'m':(group==='subbranch'?'s':'b');
    return ids[index]||(prefix+'-legacy-'+index);
  }

  function ppEnsurePipeIds(group){
    if(!ppState.pipeIds)ppState.pipeIds={main:[],branch:[],subbranch:[]};
    if(!ppState.pipeIds[group])ppState.pipeIds[group]=[];
    var list=group==='main'?ppState.mainPipes:group==='subbranch'?(ppState.subBranchPipes||[]):ppState.branchPipes;
    var prefix=group==='main'?'m':(group==='subbranch'?'s':'b');
    for(var i=0;i<list.length;i++){
      if(!ppState.pipeIds[group][i]){
        ppState.pipeIds[group][i]=prefix+(ppState.nextPipeId++);
      }
    }
    ppState.pipeIds[group]=ppState.pipeIds[group].slice(0,list.length);
  }

  function ppNormalizeHiddenPipes(){
    if(!ppState.hiddenPipes)ppState.hiddenPipes={main:{},branch:{},subbranch:{}};
    ['main','branch','subbranch'].forEach(function(group){
      if(!ppState.hiddenPipes[group])ppState.hiddenPipes[group]={};
      ppEnsurePipeIds(group);
      var normalized={};
      Object.keys(ppState.hiddenPipes[group]).forEach(function(k){
        if(/^\d+$/.test(k)){
          var id=ppState.pipeIds[group][parseInt(k,10)];
          if(id)normalized[id]=true;
        }else{
          normalized[k]=true;
        }
      });
      ppState.hiddenPipes[group]=normalized;
    });
  }

  function ppAddPipe(type,line){
    var group=type==='main'?'main':type==='subbranch'?'subbranch':'branch';
    if(group==='main')ppState.mainPipes.push(line);
    else if(group==='subbranch'){if(!ppState.subBranchPipes)ppState.subBranchPipes=[];ppState.subBranchPipes.push(line);}
    else ppState.branchPipes.push(line);
    ppEnsurePipeIds(group);
  }


  function ppIsPipeHidden(type,index){
    var group=type==='main'?'main':type==='subbranch'?'subbranch':'branch';
    var key=ppPipeKey(type,index);
    return !!(ppState.hiddenPipes&&ppState.hiddenPipes[group]&&ppState.hiddenPipes[group][key]);
  }

  function ppTogglePipeHidden(pick){
    if(!pick)return;
    var group=pick.type==='main'?'main':pick.type==='subbranch'?'subbranch':'branch';
    var key=ppPipeKey(pick.type,pick.index);
    if(!ppState.hiddenPipes)ppState.hiddenPipes={main:{},branch:{},subbranch:{}};
    if(!ppState.hiddenPipes[group])ppState.hiddenPipes[group]={};
    if(ppState.hiddenPipes[group][key])delete ppState.hiddenPipes[group][key];
    else ppState.hiddenPipes[group][key]=true;
  }

  function ppHasVisiblePipe(type){
    var list=type==='main'?ppState.mainPipes:type==='subbranch'?(ppState.subBranchPipes||[]):ppState.branchPipes;
    for(var i=0;i<list.length;i++){
      if(!ppIsPipeHidden(type,i))return true;
    }
    return false;
  }

  function ppUpdatePickResult(pick){
    ppState.pickedPipe=pick||null;
    if(!ppPickResult)return;
    if(!pick){
      ppPickResult.style.display='none';
      return;
    }
    ppPickResult.style.display='flex';
    document.getElementById('ppPickType').textContent=pick.label;
    document.getElementById('ppPickName').textContent='第 '+(pick.index+1)+' 条'+(ppIsPipeHidden(pick.type,pick.index)?'（已遮蔽）':'');
    document.getElementById('ppPickLength').textContent=pick.length.toFixed(1);
  }

  function ppDrawLine(pts,color,width,dash){
    if(pts.length<1)return;
    ppCtx.strokeStyle=color;ppCtx.lineWidth=width;
    ppCtx.lineCap='round';ppCtx.lineJoin='round';
    if(dash)ppCtx.setLineDash(dash);else ppCtx.setLineDash([]);
    ppCtx.beginPath();
    for(var i=0;i<pts.length;i++){
      var p=ppToCanvas(pts[i].x,pts[i].y);
      if(i===0)ppCtx.moveTo(p.x,p.y);else ppCtx.lineTo(p.x,p.y);
    }
    if(ppState.mouseWorld&&pts===ppState.currentLine){
      var draft=ppGetConstrainedPoint(ppState.mouseWorld);
      var dp=ppToCanvas(draft.x,draft.y);
      ppCtx.lineTo(dp.x,dp.y);
    }
    ppCtx.stroke();ppCtx.setLineDash([]);
  }

  function ppTracePlotPath(){
    /* [v190] 成组地块：把**每个成员环**作为一条子路径画进同一条 path
     * （fill 用 nonzero 绕向，互不相交的环各自填充，块间空隙自然留空）。 */
    var rings=ppGetRotatedSubRings();
    ppCtx.beginPath();
    if(rings){
      rings.forEach(function(r){
        for(var i=0;i<r.length;i++){
          var p=ppToCanvas(r[i].x,r[i].y);
          if(i===0)ppCtx.moveTo(p.x,p.y);else ppCtx.lineTo(p.x,p.y);
        }
        ppCtx.closePath();
      });
      return;
    }
    var pts=ppGetRotatedPlotPoints();
    for(var i=0;i<pts.length;i++){
      var p=ppToCanvas(pts[i].x,pts[i].y);
      if(i===0)ppCtx.moveTo(p.x,p.y);else ppCtx.lineTo(p.x,p.y);
    }
    ppCtx.closePath();
  }

  // ===== Cut-line hit testing & drag =====
  function ppHitTestCutLine(worldPt){
    if(!ppState.polyPts.length)return null;
    var b=ppGetBounds();
    var planN=parseInt(document.getElementById('planN')?.value)||parseInt(document.getElementById('fld_N')?.value)||4;
    var layout=ppGetZoneLayout(b,planN);
    var cuts=ppGetZoneCuts(b,layout);
    // threshold in world (image-pixel) units — convert 9 canvas px
    var t=ppState.transform;
    var thr=t?9/(t.scale*(Math.abs(t.scaleX)+Math.abs(t.scaleY))/2):5;
    var best=null;
    // vertical lines (xPos interior 1..len-2)
    for(var xi=1;xi<cuts.xPos.length-1;xi++){
      var dx=Math.abs(worldPt.x-cuts.xPos[xi]);
      if(dx<thr&&worldPt.y>=b.minY-5&&worldPt.y<=b.minY+b.h+5){
        if(!best||dx<best.dist){best={axis:'x',index:xi,dist:dx,pos:cuts.xPos[xi]};}
      }
    }
    // horizontal lines (yPos interior 1..len-2)
    for(var yi=1;yi<cuts.yPos.length-1;yi++){
      var dy=Math.abs(worldPt.y-cuts.yPos[yi]);
      if(dy<thr&&worldPt.x>=b.minX-5&&worldPt.x<=b.minX+b.w+5){
        if(!best||dy<best.dist){best={axis:'y',index:yi,dist:dy,pos:cuts.yPos[yi]};}
      }
    }
    return best;
  }

  /* v98c：网格线拖动是否就绪 —— 「调网格」模式，或「未在画线」时悬停网格线即可直接拖动
     （免点右侧控制面板的「调网格」）。排除拾取/遮蔽/水源/阀门等专用模式，避免抢占其点击语义。 */
  function ppCutDragReady(){
    if(ppState.mode==='adjustCut')return true;
    if(ppState.mode==='pickPipe'||ppState.mode==='maskPipe'||ppState.mode==='source'||ppState.mode==='valve')return false;
    return ppState.currentLine.length===0;
  }

  function ppDrawCutHandles(b,cuts){
    if(ppState.mode!=='adjustCut')return;
    ppCtx.save();
    var mp=ppState.mergePreview;
    for(var xi=1;xi<cuts.xPos.length-1;xi++){
      var isHover=ppState.hoverCut&&ppState.hoverCut.axis==='x'&&ppState.hoverCut.index===xi;
      var isDrag=ppState.dragCut&&ppState.dragCut.axis==='x'&&ppState.dragCut.index===xi;
      var isSel=ppState.lastSelectedCut&&ppState.lastSelectedCut.axis==='x'&&ppState.lastSelectedCut.index===xi;
      var isMerge=!!(mp&&mp.axis==='x'&&(mp.index===xi||mp.target===xi));
      var midY=b.minY+b.h/2;
      var hp=ppToCanvas(cuts.xPos[xi],midY);
      ppCtx.fillStyle=isMerge?'#f97316':isDrag?'#f59e0b':(isHover||isSel)?'#22c55e':'rgba(59,130,246,.6)';
      ppCtx.strokeStyle='#fff';ppCtx.lineWidth=isMerge?3:2;
      ppCtx.beginPath();ppCtx.arc(hp.x,hp.y,isMerge?9:((isHover||isDrag||isSel)?7:5),0,Math.PI*2);ppCtx.fill();ppCtx.stroke();
    }
    for(var yi=1;yi<cuts.yPos.length-1;yi++){
      var isHover2=ppState.hoverCut&&ppState.hoverCut.axis==='y'&&ppState.hoverCut.index===yi;
      var isDrag2=ppState.dragCut&&ppState.dragCut.axis==='y'&&ppState.dragCut.index===yi;
      var isSel2=ppState.lastSelectedCut&&ppState.lastSelectedCut.axis==='y'&&ppState.lastSelectedCut.index===yi;
      var isMerge2=!!(mp&&mp.axis==='y'&&(mp.index===yi||mp.target===yi));
      var midX=b.minX+b.w/2;
      var hp2=ppToCanvas(midX,cuts.yPos[yi]);
      ppCtx.fillStyle=isMerge2?'#f97316':isDrag2?'#f59e0b':(isHover2||isSel2)?'#22c55e':'rgba(59,130,246,.6)';
      ppCtx.strokeStyle='#fff';ppCtx.lineWidth=isMerge2?3:2;
      ppCtx.beginPath();ppCtx.arc(hp2.x,hp2.y,isMerge2?9:((isHover2||isDrag2||isSel2)?7:5),0,Math.PI*2);ppCtx.fill();ppCtx.stroke();
    }
    // 合并预览提示：拖动线吸附到相邻线/边界时提示松开后的分区数变化
    if(mp){
      var arr=cuts[mp.axis==='x'?'xPos':'yPos'];
      var dirLabel=mp.axis==='x'?'竖向':'横向';
      var perLine=mp.axis==='x'?cuts.rows:cuts.cols;
      var n=Math.max(2,arr.length-1);
      var totalNow=cuts.cols*cuts.rows;
      var tip;
      if(mp.target===0){
        tip='松开鼠标：'+dirLabel+' 第 1 行/列将被移除（'+dirLabel+' '+n+' → '+(n-1)+'，共 '+totalNow+' → '+(totalNow-perLine)+' 区）';
      }else if(mp.target===arr.length-1){
        tip='松开鼠标：'+dirLabel+' 第 '+n+' 行/列将被移除（'+dirLabel+' '+n+' → '+(n-1)+'，共 '+totalNow+' → '+(totalNow-perLine)+' 区）';
      }else{
        tip='松开鼠标：'+dirLabel+' '+n+' 区合并为 '+(n-1)+' 区（共 '+(totalNow-perLine)+' 区）';
      }
      ppCtx.font='13px sans-serif';
      ppCtx.textAlign='center';ppCtx.textBaseline='middle';
      var tw=ppCtx.measureText(tip).width+28;
      var tx=ppCanvas.width/2,ty=22;
      ppCtx.fillStyle='rgba(249,115,22,.94)';
      ppCtx.fillRect(tx-tw/2,ty-15,tw,30);
      ppCtx.fillStyle='#000';
      ppCtx.fillText(tip,tx,ty);
    }
    ppCtx.restore();
  }

  function ppDrawZones(b){
    var planN=parseInt(document.getElementById('planN')?.value)||parseInt(document.getElementById('fld_N')?.value)||4;
    var layout=ppGetZoneLayout(b,planN);
    var cuts=ppGetZoneCuts(b,layout);
    /* 2026-09-27：分区底色改用「三级设计工作区」同一套 4 色循环调色板
       （红/琥珀/绿/蓝，α=.30）—— 与 tl-workspace.js 的 GROUP_FILLS 逐色一致，
       用户要求「二级地块划分颜色参照三级管线」。原为 8 色 α=.12（偏灰、偏花）。 */
    var fills=['rgba(191,88,88,.30)','rgba(214,162,73,.30)','rgba(75,173,111,.30)','rgba(84,127,196,.30)'];
    var strokes=['rgba(51,65,85,.28)','rgba(51,65,85,.28)','rgba(51,65,85,.28)','rgba(51,65,85,.28)'];
    ppCtx.save();
    ppTracePlotPath();
    ppCtx.clip();
    ppCtx.lineWidth=1;
    ppCtx.setLineDash([7,4]);
    // 第一遍：仅绘制分区矩形（受地块多边形裁剪，体现真实边界）
    for(var zr=0;zr<cuts.rows;zr++){
      for(var zc=0;zc<cuts.cols;zc++){
        var zi=zr*cuts.cols+zc;
        var p1=ppToCanvas(cuts.xPos[zc],cuts.yPos[zr]);
        var p2=ppToCanvas(cuts.xPos[zc+1],cuts.yPos[zr+1]);
        var x=p1.x,y=p1.y,w=p2.x-p1.x,h=p2.y-p1.y;
        var _m2=ppZoneActualAreaM2(zc,zr,cuts,ppState.polyPts);
        var _mu=_m2/666.67;
        var _std=cuts.xPlan[zc]*cuts.yPlan[zr]/666.67;
        var _partial=_std>0 && _mu<_std*0.97 && _mu>0.05;
        /* 2026-09-27：非标区不再整块涂琥珀 —— 与三级工作区同规则（保留本区底色，仅琥珀描边区分） */
        ppCtx.fillStyle=fills[zi%fills.length];
        ppCtx.strokeStyle=_partial?'rgba(217,119,6,.9)':strokes[zi%strokes.length];
        ppCtx.fillRect(x,y,w,h);
        ppCtx.strokeRect(x,y,w,h);
      }
    }
    ppCtx.restore(); // 结束地块裁剪
    // 第二遍：文字标注层（不再裁剪，避免被地块边界切掉）
    ppCtx.setLineDash([]);
    ppCtx.textBaseline='top';
    for(var zr=0;zr<cuts.rows;zr++){
      for(var zc=0;zc<cuts.cols;zc++){
        var zi=zr*cuts.cols+zc;
        var p1=ppToCanvas(cuts.xPos[zc],cuts.yPos[zr]);
        var p2=ppToCanvas(cuts.xPos[zc+1],cuts.yPos[zr+1]);
        var x=p1.x,y=p1.y,w=p2.x-p1.x,h=p2.y-p1.y;
        var aw=Math.abs(w),ah=Math.abs(h);
        var _m2=ppZoneActualAreaM2(zc,zr,cuts,ppState.polyPts);
        var _mu=_m2/666.67;
        var _std=cuts.xPlan[zc]*cuts.yPlan[zr]/666.67;
        var _partial=_std>0 && _mu<_std*0.97 && _mu>0.05;
        if(aw>34&&ah>26 && _mu>0.05){
          if(_partial){
            // 非标准分区：与标准分区一致，文字置于分区右上角（已在裁剪层之外绘制，可超出地块显示）
            ppCtx.fillStyle='#000';
            var pLabelX=x+w-8, pLabelY=y+8;
            ppCtx.textAlign='right';
            if(aw>78&&ah>44){
              ppCtx.font='13px sans-serif';
              ppCtx.fillText((zi+1)+'区',pLabelX,pLabelY);
              ppCtx.font='11px sans-serif';
              ppCtx.fillText('实际 '+_mu.toFixed(1)+' 亩',pLabelX,pLabelY+16);
            }else{
              ppCtx.font='8px sans-serif';
              ppCtx.fillText((zi+1)+'区 实际'+_mu.toFixed(1)+'亩',pLabelX,pLabelY);
            }
          }else{
            var zoneSizeText=ppZoneSizeLabel(Math.max(cuts.xPlan[zc],cuts.yPlan[zr]),Math.min(cuts.xPlan[zc],cuts.yPlan[zr]));
            var zoneAreaText=(cuts.xPlan[zc]*cuts.yPlan[zr]/666.67).toFixed(1)+'亩';
            var labelX=x+w-8, labelY=y+8;
            ppCtx.fillStyle='#000';
            if(aw>88&&ah>48){
              ppCtx.textAlign='right';
              ppCtx.font='13px sans-serif';
              ppCtx.fillText((zi+1)+'区',labelX,labelY);
              ppCtx.font='10px sans-serif';
              ppCtx.fillText(zoneSizeText,labelX,labelY+16);
              ppCtx.font='10px sans-serif';
              ppCtx.fillText(zoneAreaText,labelX,labelY+31);
            }else if(ah>70){
              ppCtx.save();
              ppCtx.translate(x+w/2,y+h/2);
              ppCtx.rotate(-Math.PI/2);
              ppCtx.textAlign='center';
              ppCtx.font='10px sans-serif';
              ppCtx.fillText((zi+1)+'区 '+zoneSizeText+' '+zoneAreaText,0,-4);
              ppCtx.restore();
            }else{
              ppCtx.textAlign='center';
              ppCtx.font='8px sans-serif';
              ppCtx.fillText((zi+1)+'区 '+zoneSizeText+' '+zoneAreaText,x+w/2,y+h/2-5);
            }
          }
        }
      }
    }
    ppCtx.textBaseline='alphabetic';
    ppCtx.save();
    ppCtx.strokeStyle='rgba(15,23,42,.38)';
    ppCtx.lineWidth=1.1;
    ppCtx.setLineDash([7,5]);
    for(var bx=0;bx<cuts.xPos.length;bx++){
      var vx1=ppToCanvas(cuts.xPos[bx],b.minY);
      var vx2=ppToCanvas(cuts.xPos[bx],b.minY+b.h);
      ppCtx.beginPath();ppCtx.moveTo(vx1.x,vx1.y);ppCtx.lineTo(vx2.x,vx2.y);ppCtx.stroke();
    }
    for(var by=0;by<cuts.yPos.length;by++){
      var hy1=ppToCanvas(b.minX,cuts.yPos[by]);
      var hy2=ppToCanvas(b.minX+b.w,cuts.yPos[by]);
      ppCtx.beginPath();ppCtx.moveTo(hy1.x,hy1.y);ppCtx.lineTo(hy2.x,hy2.y);ppCtx.stroke();
    }
    ppCtx.restore();
    ppCtx.setLineDash([]);
    ppDrawCutHandles(b,cuts);
  }

  // Draw drip tape as thin perpendicular lines along a sub-branch pipe
  function ppDrawDripTape(line){
    if(!line||line.length<2)return;
    // Drip tape spacing: every 2 meters along the pipe, each tape 3m long
    var spacing=2;
    var tapeLen=3;
    ppCtx.save();
    ppCtx.strokeStyle='rgba(167,139,250,.6)';
    ppCtx.lineWidth=0.8;
    ppCtx.setLineDash([]);
    for(var i=1;i<line.length;i++){
      var p1=line[i-1],p2=line[i];
      var dx=p2.x-p1.x,dy=p2.y-p1.y;
      var segLen=Math.sqrt(dx*dx+dy*dy);
      if(segLen<0.5)continue;
      var ux=dx/segLen,uy=dy/segLen;
      // Perpendicular unit vector
      var px=-uy,py=ux;
      var n=Math.floor(segLen/spacing);
      for(var j=0;j<=n;j++){
        var t=j*spacing;
        if(t>segLen)t=segLen;
        var cx=p1.x+ux*t,cy=p1.y+uy*t;
        // Draw tape on both sides
        var s1=ppToCanvas(cx+px*tapeLen,cy+py*tapeLen);
        var s2=ppToCanvas(cx-px*tapeLen,cy-py*tapeLen);
        ppCtx.beginPath();
        ppCtx.moveTo(s1.x,s1.y);
        ppCtx.lineTo(s2.x,s2.y);
        ppCtx.stroke();
      }
    }
    ppCtx.restore();
  }

  function ppRender(){
    ppCtx.clearRect(0,0,ppCanvas.width,ppCanvas.height);
    // Soft gray background for the pipe planning canvas.
    ppCtx.fillStyle='#dfe4e2';
    ppCtx.fillRect(0,0,ppCanvas.width,ppCanvas.height);

    if(!ppState.polyPts.length){
      // Empty state: just show hint text
      ppCtx.fillStyle='rgba(15,23,42,.42)';ppCtx.font='10px sans-serif';ppCtx.textAlign='right';
      ppCtx.fillText('缩放 '+((ppState.zoom*100).toFixed(0))+'%',ppCanvas.width-8,ppCanvas.height-18);
      ppCtx.fillStyle='rgba(15,23,42,.46)';ppCtx.font='14px sans-serif';ppCtx.textAlign='center';
      ppCtx.fillText('请在面积测量工具中加载多边形',ppCanvas.width/2,ppCanvas.height/2);
      return;
    }

    var b=ppGetBounds();

    // Polygon fill
    ppCtx.fillStyle='rgba(26,71,49,.06)';
    ppTracePlotPath();
    ppCtx.fill();
    ppDrawZones(b);

    // Scale + zoom indicator bottom-right
    ppCtx.fillStyle='rgba(15,23,42,.42)';ppCtx.font='10px sans-serif';ppCtx.textAlign='right';
    var zPct=(ppState.zoom*100).toFixed(0)+'%';
    ppCtx.fillText('缩放 '+zPct,ppCanvas.width-8,ppCanvas.height-18);

    // Polygon outline
    ppCtx.strokeStyle='rgba(26,71,49,.65)';
    ppCtx.lineWidth=2;ppCtx.setLineDash([]);
    ppTracePlotPath();
    ppCtx.stroke();

    /* [v193] 总管（成组地块跨块连接层）：独立于 ppState 的 mainPipes…，
       所以**天然不进任何一块的水力与材料统计**（用户拍板 ③）。 */
    ppDrawGroupTrunk();

    // Main pipes
    ppState.mainPipes.forEach(function(l,idx){
      if(!ppIsPipeHidden('main',idx))ppDrawLine(l,'#185FA5',4);
    });
    // Branch pipes
    ppState.branchPipes.forEach(function(l,idx){
      if(!ppIsPipeHidden('branch',idx))ppDrawLine(l,'#16a34a',2.5);
    });
    // Sub-branch pipes (一级管) — three-level mode only
    if(ppState.subBranchPipes){
      ppState.subBranchPipes.forEach(function(l,idx){
        if(!ppIsPipeHidden('subbranch',idx)){
          ppDrawLine(l,'#185FA5',2);
          // Drip tape: thin perpendicular lines along the sub-branch pipe
          ppDrawDripTape(l);
        }
      });
    }
    ppState.mainPipes.forEach(function(l,idx){
      if(ppIsPipeHidden('main',idx))ppDrawLine(l,'rgba(100,116,139,.55)',3,[7,5]);
    });
    ppState.branchPipes.forEach(function(l,idx){
      if(ppIsPipeHidden('branch',idx))ppDrawLine(l,'rgba(100,116,139,.48)',2,[7,5]);
    });
    if(ppState.subBranchPipes){
      ppState.subBranchPipes.forEach(function(l,idx){
        if(ppIsPipeHidden('subbranch',idx))ppDrawLine(l,'rgba(100,116,139,.42)',1.5,[7,5]);
      });
    }
    if(ppState.pickedPipe&&ppState.pickedPipe.line){
      var pt=ppState.pickedPipe.type;
      var pickedHidden=ppIsPipeHidden(pt,ppState.pickedPipe.index);
      var pickW=pt==='main'?7:pt==='subbranch'?5:5;
      var pickOW=pt==='main'?4:pt==='subbranch'?2:2.5;
      var pickColor=pt==='main'?'#185FA5':pt==='subbranch'?'#185FA5':'#16a34a';
      ppDrawLine(ppState.pickedPipe.line,'#f59e0b',pickW);
      ppDrawLine(ppState.pickedPipe.line,pickedHidden?'rgba(100,116,139,.65)':pickColor,pickOW,pickedHidden?[7,5]:null);
    }

    // Current line being drawn
    if(ppState.currentLine.length>0){
      var c=ppState.mode==='main'?'#185FA5':ppState.mode==='branch'?'#16a34a':ppState.mode==='subbranch'?'#185FA5':'rgba(0,0,0,.35)';
      var w=ppState.mode==='main'?4:ppState.mode==='branch'?2.5:ppState.mode==='subbranch'?2:1.5;
      ppDrawLine(ppState.currentLine,c,w);
      // Vertices
      ppCtx.fillStyle=c;
      ppState.currentLine.forEach(function(pt){
        var p=ppToCanvas(pt.x,pt.y);
        ppCtx.beginPath();ppCtx.arc(p.x,p.y,3,0,Math.PI*2);ppCtx.fill();
      });
    }

    // Source
    if(ppState.source){
      var sp=ppToCanvas(ppState.source.x,ppState.source.y);
      ppCtx.fillStyle='#f59e0b';ppCtx.beginPath();
      ppCtx.arc(sp.x,sp.y,8,0,Math.PI*2);ppCtx.fill();
      ppCtx.strokeStyle='#fff';ppCtx.lineWidth=2;ppCtx.stroke();
      ppCtx.fillStyle='#000';ppCtx.font='10px sans-serif';ppCtx.textAlign='center';
      ppCtx.fillText('水源',sp.x,sp.y-13);
    }

    // Valves
    ppState.valves.filter(function(v){return ppPointInPlot(v);}).forEach(function(v,idx){
      var vp=ppToCanvas(v.x,v.y);
      window.ryValveCanvas(ppCtx,vp.x,vp.y);   /* v159：与总管×主管交接阀同规格（尺寸取自 window.RY_VALVE） */
    });

    /* [v251 2026-10-06 用户要求] 画布左上那行操作提示（模式 / 快捷键说明）已取消 ——
       原绘制语句整块移除；像素闸门 _v246b_pixels.py 的 A 项已同步反转为
       「快捷条下方该区域必须无文字」。 */

    // Length tooltip while drawing
    if(ppState.currentLine.length>0&&ppState.hoverPt&&ppState.mouseWorld&&(ppState.mode==='main'||ppState.mode==='branch'||ppState.mode==='subbranch')){
      var last=ppState.currentLine[ppState.currentLine.length-1];
      var mw=ppGetConstrainedPoint(ppState.mouseWorld);
      var segLen=ppLineLen([last,mw]);
      var totalLen=ppLineLen(ppState.currentLine.concat([mw]));
      var txtSeg='段长: '+segLen.toFixed(1)+' m';
      var txtTotal='总长: '+totalLen.toFixed(1)+' m';
      ppCtx.font='bold 14px sans-serif';
      var wSeg=ppCtx.measureText(txtSeg).width;
      var wTot=ppCtx.measureText(txtTotal).width;
      var tw=Math.max(wSeg,wTot)+24,th=46;
      var hp=ppToCanvas(mw.x,mw.y);
      var tx=hp.x+18,ty=hp.y-th/2;
      if(tx+tw>ppCanvas.width)tx=hp.x-tw-18;
      if(ty<0)ty=2;if(ty+th>ppCanvas.height)ty=ppCanvas.height-th-2;
      ppCtx.fillStyle='rgba(0,0,0,.85)';
      ppCtx.beginPath();
      if(ppCtx.roundRect){ppCtx.roundRect(tx,ty,tw,th,6);}
      else{ppCtx.rect(tx,ty,tw,th);}
      ppCtx.fill();
      ppCtx.strokeStyle='rgba(255,255,255,.3)';ppCtx.lineWidth=1;ppCtx.stroke();
      ppCtx.fillStyle='#86efac';ppCtx.textAlign='left';
      ppCtx.fillText(txtSeg,tx+12,ty+18);
      ppCtx.fillStyle='#86efac';
      ppCtx.fillText(txtTotal,tx+12,ty+36);
    }
  }
  window.ppRender=ppRender;

  var ppSpacePressed=false;
  var ppMouseDownPos=null; // track if mousedown was a potential click vs drag
  /* [v242] 「双击地块轮廓外 = 退回成组页」的中间标记：由 mouseup 判定并立起，dblclick 消费。
     声明在这里（而不是在使用点旁边）是为了让 mousedown 里的复位看得见同一个变量。 */
  var ppDblOutside=false;

  // Helper: get client coords relative to canvas
  function ppClientPos(e){
    var rect=ppCanvas.getBoundingClientRect();
    return{x:e.clientX-rect.left,y:e.clientY-rect.top};
  }

  // Wheel zoom — centered on mouse position
  ppCanvas.addEventListener('wheel',function(e){
    e.preventDefault();
    var pos=ppClientPos(e);
    var delta=e.deltaY>0?0.9:1.1;
    var nz=Math.max(0.1,Math.min(10,ppState.zoom*delta));
    if(nz===ppState.zoom)return;
    // Zoom towards mouse point
    var mw=ppToMeters(pos.x,pos.y);
    ppState.zoom=nz;
    ppUpdateTransform();
    var np=ppToCanvas(mw.x,mw.y);
    ppState.panX+=pos.x-np.x;ppState.panY+=pos.y-np.y;
    ppRender();
  },{passive:false});

  // Keyboard — space for pan, arrows for fine-tune
  var ppKeyHandler=function(e){
    if(e.code==='Space'&&!ppSpacePressed&&document.activeElement===document.body){
      ppSpacePressed=true;ppCanvas.style.cursor='grab';e.preventDefault();
    }
    // Arrow keys for fine-tune in adjustCut mode
    if(ppState.mode==='adjustCut'&&!ppSpacePressed&&document.activeElement===document.body){
      var dir=null;
      if(e.code==='ArrowUp')dir='up';
      else if(e.code==='ArrowDown')dir='down';
      else if(e.code==='ArrowLeft')dir='left';
      else if(e.code==='ArrowRight')dir='right';
      if(dir){e.preventDefault();ppNudgeCut(dir);}
    }
  };
  var ppKeyUpHandler=function(e){
    if(e.code==='Space'){ppSpacePressed=false;ppCanvas.style.cursor=ppState.mode==='adjustCut'?'default':'grab';}
  };
  document.addEventListener('keydown',ppKeyHandler);
  document.addEventListener('keyup',ppKeyUpHandler);

  // Mousedown — start pan or track for click
  ppCanvas.addEventListener('mousedown',function(e){
    var pos=ppClientPos(e);
    ppMouseDownPos=pos;
    ppDblOutside=false;   /* [v242] 新的按下 ⇒ 上一轮的「双击轮廓外退出」标记作废（见 mouseup 处） */
    // Middle button or space+left → start panning
    if(e.button===1||(ppSpacePressed&&e.button===0)){
      ppState.isPanning=true;ppState.panStartX=pos.x-ppState.panX;ppState.panStartY=pos.y-ppState.panY;
      ppCanvas.style.cursor='grabbing';e.preventDefault();return;
    }
    // Left click — will be handled as click on mouseup if no significant drag
    if(e.button===0){
      ppState.isPanning=false; // not panning, but tracking for click
      // 网格线拖动（v98c）：调网格模式，或未在画线时悬停即可直接拖动
      if(ppCutDragReady()){
        var world=ppToMeters(pos.x,pos.y);
        var hit=ppHitTestCutLine(world);
        if(hit){
          ppPushHistory();
          ppState.dragCut={axis:hit.axis,index:hit.index};
          ppState.lastSelectedCut={axis:hit.axis,index:hit.index};
          ppState.mergePreview=null;
          ppCanvas.style.cursor=hit.axis==='x'?'ew-resize':'ns-resize';
          e.preventDefault();return;
        }
      }
    }
  });

  // Mousemove
  ppCanvas.addEventListener('mousemove',function(e){
    var pos=ppClientPos(e);
    if(ppState.isPanning){
      ppState.panX=pos.x-ppState.panStartX;ppState.panY=pos.y-ppState.panStartY;
      ppRender();return;
    }
    // Dragging a cut line（靠近相邻线时吸附并标记合并）
    if(ppState.dragCut){
      var world2=ppToMeters(pos.x,pos.y);
      var dcK=ppState.dragCut;
      var dcCoord=world2[dcK.axis==='x'?'x':'y'];
      // 面积锁定：整轴刚性平移（面积不变）；否则单线拖动（可合并）
      if(ppState.areaLocked&&!ppBmFreeOk(dcK.axis,dcK.index))ppDragCutAxis(dcK.axis,dcK.index,dcCoord);
      else ppDragCutTo(dcK.axis,dcK.index,dcCoord);
      ppRender();
      if(typeof window.ppRefreshDiagramIfVisible==='function')window.ppRefreshDiagramIfVisible();
      return;
    }
    // If dragging with left button (no space, not dragging cut), check threshold
    if(ppMouseDownPos&&e.buttons===1&&!ppSpacePressed&&!ppState.dragCut){
      var dx2=pos.x-ppMouseDownPos.x,dy2=pos.y-ppMouseDownPos.y;
      if(Math.abs(dx2)>2||Math.abs(dy2)>2){
        // Start panning
        ppState.isPanning=true;
        ppState.panStartX=ppMouseDownPos.x-ppState.panX;
        ppState.panStartY=ppMouseDownPos.y-ppState.panY;
        ppCanvas.style.cursor='grabbing';return;
      }
    }
    ppState.mouseWorld=ppToMeters(pos.x,pos.y);
    ppState.hoverPt=pos;
    // 网格线悬停命中（调网格模式 / 未画线时的直接拖动）→ 光标提示
    if(ppCutDragReady()){
      var hit=ppHitTestCutLine(ppState.mouseWorld);
      ppState.hoverCut=hit;
      if(hit)ppState.lastSelectedCut={axis:hit.axis,index:hit.index};
      ppCanvas.style.cursor=hit?(hit.axis==='x'?'ew-resize':'ns-resize'):(ppState.mode==='adjustCut'?'default':'grab');
    } else {
      ppState.hoverCut=null;
    }
    ppRender();
  });

  // Mouseup — stop pan or add point
  ppCanvas.addEventListener('mouseup',function(e){
    // Finalize cut line drag（存在合并预览时执行合并，分区数随之减少）
    if(ppState.dragCut){
      // 面积锁定：只平移、不合并（合并会改变区数与面积）
      var ppBmWasOk=ppBmFreeOk(ppState.dragCut.axis,ppState.dragCut.index);
      var ppMerged=(ppState.areaLocked&&!ppBmWasOk)?false:ppCommitMerge();
      ppState.dragCut=null;
      ppState.hoverCut=null;
      ppCanvas.style.cursor=ppState.mode==='adjustCut'?'default':'grab';
      ppMouseDownPos=null;
      /* v166：调网格松手后同步重建三级简图（60m/545m/224m 标注线与分区色块随新界线）——
         原来只刷二级简图，三级简图停留旧网格，工作区克隆的也是旧图（与 cutDragEnd 链路对齐）。 */
      if(typeof window.ppRefreshTLAfterCuts==='function')window.ppRefreshTLAfterCuts();
      else if(typeof window.ppRefreshDiagramIfVisible==='function')window.ppRefreshDiagramIfVisible();
      if(ppMerged&&typeof ppRefreshMaterials==='function')ppRefreshMaterials();
      ppRender();
      return;
    }
    if(ppState.isPanning){
      ppState.isPanning=false;ppCanvas.style.cursor=ppSpacePressed?'grab':(ppState.mode==='adjustCut'?'default':'grab');
      ppMouseDownPos=null;return;
    }
    // Was a clean click (no drag)
    if(ppMouseDownPos&&e.button===0){
      var pos=ppClientPos(e);
      var dx=pos.x-ppMouseDownPos.x,dy=pos.y-ppMouseDownPos.y;
      if(Math.abs(dx)<=2&&Math.abs(dy)<=2){
        /* [v242] 双击第二击（e.detail>=2）落在地块轮廓【外面】⇒ 这一下是「退出手势」的一半，
           不当落点（详见 ppCanExitByDbl 上方说明）。每次干净点击都会重算本标记，不会残留。 */
        ppDblOutside=(e.detail>=2)&&ppCanExitByDbl(ppToMeters(pos.x,pos.y));
        if(ppDblOutside){ppMouseDownPos=null;return;}
        // It's a click – add point
        if(ppState.mode==='pickPipe'){
          var pick=ppFindNearestPipe(ppToMeters(pos.x,pos.y));
          ppUpdatePickResult(pick);
          if(!pick)alert('未拾取到管线，请点击靠近主管、支管或一级管的位置');
          ppRender();ppMouseDownPos=null;return;
        }
        if(ppState.mode==='maskPipe'){
          var maskPick=ppFindNearestPipe(ppToMeters(pos.x,pos.y));
          if(!maskPick){alert('未拾取到管线，请点击靠近主管、支管或一级管的位置');ppMouseDownPos=null;return;}
          ppPushHistory();
          ppTogglePipeHidden(maskPick);
          ppUpdatePickResult(maskPick);
          if(typeof window.ppRefreshDiagramIfVisible==='function')window.ppRefreshDiagramIfVisible();
          ppRefreshMaterials();
          ppRender();ppMouseDownPos=null;return;
        }
        if(ppState.mode==='source'){
          ppPushHistory();
          ppState.source=ppToMeters(pos.x,pos.y);ppRender();ppMouseDownPos=null;return;
        }
        if(ppState.mode==='valve'){
          var valvePt=ppToMeters(pos.x,pos.y);
          if(!ppPointInPlot(valvePt)){ppMouseDownPos=null;return;}
          ppPushHistory();
          ppState.valves.push(valvePt);ppRender();ppMouseDownPos=null;return;
        }
        if(ppState.mode==='adjustCut'){ppMouseDownPos=null;return;}
        /* [v193] 整组态不允许落块级管线的点 —— 按钮已置灰，这里是兜底
           （模式也可能被脚本/键盘改动，不能只靠按钮 disable 这一道）。 */
        if(ppGroupEditBlocks(ppState.mode)){ppMouseDownPos=null;return;}
        /* [v304 2026-10-08 用户要求] 手动管线绘制禁用：v96 已隐藏绘制模式按钮，但默认 mode='main'
           时画布干净左键点击仍在此落管线点（右键撤点、双击/右键成线照旧），用户点选查看时屡屡误画。
           现对 main/branch/subbranch 三种落点全部拦截——「自动管路」生成的管线、调网格/平移缩放/
           回退/双击地块进出 等交互均不经过此路径，零影响。恢复绘制：删掉下面这行 guard 即可。 */
        if(ppState.mode==='main'||ppState.mode==='branch'||ppState.mode==='subbranch'){ppMouseDownPos=null;return;}
        ppPushHistory();
        var linePt=ppToMeters(pos.x,pos.y);
        linePt=ppGetConstrainedPoint(linePt);
        ppState.currentLine.push(linePt);ppRender();ppUpdateAutoPipeButton();
      }
    }
    ppMouseDownPos=null;
  });

  ppCanvas.addEventListener('mouseleave',function(){
    ppState.hoverPt=null;ppState.mouseWorld=null;ppState.hoverCut=null;
    if(ppState.dragCut){
      var ppMergedLeave=ppCommitMerge(); // 移出画布时按当前预览结算合并
      ppState.dragCut=null;
      /* v166：同 mouseup —— 移出画布结算的合并也要同步三级简图（原路径完全不刷） */
      if(typeof window.ppRefreshTLAfterCuts==='function')window.ppRefreshTLAfterCuts();
      if(ppMergedLeave&&typeof ppRefreshMaterials==='function')ppRefreshMaterials();
    }
    if(ppState.isPanning){ppState.isPanning=false;ppCanvas.style.cursor=ppState.mode==='adjustCut'?'default':'grab';}
    ppMouseDownPos=null;ppRender();
  });

  /* [v242] 双击【地块轮廓外面】= 退回成组管路页（CAD 式：布局里双击进图纸、视口外双击退出）。
     用户原话：「…或者是在布局的窗口内双击进入图纸编辑，在视口外面 双击就退出了。」
     「我这里双击进入的是二级页面，不是三级页面，更正一下。」⇒ 进/出的这一对都在二级页。
     ★ 只在 window.__runyeGroupPlotEdit != null（= 从成组页进来的）时才成立 ——
       平时双击本页是「落点 / 收线」，绝不能被这层含义吃掉。
     ★ 判据的几何用 ppPointInPlot（与阀门落点、面积同源），**拿不到轮廓 / 轮廓不合法一律
       当作在图上** —— 宁可这次不退出，也不能把「双击收线」误判成退页。
     ★ 为什么判定放在 mouseup 而不是 dblclick：双击的**第二击本身也是一次 click**，会先被
       mouseup 当成一个落点塞进 currentLine（主管/支管模式下 100% 发生）——等 dblclick 再取
       消就晚了：收线那条路会顺手收出一根零长度的管。
       ⇒ 口径：mouseup 认出「这是双击的第二击 且 落在地块外」= 这一击不落点，只把标记
         ppDblOutside 立起来；dblclick 见标记为真才真退出（此刻 currentLine 里最多只剩第一击
         留下的一个点，退出时一并丢掉，不会留半根线）。 */
  function ppCanExitByDbl(world){
    if(window.__runyeGroupPlotEdit==null)return false;
    if(typeof window.grBackFromPlotEdit!=='function')return false;
    if(!ppState.polyPts||ppState.polyPts.length<3)return false;
    return !ppPointInPlot(world);
  }
  function ppExitToGroupPage(){
    ppState.currentLine=[];ppState.hoverPt=null;ppState.hoverCut=null;
    ppRender();ppUpdateAutoPipeButton();
    return window.grBackFromPlotEdit()!==false;
  }

  // Double click to finish
  ppCanvas.addEventListener('dblclick',function(e){
    if(ppDblOutside){ppDblOutside=false;ppExitToGroupPage();return;}
    if(ppState.mode==='pickPipe'||ppState.mode==='maskPipe'||ppState.mode==='adjustCut')return;
    if(ppState.currentLine.length<2){ppState.currentLine=[];ppRender();return;}
    ppFinishCurrentLine();   /* [v193] 统一入口（含新增的「总管」），不再在这里单列三种 */
    ppUpdatePickResult(null);
    ppState.currentLine=[];ppState.hoverPt=null;ppRender();ppUpdateAutoPipeButton();
    ppRefreshMaterials();
  });

  // Right-click = undo last point (no context menu)
  ppCanvas.addEventListener('contextmenu',function(e){e.preventDefault();
    if(ppState.currentLine.length>0){ppState.currentLine.pop();ppUpdatePickResult(null);ppRender();ppUpdateAutoPipeButton();}
  });

  /* [v193] 把「结束当前线段落到哪一类管线」抽出来 —— 原逻辑散在 dblclick 与模式按钮
     两处，新增「总管」必须同时改两处，正是典型的「改一处漏一处」。 */
  function ppFinishCurrentLine(){
    if(ppState.currentLine.length<2)return;
    ppPushHistory();
    if(ppState.mode==='main')ppAddPipe('main',ppState.currentLine);
    else if(ppState.mode==='branch')ppAddPipe('branch',ppState.currentLine);
    else if(ppState.mode==='subbranch')ppAddPipe('subbranch',ppState.currentLine);
  }
  /* [v193] 模式切换的统一入口（原为模式按钮点击里的内联逻辑）。
     「总管」按钮是 .pp-btn-ghost.pp-ge-mode，不在 '#ppToolbar .pp-btn[data-mode]' 选择器里，
     原来的委托抓不到它 —— 抽成本函数后两条路径共用同一口径。 */
  function ppSetMode(mode){
    if(ppGroupEditBlocks(mode)){
      alert('整组是总览态，块级管线编辑请切到「逐块」再选子地块。');
      ppSyncGroupEditUI();
      return;
    }
    ppFinishCurrentLine();
    ppState.currentLine=[];ppState.mode=mode;
    ppState.hoverCut=null;
    ppCanvas.style.cursor=ppState.mode==='adjustCut'?'default':'grab';
    ppUpdateAutoPipeButton();
    ppRefreshMaterials();
    if(ppState.mode!=='pickPipe'&&ppState.mode!=='maskPipe'&&ppState.mode!=='adjustCut')ppUpdatePickResult(null);
    /* 高亮：原来只扫 .pp-btn[data-mode]，总管按钮扫不到 ⇒ 点总管后主管仍亮着。
       改成扫全部 [data-mode]，一次 toggle 到位。 */
    document.querySelectorAll('#ppToolbar [data-mode]').forEach(function(b){
      b.classList.toggle('active', b.getAttribute('data-mode')===mode);
    });
    // Show fine-tune group only in adjustCut mode
    // [v188] 改用统一入口 ppSyncFineGroup()，与「地块划分」开关那条路径共用同一口径，
    //        避免「两条路径各写一遍、改一处漏一处」（本次就是这个 bug）。
    if(typeof ppSyncFineGroup==='function') ppSyncFineGroup();
    else { var fg=document.getElementById('ppCutFineGroup'); if(fg)fg.style.display=ppState.mode==='adjustCut'?'inline-flex':'none'; }
    ppRender();
  }

  // Mode buttons
  document.querySelectorAll('#ppToolbar .pp-btn[data-mode]').forEach(function(btn){
    btn.addEventListener('click',function(){ ppSetMode(btn.dataset.mode); });
  });

  function ppSetLineDrawMode(mode){
    ppState.lineDrawMode=mode==='ortho'?'ortho':'free';
    var orthoBtn=document.getElementById('ppLineOrtho');
    if(orthoBtn)orthoBtn.classList.toggle('active',ppState.lineDrawMode==='ortho');
    ppRender();
  }

  document.getElementById('ppLineOrtho').addEventListener('click',function(){
    ppSetLineDrawMode(ppState.lineDrawMode==='ortho'?'free':'ortho');
  });

  // ===== Three-level pipeline legend update =====
  function ppUpdateLegend(isThree){
    var legend=document.getElementById('ppLegend');
    if(!legend)return;
    var items=legend.querySelectorAll('.pp-legend-item');
    // Rebuild legend
    legend.innerHTML='<span class="pp-legend-item"><i style="background:#185FA5"></i>主管</span>'
      +'<span class="pp-legend-item"><i style="background:#16a34a"></i>支管</span>'
      +(isThree?'<span class="pp-legend-item"><i style="background:#185FA5"></i>一级管</span><span class="pp-legend-item"><i style="background:#a78bfa;height:2px;width:18px"></i>滴灌带</span>':'')
      +'<span class="pp-legend-item"><i style="background:#f59e0b;border-radius:50%;width:10px;height:10px"></i>水源</span>'
      +'<span class="pp-legend-item"><i style="background:#ef4444;border-radius:50%;width:10px;height:10px"></i>阀门</span>';
  }

  // Undo — global step-back through all operations
  document.getElementById('ppUndo').addEventListener('click',function(){
    var ok=ppUndoStep();
    if(ok){
      ppUpdatePickResult(null);
      ppRender();ppUpdateAutoPipeButton();
      /* v166：回退后同步三级简图（界线可能回到上一状态） */
      if(typeof window.ppRefreshTLAfterCuts==='function')window.ppRefreshTLAfterCuts();
      else if(typeof window.ppRefreshDiagramIfVisible==='function')window.ppRefreshDiagramIfVisible();
      ppRefreshMaterials();
    }
  });

  function ppHasPipeContent(){
    return !!(ppState.mainPipes.length||ppState.branchPipes.length||(ppState.subBranchPipes&&ppState.subBranchPipes.length)||ppState.valves.length||ppState.currentLine.length||ppState.source);
  }

  function ppUpdateAutoPipeButton(){
    var btn=document.getElementById('ppAutoPipe');
    if(!btn)return;
    var has=ppHasPipeContent();
    btn.classList.toggle('active',has);
    btn.textContent=has?'清除管路':'自动管路';
  }

  function ppRefreshDiagramOrReset(){
    if(!window.ppRefreshDiagramIfVisible||!window.ppRefreshDiagramIfVisible()){
      ppState.lastSVG=null;
      var content=document.getElementById('ppDiagramContent');
      if(content) content.innerHTML='<div class="pp-diagram-empty">完成面积测量并点击「生成施工图」后，这里显示最终施工图。</div>';
    }
  }

  function ppClearPipes(){
    ppPushHistory();
    /* [v201] 整组态的「清除管路」必须落到各块 slot —— 与整组态的生成互为逆操作。
       否则只有二级页的合并视图清了、各块 slot 还在 ⇒ 成组管路页照样把管画出来，
       用户点「清除管路」却看着管子还在（第二份「两页不一致」的坑）。 */
    if(ppIsGroupWhole()){
      window.__runyeGroupEdit.slots.forEach(function(s){
        if(!s)return;
        s.mainPipes=[];s.branchPipes=[];s.subBranchPipes=[];s.source=null;s.valves=[];
        ppSlotRebuildIds(s);
      });
      /* 同步推给「成组管路」页，避免它停在旧画面 */
      setTimeout(function(){ try{ ppSyncGroupEditUI(); }catch(e){} },0);
    }
    ppState.mainPipes=[];ppState.branchPipes=[];ppState.subBranchPipes=[];
    ppState.source=null;ppState.valves=[];ppState.currentLine=[];ppState.hiddenPipes={main:{},branch:{},subbranch:{}};ppState.pipeIds={main:[],branch:[],subbranch:[]};ppState.nextPipeId=1;ppState.cutOverrides={x:{},y:{}};ppResetCutSnap('');ppUpdatePickResult(null);ppRender();
    ppUpdateAutoPipeButton();
    if(typeof window.ppRefreshDiagramIfVisible==='function') window.ppRefreshDiagramIfVisible();
    ppRefreshMaterials();
  }

  /* [v201] 自动布管的**纯几何内核**：给一套环点 → 算出该块内部的主管 / 支管 /
     一级管 / 阀门。*不写* ppState —— 只在其间临时借 ppState.polyPts 以复用既有
     ppGetBounds / ppGetZoneLayout / ppGetZoneCuts / ppPointInPlot，finally 原样还原
     （与 RunyeBridge.zoneCutsFor 同款 swap-restore）。
     ★★ 为什么必须拆出来（用户实测：「尺寸标注没有，主管跟支管未显示」，
        证据 _p1/_diag_v201_group_pipes.cjs 路径 A）：
        旧代码整组态点「自动管路」时，拿的是**外框 bounds** 一把梭 ——
        ① 把块间空隙当成地布了管；② 产物只落在整组合并视图 ppState 里，
           而 ppSetGroupMode 明确写着「整组态的管线是只读视图、不存档」
           ⇒ 一根都没进 ge.slots[i] ⇒ 成组管路页永远画不出来、jimmy尺寸标注也无从标。
        拆出来之后整组态 =「对每一块各调一次本函数」，与 v193 铁律一致
        （成组 = 多次单块，一行布管规则都不改写）。 */
  function ppBuildAutoPipes(polyPts, planN, isThree, useOwnDims, forceDir) {
    var out = { main: [], branch: [], subbranch: [], valves: [] };
    var keepPoly = ppState.polyPts, keepOwn = ppOwnDimOverride;
    try {
      ppState.polyPts = (polyPts || []).map(function (p) { return { x: p.x, y: p.y }; });
      if (useOwnDims) ppOwnDimOverride = true;   /* 见 ppGetPlanDims 处 [v201] 说明 */
      if (ppState.polyPts.length < 3) return out;
      var b = ppGetBounds();
      var cuts = ppGetZoneCuts(b, ppGetZoneLayout(b, planN));

      /* [v229 2026-10-05 用户要求] 主管/支管走向「少数服从多数」，全块统一：
         用户原话：「分了 20 个分区，其中有 11 个以上的分区是横向走主管、支管，
           那剩余 9 个分区也应该按照横向走，而不是用了其他计算规则，变换了方向」。
         ★ 口径：先按各分区自然朝向（xPlan>=yPlan ⇒ 竖向，否则横向）投票，
           **严格多数**方向强制给全体分区；平票不强改（维持各分区原朝向）。
           自然朝向判定与下方生成循环同一套（cuts.xPlan/yPlan，已含拖线/合并结果），
           投票与生成永远看同一份 cuts ⇒ 不存在两套规则。 */
      if (forceDir !== 'v' && forceDir !== 'h') {
        var votesV = 0;
        for (var vr = 0; vr < cuts.rows; vr++)
          for (var vc = 0; vc < cuts.cols; vc++)
            votesV += (cuts.xPlan[vc] >= cuts.yPlan[vr]) ? 1 : -1;
        if (votesV > 0) forceDir = 'v';
        else if (votesV < 0) forceDir = 'h';
      }

      for (var zr = 0; zr < cuts.rows; zr++) {
        for (var zc = 0; zc < cuts.cols; zc++) {
          var zx = cuts.xPos[zc], zy = cuts.yPos[zr];
          var zoneW = cuts.xSrc[zc], zoneH = cuts.ySrc[zr];
          var centerX = zx + zoneW / 2, centerY = zy + zoneH / 2;
          /* [v229] 多数派方向优先：forceDir 命中时不再按本分区宽高比各自判定 */
          var fixedSideIsHorizontal = (forceDir === 'v') ? true
            : (forceDir === 'h') ? false
            : (cuts.xPlan[zc] >= cuts.yPlan[zr]);
          if (fixedSideIsHorizontal) {
            var mainX = zx + zoneW * 0.40;
            out.main.push([{ x: mainX, y: zy }, { x: mainX, y: zy + zoneH }]);
            // 支管两端各缩进一段距离（分区边长 6%，4~14m），不与分区边缘相接，使各地块支管视觉上独立断开
            var gapV2 = Math.min(Math.max(zoneH * 0.06, 4), 14, zoneH * 0.22);
            out.branch.push([{ x: centerX, y: zy + gapV2 }, { x: centerX, y: zy + zoneH - gapV2 }]);
            if (ppPointInPlot({ x: centerX, y: centerY })) out.valves.push({ x: centerX, y: centerY });
            // Three-level: sub-branch pipes perpendicular to branch (horizontal)
            if (isThree) {
              var nSub = Math.max(2, Math.floor(zoneH / 15));
              for (var sb = 1; sb <= nSub; sb++) {
                var sbY = zy + zoneH * sb / (nSub + 1);
                out.subbranch.push([{ x: zx + zoneW * 0.15, y: sbY }, { x: zx + zoneW * 0.85, y: sbY }]);
              }
            }
          } else {
            var mainY = zy + zoneH * 0.40;
            out.main.push([{ x: zx, y: mainY }, { x: zx + zoneW, y: mainY }]);
            // 支管两端缩进，与分区边缘留出空隙
            var gapH2 = Math.min(Math.max(zoneW * 0.06, 4), 14, zoneW * 0.22);
            out.branch.push([{ x: zx + gapH2, y: centerY }, { x: zx + zoneW - gapH2, y: centerY }]);
            if (ppPointInPlot({ x: centerX, y: centerY })) out.valves.push({ x: centerX, y: centerY });
            // Three-level: sub-branch pipes perpendicular to branch (vertical)
            if (isThree) {
              var nSub2 = Math.max(2, Math.floor(zoneW / 15));
              for (var sb2 = 1; sb2 <= nSub2; sb2++) {
                var sbX = zx + zoneW * sb2 / (nSub2 + 1);
                out.subbranch.push([{ x: sbX, y: zy + zoneH * 0.15 }, { x: sbX, y: zy + zoneH * 0.85 }]);
              }
            }
          }
        }
      }
    } finally { ppState.polyPts = keepPoly; ppOwnDimOverride = keepOwn; }
    return out;
  }

  /* [v201] 给某个 slot 重建 pipeIds / hiddenPipes / nextPipeId（长度必须对得上，
     否则 ppPipeKey(type,i) 取到 undefined ⇒ 隐藏判定与拾取都对不上号）。 */
  function ppSlotRebuildIds(s) {
    if (!s) return;
    s.pipeIds = { main: [], branch: [], subbranch: [] };
    s.hiddenPipes = { main: {}, branch: {}, subbranch: {} };
    var map = [['main', 'mainPipes', 'm'], ['branch', 'branchPipes', 'b'], ['subbranch', 'subBranchPipes', 's']];
    var maxN = 0;
    map.forEach(function (t) {
      var arr = s[t[1]] || [], pre = t[2];
      for (var i = 0; i < arr.length; i++) { s.pipeIds[t[0]].push(pre + (i + 1)); maxN = Math.max(maxN, i + 1); }
    });
    s.nextPipeId = maxN + 1;
  }

  function ppIsGroupWhole() {
    var ge = window.__runyeGroupEdit;
    return !!(ge && ge.active && ge.mode === 'whole' && ge.slots && ge.slots.length >= 2);
  }

  function ppAutoGeneratePipes() {
    if (!ppState.polyPts.length) { alert('请先在面积测量工具中描绘边界'); return; }
    ppPushHistory();

    var planN = parseInt(document.getElementById('planN')?.value) || parseInt(document.getElementById('fld_N')?.value) || 4;
    var isThree = ppState.pipeLevel === 'three';

    /* [v201] 整组态：逐块生成、逐块存档到 ge.slots[i]，整组视图 = 各块之和。
       ★ 不再用外框 bounds 一把梭 —— 那样既把块间空隙当成了地，产物又无处可存
         （用户实测：成组管路页一根管都看不到）。合并走既有的 ppCollectGroupAllPipes，
         与 ppSetGroupMode 里「逐块 → 整组」的合并口径严格同一套。 */
    if (ppIsGroupWhole()) {
      var geW = window.__runyeGroupEdit;
      geW.slots.forEach(function (s) {
        if (!s || !s.polyPts || s.polyPts.length < 3) return;
        var r = ppBuildAutoPipes(s.polyPts, planN, isThree, true);
        s.mainPipes = r.main; s.branchPipes = r.branch; s.subBranchPipes = r.subbranch;
        s.valves = r.valves; s.source = null;
        s.cutOverrides = { x: {}, y: {} }; s.mergePreview = null;
        ppSlotRebuildIds(s);
      });
      var mg = ppCollectGroupAllPipes();
      ppState.mainPipes = mg.main; ppState.branchPipes = mg.branch; ppState.subBranchPipes = mg.subbranch;
      ppState.source = null; ppState.valves = [];
      ppState.pipeIds = { main: [], branch: [], subbranch: [] }; ppState.nextPipeId = 1;
      ppState.hiddenPipes = { main: {}, branch: {}, subbranch: {} };
      ppState.currentLine = [];
      ppEnsurePipeIds('main'); ppEnsurePipeIds('branch'); ppEnsurePipeIds('subbranch');
      ppUpdatePickResult(null);
      ppResetCutSnap('');
      ppRender();
      ppUpdateAutoPipeButton();
      if (typeof window.ppRefreshDiagramIfVisible === 'function') window.ppRefreshDiagramIfVisible();
      ppRefreshMaterials();
      /* 立刻推给「成组管路」页 —— 它只看得到 slots，不刷新就还是空的 */
      ppSyncGroupEditUI();
      return;
    }

    /* 单块 / 逐块态：照旧写 ppState（行为与 v201 之前完全一致） */
    var r2 = ppBuildAutoPipes(ppState.polyPts, planN, isThree);
    ppState.mainPipes = r2.main;
    ppState.branchPipes = r2.branch;
    ppState.subBranchPipes = r2.subbranch;
    ppState.valves = r2.valves;
    ppState.currentLine = [];
    ppState.hiddenPipes = { main: {}, branch: {}, subbranch: {} };
    ppState.pipeIds = { main: [], branch: [], subbranch: [] }; ppState.nextPipeId = 1;
    ppUpdatePickResult(null);
    ppEnsurePipeIds('main'); ppEnsurePipeIds('branch'); ppEnsurePipeIds('subbranch');

    ppRender();
    ppUpdateAutoPipeButton();
    if (typeof window.ppRefreshDiagramIfVisible === 'function') window.ppRefreshDiagramIfVisible();
    ppRefreshMaterials();
  }

  function ppRepartitionFromRotatedPlot(opts){ /* [v326] opts.aiApply=AI规划回传应用：跳过旋转角度校验（deg=0 旋转为恒等变换，重切流程复用；手动点击不受影响） */
    ppUnlockArea(); // 重新分区会改变各区面积，锁定态自动解除（任务K 2026-09-26）
    if(!ppState.polyPts.length){alert('请先在面积测量工具中描绘边界');return;}
    var deg=parseFloat(ppState.plotRotationDeg)||0;
    if(!deg&&!(opts&&opts.aiApply)){alert('请先输入地块旋转角度，再点击重新分区');return;} /* [v326] AI规划应用无需旋转角度 */
    if(ppHasPipeContent()&&!confirm('重新分区会清除当前绘制的管线、阀门和水源，是否继续？'))return;
    ppPushHistory();
    var _rotB=ppGetBounds();
    var _rotC={x:_rotB.minX+_rotB.w/2,y:_rotB.minY+_rotB.h/2};
    var rotatedPts=ppGetRotatedPlotPoints();
    ppState.polyPts=rotatedPts.map(function(p){return{x:p.x,y:p.y};});
    window.measuredPolygon=ppState.polyPts.map(function(p){return{x:p.x,y:p.y};});
    /* [v190] 子地块环随主轮廓一起旋转落定（同一 center/deg），否则两者错位、空隙位置错乱 */
    ppXformSubRings(function(pt){return ppRotatePoint(pt,deg,_rotC);});
    /* [v193] 旋转作用于整组：各块的环/管线/外框/总管一起转（用户拍板 ④）。
       重新分区本来就会清空管线 ⇒ clearPipes:true，避免各块留下旋转前的旧坐标。 */
    ppXformGroupAll(function(pt){return ppRotatePoint(pt,deg,_rotC);},{clearPipes:true});
    /* measuredPolygon 始终代表「整个成组地块」的外框，不能停在某一块的环上 */
    var geRot=window.__runyeGroupEdit;
    if(geRot&&geRot.active)window.measuredPolygon=geRot.framePts.map(function(p){return{x:p.x,y:p.y};});
    ppState.plotRotationDeg=0;
    var angleInput=document.getElementById('ppPlotAngle');
    if(angleInput)angleInput.value=0;
    ppState.mainPipes=[];
    ppState.branchPipes=[];
    ppState.subBranchPipes=[];
    ppState.source=null;
    ppState.valves=[];
    ppState.currentLine=[];
    ppState.hiddenPipes={main:{},branch:{},subbranch:{}};
    ppState.pipeIds={main:[],branch:[],subbranch:[]};
    ppState.nextPipeId=1;
    ppState.cutOverrides={x:{},y:{}};ppResetCutSnap('');
    ppState.dragCut=null;ppState.hoverCut=null;
    ppUpdatePickResult(null);
    // Recalculate plan dimensions from the rotated polygon
    if(typeof updatePlan==='function') updatePlan();
    ppUpdateTransform();
    ppRender();
    ppUpdateAutoPipeButton();
    ppRefreshDiagramOrReset();
  }

  document.getElementById('ppAutoPipe').addEventListener('click',function(){
    if(ppHasPipeContent())ppClearPipes();
    else ppAutoGeneratePipes();
  });

  document.getElementById('ppRotateZones').addEventListener('click',function(){
    ppUnlockArea(); // 分区旋转会改变各区面积，锁定态自动解除（任务K 2026-09-26）
    ppPushHistory();
    ppState.zoneRotated=!ppState.zoneRotated;
    this.classList.toggle('active',ppState.zoneRotated);
    this.textContent=ppState.zoneRotated?'↻ 分区已旋转90°':'↻ 分区旋转90°';
    ppRender();
    ppRefreshDiagramOrReset();
  });

  var ppPlotAngleInput=document.getElementById('ppPlotAngle');
  if(ppPlotAngleInput){
    ppPlotAngleInput.addEventListener('input',function(){
      var v=parseFloat(this.value);
      if(!isFinite(v))v=0;
      v=Math.max(-180,Math.min(180,v));
      ppState.plotRotationDeg=v;
      ppUpdateTransform();
      ppRender();
      ppRefreshDiagramOrReset();
    });
  }

  // ===== 地块镜像：以地块包围盒中心为轴，翻转整张图（含管线/水源/阀门）=====
  // mode: 'none' | 'h'(水平/左右) | 'v'(垂直/上下)
  function ppSyncMirrorUI(){
    var btns=document.querySelectorAll('.pp-mirror-btn');
    btns.forEach(function(btn){ btn.classList.toggle('active', btn.getAttribute('data-mirror')===(ppState.plotMirror||'none')); });
  }
  function ppMirrorPoint(p,mode,cx,cy){
    if(mode==='h')return{x:2*cx-p.x,y:p.y};
    if(mode==='v')return{x:p.x,y:2*cy-p.y};
    return{x:p.x,y:p.y};
  }
  function ppApplyMirror(mode){
    if(!ppState.polyPts.length){alert('请先在面积测量工具中加载地块多边形');return;}
    if(!ppState.plotMirror)ppState.plotMirror='none';
    // 先撤销上一次镜像（镜像是对合运算，再镜像一次即回到基准），再应用新镜像
    if(ppState.plotMirror!=='none'){
      var b=ppGetBounds();var cx=b.minX+b.w/2,cy=b.minY+b.h/2;
      var tf=function(pt){return ppMirrorPoint(pt,ppState.plotMirror,cx,cy);};
      ppState.polyPts=ppState.polyPts.map(tf);
      ppState.mainPipes=ppState.mainPipes.map(function(l){return l.map(tf);});
      ppState.branchPipes=ppState.branchPipes.map(function(l){return l.map(tf);});
      if(ppState.subBranchPipes)ppState.subBranchPipes=ppState.subBranchPipes.map(function(l){return l.map(tf);});
      if(ppState.source)ppState.source=tf(ppState.source);
      ppState.valves=ppState.valves.map(tf);
      ppXformSubRings(tf); // [v190] 子地块环随主轮廓一起撤销镜像
      ppXformGroupAll(tf); // [v193] 各块 slot / 外框 / 总管同步撤销
    }
    // 再应用新镜像（以当前几何中心为轴）
    if(mode!=='none'){
      var b2=ppGetBounds();var cx2=b2.minX+b2.w/2,cy2=b2.minY+b2.h/2;
      var tf2=function(pt){return ppMirrorPoint(pt,mode,cx2,cy2);};
      ppState.polyPts=ppState.polyPts.map(tf2);
      ppState.mainPipes=ppState.mainPipes.map(function(l){return l.map(tf2);});
      ppState.branchPipes=ppState.branchPipes.map(function(l){return l.map(tf2);});
      if(ppState.subBranchPipes)ppState.subBranchPipes=ppState.subBranchPipes.map(function(l){return l.map(tf2);});
      if(ppState.source)ppState.source=tf2(ppState.source);
      ppState.valves=ppState.valves.map(tf2);
      ppXformSubRings(tf2); // [v190] 子地块环随主轮廓一起应用新镜像
      ppXformGroupAll(tf2); // [v193] 各块 slot / 外框 / 总管同步应用
    }
    ppState.plotMirror=mode;
    // 镜像后世界坐标翻转，手动分区线位置失效，恢复默认划分（可用「回退」撤销）
    ppResetCutSnap('');
    // 同步全局多边形（面积标签 / 三级传导保持一致）
    // [v193] 成组时 measuredPolygon 恒为整组外框（逐块态 ppState.polyPts 只是其中一块）
    var geMir=window.__runyeGroupEdit;
    window.measuredPolygon=(geMir&&geMir.active?geMir.framePts:ppState.polyPts).map(function(p){return{x:p.x,y:p.y};});
    ppSyncMirrorUI();
    ppUpdateTransform();ppRender();
    if(typeof ppRefreshDiagramOrReset==='function')ppRefreshDiagramOrReset();
  }
  // 镜像按钮（事件委托到按钮组）
  var ppMirrorWrap=document.querySelector('.pp-mirror-btn');
  if(ppMirrorWrap){
    ppMirrorWrap.parentNode.addEventListener('click',function(e){
      var btn=e.target.closest?e.target.closest('.pp-mirror-btn'):null;
      if(!btn||!btn.classList.contains('pp-mirror-btn'))return;
      ppPushHistory();
      ppApplyMirror(btn.getAttribute('data-mirror'));
    });
  }

  var ppRepartitionBtn=document.getElementById('ppRepartition');
  if(ppRepartitionBtn){
    ppRepartitionBtn.addEventListener('click',ppRepartitionFromRotatedPlot);
  }
  /* ===== [v325 2026-10-09 用户要求] AI 规划闭环：带地块信息跳 AI 助手；回传结果提示应用 ===== */
  (function ppAiPlanFlow(){
    function snapshot(){
      function g(id){var el=document.getElementById(id);return el?el.value:null;}
      return {lift:g('planLift'),tapeLaySide:g('planTapeLaySide'),tapeSpacing:g('planTapeSpacing'),
        emitterSpacing:g('planEmitterSpacing'),emitterFlow:g('planEmitterFlow'),
        zoneMu:g('planZoneMuManual'),targetV:g('planTargetV'),tapePressure:g('planTapePressure'),zones:g('planN')};
    }
    var btn=document.getElementById('ppAiPlan');
    if(btn)btn.addEventListener('click',function(){
      try{localStorage.setItem('runye_ai_plan_v1',JSON.stringify({mode:'request',at:Date.now(),params:snapshot()}));}catch(e){}
      /* [v327] 跳转前静默存档全量方案 + 写一次性锚：返回本页时恢复（页内手画/图片测量边界无地块库锚，v161 自动恢复不覆盖） */
      try{if(typeof window.runyeSaveProject==='function')window.runyeSaveProject(true);}catch(e){}
      try{localStorage.setItem('runye_aiplot_anchor_v1',JSON.stringify({at:Date.now()}));}catch(e){}
      /* [v331b 2026-10-09 用户要求] AI规划同样走独立窗口（旧对话页已被智能规划工作台替代重定向）：
         主窗口原地不动、地块分区手动规划不受影响；弹窗内 v327 锚自动恢复当前边界。 */
      var _smartWin=window.open('index.html?smart=1#pipePlanSection','runye_smart','width=1180,height=860');
      if(!_smartWin)location.href='index.html?smart=1#pipePlanSection';
    });
    function applyPlan(plan){
      function set(id,v){var el=document.getElementById(id);
        if(el&&v!==null&&v!==undefined&&isFinite(+v)){el.value=v;
          el.dispatchEvent(new Event('change',{bubbles:true}));el.dispatchEvent(new Event('input',{bubbles:true}));}}
      var p=plan.params||{};
      set('planZoneMuManual',p.zoneMu);set('planTargetV',p.targetV);set('planTapePressure',p.tapePressure);
      set('planTapeLaySide',p.tapeLaySide);set('planTapeSpacing',p.tapeSpacing);
      set('planEmitterSpacing',p.emitterSpacing);set('planEmitterFlow',p.emitterFlow);set('planLift',p.lift);
      try{var t3=document.getElementById('tlPlanTargetV');
        if(t3&&p.targetV!==null&&p.targetV!==undefined&&isFinite(+p.targetV)){t3.value=p.targetV;t3.dispatchEvent(new Event('input',{bubbles:true}));}}catch(e){}
      if(typeof ppRepartitionFromRotatedPlot==='function'){try{ppRepartitionFromRotatedPlot({aiApply:true});}catch(e){}} /* [v326] */
    }
    function checkPlan(){
      var w=null;try{w=JSON.parse(localStorage.getItem('runye_ai_plan_v1')||'null');}catch(e){}
      if(!w||w.mode!=='plan')return;
      var btn2=document.getElementById('ppAiPlan');if(!btn2)return;
      if(document.getElementById('ppAiPlanNotice'))return;
      var p=w.params||{},desc=[];
      if(p.zones!=null)desc.push('共 '+p.zones+' 区');
      if(p.zoneMu!=null)desc.push('每区 '+p.zoneMu+' 亩');
      if(p.tapePressure!=null)desc.push('入口压力 '+p.tapePressure+' bar');
      if(p.targetV!=null)desc.push('目标流速 '+p.targetV+' m/s');
      if(p.emitterFlow!=null)desc.push('滴头流量 '+p.emitterFlow+' L/h');
      var bar=document.createElement('div');
      bar.id='ppAiPlanNotice';
      bar.style.cssText='position:absolute;top:44px;left:10px;z-index:4;background:#f0fdf4;border:1px solid #bbd8c6;color:#15803d;font-size:11.5px;padding:6px 10px;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,.08);display:flex;gap:8px;align-items:center;white-space:nowrap';
      bar.innerHTML='🤖 AI 规划：'+(desc.join('，')||'参数已更新')+
        ' <button id="ppAiPlanApply" type="button" style="border:0;background:#15803d;color:#fff;border-radius:4px;padding:3px 10px;cursor:pointer;font-size:11px">应用并重新分区</button>'+
        '<button id="ppAiPlanSkip" type="button" style="border:1px solid #cbd5e1;background:#fff;color:#64748b;border-radius:4px;padding:3px 8px;cursor:pointer;font-size:11px">忽略</button>';
      var host=btn2.closest('.pp-canvas-wrap')||btn2.parentElement.parentElement;
      host.appendChild(bar);
      document.getElementById('ppAiPlanApply').onclick=function(){
        applyPlan(w);
        try{localStorage.setItem('runye_ai_plan_v1',JSON.stringify({mode:'applied',at:Date.now()}));}catch(e){}
        bar.remove();};
      document.getElementById('ppAiPlanSkip').onclick=function(){
        try{localStorage.setItem('runye_ai_plan_v1',JSON.stringify({mode:'applied',at:Date.now()}));}catch(e){}
        bar.remove();};
    }
    setTimeout(checkPlan,600);setTimeout(checkPlan,2500);setTimeout(checkPlan,6000);
    window.addEventListener('storage',function(e){if(e.key==='runye_ai_plan_v1')checkPlan();});
  })();


  /* ===== [v248 2026-10-06 用户要求] 快捷条(#ppQuickBar)整条可拖动：按住左侧抓手拖，
         位置存 localStorage('ppQuickBarPos')；恢复与拖动中都夹紧在画布范围内，
         拖的是抓手（setPointerCapture），条内输入框/按钮交互不受影响。 ===== */
  (function ppQuickBarDrag(){
    var bar=document.getElementById('ppQuickBar'),wrap=document.getElementById('ppCanvasWrap'),grip=document.getElementById('ppQuickGrip');
    if(!bar||!wrap||!grip)return;
    var dragPx=0,dragPy=0,dragging=false;
    function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
    function applyPos(l,t){
      var wr=wrap.getBoundingClientRect(),br=bar.getBoundingClientRect();
      l=clamp(l,0,Math.max(0,wr.width-br.width));
      t=clamp(t,0,Math.max(0,wr.height-br.height));
      bar.style.left=Math.round(l)+'px';bar.style.top=Math.round(t)+'px';
    }
    (function restorePos(tries){
      /* [v248b] 区块隐藏时 rect 全 0，夹紧会把位置压成 0 ⇒ 等区块可见再落位（最长约 10s） */
      var wr=wrap.getBoundingClientRect();
      if(wr.width<50&&tries>0){ setTimeout(function(){restorePos(tries-1);},200); return; }
      try{
        var sp=JSON.parse(localStorage.getItem('ppQuickBarPos')||'null');
        if(sp&&typeof sp.l==='number'&&typeof sp.t==='number')applyPos(sp.l,sp.t);
      }catch(err){}
    })(50);
    grip.addEventListener('pointerdown',function(e){
      if(e.button!==undefined&&e.button!==0)return;
      e.preventDefault();e.stopPropagation();
      var br=bar.getBoundingClientRect();
      dragging=true;dragPx=e.clientX-br.left;dragPy=e.clientY-br.top;
      bar.classList.add('pp-quick-dragging');
      try{grip.setPointerCapture(e.pointerId);}catch(err){}
    });
    grip.addEventListener('pointermove',function(e){
      if(!dragging)return;
      e.preventDefault();e.stopPropagation();
      var wr=wrap.getBoundingClientRect();
      applyPos(e.clientX-wr.left-dragPx,e.clientY-wr.top-dragPy);
    });
    function endDrag(e){
      if(!dragging)return;
      dragging=false;
      bar.classList.remove('pp-quick-dragging');
      try{if(e&&e.pointerId!==undefined)grip.releasePointerCapture(e.pointerId);}catch(err){}
      var wr=wrap.getBoundingClientRect(),br=bar.getBoundingClientRect();
      try{localStorage.setItem('ppQuickBarPos',JSON.stringify({l:Math.round(br.left-wr.left),t:Math.round(br.top-wr.top)}));}catch(err){}
    }
    grip.addEventListener('pointerup',endDrag);
    grip.addEventListener('pointercancel',endDrag);
  })();

  /* ===== [v249 2026-10-06 用户要求] 右侧竖排工具轨「靠右折叠」：点画布右上角把手，
         工具列整条向右缘收起（横向滑出、画布加宽），再点展开；
         状态存 localStorage('ppRailOff')；折叠只改版面，按钮事件全部保留。 ===== */
  (function ppRailCollapse(){
    var stage=document.querySelector('#pipePlanSection .pp-stage'),pane=stage?stage.querySelector('.ry-pane-edit'):null,btn=document.getElementById('ppRailToggle');
    if(!stage||!btn)return;
    /* [v270] body 级置顶代理：外观复制 .pp-rail-tab（z9995 > AI 面板 9993），
       点击转发真按钮；显隐 = 折叠中 && 真按钮 display≠none（真按钮可见期间
       visibility:hidden 防双影）。真按钮的 display 由分区视图/顶栏切换的 CSS 控制，
       代理用 ryShowSection 包装 + MutationObserver 双保险跟随。 */
    var proxy=null;
    function ensureProxy(){
      if(proxy)return;
      proxy=document.createElement('button');
      proxy.type='button';
      proxy.className='pp-rail-tab-float';
      proxy.textContent='工具栏';
      document.body.appendChild(proxy);
      proxy.addEventListener('click',function(){ btn.click(); });
    }
    function syncProxy(offNow){
      ensureProxy();
      var vis=(offNow && getComputedStyle(btn).display!=='none');
      proxy.style.display=vis?'flex':'none';
      proxy.setAttribute('title',offNow?'展开工具栏':'收起工具栏（靠右折叠）');
      btn.style.visibility=vis?'hidden':'';
    }
    function apply(off){
      stage.classList.toggle('pp-rail-off',off);
      if(pane)pane.classList.toggle('pp-rail-off',off);
      btn.classList.toggle('pp-rail-tab',off);
      /* [v270 2026-10-06 用户要求] 折叠标签条永远置顶（见 .pp-rail-tab-float CSS 注释）：
         第一版 inline position:fixed 已被探针证伪 —— fixed 只换包含块、不换层叠上下文，
         真按钮仍是 main{z-index:1} 的子孙，根上下文的 AI 面板(z9993)照样盖住。
         ⇒ 改用 body 级置顶代理（.pp-rail-tab-float，z9995），显隐随折叠态与真按钮可见性同步。 */
      syncProxy(off);
      btn.textContent=off?'工具栏':'\u00bb';
      btn.setAttribute('title',off?'展开工具栏':'收起工具栏（靠右折叠）');
      btn.setAttribute('aria-expanded',off?'false':'true');
    }
    /* [v254] 默认折叠：无存档即折叠；有存档尊重用户上一次的显式选择 */
    var off=true;
    var saved=null;
    try{ saved=localStorage.getItem('ppRailOff'); }catch(err){}
    off=(saved===null)?true:(saved==='1');
    apply(off);
    /* [v270] 代理跟随顶栏分区切换：包装 ryShowSection（ai-plan 也包装过，链式无冲突） */
    if(typeof window.ryShowSection==='function'){
      var origShowRail=window.ryShowSection;
      window.ryShowSection=function(){ var r=origShowRail.apply(this,arguments); setTimeout(function(){ syncProxy(off); },0); return r; };
    }
    /* [v270] 代理跟随二级内部子视图切换（data-ry-view/class/style 变化） */
    try{
      var secEl=btn.closest('#pipePlanSection')||stage;
      new MutationObserver(function(){ syncProxy(off); }).observe(secEl,{attributes:true,attributeFilter:['class','style','data-ry-view']});
    }catch(err){}
    btn.addEventListener('click',function(){
      off=!stage.classList.contains('pp-rail-off');
      try{ localStorage.setItem('ppRailOff',off?'1':'0'); }catch(err){}
      apply(off);
      try{ window.dispatchEvent(new Event('resize')); }catch(err){}
    });
  })();

  /* ===== [v252 2026-10-06 用户要求]「水力计算结果」面板默认折叠：
         点标题行展开、再点收起；输入框/下拉/按钮上的点击不触发折叠
         （目标流速、改径重算交互不受影响）。
         CSS 侧：标题行箭头按五宿主重写 ::before content；字段行 display:none!important。
         [v306 2026-10-08 用户要求] 默认态按页面区分：地块分区页（二级 ppPlanBar2）
         保持载入即折叠（v252 原行为）；管路规划页（三级 tlPlanBar2）默认展开 ——
         init 增加 defaultOff 参数，tlPlanBar2 只加 pp-res-head（点击可折叠）不加
         pp-res-off（初始展开）。两宿主均为静态 HTML，init 载入一次可靠。 ===== */
  (function ppResCollapse(){
    function init(bar, defaultOff){
      if(!bar)return;
      bar.classList.add('pp-res-head');
      if(defaultOff)bar.classList.add('pp-res-off');
      bar.addEventListener('click',function(e){
        if(e.target&&e.target.closest&&e.target.closest('input,select,button'))return;
        bar.classList.toggle('pp-res-off');
      });
    }
    init(document.getElementById('ppPlanBar2'), true);
    init(document.getElementById('tlPlanBar2'), false);

  /* ===== [v255 2026-10-06 用户要求] 水源方向可调：三级管线简图右键水源点，
         水源换到总管另一端（左右端/上下端互换）。事件委托挂 document 的 contextmenu，
         命中 [data-tl-src] 热区后：① 取 tlDiagramData 设计几何 frontPipe 两端中
         「距当前水源更远」的一端；② 写回 RunyeBridge.state.source（=二级页 ppState.source，
         随二级快照持久化，二级/三级两页水源一致）；③ tlAutoGenerate({scroll:false,stay:true})
         重画 —— 管路几何不变，水力/材料不受影响，只水流方向动画与水源标注位置变。
         没生成管线图时右键给提示不动作。 ===== */
  (function tlSrcFlip(){
    document.addEventListener('contextmenu',function(e){
      var viaHot=e.target&&e.target.closest&&e.target.closest('[data-tl-src]');
      if(!viaHot){
        /* [v255b] 兜底：后画的引线/标注会盖住热区中心（elementFromPoint 落在 polyline 上），
           closest 命中不了 —— 改按几何命中：指针落在热区屏幕包围盒（r=18，+2px 容差）内也算 */
        var hot=document.querySelector('#tlDiagramContent svg [data-tl-src]');
        if(!hot)return;
        var hr=hot.getBoundingClientRect();
        if(e.clientX<hr.left-2||e.clientX>hr.right+2||e.clientY<hr.top-2||e.clientY>hr.bottom+2)return;
      }
      e.preventDefault();
      var dd=window.tlDiagramData;
      var fp=dd&&dd.frontPipe,sp=dd&&dd.sourcePos;
      if(!fp||fp.length<2||!sp){ if(typeof window.atShowToast==='function')window.atShowToast('请先在管路规划页生成管线图，再右键水源换向'); return; }
      var best=null,bd=-1;
      for(var i=0;i<fp.length;i++){
        var d2=(fp[i].x-sp.x)*(fp[i].x-sp.x)+(fp[i].y-sp.y)*(fp[i].y-sp.y);
        if(d2>bd){bd=d2;best=fp[i];}
      }
      if(!best||bd<1)return;   /* 水源总在端点上 ⇒ 最远端即另一端；退化情形不动 */
      var st=window.RunyeBridge&&window.RunyeBridge.state;
      if(!st)return;
      st.source={x:best.x,y:best.y};
      try{ tlAutoGenerate({scroll:false,stay:true}); }catch(err){}
      if(typeof window.atShowToast==='function')window.atShowToast('水源已换到总管另一端（可再右键切换）');
    });
  })();
  })();


  /* ===== [v193] 成组编辑切换：整组 / 逐块 + 选择子地块 + 总管 ===== */
  (function bindGroupEditUI(){
    var bWhole=document.getElementById('ppGeWhole');
    var bPer=document.getElementById('ppGePerPlot');
    var sel=document.getElementById('ppGePlotSel');
    if(bWhole)bWhole.addEventListener('click',function(){ ppSetGroupMode('whole'); });
    if(bPer)bPer.addEventListener('click',function(){ ppSetGroupMode('perPlot'); });
    if(sel)sel.addEventListener('change',function(){ ppSelectGroupPlot(parseInt(this.value,10)||0); });
    /* [v242] 「◀ 返回成组管路」：与「在地块轮廓外面双击」同一个出口函数（不在本页另写一份）。 */
    var backBtn=document.getElementById('ppBackToGroupBtn');
    if(backBtn)backBtn.addEventListener('click',function(){
      if(typeof window.grBackFromPlotEdit==='function')window.grBackFromPlotEdit();
    });
    /* [v228] 块按钮列表：事件委托（按钮由 ppSyncGroupEditUI 动态生成，不在生成处逐个绑） */
    var chips=document.getElementById('ppGePlotChips');
    if(chips)chips.addEventListener('click',function(e){
      var b=e.target;
      while(b&&b!==chips&&!(b.classList&&b.classList.contains('pp-ge-chip')))b=b.parentNode;
      if(!b||b===chips)return;
      ppSelectGroupPlot(parseInt(b.getAttribute('data-idx'),10)||0);
    });
  })();

  // 任务K（2026-09-26）：分区面积锁定按钮的 UI 同步与自动解锁
  function ppUpdateLockAreaBtn(){
    var btn=document.getElementById('ppLockArea');
    if(!btn)return;
    if(ppState.areaLocked){ btn.textContent='🔒 已锁定面积'; btn.classList.add('active'); }
    else { btn.textContent='🔓 锁定面积'; btn.classList.remove('active'); }
  }
  function ppUnlockArea(){
    if(ppState.areaLocked){ ppState.areaLocked=false; ppUpdateLockAreaBtn(); }
  }
  var ppResetCutsBtn=document.getElementById('ppResetCuts');
  if(ppResetCutsBtn){
    ppResetCutsBtn.addEventListener('click',function(){
      ppUnlockArea(); // 重置网格会改变各区面积，锁定态自动解除（任务K 2026-09-26）
      ppState.cutOverrides={x:{},y:{}};ppResetCutSnap('');
      ppState.dragCut=null;ppState.hoverCut=null;ppState.lastSelectedCut=null;
      ppRender();
      if(typeof window.ppRefreshDiagramIfVisible==='function')window.ppRefreshDiagramIfVisible();
    });
  }
  /* ===== [v185 建 / v189 改语义] 地块划分开关（用户要求）=====
   * 用户诉求：大地块传到二级管路页面后默认**自动划分**分区（按左侧面板参数）；
   *   不需要自动划分时，关掉本开关 = **该地块不再自动划分分区**（整块当一个区）。
   *
   * ⚠ v189 语义纠正（2026-10-03，用户原话）：
   *   「这个是显示分区线的的，而不是点击之后开启分区线调节的，你理解错了，
   *     我的意思是 如果这个开关关闭之后，地块就不自动划分分区了，你修改过来。」
   *   ⇒ 上一版把本开关实现成「只隐藏分区线、数据照常按 N 区算」是**错的**；
   *     正确口径是**真的不划分**：关闭后分区数=1，面积/水力/材料全按整块算。
   *   ⇒ 实现落在最上游 ppGetZoneLayout（开关关闭 → 返回 1×1 单区布局），
   *     全链路天然一致，不留「画面一个区、数据四个区」的半吊子状态。
   *   ⇒ 不再「关闭时自动切到调网格模式」—— 那是上一版错误语义下的附带行为；
   *     现在的口径下关闭=不划分，没有「需要用户去手动调线」这回事
   *     （想手动划分：保持开关打开，然后用「调网格」微调）。
   *   · 状态持久化到 localStorage['runye_zone_auto']，刷新/切页后保持。
   */
  function ppZoneAutoOn(){ return ppState.zoneAuto !== false; }
  /* [v202] 开关控件由 checkbox 改为切换按钮（用户原话：「点击执行，不要勾选，
     勾选的话 整体看起来不统一」）。active 高亮 = 正在自动划分，与「↻ 分区旋转90°」
     的 active 口径一致；关闭时给琥珀描边提示「现在是整块一区」。
     旧 id（ppZoneAutoChk/ppZoneAutoWrap/ppZoneAutoTxt）已随 checkbox 一起移除。 */
  function ppApplyZoneAutoUI(){
    var on = ppZoneAutoOn();
    if(document.body) document.body.classList.toggle('ry-zoneauto-off', !on);
    var btn=document.getElementById('ppZoneAutoBtn');
    if(btn){
      btn.classList.toggle('active', on);
      btn.textContent = on ? '地块划分' : '地块不划分';
      btn.title = on
        ? '正在自动划分：按左侧面板参数切分区。点击后本块不自动划分，整块作为一个区参与面积/水力/材料计算。'
        : '当前：本块不自动划分分区（整块当一个区）。点击恢复按左侧面板参数自动划分。';
    }
  }
  /* [v188 2026-10-03] 把「模式切换要同步微调箭头组显隐」这件事归一到一个函数。
     起因（Edge 真渲染实测）：从「调网格」进入 adjustCut 时，按钮 active 变了、
     mode 也变了，但 #ppCutFineGroup 仍是 display:none 的话就会「按钮亮了却没有微调箭头」。
     与既有 ppSetMode 里的写法保持同一口径：adjustCut → inline-flex，否则 none。 */
  function ppSyncFineGroup(){
    var fg=document.getElementById('ppCutFineGroup');
    if(fg) fg.style.display = (ppState.mode==='adjustCut') ? 'inline-flex' : 'none';
  }
  function ppSetZoneAuto(on){
    on = !!on;
    ppState.zoneAuto = on;
    try{ localStorage.setItem('runye_zone_auto', on ? '1' : '0'); }catch(e){}
    ppApplyZoneAutoUI();
    /* 开关改变的是「分区怎么算」⇒ 必须重算 + 重绘下游，而不只是切个 CSS 类。
       ppRender 负责二级画布；ppRefreshDiagramIfVisible 负责施工简图/材料联动。 */
    try{
      if(ppState.mode==='adjustCut' && !on){
        /* 关闭划分后「调网格」失去意义（没有内部线可拖）⇒ 退出该模式，避免残留按钮高亮。 */
        ppState.mode='main';
        document.querySelectorAll('#ppToolbar .pp-btn[data-mode]').forEach(function(b){
          b.classList.toggle('active', b.getAttribute('data-mode')==='main');
        });
        ppSyncFineGroup();
      }
      ppRender();
      if(typeof window.ppRefreshDiagramIfVisible==='function') window.ppRefreshDiagramIfVisible();
      /* 三级页若在跑，也要跟着变（它读同一份分区网格）。 */
      if(typeof window.tlRefreshFromPlan==='function'){ try{ window.tlRefreshFromPlan(); }catch(e){} }
    }catch(e){}
  }
  // 初始态：读存档；首次（无存档）默认开 = 自动划分，与现状一致（向后兼容，老流程零变化）
  (function ppInitZoneAuto(){
    try{
      var s=localStorage.getItem('runye_zone_auto');
      ppState.zoneAuto = (s===null) ? true : (s!=='0');
    }catch(e){ ppState.zoneAuto = true; }
    ppApplyZoneAutoUI();
    var btn=document.getElementById('ppZoneAutoBtn');
    if(btn){
      btn.classList.toggle('active', ppZoneAutoOn());
      btn.addEventListener('click',function(){ ppSetZoneAuto(!ppZoneAutoOn()); });
    }
    window.ppSetZoneAuto=ppSetZoneAuto;
    window.ppZoneAutoOn=ppZoneAutoOn;
  })();

  var ppLockAreaBtn=document.getElementById('ppLockArea');
  if(ppLockAreaBtn){
    ppLockAreaBtn.addEventListener('click',function(){
      ppState.areaLocked=!ppState.areaLocked;
      ppUpdateLockAreaBtn();
    });
    ppUpdateLockAreaBtn(); // 同步初始文案（默认未锁定）
  }
  // 2026-09-28 晚（用户拍板）：取消豁免开关按钮，横竖一个原则——
  // 「锁定面积」开启时，最外侧内部线（index=1 或 len-2）永远可直接拖到边线合并减区；中间线仍整轴平移。
  // 未锁定时维持原吸附合并逻辑不变（ppBmFreeOk 仅在锁定态参与判定）。
  function ppBmFreeOk(axis,index){
    if(!ppState.areaLocked)return false;
    var cuts=ppCurrentCuts(); if(!cuts)return false;
    var arr=cuts[axis==='x'?'xPos':'yPos'];
    return index===1||index===arr.length-2;
  }


  // ===== 网格线微调 =====
  // Fine-tune cut line position (0.3m per click)
  function ppFineStepWorld(axis){
    var t=ppState.transform;
    if(!t||!t.scaleX||!t.scaleY)return 0.5;
    var ps=axis==='x'?t.scaleX:t.scaleY;
    if(!ps||ps===0)return 0.5;
    return 0.3/ps;
  }
  function ppNudgeCut(dir){
    if(ppState.mode!=='adjustCut')return;
    var sel=ppState.lastSelectedCut;
    if(!sel){ sel=ppState.hoverCut; }
    if(!sel){return;}
    // 面积锁定：微调改为整轴刚性平移，各区面积不变（任务K 2026-09-26）
    if(ppState.areaLocked){
      ppPushHistory();
      var b2=ppGetBounds(); if(!b2)return;
      var planN2=parseInt(document.getElementById('planN')?.value)||parseInt(document.getElementById('fld_N')?.value)||4;
      var layout2=ppGetZoneLayout(b2,planN2);
      var cuts2=ppGetZoneCuts(b2,layout2); if(!cuts2)return;
      var ax=sel.axis;
      var s=ppFineStepWorld(ax);
      var d=0;
      if(ax==='x'){ if(dir==='left')d=-s; else if(dir==='right')d=s; else return; }
      else { if(dir==='up')d=-s; else if(dir==='down')d=s; else return; }
      if(d===0)return;
      var arr2=cuts2[ax==='x'?'xPos':'yPos'];
      var mg=Math.max(2,4*ppWorldPerPixel(ax));
      var dMin=arr2[0]+mg-arr2[1], dMax=arr2[arr2.length-1]-mg-arr2[arr2.length-2];
      var delta=d;
      if(dMin>dMax)delta=0; else { if(delta<dMin)delta=dMin; if(delta>dMax)delta=dMax; }
      var o2=arr2.slice();
      for(var i2=1;i2<arr2.length-1;i2++){ ppSetCutPos(ax,i2,o2[i2]+delta); }
      ppState.mergePreview=null;
      ppRender();
      /* v166：整轴刚性平移后同步三级简图 */
      if(typeof window.ppRefreshTLAfterCuts==='function')window.ppRefreshTLAfterCuts();
      else if(typeof window.ppRefreshDiagramIfVisible==='function')window.ppRefreshDiagramIfVisible();
      return;
    }
    ppPushHistory();
    var b=ppGetBounds();
    if(!b)return;
    var planN=parseInt(document.getElementById('planN')?.value)||parseInt(document.getElementById('fld_N')?.value)||4;
    var layout=ppGetZoneLayout(b,planN);
    var cuts=ppGetZoneCuts(b,layout);
    if(!cuts)return;
    var axis=sel.axis;
    var idx=sel.index;
    var arr=cuts[axis==='x'?'xPos':'yPos'];
    if(idx<=0||idx>=arr.length-1)return; // 该线已被合并删除
    // Get current position (with manual adjustments applied)
    var curPos=arr[idx];
    var step=ppFineStepWorld(axis);
    var delta=0;
    if(axis==='x'){
      // vertical line: left = decrease x, right = increase x
      if(dir==='left')delta=-step;
      else if(dir==='right')delta=step;
      else return; // up/down not applicable
    }else{
      // horizontal line: up = decrease y, down = increase y
      if(dir==='up')delta=-step;
      else if(dir==='down')delta=step;
      else return; // left/right not applicable
    }
    var newPos=curPos+delta;
    // Constrain between neighbors
    var minBound=arr[idx-1]+2;
    var maxBound=arr[idx+1]-2;
    if(newPos<minBound)newPos=minBound;
    if(newPos>maxBound)newPos=maxBound;
    ppSetCutPos(axis,idx,newPos);
    ppState.lastSelectedCut={axis:axis,index:idx};
    ppRender();
    /* v166：微调后同步三级简图（键盘方向键与微调按钮都走这里） */
    if(typeof window.ppRefreshTLAfterCuts==='function')window.ppRefreshTLAfterCuts();
    else if(typeof window.ppRefreshDiagramIfVisible==='function')window.ppRefreshDiagramIfVisible();
  }
  ['ppFineUp','ppFineDown','ppFineLeft','ppFineRight'].forEach(function(id){
    var btn=document.getElementById(id);
    if(btn){
      var dir=id.replace('ppFine','').toLowerCase();
      btn.addEventListener('click',function(){ppNudgeCut(dir);});
    }
  });

  // Generate diagram
  function ppArrow(p1,p2,color){
    var a=Math.atan2(p2.y-p1.y,p2.x-p1.x);var len=10;
    var x1=p2.x-len*Math.cos(a-Math.PI/6),y1=p2.y-len*Math.sin(a-Math.PI/6);
    var x2=p2.x-len*Math.cos(a+Math.PI/6),y2=p2.y-len*Math.sin(a+Math.PI/6);
    return'<polygon points="'+p2.x.toFixed(1)+','+p2.y.toFixed(1)+' '+x1.toFixed(1)+','+y1.toFixed(1)+' '+x2.toFixed(1)+','+y2.toFixed(1)+'" fill="'+color+'"/>';
  }

  /* [v193] 施工图 = **一张总图**（用户拍板 ⑤）：逐块态出图时，临时把 ppState 换成
     整组视图（外框 + 各块管线合并 + 总管），出完立刻还原 —— ppState 仍停在当前块，
     编辑态不受影响。整组态本来就已是整组视图，直接走 core。 */
  function ppGenerateDiagram(options){
    var ge=window.__runyeGroupEdit;
    if(!(ge&&ge.active&&ge.mode==='perPlot'))return ppGenerateDiagramCore(options);
    ge.slots[ge.current]=ppCaptureSlot();          // 先存档当前块，合并视图才拿得到最新
    var back=ppCaptureSlot();                      // 出图后原样还原
    var mode0=ge.mode;                             // ★ 连 mode 一起临时切成 whole：
    try{                                           //   否则 ppGroupActiveSubs() 仍只返回当前块，
      ge.mode='whole';                             //   画的就不是「一张总图」而是「当前块的图」。
      ppState.polyPts=ge.framePts.map(function(p){return{x:p.x,y:p.y};});
      var m=ppCollectGroupAllPipes();
      ppState.mainPipes=m.main; ppState.branchPipes=m.branch; ppState.subBranchPipes=m.subbranch;
      ppState.source=null; ppState.valves=[];
      ppState.hiddenPipes={main:{},branch:{},subbranch:{}};
      ppEnsurePipeIds('main');ppEnsurePipeIds('branch');ppEnsurePipeIds('subbranch');
      return ppGenerateDiagramCore(options);
    } finally {
      ge.mode=mode0;                               // 先还原 mode，再还原 slot
      ppApplySlot(back);
    }
  }
  function ppGenerateDiagramCore(options){
    options=options||{};
    var doScroll=options.scroll!==false;
    if(!ppState.polyPts.length){alert('请先在面积测量工具中描绘边界');return;}
    var r=window._r||{};
    var pd=window.planData||{};
    // 直接引用计算器结果
    var mainPipeOD=pd.mainPipeOD||(r.mainPipe?('Ø '+r.mainPipe.od+' mm'):'—');
    var mainPipeLen=r.mainPipeLen?r.mainPipeLen.toFixed(1)+' m':'—';
    var branchPipeOD=pd.branchPipeOD||(r.branchPipe?('Ø '+r.branchPipe.od+' mm'):'—');
    var pFlow=r.zoneFlow?r.zoneFlow.toFixed(1)+' m³/h':'—';
    var pHead=r.pumpHead?r.pumpHead.toFixed(1)+' m':'—';
    var motorKW=r.motorKW_rounded?r.motorKW_rounded+' kW':'—';
    var areaMu=window.measuredArea?(window.measuredArea/666.67).toFixed(2):(r.totalMu?r.totalMu.toFixed(2):'—');
    var stDims=window.runyePlanDims||{};
    var planA=document.getElementById('planA')?document.getElementById('planA').textContent:(isFinite(stDims.A)?String(stDims.A):'—');
    var planB=document.getElementById('planB')?document.getElementById('planB').textContent:(isFinite(stDims.B)?String(stDims.B):'—');
    var planPumpFlow=document.getElementById('planPumpFlow')?document.getElementById('planPumpFlow').textContent:'—';
    var planPumpHead=document.getElementById('planPumpHead')?document.getElementById('planPumpHead').textContent:'—';
    var planPumpPower=document.getElementById('planPumpPower')?document.getElementById('planPumpPower').textContent:'—';
    var planIntensity=document.getElementById('planIntensity')?document.getElementById('planIntensity').textContent:'—';
    var planTapeSpacing=document.getElementById('planTapeSpacing')?document.getElementById('planTapeSpacing').value:'—';
    var planEmitterSpacing=document.getElementById('planEmitterSpacing')?document.getElementById('planEmitterSpacing').value:'—';
    var layoutSides=parseInt(document.querySelector('#layoutGroup .selected')?.dataset?.sides||1);

    var b=ppGetBounds();
    var displayB=ppGetDisplayBounds();
    var plotDims=ppGetPlanDims(b);
    var plotW=plotDims.w,plotH=plotDims.h;
    var plotScaleX=b.w>0?plotW/b.w:1;
    var plotScaleY=b.h>0?plotH/b.h:1;
    var plotDisplayW=displayB.w*plotScaleX;
    var plotDisplayH=displayB.h*plotScaleY;
    // A3/A4 横向工程图纸比例：宽:高 ≈ 1.414:1（420×297 mm）
    var svgW=1190,svgH=841,pad=60,bottomH=130;
    var drawW=svgW-2*pad,drawH=svgH-pad-bottomH;
    var drawY2=svgH-bottomH;
    var s=Math.min(drawW/plotDisplayW,drawH/plotDisplayH);
    s=Math.min(s,2);
    var ox=pad+(drawW-plotDisplayW*s)/2,oy=pad+(drawH-plotDisplayH*s)/2;
    function ts(mx,my){return{x:(mx-displayB.minX)*plotScaleX*s+ox,y:(my-displayB.minY)*plotScaleY*s+oy};}

    /* [v190] 成组地块：施工图里**每个成员环各写一条子路径**（M…L…Z 循环），
       块间空隙不写进 d ⇒ 底色填充 / 分区裁剪 / 描边都自然留出空隙，
       与画布 ppTracePlotPath 同口径（都用 ppGetRotatedSubRings）。 */
    var d='';
    var _svgRings=ppGetRotatedSubRings()||[ppGetRotatedPlotPoints()];
    _svgRings.forEach(function(rg){
      if(!rg||rg.length<3)return;
      for(var i=0;i<rg.length;i++){
        var p=ts(rg[i].x,rg[i].y);
        d+=(i===0?'M':'L')+p.x.toFixed(1)+' '+p.y.toFixed(1)+' ';
      }
      d+='Z ';
    });
    d=d.trim();

    var planN=parseInt(document.getElementById('planN')?.value)||4;
    var zoneLayout=ppGetZoneLayout(b,planN);
    var zoneCuts=ppGetZoneCuts(b,zoneLayout);
    planN=zoneCuts.cols*zoneCuts.rows;
    var _nomMuMin=Infinity,_nomMuMax=0;
    for(var _zr0=0;_zr0<zoneCuts.rows;_zr0++){for(var _zc0=0;_zc0<zoneCuts.cols;_zc0++){
      var _nomMu=zoneCuts.xPlan[_zc0]*zoneCuts.yPlan[_zr0]/666.67;
      if(_nomMu<_nomMuMin)_nomMuMin=_nomMu;
      if(_nomMu>_nomMuMax)_nomMuMax=_nomMu;
    }}
    var zoneAreaMu=(!isFinite(_nomMuMin)||_nomMuMax<=0)?'0.00':((Math.round(_nomMuMin*100)!==Math.round(_nomMuMax*100))?(_nomMuMin.toFixed(2)+'~'+_nomMuMax.toFixed(2)):_nomMuMax.toFixed(2));
    // 预统计：实际面积小于标准分区的"非标准分区"数量
    var plotPoly=ppState.polyPts&&ppState.polyPts.length>=3?ppState.polyPts.map(function(p){return{x:p.x,y:p.y};}):null;
    var partialCount=0;
    for(var _zr=0;_zr<zoneCuts.rows;_zr++){for(var _zc=0;_zc<zoneCuts.cols;_zc++){
      var _m2=ppZoneActualAreaM2(_zc,_zr,zoneCuts,plotPoly);
      var _mu=_m2/666.67;
      var _stdMu=zoneCuts.xPlan[_zc]*zoneCuts.yPlan[_zr]/666.67;
      if(_stdMu>0&&_mu<_stdMu*0.97&&_mu>0.05)partialCount++;
    }}

    var parts=[];
    parts.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+svgW+' '+svgH+'" style="background:#fff">');
    parts.push('<rect x="8" y="8" width="'+(svgW-16)+'" height="'+(svgH-16)+'" fill="none" stroke="#999" stroke-width="1.5" rx="2"/>');
    parts.push('<text x="'+svgW/2+'" y="42" text-anchor="middle" font-size="20" font-weight="700" fill="#1a4731">润野灌溉 · 施工简图</text>');
    var headerExtra=partialCount>0?(' | 非标准 '+partialCount+' 区'):'';
    parts.push('<text x="34" y="42" text-anchor="start" font-size="12" font-weight="700" fill="#334155">面积 '+areaMu+' 亩 | 地块 '+planA+'×'+planB+' m | '+planN+'分区 | 标准区 '+zoneAreaMu+' 亩'+headerExtra+'</text>');
    parts.push('<g id="ppPlotGroup">');
    parts.push('<defs><clipPath id="ppPlotClip"><path d="'+d+'"/></clipPath></defs>');
    parts.push('<path d="'+d+'" fill="rgba(134,239,172,.1)" stroke="none"/>');

    // Plot outline
    parts.push('<path d="'+d+'" fill="none" stroke="#1a4731" stroke-width="2"/>');

    // Auto-generated partition zone blocks. Each zone side is limited to 200m.
    var planN=parseInt(document.getElementById('planN')?.value)||4;
    var zoneLayout=ppGetZoneLayout(b,planN);
    var zoneCuts=ppGetZoneCuts(b,zoneLayout);
    planN=zoneCuts.cols*zoneCuts.rows;
    /* 2026-09-27：与二级画布 / 三级工作区统一 —— 4 色循环（红/琥珀/绿/蓝，α=.30） */
    var zoneCols=['rgba(191,88,88,.30)','rgba(214,162,73,.30)','rgba(75,173,111,.30)','rgba(84,127,196,.30)'];
    var zoneStrokes=['rgba(51,65,85,.28)','rgba(51,65,85,.28)','rgba(51,65,85,.28)','rgba(51,65,85,.28)'];
    var labelParts=[];
    parts.push('<g clip-path="url(#ppPlotClip)" class="pp-zone-layer">');
    for(var zr=0;zr<zoneCuts.rows;zr++){
      for(var zc=0;zc<zoneCuts.cols;zc++){
        var zi=zr*zoneCuts.cols+zc;
        var zx=zoneCuts.xPos[zc], zy=zoneCuts.yPos[zr];
        var zoneW=zoneCuts.xSrc[zc], zoneH=zoneCuts.ySrc[zr];
        var r1=ts(zx,zy), r2=ts(zx+zoneW,zy+zoneH);
        var rx=r1.x, ry=r1.y, rw=r2.x-r1.x, rh=r2.y-r1.y;
        var ci=zi%zoneCols.length;
        // 实际落在线段多边形内的面积（m²）与标准区比较，判定是否"非完整分区"
        var actualM2=ppZoneActualAreaM2(zc,zr,zoneCuts,plotPoly);
        var actualMu=actualM2/666.67;
        var _stdMu=zoneCuts.xPlan[zc]*zoneCuts.yPlan[zr]/666.67;
        var isPartial=_stdMu>0 && actualMu<_stdMu*0.97;
        var cellFill=zoneCols[ci];   /* 2026-09-27：非标区保留本色（三级同规则），仅描边用琥珀区分 */
        var cellStroke=isPartial?'rgba(217,119,6,.85)':zoneStrokes[ci];
        parts.push('<rect x="'+rx.toFixed(1)+'" y="'+ry.toFixed(1)+'" width="'+rw.toFixed(1)+'" height="'+rh.toFixed(1)+'" fill="'+cellFill+'" stroke="'+cellStroke+'" stroke-width="1" stroke-dasharray="6,3"/>');
      }
    }
    parts.push('</g>');
    // 文字标注层：移到裁剪之外单独绘制，避免被地块边界切掉；非标分区居中标注实际亩数
    for(var zr=0;zr<zoneCuts.rows;zr++){
      for(var zc=0;zc<zoneCuts.cols;zc++){
        var zi=zr*zoneCuts.cols+zc;
        var zx=zoneCuts.xPos[zc], zy=zoneCuts.yPos[zr];
        var zoneW=zoneCuts.xSrc[zc], zoneH=zoneCuts.ySrc[zr];
        var r1=ts(zx,zy), r2=ts(zx+zoneW,zy+zoneH);
        var rx=r1.x, ry=r1.y, rw=r2.x-r1.x, rh=r2.y-r1.y;
        var aw=Math.abs(rw),ah=Math.abs(rh);
        var actualM2=ppZoneActualAreaM2(zc,zr,zoneCuts,plotPoly);
        var actualMu=actualM2/666.67;
        var _stdMu=zoneCuts.xPlan[zc]*zoneCuts.yPlan[zr]/666.67;
        var isPartial=_stdMu>0 && actualMu<_stdMu*0.97;
        if(aw>36&&ah>26 && actualMu>0.05){
          if(isPartial){
            // 非标准分区：与标准分区一致，文字置于分区右上角（已在裁剪层之外绘制，可超出地块显示）
            var pLabelX=rx+rw-8, pLabelY=ry+14;
            if(aw>78&&ah>44){
              labelParts.push('<text x="'+pLabelX.toFixed(1)+'" y="'+pLabelY.toFixed(1)+'" text-anchor="end" font-size="14" font-weight="700" fill="#b45309">'+(zi+1)+'区</text>');
              labelParts.push('<text x="'+pLabelX.toFixed(1)+'" y="'+(pLabelY+16).toFixed(1)+'" text-anchor="end" font-size="10.5" font-weight="700" fill="#b45309">实际 '+actualMu.toFixed(1)+' 亩</text>');
            }else{
              labelParts.push('<text x="'+pLabelX.toFixed(1)+'" y="'+pLabelY.toFixed(1)+'" text-anchor="end" font-size="8" font-weight="700" fill="#b45309">'+(zi+1)+'区 实际'+actualMu.toFixed(1)+'亩</text>');
            }
          }else{
            var zoneSizeText=ppZoneSizeLabel(Math.max(zoneCuts.xPlan[zc],zoneCuts.yPlan[zr]),Math.min(zoneCuts.xPlan[zc],zoneCuts.yPlan[zr]));
            var zoneAreaText=(zoneCuts.xPlan[zc]*zoneCuts.yPlan[zr]/666.67).toFixed(1)+'亩';
            var zoneLabelX=rx+rw-8, zoneLabelY=ry+14;
            if(aw>92&&ah>52){
              labelParts.push('<text x="'+zoneLabelX.toFixed(1)+'" y="'+zoneLabelY.toFixed(1)+'" text-anchor="end" font-size="15" font-weight="700" fill="#111827">'+(zi+1)+'区</text>');
              labelParts.push('<text x="'+zoneLabelX.toFixed(1)+'" y="'+(zoneLabelY+16).toFixed(1)+'" text-anchor="end" font-size="10.5" font-weight="600" fill="#111827">'+zoneSizeText+'</text>');
              labelParts.push('<text x="'+zoneLabelX.toFixed(1)+'" y="'+(zoneLabelY+31).toFixed(1)+'" text-anchor="end" font-size="10" fill="#111827">'+zoneAreaText+'</text>');
            }else if(ah>70){
              labelParts.push('<g transform="translate('+((rx+rw/2).toFixed(1))+' '+((ry+rh/2).toFixed(1))+') rotate(-90)">');
              labelParts.push('<text x="0" y="3" text-anchor="middle" font-size="8.5" font-weight="700" fill="#111827">'+(zi+1)+'区 '+zoneSizeText+' '+zoneAreaText+'</text>');
              labelParts.push('</g>');
            }else{
              labelParts.push('<text x="'+(rx+rw/2).toFixed(1)+'" y="'+(ry+rh/2).toFixed(1)+'" text-anchor="middle" font-size="7.5" font-weight="700" fill="#111827">'+(zi+1)+'区 '+zoneSizeText+' '+zoneAreaText+'</text>');
            }
          }
        }
      }
    }
    parts.push('<g class="pp-zone-label">'+labelParts.join('')+'</g>');

    parts.push('<g class="pp-zone-label" fill="none" stroke="#334155" stroke-width="1" stroke-dasharray="7,5" opacity="0.48">');
    for(var bz=0;bz<zoneCuts.xPos.length;bz++){
      var bv1=ts(zoneCuts.xPos[bz],b.minY),bv2=ts(zoneCuts.xPos[bz],b.minY+b.h);
      parts.push('<line x1="'+bv1.x.toFixed(1)+'" y1="'+bv1.y.toFixed(1)+'" x2="'+bv2.x.toFixed(1)+'" y2="'+bv2.y.toFixed(1)+'"/>');
    }
    for(var br=0;br<zoneCuts.yPos.length;br++){
      var bh1=ts(b.minX,zoneCuts.yPos[br]),bh2=ts(b.minX+b.w,zoneCuts.yPos[br]);
      parts.push('<line x1="'+bh1.x.toFixed(1)+'" y1="'+bh1.y.toFixed(1)+'" x2="'+bh2.x.toFixed(1)+'" y2="'+bh2.y.toFixed(1)+'"/>');
    }
    parts.push('</g>');

    // Plot size dimensions in an architectural drafting style.
    var plotLeft=ts(b.minX,b.minY).x;
    var plotRight=ts(b.minX+b.w,b.minY).x;
    var plotTop=ts(b.minX,b.minY).y;
    var plotBottom=ts(b.minX,b.minY+b.h).y;
    /* v124：二级页与三级页共用同一组标注几何细项（二级页不乘 tlDS，保持既有语义） */
    var DG=(window.RyDimGeo?window.RyDimGeo.get():{ext:4,gap:4,tick:4,tickW:2.8,font:12});
    /* v148：二级页同口径 —— GAP 不乘 tlDS（二级保持既有语义），ASC = 运行时 canvas 实测的墨水高度（见 __ryInkAscent） */
    var GAP=DG.gap;
    var INK=(window.__ryInkM?window.__ryInkM(DG.font):{a:DG.font*0.75,d:0});
    var ASC=INK.a, DESC=INK.d;
    var dimBottomY=Math.min(drawY2+38,plotBottom+38);
    var dimLeftX=Math.max(58,plotLeft-48);
    function ppDimLabel(value){
      if(!isFinite(value))return '— m';
      var rounded=Math.round(value);
      return Math.abs(value-rounded)<0.05?rounded+' m':value.toFixed(1)+' m';
    }
    /* v148：y 一律是【基线】（原 +DG.font/6 已去掉）；rotate 时第 6 参 off = 基线相对锚点 x 的垂直偏移 */
    function ppTextBox(x,y,text,anchor,rotate,off){
      if(rotate){
        var offv=(off==null?-GAP:off);
        parts.push('<g transform="translate('+x.toFixed(1)+' '+y.toFixed(1)+') rotate(-90)">');
        parts.push('<text x="0" y="'+offv.toFixed(2)+'" text-anchor="middle">'+text+'</text></g>');
        return;
      }
      parts.push('<text x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" text-anchor="'+anchor+'">'+text+'</text>');
    }
    function ppArchTick(x,y,dir){
      /* v113（2026-09-22 用户要求）：建筑斜短线加粗、缩短 —— k 5.5→4（长 11px→8px）、线宽 1.8→2.8（与三级 tlArchTick 同步） */
      var k=DG.tick;
      if(dir==='h')parts.push('<line x1="'+(x-k).toFixed(1)+'" y1="'+(y+k).toFixed(1)+'" x2="'+(x+k).toFixed(1)+'" y2="'+(y-k).toFixed(1)+'" stroke-width="'+DG.tickW+'"/>');
      else parts.push('<line x1="'+(x-k).toFixed(1)+'" y1="'+(y-k).toFixed(1)+'" x2="'+(x+k).toFixed(1)+'" y2="'+(y+k).toFixed(1)+'" stroke-width="'+DG.tickW+'"/>');
    }
    parts.push('<g stroke="#111111" stroke-width="0.95" fill="none" opacity="0.98" stroke-linecap="square">');
    parts.push('<line x1="'+plotLeft.toFixed(1)+'" y1="'+(plotBottom+4).toFixed(1)+'" x2="'+plotLeft.toFixed(1)+'" y2="'+(dimBottomY+DG.ext).toFixed(1)+'"/>');
    parts.push('<line x1="'+plotRight.toFixed(1)+'" y1="'+(plotBottom+4).toFixed(1)+'" x2="'+plotRight.toFixed(1)+'" y2="'+(dimBottomY+DG.ext).toFixed(1)+'"/>');
    parts.push('<line x1="'+plotLeft.toFixed(1)+'" y1="'+dimBottomY.toFixed(1)+'" x2="'+plotRight.toFixed(1)+'" y2="'+dimBottomY.toFixed(1)+'"/>');
    ppArchTick(plotLeft,dimBottomY,'h');
    ppArchTick(plotRight,dimBottomY,'h');
    parts.push('<line x1="'+(plotLeft-4).toFixed(1)+'" y1="'+plotTop.toFixed(1)+'" x2="'+(dimLeftX-4).toFixed(1)+'" y2="'+plotTop.toFixed(1)+'"/>');
    parts.push('<line x1="'+(plotLeft-4).toFixed(1)+'" y1="'+plotBottom.toFixed(1)+'" x2="'+(dimLeftX-4).toFixed(1)+'" y2="'+plotBottom.toFixed(1)+'"/>');
    parts.push('<line x1="'+dimLeftX.toFixed(1)+'" y1="'+plotTop.toFixed(1)+'" x2="'+dimLeftX.toFixed(1)+'" y2="'+plotBottom.toFixed(1)+'"/>');
    ppArchTick(dimLeftX,plotTop,'v');
    ppArchTick(dimLeftX,plotBottom,'v');
    parts.push('</g>');
    parts.push('<g font-size="'+DG.font+'" font-weight="700" fill="#111111">');
    /* 2026-09-27（用户指令 D）：与三级页同一条「地块长宽标注」，横向数字同样改到线上方（贴边时兜底放下方）。
       界线活动端 = dimBottomY+4（跨过尺寸线超出 4px），与三级页及分区标注一致。
       v148：两种位置可见净距都 = GAP（下方再加墨水 ASC）；竖向锚点落在线上、off = −GAP。 */
    var ppDimHAbove=(dimBottomY-plotBottom)>=18;
    ppTextBox((plotLeft+plotRight)/2,ppDimHAbove?(dimBottomY-GAP-DESC):(dimBottomY+GAP+ASC),ppDimLabel(plotW),'middle',false);
    ppTextBox(dimLeftX,(plotTop+plotBottom)/2,ppDimLabel(plotH),'middle',true,-GAP-DESC);
    parts.push('</g>');

    // Pipe length note uses the same top-left cut grid as the zones.
    var noteCol=0;
    var noteRow=0;
    var zoneDimX1=ts(zoneCuts.xPos[noteCol],zoneCuts.yPos[noteRow]).x;
    var zoneDimY1=ts(zoneCuts.xPos[noteCol],zoneCuts.yPos[noteRow]).y;
    var zoneDimY2=ts(zoneCuts.xPos[noteCol+1],zoneCuts.yPos[noteRow+1]).y;
    var showPipeNoteMain=ppHasVisiblePipe('main');
    var showPipeNoteBranch=ppHasVisiblePipe('branch');
    parts.push('<path d="'+d+'" fill="none" stroke="#1a4731" stroke-width="2.2"/>');

    /* [v193] 总管（成组地块跨块连接层）：
       · **不进裁剪组** —— 它本来就要穿过块间空隙，裁到地块里就断了；
       · 不累加 actualMainTotal / actualBranchTotal ⇒ 不影响各块的材料与水力（拍板 ③）。 */
    (function(){
      var ge=window.__runyeGroupEdit;
      if(!ge||!ge.active||!ge.trunkPipes||!ge.trunkPipes.length)return;
      parts.push('<g id="ppTrunkLayer">');
      ge.trunkPipes.forEach(function(l,i){
        if(ge.trunkHidden&&ge.trunkHidden['t'+i])return;
        if(!l||l.length<2)return;
        var td='';
        for(var k=0;k<l.length;k++){var p=ts(l[k].x,l[k].y);td+=(k===0?'M':'L')+p.x.toFixed(1)+' '+p.y.toFixed(1)+' ';}
        parts.push('<path d="'+td+'" fill="none" stroke="#7c3aed" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>');
      });
      parts.push('</g>');
    })();

    // Main pipes & branch pipes — clipped to plot boundary
    parts.push('<g clip-path="url(#ppPlotClip)">');
    // Main pipes
    var actualMainTotal=0;
    ppState.mainPipes.forEach(function(l,idx){
      if(ppIsPipeHidden('main',idx))return;
      var md='';
      for(var i=0;i<l.length;i++){var p=ts(l[i].x,l[i].y);md+=(i===0?'M':'L')+p.x.toFixed(1)+' '+p.y.toFixed(1)+' ';}
      parts.push('<path d="'+md+'" fill="none" stroke="#185FA5" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>');
      // Calculate actual drawn length in meters
      var actualLen=ppLineLen(l);
      actualMainTotal+=actualLen;
      if(l.length>=2){
        var p1=ts(l[l.length-2].x,l[l.length-2].y),p2=ts(l[l.length-1].x,l[l.length-1].y);
        parts.push(ppArrow(p1,p2,'#185FA5'));
      }
    });

    // Branch pipes
    var actualBranchTotal=0;
    ppState.branchPipes.forEach(function(l,idx){
      if(ppIsPipeHidden('branch',idx))return;
      var bd='';
      for(var i=0;i<l.length;i++){var p=ts(l[i].x,l[i].y);bd+=(i===0?'M':'L')+p.x.toFixed(1)+' '+p.y.toFixed(1)+' ';}
      parts.push('<path d="'+bd+'" fill="none" stroke="#16a34a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>');
      // Calculate actual drawn length in meters
      var actualLen=ppLineLen(l);
      actualBranchTotal+=actualLen;
    });
    parts.push('</g>');

    if(showPipeNoteMain||showPipeNoteBranch){
      var pipeNoteX=zoneDimX1+10;
      var pipeNoteY=Math.max(zoneDimY1+18,zoneDimY2-24);
      parts.push('<g text-anchor="start" font-size="9.5" font-weight="700">');
      if(showPipeNoteMain)parts.push('<text x="'+pipeNoteX.toFixed(1)+'" y="'+pipeNoteY.toFixed(1)+'" fill="#185FA5">主管 '+mainPipeOD+'</text>');
      if(showPipeNoteBranch)parts.push('<text x="'+pipeNoteX.toFixed(1)+'" y="'+(pipeNoteY+15).toFixed(1)+'" fill="#166534">支管 '+branchPipeOD+'</text>');
      parts.push('</g>');
    }

    // Source
    if(ppState.source){
      var sp=ts(ppState.source.x,ppState.source.y);
      parts.push('<circle cx="'+sp.x.toFixed(1)+'" cy="'+sp.y.toFixed(1)+'" r="10" fill="#f59e0b" stroke="#fff" stroke-width="2"/>');
      parts.push('<text x="'+sp.x.toFixed(1)+'" y="'+(sp.y-16).toFixed(1)+'" text-anchor="middle" font-size="11" font-weight="600" fill="#92400e">水源/水泵</text>');
      parts.push('<text x="'+sp.x.toFixed(1)+'" y="'+(sp.y+22).toFixed(1)+'" text-anchor="middle" font-size="9" fill="#92400e">'+pFlow+' · '+pHead+'</text>');
    }

    // 阀门与主管的斜向连接管：每个阀门沿 45° 斜拉接到最近的主管线段（与三级页一致的斜向风格），画在红圈之下
    (function(){
      function ppClamp(v,a,b){return v<a?a:(v>b?b:v);}
      var segs=[];
      ppState.mainPipes.forEach(function(l,li){
        if(ppIsPipeHidden('main',li))return;
        for(var i=0;i+1<l.length;i++)segs.push([l[i],l[i+1]]);
      });
      if(segs.length){
        var connSvg=[];
        ppState.valves.filter(function(v){return ppPointInPlot(v);}).forEach(function(v){
          var best=null,bestD=Infinity;
          segs.forEach(function(sg){
            var dx=sg[1].x-sg[0].x,dy=sg[1].y-sg[0].y;
            var horiz=Math.abs(dy)<=Math.abs(dx)*0.25, vert=Math.abs(dx)<=Math.abs(dy)*0.25;
            var pj;
            if(vert){ // 主管竖向：连接点 x=主管x，y 沿 45° 偏（阀门在右→左上，在左→右下）
              var px=sg[0].x, off=Math.abs(v.x-px);
              var py=(v.x>=px)?(v.y-off):(v.y+off);
              py=ppClamp(py,Math.min(sg[0].y,sg[1].y),Math.max(sg[0].y,sg[1].y));
              pj={x:px,y:py};
            }else if(horiz){ // 主管横向：连接点 y=主管y，x 沿 45° 偏（阀门在下→右，在上→左）
              var py2=sg[0].y, off2=Math.abs(v.y-py2);
              var px2=(v.y>=py2)?(v.x+off2):(v.x-off2);
              px2=ppClamp(px2,Math.min(sg[0].x,sg[1].x),Math.max(sg[0].x,sg[1].x));
              pj={x:px2,y:py2};
            }else{ // 斜主管：退化用最近点投影
              var c=dx*dx+dy*dy; if(c===0){pj={x:sg[0].x,y:sg[0].y};}
              else{var t=((v.x-sg[0].x)*dx+(v.y-sg[0].y)*dy)/c; if(t<0)t=0; else if(t>1)t=1; pj={x:sg[0].x+dx*t,y:sg[0].y+dy*t};}
            }
            if(!pj)return;
            var ex=v.x-pj.x,ey=v.y-pj.y,dd=ex*ex+ey*ey;
            if(dd<bestD){bestD=dd;best=pj;}
          });
          if(best && Math.sqrt(bestD)>3){
            var a=ts(v.x,v.y),bp=ts(best.x,best.y);
            connSvg.push('<line x1="'+a.x.toFixed(1)+'" y1="'+a.y.toFixed(1)+'" x2="'+bp.x.toFixed(1)+'" y2="'+bp.y.toFixed(1)+'"/>');
          }
        });
        if(connSvg.length){
          parts.push('<g clip-path="url(#ppPlotClip)" stroke="#185FA5" stroke-width="3.5" stroke-linecap="round" fill="none">');
          parts.push(connSvg.join(''));
          parts.push('</g>');
        }
      }
    })();

    // Valves (只画阀门符号，不标注名称)
    ppState.valves.filter(function(v){return ppPointInPlot(v);}).forEach(function(v,idx){
      var vp=ts(v.x,v.y);
      parts.push(window.ryValveSVG(vp.x, vp.y));   /* v159：与总管×主管交接阀同规格（尺寸取自 window.RY_VALVE） */
    });
    parts.push('</g>');

    // Calculation book (draggable + resizable like three-level header, no fill, transparent background)
    var cbX0=34, cbY0=drawY2+18;
    var cbDefW=svgW-68;
    var pdCalc=window.planData||{};
    /* v178：此处原有 11 个 cbXxx 取值（lift/dh/tapePressureM/existPressureM/mainLoss/branchLoss/filterLoss/pumpPower/motorKW/safetyFactor/marginHead），
       cbSegs 精简后即零引用 —— 已删（取值本身无副作用，删后输出逐字节不变）。 */
    var cbPumpHead=Number(pdCalc.pumpHead)||0;
    var cbZoneFlow=Number(pdCalc.zoneFlow)||0;
    var cbTapeLen=Number(pdCalc.tapeLen)||100;
    var cbEmitterFlow=Number(pdCalc.emitterFlow)||0.8;
    var cbTapeSpacing=Number(pdCalc.tapeSpacing)||0.8;
    var cbEmitterSpacing=Number(pdCalc.emitterSpacing)||0.3;
    var cbMainOD=pdCalc.mainPipeOD||'Ø — mm';
    var cbBranchOD=pdCalc.branchPipeOD||'Ø — mm';
    var cbActualMainStr=actualMainTotal>0?actualMainTotal.toFixed(1)+'m':'未绘制';
    var cbActualBranchStr=actualBranchTotal>0?actualBranchTotal.toFixed(1)+'m':'未绘制';
    var cbHasCalc=cbZoneFlow>0&&cbPumpHead>0;

    var cbSegs=[];
    cbSegs.push('滴灌带 '+cbTapeLen+'m | 滴孔流量 '+cbEmitterFlow+' L/h | 孔距 '+cbEmitterSpacing+'m | 带距 '+cbTapeSpacing+'m');
    cbSegs.push('主管 '+cbMainOD+' | 支管 '+cbBranchOD+' | 实测主管 '+cbActualMainStr+' | 实测支管 '+cbActualBranchStr);
    if(!cbHasCalc){
      cbSegs.push('未获取到水泵计算中间量，请先在参数面板完成计算后再生成施工图。');
    }

    window._ppCalcBookSegs=cbSegs;
    window._ppCalcBookX0=cbX0;
    window._ppCalcBookY0=cbY0;
    window._ppCalcBookDefW=cbDefW;

    var cbLines=ppRewrapCalcBook(cbDefW);
    var cbH=cbLines.length*18+12;
    parts.push('<g id="ppCalcBookGroup">');
    parts.push('<rect id="ppCalcBookBg" x="'+(cbX0-8)+'" y="'+(cbY0-14)+'" width="'+(cbDefW+16)+'" height="'+cbH+'" fill="rgba(255,255,255,0)" stroke="none" rx="2"/>');
    for(var ci=0;ci<cbLines.length;ci++){
      parts.push('<text x="'+cbX0+'" y="'+(cbY0+ci*18)+'" text-anchor="start" font-size="11" font-weight="600" fill="#334155" class="pp-cb-text">'+cbLines[ci]+'</text>');
    }
    var cbHandleX=cbX0-8+cbDefW+16-8;
    var cbHandleY=cbY0-14+cbH-8;
    parts.push('<rect id="ppCalcBookHandle" x="'+cbHandleX+'" y="'+cbHandleY+'" width="8" height="8" fill="rgba(99,102,241,.35)" rx="2" style="cursor:nwse-resize"/>');
    parts.push('</g>');

    // 比例尺（带刻度的视觉标尺，固定在底部右下角，不随计算书框拖动）
    var rawM=100/s;
    var niceM=ppNiceStep(rawM,1);
    niceM=Math.max(10,Math.round(niceM/10)*10);
    var barPx=niceM*s;
    var barX2=svgW-34, barX1=barX2-barPx;
    var barY=drawY2+bottomH-44;
    parts.push('<text x="'+barX1.toFixed(1)+'" y="'+(barY-8).toFixed(1)+'" text-anchor="start" font-size="10" font-weight="700" fill="#1a4731">比例尺</text>');
    parts.push('<g stroke="#334155" fill="none" stroke-linecap="round">');
    parts.push('<line x1="'+barX1.toFixed(1)+'" y1="'+barY+'" x2="'+barX2.toFixed(1)+'" y2="'+barY+'" stroke-width="1.6"/>');
    for(var tk=0;tk<=4;tk++){var tx=barX1+barPx*tk/4;var th=(tk===0||tk===4)?12:(tk===2?9:6);parts.push('<line x1="'+tx.toFixed(1)+'" y1="'+barY+'" x2="'+tx.toFixed(1)+'" y2="'+(barY+th).toFixed(1)+'" stroke-width="'+(tk===0||tk===4?1.6:1)+'"/>');}
    parts.push('</g>');
    parts.push('<g font-size="9" font-weight="600" fill="#111827">');
    parts.push('<text x="'+barX1.toFixed(1)+'" y="'+(barY+22).toFixed(1)+'" text-anchor="middle">0</text>');
    parts.push('<text x="'+((barX1+barX2)/2).toFixed(1)+'" y="'+(barY+22).toFixed(1)+'" text-anchor="middle">'+Math.round(niceM/2)+'</text>');
    parts.push('<text x="'+barX2.toFixed(1)+'" y="'+(barY+22).toFixed(1)+'" text-anchor="middle">'+niceM+' m</text>');
    parts.push('</g>');

    parts.push('</svg>');
    var svgStr=parts.join('');
    document.getElementById('ppDiagramContent').innerHTML=svgStr;
    document.getElementById('ppDiagramWrap').style.display='block';
    /* v129b（2026-09-23 用户要求）：「下载/打印A3」按钮取消 —— 不再重新显示（DOM 与 click 监听保留，按钮恒 display:none）。
       原两行：ppDownload/ppPrint.style.display='inline-block' */
    ppState.lastSVG=svgStr;
    try{ ppInitCalcBookDrag(); }catch(e){ console.warn('[ppGenerateDiagram] calc book drag init failed', e); }
    try{ ppInitPlotDrag(); }catch(e){ console.warn('[ppGenerateDiagram] plot drag init failed', e); }
    if(doScroll) document.getElementById('ppDiagramWrap').scrollIntoView({behavior:'smooth',block:'nearest'});
  }

  function ppMeasureText(str){
    var w=0;
    for(var k=0;k<str.length;k++){
      var ch=str[k];
      w+=(ch.charCodeAt(0)>255?12:6.5);
    }
    return w;
  }

  function ppRewrapCalcBook(maxW){
    var segs=window._ppCalcBookSegs;
    if(!segs||!segs.length)return [];
    var lines=[],cur='';
    for(var i=0;i<segs.length;i++){
      var trial=cur?cur+'  |  '+segs[i]:segs[i];
      if(cur && ppMeasureText(trial)>maxW){
        lines.push(cur);
        cur=segs[i];
      }else{
        cur=trial;
      }
    }
    if(cur)lines.push(cur);
    if(lines.length>4){
      var rest=lines.slice(1).join('  |  ');
      lines=[lines[0],rest];
    }
    return lines;
  }

  /* 二级施工简图：底部计算书可拖动 + 右下角可调宽度（参考三级管线左上角信息框） */
  function ppInitCalcBookDrag(){
    var ctn=document.getElementById('ppDiagramContent');
    if(!ctn)return;
    var svgEl=ctn.querySelector('svg');
    if(!svgEl)return;
    var g=svgEl.querySelector('#ppCalcBookGroup');
    if(!g)return;
    var handle=svgEl.querySelector('#ppCalcBookHandle');
    if(!handle)return;
    if(window._ppCbMove)document.removeEventListener('mousemove',window._ppCbMove);
    if(window._ppCbUp)document.removeEventListener('mouseup',window._ppCbUp);

    var svgW=1190,svgH=841;
    var frameX=8,frameY=8,frameW=svgW-16,frameH=svgH-16;
    var pos={x:0,y:0};
    var cbW=window._ppCalcBookDefW||(svgW-68);
    try{
      var saved=JSON.parse(localStorage.getItem('pp-calcbook-pos'));
      if(saved&&typeof saved.x==='number')pos=saved;
      var savedW=parseFloat(localStorage.getItem('pp-calcbook-w'));
      if(savedW>0)cbW=savedW;
    }catch(e){}

    function applyPos(){
      g.setAttribute('transform','translate('+pos.x.toFixed(1)+','+pos.y.toFixed(1)+')');
    }

    function getScale(){
      var rect=svgEl.getBoundingClientRect();
      return rect.width>0?svgW/rect.width:1;
    }

    function renderBookForWidth(w){
      var lines=ppRewrapCalcBook(w);
      var h=lines.length*18+12;
      var x0=window._ppCalcBookX0||34;
      var y0=window._ppCalcBookY0||0;
      var bg=g.querySelector('#ppCalcBookBg');
      if(bg){
        bg.setAttribute('width',w+16);
        bg.setAttribute('height',h);
      }
      var oldTexts=g.querySelectorAll('.pp-cb-text');
      oldTexts.forEach(function(t){t.remove();});
      for(var j=0;j<lines.length;j++){
        var t=document.createElementNS('http://www.w3.org/2000/svg','text');
        t.setAttribute('x',x0);
        t.setAttribute('y',y0+j*18);
        t.setAttribute('text-anchor','start');
        t.setAttribute('font-size','11');
        t.setAttribute('font-weight','600');
        t.setAttribute('fill','#334155');
        t.setAttribute('class','pp-cb-text');
        t.textContent=lines[j];
        g.insertBefore(t,handle);
      }
      var hnd=g.querySelector('#ppCalcBookHandle');
      if(hnd){
        hnd.setAttribute('x',x0-8+w+16-8);
        hnd.setAttribute('y',y0-14+h-8);
      }
      return lines.length;
    }

    renderBookForWidth(cbW);
    applyPos();

    var dragStart=null;
    g.addEventListener('mousedown',function(e){
      if(e.button!==0)return;
      if(e.target===handle||(e.target.closest&&e.target.closest('#ppCalcBookHandle')))return;
      e.preventDefault();
      var scale=getScale();
      dragStart={x:e.clientX,y:e.clientY,ox:pos.x,oy:pos.y,scale:scale};
      document.body.style.userSelect='none';
    });

    var resizeStart=null;
    handle.addEventListener('mousedown',function(e){
      if(e.button!==0)return;
      e.preventDefault();
      e.stopPropagation();
      var scale=getScale();
      resizeStart={x:e.clientX,y:e.clientY,ow:cbW,scale:scale};
      document.body.style.userSelect='none';
    });

    window._ppCbMove=function(ev){
      if(dragStart){
        var s=dragStart.scale;
        pos.x=dragStart.ox+(ev.clientX-dragStart.x)*s;
        pos.y=dragStart.oy+(ev.clientY-dragStart.y)*s;
        pos.x=Math.max(-20,Math.min(frameW-100,pos.x));
        pos.y=Math.max(-50,Math.min(frameH-30,pos.y));
        applyPos();
      }
      if(resizeStart){
        var s2=resizeStart.scale;
        var dx=(ev.clientX-resizeStart.x)*s2;
        cbW=Math.max(200,Math.min(svgW-60,resizeStart.ow+dx));
        renderBookForWidth(cbW);
      }
    };

    window._ppCbUp=function(){
      if(dragStart){dragStart=null;document.body.style.userSelect='';}
      if(resizeStart){resizeStart=null;document.body.style.userSelect='';}
      localStorage.setItem('pp-calcbook-pos',JSON.stringify(pos));
      localStorage.setItem('pp-calcbook-w',cbW.toString());
    };

    document.addEventListener('mousemove',window._ppCbMove);
    document.addEventListener('mouseup',window._ppCbUp);

    g.addEventListener('dblclick',function(e){
      e.stopPropagation();
      e.preventDefault();
      pos={x:0,y:0};
      cbW=window._ppCalcBookDefW||svgW-68;
      renderBookForWidth(cbW);
      applyPos();
      localStorage.setItem('pp-calcbook-pos',JSON.stringify(pos));
      localStorage.setItem('pp-calcbook-w',cbW.toString());
    });
  }

  /* 二级施工简图：图纸主体（地块/分区/管线/标注）可整体平移拖动，尺寸不变；参考三级管线 tlPlotGroup 拖动方式 */
  function ppInitPlotDrag(){
    var ctn=document.getElementById('ppDiagramContent');
    if(!ctn)return;
    var svgEl=ctn.querySelector('svg');
    if(!svgEl)return;
    var plotG=svgEl.querySelector('#ppPlotGroup');
    if(!plotG)return;
    if(window._ppPlotMove)document.removeEventListener('mousemove',window._ppPlotMove);
    if(window._ppPlotUp)document.removeEventListener('mouseup',window._ppPlotUp);

    var svgW=1190,svgH=841,frameX=8,frameY=8,frameW=svgW-16,frameH=svgH-16;
    var pos={x:0,y:0};
    try{
      var saved=JSON.parse(localStorage.getItem('pp-plot-pos'));
      if(saved&&typeof saved.x==='number')pos=saved;
    }catch(e){}

    var bbox=plotG.getBBox();
    function clampPos(p){
      var minX=frameX-bbox.x;
      var maxX=frameX+frameW-(bbox.x+bbox.width);
      var minY=frameY-bbox.y;
      var maxY=frameY+frameH-(bbox.y+bbox.height);
      if(minX>maxX){minX=maxX=(minX+maxX)/2;}
      if(minY>maxY){minY=maxY=(minY+maxY)/2;}
      p.x=Math.max(minX,Math.min(maxX,p.x));
      p.y=Math.max(minY,Math.min(maxY,p.y));
      return p;
    }

    function applyPos(){
      plotG.setAttribute('transform','translate('+pos.x.toFixed(1)+','+pos.y.toFixed(1)+')');
    }
    if(pos.x||pos.y){clampPos(pos);applyPos();}

    function getScale(){
      var rect=svgEl.getBoundingClientRect();
      return rect.width>0?svgW/rect.width:1;
    }

    var dragStart=null;
    svgEl.addEventListener('mousedown',function(e){
      if(e.button!==0)return;
      var target=e.target;
      if(!target||!target.closest)return;
      // 点击计算书时交给计算书自己的拖动逻辑
      if(target.closest('#ppCalcBookGroup'))return;
      // 点击图纸组内部 或 SVG 背景空白处 均可拖动图纸
      var hitPlot=target===svgEl||target.closest('#ppPlotGroup');
      if(!hitPlot)return;
      e.preventDefault();
      var scale=getScale();
      dragStart={x:e.clientX,y:e.clientY,ox:pos.x,oy:pos.y,scale:scale};
      document.body.style.userSelect='none';
      svgEl.style.cursor='grabbing';
    });

    window._ppPlotMove=function(ev){
      if(!dragStart)return;
      var s=dragStart.scale;
      pos.x=dragStart.ox+(ev.clientX-dragStart.x)*s;
      pos.y=dragStart.oy+(ev.clientY-dragStart.y)*s;
      clampPos(pos);
      applyPos();
    };

    window._ppPlotUp=function(){
      if(!dragStart)return;
      dragStart=null;
      document.body.style.userSelect='';
      svgEl.style.cursor='';
      localStorage.setItem('pp-plot-pos',JSON.stringify(pos));
    };

    document.addEventListener('mousemove',window._ppPlotMove);
    document.addEventListener('mouseup',window._ppPlotUp);

    plotG.addEventListener('dblclick',function(e){
      e.stopPropagation();
      e.preventDefault();
      pos={x:0,y:0};
      applyPos();
      localStorage.setItem('pp-plot-pos',JSON.stringify(pos));
    });
  }

  function ppRefreshDiagramIfVisible(){
    var wrap=document.getElementById('ppDiagramWrap');
    if(!wrap||!ppState.polyPts.length||!ppState.lastSVG)return false;
    ppGenerateDiagram({scroll:false});
    return true;
  }
  /* v98d：分区线被拖动后 —— 二级施工图若可见则重建；三级整图重建（几何随新分区线，
     自动管线编辑按几何签名决定是否保留）+ 重算三级结果 + 刷分组面板。 */
  function ppRefreshTLAfterCuts(){
    try{ if(typeof ppRefreshDiagramIfVisible==='function') ppRefreshDiagramIfVisible(); }catch(e){}
    try{
      var poly=(typeof window!=='undefined')?window.measuredPolygon:null;
      if(poly&&poly.length>=3&&typeof tlAutoGenerate==='function') tlAutoGenerate({scroll:false,stay:true});
      else if(typeof renderThreeLevel==='function') renderThreeLevel();
    }catch(e){}
    /* 2026-09-22 修复：绿色「水力计算结果」栏必须从实时分区网格独立重算，不能依赖 tlAutoGenerate 成功。
       tlUpdatePlanBar() 在 tlAutoGenerate 末尾才调用，而整段被 try/catch 吞掉；一旦简图重绘在某种几何下抛错，
       绿栏就不刷新（红栏在下方独立 try 中照常刷新）—— 与「红变绿不变」现象一致。
       此处补一次独立重算：computeThreeLevel 直接读 RunyeBridge.getZoneCuts + measuredPolygon + tlManualGroups，
       不依赖 tlDiagramData，故即使上方 tlAutoGenerate 失败，绿栏也一定随新界线更新。 */
    try{ if(typeof tlUpdatePlanBar==='function') tlUpdatePlanBar(); }catch(e){}
    try{ if(typeof window.tlRefreshGroupPanel==='function') window.tlRefreshGroupPanel(); }catch(e){}
    try{ if(typeof window.tlRefreshGroupStatus==='function') window.tlRefreshGroupStatus(); }catch(e){}
  }
  window.ppRefreshDiagramIfVisible=ppRefreshDiagramIfVisible;
  window.ppGenerateDiagram=ppGenerateDiagram;
  /* v166：二级页调网格/微调/回退后同步重建三级简图的统一入口。
     导出原因：上述调用点走 window（与 ppRefreshDiagramIfVisible 同款防御式写法），
     且便于验收脚本拦截计数。 */
  window.ppRefreshTLAfterCuts=ppRefreshTLAfterCuts;

  document.getElementById('ppGenerate').addEventListener('click',function(){
    ppGenerateDiagram({scroll:false});
    // 同步生成三级管线施工简图：默认按当前选择的分区数（首次为2区一总管），调整4/6/8区后再次点击即按新选择重算
    try{
      if(window.measuredPolygon && window.measuredPolygon.length>=3 && typeof tlAutoGenerate==='function'){
        tlAutoGenerate({scroll:false});
      }
    }catch(e){ console.warn('[ppGenerate] 三级管线图生成失败', e); }
    // 二级首部系统图（二级系统图.html）的自动弹出已按要求取消（用户 2026-09-12）：
    // 原为 try{ if(typeof openL2Head==='function') openL2Head(); }catch(e){...}
    // 取消原因：「⚙️ 生成系统图」按钮取消后，生成施工图时不应再自动弹新窗口。
    // 进入施工图满屏视图（把二级切到「简图」）
    try{ ppShowConstructDiagram(); }catch(e){}
    /* v104（用户 2026-09-22 要求）：「生成施工图」点完**直接跳到「三级管路编辑」页**
       —— 即 tlPipePlanSection 的 ws 视图（三级设计工作区，与顶部导航「三级管路编辑」同一落点）。
       理由：二/三级施工图在这一句之前都已生成完毕，用户的下一步就是去三级编辑管路
       （插入主管/支管、联合灌溉分组、拖分界线），不该再把人留在二级「简图」上。
       ⚠ **顺序不可颠倒**：ppShowConstructDiagram() 内部是 rySetTab('pipePlanSection','draw')，
         它会把「二级」置为当前页；本次跳转必须排在它**之后**，否则会被它吃掉。
       ⚠ 用既有 helper tlShowWorkspace()（= rySetTab('tlPipePlanSection','ws')）而不是自己调
         ryJumpToSection：rySetTab 内部会在目标 section 未激活时自动补 ryShowSection，
         且会一并写好 data-ry-clean='0'（ws 是工作区，左属性栏保留），无需再手工补标记。
       ⚠ 不要动 ppShowConstructDiagram() 这一句：状态栏提示与既有闸门都按
         「生成后二级停在简图视图」建的契约，删掉会连带影响它们。 */
    try{ if(typeof tlShowWorkspace==='function') tlShowWorkspace(); }catch(e){ console.warn('[ppGenerate] 跳三级管路编辑失败', e); }
    /* [v355] 生成成功即记「已生成」边界签名：此后切页/整页重载（含手画、图片测量、AI 回带等
       没有地块库锚的路径）可按签名自动恢复。签名锚在边界多边形本身——几何没变设计就有效，
       变了宁可不恢复（与 v161 原则一致）。恢复链见 ryPpGenRestoreProject。 */
    try{
      if(window.measuredPolygon && window.measuredPolygon.length>=3 && typeof window.ryPolySig==='function'){
        window.__ryPpGenSig=window.ryPolySig(window.measuredPolygon);
      }
    }catch(e){}
  });

  // Download
  document.getElementById('ppDownload').addEventListener('click',function(){
    if(!ppState.lastSVG)return;
    var blob=new Blob([ppState.lastSVG],{type:'image/svg+xml'});
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');a.href=url;a.download='irrigation-diagram.svg';a.click();
    URL.revokeObjectURL(url);
  });

  // ppSavePng「保存图片」按钮已移除，事件绑定同步移除

  // Print A3
  document.getElementById('ppPrint').addEventListener('click',function(){
    if(!ppState.lastSVG)return;
    var w=window.open('','_blank','width=1200,height=900');
    w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>润野灌溉·施工简图</title><style>');
    w.document.write('@page{size:A3 landscape;margin:5mm}');
    w.document.write('body{margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#fff}');
    w.document.write('svg{max-width:100%;max-height:100vh}');
    w.document.write('@media print{body{margin:0}}</style>  <link rel="stylesheet" href="runye-theme.css"></head><body>');
    w.document.write(ppState.lastSVG);
    w.document.write('</body></html>');
    w.document.close();
    setTimeout(function(){w.print();},500);
  });

  window.ppGetState=function(){
    return {
      mainPipes:JSON.parse(JSON.stringify(ppState.mainPipes||[])),
      branchPipes:JSON.parse(JSON.stringify(ppState.branchPipes||[])),
      subBranchPipes:JSON.parse(JSON.stringify(ppState.subBranchPipes||[])),
      pipeLevel:ppState.pipeLevel||'two',
      source:ppState.source?JSON.parse(JSON.stringify(ppState.source)):null,
      valves:JSON.parse(JSON.stringify(ppState.valves||[])),
      lineDrawMode:ppState.lineDrawMode||'free',
      hiddenPipes:JSON.parse(JSON.stringify(ppState.hiddenPipes||{main:{},branch:{},subbranch:{}})),
      pipeIds:JSON.parse(JSON.stringify(ppState.pipeIds||{main:[],branch:[],subbranch:[]})),
      nextPipeId:ppState.nextPipeId||1,
      zoneRotated:!!ppState.zoneRotated,
      plotRotationDeg:ppState.plotRotationDeg||0,
      zoom:ppState.zoom||1,
      panX:ppState.panX||0,
      panY:ppState.panY||0,
      lastSVG:ppState.lastSVG||''
    };
  };
  // 材料清单数据传导：统计施工简图实际绘制（未遮蔽）的主管/支管总长；hasPipes=false 时调用方回退理论值。
  // 滴灌带不在施工简图布置，由调用方按总面积 ÷ 滴灌带间距直接传导。
  window.ppGetMaterialStats=function(){
    var stats={mainLen:0,branchLen:0,hasPipes:false};
    (ppState.mainPipes||[]).forEach(function(line,i){
      if(ppIsPipeHidden('main',i))return;
      stats.mainLen+=ppLineLen(line);
    });
    (ppState.branchPipes||[]).forEach(function(line,i){
      if(ppIsPipeHidden('branch',i))return;
      stats.branchLen+=ppLineLen(line);
    });
    stats.hasPipes=stats.mainLen>0||stats.branchLen>0;
    return stats;
  };
  // 施工简图管线变化后刷新页面（材料清单随之重算传导值）
  function ppRefreshMaterials(){
    if(typeof window.render==='function'){
      try{ window.render(); }catch(e){}
    }
  }
  window.ppSetState=function(saved){
    saved=saved||{};
    ppState.mainPipes=JSON.parse(JSON.stringify(saved.mainPipes||[]));
    ppState.branchPipes=JSON.parse(JSON.stringify(saved.branchPipes||[]));
    ppState.subBranchPipes=JSON.parse(JSON.stringify(saved.subBranchPipes||[]));
    ppState.pipeLevel='two'; // Always two-level in drawing; three-level is now a separate view
    ppState.source=saved.source?JSON.parse(JSON.stringify(saved.source)):null;
    ppState.valves=JSON.parse(JSON.stringify(saved.valves||[]));
    ppState.currentLine=[];
    ppState.pipeIds=JSON.parse(JSON.stringify(saved.pipeIds||{main:[],branch:[],subbranch:[]}));
    if(!Array.isArray(ppState.pipeIds.main))ppState.pipeIds.main=[];
    if(!Array.isArray(ppState.pipeIds.branch))ppState.pipeIds.branch=[];
    if(!Array.isArray(ppState.pipeIds.subbranch))ppState.pipeIds.subbranch=[];
    ppState.nextPipeId=saved.nextPipeId||1;
    ppState.hiddenPipes=JSON.parse(JSON.stringify(saved.hiddenPipes||{main:{},branch:{},subbranch:{}}));
    if(!ppState.hiddenPipes.main)ppState.hiddenPipes.main={};
    if(!ppState.hiddenPipes.branch)ppState.hiddenPipes.branch={};
    if(!ppState.hiddenPipes.subbranch)ppState.hiddenPipes.subbranch={};
    ppEnsurePipeIds('main');
    ppEnsurePipeIds('branch');
    ppEnsurePipeIds('subbranch');
    ppNormalizeHiddenPipes();
    ppUpdatePickResult(null);
    ppUpdateLegend(false);
    ppState.lineDrawMode=saved.lineDrawMode==='ortho'?'ortho':'free';
    ppState.zoneRotated=!!saved.zoneRotated;
    ppState.plotRotationDeg=parseFloat(saved.plotRotationDeg)||0;
    ppState.zoom=saved.zoom||1;
    ppState.panX=saved.panX||0;
    ppState.panY=saved.panY||0;
    ppState.lastSVG=saved.lastSVG||'';
    var rotateBtn=document.getElementById('ppRotateZones');
    if(rotateBtn){
      rotateBtn.classList.toggle('active',ppState.zoneRotated);
      rotateBtn.textContent=ppState.zoneRotated?'↻ 分区已旋转90°':'↻ 分区旋转90°';
    }
    var angleInput=document.getElementById('ppPlotAngle');
    if(angleInput)angleInput.value=ppState.plotRotationDeg;
    if(ppState.lastSVG){
      document.getElementById('ppDiagramContent').innerHTML=ppState.lastSVG;
      document.getElementById('ppDiagramWrap').style.display='block';
      /* v129b（同上）：状态恢复路径也不重新显示下载/打印A3。
         原两行：ppDownload/ppPrint.style.display='inline-flex' */
    }else{
      document.getElementById('ppDiagramContent').innerHTML='<div class="pp-diagram-empty">完成面积测量并点击「生成施工图」后，这里显示最终施工图。</div>';
      document.getElementById('ppDiagramWrap').style.display='block';
    }
    if(typeof ppSetLineDrawMode==='function')ppSetLineDrawMode(ppState.lineDrawMode);
    ppLoadPolygon();
    ppUpdateTransform();
    ppRender();
    ppUpdateAutoPipeButton();
  };

  // Resize + init
  window.addEventListener('resize',ppResize);
  setTimeout(function(){ppResize();ppLoadPolygon();ppUpdateAutoPipeButton();},200);
})();
