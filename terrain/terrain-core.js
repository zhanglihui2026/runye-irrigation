/* ============================================================
   terrain-core.js — 润野灌溉 地形模块 · 纯逻辑层（阶段1 基础框架）
   ------------------------------------------------------------
   [NEW MODULE: 地形模块] 解耦架构：本文件不含任何 DOM 操作，
   浏览器（window.RyTerrainData）与 Node（module.exports）均可加载，
   便于纯函数冒烟测试与注入体检。

   阶段1 范围（2026-10-07 用户需求）：
     · 地块边界导入：shp 矢量 / RTK 边界 CSV（仅 X,Y 平面坐标）
     · 坐标系识别：CGCS2000 校验（.prj 精确识别 + 无 prj 时数值启发式）
     · 水平投影面积（鞋带公式，底层统一平方米）
     · 高程数据源统一接口层：只做文件上传/解析/标记类型，
       统一输出结构 { data_type, point_list, raster_info,
       boundary_constraint, confidence }
     · 多子多边形（梯田分层预留：每级台面独立子多边形 + 汇总）
     · sampleAlongPath 沿管线轨迹采样高程 —— 接口桩（阶段2实现）

   明确不做（用户禁止开发范围）：
     航飞控制 / 像控点 / 点云过滤 / DTM 生成 / RTK 驱动 /
     现场采集 / 在线 DEM 下载。高程、边界成果全部由外部第三方
     设备/测绘软件提前产出，本模块仅负责导入与解析。

   行为约定：
     · 单位底层一律平方米；亩仅 UI 层换算（1 亩 = 666.67 ㎡）。
     · 经纬度坐标（度）不做面积计算——度²换亩无意义，必须告警。
     · DSM（数字表面模型，含树冠/建筑）只能预览，禁止参与工程
       水力计算，识别到即标记 confidence:'low' + previewOnly。
   ============================================================ */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.RyTerrainData = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MU_SQM = 666.67;           /* 1 亩 = 666.67 ㎡（与主页 atFormatArea 一致） */
  var STORAGE_KEY = 'runye_terrain_module_v1';

  /* ---------------- 基础工具 ---------------- */

  function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }

  /* 鞋带公式：平面坐标（米）→ 有符号面积，取绝对值。
     poly: [{x,y},...] 顶点按边界顺序（顺/逆时针均可）。 */
  function polygonAreaM2(poly) {
    if (!Array.isArray(poly) || poly.length < 3) return 0;
    var s = 0, n = poly.length;
    for (var i = 0; i < n; i++) {
      var a = poly[i], b = poly[(i + 1) % n];
      if (!isNum(a.x) || !isNum(a.y) || !isNum(b.x) || !isNum(b.y)) return 0;
      s += a.x * b.y - b.x * a.y;
    }
    return Math.abs(s) / 2;
  }

  function sqmToMu(sqm) {
    return isNum(sqm) ? Math.round(sqm / MU_SQM * 100) / 100 : 0;
  }

  /* 多子多边形汇总：每级台面独立子多边形（level 字段为梯田预留位，
     null = 未分层），汇总总面积 = 各子多边形面积之和。 */
  function plotsTotalAreaM2(plots) {
    if (!Array.isArray(plots)) return 0;
    var t = 0;
    plots.forEach(function (p) { t += polygonAreaM2(p && p.poly); });
    return t;
  }

  /* ---------------- 坐标系识别（CGCS2000 校验） ----------------
     策略（用户已确认）：.prj 文本精确识别 + 无 prj 时数值启发式。
     返回 { cs, label, confidence, warn }，
       cs: 'CGCS2000' | 'WGS84' | 'unknown-plane' | 'lonlat' | 'unknown'
       confidence: 'high' | 'medium' | 'low'                            */

  function parsePRJ(prjText) {
    var t = String(prjText || '');
    var low = t.toLowerCase();
    if (!t.trim()) return { cs: 'unknown', label: '未提供 .prj', confidence: 'none', warn: '缺少 .prj 文件，坐标系未知' };
    if (/cgcs2000|china_geodetic_coordinate_system_2000|epsg["'\s:=]+4490|4490[,)]/.test(low))
      return { cs: 'CGCS2000', label: 'CGCS2000（2000国家大地坐标系）', confidence: 'high', warn: '' };
    if (/wgs\s*1984|wgs_1984|epsg["'\s:=]+4326|4326[,)]/.test(low))
      return { cs: 'WGS84', label: 'WGS-84 经纬度', confidence: 'high', warn: 'WGS-84 经纬度坐标：请先由测绘软件投影为 CGCS2000 平面坐标（米）再导入，否则面积/水力计算无效' };
    if (/xian_1980|epsg["'\s:=]+4610/.test(low))
      return { cs: 'unknown-plane', label: '西安-1980（非 CGCS2000）', confidence: 'high', warn: '检测到西安-1980 坐标系：与 CGCS2000 存在系统性偏移（约 dm 级），工程放样前请统一转换' };
    if (/beijing_1954|epsg["'\s:=]+4214/.test(low))
      return { cs: 'unknown-plane', label: '北京-1954（非 CGCS2000）', confidence: 'high', warn: '检测到北京-1954 坐标系：与 CGCS2000 存在系统性偏移，工程放样前请统一转换' };
    return { cs: 'unknown', label: '未识别的坐标系', confidence: 'low', warn: '.prj 内容未识别为 CGCS2000，请人工核实后确认' };
  }

  /* 数值启发式：无 prj 时按样本坐标范围猜。
     高斯-克吕格 CGCS2000 平面坐标（米）：x(东) 常见 1e5~1e7，
     y(北) 2e6~5e6；经纬度：x∈[-180,180], y∈[-90,90]。 */
  function heuristicCS(sample) {
    var xs = [], ys = [];
    (sample || []).forEach(function (p) {
      if (p && isNum(p.x) && isNum(p.y)) { xs.push(Math.abs(p.x)); ys.push(Math.abs(p.y)); }
    });
    if (!xs.length) return { cs: 'unknown', label: '无有效坐标样本', confidence: 'low', warn: '无坐标样本，无法判断坐标系' };
    var mx = Math.max.apply(null, xs), my = Math.max.apply(null, ys);
    if (mx <= 180 && my <= 90)
      return { cs: 'lonlat', label: '疑似经纬度（度）', confidence: 'medium', warn: '坐标为经纬度（度）：面积计算将被锁定，请由测绘软件投影为 CGCS2000 平面坐标（米）' };
    if (mx > 180 && my > 1e5)
      return { cs: 'unknown-plane', label: '疑似 CGCS2000 高斯投影平面坐标（米）', confidence: 'medium', warn: '按 CGCS2000 平面坐标（米）处理。请核实：若为其他投影坐标系，面积与水力结果会存在偏差' };
    return { cs: 'unknown', label: '坐标范围异常', confidence: 'low', warn: '坐标数值范围不符合常见平面/经纬度格式，请人工核实' };
  }

  /* 统一入口：prjText 可为 null；sample 为已解析坐标样本。
     prj 结论优先，无 prj 才启发式。 */
  function detectCoordSystem(prjText, sample) {
    if (prjText != null && String(prjText).trim()) return parsePRJ(prjText);
    return heuristicCS(sample);
  }

  /* ---------------- shp 解析（最小实现，零依赖） ----------------
     仅支持 Polygon(5) / PolygonZ(15) 主文件（.shp）。
     一个 feature 的多环：取 |面积| 最大的环作为该地块外环，
     其余环（洞/附加环）数量记入 meta.ringsDropped（阶段2处理洞）。 */

  function parseSHP(input) {
    /* 兼容 ArrayBuffer 与 TypedArray 视图（Node Buffer / 测试便利） */
    var ab = input instanceof ArrayBuffer ? input
      : (input && input.buffer && ArrayBuffer.isView(input)
        ? input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength)
        : null);
    if (!ab) return { ok: false, error: '无效输入（需要 ArrayBuffer 或 TypedArray）' };
    var dv = new DataView(ab);
    if (ab.byteLength < 100) return { ok: false, error: '文件过短，不是有效的 .shp' };
    if (dv.getInt32(0, false) !== 9994) return { ok: false, error: '文件头魔数不符（非 Shapefile 主文件）' };
    var shapeType = dv.getInt32(32, true);
    if (shapeType !== 5 && shapeType !== 15)
      return { ok: false, error: '暂只支持面要素（Polygon=5 / PolygonZ=15），当前 type=' + shapeType + '。边界 shp 请先在测绘软件中导出为面要素' };
    var off = 100, features = [];
    while (off + 8 <= ab.byteLength) {
      var contentLen = dv.getInt32(off + 4, false) * 2; /* 16字节单位 → 字节 */
      if (contentLen <= 0) break;
      var rec = off + 8;
      if (rec + 4 > ab.byteLength) break;
      var t = dv.getInt32(rec, true);
      if (t === 5 || t === 15) {
        var p = rec + 4;
        /* box: 4 doubles */
        p += 32;
        var numParts = dv.getInt32(p, true); p += 4;
        var numPoints = dv.getInt32(p, true); p += 4;
        if (numParts < 1 || numPoints < 3 || numParts > 1024 || numPoints > 1e6)
          return { ok: false, error: '要素结构异常（parts=' + numParts + ' points=' + numPoints + '）' };
        var parts = [];
        for (var i = 0; i < numParts; i++) { parts.push(dv.getInt32(p, true)); p += 4; }
        var pts = [];
        for (var j = 0; j < numPoints; j++) {
          pts.push({ x: dv.getFloat64(p, true), y: dv.getFloat64(p + 8, true) });
          p += 16;
        }
        /* PolygonZ 的 Z 数组：读出但仅存于首点（边界 Z 属 boundary_constraint 预留信息） */
        var zOfFirst = null;
        if (t === 15) {
          var zBase = p + 16; /* 跳过 Z 范围 box */
          if (zBase + numPoints * 8 <= ab.byteLength) {
            zOfFirst = dv.getFloat64(zBase, true);
          }
        }
        /* 按环拆分 */
        var rings = [];
        for (var r = 0; r < parts.length; r++) {
          var s = parts[r], e = (r + 1 < parts.length) ? parts[r + 1] : numPoints;
          var ring = pts.slice(s, e);
          if (ring.length >= 3) rings.push(ring);
        }
        if (!rings.length) { off = rec + contentLen; continue; }
        /* 外环 = |面积| 最大者 */
        var outer = rings[0], outerA = -1;
        rings.forEach(function (rg) {
          var a = polygonAreaM2(rg);
          if (a > outerA) { outerA = a; outer = rg; }
        });
        features.push({
          poly: outer,
          areaM2: outerA,
          ringsDropped: rings.length - 1,
          bbox: bboxOf(outer),
          zHint: zOfFirst
        });
      }
      off = rec + contentLen;
    }
    if (!features.length) return { ok: false, error: '未解析出面要素（要素数 0）' };
    return { ok: true, features: features, shapeType: shapeType };
  }

  function bboxOf(poly) {
    var b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    poly.forEach(function (pt) {
      if (pt.x < b.minX) b.minX = pt.x; if (pt.y < b.minY) b.minY = pt.y;
      if (pt.x > b.maxX) b.maxX = pt.x; if (pt.y > b.maxY) b.maxY = pt.y;
    });
    return b;
  }

  /* ---------------- CSV 解析（RTK 边界 / RTK 高程点共用） ----------------
     自动识别：分隔符（, ; \t）、表头行（首行含字母字段则跳过）、
     取前两个数值列为 x,y（平面坐标）；第三数值列存在 → z。
     返回 { ok, points:[{x,y,z?}], hasZ, skippedRows }               */

  function parseCSV(text, opts) {
    opts = opts || {};
    var lines = String(text || '').split(/\r\n|\r|\n/);
    var delim = opts.delim;
    if (!delim) {
      /* 取首个非空行数列数最多的分隔符 */
      var probe = '';
      for (var i = 0; i < lines.length && i < 20; i++) if (lines[i].trim()) { probe = lines[i]; break; }
      var cand = [',', ';', '\t'], best = ',', bestN = 0;
      cand.forEach(function (c) { var n = probe.split(c).length - 1; if (n > bestN) { bestN = n; best = c; } });
      delim = best;
    }
    var points = [], skipped = 0, headerSkipped = false;
    lines.forEach(function (ln) {
      if (!ln.trim()) return;
      var cells = ln.split(delim).map(function (s) { return s.trim(); });
      var nums = cells.map(parseFloat).filter(isNum);
      if (nums.length < 2) { skipped++; return; }
      /* 表头：该行非数字单元占比高 → 跳过 */
      if (!headerSkipped && nums.length < cells.length * 0.6) { headerSkipped = true; skipped++; return; }
      var p = { x: nums[0], y: nums[1] };
      if (nums.length >= 3) p.z = nums[2];
      points.push(p);
    });
    if (points.length < (opts.minPoints || 3))
      return { ok: false, error: '有效坐标行不足（解析到 ' + points.length + ' 行，至少 ' + (opts.minPoints || 3) + ' 行）。请确认文件为「X,Y」或「X,Y,Z」格式、分隔符为逗号/分号/Tab' };
    var hasZ = points.every(function (p) { return 'z' in p; }) && points.length > 0;
    return { ok: true, points: points, hasZ: hasZ, skippedRows: skipped };
  }

  /* ---------------- 高程数据源统一接口层 ----------------
     三入口：rtk_xyz（RTK CSV X,Y,Z）/ dtm_raster（无人机 DTM tif+shp）/
     dsm_raster（第三方 DSM，仅预览）。统一输出结构（用户契约）：
     { data_type, point_list:[{x,y,z}], raster_info, boundary_constraint, confidence } */

  var ELEV_TYPES = {
    rtk_xyz:    { label: 'RTK 高程点（CSV X,Y,Z）', previewOnly: false, accepts: ['.csv', '.txt'] },
    dtm_raster: { label: '无人机 DTM（tif + shp 边界）', previewOnly: false, accepts: ['.tif', '.tiff'] },
    dsm_raster: { label: '第三方 DSM（仅预览）', previewOnly: true, accepts: ['.tif', '.tiff'] }
  };

  /* 按扩展名 + 文件名关键词分类。返回 { data_type, previewOnly, ok, error } */
  function classifyElevFile(name) {
    var n = String(name || '').toLowerCase();
    var ext = (n.match(/\.[a-z0-9]+$/) || [''])[0];
    if (ext === '.csv' || ext === '.txt')
      return { ok: true, data_type: 'rtk_xyz', previewOnly: false };
    if (ext === '.tif' || ext === '.tiff') {
      /* 关键词启发式：文件名含 dsm/surface → DSM（含树冠建筑，仅预览）；
         含 dtm/DEM/dem → DTM；两者都没有 → 待用户在 UI 下拉里人工指定 */
      if (/dsm|surface/.test(n)) return { ok: true, data_type: 'dsm_raster', previewOnly: true };
      if (/dtm|\bdem\b/.test(n)) return { ok: true, data_type: 'dtm_raster', previewOnly: false };
      return { ok: true, data_type: 'dtm_raster', previewOnly: false, needConfirm: true,
               note: '文件名未标明 DTM/DSM，已暂按 DTM 处理——请人工确认这是数字地形模型（地表）而非数字表面模型（含树冠/建筑）' };
    }
    return { ok: false, error: '不支持的高程文件类型「' + ext + '」。阶段1 支持：CSV/TXT（RTK 点）与 TIF/TIFF（DTM/DSM 栅格）' };
  }

  /* 组装统一输出记录（严格按用户契约字段）。
     tif 原文件阶段1不持久化（localStorage 容量限制），仅记录元信息。 */
  function buildElevRecord(input) {
    var t = ELEV_TYPES[input.data_type];
    if (!t) return { ok: false, error: '未知高程类型 ' + input.data_type };
    var conf = 'medium';
    if (input.data_type === 'rtk_xyz') conf = (input.point_list && input.point_list.length >= 20) ? 'high' : 'medium';
    if (t.previewOnly) conf = 'low';
    return {
      ok: true,
      record: {
        data_type: input.data_type,
        point_list: input.point_list || [],
        raster_info: input.raster_info || null,
        boundary_constraint: input.boundary_constraint || null,
        confidence: conf,
        meta: {
          file_name: input.file_name || '',
          file_size: input.file_size || 0,
          preview_only: t.previewOnly,
          registered_at: Date.now()
        }
      }
    };
  }

  /* 沿管线轨迹采样高程 —— 阶段1 接口桩（阶段2接入高程插值引擎）。
     path: [{x,y},...] 管线折点；step: 采样步长（米）。
     无高程数据时按契约返回 null，调用方据此走「水力计算锁定/提示」降级路径。 */
  function sampleAlongPath(path, step) {
    return null; /* 阶段1：恒 null（无高程 → 降级提示），阶段2实现插值 */
  }

  /* ---------------- 存储层 ----------------
    地块 plots + 高程记录 elevations 持久化到 localStorage。
     rtk 点云超 MAX_PERSIST_POINTS 时抽样保存（保首尾），并在 meta 标记 thinned。 */

  var MAX_PERSIST_POINTS = 5000;

  function loadState() {
    try {
      var s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (s && typeof s === 'object') {
        return {
          plots: Array.isArray(s.plots) ? s.plots : [],
          elevations: Array.isArray(s.elevations) ? s.elevations : [],
          mode: s.mode === 'engineering' ? 'engineering' : 'preview',
          _unit: s._unit === 'mu' ? 'mu' : 'sqm'
        };
      }
    } catch (e) { /* 损坏则重置 */ }
    return { plots: [], elevations: [], mode: 'preview' };
  }

  function saveState(state) {
    try {
      var out = {
        plots: (state.plots || []).slice(0, 200),
        elevations: (state.elevations || []).map(function (r) {
          if (!r || !Array.isArray(r.point_list) || r.point_list.length <= MAX_PERSIST_POINTS) return r;
          var step = Math.ceil(r.point_list.length / MAX_PERSIST_POINTS);
          var thinned = r.point_list.filter(function (p, i) { return i % step === 0 || i === r.point_list.length - 1; });
          return Object.assign({}, r, { point_list: thinned, meta: Object.assign({}, r.meta, { thinned: true, thinned_from: r.point_list.length }) });
        }),
        mode: state.mode || 'preview',
        _unit: state._unit === 'mu' ? 'mu' : 'sqm'  /* 单位偏好随状态持久化（不可白名单遗漏） */
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(out));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e && e.message || String(e) };
    }
  }

  /* ---------------- 导出 ---------------- */

  return {
    version: '1.0.0-stage1',
    MU_SQM: MU_SQM,
    ELEV_TYPES: ELEV_TYPES,
    polygonAreaM2: polygonAreaM2,
    sqmToMu: sqmToMu,
    plotsTotalAreaM2: plotsTotalAreaM2,
    parsePRJ: parsePRJ,
    heuristicCS: heuristicCS,
    detectCoordSystem: detectCoordSystem,
    parseSHP: parseSHP,
    parseCSV: parseCSV,
    classifyElevFile: classifyElevFile,
    buildElevRecord: buildElevRecord,
    sampleAlongPath: sampleAlongPath,
    loadState: loadState,
    saveState: saveState
  };
});
