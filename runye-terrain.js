(function (root) {
  'use strict';
  /* [v454 2026-10-15] 地形高程由三级参数条中的按钮统一迁入 #ryCadGrpTerrain 折叠分组，
     与二级、三级面板同级；面板内容在该分组内展开。字段、校验、保存与应用逻辑不变。
     其余页面仍保留各自入口；三级旧按钮会在初始化时清除，以兼容已存在的旧 DOM。
     [v245 2026-10-05] 手动地形高程原为内联折叠面板；字段、校验、保存与应用逻辑不变。
     [v247 2026-10-05] 触发按钮：三角常驻；字号 12→11px；平时也深绿块白字（与展开态一致），hover 加深。
     [v248 2026-10-05] 三角方向对调（v247 理解反了）：箭头表示面板当前状态——收起 ▴ 向上、展开 ▾ 向下。
     缓存 css?v=254、js?v=256，PWA v16。
     缓存参数升 ?v=246，PWA VERSION 同步升级（sw.js）。 */
  var state = { version: 1, enabled: false, source: null, pumpHead: null, maxPressure: null, plots: {} };
  var storageKey = 'runye_manual_terrain_v1';
  function finite(v) { return typeof v === 'number' && Number.isFinite(v); }
  function copy(v) { return JSON.parse(JSON.stringify(v)); }
  function validate(s) {
    if (!s || s.version !== 1 || !s.plots || typeof s.plots !== 'object' || Array.isArray(s.plots)) return null;
    var out = { version: 1, enabled: s.enabled === true, source: finite(s.source) ? s.source : null,
      pumpHead: finite(s.pumpHead) && s.pumpHead >= 0 ? s.pumpHead : null,
      maxPressure: finite(s.maxPressure) && s.maxPressure > 0 ? s.maxPressure : null, plots: {} };
    Object.keys(s.plots).forEach(function (k) {
      var p = s.plots[k];
      if (p && finite(p.high) && (p.low == null || finite(p.low) && p.low <= p.high)) out.plots[k] = { high: p.high, low: p.low == null ? null : p.low };
    });
    return out;
  }
  /* [v437 2026-10-14 用户要求] 04 地块分区页取消「地形高程」入口与「滴灌带压差改善 /
     地形高程」按钮行：宿主列表移除 planDh，planBtnRow 行容器机制（v280 引入，仅为该页
     服务）随之整体移除；01 页（fld_dh）、土地流转页（tl_dh/tlPlanBar）、成组页
     （grBlockCard）、设置页（settingsForm）的地形入口不受影响。 */
  // All elevations share one datum. Lift is from the water surface to the pump outlet datum.
  function assess(p, source, losses, o) {
    if (!p || !finite(p.high) || !finite(source)) return null;
    var low = finite(p.low) ? p.low : p.high, rise = p.high - source;
    var raw = o.lift + rise + o.target * 10.2 - o.existing * 10.2 + losses + o.filter + 2;
    var result = { rise: rise, requiredHead: Math.max(0, raw) * 1.1, pressureLow: null, pressureHigh: null };
    if (finite(o.pumpHead)) {
      // Low pressure: highest point and estimated full-load path loss.
      result.pressureLow = (o.pumpHead + o.existing * 10.2 - o.lift - rise - losses - o.filter) / 10.2;
      // High pressure: lowest point, zero friction bound (static / closed valves).
      result.pressureHigh = (o.pumpHead + o.existing * 10.2 - o.lift - (low - source)) / 10.2;
    }
    return result;
  }
  var api = { assess: assess, validate: validate, exportState: function () { return copy(state); },
    importState: function (s) { if (panel) collapse(); state = validate(s) || { version: 1, enabled: false, source: null, pumpHead: null, maxPressure: null, plots: {} }; persist(); refresh(); },
    resolveDh: function (fallback, third) {
      if (!state.enabled || !finite(state.source)) return fallback;
      var list = entries(), ge = root.__runyeGroupEdit, idx = third ? root.__runyeTlBlock : (ge && ge.mode === 'perPlot' ? ge.current : null);
      if (idx != null && list[idx]) list = [list[idx]];
      if (!list.length || list.some(function (e) { return !state.plots[e.key]; })) return fallback;
      return Math.max.apply(null, list.map(function (e) { return state.plots[e.key].high - state.source; }));
    }, refresh: refresh };
  root.RyTerrain = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (!root.document) return;
  var doc = root.document, panel, openBtn;
  try { state = validate(JSON.parse(root.localStorage.getItem(storageKey))) || state; } catch (e) {}
  function persist() { try { root.localStorage.setItem(storageKey, JSON.stringify(state)); return true; } catch (e) { return false; } }
  function entries() {
    var mobile = root.RyMobileMapPreview;
    if (mobile) { var m = mobile.getState(); return m.points.length >= 3 && !m.drawing ? [{ key: 'mobile:' + JSON.stringify(m.points), name: '当前地块 / 梯田层' }] : []; }
    var subs = root.__runyeSubPlots, ge = root.__runyeGroupEdit;
    if (ge && ge.active && subs && subs.length >= 2) return subs.map(function (s, i) {
      return { key: 'plot:' + (s.id != null ? s.id : JSON.stringify(s.poly)), name: s.name || '梯田层 ' + (i + 1), index: i };
    });
    var ring = root.measuredPolygon;
    return ring && ring.length >= 3 ? [{ key: 'plot:' + (root.currentPlotId || JSON.stringify(ring)), name: '当前地块 / 梯田层' }] : [];
  }
  function importedProfile(entry, index) {
    var src = root.__runyeImportedTerrain, rows = src && Array.isArray(src.plots) ? src.plots : [];
    var row = rows[index];
    return row && finite(row.maxZ) && finite(row.minZ) ? row : null;
  }
  function escape(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function input(name, v, extra) { return '<input type="number" step="any" inputmode="decimal" data-terrain="' + name + '" value="' + (finite(v) ? v : '') + '" ' + (extra || '') + '>'; }
  function number(id, fallback) { var el = doc.getElementById(id), v = el && el.value.trim() !== '' ? Number(el.value) : NaN; return finite(v) ? v : fallback; }
  function report() {
    var list = entries(), H = root.__runyeGroupWork && root.__runyeGroupWork.hyd;
    if (!state.enabled) return '<p>尚未启用，规划继续使用原有地形高差。</p>';
    if (!list.length) return '<p>请先绘制或选择地块；各层梯田可分别成组后录入。</p>';
    if (!finite(state.source)) return '<p>请填写水源出水点高程。</p>';
    var mobile = root.RyMobileMapPreview, ms = mobile && mobile.getState().settings;
    var third = doc.getElementById('tlPipePlanSection'), isThird = third && third.classList.contains('ry-active');
    if (isThird && root.__runyeTlBlock != null) list = list.filter(function (e) { return e.index === root.__runyeTlBlock; });
    var pd = isThird && typeof root.computeThreeLevel === 'function' ? root.computeThreeLevel() : root.planData;
    var opts = { lift: ms ? ms.pumpLift : number(isThird ? 'tl_lift' : 'fld_lift', 5),
      target: ms ? ms.inletPressure : number(isThird ? 'tl_tapePressure' : 'fld_tapePressure', 1),
      existing: ms ? 0 : number(isThird ? 'tl_existPressure' : 'fld_existPressure', 0),
      filter: ms ? 0 : number(isThird ? 'tl_filterLoss' : 'fld_filterLoss', 5), pumpHead: state.pumpHead };
    var maxHead = null, incomplete = false, h = '<div class="rt-results">';
    list.forEach(function (e) {
      var hb = H && H.blocks && H.blocks.filter(function (b) { return b.bi === e.index; })[0];
      var loss = mobile ? null : (isThird ? (e.index == null || root.__runyeTlBlock === e.index ? (pd && finite(pd.totalPipeLoss) ? pd.totalPipeLoss : null) : null) : (e.index != null ? (hb && H.hasPipe ? H.trunkLoss + hb.blkLoss : null) :
        (pd && finite(pd.totalPipeLoss) ? pd.totalPipeLoss : pd && finite(pd.mainLoss) && finite(pd.branchLoss) ? pd.mainLoss + pd.branchLoss : null)));
      var p = state.plots[e.key], r = assess(p, state.source, loss == null ? 0 : loss, opts);
      h += '<article><b>' + escape(e.name) + '</b>';
      if (!r) { incomplete = true; h += '<p>未填写高程，当前规划仍使用原高差；整组缺项时不自动替换。</p></article>'; return; }
      h += '<p>相对水源高差：' + (r.rise >= 0 ? '+' : '') + r.rise.toFixed(2) + ' m</p>';
      if (loss == null) incomplete = true;
      if (loss == null) h += '<p>仅显示高差与静压上限。' + (mobile ? '手机端尚未接入完整管损计算。' : '请先生成并计算当前管路。') + '</p>';
      else {
        maxHead = maxHead == null ? r.requiredHead : Math.max(maxHead, r.requiredHead);
        h += '<p>估算所需泵扬程：' + r.requiredHead.toFixed(2) + ' m（满载管损 ' + loss.toFixed(2) + ' m）</p>';
      }
      if (finite(state.pumpHead)) {
        if (loss != null) h += '<p class="' + (r.pressureLow < opts.target ? 'rt-warn' : '') + '">最高点剩余压力估算：' + r.pressureLow.toFixed(2) + ' bar' + (r.pressureLow < opts.target ? ' · 低于设定入口工作压力' : ' · 满足设定入口工作压力') + '</p>';
        h += '<p class="' + (finite(state.maxPressure) && r.pressureHigh > state.maxPressure ? 'rt-warn' : '') + '">' + (mobile ? '最低点静压上限：' : '最低点静压估算（按输入泵扬程）：') + r.pressureHigh.toFixed(2) + ' bar' + (finite(state.maxPressure) && r.pressureHigh > state.maxPressure ? ' · 超过允许压力，请核对减压措施' : '') + '</p>';
      }
      h += '</article>';
    });
    if (maxHead != null) h += '<p><b>' + (incomplete ? '已补全地块的扬程估算（尚不能代表整组）：' : '当前校核范围控制扬程估算：') + maxHead.toFixed(2) + ' m</b></p>';
    return h + '</div><p class="rt-note">扬程沿用：提升＋有符号高差＋入口水头－已有水头＋管损＋过滤损失＋2 m，再乘1.10。最低点静压估算不扣管损；停灌校核需填写水泵关阀扬程，运行扬程不能代表关阀压力上限。实际压力仍需按轮灌、真实连接和设备工况核算。</p>';
  }
  function refresh() {
    if (!doc) return;
    var missing = state.enabled && (!finite(state.source) || !entries().length || entries().some(function (e) { return !state.plots[e.key]; }));
    doc.querySelectorAll('[data-terrain-open]').forEach(function (b) { b.textContent = '地形高程' + (state.enabled ? (missing ? ' · 待补全' : ' · 已启用') : '') + (b === openBtn && panel && !panel.hidden ? ' ▾' : ' ▴'); });
    ['planDh', 'fld_dh', 'tl_dh'].forEach(function (id) {
      var el = doc.getElementById(id); if (!el) return;
      if (state.enabled) el.title = '高程完整时，此输入不参与计算；实际高差由“地形高程”计算，可为负值。';
      else if (el.title.indexOf('高程完整时') === 0) el.removeAttribute('title');
    });
    if (panel && !panel.hidden) { var results = panel.querySelector('.rt-report'); if (results) results.innerHTML = report(); }
  }
  /* 折叠 / 就地展开：面板是单例，地形分组存在时挂在该分组内；兼容其他页面的旧入口。 */
  function collapse() {
    if (!panel) return;
    panel.hidden = true;
    var previous = openBtn;
    if (previous) { previous.setAttribute('aria-expanded', 'false'); openBtn = null; }
    var details = previous && previous.closest && previous.closest('#ryCadGrpTerrain');
    if (details && details.open) details.open = false;
    refresh();
  }
  function toggle(btn) {
    if (!panel) return;
    if (openBtn === btn && !panel.hidden) { collapse(); return; }
    if (openBtn) openBtn.setAttribute('aria-expanded', 'false');
    openBtn = btn;
    var details = btn.closest && btn.closest('#ryCadGrpTerrain');
    var terrainBody = details && details.querySelector('#ryCadTerrainBody');
    if (terrainBody) terrainBody.appendChild(panel);
    else {
      /* [v280] 按钮现在住在 .ri-btn-row 行容器里：面板必须插到整行之后，
         否则会落进行容器（flex 横排），面板被压成半宽。 */
      var rowHost = (btn.closest && btn.closest('.ri-btn-row')) || btn;
      rowHost.insertAdjacentElement('afterend', panel);
    }
    var list = entries();
    panel.innerHTML = '<form>' + (terrainBody ? '' : '<header data-collapse title="点击收起面板"><h3>手动地形高程</h3></header>') + '<div class="rt-body">' +
      '<label class="rt-switch"><input type="checkbox" data-terrain="enabled" ' + (state.enabled ? 'checked' : '') + '>启用手动高程</label>' +
      '<p class="rt-note">所有高程使用同一基准；没有绝对高程时，可把水源设为0，填写相对高程。水源以泵站出水点为基准，井内水面至出水点的提升仍填写原“水泵提升高度”。启用且高程完整时，替代原“地形高差”，不重复叠加。</p>' +
      '<div class="rt-grid"><label>水源出水点高程（m）' + input('source', state.source) + '</label><label>实际供水泵扬程（m，可选）' + input('pumpHead', state.pumpHead, 'min="0"') + '</label><label>末端允许最大压力（bar，可选）' + input('maxPressure', state.maxPressure, 'min="0.01"') + '</label></div>' +
      '<p class="rt-note">允许最大压力请按实际滴灌带、阀门等设备填写。实际供水泵扬程用于剩余压力校核，不填写时只估算所需扬程。负高程和下坡高差均支持。</p>' +
      '<h4>地块 / 梯田层</h4>' + (list.length ? list.map(function (e, i) { var p = state.plots[e.key] || {}, imp = importedProfile(e, i); return '<fieldset data-row="' + i + '"><legend>' + escape(e.name) + '</legend>' + (imp ? '<p class="rt-note">已带入 RTK 建议范围：' + imp.minZ.toFixed(2) + '–' + imp.maxZ.toFixed(2) + ' m（' + imp.pointCount + ' 点，请复核后保存）</p>' : '') + '<div class="rt-grid"><label>最高点 / 平台高程（m）' + input('high', finite(p.high) ? p.high : (imp ? imp.maxZ : null)) + '</label><label>最低点高程（m，可选）' + input('low', finite(p.low) ? p.low : (imp ? imp.minZ : null)) + '</label></div></fieldset>'; }).join('') : '<p>请先绘制或选择地块。各层梯田分别成组后，可逐层填写。</p>') +
      '<p class="rt-note">最低点留空时按平台高程计算；有坡地请填写最低点，才能检查低处压力。每层高程不会改变原有布管走向。</p><p class="rt-status" role="status"></p><footer><button type="submit">保存并应用</button></footer><div class="rt-report">' + report() + '</div></div></form>';
    var collapseHeader = panel.querySelector('[data-collapse]');
    if (collapseHeader) collapseHeader.onclick = collapse;
    panel.querySelector('form').onsubmit = function (event) {
      event.preventDefault();
      var currentKeys = entries().map(function (e) { return e.key; }).join('\n');
      if (currentKeys !== list.map(function (e) { return e.key; }).join('\n')) { panel.querySelector('.rt-status').textContent = '地块已切换，请收起并重新打开高程面板后填写，旧表单未保存。'; return; }
      function value(el) { return el.value.trim() === '' ? null : Number(el.value); }
      var next = copy(state), status = panel.querySelector('.rt-status');
      ['source', 'pumpHead', 'maxPressure'].forEach(function (k) { next[k] = value(panel.querySelector('[data-terrain="' + k + '"]')); });
      next.enabled = panel.querySelector('[data-terrain="enabled"]').checked;
      var invalid = false;
      panel.querySelectorAll('[data-row]').forEach(function (row) {
        var e = list[Number(row.dataset.row)], high = value(row.querySelector('[data-terrain="high"]')), low = value(row.querySelector('[data-terrain="low"]'));
        if (high == null && low == null) delete next.plots[e.key];
        else if (!finite(high) || low != null && (!finite(low) || low > high)) invalid = true;
        else next.plots[e.key] = { high: high, low: low };
      });
      if (invalid || next.enabled && (!finite(next.source) || !list.length || list.some(function (e) { return !next.plots[e.key]; }))) {
        status.textContent = '请填写水源和各层最高点；最低点不能高于最高点。也可关闭手动高程，先保存部分数据。'; return;
      }
      state = next; var saved = persist();
      if (typeof root.calcPlan === 'function') root.calcPlan();
      if (typeof root.render === 'function') root.render();
      if (typeof root.renderThreeLevel === 'function') root.renderThreeLevel();
      if (typeof root.tlUpdatePlanBar === 'function') root.tlUpdatePlanBar();
      if (typeof root.grRefreshGroupPage === 'function' && root.__runyeGroupEdit && root.__runyeGroupEdit.active) root.grRefreshGroupPage();
      refresh(); status.textContent = saved ? '已保存并应用。' : '已应用；浏览器不允许保存，关闭后可能丢失。';
    };
    panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    refresh();
  }
  function init() {
    panel = doc.createElement('div'); panel.className = 'rt-panel'; panel.hidden = true; panel.setAttribute('role', 'region'); panel.setAttribute('aria-label', '手动地形高程');
    var terrainDetails = doc.getElementById('ryCadGrpTerrain');
    if (terrainDetails) {
      terrainDetails.addEventListener('toggle', function () {
        var summary = terrainDetails.querySelector('summary');
        if (terrainDetails.open) toggle(summary);
        else if (openBtn === summary) collapse();
      });
    }
    /* 清除此前由缓存旧脚本插入的三级参数条入口，地形现在只从同级折叠分组打开。 */
    var legacyTlBar = doc.getElementById('tlPlanBar');
    if (legacyTlBar) legacyTlBar.querySelectorAll('[data-terrain-open]').forEach(function (button) { button.remove(); });
    ['fld_dh', 'tl_dh', 'grBlockCard', 'settingsForm'].forEach(function (id) {
      var host = doc.getElementById(id); if (!host) return;
      var b = doc.createElement('button'); b.type = 'button'; b.className = 'rt-open'; b.dataset.terrainOpen = ''; b.setAttribute('aria-expanded', 'false'); b.onclick = function () { toggle(b); };
      if (id === 'grBlockCard') { var side = host.closest('.pp-side'); var top = doc.getElementById('grTrunkCard');
        /* [v245c] 用户要求：成组页「地形高程」放左栏最顶（成组地块条之后、总管卡之前） */
        if (side && top && top.parentElement === side) side.insertBefore(b, top); else host.prepend(b); }
      /* [v437] 原 planDh 分支（二级页按钮行）随 planBtnRow 机制一并移除 */
      else if (id === 'fld_dh' || id === 'tl_dh') host.closest('.field').insertAdjacentElement('afterend', b);
      else host.insertAdjacentElement('afterend', b);
    });
    doc.addEventListener('change', function (e) { if (!panel.contains(e.target)) refresh(); });
    refresh();
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init();
})(typeof window !== 'undefined' ? window : globalThis);
