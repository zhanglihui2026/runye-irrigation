/* 水力计算器 · 计算核心（2026-09-17 第六十二轮）
 *
 * 纯计算、零 DOM 依赖：同时可被 Node（require，用于单测）与浏览器（window.RyHcCore）加载。
 * 界面见 hydraulic-calc.js；宿主 index.html 的 #threeDModelingSection 懒挂载。
 *
 * ── 口径（务必与本站二级 / 三级水力计算保持一致）────────────────────────────
 *   沿程水头损失用 Hazen-Williams，与 index.html 的 hazenWilliams() 同一常数：
 *       hf = 1.113e9 · L · Q^1.852 / (C^1.852 · D^4.87)      [L: m, Q: m³/h, D: mm, hf: m]
 *   默认 C = 150（PE 管常用值，可调）。
 *   管径默认按 PE100 / SDR13.6 由**外径 OD** 折算**内径**：D = OD · (1 − 2/SDR)，
 *   与 index.html 的 peInnerDiam() 同式；也可切到 SDR17 / SDR21 或「直接按内径」。
 *   ★ 单测 tests/hc_core.test.cjs 里有一条**交叉校验**：本模块的 hazen(L,Q,D,150)
 *     必须与 index.html 的 hazenWilliams(L,Q,D) 逐值相等 —— 两处口径不得漂移。
 *
 * ── 拓扑模型（一棵树）───────────────────────────────────────────────────
 *   水源 ──[总管 trunk]── 分水三通 ──┬──[主管 main 1]── 沿程三通×M ──[支管 tap]×M
 *                                   └──[主管 main 2]── 沿程三通×M ──[支管 tap]×M
 *   用户可任意增删「主管」与每根主管上的「三通（分水口）/支管」，改管径、改长度、改支管流量。
 *
 * ── 流量（自下而上累加，与「任意组合路径」一一对应）─────────────────────
 *   每根支管末端有一个设计流量 Q_tap（可调）。
 *   主管上某一段（第 k−1 个三通 → 第 k 个三通）的流量 = 该段**下游**所有支管流量之和；
 *   总管流量 = 全部主管流量之和 = 全部支管流量之和。
 *
 * ── 路径水头损失 ───────────────────────────────────────────────────────
 *   路径 (主管 i, 该主管第 j 根支管) 依次经过：
 *     总管整段 → 主管 i 从起点到第 j 个三通的**逐段**（每段流量不同，逐段累加）→ 支管 j。
 *   局部损失（可开关，默认计入）：路径上每个三通按 ζ·v²/(2g) 计，v 取**分流后下游管**的流速
 *     （总管三通取主管流速；主管上第 k 个分水口取第 k 根支管流速），ζ 默认 1.0 可调。
 */
(function (root, factory) {
  'use strict';
  var API = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.RyHcCore = API;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var C_DEFAULT = 150;
  function nativeCore() {
    return typeof window !== 'undefined' ? window.RyHydraulicNative : null;
  }
  var G2 = 19.62;                 /* 2g，m/s²×2 */
  var SDR_DEFAULT = 13.6;
  var PE_OD_SERIES = [50, 63, 75, 90, 110, 125, 140, 160, 180, 200, 225, 250, 280, 315, 355, 400, 450, 500];
  var ECON_VMIN = 0.8, ECON_VMAX = 2.0;   /* 经济流速区间，与 index.html 一致 */

  /* 口径模式：外径→内径的折算规则 */
  var CALIBER_MODES = [
    { id: 'sdr13.6', sdr: 13.6, label: 'PE100 SDR13.6（输入外径，折算内径）' },
    { id: 'sdr17', sdr: 17, label: 'PE100 SDR17（输入外径，折算内径）' },
    { id: 'sdr21', sdr: 21, label: 'PE100 SDR21（输入外径，折算内径）' },
    { id: 'id', sdr: 0, label: '直接按内径（输入值即内径）' }
  ];

  /* 兜底：默认预设 = 用户 2026-09-17 描述的那套 ——
     总管 200 m/DN225 → 三通后分出两路 160 各 500 m，每根 500 m 上接 4 个三通，
     每个三通接一根 110、长 80 m 的支管（共 8 根支管）。
     四个三通沿 500 m 均分（125 / 250 / 375 / 500），故主管末端无零流量死管段。 */
  function defaultConfig() {
    function mkTaps() {
      return [1, 2, 3, 4].map(function (k) {
        return { at: 125 * k, od: 110, len: 80, flow: 6 };
      });
    }
    return {
      C: C_DEFAULT,
      caliber: 'sdr13.6',
      includeLocal: true,
      juncZeta: 1.0,
      trunk: { od: 225, len: 200 },
      mains: [
        { od: 160, len: 500, taps: mkTaps() },
        { od: 160, len: 500, taps: mkTaps() }
      ]
    };
  }

  /* ---------------- 数值工具 ---------------- */
  function num(v, dflt) {
    var n = parseFloat(v);
    if (!isFinite(n)) n = (dflt === undefined ? 0 : dflt);
    return n;
  }
  function pos(v, dflt) {           /* 正数，否则取默认 */
    var n = num(v, dflt);
    return n > 0 ? n : (dflt === undefined ? 0 : dflt);
  }
  function nonNeg(v) {              /* 非负 */
    var n = num(v, 0);
    return n > 0 ? n : 0;
  }
  function r2(v) { return Math.round(v * 100) / 100; }

  function sdrOf(mode) {
    for (var i = 0; i < CALIBER_MODES.length; i++) if (CALIBER_MODES[i].id === mode) return CALIBER_MODES[i].sdr;
    return SDR_DEFAULT;
  }
  function caliberLabel(mode) {
    for (var i = 0; i < CALIBER_MODES.length; i++) if (CALIBER_MODES[i].id === mode) return CALIBER_MODES[i].label;
    return '';
  }

  /* 内径（mm）。mode='id' 时输入值即内径；其余按 SDR 折算。与 index.html peInnerDiam 同式。 */
  function innerDiam(od, mode) {
    var d = pos(od, 0);
    var sdr = sdrOf(mode);
    var native = nativeCore();
    if (native && native.inner) return native.inner(d, sdr);
    if (!sdr) return d;
    return d * (1 - 2 / sdr);
  }

  /* Hazen-Williams 沿程损失（m）。与 index.html hazenWilliams 同式同常数。 */
  function hazen(L, Q, d, C) {
    var Li = pos(L, 0), Qi = nonNeg(Q), Di = pos(d, 0), Ci = pos(C, C_DEFAULT);
    if (Li <= 0 || Qi <= 0 || Di <= 0 || Ci <= 0) return 0;
    var native = nativeCore();
    if (native && native.hazen) return native.hazen(Li, Qi, Di, Ci);
    return 1.113e9 * Li * Math.pow(Qi, 1.852) / (Math.pow(Ci, 1.852) * Math.pow(Di, 4.87));
  }

  /* 流速（m/s）：Q m³/h，d mm */
  function velocity(Q, d) {
    var Qi = nonNeg(Q), Di = pos(d, 0);
    if (Qi <= 0 || Di <= 0) return 0;
    var native = nativeCore();
    if (native && native.velocity) return native.velocity(Qi, Di);
    var area = Math.PI * Math.pow(Di / 1000, 2) / 4;
    return Qi / 3600 / area;
  }

  /* 与 index.html pipeStatusLabel 同词表（v>2 偏高 / v<0.8 偏低 / 其间可选） */
  function statusOf(v) {
    if (v >= ECON_VMIN && v <= ECON_VMAX) return '可选';
    if (v > ECON_VMAX) return '流速偏高';
    return '流速偏低';
  }

  /* 局部损失（m）：ζ·v²/(2g) */
  function localLoss(v, zeta) {
    var vi = nonNeg(v), z = nonNeg(zeta);
    if (vi <= 0 || z <= 0) return 0;
    var native = nativeCore();
    if (native && native.localLoss) return native.localLoss(vi, z);
    return z * vi * vi / G2;
  }

  /* 水泵扬程（m）：静扬程 + 沿程/局部损失合计 + 富余水头，乘安全系数。
   * 与 index.html computeThreeLevel 同式：H = (提升+地形+入口压力折米−已有压力折米
   *   + 主管损失+支管损失+过滤阀门损失 + 富余) × 安全系数(默认 1.10)。
   * staticM = 提升+地形+入口压力折米−已有压力折米；lossM = 主管+支管+过滤阀门损失合计。
   * 与 index.html peInnerDiam/hazenWilliams 一致：输入清洗仍由本模块/宿主负责，C++ 不擅自替换。 */
  function head(staticM, lossM, marginM, safety) {
    var s = num(staticM, 0), l = num(lossM, 0), m = num(marginM, 0), f = num(safety, 1);
    if (f <= 0) return 0;
    var native = nativeCore();
    if (native && native.head) return native.head(s, l, m, f);
    return Math.max(0, s + l + m) * f;
  }

  /* 水泵轴功率（kW）：P = ρ·g·Q·H/η，Q m³/h，常数 2.725 = 1000·9.81/3600
   * （ρ=1000, g=9.81, 小时→秒, W→kW），η 为小数效率。零流量/零扬程/零效率→0。
   * 与 index.html computeThreeLevel 的 2.725×Q×H/η/1000 同式。 */
  function power(flow, hd, eta) {
    var Qi = nonNeg(flow), Hi = num(hd, 0), ei = num(eta, 0);
    if (Qi <= 0 || Hi <= 0 || ei <= 0) return 0;
    var native = nativeCore();
    if (native && native.power) return native.power(Qi, Hi, ei);
    return 2.725 * Qi * Hi / ei / 1000;
  }

  /* 口径模式校白名单：非法/缺失一律回落 SDR13.6（与宿主默认一致） */
  function validCaliber(c) {
    for (var i = 0; i < CALIBER_MODES.length; i++) if (CALIBER_MODES[i].id === c) return c;
    return 'sdr13.6';
  }

  /* ---------------- 归一化 ---------------- */
  /* 把任意（含用户手输 / 旧存档）配置收敛成合法结构：
     至少 1 根主管、每根至少 1 个三通；长度/流量非负、管径为正；
     三通位置 clamp 到 [0, 主管长] 并升序（保证「逐段累加」的段长为正）。 */
  function normalize(cfg) {
    var src = cfg && typeof cfg === 'object' ? cfg : {};
    var out = {
      C: pos(src.C, C_DEFAULT),
      caliber: validCaliber(src.caliber),
      includeLocal: src.includeLocal !== false,
      juncZeta: nonNeg(src.juncZeta === undefined ? 1 : src.juncZeta),
      trunk: null,
      mains: []
    };
    var tm = src.trunk && typeof src.trunk === 'object' ? src.trunk : {};
    out.trunk = { od: pos(tm.od, 225), len: pos(tm.len, 0) };

    var mains = (src.mains && src.mains.length) ? src.mains : defaultConfig().mains;
    out.mains = mains.map(function (m) {
      m = m && typeof m === 'object' ? m : {};
      var len = pos(m.len, 0);
      var taps = (m.taps && m.taps.length ? m.taps : [{ at: len, od: 110, len: 80, flow: 6 }]).map(function (t) {
        t = t && typeof t === 'object' ? t : {};
        var at = nonNeg(t.at);
        if (at > len) at = len;
        return { at: at, od: pos(t.od, 110), len: pos(t.len, 0), flow: nonNeg(t.flow) };
      });
      taps.sort(function (a, b) { return a.at - b.at; });
      return { od: pos(m.od, 160), len: len, taps: taps };
    });
    return out;
  }

  /* ---------------- 流量 ---------------- */
  function tapFlow(cfg, mi, ti) { return nonNeg(cfg.mains[mi].taps[ti].flow); }

  function mainFlow(cfg, mi) {
    return cfg.mains[mi].taps.reduce(function (s, t) { return s + nonNeg(t.flow); }, 0);
  }

  function trunkFlow(cfg) {
    return cfg.mains.reduce(function (s, m, i) { return s + mainFlow(cfg, i); }, 0);
  }

  /* ---------------- 单段 ---------------- */
  function leg(cfg, kind, name, L, od, Q) {
    var d = innerDiam(od, cfg.caliber);
    var v = velocity(Q, d);
    var hf = hazen(L, Q, d, cfg.C);
    return { kind: kind, name: name, L: L, od: od, id: d, Q: Q, v: v, hf: hf, status: statusOf(v) };
  }

  /* ---------------- 路径水头损失 ---------------- */
  /* mi：主管序号(0基)；ti：该主管上第几根支管(0基)。
     返回 { legs, localLegs, hf, hlocal, total, mainFlow, trunkFlow, label } */
  function pathLoss(cfgRaw, mi, ti) {
    var cfg = normalize(cfgRaw);
    if (!cfg.mains.length) return emptyPath(cfg, mi, ti);
    mi = Math.max(0, Math.min(cfg.mains.length - 1, num(mi, 0)));
    var main = cfg.mains[mi];
    ti = Math.max(0, Math.min(main.taps.length - 1, num(ti, 0)));

    var Qt = trunkFlow(cfg);
    var legs = [];
    var trunkLeg = leg(cfg, 'trunk', '总管', cfg.trunk.len, cfg.trunk.od, Qt);
    if (trunkLeg.L > 0) { trunkLeg.name = '总管'; legs.push(trunkLeg); }

    /* 主管 i：从起点走到第 ti 个三通，逐段（段流量 = 该段下游支管流量之和） */
    var from = 0;
    for (var k = 0; k <= ti; k++) {
      var to = main.taps[k].at;
      var segLen = to - from;
      if (segLen > 0) {
        var Qs = 0;
        for (var t = k; t < main.taps.length; t++) Qs += nonNeg(main.taps[t].flow);
        var sg = leg(cfg, 'main', '主管' + (mi + 1) + '（' + fmt(from) + '→' + fmt(to) + ' m）', segLen, main.od, Qs);
        sg.from = from; sg.to = to;
        legs.push(sg);
      }
      from = to;
    }

    var tp = main.taps[ti];
    var tapLeg = leg(cfg, 'tap', '支管' + (ti + 1), tp.len, tp.od, nonNeg(tp.flow));
    if (tapLeg.L > 0) legs.push(tapLeg);

    /* 局部损失项：0 号 = 总管分水三通（按主管流速），其后 = 路径上经过的每个分水口（按支管流速） */
    var localLegs = [];
    if (cfg.includeLocal && cfg.juncZeta > 0) {
      var dMain = innerDiam(main.od, cfg.caliber);
      var vJ = velocity(mainFlow(cfg, mi), dMain);
      localLegs.push({ name: '总管分水三通', v: vJ, hf: localLoss(vJ, cfg.juncZeta) });
      for (var j = 0; j <= ti; j++) {
        var dj = innerDiam(main.taps[j].od, cfg.caliber);
        var vj = velocity(nonNeg(main.taps[j].flow), dj);
        localLegs.push({ name: '主管' + (mi + 1) + ' 第' + (j + 1) + '个三通', v: vj, hf: localLoss(vj, cfg.juncZeta) });
      }
    }

    var hf = legs.reduce(function (s, x) { return s + x.hf; }, 0);
    var hlocal = localLegs.reduce(function (s, x) { return s + x.hf; }, 0);
    return {
      mi: mi, ti: ti, legs: legs, localLegs: localLegs,
      hf: hf, hlocal: hlocal, total: hf + hlocal,
      trunkFlow: Qt, mainFlow: mainFlow(cfg, mi), tapFlowIn: nonNeg(tp.flow),
      label: '总管 → 主管' + (mi + 1) + ' → 支管' + (ti + 1),
      cfg: cfg
    };
  }

  function emptyPath(cfg, mi, ti) {
    return { mi: mi, ti: ti, legs: [], localLegs: [], hf: 0, hlocal: 0, total: 0, trunkFlow: 0, mainFlow: 0, tapFlowIn: 0, label: '', cfg: cfg };
  }

  function fmt(v) {
    var n = Math.round(num(v, 0) * 100) / 100;
    return String(n);
  }

  /* ---------------- 全部组合 ---------------- */
  /* 「任意组合」= 每根主管 × 该主管的每根支管，一条路径一行，并标出最不利（损失最大）。 */
  function allPaths(cfgRaw) {
    var cfg = normalize(cfgRaw);
    var rows = [];
    cfg.mains.forEach(function (m, mi) {
      m.taps.forEach(function (t, ti) {
        var p = pathLoss(cfg, mi, ti);
        rows.push({
          mi: mi, ti: ti, label: p.label,
          mainLabel: '主管' + (mi + 1), tapLabel: '支管' + (ti + 1),
          Qmain: p.mainFlow, Qtap: p.tapFlowIn,
          hf: p.hf, hlocal: p.hlocal, total: p.total,
          vMain: (function () { var d = innerDiam(m.od, cfg.caliber); return velocity(mainFlow(cfg, mi), d); })()
        });
      });
    });
    var worst = -1, min = -1;
    rows.forEach(function (r, i) {
      if (worst < 0 || r.total > rows[worst].total + 1e-12) worst = i;
      if (min < 0 || r.total < rows[min].total - 1e-12) min = i;
    });
    rows.forEach(function (r, i) { r.isWorst = (i === worst); r.isBest = (i === min); });
    return { rows: rows, worstIndex: worst, bestIndex: min, trunkFlow: trunkFlow(cfg), cfg: cfg };
  }

  function worstPath(cfg) {
    var all = allPaths(cfg);
    if (all.worstIndex < 0) return null;
    var r = all.rows[all.worstIndex];
    return { mi: r.mi, ti: r.ti, label: r.label, total: r.total };
  }

  /* ---------------- 汇总（给界面顶部/校验用） ---------------- */
  function summary(cfgRaw) {
    var cfg = normalize(cfgRaw);
    var all = allPaths(cfg);
    var totals = all.rows.map(function (r) { return r.total; });
    return {
      cfg: cfg,
      mains: cfg.mains.length,
      taps: all.rows.length,
      trunkFlow: trunkFlow(cfg),
      trunkLen: cfg.trunk.len,
      totalLen: cfg.trunk.len + cfg.mains.reduce(function (s, m, i) {
        return s + m.len + m.taps.reduce(function (a, t) { return a + t.len; }, 0);
      }, 0),
      worst: all.worstIndex >= 0 ? all.rows[all.worstIndex] : null,
      best: all.bestIndex >= 0 ? all.rows[all.bestIndex] : null,
      maxTotal: totals.length ? Math.max.apply(null, totals) : 0,
      minTotal: totals.length ? Math.min.apply(null, totals) : 0
    };
  }

  return {
    C_DEFAULT: C_DEFAULT, SDR_DEFAULT: SDR_DEFAULT, G2: G2,
    PE_OD_SERIES: PE_OD_SERIES, CALIBER_MODES: CALIBER_MODES,
    ECON_VMIN: ECON_VMIN, ECON_VMAX: ECON_VMAX,
    num: num, nonNeg: nonNeg, pos: pos, r2: r2, fmt: fmt,
    sdrOf: sdrOf, caliberLabel: caliberLabel, validCaliber: validCaliber, innerDiam: innerDiam,
    hazen: hazen, velocity: velocity, statusOf: statusOf, localLoss: localLoss,
    head: head, power: power,
    defaultConfig: defaultConfig, normalize: normalize,
    tapFlow: tapFlow, mainFlow: mainFlow, trunkFlow: trunkFlow,
    pathLoss: pathLoss, allPaths: allPaths, worstPath: worstPath, summary: summary
  };
});
