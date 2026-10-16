(function () {
  'use strict';
  var root = document.getElementById('hydraulicsSection');
  if (!root) return;
  var Core = window.RyHydCore;
  if (!Core) { root.querySelector('#srcCard').textContent = '计算核心加载失败（runye-hydraulics-core.js）'; return; }
  var CFG_KEY = 'runye_hydraulics_check_cfg_v1';   /* 只在用户点「校核」时写（站内约定） */
  var lastFull = null, lastNet = null, lastDesign = null;

  function $(id) { return root.querySelector('#' + id); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function f(v, n) { var x = Number(v); return isFinite(x) ? x.toFixed(n === undefined ? 3 : n) : '—'; }

  /* ---------- 参数读取 / 恢复 ---------- */
  function readOpts() {
    return {
      C: +$('pC').value || 150,
      caliber: ($('pCaliber').value || 'sdr13.6').trim(),
      localRatio: (+$('pLocal').value || 0) / 100,
      qDrip: +$('pQdrip').value || 1.38,
      dripSpacing: +$('pSpacing').value || 0.3,
      tapeID: +$('pTapeID').value || 14.2,
      dripHead: +$('pDripHead').value || 0,
      xExp: +$('pXExp').value || 0.5,
      slope: +$('pSlope').value || 0,
      tapeLen: +$('pTapeLen').value || 80,
      elev: +$('pElev').value || 0,
      headLoss: +$('pHeadLoss').value || 0,
      pumpEff: Math.min(0.9, Math.max(0.2, +$('pEff').value || 0.6)),
      vmax: +$('pVmax').value || 2,
      snapTol: +$('pSnap').value || 3,
      tapeSnapTol: +$('pTapeSnap').value || 8
    };
  }
  function saveCfg() {
    try { localStorage.setItem(CFG_KEY, JSON.stringify(readOpts())); } catch (e) { }
  }
  function restoreCfg() {
    try {
      var c = JSON.parse(localStorage.getItem(CFG_KEY) || 'null');
      if (!c) return;
      var map = { pC: 'C', pCaliber: 'caliber', pLocal: 'localRatio', pQdrip: 'qDrip', pSpacing: 'dripSpacing',
        pTapeID: 'tapeID', pDripHead: 'dripHead', pXExp: 'xExp', pSlope: 'slope', pTapeLen: 'tapeLen', pElev: 'elev',
        pHeadLoss: 'headLoss', pEff: 'pumpEff', pVmax: 'vmax', pSnap: 'snapTol', pTapeSnap: 'tapeSnapTol' };
      Object.keys(map).forEach(function (id) {
        if (c[map[id]] !== undefined) $(id).value = map[id] === 'localRatio' ? Math.round(c[map[id]] * 100) : c[map[id]];
      });
    } catch (e) { }
  }

  /* ---------- 数据源 ---------- */
  function readNet() {
    return window.RyIrrigationDataStore.readNetworkLayout();
  }
  function readDesign() {
    return window.RyIrrigationDataStore.readHydraulicDesign();
  }
  function renderSrc() {
    var net = readNet(), design = readDesign(), el = $('srcCard');
    if (design && design.version === 1 && design.geometry && design.hydraulics) {
      var g = design.geometry, h = design.hydraulics;
      el.innerHTML = '<div class="kv"><span class="k">来源</span><span class="v">三级规划最终数据</span></div>' +
        '<div class="kv"><span class="k">总管 / 主管 / 支管</span><span class="v">' +
        (g.frontPipe ? 1 : 0) + ' / ' + ((g.mainPipes || []).length) + ' / ' + ((g.branchPipes || []).length) + ' 段</span></div>' +
        '<div class="kv"><span class="k">联合设计流量</span><span class="v">' + f(h.combinedFlow, 2) + ' m³/h</span></div>' +
        '<div class="kv"><span class="k">滴灌带入口压力</span><span class="v">' + f(h.tapePressureM, 1) + ' m</span></div>' +
        '<div class="kv"><span class="k">生成时间</span><span class="v">' + (design.generatedAt || '—') + '</span></div>' +
        '<div class="kv"><span class="k">管径同步</span><span class="v">' + (design.caliberAppliedAt ? new Date(design.caliberAppliedAt).toLocaleString('zh-CN') : '未改径') + '</span></div>';
      return;
    }
    if (!net) {
      el.innerHTML = '<span style="color:var(--r-600);font-weight:700">未找到已布置管网</span><br>' +
        '<span style="font-size:11px;color:var(--s-500)">去 <a href="runye-map-measure.html">在线地图</a> 布置管网，' +
        '或回主页「生成管线图」后回来校核。</span>';
      return;
    }
    if (net.needsReplan) {
      el.innerHTML = '<span style="color:var(--a-600);font-weight:700">管网已重新划分，待回二级重新规划</span><br>' +
        '<span style="font-size:11px;color:var(--s-500)">当前无有效管段（needsReplan）。</span>';
      return;
    }
    var segs = (net.segments || []).length, tapes = (net.dripTapes || []).length;
    el.innerHTML =
      '<div class="kv"><span class="k">管段</span><span class="v">' + segs + ' 段</span></div>' +
      '<div class="kv"><span class="k">滴灌带</span><span class="v">' + tapes + ' 条</span></div>' +
      '<div class="kv"><span class="k">水源</span><span class="v">' + (net.sourcePos ? '有' : '无（自动降级）') + '</span></div>' +
      '<div class="kv"><span class="k">坐标系</span><span class="v">' + esc(net.crs || '—') + '</span></div>' +
      (net.ts ? '<div class="kv"><span class="k">生成时间</span><span class="v">' +
        new Date(net.ts).toLocaleString('zh-CN') + '</span></div>' : '');
  }

  /* 三级规划快照已经带入提升高度、地形高差、首部损失和泵效；这些输入不应看起来还会
     改变主计算。滴头参数保留给下方“代表毛管”模拟使用。 */
  function syncParameterMode(isDesign) {
    ['pElev', 'pHeadLoss', 'pEff', 'pSnap', 'pTapeSnap'].forEach(function (id) {
      var el = $(id); if (!el) return;
      el.disabled = !!isDesign;
      el.classList.toggle('mode-lock', !!isDesign);
    });
    $('paramHint').innerHTML = isDesign
      ? '<b>三级规划模式：</b>提升高度、地形高差、首部损失、泵效与管网几何已由三级规划锁定；可调整管材口径、局部损失、流速上限及代表毛管参数。'
      : '参数只在本页使用，不回写布置数据；口径与主页三级水力计算同源（hc-core/design-core）。';
  }

  /* ---------- 校核主流程 ---------- */
  function run() {
    var net = readNet();
    var design = readDesign();
    renderSrc();
    syncParameterMode(!!(design && design.version === 1));
    var opts = readOpts();
    saveCfg();
    if ((!design || design.version !== 1) && (!net || net.needsReplan || !(net.segments || []).length)) {
      $('emptyBox').style.display = '';
      $('out').style.display = 'none';
      return;
    }
    $('emptyBox').style.display = 'none';
    $('out').style.display = '';
    lastNet = net;
    lastDesign = design;
    var full = (design && design.version === 1 && Core.computeDesign) ? Core.computeDesign(design, opts) : Core.compute(net, opts);
    lastFull = full;
    if (!full.valid) {
      $('warnBox').textContent = '⛔ 无法启动水力校核：\n' + full.blockers.map(function (x) { return '• ' + x; }).join('\n') +
        '\n\n请回三级管路规划页重新生成管线图后再读取。';
      $('out').style.display = 'none';
      $('emptyBox').style.display = '';
      $('emptyBox').textContent = '当前没有可用的三级规划最终水力数据。';
      return;
    }
    try {
      var overlay = Core.mapOverlay && Core.mapOverlay(full, net);
      if (overlay) window.RyIrrigationDataStore.writeHydraulicOverlay(overlay);
    } catch (e) { }
    renderAll(full);
  }

  function kindTag(k) {
    var name = k === 'front' ? '总管' : k === 'main' ? '主管' : k === 'branch' ? '支管' : k;
    return '<span class="tag ' + esc(k) + '">' + esc(name) + '</span>';
  }

  function renderAll(full) {
    /* 告警 */
    $('warnBox').textContent = full.warnings.length ? '⚠ ' + full.warnings.join('\n⚠ ') : '';
    var isDesign = full.mode === 'design';
    $('resultBadge').textContent = isDesign ? '三级规划最终数据' : '地图布置管网';
    $('resultIntro').textContent = isDesign
      ? '按三级规划的最终几何和设计流量校核输水管网；毛管均匀度在下方以代表毛管单独估算。'
      : '从已布置的管网重建拓扑，校核逐段流量、流速、水损、最不利路径与泵组扬程。';
    $('checkScope').innerHTML = isDesign
      ? '<b>本次校核范围</b><span class="ok">已校核：总管、主管、支管至滴灌带入口。</span><br>提升高度、地形高差、首部损失和泵效取三级规划快照。<div class="limit">滴灌带带内损失不计入本页 TDH；下方仅对一条代表毛管给出 DU 估算。</div>'
      : '<b>本次校核范围</b><span class="ok">已校核：总管、主管、支管及已挂接滴灌带。</span><br>流量由滴头流量、间距和实际滴灌带长度汇总得到。<div class="limit">未挂接、孤立或成环管段会明确列为告警，不参与最不利路径。</div>';
    /* 底部状态栏 */
    var overCount = full.segRows.filter(function(r){return r.over;}).length;
    $('stAssets').textContent = '管段 ' + full.segRows.length + ' 段 / 滴灌带 ' + full.tapeRows.length + ' 条';
    $('stStatus').innerHTML = '<span class="st-ok">✓ 计算完成</span>';
    if (overCount > 0) {
      $('stWarn').style.display = '';
      $('stWarn').className = 'st-bad';
      $('stWarn').textContent = '⚠ ' + overCount + ' 段流速超标';
    } else {
      $('stWarn').style.display = 'none';
    }
    /* 汇总卡 */
    var worst = full.worst;
    $('sumGrid').innerHTML =
      sumCard('系统总流量', f(full.qTotal, 3), ' m³/h = ' + f(full.qTotal * 1000, 0) + ' L/h') + /* [v320] m³/h→L/h ×1000（原 ×3600）*/
      sumCard('最不利路径损失', worst ? f(worst.loss, 2) : '—', ' m（含滴头压力）', worst && worst.loss > 999 ? 'err' : '') +
      sumCard('需求扬程 TDH', f(full.tdh, 2), full.mode === 'design' ? ' m（三级规划入口压力口径）' : ' m（+高差 ' + f(full.opts.elev, 1) + ' +首部 ' + f(full.opts.headLoss, 1) + '）') +
      sumCard('轴功率 / 电机档', f(full.power, 2), ' kW → 选 ' + f(full.motorKw, 2) + ' kW（η=' + f(full.pumpEffUsed || full.opts.pumpEff, 2) + '）');
    function sumCard(t, n, d, cls) {
      return '<div class="sum"><div class="t">' + esc(t) + '</div><div class="n ' + (cls || '') + '">' + esc(n) +
        '<small>' + esc(d) + '</small></div></div>';
    }
    /* 拓扑行 */
    var tr = full.tree;
    $('treeLine').innerHTML = (full.mode === 'design' ? '三级规划最终管段 <b>' + tr.segs.length + '</b> 段 · ' :
      '管段 <b>' + tr.segs.length + '</b> 段（搭接切分后）· 节点 <b>' + tr.nodes.length +
      '</b> · 树内 <b>' + tr.order.length + '</b> 段' +
      (tr.loops.length ? ' · <span style="color:var(--r-600)">环 ' + tr.loops.length + '</span>' : '') +
      (tr.orphans.length ? ' · <span style="color:var(--r-600)">未连通 ' + tr.orphans.length + '</span>' : '') +
      ' · 滴灌带挂接 <b>' + full.tapeRows.filter(function (t) { return t.attached; }).length + '/' + full.tapeRows.length + '</b>');
    var count = { ok: 0, over_velocity: 0, disconnected: 0, loop: 0, no_demand: 0 };
    full.segRows.forEach(function (r) { count[r.status] = (count[r.status] || 0) + 1; });
    $('diagLine').innerHTML =
      '<b>图上状态</b>：<span style="color:#15803d">正常 ' + count.ok + '</span>　' +
      '<span style="color:#dc2626">超流速 ' + count.over_velocity + '</span>　' +
      '<span style="color:#d97706">未连通 ' + count.disconnected + '</span>　' +
      '<span style="color:#7c3aed">环网 ' + count.loop + '</span>　' +
      '<span style="color:#64748b">无需求 ' + count.no_demand + '</span><br>' +
      '<span style="color:var(--s-500)">已同步到在线地图；开启“水力状态”图层后，右键管段查看流量、流速和损失。</span>';
    /* 最不利路径 */
    if (worst) {
      $('pathLine').innerHTML = worst.path.map(function (si, i) {
        var nm = esc(tr.segs[si].name || tr.segs[si].id);
        return (i ? '<span class="arrow">→</span>' : '') + nm;
      }).join('') + '　<span style="color:var(--s-500)">路径损失 ' + f(worst.loss, 2) +
        (full.mode === 'design' ? ' m（已计入滴灌带入口压力，不计滴灌带带内损失）' :
          ' m（其中滴灌带 ' + f(worst.tapeHf, 2) + ' + 滴头压力 ' + f(full.opts.dripHead, 1) + '）') + '</span>';
    } else {
      $('pathLine').textContent = '未能构建最不利路径（拓扑为空或全部成环/孤立）。';
    }
    /* 逐段表 */
    var worstSet = {};
    if (worst) worst.path.forEach(function (si) { worstSet[si] = true; });
    var h = '<tr><th class="l">段</th><th class="l">类别</th><th>长度 m</th><th>流量 m³/h</th><th>外径 mm</th>' +
      '<th>内径 mm</th><th>流速 m/s</th><th>沿程 m</th><th>局部 m</th><th>合计 m</th></tr>';
    full.segRows.forEach(function (r, i) {
      var cls = (worstSet[r.i] ? 'worst ' : '') + (r.over ? 'over' : '');
      h += '<tr data-hydrow="' + r.i + '" class="' + cls + '"><td class="l">' + esc(r.name) + '</td><td class="l">' + kindTag(r.kind) +
        '</td><td>' + f(r.L, 1) + '</td><td>' + f(r.Q, 3) + '</td><td>' + f(r.od, 0) + '</td><td>' + f(r.idm, 1) +
        '</td><td>' + f(r.v, 2) + (r.over ? ' ⚠' : '') + '</td><td>' + f(r.hf, 3) + '</td><td>' + f(r.hloc, 3) +
        '</td><td>' + f(r.htot, 3) + '</td></tr>';
    });
    $('segTable').innerHTML = h;
    renderHydDiagram(full);
    /* 滴灌带表 */
    h = '<tr><th>带号</th><th class="l">挂接支管</th><th>带长 m</th><th>出口数 N</th><th>F 修正</th>' +
      '<th>流量 L/h</th><th>带流速 m/s</th><th>带损 m</th></tr>';
    full.tapeRows.forEach(function (t) {
      h += '<tr><td>#' + (t.idx + 1) + '</td><td class="l">' + esc(t.segName) +
        (t.attached ? '' : ' <span style="color:var(--a-600)">未挂接</span>') + '</td><td>' + f(t.len, 1) +
        '</td><td>' + t.N + '</td><td>' + f(t.F, 3) + '</td><td>' + f(t.qLh, 0) + '</td><td>' + f(t.v, 2) +
        '</td><td>' + f(t.hf, 3) + '</td></tr>';
    });
    if (!full.tapeRows.length) h = '<tr><td class="l" style="text-align:center">' +
      (full.mode === 'design' ? '本次按三级规划的滴灌带入口压力校核，未计入滴灌带多孔出流。' : '布置中无滴灌带（dripTapes 为空）') + '</td></tr>';
    $('tapeTable').innerHTML = h;
    /* ── 毛管逐滴头模拟（真实DU + 压力分布曲线） ── */
    renderLateralSim(full);
    /* 建议管径 */
    var sg = full.mode === 'design' ? null : Core.suggestOD(lastNet, full.opts);
    h = '<tr><th class="l">段</th><th class="l">类别</th><th>流量 m³/h</th><th>现外径 mm</th><th>现合计损失 m</th>' +
      '<th>建议外径 mm</th><th>新流速 m/s</th><th>新合计损失 m</th></tr>';
    if (!sg) h += '<tr><td colspan="8" class="l">三级规划结果已采用最终管径；当前先校核至滴灌带入口，管径方案可在三级规划页调整后重新生成。</td></tr>';
    (sg ? sg.rows : []).forEach(function (r) {
      h += '<tr><td class="l">' + esc(r.name) + '</td><td class="l">' + kindTag(r.kind) + '</td><td>' + f(r.Q, 3) +
        '</td><td>' + f(r.curOd, 0) + '</td><td>' + f(r.curHf, 3) + '</td><td>' +
        (r.needChange ? '<b style="color:var(--g-700)">' + r.sugOd + '</b>' : f(r.sugOd, 0)) + '</td><td>' +
        f(r.sugV, 2) + '</td><td>' + f(r.sugHf, 3) + '</td></tr>';
    });
    $('sugTable').innerHTML = h;
    /* inp */
    $('inpBox').textContent = full.mode === 'design' ? Core.toInpDesign(full) : Core.toInp(full, lastNet);
    $('epanetOut').innerHTML = '';
  }

  /* ── 毛管逐滴头模拟：找最差毛管 → 跑模拟 → 出DU+曲线图 ── */
  function renderLateralSim(full) {
    var latSum = $('latSum'), latChart = $('latChart'), latWarn = $('latWarn');
    if (!latSum || !latChart || !latWarn) return;

    var o = full.opts;
    var pInlet, tapeLen, tapeDesc;

    if (full.mode === 'design') {
      /* 三级规划模式：用设计数据里的毛管入口压力 + 用户填的毛管长度 */
      var h = lastDesign && lastDesign.hydraulics;
      if (!h || !h.tapePressureM) {
        latSum.innerHTML = '<div class="sum"><div class="t">逐滴头模拟</div><div class="n" style="font-size:13px">设计数据中缺少毛管入口压力，无法模拟。</div></div>';
        latChart.innerHTML = ''; latWarn.textContent = '';
        return;
      }
      pInlet = +h.tapePressureM;
      tapeLen = o.tapeLen || 80;
      tapeDesc = '三级规划入口压力 ' + f(pInlet, 1) + ' m · 毛管长 ' + tapeLen + ' m';
    } else {
      /* 地图布置模式：找挂接损失最大的毛管 */
      var worstTape = null;
      full.tapeRows.forEach(function (t) {
        if (t.attached && (!worstTape || t.hf > worstTape.hf)) worstTape = t;
      });
      if (!worstTape) {
        latSum.innerHTML = '<div class="sum"><div class="t">逐滴头模拟</div><div class="n" style="font-size:13px">没有已挂接的滴灌带，无法模拟。</div></div>';
        latChart.innerHTML = ''; latWarn.textContent = '';
        return;
      }
      pInlet = o.dripHead + worstTape.hf;
      tapeLen = worstTape.len;
      tapeDesc = '最差毛管 #' + (worstTape.idx + 1) + ' · 长 ' + f(tapeLen, 1) + ' m · 入口压 ' + f(pInlet, 1) + ' m';
    }

    var sim = Core.simulateLateral({
      tapeLen: tapeLen,
      tapeID: o.tapeID,
      spacing: o.dripSpacing,
      qRef: o.qDrip,
      pRef: o.dripHead || 10,
      xExp: o.xExp || 0.5,
      pInlet: pInlet,
      C: o.C,
      slope: o.slope || 0
    });

    /* DU 判定颜色 */
    var duColor = sim.DU >= 90 ? 'var(--g-700)' : sim.DU >= 80 ? 'var(--a-600)' : 'var(--r-600)';
    var duLabel = sim.DU >= 90 ? '优秀' : sim.DU >= 80 ? '合格' : '不合格';

    /* 汇总卡 */
    latSum.innerHTML =
      '<div class="sum"><div class="t">真实 DU</div><div class="n" style="color:' + duColor + '">' +
        f(sim.DU, 1) + '<small>% · ' + duLabel + '</small></div></div>' +
      '<div class="sum"><div class="t">入口压力 / 末端压力</div><div class="n">' +
        f(sim.pMax, 1) + ' / ' + f(sim.pMin, 1) + '<small>m</small></div></div>' +
      '<div class="sum"><div class="t">滴头流量范围</div><div class="n">' +
        f(sim.qMin, 2) + ' ~ ' + f(sim.qMax, 2) + '<small>L/h（均值 ' + f(sim.qAvg, 2) + '）</small></div></div>' +
      '<div class="sum"><div class="t">最大毛管流速</div><div class="n" style="color:' + (sim.maxV > 2 ? 'var(--r-600)' : '') + '">' +
        f(sim.maxV, 2) + '<small>m/s</small></div></div>';

    /* 报警 */
    latWarn.textContent = sim.warn.length ? '⚠ ' + sim.warn.join('\n⚠ ') : '';

    /* 模拟条件说明 */
    var descHtml = '<div style="font-size:11px;color:var(--s-500);margin:4px 0 2px">' + esc(tapeDesc) +
      ' · ' + sim.N + ' 个滴头 · 流量指数 x=' + (o.xExp || 0.5) + (o.slope ? ' · 坡度 ' + (o.slope > 0 ? '+' : '') + o.slope : ' · 水平') + '</div>';

    /* ── SVG 压力+流量曲线 ── */
    var W = 820, H = 260, padL = 50, padR = 55, padT = 20, padB = 35;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var emitters = sim.emitters;
    var maxDist = emitters[emitters.length - 1].dist;
    var pMax = sim.pMax * 1.1;
    var qMax = sim.qMax * 1.15;

    function xPix(d) { return padL + (d / maxDist) * plotW; }
    function yP(p) { return padT + plotH - (p / pMax) * plotH; }
    function yQ(q) { return padT + plotH - (q / qMax) * plotH; }

    /* 压力线（绿色）+ 流量线（蓝色） */
    var pPts = emitters.map(function (e) { return xPix(e.dist).toFixed(1) + ',' + yP(e.pressure).toFixed(1); }).join(' ');
    var qPts = emitters.map(function (e) { return xPix(e.dist).toFixed(1) + ',' + yQ(e.q).toFixed(1); }).join(' ');

    /* 额定压力参考线 */
    var pRefY = yP(sim.pMax - (sim.pMax - sim.pMin) * 0.3); /* 仅示意，不画死 */

    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%">' +
      /* 网格 */
      '<line x1="' + padL + '" y1="' + (padT + plotH) + '" x2="' + (W - padR) + '" y2="' + (padT + plotH) + '" stroke="#cbd5e1" stroke-width="1"/>' +
      '<line x1="' + padL + '" y1="' + padT + '" x2="' + padL + '" y2="' + (padT + plotH) + '" stroke="#cbd5e1" stroke-width="1"/>' +
      /* 压力线 */
      '<polyline points="' + pPts + '" fill="none" stroke="#16a34a" stroke-width="2"/>' +
      /* 流量线 */
      '<polyline points="' + qPts + '" fill="none" stroke="#2563eb" stroke-width="1.8" stroke-dasharray="6 3"/>' +
      /* X轴标签 */
      '<text x="' + (padL + plotW / 2) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="11" fill="#64748b">距毛管入口距离 (m) — 共 ' + maxDist.toFixed(1) + ' m · ' + sim.N + ' 个滴头</text>' +
      /* 左Y轴标签（压力） */
      '<text x="14" y="12" font-size="10" fill="#16a34a">压力 m</text>' + /* [v316b] 轴标签提到顶部留白带，避开图例带与入口标注 */
      /* 右Y轴标签（流量） */
      '<text x="' + (W - padR + 6) + '" y="12" font-size="10" fill="#2563eb">L/h</text>' + /* [v316b] 同上 */
      /* 入口标注 */
      '<circle cx="' + xPix(0) + '" cy="' + yP(emitters[0].pressure) + '" r="3.5" fill="#16a34a"/>' +
      '<text x="' + (xPix(0) + 8) + '" y="' + (yP(emitters[0].pressure) + 13) + '" font-size="10" fill="#16a34a">入口 ' + f(emitters[0].pressure, 1) + 'm</text>' +
      /* 末端标注 */
      '<circle cx="' + xPix(maxDist) + '" cy="' + yP(emitters[emitters.length - 1].pressure) + '" r="3.5" fill="#dc2626"/>' +
      '<text x="' + (xPix(maxDist) - 6) + '" y="' + (yP(emitters[emitters.length - 1].pressure) + 16) + '" text-anchor="end" font-size="10" fill="#dc2626">末端 ' + f(emitters[emitters.length - 1].pressure, 1) + 'm</text>' +
      /* 图例 */
      '<rect x="' + (padL + 8) + '" y="' + (padT + 4) + '" width="12" height="2.5" fill="#16a34a"/>' +
      '<text x="' + (padL + 24) + '" y="' + (padT + 7) + '" font-size="10" fill="#475569">压力分布</text>' +
      '<line x1="' + (padL + 90) + '" y1="' + (padT + 5) + '" x2="' + (padL + 102) + '" y2="' + (padT + 5) + '" stroke="#2563eb" stroke-width="1.8" stroke-dasharray="4 2"/>' +
      '<text x="' + (padL + 108) + '" y="' + (padT + 7) + '" font-size="10" fill="#475569">滴头流量</text>' +
      '</svg>';

    latChart.innerHTML = descHtml + '<div class="lat-chart-box">' + svg + '</div>'; /* [v316b] svg 包盒：flex 列内撑满剩余高、与左栏底对齐 */
  }

  function renderHydDiagram(full) {
    var host = $('hydDiagram');
    if (!host) return;
    var rows = full.segRows.filter(function (r) { return r.points && r.points.length >= 2; });
    if (!rows.length) { host.innerHTML = '<div class="empty" style="height:100%;border:0">当前数据没有可显示的最终管线几何。</div>'; return; }
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    rows.forEach(function (r) { r.points.forEach(function (p) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }); });
    var spanX = Math.max(1, maxX - minX), spanY = Math.max(1, maxY - minY), pad = Math.max(spanX, spanY) * 0.08;
    var width = spanX + pad * 2, height = spanY + pad * 2;
    function pt(p) { return (p.x - minX + pad).toFixed(2) + ',' + (maxY - p.y + pad).toFixed(2); }
    function color(r) { return r.status === 'over_velocity' ? '#dc2626' : r.status === 'disconnected' ? '#d97706' : r.status === 'loop' ? '#7c3aed' : r.status === 'no_demand' ? '#94a3b8' : (r.kind === 'front' ? '#0f766e' : r.kind === 'main' ? '#2563eb' : '#16a34a'); }
    function weight(r) { return r.kind === 'front' ? 7 : r.kind === 'main' ? 5 : 3.5; }
    var paths = rows.map(function (r) {
      var d = 'M ' + r.points.map(pt).join(' L '), c = color(r), dash = r.status === 'ok' ? '' : ' stroke-dasharray="8 5"';
      return '<g class="hyd-pipe" data-hydi="' + r.i + '"><path class="hyd-base" d="' + d + '" stroke="' + c + '" stroke-width="' + weight(r) + '"' + dash + '/>' +
        (r.Q > 0 ? '<path class="hyd-flow" d="' + d + '"/>' : '') + '</g>';
    }).join('');
    host.innerHTML = '<svg viewBox="0 0 ' + width.toFixed(2) + ' ' + height.toFixed(2) + '" preserveAspectRatio="xMidYMid meet">' + paths + '</svg>' +
      '<div class="hyd-legend"><b>流动虚线＝水流方向</b><br><span style="color:#0f766e">■</span> 总管　<span style="color:#2563eb">■</span> 主管　<span style="color:#16a34a">■</span> 支管<br>点击任意管段查看水力数据</div>' +
      '<div class="hyd-tip" id="hydTip">已显示三级规划最终管线。点击管段查看流量、流速和损失。</div>';
    host.querySelectorAll('[data-hydi]').forEach(function (el) {
      el.addEventListener('click', function () {
        host.querySelectorAll('.hyd-pipe.selected').forEach(function (x) { x.classList.remove('selected'); });
        el.classList.add('selected');
        var r = full.segRows.filter(function (x) { return x.i === +el.getAttribute('data-hydi'); })[0];
        if (!r) return;
        /* 更新浮动提示 */
        $('hydTip').innerHTML = '<b>' + esc(r.name) + '</b> · 流量 ' + f(r.Q, 3) + ' m³/h<br>流速 ' + f(r.v, 2) + ' m/s · 沿程 ' + f(r.hf, 3) + ' m · 本段合计 ' + f(r.htot, 3) + ' m';
        /* 更新右侧属性面板 */
        var kindName = r.kind === 'front' ? '总管' : r.kind === 'main' ? '主管' : '支管';
        var vColor = r.over ? 'bad' : 'ok';
        $('rpBody').innerHTML =
          '<div class="rp-asset">' + esc(r.name) + '</div>' +
          '<div class="rp-type">' + esc(kindName) + ' · ' + f(r.L, 1) + ' m</div>' +
          '<table class="rp-table">' +
          '<tr><td>外径 / 内径</td><td>' + f(r.od, 0) + ' / ' + f(r.idm, 1) + ' mm</td></tr>' +
          '<tr><td>流量</td><td class="ok">' + f(r.Q, 3) + ' m³/h</td></tr>' +
          '<tr><td>流速</td><td class="' + vColor + '">' + f(r.v, 2) + ' m/s' + (r.over ? ' ⚠' : '') + '</td></tr>' +
          '<tr><td>沿程损失</td><td>' + f(r.hf, 3) + ' m</td></tr>' +
          '<tr><td>局部损失</td><td>' + f(r.hloc, 3) + ' m</td></tr>' +
          '<tr><td>本段合计</td><td>' + f(r.htot, 3) + ' m</td></tr>' +
          '</table>' +
          (r.over ? '<div class="rp-warn">⚠ 流速 ' + f(r.v, 2) + ' m/s 超过建议上限 ' + f(full.opts.vmax, 1) + ' m/s，建议放大管径。</div>' : '');
        var tr = root.querySelector('[data-hydrow="' + r.i + '"]');
        /* [v315 2026-10-08 用户要求] 跳转的同时给目标行上高亮闪烁——长表里
        「跳到了哪一行」要看得见；先清旧行，再 void offsetWidth 重启动画 */
        if (tr) {
          root.querySelectorAll('#segTable tr.hyd-row-hit').forEach(function (x) { x.classList.remove('hyd-row-hit'); });
          void tr.offsetWidth;
          tr.classList.add('hyd-row-hit');
          /* v315：.tblfreeze 容器冻结下 th 恒钉容器顶——scrollIntoView 滚容器内 scrollTop
             即可，行到哪表头都在，无需额外校正（本页 window 不滚，滚动容器是 .result/.tblfreeze） */
          tr.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      });
    });
  }

  /* ---------- EPANET 对照 ---------- */
  function inpText() {
    if (!lastFull || !lastFull.valid) return '';
    return lastFull.mode === 'design' ? Core.toInpDesign(lastFull) : Core.toInp(lastFull, lastNet);
  }
  $('btnCopyInp').onclick = function () {
    var t = inpText();
    function okMsg() { $('epanetOut').textContent = '已复制到剪贴板。'; }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(okMsg, fallback);
      else fallback();
    } catch (e) { fallback(); }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = t; root.appendChild(ta); ta.select();
      try { document.execCommand('copy'); okMsg(); } catch (e2) { $('epanetOut').textContent = '复制失败，请手动选择文本。'; }
      ta.remove();
    }
  };
  $('btnDownInp').onclick = function () {
    try {
      var blob = new Blob([inpText()], { type: 'text/plain' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'runye-hydraulics-' + new Date().toISOString().slice(0, 10) + '.inp';
      root.appendChild(a); a.click(); setTimeout(function () { a.remove(); URL.revokeObjectURL(a.href); }, 100);
    } catch (e) { $('epanetOut').textContent = '下载失败：' + e.message; }
  };
  /* epanet-js 动态加载：自托管 pwa/vendor/epanet 优先（离线可用），CDN 兜底，失败给降级说明。
     实测接口（epanet-js@0.9.0，OWA-EPANET 2.3.5 wasm 内嵌）：
       new Workspace() → await ws.loadModule() → new Project(ws) →
       ws.writeFile → model.open/solveH/close → getNodeValues(NodeProperty.X) 返回全部节点数组。 */
  $('btnRunEpanet').onclick = function () {
    var out = $('epanetOut');
    if (!lastFull || !lastFull.valid) { out.textContent = '请先完成有效的水力校核。'; return; }
    if (!inpText()) { out.textContent = '当前最终管线缺少可恢复的端点拓扑，请回三级规划重新生成管线图。'; return; }
    out.textContent = '正在加载 epanet-js WASM（约 0.7MB）…';
    var sources = ['pwa/vendor/epanet/index.mjs', 'https://unpkg.com/epanet-js@0.9.0/dist/index.mjs'];
    tryLoad(0);
    function tryLoad(i) {
      if (i >= sources.length) {
        out.innerHTML = 'epanet-js 运行时不可用（本地缺 pwa/vendor/epanet 且无 CDN）。<b>降级方案</b>：' +
          '点「下载 .inp 文件」导入桌面版 EPANET 2.2+ 运行对照——本页生成的 .inp 即其输入文件。';
        return;
      }
      import(sources[i]).then(function (mod) {
        var Workspace = mod.Workspace, Project = mod.Project, NodeProperty = mod.NodeProperty, LinkProperty = mod.LinkProperty;
        if (!Workspace || !Project) throw new Error('toolkit 接口不符');
        var ws = new Workspace();
        return ws.loadModule().then(function () {
          var model = new Project(ws);
          ws.writeFile('runye.inp', inpText());
          model.open('runye.inp', 'report.rpt', 'out.bin');
          model.solveH();
          var heads = Array.from(model.getNodeValues(NodeProperty.Head)).map(Number);
          var press = Array.from(model.getNodeValues(NodeProperty.Pressure)).map(Number);
          var flows = Array.from(model.getLinkValues(LinkProperty.Flow)).map(Number);
          model.close();
          return { ws: ws, heads: heads, press: press, flows: flows };
        });
      }).then(function (r) {
        var h = '<b style="color:var(--g-700)">EPANET 运行成功</b>（引擎 v' + r.ws.version + '，单位制 LPM，固定水头边界=本页需求扬程 TDH）<br>' +
          '<table style="max-width:640px"><tr><th class="l">对象</th><th>EPANET 水头 m</th><th>EPANET 压力 m</th><th>本页对照</th></tr>';
        var labels = Core.epanetNodeLabels ? Core.epanetNodeLabels(lastFull) : [];
        for (var n = 0; n < r.heads.length; n++) {
          var lbl = labels[n] || ('节点 #' + n);
          h += '<tr><td class="l">' + esc(lbl) + '</td><td>' + f(r.heads[n], 3) + '</td><td>' + f(r.press[n], 3) + '</td><td class="l" style="text-align:left;color:var(--s-500)">' +
            (lbl === '供水边界 Rsrc' ? '供水边界，水头=TDH ' + f(lastFull.tdh, 2) + ' m' : '') + '</td></tr>';
        }
        h += '<tr><td colspan="4" style="text-align:left;background:var(--s-100)">管段流量 LPM（应与「逐段水力校核」表同比例一致）：</td></tr><tr><td colspan="4" style="text-align:left">' +
          r.flows.map(function (q, i2) { return 'P' + i2 + '=' + f(q, 3); }).join('　') + '</td></tr></table>' +
          '<div style="font-size:10px;color:var(--s-500);margin-top:4px">本次复核按实际管段、直接滴灌需求及局部损失生成 EPANET 输入；滴灌带多孔出流仍由润野的 Christiansen 校核承担。这里使用固定水头边界校验管网，不等同于水泵曲线选型。</div>';
        out.innerHTML = h;
      }).catch(function (e) {
        if (i + 1 < sources.length) { tryLoad(i + 1); return; }
        out.innerHTML = 'EPANET 运行失败：' + esc(String(e && e.message || e)).slice(0, 200) +
          '<br>极小流量/粗管径网络可能数值不收敛——以本页自研校核为准；也可点「下载 .inp 文件」到桌面版 EPANET 运行。';
      });
    }
  };

  /* 水力校核属于 L2：保留独立兼容 URL 的会员检查，同时由主导航再次门控。 */
  function hydraulicAccess() {
    var ent = window.RyEntitle;
    if (ent && typeof ent.access === 'function') return ent.access('hydraulic-check');
    if (ent && typeof ent.can === 'function') {
      if (typeof ent.ready === 'function' && !ent.ready()) return 'pending';
      return ent.can('hydraulic-check') ? 'allowed' : 'denied';
    }
    return 'denied';
  }
  function showHydraulicGate(status) {
    var gate = root.querySelector('#hydEntitlementGate');
    if (!gate) {
      gate = document.createElement('div');
      gate.id = 'hydEntitlementGate';
      gate.setAttribute('role', 'status');
      gate.setAttribute('aria-live', 'polite');
      gate.style.cssText = 'position:absolute;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;background:rgba(247,245,240,.98);font:14px sans-serif;color:#243b33;text-align:center;padding:24px';
      root.appendChild(gate);
    }
    gate.innerHTML = '';
    var box = document.createElement('div');
    box.style.cssText = 'max-width:420px;padding:28px;border:1px solid #d7e4dc;border-radius:12px;background:#fff;box-shadow:0 8px 30px rgba(0,0,0,.08)';
    var title = document.createElement('h2');
    title.textContent = status === 'pending' ? '正在同步会员权益' : '水力校核为高级会员功能';
    var desc = document.createElement('p');
    desc.textContent = status === 'pending' ? '请稍候，页面会在权益同步完成后自动打开。' : '请从润野主程序登录并开通高级会员后使用。';
    box.appendChild(title); box.appendChild(desc);
    if (status !== 'pending') {
      var upgrade = document.createElement('button');
      upgrade.type = 'button'; upgrade.textContent = '查看会员权益';
      upgrade.onclick = function () {
        var memberUI = window.RyMemberUI;
        if (memberUI && typeof memberUI.showUpgrade === 'function') memberUI.showUpgrade('水力校核');
        else window.location.hash = '#hydraulicsSection';
      };
      box.appendChild(upgrade);
    }
    gate.appendChild(box);
  }
  function bootHydraulics() {
    if (hydraulicAccess() !== 'allowed') return false;
    var gate = root.querySelector('#hydEntitlementGate');
    if (gate && gate.parentNode) gate.parentNode.removeChild(gate);
    /* ---------- 事件 ---------- */
    $('btnRun').onclick = run;
    $('btnReload').onclick = function () { renderSrc(); run(); };
    $('btnMapHydraulic').onclick = function () { window.location.hash = '#onlineMapSection'; };
    root.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target && e.target.tagName === 'INPUT') run(); });
    restoreCfg();
    renderSrc();
    run();
    return true;
  }
  function checkHydraulicAccess() {
    var status = hydraulicAccess();
    if (status === 'allowed') { bootHydraulics(); return; }
    showHydraulicGate(status);
    if (status === 'pending') setTimeout(checkHydraulicAccess, 500);
  }
  checkHydraulicAccess();
})();
