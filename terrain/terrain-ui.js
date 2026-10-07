/* ============================================================
   terrain-ui.js — 润野灌溉 地形模块 · UI 层（阶段1 基础框架）
   ------------------------------------------------------------
   [NEW MODULE: 地形模块] 依赖 terrain-core.js（window.RyTerrainData）。
   职责：导入交互 / 校验与告警提示 / 双面积卡片（㎡·亩切换）/
   高程数据源面板（3 入口）/ 预览-工程模式切换 / 回传主页。

   「无高程 → 水力锁定」降级逻辑按用户决策为【仅提示不锁定】（阶段1）：
     工程模式下无高程数据 → 顶部红条提示，不真正禁用主页水力计算；
     锁定开关配置项 LOCK_HYDRAULICS 预留（默认 false），待高程
     采样引擎（阶段2）打通后再评估启用。

   回传主页契约：写 localStorage 'runyeMeasuredArea' =
     { sqm, mu, poly:[{x,y}...], source:'terrain' }，
     主页 applyMapMeasuredArea() 会自动读取并驱动二级管路计算。
   ============================================================ */
(function () {
  'use strict';
  var D = window.RyTerrainData;
  if (!D) { console.error('[terrain] terrain-core.js 未加载'); return; }

  /* 锁定开关（阶段1 恒 false = 仅提示不锁定，用户已确认） */
  var LOCK_HYDRAULICS = false;

  var state = D.loadState();
  var areaUnit = state._unit === 'mu' ? 'mu' : 'sqm'; /* 单位偏好持久化，底层恒平方米 */

  var $ = function (id) { return document.getElementById(id); };

  /* ---------------- 提示条 ---------------- */

  function banner(level, msg) {
    var box = $('tBanner');
    box.className = 't-banner t-' + level;
    box.innerHTML = msg;
    box.hidden = false;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ---------------- 模式切换 ---------------- */

  function applyMode() {
    document.body.classList.toggle('t-engineering', state.mode === 'engineering');
    $('modePreview').classList.toggle('on', state.mode !== 'engineering');
    $('modeEng').classList.toggle('on', state.mode === 'engineering');
    if (state.mode !== 'engineering') {
      banner('warn', '⚙ 当前为<b>预览模式</b>：可导入、计算与查看，成果不用于工程放样/水力计算。切换「工程模式」后回传主页才生效。');
    } else if (!hasElevation()) {
      banner('danger', '⚠ 工程模式：未检测到高程数据 —— 当前水力计算<b>未考虑地形高差</b>' +
        (LOCK_HYDRAULICS ? '，水力计算已锁定' : '（阶段1 仅提示不锁定）') +
        '。请上传 RTK 高程点或 DTM 后再回传主页。');
    } else {
      var ds = state.elevations.filter(function (r) { return r.meta && r.meta.preview_only; });
      if (ds.length === state.elevations.length && state.elevations.length) {
        banner('warn', '已有高程数据均为 DSM（仅预览）：请上传 RTK 点或 DTM 才可用于工程水力计算。');
      } else {
        banner('ok', '✓ 工程模式：已具备可用高程数据，可回传主页参与计算。');
      }
    }
  }

  function setMode(m) {
    state.mode = m;
    D.saveState(state);
    applyMode();
  }

  function hasElevation() {
    return state.elevations.some(function (r) { return !(r.meta && r.meta.preview_only); });
  }

  /* ---------------- 地块列表渲染 ---------------- */

  function renderPlots() {
    var box = $('plotList');
    if (!state.plots.length) {
      box.innerHTML = '<div class="t-empty">暂无地块。请「导入 shp 边界」「导入 RTK 边界 CSV」或「手绘/粘贴顶点」。</div>';
    } else {
      box.innerHTML = state.plots.map(function (p, i) {
        var a = D.polygonAreaM2(p.poly);
        return '<div class="t-plot" data-i="' + i + '">' +
          '<b>' + esc(p.name || ('地块' + (i + 1))) + '</b>' +
          (p.level ? '<span class="t-lv">梯田第' + esc(p.level) + '级</span>' : '') +
          '<span class="t-src">' + esc(p.source || '') + '</span>' +
          '<span class="t-area">' + fmtArea(a) + '</span>' +
          '<button class="t-del" data-del="' + i + '" title="删除该子多边形">✕</button></div>';
      }).join('');
    }
    /* 子多边形单独统计 + 汇总（梯田分层预留：level 字段） */
    var total = D.plotsTotalAreaM2(state.plots);
    $('areaProj').textContent = fmtArea(total);
    $('areaProjNote').textContent = state.plots.length > 1
      ? '共 ' + state.plots.length + ' 个子多边形（含梯台预留位），已汇总'
      : '鞋带公式 · 水平投影';
    /* 地表斜面面积卡：无高程 → 置灰锁定 */
    var surf = $('areaSurfCard');
    var has = hasElevation();
    surf.classList.toggle('t-locked', !has);
    $('areaSurf').textContent = has ? '待开放' : '—';
    $('areaSurfNote').textContent = has
      ? '已具备高程数据 · 表面积引擎阶段2开放'
      : '需要上传高程数据才可计算';
    $('btnSendHome').disabled = total <= 0;
  }

  function fmtArea(sqm) {
    if (!sqm) return '—';
    return areaUnit === 'mu'
      ? D.sqmToMu(sqm).toLocaleString('zh-CN', { maximumFractionDigits: 2 }) + ' 亩'
      : Math.round(sqm).toLocaleString('zh-CN') + ' ㎡';
  }

  function setUnit(u) {
    areaUnit = u;
    state._unit = u;
    D.saveState(state);
    $('unitSqm').classList.toggle('on', u === 'sqm');
    $('unitMu').classList.toggle('on', u === 'mu');
    renderPlots();
  }

  /* ---------------- 导入：shp ---------------- */

  function importSHP(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var r = D.parseSHP(reader.result);
      if (!r.ok) { banner('danger', '✕ shp 解析失败：' + esc(r.error)); return; }
      /* 同目录 .prj：让用户一并选择（阶段1 不做 zip/多文件拖拽，明示即可） */
      state.plots = state.plots.concat(r.features.map(function (f, i) {
        return {
          id: 'shp_' + Date.now() + '_' + i,
          name: (file.name.replace(/\.shp$/i, '')) + (r.features.length > 1 ? '#' + (i + 1) : ''),
          poly: f.poly.map(function (pt) { return { x: Math.round(pt.x * 100) / 100, y: Math.round(pt.y * 100) / 100 }; }),
          level: null, source: 'shp',
          _zHint: f.zHint, _ringsDropped: f.ringsDropped
        };
      }));
      persistAndRender();
      banner('warn',
        'shp 已解析出 <b>' + r.features.length + '</b> 个面要素。' +
        '<b>请同时上传同名 .prj 文件做 CGCS2000 校验</b>（未校验前按数值启发式判断）。' +
        (r.features.some(function (f) { return f.ringsDropped; }) ? ' 部分要素含内环/洞（阶段1 未参与计算，阶段2 处理）。' : ''));
    };
    reader.readAsArrayBuffer(file);
  }

  function importPRJ(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var r = D.parsePRJ(reader.result);
      if (r.cs === 'CGCS2000') banner('ok', '✓ 坐标系校验通过：' + esc(r.label));
      else banner('danger', '⚠ ' + esc(r.warn || r.label));
      $('csResult').textContent = r.label;
      state._cs = r; D.saveState(state);
    };
    reader.readAsText(file);
  }

  /* ---------------- 导入：边界 CSV / RTK 高程 CSV ---------------- */

  function importBoundaryCSV(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var r = D.parseCSV(reader.result, { minPoints: 3 });
      if (!r.ok) { banner('danger', '✕ CSV 解析失败：' + esc(r.error)); return; }
      var cs = D.detectCoordSystem(null, r.points);
      if (cs.cs === 'lonlat') {
        banner('danger', '✕ ' + esc(cs.warn)); return; /* 经纬度 → 锁面积，拒绝导入 */
      }
      var ring = r.points.map(function (p) { return { x: p.x, y: p.y }; });
      state.plots.push({
        id: 'csv_' + Date.now(),
        name: file.name.replace(/\.(csv|txt)$/i, ''),
        poly: ring.map(function (pt) { return { x: Math.round(pt.x * 100) / 100, y: Math.round(pt.y * 100) / 100 }; }),
        level: null, source: 'RTK边界CSV'
      });
      persistAndRender();
      $('csResult').textContent = cs.label;
      banner(cs.confidence === 'medium' ? 'warn' : 'danger',
        '边界 CSV 已导入 ' + r.points.length + ' 点。' + esc(cs.warn || ('坐标系：' + cs.label)));
    };
    reader.readAsText(file);
  }

  /* ---------------- 高程数据源（3 入口，统一接口层） ---------------- */

  function importElevCSV(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var r = D.parseCSV(reader.result, { minPoints: 4 });
      if (!r.ok) { banner('danger', '✕ 高程 CSV 解析失败：' + esc(r.error)); return; }
      if (!r.hasZ) { banner('danger', '✕ 该文件无第三列 Z 值：RTK 高程点 CSV 需为「X,Y,Z」三列。若这是边界文件，请用「RTK 边界 CSV」入口。'); return; }
      var cls = { ok: true, data_type: 'rtk_xyz' };
      var built = D.buildElevRecord({
        data_type: cls.data_type, point_list: r.points,
        file_name: file.name, file_size: file.size
      });
      if (!built.ok) { banner('danger', '✕ ' + esc(built.error)); return; }
      state.elevations.push(built.record);
      persistAndRender();
      banner('ok', '✓ RTK 高程点已登记：<b>' + r.points.length + '</b> 点（置信度 ' + built.record.confidence + '）。沿管线采样与表面积引擎阶段2接入。');
    };
    reader.readAsText(file);
  }

  function importRaster(file, forcedType) {
    var cls = D.classifyElevFile(file.name);
    if (!cls.ok) { banner('danger', '✕ ' + esc(cls.error)); return; }
    var dtype = forcedType || cls.data_type;
    var previewOnly = dtype === 'dsm_raster';
    var built = D.buildElevRecord({
      data_type: dtype,
      point_list: [], /* tif 像素阶段1不解析（仅上传登记 + 元信息），阶段2接像素采样 */
      raster_info: { format: 'tif', note: '阶段1 仅登记元信息，像素读取阶段2实现' },
      file_name: file.name, file_size: file.size
    });
    if (!built.ok) { banner('danger', '✕ ' + esc(built.error)); return; }
    if (previewOnly) built.record.meta.preview_only = true;
    state.elevations.push(built.record);
    persistAndRender();
    if (previewOnly) {
      banner('warn', '⚠ <b>DSM（数字表面模型）已登记 —— 仅可预览，不可用于工程水力计算</b>（含树冠/建筑高程，会高估地形起伏）。工程水力请改用 DTM 或 RTK 点。');
    } else if (cls.needConfirm) {
      banner('warn', '✓ 栅格已登记（暂按 DTM）。' + esc(cls.note));
    } else {
      banner('ok', '✓ ' + esc(D.ELEV_TYPES[dtype].label) + ' 已登记。像素级采样阶段2接入，当前仅参与「已具备高程数据」状态判定。');
    }
  }

  function renderElev() {
    var box = $('elevList');
    if (!state.elevations.length) {
      box.innerHTML = '<div class="t-empty">未登记高程数据。地表斜面面积与水力高差计算将保持锁定/提示状态。</div>';
      return;
    }
    box.innerHTML = state.elevations.map(function (r, i) {
      var t = D.ELEV_TYPES[r.data_type] || {};
      var bad = r.meta && r.meta.preview_only;
      return '<div class="t-elev' + (bad ? ' t-elev-dsm' : '') + '">' +
        '<b>' + esc(t.label || r.data_type) + '</b>' +
        '<span>' + esc(r.meta.file_name) + ' · ' + esc((r.point_list.length ? r.point_list.length + ' 点' : '栅格元信息')) +
        ' · 置信度 ' + esc(r.confidence) + '</span>' +
        (bad ? '<em class="t-dsm-tag">仅预览 · 禁用于水力</em>' : '') +
        (r.meta && r.meta.thinned ? '<em>持久化已抽样(' + r.meta.thinned_from + '→' + r.point_list.length + ')</em>' : '') +
        '<button class="t-del" data-edelete="' + i + '">✕</button></div>';
    }).join('');
  }

  /* ---------------- 回传主页 ---------------- */

  function sendHome() {
    var total = D.plotsTotalAreaM2(state.plots);
    if (total <= 0) return;
    /* 用最大子多边形做回传轮廓（主页 measuredPolygon 单环契约） */
    var best = null, bestA = -1;
    state.plots.forEach(function (p) {
      var a = D.polygonAreaM2(p.poly);
      if (a > bestA) { bestA = a; best = p; }
    });
    if (state.mode !== 'engineering') {
      banner('danger', '✕ 预览模式下不回传。请先切换到「工程模式」（明确成果用于工程）。');
      return;
    }
    var payload = {
      sqm: Math.round(total * 100) / 100,
      mu: D.sqmToMu(total),
      poly: best.poly,
      source: 'terrain'
    };
    try {
      localStorage.setItem('runyeMeasuredArea', JSON.stringify(payload));
      banner('ok', '✓ 已回传主页（' + fmtArea(total) + '）。正在跳转 index.html#pipePlanSection …');
      setTimeout(function () { window.location.href = '../index.html#pipePlanSection'; }, 900);
    } catch (e) {
      banner('danger', '✕ 回传失败：' + esc(e.message));
    }
  }

  /* ---------------- 事件绑定与启动 ---------------- */

  function persistAndRender() {
    D.saveState(state);
    renderPlots();
    renderElev();
    applyMode();
  }

  function bind() {
    $('modePreview').addEventListener('click', function () { setMode('preview'); });
    $('modeEng').addEventListener('click', function () { setMode('engineering'); });
    $('unitSqm').addEventListener('click', function () { setUnit('sqm'); });
    $('unitMu').addEventListener('click', function () { setUnit('mu'); });

    bindFile('fileSHP', importSHP, ['.shp']);
    bindFile('filePRJ', importPRJ, ['.prj']);
    bindFile('fileBoundaryCSV', importBoundaryCSV, ['.csv', '.txt']);
    bindFile('fileElevCSV', importElevCSV, ['.csv', '.txt']);
    bindFile('fileDTM', function (f) { importRaster(f, 'dtm_raster'); }, ['.tif', '.tiff']);
    bindFile('fileDSM', function (f) { importRaster(f, 'dsm_raster'); }, ['.tif', '.tiff']);

    /* 高程数据源 3 个 tab 切换 */
    [['tabRtk', 'panelRtk'], ['tabDtm', 'panelDtm'], ['tabDsm', 'panelDsm']].forEach(function (pr) {
      $(pr[0]).addEventListener('click', function () {
        ['tabRtk', 'tabDtm', 'tabDsm'].forEach(function (t) { $(t).classList.toggle('on', t === pr[0]); });
        ['panelRtk', 'panelDtm', 'panelDsm'].forEach(function (p) { $(p).classList.toggle('on', p === pr[1]); });
      });
    });

    $('btnSendHome').addEventListener('click', sendHome);
    $('btnAddManual').addEventListener('click', addManual);
    $('btnClear').addEventListener('click', function () {
      if (!state.plots.length && !state.elevations.length) return;
      if (confirm('清空全部地块与高程登记记录？（不可恢复）')) { state.plots = []; state.elevations = []; persistAndRender(); }
    });

    document.addEventListener('click', function (ev) {
      var t = ev.target.closest('[data-del],[data-edelete]');
      if (!t) return;
      if (t.dataset.del != null) state.plots.splice(+t.dataset.del, 1);
      if (t.dataset.edelete != null) state.elevations.splice(+t.dataset.edelete, 1);
      persistAndRender();
    });
  }

  function bindFile(inputId, handler, accept) {
    var el = $(inputId);
    el.accept = accept.join(',');
    el.addEventListener('change', function () {
      if (el.files && el.files[0]) { handler(el.files[0]); el.value = ''; }
    });
  }

  /* 手动添加子多边形（梯田分层预留：level 输入，空 = 未分层） */
  function addManual() {
    var txt = prompt('粘贴边界顶点，每行一个点，格式「X,Y」或「X,Y,Z」（逗号分隔），至少 3 行：\n示例：\n3546789.2,512345.6\n3546801.5,512360.1\n3546795.0,512372.8');
    if (!txt) return;
    var r = D.parseCSV(txt, { minPoints: 3 });
    if (!r.ok) { banner('danger', '✕ 顶点解析失败：' + esc(r.error)); return; }
    var lv = prompt('梯田层级（可留空 = 不分层；填 1/2/3… 表示第几级台面）：', '');
    var level = lv && /^\d+$/.test(lv.trim()) ? +lv.trim() : null;
    state.plots.push({
      id: 'man_' + Date.now(),
      name: '手动地块' + (state.plots.length + 1),
      poly: r.points.map(function (p) { return { x: p.x, y: p.y }; }),
      level: level, source: '手动'
    });
    persistAndRender();
  }

  document.addEventListener('DOMContentLoaded', function () {
    bind();
    setUnit(areaUnit); /* 同步单位按钮初始态（含持久化偏好恢复） */
    persistAndRender();
  });

  /* 供测试/自动化探针使用 */
  window.RyTerrainUI = { state: state, sendHome: sendHome, setUnit: setUnit, setMode: setMode };
})();
