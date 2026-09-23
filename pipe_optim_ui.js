/* ============================================================================
 * [NEW MODULE: pipe_optim]  pipe_optim_ui.js  ——  管网优化详细分析（隔离 UI 模块）
 * ----------------------------------------------------------------------------
 * 隔离原则（严格遵守，绝不触碰原站业务代码）：
 *   · 全部逻辑封装在独立命名空间 window.PipeOptim 内；不引用、不修改原站任何
 *     全局变量 / 函数 / DOM 结构（除「运行时追加一个导航按钮 + 注入弹窗」外）。
 *   · 读取原站数据一律【深拷贝】为本地副本（JSON.parse(JSON.stringify())），
 *     与原站对象【零引用共享】，只读使用；本模块【绝不写回】任何原站数据。
 *   · 本文件被 try/catch 全程包裹，任何异常只影响本模块，绝不影响原站功能。
 *
 * 与原站的唯二交互（均不修改原业务逻辑）：
 *   1) 在顶部导航 .fn-inner[data-ry-fnnav] 末尾追加一个按钮【管网优化详细分析】
 *      —— 该按钮【不带】data-ry-navitem 属性，因此原 runye-nav.js 的 render()
 *         清理逻辑不会移除它（render 只删带 data-ry-navitem 的节点）。零侵入。
 *   2) 向 <head> 注入本模块样式 <link>（不改动原 index.html 的 <head> 源码）。
 *
 * 一键卸载：删除 index.html 中标记行
 *     <!-- [NEW MODULE: pipe_optim] 入口 --> <script src="pipe_optim_ui.js"></script>
 *   并删除本文件、pipe_optim.css、irr_optim.js、管网优化模块说明.md 即可；
 *   原站功能与导航完全恢复原状。
 * ========================================================================== */
(function (global) {
  'use strict';

  var PipeOptim = {};
  var OVERLAY_ID = 'poOverlay';
  var lastBest = null;       // 最近一次最优方案（供导出）
  var overlayEl = null;

  /* ---------- 默认管径目录（SDR11 PE100，内直径/参考单价 元·m⁻¹，占位价，可自行替换）---------- */
  var DEFAULT_CATALOG = [
    { dn: 20,  din: 0.0164, price: 2.5 },
    { dn: 25,  din: 0.0204, price: 3.5 },
    { dn: 32,  din: 0.0262, price: 5.0 },
    { dn: 40,  din: 0.0326, price: 7.5 },
    { dn: 50,  din: 0.0408, price: 11 },
    { dn: 63,  din: 0.0514, price: 17 },
    { dn: 75,  din: 0.0612, price: 24 },
    { dn: 90,  din: 0.0734, price: 33 },
    { dn: 110, din: 0.0898, price: 50 },
    { dn: 125, din: 0.1020, price: 65 },
    { dn: 160, din: 0.1308, price: 110 },
    { dn: 200, din: 0.1636, price: 170 }
  ];

  /* ---------- 工具 ---------- */
  function num(v) {
    if (v == null) return NaN;
    if (typeof v === 'number') return v;
    var m = String(v).replace(/[^\d.\-]/g, '');
    var n = parseFloat(m);
    return isNaN(n) ? NaN : n;
  }
  function $(id) { return document.getElementById(id); }

  /* ========================================================================
   * 1) 只读数据提取（深拷贝，零引用共享）
   * ===================================================================== */
  function readSource() {
    var out = { ok: false, reason: '', data: null, poly: [], flowModel: null, plot: null, source: null };
    var snap = (typeof global !== 'undefined') ? global.tlDiagramData : null;
    if (!snap) {
      out.reason = '未检测到三级管线图数据（window.tlDiagramData 为空）。请先在「三级管路编辑」中生成三级管线平面图，再打开本分析。';
      return out;
    }
    // —— 深拷贝：与原站对象完全独立，只读使用，绝不写回 ——
    out.data = JSON.parse(JSON.stringify(snap));
    out.flowModel = (snap.meta && snap.meta.flowModel) ? JSON.parse(JSON.stringify(snap.meta.flowModel)) : null;
    out.plot = (snap.plot) ? { w: snap.plot.w, h: snap.plot.h } : null;
    out.source = (snap.sourcePos) ? { x: snap.sourcePos.x, y: snap.sourcePos.y } : null;

    // 地块多边形：优先 measuredPolygon / ppGetPolyPts()，回退 tlDiagramData.poly
    var poly = null;
    if (global.measuredPolygon && global.measuredPolygon.length >= 3) {
      poly = global.measuredPolygon.map(function (p) { return { x: p.x, y: p.y }; });
    } else if (typeof global.ppGetPolyPts === 'function') {
      try { poly = global.ppGetPolyPts(); } catch (e) { poly = null; }
    }
    if ((!poly || poly.length < 3) && snap.poly && snap.poly.length >= 3) {
      poly = snap.poly.map(function (p) { return { x: p.x, y: p.y }; });
    }
    out.poly = poly || [];
    out.ok = true;
    return out;
  }

  /* ========================================================================
   * 2) 由只读快照构建管网图（节点 + 管段，含层级与长度）
   * ===================================================================== */
  function buildGraph(src) {
    var data = src.data;
    var fronts = data.frontPipe ? [data.frontPipe] : [];
    var mains = data.mainPipes || [];
    var branches = data.branchPipes || [];

    var fm = src.flowModel || {};
    var combined_m3h = num(fm.combinedFlow);
    if (isNaN(combined_m3h) || combined_m3h <= 0) {
      // 回退：用支管数估算
      combined_m3h = (branches.length || 1) * (isNaN(num(fm.branchFlow)) ? 8 : num(fm.branchFlow));
    }
    var branch_m3h = num(fm.branchFlow);
    if (isNaN(branch_m3h) || branch_m3h <= 0) {
      branch_m3h = combined_m3h / Math.max(1, (branches.length || 1));
    }
    var combinedS = combined_m3h / 3600;   // m³/s
    var branchS = branch_m3h / 3600;

    var nodes = {};
    var nodeSeq = 0;
    function nodeAt(x, y) {
      var key = Math.round(x * 100) / 100 + ',' + Math.round(y * 100) / 100;
      if (nodes[key]) return nodes[key].id;
      var id = 'n' + (nodeSeq++);
      nodes[key] = { id: id, x: x, y: y };
      return id;
    }

    var sourceId = src.source ? nodeAt(src.source.x, src.source.y) : null;
    var edges = [];
    var edgeSeq = 0;
    function addPolyline(line, tier, flow) {
      if (!line || line.length < 2) return;
      var prev = nodeAt(line[0].x, line[0].y);
      for (var i = 1; i < line.length; i++) {
        var cur = nodeAt(line[i].x, line[i].y);
        var L = Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y);
        edges.push({ id: tier.charAt(0) + (edgeSeq++), tier: tier, from: prev, to: cur, length: L, flow: flow });
        prev = cur;
      }
    }

    fronts.forEach(function (l) { addPolyline(l, 'front', combinedS); });
    mains.forEach(function (l) { addPolyline(l, 'main', combinedS); });
    branches.forEach(function (l) { addPolyline(l, 'branch', branchS); });

    // 水源 / 根节点处理（健壮性）：
    //  · 若提供了 sourcePos：把水源节点接到总管(front)起点（未重合时补一段连接管）
    //  · 若未提供 sourcePos 或无声源：以总管/主管起点作为水源入口，
    //    保证 BFS 有根（否则全节点压力=扬程、恒可行，结果无意义）
    var allFronts = edges.filter(function (e) { return e.tier === 'front'; });
    if (!sourceId) {
      var inlet = allFronts[0] || edges.filter(function (e) { return e.tier === 'main'; })[0];
      if (inlet) sourceId = inlet.from;
    } else if (allFronts.length) {
      var f0b = allFronts[0];
      if (f0b.from !== sourceId) {
        var kf = keyOf(nodes, f0b.from);
        var sx = nodes[kf].x, sy = nodes[kf].y;
        var Ls = src.source ? Math.hypot(sx - src.source.x, sy - src.source.y) : 0;
        if (Ls > 0.05) edges.push({ id: 'f' + (edgeSeq++), tier: 'front', from: sourceId, to: f0b.from, length: Ls, flow: combinedS });
      }
    }

    var nodeArr = [];
    for (var k in nodes) if (nodes.hasOwnProperty(k)) nodeArr.push(nodes[k]);
    return {
      nodes: nodeArr, edges: edges, sourceId: sourceId,
      flows: { combinedS: combinedS, branchS: branchS, combined_m3h: combined_m3h, branch_m3h: branch_m3h }
    };
  }
  function keyOf(nodes, id) {
    for (var k in nodes) if (nodes[k].id === id) return k;
    return null;
  }

  /* ========================================================================
   * 3) 生成三套拓扑：梳型(comb) / 丰型(abundant) / π型(pi)
   *    —— 全部基于同一只读图的派生，互不影响；参数假设见模块说明文档。
   * ===================================================================== */
  function cloneEdge(e, newId) { return { id: newId, tier: e.tier, from: e.from, to: e.to, length: e.length, flow: e.flow }; }

  function generateTopologies(graph) {
    var edges = graph.edges;
    var combinedS = graph.flows.combinedS;

    // 梳型：原样（主管满载 combinedS）
    var comb = edges.map(function (e, i) { return cloneEdge(e, 'c' + i); });

    // 丰型：主管并行双管（2× 管长，各半流量 combinedS/2）—— 冗余丰水布置
    var abSeq = 0, abundant = [];
    edges.forEach(function (e) {
      if (e.tier === 'main') {
        abundant.push(cloneEdge(e, 'a' + (abSeq++))); abundant[abundant.length - 1].flow = combinedS / 2;
        abundant.push(cloneEdge(e, 'a' + (abSeq++))); abundant[abundant.length - 1].flow = combinedS / 2;
      } else {
        abundant.push(cloneEdge(e, 'a' + (abSeq++)));
      }
    });

    // π型：主管双端供水（流量对半）+ 闭合回流段，构成环路；管长≈主管+闭合段
    var piSeq = 0, pi = [];
    var mainEdges = edges.filter(function (e) { return e.tier === 'main'; });
    edges.forEach(function (e) {
      if (e.tier === 'main') { var c2 = cloneEdge(e, 'p' + (piSeq++)); c2.flow = combinedS / 2; pi.push(c2); }
      else pi.push(cloneEdge(e, 'p' + (piSeq++)));
    });
    if (mainEdges.length) {
      var mFirst = mainEdges[0], mLast = mainEdges[mainEdges.length - 1];
      var aNode = graph.nodes.filter(function (n) { return n.id === mFirst.from; })[0];
      var bNode = graph.nodes.filter(function (n) { return n.id === mLast.to; })[0];
      if (aNode && bNode) {
        var Lc = Math.hypot(bNode.x - aNode.x, bNode.y - aNode.y);
        pi.push({ id: 'p' + (piSeq++), tier: 'main', from: aNode.id, to: bNode.id, length: Lc, flow: combinedS / 2 });
      }
    }

    return [
      { name: '梳型 comb', nodes: graph.nodes, sourceId: graph.sourceId, edges: comb },
      { name: '丰型 abundant', nodes: graph.nodes, sourceId: graph.sourceId, edges: abundant },
      { name: 'π型 pi', nodes: graph.nodes, sourceId: graph.sourceId, edges: pi }
    ];
  }

  /* ========================================================================
   * 4) 优化引擎加载（懒加载 irr_optim.js；opt-in wasm）
   * ===================================================================== */
  function ensureOptimizer() {
    if (global.IrrOptim) return Promise.resolve(true);
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'irr_optim.js';
      s.onload = function () { resolve(true); };
      s.onerror = function () { reject(new Error('irr_optim.js 加载失败')); };
      document.head.appendChild(s);
    });
  }

  /* ========================================================================
   * 5) 读取配置面板
   * ===================================================================== */
  function readConfig() {
    function v(id, d) { var el = $(id); var n = el ? num(el.value) : NaN; return isNaN(n) ? d : n; }
    return {
      population: v('poPop', 40),
      iterations: v('poIter', 120),
      headLower: v('poHeadLow', 10),
      vMax: v('poVmax', 2.5),
      sourceHead: v('poHead', 30),
      cHW: v('poC', 150),
      penalty: 1e5,
      catalog: DEFAULT_CATALOG
    };
  }

  /* ========================================================================
   * 6) 执行分析
   * ===================================================================== */
  function runAnalysis() {
    try {
      setStatus('正在读取当前工程管网数据（只读深拷贝）…');
      var src = readSource();
      if (!src.ok) { setStatus(src.reason, true); clearResults(); return; }
      var graph = buildGraph(src);
      if (!graph.edges.length) { setStatus('未从三级管线图提取到管段，请确认已生成管线平面图。', true); clearResults(); return; }

      ensureOptimizer().then(function () {
        if (!global.IrrOptim) { setStatus('优化引擎加载失败。', true); return; }
        setStatus('Jaya 群智能优化中（3 套拓扑 × ' + readConfig().iterations + ' 迭代）…');
        // 用 setTimeout 让状态文本先渲染
        setTimeout(function () {
          try {
            var topos = generateTopologies(graph);
            var cfg = readConfig();
            var results = topos.map(function (t) {
              var r;
              try { r = global.IrrOptim.optimize({ topology: t, config: cfg }); }
              catch (e) { r = { name: t.name, feasible: false, error: String(e && e.message || e) }; }
              return r;
            });
            renderResults(src, graph, results, cfg);
            setStatus('分析完成。下表为三套拓扑造价与可行性对比；最优可行方案已高亮。');
          } catch (e) {
            setStatus('分析过程出错：' + (e && e.message || e), true);
          }
        }, 30);
      }).catch(function (e) {
        setStatus('优化引擎加载失败：' + (e && e.message || e), true);
      });
    } catch (e) {
      setStatus('模块运行异常（不影响原站）：' + (e && e.message || e), true);
    }
  }

  /* ========================================================================
   * 7) 渲染结果
   * ===================================================================== */
  function renderResults(src, graph, results, cfg) {
    lastBest = null;
    // 选最优：优先可行解中造价最低；若无可行解，取造价最低者并标注不可行
    var feasible = results.filter(function (r) { return r.feasible; });
    var pool = feasible.length ? feasible : results;
    pool.forEach(function (r) { if (!lastBest || r.totalCost < lastBest.totalCost) lastBest = r; });

    var html = '';
    // —— 三方案对比表 ——
    html += '<div class="po-section-title">三套拓扑方案对比</div>';
    html += '<table class="po-table"><thead><tr>'
      + '<th>拓扑方案</th><th>管材总长(m)</th><th>总投资(元)</th><th>单位管长造价(元/m)</th>'
      + '<th>最不利压力(m)</th><th>最大水头损失(m)</th><th>最大流速(m/s)</th><th>可行性</th></tr></thead><tbody>';
    results.forEach(function (r) {
      var totalLen = r.edgeResults ? r.edgeResults.reduce(function (s, e) { return s + e.length; }, 0) : 0;
      var unit = totalLen > 0 ? (r.totalCost / totalLen) : 0;
      var isBest = (lastBest && r.name === lastBest.name);
      html += '<tr' + (isBest ? ' class="po-best"' : '') + '>'
        + '<td>' + r.name + (isBest ? ' ★' : '') + '</td>'
        + '<td>' + fmt(totalLen) + '</td>'
        + '<td>' + fmt(r.totalCost) + '</td>'
        + '<td>' + fmt(unit) + '</td>'
        + '<td>' + (r.worstPressure != null ? fmt(r.worstPressure) : '—') + '</td>'
        + '<td>' + (r.maxHeadLoss != null ? fmt(r.maxHeadLoss) : '—') + '</td>'
        + '<td>' + (r.maxVelocity != null ? fmt(r.maxVelocity) : '—') + '</td>'
        + '<td class="' + (r.feasible ? '' : 'po-bad') + '">' + (r.feasible ? '✓ 可行' : '✗ 不可行') + '</td>'
        + '</tr>';
    });
    html += '</tbody></table>';

    if (lastBest && lastBest.edgeResults) {
      // —— 最优方案逐管段推荐管径 ——
      html += '<div class="po-section-title">最优方案 · 逐管段推荐管径（' + lastBest.name + '）</div>';
      html += '<div class="po-scheme-scroll"><table class="po-table po-scheme-table"><thead><tr>'
        + '<th>管段</th><th>层级</th><th>管长(m)</th><th>流量(m³/h)</th><th>推荐 DN</th><th>流速(m/s)</th><th>水头损失(m)</th><th>单段造价(元)</th></tr></thead><tbody>';
      lastBest.edgeResults.forEach(function (e) {
        var tCls = e.tier === 'main' ? 'po-tier-main' : (e.tier === 'branch' ? 'po-tier-branch' : 'po-tier-front');
        html += '<tr>'
          + '<td>' + e.id + '</td>'
          + '<td class="' + tCls + '">' + tierName(e.tier) + '</td>'
          + '<td>' + fmt(e.length) + '</td>'
          + '<td>' + fmt(e.flow * 3600) + '</td>'
          + '<td><b>DN' + e.dn + '</b></td>'
          + '<td>' + fmt(e.velocity) + '</td>'
          + '<td>' + fmt(e.headloss) + '</td>'
          + '<td>' + fmt(e.cost) + '</td>'
          + '</tr>';
      });
      html += '</tbody></table></div>';

      // —— 节点压力分布图 ——
      html += '<div class="po-section-title">节点压力分布（红线=最不利压力下限 ' + fmt(cfg.headLower) + ' m）</div>';
      html += renderPressureBars(lastBest, cfg);
    } else if (results[0] && results[0].error) {
      html += '<div class="po-empty">优化未产出结果：' + results[0].error + '</div>';
    }

    $('poResults').innerHTML = html;
    var expBtn = $('poExport');
    if (expBtn) expBtn.disabled = !(lastBest && lastBest.edgeResults);
  }

  function renderPressureBars(res, cfg) {
    var np = res.nodePressures || {};
    var ids = Object.keys(np);
    if (!ids.length) return '<div class="po-empty">无节点压力数据</div>';
    var maxP = cfg.sourceHead || 30;
    // 节点较多时只展示最不利（压力最低）的 40 个，避免过长
    ids.sort(function (a, b) { return np[a] - np[b]; });
    var shown = ids.slice(0, 40);
    var html = '<div class="po-bars">';
    shown.forEach(function (id) {
      var p = np[id];
      var pct = Math.max(0, Math.min(100, (p / maxP) * 100));
      var below = p < cfg.headLower;
      html += '<div class="po-bar-row' + (below ? ' po-below' : '') + '">'
        + '<span class="po-bar-label">' + id + '</span>'
        + '<span class="po-bar-track"><span class="po-bar-fill" style="width:' + pct.toFixed(1) + '%"></span></span>'
        + '<span class="po-bar-val">' + fmt(p) + ' m</span>'
        + '</div>';
    });
    html += '</div>';
    if (ids.length > shown.length) html += '<div class="po-foot-note">仅展示压力最低的 ' + shown.length + ' / ' + ids.length + ' 个节点。</div>';
    return html;
  }

  function tierName(t) { return t === 'main' ? '主管' : (t === 'branch' ? '支管' : '总管'); }
  function fmt(x) { if (x == null || isNaN(x)) return '—'; return (Math.round(x * 100) / 100).toFixed(2); }
  function setStatus(msg, isErr) { var el = $('poStatus'); if (el) { el.textContent = msg; el.className = 'po-status' + (isErr ? ' po-err' : ''); } }
  function clearResults() { var el = $('poResults'); if (el) el.innerHTML = ''; var expBtn = $('poExport'); if (expBtn) expBtn.disabled = true; }

  /* ========================================================================
   * 8) 导出最优方案 JSON（只读导出的结果，需人工核对后手动回填，绝不自动覆盖）
   * ===================================================================== */
  function exportJSON() {
    if (!lastBest || !lastBest.edgeResults) return;
    var payload = {
      module: 'pipe_optim', version: '1.0.0', generatedAt: new Date().toISOString(),
      readOnly: true,
      note: '本结果为只读分析导出，需人工核对后手动回填原系统，模块不会自动覆盖任何原站数据。',
      optimalScheme: lastBest.name,
      summary: { totalCost: lastBest.totalCost, worstPressure: lastBest.worstPressure, maxHeadLoss: lastBest.maxHeadLoss, maxVelocity: lastBest.maxVelocity, feasible: lastBest.feasible },
      recommendedDN: lastBest.dns,
      edgeDetails: lastBest.edgeResults.map(function (e) {
        return { id: e.id, tier: e.tier, dn: e.dn, length: e.length, flow_m3h: e.flow * 3600, velocity: e.velocity, headloss: e.headloss, cost: e.cost };
      }),
      nodePressures: lastBest.nodePressures
    };
    try {
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = '管网优化方案_' + lastBest.name.replace(/\s/g, '') + '_' + Date.now() + '.json';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) { setStatus('导出失败：' + (e && e.message || e), true); }
  }

  /* ========================================================================
   * 9) 弹窗 DOM（运行时注入，不改动原 index.html）
   * ===================================================================== */
  function buildOverlay() {
    var ov = document.createElement('div');
    ov.className = 'po-overlay';
    ov.id = OVERLAY_ID;
    ov.style.display = 'none';
    ov.innerHTML =
      '<div class="po-dialog" role="dialog" aria-label="管网优化详细分析">'
      + '<div class="po-header"><h2>管网优化详细分析 · Jaya 群智能</h2><button class="po-close" id="poClose" type="button" aria-label="关闭">×</button></div>'
      + '<div class="po-body">'
      + '<p class="po-hint">本模块为<b>只读分析</b>：仅读取当前已生成的三级管线图数据（window.tlDiagramData 等），<b>绝不写回</b>原管网/地块参数。优化结果仅供比选参考，应用前请用原「水力计算器」复核。</p>'
      + '<div class="po-config">'
      + field('poPop', '种群规模', '40') + field('poIter', '迭代次数', '120') + field('poHeadLow', '最不利压力下限(m)', '10')
      + field('poVmax', '流速上限(m/s)', '2.5') + field('poHead', '水源扬程(m)', '30') + field('poC', 'Hazen-Williams C', '150')
      + '</div>'
      + '<div class="po-actions">'
      + '<button class="po-btn po-btn-primary" id="poRun" type="button">读取并分析</button>'
      + '<button class="po-btn po-btn-ghost" id="poExport" type="button" disabled>导出最优方案 JSON</button>'
      + '</div>'
      + '<div class="po-status" id="poStatus"></div>'
      + '<div id="poResults"></div>'
      + '<div class="po-foot-note">三拓扑假设：梳型=主管满载单管；丰型=主管并行双管（冗余，各半流量）；π型=主管双端供水成环（各半流量+闭合段）。水头损失采用 Hazen-Williams（PE，C=150），优化目标=最小化管材造价，约束=最不利压力≥下限且流速≤上限。管径目录单价为占位价，请替换为实际报价。</div>'
      + '</div></div>';
    document.body.appendChild(ov);

    ov.addEventListener('click', function (e) { if (e.target === ov) closeDialog(); });
    $('poClose').addEventListener('click', closeDialog);
    $('poRun').addEventListener('click', runAnalysis);
    $('poExport').addEventListener('click', exportJSON);
    return ov;
  }
  function field(id, label, val) {
    return '<div class="po-field"><label for="' + id + '">' + label + '</label><input id="' + id + '" type="number" value="' + val + '" step="any"></div>';
  }

  function openDialog() {
    try {
      if (!overlayEl) overlayEl = buildOverlay();
      overlayEl.style.display = 'flex';
    } catch (e) { /* 隔离：异常不影响原站 */ }
  }
  function closeDialog() { if (overlayEl) overlayEl.style.display = 'none'; }

  /* ========================================================================
   * 10) 注入样式 <link>（不改动原 <head> 源码）
   * ===================================================================== */
  function injectCss() {
    if (document.getElementById('poCss')) return;
    var link = document.createElement('link');
    link.id = 'poCss';
    link.rel = 'stylesheet';
    link.href = 'pipe_optim.css';
    document.head.appendChild(link);
  }

  /* ========================================================================
   * 11) 注入导航按钮（零侵入：不带 data-ry-navitem，原 render 不会清除）
   * ===================================================================== */
  function injectNavButton() {
    var nav = document.querySelector('.fn-inner[data-ry-fnnav]') || document.querySelector('[data-ry-fnnav]');
    if (!nav) return false;
    if (nav.querySelector('[data-ry-pipeoptim]')) return true; // 已注入
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fn-link';                 // 复用原导航皮肤
    btn.setAttribute('data-ry-pipeoptim', '1'); // 关键：不带 data-ry-navitem
    btn.textContent = '管网优化详细分析';
    btn.title = '管网优化详细分析（Jaya 群智能 · 只读）';
    btn.addEventListener('click', openDialog);
    nav.appendChild(btn);
    return true;
  }

  /* ========================================================================
   * 12) 初始化（DOM 就绪后注入导航按钮与样式）
   * ===================================================================== */
  function init() {
    try {
      injectCss();
      if (!injectNavButton()) {
        // 导航容器尚未出现（极端时序），等 DOMContentLoaded 再试一次
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', function () { try { injectCss(); injectNavButton(); } catch (e) { } });
        }
      }
    } catch (e) { /* 隔离：任何异常都不影响原站 */ }
  }

  PipeOptim.open = openDialog;
  PipeOptim.init = init;
  global.PipeOptim = PipeOptim;

  // 仅 Node 环境下导出内部纯函数供自动化测试（浏览器中 module 未定义，不影响隔离）
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      PipeOptim: PipeOptim,
      _test: { readSource: readSource, buildGraph: buildGraph, generateTopologies: generateTopologies, DEFAULT_CATALOG: DEFAULT_CATALOG }
    };
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
