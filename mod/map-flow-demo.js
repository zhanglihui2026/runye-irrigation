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
       getTrunkLines(当前地块全部 trunk v2 总管) / getTrunkPoints(旧宿主兼容) / tip / isMapActive。
     · 数据全部来自既有事实：tlDiagramData（mainPipes/branchPipes/valves/segTrunk/
       combinedN）+ window.tlManualGroups（面积成组）+ trunkSaved（手绘总管）。
       与规划页简图演示（inline-09 v215/v218）互不干扰：地图页激活时隐藏 #tlDemoBar、
       显示本模块 #mapDemoBar；切回规划页自动还原。

     连接判定（validateConnection，容差默认 5m，haversine R=6378137 唯一口径）：
     · 有段总管（v859）：总管贴近任一驳接点（≤tol）即视为贯通（段总管串联点本就
       落在各主管端点上）；总管直接贴近主管端点也算连通。
     · 无段总管：只看总管折线与各主管端点的最近距离。
     · 未连通 ⇒ start() 直接报错（用户明确要求），不播放。
     [v917] 同时接收 RyTlNodes 的主管/支管施工节点；多条保存总管分线演示，不合并虚构连接段。
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
  /* 将三级施工节点 N-xx 投影为在线地图的轮灌入口点。
     pid=main-i / branch-i，atM 沿工作区有效管线弧长；支管节点归属同索引分区。 */
  function collectWorkspaceNodes(dd, list, pointAt, toLL) {
    var out=[];
    if(!dd||!Array.isArray(list)||typeof pointAt!=='function'||typeof toLL!=='function')return out;
    list.forEach(function(n){
      if(!n)return;
      var m=/^(main|branch)-(\d+)$/.exec(String(n.pid||''));
      if(!m)return;
      var mi=Number(m[2]), lines=m[1]==='main'?dd.mainPipes:dd.branchPipes;
      if(!isFinite(mi)||mi<0||!Array.isArray(lines)||!Array.isArray(lines[mi])||lines[mi].length<2)return;
      var p;try{p=pointAt(n.pid,dd,Number(n.atM));}catch(e){return;}
      if(!p||p.x==null||p.y==null)return;
      var q;try{q=toLL(p);}catch(e2){return;}
      if(!q)return;
      out.push({pipeKey:(m[1]==='main'?'m':'b')+(mi+1),mi:mi,ll:q,nodeId:String(n.id||''),source:'tl-node'});
    });
    return out;
  }
  /* 连接校验。o = {
       hasTrunk:bool, trunkLL:[{lat,lng}], mainsLL:[[{lat,lng}]×N],
       couplersLL:[{lat,lng}]|null, hasSeg:bool, tolM:number, dist:(a,b)=>米,
       nodesLL:[{pipeKey,mi,ll}]|null, groupOfZi:fn(zi)=>g|null, groups:number|null }
     返回 { ok, code:'no-trunk'|'no-data'|'connected'|'disconnected'|'partial',
            minM, brokenGroups?:[g] }
     [v915 步骤 3] 判据升级（任务清单 §9.4 次序 4）：
     · 结构化匹配：接驳节点（v913 dd.couplerNodes 投影，ll=geoBridge 反算）被总管任一
       拐点贴近（≤tol）⇒ 该节点所在主管（mi）视为贯通——与 2b 的「总管吸到节点」
       用户操作一一对应（吸附落点就是拐点）。
     · 逐组可达性：每组（轮灌组）至少一根主管贯通（主管端点贴近 或 该组任一节点的
       主管匹配）才算连通；有组不通 ⇒ code:'partial' + brokenGroups（演示前逐组报错）。
     · 兼容：未提供 nodesLL/groupOfZi（旧档/没放节点/单组）⇒ 走 v861 原口径
       （整体 min(主管端点, 驳接点) ≤tol），旧测试与既有用户流程零影响。 */
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

    /* [v915] 逐组判定：需要 nodesLL + groupOfZi + groups 三者齐备；任一缺席退旧口径。 */
    var perMain = null;   /* mZi[zi]=该主管到总管的最小距离（端点口径） */
    if (typeof o.groupOfZi === 'function' && o.groups > 1 && Array.isArray(o.mainsLL)) {
      perMain = o.mainsLL.map(function (l) {
        return minTo((l || []).filter(Boolean));
      });
      if (Array.isArray(o.nodesLL)) {
        o.nodesLL.forEach(function (n) {
          if (!n || !n.ll || !(n.mi >= 0)) return;
          var hit = false;
          o.trunkLL.forEach(function (tp) { if (dist(tp, n.ll) <= tol) hit = true; });
          if (hit && perMain[n.mi] > 0) perMain[n.mi] = 0;   /* 节点匹配 ⇒ 该主管贯通 */
        });
      }
      var broken = [];
      for (var g = 0; g < o.groups; g++) {
        var gMin = Infinity;
        for (var zi = 0; zi < perMain.length; zi++) {
          if (o.groupOfZi(zi) === g && perMain[zi] < gMin) gMin = perMain[zi];
        }
        if (!(gMin <= tol)) broken.push(g);
      }
      if (broken.length) {
        return { ok: false, code: 'partial', minM: Math.min.apply(null, perMain.filter(isFinite)), brokenGroups: broken };
      }
      return { ok: true, code: 'connected', minM: Math.min.apply(null, perMain.filter(isFinite)) };
    }

    var ok = (mMain <= tol) || (mCoup <= tol);
    return { ok: ok, code: ok ? 'connected' : 'disconnected', minM: Math.min(mMain, isFinite(mCoup) ? mCoup : Infinity) };
  }

  /* [v916 步骤 4] 演示水路入口精确化（纯函数，Node 单测锁）。
     活动组 g 的「水流入口」= 该组内接驳节点所在主管的节点（nodesLL 来自 v913
     dd.couplerNodes 投影，ll=geoBridge 反算经纬度）。返回 [{pipeKey, mi, ll}]；
     无节点数据/该组没放节点 ⇒ []（渲染层自然退化为只高亮主管，零破坏）。 */
  function entrancesOf(d, g) {
    if (!d || !Array.isArray(d.nodesLL)) return [];
    var gof = d.groupOfZi || function (zi) { return groupOf(zi, d.manual, d.nPer); };
    return d.nodesLL.filter(function (n) {
      return n && n.ll && (n.mi >= 0) && gof(n.mi) === g;
    });
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
    var mainsLL = [], branchLL = [], valves = [], couplersLL = [], segLL = null, nodesLL = [];
    (dd.mainPipes || []).forEach(function (l) { mainsLL.push(toLLLine(l)); });
    (dd.branchPipes || []).forEach(function (l) { branchLL.push(toLLLine(l)); });
    (dd.valves || []).forEach(function (v) {
      var q = toLLSafe(v);
      if (q) valves.push({ ll: q, mi: (typeof v.mi === 'number') ? v.mi : -1 });
    });
    /* [v915] 接驳节点（v913 dd.couplerNodes 投影，世界米）→ 经纬度 + 主管下标。
       失配节点（x/y null）跳过；mi=parseInt('m3')-1，解析不出跳过（宁缺不错）。 */
    (dd.couplerNodes || []).forEach(function (n) {
      if (!n || n.x == null || n.y == null) return;
      var mi = parseInt(String(n.pipeKey || '').replace(/^m/, ''), 10);
      if (!isFinite(mi) || mi < 0) return;
      var q = toLLSafe({ x: n.x, y: n.y });
      if (q) nodesLL.push({ pipeKey: String(n.pipeKey), mi: mi - 1, ll: q });
    });
    /* [v917] 施工节点与设计接驳节点统一进入水路验证及入口高亮。 */
    try {
      var tlNodes=window.RyTlNodes, autoEdits=window.RyTlAutoEdits;
      if(tlNodes&&typeof tlNodes.list==='function'&&autoEdits&&typeof autoEdits.pointAt==='function'){
        nodesLL=nodesLL.concat(collectWorkspaceNodes(dd,tlNodes.list(),autoEdits.pointAt,toLLSafe));
      }
    } catch(eNodes) { /* 无可用施工节点时保留既有接驳节点链路 */ }
    if (dd.segTrunk && Array.isArray(dd.segTrunk.points)) {
      segLL = toLLLine(dd.segTrunk.points);
      (dd.segTrunk.couplers || []).forEach(function (c) { var q = toLLSafe(c); if (q) couplersLL.push(q); });
    }
    var trunkLinesLL = [];
    if(typeof ctx.getTrunkLines==='function'){
      var gotLines=ctx.getTrunkLines();
      if(Array.isArray(gotLines))gotLines.forEach(function(line){if(Array.isArray(line)&&line.length>=2)trunkLinesLL.push(line);});
    } else {
      var legacyTrunk=ctx.getTrunkPoints?ctx.getTrunkPoints():null;
      if(Array.isArray(legacyTrunk)&&legacyTrunk.length>=2)trunkLinesLL.push(legacyTrunk);
    }
    var trunkLL=[];
    trunkLinesLL.forEach(function(line){trunkLL=trunkLL.concat(line);});
    var total = (dd.mainPipes || []).length;
    if (!total) return null;
    var manual = (window.tlManualGroups && window.tlManualGroups.length) ? window.tlManualGroups : null;
    return {
      mainsLL: mainsLL, branchLL: branchLL, valves: valves,
      couplersLL: couplersLL, segLL: segLL, trunkLL: trunkLL, trunkLinesLL: trunkLinesLL,
      nodesLL: nodesLL,
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
    /* [v882] 总管 + 段总管 = 完整闭合水路（用户要求：手动总管接上自动生成的段总管
       形成闭合系统，演示时水流沿整条路径走）。实线深色骨架常亮 + 青色流动虚线叠层
       （与简图 v218 水流线同语言：#38bdf8 光流），叠加不遮管线原色。 */
    (d.trunkLinesLL || (d.trunkLL && d.trunkLL.length >= 2 ? [d.trunkLL] : [])).forEach(function(line){
      if(!line||line.length<2)return;
      ly.addLayer(poly(line, '#111827', 5, false));
      ly.addLayer(poly(line, '#38bdf8', 2.4, true));
    });
    if (d.segLL) {
      ly.addLayer(poly(d.segLL, '#111827', 4, false));
      ly.addLayer(poly(d.segLL, '#38bdf8', 2.2, true));
    }
    /* 活动组：主管蓝粗 + 支管绿 + 水流虚线滚动动画；组内阀门开（绿），组外关（灰） */
    for (var zi = 0; zi < d.total; zi++) {
      var gi = groupOf(zi, d.manual, d.nPer);
      if (gi === g) {
        if (d.mainsLL[zi]) ly.addLayer(poly(d.mainsLL[zi], '#185FA5', 5, true));
        if (d.branchLL[zi]) ly.addLayer(poly(d.branchLL[zi], '#16a34a', 3, true));
      }
    }
    /* [v916] 接驳节点标记（常驻）：全部节点小橙点——用户能看见「水路入口在哪」；
       失配节点（collect 已跳过 x/y null）不出现在图上。 */
    (d.nodesLL || []).forEach(function (n) {
      if (!n || !n.ll) return;
      ly.addLayer(window.L.circleMarker([n.ll.lat, n.ll.lng], {
        radius: 4, color: '#b45309', weight: 2,
        fillColor: '#f59e0b', fillOpacity: 1, interactive: false
      }));
    });
    /* [v916] 活动组水路入口：该组节点位置画双环大标记（外环描边+白芯橙心）——
       「水从节点进入主管」的精确入口（步骤 4 验收：入口坐标=节点坐标）。 */
    entrancesOf(d, g).forEach(function (n) {
      ly.addLayer(window.L.circleMarker([n.ll.lat, n.ll.lng], {
        radius: 9, color: '#b45309', weight: 2.5, fillOpacity: 0, interactive: false
      }));
      ly.addLayer(window.L.circleMarker([n.ll.lat, n.ll.lng], {
        radius: 5, color: '#ffffff', weight: 2,
        fillColor: '#f59e0b', fillOpacity: 1, interactive: false
      }));
    });
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
      dist: (window.RyTrunkGeo && window.RyTrunkGeo.haversine) ? window.RyTrunkGeo.haversine : function () { return Infinity; },
      /* [v915] 步骤 3：逐组可达性 + 节点结构化匹配（齐备才启用，缺则退 v861 原口径） */
      nodesLL: d.nodesLL,
      groupOfZi: function (zi) { return groupOf(zi, d.manual, d.nPer); },
      groups: d.gCount
    });
    if (!v.ok) {
      if (ctx.tip) {
        if (v.code === 'no-trunk') ctx.tip('还没有手动绘制的总管：请先在在线地图绘制总管（并打开捕捉吸到「驳接点」），再演示水流。');
        else if (v.code === 'no-data') ctx.tip('图面上没有分区主管，无法演示水流。');
        else if (v.code === 'partial') {
          var gs = (v.brokenGroups || []).map(function (g) { return g + 1; }).join('、');
          ctx.tip('轮灌组 ' + gs + ' 的主管还没接到总管上（最近 ' + (v.minM == null ? '?' : v.minM.toFixed(1)) + ' m > 容差 ' + TOL_M + ' m），暂无法演示水流。请把总管画到这些组的「主管节点」或主管端点附近。');
        }
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
      /* [v867] 选中态与简图版同源：切 .selected 类（白+绿双环，#tlDemoChips 同款规则
         已由 v867 扩到 #mapDemoChips），不再用内联 outline —— 视觉与「原来的圆形样式」一致。 */
      if (dots[i].classList) dots[i].classList.toggle('selected', g === active);
      else dots[i].style.outline = (g === active) ? '2px solid #1f2937' : 'none';
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

  /* [v864] 地图左栏 dock 搬移：在线地图激活时把「分组组合 · 轮灌演示」组内容搬进
     地图左栏卡片（section/sec-t 与该栏其他卡片同款，样式零新增）；离开地图按 memo
     原样搬回并隐藏卡片。[v884] 工具模式同样搬 #tlPlanBar（绘图轨在地图区块整条
     隐藏，不搬就是「切地图按钮全消失」）；#tlPlanBar 归属与 ry-cad-toolbar（v858
     工具模式搬移）靠 memo 闭环互不破坏。 */
  var dockMemo = null;   /* { pb:{parent,next}, mb:{parent,next} } */
  function ensureDock() {
    var dock = document.getElementById('mapDemoDock');
    if (dock) { dock.parentNode.style.display = ''; return dock; }
    var sec = document.getElementById('onlineMapSection');
    var side = sec ? sec.querySelector('aside.side') : null;
    if (!side) return null;
    var card = document.createElement('section');
    card.id = 'mapDemoDockCard';
    var h = document.createElement('h4');
    h.className = 'sec-t';
    h.textContent = '分组组合 · 轮灌演示';
    dock = document.createElement('div');
    dock.id = 'mapDemoDock';
    card.appendChild(h); card.appendChild(dock);
    side.appendChild(card);
    return dock;
  }
  function dockDockIn(dock) {
    if (!dockMemo) dockMemo = { pb: null, mb: null };   /* 幂等：重复 refresh 不覆盖已记原位 */
    var pb = document.getElementById('tlPlanBar');
    var mb = document.getElementById('mapDemoBar');
    /* [v884] #tlPlanBar（联合灌溉/轮播组）工具模式也搬。v858~v864 曾让绘图轨代管、
       dock 不抢 —— 但绘图轨只在绘图区块显示（ry-cad-vp 门控，VPS 不含
       onlineMapSection）⇒ 切到在线地图整条轨 display:none，联合灌溉 chips 全部
       消失（用户实测「切地图后按钮就没有了」）。地图页统一归 dock 管，离开按
       memo 原样搬回；ry-cad-toolbar 的 moveDemoIn/back 加了 #mapDemoDock 守卫
       （dock 持有期间轨不抢不拽），两边 memo 各自闭环不冲突。 */
    if (pb && pb.parentNode !== dock) {
      dockMemo.pb = { parent: pb.parentNode, next: pb.nextSibling };
      dock.appendChild(pb);
    }
    if (mb && mb.parentNode !== dock) {
      dockMemo.mb = { parent: mb.parentNode, next: mb.nextSibling };
      dock.appendChild(mb);   /* mb 在 pb 之后：先搬 pb 再搬 mb，顺序即组内顺序 */
    }
  }
  function dockDockBack(dock) {
    if (!dockMemo) return;
    var m = dockMemo; dockMemo = null;
    var pb = document.getElementById('tlPlanBar');
    if (pb && pb.parentNode === dock && m.pb && m.pb.parent && m.pb.parent.parentNode) {
      var ref1 = (m.pb.next && m.pb.next.parentNode === m.pb.parent) ? m.pb.next : null;
      m.pb.parent.insertBefore(pb, ref1);
    }
    var mb = document.getElementById('mapDemoBar');
    if (mb && mb.parentNode === dock && m.mb && m.mb.parent && m.mb.parent.parentNode) {
      var ref2 = (m.mb.next && m.mb.next.parentNode === m.mb.parent) ? m.mb.next : null;
      m.mb.parent.insertBefore(mb, ref2);
    }
    var card = document.getElementById('mapDemoDockCard');
    if (card) card.style.display = 'none';
  }

  /* 刷新：地图页激活且数据可拾取 ⇒ 显示面板 + 重建 chips；否则隐藏并清层。
     规划简图演示条（#tlDemoBar）在地图页隐藏（两套演示不同画布）。 */
  function refresh() {
    var bar = document.getElementById('mapDemoBar');
    if (!bar || !ctx) return;
    var onMap = !!(ctx.isMapActive && ctx.isMapActive());
    if (!onMap) {
      bar.style.display = 'none';
      var dock0 = document.getElementById('mapDemoDock');
      if (dock0) dockDockBack(dock0);
      if (active != null || playing) stop();
      var tb0 = document.getElementById('tlDemoBar');
      if (tb0 && window.__tlDemoGroup == null && !tb0.__keepHidden) tb0.style.display = '';
      return;
    }
    var dock = ensureDock();
    if (dock) dockDockIn(dock);
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
    VERSION: 'v917-workspace-nodes',
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
    groupOf: groupOf, groupCount: groupCount, validateConnection: validateConnection,
    entrancesOf: entrancesOf, collectWorkspaceNodes: collectWorkspaceNodes
  };
})(window);
