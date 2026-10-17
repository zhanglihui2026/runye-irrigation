
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
/* ===== 分区实际面积与联合分组统计（2026-09-21 v95，L2/L3 共用同一口径）=====
   cuts = {xPos,yPos,xPlan,yPlan,cols,rows}（米制网格，含手动拖拽割缝）；
   poly = 实测地块多边形点（与 cuts 同坐标系，通常 window.measuredPolygon）；n = 联合分区数。
   分区序号 zi = zr*cols + zc（行主序，与图面 data-zi / 区号 (zi+1) 一致）；
   组号 g = floor(zi / n)（与图面联合灌溉色带同规则），尾组不足 n 个区按实际参与比较。
   返回 { ok, cells[m²], maxCell, maxCellIndex, groups[{g,sum,zones[]}], maxGroup, maxGroupIndex, groupCount } */
function ryZoneAreaGroups(cuts, poly, n) { return window.RyZoneGeometry.zoneAreaGroups(cuts, poly, n); }

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

function calcZoneLayout(width, height, requestedN) {
  return window.RyZoneGeometry.autoZoneLayout(width, height, requestedN, planZoneFixedSide());
}

function splitZoneLength(total, step) {
  return window.RyZoneGeometry.splitZoneLength(total, step, MAX_MANUAL_ZONE_COUNT);
}

function calcManualZoneLayout(width, height, manualMu) {
  return window.RyZoneGeometry.manualZoneLayout(width, height, manualMu,
    planZoneFixedSide(), MU_TO_SQM, MAX_MANUAL_ZONE_COUNT);
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
      calcManualZoneLayout(width, height, v);
      window.__manualZoneLayoutWarning = null;
    } catch (err) {
      if (!err || err.code !== 'manual_zone_count_exceeded') throw err;
      window.__manualZoneLayoutWarning = { requestedMu: v, maxCount: MAX_MANUAL_ZONE_COUNT };
      return 0;
    }
  }
  return v;
}

function calcPlanZoneLayout(width, height, requestedN, manualMu) {
  return manualMu > 0 ? calcManualZoneLayout(width, height, manualMu) : calcZoneLayout(width, height, requestedN);
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
   改为管径选择按钮（设计值±3档）。选中后经 computeThreeLevel 实时重算扬程/流速/功率。 ===== */
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
function tlRefreshCalSels(r, rDes) {
  if (!r || !r.frontPipe || !rDes || !rDes.frontPipe) return;
  var sels = [
    { sel: 'tlCalSelFront', des: rDes.frontPipe.od, cur: r.frontPipe.od },
    { sel: 'tlCalSelMain', des: rDes.mainPipe.od, cur: r.mainPipe.od },
    { sel: 'tlCalSelBranch', des: rDes.branchPipe.od, cur: r.branchPipe.od }
  ];
  tlBindCalSels();
  sels.forEach(function (s) {
    var el = document.getElementById(s.sel); if (!el) return;
    var centerIdx = PE_OD_SERIES.indexOf(s.des);
    if (centerIdx < 0) { var best = 0, bd = Infinity; for (var i = 0; i < PE_OD_SERIES.length; i++) { var d = Math.abs(PE_OD_SERIES[i] - s.des); if (d < bd) { bd = d; best = i; } } centerIdx = best; }
    var lo = Math.max(0, centerIdx - 3), hi = Math.min(PE_OD_SERIES.length - 1, centerIdx + 3);
    var opts = PE_OD_SERIES.slice(lo, hi + 1);
    if (isFinite(s.cur) && opts.indexOf(s.cur) < 0 && PE_OD_SERIES.indexOf(s.cur) >= 0) { opts = opts.concat([s.cur]); opts.sort(function (a, b) { return a - b; }); }
    el.innerHTML = opts.map(function (od) { return '<option value="' + od + '">Ø ' + od + '</option>'; }).join('');
    el.setAttribute('data-design', s.des);
    var chosen = isFinite(s.cur) ? s.cur : s.des;
    el.value = (opts.indexOf(chosen) >= 0) ? chosen : s.des;
  });
}
/* 选择按钮 change 事件绑定（仅绑定一次）。选回设计值即清除该档覆盖。 */
function tlBindCalSels() {
  if (window._tlCalSelBound) return; window._tlCalSelBound = true;
  [['front', 'tlCalSelFront'], ['main', 'tlCalSelMain'], ['branch', 'tlCalSelBranch']].forEach(function (p) {
    var el = document.getElementById(p[1]); if (!el) return;
    el.addEventListener('change', function () {
      var design = Number(el.getAttribute('data-design'));
      var val = Number(el.value);
      if (!window.tlManualCals) window.tlManualCals = { front: null, main: null, branch: null };
      window.tlManualCals[p[0]] = (val === design) ? null : val;
      tlBuildPipeOverride();
      if (typeof tlUpdatePlanBar === 'function') tlUpdatePlanBar();
      if (typeof window.tlSyncHydDesignSnapshot === 'function') window.tlSyncHydDesignSnapshot();
    });
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

// ===== COMPUTE =====
function compute() {
  const zoneMuInput = readNumber('fld_zoneMu', 30, { min: 0.1 });
  const fixedSideInput = readNumber('fld_zoneFixedSide', MAX_ZONE_SIDE, { min: 1 });
  const fixedSide = Math.min(MAX_ZONE_SIDE, Math.max(1, fixedSideInput));
  document.getElementById('fld_zoneFixedSide').value = fixedSide;
  const maxZoneAreaM2 = fixedSide * MAX_ZONE_SIDE;
  const zoneAreaM2 = Math.min(zoneMuInput * MU_TO_SQM, maxZoneAreaM2);
  const zoneMu = zoneAreaM2 / MU_TO_SQM;
  const zoneMuField = document.getElementById('fld_zoneMu');
  const zoneMuProxyActive = document.activeElement && document.activeElement.matches && document.activeElement.matches('sl-input[data-ry-proxy-for="fld_zoneMu"]');
  if (document.activeElement !== zoneMuField && !zoneMuProxyActive) zoneMuField.value = fmt(zoneMu, 2);
  const derivedSide = Math.min(MAX_ZONE_SIDE, Math.max(1, zoneAreaM2 / fixedSide));
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
  const mainPipeLen = readNumber('fld_mainPipeLen', A, { min: 0 });
  const tapeRollLen = readNumber('fld_tapeRollLen', 2000, { min: 0 });

  const totalArea = zoneAreaM2;
  const totalMu = zoneMu;
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

  const branchFlow = zoneFlow / branchCount;
  // 支管长度按垂直于滴灌带的分区跨度折算；滴灌带分段只影响接头数量，不应放大支管长度。
  const branchSpan = B;
  const branchLen = branchSpan / (branchCount * layoutSides);
  const tapsPerBranch = Math.ceil(tapesPerZone / branchCount);
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
    const bf = zoneFlow / n;
    const bl = branchSpan / (n * layoutSides);
    const bt = Math.ceil(tapesPerZone / n);
    const bfVal = christiansenF(bt);
    const bp = selectPipe(bf, targetV, 0, BRANCH_PIPE_MAX_OD);
    const blRaw = hazenWilliams(bl, bf, bp.id);
    const blVal = blRaw * bfVal;
    return { n, flow: bf, len: bl, taps: bt, pipe: bp, loss: blVal };
  });

  return {
    A, B, dh, N, zoneCols: zoneLayout.cols, zoneRows: zoneLayout.rows, zoneW: zoneLayout.zoneW, zoneH: zoneLayout.zoneH,
    tapeLen, tapeSpacing, tapeDh, emitterSpacing, emitterFlow, tapeOD, tapePressure,
    lift, existPressure, targetV, filterLoss, efficiency, branchCount, mainPipeLen,
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

// material prices persist across re-renders

function render() {
  const r = compute();
  window._r = r;

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
        <strong>主管 Ø ${r.mainPipe.od} mm · 每区 ${r.branchCount} 根支管 Ø ${r.branchPipe.od} mm</strong>
      </div>
      <div class="optimal-specs">
        <span>目标流速<b>${fmt(r.targetV,2)} m/s</b><small class="spec-note">主管按单区流量选型；阀门后的支管按 2、3 或 4 根并联分流。</small></span>
        <span>主管实际流速<b>${fmt(r.mainPipe.v,2)} m/s</b><small class="spec-note">理论内径 ${fmt(r.mainPipe.id,1)} mm · 主管长 ${fmt(r.mainPipeLen,1)} m · 损失 ${fmt(r.mainLoss,2)} m</small></span>
        <span>支管实际流速<b>${fmt(r.branchPipe.v,2)} m/s</b><small class="spec-note">每区 ${r.branchCount} 根 · 单根 ${fmt(r.branchLen,1)} m · ${fmt(r.branchFlow,2)} m³/h · 损失 ${fmt(r.branchLoss,2)} m</small></span>
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
            <small>每区 ${r.branchCount} 根 · 单根 ${fmt(r.branchLen,1)} m · ${fmt(r.branchFlow,2)} m³/h · 损失 ${fmt(r.branchLoss,2)} m</small>
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
          <strong>${alt.n} 根</strong>
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
        ${renderTable('支管管径选型对比', `当前 ${r.branchCount} 根/区 · 单根长 ${fmt(r.branchLen,1)} m · 单根流量 ${fmt(r.branchFlow,2)} m³/h · F=${fmt(r.branchF,4)}`, 'branch', r.branchAll, r.branchPipe.od, r.branchLen)}
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
          ${Array.from({length: r.branchCount}, () => `<div class="zone-branch"></div>`).join('')}
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
          <div><span>支管</span><strong>${r.branchCount * r.N} 根</strong><small>每区 ${r.branchCount} 根 · 单根 ${fmt(r.branchLen,1)} m</small></div>
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
  const matFrontLen = ((tlMat && tlMat.lens && isFinite(tlMat.lens.front)) ? tlMat.lens.front : (r.mainPipeLen || 0)) + readNumber('planSrcDist', 0, { min: 0 });   /* 任务⑮：计入水源距离 */
  const matMainLen = useTl ? tlMat.lens.main : (usePP ? ppStats.mainLen : r.mainPipeLen);
  const matBranchLen = useTl ? tlMat.lens.branch : (usePP ? ppStats.branchLen : r.branchLen * r.branchCount * r.N);
  const specFrontOd = tlMat ? tlMat.ods.front : materialPipeSpecs.mainPipeOD;
  const specMainOd = useTl ? tlMat.ods.main : materialPipeSpecs.mainPipeOD;
  const specBranchOd = useTl ? tlMat.ods.branch : materialPipeSpecs.branchPipeOD;
  const zoneValveN = tlMainsAll > 0 ? tlMains : r.N;   /* v162：判据用图上总段数、取值用未遮蔽段数 */
  /* [v556] 最外一排（789 / 28/29/30 区）主管末端改 90°弯头：
     该处**不再用分区三通** ⇒ 分区三通 = zoneValveN − 末端弯头数；新增一行「主管末端 90°弯头」。
     计数取自三级图面快照的阀门标记 v.elbow（生成时随阀门一起落地，见 v556 生成段），
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
  const matTotalMu = window.measuredArea ? window.measuredArea / 666.67 : (r.totalMu || (r.zoneMu * r.N) || 0);
  // 滴灌带：总面积(m²) ÷ 滴灌带间距(m)；面积优先施工简图实测面积、回退设计面积；间距优先施工简图输入、回退设计参数
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
  var rrMat=computeThreeLevel(),pipeBuckets=useTl?RyMaterialAudit.buckets(window.tlDiagramData,rrMat,window.RyTlAutoEdits,window.tlIsPipeHidden,window.tlFrontVisibleRatio(),window.RyTlEditPipes?window.RyTlEditPipes.list():[]):null;
  if(pipeBuckets){var extraSrc=readNumber('planSrcDist',0,{min:0});if(extraSrc>0){var srcBucket=pipeBuckets.front.find(q=>q.od===rrMat.frontPipe.od);if(!srcBucket){srcBucket={od:rrMat.frontPipe.od,len:0};pipeBuckets.front.push(srcBucket);}srcBucket.len+=extraSrc;}}
  try {
    if (window.RyTlNodes && typeof window.RyTlNodes.list === 'function') {
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
    /* [v556 修 bug] 原写法 `autoFits?autoFits[key]:[...]`：存档里存在 autoFits 但没有
       「新增管件」这个 key 时（v556 新加的 mainEndElbow 就属于这种情况）list 变 undefined，
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
/* 最远分区最不利路径（2026-09-16 用户要求）：
   水头损失只按「水源 → 最远分区」一条路径计：总管（水源→该区接水点）+ 该区主管 + 该区支管；
   不把各地块的支管/主管全部相加。图面已生成时，长度取图面真实折线（含图面改长/平移，走 AE.effPts）；
   无图面数据时返回 fromFigure:false，由调用方退回试算输入值。
   本函数只解析「长度与分区号」，损失仍由 computeThreeLevel 按既有流量口径计算。 */
function tlWorstPathLen(needGeom) {
  var EMPTY = { fromFigure: false, zoneIndex: -1, front: 0, main: 0, branch: 0, taps: [] };
  try {
    var d = window.tlDiagramData;
    if (!d || !d.frontPipe || d.frontPipe.length < 2 || !d.mainPipes || !d.mainPipes.length) return EMPTY;
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
      var bl = (zi < branchLens.length) ? branchLens[zi] : 0;        /* 简图按分区顺序 1:1 生成；无对应则回退计算式 */
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
  } catch (e) {
    return EMPTY;
  }
}

/* 三级方案数据 → 水力计算器 自动推送（2026-09-19，用户要求）：
   地块绘制划分分区、生成三级管线图后，把管线计算相关数值（推荐管径、图面实长、
   每根支管设计流量）直接导入水力计算器，用户零输入。
   口径 v2（2026-09-19 用户核对流量后确认）：全分区联合 —— trunk=总管段(水源→最远区接点)、
   mains=每个分区一根主管（各区图面实长）+ 各 branchCount 根支管；
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
    var bc = Math.max(1, r.branchCount | 0);
    /* v2.1（2026-09-19 用户核对流量）+ v95（2026-09-21 用户口径）：联合灌溉 = 全图轮灌中同时只开 tl_zoneCount 区
       （面板「联合灌溉分区数」）；总管流量 = 该 N 下「最大联合组的实际面积和」换算的 combinedFlow
       （v95 起不再按「单区流量 × N」估算；组号 = floor(分区序号 / N)，尾组按实际区数参与比较）。
       故计算器只导入 zoneCount 根主管：
       按距水源弧长取最远的 zoneCount 区（最不利组合，与图面最不利路径标注同源），每根挂 branchCount 根支管。 */
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
      '总管：OD ' + r.frontPipe.od + ' · ' + fmt(r.frontLenUsed, 1) + ' m',
      '主管：OD ' + r.mainPipe.od + ' × ' + zones.length + ' 区' + (allZones.length > zones.length ? '（全图 ' + allZones.length + ' 区轮灌，按最不利组合取最远 ' + zones.length + ' 区）' : '（各区图面实长）') + ',',
      '支管：OD ' + r.branchPipe.od + ' · ' + fmt(r.branchLenUsed, 1) + ' m × 每区 ' + bc + ' 根（每根 ' + fmt(r.branchFlow, 1) + ' m³/h）',
      '联合流量：' + fmt(r.combinedFlow, 1) + ' m³/h（' + (r.zoneCount | 0 || 1) + ' 区联合' + (r.worstGroup
        ? ' · 最大联合组 第 ' + (r.worstGroup.g + 1) + ' 组 ' + r.worstGroup.zones.map(function (z) { return (z + 1) + '区'; }).join('、') + ' 的面积和'
        : ' · 估算 ' + fmt(r.zoneFlow, 1) + ' × ' + (r.zoneCount | 0 || 1)) + '）——计算器总管流量同此值'
    ];
    HC.importThreeLevel({ trunk: { od: r.frontPipe.od, len: r.frontLenUsed }, mains: mains, srcTitle: srcTitle, srcRows: srcRows });
    return true;
  } catch (e) { return false; }
}

/* ---- 最不利路径图面标注（2026-09-17 第四十七轮，用户要求）----
   「水路走得最远的那条路径」= 水源 → 最远分区：总管（只走水源到该区接点那一段）+ 该区主管；
   支管不标（用户明确）。与水泵扬程同源：标出的长度 = 扬程采用的总管 + 主管。
   视觉：紫色（#a855f7）宽光晕 + 深紫虚线走线 + 末端圆点 + 「最远 N 区 · 123.4 m」标签
   （紫/深紫与既有橙(总管)/蓝(主管)/绿(支管)/青(滴灌带)/琥珀(水源)/红(阀门) 均不撞色）。
   ts(x,y) → 图面坐标：简图 ts 与工作区 T 同坐标系（工作区底图是简图 SVG 的克隆），两处共用本函数。 */
function tlWorstPathMarkSVG(ts) {
  var wp = (typeof tlWorstPathLen === 'function') ? tlWorstPathLen(true) : null;
  if (!wp || !wp.fromFigure || !wp.geom) return '';
  var g = wp.geom;
  function d(pts) {
    var s = '';
    for (var i = 0; i < pts.length; i++) {
      var p = ts(pts[i].x, pts[i].y);
      s += (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ' ';
    }
    return s;
  }
  var dF = d(g.frontPts);
  var dL = (g.linkPts && g.linkPts.length > 1) ? d(g.linkPts) : '';
  var dM = d(g.mainPts);
  var out = [];
  out.push('<g data-tlworst="1" fill="none" stroke-linecap="round" stroke-linejoin="round" pointer-events="none">');
  out.push('<path d="' + dF + '" stroke="#a855f7" stroke-opacity="0.40" stroke-width="13"/>');
  if (dL) out.push('<path d="' + dL + '" stroke="#a855f7" stroke-opacity="0.40" stroke-width="13"/>');
  out.push('<path d="' + dM + '" stroke="#a855f7" stroke-opacity="0.40" stroke-width="12"/>');
  /* v26：虚线改水流动画（用户要求，观感同过滤器反冲水流 fs-flow）——dasharray/动画由 .tl-worst-flow 类提供，
     保留紫色系与光晕底衬（紫色仍是「最远水路」的识别色，动画只让水「流」起来） */
  out.push('<path d="' + dF + '" class="tl-worst-flow" stroke="#7e22ce" stroke-width="1.8"/>');
  if (dL) out.push('<path d="' + dL + '" class="tl-worst-flow" stroke="#7e22ce" stroke-width="1.8"/>');
  out.push('<path d="' + dM + '" class="tl-worst-flow" stroke="#7e22ce" stroke-width="1.8"/>');
  var e = ts(g.endPt.x, g.endPt.y);
  out.push('<circle cx="' + e.x.toFixed(1) + '" cy="' + e.y.toFixed(1) + '" r="6" fill="#fff" stroke="#7e22ce" stroke-width="2.5"/>');
  out.push('<text x="' + (e.x + 11).toFixed(1) + '" y="' + (e.y - 9).toFixed(1) + '" font-size="11" font-weight="700" '
    + 'fill="#6b21a8" stroke="#fff" stroke-width="3.2" paint-order="stroke" stroke-linejoin="round">'
    + '最远 ' + (wp.zoneIndex + 1) + ' 区 · ' + (Math.round(g.len * 10) / 10).toFixed(1) + ' m</text>');
  out.push('</g>');
  var svg = out.join('');
  /* 守卫：几何退化（数据带 NaN / 变换未就绪）时整组不画 —— 否则会往 SVG 里写
     d="MNaN NaN …"、cx="NaN"，浏览器每条都报 "attribute d: Expected number" 页面错误。 */
  if (svg.indexOf('NaN') >= 0) return '';
  return svg;
}

/* ---- 最远水路标注 显示开关（2026-09-17 第五十四轮，用户要求）----
   用户：「最远水路那个颜色线，…在合适的位置增加一个按钮，点击显示，再点击关闭显示。」
   状态只用一个 body 类（ry-worst-off）表达，标注本身**照常渲染**（不因开关而少画）：
   于是「再点一次显示」永远能立刻恢复，也不怕隐藏期间发生的重渲染把状态弄丢。
   简图（#tlDiagramContent）与三级工作区（#tlWsContent）两份标注共用一个开关（同一功能）。
   按钮标签写「动作」（显示中 → 关闭 / 已隐藏 → 显示），并配 .active 底色表明当前是否显示。 */
var tlWorstPathOn = true;
function tlWorstPathToggle() {
  tlWorstPathOn = !tlWorstPathOn;
  if (document.body) document.body.classList.toggle('ry-worst-off', !tlWorstPathOn);
  /* 2026-09-28：右侧工具轨按钮取消，改同步做图区右上角勾选框（程序赋值不触发 change，无死循环） */
  var chk = document.getElementById('tlWsWorstChk');
  if (chk) {
    chk.checked = tlWorstPathOn;
    /* 勾选文字恒为「最远水路」，不随显隐切换（2026-09-28 用户：文字不变） */
  }
  return tlWorstPathOn;
}
window.tlWorstPathToggle = tlWorstPathToggle;
/* 状态读取器（供 e2e / 调试）：**必须换个名字** —— 顶层 var 本身就是 window 属性，
   若用同名的 window.tlWorstPathOn 赋值，会把布尔状态替换成函数，开关首击就算错。 */
window.tlWorstPathIsOn = function () { return tlWorstPathOn; };

function computeThreeLevel() {
  const zoneMuInput = readNumber('tl_zoneMu', 30, { min: 0.1 });
  const fixedSideInput = readNumber('tl_zoneFixedSide', 300, { min: 1 });
  const fixedSide = Math.max(1, fixedSideInput);  // no MAX_ZONE_SIDE cap
  const zoneAreaM2 = Math.max(0.1, zoneMuInput) * MU_TO_SQM;
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
  const mainPipeLen = readNumber('tl_mainPipeLen', A, { min: 0 });
  const tapeRollLen = readNumber('tl_tapeRollLen', 2000, { min: 0 });

  // ===== Multi-zone combined irrigation =====
  const zoneCount = Math.max(1, readNumber('tl_zoneCount', 1, { integer: true }));
  const frontPipeLen = readNumber('tl_frontPipeLen', 0, { min: 0 });

  /* 最远分区最不利路径（2026-09-16）：图面已生成时，总管/主管/支管长度改用图面到「最远分区」的
     实际折线长，损失只算这一条路径（不再按各地块累加）。无图面时退回试算输入值。 */
  const wp = (typeof tlWorstPathLen === 'function') ? tlWorstPathLen() : { fromFigure: false, zoneIndex: -1, front: 0, main: 0, branch: 0, taps: [] };
  let frontLenUsed = ((wp.fromFigure && wp.front > 0) ? wp.front : frontPipeLen) + readNumber('planSrcDist', 0, { min: 0 });   /* 任务⑮：计入水源距离 */
  let mainLenUsed = (wp.fromFigure && wp.main > 0) ? wp.main : mainPipeLen;

  /* 水泵流量按「最大分区的实际面积」计（2026-09-21，用户口径）：分区实际面积=裁剪到实测地块
     多边形的面积；取全部分区的最大者作为单区流量基准，联合流量=最大分区流量×联合分区数（最不利）。
     二级共享网格（RunyeBridge.getZoneCuts，含拖拽割缝）+实测多边形存在时生效；
     无网格/多边形或取数异常时退回「单个分区面积」输入值（flowAreaSrc='input'）。 */
  /* v95：一次算全图分区实际面积 + 按联合分区数自动分组（组号 = floor(分区序号 / N)），
     单区侧取 maxCell（最大分区实际面积），联合侧取 maxGroup（最大组的面积和）。 */
  var tlGrid = (function () {
    try {
      var share = window.RunyeBridge ? window.RunyeBridge.getZoneCuts() : null;
      var poly = window.measuredPolygon;
      if (!share || !share.cols || !share.rows || !share.xPos || !share.yPos) return null;
      if (!poly || poly.length < 3) return null;
      /* v98h：三级流量 / 面积口径必须和三级图面看到的一致 ⇒ 把阶梯覆盖表挂到共享网格上
         （ryZoneAreaGroups 认得 cutOffX / cutOffY；空表时与改动前逐位相同）。 */
      var _st = tlZoneStepFor(share); if (_st) { share.cutOffX = _st.x; share.cutOffY = _st.y; }
      return { share: share, poly: poly };
    } catch (e) { return null; }
  })();
  var zoneStat = null;
  if (tlGrid) {
    var gs = ryZoneAreaGroups(tlGrid.share, tlGrid.poly, zoneCount);
    if (gs && gs.ok && gs.maxCell > 0) zoneStat = gs;
  }
  var flowAreaM2 = zoneStat ? zoneStat.maxCell : zoneAreaM2;
  var flowAreaSrc = zoneStat ? 'figureMaxZone' : 'input';
  const flowZoneMu = flowAreaM2 / MU_TO_SQM;

  const totalArea = zoneAreaM2;
  const totalMu = zoneMu;
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
    var tlCells = zoneStat ? zoneStat.cells : [];
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
  const combinedAreaM2 = tlGroupSource === 'manual'
    ? Math.max(tlManualWorstM2, tlMaxUngroupedM2, (tlManualWorstM2 > 0 || tlMaxUngroupedM2 > 0) ? 0 : (flowAreaM2 * zoneCount))
    : ((zoneStat && zoneStat.maxGroup > 0) ? zoneStat.maxGroup : (flowAreaM2 * zoneCount));
  const combinedFlow = combinedAreaM2 / tapeSpacing / emitterSpacing * emitterFlow / 1000;

  /* v95：对比表「不同联合分区数」逐档口径 —— 每一档 N 都按「该 N 下最大组的实际面积和」算流量
     （与 combinedFlow 同一 ryZoneAreaGroups 口径，故 groupAreaByN[zoneCount].flow === combinedFlow）；
     无图面网格/多边形时逐档退回「单区流量 × N」的初步估算。 */
  var groupAreaByN = {};
  (function () {
    var ns = [1, 2, 3, 4, 6, 8, zoneCount];
    for (var ni = 0; ni < ns.length; ni++) {
      var key = Math.max(1, Math.round(ns[ni]));
      if (groupAreaByN[key]) continue;
      var g = tlGrid ? ryZoneAreaGroups(tlGrid.share, tlGrid.poly, key) : null;
      var areaN = (g && g.ok && g.maxGroup > 0) ? g.maxGroup : (flowAreaM2 * key);
      groupAreaByN[key] = { areaM2: areaN, flow: areaN / tapeSpacing / emitterSpacing * emitterFlow / 1000 };
    }
  })();
  const frontPipe = selectPipe(combinedFlow, targetV, MAIN_PIPE_MIN_OD);
  let frontPipeLoss = hazenWilliams(frontLenUsed, combinedFlow, frontPipe.id);

  const branchFlow = zoneFlow / branchCount;
  const branchSpan = B;
  const branchLen = branchSpan / (branchCount * layoutSides);
  let branchLenUsed = (wp.fromFigure && wp.branch > 0) ? wp.branch : branchLen;
  const tapsPerBranch = Math.ceil(tapesPerZone / branchCount);
  const branchF = christiansenF(tapsPerBranch);
  const branchPipe = selectPipe(branchFlow, targetV, 0, BRANCH_PIPE_MAX_OD);
  const branchLossRaw = hazenWilliams(branchLenUsed, branchFlow, branchPipe.id);
  let branchLoss = branchLossRaw * branchF;

  // 显式应用图面管径后：分别校核每个轮灌组，总管按取水点分段累加。
  // 支管沿用现有均分流量及 Christiansen 折减规则。
  var hydraulicPath = null;
  var appliedPipes = tlAppliedPipeOverride();
  /* 有图面路径时，设计管径和手动改径都使用同一套逐路径损失模型；
     否则“设计值”和“改径值”来自不同算法，不能直接比较。 */
  var groupLoss = null;
  if (wp.fromFigure && wp.zones && window.RyPipePathLoss) {
    var pathZones = wp.zones.map(function (z) {
      var area = zoneStat ? (zoneStat.cells[z.zi] || 0) : flowAreaM2;
      return { zi: z.zi, run: z.run, main: z.main, branch: z.branch > 0 ? z.branch : branchLen,
        flow: area / tapeSpacing / emitterSpacing * emitterFlow / 1000 };
    });
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
      branchCount: branchCount, branchF: branchF, innerDiam: peInnerDiam, hazen: hazenWilliams });
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
      frontLenUsed = hydraulicPath.front + readNumber('planSrcDist', 0, { min: 0 }); mainLenUsed = hydraulicPath.main; branchLenUsed = hydraulicPath.branch;   /* 任务⑮：计入水源距离 */
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
    const bf = zoneFlow / n;
    const bl = branchSpan / (n * layoutSides);
    const bt = Math.ceil(tapesPerZone / n);
    const bfVal = christiansenF(bt);
    const bp = selectPipe(bf, targetV, 0, BRANCH_PIPE_MAX_OD);
    const blRaw = hazenWilliams(bl, bf, bp.id);
    const blVal = blRaw * bfVal;
    return { n, flow: bf, len: bl, taps: bt, pipe: bp, loss: blVal };
  });

  return {
    A, B, dh, N, zoneCols: zoneLayout.cols, zoneRows: zoneLayout.rows, zoneW: zoneLayout.zoneW, zoneH: zoneLayout.zoneH,
    tapeLen, tapeSpacing, tapeDh, emitterSpacing, emitterFlow, tapeOD, tapePressure,
    lift, existPressure, targetV, filterLoss, efficiency, branchCount, mainPipeLen: mainLenUsed,
    totalArea, totalMu, zoneMu,
    tapeRows, segmentsPerRow, totalTapes, tapesPerZone, tapeRollLen, tapeTotalLen, tapeRolls, zoneTapeLen,
    emittersPerTape, tapeFlow, zoneFlow,
    mainPipe, mainLoss,
    frontPipe, frontPipeLoss, frontPipeLen: frontLenUsed, zoneCount, combinedFlow, frontAll, frontAlternatives,
    branchPipe, branchLoss, branchFlow, branchLen: branchLenUsed, branchSpan, layoutSides, tapsPerBranch, branchF,
    /* 最远分区最不利路径（2026-09-16）：wp=来源与分区号，*LenUsed=各段实际采用长度（米） */
    wp, hydraulicPath, frontLenUsed, mainLenUsed, branchLenUsed,
    /* [v226] 逐组水头损失：groupLoss[g]={members:[分区号0基], zi:本组最不利分区, flow:组流量m³/h,
       front/main/branch:路径长度m, frontLoss/mainLoss/branchLoss/total:水头损失m}；无图面路径时 null */
    groupLoss,
    inversePath: (pathZones ? {zones: pathZones.filter(function(z){return z.flow>0;}).map(function(z){ return Object.assign({},z,{area:z.flow*tapeSpacing*emitterSpacing*1000/emitterFlow}); }), groups:pathGroups.map(function(g){return g.filter(function(id){return pathZones.some(function(z){return z.zi===id && z.flow>0;});});}).filter(function(g){return g.length>0;}), calibers:appliedPipes ? appliedPipes.calibers : null} : null),
    /* 流量口径（2026-09-21）：flowAreaM2=最大分区实际面积(m²)，flowAreaSrc='figureMaxZone'|'input' */
    flowAreaM2, flowZoneMu, flowAreaSrc,
    /* v95 联合分区：combinedAreaM2=最大一组实际面积和(m²)；worstGroup={g:组号(0基),zones:分区序号(0基),sum:m²}；
       无图面数据时 worstGroup=null、combinedAreaM2=flowAreaM2×zoneCount（初步估算） */
    combinedAreaM2, groupCount: (zoneStat ? zoneStat.groupCount : 0),
    /* v107（2026-09-22 修复）：手动分组存在时，worstGroup 取「手动组里面积最大的一组」（与 combinedFlow 同一口径），
       不再一律回退到 floor(zi/N) 自动配对组——否则「联合流量依据」会错显示成自动配对的第3、4区而误导。 */
    worstGroup: (tlGroupSource === 'manual')
      ? (tlManualWorstM2 >= tlMaxUngroupedM2
          ? { g: tlManualWorstG, zones: tlManualWorstZones, sum: tlManualWorstM2, count: tlManualWorstZones.length }
          : (tlMaxUngroupedZi >= 0 ? { g: tlMaxUngroupedZi, zones: [tlMaxUngroupedZi], sum: tlMaxUngroupedM2, count: 1 } : null))
      : ((zoneStat && zoneStat.maxGroup > 0)
          ? { g: zoneStat.maxGroupIndex, zones: zoneStat.groups[zoneStat.maxGroupIndex].zones.slice(), sum: zoneStat.maxGroup, count: zoneStat.groups[zoneStat.maxGroupIndex].zones.length }
          : null),
    /* v95：对比表逐档口径 —— key=N，value={areaM2:该 N 下最大组实际面积和(m²), flow:对应联合流量(m³/h)} */
    groupAreaByN,
    tapeID, tapeLoss, tapePressureM, tapeDeltaPct,
    totalPipeLoss, headBeforeSafetyRaw, headBeforeSafety, pumpHead, pumpPower, motorKW, motorKW_rounded,
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

function renderTLDerivation(r) {
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
      ${r.wp && r.wp.fromFigure ? '（图面实际几何 · 最远 ' + fmt0(r.wp.zoneIndex + 1) + ' 区）' : '（试算输入值；生成管线图后改用图面实际几何）'}
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
        <small>每区 ${r.branchCount} 根 · 单根 ${fmt(r.branchLen,1)} m · ${fmt(r.branchFlow,2)} m³/h · 损失 ${fmt(r.branchLoss,2)} m</small>
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
          <strong>${alt.n} 根</strong>
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
      <div><dt>支管方案</dt><dd>${r.branchCount} 根/区 · Ø ${r.branchPipe.od} mm · 损失 ${fmt(r.branchLoss,2)} m</dd></div>
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
      ${renderTLTable('支管管径选型对比', `${r.branchCount} 根/区 · 单根流量 ${fmt(r.branchFlow,2)} m³/h · F=${fmt(r.branchF,4)}`, r.branchFlow, r.branchAll, r.branchPipe.od, r.branchLen)}
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
  return btn ? parseInt(btn.dataset.n) : 2;
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
var tlDemoTimer = null, tlDemoIdx = 0;
/* [v504 2026-10-16 用户要求] 轮灌演示「切换时长」缩短：每组停留/轮播间隔 2000→1000ms。
   与 v501/v503 的动画时长是两件事——v501/v503 改的是「水流/阀门动画本身跑多快」，
   这里改的是「多久换下一组」。抽成具名常量，后续再调只动这一处。 */
var TL_DEMO_INTERVAL_MS = 1000;
function tlDemoGroupCount() {
  var total = tlGroupZoneCount(); if (!total) return 0;
  var mg = (window.tlManualGroups && window.tlManualGroups.length) ? window.tlManualGroups : null;
  if (mg) return mg.length;                                   /* 手动模式：只演示已合并的组（未分组区保持灰底） */
  return Math.max(1, Math.ceil(total / Math.max(1, tlGetZoneCount())));
}
/* 三级简图侧演示高亮：三态重涂（恢复=还原 data-fill+data-stroke 虚线；选中=加深+深描边；其余=淡化灰） */
function tlApplyDemoHighlight(g) {
  var svg = document.querySelector('#tlDiagramContent svg'); if (!svg) return;
  var hi = (window.RyTlWs && window.RyTlWs.groupFillHiCss) ? window.RyTlWs.groupFillHiCss : null;
  var rects = svg.querySelectorAll('rect[data-zi]');
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
  var sub = [fPts[0]];
  for (var k = 1; k <= tap.i; k++) sub.push(fPts[k]);
  if (tlFlowLen(sub[sub.length - 1], tap.q) > 0.5) sub.push(tap.q);
  var out = sub.concat([mp[0]]);                 /* 接入短管（总监→该区主管，一般是一小段斜线） */
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
    var rects = svg.querySelectorAll('rect[data-zi]');
    for (var i = 0; i < rects.length; i++) {
      if (parseInt(rects[i].getAttribute('data-g'), 10) === g) zis.push(parseInt(rects[i].getAttribute('data-zi'), 10));
    }
    if (!zis.length) return;
    var fEl = svg.querySelector('path[data-tlpipe="front"]:not([data-tlpipe-ref])') || svg.querySelector('path[data-tlpipe="front"]');
    if (!fEl) return;
    var fPts = tlFlowParseD(fEl.getAttribute('d'));
    if (fPts.length < 2) return;
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
    /* [v505] 必须挂进 #tlPlotGroup —— 否则不随「图面整体拖动」的 translate 平移，
       水流会与管道平行错开（病史同 v183 节点层 / v488 紫线标注）。无该组时退回 svg 根
       （老结构兼容；此时 svg 内也没有管线，属降级路径）。 */
    if (layer.childNodes.length) {
      var hostG = svg.querySelector('#tlPlotGroup') || svg;
      hostG.appendChild(layer);
    }
  } catch (eF) { }
}
window.tlDemoRenderFlow = tlDemoRenderFlow;
window.tlApplyDemoHighlight = tlApplyDemoHighlight;
/* chips 选中态/播放按钮文案同步（chips 内容重建后也靠它恢复状态） */
function tlDemoChipSync() {
  var box = document.getElementById('tlDemoChips'); if (!box) return;
  var cur = window.__tlDemoGroup;
  var bs = box.querySelectorAll('button[data-demo-g]');
  for (var i = 0; i < bs.length; i++) {
    var g = parseInt(bs[i].getAttribute('data-demo-g'), 10);
    /* [v461] 组 chips 已是圆形色点（class 由 tlRenderDemoChips 写入），
       此处只翻转选中态——不能整串覆写 className，否则会把 tl-demo-dot 抹掉 */
    if (bs[i].classList) bs[i].className = 'tl-demo-dot' + (cur === g ? ' selected' : '');
  }
  var pb = document.getElementById('tlDemoPlay');
  if (pb) pb.innerHTML = tlDemoTimer ? '⏸' : '▶';   /* [v465] 图标化：⏸=暂停中可接管 / ▶=轮播 */
  var eb = document.getElementById('tlDemoExit');
  if (eb) eb.disabled = (cur == null && !tlDemoTimer);
}
/* 重建 chips：分组（N/手动）一变就走这里 —— tlRefreshGroupStatus 与 tlAutoGenerate 都会调 */
function tlRenderDemoChips() {
  var bar = document.getElementById('tlDemoBar'), box = document.getElementById('tlDemoChips');
  if (!bar || !box) return;
  var M = tlDemoGroupCount();
  if (M <= 0) { bar.style.display = 'none'; box.innerHTML = ''; if (tlDemoTimer) tlDemoStop(); return; }
  bar.style.display = '';
  /* 越界守卫：重分组后组数变少 ⇒ 立刻退出演示，不指向不存在的组 */
  if (window.__tlDemoGroup != null && window.__tlDemoGroup >= M) { tlDemoStop(); return; }
  var manual = !!(window.tlManualGroups && window.tlManualGroups.length);
  /* [v461]（2026-10-15 用户要求）组 chips 改为「圆形填充色 + 阿拉伯数字」，替代「组N」文字。
     填充色与工作区分组色带同源（tl-workspace GROUP_FILLS 4 色循环：红/琥珀/绿/蓝）；
     第 2 轮循环起用浅色底+深色字，对应色带「循环降透明度」的同一视觉语言。
     手动分组时序号仍为 1..M（图面标注是 M{号}，tooltip 里说明对应关系）。 */
  var DOT_FILLS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6'];
  var DOT_FILLS_LT = ['#fca5a5', '#fcd34d', '#86efac', '#93c5fd'];
  var DOT_INKS = ['#fff', '#fff', '#fff', '#fff'];
  var DOT_INKS_LT = ['#7f1d1d', '#78350f', '#14532d', '#1e3a8a'];
  var h = '';
  for (var g = 0; g < M; g++) {
    var ci = g % DOT_FILLS.length, lite = g >= DOT_FILLS.length;
    h += '<button type="button" class="tl-demo-dot" data-demo-g="' + g + '"' +
      ' style="background:' + (lite ? DOT_FILLS_LT[ci] : DOT_FILLS[ci]) + ';color:' + (lite ? DOT_INKS_LT[ci] : DOT_INKS[ci]) + '"' +
      ' title="高亮第 ' + (g + 1) + ' 轮灌组（该组分区加深、其余淡化' + (manual ? '；对应图面 M' + (g + 1) : '') + '）">' + (g + 1) + '</button>';
  }
  /* [v465]（2026-10-15 用户要求）轮播/退出取消文字、只用图标：▶=轮播 / ⏸=暂停（轮播中）/ ■=退出；
     语义收进 title 与 aria-label。按钮尺寸收成图标方块（样式见 style-01.css .tl-demo-ctl）。 */
  h += '<button type="button" id="tlDemoPlay" class="tl-demo-ctl" aria-label="轮播" title="自动轮流高亮各组（1 秒一组），再点暂停">▶</button>';
  h += '<button type="button" id="tlDemoExit" class="tl-demo-ctl" aria-label="退出" title="退出演示，所有分区恢复原色">■</button>';
  box.innerHTML = h;
  tlDemoChipSync();
}
window.tlRenderDemoChips = tlRenderDemoChips;
/* 设置演示组（g=null 退出）；两视图同步重涂 */
function tlDemoSet(g) {
  window.__tlDemoGroup = (g == null ? null : g);
  window.tlGroupMode = false; window.tlPendingSel = [];    /* 与待选蓝高亮互斥（tlHi 优先会盖演示色） */
  if (window.RyTlWs && window.RyTlWs.setSelGroup) { try { window.RyTlWs.setSelGroup(g); } catch (e) { } }
  tlApplyDemoHighlight(g);
  tlDemoChipSync();
}
function tlDemoPlayToggle() {
  var M = tlDemoGroupCount(); if (M <= 0) return;
  if (tlDemoTimer) { clearInterval(tlDemoTimer); tlDemoTimer = null; tlDemoChipSync(); return; }
  tlDemoIdx = (window.__tlDemoGroup != null) ? window.__tlDemoGroup : -1;
  tlDemoIdx = (tlDemoIdx + 1) % M; tlDemoSet(tlDemoIdx);   /* 点下立即切组，不等一个间隔 */
  tlDemoTimer = setInterval(function () {
    var Mc = tlDemoGroupCount(); if (Mc <= 0) { tlDemoStop(); return; }   /* 重分组后组数变化兜底 */
    tlDemoIdx = (tlDemoIdx + 1) % Mc;
    tlDemoSet(tlDemoIdx);
  }, TL_DEMO_INTERVAL_MS);
  tlDemoChipSync();
}
function tlDemoStop() {
  if (tlDemoTimer) { clearInterval(tlDemoTimer); tlDemoTimer = null; }
  tlDemoSet(null);
}
/* chips 事件委托（chips 是动态重建的，只挂一次） */
(function () {
  var box = document.getElementById('tlDemoChips'); if (!box) return;
  box.addEventListener('click', function (e) {
    var t = e.target; if (!t || !t.closest) return;
    var gb = t.closest('[data-demo-g]');
    if (gb) {
      if (tlDemoTimer) { clearInterval(tlDemoTimer); tlDemoTimer = null; }   /* 手点组 = 接管，轮播暂停 */
      tlDemoSet(parseInt(gb.getAttribute('data-demo-g'), 10)); return;
    }
    if (t.closest('#tlDemoPlay')) { tlDemoPlayToggle(); return; }
    if (t.closest('#tlDemoExit')) { tlDemoStop(); return; }
  });
})();

window.tlRefreshGroupStatus = function () {
  /* [v216] 左栏「分组：自动… / 手动分组表格」文字行已按用户要求取消（明细看右侧面板）。
     ★ 本函数现在只剩一个职责：分组一变 → 轮灌演示 chips 重建。
     不能保留旧的 `if (!el) return;` —— status DOM 删掉后那行会让函数在 chips 重建
     之前就返回，演示行永远不出现（删 DOM 必须连带重审函数内所有提前返回）。 */
  if (typeof tlRenderDemoChips === 'function') { try { tlRenderDemoChips(); } catch (e) { } }
};
/* v98 手动分区成组（面板入口）：右侧「联合灌溉分组」面板列出全部分区，勾选 → 合并为一组。
   状态仍挂在 window.tlManualGroups（与画布着色 / 流量重算共用）。 */
function tlGroupZoneCount() {
  var d = (typeof window !== 'undefined') ? window.tlDiagramData : null;
  var z = d && d.zones; if (!z) return 0;
  var zc = z.cols || (z.xPos ? z.xPos.length - 1 : 0);
  var zr = z.rows || (z.yPos ? z.yPos.length - 1 : 0);
  return zc * zr;
}
window.tlRefreshGroupPanel = function () {
  var list = document.getElementById('tlGroupZoneList'); if (!list) return;
  var total = tlGroupZoneCount();
  var mg = (typeof window !== 'undefined') ? (window.tlManualGroups || []) : [];
  function grpOf(zi) { for (var g = 0; g < mg.length; g++) { if (mg[g] && mg[g].indexOf(zi) >= 0) return g; } return -1; }
  var zhtml = '';
  for (var zi = 0; zi < total; zi++) {
    var g = grpOf(zi); var inG = g >= 0;
    zhtml += '<label class="tl-gp-zone' + (inG ? ' in-group' : '') + '">' + '<input type="checkbox" data-zi="' + zi + '"' + (inG ? ' disabled' : '') + '>' + '<span>区 ' + (zi + 1) + (inG ? '（组' + (g + 1) + '）' : '') + '</span></label>';
  }
  list.innerHTML = zhtml || '<div class="tl-gp-empty">请先生成三级管线平面图</div>';
  var n = 0; var cbs = list.querySelectorAll('input[type=checkbox]'); for (var i = 0; i < cbs.length; i++) if (cbs[i].checked) n++;
  var mb = document.getElementById('tlGroupMergeBtn'); if (mb) mb.disabled = n < 2;
  var gl = document.getElementById('tlGroupList');
  if (gl) {
    if (!mg.length) { gl.innerHTML = '<div class="tl-gp-empty">尚无手动组（按 N 自动均分）</div>'; }
    else {
      /* v100：组列表直接给出该组的实际面积（亩）—— 与图上「M2 · 区3/4 / 32.4 亩」组级标注同源 */
      var glCells = null;
      try {
        var glShare = tlSteppedZoneCuts();   /* v100：与左栏/画布同源（并上阶梯覆盖表） */
        var glPoly = (typeof window !== 'undefined') ? window.measuredPolygon : null;
        if (glShare && glPoly && glPoly.length >= 3 && typeof ryZoneAreaGroups === 'function') {
          glCells = ryZoneAreaGroups(glShare, glPoly, glShare.cols * glShare.rows).cells;
        }
      } catch (e) { glCells = null; }
      var gh = '';
      for (var j = 0; j < mg.length; j++) {
        var gmu = '';
        if (glCells) { var gs2 = 0; for (var gk = 0; gk < mg[j].length; gk++) gs2 += (glCells[mg[j][gk]] || 0); gmu = ' <span class="tl-gp-mu">' + (gs2 / 666.67).toFixed(1) + ' 亩</span>'; }
        gh += '<div class="tl-gp-group"><span>M' + (j + 1) + '：区 ' + mg[j].map(function (z) { return z + 1; }).join('/') + gmu + '</span><button class="tl-gp-del" data-g="' + j + '" type="button" title="删除该组">✕</button></div>';
      }
      gl.innerHTML = gh;
    }
  }
  /* v106：分界线口径提示 —— 平行于主管的整条拖动、垂直于主管的分段拖（2026-09-22 用户口径，
     v100 的「平行轴锁定」作废；管向仍由图面主管/支管实测） */
  var dh = document.getElementById('tlGroupDragHint');
  if (dh) {
    var dhAx = (typeof window !== 'undefined' && window.RyTlWs && window.RyTlWs._v100) ? window.RyTlWs._v100.pipeAxis() : '';
    dh.textContent = '分界线：平行于主管的整条拖动、垂直于主管的分段拖 —— ' + (dhAx === 'v'
      ? '本图管向为「竖向」⇒ 竖分界线整条移动；横分界线可分段拖'
      : (dhAx === 'h'
        ? '本图管向为「水平」⇒ 横分界线整条移动；竖分界线可分段拖'
        : '未取到管向信息 ⇒ 当前不限制；生成图面后按管向自动区分'));
  }
};
function tlApplyGroups() {
  try { if (typeof window.runyeSaveProject === 'function') window.runyeSaveProject(true); } catch (e) { }   /* v105：静默保存（不弹「方案已保存到本机」） */
  /* v105：合并/删组后立即重生成图面（等效点「生成管线图」）—— 组色带、组标注、联合流量即时生效，
     不再需要手动点右侧工具栏「生成管线图」才变色。失败时走下面的轻量重渲染兜底。
     注意：tlAutoGenerate 不刷分组面板/左栏状态表，故不提前 return，保留原有刷新链。 */
  try { if (typeof tlAutoGenerate === 'function') { tlAutoGenerate({ scroll: false }); } } catch (e) { }
  try { if (typeof render === 'function') render(); } catch (e) { }
  var wsCtn = document.getElementById('tlWsContent');
  if (wsCtn && window.RyTlWs && window.tlDiagramData) { try { window.RyTlWs.render(wsCtn, window.tlDiagramData); } catch (e) { } }
  if (typeof window.tlRefreshGroupPanel === 'function') window.tlRefreshGroupPanel();
  if (typeof window.tlRefreshGroupStatus === 'function') window.tlRefreshGroupStatus();
}
function tlMergeChecked() {
  var list = document.getElementById('tlGroupZoneList'); if (!list) return;
  var sel = []; var cbs = list.querySelectorAll('input[type=checkbox]');
  for (var i = 0; i < cbs.length; i++) { if (cbs[i].checked) sel.push(parseInt(cbs[i].getAttribute('data-zi'), 10)); }
  if (sel.length < 2) return;
  var mg = (typeof window !== 'undefined' && window.tlManualGroups && window.tlManualGroups.length) ? window.tlManualGroups : [];
  mg.push(sel); window.tlManualGroups = mg;
  tlApplyGroups();
}
function tlDeleteGroup(g) {
  var mg = (typeof window !== 'undefined' && window.tlManualGroups) ? window.tlManualGroups : [];
  if (g < 0 || g >= mg.length) return;
  mg.splice(g, 1); window.tlManualGroups = mg;
  tlApplyGroups();
}
function tlResetAllGroups() { window.tlManualGroups = []; tlApplyGroups(); }
/* v112（2026-09-22 用户要求）：手动分组「保存 / 调出」快照 ——
   点上方 2/3/4/5 区自动按钮会清空 window.tlManualGroups（既有行为）；
   保存 = 深拷贝快照存 window._tlManualGroupsSnapshot + localStorage（按地块名分槽，刷新页面也在）；
   调出 = 恢复快照并走 tlApplyGroups 重生成（组色带 / 联合流量 / 左栏状态表即时回填）。
   校验：恢复前过滤非分区序号，分区总数以当前 tlDiagramData 为准，越界成员剔除，防止旧快照套在新网格上。 */
function tlManualGroupsSnapshotKey() {
  var nameEl = document.getElementById('tlPlotName');
  var name = (nameEl && nameEl.value.trim()) || 'default';
  var block = window.__runyeTlBlock;
  if (block != null && window.__runyeSubPlots && window.__runyeSubPlots[block]) {
    name += '::' + (window.currentPlotId || '') + '::block:' + (window.__runyeSubPlots[block].id || block);
  }
  return 'ry_tl_manual_groups_snapshot::' + name;
}
function tlSnapHint(msg) {
  var h = document.getElementById('tlGroupSnapHint'); if (h) h.textContent = msg || '';
}
window.tlSaveManualGroups = function () {
  var mg = (typeof window !== 'undefined' && window.tlManualGroups && window.tlManualGroups.length) ? window.tlManualGroups : null;
  if (!mg) { tlSnapHint('当前没有手动分组可保存'); return false; }
  var snap = mg.map(function (g) { return (g || []).slice(); }).filter(function (g) { return g.length > 0; });
  if (!snap.length) { tlSnapHint('当前没有手动分组可保存'); return false; }
  window._tlManualGroupsSnapshot = snap;
  try { localStorage.setItem(tlManualGroupsSnapshotKey(), JSON.stringify(snap)); } catch (e) { }
  tlSnapHint('已保存 ' + snap.length + ' 组（点「调出分组」可恢复）');
  return true;
};
window.tlRestoreManualGroups = function () {
  var snap = window._tlManualGroupsSnapshot;
  if (!snap || !snap.length) {
    try { var raw = localStorage.getItem(tlManualGroupsSnapshotKey()); if (raw) snap = JSON.parse(raw); } catch (e) { snap = null; }
  }
  if (!snap || !snap.length) { tlSnapHint('没有已保存的手动分组'); return false; }
  var d = (typeof window !== 'undefined') ? window.tlDiagramData : null;
  var z = d && d.zones;
  var maxZi = z ? ((z.cols || (z.xPos ? z.xPos.length - 1 : 0)) * (z.rows || (z.yPos ? z.yPos.length - 1 : 0))) : Infinity;
  var cleaned = [];
  for (var gi = 0; gi < snap.length; gi++) {
    var g2 = [];
    for (var ki = 0; ki < snap[gi].length; ki++) {
      var zi2 = parseInt(snap[gi][ki], 10);
      if (isFinite(zi2) && zi2 >= 0 && zi2 < maxZi && g2.indexOf(zi2) < 0) g2.push(zi2);
    }
    if (g2.length) cleaned.push(g2);
  }
  if (!cleaned.length) { tlSnapHint('快照与当前分区网格不匹配，未恢复'); return false; }
  window.tlManualGroups = cleaned;
  tlApplyGroups();
  tlSnapHint('已调出 ' + cleaned.length + ' 组');
  return true;
};
/* v98b：把「应用分组 / 合并给定分区」暴露到 window，供图纸右键菜单调用（与面板共用同一状态） */
window.tlApplyGroups = tlApplyGroups;
window.tlMergeIndices = function (sel) {
  if (!sel || sel.length < 2) return;
  var mg = (typeof window !== 'undefined' && window.tlManualGroups && window.tlManualGroups.length) ? window.tlManualGroups : [];
  mg.push(sel.slice()); window.tlManualGroups = mg;
  tlApplyGroups();
};
/* ---------- [v220 2026-10-04 用户要求] 按目标面积把分区顺序累加成联合灌溉组 ----------
 * 用户原话：「设定联合灌溉区为 36 亩，自动按顺序累加二级管路传递过来的分区面积，
 *            累计到 36 亩范围内作为一个联合灌溉区，这样我可以把 3/4/5 个小灌溉区合成一个联合灌溉区。」
 * 算法：贪心顺序累加 —— zi 从 0 起，累计 ≤ 目标就并入当前组；下一个加进去会超、且当前组非空
 *       ⇒ 断组开新组。单区自身就超目标时独占一组（不许空组、不许回退，保证覆盖全部分区）。
 * 面积口径：ryZoneAreaGroups（与工作区组标注同一来源，已含阶梯覆盖 tlZoneGx/Gy + 地块多边形裁剪）
 *           ⇒ 「标出来的亩数」和「分组用的亩数」必然一致，同一事实只存一份。
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
  var areas = null;
  try {
    var r = ryZoneAreaGroups(z, d.poly, total);
    if (r && r.ok && r.cells && r.cells.length === total) areas = r.cells;
  } catch (eA) { }
  if (!areas) { _tlToast('分区面积计算失败，请重新生成管线图'); return false; }
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
/* 面板按钮接线（v98） */
(function () {
  var mb = document.getElementById('tlGroupMergeBtn');
  if (mb) mb.addEventListener('click', tlMergeChecked);
  var cs = document.getElementById('tlGroupClearSel');
  if (cs) cs.addEventListener('click', function () { var l = document.getElementById('tlGroupZoneList'); if (l) { var cbs = l.querySelectorAll('input[type=checkbox]'); for (var i = 0; i < cbs.length; i++) cbs[i].checked = false; if (mb) mb.disabled = true; } });
  var ra = document.getElementById('tlGroupResetAll');
  if (ra) ra.addEventListener('click', tlResetAllGroups);
  /* v112：手动分组「保存 / 调出」按钮接线 */
  var gsb = document.getElementById('tlGroupSaveBtn');
  if (gsb) gsb.addEventListener('click', window.tlSaveManualGroups);
  var grb = document.getElementById('tlGroupRestoreBtn');
  if (grb) grb.addEventListener('click', window.tlRestoreManualGroups);
  /* [v233] 调出分组后当前分组未必来自按亩计算 ⇒ 熄灭「按亩自动组合」高亮防误导。 */
  if (grb) grb.addEventListener('click', function () { if (acb) acb.classList.remove('on'); });
  /* [v220]「按面积成组」按钮接线：点击即执行（与页面其它按钮同一范式，不勾选）。
     Enter 键在输入框里也触发（改完目标亩数直接回车，少一次移动鼠标）。 */
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
  /* 点 1/2/3/4 区（均分）= 既有路径清空按亩分组 ⇒ 高亮同步熄灭（程序化 .click() 也会冒泡到这里，覆盖「恢复初始化」）。 */
  var zcg = document.getElementById('tlZoneCountGroup');
  if (zcg) zcg.addEventListener('click', function () { if (acb) acb.classList.remove('on'); });
  /* v177（2026-10-01 用户请求⑲）：「↺ 恢复初始化」= 回到初始化设计。
     刻意【不重写一套复位逻辑】，而是程序化点击「2 区」按钮 —— 那条路径（上方 #tlZoneCountGroup
     的 click 处理器）已经在做全套：清 tlManualGroups、tlZoneStepClear()、清 cutOffX/Y、
     tlPersistManualGroups() 落盘、tlUpdatePlanBar + tlRefreshGroupPanel、重生成图面。
     两套实现必然慢慢漂移，故只保留一条。
     初始分区数取 #tlZoneCountGroup 的 data-init-n（HTML 单一事实来源，避免这里再硬编码一个 2）。
     刻意【不动「保存分组」存档】：误点后仍可点「调出分组」找回（用户确认：不加二次确认）。 */
  var gib = document.getElementById('tlGroupInitBtn');
  if (gib) gib.addEventListener('click', function () {
    var grp = document.getElementById('tlZoneCountGroup');
    var initN = grp ? parseInt(grp.getAttribute('data-init-n'), 10) : NaN;
    if (!isFinite(initN)) initN = 2;
    var b = grp ? grp.querySelector('button[data-n="' + initN + '"]') : null;
    if (!b) { tlSnapHint('初始化失败：未找到「' + initN + ' 区」按钮'); return; }
    b.click();
    /* v177b：提示基于【复位后的实际状态】校验，不无条件报成功 ——
       否则一旦复位路径失效（注入体检实测：把 click 掏空），会谎报「已恢复初始化」。 */
    var okN = (typeof tlGetZoneCount === 'function') && (tlGetZoneCount() === initN);
    var okG = !(window.tlManualGroups && window.tlManualGroups.length);
    tlSnapHint((okN && okG)
      ? ('已恢复初始化：' + initN + ' 区联合灌溉 · 手动分组与分界线已清空')
      : '初始化未完全生效，请再点一次或刷新页面');
  });
  var gl = document.getElementById('tlGroupList');
  if (gl) gl.addEventListener('click', function (e) { var t = e.target; if (t && t.getAttribute && t.getAttribute('data-g') != null) { tlDeleteGroup(parseInt(t.getAttribute('data-g'), 10)); } });
  var listEl = document.getElementById('tlGroupZoneList');
  if (listEl) listEl.addEventListener('change', function () { if (!mb) return; var n = 0; var cbs = listEl.querySelectorAll('input[type=checkbox]'); for (var i = 0; i < cbs.length; i++) if (cbs[i].checked) n++; mb.disabled = n < 2; });
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
   图面已生成时长度取图面实际几何（最远分区），否则显示试算输入值并在卡内提示。 */
function tlRefreshLossCard(r) {
  var el = document.getElementById('tlLossCard'); if (!el) return;
  try {
    if (!r) r = computeThreeLevel();
    function f1(v) { return (isFinite(v) ? v : 0).toFixed(1); }
    function f2(v) { return (isFinite(v) ? v : 0).toFixed(2); }
    var fromFig = !!(r.wp && r.wp.fromFigure);
    var ziTxt = fromFig ? ('图面实际 · 最远 ' + (r.wp.zoneIndex + 1) + ' 区') : '试算输入值';
    function row(name, len, loss) {
      return '<div style="display:flex;justify-content:space-between;gap:8px;padding:2px 0">'
        + '<span style="color:#475569">' + name + '</span>'
        + '<span><b style="font-weight:700">' + f1(len) + ' m</b>'
        + ' · 损失 <b style="font-weight:700;color:#b45309">' + f2(loss) + ' m</b></span></div>';
    }
    el.innerHTML = '<div style="font-weight:700;color:#0f172a;margin-bottom:2px">管段长度与水头损失</div>'
      + '<div style="font-size:10.5px;line-height:1.5;color:#64748b;margin-bottom:4px">按「最远分区最不利路径」计（' + ziTxt + '），不叠加各地块管道</div>'
      + row('总管', r.frontLenUsed, r.frontPipeLoss)
      + row('主管', r.mainLenUsed, r.mainLoss)
      + row('支管', r.branchLenUsed, r.branchLoss)
      + '<div style="display:flex;justify-content:space-between;gap:8px;border-top:1px dashed #cbd5e1;margin-top:4px;padding-top:4px">'
      + '<span style="color:#475569">合计</span>'
      + '<span><b style="font-weight:700">' + f1((r.frontLenUsed || 0) + (r.mainLenUsed || 0) + (r.branchLenUsed || 0)) + ' m</b>'
      + ' · 损失 <b style="font-weight:700;color:#b45309">' + f2(r.totalPipeLoss) + ' m</b></span></div>'
      + (fromFig ? '<div style="font-size:10.5px;color:#94a3b8;margin-top:3px">主管含由总管接入该区的连接段</div>'
        : '<div style="font-size:10.5px;color:#94a3b8;margin-top:3px">生成管线图后改用图面实际几何</div>');
    el.style.display = 'block';
  } catch (e) { }
}

/* 右侧工作区工具栏显隐（第四十三轮）：
   有图 → 露出全部按钮；无图 → 只露「生成管线图」
   （它是唯一生成入口，故 #tlWsToolbar 不再在无图时整体隐藏）。
   本函数不管 .ry-pane-ws 的可见性 —— 非 ws 视图由面板自身 display:none 隐藏。 */
function tlWsBarSync() {
  var bar = document.getElementById('tlWsToolbar');
  if (!bar) return;
  bar.style.display = 'flex';
  if (window.tlDiagramData) bar.classList.remove('tl-ws-toolbar-bare');
  else bar.classList.add('tl-ws-toolbar-bare');
}

function tlUpdatePlanBar() {
  /* 左下角「管段长度与水头损失」信息卡同步刷新（无 polygon 时也要显示试算值，故放在提前返回之前） */
  try { tlRefreshLossCard(); } catch (e) { }
  var poly = window.measuredPolygon || [];
  var hintEl = document.getElementById('tlPpHint');
  var autoBtn = document.getElementById('tlAutoPipe');
  if (!poly || poly.length < 3) {
    if(hintEl) hintEl.style.display = 'block';
    if(autoBtn) autoBtn.style.opacity = '0.5';
    return;
  }
  if(hintEl) hintEl.style.display = 'none';
  if(autoBtn) autoBtn.style.opacity = '1';

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
  /* v107（2026-09-22 用户要求）：设计值 vs 实际值 ——
     图面改径 + 点「⇧ 更新水泵扬程」后 tlPipeOdOverride 生效（此时 r 即实际值）；
     设计值 = 临时清零覆盖重算、算完立刻恢复；未改径时两者相同（行为与旧版一致）。 */
  var rDes = r, ovApplied = false;
  try {
    var ovTmp = (typeof tlPipeOdOverride !== 'undefined') ? tlPipeOdOverride : null;
    if (tlAppliedPipeOverride()) {
      ovApplied = true;
      tlPipeOdOverride = null;
      rDes = computeThreeLevel();
      tlPipeOdOverride = ovTmp;
    }
  } catch (eOv) {
    try { if (typeof ovTmp !== 'undefined' && ovTmp) tlPipeOdOverride = ovTmp; } catch (e2) { }
    rDes = r; ovApplied = false;
  }
  function fmt(v,d){d=d==null?1:d;var f=Math.pow(10,d);return (Math.round(v*f)/f).toFixed(d);}
  function fmt0(v){return Math.round(v).toString();}

  var el;
  if(el=document.getElementById('tlPlanCombinedFlow')) el.textContent=fmt(r.combinedFlow,1)+' m³/h';
  /* v106（2026-09-22 用户要求）：「联合流量」底下注明依据 —— 按哪个联合分区、实际多少亩换算。
     数据与 computeThreeLevel 同源（worstGroup={g,zones,sum}，sum=最大组实际面积和 m²）。 */
  if (el = document.getElementById('tlPlanCombinedSrc')) {
    if (r.worstGroup) {
      el.textContent = '联合流量依据：联合分区 M' + (r.worstGroup.g + 1) + '（'
        + r.worstGroup.zones.map(function (z) { return (z + 1) + '区'; }).join('、')
        + '）· 实际面积和 ' + fmt(r.worstGroup.sum / 666.67, 1) + ' 亩';
    } else {
      el.textContent = '联合流量依据：暂无图面分组数据（按单区流量 × ' + fmt0(r.zoneCount || 1) + ' 估算）';
    }
    el.style.display = '';
  }
  if(el=document.getElementById('tlPlanPumpFlow')) el.textContent=fmt(r.combinedFlow,1)+' m³/h';
  /* v107：设计列 = 理论选管（无覆盖）计算；未改径时 rDes===r，显示与旧版一致 */
  /* v139（2026-09-23 用户反馈「应用到图面后改径重算列没更新」）：水泵两行回到与管径行同款列语义——
     主列（设计值）= 理论选管计算值；橙列（改径重算）= 应用管径重算值（见下方 tlRealSet 调用）。
     v119 的「主=实际 / 橙=设计」与列头错位，用户读作「改径重算列没更新」；改径后的值
     在橙列与下方黑条（水泵扬程 36.5 m）直接可见。 */
  if(el=document.getElementById('tlPlanPumpHead')) el.textContent=fmt(rDes.pumpHead,1)+' m';

  if(el=document.getElementById('tlPlanPumpPower')) el.textContent=fmt(rDes.pumpPower,1)+' kW';
  if(el=document.getElementById('tlPlanMotorPower')) el.textContent=fmt(rDes.motorKW_rounded,1)+' kW';
  if(el=document.getElementById('tlPlanFrontPipe')) el.textContent='Ø '+rDes.frontPipe.od+' mm';
  if(el=document.getElementById('tlPlanFrontVelocity')) el.textContent=fmt(rDes.frontPipe.v,2)+' m/s';
  if(el=document.getElementById('tlPlanMainPipe')) el.textContent='Ø '+rDes.mainPipe.od+' mm';
  /* 2026-09-16 用户要求：补充主管/支管流速（与总管流速同口径：内径满流 v=Q/A） */
  if(el=document.getElementById('tlPlanMainVelocity')) el.textContent=fmt(rDes.mainPipe.v,2)+' m/s';
  if(el=document.getElementById('tlPlanBranchPipe')) el.textContent='Ø '+rDes.branchPipe.od+' mm';
  if(el=document.getElementById('tlPlanBranchVelocity')) el.textContent=fmt(rDes.branchPipe.v,2)+' m/s';
  /* v107：实际列（图面改径 + 「⇧ 更新水泵扬程」重算后的真实值；未改径时显示 —） */
  function tlRealSet(id, v, unit, dec) {
    var e2 = document.getElementById(id); if (!e2) return;
    if (!ovApplied || typeof v !== 'number' || !isFinite(v)) { e2.textContent = '—'; e2.style.color = '#cbd5e1'; return; }
    e2.textContent = fmt(v, dec) + ' ' + unit; e2.style.color = '';
  }
  /* v139：扬程/功率橙列（改径重算）= 应用管径重算后的值（与流速行同款 tlRealSet；未应用显示 —） */
  tlRealSet('tlPlanPumpHeadReal', r.pumpHead, 'm', 1);
  tlRealSet('tlPlanPumpPowerReal', r.pumpPower, 'kW', 1);
  tlRealSet('tlPlanMotorPowerReal', r.motorKW_rounded, 'kW', 1);
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
  tlRealSet('tlPlanFrontVelocityReal', actualVelocity(hp ? hp.frontFlow : r.combinedFlow, usedCals.front || r.frontPipe.od), 'm/s', 2);
  tlRealSet('tlPlanMainVelocityReal', actualVelocity(hp ? hp.mainFlow : r.zoneFlow, usedCals['main-' + worstZi] || r.mainPipe.od), 'm/s', 2);
  tlRealSet('tlPlanBranchVelocityReal', actualVelocity(hp ? hp.branchFlow : r.branchFlow, usedCals['branch-' + worstZi] || r.branchPipe.od), 'm/s', 2);
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
  window.RyTlNodes.subscribe(function () { try { tlRefreshTlNodesLayer(); } catch (e) {} });
  return true;
}

function tlAutoGenerate(options) {
  options = options || {};
  var doScroll = options.scroll !== false;
  try {
  // 局部辅助函数（三级页在 IIFE 之外，无法访问二级页内部的 pp* 函数，故此处自包含实现）
  function tlZoneActualAreaM2(zc,zr,zoneCuts,plotPoly){
    if(!plotPoly||plotPoly.length<3)return zoneCuts.xPlan[zc]*zoneCuts.yPlan[zr];
    var x0=tlZoneGx(zoneCuts,zr,zc), y0=tlZoneGy(zoneCuts,zc,zr);
    var x1=tlZoneGx(zoneCuts,zr,zc+1), y1=tlZoneGy(zoneCuts,zc,zr+1);
    var clipped=clipPolyToRect(plotPoly,x0,y0,x1,y1);
    return polyAreaM2(clipped);
  }
  function tlZoneSizeLabel(w,h){
    function f(v){ if(!isFinite(v))return '—'; var rounded=Math.round(v); return Math.abs(v-rounded)<0.05?String(rounded):v.toFixed(1); }
    return f(w)+'×'+f(h)+'m';
  }
  // 支管端点缩进：若支管为水平/垂直线且端点贴分区边缘（自动生成的贴边管），向内缩进 gap，
  // 使相邻地块的支管在分界处留出空隙、视觉上独立断开；斜线（手动绘制）不受影响。
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
    alert('请先在面积测量工具中描绘边界（当前测量点数：' + (poly?poly.length:0) + '）');
    return;
  }

  // Bounds
  var minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for (var i=0;i<poly.length;i++){var p=poly[i];if(p.x<minX)minX=p.x;if(p.x>maxX)maxX=p.x;if(p.y<minY)minY=p.y;if(p.y>maxY)maxY=p.y;}
  var b={minX:minX,minY:minY,w:maxX-minX,h:maxY-minY};

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
  /* v98h 阶梯分区本地包装：zX/zY 取「该行 / 该列的割缝位置」；zXb/zYb 取相邻两行/列在指定格上的公共边带。
     空覆盖表时全部退化为 xPos / yPos ⇒ 输出与改动前逐字节一致（eq 基线因此不受影响）。 */
  var tlZoneStepRef = (function () { try { return tlZoneStepFor({ cols: cols, rows: rows, xPos: xPos, yPos: yPos }); } catch (e) { return null; } })();
  var zStepOn = !!(tlZoneStepRef && (tlZoneStepCount() > 0));
  function zX(ri, ci) { var o = tlZoneStepRef && tlZoneStepRef.x, v = o ? o[ri + ',' + ci] : null; return (v != null && isFinite(v)) ? v : xPos[ci]; }
  function zY(ci, ri) { var o = tlZoneStepRef && tlZoneStepRef.y, v = o ? o[ci + ',' + ri] : null; return (v != null && isFinite(v)) ? v : yPos[ri]; }
  function zYb(r, cA, cB) { var a = zY(cA, r), b2 = zY(cA, r + 1), c = zY(cB, r), d = zY(cB, r + 1); var lo = Math.max(a, c), hi = Math.min(b2, d); if (!(hi > lo)) { lo = a; hi = b2; } return [lo, hi]; }
  function zXb(c, rA, rB) { var a = zX(rA, c), b2 = zX(rA, c + 1), c1 = zX(rB, c), d = zX(rB, c + 1); var lo = Math.max(a, c1), hi = Math.min(b2, d); if (!(hi > lo)) { lo = a; hi = b2; } return [lo, hi]; }

  // 预统计：每个分区的实际面积（裁剪到地块多边形）与名义标准区比较，判定"非标分区"
  var tlZoneCuts={xPos:xPos,yPos:yPos,xPlan:xPlan,yPlan:yPlan,cutOffX:(tlZoneStepRef?tlZoneStepRef.x:null),cutOffY:(tlZoneStepRef?tlZoneStepRef.y:null)};
  var tlPlotPolyForZone=(poly&&poly.length>=3)?poly.map(function(p){return{x:p.x,y:p.y};}):null;
  var tlPartialFlags=[], tlPartialCount=0, tlZoneActMu=[];
  for(var _zr=0;_zr<rows;_zr++){for(var _zc=0;_zc<cols;_zc++){
    var _zi=_zr*cols+_zc;
    var _stdMu=xPlan[_zc]*yPlan[_zr]/MU_TO_SQM;
    var _m2=tlZoneActualAreaM2(_zc,_zr,tlZoneCuts,tlPlotPolyForZone);
    var _mu=_m2/MU_TO_SQM;
    var _isPartial=_stdMu>0 && _mu<_stdMu*0.97 && _mu>0.05;
    tlPartialFlags[_zi]=_isPartial;
    tlZoneActMu[_zi]=Math.round(_mu*10)/10;
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
  var s=Math.min(drawW/b.w, drawH/b.h); s=Math.min(s,2);
  var ox=padX+(drawW-b.w*s)/2, oy=drawTop+(drawH-b.h*s)/2;
  function ts(mx,my){return{x:(mx-b.minX)*s+ox,y:(my-b.minY)*s+oy};}

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
  var areaMu=window.measuredArea?(window.measuredArea/MU_TO_SQM).toFixed(2):(b.w*b.h/MU_TO_SQM).toFixed(1);
  var tlPlotNameVal=(document.getElementById('tlPlotName')&&document.getElementById('tlPlotName').value.trim())||'未命名地块';
  // 标题（2026-09-16 恢复）：简图/下载/打印显示；工作区克隆剥离 tlTitleGroup
  parts.push('<g id="tlTitleGroup"><text x="'+svgW/2+'" y="40" text-anchor="middle" font-size="20" font-weight="700" fill="#14532d">润野灌溉 · 三级管线施工简图</text></g>');
  // info —— 与图面拉开间距，不再压到地块
  // 信息行：与标题分行；过长时按 " | " 边界自动换行
  var tlHeaderExtra=tlPartialCount>0?(' | 非标准 '+tlPartialCount+' 区'):'';
  var tlHeaderStr='地块名称 '+tlPlotNameVal+'  |  面积 '+areaMu+' 亩  |  地块 '+plotW.toFixed(0)+'×'+plotH.toFixed(0)+' m  |  '+totalZones+'分区  |  联合灌溉 '+zc+'区'+tlHeaderExtra;
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
      var r1=ts(zx,zy), r2=ts(zx+zoneW,zy+zoneH);
      var grp = tlManualActive ? ((typeof window!=='undefined'&&window.tlZoneManualGroupOf) ? window.tlZoneManualGroupOf(zi) : -1) : Math.floor(zi/tlGN);
      var isPartial=tlPartialFlags[zi];
      var cellFill = (tlManualActive && grp < 0) ? tlUngroupedFill : ((typeof window!=='undefined'&&window.RyTlWs&&window.RyTlWs.groupFillCss)?window.RyTlWs.groupFillCss(grp):zoneCols[zi%zoneCols.length]);
      var cellStroke=isPartial?'rgba(217,119,6,.85)':'rgba(51,65,85,.28)';
      gzSvg.push('<rect x="'+r1.x.toFixed(1)+'" y="'+r1.y.toFixed(1)+'" width="'+(r2.x-r1.x).toFixed(1)+'" height="'+(r2.y-r1.y).toFixed(1)+'" fill="'+cellFill+'" stroke="'+cellStroke+'" stroke-width="1" stroke-dasharray="6,3" data-zi="'+zi+'" data-g="'+grp+'" data-fill="'+cellFill+'" data-stroke="'+cellStroke+'"/>');
    }
  }
  /* 组边界深线：同行内组号变化处画竖向；行与行之间组号变化画横向（仅自动分组模式；手动分组靠色带区分） */
  if (!tlManualActive) {
  for(var glr=0;glr<rows;glr++){
    for(var glc=0;glc+1<cols;glc++){
      if(Math.floor((glr*cols+glc)/tlGN)!==Math.floor((glr*cols+glc+1)/tlGN)){
        var _gyb=zYb(glr,glc,glc+1); var tgA=ts(zX(glr,glc+1),_gyb[0]), tgB=ts(zX(glr,glc+1),_gyb[1]);
        gzLines.push('<line x1="'+tgA.x.toFixed(1)+'" y1="'+tgA.y.toFixed(1)+'" x2="'+tgB.x.toFixed(1)+'" y2="'+tgB.y.toFixed(1)+'" stroke="#1f2937" stroke-width="2.2" opacity="0.62" data-gb="'+Math.floor((glr*cols+glc)/tlGN)+'"/>');
      }
    }
    if(glr+1<rows && Math.floor((glr*cols+cols-1)/tlGN)!==Math.floor(((glr+1)*cols)/tlGN)){
      var _ghs=Math.floor((glr*cols+cols-1)/tlGN);
      if(zStepOn){
        /* v98h 阶梯：行边界成了折线 ⇒ 逐列分段（zStepOn=false 时走 else 原路径，保持单条直线、旧输出不变） */
        for(var gcc=0;gcc<cols;gcc++){
          var _gxb=zXb(gcc,glr,glr+1); if(!(_gxb[1]>_gxb[0]))continue;
          var gC=ts(_gxb[0],zY(gcc,glr+1)), gD=ts(_gxb[1],zY(gcc,glr+1));
          gzLines.push('<line x1="'+gC.x.toFixed(1)+'" y1="'+gC.y.toFixed(1)+'" x2="'+gD.x.toFixed(1)+'" y2="'+gD.y.toFixed(1)+'" stroke="#1f2937" stroke-width="2.2" opacity="0.62" data-gb="'+_ghs+'"/>');
        }
      }else{
        var tgC=ts(b.minX,yPos[glr+1]), tgD=ts(b.minX+b.w,yPos[glr+1]);
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
        var _myb=zYb(mlr,mlc,mlc+1); var mgA=ts(zX(mlr,mlc+1),_myb[0]), mgB=ts(zX(mlr,mlc+1),_myb[1]);
        gzLines.push('<line x1="'+mgA.x.toFixed(1)+'" y1="'+mgA.y.toFixed(1)+'" x2="'+mgB.x.toFixed(1)+'" y2="'+mgB.y.toFixed(1)+'" stroke="#1f2937" stroke-width="3" opacity="0.9" stroke-linecap="round" data-mgb="1" data-cutaxis="x" data-cutindex="'+(mlc+1)+'"/>');
      }
      if(mlr+1<rows){
        for(var mlc2=0;mlc2<cols;mlc2++){
          if(window.tlZoneManualGroupOf(mlr*cols+mlc2)===window.tlZoneManualGroupOf((mlr+1)*cols+mlc2))continue;
          var _mxb=zXb(mlc2,mlr,mlr+1); var mgC=ts(_mxb[0],zY(mlc2,mlr+1)), mgD=ts(_mxb[1],zY(mlc2,mlr+1));
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
      var r1=ts(zx,zy), r2=ts(zx+zoneW,zy+zoneH);
      var rx=r1.x, ry=r1.y, rw=r2.x-r1.x, rh=r2.y-r1.y;
      var aw=Math.abs(rw), ah=Math.abs(rh);
      var actM2=tlZoneActualAreaM2(zc2,zr,tlZoneCuts,tlPlotPolyForZone);
      var actMu=actM2/MU_TO_SQM;
      var isPartial=tlPartialFlags[zi];
      if(aw>36&&ah>26 && actMu>0.05){
        if(isPartial){
          // 非标准分区：分区名 + 实际亩数（不显示尺寸），置于右上角
          var pLabelX=rx+rw-8, pLabelY=ry+14;
          if(aw>78&&ah>44){
            tlLabelParts.push('<text data-tlzone="1" x="'+pLabelX.toFixed(1)+'" y="'+pLabelY.toFixed(1)+'" text-anchor="end" font-size="14" font-weight="700" fill="#b45309">'+(zi+1)+'区</text>');
            tlLabelParts.push('<text data-tlzone="1" x="'+pLabelX.toFixed(1)+'" y="'+(pLabelY+16).toFixed(1)+'" text-anchor="end" font-size="10.5" font-weight="700" fill="#b45309">实际 '+actMu.toFixed(1)+' 亩</text>');
          }else{
            tlLabelParts.push('<text data-tlzone="1" x="'+pLabelX.toFixed(1)+'" y="'+pLabelY.toFixed(1)+'" text-anchor="end" font-size="8" font-weight="700" fill="#b45309">'+(zi+1)+'区 实际'+actMu.toFixed(1)+'亩</text>');
          }
        }else{
          // 标准分区：分区名 + 尺寸 + 亩数，置于右上角
          var zoneSizeText=tlZoneSizeLabel(Math.max(xPlan[zc2],yPlan[zr]),Math.min(xPlan[zc2],yPlan[zr]));
          var zoneAreaText=(xPlan[zc2]*yPlan[zr]/MU_TO_SQM).toFixed(1)+'亩';
          var zoneLabelX=rx+rw-8, zoneLabelY=ry+14;
          if(aw>92&&ah>52){
            tlLabelParts.push('<text data-tlzone="1" x="'+zoneLabelX.toFixed(1)+'" y="'+zoneLabelY.toFixed(1)+'" text-anchor="end" font-size="15" font-weight="700" fill="#111827">'+(zi+1)+'区</text>');
            tlLabelParts.push('<text data-tlzone="1" x="'+zoneLabelX.toFixed(1)+'" y="'+(zoneLabelY+16).toFixed(1)+'" text-anchor="end" font-size="10.5" font-weight="600" fill="#111827">'+zoneSizeText+'</text>');
            tlLabelParts.push('<text data-tlzone="1" x="'+zoneLabelX.toFixed(1)+'" y="'+(zoneLabelY+31).toFixed(1)+'" text-anchor="end" font-size="10" fill="#111827">'+zoneAreaText+'</text>');
          }else if(ah>70){
            tlLabelParts.push('<g transform="translate('+((rx+rw/2).toFixed(1))+' '+((ry+rh/2).toFixed(1))+') rotate(-90)">');
            tlLabelParts.push('<text data-tlzone="1" x="0" y="3" text-anchor="middle" font-size="8.5" font-weight="700" fill="#111827">'+(zi+1)+'区 '+zoneSizeText+' '+zoneAreaText+'</text>');
            tlLabelParts.push('</g>');
          }else{
            tlLabelParts.push('<text data-tlzone="1" x="'+(rx+rw/2).toFixed(1)+'" y="'+(ry+rh/2).toFixed(1)+'" text-anchor="middle" font-size="7.5" font-weight="700" fill="#111827">'+(zi+1)+'区 '+zoneSizeText+' '+zoneAreaText+'</text>');
          }
        }
      }
    }
  }
  parts.push(tlLabelParts.join(''));

  // Zone cut lines
  parts.push('<g fill="none" stroke="#334155" stroke-width="1" stroke-dasharray="7,5" opacity="0.48">');
  if(!zStepOn){
    for(var bx=0;bx<xPos.length;bx++){
      var bv1=ts(xPos[bx],b.minY),bv2=ts(xPos[bx],b.minY+b.h);
      parts.push('<line x1="'+bv1.x.toFixed(1)+'" y1="'+bv1.y.toFixed(1)+'" x2="'+bv2.x.toFixed(1)+'" y2="'+bv2.y.toFixed(1)+'"/>');
    }
    for(var by=0;by<yPos.length;by++){
      var bh1=ts(b.minX,yPos[by]),bh2=ts(b.minX+b.w,yPos[by]);
      parts.push('<line x1="'+bh1.x.toFixed(1)+'" y1="'+bh1.y.toFixed(1)+'" x2="'+bh2.x.toFixed(1)+'" y2="'+bh2.y.toFixed(1)+'"/>');
    }
  }else{
    /* v98h 阶梯：分区线按行/列分段（同一列在不同行可能错开）。zStepOn=false 时走上面原路径，输出不变。 */
    for(var bx2=0;bx2<xPos.length;bx2++){
      for(var bri=0;bri<rows;bri++){
        var _byb=zYb(bri,bx2-1<0?0:bx2-1,bx2>cols-1?cols:bx2); if(!(_byb[1]>_byb[0]))continue;
        var bv3=ts(zX(bri,bx2),_byb[0]), bv4=ts(zX(bri,bx2),_byb[1]);
        if(Math.abs(bv4.y-bv3.y)<0.05)continue;
        parts.push('<line x1="'+bv3.x.toFixed(1)+'" y1="'+bv3.y.toFixed(1)+'" x2="'+bv4.x.toFixed(1)+'" y2="'+bv4.y.toFixed(1)+'"/>');
      }
    }
    for(var by2=0;by2<yPos.length;by2++){
      for(var bci=0;bci<cols;bci++){
        var _bxb=zXb(bci,(by2-1<0?0:by2-1),(by2>rows-1?rows:by2)); if(!(_bxb[1]>_bxb[0]))continue;
        var bh3=ts(_bxb[0],zY(bci,by2)), bh4=ts(_bxb[1],zY(bci,by2));
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
  (function(){ var dsv=document.getElementById('tlDimScaleVal'); if(dsv)dsv.textContent=Math.round(tlDS*100)+'%'; })();
  window.tlDimScaleStep=function(dir){
    var n=Math.round((tlDimScaleOf()+dir*0.1)*10)/10;
    n=Math.max(0.6,Math.min(1.8,n));
    try{localStorage.setItem('tl-dim-scale',String(n));}catch(e){}
    var el=document.getElementById('tlDimScaleVal'); if(el)el.textContent=Math.round(n*100)+'%';
    try{tlAutoGenerate({scroll:false});}catch(e){}   /* 任务M：重渲染宿主是 tlAutoGenerate（整段简图 SVG 渲染在其函数体内），tlUpdatePlanBar 只是状态栏小函数 */
  };
  window.tlDimScaleReset=function(){
    try{localStorage.removeItem('tl-dim-scale');}catch(e){}
    var el=document.getElementById('tlDimScaleVal'); if(el)el.textContent='100%';
    try{tlAutoGenerate({scroll:false});}catch(e){}
  };

  // 地块尺寸标注（建筑制图风格）：图下水平尺寸线 + 图左垂直尺寸线；尺寸值取二级页传导(有桥)或实测，与二级页施工简图一致
  (function(){
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
        parts.push('<text x="0" y="'+offv.toFixed(2)+'" text-anchor="middle" font-size="'+(DG.font*tlDS).toFixed(2)+'" font-weight="700" fill="#111111" stroke="none">'+text+'</text></g>');
        return;
      }
      parts.push('<text x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" text-anchor="'+anchor+'" font-size="'+(DG.font*tlDS).toFixed(2)+'" font-weight="700" fill="#111111" stroke="none">'+text+'</text>');
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
      var gdTL=ts(gdX0,gdY0), gdTR=ts(gdX1,gdY0v), gdBR=ts(gdX1,gdY1v);
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
      var gdBRb=ts(zX(gdRc.minR,gdRc.maxC+1),gdY1b);
      for(var gdc2=gdRc.minC;gdc2<=gdRc.maxC;gdc2++){
        var gdPA=ts(zX(gdRc.maxR,gdc2),gdY1b), gdPB=ts(zX(gdRc.maxR,gdc2+1),gdY1b);
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
          +'<text x="'+((gdPA.x+gdPB.x)/2).toFixed(1)+'" y="'+(gdHy-GAP-DESC).toFixed(1)+'" text-anchor="middle" font-size="'+(DG.font*tlDS).toFixed(2)+'" font-weight="700" fill="#111111" stroke="none">'
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
        var gdPAv=ts(zX(gdr2,cols),zY(gdCxV,gdr2)), gdPBv=ts(zX(gdr2,cols),zY(gdCxV,gdr2+1));
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
          +'<g transform="translate('+gdVx.toFixed(1)+' '+((gdPAv.y+gdPBv.y)/2).toFixed(1)+') rotate(-90)"><text x="0" y="'+(GAP+ASC).toFixed(2)+'" text-anchor="middle" font-size="'+(DG.font*tlDS).toFixed(2)+'" font-weight="700" fill="#111111" stroke="none">'+gdVal((zY(gdCxV,gdr2+1)-zY(gdCxV,gdr2))/gdSy)+'</text></g></g>');
        window._tlDimHits.push({id:gdIdV,axis:'x',x1:gdVx,y1:gdPAv.y,x2:gdVx,y2:gdPBv.y,minOff:-8});
      }
    });
    if(gdParts.length){
      parts.push('<g pointer-events="none" stroke="#111111" stroke-width="0.95" fill="none" opacity="0.95" stroke-linecap="square">');
      parts.push(gdParts.join(''));
      parts.push('</g>');
    }
  })();

  // ===== 管线：优先采用二级页已生成几何（数据传导），否则三级页自动布管 =====
  var mainPipes=[], branchPipes=[], valves=[];
  var ppShare=window.RunyeBridge?window.RunyeBridge.state:null;
  var ppHasPipes=ppShare && (ppShare.mainPipes.length||ppShare.branchPipes.length||ppShare.valves.length);
  /* v150b（2026-09-28 用户要求「管道布置方向按多数分区的方向自动校正；这些地方没有必要换方向」）：
     原每分区独立判向（xPlan[zc]>=yPlan[zr]）→ 窄长分区会单独翻转向，同一张图上主管/支管方向不一。
     改为全图按分区数投票取多数方向（majFixedH），三级自布管的主管/支管/滴灌带/总管全部统一按多数方向布管；
     二级传导（ppHasPipes）几何不动，滴灌带方向也维持按分区几何（与二级支管一致）。 */
  /* [v416 2026-10-13 用户口径] 方向单一事实来源：滴灌带 ∥ tapeAxis、主管∥支管 ⊥ tapeAxis。
     —— 旧实现「管道按多数派、滴灌带按单分区宽高比」两套判据会在混合朝向地块上互相平行，
        现统一由 RyZoneGeometry.tapeAxisOf 一次算出（判据改为「贴合单边铺设长度」，
        平票由更省支管的一侧破平）。RyZoneGeometry 缺失时退回旧投票，行为不变。 */
  var tlAxisReport=null;
  var majFixedH=(function(){
    var G=window.RyZoneGeometry;
    if(G&&typeof G.tapeAxisOf==='function'){
      var ax=G.tapeAxisOf({cols:cols,rows:rows,xPlan:xPlan,yPlan:yPlan,xSrc:xSrc,ySrc:ySrc,xPos:xPos,yPos:yPos},
                          (typeof planZoneFixedSide==='function'?planZoneFixedSide():200));
      if(ax&&ax.ok){ tlAxisReport=ax; try{window.__ryTapeAxisReport=ax;}catch(eRep){} return ax.tapeAxis==='x'; }
    }
    var h=0, v=0;
    for(var rv=0;rv<rows;rv++){ for(var cv=0;cv<cols;cv++){ if(xPlan[cv]>=yPlan[rv]) h++; else v++; } }
    return h>=v;
  })();
  if(ppHasPipes){
    mainPipes=ppShare.mainPipes.map(function(l){return l.map(function(p){return{x:p.x,y:p.y};});});
    branchPipes=ppShare.branchPipes.map(function(l){return l.map(function(p){return{x:p.x,y:p.y};});});
    if(ppShare.subBranchPipes&&ppShare.subBranchPipes.length){ppShare.subBranchPipes.forEach(function(l){branchPipes.push(l.map(function(p){return{x:p.x,y:p.y};}));});}
    valves=ppShare.valves.map(function(v){return{x:v.x,y:v.y};});
    // 复用二级页支管时端点若贴在分区边缘，同样向内缩进，保证相邻地块支管视觉上断开
    branchPipes=branchPipes.map(tlTrimBranchToZone);
  } else {
    /* [v556 2026-10-18 用户要求] 最外一排（789 / 28/29/30 区）主管末端改 90°弯头：
       「主管最边上的地块接到 90°弯头就可以了……90°弯头向上接一段……之后再接支管。」
       经示意图三轮确认的画法：
       · 最外一排的主管**不再向下延伸到底边**，截止于「分区中心往下 MAIN_END_ELBOW_R 比例」处
         （示意图实测 ≈ 分区中心 +18% 分区高）；
       · 截止点=90°弯头，之后**照抄其他地块**链路：连接管 → 阀门 → 支管三通 → 支管
         （支管仍按原几何贯通全分区、向上下两侧延伸）；
       · 唯一区别 = 主管末端由「三通」改「90°弯头」（材料清单同步：分区三通 −N、新增 90°弯头 +N）；
       · 纵向分支（主管横置）对称：最外一**列**主管不再向右延伸，末端弯头后接阀门/支管；
       · 二级页传导几何（ppHasPipes 分支）不在此列 —— 该分支几何来自二级页，保持原样。 */
    var MAIN_END_ELBOW_R = 0.18;
    for(var zr2=0;zr2<rows;zr2++){
      for(var zc3=0;zc3<cols;zc3++){
        var zx2=xPos[zc3], zy2=yPos[zr2];
        var zoneW2=xSrc[zc3], zoneH2=ySrc[zr2];
        var centerX=zx2+zoneW2/2, centerY=zy2+zoneH2/2;
        var fixedSideIsHorizontal=majFixedH;   /* v150b：全图统一按多数分区方向，个别分区不再换向 */
        // 支管两端各缩进一段距离（约分区边长的 6%，4~14m），不与分区边缘相接，使各地块支管视觉上独立断开
        var gapV=Math.min(Math.max(zoneH2*0.06,4),14,zoneH2*0.22);
        var gapH=Math.min(Math.max(zoneW2*0.06,4),14,zoneW2*0.22);
        if(fixedSideIsHorizontal){
          /* v110（2026-09-22 用户要求）：主管改到分区横向中间；支管在主管旁平移一小段
             （原主管 32% 偏置、支管落中 → 主支相距 18% 边长，用户反馈偏移过大，缩到 9%） */
          var mainX=zx2+zoneW2*0.5;
          var brOffX=Math.min(Math.max(zoneW2*0.09,2),zoneW2*0.22);
          var brX=mainX+brOffX;
          var tlEdgeZ=(zr2===rows-1);                 /* [v556] 最外一排 */
          var tlMainEndY=zy2+zoneH2;
          if(tlEdgeZ){
            tlMainEndY=zy2+zoneH2*0.5+zoneH2*MAIN_END_ELBOW_R;
            if(tlMainEndY>zy2+zoneH2-gapV)tlMainEndY=zy2+zoneH2-gapV;
            if(tlMainEndY<zy2+gapV)tlMainEndY=zy2+gapV;
          }
          mainPipes.push([{x:mainX,y:zy2},{x:mainX,y:tlMainEndY}]);
          branchPipes.push([{x:brX,y:zy2+gapV},{x:brX,y:zy2+zoneH2-gapV}]);
          if(window.atPointInPolygon&&window.atPointInPolygon({x:brX,y:tlEdgeZ?tlMainEndY:centerY},poly)){
            if(tlEdgeZ){
              /* [v556] 主管末端 90°弯头 → 水平连接管 → 阀门（落点仍在支管上）→ 支管三通 → 支管 */
              valves.push({x:brX,y:tlMainEndY,ax:mainX,ay:tlMainEndY,elbow:true,mi:mainPipes.length-1});
            }else{
              var tlDx=brX-mainX, tlAy=centerY-tlDx;
              if(tlAy<zy2)tlAy=zy2; if(tlAy>zy2+zoneH2)tlAy=zy2+zoneH2;
              valves.push({x:brX,y:centerY,ax:mainX,ay:tlAy});
            }
          }
        }else{
          var mainY=zy2+zoneH2*0.5;
          var brOffY=Math.min(Math.max(zoneH2*0.09,2),zoneH2*0.22);
          var brY=mainY+brOffY;
          var tlEdgeZ=(zc3===cols-1);                 /* [v556] 最外一列（纵向分支对称） */
          var tlMainEndX=zx2+zoneW2;
          if(tlEdgeZ){
            tlMainEndX=zx2+zoneW2*0.5+zoneW2*MAIN_END_ELBOW_R;
            if(tlMainEndX>zx2+zoneW2-gapH)tlMainEndX=zx2+zoneW2-gapH;
            if(tlMainEndX<zx2+gapH)tlMainEndX=zx2+gapH;
          }
          mainPipes.push([{x:zx2,y:mainY},{x:tlMainEndX,y:mainY}]);
          branchPipes.push([{x:zx2+gapH,y:brY},{x:zx2+zoneW2-gapH,y:brY}]);
          if(window.atPointInPolygon&&window.atPointInPolygon({x:tlEdgeZ?tlMainEndX:centerX,y:brY},poly)){
            if(tlEdgeZ){
              valves.push({x:tlMainEndX,y:brY,ax:tlMainEndX,ay:mainY,elbow:true,mi:mainPipes.length-1});
            }else{
              var tlDy=brY-mainY, tlAx=centerX+tlDy;
              if(tlAx<zx2)tlAx=zx2; if(tlAx>zx2+zoneW2)tlAx=zx2+zoneW2;
              valves.push({x:centerX,y:brY,ax:tlAx,ay:mainY});
            }
          }
        }
      }
    }
  }

  // ===== 滴灌带示意（示意性质，两端不画到分区端头）=====
  // 垂直支管 → 滴灌带为支管两侧的水平短线；水平支管 → 滴灌带为支管上下的垂直短线。
  // 无论走二级复用还是三级自布管，均基于分区几何统一生成，与支管数据来源无关。
  var dripTapes=[];
  for(var zrT=0;zrT<rows;zrT++){
    for(var zcT=0;zcT<cols;zcT++){
      var zxT=xPos[zcT], zyT=yPos[zrT];
      var zwT=xSrc[zcT], zhT=ySrc[zrT];
      var fixedH=majFixedH;   /* [v416] 全图统一跟随滴灌带轴（v150b 的逐区判向已废：它会让少数派分区的滴灌带与多数派管道平行） */
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
        if(nSeg<=1){ dripTapes.push([pA,pB]); continue; }
        for(var sgT=0;sgT<nSeg;sgT++){
          var a0=sgT/nSeg, a1=(sgT+1)/nSeg;
          var qA={x:pA.x+(pB.x-pA.x)*a0,y:pA.y+(pB.y-pA.y)*a0};
          var qB={x:pA.x+(pB.x-pA.x)*a1,y:pA.y+(pB.y-pA.y)*a1};
          var ln=Math.hypot(qB.x-qA.x,qB.y-qA.y);
          var gp=ln>6?0.75:0;   /* 接缝缺口（单侧缩进），短段不缩 */
          var ux=ln>0?(qB.x-qA.x)/ln:0, uy=ln>0?(qB.y-qA.y)/ln:0;
          dripTapes.push([{x:qA.x+ux*gp,y:qA.y+uy*gp},{x:qB.x-ux*gp,y:qB.y-uy*gp}]);
        }
      }
    }
  }

  // ===== Front main pipe (总管) — perpendicular to main pipes =====
  // Determine main pipe direction from first zone
  /* [v416] 总管同样随全图统一方向：旧代码在「二级传导」分支按第 0 分区宽高比判向，
     混合朝向地块上会与多数方向（majFixedH）相反 ⇒ 总管与主管不再垂直。现一律随 majFixedH。 */
  var firstFixedSideIsHorizontal = majFixedH;
  var frontPipe = null;
  /* [v556 2026-10-18 用户要求] 总管改贴最外一排（123 区）顶边：
     「总管移动到分区内，就是这张图片的 123 区内……端头被主管直接裁剪掉。」
     （v550 曾放进第 2 排、距排顶边 15 米，经示意图三轮确认改为第 1 排、偏移 0 米）：
     · 横向分支（主管竖置）：总管放进第 1 排分区内部，FRONT_IN_ROW=0、FRONT_IN_OFFSET=0
       ⇒ 正好压在该排顶边上（「贴着排顶边（0 米）」）；
     · 两端截止于第 1 排最左/最右主管（端头被主管裁平，不再横贯全幅宽）；
     · 水源点留在原位（旧总管起点 = 地块外沿老位置），由「水源连接段」接到总管近端
       （见下方绘制段 data-tlsrcpipe）；
     · 纵向分支（主管横置）对称：放进第 1 列、贴该列左缘（偏移 0 米）、两端截止于最上/最下主管；
     · 拖动沿主管走向滑移不变（正交锁定，AE.moves['front'] 机制不动）；
     · 分区不足 2 排/列时退回旧几何（地块外沿全宽），保证小地块不空转。 */
  var FRONT_IN_ROW = 0;       // 总管所在排（列）序号：0 = 最外一排（123 区）
  var FRONT_IN_OFFSET = 0;    // 距该排顶边（该列左缘）往内偏移（米）；0 = 紧贴顶边
  if (firstFixedSideIsHorizontal) {
    /* 横向总管的 x 范围取自**列**主管 ⇒ 至少 2 列才有意义（v550 首版误写成 rows>=2，
       单列地块会算出零长度总管——A/B 基线实测抓到）。 */
    if (cols >= 2) {
      var tlfY = yPos[FRONT_IN_ROW] + Math.min(FRONT_IN_OFFSET, ySrc[FRONT_IN_ROW] * 0.5);   // 第 1 排顶边（偏移 0）
      var tlfxA = Infinity, tlfxB = -Infinity;
      for (var tlfzc = 0; tlfzc < cols; tlfzc++) {
        var tlfmx = xPos[tlfzc] + xSrc[tlfzc] * 0.5;   // 该排主管 x（竖置主管）
        if (tlfmx < tlfxA) tlfxA = tlfmx;
        if (tlfmx > tlfxB) tlfxB = tlfmx;
      }
      frontPipe = [{x:tlfxA, y:tlfY}, {x:tlfxB, y:tlfY}];
      // 水源不动：留在旧总管起点（地块上沿外），不再随总管进分区
      var sourcePos = {x:b.minX, y:b.minY - Math.max(15, b.h * 0.04)};
    } else {
      // Main pipes are vertical → front pipe is horizontal, along the top edge
      var frontY = b.minY - Math.max(15, b.h * 0.04);
      var frontX1 = b.minX;
      var frontX2 = b.minX + b.w;
      frontPipe = [{x:frontX1, y:frontY}, {x:frontX2, y:frontY}];
      // Source at left end of front pipe
      var sourcePos = {x:frontX1, y:frontY};
    }
  } else {
    /* 纵向总管的 y 范围取自**行**主管 ⇒ 至少 2 行（对称修正）。 */
    if (rows >= 2) {
      var tlfX = xPos[FRONT_IN_ROW] + Math.min(FRONT_IN_OFFSET, xSrc[FRONT_IN_ROW] * 0.5);   // 第 1 列左缘（偏移 0）
      var tlfyA = Infinity, tlfyB = -Infinity;
      for (var tlfr2 = 0; tlfr2 < rows; tlfr2++) {
        var tfmy = yPos[tlfr2] + ySrc[tlfr2] * 0.5;   // 该列主管 y（横置主管）
        if (tfmy < tlfyA) tlfyA = tfmy;
        if (tfmy > tlfyB) tlfyB = tfmy;
      }
      frontPipe = [{x:tlfX, y:tlfyA}, {x:tlfX, y:tlfyB}];
      // 水源不动：留在旧总管起点（地块左沿外）
      var sourcePos = {x:b.minX - Math.max(15, b.w * 0.04), y:b.minY};
    } else {
      // Main pipes are horizontal → front pipe is vertical, along the left edge
      var frontX = b.minX - Math.max(15, b.w * 0.04);
      var frontY1 = b.minY;
      var frontY2 = b.minY + b.h;
      frontPipe = [{x:frontX, y:frontY1}, {x:frontX, y:frontY2}];
      var sourcePos = {x:frontX, y:frontY1};
    }
  }
  /* v550b 退化兜底：新分支意外算出零长度总管（阶梯/异形网格导致端点重合等）⇒ 退回旧几何 */
  if (frontPipe && Math.hypot(frontPipe[1].x - frontPipe[0].x, frontPipe[1].y - frontPipe[0].y) < 0.5) {
    if (firstFixedSideIsHorizontal) {
      var tlfFbY = b.minY - Math.max(15, b.h * 0.04);
      frontPipe = [{x:b.minX, y:tlfFbY}, {x:b.minX + b.w, y:tlfFbY}];
      sourcePos = {x:b.minX, y:tlfFbY};
    } else {
      var tlfFbX = b.minX - Math.max(15, b.w * 0.04);
      frontPipe = [{x:tlfFbX, y:b.minY}, {x:tlfFbX, y:b.minY + b.h}];
      sourcePos = {x:tlfFbX, y:b.minY};
    }
  }
  // 若二级页已放置水源点，优先采用二级页的水源几何
  if(ppShare && ppShare.source){ sourcePos={x:ppShare.source.x,y:ppShare.source.y}; }
  /* v170（2026-10-01 用户要求「总管移动之后，水源跟阀门自动跟着移动，地块外的主管就不用显示了」，
     同日更正「不对，是主管」——地块外裁的是主管接入段，不是总管）：
     总管图面平移（AE.moves['front']）在简图渲染层整体跟随 —— 水源点、总管→主管连接段、
     交接三通/阀门全部随总管刚性平移（只动显示层；下方 tlDiagramData 快照仍落设计几何，
     水力/材料/几何签名不变 —— moves 的红线原样保持）。
     tlFrontDesign/tlSrcDesign 预存设计值供快照使用（否则 effPts 会再叠一次 moves）。 */
  var tlFrontMv=(window.RyTlAutoEdits&&typeof window.RyTlAutoEdits.moveOf==='function')?window.RyTlAutoEdits.moveOf('front'):null;
  var tlFrontDesign=frontPipe?JSON.parse(JSON.stringify(frontPipe)):null;
  var tlSrcDesign=sourcePos?{x:sourcePos.x,y:sourcePos.y}:null;
  if(tlFrontMv&&frontPipe){
    frontPipe=frontPipe.map(function(fp){return{x:fp.x+tlFrontMv.dx,y:fp.y+tlFrontMv.dy};});
    if(sourcePos)sourcePos={x:sourcePos.x+tlFrontMv.dx,y:sourcePos.y+tlFrontMv.dy};
  }

  // Draw front main pipe (总管) — orange, thick
  if(frontPipe){
    var fd='';
    for(var fi=0;fi<frontPipe.length;fi++){var fp=ts(frontPipe[fi].x,frontPipe[fi].y);fd+=(fi===0?'M':'L')+fp.x.toFixed(1)+' '+fp.y.toFixed(1)+' ';}
    /* v162：被遮蔽的管在三级简图改「灰色虚线」（管宽不动 ⇒ 命中/几何/水力全不受影响）。
       v165（2026-09-30 用户要求「这个遮蔽功能遇到总管，不能分段遮蔽，要改下，可以分段遮蔽」）：
       总管按「主管接入点」拆成 N 段渲染，每段各自带遮蔽态（半遮蔽 = 一段灰虚线、其余实线）；
       并额外保留一条**不可见的整管引用 path**（data-tlpipe="front" + data-tlpipe-ref）——
       工作区 RyTlPathMeasure.frontPathEl() / getTotalLength() 靠它定位与换算分段弧长，
       缺了它总管分段选择会整条失效。取不到分段（数据未就绪 / 总管非直线 / 无接通主管）→
       退化为原来的单条整管 path（旧行为逐字节一致）。 */
    /* ★ 必须显式传本次几何：window.tlDiagramData 在下面 10440 行才落快照，此刻无参会拿到旧图 */
    var tlFR=(window.RyTlPathMeasure&&typeof window.RyTlPathMeasure.frontRatios==='function')?window.RyTlPathMeasure.frontRatios({frontPipe:frontPipe,mainPipes:mainPipes}):null;
    if(tlFR&&tlFR.length>2&&frontPipe.length===2){
      parts.push('<path data-tlpipe="front" data-tlpipe-ref="1" d="'+fd+'" fill="none" stroke="none" pointer-events="none"/>');
      var tlFa=frontPipe[0],tlFb=frontPipe[1],tlFS=[],tlFN=[];
      for(var fsi=0;fsi+1<tlFR.length;fsi++){
        var ft0=tlFR[fsi],ft1=tlFR[fsi+1];
        var fq0=ts(tlFa.x+(tlFb.x-tlFa.x)*ft0,tlFa.y+(tlFb.y-tlFa.y)*ft0);
        var fq1=ts(tlFa.x+(tlFb.x-tlFa.x)*ft1,tlFa.y+(tlFb.y-tlFa.y)*ft1);
        var fH=window.tlIsPipeSegHidden?window.tlIsPipeSegHidden('front-'+fsi):false;
        var fP='<path data-tlpipe-seg="front-'+fsi+'" d="M'+fq0.x.toFixed(1)+' '+fq0.y.toFixed(1)+' L'+fq1.x.toFixed(1)+' '+fq1.y.toFixed(1)+'" fill="none" stroke="'+(fH?'#64748b':'#111827')+'" stroke-width="6"'+(fH?' stroke-dasharray="8,5" opacity="0.55"':'')+' stroke-linecap="round" stroke-linejoin="round"/>';
        if(fH)tlFS.push(fP);else tlFN.push(fP);   /* 遮蔽段先画：灰色圆头不会压在实线端点 */
      }
      parts.push(tlFS.join('')+tlFN.join(''));
    } else {
      var tlHidF=window.tlIsPipeHidden('front');
      parts.push('<path data-tlpipe="front" d="'+fd+'" fill="none" stroke="'+(tlHidF?'#64748b':'#111827')+'" stroke-width="6"'+(tlHidF?' stroke-dasharray="8,5" opacity="0.55"':'')+' stroke-linecap="round" stroke-linejoin="round"/>');
    }
    /* [v550] 水源连接段：水源留在原位（地块外沿），总管移进分区后二者脱开 ——
       用「垂直优先」折线把水源点接到总管近端（横向总管=先竖后横；竖向总管=先横后竖）。
       与总管同色同宽（视觉上是总管的进水段）；仅示意：不进 frontPipe 数据、
       不参与长度/水力/分段（与主管接入段同原则）。水源已在总管上（距离≤0.5m）不画。 */
    var tlSrcOnFront=(function(){
      if(!sourcePos)return true;
      var sfa=frontPipe[0], sfb=frontPipe[frontPipe.length-1];
      var sdx=sfb.x-sfa.x, sdy=sfb.y-sfa.y, sL2=sdx*sdx+sdy*sdy;
      var stx,sty;
      if(sL2<=0){ stx=sfa.x; sty=sfa.y; }
      else{ var st=Math.max(0,Math.min(1,((sourcePos.x-sfa.x)*sdx+(sourcePos.y-sfa.y)*sdy)/sL2)); stx=sfa.x+sdx*st; sty=sfa.y+sdy*st; }
      return Math.hypot(sourcePos.x-stx,sourcePos.y-sty)<=0.5;
    })();
    if(!tlSrcOnFront){
      var scA=frontPipe[0], scB=frontPipe[frontPipe.length-1];
      var scHoriz=Math.abs(scA.y-scB.y)<1e-6;
      var scEnd=(Math.hypot(sourcePos.x-scA.x,sourcePos.y-scA.y)<=Math.hypot(sourcePos.x-scB.x,sourcePos.y-scB.y))?scA:scB;
      var scElbow=scHoriz?{x:sourcePos.x,y:scEnd.y}:{x:scEnd.x,y:sourcePos.y};
      var scPts=[sourcePos,scElbow,scEnd], scd='';
      for(var sci=0;sci<scPts.length;sci++){var scp=ts(scPts[sci].x,scPts[sci].y);scd+=(sci===0?'M':'L')+scp.x.toFixed(1)+' '+scp.y.toFixed(1)+' ';}
      parts.push('<path data-tlsrcpipe="1" d="'+scd+'" fill="none" stroke="#111827" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" opacity="0.95"/>');
    }
  }

  // 总管→主管连接段（2026-09-15 用户要求，同日扩量）：每根主管朝向总管的一端用垂直接段接到总管上，
  // 不再要求主管贴地块边界（首排内缩时连接段同样画出）；画在裁剪组之外（地块外部分也显示）。
  // 仅示意；不进 mainPipes、不写数据，管线长度计算仍按地块内范围。
  if(frontPipe){
    var fEnd=frontPipe[frontPipe.length-1];
    var frontHoriz=Math.abs(frontPipe[0].y-fEnd.y)<1e-6;   // 总管水平？
    var fxMin=Math.min(frontPipe[0].x,fEnd.x), fxMax=Math.max(frontPipe[0].x,fEnd.x);
    var fyMin=Math.min(frontPipe[0].y,fEnd.y), fyMax=Math.max(frontPipe[0].y,fEnd.y);
    /* v143：主管先按物理线归并（同排共线多段=一根），连接段/三通/阀门按物理线各画一次
       （旧版按分段画：20 段共线主管画 20 条重叠 stub、无交接符号）。 */
    var tlMainLines={}, tlMainIdx={}, tlMainSpan={};
    mainPipes.forEach(function(l,mi){
      var pa=l[0], pb=l[l.length-1];
      var ddx=Math.abs(pa.x-pb.x), ddy=Math.abs(pa.y-pb.y), mk;
      if(ddy<=ddx*0.25) mk='H'+(Math.round((pa.y+pb.y)*2)/2);
      else if(ddx<=ddy*0.25) mk='V'+(Math.round((pa.x+pb.x)*2)/2);
      else mk='S'+pa.x.toFixed(1)+','+pa.y.toFixed(1);
      /* [v550] 物理线取全部共线分段的**全跨度**：总管移进分区后落在跨度内 ⇒ 与主管直接
         相交（三通在交点），不再需要接入段；总管在跨度外时接到最近的跨度端点。
         （旧版只看归并代表段的首段端点，总管进分区后每根主管都会画一条穿过整排的长接入线。） */
      var tlfLo, tlfHi;
      if(mk.charAt(0)==='V'){ tlfLo=Math.min(pa.y,pb.y); tlfHi=Math.max(pa.y,pb.y); }
      else if(mk.charAt(0)==='H'){ tlfLo=Math.min(pa.x,pb.x); tlfHi=Math.max(pa.x,pb.x); }
      if(!tlMainLines[mk]){tlMainLines[mk]=l;tlMainIdx[mk]=mi;tlMainSpan[mk]={lo:tlfLo,hi:tlfHi};}
      else if(tlfLo!==undefined){ var tsp=tlMainSpan[mk]; if(tlfLo<tsp.lo)tsp.lo=tlfLo; if(tlfHi>tsp.hi)tsp.hi=tlfHi; }
    });
    var tlStubs=[], tlJunctions=[];
    Object.keys(tlMainLines).forEach(function(mk){
      var l=tlMainLines[mk];
      /* v162：被遮蔽的主管 = 该管不计入材料清单 → 接入段/三通/阀门符号一并省略 */
      if(window.tlIsPipeHidden('main-'+tlMainIdx[mk]))return;
      var pa=l[0], pb=l[l.length-1];
      if(frontHoriz && pa.x===pb.x){          // 垂直主管 → 接水平总管
        /* [v550] 总管 y 落在该列主管全跨度内 ⇒ 直接相交（画三通+阀，不画接入段）；
           跨度外 ⇒ 接入段连到最近的跨度端点（旧几何=地块外沿，行为不变）。 */
        var tlfFy=frontPipe[0].y, tlfSpV=tlMainSpan[mk];
        var tlfInV = tlfSpV && tlfFy>=tlfSpV.lo-0.5 && tlfFy<=tlfSpV.hi+0.5;
        var tlfPtV = tlfInV ? null : (Math.abs(tlfSpV.lo-tlfFy)<=Math.abs(tlfSpV.hi-tlfFy) ? {x:pa.x,y:tlfSpV.lo} : {x:pa.x,y:tlfSpV.hi});
        if(pa.x>=fxMin-0.5 && pa.x<=fxMax+0.5){
          if(!tlfInV)tlStubs.push([{x:pa.x,y:tlfFy},{x:pa.x,y:tlfPtV.y}]);
          tlJunctions.push({x:pa.x,y:tlfFy,dx:0,dy:1,stubM:tlfInV?2:Math.abs(tlfPtV.y-tlfFy)});
        }
      } else if(!frontHoriz && pa.y===pb.y){  // 水平主管 → 接垂直总管
        var tlfFx=frontPipe[0].x, tlfSpH=tlMainSpan[mk];
        var tlfInH = tlfSpH && tlfFx>=tlfSpH.lo-0.5 && tlfFx<=tlfSpH.hi+0.5;
        var tlfPtH = tlfInH ? null : (Math.abs(tlfSpH.lo-tlfFx)<=Math.abs(tlfSpH.hi-tlfFx) ? {x:tlfSpH.lo,y:pa.y} : {x:tlfSpH.hi,y:pa.y});
        if(pa.y>=fyMin-0.5 && pa.y<=fyMax+0.5){
          if(!tlfInH)tlStubs.push([{x:tlfFx,y:pa.y},{x:tlfPtH.x,y:pa.y}]);
          tlJunctions.push({x:tlfFx,y:pa.y,dx:1,dy:0,stubM:tlfInH?2:Math.abs(tlfPtH.x-tlfFx)});
        }
      }
    });
    /* v170b（2026-10-01 用户更正「不对，是主管」）：总管被拖动过后，主管→总管接入段
       （主管色粗线，用户口中的「地块外的主管」）并入地块裁剪组 —— 总管尚在地块外/半进时，
       伸出地块的那段接入线不再显示；未拖动时保持原样（接入段画在裁剪组之外是老场景：
       总管在地块外沿，接入线必须可见）。data-tlstub 供工作区克隆/闸门选择器使用。 */
    if(tlFrontMv)parts.push('<g clip-path="url(#tlPlotClip)" data-tlstubg="1">');
    tlStubs.forEach(function(sl){
      var sd='';
      for(var si=0;si<sl.length;si++){var sp2=ts(sl[si].x,sl[si].y);sd+=(si===0?'M':'L')+sp2.x.toFixed(1)+' '+sp2.y.toFixed(1)+' ';}
      parts.push('<path data-tlstub="1" d="'+sd+'" fill="none" stroke="#185FA5" stroke-width="5" stroke-linecap="round"/>');
    });
    if(tlFrontMv)parts.push('</g>');
  }

  // Draw main pipes (blue) — clipped to plot boundary
  parts.push('<g clip-path="url(#tlPlotClip)">');
  mainPipes.forEach(function(l,mi){
    var md='';
    for(var i=0;i<l.length;i++){var p=ts(l[i].x,l[i].y);md+=(i===0?'M':'L')+p.x.toFixed(1)+' '+p.y.toFixed(1)+' ';}
    var tlHidM=window.tlIsPipeHidden('main-'+mi);
    parts.push('<path data-tlpipe="main-'+mi+'" d="'+md+'" fill="none" stroke="'+(tlHidM?'#64748b':'#185FA5')+'" stroke-width="5"'+(tlHidM?' stroke-dasharray="8,5" opacity="0.55"':'')+' stroke-linecap="round" stroke-linejoin="round"/>');
  });

  // Draw branch pipes (green) — clipped to plot boundary
  branchPipes.forEach(function(l,bi){
    var bd='';
    for(var i=0;i<l.length;i++){var p=ts(l[i].x,l[i].y);bd+=(i===0?'M':'L')+p.x.toFixed(1)+' '+p.y.toFixed(1)+' ';}
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
    for(var i=0;i<l.length;i++){var p=ts(l[i].x,l[i].y);td+=(i===0?'M':'L')+p.x.toFixed(1)+' '+p.y.toFixed(1)+' ';}
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
    var tlNodeLayerSvg = tlBuildTlNodesLayer({ frontPipe: frontPipe, mainPipes: mainPipes, branchPipes: branchPipes, ts: ts });
    parts.push(tlNodeLayerSvg || '<g data-tlnode-layer="1"></g>');
  } catch (eNdLink) { parts.push('<g data-tlnode-layer="1"></g>'); }

  if(sourcePos){
    var sp=ts(sourcePos.x,sourcePos.y);
    /* [v255 2026-10-06 用户要求] 水源点可右键换向：外圈透明热区 r=18 承接 contextmenu
       （事件委托挂 document，见 tlSrcFlip）；<title> 给悬停提示。 */
    parts.push('<g data-tl-src="1"><circle cx="'+sp.x.toFixed(1)+'" cy="'+sp.y.toFixed(1)+'" r="18" fill="rgba(0,0,0,0)"><title>右键：切换水源方向（换到总管另一端）</title></circle><circle cx="'+sp.x.toFixed(1)+'" cy="'+sp.y.toFixed(1)+'" r="10" fill="#f59e0b" stroke="#fff" stroke-width="2"/></g>');
    var tlSrcLabelY=tlHdrY0+tlHeaderLines.length*18+16; // 信息行下方
    /* v160（用户 2026-09-29：「水源/水泵 标注文字距离总管道近一些。」）
       原口径：标签钉在画布左边界 x=40，靠一条长虚线横跨空白拉到水源点
               （实测：标签右缘距总管 ≈125 CSS px，太远）。
       现口径：标签右缘落在「水源点圆心 −(圆半径 + 净距)」处，随水源点移动；
               引线相应只剩「水源点左侧一小段 + 垂直落到圆心」。
       两个数字：TL_SRC_LABEL_R 必须与上面 circle 的 r=10 同步；
                 TL_SRC_LABEL_GAP 是唯一可调量（嫌贴得太紧就调大）。 */
    var TL_SRC_LABEL_R=10, TL_SRC_LABEL_GAP=6;
    // 保底：空间不足时右缘退回「左边界 40 + 标签实宽 56」，避免文字越出画布左缘
    var tlSrcLabelX=Math.max(sp.x-(TL_SRC_LABEL_R+TL_SRC_LABEL_GAP), 96);
    // 引线：标签右缘 → 水源点圆心（水平一小段 + 垂直落到圆心）
    parts.push('<polyline points="'+tlSrcLabelX.toFixed(1)+','+(tlSrcLabelY+4).toFixed(1)+' '+sp.x.toFixed(1)+','+(tlSrcLabelY+4).toFixed(1)+' '+sp.x.toFixed(1)+','+sp.y.toFixed(1)+'" fill="none" stroke="#f59e0b" stroke-width="1.2" stroke-dasharray="4,3" opacity="0.8" stroke-linecap="round" stroke-linejoin="round"/>');
    parts.push('<text x="'+tlSrcLabelX.toFixed(1)+'" y="'+tlSrcLabelY.toFixed(1)+'" text-anchor="end" font-size="11" font-weight="600" fill="#92400e">水源/水泵</text>');
  }

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
  valves.filter(function(v){return window.atPointInPolygon?window.atPointInPolygon(v,poly):true;}).forEach(function(v,idx){
    var vp=ts(v.x,v.y);
    if(v.ax!==undefined && v.ay!==undefined){
      var ap=ts(v.ax, v.ay);
      parts.push('<line x1="'+ap.x.toFixed(1)+'" y1="'+ap.y.toFixed(1)+'" x2="'+vp.x.toFixed(1)+'" y2="'+vp.y.toFixed(1)+'" stroke="#185FA5" stroke-width="3.5" stroke-linecap="round" opacity="0.92"/>');
      /* 任务⑧（2026-09-24 用户要求）：主管×支管交接处补三通方块 —— 与总管×主管交接
         （data-junction-tee，深蓝白边 9×9）同款式，交接符号全覆盖。
         [v556] 最外一排分区的主管末端是**90°弯头**（不再向下延伸）：同一方块内叠一个白色
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
    parts.push(window.ryValveSVG(vp.x, vp.y));   /* v159：与总管×主管交接阀同规格（尺寸取自 window.RY_VALVE） */
  });

  /* v143（用户要求）：总管×主管交接处画「三通 + 阀门」——三通方块在总管口，
     阀门（红⊗，与分区阀同款式）接在主管接入段上（连接段中点向右侧/下侧固定距离偏移）。
     数量=物理主管根数，与材料清单三通/总管接入阀行同源。
     ★ v171c（请求⑬ 2026-10-01）：本渲染从「管线之前」移到「管线之后」（地块组末尾），
     使深蓝白边四方块完整露在主管/支管之上，四周白框不再被管道覆盖 —— 与 10740
     主管×支管交接三通同口径（都画在管线之后，白框全可见，视觉一致）。
     阀门恒置于接入段「右侧（竖管）/ 下侧（横管）」固定距离 JC_VALVE_OFF（米），
     用短直连线（主管蓝）接通；随总管平移（jc 已由 tlFrontMv 刚性平移）。 */
  if(tlJunctions && tlJunctions.length){
    tlJunctions.forEach(function(jc){
      var jp=ts(jc.x,jc.y);
      parts.push('<rect data-junction-tee data-junction-front="1" x="'+(jp.x-4.5).toFixed(1)+'" y="'+(jp.y-4.5).toFixed(1)+'" width="9" height="9" fill="#0C447C" stroke="#ffffff" stroke-width="1.5"/>');
      if(jc.stubM>1){
        /* v171d（用户 2026-10-01 更正：以「总管」为基准，不是主管/接入段）——
           总管横向(jc.dy≠0) → 阀恒在总管下侧(+y)；总管竖向(jc.dx≠0) → 阀恒在总管右侧(+x)。
           基准点取「总管×主管交点」jm（落在总管上），阀距总管固定垂直距离 JC_VALVE_OFF（米）。*/
        var jm=ts(jc.x,jc.y);
        var JC_VALVE_OFF=10.0; // 固定距离（米）：阀距总管（交点）的垂直距离（2026-10-01 用户要求「适当放大一点」：6.0→10.0）
        var jox=(jc.dx===0)?0:JC_VALVE_OFF; // 总管竖向 → 右侧(+x)
        var joy=(jc.dy===0)?0:JC_VALVE_OFF; // 总管横向 → 下侧(+y)
        var jv=ts(jc.x+jox, jc.y+joy);
        parts.push('<line x1="'+jm.x.toFixed(1)+'" y1="'+jm.y.toFixed(1)+'" x2="'+jv.x.toFixed(1)+'" y2="'+jv.y.toFixed(1)+'" stroke="#185FA5" stroke-width="3.5" stroke-linecap="round" opacity="0.92"/>');
        parts.push('<g data-junction-valve><circle cx="'+jv.x.toFixed(1)+'" cy="'+jv.y.toFixed(1)+'" r="6.5" fill="#ef4444" stroke="#ffffff" stroke-width="2"/>'
          +'<line x1="'+(jv.x-3.6).toFixed(1)+'" y1="'+(jv.y-3.6).toFixed(1)+'" x2="'+(jv.x+3.6).toFixed(1)+'" y2="'+(jv.y+3.6).toFixed(1)+'" stroke="#ffffff" stroke-width="1.4"/>'
          +'<line x1="'+(jv.x+3.6).toFixed(1)+'" y1="'+(jv.y-3.6).toFixed(1)+'" x2="'+(jv.x-3.6).toFixed(1)+'" y2="'+(jv.y+3.6).toFixed(1)+'" stroke="#ffffff" stroke-width="1.4"/></g>');
      }
    });
  }
  // ===== 地块组结束：以下参数/图例/A3框固定不动 =====
  /* v488：记录地块组闭合标签在 parts 中的下标 —— 最不利路径标注（tlWorstPathMarkSVG）
     几何上属于地块组（须随 tlInitDrag 的图面拖动 translate 一起平移），但其几何取自
     window.tlDiagramData 快照，而快照在此闭合**之后**才落地，不能当场画。
     故先记下标，待快照落地后用 splice 插回本闭合标签之前（见下方 tlWorstPathMarkSVG 调用处）。
     病史：v180 节点层曾因画在组外而错位（本文件 tlInitDrag 注释），紫线标注犯了同样的错 ——
     图面拖动位移存 localStorage['tl-plot-pos'] 且每次重生成自动恢复，组内管线整体平移、
     组外紫线原地不动 ⇒ 恒定偏移（用户实测「紫色水流动画线与管道路径偏位」）。 */
  var tlPlotGCloseIdx = parts.length;
  parts.push('</g>');

  // Legend + params at bottom —— 整体下移、分块对齐、与图面拉开间距
  var r=computeThreeLevel();
  /* ===== 图面几何快照「提前落地」+ 重算（2026-09-16）=====
     computeThreeLevel 的「最远分区最不利路径」长度读 window.tlDiagramData；若按原来的顺序
     （先算 r → 再写 tlDiagramData）本幅图的简图参数/水泵扬程会用上一幅图的旧几何。
     故这里先把本次几何快照写入，再重算一次 r，并同步刷新左栏结果条与左下角损失卡。 */
  window.tlDiagramData = { version: 1, schemaVersion: 1, world: 'meter', generatedAt: new Date().toISOString(), plot: { w: plotW, h: plotH },
    poly: JSON.parse(JSON.stringify(poly)),
    combinedN: tlGetZoneCount(),   /* 2026-09-16 联合灌溉区数 N，供工作区分组着色读取（简图不变） */
    zones: { cols: cols, rows: rows, xPos: xPos.slice(), yPos: yPos.slice(), xPlan: xPlan.slice(), yPlan: yPlan.slice(), xSrc: xSrc.slice(), ySrc: ySrc.slice(),
             /* v98h 阶梯覆盖表必须随图面数据走：tlAutoGenerate 每次重建 tlDiagramData，
                漏掉这两项就会在「松手 / 改参数 / 切页重生成」时把阶梯抹平（线弹回直的一条）。
                空表时为 null ⇒ 工作区与面积计算都退回基础网格，与改动前一致。 */
             cutOffX: (tlZoneStepRef ? tlZoneStepRef.x : null), cutOffY: (tlZoneStepRef ? tlZoneStepRef.y : null) },
    mainPipes: JSON.parse(JSON.stringify(mainPipes)), branchPipes: JSON.parse(JSON.stringify(branchPipes)),
    valves: JSON.parse(JSON.stringify(valves)), dripTapes: JSON.parse(JSON.stringify(dripTapes)),
    partialFlags: tlPartialFlags.slice(), zoneActMu: tlZoneActMu.slice(),
    /* v170：快照落「设计几何」—— 总管平移只动显示层（上面 frontPipe/sourcePos
       已是平移后的绘制副本）；AE.effPts 还会再叠一次 moves，写移动值会双重平移。 */
    frontPipe: tlFrontDesign,
    sourcePos: tlSrcDesign };
  r = computeThreeLevel();
  try { tlUpdatePlanBar(); } catch (e) { }
  var pumpFlowEl=document.getElementById('tlPlanPumpFlow');
  var pumpHeadEl=document.getElementById('tlPlanPumpHead');
  var pumpPowerEl=document.getElementById('tlPlanPumpPower');
  var frontPipeEl=document.getElementById('tlPlanFrontPipe');
  var mainPipeEl=document.getElementById('tlPlanMainPipe');
  var branchPipeEl=document.getElementById('tlPlanBranchPipe');
  /* meta 按刷新后的结果条文本补齐（iso/工作区只读；不参与计算） */
  window.tlDiagramData.meta = { zoneCount: totalZones,
    flowModel: { zoneFlow: r.zoneFlow, branchFlow: r.branchFlow, combinedFlow: r.combinedFlow, zoneCount: r.zoneCount, branchCount: r.branchCount },
    pump: { flow: (pumpFlowEl ? pumpFlowEl.textContent : ''), head: (pumpHeadEl ? pumpHeadEl.textContent : ''), power: (pumpPowerEl ? pumpPowerEl.textContent : '') },
    pipes: { front: (frontPipeEl ? frontPipeEl.textContent : ''), main: (mainPipeEl ? mainPipeEl.textContent : ''), branch: (branchPipeEl ? branchPipeEl.textContent : '') } };
  /* 水力校核页唯一计算来源：保存三级规划的最终几何与已确定的设计流量。
     地图反投只承担显示，不再用滴灌带像素/坐标反推流量。 */
  try {
    window.RyIrrigationDataStore.writeHydraulicDesign({ version: 1, ts: Date.now(),
      generatedAt: window.tlDiagramData.generatedAt,
      geometry: { frontPipe: JSON.parse(JSON.stringify(window.tlDiagramData.frontPipe || [])),
        mainPipes: JSON.parse(JSON.stringify(window.tlDiagramData.mainPipes || [])),
        branchPipes: JSON.parse(JSON.stringify(window.tlDiagramData.branchPipes || [])) },
      hydraulics: { combinedFlow: r.combinedFlow, zoneFlow: r.zoneFlow, branchFlow: r.branchFlow,
        tapePressureM: r.tapePressureM, lift: r.lift, dh: r.dh, filterLoss: r.filterLoss,
        efficiency: r.efficiency, pumpHead: r.pumpHead,
        frontPipe: { od: r.frontPipe.od }, mainPipe: { od: r.mainPipe.od }, branchPipe: { od: r.branchPipe.od } } });
  } catch (eHydSnapshot) { }

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
     图例 6 槽位总宽约 346px（末项「滴灌带」文字止于 lx+346），右缘贴 frameX 右边线
     （svgW-8）内缩 4px ⇒ lx=svgW-358。与参数行同基线（ly=iy+17）不变。 */
  var lx=svgW-358, ly=iy+17;
  parts.push('<g id="tlLegendGroup" font-size="10" font-weight="600">');
  parts.push('<rect x="'+lx+'" y="'+ly+'" width="14" height="4" fill="#111827" rx="2"/><text x="'+(lx+20)+'" y="'+(ly+2)+'" dominant-baseline="central" fill="#111827">总管</text>');
  parts.push('<rect x="'+(lx+60)+'" y="'+ly+'" width="14" height="4" fill="#185FA5" rx="2"/><text x="'+(lx+80)+'" y="'+(ly+2)+'" dominant-baseline="central" fill="#0C447C">主管</text>');
  parts.push('<rect x="'+(lx+120)+'" y="'+ly+'" width="14" height="3" fill="#16a34a" rx="2"/><text x="'+(lx+140)+'" y="'+(ly+2)+'" dominant-baseline="central" fill="#166534">支管</text>');
  parts.push('<circle cx="'+(lx+185)+'" cy="'+(ly+2)+'" r="5" fill="#f59e0b"/><text x="'+(lx+196)+'" y="'+(ly+2)+'" dominant-baseline="central" fill="#92400e">水源</text>');
  parts.push('<circle cx="'+(lx+245)+'" cy="'+(ly+2)+'" r="5" fill="#ef4444"/><text x="'+(lx+256)+'" y="'+(ly+2)+'" dominant-baseline="central" fill="#991b1b">阀门</text>');
  parts.push('<line x1="'+(lx+300)+'" y1="'+(ly+2)+'" x2="'+(lx+312)+'" y2="'+(ly+2)+'" stroke="#67e8f9" stroke-width="1.4" stroke-dasharray="3,3"/><text x="'+(lx+316)+'" y="'+(ly+2)+'" dominant-baseline="central" fill="#155e75">滴灌带</text>');
  parts.push('</g>');

  /* [v416] 方向代价如实告知：全图统一方向后，少数派分区会「带长偏短 / 支管略增」，
     超限分区已自动分段——不静默取舍，用户可据此回调「单边铺设长度」或分区数。 */
  try {
    var _ar = tlAxisReport || window.__ryTapeAxisReport || null;
    if (_ar && _ar.report && (_ar.report.shortZones > 0 || _ar.report.overZones > 0)) {
      var _rp = _ar.report, _tot = Math.max(1, cols * rows);
      var _tx = '布管方向：滴灌带' + (_ar.tapeAxis === 'x' ? '横向' : '纵向') + '敷设 · 主管支管垂直（全图统一）';
      if (_rp.shortZones > 0) _tx += '；' + _rp.shortZones + '/' + _tot + ' 个分区带长短于最优（均 ' + _rp.avgTape.toFixed(0) + 'm / 最优 ' + _rp.avgOpt.toFixed(0) + 'm，支管略增）';
      if (_rp.overZones > 0) _tx += '；' + _rp.overZones + ' 个分区带长超单边铺设长度，已自动分段';
      parts.push('<text x="40" y="' + (iy + 38) + '" font-size="9.5" font-weight="600" fill="#92400e">' + _tx + '</text>');
    }
  } catch (eAxisHint) { }

  /* 最不利路径标注（第四十七轮）：必须放在 window.tlDiagramData 落地**之后**（本函数 8632 行）才画 ——
     标注几何由 tlWorstPathLen 读 tlDiagramData 得出；早于快照落地会标到上一幅图的旧几何。
     v488：画在 tlPlotGCloseIdx（地块组 '</g>' 之前）——几何上归入 #tlPlotGroup，
     随图面拖动 translate 一起平移，与管线/水源/节点层保持同组（修复恒定偏位）；
     时序上仍在快照落地之后，满足上面的约束。splice 只移动字符串位置，SVG 嵌套
     （data-tlworst 组内无嵌套 <g>）与工作区克隆剥离正则均不受影响。 */
  try {
    var tlWorstSvg = tlWorstPathMarkSVG(ts);
    if (tlWorstSvg) parts.splice(tlPlotGCloseIdx, 0, tlWorstSvg);
  } catch (e) { }

  parts.push('</svg>');
  /* v180b（2026-10-02）：缓存本次几何映射，供 tlRefreshTlNodesLayer 在 RyTlNodes 变更时
     实时刷新三级简图的节点/连线图层（无需重新「生成管线图」）。 */
  window.__tlPlanGeo = { frontPipe: frontPipe, mainPipes: mainPipes, branchPipes: branchPipes, ts: ts };
  var svgStr=parts.join('');
  tlDiagramSVG=svgStr;
  document.getElementById('tlDiagramContent').innerHTML=svgStr;
  /* [v215] 轮灌演示跨重渲染：简图整棵重建后立刻按当前演示组重涂 + 演示 chips 重建
     （组数随 N/手动分组变化；chips 内部自带越界退出守卫。工作区侧由 RyTlWs.render 内恢复）。 */
  try { if (window.__tlDemoGroup != null) tlApplyDemoHighlight(window.__tlDemoGroup); } catch (e) { }
  try { if (typeof tlRenderDemoChips === 'function') tlRenderDemoChips(); } catch (e) { }
  /* [map-enhance] 管网反投卫星图（2026-09-26）：把 tlDiagramData 米坐标管线按当前 geo 基准
     反投成经纬度，写入 localStorage['runye_network_layout']，地图页 runye-map-enhance.js 读取后
     在卫星图叠加真实主管/支管/水源点。无 geo 基准（手动画矩形、未经地图回传）时静默跳过。
     整段删除即卸载，不影响主流程。 */
  try { (function(){
    var dd = window.tlDiagramData; if(!dd || dd.world!=='meter') return;
    var base = window.__runyeGeoBase || null;
    if(!base || typeof base.refLat!=='number' || typeof base.refLng!=='number' || !isFinite(base.refLat) || !isFinite(base.refLng)){
      window.RyIrrigationDataStore.writeNetworkLayout(null);
      var plotStore=window.RyPlotLibraryStore;
      if(plotStore && typeof plotStore.removeUnique==='function'){
        var removed=plotStore.removeUnique('auto-current');
        if(!removed.ok)console.warn('[map-enhance] automatic plot cleanup skipped:',removed.error);
      }else console.warn('[map-enhance] automatic plot cleanup skipped: plot library store unavailable');
      return;
    }
    var R=6378137, mlat=R*Math.PI/180, cosLat=Math.cos(base.refLat*Math.PI/180);
    /* [map-enhance 2026-09-29] 地图框线方位恒定：二级页的「地块旋转 / 镜像」只是作图便利变换
       （把地块摆正便于分区与布管），不得回传到在线地图。window.__runyeMapFramePoly 保存
       「地图口径」（未旋转 / 未镜像）的地块顶点（只在 地图回传 / 设为当前 / 读存档 三处写入）；
       这里按顶点对应关系反解出「当前世界坐标 → 地图口径」的仿射逆变换，并施加到整段反投几何
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
    function ln2ll(line){ if(!line||line.length<2) return null; var out=[]; for(var k=0;k<line.length;k++){ var ll=p2ll(line[k]); if(ll) out.push(ll); } return out.length>=2?out:null; }
    function dnOf(txt){ var m=/(\d+)/.exec(String(txt||'')); return m?+m[1]:0; }
    var meta=dd.meta||{}, mpipes=(meta.pipes)||{};
    var segDn={ front:dnOf(mpipes.front), main:dnOf(mpipes.main)||90, branch:dnOf(mpipes.branch)||63 };
    var segments=[];
    function pushSegs(arr,dn,prefix){ if(!arr) return; for(var i=0;i<arr.length;i++){ var ll=ln2ll(arr[i]); if(ll) segments.push({id:prefix+i, name:prefix+(i+1), dn:dn, kind:prefix, latLng:ll}); } }
    if(dd.frontPipe) pushSegs([dd.frontPipe], segDn.front||segDn.main, 'front');
    pushSegs(dd.mainPipes, segDn.main, 'main');
    pushSegs(dd.branchPipes, segDn.branch, 'branch');
    var src = dd.sourcePos ? p2ll(dd.sourcePos) : null;
    if(!segments.length && !src){window.RyIrrigationDataStore.writeNetworkLayout(null);return;}
    window.RyIrrigationDataStore.writeNetworkLayout({ sourcePos: src?{lat:src[0],lng:src[1]}:null, segments: segments, plotId:window.currentPlotId || null, crs:'GCJ-02', ts: Date.now() });
    /* [map-enhance] 阀门 + 滴灌带反投（2026-09-26 任务1，用户契约）：地图侧 enhancement 按
       runye_network_layout.valves（红圈）/ .dripTapes（青色虚线）渲染 —— 读出来补字段再写回，
       不重写整个 key（地图侧可能同帧写过其他字段）。 */
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
      var net = window.RyIrrigationDataStore.readNetworkLayout() || {};
      net.valves = valvesLL;
      net.dripTapes = dripLL;
      if(window.RyMapPartition)RyMapPartition.capture(net);
      window.RyIrrigationDataStore.writeNetworkLayout(net);
    }catch(eVT){}
    /* [map-enhance] 同步地块多边形到地块库（带 polyLatLng）：切到在线地图页自动叠加地块轮廓，
       与管网一起显示。固定 id=auto-current 幂等更新，不污染用户手动保存的其他地块。 */
    try{
      if(dd.poly && dd.poly.length>=3){
        var pll = []; for(var pi=0; pi<dd.poly.length; pi++){ var llpt=p2ll(dd.poly[pi]); if(llpt) pll.push(llpt); }
        if(pll.length>=3){
          var area=0; for(var ai=0; ai<pll.length; ai++){ var a=pll[ai], b=pll[(ai+1)%pll.length];
            area += ((a[1]-b[1])*Math.PI/180)*(2 + Math.sin(a[0]*Math.PI/180)+Math.sin(b[0]*Math.PI/180)); }
          area = Math.abs(area*6378137*6378137/2);
          var sl=0, sn=0; pll.forEach(function(q){ sl+=q[0]; sn+=q[1]; });
          var entry={ id:'auto-current', name:'当前设计地块', mu:Math.round(area/666.67*100)/100, sqm:Math.round(area),
            poly:dd.poly.map(function(p){var q=toFrame(p);return {x:q.x,y:q.y};}), polyLatLng:pll, center:{lat:+(sl/pll.length).toFixed(6), lng:+(sn/pll.length).toFixed(6)},
            geo:{refLat:base.refLat, refLng:base.refLng, proj:'mercatorLocal'}, source:'auto', ts:Date.now() };
          if(net){entry.partitionPlan=net.partitionPlan;entry.partitions=net.partitions;entry.designPlotId=net.plotId;}
          var plotStore=window.RyPlotLibraryStore;
          if(plotStore && typeof plotStore.upsertUnique==='function'){
            var saved=plotStore.upsertUnique('auto-current',entry);
            if(!saved.ok)console.warn('[map-enhance] automatic plot sync skipped:',saved.error);
          }else console.warn('[map-enhance] automatic plot sync skipped: plot library store unavailable');
        }
      }
    }catch(ePlot){}
  })(); } catch(eNet){ try{ console.warn('[map-enhance] network projection skipped:', eNet && eNet.message); }catch(_){} }
  /* 系统简图图框同步（2026-09-19）：克隆同一 SVG，id 加 sc_ 前缀（url(# / href="# 引用同步替换），防 DOM id 重复 */
  try {
    var sysPipeBox = document.getElementById('tlSysPipeBox');
    if (sysPipeBox) {
      document.getElementById('tlSysPipeBoxBody').innerHTML =
        svgStr.replace(/id="/g, 'id="sc_').replace(/url\(#/g, 'url(#sc_').replace(/href="#/g, 'href="#sc_');
      sysPipeBox.style.display = 'block';
    }
  } catch (ePipeBox) { }
  /* 固定文字层填充（2026-09-16）：与 SVG 内三组同源数据；工作区缩放/平移不影响 */
  (function(){
    var ov=document.getElementById('tlWsOverlays');
    if(!ov)return;
    var oh=document.getElementById('tlWsOvHeader'),ol=document.getElementById('tlWsOvLegend');
    /* 参数行已取消（2026-09-16）：三级设计工作区左侧工具栏已有参数，工作区不再重复显示；
       简图 SVG 内 tlParamsGroup（下载/打印口径）保留不取消 */
    if(oh)oh.innerHTML=tlHeaderLines.join('<br>');
    if(ol)ol.innerHTML='<span style="display:inline-flex;align-items:center;vertical-align:middle;gap:5px;margin:0 9px"><i style="display:inline-block;width:14px;height:4px;border-radius:2px;background:#111827"></i>总管</span>'
      +'<span style="display:inline-flex;align-items:center;vertical-align:middle;gap:5px;margin:0 9px"><i style="display:inline-block;width:14px;height:4px;border-radius:2px;background:#185FA5"></i>主管</span>'
      +'<span style="display:inline-flex;align-items:center;vertical-align:middle;gap:5px;margin:0 9px"><i style="display:inline-block;width:14px;height:3px;border-radius:2px;background:#16a34a"></i>支管</span>'
      +'<span style="display:inline-flex;align-items:center;vertical-align:middle;gap:5px;margin:0 9px"><i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#f59e0b"></i>水源</span>'
      +'<span style="display:inline-flex;align-items:center;vertical-align:middle;gap:5px;margin:0 9px"><i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#ef4444"></i>阀门</span>';
    ov.style.display='block';
  })();
  // 平面管网几何快照已在参数块之前写入并重算
  tlInitDrag();
  tlInitHeaderDrag();
  document.getElementById('tlDiagramWrap').style.display='block';
  // 下载/打印按钮已取消（2026-09-16 第三十三轮）：元素已从左栏移除，不再显示
  tlRefreshGroupLegend();   /* 联合灌溉分组图例已于第五十九轮取消（本调用现为空操作，保留以便一行恢复） */
  try { tlRefreshLossCard(); } catch (e) { }   /* 左下角「管段长度与水头损失」按本次图面几何刷新 */
  /* 右侧「管段管径与损失」统计表（第四十二轮）：按新图面几何重算每段管径与损失 */
  try { if (typeof window.tlWsStatsRender === 'function') window.tlWsStatsRender(); } catch (e) { }
  try { tlPushToHydraulicCalc(); } catch (e) { }   /* 三级方案数据 → 水力计算器 自动推送（2026-09-19） */
  try { tlWsBarSync(); } catch (e) { }
  // tlSavePng 已移除，不再显示
  // 生成完直接落在「三级设计」工作区（可缩放/可插管）
  /* v170c：options.stay 为真时不跳视图 —— AE 订阅（front 平移→重建简图）每帧触发本函数，
     若每次都 tlShowWorkspace 会把用户从简图视图强行切走（且拖动中每帤 rySetTab）。其余调用方不传 stay，行为不变。 */
  if(!options.stay){ try{ tlShowWorkspace(); }catch(e){} }
  console.log('[tlAutoGenerate] SVG generated successfully');
  } catch(err) {
    console.error('[tlAutoGenerate] Error:', err);
    var errDiv = document.getElementById('tlDiagramContent');
    if(errDiv) {
      errDiv.innerHTML = '<div style="color:#dc2626;padding:20px;font-size:14px;border:1px solid #fca5a5;background:#fef2f2;border-radius:8px;">⚠️ 生成图纸时出错：' + esc(err.message) + '<br><br>请截图此错误信息反馈。</div>';
      document.getElementById('tlDiagramWrap').style.display='block';
    } else {
      alert('生成图纸时出错：' + err.message);
    }
  }
}

/* 导出平面图时的 SVG 序列化统一入口。 */
function tlExportSvgString(ctn){
  var svgEl=ctn?ctn.querySelector('svg'):null;
  if(!svgEl)return tlDiagramSVG;
  return new XMLSerializer().serializeToString(svgEl);
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
      +'[data-dim].tl-dimsel text{fill:#b45309}';
    document.head.appendChild(_st);
  }
  /* 拖拽逻辑：仅点击地块组内部时触发 */
  var dragStart=null;
  svgEl.addEventListener('mousedown',function(e){
    if(e.button!==0)return;
    var target=e.target;
    if(!target||!target.closest||!target.closest('#tlPlotGroup'))return;
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
    e.preventDefault();
    var scale=getScale();
    dragStart={x:e.clientX,y:e.clientY,ox:pos.x,oy:pos.y,scale:scale};
    document.body.style.userSelect='none';
    svgEl.style.cursor='grabbing';
  });
  window._tlDragMove=function(ev){
    if(!dragStart)return;
    var s=dragStart.scale;
    pos.x=dragStart.ox+(ev.clientX-dragStart.x)*s;
    pos.y=dragStart.oy+(ev.clientY-dragStart.y)*s;
    clampPos(pos);
    applyPos();
  };
  window._tlDragUp=function(){
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
  var fpSys = window.tlFigParamLines ? window.tlFigParamLines(computeThreeLevel()) : null;
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
  }
  /* 目标功能区若未激活（如从顶部导航直接点「⚙️ 生成系统图」），先切过去 */
  if (typeof window.ryShowSection === 'function' && !sec.classList.contains('ry-active')) {
    window.ryShowSection(sec, null);
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
    /* 先定「管段管径与损失」统计表的显隐——第四十四轮起它挂在工具轨内部，显隐不再改画布列宽；
       仍保持「先刷表、再渲染画布」的顺序（表内容随图面几何变化，顺序固定可避免重复渲染）。 */
    if (typeof window.tlWsStatsRender === 'function') { try { window.tlWsStatsRender(); } catch (e) { } }
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
        wsCtn.innerHTML = '<div class="tl-ws-empty">请先生成三级管线平面图（点右侧工具栏底部的「🔄 生成管线图」）</div>';
      }
    }
    /* 工具栏显隐：无图时也显示，但只露「生成管线图」（第四十三轮） */
    try { tlWsBarSync(); } catch (e) { }
    try { if (typeof window.tlRefreshGroupPanel === 'function') window.tlRefreshGroupPanel(); } catch (e) { }
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
  try { window.dispatchEvent(new Event('resize')); } catch (e) { }
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
    try { if (typeof window.tlRefreshGroupPanel === 'function') window.tlRefreshGroupPanel(); } catch (e) { }
    /* 2026-09-16：联合灌溉区数 N 改变 → 联合灌溉分组色带同步。
       分组色带画在「三级简图」源头（本生成器），而工作区底图 = 简图克隆，
       故 N 变必须重生成简图，两处色带才能同步；未生成过简图（无 polygon）时仅刷新图例。 */
    if (window.tlDiagramData) {
      window.tlDiagramData.combinedN = tlGetZoneCount();
      if (document.querySelector('#tlDiagramContent svg') && window.measuredPolygon && window.measuredPolygon.length >= 3) {
        try { tlAutoGenerate(); } catch (e) {}
      } else {
        var _wsc = document.getElementById('tlWsContent');
        /* 同 rySetTab：统计表显隐先定，再渲染画布（否则缩放按旧列宽算、点击坐标偏移） */
        try { if (typeof window.tlWsStatsRender === 'function') window.tlWsStatsRender(); } catch (e) { }
        try { tlWsBarSync(); } catch (e) { }
        if (_wsc && _wsc.offsetParent !== null && window.RyTlWs) window.RyTlWs.render(_wsc, window.tlDiagramData);
      }
      tlRefreshGroupLegend();   /* 图例已于第五十九轮取消（空操作；保留以便恢复） */
    }
  });
});
/* v98 手动分区成组：入口改为右侧「联合灌溉分组」面板（#tlGroupPanel），见下方 tlRefreshGroupPanel / 面板接线 IIFE。
   原工具轨「✎分区成组 / ✓成组 / ↺自动均分」三按钮已移除（避免两套入口混淆）。 */
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
