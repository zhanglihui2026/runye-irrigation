(function (root) {
  'use strict';

  function renderPlanCalcDetail(p) {
    try {
      var el = root.document.getElementById('ppCalcDetail');
      if (!el) return;
      var N = '<span class="pp-cf-num">';
      var O = '<span class="pp-cf-op">';
      var Q = '<span class="pp-cf-eq">';
      var R = '<span class="pp-cf-final">';
      var E = '</span>';
      var parts = [
        { lbl: '提升', v: p.lift },
        { lbl: '地形', v: p.dh },
        { lbl: '入口压力', v: p.tapePressure * 10.2 },
        { lbl: '主管损失', v: p.mainLoss, note: '主管 ' + Math.round(p.mainPipeLen) + 'm' },
        { lbl: '支管损失', v: p.branchLoss, note: p.branchCount + '根×' + Math.round(p.branchLen) + 'm/根' },
        { lbl: '过滤阀门', v: p.filterLoss },
        { lbl: '富余', v: p.marginHead }
      ];
      var editableParts = { '提升': 'fld_lift', '地形': 'fld_dh' };
      var partsHtml = parts.map(function (it, i) {
        var sign = it.v < 0 ? '−' : (i === 0 ? '' : '+');
        var abs = Math.abs(it.v);
        var target = editableParts[it.lbl];
        var valHtml = target
          ? '<input type="number" step="any" min="0" class="pp-cf-num pp-cf-input" data-target="' + target + '" value="' + abs.toFixed(2) + '" title="可调节：写回「井/水池提升高度 / 水源至最高点高差」并触发重算，扬程结果实时变化">'
          : N + abs.toFixed(2) + E;
        var noteHtml = it.note ? '<span class="pp-cf-note">（' + it.note + '）</span>' : '';
        return (i > 0 ? O + sign + E + ' ' : '') + it.lbl + ' ' + valHtml + noteHtml;
      }).join(' ');
      var lineH = '<span class="pp-cf-name">扬程 H</span>' +
        '<span class="pp-cf-eq">= (</span>' + partsHtml + '<span class="pp-cf-eq">)</span> ' +
        '<span class="pp-cf-op">×</span> ' + N + p.safetyFactor.toFixed(2) + E + ' ' +
        '<span class="pp-cf-eq">=</span>' + R + p.pumpHead.toFixed(2) + ' m' + E;
      el.innerHTML = '<span class="pp-cf-line pp-cf-line-h">' + lineH + '</span>';

      if (!el.dataset._editableBound) {
        el.addEventListener('change', function (ev) {
          var inp = ev.target.closest && ev.target.closest('input.pp-cf-input');
          if (!inp) return;
          var targetId = inp.dataset.target;
          var value = parseFloat(inp.value);
          if (Number.isFinite(value) && targetId) {
            var target = root.document.getElementById(targetId);
            if (target) {
              target.value = value;
              if (typeof root.calcPlan === 'function') root.calcPlan();
            }
          }
        });
        el.dataset._editableBound = '1';
      }
    } catch (e) { root.console.error('[ppCalc] 渲染失败：', e); }
  }

  function renderHeadBreakdown(r, defaults) {
    try {
      var el = root.document.getElementById('ppHeadBreak');
      if (!el || !r) return;
      defaults = defaults || {};
      var num = function (v, d) { return (Number.isFinite(v) ? v : 0).toFixed(d === undefined ? 2 : d); };
      var tapeM = Number.isFinite(r.tapePressureM) ? r.tapePressureM : (r.tapePressure || 0) * 10.2;
      var existM = (r.existPressure || 0) * 10.2;
      var rows = [
        { k: '提升', v: r.lift }, { k: '地形', v: r.dh }, { k: '入口压力', v: tapeM },
        { k: '已有压力', v: -existM }, { k: '总管损失', v: r.frontPipeLoss },
        { k: '主管损失', v: r.mainLoss }, { k: '支管损失', v: r.branchLoss },
        { k: '过滤阀门', v: r.filterLoss },
        { k: '富余', v: r.marginHead !== undefined ? r.marginHead : defaults.marginHead }
      ];
      var sf = Number.isFinite(r.safetyFactor) ? r.safetyFactor : defaults.safetyFactor;
      var sum = rows.reduce(function (a, x) { return a + (Number.isFinite(x.v) ? x.v : 0); }, 0);
      var sub = Number.isFinite(r.headBeforeSafety) ? r.headBeforeSafety : Math.max(0, sum);
      var total = Number.isFinite(r.pumpHead) ? r.pumpHead : sub * sf;
      var rowHtml = rows.map(function (x) {
        var v = Number.isFinite(x.v) ? x.v : 0;
        return '<div class="pphb-row"><span class="pphb-k">' + x.k + '</span>' +
          '<span class="pphb-v">' + (v < 0 ? '\u2212' : '') + num(Math.abs(v)) + '</span></div>';
      }).join('');
      el.innerHTML = '<summary>水泵扬程 ' + num(total, 1) + ' m（' + num(sub, 1) + ' \u00d7 ' + num(sf, 2) + '）</summary>' +
        rowHtml + '<div class="pphb-row pphb-sum"><span class="pphb-k">小计</span>' +
        '<span class="pphb-v">' + num(sub) + '</span></div>' +
        '<div class="pphb-row pphb-sum pphb-final"><span class="pphb-k">扬程（\u00d7' + num(sf, 2) + '）</span>' +
        '<span class="pphb-v">' + num(total) + '</span></div>';
      el.hidden = false;
    } catch (e) { root.console.error('[ppHeadBreak] 渲染失败：', e); }
  }

  root.RyPlanCalcRenderer = Object.freeze({
    renderPlanCalcDetail: renderPlanCalcDetail,
    renderHeadBreakdown: renderHeadBreakdown
  });
})(window);
