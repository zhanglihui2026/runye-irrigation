/* ============================================================
   plugins/contour-dxf — 等高线解析（DXF → 高程点 → 地形高差）
   ------------------------------------------------------------
   任务书：TASK_contour-dxf_20261012（用户已拍板路径 B）。
   用户诉求：CAD 图纸另存为 DXF → 本插件提取等高线 Z 值 → 高程点集
   → 复用 terrain 高程接口（rtk_xyz 同构）→ 高差建议值供水力页扬程。

   红线（任务书 §4）：
   · 不改 terrain-core.js / hc-core.js / index.html / runye-nav.js / core/
     —— terrain 内核按需动态 import（只读复用，零侵入）；
   · 不解析 DWG 二进制；SPLINE 只取控制点、不造假曲线插值；
   · 无 Z 的实体**不产点**、不静默补 0（缺 Z 必须提示）；
   · 不新增 localStorage 键（写入走 terrain 既有 loadState/saveState）；
   · 会员门控 feat=pro-others 语义照旧（三态 fail-open）。

   DXF 解析口径（阶段1）：
   · 文本组码对逐对扫描，只认 ENTITIES 段；
   · 目标实体：LWPOLYLINE / POLYLINE+VERTEX / SPLINE（控制点）/ LINE /
     TEXT、MTEXT（纯数字文本 = 高程标注 → 独立高程点）；
   · 实体产点条件：全部顶点都带 30 组码 Z 且非全 0 —— 否则该实体整条
     剔除并计入「缺 Z」提示（绝不半条线产点、绝不补 0）。
   ============================================================ */

var ctxRef = null, unnav = null, panel = null, stopped = false;
var mo = null, guardTimer = null;   /* 守护观察器（任务书 §2.5：复用 material-list 机制） */
var parsed = null;                  /* { entities, layers, warnings } 最近一次解析结果 */
var curPoints = null;               /* 当前图层过滤后的高程点集 */
var curFileName = '';

/* ---------------- 小工具 ---------------- */

function el(tag, cls, text) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function toast(msg) {
  try {
    var d = el('div', 'ry-nav-toast', msg);
    d.setAttribute('role', 'status');
    document.body.appendChild(d);
    setTimeout(function () { d.classList.add('show'); }, 10);
    setTimeout(function () {
      d.classList.remove('show');
      setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 300);
    }, 2400);
  } catch (e) { }
}
function cfg(ctx) { return (ctx && ctx.manifest && ctx.manifest.config) || {}; }
function navCfg(ctx) { return (ctx && ctx.manifest && ctx.manifest.ui && ctx.manifest.ui.nav) || {}; }

/* ---------------- DXF 文本解析（纯 JS，无依赖） ---------------- */

/* 逐对扫描组码；只关心 ENTITIES 段里的目标实体。
   返回 { ok, entities:[{type,layer,pts:[{x,y,z}]}], noZ:[{type,layer,n,reason}], layers:{名:实体数}, warnings:[] }
   产点门槛（红线）：实体全部顶点都带 30 组码 Z 且非全 0；TEXT/MTEXT 走「纯数字标注 = 高程」。
   VERTEX 是 POLYLINE 的子实体 —— 只把顶点收进母实体的 pts，不单独成实体。 */
function parseDXFText(text) {
  var res = { ok: false, entities: [], noZ: [], layers: {}, warnings: [] };
  if (typeof text !== 'string' || !text.trim()) { res.warnings.push('文件为空'); return res; }
  if (text.indexOf('SECTION') < 0) { res.warnings.push('不像 DXF 文本（找不到 SECTION 段）—— 请确认 CAD 里是「另存为 DXF」而不是 DWG 改名'); return res; }

  var lines = text.split(/\r\n|\r|\n/);
  var pairs = [];
  for (var i = 0; i + 1 < lines.length; i += 2) {
    var c0 = parseInt(lines[i].trim(), 10);
    if (!isNaN(c0)) pairs.push({ code: c0, val: lines[i + 1] });
  }

  var inEntities = false, lastZero = '', cur = null, noZ = [];
  function flushPending() {
    /* 收悬挂顶点（不 finalize 实体）—— VERTEX 换槽用 */
    if (cur && cur._p && cur._p.x != null && cur._p.y != null) { cur.pts.push(cur._p); }
    if (cur && cur._p2 && cur._p2.x != null && cur._p2.y != null) { cur.pts.push(cur._p2); }
    if (cur) { cur._p = null; cur._p2 = null; }
  }
  function qualifies(e) {
    if (e.annotated) return true; /* 标注高程点：z 来自纯数字文本 */
    var allZ = e.pts.every(function (p) { return p.hasZ; });
    if (!allZ) return { no: '存在缺 30 组码（Z）的顶点' };
    var allZero = e.pts.every(function (p) { return p.hasZ && p.z === 0; });
    if (allZero) return { no: '整条线 Z 恒为 0（等高线 Z 丢失或压在 0 高程）' };
    return true;
  }
  function finalize() {
    if (!cur) return;
    flushPending();
    if (!cur.skip && cur.pts && cur.pts.length) {
      if (cur.type === 'TEXTPT') {
        /* MTEXT：3 分块在前、1 收尾 → 拼接顺序 _t3 + _t1；纯数字才当高程（宁漏勿错） */
        var t = ((cur._t3 || '') + (cur._t1 || '')).trim();
        if (/^-?\d+(\.\d+)?$/.test(t) && cur.pts.length === 1) {
          cur.pts[0].z = parseFloat(t);
          cur.annotated = true;
        } else cur.skip = true;
      }
      if (!cur.skip) {
        /* LWPOLYLINE 的整线高程走 38 组码（R2000+ 标准做法，逐点 30 通常缺失）——
           38 有值且非 0 才落进各顶点；38 缺失或 0 交给 qualifies 走缺 Z 提示（不造假）。 */
        if (cur.type === 'LWPOLYLINE' && cur._lwZ != null && cur._lwZ !== 0) {
          cur.pts.forEach(function (p) { if (!p.hasZ) { p.z = cur._lwZ; p.hasZ = true; } });
        }
        var q = qualifies(cur);
        if (q === true) {
          res.entities.push({ type: cur.type, layer: cur.layer, pts: cur.pts });
          res.layers[cur.layer] = (res.layers[cur.layer] || 0) + 1;
        } else {
          noZ.push({ type: cur.type, layer: cur.layer, n: cur.pts.length, reason: q.no });
        }
      }
    }
    cur = null;
  }

  for (var k = 0; k < pairs.length; k++) {
    var g = pairs[k], v = g.val;
    if (g.code === 0) {
      lastZero = v;
      if (v === 'VERTEX' && cur && cur.type === 'POLYLINE') {
        /* POLYLINE 的顶点子实体：收上一个槽的悬挂点、保持母实体收集态（不 finalize） */
        flushPending();
        continue;
      }
      finalize();
      if (v === 'ENDSEC') { inEntities = false; continue; }
      if (v === 'SECTION' || v === 'EOF' || v === 'SEQEND') continue;
      if (inEntities) {
        if (v === 'LWPOLYLINE' || v === 'POLYLINE' || v === 'SPLINE' || v === 'LINE') {
          cur = { type: v, layer: '', pts: [], _p: null, _p2: null };
        } else if (v === 'TEXT' || v === 'MTEXT') {
          cur = { type: 'TEXTPT', layer: '', pts: [], _p: null, _p2: null, _t1: '', _t3: '' };
        } else {
          cur = { skip: true }; /* 其余实体类型照常跳过内容（组码 10 等不会误收） */
        }
      }
      continue;
    }
    /* ★ 段切换判定必须放在 cur 守卫**之前**（否则 inEntities 永远立不起来：
       守卫要求 inEntities=true 才往下走，而置位语句又被守卫拦住 —— 死锁）。 */
    if (g.code === 2 && v === 'ENTITIES' && lastZero === 'SECTION') { inEntities = true; continue; }
    if (!inEntities || !cur || cur.skip) continue;
    switch (g.code) {
      case 8:
        if (cur.type !== 'POLYLINE' || !cur.layer) cur.layer = v; /* VERTEX 层沿用母实体 */
        break;
      case 10:
        if (cur._p && cur._p.x != null && cur._p.y != null) { cur.pts.push(cur._p); cur._p = null; }
        cur._p = { x: parseFloat(v), y: null, z: 0, hasZ: false };
        break;
      case 20:
        if (cur._p && cur._p.y == null) cur._p.y = parseFloat(v);
        break;
      case 30:
        if (cur._p && cur._p.y != null && !cur._p.hasZ) { cur._p.z = parseFloat(v); cur._p.hasZ = true; }
        else if (cur._p2 && cur._p2.y != null && !cur._p2.hasZ) { cur._p2.z = parseFloat(v); cur._p2.hasZ = true; }
        break;
      case 11:
        if (cur._p && cur._p.x != null && cur._p.y != null) { cur.pts.push(cur._p); cur._p = null; }
        cur._p2 = { x: parseFloat(v), y: null, z: 0, hasZ: false };
        break;
      case 21:
        if (cur._p2 && cur._p2.y == null) cur._p2.y = parseFloat(v);
        break;
      case 31:
        if (cur._p2 && cur._p2.y != null && !cur._p2.hasZ) { cur._p2.z = parseFloat(v); cur._p2.hasZ = true; }
        break;
      case 1:
        cur._t1 = (cur._t1 || '') + v;
        break;
      case 3:
        cur._t3 = (cur._t3 || '') + v;
        break;
      case 38:
        /* LWPOLYLINE 专属：整条线的高程（米）。其他实体的 38 是线型缩放，不收。 */
        if (cur.type === 'LWPOLYLINE') cur._lwZ = parseFloat(v);
        break;
      default:
        break;
    }
  }
  finalize();

  if (noZ.length) {
    var nPts = 0; noZ.forEach(function (z) { nPts += z.n; });
    res.noZ = noZ;
    res.warnings.push('有 ' + noZ.length + ' 个实体没有可用 Z 值（共 ' + nPts + ' 个顶点）—— 已整条剔除，不产点不补 0');
  }
  if (!res.entities.length) res.warnings.push('没有解析到带 Z 的等高线实体：请确认图层含 Z、或 CAD 导出 DXF 时未丢高程');
  res.ok = res.entities.length > 0;
  return res;
}

/* ---------------- 图层过滤与统计 ---------------- */

function applyLayerFilter(sel) {
  if (!parsed) return null;
  var pts = [];
  parsed.entities.forEach(function (e) {
    if (sel && !sel[e.layer]) return;
    e.pts.forEach(function (p) { pts.push({ x: p.x, y: p.y, z: p.z }); });
  });
  return pts;
}

function computeStats(points, areaM2, D) {
  if (!points || !points.length) return null;
  var zs = points.map(function (p) { return p.z; });
  var zMin = Math.min.apply(null, zs), zMax = Math.max.apply(null, zs);
  var st = { n: points.length, zMin: zMin, zMax: zMax, span: Math.round((zMax - zMin) * 100) / 100 };
  /* 平均坡度：有地块面积且 terrain 内核可用才给（surfaceAreaApprox 最小二乘坡面拟合） */
  if (D && areaM2 > 0 && typeof D.surfaceAreaApprox === 'function' && points.length >= 3) {
    try {
      var sa = D.surfaceAreaApprox(areaM2, points);
      if (sa && isFinite(sa.slopeDeg)) st.slopeDeg = Math.round(sa.slopeDeg * 100) / 100;
    } catch (e) { /* 拟合失败不影响主统计 */ }
  }
  return st;
}

/* ---------------- terrain 对接（只读复用，按需动态加载内核） ---------------- */

var terrainCorePromise = null;
function ensureTerrainCore() {
  if (typeof window !== 'undefined' && window.RyTerrainData) return Promise.resolve(window.RyTerrainData);
  if (!terrainCorePromise) {
    /* terrain-core.js 是普通脚本（挂 window.RyTerrainData），import() 执行一次即可；
       失败可重试（置回 null）。 */
    terrainCorePromise = import(new URL('../../terrain/terrain-core.js', import.meta.url).href)
      .then(function () { return (typeof window !== 'undefined' && window.RyTerrainData) || null; })
      .catch(function () { terrainCorePromise = null; return null; });
  }
  return terrainCorePromise;
}

function writeToTerrain(points, fileName) {
  return ensureTerrainCore().then(function (D) {
    if (!D || !D.buildElevRecord || !D.loadState || !D.saveState) return { ok: false, error: 'terrain 内核不可用' };
    var areaM2 = 0;
    try { areaM2 = D.plotsTotalAreaM2((D.loadState().plots || [])); } catch (e) { }
    var rec = D.buildElevRecord({ data_type: 'rtk_xyz', point_list: points, coverage_area_m2: areaM2, file_name: fileName });
    if (!rec || !rec.ok) return { ok: false, error: (rec && rec.error) || '高程记录构建失败' };
    rec.record.meta.source = 'contour-dxf'; /* 标记来源：同名 DXF 再导入时替换而非追加 */
    function dropMine(list) {
      return (list || []).filter(function (r) {
        return !(r && r.meta && r.meta.source === 'contour-dxf' && r.meta.file_name === fileName);
      });
    }
    /* ① 地形页 iframe 活着 → 直接写它的活动状态（防它随后用旧内存覆盖 localStorage），并同步落盘 */
    var fr = (typeof document !== 'undefined') ? document.getElementById('frTerrain') : null;
    var live = (fr && fr.contentWindow && fr.contentWindow.RyTerrainUI && fr.contentWindow.RyTerrainData) ? fr.contentWindow : null;
    if (live) {
      var ls = live.RyTerrainUI.state;
      ls.elevations = dropMine(ls.elevations);
      ls.elevations.push(rec.record);
      live.RyTerrainData.saveState(ls);
      return { ok: true, where: 'terrain 页（实时）', n: rec.record.point_list.length, confidence: rec.record.confidence };
    }
    /* ② 兜底：主窗口 terrain 状态接口（同一 localStorage 键，未新增键） */
    var st = D.loadState();
    st.elevations = dropMine(st.elevations);
    st.elevations.push(rec.record);
    var saved = D.saveState(st);
    return { ok: !!(saved && saved.ok), where: 'terrain 状态（地形页刷新后可见）', n: rec.record.point_list.length, confidence: rec.record.confidence, error: saved && saved.error };
  });
}

/* ---------------- CSV 导出（BOM + X,Y,Z，供 terrain「上传 RTK 高程 CSV」直读） ---------------- */

function buildCSV(points) {
  var rows = ['X,Y,Z'];
  (points || []).forEach(function (p) {
    rows.push(p.x + ',' + p.y + ',' + p.z);
  });
  return '\uFEFF' + rows.join('\r\n') + '\r\n';
}

function downloadCSV(points, fileName) {
  var blob = new Blob([buildCSV(points)], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (fileName || 'contour').replace(/\.dxf$/i, '') + '_高程点.csv';
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.parentNode.removeChild(a); }, 400);
}

/* ---------------- 会员门控（三态 fail-open，与 runye-nav.js gate() 同语义） ---------------- */

function gate(ctx) {
  var feat = cfg(ctx).feat;
  if (!feat) return true;
  var E = (typeof window !== 'undefined') ? window.RyEntitle : null;
  if (!E || typeof E.can !== 'function') return true;
  if (E.mockPlan) return E.can(feat);
  if (typeof E.ready === 'function' && !E.ready()) return true;
  return E.can(feat);
}

function onLocked(ctx) {
  var lb = navCfg(ctx).label || ctx.id;
  var U = (typeof window !== 'undefined') ? window.RyMemberUI : null;
  if (U && typeof U.showUpgrade === 'function') { U.showUpgrade(lb); return; }
  toast('「' + lb + '」为高级会员功能 · 邀请好友即可开通');
}

/* ---------------- 面板 ---------------- */

function buildPanel() {
  var p = el('div', 'cdxf-panel');
  p.setAttribute('data-ry-plugin', 'contour-dxf');
  p.style.display = 'none';

  var head = el('div', 'cdxf-head');
  head.appendChild(el('b', null, '等高线解析（DXF）'));
  var close = el('button', 'cdxf-x', '×');
  close.type = 'button';
  close.addEventListener('click', function () { p.style.display = 'none'; });
  head.appendChild(close);
  p.appendChild(head);

  p.appendChild(el('div', 'cdxf-note',
    'CAD 图纸「另存为 DXF」→ 本页解析等高线 Z 值 → 高程点集 → 坡度/高差。不含 DWG 直读；SPLINE 只取控制点。'));

  var file = el('input', 'cdxf-file');
  file.type = 'file';
  file.accept = '.dxf';
  var fileRow = el('div', 'cdxf-row');
  var fileLab = el('label', 'cdxf-label', '选择 DXF 文件（CAD 另存为 DXF，ASCII 文本格式）');
  fileLab.appendChild(file);
  fileRow.appendChild(fileLab);
  p.appendChild(fileRow);

  var btns = el('div', 'cdxf-btns');
  var bParse = el('button', 'cdxf-btn primary', '解析 DXF');
  bParse.type = 'button';
  var bCSV = el('button', 'cdxf-btn', '导出高程点 CSV');
  bCSV.type = 'button'; bCSV.disabled = true;
  var bTerrain = el('button', 'cdxf-btn', '写入地形模块');
  bTerrain.type = 'button'; bTerrain.disabled = true;
  btns.appendChild(bParse); btns.appendChild(bCSV); btns.appendChild(bTerrain);
  p.appendChild(btns);

  var layers = el('div', 'cdxf-layers');
  layers.hidden = true;
  p.appendChild(layers);

  var out = el('div', 'cdxf-out');
  p.appendChild(out);

  p.appendChild(el('div', 'cdxf-hint',
    '「地形高差建议值」= 最高点 − 最低点。水力页扬程的「地形」输入请参考此值（确认后再填，本插件不自动改写）。' +
    '「写入地形模块」走 terrain 高程状态接口（rtk_xyz 同构，等值于上传 RTK 高程 CSV）；同名 DXF 重复写入会替换旧记录。'));

  p._f = { file: file, bParse: bParse, bCSV: bCSV, bTerrain: bTerrain, layers: layers, out: out };
  return p;
}

function renderStats(points, D) {
  var f = panel._f, out = f.out;
  out.innerHTML = '';
  if (!parsed) return;
  /* 缺 Z 提示（红线：不静默） */
  (parsed.warnings || []).forEach(function (w) { out.appendChild(el('div', 'cdxf-warn', '⚠ ' + w)); });
  if (!points || !points.length) {
    out.appendChild(el('div', 'cdxf-empty', '当前图层选择下没有可用高程点 —— 请勾选含等高线 Z 值的图层后重试。'));
    return;
  }
  var areaM2 = 0;
  try { areaM2 = D ? D.plotsTotalAreaM2((D.loadState().plots || [])) : 0; } catch (e) { }
  var st = computeStats(points, areaM2, D);
  if (!st) return;
  out.appendChild(el('div', 'cdxf-res',
    '高程点 ' + st.n + ' 个 ｜ 高程范围 ' + st.zMin + ' ~ ' + st.zMax + ' m'));
  out.appendChild(el('div', 'cdxf-res', '地形高差建议值：' + st.span + ' m'));
  if (st.slopeDeg != null) {
    out.appendChild(el('div', 'cdxf-sub',
      '平均坡度约 ' + st.slopeDeg + '°（按地块面积 ' + Math.round(areaM2) + ' ㎡ 最小二乘坡面拟合，terrain 内核同源）'));
  } else {
    out.appendChild(el('div', 'cdxf-sub', '平均坡度：需先在地形模块导入地块边界才有面积基准（当前只报高程范围/高差）'));
  }
  out.appendChild(el('div', 'cdxf-sub',
    '水力页扬程的「地形」输入请参考高差建议值 ' + st.span + ' m（引导值，请自行确认后填写）。'));
}

function refreshLayerBox() {
  var f = panel._f, box = f.layers;
  box.innerHTML = '';
  var names = Object.keys(parsed.layers).sort();
  if (!names.length) { box.hidden = true; return; }
  box.hidden = false;
  box.appendChild(el('div', 'cdxf-sub', '图层（勾选 = 参与产点；等高线通常在专用图层）：'));
  names.forEach(function (n) {
    var lab = el('label');
    var chk = el('input');
    chk.type = 'checkbox';
    chk.checked = true;
    chk.addEventListener('change', function () {
      var sel = {};
      box.querySelectorAll('input[data-layer]').forEach(function (c) { sel[c.getAttribute('data-layer')] = c.checked; });
      curPoints = applyLayerFilter(sel);
      renderStats(curPoints, window.RyTerrainData);
      f.bCSV.disabled = !curPoints || !curPoints.length;
      f.bTerrain.disabled = !curPoints || !curPoints.length;
    });
    chk.setAttribute('data-layer', n);
    lab.appendChild(chk);
    lab.appendChild(document.createTextNode(n + '（' + parsed.layers[n] + ' 实体）'));
    box.appendChild(lab);
  });
}

function doParse() {
  var f = panel._f;
  var file = f.file.files && f.file.files[0];
  if (!file) { toast('请先选择 DXF 文件'); return; }
  var reader = new FileReader();
  reader.onload = function () {
    curFileName = file.name;
    parsed = parseDXFText(String(reader.result));
    curPoints = applyLayerFilter(null);
    refreshLayerBox();
    ensureTerrainCore().then(function (D) {
      renderStats(curPoints, D);
    });
    f.bCSV.disabled = !curPoints || !curPoints.length;
    f.bTerrain.disabled = !curPoints || !curPoints.length;
    if (parsed.ok) toast('解析完成：' + curPoints.length + ' 个高程点');
  };
  reader.onerror = function () { toast('文件读取失败'); };
  reader.readAsText(file);
}

/* ---------------- 守护观察器（任务书 §2.5：复用 material-list 机制） ----------------
 * 本插件**无老项可接管**（全新入口），不存在「复活老项」问题；观察器只做两件防御：
 * ① 双份防御：registerNav 理论只挂一份，真出现多个插件导航项时摘掉多余（保留第一个）；
 * ② 位置自愈：锚定项「滴灌带查询」之前 —— core mountNavs 已做（v391 重定位），
 *    这里只兜「极端重建时序下位置丢失」，与 core 同锚同动作，幂等不打架。 */
function findAnchor() {
  var links = document.querySelectorAll('.fn-inner[data-ry-fnnav] .fn-link, .fn-inner[data-ry-fnnav] a, .fn-inner[data-ry-fnnav] button');
  for (var i = 0; i < links.length; i++) {
    if ((links[i].textContent || '').trim() === '滴灌带查询') return links[i];
  }
  return null;
}
function startGuard() {
  if (typeof MutationObserver === 'undefined') return;
  mo = new MutationObserver(function () {
    if (stopped || guardTimer) return;
    guardTimer = setTimeout(function () {
      guardTimer = null;
      if (stopped) return;
      var items = document.querySelectorAll('[data-ry-plugin-nav="contour-dxf"]');
      for (var i = 1; i < items.length; i++) {
        if (items[i].parentNode) items[i].parentNode.removeChild(items[i]);
      }
      var mine = items[0];
      if (!mine) return;
      var anchor = findAnchor();
      if (anchor && anchor.parentNode && mine.nextElementSibling !== anchor) {
        try { anchor.parentNode.insertBefore(mine, anchor); } catch (e) { }
      }
    }, 200);
  });
  mo.observe(document.body, { childList: true, subtree: true });
}

/* ---------------- 生命周期 ---------------- */

export function activate(ctx) {
  /* ★ 模块级状态复位（ES 模块只加载一次，deactivate 置 stopped，二次 activate 不短路） */
  stopped = false; mo = null; guardTimer = null; unnav = null;
  parsed = null; curPoints = null; curFileName = '';
  ctxRef = ctx;

  panel = buildPanel();
  /* ★ 挂 body 而非 mountPoint：createMount 的 slot 默认 display:none，
     隐藏父容器内 position:fixed 面板不渲染（与 archive/case-lib 同口径） */
  document.body.appendChild(panel);

  var styleEl = document.getElementById('contourDxfCss');
  if (!styleEl) {
    var link = document.createElement('link');
    link.id = 'contourDxfCss';
    link.rel = 'stylesheet';
    link.href = new URL('./style.css', import.meta.url).href;
    document.head.appendChild(link);
  }

  panel._f.bParse.addEventListener('click', doParse);
  panel._f.bCSV.addEventListener('click', function () {
    if (!curPoints || !curPoints.length) { toast('先解析出高程点再导出'); return; }
    downloadCSV(curPoints, curFileName);
  });
  panel._f.bTerrain.addEventListener('click', function () {
    if (!curPoints || !curPoints.length) { toast('先解析出高程点再写入'); return; }
    panel._f.bTerrain.disabled = true;
    writeToTerrain(curPoints, curFileName).then(function (r) {
      panel._f.bTerrain.disabled = false;
      if (r && r.ok) toast('已写入地形模块（' + r.where + '，' + r.n + ' 点，置信度 ' + r.confidence + '）');
      else toast('写入失败：' + ((r && r.error) || '未知错误'));
    }).catch(function (e) {
      panel._f.bTerrain.disabled = false;
      if (ctxRef) ctxRef.runtime.reportError(e);
      toast('写入失败');
    });
  });

  if (ctx.ui.registerNav) {
    var nav = navCfg(ctx);
    unnav = ctx.ui.registerNav({
      label: nav.label || ctx.id,
      title: nav.title || '',
      order: nav.order,
      beforeLabel: cfg(ctx).beforeLabel || null,
      before: cfg(ctx).before || null,
      gate: function () { return gate(ctx); },
      onLocked: function () { onLocked(ctx); },
      onClick: function () {
        panel.style.display = panel.style.display === 'none' ? '' : 'none';
      }
    });
  }
  startGuard();
  ctx.runtime.log('boot', '等高线解析插件已激活（DXF 阶段1：顶点产点 + 标注高程）');
  return {
    open: function () { panel.style.display = ''; },
    state: function () { return { nav: !!unnav, points: curPoints ? curPoints.length : 0, stopped: stopped }; },
    /* 闸门/调试专用：解析器与 CSV 构建器（与 calib 暴露 lastC 同理） */
    parse: parseDXFText,
    buildCSV: buildCSV,
    filterPoints: applyLayerFilter,
    writeTerrain: writeToTerrain
  };
}

export function deactivate() {
  stopped = true;
  if (unnav) { try { unnav(); } catch (e) { } unnav = null; }
  if (mo) { try { mo.disconnect(); } catch (e) { } mo = null; }
  if (guardTimer) { clearTimeout(guardTimer); guardTimer = null; }
  if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
  var css = document.getElementById('contourDxfCss');
  if (css && css.parentNode) css.parentNode.removeChild(css);
  panel = null; ctxRef = null; parsed = null; curPoints = null; curFileName = '';
}
