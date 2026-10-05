(function (root) {
  'use strict';
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
    importState: function (s) { state = validate(s) || { version: 1, enabled: false, source: null, pumpHead: null, maxPressure: null, plots: {} }; persist(); refresh(); },
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
  var doc = root.document, dialog;
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
    var maxHead = null, h = '<div class="rt-results">';
    list.forEach(function (e) {
      var hb = H && H.blocks && H.blocks.filter(function (b) { return b.bi === e.index; })[0];
      var loss = mobile ? null : (e.index != null ? (hb && H.hasPipe ? H.trunkLoss + hb.blkLoss : null) :
        (pd && finite(pd.totalPipeLoss) ? pd.totalPipeLoss : pd && finite(pd.mainLoss) && finite(pd.branchLoss) ? pd.mainLoss + pd.branchLoss : null));
      var p = state.plots[e.key], r = assess(p, state.source, loss == null ? 0 : loss, opts);
      h += '<article><b>' + escape(e.name) + '</b>';
      if (!r) { h += '<p>未填写高程，当前规划仍使用原高差；整组缺项时不自动替换。</p></article>'; return; }
      h += '<p>相对水源高差：' + (r.rise >= 0 ? '+' : '') + r.rise.toFixed(2) + ' m</p>';
      if (loss == null) h += '<p>仅显示高差与静压上限。' + (mobile ? '手机端尚未接入完整管损计算。' : '请先生成并计算当前管路。') + '</p>';
      else {
        maxHead = maxHead == null ? r.requiredHead : Math.max(maxHead, r.requiredHead);
        h += '<p>估算所需泵扬程：' + r.requiredHead.toFixed(2) + ' m（满载管损 ' + loss.toFixed(2) + ' m）</p>';
      }
      if (finite(state.pumpHead)) {
        if (loss != null) h += '<p class="' + (r.pressureLow < opts.target ? 'rt-warn' : '') + '">最高点剩余压力估算：' + r.pressureLow.toFixed(2) + ' bar' + (r.pressureLow < opts.target ? ' · 低于设定入口工作压力' : ' · 满足设定入口工作压力') + '</p>';
        h += '<p class="' + (finite(state.maxPressure) && r.pressureHigh > state.maxPressure ? 'rt-warn' : '') + '">最低点静压上限：' + r.pressureHigh.toFixed(2) + ' bar' + (finite(state.maxPressure) && r.pressureHigh > state.maxPressure ? ' · 超过允许压力，请核对减压措施' : '') + '</p>';
      }
      h += '</article>';
    });
    if (maxHead != null) h += '<p><b>当前校核范围控制扬程估算：' + maxHead.toFixed(2) + ' m</b></p>';
    return h + '</div><p class="rt-note">扬程沿用：提升＋有符号高差＋入口水头－已有水头＋管损＋过滤损失＋2 m，再乘1.10。最低点静压上限不扣管损，用于检查停灌及低负荷风险。实际压力仍需按轮灌、真实连接和设备工况核算。</p>';
  }
  function refresh() {
    if (!doc) return;
    var missing = state.enabled && (!finite(state.source) || !entries().length || entries().some(function (e) { return !state.plots[e.key]; }));
    doc.querySelectorAll('[data-terrain-open]').forEach(function (b) { b.textContent = '地形高程' + (state.enabled ? (missing ? ' · 待补全' : ' · 已启用') : ''); });
    ['planDh', 'fld_dh', 'tl_dh'].forEach(function (id) {
      var el = doc.getElementById(id); if (!el) return;
      if (state.enabled) el.title = '高程完整时，此输入不参与计算；实际高差由“地形高程”计算，可为负值。';
      else if (el.title.indexOf('高程完整时') === 0) el.removeAttribute('title');
    });
    if (dialog && dialog.open) { var results = dialog.querySelector('.rt-report'); if (results) results.innerHTML = report(); }
  }
  function open() {
    var list = entries();
    dialog.innerHTML = '<form><header><h3>手动地形高程</h3><button type="button" data-close aria-label="关闭高程设置">关闭</button></header>' +
      '<label class="rt-switch"><input type="checkbox" data-terrain="enabled" ' + (state.enabled ? 'checked' : '') + '>启用手动高程</label>' +
      '<p class="rt-note">所有高程使用同一基准；没有绝对高程时，可把水源设为0，填写相对高程。水源以泵站出水点为基准，井内水面至出水点的提升仍填写原“水泵提升高度”。启用且高程完整时，替代原“地形高差”，不重复叠加。</p>' +
      '<div class="rt-grid"><label>水源出水点高程（m）' + input('source', state.source) + '</label><label>实际供水泵扬程（m，可选）' + input('pumpHead', state.pumpHead, 'min="0"') + '</label><label>末端允许最大压力（bar，可选）' + input('maxPressure', state.maxPressure, 'min="0.01"') + '</label></div>' +
      '<p class="rt-note">允许最大压力请按实际滴灌带、阀门等设备填写。实际供水泵扬程用于剩余压力校核，不填写时只估算所需扬程。负高程和下坡高差均支持。</p>' +
      '<h4>地块 / 梯田层</h4>' + (list.length ? list.map(function (e, i) { var p = state.plots[e.key] || {}; return '<fieldset data-row="' + i + '"><legend>' + escape(e.name) + '</legend><div class="rt-grid"><label>最高点 / 平台高程（m）' + input('high', p.high) + '</label><label>最低点高程（m，可选）' + input('low', p.low) + '</label></div></fieldset>'; }).join('') : '<p>请先绘制或选择地块。各层梯田分别成组后，可逐层填写。</p>') +
      '<p class="rt-note">最低点留空时按平台高程计算；有坡地请填写最低点，才能检查低处压力。每层高程不会改变原有布管走向。</p><p class="rt-status" role="status"></p><footer><button type="submit">保存并应用</button></footer><div class="rt-report">' + report() + '</div></form>';
    dialog.querySelector('[data-close]').onclick = function () { dialog.close(); };
    dialog.querySelector('form').onsubmit = function (event) {
      event.preventDefault();
      function value(el) { return el.value.trim() === '' ? null : Number(el.value); }
      var next = copy(state), status = dialog.querySelector('.rt-status');
      ['source', 'pumpHead', 'maxPressure'].forEach(function (k) { next[k] = value(dialog.querySelector('[data-terrain="' + k + '"]')); });
      next.enabled = dialog.querySelector('[data-terrain="enabled"]').checked;
      var invalid = false;
      dialog.querySelectorAll('[data-row]').forEach(function (row) {
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
    dialog.showModal();
  }
  function init() {
    dialog = doc.createElement('dialog'); dialog.className = 'rt-dialog'; dialog.setAttribute('aria-label', '手动地形高程'); doc.body.appendChild(dialog);
    ['planDh', 'fld_dh', 'tl_dh', 'tlPlanBar', 'grBlockCard', 'settingsForm'].forEach(function (id) {
      var host = doc.getElementById(id); if (!host) return;
      var b = doc.createElement('button'); b.type = 'button'; b.className = 'rt-open'; b.dataset.terrainOpen = ''; b.onclick = open;
      if (id === 'grBlockCard' || id === 'tlPlanBar') host.prepend(b);
      else if (id === 'planDh') host.closest('.pp-plan-item').insertAdjacentElement('afterend', b);
      else if (id === 'fld_dh' || id === 'tl_dh') host.closest('.field').insertAdjacentElement('afterend', b);
      else host.insertAdjacentElement('afterend', b);
    });
    doc.addEventListener('change', function (e) { if (!dialog.contains(e.target)) refresh(); });
    refresh();
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init();
})(typeof window !== 'undefined' ? window : globalThis);
