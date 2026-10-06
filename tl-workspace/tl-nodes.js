/* ===== 三级管线图·节点（v150，2026-09-28 用户需求）=====
 * 用户原话：「插入两个节点，节点能选择管道的配件：可以是三通、阀门、45°弯头、90°弯头，
 *           具体是什么我根据情况自己选择；选择好的配件将来在工程量统计的时候统计进去；
 *           具体样式在图中不用显示，只显示节点就行；节点内可以包含很多内容；
 *           我点击两个节点之后，可以将两个节点连起来。」
 *
 * 设计：
 * · 数据（本模块）：nodes=[{id,pid,atM,fittings:{tee,valve,elbow45,elbow90}}]；
 *   links=[{id,a,b,pid}]（a/b=节点 id，连线只在同一根管道上的两节点间）。
 *   localStorage runye_tlNodes_v1 独立键 —— 不动 AE 红线（不进水力计算）；
 *   几何签名同 AE 口径（frontPipe/mainPipes/branchPipes/valves/poly JSON），签名不符不恢复。
 * · 渲染：tl-workspace.js 覆盖层画圆点（含配件数角标）与连线（沿管子折线紫虚线+段长标注），
 *   本模块只存数据 + 弹面板。节点 atM 沿有效几何（改长后超出管长 → 显示贴末端，数据不洗）。
 * · 面板：点节点弹出 —— 四种配件勾选×数量（改动即存）、设为连接起点（点第二个节点自动连接，2026-09-28）、
 *   连线列表（可删）、删除节点、全部节点配件工程量汇总（bomText，供外部统计取用）。
 * · 工程量：RyTlNodes.bom() → {tee,valve,elbow45,elbow90} 数量合计；linkStats() → 连线段
 *   [{id,pid,name,len}]（len=|atA-atB| 沿管弧长，改长后按有效几何）；bomText() 拼一句话汇总。
 * ===================================================================== */
(function (global) {
  'use strict';

  var VERSION = 1;
  var LS_KEY = 'runye_tlNodes_v1';
  var PID_RE = /^(front|main-\d+|branch-\d+)$/;
  var FITS = [
    { k: 'tee', label: '三通' },
    { k: 'valve', label: '阀门' },
    { k: 'elbow45', label: '45°弯头' },
    { k: 'elbow90', label: '90°弯头' }
  ];

  var nodes = [];            // [{id:'N-01', pid, atM, fittings:{}}]
  var links = [];            // [{id:'L-01', a, b, pid}]
  var seq = { n: 0, l: 0 };
  var linkFrom = null;       // 连接起点节点 id（会话态，不落盘）
  var panelAutoMsg = null;   // 面板一次性提示（'dup|<id>'）：openPanel 时设置、renderPanel 消费
  var LINK_OD_SERIES = (typeof PE_OD_SERIES !== 'undefined' && PE_OD_SERIES.length) ? PE_OD_SERIES.slice()
    : [63, 75, 90, 110, 140, 160, 200, 250, 315, 355, 400];   /* 连线可选管径档（同三级面板 PE 外径） */
  var subs = [];
  var savedRaw = null;       // localStorage 兜底档（load 时读一次，几何签名吻合才恢复）
  var restored = false;

  /* ---------- 基础 ---------- */
  function copy(v) { return JSON.parse(JSON.stringify(v)); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function pipeNameOf(pid) {
    if (pid === 'front') return '总管';
    var m = /^(main|branch)-(\d+)$/.exec(String(pid || ''));
    if (!m) return String(pid || '');
    return (m[1] === 'main' ? '主管#' : '支管#') + (Number(m[2]) + 1);
  }
  function geometryKey(data) {
    if (!data) return '';
    return JSON.stringify([data.frontPipe, data.mainPipes, data.branchPipes, data.valves, data.poly]);
  }
  function currentGeoSig() { return geometryKey(typeof window !== 'undefined' ? window.tlDiagramData : null); }
  function persist() {
    if (typeof localStorage === 'undefined') return;
    try { localStorage.setItem(LS_KEY, JSON.stringify({ version: VERSION, geoSig: currentGeoSig(), nodes: copy(nodes), links: copy(links) })); } catch (e) {}
  }
  function notify(detail) {
    for (var i = 0; i < subs.length; i++) { try { subs[i](detail); } catch (e) {} }
    persist();
  }
  function ensureRestored() {
    if (restored || !savedRaw) return;
    if (!savedRaw || savedRaw.version !== VERSION) { restored = true; return; }
    if (!currentGeoSig() || savedRaw.geoSig !== currentGeoSig()) { restored = true; return; }   /* 几何不符/图未生成 → 不恢复 */
    nodes = Array.isArray(savedRaw.nodes) ? savedRaw.nodes : [];
    links = Array.isArray(savedRaw.links) ? savedRaw.links : [];
    var mn = 0, ml = 0;
    nodes.forEach(function (nd) { var m = /^N-(\d+)$/.exec(nd && nd.id); if (m) mn = Math.max(mn, Number(m[1])); });
    links.forEach(function (lk) { var m = /^L-(\d+)$/.exec(lk && lk.id); if (m) ml = Math.max(ml, Number(m[1])); });
    seq.n = mn; seq.l = ml;
    restored = true;
  }
  if (typeof localStorage !== 'undefined') {
    try { savedRaw = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) { savedRaw = null; }
  }

  /* ---------- 节点 ---------- */
  function list() { ensureRestored(); return copy(nodes); }
  function nodeById(id) {
    ensureRestored();
    for (var i = 0; i < nodes.length; i++) if (nodes[i].id === id) return copy(nodes[i]);
    return null;
  }
  function addAt(pid, atM) {
    ensureRestored();
    if (!PID_RE.test(String(pid || '')) || !isFinite(atM)) return null;
    var nd = { id: 'N-' + pad2(++seq.n), pid: pid, atM: Math.round(atM * 10) / 10, fittings: {} };
    nodes.push(nd);
    notify({ action: 'addNode', id: nd.id });
    return copy(nd);
  }
  function removeNode(id) {
    ensureRestored();
    var before = nodes.length;
    nodes = nodes.filter(function (nd) { return nd.id !== id; });
    if (nodes.length === before) return false;
    links = links.filter(function (lk) { return lk.a !== id && lk.b !== id; });   /* 级联删连线 */
    if (linkFrom === id) linkFrom = null;
    notify({ action: 'removeNode', id: id });
    return true;
  }
  function sanitizeFittings(obj) {
    var out = {};
    FITS.forEach(function (f) {
      var v = obj && isFinite(obj[f.k]) ? Math.max(0, Math.floor(Number(obj[f.k]))) : 0;
      out[f.k] = v;
    });
    return out;
  }
  function setFittings(id, obj) {
    ensureRestored();
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].id === id) {
        nodes[i].fittings = sanitizeFittings(obj);
        notify({ action: 'fittings', id: id });
        return copy(nodes[i]);
      }
    }
    return null;
  }
  function fitTotal(nd) {
    if (!nd || !nd.fittings) return 0;
    var s = 0;
    FITS.forEach(function (f) { s += nd.fittings[f.k] || 0; });
    return s;
  }
  /* 2026-09-30 节点角标升级（请求④，范围=节点角标升级）：连接度 + 端点/中间语义 */
  function degreeOf(id) {
    ensureRestored();
    var d = 0;
    for (var i = 0; i < links.length; i++) { if (links[i].a === id || links[i].b === id) d++; }
    return d;
  }
  function roleOf(id) {
    var d = degreeOf(id);
    return d === 0 ? 'isolated' : (d >= 2 ? 'middle' : 'endpoint');
  }

  /* ---------- 节点沿管移动（2026-09-28 用户要求：拖动自由移动 + 桩号精确定位） ---------- */
  function moveNode(id, atM) {
    ensureRestored();
    var A = (typeof window !== 'undefined') ? window.RyTlAutoEdits : null;
    var d = (typeof window !== 'undefined') ? window.tlDiagramData : null;
    var v = parseFloat(atM);
    if (!isFinite(v)) return null;
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].id === id) {
        if (A && d) {
          var ep = A.effPts(nodes[i].pid, d);
          if (ep) v = Math.max(0, Math.min(v, A.polylineLen(ep)));   /* 钳制在管长内（拖出管外=吸到端点） */
        }
        if (v < 0) v = 0;
        if (Math.abs((nodes[i].atM || 0) - v) < 1e-9) return copy(nodes[i]);
        nodes[i].atM = v;
        persist(); notify({ action: 'moveNode', id: id, atM: v });
        return copy(nodes[i]);
      }
    }
    return null;
  }
  /* ---------- 连线（两节点 → 一段管段） ---------- */
  function setLinkStart(id) {
    ensureRestored();
    linkFrom = id || null;
    return linkFrom;
  }
  function linkFromId() { return linkFrom; }
  function linksList() { ensureRestored(); return copy(links); }
  function completeLink(bId) {
    ensureRestored();
    if (!linkFrom || !bId || linkFrom === bId) return null;
    var na = null, nb = null, i;
    for (i = 0; i < nodes.length; i++) {
      if (nodes[i].id === linkFrom) na = nodes[i];
      if (nodes[i].id === bId) nb = nodes[i];
    }
    /* 2026-09-28 用户要求：跨管也可连（总管/主管同标高、水平平面直连）；pid=null 表示跨管 */
    if (!na || !nb) return null;
    for (i = 0; i < links.length; i++) {                 /* 同对节点不重复连线 */
      if ((links[i].a === na.id && links[i].b === nb.id) || (links[i].a === nb.id && links[i].b === na.id)) return null;
    }
    var lk = { id: 'L-' + pad2(++seq.l), a: na.id, b: nb.id, pid: na.pid === nb.pid ? na.pid : null };
    links.push(lk);
    linkFrom = null;
    notify({ action: 'addLink', id: lk.id });
    return copy(lk);
  }
  function removeLink(id) {
    ensureRestored();
    var before = links.length;
    links = links.filter(function (lk) { return lk.id !== id; });
    if (links.length === before) return false;
    notify({ action: 'removeLink', id: id });
    return true;
  }

  /* ---------- 工程量统计 ---------- */
  function bom() {
    ensureRestored();
    var out = {};
    FITS.forEach(function (f) { out[f.k] = 0; });
    nodes.forEach(function (nd) { FITS.forEach(function (f) { out[f.k] += (nd.fittings && nd.fittings[f.k]) || 0; }); });
    return out;
  }
  function linkStats() {
    ensureRestored();
    var A = (typeof window !== 'undefined') ? window.RyTlAutoEdits : null;
    var d = (typeof window !== 'undefined') ? window.tlDiagramData : null;
    var out = [];
    if (!A || !d) return out;
    links.forEach(function (lk) {
      var na = null, nb = null;
      nodes.forEach(function (nd) { if (nd.id === lk.a) na = nd; if (nd.id === lk.b) nb = nd; });
      if (!na || !nb) return;
      if (na.pid !== nb.pid) {
        /* 2026-09-28 跨管连线：总管/主管同标高（同一埋深），长度=两节点平面距离 */
        var paC = A.pointAt(na.pid, d, na.atM), pbC = A.pointAt(nb.pid, d, nb.atM);
        if (!paC || !pbC) return;
        var nmC = (A.pipeName ? A.pipeName(na.pid) : pipeNameOf(na.pid)) + ' → ' + (A.pipeName ? A.pipeName(nb.pid) : pipeNameOf(nb.pid));
        out.push({ id: lk.id, pid: null, pidA:na.pid,pidB:nb.pid,atA:na.atM,atB:nb.atM,name: nmC, cross: true, len: Math.hypot(pbC.x - paC.x, pbC.y - paC.y), od: lk.od });
        return;
      }
      var ep = A.effPts(na.pid, d); if (!ep) return;
      var L = A.polylineLen(ep);
      var a1 = Math.max(0, Math.min(na.atM, L)), b1 = Math.max(0, Math.min(nb.atM, L));
      out.push({ id: lk.id, pid: lk.pid,pidA:na.pid,pidB:nb.pid,atA:na.atM,atB:nb.atM,name: A.pipeName ? A.pipeName(lk.pid) : pipeNameOf(lk.pid), len: Math.abs(b1 - a1), od: lk.od });
    });
    return out;
  }
  function bomText() {
    var b = bom(), parts = [];
    FITS.forEach(function (f) { if (b[f.k] > 0) parts.push(f.label + ' ×' + b[f.k]); });
    var ls = linkStats(), sumL = 0;
    ls.forEach(function (x) { sumL += x.len; });
    var t = parts.length ? parts.join(' · ') : '配件合计：尚无';
    t += '　|　节点连线 ' + ls.length + ' 段';
    if (ls.length) t += ' · 合计 ' + sumL.toFixed(1) + ' m';
    return t;
  }

  /* ---------- 面板（点节点弹出）---------- */
  var panelEl = null, panelX = 0, panelY = 0, panelNodeId = null;
  function ensurePanel() {
    if (panelEl) return panelEl;
    panelEl = document.createElement('div');
    panelEl.id = 'tlNodePanel';
    panelEl.style.cssText = 'display:none;position:fixed;z-index:9990;background:#fff;border:1px solid #c4b5fd;border-radius:8px;box-shadow:0 10px 30px rgba(76,29,149,.22);padding:10px 12px;min-width:238px;max-width:290px;font:12px/1.8 system-ui,sans-serif;color:#1f2937';
    document.body.appendChild(panelEl);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closePanel(); closeLinkPanel(); linkFrom = null; }
    });
    panelEl.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-np]') : null;
      if (!b) return;
      var act = b.getAttribute('data-np');
      if (act === 'close') { closePanel(); }
      else if (act === 'delnode' && panelNodeId) { removeNode(panelNodeId); closePanel(); }
      else if (act === 'linkstart' && panelNodeId) { setLinkStart(panelNodeId); renderPanel(); }
      else if (act === 'linkcancel') { setLinkStart(null); renderPanel(); }
      else if (act === 'linkdone' && panelNodeId) { completeLink(panelNodeId); renderPanel(); }
      else if (act.indexOf('dellink:') === 0) { removeLink(act.slice(8)); renderPanel(); }
    });
    panelEl.addEventListener('change', function (e) {
      if (!panelNodeId) return;
      var t = e.target;
      if (t.getAttribute && t.getAttribute('data-npat') != null) {   /* 桩号输入：精确定位（2026-09-28 用户要求；无值属性 getAttribute 返回 '' 为 falsy，必须判 != null） */
        moveNode(panelNodeId, parseFloat(t.value));
        renderPanel();
        return;
      }
      var k = t.getAttribute ? (t.getAttribute('data-npchk') || t.getAttribute('data-npnum')) : null;
      if (!k) return;
      var cur = nodeById(panelNodeId) || { fittings: {} };
      var f = {};
      FITS.forEach(function (x) { f[x.k] = (cur.fittings && cur.fittings[x.k]) || 0; });
      if (t.getAttribute('data-npchk')) {            /* 勾选：0↔1 */
        f[k] = t.checked ? Math.max(1, f[k]) : 0;
      } else {                                        /* 数量：勾选态下可改 */
        f[k] = Math.max(0, Math.floor(Number(t.value) || 0));
      }
      setFittings(panelNodeId, f);
      renderPanel();
    });
    return panelEl;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function renderPanel() {
    if (!panelEl || panelEl.style.display === 'none' || !panelNodeId) return;
    var nd = nodeById(panelNodeId);
    if (!nd) { closePanel(); return; }
    var A = (typeof window !== 'undefined') ? window.RyTlAutoEdits : null;
    var d = (typeof window !== 'undefined') ? window.tlDiagramData : null;
    var stake = '', stakeVal = null;
    if (A && d) {
      var ep = A.effPts(nd.pid, d);
      if (ep) {
        var L = A.polylineLen(ep);
        stakeVal = Math.max(0, Math.min(nd.atM, L));
        stake = ' · 桩号 ' + stakeVal.toFixed(1) + 'm';
      }
    }
    var h = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">'
      + '<b style="color:#5b21b6">◉ ' + esc(nd.id) + '</b>'
      + '<span style="color:#64748b">' + esc(pipeNameOf(nd.pid) + stake) + '</span>'
      + '<button type="button" data-np="close" title="关闭" style="border:0;background:none;cursor:pointer;font:inherit;color:#94a3b8">✕</button></div>';
    var degR = degreeOf(nd.id), roleR = roleOf(nd.id);
    var roleTxt = roleR === 'middle' ? '中间节点（' + degR + ' 连）' : (roleR === 'endpoint' ? '端点（' + degR + ' 连）' : '未连接');
    h += '<div style="color:#7c3aed;font-size:11px;margin:2px 0">🔗 ' + esc(roleTxt) + '</div>';
    if (linkFrom === nd.id) {
      /* 本节点即起点：提示点第二个节点自动连接 */
      h += '<div style="background:#f5f3ff;border:1px dashed #a78bfa;border-radius:6px;padding:3px 8px;margin:4px 0;color:#5b21b6">已设为连接起点：点选<b>同管</b>上另一节点即自动连接（Esc 取消）'
        + '　<button type="button" data-np="linkcancel" style="border:1px solid #cbd5e1;background:#fff;color:#475569;border-radius:4px;padding:1px 8px;cursor:pointer;font:inherit">取消</button></div>';
    } else {
      var dupNote = (panelAutoMsg && panelAutoMsg.indexOf('dup|') === 0)
        ? '<div style="background:#f5f3ff;border:1px dashed #a78bfa;border-radius:6px;padding:3px 8px;margin:4px 0;color:#5b21b6">ℹ ' + esc(panelAutoMsg.slice(4)) + ' ↔ 本节点 已有连线，无需重复</div>' : '';
      h += dupNote + '<div style="margin:2px 0 6px"><button type="button" data-np="linkstart" title="点选同管上另一节点即自动连接" style="border:1px solid #7c3aed;background:#fff;color:#6d28d9;border-radius:4px;padding:1px 10px;cursor:pointer;font:inherit">🔗 设为连接起点</button>'
        + '<span style="color:#94a3b8;font-size:11px">（点另一节点即自动连线；跨管自动平面直连）</span></div>';
    }
    if (stakeVal != null) {
      h += '<div style="display:flex;align-items:center;gap:6px;margin:4px 0;color:#334155"><span>桩号（距管起点，可输入精确定位）</span>'
        + '<input type="number" data-npat min="0" step="0.1" value="' + stakeVal.toFixed(1) + '" style="width:72px;padding:1px 4px;font:inherit;border:1px solid #cbd5e1;border-radius:4px"><span>m</span></div>';
    }
    h += '<div style="border-top:1px dashed #e2e8f0;padding-top:5px;color:#334155">管内配件（工程量按数量统计）</div>';
    FITS.forEach(function (f) {
      var v = (nd.fittings && nd.fittings[f.k]) || 0;
      h += '<div style="display:flex;align-items:center;gap:6px;margin:2px 0">'
        + '<label style="flex:1;display:flex;align-items:center;gap:6px;cursor:pointer">'
        + '<input type="checkbox" data-npchk="' + f.k + '"' + (v > 0 ? ' checked' : '') + '> ' + esc(f.label) + '</label>'
        + '<span>×</span><input type="number" data-npnum="' + f.k + '" min="0" step="1" value="' + v + '"' + (v > 0 ? '' : ' disabled')
        + ' style="width:52px;padding:1px 4px;font:inherit;border:1px solid #cbd5e1;border-radius:4px' + (v > 0 ? '' : ';opacity:.45') + '"></div>';
    });
    var mine = [];
    links.forEach(function (lk) {
      if (lk.a !== nd.id && lk.b !== nd.id) return;
      var other = lk.a === nd.id ? lk.b : lk.a;
      mine.push('<div style="display:flex;justify-content:space-between;align-items:center;margin:1px 0"><span>🔗 ' + esc(lk.id) + ' ↔ ' + esc(other) + '</span>'
        + '<button type="button" data-np="dellink:' + esc(lk.id) + '" title="删除连线" style="border:0;background:none;color:#b91c1c;cursor:pointer;font:inherit">✕</button></div>');
    });
    if (mine.length) h += '<div style="border-top:1px dashed #e2e8f0;margin-top:5px;padding-top:4px;color:#334155">本节点连线</div>' + mine.join('');
    h += '<div style="border-top:1px dashed #e2e8f0;margin-top:6px;padding-top:4px;display:flex;justify-content:space-between;align-items:center">'
      + '<button type="button" data-np="delnode" style="border:1px solid #fca5a5;background:#fff;color:#b91c1c;border-radius:4px;padding:1px 10px;cursor:pointer;font:inherit">🗑 删除节点</button></div>';
    h += '<div style="margin-top:6px;background:#f5f3ff;border-radius:6px;padding:4px 8px;color:#4c1d95;font-size:11px"><b>工程量汇总（全部节点）</b><br>' + esc(bomText()) + '</div>';
    panelEl.innerHTML = h;
  }
  function openPanel(id, cx, cy) {
    ensurePanel();
    panelNodeId = id || null;
    if (!panelNodeId) { closePanel(); return; }
    /* 2026-09-28 用户要求：设为连接起点后，点选第二个节点即自动连接（不再需要点「完成连接」）。
       同管 → 立即成线（notify 触发重绘）；重复连线 → 清起点并提示已有连线；
       异管 → 无法连接，保持起点、面板红字提示（用户可改点同管节点或取消）。 */
    panelAutoMsg = null;
    if (linkFrom && panelNodeId && linkFrom !== panelNodeId) {
      var naL = nodeById(linkFrom), nbL = nodeById(panelNodeId);
      if (naL && nbL) {   /* 2026-09-28：跨管也自动连接（同管沿管、跨管平面直连） */
        var dupL = false, iL;
        for (iL = 0; iL < links.length; iL++) {
          if ((links[iL].a === naL.id && links[iL].b === nbL.id) || (links[iL].a === nbL.id && links[iL].b === naL.id)) { dupL = true; break; }
        }
        if (dupL) { panelAutoMsg = 'dup|' + naL.id; linkFrom = null; }
        else completeLink(panelNodeId);   /* 成线：completeLink 内清 linkFrom 并 notify 重绘 */
      }
    }
    if (isFinite(cx) && isFinite(cy)) { panelX = cx; panelY = cy; }
    panelEl.style.display = 'block';
    renderPanel();
    /* 视口内夹取（面板尺寸以渲染后实测为准） */
    var r = panelEl.getBoundingClientRect();
    var left = Math.max(6, Math.min(panelX + 12, window.innerWidth - r.width - 8));
    var top = Math.max(6, Math.min(panelY + 12, window.innerHeight - r.height - 8));
    panelEl.style.left = left + 'px';
    panelEl.style.top = top + 'px';
  }
  function closePanel() {
    if (panelEl) panelEl.style.display = 'none';
    panelNodeId = null;
    panelAutoMsg = null;
  }
  /* 拖动中面板桩号实时同步（2026-09-28 用户报「tooltip 132.5 vs 面板 216.8 不一致」）：
     节点沿管拖动时 tooltip 实时显示投影桩号，但已打开的节点面板桩号框停留在打开时刻的旧值。
     syncStake(id, atM)：面板开着且是同一节点时，把桩号输入框 value 直接刷成拖动中的最新值；
     不触发 change、不重渲染整个面板（拖动中每帧重渲染会闪烁）；用户正在手动输入时让行不打扰。 */
  function syncStake(id, atM) {
    if (!panelEl || panelEl.style.display === 'none' || panelNodeId !== id) return;
    var inp = panelEl.querySelector('input[data-npat]');
    if (!inp) return;
    var v = parseFloat(atM);
    if (!isFinite(v)) return;
    if (document.activeElement === inp) return;
    inp.value = v.toFixed(1);
  }

  /* ---------- 连线浮层（点连线弹出：选管径/删除；2026-09-28 用户要求） ---------- */
  var linkPanelEl = null, linkPanelId = null, linkPanelX = 0, linkPanelY = 0;
  function linkById(id) { for (var i = 0; i < links.length; i++) if (links[i].id === id) return copy(links[i]); return null; }
  function setLinkOd(id, od) {
    ensureRestored();
    var v = (od == null || od === '') ? null : (parseFloat(od) || null);
    for (var i = 0; i < links.length; i++) {
      if (links[i].id === id) { links[i].od = v; persist(); notify({ action: 'linkOd', id: id, od: v }); return copy(links[i]); }
    }
    return null;
  }
  function ensureLinkPanel() {
    if (linkPanelEl) return linkPanelEl;
    linkPanelEl = document.createElement('div');
    linkPanelEl.id = 'tlLinkPanel';
    linkPanelEl.style.cssText = 'display:none;position:fixed;z-index:9990;background:#fff;border:1px solid #c4b5fd;border-radius:8px;box-shadow:0 10px 30px rgba(76,29,149,.22);padding:10px 12px;min-width:238px;max-width:290px;font:12px/1.8 system-ui,sans-serif;color:#1f2937';
    document.body.appendChild(linkPanelEl);
    linkPanelEl.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-lk]') : null;
      if (!b) return;
      var act = b.getAttribute('data-lk');
      if (act === 'close') { closeLinkPanel(); }
      else if (act === 'dellink' && linkPanelId) { removeLink(linkPanelId); closeLinkPanel(); }
      else if (act === 'od' && linkPanelId) { setLinkOd(linkPanelId, b.getAttribute('data-od')); renderLinkPanel(); }
    });
    return linkPanelEl;
  }
  function renderLinkPanel() {
    if (!linkPanelEl || linkPanelEl.style.display === 'none' || !linkPanelId) return;
    var lk = linkById(linkPanelId); if (!lk) { closeLinkPanel(); return; }
    var st = null, ls = linkStats();
    for (var i = 0; i < ls.length; i++) if (ls[i].id === lk.id) st = ls[i];
    var nameTxt = st ? st.name : '', lenTxt = st ? st.len.toFixed(1) + 'm' : '—';
    var crossTxt = (lk.pid == null) ? ' · 跨接' : '';
    function odBtn(label, val, on) {
      return '<button type="button" data-lk="od" data-od="' + val + '" style="border:1px solid ' + (on ? '#7c3aed' : '#cbd5e1')
        + ';background:' + (on ? '#ede9fe' : '#fff') + ';color:' + (on ? '#5b21b6' : '#475569')
        + ';border-radius:4px;padding:1px 8px;cursor:pointer;font:inherit">' + label + '</button>';
    }
    var h = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">'
      + '<b style="color:#5b21b6">🔗 ' + esc(lk.id) + '</b>'
      + '<span style="color:#64748b">' + esc(nameTxt + ' · ' + lenTxt + crossTxt) + '</span>'
      + '<button type="button" data-lk="close" title="关闭" style="border:0;background:none;cursor:pointer;font:inherit;color:#94a3b8">✕</button></div>';
    h += '<div style="border-top:1px dashed #e2e8f0;padding-top:5px;color:#334155">连线管径（手动选择）</div>';
    h += '<div style="display:flex;flex-wrap:wrap;gap:4px;margin:4px 0 6px">' + odBtn('未定', '', lk.od == null);
    LINK_OD_SERIES.forEach(function (v) { h += odBtn('Ø' + v, v, lk.od != null && Math.abs(lk.od - v) < 1e-6); });
    h += '</div>';
    h += '<div style="border-top:1px dashed #e2e8f0;margin-top:4px;padding-top:5px">'
      + '<button type="button" data-lk="dellink" style="border:1px solid #fca5a5;background:#fff;color:#b91c1c;border-radius:4px;padding:1px 10px;cursor:pointer;font:inherit">🗑 删除连线</button></div>';
    linkPanelEl.innerHTML = h;
  }
  function openLinkPanel(id, cx, cy) {
    ensureLinkPanel();
    closePanel();   /* 与节点面板互斥 */
    linkPanelId = id || null;
    if (!linkPanelId || !linkById(linkPanelId)) { closeLinkPanel(); return; }
    if (isFinite(cx) && isFinite(cy)) { linkPanelX = cx; linkPanelY = cy; }
    linkPanelEl.style.display = 'block';
    renderLinkPanel();
    var r = linkPanelEl.getBoundingClientRect();
    var left = Math.max(6, Math.min(linkPanelX + 12, window.innerWidth - r.width - 8));
    var top = Math.max(6, Math.min(linkPanelY + 12, window.innerHeight - r.height - 8));
    linkPanelEl.style.left = left + 'px';
    linkPanelEl.style.top = top + 'px';
  }
  function closeLinkPanel() {
    if (linkPanelEl) linkPanelEl.style.display = 'none';
    linkPanelId = null;
  }

  /* ---------- 测试/重置 ---------- */
  function reset() {
    nodes = []; links = []; seq = { n: 0, l: 0 }; linkFrom = null; restored = true;
    persist();
    notify({ action: 'reset' });
  }

  global.RyTlNodes = {
    list: list, links: linksList, nodeById: nodeById,
    addAt: addAt, removeNode: removeNode, setFittings: setFittings, fitTotal: fitTotal,
    degreeOf: degreeOf, roleOf: roleOf,
    setLinkStart: setLinkStart, linkFromId: linkFromId, completeLink: completeLink, removeLink: removeLink,
    bom: bom, linkStats: linkStats, bomText: bomText,
    openPanel: openPanel, closePanel: closePanel, openLinkPanel: openLinkPanel, closeLinkPanel: closeLinkPanel, setLinkOd: setLinkOd, moveNode: moveNode, syncStake: syncStake,
    subscribe: function (fn) { if (typeof fn === 'function') subs.push(fn); },
    FITS: FITS, pipeName: pipeNameOf,
    reset: reset,
    _internals: { serialize: function () { ensureRestored(); return { version: VERSION, geoSig: currentGeoSig(), nodes: copy(nodes), links: copy(links) }; } }
  };
})(typeof window !== 'undefined' ? window : globalThis);
