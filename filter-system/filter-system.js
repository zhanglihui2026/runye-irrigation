/* 过滤系统 · 叠片过滤器并联机组选型工作台（2026-09-18）
 *
 * 宿主：index.html 的 #filterSystemSection（第七十一轮预留的空壳页；本轮把
 *       workspace 里已确认的过滤机组建模成果融合进来）。
 *
 * 拓扑（GREEN 型叠片过滤器单体并联，每组两阀、**图纸不表达安装支墩/支架**）：
 *   ① 进水总管（后侧）· ③ 出水总管（前侧）· ② 排污总管（最前、贴地）
 *   过滤：  ① → V1 → 单体后口 → 滤芯 → 前口 → ③ → 下游（V2 常闭）
 *   反冲：  关该组 V1、开该组 V2 → 其余组净水在 ③ 内倒行 → 该组前口入罐反冲
 *           → 后口出 → V2 → ② 排走
 *
 * 实物口径（2026-09-18 依用户实物照校正，均以「单体底面」为安装基准面）：
 *   单体总高 H=750 · 罐外径 OD=200 · 含左右口总宽 350 · 左右口中心离底 120
 *   单体底面 +0.600（用户定架装 0.6 m）→ ①③ 总管同层 +0.720 → 罐顶 +1.350
 *   ② 排污总管贴地 +0.060；①③ 同层、前后各偏 Δ=260
 *
 * 与灌溉设计工具的融合（本模块存在的意义）：
 *   · 读：可从当前设计方案取联合流量（#tlPlanPumpFlow）→ 作为本页设计流量 Q
 *   · 写：把本页过滤损失写回 #tl_filterLoss（三级）/ #fld_filterLoss（二级），
 *         直接参与水泵扬程计算 —— 扬程公式里那一项从此不再是拍脑袋的常数
 *
 * 挂载策略：懒挂载（IntersectionObserver + ryShowSection/ryJumpToSection 钩子），
 *   未打开本页时不产生任何 DOM —— 对 verify_simplify_equivalence 的快照零增量。
 *   测试可直接调 window.RyFilterSystem.mount() 强制挂载（幂等 + 自愈）。
 */
(function () {
  'use strict';

  var SEC_ID = 'filterSystemSection';
  var CFG_KEY = 'runye_filter_system_cfg_v1';

  var DN_LIST = [32, 40, 50, 63, 75, 90, 110, 125, 140, 160, 180, 200, 225, 250, 280, 315];

  /* ---- 实物口径常量（来自用户实物照校正，不随界面参数变化） ---- */
  var PORT_RISE = 120;   // 单体左右口中心离单体底面（mm）
  var Z_WASTE = 60;      // ② 排污总管管中标高（贴地，mm）
  var WS_GAP = 160;      // ② 排污总管相对 ③ 再往前偏（mm）
  var VALVE_W = 90;      // V1 / V2 阀体示意尺寸（mm）

  var DEFAULTS = {
    n: 4, od: 200, h: 750, hm: 600, s: 400, delta: 260, clear: 150,
    dnIn: 110, dnOut: 110, dnWs: 110, dnBr: 90,
    q: 60, loss: 5, bw: -1
  };

  var RANGES = [
    { k: 'n', label: '过滤组数 N', min: 2, max: 6, step: 1, unit: '组' },
    { k: 'od', label: '单体外径 OD', min: 150, max: 400, step: 10, unit: 'mm' },
    { k: 'h', label: '单体总高 H', min: 500, max: 1200, step: 10, unit: 'mm' },
    { k: 'hm', label: '罐底架装 h', min: 200, max: 1500, step: 50, unit: 'mm' },
    { k: 's', label: '组间距 S', min: 250, max: 900, step: 10, unit: 'mm' },
    { k: 'delta', label: '前后偏距 Δ', min: 150, max: 800, step: 10, unit: 'mm' },
    { k: 'clear', label: '检修空间', min: 50, max: 400, step: 10, unit: 'mm' },
    { k: 'q', label: '设计流量 Q', min: 5, max: 400, step: 5, unit: 'm³/h' }
  ];
  var DNS = [
    { k: 'dnIn', label: '进水总管 ①' },
    { k: 'dnOut', label: '出水总管 ③' },
    { k: 'dnWs', label: '排污总管 ②' },
    { k: 'dnBr', label: '支管 / 阀口' }
  ];

  var SVG_IDS = { top: 'fsSvgTop', front: 'fsSvgFront', side: 'fsSvgSide', axo: 'fsSvgAxo' };

  var C = {
    in: '#185FA5', inL: '#B5D4F4', inF: '#E6F1FB',
    out: '#0F6E56', outL: '#9FE1CB', outF: '#E1F5EE',
    ws: '#A32D2D', wsL: '#F09595', wsF: '#FCEBEB',
    tank: '#F1EFE8', tankS: '#5F5E5A',
    valve: '#FAEEDA', valveS: '#BA7517',
    dim: '#98A2B3', txt: '#243c35', txt2: '#4a6259', txt3: '#7b9188', ghost: '#D9DCE3'
  };

  var rootEl = null;
  var cfg = null;

  /* ================= 工具函数 ================= */
  function f(v, n) {
    var x = Number(v);
    if (!isFinite(x)) x = 0;
    return x.toFixed(n === undefined ? 3 : n);
  }
  function r2(v) { return Math.round(v * 100) / 100; }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function mm(v) { return (v / 1000).toFixed(3); }
  function dnA(dn) { return Math.PI / 4 * Math.pow(dn / 1000, 2); }
  function flowV(q, dn) { return (q > 0 && dn > 0) ? (q / 3600) / dnA(dn) : 0; }
  function dnFor(q, v) {
    if (q <= 0 || v <= 0) return 0;
    return Math.sqrt(4 * (q / 3600) / (Math.PI * v)) * 1000;
  }

  function txt(x, y, t, size, st, anchor, weight) {
    return '<text x="' + r2(x) + '" y="' + r2(y) + '" font-size="' + size + '" fill="' + st + '"' +
      (anchor ? ' text-anchor="' + anchor + '"' : '') +
      (weight ? ' font-weight="' + weight + '"' : '') + '>' + esc(t) + '</text>';
  }
  function line(x1, y1, x2, y2, st, w, dash) {
    return '<line x1="' + r2(x1) + '" y1="' + r2(y1) + '" x2="' + r2(x2) + '" y2="' + r2(y2) +
      '" stroke="' + st + '" stroke-width="' + r2(w) + '"' +
      (dash ? ' stroke-dasharray="' + dash + '"' : '') + '/>';
  }
  function pipe(x1, y1, x2, y2, col, light, wmm, sc, dash) {
    var w = Math.max(3, wmm * sc);
    return line(x1, y1, x2, y2, col, w, dash) + line(x1, y1, x2, y2, light, Math.max(1, w * 0.55), dash);
  }
  function arrow(x1, y1, x2, y2, st, w) {
    return '<line x1="' + r2(x1) + '" y1="' + r2(y1) + '" x2="' + r2(x2) + '" y2="' + r2(y2) +
      '" stroke="' + st + '" stroke-width="' + r2(w || 1.4) + '" marker-end="url(#fsAr)"/>';
  }
  function dimH(x1, x2, y, label) {
    return line(x1, y - 3, x1, y + 3, C.dim, 0.7) + line(x2, y - 3, x2, y + 3, C.dim, 0.7) +
      '<line x1="' + r2(x1) + '" y1="' + r2(y) + '" x2="' + r2(x2) + '" y2="' + r2(y) +
      '" stroke="' + C.dim + '" stroke-width="0.9" marker-start="url(#fsAr)" marker-end="url(#fsAr)"/>' +
      txt((x1 + x2) / 2, y - 5, label, 11, C.txt2, 'middle');
  }
  function dimV(x, y1, y2, label) {
    return line(x, y1 - 3, x, y1 + 3, C.dim, 0.7) + line(x, y2 - 3, x, y2 + 3, C.dim, 0.7) +
      '<line x1="' + r2(x) + '" y1="' + r2(y1) + '" x2="' + r2(x) + '" y2="' + r2(y2) +
      '" stroke="' + C.dim + '" stroke-width="0.9" marker-start="url(#fsAr)" marker-end="url(#fsAr)"/>' +
      txt(x + 5, (y1 + y2) / 2 + 4, label, 11, C.txt2, 'start');
  }
  function elevMark(x, y, label) {
    return '<path d="M' + r2(x - 8) + ' ' + r2(y - 6) + ' L' + r2(x + 8) + ' ' + r2(y - 6) +
      ' L' + r2(x) + ' ' + r2(y + 3) + ' Z" fill="' + C.in + '"/>' +
      txt(x - 12, y - 2, label, 11, C.in, 'end');
  }
  var DEFS = '<defs>' +
    '<marker id="fsAr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">' +
    '<path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></marker>' +
    '</defs>';

  /* ================= 派生几何 ================= */
  function der(c) {
    return {
      zBot: c.hm,                       // 单体底面
      zPort: c.hm + PORT_RISE,          // ①③ 总管 / 左右口中心
      zTop: c.hm + c.h,                 // 罐顶
      zWs: Z_WASTE,                     // ② 排污总管
      yIn: c.delta,                     // ① 进水总管（后）
      yOut: -c.delta,                   // ③ 出水总管（前）
      yWs: -(c.delta + WS_GAP),         // ② 排污总管（最前）
      W: (c.n - 1) * c.s + c.od         // 机组总宽
    };
  }

  /* 视图映射：把 mm 世界等比装进 680×420 */
  var VW = 680, VH = 420;
  function fit(wmm, hmm, pad) {
    var sc = Math.min((VW - 2 * pad) / wmm, (VH - 2 * pad) / hmm);
    return { sc: sc, ox: (VW - wmm * sc) / 2, oy: (VH - hmm * sc) / 2 };
  }
  /* 顶视图：世界 x 向右、y 向后（屏幕向上） */
  function mapTop(c, d, mg) {
    var xmin = -c.od / 2 - mg, xmax = (c.n - 1) * c.s + c.od / 2 + mg;
    var ymin = d.yWs - c.od / 2 - mg, ymax = d.yIn + c.od / 2 + mg;
    var m = fit(xmax - xmin, ymax - ymin, 16);
    return {
      sc: m.sc,
      X: function (x) { return m.ox + (x - xmin) * m.sc; },
      Y: function (y) { return m.oy + (ymax - y) * m.sc; }
    };
  }
  /* 立面类视图：水平为 h（可翻转）、垂直为标高 z */
  function mapElev(hmin, hmax, zmin, zmax, pad, hFlip) {
    var m = fit(hmax - hmin, zmax - zmin, pad);
    return {
      sc: m.sc,
      X: function (h) { return m.ox + (hFlip ? (hmax - h) : (h - hmin)) * m.sc; },
      Y: function (z) { return m.oy + (zmax - z) * m.sc; }
    };
  }

  /* ================= 顶视图 ================= */
  function renderTop(c) {
    var d = der(c), mg = Math.max(220, c.od * 1.2);
    var M = mapTop(c, d, mg), X = M.X, Y = M.Y, sc = M.sc;
    var x0 = -200, x1 = (c.n - 1) * c.s + 200;
    var o = DEFS;

    /* ② 排污总管（最前，先画 → 被压在最下） */
    o += pipe(X(x0), Y(d.yWs), X(x1), Y(d.yWs), C.ws, C.wsL, c.dnWs, sc);
    /* 每组排污：罐底中心 → 向前（-y）接 ② */
    for (var i = 0; i < c.n; i++) {
      var cx = i * c.s;
      o += line(X(cx), Y(0), X(cx), Y(d.yWs), C.wsL, Math.max(2, c.dnWs * sc * 0.7));
    }
    /* ③ 出水总管（前） */
    o += pipe(X(x0), Y(d.yOut), X(x1), Y(d.yOut), C.out, C.outL, c.dnOut, sc);
    /* ① 进水总管（后） */
    o += pipe(X(x0), Y(d.yIn), X(x1), Y(d.yIn), C.in, C.inL, c.dnIn, sc);

    for (var j = 0; j < c.n; j++) {
      var gx = j * c.s, bw = (j === c.bw);
      /* 后支管：罐后缘 → ①（V1 所在） */
      o += line(X(gx), Y(c.od / 2), X(gx), Y(d.yIn), C.inL, Math.max(2, c.dnBr * sc));
      /* 前支管：罐前缘 → ③ */
      o += line(X(gx), Y(-c.od / 2), X(gx), Y(d.yOut), C.outL, Math.max(2, c.dnBr * sc));
      /* 罐（俯视为圆） */
      o += '<circle cx="' + r2(X(gx)) + '" cy="' + r2(Y(0)) + '" r="' + r2(c.od / 2 * sc) +
        '" fill="' + (bw ? C.wsF : C.tank) + '" stroke="' + (bw ? C.ws : C.tankS) + '" stroke-width="1.1"/>';
      o += '<circle cx="' + r2(X(gx)) + '" cy="' + r2(Y(0)) + '" r="' + r2(Math.max(3, (c.od / 2 - 45) * sc)) +
        '" fill="none" stroke="' + (bw ? C.wsL : C.ghost) + '" stroke-width="0.8" stroke-dasharray="3 3"/>';
      /* V1（后支管中部）/ V2（排污管中部） */
      var v1y = d.yIn - (d.yIn - c.od / 2) / 2, v2y = d.yWs / 2;
      var vw = Math.max(7, VALVE_W * sc), vh = Math.max(6, VALVE_W * sc * 0.7);
      o += '<rect x="' + r2(X(gx) - vw / 2) + '" y="' + r2(Y(v1y) - vh / 2) + '" width="' + r2(vw) + '" height="' + r2(vh) +
        '" rx="2" fill="' + (bw ? C.ws : C.valve) + '" stroke="' + C.valveS + '" stroke-width="1"/>';
      o += '<rect x="' + r2(X(gx) - vw / 2) + '" y="' + r2(Y(v2y) - vh / 2) + '" width="' + r2(vw) + '" height="' + r2(vh) +
        '" rx="2" fill="' + (bw ? C.ws : C.valve) + '" stroke="' + C.valveS + '" stroke-width="1"/>';
      /* 俯视图：只给第 1 组引注阀位（其余组构造相同），避免多组时标注打架 */
      if (j === 0) {
        o += txt(X(gx) - vw / 2 - 5, Y(v1y) + 4, 'V1', 10, C.valveS, 'end');
        o += txt(X(gx) - vw / 2 - 5, Y(v2y) + 4, 'V2', 10, C.valveS, 'end');
      }
      o += txt(X(gx), Y(0) + 4, 'G' + (j + 1), 11, bw ? C.ws : C.txt3, 'middle', bw ? 700 : 400);
    }

    /* 流向箭头 */
    o += arrow(X(x0) - 6, Y(d.yIn), X(x0) + 26, Y(d.yIn), C.in, 1.6);
    o += txt(X(x0) - 10, Y(d.yIn) - 7, '进水', 12, C.in, 'end');
    o += arrow(X(x1) + 6, Y(d.yOut), X(x1) - 26, Y(d.yOut), C.out, 1.6);
    o += txt(X(x1) + 10, Y(d.yOut) + 4, '出水', 12, C.out, 'start');
    o += txt(X(x1) + 10, Y(d.yWs) + 4, '排污', 12, C.ws, 'start');

    /* 尺寸与注记 */
    o += dimH(X(0), X(c.s), Y(d.yIn) - Math.max(30, c.od * sc * 0.72), 'S=' + c.s);
    o += dimH(X(-c.od / 2), X(c.od / 2), Y(d.yIn) - Math.max(14, c.od * sc * 0.72) + 12, 'OD' + c.od);
    o += dimH(X(-c.od / 2), X((c.n - 1) * c.s + c.od / 2), Y(d.yWs) + 58,
      '总宽 W = ' + (c.n - 1) + 'S + OD = ' + d.W + ' mm');
    o += dimV(X(x1) + 74, Y(d.yIn), Y(d.yOut), '2Δ=' + (2 * c.delta));
    o += txt(X(x0), Y(d.yWs) + 24, '② 排污总管（最前 · 贴地 +' + mm(d.zWs) + '）  ·  DN' + c.dnWs, 11, C.ws, 'start');
    o += txt(X(x0), Y(d.yOut) + 18, '③ 出水总管（前 · +' + mm(d.zPort) + '）  ·  DN' + c.dnOut, 11, C.out, 'start');
    o += txt(X(x0), Y(d.yIn) - 22, '① 进水总管（后 · +' + mm(d.zPort) + '）  ·  DN' + c.dnIn, 11, C.in, 'start');
    o += txt(VW - 14, 18, '俯视 · 上=后 / 下=前', 11, C.txt3, 'end');
    return o;
  }

  /* ================= 前视图 ================= */
  function renderFront(c) {
    var d = der(c), mg = Math.max(260, c.od * 1.3);
    var hmin = -c.od / 2 - mg, hmax = (c.n - 1) * c.s + c.od / 2 + mg;
    var M = mapElev(hmin, hmax, -120, d.zTop + 220, 16, false);
    var X = M.X, Y = M.Y, sc = M.sc;
    var h0 = -120, h1 = (c.n - 1) * c.s + 120;
    var o = DEFS;

    /* 地面线 */
    o += line(X(hmin), Y(0), X(hmax), Y(0), C.dim, 1.2);
    /* ② 排污总管 */
    o += pipe(X(h0), Y(d.zWs), X(h1), Y(d.zWs), C.ws, C.wsL, c.dnWs, sc);
    /* ①③ 同层 → 投影重合：③ 实线在下、① 虚线叠上（标高精确，不人为错开） */
    o += pipe(X(h0), Y(d.zPort), X(h1), Y(d.zPort), C.out, C.outL, c.dnOut, sc);
    o += line(X(h0), Y(d.zPort), X(h1), Y(d.zPort), C.in, Math.max(1.6, c.dnIn * sc * 0.5), '7 5');

    for (var i = 0; i < c.n; i++) {
      var cx = i * c.s, bw = (i === c.bw);
      /* 罐体 */
      o += '<rect x="' + r2(X(cx - c.od / 2)) + '" y="' + r2(Y(d.zTop)) + '" width="' + r2(c.od * sc) +
        '" height="' + r2(c.h * sc) + '" fill="' + (bw ? C.wsF : C.tank) +
        '" stroke="' + (bw ? C.ws : C.tankS) + '" stroke-width="1.1"/>';
      /* 卡箍（罐底金属箍） */
      o += '<rect x="' + r2(X(cx - c.od / 2)) + '" y="' + r2(Y(d.zBot + 46)) + '" width="' + r2(c.od * sc) +
        '" height="' + r2(46 * sc) + '" fill="none" stroke="' + C.ghost + '" stroke-width="1"/>';
      /* 罐顶排气阀 ⑥ */
      var vx = c.od * 0.16;
      o += '<rect x="' + r2(X(cx) - vx * sc) + '" y="' + r2(Y(d.zTop) - 60 * sc) + '" width="' + r2(2 * vx * sc) +
        '" height="' + r2(60 * sc) + '" fill="' + (bw ? C.wsF : C.tank) +
        '" stroke="' + (bw ? C.ws : C.tankS) + '" stroke-width="0.8"/>';
      if (i === 0) o += txt(X(cx) + vx * sc + 5, Y(d.zTop) - 60 * sc + 11, '⑥ 排气', 10, C.txt3, 'start');
      /* 排污竖管（罐底 → ②）+ V2 */
      o += line(X(cx), Y(d.zBot), X(cx), Y(d.zWs), bw ? C.ws : C.wsL, Math.max(2.4, c.dnWs * sc * 0.75),
        bw ? null : 'none');
      var vw = Math.max(8, VALVE_W * sc), vh = Math.max(7, VALVE_W * sc * 0.62);
      var vy = (d.zBot + d.zWs) / 2;
      o += '<rect x="' + r2(X(cx) - vw / 2) + '" y="' + r2(Y(vy) - vh / 2) + '" width="' + r2(vw) + '" height="' + r2(vh) +
        '" rx="2" fill="' + (bw ? C.ws : C.valve) + '" stroke="' + C.valveS + '" stroke-width="1"/>';
      /* 组号 */
      o += txt(X(cx), Y(d.zTop) + 16, 'G' + (i + 1), 11, bw ? C.ws : C.txt3, 'middle', bw ? 700 : 400);
    }

    /* 尺寸与标高 */
    o += dimH(X(0), X(c.s), Y(d.zTop) - 34, 'S=' + c.s);
    o += dimV(X(hmax) - 34, Y(0), Y(d.zTop), 'H总=' + (c.hm + c.h));
    o += elevMark(X(hmin) + 74, Y(d.zTop), '+' + mm(d.zTop));
    o += elevMark(X(hmin) + 74, Y(d.zPort), '+' + mm(d.zPort));
    o += elevMark(X(hmin) + 74, Y(d.zBot), '+' + mm(d.zBot));
    o += elevMark(X(hmin) + 74, Y(d.zWs), '+' + mm(d.zWs));
    o += elevMark(X(hmin) + 74, Y(0), '±0.000');
    o += txt(X(hmin) + 60, Y(d.zPort) - 12, '①③ 总管同层（前后错开，投影重合）', 11, C.txt2, 'start');
    o += txt(VW - 14, 18, '前视 · 从前往后看（① 被 ③ 遮挡）', 11, C.txt3, 'end');
    return o;
  }

  /* ================= 侧视图（左视图：左=后 / 右=前） ================= */
  function renderSide(c) {
    var d = der(c), mg = Math.max(300, c.od * 1.4);
    var hmin = d.yWs - mg, hmax = d.yIn + mg;
    var M = mapElev(hmin, hmax, -120, d.zTop + 220, 16, true);
    var X = M.X, Y = M.Y, sc = M.sc;
    var o = DEFS, bw = (c.bw === 0);
    var cxc = X(0);

    o += line(X(hmin), Y(0), X(hmax), Y(0), C.dim, 1.2);
    /* 三根总管断面圆（唯一能同时看清前后错位与标高链的视图） */
    o += '<circle cx="' + r2(X(d.yWs)) + '" cy="' + r2(Y(d.zWs)) + '" r="' + r2(Math.max(4, c.dnWs / 2 * sc)) +
      '" fill="' + C.wsF + '" stroke="' + C.ws + '" stroke-width="1.4"/>';
    o += '<circle cx="' + r2(X(d.yOut)) + '" cy="' + r2(Y(d.zPort)) + '" r="' + r2(Math.max(4, c.dnOut / 2 * sc)) +
      '" fill="' + C.outF + '" stroke="' + C.out + '" stroke-width="1.4"/>';
    o += '<circle cx="' + r2(X(d.yIn)) + '" cy="' + r2(Y(d.zPort)) + '" r="' + r2(Math.max(4, c.dnIn / 2 * sc)) +
      '" fill="' + C.inF + '" stroke="' + C.in + '" stroke-width="1.4"/>';

    /* 排污：罐底中心 → 下 → 前 → ② */
    o += line(cxc, Y(d.zBot), cxc, Y(d.zWs), C.wsL, Math.max(2.4, c.dnWs * sc * 0.75));
    o += line(cxc, Y(d.zWs), X(d.yWs), Y(d.zWs), C.wsL, Math.max(2.4, c.dnWs * sc * 0.75));
    var vy = (d.zBot + d.zWs) / 2;
    var vw = Math.max(8, VALVE_W * sc), vh = Math.max(7, VALVE_W * sc * 0.62);
    o += '<rect x="' + r2(cxc - vw / 2) + '" y="' + r2(Y(vy) - vh / 2) + '" width="' + r2(vw) + '" height="' + r2(vh) +
      '" rx="2" fill="' + (bw ? C.ws : C.valve) + '" stroke="' + C.valveS + '" stroke-width="1"/>';
    o += txt(cxc + vw / 2 + 6, Y(vy) + 4, 'V2', 10, C.valveS, 'start');

    /* 前口 → ③ 支管（带流向箭头） */
    o += line(cxc + c.od / 2, Y(d.zPort), X(d.yOut), Y(d.zPort), C.outL, Math.max(2.4, c.dnBr * sc));
    o += arrow((cxc + X(d.yOut)) / 2 - 16, Y(d.zPort), (cxc + X(d.yOut)) / 2 + 16, Y(d.zPort), C.out, 1.4);
    o += txt(cxc + c.od / 2 + 4, Y(d.zPort) - 10, 'V2 常闭', 10, C.ws, 'start');
    /* 后口 → ① 支管（V1） */
    o += line(cxc - c.od / 2, Y(d.zPort), X(d.yIn), Y(d.zPort), C.inL, Math.max(2.4, c.dnBr * sc));
    var v1x = (cxc - c.od / 2 + X(d.yIn)) / 2;
    var vw1 = Math.max(8, VALVE_W * sc), vh1 = Math.max(8, VALVE_W * sc * 0.8);
    o += '<rect x="' + r2(v1x - vw1 / 2) + '" y="' + r2(Y(d.zPort) - vh1 / 2) + '" width="' + r2(vw1) + '" height="' + r2(vh1) +
      '" rx="2" fill="' + (bw ? C.ws : C.valve) + '" stroke="' + C.valveS + '" stroke-width="1"/>';
    o += txt(v1x, Y(d.zPort) - vh1 / 2 - 5, 'V1', 10, C.valveS, 'middle');

    /* 罐体（矩形 = 圆柱正投影） */
    o += '<rect x="' + r2(X(c.od / 2)) + '" y="' + r2(Y(d.zTop)) + '" width="' + r2(c.od * sc) +
      '" height="' + r2(c.h * sc) + '" fill="' + (bw ? C.wsF : C.tank) +
      '" stroke="' + (bw ? C.ws : C.tankS) + '" stroke-width="1.1"/>';
    o += line(X(c.od / 2), Y(d.zBot + 46), X(-c.od / 2), Y(d.zBot + 46), C.ghost, 1);
    /* 罐顶排气口 ⑥（侧视/左视为竖管，标出标高链顶端） */
    o += line(cxc, Y(d.zTop), cxc, Y(d.zTop + 70), C.tankS, 2.4);
    o += txt(cxc + 6, Y(d.zTop + 70) + 4, '⑥ 排气', 10, C.txt3, 'start');

    o += elevMark(X(hmax) - 92, Y(d.zTop), '+' + mm(d.zTop));
    o += elevMark(X(hmax) - 92, Y(d.zPort), '+' + mm(d.zPort));
    o += elevMark(X(hmax) - 92, Y(d.zBot), '+' + mm(d.zBot));
    o += elevMark(X(hmax) - 92, Y(d.zWs), '+' + mm(d.zWs));
    o += elevMark(X(hmax) - 92, Y(0), '±0.000');
    o += dimV(X(d.yOut) + 44, Y(d.zPort), Y(d.zWs), 'Δ+偏 = ' + Math.abs(d.yOut - d.yWs));
    o += txt(X(d.yIn) + 10, Y(d.zPort) - 16, '① 进水 +' + mm(d.zPort), 11, C.in, 'start');
    o += txt(X(d.yOut) - 10, Y(d.zPort) + 20, '③ 出水 +' + mm(d.zPort), 11, C.out, 'end');
    o += txt(X(d.yWs) + 10, Y(d.zWs) + 18, '② 排污 +' + mm(d.zWs), 11, C.ws, 'start');
    o += txt(VW - 14, 18, '侧视 · 左=后 / 右=前', 11, C.txt3, 'end');
    return o;
  }

  /* ================= 轴测图（等轴测） ================= */
  function renderAxo(c) {
    var d = der(c);
    var u = function (x, y) { return 0.866 * (x + y); };
    var v = function (x, y, z) { return 0.5 * (x - y) - z; };
    var x0 = -220, x1 = (c.n - 1) * c.s + 220;

    var probe = [
      [x0, d.yIn, d.zTop], [x1, d.yIn, d.zTop], [x0, d.yWs, 0], [x1, d.yWs, 0],
      [x0, d.yIn, d.zTop + 90], [x1, 0, 0]
    ];
    var umin = 1e9, umax = -1e9, vmin = 1e9, vmax = -1e9;
    probe.forEach(function (p) {
      var uu = u(p[0], p[1]), vv = v(p[0], p[1], p[2]);
      umin = Math.min(umin, uu); umax = Math.max(umax, uu);
      vmin = Math.min(vmin, vv); vmax = Math.max(vmax, vv);
    });
    var pad = 28;
    var sc = Math.min((VW - 2 * pad) / (umax - umin), (VH - 2 * pad) / (vmax - vmin));
    var ox = pad - umin * sc + (VW - 2 * pad - (umax - umin) * sc) / 2;
    var oy = pad - vmin * sc + (VH - 2 * pad - (vmax - vmin) * sc) / 2;
    var X = function (x, y) { return ox + u(x, y) * sc; };
    var Y = function (x, y, z) { return oy + v(x, y, z) * sc; };
    var rx = 1.2247 * sc, ry = 0.7071 * sc;                 // 单位半径的水平圆投影

    var o = DEFS;
    /* ② 排污总管（最前 → 最后画）；先画 ① 与罐体，再 ③，最后 ② */
    o += pipe(X(x0, d.yIn), Y(x0, d.yIn, d.zPort), X(x1, d.yIn), Y(x1, d.yIn, d.zPort), C.in, C.inL, c.dnIn, sc);

    for (var i = 0; i < c.n; i++) {
      var cx = i * c.s, bw = (i === c.bw);
      var R = c.od / 2;
      /* 排污竖管 + 前伸段 */
      o += line(X(cx, 0), Y(cx, 0, d.zBot), X(cx, 0), Y(cx, 0, d.zWs),
        bw ? C.ws : C.wsL, Math.max(2, c.dnWs * sc * 0.7));
      o += line(X(cx, 0), Y(cx, 0, d.zWs), X(cx, d.yWs), Y(cx, d.yWs, d.zWs),
        bw ? C.ws : C.wsL, Math.max(2, c.dnWs * sc * 0.7));
      /* 后支管（V1）+ 前支管 */
      o += line(X(cx, R), Y(cx, R, d.zPort), X(cx, d.yIn), Y(cx, d.yIn, d.zPort), C.inL, Math.max(2, c.dnBr * sc));
      o += line(X(cx, -R), Y(cx, -R, d.zPort), X(cx, d.yOut), Y(cx, d.yOut, d.zPort), C.outL, Math.max(2, c.dnBr * sc));
      /* 罐体：底椭圆 + 侧影 + 顶椭圆（水平圆 → 固定比例椭圆） */
      var erx = rx * R, ery = Math.max(3, ry * R);
      o += '<ellipse cx="' + r2(X(cx, 0)) + '" cy="' + r2(Y(cx, 0, d.zBot)) + '" rx="' + r2(erx) + '" ry="' + r2(ery) +
        '" fill="' + (bw ? C.wsF : C.tank) + '" stroke="' + (bw ? C.ws : C.tankS) + '" stroke-width="1"/>';
      var blu = X(cx, R), blv = Y(cx, R, d.zBot), tlu = X(cx, R), tlv = Y(cx, R, d.zTop);
      var bru = X(cx, -R), brv = Y(cx, -R, d.zBot), tru = X(cx, -R), trv = Y(cx, -R, d.zTop);
      o += '<path d="M' + r2(blu) + ' ' + r2(blv) + ' L' + r2(tlu) + ' ' + r2(tlv) + ' L' + r2(tru) + ' ' + r2(trv) +
        ' L' + r2(bru) + ' ' + r2(brv) + ' Z" fill="' + (bw ? C.wsF : C.tank) + '" stroke="none"/>';
      o += line(tlu, tlv, blu, blv, bw ? C.ws : C.tankS, 1);
      o += line(tru, trv, bru, brv, bw ? C.ws : C.tankS, 1);
      o += '<ellipse cx="' + r2(X(cx, 0)) + '" cy="' + r2(Y(cx, 0, d.zTop)) + '" rx="' + r2(erx) + '" ry="' + r2(ery) +
        '" fill="' + (bw ? C.wsF : C.tank) + '" stroke="' + (bw ? C.ws : C.tankS) + '" stroke-width="1.2"/>';
      /* 排气阀 ⑥ */
      o += line(X(cx, 0), Y(cx, 0, d.zTop), X(cx, 0), Y(cx, 0, d.zTop + 70), C.tankS, 2.4);
      /* V1 / V2 阀块 */
      var vwA = Math.max(7, VALVE_W * sc), vhA = Math.max(7, VALVE_W * sc * 0.8);
      var m1 = u(cx, (R + d.yIn) / 2), m1v = v(cx, (R + d.yIn) / 2, d.zPort);
      o += '<rect x="' + r2(ox + m1 * sc - vwA / 2) + '" y="' + r2(oy + m1v * sc - vhA / 2) + '" width="' + r2(vwA) +
        '" height="' + r2(vhA) + '" rx="2" fill="' + (bw ? C.ws : C.valve) + '" stroke="' + C.valveS + '" stroke-width="1"/>';
      var m2 = u(cx, 0), m2v = v(cx, 0, (d.zBot + d.zWs) / 2);
      o += '<rect x="' + r2(ox + m2 * sc - vwA / 2) + '" y="' + r2(oy + m2v * sc - vhA / 2) + '" width="' + r2(vwA) +
        '" height="' + r2(vhA) + '" rx="2" fill="' + (bw ? C.ws : C.valve) + '" stroke="' + C.valveS + '" stroke-width="1"/>';
      o += txt(X(cx, 0), Y(cx, 0, d.zTop + 70) - 8, 'G' + (i + 1), 10, bw ? C.ws : C.txt3, 'middle', bw ? 700 : 400);
      /* 轴测图：只给第 1 组引注阀位与排气口，避免多组时标注打架 */
      if (i === 0) {
        o += txt(ox + m1 * sc, oy + m1v * sc - vhA / 2 - 4, 'V1', 9, C.valveS, 'middle');
        o += txt(ox + m2 * sc - vwA / 2 - 4, oy + m2v * sc + 3, 'V2', 9, C.valveS, 'end');
        o += txt(X(cx, 0) + 7, Y(cx, 0, d.zTop + 70) - 8, '⑥', 9, C.txt3, 'start');
      }
    }

    o += pipe(X(x0, d.yOut), Y(x0, d.yOut, d.zPort), X(x1, d.yOut), Y(x1, d.yOut, d.zPort), C.out, C.outL, c.dnOut, sc);
    o += pipe(X(x0, d.yWs), Y(x0, d.yWs, d.zWs), X(x1, d.yWs), Y(x1, d.yWs, d.zWs), C.ws, C.wsL, c.dnWs, sc);

    o += txt(X(x0, d.yIn) - 6, Y(x0, d.yIn, d.zPort), '① 进水总管', 11, C.in, 'end');
    o += txt(X(x1, d.yOut) + 6, Y(x1, d.yOut, d.zPort) + 12, '③ 出水总管', 11, C.out, 'start');
    o += txt(X(x1, d.yWs) + 6, Y(x1, d.yWs, d.zWs) - 6, '② 排污总管', 11, C.ws, 'start');
    o += txt(14, 18, '轴测 · 后接口=进水 / 前接口=出水', 11, C.txt3, 'start');
    return o;
  }

  /* ================= 选型计算 ================= */
  function calc(c) {
    var d = der(c);
    var bwOn = c.bw >= 0 ? 1 : 0;
    var act = c.n - bwOn;
    var qg = act > 0 ? c.q / act : 0;
    var vBr = flowV(qg, c.dnBr);
    var vIn = flowV(c.q, c.dnIn);
    var qbw = qg * 2.5;
    var dNeed = dnFor(qbw, 2.0);
    var need = c.od + c.clear;
    var okS = c.s >= need;
    return {
      d: d, act: act, bwOn: bwOn, qg: qg, vBr: vBr, vIn: vIn, qbw: qbw,
      dNeed: dNeed, need: need, okS: okS, W: d.W, zTop: d.zTop, loss: c.loss
    };
  }
  function vJud(v) { return (v < 0.8 || v > 2.2) ? 'bad' : ((v < 1.0 || v > 2.0) ? 'warn' : 'ok'); }
  function vTxt(v) { return v < 1.0 ? '偏低' : (v > 2.0 ? '偏高' : '合理'); }

  function calcRows(c) {
    var k = calc(c), d = k.d;
    var dnRec = Math.ceil(k.dNeed / 5) * 5;
    var rows = [
      { id: 'act', label: '过流组数', val: k.act + ' / ' + c.n + (k.bwOn ? '（1 组反冲中）' : '（全部过滤）'), cls: '' },
      { id: 'qg', label: '单组过流量 q', val: f(k.qg, 1) + ' m³/h', cls: '' },
      { id: 'vbr', label: '支管流速 v（DN' + c.dnBr + '）', val: f(k.vBr, 2) + ' m/s · ' + vTxt(k.vBr), cls: vJud(k.vBr) },
      { id: 'vin', label: '总管流速 v（DN' + c.dnIn + '）', val: f(k.vIn, 2) + ' m/s · ' + vTxt(k.vIn), cls: vJud(k.vIn) },
      { id: 'qbw', label: '反冲洗流量（2.5q）', val: f(k.qbw, 1) + ' m³/h', cls: '' },
      { id: 'dnws', label: '排污管建议', val: '≥ DN' + dnRec + '（v ≤ 2.0 m/s）' + (c.dnWs >= k.dNeed ? ' ✓' : ' ✗'),
        cls: c.dnWs >= k.dNeed ? 'ok' : 'bad' },
      { id: 'gap', label: '间距校验 S ≥ OD＋检修', val: c.s + ' ≥ ' + k.need + ' mm' + (k.okS ? ' ✓' : ' ✗'),
        cls: k.okS ? 'ok' : 'bad' },
      { id: 'width', label: '机组总宽 W', val: k.W + ' mm', cls: '' },
      { id: 'ztop', label: '罐顶标高', val: '+' + mm(k.zTop), cls: '' },
      /* 标高链自下而上：② 排污总管（贴地）→ 罐底 → ①③ 总管（左右口同高）→ 罐顶排气口 ⑥ */
      { id: 'zchain', label: '标高链 ②/罐底/①③/罐顶⑥',
        val: '+' + mm(d.zWs) + ' / +' + mm(d.zBot) + ' / +' + mm(d.zPort) + ' / +' + mm(d.zTop), cls: '' },
      { id: 'loss', label: '过滤与阀门损失（本页设定）', val: f(c.loss, 1) + ' m', cls: '' },
      { id: 'lossref', label: '过滤损失参考区间', val: '清洁 2~3 m · 需反冲洗 5~7 m（行业经验，待校正）', cls: '' }
    ];
    return rows;
  }

  /* ================= DOM ================= */
  function rangeRow(spec) {
    return '<div class="fs-row">' +
      '<label>' + esc(spec.label) + '</label>' +
      '<input type="range" data-fs-range="' + spec.k + '" min="' + spec.min + '" max="' + spec.max + '" step="' + spec.step + '">' +
      '<input type="number" data-fs-num="' + spec.k + '" min="' + spec.min + '" max="' + spec.max + '" step="' + spec.step + '">' +
      '<span class="fs-unit">' + esc(spec.unit) + '</span></div>';
  }
  function shellHtml() {
    var opt = DN_LIST.map(function (d) { return '<option value="' + d + '">' + d + '</option>'; }).join('');
    var h = '';
    h += '<div class="fs-wrap">';
    /* ---- 顶部条 ---- */
    h += '<div class="fs-bar">' +
      '<span class="fs-bar-title">过滤系统 · 叠片过滤器并联机组</span>' +
      '<span class="fs-bar-sub">GREEN 型单体 · 每组 V1 进水阀 + V2 排污阀 · 图纸不表达安装支墩</span>' +
      '<span class="fs-bar-sp"></span>' +
      '<button type="button" class="fs-bar-btn" data-fs-act="syncFlow" title="从当前设计方案读联合流量作为本页设计流量 Q">⟵ 取当前方案流量</button>' +
      '<button type="button" class="fs-bar-btn solid" data-fs-act="writeLoss" title="把本页过滤损失写入三级/二级计算的「过滤与阀门损失」">写入过滤损失 →</button>' +
      '<button type="button" class="fs-bar-btn" data-fs-act="reset">恢复默认参数</button>' +
      '</div>';
    h += '<div class="fs-wrap-body" style="display:flex;flex:1 1 auto;min-height:0">';
    /* ---- 左栏 ---- */
    h += '<aside class="fs-side">';
    h += '<div class="fs-group"><div class="fs-gh">机组参数<em>改即联动四视图</em></div>' +
      RANGES.map(rangeRow).join('') + '</div>';
    h += '<div class="fs-group"><div class="fs-gh">管路管径</div>' +
      DNS.map(function (x) {
        return '<div class="fs-row"><label>' + esc(x.label) + '</label>' +
          '<select data-fs-sel="' + x.k + '">' + opt + '</select><span class="fs-unit">DN</span></div>';
      }).join('') + '</div>';
    h += '<div class="fs-group"><div class="fs-gh">过滤损失<em>可回写扬程计算</em></div>' +
      '<div class="fs-row"><label>损失取值</label>' +
      '<input type="number" data-fs-num="loss" min="0" max="30" step="0.5"><span class="fs-unit">m</span></div>' +
      '<div class="fs-note">清洁状态约 2~3 m，压差报警前约 5~7 m。<b>点顶部「写入过滤损失」</b>即可把该值送进三级 / 二级计算的扬程算式。</div>' +
      '</div>';
    h += '<div class="fs-group"><div class="fs-gh">反冲洗模拟<em>点选组别切换</em></div>' +
      '<div class="fs-chips" id="fsChips"></div>' +
      '<div class="fs-note">过滤位：① → V1 → 单体后口 → 滤芯 → 前口 → ③（V2 常闭）。<br>' +
      '反冲位：关该组 V1、开该组 V2 → 其余组净水在 ③ 内倒行 → 前口入罐反冲 → 后口出 → V2 → ② 排走。</div>' +
      '</div>';
    h += '</aside>';
    /* ---- 主区 ---- */
    h += '<section class="fs-main">';
    h += '<div class="fs-grid">' +
      vcard('top', '顶视图（组合平面）', '组间距 / 总宽 / 阀位') +
      vcard('front', '前视图（立面）', '标高链 / 罐高') +
      vcard('side', '侧视图（端部投影）', '前后错位 / 接口') +
      vcard('axo', '轴测图（空间关系）', '示意化') +
      '</div>';
    h += '<div class="fs-block"><div class="fs-block-h">选型计算<em>与四视图同源，改参数即时更新</em></div>' +
      '<div id="fsCalc"></div>' +
      '<div class="fs-leg">' +
      '<span><i class="fs-lg" style="background:' + C.in + '"></i>① 进水总管</span>' +
      '<span><i class="fs-lg" style="background:' + C.out + '"></i>③ 出水总管</span>' +
      '<span><i class="fs-lg" style="background:' + C.ws + '"></i>② 排污总管</span>' +
      '<span><i class="fs-lg-square" style="background:' + C.valve + ';border:1px solid ' + C.valveS + '"></i>V1 / V2 阀</span>' +
      '<span><i class="fs-lg-square" style="background:' + C.wsF + ';border:1px solid ' + C.ws + '"></i>反冲洗中的组</span>' +
      '</div></div>';
    h += '</section>';
    h += '</div></div>';
    return h;
  }
  function vcard(id, title, note) {
    return '<div class="fs-vcard"><div class="fs-vcard-h"><b>' + esc(title) + '</b><em>' + esc(note) + '</em></div>' +
      '<svg id="' + SVG_IDS[id] + '" viewBox="0 0 ' + VW + ' ' + VH + '" preserveAspectRatio="xMidYMid meet"></svg></div>';
  }

  /* ================= 渲染 ================= */
  function render() {
    if (!rootEl || !cfg) return;
    if (cfg.bw >= cfg.n) cfg.bw = -1;
    var v = {
      top: renderTop(cfg), front: renderFront(cfg),
      side: renderSide(cfg), axo: renderAxo(cfg)
    };
    Object.keys(SVG_IDS).forEach(function (k) {
      var el = rootEl.querySelector('#' + SVG_IDS[k]);
      if (el) el.innerHTML = v[k];
    });
    var box = rootEl.querySelector('#fsCalc');
    if (box) {
      box.innerHTML = calcRows(cfg).map(function (r) {
        return '<div class="fs-kv" data-fs-kv="' + r.id + '">' +
          '<span class="fs-kv-note">' + esc(r.label) + '</span>' +
          '<span class="' + (r.cls ? 'fs-' + r.cls : '') + '">' + esc(r.val) + '</span></div>';
      }).join('');
    }
    renderChips();
  }
  function renderChips() {
    var box = rootEl.querySelector('#fsChips');
    if (!box) return;
    var h = '';
    for (var i = 0; i < cfg.n; i++) {
      h += '<button type="button" class="fs-chip' + (i === cfg.bw ? ' on' : '') + '" data-fs-bw="' + i + '">' +
        'G' + (i + 1) + (i === cfg.bw ? ' 反冲' : ' 过滤') + '</button>';
    }
    h += '<button type="button" class="fs-chip" data-fs-bw="-1">全部恢复过滤</button>';
    box.innerHTML = h;
  }

  /* ================= 交互 ================= */
  function num(k, v) {
    var x = Number(v);
    if (!isFinite(x)) return cfg[k];
    return x;
  }
  function setKey(k, v, skipSync) {
    var old = cfg[k];
    cfg[k] = v;
    if (k === 'n' && cfg.bw >= cfg.n) cfg.bw = -1;
    if (!skipSync) syncInputs(k);
    if (old !== v) saveCfg();
    render();
  }
  function syncInputs(except) {
    if (!rootEl) return;
    rootEl.querySelectorAll('[data-fs-range],[data-fs-num],[data-fs-sel]').forEach(function (el) {
      var k = el.getAttribute('data-fs-range') || el.getAttribute('data-fs-num') || el.getAttribute('data-fs-sel');
      if (k === except) return;
      el.value = cfg[k];
    });
  }
  function bindInputs() {
    rootEl.addEventListener('input', function (e) {
      var t = e.target;
      if (!t || !t.getAttribute) return;
      var k = t.getAttribute('data-fs-range') || t.getAttribute('data-fs-num');
      if (!k) return;
      if (t.getAttribute('data-fs-num') && t.value === '') return;
      setKey(k, num(k, t.value));
    });
    rootEl.addEventListener('change', function (e) {
      var t = e.target;
      if (!t || !t.getAttribute) return;
      var k = t.getAttribute('data-fs-sel');
      if (k) { setKey(k, num(k, t.value)); return; }
      k = t.getAttribute('data-fs-num');
      if (k) setKey(k, num(k, t.value));
    });
    rootEl.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var bw = t.closest('[data-fs-bw]');
      if (bw) {
        var i = Number(bw.getAttribute('data-fs-bw'));
        cfg.bw = (cfg.bw === i) ? -1 : i;
        saveCfg(); render();
        return;
      }
      var act = t.closest('[data-fs-act]');
      if (act) doAct(act.getAttribute('data-fs-act'), act);
    });
  }

  /* ---- 与灌溉设计工具融合：读流量 / 写损失 ---- */
  function planNote(msg, ok) {
    var bar = rootEl && rootEl.querySelector('.fs-bar-sub');
    if (bar) bar.textContent = msg;
    if (!ok) { /* 失败仅提示，不改任何数据 */ }
  }
  function readPlanFlow() {
    var el = document.getElementById('tlPlanPumpFlow');
    var t = el ? String(el.textContent).replace(/[^\d.\-]/g, '') : '';
    var v = Number(t);
    return (isFinite(v) && v > 0) ? v : 0;
  }
  function doAct(name, btn) {
    if (name === 'reset') {
      cfg = clone(DEFAULTS);
      saveCfg(); syncInputs(); render();
      planNote('已恢复默认参数。', false);
      return;
    }
    if (name === 'syncFlow') {
      var v = readPlanFlow();
      if (v > 0) {
        cfg.q = Math.max(5, Math.min(400, Math.round(v / 5) * 5));
        saveCfg(); syncInputs(); render();
        planNote('已取当前方案联合流量 ' + f(v, 1) + ' m³/h → 本页设计流量 Q = ' + cfg.q + ' m³/h。', true);
      } else {
        planNote('未读到当前方案流量（请先到「三级管路」生成管线图）——本页仍用手工设定值。', false);
      }
      return;
    }
    if (name === 'writeLoss') {
      var n = 0, targets = [];
      [['tl_filterLoss', '三级'], ['fld_filterLoss', '二级']].forEach(function (p) {
        var el = document.getElementById(p[0]);
        if (!el) return;
        el.value = cfg.loss;
        try {
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (e) { }
        n++; targets.push(p[1]);
      });
      if (n) planNote('已把过滤与阀门损失 = ' + f(cfg.loss, 1) + ' m 写入 ' + targets.join(' / ') + ' 计算（扬程会随之更新）。', true);
      else planNote('未找到「过滤与阀门损失」输入框，未写入。', false);
      return;
    }
  }

  /* ================= 存档 ================= */
  function loadCfg() {
    try {
      var raw = window.localStorage.getItem(CFG_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || typeof o !== 'object') return null;
      var r = clone(DEFAULTS);
      Object.keys(DEFAULTS).forEach(function (k) {
        if (typeof o[k] === 'number' && isFinite(o[k])) r[k] = o[k];
      });
      return r;
    } catch (e) { return null; }
  }
  function saveCfg() {
    try { window.localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) { }
  }

  /* ================= 挂载 ================= */
  function isMountedNow() {
    var s = document.getElementById(SEC_ID);
    return !!(s && s.querySelector('.fs-wrap'));
  }
  function mount() {
    var sec = document.getElementById(SEC_ID);
    if (!sec) return null;
    if (!sec.querySelector('.fs-wrap')) {
      var ph = sec.querySelector('.fs-empty');
      if (ph && ph.parentNode) ph.parentNode.removeChild(ph);
      sec.insertAdjacentHTML('beforeend', shellHtml());
    }
    rootEl = sec.querySelector('.fs-wrap');
    if (!rootEl.__fsBound) { bindInputs(); rootEl.__fsBound = 1; }
    if (!cfg) cfg = loadCfg() || clone(DEFAULTS);
    syncInputs();
    render();
    return rootEl;
  }
  function hookShow() {
    ['ryShowSection', 'ryJumpToSection'].forEach(function (name) {
      var orig = window[name];
      if (typeof orig !== 'function' || orig.__fsHooked) return;
      var wrapped = function () {
        var r = orig.apply(this, arguments);
        try {
          var a0 = arguments[0];
          var id = (typeof a0 === 'string') ? a0 : (a0 && a0.id);
          if (id === SEC_ID) mount();
        } catch (e) { }
        return r;
      };
      wrapped.__fsHooked = 1;
      window[name] = wrapped;
    });
  }
  function autoMount() {
    hookShow();
    var sec = document.getElementById(SEC_ID);
    if (!sec) return;
    if (window.IntersectionObserver && !sec.querySelector('.fs-wrap')) {
      var io = new IntersectionObserver(function (es) {
        for (var i = 0; i < es.length; i++) {
          if (es[i].isIntersecting) { io.disconnect(); mount(); return; }
        }
      });
      io.observe(sec);
    }
  }

  /* ================= 对外 API ================= */
  window.RyFilterSystem = {
    SEC_ID: SEC_ID,
    CFG_KEY: CFG_KEY,
    DEFAULTS: clone(DEFAULTS),
    PORT_RISE: PORT_RISE,
    Z_WASTE: Z_WASTE,
    mount: mount,
    autoMount: autoMount,
    isMounted: isMountedNow,
    root: function () { return rootEl; },
    getConfig: function () { return cfg ? clone(cfg) : null; },
    setConfig: function (o) {
      var r = clone(DEFAULTS);
      if (o) Object.keys(DEFAULTS).forEach(function (k) {
        if (typeof o[k] === 'number' && isFinite(o[k])) r[k] = o[k];
      });
      cfg = r;
      if (!isMountedNow()) mount();
      syncInputs(); render(); saveCfg();
      return clone(cfg);
    },
    reset: function () { cfg = clone(DEFAULTS); syncInputs(); render(); saveCfg(); return clone(cfg); },
    refresh: function () { render(); },
    /* 只读钩子：一律读**渲染出的 DOM**，不返回内部状态 —— e2e 断言的是「用户真的看到了什么」 */
    svg: function (key) {
      var el = rootEl && rootEl.querySelector('#' + SVG_IDS[key]);
      return el ? el.innerHTML : null;
    },
    svgIds: clone(SVG_IDS),
    rows: function () {
      var box = rootEl && rootEl.querySelector('#fsCalc');
      if (!box) return null;
      return Array.prototype.map.call(box.querySelectorAll('[data-fs-kv]'), function (d) {
        return { id: d.getAttribute('data-fs-kv'), label: d.children[0].textContent.trim(), val: d.children[1].textContent.trim() };
      });
    },
    chips: function () {
      var box = rootEl && rootEl.querySelector('#fsChips');
      if (!box) return null;
      return Array.prototype.map.call(box.querySelectorAll('[data-fs-bw]'), function (b) {
        return { i: Number(b.getAttribute('data-fs-bw')), text: b.textContent.trim(), on: b.className.indexOf(' on') >= 0 };
      });
    },
    der: function () { return cfg ? der(cfg) : null; },
    calc: function () { return cfg ? calc(cfg) : null; },
    planFlow: readPlanFlow
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoMount);
  else autoMount();
})();
