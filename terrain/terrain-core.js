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

  /* ---------------- 环预处理 sanitizeRing（v298 P0-2，纯函数） ----------------
     导入环的三道防线：①去相邻重复点（含首尾闭合重复）；②自交检测并告警（标记不静默）；
     ③可选离群点过滤（opts.outlierK：点到质心距离 > 中位数×K 才剔除，默认不启用）。
     只清洗与告警，不改形状（除重复点/离群点），面积交给 polygonAreaM2。 */

  function segProperX(a, b, c, d) {
    function o(px, py, qx, qy, rx, ry) {
      var v = (qx - px) * (ry - qy) - (qy - py) * (rx - qx);
      return v > 1e-9 ? 1 : (v < -1e-9 ? -1 : 0);
    }
    var o1 = o(a.x, a.y, b.x, b.y, c.x, c.y), o2 = o(a.x, a.y, b.x, b.y, d.x, d.y);
    var o3 = o(c.x, c.y, d.x, d.y, a.x, a.y), o4 = o(c.x, c.y, d.x, d.y, b.x, b.y);
    return (o1 !== o2 && o3 !== o4);
  }

  function sanitizeRing(poly, opts) {
    opts = opts || {};
    var warn = [];
    if (!Array.isArray(poly) || poly.length < 3) return { ok: false, error: '环点数不足 3' };
    var pts = poly.map(function (p) { return { x: +p.x, y: +p.y }; });
    for (var vi = 0; vi < pts.length; vi++) {
      if (!isNum(pts[vi].x) || !isNum(pts[vi].y)) return { ok: false, error: '第 ' + (vi + 1) + ' 点坐标非数值' };
    }
    /* ① 相邻重复点（含首尾闭合重复） */
    var ded = [pts[0]];
    for (var i = 1; i < pts.length; i++) {
      var last = ded[ded.length - 1];
      if (Math.abs(pts[i].x - last.x) > 1e-9 || Math.abs(pts[i].y - last.y) > 1e-9) ded.push(pts[i]);
    }
    if (ded.length > 1 && Math.abs(ded[0].x - ded[ded.length - 1].x) < 1e-9 && Math.abs(ded[0].y - ded[ded.length - 1].y) < 1e-9) ded.pop();
    var removedDups = pts.length - ded.length;
    if (removedDups > 0) warn.push('已去重 ' + removedDups + ' 个相邻/闭合重复点');
    pts = ded;
    if (pts.length < 3) return { ok: false, error: '去重后有效点数不足 3（输入环退化）' };

    /* ③ 可选离群点过滤：先启用再检自交，保证检测对象是清洗后的环 */
    var removedOutliers = 0;
    if (opts.outlierK > 0) {
      var cx = 0, cy = 0;
      pts.forEach(function (pt) { cx += pt.x; cy += pt.y; });
      cx /= pts.length; cy /= pts.length;
      var ds = pts.map(function (pt) { return Math.hypot(pt.x - cx, pt.y - cy); });
      var sorted = ds.slice().sort(function (a, b) { return a - b; });
      var med = sorted[Math.floor(sorted.length / 2)];
      if (med > 0) {
        var keep = [];
        pts.forEach(function (pt, idx) {
          if (ds[idx] > med * opts.outlierK) { removedOutliers++; warn.push('已过滤离群点 1 个（距质心 ' + ds[idx].toFixed(1) + 'm > 中位数×' + opts.outlierK + '）'); }
          else keep.push(pt);
        });
        if (removedOutliers && keep.length >= 3) pts = keep;
        else if (removedOutliers) warn.push('离群点过滤后点数不足，已放弃过滤');
      }
    }

    /* ② 自交检测（O(n²) 跨立检验，排除相邻边；>5000 点跳过防卡顿） */
    var selfInt = 0, n = pts.length;
    if (n <= 5000) {
      for (i = 0; i < n; i++) {
        for (var j = i + 2; j < n; j++) {
          if (i === 0 && j === n - 1) continue; /* 首尾边相邻 */
          if (segProperX(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) selfInt++;
        }
      }
      if (selfInt > 0) warn.push('检测到边界自交 ' + selfInt + ' 处（如「8」字形）：面积与喷灌布置可能失真，请检查/修正边界数据');
    } else {
      warn.push('环点数 ' + n + ' 过多，跳过自交检测');
    }

    return { ok: true, pts: pts, warn: warn, removedDups: removedDups, removedOutliers: removedOutliers, selfInt: selfInt };
  }

  /* ---------------- 地表斜面面积近似（v298 P1-5，纯函数） ----------------
     用 RTK 点云最小二乘拟合平面 z = a·x + b·y + c，平均坡度 = atan(√(a²+b²))，
     表面积 ≈ 水平投影面积 / cos(平均坡度)。规划级近似——精细 TIN 积分属阶段2。 */

  function surfaceAreaApprox(horizSqm, rtkPoints) {
    var pts = (Array.isArray(rtkPoints) ? rtkPoints : []).filter(function (p) {
      return isNum(p && p.x) && isNum(p.y) && isNum(p.z);
    });
    if (pts.length < 3) return { ok: false, error: 'RTK 高程点不足 3 个' };
    var horiz = horizSqm;
    if (!(horiz > 0)) return { ok: false, error: '水平投影面积无效（请先导入地块）' };
    /* 均值中心化后拟合 w = a·u + b·v（u=x−x̄, v=y−ȳ, w=z−z̄；截距 c 不影响坡度）。
       必须中心化：CGCS2000 原始坐标 ~1e6 m，未中心化正规方程行列式因灾难性
       相消退化为 ~1e11，而相对阈值 ~1e18，真实数据恒被误判「退化」（v298 探针实测）。 */
    var mx = 0, my = 0, mz = 0, n = pts.length;
    pts.forEach(function (p) { mx += p.x; my += p.y; mz += p.z; });
    mx /= n; my /= n; mz /= n;
    var Suu = 0, Svv = 0, Suv = 0, Suw = 0, Svw = 0;
    pts.forEach(function (p) {
      var u = p.x - mx, v = p.y - my, w = p.z - mz;
      Suu += u * u; Svv += v * v; Suv += u * v; Suw += u * w; Svw += v * w;
    });
    var D = Suu * Svv - Suv * Suv;
    if (D < 1e-9 * Math.max(1e-12, Suu * Svv)) return { ok: false, error: 'RTK 点平面分布退化（共线/过少），无法拟合坡面' };
    var a = (Suw * Svv - Svw * Suv) / D;
    var b = (Svw * Suu - Suw * Suv) / D;
    var slope = Math.atan(Math.hypot(a, b));
    var surf = horiz / Math.cos(slope);
    return { ok: true, surfSqm: surf, slopeDeg: slope * 180 / Math.PI, n: n, horizSqm: horiz };
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
      var probe = '';
      for (var i = 0; i < lines.length && i < 20; i++) if (lines[i].trim()) { probe = lines[i]; break; }
      var cand = [',', ';', '\t'], best = ',', bestN = 0;
      cand.forEach(function (c) { var n = probe.split(c).length - 1; if (n > bestN) { bestN = n; best = c; } });
      delim = best;
    }
    var points = [], skipped = 0, missingZRows = 0;
    lines.forEach(function (ln) {
      if (!ln.trim()) return;
      var cells = ln.split(delim).map(function (s) { return s.trim(); });
      /* 高程 CSV 的列位必须稳定：旧逻辑会 filter 掉空 Z，再把后续数字列错当 Z。 */
      var x = parseFloat(cells[0]), y = parseFloat(cells[1]);
      if (!isNum(x) || !isNum(y)) { skipped++; return; }
      var p = { x: x, y: y };
      if (cells.length >= 3) {
        var z = parseFloat(cells[2]);
        if (isNum(z)) p.z = z;
        else missingZRows++;
      }
      points.push(p);
    });
    if (points.length < (opts.minPoints || 3))
      return { ok: false, error: '有效坐标行不足（解析到 ' + points.length + ' 行，至少 ' + (opts.minPoints || 3) + ' 行）。请确认文件为「X,Y」或「X,Y,Z」格式、分隔符为逗号/分号/Tab' };
    var zCount = points.filter(function (p) { return isNum(p.z); }).length;
    /* RTK 手簿偶有空值：允许少量缺失，但不能把缺 Z 的文件伪装为可插值点云。 */
    var hasZ = zCount >= Math.max(3, Math.ceil(points.length * 0.95));
    return { ok: true, points: points, hasZ: hasZ, zCount: zCount, missingZRows: missingZRows, skippedRows: skipped };
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

  /* 保守剔除 RTK 明显飞点。全局高程差可能是真实山地，故只剔除同时超过
     6×MAD 且至少相差 15m 的孤立大偏差；结果必须由导入提示明确说明。 */
  function filterElevationOutliers(points) {
    var valid = (points || []).filter(function (p) { return isNum(p && p.x) && isNum(p.y) && isNum(p.z); });
    if (valid.length < 8) return { points: valid, removed: 0, threshold: null };
    var zs = valid.map(function (p) { return p.z; }).sort(function (a, b) { return a - b; });
    var median = zs[Math.floor(zs.length / 2)];
    var devs = zs.map(function (z) { return Math.abs(z - median); }).sort(function (a, b) { return a - b; });
    var mad = devs[Math.floor(devs.length / 2)];
    var threshold = Math.max(15, mad * 6);
    var kept = valid.filter(function (p) { return Math.abs(p.z - median) <= threshold; });
    return { points: kept, removed: valid.length - kept.length, threshold: threshold, median: median };
  }

  /* 组装统一输出记录（严格按用户契约字段）。
     tif 原文件阶段1不持久化（localStorage 容量限制），仅记录元信息。 */
  function buildElevRecord(input) {
    var t = ELEV_TYPES[input.data_type];
    if (!t) return { ok: false, error: '未知高程类型 ' + input.data_type };
    var conf = 'medium';
    if (input.data_type === 'rtk_xyz') {
      var n = (input.point_list || []).filter(function (p) { return isNum(p && p.x) && isNum(p.y) && isNum(p.z); }).length;
      var coverage = Number(input.coverage_area_m2) || 0;
      var density = coverage > 0 ? n / coverage : 0;
      /* 20 点无法代表起伏地形；高置信度同时要求足够点数和已知地块覆盖密度。 */
      conf = n >= 50 && coverage > 0 && density >= 0.001 ? 'high' : (n >= 10 ? 'medium' : 'low');
    }
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
          hydraulic_usable: input.data_type === 'rtk_xyz' && (input.point_list || []).length >= 3,
          coverage_area_m2: Number(input.coverage_area_m2) || 0,
          registered_at: Date.now()
        }
      }
    };
  }

  /* 沿管线轨迹采样高程：path 为 [{x,y},...] 管线折点，step 为采样步长（米）。
     优先 Delaunay 线性插值，凸包外或退化点云以 IDW 兜底；无有效高程才返回 null。 */
  function sampleAlongPath(path, step, elevPoints) {
    if (!Array.isArray(path) || path.length < 2) return null;
    if (!(step > 0)) return null;
    var pts = (Array.isArray(elevPoints) ? elevPoints : []).filter(function (p) {
      return isNum(p && p.x) && isNum(p.y) && isNum(p.z);
    });
    if (pts.length < 3) return null; /* 无有效高程数据 → 降级路径（保持契约） */

    /* 折线等步长采样点 */
    var segs = [], total = 0, i;
    for (i = 0; i < path.length - 1; i++) {
      var a = path[i], b = path[i + 1];
      if (!isNum(a && a.x) || !isNum(a && a.y) || !isNum(b && b.x) || !isNum(b && b.y)) return null;
      var L = Math.hypot(b.x - a.x, b.y - a.y);
      if (L > 1e-9) { segs.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, L: L }); total += L; }
    }
    if (!(total > 0)) return null;
    var nS = Math.max(2, Math.floor(total / step) + 1);
    var samples = [];
    for (var k = 0; k < nS; k++) {
      var dTarget = Math.min(total, k * step), acc = 0, px = path[0].x, py = path[0].y;
      for (i = 0; i < segs.length; i++) {
        if (dTarget <= acc + segs[i].L || i === segs.length - 1) {
          var t = segs[i].L > 0 ? Math.min(1, (dTarget - acc) / segs[i].L) : 0;
          px = segs[i].ax + (segs[i].bx - segs[i].ax) * t;
          py = segs[i].ay + (segs[i].by - segs[i].ay) * t;
          break;
        }
        acc += segs[i].L;
      }
      samples.push({ x: px, y: py });
    }

    /* Delaunay 三角网（Bowyer-Watson，点数上限 3000，超限/退化走 IDW） */
    var triIdx = delaunayTris(pts);

    function triZ(p) {
      for (var t = 0; t < triIdx.length; t++) {
        var A = pts[triIdx[t][0]], B = pts[triIdx[t][1]], C = pts[triIdx[t][2]];
        var den = (B.y - C.y) * (A.x - C.x) + (C.x - B.x) * (A.y - C.y);
        if (Math.abs(den) < 1e-12) continue;
        var w1 = ((B.y - C.y) * (p.x - C.x) + (C.x - B.x) * (p.y - C.y)) / den;
        var w2 = ((C.y - A.y) * (p.x - C.x) + (A.x - C.x) * (p.y - C.y)) / den;
        var w3 = 1 - w1 - w2;
        if (w1 >= -1e-9 && w2 >= -1e-9 && w3 >= -1e-9) return w1 * A.z + w2 * B.z + w3 * C.z;
      }
      return null; /* 凸包外 */
    }
    function idwZ(p) { /* k 近邻反距离加权（d=0 直接取该点 z） */
      var arr = pts.map(function (q) { return { d: Math.hypot(q.x - p.x, q.y - p.y), z: q.z }; })
                   .sort(function (a, b) { return a.d - b.d; }).slice(0, 6);
      if (arr[0].d < 1e-9) return arr[0].z;
      var ws = 0, vz = 0;
      arr.forEach(function (it) { var w = 1 / (it.d * it.d); ws += w; vz += w * it.z; });
      return vz / ws;
    }

    return samples.map(function (p) {
      var z = triZ(p);
      if (z === null) z = idwZ(p);
      return { x: p.x, y: p.y, z: z };
    });
  }

  /* Bowyer-Watson 增量 Delaunay（超三角形法）；共线/退化返回 []（调用方走 IDW） */
  function delaunayTris(pts) {
    var n = pts.length;
    if (n < 3) return [];
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    pts.forEach(function (p) {
      if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
    });
    var dmax = Math.max(maxX - minX, maxY - minY, 1) * 20;
    var mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
    var P = pts.concat([{ x: mx - dmax, y: my - dmax }, { x: mx, y: my + dmax }, { x: mx + dmax, y: my - dmax }]);
    function inCircum(t, px, py) {
      var a = P[t[0]], b = P[t[1]], c = P[t[2]];
      var ad = a.x * a.x + a.y * a.y, bd = b.x * b.x + b.y * b.y, cd = c.x * c.x + c.y * c.y;
      var D = (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
      if (Math.abs(D) < 1e-12) return false;
      var ux = ((ad * (b.y - c.y) + bd * (c.y - a.y) + cd * (a.y - b.y)) / D - px);
      var uy = ((ad * (c.x - b.x) + bd * (a.x - c.x) + cd * (b.x - a.x)) / D - py);
      return ux * ux + uy * uy < 1e-6; /* 含圆周（容差半径 1e-3 m） */
    }
    var tris = [[n, n + 1, n + 2]];
    for (var i = 0; i < n; i++) {
      var bad = [], good = [];
      tris.forEach(function (t) { (inCircum(t, P[i].x, P[i].y) ? bad : good).push(t); });
      var edges = [];
      bad.forEach(function (t) {
        for (var k = 0; k < 3; k++) {
          var e = [t[k], t[(k + 1) % 3]].sort(function (a, b) { return a - b; });
          var cnt = 0;
          bad.forEach(function (tt) {
            for (var k2 = 0; k2 < 3; k2++) {
              var e2 = [tt[k2], tt[(k2 + 1) % 3]].sort(function (a, b) { return a - b; });
              if (e2[0] === e[0] && e2[1] === e[1]) { cnt++; break; }
            }
          });
          if (cnt === 1) edges.push(e);
        }
      });
      tris = good;
      edges.forEach(function (e) { tris.push([e[0], e[1], i]); });
    }
    return tris.filter(function (t) { return t[0] < n && t[1] < n && t[2] < n; });
  }

  /* ---------------- 在线地图回传：经纬度 → 局部米制投影 ----------------
     接住「回传地形模块」的 WGS-84 经纬度环（{lat,lng} 或 [lat,lng]），
     以首点为原点做等距圆柱投影（米）：小地块范围内面积/形状误差可忽略。
     ★ 口径声明：结果不是 CGCS2000 平面坐标，仅用于地图回传成果的
     预览/面积参考；工程放样与水力计算仍应以 CGCS2000 成果文件导入为准。 */

  function lonlatToLocalMeters(ring) {
    if (!Array.isArray(ring) || ring.length < 3) return { ok: false, error: '环点数不足（<3）' };
    function latOf(p) { return Array.isArray(p) ? p[0] : p.lat; }
    function lngOf(p) { return Array.isArray(p) ? p[1] : (p.lng != null ? p.lng : p.lon); }
    var o = ring[0], lat0 = latOf(o) * Math.PI / 180;
    if (!isFinite(lat0)) return { ok: false, error: '首点坐标无效' };
    var R = 6378137, kx = Math.PI / 180 * R * Math.cos(lat0), ky = Math.PI / 180 * R;
    var out = [];
    for (var i = 0; i < ring.length; i++) {
      var la = latOf(ring[i]), ln = lngOf(ring[i]);
      if (!isFinite(la) || !isFinite(ln)) return { ok: false, error: '第' + (i + 1) + '点坐标非数值' };
      out.push({ x: (ln - lngOf(o)) * kx, y: (la - latOf(o)) * ky });
    }
    return { ok: true, points: out, origin: { lat: latOf(o), lng: lngOf(o) } };
  }

  /* ---------------- 山地喷灌设计 · 参数估算（纯函数） ----------------
     参数依据（2026-10-07 调研综合）：
     · GB/T 50085《喷灌工程技术规范》：灌溉水利用系数 η≈0.7（坡地定喷式）、
       允许喷灌强度按土壤（沙土20/沙壤15/壤土12/黏壤10/黏土8 mm/h，坡地取低档）
     · 坡地学术研究（雨鸟 LF1200/R5000 实测+弹道模型）：坡地喷头间距宜为
       平地射程 R 的 0.8~1.2 倍；三角形布置均匀度优于方形；工作压力影响最大
       （300kPa 附近）；坡度 >15°（约27%）需谨慎，>20% 建议低压补偿
     · IRRICAD / OpenCADIrrication / Qirri 的输入范式：地块+坡度、喷头
       (射程/流量/压力)、布置(三角形/方形)+间距系数、轮灌组(同时工作喷头数)、
       水源流量，输出喷头数/轮灌组/系统流量/组合强度校核(CU 阶段2)          */

  var SOIL_INTENSITY = { sand: 20, sandyloam: 15, loam: 12, clayloam: 10, clay: 8 };

  /* input: {range_m, flow_m3h, pressure_kpa, layout('tri'|'square'), spacing_k,
             heads_per_shift, soil, slope_deg, etc_mm, eta}
     areaM2: 汇总灌溉面积（来自地块清单）
     返回 { ok, warn[], spacing, rowSpacing, headArea, headCount,
            shiftCount, systemFlow, precipRate, precipOk }              */
  function sprinklerEstimate(input, areaM2) {
    input = input || {};
    var warn = [];
    var R = input.range_m, q = input.flow_m3h, k = input.spacing_k;
    var pressure = Number(input.pressure_kpa);
    if (!(R > 0) || !(q > 0) || !(pressure > 0)) return { ok: false, error: '喷头射程、流量和工作压力必须为正数' };
    if (!(areaM2 > 0)) return { ok: false, error: '请先在地块清单中导入或绘制地块' };
    if (!(k > 0.4) || k > 1.6) { k = Math.min(1.6, Math.max(0.5, k || 1.1)); warn.push('间距系数超出常规(0.4~1.6)，已夹回 ' + k); }

    var layout = input.layout === 'square' ? 'square' : 'tri';
    var S = R * k;                                   /* 喷头间距 */
    var row = layout === 'tri' ? S * Math.sqrt(3) / 2 /* 三角形行距 0.866S */
                              : S;                    /* 方形行距 = S */
    var headArea = layout === 'tri' ? S * row : S * S;

    var headCount = Math.ceil(areaM2 / headArea);
    var N = Math.max(1, Math.round(input.heads_per_shift || 12));
    if (N > headCount) N = headCount;
    var shiftCount = Math.ceil(headCount / N);
    var systemFlow = N * q;

    /* 水源能力只校核当前轮灌组的瞬时需求；主管管损/泵扬程仍交给主页完整水力引擎。 */
    var sourceFlow = Number(input.source_flow_m3h);
    var sourceFlowOk = null;
    if (sourceFlow > 0) {
      sourceFlowOk = sourceFlow + 1e-9 >= systemFlow;
      if (!sourceFlowOk) warn.push('当前轮灌组需水 ' + systemFlow.toFixed(1) + ' m³/h，超过水源可用流量 ' + sourceFlow.toFixed(1) + ' m³/h：请减少同时工作喷头数或增加轮灌组');
    }
    if (pressure < 150 || pressure > 500) warn.push('工作压力 ' + pressure.toFixed(0) + ' kPa 超出常见喷头 150–500 kPa 区间：请核对喷嘴厂家曲线');

    /* q 与 P 不能仅凭两个数判断对错。用户填入喷嘴铭牌额定 q/P 后，才按 q∝√P 作可追溯校核。 */
    var ratedFlow = Number(input.rated_flow_m3h), ratedPressure = Number(input.rated_pressure_kpa);
    var expectedFlow = null, nozzleOk = null;
    if (ratedFlow > 0 && ratedPressure > 0) {
      expectedFlow = ratedFlow * Math.sqrt(pressure / ratedPressure);
      nozzleOk = Math.abs(q - expectedFlow) / expectedFlow <= 0.10;
      if (!nozzleOk) warn.push('输入流量 ' + q.toFixed(2) + ' m³/h 与喷嘴额定曲线换算值 ' + expectedFlow.toFixed(2) + ' m³/h 相差超过 10%：请核对喷嘴型号、压力或流量单位');
    }

    /* 组合喷灌强度 ρ = 1000·q / headArea（单喷头实际控制面积=间距×行距，含重叠修正），
       与土壤允许值校核。v298 修正：旧分母用理论覆盖圆 πR²，三角形布置下喷洒圆重叠，
       组合强度被系统性低估 30~40%，黏土/坡地场景会漏判超标（P0-1）。 */
    var precipRate = 1000 * q / headArea;
    var soil = SOIL_INTENSITY[input.soil] ? input.soil : 'loam';
    var allow = SOIL_INTENSITY[soil];
    var slope = Number(input.slope_deg) || 0;
    if (slope > 8) allow = Math.max(5, allow - 2);   /* 坡地径流风险：允许强度降档 */
    var precipOk = precipRate <= allow;
    if (!precipOk) warn.push('组合喷灌强度 ' + precipRate.toFixed(1) + ' mm/h 超过 ' + soilLabel(soil) + '允许值 ' + allow + ' mm/h（坡地已降档）：建议换低流量喷嘴或缩短灌水历时');

    /* 坡度建议（学术结论：>15° 常规喷头均匀度难保证） */
    if (slope > 15) warn.push('坡度 ' + slope + '° 超过 15°：常规喷头水量分布明显恶化，建议改用压力补偿喷头/微喷或分台面单独设计');
    else if (slope > 8) warn.push('坡度 ' + slope + '°：建议支管沿等高线布置、喷头间距取 0.8~1.0R 下限');

    var eta = (input.eta > 0 && input.eta <= 1) ? input.eta : 0.7;
    var etc = (input.etc_mm > 0) ? input.etc_mm : 0;
    var dailyHours = null;
    if (etc > 0 && systemFlow > 0) {
      var sysRate = 1000 * systemFlow / areaM2;     /* 轮灌组全开时的系统折算降水强度 mm/h */
      dailyHours = etc / (eta * sysRate);           /* 满足日耗水所需的日纯喷洒小时数 */
    }

    return {
      ok: true, warn: warn,
      spacing: S, rowSpacing: row, headArea: headArea,
      headCount: headCount, headsPerShift: N, shiftCount: shiftCount,
      systemFlow: systemFlow, precipRate: precipRate,
      precipAllow: allow, precipOk: precipOk,
      sourceFlow: sourceFlow > 0 ? sourceFlow : null, sourceFlowOk: sourceFlowOk,
      expectedFlow: expectedFlow, nozzleOk: nozzleOk,
      dailyHours: dailyHours > 0 ? dailyHours : null,
      soil: soil, layout: layout
    };
  }


  /* ---------------- 喷灌布置图生成（v289，纯函数） ----------------
     在地块联合 bbox 上按喷头间距 S=R·k、行距（三角形 0.866S / 方形 S）铺网格，
     点在多边形内过滤，行序编号分轮灌组（每组 heads_per_shift 个），
     干管 = 过喷头群质心的竖向线，支管 = 每行喷头一条水平线。
     返回几何供 terrain-ui drawCanvas 直接绘制（地块分区=喷头按组着色）。 */

  function pointInPolygon(x, y, poly) {
    if (!Array.isArray(poly) || poly.length < 3) return false;
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
      if (!isNum(xi) || !isNum(yi) || !isNum(xj) || !isNum(yj)) continue;
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  /* 管径初估（v293）：经济流速法 d=sqrt(4Q/(3600πv))，向上贴标准 PE/PVC 公称径。
     规划级估算——精确水力计算（沿程损失/多工况校核）属后续阶段。 */
  var PIPE_DN = [32, 40, 50, 63, 75, 90, 110, 125, 140, 160, 180, 200, 225, 250, 280, 315];
  function pipeDN(flowM3h, v) {
    if (!(flowM3h > 0) || !(v > 0)) return null;
    var dmm = 1000 * Math.sqrt(4 * flowM3h / (3600 * Math.PI * v));
    for (var i = 0; i < PIPE_DN.length; i++) {
      if (PIPE_DN[i] >= dmm) return { dn: PIPE_DN[i], theory: dmm, flow: flowM3h, v: v };
    }
    return { dn: PIPE_DN[PIPE_DN.length - 1], theory: dmm, flow: flowM3h, v: v, warn: '超过最大标准径 315' };
  }

  function sprinklerLayout(plots, input) {
    input = input || {};
    var R = input.range_m, k = input.spacing_k;
    if (!(R > 0)) return { ok: false, error: '喷头射程必须为正数' };
    var polys = (plots || []).filter(function (p) { return Array.isArray(p && p.poly) && p.poly.length >= 3; });
    if (!polys.length) return { ok: false, error: '请先在地块清单中导入或绘制地块' };

    var layout = input.layout === 'square' ? 'square' : 'tri';
    if (!(k > 0.4) || k > 1.6) k = Math.min(1.6, Math.max(0.5, k || 1.1)); /* 与 sprinklerEstimate 同夹取 */
    var S = R * k;
    var row = layout === 'tri' ? S * Math.sqrt(3) / 2 : S;

    /* 联合 bbox */
    var B = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    polys.forEach(function (p) {
      var b = bboxOf(p.poly);
      B.minX = Math.min(B.minX, b.minX); B.minY = Math.min(B.minY, b.minY);
      B.maxX = Math.max(B.maxX, b.maxX); B.maxY = Math.max(B.maxY, b.maxY);
    });

    /* 超限拦截必须在生成之前（否则大 bbox × 小 S 直接撑爆内存/卡死主线程） */
    var gnx = Math.ceil((B.maxX - B.minX) / S) + 2, gny = Math.ceil((B.maxY - B.minY) / row) + 2;
    if (gnx * gny > 200000) return { ok: false, error: '喷头网格规模过大（' + (gnx * gny) + ' 点），请增大射程或减小地块范围后再出布置图' };

    /* 生成网格：首选居中偏移(S/2, row/2)；若一个点都落不进地块，换偏移重试，最后兜底质心 */
    function gen(ox, oy) {
      var heads = [];
      var ny = Math.max(1, Math.ceil((B.maxY - B.minY - oy * row) / row) + 1);
      for (var r = 0; r < ny; r++) {
        var y = B.minY + oy * row + r * row;
        var xoff = (layout === 'tri' && (r % 2)) ? S / 2 : 0;  /* 三角形奇数行错位 S/2 */
        var nx = Math.max(1, Math.ceil((B.maxX - B.minX - ox * S - xoff) / S) + 1);
        for (var c = 0; c < nx; c++) {
          var x = B.minX + ox * S + xoff + c * S;
          for (var pi = 0; pi < polys.length; pi++) {
            if (pointInPolygon(x, y, polys[pi].poly)) { heads.push({ x: x, y: y }); break; }
          }
        }
      }
      return heads;
    }
    var heads = [], tried = [[0.5, 0.5], [0.25, 0.25], [0.75, 0.75], [0, 0]];
    for (var t = 0; t < tried.length && !heads.length; t++) heads = gen(tried[t][0], tried[t][1]);
    if (!heads.length) {
      /* 兜底：第一地块顶点均值（凹多边形可能落外，仅极端小地块的展示兜底） */
      var p0 = polys[0].poly, sx = 0, sy = 0;
      p0.forEach(function (pt) { sx += pt.x; sy += pt.y; });
      heads = [{ x: sx / p0.length, y: sy / p0.length }];
    }
    if (heads.length > 4000) return { ok: false, error: '喷头数超过 4000（地块过大或射程过小），请增大射程或减小间距系数后再出布置图' };

    /* 轮灌组：按 y 行序（北为上故 y 大先画）→ 行内 x 升序，连续 N 个一组 */
    var N = Math.max(1, Math.round(input.heads_per_shift || 12));
    heads.sort(function (a, b) { return (Math.abs(a.y - b.y) > row / 2) ? (b.y - a.y) : (a.x - b.x); });
    heads.forEach(function (h, i) { h.g = Math.floor(i / N) + 1; });
    var groupCount = heads.length ? heads[heads.length - 1].g : 0;

    /* 支管：按行聚合（y 相同容差 row/2），每行一条水平线段；干管：过质心的竖向线段 */
    var rowsAgg = [];
    heads.forEach(function (h) {
      var rr = rowsAgg.find(function (ra) { return Math.abs(ra.y - h.y) <= row / 2; });
      if (!rr) { rr = { y: h.y, xs: [] }; rowsAgg.push(rr); }
      rr.xs.push(h.x);
    });
    rowsAgg.sort(function (a, b) { return b.y - a.y; });
    var laterals = rowsAgg.map(function (ra) {
      var minX = Math.min.apply(null, ra.xs), maxX = Math.max.apply(null, ra.xs);
      return { pts: [{ x: minX, y: ra.y }, { x: maxX, y: ra.y }] };
    });
    var cx = 0, cy = 0;
    heads.forEach(function (h) { cx += h.x; cy += h.y; });
    cx /= heads.length; cy /= heads.length;
    var yTop = rowsAgg[0].y, yBot = rowsAgg[rowsAgg.length - 1].y;
    var mainline = { pts: [{ x: cx, y: yTop }, { x: cx, y: yBot }] };

    /* 分区范围多边形（v290）：每组的行段（该组在某行的喷头横向跨度 × 行带高）
       拼成闭合直角多边形——右缘自上而下描迹、左缘自下而上闭合。
       方形布置下每组多边形面积恰 = 组内喷头数 × S × row（可精确断言）。 */
    var zonePolys = [];
    for (var zg = 1; zg <= groupCount; zg++) {
      var segs = [];
      heads.forEach(function (h) {
        if (h.g !== zg) return;
        var last = segs[segs.length - 1];
        if (last && Math.abs(last.yMid - h.y) <= row / 2) {
          last.L = Math.min(last.L, h.x - S / 2); last.R = Math.max(last.R, h.x + S / 2);
        } else {
          segs.push({ yMid: h.y, yT: h.y - row / 2, yB: h.y + row / 2, L: h.x - S / 2, R: h.x + S / 2 });
        }
      });
      if (!segs.length) continue;
      function dedupe(pts) {
        var out = [];
        pts.forEach(function (pt) {
          var p = out[out.length - 1];
          if (!p || Math.abs(p.x - pt.x) > 1e-9 || Math.abs(p.y - pt.y) > 1e-9) out.push(pt);
        });
        return out;
      }
      /* 东缘自南向北 → 北缘 → 西缘自北向南 → 南缘闭合（segs 已按北→南排序） */
      var pts = [];
      for (var si = segs.length - 1; si >= 0; si--) {
        pts.push({ x: segs[si].R, y: segs[si].yT });
        pts.push({ x: segs[si].R, y: segs[si].yB });
        if (si > 0) pts.push({ x: segs[si - 1].R, y: segs[si].yB });
      }
      pts.push({ x: segs[0].L, y: segs[0].yB });
      for (si = 0; si < segs.length; si++) {
        pts.push({ x: segs[si].L, y: segs[si].yB });
        pts.push({ x: segs[si].L, y: segs[si].yT });
        if (si < segs.length - 1) pts.push({ x: segs[si + 1].L, y: segs[si].yT });
      }
      pts.push({ x: segs[segs.length - 1].R, y: segs[segs.length - 1].yT });
      zonePolys.push({ g: zg, pts: dedupe(pts) });
    }

    /* 分区线（v289c）：相邻喷头组号变化处画分隔线——
       同行内切换 = 竖线（跨该行行带宽）；换行处切换 = 横线（跨两行的横向范围）。
       恰好 groupCount-1 条，与轮灌组一一对应。 */
    function rowExtentOf(y) {
      for (var i = 0; i < rowsAgg.length; i++) {
        if (Math.abs(rowsAgg[i].y - y) <= row / 2)
          return { minX: Math.min.apply(null, rowsAgg[i].xs), maxX: Math.max.apply(null, rowsAgg[i].xs) };
      }
      return null;
    }
    var dividers = [];
    for (var di = 1; di < heads.length; di++) {
      if (heads[di].g === heads[di - 1].g) continue;
      var h1 = heads[di - 1], h2 = heads[di];
      if (Math.abs(h1.y - h2.y) <= row / 2) {
        var vx = (h1.x + h2.x) / 2;
        dividers.push({ pts: [{ x: vx, y: h1.y - row / 2 }, { x: vx, y: h1.y + row / 2 }] });
      } else {
        var e1 = rowExtentOf(h1.y), e2 = rowExtentOf(h2.y);
        var my = (h1.y + h2.y) / 2;
        dividers.push({ pts: [{ x: Math.min(e1.minX, e2.minX), y: my }, { x: Math.max(e1.maxX, e2.maxX), y: my }] });
      }
    }

    /* 管径初估（v294）：干管=轮灌组流量 @1.2 m/s（长距离输水取低流速减损失）；
       支管=最不利单管流量（组内同一支管最多同时工作喷头数 ≤ min(每组头数, 该行头数)）
       @1.5 m/s（管段短允许较高流速）——保证主管 ≥ 支管的工程惯例 */
    var mainDN = null, latDN = null, mainFlow = 0, latFlow = 0;
    var qf = isNum(input.flow_m3h) ? input.flow_m3h : 0;
    if (qf > 0 && heads.length) {
      var nShift = Math.min(N, heads.length);
      var maxRowHeads = 0;
      rowsAgg.forEach(function (ra) { maxRowHeads = Math.max(maxRowHeads, ra.xs.length); });
      mainFlow = nShift * qf;
      latFlow = Math.min(nShift, maxRowHeads) * qf;
      mainDN = pipeDN(mainFlow, 1.2);
      latDN = pipeDN(latFlow, 1.5);
    }

    return {
      ok: true, range_m: R, spacing: S, rowSpacing: row, layout: layout,
      heads: heads, groupCount: groupCount, headsPerShift: Math.min(N, heads.length),
      laterals: laterals, mainline: mainline, dividers: dividers, zonePolys: zonePolys,
      mainDN: mainDN, latDN: latDN, mainFlow: mainFlow, latFlow: latFlow
    };
  }

  function soilLabel(key) {
    return { sand: '沙土', sandyloam: '沙壤土', loam: '壤土', clayloam: '黏壤土', clay: '黏土' }[key] || key;
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
    lonlatToLocalMeters: lonlatToLocalMeters,
    sprinklerEstimate: sprinklerEstimate,
    pointInPolygon: pointInPolygon,
    sanitizeRing: sanitizeRing,
    surfaceAreaApprox: surfaceAreaApprox,
    sprinklerLayout: sprinklerLayout,
    pipeDN: pipeDN,
    SOIL_INTENSITY: SOIL_INTENSITY,
    soilLabel: soilLabel,
    classifyElevFile: classifyElevFile,
    buildElevRecord: buildElevRecord,
    filterElevationOutliers: filterElevationOutliers,
    sampleAlongPath: sampleAlongPath,
    loadState: loadState,
    saveState: saveState
  };
});
