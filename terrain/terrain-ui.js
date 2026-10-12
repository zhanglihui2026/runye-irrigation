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
        banner('ok', '✓ 工程模式：已具备可用 RTK 高程点，可回传主页并在「地形高程」中确认采用。');
      }
    }
  }

  function setMode(m) {
    state.mode = m;
    D.saveState(state);
    applyMode();
  }

  function hasElevation() {
    /* 仅登记元信息的 tif 没有像素值，不能作为水力高程数据。 */
    return state.elevations.some(function (r) {
      return r && r.data_type === 'rtk_xyz' && Array.isArray(r.point_list) && r.point_list.filter(function (p) {
        return Number.isFinite(p && p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
      }).length >= 3 && !(r.meta && r.meta.preview_only);
    });
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
    /* 地表斜面面积卡（v298 P1-5）：有 RTK 高程 → 平均坡度近似开放；无 → 置灰锁定 */
    var surf = $('areaSurfCard');
    var has = hasElevation();
    surf.classList.toggle('t-locked', !has);
    var surfTxt = '—', surfNote = '需要上传高程数据才可计算';
    if (has) {
      var rtkPts = [];
      state.elevations.forEach(function (r) {
        if (r.data_type === 'rtk_xyz' && Array.isArray(r.point_list)) rtkPts = rtkPts.concat(r.point_list);
      });
      var sa = D.surfaceAreaApprox(D.plotsTotalAreaM2(state.plots), rtkPts);
      if (sa.ok) {
        surfTxt = fmtArea(sa.surfSqm);
        surfNote = '近似 · 平均坡度 ' + sa.slopeDeg.toFixed(1) + '°（' + sa.n + ' 点拟合 · 精细 TIN 积分属阶段2）';
      } else {
        surfTxt = '—';
        surfNote = '已登记高程暂不可用：' + sa.error;
      }
    }
    $('areaSurf').textContent = surfTxt;
    $('areaSurfNote').textContent = surfNote;
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
    drawCanvas(); /* 画布标签面积随单位 */
  }

  /* ---------------- 导入：shp ---------------- */

  function importSHP(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var r = D.parseSHP(reader.result);
      if (!r.ok) { banner('danger', '✕ shp 解析失败：' + esc(r.error)); return; }
      /* 同目录 .prj：让用户一并选择（阶段1 不做 zip/多文件拖拽，明示即可） */
      var shpWarns = [];
      var kept = [];
      r.features.forEach(function (f, i) {
        var s = D.sanitizeRing(f.poly);
        if (!s.ok) { shpWarns.push('要素#' + (i + 1) + ' 已跳过：' + s.error); return; }
        shpWarns = shpWarns.concat(s.warn.map(function (w) { return '要素#' + (i + 1) + '：' + w; }));
        kept.push({
          id: 'shp_' + Date.now() + '_' + i,
          name: (file.name.replace(/\.shp$/i, '')) + (r.features.length > 1 ? '#' + (i + 1) : ''),
          poly: s.pts.map(function (pt) { return { x: Math.round(pt.x * 100) / 100, y: Math.round(pt.y * 100) / 100 }; }),
          level: null, source: 'shp',
          _cs: state._cs && state._cs.cs || 'unknown',
          _zHint: f.zHint, _ringsDropped: f.ringsDropped
        });
      });
      state.plots = state.plots.concat(kept);
      persistAndRender();
      banner('warn',
        'shp 已解析出 <b>' + kept.length + '</b> 个面要素' + (kept.length < r.features.length ? '（<b>' + (r.features.length - kept.length) + '</b> 个坏环已跳过）' : '') + '。' +
        (shpWarns.length ? '<br>' + shpWarns.map(esc).join('<br>') : '') +
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
      var s = D.sanitizeRing(r.points);
      if (!s.ok) { banner('danger', '✕ 边界环无效：' + esc(s.error)); return; }
      state.plots.push({
        id: 'csv_' + Date.now(),
        name: file.name.replace(/\.(csv|txt)$/i, ''),
        poly: s.pts.map(function (pt) { return { x: Math.round(pt.x * 100) / 100, y: Math.round(pt.y * 100) / 100 }; }),
        level: null, source: 'RTK边界CSV', _cs: cs.cs || 'unknown'
      });
      persistAndRender();
      $('csResult').textContent = cs.label;
      banner(s.warn.length ? 'warn' : (cs.confidence === 'medium' ? 'warn' : 'danger'),
        '边界 CSV 已导入 ' + s.pts.length + ' 点' + (s.warn.length ? '（' + esc(s.warn.join('；')) + '）' : '') + '。' + esc(cs.warn || ('坐标系：' + cs.label)));
    };
    reader.readAsText(file);
  }

  /* ---------------- 高程数据源（3 入口，统一接口层） ---------------- */

  function importElevCSV(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var r = D.parseCSV(reader.result, { minPoints: 4 });
      if (!r.ok) { banner('danger', '✕ 高程 CSV 解析失败：' + esc(r.error)); return; }
      if (!r.hasZ) { banner('danger', '✕ 可用 Z 值不足：RTK 高程点 CSV 需为「X,Y,Z」三列，且至少 95% 有 Z。若这是边界文件，请用「RTK 边界 CSV」入口。'); return; }
      var cleaned = D.filterElevationOutliers(r.points);
      if (cleaned.points.length < 4) { banner('danger', '✕ 剔除无效高程后点数不足，未导入。'); return; }
      var cls = { ok: true, data_type: 'rtk_xyz' };
      var built = D.buildElevRecord({
        data_type: cls.data_type, point_list: cleaned.points,
        coverage_area_m2: D.plotsTotalAreaM2(state.plots), file_name: file.name, file_size: file.size
      });
      if (!built.ok) { banner('danger', '✕ ' + esc(built.error)); return; }
      state.elevations.push(built.record);
      persistAndRender();
      banner(cleaned.removed || r.missingZRows ? 'warn' : 'ok', '✓ RTK 高程点已登记：<b>' + cleaned.points.length + '</b> 点（置信度 ' + built.record.confidence + '）' +
        (r.missingZRows ? '；已跳过 ' + r.missingZRows + ' 行缺失 Z' : '') +
        (cleaned.removed ? '；已剔除 ' + cleaned.removed + ' 个明显高程飞点' : '') + '。');
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
      point_list: [], /* tif 像素尚不解析：只登记文件，绝不作为已可用高程 */
      raster_info: { format: 'tif', note: '阶段1 仅登记元信息，像素读取阶段2实现' },
      file_name: file.name, file_size: file.size
    });
    if (!built.ok) { banner('danger', '✕ ' + esc(built.error)); return; }
    if (previewOnly) built.record.meta.preview_only = true;
    built.record.meta.hydraulic_usable = false;
    state.elevations.push(built.record);
    persistAndRender();
    if (previewOnly) {
      banner('warn', '⚠ <b>DSM（数字表面模型）已登记 —— 仅可预览，不可用于工程水力计算</b>（含树冠/建筑高程，会高估地形起伏）。工程水力请改用 DTM 或 RTK 点。');
    } else if (cls.needConfirm) {
      banner('warn', '✓ 栅格已登记（暂按 DTM）。' + esc(cls.note));
    } else {
      banner('warn', '✓ ' + esc(D.ELEV_TYPES[dtype].label) + ' 文件已登记，但当前版本尚未读取 tif 像素，<b>不会用于水力或表面积计算</b>。请先导入 RTK XYZ，或待栅格解析功能接入后使用。');
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
      var unavailable = r.meta && r.meta.hydraulic_usable === false;
      return '<div class="t-elev' + (bad ? ' t-elev-dsm' : '') + '">' +
        '<b>' + esc(t.label || r.data_type) + '</b>' +
        '<span>' + esc(r.meta.file_name) + ' · ' + esc((r.point_list.length ? r.point_list.length + ' 点' : '栅格元信息')) +
        ' · 置信度 ' + esc(r.confidence) + '</span>' +
        (bad ? '<em class="t-dsm-tag">仅预览 · 禁用于水力</em>' : (unavailable ? '<em class="t-dsm-tag">文件已登记 · 像素未解析</em>' : '')) +
        (r.meta && r.meta.thinned ? '<em>持久化已抽样(' + r.meta.thinned_from + '→' + r.point_list.length + ')</em>' : '') +
        '<button class="t-del" data-edelete="' + i + '">✕</button></div>';
    }).join('');
  }

  /* ---------------- 制图区（SVG 画布，同「地块分区」右侧图纸区角色） ----------------
     按 CGCS2000 平面坐标绘制：地块多边形（绿）+ 顶点 + 名称/面积标签；
     RTK 高程点（红点，可开关，仅当与地块视野相交时绘制）。
     viewBox 适配全部地块联合 bbox → 浏览器自动缩放，无需手写平移缩放（阶段2 再加）。 */

  function bboxOfPoly(poly) {
    var b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    poly.forEach(function (pt) {
      if (pt.x < b.minX) b.minX = pt.x; if (pt.y < b.minY) b.minY = pt.y;
      if (pt.x > b.maxX) b.maxX = pt.x; if (pt.y > b.maxY) b.maxY = pt.y;
    });
    return b;
  }

  function drawCanvas() {
    var svg = $('tCanvas'), emptyBox = $('canvasEmpty'), meta = $('canvasMeta');
    var polys = state.plots.filter(function (p) { return Array.isArray(p.poly) && p.poly.length >= 3; });
    if (!polys.length) {
      svg.setAttribute('hidden', '');
      emptyBox.style.display = '';
      meta.textContent = '暂无地块数据';
      $('elevDotWrap').hidden = true;
      canvasView = null; canvasFitKey = '';
      return;
    }
    /* 联合 bbox + 5% 视野余量 */
    var B = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    polys.forEach(function (p) {
      var b = bboxOfPoly(p.poly);
      B.minX = Math.min(B.minX, b.minX); B.minY = Math.min(B.minY, b.minY);
      B.maxX = Math.max(B.maxX, b.maxX); B.maxY = Math.max(B.maxY, b.maxY);
    });
    var w = B.maxX - B.minX, h = B.maxY - B.minY;
    if (!(w > 0)) w = Math.max(1, h * 0.01);
    if (!(h > 0)) h = Math.max(1, w * 0.01);
    var pad = Math.max(w, h) * 0.05;
    var vx = B.minX - pad, vy = B.minY - pad, vw = w + pad * 2, vh = h + pad * 2;
    var flip = B.maxY + B.minY; /* y' = flip - y ：北为上（SVG y 向下） */
    var fs = (vh * 0.035).toFixed(2); /* 标签字号随视野缩放 */

    var out = [];
    /* 地块多边形 */
    polys.forEach(function (p, i) {
      var pts = p.poly.map(function (pt) {
        return (Math.round(pt.x * 100) / 100).toFixed(1) + ',' + (Math.round((flip - pt.y) * 100) / 100).toFixed(1);
      }).join(' ');
      out.push('<polygon class="t-poly-face" points="' + pts + '"><title>' + esc(p.name || ('地块' + (i + 1))) + '</title></polygon>');
      /* 顶点小圆 */
      p.poly.forEach(function (pt) {
        out.push('<circle class="t-poly-vtx" cx="' + pt.x.toFixed(1) + '" cy="' + (flip - pt.y).toFixed(1) + '" r="' + (vh * 0.006).toFixed(2) + '"/>');
      });
      /* 标签：名称 + 面积，置于第一顶点旁（质心在凹多边形可能落外） */
      var lp = p.poly[0];
      var area = D.polygonAreaM2(p.poly);
      var lbl = esc(p.name || ('地块' + (i + 1))) + ' ' + (areaUnit === 'mu' ? D.sqmToMu(area) + '亩' : Math.round(area) + '㎡');
      out.push('<text class="t-poly-label" x="' + (lp.x + vw * 0.008).toFixed(1) + '" y="' + (flip - lp.y - vh * 0.008).toFixed(1) +
               '" font-size="' + fs + '">' + lbl + '</text>');
    });
    /* RTK 高程点（开关开且点落在视野内才画；超过 3000 点抽稀） */
    var showDots = $('elevDots').checked;
    var dotCount = 0;
    if (showDots) {
      state.elevations.forEach(function (r) {
        if (r.data_type !== 'rtk_xyz' || !Array.isArray(r.point_list) || !r.point_list.length) return;
        var step = Math.ceil(r.point_list.length / 3000);
        r.point_list.forEach(function (pt, i) {
          if (i % step) return;
          if (pt.x < B.minX || pt.x > B.maxX || pt.y < B.minY || pt.y > B.maxY) return;
          out.push('<circle class="t-elev-dot" cx="' + pt.x.toFixed(1) + '" cy="' + (flip - pt.y).toFixed(1) + '" r="' + (vh * 0.004).toFixed(2) + '"><title>X ' + pt.x + '\nY ' + pt.y + '\nZ ' + pt.z + '</title></circle>');
          dotCount++;
        });
      });
    }
    /* 喷灌布置叠加（v289）：勾选时按山地喷灌当前参数直接绘制
       分区（喷头按轮灌组着色）/ 管道布置（干管+支管）/ 喷头 / 喷射范围圆 */
    var spCount = 0, spGroups = 0;
    if ($('spOverlay') && $('spOverlay').checked) {
      var lay = D.sprinklerLayout(polys, spRead());
      if (lay.ok) {
        /* 分区范围多边形自 v296 起不再绘制：分区完全由喷头辐射圆着色呈现（core 仍输出 zonePolys 备用） */
        lay.heads.forEach(function (h) {  /* 喷射范围：按轮灌组着色（v295 分区改用辐射范围区分） */
          var cc = SP_COLORS[(h.g - 1) % SP_COLORS.length];
          out.push('<circle class="t-sp-circle" data-g="' + h.g + '" fill="' + cc + '" stroke="' + cc + '" cx="' + h.x.toFixed(1) + '" cy="' + (flip - h.y).toFixed(1) + '" r="' + lay.range_m.toFixed(1) + '"/>');
        });
        lay.laterals.forEach(function (l) {  /* 支管（沿行） */
          var latPts = l.pts.map(function (pt) { return pt.x.toFixed(1) + ',' + (flip - pt.y).toFixed(1); }).join(' ');
          out.push('<polyline class="t-sp-lateral" points="' + latPts + '"/>');
          /* 水流走向叠加线（v298c）：data-gs = 该行包含的轮灌组集合（行内可跨组），
             演示态下激活组命中该行时点亮流动虚线（干管→支管→喷头的水到达叙事） */
          var gs = {};
          lay.heads.forEach(function (h) { if (Math.abs(h.y - l.pts[0].y) < 0.01) gs[h.g] = 1; });
          out.push('<polyline class="t-sp-latflow" data-gs="' + Object.keys(gs).join(',') + '" points="' + latPts + '"/>');
        });
        var mainPts = lay.mainline.pts.map(function (pt) { return pt.x.toFixed(1) + ',' + (flip - pt.y).toFixed(1); }).join(' ');
        out.push('<polyline class="t-sp-main" points="' + mainPts + '"/>');  /* 干管 */
        out.push('<polyline class="t-sp-mainflow" points="' + mainPts + '"/>');  /* 干管水流叠加线（v298c）：演示态常流 */
        lay.heads.forEach(function (h, i) {  /* 喷头：颜色 = 轮灌组 */
          var hx = h.x.toFixed(1), hy = (flip - h.y).toFixed(1);
          out.push('<circle class="t-sp-head" data-g="' + h.g + '" fill="' + SP_COLORS[(h.g - 1) % SP_COLORS.length] +
            '" cx="' + hx + '" cy="' + hy + '" r="' + (vh * 0.005).toFixed(2) +
            '"><title>' + esc('第 ' + h.g + ' 轮灌组 · 喷头 ' + (i + 1) + ' · R=' + lay.range_m + 'm') + '</title></circle>');
          /* v384 P1 立管符号（任务书 §3.3）：每个喷头上方竖短线 + 顶圆点，数量 = heads.length */
          var rLen = vh * 0.012, rW = Math.max(0.6, vh * 0.002), rDot = Math.max(1, vh * 0.003);
          out.push('<line class="t-sp-riser" x1="' + hx + '" y1="' + hy + '" x2="' + hx + '" y2="' + (flip - h.y - rLen).toFixed(1) +
            '" stroke="#475569" stroke-width="' + rW.toFixed(2) + '"/>');
          out.push('<circle class="t-sp-risertop" cx="' + hx + '" cy="' + (flip - h.y - rLen).toFixed(1) + '" r="' + rDot.toFixed(2) + '" fill="#475569"/>');
        });
        spCount = lay.heads.length; spGroups = lay.groupCount;
        buildSpLegend(lay); /* 图例随布置结果刷新管径/流量 */
      }
    }
    var spLg = $('spLegend'); if (spLg) spLg.hidden = !spCount; /* 图例随叠加层显隐 */
    if (spDemoTimer) applySpDemo(); /* 动画进行中重绘后恢复当前组高亮 */
    $('elevDotWrap').hidden = !state.elevations.some(function (r) { return r.data_type === 'rtk_xyz'; });
    /* 视图管理：几何数据变化（fit 改变）→ 重置全览；仅标签变化（单位切换）→ 保持用户缩放/平移 */
    var fitKey = vx.toFixed(1) + ',' + vy.toFixed(1) + ',' + vw.toFixed(1) + ',' + vh.toFixed(1);
    if (!canvasView || fitKey !== canvasFitKey) {
      canvasFitKey = fitKey;
      canvasView = {
        x: vx, y: vy, w: vw, h: vh,
        w0: vw,                                  /* 缩放上下限基准（全览宽度） */
        fx: vx, fy: vy, fw: vw, fh: vh           /* 复位目标 */
      };
    }
    canvasApplyView();
    svg.innerHTML = out.join('');
    svg.removeAttribute('hidden');
    emptyBox.style.display = 'none';
    meta.textContent = polys.length + ' 个地块 · ' + fmtArea(D.plotsTotalAreaM2(state.plots)) +
      (dotCount ? ' · 高程点 ' + dotCount : '') + (spCount ? ' · 喷头 ' + spCount + ' · 轮灌组 ' + spGroups : '') + ' · 坐标 ' + (state._cs && state._cs.label ? state._cs.label : '未校验');
  }

  /* ---------------- 制图区视图导航（滚轮缩放 / 拖拽平移 / 复位） ----------------
     view = 当前 viewBox {x,y,w,h}；fit = 数据联合 bbox + 5% 余量。
     · 缩放/平移只改 view 并应用 viewBox，不重绘内容；
     · 几何数据变化（导入/删除）时 fit 变化 → 自动重置全览；
       单位切换只改标签文字 → fit 不变 → 保持用户视图。 */

  var canvasView = null, canvasFitKey = '';

  function canvasApplyView() {
    var svg = $('tCanvas');
    if (!canvasView) return;
    svg.setAttribute('viewBox',
      canvasView.x.toFixed(2) + ' ' + canvasView.y.toFixed(2) + ' ' +
      canvasView.w.toFixed(2) + ' ' + canvasView.h.toFixed(2));
  }

  function canvasZoomAt(svgPt, factor) {
    if (!canvasView) return;
    var w = canvasView.w * factor, h = canvasView.h * factor;
    if (w < canvasView.w0 * 0.02 || w > canvasView.w0 * 4) return; /* 2%~400% */
    canvasView.x = svgPt.x - (svgPt.x - canvasView.x) * factor;
    canvasView.y = svgPt.y - (svgPt.y - canvasView.y) * factor;
    canvasView.w = w; canvasView.h = h;
    canvasApplyView();
  }

  function svgPointFromEvent(e) {
    var svg = $('tCanvas');
    var pt = svg.createSVGPoint ? svg.createSVGPoint() : null;
    if (!pt) return null;
    pt.x = e.clientX; pt.y = e.clientY;
    var ctm = svg.getScreenCTM();
    if (!ctm) return null;
    return pt.matrixTransform(ctm.inverse());
  }

  function initCanvasNav() {
    var wrap = $('canvasWrap'), svg = $('tCanvas');
    if (!wrap || !svg) return;

    /* 滚轮缩放（以鼠标位置为锚） */
    wrap.addEventListener('wheel', function (e) {
      if (!canvasView) return;
      e.preventDefault();
      var p = svgPointFromEvent(e);
      if (p) canvasZoomAt(p, e.deltaY > 0 ? 1.15 : 1 / 1.15);
    }, { passive: false });

    /* 拖拽平移（grab / grabbing；拖拽期间缩放比例不变，用起点 CTM 换算） */
    var pan = null;
    wrap.addEventListener('pointerdown', function (e) {
      if (!canvasView || e.button !== 0) return;
      var ctm = svg.getScreenCTM();
      if (!ctm || !ctm.a) return;
      pan = { x: e.clientX, y: e.clientY, vx: canvasView.x, vy: canvasView.y, sx: ctm.a };
      wrap.classList.add('t-panning');
      if (e.preventDefault) e.preventDefault();
    });
    document.addEventListener('pointermove', function (e) {
      if (!pan) return;
      canvasView.x = pan.vx - (e.clientX - pan.x) / pan.sx;
      canvasView.y = pan.vy - (e.clientY - pan.y) / pan.sx;
      canvasApplyView();
    });
    document.addEventListener('pointerup', function () { if (pan) { pan = null; wrap.classList.remove('t-panning'); } });
    document.addEventListener('pointercancel', function () { if (pan) { pan = null; wrap.classList.remove('t-panning'); } });

    /* +/−/复位 按钮 */
    $('zoomIn').addEventListener('click', function () {
      if (canvasView) canvasZoomAt({ x: canvasView.x + canvasView.w / 2, y: canvasView.y + canvasView.h / 2 }, 1 / 1.3);
    });
    $('zoomOut').addEventListener('click', function () {
      if (canvasView) canvasZoomAt({ x: canvasView.x + canvasView.w / 2, y: canvasView.y + canvasView.h / 2 }, 1.3);
    });
    $('zoomReset').addEventListener('click', function () {
      if (canvasView) { canvasView = { x: canvasView.fx, y: canvasView.fy, w: canvasView.fw, h: canvasView.fh, w0: canvasView.fw, fx: canvasView.fx, fy: canvasView.fy, fw: canvasView.fw, fh: canvasView.fh }; canvasApplyView(); }
    });
  }

  /* ---------------- 回传主页 ---------------- */

  function elevationProfiles() {
    var pts = [];
    state.elevations.forEach(function (r) {
      if (r && r.data_type === 'rtk_xyz' && Array.isArray(r.point_list)) pts = pts.concat(r.point_list);
    });
    return state.plots.map(function (plot) {
      var inside = pts.filter(function (p) { return Number.isFinite(p && p.z) && D.pointInPolygon(p.x, p.y, plot.poly); });
      if (!inside.length) return { id: plot.id, pointCount: 0, minZ: null, maxZ: null };
      var zs = inside.map(function (p) { return p.z; });
      return { id: plot.id, pointCount: inside.length, minZ: Math.min.apply(null, zs), maxZ: Math.max.apply(null, zs) };
    });
  }

  function sendHome() {
    var total = D.plotsTotalAreaM2(state.plots);
    if (total <= 0) return;
    /* 主环用最大子多边形（兼容旧版主页单环消费方）；全部子多边形另经 subPlots 多环回传
       （v298 P0-3：主页二级管路「成组地块」按各子环分别布管，不再吞掉块间空隙）。
       ★ isXY: terrain 的 poly 是 CGCS2000 平面米坐标（画布口径 y 向下），
         主页必须跳过经纬度投影与 v217 垂直镜像，直接入画。 */
    var best = null, bestA = -1;
    state.plots.forEach(function (p) {
      var a = D.polygonAreaM2(p.poly);
      if (a > bestA) { bestA = a; best = p; }
    });
    if (state.mode !== 'engineering') {
      banner('danger', '✕ 预览模式下不回传。请先切换到「工程模式」（明确成果用于工程）。');
      return;
    }
    var csList = state.plots.map(function (p) { return p._cs || 'unknown'; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
    if (csList.length > 1) {
      banner('danger', '✕ 当前地块混用了坐标基准（' + esc(csList.join(' / ')) + '），不能合并回传水力计算。请仅保留同一坐标系的地块。');
      return;
    }
    var payload = {
      sqm: Math.round(total * 100) / 100,
      mu: D.sqmToMu(total),
      poly: best.poly,
      isXY: true,
      subPlots: state.plots.map(function (p, i) {
        var a = D.polygonAreaM2(p.poly);
        return {
          id: p.id || ('st' + i),
          name: p.name || ('子地块' + (i + 1)),
          sqm: Math.round(a * 100) / 100,
          mu: D.sqmToMu(a),
          poly: p.poly, _cs: p._cs || 'unknown'
        };
      }),
      source: 'terrain', coordinateSystem: csList[0] || 'unknown',
      terrainProfile: { source: 'rtk_xyz', plots: elevationProfiles() }
    };
    try {
      localStorage.setItem('runyeMeasuredArea', JSON.stringify(payload));
      banner('ok', '✓ 已回传主页（' + fmtArea(total) + '）。正在跳转 index.html#pipePlanSection …');
      setTimeout(function () { window.location.href = '../index.html#pipePlanSection'; }, 900);
    } catch (e) {
      banner('danger', '✕ 回传失败：' + esc(e.message));
    }
  }

  /* ---------------- 左栏宽度拖拽（复刻主页 .pp-grip 行为） ----------------
     拖动改写 --t-side-w；localStorage 记忆（越界夹回）；双击恢复默认。
     rAF 节流派发 resize，画布 SVG preserveAspectRatio 自适应，无需重算。 */

  var GRIP_KEY = 'runye_terrain_grip_w';
  var GRIP_MIN = 220, GRIP_MAX = 520, CANVAS_MIN = 360;

  function gripClamp(px, maxPx) { return Math.max(GRIP_MIN, Math.min(GRIP_MAX, px, maxPx)); }
  function gripMax() {
    var body = document.querySelector('.t-body');
    return Math.max(GRIP_MIN, Math.min(GRIP_MAX, (body ? body.clientWidth : 1200) - 28 - 10 - CANVAS_MIN));
  }
  function gripApply(px) {
    var body = document.querySelector('.t-body');
    if (body) body.style.setProperty('--t-side-w', px + 'px');
  }
  function initGrip() {
    var grip = $('tGrip'), side = document.querySelector('.t-side');
    if (!grip || !side) return;
    /* 恢复上次宽度（越界夹回） */
    try {
      var saved = parseInt(localStorage.getItem(GRIP_KEY), 10);
      if (Number.isFinite(saved)) gripApply(gripClamp(saved, gripMax()));
    } catch (e) { /* 无痕模式等忽略 */ }

    var EV = window.PointerEvent
      ? { down: 'pointerdown', move: 'pointermove', up: 'pointerup', cancel: 'pointercancel' }
      : { down: 'mousedown', move: 'mousemove', up: 'mouseup', cancel: 'blur' };
    var drag = null, pend = false;
    function refit() {
      if (pend) return; pend = true;
      var run = function () { pend = false; try { window.dispatchEvent(new Event('resize')); } catch (e) {} };
      if (window.requestAnimationFrame) window.requestAnimationFrame(run); else setTimeout(run, 16);
    }
    grip.addEventListener(EV.down, function (e) {
      if (e.button != null && e.button !== 0) return;
      drag = { x: e.clientX, w: side.getBoundingClientRect().width };
      grip.classList.add('dragging');
      document.body.classList.add('t-col-resizing');
      if (e.preventDefault) e.preventDefault();
    });
    document.addEventListener(EV.move, function (e) {
      if (!drag) return;
      gripApply(gripClamp(drag.w + (e.clientX - drag.x), gripMax()));
      refit();
    });
    document.addEventListener(EV.up, function () {
      if (!drag) return;
      drag = null;
      grip.classList.remove('dragging');
      document.body.classList.remove('t-col-resizing');
      try {
        var px = side.getBoundingClientRect().width;
        localStorage.setItem(GRIP_KEY, String(Math.round(px)));
      } catch (e) {}
    });
    document.addEventListener(EV.cancel, function () {
      if (!drag) return;
      drag = null; grip.classList.remove('dragging');
      document.body.classList.remove('t-col-resizing');
    });
    grip.addEventListener('dblclick', function () {
      var body = document.querySelector('.t-body');
      if (body) body.style.removeProperty('--t-side-w');
      try { localStorage.removeItem(GRIP_KEY); } catch (e) {}
    });
  }

  /* ---------------- 事件绑定与启动 ---------------- */

  function persistAndRender() {
    D.saveState(state);
    renderPlots();
    renderElev();
    drawCanvas();
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
    $('elevDots').addEventListener('change', drawCanvas);
    initCanvasNav();
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
    var s = D.sanitizeRing(r.points);
    if (!s.ok) { banner('danger', '✕ 边界环无效：' + esc(s.error)); return; }
    var lv = prompt('梯田层级（可留空 = 不分层；填 1/2/3… 表示第几级台面）：', '');
    var level = lv && /^\d+$/.test(lv.trim()) ? +lv.trim() : null;
    state.plots.push({
      id: 'man_' + Date.now(),
      name: '手动地块' + (state.plots.length + 1),
      poly: s.pts.map(function (pt) { return { x: Math.round(pt.x * 100) / 100, y: Math.round(pt.y * 100) / 100 }; }),
      level: level, source: '手动'
    });
    persistAndRender();
    if (s.warn.length) banner('warn', '手动地块已导入，但：' + esc(s.warn.join('；')));
  }

  /* ---------------- 山地喷灌设计 · 参数区（v287） ----------------
     表单持久化独立 key；「估算」与地块汇总面积联动；
     输入变更后若已有结果则自动重算。 */

  var SP_KEY = 'runye_terrain_sprinkler_v1';
  var SP_BRIDGE_KEY = 'runyeSprinklerResult';   /* v384 任务书 P0：喷灌成果数据桥（plugins/sprinkler 消费） */
  var SP_COLORS = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#be185d', '#4d7c0f']; /* 轮灌组着色 */
  var SP_DEFAULTS = { crop: '', etc: 4.5, eta: 0.7, soil: 'loam', slope: 8,
                      range: 8.5, flow: 0.35, pressure: 250, ratedFlow: '', ratedPressure: '', sourceFlow: '', layout: 'square', k: 1.1, heads: 255,
                      spacing: 12, riserOd: 25, riserH: 3, zoneMin: 50, zoneMax: 60, macroMin: 200, macroMax: 250, tankV: '', boostQ: '', boostH: '', boostSplit: '',
                      trenchD: 0.5, twMain: 0.5, twSub: 0.4, twLat: 0.3, filterOn: true, filterN: 1, fertOn: true, fertN: 1 };

  function spRead() {
    var sm = parseFloat($('spSpacing').value);
    return {
      crop: ($('spCrop').value || '').trim(),
      etc: parseFloat($('spEtc').value), eta: parseFloat($('spEta').value),
      soil: $('spSoil').value, slope: parseFloat($('spSlope').value),
      range_m: parseFloat($('spRange').value), flow_m3h: parseFloat($('spFlow').value),
      pressure_kpa: parseFloat($('spPressure').value), layout: $('spLayout').value,
      rated_flow_m3h: parseFloat($('spRatedFlow').value), rated_pressure_kpa: parseFloat($('spRatedPressure').value),
      source_flow_m3h: parseFloat($('spSourceFlow').value),
      spacing_k: parseFloat($('spK').value), heads_per_shift: parseInt($('spHeads').value, 10),
      spacing_m: (isFinite(sm) && sm > 0) ? sm : null,   /* 留空 = 用间距系数 k（core 内 Number(null)=0 → factor 模式） */
      zone_min_mu: parseFloat($('spZoneMin').value), zone_max_mu: parseFloat($('spZoneMax').value),
      macro_min_mu: parseFloat($('spMacroMin').value), macro_max_mu: parseFloat($('spMacroMax').value),
      riser_od_mm: parseFloat($('spRiserOd').value) || 25,
      riser_height_m: parseFloat($('spRiserH').value) || 3,
      tank_v: parseFloat($('spTankV').value) || null,
      boost_q: parseFloat($('spBoostQ').value) || null,
      boost_h: parseFloat($('spBoostH').value) || null,
      boost_split: parseFloat($('spBoostSplit').value) || null,
      trench_depth_m: parseFloat($('spTrenchD').value) || 0.5,
      trench_w_main_m: parseFloat($('spTwMain').value) || 0.5,
      trench_w_sub_m: parseFloat($('spTwSub').value) || 0.4,
      trench_w_lat_m: parseFloat($('spTwLat').value) || 0.3,
      filter_on: $('spFilterOn').checked,
      filter_n: parseInt($('spFilterN').value, 10) || 1,
      fert_on: $('spFertOn').checked,
      fert_n: parseInt($('spFertN').value, 10) || 1
    };
  }
  function spFill(v) {
    $('spCrop').value = v.crop || '';
    $('spEtc').value = v.etc; $('spEta').value = v.eta; $('spSoil').value = v.soil;
    $('spSlope').value = v.slope; $('spRange').value = v.range_m; $('spFlow').value = v.flow_m3h;
    $('spPressure').value = v.pressure_kpa; $('spLayout').value = v.layout;
    $('spRatedFlow').value = v.rated_flow_m3h || v.ratedFlow || '';
    $('spRatedPressure').value = v.rated_pressure_kpa || v.ratedPressure || '';
    $('spSourceFlow').value = v.source_flow_m3h || v.sourceFlow || '';
    $('spK').value = v.spacing_k; $('spHeads').value = v.heads_per_shift;
    $('spSpacing').value = (v.spacing_m != null && isFinite(v.spacing_m) && v.spacing_m > 0) ? v.spacing_m : '';
    $('spZoneMin').value = v.zone_min_mu || v.zoneMin || 50; $('spZoneMax').value = v.zone_max_mu || v.zoneMax || 60;
    $('spMacroMin').value = v.macro_min_mu || v.macroMin || 200; $('spMacroMax').value = v.macro_max_mu || v.macroMax || 250;
    $('spRiserOd').value = v.riser_od_mm || v.riserOd || 25;
    $('spRiserH').value = v.riser_height_m || v.riserH || 3;
    $('spTankV').value = (v.tank_v != null && isFinite(v.tank_v)) ? v.tank_v : (v.tankV || '');
    $('spBoostQ').value = (v.boost_q != null && isFinite(v.boost_q)) ? v.boost_q : (v.boostQ || '');
    $('spBoostH').value = (v.boost_h != null && isFinite(v.boost_h)) ? v.boost_h : (v.boostH || '');
    $('spBoostSplit').value = (v.boost_split != null && isFinite(v.boost_split)) ? v.boost_split : (v.boostSplit || '');
    $('spTrenchD').value = (v.trench_depth_m != null && isFinite(v.trench_depth_m)) ? v.trench_depth_m : (v.trenchD || 0.5);
    $('spTwMain').value = (v.trench_w_main_m != null && isFinite(v.trench_w_main_m)) ? v.trench_w_main_m : (v.twMain || 0.5);
    $('spTwSub').value = (v.trench_w_sub_m != null && isFinite(v.trench_w_sub_m)) ? v.trench_w_sub_m : (v.twSub || 0.4);
    $('spTwLat').value = (v.trench_w_lat_m != null && isFinite(v.trench_w_lat_m)) ? v.trench_w_lat_m : (v.twLat || 0.3);
    $('spFilterOn').checked = v.filter_on !== false && v.filterOn !== false;
    $('spFilterN').value = v.filter_n || v.filterN || 1;
    $('spFertOn').checked = v.fert_on !== false && v.fertOn !== false;
    $('spFertN').value = v.fert_n || v.fertN || 1;
  }
  function spSave() { try { localStorage.setItem(SP_KEY, JSON.stringify(spRead())); } catch (e) {} }

  function calcSprinkler() {
    var area = D.plotsTotalAreaM2(state.plots);
    var input = spRead();
    spSave();
    var res = D.sprinklerEstimate(input, area);
    var box = $('spResult'), warnBox = $('spWarn');
    if (!res.ok) {
      box.hidden = true;
      warnBox.hidden = false; warnBox.className = 't-spwarn';
      warnBox.textContent = res.error;
      /* 输入已无效时清掉旧 BOM 与共享快照，避免下游插件继续展示上一轮的过期方案。 */
      var staleBom = $('spBomCard'); if (staleBom) staleBom.hidden = true;
      try { localStorage.removeItem(SP_BRIDGE_KEY); } catch (e) {}
      return;
    }
    var rows = [
      '喷头间距 <b>' + res.spacing.toFixed(1) + ' m</b> × 行距 ' + res.rowSpacing.toFixed(1) + ' m（' + (res.layout === 'tri' ? '正三角形' : '正方形') + (res.spacingMode === 'fixed' ? ' · 直接填间距' : '') + '）',
      '单喷头控制面积 <b>' + Math.round(res.headArea) + ' ㎡</b>',
      '总灌溉面积 <b>' + fmtArea(area) + '</b> → 需喷头约 <b>' + res.headCount + '</b> 个',
      '轮灌组数 <b>' + res.shiftCount + '</b> 组（每组 ' + res.headsPerShift + ' 个同时工作）',
      '系统流量 <b>' + res.systemFlow.toFixed(1) + ' m³/h</b>',
      '组合喷灌强度 <b>' + res.precipRate.toFixed(1) + ' mm/h</b>（' + D.soilLabel(res.soil) + '允许 ' + res.precipAllow + '）' + (res.precipOk ? ' ✓' : ' ✗')
    ];
    var projectPlan = D.sprinklerProjectPlan(input, area / 666.67, null);
    if (projectPlan && projectPlan.ok) {
      rows.push('地理灌溉小区建议 <b>' + projectPlan.zones.recommended + '</b> 个，平均 ' + projectPlan.zones.average_mu + ' 亩/区' + (projectPlan.zones.feasible ? '（符合 50–60 亩）' : '（总面积无法整分到目标范围，请调整边界）'));
      rows.push('200–250 亩大灌溉区：' + (projectPlan.macrozones.feasible ? projectPlan.macrozones.min + (projectPlan.macrozones.max > projectPlan.macrozones.min ? '–' + projectPlan.macrozones.max : '') + ' 个' : '当前总面积无法按该范围划分'));
      rows.push('<b>任务书固定管径：</b>主管 PE DN160 · 干管 PE DN110 · 小区支管 PE DN50（规格记录，不等于水力校核通过）');
      rows.push('配套要求：380V 三相四线 · PE 热熔 · 每个地理小区独立阀 · 板框过滤 · 溶肥容器/中转池 · 二次加压');
    }
    if (res.sourceFlow != null) rows.push('水源流量校核 <b>' + res.sourceFlow.toFixed(1) + ' m³/h</b> → ' + (res.sourceFlowOk ? '满足当前轮灌组 ✓' : '不足 ✗'));
    if (res.expectedFlow != null) rows.push('喷嘴曲线换算流量 <b>' + res.expectedFlow.toFixed(2) + ' m³/h</b> → ' + (res.nozzleOk ? '与输入一致 ✓' : '偏差过大 ✗'));
    if (res.dailyHours != null) rows.push('满足日耗水 ' + input.etc + ' mm/d 需日喷洒约 <b>' + res.dailyHours.toFixed(1) + ' 小时</b>（η=' + input.eta + '）');
    box.innerHTML = rows.join('<br>');
    box.hidden = false;
    warnBox.hidden = res.warn.length === 0;
    warnBox.className = 't-spwarn';
    warnBox.innerHTML = res.warn.map(esc).join('<br>');
    /* v298e：参数生效后重绘制图区——分区（辐射圆着色）/管道/喷头/图例管径
       全部按新参数重建（drawCanvas 内部 spRead() 实时读参数）。
       无效参数（res.ok=false）已在上方 return，画布保留旧布置只报警告。 */
    drawCanvas();

    /* v384 任务书 P0：布置 → BOM → 写数据桥 localStorage['runyeSprinklerResult']。
       与地图回传同款套路：写前 removeItem 再 set，确保每次是全新快照。
       桥接失败不阻断估算展示（估算结果已在上面渲染完成）。 */
    try {
      var lay = D.sprinklerLayout(state.plots, input);
      if (lay && lay.ok) {
        var plan = D.sprinklerProjectPlan(input, area / 666.67, lay);
        /* P1：蓄水池/二次加压填了参数就随 BOM 落桥（core 内 tankVolumeEstimate/boostModel 口径） */
        var tankOpt = null, boostOpt = null;
        if (input.tank_v > 0) tankOpt = { volume_m3: input.tank_v, note: '蓄水池（手填/按参数估算）' };
        if (input.boost_h > 0 && input.boost_split > 0 && input.boost_split < input.boost_h) {
          var bq = input.boost_q > 0 ? input.boost_q : (res.headsPerShift * input.flow_m3h);
          boostOpt = D.boostModel({ q_m3h: bq, total_head_m: input.boost_h, split_at_m: input.boost_split });
        }
        var bom = D.sprinklerBom(lay, {
          flow_m3h: input.flow_m3h, riser_od_mm: input.riser_od_mm, riser_height_m: input.riser_height_m, project: plan,
          tank: tankOpt, boost: boostOpt,
          trench_depth_m: input.trench_depth_m, trench_w_main_m: input.trench_w_main_m,
          trench_w_sub_m: input.trench_w_sub_m, trench_w_lat_m: input.trench_w_lat_m,
          filter: { enabled: input.filter_on, sets: input.filter_n },
          fert: { enabled: input.fert_on, sets: input.fert_n }
        });
        if (bom && bom.ok && plan && plan.ok) {
          bom.project = plan;
          bom.pipes.specified = plan.specifiedNetwork;
        }
        if (bom && bom.ok) {
          renderSpBom(bom);
          var names = state.plots.map(function (p) { return p.name || ''; }).filter(Boolean);
          var payload = {
            version: 1, ts: Date.now(),
            plotRef: {
              id: state.plots.map(function (p) { return p.id; }).join(','),
              name: names.join('、') || ('共 ' + state.plots.length + ' 块地块'),
              mu: Math.round(area / 666.67 * 100) / 100,
              sqm: Math.round(area * 100) / 100
            },
            bom: bom, layout: lay
          };
          localStorage.removeItem(SP_BRIDGE_KEY);
          localStorage.setItem(SP_BRIDGE_KEY, JSON.stringify(payload));
        }
      } else {
        var bomCard = $('spBomCard'); if (bomCard) bomCard.hidden = true;
      }
    } catch (e) { /* 桥写失败只影响插件消费，页面估算结果不受影响 */ }
  }

  /* v384 任务书 P0：喷灌材料清单（BOM）纯展示，样式沿用估算结果区 */
  function renderSpBom(bom) {
    var card = $('spBomCard'), box = $('spBom');
    if (!card || !box || !bom || !bom.ok) return;
    var rows = [];
    rows.push('喷头 <b>' + bom.heads.count + '</b> 个' +
      (bom.heads.flowLh ? ' × ' + bom.heads.flowLh + ' L/h' : '') +
      ' · R=' + bom.heads.radius_m + ' m · 间距 ' + bom.heads.spacing_m + ' m');
    rows.push('镀锌立管 <b>' + bom.risers.count + '</b> 根 · Φ' + bom.risers.od_mm + ' mm × ' + bom.risers.height_m + ' m');
    rows.push('布置图估算干管 Φ' + (bom.pipes.mainline.dn_mm || '—') + ' × <b>' + bom.pipes.mainline.len_m + '</b> m');
    rows.push('布置图估算支管 Φ' + (bom.pipes.laterals.dn_mm || '—') + ' × <b>' + bom.pipes.laterals.len_m + '</b> m');
    if (bom.project) {
      rows.push('<b>任务书指定规格（非水力校核结果）</b>：主管 PE DN160 · 干管 PE DN110 · 小区支管 PE DN50；以上布置线长度仅为示意量，不含全场主管路由。');
      rows.push('380V 三相四线 · PE 热熔连接 · 每个地理灌溉小区设独立总阀（沿道路定位需现场管线图）');
      rows.push('地理小区 <b>' + bom.project.zones.recommended + '</b> 个，平均 ' + bom.project.zones.average_mu + ' 亩/区' + (bom.project.zones.feasible ? '' : '（未落入 50–60 亩范围）'));
      rows.push('200–250 亩大灌溉区：' + (bom.project.macrozones.feasible ? bom.project.macrozones.min + (bom.project.macrozones.max > bom.project.macrozones.min ? '–' + bom.project.macrozones.max : '') + ' 个' : '当前面积无法满足范围'));
      rows.push('<b>待补资料/校核：</b>' + bom.project.notes.map(esc).join('<br>'));
    }
    rows.push('轮灌运行批次 <b>' + bom.shifts.groupCount + '</b> 组（每组 ' + bom.shifts.headsPerShift + ' 个同时工作）；地理小区总阀约 <b>' + (bom.valves.count == null ? '待按小区确定' : bom.valves.count + ' 个') + '</b>');
    if (bom.tank) rows.push('蓄水池 <b>' + bom.tank.volume_m3 + '</b> m³（' + esc(bom.tank.note || '') + '）');
    if (bom.boost) rows.push('二次加压：一段泵 <b>' + bom.boost.stage1.power_kw + '</b> kW + 二段泵 <b>' + bom.boost.stage2.power_kw + '</b> kW');
    if (bom.trench) rows.push('沟槽土方 <b>' + bom.trench.volume_m3 + '</b> m³（深 ' + bom.trench.depth_m + ' m · 干管宽 ' + bom.trench.widths.sub_m + ' / 支管宽 ' + bom.trench.widths.lat_m + ' m）');
    if (bom.filter) rows.push('板框过滤器 <b>' + bom.filter.sets + '</b> 套（' + esc(bom.filter.note || '') + '）');
    if (bom.fert) rows.push('溶肥容器 + 肥液中转池 <b>' + bom.fert.sets + '</b> 套');
    box.innerHTML = rows.join('<br>');
    card.hidden = false;
  }

  /* v384 P1：蓄水池按参数估算回填（V = 亩×667×ETc×days/1000/η，days 默认 2 供水中断缓冲） */
  function calcTank() {
    var area = D.plotsTotalAreaM2(state.plots);
    if (!(area > 0)) { banner('warn', '蓄水池估算需要先导入地块（按当前地块亩数计算）'); return; }
    var r = D.tankVolumeEstimate({
      area_mu: area / 666.67,
      etc_mm: parseFloat($('spEtc').value),
      eta: parseFloat($('spEta').value)
    });
    if (!r.ok) { banner('warn', esc(r.error)); return; }
    $('spTankV').value = r.volume_m3;
    spSave();
    banner('ok', '蓄水池建议 <b>' + r.volume_m3 + ' m³</b>（' + esc(r.formula) + '）——建议值，可按日轮灌制度调整');
  }

  /* v384 P1：两段泵选型展示（P=2.725×Q×H/η/1000，与主页 pump.power 同口径，不另写公式） */
  function calcBoost() {
    var box = $('spBoostResult');
    var th = parseFloat($('spBoostH').value), sp = parseFloat($('spBoostSplit').value);
    var q = parseFloat($('spBoostQ').value);
    if (!(q > 0)) {
      var fl = parseFloat($('spFlow').value), n = parseInt($('spHeads').value, 10);
      if (fl > 0 && n > 0) q = fl * n;   /* 泵流量留空 → 默认轮灌组流量（与估算同参） */
    }
    if (!(q > 0) || !(th > 0) || !(sp > 0) || sp >= th) {
      box.hidden = false;
      box.textContent = '请填「泵总扬程」与「二级起点扬程」（起点须小于总扬程）；泵流量留空则按轮灌组流量。';
      return;
    }
    var r = D.boostModel({ q_m3h: q, total_head_m: th, split_at_m: sp });
    if (!r.ok) { box.hidden = false; box.textContent = r.error; return; }
    box.hidden = false;
    box.innerHTML =
      '系统流量 <b>' + r.flow.toFixed(1) + ' m³/h</b> · η=' + r.eta + '<br>' +
      '一段泵（主加压 ' + r.stage1.head + ' m）：<b>' + r.stage1.power_kw + ' kW</b> → 电机 ' + (r.stage1.motor_kw != null ? r.stage1.motor_kw + ' kW' : '超标准序列') + '<br>' +
      '二段泵（二次加压 ' + r.stage2.head + ' m）：<b>' + r.stage2.power_kw + ' kW</b> → 电机 ' + (r.stage2.motor_kw != null ? r.stage2.motor_kw + ' kW' : '超标准序列') + '<br>' +
      esc(r.note);
    spSave();
  }

  /* 轮灌演示（v290）：分组依次点亮——当前组满亮、其余压暗；再点停止并清空高亮。
     v298c 水流叙事：演示态 #tCanvas.t-demo-on 下干管水流线常流；
     激活组所在行的支管水流线点亮（水沿干管→支管到达）；喷头弹出、
     喷射圆从喷头扩散弹出并叠加涟漪波纹（水洒开）。 */
  var spDemoTimer = null, spDemoStep = 0;
  function applySpDemo() {
    var svg = $('tCanvas');
    svg.classList.add('t-demo-on');
    svg.querySelectorAll('.t-sp-ripple').forEach(function (el) { el.remove(); });  /* 上一组涟漪清理（不依赖 animationend） */
    svg.querySelectorAll('[data-g]').forEach(function (el) {
      var on = +el.getAttribute('data-g') === spDemoStep;
      el.classList.toggle('t-sp-active', on);
      el.classList.toggle('t-sp-dim', !on);
    });
    svg.querySelectorAll('.t-sp-latflow').forEach(function (el) {
      var gs = ',' + (el.getAttribute('data-gs') || '') + ',';
      el.classList.toggle('t-sp-flow-on', gs.indexOf(',' + spDemoStep + ',') >= 0);
    });
    /* 涟漪波纹：激活组每个喷头一个扩散环（组色描边，扩散淡出） */
    var cc = SP_COLORS[(spDemoStep - 1) % SP_COLORS.length];
    svg.querySelectorAll('.t-sp-circle[data-g="' + spDemoStep + '"]').forEach(function (c) {
      var rp = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      rp.setAttribute('class', 't-sp-ripple');
      rp.setAttribute('cx', c.getAttribute('cx'));
      rp.setAttribute('cy', c.getAttribute('cy'));
      rp.setAttribute('r', c.getAttribute('r'));
      rp.setAttribute('stroke', cc);
      rp.addEventListener('animationend', function () { if (rp.parentNode) rp.parentNode.removeChild(rp); });
      svg.appendChild(rp);
    });
  }
  function stopSpDemo() {
    if (spDemoTimer) { clearInterval(spDemoTimer); spDemoTimer = null; }
    var btn = $('spDemo'); if (btn) btn.textContent = '\u25B6 \u8f6e\u704c\u6f14\u793a';
    var svg = $('tCanvas');
    svg.classList.remove('t-demo-on');
    svg.querySelectorAll('.t-sp-active, .t-sp-dim').forEach(function (el) {
      el.classList.remove('t-sp-active'); el.classList.remove('t-sp-dim');
    });
    svg.querySelectorAll('.t-sp-latflow.t-sp-flow-on').forEach(function (el) { el.classList.remove('t-sp-flow-on'); });
    svg.querySelectorAll('.t-sp-ripple').forEach(function (el) { el.remove(); });
  }
  function spDemoTick() {
    var gs = {};  /* 分区多边形已隐藏，组数按画布上 data-g 去重统计 */
    $('tCanvas').querySelectorAll('[data-g]').forEach(function (el) { gs[el.getAttribute('data-g')] = 1; });
    var total = Object.keys(gs).length;
    if (!total) { stopSpDemo(); return; }
    spDemoStep = spDemoStep % total + 1;
    applySpDemo();
  }

  /* 图例拖动（v291）：按住图例可在制图区内任意拖动，位置持久化；
     首次拖动把「底部居中」换成自由 left/top，指针捕获保证拖出元素也不丢事件 */
  function initLegendDrag() {
    var lg = $('spLegend'), wrap = $('canvasWrap');
    if (!lg || !wrap) return;
    var drag = null;
    function freePosition() {
      var lr = lg.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
      lg.style.left = (lr.left - wr.left) + 'px';
      lg.style.top = (lr.top - wr.top) + 'px';
      lg.style.right = 'auto'; lg.style.bottom = 'auto'; lg.style.transform = 'none';
    }
    lg.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      freePosition();
      var lr = lg.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
      drag = { dx: e.clientX - lr.left, dy: e.clientY - lr.top, w: lr.width, h: lr.height };
      lg.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    lg.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var wr = wrap.getBoundingClientRect();
      var x = Math.max(4, Math.min(e.clientX - wr.left - drag.dx, wr.width - drag.w - 4));
      var y = Math.max(4, Math.min(e.clientY - wr.top - drag.dy, wr.height - drag.h - 4));
      lg.style.left = x + 'px'; lg.style.top = y + 'px';
    });
    lg.addEventListener('pointerup', function () {
      if (!drag) return;
      drag = null;
      try { localStorage.setItem('runye_terrain_legend_pos', JSON.stringify({ left: lg.style.left, top: lg.style.top })); } catch (e) {}
    });
    /* 恢复上次拖动位置 */
    try {
      var pos = JSON.parse(localStorage.getItem('runye_terrain_legend_pos') || 'null');
      if (pos && pos.left && pos.top) {
        lg.style.left = pos.left; lg.style.top = pos.top;
        lg.style.right = 'auto'; lg.style.bottom = 'auto'; lg.style.transform = 'none';
      }
    } catch (e) {}
  }

  /* 图例（v289b）：内容由 SP_COLORS 单一来源生成，避免与画布配色两处维护 */
  function buildSpLegend(lay) {
    var lg = $('spLegend');
    if (!lg) return;
    var dots = SP_COLORS.map(function (c, i) {
      return '<span class="tl-dot" style="background:' + c + '">' + (i + 1) + '</span>';
    }).join('');
    /* 管径（v293）：有喷头流量参数时显示 Φ 与流量；无则退回纯线型说明 */
    var mainTxt = '干管', latTxt = '支管';
    if (lay && lay.ok && lay.mainDN && lay.latDN) {
      mainTxt = '布置图初估干管 Φ' + lay.mainDN.dn + '（' + lay.mainFlow.toFixed(1) + ' m³/h）';
      latTxt = '布置图初估支管 Φ' + lay.latDN.dn + '（' + lay.latFlow.toFixed(1) + ' m³/h）';
    }
    /* v384 P2：勾选启用才进图例（与 BOM 计入口径一致，不造假数） */
    var extras = '';
    if ($('spFilterOn') && $('spFilterOn').checked) {
      extras += '<span class="tl-item"><span class="tl-swatch" style="background:#94a3b8"></span>板框过滤器 ×' + (parseInt($('spFilterN').value, 10) || 1) + '</span>';
    }
    if ($('spFertOn') && $('spFertOn').checked) {
      extras += '<span class="tl-item"><span class="tl-swatch" style="background:#a16207"></span>溶肥容器+中转池 ×' + (parseInt($('spFertN').value, 10) || 1) + '</span>';
    }
    lg.innerHTML =
      '<span class="tl-item"><span class="tl-swatch tl-plot"></span>地块边界</span>' +
      '<span class="tl-item"><span class="tl-swatch tl-main"></span>' + mainTxt + '</span>' +
      '<span class="tl-item"><span class="tl-swatch tl-lat"></span>' + latTxt + '</span>' +
      '<span class="tl-item"><span class="tl-swatch" style="background:#475569"></span>立管 Φ' + spRead().riser_od_mm + '×' + spRead().riser_height_m + 'm</span>' +
      extras +
      '<span class="tl-item"><span class="tl-swatch tl-range"></span>喷射范围（半径 R）</span>' +
      '<span class="tl-item">喷头颜色 = 轮灌组' + dots + '<em>（第 9 组起颜色循环）</em></span>';
  }

  function bindSprinkler() {
    try {
      var saved = JSON.parse(localStorage.getItem(SP_KEY) || 'null');
      if (saved && typeof saved === 'object') spFill(Object.assign({}, SP_DEFAULTS, saved));
    } catch (e) { /* 损坏用默认 */ }
    $('spCalc').addEventListener('click', calcSprinkler);
    $('spTankCalc').addEventListener('click', calcTank);   /* v384 P1 蓄水池估算 */
    $('spBoostCalc').addEventListener('click', calcBoost); /* v384 P1 两段泵 */
    $('spReset').addEventListener('click', function () { spFill(SP_DEFAULTS); spSave(); calcSprinkler(); });
    $('spOverlay').addEventListener('change', drawCanvas); /* 切换喷灌布置叠加层 */
    buildSpLegend();
    initLegendDrag();
    $('spDemo').addEventListener('click', function () {
      if (spDemoTimer) { stopSpDemo(); return; }
      spDemoStep = 0;
      spDemoTick();
      spDemoTimer = setInterval(spDemoTick, 2200);
      $('spDemo').textContent = '\u23F8 \u505c\u6b62\u6f14\u793a';
    }); /* 轮灌演示动画 */
    /* v298e：参数改动即时生效——change（下拉/步进/失焦）立即重算；
       打字过程用 input 事件 + 350ms 防抖（合并中间态）。
       不再要求先点过「估算」：图上已按参数画布置，参数一改就必须重算分区与管径。
       无效输入（如清空再打字）由 calcSprinkler 报警告并保留旧布置。 */
    var spInputTimer = null;
    function spAutoCalc() { clearTimeout(spInputTimer); spInputTimer = setTimeout(calcSprinkler, 350); }
    ['spCrop', 'spEtc', 'spEta', 'spSoil', 'spSlope', 'spRange', 'spFlow', 'spPressure', 'spLayout', 'spK', 'spSpacing', 'spHeads', 'spZoneMin', 'spZoneMax', 'spMacroMin', 'spMacroMax']
      .forEach(function (id) {
        $(id).addEventListener('change', function () { clearTimeout(spInputTimer); calcSprinkler(); });
        $(id).addEventListener('input', spAutoCalc);
      });
  }

  /* ---------------- 接住在线地图「回传地形模块」 ----------------
     契约（map-measure sendPlotToTerrain 写入）：runye_terrain_incoming =
     buildPlotPayload 的结构 —— { name, poly:[{lat,lng}], subPlots:[{name,polyLatLng,sqm}], sqm, mu }。
     导入：经纬度环 → 局部米制投影（core.lonlatToLocalMeters）→ 加入地块清单；
     读到即清除 key，避免下次打开重复导入。 */

  function consumeIncoming() {
    var raw = null;
    try { raw = localStorage.getItem('runye_terrain_incoming'); } catch (e) { return; }
    if (!raw) return;
    try {
      var d = JSON.parse(raw);
      localStorage.removeItem('runye_terrain_incoming');
      if (!d || typeof d !== 'object') return;
      var rings = [];
      if (Array.isArray(d.subPlots) && d.subPlots.length) {
        d.subPlots.forEach(function (s) {
          if (s && Array.isArray(s.polyLatLng) && s.polyLatLng.length >= 3)
            rings.push({ ring: s.polyLatLng, name: s.name || '', sqm: s.sqm });
        });
      } else if (Array.isArray(d.poly) && d.poly.length >= 3) {
        rings.push({ ring: d.poly, name: d.name || '', sqm: d.sqm });
      }
      if (!rings.length) return;
      /* v298j（用户要求）：新回传**直接替换**之前回传的地块——
         旧 source==='在线地图' 的全部移除后再导入（手绘/shp/CSV 等其他来源不动），
         避免「几个地块同时传过来叠成一团」。地图页「点哪个传哪个」的选中行为不变。 */
      var beforeCnt = state.plots.length;
      state.plots = state.plots.filter(function (p) { return p.source !== '在线地图'; });
      var replaced = beforeCnt - state.plots.length;
      var added = 0, updated = 0, bad = 0;
      rings.forEach(function (r, i) {
        var c = D.lonlatToLocalMeters(r.ring);
        if (!c.ok) { bad++; return; }
        var base = r.name || d.name || '在线地图地块';
        var name = base + (rings.length > 1 ? '#' + (added + updated + 1) : '');
        var poly = c.points.map(function (pt) { return { x: Math.round(pt.x * 100) / 100, y: Math.round(pt.y * 100) / 100 }; });
        var sqmNew = D.polygonAreaM2(poly);
        /* 去重（v292）：已有同名在线地图地块且面积差 <1% → 原地更新几何，不重复新增。
           否则同一块地每点一次「回传地形模块」就多一份副本，地块总数与总面积虚增。 */
        var hit = -1;
        for (var pi = 0; pi < state.plots.length; pi++) {
          var p = state.plots[pi];
          if (p.name !== name || !Array.isArray(p.poly) || p.poly.length < 3) continue;
          var sqmOld = D.polygonAreaM2(p.poly);
          if (sqmOld > 0 && sqmNew > 0 && Math.abs(sqmOld - sqmNew) / sqmNew < 0.01) { hit = pi; break; }
        }
        if (hit >= 0) {
          state.plots[hit].poly = poly;
          state.plots[hit]._mapSqm = isFinite(r.sqm) ? r.sqm : state.plots[hit]._mapSqm;
          updated++;
        } else {
          state.plots.push({
            id: 'map_' + Date.now() + '_' + i,
            name: name,
            /* 每一环以自身首点建局部投影，多个环并不天然共用一个工程坐标原点。 */
            poly: poly, _cs: 'local-wgs84@' + c.origin.lat.toFixed(6) + ',' + c.origin.lng.toFixed(6),
            level: null, source: '在线地图',
            _mapSqm: isFinite(r.sqm) ? r.sqm : null
          });
          added++;
        }
      });
      if (added || updated) {
        setUnit('mu'); /* 回传导入成功：面积显示默认切为亩（内部恒为平方米） */
        persistAndRender();
        incomingBannerShown = true;
        banner('warn',
          '✓ 在线地图回传已导入 <b>' + added + '</b> 个地块（WGS-84 经纬度已按局部米制投影，面积已按<b>亩</b>显示）。' +
          (replaced ? '本次为<b>替换导入</b>：已移除之前回传的 <b>' + replaced + '</b> 个在线地图地块（其他来源地块不受影响）。' : '') +
          (updated ? '另有 <b>' + updated + '</b> 个同名地块已<b>原地更新</b>（未重复导入）。' : '') +
          '注意：<b>非 CGCS2000 平面坐标</b>——工程放样/水力计算前请以 CGCS2000 成果文件导入为准。' +
          (bad ? '另有 ' + bad + ' 个无效环已跳过。' : ''));
      }
    } catch (e) { /* 契约损坏：清除防卡死 */ try { localStorage.removeItem('runye_terrain_incoming'); } catch (e2) {} }
  }

  /* v292b：清理历史版本积累的重复导入副本（同名+同源+面积差<1% 只留最早一份） */
  var incomingBannerShown = false;
  function dedupePlots() {
    var removed = 0;
    for (var i = state.plots.length - 1; i >= 0; i--) {
      var p = state.plots[i];
      if (p.source !== '在线地图' || !Array.isArray(p.poly) || p.poly.length < 3) continue;
      var sqm = D.polygonAreaM2(p.poly);
      for (var j = 0; j < i; j++) {
        var q = state.plots[j];
        if (q.name !== p.name || q.source !== '在线地图' || !Array.isArray(q.poly) || q.poly.length < 3) continue;
        var sqmQ = D.polygonAreaM2(q.poly);
        if (sqmQ > 0 && sqm > 0 && Math.abs(sqmQ - sqm) / sqmQ < 0.01) {
          state.plots.splice(i, 1); removed++; break;
        }
      }
    }
    if (removed) D.saveState(state);
    return removed;
  }

  document.addEventListener('DOMContentLoaded', function () {
    bind();
    initGrip();
    bindSprinkler();
    setUnit(areaUnit); /* 同步单位按钮初始态（含持久化偏好恢复） */
    var dedupRemoved = dedupePlots(); /* 清理历史重复导入副本（v292b） */
    persistAndRender();
    consumeIncoming(); /* 必须在 persistAndRender 之后：用自己的导入提示条收尾 */
    if (dedupRemoved > 0 && !incomingBannerShown) {
      banner('ok', '✓ 已自动清理 <b>' + dedupRemoved + '</b> 个重复导入的地块副本（同名同面积的在线地图地块只保留一个），总面积已修正。');
    }
  });

  /* 供测试/自动化探针使用 */
  window.RyTerrainUI = { state: state, sendHome: sendHome, setUnit: setUnit, setMode: setMode };
})();
