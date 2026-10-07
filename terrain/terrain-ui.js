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
    drawCanvas(); /* 画布标签面积随单位 */
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
        lay.zonePolys.forEach(function (z) {  /* 分区范围（v290 闭合多边形，按组着色） */
          var d = z.pts.map(function (pt) { return pt.x.toFixed(1) + ',' + (flip - pt.y).toFixed(1); }).join(' ');
          var c = SP_COLORS[(z.g - 1) % SP_COLORS.length];
          out.push('<polygon class="t-sp-zone" data-g="' + z.g + '" fill="' + c + '" stroke="' + c + '" points="' + d + '"/>');
        });
        lay.heads.forEach(function (h) {  /* 喷射范围 */
          out.push('<circle class="t-sp-circle" data-g="' + h.g + '" cx="' + h.x.toFixed(1) + '" cy="' + (flip - h.y).toFixed(1) + '" r="' + lay.range_m.toFixed(1) + '"/>');
        });
        lay.laterals.forEach(function (l) {  /* 支管（沿行） */
          out.push('<polyline class="t-sp-lateral" points="' + l.pts.map(function (pt) { return pt.x.toFixed(1) + ',' + (flip - pt.y).toFixed(1); }).join(' ') + '"/>');
        });
        lay.dividers.forEach(function (d) {  /* 轮灌组分区线（虚线） */
          out.push('<polyline class="t-sp-divider" points="' + d.pts.map(function (pt) { return pt.x.toFixed(1) + ',' + (flip - pt.y).toFixed(1); }).join(' ') + '"/>');
        });
        out.push('<polyline class="t-sp-main" points="' + lay.mainline.pts.map(function (pt) { return pt.x.toFixed(1) + ',' + (flip - pt.y).toFixed(1); }).join(' ') + '"/>');  /* 干管 */
        lay.heads.forEach(function (h, i) {  /* 喷头：颜色 = 轮灌组 */
          out.push('<circle class="t-sp-head" data-g="' + h.g + '" fill="' + SP_COLORS[(h.g - 1) % SP_COLORS.length] +
            '" cx="' + h.x.toFixed(1) + '" cy="' + (flip - h.y).toFixed(1) + '" r="' + (vh * 0.005).toFixed(2) +
            '"><title>' + esc('第 ' + h.g + ' 轮灌组 · 喷头 ' + (i + 1) + ' · R=' + lay.range_m + 'm') + '</title></circle>');
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

  /* ---------------- 山地喷灌设计 · 参数区（v287） ----------------
     表单持久化独立 key；「估算」与地块汇总面积联动；
     输入变更后若已有结果则自动重算。 */

  var SP_KEY = 'runye_terrain_sprinkler_v1';
  var SP_COLORS = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#be185d', '#4d7c0f']; /* 轮灌组着色 */
  var SP_DEFAULTS = { crop: '', etc: 4.5, eta: 0.7, soil: 'loam', slope: 8,
                      range: 15, flow: 2.5, pressure: 300, layout: 'tri', k: 1.1, heads: 12 };
  var spCalculated = false;

  function spRead() {
    return {
      crop: ($('spCrop').value || '').trim(),
      etc: parseFloat($('spEtc').value), eta: parseFloat($('spEta').value),
      soil: $('spSoil').value, slope: parseFloat($('spSlope').value),
      range_m: parseFloat($('spRange').value), flow_m3h: parseFloat($('spFlow').value),
      pressure_kpa: parseFloat($('spPressure').value), layout: $('spLayout').value,
      spacing_k: parseFloat($('spK').value), heads_per_shift: parseInt($('spHeads').value, 10)
    };
  }
  function spFill(v) {
    $('spCrop').value = v.crop || '';
    $('spEtc').value = v.etc; $('spEta').value = v.eta; $('spSoil').value = v.soil;
    $('spSlope').value = v.slope; $('spRange').value = v.range_m; $('spFlow').value = v.flow_m3h;
    $('spPressure').value = v.pressure_kpa; $('spLayout').value = v.layout;
    $('spK').value = v.spacing_k; $('spHeads').value = v.heads_per_shift;
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
      spCalculated = false;
      return;
    }
    spCalculated = true;
    var rows = [
      '喷头间距 <b>' + res.spacing.toFixed(1) + ' m</b> × 行距 ' + res.rowSpacing.toFixed(1) + ' m（' + (res.layout === 'tri' ? '正三角形' : '正方形') + '）',
      '单喷头控制面积 <b>' + Math.round(res.headArea) + ' ㎡</b>',
      '总灌溉面积 <b>' + fmtArea(area) + '</b> → 需喷头约 <b>' + res.headCount + '</b> 个',
      '轮灌组数 <b>' + res.shiftCount + '</b> 组（每组 ' + res.headsPerShift + ' 个同时工作）',
      '系统流量 <b>' + res.systemFlow.toFixed(1) + ' m³/h</b>',
      '组合喷灌强度 <b>' + res.precipRate.toFixed(1) + ' mm/h</b>（' + D.soilLabel(res.soil) + '允许 ' + res.precipAllow + '）' + (res.precipOk ? ' ✓' : ' ✗')
    ];
    if (res.dailyHours != null) rows.push('满足日耗水 ' + input.etc + ' mm/d 需日喷洒约 <b>' + res.dailyHours.toFixed(1) + ' 小时</b>（η=' + input.eta + '）');
    box.innerHTML = rows.join('<br>');
    box.hidden = false;
    warnBox.hidden = res.warn.length === 0;
    warnBox.className = 't-spwarn';
    warnBox.innerHTML = res.warn.map(esc).join('<br>');
  }

  /* 轮灌演示（v290）：分组依次点亮——当前组满亮、其余压暗；再点停止并清空高亮 */
  var spDemoTimer = null, spDemoStep = 0;
  function applySpDemo() {
    var svg = $('tCanvas');
    svg.querySelectorAll('[data-g]').forEach(function (el) {
      var on = +el.getAttribute('data-g') === spDemoStep;
      el.classList.toggle('t-sp-active', on);
      el.classList.toggle('t-sp-dim', !on);
    });
  }
  function stopSpDemo() {
    if (spDemoTimer) { clearInterval(spDemoTimer); spDemoTimer = null; }
    var btn = $('spDemo'); if (btn) btn.textContent = '\u25B6 \u8f6e\u704c\u6f14\u793a';
    $('tCanvas').querySelectorAll('.t-sp-active, .t-sp-dim').forEach(function (el) {
      el.classList.remove('t-sp-active'); el.classList.remove('t-sp-dim');
    });
  }
  function spDemoTick() {
    var total = $('tCanvas').querySelectorAll('.t-sp-zone').length;
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
      mainTxt = '干管 Φ' + lay.mainDN.dn + '（' + lay.mainFlow.toFixed(1) + ' m³/h）';
      latTxt = '支管 Φ' + lay.latDN.dn + '（' + lay.latFlow.toFixed(1) + ' m³/h）';
    }
    lg.innerHTML =
      '<span class="tl-item"><span class="tl-swatch tl-plot"></span>地块边界</span>' +
      '<span class="tl-item"><span class="tl-swatch tl-main"></span>' + mainTxt + '</span>' +
      '<span class="tl-item"><span class="tl-swatch tl-lat"></span>' + latTxt + '</span>' +
      '<span class="tl-item"><span class="tl-swatch tl-div"></span>轮灌组分区线</span>' +
      '<span class="tl-item"><span class="tl-swatch tl-range"></span>喷射范围（半径 R）</span>' +
      '<span class="tl-item">喷头颜色 = 轮灌组' + dots + '<em>（第 9 组起颜色循环）</em></span>';
  }

  function bindSprinkler() {
    try {
      var saved = JSON.parse(localStorage.getItem(SP_KEY) || 'null');
      if (saved && typeof saved === 'object') spFill(Object.assign({}, SP_DEFAULTS, saved));
    } catch (e) { /* 损坏用默认 */ }
    $('spCalc').addEventListener('click', calcSprinkler);
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
    ['spCrop', 'spEtc', 'spEta', 'spSoil', 'spSlope', 'spRange', 'spFlow', 'spPressure', 'spLayout', 'spK', 'spHeads']
      .forEach(function (id) { $(id).addEventListener('change', function () { if (spCalculated) calcSprinkler(); }); });
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
            poly: poly,
            level: null, source: '在线地图',
            _mapSqm: isFinite(r.sqm) ? r.sqm : null
          });
          added++;
        }
      });
      if (added || updated) {
        setUnit('mu'); /* 回传导入成功：面积显示默认切为亩（内部恒为平方米） */
        persistAndRender();
        banner('warn',
          '✓ 在线地图回传已导入 <b>' + added + '</b> 个地块（WGS-84 经纬度已按局部米制投影，面积已按<b>亩</b>显示）。' +
          (updated ? '另有 <b>' + updated + '</b> 个同名地块已<b>原地更新</b>（未重复导入）。' : '') +
          '注意：<b>非 CGCS2000 平面坐标</b>——工程放样/水力计算前请以 CGCS2000 成果文件导入为准。' +
          (bad ? '另有 ' + bad + ' 个无效环已跳过。' : ''));
      }
    } catch (e) { /* 契约损坏：清除防卡死 */ try { localStorage.removeItem('runye_terrain_incoming'); } catch (e2) {} }
  }

  document.addEventListener('DOMContentLoaded', function () {
    bind();
    initGrip();
    bindSprinkler();
    setUnit(areaUnit); /* 同步单位按钮初始态（含持久化偏好恢复） */
    persistAndRender();
    consumeIncoming(); /* 必须在 persistAndRender 之后：用自己的导入提示条收尾 */
  });

  /* 供测试/自动化探针使用 */
  window.RyTerrainUI = { state: state, sendHome: sendHome, setUnit: setUnit, setMode: setMode };
})();
