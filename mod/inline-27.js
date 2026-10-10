
/* —— 图面改径菜单（2026-09-16 阶段2e）：三级设计工作区 / 轴测图 右键自动管线 →
   选 PE 外径一步改径（琥珀 Ø 标注），或恢复水力计算值。菜单 body 级懒创建
   （不进 SVG、不改静态 DOM）；数据走共享层 RyTlAutoEdits.cals，只作显示标注，
   不参与水力计算、不进材料清单（红线同阶段2）。220 为用户点名非标规格。 —— */
(function () {
  /* 2026-10-02：档位改引全局单一来源 CAL_SERIES（含非标 Ø220，菜单里带「（非标）」角标），
     本处不再自带一份字面量。 */
  var AE = window.RyTlAutoEdits;
  var menu = null;
  var target = null;   /* {view:'ws'|'iso', pid} */
  function baseCal(pid) {
    var d = window.tlDiagramData;
    var m = d && d.meta && d.meta.pipes;
    if (!m) return null;
    var key = pid === 'front' ? 'front' : (pid.indexOf('main-') === 0 ? 'main' : 'branch');
    var mm = String(m[key] || '').match(/\d+(?:\.\d+)?/);
    return mm ? parseFloat(mm[0]) : null;
  }
  /* 选中管线管径文案：'管径 Ø110（图面改）' / '管径 Ø110（计算值）' / ''（无数据） */
  window.tlPipeCalText = function (pid) {
    if (!pid) return '';
    var od = AE && AE.caliberOf ? AE.caliberOf(pid) : null;
    var base = baseCal(pid);
    if (od) return '管径 Ø' + od + '（图面改' + (base ? '，计算值 Ø' + base : '') + '）';
    if (base) return '管径 Ø' + base + '（计算值）';
    return '';
  };
  /* —— 水头损失变化估算（2026-09-16 阶段2f）：改径前后 Hazen-Williams 对比，只作图面
     估算展示（选中卡 + 管上就近标注 + 画布汇总条），不回写水力计算/材料清单/水泵选型
     （红线同阶段2）。流量口径与 computeThreeLevel 一致：总管=联合流量，主管=单区流量
     （每根主管经阀门一次过一区流量），支管=单区流量/支管数；管长取图面有效几何（含改长）。
     公式自包含（与 hazenWilliams/peInnerDiam 同式：C=150、SDR13.6 内径）。 —— */
  function flowModel() {
    var d = window.tlDiagramData;
    var fm = d && d.meta && d.meta.flowModel;
    if (fm && fm.zoneFlow > 0) return fm;
    function rd(id, def) { var el = document.getElementById(id); var v = el ? parseFloat(el.value) : NaN; return isFinite(v) && v > 0 ? v : def; }
    var areaM2 = rd('tl_zoneMu', 30) * (2000 / 3);
    var zoneTapeLen = areaM2 / rd('tl_tapeSpacing', 1.2);
    var zoneFlow = zoneTapeLen / rd('tl_emitterSpacing', 0.3) * rd('tl_emitterFlow', 2) / 1000;
    var zcEl = document.getElementById('tl_zoneCount');
    var zcV = zcEl ? parseFloat(zcEl.value) : NaN;
    var zoneCount = isFinite(zcV) && zcV > 0 ? zcV : 2;
    var nb = document.querySelector('#tl_branchGroup .selected');
    var branchCount = nb ? parseInt(nb.dataset.n) : 2;
    return { zoneFlow: zoneFlow, branchFlow: zoneFlow / branchCount, combinedFlow: zoneFlow * zoneCount, zoneCount: zoneCount, branchCount: branchCount };
  }
  function pipeLenM(pid) {
    if (!AE || !AE.effPts) return 0;
    var pts = AE.effPts(pid, window.tlDiagramData);
    if (!pts || pts.length < 2) return 0;
    if (AE.polylineLen) return AE.polylineLen(pts);
    var L = 0;
    for (var i = 1; i < pts.length; i++) L += Math.sqrt(Math.pow(pts[i].x - pts[i - 1].x, 2) + Math.pow(pts[i].y - pts[i - 1].y, 2));
    return L;
  }
  function hfFor(pid, od) {
    if (!od || od <= 0) return null;
    var fm = flowModel(); if (!fm) return null;
    var L = pipeLenM(pid); if (!(L > 0)) return null;
    var Q = pid === 'front' ? fm.combinedFlow : (pid.indexOf('main-') === 0 ? fm.zoneFlow : fm.branchFlow);
    if (!(Q > 0)) return null;
    var di = od * (1 - 2 / 13.6);
    return 1.113e9 * L * Math.pow(Q, 1.852) / (Math.pow(150, 1.852) * Math.pow(di, 4.87));
  }
  function pumpHeadNow() {
    var d = window.tlDiagramData;
    var m = d && d.meta && d.meta.pump && d.meta.pump.head ? String(d.meta.pump.head).match(/\d+(?:\.\d+)?/) : null;
    return m ? parseFloat(m[0]) : null;
  }
  /* 选中卡文案：'本段水头损失 a→b m（减少 c m）'；未改径返回 '' */
  window.tlPipeHfText = function (pid) {
    if (!pid) return '';
    var od = AE && AE.caliberOf ? AE.caliberOf(pid) : null;
    if (!od) return '';
    var h1 = hfFor(pid, od);
    if (h1 == null) return '';
    var base = baseCal(pid);
    if (!base) return '本段水头损失 ≈' + h1.toFixed(2) + ' m（改径后，按图面流量估算）';
    var h0 = hfFor(pid, base);
    if (h0 == null) return '';
    var dlt = h1 - h0;
    return '本段水头损失 ' + h0.toFixed(2) + '→' + h1.toFixed(2) + ' m（' + (dlt <= 0 ? '减少 ' : '增加 ') + Math.abs(dlt).toFixed(2) + ' m）';
  };
  /* 管段信息卡数据（2026-09-17 第五十七轮，用户要求「点击一下管道，在鼠标旁边显示
     直径多少 / 多少米 / 水头损失多大」）：与「管段管径与损失」统计表、改径标注同一套口径
     （管长取图面有效几何含改长/平移、损失 Hazen-Williams、流量同 computeThreeLevel）。
     纯读取，不写任何水力数据。返回 null = pid 无效；字段可为 null（无数据时卡片显示「—」）。 */
  window.tlPipeCardInfo = function (pid) {
    if (!pid) return null;
    /* v163：总管段 'front-N' → 名称/长度/损失走分段模型（段流量口径，与路径测算同源）；
       管径沿用整管 front 的图面改径（AE 只认整管）。 */
    var mSeg = /^front-(\d+)$/.exec(String(pid));
    if (mSeg && window.RyTlPathMeasure && typeof window.RyTlPathMeasure.segInfo === 'function') {
      var sg = window.RyTlPathMeasure.segInfo(pid);
      if (sg && sg.len != null) {
        return {
          pid: pid,
          name: sg.name || ('总管·第' + (Number(mSeg[1]) + 1) + '段'),
          od: sg.od || null,
          baseOd: (sg.baseOd != null) ? sg.baseOd : null,
          len: sg.len,
          hf: sg.hf,
          delta: (sg.hf != null && sg.baseHf != null) ? (sg.hf - sg.baseHf) : null
        };
      }
    }
    var od = (AE && AE.caliberOf) ? AE.caliberOf(pid) : null;
    var base = baseCal(pid);
    var use = od || base;
    var L = pipeLenM(pid);
    var h0 = base ? hfFor(pid, base) : null;
    var h1 = use ? hfFor(pid, use) : null;
    return {
      pid: pid,
      name: (AE && AE.pipeName) ? AE.pipeName(pid) : pid,
      od: use || null,
      baseOd: base || null,
      len: (L > 0) ? L : null,
      hf: h1,
      delta: (h0 != null && h1 != null) ? (h1 - h0) : null
    };
  };
  /* 管上就近标注（SVG text）：'hf 2.12→1.05 ↓1.07' */
  window.tlPipeHfMark = function (pid) {
    if (!pid) return null;
    var od = AE && AE.caliberOf ? AE.caliberOf(pid) : null;
    var base = baseCal(pid);
    if (!od || !base) return null;
    var h0 = hfFor(pid, base), h1 = hfFor(pid, od);
    if (h0 == null || h1 == null || h0 <= 0) return null;
    var dlt = h1 - h0;
    return { text: 'hf ' + h0.toFixed(2) + '\u2192' + h1.toFixed(2) + (dlt <= 0 ? ' \u2193' : ' \u2191') + Math.abs(dlt).toFixed(2), color: dlt <= 0 ? '#15803d' : '#b91c1c' };
  };
  /* 汇总条与右栏共用正式扬程计算；不得累加不同路径的损失作为水泵扬程。 */
  window.tlCalSummaryText = function () {
    if (!AE || !AE.calibersMap) return '';
    var cals = AE.calibersMap(), pids = Object.keys(cals);
    if (!pids.length) return '';
    var pair = pumpComparison(), r = pair.current;
    if (!r.hydraulicPath) return '图面路径未就绪，暂无法校核水泵扬程';
    return '改径 <b>' + pids.length + '</b> 段 · 最大损失路径：第 ' + (r.hydraulicPath.zoneIndex + 1) + ' 区'
      + ' · 路径损失 ' + r.totalPipeLoss.toFixed(2) + ' m（总管 ' + r.frontPipeLoss.toFixed(2)
      + ' + 主管 ' + r.mainLoss.toFixed(2) + ' + 支管 ' + r.branchLoss.toFixed(2) + '）'
      + '<br>水泵扬程：设计 ' + pair.design.pumpHead.toFixed(1) + ' → 改径重算 <b>' + r.pumpHead.toFixed(1)
      + ' m</b>（已含安全系数，与右栏一致）';
  };
  function apply(view, pid, od) {
    var mod = view === 'ws' ? window.RyTlWs : window.RyIsoDiagram;
    if (!mod) return;
    if (Array.isArray(pid)) {   /* 同类型多选整体改径（第三十九轮） */
      if (od == null) { if (mod.clearAutoCaliberMulti) mod.clearAutoCaliberMulti(pid); else pid.forEach(function (p) { if (mod.clearAutoCaliber) mod.clearAutoCaliber(p); }); }
      else { if (mod.setAutoCaliberMulti) mod.setAutoCaliberMulti(pid, od); else pid.forEach(function (p) { if (mod.setAutoCaliber) mod.setAutoCaliber(p, od); }); }
      return;
    }
    if (od == null) { if (mod.clearAutoCaliber) mod.clearAutoCaliber(pid); return; }
    if (mod.setAutoCaliber) mod.setAutoCaliber(pid, od);
  }
  function hide() { if (menu) menu.style.display = 'none'; }
  function openMenu(view, pid, x, y) {
    if (!menu) {
      menu = document.createElement('div');
      menu.id = 'tlPipeCalMenu';
      menu.style.cssText = 'display:none;position:fixed;z-index:9999;background:#fff;border:1px solid #cbd5e1;'
        + 'border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,.18);padding:4px;min-width:150px;max-height:62vh;overflow:auto;'
        + 'font:12px/1.7 system-ui,sans-serif;color:#1f2937';
      document.body.appendChild(menu);
      menu.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('button') : null;
        if (!b || !target) return;
        if (b.getAttribute('data-add')) {
          var kind = b.getAttribute('data-add');
          var added = window.RyIsoDiagram && window.RyIsoDiagram.addManualAtScreen ? window.RyIsoDiagram.addManualAtScreen(kind, target.x, target.y) : null;
          if (added) { if (typeof tlIsoStatsRender === 'function') tlIsoStatsRender(); if (typeof setHint === 'function') setHint('已加' + (kind === 'tee' ? '三通' : kind === 'elbow' ? '弯头' : '阀门') + '：' + added.id + '（右键三通可旋转 X/Y/Z）'); }
          else if (typeof setHint === 'function') setHint('未命中管线（请沿总管/主管/支管管段点击）');
          hide(); return;
        }
        if (b.getAttribute('data-od')) {
          apply(target.view, target.pid, b.getAttribute('data-od') === 'base' ? null : parseFloat(b.getAttribute('data-od')));
          hide(); return;
        }
        /* v162：遮蔽/取消遮蔽（工作区与轴测图右键菜单共用） */
        if (b.getAttribute('data-mask') != null) {
          var maskOn = b.getAttribute('data-mask') === '1';
          if (typeof window.tlPipeHiddenChanged === 'function') {
            window.tlPipeHiddenChanged(Array.isArray(target.pid) ? { pids: target.pid, on: maskOn } : { pid: target.pid, on: maskOn });
          }
          if (typeof setHint === 'function') setHint(maskOn ? '已遮蔽：该管灰色虚线显示，且不计入材料清单（右键「取消遮蔽」可恢复）' : '已取消遮蔽：恢复显示并重新计入材料清单');
          hide(); return;
        }
      });
      document.addEventListener('click', hide, true);
      window.addEventListener('blur', hide);
    }
    target = { view: view, pid: pid, x: x, y: y };
    var isMulti = Array.isArray(pid);
    var base, od, name;
    if (isMulti) { base = null; od = null; name = ''; }
    else { base = baseCal(pid); od = AE && AE.caliberOf ? AE.caliberOf(pid) : null; name = AE && AE.pipeName ? AE.pipeName(pid) : pid; }
    var btnCss = 'display:block;width:100%;text-align:left;border:0;background:none;padding:4px 10px;cursor:pointer;border-radius:4px;font:inherit;color:inherit';
    var h = '';
    /* 轴测图「加配件」段（2026-10-01 v179 用户要求下线）：不再渲染；平面视图本无此段。
       恢复方式：把页面级 ISO_FITTING_UI_OFF 改回 false。改径 / 遮蔽等原有项不受影响。 */
    if (view === 'iso' && !window.ISO_FITTING_UI_OFF) {
      h += '<div style="padding:4px 10px;font-weight:700;color:#0369a1">轴测图 · 加配件</div>'
        + '<button type="button" data-add="tee" style="' + btnCss + '">＋ 加三通</button>'
        + '<button type="button" data-add="elbow" style="' + btnCss + '">＋ 加弯头</button>'
        + '<button type="button" data-add="valve" style="' + btnCss + '">＋ 加阀门</button>'
        + '<div style="border-bottom:1px solid #e5e7eb;margin:2px 0"></div>';
    }
    if (isMulti) h += '<div style="padding:4px 10px;font-weight:700;border-bottom:1px solid #e5e7eb;margin-bottom:2px">整体改径 · 共 ' + pid.length + ' 段（同类型）</div>';
    else h += '<div style="padding:4px 10px;font-weight:700;border-bottom:1px solid #e5e7eb;margin-bottom:2px">' + name + ' · 计算值 ' + (base ? 'Ø' + base : '—') + '</div>';
    CAL_SERIES.forEach(function (odv) {
      var cur = (od == null && base === odv) || od === odv;
      h += '<button type="button" data-od="' + odv + '" style="' + btnCss + (cur ? ';background:#f0fdf4;font-weight:700' : '') + '">Ø' + odv + (odv === 220 ? '（非标）' : '') + (cur ? ' ✓' : '') + '</button>';
    });
    if (od != null || isMulti) h += '<button type="button" data-od="base" style="' + btnCss + ';color:#b45309">恢复计算值' + (base ? ' Ø' + base : '') + '</button>';
    /* v162：遮蔽 / 取消遮蔽（用户要求「管道被遮蔽、隐藏之后，材料清单不统计被遮蔽的内容」）
       单段与多选都支持：多选只给「遮蔽这些段 / 取消遮蔽这些段」两条整批操作，避免逐段判态混乱。 */
    h += '<div style="border-bottom:1px solid #e5e7eb;margin:2px 0"></div>';
    if (isMulti) {
      h += '<button type="button" data-mask="1" style="' + btnCss + ';color:#b45309">🚫 遮蔽这 ' + pid.length + ' 段（不计入材料清单）</button>'
        + '<button type="button" data-mask="0" style="' + btnCss + ';color:#0369a1">↩ 取消遮蔽这 ' + pid.length + ' 段（恢复计入）</button>';
    } else {
      var hidNow = (typeof window.tlIsPipeHidden === 'function') ? window.tlIsPipeHidden(pid) : false;
      /* v165：总管可以「整条遮」也可以「按主管接入点只遮一段」—— 右键这一项是整条语义，
         菜单里给一行提示指向工作区的分段遮蔽（否则用户会以为总管只能整条遮）。 */
      var fSt = (pid === 'front' && typeof window.tlFrontHideState === 'function') ? window.tlFrontHideState() : null;
      if (fSt) hidNow = (fSt === 'all');
      var maskTxt = (pid === 'front')
        ? (hidNow ? '↩ 取消遮蔽整条总管（恢复计入材料清单）'
                  : (fSt === 'part' ? '🚫 遮蔽整条总管（当前仅部分段被遮蔽）' : '🚫 遮蔽整条总管（不计入材料清单）'))
        : (hidNow ? '↩ 取消遮蔽（恢复计入材料清单）' : '🚫 遮蔽此管（不计入材料清单）');
      h += '<button type="button" data-mask="' + (hidNow ? '0' : '1') + '" style="' + btnCss + ';color:' + (hidNow ? '#0369a1' : '#b45309') + '">'
        + maskTxt + '</button>';
      if (pid === 'front' && !isMulti) {
        h += '<div style="padding:2px 10px 4px;color:#94a3b8;font-size:11px;line-height:1.5">'
          + '想只遮其中一段：在三级设计工作区点「遮蔽管道」，再点总管上要遮蔽的那一段（总管已按主管接入点自动分段）</div>';
      }
    }
    menu.innerHTML = h;
    menu.style.display = 'block';
    menu.style.left = Math.max(4, Math.min(x, window.innerWidth - 170)) + 'px';
    menu.style.top = Math.max(4, y) + 'px';
    var r = menu.getBoundingClientRect();
    if (r.bottom > window.innerHeight - 8) menu.style.top = Math.max(4, window.innerHeight - r.height - 12) + 'px';
  }
  if (window.RyTlWs) window.RyTlWs.onAutoPipeContextMenu = function (pid, x, y) { openMenu('ws', pid, x, y); };
  if (window.RyIsoDiagram) window.RyIsoDiagram.onAutoPipeContextMenu = function (pid, x, y) { openMenu('iso', pid, x, y); };
  /* ===== 更新水泵扬程（2026-09-17 第四十一轮，用户要求）=====
     背景：图面改径只作标注（红线），不进选型计算。但用户要"改不同管径 → 评估最经济的
     管径与水泵"，所以给一个显式确认动作：按管道编号保存已改外径，
     写入 tlPipeOdOverride 参与 computeThreeLevel 的轮灌组逐路径校核。
     要点：
       · 未点按钮 → 覆盖为空 → 计算等同旧版；
       · 只在"图面确实改过径"的管段上生效（其余仍按 selectPipe 理论选管）；
       · 按下后按钮转「已按图面管径更新」态，并列出扬程/功率的前后差，便于比选。 */
  function odGroupOf(pid) {
    if (pid === 'front') return 'front';
    return pid.indexOf('main-') === 0 ? 'main' : 'branch';
  }
  function pipeCaliberSnapshot() {
    if (!AE || !window.tlDiagramData) return null;
    var cals = AE.calibersMap(), live = {};
    AE.allPids(window.tlDiagramData).forEach(function (pid) {
      if (cals[pid]) live[pid] = cals[pid];
    });
    return tlNormalizePipeOverride({ version: 1, geoKey: AE.geometryKey(window.tlDiagramData), calibers: live });
  }
  function pumpComparison() {
    var saved = tlPipeOdOverride;
    try {
      tlPipeOdOverride = null;
      var design = computeThreeLevel();
      tlPipeOdOverride = pipeCaliberSnapshot();
      return { design: design, current: computeThreeLevel() };
    } finally { tlPipeOdOverride = saved; }
  }
  /* 统计图面改径情况（供按钮状态与提示行） */
  window.tlPumpOverrideStat = function () {
    var cals = AE && AE.calibersMap ? AE.calibersMap() : {};
    var ids = Object.keys(cals);
    var n = 0, byKind = { front: 0, main: 0, branch: 0 };
    ids.forEach(function (pid) { if (AE.caliberOf && AE.caliberOf(pid)) { n++; byKind[odGroupOf(pid)]++; } });
    var applied = !!tlAppliedPipeOverride();
    return { n: n, byKind: byKind, applied: applied };
  };
  function pumpUpdateNote() {
    var box = document.getElementById('tlPumpUpdateBox');
    var note = document.getElementById('tlPumpUpdateNote');
    var btn = document.getElementById('tlPumpUpdateBtn');
    if (!box) return;
    var st = window.tlPumpOverrideStat();
    var hasFig = !!(window.measuredPolygon && window.measuredPolygon.length >= 3);
    box.style.display = hasFig ? '' : 'none';
    if (!hasFig) return;
    if (st.n <= 0) {
      if (note) note.textContent = '当前使用设计管径；调整图面管径后自动重算扬程。';
      if (btn) { btn.textContent = st.applied ? '⇧ 恢复设计水泵扬程' : '⇧ 更新水泵扬程'; btn.disabled = !st.applied; btn.style.opacity = st.applied ? '1' : '0.5'; }
    } else if (st.applied) {
      var count = Object.keys(tlAppliedPipeOverride().calibers).length;
      var result = computeThreeLevel();
      if (note) note.textContent = '已应用 ' + count + ' 根管道的管径，按轮灌组逐段校核。' +
        (result.hydraulicPath ? '最大损失路径：第 ' + (result.hydraulicPath.zoneIndex + 1) + ' 区。' : '') + '调整管径后自动更新。';
      if (btn) { btn.textContent = '↻ 重新校核水泵扬程'; btn.disabled = false; btn.style.opacity = '1'; }
    } else {
      if (note) note.innerHTML = '图面已改径 <b>' + st.n + '</b> 段，点下方按钮按这些管径重算扬程';
      if (btn) { btn.textContent = '⇧ 更新水泵扬程'; btn.disabled = false; btn.style.opacity = '1'; }
    }
  }
  /* ===== v137（2026-09-23 用户要求）：三级简图参数两行单一来源 =====
     「应用到图面」等改径重算后，简图/系统简图 SVG 里烤死的参数行也要跟着变——
     生成（tlAutoGenerate）与实时重写（tlSyncIsoMeta）共用本构造，保证逐字同源。
     ods = 图面实际代表径（图面改径按管长加权，无改径退回水力计算值，v116 口径）。
     v138（用户要求）：水泵参数=当前重算 r 的流量/扬程/功率，1 位小数——与经济面板
     「当前选择」同源同精度（原取结果条文本被 fmt0 取整，39 m ≠ 面板 38.9 m）；
     r 值异常时退回结果条文本兜底。
     v140（用户澄清）：管长统计 = 全地块实际用量——AE.allPids→effPts（有效几何，含手工
     改长/平移）逐段累加，与经济面板「全地块管长」同口径；不用最不利路径长度
     （r.*LenUsed 只是扬程计算用的最远分区路径）；无图面数据时退回 r.*LenUsed。 */
  /* v143（用户纠偏）：物理主管归并计数——图面 mainPipes 每分区一段，同排共线的多段
     实为同一根主管（如 20 分区两排布置 = 2 根横向主管）。按「方向+共线坐标(0.5m 容差)」
     归并后计数，供材料清单三通/总管接入阀数量与简图交接符号共用同一口径。 */
  window.tlMainLineCount = function (pipes) {
    if (!pipes || !pipes.length) return 0;
    var seen = {}, n = 0;
    pipes.forEach(function (l) {
      var pa = l[0], pb = l[l.length - 1];
      var ddx = Math.abs(pa.x - pb.x), ddy = Math.abs(pa.y - pb.y), mk;
      if (ddy <= ddx * 0.25) mk = 'H' + (Math.round((pa.y + pb.y) * 2) / 2);      /* 水平：按 y 归并 */
      else if (ddx <= ddy * 0.25) mk = 'V' + (Math.round((pa.x + pb.x) * 2) / 2); /* 垂直：按 x 归并 */
      else mk = 'S' + pa.x.toFixed(1) + ',' + pa.y.toFixed(1);                    /* 斜线：逐段各算 */
      if (!seen[mk]) { seen[mk] = 1; n++; }
    });
    return n;
  };
  /* ═══ v162（2026-09-29 用户要求）：管道遮蔽 ═══════════════════════════════════════
     用户原话：「三级管线页面增加 管道遮蔽/隐藏功能，管道被遮蔽、隐藏之后，材料清单不统计
     被遮蔽/隐藏的内容。」
     状态本体在共享编辑层 RyTlAutoEdits.hidden（pid → true；随主方案存档 / localStorage
     兜底持久化，随几何签名变化清空）。本段放「宿主侧」的三件东西：
       ① tlIsPipeHidden(pid) —— 唯一读口（简图绘制 / 材料统计 / 右键菜单都走它，不各处直读 AE）；
       ② 材料清单口径的可见主管计数（tlMainCounts / tlVisibleMainPipes）；
       ③ tlApplyHiddenPipeStyles / tlPipeHiddenChanged —— 换样式与统一刷新。
     红线：遮蔽只动「图面显示 + 材料统计」，水力计算结果一字不变（computeThreeLevel 不读 hidden）。 */
  window.tlIsPipeHidden = function (pid) {
    try { return !!(window.RyTlAutoEdits && window.RyTlAutoEdits.isHidden && window.RyTlAutoEdits.isHidden(pid)); } catch (e) { return false; }
  };
  /* v165（2026-09-30）：段级遮蔽读口 —— 这是**所有渲染/统计侧**该用的那个口（不再是 tlIsPipeHidden）。
     · pid = 'front-N'（总管第 N 段）→ hidden['front-N'] || hidden['front']（整管遮蔽 ⇒ 逐段一并遮蔽）；
     · 其它 pid（front / main-i / branch-i）→ 原样走 tlIsPipeHidden。
     为什么合并「整管」而不要求写入侧展开：右键/工具轨的「遮蔽整管」只需一条状态，
     显示与统计侧在此处统一解释，避免同一事实存两份（展开态与整管态可能各自漂移）。 */
  window.tlIsPipeSegHidden = function (pid) {
    var p = String(pid == null ? '' : pid);
    if (!/^front-\d+$/.test(p)) return window.tlIsPipeHidden(p);
    try {
      var AEseg = window.RyTlAutoEdits;
      if (!AEseg || !AEseg.isHidden) return false;
      return !!(AEseg.isHidden(p) || AEseg.isHidden('front'));
    } catch (e) { return false; }
  };
  /* v165：总管遮蔽汇总态 —— 'all'（含整管遮蔽 / 逐段全遮蔽）/ 'part'（仅部分段）/ 'none'。
     供右键菜单与工具轨文案判断该显示「遮蔽」还是「取消遮蔽」。 */
  window.tlFrontHideState = function () {
    var AEst = window.RyTlAutoEdits;
    if (!AEst || !AEst.isHidden) return 'none';
    if (AEst.isHidden('front')) return 'all';
    var cuts = (window.RyTlPathMeasure && typeof window.RyTlPathMeasure.frontRatios === 'function') ? window.RyTlPathMeasure.frontRatios() : null;
    if (!cuts || cuts.length < 2) return 'none';
    var n = cuts.length - 1, hid = 0;
    for (var i = 0; i < n; i++) if (AEst.isHidden('front-' + i)) hid++;
    return hid === 0 ? 'none' : (hid === n ? 'all' : 'part');
  };
  /* v165：总管「未遮蔽长度占比」（0..1）—— 材料清单口径：分段遮蔽只扣被遮蔽那几段。
     无分段信息 / 无任何遮蔽 → null（调用方回退旧口径：整管整段计或整段不计）。 */
  window.tlFrontVisibleRatio = function () {
    try {
      var AEvr = window.RyTlAutoEdits;
      if (!AEvr || !AEvr.hiddenMap) return null;
      var hm = AEvr.hiddenMap();
      var anyFront = false, k;
      for (k in hm) { if (hm[k] && (k === 'front' || k.indexOf('front-') === 0)) { anyFront = true; break; } }
      if (!anyFront) return null;
      var cuts = (window.RyTlPathMeasure && typeof window.RyTlPathMeasure.frontRatios === 'function') ? window.RyTlPathMeasure.frontRatios() : null;
      if (!cuts || cuts.length < 2) return null;
      var v = 0;
      for (var i = 0; i + 1 < cuts.length; i++) {
        if (!window.tlIsPipeSegHidden('front-' + i)) v += (cuts[i + 1] - cuts[i]);
      }
      return v;
    } catch (e) { return null; }
  };
  /* 主管段计数：all = 图上全部段、visible = 未遮蔽段（= 计入材料清单的段）。
     ★ all 必须保持 `window.tlDiagramData.mainPipes.length` 这一既有字面（材料清单 v142 契约项）。 */
  window.tlMainCounts = function () {
    var all = (window.tlDiagramData && window.tlDiagramData.mainPipes) ? window.tlDiagramData.mainPipes.length : 0, vis = 0;
    for (var i = 0; i < all; i++) { if (!window.tlIsPipeHidden('main-' + i)) vis++; }
    return { all: all, visible: vis, hidden: all - vis };
  };
  /* 未被遮蔽的主管段（三通/总管接入阀按物理线归并计数时排除遮蔽管） */
  window.tlVisibleMainPipes = function () {
    var d = window.tlDiagramData, out = [];
    if (!d || !d.mainPipes) return out;
    for (var i = 0; i < window.tlDiagramData.mainPipes.length; i++) { if (!window.tlIsPipeHidden('main-' + i)) out.push(d.mainPipes[i]); }
    return out;
  };
  /* 简图 / 三级系统简图框图内 SVG 的遮蔽样式：只碰 [data-tlpipe] 那几个 path 的
     stroke / 虚线 / 透明度，**管宽一律不动** ⇒ 命中容差、几何、水力全不受影响。
     为什么不用重跑 tlAutoGenerate：那会重算分区网格与支管（重建级），只为换个颜色跑一次
     太重、还可能抹掉用户的手工划分；就地换样式是纯展示层操作。
     ov / forceVisible 用于「先改样式、后写状态」的时序（工作区底图是「克隆简图」，克隆发生在
     AE 广播触发的重渲染里 → 必须让简图先呈现新样式，否则工作区克隆到旧样式）。 */
  var TL_PIPE_ORIG = { front: { c: '#111827', w: 6 }, main: { c: '#185FA5', w: 5 }, branch: { c: '#16a34a', w: 3 } };
  function tlPipeOrigOf(pid) {
    var p = String(pid);
    /* v165：总管分段 pid 'front-N' 沿用整管 front 的原色/原宽 */
    var k = (p === 'front' || p.indexOf('front-') === 0) ? 'front' : (p.indexOf('main-') === 0 ? 'main' : 'branch');
    return TL_PIPE_ORIG[k];
  }
  window.tlApplyHiddenPipeStyles = function (ov, forceVisible) {
    var hosts = ['tlDiagramContent', 'tlSysPipeBoxBody'];
    for (var hi = 0; hi < hosts.length; hi++) {
      var host = document.getElementById(hosts[hi]);
      if (!host || !host.querySelectorAll) continue;
      var els = host.querySelectorAll('[data-tlpipe-seg],[data-tlpipe]');
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        /* v165：整管引用 path（data-tlpipe-ref，stroke:none，只为工作区分段定位而存在）不参与换色 */
        if (el.getAttribute('data-tlpipe-ref')) continue;
        var pid = el.getAttribute('data-tlpipe-seg') || el.getAttribute('data-tlpipe');
        if (!pid) continue;
        if (pid !== 'front' && pid.indexOf('front-') !== 0 && pid.indexOf('main-') !== 0 && pid.indexOf('branch-') !== 0) continue;
        var hid = forceVisible ? false : ((ov && ov[pid] !== undefined) ? !!ov[pid] : window.tlIsPipeSegHidden(pid));
        var og = tlPipeOrigOf(pid);
        if (hid) {
          el.setAttribute('stroke', '#64748b');
          el.setAttribute('stroke-dasharray', '8,5');
          el.setAttribute('opacity', '0.55');
        } else {
          el.setAttribute('stroke', og.c);
          el.removeAttribute('stroke-dasharray');
          el.removeAttribute('opacity');
        }
      }
    }
  };
  /* 遮蔽变化的统一收口（工具轨「遮蔽管道」点击 / Esc / 右键菜单 都走这里）：
     先按新状态重刷简图样式 → 再写状态并广播（工作区重渲染时会克隆到新简图；轴测图走
     AE.onChange → RyIsoDiagram.redraw）→ 最后重算材料清单。
     opts: {pid,on} 单条 | {pids,on} 多条同值 | {pids,toggleEach:true} 逐条取反 | {clearAll:true} 全部恢复。 */
  window.tlPipeHiddenChanged = function (opts) {
    opts = opts || {};
    var AE2 = window.RyTlAutoEdits, d = window.tlDiagramData || null;
    if (!AE2 || !AE2.setHidden) return false;
    var ov = {}, i, ok = false;
    /* v165（总管分段遮蔽）：「整管遮蔽」与「逐段遮蔽」两种表示**不能并存** ——
       并存时 hidden['front'] 会把「取消某一段」重新盖住（读口是 「段 || 整管」），点了没反应。
       规则（写入口唯一收口，故只在这里处理一次）：
       · 本次目标里出现段 pid（front-N）而当前处于整管遮蔽 → 先把整管展开成逐段，再应用本次切换；
       · 本次目标里出现整管 pid（front）→ 先清掉全部段项（整管语义 = 各段一视同仁）。 */
    function segKeys() {
      var hm = (AE2.hiddenMap ? AE2.hiddenMap() : {}), out = [], k;
      for (k in hm) { if (hm[k] && /^front-\d+$/.test(k)) out.push(k); }
      return out;
    }
    function expandFront() {
      if (!AE2.isHidden || !AE2.isHidden('front')) return false;
      var cuts = (window.RyTlPathMeasure && typeof window.RyTlPathMeasure.frontRatios === 'function') ? window.RyTlPathMeasure.frontRatios() : null;
      if (!cuts || cuts.length < 2) return false;
      if (AE2.beginBatch) AE2.beginBatch();
      AE2.setHidden('front', false, d, 'host-expand');
      for (var e2 = 0; e2 + 1 < cuts.length; e2++) AE2.setHidden('front-' + e2, true, d, 'host-expand');
      if (AE2.endBatch) AE2.endBatch();
      return true;
    }
    function dropSegs() {
      var sk = segKeys();
      if (!sk.length) return false;
      if (AE2.beginBatch) AE2.beginBatch();
      for (var s2 = 0; s2 < sk.length; s2++) AE2.setHidden(sk[s2], false, d, 'host-segdrop');
      if (AE2.endBatch) AE2.endBatch();
      return true;
    }
    if (opts.clearAll) {
      var allHid = (AE2.hiddenMap ? Object.keys(AE2.hiddenMap()) : []);
      for (i = 0; i < allHid.length; i++) ov[allHid[i]] = false;
      window.tlApplyHiddenPipeStyles(ov, true);
      ok = AE2.clearHidden('host');
    } else {
      var pids = opts.pids ? opts.pids.slice() : (opts.pid ? [opts.pid] : []);
      if (!pids.length) return false;
      var hasSeg = false, hasFront = false;
      for (i = 0; i < pids.length; i++) {
        if (/^front-\d+$/.test(String(pids[i]))) hasSeg = true;
        else if (pids[i] === 'front') hasFront = true;
      }
      if (hasSeg) { try { expandFront(); } catch (eEx) { } }
      if (hasFront) { try { dropSegs(); } catch (eDp) { } }
      var want0 = (opts.on === undefined) ? !window.tlIsPipeSegHidden(pids[0]) : !!opts.on;
      for (i = 0; i < pids.length; i++) {
        ov[pids[i]] = opts.toggleEach ? !window.tlIsPipeSegHidden(pids[i]) : want0;
      }
      window.tlApplyHiddenPipeStyles(ov, false);
      for (i = 0; i < pids.length; i++) { if (AE2.setHidden(pids[i], ov[pids[i]], d, 'host')) ok = true; }
    }
    try { window.tlApplyHiddenPipeStyles(); } catch (eS) { }        /* 全量对齐一次（兜底） */
    try { if (window.RyTlWs && window.RyTlWs.rerenderKeepView) window.RyTlWs.rerenderKeepView(); } catch (eW) { }  /* 工作区底图=克隆简图 */
    try { if (typeof window.render === 'function') window.render(); } catch (eR) { }   /* 材料清单重算 */
    try { if (window.RyIsoDiagram && window.RyIsoDiagram.redraw) window.RyIsoDiagram.redraw(); } catch (eI) { }
    return ok;
  };
  window.tlFigParamLines = function (r) {
    var d = window.tlDiagramData;
    function figOd(kind, designOd) {
      try {
        var AE = window.RyTlAutoEdits;
        if (!AE || !AE.calibersMap || !d) return designOd;
        var cals = AE.calibersMap() || {}, pids = [], i;
        if (kind === 'front') { pids.push('front'); }
        else {
          var arr = (kind === 'main') ? d.mainPipes : d.branchPipes;
          if (arr) for (i = 0; i < arr.length; i++) pids.push(kind + '-' + i);
        }
        var sw = 0, sl = 0;
        for (i = 0; i < pids.length; i++) {
          if (window.tlIsPipeHidden(pids[i])) continue;   /* v162：遮蔽管不参与加权（与材料清单同口径） */
          var od = cals[pids[i]]; if (!od) continue;
          var pts = AE.effPts(pids[i], d); if (!pts) continue;
          var L = AE.polylineLen(pts);
          sw += od * L; sl += L;
        }
        if (!(sl > 0)) return designOd;
        return Math.round(sw / sl * 10) / 10;
      } catch (eOd) { return designOd; }
    }
    function fmtLen(v) { if (!isFinite(v)) return '—'; var f = Math.pow(10, 1); return (Math.round(v * f) / f).toFixed(1); }
    function f1(v) { return isFinite(v) ? (Math.round(v * 10) / 10).toFixed(1) : null; }
    function barTxt(id) { var el = document.getElementById(id); return el ? el.textContent : ''; }
    var ods = { front: figOd('front', r.frontPipe.od), main: figOd('main', r.mainPipe.od), branch: figOd('branch', r.branchPipe.od) };
    var pump = {
      flow: f1(r.combinedFlow) !== null ? f1(r.combinedFlow) + ' m³/h' : barTxt('tlPlanPumpFlow'),
      head: f1(r.pumpHead) !== null ? f1(r.pumpHead) + ' m' : barTxt('tlPlanPumpHead'),
      power: f1(r.motorKW_rounded) !== null ? f1(r.motorKW_rounded) + ' kW' : barTxt('tlPlanPumpPower')
    };
    /* v140：全地块管长统计（与经济面板「全地块管长」同口径：有效几何逐段累加，含手工改动） */
    function plotLen(kind) {
      try {
        var AE = window.RyTlAutoEdits;
        if (!AE || !AE.allPids || !d) return null;
        var pids = AE.allPids(d), total = 0, i, seen = false, hidSeen = false;
        for (i = 0; i < pids.length; i++) {
          var k = pids[i] === 'front' ? 'front' : (pids[i].indexOf('main-') === 0 ? 'main' : 'branch');
          if (k !== kind) continue;
          seen = true;
          /* v162：遮蔽管不计入材料清单（用户原话：「材料清单不统计被遮蔽/隐藏的内容」） */
          if (window.tlIsPipeHidden(pids[i])) { hidSeen = true; continue; }
          var pts = AE.effPts(pids[i], d); if (!pts || pts.length < 2) continue;
          /* v165（总管分段遮蔽）：总管只扣「被遮蔽段」的长度 —— 未遮蔽占比 × 总管有效长度。
             tlFrontVisibleRatio() 在「无分段信息 / 本管无任何遮蔽」时返回 null ⇒ 回退整管口径
             （旧行为逐字节不变）。占比 = 0（各段全遮蔽）等价于整管遮蔽：真实用量 0。 */
          if (kind === 'front') {
            var vr = window.tlFrontVisibleRatio();
            if (vr != null) {
              if (!(vr > 0)) { hidSeen = true; continue; }
              total += AE.polylineLen(pts) * vr;
              continue;
            }
          }
          total += AE.polylineLen(pts);
        }
        if (total > 0) return total;
        /* ★ 有这类管、但全被遮蔽 → 真实用量 0。**不能**回退 r.*LenUsed 设计值，否则
           「全遮蔽后材料清单又冒出理论管长」，正是用户要消掉的现象。
           连这类管都没有 → null，由调用方回退 r.*LenUsed（既有行为一字不变）。 */
        return (seen && hidSeen) ? 0 : null;
      } catch (eL) { return null; }
    }
    var lF = plotLen('front'), lM = plotLen('main'), lB = plotLen('branch');
    if (lF === null) lF = r.frontLenUsed;
    if (lM === null) lM = r.mainLenUsed;
    if (lB === null) lB = r.branchLenUsed;
    var l1 = '总管 Ø ' + ods.front + ' mm · ' + fmtLen(lF) + ' m · 主管 Ø ' + ods.main + ' mm · ' + fmtLen(lM) + ' m · 支管 Ø ' + ods.branch + ' mm · ' + fmtLen(lB) + ' m';
    var l2 = '联合灌溉 ' + (typeof tlGetZoneCount === 'function' ? tlGetZoneCount() : (r.zoneCount || 1)) + '区 · 水泵 ' + pump.flow + ' · ' + pump.head + ' · ' + pump.power;
    /* v142：lens = 总/主/支管全地块实际长度（plotLen 统计，无图面退回 r.*LenUsed）——
       材料清单页从三级简图口径取数用；加法扩展，既有消费方（lines/ods/pump）零感知。 */
    return { lines: [l1, l2], ods: ods, pump: pump, lens: { front: lF, main: lM, branch: lB } };
  };
  /* ===== v136（2026-09-23 用户反馈）：轴测图图例/信息行实时更新 =====
     「应用到图面」后管线与左栏结果都变了，但图例读的 tlDiagramData.meta.pipes/pump 是
     生成管线图时刻的设计口径快照（网络模型/三通菜单/损失估算/e2e 消费红线，不能改写）。
     故新增 meta.live 实时快照：pipes=按管长加权的图面实际管径（AE.calibersMap，无改径退回
     水力计算值），pump=当前重算值（v138 起与面板「当前选择」同源同精度，不再取结果条取整文本）。
     只写 live，设计口径原样保留。 */
  window.tlSyncIsoMeta = function () {
    var d = window.tlDiagramData;
    if (!d || d.version !== 1) return false;
    var r = null;
    try { r = computeThreeLevel(); } catch (e) { return false; }
    if (!r || !r.frontPipe) return false;
    var fp = window.tlFigParamLines ? window.tlFigParamLines(r) : null;
    if (!fp) return false;
    var m = d.meta || (d.meta = {});
    m.live = {
      pipes: { front: 'Ø ' + fp.ods.front + ' mm',
               main: 'Ø ' + fp.ods.main + ' mm',
               branch: 'Ø ' + fp.ods.branch + ' mm' },
      pump: fp.pump   /* v138：与面板「当前选择」同源同精度（1 位小数） */
    };
    /* v137：简图/系统简图内烤死的参数两行用同一构造实时重写
       （#tlDiagramContent 原生 + #tlSysPipeBoxBody 克隆 sc_ 前缀，后缀匹配一并命中；
         生成路径调用本函数时 SVG 尚未注入，查不到节点自然空转）。 */
    var hosts = ['tlDiagramContent', 'tlSysPipeBoxBody'];
    for (var hi = 0; hi < hosts.length; hi++) {
      var host = document.getElementById(hosts[hi]);
      if (!host || !host.querySelectorAll) continue;
      var gs = host.querySelectorAll('[id$="tlParamsGroup"]');
      for (var gi = 0; gi < gs.length; gi++) {
        var ts = gs[gi].querySelectorAll('text');
        if (ts.length >= 2) { ts[0].textContent = fp.lines[0]; ts[1].textContent = fp.lines[1]; }
      }
    }
    return true;
  };
  /* [v307 2026-10-08 用户反馈「改径结果未传递给水力计算页」] 把管路规划页最新改径结果
     （管径三项+扬程）同步进 localStorage 快照 runye_hydraulic_design_v1——水力计算页
     (runye-hydraulics.html) readDesign/computeDesign 的唯一数据源。只覆盖 pumpHead 与
     三类管 od + caliberAppliedAt 时间戳，其余字段保留生成管线图时的设计口径；水力页按
     新 od 自算逐段损失/流速，口径自然一致。调用点：① tlBindCalSels 管径下拉 change
     ② tlPumpUpdateRun（更新水泵扬程/经济面板应用/图面改径 三路收口）。 */
  window.tlSyncHydDesignSnapshot = function () {
    try {
      var raw = JSON.parse(localStorage.getItem('runye_hydraulic_design_v1') || 'null');
      if (!raw || raw.version !== 1 || !raw.hydraulics) return false;
      var r = computeThreeLevel();
      if (!r || !r.frontPipe || !r.mainPipe || !r.branchPipe) return false;
      raw.hydraulics.pumpHead = r.pumpHead;
      raw.hydraulics.frontPipe = { od: r.frontPipe.od };
      raw.hydraulics.mainPipe = { od: r.mainPipe.od };
      raw.hydraulics.branchPipe = { od: r.branchPipe.od };
      raw.caliberAppliedAt = Date.now();
      localStorage.setItem('runye_hydraulic_design_v1', JSON.stringify(raw));
      return true;
    } catch (eSync) { return false; }
  };
  window.tlPumpUpdateRun = function () {
    var st = window.tlPumpOverrideStat();
    if (st.n > 0 && (!window.RyPipePathLoss || !tlWorstPathLen().fromFigure)) return false;
    var before = null;
    try {
      var r0 = pumpComparison().design;
      before = { head: r0.pumpHead, kw: r0.motorKW_rounded, loss: r0.totalPipeLoss };
    } catch (e) { }
    tlPipeOdOverride = pipeCaliberSnapshot();
    try { tlUpdatePlanBar(); } catch (e) { console.error('[tlPumpUpdate] 重算失败：', e); }
    try { tlRefreshLossCard(); } catch (e) { }
    /* v136：meta.live 实时快照 + 轴测图重渲染（若已挂载）——图例/信息行跟着实际值走。
       redraw 内部无图面时自动空转；此收口覆盖 经济面板应用/图面改径/更新水泵扬程 三条路。 */
    try { window.tlSyncIsoMeta && window.tlSyncIsoMeta(); } catch (e) { }
    try { if (typeof window.tlSyncHydDesignSnapshot === 'function') window.tlSyncHydDesignSnapshot(); } catch (eHydSync) { }
    try { if (window.RyIsoDiagram && window.RyIsoDiagram.redraw) window.RyIsoDiagram.redraw(); } catch (e) { }
    try {
      var r1 = computeThreeLevel();
      var d = document.getElementById('tlPumpUpdateDelta');
      if (d && before) {
        var dh = r1.pumpHead - before.head, dk = r1.motorKW_rounded - before.kw, dl = r1.totalPipeLoss - before.loss;
        function sgn(v, u, dec) { return (v >= 0 ? '+' : '\u2212') + Math.abs(v).toFixed(dec === undefined ? 2 : dec) + u; }
        function col(v) { return v < -0.005 ? '#15803d' : (v > 0.005 ? '#b91c1c' : '#64748b'); }
        d.style.display = '';
        d.innerHTML = '<div style="border-top:1px dashed #cbd5e1;padding-top:5px">'
          + '<div>设计 → 改径重算 · 水泵扬程 <b>' + before.head.toFixed(1) + ' → ' + r1.pumpHead.toFixed(1) + ' m</b>'
          + ' <b style="color:' + col(dh) + '">(' + sgn(dh, ' m', 1) + ')</b></div>'
          + '<div>水泵功率 <b>' + before.kw + ' → ' + r1.motorKW_rounded + ' kW</b>'
          + ' <b style="color:' + col(dk) + '">(' + sgn(dk, ' kW', 2) + ')</b></div>'
          + '<div>设计估算 → 最大路径损失 ' + before.loss.toFixed(2) + ' → ' + r1.totalPipeLoss.toFixed(2) + ' m'
          + ' <b style="color:' + col(dl) + '">(' + sgn(dl, ' m', 2) + ')</b></div></div>';
      }
    } catch (e) { }
    pumpUpdateNote();
    return true;
  };
  (function bindPumpUpdate() {
    var btn = document.getElementById('tlPumpUpdateBtn');
    if (btn) btn.addEventListener('click', function () { window.tlPumpUpdateRun(); });
  })();
  window.tlPumpUpdateNote = pumpUpdateNote;

  /* ===== 管段管径与损失统计表（2026-09-17 第四十二轮，用户要求）=====
     三级工作区绘图区右侧：按分区**逐段**列出总管 / 主管 / 支管
     （段名 + 长度 + 管径 + 改前 / 改后水头损失 + 差值）。
     管径下拉就地在表格里改 → 走 RyTlWs.setAutoCaliber（与右键改径同源 AE.cals）→ 图面同步 + 本表数值随动。
     与轴测图「分区材料统计」的区别：那张表统计**数量**；本表统计**长度**并支持**改管径**。
     损失口径与 hfFor 同源（总管=联合流量、主管=单区、支管=单区/支管数），
     改完管径后可再点左栏「⇧ 更新水泵扬程」把管径折算进正式选型计算。 */
  var WS_STATS_KEY = 'runye_tlWsStats_collapsed';
  var WS_STATS_WKEY = 'runye_tlWsToolbar_w';   /* 第四十四轮：宽度改为工具轨宽度（旧 key 作废） */
  /* 点是否落在折线上（tol 米） */
  function wsPtOnPoly(pt, pts, tol) {
    var t2 = (tol || 0.5) * (tol || 0.5);
    for (var i = 0; i + 1 < pts.length; i++) {
      var a = pts[i], b = pts[i + 1];
      var dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
      var s = L2 > 0 ? ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / L2 : 0;
      s = s < 0 ? 0 : (s > 1 ? 1 : s);
      var qx = a.x + dx * s - pt.x, qy = a.y + dy * s - pt.y;
      if (qx * qx + qy * qy <= t2) return true;
    }
    return false;
  }
  /* 点落在哪个分区矩形；**区号与地块分区标注同口径**（行主序 zi+1 →「37区」，
     见 tlDraw 的 (zi+1)+'区'）；不在任何分区返回 null。
     2026-09-17 第四十三轮：原先返回网格坐标 R{r+1}C{c+1}，与地块上的「N区」对不上。 */
  function wsRectZone(pt, zs) {
    if (!zs || !zs.xPos || !zs.yPos || !pt) return null;
    var E = 1e-6;
    var zcN = zs.cols || (zs.xPos.length - 1);   /* 列数：区号 = r * cols + c + 1 */
    for (var c = 0; c + 1 < zs.xPos.length; c++) {
      if (pt.x >= zs.xPos[c] - E && pt.x <= zs.xPos[c + 1] + E) {
        for (var r = 0; r + 1 < zs.yPos.length; r++) {
          if (pt.y >= zs.yPos[r] - E && pt.y <= zs.yPos[r + 1] + E) return (r * zcN + c + 1) + '区';
        }
      }
    }
    return null;
  }
  /* 管段 → 分区归属：阀门优先（与 buildModel.zoneOf 同口径），几何兜底（管段中点落分区矩形） */
  function wsZoneOf(pid) {
    var d = window.tlDiagramData;
    if (!d || pid === 'front') return null;
    var pts = AE && AE.pipePts ? AE.pipePts(pid, d) : null;
    if (!pts || pts.length < 2) return null;
    var isMain = pid.indexOf('main-') === 0;
    var vs = d.valves || [];
    for (var i = 0; i < vs.length; i++) {
      var v = vs[i];
      if (!v.zone) continue;
      /* 主管比的是阀门在主管上的连接点（斜拉点 ax/ay）；支管比的是阀门实际位置 */
      var q = isMain
        ? { x: (v.ax !== undefined ? v.ax : v.x), y: (v.ay !== undefined ? v.ay : v.y) }
        : { x: v.x, y: v.y };
      if (wsPtOnPoly(q, pts, isMain ? 0.6 : 1.0)) return v.zone;
    }
    return wsRectZone(pts[Math.floor(pts.length / 2)], d.zones);
  }
  /* 逐段收集：长度取图面有效几何（含改长/平移），管径取覆盖值 or 计算值 */
  function wsSegRows() {
    var d = window.tlDiagramData;
    if (!d || d.version !== 1 || !AE || !AE.allPids) return null;
    var rows = [];
    AE.allPids(d).forEach(function (pid) {
      var epts = AE.effPts(pid, d);
      if (!epts || epts.length < 2) return;
      var len = AE.polylineLen(epts);
      var base = baseCal(pid);
      var cur = AE.caliberOf(pid);
      var h0 = base ? hfFor(pid, base) : null;
      var h1 = cur ? hfFor(pid, cur) : h0;
      rows.push({
        pid: pid, name: AE.pipeName(pid),
        kind: pid === 'front' ? 'front' : (pid.indexOf('main-') === 0 ? 'main' : 'branch'),
        zone: wsZoneOf(pid), len: len, base: base, cur: cur, changed: !!cur,
        h0: h0, h1: h1
      });
    });
    return rows.length ? rows : null;
  }
  /* ===== 管径经济性对比面板（v120，2026-09-23 用户要求）=====
     轴测图右侧列表：选不同 总管/主管/支管 管径组合 → 水泵扬程/功率/管材投入/年电费/年均总成本
     一表对比（按年均总成本升序，最低行=平衡点参考），可一键应用到图面。口径约定（用户明确）：
     · 总/主/支管长度 = 三级管线编辑的【全地块】图面有效长度（wsSegRows 汇总，含手工改动），
       不是最远点路径 —— 改径是整个地块一起改，评估的是整体费用；
     · 每组组合 = 整地块同类管道统一改径后 computeThreeLevel 重算（临时覆盖 tlPipeOdOverride，算完恢复）；
     · 六档：以水力计算设计管径为锚，向下 3 档 + 向上 2 档（不足则顺延），并强制 总≥主≥支
       （主管下限=支管设计管径、总管下限=主管设计管径、支管上限=主管设计管径 —— 「不可能比支管还小」）；
     · 管材单价为占位价（面板内可改，localStorage 记忆）；电价/年运行小时/折旧年限可改；
     · 年均总成本 = 管材投入 ÷ 折旧年限 + 功率 × 年运行小时 × 电价，升序排列即经济性排序。 */
  window.tlEconPanel = (function () {
    /* v184（P6）：默认单价表收敛为单一来源 TL_PIPE_PRICE_DEF（原此处另有第 2 份字面量副本） */
    var PRICES_DEFAULT = TL_PIPE_PRICE_DEF;
    var ASSUM_KEY = 'runye_tlEconAssum', PRICE_KEY = 'runye_tlEconPrices';
    var st = { open: false, sel: -1, selF: null, selM: null, selB: null, cache: null, cacheKey: '' };
    function assum() {
      var v = { price: 0.65, hours: 1200, years: 8, pf: 0, pm: 0, pb: 0 };
      try { var s = JSON.parse(localStorage.getItem(ASSUM_KEY) || '{}'); for (var k in v) { if (typeof s[k] === 'number' && isFinite(s[k]) && s[k] > 0) v[k] = s[k]; } } catch (e) { }
      return v;
    }
    function prices() {
      var p = {}, k;
      for (k in PRICES_DEFAULT) p[k] = PRICES_DEFAULT[k];
      try { var s = JSON.parse(localStorage.getItem(PRICE_KEY) || '{}'); for (k in s) { if (typeof s[k] === 'number' && isFinite(s[k]) && s[k] > 0) p[k] = s[k]; } } catch (e) { }
      return p;
    }
    /* 管材投入：优先「按角色单价」（经济指标分析左侧所填 总/主/支 元/m）；
       该角色未填（<=0）则回退到按管径单价表。build 与 render 共用 → 两页数字必然一致。 */
    function matOf(len, c) {
      var pr = prices(), a = assum();
      var mf = a.pf > 0 ? len.front * a.pf : len.front * (pr[c.f] || 0);
      var mm = a.pm > 0 ? len.main * a.pm : len.main * (pr[c.m] || 0);
      var mb = a.pb > 0 ? len.branch * a.pb : len.branch * (pr[c.b] || 0);
      return mf + mm + mb;
    }
    function kindOf(pid) { return pid === 'front' ? 'front' : (pid.indexOf('main-') === 0 ? 'main' : 'branch'); }
    function odOpts(design, minOd, maxOd) {
      var i = CAL_SERIES.indexOf(design);
      if (i < 0) { i = 0; for (var j = 0; j < CAL_SERIES.length; j++) { if (CAL_SERIES[j] <= design) i = j; } }
      var below = [], above = [], j2;
      for (j2 = i - 1; j2 >= 0 && below.length < 3; j2--) { var v = CAL_SERIES[j2]; if (minOd != null && v < minOd) break; below.unshift(v); }
      for (j2 = i + 1; j2 < CAL_SERIES.length && above.length < 2; j2++) { var v2 = CAL_SERIES[j2]; if (maxOd != null && v2 > maxOd) break; above.push(v2); }
      return below.concat([CAL_SERIES[i]]).concat(above);
    }
    function cacheKey() {
      var AE = window.RyTlAutoEdits, d = window.tlDiagramData;
      if (!AE || !d) return '';
      try { return AE.geometryKey(d) + '|' + AE.allPids(d).length; } catch (e) { return ''; }
    }
    function build() {
      var AE = window.RyTlAutoEdits, d = window.tlDiagramData;
      if (!AE || !d || !AE.allPids) return null;
      var rows = wsSegRows(); if (!rows) return null;
      var len = { front: 0, main: 0, branch: 0 };
      rows.forEach(function (r) { len[r.kind] += r.len; });
      var savedOv = tlPipeOdOverride, rDes;
      try { tlPipeOdOverride = null; rDes = computeThreeLevel(); } finally { tlPipeOdOverride = savedOv; }
      var dF = Math.round(rDes.frontPipe.od), dM = Math.round(rDes.mainPipe.od), dB = Math.round(rDes.branchPipe.od);
      var oF = odOpts(dF, dM, null), oM = odOpts(dM, dB, null), oB = odOpts(dB, null, dM);
      var pids = AE.allPids(d), kinds = pids.map(function (pid) { return kindOf(pid); });
      var geoKey = AE.geometryKey(d);
      var combos = [];
      oF.forEach(function (f) { oM.forEach(function (m) { if (m > f) return; oB.forEach(function (b2) { if (b2 > m) return; combos.push({ f: f, m: m, b: b2 }); }); }); });
      combos.forEach(function (c) {
        var cal = {};
        pids.forEach(function (pid, idx) { cal[pid] = kinds[idx] === 'front' ? c.f : (kinds[idx] === 'main' ? c.m : c.b); });
        var ov = tlNormalizePipeOverride({ version: 1, geoKey: geoKey, calibers: cal });
        var saved = tlPipeOdOverride, r;
        try { tlPipeOdOverride = ov; r = computeThreeLevel(); } finally { tlPipeOdOverride = saved; }
        c.head = r.pumpHead; c.kw = r.motorKW_rounded;
        /* 流速 m/s: Q(m3/h)/3600 / 截面积(m2) */
        function vOf(Q, odMm) { var d = odMm/1000*0.94; return (Q/3600)/(Math.PI*d*d/4); }
        c.vF = r.combinedFlow ? vOf(r.combinedFlow, c.f) : (r.zoneFlow ? vOf(r.zoneFlow, c.f) : 0);
        c.vM = r.zoneFlow ? vOf(r.zoneFlow, c.m) : 0;
        c.vB = r.branchFlow ? vOf(r.branchFlow, c.b) : 0;
        c.mat = matOf(len, c);
      });
      return { len: len, dF: dF, dM: dM, dB: dB, oF: oF, oM: oM, oB: oB, combos: combos, nPids: pids.length, combinedFlow: rDes.combinedFlow || 0, zoneFlow: rDes.zoneFlow || 0, branchFlow: rDes.branchFlow || 0 };
    }
    function fmtN(v, dec) { return (isFinite(v) ? v : 0).toFixed(dec == null ? 0 : dec); }
    function annualOf(c, a) { return c.mat / a.years + c.kw * a.hours * a.price; }
    function render() {
      var panelEl = document.getElementById('tlEconPanel'); if (!panelEl) return;
      var key = cacheKey();
      if (st.cacheKey !== key) { st.cache = build(); st.cacheKey = key; st.sel = -1; st.selF = null; st.selM = null; st.selB = null; }
      var D = st.cache;
      var lensEl = document.getElementById('teLens');
      if (!D) {
        if (lensEl) lensEl.innerHTML = '请先在三级管路编辑<b>生成管线图</b>（当前无图面数据），本面板按全地块管长做经济性对比。';
        document.getElementById('tePicks').innerHTML = ''; document.getElementById('teTbl').innerHTML = '';
        document.getElementById('teSum').textContent = '—'; return;
      }
      if (lensEl) lensEl.innerHTML = '全地块管长（取自三级管线编辑，含手工改动）：总管 <b>' + fmtN(D.len.front) + '</b> m · 主管 <b>' + fmtN(D.len.main) + '</b> m · 支管 <b>' + fmtN(D.len.branch) + '</b> m（共 ' + D.nPids + ' 段）。改径按整地块同类管道统一生效。';
      var a = assum();
      /* 单价可在面板内改：材料投入必须在渲染时按当前单价重算（不能烤在 build 缓存里，否则改价无效） */
      D.combos.forEach(function (c) { c.mat = matOf(D.len, c); });
      if (st.selF == null) { st.selF = D.dF; st.selM = D.dM; st.selB = D.dB; }
      function opts(list, v) { return list.map(function (o) { return '<option value="' + o + '"' + (o === v ? ' selected' : '') + '>Ø' + o + '</option>'; }).join(''); }
      if (st.selM != null && st.selF < st.selM) st.selF = st.selM;
      if (st.selB != null && st.selM < st.selB) st.selM = st.selB;
      if (st.selF < st.selM) st.selF = st.selM;
      document.getElementById('tePicks').innerHTML =
        '总管 <select id="teSelF">' + opts(D.oF, st.selF) + '</select> 主管 <select id="teSelM">' + opts(D.oM, st.selM) + '</select> 支管 <select id="teSelB">' + opts(D.oB, st.selB) + '</select>'
        + '<span style="color:#94a3b8">（最多六档：设计值下 3 档 / 上 2 档，不足六档时按 总≥主≥支 约束截断）</span>'
        + (st.notice ? '<span id="teNotice" style="color:#b45309;font-weight:600">⚠ ' + st.notice + '</span>' : '');
      document.getElementById('teAssum').innerHTML =
        '电价 <input id="teAssumPrice" type="number" min="0.01" step="0.05" value="' + a.price + '"> 元/度 · 年运行 <input id="teAssumHours" type="number" min="1" step="100" value="' + a.hours + '"> h · 折旧 <input id="teAssumYears" type="number" min="1" step="1" value="' + a.years + '"> 年';
      var rows = D.combos.map(function (c) { var e = c.kw * a.hours * a.price; return { c: c, elec: e, annual: c.mat / a.years + e }; });
      rows.sort(function (x, y) { return x.annual - y.annual; });
      var selIdx = -1, minIdx = 0;
      rows.forEach(function (r, i) { if (r.c.f === st.selF && r.c.m === st.selM && r.c.b === st.selB) selIdx = i; });
      var html = '<table><thead><tr><th>组合 总/主/支</th><th>管材投入(元)</th><th>扬程(m)</th><th>功率(kW)</th><th>年电费(元)</th><th>年均总(元/年)</th></tr></thead><tbody>';
      rows.forEach(function (r, i) {
        var cls = (i === selIdx ? 'sel ' : '') + (i === minIdx ? 'min ' : '') + (r.c.f === D.dF && r.c.m === D.dM && r.c.b === D.dB ? 'des' : '');
        html += '<tr data-i="' + i + '" class="' + cls.trim() + '">'
          + '<td>Ø' + r.c.f + ' / Ø' + r.c.m + ' / Ø' + r.c.b + '</td>'
          + '<td>' + fmtN(r.c.mat) + '</td><td>' + fmtN(r.c.head, 1) + '</td><td>' + fmtN(r.c.kw, 1) + '</td>'
          + '<td>' + fmtN(r.elec) + '</td><td class="te-annual">' + fmtN(r.annual) + '</td></tr>';
      });
      html += '</tbody></table>';
      document.getElementById('teTbl').innerHTML = html;
      document.getElementById('teNote').innerHTML = '扬程/功率 = 整地块统一改径后重算（最不利路径口径，与结果栏同源）；管材投入 = 各类总长 × 单价。绿字年均总 = 最低（平衡点参考）；「（设计）」= 水力计算选管组合。若已在「经济指标分析」左侧填了 总/主/支 管材单价，则该角色优先按角色单价、未填的角色才走上面的单价表。';
      var selRow = selIdx >= 0 ? rows[selIdx] : null;
      document.getElementById('teSum').innerHTML = selRow
        ? '当前选择：总 Ø' + selRow.c.f + ' · 主 Ø' + selRow.c.m + ' · 支 Ø' + selRow.c.b + ' → 扬程 <b>' + fmtN(selRow.c.head, 1) + ' m</b> · 功率 <b>' + fmtN(selRow.c.kw, 1) + ' kW</b> · 管材 <b>' + fmtN(selRow.c.mat) + ' 元</b> · 年均总 <b>' + fmtN(selRow.annual) + ' 元/年</b>'
        : '点击表中任一行选择组合。';
      var pr = prices();
      document.getElementById('tePrices').innerHTML = CAL_SERIES.map(function (od) {
        return '<label>Ø' + od + '<input type="number" min="0" step="1" data-teprice="' + od + '" value="' + (pr[od] != null ? pr[od] : '') + '"></label>';
      }).join('');
      /* v134：下拉驱动的跳转滚动到可视区中央 + 闪黄一次；其他渲染（改价/点行等）维持 nearest 不抢滚动 */
      if (selIdx >= 0) { var tr = document.querySelector('#teTbl tr.sel'); if (tr && tr.scrollIntoView) try { tr.scrollIntoView({ block: st.flashSel ? 'center' : 'nearest' }); if (st.flashSel) { tr.style.animation = 'none'; void tr.offsetHeight; tr.style.animation = 'teflash 1s ease-out 1'; } } catch (e) { } }
      st.flashSel = false;
    }
    function applySel() {
      var D = st.cache; if (!D) return false;
      var rows = D.combos.filter(function (c) { return c.f === st.selF && c.m === st.selM && c.b === st.selB; });
      if (!rows.length) return false;
      var c = rows[0];
      var AE = window.RyTlAutoEdits, d = window.tlDiagramData; if (!AE || !d) return false;
      var pids = AE.allPids(d), n = 0;
      /* v141 批处理：整次应用合并为一次通知——原先每段 setCaliber 都跑一遍完整
         重算+重渲染链（N 段 = N×13 遍计算 + N×3 次整幅 SVG 重建），现在只跑一遍 */
      AE.beginBatch();
      try {
        pids.forEach(function (pid) {
          var k = kindOf(pid), od = k === 'front' ? c.f : (k === 'main' ? c.m : c.b);
          try { if (AE.setCaliber(pid, od, d, 'econ')) n++; } catch (e) { }
        });
      } finally { AE.endBatch(); }
      try { if (window.tlPumpUpdateRun) window.tlPumpUpdateRun(); } catch (e) { }
      return n > 0;
    }
    /* v127：展开 = 面板 + 宽度拖拽条显示、右侧折叠细条隐藏、顶部工具栏按钮组左移（padding-right=面板宽）；
       收起 = 面板与拖拽条隐藏、右侧折叠细条出现（同左侧工具栏的收起条）、工具栏让位取消。 */
    function openP() {
      st.open = true;
      var p = document.getElementById('tlEconPanel'); if (p) p.style.display = '';
      var g = document.getElementById('tlEconGrip'); if (g) g.style.display = 'block';
      var r = document.getElementById('tlEconRail'); if (r) r.style.display = 'none';
      var tb = document.getElementById('tlIsoToolbar'); if (tb) tb.classList.add('te-padded');
      render();
    }
    function closeP() {
      st.open = false;
      var p = document.getElementById('tlEconPanel'); if (p) p.style.display = 'none';
      var g = document.getElementById('tlEconGrip'); if (g) g.style.display = 'none';
      var r = document.getElementById('tlEconRail'); if (r) r.style.display = 'flex';
      var tb = document.getElementById('tlIsoToolbar'); if (tb) tb.classList.remove('te-padded');
    }
    function toggleP() { st.open ? closeP() : openP(); }
    (function bind() {
      var btn = document.getElementById('tlEconBtn');
      if (btn) btn.addEventListener('click', toggleP);
      var panelEl = document.getElementById('tlEconPanel');
      if (!panelEl) return;
      panelEl.addEventListener('click', function (e) {
        var t = e.target;
        if (t.id === 'tlEconClose') { closeP(); return; }
        if (t.id === 'tlEconApply') { applySel(); return; }
        var tr = t.closest ? t.closest('tr[data-i]') : null;
        if (tr && st.cache) {
          var i = parseInt(tr.getAttribute('data-i'), 10);
          var a = assum();
          var rows2 = st.cache.combos.map(function (c) { return { c: c, annual: annualOf(c, a) }; });
          rows2.sort(function (x, y) { return x.annual - y.annual; });
          if (rows2[i]) { st.selF = rows2[i].c.f; st.selM = rows2[i].c.m; st.selB = rows2[i].c.b; st.sel = i; st.notice = ''; render(); }
        }
      });
      panelEl.addEventListener('change', function (e) {
        var t = e.target;
        /* v134：跳转反馈 —— 改写被 总≥主≥支 约束截断的值时显式提示（否则用户以为没跳）；flashSel 驱动居中滚动+闪黄 */
        if (t.id === 'teSelF') { var m0 = st.selM, b0 = st.selB; st.selF = parseInt(t.value, 10); if (st.selM > st.selF) st.selM = st.selF; if (st.selB > st.selM) st.selB = st.selM; st.notice = (m0 !== st.selM || b0 !== st.selB) ? '已按 总≥主≥支 约束调整：主管 Ø' + st.selM + (b0 !== st.selB ? '、支管 Ø' + st.selB : '') : ''; st.flashSel = true; render(); return; }
        if (t.id === 'teSelM') { var f0 = st.selF, b0 = st.selB; st.selM = parseInt(t.value, 10); if (st.selM > st.selF) st.selF = st.selM; if (st.selB > st.selM) st.selB = st.selM; st.notice = (f0 !== st.selF || b0 !== st.selB) ? '已按 总≥主≥支 约束调整：总管 Ø' + st.selF + (b0 !== st.selB ? '、支管 Ø' + st.selB : '') : ''; st.flashSel = true; render(); return; }
        if (t.id === 'teSelB') { var m0 = st.selM, f0 = st.selF; st.selB = parseInt(t.value, 10); if (st.selB > st.selM) st.selM = st.selB; if (st.selM > st.selF) st.selF = st.selM; st.notice = (m0 !== st.selM || f0 !== st.selF) ? '已按 总≥主≥支 约束调整：主管 Ø' + st.selM + (f0 !== st.selF ? '、总管 Ø' + st.selF : '') : ''; st.flashSel = true; render(); return; }
        if (t.id === 'teAssumPrice' || t.id === 'teAssumHours' || t.id === 'teAssumYears') {
          var a = assum();
          if (t.id === 'teAssumPrice') a.price = parseFloat(t.value) || a.price;
          if (t.id === 'teAssumHours') a.hours = parseFloat(t.value) || a.hours;
          if (t.id === 'teAssumYears') a.years = parseFloat(t.value) || a.years;
          try { localStorage.setItem(ASSUM_KEY, JSON.stringify(a)); } catch (e2) { }
          render(); return;
        }
        if (t.getAttribute && t.getAttribute('data-teprice')) {
          var od = t.getAttribute('data-teprice'), pr = prices(), v = parseFloat(t.value);
          if (isFinite(v) && v > 0) pr[od] = v; else delete pr[od];
          try { localStorage.setItem(PRICE_KEY, JSON.stringify(pr)); } catch (e3) { }
          render(); return;
        }
      });
    })();
    return { open: openP, close: closeP, toggle: toggleP, render: render, build: build, applySel: applySel };
  })();
  /* v126（2026-09-23 用户要求）：经济对比面板宽度可拖 —— 镜像 #tlWsSegStatsGrip（第四十四轮）的约定：
     没拖过不写任何变量（走 CSS 回退宽 clamp(400px,36vw,560px)），拖过即持久化 localStorage
     'runye_tlEconPanel_w'，双击恢复默认。宽度范围 [360, min(820, 画布宽-280)] —— 至少给轴测图留 280px。 */
  (function bindEconGrip(){
    var grip=document.getElementById('tlEconGrip'),wrap=document.getElementById('tlIsoDiagramWrap');
    if(!grip||!wrap)return;
    var KEY='runye_tlEconPanel_w';
    try{var w0=parseInt(localStorage.getItem(KEY),10)||0;if(w0>0)wrap.style.setProperty('--tlEconW',w0+'px');}catch(e){}
    var drag=null;
    grip.addEventListener('pointerdown',function(e){
      var pr=wrap.getBoundingClientRect();
      var maxW=Math.min(820,pr.width-280);
      if(maxW<360)return;
      drag={pr:pr,maxW:maxW};
      grip.classList.add('on');
      document.body.style.userSelect='none';
      if(grip.setPointerCapture){try{grip.setPointerCapture(e.pointerId);}catch(err){}}
      e.preventDefault();
    });
    grip.addEventListener('pointermove',function(e){
      if(!drag)return;
      var w=Math.round(Math.max(360,Math.min(drag.maxW,drag.pr.right-e.clientX)));
      wrap.style.setProperty('--tlEconW',w+'px');
      drag.w=w;
    });
    function endDrag(){drag=null;grip.classList.remove('on');document.body.style.userSelect='';}
    grip.addEventListener('pointerup',function(){
      var w=null;if(drag)w=drag.w;
      endDrag();
      if(w){try{localStorage.setItem(KEY,String(w));}catch(e){}}
    });
    grip.addEventListener('pointercancel',endDrag);
    grip.addEventListener('dblclick',function(){
      wrap.style.removeProperty('--tlEconW');
      try{localStorage.removeItem(KEY);}catch(e){}
    });
    /* v127：右侧折叠细条点击 → 重新展开面板 */
    var rail=document.getElementById('tlEconRail');
    if(rail)rail.addEventListener('click',function(){ if(window.tlEconPanel&&window.tlEconPanel.open)window.tlEconPanel.open(); });
  })();
  /* v105（2026-09-22 用户要求）：「管段管径与损失」统计表目前没啥用 → 总开关隐藏。
     后续要调回这张表时：把 TL_WS_STATS_HIDDEN 改回 false 即可，其余逻辑一律不动。 */
  window.TL_WS_STATS_HIDDEN = true;
  window.tlWsStatsRender = function () {
    var aside = document.getElementById('tlWsStats');
    var body = document.getElementById('tlWsStatsBody');
    if (!aside || !body) return;
    if (window.TL_WS_STATS_HIDDEN) { aside.style.display = 'none'; return; }   /* v105 总开关：隐藏时所有显示路径在此短路 */
    var rows = null;
    try { rows = wsSegRows(); } catch (e) { rows = null; }
    if (!rows) {
      aside.style.display = 'none';
      body.innerHTML = '<div class="tl-ws-stats-empty">生成管线图后按分区逐段列出管长与管径，可就地改管径并查看水头损失变化。</div>';
      return;
    }
    aside.style.display = '';
    function f1(v) { return (isFinite(v) ? v : 0).toFixed(1); }
    function f2(v) { return (isFinite(v) ? v : 0).toFixed(2); }
    /* 第五十轮（2026-09-17，用户要求）：取消最右侧「Δ（改后 − 改前）」列 —— 表尾不再列增减量，
       「改前 / 改后」两列并列已能看出变化。随之删除仅服务该列的 col()/sgn()，
       以及行对象上失去消费者的 dlt 字段（wsSegRows）。 */
    /* 第四十八轮（用户要求）：① 下拉里不再出现「计算值」字样，默认项直接是 Ø###（＝水力计算管径）；
       ② 「（非标）」长后缀改紧凑「*」（说明见表格底部注记）—— 框宽只需容下 Ø###，不被长文案撑宽。 */
    function odSel(r) {
      var h = '<select data-pid="' + r.pid + '"' + (r.changed ? ' class="changed"' : '')
        + ' title="改这段管的管径（与右键改径等效；选第一项恢复默认管径）">';
      h += '<option value=""' + (r.changed ? '' : ' selected') + '>' + (r.base ? 'Ø' + r.base : '\u2014') + '</option>';
      CAL_SERIES.forEach(function (odv) {
        h += '<option value="' + odv + '"' + (r.cur === odv ? ' selected' : '') + '>Ø' + odv + (odv === 220 ? '*' : '') + '</option>';
      });
      return h + '</select>';
    }
    /* 分组：总管 / 各分区 / 未归区，顺序 总管 → 1区、2区…（区号数值升序）→ 未归区 */
    var groups = {}, order = [];
    rows.forEach(function (r) {
      var key = r.kind === 'front' ? '__front' : (r.zone || '__unzoned');
      if (!groups[key]) { groups[key] = []; order.push(key); }
      groups[key].push(r);
    });
    function rank(k) { return k === '__front' ? -1 : (k === '__unzoned' ? 1 : 0); }
    /* 区号串「37区」按**数值**排序：字典序会把「10区」排到「2区」前面（2026-09-17） */
    function zoneNum(k) { var m = /^(\d+)/.exec(k); return m ? parseInt(m[1], 10) : 1e9; }
    order.sort(function (a, b) {
      var ra = rank(a), rb = rank(b);
      if (ra !== rb) return ra - rb;
      var na = zoneNum(a), nb = zoneNum(b);
      if (na !== nb) return na - nb;
      return a < b ? -1 : (a > b ? 1 : 0);
    });
    function labelOf(k) {
      if (k === '__front') return '总管（全灌区）';
      if (k === '__unzoned') return '未归入分区';
      return '分区 ' + k;
    }
    /* 第四十八轮：表头去掉冗余「(m)」后缀（单位移到 title），使表头能完整落在工具轨内，
       且表头与同列内容统一水平居中（见 tl-workspace.css 的 text-align:center）。
       第五十轮：6 列 → 5 列（Δ 列取消），列宽余量更大。 */
    var html = '<table><thead><tr>'
      + '<th title="分区 / 管段">管段</th>'
      + '<th title="图面有效长度，单位 m（含改长 / 平移）">长(m)</th>'
      + '<th title="管径，单位 mm（可就地修改）">管径</th>'
      + '<th title="改前损失：按水力计算管径的沿程水头损失，单位 m">改前</th>'
      + '<th title="改后损失：按当前图面管径的沿程水头损失，单位 m">改后</th>'
      + '</tr></thead><tbody>';
    order.forEach(function (key) {
      var list = groups[key];
      html += '<tr class="zonehead" data-zone="' + key + '"><td colspan="5">' + labelOf(key) + '</td></tr>';
      var sumL = 0, sumH0 = 0, sumH1 = 0, hasH = false;
      list.forEach(function (r) {
        sumL += r.len;
        if (r.h0 != null) { sumH0 += r.h0; sumH1 += r.h1; hasH = true; }
        html += '<tr>'
          + '<td>' + r.name + '</td>'
          + '<td>' + f1(r.len) + '</td>'
          + '<td>' + odSel(r) + '</td>'
          + '<td>' + (r.h0 != null ? f2(r.h0) : '\u2014') + '</td>'
          + '<td>' + (r.h1 != null ? f2(r.h1) : '\u2014') + '</td>'
          + '</tr>';
      });
      if (list.length > 1) {
        html += '<tr class="sum"><td>小计</td><td>' + f1(sumL) + '</td><td></td>'
          + '<td>' + (hasH ? f2(sumH0) : '\u2014') + '</td><td>' + (hasH ? f2(sumH1) : '\u2014') + '</td></tr>';
      }
    });
    var tL = 0, tH0 = 0, tH1 = 0, chN = 0;
    rows.forEach(function (r) {
      tL += r.len;
      if (r.h0 != null) { tH0 += r.h0; tH1 += r.h1; }
      if (r.changed) chN++;
    });
    html += '<tr class="grand"><td>合计</td><td>' + f1(tL) + '</td><td>' + chN + '/' + rows.length + '</td>'
      + '<td>' + f2(tH0) + '</td><td>' + f2(tH1) + '</td></tr>';
    html += '</tbody></table>';
    html += '<div class="tl-ws-stats-note">长度取图面实际几何（含改长 / 平移）；损失按 Hazen-Williams 估算；管径 ＊ 为非标 PE 外径；'
      + '流量口径与扬程计算一致（总管=联合流量、主管=单区流量、支管=单区流量/支管数）。'
      + '改完管径点左栏「⇧ 更新水泵扬程」即可折算进正式选型。</div>';
    body.innerHTML = html;
  };
  /* 第五十二轮（2026-09-17，用户要求）：「在图上选中某分区的管线，右侧统计表要直接跳到该分区」。
     用户现场：选中 24 号分区的管线，右侧对应数据已在屏幕下方，得手工在长表里翻找。
     ★ 滚动容器是 **#tlWsToolbar**（CSS overflow-y:auto；统计表在轨内按内容完全展开、自身不内滚），
       所以这里只改它的 scrollTop；**不用 scrollIntoView** —— 那会把外层文档一起滚，整页跳一下。
     ★ 目标：把该分区的组表头（tr.zonehead）放到吸顶标题（.tl-ws-stats-title）之下；
       若该分区的行放不下，退化为「让选中的那一行刚好完整可见」。已经就位时不动（连点不抖）。 */
  function wsZoneKeyOf(pid) {
    if (pid === 'front') return '__front';
    var z = null;
    try { z = wsZoneOf(pid); } catch (e) { z = null; }
    return z || '__unzoned';        /* 与 tlWsStatsRender 的分组键完全同口径 */
  }
  /* 目标元素的滚动容器：最近的「纵向可滚且真的溢出」的祖先（桌面＝工具轨；窄屏＝统计表自身） */
  function wsScrollBox(el) {
    var p = el && el.parentNode;
    while (p && p.nodeType === 1 && p !== document.body) {
      var st = null;
      try { st = getComputedStyle(p); } catch (e) { st = null; }
      if (st && /(auto|scroll|overlay)/.test(st.overflowY) && p.scrollHeight > p.clientHeight + 1) return p;
      p = p.parentNode;
    }
    return null;
  }
  /* 选中 pid → 把统计表滚到它所在的分区；返回是否真的滚了（供 e2e 断言 / 调试） */
  window.tlWsRevealPipe = function (pid) {
    if (!pid) return false;
    var aside = document.getElementById('tlWsStats');
    var body = document.getElementById('tlWsStatsBody');
    if (!aside || !body || aside.style.display === 'none') return false;      /* 还没生成图纸 */
    if (aside.classList.contains('stats-collapsed')) return false;            /* 折叠态没有可见行，滚动无意义 */
    var head = body.querySelector('tr.zonehead[data-zone="' + wsZoneKeyOf(pid) + '"]');
    if (!head) return false;
    var box = wsScrollBox(head);
    if (!box) return false;                                                  /* 整表都在视野内，不用动 */
    var selEl = body.querySelector('select[data-pid="' + pid + '"]');
    var row = selEl && selEl.closest ? selEl.closest('tr') : null;
    var title = aside.querySelector('.tl-ws-stats-title');
    var sticky = title ? title.offsetHeight + 6 : 0;                          /* 吸顶标题占掉的高度 */
    var br = box.getBoundingClientRect();
    function rel(el) { return el.getBoundingClientRect().top - br.top; }
    var d = rel(head) - sticky;                                              /* 首选：分区组表头落到标题下方 */
    if (row) {
      var rh = row.offsetHeight || 0;
      var rowRel = rel(row) - d;                                             /* 按 d 滚动后该行的相对位置 */
      if (rowRel < sticky - 0.5 || rowRel + rh > box.clientHeight + 0.5) d = rel(row) - sticky;   /* 装不下 → 直接对行 */
    }
    var max = Math.max(0, box.scrollHeight - box.clientHeight);
    var cur = box.scrollTop;
    var want = Math.round(Math.max(0, Math.min(max, cur + d)));
    /* ★ 向上跳时保留列标题行（thead）：别把它顶进吸顶标题后面 ——
       跳到最上面几个分区（尤其「总管」组）时，"把 thead 对齐到安全线"就是向上的极限。
       向下跳时 cap 通常是很大的负数，本分支不生效（不会妨碍向下对齐）。 */
    var thead = body.querySelector('thead');
    if (thead && want < cur) {
      var cap = Math.round(rel(thead) - sticky + cur);
      if (cap > 0 && cap < want) want = cap;
    }
    if (want === cur) return false;                                          /* 已经就位 → 不动 */
    box.scrollTop = want;
    return true;
  };
  (function bindWsStats() {
    var aside = document.getElementById('tlWsStats');
    var body = document.getElementById('tlWsStatsBody');
    var tg = document.getElementById('tlWsStatsToggle');
    var arrow = document.getElementById('tlWsStatsArrow');
    var pane = aside ? aside.closest('.ry-pane-ws') : null;
    if (!aside || !body) return;
    /* 统计表宽度 / 折叠态一变，画布列宽随之变 → 派发一次 resize，让 ws 图纸重新铺满容器
       （tl-workspace 的 resize 监听仅在「未缩放、未平移」时重算 baseFit，沿用既有约定）。
       rAF 去抖：拖拽过程中每帧最多派发一次，避免逐像素触发全页 resize 监听。 */
    var wsStatsRefitPending = false;
    function wsStatsRefit() {
      if (wsStatsRefitPending) return;
      wsStatsRefitPending = true;
      var run = function () {
        wsStatsRefitPending = false;
        try { window.dispatchEvent(new Event('resize')); } catch (e) { }
      };
      if (window.requestAnimationFrame) window.requestAnimationFrame(run); else setTimeout(run, 16);
    }
    /* 表格内改管径：与右键改径同源（AE.cals）；优先走 RyTlWs 以同步重渲染工作区视图 */
    body.addEventListener('change', function (e) {
      var sel = e.target && e.target.closest ? e.target.closest('select[data-pid]') : null;
      if (!sel) return;
      var pid = sel.getAttribute('data-pid');
      var v = sel.value;
      var ok = false;
      try {
        if (!v) {
          ok = (window.RyTlWs && RyTlWs.clearAutoCaliber) ? RyTlWs.clearAutoCaliber(pid) : AE.clearCaliber(pid, 'ws');
        } else {
          var od = parseFloat(v);
          ok = (window.RyTlWs && RyTlWs.setAutoCaliber) ? RyTlWs.setAutoCaliber(pid, od) : AE.setCaliber(pid, od, window.tlDiagramData, 'ws');
        }
      } catch (err) { ok = false; }
      window.tlWsStatsRender();
      if (typeof window.tlPumpUpdateNote === 'function') { try { window.tlPumpUpdateNote(); } catch (e2) { } }
      if (typeof setHint === 'function') setHint((ok ? '已把 ' : '未能修改 ') + AE.pipeName(pid) + (v ? ' 改为 Ø' + v : ' 恢复为计算值') + (ok ? '（图面已同步）' : ''));
    });
    /* 折叠（第四十四轮：统计表已在工具轨内部 → 折叠只收表体，不再改网格列宽） */
    if (tg && arrow && pane) {
      function applyCollapsed(c) {
        body.style.display = c ? 'none' : '';
        aside.classList.toggle('stats-collapsed', c);
        arrow.style.transform = c ? 'rotate(180deg)' : 'rotate(90deg)';
        tg.title = c ? '点击展开管段统计表' : '点击折叠管段统计表（收起表体，工具轨宽度不变）';
        wsStatsRefit();          // 表体显隐会改轨内高度分布 → 画布尺寸兜底重算一次
      }
      var saved = null;
      try { saved = localStorage.getItem(WS_STATS_KEY); } catch (e) {}
      applyCollapsed(saved === '1');
      tg.addEventListener('click', function () {
        var c = !aside.classList.contains('stats-collapsed');
        applyCollapsed(c);
        try { localStorage.setItem(WS_STATS_KEY, c ? '1' : '0'); } catch (e) {}
      });
    }
    /* 工具轨宽度拖拽（第四十四轮：统计表移入工具轨后，拖拽条调节的是**整条工具轨**的宽度；
       约定同轴测图：没拖过不写任何变量，走 CSS 回退值 --tlWsToolbarW）
       ★ 元素 id 用 tlWsSegStatsGrip 而非 tlWsStatsGrip：后者被轴测图统计栏的拖拽条占用
         （更早出现在文档里），同名会让 getElementById 取到轴测图那个 —— 本面板的拖拽条失联、
         且拖轴测图统计栏会误改本面板宽度（第四十二轮实测踩到，已改名）。 */
    var grip = document.getElementById('tlWsSegStatsGrip');
    var TOOLBAR_GAP = 8;   /* 与 .ry-pane-ws 的 column-gap 一致：拖拽条在轨左侧，量宽要扣掉这条缝 */
    if (grip && pane) {
      var wKEY = WS_STATS_WKEY;
      try {
        var w0 = parseInt(localStorage.getItem(wKEY), 10) || 0;
        if (w0 > 0) pane.style.setProperty('--tlWsToolbarW', w0 + 'px');
      } catch (e) {}
      var drag = null;
      grip.addEventListener('pointerdown', function (e) {
        var pr = pane.getBoundingClientRect();
        var maxW = Math.min(720, pr.width - 320);
        if (maxW < 160) return;
        drag = { pr: pr, maxW: maxW };
        grip.classList.add('on');
        document.body.style.userSelect = 'none';
        if (grip.setPointerCapture) { try { grip.setPointerCapture(e.pointerId); } catch (err) {} }
        e.preventDefault();
      });
      grip.addEventListener('pointermove', function (e) {
        if (!drag) return;
        var w = Math.round(Math.max(150, Math.min(drag.maxW, drag.pr.right - e.clientX - TOOLBAR_GAP)));
        pane.style.setProperty('--tlWsToolbarW', w + 'px');
        drag.w = w;
        wsStatsRefit();          // 拖宽 = 画布收窄 → 图纸逐帧重新铺满（rAF 去抖）
      });
      function endDrag() { drag = null; grip.classList.remove('on'); document.body.style.userSelect = ''; wsStatsRefit(); }
      grip.addEventListener('pointerup', function () {
        var w = null;
        if (drag) w = drag.w;
        endDrag();
        if (w) { try { localStorage.setItem(wKEY, String(w)); } catch (e) {} }
      });
      grip.addEventListener('pointercancel', endDrag);
      grip.addEventListener('dblclick', function () {
        pane.style.removeProperty('--tlWsToolbarW');
        try { localStorage.removeItem(wKEY); } catch (e) {}
        wsStatsRefit();          // 恢复默认宽 → 图纸重新铺满
      });
    }
    /* v98f：右侧「🧩 联合灌溉分组」面板也折叠（**默认收起**，与上方统计表同一套交互 + 持久化约定）。
       折叠只收面板内容，工具轨宽度不变；显隐会改轨内高度分布 → 同样兜底 resize 一次。 */
    (function bindTlGroupPanel() {
      var gp = document.getElementById('tlGroupPanel');
      var gpBody = document.getElementById('tlGroupPanelBody');
      var gpTg = document.getElementById('tlGroupPanelToggle');
      var gpArrow = document.getElementById('tlGroupPanelArrow');
      if (!gp || !gpBody || !gpTg) return;
      var GP_KEY = 'runye_tlGroupPanel_collapsed';
      function applyGpCollapsed(c) {
        gpBody.style.display = c ? 'none' : '';
        gp.classList.toggle('collapsed', c);
        if (gpArrow) gpArrow.style.transform = c ? 'rotate(180deg)' : 'rotate(90deg)';
        gpTg.title = c ? '点击展开联合灌溉分组' : '点击折叠联合灌溉分组';
        wsStatsRefit();
      }
      var gSaved = null;
      try { gSaved = localStorage.getItem(GP_KEY); } catch (e) {}
      /* 默认收起（2026-09-21 用户要求「联合灌溉分组折叠起来」）；用户手动展开后记住选择 */
      applyGpCollapsed(gSaved === null ? true : gSaved === '1');
      gpTg.addEventListener('click', function () {
        var c = !gp.classList.contains('collapsed');
        applyGpCollapsed(c);
        try { localStorage.setItem(GP_KEY, c ? '1' : '0'); } catch (e) {}
      });
    })();
  })();
  /* 图面改长 / 改径 / 整条平移（AE 编辑层）→ 左下角「管段长度与水头损失」同步刷新：
     最远分区路径长度走 AE.effPts（图面有效几何），几何一变数值就得跟着变；
     第四十二轮起同步刷新右侧「管段管径与损失」统计表（长度与损失都随之变）。 */
  /* v170：总管平移签名（front 的 dx,dy）—— 只在它变化时重建三级简图（水源/接入阀/连接段
     随总管跟随，见 tlAutoGenerate 内 tlFrontMv）。主管/支管的 move 不触碰简图（简图本就不显示它们的
     平移），避免每帧无谓整图重建。 */
  var tlFrontMvSig = '';
  if (AE && AE.onChange) AE.onChange(function (d) {
    window.tlPumpUpdateRun();
    try { window.tlWsStatsRender(); } catch (e) { }
    try { tlPushToHydraulicCalc(); } catch (e) { }
    if (d && d.action === 'move') {
      var _fm = (AE.moveOf ? AE.moveOf('front') : null) || null;
      var _sig = _fm ? (_fm.dx.toFixed(3) + ',' + _fm.dy.toFixed(3)) : '';
      if (_sig !== tlFrontMvSig) {
        tlFrontMvSig = _sig;
        /* 订阅顺序：工作区订阅先执行、其底图克隆的是重建前的旧简图 —— 简图重建后再补一次
           rerenderKeepView，让克隆底图与覆盖层（有效几何）同帧对齐，否则水源/接入阀停在
           上一帧位置（拖动结束后就永久差一帧）。 */
        try { if (typeof window.tlAutoGenerate === 'function') window.tlAutoGenerate({ stay: true }); } catch (eGen) { }
        try { if (window.RyTlWs && window.RyTlWs.rerenderKeepView) window.RyTlWs.rerenderKeepView(); } catch (eWs) { }
      }
    }
  });
  try { pumpUpdateNote(); } catch (e) { }
/* ═══ 管段信息卡（2026-09-17 第五十七轮，用户要求）═══════════════════════════════
   需求：「点击一下管道 应该在鼠标旁边就显示这个管道的基本信息，直径多少 多少米
   水头损失多大，这是一个信息卡片，可以自动隐藏的，卡片的位置可以拖动的」。
   · 只对三级管路编辑（ws 视图）的自动管线（总管/主管/支管）弹出；选中配件/点空白即隐藏。
   · #tlWsPipeCard 懒创建（首次点击才 appendChild 到 body）→ 页面加载零 DOM 增量，
     eq 等价性基线不受影响（同 #tlPipeCalMenu / #tlIsoCtxMenu 的既有做法）。
   · 默认贴鼠标（偏移 +16/+18，夹在视口内）；拖动过即「固定」，后续点击不再跟随鼠标，
     双击标题栏解除固定、回到跟随鼠标。固定位置与固定态一并存 localStorage。
   · 自动隐藏 8s：鼠标移入卡片暂停计时、移出重新计时；点「×」立即隐藏；取消选中立即隐藏。
   · 纯展示层，不写任何水力数据（红线同阶段2）；数值取自 tlPipeCardInfo（同一套口径）。 */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;

  var POS_KEY = 'runye_tlWsPipeCard_pos';
  var AUTO_HIDE_MS = 8000;
  var card = null, bodyEl = null, hdEl = null, pinEl = null;
  var hideTimer = null, curPid = null, pinned = false;
  var lastPt = { x: 200, y: 200 };

  function savedPos() {
    try {
      var raw = localStorage.getItem(POS_KEY); if (!raw) return null;
      var p = JSON.parse(raw);
      return (p && isFinite(p.x) && isFinite(p.y)) ? { x: +p.x, y: +p.y } : null;
    } catch (e) { return null; }
  }
  if (savedPos()) pinned = true;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function f2(v) { return (Math.round(v * 100) / 100).toFixed(2); }
  function disarm() { if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; } }
  function arm() { disarm(); hideTimer = setTimeout(hide, AUTO_HIDE_MS); }
  function visible() { return !!(card && card.style.display !== 'none'); }
  function drawPin() { if (pinEl) pinEl.textContent = pinned ? '已固定' : '跟随鼠标'; }

  function ensure() {
    if (card) return card;
    card = document.createElement('div');
    card.id = 'tlWsPipeCard';
    card.style.cssText = 'display:none;position:fixed;left:0;top:0;z-index:9997;background:#fff;'
      + 'border:1px solid #cbd5e1;border-radius:8px;box-shadow:0 10px 28px rgba(0,0,0,.18);'
      + 'min-width:168px;max-width:262px;font:12px/1.65 system-ui,-apple-system,"Microsoft YaHei",sans-serif;color:#1f2937';
    hdEl = document.createElement('div');
    hdEl.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 8px;border-bottom:1px solid #e2e8f0;'
      + 'background:#f8fafc;border-radius:7px 7px 0 0;cursor:move;user-select:none';
    var ttl = document.createElement('span');
    ttl.textContent = '管段信息';
    ttl.style.cssText = 'font-weight:600;flex:1';
    pinEl = document.createElement('span');
    pinEl.style.cssText = 'font-size:11px;color:#64748b';
    var xb = document.createElement('span');
    xb.textContent = '×';
    xb.title = '关闭（卡片也会自动隐藏）';
    xb.style.cssText = 'cursor:pointer;padding:0 3px;color:#64748b;font-size:14px;line-height:1';
    hdEl.appendChild(ttl); hdEl.appendChild(pinEl); hdEl.appendChild(xb);
    bodyEl = document.createElement('div');
    bodyEl.style.cssText = 'padding:6px 9px 7px';
    card.appendChild(hdEl); card.appendChild(bodyEl);
    document.body.appendChild(card);

    xb.addEventListener('click', function (e) { e.stopPropagation(); hide(); });
    card.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    card.addEventListener('pointerenter', disarm);
    card.addEventListener('pointerleave', function () { if (visible()) arm(); });

    var dragPid = null, off = { x: 0, y: 0 };
    hdEl.addEventListener('pointerdown', function (e) {
      dragPid = e.pointerId;
      var r = card.getBoundingClientRect();
      off.x = e.clientX - r.left; off.y = e.clientY - r.top;
      try { hdEl.setPointerCapture(e.pointerId); } catch (err) { }
      e.preventDefault();
    });
    hdEl.addEventListener('pointermove', function (e) {
      if (dragPid === null || e.pointerId !== dragPid) return;
      place(e.clientX - off.x, e.clientY - off.y);
    });
    function endDrag() {
      if (dragPid === null) return;
      dragPid = null; pinned = true; drawPin();
      try { var r = card.getBoundingClientRect(); localStorage.setItem(POS_KEY, JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top) })); } catch (err) { }
      arm();
    }
    hdEl.addEventListener('pointerup', endDrag);
    hdEl.addEventListener('pointercancel', endDrag);
    hdEl.addEventListener('dblclick', function () {      /* 双击标题栏 = 解除固定，回到跟随鼠标 */
      pinned = false; drawPin();
      try { localStorage.removeItem(POS_KEY); } catch (err) { }
      place(lastPt.x + 16, lastPt.y + 18);
    });
    return card;
  }

  function place(x, y) {
    if (!card) return;
    var w = card.offsetWidth || 190, h = card.offsetHeight || 110;
    var vw = window.innerWidth || 1200, vh = window.innerHeight || 800;
    var L = Math.max(4, Math.min(Math.round(x), vw - w - 6));
    var T = Math.max(4, Math.min(Math.round(y), vh - h - 6));
    card.style.left = L + 'px';
    card.style.top = T + 'px';
  }

  function row(k, v) {
    return '<div style="display:flex;gap:8px;align-items:baseline;margin:1px 0">'
      + '<span style="flex:none;width:56px;color:#64748b">' + k + '</span>'
      + '<span style="flex:1;word-break:break-all">' + v + '</span></div>';
  }
  function render(info) {
    /* 点取「总管第N段」等分段时，优先用段级数据（长度/管径/水头损失都按点取的线段算），
       不再被整管 tlPipeCardInfo 的总长/整管值覆盖。整管无分段 / 段级数据缺失时回退整管口径。 */
    var segPid = (info && info.segIndex != null) ? (info.id + '-' + info.segIndex) : null;
    var sg = (segPid && window.RyTlPathMeasure && typeof window.RyTlPathMeasure.segInfo === 'function')
      ? window.RyTlPathMeasure.segInfo(segPid) : null;
    var ci = (typeof window.tlPipeCardInfo === 'function') ? window.tlPipeCardInfo(info.id) : null;

    var name;
    if (segPid && info.kindLabel) name = info.kindLabel;            /* 段标签「总管·第N段」优先 */
    else if (sg && sg.name) name = sg.name;
    else name = (ci && ci.name) ? ci.name : (info.kindLabel || info.id);

    var odTxt = '—';
    if (sg && sg.od != null) {
      odTxt = 'Ø' + sg.od + ' mm';
      if (sg.baseOd != null && sg.baseOd !== sg.od) odTxt += ' <span style="color:#64748b">（计算值 Ø' + sg.baseOd + '）</span>';
    } else if (ci && ci.od != null) {
      odTxt = 'Ø' + ci.od + ' mm';
      if (ci.baseOd != null && ci.baseOd !== ci.od) odTxt += ' <span style="color:#64748b">（计算值 Ø' + ci.baseOd + '）</span>';
    }

    var lenTxt = (sg && sg.len != null) ? f2(sg.len) + ' m'
      : ((ci && ci.len != null) ? f2(ci.len) + ' m' : ((info.len != null) ? f2(info.len) + ' m' : '—'));

    var hfTxt = '—';
    if (sg && sg.hf != null) {
      hfTxt = f2(sg.hf) + ' m';
      if (sg.baseHf != null && Math.abs(sg.hf - sg.baseHf) >= 0.005) {
        hfTxt += ' <span style="color:' + (sg.hf <= sg.baseHf ? '#15803d' : '#b91c1c') + '">（'
          + (sg.hf <= sg.baseHf ? '↓' : '↑') + f2(Math.abs(sg.hf - sg.baseHf)) + ' m）</span>';
      }
    } else if (ci && ci.hf != null) {
      hfTxt = f2(ci.hf) + ' m';
      if (ci.delta != null && Math.abs(ci.delta) >= 0.005) {
        hfTxt += ' <span style="color:' + (ci.delta <= 0 ? '#15803d' : '#b91c1c') + '">（'
          + (ci.delta <= 0 ? '↓' : '↑') + f2(Math.abs(ci.delta)) + ' m）</span>';
      }
    }

    bodyEl.innerHTML = row('管段', esc(name)) + row('管径', odTxt) + row('长度', lenTxt) + row('水头损失', hfTxt)
      + '<div style="margin-top:4px;padding-top:4px;border-top:1px dashed #e2e8f0;color:#94a3b8;font-size:11px">右键管身可改管径 · 拖动此卡可固定位置</div>';
  }

  function show(info, cx, cy) {
    if (window.tlWsLayerPanelOn !== false) return;   /* v164：三面板合并 → 旧浮动卡让位，内容已并入「图层控制面板」（置 window.tlWsLayerPanelOn=false 可恢复） */
    if (!info || !info.auto) { hide(); return; }
    ensure();
    var same = (curPid === info.id), wasHidden = !visible();
    render(info);
    card.style.display = '';
    if (pinned) { var sp = savedPos(); if (sp) place(sp.x, sp.y); }
    else if (!same || wasHidden) { place(cx + 16, cy + 18); }
    curPid = info.id;
    drawPin(); arm();
  }
  function hide() {
    disarm();
    if (card) card.style.display = 'none';
    curPid = null;
  }

  /* 记最后一次指针位置：点击选中时用它把卡片放到鼠标旁（onPipeSelect 不带坐标） */
  document.addEventListener('pointerdown', function (e) {
    if (e && e.isPrimary === false) return;
    lastPt = { x: e.clientX, y: e.clientY };
  }, true);
  window.addEventListener('resize', function () {
    if (!visible()) return;
    var r = card.getBoundingClientRect();
    place(r.left, r.top);
  });

  /* 挂钩 onPipeSelect：tl-workspace.js 在选中/取消选中时触发（本脚本在所有页面脚本之后） */
  function hook() {
    var R = window.RyTlWs;
    if (!R || R._pipeCardHooked) return;
    var prev = R.onPipeSelect;
    R.onPipeSelect = function (info) {
      if (typeof prev === 'function') { try { prev(info); } catch (e) { } }
      try { if (info && info.auto) { show(info, lastPt.x, lastPt.y); } else { hide(); } } catch (e) { }
    };
    R._pipeCardHooked = true;
  }
  hook();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook); else hook();

  window.tlWsPipeCard = {
    hook: hook, hide: hide, show: show,
    visible: visible,
    pid: function () { return curPid; },
    pinned: function () { return pinned; },
    pos: function () { return card ? { x: card.offsetLeft, y: card.offsetTop } : null; },
    rect: function () { return card ? card.getBoundingClientRect() : null; }
  };
})();

/* ═══ 多选管段信息卡（2026-09-17 第五十八轮，用户要求）════════════════════════
   用户原话：「箭头位置增加一个控制按钮，点击之后我就可以多选管道……多选管道之后
   旁边同样弹出一个卡片，功能也是可以自动隐藏、拖动位置的，卡片显示我多选管道的信息，
   要求可以切换管道直径，管道多选之后长度要累加，在卡片中也显示出来，比如说一根 60m
   两根就是 120m 我选择了 5 根那就累加起来 300m 第六根是 43.2m 那累加起来就是 343.2m。」
   · 触发：link 到 window.RyTlWs.onMultiSelect（多选开关开启后普通点管身 / Ctrl+点 /
     工具轨「整体改直径」都会走到），只做链式挂钩，不覆盖工具轨那支处理函数。
   · 「切换管道直径」= 卡片内下拉，选定即对**全部已选段**统一写管径
     （RyTlWs.setAutoCaliberMulti）；选「恢复计算值」= clearAutoCaliberMulti。
     与右键改径 / 工具轨「🔧 整体改直径」是同一条 AE 写入通道，不是新开一路。
   · 「长度累加」逐段取 window.tlPipeCardInfo(pid).len（图面有效几何，含改长/平移）求和，
     逐段明细写成 “60.00 + 60.00 + … + 43.20 m”，合计单独一行加粗。
   · 懒创建（首次多选才 appendChild 到 body）→ 加载零 DOM 增量，eq 基线不受影响。
   · 8s 自动隐藏（鼠标移入暂停、移出重新计时）；拖标题栏 = 固定位置
     （localStorage runye_tlWsMultiCard_pos），双击标题栏解除固定、回到跟随鼠标。
   · 纯展示层：除调用既有改径通道外不写任何水力数据。 */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;

  var POS_KEY = 'runye_tlWsMultiCard_pos';
  var AUTO_HIDE_MS = 8000;
  var MAXDETAIL = 12;                 /* 逐段明细最多列几段，超出折叠中段 */
  var TYPE_LABEL = { front: '总管', main: '主管', branch: '支管' };
  var card = null, bodyEl = null, hdEl = null, pinEl = null;
  var hideTimer = null, pinned = false, curKey = '';
  var lastPt = { x: 200, y: 200 };

  function savedPos() {
    try {
      var raw = localStorage.getItem(POS_KEY); if (!raw) return null;
      var p = JSON.parse(raw);
      return (p && isFinite(p.x) && isFinite(p.y)) ? { x: +p.x, y: +p.y } : null;
    } catch (e) { return null; }
  }
  if (savedPos()) pinned = true;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function f2(v) { return (Math.round(v * 100) / 100).toFixed(2); }
  function disarm() { if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; } }
  function arm() { disarm(); hideTimer = setTimeout(hide, AUTO_HIDE_MS); }
  function visible() { return !!(card && card.style.display !== 'none'); }
  function drawPin() { if (pinEl) pinEl.textContent = pinned ? '已固定' : '跟随鼠标'; }
  /* v163：总管段沿用整管改径口径 */
  function odOf(pid) { var A = window.RyTlAutoEdits; var p = /^front-\d+$/.test(String(pid)) ? 'front' : pid; return (A && A.caliberOf) ? A.caliberOf(p) : null; }

  function ensure() {
    if (card) return card;
    card = document.createElement('div');
    card.id = 'tlWsMultiCard';
    card.style.cssText = 'display:none;position:fixed;left:0;top:0;z-index:9996;background:#fff;'
      + 'border:1px solid #cbd5e1;border-radius:8px;box-shadow:0 10px 28px rgba(0,0,0,.18);'
      + 'min-width:212px;max-width:302px;font:12px/1.65 system-ui,-apple-system,"Microsoft YaHei",sans-serif;color:#1f2937';
    hdEl = document.createElement('div');
    hdEl.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 8px;border-bottom:1px solid #e2e8f0;'
      + 'background:#f0fdf4;border-radius:7px 7px 0 0;cursor:move;user-select:none';
    var ttl = document.createElement('span');
    ttl.textContent = '多选管段';
    ttl.style.cssText = 'font-weight:600;flex:1';
    pinEl = document.createElement('span');
    pinEl.style.cssText = 'font-size:11px;color:#64748b';
    var xb = document.createElement('span');
    xb.textContent = '×';
    xb.title = '关闭（卡片也会自动隐藏）';
    xb.style.cssText = 'cursor:pointer;padding:0 3px;color:#64748b;font-size:14px;line-height:1';
    hdEl.appendChild(ttl); hdEl.appendChild(pinEl); hdEl.appendChild(xb);
    bodyEl = document.createElement('div');
    bodyEl.style.cssText = 'padding:6px 9px 7px';
    card.appendChild(hdEl); card.appendChild(bodyEl);
    document.body.appendChild(card);

    xb.addEventListener('click', function (e) { e.stopPropagation(); hide(); });
    card.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    card.addEventListener('pointerenter', disarm);
    card.addEventListener('pointerleave', function () { if (visible()) arm(); });
    /* 下拉改径：bodyEl 每次 render 会换 innerHTML，故监听挂在 bodyEl 上做委托 */
    bodyEl.addEventListener('change', function (e) {
      var t = e.target;
      if (t && t.id === 'tlWsMultiCalSel') applyOd(t.value);
    });

    var dragPid = null, off = { x: 0, y: 0 };
    hdEl.addEventListener('pointerdown', function (e) {
      dragPid = e.pointerId;
      var r = card.getBoundingClientRect();
      off.x = e.clientX - r.left; off.y = e.clientY - r.top;
      try { hdEl.setPointerCapture(e.pointerId); } catch (err) { }
      e.preventDefault();
    });
    hdEl.addEventListener('pointermove', function (e) {
      if (dragPid === null || e.pointerId !== dragPid) return;
      place(e.clientX - off.x, e.clientY - off.y);
    });
    function endDrag() {
      if (dragPid === null) return;
      dragPid = null; pinned = true; drawPin();
      try { var r = card.getBoundingClientRect(); localStorage.setItem(POS_KEY, JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top) })); } catch (err) { }
      arm();
    }
    hdEl.addEventListener('pointerup', endDrag);
    hdEl.addEventListener('pointercancel', endDrag);
    hdEl.addEventListener('dblclick', function () {      /* 双击标题栏 = 解除固定，回到跟随鼠标 */
      pinned = false; drawPin();
      try { localStorage.removeItem(POS_KEY); } catch (err) { }
      place(lastPt.x + 16, lastPt.y + 18);
    });
    return card;
  }

  function place(x, y) {
    if (!card) return;
    var w = card.offsetWidth || 220, h = card.offsetHeight || 132;
    var vw = window.innerWidth || 1200, vh = window.innerHeight || 800;
    var L = Math.max(4, Math.min(Math.round(x), vw - w - 6));
    var T = Math.max(4, Math.min(Math.round(y), vh - h - 6));
    card.style.left = L + 'px';
    card.style.top = T + 'px';
  }

  function row(k, v, tip) {
    var t = tip ? ' title="' + esc(tip).replace(/\n/g, '&#10;') + '"' : '';
    return '<div style="display:flex;gap:8px;align-items:baseline;margin:1px 0">'
      + '<span style="flex:none;width:56px;color:#64748b">' + k + '</span>'
      + '<span style="flex:1;word-break:break-all"' + t + '>' + v + '</span></div>';
  }

  /* 逐段取数：与「管段信息卡」同一个 tlPipeCardInfo，口径完全一致 */
  function collect(pids) {
    return (pids || []).map(function (pid) {
      var ci = (typeof window.tlPipeCardInfo === 'function') ? window.tlPipeCardInfo(pid) : null;
      var hf = (ci && ci.hf != null) ? ci.hf : null;
      var baseHf = hf;
      if (hf != null && ci.delta != null) baseHf = hf - ci.delta;
      return {
        pid: pid,
        name: (ci && ci.name) ? ci.name : pid,
        baseOd: (ci && ci.baseOd != null) ? ci.baseOd : null,
        len: (ci && ci.len != null) ? ci.len : 0,
        hf: hf, baseHf: baseHf
      };
    });
  }

  /* 管径下拉：三态 —— 全部未改（= 计算值）/ 全部同一值 / 混合 */
  function calSelect(rows) {
    var cals = rows.map(function (r) { return odOf(r.pid); });
    var anyCal = cals.some(function (v) { return v != null; });
    var allSame = cals.every(function (v) { return v === cals[0]; });
    var bases = rows.map(function (r) { return r.baseOd; });
    var baseSame = bases.every(function (v) { return v === bases[0]; });
    var curVal = anyCal ? (allSame ? String(cals[0]) : '__mix') : '';
    var css = 'flex:1;min-width:80px;font:inherit;padding:1px 2px;border:1px solid #cbd5e1;border-radius:4px;background:#fff;color:inherit';
    var h = '<select id="tlWsMultiCalSel" title="对全部已选管段统一改管径（与右键改径同一条通道）" style="' + css + '">';
    if (anyCal) h += '<option value=""' + (curVal === '' ? ' selected' : '') + '>恢复计算值' + (baseSame && bases[0] != null ? '（Ø' + bases[0] + '）' : '') + '</option>';
    else h += '<option value="" selected>计算值' + (baseSame && bases[0] != null ? ' Ø' + bases[0] : '') + '</option>';
    if (curVal === '__mix') h += '<option value="__mix" selected>混合管径 · 选一个统一改</option>';
    CAL_SERIES.forEach(function (odv) {
      h += '<option value="' + odv + '"' + ((curVal !== '' && curVal !== '__mix' && +curVal === odv) ? ' selected' : '') + '>Ø' + odv + (odv === 220 ? '（非标）' : '') + '</option>';
    });
    h += '</select>';
    return { html: h, anyCal: anyCal, od: anyCal ? cals[0] : null, allSame: allSame };
  }

  function render(pids) {
    var rows = collect(pids);
    var sumLen = 0, sumHf = 0, sumHf0 = 0, hasHf = false;
    rows.forEach(function (r) {
      sumLen += r.len;
      if (r.hf != null) { sumHf += r.hf; hasHf = true; }
      if (r.baseHf != null) sumHf0 += r.baseHf;
    });
    var type = (window.RyTlWs && RyTlWs.pipeType && pids.length) ? RyTlWs.pipeType(pids[0]) : null;
    var cs = calSelect(rows);
    /* 逐段长度明细（超 MAXDETAIL 段折叠中段）：'60.00 + 60.00 + ... + 43.20 m' */
    var parts = rows.map(function (r) { return f2(r.len); });
    var detail = (parts.length <= MAXDETAIL) ? parts.join(' + ') : (parts.slice(0, 6).join(' + ') + ' + … + ' + parts.slice(-1)[0]);
    var tipLines = rows.map(function (r, i) { return (i + 1) + '. ' + r.name + '  ' + f2(r.len) + ' m'; }).join('\n');
    var H = hdEl.firstElementChild; if (H) H.textContent = '多选管段 · ' + pids.length + ' 段';
    var hfTxt = '—';
    if (hasHf) {
      if (Math.abs(sumHf - sumHf0) >= 0.005) {
        hfTxt = '\u03a3 ' + f2(sumHf0) + ' \u2192 ' + f2(sumHf) + ' m <span style="color:' + (sumHf <= sumHf0 ? '#15803d' : '#b91c1c') + '">（' + (sumHf <= sumHf0 ? '\u2193' : '\u2191') + f2(Math.abs(sumHf - sumHf0)) + ' m）</span>';
      } else { hfTxt = '\u03a3 ' + f2(sumHf) + ' m'; }
    }
    bodyEl.innerHTML = row('类型', esc(TYPE_LABEL[type] || '同类型'))
      + row('段数', '<b>' + pids.length + '</b> 段')
      + row('管径', cs.html)
      + row('逐段长度', '<span style="color:#475569">' + detail + ' m</span>', tipLines)
      + row('长度合计', '<b style="font-size:15px;color:#15803d">' + f2(sumLen) + ' m</b>')
      + row('水头损失', hfTxt)
      + '<div style="margin-top:4px;padding-top:4px;border-top:1px dashed #e2e8f0;color:#94a3b8;font-size:11px">'
      + '改管径 = 对全部已选段统一改（与右键改径同源）· 拖动此卡可固定位置</div>';
  }

  /* 改径：v='' 恢复计算值；v='__mix' 不动；其余为外径 mm */
  function applyOd(v) {
    var R = window.RyTlWs;
    if (!R || v === '__mix') return false;
    var pids = (R.getSelSet ? R.getSelSet() : []);
    if (!pids.length) return false;
    if (v === '') return R.clearAutoCaliberMulti ? !!R.clearAutoCaliberMulti(pids) : false;
    var od = parseFloat(v);
    if (!isFinite(od) || od <= 0) return false;
    return R.setAutoCaliberMulti ? !!R.setAutoCaliberMulti(pids, od) : false;
  }

  function show(setInfo, cx, cy) {
    if (window.tlWsLayerPanelOn !== false) return;   /* v164：三面板合并 → 旧浮动卡让位，内容已并入「图层控制面板」（置 window.tlWsLayerPanelOn=false 可恢复） */
    if (!setInfo || !(setInfo.count >= 1)) { hide(); return; }
    var R = window.RyTlWs;
    var pids = (setInfo.pids && setInfo.pids.length) ? setInfo.pids.slice() : ((R && R.getSelSet) ? R.getSelSet() : []);
    if (!pids.length) { hide(); return; }
    ensure();
    var key = pids.join('|'), same = (curKey === key), wasHidden = !visible();
    render(pids);
    card.style.display = '';
    if (pinned) { var sp = savedPos(); if (sp) place(sp.x, sp.y); }
    else if (!same || wasHidden) { place(cx + 16, cy + 18); }
    curKey = key;
    drawPin(); arm();
  }
  function hide() {
    disarm();
    if (card) card.style.display = 'none';
    curKey = '';
  }

  /* 记最后一次指针位置：点管身时用它把卡片放到鼠标旁（onMultiSelect 不带坐标） */
  document.addEventListener('pointerdown', function (e) {
    if (e && e.isPrimary === false) return;
    lastPt = { x: e.clientX, y: e.clientY };
  }, true);
  window.addEventListener('resize', function () {
    if (!visible()) return;
    var r = card.getBoundingClientRect();
    place(r.left, r.top);
  });

  /* 链式挂钩 onMultiSelect（工具轨那支处理函数先行，不覆盖） */
  function hook() {
    var R = window.RyTlWs;
    if (!R || R._multiCardHooked) return;
    var prev = R.onMultiSelect;
    R.onMultiSelect = function (setInfo) {
      if (typeof prev === 'function') { try { prev(setInfo); } catch (e) { } }
      try { if (setInfo && setInfo.count >= 1) show(setInfo, lastPt.x, lastPt.y); else hide(); } catch (e) { }
    };
    R._multiCardHooked = true;
  }
  hook();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook); else hook();

  window.tlWsMultiCard = {
    hook: hook, hide: hide, show: show,
    visible: visible,
    pids: function () { var R = window.RyTlWs; return (R && R.getSelSet) ? R.getSelSet() : []; },
    pinned: function () { return pinned; },
    pos: function () { return card ? { x: card.offsetLeft, y: card.offsetTop } : null; },
    rect: function () { return card ? card.getBoundingClientRect() : null; },
    setOd: applyOd
  };
})();
})();
/* ═══ v164（2026-09-30 用户要求）：图层控制面板（三面板合并）══════════════════════════
   把原本分散的三块：① 画布右上角三枚图层勾选（标注显示/地块文字/最远水路）
   ② 管段信息浮动卡 ③ 多选管段浮动卡，合并为一个右侧浮层 #tlWsLayerPanel，集中管理：
   图层显隐开关 + 当前选中信息 + 批量操作。
   · 图层勾选：面板内勾选框写回原三枚 chip（保留 id 与既有联动）并派发 change；
     原三枚 chip 用 CSS 隐藏（逻辑不动，可回退）。
   · 当前选中：挂钩 RyTlWs.onPipeSelect / onMultiSelect 渲染（口径仍取 tlPipeCardInfo）。
   · 批量操作：作用于当前选择集（getSelSet，空则退回单选中管）—— 改径 / 清除改径 / 遮蔽 / 取消遮蔽 / 清空选择。
   · 旧两张浮动卡以 window.tlWsLayerPanelOn 门控让位（置 false 可恢复）。
   红线：纯展示/交互层；批量改径与遮蔽走既有 AE 写入通道，不新开数据路径。 */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  window.tlWsLayerPanelOn = true;   /* 合并开关：旧浮动卡让位；置 false 可恢复 */
  var panel = null, bodyEl = null, collapsed = false, lastSel = null;
  var POS_KEY = 'runye_tlWsLayerPanel_pos', W_KEY = 'runye_tlWsLayerPanel_w';
  var manualPos = false;   /* 用户拖动过后=手动定位（停用画布右上自动对齐）；双击标题栏恢复 */

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function odSeries() { try { if (typeof PE_OD_SERIES !== 'undefined' && PE_OD_SERIES.length) return PE_OD_SERIES.slice(); } catch (e) { } return [63, 75, 90, 110, 140, 160, 200, 250, 315, 355, 400]; }
  function chipChecked(id) { var c = document.getElementById(id); return c ? !!c.checked : true; }
  function row(k, v) { return '<div style="display:flex;gap:6px;align-items:baseline;margin:1px 0"><span style="flex:none;width:52px;color:#64748b">' + k + '</span><span style="flex:1;word-break:break-all">' + v + '</span></div>'; }

  function ensure() {
    if (panel) return panel;
    var st = document.createElement('style');
    st.textContent = '#tlWsLabelsChkWrap,#tlWsZoneChkWrap,#tlWsWorstChkWrap{display:none !important}';
    (document.head || document.documentElement).appendChild(st);
    panel = document.createElement('div');
    panel.id = 'tlWsLayerPanel';
    panel.style.cssText = 'position:absolute;top:8px;right:300px;z-index:9994;width:238px;max-height:70vh;overflow:auto;background:rgba(255,255,255,.97);border:1px solid #cbd5e1;border-radius:10px;box-shadow:0 10px 28px rgba(15,23,42,.18);font:12px/1.6 system-ui,-apple-system,"Microsoft YaHei",sans-serif;color:#1f2937';
    var head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px 9px;background:#f1f5f9;border-bottom:1px solid #e2e8f0;cursor:move;user-select:none;position:sticky;top:0;touch-action:none';
    head.title = '拖动 = 移动面板 · 双击 = 回到画布右上默认位 · 单击 = 折叠/展开';
    head.innerHTML = '<b style="flex:1;color:#334155">图层控制</b><span id="tlWsLayerPanelGrip" title="左右拖动调节面板宽度（200~480px，自动记忆）" style="cursor:ew-resize;color:#94a3b8;padding:0 3px;user-select:none;touch-action:none">↔</span><span id="tlWsLayerPanelCaret" style="color:#64748b">▾</span>';
    bodyEl = document.createElement('div');
    bodyEl.style.cssText = 'padding:7px 9px 9px';
    panel.appendChild(head); panel.appendChild(bodyEl);
    if(window.RyMobile && window.RyMobile.isActive()){ collapsed=true; bodyEl.style.display='none'; panel.querySelector('#tlWsLayerPanelCaret').textContent='▸'; }
    var ctn = document.getElementById('tlWsContent');
    var host = (ctn && ctn.parentNode) ? ctn.parentNode : document.body;
    host.appendChild(panel);
    /* v164b：恢复上次的宽度与位置（有位置存档=手动定位，停用自动对齐） */
    try { var sw = parseInt(localStorage.getItem(W_KEY), 10); if (isFinite(sw) && sw >= 200 && sw <= 480) panel.style.width = sw + 'px'; } catch (e) { }
    try {
      var sp = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
      if (sp && isFinite(sp.x) && isFinite(sp.y)) { manualPos = true; panel.style.left = sp.x + 'px'; panel.style.top = sp.y + 'px'; panel.style.right = 'auto'; }
    } catch (e) { }
    /* v164b：标题栏拖动 = 移动面板（>4px 判拖动，切 left/top 并停用自动对齐；存档）；
       双击 = 回画布右上默认位；单击 = 折叠/展开（拖动后抑制误触） */
    var dragPid = null, dragStart = null, moved = false, suppressClick = false;
    head.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      dragPid = e.pointerId; moved = false;
      dragStart = { x: e.clientX, y: e.clientY, l: panel.offsetLeft, t: panel.offsetTop };
      try { head.setPointerCapture(e.pointerId); } catch (err) { }
    });
    head.addEventListener('pointermove', function (e) {
      if (dragPid === null || e.pointerId !== dragPid || !dragStart) return;
      var dx = e.clientX - dragStart.x, dy = e.clientY - dragStart.y;
      if (!moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      moved = true; suppressClick = true;
      var op = panel.offsetParent || document.body;
      var w = panel.offsetWidth || 238, h = panel.offsetHeight || 120;
      var L = Math.max(4, Math.min(dragStart.l + dx, (op.clientWidth || 1200) - w - 4));
      var T = Math.max(4, Math.min(dragStart.t + dy, (op.clientHeight || 800) - h - 4));
      panel.style.left = L + 'px'; panel.style.top = T + 'px'; panel.style.right = 'auto';
    });
    function lpEndDrag(e) {
      if (dragPid === null || (e && e.pointerId !== dragPid)) return;
      dragPid = null;
      if (moved) {
        manualPos = true;
        try { localStorage.setItem(POS_KEY, JSON.stringify({ x: panel.offsetLeft, y: panel.offsetTop })); } catch (err) { }
      }
    }
    head.addEventListener('pointerup', lpEndDrag);
    head.addEventListener('pointercancel', lpEndDrag);
    head.addEventListener('click', function () {
      if (suppressClick) { suppressClick = false; return; }
      collapsed = !collapsed; bodyEl.style.display = collapsed ? 'none' : ''; var c = document.getElementById('tlWsLayerPanelCaret'); if (c) c.textContent = collapsed ? '▸' : '▾';
    });
    head.addEventListener('dblclick', function () {
      manualPos = false; panel.style.left = 'auto';
      try { localStorage.removeItem(POS_KEY); } catch (err) { }
      try { align(); } catch (err) { }
    });
    /* v164b：↔ 手柄左右拖动调宽（右锚定拖左加宽 / 左锚定拖右加宽），200~480px，localStorage 记忆 */
    var rPid = null, rStart = null;
    var lpGrip = document.getElementById('tlWsLayerPanelGrip');
    if (lpGrip) {
      lpGrip.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;
        rPid = e.pointerId;
        rStart = { x: e.clientX, w: panel.offsetWidth, ra: !(panel.style.left && panel.style.left !== 'auto') };
        try { lpGrip.setPointerCapture(e.pointerId); } catch (err) { }
        e.preventDefault(); e.stopPropagation();
      });
      lpGrip.addEventListener('pointermove', function (e) {
        if (rPid === null || e.pointerId !== rPid || !rStart) return;
        var nw = rStart.ra ? (rStart.w + (rStart.x - e.clientX)) : (rStart.w + (e.clientX - rStart.x));
        panel.style.width = Math.max(200, Math.min(480, nw)) + 'px';
      });
      function lpEndR() {
        if (rPid === null) return;
        rPid = null;
        try { localStorage.setItem(W_KEY, String(panel.offsetWidth)); } catch (err) { }
      }
      lpGrip.addEventListener('pointerup', lpEndR);
      lpGrip.addEventListener('pointercancel', lpEndR);
    }
    bodyEl.addEventListener('change', onBodyChange);
    bodyEl.addEventListener('click', onBodyClick);
    function align() {
      if (manualPos) return;   /* v164b：用户拖动定位后不再自动对齐（双击标题栏恢复） */
      try {
        var c = document.getElementById('tlWsContent'), pane = panel.parentNode;
        if (!c || !pane) return;
        var pr = pane.getBoundingClientRect(), cr = c.getBoundingClientRect();
        if (cr.width < 40) return;
        var r = Math.max(8, (pr.right - cr.right) + 8), t = Math.max(8, (cr.top - pr.top) + 8);
        panel.style.right = r + 'px'; panel.style.top = t + 'px';
      } catch (e) { }
    }
    if (window.ResizeObserver) { try { new ResizeObserver(align).observe(document.getElementById('tlWsContent')); } catch (e) { } }
    window.addEventListener('resize', align);
    setTimeout(align, 400); align();
    render();
    return panel;
  }

  function syncChip(id, checked) {
    var c = document.getElementById(id);
    if (c && !!c.checked !== !!checked) { c.checked = checked; try { c.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) { } }
  }
  function onBodyChange(e) {
    var t = e.target; if (!t || !t.getAttribute) return;
    var k = t.getAttribute('data-lp'); if (!k) return;
    if (k === 'labels') syncChip('tlWsLabelsChk', t.checked);
    else if (k === 'zone') syncChip('tlWsZoneChk', t.checked);
    else if (k === 'worst') syncChip('tlWsWorstChk', t.checked);
    render();
  }
  function targets() {
    var R = window.RyTlWs, out = [];
    try { var s = (R && R.getSelSet) ? R.getSelSet() : []; if (s && s.length) return s.slice(); } catch (e) { }
    if (lastSel && lastSel.pid) out.push(lastSel.pid);
    return out;
  }
  function onBodyClick(e) {
    var b = (e.target && e.target.closest) ? e.target.closest('[data-lpact]') : null;
    if (!b) return;
    var act = b.getAttribute('data-lpact'), R = window.RyTlWs; if (!R) return;
    if (act === 'clearSel') { try { if (R.clearSelSet) R.clearSelSet(); } catch (e2) { } setTimeout(render, 0); return; }
    var pids = targets(); if (!pids.length) return;
    try {
      if (act === 'hide') { if (window.tlPipeHiddenChanged) window.tlPipeHiddenChanged({ pids: pids, toggleEach: true }); }
      else if (act === 'unhide') { if (window.tlPipeHiddenChanged) window.tlPipeHiddenChanged({ pids: pids, on: false }); }
      else if (act === 'od') { var od = parseFloat(b.getAttribute('data-od')); if (isFinite(od) && R.setAutoCaliberMulti) R.setAutoCaliberMulti(pids, od); }
      else if (act === 'odclear') { if (R.clearAutoCaliberMulti) R.clearAutoCaliberMulti(pids); }
    } catch (e3) { }
    setTimeout(render, 0);
  }
  function cbRow(k, label, checked) {
    return '<label style="display:flex;gap:6px;align-items:center;margin:2px 0;cursor:pointer;user-select:none">'
      + '<input type="checkbox" data-lp="' + k + '"' + (checked ? ' checked' : '') + ' style="margin:0;width:12px;height:12px;cursor:pointer;accent-color:#185FA5">'
      + '<span>' + esc(label) + '</span></label>';
  }
  function selHtml() {
    if (lastSel && lastSel.multi) {
      var s = lastSel.multi;
      var tl = (s.type === 'front') ? '总管' : ((s.type === 'main') ? '主管' : ((s.type === 'branch') ? '支管' : '管段'));
      return '<div style="color:#334155">已选 ' + s.count + ' 段 · 合计 ' + (Number(s.totalLen) || 0).toFixed(1) + ' m · ' + esc(tl) + '</div>';
    }
    if (lastSel && lastSel.pid && typeof window.tlPipeCardInfo === 'function') {
      var ci = null; try { ci = window.tlPipeCardInfo(lastSel.pid); } catch (e) { }
      if (ci) {
        var odv = (ci.od != null) ? ('Ø' + ci.od) : ((ci.baseOd != null) ? ('Ø' + ci.baseOd) : '—');
        return row('管段', esc(ci.name || lastSel.pid)) + row('管径', odv)
          + row('长度', (ci.len != null ? Number(ci.len).toFixed(1) : '—') + ' m')
          + row('水头损失', (ci.hf != null ? Number(ci.hf).toFixed(2) : '—') + ' m');
      }
    }
    return '<div style="color:#94a3b8;font-size:11px">未选中（点管道查看信息）</div>';
  }
  function batchHtml() {
    var pids = targets();
    if (!pids.length) return '<div style="color:#94a3b8;font-size:11px">先选中管段（多选可批量改径 / 遮蔽）</div>';
    var btn = 'border:1px solid #cbd5e1;background:#fff;color:#475569;border-radius:4px;padding:1px 6px;cursor:pointer;font:inherit;font-size:11px';
    var h = '<div style="color:#64748b;font-size:11px;margin:0 0 3px">作用对象：' + pids.length + ' 段</div>';
    h += '<div style="color:#475569;margin:2px 0 2px">管径</div><div style="display:flex;flex-wrap:wrap;gap:3px;margin:0 0 5px">';
    odSeries().forEach(function (od) { h += '<button type="button" data-lpact="od" data-od="' + od + '" style="' + btn + '">Ø' + od + '</button>'; });
    h += '<button type="button" data-lpact="odclear" style="' + btn + ';border-color:#fca5a5;color:#b91c1c">清除</button></div>';
    h += '<div style="color:#475569;margin:2px 0 2px">遮蔽</div><div style="display:flex;flex-wrap:wrap;gap:3px">';
    h += '<button type="button" data-lpact="hide" style="' + btn + '">遮蔽</button>'
      + '<button type="button" data-lpact="unhide" style="' + btn + '">取消遮蔽</button>'
      + '<button type="button" data-lpact="clearSel" style="' + btn + '">清空选择</button></div>';
    return h;
  }
  function render() {
    if (!panel || !bodyEl) return;
    var h = '';
    h += '<div style="font-weight:600;color:#475569;margin:0 0 3px">图层显隐</div>';
    h += cbRow('labels', '标注显示', chipChecked('tlWsLabelsChk'));
    h += cbRow('zone', '地块文字', chipChecked('tlWsZoneChk'));
    h += cbRow('worst', '最远水路', chipChecked('tlWsWorstChk'));
    h += '<div style="font-weight:600;color:#475569;margin:8px 0 3px;border-top:1px dashed #e2e8f0;padding-top:6px">当前选中</div>';
    h += selHtml();
    h += '<div style="font-weight:600;color:#475569;margin:8px 0 3px;border-top:1px dashed #e2e8f0;padding-top:6px">批量操作</div>';
    h += batchHtml();
    bodyEl.innerHTML = h;
  }
  function hookSel() {
    var R = window.RyTlWs; if (!R || R._layerPanelHooked) return;
    var prevP = R.onPipeSelect;
    R.onPipeSelect = function (info) { if (typeof prevP === 'function') { try { prevP(info); } catch (e) { } } try { lastSel = (info && info.auto) ? { pid: info.id } : null; } catch (e) { } render(); };
    var prevM = R.onMultiSelect;
    R.onMultiSelect = function (setInfo) { if (typeof prevM === 'function') { try { prevM(setInfo); } catch (e) { } } try { lastSel = (setInfo && setInfo.count >= 1) ? { multi: setInfo } : null; } catch (e) { } render(); };
    R._layerPanelHooked = true;
  }
  function boot() { ensure(); hookSel(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.tlWsLayerPanel = { refresh: render, el: function () { return panel; } };
})();
