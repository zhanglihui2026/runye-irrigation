/*!
 * irrigation-bridge.js — 灌溉工具 ↔ 数字农业 的唯一桥接层（协议 v1）
 * 由 index.html 通过 <script src="irrigation-bridge.js"> 引入。
 *
 * 职责（数字农业剥离后 index.html 内不再保留任何数字农业实现）：
 *   1) window.runyeOpenDigitalAgriculture(plotId)   入口：写 v1 桥接数据后跳转统一入口
 *   2) window.runyeSharePlotToDigital()             保存方案/设为当前地块时同步地块数据
 *      （保留旧签名，index.html 调用点不变；双写 runye_digital_bridge_v1 与旧 runyePlotData）
 *   3) window.runyeBridgeWriteBack(plotId, plot)    地块边界/面积回写工作台 runye_db_v1（自 index.html 外移）
 *   4) ?from=workbench 进入时的预填与定位（自 index.html 外移）
 *
 * 约束：
 *   - 只传递版本化最小数据（见 docs/digital-agriculture-extraction.md 第四节）；
 *   - 不读写灌溉计算内部对象（管径/扬程/分区/材料清单）；数字农业侧禁止回写灌溉计算；
 *   - 一切失败只 console.warn + 非阻塞提示，绝不中断灌溉工具；
 *   - localStorage key 归属：runye_digital_bridge_v1 / runyePlotData / runye_db_v1 /
 *     runye_pending_land 均为桥接与数字农业侧 key；runye_plot_library 是灌溉地块库（只读）。
 */
(function () {
  'use strict';

  var BRIDGE_VERSION = 1;
  var BRIDGE_KEY = 'runye_digital_bridge_v1';
  var LEGACY_PLOT_KEY = 'runyePlotData';        // peanut-tool 兼容读（deprecated，见 AGENTS.md）
  var DB_KEY = 'runye_db_v1';                   // 数字农业工作台地块中心
  var PENDING_KEY = 'runye_pending_land';       // 工作台「绘制边界」待回写标记
  var ENTRY_URL = 'digital-agriculture/index.html';
  var WORKBENCH_URL = 'digital-agriculture/workbench.html';

  window.RUNYE_DIGITAL_BRIDGE_VERSION = BRIDGE_VERSION;

  /* ---------- 小工具 ---------- */
  function readLib() {
    try { return JSON.parse(localStorage.getItem('runye_plot_library') || '[]') || []; }
    catch (e) { return []; }
  }
  function findInLib(id) {
    if (!id) return null;
    var lib = readLib();
    for (var i = 0; i < lib.length; i++) { if (lib[i].id === id) return lib[i]; }
    return null;
  }
  function round2(n) { return Math.round(n * 100) / 100; }
  function toast(msg) {
    try { if (typeof projectToast === 'function') return projectToast(msg); } catch (e) {}
    try { if (typeof atShowToast === 'function') return atShowToast(msg); } catch (e) {}
  }
  function warn(msg) { try { console.warn('[irrigation-bridge] ' + msg); } catch (e) {} }

  function isFiniteNum(n) { return typeof n === 'number' && isFinite(n); }
  function isStr(s) { return typeof s === 'string'; }
  function positiveArea(primary, legacy) {
    if (isFiniteNum(primary) && primary > 0) return primary;
    return isFiniteNum(legacy) && legacy > 0 ? legacy : 0;
  }

  /** v1 plot 校验：返回 {ok, errors[]}。必填 id/name/areaMu；可选 areaSqm/crop/plantingDate。 */
  function validatePlot(p) {
    var errs = [];
    if (!p || typeof p !== 'object') return { ok: false, errors: ['plot 不是对象'] };
    if (!isStr(p.id) || !p.id.trim() || p.id.length > 64) errs.push('id 必填且 ≤64 字符');
    if (!isStr(p.name) || !p.name.trim() || p.name.length > 100) errs.push('name 必填且 ≤100 字符');
    if (!isFiniteNum(p.areaMu) || p.areaMu <= 0 || p.areaMu > 1e6) errs.push('areaMu 必须是 (0, 1000000] 内的数值');
    if (p.areaSqm !== undefined && (!isFiniteNum(p.areaSqm) || p.areaSqm <= 0)) errs.push('areaSqm 必须为正数');
    if (p.crop !== undefined && (!isStr(p.crop) || p.crop.length > 50)) errs.push('crop 须为 ≤50 字符的字符串');
    if (p.plantingDate !== undefined && p.plantingDate !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(p.plantingDate)) errs.push('plantingDate 须为 YYYY-MM-DD 或空');
    return { ok: errs.length === 0, errors: errs };
  }

  function writeBridgePayload(plot) {
    var check = validatePlot(plot);
    if (!check.ok) { warn('地块数据未通过 v1 校验，跳过写入：' + check.errors.join('；')); return false; }
    var payload = {
      version: BRIDGE_VERSION,
      source: 'runye-irrigation',
      generatedAt: Date.now(),
      plot: {
        id: plot.id.trim(),
        name: plot.name.trim(),
        areaMu: round2(plot.areaMu),
        crop: (isStr(plot.crop) && plot.crop.trim()) ? plot.crop.trim() : '七彩花生'
      }
    };
    if (isFiniteNum(plot.areaSqm) && plot.areaSqm > 0) payload.plot.areaSqm = round2(plot.areaSqm);
    if (isStr(plot.plantingDate)) payload.plot.plantingDate = plot.plantingDate;
    try { localStorage.setItem(BRIDGE_KEY, JSON.stringify(payload)); return true; }
    catch (e) { warn('写入 runye_digital_bridge_v1 失败：' + e); return false; }
  }

  /* ---------- 1. 入口：带地块跳数字农业 ---------- */
  window.runyeOpenDigitalAgriculture = function (plotId) {
    try {
      var id = (plotId != null && plotId !== '') ? String(plotId) : (window.currentPlotId || '');
      var libP = findInLib(id);
      // 已指定地块时只取该地块面积，避免混入当前画布的数据。
      var sqm = libP ? positiveArea(libP.areaSqm, libP.sqm) :
        ((!id || id === window.currentPlotId) ? positiveArea(window.measuredArea, 0) : 0);
      var mu = libP ? positiveArea(libP.areaMu, libP.mu) : 0;
      if (!mu && sqm > 0) mu = round2(sqm / 666.67);
      if (!(mu > 0) && !(sqm > 0)) {
        toast('尚未测量或选择地块，无法带入数字农业；灌溉工具不受影响');
        return false;
      }
      var plot = {
        id: id || ('tmp' + Date.now()),
        name: (libP && libP.name) || '当前地块',
        areaMu: mu || round2(sqm / 666.67),
        crop: (libP && libP.crop) || '七彩花生',
        plantingDate: (libP && libP.plantingDate) || ''
      };
      if (sqm > 0) plot.areaSqm = round2(sqm);
      if (!writeBridgePayload(plot)) { toast('地块数据校验未通过，未打开数字农业（详见控制台）'); return false; }
      window.location.href = ENTRY_URL + '?plotId=' + encodeURIComponent(String(plot.id));
      return true;
    } catch (e) {
      warn('打开数字农业失败：' + e);
      toast('打开数字农业失败，灌溉工具不受影响');
      return false;
    }
  };

  /* ---------- 2. 保存/设为当前时同步（旧签名不变，index.html 调用点零改动） ---------- */
  window.runyeSharePlotToDigital = function () {
    try {
      var sqm = window.measuredArea || 0;
      if (sqm <= 0) return;
      var mu = sqm / 666.67;
      var poly = (window.measuredPolygon || []).map(function (p) {
        return [Math.round((p.x || 0) * 100) / 100, Math.round((p.y || 0) * 100) / 100];
      });
      var pid = window.currentPlotId || null;
      var libP = findInLib(pid), pdt = libP ? libP.plantingDate || null : null;
      // 旧 key：peanut-tool 启动即读（deprecated，逐步迁移到 v1）
      localStorage.setItem(LEGACY_PLOT_KEY, JSON.stringify({
        mu: round2(mu), sqm: round2(sqm), poly: poly,
        crop: '七彩花生', ts: Date.now(), source: 'runye-irrigation',
        plotId: pid, plantingDate: pdt
      }));
      // 新 v1：统一入口 / 工作台读取
      writeBridgePayload({
        id: pid || 'current',
        name: (libP && libP.name) || '当前地块',
        areaMu: mu,
        areaSqm: sqm,
        crop: (libP && libP.crop) || '七彩花生',
        plantingDate: pdt || ''
      });
    } catch (e) { warn('同步地块到数字农业失败：' + e); }
  };

  /* ---------- 3. 工作台「绘制边界」桥（自 index.html 原样外移，仅回跳路径改为新目录） ---------- */
  function getPending() { try { return JSON.parse(localStorage.getItem(PENDING_KEY) || 'null'); } catch (e) { return null; } }
  function clearPending() { try { localStorage.removeItem(PENDING_KEY); } catch (e) {} }

  // 仅当 index 由工作台（?from=workbench）打开时才保留待回写标记；否则清除，避免误回写旧地块
  var fromWB = /[?&]from=workbench\b/.test(location.search);
  if (!fromWB) clearPending();

  // 预填地块名 + 定位到面积测量（来自工作台时）
  function prefillFromWorkbench() {
    var p = getPending();
    if (p && p.name) {
      var ni = document.getElementById('plotNameInput');
      if (ni && !ni.value) ni.value = p.name;
    }
    if (fromWB) {
      setTimeout(function () {
        var sec = document.getElementById('areaTool');
        if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', prefillFromWorkbench);
  else prefillFromWorkbench();

  // 保存地块后，把边界与实测面积回写工作台 runye_db_v1 的对应 land，并跳回工作台详情页
  // 兼容两类来源：
  //  - 工作台「绘制边界」进来（?from=workbench，有 pending.land_id）：回填该 land 并跳回详情；
  //  - 面积测量工具内独立绘制保存（无 pending）：按 plotId / 同名查找或新建 land，使工作台地块中心能看到。
  window.runyeBridgeWriteBack = function (plotId, plot) {
    var p = getPending();
    try {
      if (!plot || typeof plot !== 'object') return;
      var areaMu = positiveArea(plot.areaMu, plot.mu);
      var areaSqm = positiveArea(plot.areaSqm, plot.sqm);
      var raw = localStorage.getItem(DB_KEY); if (!raw) return;
      var db = JSON.parse(raw); if (!db || !db.lands) return;
      var land = null;
      if (p && p.land_id) { db.lands.forEach(function (l) { if (l.land_id === p.land_id) land = l; }); }
      if (!land) { db.lands.forEach(function (l) { if (l.land_id === plotId) land = l; }); }             // 复用同一 plotId 对应的 land
      if (!land) { var nm = plot.name || ''; if (nm) { db.lands.forEach(function (l) { if (String(l.name || '').trim() === nm.trim()) land = l; }); } } // 同名地块更新，避免重复建档
      if (!land) {
        land = { land_id: plotId, name: plot.name || '未命名地块', code: '', area: areaMu, geo_json: null,
          crop: plot.crop || '七彩花生', variety: '', soil_type: '', planting_location: '', plant_date: '', harvest_date: '',
          base_fertilizer: '', planting_method: '', status: 'wait', farm: '', create_time: new Date().toISOString(), remark: '' };
        db.lands.push(land);
      }
      land.geo_json = { source: 'runye-irrigation', plotId: plotId, poly: plot.poly || [], sqm: areaSqm, mu: areaMu, saved_at: Date.now() };
      if (areaMu > 0) land.area = round2(areaMu);
      if (plot.name) land.name = plot.name;
      if (!land.crop) land.crop = plot.crop || '七彩花生';
      localStorage.setItem(DB_KEY, JSON.stringify(db));
      if (p && p.land_id) clearPending();
      if (typeof atShowToast === 'function') atShowToast('已回填工作台地块：' + (land.name || plotId)); else alert('已回填工作台地块');
      if (p && p.land_id) { setTimeout(function () { window.location.href = WORKBENCH_URL + '?space=1#/land/' + p.land_id; }, 900); }
    } catch (e) { warn('回写工作台地块失败（灌溉工具不受影响）：' + e); }
  };
})();
