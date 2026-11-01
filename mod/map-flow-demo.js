(function(){
  'use strict';
  /* ═══════════════════════════════════════════════════════════════════════
     [v861 用户需求] 在线地图轮灌演示：把三级页的分区水流动画搬到在线地图实际地块。
     用户原话（摘要）：原来分区水流动画演示搬到在线地图左侧控制面板了，那就直接
     在在线地图实际地块中演示；拾取手动绘制的总管跟分区内的主管、支管；手动绘制
     的总管跟分区主管没有连接就报错；总管与主管怎么连接后面再考虑。

     分工：
     · 本模块 = 分组/校验纯函数（Node 单测锁） + Leaflet 图层演示 + chips 面板
       （#mapDemoBar，挂在左工具栏底部「分组组合 · 轮灌演示」组内，v858 组）。
     · 宿主（online-map.js）注入 ctx：map / toLL(世界米→经纬度，走 v835 geoBridge) /
       getTrunkPoints(当前地块 trunk v2 主干) / tip / isMapActive。
     · 数据全部来自既有事实：tlDiagramData（mainPipes/branchPipes/valves/segTrunk/
       combinedN）+ window.tlManualGroups（面积成组）+ trunkSaved（手绘总管）。
       与规划页简图演示（inline-09 v215/v218）互不干扰：地图页激活时隐藏 #tlDemoBar、
       显示本模块 #mapDemoBar；切回规划页自动还原。

     连接判定（validateConnection，容差默认 5m，haversine R=6378137 唯一口径）：
     · 有段总管（v859）：总管贴近任一驳接点（≤tol）即视为贯通（段总管串联点本就
       落在各主管端点上）；总管直接贴近主管端点也算连通。
     · 无段总管：只看总管折线与各主管端点的最近距离。
     · 未连通 ⇒ start() 直接报错（用户明确要求），不播放。
     ═══════════════════════════════════════════════════════════════════════ */
  var TOL_M = 5, INTERVAL_MS = 1000;
  var DOT_FILLS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6'];
  var DOT_FILLS_LT = ['#fca5a5', '#fcd34d', '#86efac', '#93c5fd'];
  var DOT_INKS_LT = ['#7f1d1d', '#78350f', '#14532d', '#1e3a8a'];

  /* ── 纯函数（Node 单测锁） ─────────────────────────────────────────── */
  /* 分区 zi（行主序下标）→ 组下标 g。手动分组优先（mg=数组的数组）；
     自动均分：每组 nPer 个分区。越界返回 -1。 */
  function groupOf(zi, manual, nPer) {
    if (!(zi >= 0)) return -1;
    if (manual && manual.length) {
      for (var g = 0; g < manual.length; g++) {
        var arr = manual[g] || [];
        for (var i = 0; i < arr.length; i++) {
          if (parseInt(arr[i], 10) === zi) return g;
        }
      }
      return -1;
    }
    var n = Math.max(1, nPer || 1);
    return Math.floor(zi / n);
  }
  function groupCount(total, manual, nPer) {
    if (!(total > 0)) return 0;
    if (manual && manual.length) return manual.length;
    return Math.max(1, Math.ceil(total / Math.max(1, nPer || 1)));
  }
  /* 连接校验。o = {
       hasTrunk:bool, trunkLL:[{lat,lng}], mainsLL:[[{lat,lng}]×N],
       couplersLL:[{lat,lng}]|null, hasSeg:bool, tolM:number, dist:(a,b)=>米 }
     返回 { ok, code:'no-trunk'|'no-data'|'connected'|'disconnected', minM } */
  function validateConnection(o) {
    o = o || {};
    if (!o.hasTrunk || !Array.isArray(o.trunkLL) || !o.trunkLL.length) {
      return { ok: false, code: 'no-trunk', minM: null };
    }
    var mainsFlat = [];
    (o.mainsLL || []).forEach(function (l) {
      (l || []).forEach(function (p) { if (p) mainsFlat.push(p); });
    });
    if (!mainsFlat.length) return { ok: false, code: 'no-data', minM: null };
    var dist = o.dist || function () { return Infinity; };
    var tol = (typeof o.tolM === 'number' && o.tolM > 0) ? o.tolM : TOL_M;
    function minTo(set) {
      var m = Infinity;
      o.trunkLL.forEach(function (tp) {
        set.forEach(function (p) { var d = dist(tp, p); if (d < m) m = d; });
      });
      return m;
    }
    var mMain = minTo(mainsFlat);
    var mCoup = (o.hasSeg && Array.isArray(o.couplersLL) && o.couplersLL.length) ? minTo(o.couplersLL) : Infinity;
    var ok = (mMain <= tol) || (mCoup <= tol);
    return { ok: ok, code: ok ? 'connected' : 'disconnected', minM: Math.min(mMain, isFinite(mCoup) ? mCoup : Infinity) };
  }

  /* ── 运行时（依赖宿主注入 ctx） ────────────────────────────────────── */
  var ctx = null, layer = null, active = null, timer = null, playing = false;

  function readLL(p) {
    if (Array.isArray(p)) return (isFinite(p[0]) && isFinite(p[1])) ? { lat: p[0], lng: p[1] } : null;
    if (p && isFinite(p.lat) && isFinite(p.lng)) return { lat: p.lat, lng: p.lng };
    return null;
  }
  function toLLSafe(pt) {
    try { var q = ctx.toLL(pt); return q ? readLL(q) : null; } catch (e) { return null; }
  }
  function toLLLine(line) {
    var out = [];
    (line || []).forEach(function (p) { var q = toLLSafe(p); if (q) out.push(q); });
    return out.length >= 2 ? out : null;
  }

  /* 拾取当前地块的全部演示素材（经纬度）。不可反算（地块不一致/无图）返回 null。 */
  function collect() {
    if (!ctx) return null;
    var dd = window.tlDiagramData;
    if (!dd || dd.world !== 'meter') return null;
    var mainsLL = [], branchLL = [], valves = [], couplersLL = [], segLL = null;
    (dd.mainPipes || []).forEach(function (l) { mainsLL.push(toLLLine(l)); });
    (dd.branchPipes || []).forEach(function (l) { branchLL.push(toLLLine(l)); });
    (dd.valves || []).forEach(function (v) {
      var q = toLLSafe(v);
      if (q) valves.push({ ll: q, mi: (typeof v.mi === 'number') ? v.mi : -1 });
    });
    if (dd.segTrunk && Array.isArray(dd.segTrunk.points)) {
      segLL = toLLLine(dd.segTrunk.points);
      (dd.segTrunk.couplers || []).forEach(function (c) { var q = toLLSafe(c); if (q) couplersLL.push(q); });
    }
    var trunkLL = ctx.getTrunkPoints ? ctx.getTrunkPoints() : null;
    var total = (dd.mainPipes || []).length;
    if (!total) return null;
    var manual = (window.tlManualGroups && window.tlManualGroups.length) ? window.tlManualGroups : null;
    return {
      mainsLL: mainsLL, branchLL: branchLL, valves: valves,
      couplersLL: couplersLL, segLL: segLL, trunkLL: trunkLL,
      manual: manual, nPer: dd.combinedN || 1, total: total,
      gCount: groupCount(total, manual, dd.combinedN || 1)
    };
  }

  function ensureLayer() {
    if (!ctx || !ctx.map) return null;
    if (!layer) layer = window.L.layerGroup().addTo(ctx.map);
    return layer;
  }
  function poly(ll, color, weight, anim) {
    return window.L.polyline(ll.map(function (p) { return [p.lat, p.lng]; }),
      { color: color, weight: weight, opacity: 0.95, className: anim ? 'mapflow-anim' : '', interactive: false });
  }

  function render(g) {
    var ly = ensureLayer(); if (!ly) return;
    ly.clearLayers();
    active = g;
    var d = collect(); if (!d) { stop(); return; }
    /* 底态：全部主管/支管淡化灰 */
    d.mainsLL.forEach(function (l) { if (l) ly.addLayer(poly(l, '#cbd5e1', 2, false)); });
    d.branchLL.forEach(function (l) { if (l) ly.addLayer(poly(l, '#e2e8f0', 1.5, false)); });
    /* 总管 + 段总管常亮（水源 → 驳接 → 串联干线的骨架） */
    if (d.trunkLL && d.trunkLL.length >= 2) ly.addLayer(poly(d.trunkLL, '#111827', 5, false));
    if (d.segLL) ly.addLayer(poly(d.segLL, '#111827', 4, false));
    /* 活动组：主管蓝粗 + 支管绿 + 水流虚线滚动动画；组内阀门开（绿），组外关（灰） */
    for (var zi = 0; zi < d.total; zi++) {
      var gi = groupOf(zi, d.manual, d.nPer);
      if (gi === g) {
        if (d.mainsLL[zi]) ly.addLayer(poly(d.mainsLL[zi], '#185FA5', 5, true));
        if (d.branchLL[zi]) ly.addLayer(poly(d.branchLL[zi], '#16a34a', 3, true));
      }
    }
    d.valves.forEach(function (v) {
      var on = (v.mi >= 0) && (groupOf(v.mi, d.manual, d.nPer) === g);
      ly.addLayer(window.L.circleMarker([v.ll.lat, v.ll.lng], {
        radius: on ? 6 : 4,
        color: on ? '#16a34a' : '#94a3b8', weight: 2,
        fillColor: on ? '#22c55e' : '#e2e8f0', fillOpacity: 1, interactive: false
      }));
    });
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    playing = false;
    active = null;
    if (layer) layer.clearLayers();
    syncChipsState();
  }
  function playToggle() {
    var d = collect();
    var M = d ? d.gCount : 0;
    if (M <= 0) return;
    if (playing) {
      clearInterval(timer); timer = null; playing = false;
    } else {
      var g0 = (active == null || active < 0 || active >= M) ? 0 : active;
      start(g0, true);
      timer = setInterval(function () {
        var dd2 = collect();
        var M2 = dd2 ? dd2.gCount : 0;
        if (M2 <= 0) { stop(); return; }
        start(((active == null ? 0 : active) + 1) % M2, true);
      }, INTERVAL_MS);
      playing = true;
    }
    syncChipsState();
  }
  /* start：校验（总管↔主管连通）通过才渲染；失败 tip 报错（用户明确要求） */
  function start(g, silentChips) {
    var d = collect();
    if (!d) { if (ctx.tip) ctx.tip('轮灌演示需要先在「分区与管路」生成管线图，且与当前地块一致。'); return false; }
    var v = validateConnection({
      hasTrunk: !!(d.trunkLL && d.trunkLL.length),
      trunkLL: d.trunkLL || [],
      mainsLL: d.mainsLL, couplersLL: d.couplersLL, hasSeg: !!d.segLL,
      tolM: TOL_M,
      dist: (window.RyTrunkGeo && window.RyTrunkGeo.haversine) ? window.RyTrunkGeo.haversine : function () { return Infinity; }
    });
    if (!v.ok) {
      if (ctx.tip) {
        if (v.code === 'no-trunk') ctx.tip('还没有手动绘制的总管：请先在在线地图绘制总管（并打开捕捉吸到「驳接点」），再演示水流。');
        else if (v.code === 'no-data') ctx.tip('图面上没有分区主管，无法演示水流。');
        else ctx.tip('手动绘制的总管与分区主管没有连接（最近 ' + (v.minM == null ? '?' : v.minM.toFixed(1)) + ' m > 容差 ' + TOL_M + ' m），暂无法演示水流。请把总管画到「驳接点」或主管端点附近。');
      }
      return false;
    }
    render(g);
    if (!silentChips) syncChipsState();
    return true;
  }
  function syncChipsState() {
    var box = document.getElementById('mapDemoChips');
    if (!box) return;
    var play = document.getElementById('mapDemoPlay');
    if (play) play.textContent = playing ? '⏸' : '▶';
    var dots = box.querySelectorAll('[data-mapdemo-g]');
    for (var i = 0; i < dots.length; i++) {
      var g = parseInt(dots[i].getAttribute('data-mapdemo-g'), 10);
      dots[i].style.outline = (g === active) ? '2px solid #1f2937' : 'none';
    }
  }

  function rebuildChips(d) {
    var box = document.getElementById('mapDemoChips');
    if (!box) return;
    var M = d.gCount, h = '';
    for (var g = 0; g < M; g++) {
      var ci = g % DOT_FILLS.length, lite = g >= DOT_FILLS.length;
      h += '<button type="button" class="tl-demo-dot" data-mapdemo-g="' + g + '"' +
        ' style="background:' + (lite ? DOT_FILLS_LT[ci] : DOT_FILLS[ci]) + ';color:#fff"' +
        ' title="高亮第 ' + (g + 1) + ' 轮灌组（在线地图实际地块上演示水流）">' + (g + 1) + '</button>';
    }
    h += '<button type="button" id="mapDemoPlay" class="tl-demo-ctl" aria-label="轮播" title="自动轮流演示各组（1 秒一组），再点暂停">▶</button>';
    h += '<button type="button" id="mapDemoExit" class="tl-demo-ctl" aria-label="退出" title="退出演示，清除地图上的演示图层">■</button>';
    box.innerHTML = h;
    syncChipsState();
  }
  function wireChips() {
    var box = document.getElementById('mapDemoChips');
    if (!box || box.__mapDemoWired) return;
    box.__mapDemoWired = true;
    box.addEventListener('click', function (e) {
      var t = e.target; if (!t || !t.closest) return;
      var gb = t.closest('[data-mapdemo-g]');
      if (gb) {
        if (timer) { clearInterval(timer); timer = null; playing = false; }
        start(parseInt(gb.getAttribute('data-mapdemo-g'), 10));
        return;
      }
      if (t.closest('#mapDemoPlay')) { playToggle(); return; }
      if (t.closest('#mapDemoExit')) { stop(); return; }
    });
  }

  /* 刷新：地图页激活且数据可拾取 ⇒ 显示面板 + 重建 chips；否则隐藏并清层。
     规划简图演示条（#tlDemoBar）在地图页隐藏（两套演示不同画布）。 */
  function refresh() {
    var bar = document.getElementById('mapDemoBar');
    if (!bar || !ctx) return;
    var onMap = !!(ctx.isMapActive && ctx.isMapActive());
    if (!onMap) {
      bar.style.display = 'none';
      if (active != null || playing) stop();
      var tb0 = document.getElementById('tlDemoBar');
      if (tb0 && window.__tlDemoGroup == null && !tb0.__keepHidden) tb0.style.display = '';
      return;
    }
    var d = collect();
    if (!d || d.gCount <= 0) {
      /* [v863] 无可拾取数据时给引导提示而不是整条隐藏 —— 用户找不到入口。 */
      bar.style.display = '';
      bar.__noData = true;
      var hint = document.getElementById('mapDemoHint');
      if (!hint) {
        hint = document.createElement('div');
        hint.id = 'mapDemoHint';
        hint.style.cssText = 'margin-top:4px;color:#9a3412';
        hint.textContent = '尚未拾取到分区主管/支管：请先到「分区与管路」页生成分区图面（并保存总管），再回这里演示。';
        bar.appendChild(hint);
      }
      if (active != null || playing) stop();
      return;
    }
    bar.__noData = false;
    var hint0 = document.getElementById('mapDemoHint');
    if (hint0) hint0.parentNode.removeChild(hint0);
    bar.style.display = '';
    rebuildChips(d);
    var tb = document.getElementById('tlDemoBar');
    if (tb) tb.style.display = 'none';   /* 简图演示 chips 在地图页无意义，隐藏防误点 */
  }

  function injectCss() {
    if (typeof document === 'undefined' || document.getElementById('mapFlowDemoCss')) return;
    var st = document.createElement('style');
    st.id = 'mapFlowDemoCss';
    st.textContent = '.mapflow-anim{stroke-dasharray:10 8;animation:mapflowDash .45s linear infinite}@keyframes mapflowDash{to{stroke-dashoffset:-18}}';
    document.head.appendChild(st);
  }

  window.RyMapFlowDemo = {
    VERSION: 'v861-map-flow-demo',
    TOL_M: TOL_M,
    INTERVAL_MS: INTERVAL_MS,
    init: function (c) {
      ctx = c;
      injectCss();
      wireChips();
      refresh();
      /* section 切换跟随：在线地图激活 ⇒ 显示面板+重建 chips；离开 ⇒ 隐藏+清层 */
      try {
        var sec = document.getElementById('onlineMapSection');
        if (sec && typeof MutationObserver === 'function' && !sec.__mapDemoObs) {
          sec.__mapDemoObs = new MutationObserver(function () { try { refresh(); } catch (e) { } });
          sec.__mapDemoObs.observe(sec, { attributes: true, attributeFilter: ['class'] });
        }
        if (!window.__mapDemoHashHook) {
          window.__mapDemoHashHook = true;
          window.addEventListener('hashchange', function () { try { refresh(); } catch (e) { } });
        }
      } catch (e) { }
    },
    refresh: refresh,
    stop: stop,
    isActive: function () { return active != null || playing; },
    /* 纯函数导出（Node 单测） */
    groupOf: groupOf, groupCount: groupCount, validateConnection: validateConnection
  };
})(window);
