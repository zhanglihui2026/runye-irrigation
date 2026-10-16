/* ============================================================
   core/data-service.js — 核心数据服务（ES Module）
   ------------------------------------------------------------
   对外能力：
     · readDiagram()      深拷贝只读的设计图快照（插件改它，主程序数据不变）
     · captureProject()   完整工程快照（可还原），走主站 runyeSaveProject 通道
     · applyProject(snap) 还原完整工程快照（需 write:diagram）
     · getPlotContext()/mutateLayer() 读取/分层挂载 ryPlot v1（不触发计算）
     · 项目档案 CRUD      云优先（CloudSync.kv* → ry_kv + RLS），不可用降级 localStorage
   ------------------------------------------------------------
   ⚠ 存储路线（2026-10-11 定案，别改回云函数）：
     本 CloudBase 环境（2.0 / PG 型）把所有浏览器直连云函数一刀切拦死
     （匿名 / 无凭证 / 已登录 全部 EXCEED_AUTHORITY，安全规则只读不可改）。
     ⇒ 云存档**只能**走 `app.rdb()` 直连 PG 的 ry_kv 表（CloudSync.kvSet/kvGet/kvList/kvRemove），
       绝不可走 cloudSave()/callFunction('syncDb')。
     ⇒ 未登录（RLS 侧 sub='anon'）云通道不可用 ⇒ 纯 localStorage，UI 须明示。
   ============================================================ */

export var ARCHIVE_SCHEMA_VERSION = 1;
var LOCAL_KEY = 'ry_archive_local_v1';
var TMP_KEY = 'ry_plugin_capture_tmp_v1';
var KV_PREFIX = 'ry:archive:';

function nowIso() { return new Date().toISOString(); }

function deepCopy(v) {
  if (v === null || typeof v !== 'object') return v;
  try {
    if (typeof structuredClone === 'function') return structuredClone(v);
  } catch (e) { /* 含函数/循环引用 → 退 JSON */ }
  try { return JSON.parse(JSON.stringify(v)); } catch (e2) { return null; }
}

function cloud() {
  try {
    var C = (typeof window !== 'undefined') ? window.CloudSync : null;
    if (!C || typeof C.kvSet !== 'function' || typeof C.kvList !== 'function') return null;
    if (!C.ready || !C.uid) return null;                 /* 未登录 / SDK 未就绪 → 云不可用 */
    return C;
  } catch (e) { return null; }
}

function localAll() {
  try {
    var raw = localStorage.getItem(LOCAL_KEY);
    var o = raw ? JSON.parse(raw) : null;
    return (o && typeof o === 'object') ? o : {};
  } catch (e) { return {}; }
}
function localWriteAll(o) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(o || {})); return true; }
  catch (e) { return false; }
}

export function createDataService(guard) {
  guard = guard || null;

  /* ---------- 设计图（只读） ---------- */
  function readDiagram() {
    try {
      var d = (typeof window !== 'undefined') ? window.tlDiagramData : null;
      var snap = deepCopy(d || null);
      if (!snap) return null;
      /* 附带只读元信息：面积 / 流量模型（缺失时为空，插件须容错） */
      var meta = {
        measuredArea: (typeof window !== 'undefined' && window.measuredArea) || 0,
        flowModel: deepCopy((snap && snap.meta && snap.meta.flowModel) || null)
      };
      return { diagram: snap, meta: meta, capturedAt: nowIso() };
    } catch (e) {
      if (guard) guard.reportError('core', e, 'readDiagram');
      return null;
    }
  }

  /* ---------- 完整工程快照（可还原） ----------
     借主站 runyeSaveProject(silent, key) 构造快照（与 runye-undo.js 同一套路）：
       · __ryUndoQuiet=true 抑制「重算材料清单」这个副作用
       · 写完立刻读回并删除临时 key，不留痕
     [2026-10-12 数字农业剥离] 原 __ryUndoQuiet 还负责抑制「广播数字农业」，随
       桥接层文件删除一并取消。 */
  function captureProject() {
    try {
      var w = window;
      if (typeof w.runyeSaveProject !== 'function') return null;
      var prev = w.__ryUndoQuiet;
      w.__ryUndoQuiet = true;
      var s = null;
      try {
        w.runyeSaveProject(true, TMP_KEY);
        s = w.localStorage.getItem(TMP_KEY);
      } finally {
        w.__ryUndoQuiet = prev;
        try { w.localStorage.removeItem(TMP_KEY); } catch (e2) { }
      }
      if (!s) return null;
      try { return JSON.parse(s); } catch (e3) { return null; }
    } catch (e) {
      if (guard) guard.reportError('core', e, 'captureProject');
      return null;
    }
  }

  /* ---------- 还原工程快照（★ 唯一写回通道） ---------- */
  function applyProject(snap) {
    if (!snap) return false;
    try {
      var w = window;
      if (typeof w.runyeLoadProject !== 'function') return false;
      w.localStorage.setItem(TMP_KEY, JSON.stringify(snap));
      var ok = true;
      try {
        w.runyeLoadProject({ key: TMP_KEY, silent: true });
      } catch (e) {
        ok = false;
        if (guard) guard.reportError('core', e, 'applyProject');
      }
      try { w.localStorage.removeItem(TMP_KEY); } catch (e2) { }
      return ok;
    } catch (e) {
      if (guard) guard.reportError('core', e, 'applyProject');
      return false;
    }
  }

  /* ---------- 材料清单 BOM（复用 runye-material-audit.js 内核） ----------
     ★ 为什么放在 Core：内核需要直接碰 window.RyMaterialAudit / tlDiagramData /
       computeThreeLevel / tlIsPipeHidden 这些主程序全局；插件只该拿结果，不该碰全局。
       内核缺失或图未生成时返回 null，由插件提示「先生成三级管网」。 */
  var FALLBACK_PRICE = { 50: 6, 63: 9, 75: 12, 90: 17, 110: 24, 125: 30, 140: 37, 160: 47, 180: 60, 200: 72, 225: 88, 250: 104 };

  function pipePrice(od) {
    try {
      var w = window;
      if (typeof w.tlPipePriceByOd === 'function') {
        var v = w.tlPipePriceByOd(od);
        var n = parseFloat(v);
        if (n > 0) return n;                     /* 价目表 + 用户覆盖层 */
      }
    } catch (e) { }
    return FALLBACK_PRICE[Math.round(Number(od))] || 0;
  }

  function readBom() {
    try {
      var w = window;
      var d = w.tlDiagramData;
      var audit = w.RyMaterialAudit;
      if (!d || !audit || typeof audit.buckets !== 'function') return null;
      var r = (typeof w.computeThreeLevel === 'function') ? w.computeThreeLevel() : null;
      if (!r || !r.frontPipe || !r.mainPipe || !r.branchPipe) return null;

      var A = w.RyTlAutoEdits || null;
      var hidden = function (id) {
        try { return (typeof w.tlIsPipeHidden === 'function') ? !!w.tlIsPipeHidden(id) : false; } catch (e) { return false; }
      };
      var bk = null;
      try { bk = audit.buckets(d, r, A, hidden, null, w.tlManualGroups || []); } catch (e) { bk = null; }
      if (!bk) return null;

      var ft = null;
      if (typeof audit.autoFittings === 'function') {
        try { ft = audit.autoFittings(d, r, A); } catch (e2) { ft = null; }
      }

      var items = [];
      var TYPES = [['front', '地面支管（首部接管）'], ['main', '主管'], ['branch', '支管']];
      TYPES.forEach(function (t) {
        (bk[t[0]] || []).forEach(function (b) {
          var len = Math.round((b.len || 0) * 100) / 100;
          if (!(len > 0)) return;
          var price = pipePrice(b.od);
          items.push({
            type: t[0], label: t[1] + ' Ø' + b.od, spec: 'Ø' + b.od + ' mm',
            qty: len, unit: 'm', unitPrice: price, amount: Math.round(len * price * 100) / 100
          });
        });
      });

      /* 滴灌带：面积 / 行距（与 inline-09 的 tapeTotalLen 同一口径） */
      var area = Number(w.measuredArea) || 0;
      var spacing = numFromInput(['planTapeSpacing', 'fld_tapeSpacing'], 1.2);
      var tapeLen = (area > 0 && spacing > 0) ? Math.round(area / spacing) : 0;
      if (tapeLen > 0) {
        var tp = (w.materialPrices && Number(w.materialPrices.tape)) || 0.075;
        items.push({ type: 'tape', label: '滴灌带', spec: '行距 ' + spacing + ' m', qty: tapeLen, unit: 'm', unitPrice: tp, amount: Math.round(tapeLen * tp * 100) / 100 });
      }

      /* 管件：只有数量，无价目（unitPrice=0，UI 明示「未计价」，由用户手填） */
      var FIT = [['zoneTee', '分区三通'], ['zoneValve', '分区阀门'], ['teeJoint', '主管三通'], ['frontValve', '首部阀门']];
      (FIT || []).forEach(function (f) {
        ((ft && ft[f[0]]) || []).forEach(function (x) {
          if (!(x.qty > 0)) return;
          items.push({ type: f[0], label: f[1], spec: x.spec, qty: x.qty, unit: '个', unitPrice: 0, amount: 0 });
        });
      });

      var total = items.reduce(function (s, it) { return s + (Number(it.amount) || 0); }, 0);
      return {
        items: items,
        totalAmount: Math.round(total * 100) / 100,
        priced: items.filter(function (it) { return it.unitPrice > 0; }).length,
        unpriced: items.filter(function (it) { return !(it.unitPrice > 0); }).length,
        meta: {
          areaM2: area, tapeSpacing: spacing,
          od: { front: r.frontPipe.od, main: r.mainPipe.od, branch: r.branchPipe.od },
          generatedAt: nowIso()
        }
      };
    } catch (e) {
      if (guard) guard.reportError('core', e, 'readBom');
      return null;
    }
  }

  function numFromInput(ids, dflt) {
    try {
      for (var i = 0; i < ids.length; i++) {
        var el = document.getElementById(ids[i]);
        if (el && el.value !== '') {
          var n = parseFloat(el.value);
          if (n > 0) return n;
        }
      }
    } catch (e) { }
    return dflt;
  }

  /* ---------- ryPlot 分层接口（v1，只挂载当前层，不触发重算） ---------- */
  var PLOT_LIBRARY_KEY = 'runye_plot_library';
  var PLOT_GEOMETRY_KEYS = {
    measuredArea: 'measuredArea',
    measuredPolygon: 'measuredPolygon',
    mapFramePoly: '__runyeMapFramePoly',
    geoBase: '__runyeGeoBase',
    subPlots: '__runyeSubPlots',
    groupName: '__runyeGroupName'
  };
  var PLOT_PIPE_KEYS = ['mainPipes', 'branchPipes', 'valves', 'dripTapes', 'frontPipe', 'sourcePos'];

  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  function resolvePlotRef(plotId) {
    if (!plotId) return null;
    try {
      var raw = localStorage.getItem(PLOT_LIBRARY_KEY);
      var rows = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(rows)) return null;
      for (var i = 0; i < rows.length; i++) {
        if (rows[i] && rows[i].id === plotId) return deepCopy(rows[i]);
      }
      return null;
    } catch (e) {
      if (guard) guard.reportError('core', e, 'resolvePlotRef');
      return null;
    }
  }

  function getPlotContext() {
    try {
      var w = (typeof window !== 'undefined') ? window : null;
      if (!w) return null;
      var d = w.tlDiagramData || null;
      var plotRef = w.__runyePlotRef;
      var ref = w.currentPlotId || (plotRef && typeof plotRef === 'object' ? plotRef.id : plotRef) || null;
      var source = resolvePlotRef(ref);
      var g = {
        measuredArea: (w.measuredArea == null) ? null : deepCopy(w.measuredArea),
        measuredPolygon: (w.measuredPolygon == null) ? null : deepCopy(w.measuredPolygon),
        mapFramePoly: (w.__runyeMapFramePoly == null) ? null : deepCopy(w.__runyeMapFramePoly),
        geoBase: (w.__runyeGeoBase == null) ? null : deepCopy(w.__runyeGeoBase),
        subPlots: (w.__runyeSubPlots == null) ? null : deepCopy(w.__runyeSubPlots),
        groupName: (w.__runyeGroupName == null) ? null : deepCopy(w.__runyeGroupName)
      };
      var hasGeometry = Object.keys(g).some(function (k) { return g[k] !== null; });
      var zones = (d && d.zones != null) ? {
        zones: deepCopy(d.zones),
        partialFlags: d.partialFlags == null ? null : deepCopy(d.partialFlags),
        zoneActMu: d.zoneActMu == null ? null : deepCopy(d.zoneActMu)
      } : null;
      var pipes = null;
      if (d && PLOT_PIPE_KEYS.some(function (k) { return d[k] != null; })) {
        pipes = {};
        PLOT_PIPE_KEYS.forEach(function (k) { pipes[k] = d[k] == null ? null : deepCopy(d[k]); });
      }
      var model = d && d.meta && d.meta.flowModel != null ? deepCopy(d.meta.flowModel) : null;
      var pump = d && d.meta && d.meta.pump != null ? deepCopy(d.meta.pump) : null;
      var compliance = d && d.meta && d.meta.compliance != null ? deepCopy(d.meta.compliance) : null;
      var flow = (model != null || pump != null || compliance != null) ? {
        model: model,
        pump: pump,
        compliance: compliance,
        segments: null,
        economy: model && model.economy != null ? deepCopy(model.economy) : { vmin: 0.8, vmax: 2.0 }
      } : null;
      return {
        schemaVersion: 1,
        id: source ? source.id : null,
        name: source ? (source.name == null ? null : source.name) : null,
        source: source,
        geometry: hasGeometry ? g : null,
        zones: zones,
        pipes: pipes,
        flow: flow,
        bom: readBom(),
        capturedAt: nowIso(),
        migratedFrom: null
      };
    } catch (e) {
      if (guard) guard.reportError('core', e, 'getPlotContext');
      return null;
    }
  }

  function missingField(obj, field) {
    return !own(obj, field) || obj[field] == null || obj[field] === '';
  }

  function mutateLayer(layer, patch) {
    try {
      if (['source', 'geometry', 'zones', 'pipes', 'flow', 'bom'].indexOf(layer) < 0) {
        return { ok: false, error: 'unknown-layer' };
      }
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        return { ok: false, error: 'missing-field:patch' };
      }
      var w = (typeof window !== 'undefined') ? window : null;
      if (!w) return { ok: false, error: 'window-unavailable' };
      var value = deepCopy(patch);
      if (!value || typeof value !== 'object') return { ok: false, error: 'invalid-patch' };

      if (layer === 'source') {
        var required = ['id', 'sqm', 'polyLatLng'];
        for (var i = 0; i < required.length; i++) {
          if (missingField(value, required[i])) return { ok: false, error: 'missing-field:' + required[i] };
        }
        if (!(Number(value.sqm) > 0)) return { ok: false, error: 'missing-field:sqm' };
        if (!Array.isArray(value.polyLatLng) || value.polyLatLng.length < 3) return { ok: false, error: 'missing-field:polyLatLng' };
        var plotStore = w.RyPlotLibraryStore;
        if (!plotStore || typeof plotStore.read !== 'function' || typeof plotStore.upsertUnique !== 'function') {
          return { ok: false, error: 'plot-library-store-unavailable' };
        }
        var snapshot = plotStore.read();
        if (!snapshot.ok) return { ok: false, error: snapshot.error || 'plot-library-read-failed' };
        var matchingRows = snapshot.plots.filter(function (row) { return row && row.id === value.id; });
        if (matchingRows.length > 1) return { ok: false, error: 'duplicate-plot-id' };
        var next = matchingRows.length ? Object.assign({}, matchingRows[0], value) : value;
        var write = plotStore.upsertUnique(value.id, next, snapshot.revision);
        if (!write.ok) return { ok: false, error: write.error || 'plot-library-write-failed' };
      } else if (layer === 'geometry') {
        var geometryKeys = Object.keys(PLOT_GEOMETRY_KEYS);
        var supplied = geometryKeys.filter(function (k) { return own(value, k); });
        if (!supplied.length) return { ok: false, error: 'missing-field:geometry' };
        supplied.forEach(function (k) { w[PLOT_GEOMETRY_KEYS[k]] = value[k]; });
      } else {
        if (!w.tlDiagramData || typeof w.tlDiagramData !== 'object') return { ok: false, error: 'missing-field:tlDiagramData' };
        var d = w.tlDiagramData;
        if (layer === 'zones') {
          if (Object.keys(value).length === 0) return { ok: false, error: 'missing-field:zones' };
          d.zones = value;
        } else if (layer === 'pipes') {
          var pipeRequired = ['mainPipes', 'branchPipes'];
          for (var p = 0; p < pipeRequired.length; p++) {
            if (missingField(value, pipeRequired[p])) return { ok: false, error: 'missing-field:' + pipeRequired[p] };
          }
          if (!Array.isArray(value.mainPipes)) return { ok: false, error: 'missing-field:mainPipes' };
          if (!Array.isArray(value.branchPipes)) return { ok: false, error: 'missing-field:branchPipes' };
          PLOT_PIPE_KEYS.forEach(function (k) { if (own(value, k)) d[k] = value[k]; });
        } else if (layer === 'flow') {
          if (!own(value, 'model') && !own(value, 'pump') && !own(value, 'compliance')) return { ok: false, error: 'missing-field:flow' };
          d.meta = d.meta || {};
          if (own(value, 'model')) d.meta.flowModel = value.model;
          if (own(value, 'pump')) d.meta.pump = value.pump;
          if (own(value, 'compliance')) d.meta.compliance = value.compliance;
          /* segments 由水力插件懒计算，本接口只定义/回传形状，不写入图面快照。 */
        } else if (layer === 'bom') {
          if (Object.keys(value).length === 0) return { ok: false, error: 'missing-field:bom' };
          /* BOM 是计算产物，持久化仍由档案系统负责。 */
        }
      }
      try { w.dispatchEvent(new CustomEvent('ryPlotChanged', { detail: { layer: layer } })); } catch (e2) { }
      return { ok: true, schemaVersion: 1 };
    } catch (e) {
      if (guard) guard.reportError('core', e, 'mutateLayer');
      return { ok: false, error: String(e) };
    }
  }

  /* ---------- 档案 CRUD ---------- */
  function normalize(arc) {
    var a = (arc && typeof arc === 'object') ? arc : {};
    var id = a.id || ('a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
    var out = Object.assign({}, a);
    out.schemaVersion = ARCHIVE_SCHEMA_VERSION;
    out.id = id;
    out.createdAt = a.createdAt || nowIso();
    out.updatedAt = nowIso();
    out.project = Object.assign({ name: '', crop: '', sourceType: '', region: '', areaM2: 0 }, a.project || {});
    out.design = Object.assign({ diagramSnapshot: null, projectSnapshot: null, flowModel: null, optimization: null, bom: null }, a.design || {});
    out.fieldFeedback = Object.assign({ actualItems: [], actualCost: 0, revisionNote: '', deviationPct: null }, a.fieldFeedback || {});
    return out;
  }

  function saveArchive(arc) {
    var a = normalize(arc);
    var o = localAll();
    o[a.id] = a;
    var localOk = localWriteAll(o);                 /* 本地永远先写（断网也不丢） */
    var C = cloud();
    if (C) {
      /* 云写失败不阻断本地结果：返回值带 cloud:false，UI 明示「仅存本机」 */
      return Promise.resolve()
        .then(function () { return C.kvSet(KV_PREFIX + a.id, a); })
        .then(function (ok) { return { archive: a, local: localOk, cloud: !!ok }; })
        .catch(function () { return { archive: a, local: localOk, cloud: false }; });
    }
    return Promise.resolve({ archive: a, local: localOk, cloud: false, reason: 'cloud-unavailable' });
  }

  function readArchives() {
    var C = cloud();
    if (C) {
      return Promise.resolve()
        .then(function () { return C.kvList(KV_PREFIX); })
        .then(function (rows) {
          var list = (rows || []).map(function (r) { return r && r.value; }).filter(Boolean);
          return sortArchives(list);
        })
        .catch(function () { return sortArchives(localList()); });
    }
    return Promise.resolve(sortArchives(localList()));
  }

  function localList() {
    var o = localAll();
    return Object.keys(o).map(function (k) { return o[k]; }).filter(Boolean);
  }

  function sortArchives(list) {
    return list.slice().sort(function (a, b) {
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });
  }

  function loadArchive(id) {
    if (!id) return Promise.resolve(null);
    var C = cloud();
    if (C) {
      return Promise.resolve()
        .then(function () { return C.kvGet(KV_PREFIX + id); })
        .then(function (v) { return v || (localAll()[id] || null); })
        .catch(function () { return localAll()[id] || null; });
    }
    return Promise.resolve(localAll()[id] || null);
  }

  function deleteArchive(id) {
    if (!id) return Promise.resolve(false);
    var o = localAll();
    var had = !!o[id];
    if (had) { delete o[id]; localWriteAll(o); }
    var C = cloud();
    if (C) {
      return Promise.resolve()
        .then(function () { return C.kvRemove(KV_PREFIX + id); })
        .then(function (ok) { return had || !!ok; })
        .catch(function () { return had; });
    }
    return Promise.resolve(had);
  }

  /* ---------- 相似案例检索（阶段三） ----------
     数据源 = 项目档案库（档案自带作物/水源/区域/面积标签 + BOM，比匿名案例库更适合做推荐）。
     权重：面积 0.4 ｜ 作物 0.25 ｜ 区域 0.2 ｜ 水源 0.15。
     ⇒ 面积相近但作物不同，相似度也会明显低于「面积相近且作物相同」。 */
  var SIM_W = { area: 0.4, crop: 0.25, region: 0.2, source: 0.15 };

  function findSimilar(q, opts) {
    opts = opts || {};
    var minScore = (opts.minScore == null) ? 0.5 : Number(opts.minScore);
    var limit = opts.limit || 10;
    q = q || {};
    return readArchives().then(function (list) {
      var qa = Number(q.areaM2) || 0;
      var hits = (list || []).map(function (a) {
        var p = a.project || {};
        var pa = Number(p.areaM2) || 0;
        var parts = {
          area: (qa > 0 && pa > 0) ? 1 - Math.min(1, Math.abs(qa - pa) / Math.max(qa, pa)) : 0,
          crop: (q.crop && p.crop && String(q.crop) === String(p.crop)) ? 1 : 0,
          source: (q.sourceType && p.sourceType && String(q.sourceType) === String(p.sourceType)) ? 1 : 0,
          region: (q.region && p.region && (String(p.region).indexOf(String(q.region)) >= 0 || String(q.region).indexOf(String(p.region)) >= 0)) ? 1 : 0
        };
        var score = parts.area * SIM_W.area + parts.crop * SIM_W.crop + parts.region * SIM_W.region + parts.source * SIM_W.source;
        var mu = pa > 0 ? pa / 666.67 : 0;
        var bom = a.design && a.design.bom;
        var perMu = (bom && mu > 0) ? Math.round(bom.totalAmount / mu * 100) / 100 : null;
        return { archive: a, score: Math.round(score * 10000) / 10000, parts: parts, perMu: perMu };
      }).filter(function (x) { return x.score >= minScore; })
        .sort(function (x, y) { return y.score - x.score; })
        .slice(0, limit);

      /* 造价区间：取相似案例「每亩造价」的 P25 / 中位数 / P75 —— 给区间不给单点 */
      var vals = hits.map(function (x) { return x.perMu; }).filter(function (v) { return v != null; }).sort(function (a, b) { return a - b; });
      var range = null;
      if (vals.length) {
        var at = function (r) { return vals[Math.floor((vals.length - 1) * r)]; };
        range = { p25: at(0.25), median: at(0.5), p75: at(0.75), n: vals.length, unit: '元/亩' };
      }
      return { hits: hits, range: range, count: hits.length, weights: SIM_W };
    });
  }

  /* ---------- 参考方案推荐（阶段三 验收项「参考拓扑 + 逐管段 DN」）----------
     只做参考、绝不写回主程序。两条口径：
       · 逐管段 DN：按**相似度加权投票**（权重 0.5 + score）——高相似案例话语权更大，
         又不至于让单个案例一票定音。返回同时给 confidence（得票占比）供 UI 明示可信度。
       · 参考拓扑：取**中位数**（不用均值，避免被一两个极端案例带偏），且统一折算成
         「亩均」口径，方便直接乘到新地块面积上。
     样本为空 / 档案没存 BOM → 对应字段为 null，UI 必须据此提示而不是硬显示 0。 */
  var PIPE_SEGS = ['front', 'main', 'branch'];

  function odOf(spec) {
    var m = /(\d+(?:\.\d+)?)/.exec(String(spec || ''));
    return m ? Number(m[1]) : 0;
  }

  function medianOf(nums) {
    var v = (nums || []).filter(function (n) { return isFinite(n) && n > 0; }).sort(function (a, b) { return a - b; });
    if (!v.length) return null;
    var i = Math.floor((v.length - 1) / 2);
    return v.length % 2 ? v[i] : Math.round((v[i] + v[i + 1]) / 2 * 100) / 100;
  }

  function recommend(q, opts) {
    return findSimilar(q, opts).then(function (res) {
      var out = {
        hits: res.hits, range: res.range, count: res.count, weights: res.weights,
        pipes: null, topology: null, minScore: (opts && opts.minScore != null) ? Number(opts.minScore) : 0.5
      };
      var hits = res.hits || [];
      if (!hits.length) return out;

      /* ① 逐管段 DN：相似度加权投票 */
      var vote = {};
      PIPE_SEGS.forEach(function (s) { vote[s] = {}; });
      hits.forEach(function (h) {
        var items = (h.archive && h.archive.design && h.archive.design.bom && h.archive.design.bom.items) || [];
        items.forEach(function (it) {
          if (!vote[it.type]) return;
          var od = odOf(it.spec);
          if (!od) return;
          vote[it.type][od] = (vote[it.type][od] || 0) + (0.5 + (Number(h.score) || 0));
        });
      });
      var pipes = {};
      PIPE_SEGS.forEach(function (s) {
        var best = null, bv = 0, total = 0;
        Object.keys(vote[s]).forEach(function (od) {
          total += vote[s][od];
          if (vote[s][od] > bv) { bv = vote[s][od]; best = od; }
        });
        pipes[s] = best
          ? { od: Number(best), confidence: total > 0 ? Math.round(bv / total * 1000) / 1000 : 0 }
          : null;
      });
      out.pipes = pipes;

      /* ② 参考拓扑：亩均口径取中位 */
      var acc = { mainLen: [], branchLen: [], tapeLen: [], mainCount: [], branchCount: [] };
      hits.forEach(function (h) {
        var p = (h.archive && h.archive.project) || {};
        var mu = (Number(p.areaM2) || 0) / 666.67;
        var items = (h.archive && h.archive.design && h.archive.design.bom && h.archive.design.bom.items) || [];
        var L = { main: 0, branch: 0, tape: 0 }, C = { main: 0, branch: 0 };
        items.forEach(function (it) {
          if (it.type === 'tape') L.tape += Number(it.qty) || 0;
          else if (it.type === 'main') { L.main += Number(it.qty) || 0; C.main++; }
          else if (it.type === 'branch') { L.branch += Number(it.qty) || 0; C.branch++; }
        });
        if (C.main) acc.mainCount.push(C.main);
        if (C.branch) acc.branchCount.push(C.branch);
        if (mu > 0) {
          if (L.main > 0) acc.mainLen.push(Math.round(L.main / mu * 100) / 100);
          if (L.branch > 0) acc.branchLen.push(Math.round(L.branch / mu * 100) / 100);
          if (L.tape > 0) acc.tapeLen.push(Math.round(L.tape / mu * 100) / 100);
        }
      });
      out.topology = {
        mainLenPerMu: medianOf(acc.mainLen),
        branchLenPerMu: medianOf(acc.branchLen),
        tapeLenPerMu: medianOf(acc.tapeLen),
        mainSegments: medianOf(acc.mainCount),
        branchSegments: medianOf(acc.branchCount),
        n: hits.length, unit: 'm/亩'
      };
      return out;
    });
  }

  /* 案例快照构建（复用 runye-case-library.js 的脱敏 + 工程校验内核）。
     返回 null 表示内核缺失 / 还没生成管网 —— 插件据此提示，不要自己拼数据。 */
  function buildCase(opts) {
    try {
      var L = window.RyCaseLibrary;
      if (!L || typeof L.build !== 'function') return null;
      var snap = captureProject();
      if (!snap) return null;
      var o = opts || {};
      var r = L.build(snap, o.source || 'manual', o.status || 'pending', Number(o.rating) || 0, o.note || '');
      return (r && r.ok) ? r.value : null;
    } catch (e) {
      if (guard) guard.reportError('core', e, 'buildCase');
      return null;
    }
  }

  /* 设计 vs 实测偏差率（百分比，保留 2 位）。
     基准缺失（未存 BOM / 造价为 0）时返回 null —— 不臆造分母。
     符号约定：正 = 超支（UI 显红），负 = 节约（UI 显绿）。 */
  function computeDeviation(baseCost, actualCost) {
    var b = Number(baseCost), a = Number(actualCost);
    if (!(b > 0) || !isFinite(a)) return null;
    return Math.round((a - b) / b * 10000) / 100;
  }

  /* ---------- Hazen-Williams 参数反推（阶段三第 3 项：口径文档化 + opt-in）----------
     ★ 本组函数**全是纯计算**：只读、不写窗口、不碰主程序任何计算。
       反推出的 C 值只作为「本次工况的参考」，是否采纳由用户显式 opt-in，
       且采纳也只是写进档案的 design.optimization 字段 —— **现有水力计算一律不改**。
     公式（hydraulic-calc/hc-core.js、index.html hazenWilliams 同式同常数）：
       hf = 1.113e9 · L · Q^1.852 / (C^1.852 · D^4.87)   [hf: m, L: m, Q: m³/h, D: mm]

     [v379 消除口径双份] 本组函数原本是**照抄**的一份实现（v375 引入）。
     两份独立记录的问题不是「现在算错」，而是**将来漂移且静默** ——
     两边各自自洽、都不报错，只在某个工程上算出的数差了几个百分点才被发现。
     ⇒ 现在改成：**有 RyHcCore 就直接调它**（单一口径来源），
        内核没加载才用内置兜底（fail-open：主页不加载 hc-core.js，
        不能因为没打开水力校核就让参数标定废掉）。
     ★ 内核「有没有」是**动态**的（由 hydraulics 插件按需加载进来），
       所以每次调用都重新取 window.RyHcCore，不能在模块初始化时缓存。 */
  var HAZEN = { K: 1.113e9, n: 1.852, m: 4.87, DEFAULT_C: 150 };

  /* 内核探测：拿不到就用内置（含 window 不存在 / 内核半成品 / getter 抛错三种情况） */
  function hazenCore() {
    try {
      var K = (typeof window !== 'undefined') ? window.RyHcCore : null;
      return (K && typeof K.hazen === 'function') ? K : null;
    } catch (e) { return null; }
  }

  /* 内置兜底：与 RyHcCore.hazen **同式同常数**。仅在无内核时走这条路。
     ⚠ 它是「退路」不是「另一份口径」—— 闸门 C37 断言两者逐值相等。 */
  function hazenBuiltin(L, Q, d, C) {
    return HAZEN.K * L * Math.pow(Q, HAZEN.n) / (Math.pow(C, HAZEN.n) * Math.pow(d, HAZEN.m));
  }

  function hazenLoss(p) {
    var o = p || {};
    var L = Number(o.L), Q = Number(o.Q), d = Number(o.d), C = Number(o.C);
    if (!(L > 0) || !(Q > 0) || !(d > 0) || !(C > 0)) return null;
    /* 语义差（与内核的差别，别照搬）：内核无效入参返回 0，本层统一返回 null ——
       「算不出来」与「算出来是 0」必须有区别，UI 才好判断该显示「—」还是 0。 */
    var K = hazenCore();
    var v = K ? Number(K.hazen(L, Q, d, C)) : hazenBuiltin(L, Q, d, C);
    return (isFinite(v) && v > 0) ? Math.round(v * 10000) / 10000 : null;
  }

  /* 已知实测水头损失反推 C：C = [K·L·Q^n / (hf·D^m)]^(1/n)
     任一输入非正 / 结果非有限 → null（不臆造一个看起来合理的 C）。
     ⚠ 这是本组里唯一还必须自算的一条 —— RyHcCore 只提供正向 hazen()，
       没有反推入口。它用同一份 HAZEN 常数，与正向严格互逆
       （闸门 C29 用「独立手算绝对值」校验，C37 校验它跟随内核口径）。 */
  function invertHazenC(p) {
    var o = p || {};
    var L = Number(o.L), Q = Number(o.Q), d = Number(o.d), hf = Number(o.hf);
    if (!(L > 0) || !(Q > 0) || !(d > 0) || !(hf > 0)) return null;
    var num = HAZEN.K * L * Math.pow(Q, HAZEN.n);
    var den = hf * Math.pow(d, HAZEN.m);
    if (!(den > 0) || !isFinite(num)) return null;
    var c = Math.pow(num / den, 1 / HAZEN.n);
    if (!isFinite(c) || !(c > 0)) return null;
    return Math.round(c * 100) / 100;
  }

  /* 口径文档（只读）：插件 UI 直接展示，保证「依据文档」与代码同源、不会各说各话。
     默认 C 优先取主程序常量 C_HAZEN，取不到才用 150 —— 与主程序当前口径保持一致。
     [v379] 新增 engine：明示当前这一算走的是**内核**还是**内置兜底**。
     为什么要显式 return 而不是默默选：口径 questions 里最贵的一句是
     「这个数是哪来的」—— UI 必须能答，用户也要看得见（罗老师那边归档要写依据）。 */
  function hazenDefaults() {
    var c = HAZEN.DEFAULT_C;
    try {
      var v = Number((typeof window !== 'undefined') ? window.C_HAZEN : 0);
      if (isFinite(v) && v > 0) c = v;
    } catch (e) { }
    var engine = hazenCore() ? 'hc-core' : 'builtin';
    return {
      C: c, K: HAZEN.K, n: HAZEN.n, m: HAZEN.m,
      engine: engine,
      formula: 'hf = 1.113e9 · L · Q^1.852 / (C^1.852 · D^4.87)',
      units: { hf: 'm', L: 'm', Q: 'm³/h', D: 'mm' },
      source: engine === 'hc-core'
        ? '正在调用 hydraulic-calc/hc-core.js 的 RyHcCore.hazen() —— 单一口径来源，本站无副本'
        : 'hydraulic-calc/hc-core.js 未加载 → 内置兜底（同式同常数 1.113e9 / 1.852 / 4.87）',
      scope: 'PE 管、常温清水。C 随管材老化/结垢下降，反推值只代表本次实测工况。',
      caution: '单次实测反推 ≠ 可推广的标定值；建议同工况多次取中位后再考虑采纳。'
    };
  }

  /* 存储通道自检（UI 用：明示当前是云端还是本机） */
  function storageMode() {
    var C = cloud();
    return C ? 'cloud' : 'local';
  }

  /* 二期接口占位：只冻结名称与参数契约，本期不保存、不读取任何现场数据。
   * readings: {plotId, ts, points:[{label, pressureBar|pressureM, flow}],
   *   device:'pressure-gauge'|'flow-meter'|'manual', note}
   * 目标签名：saveFieldReadings(readings) -> Promise<{ok:boolean,id?:string}>；
   * readFieldReadings(plotId) -> Promise<Array|null>。目前返回 null 明确表示未实现。 */
  function saveFieldReadings(readings) {
    void readings;
    return Promise.resolve(null);
  }
  function readFieldReadings(plotId) {
    void plotId;
    return Promise.resolve(null);
  }

  return {
    readDiagram: readDiagram,
    captureProject: captureProject,
    applyProject: applyProject,
    readBom: readBom,
    computeDeviation: computeDeviation,
    hazenLoss: hazenLoss,
    invertHazenC: invertHazenC,
    hazenDefaults: hazenDefaults,
    findSimilar: findSimilar,
    recommend: recommend,
    buildCase: buildCase,
    saveArchive: saveArchive,
    readArchives: readArchives,
    loadArchive: loadArchive,
    deleteArchive: deleteArchive,
    storageMode: storageMode,
    normalize: normalize,
    getPlotContext: getPlotContext,
    mutateLayer: mutateLayer,
    resolvePlotRef: resolvePlotRef,
    saveFieldReadings: saveFieldReadings,
    readFieldReadings: readFieldReadings
  };
}
