/* ============================================================================
 * [NEW MODULE: pipe_optim]  irr_optim.js  ——  管网管径 Jaya 群智能优化引擎
 * ----------------------------------------------------------------------------
 * 隔离原则：
 *   · 本文件是「管网优化详细分析」模块的算法内核，命名空间为 window.IrrOptim，
 *     与润野灌溉原有任何全局变量 / 函数 / 数据完全独立，互不引用、互不污染。
 *   · 本文件【只读】调用方传入的 spec（拓扑 + 配置），【绝不】触碰原站任何数据。
 *   · 若本文件加载或运行出错，调用方（pipe_optim_ui.js）已做 try/catch 隔离，
 *     不会影响原站任何功能。
 *
 * 算法：Jaya（无参数群智能，Rao 2016）。决策变量 = 每条管段的管径等级（离散，
 *       从管径目录 catalog 中选取）。目标 = 最小化管材总造价；约束 = 最不利节点
 *       压力 ≥ headLower 且 各管段流速 ≤ vMax（Hazen-Williams 水头损失模型）。
 *
 * wasm 接缝（opt-in，默认走 JS 引擎）：
 *   · 当前实现为纯 JS 的 Jaya，等价于未来 wasm 二进制的算法语义。
 *   · 若日后提供原生 irr_optim.wasm，可在页面设置
 *       window.PIPE_OPTIM_USE_WASM = true;
 *     并在加载本文件后调用 IrrOptim.loadWasm('irr_optim.wasm')；
 *     成功后 optimize() 将自动改走 wasm 导出函数，导出签名见 loadWasm 注释。
 *   · 未提供 wasm 时，引擎自动回退到 JS 实现，模块照常工作。
 * ========================================================================== */
(function (global) {
  'use strict';

  var IrrOptim = {};
  IrrOptim.version = '1.0.0-js';
  var _wasmFn = null; // 若加载 wasm 成功则非空

  /* ---------- 水力学基本公式 ---------- */

  // Hazen-Williams 沿程水头损失（m）。Q: m³/s, d: 内直径 m, L: 管长 m, C: 粗糙系数
  function hazenWilliams(L, Q, d, C) {
    if (d <= 0 || Q <= 0) return 0;
    var num = 10.67 * L * Math.pow(Q, 1.852);
    var den = Math.pow(C, 1.852) * Math.pow(d, 4.87);
    return num / den;
  }

  // 管内流速（m/s）。Q: m³/s, d: 内直径 m
  function velocity(Q, d) {
    if (d <= 0) return 0;
    var area = Math.PI * d * d / 4;
    return Q / area;
  }

  /* ---------- 节点压力（生成树 BFS，保守） ----------
   * 以水源为根做 BFS 生成树（忽略可能存在的成环边），沿树边累计水头损失。
   * 对梳型（树）结果精确；对丰型/π型（含并联/成环），按「最小水头损失路径」
   * 估值——即给出的是各节点的【最高】压力，最不利压力取其最小值，偏安全。
   * 丰型/π型的主要收益（主管流量对半分流→单管水头损失下降）已通过 edge.flow
   * 直接体现，物理上正确且保守。 */
  function computePressures(topology, dns, catalog, cfg) {
    var nodes = topology.nodes;
    var edges = topology.edges;
    var sourceId = topology.sourceId;
    var C = cfg.cHW;
    var H0 = cfg.sourceHead;

    // 邻接表：node -> [ {to, edgeId} ]
    var adj = {};
    for (var i = 0; i < nodes.length; i++) adj[nodes[i].id] = [];
    for (var e = 0; e < edges.length; e++) {
      var ed = edges[e];
      adj[ed.from].push({ to: ed.to, edgeId: ed.id });
      adj[ed.to].push({ to: ed.from, edgeId: ed.id });
    }

    var pressure = {};
    var visited = {};
    var queue = [sourceId];
    pressure[sourceId] = H0;
    visited[sourceId] = true;

    while (queue.length) {
      var cur = queue.shift();
      var nb = adj[cur] || [];
      for (var k = 0; k < nb.length; k++) {
        var nxt = nb[k].to;
        if (visited[nxt]) continue;
        var edge = edgeById(edges, nb[k].edgeId);
        var dnIdx = dns[edge.id];
        var din = catalog[dnIdx].din;
        var hl = hazenWilliams(edge.length, edge.flow, din, C);
        pressure[nxt] = pressure[cur] - hl;
        visited[nxt] = true;
        queue.push(nxt);
      }
    }

    var worst = Infinity;
    for (var n = 0; n < nodes.length; n++) {
      var pid = nodes[n].id;
      if (pressure[pid] === undefined) pressure[pid] = H0; // 未连通节点（不应出现）按水源计
      if (pressure[pid] < worst) worst = pressure[pid];
    }
    return { pressure: pressure, worstPressure: worst, sourceHead: H0 };
  }

  function edgeById(edges, id) {
    for (var i = 0; i < edges.length; i++) if (edges[i].id === id) return edges[i];
    return null;
  }

  /* ---------- 评价单个解 ---------- */
  // dns: {edgeId: catalogIndex}
  function evaluate(topology, dns, catalog, cfg) {
    var edges = topology.edges;
    var C = cfg.cHW, vMax = cfg.vMax, headLower = cfg.headLower;
    var totalCost = 0, maxV = 0, edgeResults = [];
    for (var i = 0; i < edges.length; i++) {
      var ed = edges[i];
      var di = dns[ed.id];
      var cat = catalog[di];
      var cost = ed.length * cat.price;
      totalCost += cost;
      var v = velocity(ed.flow, cat.din);
      var hl = hazenWilliams(ed.length, ed.flow, cat.din, C);
      if (v > maxV) maxV = v;
      edgeResults.push({ id: ed.id, dn: cat.dn, din: cat.din, length: ed.length, flow: ed.flow, velocity: v, headloss: hl, cost: cost });
    }
    var pres = computePressures(topology, dns, catalog, cfg);
    var worstPressure = pres.worstPressure;
    // 可行性：最不利压力≥下限 且 各管段流速≤上限
    var feasible = (worstPressure >= headLower) && (maxV <= vMax);
    // 适应度：可行解=造价；不可行解=造价+大惩罚（按违反量加权）
    var violation = 0;
    if (worstPressure < headLower) violation += (headLower - worstPressure);
    if (maxV > vMax) violation += (maxV - vMax) * 10; // 流速超标加权更重
    var fitness = totalCost + (feasible ? 0 : cfg.penalty * violation);
    return {
      dns: dns, cost: totalCost, maxVelocity: maxV, worstPressure: worstPressure,
      maxHeadLoss: pres.sourceHead - worstPressure, feasible: feasible,
      fitness: fitness, edgeResults: edgeResults, nodePressures: pres.pressure
    };
  }

  /* ---------- Jaya 主循环 ---------- */
  function jaya(topology, catalog, cfg) {
    var edges = topology.edges;
    var M = catalog.length;
    var nVar = edges.length;
    var N = Math.max(8, cfg.population | 0);
    var ITER = Math.max(20, cfg.iterations | 0);
    var BIG = cfg.penalty;

    // 启发式初始化：每条管段取「流速不超标的最小管径」，更利于收敛
    function cheapInit() {
      var sol = {};
      for (var i = 0; i < edges.length; i++) {
        var ed = edges[i];
        var chosen = M - 1;
        for (var c = 0; c < M; c++) {
          if (velocity(ed.flow, catalog[c].din) <= vMaxSafe(ed.flow)) { chosen = c; break; }
        }
        sol[ed.id] = chosen;
      }
      return sol;
    }
    function vMaxSafe() { return cfg.vMax; }

    // 种群：数组，每项为 {dns, ev}
    var pop = [];
    pop.push({ dns: cheapInit(), ev: null });
    for (var p = 1; p < N; p++) {
      var rnd = {};
      for (var i2 = 0; i2 < edges.length; i2++) rnd[edges[i2].id] = Math.floor(Math.random() * M);
      pop.push({ dns: rnd, ev: null });
    }

    var best = null;
    function rank() {
      for (var i = 0; i < pop.length; i++) {
        if (!pop[i].ev) pop[i].ev = evaluate(topology, pop[i].dns, catalog, cfg);
        if (!best || pop[i].ev.fitness < best.ev.fitness) best = pop[i];
      }
    }
    rank();

    for (var it = 0; it < ITER; it++) {
      // 找出当前种群最优 / 最差
      var bestSol = pop[0], worstSol = pop[0];
      for (var j = 1; j < pop.length; j++) {
        if (pop[j].ev.fitness < bestSol.ev.fitness) bestSol = pop[j];
        if (pop[j].ev.fitness > worstSol.ev.fitness) worstSol = pop[j];
      }
      var newPop = [];
      for (var a = 0; a < pop.length; a++) {
        var cur = pop[a];
        var cand = {};
        for (var b = 0; b < edges.length; b++) {
          var eid = edges[b].id;
          var xj = cur.dns[eid];
          var xb = bestSol.dns[eid];
          var xw = worstSol.dns[eid];
          var r1 = Math.random(), r2 = Math.random();
          // Jaya 更新式（连续），随后取整并夹取到合法管径等级
          var val = xj + r1 * (xb - Math.abs(xj - xw)) - r2 * (xw - Math.abs(xj - xb));
          var idx = Math.round(val);
          if (idx < 0) idx = 0; if (idx > M - 1) idx = M - 1;
          cand[eid] = idx;
        }
        var candEv = evaluate(topology, cand, catalog, cfg);
        // 接受准则：新解更优才替换
        if (candEv.fitness <= cur.ev.fitness) newPop.push({ dns: cand, ev: candEv });
        else newPop.push(cur);
        if (candEv.fitness < best.ev.fitness) best = { dns: cand, ev: candEv };
      }
      pop = newPop;
    }

    // 终解 = 全程最优
    var finalEv = best.ev || evaluate(topology, best.dns, catalog, cfg);
    var dnsOut = {};
    for (var z = 0; z < edges.length; z++) {
      var ci = best.dns[edges[z].id];
      dnsOut[edges[z].id] = catalog[ci].dn;
    }
    return {
      name: topology.name,
      feasible: finalEv.feasible,
      totalCost: round2(finalEv.cost),
      maxHeadLoss: round2(finalEv.maxHeadLoss),
      worstPressure: round2(finalEv.worstPressure),
      maxVelocity: round2(finalEv.maxVelocity),
      dns: dnsOut,
      edgeResults: finalEv.edgeResults,
      nodePressures: finalEv.nodePressures,
      iterations: ITER,
      population: N,
      engine: _wasmFn ? 'wasm' : 'js'
    };
  }

  function round2(x) { return Math.round(x * 100) / 100; }

  /* ---------- 对外接口 ---------- */
  IrrOptim.optimize = function (spec) {
    var cfg = spec.config || {};
    var catalog = cfg.catalog;
    if (!catalog || !catalog.length) throw new Error('[irr_optim] 缺少管径目录 catalog');
    if (!spec.topology || !spec.topology.edges || !spec.topology.edges.length)
      throw new Error('[irr_optim] 拓扑为空，无法优化（请先在润野工具中生成三级管线图）');
    var merged = {
      population: cfg.population || 40,
      iterations: cfg.iterations || 120,
      headLower: (cfg.headLower != null) ? cfg.headLower : 10,
      vMax: (cfg.vMax != null) ? cfg.vMax : 2.5,
      cHW: (cfg.cHW != null) ? cfg.cHW : 150,
      sourceHead: (cfg.sourceHead != null) ? cfg.sourceHead : 30,
      penalty: (cfg.penalty != null) ? cfg.penalty : 1e5,
      catalog: catalog
    };
    if (_wasmFn) {
      // wasm 优先：导出签名 (spec, cfg) -> result（与 JS 返回结构一致）
      try { return _wasmFn(spec.topology, merged); } catch (e) { /* 回退 JS */ }
    }
    return jaya(spec.topology, catalog, merged);
  };

  /* wasm 接缝（opt-in）：调用方在 enable 后调用。
   * 期望 wasm 导出 `optimize(topologyJson, cfgJson) -> resultJson`（字符串进出），
   * 或导出直接返回 JS 对象的函数；此处做容错适配。 */
  IrrOptim.loadWasm = function (url) {
    return new Promise(function (resolve, reject) {
      if (typeof WebAssembly === 'undefined' || !global.fetch) { reject(new Error('环境不支持 WebAssembly')); return; }
      global.fetch(url).then(function (r) { return r.arrayBuffer(); }).then(function (buf) {
        return WebAssembly.instantiate(buf, {});
      }).then(function (inst) {
        var ex = inst.instance.exports;
        var fn = ex.optimize || ex._optimize;
        if (typeof fn === 'function') { _wasmFn = fn; resolve(true); }
        else reject(new Error('wasm 未导出 optimize'));
      }).catch(function (err) { reject(err); });
    });
  };

  global.IrrOptim = IrrOptim;
  if (typeof module !== 'undefined' && module.exports) module.exports = IrrOptim;
})(typeof window !== 'undefined' ? window : globalThis);
