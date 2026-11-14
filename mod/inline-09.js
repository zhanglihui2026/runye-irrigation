
// ===== CONSTANTS =====
const C_HAZEN = 150;
const SDR = 13.6;
/* —— 两套管径序列，用途不同，**刻意不等**（2026-10-02 收敛为单一来源并写明关系）——
   ① PE_OD_SERIES：**自动选管**候选（水力计算 selectPipe / 改径下拉的档位来源），
      只收标准 PE100 外径系列（GB/T 13663 首选档），共 18 档。
   ② CAL_SERIES ：**手动改径菜单 + 单价表**的档位，= ① + 用户点名的非标规格 Ø220
      （菜单里该档带「（非标）」角标；见 19119 行起的「图面改径菜单」注释），共 19 档。
   历史上 ② 被抄成三份（改径菜单内联 / 设置页 SERIES / 经济面板单价表），任何一处改档
   都会悄悄漂移 —— 现统一由本处 CAL_SERIES 提供，其余位置只引用。
   契约：`_p1/_verify_series_contract.cjs`（CAL_SERIES ⊇ PE_OD_SERIES 且恰多 Ø220；
   全文件只允许出现这一份 19 档字面量）。 */
const PE_OD_SERIES = [50, 63, 75, 90, 110, 125, 140, 160, 180, 200, 225, 250, 280, 315, 355, 400, 450, 500];
const CAL_SERIES = [50, 63, 75, 90, 110, 125, 140, 160, 180, 200, 220, 225, 250, 280, 315, 355, 400, 450, 500];
const SAFETY_FACTOR = 1.10;
const MARGIN_HEAD = 2;
const MU_TO_SQM = 666.67;
const ECON_VMIN = 0.8;
const ECON_VMAX = 2.0;
const MAX_ZONE_SIDE = 200;
const MAX_MANUAL_ZONE_COUNT = 500;
const MAIN_PIPE_MIN_OD = 90;
const BRANCH_PIPE_MAX_OD = 160;

// 面积和分区几何由独立纯计算模块提供；保留全局函数名兼容现有调用点。
function polyAreaM2(poly) { return window.RyZoneGeometry.polyAreaM2(poly); }
function clipPolyToRect(poly, x0, y0, x1, y1) { return window.RyZoneGeometry.clipPolyToRect(poly, x0, y0, x1, y1); }

/* ===== v98h 三级「阶梯分区」：同一条分区线可按行/列错开（2026-09-21）=====
   背景：分区线在数据模型里是全幅贯通的一条直线（xPos / yPos 各只有一份），所以「拖某一行里的那一段」
   在底层就等于移动整条线 —— 同一线上的其它行段必然跟着走，横边界的跨度也跟着变。
   为了让「拖 A 段不影响 B 段」成立，这里加一层**稀疏覆盖表**（不动二级共享网格）：
     window.tlZoneStep = { sig:'<基础网格签名>', x:{'行,线号':米}, y:{'列,线号':米} }
   规则：
     · 缺省（表里没有该键）⇒ 用基础网格 xPos[线号] / yPos[线号]，因此**空表时渲染与面积逐字节不变**；
     · 基础网格签名变化（= 在二级改了分区线 / 改了分区数）⇒ 整表作废，避免旧偏移套到新几何上；
     · 只在三级页产生与消费；二级页完全不读这张表（本轮「二级暂时不动」）。
   几何：格 (行 r, 列 c) = [X_r[c], X_r[c+1]] × [Y_c[r], Y_c[r+1]]，仍是矩形；
   相邻格共享边 ⇒ 无缝隙、无重叠，无需裁剪（X 按行各取一份、Y 按列各取一份即可保证）。
   ⚠ 「遍历某行/某列的割缝」一律走 tlZoneGx / tlZoneGy，不要直接读 xPos / yPos —— 
      直接读会拿不到本行覆盖，画出来的线会和拖过的位置不一致。 */
/* ============================================================================
   v159 阀门符号唯一来源                                            2026-09-29
   ----------------------------------------------------------------------------
   用户要求：「感觉地块的阀门有点大，都统一跟总管接向主管的阀门一样大小吧。」
   根因：同一枚「红⊗阀门」在三处各写各的尺寸 ——
         三级平面简图分区阀 r=7/±4/sw1.5、二级编辑画布阀 r=7/±4/sw1.5、
         二级施工图阀 r=8/±4/sw1.5；而参照物「总管×主管交接阀」是 r=6.5/±3.6/sw1.4
         ⇒ 同一符号三种大小（三处互不知情，改一处不同步另外两处）。
   修法：数值收敛到 window.RY_VALVE 单一来源，三处一律调用 ryValveSVG / ryValveCanvas。
   ============================================================================ */
window.RY_VALVE = { r: 6.5, x: 3.6, xsw: 1.4, ring: 2, c: '#ef4444' };
/* 红⊗阀门 → SVG 片段（圆 + 白描边 + 内叉）。坐标一律 toFixed(1)，
   与各站点原先的取整口径一致 ⇒ 除尺寸数字外，输出字符串逐字节不变。 */
window.ryValveSVG = function (cx, cy) {
  var V = window.RY_VALVE;
  return '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + V.r + '" fill="' + V.c + '" stroke="#fff" stroke-width="' + V.ring + '"/>'
    + '<line x1="' + (cx - V.x).toFixed(1) + '" y1="' + (cy - V.x).toFixed(1) + '" x2="' + (cx + V.x).toFixed(1) + '" y2="' + (cy + V.x).toFixed(1) + '" stroke="#fff" stroke-width="' + V.xsw + '"/>'
    + '<line x1="' + (cx + V.x).toFixed(1) + '" y1="' + (cy - V.x).toFixed(1) + '" x2="' + (cx - V.x).toFixed(1) + '" y2="' + (cy + V.x).toFixed(1) + '" stroke="#fff" stroke-width="' + V.xsw + '"/>';
};
/* 同一枚阀门的 canvas 版（二级页编辑画布走 2D 上下文，不能拼 SVG 字符串） */
window.ryValveCanvas = function (ctx, x, y) {
  var V = window.RY_VALVE;
  ctx.fillStyle = V.c; ctx.beginPath(); ctx.arc(x, y, V.r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = V.ring; ctx.stroke();
  ctx.lineWidth = V.xsw;
  ctx.beginPath(); ctx.moveTo(x - V.x, y - V.x); ctx.lineTo(x + V.x, y + V.x);
  ctx.moveTo(x + V.x, y - V.x); ctx.lineTo(x - V.x, y + V.x); ctx.stroke();
};
window.tlZoneStep = window.tlZoneStep || { sig: '', x: {}, y: {} };
function tlZoneGridSig(cuts) {
  try {
    if (!cuts) return '';
    var f = function (v) { return Math.round(v * 1000) / 1000; };
    return (cuts.cols | 0) + 'x' + (cuts.rows | 0) + '|' + (cuts.xPos || []).map(f).join(',') + '|' + (cuts.yPos || []).map(f).join(',');
  } catch (e) { return ''; }
}
/* 取有效覆盖表：未初始化 / 签名不符 ⇒ null（= 无阶梯，退回基础网格） */
function tlZoneStepFor(cuts) {
  var st = window.tlZoneStep;
  if (!st || !st.sig || !st.x || !st.y) return null;
  if (st.sig !== tlZoneGridSig(cuts)) return null;
  return st;
}
function tlZoneStepClear() { window.tlZoneStep = { sig: '', x: {}, y: {} }; }
function tlZoneStepCount() {
  var st = window.tlZoneStep;
  if (!st) return 0;
  return Object.keys(st.x || {}).length + Object.keys(st.y || {}).length;
}
/* 单格边界（含阶梯覆盖）。缺省回退基础网格 ⇒ 空表时结果与改动前逐位相同。 */
function tlZoneGx(cuts, ri, ci) {
  return window.RyZoneGeometry.zoneGx(cuts, ri, ci);
}
function tlZoneGy(cuts, ci, ri) {
  return window.RyZoneGeometry.zoneGy(cuts, ci, ri);
}
function tlMeasureText(str){var w=0;for(var k=0;k<str.length;k++){var ch=str[k];w+=(ch.charCodeAt(0)>255?12:6.5);}return w;}

/* 2026-09-24 用户要求：分区固定边可调 —— 面板「单边铺设长度」×2（双边铺设长度），
   默认 100×2=200（即原 MAX_ZONE_SIDE 硬编码）。只作用于二级分区划分
   （calcZoneLayout / calcManualZoneLayout / ppGetZoneCuts 钳制）；
   一级 fld_zoneFixedSide、三级 tl_zoneFixedSide 各有自己的输入，不受影响。 */
function planZoneFixedSide() {
  var el = document.getElementById('planTapeLaySide');
  var v = parseFloat(el ? el.value : '');
  if (!isFinite(v) || v <= 0) v = 100;
  return Math.max(1, 2 * v);  // 单边×2=滴灌带总长（支管两侧敷设）；只钳制滴灌带方向那一边
}

/* [v969 2026-11-05 用户拍板「方案C」] 「末排并入上排」开关（index.html #planZoneMergeLast）。
   勾选后：行方向末排（含被地块边裁出的余排）整排并入上一排 —— 分区数减少、
   单区面积增大（如 15 区 → 10 区）。只作用于手动亩/区模式的行切分；
   消费点：calcManualZoneLayout / getManualPlanZoneMu / ppGetZoneLayout /
   ppGetZoneCutSignature / ppGetZoneCuts（plot-editor）。 */
function planZoneMergeLastOn() {
  var el = document.getElementById('planZoneMergeLast');
  return !!(el && el.checked);
}

function calcZoneLayout(width, height, requestedN) {
  return window.RyZoneGeometry.autoZoneLayout(width, height, requestedN, planZoneFixedSide());
}

function splitZoneLength(total, step, mergeLast) {
  return window.RyZoneGeometry.splitZoneLength(total, step, MAX_MANUAL_ZONE_COUNT, !!mergeLast);
}

function calcManualZoneLayout(width, height, manualMu, mergeLastRow) {
  return window.RyZoneGeometry.manualZoneLayout(width, height, manualMu,
    planZoneFixedSide(), MU_TO_SQM, MAX_MANUAL_ZONE_COUNT, !!mergeLastRow);
}

function splitZoneLengthCount(total, step, limit) {
  return window.RyZoneGeometry.splitZoneLengthCount(total, step, limit);
}

function getManualPlanZoneMu(width, height) {
  const modeEl = document.getElementById('planZoneMode');
  if (!modeEl || modeEl.value !== 'manual') return 0;
  const input = document.getElementById('planZoneMuManual');
  const v = parseFloat(input ? input.value : '');
  if (!isFinite(v) || v <= 0) return 0;
  if (isFinite(width) && isFinite(height)) {
    try {
      calcManualZoneLayout(width, height, v, planZoneMergeLastOn());
      window.__manualZoneLayoutWarning = null;
    } catch (err) {
      if (!err || err.code !== 'manual_zone_count_exceeded') throw err;
      window.__manualZoneLayoutWarning = { requestedMu: v, maxCount: MAX_MANUAL_ZONE_COUNT };
      return 0;
    }
  }
  return v;
}

function calcPlanZoneLayout(width, height, requestedN, manualMu, mergeLastRow) {
  return manualMu > 0 ? calcManualZoneLayout(width, height, manualMu, mergeLastRow) : calcZoneLayout(width, height, requestedN);
}

function peInnerDiam(od) { return RyDesignCore.inner(od, SDR); }

/* 图面管径覆盖（2026-09-17 第四十一轮）：三级图面上用右键/工具轨改过管径后，
   用户点左栏「⇧ 更新水泵扬程」确认后，保存各管道的外径，按轮灌组逐路径校核。
   null = 未确认，仍按 selectPipe 理论选管；计算管径统一由外径折算内径。 */
var tlPipeOdOverride = null;
/* 已确认管径按管道编号保存，绑定图面几何；旧的分类平均值不再参与计算。 */
function tlNormalizePipeOverride(value) {
  if (!value || value.version !== 1 || typeof value.geoKey !== 'string' || !value.geoKey || !value.calibers) return null;
  var cals = {};
  Object.keys(value.calibers).forEach(function (pid) {
    var od = value.calibers[pid];
    if (/^(front|main-\d+|branch-\d+)$/.test(pid) && Number.isFinite(od) && od >= 16 && od <= 1200) cals[pid] = od;
  });
  return Object.keys(cals).length ? { version: 1, geoKey: value.geoKey, calibers: cals } : null;
}
function tlAppliedPipeOverride() {
  var value = tlNormalizePipeOverride(tlPipeOdOverride), ae = window.RyTlAutoEdits;
  return value && ae && window.tlDiagramData && value.geoKey === ae.geometryKey(window.tlDiagramData) ? value : null;
}

/* ===== 2026-09-24 用户要求：「水力计算结果」面板 总管/主管/支管 的「改径重算」列
   改为管径选择按钮（设计值±3档）。选中后同步刷新扬程、流速、功率和改径确认摘要。 ===== */
/* 手动选管状态：null = 用设计管径（不覆盖）；数字 = 覆盖该档管径 OD。 */
window.tlManualCals = window.tlManualCals || { front: null, main: null, branch: null };
/* 把手动选管并入 tlPipeOdOverride（与既有「图面改径 / 应用到图面」同源机制）：
   ① 保证 tlAppliedPipeOverride() 生效 → ovApplied=true，改径重算列正常显示；
   ② 图面分支沿程损失按新管径重算。键名同时覆盖 AE.allPids 段键与 wp.zones 的 zone 键（双命名空间）。 */
function tlBuildPipeOverride() {
  if (!window.tlManualCals) window.tlManualCals = { front: null, main: null, branch: null };
  var mc = window.tlManualCals;
  var anyManual = (mc.front != null || mc.main != null || mc.branch != null);
  var AE = window.RyTlAutoEdits;
  var base = (typeof window.tlPipeCaliberSnapshot === 'function') ? window.tlPipeCaliberSnapshot() : null;
  var cals = (base && base.calibers) ? Object.assign({}, base.calibers) : {};
  var geoKey = (base && base.geoKey) ? base.geoKey : (AE && window.tlDiagramData ? AE.geometryKey(window.tlDiagramData) : null);
  if (AE && window.tlDiagramData && anyManual) {
    AE.allPids(window.tlDiagramData).forEach(function (pid) {
      if (/^main-\d+$/.test(pid) && mc.main != null) cals[pid] = mc.main;
      else if (/^branch-\d+$/.test(pid) && mc.branch != null) cals[pid] = mc.branch;
    });
  }
  var wp2 = (typeof tlWorstPathLen === 'function') ? tlWorstPathLen() : null;
  if (wp2 && wp2.zones && anyManual) {
    wp2.zones.forEach(function (z) {
      if (mc.main != null) cals['main-' + z.zi] = mc.main;
      if (mc.branch != null) cals['branch-' + z.zi] = mc.branch;
    });
  }
  if (mc.front != null) cals.front = mc.front;
  tlPipeOdOverride = (geoKey && Object.keys(cals).length)
    ? tlNormalizePipeOverride({ version: 1, geoKey: geoKey, calibers: cals })
    : null;
}
/* 面板三个直径选择 <select> 的填充：以设计值(±3档)为选项，当前有效值为选中态。 */
/* [v970 2026-11-05 用户要求] 选项改为「全部档位」+ 每档流速提示。
   背景：±3 档窗口卡死向下选择——支管设计 Ø140 时最小只能选 Ø90，用户要选更小档
   （流速偏高可接受，扬程影响小）。改后：选项 = PE_OD_SERIES 全档位（18 档），
   设计值标注「设计」，其余档按当前流量算出实际流速标在档位后面，用户自己权衡。
   手动选管 → tlManualCals → tlBuildPipeOverride → 改径重算，链路不变；
   tlNormalizePipeOverride 下限 16mm，全档位都在合法区间。 */
function tlCalSelOptions(designOd, curOd, flow, maxOd) {
  /* [v972 用户口径] 「支管可选择的管径范围一定是比主管细的，比主管粗的按常理不会选」：
     maxOd 传入主管有效管径（设计档或手动改径后的档），≥ maxOd 的档位直接不出现；
     设计档例外保留（防止下拉失去选中值），全过滤空时退化为仅设计档。 */
  var series = PE_OD_SERIES;
  if (isFinite(maxOd) && maxOd > 0) {
    series = series.filter(function (od) { return od < maxOd || od === designOd; });
    if (!series.length) series = [designOd];
  }
  return series.map(function (od) {
    var label = 'Ø ' + od;
    if (od === designOd) { label += ' · 设计'; }
    else if (isFinite(flow) && flow > 0) {
      var v = flow / 3600 / (Math.PI * Math.pow(peInnerDiam(od) / 1000, 2) / 4);
      if (isFinite(v)) label += ' · ' + v.toFixed(2) + ' m/s';
    }
    return { od: od, label: label };
  });
}
function tlRefreshCalSels(r, rDes) {
  if (!r || !r.frontPipe || !rDes || !rDes.frontPipe) return;
  var hp = r.hydraulicPath;
  var sels = [
    { sel: 'tlCalSelFront', des: rDes.frontPipe.od, cur: r.frontPipe.od, flow: hp ? hp.frontFlow : r.combinedFlow, maxOd: Infinity },
    { sel: 'tlCalSelMain', des: rDes.mainPipe.od, cur: r.mainPipe.od, flow: hp ? hp.mainFlow : r.zoneFlow, maxOd: Infinity },
    /* [v972] 支管档位上限 = 主管有效管径（含手动改径后的 r.mainPipe.od）：比主管粗的档不出现 */
    { sel: 'tlCalSelBranch', des: rDes.branchPipe.od, cur: r.branchPipe.od, flow: hp ? hp.branchFlow : r.branchFlow, maxOd: r.mainPipe.od }
  ];
  tlBindCalSels();
  sels.forEach(function (s) {
    var el = document.getElementById(s.sel); if (!el) return;
    var opts = tlCalSelOptions(s.des, s.cur, s.flow, s.maxOd);
    el.innerHTML = opts.map(function (o) { return '<option value="' + o.od + '">' + o.label + '</option>'; }).join('');
    el.setAttribute('data-design', s.des);
    var chosen = isFinite(s.cur) ? s.cur : s.des;
    el.value = (PE_OD_SERIES.indexOf(chosen) >= 0) ? chosen : s.des;
  });
}
/* 选择按钮 change 事件绑定（仅绑定一次）。选回设计值即清除该档覆盖。 */
/* [v972 2026-11-05 用户反馈「支管的管径选择之后 相关的扬程 流速 计算数据没有变」]
   根因①：绑定用「首元素一次性 addEventListener」，而三级面板 DOM 会整块重建
   （切页 / 重新生成简图 / 恢复存档）。重建后的 <select> 是**新元素**，旧监听随
   旧节点一起消失，window._tlCalSelBound 却仍为 true ⇒ 新下拉永远没有监听，
   选档毫无反应。改为 document 级事件委托（按 id 匹配），面板怎么重建都有效。 */
function tlBindCalSels() {
  if (window._tlCalSelBound) return; window._tlCalSelBound = true;
  document.addEventListener('change', function (ev) {
    var el = ev.target;
    if (!el || !el.id) return;
    var key = el.id === 'tlCalSelFront' ? 'front'
      : el.id === 'tlCalSelMain' ? 'main'
      : el.id === 'tlCalSelBranch' ? 'branch' : null;
    if (!key) return;
    var design = Number(el.getAttribute('data-design'));
    var val = Number(el.value);
    if (!window.tlManualCals) window.tlManualCals = { front: null, main: null, branch: null };
    window.tlManualCals[key] = (val === design) ? null : val;
    tlBuildPipeOverride();
    /* 管径选择与“更新水泵扬程”走同一刷新入口，避免主结果已更新而确认摘要仍显示旧损失。
       兼容更新入口尚未装配或缺少图面路径的场景，保留原有即时显示与快照同步。 */
    var updated = false;
    if (typeof window.tlPumpUpdateRun === 'function') {
      try { updated = window.tlPumpUpdateRun() === true; } catch (eUpdate) { updated = false; }
    }
    if (!updated) {
      if (typeof tlUpdatePlanBar === 'function') tlUpdatePlanBar();
      if (typeof window.tlSyncHydDesignSnapshot === 'function') window.tlSyncHydDesignSnapshot();
    }
  });
}

function hazenWilliams(L, Q, d) {
  return RyDesignCore.hazen(L, Q, d, C_HAZEN);
}

function christiansenF(N) {
  return RyDesignCore.christiansen(N);
}

function selectPipe(Q, targetV, minOd = 0, maxOd = Infinity) {
  return RyDesignCore.selectPipe(Q, targetV, PE_OD_SERIES, SDR, minOd, maxOd);
}

/* [v653] 分区管径细化（实切口径）—— 单一出处：给定分区实际面积(m²)与滴灌参数，
   返回该区流量与主/支管建议档。流量口径与 calcPlan / grComputeHydraulics 同一条
   （面积 ÷ 滴带间距 ÷ 滴孔间距 × 滴头流量 / 1000）；管径就是本文件的 selectPipe
   （主管 ≥Ø90 / 支管 ≤Ø160，四级约束一致）。二级画布逐区标注与「分区管径明细」
   共用本函数 —— 不写第二份算法（v193 铁律）。 */
function ryZonePipePick(areaM2, tapeSpacing, emitterSpacing, emitterFlow, targetV, branchParallelCount) {
  const flow = areaM2 / tapeSpacing / emitterSpacing * emitterFlow / 1000;
  const par = Math.max(1, branchParallelCount || 1);
  return {
    flow: flow,
    main: selectPipe(Math.max(flow, 0.01), targetV, MAIN_PIPE_MIN_OD, Infinity),
    branch: selectPipe(Math.max(flow / par, 0.01), targetV, 0, BRANCH_PIPE_MAX_OD)
  };
}
window.ryZonePipePick = ryZonePipePick;

function evaluateAllPipes(Q, minOd = 0, maxOd = Infinity) {
  return RyDesignCore.pipes(Q, PE_OD_SERIES, SDR, minOd, maxOd).map(function (p) { return { od: p.od, id: p.id, v: p.v }; });
}

function selectMotorPower(requiredKW) {
  return RyDesignCore.motor(requiredKW);
}

function pipeStatusLabel(v, isRecommended) {
  if (isRecommended) return '推荐';
  if (v >= ECON_VMIN && v <= ECON_VMAX) return '可选';
  if (v > ECON_VMAX) return '流速偏高';
  return '流速偏低';
}

function pipeStatusClass(v, isRecommended) {
  if (isRecommended) return 'recommended';
  if (v >= ECON_VMIN && v <= ECON_VMAX) return 'suitable';
  return 'outside';
}

function readNumber(id, fallback, options = {}) {
  const el = document.getElementById(id);
  const raw = el ? String(el.value).trim() : '';
  let value = raw === '' ? fallback : Number(raw);
  if (!Number.isFinite(value)) value = fallback;
  if (options.integer) value = Math.round(value);
  if (options.min != null && value < options.min) value = options.min;
  if (options.max != null && value > options.max) value = options.max;
  return value;
}

function readSelectedInt(selector, fallback) {
  const el = document.querySelector(selector);
  const value = parseInt(el && el.dataset ? el.dataset.n || el.dataset.sides : '', 10);
  return Number.isFinite(value) ? value : fallback;
}

function readCurrentPlanningZoneAreas() {
  try {
    var bridge=window.RunyeBridge, cuts=bridge&&bridge.getZoneCuts(), poly=bridge&&bridge.getPlotPolygon();
    var total=Number(window.measuredArea);
    if(!cuts||!poly||poly.length<3||!isFinite(total)||total<=0)return null;
    var gridPoly=bridge.polyToGrid(cuts,poly), cols=cuts.cols|0, rows=cuts.rows|0;
    if(cols<1||rows<1||!cuts.xPos||!cuts.yPos)return null;
    /* The area allocation is a generation input, not a value each consumer may
       independently reconstruct. Cache it by every geometric and measured-area
       input that affects the allocation; all callers receive the same canonical
       zone vector until one of those inputs changes. */
    var cellBounds=[];
    for(var sr=0;sr<rows;sr++)for(var sc=0;sc<cols;sc++){
      cellBounds.push([
        typeof tlZoneGx==='function'?tlZoneGx(cuts,sr,sc):cuts.xPos[sc],
        typeof tlZoneGy==='function'?tlZoneGy(cuts,sc,sr):cuts.yPos[sr],
        typeof tlZoneGx==='function'?tlZoneGx(cuts,sr,sc+1):cuts.xPos[sc+1],
        typeof tlZoneGy==='function'?tlZoneGy(cuts,sc,sr+1):cuts.yPos[sr+1]
      ]);
    }
    var areaKey=JSON.stringify([String(window.currentPlotId||''),total,cols,rows,gridPoly,cellBounds]);
    var cached=window.__runyePlanningAreaSnapshot;
    if(cached&&cached.key===areaKey&&Array.isArray(cached.zoneAreasM2))return cached.zoneAreasM2;
    var areas=[],sum=0;
    for(var r=0;r<rows;r++)for(var c=0;c<cols;c++){
      var x0=typeof tlZoneGx==='function'?tlZoneGx(cuts,r,c):cuts.xPos[c];
      var x1=typeof tlZoneGx==='function'?tlZoneGx(cuts,r,c+1):cuts.xPos[c+1];
      var y0=typeof tlZoneGy==='function'?tlZoneGy(cuts,c,r):cuts.yPos[r];
      var y1=typeof tlZoneGy==='function'?tlZoneGy(cuts,c,r+1):cuts.yPos[r+1];
      var clipped=bridge.clipPolyToRect(gridPoly,x0,y0,x1,y1), a=clipped&&clipped.length>=3?Number(bridge.polyArea(clipped)):0;
      if(!isFinite(a)||a<0)return null;
      areas.push(a);sum+=a;
    }
    if(!(sum>0))return null;
    // 地图实测总面积是唯一总量；本页几何只负责按当前切分比例分配到各区。
    var scale=total/sum;
    areas=areas.map(function(a){return a*scale;});
    var corrected=total-areas.reduce(function(s,a){return s+a;},0);
    areas[areas.length-1]+=corrected;
    if(!areas.every(function(a){return isFinite(a)&&a>0;}))return null;
    window.__runyePlanningAreaSnapshot={version:1,key:areaKey,totalAreaM2:total,zoneAreasM2:areas};
    return areas;
  } catch (e) { return null; }
}
// 兼容旧调用名，但语义已收敛为本页当前分区几何，不再读取地图旧 partitions。
function readOnlineMapZoneAreas(){ return readCurrentPlanningZoneAreas(); }

// ===== COMPUTE =====
function compute() {
  const mapZoneAreas = readOnlineMapZoneAreas();
  if (!mapZoneAreas) return null;
  const zoneMuInput = Math.max.apply(null, mapZoneAreas) / MU_TO_SQM;
  const fixedSideInput = readNumber('fld_zoneFixedSide', MAX_ZONE_SIDE, { min: 1 });
  const fixedSide = Math.min(MAX_ZONE_SIDE, Math.max(1, fixedSideInput));
  document.getElementById('fld_zoneFixedSide').value = fixedSide;
  const zoneAreaM2 = zoneMuInput * MU_TO_SQM;
  const zoneMu = zoneAreaM2 / MU_TO_SQM;
  const zoneMuField = document.getElementById('fld_zoneMu');
  if (zoneMuField) zoneMuField.value = fmt(zoneMu, 2);
  const zoneMuProxy = document.querySelector('sl-input[data-ry-proxy-for="fld_zoneMu"]');
  if (zoneMuProxy) zoneMuProxy.value = fmt(zoneMu, 2);
  const derivedSide = Math.max(1, zoneAreaM2 / fixedSide);
  const A = fixedSide;
  const B = derivedSide;
  document.getElementById('fld_A').value = Math.round(A);
  document.getElementById('fld_B').value = Math.round(B);
  document.getElementById('fld_N').value = 1;
  const dh = window.RyTerrain ? window.RyTerrain.resolveDh(readNumber('fld_dh', 8), false) : readNumber('fld_dh', 8);
  const zoneLayout = {cols:1,rows:1,N:1,zoneW:A,zoneH:B,zoneArea:zoneAreaM2,drawZoneW:A,drawZoneH:B};
  const N = 1;
  const tapeLen = readNumber('fld_tapeLen', 100, { min: 0.01 });
  const tapeSpacing = readNumber('fld_tapeSpacing', 1.2, { min: 0.01 });
  const tapeDh = readNumber('fld_tapeDh', 1);
  const emitterSpacing = readNumber('fld_emitterSpacing', 0.3, { min: 0.01 });
  const emitterFlow = readNumber('fld_emitterFlow', 2, { min: 0 });
  const tapeOD = readNumber('fld_tapeOD', 16, { min: 0.01 });
  const tapePressure = readNumber('fld_tapePressure', 1, { min: 0 });
  const lift = readNumber('fld_lift', 15);
  const existPressure = readNumber('fld_existPressure', 0, { min: 0 });
  const targetV = readNumber('fld_targetV', 1.5, { min: 0.01 });
  const filterLoss = readNumber('fld_filterLoss', 5, { min: 0 });
  const efficiency = readNumber('fld_efficiency', 65, { min: 1, max: 100 }) / 100;
  const branchCount = readSelectedInt('#branchGroup .selected', 2);
  const layoutSides = readSelectedInt('#layoutGroup .selected', 1);
  const branchParallelCount = branchCount * layoutSides;
  const mainPipeLen = readNumber('fld_mainPipeLen', A, { min: 0 });
  const tapeRollLen = readNumber('fld_tapeRollLen', 2000, { min: 0 });

  const totalArea = mapZoneAreas.reduce(function (sum, a) { return sum + a; }, 0);
  const totalMu = totalArea / MU_TO_SQM;
  const tapeRows = Math.max(1, Math.ceil(B / tapeSpacing));
  const segmentsPerRow = Math.max(1, Math.ceil(A / tapeLen));
  const totalTapes = tapeRows * segmentsPerRow;
  const tapeTotalLen = totalArea / tapeSpacing;
  const tapeRolls = tapeRollLen > 0 ? Math.ceil(tapeTotalLen * 1.1 / tapeRollLen) : 0;
  const tapesPerZone = Math.max(1, Math.ceil(totalTapes / N));

  const zoneTapeLen = zoneAreaM2 / tapeSpacing;
  const emittersPerTape = tapeLen / emitterSpacing;
  const tapeFlow = emittersPerTape * emitterFlow / 1000;
  const zoneFlow = zoneTapeLen / emitterSpacing * emitterFlow / 1000;

  const mainPipe = selectPipe(zoneFlow, targetV, MAIN_PIPE_MIN_OD);
  const mainLoss = hazenWilliams(mainPipeLen, zoneFlow, mainPipe.id);

  const branchFlow = zoneFlow / branchParallelCount;
  // 支管长度按垂直于滴灌带的分区跨度折算；滴灌带分段只影响接头数量，不应放大支管长度。
  const branchSpan = B;
  const branchLen = branchSpan / (branchCount * layoutSides);
  const tapsPerBranch = Math.ceil(tapesPerZone / branchParallelCount);
  const branchF = christiansenF(tapsPerBranch);
  const branchPipe = selectPipe(branchFlow, targetV, 0, BRANCH_PIPE_MAX_OD);
  const branchLossRaw = hazenWilliams(branchLen, branchFlow, branchPipe.id);
  const branchLoss = branchLossRaw * branchF;

  const tapeID = tapeOD * 0.8;
  const tapeLossRaw = hazenWilliams(tapeLen, tapeFlow, tapeID);
  const tapeF = christiansenF(emittersPerTape);
  const tapeLoss = tapeLossRaw * tapeF;
  const tapePressureM = tapePressure * 10.2;
  const tapeDeltaPct = tapePressureM > 0 ? (tapeLoss / tapePressureM) * 100 : 0;

  const headBeforeSafetyRaw = lift + dh + tapePressureM - existPressure * 10.2 + mainLoss + branchLoss + filterLoss + MARGIN_HEAD;
  const headBeforeSafety = Math.max(0, headBeforeSafetyRaw);
  const pumpHead = RyDesignCore.head(headBeforeSafety, 0, 0, SAFETY_FACTOR);

  const pumpPower = RyDesignCore.power(zoneFlow, pumpHead, efficiency);
  const motorKW = selectMotorPower(pumpPower);
  const motorKW_rounded = motorKW;

  const intensity = zoneMu > 0 ? zoneFlow / zoneMu : 0;

  const mainAll = evaluateAllPipes(zoneFlow, MAIN_PIPE_MIN_OD);
  const branchAll = evaluateAllPipes(branchFlow, 0, BRANCH_PIPE_MAX_OD);

  const branchAlternatives = [2, 3, 4].map(n => {
    const bf = zoneFlow / (n * layoutSides);
    const bl = branchSpan / (n * layoutSides);
    const bt = Math.ceil(tapesPerZone / (n * layoutSides));
    const bfVal = christiansenF(bt);
    const bp = selectPipe(bf, targetV, 0, BRANCH_PIPE_MAX_OD);
    const blRaw = hazenWilliams(bl, bf, bp.id);
    const blVal = blRaw * bfVal;
    return { n, flow: bf, len: bl, taps: bt, pipe: bp, loss: blVal };
  });

  return {
    A, B, dh, N, zoneCols: zoneLayout.cols, zoneRows: zoneLayout.rows, zoneW: zoneLayout.zoneW, zoneH: zoneLayout.zoneH,
    tapeLen, tapeSpacing, tapeDh, emitterSpacing, emitterFlow, tapeOD, tapePressure,
    lift, existPressure, targetV, filterLoss, efficiency, branchCount, branchParallelCount, mainPipeLen,
    totalArea, totalMu, zoneMu,
    tapeRows, segmentsPerRow, totalTapes, tapesPerZone, tapeRollLen, tapeTotalLen, tapeRolls, zoneTapeLen,
    emittersPerTape, tapeFlow, zoneFlow,
    mainPipe, mainLoss,
    branchPipe, branchLoss, branchFlow, branchLen, branchSpan, layoutSides, tapsPerBranch, branchF,
    tapeID, tapeLoss, tapePressureM, tapeDeltaPct,
    headBeforeSafetyRaw, headBeforeSafety, pumpHead, pumpPower, motorKW, motorKW_rounded,
    intensity, mainAll, branchAll, branchAlternatives
  };
}

// ===== RENDER =====
function fmt(n, d=2) { return n.toFixed(d); }
function fmt0(n) { return Math.round(n).toLocaleString(); }
function branchCountLabel(perSide, sides) {
  return sides > 1 ? `${perSide} 根/侧（每区合计 ${perSide * sides} 根）` : `${perSide} 根/区`;
}

// material prices persist across re-renders

function render() {
  const r = compute();
  window._r = r;
  if (!r) {
    var panel = document.getElementById('resultPanel');
    if (panel) panel.innerHTML = '<p class="area-source-warning">当前地块缺少地图实测总面积或本页分区几何，设计计算已停止。请先取得地块边界与实测面积。</p>';
    return;
  }

  // 首屏 hero 已取消，原 heroSummary 渲染逻辑一并移除（同数据见下方 result-panel 的 .area-strip）
  // 02 标题栏（02 实际方案 · 实时更新）已按要求取消，内容直接从 .area-strip 开始
  // 底部数据条原有 4 条（每亩流量 / 每亩滴灌带长度 / 支管多孔折减系数 F / 扬程安全系数前），
  // 其中「支管多孔折减系数 F」「扬程安全系数前」两条中间过程值已按要求取消；
  // r.branchF / r.headBeforeSafety 计算仍在（管径表与扬程算式都在用），只是不再列出。
  // 如需恢复：在下面 </dl> 前加回
  //   <div><dt>支管多孔折减系数 F</dt><dd>${fmt(r.branchF,4)}</dd></div>
  //   <div><dt>扬程安全系数前</dt><dd>${fmt(r.headBeforeSafety,2)} m</dd></div>
  document.getElementById('resultPanel').innerHTML = `
    <div class="area-strip">
      <div><span>单个轮灌区</span><strong>${fmt(r.zoneMu,2)} 亩</strong></div>
      <div><span>单区滴灌带</span><strong>${fmt0(r.tapesPerZone)} 条</strong></div>
      <small>按单区面积试算；1 亩 = 666.67 m²，实际地块在下方绘图区落图。</small>
    </div>
    <div class="optimal-card">
      <div class="optimal-top"><span>单区流量选型结果 · 推荐管径</span><b>经济流速法</b></div>
      <div class="optimal-title">
        <strong>主管 Ø ${r.mainPipe.od} mm · 支管 ${branchCountLabel(r.branchCount, r.layoutSides)} · Ø ${r.branchPipe.od} mm</strong>
      </div>
      <div class="optimal-specs">
        <span>目标流速<b>${fmt(r.targetV,2)} m/s</b><small class="spec-note">主管按单区流量选型；阀门后的支管按 2、3 或 4 根并联分流。</small></span>
        <span>主管实际流速<b>${fmt(r.mainPipe.v,2)} m/s</b><small class="spec-note">理论内径 ${fmt(r.mainPipe.id,1)} mm · 主管长 ${fmt(r.mainPipeLen,1)} m · 损失 ${fmt(r.mainLoss,2)} m</small></span>
        <span>支管实际流速<b>${fmt(r.branchPipe.v,2)} m/s</b><small class="spec-note">${branchCountLabel(r.branchCount, r.layoutSides)} · 单根 ${fmt(r.branchLen,1)} m · ${fmt(r.branchFlow,2)} m³/h · 损失 ${fmt(r.branchLoss,2)} m</small></span>
      </div>
    </div>
    <div class="pump-card">
      <div class="pump-topline"><span>水泵建议工作点</span><span class="confidence">含 ${MARGIN_HEAD} m 富余及 ${SAFETY_FACTOR.toFixed(2)} 安全系数</span></div>
      <div class="pump-metrics">
        <div><strong>${fmt(r.zoneFlow,1)}</strong><span>m³/h 流量</span></div>
        <b>×</b>
        <div><strong>${fmt0(r.pumpHead)}</strong><span>m 扬程</span></div>
      </div>
      <div class="motor-row"><span>轴功率计算 / 建议电机</span><strong>${fmt(r.pumpPower,1)} / ${fmt0(r.motorKW_rounded)} kW</strong></div>
      <div class="motor-row"><span>滴灌带入口压力</span><strong>${fmt(r.tapePressure,2)} bar · ${fmt(r.tapePressureM,1)} m</strong></div>
      <div class="motor-row"><span>主管＋支管沿程损失</span><strong>${fmt(r.mainLoss + r.branchLoss,2)} m</strong></div>
    </div>
    <!-- 主管推荐规格 / 单根支管推荐规格 / 轮灌流量依据 三卡块（.diameter-grid）已按要求取消（2026-09-12）：
         这三卡与上方「单区流量选型结果」、左上「单个轮灌区 / 单区滴灌带」重复 ——
         Ø140 / Ø110 已在 .optimal-title 标题行、「252 条/区」已在 .area-strip、
         「单区流量 66.7 m³/h」已在 .pump-card；
         其中两段未在别处出现的细节小字（理论内径/主管长/损失、每区 N 根·单根长·流量·损失）
         已并入上一张卡「主管实际流速」「支管实际流速」两格内（.spec-note）。
         原标记整段留档如下，恢复只需去掉注释符号：
        <div class="diameter-grid">
          <article>
            <span class="metric-label">主管推荐规格</span>
            <strong>Ø ${r.mainPipe.od} mm</strong>
            <small>理论内径 ${fmt(r.mainPipe.id,1)} mm · 主管长 ${fmt(r.mainPipeLen,1)} m · 损失 ${fmt(r.mainLoss,2)} m</small>
          </article>
          <article>
            <span class="metric-label">单根支管推荐规格</span>
            <strong>Ø ${r.branchPipe.od} mm</strong>
            <small>${branchCountLabel(r.branchCount, r.layoutSides)} · 单根 ${fmt(r.branchLen,1)} m · ${fmt(r.branchFlow,2)} m³/h · 损失 ${fmt(r.branchLoss,2)} m</small>
          </article>
          <article>
            <span class="metric-label">轮灌流量依据</span>
            <strong>${fmt0(r.tapesPerZone)} 条/区</strong>
            <small>单区折算 ${fmt(r.zoneW,0)}×${fmt(r.zoneH,0)} m · 单区流量 ${fmt(r.zoneFlow,1)} m³/h</small>
          </article>
        </div>
    -->
    <div class="branch-compare">
<div class="branch-compare-title"><span>分区阀门后支管方案对比</span><small>点击方案即可采用</small>
        <div role="group" id="layoutGroup" class="layout-inline">
          <button type="button" data-sides="1" class="${r.layoutSides===1?'selected':''}" onclick="setLayoutSides(1)">单边</button>
          <button type="button" data-sides="2" class="${r.layoutSides===2?'selected':''}" onclick="setLayoutSides(2)">双边</button>
        </div>
      </div>
      <div class="branch-compare-head"><span>方案</span><span>单根长度</span><span>单根流量</span><span>推荐规格</span></div>
      ${r.branchAlternatives.map(alt => `
        <button type="button" class="branch-option ${alt.n === r.branchCount ? 'selected' : ''}" onclick="selectBranch(${alt.n})">
          <strong>${branchCountLabel(alt.n, r.layoutSides)}</strong>
          <span>${fmt(alt.len,1)} m</span>
          <span>${fmt(alt.flow,2)} m³/h</span>
          <b>Ø ${alt.pipe.od} mm</b>
        </button>
      `).join('')}
      <!-- 「每根支管最多连接 ceil(单区滴灌带数/支管根数) 条滴灌带；主管和水泵仍按单区总流量计算。」已按要求取消 -->
    </div>
    <dl class="result-list result-list-compact">
      <div><dt>每亩流量</dt><dd>${fmt(r.zoneFlow / r.zoneMu, 2)} m³/h·亩</dd></div>
      <div><dt>每亩滴灌带长度</dt><dd>${fmt(r.zoneTapeLen / r.zoneMu, 1)} m/亩</dd></div>
    </dl>
  `;

  // Pipe Tables
  // 子表标题右侧的规格标签「PE100 · PN0.4 · SDR13.6」已按要求取消。
  // 恢复：在 .pipe-table-title 内的 <div><h3>…</h3><p>…</p></div> 之后补回
  //       <span>PE100 · PN0.4 · SDR13.6</span>（样式 .pipe-table-title>span 仍保留）。
  // 注：隐藏的三级视图 renderTLTable 内还留有一份，未动。
  const renderTable = (title, subtitle, spec, data, recommendedOd, L) => {
    const recIdx = data.findIndex(d => d.od === recommendedOd);
    const view = recIdx >= 0 ? data.slice(Math.max(0, recIdx - 3), Math.min(data.length, recIdx + 4)) : data;
    const rows = view.map(d => {
      const isRec = d.od === recommendedOd;
      const loss = hazenWilliams(L, spec === 'main' ? r.zoneFlow : r.branchFlow, d.id);
      const status = pipeStatusLabel(d.v, isRec);
      const cls = pipeStatusClass(d.v, isRec);
      const rowClass = isRec ? 'recommended-row' : '';
      return `<tr class="${rowClass}">
        <td>Ø ${d.od} mm</td>
        <td>${fmt(d.id,1)} mm</td>
        <td>${fmt(d.v,2)} m/s</td>
        <td>${fmt(loss,2)} m</td>
        <td><span class="pipe-status ${cls}">${status}</span></td>
      </tr>`;
    }).join('');
    return `<article class="pipe-table-card">
      <div class="pipe-table-title">
        <div><h3>${title}</h3><p>${subtitle}</p></div>
      </div>
      <div class="table-scroll">
        <table class="selection-table">
          <thead><tr><th>规格（外径）</th><th>理论内径</th><th>流速</th><th>沿程损失</th><th>判定</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </article>`;
  };

  // 管径查询区标题栏（PE · 主管、支管管径选型对比表）已按要求取消；
  // 各子表内的「主管 / 支管管径选型对比」小标题保留，用于区分两张表；
  // 卡片底部的 .pipe-table-note 计算依据说明（理论内径按 d=外径×(1−2/13.6) 估算…
  // 以厂家资料为准）已按要求取消 —— 计算内核仍按 SDR13.6 公式执行，不影响结果。
  document.getElementById('pipeTablesSection').innerHTML = `
    <div class="container">
      <div class="pipe-table-grid">
        ${renderTable('主管管径选型对比', `主管长 ${fmt(r.mainPipeLen,1)} m · 单区流量 ${fmt(r.zoneFlow,2)} m³/h · 不折减`, 'main', r.mainAll, r.mainPipe.od, r.mainPipeLen)}
        ${renderTable('支管管径选型对比', `当前 ${branchCountLabel(r.branchCount, r.layoutSides)} · 单根长 ${fmt(r.branchLen,1)} m · 单根流量 ${fmt(r.branchFlow,2)} m³/h · F=${fmt(r.branchF,4)}`, 'branch', r.branchAll, r.branchPipe.od, r.branchLen)}
      </div>
    </div>
  `;

  // Network Diagram - linear horizontal
  const zoneLines = [];
  for (let z = 1; z <= r.N; z++) {
    zoneLines.push(`
      <div class="zone-linear">
        <div class="valve-connector"></div>
        <div class="zone-tap"><i></i><span>阀 ${z}</span></div>
        <div class="zone-branch-line">
          ${Array.from({length: r.branchParallelCount}, () => `<div class="zone-branch"></div>`).join('')}
        </div>
        <div class="zone-info">
          <strong>第 ${z} 区</strong>
          <span>${fmt0(r.tapesPerZone)} 条 · ${fmt(r.zoneFlow,1)} m³/h</span>
        </div>
      </div>
    `);
  }

  document.getElementById('networkSection').innerHTML = `
    <div class="container">
      <div class="network-heading">
        <div class="detail-heading">
          <span class="step">04</span>
          <div>
            <h2>管网布置示意图</h2>
      <p>主管沿 A 方向；轮灌区一边固定为「滴灌带铺设长度」＝面板「单边铺设长度」（默认 100m，可调），另一边由单区面积除以该值折算。</p>
          </div>
        </div>
        <div class="network-legend">
          <span><i class="legend-main"></i>主管</span>
          <span><i class="legend-branch"></i>支管</span>
          <span><i class="legend-tape"></i>滴灌带</span>
          <span><i class="legend-valve"></i>阀门</span>
        </div>
      </div>
      <div class="network-card">
        <div class="network-entry">
          <div class="water-source"><svg class="svg-icon"><use href="#icon-water"/></svg>水源</div>
          <div class="entry-pipe"></div>
          <div class="pump-node"><span>水泵</span><strong>${fmt(r.zoneFlow,1)} m³/h</strong><small>${fmt0(r.pumpHead)} m · ${fmt(r.pumpPower,1)} kW</small></div>
          <div class="entry-pipe" style="position:relative"><span class="main-label">主管 Ø ${r.mainPipe.od} mm · 主管长 ${fmt(r.mainPipeLen,1)} m</span></div>
        </div>
        <div class="field-plan-head">
          <div><span>地块俯视图</span><strong>A ${r.A} × B ${r.B} m</strong></div>
          <small>${fmt(r.totalMu,2)} 亩 · ${r.N} 个轮灌区</small>
        </div>
        <div class="diagram-shell">
          <span class="main-pipe-label">主管</span>
          <div class="main-pipe-vertical"></div>
          <div class="zones-linear">${zoneLines.join('')}</div>
        </div>
        <div class="network-summary">
          <div><span>主管</span><strong>Ø ${r.mainPipe.od} mm</strong><small>主管长 ${fmt(r.mainPipeLen,1)} m</small></div>
          <div><span>支管</span><strong>${r.branchParallelCount * r.N} 根</strong><small>${branchCountLabel(r.branchCount, r.layoutSides)} · 单根 ${fmt(r.branchLen,1)} m</small></div>
          <div><span>滴灌带</span><strong>${fmt0(r.totalTapes)} 条</strong><small>单条 ${fmt(r.tapeLen,1)} m · ${r.tapeRolls} 卷</small></div>
          <div><span>分区阀门</span><strong>${r.N} 套</strong><small>每区独立控制</small></div>
        </div>
        <p class="network-caption">示意图用于表达连接关系，不代表施工比例；实际走向应结合水源位置、现场高程和田间道路调整。</p>
      </div>
    </div>
  `;

  // Details

  const suggestions = [];
  if (r.tapeDeltaPct > 50) suggestions.push(`滴灌带沿线估算压差约 ${fmt0(r.tapeDeltaPct)}%；仅用于均匀性校核，不计入水泵扬程。建议缩短滴灌带长度、增大内径或采用压力补偿滴头。`);
  if (r.mainLoss > 8) suggestions.push(`主管沿程损失为 ${fmt(r.mainLoss,1)} m；可在经济流速范围内降低目标流速，选择更大管径。`);
  const materialPipeSpecs = getMaterialPipeSpecs(r);
  // 施工简图数据传导：主管/支管长度优先取施工简图实际绘制（未遮蔽）管线长度；滴灌带不在施工简图布置，按总面积÷滴灌带间距直接传导；无数据时回退理论计算值
  const ppStats = (typeof window.ppGetMaterialStats === 'function') ? window.ppGetMaterialStats() : {mainLen:0,branchLen:0,hasPipes:false};
  const usePP = !!(ppStats && ppStats.hasPipes);
  /* v142（2026-09-23 用户要求）：材料清单数据从三级简图获取——
     总/主/支管长度 = tlFigParamLines().lens（全地块实际用量：AE 有效几何逐段累加，含图面改长/改径/平移；
     无图面时内部退回 r.*LenUsed 试算值）；管径 = ods（图面改径按管长加权的实际代表径，无改径退回设计值）；
     主管根数 = 图上分区数（mainPipes.length，每区一根主管）。主管/支管在无三级图面时维持原口径
     （二级施工简图统计 -> 理论值），已有行为不变；总管行无二级来源，始终取三级口径。 */
  var tlMat = null, tlMains = 0;
  try {
    if (typeof computeThreeLevel === 'function' && window.tlFigParamLines) {
      var rr3 = computeThreeLevel();
      if (rr3 && rr3.frontPipe) tlMat = window.tlFigParamLines(rr3);
    }
  } catch (eTlMat) { tlMat = null; }
  try { if (window.tlDiagramData && window.tlDiagramData.mainPipes) tlMains = window.tlDiagramData.mainPipes.length; } catch (eTlN) { tlMains = 0; }
  /* v162：材料清单只统计「未被遮蔽」的内容 —— 分区阀 / 主管接入三通 / 总管接入阀数量都按
     未遮蔽主管段数走。★ tlMainsAll 是「图上有没有主管」的判据：全遮蔽时必须落到 0，
     不能因为 tlMains 归零就回退 r.N 理论分区数（那正是「遮蔽了还在算」）。 */
  var tlMainsAll = tlMains;
  try {
    var tlMc = (typeof window.tlMainCounts === 'function') ? window.tlMainCounts() : null;
    if (tlMc && tlMc.all > 0) tlMains = tlMc.visible;
  } catch (eTlMc) { }
  const useTl = !!(tlMat && tlMat.lens && window.tlDiagramData);
  /* [v570] 水源→总管近端三通那条直线也计入总管长度（原来只画不算）：与图面所见一致 */
  const srcLinkLen = (typeof window.tlSourceLinkLen === 'function') ? window.tlSourceLinkLen() : 0;
  const matFrontLen = ((tlMat && tlMat.lens && isFinite(tlMat.lens.front)) ? tlMat.lens.front : (r.mainPipeLen || 0)) + srcLinkLen + readNumber('planSrcDist', 0, { min: 0 });   /* 任务⑮：水源连接段 + 水源距离 */
  const matMainLen = useTl ? tlMat.lens.main : (usePP ? ppStats.mainLen : r.mainPipeLen);
  const matBranchLen = useTl ? tlMat.lens.branch : (usePP ? ppStats.branchLen : r.branchLen * r.branchParallelCount * r.N);
  const specFrontOd = tlMat ? tlMat.ods.front : materialPipeSpecs.mainPipeOD;
  const specMainOd = useTl ? tlMat.ods.main : materialPipeSpecs.mainPipeOD;
  const specBranchOd = useTl ? tlMat.ods.branch : materialPipeSpecs.branchPipeOD;
  const zoneValveN = tlMainsAll > 0 ? tlMains : r.N;   /* v162：判据用图上总段数、取值用未遮蔽段数 */
  /* [v553] 最外一排（789 / 28/29/30 区）主管末端改 90°弯头：
     该处**不再用分区三通** ⇒ 分区三通 = zoneValveN − 末端弯头数；新增一行「主管末端 90°弯头」。
     计数取自三级图面快照的阀门标记 v.elbow（生成时随阀门一起落地，见 v553 生成段），
     并按所属主管段（v.mi）的遮蔽态剔除（与 v162「遮蔽不计入材料」同一口径）；
     阀门数量不变（末端弯头后面照样接阀门）。 */
  var zoneElbowN = 0;
  try {
    var tlVAll = (window.tlDiagramData && window.tlDiagramData.valves) ? window.tlDiagramData.valves : [];
    for (var tlv = 0; tlv < tlVAll.length; tlv++) {
      var tv = tlVAll[tlv];
      if (!tv || !tv.elbow) continue;
      if (tv.mi != null && typeof window.tlIsPipeHidden === 'function' && window.tlIsPipeHidden('main-' + tv.mi)) continue;
      zoneElbowN++;
    }
  } catch (eElbN) { zoneElbowN = 0; }
  const zoneTeeN = Math.max(0, zoneValveN - zoneElbowN);
  const zoneElbowSpec = useTl ? ('\u00d8 ' + specMainOd + ' mm') : ('\u00d8 ' + materialPipeSpecs.mainPipeOD + ' mm');
  const zoneValveSpec = useTl ? ('\u00d8 ' + specMainOd + ' \u00d7 \u00d8 ' + specBranchOd + ' mm') : ('\u00d8 ' + materialPipeSpecs.mainPipeOD + ' mm');
  const teeSpec = useTl ? ('\u00d8 ' + specFrontOd + ' \u00d7 \u00d8 ' + specMainOd + ' mm') : '\u2014';
  /* v143（用户纠偏）：三通=总管×主管、每根物理主管 1 个（图上 2 根主管=2 套，不是 20）；
     总管接入阀同行同数量（阀门接在主管上）。分区阀仍按分区数（tlMains）不变。 */
  /* v162：物理主管归并计数也剔掉被遮蔽的主管段（同排共线多段里有一段被遮蔽 → 那一段不算） */
  const mainLineN = (useTl && typeof window.tlMainLineCount === 'function')
    ? window.tlMainLineCount((typeof window.tlVisibleMainPipes === 'function') ? window.tlVisibleMainPipes() : window.tlDiagramData.mainPipes)
    : 0;
  const teeN = mainLineN;
  const matTotalMu = r.totalMu || 0;
  // 滴灌带长度按地图实测总面积计算；间距优先施工简图输入、回退设计参数
  const ppTapeSpEl = document.getElementById('planTapeSpacing');
  const matTapeSpacing = parseFloat(ppTapeSpEl ? ppTapeSpEl.value : '') || r.tapeSpacing || 0.8;
  const matTapeLen = (matTotalMu > 0 && matTapeSpacing > 0) ? (matTotalMu * 666.67) / matTapeSpacing : r.tapeTotalLen;
  const permuOf = function(len) { return matTotalMu > 0 ? (len / matTotalMu).toFixed(1) : '0'; };
  /* v151（2026-09-28 用户要求）：材料清单统计「节点配件」——三级管网编辑里手动插入的节点
     （RyTlNodes 红点容器）上勾选的三通/阀门/45°/90°弯头，按「所在管（图面改径后）直径」出规格：
     总管 225 上勾弯头 → Ø225 弯头；主管 180 上勾三通 → Ø225 × Ø180 三通（变径三通）；
     主管节点处总/主管径不同且勾了弯头/阀门 → 另补 1 条「变径 Ø总→Ø主」（三通规格已含两档径，不重复补）；
     支管上的三通按 Ø主 × Ø支。同类型同规格合并数量，单价可填并计入材料总计。
     无节点 / 图面未生成时整段为空串，材料表维持原样。整段删除即卸载本功能。 */
  var nodeFitRows = '';
  var rrMat=computeThreeLevel(),pipeBuckets=useTl&&rrMat?RyMaterialAudit.buckets(window.tlDiagramData,rrMat,window.RyTlAutoEdits,window.tlIsPipeHidden,window.tlFrontVisibleRatio(),window.RyTlEditPipes?window.RyTlEditPipes.list():[]):null;
  if(pipeBuckets&&rrMat){var extraSrc=readNumber('planSrcDist',0,{min:0});if(extraSrc>0){var srcBucket=pipeBuckets.front.find(q=>q.od===rrMat.frontPipe.od);if(!srcBucket){srcBucket={od:rrMat.frontPipe.od,len:0};pipeBuckets.front.push(srcBucket);}srcBucket.len+=extraSrc;}}
  try {
    if (rrMat && window.RyTlNodes && typeof window.RyTlNodes.list === 'function') {
      var ndList = window.RyTlNodes.list() || [];
      if (ndList.length) {
        var ndCals = null;
        try { if (window.RyTlAutoEdits && typeof window.RyTlAutoEdits.calibersMap === 'function' && window.tlDiagramData) ndCals = window.RyTlAutoEdits.calibersMap() || null; } catch (eNdCal) { ndCals = null; }
        var ndOdOf = function (pid) {
          try { if (ndCals && ndCals[pid]) return ndCals[pid]; } catch (eNd0) {}
          var ps = String(pid || '');
          if (ps === 'front') return rrMat.frontPipe.od;
          if (ps.indexOf('main-') === 0) return rrMat.mainPipe.od;
          if (ps.indexOf('branch-') === 0) return rrMat.branchPipe.od;
          return null;
        };
        var ndBuckets = {}, ndOrder = ['tee', 'valve', 'elbow45', 'elbow90', 'reducer'];
        var ndBump = function (k, name, spec, qty) {
          var key = k + '|' + spec;
          if (!ndBuckets[key]) ndBuckets[key] = { k: k, name: name, spec: spec, qty: 0 };
          ndBuckets[key].qty += qty;
        };
        ndList.forEach(function (nd) {
          if (!nd || !nd.pid) return;
          if (RyMaterialAudit.nodeHidden(nd)) return;   /* v162：挂在遮蔽管上的节点配件不计入 */
          var hostOd = ndOdOf(nd.pid); if (hostOd == null) return;
          var ps = String(nd.pid);
          var role = ps === 'front' ? 'front' : (ps.indexOf('main-') === 0 ? 'main' : (ps.indexOf('branch-') === 0 ? 'branch' : ''));
          var f = nd.fittings || {};
          var nT = f.tee || 0, nV = f.valve || 0, n45 = f.elbow45 || 0, n90 = f.elbow90 || 0;
          if (nT > 0) ndBump('tee', '三通（节点）', role === 'branch' ? ('Ø ' + ((ndCals&&ndCals['main-'+ps.slice(7)])||rrMat.mainPipe.od) + ' × Ø ' + hostOd + ' mm') : ('Ø ' + rrMat.frontPipe.od + ' × Ø ' + hostOd + ' mm'), nT);
          if (nV > 0) ndBump('valve', '阀门（节点）', 'Ø ' + hostOd + ' mm', nV);
          if (n45 > 0) ndBump('elbow45', '45°弯头（节点）', 'Ø ' + hostOd + ' mm', n45);
          if (n90 > 0) ndBump('elbow90', '90°弯头（节点）', 'Ø ' + hostOd + ' mm', n90);
          /* 变径：主管节点 + 总/主管径不同 + 有弯头/阀门（连接件）→ 每节点补 1 套 */
          if (role === 'main' && Math.abs(Number(nd.atM)||0)<0.01 && Number(rrMat.frontPipe.od)!==Number(hostOd) && (nV+n45+n90)>0) {
            ndBump('reducer', '变径（节点）', 'Ø ' + rrMat.frontPipe.od + ' → Ø ' + hostOd + ' mm', 1);
          }
        });
        var ndRows = [];
        ndOrder.forEach(function (k) {
          Object.keys(ndBuckets).forEach(function (key) {
            if (key.indexOf(k + '|') !== 0) return;
            var b = ndBuckets[key];
            var dk = 'nodeFit-' + k+'-'+encodeURIComponent(b.spec);
            ndRows.push('<tr data-key="' + dk + '" data-qty="' + b.qty + '">'
              + '<td>' + matEsc(b.name) + '</td><td>' + matEsc(b.spec) + '</td><td><span class="qty-text">' + b.qty + '</span><span class="unit-tag">套</span></td>'
              + '<td><input class="price-input" type="text" inputmode="decimal" min="0" step="1" placeholder="0" value="' + matEsc(matPriceVal(dk)) + '"><span class="unit-tag">元/套</span></td>'
              + '<td class="total-cell">—</td>'
              + '<td class="permu-cell">—</td>'
              + matRowTail(dk) + '</tr>');
          });
        });
        if (ndRows.length) nodeFitRows = ndRows.join('');
      }
    }
  } catch (eNdFit) { nodeFitRows = ''; }

  /* v168（2026-10-01 用户要求「材料表统计的时候把手动增加的管线要统计进去」）：
     三级工作区「节点连线」（RyTlNodes.links，画布紫色 L-## 线，含同管连线与跨管连线）
     按图面选定管径 od 分桶计入材料清单。长度口径 = linkStats() 的有效几何
     （同管 = AE 改长后弧长差；跨管 = 两节点平面距离），与其它行一致 ×1.1 余量；
     未定径（od 为空）单独一行提示补选；宿管整管被遮蔽时该连线不计入（对齐节点配件口径）。
     只补料、不动水力（红线：节点连线层不进水力计算）。整段删除即卸载本功能。 */
  var nodeLinkRows = '';
  try {
    if (window.RyTlNodes && typeof window.RyTlNodes.linkStats === 'function') {
      var lkList = window.RyTlNodes.linkStats() || [];
      var lkBuckets = {}, lkOrder = [];
      var lkBump = function (od, len) {
        var key = (od == null) ? 'na' : String(od);
        if (!lkBuckets[key]) { lkBuckets[key] = { od: od, len: 0 }; lkOrder.push(key); }
        lkBuckets[key].len += len;
      };
      lkList.forEach(function (st) {
        if (!st || !(st.len > 0)) return;
        if(RyMaterialAudit.nodeHidden({pid:st.pidA||st.pid,atM:st.atA})||RyMaterialAudit.nodeHidden({pid:st.pidB||st.pid,atM:st.atB}))return;   /* 宿管整管遮蔽 → 不计入 */
        lkBump(st.od, st.len);
      });
      var lkRows = [];
      lkOrder.forEach(function (key) {
        var b = lkBuckets[key];
        var q = b.len * 1.1;
        var dk = 'nodeLink-' + key;
        var spec = (b.od == null) ? '未定径（点连线可选 Ø）' : ('Ø ' + b.od + ' mm');
        lkRows.push('<tr data-key="' + dk + '" data-qty="' + q.toFixed(1) + '">'
          + '<td>连接管（节点连线）</td><td>' + spec + '</td>'
          + '<td><span class="qty-text">' + q.toFixed(1) + '</span><span class="unit-tag">m</span></td>'
          + '<td><input class="price-input" type="text" inputmode="decimal" min="0" step="0.1" placeholder="0" value="' + matEsc(matPriceVal(dk)) + '"><span class="unit-tag">元/m</span></td>'
          + '<td class="total-cell">—</td>'
          + '<td class="permu-cell">—</td>'
          + matRowTail(dk) + '</tr>');
      });
      if (lkRows.length) nodeLinkRows = lkRows.join('');
    }
  } catch (eLkRow) { nodeLinkRows = ''; }


  var autoFits=useTl?RyMaterialAudit.autoFittings(window.tlDiagramData,rrMat,window.RyTlAutoEdits):null;
  function pipeMaterialRows(kind,key,label,fallbackLen,od){
    var list=pipeBuckets?pipeBuckets[kind]:[{od:od,len:fallbackLen}];if(!list.length)list=[{od:od,len:0}];
    return list.map(function(v){var dk=list.length===1?key:key+'-od-'+v.od,q=+(v.len*1.1).toFixed(1),pm=matTotalMu>0?(q/matTotalMu).toFixed(1):'0';
      return '<tr data-key="'+dk+'" data-od="'+v.od+'" data-qty="'+q+'" data-permu="'+pm+'"><td>'+label+'</td><td>Ø '+v.od+' mm</td><td><span class="qty-text">'+q+'</span><span class="unit-tag">m</span></td><td><input class="price-input" type="text" inputmode="decimal" value="'+matEsc(matPriceVal(dk,v.od))+'"><span class="unit-tag">元/m</span></td><td class="total-cell">—</td><td class="permu-cell">—</td>'+matRowTail(dk)+'</tr>';
    }).join('');
  }
  function autoFitRows(key,name,spec,n){
    /* [v553→v554 修 bug] 原写法 `autoFits?autoFits[key]:[...]`：存档里存在 autoFits 但没有
       「新增管件」这个 key 时（v554 新加的 mainEndElbow 就属于这种情况）list 变 undefined，
       下一行 `!list.length` 直接抛错 ⇒ **整张材料表渲染失败**（A/B 基线抓到：基线无异常、
       新版 render() 抛 Cannot read properties of undefined）。改成「取不到就回退默认行」。 */
    var list=(autoFits&&autoFits[key])?autoFits[key]:[{spec:spec,qty:n}];
    if(!list||!list.length)list=[{spec:spec,qty:n}];
    return list.map(function(b){var dk=list.length===1?key:key+'-spec-'+encodeURIComponent(b.spec);return '<tr data-key="'+dk+'" data-qty="'+b.qty+'"><td>'+name+'</td><td>'+matEsc(b.spec)+'</td><td><span class="qty-text">'+b.qty+'</span><span class="unit-tag">套</span></td><td><input class="price-input" type="text" inputmode="decimal" value="'+matEsc(matPriceVal(dk))+'"><span class="unit-tag">元/套</span></td><td class="total-cell">—</td><td class="permu-cell">—</td>'+matRowTail(dk)+'</tr>';}).join('');
  }
  document.getElementById('detailsSection').innerHTML = `
    <div class="container">
      <!-- 标题栏（05 徽章 +「材料清单与报价估算」+ 副标题）已按要求取消，
           区块直接从材料表开始（与三级管路页 05 标题栏同一处理方式）。
           恢复：把下面这段放回本行位置即可，配套 CSS（.detail-heading / .step）仍完整保留在样式区。
           <div class="detail-heading">
             <span class="step">05</span>
             <div>
               <h2>材料清单与报价估算</h2>
               <p>按当前单区设计参数估算主要材料，输入单价后自动汇总材料费用。</p>
             </div>
           </div> -->
      <div class="detail-grid materials-only">
        <article class="materials-card">
          <div class="card-title"><h3>主要材料</h3><span>含约 10% 余量</span></div>
          <div class="mat-toolbar">
            <button type="button" id="matAddRow">＋ 添加行</button>
            <button type="button" id="matAddCol">＋ 添加列</button>
            <span class="mat-namebox" id="matNameBox" title="当前单元格坐标">A1</span>
            <span class="mat-tip">点单元格选中 · 方向键移动 · 直接键入即编辑 · Enter/Tab 提交、Esc 取消 · Delete 清空 · Ctrl+C/X/V 复制剪贴 · 拖右下角宝蓝点填充 · 在行号上右键=上/下插入行，在列头右键=左/右插入列 · 全表可编辑（手改数值会脱离水力自动算量）· =SUM(C2:C9) 公式可用</span>
          </div>
          <div class="mat-tablescroll">
          <table>
            ${matColgroup()}
            <thead><tr>${matBaseHeads()}${matExtraHeads()}</tr></thead>
            <tbody>
              ${pipeMaterialRows('front','frontPipe','总管',matFrontLen,specFrontOd)}
              ${pipeMaterialRows('main','mainPipe','主管',matMainLen,specMainOd)}
              ${pipeMaterialRows('branch','branchPipe','支管',matBranchLen,specBranchOd)}
              <tr data-key="tape" data-qty="${(matTapeLen * 1.1).toFixed(1)}" data-permu="${permuOf(matTapeLen*1.1)}">
                <td>滴灌带</td><td>Ø ${r.tapeOD} mm</td><td><span class="qty-text">${(matTapeLen * 1.1).toFixed(1)}</span><span class="unit-tag">m</span></td>
                <td><input class="price-input" type="text" inputmode="decimal" min="0" step="0.1" placeholder="0" value="${matPriceVal('tape')}"><span class="unit-tag">元/m</span></td>
                <td class="total-cell">—</td>
                <td class="permu-cell">${permuOf(matTapeLen)} m/亩 · —</td>
                ${matRowTail("tape")}
              </tr>
              <tr data-key="tapeJoint" data-qty="${Math.ceil(r.totalTapes * 1.05)}">
                <td>滴灌带接头</td><td>同滴灌带</td><td>${Math.ceil(r.totalTapes * 1.05)} 套</td>
                <td><input class="price-input" type="text" inputmode="decimal" min="0" step="0.5" placeholder="0" value="${matPriceVal('tapeJoint')}"><span class="unit-tag">元/套</span></td>
                <td class="total-cell">—</td>
                <td class="permu-cell">—</td>
                ${matRowTail("tapeJoint")}
              </tr>
              ${autoFitRows('zoneTee','分区三通',zoneValveSpec,zoneTeeN)}
              ${autoFitRows('mainEndElbow','主管末端 90°弯头',zoneElbowSpec,zoneElbowN)}
              ${autoFitRows('zoneValve','分区电动阀','Ø '+specBranchOd+' mm · 电动',zoneValveN)}
              ${autoFitRows('teeJoint','主管接入三通',teeSpec,teeN)}
              ${autoFitRows('frontValve','主管接入阀','Ø '+specMainOd+' mm',teeN)}
              ${nodeFitRows}
              ${nodeLinkRows}
              ${matCustomRowsHtml()}
            </tbody>
            <tfoot><tr><td colspan="4">材料总计</td><td class="grand-total-val">¥ 0</td><td colspan="${2 + (matTbl.extraCols || []).length}"></td></tr></tfoot>
          </table></div>
          <!-- v184（P5）：管材单价自证行 —— 由 updateMaterialTotals() 每次重算填入
               （不用 tfoot 第二行，避免与 matRebuildFoot 的 colspan 重建机制耦合） -->
          <div class="mat-selfcheck" id="matSelfCheck" aria-live="polite"></div>
        </article>
      </div>
    </div>
  `;
  /* v171：渲染后先跑公式(把单价公式算成数值)→重算合计(填 E 列)→再跑公式(让公式可引用 E) */
  try { matApplyFormulas(); } catch (e) { }
  try { updateMaterialTotals(); } catch (e) { }
  try { matApplyFormulas(); } catch (e) { }
  matSyncTableWidth();
  /* v180：铺行号槽/列标、套用用户改写、恢复选区与填充柄（tbody 刚被重建，必须最后跑） */
  try { matDecorate(); } catch (eMatDec) { }
}

function selectBranch(n) {
  document.querySelectorAll('#branchGroup button').forEach(b => b.classList.toggle('selected', +b.dataset.n === n));
  render();
}
function selectLayout(sides) {
  document.querySelectorAll('#layoutGroup button').forEach(b => b.classList.toggle('selected', +b.dataset.sides === sides));
  render();
}
/* 单边/双边已移入「支管方案对比」标题行（2026-09-15）：面板随 innerHTML 重建，走 inline onclick */
function setLayoutSides(sides) {
  selectLayout(sides);
  calcPlan();
}

function resetDefaults() {
  const defaults = {fld_zoneMu:30,fld_zoneFixedSide:200,fld_A:200,fld_B:100,fld_dh:5,fld_N:1,fld_tapeLen:100,fld_tapeSpacing:0.8,fld_tapeDh:1,fld_emitterSpacing:0.3,fld_emitterFlow:0.8,fld_tapeOD:16,fld_tapePressure:1,fld_lift:5,fld_existPressure:0,fld_targetV:1.5,fld_filterLoss:5,fld_efficiency:65,fld_mainPipeLen:200,fld_tapeRollLen:2000,planSrcDist:0};
  Object.entries(defaults).forEach(([id, val]) => { document.getElementById(id).value = val; });
  // v91：fld_lift / fld_dh 被复位后，二级面板的同名镜像框要一起跟上
  if (typeof ppPullLiftDh === 'function') ppPullLiftDh();
  document.querySelectorAll('#branchGroup button').forEach(b => b.classList.toggle('selected', +b.dataset.n === 2));
  document.querySelectorAll('#layoutGroup button').forEach(b => b.classList.toggle('selected', +b.dataset.sides === 1));
  render();
}

document.querySelectorAll('input[type="number"]').forEach(inp => {
  if (inp.closest('.materials-card')) return;
  if (inp.closest('#threeLevelView')) return;
  inp.addEventListener('input', render);
  inp.addEventListener('change', render);
});
document.querySelectorAll('#branchGroup button').forEach(btn => {
  btn.addEventListener('click', () => { selectBranch(+btn.dataset.n); calcPlan(); });
});

// ===== THREE-LEVEL PIPELINE VIEW =====
/* [v603] 支管「设计满跨 / 图面基准」的唯一取数口（满跨口径的兜底层）。
   为什么需要兜底：v602 之前生成的 tlDiagramData（旧存档、旧 localStorage 快照）没有
   branchFullSpans / branchDrawnLens 两个基准，若直接退回图面折线长度，旧项目一打开
   支管又变回 52m（吃掉两端 gapV/gapH）—— 用户口径是「留边只影响显示，永远不进计算」。
   兜底推法（纯几何、不依赖存档字段）：支管中点落在哪个分区 → 该分区在该方向上的净跨 = 满跨；
   图面基准 = 满跨 − 2×gap，gap 与生成时同一条公式 min(max(span*0.06,4),14,span*0.22)。
   返回 { full: 设计满跨, base: 图面基准长 }；几何不全时返回 null，调用方自行回退。 */
window.tlBranchSpanInfo = function (zi) {
  try {
    var d = window.tlDiagramData || {};
    var spans = d.branchFullSpans || [], drawn = d.branchDrawnLens || [];
    if (spans[zi] === -1) return null;   /* [v603] 显式标记「非满跨贯通支管」（二级分叉短管）→ 走图面长 */
    var full = (spans[zi] > 0) ? spans[zi] : 0;
    var base = (drawn[zi] > 0) ? drawn[zi] : 0;
    if (full > 0 && base > 0) return { full: full, base: base };
    var bp = (d.branchPipes || [])[zi], zs = d.zones;
    if (!bp || bp.length < 2 || !zs || !zs.xPos || !zs.yPos) {
      return (full > 0) ? { full: full, base: base || full } : null;
    }
    var a = bp[0], b = bp[bp.length - 1], frame = zs.frame;
    /* 新快照的管线使用固定世界坐标，网格线仍是局部设计坐标。
       旧快照缺少 branchFullSpans 时必须先把管线端点映回网格坐标再判区，
       否则旋转分区会让支管方向/所在区判断错位。 */
    function toGrid(p) {
      if (!frame || !frame.origin || !frame.center) return { x: p.x, y: p.y };
      var ang = (Number(frame.angle) || 0) * Math.PI / 180, c = Math.cos(ang), s = Math.sin(ang);
      var sx = Number(frame.scaleX) || 1, sy = Number(frame.scaleY) || 1;
      var dx = (p.x - frame.origin.x) * sx - frame.center.x;
      var dy = (p.y - frame.origin.y) * sy - frame.center.y;
      return { x: frame.center.x + dx * c + dy * s, y: frame.center.y - dx * s + dy * c };
    }
    a = toGrid(a); b = toGrid(b);
    var mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    var vert = Math.abs(a.x - b.x) < Math.abs(a.y - b.y);   /* 竖向支管 ⇒ 跨分区高 */
    var span = 0, E = 1e-6, i;
    if (vert) {
      for (i = 0; i + 1 < zs.yPos.length; i++) {
        if (mid.y >= zs.yPos[i] - E && mid.y <= zs.yPos[i + 1] + E) { span = zs.yPos[i + 1] - zs.yPos[i]; break; }
      }
    } else {
      for (i = 0; i + 1 < zs.xPos.length; i++) {
        if (mid.x >= zs.xPos[i] - E && mid.x <= zs.xPos[i + 1] + E) { span = zs.xPos[i + 1] - zs.xPos[i]; break; }
      }
    }
    if (!(span > 0)) return (full > 0) ? { full: full, base: base || full } : null;
    var gap = Math.min(Math.max(span * 0.06, 4), 14, span * 0.22);
    return { full: (full > 0 ? full : span), base: (base > 0 ? base : Math.max(0, span - 2 * gap)) };
  } catch (e) { return null; }
};
/* ===== [v843] 总管长度取「在线地图总管实测」 =====
   用户口径（2026-11-01）：扬程 = 在线地图总管长度 + 分区主管及支管长度。
   改之前：frontLenUsed 只按**设计图面**的 frontPipe 走到最远分区接点的弧长算（tlWorstPathLen），
   而用户在地图页亲手画的那根总管（plot.trunk）从头到尾没进过扬程 —— 两条路画出来的总管
   长度不一样，扬程自然对不上，而且用户看着地图上的线以为它已经算过了。

   口径三条：
     · 有可用地图总管 ⇒ 取它（打了 main 标记那条；没有标记就取最长一条）的实测折线长；
     · 没有 / 折点有坏点 ⇒ **原样退回**图面弧长或试算输入，并把来源标出来；
     · 水源连接段 + 水源距离照加 —— 那是「水源到总管起点」，不属于总管本体。

   ★ 为什么不在这里自己算距离：`mod/trunk-geo.js` 是经纬度测距的唯一实现（v843），
     面板上显示的总管长度也走它。两边各写一份就会出现"面板 342.6 m、扬程按 342.4 m"。
   ★ 为什么不跳过坏点硬连：跳过会让折线抄近道，长度偏小 ⇒ 扬程偏小，
     而这种偏差在矩形地块上肉眼看不出（线还是"沿着画的"）。宁可退回旧口径。 */
function tlMapTrunkLen() {
  try {
    var S = window.RyTrunkSchema, G = window.RyTrunkGeo;
    if (!S || !G || typeof G.trunkLen !== 'function') return null;
    var store = window.RyPlotLibraryStore;
    if (!store || typeof store.read !== 'function') return null;
    /* 地块锚点：地图页有地图页的（闭包里的 currentMapPlotId，走 RyMapHost 只读出口），
       三级/设计页有自己的（window.currentPlotId）。两边**完全可以不一样**。
       口径（宁撤回、不猜）：
         · 两个都有且相等 ⇒ 用
         · 两个都有但不等 ⇒ **撤回**（这根总管不属于正在算的这块地，
           任取一边都会把甲地的管长算进乙地的扬程）
         · 只有一个 ⇒ 用那一个
       ★ 别试图用 `window.currentMapPlotId`：它是 mod/online-map.js 的**闭包变量**，
         在 window 上恒为 undefined（历史上探针就栽过一次）。 */
    var a = (window.RyMapHost && typeof window.RyMapHost.currentPlotId === 'function')
      ? window.RyMapHost.currentPlotId() : null;
    var b = window.currentPlotId;
    var aid = (a === null || a === undefined || a === '') ? '' : String(a);
    var bid = (b === null || b === undefined || b === '') ? '' : String(b);
    if (aid && bid && aid !== bid) return null;
    var pid = aid || bid;
    if (!pid) return null;
    var lib = store.read();
    var plots = (lib && Array.isArray(lib.plots)) ? lib.plots : [];
    var plot = null;
    for (var i = 0; i < plots.length; i++) {
      if (plots[i] && String(plots[i].id) === String(pid)) { plot = plots[i]; break; }
    }
    if (!plot || !plot.trunk) return null;
    var doc = S.normalize(plot.trunk);
    if (!doc || !Array.isArray(doc.trunks) || !doc.trunks.length) return null;
    var L = G.trunkLen(doc.trunks);
    if (!L || !L.ok || !(L.len > 0)) return null;
    return { ok: true, len: L.len, id: L.id, source: L.source, count: L.count };
  } catch (e) { return null; }
}

/* [v1020 待办④] 段总管可用性判定（与 segWorstPath 的塌缩守卫同口径）：
   joinPts 必须覆盖每一根有效主管（mp.length≥2），且接点真落在本区主管上（投影 ≤1 m）。
   两排布局下 build 合并共线分支会把 joinPts 塌成少数共线组 ⇒ 判不可用。
   用途：tlFrontLenUse 的 segLen 兜底归零——两台最不利路径引擎都诚实返回 EMPTY 时，
   不让「段总管全长」这个假距离从扬程链后门溜回来（v1019 收口了 run，漏了 segLen）。 */
function tlSegTrunkUsable() {
  try {
    var d = window.tlDiagramData, st = d && d.segTrunk;
    if (!st || !Array.isArray(st.points) || st.points.length < 2 ||
        !Array.isArray(st.joinPts) || !st.joinPts.length || !(st.len > 0)) return false;
    var mp = d.mainPipes || [];
    for (var zi = 0; zi < mp.length; zi++) {
      var line = mp[zi];
      if (!line || line.length < 2) continue;
      var jp = st.joinPts[zi];
      if (!jp || !isFinite(jp.x) || !isFinite(jp.y)) return false;
      var best = Infinity;
      for (var j = 1; j < line.length; j++) {
        var a = line[j - 1], b = line[j], dx = b.x - a.x, dy = b.y - a.y, den = dx * dx + dy * dy;
        var t = den ? Math.max(0, Math.min(1, ((jp.x - a.x) * dx + (jp.y - a.y) * dy) / den)) : 0;
        best = Math.min(best, Math.hypot(jp.x - a.x - dx * t, jp.y - a.y - dy * t));
      }
      if (!(best <= 1)) return false;
    }
    return true;
  } catch (e) { return false; }
}

/* [v1020 待办⑤] 三级管线图是否已生成（有主管即算）——区分「没画图所以用试算输入」
   与「画了图但两台最不利路径引擎都不可用（如无地图反投数据）」，后者必须向用户明示。 */
function tlDiagramHasPipes() {
  try {
    var d0 = window.tlDiagramData;
    return !!(d0 && d0.mainPipes && d0.mainPipes.length);
  } catch (e) { return false; }
}

/* 总管长度（扬程用）的**唯一收口**。三个调用点都走这里，别各写一份三元表达式。
   返回 { len, src, mapLen, mapId }，src='mapTrunk'|'figure'|'input' —— 界面靠它标注来源：
   「总管 342.6 m（在线地图实测）」和「总管 300.0 m（设计图面）」对用户是完全不同的信息。 */
function tlFrontLenUse(wpFront, frontPipeLen, wpFromSeg) {
  var link = (typeof window.tlSourceLinkLen === 'function') ? window.tlSourceLinkLen() : 0;
  var srcDist = readNumber('planSrcDist', 0, { min: 0 });
  /* [v859] 段总管（自动生成的分区主管串联干线）计入总管长——它与手绘总管驳接后
     构成完整水路。长度读 tlDiagramData.segTrunk.len（世界坐标全长；v868 起止=首末
     主管、无外延驳接段）；段总管未生成（单区/参差）时为 0，输出与旧口径逐字节一致。 */
  var segLen = 0;
  try {
    var sd0 = window.tlDiagramData && window.tlDiagramData.segTrunk;
    /* [v1020 待办④] segLen 加塌缩守卫：段总管数据在但 joinPts 塌缩/错位（两排布局）
       ⇒ segLen 归零。此前只挡住了 run（v1019），全长 segLen 仍会经 v859 兜底分支
       叠进扬程——同一假距离的第二条通路。 */
    segLen = (sd0 && typeof sd0.len === 'number' && sd0.len > 0 && tlSegTrunkUsable()) ? sd0.len : 0;
  } catch (eSeg1) { }
  var mt = tlMapTrunkLen();
  /* [v879] 最不利路径引擎（segWorstPath）给出 wpFront = 手绘总管全长（未画则 0）
     + 沿段总管到最不利分区串联点的**部分长度** —— 段总管不再按全长叠加
     （旧口径全长近似：最不利分区不在干线末端时扬程虚高，至多虚高约半个干线跨度）。
     fromSeg=true 标记来自新引擎；engine 不可用（无段总管/单区/几何退化）时
     wpFront=0 ⇒ 兜底保持 v859 全长口径，输出与旧口径逐字节一致。 */
  if (wpFront > 0 && wpFromSeg === true) {
    if (mt && mt.ok) return { len: wpFront + link + srcDist, src: 'mapTrunk', mapLen: mt.len, mapId: mt.id, segLen: segLen };
    return { len: wpFront + (frontPipeLen || 0) + link + srcDist, src: 'input', mapLen: null, mapId: null, segLen: segLen };
  }
  if (mt && mt.ok) return { len: mt.len + link + srcDist + segLen, src: 'mapTrunk', mapLen: mt.len, mapId: mt.id, segLen: segLen };
  if (wpFront > 0) return { len: wpFront + link + srcDist + segLen, src: 'figure', mapLen: null, mapId: null, segLen: segLen };
  return { len: (frontPipeLen || 0) + link + srcDist + segLen, src: 'input', mapLen: null, mapId: null, segLen: segLen };
}

/* 最远分区最不利路径（2026-09-16 用户要求）：
   水头损失只按「水源 → 最远分区」一条路径计：总管（水源→该区接水点）+ 该区主管 + 该区支管；
   不把各地块的支管/主管全部相加。图面已生成时，长度取图面真实折线（含图面改长/平移，走 AE.effPts）；
   无图面数据时返回 fromFigure:false，由调用方退回试算输入值。
   本函数只解析「长度与分区号」，损失仍由 computeThreeLevel 按既有流量口径计算。 */
/* [v601] 支管计算长度口径（两引擎共用）：满跨 ÷（根数×敷设边数）+ 手动改长增量，
   图面两端留边不进计算。legacyWorstPath / segWorstPath / tlRoutesWorstPath 三处同式。 */
function tlBranchCalcLenOf(d, branchLens, zi) {
  var brCalcCount = readSelectedInt('#tl_branchGroup .selected', 2);
  var brCalcSides = readSelectedInt('#tl_layoutGroup .selected', 1);
  var info = (typeof window.tlBranchSpanInfo === 'function') ? window.tlBranchSpanInfo(zi) : null;
  if (!info || !(info.full > 0)) return 0;
  var now = (branchLens[zi] > 0) ? branchLens[zi] : info.base;
  var delta = Math.max(0, now - info.base);
  return (info.full + delta) / (brCalcCount * brCalcSides);
}

/* [v1019 用户拍板] 最远水路数据源 = 在线地图轮灌演示同款寻路引擎（RyMapFlowDemo.routesAll）。
   背景：段总管模型要求「一条垂直干线穿过每一根主管」，两排/多排条状布局下合并共线分支
   会把主管塌缩成少数共线组（joinPts 只剩 2 个），8 个区被静默跳过、run 是假距离
   （392×300 十区实测「最远 2 区 · 233.1 m」，真最远在右端 ≈400 m+）。
   新口径：全分区逐区走真实管道图（手绘总管+段总管反投线+主管链+支管），
   front = 干线段真实长、main = 沿主管链到该区的真实长（链式主管的过境段计入——
   旧模型只算本区自己那条，下游区被系统性低估）、branch 沿用 v601 满跨口径。
   [v1020 待办①] 长度单位统一为**图面米**：主管/段总管切片先反投重建到本地折线再求长
   （与材料清单同口径）；手绘总管（trunk:i）只存在于地图画布，保持地图经纬折算米。
   [v1020 待办③] zones[].mainSegs = 链式主管逐段 {key,len,downZi}——切片身份 (key,a,b)，
   downZi = 路径同样经过该切片的分区号集（树形拓扑下该段流量=这些分区流量和），
   流量换算在 computeThreeLevel（那里才有逐区 flow），本函数保持纯几何。 */
function tlRoutesWorstPath(needGeom, EMPTY) {
  var M = window.RyMapFlowDemo;
  if (!M || typeof M.routesAll !== 'function') return null;
  var R = M.routesAll();
  if (!R || !R.routes || !R.routes.length || !R.total) return null;
  if (R.missing && R.missing.length) return null;   /* 覆盖率守卫：缺区 ⇒ 整体放弃 */
  var d = window.tlDiagramData;
  if (!d) return null;
  function llLen(pts) {
    var L = 0;
    for (var i = 1; i < pts.length; i++) {
      var cos = Math.max(0.1, Math.cos(((pts[i - 1].lat + pts[i].lat) / 2) * Math.PI / 180));
      var dx = (pts[i].lng - pts[i - 1].lng) * 111320 * cos, dy = (pts[i].lat - pts[i - 1].lat) * 110540;
      L += Math.sqrt(dx * dx + dy * dy);
    }
    return L;
  }
  var AE = window.RyTlAutoEdits;
  /* [v1020 待办②] AE.effPts(pid, data) 第二参是整个 tlDiagramData（pid 内部查
     mainPipes/branchPipes）——v1019 曾误传折线当 data，改长/平移覆盖静默失效，已修正。 */
  function effOf(pid, pts) {
    try { if (AE && AE.effPts && pid) { var e = AE.effPts(pid, d); if (e && e.length >= 2) return e; } } catch (eE) { }
    return pts;
  }
  var branchLens = (d.branchPipes || []).map(function (bp, bi) {
    var e = effOf('branch-' + bi, bp);
    var L = 0; for (var i = 1; i < e.length; i++) L += Math.hypot(e[i].x - e[i - 1].x, e[i].y - e[i - 1].y); return L;
  });
  /* [v1020 待办①] 图面米换算基建：collect 的 toLLLine 逐点投影（同序）⇒ 切片经纬点
     投影回原始折线的（段号 i, 比例 t），再在图面米折线上取同点求长。
     反投依赖 __runyeGeoBase/__runyeMapFrameInv（与 v879 反投同一套全局量），不可用 ⇒
     sliceLen 回退地图口径 llLen（诚实降级，不出数也不出错）。 */
  var base = window.__runyeGeoBase, fInv = window.__runyeMapFrameInv;
  function localToLL(pt) {
    if (!pt || !isFinite(pt.x) || !isFinite(pt.y) || !base || typeof base.refLat !== 'number') return null;
    var x = pt.x, y = pt.y;
    if (fInv) { var dx = x - fInv.tx, dy = y - fInv.ty; x = fInv.ax * dx + fInv.bx * dy; y = fInv.ay * dx + fInv.by * dy; }
    var Rr = 6378137, mlat = Rr * Math.PI / 180, cosLat = Math.cos(base.refLat * Math.PI / 180);
    return { lat: base.refLat + y / mlat, lng: base.refLng + x / (mlat * cosLat) };
  }
  function rawLLof(localPts) {
    var out = [];
    for (var i = 0; i < localPts.length; i++) { var q = localToLL(localPts[i]); if (q) out.push(q); }
    return out.length >= 2 ? out : null;
  }
  function llSliceToLocal(rawLL, localPts, slicePts) {
    if (!rawLL || !localPts || rawLL.length !== localPts.length || !slicePts || slicePts.length < 2) return [];
    var cos0 = Math.max(0.1, Math.cos(rawLL[0].lat * Math.PI / 180));
    function xy(p) { return { x: p.lng * 111320 * cos0, y: p.lat * 110540 }; }
    var cum = [0];
    for (var i = 1; i < rawLL.length; i++) {
      var a = xy(rawLL[i - 1]), b = xy(rawLL[i]);
      cum[i] = cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y);
    }
    var outPts = [];
    slicePts.forEach(function (p) {
      var q = xy(p), best = null;
      for (var j = 1; j < rawLL.length; j++) {
        var a2 = xy(rawLL[j - 1]), b2 = xy(rawLL[j]);
        var dx = b2.x - a2.x, dy = b2.y - a2.y, den = dx * dx + dy * dy;
        var t = den ? Math.max(0, Math.min(1, ((q.x - a2.x) * dx + (q.y - a2.y) * dy) / den)) : 0;
        var px = a2.x + dx * t, py = a2.y + dy * t, dd = Math.hypot(q.x - px, q.y - py);
        if (!best || dd < best.d) best = { d: dd, i: j - 1, t: t };
      }
      if (best && best.d <= 8) {
        var lp0 = localPts[best.i], lp1 = localPts[Math.min(best.i + 1, localPts.length - 1)];
        outPts.push({ x: lp0.x + (lp1.x - lp0.x) * best.t, y: lp0.y + (lp1.y - lp0.y) * best.t });
      }
    });
    return outPts;
  }
  /* 原始折线缓存（key → {rawLL, localPts} | null）：同一线体多切片共用，反投只做一次。 */
  var rawCache = {};
  function linePairOf(key) {
    if (Object.prototype.hasOwnProperty.call(rawCache, key)) return rawCache[key];
    var localPts = null;
    if (/^main:/.test(key)) {
      var zi = parseInt(key.slice(5), 10);
      localPts = isFinite(zi) ? effOf('main-' + zi, (d.mainPipes || [])[zi]) : null;
    } else if (key === 'segment:0' && d.segTrunk && Array.isArray(d.segTrunk.points)) {
      localPts = d.segTrunk.points;
    }
    var pair = null;
    if (localPts && localPts.length >= 2) { var raw = rawLLof(localPts); if (raw) pair = { rawLL: raw, localPts: localPts }; }
    rawCache[key] = pair;   /* null 也缓存：反投不可用时不反复尝试 */
    return pair;
  }
  /* 切片求长（v1020 待办①）：手绘总管（trunk:i）无图面对应物 ⇒ 地图口径；
     主管/段总管切片本地重建（点数不丢才算成功）⇒ 图面米；失败 ⇒ 回退 llLen。 */
  function sliceLen(s) {
    if (/^trunk:/.test(s.key)) return llLen(s.points);
    var pair = linePairOf(s.key);
    if (!pair) return llLen(s.points);
    var loc = llSliceToLocal(pair.rawLL, pair.localPts, s.points);
    if (loc.length !== s.points.length || loc.length < 2) return llLen(s.points);
    var L = 0;
    for (var i = 1; i < loc.length; i++) L += Math.hypot(loc[i].x - loc[i - 1].x, loc[i].y - loc[i - 1].y);
    return L;
  }
  /* [v1020 待办③] 切片身份 → 下游分区号集：同一物理 edge（key,a,b 全等）被哪些分区的
     路径共享，过境段流量 = 这些分区的流量和（树形拓扑严格成立）。 */
  var edgeZones = {};
  R.routes.forEach(function (rt) {
    rt.main.forEach(function (s) {
      var id = s.key + '#' + s.a + '#' + s.b;
      (edgeZones[id] || (edgeZones[id] = [])).push(rt.zi);
    });
  });
  var byZi = {}, zones = [], taps = [];
  R.routes.forEach(function (rt) {
    var tL = 0; rt.trunk.forEach(function (s) { tL += sliceLen(s); });
    var mL = 0; rt.main.forEach(function (s) { mL += sliceLen(s); });
    var prev = byZi[rt.zi], tot = tL + mL;
    if (!prev || tot > prev.totTrunkMain) byZi[rt.zi] = { zi: rt.zi, totTrunkMain: tot, front: tL, main: mL, rt: rt };
  });
  Object.keys(byZi).forEach(function (k) {
    var z = byZi[k];
    var bl = tlBranchCalcLenOf(d, branchLens, z.zi);
    taps.push({ zi: z.zi, run: z.front });
    /* [v1020 待办③] 逐段序列按路径顺序（rt.main 即 Dijkstra 重建序），len 与 main 同源
       （同一批 sliceLen），downZi 交给 computeThreeLevel 换算组合流量。 */
    var mainSegs = z.rt.main.filter(function (s) { return /^main:/.test(s.key); }).map(function (s) {
      return { key: s.key, len: sliceLen(s), downZi: (edgeZones[s.key + '#' + s.a + '#' + s.b] || [z.zi]).slice() };
    });
    zones.push({ zi: z.zi, run: z.front, main: z.main, branch: bl, mainSegs: mainSegs });
  });
  taps.sort(function (a, b) { return a.run - b.run; });
  var worst = null;
  zones.forEach(function (z) {
    var tot = z.run + z.main + z.branch;
    if (!worst || tot > worst.totPath) worst = { totPath: tot, z: z };
  });
  if (!worst) return null;
  var out = { fromFigure: true, fromSeg: true, fromRoutes: true, zoneIndex: worst.z.zi,
    front: worst.z.run, main: worst.z.main, branch: worst.z.branch, link: 0, taps: taps, zones: zones };
  if (needGeom) {
    /* 标注几何重建：重建基建（llSliceToLocal/localToLL/rawLLof）已上移到函数顶部与求长
       共用（v1020 待办①）；手绘总管（trunk:i）只存在于地图画布、无图面对应物 ⇒
       沿 v879 口径「计入长度不画」。 */
    var geomMain = [], geomFront = [];
    R.routes.forEach(function (rt) {
      if (rt.zi !== worst.z.zi) return;
      rt.main.forEach(function (s) {
        if (/^main:/.test(s.key)) {
          var zi = parseInt(s.key.slice(5), 10);
          var mp = effOf('main-' + zi, d.mainPipes[zi]);
          if (mp && mp.length >= 2) {
            var seg = llSliceToLocal(rawLLof(mp), mp, s.points);
            if (seg.length >= 2 && geomMain.length &&
                Math.abs(seg[0].x - geomMain[geomMain.length - 1].x) < 1e-6 &&
                Math.abs(seg[0].y - geomMain[geomMain.length - 1].y) < 1e-6) seg.shift();
            geomMain = geomMain.concat(seg);
          }
        }
      });
      rt.trunk.forEach(function (s) {
        if (s.key === 'segment:0' && d.segTrunk && Array.isArray(d.segTrunk.points)) {
          var seg2 = llSliceToLocal(rawLLof(d.segTrunk.points), d.segTrunk.points, s.points);
          if (seg2.length >= 2 && geomFront.length &&
              Math.abs(seg2[0].x - geomFront[geomFront.length - 1].x) < 1e-6 &&
              Math.abs(seg2[0].y - geomFront[geomFront.length - 1].y) < 1e-6) seg2.shift();
          geomFront = geomFront.concat(seg2);
        }
      });
    });
    out.geom = { frontPts: geomFront, mainPts: geomMain, endPt: geomMain[geomMain.length - 1] || null,
      zoneIndex: worst.z.zi, len: worst.z.run + worst.z.main };
    if (!geomMain.length) out.geom = null;
  }
  return out;
}

function tlWorstPathLen(needGeom) {
  var EMPTY = { fromFigure: false, zoneIndex: -1, front: 0, main: 0, branch: 0, taps: [] };
  try {
    var d = window.tlDiagramData;
    if (!d || !d.mainPipes || !d.mainPipes.length) return EMPTY;
    /* [v879] 旧总管（设计 frontPipe）时代分支原样迁出为 legacyWorstPath —— 生成器自
       v873 起把 frontPipe/sourcePos 恒置 null（设计侧只拥有段总管），本分支仅为
       旧快照/未来恢复图面总管留通道；段总管时代走 segWorstPath（见下）。 */
    if (d.frontPipe && d.frontPipe.length >= 2) return legacyWorstPath(d, needGeom, EMPTY);
    /* [v1019 用户拍板] 主引擎 = 地图轮灌演示同款全分区寻路（拓扑对任意布局正确）；
       不可用（无反投数据/有分区无路径）⇒ 退段总管引擎（其自身带塌缩守卫，
       两排布局会诚实返回 EMPTY）⇒ 再退 EMPTY。 */
    var rw = tlRoutesWorstPath(needGeom, EMPTY);
    if (rw) return rw;
    return segWorstPath(d, needGeom, EMPTY);
  } catch (e) {
    return EMPTY;
  }
}

/* [v879] 旧总管（设计 frontPipe）时代的最不利路径 —— 原 tlWorstPathLen 主体逐字节迁出。
   模型：水源 →(frontPipe 折线，接水点=主管靠总管端投影弧长 run)→ 该区主管(+接入段) → 支管。 */
function legacyWorstPath(d, needGeom, EMPTY) {
  {
    var AE = window.RyTlAutoEdits;
    function eff(pid, pts) {
      try {
        if (AE && AE.effPts && pid) {
          var e = AE.effPts(pid, d);
          if (e && e.length >= 2) return e;
        }
      } catch (e2) { }
      return pts;
    }
    function dist(a, b) { return Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2)); }
    function polyLen(pts) { var L = 0; for (var i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]); return L; }
    var f = eff('front', d.frontPipe);
    if (!f || f.length < 2) return EMPTY;
    /* 总管累计弧长 */
    var cum = [0], L = 0;
    for (var i = 1; i < f.length; i++) { L += dist(f[i - 1], f[i]); cum.push(L); }
    var total = L;
    /* 弧长基准端 = 离水源更近的一端 */
    var src = d.sourcePos || f[0];
    var fromTail = dist(f[f.length - 1], src) < dist(f[0], src);
    /* 点投影到总管折线 → {run: 距水源端弧长, d: 偏离距离} */
    function projRun(p) {
      var best = null;
      for (var i = 0; i + 1 < f.length; i++) {
        var a = f[i], b2 = f[i + 1];
        var dx = b2.x - a.x, dy = b2.y - a.y, c = dx * dx + dy * dy;
        var t = c === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / c;
        if (t < 0) t = 0; else if (t > 1) t = 1;
        var q = { x: a.x + dx * t, y: a.y + dy * t };
        var dd = dist(p, q);
        if (!best || dd < best.d) best = { d: dd, run: cum[i] + dist(a, q), q: q };   /* q：投影像（标注几何用） */
      }
      if (!best) return null;
      return { d: best.d, run: fromTail ? (total - best.run) : best.run, q: best.q };
    }
    var mainPipes = d.mainPipes || [], branchPipes = d.branchPipes || [];
    var branchLens = branchPipes.map(function (bp, bi) { return polyLen(eff('branch-' + bi, bp)); });
    /* [v601 2026-10-19 用户口径] 支管**计算**长度取「设计满跨 ÷（根数×敷设边数）」：
       · 图面两端各缩进 gapV/gapH 只是显示约定（不压分区边线），不能进长度与水损；
       · 用户手动改长时，只把图面拉伸增量（effLen − 原始图面长）叠加到满跨上，
         不把留边算回来，也不因留边而少算。 */
    var brCalcSpans = d.branchFullSpans || [], brCalcDrawn = d.branchDrawnLens || [];
    var brCalcCount = readSelectedInt('#tl_branchGroup .selected', 2);
    var brCalcSides = readSelectedInt('#tl_layoutGroup .selected', 1);
    function branchSingleCalcLen(zi) {
      /* [v603] 满跨与图面基准统一走 window.tlBranchSpanInfo：有快照字段用字段，
         旧存档（无字段）按分区几何反推 —— 两条路的结论都是「留边不进计算」。 */
      var info = (typeof window.tlBranchSpanInfo === 'function') ? window.tlBranchSpanInfo(zi) : null;
      if (!info || !(info.full > 0)) return 0;          /* 真拿不到几何 → 由调用方退回图面长 */
      var now = (branchLens[zi] > 0) ? branchLens[zi] : info.base;
      var delta = Math.max(0, now - info.base);         /* 手动改长增量 */
      return (info.full + delta) / (brCalcCount * brCalcSides);
    }
    var taps = [], zones = [], worst = null;
    for (var zi = 0; zi < mainPipes.length; zi++) {
      var mp = eff('main-' + zi, mainPipes[zi]);
      if (!mp || mp.length < 2) continue;
      var r0 = projRun(mp[0]), r1 = projRun(mp[mp.length - 1]);
      var r = (r0 && r1) ? (r0.d <= r1.d ? r0 : r1) : (r0 || r1);   /* 靠总管的一端 = 接水点 */
      if (!r) continue;
      var useStart = !!(r0 && (!r1 || r0.d <= r1.d));               /* 该端是 mp[0] 还是末点（标注几何用） */
      var ml = polyLen(mp);
      /* 接入段 = 该区主管靠总管的一端到总管折线的距离（简图上是以 tlStubs 画出的连接管）：
         计入「最远分区」判定与主管长度，否则同一总管引出点上的各区会并列为同长。 */
      var link = r.d || 0;
      var bl = (zi < branchLens.length) ? (branchSingleCalcLen(zi) || branchLens[zi]) : 0;   /* [v601] 满跨口径优先；无记录退回图面长 */
      taps.push({ zi: zi, run: r.run });
      var mainTot = ml + link;
      zones.push({ zi: zi, main: mainTot, branch: bl, run: r.run });
      var totPath = r.run + mainTot + bl;
      if (!worst || totPath > worst.totPath) worst = { totPath: totPath, run: r.run, main: mainTot, branch: bl, link: link, zi: zi, q: r.q, mp: mp, useStart: useStart, fromTail: fromTail, f: f };
    }
    if (!worst) return EMPTY;
    taps.sort(function (a, b) { return a.run - b.run; });
    var out = { fromFigure: true, zoneIndex: worst.zi, front: worst.run, main: worst.main, branch: worst.branch, link: worst.link, taps: taps, zones: zones };
    if (needGeom) {
      /* 标注几何（第四十七轮）：水源端 → 接点 的**总管局部折线**（只走参与本路径的那一段，不是整根总管），
         再经连接段接到该区主管。支管不标（用户明确要求）。
         长度 = worst.run(总管) + worst.main(主管+连接段) —— 与扬程采用的 frontLenUsed + mainLenUsed 同源。 */
      var ord = worst.fromTail ? worst.f.slice().reverse() : worst.f;
      var sub = [ord[0]], acc = 0;
      for (var k = 1; k < ord.length; k++) {
        var sg = dist(ord[k - 1], ord[k]);
        if (acc + sg >= worst.run - 1e-6) break;
        acc += sg; sub.push(ord[k]);
      }
      sub.push({ x: worst.q.x, y: worst.q.y });
      var nearPt = worst.useStart ? worst.mp[0] : worst.mp[worst.mp.length - 1];
      var mpOri = worst.useStart ? worst.mp.slice() : worst.mp.slice().reverse();
      out.geom = {
        frontPts: sub,
        linkPts: [{ x: worst.q.x, y: worst.q.y }, { x: nearPt.x, y: nearPt.y }],
        mainPts: mpOri, endPt: mpOri[mpOri.length - 1],
        zoneIndex: worst.zi, len: worst.run + worst.main,
      };
    }
    return out;
  }
}

/* [v879] 段总管时代的最不利路径。用户体感「计算麻烦/泵偏大」的根源在此：
   旧实现读 frontPipe —— 自 v873 生成时恒 null ⇒ 引擎整体失效（wp.fromFigure 恒 false），
   扬程退化为 tlFrontLenUse 的「手绘全长/输入值 + 段总管**全长**」近似：
   最不利分区不在干线末端时虚高（如 3×3 网格最不利区常在中部，最多虚高约半个干线跨度）。
   新模型：水源 →(手绘总管全长 mt.len，未画则 0)→ 驳接端 →(沿段总管到该区串联点的
   **部分长度**)→ 该区主管(全长，沿用旧约定) → 支管；worst = 逐区取 totPath 最大。
   锚点（手绘总管驳接在干线哪一端）由 tlSegAnchorIdx 实测，读不到退回起点 points[0]。
   误差界：锚点猜错时，最不利路径与真值同处 [hand+主管+支管+len/2, hand+主管+支管+len]
   区间（max_i|join_i−p0| ≥ len/2），不劣于旧的全长口径。 */
function segWorstPath(d, needGeom, EMPTY) {
  var st = d.segTrunk;
  if (!st || !Array.isArray(st.points) || st.points.length < 2 ||
      !Array.isArray(st.joinPts) || !st.joinPts.length ||
      !(st.len > 0)) return EMPTY;
  var AE = window.RyTlAutoEdits;
  function eff(pid, pts) {
    try {
      if (AE && AE.effPts && pid) {
        var e = AE.effPts(pid, d);
        if (e && e.length >= 2) return e;
      }
    } catch (e2) { }
    return pts;
  }
  function dist(a, b) { return Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2)); }
  function polyLen(pts) { var L = 0; for (var i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]); return L; }
  var mt = tlMapTrunkLen();
  var handLen = (mt && mt.ok && mt.len > 0) ? mt.len : 0;
  var ai = tlSegAnchorIdx();                       /* 0|1：驳接端下标，读不到 ⇒ 0（起点） */
  var anchor = st.points[ai === 1 ? 1 : 0];
  var mainPipes = d.mainPipes || [], branchPipes = d.branchPipes || [];
  var branchLens = branchPipes.map(function (bp, bi) { return polyLen(eff('branch-' + bi, bp)); });
  var zones = [], taps = [], worst = null, skipped = 0;
  for (var zi = 0; zi < mainPipes.length; zi++) {
    var mp = eff('main-' + zi, mainPipes[zi]);
    if (!mp || mp.length < 2) continue;
    var jp = st.joinPts[zi];                       /* joinPts 与 mainPipes 同序（build 按主管顺序产出） */
    if (!jp || !isFinite(jp.x) || !isFinite(jp.y)) { skipped++; continue; }
    /* [v1019] 塌缩守卫：接点必须真落在本区主管上（≤1 m）。两排布局下 build 合并共线
       分支把 joinPts 塌成少数共线组，序号错位（如区0 拿到下排接点）⇒ 整体判不可用，
       绝不让假 run 进扬程链（实测 392×300 十区曾产出「最远 2 区 · 233.1 m」假路径）。 */
    var jpBest = Infinity;
    for (var jk = 1; jk < mp.length; jk++) {
      var ja = mp[jk - 1], jb = mp[jk], jdx = jb.x - ja.x, jdy = jb.y - ja.y, jden = jdx * jdx + jdy * jdy;
      var jt = jden ? Math.max(0, Math.min(1, ((jp.x - ja.x) * jdx + (jp.y - ja.y) * jdy) / jden)) : 0;
      jpBest = Math.min(jpBest, Math.hypot(jp.x - ja.x - jdx * jt, jp.y - ja.y - jdy * jt));
    }
    if (!(jpBest <= 1)) { skipped++; continue; }
    /* 干线穿过主管（joinPt 在主管上）⇒ 接入段 link=0；主管长沿用全长约定（保守，与材料口径一致）。 */
    var run = handLen + dist(jp, anchor);
    var ml = polyLen(mp);
    var bl = (zi < branchLens.length) ? (tlBranchCalcLenOf(d, branchLens, zi) || branchLens[zi]) : 0;
    taps.push({ zi: zi, run: run });
    zones.push({ zi: zi, main: ml, branch: bl, run: run });
    var totPath = run + ml + bl;
    if (!worst || totPath > worst.totPath) worst = { totPath: totPath, run: run, main: ml, branch: bl, zi: zi, mp: mp, jp: jp };
  }
  /* [v1019] 覆盖率守卫：有主管拿不到接点 ⇒ 干线模型对该布局不成立，整体不可用
     （被跳过的区可能才是真最远，静默竞选会产出假最不利分区）。 */
  if (skipped > 0) return EMPTY;
  if (!worst) return EMPTY;
  taps.sort(function (a, b) { return a.run - b.run; });
  var out = { fromFigure: true, fromSeg: true, zoneIndex: worst.zi, front: worst.run, main: worst.main, branch: worst.branch, link: 0, taps: taps, zones: zones };
  return out;
}

/* [v879] 段总管驳接端判定：手绘总管在地图上驳接到干线哪一端（0=起点上/左，1=终点下/右）。
   首选实测：管网快照（runye_network_layout，v878 起含 kind:'segTrunk' 段，其 latLng[0]/[1]
   与 dd.segTrunk.points[0]/[1] 投影顺序一一对应）+ 地图手绘总管折线端点（plot.trunk，
   经纬度同域）做 haversine 最近匹配 —— 干线两端里，离手绘折线更近的那个端点即驳接端。
   读不到（未画总管/无快照/成组地块/坐标坏点）⇒ 退回 0（v868 语义起点=最上/最左主管，
   v870 水源侧默认 lo ⇒ 手绘通常驳接此端）。经纬度测距走 trunk-geo 唯一实现，不自写公式。 */
function tlSegAnchorIdx() {
  try {
    var S = window.RyTrunkSchema, G = window.RyTrunkGeo;
    if (!S || !G || typeof G.haversine !== 'function' || typeof S.readPoint !== 'function' ||
        typeof S.pickMainTrunk !== 'function' || typeof S.normalize !== 'function') return 0;
    var store = window.RyIrrigationDataStore;
    var net = (store && typeof store.readNetworkLayout === 'function') ? store.readNetworkLayout() : null;
    var seg = null;
    if (net && Array.isArray(net.segments)) {
      for (var i = 0; i < net.segments.length; i++) {
        var s0 = net.segments[i];
        if (s0 && s0.kind === 'segTrunk' && Array.isArray(s0.latLng) && s0.latLng.length >= 2) { seg = s0; break; }
      }
    }
    if (!seg) return 0;
    /* 手绘总管地块锚点：口径与 tlMapTrunkLen 一致（两边都有且不等 ⇒ 撤回不猜）。 */
    var a = (window.RyMapHost && typeof window.RyMapHost.currentPlotId === 'function')
      ? window.RyMapHost.currentPlotId() : null;
    var b = window.currentPlotId;
    var aid = (a === null || a === undefined || a === '') ? '' : String(a);
    var bid = (b === null || b === undefined || b === '') ? '' : String(b);
    if (aid && bid && aid !== bid) return 0;
    var pid = aid || bid;
    if (!pid) return 0;
    var lib = window.RyPlotLibraryStore && typeof window.RyPlotLibraryStore.read === 'function'
      ? window.RyPlotLibraryStore.read() : null;
    var plots = (lib && Array.isArray(lib.plots)) ? lib.plots : [];
    var plot = null;
    for (var j = 0; j < plots.length; j++) {
      if (plots[j] && String(plots[j].id) === String(pid)) { plot = plots[j]; break; }
    }
    if (!plot || !plot.trunk || plot.merged || plot.grouped || plot.mergedInto) return 0;
    var doc = S.normalize(plot.trunk);
    var m = doc ? S.pickMainTrunk(doc) : null;
    if (!m || !Array.isArray(m.points) || m.points.length < 2) return 0;
    var e0 = S.readPoint(m.points[0]), e1 = S.readPoint(m.points[m.points.length - 1]);
    var LA = S.readPoint(seg.latLng[0]), LB = S.readPoint(seg.latLng[1]);
    if (!e0 || !e1 || !LA || !LB) return 0;
    var hav = G.haversine;
    var d00 = hav(e0, LA), d01 = hav(e0, LB), d10 = hav(e1, LA), d11 = hav(e1, LB);
    /* 驳接端 = 手绘折线两端里离任一干线端更近的那端；锚点 = 离它最近的干线端。 */
    if (Math.min(d00, d01) <= Math.min(d10, d11)) return (d00 <= d01) ? 0 : 1;
    return (d10 <= d11) ? 0 : 1;
  } catch (e) {
    return 0;
  }
}

/* 三级方案数据 → 水力计算器 自动推送（2026-09-19，用户要求）：
   地块绘制划分分区、生成三级管线图后，把管线计算相关数值（推荐管径、图面实长、
   每根支管设计流量）直接导入水力计算器，用户零输入。
   口径 v2（2026-09-19 用户核对流量后确认）：全分区联合 —— trunk=总管段(水源→最远区接点)、
   mains=每个分区一根主管（各区图面实长）+ 各 branchCount × layoutSides 根物理支管；
   计算器总管流量=联合流量（N 区 × zoneFlow），最不利路径由计算器自动标出。 */
function tlPushToHydraulicCalc() {
  try {
    var HC = window.RyHydraulicCalc;
    if (!HC || typeof HC.importThreeLevel !== 'function') return false;
    var d = window.tlDiagramData;
    if (!d || !d.frontPipe) return false;
    var wp = tlWorstPathLen();
    if (!wp || !wp.fromFigure) return false;
    var r = computeThreeLevel();
    if (!r) return false;
    var bc = Math.max(1, r.branchParallelCount | 0);
    /* v2.1（2026-09-19 用户核对流量）+ v95（2026-09-21 用户口径）：联合灌溉 = 全图轮灌中同时只开 tl_zoneCount 区
       （面板「联合灌溉分区数」）；总管流量 = 该 N 下「最大联合组的实际面积和」换算的 combinedFlow
       （v95 起不再按「单区流量 × N」估算；组号 = floor(分区序号 / N)，尾组按实际区数参与比较）。
       故计算器只导入 zoneCount 根主管：
       按距水源弧长取最远的 zoneCount 区（最不利组合，与图面最不利路径标注同源），每根主管挂 branchCount × layoutSides 根物理支管。 */
    var allZones = wp.zones || [];
    if (!allZones.length) return false;
    var nImp = Math.max(1, Math.min(r.zoneCount | 0 || 1, allZones.length));
    var zones = allZones.slice().sort(function (a, b) { return b.run - a.run; }).slice(0, nImp);
    zones.sort(function (a, b) { return a.run - b.run; });   /* 显示顺序仍按沿总管由近到远 */
    var mains = [];
    for (var zi = 0; zi < zones.length; zi++) {
      var z = zones[zi], ts = [];
      for (var k = 0; k < bc; k++) ts.push({ at: Math.round(z.main * (k + 1) / bc * 100) / 100, od: r.branchPipe.od, len: r.branchLenUsed, flow: r.branchFlow });
      mains.push({ od: r.mainPipe.od, len: z.main, taps: ts });
    }
    /* 来源行列表式（2026-09-19 用户批注「用列表表示更美观」） */
    var srcTitle = '已导入三级方案 · ' + zones.length + ' 区联合灌溉 · 最远 ' + (wp.zoneIndex + 1) + ' 区';
    var srcRows = [
      '面积来源：地图实测总面积 + 本页当前分区几何，最大分区 ' + fmt(r.flowAreaM2 / MU_TO_SQM, 2) + ' 亩，全地块合计 ' + fmt(r.totalArea / MU_TO_SQM, 2) + ' 亩',
      '总管：OD ' + r.frontPipe.od + ' · ' + fmt(r.frontLenUsed, 1) + ' m',
      '主管：OD ' + r.mainPipe.od + ' × ' + zones.length + ' 区' + (allZones.length > zones.length ? '（全图 ' + allZones.length + ' 区轮灌，按最不利组合取最远 ' + zones.length + ' 区）' : '（各区图面实长）') + ',',
      '支管：OD ' + r.branchPipe.od + ' · ' + fmt(r.branchLenUsed, 1) + ' m × 每区 ' + bc + ' 根（每根 ' + fmt(r.branchFlow, 1) + ' m³/h）',
      '联合流量：' + fmt(r.combinedFlow, 1) + ' m³/h（' + (r.zoneCount | 0 || 1) + ' 区联合' + (r.worstGroup
        ? ' · 最大联合组 第 ' + (r.worstGroup.g + 1) + ' 组 ' + r.worstGroup.zones.map(function (z) { return (z + 1) + '区'; }).join('、') + ' 的面积和'
        : ' · 估算 ' + fmt(r.zoneFlow, 1) + ' × ' + (r.zoneCount | 0 || 1)) + '）——计算器总管流量同此值'
    ];
    HC.importThreeLevel({ trunk: { od: r.frontPipe.od, len: r.frontLenUsed }, mains: mains, srcTitle: srcTitle, srcRows: srcRows,
      areaSource: r.flowAreaSrc, zoneAreasM2: r.zoneAreas.slice(), totalAreaM2: r.totalArea, combinedAreaM2: r.combinedAreaM2 });
    return true;
  } catch (e) { return false; }
}

function computeThreeLevel(options) {
  options = options || {};
  var mapZoneAreas = readCurrentPlanningZoneAreas();
  if (!mapZoneAreas) return null;
  var zoneMuField = document.getElementById('tl_zoneMu');
  if (zoneMuField) zoneMuField.value = (Math.max.apply(null, mapZoneAreas) / MU_TO_SQM).toFixed(2);
  var currentZones = window.tlDiagramData && window.tlDiagramData.zones;
  if (!options.allowUnmatchedGeometry && currentZones && currentZones.cols > 0 && currentZones.rows > 0 && currentZones.cols * currentZones.rows !== mapZoneAreas.length) return null;
  const zoneMuInput = Math.max.apply(null, mapZoneAreas) / MU_TO_SQM;
  const fixedSideInput = readNumber('tl_zoneFixedSide', 300, { min: 1 });
  const fixedSide = Math.max(1, fixedSideInput);  // no MAX_ZONE_SIDE cap
  const zoneAreaM2 = zoneMuInput * MU_TO_SQM;
  const zoneMu = zoneAreaM2 / MU_TO_SQM;
  const derivedSide = Math.max(1, zoneAreaM2 / fixedSide);
  const A = fixedSide;
  const B = derivedSide;
  const N = 1;
  const dh = window.RyTerrain ? window.RyTerrain.resolveDh(readNumber('tl_dh', 8), true) : readNumber('tl_dh', 8);
  const zoneLayout = {cols:1,rows:1,N:1,zoneW:A,zoneH:B,zoneArea:zoneAreaM2,drawZoneW:A,drawZoneH:B};
  const tapeLen = readNumber('tl_tapeLen', 100, { min: 0.01 });
  const tapeSpacing = readNumber('tl_tapeSpacing', 1.2, { min: 0.01 });
  const tapeDh = readNumber('tl_tapeDh', 1);
  const emitterSpacing = readNumber('tl_emitterSpacing', 0.3, { min: 0.01 });
  const emitterFlow = readNumber('tl_emitterFlow', 2, { min: 0 });
  const tapeOD = readNumber('tl_tapeOD', 16, { min: 0.01 });
  const tapePressure = readNumber('tl_tapePressure', 1, { min: 0 });
  const lift = readNumber('tl_lift', 15);
  const existPressure = readNumber('tl_existPressure', 0, { min: 0 });
  const targetV = readNumber('tl_targetV', 1.5, { min: 0.01 });
  const filterLoss = readNumber('tl_filterLoss', 5, { min: 0 });
  const efficiency = readNumber('tl_efficiency', 65, { min: 1, max: 100 }) / 100;
  const branchCount = readSelectedInt('#tl_branchGroup .selected', 2);
  const layoutSides = readSelectedInt('#tl_layoutGroup .selected', 1);
  const branchParallelCount = branchCount * layoutSides;
  const mainPipeLen = readNumber('tl_mainPipeLen', A, { min: 0 });
  const tapeRollLen = readNumber('tl_tapeRollLen', 2000, { min: 0 });

  // ===== Multi-zone combined irrigation =====
  const zoneCount = Math.max(1, readNumber('tl_zoneCount', 1, { integer: true }));
  const frontPipeLen = readNumber('tl_frontPipeLen', 0, { min: 0 });

  /* 最远分区最不利路径（2026-09-16）：图面已生成时，总管/主管/支管长度改用图面到「最远分区」的
     实际折线长，损失只算这一条路径（不再按各地块累加）。无图面时退回试算输入值。
     [v843] 总管那一段改由 tlFrontLenUse 收口：在线地图画了总管就用它的实测长（用户口径
     「扬程 = 在线地图总管长度 + 分区主管及支管长度」），没画才退回图面弧长/试算输入。 */
  const wp = (typeof tlWorstPathLen === 'function') ? tlWorstPathLen() : { fromFigure: false, zoneIndex: -1, front: 0, main: 0, branch: 0, taps: [] };
  let frontLenPick = tlFrontLenUse((wp.fromFigure && wp.front > 0) ? wp.front : 0, frontPipeLen, wp.fromSeg === true);
  let frontLenUsed = frontLenPick.len;
  let frontLenSrc = frontLenPick.src;
  let frontLenMap = frontLenPick.mapLen;
  let mainLenUsed = (wp.fromFigure && wp.main > 0) ? wp.main : mainPipeLen;

  /* 总面积取地图实测面积；各区面积由本页当前网格裁剪地块几何后按实测总量归一。 */
  var flowAreaM2 = Math.max.apply(null, mapZoneAreas);
  var flowAreaSrc = 'currentPlanGeometry+measuredPlotArea';
  const flowZoneMu = flowAreaM2 / MU_TO_SQM;
  function tlZoneAreaAt(zi) {
    return (Number.isInteger(zi) && zi >= 0 && zi < mapZoneAreas.length) ? mapZoneAreas[zi] : 0;
  }

  const totalArea = mapZoneAreas.reduce(function (sum, a) { return sum + a; }, 0);
  const totalMu = totalArea / MU_TO_SQM;
  const tapeRows = Math.max(1, Math.ceil(B / tapeSpacing));
  const segmentsPerRow = Math.max(1, Math.ceil(A / tapeLen));
  const totalTapes = tapeRows * segmentsPerRow;
  const tapeTotalLen = totalArea / tapeSpacing;
  const tapeRolls = tapeRollLen > 0 ? Math.ceil(tapeTotalLen * 1.1 / tapeRollLen) : 0;
  const tapesPerZone = Math.max(1, Math.ceil(totalTapes / N));

  const zoneTapeLen = flowAreaM2 / tapeSpacing;
  const emittersPerTape = tapeLen / emitterSpacing;
  const tapeFlow = emittersPerTape * emitterFlow / 1000;
  const zoneFlow = zoneTapeLen / emitterSpacing * emitterFlow / 1000;

  // Single-zone main pipe (per zone, after the zone valve) —— 长度取「最远分区」主管
  const mainPipe = selectPipe(zoneFlow, targetV, MAIN_PIPE_MIN_OD);
  let mainLoss = hazenWilliams(mainLenUsed, zoneFlow, mainPipe.id);

  // Front main pipe (总管) — carries combined flow for all simultaneous zones；长度取水源→最远分区接点
  /* v95（2026-09-21，用户口径）：联合流量按「自动组合后最大一组的实际面积和」换算
     （组号 = floor(分区序号 / 联合分区数)，尾组不足 N 区按实际面积和参与比较，取最大组）；
     无图面网格/多边形时退回「最大分区流量 × 联合分区数」的初步估算。 */
  /* v98（2026-09-21，用户口径）：三级联合灌溉支持「手动分区成组」——
     用户在操作区点多区 + 「成组」按钮形成任意联合灌溉组（2区/3区…），未分组的区各自独立成组；
     最终水泵流量按「手动组里总面积最大的一组」计。无手动组时退回 v95 自动分组（floor(zi/N)）口径。 */
  var tlManualGroupsRef = (typeof window !== 'undefined' && window.tlManualGroups && window.tlManualGroups.length) ? window.tlManualGroups : null;
  var tlGroupSource = 'auto';
  var tlManualWorstM2 = 0;
  var tlMaxUngroupedM2 = 0;
  var tlManualWorstG = -1, tlManualWorstZones = [];   /* v107（2026-09-22 修复）：记录获胜手动组，让 worstGroup 与联合流量同源 */
  var tlMaxUngroupedZi = -1;
  if (tlManualGroupsRef) {
    var tlCells = mapZoneAreas;
    var tlGroupedSet = {};
    for (var tlGi = 0; tlGi < tlManualGroupsRef.length; tlGi++) {
      var tlSum = 0; var tlArr = tlManualGroupsRef[tlGi];
      for (var tlK = 0; tlK < tlArr.length; tlK++) { tlSum += (tlCells[tlArr[tlK]] || 0); tlGroupedSet[tlArr[tlK]] = 1; }
      /* v107：同时记住获胜组的序号与成员，供 worstGroup / 依据行使用（与 combinedFlow 同一口径） */
      if (tlSum > tlManualWorstM2) { tlManualWorstM2 = tlSum; tlManualWorstG = tlGi; tlManualWorstZones = tlArr.slice(); }
    }
    /* 未分组区各自独立成组：每区作为「单区组」参与最不利比较（v98 修正：此前漏算未分组区） */
    for (var tlZi = 0; tlZi < tlCells.length; tlZi++) {
      if (!tlGroupedSet[tlZi]) { var tlA = tlCells[tlZi] || 0; if (tlA > tlMaxUngroupedM2) { tlMaxUngroupedM2 = tlA; tlMaxUngroupedZi = tlZi; } }
    }
    tlGroupSource = 'manual';
  }
  var autoWorstAreaM2 = 0, autoWorstGroupIndex = -1, autoWorstZones = [];
  for (var ag = 0; ag < mapZoneAreas.length; ag += zoneCount) {
    var autoMembers = [], autoSum = 0;
    for (var az = ag; az < Math.min(mapZoneAreas.length, ag + zoneCount); az++) { autoMembers.push(az); autoSum += mapZoneAreas[az]; }
    if (autoSum > autoWorstAreaM2) { autoWorstAreaM2 = autoSum; autoWorstGroupIndex = Math.floor(ag / zoneCount); autoWorstZones = autoMembers; }
  }
  const combinedAreaM2 = tlGroupSource === 'manual'
    ? Math.max(tlManualWorstM2, tlMaxUngroupedM2)
    : autoWorstAreaM2;
  const combinedFlow = combinedAreaM2 / tapeSpacing / emitterSpacing * emitterFlow / 1000;

  /* 不同联合分区数逐档比较：每档都按同一地图面积数组分组并求最大组面积和。 */
  var groupAreaByN = {};
  (function () {
    var ns = [1, 2, 3, 4, 6, 8, zoneCount];
    for (var ni = 0; ni < ns.length; ni++) {
      var key = Math.max(1, Math.round(ns[ni]));
      if (groupAreaByN[key]) continue;
      var areaN = 0;
      for (var gi = 0; gi < mapZoneAreas.length; gi += key) {
        var sumN = 0;
        for (var gj = gi; gj < Math.min(mapZoneAreas.length, gi + key); gj++) sumN += mapZoneAreas[gj];
        if (sumN > areaN) areaN = sumN;
      }
      groupAreaByN[key] = { areaM2: areaN, flow: areaN / tapeSpacing / emitterSpacing * emitterFlow / 1000 };
    }
  })();
  const frontPipe = selectPipe(combinedFlow, targetV, MAIN_PIPE_MIN_OD);
  let frontPipeLoss = hazenWilliams(frontLenUsed, combinedFlow, frontPipe.id);

  const branchFlow = zoneFlow / branchParallelCount;
  const branchSpan = B;
  const branchLen = branchSpan / (branchCount * layoutSides);
  let branchLenUsed = (wp.fromFigure && wp.branch > 0) ? wp.branch : branchLen;
  const tapsPerBranch = Math.ceil(tapesPerZone / branchParallelCount);
  const branchF = christiansenF(tapsPerBranch);
  const branchPipe = selectPipe(branchFlow, targetV, 0, BRANCH_PIPE_MAX_OD);
  const branchLossRaw = hazenWilliams(branchLenUsed, branchFlow, branchPipe.id);
  let branchLoss = branchLossRaw * branchF;

  // 显式应用图面管径后：分别校核每个轮灌组，总管按取水点分段累加。
  // 支管沿用现有均分流量及 Christiansen 折减规则。
  var hydraulicPath = null;
  var appliedPipes = tlAppliedPipeOverride();
  var noFigManualApplied = false; /* [v972] 无图面手动选管生效标记（供面板 ovApplied 判定） */
  /* 有图面路径时，设计管径和手动改径都使用同一套逐路径损失模型；
     否则“设计值”和“改径值”来自不同算法，不能直接比较。 */
  var groupLoss = null;
  if (wp.fromFigure && wp.zones && window.RyPipePathLoss) {
    var pathZones = wp.zones.map(function (z) {
      var area = tlZoneAreaAt(z.zi);   /* [v1026] partitions 优先，回退 cells（原直读 zoneStat.cells） */
      return { zi: z.zi, run: z.run, main: z.main, branch: z.branch > 0 ? z.branch : branchLen,
        flow: area / tapeSpacing / emitterSpacing * emitterFlow / 1000 };
    });
    /* [v1020 待办③→v1023 深挖] 链式主管过境段组合流量：mainSegs 只透传
       {key,len,downZi}（downZi=路径同样经过该段的分区号集，全项目拓扑覆盖），
       段流量由 RyPipePathLoss.calculate 按「本轮实际同开的组内分区」（downZi ∩
       本组）重算——设计页分组、地图演示组、手动组全部自动正确。
       v1020 曾在本层预换算 {len,flow}（全项目覆盖口径），地图单区/跨组演示复算时
       过境段损失虚大（过境区属于别组也计了流量）。无 mainSegs（旧引擎/旧快照）
       ⇒ 不加字段，损失模型走单段口径零影响。 */
    (function () {
      wp.zones.forEach(function (zSrc, zi2) {
        if (!pathZones[zi2] || !Array.isArray(zSrc.mainSegs) || !zSrc.mainSegs.length) return;
        pathZones[zi2].mainSegs = zSrc.mainSegs.map(function (s) {
          return { key: s.key, len: s.len, downZi: (s.downZi || []).slice() };
        });
      });
    })();
    var pathGroups = [], assigned = {};
    if (tlManualGroupsRef) {
      tlManualGroupsRef.forEach(function (group) {
        var ids = group.filter(function (id) {
          if (assigned[id] || !pathZones.some(function (z) { return z.zi === id; })) return false;
          assigned[id] = true; return true;
        });
        if (ids.length) pathGroups.push(ids);
      });
      pathZones.forEach(function (z) { if (!assigned[z.zi]) pathGroups.push([z.zi]); });
    } else {
      pathZones.forEach(function (z) {
        var gi = Math.floor(z.zi / zoneCount);
        if (!pathGroups[gi]) pathGroups[gi] = [];
        pathGroups[gi].push(z.zi);
      });
      pathGroups = pathGroups.filter(Boolean);
    }
    var pathCheck = window.RyPipePathLoss.calculate({ zones: pathZones, groups: pathGroups,
      calibers: appliedPipes ? appliedPipes.calibers : null, frontOd: frontPipe.od, mainOd: mainPipe.od, branchOd: branchPipe.od,
      sourceDistance: readNumber('planSrcDist', 0, { min: 0 }),
      /* [v843] 旧引擎（frontPipe 图面弧长）时总管总长改用在线地图实测值（按比例缩各取水点
         run，不整根替换）；[v879] 段总管引擎的 run 已是真实米长（手绘全长+干线部分长度），
         不得再缩放 ⇒ 传 0（模块内 runScale=1，runs 原样使用）。 */
      frontTotalOverride: (frontLenSrc === 'mapTrunk' && !wp.fromSeg) ? frontLenMap : 0,
      branchCount: branchParallelCount, branchF: branchF, innerDiam: peInnerDiam, hazen: hazenWilliams });
    /* [v226] 每组取本组 total 最大的一行 = 该组最不利分区路径；flow = 组内各分区流量和（m³/h） */
    groupLoss = pathGroups.map(function (ids, gi) {
      var rows = pathCheck.paths.filter(function (p) { return p.groupIndex === gi; });
      if (!rows.length) return null;
      var w = rows[0];
      for (var ri = 1; ri < rows.length; ri++) if (rows[ri].total > w.total) w = rows[ri];
      var flow = 0;
      for (var fi = 0; fi < ids.length; fi++) {
        for (var zj = 0; zj < pathZones.length; zj++) {
          if (pathZones[zj].zi === ids[fi]) { flow += pathZones[zj].flow; break; }
        }
      }
      return { members: ids.slice(), zi: w.zoneIndex, flow: flow,
        front: w.front, main: w.main, branch: w.branch,
        frontLoss: w.frontPipeLoss, mainLoss: w.mainLoss, branchLoss: w.branchLoss, total: w.total };
    });
    hydraulicPath = pathCheck.worst;
    if (hydraulicPath) {
      frontPipeLoss = hydraulicPath.frontPipeLoss; mainLoss = hydraulicPath.mainLoss; branchLoss = hydraulicPath.branchLoss;
      /* [v843] 总管长度仍走同一个收口（地图总管优先）。hydraulicPath.front 已在
         pipe-path-loss 里按 frontTotalOverride 缩放过，所以两种来源的数值自洽：
         用地图总管 ⇒ 这里等于 mapLen；没画 ⇒ 等于原来的图面弧长。 */
      var fp2 = tlFrontLenUse(hydraulicPath.front, 0, wp.fromSeg === true);
      frontLenPick = fp2; frontLenUsed = fp2.len; frontLenSrc = fp2.src; frontLenMap = fp2.mapLen;
      mainLenUsed = hydraulicPath.main; branchLenUsed = hydraulicPath.branch;   /* 任务⑮ + [v570]：水源连接段直线计入 */
    }
    if (appliedPipes) {
      /* 手动选管已通过 tlBuildPipeOverride 写入逐管口径；损失以 hydraulicPath 为唯一事实源。
         这里只同步面板代表管径，不能再用全局代表流量覆写最不利路径逐段损失。 */
      if (window.tlManualCals) {
        var _mc = window.tlManualCals;
        if (_mc.front != null) { frontPipe.od = _mc.front; frontPipe.id = peInnerDiam(_mc.front); }
        if (_mc.main != null) { mainPipe.od = _mc.main; mainPipe.id = peInnerDiam(_mc.main); }
        if (_mc.branch != null) { branchPipe.od = _mc.branch; branchPipe.id = peInnerDiam(_mc.branch); }
      }
    }
  } else if (window.tlManualCals &&
      (window.tlManualCals.front != null || window.tlManualCals.main != null || window.tlManualCals.branch != null)) {
    /* [v972 2026-11-05 用户反馈] 根因②：无三级图面（tlDiagramData 为空 / wp.fromFigure=false）
       时手动选管完全不参与计算——覆盖应用块只存在于图面路径分支里，选了等于白选
       （改径重算列恒「—」，下拉被刷新回设计值）。现按设计长度路径就地重算：
       算法与设计值同一条 hazen/Christiansen 链路，改径列与设计列可直接比较。
       速度 v 同步重算，保证下游消费方（扬程拆解卡等）读到一致口径。 */
    var _mcNoFig = window.tlManualCals;
    if (_mcNoFig.front != null) {
      frontPipe.od = _mcNoFig.front; frontPipe.id = peInnerDiam(_mcNoFig.front);
      frontPipe.v = combinedFlow / 3600 / (Math.PI * Math.pow(frontPipe.id / 1000, 2) / 4);
      frontPipeLoss = hazenWilliams(frontLenUsed, combinedFlow, frontPipe.id);
    }
    if (_mcNoFig.main != null) {
      mainPipe.od = _mcNoFig.main; mainPipe.id = peInnerDiam(_mcNoFig.main);
      mainPipe.v = zoneFlow / 3600 / (Math.PI * Math.pow(mainPipe.id / 1000, 2) / 4);
      mainLoss = hazenWilliams(mainLenUsed, zoneFlow, mainPipe.id);
    }
    if (_mcNoFig.branch != null) {
      branchPipe.od = _mcNoFig.branch; branchPipe.id = peInnerDiam(_mcNoFig.branch);
      branchPipe.v = branchFlow / 3600 / (Math.PI * Math.pow(branchPipe.id / 1000, 2) / 4);
      branchLoss = hazenWilliams(branchLenUsed, branchFlow, branchPipe.id) * branchF;
    }
    noFigManualApplied = true;
  }

  const tapeID = tapeOD * 0.8;
  const tapeLossRaw = hazenWilliams(tapeLen, tapeFlow, tapeID);
  const tapeF = christiansenF(emittersPerTape);
  const tapeLoss = tapeLossRaw * tapeF;
  const tapePressureM = tapePressure * 10.2;
  const tapeDeltaPct = tapePressureM > 0 ? (tapeLoss / tapePressureM) * 100 : 0;

  // Pump head includes front pipe loss + per-zone main + branch
  const totalPipeLoss = frontPipeLoss + mainLoss + branchLoss;
  const headBeforeSafetyRaw = lift + dh + tapePressureM - existPressure * 10.2 + totalPipeLoss + filterLoss + MARGIN_HEAD;
  const headBeforeSafety = Math.max(0, headBeforeSafetyRaw);
  const pumpHead = RyDesignCore.head(headBeforeSafety, 0, 0, SAFETY_FACTOR);

  // Pump flow = combined flow (all zones simultaneously)
  const pumpPower = RyDesignCore.power(combinedFlow, pumpHead, efficiency);
  const motorKW = selectMotorPower(pumpPower);
  const motorKW_rounded = motorKW;

  const intensity = flowZoneMu > 0 ? zoneFlow / flowZoneMu : 0;

  const mainAll = evaluateAllPipes(zoneFlow, MAIN_PIPE_MIN_OD);
  const branchAll = evaluateAllPipes(branchFlow, 0, BRANCH_PIPE_MAX_OD);
  const frontAll = evaluateAllPipes(combinedFlow, MAIN_PIPE_MIN_OD);

  // Alternatives for different zone counts (1, 2, 3, 4, 6, 8)
  // v95：逐档 N 与主口径同源 —— 取该 N 下「最大联合组的实际面积和」，不再用 单区流量×N 的初步估算
  const frontAlternatives = [1, 2, 3, 4, 6, 8].filter(n => n !== zoneCount).map(n => {
    const cf = (groupAreaByN[n] ? groupAreaByN[n].flow : (zoneFlow * n));
    const fp = selectPipe(cf, targetV, MAIN_PIPE_MIN_OD);
    const fl = hazenWilliams(frontLenUsed, cf, fp.id);
    return { n, flow: cf, pipe: fp, loss: fl, len: frontLenUsed };
  });

  const branchAlternatives = [2, 3, 4].map(n => {
    const bf = zoneFlow / (n * layoutSides);
    const bl = branchSpan / (n * layoutSides);
    const bt = Math.ceil(tapesPerZone / (n * layoutSides));
    const bfVal = christiansenF(bt);
    const bp = selectPipe(bf, targetV, 0, BRANCH_PIPE_MAX_OD);
    const blRaw = hazenWilliams(bl, bf, bp.id);
    const blVal = blRaw * bfVal;
    return { n, flow: bf, len: bl, taps: bt, pipe: bp, loss: blVal };
  });

  return {
    A, B, dh, N, zoneCols: zoneLayout.cols, zoneRows: zoneLayout.rows, zoneW: zoneLayout.zoneW, zoneH: zoneLayout.zoneH,
    tapeLen, tapeSpacing, tapeDh, emitterSpacing, emitterFlow, tapeOD, tapePressure,
    lift, existPressure, targetV, filterLoss, efficiency, branchCount, branchParallelCount, mainPipeLen: mainLenUsed,
    totalArea, totalMu, zoneMu,
    tapeRows, segmentsPerRow, totalTapes, tapesPerZone, tapeRollLen, tapeTotalLen, tapeRolls, zoneTapeLen,
    emittersPerTape, tapeFlow, zoneFlow,
    mainPipe, mainLoss,
    frontPipe, frontPipeLoss, frontPipeLen: frontLenUsed, zoneCount, combinedFlow, frontAll, frontAlternatives,
    branchPipe, branchLoss, branchFlow, branchLen: branchLenUsed, branchSpan, layoutSides, tapsPerBranch, branchF,
    /* 最远分区最不利路径（2026-09-16）：wp=来源与分区号，*LenUsed=各段实际采用长度（米） */
    wp, hydraulicPath, frontLenUsed, mainLenUsed, branchLenUsed,
    /* [v843] 总管长度来源：'mapTrunk'（在线地图总管实测）/ 'figure'（设计图面最远路径）/ 'input'（试算输入）。
       frontLenMap = 地图总管的净长（不含水源连接段/水源距离），null 表示不是地图来源。
       界面上必须标出来 ——「总管 342.6 m（在线地图实测）」和「总管 300 m（试算输入）」对用户是两件事。 */
    frontLenSrc, frontLenMap,
    /* [v226] 逐组水头损失：groupLoss[g]={members:[分区号0基], zi:本组最不利分区, flow:组流量m³/h,
       front/main/branch:路径长度m, frontLoss/mainLoss/branchLoss/total:水头损失m}；无图面路径时 null */
    groupLoss,
    inversePath: (pathZones ? {zones: pathZones.filter(function(z){return z.flow>0;}).map(function(z){ return Object.assign({},z,{area:z.flow*tapeSpacing*emitterSpacing*1000/emitterFlow}); }), groups:pathGroups.map(function(g){return g.filter(function(id){return pathZones.some(function(z){return z.zi===id && z.flow>0;});});}).filter(function(g){return g.length>0;}), calibers:appliedPipes ? appliedPipes.calibers : null} : null),
    /* flowAreaM2 是本页当前分区面积中的最大值；总面积绑定地图实测值。 */
    flowAreaM2, flowZoneMu, flowAreaSrc,
    /* [v945] 逐区实际面积(m²，按分区序号 0 基，缺失位为 0)。总管口径反推要用「每个区各自的
       面积」而不是「最大分区面积 × 区数」——后者假设各区等大，实际地块裁切后常常差 20% 以上，
       会把手绘总管的口径推细。取不到网格时 null（调用方据此明说"没有分区面积"）。 */
    zoneAreas: mapZoneAreas.slice(),
    /* 联合分区面积由本页分区面积数组按当前轮灌成员求和；worstGroup 与 combinedFlow 同源。 */
    combinedAreaM2, groupCount: mapZoneAreas.length,
    /* v107（2026-09-22 修复）：手动分组存在时，worstGroup 取「手动组里面积最大的一组」（与 combinedFlow 同一口径），
       不再一律回退到 floor(zi/N) 自动配对组——否则「联合流量依据」会错显示成自动配对的第3、4区而误导。 */
    worstGroup: (tlGroupSource === 'manual')
      ? (tlManualWorstM2 >= tlMaxUngroupedM2
          ? { g: tlManualWorstG, zones: tlManualWorstZones, sum: tlManualWorstM2, count: tlManualWorstZones.length }
          : (tlMaxUngroupedZi >= 0 ? { g: tlMaxUngroupedZi, zones: [tlMaxUngroupedZi], sum: tlMaxUngroupedM2, count: 1 } : null))
      : ((autoWorstAreaM2 > 0)
          ? { g: autoWorstGroupIndex, zones: autoWorstZones, sum: autoWorstAreaM2, count: autoWorstZones.length }
          : null),
    /* v95：对比表逐档口径 —— key=N，value={areaM2:该 N 下最大组实际面积和(m²), flow:对应联合流量(m³/h)} */
    groupAreaByN,
    tapeID, tapeLoss, tapePressureM, tapeDeltaPct,
    totalPipeLoss, headBeforeSafetyRaw, headBeforeSafety, pumpHead, pumpPower, motorKW, motorKW_rounded,
    /* [v972] 无图面路径且手动选管生效时为 true：面板据此点亮「改径重算」列并反算设计值列 */
    manualApplied: noFigManualApplied,
    intensity, mainAll, branchAll, branchAlternatives
  };
}

/* [v226]（2026-10-04 用户要求）分组说明框（tl-workspace buildGroupInfo）实时读口：
   返回第 g 组（0 基）的流量与最不利路径水头损失。每次读取都**现算** computeThreeLevel
   （唯一事实源，纯数学无副作用）⇒ 改管径 / 改分组 / 改参数后切组立刻是最新值；
   无图面路径 / 无该组时返回 null（面板降级不显示损失行）。手动组按成员集合匹配
   （pathGroups 里未分组单区组追加在尾部，序号与手动组号不保证对齐）。 */
window.tlGroupLossOf = function (g) {
  try {
    if (typeof g !== 'number' || g < 0 || !isFinite(g)) return null;
    var r = computeThreeLevel();
    if (!r || !r.groupLoss) return null;
    var mg = (window.tlManualGroups && window.tlManualGroups.length) ? window.tlManualGroups[g] : null;
    if (mg && mg.length) {
      for (var i = 0; i < r.groupLoss.length; i++) {
        var e = r.groupLoss[i];
        if (!e || e.members.length !== mg.length) continue;
        var hit = true;
        for (var k = 0; k < mg.length; k++) { if (e.members.indexOf(mg[k]) < 0) { hit = false; break; } }
        if (hit) return e;
      }
      return null;
    }
    return r.groupLoss[g] || null;
  } catch (e2) { return null;
  }
};

/* [v967] 总管是**一条物理管**，全项目只能有一个口径（用户 2026-11-05 拍板：
   「其他7个区都按照180选择的总管，8区难道我还要再单独接一个吸管吗？那其他分区的180的
   管道怎么办？我扔了？…每个分区的管径都一样才行，用流量最大那个分区/联合流量最大分区
   确定总管管径」）。

   v950 起的估算与路径模式都是「拿本组流量现选一档」⇒ 8 个单区组算出 8 个总管口径，
   面积最小的第 8 区被钉在 Ø160、扬程反而比大区高 6 m。物理上不成立（同一根管不可能
   一段 Ø180 一段 Ø160），经济上更不成立（不能为了一个区换整根管）。

   口径的唯一算法出处仍是 mod/trunk-size.js 的 suggest()：它本来就按「最不利轮灌组合流」
   选一档，只是以前只有「手绘总管建议口径」在用。这里把全部组喂进去选**一次**，
   再把同一个 od 发给两条计算路径 —— 流量仍按各组自己的（管里当时走多少水就是多少），
   只有管径是共享的。 */
function tlResolveGroups(areas, r) {
  var manual = Array.isArray(window.tlManualGroups) ? window.tlManualGroups : null;
  if (manual && manual.length) {
    var mg = manual.map(function (g) { return (g || []).slice(); }).filter(function (g) { return g.length; });
    if (mg.length) return mg;
  }
  var list = [], per = Math.max(1, Math.round(Number(r && r.zoneCount) || 1));
  var n = Array.isArray(areas) ? areas.length : 0;
  for (var zi = 0; zi < n; zi++) {
    var gi = Math.floor(zi / per);
    if (!list[gi]) list[gi] = [];
    list[gi].push(zi);
  }
  return list.filter(function (g) { return g && g.length; });
}

function tlSharedTrunkPick(areas, groups, r) {
  try {
    var S = window.RyTrunkSize;
    if (!S || typeof S.suggest !== 'function') return null;
    if (!Array.isArray(areas) || !areas.length || !Array.isArray(groups) || !groups.length) return null;
    var res = S.suggest({
      zoneAreas: areas,
      groups: groups,
      tapeSpacing: r.tapeSpacing,
      emitterSpacing: r.emitterSpacing,
      emitterFlow: r.emitterFlow,
      targetV: r.targetV,
      mainOd: r.mainPipe && r.mainPipe.od,
      branchOd: r.branchPipe && r.branchPipe.od,
      minOd: MAIN_PIPE_MIN_OD,
      selectPipe: selectPipe
    });
    return (res && res.ok === true && Number(res.od) > 0) ? res : null;
  } catch (e) { return null; }
}

/* [v950] 没有「逐分区路径」时的按组扬程估算（用户 2026-11-04：
   「我希望是在地图演示分区轮灌的时候，在卡片中，能把扬程显示出来」）。

   为什么不新写一套公式：这里**复用 computeThreeLevel 的三段口径**，只把流量换成
   「本组同轮合流」，用同一组 hazenWilliams / christiansenF / MARGIN_HEAD / SAFETY_FACTOR
   重算 —— 与三级页「扬程计算式」逐项同源，差别仅在长度：
     · 总管段 Q = 本组合流（总管要供全组）；
     · 主管段 Q = **该区自己的流量**（每区一条主管，computeThreeLevel 也是这么算的）；
     · 支管段 Q = 该区流量 ÷ 并联数，再乘 Christiansen 折减；
   长度取 r.frontLenUsed / r.mainLenUsed / r.branchLenUsed（有图面路径时就是实长，
   没有时是设计估算值）⇒ 所以结果标 estimated:true，UI 必须写「估算」并标出用的长度。

   与 tlMapGroupHydraulicsOf 的路径模式的差别只在：路径模式逐区不同长度、分口径沿程累加；
   这里是「全组共用同一组长度」，口径精度略低但没有段总管也能出数 —— 比"给不出扬程"有用。 */
function tlEstimateGroupHead(r, zoneIndexes, sharedPick) {
  var areas = Array.isArray(r.zoneAreas) ? r.zoneAreas : null;
  if (!areas || !areas.length) return null;
  var members = [], missing = [], seen = {};
  zoneIndexes.forEach(function (raw) {
    var zi = Number(raw);
    if (!isFinite(zi) || zi < 0 || Math.floor(zi) !== zi || seen[zi]) return;
    seen[zi] = true;
    var a = Number(areas[zi]);
    if (isFinite(a) && a > 0) members.push(zi); else missing.push(zi);
  });
  if (!members.length) return null;
  var perM2 = 1 / r.tapeSpacing / r.emitterSpacing * r.emitterFlow / 1000;   /* m³/h 每 m² */
  var qGroup = members.reduce(function (s, zi) { return s + Number(areas[zi]) * perM2; }, 0);
  if (!(qGroup > 0)) return null;
  var par = Math.max(1, Number(r.branchParallelCount) || 1);
  var branchF = (typeof r.branchF === 'number' && isFinite(r.branchF)) ? r.branchF : 1;

  /* 总管、主管、支管选径与损失由地图实测总面积和本页分区几何驱动。 */
  var picks = {};
  var maxMainOd = 0, maxBranchOd = 0;
  /* [v976] 主管共享段复核（用户 2026-11-05 拍板，后台自动执行、**无开关无额外操作**）：
     「7区水流过来的时候，一定是有一部分管道之前是给到6区的，6、7区共用的管道应该取大的
     计算值，以此类推。」主管是一条连续共享管，估算里又只有一根试算长（无逐段拓扑），
     复核口径取**全部分区里的最大区流量**现选一档；各区主管统一取 本区档 与 复核档 的
     较大者 —— 贴着档位分界的小区（如 6区 109.03 差 1.43 没进 Ø200、11区 68.03 差 0.47
     没进 Ø160）不再被钉在细档上，扬程不再反超路径更远的大户。复核档必然 ≤ 总管共享档
     （最大区流量 ≤ 最不利组流量，选档随流量单调），不会把总管共享口径顶掉。
     支管是各区自己的内部小管、不共享，维持按本区流量选档。 */
  var qMaxAll = 0;
  areas.forEach(function (a) {
    var q0 = Number(a) * perM2;
    if (isFinite(q0) && q0 > qMaxAll) qMaxAll = q0;
  });
  var mainRecheckPick = (qMaxAll > 0) ? selectPipe(Math.max(qMaxAll, 0.01), r.targetV, MAIN_PIPE_MIN_OD) : null;
  members.forEach(function (zi) {
    var q = Number(areas[zi]) * perM2;
    var bp = selectPipe(q / par, r.targetV, 0, BRANCH_PIPE_MAX_OD);
    var mp = selectPipe(q, r.targetV, MAIN_PIPE_MIN_OD);
    if (mainRecheckPick && (!mp || mainRecheckPick.od > mp.od)) mp = mainRecheckPick;
    picks[zi] = { q: q, branch: bp, main: mp };
    if (mp && mp.od > maxMainOd) maxMainOd = mp.od;
    if (bp && bp.od > maxBranchOd) maxBranchOd = bp.od;
  });
  var downstreamMinOd = Math.max(MAIN_PIPE_MIN_OD, maxMainOd, maxBranchOd);
  /* [v967] 总管口径用**全项目共享值**（见 tlSharedTrunkPick 注释）：这一条管要供所有组，
     尺寸只能由最不利组合流定一次。它必然 ≥ 本组任何一支下游管；若不满足说明数据异常，
     退回逐组选档并让 trunkAdvice.shared=false，不硬套一个比自己下游还细的总管。 */
  var sharedOd = (sharedPick && Number(sharedPick.od) > 0) ? Number(sharedPick.od) : 0;
  if (sharedOd && sharedOd < downstreamMinOd) sharedOd = 0;
  /* [v1022] missing 非空不再阻止总管选档——qGroup 只累加 members，总管档与缺区无关；
     缺区信息由卡片「缺少 X 区」提示行表达，不能让整张表格卡跟着消失（格式统一，
     用户实测 G10 起整片退化正是这一类连锁）。取不到共享档（数据异常）退回逐组选档，
     绝不硬留一个没有 od/id 的「共享总管」。 */
  var trunkPick = null;
  if (sharedOd) {
    trunkPick = selectPipe(qGroup, r.targetV, sharedOd, sharedOd);
    if (!trunkPick) sharedOd = 0;
  }
  if (!trunkPick) trunkPick = selectPipe(qGroup, r.targetV, downstreamMinOd);
  var frontId = trunkPick ? trunkPick.id : (r.frontPipe && r.frontPipe.id);

  /* [v955] 总管长度**只认地图实测 / 设计图面**，不吃 tl_frontPipeLen 的试算默认值（200 m）。
     用户 2026-11-04：「总管就按照地图实测多长就是多长来计算，不要再加这个 200 米」——
     那张 200 m 是「还没画总管时」的设计页试算值，地图上明明画了 510.4 m 却按 200 m 算，
     等于把总管损失换成一个人造数（还和面板上显示的实测长打架）。
     没画总管 ⇒ frontLen=0 且 frontSource='none'，卡片必须明说「总管未绘制，该项未计」。 */
  var frontLen = 0, frontSource = 'none';
  if ((r.frontLenSrc === 'mapTrunk' || r.frontLenSrc === 'figure') && r.frontLenUsed > 0) {
    frontLen = r.frontLenUsed; frontSource = r.frontLenSrc;
  }
  var frontLoss = hazenWilliams(frontLen, qGroup, frontId);

  var rows = members.map(function (zi) {
    var p = picks[zi];
    var mainLoss = hazenWilliams(r.mainLenUsed, p.q, p.main.id);
    var branchLoss = hazenWilliams(r.branchLenUsed, p.q / par, p.branch.id) * branchF;
    var total = frontLoss + mainLoss + branchLoss;
    var rawHead = r.lift + r.dh + r.tapePressureM - r.existPressure * 10.2 + total + r.filterLoss + MARGIN_HEAD;
    return {
      zi: zi, flow: p.q,
      frontLoss: frontLoss, mainLoss: mainLoss, branchLoss: branchLoss,
      totalLoss: total,
      head: RyDesignCore.head(Math.max(0, rawHead), 0, 0, SAFETY_FACTOR)
    };
  });
  var worst = rows.reduce(function (a, b) { return !a || b.totalLoss > a.totalLoss ? b : a; }, null);

  /* [v977] 三段流速（卡片管径列表用）：总管=共享口径按本组流量的流速；主管=共享复核口径
     按**本组**流量的流速（复核档按全项目最大区流量选档，直接用 mainRecheckPick.v 会把
     小流量组的流速算大，必须按本组流量现算）；支管=最不利区自己的支管档流速。 */
  var frontVRow = trunkPick ? trunkPick.v : ((r.frontPipe && r.frontPipe.v) || null);
  var mainVRow = null;
  if (maxMainOd > 0) { try { var mpV = selectPipe(qGroup, r.targetV, maxMainOd, maxMainOd); if (mpV) mainVRow = mpV.v; } catch (eMV) {} }
  var branchVRow = (worst && picks[worst.zi] && picks[worst.zi].branch) ? picks[worst.zi].branch.v : null;

  return {
    members: members,
    missing: missing,
    zones: rows,
    flow: qGroup,
    /* ★ 三个位必须让 UI 看得见：估算 / 用了哪三段长度 / 长度来源 */
    estimated: true,
    /* [v964] 档位台阶（null=本组没有「被钉在细档」的区）：卡片照它写一行自证 */
    lengths: { front: frontLen, main: r.mainLenUsed, branch: r.branchLenUsed },
    lengthSource: { front: frontSource, main: r.wp && r.wp.fromFigure ? 'figure' : 'estimate', branch: r.wp && r.wp.fromFigure ? 'figure' : 'estimate' },
    /* [v955] 损失实际用的三段管径（与 trunkAdvice 同源，卡片要照抄这一行，别再让用户自己猜） */
    pipes: {
      front: trunkPick ? { od: trunkPick.od, id: trunkPick.id, v: trunkPick.v } : { od: (r.frontPipe && r.frontPipe.od) || null, id: frontId || null, v: (r.frontPipe && r.frontPipe.v) || null },
      mainOd: maxMainOd || null,
      branchOd: maxBranchOd || null,
      /* [v976] 主管共享段复核信息：卡片口径行照此写明「主管按共享段最大流量复核取大」，
         让用户知道这不是按本区流量选的档，而是后台自动复核过的共享口径。 */
      mainRecheck: mainRecheckPick ? { od: mainRecheckPick.od, flow: qMaxAll } : null,
      /* [v977] 三段流速（卡片管径列表用）：总管=共享口径按本组流量的流速（trunkPick.v 同源）；
         主管=共享复核口径按**本组**流量的流速（复核档是按全项目最大区流量选的，直接用
         mainRecheckPick.v 会把小流量组的流速算大 —— 要按本组流量现算）；支管=最不利区
         自己的支管档流速（支管不共享，各区内部小管）。 */
      frontV: frontVRow, mainV: mainVRow, branchV: branchVRow,
      perZone: members.map(function (zi) {
        return { zi: zi, flow: picks[zi].q, mainOd: picks[zi].main.od, branchOd: picks[zi].branch.od };
      })
    },
    /* 未被管损包含的两项（富余水头 / 安全系数）：卡片要单列，避免被当成管损 */
    marginHead: MARGIN_HEAD,
    safetyFactor: SAFETY_FACTOR,
    filterLoss: r.filterLoss,
    staticHead: r.lift + r.dh + r.tapePressureM - r.existPressure * 10.2,
    trunkAdvice: trunkPick ? {
      od: trunkPick.od,
      id: trunkPick.id,
      velocity: trunkPick.v,
      targetVelocity: r.targetV,
      minDownstreamOd: downstreamMinOd,
      mainOd: maxMainOd || null,
      branchOd: maxBranchOd || null,
      /* [v967] 总管口径是项目级共享值：所有组同一个 od，流量才是逐组的 */
      shared: !!sharedOd,
      sharedFlow: sharedOd ? Number(sharedPick.flow) : null,
      sharedGroupIndex: sharedOd && typeof sharedPick.groupIndex === 'number' ? sharedPick.groupIndex : null,
      sharedZoneCount: sharedOd && Array.isArray(sharedPick.zones) ? sharedPick.zones.length : null
    } : null,
    frontLoss: worst.frontLoss,
    mainLoss: worst.mainLoss,
    branchLoss: worst.branchLoss,
    totalLoss: worst.totalLoss,
    head: worst.head
  };
}

/* 在线地图按自身当前轮灌组成员请求水力结果，避免地图的组号与本页 tl_zoneCount
   分组序号不一致时误报“逐组数据尚未生成”。数据仍来自同一张图面的逐分区路径，
   每个区的扬程按该轮组实际合流流量计算，组扬程取其中最不利区。 */
window.tlMapGroupHydraulicsOf = function (zoneIndexes, opts) {
  try {
    if (!Array.isArray(zoneIndexes) || !zoneIndexes.length) return null;
    var r = computeThreeLevel();
    if (!r) return null;
    /* [v967] 总管口径：全项目一次选定，两条计算路径共用（用户 2026-11-05 拍板）。
       opts.groups = 地图端自己的全部轮灌组（优先）；没传就按手动组/自动分组还原。 */
    var areaList = Array.isArray(r.zoneAreas) ? r.zoneAreas : null;
    var allGroups = (opts && Array.isArray(opts.groups) && opts.groups.length)
      ? opts.groups.filter(function (g) { return Array.isArray(g) && g.length; })
      : tlResolveGroups(areaList, r);
    var sharedPick = tlSharedTrunkPick(areaList, allGroups, r);
    /* 数据源：直接吃 r.wp.zones 的全分区路径几何；逐区流量只读取 r.zoneAreas，
       即 computeThreeLevel 从本页当前分区几何生成的面积数组。
       旧路（inversePath）有两个口径坑：① zones 经 flow>0 过滤——设计侧网格裁剪把
       某格面积裁成 0 时该区整区消失（用户地块 G10 起整片退化的根因层）；② flow 是
       设计侧口径，与地图 partitions 面积不一致。wp.zones 无 flow 过滤、直供几何，
       两坑同解：尾部区从估算口径升级回**精确路径口径**。
       无 wp.zones（旧快照/引擎不可用）退回 inversePath 老路。 */
    var calcZones = null;
    if (r.wp && Array.isArray(r.wp.zones) && r.wp.zones.length) {
      var perM2Wp = 1 / r.tapeSpacing / r.emitterSpacing * r.emitterFlow / 1000;
      calcZones = r.wp.zones.map(function (z) {
        var a = (Array.isArray(r.zoneAreas) && isFinite(Number(r.zoneAreas[z.zi])) && Number(r.zoneAreas[z.zi]) > 0)
          ? Number(r.zoneAreas[z.zi]) : 0;
        var out = { zi: z.zi, run: z.run, main: z.main,
          /* [v1024] branch 回退与设计侧/估算链同源：wp.branch=0（该区没画支管）时设计侧
             pathZones 与估算链都回退试算长 r.branchLenUsed，老路 inversePath 构造自设计侧
             已内置回退——calcZones 若回退 0，地图组卡该区支管损失=0、与同区设计页数字
             分叉（v1023b 引入的口径缺口）。 */
          branch: z.branch > 0 ? z.branch : ((Number(r.branchLenUsed) > 0) ? Number(r.branchLenUsed) : 0),
          flow: a * perM2Wp };
        if (Array.isArray(z.mainSegs) && z.mainSegs.length) {
          out.mainSegs = z.mainSegs.map(function (s) {
            return { key: s.key, len: s.len, downZi: (s.downZi || []).slice() };
          });
        }
        return out;
      }).filter(function (z) { return z.flow > 0 && z.main > 0; });
      if (!calcZones.length) calcZones = null;
    }
    var pathZones = calcZones
      || ((r.inversePath && Array.isArray(r.inversePath.zones) && r.inversePath.zones.length)
        ? r.inversePath.zones : null);
    /* [v950] 没有逐区路径（手绘总管路线 / 还没生成段总管）时不再直接返回 null ——
       退到「同一套公式、换成本组流量」的估算，让演示卡片能把扬程显示出来。
       面积唯一读取 r.zoneAreas，不接受调用方另传一套面积数组。 */
    if (!pathZones || !window.RyPipePathLoss || typeof window.RyPipePathLoss.calculate !== 'function') {
      return tlEstimateGroupHead(r, zoneIndexes, sharedPick);
    }
    var available = pathZones;
    var members = [], missing = [], seen = {};
    zoneIndexes.forEach(function (raw) {
      var zi = Number(raw);
      if (!isFinite(zi) || zi < 0 || Math.floor(zi) !== zi || seen[zi]) return;
      seen[zi] = true;
      if (available.some(function (z) { return z.zi === zi && z.flow > 0; })) members.push(zi);
      else missing.push(zi);
    });
    /* [v1022 用户实测「G10 及之后分区全部退化」] 组内**任一**分区不在路径表
       （inversePath 缺该区 / 该区 flow=0——routes 引擎对该区寻路失败、设计侧网格
       裁剪把该格面积裁成 0、图面主管数与分区数不一致都会走到这）⇒ 整组退估算链
       兜底：结构与路径模式同构（pipes/lengths/trunkAdvice 全有），卡片照常渲染
       表格版式，扬程标「（估算）」，面积用地图端 partitions（比设计侧网格裁剪更贴
       实际）。全部缺失/部分缺失同一处理——格式不再分裂；missing 随估算链返回
       原样传递（卡片仍显示「缺少 X 区」提示行）。估算链内部组内真没面积时自己
       返回 null，不硬造。 */
    if (!members.length || missing.length) {
      return tlEstimateGroupHead(r, zoneIndexes, sharedPick);
    }
    var totalFlow = available.reduce(function (sum, z) {
      return members.indexOf(z.zi) >= 0 ? sum + z.flow : sum;
    }, 0);
    /* [v981] 决策点③：主管共享段复核补齐路径模式 —— v976 只加在估算链，有段总管时
       主管口径直接吃设计侧 r.mainPipe.od，复核缺席，两条链语义不一致（用户拍板补齐）。
       复核档 = 全部分区最大区流量现选一档（面积源与估算链同：areaList 优先地图 partitions）；
       实际主管口径 = max(设计侧档, 复核档)。逐区已确认的改径（calibers）仍然优先。 */
    var perM2 = 1 / r.tapeSpacing / r.emitterSpacing * r.emitterFlow / 1000;
    var qMaxAll = 0;
    (areaList || []).forEach(function (a) {
      var q0 = Number(a) * perM2;
      if (isFinite(q0) && q0 > qMaxAll) qMaxAll = q0;
    });
    var mainRecheckPick = (qMaxAll > 0) ? selectPipe(Math.max(qMaxAll, 0.01), r.targetV, MAIN_PIPE_MIN_OD) : null;
    var mainOdEff = (r.mainPipe && Number(r.mainPipe.od) > 0) ? Number(r.mainPipe.od) : 0;
    if (mainRecheckPick && mainRecheckPick.od > mainOdEff) mainOdEff = mainRecheckPick.od;
    var downstreamMinOd = Math.max(MAIN_PIPE_MIN_OD, mainOdEff, Number(r.branchPipe && r.branchPipe.od) || 0);
    /* [v967] 同样只认共享口径；管里走的是本组流量，管径是全项目那一个。 */
    var sharedOd = (sharedPick && Number(sharedPick.od) >= downstreamMinOd) ? Number(sharedPick.od) : 0;
    var trunkPick = (!missing.length && totalFlow > 0)
      ? (sharedOd ? selectPipe(totalFlow, r.targetV, sharedOd, sharedOd) : selectPipe(totalFlow, r.targetV, downstreamMinOd))
      : null;
    var check = window.RyPipePathLoss.calculate({
      zones: available,
      groups: [members],
      calibers: (r.inversePath && r.inversePath.calibers) || null,   /* [v1023b] inversePath 可为 null（新数据源不经它） */
      /* 以全项目共享的总管口径复算损失和需求扬程；已确认的逐段改径仍由 calibers 覆盖。 */
      frontOd: trunkPick ? trunkPick.od : (sharedOd || r.frontPipe.od),
      mainOd: mainOdEff || r.mainPipe.od,
      branchOd: r.branchPipe.od,
      sourceDistance: readNumber('planSrcDist', 0, { min: 0 }),
      frontTotalOverride: (r.frontLenSrc === 'mapTrunk' && !(r.wp && r.wp.fromSeg)) ? r.frontLenMap : 0,
      branchCount: r.branchParallelCount,
      branchF: r.branchF,
      innerDiam: peInnerDiam,
      hazen: hazenWilliams
    });
    var rows = (check.paths || []).map(function (p) {
      var rawHead = r.lift + r.dh + r.tapePressureM - r.existPressure * 10.2 +
        p.total + r.filterLoss + MARGIN_HEAD;
      return {
        zi: p.zoneIndex,
        flow: p.mainFlow,
        frontLoss: p.frontPipeLoss,
        mainLoss: p.mainLoss,
        branchLoss: p.branchLoss,
        totalLoss: p.total,
        head: RyDesignCore.head(Math.max(0, rawHead), 0, 0, SAFETY_FACTOR)
      };
    });
    if (!rows.length) return null;
    var worst = rows.reduce(function (a, b) { return !a || b.totalLoss > a.totalLoss ? b : a; }, null);
    /* [v981] 与估算链同构的 pipes/lengths：v977 卡片三行表与口径说明在路径模式下也能渲染。
       主管行 = 复核后的实际口径（max 设计档, 复核档）+ 最不利区自身流量的流速
       （路径模式主管逐区独立，按本区流量算流速比估算链的合流口径更贴物理）；
       长度/来源直接用图面实长（figure），不再是试算长、卡片不标 *。 */
    var worstRaw = check.paths[rows.indexOf(worst)] || null;
    var mainVEff = null, branchVEff = null;
    if (worstRaw && mainOdEff > 0) {
      /* [v1023] 主管流速口径与损失同源：有 mainSegs 时按本组重算后的**过境段流量峰值**
         （最不利区路径上流量最大的那一段），比「本区自身流量」更贴链式布局物理；
         无 mainSegs（旧引擎/旧快照）回退 mainFlow，行为不变。 */
      try {
        var mFlowV = (isFinite(worstRaw.mainSegFlowMax) && worstRaw.mainSegFlowMax > 0)
          ? worstRaw.mainSegFlowMax : worstRaw.mainFlow;
        var mpvP = selectPipe(mFlowV, r.targetV, mainOdEff, mainOdEff); if (mpvP) mainVEff = mpvP.v;
      } catch (eMVP) {}
    }
    var branchOdPath = (r.branchPipe && Number(r.branchPipe.od) > 0) ? Number(r.branchPipe.od) : 0;
    if (worstRaw && branchOdPath > 0) {
      try { var bpvP = selectPipe(worstRaw.branchFlow, r.targetV, branchOdPath, branchOdPath); if (bpvP) branchVEff = bpvP.v; } catch (eBVP) {}
    }
    return {
      members: members,
      missing: missing,
      zones: rows,
      flow: totalFlow,
      pipes: {
        front: trunkPick ? { od: trunkPick.od, id: trunkPick.id, v: trunkPick.v } : { od: (sharedOd || (r.frontPipe && r.frontPipe.od)) || null, id: null, v: null },
        mainOd: mainOdEff || null,
        branchOd: branchOdPath || null,
        mainRecheck: mainRecheckPick ? { od: mainRecheckPick.od, flow: qMaxAll } : null,
        frontV: trunkPick ? trunkPick.v : null,
        mainV: mainVEff, branchV: branchVEff
      },
      lengths: { front: worstRaw ? worstRaw.front : 0, main: worstRaw ? worstRaw.main : 0, branch: worstRaw ? worstRaw.branch : 0 },
      lengthSource: { front: 'figure', main: 'figure', branch: 'figure' },
      marginHead: MARGIN_HEAD,
      safetyFactor: SAFETY_FACTOR,
      filterLoss: r.filterLoss,
      trunkAdvice: trunkPick ? {
        od: trunkPick.od,
        id: trunkPick.id,
        velocity: trunkPick.v,
        targetVelocity: r.targetV,
        minDownstreamOd: downstreamMinOd,
        mainOd: mainOdEff || null,
        branchOd: branchOdPath || null,
        /* [v967] 与估算路径同口径：总管 od 项目级共享，流量逐组 */
        shared: !!sharedOd,
        sharedFlow: sharedOd ? Number(sharedPick.flow) : null,
        sharedGroupIndex: sharedOd && typeof sharedPick.groupIndex === 'number' ? sharedPick.groupIndex : null,
        sharedZoneCount: sharedOd && Array.isArray(sharedPick.zones) ? sharedPick.zones.length : null
      } : null,
      frontLoss: worst.frontLoss,
      mainLoss: worst.mainLoss,
      branchLoss: worst.branchLoss,
      totalLoss: worst.totalLoss,
      head: worst.head
    };
  } catch (e) { return null; }
};

/* [v945] 总管口径反推（用户 2026-11-04）：「地图上画的总管只是路由，直径要通过实际规划
   地块的分区推算出来」。这里只做**取素材 + 注入**：算法在 mod/trunk-size.js（纯函数、
   Node 单测锁着），管径档位与选档规则用本文件的 selectPipe / PE_OD_SERIES（唯一出处，
   不复制第二份）。

   为什么不能只靠 tlMapGroupHydraulicsOf：那条链要 computeThreeLevel 的 inversePath，
   而 inversePath 的前置是 wp.fromFigure —— 需要分区与管路页生成过**段总管**（d.segTrunk）。
   手绘总管的用户走的是「地图画线」路线，设计侧常常只有主管/支管、没有段总管 ⇒
   inversePath 为空 ⇒ 那条链直接返回 null，界面上就是「分区管路路径或水力参数尚未齐备」。
   但「分区面积 + 滴灌参数 + 主管/支管管径」这三样**本来就有**，足够反推口径。

   opts（可选）：
     groups     轮灌分组 [[zi…]]（缺省用 tlManualGroups，再缺省按 zoneCount 均分）
     groupIndex 只看某一组（负数/不传 ⇒ 取最不利组） */
window.tlTrunkOdAdvice = function (opts) {
  opts = opts || {};
  try {
    var S = window.RyTrunkSize;
    if (!S || typeof S.suggest !== 'function') return null;
    var r = computeThreeLevel();
    if (!r) return null;
    var areas = r.zoneAreas;
    if (!Array.isArray(areas) || !areas.length) {
      return { ok: false, reason: 'no-zone-area', text: '当前地块没有分区面积（先在「分区与管路」划出分区）。' };
    }
    var groups = (Array.isArray(opts.groups) && opts.groups.length) ? opts.groups : null;
    if (!groups) groups = tlResolveGroups(areas, r);
    if (!Array.isArray(groups) || !groups.length) {
      return { ok: false, reason: 'no-groups', text: '没有轮灌分组，无法确定同轮灌溉的合流流量。' };
    }
    return S.suggest({
      zoneAreas: areas,
      groups: groups,
      groupIndex: (typeof opts.groupIndex === 'number' && isFinite(opts.groupIndex)) ? opts.groupIndex : null,
      tapeSpacing: r.tapeSpacing,
      emitterSpacing: r.emitterSpacing,
      emitterFlow: r.emitterFlow,
      targetV: r.targetV,
      mainOd: r.mainPipe && r.mainPipe.od,
      branchOd: r.branchPipe && r.branchPipe.od,
      minOd: MAIN_PIPE_MIN_OD,
      /* 只注入站内的 selectPipe 包装器（序列/SDR 已在里面固化）。**不要**再传 series/sdr：
         本文件这个包装器是 4 参 (Q, targetV, minOd, maxOd)，多塞两个实参会被当成 minOd，
         档位全被过滤掉（v946 修的就是这个——报「低于下限 xxx mm 选不出结果」）。 */
      selectPipe: selectPipe
    });
  } catch (e) { return null; }
};

function renderTLDerivation(r) {
  if (!r) {
    var card = document.getElementById('tl_derivationCard');
  if (card) card.innerHTML = '<h3>水力计算未就绪</h3><p>请先取得地图地块实测总面积，并在本页完成有效分区。</p>';
    return;
  }
  const existPressureM = r.existPressure * 10.2;
  const rawSum = r.lift + r.dh + r.tapePressureM - existPressureM + r.totalPipeLoss + r.filterLoss + MARGIN_HEAD;
  const sum = Math.max(0, rawSum);
  document.getElementById('tl_derivationCard').innerHTML = `
    <h3><svg class="svg-icon" style="width:14px;height:14px"><use href="#icon-pump"/></svg>水泵扬程构成</h3>
    <div class="derivation-row"><span>提升高度</span><b class="val">${fmt(r.lift,1)} m</b></div>
    <div class="derivation-row"><span>＋ 地形高差</span><b class="val">${fmt(r.dh,1)} m</b></div>
    <div class="derivation-row"><span>＋ 入口工作压力</span><b class="val">${fmt(r.tapePressure,2)} bar → ${fmt(r.tapePressureM,1)} m</b></div>
    ${existPressureM > 0 ? `<div class="derivation-row"><span>－ 水源已有压力</span><b class="val">${fmt(r.existPressure,2)} bar → ${fmt(existPressureM,1)} m</b></div>` : ''}
    ${r.frontPipeLoss > 0 ? `<div class="derivation-row"><span>＋ 总管损失（${fmt0(r.zoneCount)}区联合）</span><b class="val">${fmt(r.frontPipeLoss,2)} m</b></div>` : ''}
    <div class="derivation-row"><span>＋ 主管损失（最远分区）</span><b class="val">${fmt(r.mainLoss,2)} m</b></div>
    <div class="derivation-row"><span>＋ 支管损失（最远分区）</span><b class="val">${fmt(r.branchLoss,2)} m</b></div>
    <div class="derivation-row"><span>＋ 过滤与阀门损失</span><b class="val">${fmt(r.filterLoss,1)} m</b></div>
    <div class="derivation-row"><span>＋ 富余水头</span><b class="val">${MARGIN_HEAD} m</b></div>
    <div style="margin-top:6px;font-size:11px;line-height:1.6;color:var(--s-500,#64748b)">
      损失按<b>一条最不利路径</b>计：总管 ${fmt(r.frontLenUsed,1)} m ＋ 主管 ${fmt(r.mainLenUsed,1)} m ＋ 支管 ${fmt(r.branchLenUsed,1)} m
      ${r.frontLenSrc === 'mapTrunk'
        ? '（总管取<b>在线地图总管实测</b> ' + fmt(r.frontLenMap,1) + ' m'
          + (r.wp && r.wp.fromFigure ? ' · 最远 ' + fmt0(r.wp.zoneIndex + 1) + ' 区主/支管' : '')
          + '）'
        : (r.wp && r.wp.fromFigure ? '（图面实际几何 · 最远 ' + fmt0(r.wp.zoneIndex + 1) + ' 区）'
          : (tlDiagramHasPipes()
            ? '（试算输入值 · <b style="color:#b45309">自动水路不可用</b>，请在在线地图绘制总管后重算）'
            : '（试算输入值；生成管线图后改用图面实际几何）'))}
    </div>
    <div class="derivation-sum">
      <div class="expr">
        ${fmt(r.lift,1)} + ${fmt(r.dh,1)} + ${fmt(r.tapePressureM,1)} ${existPressureM > 0 ? '- ' + fmt(existPressureM,1) : ''} + ${fmt(r.totalPipeLoss,2)} + ${fmt(r.filterLoss,1)} + ${MARGIN_HEAD}
        <br/>= <strong>${fmt(sum,2)} m</strong>（安全系数前${rawSum < 0 ? '，已有压力已覆盖' : ''}）
      </div>
      <div class="result"><span>× ${SAFETY_FACTOR.toFixed(2)} 安全系数</span><strong>${fmt(r.pumpHead,2)} m</strong></div>
    </div>
  `;
}

function renderThreeLevel() {
  const r = computeThreeLevel();
  renderTLDerivation(r);
  if (!r) {
    document.getElementById('tl_resultPanel').innerHTML = '<div class="panel-heading result-heading"><div><span class="step light">02</span><h2>实际方案</h2></div></div><p class="area-source-warning">当前地块缺少地图实测总面积或本页分区几何，水力计算已停止。请先取得地块边界与实测面积。</p>';
    return;
  }

  document.getElementById('tl_resultPanel').innerHTML = `
    <div class="panel-heading result-heading">
      <div><span class="step light">02</span><h2>实际方案</h2></div>
      <span class="live-pill">实时更新</span>
    </div>
    <div class="area-strip">
      <div><span>单个分区</span><strong>${fmt(r.zoneMu,2)} 亩</strong><small>折算 ${fmt(r.zoneW,0)}×${fmt(r.zoneH,0)} m</small></div>
      <div><span>联合灌溉</span><strong>${fmt0(r.zoneCount)} 个分区</strong><small>联合流量 ${fmt(r.combinedFlow,1)} m³/h</small></div>
      <small>单区流量 ${fmt(r.zoneFlow,1)} m³/h（最大分区 ${fmt(r.flowAreaM2 / MU_TO_SQM, 2)} 亩）${r.worstGroup ? ' · 最大联合组 第 ' + (r.worstGroup.g + 1) + ' 组（' + r.worstGroup.zones.map(function (z) { return (z + 1) + '区'; }).join('、') + '）' + fmt(r.worstGroup.sum / MU_TO_SQM, 2) + ' 亩' : ' × ' + fmt0(r.zoneCount) + ' 区（估算）'} → 联合流量 ${fmt(r.combinedFlow,1)} m³/h</small>
    </div>

    <!-- ===== 总管选型（核心结果） ===== -->
    <div class="optimal-card">
      <div class="optimal-top"><span>总管选型结果（${fmt0(r.zoneCount)} 区联合灌溉）</span><b>经济流速法</b></div>
      <div class="optimal-title">
        <small>推荐总管管径</small>
        <strong style="font-size:22px">Ø ${r.frontPipe.od} mm</strong>
      </div>
      <div class="optimal-specs">
        <span>总管流量<b>${fmt(r.combinedFlow,1)} m³/h</b></span>
        <span>总管实际流速<b>${fmt(r.frontPipe.v,2)} m/s</b></span>
        <span>总管理论内径<b>${fmt(r.frontPipe.id,1)} mm</b></span>
        <span>总管长度<b>${fmt(r.frontPipeLen,0)} m</b></span>
        <span>总管沿程损失<b>${fmt(r.frontPipeLoss,2)} m</b></span>
        <span>目标流速<b>${fmt(r.targetV,2)} m/s</b></span>
      </div>
      <p>总管从水源接到第一个分区阀门，承担全部 ${fmt0(r.zoneCount)} 个分区的联合流量。按经济流速法选取最接近目标流速的标准 PE 外径。</p>
    </div>

    <!-- ===== 联合分区数对比 ===== -->
    <div class="branch-compare">
      <div class="branch-compare-title"><span>不同联合分区数总管对比</span><small>查看不同分区数对应的总管管径</small></div>
      <div class="branch-compare-head"><span>分区数</span><span>联合流量</span><span>总管流速</span><span>推荐总管</span></div>
      ${[1, 2, 3, 4, 6, 8].map(n => {
        const cf = (r.groupAreaByN && r.groupAreaByN[n]) ? r.groupAreaByN[n].flow : (r.zoneFlow * n);
        const fp = selectPipe(cf, r.targetV, MAIN_PIPE_MIN_OD);
        const isCurrent = n === r.zoneCount;
        return `<button type="button" class="branch-option ${isCurrent ? 'selected' : ''}" onclick="document.getElementById('tl_zoneCount').value=${n};renderThreeLevel()">
          <strong>${n} 区</strong>
          <span>${fmt(cf,1)} m³/h</span>
          <span>${fmt(fp.v,2)} m/s</span>
          <b>Ø ${fp.od} mm</b>
        </button>`;
      }).join('')}
      <p>点击方案切换联合分区数。每档按该分区数下「最大联合组的实际面积和」计流量（组号 = 分区序号 ÷ N 向下取整，尾组按实际区数）。分区越多，总管流量越大，所需管径越粗。</p>
    </div>

    <!-- ===== 单区主管 + 支管 ===== -->
    <div class="diameter-grid">
      <article>
        <span class="metric-label">总管推荐规格</span>
        <strong>Ø ${r.frontPipe.od} mm</strong>
        <small>联合流量 ${fmt(r.combinedFlow,1)} m³/h · 总管长 ${fmt(r.frontPipeLen,0)} m · 损失 ${fmt(r.frontPipeLoss,2)} m</small>
      </article>
      <article>
        <span class="metric-label">单区主管推荐规格</span>
        <strong>Ø ${r.mainPipe.od} mm</strong>
        <small>单区流量 ${fmt(r.zoneFlow,1)} m³/h · 主管长 ${fmt(r.mainPipeLen,0)} m · 损失 ${fmt(r.mainLoss,2)} m</small>
      </article>
      <article>
        <span class="metric-label">单根支管推荐规格</span>
        <strong>Ø ${r.branchPipe.od} mm</strong>
        <small>${branchCountLabel(r.branchCount, r.layoutSides)} · 单根 ${fmt(r.branchLen,1)} m · ${fmt(r.branchFlow,2)} m³/h · 损失 ${fmt(r.branchLoss,2)} m</small>
      </article>
    </div>

    <!-- ===== 水泵 ===== -->
    <div class="pump-card">
      <div class="pump-topline"><span>水泵建议工作点（${fmt0(r.zoneCount)} 区联合）</span><span class="confidence">含 ${MARGIN_HEAD} m 富余及 ${SAFETY_FACTOR.toFixed(2)} 安全系数</span></div>
      <div class="pump-metrics">
        <div><strong>${fmt(r.combinedFlow,1)}</strong><span>m³/h 联合流量</span></div>
        <b>×</b>
        <div><strong>${fmt0(r.pumpHead)}</strong><span>m 扬程</span></div>
      </div>
      <div class="motor-row"><span>轴功率计算 / 建议电机</span><strong>${fmt(r.pumpPower,1)} / ${fmt0(r.motorKW_rounded)} kW</strong></div>
      <div class="motor-row"><span>总管损失</span><strong>${fmt(r.frontPipeLoss,2)} m</strong></div>
      <div class="motor-row"><span>单区主管＋支管损失</span><strong>${fmt(r.mainLoss + r.branchLoss,2)} m</strong></div>
      <div class="motor-row"><span>管路总损失</span><strong>${fmt(r.totalPipeLoss,2)} m</strong></div>
    </div>

    <!-- ===== 支管方案对比 ===== -->
    <div class="branch-compare">
      <div class="branch-compare-title"><span>分区阀门后支管方案对比</span><small>点击方案即可采用</small></div>
      <div class="branch-compare-head"><span>方案</span><span>单根长度</span><span>单根流量</span><span>推荐规格</span></div>
      ${r.branchAlternatives.map(alt => `
        <button type="button" class="branch-option ${alt.n === r.branchCount ? 'selected' : ''}" onclick="selectTLBranch(${alt.n})">
          <strong>${branchCountLabel(alt.n, r.layoutSides)}</strong>
          <span>${fmt(alt.len,1)} m</span>
          <span>${fmt(alt.flow,2)} m³/h</span>
          <b>Ø ${alt.pipe.od} mm</b>
        </button>
      `).join('')}
      <p>支管按单区分区阀门后并联分流，不影响总管选型。</p>
    </div>

    <dl class="result-list">
      <div><dt>单区面积</dt><dd>${fmt(r.zoneMu,2)} 亩 · ${fmt(r.zoneW,0)}×${fmt(r.zoneH,0)} m</dd></div>
      <div><dt>联合灌溉分区数</dt><dd>${fmt0(r.zoneCount)} 个</dd></div>
      <div><dt>单区流量</dt><dd>${fmt(r.zoneFlow,2)} m³/h</dd></div>
      <div><dt>联合总流量</dt><dd>${fmt(r.combinedFlow,2)} m³/h</dd></div>
      <div><dt>总管推荐</dt><dd>Ø ${r.frontPipe.od} mm · 流速 ${fmt(r.frontPipe.v,2)} m/s</dd></div>
      <div><dt>总管损失</dt><dd>${fmt(r.frontPipeLoss,2)} m（长 ${fmt(r.frontPipeLen,0)} m）</dd></div>
      <div><dt>单区主管</dt><dd>Ø ${r.mainPipe.od} mm · 损失 ${fmt(r.mainLoss,2)} m</dd></div>
      <div><dt>支管方案</dt><dd>${branchCountLabel(r.branchCount, r.layoutSides)} · Ø ${r.branchPipe.od} mm · 损失 ${fmt(r.branchLoss,2)} m</dd></div>
      <div><dt>管路总损失</dt><dd>${fmt(r.totalPipeLoss,2)} m</dd></div>
      <div><dt>扬程（安全系数前）</dt><dd>${fmt(r.headBeforeSafety,2)} m</dd></div>
      <div><dt>水泵工作点</dt><dd>${fmt(r.combinedFlow,1)} m³/h × ${fmt0(r.pumpHead)} m</dd></div>
      <div><dt>建议电机</dt><dd>${fmt0(r.motorKW_rounded)} kW</dd></div>
    </dl>
  `;

  // Pipe Tables
  const renderTLTable = (title, subtitle, flow, data, recommendedOd, L) => {
    const recIdx = data.findIndex(d => d.od === recommendedOd);
    const view = recIdx >= 0 ? data.slice(Math.max(0, recIdx - 3), Math.min(data.length, recIdx + 4)) : data;
    const rows = view.map(d => {
      const isRec = d.od === recommendedOd;
      const loss = hazenWilliams(L, flow, d.id);
      const status = pipeStatusLabel(d.v, isRec);
      const cls = pipeStatusClass(d.v, isRec);
      const rowClass = isRec ? 'recommended-row' : '';
      return `<tr class="${rowClass}">
        <td>Ø ${d.od} mm</td>
        <td>${fmt(d.id,1)} mm</td>
        <td>${fmt(d.v,2)} m/s</td>
        <td>${fmt(loss,2)} m</td>
        <td><span class="pipe-status ${cls}">${status}</span></td>
      </tr>`;
    }).join('');
    return `<article class="pipe-table-card">
      <div class="pipe-table-title">
        <div><h3>${title}</h3><p>${subtitle}</p></div>
        <span>PE100 · PN0.4 · SDR13.6</span>
      </div>
      <div class="table-scroll">
        <table class="selection-table">
          <thead><tr><th>规格（外径）</th><th>理论内径</th><th>流速</th><th>沿程损失</th><th>判定</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </article>`;
  };

  document.getElementById('tl_pipeTablesSection').innerHTML = `
    <div class="tl-pipe-table-grid">
      ${renderTLTable('总管管径选型对比', `${fmt0(r.zoneCount)} 区联合 · 联合流量 ${fmt(r.combinedFlow,2)} m³/h · 总管长 ${fmt(r.frontPipeLen,0)} m`, r.combinedFlow, r.frontAll, r.frontPipe.od, r.frontPipeLen)}
      ${renderTLTable('单区主管管径选型对比', `单区流量 ${fmt(r.zoneFlow,2)} m³/h · 主管长 ${fmt(r.mainPipeLen,0)} m`, r.zoneFlow, r.mainAll, r.mainPipe.od, r.mainPipeLen)}
      ${renderTLTable('支管管径选型对比', `${branchCountLabel(r.branchCount, r.layoutSides)} · 单根流量 ${fmt(r.branchFlow,2)} m³/h · F=${fmt(r.branchF,4)}`, r.branchFlow, r.branchAll, r.branchPipe.od, r.branchLen)}
    </div>
    <p class="pipe-table-note" style="margin-top:12px">理论内径按 d = 外径 × (1 − 2/13.6) 估算。实际产品壁厚、内径及耐压等级以厂家资料为准，采购前应复核。</p>
  `;
}

function selectTLBranch(n) {
  document.querySelectorAll('#tl_branchGroup button').forEach(b => b.classList.toggle('selected', +b.dataset.n === n));
  renderThreeLevel();
}
function selectTLLayout(sides) {
  document.querySelectorAll('#tl_layoutGroup button').forEach(b => b.classList.toggle('selected', +b.dataset.sides === sides));
  renderThreeLevel();
}

function resetThreeLevelDefaults() {
  const defaults = {tl_zoneMu:30,tl_zoneFixedSide:300,tl_zoneCount:2,tl_frontPipeLen:200,tl_dh:5,tl_tapeLen:100,tl_tapeSpacing:0.8,tl_tapeDh:1,tl_emitterSpacing:0.3,tl_emitterFlow:0.8,tl_tapeOD:16,tl_tapePressure:1,tl_lift:5,tl_existPressure:0,tl_targetV:1.5,tl_filterLoss:5,tl_efficiency:65,tl_mainPipeLen:300,tl_tapeRollLen:2000};
  Object.entries(defaults).forEach(([id, val]) => { const el = document.getElementById(id); if(el) el.value = val; });
  var pn=document.getElementById('tlPlotName'); if(pn && !pn.value) pn.value='1号灌溉地块';
  document.querySelectorAll('#tl_branchGroup button').forEach(b => b.classList.toggle('selected', +b.dataset.n === 2));
  document.querySelectorAll('#tl_layoutGroup button').forEach(b => b.classList.toggle('selected', +b.dataset.sides === 1));
  renderThreeLevel();
}

function syncThreeLevelFromPlan() {
  // 用二级系统"计算结果"(window.planData) 覆盖三级单区初始参数，确保与二级单区完全一致
  var pd = window.planData;
  if (!pd) return false;
  function setv(id, v) {
    if (v == null || !isFinite(v)) return;
    var el = document.getElementById(id);
    /* [v981] 决策点②：用户手改过的三级字段（ryDirty=1）不被联动悄悄覆盖——
       之前二级每重算一次就把三级滴灌参数顶回去，用户毫无感知（G5 事故帮凶之一）。
       「↻ 同步」按钮走 tlForceSyncFromPlan（先清脏标记）= 用户主动要求强制覆盖。 */
    if (el && el.dataset && el.dataset.ryDirty === '1') return;
    if (el) el.value = v;
  }
  // 单区面积：由二级"单区流量 / 灌溉强度"反算，精确等于二级单区面积（避免拿二级表单默认值 30 亩）
  var singleMu = (pd.intensity && pd.intensity > 0) ? (pd.zoneFlow / pd.intensity) : (pd.totalMu / (pd.N || 1));
  setv('tl_zoneMu', Math.round(singleMu * 10) / 10);
  setv('tl_zoneFixedSide', Math.round(pd.zoneW || pd.A || 300));
  setv('tl_tapeSpacing', pd.tapeSpacing);
  setv('tl_emitterSpacing', pd.emitterSpacing);
  setv('tl_emitterFlow', pd.emitterFlow);
  setv('tl_tapeLen', pd.tapeLen);
  var odEl = document.getElementById('fld_tapeOD');
  if (odEl) setv('tl_tapeOD', odEl.value);
  setv('tl_mainPipeLen', Math.round(pd.mainPipeLen));
  setv('tl_lift', pd.lift);
  setv('tl_dh', pd.dh);
  setv('tl_tapePressure', pd.tapePressure);
  setv('tl_existPressure', pd.existPressure);
  setv('tl_targetV', pd.targetV);
  setv('tl_filterLoss', pd.filterLoss);
  setv('tl_efficiency', Math.round((pd.efficiency || 0.65) * 100));
  setv('tl_tapeRollLen', pd.tapeRollLen);
  return true;
}

function openThreeLevelView(scrollToPlan) {
  // Ensure measuredPolygon is available — fallback to ppState if missing
  if((!window.measuredPolygon || window.measuredPolygon.length < 3) && typeof window.ppGetPolyPts === 'function') {
    var ppPts = window.ppGetPolyPts();
    if(ppPts && ppPts.length >= 3) {
      window.measuredPolygon = ppPts;
      console.log('[openThreeLevelView] Restored measuredPolygon from ppState, points:', ppPts.length);
    }
  }
  // 关联二级系统：用二级"计算结果"覆盖三级单区初始参数（而非二级表单默认值）
  syncThreeLevelFromPlan();
  // Copy branch/layout selection
  const mainBranch = document.querySelector('#branchGroup .selected');
  if(mainBranch) document.querySelectorAll('#tl_branchGroup button').forEach(b => b.classList.toggle('selected', +b.dataset.n === +mainBranch.dataset.n));
  const mainLayout = document.querySelector('#layoutGroup .selected');
  if(mainLayout) document.querySelectorAll('#tl_layoutGroup button').forEach(b => b.classList.toggle('selected', +b.dataset.sides === +mainLayout.dataset.sides));

  renderThreeLevel();
  tlUpdatePlanBar();

  // When called from "三级管设计" button (scrollToPlan=true), don't open the overlay;
  // instead scroll to the three-level 04 section on the main page (below the two-level section)
  if(scrollToPlan){
    var planSection = document.getElementById('tlPipePlanSection');
    if(planSection){
      planSection.scrollIntoView({behavior:'smooth',block:'start'});
    }
    return;
  }

  // Otherwise, open the overlay for full input/results/tables view
  document.getElementById('threeLevelView').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeThreeLevelView() {
  document.getElementById('threeLevelView').classList.remove('active');
  document.body.style.overflow = '';
}

// 三级系统查询浮层已隐藏（二级简图下方已内置三级系统出图），URL 锚点 #three-level-view 不再自动打开浮层
// (function(){
//   function tryOpenThreeLevelFromHash(){
//     if(location.hash === '#three-level-view'){
//       try{ openThreeLevelView(); }catch(e){ console.warn('[hash] openThreeLevelView failed:', e); }
//     }
//   }
//   window.addEventListener('hashchange', tryOpenThreeLevelFromHash);
//   if(document.readyState === 'loading'){
//     document.addEventListener('DOMContentLoaded', tryOpenThreeLevelFromHash);
//   } else {
//     tryOpenThreeLevelFromHash();
//   }
// })();

// Three-level view event listeners
document.querySelectorAll('#threeLevelView input[type="number"]').forEach(inp => {
  inp.addEventListener('input', function(){ renderThreeLevel(); tlUpdatePlanBar(); });
  inp.addEventListener('change', function(){ renderThreeLevel(); tlUpdatePlanBar(); });
});
document.querySelectorAll('#tl_branchGroup button').forEach(btn => {
  btn.addEventListener('click', () => selectTLBranch(+btn.dataset.n));
});
document.querySelectorAll('#tl_layoutGroup button').forEach(btn => {
  btn.addEventListener('click', () => selectTLLayout(+btn.dataset.sides));
});

// ===== THREE-LEVEL PIPELINE DIAGRAM =====
var tlDiagramSVG = null;

function tlGetZoneCount() {
  var btn = document.querySelector('#tlZoneCountGroup .selected');
  /* [v997 2026-11-06 用户要求] 无选中兜底 2 → 1（与 HTML 初始态 data-n="1" selected 同源）：
     分区轮灌默认联合分区 = 1（单区单组）。 */
  return btn ? parseInt(btn.dataset.n) : 1;
}
/* v98 手动分区成组：分区 -> 手动组号映射 与 左栏分组状态刷新 */
function tlZoneManualGroupOf(zi) {
  var mg = (typeof window !== 'undefined') ? window.tlManualGroups : null;
  if (!mg || !mg.length) return -1;
  for (var g = 0; g < mg.length; g++) { if (mg[g] && mg[g].indexOf(zi) >= 0) return g; }
  return -1;
}
window.tlZoneManualGroupOf = tlZoneManualGroupOf;
/* v100：组面积的**唯一几何来源** —— 「二级共享基础网格」并上三级阶梯覆盖表。
   ⚠ getZoneCuts() 只回基础网格：阶梯（拖组边界线错开的那一段）是三级局部状态，
     按设计**永不写进二级**（v98h 的隔离约定）⇒ 直接拿它算面积，会算出「拖动前」的数：
     画布写 60.0 亩、左栏与右侧面板还写 54.0 亩（实测踩过）。
   覆盖表取 tlDiagramData.zones 上那一份 —— tlAutoGenerate 只在校验网格签名通过时才挂上，
   所以这里不会把「过期的阶梯」套到新几何上。 */
function tlSteppedZoneCuts() {
  var share = (typeof window !== 'undefined' && window.RunyeBridge) ? window.RunyeBridge.getZoneCuts() : null;
  var z = (typeof window !== 'undefined' && window.tlDiagramData) ? window.tlDiagramData.zones : null;
  var base = share || z;
  if (!base) return null;
  if (!share && z) return z;
  var cox = z && z.cutOffX, coy = z && z.cutOffY;
  if (!cox && !coy) return base;
  var out = {}; for (var k in base) out[k] = base[k];
  out.cutOffX = cox; out.cutOffY = coy;
  return out;
}
window.tlSteppedZoneCuts = tlSteppedZoneCuts;

/* ---------- [v215] 轮灌演示（2026-10-04 用户请求） ----------
 * 用户原话：「这里增加一个轮灌区 来回切换的按钮，我点击哪个轮灌区 右侧分区就跟着变化颜色，
 *            这样我能比较直观的看到，轮灌区是怎么样的，类似过滤系统演示反冲洗动画一样。」
 * 交互范式照搬过滤系统反冲洗 chips（一组一钮 + 复位钮 + 改状态后重涂）：
 *   · 点「组N / MN」→ 该组分区加深（groupFillHi）、其余淡化（灰 6%）——两视图同步：
 *       工作区走 RyTlWs.setSelGroup → applyGroupHighlight（selGroup 分支 v98 起就有、一直没入口）；
 *       三级简图走本文件 tlApplyDemoHighlight（rect 同带 data-zi/data-g/data-fill/data-stroke）。
 *   · ▶ 轮播 → setInterval TL_DEMO_INTERVAL_MS 一组来回切换；再点 ⏸ 暂停；■ 退出恢复原色。
 *   · 演示与「图上点分区成组」互斥：启动时清 tlPendingSel / tlGroupMode（applyGroupHighlight
 *     里待选蓝高亮优先级高于 selGroup，不清会盖住演示色）。
 *   · 演示态挂 window.__tlDemoGroup（单一份），render()/tlAutoGenerate 重渲染后各自恢复，
 *     不靠人记住同步（同一事实只存一份）。 */
/* 三级简图侧演示高亮：三态重涂（恢复=还原 data-fill+data-stroke 虚线；选中=加深+深描边；其余=淡化灰） */
function tlApplyDemoHighlight(g) {
  var svg = document.querySelector('#tlDiagramContent svg'); if (!svg) return;
  var hi = (window.RyTlWs && window.RyTlWs.groupFillHiCss) ? window.RyTlWs.groupFillHiCss : null;
  /* [2026-10-27 修复] 分区格子已从 <rect> 改为 <polygon data-zi>（旋转分区线角度改造），
     旧选择器 rect[data-zi] 查不到任何元素 ⇒ 演示高亮与水流动画整链静默失效；
     与 tl-workspace 侧 applyGroupHighlight 的 '[data-zi]' 同口径（元素无关）。 */
  var rects = svg.querySelectorAll('[data-zi]');
  for (var i = 0; i < rects.length; i++) {
    var r = rects[i];
    if (!r.getAttribute('data-stroke')) r.setAttribute('data-stroke', r.getAttribute('stroke') || '');
    var grp = parseInt(r.getAttribute('data-g'), 10);
    if (g == null) {
      r.setAttribute('fill', r.getAttribute('data-fill'));
      var st = r.getAttribute('data-stroke');
      if (st) r.setAttribute('stroke', st); else r.removeAttribute('stroke');
      r.removeAttribute('stroke-width');
    } else if (grp === g) {
      r.setAttribute('fill', hi ? hi(grp) : r.getAttribute('data-fill'));
      r.setAttribute('stroke', '#1f2937'); r.setAttribute('stroke-width', '1.6');
    } else {
      r.setAttribute('fill', 'rgba(100,116,139,0.06)');
      r.removeAttribute('stroke'); r.removeAttribute('stroke-width');
    }
  }
  /* [v218] 同一份演示态 ⇒ 水流动画 + 阀门开启一并重涂（g=null 时整层清除） */
  try { if (typeof tlDemoRenderFlow === 'function') tlDemoRenderFlow(svg, g); } catch (eFl) { }
}
/* ---------- [v218 2026-10-04 用户请求] 轮灌演示 · 水流动画 + 阀门开启 ----------
 * 用户原话：「轮灌区切换的动画演示时，要把水流模拟出来，从水源过来是怎么走的，
 *            哪几个阀门开启，可以让阀门转动之类的方式模拟阀门开启。」
 * 设计（两个画布一套实现，靠宿主 svg 传入）：
 *   · 路线几何**只从 DOM 读**（已画好的 path[data-tlpipe] / rect[data-zi] / 红⊗阀门圆），
 *     不重算、不引入第二份世界↔屏幕变换 —— 「画出来的就是动画走的」，自动跟随
 *     手工改长 / 平移 / 隐藏分段等既有编辑，不需要同步第二处数据（同一事实只存一份）。
 *     实测（_p1/_probe_v218_geom.cjs）：简图与工作区两个宿主都完整保留
 *     path[data-tlpipe="front|main-N|branch-N"]、rect[data-zi][data-g]、
 *     circle[fill="#ef4444"]（分区阀）⇒ 这套 DOM 后处理两处通用。
 *   · 每条线路 = 水源 → 总管（沿走向到该区取水点）→ 接入短管 → 该区主管 → 支管。
 *     总管走向（从哪一端起算）由 tlDiagramData.frontPipe 与 sourcePos 的**下标对应**决定：
 *     path 的点与 world 数组同序同长 ⇒ 拿 nearest(sourcePos) 的下标即可，无需逆变换。
 *   · 阀门：落在**本组分**区矩形内的那些红⊗ = 本轮开启的阀门 ⇒ 加绿色张合环 + 手柄转 90°。
 *     不改动 ryValveSVG 一个字节（verify_valve_size.cjs 有 EQ1/EQ2 字节级基线），只叠加。
 *   · [v505 2026-10-16 用户实测「水流动画的路径偏离了，应该跟总管/主管/支管都重叠」]
 *     水流层必须挂进 #tlPlotGroup（地块组），不能挂 svg 根 —— 与 v183 节点层、v488 紫线
 *     标注同一个病史：简图的地块/分区矩形/管线/内联节点层全在该组内，组上带「图面整体
 *     拖动」transform=translate(x,y)（tlInitDrag，localStorage 'tl-plot-pos'，每次重生成
 *     自动恢复）。挂在 svg 根 ⇒ 不随组平移，只要图面被拖动过（哪怕手抖微拖一下），
 *     水流就整体偏移 (−tx,−ty)、与管道平行错开（实测位移 (24,16) ⇒ 偏 29.1px）。
 *   · 退出演示 / 切换组 ⇒ 整层 [data-tlflow] 删除重建（幂等）。 */
/* 几何实现独立于页面；保留历史函数名供路径与演示渲染调用。 */
function tlFlowParseD(d) { return window.RyFlowGeometry.parsePath(d); }
function tlFlowNear(p, pts) { return window.RyFlowGeometry.nearestPoint(p, pts); }
function tlFlowLen(p, q) { return window.RyFlowGeometry.distance(p, q); }
function tlFlowClear(svg) {
  if (!svg || !svg.querySelectorAll) return;
  var old = svg.querySelectorAll('[data-tlflow]');
  for (var i = 0; i < old.length; i++) { if (old[i].parentNode) old[i].parentNode.removeChild(old[i]); }
}
/* 组装某个区的水路折线（屏幕坐标）
   [v223] 返回 { pts:折线, valves:[途经阀门] } —— 「主管→支管」那一段必须**经过阀门**
   （用户原话：「主管出来的水流进入支管那一段，要跟主管到支管的阀门对应」）：
   图面上每根支管的阀是挂在主管上的红⊗（斜连接管连接），旧版水流直接从主管
   斜切进支管起点 ⇒ 水流线与阀门位置对不上。现在水流沿「主管取水点 → 阀门中心
   → 支管」走，与图面画法（三通→连接管→阀→支管）一一对应。
   [v471]（2026-10-15 用户实测：大分区/合并组水流不走斜管）阀门识别升级：
   首选「45° 连接管 <line stroke=#185FA5> 两端坐标」直接关联（末端=阀心/首端=主管锚点，
   零阈值、随图面自动成立），v354 的固定像素阈值（8px/40px/6px）降级为兜底——
   分区面积/合并方式/缩放变化会使阀与支管线的屏幕距离超出固定阈值 ⇒ 误判无阀、
   水流退化成垂足直插。 */
/* [v581] 总管段按**弧长**切片：从水源端沿折线走到垂足 q，包含途中所有折点。
   旧写法 `for (k=1; k<=tap.i; k++) sub.push(fPts[k])` 用的是「最近线段的起点下标」——
   · 垂足落在第一段时 tap.i 恒为 0 ⇒ sub 只有起点、总管段整段消失（水流从总管起点直接横穿到主管）；
   · 多顶点折线时只按顶点下标截断，垂足所在的那一小段被整段跳过 ⇒ 水流线跳过折点、与管路错开。
   实测（三通下移 35m）：水流 path 第二点直接跳到主管起点，总管段长度 0。 */
function tlFlowSliceTo(fPts, q) {
  var out = [fPts[0]];
  var bestSeg = 0, bestT = 0, bestD = Infinity;
  for (var i = 0; i + 1 < fPts.length; i++) {
    var a = fPts[i], b = fPts[i + 1];
    var dx = b[0] - a[0], dy = b[1] - a[1], c = dx * dx + dy * dy;
    var t = c === 0 ? 0 : ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / c;
    t = Math.max(0, Math.min(1, t));
    var dd = Math.hypot(q[0] - (a[0] + dx * t), q[1] - (a[1] + dy * t));
    if (dd < bestD) { bestD = dd; bestSeg = i; bestT = t; }
  }
  for (var k = 1; k <= bestSeg; k++) out.push(fPts[k]);
  var a2 = fPts[bestSeg], b2 = fPts[bestSeg + 1] || a2;
  var hit = [a2[0] + (b2[0] - a2[0]) * bestT, a2[1] + (b2[1] - a2[1]) * bestT];
  if (tlFlowLen(out[out.length - 1], hit) > 0.5) out.push(hit);
  return out;
}
/* [v581] 接入段（总管→主管那一小段）：优先读图面上真实画出来的那条 path[data-tlstub]。
   旧写法是 `sub.concat([mp[0]])` 直连 —— 而图面的接入段是沿主管走向画的另一条线（v550/v556），
   拖三通后接入点位置变了、方向也变了，直连与图面就对不上（用户截图里的错位）。
   匹配方式：两端点分别与 (总管垂足 a, 主管起点 b) 就近配对，两种顺序都试；阈值防错配。 */
function tlFlowStubBetween(svg, a, b) {
  var list = svg.querySelectorAll('path[data-tlstub]');
  if (!list.length) return null;
  var best = null, bestD = Infinity;
  for (var i = 0; i < list.length; i++) {
    var pts = tlFlowParseD(list[i].getAttribute('d'));
    if (pts.length < 2) continue;
    var p0 = pts[0], p1 = pts[pts.length - 1];
    var dA = tlFlowLen(p0, a) + tlFlowLen(p1, b);
    var dB = tlFlowLen(p1, a) + tlFlowLen(p0, b);
    var d = Math.min(dA, dB);
    if (d < bestD) { bestD = d; best = (dB < dA) ? pts.slice().reverse() : pts; }
  }
  if (!best) return null;
  var straight = tlFlowLen(a, b);
  return (bestD <= straight * 1.6 + 8) ? best : null;   /* 太远 ⇒ 判定不是这条，回退直连 */
}
function tlFlowRoute(svg, fPts, zi) {
  var mEl = svg.querySelector('path[data-tlpipe="main-' + zi + '"]');
  if (!mEl) return null;
  var mPts = tlFlowParseD(mEl.getAttribute('d'));
  if (mPts.length < 2) return null;
  /* 入水端 = 靠总管更近的那一端（同 tlWorstPathLen 的 useStart 判据） */
  var r0 = tlFlowNear(mPts[0], fPts), r1 = tlFlowNear(mPts[mPts.length - 1], fPts);
  var useStart = !!r0 && (!r1 || r0.d <= r1.d);
  var mp = useStart ? mPts : mPts.slice().reverse();
  var tap = tlFlowNear(mp[0], fPts);
  if (!tap) return null;
  /* 总管：从水源端到取水点（只保留参与本路径的那一段） */
  /* [v581] 总管段：按弧长走到垂足（含所有折点），不再按顶点下标截断 */
  var sub = tlFlowSliceTo(fPts, tap.q);
  /* [v581] 接入段：走图面真实那条线；匹配不到才退回直连 */
  var out = sub.slice();
  var stubPts = tlFlowStubBetween(svg, sub[sub.length - 1], mp[0]);
  if (stubPts && stubPts.length >= 2) {
    for (var sk = 0; sk < stubPts.length; sk++) out.push(stubPts[sk]);
  } else {
    out.push(mp[0]);
  }
  for (var j = 0; j < mp.length; j++) out.push(mp[j]);
  /* 支管：从主管上最近的落点接进去（支管通常挂在主管中后段）
     [v223] 接入点取「该支管阀门」在主管上的垂足 —— 水流先到阀再到支管 */
  var bEl = svg.querySelector('path[data-tlpipe="branch-' + zi + '"]');
  var passed = [];
  if (bEl) {
    var bPts = tlFlowParseD(bEl.getAttribute('d'));
    if (bPts.length >= 2) {
      var s0 = tlFlowNear(bPts[0], mp), s1 = tlFlowNear(bPts[bPts.length - 1], mp);
      var bp = (s0 && (!s1 || s0.d <= s1.d)) ? bPts : bPts.slice().reverse();
      /* [v471] 阀门识别改为「连接管线段直接关联」为主、v354 阈值判据为兜底。
         根因（用户实测：大分区/合并组失效、小分区正常）：图面上每枚分区阀都画有 45° 连接管
         <line stroke="#185FA5">（首端=主管上的三通锚点、末端=阀心，见本文件 3716 行绘制处），
         但 v354 用固定像素阈值找阀（阀到支管垂距≤8px / 三通≤40px / 锚点≤6px）——分区面积、
         合并方式、缩放比例一变，阀与支管线的屏幕距离就超出 8px ⇒ 找不到阀 ⇒ 水流退化成
         「主管垂足直插支管」，看起来不再沿斜接管走。连接管两端坐标是画图时写死的确定性关联，
         零阈值、天然随图面成立：线末端 ≤3px 命中阀心 ⇒ 另一端即主管锚点（≤6px 校验仍在主管上）。
         同一主管上有多枚阀（合并组）时，取「离本区支管线最近」的那枚（相对排序，无硬阈值）。 */
      var vv = null, anchorQ = null, bestScore = Infinity;
      var vs = svg.querySelectorAll('circle[fill="#ef4444"]');
      var lns = svg.querySelectorAll('line[stroke="#185FA5"]');
      for (var w = 0; w < vs.length; w++) {
        if (vs[w].closest && vs[w].closest('[data-junction-valve]')) continue;
        var vx = +vs[w].getAttribute('cx'), vy = +vs[w].getAttribute('cy');
        if (tlFlowLen([vx, vy], fPts[0]) < 12) continue;      /* 水源标记排除 */
        var vr0 = +vs[w].getAttribute('r') || 6.5;
        var anchor = null;
        for (var L = 0; L < lns.length; L++) {
          var lx1 = +lns[L].getAttribute('x1'), ly1 = +lns[L].getAttribute('y1');
          var lx2 = +lns[L].getAttribute('x2'), ly2 = +lns[L].getAttribute('y2');
          if (tlFlowLen([lx2, ly2], [vx, vy]) <= 3) { anchor = [lx1, ly1]; break; }
          if (tlFlowLen([lx1, ly1], [vx, vy]) <= 3) { anchor = [lx2, ly2]; break; }
        }
        if (!anchor) continue;                                /* 无连接管的阀 ⇒ 走兜底 */
        var pa = tlFlowNear(anchor, mp);
        if (!pa || pa.d > 6) continue;                        /* 锚点必须真的在本区主管上 */
        var nb0 = tlFlowNear([vx, vy], bPts);
        if (!nb0) continue;
        if (nb0.d < bestScore) { bestScore = nb0.d; vv = { x: vx, y: vy, d: nb0.d, r: vr0 }; anchorQ = pa.q; }
      }
      if (!vv) {
        /* v354 兜底（无连接管或连接管未命中时沿用旧判据）：该支管的阀门 = 「挂在支管线上」的红⊗：
          阀心到支管折线的垂距 ≤ 8px。仍排除两类「不是支管阀」的红圈：
          ① 总管×主管交接阀（<g data-junction-valve> 内）② 水源标记（紧贴总管起点）。 */
        vv = null;
        for (var w2 = 0; w2 < vs.length; w2++) {
          if (vs[w2].closest && vs[w2].closest('[data-junction-valve]')) continue;
          var vx2 = +vs[w2].getAttribute('cx'), vy2 = +vs[w2].getAttribute('cy');
          if (tlFlowLen([vx2, vy2], fPts[0]) < 12) continue;
          var nb = tlFlowNear([vx2, vy2], bPts);
          if (!nb || nb.d > 8) continue;
          if (!vv || nb.d < vv.d) vv = { x: vx2, y: vy2, d: nb.d, r: +vs[w2].getAttribute('r') || 6.5 };
        }
      }
      if (vv) {
        if (anchorQ) {
          /* [v471] 主管进入点 = 连接管锚点（图面 45° 斜管的起点，与画法逐段重合） */
          out.push(anchorQ);
        } else {
          /* [v354] 兜底时的主管进入点：优先三通方块锚点，无则垂足 */
          var jbest = null;
          var tees = svg.querySelectorAll('rect[data-junction-tee]');
          for (var t2 = 0; t2 < tees.length; t2++) {
            if (tees[t2].getAttribute('data-junction-front')) continue;   /* 总管×主管交接阀不认 */
            var tx2 = +tees[t2].getAttribute('x') + 4.5, ty2 = +tees[t2].getAttribute('y') + 4.5;
            var dt2 = tlFlowLen([vv.x, vv.y], [tx2, ty2]);
            if (dt2 > 40) continue;
            var pr = tlFlowNear([tx2, ty2], mp);
            if (!pr || pr.d > 6) continue;                    /* 锚点必须真的在本主管上 */
            if (!jbest || dt2 < jbest.d) jbest = { q: pr.q, d: dt2 };
          }
          if (!jbest) jbest = { q: tlFlowNear([vv.x, vv.y], mp).q };      /* 无三通标记 ⇒ 垂足兜底 */
          out.push(jbest.q);
        }
        out.push([vv.x, vv.y]);
        passed.push(vv);
      } else {
        out.push(tlFlowNear(bp[0], mp).q);                    /* 找不到阀 ⇒ 退回旧行为 */
      }
      for (var m = 0; m < bp.length; m++) out.push(bp[m]);
    }
  }
  return { pts: out, valves: passed };
}
/* 本轮演示：svg=宿主 <svg>，g=组号（null = 退出演示） */
function tlDemoRenderFlow(svg, g) {
  tlFlowClear(svg);
  if (!svg || g == null || !svg.querySelectorAll) return;
  try {
    var zis = [];
    /* [2026-10-27 修复] 同 tlApplyDemoHighlight：分区格子已是 <polygon data-zi>，rect 选择器失效 */
    var rects = svg.querySelectorAll('[data-zi]');
    for (var i = 0; i < rects.length; i++) {
      if (parseInt(rects[i].getAttribute('data-g'), 10) === g) zis.push(parseInt(rects[i].getAttribute('data-zi'), 10));
    }
    if (!zis.length) return;
    /* [v557] 折线总管：分段渲染时「非 ref」的只是其中一段（2 点），与 dd.frontPipe（N 点）点数不等
       ⇒ 水源端「要不要反序」的判断会失效（水流从错误的一端起算）。改优先取整管引用
       （data-tlpipe-ref，d 与 frontPipe 同点数），取不到再退回旧顺序（行为不变）。 */
    var fEl = svg.querySelector('path[data-tlpipe="front"][data-tlpipe-ref]') || svg.querySelector('path[data-tlpipe="front"]:not([data-tlpipe-ref])') || svg.querySelector('path[data-tlpipe="front"]');
    /* [v882] seg-trunk 时代（v873「分区图只拥有段总管」）：frontPipe 生成时恒 null ⇒
       简图不再画 data-tlpipe="front"，本函数曾在无 front path 时静默 return ⇒
       轮灌演示的水流动画整链消失（用户实测「彻底失效」，chips 高亮还在、水流线没了）。
       修复：干线改走段总管 path[data-tlpipe="segTrunk"]（v859 起恒画）；水流入口端 =
       tlSegAnchorIdx()（手绘总管在地图上驳接到干线哪一端：0=起点 1=终点，读不到退 0，
       与最不利路径同源）⇒ 驳接端为终点时整条反序，水流从驳接端流向干线末端。 */
    var segEntryRev = false;
    if (!fEl) {
      fEl = svg.querySelector('path[data-tlpipe="segTrunk"]');
      if (fEl) {
        try { segEntryRev = (typeof tlSegAnchorIdx === 'function') && tlSegAnchorIdx() === 1; } catch (eAnchor) { segEntryRev = false; }
      }
    }
    if (!fEl) return;
    var fPts = tlFlowParseD(fEl.getAttribute('d'));
    if (fPts.length < 2) return;
    if (segEntryRev) fPts = fPts.slice().reverse();
    /* 水源端：world 数组与 path 同序同长 ⇒ 用最近 sourcePos 的下标判断要不要反序 */
    var dd = window.tlDiagramData;
    if (dd && dd.sourcePos && dd.frontPipe && dd.frontPipe.length === fPts.length) {
      var bi = 0, bd = Infinity;
      for (var s = 0; s < dd.frontPipe.length; s++) {
        var wd = tlFlowLen([dd.frontPipe[s].x, dd.frontPipe[s].y], [dd.sourcePos.x, dd.sourcePos.y]);
        if (wd < bd) { bd = wd; bi = s; }
      }
      if (bi !== 0) fPts = fPts.slice().reverse();
    }
    var NS = 'http://www.w3.org/2000/svg';
    var layer = document.createElementNS(NS, 'g');
    layer.setAttribute('data-tlflow', 'g' + g);
    layer.setAttribute('pointer-events', 'none');
    var routes = [], opened = [];
    for (var z = 0; z < zis.length; z++) {
      var rr = tlFlowRoute(svg, fPts, zis[z]);
      if (rr && rr.pts && rr.pts.length >= 2) {
        routes.push(rr.pts);
        /* [v223] 水流经过的支管阀 ⇒ 一并视为开启（与矩形内阀门按位置去重，4px 容差） */
        for (var pv = 0; pv < rr.valves.length; pv++) {
          var pvx = rr.valves[pv].x, pvy = rr.valves[pv].y, pvr = rr.valves[pv].r;
          var dup = false;
          for (var od = 0; od < opened.length; od++) { if (tlFlowLen([pvx, pvy], opened[od]) < 4) { dup = true; break; } }
          if (!dup) opened.push([pvx, pvy, pvr]);
        }
      }
    }
    if (!routes.length) return;
    /* ① 水源脉冲圈：取所有 #f59e0b 里离总管起点最近的那枚 */
    var srcs = svg.querySelectorAll('circle[fill="#f59e0b"]');
    var best = null;
    for (var c = 0; c < srcs.length; c++) {
      var cx = +srcs[c].getAttribute('cx'), cy = +srcs[c].getAttribute('cy'), rr = +srcs[c].getAttribute('r') || 6;
      var d0 = tlFlowLen([cx, cy], fPts[0]);
      if (!best || d0 < best.d) best = { cx: cx, cy: cy, r: rr, d: d0 };
    }
    /* [v585] 水源 → 总管起点那一段也要有水流。
       总管 path 只覆盖「各三通之间」的折线，水源到第一个三通是**另一条** path
       （data-tlsrcpipe，v571 起是一条直线）；而水流路线是从 fPts[0]（第一个三通）起算的
       ⇒ 用户截图里「水源到第一段主管之间没有动画」。这里把水源圆点前插为每条路线的起点
       （与图面那条直线同形；水源本就贴着总管起点时 d<1 不插，避免零长段）。 */
    if (best && best.d > 1) {
      routes = routes.map(function (route) { return [[best.cx, best.cy]].concat(route); });
    }
    if (best) {
      var ring = document.createElementNS(NS, 'circle');
      ring.setAttribute('data-tlflow', 'src');
      ring.setAttribute('cx', best.cx); ring.setAttribute('cy', best.cy);
      ring.setAttribute('r', Math.max(9, best.r + 3));
      ring.setAttribute('fill', 'none'); ring.setAttribute('stroke', '#0284c7'); ring.setAttribute('stroke-width', '2.5');
      ring.setAttribute('class', 'tl-demo-src');
      layer.appendChild(ring);
    }
    /* ② 水流线（先宽光晕，再流线）—— 流向 = 数组顺序（水源 → 分区末端） */
    for (var t = 0; t < routes.length; t++) {
      var d = '';
      for (var p = 0; p < routes[t].length; p++) d += (p ? ' L' : 'M') + routes[t][p][0].toFixed(1) + ' ' + routes[t][p][1].toFixed(1);
      var halo = document.createElementNS(NS, 'path');
      halo.setAttribute('data-tlflow', 'halo'); halo.setAttribute('d', d); halo.setAttribute('fill', 'none');
      halo.setAttribute('stroke', '#38bdf8'); halo.setAttribute('stroke-width', '9'); halo.setAttribute('stroke-opacity', '.3');
      halo.setAttribute('stroke-linecap', 'round'); halo.setAttribute('stroke-linejoin', 'round');
      halo.setAttribute('class', 'tl-demo-flow-halo');
      var flow = document.createElementNS(NS, 'path');
      flow.setAttribute('data-tlflow', 'flow'); flow.setAttribute('d', d); flow.setAttribute('fill', 'none');
      flow.setAttribute('stroke', '#0284c7'); flow.setAttribute('stroke-width', '2.6');
      flow.setAttribute('stroke-linecap', 'round'); flow.setAttribute('stroke-linejoin', 'round');
      flow.setAttribute('class', 'tl-demo-flow');
      layer.appendChild(halo); layer.appendChild(flow);
    }
    /* ③ 本组各分区内的红⊗阀 ⇒ 绿环 + 手柄转 90°（= 开启） */
    for (var v = 0; v < zis.length; v++) {
      var rc = null;
      for (var q = 0; q < rects.length; q++) { if (parseInt(rects[q].getAttribute('data-zi'), 10) === zis[v]) { rc = rects[q]; break; } }
      if (!rc) continue;
      var rx = +rc.getAttribute('x'), ry = +rc.getAttribute('y');
      var rw = +rc.getAttribute('width'), rh = +rc.getAttribute('height');
      if (!(rw > 0 && rh > 0)) continue;
      var vs = svg.querySelectorAll('circle[fill="#ef4444"]');
      for (var w = 0; w < vs.length; w++) {
        var vx = +vs[w].getAttribute('cx'), vy = +vs[w].getAttribute('cy'), vr = +vs[w].getAttribute('r') || 6.5;
        if (vx < rx || vx > rx + rw || vy < ry || vy > ry + rh) continue;   /* 不在本分区内 ⇒ 不是这一区的阀 */
        /* [v223] 与水流途经阀门按位置去重（4px）—— 同一枚阀只画一个开启环 */
        var dup2 = false;
        for (var od2 = 0; od2 < opened.length; od2++) { if (tlFlowLen([vx, vy], opened[od2]) < 4) { dup2 = true; break; } }
        if (!dup2) opened.push([vx, vy, vr]);
      }
    }
    /* [v223] 统一画「开启」环 + 转柄：集合来源 = 水流途经的支管阀 + 分区矩形内的阀 */
    for (var v2 = 0; v2 < opened.length; v2++) {
      var vx2 = opened[v2][0], vy2 = opened[v2][1], vr2 = opened[v2][2];
      var gv = document.createElementNS(NS, 'g');
      gv.setAttribute('data-tlflow', 'valve');
      var ri = document.createElementNS(NS, 'circle');
      ri.setAttribute('cx', vx2); ri.setAttribute('cy', vy2); ri.setAttribute('r', vr2 + 4.5);
      ri.setAttribute('fill', 'none'); ri.setAttribute('stroke', '#16a34a'); ri.setAttribute('stroke-width', '2');
      ri.setAttribute('class', 'tl-demo-valve-ring');
      /* 阀杆：初始横向（关），动画转到纵向（开）—— 视觉上就是「阀门打开了」 */
      var hb = document.createElementNS(NS, 'g');
      hb.setAttribute('class', 'tl-demo-valve-open');
      hb.setAttribute('style', 'transform-origin:' + vx2.toFixed(1) + 'px ' + vy2.toFixed(1) + 'px');
      var ln = document.createElementNS(NS, 'line');
      ln.setAttribute('x1', vx2 - vr2 - 3.2); ln.setAttribute('y1', vy2);
      ln.setAttribute('x2', vx2 + vr2 + 3.2); ln.setAttribute('y2', vy2);
      ln.setAttribute('stroke', '#166534'); ln.setAttribute('stroke-width', '2.6'); ln.setAttribute('stroke-linecap', 'round');
      var hb2 = document.createElementNS(NS, 'rect');
      hb2.setAttribute('x', vx2 + vr2 + 1.4); hb2.setAttribute('y', vy2 - 3.4);
      hb2.setAttribute('width', '7'); hb2.setAttribute('height', '6.8'); hb2.setAttribute('rx', '1.6');
      hb2.setAttribute('fill', '#16a34a');
      hb.appendChild(ln); hb.appendChild(hb2);
      gv.appendChild(ri); gv.appendChild(hb);
      layer.appendChild(gv);
    }
    /* [v583] 必须挂进「管道所在的那个组」—— 否则不随该组的变换（图面整体拖动 translate /
       工作区缩放平移 view）平移，水流会与管道平行错开（病史同 v183 节点层 / v488 紫线标注）。
       ★ 工作区里 #tlPlotGroup **查不到**：克隆底图时组内所有 id 都被加了 `tlWsPipe_` 前缀
         （tl-workspace pipeBaseSVG：`ids[j].setAttribute('id','tlWsPipe_'+id)`），
         于是旧代码 `svg.querySelector('#tlPlotGroup') || svg` 静默回退到 svg 根。
         平时（未缩放）两者 CTM 相同看不出问题；用户一旦滚轮缩放/拖动画布（拖三通时几乎必做），
         管道跟着 view 变换、动画层不跟 ⇒ 整条水流错开 —— 这就是「拖三通后动画对不上」的真因。
         实测层级链：总管 path → tlWsPipe_tlPlotGroup，而动画层曾是 g →（svg 根）。
       兜底顺序：简图 #tlPlotGroup → 工作区克隆组 → 工作区总管层 → svg 根（老结构降级）。 */
    if (layer.childNodes.length) {
      var hostG = svg.querySelector('#tlPlotGroup')
        || svg.querySelector('#tlWsPipe_tlPlotGroup')
        || svg.querySelector('#tlWsFrontBase')
        || svg;
      hostG.appendChild(layer);
    }
  } catch (eF) { }
}
window.tlDemoRenderFlow = tlDemoRenderFlow;

window.tlRefreshGroupStatus = function () {
  /* Retained as a compatibility hook for group-planning callers. */
};
/* [2026-10-27 用户指令取消] 联合灌溉分组「手动合并」机制整链删除：
   原 v98 面板（勾选合并为一组 / 清空勾选 / 已建联合组列表 ✕ 删除 / 全部清除回自动均分）、
   v229 保存分组 / 调出分组 / 恢复初始化三钮、v112 本地快照（tlManualGroupsSnapshotKey /
   tlSaveManualGroups / tlRestoreManualGroups）、v98b 右键合并入口（window.tlMergeIndices，
   tl-workspace 侧菜单项同步删除）全部移除；index.html 的 #tlGroupPanel aside 已删。
   分区此后只按两条原则执行：
     ① 预设 1 / 2 / 3 / 4 区按钮（均分，点按即清空 tlManualGroups）；
     ② 面积亩组合 tlGroupByArea（v220，下方原样保留，写同一 window.tlManualGroups ——
        画布组色带 / M 组标注 / 联合流量 / 演示 chips / 工程量全链路照常消费）。
   保留的公共依赖：tlGroupZoneCount（演示 chips）、tlApplyGroups（面积成组后重生成图面）、
   window.tlRefreshGroupStatus（触发演示 chips 重建）。
   恢复方式：git 历史恢复本段函数块与 index.html 的 #tlGroupPanel。 */
function tlGroupZoneCount() {
  var d = (typeof window !== 'undefined') ? window.tlDiagramData : null;
  var z = d && d.zones; if (!z) return 0;
  var zc = z.cols || (z.xPos ? z.xPos.length - 1 : 0);
  var zr = z.rows || (z.yPos ? z.yPos.length - 1 : 0);
  return zc * zr;
}
function tlApplyGroups() {
  try { if (typeof window.runyeSaveProject === 'function') window.runyeSaveProject(true); } catch (e) { }   /* v105：静默保存（不弹「方案已保存到本机」） */
  /* v105：合并/删组后立即重生成图面（等效点「生成管线图」）—— 组色带、组标注、联合流量即时生效，
     不再需要手动点右侧工具栏「生成管线图」才变色。失败时走下面的轻量重渲染兜底。
     注意：tlAutoGenerate 不刷分组面板/左栏状态表，故不提前 return，保留原有刷新链。 */
  try { if (typeof tlAutoGenerate === 'function') { tlAutoGenerate({ scroll: false }); } } catch (e) { }
  try { if (typeof render === 'function') render(); } catch (e) { }
  var wsCtn = document.getElementById('tlWsContent');
  if (wsCtn && window.RyTlWs && window.tlDiagramData) { try { window.RyTlWs.render(wsCtn, window.tlDiagramData); } catch (e) { } }
  if (typeof window.tlRefreshGroupStatus === 'function') window.tlRefreshGroupStatus();
}
/* [2026-10-27] tlMergeChecked / tlDeleteGroup / tlResetAllGroups（v98 手动合并三件套）
   随面板删除 —— 手动勾选合并入口不存在了；唯一写 window.tlManualGroups 的活跃入口
   只剩下方 tlGroupByArea（面积亩组合）。 */
/* [2026-10-27] v112 手动分组快照（tlManualGroupsSnapshotKey / tlSnapHint / tlSaveManualGroups /
   tlRestoreManualGroups）与 v98b 右键合并入口（window.tlMergeIndices / window.tlApplyGroups 导出）
   随面板与右键菜单项删除。window.tlManualGroups 的持久化仍走 runyeSaveProject（inline-12 存档
   manualGroups 字段原样兼容 —— 面积亩组合的结果照常随方案保存/载入）。 */
/* ---------- [v220 2026-10-04 用户要求] 按目标面积把分区顺序累加成联合灌溉组 ----------
 * 用户原话：「设定联合灌溉区为 36 亩，自动按顺序累加二级管路传递过来的分区面积，
 *            累计到 36 亩范围内作为一个联合灌溉区，这样我可以把 3/4/5 个小灌溉区合成一个联合灌溉区。」
 * 算法：贪心顺序累加 —— zi 从 0 起，累计 ≤ 目标就并入当前组；下一个加进去会超、且当前组非空
 *       ⇒ 断组开新组。单区自身就超目标时独占一组（不许空组、不许回退，保证覆盖全部分区）。
 * 面积口径：在线地图当前地块 partitions.area；显示与成组均读取同一份地图分区面积数组。
 * 落点：window.tlManualGroups（与手动合并同一份状态）+ tlApplyGroups() ⇒ 着色/组标注/联合流量/
 *       演示 chips/保存调出全链路零改动复用；点上方 N 区按钮即回到均分（既有清空路径，天然互补）。 */
function tlGroupByArea() {
  /* 反馈直接写 #atToast（页面统一的 toast 元素）。⚠ 不能调 atShowToast——它在面积工具 IIFE
     （13544 起）内部，本函数所在 script 块不可见（实测 typeof=undefined）；也不能兜底 alert——
     headless/自动化环境会整页阻塞（首轮体检实测 CDP 超时卡死）。任何失败静默，不影响分组。 */
  function _tlToast(m) {
    try {
      var t = document.getElementById('atToast');
      if (!t) return;
      t.textContent = m; t.classList.add('show');
      if (_tlToast._t) clearTimeout(_tlToast._t);
      _tlToast._t = setTimeout(function () { t.classList.remove('show'); }, 2600);
    } catch (e) { }
  }
  var inp = document.getElementById('tlAreaGroupMu');
  var targetMu = inp ? parseFloat(inp.value) : NaN;
  if (!isFinite(targetMu) || targetMu <= 0) { _tlToast('请先填写有效的目标面积（亩）'); return false; }
  var d = window.tlDiagramData;
  var z = d && d.zones;
  var total = z ? ((z.cols || (z.xPos ? z.xPos.length - 1 : 0)) * (z.rows || (z.yPos ? z.yPos.length - 1 : 0))) : 0;
  if (!(total > 0)) { _tlToast('请先生成三级管线平面图'); return false; }
  var areas = readOnlineMapZoneAreas();
  if (areas && areas.length !== total) areas = null;
  if (!areas) { _tlToast('请先取得地图实测总面积，并在本页完成有效分区'); return false; }
  var MU = 666.67, targetM2 = targetMu * MU;
  var groups = [], cur = [], sum = 0;
  for (var zi = 0; zi < total; zi++) {
    var a = areas[zi] || 0;
    if (cur.length && sum + a > targetM2) { groups.push(cur); cur = []; sum = 0; }   /* 加不下 ⇒ 断组 */
    cur.push(zi); sum += a;
  }
  if (cur.length) groups.push(cur);
  window.tlManualGroups = groups;
  tlApplyGroups();
  var detail = groups.map(function (g, gi) {
    var s = 0; for (var i = 0; i < g.length; i++) s += (areas[g[i]] || 0);
    return 'M' + (gi + 1) + '=' + (s / MU).toFixed(1) + '亩(区' + g.map(function (x) { return x + 1; }).join('/') + ')';
  }).join('，');
  _tlToast('已按 ' + targetMu + ' 亩成 ' + groups.length + ' 组：' + detail);
  return true;
}
window.tlGroupByArea = tlGroupByArea;
/* 面积成组按钮接线（v220/v233/v470）。
   [2026-10-27] 原 v98 面板按钮接线（合并/清空勾选/全部清除/保存/调出/恢复初始化/组列表✕）
   随 #tlGroupPanel 删除 —— 元素不存在，接线整体移除；仅保留面积成组一族。 */
(function () {
  var ab = document.getElementById('tlAreaGroupBtn');
  if (ab) ab.addEventListener('click', tlGroupByArea);
  var ai = document.getElementById('tlAreaGroupMu');
  if (ai) ai.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); tlGroupByArea(); } });
  var acb = document.getElementById('tlAreaGroupCalcBtn');
  /* [v233] 成组成功（tlGroupByArea 返回 true）才点亮 .on；失败（无图/亩数非法）保持原样。
     [v470]（2026-10-15 用户要求）撤销 v469：「按亩组合」是执行按钮，接线原样恢复。 */
  if (acb) acb.addEventListener('click', function () {
    if (tlGroupByArea() !== false) acb.classList.add('on');
  });
  /* 点 1/2/3/4 区（均分）= 既有路径清空按亩分组 ⇒ 高亮同步熄灭（程序化 .click() 也会冒泡到这里）。 */
  var zcg = document.getElementById('tlZoneCountGroup');
  if (zcg) zcg.addEventListener('click', function () { if (acb) acb.classList.remove('on'); });
})();
/* 联合灌溉分组图例（2026-09-16 补全）：在三级简图 #tlDiagramContent 叠加 HTML 图例，
   不进简图 SVG（不破坏下载/打印成图）；驱动 tlDiagramData.combinedN；N 改变即时刷新。
   ★★ 2026-09-17 第五十九轮：用户要求「三级系统简图，这个卡片取消吧」——
   开关置 true 后本函数为纯清理空操作（不再创建 #tlGroupLegend；若页面上残留旧节点则移除）。
   恢复方式：把下面常量改回 false 即恢复（buildGroupLegend / 拖动 / 改宽代码全部保留）。 */
var TL_GROUP_LEGEND_OFF = true;
function tlRefreshGroupLegend() {
  var ex = document.getElementById('tlGroupLegend'); if (ex && ex.parentNode) ex.parentNode.removeChild(ex);
  if (TL_GROUP_LEGEND_OFF) return;   /* 图例已取消（第五十九轮）：不再创建节点 */
  var lc = document.getElementById('tlDiagramContent'); if (!lc || !window.RyTlWs) return;
  if (getComputedStyle(lc).position === 'static') lc.style.position = 'relative';   /* 保证图例绝对定位以 #tlDiagramContent 为基准（第三十九轮） */
  var lg = window.RyTlWs.buildGroupLegend(window.tlDiagramData);
  if (!lg) return;
  var tmp = document.createElement('div'); tmp.innerHTML = lg;
  var node = tmp.firstChild; if (node) lc.appendChild(node);
  tlPositionLegendInsideFrame(lc, node);   /* 默认落在图框内（第三十九轮） */
  tlWireLegendDrag(node);                 /* 标题栏拖动放置 */
  tlWireLegendResize(node);               /* 右缘拖动调宽度 */
}
/* 图例默认定位：贴 A3 图框右上内缩（2026-10-06 v272 图框改双线后，取 26px=内框线16px+10px，
   保证图例整体落在内细框之内——querySelector('svg #tlFrameGroup rect') 取第一个=外粗框） */
var _tlLegendUserPos = null;   /* 用户拖动后的位置记忆，N 改变重建时复用 */
function tlPositionLegendInsideFrame(lc, node) {
  if (_tlLegendUserPos) {
    node.style.left = _tlLegendUserPos.left + 'px';
    node.style.top = _tlLegendUserPos.top + 'px';
    node.style.right = 'auto';
    return;
  }
  var fr = lc.querySelector('svg #tlFrameGroup rect') || lc.querySelector('svg rect');
  if (!fr || fr.getBoundingClientRect().width === 0) return;   /* 图框尚未布局（隐藏态）时不动，等切到「三级简图」再定位 */
  var frr = fr.getBoundingClientRect(), lr = lc.getBoundingClientRect();   /* 以 A3 图框（非 svg 元素）为基准，避免 preserveAspectRatio 信箱化导致溢出 */
  var w = node.offsetWidth || 180;
  node.style.left = ((frr.right - lr.left) - w - 26) + 'px';
  node.style.top = ((frr.top - lr.top) + 26) + 'px';
  node.style.right = 'auto';
}
function tlWireLegendDrag(node) {
  var h = node.querySelector('.tl-legend-drag'); if (!h) return;
  h.addEventListener('mousedown', function (e) {
    e.preventDefault(); e.stopPropagation();
    var sx = e.clientX, sy = e.clientY, l0 = node.offsetLeft, t0 = node.offsetTop;
    function mv(ev) {
      node.style.left = (l0 + ev.clientX - sx) + 'px';
      node.style.top = (t0 + ev.clientY - sy) + 'px';
      node.style.right = 'auto';
    }
    function up() {
      document.removeEventListener('mousemove', mv);
      document.removeEventListener('mouseup', up);
      _tlLegendUserPos = { left: node.offsetLeft, top: node.offsetTop };
    }
    document.addEventListener('mousemove', mv);
    document.addEventListener('mouseup', up);
  });
}
function tlWireLegendResize(node) {
  var r = node.querySelector('.tl-legend-resize'); if (!r) return;
  r.addEventListener('mousedown', function (e) {
    e.preventDefault(); e.stopPropagation();
    var sx = e.clientX, sw = node.offsetWidth;
    var maxW = (node.parentNode ? node.parentNode.clientWidth : 600) * 0.8;
    function mv(ev) {
      var nw = Math.max(140, Math.min(sw + ev.clientX - sx, maxW));
      node.style.width = nw + 'px';
      node.style.maxWidth = 'none';
    }
    function up() {
      document.removeEventListener('mousemove', mv);
      document.removeEventListener('mouseup', up);
    }
    document.addEventListener('mousemove', mv);
    document.addEventListener('mouseup', up);
  });
}

/* 左下角「管段长度与水头损失」信息卡（2026-09-16 用户要求）：
   显示总管/主管/支管各自的长度与水头损失，并注明按「最远分区最不利路径」计（不把各地块管道相加）。
   图面已生成时长度取图面实际几何（最远分区），否则显示试算输入值并在卡内提示。
   [v1017 P1 口径收口（TASK_pump_head_mismatch_20261108 §5.2）] 存在改径生效
   （手动选管残留 或 图面改径 override）时，卡内明示当前生效管径三档 + 「↺ 退回设计档」
   一键清除 —— 消除「管损卡按 Ø160 在算、选管却显示设计档 Ø180」的口径分叉（用户实测疑点②）。 */
function tlLossCalsActive(r) {
  var mc = window.tlManualCals || {};
  var hasManual = (mc.front != null || mc.main != null || mc.branch != null);
  var hasOverride = false;
  try { hasOverride = !!(tlAppliedPipeOverride() && tlAppliedPipeOverride().calibers &&
    Object.keys(tlAppliedPipeOverride().calibers).length); } catch (eOv) { }
  return hasManual || hasOverride;
}
function tlLossResetCals() {
  window.tlManualCals = { front: null, main: null, branch: null };
  tlPipeOdOverride = null;   /* AE 数据本体保留（重新「应用到图面」可恢复），仅退出生效 */
  try { if (typeof window.tlPumpUpdateRun === 'function') { window.tlPumpUpdateRun(); return; } } catch (e1) { }
  try { tlUpdatePlanBar(); } catch (e2) { }
  try { tlRefreshLossCard(); } catch (e3) { }
}
function tlBindLossReset() {
  if (window._tlLossResetBound) return; window._tlLossResetBound = true;
  document.addEventListener('click', function (ev) {
    var t = ev.target;
    if (t && t.id === 'tlLossResetCals') { ev.preventDefault(); tlLossResetCals(); }
  });
}
function tlRefreshLossCard(r) {
  var el = document.getElementById('tlLossCard'); if (!el) return;
  try {
    if (!r) r = computeThreeLevel();
    if (!r) { el.innerHTML = '<p>请先取得地图实测总面积，并在本页完成有效分区，再进行水力校核。</p>'; return; }
    tlBindLossReset();
    function f1(v) { return (isFinite(v) ? v : 0).toFixed(1); }
    function f2(v) { return (isFinite(v) ? v : 0).toFixed(2); }
    var fromFig = !!(r.wp && r.wp.fromFigure);
    /* [v618 2026-10-20 用户要求] 括号内分隔符 `·` → `*`：
       「（图面实际 · 最远 30 区）」→「（图面实际 * 最远 30 区）」，其余字面一字未改。 */
    var ziTxt = fromFig ? ('图面实际 * 最远 ' + (r.wp.zoneIndex + 1) + ' 区')
      : (tlDiagramHasPipes()
        ? '试算输入值 · <span style="color:#b45309">自动水路不可用，请在在线地图绘制总管后重算</span>'
        : '试算输入值');
    /* [v613] 外观全部交给 style-01.css 的 .tl-flat-*（灰条标题 / 22px 行 / 小字说明），
       本函数只负责结构 + 数值，不再往 DOM 上写 inline 样式 —— 与三级面板其余几条走同一套网格。
       原来这里是「加粗黑标题 + 虚线分隔 + 卡片内边距」，与上面的灰条行完全不是一个语言。 */
    function row(name, len, loss) {
      return '<div class="tl-flat-row">'
        + '<span>' + name + '</span>'
        + '<span>' + f1(len) + ' m · 损失 <b style="color:#b45309">' + f2(loss) + ' m</b></span></div>';
    }
    /* [v1017 P1] 生效管径行：有改径生效时才出现（未改径不添噪）。管径读参与计算的
       r.*Pipe.od（computeThreeLevel 已按手动档/override 覆写），不是设计档。 */
    var calsLine = '';
    if (tlLossCalsActive(r)) {
      calsLine = '<div class="tl-flat-note" style="color:#b45309">生效管径（含改径档）：总管 Ø'
        + Math.round(r.frontPipe.od) + ' / 主管 Ø' + Math.round(r.mainPipe.od)
        + ' / 支管 Ø' + Math.round(r.branchPipe.od)
        + '<span id="tlLossResetCals" style="float:right;cursor:pointer;text-decoration:underline;color:#b45309">↺ 退回设计档</span></div>';
    }
    el.innerHTML = '<div class="tl-flat-head">管段长度与水头损失</div>'
      + '<div class="tl-flat-note">按「最远分区最不利路径」计（' + ziTxt + '），不叠加各地块管道</div>'
      + row('总管', r.frontLenUsed, r.frontPipeLoss)
      + row('主管', r.mainLenUsed, r.mainLoss)
      + row('支管', r.branchLenUsed, r.branchLoss)
      + '<div class="tl-flat-row"><span>合计</span>'
      + '<span>' + f1((r.frontLenUsed || 0) + (r.mainLenUsed || 0) + (r.branchLenUsed || 0)) + ' m'
      + ' · 损失 <b style="color:#b45309">' + f2(r.totalPipeLoss) + ' m</b></span></div>'
      + calsLine
      + '<div class="tl-flat-note">'
      + (fromFig ? '主管含由总管接入该区的连接段' : '生成管线图后改用图面实际几何') + '</div>';
    el.style.display = 'block';
  } catch (e) { }
}

/* 右侧工作区工具栏显隐：没有施工图时隐藏管路编辑工具。 */
function tlWsBarSync() {
  var bar = document.getElementById('tlWsToolbar');
  if (!bar) return;
  bar.style.display = window.tlDiagramData ? 'flex' : 'none';
}

function tlUpdatePlanBar() {
  /* 左下角「管段长度与水头损失」信息卡同步刷新（无 polygon 时也要显示试算值，故放在提前返回之前） */
  try { tlRefreshLossCard(); } catch (e) { }
  var poly = window.measuredPolygon || [];
  var hintEl = document.getElementById('tlPpHint');
  if (!poly || poly.length < 3) {
    if(hintEl) hintEl.style.display = 'block';
    return;
  }
  if(hintEl) hintEl.style.display = 'none';

  var minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for (var i=0;i<poly.length;i++){
    var p=poly[i];
    if(p.x<minX)minX=p.x;if(p.x>maxX)maxX=p.x;
    if(p.y<minY)minY=p.y;if(p.y>maxY)maxY=p.y;
  }
  var w=maxX-minX, h=maxY-minY;
  var planA=document.getElementById('tlPlanA');
  var planB=document.getElementById('tlPlanB');
  if(planA) planA.textContent=w.toFixed(0);
  if(planB) planB.textContent=h.toFixed(0);
  /* 2026-09-15 左栏取消长边A/宽边B显示（用户要求）；数值存全局供输出图标题与几何读取 */
  window.runyePlanDims={A:Math.round(w),B:Math.round(h)};

  var zc = tlGetZoneCount();
  var zoneCountInput = document.getElementById('tl_zoneCount');
  if(zoneCountInput) zoneCountInput.value = zc;
  /* 2026-09-16 面板「总管长度」输入已取消：tlUpdatePlanBar 不再读取/覆盖 tl_frontPipeLen，
     总管长度改由下方水力参数卡「联合灌溉 总管选型」独立控制（默认 200 不变，存档照常）。 */
  /* [v517] 三级面板「目标流速」输入已取消：改读二级工具栏 #planTargetV（唯一入口）。 */
  var tv = readNumber('planTargetV', 1.5, { min: 0.01 });
  var tvInput = document.getElementById('tl_targetV');
  if(tvInput) tvInput.value = tv;

  var r = computeThreeLevel();
  if (!r) {
    ['tlPlanPumpFlow','tlPlanPumpHead','tlPlanPumpPower','tlPlanFrontPipe','tlPlanMainPipe','tlPlanBranchPipe'].forEach(function (id) {
      var node = document.getElementById(id); if (node) node.textContent = '—';
    });
    var srcNode = document.getElementById('tlPlanCombinedSrc');
    if (srcNode) { srcNode.textContent = '依据：请先取得地图实测总面积并完成本页分区'; srcNode.style.display = ''; }
    return;
  }
  /* v107（2026-09-22 用户要求）：设计值 vs 实际值 ——
     图面改径 + 点「⇧ 更新水泵扬程」后 tlPipeOdOverride 生效（此时 r 即实际值）；
     设计值 = 临时清零覆盖重算、算完立刻恢复；未改径时两者相同（行为与旧版一致）。 */
  var rDes = r, ovApplied = false;
  try {
    var ovTmp = (typeof tlPipeOdOverride !== 'undefined') ? tlPipeOdOverride : null;
    var appliedFig = tlAppliedPipeOverride();
    var manualActive = !!(r && r.manualApplied && window.tlManualCals &&
      (window.tlManualCals.front != null || window.tlManualCals.main != null || window.tlManualCals.branch != null));
    if (appliedFig || manualActive) {
      /* [v973 2026-11-05 用户反馈「设计值是140的管道，不应该把设计值也换了」]
         设计值列必须保持系统自动选径口径 ⇒ 反算 rDes 时 override 与 tlManualCals
         **两者都要清空**。v972 只清 override：图面数据在但没画管线（tlWorstPathLen
         =EMPTY）时手动档落进 computeThreeLevel 的无图面分支，设计值列被改径档污染
         （实测：支管设计 Ø140/1.33 被换成 Ø110/2.23，扬程 38.3 变 38.9）。 */
      ovApplied = true;
      var mcSave = window.tlManualCals;
      tlPipeOdOverride = null;
      window.tlManualCals = { front: null, main: null, branch: null };
      try { rDes = computeThreeLevel(); }
      finally {
        window.tlManualCals = mcSave;
        if (typeof tlPipeOdOverride !== 'undefined') tlPipeOdOverride = ovTmp;
      }
    }
  } catch (eOv) {
    try { if (typeof ovTmp !== 'undefined' && ovTmp) tlPipeOdOverride = ovTmp; } catch (e2) { }
    rDes = r; ovApplied = false;
  }
  function fmt(v,d){d=d==null?1:d;var f=Math.pow(10,d);return (Math.round(v*f)/f).toFixed(d);}
  function fmt0(v){return Math.round(v).toString();}

  var el;
  /* [v1017c 2026-11-08 用户口径] 手绘总管闭环门槛：未在在线地图绘制总管（或总管与当前
     地块不匹配，tlMapTrunkLen 口径「宁撤回、不猜」）时，扬程链的总管长度只能落试算输入值
     —— 扬程必不准。此时水泵扬程/轴功率/电机功率三格与全部改径重算橙列显示 —，
     并常驻提示「请在在线地图绘制总管形成闭环，再计算扬程」（#tlPlanLoopHint）；
     画好总管后自动恢复数字。水泵流量/联合流量与总管无关，照常显示。 */
  var loopOk = false;
  try { var _mtLoop = tlMapTrunkLen(); loopOk = !!(_mtLoop && _mtLoop.ok); } catch (eLoop) { }
  if (el = document.getElementById('tlPlanLoopHint')) el.style.display = loopOk ? 'none' : '';
  if(el=document.getElementById('tlPlanCombinedFlow')) el.textContent=fmt(r.combinedFlow,1)+' m³/h';
  /* v106（2026-09-22 用户要求）：「联合流量」底下注明依据 —— 按哪个联合分区、实际多少亩换算。
     数据与 computeThreeLevel 同源（worstGroup={g,zones,sum}，sum=最大组实际面积和 m²）。
     [v618 2026-10-20 用户要求] 文案简化：「联合流量依据：联合分区 M13…」→「依据：分区 M13…」
     [v890 2026-11-05 双口径补设计亩数与偏差]
     [v1014 2026-11-08 用户要求] 再简化：「依据：分区 M3（1区、2区）*实际面积= 16.9 亩（…）」
     →「依据：分区M3（16.9亩）」，只留组号与实切亩数，区清单与双口径全删。 */
  if (el = document.getElementById('tlPlanCombinedSrc')) {
    if (r.worstGroup) {
      el.textContent = '依据：分区M' + (r.worstGroup.g + 1) + '（' + fmt(r.worstGroup.sum / 666.67, 1) + '亩）';
    } else {
      el.textContent = '依据：暂无图面分组数据（按单区流量 × ' + fmt0(r.zoneCount || 1) + ' 估算）';
    }
    el.style.display = '';
  }
  if(el=document.getElementById('tlPlanPumpFlow')) el.textContent=fmt(r.combinedFlow,1)+' m³/h';
  /* v107：设计列 = 理论选管（无覆盖）计算；未改径时 rDes===r，显示与旧版一致 */
  /* v139（2026-09-23 用户反馈「应用到图面后改径重算列没更新」）：水泵两行回到与管径行同款列语义——
     主列（设计值）= 理论选管计算值；橙列（改径重算）= 应用管径重算值（见下方 tlRealSet 调用）。
     v119 的「主=实际 / 橙=设计」与列头错位，用户读作「改径重算列没更新」；改径后的值
     在橙列与下方黑条（水泵扬程 36.5 m）直接可见。 */
  /* [v1017c] 三主格闭环门槛：未闭环显示 —（数据层 computeThreeLevel 不拦，快照/材料链完整） */
  if(el=document.getElementById('tlPlanPumpHead')) el.textContent=loopOk ? fmt(rDes.pumpHead,1)+' m' : '— m';

  if(el=document.getElementById('tlPlanPumpPower')) el.textContent=loopOk ? fmt(rDes.pumpPower,1)+' kW' : '— kW';
  if(el=document.getElementById('tlPlanMotorPower')) el.textContent=loopOk ? fmt(rDes.motorKW_rounded,1)+' kW' : '— kW';
  if(el=document.getElementById('tlPlanFrontPipe')) el.textContent='Ø '+rDes.frontPipe.od+' mm';
  if(el=document.getElementById('tlPlanFrontVelocity')) el.textContent=fmt(rDes.frontPipe.v,2)+' m/s';
  if(el=document.getElementById('tlPlanMainPipe')) el.textContent='Ø '+rDes.mainPipe.od+' mm';
  /* 2026-09-16 用户要求：补充主管/支管流速（与总管流速同口径：内径满流 v=Q/A） */
  if(el=document.getElementById('tlPlanMainVelocity')) el.textContent=fmt(rDes.mainPipe.v,2)+' m/s';
  if(el=document.getElementById('tlPlanBranchPipe')) el.textContent='Ø '+rDes.branchPipe.od+' mm';
  if(el=document.getElementById('tlPlanBranchVelocity')) el.textContent=fmt(rDes.branchPipe.v,2)+' m/s';
  /* v107：实际列（图面改径 + 「⇧ 更新水泵扬程」重算后的真实值；未改径时显示 —）
     [v1017 P1] 第 5 参 odTxt：流速橙列尾部追加生效管径标注「(Ø160)」——
     生效档可能与设计档不同（残留改径），不标口径就会重演「5.83 反推 Ø160」式误读。
     仅流速三行传；扬程/功率行不传（不涉及管径）。 */
  function tlRealSet(id, v, unit, dec, odTxt) {
    var e2 = document.getElementById(id); if (!e2) return;
    if (!ovApplied || typeof v !== 'number' || !isFinite(v)) { e2.textContent = '—'; e2.style.color = '#cbd5e1'; return; }
    e2.textContent = fmt(v, dec) + ' ' + unit + (odTxt ? ' (' + odTxt + ')' : ''); e2.style.color = '';
  }
  /* v139：扬程/功率橙列（改径重算）= 应用管径重算后的值（与流速行同款 tlRealSet；未应用显示 —） */
  tlRealSet('tlPlanPumpHeadReal', loopOk ? r.pumpHead : NaN, 'm', 1);
  tlRealSet('tlPlanPumpPowerReal', loopOk ? r.pumpPower : NaN, 'kW', 1);
  tlRealSet('tlPlanMotorPowerReal', loopOk ? r.motorKW_rounded : NaN, 'kW', 1);
  /* v109（2026-09-22 用户要求）：管径前后对比 —— 改径重算后实际参与计算的管径
     （computeThreeLevel 按覆盖管径算出的 r.*Pipe.od），与设计管径不同时显示「315 → 280 mm」，
     未改径或改径后没变显示 —（浅灰）。 */
  function tlRealPipe(id, odReal, odDes) {
    var e2 = document.getElementById(id); if (!e2) return;
    if (!ovApplied || typeof odReal !== 'number' || !isFinite(odReal) ||
        Math.round(odReal) === Math.round(odDes)) { e2.textContent = '—'; e2.style.color = '#cbd5e1'; return; }
    e2.textContent = fmt0(odDes) + ' → ' + fmt0(odReal) + ' mm'; e2.style.color = '';
  }
  var usedCals = tlAppliedPipeOverride(), worstZi = r.hydraulicPath && r.hydraulicPath.zoneIndex;
  usedCals = usedCals ? usedCals.calibers : {};
  /* 2026-09-24（用户要求）：总管/主管/支管「改径重算」列改为管径选择按钮 —— 填充并同步选中态 */
  tlRefreshCalSels(r, rDes);
  function actualVelocity(flow, od) {
    return ovApplied ? flow / 3600 / (Math.PI * Math.pow(peInnerDiam(od) / 1000, 2) / 4) : NaN;
  }
  var hp = r.hydraulicPath;
  /* ===== [v1017 P1 口径矩阵（TASK_pump_head_mismatch_20261108 §5.1，写死防再误读）=====
     三行流速橙列的流量口径各不相同（hp = r.hydraulicPath，v900 后图面链恢复前曾恒 null）：
       总管橙列: 流量 = hp ? hp.frontFlow : r.combinedFlow   —— 联合流量（最不利组全组合计）
       主管橙列: 流量 = hp ? hp.mainFlow  : r.zoneFlow       —— 最大单区流量（不是联合流量）
       支管橙列: 流量 = hp ? hp.branchFlow : r.branchFlow    —— 单区流量 ÷ 并联根数
     管径口径（三行一致）：usedCals（生效档，= tlAppliedPipeOverride().calibers 的逐段键，
       含残留改径）优先，无对应键才回退 r.*Pipe.od（computeThreeLevel 已按手动档覆写）。
     管损卡同口径：总管行=联合流量、主管行=单区流量、支管行=单区÷并联，管径=生效档。
     ⇒ 用户反推流量时：总管行对联合流量、主管行对单区流量、支管行对单区÷并联数，
       跨行互相对账必然「对不上」（疑点①的 5.83/145.1 即此）。改这里前先读任务书。 */
  var frontOdUsed = usedCals.front || r.frontPipe.od;
  var mainOdUsed = usedCals['main-' + worstZi] || r.mainPipe.od;
  var branchOdUsed = usedCals['branch-' + worstZi] || r.branchPipe.od;
  tlRealSet('tlPlanFrontVelocityReal', actualVelocity(hp ? hp.frontFlow : r.combinedFlow, frontOdUsed), 'm/s', 2, 'Ø' + Math.round(frontOdUsed));
  tlRealSet('tlPlanMainVelocityReal', actualVelocity(hp ? hp.mainFlow : r.zoneFlow, mainOdUsed), 'm/s', 2, 'Ø' + Math.round(mainOdUsed));
  tlRealSet('tlPlanBranchVelocityReal', actualVelocity(hp ? hp.branchFlow : r.branchFlow, branchOdUsed), 'm/s', 2, 'Ø' + Math.round(branchOdUsed));
  /* 扬程计算过程（三级左栏）：与结果栏同源（computeThreeLevel），生成/切页/改参均经此处刷新 */
  if (typeof ppRenderHeadBreakdown === 'function') ppRenderHeadBreakdown(r);
  /* 管径调整·扬程确认卡（第四十一轮）：随结果栏刷新，无图/无改径时自行隐藏或禁用 */
  if (typeof window.tlPumpUpdateNote === 'function') { try { window.tlPumpUpdateNote(); } catch (e) { } }
  try { if (typeof window.tlRefreshGroupStatus === 'function') window.tlRefreshGroupStatus(r); } catch (e) { }
}

function tlBuildTlNodesLayer(geo) {
  /* v180（2026-10-02）：三级简图补画工作区插入的节点连线 + 节点圆点。
     几何取 geo.frontPipe/mainPipes/branchPipes（与简图已落管线同源）+ 坐标变换 geo.ts；不用 AE.effPts（会叠 lens/moves 错位）。
     返回图层 <g> 字符串；无节点/连线返回 ''。节点与连线各自独立渲染（仅加节点、无连线也显示）。 */
  try {
    if (!geo || !window.RyTlNodes) return '';
    var PG = window.RyTlPolylineGeometry;
    if (!PG) return '';
    var frontPipe = geo.frontPipe, mainPipes = geo.mainPipes, branchPipes = geo.branchPipes, ts = geo.ts;
    if (!frontPipe && !(mainPipes && mainPipes.length) && !(branchPipes && branchPipes.length)) return '';
    if (typeof window.RyTlNodes.links !== 'function' || typeof window.RyTlNodes.nodeById !== 'function') return '';
    var tlNL = window.RyTlNodes.links() || [];
    function tlPipePtsOf(pid) {
      if (pid === 'front') return frontPipe;
      if (pid && pid.indexOf('main-') === 0) { var miN = parseInt(pid.slice(5), 10); return (miN >= 0 && miN < mainPipes.length) ? mainPipes[miN] : null; }
      if (pid && pid.indexOf('branch-') === 0) { var biN = parseInt(pid.slice(7), 10); return (biN >= 0 && biN < branchPipes.length) ? branchPipes[biN] : null; }
      return null;
    }
    function tlPosOfNode(nd) { var ep = tlPipePtsOf(nd.pid); if (!ep) return null; return PG.pointAt(ep, Math.max(0, Math.min(nd.atM, PG.length(ep)))); }
    var tlNLSvg = [];
    tlNL.forEach(function (lk) {
      var na = window.RyTlNodes.nodeById(lk.a), nb = window.RyTlNodes.nodeById(lk.b);
      if (!na || !nb) return;
      var odTxt = (lk.od != null) ? (' \u00d8' + lk.od) : '';
      if (na.pid === nb.pid) {
        var ep = tlPipePtsOf(na.pid); if (!ep) return;
        var L = PG.length(ep);
        var a1 = Math.max(0, Math.min(na.atM, L)), b1 = Math.max(0, Math.min(nb.atM, L));
        if (!(Math.abs(b1 - a1) > 1e-6)) return;
        var sub = PG.sliceArc(ep, Math.min(a1, b1), Math.max(a1, b1)); if (!sub) return;
        var d = ''; sub.forEach(function (p, i) { var q = ts(p.x, p.y); d += (i ? 'L' : 'M') + q.x.toFixed(1) + ' ' + q.y.toFixed(1); });
        var mp = sub[Math.floor(sub.length / 2)], mq = ts(mp.x, mp.y);
        tlNLSvg.push('<path data-tlnodelink="' + lk.id + '" d="' + d + '" fill="none" stroke="#7c3aed" stroke-width="4" stroke-dasharray="2,4" stroke-linecap="round" opacity="0.92"/>');
        tlNLSvg.push('<text x="' + (mq.x + 6).toFixed(1) + '" y="' + (mq.y - 6).toFixed(1) + '" font-size="9.5" font-weight="700" fill="#6d28d9" paint-order="stroke" stroke="#fff" stroke-width="2.5">' + lk.id + ' ' + Math.abs(b1 - a1).toFixed(1) + 'm' + odTxt + '</text>');
      } else {
        var pa = tlPosOfNode(na), pb = tlPosOfNode(nb); if (!pa || !pb) return;
        var qa = ts(pa.x, pa.y), qb = ts(pb.x, pb.y);
        var dc = Math.hypot(pb.x - pa.x, pb.y - pa.y); if (!(dc > 1e-6)) return;
        tlNLSvg.push('<path data-tlnodelink="' + lk.id + '" d="M' + qa.x.toFixed(1) + ' ' + qa.y.toFixed(1) + 'L' + qb.x.toFixed(1) + ' ' + qb.y.toFixed(1) + '" fill="none" stroke="#7c3aed" stroke-width="4" stroke-dasharray="2,4" stroke-linecap="round" opacity="0.92"/>');
        tlNLSvg.push('<text x="' + ((qa.x + qb.x) / 2 + 6).toFixed(1) + '" y="' + ((qa.y + qb.y) / 2 - 6).toFixed(1) + '" font-size="9.5" font-weight="700" fill="#6d28d9" paint-order="stroke" stroke="#fff" stroke-width="2.5">' + lk.id + ' ' + dc.toFixed(1) + 'm \u8de4\u63a5' + odTxt + '</text>');
      }
    });
    var ndListAll = (window.RyTlNodes.list && window.RyTlNodes.list()) || [];
    var tlNdSvg = [];
    ndListAll.forEach(function (nd) {
      var pos = tlPosOfNode(nd); if (!pos) return;
      var q = ts(pos.x, pos.y);
      var deg = (window.RyTlNodes.degreeOf ? window.RyTlNodes.degreeOf(nd.id) : 0);
      var cnt = (window.RyTlNodes.fitTotal ? window.RyTlNodes.fitTotal(nd) : 0);
      tlNdSvg.push('<circle data-tlnode="' + nd.id + '" cx="' + q.x.toFixed(1) + '" cy="' + q.y.toFixed(1) + '" r="5.5" fill="#7c3aed" stroke="#fff" stroke-width="1.4"/>');
      if (deg > 0) tlNdSvg.push('<circle cx="' + (q.x + 6.5).toFixed(1) + '" cy="' + (q.y + 6.5).toFixed(1) + '" r="4.5" fill="#fff" stroke="#f59e0b" stroke-width="1.1"/>' + '<text x="' + (q.x + 6.5).toFixed(1) + '" y="' + (q.y + 8.8).toFixed(1) + '" font-size="6.5" font-weight="700" fill="#b45309" text-anchor="middle">' + deg + '</text>');
      if (cnt > 0) tlNdSvg.push('<circle cx="' + (q.x + 6.5).toFixed(1) + '" cy="' + (q.y - 6.5).toFixed(1) + '" r="4.5" fill="#fff" stroke="#7c3aed" stroke-width="1.1"/>' + '<text x="' + (q.x + 6.5).toFixed(1) + '" y="' + (q.y - 4.2).toFixed(1) + '" font-size="6.5" font-weight="700" fill="#6d28d9" text-anchor="middle">' + cnt + '</text>');
    });
    var out = '';
    if (tlNLSvg.length) out += '<g data-tlnodelink-layer="1">' + tlNLSvg.join('') + '</g>';
    if (tlNdSvg.length) out += '<g data-tlnode-layer="1">' + tlNdSvg.join('') + '</g>';
    return out;
  } catch (e) { return ''; }
}
function tlRefreshTlNodesLayer() {
  /* 订阅 RyTlNodes 变更：实时刷新三级简图（#tlDiagramContent）的节点/连线图层，无需重新「生成管线图」。 */
  var geo = window.__tlPlanGeo; var host = document.getElementById('tlDiagramContent');
  if (!geo || !host) return;
  var svg = host.querySelector('svg'); if (!svg) return;
  /* v183（2026-10-02 用户报「三级简图新增紫色节点/连线偏移，应位于管道上」）：
     刷新层必须挂进 #tlPlotGroup（地块组）——简图的地块/管线/内联节点层全在该组内，
     且组上带「整体拖拽」transform=translate(x,y)（tlInitDrag，localStorage tl-plot-pos）。
     首版把刷新层 appendChild 到 svg 根：地块组一旦被拖动过，任何节点变更（加/移/删）
     触发刷新后节点层跳出组、不随 transform → 节点/连线整体偏移 (−tx,−ty)、脱离管道。 */
  var plotG = svg.querySelector('#tlPlotGroup');
  var parentG = plotG || svg;
  var old = svg.querySelectorAll('[data-tlnodelink-layer],[data-tlnode-layer]');
  /* 锚点：旧层里最后一个挂在组内的元素的 nextSibling —— 生成时内联层位于「滴灌带之后、
     水源/阀门/交接符号之前」，按锚点插回可保持与整图重生成完全一致的叠放次序；
     无旧层（生成时无节点，首个节点由刷新补画）时退化为组末尾追加。 */
  var anchor = null, oi;
  for (oi = 0; oi < old.length; oi++) { if (old[oi].parentNode === parentG) anchor = old[oi].nextSibling; }
  for (oi = 0; oi < old.length; oi++) { if (old[oi].parentNode) old[oi].parentNode.removeChild(old[oi]); }
  var frag = tlBuildTlNodesLayer(geo); if (!frag) return;
  /* DOMParser 解析为 SVG 命名空间，再 importNode 进主 svg（避免 innerHTML 在 SVG 元素上的命名空间陷阱） */
  var parsed = new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg">' + frag + '</svg>', 'image/svg+xml');
  var psvg = parsed.documentElement;
  /* 必须先快照再importNode：importNode 是「复制」不摘除源节点，若写成 while(psvg.firstChild) + importNode
     则 firstChild 永不推进 → 死循环卡死页面（appendChild 是「移动」才可边遍历边摘）。 */
  var kids = Array.prototype.slice.call(psvg ? psvg.childNodes : []);
  for (var ki = 0; ki < kids.length; ki++) {
    var imp = document.importNode(kids[ki], true);
    if (anchor && anchor.parentNode === parentG) parentG.insertBefore(imp, anchor);
    else parentG.appendChild(imp);
  }
}
/* v180b：挂「工作区改动 → 简图实时刷新」的订阅。
   ⚠ 必须在 tl-nodes.js 加载【之后】调用：本函数定义在主脚本内，而 tl-nodes.js 在文件末尾才加载，
   若就地 subscribe，此处 window.RyTlNodes 仍是 undefined → 静默跳过、实时刷新永远不生效
   （v180b 首版就踩了这个坑：节点连线改半天，简图纹丝不动）。故改为具名钩子，由页面在脚本就绪后调用。 */
function tlHookTlNodesLiveSync() {
  if (window.__tlNodesLiveSyncHooked) return true;
  if (!window.RyTlNodes || typeof window.RyTlNodes.subscribe !== 'function') return false;
  window.__tlNodesLiveSyncHooked = true;
  window.RyTlNodes.subscribe(function () {
    try { tlRefreshTlNodesLayer(); } catch (e) {}
    try { tlPublishCurrentNodesToMapSnapshot(); } catch (ePublishNodes) {}
  });
  return true;
}

/* 节点增删/移位后，把节点与当前管线作为同一个地图网络对象原子更新。
   只允许更新仍绑定同一地块、同一几何代且未标记需重规划的网络；否则不把草稿节点
   混入旧管线，仍由「生成施工图」完整发布。 */
function tlPublishCurrentNodesToMapSnapshot() {
  var dd=window.tlDiagramData,host=window.RyMapHost,store=window.RyIrrigationDataStore;
  var pid=window.currentPlotId==null?'':String(window.currentPlotId);
  if(!pid||!dd||!dd.generatedAt||!window.RyTlNodes||!window.RyTlAutoEdits||!host||
      typeof host.projectDesignPointForPlot!=='function'||!store||typeof store.readNetworkLayoutForPlot!=='function'||
      typeof store.writeNetworkLayout!=='function')return false;
  var geometrySig=JSON.stringify([dd.frontPipe,dd.mainPipes,dd.branchPipes,dd.valves,dd.poly]);
  var network=null;
  try{network=store.readNetworkLayoutForPlot(pid);}catch(eReadNodeNetwork){return false;}
  if(!network||String(network.plotId||'')!==pid||network.needsReplan||String(network.diagramGeometrySig||'')!==geometrySig){
    /* [v1069] 拒绝原因暴露给地图端提示：节点已保存但快照待更新 ⇒ 用户知道要点「生成施工图」 */
    window.__tlNodesPublishState={ok:false,reason:'network-stale',ts:Date.now()};
    return false;
  }
  var route=network.routeGeometry;
  if(route&&route.geometrySig!==geometrySig)return false;
  var published=[],routeNodes=[];
  var nodes=window.RyTlNodes.list()||[];
  var effectiveMains=(dd.mainPipes||[]).map(function(line,i){try{return window.RyTlAutoEdits.effPts('main-'+i,dd)||line;}catch(e){return line;}});
  var effectiveBranches=(dd.branchPipes||[]).map(function(line,i){try{return window.RyTlAutoEdits.effPts('branch-'+i,dd)||line;}catch(e){return line;}});
  var displayGeometry=typeof window.ppGetPipeDisplayGeometry==='function'
    ?window.ppGetPipeDisplayGeometry(effectiveMains,effectiveBranches,dd.valves||[],typeof tlGapM==='function'?tlGapM():0)
    :{main:effectiveMains,branch:effectiveBranches};
  function lineLength(line){var sum=0;for(var j=0;j+1<(line||[]).length;j++)sum+=Math.hypot(Number(line[j+1].x)-Number(line[j].x),Number(line[j+1].y)-Number(line[j].y));return sum;}
  function pointAtLine(line,at){var left=Math.max(0,Number(at)||0);for(var j=0;j+1<(line||[]).length;j++){var a=line[j],b=line[j+1],dx=Number(b.x)-Number(a.x),dy=Number(b.y)-Number(a.y),len=Math.hypot(dx,dy);if(len<1e-9)continue;if(left<=len){var t=left/len;return{x:Number(a.x)+dx*t,y:Number(a.y)+dy*t};}left-=len;}return line&&line.length?{x:Number(line[line.length-1].x),y:Number(line[line.length-1].y)}:null;}
  for(var i=0;i<nodes.length;i++){
    var node=nodes[i];
    if(!node||!/^((main|branch))-\d+$/.test(String(node.pid||'')))continue;
    var m=/^(main|branch)-(\d+)$/.exec(String(node.pid)),mi=Number(m[2]);
    if((m[1]==='main'?mi>=(dd.mainPipes||[]).length:mi>=(dd.branchPipes||[]).length))return false;
    var point;
    try{point=window.RyTlAutoEdits.pointAt(node.pid,dd,Number(node.atM));}catch(eNodePoint){return false;}
    var ll=point&&host.projectDesignPointForPlot(pid,point);
    if(!ll||!isFinite(Number(ll[0]))||!isFinite(Number(ll[1])))return false;
    var srcLine=m[1]==='main'?effectiveMains[mi]:effectiveBranches[mi],shownLine=m[1]==='main'?(displayGeometry.main||[])[mi]:(displayGeometry.branch||[])[mi];
    var displayPoint=null,srcLen=lineLength(srcLine),displayLen=lineLength(shownLine);
    if(srcLen>1e-8&&displayLen>1e-8)displayPoint=pointAtLine(shownLine,Math.max(0,Math.min(1,(Number(node.atM)||0)/srcLen))*displayLen);
    var displayLL=displayPoint&&host.projectDesignPointForPlot(pid,displayPoint);
    var item={id:String(node.id||''),pid:String(node.pid),atM:Number(node.atM)||0,lat:Number(ll[0]),lng:Number(ll[1]),displayLat:displayLL?Number(displayLL[0]):Number(ll[0]),displayLng:displayLL?Number(displayLL[1]):Number(ll[1])};
    published.push(item);routeNodes.push({id:item.id,pid:item.pid,mi:mi,kind:m[1],ll:[item.lat,item.lng],displayLL:[item.displayLat,item.displayLng]});
  }
  var next=JSON.parse(JSON.stringify(network));
  next.publishedNodes={version:2,geometrySig:geometrySig,items:published};
  if(next.routeGeometry){next.routeGeometry.nodes=routeNodes;}
  var prior=JSON.stringify(network);
  if(JSON.stringify(next)===prior)return true;
  try{if(store.writeNetworkLayout(next,pid)!==true){window.__tlNodesPublishState={ok:false,reason:'write-failed',ts:Date.now()};return false;}}catch(eWriteNodeNetwork){window.__tlNodesPublishState={ok:false,reason:'write-failed',ts:Date.now()};return false;}
  window.__tlNodesPublishState={ok:true,count:published.length,ts:Date.now()};
  try{if(typeof host.refreshSnapTargets==='function')host.refreshSnapTargets();}catch(eRefreshNodeSnap){}
  try{if(window.RyMapFlowDemo&&typeof window.RyMapFlowDemo.refresh==='function')window.RyMapFlowDemo.refresh();}catch(eRefreshNodeDemo){}
  return true;
}
window.tlPublishCurrentNodesToMapSnapshot=tlPublishCurrentNodesToMapSnapshot;

/* ── 真北方位角（三级简图出图）──────────────────────────────────────────────
   地块坐标与朝向保持真实且固定，分区网格方向不会旋转地块。在线地图与二级设计页
   都不得对地块几何做旋转或镜像；仅三级简图的最终展示旋转整个 SVG，不改变北向计算。
   这里根据地图基准与当前固定地块坐标的映射现场反算真北方向：
     · 参考环 = window.__runyeMapFramePoly（地图口径，北 = +y，与图面顶点同序同点数）；
     · 用相邻点差做样本，最小二乘解 2×2 线性映射 M：地图口径向量 → 图面向量
       （位移不影响方向，故只用边向量，不需要解平移）；
     · 北在图面里的方向 = M·(0,1) = (m12, m22)；
     · 返回「相对正上方的顺时针角」（度）：正上方 = 屏幕角 −90°，故 rot = atan2 + 90°。
   退化：无地图基准（图片测量 / 手画矩形 / 地形模块米坐标）、点数不等、矩阵奇异
   ⇒ 返回 0（朝上）。 */
function tlNorthAngleDeg() {
  try {
    var poly = window.measuredPolygon || [];
    var ref = window.__runyeMapFramePoly || null;
    if (!ref || poly.length < 3 || ref.length !== poly.length) return 0;
    var A00 = 0, A01 = 0, A11 = 0, r1x = 0, r1y = 0, r2x = 0, r2y = 0;
    for (var i = 0; i < poly.length; i++) {
      var j = (i + 1) % poly.length;
      var ax = +ref[j].x - +ref[i].x, ay = +ref[j].y - +ref[i].y;      /* 地图口径边（北=+y） */
      var bx = +poly[j].x - +poly[i].x, by = +poly[j].y - +poly[i].y;  /* 图面边（y 向下） */
      if (!isFinite(ax) || !isFinite(ay) || !isFinite(bx) || !isFinite(by)) return 0;
      A00 += ax * ax; A01 += ax * ay; A11 += ay * ay;
      r1x += ax * bx; r1y += ay * bx;
      r2x += ax * by; r2y += ay * by;
    }
    var det = A00 * A11 - A01 * A01;
    if (!isFinite(det) || Math.abs(det) < 1e-9) return 0;   /* 参考环退化（共线/退化三角形） */
    /* 2×2 正规方程解：M = [[m11,m12],[m21,m22]]，bx = m11·ax + m12·ay，by = m21·ax + m22·ay。
       北向只用到第二列 ⇒ 只解 m12 / m22（第一列不参与，省一半算力）。 */
    var m12 = (A00 * r1y - A01 * r1x) / det;
    var m22 = (A00 * r2y - A01 * r2x) / det;
    var deg = Math.atan2(m22, m12) * 180 / Math.PI + 90;
    if (!isFinite(deg)) return 0;
    while (deg > 180) deg -= 360;
    while (deg < -180) deg += 360;
    return Math.abs(deg) < 0.05 ? 0 : Math.round(deg * 10) / 10;
  } catch (e) { return 0; }
}
window.tlNorthAngleDeg = tlNorthAngleDeg;

/* [v837] 本文件自带的 HTML 转义。
   ★ 为什么必须自带（2026-10-31 实测踩到）：`esc` 的定义在 **mod/inline-14.js**（全局函数），
     而 inline-14.js 在 index.html 里排在 inline-09.js **之后**加载。于是任何「inline-09 已就绪、
     inline-14 尚未执行」的时间窗里调用下面这些函数，转义点就会抛 `ReferenceError: esc is not defined`。
     最致命的是 `tlAutoGenerate` 的 **catch 分支**（错误提示框）也用了它 ⇒ 真正的错误被
     「esc is not defined」顶替，控制台只剩一条与病因无关的报错，现场无法定位（v837 前就是这样
     把「规范绘图模型拒绝三级生成结果」埋掉的）。`tlPrintDiagram`（打印图纸）同样吃这个全局。
   ⇒ 本文件不再依赖别的脚本提供转义；语义与 inline-14 的同名函数逐字一致（& < > " 四字符）。 */
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* 生成施工图后校验并刷新已投影的唯一地图快照；节点仍由 RyTlNodes 独立持久化。 */
function tlSyncGeneratedMapSnapshot() {
  var dd = window.tlDiagramData;
  if (!(dd && dd.generatedAt && Array.isArray(dd.mainPipes) && Array.isArray(dd.branchPipes))) {
    alert('当前管线图尚未生成，在线地图没有可同步的管线成果。');
    return false;
  }
  var currentAngle = null;
  try {
    var pp = window.ppGetState && window.ppGetState();
    if (pp && isFinite(Number(pp.zoneAngleDeg))) currentAngle = Number(pp.zoneAngleDeg);
  } catch (eState) { }
  var generatedAngle = dd.zones && dd.zones.frame && isFinite(Number(dd.zones.frame.angle))
    ? Number(dd.zones.frame.angle) : null;
  if (currentAngle !== null && (generatedAngle === null || Math.abs(currentAngle - generatedAngle) > 0.05)) {
    alert('当前分区角度与管线成果不一致，在线地图未同步。请重新生成施工图。');
    return false;
  }
  /* tlAutoGenerate 的网络投影必须确实落到当前地块的正式网络槽；只检查三级内存图
     会把投影失败误报成回传成功，尤其是地图分区与管网事务提交失败时。 */
  var plotId=window.currentPlotId==null?'':String(window.currentPlotId);
  var store=window.RyIrrigationDataStore;
  var network=null,networkState=null;
  var geometrySig=JSON.stringify([dd.frontPipe,dd.mainPipes,dd.branchPipes,dd.valves,dd.poly]);
  try{
    network=store&&store.readNetworkLayout?store.readNetworkLayout():null;
    networkState=network&&store&&store.readNetworkLayoutStateForCurrentPlot
      ?store.readNetworkLayoutStateForCurrentPlot(network):null;
  }catch(eNetworkRead){network=null;}
  if(!plotId||!network||!networkState||networkState.status!=='current'||
      network.needsReplan||String(network.plotId)!==plotId||
      String(network.diagramGeometrySig||'')!==geometrySig){
    alert('当前管线成果尚未完整写入在线地图数据，或分区角度已变更；地图未同步。请重新生成施工图。');
    return false;
  }
  var publishedNodeState=network.publishedNodes;
  if(!publishedNodeState||publishedNodeState.version!==2||publishedNodeState.geometrySig!==geometrySig||!Array.isArray(publishedNodeState.items)){
    alert('施工节点尚未与当前管线一起发布到在线地图。请确认三级节点已保存；节点会在几何同代时自动同步，或点击「生成施工图」重新发布。');
    return false;
  }
  var route=network.routeGeometry;
  var expectedMainCount=Array.isArray(dd.mainPipes)?dd.mainPipes.filter(function(line){return Array.isArray(line)&&line.length>=2;}).length:0;
  var expectedBranchCount=Array.isArray(dd.branchPipes)?dd.branchPipes.filter(function(line){return Array.isArray(line)&&line.length>=2;}).length:0;
  var expectedNodeCount=publishedNodeState.items.length;
  function validLLPair(p){return Array.isArray(p)&&p.length>=2&&isFinite(Number(p[0]))&&isFinite(Number(p[1]))&&Math.abs(Number(p[0]))<=90&&Math.abs(Number(p[1]))<=180;}
  function validLLLine(line){return Array.isArray(line)&&line.length>=2&&line.every(validLLPair);}
  if(!route||route.version!==2||route.geometrySig!==geometrySig||
      !Array.isArray(route.mains)||route.mains.length!==expectedMainCount||
      !Array.isArray(route.branches)||route.branches.length!==expectedBranchCount||
      !Array.isArray(route.displayMains)||route.displayMains.length!==expectedMainCount||
      !Array.isArray(route.displayBranches)||route.displayBranches.length!==expectedBranchCount||
      !Array.isArray(route.valves)||route.valves.length!==(Array.isArray(dd.valves)?dd.valves.length:0)||
      !Array.isArray(route.nodes)||route.nodes.length!==expectedNodeCount||
      route.mains.some(function(line){return !validLLLine(line);})||route.branches.some(function(line){return !validLLLine(line);})||
      route.displayMains.some(function(line){return !validLLLine(line);})||route.displayBranches.some(function(line){return !validLLLine(line);})||
      route.valves.some(function(v){return !v||!validLLPair(v.ll)||!Number.isInteger(Number(v.mi))||Number(v.mi)<0||Number(v.mi)>=expectedMainCount||
        (v.anchorLL!=null&&!validLLPair(v.anchorLL));})||
      route.nodes.some(function(n,i){
        var item=publishedNodeState.items[i],ll=n&&n.ll,pipe=n&&/^(main|branch)-(\d+)$/.exec(String(n.pid||''));
        return !n||!item||String(n.id||'')!==String(item.id||'')||String(n.pid||'')!==String(item.pid||'')||
          !/^(main|branch)$/.test(String(n.kind||''))||!pipe||pipe[1]!==n.kind||Number(pipe[2])!==Number(n.mi)||
          !Number.isInteger(Number(n.mi))||Number(n.mi)<0||Number(n.mi)>=(n.kind==='main'?expectedMainCount:expectedBranchCount)||
          !validLLPair(ll)||!isFinite(Number(item.lat))||!isFinite(Number(item.lng))||Math.abs(Number(item.lat))>90||Math.abs(Number(item.lng))>180||
          Math.abs(Number(ll[0])-Number(item.lat))>1e-7||Math.abs(Number(ll[1])-Number(item.lng))>1e-7||
          !validLLPair(n.displayLL);
      })){
    alert('在线地图管线、阀门或节点寻路快照不完整/不同步，地图未确认发布。请重新生成施工图。');
    return false;
  }
  /* 回传前核对图面与地图快照的关键构件数量。生成阶段已将唯一快照写入地块管网槽；
     这里不另建第二份数据，只拒绝不完整/旧快照，避免把“已打开地图”误报成“已完整回传”。 */
  var segs=Array.isArray(network.segments)?network.segments:[];
  function validLineCount(lines){return Array.isArray(lines)?lines.filter(function(line){return Array.isArray(line)&&line.length>=2;}).length:0;}
  function storedKindCount(kind){return segs.filter(function(s){return s&&(s.kind===kind||String(s.id||'').indexOf(kind)===0);}).length;}
  var missing=[];
  ['main','branch'].forEach(function(kind){
    var expected=validLineCount(dd[kind==='main'?'mainPipes':'branchPipes']);
    if(storedKindCount(kind)<expected)missing.push(kind==='main'?'主管':'支管');
  });
  if(dd.frontPipe&&dd.frontPipe.length>=2&&storedKindCount('front')<1)missing.push('总管连接段');
  var expectedValves=Array.isArray(dd.valves)?dd.valves.filter(function(v){return v&&isFinite(Number(v.x))&&isFinite(Number(v.y));}).length:0;
  var expectedTapes=validLineCount(dd.dripTapes);
  if((network.valves||[]).length<expectedValves)missing.push('阀门');
  if((network.dripTapes||[]).length<expectedTapes)missing.push('滴灌带');
  if(dd.sourcePos&&!network.sourcePos)missing.push('水源点');
  if(missing.length){
    alert('在线地图快照缺少：'+missing.join('、')+'。地图未同步，请重新生成施工图。');
    return false;
  }
  /* 同标签页写入不触发 storage 事件，显式重绘在线地图、节点捕捉点与轮灌演示。 */
  try { if (window.RyMapHost && typeof window.RyMapHost.refresh === 'function') window.RyMapHost.refresh(); } catch (eMapRefresh) { }
  try { if (window.RyMapHost && typeof window.RyMapHost.refreshSnapTargets === 'function') window.RyMapHost.refreshSnapTargets(); } catch (eNodeRefresh) { }
  try { if (window.RyMapFlowDemo && window.RyMapFlowDemo.refresh) window.RyMapFlowDemo.refresh(); } catch (eRef) { }
  return true;
}
window.tlSyncGeneratedMapSnapshot = tlSyncGeneratedMapSnapshot;

/* [v1054 2026-11-13 用户拍板] 「生成施工图」定稿按钮（#tlGenerateDiagram，三级工具栏顶部）：
   二级分区完成后管线自动生成（v1054 自动重算），用户在三级画完总管等所有信息后点本按钮
   ——① 强制刷新三级简图（确保与当前分区同代、包含三级最新编辑）；② 同步最新成果到
   在线地图；③ 跳在线地图让用户直接看到布置效果。失败 fail-closed 弹窗（v873）。 */
function tlGenerateDiagramToMap(){
  try{
    var poly=window.measuredPolygon||[];
    if(!poly||poly.length<3){
      alert('请先到「在线地图」画框并回传地块，再到「分区与管路」页完成分区（管线会自动生成）。');
      return;
    }
    var ppShare=window.RunyeBridge&&typeof window.RunyeBridge.getPartitionSnapshot==='function'
      ?window.RunyeBridge.getPartitionSnapshot():null;
    if(!ppShare||!(ppShare.mainPipes&&ppShare.mainPipes.length)){
      alert('当前地块还没有管线成果。请回「分区与管路」页完成分区——管线会自动生成——再回来点「生成施工图」。');
      return;
    }
    /* 刷新三级简图：分区刚变过时图面可能还是上一代，强制按当前分区重出一次。 */
    var refreshed=tlAutoGenerate({scroll:false,rethrowError:true,publishToMap:true});
    if(refreshed!==true){
      alert('三级施工简图刷新未完成：'+(window.__runyeSingleL2CommitFailure||'生成失败')+'。请检查分区参数后重试。');
      return;
    }
    if(window.tlSyncGeneratedMapSnapshot()!==true)return;   /* 内部已提示 */
    try{ if(window.atShowToast) window.atShowToast('施工图已生成并同步到在线地图'); }catch(eT){ }
    try{ if(window.RyMapHost&&typeof window.RyMapHost.refresh==='function') window.RyMapHost.refresh(); }catch(eR){}
    try{
      if(typeof window.ryJumpToSection==='function') window.ryJumpToSection('onlineMapSection');
      else if(typeof window.rySetTab==='function') window.rySetTab('onlineMapSection');
    }catch(eJump){}
  }catch(eGen){
    /* [v1069] 发布失败必须让用户看见——此前只 console.warn，用户点「生成施工图」后
       地图没更新还以为节点功能坏了（实际是发布链中途失败且零提示）。 */
    console.warn('[tlGenerateDiagramToMap]',eGen);
    alert('生成施工图未完成：'+((eGen&&eGen.message)||eGen)+'。在线地图保持上一次发布成果；请按提示处理后重试。');
  }
}
window.tlGenerateDiagramToMap=tlGenerateDiagramToMap;
try{
  var _tgBtn=document.getElementById('tlGenerateDiagram');
  if(_tgBtn) _tgBtn.addEventListener('click',function(){ tlGenerateDiagramToMap(); });
}catch(eTgBind){}

/* [v948] 「联合灌溉 1/2/3/4 区」这一排在在线地图上是搬进 #mapDemoDock 显示的
   （mod/map-flow-demo.js 的 v864 dock）。在地图上点它只是换个分区分组看效果，
   不该把人弹去「分区与管路」——所以判一下这一排现在归谁。
   判据两条（任一成立即视为"在地图上"）：① #tlPlanBar 的祖先是 #mapDemoDock；
   ② 在线地图功能区正是当前激活的那一个（dock 被拆/临时搬回时的兜底）。 */
function tlPlanBarOnMap(){
  try{
    var pb = document.getElementById('tlPlanBar');
    if (pb && pb.closest && pb.closest('#mapDemoDock')) return true;
    var sec = document.getElementById('onlineMapSection');
    return !!(sec && sec.classList.contains('ry-active'));
  }catch(e){ return false; }
}

function tlAutoGenerate(options) {
  options = options || {};
  var doScroll = options.scroll !== false;
  var mapSnapshotPublished=false;
  var previousHydraulicDesign=null,hydraulicDesignSaved=false;
  var pendingMapNetwork=null,pendingMapPreviousNetworkRaw=null;
  try {
  // 局部辅助函数（三级页在 IIFE 之外，无法访问二级页内部的 pp* 函数，故此处自包含实现）
  function tlZoneActualAreaM2(zc,zr,zoneCuts,plotPoly){
    if(!plotPoly||plotPoly.length<3)return zoneCuts.xPlan[zc]*zoneCuts.yPlan[zr];
    var x0=tlZoneGx(zoneCuts,zr,zc), y0=tlZoneGy(zoneCuts,zc,zr);
    var x1=tlZoneGx(zoneCuts,zr,zc+1), y1=tlZoneGy(zoneCuts,zc,zr+1);
    /* tlPlotPolyForZone 已经是局部网格坐标；不要在这里再次套 frame。 */
    var clipped=clipPolyToRect(plotPoly,x0,y0,x1,y1);
    return polyAreaM2(clipped);
  }
  function tlZoneSizeLabel(w,h){
    function f(v){ if(!isFinite(v))return '—'; var rounded=Math.round(v); return Math.abs(v-rounded)<0.05?String(rounded):v.toFixed(1); }
    return f(w)+'×'+f(h)+'m';
  }
  // 旧版边界缩进函数保留兼容；自动生成管路不再调用，避免相邻分区管段断开。
  function tlTrimBranchToZone(line){
    if(!line||line.length<2)return line;
    var p1=line[0], p2=line[line.length-1];
    var isH=Math.abs(p1.y-p2.y)<1e-6, isV=Math.abs(p1.x-p2.x)<1e-6;
    if(!isH&&!isV)return line;
    var cx=(p1.x+p2.x)/2, cy=(p1.y+p2.y)/2;
    var zc=-1,zr=-1;
    for(var c=0;c<cols;c++){if(cx>=xPos[c]-0.001&&cx<=xPos[c+1]+0.001){zc=c;break;}}
    for(var r=0;r<rows;r++){if(cy>=yPos[r]-0.001&&cy<=yPos[r+1]+0.001){zr=r;break;}}
    if(zc<0||zr<0)return line;
    var zx2=xPos[zc],zy2=yPos[zr],zoneW2=xSrc[zc],zoneH2=ySrc[zr];
    var gapV=Math.min(Math.max(zoneH2*0.06,4),14,zoneH2*0.22);
    var gapH=Math.min(Math.max(zoneW2*0.06,4),14,zoneW2*0.22);
    var EPS=1.5;
    var out=line.slice();
    if(isV){
      if(Math.abs(out[0].y-zy2)<EPS)out[0].y=zy2+gapV;
      if(Math.abs(out[out.length-1].y-(zy2+zoneH2))<EPS)out[out.length-1].y=zy2+zoneH2-gapV;
    }else{
      if(Math.abs(out[0].x-zx2)<EPS)out[0].x=zx2+gapH;
      if(Math.abs(out[out.length-1].x-(zx2+zoneW2))<EPS)out[out.length-1].x=zx2+zoneW2-gapH;
    }
    return out;
  }
  console.log('[tlAutoGenerate] called, measuredPolygon:', window.measuredPolygon);
  var poly = window.measuredPolygon || [];
  if (!poly || poly.length < 3) {
    alert('请先到「在线地图」画框并回传地块（当前测量点数：' + (poly?poly.length:0) + '）');
    return;
  }

  // Bounds
  var minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for (var i=0;i<poly.length;i++){var p=poly[i];if(p.x<minX)minX=p.x;if(p.x>maxX)maxX=p.x;if(p.y<minY)minY=p.y;if(p.y>maxY)maxY=p.y;}
  var b={minX:minX,minY:minY,w:maxX-minX,h:maxY-minY};
  var tlHasMapTrunkInput=!!(window.__runyeImportedTrunk &&
    String(window.__runyeImportedTrunk.plotId)===String(window.currentPlotId||'') &&
    Array.isArray(window.__runyeImportedTrunk.points) && window.__runyeImportedTrunk.points.length>=2 &&
    window.__runyeImportedTrunk.points.every(function(p){return p&&isFinite(p.x)&&isFinite(p.y);}));
  if(!tlHasMapTrunkInput&&window.currentPlotId){try{
    var _trunkStore=window.RyPlotLibraryStore,_trunkSnap=_trunkStore&&_trunkStore.read();
    var _trunkRows=_trunkSnap&&_trunkSnap.ok?(_trunkSnap.plots||[]).filter(function(p){return p&&String(p.id)===String(window.currentPlotId);}):[];
    /* [v831] 「有没有可用总管」改由 schema 模块判断：v1 单段 / v2 多干线都认，
       且只认主干（pickMainTrunk）—— 与施工图只有一根 frontPipe 的现状一致。 */
    var _ts09=window.RyTrunkSchema;
    var _trunkNorm=(_trunkRows.length===1&&_ts09)?_ts09.normalize(_trunkRows[0].trunk):null;
    tlHasMapTrunkInput=!!(_trunkRows.length===1&&!_trunkRows[0].merged&&!_trunkRows[0].grouped&&
      _trunkNorm&&_trunkNorm.coordinateSystem==='GCJ-02'&&_ts09.pickMainTrunk(_trunkNorm));
  }catch(eTrunkHeader){tlHasMapTrunkInput=false;}}

  // Plan dims
  var planAEl=document.getElementById('tlPlanA');
  var planBEl=document.getElementById('tlPlanB');
  var stDims=window.runyePlanDims||{};
  var plotW=(isFinite(stDims.A)&&stDims.A>0)?stDims.A:(parseFloat(planAEl?planAEl.textContent:'')||b.w);
  var plotH=(isFinite(stDims.B)&&stDims.B>0)?stDims.B:(parseFloat(planBEl?planBEl.textContent:'')||b.h);

  // ===== 数据传导：优先采用二级页分区网格（含旋转、手动切割线偏移），否则用三级页自身参数自动切 =====
  var tlShare = window.RunyeBridge ? window.RunyeBridge.getZoneCuts() : null;
  var cols, rows, xPlan, yPlan, xSrc, ySrc, xPos, yPos;
  if(tlShare && tlShare.cols && tlShare.rows){
    cols=tlShare.cols; rows=tlShare.rows;
    xPlan=tlShare.xPlan; yPlan=tlShare.yPlan; xSrc=tlShare.xSrc; ySrc=tlShare.ySrc;
    xPos=tlShare.xPos; yPos=tlShare.yPos;
    var tlShareDims=window.RunyeBridge.getPlanDims();
    if(tlShareDims && tlShareDims.w>0 && tlShareDims.h>0){ plotW=tlShareDims.w; plotH=tlShareDims.h; }
  } else {
    var zoneMuVal = readNumber('tl_zoneMu', 30);
    var fixedSideVal = readNumber('tl_zoneFixedSide', 300);
    var zoneAreaM2 = Math.max(0.1, zoneMuVal) * MU_TO_SQM;
    var derivedSide = Math.max(1, zoneAreaM2 / fixedSideVal);
    var longIsX = plotW >= plotH;
    var xDesign = longIsX ? derivedSide : fixedSideVal;
    var yDesign = longIsX ? fixedSideVal : derivedSide;

    // Split into zones
    xPlan=splitZoneLength(plotW, xDesign);
    yPlan=splitZoneLength(plotH, yDesign);
    var sx=b.w/plotW, sy=b.h/plotH;
    xSrc=[],ySrc=[],xPos=[b.minX],yPos=[b.minY];
    for(var xi=0;xi<xPlan.length;xi++){xSrc.push(xPlan[xi]*sx);xPos.push(xPos[xPos.length-1]+xSrc[xi]);}
    for(var yi=0;yi<yPlan.length;yi++){ySrc.push(yPlan[yi]*sy);yPos.push(yPos[yPos.length-1]+ySrc[yi]);}
    xPos[xPos.length-1]=b.minX+b.w;
    yPos[yPos.length-1]=b.minY+b.h;
    cols=xPlan.length; rows=yPlan.length;
  }
  var totalZones=cols*rows;
  /* 仅准备反投坐标变换；分区草稿此时仍留在本页，不写入在线地图。 */
  var mapFramePoly=window.__runyeMapFramePoly, mapFrameInv=null;
  try{
    if(mapFramePoly&&mapFramePoly.length===poly.length&&poly.length>=3){
      var mp0=mapFramePoly[0],mp1=mapFramePoly[1],mp2=mapFramePoly[2],qp0=poly[0],qp1=poly[1],qp2=poly[2];
      var mux=mp1.x-mp0.x,muy=mp1.y-mp0.y,mvx=mp2.x-mp0.x,mvy=mp2.y-mp0.y;
      var mdet=mux*mvy-muy*mvx;
      if(isFinite(mdet)&&Math.abs(mdet)>=1e-9){
        var qux=qp1.x-qp0.x,quy=qp1.y-qp0.y,qvx=qp2.x-qp0.x,qvy=qp2.y-qp0.y, miv=1/mdet;
        var ma=(qux*mvy-qvx*muy)*miv, mb=(qvx*mux-qux*mvx)*miv, mc=(quy*mvy-qvy*muy)*miv, md=(qvy*mux-quy*mvx)*miv;
        var mdetL=ma*md-mb*mc;
        if(isFinite(mdetL)&&Math.abs(mdetL)>=1e-9){
          var mil=1/mdetL;
          mapFrameInv={ax:md*mil,ay:-mc*mil,bx:-mb*mil,by:ma*mil,tx:qp0.x-(ma*mp0.x+mb*mp0.y),ty:qp0.y-(mc*mp0.x+md*mp0.y)};
        }
      }
    }
  }catch(eMapFrameInv){mapFrameInv=null;}
  if(mapFrameInv)window.__runyeMapFrameInv=mapFrameInv;
  var planAreas=readCurrentPlanningZoneAreas();
  if(!planAreas||planAreas.length!==totalZones){
    var mismatchTip=document.getElementById('atToast');
    if(mismatchTip){mismatchTip.textContent='当前分区几何或地图实测总面积无效，请检查地块边界与分区';mismatchTip.classList.add('show');setTimeout(function(){mismatchTip.classList.remove('show');},3200);}
    return false;
  }
  /* v98h 阶梯分区本地包装：zX/zY 取「该行 / 该列的割缝位置」；zXb/zYb 取相邻两行/列在指定格上的公共边带。
     空覆盖表时全部退化为 xPos / yPos ⇒ 输出与改动前逐字节一致（eq 基线因此不受影响）。 */
  var tlZoneStepRef = (function () { try { return tlZoneStepFor({ cols: cols, rows: rows, xPos: xPos, yPos: yPos }); } catch (e) { return null; } })();
  var zStepOn = !!(tlZoneStepRef && (tlZoneStepCount() > 0));
  function zX(ri, ci) { var o = tlZoneStepRef && tlZoneStepRef.x, v = o ? o[ri + ',' + ci] : null; return (v != null && isFinite(v)) ? v : xPos[ci]; }
  function zY(ci, ri) { var o = tlZoneStepRef && tlZoneStepRef.y, v = o ? o[ci + ',' + ri] : null; return (v != null && isFinite(v)) ? v : yPos[ri]; }
  function zYb(r, cA, cB) { var a = zY(cA, r), b2 = zY(cA, r + 1), c = zY(cB, r), d = zY(cB, r + 1); var lo = Math.max(a, c), hi = Math.min(b2, d); if (!(hi > lo)) { lo = a; hi = b2; } return [lo, hi]; }
  function zXb(c, rA, rB) { var a = zX(rA, c), b2 = zX(rA, c + 1), c1 = zX(rB, c), d = zX(rB, c + 1); var lo = Math.max(a, c1), hi = Math.min(b2, d); if (!(hi > lo)) { lo = a; hi = b2; } return [lo, hi]; }

  // 预统计：每个分区的实际面积（裁剪到地块多边形）与名义标准区比较，判定"非标分区"
  var tlZoneCuts={xPos:xPos,yPos:yPos,xPlan:xPlan,yPlan:yPlan,frame:tlShare&&tlShare.frame||null,cutOffX:(tlZoneStepRef?tlZoneStepRef.x:null),cutOffY:(tlZoneStepRef?tlZoneStepRef.y:null)};
  /* [v836] frame 换算收口到 core/coord-frame.js（纯函数 + tests/coord_frame.test.cjs）。
     本地保留同名转发：tlGridWorld / tlGridPlotPoly / 各处 tlFrameToGrid 的调用点一行没动。
     公式、单位口径与「frame 自带 toWorld 时优先委托」的规则一起搬进了那个文件头。 */
  function tlFrameToWorld(frame,p){ return window.RyCoordFrame.frameToWorld(frame,p); }
  function tlFrameToGrid(frame,p){ return window.RyCoordFrame.frameToGrid(frame,p); }
  function tlGridWorld(x,y){return tlFrameToWorld(tlZoneCuts.frame,{x:x,y:y});}
  var tlGridPlotPoly=(poly||[]).map(function(p){return tlFrameToGrid(tlZoneCuts.frame,p);});
  var tlGeoBounds=(function(){
    if(!tlZoneCuts.frame)return b;
    var q={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};
    tlGridPlotPoly.forEach(function(p){q.minX=Math.min(q.minX,p.x);q.minY=Math.min(q.minY,p.y);q.maxX=Math.max(q.maxX,p.x);q.maxY=Math.max(q.maxY,p.y);});
    q.w=q.maxX-q.minX;q.h=q.maxY-q.minY;return q;
  })();
  var tlPlotPolyForZone=(tlGridPlotPoly&&tlGridPlotPoly.length>=3)?tlGridPlotPoly:null;
  var tlPartialFlags=[], tlPartialCount=0;
  for(var _zr=0;_zr<rows;_zr++){for(var _zc=0;_zc<cols;_zc++){
    var _zi=_zr*cols+_zc;
    var _stdMu=xPlan[_zc]*yPlan[_zr]/MU_TO_SQM;
    var _m2=tlZoneActualAreaM2(_zc,_zr,tlZoneCuts,tlPlotPolyForZone);
    var _mu=_m2/MU_TO_SQM;
    var _isPartial=_stdMu>0 && _mu<_stdMu*0.97 && _mu>0.05;
    tlPartialFlags[_zi]=_isPartial;
    if(_isPartial)tlPartialCount++;
  }}

  // SVG setup —— 工整三段式布局：顶部标题+信息行、中部图面、底部参数+图例；各段留白均匀
  var svgW=1190, svgH=900, padX=80, headerBottom=110, footerTop=790;
  /* v111c（2026-09-22 用户要求）：绘图区下缘预留 68px 给「地块总尺寸线」——
     原先 drawBottom=footerTop，偏高地块 plotBottom=790 贴住 footer，
     总尺寸线被 min(footerTop-30,·) 钳位到 760、跳进地块底部 30px 内，
     与拖到下方的联合分区分界线小尺寸线（分界线-14px）直接相撞（用户截图：120 m 排压 576 m）。
     收到 footerTop-68 后 plotBottom ≤ 722 ⇒ dimBottomY=plotBottom+38 永不被钳位，
     总尺寸线恒在地块底缘下方 38px、文字 ≤772 仍在 footer(790) 之上；
     小尺寸线 ≤ 地块底缘-14px ⇒ 两者间距恒 ≥52px，结构上不可能再相遇。
     宽扁地块（宽度受限）不受影响；仅偏高地块整体约缩小 9%。 */
  var drawTop=headerBottom, drawBottom=footerTop-68;
  var drawW=svgW-2*padX, drawH=drawBottom-drawTop;
  var s=Math.min(drawW/b.w,drawH/b.h); s=Math.min(s,2);
  var ox=padX+(drawW-b.w*s)/2, oy=drawTop+(drawH-b.h*s)/2;
  function ts(mx,my){return{x:(mx-b.minX)*s+ox,y:(my-b.minY)*s+oy};}
  function tsGrid(gx,gy){var p=tlGridWorld(gx,gy);return ts(p.x,p.y);}
  function tsGridCell(x0,y0,x1,y1){return[tsGrid(x0,y0),tsGrid(x1,y0),tsGrid(x1,y1),tsGrid(x0,y1)];}
  function tlSvgPoints(points){return points.map(function(p){return p.x.toFixed(1)+','+p.y.toFixed(1);}).join(' ');}

  // Plot path
  var d='';
  for(var i=0;i<poly.length;i++){var pp=ts(poly[i].x,poly[i].y);d+=(i===0?'M':'L')+pp.x.toFixed(1)+' '+pp.y.toFixed(1)+' ';}
  d+='Z';

  var parts=[];
  parts.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+svgW+' '+svgH+'" style="background:#fff">');
  // 图框（2026-09-16 恢复；2026-10-06 v272 用户要求改双线出图框，与系统简图三级系统图.html 同款）：
  // 外框粗线（类比 sheet-inner 1.2mm→3px，#111）+ 内框细线（.35mm→1px，间隙 3mm→约7px，内缩16px）；
  // 简图/下载/打印显示；工作区克隆剥离 tlFrameGroup（做图区不显示）；DXF 导出仍整组跳过
  parts.push('<g id="tlFrameGroup">'
    +'<rect x="8" y="8" width="'+(svgW-16)+'" height="'+(svgH-16)+'" fill="none" stroke="#111" stroke-width="3"/>'
    +'<rect x="16" y="16" width="'+(svgW-32)+'" height="'+(svgH-32)+'" fill="none" stroke="#111" stroke-width="1"/>'
    +'</g>');

  var zc=tlGetZoneCount();
  var areaMu=(Number(window.measuredArea)/MU_TO_SQM).toFixed(2);
  var tlPlotNameVal=(document.getElementById('tlPlotName')&&document.getElementById('tlPlotName').value.trim())||'未命名地块';
  // 标题（2026-09-16 恢复）：简图/下载/打印显示；工作区克隆剥离 tlTitleGroup
  parts.push('<g id="tlTitleGroup"><text x="'+svgW/2+'" y="40" text-anchor="middle" font-size="20" font-weight="700" fill="#14532d">润野灌溉 · 三级管线施工简图</text></g>');
  /* ── 指北针（2026-10-20 用户要求「三级简图出图要增加指北针」）────────────────
     位置：A3 图框右上角空白区。信息行从 x=34 起、宽 960 ⇒ 最长到 994；内细框右边线在
       1174；中间 1000..1170 是结构上永不被占用的空白（两行折行也只是往下长，不往右长）。
     方位：按固定地块真实坐标与地图基准计算，分区网格旋转和最终图面旋转都不改真北方位。
     显示范围：简图 / 下载 SVG / 下载 PNG / 打印 全部同源（都出自本 parts）；
       工作区克隆底图与 DXF 导出按「图框装饰」剥离（见 tl-workspace.js、runye-dxf.js）
       —— N 字与角度数值刻意仍放在 #tlNorthGroup 内，就是为了不改那两处剥离规则。
     造型：v643 双圈/双三角 → v646 单圈 + 四向十字刻度（用户选「候选 4」）→ v647 加旋转。 */
  var tlNcx = svgW - 96, tlNcy = 82, tlNr = 24;
  /* [v646 2026-10-21 用户从六个候选里选定「4 十字刻度」] 造型再换一次，cx/cy/r 依旧不动（版面零位移）。
     前情：v643 换成「双圈 + 双三角针」（备选 A）；用户看过并排的六版样张后回「用4吧」——
     4 号 = **单圈 + 四向十字刻度（伸出/收进各 4 单位）+ 双三角针 + 圈外 N**，
     比 v643 多的是那四条刻度：它们把「这是一张工程图的方位标」说清楚了，而单圈又比双圈干净
     （双圈在 A3 约 17mm 时两条圆线会糊成一根粗圈）。
     几何仍全部由 tlNr 推导（针尖 = R×0.71、半底宽 = R×0.229、刻度长 = R×固定 4），改大小只动 tlNr。
     ⚠ 刻度伸到 R+4 = 28 ⇒ 整组 bbox 从 48×~67 长到 56×~72（底端到 y=110，正好是图面顶边线，
       不越界也不压图；右缘 1122 距内细框 1174 还有 52 余量）。 */
  var tlNtip = tlNr * 0.71, tlNbw = tlNr * 0.229, tlNtk = 4;
  /* [v647] 真北：整组绕圆心转 tlNrot（0 = 朝上，与 v646 逐字节一致） */
  var tlNrot = tlNorthAngleDeg();
  var tlNTf = tlNrot ? ' transform="rotate(' + tlNrot + ' ' + tlNcx + ' ' + tlNcy + ')"' : '';
  var tlNarrowN = 'M'+tlNcx+' '+(tlNcy-tlNtip)+' L'+(tlNcx+tlNbw)+' '+tlNcy+' L'+(tlNcx-tlNbw)+' '+tlNcy+' Z';
  var tlNarrowS = 'M'+tlNcx+' '+(tlNcy+tlNtip)+' L'+(tlNcx+tlNbw)+' '+tlNcy+' L'+(tlNcx-tlNbw)+' '+tlNcy+' Z';
  var tlNtick = 'M'+tlNcx+' '+(tlNcy-tlNr-tlNtk)+' L'+tlNcx+' '+(tlNcy-tlNr+tlNtk)
    +' M'+tlNcx+' '+(tlNcy+tlNr-tlNtk)+' L'+tlNcx+' '+(tlNcy+tlNr+tlNtk)
    +' M'+(tlNcx-tlNr-tlNtk)+' '+tlNcy+' L'+(tlNcx-tlNr+tlNtk)+' '+tlNcy
    +' M'+(tlNcx+tlNr-tlNtk)+' '+tlNcy+' L'+(tlNcx+tlNr+tlNtk)+' '+tlNcy;
  /* N 字与角度数值：**仍在 #tlNorthGroup 内**（这样 DXF/工作区克隆的「整组剥离」规则不用改），
     但各自反向转回 −tlNrot，保证任何角度下都正立可读（工程图惯例：盘转、字不倒）。 */
  var tlNlx = tlNcx, tlNly = tlNcy - tlNr - 11;
  var tlNcf = tlNrot ? ' transform="rotate(' + (-tlNrot) + ' ' + tlNlx + ' ' + tlNly + ')"' : '';
  /* 角度数字紧贴 N 右侧（同一条基线上），这样「N +30.0°」读成一组，而不是飘在圆外面 */
  var tlNdegX = tlNlx + 10, tlNdegY = tlNly;
  var tlNdf = tlNrot ? ' transform="rotate(' + (-tlNrot) + ' ' + tlNdegX + ' ' + tlNdegY + ')"' : '';
  parts.push('<g id="tlNorthGroup"'+tlNTf+'>'
    +'<circle cx="'+tlNcx+'" cy="'+tlNcy+'" r="'+tlNr+'" fill="#ffffff" stroke="#111827" stroke-width="1.1"/>'
    +'<path d="'+tlNtick+'" stroke="#111827" stroke-width="1" fill="none"/>'
    +'<path d="'+tlNarrowN+'" fill="#14532d"/>'
    +'<path d="'+tlNarrowS+'" fill="#ffffff" stroke="#14532d" stroke-width="1" stroke-linejoin="round"/>'
    +'<text id="tlNorthN" x="'+tlNlx+'" y="'+tlNly+'"'+tlNcf+' text-anchor="middle" dominant-baseline="middle" font-size="12.5" font-weight="700" letter-spacing="0.4" fill="#14532d">N</text>'
    +(Math.abs(tlNrot) >= 0.5
      ? '<text id="tlNorthDeg" x="'+tlNdegX+'" y="'+tlNdegY+'"'+tlNdf+' text-anchor="start" font-size="9" font-weight="600" fill="#14532d">'+(tlNrot>0?'+':'')+tlNrot.toFixed(1)+'°</text>'
      : '')
    +'</g>');
  // info —— 与图面拉开间距，不再压到地块
  // 信息行：与标题分行；过长时按 " | " 边界自动换行
  var tlHeaderExtra=tlPartialCount>0?(' | 非标准 '+tlPartialCount+' 区'):'';
  var tlHeaderStr='地块名称 '+tlPlotNameVal+'  |  面积 '+areaMu+' 亩  |  地块 '+plotW.toFixed(0)+'×'+plotH.toFixed(0)+' m  |  '+totalZones+'分区  |  联合灌溉 '+zc+'区'+tlHeaderExtra+
    '  |  总管 '+(tlHasMapTrunkInput?'地图手绘':'未绘制，长度按试算参数');
  var tlHeaderSegs=tlHeaderStr.split('  |  ');
  var tlHeaderLines=[], tlCur='';
  for(var hi=0;hi<tlHeaderSegs.length;hi++){
    var tlTrial=tlCur?tlCur+'  |  '+tlHeaderSegs[hi]:tlHeaderSegs[hi];
    if(tlCur && tlMeasureText(tlTrial)>960){ tlHeaderLines.push(tlCur); tlCur=tlHeaderSegs[hi]; }
    else { tlCur=tlTrial; }
  }
  if(tlCur)tlHeaderLines.push(tlCur);
  if(tlHeaderLines.length>2){ var tlRest=tlHeaderLines.slice(1).join('  |  '); tlHeaderLines=[tlHeaderLines[0], tlRest]; }
  var tlHdrY0=70, tlHdrX0=34, tlHdrDefW=960;
  /* Cache segments for dynamic re-wrapping after resize */
  window._tlHeaderSegs=tlHeaderSegs;
  window._tlHeaderDefW=tlHdrDefW;
  window._tlHeaderX0=tlHdrX0;
  window._tlHeaderY0=tlHdrY0;
  /* Header group: draggable + resizable (width → auto re-wrap) */
  parts.push('<g id="tlHeaderGroup">');
  parts.push('<rect id="tlHeaderBg" x="'+(tlHdrX0-8)+'" y="'+(tlHdrY0-14)+'" width="'+(tlHdrDefW+16)+'" height="'+(tlHeaderLines.length*18+8)+'" fill="rgba(255,255,255,0)" stroke="none" rx="4"/>');
  for(var hi2=0;hi2<tlHeaderLines.length;hi2++){
    parts.push('<text x="'+tlHdrX0+'" y="'+(tlHdrY0+hi2*18)+'" text-anchor="start" font-size="12" font-weight="700" fill="#334155" class="tl-hdr-text">'+tlHeaderLines[hi2]+'</text>');
  }
  var _rhX=tlHdrX0-8+tlHdrDefW+16-8, _rhY=tlHdrY0-14+tlHeaderLines.length*18+8-8;
  parts.push('<rect id="tlHeaderHandle" x="'+_rhX+'" y="'+_rhY+'" width="8" height="8" fill="rgba(99,102,241,.35)" rx="2" style="cursor:nwse-resize"/>');
  parts.push('</g>');
  // 信息行折行（超长地块名）时动态下沉图面顶边，给水源标注线留兜底留白，避免压到图面；单行保持 110 不受影响
  if(tlHeaderLines.length>=2){
    headerBottom = tlHdrY0 + tlHeaderLines.length*18 + 16 + 4 + 8;
    drawTop = headerBottom;
    drawH = drawBottom - drawTop;
    s = Math.min(drawW/b.w, drawH/b.h); s = Math.min(s, 2);
    ox = padX + (drawW - b.w*s)/2;
    oy = drawTop + (drawH - b.h*s)/2;
    d='';
    for(var i=0;i<poly.length;i++){var pp=ts(poly[i].x,poly[i].y);d+=(i===0?'M':'L')+pp.x.toFixed(1)+' '+pp.y.toFixed(1)+' ';}
    d+='Z';
  }
  /* 施工管网装配编辑器用：平面 SVG 的世界坐标→屏幕坐标变换（只读导出，不参与本图绘制）。
     编辑器在平面视图叠加管网层时据此换算；地块组被拖动时其 translate 由编辑器另行扣除。 */
  window.tlPlanView = { s: s, ox: ox, oy: oy, minX: b.minX, minY: b.minY, w: svgW, h: svgH };

  // ===== 可拖拽地块组：地块/分区/管线/阀门/水源/尺寸标注 可整体拖动；标题/参数/图例/A3框 固定 =====
  parts.push('<g id="tlPlotGroup">');
  parts.push('<defs><clipPath id="tlPlotClip"><path d="'+d+'"/></clipPath></defs>');
  parts.push('<path d="'+d+'" fill="rgba(147,197,253,.12)" stroke="none"/>');
  parts.push('<path d="'+d+'" fill="none" stroke="#14532d" stroke-width="2"/>');

  // Zone blocks —— 2026-09-16 联合灌溉分组色带（N=zc，组号 g=floor(zi/N)）：
  // 同组同色（浅色带），组间一眼区分；非标区保留琥珀描边；组边界加粗深线强调「哪些区是一组」。
  var zoneCols=['rgba(239,68,68,.12)','rgba(234,179,8,.12)','rgba(22,163,74,.12)','rgba(99,102,241,.12)','rgba(168,85,247,.12)','rgba(236,72,153,.12)','rgba(249,115,22,.12)','rgba(20,184,166,.12)'];   /* RyTlWs 缺失时兜底 */
  var zoneStrokes=['rgba(239,68,68,.5)','rgba(234,179,8,.5)','rgba(59,130,246,.5)','rgba(99,102,241,.5)','rgba(168,85,247,.5)','rgba(236,72,153,.5)','rgba(249,115,22,.5)','rgba(20,184,166,.5)'];
  var tlGN=Math.max(1, zc);                       /* 联合灌溉区数 N */
  var tlManualActive = !!(typeof window!=='undefined' && window.tlManualGroups && window.tlManualGroups.length);
  var tlUngroupedFill = 'rgba(148,163,184,0.14)';
  var gzSvg=[], gzLines=[];
  parts.push('<g clip-path="url(#tlPlotClip)">');
  for(var zr=0;zr<rows;zr++){
    for(var zc2=0;zc2<cols;zc2++){
      var zi=zr*cols+zc2;
      var zx=zX(zr,zc2), zy=zY(zc2,zr);
      /* v98h：无阶梯覆盖时 zX(zr,zc2+1)===xPos[zc2+1] ⇒ zoneW 逐位等于 xSrc[zc2]，输出与改动前一致 */
      /* v101：格矩形必须 = [zX(r,c), zX(r,c+1)] × [zY(c,r), zY(c,r+1)] —— 相邻格共享边，无缝无重叠。
         旧式 xSrc[c]+(zX(r,c+1)-xPos[c+1]) 只并入「本格右线」的偏移，漏掉「本格左线」的偏移，
         等于让这一格整体平移：拖过阶梯后一侧留白、另一侧压到邻格上（用户 2026-09-22 报「填充空白、重叠」）。
         ⚠ 无阶梯覆盖时两个修正项都恰好是 0.0 ⇒ 与旧输出**逐字节相同**（eq 基线不受影响）。 */
      var zoneW=xSrc[zc2]+(zX(zr,zc2+1)-xPos[zc2+1])+(xPos[zc2]-zX(zr,zc2)), zoneH=ySrc[zr]+(zY(zc2,zr+1)-yPos[zr+1])+(yPos[zr]-zY(zc2,zr));
      var cellPts=tsGridCell(zx,zy,zx+zoneW,zy+zoneH), r1=cellPts[0], r2=cellPts[2];
      var grp = tlManualActive ? ((typeof window!=='undefined'&&window.tlZoneManualGroupOf) ? window.tlZoneManualGroupOf(zi) : -1) : Math.floor(zi/tlGN);
      var isPartial=tlPartialFlags[zi];
      var cellFill = (tlManualActive && grp < 0) ? tlUngroupedFill : ((typeof window!=='undefined'&&window.RyTlWs&&window.RyTlWs.groupFillCss)?window.RyTlWs.groupFillCss(grp):zoneCols[zi%zoneCols.length]);
      var cellStroke=isPartial?'rgba(217,119,6,.85)':'rgba(51,65,85,.28)';
      gzSvg.push('<polygon points="'+tlSvgPoints(cellPts)+'" fill="'+cellFill+'" stroke="'+cellStroke+'" stroke-width="1" stroke-dasharray="6,3" data-zi="'+zi+'" data-g="'+grp+'" data-fill="'+cellFill+'" data-stroke="'+cellStroke+'"/>');
    }
  }
  /* 组边界深线：同行内组号变化处画竖向；行与行之间组号变化画横向（仅自动分组模式；手动分组靠色带区分） */
  if (!tlManualActive) {
  for(var glr=0;glr<rows;glr++){
    for(var glc=0;glc+1<cols;glc++){
      if(Math.floor((glr*cols+glc)/tlGN)!==Math.floor((glr*cols+glc+1)/tlGN)){
        var _gyb=zYb(glr,glc,glc+1); var tgA=tsGrid(zX(glr,glc+1),_gyb[0]), tgB=tsGrid(zX(glr,glc+1),_gyb[1]);
        gzLines.push('<line x1="'+tgA.x.toFixed(1)+'" y1="'+tgA.y.toFixed(1)+'" x2="'+tgB.x.toFixed(1)+'" y2="'+tgB.y.toFixed(1)+'" stroke="#1f2937" stroke-width="2.2" opacity="0.62" data-gb="'+Math.floor((glr*cols+glc)/tlGN)+'"/>');
      }
    }
    if(glr+1<rows && Math.floor((glr*cols+cols-1)/tlGN)!==Math.floor(((glr+1)*cols)/tlGN)){
      var _ghs=Math.floor((glr*cols+cols-1)/tlGN);
      if(zStepOn){
        /* v98h 阶梯：行边界成了折线 ⇒ 逐列分段（zStepOn=false 时走 else 原路径，保持单条直线、旧输出不变） */
        for(var gcc=0;gcc<cols;gcc++){
          var _gxb=zXb(gcc,glr,glr+1); if(!(_gxb[1]>_gxb[0]))continue;
          var gC=tsGrid(_gxb[0],zY(gcc,glr+1)), gD=tsGrid(_gxb[1],zY(gcc,glr+1));
          gzLines.push('<line x1="'+gC.x.toFixed(1)+'" y1="'+gC.y.toFixed(1)+'" x2="'+gD.x.toFixed(1)+'" y2="'+gD.y.toFixed(1)+'" stroke="#1f2937" stroke-width="2.2" opacity="0.62" data-gb="'+_ghs+'"/>');
        }
      }else{
        var tgC=tsGrid(xPos[0],yPos[glr+1]), tgD=tsGrid(xPos[xPos.length-1],yPos[glr+1]);
        gzLines.push('<line x1="'+tgC.x.toFixed(1)+'" y1="'+tgC.y.toFixed(1)+'" x2="'+tgD.x.toFixed(1)+'" y2="'+tgD.y.toFixed(1)+'" stroke="#1f2937" stroke-width="2.2" opacity="0.62" data-gb="'+_ghs+'"/>');
      }
    }
  }
  } else {
    /* v98d：手动分组的「组边界线」——相邻两区分属不同组（未分组 = -1）处画深线；
       带 data-cutaxis / data-cutindex，三级工作区据此把它当二级的分区线来拖。
       ★ 逐格比较、按格分段（横竖同一口径）——必须与工作区覆盖层 manualGbLines 逐段一致，
         否则不规则分组下两处会画出不同的组边界。
       ★ 标记用 data-mgb（专用），不复用 data-gb —— 后者是「自动分组深线」的属性，
         复用会让 applyGroupHighlight / line[data-gb] 把手动线也当自动边界。 */
    for(var mlr=0;mlr<rows;mlr++){
      for(var mlc=0;mlc+1<cols;mlc++){
        if(window.tlZoneManualGroupOf(mlr*cols+mlc)===window.tlZoneManualGroupOf(mlr*cols+mlc+1))continue;
        var _myb=zYb(mlr,mlc,mlc+1); var mgA=tsGrid(zX(mlr,mlc+1),_myb[0]), mgB=tsGrid(zX(mlr,mlc+1),_myb[1]);
        gzLines.push('<line x1="'+mgA.x.toFixed(1)+'" y1="'+mgA.y.toFixed(1)+'" x2="'+mgB.x.toFixed(1)+'" y2="'+mgB.y.toFixed(1)+'" stroke="#1f2937" stroke-width="3" opacity="0.9" stroke-linecap="round" data-mgb="1" data-cutaxis="x" data-cutindex="'+(mlc+1)+'"/>');
      }
      if(mlr+1<rows){
        for(var mlc2=0;mlc2<cols;mlc2++){
          if(window.tlZoneManualGroupOf(mlr*cols+mlc2)===window.tlZoneManualGroupOf((mlr+1)*cols+mlc2))continue;
          var _mxb=zXb(mlc2,mlr,mlr+1); var mgC=tsGrid(_mxb[0],zY(mlc2,mlr+1)), mgD=tsGrid(_mxb[1],zY(mlc2,mlr+1));
          gzLines.push('<line x1="'+mgC.x.toFixed(1)+'" y1="'+mgC.y.toFixed(1)+'" x2="'+mgD.x.toFixed(1)+'" y2="'+mgD.y.toFixed(1)+'" stroke="#1f2937" stroke-width="3" opacity="0.9" stroke-linecap="round" data-mgb="1" data-cutaxis="y" data-cutindex="'+(mlr+1)+'"/>');
        }
      }
    }
  }
  parts.push(gzSvg.join(''));
  parts.push(gzLines.join(''));
  parts.push('</g>');
  // 文字标注层：移到裁剪之外单独绘制，避免被地块边界切掉；标准区显示区名+尺寸+亩数，非标区只显示区名+实际亩数（对齐二级页施工简图逻辑）
  var tlLabelParts=[];
  for(var zr=0;zr<rows;zr++){
    for(var zc2=0;zc2<cols;zc2++){
      var zi=zr*cols+zc2;
      var zx=zX(zr,zc2), zy=zY(zc2,zr);
      /* v101：格矩形必须 = [zX(r,c), zX(r,c+1)] × [zY(c,r), zY(c,r+1)] —— 相邻格共享边，无缝无重叠。
         旧式 xSrc[c]+(zX(r,c+1)-xPos[c+1]) 只并入「本格右线」的偏移，漏掉「本格左线」的偏移，
         等于让这一格整体平移：拖过阶梯后一侧留白、另一侧压到邻格上（用户 2026-09-22 报「填充空白、重叠」）。
         ⚠ 无阶梯覆盖时两个修正项都恰好是 0.0 ⇒ 与旧输出**逐字节相同**（eq 基线不受影响）。 */
      var zoneW=xSrc[zc2]+(zX(zr,zc2+1)-xPos[zc2+1])+(xPos[zc2]-zX(zr,zc2)), zoneH=ySrc[zr]+(zY(zc2,zr+1)-yPos[zr+1])+(yPos[zr]-zY(zc2,zr));
       var cellPts=tsGridCell(zx,zy,zx+zoneW,zy+zoneH), r1=cellPts[0], r2=cellPts[2];
       var cellWpx=Math.hypot(cellPts[1].x-cellPts[0].x,cellPts[1].y-cellPts[0].y);
       var cellHpx=Math.hypot(cellPts[3].x-cellPts[0].x,cellPts[3].y-cellPts[0].y);
       var cellTextAngle=Math.atan2(cellPts[1].y-cellPts[0].y,cellPts[1].x-cellPts[0].x)*180/Math.PI;
       while(cellTextAngle>90)cellTextAngle-=180;
       while(cellTextAngle<-90)cellTextAngle+=180;
      var zoneAreaM2=Number(planAreas[zi]);
      var actMu=zoneAreaM2/MU_TO_SQM;
      var isPartial=tlPartialFlags[zi];
       if(cellWpx>10&&cellHpx>10 && actMu>0.05){
         /* [v850 用户反馈] 标注放到分块**右上角**（原居中，压着主管线不好看）。
            cellPts 局部坐标：[0]=左上、[1]=右上（局部 x 正向末端）、[3]=左下（局部 y 正向末端）。
            锚点 = 右上角沿边内缩（x 缩 PADX、y 缩 PADY），文字右对齐（text-anchor:end），
            行距 14px 从 y=12 起排。旋转角度不变（文字仍沿网格方向）。 */
         var PADX=6, PADY=5;
         var uX=(cellWpx>0)?(cellPts[1].x-cellPts[0].x)/cellWpx:1, uY=(cellWpx>0)?(cellPts[1].y-cellPts[0].y)/cellWpx:0;
         var vX=(cellHpx>0)?(cellPts[3].x-cellPts[0].x)/cellHpx:0, vY=(cellHpx>0)?(cellPts[3].y-cellPts[0].y)/cellHpx:1;
         var cornerX=cellPts[1].x-PADX*uX+PADY*vX, cornerY=cellPts[1].y-PADX*uY+PADY*vY;
         var zoneLabelParts=[];
         if(isPartial){
           // 非标准分区显示与水力计算/发布相同的规范逐区面积。
           zoneLabelParts.push('<text data-tlzone="1" x="0" y="12" text-anchor="end" font-size="12" fill="#000">'+(zi+1)+'区</text>');
           zoneLabelParts.push('<text data-tlzone="1" x="0" y="26" text-anchor="end" font-size="9.5" fill="#000">实际 '+actMu.toFixed(1)+' 亩</text>');
         }else{
           // 标准区尺寸始终按网格 X×Y 次序输出，避免旋转后标注内容也被交换。
           var zoneSizeText=tlZoneSizeLabel(xPlan[zc2],yPlan[zr]);
           var zoneAreaText=actMu.toFixed(1)+'亩';
           var enoughForThreeLines=cellWpx>=78&&cellHpx>=42;
           if(enoughForThreeLines){
             zoneLabelParts.push('<text data-tlzone="1" x="0" y="12" text-anchor="end" font-size="13" fill="#000">'+(zi+1)+'区</text>');
             zoneLabelParts.push('<text data-tlzone="1" x="0" y="26" text-anchor="end" font-size="9.5" fill="#000">'+zoneSizeText+'</text>');
             zoneLabelParts.push('<text data-tlzone="1" x="0" y="40" text-anchor="end" font-size="9" fill="#000">'+zoneAreaText+'</text>');
           }else{
             zoneLabelParts.push('<text data-tlzone="1" x="0" y="12" text-anchor="end" font-size="8" fill="#000">'+(zi+1)+'区 '+zoneSizeText+'</text>');
           }
         }
         tlLabelParts.push('<g transform="translate('+cornerX.toFixed(1)+' '+cornerY.toFixed(1)+') rotate('+cellTextAngle.toFixed(2)+')">'+zoneLabelParts.join('')+'</g>');
      }
    }
  }
  parts.push(tlLabelParts.join(''));

  // Zone cut lines
  parts.push('<g fill="none" stroke="#334155" stroke-width="1" stroke-dasharray="7,5" opacity="0.48">');
  if(!zStepOn){
    for(var bx=0;bx<xPos.length;bx++){
      var bv1=tsGrid(xPos[bx],yPos[0]),bv2=tsGrid(xPos[bx],yPos[yPos.length-1]);
      parts.push('<line x1="'+bv1.x.toFixed(1)+'" y1="'+bv1.y.toFixed(1)+'" x2="'+bv2.x.toFixed(1)+'" y2="'+bv2.y.toFixed(1)+'"/>');
    }
    for(var by=0;by<yPos.length;by++){
      var bh1=tsGrid(xPos[0],yPos[by]),bh2=tsGrid(xPos[xPos.length-1],yPos[by]);
      parts.push('<line x1="'+bh1.x.toFixed(1)+'" y1="'+bh1.y.toFixed(1)+'" x2="'+bh2.x.toFixed(1)+'" y2="'+bh2.y.toFixed(1)+'"/>');
    }
  }else{
    /* v98h 阶梯：分区线按行/列分段（同一列在不同行可能错开）。zStepOn=false 时走上面原路径，输出不变。 */
    for(var bx2=0;bx2<xPos.length;bx2++){
      for(var bri=0;bri<rows;bri++){
        var _byb=zYb(bri,bx2-1<0?0:bx2-1,bx2>cols-1?cols:bx2); if(!(_byb[1]>_byb[0]))continue;
        var bv3=tsGrid(zX(bri,bx2),_byb[0]), bv4=tsGrid(zX(bri,bx2),_byb[1]);
        if(Math.abs(bv4.y-bv3.y)<0.05)continue;
        parts.push('<line x1="'+bv3.x.toFixed(1)+'" y1="'+bv3.y.toFixed(1)+'" x2="'+bv4.x.toFixed(1)+'" y2="'+bv4.y.toFixed(1)+'"/>');
      }
    }
    for(var by2=0;by2<yPos.length;by2++){
      for(var bci=0;bci<cols;bci++){
        var _bxb=zXb(bci,(by2-1<0?0:by2-1),(by2>rows-1?rows:by2)); if(!(_bxb[1]>_bxb[0]))continue;
        var bh3=tsGrid(_bxb[0],zY(bci,by2)), bh4=tsGrid(_bxb[1],zY(bci,by2));
        if(Math.abs(bh4.x-bh3.x)<0.05)continue;
        parts.push('<line x1="'+bh3.x.toFixed(1)+'" y1="'+bh3.y.toFixed(1)+'" x2="'+bh4.x.toFixed(1)+'" y2="'+bh4.y.toFixed(1)+'"/>');
      }
    }
  }
  parts.push('</g>');

  // ===== v114（2026-09-23 用户示意确认）：尺寸标注线可拖 —— 抓住尺寸线沿法向平移，
  //   两端界线锚点固定、自动加长；偏移记忆 localStorage('tl-dim-offs')（带布局签名，布局变化自动重置）。
  var tlDimSig=[cols,rows,tlGN,tlManualActive?JSON.stringify(window.tlManualGroups||[]):'-',Math.round(b.w),Math.round(b.h)].join('|');
  if(!window._tlDimState||window._tlDimState.sig!==tlDimSig){
    /* v125：保存开关（localStorage 'tl-dim-save'）—— 关(默认)=不读存档并清掉旧档（刷新即恢复初始位置）；
       开=照旧读档（用户点过「保存」后刷新数据保留）。 */
    var _dimSaveOn=false;try{_dimSaveOn=localStorage.getItem('tl-dim-save')==='1';}catch(e){}
    var _dimSaved=null;
    if(_dimSaveOn){try{_dimSaved=JSON.parse(localStorage.getItem('tl-dim-offs')||'null');}catch(e){}}
    else{try{localStorage.removeItem('tl-dim-offs');}catch(e){}}
    window._tlDimState=(_dimSaved&&_dimSaved.sig===tlDimSig&&_dimSaved.offs)?{sig:tlDimSig,offs:_dimSaved.offs}:{sig:tlDimSig,offs:{}};
  }
  window._tlDimHits=[];
  function tlDimOffOf(id){return window._tlDimState.offs[id]||0;}

  /* 任务M（2026-09-26 用户：「标注线的文字跟箭头尺寸有点大…做一个控制按钮，可以适当的调整他们比例」）：
     标注比例系数（0.6~1.8，步进 0.1，localStorage 'tl-dim-scale' 持久）——
     作用点：尺寸线文字字号 + 建筑斜短线(tick)半长/线宽；下载/打印/系统简图克隆同源渲染自然生效。 */
  function tlDimScaleOf(){
    try{ var v=parseFloat(localStorage.getItem('tl-dim-scale')); return (v>=0.6&&v<=1.8)?v:1; }catch(e){ return 1; }
  }
  var tlDS=tlDimScaleOf();
  /* v124（2026-09-27 用户：设置页）：标注几何细项。默认值 = 历史硬编码常量 ⇒ 不改设置时输出逐字节不变。
     ext 界线超出尺寸线 / gap 数字离尺寸线净距 / tick 斜短线半长 / tickW 斜短线线宽 / font 数字字号；
     最终生效值 = 细项 x tlDS。注意「4」有三种不同语义，见 _p1/_set_param.py 抬头。 */
  var DG=(window.RyDimGeo?window.RyDimGeo.get():{ext:4,gap:4,tick:4,tickW:2.8,font:12});
  /* v148（2026-09-27 用户：距离可在设置页调，默认全部 4px）：gap 语义统一为「数字【墨迹】离尺寸线的可见净距」，
     三处标注按它反推基线 —— 改一个数，横竖一起变且彼此一致。
     · ASC = 数字墨水 ascent（实测 12px 微软雅黑 700 = 9.00 ⇒ 0.75×字号；数字/拉丁字母无降部 ⇒ 墨迹下缘 = 基线）
     · 横向·数字在线上方 ⇒ 基线 = 线 y − GAP        （朝线的一侧是墨迹下缘 = 基线）
     · 横向·数字在线下方 ⇒ 基线 = 线 y + GAP + ASC  （朝线的一侧是墨迹上缘 = 基线 − ASC）
     · 竖向·数字在线左侧 ⇒ 基线 = 线 x − GAP        （rotate(-90)：局部 +y → 全局 +x）
     · 竖向·数字在线右侧 ⇒ 基线 = 线 x + GAP + ASC  （朝线的一侧是墨迹左缘 = 基线 − ASC） */
  /* v148：数字墨迹的 A（上线）/ D（下线，即相对基线的溢出）—— 决定「可见净距」的两个关键量。
     实测（_p1/_ascent_probe.cjs）：本机字体栈落到 Segoe UI，两个量都【随字号跳变】：
       A: 8px→7 / 11px→8 / 12px→9 / 20px→16 / 36px→28（比例 0.73~0.88em 不等）
       D: 8px→1 / 12px→0 / 18px→1 / 20px→1（数字底部对基线有 1px 溢出）
     写死 0.75×字号 + 只补 A，会在用户改「字号」时把净距带偏 ±1~2px。故按当前真实字体用
     canvas 实测；无 canvas 时退回 a=0.75×字号、d=0。同字号下 canvas 预测量与 SVG 真实
     渲染逐位一致（已验证）。默认 12px ⇒ a=9 d=0，与历史值一致，外观零变化。 */
  window.__ryInkM=function(px){
    try{
      var cx=(window.__ryInkCv||(window.__ryInkCv=document.createElement('canvas'))).getContext('2d');
      if(!cx)return {a:px*0.75,d:0};
      var cont=document.getElementById('tlDiagramContent')||document.body;
      var fam=getComputedStyle(cont).fontFamily||'sans-serif';
      cx.font='700 '+px+'px '+fam;
      var m=cx.measureText('0'), a=m.actualBoundingBoxAscent, d=m.actualBoundingBoxDescent;
      if(!isFinite(a)||a<=0)a=px*0.75;
      if(!isFinite(d)||d<0)d=0;
      return {a:a,d:d};
    }catch(e){ return {a:px*0.75,d:0}; }
  };
  var GAP=DG.gap*tlDS;
  var INK=(window.__ryInkM?window.__ryInkM(DG.font*tlDS):{a:DG.font*tlDS*0.75,d:0});
  var ASC=INK.a, DESC=INK.d;
  /* [v645 2026-10-21 用户要求] 比例的唯一入口改到「设置 → 标注与文字」。
     原来工具栏还有一组「Aa−/100%/Aa＋/⟲」四键（index.html #tlDimScaleRow），
     与设置页滑块写的是同一个 key，属重复入口 ⇒ 四键连同 window.tlDimScaleStep /
     window.tlDimScaleReset 一并删除（用户：「如果这里的跟设置页面的重复，那这里就取消」）。
     本文件只读不改：tlDimScaleOf() 读 localStorage，渲染时乘进 DG 各项（v124 口径不变）。 */

  // 地块尺寸标注（建筑制图风格）：图下水平尺寸线 + 图左垂直尺寸线；尺寸值取二级页传导(有桥)或实测，与二级页施工简图一致
  (function(){
     var gridAngle=tlZoneCuts&&tlZoneCuts.frame?Number(tlZoneCuts.frame.angle)||0:0;
     var gridAngleNorm=((gridAngle%360)+360)%360;
     if(Math.min(gridAngleNorm,360-gridAngleNorm)>=0.001){
       /* 分区旋转时，真实地块边界保持不动，外框尺寸改按网格局部坐标标注。
          该分支是静态展示标注；轴对齐时继续使用下面原有可拖动尺寸线。 */
       var db=tlGeoBounds, q00=tsGrid(db.minX,db.minY), q10=tsGrid(db.maxX,db.minY),
           q11=tsGrid(db.maxX,db.maxY), q01=tsGrid(db.minX,db.maxY);
       var dcx=(q00.x+q10.x+q11.x+q01.x)/4, dcy=(q00.y+q10.y+q11.y+q01.y)/4;
       function dUnit(a,b){var dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy)||1;return{x:dx/L,y:dy/L};}
       function dOut(a,b){var m={x:(a.x+b.x)/2,y:(a.y+b.y)/2},n={x:-(b.y-a.y),y:b.x-a.x},L=Math.hypot(n.x,n.y)||1;n.x/=L;n.y/=L;if((m.x-dcx)*n.x+(m.y-dcy)*n.y<0){n.x=-n.x;n.y=-n.y;}return n;}
       function dAdd(p,n,k){return{x:p.x+n.x*k,y:p.y+n.y*k};}
       function dLine(a,b,attrs){parts.push('<line x1="'+a.x.toFixed(1)+'" y1="'+a.y.toFixed(1)+'" x2="'+b.x.toFixed(1)+'" y2="'+b.y.toFixed(1)+'" '+(attrs||'')+'/>');}
       function dText(a,b,label){var m={x:(a.x+b.x)/2,y:(a.y+b.y)/2},u=dUnit(a,b),ang=Math.atan2(u.y,u.x)*180/Math.PI;while(ang>90)ang-=180;while(ang<-90)ang+=180;parts.push('<text data-tl-dim="1" transform="translate('+m.x.toFixed(1)+' '+m.y.toFixed(1)+') rotate('+ang.toFixed(2)+')" x="0" y="-'+(GAP+DESC).toFixed(2)+'" text-anchor="middle" font-size="'+(DG.font*tlDS).toFixed(2)+'" font-weight="700" fill="#111111" stroke="none">'+label+'</text>');}
       function dTick(p,u){var n={x:-u.y,y:u.x},k=DG.tick*tlDS;dLine(dAdd(dAdd(p,n,-k),u,-k),dAdd(dAdd(p,n,k),u,k),'stroke-width="'+(DG.tickW*tlDS).toFixed(2)+'"');}
       parts.push('<g stroke="#111111" stroke-width="0.95" fill="none" opacity="0.98" stroke-linecap="square">');
       var ux=dUnit(q01,q11), nx=dOut(q01,q11), hOff=38+tlDimOffOf('gplot-h'), hA=dAdd(q01,nx,hOff),hB=dAdd(q11,nx,hOff);
       dLine(dAdd(q01,nx,4),dAdd(q01,nx,hOff+DG.ext));dLine(dAdd(q11,nx,4),dAdd(q11,nx,hOff+DG.ext));dLine(hA,hB);dTick(hA,ux);dTick(hB,ux);dText(hA,hB,tlDimLabel(plotW));
       var uy=dUnit(q00,q01), ny=dOut(q00,q01), vOff=48+tlDimOffOf('gplot-v'), vA=dAdd(q00,ny,vOff),vB=dAdd(q01,ny,vOff);
       dLine(dAdd(q00,ny,4),dAdd(q00,ny,vOff+DG.ext));dLine(dAdd(q01,ny,4),dAdd(q01,ny,vOff+DG.ext));dLine(vA,vB);dTick(vA,uy);dTick(vB,uy);dText(vA,vB,tlDimLabel(plotH));
       parts.push('</g>');
       return;
     }
    var plotLeft=ts(b.minX,b.minY).x;
    var plotRight=ts(b.minX+b.w,b.minY).x;
    var plotTop=ts(b.minX,b.minY).y;
    var plotBottom=ts(b.minX,b.minY+b.h).y;
    var dimBottomBase=Math.min(footerTop-30, plotBottom+38);
    var dimLeftBase=Math.max(58, plotLeft-48);
    var dimBottomY=dimBottomBase+tlDimOffOf('gplot-h');      /* v114: off 正=向下（远离地块） */
    var dimLeftX=dimLeftBase-tlDimOffOf('gplot-v');          /* v114: off 正=向左（远离地块） */
    function tlDimLabel(value){
      if(!isFinite(value))return '— m';
      var rounded=Math.round(value);
      return Math.abs(value-rounded)<0.05?rounded+' m':value.toFixed(1)+' m';
    }
    /* v148：y 一律是【基线】（原内部 +DG.font/6*tlDS 的补偿已去掉，避免调用方算两遍）；
       rotate 时第 6 参 off = 基线相对锚点 x 的垂直偏移（调用方按 GAP/ASC 给出，缺省 = −GAP）。 */
    function tlTextBox(x,y,text,anchor,rotate,off){
      if(rotate){
        var offv=(off==null?-GAP:off);
        parts.push('<g transform="translate('+x.toFixed(1)+' '+y.toFixed(1)+') rotate(-90)">');
        parts.push('<text data-tl-dim="1" x="0" y="'+offv.toFixed(2)+'" text-anchor="middle" font-size="'+(DG.font*tlDS).toFixed(2)+'" font-weight="700" fill="#111111" stroke="none">'+text+'</text></g>');
        return;
      }
      parts.push('<text data-tl-dim="1" x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" text-anchor="'+anchor+'" font-size="'+(DG.font*tlDS).toFixed(2)+'" font-weight="700" fill="#111111" stroke="none">'+text+'</text>');
    }
    function tlArchTick(x,y,dir){
      /* v113（2026-09-22 用户要求）：建筑斜短线加粗、缩短 —— k 5.5→4（长 11px→8px）、线宽 1.8→2.8；
         任务M：k 与线宽再乘标注比例 tlDS（比例控件可调） */
      var k=DG.tick*tlDS;
      if(dir==='h')parts.push('<line x1="'+(x-k).toFixed(1)+'" y1="'+(y+k).toFixed(1)+'" x2="'+(x+k).toFixed(1)+'" y2="'+(y-k).toFixed(1)+'" stroke-width="'+(DG.tickW*tlDS).toFixed(2)+'"/>');
      else parts.push('<line x1="'+(x-k).toFixed(1)+'" y1="'+(y-k).toFixed(1)+'" x2="'+(x+k).toFixed(1)+'" y2="'+(y+k).toFixed(1)+'" stroke-width="'+(DG.tickW*tlDS).toFixed(2)+'"/>');
    }
    /* 底部水平尺寸线（gplot-h）：界线锚 = 地块左下/右下角（固定），界线活动端随 off 伸长。
       界线活动端 = dimBottomY+4（跨过尺寸线、超出 4px）—— 与联合分区横向标注(gd*-hc*)同构：
       分区界线 gdBRb.y-4（锚）→ gdHy-4，实测 183.8→197.8 跨过尺寸线 187.8，即「超出 4px」。
       ※ 2026-09-27：曾一度改为 dimBottomY-4（停在尺寸线上方 4px）。用户看图指出该形态止于 tick
         上缘、像「没有尾巴」；尺寸界线应越过尺寸线一小段，同日按用户指令回滚为 +4。 */
    window._tlDimHits.push({id:'gplot-h',axis:'y',x1:plotLeft,y1:dimBottomY,x2:plotRight,y2:dimBottomY,
      minOff:-(dimBottomBase-plotBottom-6)});
    parts.push('<g data-dim="gplot-h" data-axis="y" stroke="#111111" stroke-width="0.95" fill="none" opacity="0.98" stroke-linecap="square">');
    parts.push('<line data-dimext="gplot-h" data-dimextfix="y1" x1="'+plotLeft.toFixed(1)+'" y1="'+(plotBottom+4).toFixed(1)+'" x2="'+plotLeft.toFixed(1)+'" y2="'+(dimBottomY+DG.ext).toFixed(1)+'"/>');
    parts.push('<line data-dimext="gplot-h" data-dimextfix="y1" x1="'+plotRight.toFixed(1)+'" y1="'+(plotBottom+4).toFixed(1)+'" x2="'+plotRight.toFixed(1)+'" y2="'+(dimBottomY+DG.ext).toFixed(1)+'"/>');
    parts.push('<line x1="'+plotLeft.toFixed(1)+'" y1="'+dimBottomY.toFixed(1)+'" x2="'+plotRight.toFixed(1)+'" y2="'+dimBottomY.toFixed(1)+'"/>');
    tlArchTick(plotLeft,dimBottomY,'h');
    tlArchTick(plotRight,dimBottomY,'h');
    /* 任务D②（v148 更新）：横向数字默认放尺寸线【上方】；尺寸线被拖到贴近地块底边时（间距 <18px）放下方
       （避免数字压到地块边框）。v148 起两种位置的【可见净距】都等于 GAP —— 上方按基线算，
       下方朝线的一侧变成墨迹上缘，故再加一个墨水 ASC。 */
    var dimHAbove=(dimBottomY-plotBottom)>=18;
    tlTextBox((plotLeft+plotRight)/2,dimHAbove?(dimBottomY-GAP-DESC):(dimBottomY+GAP+ASC),tlDimLabel(plotW),'middle',false);
    parts.push('</g>');
    /* 左侧垂直尺寸线（gplot-v）：界线锚 = 地块左上/左下角（固定），off 正=向左远离 */
    window._tlDimHits.push({id:'gplot-v',axis:'x',x1:dimLeftX,y1:plotTop,x2:dimLeftX,y2:plotBottom,
      minOff:-(plotLeft-dimLeftBase-6)});
    parts.push('<g data-dim="gplot-v" data-axis="x" stroke="#111111" stroke-width="0.95" fill="none" opacity="0.98" stroke-linecap="square">');
    parts.push('<line data-dimext="gplot-v" data-dimextfix="x1" x1="'+(plotLeft-4).toFixed(1)+'" y1="'+plotTop.toFixed(1)+'" x2="'+(dimLeftX-4).toFixed(1)+'" y2="'+plotTop.toFixed(1)+'"/>');
    parts.push('<line data-dimext="gplot-v" data-dimextfix="x1" x1="'+(plotLeft-4).toFixed(1)+'" y1="'+plotBottom.toFixed(1)+'" x2="'+(dimLeftX-4).toFixed(1)+'" y2="'+plotBottom.toFixed(1)+'"/>');
    parts.push('<line x1="'+dimLeftX.toFixed(1)+'" y1="'+plotTop.toFixed(1)+'" x2="'+dimLeftX.toFixed(1)+'" y2="'+plotBottom.toFixed(1)+'"/>');
    tlArchTick(dimLeftX,plotTop,'v');
    tlArchTick(dimLeftX,plotBottom,'v');
    /* v148：锚点落在尺寸线【上】，用 off=−GAP 把基线推到线左 GAP 处（墨迹下缘朝线 ⇒ 净距 = GAP） */
    tlTextBox(dimLeftX,(plotTop+plotBottom)/2,tlDimLabel(plotH),'middle',true,-GAP-DESC);
    parts.push('</g>');
  })();

  // v115（2026-09-23 用户截图修正）：横向尺寸改为「按块逐段」——地块横向被主管分成几块，
  //   横向标注就分几段（每段=一条设计网格列宽，不再按组包络把相邻两块并成一段）。
  // v111b（2026-09-22 用户确认示意图后定稿）：联合分区横竖尺寸标注 —— 只标两类位置：
  //   横向 = 组底边上方（v111d 改锚：单行组=地块底缘上方；多行时上行组=分界线上方；
  //          v111b 原按 minR>0 只标上行组，导致单行布局一个横标都不出 —— 用户 18:45 报「改没了」要求恢复）；
  //          顶行组的地块上边界上方仍不画（用户圈❌取消的位置不变）。
  //   竖向 = 「右缘贴地块右边界」的组（maxC===cols-1，画在地块右缘外侧）；
  //          组与组相邻处的内部右缘不画（避免标进邻区内部）—— 用户圈❌明确取消。
  //   尺寸值 = 【端点实际跨距】（2026-09-24 用户报告手动调节后拾取边界点不对：
//          原按设计网格 ΣxPlan/ΣyPlan 取值，阶梯拖动/合并后与画线端点失配；
//          无手动调节时 zX/zY 退化为 xPos/yPos ⇒ 与设计值逐位一致）。
  //   整层 pointer-events="none"：不挡组边界线（data-mgb）拖动命中，也不挡画布平移。
  (function(){
    function gdVal(v){ if(!isFinite(v))return '— m'; var r0=Math.round(v); return Math.abs(v-r0)<0.05?r0+' m':v.toFixed(1)+' m'; }
    /* v174（2026-10-01 用户：手动调节分区后右侧竖尺寸 414.5/214.2 与总尺寸 414 不一致）：
       zX/zY 返回的是【按实测外接框 b 缩放后的 map 米】（Σ = b.w / b.h），而总尺寸 gplot-h/v 用的是
       设计 plan 尺寸 plotW/plotH = round(b.w)/round(b.h)。2026-09-24 把分区值由 ΣxPlan/ΣyPlan 改成
       「端点实际跨距」时漏了这层单位换算 ⇒ 分区链 Σ 恒比总尺寸大 (b.h-plotH)（实测 414.45 vs 414，
       右侧 414.5 m 与左侧总尺寸 414 m 画在同一条跨度上）。
       这里把实测跨距 ÷ sx ÷ sy 换回 plan 米：既保住「用手册后的端点实际跨距」这一修复，
       又让分区链与总尺寸同口径、逐段相加恒等于总尺寸。 */
    var gdSx=(isFinite(plotW)&&plotW>0)?(b.w/plotW):1;
    var gdSy=(isFinite(plotH)&&plotH>0)?(b.h/plotH):1;
    if(!isFinite(gdSx)||gdSx<=0)gdSx=1;
    if(!isFinite(gdSy)||gdSy<=0)gdSy=1;
    function gdGrpOf(zi){ return tlManualActive ? ((typeof window!=='undefined'&&window.tlZoneManualGroupOf)?window.tlZoneManualGroupOf(zi):-1) : Math.floor(zi/tlGN); }
    var gdBox={};
    for(var gdr=0;gdr<rows;gdr++){
      for(var gdc=0;gdc<cols;gdc++){
        var gdG=gdGrpOf(gdr*cols+gdc);
        if(gdG<0)continue;   /* 手动模式未分组的区不是联合分区，不标 */
        var gdB=gdBox[gdG];
        if(!gdB)gdB=gdBox[gdG]={minC:gdc,maxC:gdc,minR:gdr,maxR:gdr};
        if(gdc<gdB.minC)gdB.minC=gdc; if(gdc>gdB.maxC)gdB.maxC=gdc;
        if(gdr<gdB.minR)gdB.minR=gdr; if(gdr>gdB.maxR)gdB.maxR=gdr;
      }
    }
    var gdParts=[];   /* v176b：分区端线独立数组取消 —— 改【组内】（见下） */
    var gdBands={};   /* v115：横向「按块逐段」标注 —— 同一条带线（包络底行+1）的组先归并，见下方绘制循环 */
    var gdBandsV={};   /* v175：竖向「按行逐段」标注 —— 右缘竖线（列=cols）的组先归并，见下方绘制循环 */
    /* v113（2026-09-22 用户要求）：联合分区小尺寸斜短线同步加粗缩短 —— k 5.5→4、线宽 1.8→2.8（与 tlArchTick/ppArchTick 一致）；
       任务M：k 与线宽再乘标注比例 tlDS */
    function gdTickH(x,y){ var k=DG.tick*tlDS; return '<line x1="'+(x-k).toFixed(1)+'" y1="'+(y+k).toFixed(1)+'" x2="'+(x+k).toFixed(1)+'" y2="'+(y-k).toFixed(1)+'" stroke-width="'+(DG.tickW*tlDS).toFixed(2)+'"/>'; }
    function gdTickV(x,y){ var k=DG.tick*tlDS; return '<line x1="'+(x-k).toFixed(1)+'" y1="'+(y-k).toFixed(1)+'" x2="'+(x+k).toFixed(1)+'" y2="'+(y+k).toFixed(1)+'" stroke-width="'+(DG.tickW*tlDS).toFixed(2)+'"/>'; }
    /* A rotated partition grid has diagonal screen-space cuts. The legacy group dimension
       chains are axis-aligned, so do not publish geometrically false dimensions for it. */
    var tlGridFrameAngle=tlZoneCuts&&tlZoneCuts.frame?Number(tlZoneCuts.frame.angle)||0:0;
    var tlNormalizedGridAngle=((tlGridFrameAngle%360)+360)%360;
    if(Math.min(tlNormalizedGridAngle,360-tlNormalizedGridAngle)<0.001){
    Object.keys(gdBox).forEach(function(gdK){
      var gdB=gdBox[gdK];
      /* v115fix：gdG 此前在 forEach 里未定义（泄漏自上一循环=最后一个单元格的组号），
         导致所有联合分区标注共用同一个 id（v111 起就错；v114 下还会一拖全动）。
         forEach 的键 gdK 本身就是组号，直接取用。 */
      var gdGN=parseInt(gdK,10);
      var gdW=0,gdH=0;
      for(var gci=gdB.minC;gci<=gdB.maxC;gci++)gdW+=xPlan[gci];
      for(var gri=gdB.minR;gri<=gdB.maxR;gri++)gdH+=yPlan[gri];
      var gdX0=zX(gdB.minR,gdB.minC), gdX1=zX(gdB.minR,gdB.maxC+1);
      var gdY0=zY(gdB.minC,gdB.minR);
      /* 2026-09-24 用户报告：手动调节（阶梯拖割缝/拖分界线/手动分组）后分地块标注拾取的边界点不对。
         竖向标注画在组右缘（列 maxC 外侧）⇒ 上下端必须取【列 maxC】上的实际边界
         （原上端取 minC 列：阶梯/合并后两列边界不同 ⇒ 端点越界进邻带，用户截图右缘 255 线跨过紫色分界线）。
         gdTR/gdBR 只服务于右缘竖向标注与其加选命中 ⇒ 直接改用右缘列端点。 */
      var gdY0v=zY(gdB.maxC,gdB.minR), gdY1v=zY(gdB.maxC,gdB.maxR+1);
      var gdTL=tsGrid(gdX0,gdY0), gdTR=tsGrid(gdX1,gdY0v), gdBR=tsGrid(gdX1,gdY1v);
      /* 横向尺寸线（v111d 锚点沿用：组底边上方 14px——单行组=地块底缘上方，多行=分界线上方；
         与总尺寸线间距恒 ≥52px（v111c 预留）。
         v115（2026-09-23 用户截图：横向实际被主管分成三块，旧「组包络」一段标注把其中两块并到一起——不对）：
         这里只把同一条带线的组归并进 gdBands（键=包络底行+1），实际绘制在 forEach 之后
         按「每块（每条设计网格列）一段」画 —— 段不再跨主管，值=该列设计宽 xPlan[c]。 */
      if(gdTR.x-gdTL.x>26){
        var gdRc=gdBands[gdB.maxR+1];
        if(!gdRc){gdRc=gdBands[gdB.maxR+1]={minR:gdB.minR,maxR:gdB.maxR,minC:gdB.minC,maxC:gdB.maxC,firstG:gdGN};}
        else{
          if(gdB.minC<gdRc.minC)gdRc.minC=gdB.minC;
          if(gdB.maxC>gdRc.maxC)gdRc.maxC=gdB.maxC;
        }
      }
      /* 竖向尺寸线：仅「右缘贴地块右边界」的组（maxC=最后一列）。
         v175（2026-10-01 用户拍板：「竖向按行逐段平铺，不要重叠」）：改为「按行逐段」——
         与 v115 横向「按块逐段」对称：同一条右缘竖线（列=cols）的组先归并进 gdBandsV，
         实际绘制在 forEach 之后按「每行一段」画。段不再整组包络 ⇒ 相邻组在行上不再重叠，
         逐段拼接恒等于地块总高。值 = 该行端点实际跨距 ÷ gdSy（换算回 plan 米）。 */
      if(gdB.maxC===cols-1 && gdBR.y-gdTR.y>26){
        var gdRcV=gdBandsV[gdB.maxC+1];
        if(!gdRcV){gdRcV=gdBandsV[gdB.maxC+1]={minR:gdB.minR,maxR:gdB.maxR,maxC:gdB.maxC,firstG:gdGN};}
        else{
          if(gdB.minR<gdRcV.minR)gdRcV.minR=gdB.minR;
          if(gdB.maxR>gdRcV.maxR)gdRcV.maxR=gdB.maxR;
        }
      }
    });
    /* v115 横向「按块逐段」绘制：每条带线一条链，链内每段只跨一个块（主管分块边界），
       值=该列设计宽 xPlan[c]（与分区标签「设计尺寸」同口径）；段过窄（≤26px）跳过。
       v114 拖动照常可用 —— 每段独立 id（gdG-hc列号），锚点固定、端线加长、偏移记忆。 */
    Object.keys(gdBands).forEach(function(gdBK){
      var gdRc=gdBands[gdBK];
      var gdY1b=zY(gdRc.maxC,gdRc.maxR+1);
      var gdBRb=tsGrid(zX(gdRc.minR,gdRc.maxC+1),gdY1b);
      for(var gdc2=gdRc.minC;gdc2<=gdRc.maxC;gdc2++){
        var gdPA=tsGrid(zX(gdRc.maxR,gdc2),gdY1b), gdPB=tsGrid(zX(gdRc.maxR,gdc2+1),gdY1b);
        if(gdPB.x-gdPA.x<=26)continue;
        var gdIdH='gd'+gdRc.firstG+'-hc'+gdc2;
        var gdHy=gdBRb.y-14+tlDimOffOf(gdIdH);   /* v114: off 正=向下 */
        /* v176b：端线必须是【该尺寸线组的子节点】（与 gplot-h 同构）。
           原实现把端线放进与组【并列】的独立数组 ⇒ 它在 [data-dim] 组外，
           组 transform 平移带不动它 ⇒ 拖尺寸线时端线不跟随、超出量乱跳。 */
        var gdEvH=('<line data-dimext="'+gdIdH+'" data-dimextfix="y1" x1="'+gdPA.x.toFixed(1)+'" y1="'+(gdBRb.y-4).toFixed(1)+'" x2="'+gdPA.x.toFixed(1)+'" y2="'+(gdHy-DG.ext).toFixed(1)+'"/>')
          +('<line data-dimext="'+gdIdH+'" data-dimextfix="y1" x1="'+gdPB.x.toFixed(1)+'" y1="'+(gdBRb.y-4).toFixed(1)+'" x2="'+gdPB.x.toFixed(1)+'" y2="'+(gdHy-DG.ext).toFixed(1)+'"/>');
        gdParts.push('<g data-dim="'+gdIdH+'" data-axis="y">'+gdEvH
          +'<line x1="'+gdPA.x.toFixed(1)+'" y1="'+gdHy.toFixed(1)+'" x2="'+gdPB.x.toFixed(1)+'" y2="'+gdHy.toFixed(1)+'"/>'
          +gdTickH(gdPA.x,gdHy)+gdTickH(gdPB.x,gdHy)
          +'<text data-tl-dim="1" x="'+((gdPA.x+gdPB.x)/2).toFixed(1)+'" y="'+(gdHy-GAP-DESC).toFixed(1)+'" text-anchor="middle" font-size="'+(DG.font*tlDS).toFixed(2)+'" font-weight="700" fill="#111111" stroke="none">'
          +gdVal((zX(gdRc.maxR,gdc2+1)-zX(gdRc.maxR,gdc2))/gdSx)+'</text></g>');  /* v174：值=该段端点实际跨距 ÷ gdSx（换算回 plan 米；2026-09-24 起用实际跨距，v174 补上单位换算） */
        window._tlDimHits.push({id:gdIdH,axis:'y',x1:gdPA.x,y1:gdHy,x2:gdPB.x,y2:gdHy,minOff:-8});
      }
    });
    /* v175 竖向「按行逐段」绘制：右缘一条链，链内每段只跨一行，值 = 该行端点实际跨距 ÷ gdSy
       （= 设计行高 yPlan[r]）。端点取【行界在右缘列上的实际位置】⇒ 阶梯拖动后仍跟随实画；
       与 v115 横向对称 —— 相邻组在行上不再重叠，逐段拼接 = 地块总高（与总尺寸同口径）。
       v114 拖动照常可用 —— 每段独立 id（gdG-vr行号），锚点固定、端线加长、偏移记忆。 */
    Object.keys(gdBandsV).forEach(function(gdVK){
      var gdRcV=gdBandsV[gdVK];
      var gdCxV=gdRcV.maxC;                         /* = cols-1（右缘列） */
      for(var gdr2=gdRcV.minR;gdr2<=gdRcV.maxR;gdr2++){
        var gdPAv=tsGrid(zX(gdr2,cols),zY(gdCxV,gdr2)), gdPBv=tsGrid(zX(gdr2,cols),zY(gdCxV,gdr2+1));
        if(gdPBv.y-gdPAv.y<=26)continue;
        var gdIdV='gd'+gdRcV.firstG+'-vr'+gdr2;
        /* v500（2026-10-16 用户反馈）：基准间距 14px 太贴地块边线，版面挤 —— 加大到 30px
           （与底部水平标注 dimBottomBase 的 38px 同一量级），配合 v114 拖动仍可微调。 */
        var gdVx=gdPAv.x+30+tlDimOffOf(gdIdV);      /* v114: off 正=向右 */
        /* v176b：同横向 —— 端线并入该尺寸线组内 */
        var gdEvV=('<line data-dimext="'+gdIdV+'" data-dimextfix="x1" x1="'+(gdPAv.x+4).toFixed(1)+'" y1="'+gdPAv.y.toFixed(1)+'" x2="'+(gdVx+4).toFixed(1)+'" y2="'+gdPAv.y.toFixed(1)+'"/>')
          +('<line data-dimext="'+gdIdV+'" data-dimextfix="x1" x1="'+(gdPBv.x+4).toFixed(1)+'" y1="'+gdPBv.y.toFixed(1)+'" x2="'+(gdVx+4).toFixed(1)+'" y2="'+gdPBv.y.toFixed(1)+'"/>');
        gdParts.push('<g data-dim="'+gdIdV+'" data-axis="x">'+gdEvV
          +'<line x1="'+gdVx.toFixed(1)+'" y1="'+gdPAv.y.toFixed(1)+'" x2="'+gdVx.toFixed(1)+'" y2="'+gdPBv.y.toFixed(1)+'"/>'
          +gdTickV(gdVx,gdPAv.y)+gdTickV(gdVx,gdPBv.y)
          /* v174：值 ÷ gdSy 换算回 plan 米（防分区链与总尺寸不同口径）；v175：改为逐行取值 */
          /* v148：锚点落在尺寸线上，off = GAP+ASC（数字在线的【右侧】，朝线的一侧是墨迹左缘 = 基线−ASC） */
          +'<g transform="translate('+gdVx.toFixed(1)+' '+((gdPAv.y+gdPBv.y)/2).toFixed(1)+') rotate(-90)"><text data-tl-dim="1" x="0" y="'+(GAP+ASC).toFixed(2)+'" text-anchor="middle" font-size="'+(DG.font*tlDS).toFixed(2)+'" font-weight="700" fill="#111111" stroke="none">'+gdVal((zY(gdCxV,gdr2+1)-zY(gdCxV,gdr2))/gdSy)+'</text></g></g>');
        window._tlDimHits.push({id:gdIdV,axis:'x',x1:gdVx,y1:gdPAv.y,x2:gdVx,y2:gdPBv.y,minOff:-8});
      }
    });
    if(gdParts.length){
      parts.push('<g pointer-events="none" stroke="#111111" stroke-width="0.95" fill="none" opacity="0.95" stroke-linecap="square">');
      parts.push(gdParts.join(''));
      parts.push('</g>');
    }
    }
  })();

  // ===== 管线：优先采用二级页已生成几何（数据传导），否则三级页自动布管 =====
  var mainPipes=[], branchPipes=[], valves=[];
  /* 支管计算长度的两个基准，随图面快照一起落 tlDiagramData：
     · branchFullSpans —— 该支管所在分区的「设计满跨」（贯通整个分区的净尺寸），
       用于路径/水力计算；
     · branchDrawnLens —— 图面实际画出来的长度，
       用于识别「用户手动改长」的增量（effLen − drawn）后再叠加到满跨上；
       异形地块因外边界裁剪可短于满跨。
     长度/水损一律按满跨计，图面留边只影响显示（用户 2026-10-19 明确口径）。 */
  var branchFullSpans=[], branchDrawnLens=[];
  function tlPolyLen(pts){ if(!pts||pts.length<2)return 0; var L=0; for(var i=1;i<pts.length;i++){var dx=pts[i].x-pts[i-1].x,dy=pts[i].y-pts[i-1].y;L+=Math.sqrt(dx*dx+dy*dy);} return L; }
  /* [v603] 支管所在分区的**净跨**（= 设计满跨）：竖向支管取该行 ySrc、横向取该列 xSrc。
     分区判定用支管中点（与 tlBranchSpanInfo、wsZoneOf 同一套行主序几何）。
     为什么不能用折线长：二级传过来的支管已缩过 gap，三级还会再缩一次，折线永远比满跨短。 */
  function tlZoneSpanAt(pts){
    if(!pts||pts.length<2||!xPos||!yPos||!xSrc||!ySrc)return 0;
    var pLocal=tlZoneCuts.frame?pts.map(function(p){return tlFrameToGrid(tlZoneCuts.frame,p);}):pts;
    var a=pLocal[0], b=pLocal[pLocal.length-1];
    var mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
    var vert=Math.abs(a.x-b.x)<Math.abs(a.y-b.y);
    var E=1e-6,i;
    if(vert){
      for(i=0;i+1<yPos.length;i++){ if(mid.y>=yPos[i]-E&&mid.y<=yPos[i+1]+E) return ySrc[i]||0; }
    }else{
      for(i=0;i+1<xPos.length;i++){ if(mid.x>=xPos[i]-E&&mid.x<=xPos[i+1]+E) return xSrc[i]||0; }
    }
    return 0;
  }
  var ppShare=window.RunyeBridge&&typeof window.RunyeBridge.getPartitionSnapshot==='function'
    ?window.RunyeBridge.getPartitionSnapshot():null;
  var ppHasPipes=ppShare && (ppShare.mainPipes.length||ppShare.branchPipes.length||ppShare.valves.length);
  /* [v1053 2026-11-13 数据唯一性] 复用二级管线前先校验代际：ppState 里的管线是
     「生成施工图」时的存档几何，滴灌带/分区标签却是本函数按当前分区切割现算的——
     分区参数（分区数/角度/切割线/末排并入）在生成之后被改过时，复用会把旧管线铺进
     新分区图面，同一张三级图上两代数据并存（用户实测：滴灌带纵向、管线竖直与其平行）。
     签名不一致就不复用，走下方三级兜底自布管（与滴灌带同一套 cuts，恒同代），
     并立全局标志让状态行提示用户回二级重新生成。二级从未生成过（无签名）不拦——
     那是合并前的老路径，兜底自布管本就是它的正规出口。 */
  var ppPipesStale=false;
  try{
    if(ppHasPipes && typeof window.ppCurrentCutSignature==='function'){
      var _curSig=window.ppCurrentCutSignature();
      if(_curSig && ppShare.genCutSig && ppShare.genCutSig!==_curSig) ppPipesStale=true;
    }
  }catch(eStaleSig){ ppPipesStale=false; }
  window.__tlPipesReusedStale=ppPipesStale;
  /* 图纸渲染用的主管/支管错开距离。放在共享生成分支外，确保复用二级管网时也可调用。 */
  function tlGapM() {
    var RG = (typeof window !== 'undefined') ? window.RyMainBranchGap : null;
    if (RG && typeof RG.m === 'function') {
      var v = RG.m();
      if (typeof v === 'number' && isFinite(v) && v > 0) return v;
    }
    return 20;
  }
  /* 布管方向硬规则：第一分区的实际长边决定滴灌带轴，所有分区沿同一轴铺带；
     主管与支管垂直于滴灌带。既有主管方向、其余分区的长宽比例和多数投票都不能覆盖此规则。 */
  var tlAxisReport=null;
  var majFixedH=(function(){
    var G=window.RyZoneGeometry;
    if(G&&typeof G.tapeAxisOf==='function'){
      var ax=G.tapeAxisOf({cols:cols,rows:rows,xPlan:xPlan,yPlan:yPlan,xSrc:xSrc,ySrc:ySrc,xPos:xPos,yPos:yPos,
                          cutOffX:tlZoneStepRef?tlZoneStepRef.x:null,cutOffY:tlZoneStepRef?tlZoneStepRef.y:null},
                          (typeof planZoneFixedSide==='function'?planZoneFixedSide():200));
      if(ax&&ax.ok){ tlAxisReport=ax; try{window.__ryTapeAxisReport=ax;}catch(eRep){} return ax.tapeAxis==='x'; }
    }
    /* 缺少几何模块时仍按行优先第1分区的实际尺寸判向，绝不退回多数投票。 */
    var firstW=Number(xSrc&&xSrc[0])||Number(xPlan&&xPlan[0])||0;
    var firstH=Number(ySrc&&ySrc[0])||Number(yPlan&&yPlan[0])||0;
    return firstW>=firstH;
  })();
  if(ppHasPipes&&!ppPipesStale){
    mainPipes=ppShare.mainPipes.map(function(l){return l.map(function(p){return{x:p.x,y:p.y};});});
    branchPipes=ppShare.branchPipes.map(function(l){return l.map(function(p){return{x:p.x,y:p.y};});});
    /* [v603 2026-10-19 用户口径修正] 二级传导来的支管**自己已经缩进过**（二级 ppBuildAutoPipes
       两端各缩 gap = min(max(边长*0.06,4),14,边长*0.22)），所以它的折线长是 52m 而不是 60m。
       v601 曾把这条「缩进前长度」当满跨，实测仍是 52 ⇒ 水损单根会算成 26m（更小，更错）。
       正解：满跨只能用**分区几何净跨**（支管中点落在哪个分区，竖向取 ySrc[行]、横向取 xSrc[列]）。 */
    branchFullSpans=branchPipes.map(function(l){ return tlZoneSpanAt(l) || tlPolyLen(l); });
    /* 二级「三级模式」的 subBranch 是**垂直支管的分叉短管**，本身不是满跨贯通支管：
       用 -1 明确标记「不适用满跨口径」，避免它被按整区净跨放大（材料会凭空多出几十米）。 */
    if(ppShare.subBranchPipes&&ppShare.subBranchPipes.length){
      ppShare.subBranchPipes.forEach(function(l){
        branchPipes.push(l.map(function(p){return{x:p.x,y:p.y};}));
        branchFullSpans.push(-1);
      });
    }
    valves=ppShare.valves.map(function(v){return{x:v.x,y:v.y};});
    if(tlZoneCuts.frame){
      mainPipes=mainPipes.map(function(l){return l.map(function(p){return tlFrameToGrid(tlZoneCuts.frame,p);});});
      branchPipes=branchPipes.map(function(l){return l.map(function(p){return tlFrameToGrid(tlZoneCuts.frame,p);});});
      valves=valves.map(function(v){return tlFrameToGrid(tlZoneCuts.frame,v);});
    }
    /* [v1061] 不再对复用的二级支管二次缩进；边界端点用于连接相邻分区主管段。 */
    branchDrawnLens=branchPipes.map(function(l){return tlPolyLen(l);});
  } else {
    /* 阀门与支管锚定分区中心；主管埋于支管下方600 mm，平面设计轴线与支管同向重合。
       图面需要区分时只移动渲染副本，不能旋转/平移设计线或水力坐标。 */
    /* 仅用于渲染层区分重合的主管/支管；设计与水力坐标保持中心线。 */
    function tlActualCellCenter(x,y,w,h){
      var fallback={x:x+w/2,y:y+h/2},geom=window.RyPlotEditorGeom;
      if(!geom||typeof geom.clipPolyToRect!=='function'||!tlGridPlotPoly||tlGridPlotPoly.length<3)return fallback;
      var pts=geom.clipPolyToRect(tlGridPlotPoly,x,y,x+w,y+h);if(!pts||pts.length<3)return fallback;
      var a=0,cx=0,cy=0;
      for(var i=0,j=pts.length-1;i<pts.length;j=i++){
        var cr=pts[j].x*pts[i].y-pts[i].x*pts[j].y;a+=cr;
        cx+=(pts[j].x+pts[i].x)*cr;cy+=(pts[j].y+pts[i].y)*cr;
      }
      if(Math.abs(a)<1e-9)return fallback;
      var c={x:cx/(3*a),y:cy/(3*a)};
      if(window.atPointInPolygon&&window.atPointInPolygon(c,pts))return c;
      var best=null,bestD=Infinity;
      for(var gy=1;gy<20;gy++)for(var gx=1;gx<20;gx++){
        var q={x:x+w*gx/20,y:y+h*gy/20};
        if(!window.atPointInPolygon||!window.atPointInPolygon(q,pts))continue;
        var d=(q.x-c.x)*(q.x-c.x)+(q.y-c.y)*(q.y-c.y);
        if(d<bestD){bestD=d;best=q;}
      }
      return best||fallback;
    }
    /* [v1079 用户拍板「竖向/横向一条管道要在一根线上」] 同列/同行一次定线（与二级
       ppBuildAutoPipes 同口径）：预扫全部格子取有效布管中心，按列（竖管布向）
       /行（横管布向）取统一中心线（有效值中位数，抗斜边形心漂移），全列/全行共用；
       本格用统一线裁剪后过短（<50% 净长）才回退本格形心线。 */
    var tlCentersPre=[];
    for(var zrP=0;zrP<rows;zrP++)for(var zcP=0;zcP<cols;zcP++)
      tlCentersPre.push({r:zrP,c:zcP,p:tlActualCellCenter(xPos[zcP],yPos[zrP],xSrc[zcP],ySrc[zrP])});
    function tlMedianOf(vals){
      var a=vals.slice().sort(function(u,v){return u-v;});
      var m=a.length>>1;
      return a.length%2?a[m]:(a[m-1]+a[m])/2;
    }
    var tlColVals=[],tlRowVals=[];
    tlCentersPre.forEach(function(zi){
      (tlColVals[zi.c]=tlColVals[zi.c]||[]).push(zi.p.x);
      (tlRowVals[zi.r]=tlRowVals[zi.r]||[]).push(zi.p.y);
    });
    var tlColLineX={},tlRowLineY={};
    tlColVals.forEach(function(vals,c){if(vals&&vals.length)tlColLineX[c]=tlMedianOf(vals);});
    tlRowVals.forEach(function(vals,r){if(vals&&vals.length)tlRowLineY[r]=tlMedianOf(vals);});
    for(var zr2=0;zr2<rows;zr2++){
      for(var zc3=0;zc3<cols;zc3++){
        var zx2=xPos[zc3], zy2=yPos[zr2];
        var zoneW2=xSrc[zc3], zoneH2=ySrc[zr2];
        var center=tlActualCellCenter(zx2,zy2,zoneW2,zoneH2);
        var centerX=center.x, centerY=center.y;
        var fixedSideIsHorizontal=majFixedH;   /* 第一分区定滴灌带轴，其余主管/支管全部垂直于该轴 */
        /* [v1079] 阀门仍锚本格有效中心；管线走本列/本行统一中心线 */
        var effLineX=(tlColLineX[zc3]!=null)?tlColLineX[zc3]:centerX;
        var effLineY=(tlRowLineY[zr2]!=null)?tlRowLineY[zr2]:centerY;
        if(fixedSideIsHorizontal){
          /* 滴灌带沿长边；支管横跨分区短边中心。地下主管与支管同向同投影。 */
          var brX=effLineX;
          /* [v830] 裁到地块内：旋转角下角格子会伸到外面；裁空的整根丢弃（含其满跨/留边记录），
             保证 mainPipes/branchPipes/branchFullSpans/branchDrawnLens 四个数组始终等长对齐。 */
          var tlSegB=tlClipPipeSeg({x:brX,y:zy2},{x:brX,y:zy2+zoneH2});
          /* [v1079] 统一线在本格出界/过短：回退本格形心线，保管线不为空 */
          if(tlSegB&&tlPolyLen(tlSegB)<zoneH2*0.5)tlSegB=null;
          if(!tlSegB)tlSegB=tlClipPipeSeg({x:centerX,y:zy2},{x:centerX,y:zy2+zoneH2});
          if(tlSegB){
            branchPipes.push(tlSegB); branchFullSpans.push(zoneH2); branchDrawnLens.push(tlPolyLen(tlSegB));
            mainPipes.push(tlSegB.map(function(p){return{x:p.x,y:p.y};}));
          }
          var tlMainIdx = tlSegB ? mainPipes.length-1 : -1;
          if(tlSegB && window.atPointInPolygon&&window.atPointInPolygon({x:centerX,y:centerY},tlGridPlotPoly))
            valves.push({x:centerX,y:centerY,mi:tlMainIdx});
        }else{
          var brY=effLineY;
          /* [v830] 同上：裁到地块内，裁空的整根丢弃 */
          var tlSegB2=tlClipPipeSeg({x:zx2,y:brY},{x:zx2+zoneW2,y:brY});
          /* [v1079] 统一线在本格出界/过短：回退本格形心线 */
          if(tlSegB2&&tlPolyLen(tlSegB2)<zoneW2*0.5)tlSegB2=null;
          if(!tlSegB2)tlSegB2=tlClipPipeSeg({x:zx2,y:centerY},{x:zx2+zoneW2,y:centerY});
          if(tlSegB2){
            branchPipes.push(tlSegB2); branchFullSpans.push(zoneW2); branchDrawnLens.push(tlPolyLen(tlSegB2));
            mainPipes.push(tlSegB2.map(function(p){return{x:p.x,y:p.y};}));
          }
          var tlMainIdx2 = tlSegB2 ? mainPipes.length-1 : -1;
          if(tlSegB2 && window.atPointInPolygon&&window.atPointInPolygon({x:centerX,y:centerY},tlGridPlotPoly))
            valves.push({x:centerX,y:centerY,mi:tlMainIdx2});
        }
      }
    }
  }

  // ===== 滴灌带示意（示意性质，两端不画到分区端头）=====
  // 垂直支管 → 滴灌带为支管两侧的水平短线；水平支管 → 滴灌带为支管上下的垂直短线。
  // 无论走二级复用还是三级自布管，均基于分区几何统一生成，与支管数据来源无关。
  /* [v830 2026-10-31] 旋转角下分区格子是「旋转后外接矩形」，格子会伸到地块外，
     滴灌带原来按整格撒 ⇒ 实测 30° 下 52% 端点落在地块外。这里统一裁到地块内，
     裁完不足 0.8m 的整根丢弃；0° 时格子本就在地块内，clip 原样返回，结果不变。 */
  function tlClipPipeSeg(a,b){
    var f=window.ppClipSegToPoly;
    if(typeof f!=='function'||!tlGridPlotPoly||tlGridPlotPoly.length<3)return [a,b];
    var seg=f(a,b,tlGridPlotPoly);
    if(!seg)return null;
    var L=Math.hypot(seg[1].x-seg[0].x,seg[1].y-seg[0].y);
    return L<0.8?null:seg;
  }
  var dripTapes=[];
  for(var zrT=0;zrT<rows;zrT++){
    for(var zcT=0;zcT<cols;zcT++){
      var zxT=xPos[zcT], zyT=yPos[zrT];
      var zwT=xSrc[zcT], zhT=ySrc[zrT];
      var fixedH=majFixedH;   /* 所有分区滴灌带沿第一分区长轴，主管/支管垂直于滴灌带 */
      var cxT=zxT+zwT/2, cyT=zyT+zhT/2;
      // 滴灌带端点距分区边缘留间隙（约边长的 6%，最小 2m），不触到分区端头
      var endGapX=Math.max(2,zwT*0.06), endGapY=Math.max(2,zhT*0.06);
      var halfX=Math.max(3,zwT/2-endGapX), halfY=Math.max(3,zhT/2-endGapY);
      // 沿支管方向分布范围同样留出上下/左右边距
      var ty0=zyT+Math.max(3,zhT*0.05), ty1=zyT+zhT-Math.max(3,zhT*0.05);
      var tx0=zxT+Math.max(3,zwT*0.05), tx1=zxT+zwT-Math.max(3,zwT*0.05);
      var nTape=Math.max(3,Math.min(8,Math.round((fixedH?zhT:zwT)/12)));
      /* [v416] 兜底：带长超过单边铺设长度×2 → 沿带向切成 nSeg 段（段间留 1.5m 接缝缺口） */
      var nSeg=1;
      if(tlAxisReport&&tlAxisReport.segs&&tlAxisReport.segs.length===cols*rows) nSeg=Math.max(1,tlAxisReport.segs[zrT*cols+zcT]||1);
      for(var tT=0;tT<nTape;tT++){
        var pA,pB;
        if(fixedH){
          var ty=ty0+(ty1-ty0)*(tT+0.5)/nTape;
          pA={x:cxT-halfX,y:ty}; pB={x:cxT+halfX,y:ty};
        }else{
          var tx=tx0+(tx1-tx0)*(tT+0.5)/nTape;
          pA={x:tx,y:cyT-halfY}; pB={x:tx,y:cyT+halfY};
        }
        var _segT=tlClipPipeSeg(pA,pB);
        if(nSeg<=1){ if(_segT) dripTapes.push(_segT); continue; }
        for(var sgT=0;sgT<nSeg;sgT++){
          var a0=sgT/nSeg, a1=(sgT+1)/nSeg;
          var qA={x:pA.x+(pB.x-pA.x)*a0,y:pA.y+(pB.y-pA.y)*a0};
          var qB={x:pA.x+(pB.x-pA.x)*a1,y:pA.y+(pB.y-pA.y)*a1};
          var ln=Math.hypot(qB.x-qA.x,qB.y-qA.y);
          var gp=ln>6?0.75:0;   /* 接缝缺口（单侧缩进），短段不缩 */
          var ux=ln>0?(qB.x-qA.x)/ln:0, uy=ln>0?(qB.y-qA.y)/ln:0;
          var _segS=tlClipPipeSeg({x:qA.x+ux*gp,y:qA.y+uy*gp},{x:qB.x-ux*gp,y:qB.y-uy*gp});
          if(_segS) dripTapes.push(_segS);
        }
      }
    }
  }

  // ===== Map-owned trunk geometry =====
  /* ===== [v570] 水源点可任意拖动（用户要求）=====
     口径：
     · 拖动值是**绝对世界坐标**（米），按地块指纹匹配；换地块自动失效。
     · 优先级：用户拖动值 > 二级页 ppShare.source > 自动推断（地块外沿/旧总管起点的近端）。
     · 用户放哪就是哪（v579 起总管已不再整体平移，本条自然成立）。
     · 右键「水源换向」(plot-editor.js tlSrcFlip) 会清除本值，换向才生效。
     · 材料与水力：水源→总管近端三通那条直线**计入总管长度**（v570 起，原来只画不算）。 */
  var TL_SRC_LS='tlSourceMove_v1';
  function tlSourceMoveOf(sig){
    if(!sig)return null;
    try{var o=JSON.parse(localStorage.getItem(TL_SRC_LS)||'null');
      if(!o||o.sig!==sig||!isFinite(o.x)||!isFinite(o.y))return null;
      return {x:o.x,y:o.y};}catch(e){return null;}
  }
  function tlSourceMoveSet(sig,x,y){
    if(!sig||!isFinite(x)||!isFinite(y))return;
    try{localStorage.setItem(TL_SRC_LS,JSON.stringify({sig:sig,x:Math.round(x*10)/10,y:Math.round(y*10)/10}));}catch(e){}
  }
  function tlSourceMoveClear(){ try{localStorage.removeItem(TL_SRC_LS);}catch(e){} }
  /* 水源→总管近端三通的直线长度（米）：绘图与水力/材料同一口径 */
  function tlSourceLinkLen(d){
    var dd=d||window.tlDiagramData;
    if(!dd||!dd.sourcePos||!dd.frontPipe||dd.frontPipe.length<2)return 0;
    var sp=dd.sourcePos, best=Infinity;
    for(var i=0;i<dd.frontPipe.length;i++){
      var p=dd.frontPipe[i], q=Math.hypot(p.x-sp.x,p.y-sp.y);
      if(q<best)best=q;
    }
    return isFinite(best)?best:0;
  }
  if(typeof window!=='undefined'){
    window.tlSourceMoveOf=tlSourceMoveOf;
    window.tlSourceMoveSet=tlSourceMoveSet;
    window.tlSourceMoveClear=tlSourceMoveClear;
    /* ===== [v592] 回传设计方案到云端地块库 =====
       把当前三级设计结果（管径 / 流速 / 水泵参数 / 分区数 / 亩数）回传到云端，与该地块配对存档，
       形成「地块 ↔ 设计」样本 —— 将来做统计、比对、回测、学习都靠这份配对数据。
       云端地块编号必须绑定到本标签页中实际载入并回传的本地地块，且当前地块锚点和边界仍一致。
       主站只负责跳转，写库在云端页完成（需管理员登录）。 */
    window.tlUploadDesign=function(){
      try{
        var bindingStore=window.RyCloudDesignBindingStore;
        if(!bindingStore || typeof bindingStore.resolveForCurrentPlot!=='function'){
          alert('云端地块关联服务未加载，请刷新页面后重试'); return;
        }
        var binding=bindingStore.resolveForCurrentPlot();
        if(!binding || !binding.ok){
          var message=binding&&binding.error==='cloud-plot-not-bound'
            ? '请先从云端地块库「载入地图」，再把同一地块从在线地图回传到地块分区后重试。'
            : '当前设计地块与云端来源不一致或地块边界已变化，请回到在线地图重新载入并回传该云端地块。';
          alert(message); return;
        }
        var plotId=binding.cloudPlotId;
        var T=function(id){ var e=document.getElementById(id); return e?(e.textContent||'').trim():''; };
        var V=function(id){ var e=document.getElementById(id); return e?(e.value||'').trim():''; };
        var d={
          frontOd:T('tlPlanFrontPipe'), frontVel:T('tlPlanFrontVelocity'),
          mainOd:T('tlPlanMainPipe'), mainVel:T('tlPlanMainVelocity'),
          branchOd:T('tlPlanBranchPipe'), branchVel:T('tlPlanBranchVelocity'),
          combinedFlow:T('tlPlanCombinedFlow'), pumpFlow:T('tlPlanPumpFlow'),
          pumpHead:T('tlPlanPumpHead'), pumpPower:T('tlPlanPumpPower'), motorPower:T('tlPlanMotorPower'),
          zoneCount:V('tl_zoneCount'), mu:V('tl_zoneMu'), ts:Date.now(), src:'tl'
        };
        var url='https://plot-library.app.workbuddy.host/design.html?plotid='+encodeURIComponent(plotId)
          +'&data='+encodeURIComponent(JSON.stringify(d));
        if(url.length>8000){ alert('设计数据过大，暂不能回传'); return; }
        window.open(url,'_blank','noopener');
      }catch(e){ alert('回传失败：'+(e&&e.message?e.message:e)); }
    };
    window.tlSourceLinkLen=tlSourceLinkLen;
  }


  /* [v1017 2026-11-08 用户拍板] 恢复 v900 误删的段总管生成链（扬程对不上排查
     TASK_pump_head_mismatch_20261108 §5.0 P0）：v900(fb12ca2) 修水源 tooltip 时顺带
     删除了本块与 segTrunk 快照/反投，致 tlWorstPathLen 恒 EMPTY、RyPipePathLoss
     整链死亡、管损卡恒「试算输入值」。本块按 v859→v869→v873→v874 沿革原文恢复，
     仅两处适配：① src 传 null（tlSrcDesign/frontPipe 已随 v1015 清除，模块对 null
     的默认侧行为有 tl_seg_trunk.test.cjs 覆盖）；② v874 的 tlIdealMains 兜底随该
     变量一同退役，退化场景保持 null + 图面原因提示。 */
  /* [v859 用户需求 → v869 定版] 段总管（自动生成）：垂直于主管、串联各分区主管；
     起点在最上/最左分区主管上（vMin 端）、终点在最下/最右分区主管上（vMax 端），
     两端不再外延驳接段（stub=0，用户方案B），驳接点方块标记画在首末主管串联处。
     [v869] 贴边：干线贴各主管**同一侧端点**（不再放走向交集正中——用户实测
     「没看到/不好定位」）；贴哪侧自动判断：水源（tlSrcDesign，缺则总管起点
     frontPipe[0]，再缺则默认左/上侧）落在走向交集中点的哪一半。传局部格系 src。
     数据落地在下方 tlDiagramData.segTrunk（转世界坐标、len 按世界坐标重算），
     供在线地图页驳接点捕捉与扬程收口（tlFrontLenUse）。 */
  var tlSegTrunkLoc = null;
  try {
    if (window.RySegTrunk && mainPipes.length >= 2) {
      tlSegTrunkLoc = window.RySegTrunk.build(mainPipes, { src: null });
    }
  } catch (eSeg0) { }
  /* [v1017b 2026-11-08 用户拍板] 图面**不画**段总管（黑线/驳接点/未生成提示全部撤除）：
     用户看到黑线以为「已取消的自动总管回潮」。数据快照（下方 segTrunk IIFE）保留 ——
     segWorstPath / tlFrontLenUse / map-flow-demo 的扬程链依赖它；反投在线地图保留
     （v878 用户要求 + tlSegAnchorIdx 驳接端判定读快照 seg 段）。 */
  if (false && tlSegTrunkLoc) {
    var sgD = '';
    tlSegTrunkLoc.points.forEach(function (p, i) { var q = tsGrid(p.x, p.y); sgD += (i === 0 ? 'M' : 'L') + q.x.toFixed(1) + ' ' + q.y.toFixed(1) + ' '; });
    parts.push('<path data-tlpipe="segTrunk" d="' + sgD + '" fill="none" stroke="#111827" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>');
    tlSegTrunkLoc.couplers.forEach(function (p, ci) {
      var q = tsGrid(p.x, p.y);
      parts.push('<rect data-tlseg-coupler="' + ci + '" x="' + (q.x - 4).toFixed(1) + '" y="' + (q.y - 4).toFixed(1) + '" width="8" height="8" fill="#ffffff" stroke="#111827" stroke-width="1.6"/>');
      parts.push('<text data-tlseg-coupler-label="' + ci + '" x="' + (q.x + 7).toFixed(1) + '" y="' + (q.y + 3.5).toFixed(1) + '" font-size="9" fill="#111827" font-family="system-ui">驳接</text>');
    });
  }
  /* 末尾渲染分支整体保留供一行恢复：把上面的 if(false) 改回 if(tlSegTrunkLoc)，并恢复
     else if 的 lastError 提示（v873 口径）。 */

  // 手绘总管在在线地图（tlMapTrunkLen 收口进扬程）；干线（段总管）由本页自动生成并画在图面。
  // Draw main pipes (blue) — clipped to plot boundary
  var tlPipeDisplay=(typeof window.ppGetPipeDisplayGeometry==='function')
    ?window.ppGetPipeDisplayGeometry(mainPipes,branchPipes,valves,tlGapM())
    :{main:mainPipes,branch:branchPipes,valves:valves,valveAnchors:[]};
  parts.push('<g clip-path="url(#tlPlotClip)">');
  mainPipes.forEach(function(l,mi){
    var md='';
    var viewLine=tlPipeDisplay.main[mi]||l;
    for(var i=0;i<viewLine.length;i++){var p=tsGrid(viewLine[i].x,viewLine[i].y);md+=(i===0?'M':'L')+p.x.toFixed(1)+' '+p.y.toFixed(1)+' ';}
    var tlHidM=window.tlIsPipeHidden('main-'+mi);
    parts.push('<path data-tlpipe="main-'+mi+'" d="'+md+'" fill="none" stroke="'+(tlHidM?'#64748b':'#185FA5')+'" stroke-width="5"'+(tlHidM?' stroke-dasharray="8,5" opacity="0.55"':'')+' stroke-linecap="round" stroke-linejoin="round"/>');
  });

  // Draw branch pipes (green) — clipped to plot boundary
  branchPipes.forEach(function(l,bi){
    var bd='';
    var viewLine=tlPipeDisplay.branch[bi]||l;
    for(var i=0;i<viewLine.length;i++){var p=tsGrid(viewLine[i].x,viewLine[i].y);bd+=(i===0?'M':'L')+p.x.toFixed(1)+' '+p.y.toFixed(1)+' ';}
    var tlHidB=window.tlIsPipeHidden('branch-'+bi);
    parts.push('<path data-tlpipe="branch-'+bi+'" d="'+bd+'" fill="none" stroke="'+(tlHidB?'#64748b':'#16a34a')+'" stroke-width="3"'+(tlHidB?' stroke-dasharray="8,5" opacity="0.55"':'')+' stroke-linecap="round" stroke-linejoin="round"/>');
  });

  /* v172（2026-10-01 用户要求「修改一下管道显示的图层逻辑，总管道位于最底层，主管位于总管上层，
     支管位于总管的上层，滴灌带与支管在一层」，并经选项确认）——
     管道叠放顺序（自下而上）：总管 → 主管 → 支管 → 滴灌带。
     滴灌带与支管同层，同层内滴灌带压在支管之上 ⇒ 滴灌带**后**于支管绘制（本次由「支管之前」调到「支管之后」）。
     旧口径「画在支管之下、支管覆盖中段，视觉上从支管两侧伸出」已废止。
     滴灌带仍在同一地块裁剪组内（与支管同组），出界部分与支管一并裁剪，行为不变。
     data-tltape：稳定标识，供图层契约闸门按「文档顺序」断言叠放层级（勿删）。 */
  dripTapes.forEach(function(l){
    var td='';
    for(var i=0;i<l.length;i++){var p=tsGrid(l[i].x,l[i].y);td+=(i===0?'M':'L')+p.x.toFixed(1)+' '+p.y.toFixed(1)+' ';}
    parts.push('<path data-tltape="1" d="'+td+'" fill="none" stroke="#67e8f9" stroke-width="1.4" stroke-dasharray="3,3" stroke-linecap="round"/>');
  });
  parts.push('</g>');

  // Source —— 标签贴在水源点（总管顶端）左侧，用短折线引线连到水源点
  /* v180（2026-10-02 用户要求「三级管路编辑插入的节点及连线转成管道后要在三级简图里显示」）：
     简图（tlAutoGenerate）原先只画 front/main/branch 三类自动管 + 阀门/交接三通，
     完全不渲染三级工作区插入的「节点连线」（RyTlNodes.links，紫色 L-## 线）与节点圆点 ——
     工作区里能看见、材料表也统计（v168 连线 / v151 节点配件），唯独简图缺这一层。
     本段在「已画管线」之上补画：同管连线=沿宿主管折线取弧长子段；跨管连线=两节点平面直连；
     节点=紫色圆点 + 连接度角标。几何取本函数已绘制的 frontPipe/mainPipes/branchPipes
     （与下方已落 SVG 的管线逐点同源），不用 AE.effPts（会再叠 lens/moves，导致错位）。
     只补显示层，不进 tlDiagramData / 水力 / 材料（材料已由 v168 单独统计）。整段删除即卸载。 */
  try {
    /* v180b（2026-10-02）：节点/连线图层抽成 tlBuildTlNodesLayer()（节点与连线各自独立渲染，
       仅加节点、无连线也显示）。实时刷新由 tlRefreshTlNodesLayer 订阅 RyTlNodes 完成。
       v183（2026-10-02）：无节点/连线时也落一个**空锚点组** —— 实时刷新靠「旧层 nextSibling」
       定位插入点（保持与整图重生成的叠放次序一致：滴灌带之后、水源/阀门/交接符号之前）；
       无锚点时只能 append 到地块组末尾，层序与重生成不一致（节点圆点会压在阀门符号之上）。 */
    var tlNodeLayerSvg = tlBuildTlNodesLayer({ frontPipe: null, mainPipes: mainPipes, branchPipes: branchPipes, ts: function(x,y){return tsGrid(x,y);} });
    parts.push(tlNodeLayerSvg || '<g data-tlnode-layer="1"></g>');
  } catch (eNdLink) { parts.push('<g data-tlnode-layer="1"></g>'); }


  // 为来自二级页的阀门（仅含坐标、无连接点）补算最近主管线段上的 45° 斜向连接点，
  // 与二级页"阀门沿 45° 斜拉接到主管"的表示方法一致（非垂直投影）
  function tlValveConnPt(v){
    if(!mainPipes.length)return null;
    function tlClamp(a,b,c){return a<b?b:(a>c?c:a);}
    var segs=[];
    mainPipes.forEach(function(l){for(var i=0;i+1<l.length;i++)segs.push([l[i],l[i+1]]);});
    var best=null,bd=Infinity;
    segs.forEach(function(sg){
      var a=sg[0],b2=sg[1];
      var dx=b2.x-a.x,dy=b2.y-a.y;
      var horiz=Math.abs(dy)<=Math.abs(dx)*0.25, vert=Math.abs(dx)<=Math.abs(dy)*0.25;
      var pj;
      if(vert){ // 主管竖向：连接点 x=主管x，y 沿 45° 偏（阀门在右→左上，在左→右下）
        var px=a.x, off=Math.abs(v.x-px);
        var py=(v.x>=px)?(v.y-off):(v.y+off);
        py=tlClamp(py,Math.min(a.y,b2.y),Math.max(a.y,b2.y));
        pj={x:px,y:py};
      }else if(horiz){ // 主管横向：连接点 y=主管y，x 沿 45° 偏（阀门在下→右，在上→左）
        var py2=a.y, off2=Math.abs(v.y-py2);
        var px2=(v.y>=py2)?(v.x+off2):(v.x-off2);
        px2=tlClamp(px2,Math.min(a.x,b2.x),Math.max(a.x,b2.x));
        pj={x:px2,y:py2};
      }else{ // 斜主管：退化用最近点投影
        var c=dx*dx+dy*dy; if(c===0){pj={x:a.x,y:a.y};}
        else{var t=((v.x-a.x)*dx+(v.y-a.y)*dy)/c; if(t<0)t=0; else if(t>1)t=1; pj={x:a.x+dx*t,y:a.y+dy*t};}
      }
      if(!pj)return;
      var ex=v.x-pj.x,ey=v.y-pj.y,dd=ex*ex+ey*ey;
      if(dd<bd){bd=dd;best=pj;}
    });
    // 阀门距主管过近（≤0.5m）视为已在主管上，不画连接管（避免 0 长度短线）
    return (best && Math.sqrt(bd)>0.5) ? best : null;
  }
  valves.forEach(function(v){ if(v.ax===undefined||v.ay===undefined){ var cp=tlValveConnPt(v); if(cp){v.ax=cp.x;v.ay=cp.y;} } });

  // Valves —— 斜向连接管把阀门与主管接通，更直观（连接管与主管同色，画在红圈之下）
  valves.forEach(function(v,idx){
    if(window.atPointInPolygon&&!window.atPointInPolygon(v,tlGridPlotPoly))return;
    var __viewValve=tlPipeDisplay.valves[idx]||v;
    var vp=tsGrid(__viewValve.x,__viewValve.y);
    var __viewAnchor=tlPipeDisplay.valveAnchors[idx]||((v.ax!==undefined&&v.ay!==undefined)?{x:v.ax,y:v.ay}:null);
    if(__viewAnchor){
      var ap=tsGrid(__viewAnchor.x, __viewAnchor.y);
      /* [M13 2026-11-13] 阀门连接管（蓝实线）包 data-tlvalve 标记：简图（图纸输出）
         显示不受影响；三级工作区克隆底图时按此标记整组透明化 —— 阀门只由二级
         画布 ryValveCanvas 显示一份（单一可见线体层）。三通/弯头方块（标注符号，
         二级不画）留在标记之外保持可见。 */
      parts.push('<g data-tlvalve="1"><line x1="'+ap.x.toFixed(1)+'" y1="'+ap.y.toFixed(1)+'" x2="'+vp.x.toFixed(1)+'" y2="'+vp.y.toFixed(1)+'" stroke="#185FA5" stroke-width="3.5" stroke-linecap="round" opacity="0.92"/></g>');
      /* 任务⑧（2026-09-24 用户要求）：主管×支管交接处补三通方块 —— 与总管×主管交接
         （data-junction-tee，深蓝白边 9×9）同款式，交接符号全覆盖。
         [v553] 最外一排分区的主管末端是**90°弯头**（不再向下延伸）：同一方块内叠一个白色
         直角折线以区分；仍保留 data-junction-tee（水流路径取锚点、既有 verify 定位都靠它），
         额外打 data-junction-elbow="1" 供按「弯头」口径识别。材料口径走数据层 v.elbow。 */
      if(v.elbow){
        var elH=Math.abs(v.ay-v.y)<=Math.abs(v.ax-v.x);   /* 连接管水平（主管竖置）为真 */
        var elP=elH
          ? 'M'+(ap.x-2.8).toFixed(1)+' '+(ap.y-2.8).toFixed(1)+'L'+(ap.x-2.8).toFixed(1)+' '+(ap.y+2.8).toFixed(1)+'L'+(ap.x+2.8).toFixed(1)+' '+(ap.y+2.8).toFixed(1)
          : 'M'+(ap.x-2.8).toFixed(1)+' '+(ap.y-2.8).toFixed(1)+'L'+(ap.x+2.8).toFixed(1)+' '+(ap.y-2.8).toFixed(1)+'L'+(ap.x+2.8).toFixed(1)+' '+(ap.y+2.8).toFixed(1);
        parts.push('<rect data-junction-tee data-junction-elbow="1" x="'+(ap.x-4.5).toFixed(1)+'" y="'+(ap.y-4.5).toFixed(1)+'" width="9" height="9" fill="#0C447C" stroke="#ffffff" stroke-width="1.5"/>');
        parts.push('<path data-junction-elbow-mark="1" d="'+elP+'" fill="none" stroke="#ffffff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>');
      }else{
        parts.push('<rect data-junction-tee x="'+(ap.x-4.5).toFixed(1)+'" y="'+(ap.y-4.5).toFixed(1)+'" width="9" height="9" fill="#0C447C" stroke="#ffffff" stroke-width="1.5"/>');
      }
    }
    /* [M13] 阀门圆包 data-tlvalve：工作区克隆时整组 opacity=0，简图本身不变。 */
    parts.push('<g data-tlvalve="1">' + window.ryValveSVG(vp.x, vp.y) + '</g>');   /* v159：与总管×主管交接阀同规格（尺寸取自 window.RY_VALVE） */
  });

  // ===== 地块组结束：以下参数/图例/A3框固定不动 =====
  parts.push('</g>');

  // Legend + params at bottom —— 整体下移、分块对齐、与图面拉开间距
  var r=computeThreeLevel({ allowUnmatchedGeometry: true });
  if (!r) return false;
  /* ===== 图面几何快照「提前落地」+ 重算（2026-09-16）=====
     computeThreeLevel 的「最远分区最不利路径」长度读 window.tlDiagramData；若按原来的顺序
     （先算 r → 再写 tlDiagramData）本幅图的简图参数/水泵扬程会用上一幅图的旧几何。
     故这里先把本次几何快照写入，再重算一次 r，并同步刷新左栏结果条与左下角损失卡。 */
  var ddCouplerSource='none';   /* [v913-coupler-nodes] 由下方 couplerNodes 投影 IIFE 接力写入 */
  window.tlDiagramData = { version: 1, schemaVersion: 1, world: 'meter', generatedAt: new Date().toISOString(), plot: { w: plotW, h: plotH },
    /* [v873] trunkSource 带失败原因：'auto' | 'missing(<原因>)' —— 旋转分区角度后
       段总管消失的排障依据（地图页/工作区/探针都读得到）。 */
    /* [v1017] 恢复 v873 口径：trunkSource 记录段总管来源 'auto' | 'missing(<原因>)'
       （v900 曾改为恒 'map-manual'，排障线索丢失）。 */
    trunkSource: tlSegTrunkLoc ? 'auto' : ('missing(' + (window.RySegTrunk && window.RySegTrunk.lastError ? window.RySegTrunk.lastError : 'not-built') + ')'),
    poly: JSON.parse(JSON.stringify(poly)),
    combinedN: tlGetZoneCount(),   /* 2026-09-16 联合灌溉区数 N，供工作区分组着色读取（简图不变） */
    zones: { cols: cols, rows: rows, xPos: xPos.slice(), yPos: yPos.slice(), xPlan: xPlan.slice(), yPlan: yPlan.slice(), xSrc: xSrc.slice(), ySrc: ySrc.slice(),
             /* Grid cuts stay in local design coordinates; this serializable frame maps them back to immutable plot coordinates. */
             frame: tlZoneCuts.frame ? {angle:tlZoneCuts.frame.angle,center:tlZoneCuts.frame.center,origin:tlZoneCuts.frame.origin,scaleX:tlZoneCuts.frame.scaleX,scaleY:tlZoneCuts.frame.scaleY} : null,
             /* v98h 阶梯覆盖表必须随图面数据走：tlAutoGenerate 每次重建 tlDiagramData，
                漏掉这两项就会在「松手 / 改参数 / 切页重生成」时把阶梯抹平（线弹回直的一条）。
                空表时为 null ⇒ 工作区与面积计算都退回基础网格，与改动前一致。 */
             cutOffX: (tlZoneStepRef ? tlZoneStepRef.x : null), cutOffY: (tlZoneStepRef ? tlZoneStepRef.y : null) },
    /* SVG/设计阶段使用旋转网格局部坐标；tlDiagramData 是跨模块的真实地块坐标契约。 */
    mainPipes: mainPipes.map(function(line){return line.map(function(p){return tlGridWorld(p.x,p.y);});}),
    /* [v913-coupler-nodes] 接驳节点参数投影：读设计侧 ppState.couplerNodes（[{pipeKey,s 米}]），
       在本幅世界米主管折线上取 s 弧长点 → dd.couplerNodes=[{pipeKey,s,x,y}]。
       s 跨重生成稳定（「距起点 30m」在新几何上仍有效），失配仅当 pipeKey 对应主管消失
       ⇒ 保留参数、坐标置 null + couplerSource 带原因（仿 trunkSource 排障惯例）。
       非等比 frame（scaleX≠scaleY）下弧长必须在世界米折线上算，禁止用格系折线按比例取点。 */
    couplerNodes: (function(){
      try{
        var pp=window.ppGetState?window.ppGetState():null;
        var list=(pp&&Array.isArray(pp.couplerNodes))?pp.couplerNodes:[];
        if(!list.length)return [];
        /* [v913] 身份口径：pipeKey='m'+(本幅 mainPipes 索引+1)，与设计侧
           ppCouplerProject 产出严格同源（dd.mainPipes 由 tlAutoGenerate 确定性重建，
           顺序稳定 ⇒ pipeKey 跨重生成稳定）。禁用 ppState.pipeIds.main 做身份源——
           自动生成流里 L2 手绘层为空 ⇒ pipeIds.main=[]，会全量 missing。 */
        function pipeIndexByKey(key){
          var m=/^m(\d+)$/.exec(String(key||''));
          return m?(parseInt(m[1],10)-1):-1;
        }
        var world=mainPipes.map(function(line){return line.map(function(p){return tlGridWorld(p.x,p.y);});});
        function linePointAt(line,s){
          var acc=0;
          for(var k=1;k<line.length;k++){
            var dx=line[k].x-line[k-1].x,dy=line[k].y-line[k-1].y,seg=Math.hypot(dx,dy);
            if(seg<=0)continue;
            if(acc+seg>=s){var t=(s-acc)/seg;return {x:line[k-1].x+dx*t,y:line[k-1].y+dy*t};}
            acc+=seg;
          }
          var last=line[line.length-1];return {x:last.x,y:last.y};
        }
        var missing=null;
        var out=list.map(function(n){
          var idx=pipeIndexByKey(n.pipeKey);
          var s=Math.max(0,Number(n.s)||0);
          if(idx<0||!world[idx]||world[idx].length<2){
            if(!missing)missing=n.pipeKey;
            return {pipeKey:n.pipeKey,s:s,x:null,y:null};
          }
          var pt=linePointAt(world[idx],s);
          return {pipeKey:n.pipeKey,s:s,x:pt.x,y:pt.y};
        });
        ddCouplerSource=(list.length?(missing?('missing('+missing+')'):'ok'):'none');
        return out;
      }catch(e){ try{console.warn('[coupler-nodes] 投影失败',e);}catch(e2){} ddCouplerSource='error'; return []; }
    })(),
    /* [v913-coupler-nodes] 投影健康度：'none'(无节点) | 'ok' | 'missing(<pipeKey>)' | 'error'。
       由上方 IIFE 写入 ddCouplerSource（对象字面量内无法给兄弟字段赋值，故用临时变量接力）。 */
    couplerSource: (typeof ddCouplerSource!=='undefined'?ddCouplerSource:'none'),
    /* [v859] 段总管：局部几何转世界坐标 + len 按世界坐标重算（frame 缩放不漂）。
       在线地图页读 segTrunk.couplers 反算经纬度做驳接点捕捉；扬程收口读 segTrunk.len。 */
    /* [v859] 段总管：局部几何转世界坐标 + len 按世界坐标重算（frame 缩放不漂）。
       在线地图页读 segTrunk.couplers 反算经纬度做驳接点捕捉；扬程收口读 segTrunk.len。
       [v1017] 恢复 v900 误删的快照落地（segWorstPath/tlFrontLenUse/map-flow-demo 的数据源）。 */
    segTrunk: (function(){
      if(!tlSegTrunkLoc) return null;
      var W=function(p){return tlGridWorld(p.x,p.y);};
      var pts=tlSegTrunkLoc.points.map(W);
      var len=Math.hypot(pts[1].x-pts[0].x, pts[1].y-pts[0].y);
      return { axis: tlSegTrunkLoc.axis, side: tlSegTrunkLoc.side,
        points: pts, couplers: tlSegTrunkLoc.couplers.map(W),
        joinPts: tlSegTrunkLoc.joinPts.map(W),
        stub: tlSegTrunkLoc.stub, len: len, lenJoin: len - 2*tlSegTrunkLoc.stub };
    })(),
    branchPipes: branchPipes.map(function(line){return line.map(function(p){return tlGridWorld(p.x,p.y);});}),
    /* [v601] 支管「设计满跨 / 图面长」两个基准（索引与 branchPipes 一一对应）：
       计算（材料清单、最不利路径水损）一律按满跨；图面两端 gapV/gapH 留边只影响显示。 */
    branchFullSpans: branchFullSpans.slice(), branchDrawnLens: branchDrawnLens.slice(),
    valves: valves.map(function(v){var p=tlGridWorld(v.x,v.y),a=(v.ax!=null&&v.ay!=null)?tlGridWorld(v.ax,v.ay):null;return Object.assign({},v,p,a?{ax:a.x,ay:a.y}:{});}),
    dripTapes: dripTapes.map(function(line){return line.map(function(p){return tlGridWorld(p.x,p.y);});}),
    partialFlags: tlPartialFlags.slice(), zoneActMu: planAreas.map(function(a){return Math.round((Number(a)/MU_TO_SQM)*10)/10;}),
    /* This row-major vector is the one area allocation used by hydraulics, labels,
       and the map publication transaction. The map consumes it; it does not recalculate it. */
    zoneAreasM2: planAreas.slice(), areaSnapshot: {source:'map-measured-total/current-planning-geometry',totalAreaM2:Number(window.measuredArea),zoneCount:planAreas.length},
    activeZoneIndices: planAreas.reduce(function(list,area,index){if(Number(area)>0)list.push(index);return list;},[]),
    /* [v1015 2026-11-08 用户拍板] 快照不再落自动总管/三通/水源设计几何：
       frontPipe/sourcePos 恒 null（手绘总管经 tlMapTrunkLen/段总管驳接进水力），
       frontNodes（三通断点清单，全项目零消费方）随自动链路一并移除。 */
    frontPipe: null,
    sourcePos: null };
  r = computeThreeLevel();
  if(!r||!window.tlDiagramData||!window.tlDiagramData.generatedAt||
      !Array.isArray(r.zoneAreas)||r.zoneAreas.length!==totalZones||
      !Array.isArray(window.tlDiagramData.zoneAreasM2)||window.tlDiagramData.zoneAreasM2.length!==r.zoneAreas.length||
      r.zoneAreas.some(function(area,i){return Math.abs(Number(area)-Number(window.tlDiagramData.zoneAreasM2[i]))>Math.max(1e-7,Math.abs(Number(area))*1e-12);})||
      !window.tlDiagramData.mainPipes||!window.tlDiagramData.mainPipes.length||
      !window.tlDiagramData.branchPipes||!window.tlDiagramData.branchPipes.length){
    throw new Error('当前施工图数据不完整，未发布到在线地图');
  }
  try { tlUpdatePlanBar(); } catch (e) { }
  var pumpFlowEl=document.getElementById('tlPlanPumpFlow');
  var pumpHeadEl=document.getElementById('tlPlanPumpHead');
  var pumpPowerEl=document.getElementById('tlPlanPumpPower');
  var frontPipeEl=document.getElementById('tlPlanFrontPipe');
  var mainPipeEl=document.getElementById('tlPlanMainPipe');
  var branchPipeEl=document.getElementById('tlPlanBranchPipe');
  /* meta 按刷新后的结果条文本补齐（iso/工作区只读；不参与计算） */
  window.tlDiagramData.meta = { zoneCount: totalZones,
    flowModel: { areaSource: r.flowAreaSrc, zoneAreasM2: r.zoneAreas.slice(), totalAreaM2: r.totalArea, maxZoneAreaM2: r.flowAreaM2, combinedAreaM2: r.combinedAreaM2,
      zoneFlow: r.zoneFlow, branchFlow: r.branchFlow, combinedFlow: r.combinedFlow, zoneCount: r.zoneCount, branchCount: r.branchCount, layoutSides: r.layoutSides, branchParallelCount: r.branchParallelCount },
    pump: { flow: (pumpFlowEl ? pumpFlowEl.textContent : ''), head: (pumpHeadEl ? pumpHeadEl.textContent : ''), power: (pumpPowerEl ? pumpPowerEl.textContent : '') },
    pipes: { front: (frontPipeEl ? frontPipeEl.textContent : ''), main: (mainPipeEl ? mainPipeEl.textContent : ''), branch: (branchPipeEl ? branchPipeEl.textContent : '') } };
  /* 水力校核页唯一计算来源：保存三级规划的最终几何与已确定的设计流量。
     地图反投只承担显示，不再用滴灌带像素/坐标反推流量。 */
  var hydraulicDesignTs = Date.now();
  var hydraulicDesignRevisionId = hydraulicDesignTs.toString(36) + '-' + Math.random().toString(36).slice(2);
  if(options.publishToMap===true) try {
    var ds=window.RyIrrigationDataStore;
    previousHydraulicDesign=ds&&typeof ds.readHydraulicDesignForPlot==='function'
      ?ds.readHydraulicDesignForPlot(window.currentPlotId||null)
      :(ds&&typeof ds.readHydraulicDesign==='function'?ds.readHydraulicDesign():null);
    hydraulicDesignSaved = window.RyIrrigationDataStore.writeHydraulicDesign({ version: 1, ts: hydraulicDesignTs,
      designRevisionId: hydraulicDesignRevisionId,
      plotId: window.currentPlotId || null,
      generatedAt: window.tlDiagramData.generatedAt,
      geometry: { frontPipe: JSON.parse(JSON.stringify(window.tlDiagramData.frontPipe || [])),
        mainPipes: JSON.parse(JSON.stringify(window.tlDiagramData.mainPipes || [])),
        branchPipes: JSON.parse(JSON.stringify(window.tlDiagramData.branchPipes || [])) },
      hydraulics: { areaSource: r.flowAreaSrc, zoneAreasM2: r.zoneAreas.slice(), totalAreaM2: r.totalArea, maxZoneAreaM2: r.flowAreaM2, combinedAreaM2: r.combinedAreaM2,
        combinedFlow: r.combinedFlow, zoneFlow: r.zoneFlow, branchFlow: r.branchFlow, branchParallelCount: r.branchParallelCount, layoutSides: r.layoutSides,
        tapePressureM: r.tapePressureM, lift: r.lift, dh: r.dh, filterLoss: r.filterLoss,
        efficiency: r.efficiency, pumpHead: r.pumpHead,
        frontPipe: { od: r.frontPipe.od }, mainPipe: { od: r.mainPipe.od }, branchPipe: { od: r.branchPipe.od } } }) === true;
  } catch (eHydSnapshot) { }
  if(options.publishToMap===true&&!hydraulicDesignSaved)throw new Error('水力设计快照写入失败，在线地图未更新');

  var iy=footerTop+52; // 底部参数块起始 y（整体下移，与图例对齐）
  parts.push('<g id="tlParamsGroup" font-size="10.5" font-weight="600" fill="#334155">');
  /* v116（2026-09-22 用户要求）：参数行显示管道「实际直径 + 实际长度」——
     直径 = 图面改径（RyTlAutoEdits.cals）按管长加权的该类代表径，无改径退回水力计算值；
     长度 = computeThreeLevel 实际采用长度（最不利路径图面几何，含图面改长/平移），与损失/扬程同源。
     旧版只显示水力计算径且无长度，图面改径后点「生成管线图」数字不动（用户实测）。
     meta.pipes 保持设计径文本不动（iso/network-model 消费，多道 e2e 只读红线）。 */
  /* v137：两行文案抽到全局 tlFigParamLines 单一来源（逐字同格式）——
     「应用到图面」改径重算后以同一构造实时重写简图/系统简图内这两行。 */
  var tlPl = window.tlFigParamLines(r);
  parts.push('<text x="40" y="'+iy+'">'+tlPl.lines[0]+'</text>');
  /* v109b：结果条文本已自带单位（如「185.1 m³/h」），此处不再重复拼单位 */
  parts.push('<text x="40" y="'+(iy+22)+'">'+tlPl.lines[1]+'</text>');
  parts.push('</g>');

  // 图例：与参数块第二行（联合灌溉/水泵）同一基线对齐
  // 2026-09-16：色块/圆点与文字垂直居中（dominant-baseline="central"）；
  // 2026-09-16 二次调整：各项横向等距 —— 统一槽位步进 60px（符号起点=槽位 s，
  // 文字起点 = 色块项 s+20 / 圆点·虚线项 s+16，符号与文字间隙统一 6px），整体在画布水平居中。
  /* v489（用户实测：图例与底部参数行重叠）—— 图例改靠 A3 右侧边框对齐：
     原 lx=svgW/2-180 居中，参数行（总管/主管/支管 径+长）长了就压到图例。
     v642（2026-10-21 用户实测：末项「滴灌带」与外框重叠，要求「图例整体向左移动一些」）——
     上一版的估算口径错了：注释按「末项文字止于 lx+346 = svgW-12」留 4 单位余量，
     但 A3 内细框线在 **svgW-16**（见上方 #tlFrameGroup：内细线 x=16 w=svgW-32），
     估算值本身就比内框线大 4 单位；字号 10 / 字重 600 的三个汉字实测 31.8 单位
     （不是 30），于是整组右缘落在 svgW-11.2 = 1178.8，越过内细线 4.8 单位 ⇒ 压线。
     实测（_p1/_probe_tl_legend_frame.cjs）：图例 bbox x=832 w=346.8 ⇒ 右缘 1178.8，
     内细线 1174、外粗线 1182 —— 不压外粗线但压内细线，正是用户看到的现象。
     改法：lx 由 svgW-358 左移 **20** 单位 → svgW-378，整组右缘 1158.8，
     距内细线留 15.2 单位（与「内框内缩 16」同一视觉口径），末项文字完整落在内框内。
     只动 lx 一个数，各项相对步进（60/60/65/60/55/16）与字号全不变，图例内部节奏原样。
     注：同一条 lx 也被「下载 SVG / 下载 PNG / 打印」共用（都出自本 parts），一处改全局一致；
     工作区克隆底图与 DXF 导出整组剥离 tlLegendGroup，不受影响。 */
  /* [v1017b] 图例撤「总管」项：段总管黑线已不再画进图面（用户拍板，见上方 if(false) 渲染块），
     图例不再保留失配条目。整组右缘不变：lx 由 svgW-378 → svgW-318（原总管项占 60），其余步进不变。 */
  var lx=svgW-318, ly=iy+17;
  parts.push('<g id="tlLegendGroup" font-size="10" font-weight="600">');
  parts.push('<rect x="'+lx+'" y="'+ly+'" width="14" height="4" fill="#185FA5" rx="2"/><text x="'+(lx+20)+'" y="'+(ly+2)+'" dominant-baseline="central" fill="#0C447C">主管</text>');
  parts.push('<rect x="'+(lx+60)+'" y="'+ly+'" width="14" height="3" fill="#16a34a" rx="2"/><text x="'+(lx+80)+'" y="'+(ly+2)+'" dominant-baseline="central" fill="#166534">支管</text>');
  parts.push('<circle cx="'+(lx+125)+'" cy="'+(ly+2)+'" r="5" fill="#f59e0b"/><text x="'+(lx+136)+'" y="'+(ly+2)+'" dominant-baseline="central" fill="#92400e">水源</text>');
  parts.push('<circle cx="'+(lx+185)+'" cy="'+(ly+2)+'" r="5" fill="#ef4444"/><text x="'+(lx+196)+'" y="'+(ly+2)+'" dominant-baseline="central" fill="#991b1b">阀门</text>');
  parts.push('<line x1="'+(lx+240)+'" y1="'+(ly+2)+'" x2="'+(lx+252)+'" y2="'+(ly+2)+'" stroke="#67e8f9" stroke-width="1.4" stroke-dasharray="3,3"/><text x="'+(lx+256)+'" y="'+(ly+2)+'" dominant-baseline="central" fill="#155e75">滴灌带</text>');
  parts.push('</g>');

  /* [v416] 方向代价如实告知：全图统一方向后，少数派分区会「带长偏短 / 支管略增」，
     超限分区已自动分段——不静默取舍，用户可据此回调「单边铺设长度」或分区数。
     [v1012 2026-11-08] 这行原本是 SVG 内「裸 <text>」：pipeBaseSVG() 按 id 剥离三组
     固定文字时漏了它，于是工作区里它随图纸一起缩放/平移（用户截图指的就是这段）。
     现在包进 #tlAxisHintGroup 并加入剥离名单；同时把文案存到 window.__tlWsAxisHint，
     由固定覆盖层 #tlWsOvLengths 同源显示。简图/下载 SVG/打印仍保留原 <text>。 */
  var _tlAxisHintText = '';
  try {
    var _ar = tlAxisReport || window.__ryTapeAxisReport || null;
    if (_ar && _ar.report && (_ar.report.shortZones > 0 || _ar.report.overZones > 0)) {
      var _rp = _ar.report, _tot = Math.max(1, cols * rows);
      var _tx = '布管方向：滴灌带' + (_ar.tapeAxis === 'x' ? '横向' : '纵向') + '敷设 · 主管支管垂直（全图统一）';
      if (_rp.shortZones > 0) _tx += '；' + _rp.shortZones + '/' + _tot + ' 个分区带长短于最优（均 ' + _rp.avgTape.toFixed(0) + 'm / 最优 ' + _rp.avgOpt.toFixed(0) + 'm，支管略增）';
      if (_rp.overZones > 0) _tx += '；' + _rp.overZones + ' 个分区带长超单边铺设长度，已自动分段';
      _tlAxisHintText = _tx;
      parts.push('<g id="tlAxisHintGroup"><text x="40" y="' + (iy + 38) + '" font-size="9.5" font-weight="600" fill="#92400e">' + _tx + '</text></g>');
    }
    /* [v1053 数据唯一性] 二级管线与当前分区不同代时（复用被拒、本次走兜底自布管），
       必须独立于方向报告常驻提示——否则用户看到的是「滴灌带与管线同代」的假象，
       却不知道这份管线是三级兜底生成的，材料/水力数字会与二级「生成施工图」不同。 */
    if (window.__tlPipesReusedStale) {
      var _txStale = '⚠ 二级管线与当前分区不同代，本次图面按当前分区兜底生成 — 请回「分区与管路」页点「生成施工图」重新生成后再回传';
      _tlAxisHintText = _tlAxisHintText ? (_tlAxisHintText + '；' + _txStale) : _txStale;
      parts.push('<g id="tlAxisHintStaleGroup"><text x="40" y="' + (iy + 52) + '" font-size="9.5" font-weight="700" fill="#b91c1c">' + _txStale + '</text></g>');
    }
  } catch (eAxisHint) { }
  window.__tlWsAxisHint = _tlAxisHintText;

  /* 最不利路径标注（第四十七轮）：必须放在 window.tlDiagramData 落地**之后**（本函数 8632 行）才画 ——
     标注几何由 tlWorstPathLen 读 tlDiagramData 得出；早于快照落地会标到上一幅图的旧几何。
     v488：画在 tlPlotGCloseIdx（地块组 '</g>' 之前）——几何上归入 #tlPlotGroup，
     随图面拖动 translate 一起平移，与管线/水源/节点层保持同组（修复恒定偏位）；
     时序上仍在快照落地之后，满足上面的约束。splice 只移动字符串位置，SVG 嵌套
     （data-tlworst 组内无嵌套 <g>）与工作区克隆剥离正则均不受影响。 */
  parts.push('</svg>');
  /* v180b（2026-10-02）：缓存本次几何映射，供 tlRefreshTlNodesLayer 在 RyTlNodes 变更时
     实时刷新三级简图的节点/连线图层（无需重新「生成管线图」）。 */
  /* tl-nodes 的 atM 沿用 tlDiagramData 的真实地块米坐标；实时刷新也必须用同一几何口径。 */
  window.__tlPlanGeo = {
    frontPipe: [],
    mainPipes: mainPipes.map(function(line){return line.map(function(p){return tlGridWorld(p.x,p.y);});}),
    branchPipes: branchPipes.map(function(line){return line.map(function(p){return tlGridWorld(p.x,p.y);});}),
    ts: ts
  };
  var svgStr=parts.join('');
  tlDiagramSVG=svgStr;
  document.getElementById('tlDiagramContent').innerHTML=svgStr;
  var _tlOutputDeg=0;try{_tlOutputDeg=Number(localStorage.getItem('tlOutputRotationDeg'))||0;}catch(eTlOutputStore){}
  tlApplyOutputRotation(_tlOutputDeg,false);
  /* 分区与管路页不恢复轮灌演示状态；在线地图独立负责播放。 */
  /* [map-enhance] 管网反投卫星图（2026-09-26）：把 tlDiagramData 米坐标管线按当前 geo 基准
     反投成经纬度，经 RyIrrigationDataStore 写入 runye_network_layout，地图页 runye-map-enhance.js 读取后
     在卫星图叠加真实主管/支管/水源点。无 geo 基准（手动画矩形、未经地图回传）时静默跳过。
     整段删除即卸载，不影响主流程。 */
  var tlPublishP2ll=null;   /* [v1069b] 下方反投 IIFE 内定义的 p2ll 桥接出口——IIFE 作用域封闭，
                               后面「施工节点冻结」发布块（同函数级作用域）看不到它，
                               必须经此变量带出；发布块入口做空值校验（见 publishToMap 块）。 */
  if(options.publishToMap===true) try { (function(){
    var dd = window.tlDiagramData; if(!dd || dd.world!=='meter') return;
    var plotId=window.currentPlotId || null;
    var base = window.__runyeGeoBase || null;
    if(!base || typeof base.refLat!=='number' || typeof base.refLng!=='number' || !isFinite(base.refLat) || !isFinite(base.refLng)){
      throw new Error('地图坐标基准缺失，在线地图保留原快照');
    }
    var R=6378137, mlat=R*Math.PI/180, cosLat=Math.cos(base.refLat*Math.PI/180);
    /* 地图框线与实际坐标保持固定。window.__runyeMapFramePoly 保存
       地图坐标口径的地块顶点（只在地图回传 / 设为当前 / 读存档处写入）；
       这里按顶点对应关系反解「当前设计坐标 → 地图坐标」的仿射逆变换，并施加到整段反投几何
       （地块框线 + 总管/主管/支管 + 水源 + 阀门 + 滴灌带），使管线与框线始终同坐标系。
       无基准（旧存档 / 手画矩形 / 图片测量）时 fInv=null，完全退化为改动前行为。 */
    var fInv=(function(){
      try{
        var mf=window.__runyeMapFramePoly;
        if(!mf || !dd.poly || mf.length!==dd.poly.length || mf.length<3) return null;
        var p0=mf[0],p1=mf[1],p2=mf[2],q0=dd.poly[0],q1=dd.poly[1],q2=dd.poly[2];
        var ux=p1.x-p0.x,uy=p1.y-p0.y,vx=p2.x-p0.x,vy=p2.y-p0.y;
        var detM=ux*vy-uy*vx;
        if(!isFinite(detM)||Math.abs(detM)<1e-9) return null;      /* 定标三点共线：放弃还原 */
        var Ux=q1.x-q0.x,Uy=q1.y-q0.y,Vx=q2.x-q0.x,Vy=q2.y-q0.y;
        var im=1/detM;
        var a=(Ux*vy-Vx*uy)*im, b=(Vx*ux-Ux*vx)*im, c=(Uy*vy-Vy*uy)*im, d=(Vy*ux-Uy*vx)*im;
        var detL=a*d-b*c;
        if(!isFinite(detL)||Math.abs(detL)<1e-9) return null;      /* 变换不可逆：宁可不还原 */
        var tx=q0.x-(a*p0.x+b*p0.y), ty=q0.y-(c*p0.x+d*p0.y);
        var il=1/detL;
        return { ax:d*il, ay:-c*il, bx:-b*il, by:a*il, tx:tx, ty:ty };
      }catch(e){ return null; }
    })();
    window.__runyeMapFrameInv=fInv;
    function toFrame(pt){
      if(!pt||!fInv) return pt;
      var dx=pt.x-fInv.tx, dy=pt.y-fInv.ty;
      return { x:fInv.ax*dx+fInv.bx*dy, y:fInv.ay*dx+fInv.by*dy };
    }
    function p2ll(pt){ pt=toFrame(pt); if(!pt||!isFinite(pt.x)) return null; return [ +(base.refLat+pt.y/mlat).toFixed(6), +(base.refLng+pt.x/(mlat*cosLat)).toFixed(6) ]; }
    tlPublishP2ll=p2ll;   /* [v1069b] 桥接：施工节点冻结发布块要用同一投影出口 */
    function ln2ll(line){ if(!line||line.length<2) return null; var out=[]; for(var k=0;k<line.length;k++){ var ll=p2ll(line[k]); if(ll) out.push(ll); } return out.length>=2?out:null; }
    function dnOf(txt){ var m=/(\d+)/.exec(String(txt||'')); return m?+m[1]:0; }
    var meta=dd.meta||{}, mpipes=(meta.pipes)||{};
    var segDn={ front:dnOf(mpipes.front), main:dnOf(mpipes.main)||90, branch:dnOf(mpipes.branch)||63 };
    var segments=[];
    function pushSegs(arr,dn,prefix,displayArr){
      if(!arr) return;
      for(var i=0;i<arr.length;i++){
        var ll=ln2ll(arr[i]);
        if(!ll) continue;
        var seg={id:prefix+i, name:prefix+(i+1), dn:dn, kind:prefix, latLng:ll};
        /* 地图显示使用与分区页相同的平行错开副本；真实 latLng 保持原设计坐标，
           轮灌寻路、水力长度和连接校验继续读取真实几何。 */
        var displayLine=displayArr&&displayArr[i];
        if(displayLine&&displayLine.length>=2){
          var displayWorld=displayLine.map(function(p){return tlGridWorld(p.x,p.y);});
          var displayLL=ln2ll(displayWorld);
          if(displayLL) seg.displayLatLng=displayLL;
        }
        segments.push(seg);
      }
    }
    if(dd.frontPipe) pushSegs([dd.frontPipe], segDn.front||segDn.main, 'front');
    pushSegs(dd.mainPipes, segDn.main, 'main', tlPipeDisplay&&tlPipeDisplay.main);
    pushSegs(dd.branchPipes, segDn.branch, 'branch', tlPipeDisplay&&tlPipeDisplay.branch);
    /* [v878] 段总管反投：分区与管路自动生成的分区主管串联干线（v859）传给在线地图。
       用户要求「自动生成的那一段总管要传递过去」——此前它只进 tlDiagramData.segTrunk
       （轮灌演示播放时临时画、停止即清；地图页只拿 couplers 做驳接点捕捉），
       常驻的管网叠加层（runye_network_layout → renderNetwork）里没有它。
       kind 用独立的 'segTrunk'，不能复用 'front'：renderNetwork 在地图已有手绘真总管时
       会抑制 front 段（v841），而手绘总管（水源→驳接点）与段总管（驳接点串联干线）
      是水路互补的两段，必须同时显示。trunk-panel 联合复核同轮把它归入 front 桶跳过
      （长度已折进 frontLenUsed，再计入下游合计就是 v842 式双重计数）。
      [v1017] 随段总管生成链一并恢复（v900 误删，致 tlSegAnchorIdx 读不到快照 seg 段）。 */
    if(dd.segTrunk && Array.isArray(dd.segTrunk.points) && dd.segTrunk.points.length>=2){
      var stLL=ln2ll(dd.segTrunk.points);
      if(stLL) segments.push({id:'segTrunk', name:'段总管', dn:segDn.front||segDn.main, kind:'segTrunk', latLng:stLL});
    }
    var src = dd.sourcePos ? p2ll(dd.sourcePos) : null;
    if(!segments.length && !src){
      if(options.publishToMap===true)throw new Error('当前施工图没有可发布的管网段');
      return;
    }
    var net=null;
    if(plotId){
      var designTs=hydraulicDesignSaved?hydraulicDesignTs:null;
      var designRevisionId=hydraulicDesignSaved?hydraulicDesignRevisionId:null;
      var previousNetworkRaw=window.RyIrrigationDataStore.readRawNetworkLayout(plotId);
      var candidateNet={ sourcePos: src?{lat:src[0],lng:src[1]}:null, segments: segments, plotId:plotId, designTs:designTs, designRevisionId:designRevisionId, sourceGeneratedAt:dd.generatedAt, diagramGeometrySig:JSON.stringify([dd.frontPipe,dd.mainPipes,dd.branchPipes,dd.valves,dd.poly]), crs:'GCJ-02', ts: Date.now(), valves:[], dripTapes:[] };
      /* [map-enhance] 阀门 + 滴灌带反投：在内存中组装完整管网快照，显式限定本页地块；
         若分区方案也适用，则由 RyMapPartition 将地块库与管网快照作为一项事务提交。 */
      try{
        var valvesLL=[];
        if(dd.valves && dd.valves.length){
          dd.valves.forEach(function(v){ var ll=p2ll(v); if(ll) valvesLL.push({lat:ll[0], lng:ll[1]}); });
        }
        var dripLL=[];
        if(dd.dripTapes && dd.dripTapes.length){
          dd.dripTapes.forEach(function(line){
            if(!line||line.length<2) return;
            var pts=[];
            line.forEach(function(pt){ var ll=p2ll(pt); if(ll) pts.push({lat:ll[0],lng:ll[1]}); });
            if(pts.length>=2) dripLL.push(pts);
          });
        }
        candidateNet.valves = valvesLL;
        candidateNet.dripTapes = dripLL;
        function lineCount(lines){return Array.isArray(lines)?lines.filter(function(line){return Array.isArray(line)&&line.length>=2;}).length:0;}
        var mainCount=lineCount(dd.mainPipes),branchCount=lineCount(dd.branchPipes);
        var storedMain=segments.filter(function(s){return s&&s.kind==='main';}).length;
        var storedBranch=segments.filter(function(s){return s&&s.kind==='branch';}).length;
        if(mainCount!==storedMain||branchCount!==storedBranch||
            candidateNet.valves.length!==(Array.isArray(dd.valves)?dd.valves.filter(function(v){return v&&isFinite(Number(v.x))&&isFinite(Number(v.y));}).length:0)||
            candidateNet.dripTapes.length!==lineCount(dd.dripTapes)){
          throw new Error('管网投影校验失败：分区管线、阀门或滴灌带数量不完整');
        }
        pendingMapNetwork=candidateNet;
        pendingMapPreviousNetworkRaw=previousNetworkRaw;
        net=candidateNet;
      }catch(eVT){
        try{console.warn('[map-enhance] network projection skipped:',eVT&&eVT.message||eVT);}catch(_){}
        throw eVT;
      }
    }
    /* [map-enhance] 同步当前设计地块到共享地块库，与管网一起供地图叠加。
       自动记录使用所属项目ID，避免不同地块在固定 auto-current 槽位互相覆盖；
       无明确项目ID时不写入共享库，避免把临时几何误认成其他项目的地块。
       [v885] 地块唯一性：库里已有本设计地块的**本体**（id === plotId，地图画框/
       测量保存的那条）⇒ 不再另存 auto-current 副本 —— 副本与本体会被地图叠加层
       各画一层，同一地块多层叠加、我的地块列表双行（用户实测「叠加多次实际操作
       就是乱的」）。分区方案已由 RyMapPartition.capture 挂到本体（capture 认
       id===plotId）；这里顺手清掉旧版本遗留的副本（自愈老数据）。 */
    try{
      if(net && dd.poly && dd.poly.length>=3){
        var pll = []; for(var pi=0; pi<dd.poly.length; pi++){ var llpt=p2ll(dd.poly[pi]); if(llpt) pll.push(llpt); }
        if(pll.length>=3){
          var area=0; for(var ai=0; ai<pll.length; ai++){ var a=pll[ai], b=pll[(ai+1)%pll.length];
            area += ((a[1]-b[1])*Math.PI/180)*(2 + Math.sin(a[0]*Math.PI/180)+Math.sin(b[0]*Math.PI/180)); }
          area = Math.abs(area*6378137*6378137/2);
          var sl=0, sn=0; pll.forEach(function(q){ sl+=q[0]; sn+=q[1]; });
          var plotStore=window.RyPlotLibraryStore;
          var hasOwner=false;
          try{
            var libState=plotStore&&typeof plotStore.read==='function'?plotStore.read():null;
            if(libState&&libState.ok){
              for(var oi=0; oi<libState.plots.length; oi++){
                var op=libState.plots[oi];
                if(op&&String(op.id)===String(plotId)){ hasOwner=true; break; }
              }
            }
          }catch(eOwner){}
          if(hasOwner){
            if(plotStore&&typeof plotStore.removeGeneratedCurrent==='function'){
              var cleaned=plotStore.removeGeneratedCurrent(plotId);
              if(cleaned&&cleaned.ok&&!cleaned.unchanged)console.log('[map-enhance] 已清理重复的自动地块副本（本体已在地块库）:',plotId);
            }
          }else{
          var autoId=plotStore&&typeof plotStore.generatedCurrentId==='function' ? plotStore.generatedCurrentId(plotId) : null;
          if(autoId && typeof plotStore.upsertGeneratedCurrent==='function'){
            var entry={ id:autoId, name:'当前设计地块', mu:Math.round(area/666.67*100)/100, sqm:Math.round(area),
              poly:dd.poly.map(function(p){var q=toFrame(p);return {x:q.x,y:q.y};}), polyLatLng:pll, center:{lat:+(sl/pll.length).toFixed(6), lng:+(sn/pll.length).toFixed(6)},
              geo:{refLat:base.refLat, refLng:base.refLng, proj:'mercatorLocal'}, source:'auto', designPlotId:String(plotId), ts:Date.now() };
            if(net){entry.partitionPlan=net.partitionPlan;entry.partitions=net.partitions;}
            var saved=plotStore.upsertGeneratedCurrent(plotId,entry);
            if(!saved.ok)console.warn('[map-enhance] automatic plot sync skipped:',saved.error);
          }else if(plotId) console.warn('[map-enhance] automatic plot sync skipped: plot library store unavailable');
          }
        }
      }
    }catch(ePlot){}
  })(); } catch(eNet){
    try{ console.warn('[map-enhance] network projection skipped:', eNet && eNet.message); }catch(_){}
    throw eNet;
  }
  /* 系统简图图框同步（2026-09-19）：克隆同一 SVG，id 加 sc_ 前缀（url(# / href="# 引用同步替换），防 DOM id 重复 */
  try {
    var sysPipeBox = document.getElementById('tlSysPipeBox');
    if (sysPipeBox) {
      document.getElementById('tlSysPipeBoxBody').innerHTML =
        svgStr.replace(/id="/g, 'id="sc_').replace(/url\(#/g, 'url(#sc_').replace(/href="#/g, 'href="#sc_');
      sysPipeBox.style.display = 'block';
    }
  } catch (ePipeBox) { }
  /* 固定文字层填充（2026-09-16）：与 SVG 内同源数据；工作区缩放/平移不影响。
     [v1012] 布局重排：左上=地块面积信息、底部中间=图例、左下=主管/支管长度+布管方向提示；
     左下数据由 tlRefreshWsOverlays() 按本次几何写入，三块位置由 tlAlignWsOverlays() 按画布矩形对齐。 */
  (function(){
    var ov=document.getElementById('tlWsOverlays');
    if(!ov)return;
    var oh=document.getElementById('tlWsOvHeader'),ol=document.getElementById('tlWsOvLegend');
    /* 参数行已取消（2026-09-16）：三级设计工作区左侧工具栏已有参数，工作区不再重复显示；
       简图 SVG 内 tlParamsGroup（下载/打印口径）保留不取消 */
    /* 左上角：面积是用户要看的重点，把「面积 X 亩」加粗，其余页眉信息照旧 */
    if(oh)oh.innerHTML=tlHeaderLines.join('<br>').replace(/面积\s*([0-9.]+\s*亩)/,'面积 <b style="color:#0f172a">$1</b>');
    /* [v1017b] 工作区图例撤「总管」项（图面已不画段总管黑线，见生成块 if(false) 注释） */
    if(ol)ol.innerHTML='<span style="display:inline-flex;align-items:center;vertical-align:middle;gap:5px;margin:0 9px"><i style="display:inline-block;width:14px;height:4px;border-radius:2px;background:#185FA5"></i>主管</span>'
      +'<span style="display:inline-flex;align-items:center;vertical-align:middle;gap:5px;margin:0 9px"><i style="display:inline-block;width:14px;height:3px;border-radius:2px;background:#16a34a"></i>支管</span>'
      +'<span style="display:inline-flex;align-items:center;vertical-align:middle;gap:5px;margin:0 9px"><i style="display:inline-block;width:14px;height:2px;border-top:2px dashed #0e7490"></i>滴灌带</span>'
      +'<span style="display:inline-flex;align-items:center;vertical-align:middle;gap:5px;margin:0 9px"><i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#f59e0b"></i>水源</span>'
      +'<span style="display:inline-flex;align-items:center;vertical-align:middle;gap:5px;margin:0 9px"><i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#ef4444"></i>阀门</span>';
    ov.style.display='block';
    /* [v1012] 每次生成都会重写图例 / 页眉 innerHTML ⇒ 宽度会变，重算三块位置；
       左下长度与方向提示按本次几何重写（主管方向调整后重新生成图 → 数字跟着变）。 */
    if(typeof window.tlRefreshWsOverlays==='function'){ try{ window.tlRefreshWsOverlays(); }catch(eLen){} }
    if(typeof window.tlAlignWsOverlays==='function'){ try{ window.tlAlignWsOverlays(); }catch(eAlign){} }
    else if(typeof window.tlAlignWsOvLegend==='function'){ try{ window.tlAlignWsOvLegend(); }catch(eAlign){} }
    /* [v1016 2026-11-08 用户拍板] 页眉（#tlWsOvHeader）第一优先级：页眉重写/对齐后
       做一次「灌溉参数」面板避让检测（实现与时机说明见 inline-18.js ppParamFloatAvoid）。 */
    try { if (typeof window.ppParamFloatAvoid === 'function') window.ppParamFloatAvoid(); } catch (ePFAvoid) { }
  })();
  // 平面管网几何快照已在参数块之前写入并重算
  tlInitDrag();
  tlInitHeaderDrag();
  document.getElementById('tlDiagramWrap').style.display='block';
  // 下载/打印按钮已取消（2026-09-16 第三十三轮）：元素已从左栏移除，不再显示
  tlRefreshGroupLegend();   /* 联合灌溉分组图例已于第五十九轮取消（本调用现为空操作，保留以便一行恢复） */
  try { tlRefreshLossCard(); } catch (e) { }   /* 左下角「管段长度与水头损失」按本次图面几何刷新 */
  /* [v1030] 原右侧「管段管径与损失」统计表刷新调用随该表整套删除。 */
  try { tlPushToHydraulicCalc(); } catch (e) { }   /* 三级方案数据 → 水力计算器 自动推送（2026-09-19） */
  try { tlWsBarSync(); } catch (e) { }
  // tlSavePng 已移除，不再显示
  // 生成完直接落在「三级设计」工作区（可缩放/可插管）
  /* v170c：options.stay 为真时不跳视图 —— AE 订阅（front 平移→重建简图）每帧触发本函数，
     若每次都 tlShowWorkspace 会把用户从简图视图强行切走（且拖动中每帤 rySetTab）。其余调用方不传 stay，行为不变。
     [v948] 在在线地图上同样不跳：那里的「联合灌溉 1/2/3/4 区」「面积成组 / 按亩组合」都在
     同一排（#tlPlanBar 被 dock 到 #mapDemoDock），点一下只为换分组看效果，被弹到「分区与管路」
     属于打断操作（用户 2026-11-04：「这步要省略掉」）。图面照旧重生成，只是人留在原地。 */
  var _onMapNow = tlPlanBarOnMap();
  if(!options.stay && !_onMapNow){ try{ tlShowWorkspace(); }catch(e){}
  } else if(_onMapNow){
    /* 分组变了 ⇒ 地图那条「轮灌演示」的组 chips 要跟着重算（它们由 map-flow-demo 现建，
       不主动刷就还是上一组的分组，点下去会演错组）。 */
    try{ if(window.RyMapFlowDemo && typeof window.RyMapFlowDemo.refresh === 'function') window.RyMapFlowDemo.refresh(); }catch(eDock){}
  }
  try{
    /* 分区调整后生成的是一代新管线几何。先让几何绑定编辑层同步到该代；
       节点层没有工作区渲染器的 syncGeometry，因此只清除签名仍指向旧图的节点，
       否则规范三级适配器会以 level3-node-signature-mismatch 拒绝整张新施工图。 */
    var generatedGeometry=window.tlDiagramData;
    ['RyTlEditPipes','RyTlAutoEdits'].forEach(function(name){
      var layer=window[name];
      if(layer&&typeof layer.syncGeometry==='function')layer.syncGeometry(generatedGeometry);
    });
    var level3Adapter=window.RyDrawingDesignLevel3Adapter;
    var newGeometrySig=level3Adapter&&typeof level3Adapter.geometrySignature==='function'
      ?level3Adapter.geometrySignature(generatedGeometry):'';
    var savedNodes=null;
    try{savedNodes=JSON.parse(localStorage.getItem('runye_tlNodes_v1')||'null');}catch(eSavedNodes){}
    if(newGeometrySig&&savedNodes&&savedNodes.geoSig!==newGeometrySig&&
       window.RyTlNodes&&typeof window.RyTlNodes.resyncGeometry==='function'){
      /* [v1069] 几何换代节点参数迁移（M13「重算后重新投影」拍板口径）：pid+atM 绑定保留、
         atM 夹到新管线长度，persist 以新签名落盘 —— 用户节点不再在每次重新生成时被清空，
         canonical 适配器签名校验照常通过。 */
      window.RyTlNodes.resyncGeometry();
      console.info('[drawing-design] 分区或管线几何已改变，三级节点已按 pid+桩号迁移到新几何');
    }else if(newGeometrySig&&savedNodes&&savedNodes.geoSig!==newGeometrySig&&
       window.RyTlNodes&&typeof window.RyTlNodes.reset==='function'){
      window.RyTlNodes.reset();
      console.info('[drawing-design] 分区或管线几何已改变，已清除绑定旧几何的三级节点');
    }
  }catch(eGeometryBinding){try{console.warn('[drawing-design] 三级几何状态同步失败',eGeometryBinding);}catch(eLog){}}
  try{
    var generationInputSignature=window.ryDrawingDesignGenerationInputSignature;
    var groupEdit=window.__runyeGroupEdit;
    if(typeof generationInputSignature==='function'&&!(groupEdit&&groupEdit.active)){
      window.tlDiagramData.sourceSignature=generationInputSignature();
      if(typeof window.ryCommitSingleLevel3CanonicalFromRuntime==='function'){
        var committed=window.ryCommitSingleLevel3CanonicalFromRuntime();
        if(committed!==true&&window.__runyeSingleCanonicalDesign){
          var restored=typeof window.ryRestoreSingleLevel3CanonicalRuntime==='function'&&
            window.ryRestoreSingleLevel3CanonicalRuntime()===true;
          var commitError=new Error(restored
            ?'规范绘图模型拒绝三级生成结果，已恢复最后有效状态'
            :'规范绘图模型拒绝三级生成结果，且无法恢复最后有效状态');
          commitError.canonicalCommitRejected=true;
          throw commitError;
        }
      }
    }
  }catch(eSignature){if(eSignature&&eSignature.canonicalCommitRejected)throw eSignature;}
  if(options.publishToMap===true){
    /* 路径演示使用的管线、阀门和施工节点在同一发布事务内冻结。
       运行态编辑层只在此处解析一次；发布后地图不再把它与另一代节点/管线混读。 */
    /* [v1069b] p2ll 桥接：它声明在上方管网反投 IIFE 内部，本块直接引用必然
       ReferenceError('p2ll is not defined')——v1069 失败弹窗暴露的真实报错。
       反投 IIFE 与本块同被 publishToMap 门控且先执行 ⇒ 桥接变量此时必已就绪；
       未就绪说明基准/框线早退，发布本就不该继续。 */
    var p2ll=tlPublishP2ll;
    if(typeof p2ll!=='function')throw new Error('管线投影出口未就绪（地图坐标基准或地块框线缺失）');
    try{
      var publishDd=window.tlDiagramData, publishNodes=window.RyTlNodes, publishEdits=window.RyTlAutoEdits;
      if(!pendingMapNetwork||!publishDd||!publishEdits||typeof publishEdits.effPts!=='function'||typeof publishEdits.pointAt!=='function')
        throw new Error('发布管网或有效管线编辑层不可用');
      var publishGeometrySig=JSON.stringify([publishDd.frontPipe,publishDd.mainPipes,publishDd.branchPipes,publishDd.valves,publishDd.poly]);
      if(pendingMapNetwork.diagramGeometrySig!==publishGeometrySig)throw new Error('管网几何签名与施工图不一致');
      function routeLine(pid,raw){
        var pts=raw;
        try{var edited=publishEdits.effPts(pid,publishDd);if(Array.isArray(edited)&&edited.length>=2)pts=edited;}catch(eEdit){throw new Error('读取有效管线失败：'+pid);}
        var world=[],out=[];(pts||[]).forEach(function(p){var ll=p2ll(p);if(!ll)throw new Error('管线坐标无效：'+pid);world.push({x:Number(p.x),y:Number(p.y)});out.push(ll);});
        if(out.length<2)throw new Error('管线坐标不完整：'+pid);
        return {world:world,ll:out};
      }
      var routeGeometry={version:2,geometrySig:publishGeometrySig,mains:[],branches:[],displayMains:[],displayBranches:[],valves:[],nodes:[],segTrunk:null};
      var routeMainWorld=[],routeBranchWorld=[],routeMainLLPhys=[],routeBranchLLPhys=[];
      (publishDd.mainPipes||[]).forEach(function(line,i){var r=routeLine('main-'+i,line);routeMainWorld.push(r.world);routeMainLLPhys.push(r.ll);});
      (publishDd.branchPipes||[]).forEach(function(line,i){var r=routeLine('branch-'+i,line);routeBranchWorld.push(r.world);routeBranchLLPhys.push(r.ll);});
      /* 地图线体的真实坐标与寻路快照同源；平行错位只重算展示副本。 */
      var routeDisplay=typeof window.ppGetPipeDisplayGeometry==='function'
        ?window.ppGetPipeDisplayGeometry(routeMainWorld,routeBranchWorld,publishDd.valves||[],typeof tlGapM==='function'?tlGapM():0)
        :{main:routeMainWorld,branch:routeBranchWorld};
      /* 物理中心线是寻路/连接的唯一几何源；平面错开只作为独立显示副本。
         主、支管在设计上可重合，显示偏移不能进入拓扑，否则主管节点会离开真实主管。 */
      function worldLineToLL(line){
        var out=[];(line||[]).forEach(function(p){var q=p2ll(p);if(!q)throw new Error('显示世界管线投影失败');out.push(q);});
        return out.length>=2?out:null;
      }
      (routeDisplay.main||[]).forEach(function(line,i){
        var disp=worldLineToLL(line);
        routeGeometry.mains.push(routeMainLLPhys[i]);
        routeGeometry.displayMains[i]=disp||routeMainLLPhys[i];
      });
      (routeDisplay.branch||[]).forEach(function(line,i){
        var disp=worldLineToLL(line);
        routeGeometry.branches.push(routeBranchLLPhys[i]);
        routeGeometry.displayBranches[i]=disp||routeBranchLLPhys[i];
      });
      function routeLineLength(line){var sum=0;for(var j=0;j+1<(line||[]).length;j++)sum+=Math.hypot(Number(line[j+1].x)-Number(line[j].x),Number(line[j+1].y)-Number(line[j].y));return sum;}
      function routePointAt(line,at){var left=Math.max(0,Number(at)||0);for(var j=0;j+1<(line||[]).length;j++){var a=line[j],b=line[j+1],dx=Number(b.x)-Number(a.x),dy=Number(b.y)-Number(a.y),len=Math.hypot(dx,dy);if(len<1e-9)continue;if(left<=len){var t=left/len;return{x:Number(a.x)+dx*t,y:Number(a.y)+dy*t};}left-=len;}return line&&line.length?{x:Number(line[line.length-1].x),y:Number(line[line.length-1].y)}:null;}
      (pendingMapNetwork.segments||[]).forEach(function(seg){
        if(!seg||!seg.id)return;
        var m=/^(main|branch)(\d+)$/.exec(String(seg.id));if(!m)return;
        var idx=Number(m[2]),isMain=m[1]==='main',source=isMain?routeMainLLPhys[idx]:routeBranchLLPhys[idx];
        var display=isMain?(routeDisplay.main||[])[idx]:(routeDisplay.branch||[])[idx];
        if(!source)throw new Error('发布地图线段缺少寻路几何：'+seg.id);
        seg.latLng=source;
        if(Array.isArray(display)&&display.length>=2){var shown=[];display.forEach(function(p){var q=p2ll(p);if(!q)throw new Error('显示管线投影失败：'+seg.id);shown.push(q);});seg.displayLatLng=shown;}
      });
      (publishDd.valves||[]).forEach(function(v,i){
        if(!v)throw new Error('阀门数据缺失：'+(i+1));
        var ll=p2ll(v),anchor=null;
        /* 锚点用于拓扑连接，必须落在实体主管中心线上；显示偏移由独立图层处理。 */
        anchor=(v.ax!=null&&v.ay!=null)?p2ll({x:v.ax,y:v.ay}):null;
        if(!ll)throw new Error('阀门坐标无效：'+(i+1));
        routeGeometry.valves.push({ll:ll,anchorLL:anchor,mi:Number.isFinite(Number(v.mi))?Number(v.mi):i});
      });
      if(publishDd.segTrunk&&Array.isArray(publishDd.segTrunk.points)&&publishDd.segTrunk.points.length>=2){
        routeGeometry.segTrunk=[];publishDd.segTrunk.points.forEach(function(p){var ll=p2ll(p);if(!ll)throw new Error('段总管坐标无效');routeGeometry.segTrunk.push(ll);});
      }
      var publishedNodes=[];
      if(publishNodes&&typeof publishNodes.list==='function'){
        (publishNodes.list()||[]).forEach(function(node){
          if(!node||!/^((main|branch))-\d+$/.test(String(node.pid||'')))return;
          var m=/^(main|branch)-(\d+)$/.exec(String(node.pid)),idx=Number(m[2]);
          if((m[1]==='main'?idx>=(publishDd.mainPipes||[]).length:idx>=(publishDd.branchPipes||[]).length))throw new Error('施工节点所属管线不存在：'+node.id);
          var point;try{point=publishEdits.pointAt(node.pid,publishDd,Number(node.atM));}catch(ePoint){throw new Error('施工节点无法投影：'+node.id);}
          var ll=point&&p2ll(point);if(!ll||!isFinite(ll[0])||!isFinite(ll[1]))throw new Error('施工节点坐标无效：'+node.id);
          var isMain=m[1]==='main',sourceLine=isMain?routeMainWorld[idx]:routeBranchWorld[idx],shownLine=isMain?(routeDisplay.main||[])[idx]:(routeDisplay.branch||[])[idx];
          var sourceLength=routeLineLength(sourceLine),shownLength=routeLineLength(shownLine);
          var shownPoint=sourceLength>1e-8&&shownLength>1e-8
            ?routePointAt(shownLine,Math.max(0,Math.min(1,(Number(node.atM)||0)/sourceLength))*shownLength):null;
          var shownLL=shownPoint&&p2ll(shownPoint);
          var displayLL=(shownLL&&isFinite(Number(shownLL[0]))&&isFinite(Number(shownLL[1])))?shownLL:ll;
          var frozen={id:String(node.id||''),pid:String(node.pid),atM:Number(node.atM)||0,lat:ll[0],lng:ll[1],displayLat:displayLL[0],displayLng:displayLL[1]};
          publishedNodes.push(frozen);routeGeometry.nodes.push({id:frozen.id,pid:frozen.pid,mi:idx,kind:m[1],ll:[ll[0],ll[1]],displayLL:[displayLL[0],displayLL[1]]});
        });
      }
      pendingMapNetwork.publishedNodes={version:2,geometrySig:publishGeometrySig,items:publishedNodes};
      pendingMapNetwork.routeGeometry=routeGeometry;
    }catch(ePublishNodes){throw new Error('施工节点未能与管线组成同一发布快照：'+(ePublishNodes&&ePublishNodes.message||ePublishNodes));}
    var captureResult=window.RyMapPartition&&typeof window.RyMapPartition.capture==='function'
      ?window.RyMapPartition.capture(pendingMapNetwork,pendingMapPreviousNetworkRaw):null;
    if(!captureResult||captureResult.ok!==true||captureResult.skipped){
      throw new Error('分区、管网未能作为同一快照提交：'+(captureResult&&(captureResult.error||captureResult.reason)||'地图提交模块不可用'));
    }
    mapSnapshotPublished=true;
    try{if(window.RyMapHost&&typeof window.RyMapHost.refresh==='function')window.RyMapHost.refresh();}catch(eMapRefresh){}
    try{if(window.RyMapHost&&typeof window.RyMapHost.refreshSnapTargets==='function')window.RyMapHost.refreshSnapTargets();}catch(eSnapRefresh){}
    try{if(window.RyMapFlowDemo&&typeof window.RyMapFlowDemo.refresh==='function')window.RyMapFlowDemo.refresh();}catch(eDemoRefresh){}
  }
  if(options.publishToMap===true&&!mapSnapshotPublished)throw new Error('施工图尚未完整提交，在线地图保持原快照');
  console.log('[tlAutoGenerate] SVG generated successfully');
  return true;
  } catch(err) {
    console.error('[tlAutoGenerate] Error:', err);
    if(options.publishToMap===true&&!mapSnapshotPublished&&hydraulicDesignSaved){
      try{window.RyIrrigationDataStore.writeHydraulicDesign(previousHydraulicDesign,window.currentPlotId||null);}
      catch(eHydRollback){console.error('[tlAutoGenerate] hydraulic snapshot rollback failed',eHydRollback);}
    }
    if(options.rethrowError===true) throw err;
    var errDiv = document.getElementById('tlDiagramContent');
    if(errDiv) {
      errDiv.innerHTML = '<div style="color:#dc2626;padding:20px;font-size:14px;border:1px solid #fca5a5;background:#fef2f2;border-radius:8px;">⚠️ 生成图纸时出错：' + esc(err.message) + '<br><br>请截图此错误信息反馈。</div>';
      document.getElementById('tlDiagramWrap').style.display='block';
    } else {
      alert('生成图纸时出错：' + err.message);
    }
    return false;
  }
}

/* 导出平面图时的 SVG 序列化统一入口。 */
/* 最终出图旋转：只对三级简图的 SVG 展示/导出做变换，不改设计坐标或业务几何。
   [2026-10-27 第二轮·按用户反馈收窄] 旋转范围 = 地块内容 + 指北针，其余（标题/
   信息行/备注/图例/图框）不转 —— 详见 tlApplyOutputRotation 头注释。 */
/* ── 文字反向补偿（2026-10-27 用户确认「文字反向补偿、始终保持水平可读」）────────
   旋转 θ 后，受转文字绕自身锚点反向转回，任何角度下正立可读。
   ⚠ 不用 getCTM()：实测 #tlDiagramContent 处于 display:none 时 Chrome 返回的矩阵
   不含祖先变换（测出 deg≈0 → 全部误跳过，文字跟着图斜）。改为纯解析式计算：
   从 text 节点沿祖先链一路复合到 svg 根（θ 已直接落在 #tlPlotGroup/#tlNorthGroup
   的 transform 上，链内自然含 θ），总朝向归零、锚点不动。
   [第四轮·用户确认] 带 data-tl-dim 的尺寸标注文字跳过补偿——按自身尺寸线定位，
   随地块旋转、不做水平调整。
   原始 transform 存 data-tl-otf；复位/重调先整体还原再重算，天然幂等。 */
function tlParseTfStr(str){
  if(!str)return {a:1,b:0,c:0,d:1,e:0,f:0};
  var m={a:1,b:0,c:0,d:1,e:0,f:0};
  var re=/(matrix|translate|rotate|scale)\s*\(([^)]*)\)/g,t;
  while((t=re.exec(str))){
    var s=t[2].trim().split(/[\s,]+/),n={a:1,b:0,c:0,d:1,e:0,f:0};
    if(t[1]==='matrix'){n={a:+s[0],b:+s[1],c:+s[2],d:+s[3],e:+s[4]||0,f:+s[5]||0};}
    else if(t[1]==='translate'){n={a:1,b:0,c:0,d:1,e:+s[0]||0,f:s.length>1?+s[1]:0};}
    else if(t[1]==='scale'){n={a:+s[0]||1,b:0,c:0,d:s.length>1?+s[1]:(+s[0]||1),e:0,f:0};}
    else if(t[1]==='rotate'){
      var r=(+s[0]||0)*Math.PI/180,co=Math.cos(r),si=Math.sin(r);
      if(s.length>2){var cx=+s[1],cy=+s[2];n={a:co,b:si,c:-si,d:co,e:cx-cx*co+cy*si,f:cy-cx*si-cy*co};}
      else n={a:co,b:si,c:-si,d:co,e:0,f:0};
    }
    m={a:m.a*n.a+m.c*n.b,b:m.b*n.a+m.d*n.b,c:m.a*n.c+m.c*n.d,d:m.b*n.c+m.d*n.d,
       e:m.a*n.e+m.c*n.f+m.e,f:m.b*n.e+m.d*n.f+m.f};
  }
  return m;
}
function tlTextCompRestore(svg){
  var list=svg.querySelectorAll('text[data-tl-otf]');
  for(var i=0;i<list.length;i++){
    var el=list[i],o=el.getAttribute('data-tl-otf');
    if(o)el.setAttribute('transform',o);else el.removeAttribute('transform');
    el.removeAttribute('data-tl-otf');
  }
}
function tlTextCompensate(svg,angle){
  tlTextCompRestore(svg);
  /* θ=0 只还原不补偿：沿线尺寸文字的固有倾角是原始出图习惯，无旋转时必须原样保留 */
  if(!angle)return;
  /* θ 已直接落在 #tlPlotGroup / #tlNorthGroup 的 transform 上（无 wrapper 组），
     故沿祖先链一路复合到 svg 根（含 θ），总朝向归零即可：
     地外文字（标题/信息/备注/图例/图框）链上无旋转 → c=0 自动跳过，零开销。 */
  var texts=svg.querySelectorAll('text');
  for(var i=0;i<texts.length;i++){
    var el=texts[i],old=el.getAttribute('transform');
    /* [第四轮·用户确认] 尺寸标注文字（data-tl-dim）不做水平补偿：
       按自身尺寸线定位、随地块一起转，与尺寸线相对关系不变。 */
    if(el.hasAttribute&&el.hasAttribute('data-tl-dim'))continue;
    var A={a:1,b:0,c:0,d:1,e:0,f:0},p=el.parentNode;
    while(p&&p.nodeType===1&&p.tagName.toLowerCase()!=='svg'){
      var pa=tlParseTfStr(p.getAttribute&&p.getAttribute('transform'));
      if(pa)A={a:A.a*pa.a+A.c*pa.b,b:A.b*pa.a+A.d*pa.b,c:A.a*pa.c+A.c*pa.d,d:A.b*pa.c+A.d*pa.d,
               e:A.a*pa.e+A.c*pa.f+A.e,f:A.b*pa.e+A.d*pa.f+A.f};
      p=p.parentNode;
    }
    var O=tlParseTfStr(old);
    var ax=parseFloat(el.getAttribute('x'))||0,ay=parseFloat(el.getAttribute('y'))||0;
    /* 锚点在父系坐标（own transform 作用域）：p = O·(x,y) */
    var px=O.a*ax+O.c*ay+O.e,py=O.b*ax+O.d*ay+O.f;
    /* 文字当前总朝向：祖先链 × own 的线性部分 */
    var L={a:A.a*O.a+A.c*O.b,b:A.b*O.a+A.d*O.b,c:A.a*O.c+A.c*O.d,d:A.b*O.c+A.d*O.d,e:0,f:0};
    var c=-Math.atan2(L.b,L.a)*180/Math.PI;
    if(!isFinite(px)||!isFinite(py)||!isFinite(c))continue;
    if(Math.abs(c)<0.05)continue;                /* 本来就水平 → 不动 */
    el.setAttribute('data-tl-otf',old||'');
    el.setAttribute('transform','rotate('+c.toFixed(2)+' '+px.toFixed(2)+' '+py.toFixed(2)+')'+(old?' '+old:''));
  }
}
/* [2026-10-27 第二轮·按用户反馈收窄] 只转「地块内容 + 指北针」：
   · #tlPlotGroup 绕图面中心转 θ（地块/分区/管线/阀门/水源/尺寸标注/最不利路径 随转）；
   · #tlNorthGroup 绕自身圆心叠转 θ（停在右上角原位，针向跟随地块旋转，真北不丢）；
   · 标题 tlTitleGroup / 信息行 tlHeaderGroup / 底部备注 tlParamsGroup / 图例 tlLegendGroup /
     图框 tlFrameGroup —— 一律不转。
   实现不包 wrapper 组、不改 z 序：直接在两组 transform 前置旋转（data-tl-rotf 存原值），
   文字反向补偿改为「祖先链一路复合到 svg 根、总朝向归零」的通用式。 */
function tlApplyOutputRotation(angle, persist){
  var host=document.getElementById('tlDiagramContent');
  var svg=host&&host.querySelector('svg');
  if(!svg)return false;
  var plot=svg.querySelector('#tlPlotGroup');
  var north=svg.querySelector('#tlNorthGroup');
  if(!plot&&!north)return false;
  var original=svg.getAttribute('data-tl-original-viewbox')||svg.getAttribute('viewBox');
  if(!original)return false;
  svg.setAttribute('data-tl-original-viewbox',original);
  var vb=original.trim().split(/[\s,]+/).map(Number);
  if(vb.length!==4||vb.some(function(n){return !isFinite(n);})||vb[2]<=0||vb[3]<=0)return false;
  angle=((Number(angle)||0)%360+360)%360;
  if(angle>180)angle-=360;
  /* 先整体还原（文字 + 两组 transform），再按新角度重算 —— 幂等 */
  tlTextCompRestore(svg);
  [plot,north].forEach(function(g){
    if(!g)return;
    if(g.hasAttribute('data-tl-rotf')){
      var o=g.getAttribute('data-tl-rotf');
      if(o)g.setAttribute('transform',o);else g.removeAttribute('transform');
      g.removeAttribute('data-tl-rotf');
    }
  });
  /* 图面平移（2026-10-27 用户「强迫症」需求）：#tlPlotGroup 整体微移，指北针留在角落不动。
     步长 = 当前 viewBox 尺寸的 0.5%/次，钳位 ±15% 防止把图面挪丢；存 localStorage 与角度同口径。 */
  var shift=(function(){try{return{x:Number(localStorage.getItem('tlOutputShiftX'))||0,y:Number(localStorage.getItem('tlOutputShiftY'))||0};}catch(e){return{x:0,y:0};}})();
  var hasShift=shift.x!==0||shift.y!==0;
  if(angle||hasShift){
    var cx=vb[0]+vb[2]/2,cy=vb[1]+vb[3]/2,rad=(angle||0)*Math.PI/180;
    var c=Math.cos(rad),s=Math.sin(rad);
    var corners=[[vb[0],vb[1]],[vb[0]+vb[2],vb[1]],[vb[0]+vb[2],vb[1]+vb[3]],[vb[0],vb[1]+vb[3]]].map(function(p){
      var dx=p[0]-cx,dy=p[1]-cy;
      return [cx+dx*c-dy*s+shift.x,cy+dx*s+dy*c+shift.y];
    });
    var xs=corners.map(function(p){return p[0];}),ys=corners.map(function(p){return p[1];});
    var minX=Math.min.apply(null,xs),maxX=Math.max.apply(null,xs),minY=Math.min.apply(null,ys),maxY=Math.max.apply(null,ys);
    svg.setAttribute('viewBox',[minX,minY,maxX-minX,maxY-minY].join(' '));
    if(plot){
      var tf='';
      if(hasShift)tf+='translate('+shift.x.toFixed(2)+' '+shift.y.toFixed(2)+')';
      if(angle)tf+=(tf?' ':'')+'rotate('+angle+' '+cx+' '+cy+')';
      plot.setAttribute('data-tl-rotf',plot.getAttribute('transform')||'');
      plot.setAttribute('transform',tf+(plot.getAttribute('transform')?' '+plot.getAttribute('transform'):''));
    }
    if(north&&angle){
      /* 指北针绕自身圆心叠转：圆心从既有 rotate(a cx cy) 解析；tlNrot=0 时无 transform，
         回退到生成器常量 (svgW-96, 82)（见 tlNorthGroup 段注释，改版式需同步）。
         平移不影响指北针——它固定在右上角原位。 */
      var nm=tlParseTfStr(north.getAttribute('transform'));
      var nx,nxok=false;
      if(nm&&(nm.a!==1||nm.b!==0)){
        var deg0=Math.atan2(nm.b,nm.a)*180/Math.PI;
        /* 圆心 = 既有旋转不动点：解 (I−R)·p = t（纯旋转时精确解）
           M=[[1−co,si],[−si,1−co]]，p = M⁻¹·t ⇒ px=[(1−co)e−si·f]/det，py=[si·e+(1−co)f]/det */
        var co=Math.cos(deg0*Math.PI/180),si=Math.sin(deg0*Math.PI/180);
        var det=(1-co)*(1-co)+si*si;
        if(Math.abs(det)>1e-9){
          nx=[((1-co)*nm.e-si*nm.f)/det,(si*nm.e+(1-co)*nm.f)/det];
          nxok=true;
        }
      }
      if(!nxok)nx=[vb[2]-96,82];
      var degN=(nm&&(nm.a!==1||nm.b!==0)?Math.atan2(nm.b,nm.a)*180/Math.PI:0)+angle;
      north.setAttribute('data-tl-rotf',north.getAttribute('transform')||'');
      north.setAttribute('transform','rotate('+degN.toFixed(2)+' '+nx[0].toFixed(2)+' '+nx[1].toFixed(2)+')');
    }
  }else svg.setAttribute('viewBox',original);
  tlTextCompensate(svg,angle||hasShift?1:0);
  if(persist!==false){try{localStorage.setItem('tlOutputRotationDeg',String(angle));}catch(e){}}
  return true;
}

/* 细调角度 UI 同步（2026-10-27）：数字框 ±180° 精确输入；
   [第五轮·用户反馈] 滑块已取消，只留数字框。 */
function tlRotSyncUI(){
  var cur=0;try{cur=Number(localStorage.getItem('tlOutputRotationDeg'))||0;}catch(e){}
  var num=document.getElementById('tlRotNum');
  if(num)num.value=String(cur);
}
window.tlRotSyncUI=tlRotSyncUI;
/* ── 悬浮卡任意拖动（2026-10-27 第五轮·用户需求）──────────────────────────
   「图面调整」标签即拖拽手柄；位置存 tlRotFinePos（相对图区左上角 px），
   显示时恢复并钳位在图区内。 */
function tlRotFineRestorePos(){
  var fine=document.getElementById('tlRotFine'),wrap=document.getElementById('tlDiagramWrap');
  if(!fine||!wrap)return;
  var pos=null;
  try{pos=JSON.parse(localStorage.getItem('tlRotFinePos')||'null');}catch(e){}
  if(!pos||typeof pos.x!=='number'||typeof pos.y!=='number')return;
  var fw=fine.offsetWidth||0,fh=fine.offsetHeight||0;
  var x=Math.max(0,Math.min((wrap.clientWidth||0)-fw,pos.x));
  var y=Math.max(0,Math.min((wrap.clientHeight||0)-fh,pos.y));
  fine.style.left=x+'px';fine.style.top=y+'px';fine.style.right='auto';
}
window.tlRotFineRestorePos=tlRotFineRestorePos;
/* ── 图面平移（上下左右微移）──────────────────────────────────────────────
   步长 0.5% viewBox 尺寸/次、钳位 ±15%；只动 #tlPlotGroup，指北针/装饰组不动；
   存 tlOutputShiftX/Y，与旋转共用 tlApplyOutputRotation 一条链（重生成/打印/导出同源）。 */
window.tlNudgeOutput=function(dx,dy){
  var svgHost=document.getElementById('tlDiagramContent');
  var svg=svgHost&&svgHost.querySelector('svg');
  if(!svg)return;
  var vb=(svg.getAttribute('viewBox')||'').trim().split(/[\s,]+/).map(Number);
  if(vb.length!==4||vb.some(function(n){return !isFinite(n);}))return;
  var stepX=vb[2]*0.005,stepY=vb[3]*0.005,limX=vb[2]*0.15,limY=vb[3]*0.15;
  var cur={x:0,y:0};
  try{cur.x=Number(localStorage.getItem('tlOutputShiftX'))||0;cur.y=Number(localStorage.getItem('tlOutputShiftY'))||0;}catch(e){}
  var nx=Math.max(-limX,Math.min(limX,cur.x+dx*stepX));
  var ny=Math.max(-limY,Math.min(limY,cur.y+dy*stepY));
  try{localStorage.setItem('tlOutputShiftX',String(+nx.toFixed(2)));localStorage.setItem('tlOutputShiftY',String(+ny.toFixed(2)));}catch(e){}
  var ang=0;try{ang=Number(localStorage.getItem('tlOutputRotationDeg'))||0;}catch(e){}
  tlApplyOutputRotation(ang,false);
};
window.tlOutputShiftReset=function(){
  try{localStorage.removeItem('tlOutputShiftX');localStorage.removeItem('tlOutputShiftY');}catch(e){}
  var ang=0;try{ang=Number(localStorage.getItem('tlOutputRotationDeg'))||0;}catch(e){}
  tlApplyOutputRotation(ang,false);
};
(function bindTlOutputRotation(){
  var tabs=document.getElementById('tlTabs');
  if(tabs&&!tabs.__tlOutputRotationBound){
    tabs.__tlOutputRotationBound=true;
    tabs.addEventListener('click',function(e){
      var button=e.target.closest&&e.target.closest('[data-tl-output-rotate]');
      if(!button)return;
      e.preventDefault();e.stopPropagation();
      var delta=Number(button.getAttribute('data-tl-output-rotate'))||0;
      var current=0;try{current=Number(localStorage.getItem('tlOutputRotationDeg'))||0;}catch(err){}
      tlApplyOutputRotation(delta===0?0:current+delta,true);
      tlRotSyncUI();
    });
    /* 图面平移：方向微移按钮 + 位置复位按钮。
       [第三轮] 细调控件已移到图区右上角悬浮卡 #tlRotFine（不在 #tlTabs 内），
       委托挂在悬浮卡自己身上。 */
    var rotFine=document.getElementById('tlRotFine');
    if(rotFine&&!rotFine.__tlShiftBound){
      rotFine.__tlShiftBound=true;
      rotFine.addEventListener('click',function(e){
        var nudge=e.target.closest&&e.target.closest('[data-tl-nudge]');
        if(nudge){
          e.preventDefault();e.stopPropagation();
          var d=nudge.getAttribute('data-tl-nudge').split(',').map(Number);
          window.tlNudgeOutput(d[0]||0,d[1]||0);
          return;
        }
        var rst=e.target.closest&&e.target.closest('[data-tl-shift-reset]');
        if(rst){
          e.preventDefault();e.stopPropagation();
          window.tlOutputShiftReset();
        }
      });
      /* 拖拽手柄：按住「图面调整」标签拖动整卡，松手记忆位置（钳位在图区内） */
      var handle=document.getElementById('tlRotFineHandle');
      if(handle){
        handle.addEventListener('mousedown',function(e){
          if(e.button!==0)return;
          e.preventDefault();
          var wrap=document.getElementById('tlDiagramWrap');
          if(!wrap)return;
          var wr=wrap.getBoundingClientRect(),fr=rotFine.getBoundingClientRect();
          var ox=e.clientX-fr.x,oy=e.clientY-fr.y;
          function mv(ev){
            var x=Math.max(0,Math.min(wr.width-fr.width,ev.clientX-wr.left-ox));
            var y=Math.max(0,Math.min(wr.height-fr.height,ev.clientY-wr.top-oy));
            rotFine.style.left=x+'px';rotFine.style.top=y+'px';rotFine.style.right='auto';
          }
          function up(){
            document.removeEventListener('mousemove',mv);
            document.removeEventListener('mouseup',up);
            try{localStorage.setItem('tlRotFinePos',JSON.stringify({x:parseFloat(rotFine.style.left)||0,y:parseFloat(rotFine.style.top)||0}));}catch(e){}
          }
          document.addEventListener('mousemove',mv);
          document.addEventListener('mouseup',up);
        });
      }
    }
  }
  /* 细调角度数字框：change 精确落库。[第五轮] 滑块已取消。只绑一次。 */
  if(!window.__tlRotFineBound){
    var num=document.getElementById('tlRotNum');
    if(num){
      window.__tlRotFineBound=true;
      num.addEventListener('change',function(){
        var v=Number(num.value)||0;
        if(v>180)v=180;if(v<-180)v=-180;
        num.value=String(v);
        tlApplyOutputRotation(v,true);
        tlRotSyncUI();
      });
    }
  }
})();

function tlExportSvgString(ctn){
  var svgEl=ctn?ctn.querySelector('svg'):null;
  if(!svgEl)return tlDiagramSVG;
  /* 出图口径（2026-10-20，随指北针一并收口）：编辑态的拖拽手柄不进图纸。
     #tlHeaderHandle 是信息行右下角 8×8 的淡紫色方块（cursor:nwse-resize），只用于拖宽信息行；
     直接序列化会把它写进 SVG / PNG / 打印，印在 A3 上就是一个说不出用途的紫方块
     （加了指北针后它正好落在指北针左侧，更显眼）。clone 后摘掉，不动页面上真实 DOM。 */
  var clone=svgEl.cloneNode(true);
  var hh=clone.querySelector('#tlHeaderHandle');
  if(hh&&hh.parentNode)hh.parentNode.removeChild(hh);
  return new XMLSerializer().serializeToString(clone);
}
function tlDownloadSVG() {
  if(!tlDiagramSVG)return;
  /* 序列化当前 DOM（含地块组拖拽 transform），使下载图纸反映拖拽后的位置 */
  var ctn=document.getElementById('tlDiagramContent');
  var svgStr=tlExportSvgString(ctn);
  if(!svgStr||svgStr.indexOf('<svg')<0)svgStr=tlDiagramSVG;
  var blob=new Blob([svgStr],{type:'image/svg+xml'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');a.href=url;a.download='three-level-diagram.svg';a.click();
  URL.revokeObjectURL(url);
}

/* ===== 施工简图：SVG -> PNG 通用工具 ===== */
function svgToPngBlob(svgStr, scale){
  scale=scale||2;
  return new Promise(function(resolve,reject){
    var size={w:0,h:0};
    var vb=svgStr.match(/viewBox\s*=\s*["']([^"']+)["']/);
    if(vb){var p=vb[1].trim().split(/[\s,]+/);size.w=parseFloat(p[2]);size.h=parseFloat(p[3]);}
    var svg=svgStr;
    if(size.w&&size.h&&!/(\bwidth\s*=)/.test(svg)){
      svg=svg.replace(/(<svg[^>]*?)>/, '$1 width="'+size.w+'" height="'+size.h+'">');
    }
    var blob=new Blob([svg],{type:'image/svg+xml;charset=utf-8'});
    var url=URL.createObjectURL(blob);
    var img=new Image();
    img.onload=function(){
      var c=document.createElement('canvas');
      c.width=Math.max(1,Math.round(size.w*scale));
      c.height=Math.max(1,Math.round(size.h*scale));
      var ctx=c.getContext('2d');
      ctx.fillStyle='#ffffff';ctx.fillRect(0,0,c.width,c.height);
      ctx.drawImage(img,0,0,c.width,c.height);
      URL.revokeObjectURL(url);
      try{ c.toBlob(function(b){ if(b){resolve(b);}else{reject(new Error('PNG 生成失败'));} },'image/png'); }
      catch(e){ reject(e); }
    };
    img.onerror=function(){ URL.revokeObjectURL(url); reject(new Error('SVG 图片加载失败')); };
    img.src=url;
  });
}
function downloadBlob(blob,filename){
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');a.href=url;a.download=filename;
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  setTimeout(function(){ URL.revokeObjectURL(url); },1500);
}
function tlSaveDiagramPng(){
  var ctn=document.getElementById('tlDiagramContent');
  var svgStr=tlExportSvgString(ctn);
  if(!svgStr||svgStr.indexOf('<svg')<0)svgStr=tlDiagramSVG;
  if(!svgStr){alert('请先生成三级管线施工简图');return;}
  svgToPngBlob(svgStr,2).then(function(b){ downloadBlob(b,'three-level-diagram.png'); })
    .catch(function(e){ alert('PNG 保存失败：'+(e&&e.message||e)); });
}
// tlSavePng 按钮已移除，事件绑定同步移除
// document.getElementById('tlSavePng').addEventListener('click', tlSaveDiagramPng);

function tlPrintDiagram() {
  if(!tlDiagramSVG)return;
  var ctn=document.getElementById('tlDiagramContent');
  var svgStr=tlExportSvgString(ctn);
  if(!svgStr||svgStr.indexOf('<svg')<0)svgStr=tlDiagramSVG;
  var title=document.querySelector('#tlDiagramWrap .pp-diagram-title');
  var titleText=title?title.textContent:'📋 三级管线施工简图';
  var w=window.open('','_blank');
  if(!w){alert('请允许弹出窗口以打印图纸');return;}
  w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>'+esc(titleText)+'</title>');
  w.document.write('<style>body{margin:0;padding:20px;font-family:system-ui,-apple-system,sans-serif;background:#fff;color:#333}');
  w.document.write('h2{margin:0 0 12px 0;font-size:18px;color:#1a3c1a}');
  w.document.write('.meta{margin-bottom:16px;font-size:13px;color:#666}');
  w.document.write('.meta span{margin-right:16px}');
  w.document.write('svg{max-width:100%;height:auto;display:block}');
  w.document.write('@media print{body{padding:0} .no-print{display:none}}');
  w.document.write('</style></head><body>');
  w.document.write('<h2>'+esc(titleText)+'</h2>');
  // 打印参数
  var bar1=document.getElementById('tlPlanBar');
  var bar2=document.getElementById('tlPlanBar2');
  if(bar1||bar2){
    w.document.write('<div class="meta no-print">');
    if(bar1){
      var items=bar1.querySelectorAll('.pp-plan-item');
      items.forEach(function(it){var txt=it.textContent.trim();if(txt)w.document.write('<span>'+txt+'</span>');});
    }
    if(bar2){
      var items2=bar2.querySelectorAll('.pp-plan-item');
      items2.forEach(function(it){var txt=it.textContent.trim();if(txt)w.document.write('<span>'+txt+'</span>');});
    }
    w.document.write('</div>');
  }
  w.document.write(svgStr);
  w.document.write('<div class="no-print" style="margin-top:16px;text-align:center"><button onclick="window.print()" style="padding:8px 24px;font-size:14px;cursor:pointer">🖨️ 打印</button></div>');
  w.document.write('</body></html>');
  w.document.close();
}
function tlInitDrag(){
  var ctn=document.getElementById('tlDiagramContent');
  if(!ctn)return;
  var svgEl=ctn.querySelector('svg');
  if(!svgEl)return;
  var plotG=svgEl.querySelector('#tlPlotGroup');
  if(!plotG)return;
  /* 清理上一次生成的 document 级监听器（重新生成图纸时旧 SVG 已被替换） */
  if(window._tlDragMove)document.removeEventListener('mousemove',window._tlDragMove);
  if(window._tlDragUp)document.removeEventListener('mouseup',window._tlDragUp);
  if(window._tlDimMove)document.removeEventListener('mousemove',window._tlDimMove);
  if(window._tlDimUp)document.removeEventListener('mouseup',window._tlDimUp);
  if(window._tlDimTouchMove)document.removeEventListener('touchmove',window._tlDimTouchMove);
  if(window._tlDimTouchUp)document.removeEventListener('touchend',window._tlDimTouchUp);
  /* A3 图纸范围（SVG user units）*/
  var svgW=1190, svgH=900, frameX=8, frameY=8, frameW=svgW-16, frameH=svgH-16;
  /* 地块组原始包围盒 */
  var bbox=plotG.getBBox();
  /* 位移约束：地块组不能拖出 A3 框 */
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
  /* 读取已保存的位移 */
  var pos={x:0,y:0};
  try{var saved=JSON.parse(localStorage.getItem('tl-plot-pos'));if(saved&&typeof saved.x==='number')pos=saved;}catch(e){}
  function applyPos(){
    plotG.setAttribute('transform','translate('+pos.x.toFixed(1)+','+pos.y.toFixed(1)+')');
  }
  if(pos.x||pos.y){clampPos(pos);applyPos();}
  /* 像素→SVG user units 换算 */
  function getScale(){
    var rect=svgEl.getBoundingClientRect();
    return rect.width>0?svgW/rect.width:1;
  }
  /* v121（2026-09-23 用户反馈「拖动没实现」）：可用性加固 —— ① 光标：悬停尺寸线变双向箭头
     （v114 注释声称「渲染时输出 cursor」实际没做，用户悬停无任何反馈以为功能不存在）；
     ② hover 高亮：尺寸线悬停变绿加粗，明确「抓到了」；③ 顺带把命中窗口放宽到 18px。 */
  if(!document.getElementById('tlDimUxStyle')){
    var _st=document.createElement('style');
    _st.id='tlDimUxStyle';
    _st.textContent='[data-dim][data-axis="x"]{cursor:ew-resize}'
      +'[data-dim][data-axis="y"]{cursor:ns-resize}'
      +'[data-dim]:hover line{stroke:#15803d;stroke-width:2.2}'
      /* v125：多选高亮（棕橙），简图与 ws 克隆的 [data-dim] 组都会带上 class */
      +'[data-dim].tl-dimsel line{stroke:#b45309;stroke-width:2.4}'
      +'[data-dim].tl-dimsel text{fill:#b45309}'
      /* [v557] 总管断点（三通）沿主管拖动：光标方向 = 拖动轴；悬停琥珀描边提示「抓到了」 */
      +'[data-junction-front][data-junction-axis="V"]{cursor:ns-resize}'
      +'[data-junction-front][data-junction-axis="H"]{cursor:ew-resize}'
      +'[data-junction-front][data-junction-key]:hover{stroke:#f59e0b;stroke-width:2.5}';
    document.head.appendChild(_st);
  }
    /* 拖拽逻辑：仅点击地块组内部时触发 */
  var dragStart=null;
  /* ===== [v557] 总管断点（三通）沿主管拖动 ===== */
  var nodeDrag=null;
  /* ===== [v570] 水源点任意拖动 ===== */
  var srcDrag=null;
  function tlSrcDragMove(ev){
    if(!srcDrag)return;
    var dxSvg=(ev.clientX-srcDrag.x0)*srcDrag.scale;   /* 像素 → SVG 用户单位 */
    var dySvg=(ev.clientY-srcDrag.y0)*srcDrag.scale;
    srcDrag.curW={x:srcDrag.wx+dxSvg*srcDrag.k, y:srcDrag.wy+dySvg*srcDrag.k};  /* k = 1/每米SVG单位 */
    if(srcDrag.g)srcDrag.g.setAttribute('transform','translate('+dxSvg.toFixed(1)+','+dySvg.toFixed(1)+')');
    /* 连接段直线跟随：起点跟着水源走，终点（总管最近顶点）不动 */
    if(srcDrag.pipeEl&&srcDrag.p0&&srcDrag.p1){
      srcDrag.pipeEl.setAttribute('d','M'+(srcDrag.p0.x+dxSvg).toFixed(1)+' '+(srcDrag.p0.y+dySvg).toFixed(1)
        +' L'+srcDrag.p1.x.toFixed(1)+' '+srcDrag.p1.y.toFixed(1));
    }
  }
  function tlSrcDragUp(){
    var sd=srcDrag; srcDrag=null;
    document.body.style.userSelect='';
    if(!sd)return;
    if(sd.g)sd.g.removeAttribute('transform');
    if(!sd.curW)return;
    var nx=Math.round(sd.curW.x), ny=Math.round(sd.curW.y);   /* 吸附到整米（与三通同口径） */
    if(Math.abs(nx-sd.wx)<0.5&&Math.abs(ny-sd.wy)<0.5)return;  /* 没动 ⇒ 不落盘不重生成 */
    if(window.tlSourceMoveSet)window.tlSourceMoveSet(window.tlSrcSig,nx,ny);
    try{ if(typeof tlAutoGenerate==='function') tlAutoGenerate({scroll:false}); }catch(e){}
  }
  function tlNodeDragMove(ev){
    if(!nodeDrag)return;
    var dx=ev.clientX-nodeDrag.x0,dy=ev.clientY-nodeDrag.y0;
    var dpx=dx*nodeDrag.ux+dy*nodeDrag.uy;
    var dsvg=dpx*nodeDrag.scale;                                  /* 屏幕像素 → SVG 用户单位 */
    var dm=(nodeDrag.mps>0)?(dsvg/nodeDrag.mps):0;                /* SVG 单位 → 米（沿主管方向） */
    var off=nodeDrag.off+dm;
    off=Math.round(off);                                          /* 吸附 1 米 */
    off=Math.max(0,Math.min(nodeDrag.max,off));                   /* 只能向下 + 上限 */
    nodeDrag.cur=off;
    var dsvg2=(off-nodeDrag.off)*(nodeDrag.mps>0?nodeDrag.mps:0);
    var gs=document.querySelectorAll('[data-junction-key="'+nodeDrag.key+'"]');
    for(var i=0;i<gs.length;i++){
      gs[i].setAttribute('transform','translate('+(nodeDrag.ux*dsvg2).toFixed(1)+','+(nodeDrag.uy*dsvg2).toFixed(1)+')');
    }
  }
  function tlNodeDragUp(){
    var nd=nodeDrag; nodeDrag=null;
    document.body.style.userSelect='';
    if(!nd)return;
    var gs=document.querySelectorAll('[data-junction-key="'+nd.key+'"]');
    for(var i=0;i<gs.length;i++)gs[i].removeAttribute('transform');
    var off=Math.max(0,Math.min(nd.max,nd.cur||0));
    if(Math.abs(off-nd.off)<0.01)return;                          /* 没动 ⇒ 不落盘不重生成 */
    /* 几何真变了（总管折线 + 主管截断）⇒ 必须整图重生成，材料/水力才会跟着重算 */
    try{ if(typeof tlAutoGenerate==='function') tlAutoGenerate({scroll:false}); }catch(e){}
  }
  svgEl.addEventListener('mousedown',function(e){
    if(e.button!==0)return;
    var target=e.target;
    if(!target||!target.closest||!target.closest('#tlPlotGroup'))return;
    /* [v570] 水源点拖动（任意位置）：**排在尺寸线之前** —— 水源是精确的 DOM 圆点目标（r=18 热区），
       而尺寸线是「按坐标容差」的模糊命中；水源本来就贴在地块外侧、与尺寸线邻近，
       放在尺寸线之后会被抢走（实测：拖水源变成拖尺寸线，水源纹丝不动、也不落盘）。
       也排在三通之前：水源拖到总管端点会与近端三通重叠，此时先抓水源（点哪个圆点拖哪个）。 */
    var srcEl=target.closest('[data-tl-src]');
    if(srcEl&&window.tlDiagramData&&window.tlDiagramData.sourcePos){
      e.preventDefault();
      var _sp0=window.tlDiagramData.sourcePos;
      var _pipeEl=svgEl.querySelector('[data-tlsrcpipe]');
      var _p0=null,_p1=null;
      if(_pipeEl){
        var _m=(_pipeEl.getAttribute('d')||'').match(/M\s*([-\d.]+)\s+([-\d.]+)\s*L\s*([-\d.]+)\s+([-\d.]+)/);
        if(_m){ _p0={x:+_m[1],y:+_m[2]}; _p1={x:+_m[3],y:+_m[4]}; }
      }
      srcDrag={x0:e.clientX,y0:e.clientY,wx:_sp0.x,wy:_sp0.y,scale:getScale(),
               k:(window.tlSrcScale>0?1/window.tlSrcScale:1),
               g:srcEl,pipeEl:_pipeEl,p0:_p0,p1:_p1,curW:null};
      document.body.style.userSelect='none';
      svgEl.style.cursor='grabbing';
      return;
    }
    /* v114：尺寸标注线命中优先于整组平移（命中按坐标算，不依赖 pointer-events） */
    var _dimP=tlDimSvgPoint(svgEl,e);
    var _dimHit=_dimP?tlDimHitTest(_dimP):null;
    if(_dimHit){
      e.preventDefault();
      dimDrag=tlDimDragObj(_dimHit,tlDimGroupFor(_dimHit),e.clientX,e.clientY,getScale(),'sys');
      document.body.style.userSelect='none';
      svgEl.style.cursor=_dimHit.axis==='y'?'ns-resize':'ew-resize';
      return;
    }
    /* [v557] 总管断点（三通）命中 → 沿主管方向拖动（尺寸线之后、整组平移之前）。
       max≤0（该断点无处可下移：主管太短 / 阀门太靠上）⇒ 不启动，退化成整图平移。 */
    var jEl=target.closest('[data-junction-front][data-junction-key]');
    /* [v568] 命中兜底：连接线/阀门只带 data-junction-key（v564 为整组平移挂的），
       点它们等同点这个三通 —— 反查同组带 data-junction-front 的元素取限位属性。
       不做这层兜底的话，点连接线/阀门会 closest 失败 ⇒ 退化成整图平移。 */
    if(!jEl){
      var jAny=target.closest('[data-junction-key]');
      if(jAny){
        var jk=jAny.getAttribute('data-junction-key');
        if(jk){ try{ jEl=svgEl.querySelector('[data-junction-front][data-junction-key="'+jk+'"]'); }catch(errJ){ jEl=null; } }
      }
    }
    if(jEl&&(parseFloat(jEl.getAttribute('data-junction-max'))||0)>0){
      e.preventDefault();
      nodeDrag={el:jEl,key:jEl.getAttribute('data-junction-key'),sig:jEl.getAttribute('data-junction-sig'),
                off:parseFloat(jEl.getAttribute('data-junction-off'))||0,
                max:parseFloat(jEl.getAttribute('data-junction-max'))||0,
                axis:jEl.getAttribute('data-junction-axis')||'V',
                ux:isFinite(parseFloat(jEl.getAttribute('data-junction-ux')))?parseFloat(jEl.getAttribute('data-junction-ux')):((jEl.getAttribute('data-junction-axis')==='H')?1:0),
                uy:isFinite(parseFloat(jEl.getAttribute('data-junction-uy')))?parseFloat(jEl.getAttribute('data-junction-uy')):((jEl.getAttribute('data-junction-axis')==='V')?1:0),
                mps:parseFloat(jEl.getAttribute('data-junction-mps'))||0,
                x0:e.clientX,y0:e.clientY,scale:getScale(),cur:0};
      document.body.style.userSelect='none';
      return;
    }
    e.preventDefault();
    var scale=getScale();
    dragStart={x:e.clientX,y:e.clientY,ox:pos.x,oy:pos.y,scale:scale};
    document.body.style.userSelect='none';
    svgEl.style.cursor='grabbing';
  });
  window._tlDragMove=function(ev){
    if(srcDrag){tlSrcDragMove(ev);return;}
    if(nodeDrag){tlNodeDragMove(ev);return;}
    if(!dragStart)return;
    var s=dragStart.scale;
    pos.x=dragStart.ox+(ev.clientX-dragStart.x)*s;
    pos.y=dragStart.oy+(ev.clientY-dragStart.y)*s;
    clampPos(pos);
    applyPos();
  };
  window._tlDragUp=function(){
    if(srcDrag){tlSrcDragUp();return;}
    if(nodeDrag){tlNodeDragUp();return;}
    if(!dragStart)return;
    dragStart=null;
    document.body.style.userSelect='';
    svgEl.style.cursor='';
    localStorage.setItem('tl-plot-pos',JSON.stringify(pos));
  };
  document.addEventListener('mousemove',window._tlDragMove);
  document.addEventListener('mouseup',window._tlDragUp);
  /* ===== v114：尺寸标注线拖动 —— 命中按 _tlDimHits 坐标，更新走 data-dim/data-dimext 增量 ===== */
  var dimDrag=null;
  function tlDimSvgPoint(svg,e){
    var m=svg.getScreenCTM(); if(!m)return null;
    var pt=svg.createSVGPoint(); pt.x=e.clientX; pt.y=e.clientY;
    try{return pt.matrixTransform(m.inverse());}catch(err){return null;}
  }
  function tlDimHitTest(p){
    var hits=window._tlDimHits||[]; var best=null,bd=18;
    for(var i=0;i<hits.length;i++){
      var h=hits[i];
      if(h.axis==='y'){
        if(p.x<Math.min(h.x1,h.x2)-18||p.x>Math.max(h.x1,h.x2)+18)continue;
        var d=Math.abs(p.y-h.y1); if(d<bd){bd=d;best=h;}
      }else{
        if(p.y<Math.min(h.y1,h.y2)-18||p.y>Math.max(h.y1,h.y2)+18)continue;
        var d2=Math.abs(p.x-h.x1); if(d2<bd){bd=d2;best=h;}
      }
    }
    return best;
  }
  function tlDimApplyDD(id,axis,dd){
    /* v123b：ws 工作区（三级管线编辑视图）克隆渲染了同一份图纸（同样带 [data-dim]/[data-dimext]），
       文档级应用让简图与 ws 两份渲染同步平移（此前只动简图那份，ws 视图里尺寸线纹丝不动）。
       v176（2026-10-01 用户：「拖尺寸线时端线超出量在变、端线都不超出箭头了」）：
        原来组用【绝对偏移 tot】、端线活动端又 +=dd ⇒ 端线被计入两次位移，
        端线超出量 = DG.ext + off（拖到上限时整条端线跑到尺寸线上方）。
        现改为：① 组位移按 dd【累加】（_tlDimState.dtot，两份渲染共用）——
                累加和恒等于「相对渲染基线的位移」，与是否存在已保存偏移无关；
              ② 端线【锚端】（data-dimextfix 指定的坐标）反补 -dd ⇒ 渲染后锚端恒定不动；
              ③ 端线另一头（活动端）不再改 ⇒ 随组平移，恰好保持「超出 DG.ext」。
       v176b：删掉已死的第 4 参 tot（全仓库唯一调用点；保留死参数=「闸门看得见但没用」的隐患）。 */
    var gs=document.querySelectorAll('[data-dim="'+id+'"]');
    if(window._tlDimState&&!window._tlDimState.dtot)window._tlDimState.dtot={};
    var _dt=window._tlDimState?window._tlDimState.dtot:null;
    var _t=((_dt&&_dt[id])||0)+dd;
    if(_dt)_dt[id]=_t;
    for(var gi=0;gi<gs.length;gi++){
      gs[gi].setAttribute('transform','translate('+(axis==='x'?_t.toFixed(1):'0')+','+(axis==='y'?_t.toFixed(1):'0')+')');
    }
    var exts=document.querySelectorAll('[data-dimext="'+id+'"]');
    for(var i=0;i<exts.length;i++){
      var ln=exts[i], fix=ln.getAttribute('data-dimextfix');
      if(!fix)continue;
      ln.setAttribute(fix,(parseFloat(ln.getAttribute(fix))-dd).toFixed(1));
    }
  }
  /* v125：多选拖动 —— 按住「已选」尺寸线拖动 = 全部已选一起平移。
     每条线沿自己的法向取位移分量（y 轴线取 dy、x 轴线取 dx），minOff 约束逐条生效。 */
  function tlDimGroupFor(hit){
    if(!(window._tlDimMulti&&window._tlDimSel&&window._tlDimSel.length&&window._tlDimSel.indexOf(hit.id)>=0))return null;
    var grp=[],hits=window._tlDimHits||[];
    for(var i=0;i<hits.length;i++){
      var h=hits[i];
      if(window._tlDimSel.indexOf(h.id)>=0)grp.push({id:h.id,axis:h.axis,minOff:h.minOff,off0:window._tlDimState.offs[h.id]||0});
    }
    return grp.length?grp:null;
  }
  function tlDimDragObj(hit,g,x0,y0,k,src){
    var grp=g||[{id:hit.id,axis:hit.axis,minOff:hit.minOff,off0:window._tlDimState.offs[hit.id]||0}];
    var lo={};for(var i=0;i<grp.length;i++)lo[grp[i].id]=grp[i].off0;
    return {hit:hit,grp:grp,lastOffs:lo,x0:x0,y0:y0,k:k,src:src||''};
  }
  window._tlDimMove=function(ev){
    if(!dimDrag)return;
    dimDrag.dx=(ev.clientX||0)-dimDrag.x0; dimDrag.dy=(ev.clientY||0)-dimDrag.y0;
    for(var i=0;i<dimDrag.grp.length;i++){
      var h=dimDrag.grp[i];
      /* v114fix：d = 按下时偏移 + 总位移×k（此前误用 lastOff+总位移 → 每次 move 累计多加，e2e 实测 65.6≠43.7） */
      var d=h.off0+((h.axis==='y')?dimDrag.dy:dimDrag.dx)*dimDrag.k;
      d=Math.max(h.minOff,Math.min(320,d));
      var dd=d-(dimDrag.lastOffs[h.id]||0);
      if(!dd)continue;
      window._tlDimState.offs[h.id]=d;
      tlDimApplyDD(h.id,h.axis,dd);
      dimDrag.lastOffs[h.id]=d;
    }
  };
  window._tlDimUp=function(){
    if(!dimDrag)return;
    /* v125：多选模式下「无位移的点击」= 加选/取消该尺寸线（与水管多选同口径，<4px 视为点击） */
    if(window._tlDimMulti&&dimDrag.hit&&Math.abs(dimDrag.dx||0)<4&&Math.abs(dimDrag.dy||0)<4){
      var _id=dimDrag.hit.id,_ix=window._tlDimSel.indexOf(_id);
      if(_ix>=0)window._tlDimSel.splice(_ix,1);else window._tlDimSel.push(_id);
      if(window.tlDimSelSync)window.tlDimSelSync();
    }
    dimDrag=null;
    document.body.style.userSelect='';
    svgEl.style.cursor='';
    /* v125：保存开关 —— 开=写入本地；关(默认)=不保存并清掉旧档（刷新即恢复初始位置） */
    try{
      if(window._tlDimSaveOn)localStorage.setItem('tl-dim-offs',JSON.stringify({sig:window._tlDimState.sig,offs:window._tlDimState.offs}));
      else localStorage.removeItem('tl-dim-offs');
    }catch(e){}
  };
  document.addEventListener('mousemove',window._tlDimMove);
  document.addEventListener('mouseup',window._tlDimUp);
  /* v121：触摸/触屏 —— mouse 系列在触屏上不触发（此前尺寸线拖动在手机/平板完全无效）。
     touchstart 命中后复用同一 dimDrag；touchmove 把 touches[0] 伪装成 mouse 事件转调 _tlDimMove。 */
  svgEl.addEventListener('touchstart',function(e){
    if(e.touches.length!==1)return;
    var t=e.touches[0];
    var _dimP=tlDimSvgPoint(svgEl,t);
    var _dimHit=_dimP?tlDimHitTest(_dimP):null;
    if(!_dimHit)return;
    e.preventDefault();
    dimDrag=tlDimDragObj(_dimHit,tlDimGroupFor(_dimHit),t.clientX,t.clientY,getScale());
  },{passive:false});
  window._tlDimTouchMove=function(ev){
    if(!dimDrag)return;
    if(ev.touches&&ev.touches.length===1){
      var t=ev.touches[0];
      ev.preventDefault();
      window._tlDimMove({clientX:t.clientX,clientY:t.clientY});
    }
  };
  window._tlDimTouchUp=function(){if(window._tlDimUp)window._tlDimUp();};
  document.addEventListener('touchmove',window._tlDimTouchMove,{passive:false});
  document.addEventListener('touchend',window._tlDimTouchUp);
  /* ===== v123b（2026-09-23 用户反馈「标注线还是拖不动」真正根因）=====
     生成管线图后应用自动落在「三级管线编辑」(data-ry-view="ws") 视图，用户看到的图纸是
     ws 工作区克隆渲染的（tl-workspace renderPipeBaseSVG 把简图 base.inner 原样嵌入，坐标
     系相同、同样带 [data-dim]）—— 但 v114 拖动只挂在简图 svg 上，ws 视图里尺寸线是纯装饰。
     这里把同一套命中/拖动委托到 #tlWsCanvas（canvas 稳定存在；svg 每次渲染重建不能直挂）。 */
  /* 注意：#tlWsCanvas 每次渲染都会被 innerHTML 整体重建（tl-workspace.js renderSVG），
     不能直挂 —— 委托到 document（稳定），每次 tlInitDrag 先摘旧再挂新。 */
  function wsDimPress(e){
    var wsSvg=e.target&&e.target.closest?e.target.closest('#tlWsCanvas svg.tl-ws-svg'):null;
    if(!wsSvg)return;
    var _dimP=tlDimSvgPoint(wsSvg,e);
    var _dimHit=_dimP?tlDimHitTest(_dimP):null;
    if(!_dimHit)return;
    /* 命中尺寸线 → 捕获阶段拦截：ws 编辑器（ctn 上的 pointerdown 平移/选管）让位，与简图「尺寸线优先」同口径 */
    if(e.preventDefault)e.preventDefault();
    if(e.stopPropagation)e.stopPropagation();
    var _r=wsSvg.getBoundingClientRect();
    var _vb=(wsSvg.viewBox&&wsSvg.viewBox.baseVal)?wsSvg.viewBox.baseVal.width:svgW;
    var _k=_r.width>0?_vb/_r.width:1;
    dimDrag=tlDimDragObj(_dimHit,tlDimGroupFor(_dimHit),e.clientX,e.clientY,_k,'ws');
    document.body.style.userSelect='none';
    wsSvg.style.cursor=_dimHit.axis==='y'?'ns-resize':'ew-resize';
  }
  /* 必须用 pointerdown（捕获阶段）：ws 编辑器在 ctn 上挂 pointerdown 且 preventDefault ——
     一旦被取消，随后的兼容 mousedown 根本不会派发，mousedown 委托永远收不到。
     pointerdown 同时覆盖鼠标/触摸/笔，无需再挂 touchstart。 */
  if(window._tlDimWsDown)document.removeEventListener('pointerdown',window._tlDimWsDown,true);
  window._tlDimWsDown=function(e){ if(e.button!==0)return; wsDimPress(e); };
  document.addEventListener('pointerdown',window._tlDimWsDown,true);
  /* ws 按下时 preventDefault 已取消兼容 mouse 事件 → 拖动必须由 pointermove/pointerup 驱动
     （src 区分两条链路，避免双重处理）。 */
  if(window._tlDimWsMove)document.removeEventListener('pointermove',window._tlDimWsMove);
  if(window._tlDimWsUp)document.removeEventListener('pointerup',window._tlDimWsUp);
  window._tlDimWsMove=function(ev){ if(dimDrag&&dimDrag.src==='ws')window._tlDimMove(ev); };
  window._tlDimWsUp=function(){ if(dimDrag&&dimDrag.src==='ws')window._tlDimUp(); };
  document.addEventListener('pointermove',window._tlDimWsMove);
  document.addEventListener('pointerup',window._tlDimWsUp);
  /* v114：hover 光标用 SVG 原生 cursor 属性（渲染时随尺寸线输出）—— 不挂 JS mousemove，
     headless 下「cursor 赋值↔合成 mousemove」会互相触发形成事件风暴（实测死循环），禁走此路。 */
  /* 双击地块组重置位置 */
  plotG.addEventListener('dblclick',function(e){
    e.stopPropagation();
    e.preventDefault();
    pos={x:0,y:0};
    applyPos();
    localStorage.setItem('tl-plot-pos',JSON.stringify(pos));
  });
}

/* 三级系统图：在三级管路 section 底部的 #tlSysDiagramWrap 内嵌区域用 iframe 渲染「三级系统图.html」
   —— 替代原先 window.open 弹新页面；🔗 新窗口 按钮（#tlSysOpen）已按要求移除，统一走内嵌 iframe。
   - 计算结果通过 URL 参数传入独立页面，复用其完整渲染逻辑（SVG 生成、参数编辑、PNG 导出等）
   - 渲染触发：切到「三级系统图」视图时自动内嵌渲染（原「⚙️ 生成 / 重绘系统图」
     按钮已按要求取消）；（2026-09-14 晚 #tlSysBtn 按钮已取消，入口=rySetTab 视口切换自动渲染）。 */
/* embed=1 → 供 iframe 内嵌用（图纸按容器等比缩放、整幅可见）；不传 → 独立页面原样 */
function tlBuildSysUrl(embed) {
  function txt(id) { var el = document.getElementById(id); return el ? el.textContent.trim() : ''; }
  /* v139：系统图取「应用到图面」后的当前值（tlFigParamLines 同源：水泵参数 1 位小数 +
     图面实际管径），不再读结果栏主数字文本（v139 起主列=设计值口径） */
  var sysResult = computeThreeLevel();
  var fpSys = (sysResult && window.tlFigParamLines) ? window.tlFigParamLines(sysResult) : null;
  var q = fpSys ? fpSys.pump.flow : txt('tlPlanPumpFlow'), h = fpSys ? fpSys.pump.head : txt('tlPlanPumpHead'), p = fpSys ? fpSys.pump.power : txt('tlPlanPumpPower');
  var front = fpSys ? String(fpSys.ods.front) : ((txt('tlPlanFrontPipe').match(/(\d+)/) || [])[1] || '');
  var main = fpSys ? String(fpSys.ods.main) : ((txt('tlPlanMainPipe').match(/(\d+)/) || [])[1] || '');
  var zc = tlGetZoneCount();
  var base = encodeURI('三级系统图.html');
  return base + '?q=' + encodeURIComponent(q) +
        '&h=' + encodeURIComponent(h) +
        '&p=' + encodeURIComponent(p) +
        '&front=' + encodeURIComponent(front) +
        '&main=' + encodeURIComponent(main) +
        '&zc=' + encodeURIComponent(zc) +
        (embed ? '&embed=1' : '');
}
function tlOpenSystemDiagram() {
  var frame = document.getElementById('tlSysFrame');
  var empty = document.querySelector('#tlSysDiagramContent > .pp-diagram-empty');
  if (!frame) { window.open(tlBuildSysUrl(0), '_blank'); return; }
  frame.src = tlBuildSysUrl(1);
  frame.style.display = 'block';
  if (empty) empty.style.display = 'none';
}

/* 系统图 iframe 尺寸变化 → 主动通知内层页面重算图幅缩放系数
   ---------------------------------------------------------------------------
   为什么要外层驱动：内层页面的 window.resize / ResizeObserver 在「切 Tab、
   拖拽左属性栏、缩放浏览器窗口」等场景下实测不触发（headless 复现：main 高度
   已从 837 变到 661，缩放比例却仍是旧值 0.745，图幅纵向溢出可视区）。
   通信手段选 postMessage：file:// 双击打开时 iframe 会被当成跨源文档，直接
   读写 contentWindow 的属性会被拦，而 postMessage 不受同源限制。 */
(function () {
  var frame = document.getElementById('tlSysFrame');
  if (!frame) return;
  function notifyFit() {
    if (frame.style.display === 'none') return;
    try {
      var cw = frame.contentWindow;
      if (cw) cw.postMessage({ type: 'ry-fit-sys' }, '*');
    } catch (e) { /* 极端跨源情形：交给内层自身的 resize 兜底 */ }
  }
  if (window.ResizeObserver) { new ResizeObserver(notifyFit).observe(frame); }
  frame.addEventListener('load', notifyFit);
  window.__ryNotifySysFit = notifyFit;
})();

/* ===== 主区 Tab 切换（替代原「整屏替换」）====================================
   二级简图 draw 视图暂时停用，入口与程序切换均由下方保护拦截；视图实现保留。
   三级：#tlTabs → pipe（三级简图）/ sys（系统简图）
   2026-09-15：底部「二级制图 / 三级制图」按钮已按用户指令取消 —— edit / ws 仍可由
   rySetTab 编程进入（顶部导航复位走这条路），只是不再有底部按钮；被删按钮的视图
   不会出现在高亮循环里（无匹配按钮 → 全部熄灭，属预期，勿"修复"）。
   左属性栏始终保留，只有右主区换面板；不再整屏替换，切换时不跳版。 */
/* ===== [v193 2026-10-03] 成组地块暂不进「三级管路设计」页 =====
 * 用户原话：「这个单独编辑，跟三级管路编辑页面分开，否则我担心跟原来的一些计算规则
 *   跟逻辑搞混了，容易出错」；用户拍板 ②「先不让成组地块进三级页」。
 * 理由：三级按「一个地块 = 一套分区 + 一套管网」计算，成组地块进去必然把块间空隙
 *   当实体面积算进来 —— 与二级页「空隙不算面积」的口径直接冲突。
 * ★ 必须**同时**拦 rySetTab（切视图）与 ryShowSection（切功能区）两条路：
 *   只拦一条，导航会从另一条绕进去。 */
function ryIsGroupPlot(){
  var s=window.__runyeSubPlots;
  return !!(s && s.length>=2);
}
function ryGroupThirdLevelGuard(){
  if(!ryIsGroupPlot())return false;
  /* [v194] 放行「按块进入」：从成组管路页进来时，measuredPolygon 已换成**某一块**的环，
     二级页也已切到那一块 ⇒ 此刻三级页的口径确实就是单地块，不该拦。
     ★ 判断依据只能是这个显式标记，不能用别的状态反推 —— 反推必然在某种组合下判错。 */
  if(window.__runyeTlBlock!=null)return false;
  var n=window.__runyeSubPlots.length;
  alert('当前地块是「成组地块」（'+n+' 块）。\n\n'
    +'成组地块暂不进入三级管路设计：三级按「一个地块 = 一套分区 + 一套管网」计算，\n'
    +'进去会把块间空隙当成实体面积算进去，与二级页「空隙不计面积」的口径冲突。\n\n'
    +'请先在二级管路页用「逐块」模式分别编辑每一块；\n'
    +'或到在线地图把成组地块拆成单个地块后再进三级。');
  return true;
}

/* [v194] 二级页成组态变化 → 同步「成组管路」页。
   两页看的是同一份 __runyeGroupEdit，但二级页改了之后新页不会自己知道
   （新页只在切入时刷新）⇒ 这里主动推一次。
   ★ 只推刷新、不推切换：否则在二级页干活时被莫名跳走。 */
function grSyncSecondLevelToGroupPage(){
  try{ if(typeof window.grRefreshGroupPage==='function') window.grRefreshGroupPage(); }catch(e){}
}

function rySetTab(sectionId, view) {
  /* 二级简图停用：避免旧入口、自动流程或外部调用把地块分区留在 draw 视图。
     简图渲染、样式和数据仍保留；恢复步骤见 feature-archive/二级简图/README.md。 */
  if (sectionId === 'pipePlanSection' && view === 'draw') return;
  if(window.RyMobile && window.RyMobile.isActive() && sectionId==='tlPipePlanSection' && view==='sys') view='ws';
  /* [v193] 成组地块拦截三级页入口（三条路都要拦，见上方说明） */
  if(sectionId==='tlPipePlanSection' && typeof ryGroupThirdLevelGuard==='function' && ryGroupThirdLevelGuard())return;
  var sec = document.getElementById(sectionId);
  if (!sec) return;
  sec.setAttribute('data-ry-view', view);
  /* 输出模式标记（2026-09-13，见样式 12.2 段）：底部「简图」按钮 → 图纸独占、
     左属性栏让位；二级「管线编辑」回到工作区。值用 "1"/"0"（增删属性会破坏
     verify_pp_tabs / verify_nav_switch 的最小 DOM 桩 —— 桩没有 removeAttribute）。
     三级的 pipe/sys 是图纸输出（工作区=顶部导航入口，由导航处理器写 "0"）。 */
  if(sectionId==='pipePlanSection'){
    sec.setAttribute('data-ry-clean', view==='draw' ? '1' : '0');
  }else if(sectionId==='tlPipePlanSection'){
    /* 2026-09-13：ws=「三级设计」工作区（左栏保留）；pipe/sys 仍是图纸输出 */
    sec.setAttribute('data-ry-clean', view==='ws' ? '0' : '1');
  }
  var bar = sec.querySelector('.ry-tabs');
  /* 2026-09-12：两组切换条已下移到页面底部状态栏 #ryStatusBar（不再在 section 内），
     此时 sec.querySelector('.ry-tabs') 为 null —— 退回按 data-ry-sec 全局查找，
     保证「切 Tab 时按钮高亮同步」这一行为不变。 */
  if (!bar) bar = document.querySelector('.ry-tabs[data-ry-sec="' + sectionId + '"]');
  if (bar) {
    var btns = bar.querySelectorAll('button[data-ry-view]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].getAttribute('data-ry-view') === view);
    }
    var outputRotators=bar.querySelectorAll('[data-tl-output-rotate]');
    for(var ri=0;ri<outputRotators.length;ri++)outputRotators[ri].style.display=view==='pipe'?'':'none';
    /* [2026-10-27] 细调角度控件与档位按钮同进同出；切进 pipe 视图时顺带把滑块/
       数字框对齐到当前已存角度（重新生成简图后角度从 localStorage 恢复，UI 要跟上）。 */
    var rotFine=document.getElementById('tlRotFine');
    if(rotFine){
      rotFine.style.display=view==='pipe'?'inline-flex':'none';
      if(view==='pipe'){
        if(typeof tlRotSyncUI==='function')tlRotSyncUI();
        /* 显示时恢复用户拖放的位置（钳位在图区内） */
        if(typeof tlRotFineRestorePos==='function')tlRotFineRestorePos();
      }
    }
  }
  /* 目标功能区若未激活（如从顶部导航直接点「⚙️ 生成系统图」），先切过去 */
  var _ryTabActivatedSection = false;
  if (typeof window.ryShowSection === 'function' && !sec.classList.contains('ry-active')) {
    window.ryShowSection(sec, null);
    _ryTabActivatedSection = true;
  }
  if (typeof window.ryStatusUpdate === 'function') window.ryStatusUpdate(sec);
  /* 三级管路切到「三级系统图」时自动内嵌渲染一次
     （原「⚙️ 生成 / 重绘系统图」按钮已按要求取消，改由切视图触发）；
     已有 src 则不再重复加载，避免每次切 Tab 都刷新 iframe。 */
  if (sectionId === 'tlPipePlanSection' && view === 'sys' && typeof tlOpenSystemDiagram === 'function') {
    var sysFrameAuto = document.getElementById('tlSysFrame');
    if (sysFrameAuto && !sysFrameAuto.getAttribute('src')) tlOpenSystemDiagram();
  }
  /* 三级管路切到「三级设计」工作区：tl-workspace 模块按平面图几何渲染
     （只读 window.tlDiagramData）；无数据时显示提示。
     重复切换整幅重渲染（视口复位），手工管线层随数据引用保留。 */
  if (sectionId === 'tlPipePlanSection' && view === 'ws') {
    var wsCtn = document.getElementById('tlWsContent');
    /* [v1030] 原「先刷统计表、再渲染画布」两步中的刷表随统计表整套删除，此处直接渲染画布。 */
    if (wsCtn && window.RyTlWs) {
    if (wsCtn && window.RyTlWs) {
      if (window.tlDiagramData) {
        window.RyTlWs.render(wsCtn, window.tlDiagramData);
        /* v162：遮蔽状态在 render() 内部经 AE.syncGeometry 从 localStorage 静默恢复 ——
           简图/工作区底图可能已克隆到「未遮蔽」的旧样式。这里补一次样式对齐 + 就地重渲染
           （并重算材料清单），让刷新后恢复的遮蔽状态真的看得见、真的一直不计入清单。
           只在确有遮蔽时执行 ⇒ 没用过该功能时零开销、零行为变化。 */
        try {
          if (window.RyTlAutoEdits && window.RyTlAutoEdits.hiddenCount && window.RyTlAutoEdits.hiddenCount() > 0) {
            if (window.tlApplyHiddenPipeStyles) window.tlApplyHiddenPipeStyles();
            window.RyTlWs.rerenderKeepView();
            if (typeof window.render === 'function') window.render();
          }
        } catch (eHidRestore) { }
      } else {
        wsCtn.innerHTML = '<div class="tl-ws-empty">请先在「分区与管路」页点击「生成施工图」</div>';
      }
    }
    /* 工具栏只在施工图已生成后显示管线编辑工具。 */
    try { tlWsBarSync(); } catch (e) { }
    }
  }
  /* 三级管路切到「三级简图」(pipe)：图例重新定位（默认贴图框右上内缩；
     用户拖动过则保留其位置，不覆盖）。
     注：联合灌溉分组图例已于第五十九轮取消 → lgNode 恒为 null，本块属无害保留。 */
  if (sectionId === 'tlPipePlanSection' && view === 'pipe') {
    var lgNode = document.getElementById('tlGroupLegend');
    if (lgNode && !_tlLegendUserPos) tlPositionLegendInsideFrame(document.getElementById('tlDiagramContent'), lgNode);
  }
  /* 面板由隐藏变可见后，画布 / 图纸需按新容器尺寸重绘 */
  /* ryShowSection 已在下一帧安排画布重算；避免同一次切页再同步派发一次 resize，
     否则从其他功能区切入二级页会让画布连续完整重绘两次。 */
  if (!_ryTabActivatedSection) {
    try { window.dispatchEvent(new Event('resize')); } catch (e) { }
  }
}

/* 三级系统图：切到「三级系统图」Tab 并在 iframe 内渲染 */
function tlShowSysDiagram() {
  tlOpenSystemDiagram();
  rySetTab('tlPipePlanSection', 'sys');
}
/* 退回「三级简图」Tab */

/* 导航栏「⚙️ 生成系统图」入口：切到三级系统图 Tab（已生成三级结果时自动内嵌渲染） */
function openTlSystemDiagramFromNav() {
  tlShowSysDiagram();
}

/* 系统图区域按钮（⚙️ 生成 / 重绘系统图 #tlSysGen）已按要求取消（2026-09-12）
   —— 按钮本体与其点击绑定一并移除：只删按钮的话 getElementById 会拿到 null 抛
   TypeError，整段脚本静默中断（页面看着没坏、下方功能全废）。
   替代入口：切到「三级系统图」视图时由 rySetTab 自动内嵌渲染（仅首次，
   已有 src 不重复加载）；（2026-09-14 晚 #tlSysBtn 按钮已取消，入口=rySetTab 视口切换自动渲染）。 */

/* ===== 二级施工简图：历史视图入口（暂停切换，保留实现以便恢复） ===== */
function ppShowConstructDiagram() {
  // 二级简图视图已暂停；不再改变当前视图状态。
  rySetTab('pipePlanSection', 'draw');
}
/* 退回「管线编辑」Tab */

/* ===== 三级管线图：切到「三级简图」Tab ===== */
/* 三级设计工作区：切到 ws 视图（tl-workspace 模块渲染，2026-09-13） */
function tlShowWorkspace() {
  rySetTab('tlPipePlanSection', 'ws');
}
/* 兼容旧名（原整屏视图的返回入口） */

// Zone count selector
document.querySelectorAll('#tlZoneCountGroup button').forEach(function(btn){
  btn.addEventListener('click',function(){
    document.querySelectorAll('#tlZoneCountGroup button').forEach(function(b){b.classList.remove('selected');});
    btn.classList.add('selected');
    /* v115（2026-09-22 用户要求）：点 1/2/3/4 区自动按钮 = 完全回到自动 ——
       （v150b：选项由 2/3/4/5 改为 1/2/3/4，用户要求去掉 5 区联合——水泵没必要那么大；
       N=1 即单区单组，主要想在三级页面看总管+水泵）
       手动分组**和**手动拖过的分界线（阶梯覆盖表 tlZoneStep）都要清空；
       只清分组不清阶梯时，拖过的分界线会一直保持调节状态（用户实测：16 区 242.9/60m 不回位）。
       清空后走下方 tlAutoGenerate 重生成 ⇒ 分界线回到二级共享网格标准位置，静默保存同步落盘 zoneStep:null。 */
    if (typeof window !== 'undefined') {
      window.tlManualGroups = [];
      try { if (typeof tlZoneStepClear === 'function') tlZoneStepClear(); } catch(e){}
      try { if (window.tlDiagramData && window.tlDiagramData.zones) { window.tlDiagramData.zones.cutOffX = null; window.tlDiagramData.zones.cutOffY = null; } } catch(e){}
      try { if (window.tlPersistManualGroups) window.tlPersistManualGroups(); } catch(e){}
    }
    tlUpdatePlanBar();
    /* 2026-09-16：联合灌溉区数 N 改变 → 联合灌溉分组色带同步。
       分组色带画在「三级简图」源头（本生成器），而工作区底图 = 简图克隆，
       故 N 变必须重生成简图，两处色带才能同步；未生成过简图（无 polygon）时仅刷新图例。 */
    if (window.tlDiagramData) {
      window.tlDiagramData.combinedN = tlGetZoneCount();
      if (document.querySelector('#tlDiagramContent svg') && window.measuredPolygon && window.measuredPolygon.length >= 3) {
        try { tlAutoGenerate(); } catch (e) {}
      } else {
        var _wsc = document.getElementById('tlWsContent');
        /* [v1030] 原「统计表显隐先定」调用随统计表整套删除，工具轨同步与画布渲染保留。 */
        try { tlWsBarSync(); } catch (e) { }
        if (_wsc && _wsc.offsetParent !== null && window.RyTlWs) window.RyTlWs.render(_wsc, window.tlDiagramData);
      }
      tlRefreshGroupLegend();   /* 图例已于第五十九轮取消（空操作；保留以便恢复） */
    }
  });
});
/* [2026-10-27] v98 手动分区成组整链已取消（面板 #tlGroupPanel + tlRefreshGroupPanel /
   面板接线 IIFE 均删）；分区只按「预设 1/2/3/4 区 + 面积亩组合 tlGroupByArea」两条原则执行。
   原工具轨「✎分区成组 / ✓成组 / ↺自动均分」三按钮更早已移除（避免两套入口混淆）。 */
// Plan bar inputs
/* 2026-09-16 面板「总管长度」输入已取消：其 input/change 两个监听一并删除（元素不存在
   会 getElementById→null→TypeError 中断整段脚本，见删除控件的守卫纪律） */
/* [v517] 三级「目标流速」输入已取消，实时联动迁到二级 #planTargetV（沿用原「改动即重算」体验）。
   守卫纪律：元素可能不存在（接管页/测试沙箱），必须判空，不得裸 getElementById().addEventListener */
(function () {
  var tvSrc = document.getElementById('planTargetV');
  if (!tvSrc) return;
  tvSrc.addEventListener('input', tlUpdatePlanBar);
  tvSrc.addEventListener('change', tlUpdatePlanBar);
})();

// ===== Scroll Reveal =====
function initScrollReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.pipe-table-card, .network-card, .check-card, .materials-card, .method-note>div').forEach(el => {
    el.classList.add('sr');
    observer.observe(el);
  });
}

// ===== Button Ripple =====
document.addEventListener('click', function(e) {
  const btn = e.target.closest('.ghost-button, .text-button, .branch-option');
  if (!btn) return;
  const ring = document.createElement('span');
  ring.className = 'ripple-ring';
  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  ring.style.width = ring.style.height = size + 'px';
  ring.style.left = (e.clientX - rect.left - size/2) + 'px';
  ring.style.top = (e.clientY - rect.top - size/2) + 'px';
  btn.appendChild(ring);
  ring.addEventListener('animationend', () => ring.remove());
});

// ===== Brand pulse on load =====
(function brandPulse() {
  const mark = document.querySelector('.brand-mark');
  if (mark) {
    mark.style.animation = 'gentlePulse 3s ease-in-out 1';
    mark.addEventListener('animationend', () => { mark.style.animation = ''; });
  }
})();

// ===== Re-init scroll reveal after render =====
const origRender = render;
render = function() {
  origRender();
  updateMaterialTotals();
  setTimeout(initScrollReveal, 50);
};

// delegated listener for price inputs — survives re-renders
document.addEventListener('input', function(e) {
  if (e.target.classList.contains('price-input') ||
      e.target.classList.contains('custom-name') ||
      e.target.classList.contains('custom-spec') ||
      e.target.classList.contains('custom-qty')) {
    updateMaterialTotals();
  }
});

/* v184（P5）：「↺ 按价目表重取」—— 清掉管材三行的人工覆盖，回到按图面管径自动取价。
   就地更新输入框（不整体 render()），避免打断用户正在编辑的其它单元格。
   ⚠ 单价的「写入」只在 updateMaterialTotals 里发生（唯一写入点）；这里只清覆盖 + 回填值，
     不另写 priceF —— v184 首版在这里（以及 change 事件里）各写一次，与 updateMaterialTotals
     末尾的清理逻辑互相打架，导致手改永远存不下来。 */
document.addEventListener('click', function (e) {
  const t = e.target;
  if (!t.classList || !t.classList.contains('mat-price-resync')) return;
  e.preventDefault();
  matTbl.priceF = matTbl.priceF || {};
  Object.keys(matTbl.priceF||{}).forEach(function(k){if(RyMaterialAudit.pipeKey(k))delete matTbl.priceF[k];});
  matTblSave();
  document.querySelectorAll('.materials-card tbody tr[data-key]').forEach(function (tr) {
    const k = tr.dataset.key;
    if (!RyMaterialAudit.pipeKey(k)) return;
    const inp = tr.querySelector('.price-input');
    const ref = tlPipePriceByOd(tr.dataset.od);
    if (inp && ref !== '') { inp.value = ref; materialPrices[k] = ref; }
  });
  updateMaterialTotals();
});

// 首笔计算等待 native 桥接就绪：确保浏览器端真正走 C++（inner/hazen/velocity/local/christiansen），
// 而不在一加载就 JS 回退。ready 必然 resolve（成功=cpp-wasm，失败=JS 回退），不会卡白屏；
// 若桥接脚本未加载，window.RyHydraulicNative 为空，则立即渲染（等价原行为）。
(function(){
  var ry = (typeof window !== 'undefined' && window.RyHydraulicNative) || null;
  var ready = (ry && ry.ready) ? ry.ready : Promise.resolve();
  Promise.resolve(ready).then(function(){ if (typeof render === 'function') render(); });
})();
