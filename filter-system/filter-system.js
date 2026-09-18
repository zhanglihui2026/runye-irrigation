/* 过滤系统 · 叠片过滤器并联机组选型工作台（2026-09-18）
 *
 * 宿主：index.html 的 #filterSystemSection（第七十一轮预留的空壳页；本轮把
 *       workspace 里已确认的过滤机组建模成果融合进来）。
 *
 * 拓扑（GREEN 型叠片过滤器单体并联，**图纸不表达安装支墩/支架**）：
 *   ① 进水总管（后侧高位，唯一进水）· ③ 出水总管（前侧）· ② 排污总管（贴地，与 ① 同一竖直平面）
 *   过滤：  ①上 → 立管·进水阀 V → 汇流节点 → 支管平接（与③同高）
 *           → 单体后口 → 滤芯 → 前口 → ③ → 下游（P 排污阀常闭）
 *   反冲：  关该组 V、开该组 P → 其余组净水在 ③ 内倒行 → 该组前口入罐反冲
 *           → 后口出 → 支管 → 节点 → 排污立管 P → ② 排走
 *   阀编号：V1~V4 = 进水阀（立管中段，控①上）；P1~P4 = 排污阀（节点下排污立管，常闭）
 *           每组 2 阀、全系统 8 阀（21:51 用户批注定稿：删掉 +0.720 进水总管，P 从罐底移到节点下）
 *
 * 实物口径（2026-09-18 依用户实物照校正，均以「单体底面」为安装基准面）：
 *   单体总高 H=750 · 罐外径 OD=200 · 含左右口总宽 350 · 左右口中心离底 120
 *   单体底面 +0.600（用户定架装 0.6 m）→ 支管/罐口/③ 同层 +0.720 → 罐顶 +1.350
 *   ①上 总管 +1.520（唯一进水总管，2026-09-18 定稿 800 抬高）· 支管与罐口/③ 同高 +0.720 平接
 *   （21:51 用户批注：节点正下方加排污立管 P 落 ②、删掉 +0.720 进水总管——每组只剩 V+P 两阀）
 *   （22:06 用户批注：取消节点后侧余段、支管补通至罐后口、排污立管直落 ②——② 移到与 ① 同平面）
 *   ② 排污总管贴地 +0.060（排污立管直落接入）；①③ 前后各偏 Δ=260
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
  var VALVE_W = 90;      // 阀体示意尺寸（mm）
  var IN_TOP_RISE = 800; // ①上 进水总管比罐口抬高（mm，2026-09-18 定稿 800 → ①上 +1.520、进水阀（立管中段）+1.120）

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
    fit: 'url(#fsFitG)', fitS: '#6E6E80',   /* 管件：白→灰渐变本体 + 深灰描边 */
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
  /* 管件（三通本体/卡箍）矩形块：渐变本体 + 深灰描边 */
  function fitRect(x, y, w, h, rx) {
    return '<rect x="' + r2(x) + '" y="' + r2(y) + '" width="' + r2(w) + '" height="' + r2(h) +
      '" rx="' + r2(rx === undefined ? 2 : rx) + '" fill="' + C.fit + '" stroke="' + C.fitS +
      '" stroke-width="1.4" stroke-linejoin="round"/>';
  }
  /* 竖向承口套环（骑在管交界处）：渐变块 + 注塑棱线 ×2 + 高光 */
  function fitCollar(cx, cy, w, h) {
    var rr = Math.min(3, w * 0.3);
    return fitRect(cx - w / 2, cy - h / 2, w, h, rr) +
      line(cx - w * 0.24, cy - h / 2 + 1.5, cx - w * 0.24, cy + h / 2 - 1.5, '#C7C7D2', 1) +
      line(cx + w * 0.24, cy - h / 2 + 1.5, cx + w * 0.24, cy + h / 2 - 1.5, '#C7C7D2', 1) +
      fitShine(cx - w * 0.33, cy - h / 2 + 1.2, cx - w * 0.33, cy + h / 2 - 1.2);
  }
  /* 圆角 T 形三通轮廓（臂朝右）：nx/ny=节点中心，w=竖臂宽，hUp/hDn=上下延伸，armLen/armH=横臂，r=圆角 */
  function roundedTee(nx, ny, w, hUp, hDn, armLen, armH, r) {
    var xL = nx - w / 2, xR = nx + w / 2, xA = nx + armLen;
    var yT = ny - hUp, yB = ny + hDn, yAT = ny - armH / 2, yAB = ny + armH / 2;
    function p(x, y) { return r2(x) + ' ' + r2(y); }
    return 'M' + p(xL + r, yT) + ' L' + p(xR - r, yT) + ' Q' + p(xR, yT) + ' ' + p(xR, yT + r) +
      ' L' + p(xR, yAT - r) + ' Q' + p(xR, yAT) + ' ' + p(xR + r, yAT) +
      ' L' + p(xA - r, yAT) + ' Q' + p(xA, yAT) + ' ' + p(xA, yAT + r) +
      ' L' + p(xA, yAB - r) + ' Q' + p(xA, yAB) + ' ' + p(xA - r, yAB) +
      ' L' + p(xR + r, yAB) + ' Q' + p(xR, yAB) + ' ' + p(xR, yAB + r) +
      ' L' + p(xR, yB - r) + ' Q' + p(xR, yB) + ' ' + p(xR - r, yB) +
      ' L' + p(xL + r, yB) + ' Q' + p(xL, yB) + ' ' + p(xL, yB - r) +
      ' L' + p(xL, yT + r) + ' Q' + p(xL, yT) + ' ' + p(xL + r, yT) + ' Z';
  }
  /* 管件法兰/承口箍：短粗线 */
  function fitFlange(x1, y1, x2, y2) {
    return line(x1, y1, x2, y2, C.fitS, 3.4);
  }
  /* 管件本体高光线（塑料件质感） */
  function fitShine(x1, y1, x2, y2) {
    return line(x1, y1, x2, y2, '#FFFFFF', 1.4);
  }
  /* 管端堵头（v17，盲板端盖）：横管（顶视/前视）端头的竖向短板，管色本体 + 深灰描边 + 高光 */
  function endCapV(cx, cy, hgt, col, tag) {
    return '<rect x="' + r2(cx - 2) + '" y="' + r2(cy - hgt / 2) + '" width="4" height="' + r2(hgt) +
      '" rx="1.2" data-fs-cap="' + tag + '" fill="' + col + '" stroke="' + C.fitS +
      '" stroke-width="1.1" stroke-linejoin="round"/>' +
      line(cx - 1, cy - hgt / 2 + 1.4, cx - 1, cy + hgt / 2 - 1.4, '#FFFFFF', 1.1);
  }
  /* 轴测管端堵头（v17）：垂直于管轴屏幕方向 (dx,dy) 的斜向短板（描边层 + 管色本体 + 高光） */
  function axoCap(px, py, dx, dy, len, col, tag) {
    var hx = -dy * len / 2, hy = dx * len / 2;
    return line(px - hx, py - hy, px + hx, py + hy, C.fitS, 6).replace('/>', ' data-fs-cap="' + tag + '"/>') +
      line(px - hx, py - hy, px + hx, py + hy, col, 3.8) +
      line(px - hx * 0.5 + dx, py - hy * 0.5 + dy, px + hx * 0.5 + dx, py + hy * 0.5 + dy, '#FFFFFF', 1.1);
  }
  /* ---- 沟槽卡箍式快接（v25，依用户实物照：对卡两半壳 + 两端沟槽唇边 + 中缝 + 螺栓紧固） ----
   * orient 'v' = 管轴竖向（顶视支管）；'h' = 管轴横向（侧视支管）。
   * axial = 沿管轴长、radial = 垂直管轴外径（比管宽大一圈）。
   * 仅主体 rect 挂 data-fs-coup（e2e 计数依赖）；螺栓只在顶视画（侧视上下被流向箭头带占位）。 */
  function grooveCoupling(cx, cy, axial, radial, orient, tag, title) {
    var hw = radial / 2, ha = axial / 2;
    var x = orient === 'v' ? cx - hw : cx - ha;
    var y = orient === 'v' ? cy - ha : cy - hw;
    var w = orient === 'v' ? radial : axial;
    var h = orient === 'v' ? axial : radial;
    var s = '<rect x="' + r2(x) + '" y="' + r2(y) + '" width="' + r2(w) + '" height="' + r2(h) +
      '" rx="2" data-fs-coup="' + tag + '" fill="' + C.fit + '" stroke="' + C.fitS + '" stroke-width="1"';
    s += title ? '><title>' + title + '</title></rect>' : '/>';
    if (orient === 'v') {
      /* 两端沟槽唇边（垂直管轴的横筋）+ 中缝（两半壳对缝，沿管轴）+ 顶部高光 */
      s += line(x + 1.5, y + 2.2, x + w - 1.5, y + 2.2, C.fitS, 1.2) +
        line(x + 1.5, y + h - 2.2, x + w - 1.5, y + h - 2.2, C.fitS, 1.2) +
        line(cx, y + 3.6, cx, y + h - 3.6, '#FFFFFF', 1) +
        line(x + w * 0.22, y + 2.2, x + w * 0.5 - 2, y + 2.2, '#FFFFFF', 1);
      /* 紧固螺栓：分型两侧水平伸出（螺栓头小方块） */
      s += '<rect x="' + r2(x - 4.4) + '" y="' + r2(cy - 2) + '" width="4.4" height="4" rx="0.8" fill="#CBD5E1" stroke="' + C.fitS + '" stroke-width="0.8"/>' +
        '<rect x="' + r2(x + w) + '" y="' + r2(cy - 2) + '" width="4.4" height="4" rx="0.8" fill="#CBD5E1" stroke="' + C.fitS + '" stroke-width="0.8"/>';
    } else {
      /* 横向：唇边改竖筋 + 中缝沿管轴（螺栓省略——上方 9px 是流向箭头带） */
      s += line(x + 2.2, y + 1.5, x + 2.2, y + h - 1.5, C.fitS, 1.2) +
        line(x + w - 2.2, y + 1.5, x + w - 2.2, y + h - 1.5, C.fitS, 1.2) +
        line(x + 3.6, cy, x + w - 3.6, cy, '#FFFFFF', 1);
    }
    return s;
  }
  /* ---- 阀门状态：每组 {v,p}（1=开 0=关）→ 组态 filter/backwash/dump/off ---- */
  function valveArr(c) {
    if (!Array.isArray(c.valves) || c.valves.length !== c.n) {
      var arr = [];
      for (var i = 0; i < c.n; i++) arr.push({ v: (c.bw === i) ? 0 : 1, p: (c.bw === i) ? 1 : 0 });
      return arr;
    }
    return c.valves;
  }
  function gMode(st) {
    if (st.v && !st.p) return 'filter';
    if (!st.v && st.p) return 'backwash';
    if (st.v && st.p) return 'dump';
    return 'off';
  }
  function modes(c) { return valveArr(c).map(gMode); }
  /* 把 valves 组态镜像回旧字段 bw（唯一 backwash 组序号，无则 -1）——保持存档 / 对外 API 兼容 */
  function deriveBw() {
    var ms = modes(cfg); cfg.bw = -1;
    for (var i = 0; i < ms.length; i++) if (ms[i] === 'backwash') { cfg.bw = i; break; }
  }
  /* 可点击阀块：开=橙实心；关=白底斜杠；带悬停提示与点击标记 */
  function valveRect(x, y, w, h, open, tag, label) {
    var s = '<rect x="' + r2(x) + '" y="' + r2(y) + '" width="' + r2(w) + '" height="' + r2(h) +
      '" rx="2" class="fs-valve" data-fs-valve="' + tag + '" cursor="pointer" fill="' + (open ? C.valve : '#FFFFFF') +
      '" stroke="' + (open ? C.valveS : C.fitS) + '" stroke-width="1"><title>' + esc(label) +
      (open ? ' · 开（点击关闭）' : ' · 关（点击打开）') + '</title></rect>';
    if (!open) s += line(x + 1.2, y + h - 1.5, x + w - 1.2, y + 1.5, C.fitS, 1.3);
    return s;
  }
  /* 流动指示线：沿 (x1,y1)→(x2,y2) 方向持续移动的虚线（CSS 动画）；warn=亮红（直排/异常） */
  function flow(x1, y1, x2, y2, col, warn) {
    return '<line x1="' + r2(x1) + '" y1="' + r2(y1) + '" x2="' + r2(x2) + '" y2="' + r2(y2) +
      '" class="fs-flow" stroke="' + (warn ? '#E03131' : col) + '" stroke-width="2.2" stroke-linecap="round"/>';
  }
  /* ---- 出水总阀 V0（v12）：机组 ③ 出水总管下游端，非点击自动状态阀 ----
   * 任一组反冲 → 自动关闭（停水反冲式）：③ 内净水不外送，全部倒行用于反冲。
   * 直排不走 ③，与 V0 无联动。 */
  function v0Open(c) {
    var ms = modes(c);
    for (var i = 0; i < ms.length; i++) if (ms[i] === 'backwash') return false;
    return true;
  }
  function v0Valve(x, y, w, h, open) {
    var s = '<rect x="' + r2(x) + '" y="' + r2(y) + '" width="' + r2(w) + '" height="' + r2(h) +
      '" rx="2" class="fs-v0" data-fs-v0="' + (open ? 'open' : 'closed') + '" fill="' + (open ? C.valve : '#FFFFFF') +
      '" stroke="' + (open ? C.valveS : C.fitS) + '" stroke-width="1"><title>V0 出水总阀（③ 下游端）· ' +
      (open ? '开：正常过滤产水' : '关：反冲进行中，③ 内净水全部倒行用于反冲') + '</title></rect>';
    if (!open) s += line(x + 1.2, y + h - 1.5, x + w - 1.2, y + 1.5, C.fitS, 1.3);
    return s;
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
    '<linearGradient id="fsFitG" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#FFFFFF"/><stop offset="0.55" stop-color="#F1F1F6"/><stop offset="1" stop-color="#D8D8E2"/>' +
    '</linearGradient>' +
    '</defs>';

  /* ================= 派生几何 ================= */
  function der(c) {
    return {
      zBot: c.hm,                       // 单体底面
      zPort: c.hm + PORT_RISE,          // 支管/罐口/③ 同层 / 左右口中心
      zInTop: c.hm + PORT_RISE + IN_TOP_RISE, // ①上 进水总管（唯一进水）
      zTop: c.hm + c.h,                 // 罐顶
      zWs: Z_WASTE,                     // ② 排污总管
      yIn: c.delta,                     // ① 进水总管（后）
      yOut: -c.delta,                   // ③ 出水总管（前）
      yWs: c.delta,                     // ② 排污总管（与 ① 同一竖直平面，排污立管直落）
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
    var ymin = d.yOut - c.od / 2 - mg, ymax = d.yIn + c.od / 2 + mg;
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

    /* ② 排污总管（与 ① 同一竖直平面 → 俯视重合，红虚线垫底） */
    o += line(X(x0), Y(d.yIn), X(x1), Y(d.yIn), C.ws, Math.max(1.6, c.dnWs * sc * 0.5), '7 5');
    /* 每组排污立管：俯视与接驳支管投影重合（组心线上），不另画 */
    /* ③ 出水总管（前） */
    o += pipe(X(x0), Y(d.yOut), X(x1), Y(d.yOut), C.out, C.outL, c.dnOut, sc);
    /* ① 进水总管（后，唯一进水总管）——横向总管上不放活接图示（v18 用户定：快接只在支管上） */
    o += pipe(X(x0), Y(d.yIn), X(x1), Y(d.yIn), C.in, C.inL, c.dnIn, sc);

    var msT = modes(c);
    for (var j = 0; j < c.n; j++) {
      var gx = j * c.s, mT = msT[j], bw = (mT === 'backwash' || mT === 'dump');
      /* 接驳支管：汇流节点 → 罐后缘 平接（+zPort，与③同高，不装阀） */
      o += line(X(gx), Y(c.od / 2), X(gx), Y(d.yIn), C.inL, Math.max(2, c.dnBr * sc));
      /* 汇流节点（支管沿Y + ①上竖管沿Z 交汇；正下方接排污立管 P） */
      o += '<circle cx="' + r2(X(gx)) + '" cy="' + r2(Y(d.yIn)) + '" r="2.5" fill="' + C.in + '"/>';
      /* 前支管：罐前缘 → ③ */
      o += line(X(gx), Y(-c.od / 2), X(gx), Y(d.yOut), C.outL, Math.max(2, c.dnBr * sc));
      /* 罐（俯视为圆） */
      o += '<circle cx="' + r2(X(gx)) + '" cy="' + r2(Y(0)) + '" r="' + r2(c.od / 2 * sc) +
        '" fill="' + (bw ? C.wsF : C.tank) + '" stroke="' + (bw ? C.ws : C.tankS) + '" stroke-width="1.1"/>';
      o += '<circle cx="' + r2(X(gx)) + '" cy="' + r2(Y(0)) + '" r="' + r2(Math.max(3, (c.od / 2 - 45) * sc)) +
        '" fill="none" stroke="' + (bw ? C.wsL : C.ghost) + '" stroke-width="0.8" stroke-dasharray="3 3"/>';
      /* 阀位：进水阀 V + 排污阀 P 同在节点竖管上，俯视投影重合 → 画一块（先垫管件箍座，阀块坐于其上） */
      var rw = Math.max(3, c.dnIn * sc) * 1.3;
      o += '<rect x="' + r2(X(gx) - rw / 2) + '" y="' + r2(Y(d.yIn) - rw / 2) + '" width="' + r2(rw) + '" height="' + r2(rw) +
        '" rx="3" fill="' + C.fit + '" stroke="' + C.fitS + '" stroke-width="1"/>';
      o += fitShine(X(gx) - rw / 2 + 2.5, Y(d.yIn) - rw / 2 + 3, X(gx) + rw / 2 - 2.5, Y(d.yIn) - rw / 2 + 3);
      /* 管件表达：罐前/后口接头 + ③ 三通口箍（画在罐圆之后以露出） */
      var pbw = Math.max(2, c.dnBr * sc), pow = Math.max(3, c.dnOut * sc);
      o += fitRect(X(gx) - pbw * 0.65, Y(c.od / 2) - pbw * 0.65, pbw * 1.3, pbw * 1.3, 2);   /* 罐后口接头 */
      o += fitRect(X(gx) - pbw * 0.65, Y(-c.od / 2) - pbw * 0.65, pbw * 1.3, pbw * 1.3, 2);  /* 罐前口接头 */
      o += fitRect(X(gx) - pow * 0.65, Y(d.yOut) - pbw * 0.65, pow * 1.3, pbw * 1.3, 2);     /* ③ 三通口 */
      /* 支管快捷接头（v25 沟槽卡箍式）：前后两根支管 37.5% 处各一只——对卡两半壳+唇边+中缝+螺栓，
         拆开快接即可整体抽出罐体检修；37.5%（原 40%）+ 块高 14 是为避开 V 阀座上缘 189.8mm（块带 136.4~183.6mm，净空 6.2mm） */
      var qcW = Math.max(12, pbw + 14), qcH = 14;
      var yQb = Y(c.od / 2) + (Y(d.yIn) - Y(c.od / 2)) * 0.375;
      var yQf = Y(-c.od / 2) + (Y(d.yOut) - Y(-c.od / 2)) * 0.375;
      o += grooveCoupling(X(gx), yQb, qcH, qcW, 'v', 'br' + j, 'G' + (j + 1) + ' 后支管沟槽卡箍快接 · 对卡两半壳+螺栓紧固 · 拆开可整体抽出罐体检修');
      o += grooveCoupling(X(gx), yQf, qcH, qcW, 'v', 'bf' + j, 'G' + (j + 1) + ' 前支管沟槽卡箍快接 · 拆开可整体抽出罐体检修');
      if (j === 0) o += txt(X(gx) + qcW / 2 + 9, yQb + 3, '沟槽快接', 9, C.fitS, 'start');
      var vw = Math.max(7, VALVE_W * sc), vh = Math.max(6, VALVE_W * sc * 0.7);
      var modeTxt = { filter: '过滤', backwash: '反冲洗', dump: '直排短路', off: '隔离' }[mT];
      var vFill = (mT === 'filter') ? C.valve : (bw ? C.ws : '#FFFFFF');
      var vStrk = (mT === 'off') ? C.fitS : (bw ? C.ws : C.valveS);
      o += '<rect x="' + r2(X(gx) - vw / 2) + '" y="' + r2(Y(d.yIn) - vh / 2) + '" width="' + r2(vw) + '" height="' + r2(vh) +
        '" rx="2" class="fs-valve" data-fs-valve="' + j + ':cycle" cursor="pointer" fill="' + vFill + '" stroke="' + vStrk +
        '" stroke-width="1"><title>G' + (j + 1) + ' 阀组 · ' + modeTxt + '（点击切换：过滤→反冲→隔离→直排）</title></rect>';
      if (mT === 'off') o += line(X(gx) - vw / 2 + 1, Y(d.yIn) + vh / 2 - 1, X(gx) + vw / 2 - 1, Y(d.yIn) - vh / 2 + 1, C.fitS, 1.2);
      /* 俯视图：只给第 1 组引注阀位（其余组构造相同：G2=V2/P2、G3=V3/P3、G4=V4/P4）；锚在箍座左缘之外 */
      if (j === 0) {
        o += txt(X(gx) - rw / 2 - 4, Y(d.yIn) - 2, 'V1', 10, C.valveS, 'end');
        o += txt(X(gx) - rw / 2 - 4, Y(d.yIn) + 10, 'P1', 10, C.valveS, 'end');
      }
      o += txt(X(gx), Y(0) + 4, 'G' + (j + 1), 11, bw ? C.ws : C.txt3, 'middle', bw ? 700 : 400);
    }

    /* 水流方向层（动画虚线）：按各组阀态推导 ①③② 与每组支管有否流动及方向 */
    var hasV = false, hasF = false, hasW = false;
    msT.forEach(function (m) {
      if (m === 'filter') { hasV = true; hasF = true; }
      else if (m === 'backwash') { hasW = true; }
      else if (m === 'dump') { hasV = true; hasW = true; }
    });
    if (hasV) o += flow(X(x0), Y(d.yIn), X(x1), Y(d.yIn), C.in);
    var v0o = v0Open(c);
    if (hasF) o += flow(X(x0), Y(d.yOut), X(x1), Y(d.yOut), C.out);            /* ③ 管内通长流（V0 在管端外延伸段，不占管内） */
    if (hasF && v0o) o += '<line x1="' + r2(X(x1)) + '" y1="' + r2(Y(d.yOut)) + '" x2="' + r2(X(x1 + 80)) +
      '" y2="' + r2(Y(d.yOut)) + '" class="fs-flow" data-fs-ext="1" stroke="' + C.out +
      '" stroke-width="2.2" stroke-linecap="round"/>';                          /* V0 开：延伸段有水流出（data-fs-ext 供闸门断言） */
    if (hasW) o += flow(X(x1), Y(d.yIn) + 4, X(x0), Y(d.yIn) + 4, C.ws); /* ② 与 ① 同一竖直平面：+4px 错开、反向排出 */
    for (var j2 = 0; j2 < c.n; j2++) {
      var gx2 = j2 * c.s, m2t = msT[j2];
      if (m2t === 'filter') {
        o += flow(X(gx2), Y(d.yIn), X(gx2), Y(c.od / 2), C.in);          /* 节点 → 罐后口 */
        o += flow(X(gx2), Y(-c.od / 2), X(gx2), Y(d.yOut), C.out);       /* 罐前口 → ③ */
      } else if (m2t === 'backwash') {
        o += flow(X(gx2), Y(d.yOut), X(gx2), Y(-c.od / 2), C.out);       /* ③ → 罐前口（净水倒行入罐） */
        o += flow(X(gx2), Y(c.od / 2), X(gx2), Y(d.yIn), C.ws);          /* 罐后口 → 节点 → 排污 */
      }
    }

    /* 出水总阀 V0（v16：移到 ③ 管端**外侧**延伸短管上，不再与 G 末组三通口重叠）
     * 右端一律用世界坐标偏移（随缩放自适应，n=6 最紧时也不出界）；出水箭头指向外（v16 修正反向）。 */
    var vw0 = Math.max(7, VALVE_W * sc), vh0 = Math.max(6, VALVE_W * sc * 0.7);
    o += line(X(x1), Y(d.yOut), X(x1 + 80), Y(d.yOut), C.out, Math.max(3, c.dnOut * sc));
    o += v0Valve(X(x1 + 12), Y(d.yOut) - vh0 / 2, vw0, vh0, v0o);
    o += txt(X(x1 + 12) + vw0 / 2, Y(d.yOut) + vh0 / 2 + 11, 'V0', 10, C.valveS, 'middle');
    o += arrow(X(x1 + 150), Y(d.yOut), X(x1 + 182), Y(d.yOut), C.out, 1.6);   /* v24：再外移脱离图形群（n=6 时箭头头距 viewBox 右缘 ≥4px） */
    o += txt(X(x1 + 178), Y(d.yOut) - 12, '出水', 12, C.out, 'end');   /* end 锚压箭头上方：n=6 字形右缘 673 距右缘 680 净空 7px */

    /* 管端堵头（v17）：① 末端（末组之后死头）与 ③ 上游端（首组之前死头）为盲板端盖；
     * ① 左端=进水来向、③ 右端=V0 出水去向、② 左端=排污排向，均接走不设堵头 */
    o += endCapV(X(x1) + 1, Y(d.yIn), Math.max(3, c.dnIn * sc) + 5, C.in, 'topIn');
    o += endCapV(X(x0) - 1, Y(d.yOut), Math.max(3, c.dnOut * sc) + 5, C.out, 'topOut');

    /* 流向箭头（v22：整体移到管端外侧、与管道脱开——进水箭头指向管但不压管） */
    o += arrow(X(x0) - 42, Y(d.yIn), X(x0) - 16, Y(d.yIn), C.in, 1.6);
    o += txt(X(x0) - 29, Y(d.yIn) - 10, '进水', 12, C.in, 'middle');
    /* 「出水」箭头已在上方随 V0 画（指向外）；排污不另设右端引注：② 与 ① 俯视重合 */

    /* 尺寸与注记 */
    /* 罐径 OD 标注已按用户要求取消（v27）：「过滤器 OD200 这种文字不标注」——几何参数不再上图，S=400 保留 */
    o += dimH(X(0), X(c.s), Y(d.yIn) - Math.max(30, c.od * sc * 0.72), 'S=' + c.s);
    o += dimH(X(-c.od / 2), X((c.n - 1) * c.s + c.od / 2), Y(d.yOut) + 80,
      '总宽 W = ' + (c.n - 1) + 'S + OD = ' + d.W + ' mm');
    o += dimV(X(x0) - 64, Y(d.yIn), Y(d.yOut), '2Δ=' + (2 * c.delta));   /* v22：左移让位进水箭头 */
    o += txt(X(x0), Y(d.yOut) + 50, '② 排污总管（贴地 +' + mm(d.zWs) + ' · 与 ① 同一竖直平面，俯视虚线重合）· DN' + c.dnWs + ' · 各组排污立管接入', 11, C.ws, 'start');
    o += txt(X(x0), Y(d.yOut) + 32, '③ 出水总管（前 · +' + mm(d.zPort) + '）  ·  DN' + c.dnOut, 11, C.out, 'start');
    /* ① 标注（v21）：移到右端管上方避开左端 S/OD 尺寸文字；排污立管说明并入 ② 行 */
    o += txt(X(x1) - 4, Y(d.yIn) - 42, '① 进水总管（+' + mm(d.zInTop) + '）· DN' + c.dnIn, 11, C.in, 'end');
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
    /* ③ 出水总管 +0.720（接驳支管与罐口同高，位于罐后不另画通长线） */
    o += pipe(X(h0), Y(d.zPort), X(h1), Y(d.zPort), C.out, C.outL, c.dnOut, sc);
    /* ①上 进水总管（虚线，位于罐体之后）——横向总管上不放活接图示（v18） */
    o += line(X(h0), Y(d.zInTop), X(h1), Y(d.zInTop), C.in, Math.max(1.6, c.dnIn * sc * 0.5), '7 5');

    var msF = modes(c);
    for (var i = 0; i < c.n; i++) {
      var cx = i * c.s, mF = msF[i], bw = (mF === 'backwash' || mF === 'dump');
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
      /* 排污立管（汇流节点 +zPort → ②，位于罐体之后画虚线；反冲/直排组亮为实线）+ 排污阀 P */
      o += line(X(cx), Y(d.zPort), X(cx), Y(d.zWs), bw ? C.ws : C.wsL, Math.max(2.4, c.dnWs * sc * 0.75),
        bw ? null : '5 4');
      var vw = Math.max(8, VALVE_W * sc), vh = Math.max(7, VALVE_W * sc * 0.62);
      var vy = (d.zPort + d.zWs) / 2;
      o += valveRect(X(cx) - vw / 2, Y(vy) - vh / 2, vw, vh, (mF === 'backwash' || mF === 'dump'),
        i + ':p', 'P' + (i + 1) + ' 排污阀（节点下立管中段）');
      /* 组号 */
      o += txt(X(cx), Y(d.zTop) + 16, 'G' + (i + 1), 11, bw ? C.ws : C.txt3, 'middle', bw ? 700 : 400);
    }

    /* ①上 → 汇流节点 立管（虚线：位于罐体之后）+ 进水阀 V */
    for (var i = 0; i < c.n; i++) {
      var cxi = i * c.s, mF2 = msF[i];
      o += line(X(cxi), Y(d.zInTop), X(cxi), Y(d.zPort), C.in, 1.4, '5 4');
      o += '<circle cx="' + r2(X(cxi)) + '" cy="' + r2(Y(d.zPort)) + '" r="2.2" fill="' + C.in + '"/>';
      var vwF = Math.max(8, VALVE_W * sc), vhF = Math.max(6, VALVE_W * sc * 0.6);
      o += valveRect(X(cxi) - vwF / 2, Y((d.zPort + d.zInTop) / 2) - vhF / 2, vwF, vhF,
        (mF2 === 'filter' || mF2 === 'dump'), i + ':v', 'V' + (i + 1) + ' 进水阀（立管中段）');
      if (i === 0) {
        o += txt(X(cxi) - vwF / 2 - 4, Y((d.zPort + d.zInTop) / 2) + 4, 'V1', 10, C.valveS, 'end');
      }
    }

    /* 水流方向层（动画虚线）：立管（filter/dump 进水下行）、排污立管（backwash/dump 下行，直排亮红） */
    var hasVF = false, hasFF = false, hasWF = false;
    msF.forEach(function (m) {
      if (m === 'filter') { hasVF = true; hasFF = true; }
      else if (m === 'backwash') { hasWF = true; }
      else if (m === 'dump') { hasVF = true; hasWF = true; }
    });
    if (hasVF) o += flow(X(h0), Y(d.zInTop), X(h1), Y(d.zInTop), C.in);
    var v0oF = v0Open(c);
    if (hasFF) o += flow(X(h0), Y(d.zPort), v0oF ? X(h1) : X(h1) + 14, Y(d.zPort), C.out); /* V0 关：③ 流停在阀前 */
    /* 出水总阀 V0（v12：③ 右端外延短管上）：有组反冲时自动关闭（停水反冲） */
    var vw0F = Math.max(7, VALVE_W * sc), vh0F = Math.max(6, VALVE_W * sc * 0.62);
    var v0xF = X(h1) + 14;
    o += line(X(h1), Y(d.zPort), v0xF + vw0F, Y(d.zPort), C.outL, Math.max(2.4, c.dnOut * sc));
    o += v0Valve(v0xF, Y(d.zPort) - vh0F / 2, vw0F, vh0F, v0oF);
    o += txt(v0xF + vw0F / 2, Y(d.zPort) - vh0F / 2 - 4, 'V0', 10, C.valveS, 'middle');
    /* 管端堵头（v17）：① 末端与 ③ 上游端（与顶视/轴测同口径；① 前视为罐后虚线，堵头按虚线宽度收窄） */
    o += endCapV(X(h1) + 1, Y(d.zInTop), Math.max(3, c.dnIn * sc * 0.5) + 5, C.in, 'frontIn');
    o += endCapV(X(h0) - 1, Y(d.zPort), Math.max(3, c.dnOut * sc) + 5, C.out, 'frontOut');
    if (hasWF) o += flow(X(h1), Y(d.zWs), X(h0), Y(d.zWs), C.ws);
    for (var i2 = 0; i2 < c.n; i2++) {
      var cx2 = i2 * c.s, m2f = msF[i2];
      if (m2f === 'filter' || m2f === 'dump') o += flow(X(cx2), Y(d.zInTop), X(cx2), Y(d.zPort), C.in, m2f === 'dump');
      if (m2f === 'backwash' || m2f === 'dump') o += flow(X(cx2), Y(d.zPort), X(cx2), Y(d.zWs), C.ws, m2f === 'dump');
    }

    /* 尺寸与标高 */
    o += dimH(X(0), X(c.s), Y(d.zTop) - 34, 'S=' + c.s);
    o += dimV(X(hmax) - 34, Y(0), Y(d.zTop), 'H总=' + (c.hm + c.h));
    o += elevMark(X(hmin) + 74, Y(d.zTop), '+' + mm(d.zTop));
    o += elevMark(X(hmin) + 74, Y(d.zInTop), '+' + mm(d.zInTop));
    o += elevMark(X(hmin) + 74, Y(d.zPort), '+' + mm(d.zPort));
    o += elevMark(X(hmin) + 74, Y(d.zBot), '+' + mm(d.zBot));
    o += elevMark(X(hmin) + 74, Y(d.zWs), '+' + mm(d.zWs));
    o += elevMark(X(hmin) + 74, Y(0), '±0.000');
    /* 注释（v21）：移到地面线下方作脚注，不再横穿四只罐体 */
    o += txt(X(hmin) + 60, Y(d.zWs) + 28, '支管/罐口与 ③ 同层 +' + mm(d.zPort) + '（平接）；①上 +' + mm(d.zInTop) + ' 供应，节点下排污立管（P 常闭）落 ②', 11, C.txt2, 'start');
    o += txt(VW - 14, 18, '前视 · 从前往后看（①路与排污立管均在罐后，虚线）', 11, C.txt3, 'end');
    return o;
  }

  /* ================= 侧视图（左视图：左=后 / 右=前） ================= */
  function renderSide(c) {
    var d = der(c), mg = Math.max(300, c.od * 1.4);
    var hmin = d.yOut - mg, hmax = d.yIn + mg;
    var M = mapElev(hmin, hmax, -120, d.zTop + 220, 16, true);
    var X = M.X, Y = M.Y, sc = M.sc;
    var m0 = modes(c)[0], bw = (m0 === 'backwash' || m0 === 'dump');
    var o = DEFS;
    var cxc = X(0);

    o += line(X(hmin), Y(0), X(hmax), Y(0), C.dim, 1.2);
    /* 三根总管断面圆（唯一能同时看清前后错位与标高链的视图） */
    o += '<circle cx="' + r2(X(d.yIn)) + '" cy="' + r2(Y(d.zWs)) + '" r="' + r2(Math.max(4, c.dnWs / 2 * sc)) +
      '" fill="' + C.wsF + '" stroke="' + C.ws + '" stroke-width="1.4"/>';
    o += '<circle cx="' + r2(X(d.yOut)) + '" cy="' + r2(Y(d.zPort)) + '" r="' + r2(Math.max(4, c.dnOut / 2 * sc)) +
      '" fill="' + C.outF + '" stroke="' + C.out + '" stroke-width="1.4"/>';
    o += '<circle cx="' + r2(X(d.yIn)) + '" cy="' + r2(Y(d.zInTop)) + '" r="' + r2(Math.max(4, c.dnIn / 2 * sc)) +
      '" fill="' + C.inF + '" stroke="' + C.in + '" stroke-width="1.4"/>';
    /* ① 断面（v18：翻边外圈已取消——横向总管上不放活接图示） */
    /* ①上 → 汇流节点 立管（进水阀 V1 装立管中段） */
    o += line(X(d.yIn), Y(d.zInTop), X(d.yIn), Y(d.zPort), C.inL, Math.max(2.4, c.dnBr * sc));
    o += '<circle cx="' + r2(X(d.yIn)) + '" cy="' + r2(Y(d.zPort)) + '" r="2.4" fill="' + C.in + '"/>';
    var vwS = Math.max(8, VALVE_W * sc), vhS = Math.max(8, VALVE_W * sc * 0.8);
    o += valveRect(X(d.yIn) - vwS / 2, Y((d.zPort + d.zInTop) / 2) - vhS / 2, vwS, vhS,
      (m0 === 'filter' || m0 === 'dump'), '0:v', 'V1 进水阀（立管中段）');
    o += txt(X(d.yIn) + vwS / 2 + 4, Y((d.zPort + d.zInTop) / 2) + 3, 'V1', 10, C.valveS, 'start');

    /* 排污立管：汇流节点正下方 → 直落 ②（排污阀 P1 装立管中段，默认常闭） */
    o += line(X(d.yIn), Y(d.zPort), X(d.yIn), Y(d.zWs), bw ? C.ws : C.wsL, Math.max(2.4, c.dnWs * sc * 0.75));
    var vy = (d.zPort + d.zWs) / 2;
    var vw = Math.max(8, VALVE_W * sc), vh = Math.max(7, VALVE_W * sc * 0.62);
    var pOpen = (m0 === 'backwash' || m0 === 'dump');
    o += valveRect(X(d.yIn) - vw / 2, Y(vy) - vh / 2, vw, vh, pOpen, '0:p', 'P1 排污阀（节点下立管中段）');
    o += txt(X(d.yIn) + vw / 2 + 6, Y(vy) + 4, pOpen ? 'P1 开' : 'P1 常闭', 10, C.valveS, 'start');

    /* 前口 → ③ 支管（v20：流向小箭头上浮 9px 让位给快接方块；流向另由流动虚线动画表达） */
    o += line(X(-c.od / 2), Y(d.zPort), X(d.yOut), Y(d.zPort), C.outL, Math.max(2.4, c.dnBr * sc));
    var midFs = (X(-c.od / 2) + X(d.yOut)) / 2;
    o += arrow(midFs - 8, Y(d.zPort) - 9, midFs + 8, Y(d.zPort) - 9, C.out, 1.2);
    /* 后口 → 节点 接驳支管（+zPort，与③同高，不装阀） */
    o += line(X(c.od / 2), Y(d.zPort), X(d.yIn), Y(d.zPort), C.inL, Math.max(2.4, c.dnBr * sc));
    /* 出水总阀 V0（v12：③ 断面下游侧外延短管上）：有组反冲时自动关闭（停水反冲） */
    var v0oS = v0Open(c);
    var secOutS = Math.max(4, c.dnOut / 2 * sc);
    var vw0S = Math.max(8, VALVE_W * sc), vh0S = Math.max(8, VALVE_W * sc * 0.8);
    var v0xS = X(d.yOut) + secOutS + 10;
    o += line(X(d.yOut) + secOutS, Y(d.zPort), v0xS + vw0S, Y(d.zPort), C.outL, Math.max(2.4, c.dnOut * sc * 0.6));
    o += v0Valve(v0xS, Y(d.zPort) - vh0S / 2, vw0S, vh0S, v0oS);
    o += txt(v0xS + vw0S / 2, Y(d.zPort) + vh0S / 2 + 12, v0oS ? 'V0' : 'V0（反冲关）', 10, C.valveS, 'middle');

    /* 罐体（矩形 = 圆柱正投影） */
    o += '<rect x="' + r2(X(c.od / 2)) + '" y="' + r2(Y(d.zTop)) + '" width="' + r2(c.od * sc) +
      '" height="' + r2(c.h * sc) + '" fill="' + (bw ? C.wsF : C.tank) +
      '" stroke="' + (bw ? C.ws : C.tankS) + '" stroke-width="1.1"/>';
    o += line(X(c.od / 2), Y(d.zBot + 46), X(-c.od / 2), Y(d.zBot + 46), C.ghost, 1);

    /* 管件表达：汇流节点三通（圆角 T + 三端法兰）+ 罐口承口套环 + 三处总管接口套环 */
    var nbw = Math.max(2.4, c.dnBr * sc);            /* 支管/立管带宽 */
    var nx = X(d.yIn), ny = Y(d.zPort);
    var tw = nbw * 1.5, ex = nbw * 0.8, AL = nbw * 0.8, rT = Math.min(4, nbw * 0.24);   /* v20：臂长 1.05→0.8，给后支管快接腾位 */
    o += '<path d="' + roundedTee(nx, ny, tw, ex, ex, AL, nbw * 1.5, rT) +
      '" fill="' + C.fit + '" stroke="' + C.fitS + '" stroke-width="1.4" stroke-linejoin="round"/>';
    o += fitFlange(nx - tw / 2 - 1.8, ny - ex, nx + tw / 2 + 1.8, ny - ex);   /* 上端法兰（①侧） */
    o += fitFlange(nx - tw / 2 - 1.8, ny + ex, nx + tw / 2 + 1.8, ny + ex);   /* 下端法兰（②侧） */
    o += fitFlange(nx + AL, ny - nbw * 0.75 - 1.8, nx + AL, ny + nbw * 0.75 + 1.8); /* 支管端法兰 */
    o += fitShine(nx - tw / 2 + tw * 0.26, ny - ex + 3, nx - tw / 2 + tw * 0.26, ny + ex - 3);
    var cw = nbw * 0.5, ch = nbw * 1.5;               /* 承口套环：厚 cw × 宽 ch（v20：0.62→0.5，给快接腾位） */
    o += fitCollar(X(c.od / 2), Y(d.zPort), cw, ch);              /* 罐后口套环 */
    o += fitCollar(X(-c.od / 2), Y(d.zPort), cw, ch);             /* 罐前口套环（③ 侧） */
    /* 管端接总管的三处连接件 */
    var secIn = Math.max(4, c.dnIn / 2 * sc), secOut = Math.max(4, c.dnOut / 2 * sc), secWs = Math.max(4, c.dnWs / 2 * sc);
    o += fitCollar(X(d.yIn), Y(d.zInTop) + secIn + nbw * 0.28, cw, ch);   /* 立管顶 ↔ ① 断面 */
    o += fitCollar(X(d.yOut) - secOut + nbw * 0.1, Y(d.zPort), cw, ch);   /* 前支管端 ↔ ③ 断面 */
    o += fitCollar(X(d.yIn), Y(d.zWs) - secWs - nbw * 0.28, cw, ch);      /* 排污立管底 ↔ ② 断面 */
    /* 支管快接（v25 沟槽卡箍式）：前后支管中段各一只——壳+唇边+中缝（侧视紧凑不画螺栓），与顶视同口径 */
    var qcSw = Math.max(8, nbw * 0.45), qcSh = Math.max(10, nbw * 1.3);
    var xQbS = ((nx + AL) + X(c.od / 2)) / 2;                       /* 三通臂法兰 ↔ 罐后口套环 之间 */
    o += grooveCoupling(xQbS, Y(d.zPort), qcSw, qcSh, 'h', 'sideBr', 'G1 后支管沟槽卡箍快接 · 对卡两半壳+螺栓紧固 · 拆开可整体抽出罐体检修');
    var xQfS = (X(-c.od / 2) + (X(d.yOut) - secOut + nbw * 0.1)) / 2; /* 罐前口套环 ↔ ③ 端套环 之间 */
    o += grooveCoupling(xQfS, Y(d.zPort), qcSw, qcSh, 'h', 'sideBf', 'G1 前支管沟槽卡箍快接 · 拆开可整体抽出罐体检修');

    /* 水流方向层（动画虚线，以第 1 组阀态为准；直排亮红） */
    if (m0 === 'filter' || m0 === 'dump') o += flow(X(d.yIn), Y(d.zInTop), X(d.yIn), Y(d.zPort), C.in, m0 === 'dump');
    if (m0 === 'backwash' || m0 === 'dump') o += flow(X(d.yIn), Y(d.zPort), X(d.yIn), Y(d.zWs), C.ws, m0 === 'dump');
    if (m0 === 'filter') {
      o += flow(X(d.yIn), Y(d.zPort), X(c.od / 2), Y(d.zPort), C.in);      /* 节点 → 罐后口 */
      o += flow(X(-c.od / 2), Y(d.zPort), X(d.yOut), Y(d.zPort), C.out);   /* 罐前口 → ③ */
    } else if (m0 === 'backwash') {
      o += flow(X(d.yOut), Y(d.zPort), X(-c.od / 2), Y(d.zPort), C.out);   /* ③ → 罐前口（净水倒行入罐） */
      o += flow(X(c.od / 2), Y(d.zPort), X(d.yIn), Y(d.zPort), C.ws);      /* 罐后口 → 节点 → 排污 */
    }

    /* 罐顶排气口 ⑥（侧视/左视为竖管，标出标高链顶端） */
    o += line(cxc, Y(d.zTop), cxc, Y(d.zTop + 70), C.tankS, 2.4);
    o += txt(cxc + 6, Y(d.zTop + 70) + 4, '⑥ 排气', 10, C.txt3, 'start');

    o += elevMark(X(hmax) - 92, Y(d.zTop), '+' + mm(d.zTop));
    o += elevMark(X(hmax) - 92, Y(d.zInTop), '+' + mm(d.zInTop));
    o += elevMark(X(hmax) - 92, Y(d.zPort), '+' + mm(d.zPort));
    o += elevMark(X(hmax) - 92, Y(d.zBot), '+' + mm(d.zBot));
    o += elevMark(X(hmax) - 92, Y(d.zWs), '+' + mm(d.zWs));
    o += elevMark(X(hmax) - 92, Y(0), '±0.000');
    o += txt(X(d.yIn) + 10, Y(d.zInTop) - 20, '①上 进水 +' + mm(d.zInTop), 11, C.in, 'start');
    o += txt(X(d.yIn) - 16, Y(d.zPort) + 12, '汇流节点 +' + mm(d.zPort) + '（支管与③同高）', 11, C.in, 'end');   /* v21：改节点左下，右伸会压罐体 */
    o += txt(X(d.yOut) - 10, Y(d.zPort) + 20, '③ 出水 +' + mm(d.zPort), 11, C.out, 'end');
    o += txt(X(d.yIn) + 16, Y(d.zWs) + 4, '② 排污 +' + mm(d.zWs), 11, C.ws, 'start');
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
      [x0, d.yIn, d.zTop], [x1, d.yIn, d.zTop], [x0, d.yOut, 0], [x1, d.yOut, 0],
      [x0, d.yIn, d.zTop + 90], [x1, 0, 0], [x0, d.yIn, d.zInTop]
    ];
    var umin = 1e9, umax = -1e9, vmin = 1e9, vmax = -1e9;
    probe.forEach(function (p) {
      var uu = u(p[0], p[1]), vv = v(p[0], p[1], p[2]);
      umin = Math.min(umin, uu); umax = Math.max(umax, uu);
      vmin = Math.min(vmin, vv); vmax = Math.max(vmax, vv);
    });
    var pad = 18, padTop = 34;   // padTop: 顶部说明文字区让位（v21 图形整体下移）
    var sc = Math.min((VW - 2 * pad) / (umax - umin), (VH - padTop - pad) / (vmax - vmin));
    var ox = pad - umin * sc + (VW - 2 * pad - (umax - umin) * sc) / 2;
    var oy = padTop - vmin * sc + ((VH - padTop - pad) - (vmax - vmin) * sc) / 2;
    var X = function (x, y) { return ox + u(x, y) * sc; };
    var Y = function (x, y, z) { return oy + v(x, y, z) * sc; };
    var rx = 1.2247 * sc, ry = 0.7071 * sc;                 // 单位半径的水平圆投影

    var o = DEFS;
    var p1TagX = 0, p1TagY = 0;   /* G1「P1 常闭」引注坐标（③ rail 之后补画，避免被管带盖住） */
    /* ② 排污总管（最前 → 最后画）；先画 ① 与罐体，再 ③，最后 ② */
    /* ①上 进水总管（唯一进水总管，罐后高位） */
    o += pipe(X(x0, d.yIn), Y(x0, d.yIn, d.zInTop), X(x1, d.yIn), Y(x1, d.yIn, d.zInTop), C.in, C.inL, c.dnIn, sc);
    /* ② 排污总管（贴地，与 ① 同一竖直平面 → 先画，中段被罐体遮住） */
    o += pipe(X(x0, d.yIn), Y(x0, d.yIn, d.zWs), X(x1, d.yIn), Y(x1, d.yIn, d.zWs), C.ws, C.wsL, c.dnWs, sc);

    var msA = modes(c);
    for (var i = 0; i < c.n; i++) {
      var cx = i * c.s, mA = msA[i], bw = (mA === 'backwash' || mA === 'dump');
      var R = c.od / 2;
      /* 排污立管：汇流节点正下方 → 直落 ② */
      o += line(X(cx, d.yIn), Y(cx, d.yIn, d.zPort), X(cx, d.yIn), Y(cx, d.yIn, d.zWs),
        bw ? C.ws : C.wsL, Math.max(2, c.dnWs * sc * 0.7));
      /* 接驳支管（+zPort 平接罐后口，与③同高，不装阀）+ 前支管 */
      o += line(X(cx, R), Y(cx, R, d.zPort), X(cx, d.yIn), Y(cx, d.yIn, d.zPort), C.inL, Math.max(2, c.dnBr * sc));
      /* ①上 → 汇流节点 立管（进水阀 V 装立管中段） */
      o += line(X(cx, d.yIn), Y(cx, d.yIn, d.zInTop), X(cx, d.yIn), Y(cx, d.yIn, d.zPort), C.inL, Math.max(2, c.dnBr * sc));
      /* 汇流节点三通管件（等轴测菱形箍块，盖住三管交叉） */
      var aw = Math.max(4, c.dnBr * sc * 0.8);
      var apx = X(cx, d.yIn), apy = Y(cx, d.yIn, d.zPort);
      o += '<path d="M' + r2(apx) + ' ' + r2(apy - aw) + ' L' + r2(apx + aw * 1.15) + ' ' + r2(apy) +
        ' L' + r2(apx) + ' ' + r2(apy + aw) + ' L' + r2(apx - aw * 1.15) + ' ' + r2(apy) + ' Z" fill="' + C.fit +
        '" stroke="' + C.fitS + '" stroke-width="1" stroke-linejoin="round"/>';
      o += '<circle cx="' + r2(apx) + '" cy="' + r2(apy) + '" r="1.8" fill="' + C.fitS + '"/>';
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
      /* 管件表达：罐后口卡箍（支管与罐体连接处，画在罐体之上以露出） */
      var hw = Math.max(3.5, c.dnBr * sc * 0.55);
      var hpx = X(cx, R), hpy = Y(cx, R, d.zPort);
      o += '<path d="M' + r2(hpx) + ' ' + r2(hpy - hw) + ' L' + r2(hpx + hw * 1.15) + ' ' + r2(hpy) +
        ' L' + r2(hpx) + ' ' + r2(hpy + hw) + ' L' + r2(hpx - hw * 1.15) + ' ' + r2(hpy) + ' Z" fill="' + C.fit +
        '" stroke="' + C.fitS + '" stroke-width="1" stroke-linejoin="round"/>';
      /* 排气阀 ⑥ */
      o += line(X(cx, 0), Y(cx, 0, d.zTop), X(cx, 0), Y(cx, 0, d.zTop + 70), C.tankS, 2.4);
      /* 进水阀 V（立管中段）+ 排污阀 P（节点下排污立管中段，默认常闭）——均可点击 */
      var vwA = Math.max(7, VALVE_W * sc), vhA = Math.max(7, VALVE_W * sc * 0.8);
      var m1 = u(cx, d.yIn), m1v = v(cx, d.yIn, (d.zPort + d.zInTop) / 2);
      o += valveRect(ox + m1 * sc - vwA / 2, oy + m1v * sc - vhA / 2, vwA, vhA,
        (mA === 'filter' || mA === 'dump'), i + ':v', 'V' + (i + 1) + ' 进水阀（立管中段）');
      var m2 = u(cx, d.yIn), m2v = v(cx, d.yIn, (d.zPort + d.zWs) / 2);
      o += valveRect(ox + m2 * sc - vwA / 2, oy + m2v * sc - vhA / 2, vwA, vhA,
        (mA === 'backwash' || mA === 'dump'), i + ':p', 'P' + (i + 1) + ' 排污阀（节点下立管中段）');
      /* 水流方向层（动画虚线；直排亮红） */
      if (mA === 'filter' || mA === 'dump') o += flow(X(cx, d.yIn), Y(cx, d.yIn, d.zInTop), X(cx, d.yIn), Y(cx, d.yIn, d.zPort), C.in, mA === 'dump');
      if (mA === 'backwash' || mA === 'dump') o += flow(X(cx, d.yIn), Y(cx, d.yIn, d.zPort), X(cx, d.yIn), Y(cx, d.yIn, d.zWs), C.ws, mA === 'dump');
      if (mA === 'filter') {
        o += flow(X(cx, d.yIn), Y(cx, d.yIn, d.zPort), X(cx, R), Y(cx, R, d.zPort), C.in);            /* 节点 → 罐后口 */
        o += flow(X(cx, -R), Y(cx, -R, d.zPort), X(cx, d.yOut), Y(cx, d.yOut, d.zPort), C.out);       /* 罐前口 → ③ */
      } else if (mA === 'backwash') {
        o += flow(X(cx, d.yOut), Y(cx, d.yOut, d.zPort), X(cx, -R), Y(cx, -R, d.zPort), C.out);       /* ③ → 罐前口（倒行） */
        o += flow(X(cx, R), Y(cx, R, d.zPort), X(cx, d.yIn), Y(cx, d.yIn, d.zPort), C.ws);            /* 罐后口 → 节点 → 排污 */
      }
      o += txt(X(cx, 0), Y(cx, 0, d.zTop + 70) - 8, 'G' + (i + 1), 10, bw ? C.ws : C.txt3, 'middle', bw ? 700 : 400);
      /* 轴测图：只给第 1 组引注阀位与排气口（其余组构造相同：G2=V2/P2、G3=V3/P3、G4=V4/P4） */
      if (i === 0) {
        o += txt(ox + m1 * sc + vwA / 2 + 4, oy + m1v * sc + 3, 'V1', 9, C.valveS, 'start');
        p1TagX = ox + m2 * sc + vwA / 2 + 4; p1TagY = oy + m2v * sc + 3;
        o += txt(X(cx, 0) + 7, Y(cx, 0, d.zTop + 70) - 8, '⑥', 9, C.txt3, 'start');
      }
    }

    o += pipe(X(x0, d.yOut), Y(x0, d.yOut, d.zPort), X(x1, d.yOut), Y(x1, d.yOut, d.zPort), C.out, C.outL, c.dnOut, sc);
    /* 出水总阀 V0（v12：③ 末端管内）：有组反冲时自动关闭（停水反冲） */
    var vw0A = Math.max(7, VALVE_W * sc), vh0A = Math.max(7, VALVE_W * sc * 0.8);
    var v0u = ox + u(x1 - 40, d.yOut) * sc, v0v = oy + v(x1 - 40, d.yOut, d.zPort) * sc;
    o += v0Valve(v0u - vw0A / 2, v0v - vh0A / 2, vw0A, vh0A, v0Open(c));
    o += txt(p1TagX, p1TagY, 'P1 常闭', 9, C.valveS, 'start');   /* 后画于阀块右侧罐身留白处：不与罐描边线交叠 */
    /* 管端堵头（v17）：① 末端（右端死头）与 ③ 上游端（左端死头）——等轴测斜向短板，垂直于管轴；
     * ① 左端=进水来向、③ 右端=V0 出水去向、② 左端=排污排向，均接走不设堵头 */
    var axDx = 0.866, axDy = 0.5;   /* +x 世界方向在轴测屏幕上的单位方向（0.866, 0.5） */
    o += axoCap(X(x1, d.yIn) + axDx * 1.2, Y(x1, d.yIn, d.zInTop) + axDy * 1.2, axDx, axDy,
      Math.max(3, c.dnIn * sc) + 5, C.in, 'axoIn');
    o += axoCap(X(x0, d.yOut) - axDx * 1.2, Y(x0, d.yOut, d.zPort) - axDy * 1.2, axDx, axDy,
      Math.max(3, c.dnOut * sc) + 5, C.out, 'axoOut');

    o += txt(X(x0, d.yIn) - 6, Y(x0, d.yIn, d.zInTop), '① 进水总管（+' + mm(d.zInTop) + '）· DN' + c.dnIn, 11, C.in, 'end');
    o += txt(X(x1, d.yOut) + 6, Y(x1, d.yOut, d.zPort) + 12, '③ 出水总管', 11, C.out, 'start');
    o += txt(X(x1, d.yIn) + 6, Y(x1, d.yIn, d.zWs) - 6, '② 排污总管（贴地·与①同平面）', 11, C.ws, 'start');
    o += txt(14, 18, '轴测 · 进水阀 V（立管）+ 排污阀 P（节点下·常闭·直落 ②）· G1=V1/P1…G4=V4/P4 · 支管平接罐后口（与③同高）', 11, C.txt3, 'start');
    return o;
  }

  /* ================= 选型计算 ================= */
  function calc(c) {
    var d = der(c);
    var ms = modes(c);
    var nBW = 0, nF = 0, nDump = 0, nOff = 0;
    ms.forEach(function (m) {
      if (m === 'backwash') nBW++; else if (m === 'filter') nF++; else if (m === 'dump') nDump++; else nOff++;
    });
    var bwOn = nBW > 0 ? 1 : 0;
    var act = nF;
    var qg = act > 0 ? c.q / act : 0;
    var vBr = flowV(qg, c.dnBr);
    var vIn = flowV(c.q, c.dnIn);
    var vInEach = flowV(c.q, c.dnIn); // 单路进水：总管按全 Q 校核
    var qbw = nBW > 0 ? (c.q / Math.max(1, act)) * 2.5 : 0;  // 反冲强度 = 单组过流量 × 2.5（多组反冲累加）
    var dNeed = dnFor(qbw, 2.0);
    var need = c.od + c.clear;
    var okS = c.s >= need;
    return {
      d: d, ms: ms, act: act, bwOn: bwOn, nBW: nBW, nDump: nDump, nOff: nOff,
      qg: qg, vBr: vBr, vIn: vIn, vInEach: vInEach, qbw: qbw,
      dNeed: dNeed, need: need, okS: okS, W: d.W, zTop: d.zTop, loss: c.loss
    };
  }
  function vJud(v) { return (v < 0.8 || v > 2.2) ? 'bad' : ((v < 1.0 || v > 2.0) ? 'warn' : 'ok'); }
  function vTxt(v) { return v < 1.0 ? '偏低' : (v > 2.0 ? '偏高' : '合理'); }

  function calcRows(c) {
    var k = calc(c), d = k.d;
    var dnRec = Math.ceil(k.dNeed / 5) * 5;
    var note = [];
    if (k.nBW > 0) note.push(k.nBW + ' 组反冲中');
    if (k.nDump > 0) note.push(k.nDump + ' 组直排');
    if (k.nOff > 0) note.push(k.nOff + ' 组隔离');
    var rows = [
      { id: 'act', label: '过流组数', val: k.act + ' / ' + c.n + (note.length ? '（' + note.join(' · ') + '）' : '（全部过滤）'), cls: '' },
      { id: 'qg', label: '单组过流量 q', val: f(k.qg, 1) + ' m³/h', cls: '' },
      { id: 'vbr', label: '支管流速 v（DN' + c.dnBr + '）', val: f(k.vBr, 2) + ' m/s · ' + vTxt(k.vBr), cls: vJud(k.vBr) },
      { id: 'vin', label: '进水总管流速 v（DN' + c.dnIn + '，全Q）', val: f(k.vInEach, 2) + ' m/s · ' + vTxt(k.vInEach), cls: vJud(k.vInEach) },
      { id: 'qbw', label: '反冲洗流量（2.5q × 反冲组数）', val: k.nBW > 0 ? f(k.qbw, 1) + ' m³/h' : '—（无反冲组）', cls: '' },
      { id: 'dnws', label: '排污管建议', val: '≥ DN' + dnRec + '（v ≤ 2.0 m/s）' + (c.dnWs >= k.dNeed ? ' ✓' : ' ✗'),
        cls: c.dnWs >= k.dNeed ? 'ok' : 'bad' },
      { id: 'gap', label: '间距校验 S ≥ OD＋检修', val: c.s + ' ≥ ' + k.need + ' mm' + (k.okS ? ' ✓' : ' ✗'),
        cls: k.okS ? 'ok' : 'bad' },
      { id: 'width', label: '机组总宽 W', val: k.W + ' mm', cls: '' },
      { id: 'ztop', label: '罐顶标高', val: '+' + mm(k.zTop), cls: '' },
      /* 标高链自下而上：② 排污总管（贴地）→ 罐底 → ①③ 总管（左右口同高）→ 罐顶排气口 ⑥ */
      { id: 'zchain', label: '标高链 ②/罐底/③支管罐口/罐顶⑥/①上',
        val: '+' + mm(d.zWs) + ' / +' + mm(d.zBot) + ' / +' + mm(d.zPort) + ' / +' + mm(d.zTop) + ' / +' + mm(d.zInTop), cls: '' },
      { id: 'loss', label: '过滤与阀门损失（本页设定）', val: f(c.loss, 1) + ' m', cls: '' },
      { id: 'lossref', label: '过滤损失参考区间', val: '清洁 2~3 m · 需反冲洗 5~7 m（行业经验，待校正）', cls: '' }
    ];
    if (k.nDump > 0) rows.push({ id: 'dumpwarn', label: '⚠ 直排短路警告', val: '有组 V 与 P 同开：进水不经过滤直接排入 ②，请关闭该组 P', cls: 'bad' });
    if (k.nBW > 0 && k.act === 0) rows.push({ id: 'noflow', label: '⚠ 无净水来源', val: '没有组在过滤，③ 内无净水，反冲洗实际无水流', cls: 'bad' });
    if (k.nOff > 0 && k.nDump === 0 && k.nBW === 0) rows.push({ id: 'offnote', label: '隔离组', val: k.nOff + ' 组 V/P 均关（未参与过滤）', cls: 'warn' });
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
    /* 顶部回执条已取消（v19）：提示性文字改写到页面底部状态栏 #ryStHint（见 planNote） */
    h += '<div class="fs-wrap-body" style="display:flex;flex:1 1 auto;min-height:0">';
    /* ---- 左栏 ---- */
    h += '<aside class="fs-side">';
    /* ---- 操作按钮组（v13：从顶部条移到左栏顶部）---- */
    h += '<div class="fs-group fs-actions">' +
      '<button type="button" class="fs-bar-btn" data-fs-act="syncFlow" title="从当前设计方案读联合流量作为本页设计流量 Q">⟵ 取当前方案流量</button>' +
      '<button type="button" class="fs-bar-btn solid" data-fs-act="writeLoss" title="把本页过滤损失写入三级/二级计算的「过滤与阀门损失」">写入过滤损失 →</button>' +
      '<button type="button" class="fs-bar-btn" data-fs-act="reset">恢复默认参数</button>' +
      '</div>';
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
      '<div class="fs-note">清洁状态约 2~3 m，压差报警前约 5~7 m。<b>点上方「写入过滤损失」</b>即可把该值送进三级 / 二级计算的扬程算式。</div>' +
      '</div>';
    h += '<div class="fs-group"><div class="fs-gh">阀门操作模拟<em>点图上阀块或下方胶囊</em></div>' +
      '<div class="fs-chips" id="fsChips"></div>' +
      '<div class="fs-valves" id="fsValves"></div>' +
      '<div class="fs-note"><b>V0 出水总阀</b>（③ 下游端）：正常开启产水；<b>任一组反冲时自动关闭</b>——③ 内净水不外送，全部倒行用于反冲（停水反冲式）。<br>' +
      '<b>过滤</b>：V 开 P 关 → ① → 罐滤芯 → ③（正常产水）。<br>' +
      '<b>反冲</b>：V 关 P 开 → 其余组净水在 ③ 倒行 → 前口入罐反冲 → 后口出 → 节点 → ② 排走。<br>' +
      '<b>直排</b>：V、P 同开 → 进水未经过滤直落 ②（红色警示，实际运行禁止）。<br>' +
      '<b>隔离</b>：V、P 均关 → 该组退出运行（检修 / 备用）。动画虚线 = 水流方向。</div>' +
      '</div>';
    h += '</aside>';
    /* ---- 左栏宽度拖拽条（v12）---- */
    h += '<div class="fs-resizer" id="fsResizer" title="左右拖动调节左栏宽度（280~560）"></div>';
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
      '<span><i class="fs-lg-square" style="background:' + C.valve + ';border:1px solid ' + C.valveS + '"></i>阀开（V 进水 · P 排污，图上可点击）</span>' +
      '<span><i class="fs-lg-square" style="background:#fff;border:1px solid ' + C.fitS + '"></i>阀关</span>' +
      '<span><i class="fs-lg fs-lg-dash"></i>水流方向（动画虚线）</span>' +
      '<span><i class="fs-lg-square" style="background:' + C.wsF + ';border:1px solid ' + C.ws + '"></i>反冲 / 直排中的组</span>' +
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
    renderValves();
  }
  function renderChips() {
    var box = rootEl.querySelector('#fsChips');
    if (!box) return;
    var ms = modes(cfg);
    var map = { filter: '过滤', backwash: '反冲', dump: '直排', off: '隔离' };
    var h = '';
    for (var i = 0; i < cfg.n; i++) {
      var on = (ms[i] !== 'filter');
      h += '<button type="button" class="fs-chip' + (on ? ' on' : '') + '" data-fs-bw="' + i + '">' +
        'G' + (i + 1) + ' ' + map[ms[i]] + '</button>';
    }
    h += '<button type="button" class="fs-chip" data-fs-bw="-1">全部恢复过滤</button>';
    box.innerHTML = h;
  }
  /* 面板阀门一览：每组一枚胶囊（V/P 开关态 + 组态名），点击与图上阀块同为 cycle 切换 */
  function renderValves() {
    var box = rootEl && rootEl.querySelector('#fsValves');
    if (!box) return;
    var arr = valveArr(cfg), ms = modes(cfg);
    var map = { filter: '过滤', backwash: '反冲洗', dump: '直排短路', off: '隔离' };
    var h = '';
    /* V0 出水总阀（v12）：非点击自动联动——有组反冲时自动关闭（停水反冲） */
    var v0o = v0Open(cfg);
    h += '<span class="fs-vchip" data-v0="' + (v0o ? 'open' : 'closed') + '"' +
      ' title="V0 出水总阀（机组 ③ 下游端，自动联动不可点击）：任一组反冲时自动关闭——③ 内净水全部倒行用于反冲（停水反冲式）">' +
      '<b>V0 总阀</b><em>' + (v0o ? '开 · 产水' : '关 · 反冲中') + '</em></span>';
    for (var i = 0; i < cfg.n; i++) {
      h += '<span class="fs-vchip" data-mode="' + ms[i] + '" data-fs-valve="' + i + ':cycle"' +
        ' title="G' + (i + 1) + ' 阀组（点击切换：过滤→反冲→隔离→直排）">' +
        '<b>V' + (i + 1) + (arr[i].v ? '开' : '关') + '</b><b>P' + (i + 1) + (arr[i].p ? '开' : '关') + '</b>' +
        '<em>' + map[ms[i]] + '</em></span>';
    }
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
    if (k === 'n') {
      if (cfg.bw >= cfg.n) cfg.bw = -1;
      if (Array.isArray(cfg.valves) && cfg.valves.length !== cfg.n) cfg.valves = null; /* 交给 valveArr 重新派生 */
    }
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
      /* 图上阀块 / 面板胶囊：v/p 翻转 或 cycle（过滤→反冲→隔离→直排→过滤） */
      var vl = t.closest('[data-fs-valve]');
      if (vl) {
        var tag = (vl.getAttribute('data-fs-valve') || '').split(':');
        var gi = Number(tag[0]), kind = tag[1];
        if (gi >= 0 && gi < cfg.n && (kind === 'v' || kind === 'p' || kind === 'cycle')) {
          var arr = valveArr(cfg).map(function (s) { return { v: s.v ? 1 : 0, p: s.p ? 1 : 0 }; });
          if (kind === 'v') arr[gi].v = arr[gi].v ? 0 : 1;
          else if (kind === 'p') arr[gi].p = arr[gi].p ? 0 : 1;
          else {
            var nxt = { filter: 'backwash', backwash: 'off', off: 'dump', dump: 'filter' }[gMode(arr[gi])];
            arr[gi] = (nxt === 'filter') ? { v: 1, p: 0 } : (nxt === 'backwash') ? { v: 0, p: 1 } :
              (nxt === 'off') ? { v: 0, p: 0 } : { v: 1, p: 1 };
          }
          cfg.valves = arr;
          deriveBw();
          saveCfg(); render();
        }
        return;
      }
      var bw = t.closest('[data-fs-bw]');
      if (bw) {
        var i = Number(bw.getAttribute('data-fs-bw'));
        var arr2 = valveArr(cfg).map(function (s) { return { v: s.v ? 1 : 0, p: s.p ? 1 : 0 }; });
        var ms2 = arr2.map(gMode);
        /* 已是唯一反冲组再点一次 = 恢复全过滤（toggle 兼容旧习惯） */
        var onlyThis = (i >= 0) && ms2[i] === 'backwash' &&
          ms2.every(function (m, q) { return q === i || m === 'filter'; });
        for (var q2 = 0; q2 < cfg.n; q2++) arr2[q2] = (!onlyThis && q2 === i) ? { v: 0, p: 1 } : { v: 1, p: 0 };
        cfg.valves = arr2;
        deriveBw();
        saveCfg(); render();
        return;
      }
      var act = t.closest('[data-fs-act]');
      if (act) doAct(act.getAttribute('data-fs-act'), act);
    });
    initResizer();
  }
  /* ---- 左栏宽度拖拽（v12）：CSS 变量 --fs-side-w（280~560px）；
   * 「没拖过就不写任何变量」——默认视觉逐像素不变，拖过一次才写 localStorage 存档 ---- */
  function initResizer() {
    var rz = rootEl.querySelector('#fsResizer');
    var side = rootEl.querySelector('.fs-side');
    if (!rz || !side || rz.__fsRz) return;
    rz.__fsRz = 1;
    try {
      var saved = Number(window.localStorage.getItem('fs_side_w')) || 0;
      if (saved >= 280 && saved <= 560) rootEl.style.setProperty('--fs-side-w', saved + 'px');
    } catch (e) { }
    var sx = 0, sw = 0, dragging = false;
    rz.addEventListener('pointerdown', function (e) {
      dragging = true; sx = e.clientX;
      sw = side.getBoundingClientRect().width;
      rz.classList.add('on');
      try { rz.setPointerCapture(e.pointerId); } catch (err) { }
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });
    rz.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var w = Math.max(280, Math.min(560, Math.round(sw + e.clientX - sx)));
      rootEl.style.setProperty('--fs-side-w', w + 'px');
    });
    var endDrag = function () {
      if (!dragging) return;
      dragging = false;
      rz.classList.remove('on');
      document.body.style.userSelect = '';
      try { window.localStorage.setItem('fs_side_w', String(Math.round(side.getBoundingClientRect().width))); } catch (e) { }
    };
    rz.addEventListener('pointerup', endDrag);
    rz.addEventListener('pointercancel', endDrag);
  }

  /* ---- 与灌溉设计工具融合：读流量 / 写损失 ---- */
  /* 提示文字（v19）：顶部回执条已取消——操作回执改写到页面底部状态栏 #ryStHint，
   * 显示 4 秒后自动还原为分区默认提示（默认文案由宿主 ryStatusUpdate 维护，此处只暂存还原）。 */
  function planNote(msg, ok) {
    var hint = document.getElementById('ryStHint');
    if (!hint) return;
    if (!planNote._def) planNote._def = hint.textContent;   /* 首次记下分区默认提示，用于还原 */
    if (planNote._t) { clearTimeout(planNote._t); planNote._t = null; }
    if (!msg) { hint.textContent = planNote._def; return; }
    hint.textContent = msg;
    planNote._t = setTimeout(function () {
      hint.textContent = planNote._def;
      planNote._t = null;
    }, 4000);
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
      if (Array.isArray(o.valves) && o.valves.length === r.n &&
        o.valves.every(function (s) { return s && typeof s.v === 'number' && typeof s.p === 'number'; })) {
        r.valves = o.valves;
      }
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
      if (o && Array.isArray(o.valves)) r.valves = o.valves; /* 长度与 n 不符时由 valveArr 兜底派生 */
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
