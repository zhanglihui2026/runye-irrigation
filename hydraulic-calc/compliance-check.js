/*
 * Irrigation compliance checks. This module reports only checks supported by
 * supplied design or field data; it never treats missing values as defaults.
 * It is a design aid, not a statutory acceptance certificate.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RyComplianceCheck = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';
  var STANDARD = 'GB/T 50485-2020 / GB/T 50085-2007 / NY/T 4368-2023';
  var own = function (o, k) { return Object.prototype.hasOwnProperty.call(o || {}, k); };
  var n = function (v) { var x = Number(v); return v !== null && v !== '' && isFinite(x) ? x : null; };
  var round = function (v) { return Math.round(v * 100) / 100; };
  function extrema(values) {
    if (!Array.isArray(values) || values.length < 2) return null;
    var xs = values.map(n);
    if (xs.some(function (x) { return x === null || x < 0; })) return null;
    return { min: Math.min.apply(null, xs), max: Math.max.apply(null, xs), count: xs.length };
  }
  function add(out, id, clause, item, actual, unit, limit, direction, suggestion, note) {
    var status = 'unassessed';
    if (actual !== null && limit !== null) {
      var bad = direction === 'min' ? actual < limit : actual > limit;
      var near = direction === 'min' ? actual < limit * 1.1 : actual >= limit * 0.8;
      status = bad ? 'fail' : (near ? 'warn' : 'pass');
    }
    out.push({ id: id, clause: clause, item: item,
      actual: actual === null ? null : round(actual), unit: unit,
      limit: limit === null ? null : (direction === 'min' ? '≥' : '≤') + round(limit),
      status: status, suggestion: status === 'fail' || status === 'warn' ? suggestion : null,
      note: note || (status === 'unassessed' ? '缺少必要设计或实测数据，未作判定。' : null) });
  }
  function limitFor(overrides, id, defaultValue) {
    var o = overrides && overrides[id];
    if (o && own(o, 'limit')) {
      var v = n(o.limit);
      return v !== null && v >= 0 ? v : null;
    }
    return defaultValue;
  }
  function allowableHeadDeviation(qvPercent, flowIndex) {
    var qv = qvPercent / 100, x = flowIndex;
    if (!(qv >= 0) || !(x > 0) || x > 1) return null;
    /* GB/T 50485-2020 4.0.8: hv = (qv/x)·[1 + 0.15·((1−x)/x)·qv].
       qv/hv are fractions in this relation; return percent for the UI. */
    return (qv / x) * (1 + 0.15 * ((1 - x) / x) * qv) * 100;
  }
  function check(input) {
    var o = input || {}, out = [], ov = o.overrides || {}, r = o.r || {};
    var e = o.emitter || r.emitter;
    if (e && typeof e === 'object') {
      var qd = n(e.designFlow), flows = e.actualFlows;
      var pressure = extrema(e.headPressures);
      if ((!Array.isArray(flows) || !flows.length) && pressure && qd > 0 && n(e.designHead) > 0 && n(e.flowIndex) > 0) {
        /* q = qd × (h/hd)^x, evaluated at supplied endpoint pressures. */
        flows = pressure ? [pressure.min, pressure.max].map(function (h) {
          return qd * Math.pow(h / Number(e.designHead), Number(e.flowIndex));
        }) : null;
      }
      var qx = extrema(flows);
      var qv = qx && qd > 0 ? (qx.max - qx.min) / qd * 100 : null;
      /* GB/T 50485-2020 4.0.6 sets [qv] ≤ 20%; an explicit project value
         can tighten/override it, but null does not become the often-quoted 10%. */
      var qAllow = limitFor(ov, 'mv-qv', e.qvAllow == null ? 20 : n(e.qvAllow));
      add(out, 'mv-qv', 'GB/T 50485-2020 4.0.6、4.0.7', '灌水器设计流量偏差率 qv', qv, '%', qAllow, 'max', '缩短毛管、增大管径或调整分区，以降低最远与最近灌水器的流量差。',
        qAllow === null ? '允许流量偏差限值无效；请按项目要求设置。' : null);
      var cv = n(e.cv);
      if (cv !== null && cv >= 0) {
        add(out, 'mv-cv', 'GB/T 50485-2020 6.4.2（产品参数）', '灌水器制造偏差系数 CV', cv, '', limitFor(ov, 'mv-cv', 0.07), 'max', '核对灌水器产品检测资料，必要时选用制造偏差更小的产品。', '条文用语为“不宜大于 0.07”；超值列为建议性预警，不直接判工程不合格。');
        if (out[out.length - 1].status === 'fail') out[out.length - 1].status = 'warn';
      }
      var hd = n(e.designHead);
      var hv = pressure && hd > 0 ? (pressure.max - pressure.min) / hd * 100 : null;
      var x = n(e.flowIndex);
      var hvLimit = qAllow !== null && x !== null ? allowableHeadDeviation(qAllow, x) : null;
      if (pressure || hd !== null) add(out, 'mv-hv', 'GB/T 50485-2020 4.0.7、4.0.8', '灌水器工作水头偏差率 hv', hv, '%', hvLimit, 'max', '缩短毛管、增大管径或均衡地形高差，降低灌水器最大与最小工作水头差。',
        hvLimit === null ? '需提供有效流态指数 x 和按设计条件确定的允许流量偏差率 [qv]，才可换算水头偏差限值。' : null);
    }

    var s = o.sprinkler || r.sprinkler;
    if (s && typeof s === 'object') {
      var dp = n(s.designPressure), hp = extrema(s.headPressures);
      if (dp > 0 || hp) {
        add(out, 'sp-pressure', 'GB/T 50085-2007 4.2.5(2)', '喷头最低实际工作压力 / 设计压力', dp > 0 && hp ? hp.min / dp * 100 : null, '%', limitFor(ov, 'sp-pressure', 90), 'min', '检查水泵扬程、管径、高差及分区；确保最不利喷头压力达到要求。');
        add(out, 'sp-diff', 'GB/T 50085-2007 4.2.5(3)', '同支管喷头最大压力差 / 设计压力', dp > 0 && hp && hp.count >= 2 ? (hp.max - hp.min) / dp * 100 : null, '%', limitFor(ov, 'sp-diff', 20), 'max', '缩短支管、加大管径或调整压力分区。', hp && hp.count < 2 ? '至少需要同一支管两个喷头的压力数据。' : null);
      }
      var cu = n(s.cu), cups = extrema(s.catchCanDepths);
      if (cu === null && cups && cups.min + cups.max > 0) {
        var mean = s.catchCanDepths.map(n).reduce(function (a, b) { return a + b; }, 0) / cups.count;
        cu = mean > 0 ? 1 - s.catchCanDepths.map(n).reduce(function (a, v) { return a + Math.abs(v - mean); }, 0) / (cups.count * mean) : null;
      }
      if (cu !== null || s.cu !== undefined || Array.isArray(s.catchCanDepths)) {
        var systemType = String(s.systemType || s.type || '').toLowerCase();
        var cuDefault = /moving|travel|row|行喷|移动/.test(systemType) ? 85 : (/fixed|定喷|固定/.test(systemType) ? 75 : null);
        add(out, 'sp-cu', 'GB/T 50085-2007 4.2.2', '喷灌均匀系数 CU', cu === null ? null : cu * (cu <= 1 ? 100 : 1), '%', limitFor(ov, 'sp-cu', cuDefault), 'min', '检查喷头组合间距、喷洒水量分布、风况及工作压力；建议现场做雨量筒测试。',
          cuDefault === null && !(ov['sp-cu'] && own(ov['sp-cu'], 'limit')) ? '需先注明定喷式或行喷式；标准限值分别为 75% 和 85%。' : null);
      }
    }

    var g = o.groups || r.groups;
    if (g && typeof g === 'object') {
      var gf = extrema(g.flows);
      var gdev = gf && gf.max > 0 ? (gf.max - gf.min) / gf.max * 100 : null;
      var applicable = g.ny4368Applicable === true;
      add(out, 'grp-dev', 'NY/T 4368-2023 5.5（适用范围内）', '轮灌组设计流量偏差率', gdev, '%', applicable ? limitFor(ov, 'grp-dev', 30) : null, 'max', '平衡各轮灌组面积或调整同时开启的分区数量。', applicable ? null : '该标准适用于其规定对象（包括集中连片、面积大于 2 hm² 的保护地种植园）；请先确认本项目适用性。');
      var zf = extrema(g.emitterFlows), zqd = n(g.emitterDesignFlow);
      var zdev = zf && zqd > 0 ? (zf.max - zf.min) / zqd * 100 : null;
      if (zf || g.emitterDesignFlow !== undefined) add(out, 'grp-emit', 'NY/T 4368-2023 5.5（适用范围内）', '灌水小区灌水器设计流量偏差率', zdev, '%', applicable ? limitFor(ov, 'grp-emit', 20) : null, 'max', '优化小区管径、毛管长度或分区。', applicable ? null : '该标准适用于其规定对象（包括集中连片、面积大于 2 hm² 的保护地种植园）；请先确认本项目适用性。');
    }
    var summary = { pass: 0, warn: 0, fail: 0, unassessed: 0 };
    out.forEach(function (c) { summary[c.status] = (summary[c.status] || 0) + 1; });
    var timestamp = new Date().toISOString();
    return { standard: STANDARD, checks: out, summary: summary, computedAt: timestamp, checkedAt: timestamp, disclaimer: '设计辅助检查；不替代完整设计复核、设备厂家参数确认及现场验收。' };
  }
  return { check: check, standard: STANDARD };
});
