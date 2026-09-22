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
 *   ★ v92（2026-09-20 用户批注「左栏『排污支管长』只能驱动方式二、不能驱动方式一」）：
 *     方式一那根「节点 → ② 直落」的排污立管长度从此由左栏参数决定（② 标高不再恒 +0.060）；
 *     自动默认值仍取 660 = 节点(+0.720) − 贴地 ②(+0.060)，故默认图形与 v91 逐像素一致。
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
  /* v80：反冲洗管道「接法」模式。'a' = 方式一（现状）；'b' = 方式二。
     两种接法的参数项与默认值完全相同，差异只在排污管 ② 与给水管 ① 的安装 / 接入方式，
     因此 **cfg 仍共用同一份**（本 key 不变），只让右侧四视图 + 选型计算按接法分流渲染。 */
  var MODE_KEY = 'runye_filter_system_mode_v1';

  var DN_LIST = [32, 40, 50, 63, 75, 90, 110, 125, 140, 160, 180, 200, 225, 250, 280, 315];

  /* ---- 实物口径常量（来自用户实物照校正，不随界面参数变化） ---- */
  var PORT_RISE = 120;   // 单体左右口中心离单体底面（mm）
  var Z_WASTE = 60;      // ② 排污总管管中标高**默认值**（贴地，mm）★ v92：方式一改由「排污支管长」参数决定，本常量即其自动默认值来源
  var VALVE_W = 90;      // 阀体示意尺寸（mm）
  var IN_TOP_RISE = 800; // ①上 进水总管比罐口抬高（mm，2026-09-18 定稿 800 → ①上 +1.520、进水阀（立管中段）+1.120）
  /* ★ v85：该抬高值改为**可调参数** cfg.inRise（左栏「机组参数」多一行「① 立管高度」数字框），
     本常量只作默认值来源（默认仍 800 ⇒ 默认视觉与 v84 逐像素一致）。
     四张视图共用 der().zInTop，所以改一个数、四图同时动；前/侧视的 zmax 已按 zInTop 兜底，无需另改。 */

  var DEFAULTS = {
    n: 4, od: 200, h: 600, hm: 600, s: 360, delta: 600, clear: 150,   /* v38：默认值改按用户指定组（H600/S360/Δ600） */
    dnIn: 110, dnOut: 110, dnWs: 110, dnBr: 90,
    q: 60, loss: 5, bw: -1,
    /* ★ v82（方式二）／★ v86 改名／★ v92 起**两种接法都驱动**：排污支管长（mm）。
       wRunAuto=true 时按**当前接法**自动跟随（见 wRunAutoVal）——因为它量的是两根不同的管：
         · 方式二 = 罐底标高 − 排污总管标高 = 原立管段长（默认 540mm ≈ 0.54m，v82 原定义）；
         · 方式一 = 汇流节点(+罐口 120) − 贴地 ② 总管 = 节点下竖直排污立管的长度（默认 660mm）。
       两条自动值都等于「该接法下图上那根排污管本来就有多长」⇒ 默认图与参数框都自洽。
       用户一旦手改 wRun 就转成定值（两种接法共用同一个数），「恢复默认参数」复位回自动跟随。 */
    wRun: 540, wRunAuto: true,
    /* ★ v85：① 立管高度（① 进水总管相对罐口的抬高，mm）。默认 = 原常量 IN_TOP_RISE 800。
       四视图的 ① 总管标高与进水立管长度全部由它决定（der().zInTop）。 */
    inRise: IN_TOP_RISE,
    /* ★ v102（2026-09-22 用户定稿）：①③ 总管自由端加长 mainExt（mm）——
       ① 进水端向左加长、③ 出水端向右加长；③ 左端与 ② 排污总管原位不动。
       四视图同步生效（侧视为断面圆，几何上不体现）；0 = 不加长（回到 v101 视觉）。 */
    mainExt: 200
  };

  var RANGES = [
    { k: 'n', label: '过滤组数 N', min: 2, max: 6, step: 1, unit: '组' },
    { k: 'od', label: '单体外径 OD', min: 150, max: 400, step: 10, unit: 'mm' },
    { k: 'h', label: '单体总高 H', min: 500, max: 1200, step: 10, unit: 'mm' },
    { k: 'hm', label: '罐底架装 h', min: 200, max: 1500, step: 50, unit: 'mm' },
    { k: 's', label: '组间距 S', min: 250, max: 900, step: 10, unit: 'mm' },
    { k: 'delta', label: '前后偏距 Δ', min: 150, max: 800, step: 10, unit: 'mm' },
    { k: 'clear', label: '检修空间', min: 50, max: 400, step: 10, unit: 'mm' },
    /* ★ v85：① 立管高度（① 进水总管抬高）——图上几条竖向进水立管的高度，四视图同步生效。
       上下限按「① 总管仍明显高于罐顶」取：200 时略低于罐顶（可见 ① 沉到罐体一侧），1600 时很高。 */
    { k: 'inRise', label: '① 立管高度', min: 200, max: 1600, step: 50, unit: 'mm' },
    /* ★ v102：总管加长——① 进水端 / ③ 出水端各加长的长度（③ 左端、② 不动） */
    { k: 'mainExt', label: '总管加长', min: 0, max: 1000, step: 50, unit: 'mm' },
    { k: 'q', label: '设计流量 Q', min: 5, max: 400, step: 5, unit: 'm³/h' },
    /* v82：方式二专用；★ v92（用户批注「只能驱动方式二，不能驱动方式一」）：两种接法都驱动 ——
       方式一驱动「节点 → 贴地 ②」的竖直排污立管长，方式二驱动「朝后水平支管」长。自动跟随见 DEFAULTS 注释。 */
    /* ★ v86（2026-09-20 用户截图批注）：参数名「排污管朝后伸出」→「排污支管长」——
       它量的是**每根排污支管**朝后水平段的长度，旧名说的是"管"、新名说的是"支管"。 */
    { k: 'wRun', label: '排污支管长', min: 50, max: 2500, step: 10, unit: 'mm' }
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
    bw: '#7048E8', bwL: '#B3A3F2', bwF: '#EFEBFC',   /* v35：反冲/直排组状态高亮（亮紫，醒目且不与①蓝/③青/②红/阀橙撞色） */
    tank: '#F1EFE8', tankS: '#5F5E5A',
    valve: '#FAEEDA', valveS: '#BA7517',
    fit: 'url(#fsFitG)', fitS: '#6E6E80',   /* 管件：白→灰渐变本体 + 深灰描边 */
    dim: '#98A2B3', txt: '#243c35', txt2: '#4a6259', txt3: '#7b9188', ghost: '#D9DCE3',
    gN: '#E8590C'   /* ★ v99：压力表指针（橙红，与阀橙同族但不撞） */
  };

  var rootEl = null;
  var cfg = null;

  /* ---- 接法模式：'a' 方式一 / 'b' 方式二（随页面记忆） ---- */
  var mode = 'a';
  function loadMode() {
    try {
      var m = window.localStorage.getItem(MODE_KEY);
      return (m === 'b') ? 'b' : 'a';
    } catch (e) { return 'a'; }
  }
  function saveMode() {
    try { window.localStorage.setItem(MODE_KEY, mode); } catch (e) { }
  }
  function switchBtnText() {
    /* 按钮上写的是「切过去的目标」，不是当前处在哪种方式 */
    return (mode === 'b') ? '← 切换接法：方式一' : '切换接法：方式二 →';
  }
  function syncModeBtn() {
    var b = rootEl ? rootEl.querySelector('[data-fs-act="switchMode"]') : null;
    if (b) b.textContent = switchBtnText();
    /* v82：图例里「反冲/直排」的去向随接法变（方式二没有贴地 ② 总管） */
    var lg = rootEl ? rootEl.querySelector('#fsFlowLegend') : null;
    if (lg) lg.innerHTML = flowLegend();
  }
  /* 阀门模拟图例中随方式变化的两行（v82 从静态 HTML 里抽出来，切换方式时由 syncModeBtn 刷新） */
  function flowLegend() {
    if (mode === 'b') {
      return '<b>反冲</b>：V 关 P 开 → 其余组净水在 ③ 倒行 → 前口入罐反冲 → 后口出 → 节点 → 支管朝后 → 汇入 ② 排污主管排走。<br>' +
        '<b>直排</b>：V、P 同开 → 进水未经过滤直落 ② 排污主管（红色警示，实际运行禁止）。<br>';
    }
    return '<b>反冲</b>：V 关 P 开 → 其余组净水在 ③ 倒行 → 前口入罐反冲 → 后口出 → 节点 → ② 排走。<br>' +
      '<b>直排</b>：V、P 同开 → 进水未经过滤直落 ②（红色警示，实际运行禁止）。<br>';
  }

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

  /* cls（第 8 参，可选）：给 <text> 挂 class。v85 起轴测图用它区分「管件引注码」与「长引注」——
     放大后只缩小长引注，「管件引注码」(G#/V#/P#/⑥) 保持原尺寸。其余视图不传，渲染逐字节不变。 */
  function txt(x, y, t, size, st, anchor, weight, cls) {
    return '<text x="' + r2(x) + '" y="' + r2(y) + '" font-size="' + size + '" fill="' + st + '"' +
      (anchor ? ' text-anchor="' + anchor + '"' : '') +
      (weight ? ' font-weight="' + weight + '"' : '') +
      (cls ? ' class="' + cls + '"' : '') + '>' + esc(t) + '</text>';
  }
  function line(x1, y1, x2, y2, st, w, dash) {
    return '<line x1="' + r2(x1) + '" y1="' + r2(y1) + '" x2="' + r2(x2) + '" y2="' + r2(y2) +
      '" stroke="' + st + '" stroke-width="' + r2(w) + '"' +
      (dash ? ' stroke-dasharray="' + dash + '"' : '') + '/>';
  }
  function pipe(x1, y1, x2, y2, col, light, wmm, sc, dash) {
    var w = Math.max(3, wmm * sc);
    /* v30：亮线占比 0.55→0.775——两侧深色轮廓边减半（如顶视 DN110 管带 35.6px 的轮廓边 8→4px），管带总宽与管径语义不变；pipe 仅用于 ①②③ 总管 */
    return line(x1, y1, x2, y2, col, w, dash) + line(x1, y1, x2, y2, light, Math.max(1, w * 0.775), dash);
  }
  /* ★ v84：给 pipe() 产出的**第一根** <line> 挂闸门标记 —— pipe 本身没有 tag 参数，而
     「② 排污主管」必须能被 e2e/主闸门计数。只替换首个 '<line '，不影响第二根亮色内芯。 */
  function pipeTag(s, tag) { return s.replace('<line ', '<line data-fs-out="' + tag + '" '); }
  function arrow(x1, y1, x2, y2, st, w) {
    return '<line x1="' + r2(x1) + '" y1="' + r2(y1) + '" x2="' + r2(x2) + '" y2="' + r2(y2) +
      '" stroke="' + st + '" stroke-width="' + r2(w || 1.4) + '" marker-end="url(#fsAr)"/>';
  }

  /* ★ v99 压力表（2026-09-21 用户批注「进水管跟出水管都安装上压力表，改下」）
     ──────────────────────────────────────────────────────────────────────
     为什么要装：叠片过滤器是在线运行的，堵塞程度只能靠**进出口压差**读出来
     （ΔP = 过滤损失，正是本页写回二/三级扬程计算的那一项）。纸上没有两只压力表，
     这个损失就只是算出来的数，运行人员没法现场核对。
     装哪里：PG1 挂 ① 进水总管**上游端**（水来的那一头）；PG2 挂 ③ 出水总管**下游侧**。
             ★ 标号用 PG1/PG2，**不**用 P1/P2 —— 图上 P1~P4 已经是「排污阀」的编号
             （见本文件头「阀编号：V1~V4 = 进水阀，P1~P4 = 排污阀」），同名会让读图/施工搞混。
     怎么画：引出短管（自管带外缘起）+ 表盘（白底深灰圈）+ 指针（橙红）+ 轴心，
             图上只写 PG1/PG2 标号，含义进右下角图例 —— 四视图/两接法完全同一套画法。
     挂点口径：一律让到**管带外缘**（bandHalf），短管不压管子本体。
     尺寸口径：表盘半径/短管长取**固定像素**（与 dimH 端线 3px、标注字号同口径）——
             视图随参数缩放时表盘不再跟着缩小，缩到面板宽度后仍看得清。
     ★ 位置口径（v99 的关键）：**没有**任何一组静态坐标能同时满足「6 组参数 × 2 接法」
       —— 空档随 n/S/Δ/OD/DN 漂移（俯视最明显：左端那座 V1 阀座、右端「① 进水总管」文字、
       粗管时的排污阀块会轮番压上来）。所以每个视图给**一串候选**（按观感优先级排），
       渲染进 DOM 后由 pickGauges() 量**真实 bbox** 取第一个「不压东西 + 不出视口」的，
       其余整组删掉 —— DOM 里恒只剩 2 只表（data-fs-gauge），闸门按视图计数不受影响。 */
  var G_R = 10, G_STEM = 8, G_OFF = G_R + G_STEM;   /* 表心相对挂点的屏幕距离（含短管，px） */
  /* 单只表的**候选**：<g data-fs-gcand="视图:in|out" data-i="序号">（择优后转 data-fs-gauge）。
     ax/ay = 挂点（管带外缘）；dx/dy = 挂点 → 表心 的屏幕偏移；lab 图上标号；
     col 标号颜色（随所挂总管）；labPos 标号落位 'r'/'l'/'u'/'d'。 */
  function gaugeAt(tag, i, ax, ay, dx, dy, lab, col, labPos) {
    var L = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / L, uy = dy / L;
    var cx = ax + dx, cy = ay + dy;
    var s = '<g data-fs-gcand="' + tag + '" data-i="' + i + '">';
    s += '<title>' + (lab === 'PG1'
      ? 'PG1 ① 进水压力表（读进水压力；与 PG2 之差 = 过滤损失 ΔP）'
      : 'PG2 ③ 出水压力表（读出水压力；与 PG1 之差 = 过滤损失 ΔP）') + '</title>';
    s += line(ax, ay, cx - ux * G_R, cy - uy * G_R, C.fitS, 1.6);          /* 引出短管 */
    s += '<circle cx="' + r2(cx) + '" cy="' + r2(cy) + '" r="' + G_R +
      '" fill="#FFFFFF" stroke="' + C.fitS + '" stroke-width="1.5"/>';      /* 表盘 */
    var na = -Math.PI * 0.32;                                              /* 指针：指向右上 ~ -58° */
    s += line(cx, cy, cx + Math.cos(na) * G_R * 0.62, cy + Math.sin(na) * G_R * 0.62, C.gN, 1.6);
    s += '<circle cx="' + r2(cx) + '" cy="' + r2(cy) + '" r="1.5" fill="' + C.fitS + '"/>';
    if (lab) {
      var lx = cx, ly = cy + 3.5, an = 'middle';
      if (labPos === 'r') { lx = cx + G_R + 3; an = 'start'; }
      else if (labPos === 'l') { lx = cx - G_R - 3; an = 'end'; }
      else if (labPos === 'u') { lx = cx; ly = cy - G_R - 4; }
      else if (labPos === 'd') { lx = cx; ly = cy + G_R + 11; }
      s += txt(lx, ly, lab, 9, col, an, 700);
    }
    s += '</g>';
    return s;
  }
  /* 候选集 = 挂点序列 × 方向序列 × 标号落位序列。三层都按观感优先级排 —— 序号 0 = 首选，
     pickGauges 同分取序号小者，所以"择优"永远先落在最好看的位置上。 */
  function gaugeCands(pts, dirs, labs) {
    var out = [];
    pts.forEach(function (p) {
      dirs.forEach(function (dv) {
        labs.forEach(function (lp) { out.push([p[0], p[1], dv[0], dv[1], lp]); });
      });
    });
    return out;
  }
  /* 水平管视图（俯视/前视）用：**臂 × 屏幕步距铺点**。
     arm = [挂点相对轴线的 y 偏移, 短管 dx, 短管 dy, 标号落位]；yAxis = 轴线屏幕 y。
     ★ 为什么臂要那么多：方式二俯视里 ① 的**整条后方**压着一排"排污阀方块"（DN315 时每块 57.6px
       见方、块间只剩 5px），"挂在后缘、表朝后"这条路整条管长都走不通 —— 必须留"挂前缘、表朝前"
       和"从管带里往外伸"这两种退路。哪种退路能用，随 n/S/Δ/OD/DN 变，故一律做成候选交给 pickGauges。
     ★ 为什么按屏幕步距而不是世界定比：投影缩放 sc 随参数变化很厉害（方式二俯视实测只有方式一的
       一半上下），世界定比会把整串候选挤进十几像素、一起落进同一个阀块的投影里（实测 5 个定比
       候选无一可用）；屏幕步距则永远把候选铺满整条管长。
     候选总数软上限 90/臂数 个点，臂 6~8 ⇒ 每标号 ≤ 96 个候选（自己给自己设的口径）。 */
  function segCands(sxa, sxb, step, yAxis, arms) {
    var maxPts = Math.max(2, Math.floor(90 / Math.max(1, arms.length)));
    var n = Math.max(2, Math.min(maxPts, Math.round(Math.abs(sxb - sxa) / step)));
    var out = [];
    for (var a = 0; a < arms.length; a++) {
      var arm = arms[a];
      for (var i = 0; i <= n; i++) {
        out.push([sxa + (sxb - sxa) * i / n, yAxis + arm[0], arm[1], arm[2], arm[3]]);
      }
    }
    return out;
  }
  /* 侧视专用：挂点被断面圆钉死（只能挂圆的正上 / 正下一点 —— 那一点才是"表接在管子哪一点"），
     唯一自由度是**短管朝哪伸 + 标号落哪边**。故把「外半圈 5 个方向 × 4 个标号落位」全铺出来。 */
  var G_S2 = Math.SQRT1_2;
  var SIDE_DIRS_IN = [[0, -G_OFF], [-G_OFF * G_S2, -G_OFF * G_S2], [G_OFF * G_S2, -G_OFF * G_S2],
    [-G_OFF, 0], [G_OFF, 0]];
  /* ★ v103（2026-09-22 用户批注）：方向与 PG1 一致 —— PG2 也挂断面圆**正上**（退路：斜上/左右） */
  var SIDE_DIRS_OUT = [[0, -G_OFF], [-G_OFF * G_S2, -G_OFF * G_S2], [G_OFF * G_S2, -G_OFF * G_S2],
    [-G_OFF, 0], [G_OFF, 0]];
  var SIDE_LABS = ['l', 'r', 'u', 'd'];
  /* ★ 候选**不写进视图字符串**：gaugeP 只把候选收进 G_PEND，由 stageGauges 分批注入 DOM。
     为什么（实测）：getBBox 本身极便宜（干净 SVG 上 0.001ms/次，34 个元素 0.1ms）；
     真正的开销是**写入之后再量触发的全文档重排** —— 每多一个候选分组约 +0.047ms，
     752 个候选 ≈ +34ms（实测一次 render 里那"唯一一次 39ms"就是它）。
     而"往单个视图追加 6 个候选再重排"只要 0.46ms ⇒ 把候选从 ~750 降到 ~64（每标号只注入到
     命中为止，通常第 1 批就命中）就能把这次重排从 39ms 压到 ~3ms。 */
  var G_PEND = [];   /* 本次 render 收集到的候选：[{ tag, lab, col, items: [候选 SVG 串…] }]，按调用顺序 */
  var G_CHUNK = 8;   /* 每个标号每批注入的候选个数（实测 8 个 ≈ 0.5ms 一次重排） */
  function gaugeP(tag, cands, lab, col) {
    var items = [];
    for (var i = 0; i < cands.length; i++) {
      var k = cands[i];
      items.push(gaugeAt(tag, i, k[0], k[1], k[2], k[3], lab, col, k[4]));
    }
    G_PEND.push({ tag: tag, lab: lab, col: col, items: items });
    return '';   /* 候选不进视图字符串 —— 交给 stageGauges 分批注入（见上） */
  }
  /* ★ 候选择优 = 「分批注入 → 量 → 命中即停」。分三个小函数：
     gaugeObstacles(svgEl) —— 收集并量出本视图的**障碍**（文字/管件）bbox。每视图只量一次。
     gaugeScore(g, ob)     —— 单个候选打分 = 出视口(+1000) + 与障碍交叠数
                              （两方向都 ≥1px 才算交叠，与主闸门同一口径）。
     gaugePickTag(...)     —— 按序号分批把候选注入 DOM，逐批打分，命中（0 分）即停。
     打分口径与旧实现逐字相同：有 0 分候选 ⇒ 取**序号最小**者（旧实现遇到第一个 0 分就 break，
     等价）；全无 0 分 ⇒ 取分最低者（同分取序号小者）。故结果与原实现严格等价。
     退化保护：所在分区 display:none 时 getBBox 全 0 ⇒ 全为 0 分 ⇒ 自动落到序号 0 的首选候选，
     行为确定（不会因为面板不可见而挑到一个随机位置）。 */
  var G_VBW = 680, G_VBH = 420;   /* = VW / VH，择优时判「出视口」用 */
  function gaugeObstacles(svgEl) {
    var inCand = function (e) {
      for (var n = e; n && n.getAttribute; n = n.parentNode) {
        if (n.getAttribute('data-fs-gcand')) return true;
      }
      return false;
    };
    var obs = Array.prototype.slice.call(svgEl.querySelectorAll(
      'text,[data-fs-valve],[data-fs-v0],[data-fs-cap],[data-fs-coup],[data-fs-out]'))
      .filter(function (e) { return !inCand(e); });
    var ob = [];
    obs.forEach(function (e) {
      var b; try { b = e.getBBox(); } catch (err) { return; }
      ob.push({ x: b.x, y: b.y, w: b.width, h: b.height });
    });
    return ob;
  }
  function gaugeScore(g, ob) {
    var score = 0, b;
    try { b = g.getBBox(); } catch (err) { b = { x: 0, y: 0, width: 0, height: 0 }; }
    if (!(b.x >= 0 && b.y >= 0 && b.x + b.width <= G_VBW && b.y + b.height <= G_VBH)) score += 1000;
    for (var j = 0; j < ob.length; j++) {
      var o = ob[j];
      if (Math.min(b.x + b.width, o.x + o.w) - Math.max(b.x, o.x) >= 1 &&
        Math.min(b.y + b.height, o.y + o.h) - Math.max(b.y, o.y) >= 1) score += 1;
    }
    return score;
  }
  function gaugePickTag(svgEl, ent, ob) {
    var n = ent.items.length, best = null, bestScore = 1e9;
    for (var from = 0; from < n; from += G_CHUNK) {
      var to = Math.min(n, from + G_CHUNK);
      svgEl.insertAdjacentHTML('beforeend', ent.items.slice(from, to).join(''));
      var found = svgEl.querySelectorAll('[data-fs-gcand="' + ent.tag + '"]'), fresh = [];
      for (var q = 0; q < found.length; q++) {          /* 只认这一批刚注入的 */
        var ii = +found[q].getAttribute('data-i');
        if (ii >= from && ii < to) fresh.push(found[q]);
      }
      fresh.sort(function (a, b) {
        return (+a.getAttribute('data-i')) - (+b.getAttribute('data-i'));
      });
      for (var i = 0; i < fresh.length; i++) {
        var sc = gaugeScore(fresh[i], ob);
        if (sc < bestScore) { bestScore = sc; best = fresh[i]; }
        if (bestScore === 0) break;
      }
      if (bestScore === 0) break;   /* 命中：序号最小且不压东西 ⇒ 立刻收工，不再注入后续批次 */
    }
    return best;
  }
  /* 落定：中选者转 data-fs-gauge，本视图其余候选整组删除 —— DOM 里只留中选那一只。 */
  function gaugeFinish(svgEl, winners) {
    var all = Array.prototype.slice.call(svgEl.querySelectorAll('[data-fs-gcand]'));
    all.forEach(function (g) {
      if (winners.indexOf(g) >= 0) {
        var tag = g.getAttribute('data-fs-gcand');
        g.removeAttribute('data-fs-gcand');
        g.removeAttribute('data-i');
        g.setAttribute('data-fs-gauge', tag);
      } else { g.parentNode.removeChild(g); }
    });
  }
  /* ★ 舞台总控：按 G_PEND 顺序（俯视 in→out、前视 in→out、侧视、轴测）逐标号择优。
     障碍"每视图只量一次"；已定下来的那只表**按顺序**并入该视图的障碍（in 先于 out）——
     与旧实现完全一致（旧实现也是 in 处理完把中选 bbox push 进 ob，再处理 out）。 */
  function stageGauges(gEls, entries) {
    var byId = {}, obById = {}, winById = {};
    gEls.forEach(function (el) { byId[el.id] = el; });
    entries.forEach(function (ent) {
      var id = SVG_IDS[ent.tag.split(':')[0]], el = byId[id];
      if (!el) return;
      if (!obById[id]) obById[id] = gaugeObstacles(el);   /* 本视图首次用到 ⇒ 量障碍（只一次） */
      var ob = obById[id];
      var best = gaugePickTag(el, ent, ob);
      (winById[id] = winById[id] || []).push(best);
      if (best) {                                          /* 中选者并入障碍，供本视图后一个标号避让 */
        try {
          var b = best.getBBox();
          ob.push({ x: b.x, y: b.y, w: b.width, h: b.height });
        } catch (e) {}
      }
    });
    Object.keys(winById).forEach(function (id) {
      gaugeFinish(byId[id], winById[id].filter(Boolean));
    });
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
  /* ★ v83 方式二专用：三臂节点轮廓（上臂 + 右臂·接驳支管 + 左臂·朝后排污），**无下臂**。
     为什么另写一个：v83 把排污管抬到支管同层后，原 roundedTee（上+下+右）会在节点下方留一截
     死头短管，与「一条水平直通线」的新接法不符；而方式一那根立管确实需要下臂，不能改它。 */
  function roundedTee3(nx, ny, w, hUp, armL, armR, armH, r) {
    var xL = nx - w / 2, xR = nx + w / 2, xAL = nx - armL, xAR = nx + armR;
    var yT = ny - armH / 2 - hUp, yAT = ny - armH / 2, yAB = ny + armH / 2;
    function p(x, y) { return r2(x) + ' ' + r2(y); }
    return 'M' + p(xL + r, yT) + ' L' + p(xR - r, yT) + ' Q' + p(xR, yT) + ' ' + p(xR, yT + r) +
      ' L' + p(xR, yAT - r) + ' Q' + p(xR, yAT) + ' ' + p(xR + r, yAT) +
      ' L' + p(xAR - r, yAT) + ' Q' + p(xAR, yAT) + ' ' + p(xAR, yAT + r) +
      ' L' + p(xAR, yAB - r) + ' Q' + p(xAR, yAB) + ' ' + p(xAR - r, yAB) +
      ' L' + p(xAL + r, yAB) + ' Q' + p(xAL, yAB) + ' ' + p(xAL, yAB - r) +
      ' L' + p(xAL, yAT + r) + ' Q' + p(xAL, yAT) + ' ' + p(xAL + r, yAT) +
      ' L' + p(xL - r, yAT) + ' Q' + p(xL, yAT) + ' ' + p(xL, yAT - r) +
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
  /* v57：尺寸「端线」（尺寸界线）朝图形一侧适当延长——更美观且指向被测对象。
     DIM_EXT：朝图形侧多出的长度；背图形侧仍为 3（既有观感不变）。
     dir >0：图形在正方向侧（dimH 下 / dimV 右）；dir <0：负方向侧（上 / 左）；0 或缺省：对称 ±3。 */
  var DIM_EXT = 8;
  function dimH(x1, x2, y, label, dir) {
    var up = 3, dn = 3;                        /* 尺寸线上半长 / 下半长（屏幕 y 向下为正） */
    if (dir > 0) dn += DIM_EXT;                /* 图形在下方 → 端线向下（朝图形）延长 */
    else if (dir < 0) up += DIM_EXT;           /* 图形在上方 → 端线向上（朝图形）延长 */
    return line(x1, y - up, x1, y + dn, C.dim, 0.7) + line(x2, y - up, x2, y + dn, C.dim, 0.7) +
      '<line x1="' + r2(x1) + '" y1="' + r2(y) + '" x2="' + r2(x2) + '" y2="' + r2(y) +
      '" stroke="' + C.dim + '" stroke-width="0.9" marker-start="url(#fsAr)" marker-end="url(#fsAr)"/>' +
      txt((x1 + x2) / 2, y - 5, label, 11, C.txt2, 'middle');
  }
  /* v57：dimV 端线改为「垂直于尺寸线的小横线」（原为沿尺寸线延长 3px、共线看不出），并朝图形一侧延长 */
  function dimV(x, y1, y2, label, dir) {
    var lf = 3, rt = 3;                        /* 尺寸线左侧长 / 右侧长 */
    if (dir > 0) rt += DIM_EXT;                /* 图形在右侧 → 端线向右（朝图形）延长 */
    else if (dir < 0) lf += DIM_EXT;           /* 图形在左侧 → 端线向左（朝图形）延长 */
    return line(x - lf, y1, x + rt, y1, C.dim, 0.7) + line(x - lf, y2, x + rt, y2, C.dim, 0.7) +
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
  /* ★ v82：方式二排污管「朝后水平伸出」长度（mm）。
     自动态 = 原立管段长 = 罐底标高 zBot − 排污总管标高 zWs（用户草图「≈0.44 m」即 hm=500 时的值）。
     四张方式二视图全部通过它取长度，保证「改一个数、四图同时动」。
     ── ★ v92：同一个 wRun，两种接法各有**自己的自动默认值**，因为它量的是两根不同的管：
        · 方式二 'b'：节点 → 朝后水平排污支管 = zBot − Z_WASTE（v82 原定义，默认 540）；
        · 方式一 'a'：节点 → 贴地 ② 的竖直排污立管 = zPort − Z_WASTE（默认 660）。
     两条自动值都等于「该接法下图上那根排污管本来就有多长」，所以默认四视图一字不改。 */
  function wRunAutoVal(c, m) {
    return Math.max(50, (m === 'b') ? (c.hm - Z_WASTE) : (c.hm + PORT_RISE - Z_WASTE));
  }
  /* 当前生效长度（mm）：自动态取本接法的默认值；手动态取 cfg.wRun（手改值与接法无关，两法共用） */
  function wRunEff(c, m) {
    m = (m === 'a' || m === 'b') ? m : mode;
    return c.wRunAuto ? wRunAutoVal(c, m) : Math.max(50, c.wRun);
  }
  function lwRunB(c) { return wRunEff(c, 'b'); }   /* 方式二：朝后水平伸出长度 */
  function lwRunA(c) { return wRunEff(c, 'a'); }   /* ★ v92 方式一：节点下排污立管（竖直段）长度 */
  /* ② 排污总管相对地面的位置说法：默认 Z_WASTE 贴地；参数改小 → 架空、改到地面以下 → 入地，图上如实改写 */
  function wsPosWord(zw) {
    if (zw < 0) return '入地';
    return (zw > Z_WASTE + 0.5) ? '架空' : '贴地';
  }
  /* 带符号标高文字：非负 → '+0.060'（与既有文案逐字符一致），负值 → '-1.780'（不再出现「+-」脏字） */
  function sg(v) { return (v < 0 ? '-' : '+') + mm(Math.abs(v)); }
  /* ★ v92：der 现在**知道接法**（第二个参数 m，缺省取当前 mode）——
     方式一 'a' 的 ② 排污总管标高 = 汇流节点 −「排污支管长」，即参数驱动（默认值仍 60 = 贴地）；
     方式二 'b' 的贴地 ② 早已取消，zWs 恒为 Z_WASTE（保持既有读取习惯不变）。
     两种接法在自动态下算出的都是各自的历史默认值 ⇒ 默认四视图逐像素不变。 */
  function der(c, m) {
    m = (m === 'a' || m === 'b') ? m : mode;
    return {
      zBot: c.hm,                       // 单体底面
      zPort: c.hm + PORT_RISE,          // 支管/罐口/③ 同层 / 左右口中心
      zInTop: c.hm + PORT_RISE + (c.inRise == null ? IN_TOP_RISE : c.inRise), // ①上 进水总管（唯一进水）★ v85 走 cfg.inRise
      zTop: c.hm + c.h,                 // 罐顶
      zWs: (m === 'a') ? (c.hm + PORT_RISE - wRunEff(c, 'a')) : Z_WASTE,   // ② 排污总管 ★ v92：方式一随「排污支管长」升降
      yIn: c.delta,                     // ① 进水总管（后）
      yOut: -c.delta,                   // ③ 出水总管（前）
      yWs: c.delta,                     // ② 排污总管（与 ① 同一竖直平面，排污立管直落）
      W: (c.n - 1) * c.s + c.od         // 机组总宽
    };
  }

  /* 视图映射：把 mm 世界等比装进 680×420 */
  var VW = 680, VH = 420;
  /* ★ v92：前视脚注（11px 字号）实测宽 ≈449.5px —— 竖向域被拉大、横向收窄时，
     用它把脚注起点压回视口内（起点右移超过 680−455 才生效，默认参数下不触发）。 */
  var FS_FOOT_W = 455;
  function fit(wmm, hmm, pad) {
    var sc = Math.min((VW - 2 * pad) / wmm, (VH - 2 * pad) / hmm);
    return { sc: sc, ox: (VW - wmm * sc) / 2, oy: (VH - hmm * sc) / 2 };
  }
  /* 顶视图：世界 x 向右、y 向后（屏幕向上） */
  function mapTop(c, d, mg) {
    var ext = Math.max(0, c.mainExt || 0);   /* ★ v102：①左/③右 各加长 ext ⇒ 视口同步外扩防裁切 */
    var xmin = -c.od / 2 - mg - ext, xmax = (c.n - 1) * c.s + c.od / 2 + mg + ext;
    /* v47：底部加 160mm 富余——图形略缩，给固定屏幕坐标的 W 标注 + ③/② 两行总管文字腾位 */
    var ymin = d.yOut - c.od / 2 - mg - 160, ymax = d.yIn + c.od / 2 + mg;
    var m = fit(xmax - xmin, ymax - ymin, 16);
    return {
      sc: m.sc,
      X: function (x) { return m.ox + (x - xmin) * m.sc; },
      Y: function (y) { return m.oy + (ymax - y) * m.sc; }
    };
  }
  /* 立面类视图：水平为 h（可翻转）、垂直为标高 z */
  function mapElev(hmin, hmax, zmin, zmax, pad, hFlip, dy) {
    var m = fit(hmax - hmin, zmax - zmin, pad);
    return {
      sc: m.sc,
      X: function (h) { return m.ox + (hFlip ? (hmax - h) : (h - hmin)) * m.sc; },
      Y: function (z) { return m.oy + (dy || 0) + (zmax - z) * m.sc; }   /* dy: 图形整体下移（v28 侧视 +22 上下均衡） */
    };
  }

  /* ★ v82：方式二顶视专用映射 —— 只把「后侧」（屏幕上方）留出 LWB 的余量，
     前侧不动。若直接给 mapTop 加大 mg，前后一起撑开会把整图压得很小。 */
  function mapTopB(c, d, mg, LWB) {
    var ext = Math.max(0, c.mainExt || 0);   /* ★ v102：①左/③右 各加长 ext ⇒ 视口同步外扩防裁切 */
    var xmin = -c.od / 2 - mg - ext, xmax = (c.n - 1) * c.s + c.od / 2 + mg + ext;
    var ymin = d.yOut - c.od / 2 - mg - 160;
    var ymax = d.yIn + Math.max(c.od / 2 + mg, LWB + 200);   /* v82b：尾侧留 70 时管端几乎贴顶，放不下 S 尺寸线；v84：S 线又上移到 −26，150 只够 ≈40px（实测文字顶部溢出 viewBox）⇒ 提到 200 */
    var m = fit(xmax - xmin, ymax - ymin, 16);
    return {
      sc: m.sc,
      X: function (x) { return m.ox + (x - xmin) * m.sc; },
      Y: function (y) { return m.oy + (ymax - y) * m.sc; }
    };
  }

  /* ================= 顶视图 ================= */
  function renderTop(c) {
    var d = der(c), mg = Math.max(220, c.od * 1.2);
    var M = mapTop(c, d, mg), X = M.X, Y = M.Y, sc = M.sc;
    var x0 = -200, x1 = (c.n - 1) * c.s + 120;
    var xE = Math.max(0, c.mainExt || 0), x0i = x0 - xE, x1o = x1 + xE;   /* ★ v102：① 进水端=x0i（向左）、③ 出水端=x1o（向右）；③ 左端与 ② 不动 */   /* v29：右端延伸 200→120——为出水箭头/文字再右移腾出视界空间（整组右端元素随 x1 左移，V0/堵头相对关系不变） */
    var o = DEFS;

    /* ② 排污总管（与 ① 同一竖直平面 → 俯视重合，红虚线垫底） */
    o += line(X(x0), Y(d.yIn), X(x1), Y(d.yIn), C.ws, Math.max(1.6, c.dnWs * sc * 0.5), '7 5');
    /* 每组排污立管：俯视与接驳支管投影重合（组心线上），不另画 */
    /* ③ 出水总管（前） */
    o += pipe(X(x0), Y(d.yOut), X(x1o), Y(d.yOut), C.out, C.outL, c.dnOut, sc);
    /* ① 进水总管（后，唯一进水总管）——横向总管上不放活接图示（v18 用户定：快接只在支管上） */
    o += pipe(X(x0i), Y(d.yIn), X(x1), Y(d.yIn), C.in, C.inL, c.dnIn, sc);

    var msT = modes(c);
    for (var j = 0; j < c.n; j++) {
      var gx = j * c.s, mT = msT[j], bw = (mT === 'backwash' || mT === 'dump');
      /* 接驳支管：汇流节点 → 罐后缘 平接（+zPort，与③同高，不装阀） */
      o += line(X(gx), Y(c.od / 2), X(gx), Y(d.yIn), C.inL, Math.max(2, c.dnBr * sc));
      /* 汇流节点（支管沿Y + ①上竖管沿Z 交汇；正下方接排污立管 P） */
      o += '<circle cx="' + r2(X(gx)) + '" cy="' + r2(Y(d.yIn)) + '" r="2.5" fill="' + C.in + '"/>';
      /* 前支管：罐前缘 → ③ */
      o += line(X(gx), Y(-c.od / 2), X(gx), Y(d.yOut), C.outL, Math.max(2, c.dnBr * sc));
      /* 管件表达：罐前/后口接头 + ③ 三通口箍（v33：改画在罐圆之前——罐圆完整可见，接头仅外侧探出圆缘；③ 三通口在管上不受影响） */
      var pbw = Math.max(2, c.dnBr * sc), pow = Math.max(3, c.dnOut * sc);
      o += fitRect(X(gx) - pbw * 0.65, Y(c.od / 2) - pbw * 0.65, pbw * 1.3, pbw * 1.3, 2);   /* 罐后口接头 */
      o += fitRect(X(gx) - pbw * 0.65, Y(-c.od / 2) - pbw * 0.65, pbw * 1.3, pbw * 1.3, 2);  /* 罐前口接头 */
      o += fitRect(X(gx) - pow * 0.65, Y(d.yOut) - pbw * 0.65, pow * 1.3, pbw * 1.3, 2);     /* ③ 三通口 */
      /* 罐（俯视为圆）——v33：后画，盖住接头内侧半段，圆形显示完整更美观 */
      o += '<circle cx="' + r2(X(gx)) + '" cy="' + r2(Y(0)) + '" r="' + r2(c.od / 2 * sc) +
        '" fill="' + (bw ? C.bwF : C.tank) + '" stroke="' + (bw ? C.bw : C.tankS) + '" stroke-width="1.1"/>';
      o += '<circle cx="' + r2(X(gx)) + '" cy="' + r2(Y(0)) + '" r="' + r2(Math.max(3, (c.od / 2 - 45) * sc)) +
        '" fill="none" stroke="' + (bw ? C.bwL : C.ghost) + '" stroke-width="0.8" stroke-dasharray="3 3"/>';
      /* 阀位：进水阀 V + 排污阀 P 同在节点竖管上，俯视投影重合 → 画一块（先垫管件箍座，阀块坐于其上） */
      var rw = Math.max(3, c.dnIn * sc) * 1.3;
      o += '<rect x="' + r2(X(gx) - rw / 2) + '" y="' + r2(Y(d.yIn) - rw / 2) + '" width="' + r2(rw) + '" height="' + r2(rw) +
        '" rx="3" fill="' + C.fit + '" stroke="' + C.fitS + '" stroke-width="1"/>';
      o += fitShine(X(gx) - rw / 2 + 2.5, Y(d.yIn) - rw / 2 + 3, X(gx) + rw / 2 - 2.5, Y(d.yIn) - rw / 2 + 3);
      /* 支管快捷接头（v25 沟槽卡箍式）：前后两根支管 37.5% 处各一只——对卡两半壳+唇边+中缝+螺栓，
         拆开快接即可整体抽出罐体检修；37.5%（原 40%）+ 块高 14 是为避开 V 阀座上缘 189.8mm（块带 136.4~183.6mm，净空 6.2mm） */
      var qcW = Math.max(12, pbw + 14), qcH = 14;
      var yQb = Y(c.od / 2) + (Y(d.yIn) - Y(c.od / 2)) * 0.375;
      var yQf = Y(-c.od / 2) + (Y(d.yOut) - Y(-c.od / 2)) * 0.375;
      o += grooveCoupling(X(gx), yQb, qcH, qcW, 'v', 'br' + j, 'G' + (j + 1) + ' 后支管沟槽卡箍快接 · 对卡两半壳+螺栓紧固 · 拆开可整体抽出罐体检修');
      o += grooveCoupling(X(gx), yQf, qcH, qcW, 'v', 'bf' + j, 'G' + (j + 1) + ' 前支管沟槽卡箍快接 · 拆开可整体抽出罐体检修');
      if (j === c.n - 1) o += txt(X(gx) + qcW / 2 + 9, yQb + 3, '沟槽快接', 9, C.fitS, 'start');   /* v58：右移到末组（G6）卡箍右侧行尾空白——原 j===0 处文字压在 G2 卡箍上（用户 2026-09-19 指令） */
      var vw = Math.max(7, VALVE_W * sc), vh = Math.max(6, VALVE_W * sc * 0.7);
      var modeTxt = { filter: '过滤', backwash: '反冲洗', dump: '直排短路', off: '隔离' }[mT];
      var vFill = (mT === 'filter') ? C.valve : (bw ? C.bw : '#FFFFFF');
      var vStrk = (mT === 'off') ? C.fitS : (bw ? C.bw : C.valveS);
      o += '<rect x="' + r2(X(gx) - vw / 2) + '" y="' + r2(Y(d.yIn) - vh / 2) + '" width="' + r2(vw) + '" height="' + r2(vh) +
        '" rx="2" class="fs-valve" data-fs-valve="' + j + ':cycle" cursor="pointer" fill="' + vFill + '" stroke="' + vStrk +
        '" stroke-width="1"><title>G' + (j + 1) + ' 阀组 · ' + modeTxt + '（点击切换：过滤→反冲→隔离→直排）</title></rect>';
      if (mT === 'off') o += line(X(gx) - vw / 2 + 1, Y(d.yIn) + vh / 2 - 1, X(gx) + vw / 2 - 1, Y(d.yIn) - vh / 2 + 1, C.fitS, 1.2);
      /* 俯视图：只给第 1 组引注阀位（其余组构造相同：G2=V2/P2、G3=V3/P3、G4=V4/P4）；锚在箍座左缘之外 */
      if (j === 0) {
        o += txt(X(gx) - rw / 2 - 4, Y(d.yIn) - 2, 'V1', 10, C.valveS, 'end');
        o += txt(X(gx) - rw / 2 - 4, Y(d.yIn) + 10, 'P1', 10, C.valveS, 'end');
      }
      o += txt(X(gx), Y(0) + 4, 'G' + (j + 1), 11, bw ? C.bw : C.txt3, 'middle', bw ? 700 : 400);
    }

    /* 水流方向层（动画虚线）：按各组阀态推导 ①③② 与每组支管有否流动及方向 */
    var hasV = false, hasF = false, hasW = false;
    msT.forEach(function (m) {
      if (m === 'filter') { hasV = true; hasF = true; }
      else if (m === 'backwash') { hasW = true; }
      else if (m === 'dump') { hasV = true; hasW = true; }
    });
    if (hasV) o += flow(X(x0i), Y(d.yIn), X(x1), Y(d.yIn), C.in);
    var v0o = v0Open(c);
    if (hasF) o += flow(X(x0), Y(d.yOut), X(x1o), Y(d.yOut), C.out);            /* ③ 管内通长流（V0 在管端外延伸段，不占管内） */
    if (hasF && v0o) o += '<line x1="' + r2(X(x1o)) + '" y1="' + r2(Y(d.yOut)) + '" x2="' + r2(X(x1o + 80)) +
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
    o += line(X(x1o), Y(d.yOut), X(x1o + 80), Y(d.yOut), C.out, Math.max(3, c.dnOut * sc));
    o += v0Valve(X(x1o + 12), Y(d.yOut) - vh0 / 2, vw0, vh0, v0o);
    o += txt(X(x1o + 12) + vw0 / 2, Y(d.yOut) + vh0 / 2 + 11, 'V0', 10, C.valveS, 'middle');
    o += arrow(X(x1o + 190), Y(d.yOut), X(x1o + 222), Y(d.yOut), C.out, 1.6);   /* v29：随 ext 缩短再右移（空隙 150→190mm；n=6 箭头头距右缘 15px） */
    o += txt(X(x1o + 218), Y(d.yOut) - 12, '出水', 12, C.out, 'end');   /* end 锚压箭头上方：n=6 字形右缘 663.5 距右缘 680 净空 16px */

    /* 管端堵头（v17）：① 末端（末组之后死头）与 ③ 上游端（首组之前死头）为盲板端盖；
     * ① 左端=进水来向、③ 右端=V0 出水去向、② 左端=排污排向，均接走不设堵头 */
    o += endCapV(X(x1) + 1, Y(d.yIn), Math.max(3, c.dnIn * sc) + 5, C.in, 'topIn');
    o += endCapV(X(x0) - 1, Y(d.yOut), Math.max(3, c.dnOut * sc) + 5, C.out, 'topOut');

    /* 流向箭头（v22：整体移到管端外侧、与管道脱开——进水箭头指向管但不压管） */
    o += arrow(X(x0i) - 42, Y(d.yIn), X(x0i) - 16, Y(d.yIn), C.in, 1.6);
    o += txt(X(x0i) - 29, Y(d.yIn) - 10, '进水', 12, C.in, 'middle');
    /* 「出水」箭头已在上方随 V0 画（指向外）；排污不另设右端引注：② 与 ① 俯视重合 */

    /* 尺寸与注记 */
    /* 罐径 OD 标注已按用户要求取消（v27）：「过滤器 OD200 这种文字不标注」——几何参数不再上图，S=400 保留 */
    o += dimH(X(0), X(c.s), Y(d.yIn) - Math.max(30, c.od * sc * 0.72), 'S=' + c.s, 1);   /* v57：图形在下 */
    /* v51：W 标注固定屏幕 y=352（v47 的 372 上移 20px，与图形拉近）——两行总管文字仍在其下方 */
    o += dimH(X(-c.od / 2), X((c.n - 1) * c.s + c.od / 2), 352,
      '总宽 W = ' + (c.n - 1) + 'S + OD = ' + d.W + ' mm', -1);   /* v57：图形在上 */
    o += dimV(X(x0i) - 64, Y(d.yIn), Y(d.yOut), '2Δ=' + (2 * c.delta), 1);   /* v57：图形在右 */   /* v22：左移让位进水箭头 */
    o += txt(X(x0), 388, '② 排污总管（' + wsPosWord(d.zWs) + ' ' + sg(d.zWs) + ' · 与 ① 同一竖直平面，俯视虚线重合）· DN' + c.dnWs + ' · 各组排污立管接入', 11, C.ws, 'start');   /* v47：移到 W 标注下方；v51 上移 20px */
    o += txt(X(x0), 372, '③ 出水总管（前 · +' + mm(d.zPort) + '）  ·  DN' + c.dnOut, 11, C.out, 'start');   /* v47：移到 W 标注下方；v51 上移 20px */
    /* ① 标注（v21）：移到右端管上方避开左端 S/OD 尺寸文字；排污立管说明并入 ② 行 */
    o += txt(X(x1) - 4, Y(d.yIn) - 42, '① 进水总管（+' + mm(d.zInTop) + '）· DN' + c.dnIn, 11, C.in, 'end');

    /* ★ v99 压力表 → ★ v103（2026-09-22 用户批注）：**首选** = 方向朝上（同 PG1）+ 挂**加长段**——
       PG1 首选 ① 进水端加长段 [x0i, x0]、PG2 首选 ③ 出水端加长段 [x1, x1o]；
       段内按屏幕步距铺候选（mainExt=0 时三点重合于管端，行为确定）。
       ★ v103b 兜底 = v99 原全管长 × 多方向候选（A_TIN/A_TOUT）：极端参数（n2 紧 Δ150 / n6 S250 /
       dn315）下加长段上方没有干净空档时，择优自动落回原位 —— 宁可方向不一致也不压字/压管件。
       恒有 PG1.x < PG2.x（主闸门「进水表在上游侧」断言）在任何 n/S/Δ 下都成立。 */
    var hwInT = Math.max(3, c.dnIn * sc) / 2, hwOutT = Math.max(3, c.dnOut * sc) / 2;
    var xP2T = (c.n - 2) * c.s + c.s / 2;
    var p2UpT = (c.delta - c.od / 2) * sc >= 58;
    var UP_IN_T = [[-hwInT, 0, -G_OFF, 'u']];
    var UP_OUT_T = [[-hwOutT, 0, -G_OFF, 'u']];
    /* PG1 兜底臂：① 后缘朝后 → 朝左（上游）→ 前缘朝前 / 带内朝左（v99 原顺序）。PG2 兜底：按 v90 分档。 */
    var A_TIN = [
      [-hwInT, 0, -G_OFF, 'u'], [-hwInT, 0, -G_OFF, 'r'], [-hwInT, -G_OFF, 0, 'l'],
      [hwInT, 0, G_OFF, 'd'], [hwInT, 0, G_OFF, 'r'], [hwInT, -G_OFF, 0, 'l'],
      [6, 0, G_OFF, 'd'], [0, 0, -G_OFF, 'r']
    ];
    var A_TOUT = p2UpT ? [
      [-hwOutT, 0, -G_OFF, 'r'], [-hwOutT, 0, -G_OFF, 'd'], [-hwOutT, -G_OFF, 0, 'l'],
      [hwOutT, 0, G_OFF, 'r'], [hwOutT, -G_OFF, 0, 'l'], [hwOutT, 0, G_OFF, 'd']
    ] : [
      [hwOutT, 0, G_OFF, 'r'], [hwOutT, 0, G_OFF, 'd'], [hwOutT, -G_OFF, 0, 'l'],
      [-hwOutT, 0, -G_OFF, 'r'], [-hwOutT, -G_OFF, 0, 'l'], [-hwOutT, 0, -G_OFF, 'd']
    ];
    o += gaugeP('top:in', segCands(X(x0i), X(x0), 30, Y(d.yIn), UP_IN_T).concat(segCands(X(x0) + 10, X(xP2T) - 40, 30, Y(d.yIn), A_TIN)), 'PG1', C.in);
    o += gaugeP('top:out', segCands(X(x1), X(x1o), 30, Y(d.yOut), UP_OUT_T).concat(segCands(X(xP2T) + 14, X(x1) - 10, 30, Y(d.yOut), A_TOUT)), 'PG2', C.out);
    o += txt(VW - 14, 18, '俯视 · 上=后 / 下=前', 11, C.txt3, 'end');
    return o;
  }

  /* ================= 前视图 ================= */
  function renderFront(c) {
    var d = der(c), mg = Math.max(260, c.od * 1.3);
    var extF = Math.max(0, c.mainExt || 0);   /* ★ v102：①左/③右 各加长 extF ⇒ 视口同步外扩 */
    var hmin = -c.od / 2 - mg - extF, hmax = (c.n - 1) * c.s + c.od / 2 + mg + extF;
    var M = mapElev(hmin, hmax, Math.min(-120, d.zWs - 160)   /* ★ v92：zmin 让位给可能下移的 ②（160mm < 180mm ⇒ 默认仍 -120、逐像素不变；极端参数下约 17px 余量够放 ② 圆与标注） */, Math.max(d.zTop + 320, d.zInTop + 300), 16, false);   /* v38：上界按 zInTop 兜底（H=600 时顶部说明贴 ① 管带） */   /* v32：zmax 220→320——虚拟顶加高使图形整体下移，顶部说明(y=18)与 ① 管线/标高脱开（原几乎叠着） */
    var X = M.X, Y = M.Y, sc = M.sc;
    var h0 = -120, h1 = (c.n - 1) * c.s + 120;
    var hE = Math.max(0, c.mainExt || 0), h0i = h0 - hE, h1o = h1 + hE;   /* ★ v102：① 左端=h0i、③ 右端=h1o（③ 左端、② 不动） */
    var o = DEFS;

    /* 地面线 */
    o += line(X(hmin), Y(0), X(hmax), Y(0), C.dim, 1.2);
    /* ② 排污总管 */
    o += pipe(X(h0), Y(d.zWs), X(h1), Y(d.zWs), C.ws, C.wsL, c.dnWs, sc);
    /* ③ 出水总管 +0.720（接驳支管与罐口同高，位于罐后不另画通长线） */
    o += pipe(X(h0), Y(d.zPort), X(h1o), Y(d.zPort), C.out, C.outL, c.dnOut, sc);
    /* ①上 进水总管（虚线，位于罐体之后）——横向总管上不放活接图示（v18） */
    o += line(X(h0i), Y(d.zInTop), X(h1), Y(d.zInTop), C.in, Math.max(1.6, c.dnIn * sc * 0.5), '7 5');

    var msF = modes(c);
    for (var i = 0; i < c.n; i++) {
      var cx = i * c.s, mF = msF[i], bw = (mF === 'backwash' || mF === 'dump');
      /* 罐体 */
      o += '<rect x="' + r2(X(cx - c.od / 2)) + '" y="' + r2(Y(d.zTop)) + '" width="' + r2(c.od * sc) +
        '" height="' + r2(c.h * sc) + '" fill="' + (bw ? C.bwF : C.tank) +
        '" stroke="' + (bw ? C.bw : C.tankS) + '" stroke-width="1.1"/>';
      /* 卡箍（罐底金属箍） */
      o += '<rect x="' + r2(X(cx - c.od / 2)) + '" y="' + r2(Y(d.zBot + 46)) + '" width="' + r2(c.od * sc) +
        '" height="' + r2(46 * sc) + '" fill="none" stroke="' + C.ghost + '" stroke-width="1"/>';
      /* 罐顶排气阀 ⑥ */
      var vx = c.od * 0.16;
      o += '<rect x="' + r2(X(cx) - vx * sc) + '" y="' + r2(Y(d.zTop) - 60 * sc) + '" width="' + r2(2 * vx * sc) +
        '" height="' + r2(60 * sc) + '" fill="' + (bw ? C.bwF : C.tank) +
        '" stroke="' + (bw ? C.bw : C.tankS) + '" stroke-width="0.8"/>';
      if (i === 0) o += txt(X(cx) + vx * sc + 5, Y(d.zTop) - 60 * sc + 11, '⑥ 排气', 10, C.txt3, 'start');
      /* 排污立管（汇流节点 +zPort → ②，位于罐体之后画虚线；反冲/直排组亮为实线）+ 排污阀 P */
      o += line(X(cx), Y(d.zPort), X(cx), Y(d.zWs), bw ? C.ws : C.wsL, Math.max(2.4, c.dnWs * sc * 0.75),
        bw ? null : '5 4');
      var vw = Math.max(8, VALVE_W * sc), vh = Math.max(7, VALVE_W * sc * 0.62);
      var vy = (d.zPort + d.zWs) / 2;
      o += valveRect(X(cx) - vw / 2, Y(vy) - vh / 2, vw, vh, (mF === 'backwash' || mF === 'dump'),
        i + ':p', 'P' + (i + 1) + ' 排污阀（节点下立管中段）');
      /* 组号 */
      o += txt(X(cx), Y(d.zTop) + 16, 'G' + (i + 1), 11, bw ? C.bw : C.txt3, 'middle', bw ? 700 : 400);
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
    if (hasVF) o += flow(X(h0i), Y(d.zInTop), X(h1), Y(d.zInTop), C.in);
    var v0oF = v0Open(c);
    if (hasFF) o += flow(X(h0), Y(d.zPort), v0oF ? X(h1o) : X(h1o) + 14, Y(d.zPort), C.out); /* V0 关：③ 流停在阀前 */
    /* 出水总阀 V0（v12：③ 右端外延短管上）：有组反冲时自动关闭（停水反冲） */
    var vw0F = Math.max(7, VALVE_W * sc), vh0F = Math.max(6, VALVE_W * sc * 0.62);
    var v0xF = X(h1o) + 14;
    o += line(X(h1o), Y(d.zPort), v0xF + vw0F, Y(d.zPort), C.outL, Math.max(2.4, c.dnOut * sc));
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
    o += dimH(X(0), X(c.s), Y(d.zTop) - 34, 'S=' + c.s, 1);   /* v57：图形在下 */
    o += dimV(X(hmax) - 26   /* v44：右移 8px 与 V0 阀脱开 */, Y(0), Y(d.zTop), 'H总=' + (c.hm + c.h), -1);   /* v57：图形在左 */
    o += elevMark(X(hmin) + 36   /* v46：再左移 20px 对齐侧视 v40 脱开幅度 */, Y(d.zTop), '+' + mm(d.zTop));
    o += elevMark(X(hmin) + 36   /* v46：再左移 20px 对齐侧视 v40 脱开幅度 */, Y(d.zInTop), '+' + mm(d.zInTop));
    o += elevMark(X(hmin) + 36   /* v46：再左移 20px 对齐侧视 v40 脱开幅度 */, Y(d.zPort), '+' + mm(d.zPort));
    o += elevMark(X(hmin) + 36   /* v46：再左移 20px 对齐侧视 v40 脱开幅度 */, Y(d.zBot), '+' + mm(d.zBot));
    o += elevMark(X(hmin) + 36   /* v46：再左移 20px 对齐侧视 v40 脱开幅度 */, Y(d.zWs), sg(d.zWs));
    o += elevMark(X(hmin) + 36   /* v46：再左移 20px 对齐侧视 v40 脱开幅度 */, Y(0), '±0.000');

    /* ★ v99 压力表 → ★ v103（2026-09-22 用户批注）：**首选** = 朝上 + 挂**加长段**——
       PG1 首选 ① 进水端加长段 [h0i, h0]（仍要求 ① 高出罐顶 120mm 才装，理由同前）；
       PG2 首选 ③ 出水端加长段 [h1, h1o]。
       ★ v103b 兜底 = v99 原全管长 × 多方向候选（A_FIN/A_FOUT），极端参数自动落回。 */
    var hwInF = Math.max(1.6, c.dnIn * sc * 0.5) / 2, hwOutF = Math.max(3, c.dnOut * sc) / 2;
    var UP_IN_F = [[-hwInF, 0, -G_OFF, 'u']];
    var UP_OUT_F = [[-hwOutF, 0, -G_OFF, 'u']];
    var A_FIN = [
      [-hwInF, 0, -G_OFF, 'r'], [-hwInF, 0, -G_OFF, 'u'], [-hwInF, -G_OFF, 0, 'l'],
      [-hwInF, G_OFF, 0, 'r'], [hwInF, 0, G_OFF, 'r'], [hwInF, 0, G_OFF, 'd'],
      [-hwInF, 0, -G_OFF, 'l'], [hwInF, -G_OFF, 0, 'l']
    ];
    var A_FOUT = [
      [hwOutF, 0, G_OFF, 'r'], [hwOutF, 0, G_OFF, 'd'], [hwOutF, -G_OFF, 0, 'l'],
      [-hwOutF, 0, -G_OFF, 'r'], [-hwOutF, -G_OFF, 0, 'l'], [hwOutF, G_OFF, 0, 'r']
    ];
    if (d.zInTop >= d.zTop + 120)
      o += gaugeP('front:in', segCands(X(h0i), X(h0), 34, Y(d.zInTop), UP_IN_F).concat(segCands(X(h0) + 10, X(h1) - 10, 34, Y(d.zInTop), A_FIN)), 'PG1', C.in);
    /* ★ v111（2026-09-22 用户批注「PG2 应往右移到总管加长段内」）：h1=(n-1)s+120 可能落在
       罐右缘 (n-1)s+od/2 之内（od=200 时 h1 比罐缘仅靠外 20mm），表盘视觉上压罐右肩。
       首选改挂**罐缘之后**的净加长段，且从净段**中点**起铺（不再从段左缘起铺），段尾 h1o 兜底；
       兜底 A_FOUT 不变。h1v=min(max(h1,罐缘),h1o)：ext 极小时段宽趋 0，与旧候选同点等价。 */
    var h1v = Math.min(Math.max(h1, (c.n - 1) * c.s + c.od / 2), h1o);
    o += gaugeP('front:out', segCands((X(h1v) + X(h1o)) / 2, X(h1o), 34, Y(d.zPort), UP_OUT_F).concat(segCands(X(h0) + 10, X(h1) - 10, 34, Y(d.zPort), A_FOUT)), 'PG2', C.out);
    /* 注释（v21）：移到地面线下方作脚注，不再横穿四只罐体 */
    /* ★ v92：这条 ② 脚注改钉在**地面线**上（Y(0) − 60×sc ≡ 原 Y(d.zWs)+… 在 zWs=60 下逐位相等，
       因 mapElev 的 Y 对 z 是斜率 −sc 的线性函数）⇒ 默认输出不变；方式一里参数把 ② 顶高/压低时
       脚注不再跟着跑、极端值下也就不会被裁。（A/B 两份逐字符相同，B 版 zWs 恒 60 ⇒ 对 B 亦逐位相等。） */
    o += txt(Math.min(X(hmin) + 60, VW - FS_FOOT_W), Y(0) - 60 * sc + 44, '支管/罐口与 ③ 同层 +' + mm(d.zPort) + '（平接）；①上 +' + mm(d.zInTop) + ' 供应，节点下排污立管（P 常闭）落 ②', 11, C.txt2, 'start');   /* v32：脚注 28→44——与 +0.060/+0.000 刻度拉开 */
    o += txt(VW - 14, 18, '前视 · 从前往后看（①路与排污立管均在罐后，虚线）', 11, C.txt3, 'end');
    return o;
  }

  /* ================= 侧视图（左视图：左=后 / 右=前） ================= */
  function renderSide(c) {
    var d = der(c), mg = Math.max(300, c.od * 1.4);
    var hmin = d.yOut - mg, hmax = d.yIn + mg;
    var M = mapElev(hmin, hmax, Math.min(-120, d.zWs - 160)   /* ★ v92：同前视（默认仍是 -120） */, Math.max(d.zTop + 220, d.zInTop + 260), 16, true, 22);   /* v38：上界按 zInTop 兜底（H=600 时 zTop+220 不够） */   /* v28：图形下移 22px——原上空 -4.4px（顶部被裁）/下空 40.5px，均衡后 17.6/18.5 */
    var X = M.X, Y = M.Y, sc = M.sc;
    var m0 = modes(c)[0], bw = (m0 === 'backwash' || m0 === 'dump');
    var o = DEFS;
    var cxc = X(0);

    o += line(X(hmin), Y(0), X(hmax), Y(0), C.dim, 1.2);
    /* v61：三根总管断面圆已移到「水流方向层」之后绘制（原在此处会被随后画的管带盖住） */
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
      '" height="' + r2(c.h * sc) + '" fill="' + (bw ? C.bwF : C.tank) +
      '" stroke="' + (bw ? C.bw : C.tankS) + '" stroke-width="1.1"/>';
    o += line(X(c.od / 2), Y(d.zBot + 46), X(-c.od / 2), Y(d.zBot + 46), C.ghost, 1);

    /* 管件表达：汇流节点三通（圆角 T + 三端法兰）+ 罐口承口套环 + 三处总管接口套环 */
    var nbw = Math.max(2.4, c.dnBr * sc);            /* 支管/立管带宽 */
    var nx = X(d.yIn), ny = Y(d.zPort);
    /* v54：三通比例重塑成 T 形；v56：整体微缩、水平支臂改短（AL 1.6→1.1，用户批注「左侧接支管的接头长了」） */
    var tw = nbw * 1.15, ex = nbw * 0.95, AL = nbw * 1.1, rT = Math.min(4, nbw * 0.24);
    o += '<path d="' + roundedTee(nx, ny, tw, ex, ex, AL, nbw * 1.15, rT) +
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

    /* v61 图层顺序（用户批注：色块压在圆上不好看，圆应遮挡管道）：
       三根总管断面圆在此绘制 —— 位于 管带(①②③) + 管件 + 水流虚线 之上，圆面遮住管端；
       又位于 标高/文字 之下，圆内注释与刻度仍清晰。
       （唯一能同时看清前后错位与标高链的视图，故保留此三圆） */
    o += '<circle cx="' + r2(X(d.yIn)) + '" cy="' + r2(Y(d.zWs)) + '" r="' + r2(Math.max(4, c.dnWs / 2 * sc)) +
      '" fill="' + C.wsF + '" stroke="' + C.ws + '" stroke-width="1.4"/>';
    o += '<circle cx="' + r2(X(d.yOut)) + '" cy="' + r2(Y(d.zPort)) + '" r="' + r2(Math.max(4, c.dnOut / 2 * sc)) +
      '" fill="' + C.outF + '" stroke="' + C.out + '" stroke-width="1.4"/>';
    o += '<circle cx="' + r2(X(d.yIn)) + '" cy="' + r2(Y(d.zInTop)) + '" r="' + r2(Math.max(4, c.dnIn / 2 * sc)) +
      '" fill="' + C.inF + '" stroke="' + C.in + '" stroke-width="1.4"/>';

    /* 罐顶排气口 ⑥（侧视/左视为竖管，标出标高链顶端）
       ★ v108：③ 出水标签在净宽不足时升到 PG2 走廊顶之上（见下方 v90/v108 注释），可能与本标注
       同带（高压侧实测压 12.9×12.5）—— 相交则本标注上移 16px 让开（③ 布局参数须提前算）。 */
    var rOut3 = Math.max(4, c.dnOut / 2 * sc), lxL3 = X(-c.od / 2) + 6, lxR3 = X(d.yOut) - rOut3 - 6;
    var cx3 = Math.max(X(d.yOut), X(-c.od / 2) + 46), ty3 = Y(d.zPort) - rOut3 - 48;
    var y6 = Y(d.zTop + 70) + 4;
    if (lxR3 - lxL3 < 82 &&
        cx3 + 40 > cxc + 6 && cx3 - 40 < cxc + 46 &&
        ty3 + 3 > y6 - 8 && ty3 - 12 < y6 + 4) y6 -= 16;
    o += line(cxc, Y(d.zTop), cxc, Y(d.zTop + 70), C.tankS, 2.4);
    o += txt(cxc + 6, y6, '⑥ 排气', 10, C.txt3, 'start');

    o += elevMark(X(d.yIn) - 44   /* v37：标高列贴立管左侧跟随图形；v40：间距 24→44 与图形脱开（用户批注太近） */, Y(d.zTop), '+' + mm(d.zTop));
    o += elevMark(X(d.yIn) - 44   /* v37：标高列贴立管左侧跟随图形；v40：间距 24→44 与图形脱开（用户批注太近） */, Y(d.zInTop), '+' + mm(d.zInTop));
    o += elevMark(X(d.yIn) - 44   /* v37：标高列贴立管左侧跟随图形；v40：间距 24→44 与图形脱开（用户批注太近） */, Y(d.zPort), '+' + mm(d.zPort));
    o += elevMark(X(d.yIn) - 44   /* v37：标高列贴立管左侧跟随图形；v40：间距 24→44 与图形脱开（用户批注太近） */, Y(d.zBot), '+' + mm(d.zBot));
    o += elevMark(X(d.yIn) - 44   /* v37：标高列贴立管左侧跟随图形；v40：间距 24→44 与图形脱开（用户批注太近） */, Y(d.zWs), sg(d.zWs));
    o += elevMark(X(d.yIn) - 44   /* v37：标高列贴立管左侧跟随图形；v40：间距 24→44 与图形脱开（用户批注太近） */, Y(0), '±0.000');
    o += txt(X(d.yIn) + 10, Y(d.zInTop) - 20, '①上 进水 +' + mm(d.zInTop), 11, C.in, 'start');
    /* v34：删「汇流节点 +0.720（支管与③同高）」文字标注（用户批注取消） */
    /* ★ v90（用户批注：文字与图形重叠）——「③ 出水」标签移到 ③ 出水总管**上方**。
       原写法 `Y(d.zPort) + 20` 落在管带(sw≈20.7)下沿内侧、右端还顶住 ③ 断面圆：默认几何实测
       压管带 2.0px、压断面圆 5.0×3.3px（用户 hm500 那组更差：3.4px / 5.0×6.7px）；
       实测见 _p1/_probe_outlet_label_before.txt。成因是**两个随参数变的硬约束**把单锚点挤死了：
         · 罐体右缘 = 罐前口 = X(−od/2)          —— od 越大越往右长（od400 时压罐体 6.8px）；
         · ③ 断面圆左缘 = X(yOut) − dnOut/2·sc   —— dnOut 越大越往左伸（od400+dnOut315 净宽仅 56px < 标签 76.1px）。
       故分两档（确定性，无测量歧义）：
         档 1 常规：居中于「罐前口 +6 ~ ③ 断面圆左缘 −6」之间、管轴上方 24px（默认净宽 118.8px ≫ 82px）；
         档 2 空间不足（净宽 < 82px）：x 仍居中于原位（max(X(yOut), X(-od/2)+46) —— 罐体/管带/
               P1 文字均不压，v90 契约全绿原证），**y 升到 PG2 正上候选走廊顶之上**：
               走廊顶 = Y−rOut3−41（挂点→短管 18→标号顶 23），基线取 Y−rOut3−48 留 4px ——
               ★ v108：原 y=Y−max(rOut3+10,24) 时文字带正横穿走廊（ov 28×13.7），会把侧视 PG2
               择优整条逼到朝左（2026-09-22 用户批注「压力表方向应朝上」）；走廊是垂直通道，
               文字悬于其顶不算挡。右对齐方案（end 钉 X(yOut)−20）已试并否决 —— od400 系组
               罐体投影右缘伸到圆心左 ~60px，左移文字压罐体/进水管带（v90 契约 17 项红）。
               Math.max 同时兜住「Δ < od/2」时罐体右缘比 ③ 断面圆更靠右的退化几何。
       契约：_p1/_verify_fs_outlet_label_v90.cjs（9 组参数 × 2 接法：净空 ≥2px、零交叠、零溢出）。 */
    /* ★ v108（2026-09-22 用户批注「压力表安装方向应朝上」）：③ 文字右缘必须让开 PG2 的**正上候选走廊**
       （表盘 r10 + 标号「PG2」半宽 ~11 ⇒ 走廊半宽 13，取圆心左 15px 为界），否则侧视 PG2 择优被
       这行字挡住、整条退路落到朝左（实测默认参数交叠 28×15.1 全横穿走廊，见 _p1/_v108_side_probe.cjs）。
       主分支：中心 cap 到圆心左 56（=15+文字半宽 40+1，实测半宽 38.0；文字仍在 [lxL3,lxR3] 带内只左移）；
       左移后与全图零交叠已由探针预检（movedHits=[]）。 */
    o += (lxR3 - lxL3 >= 82)
      ? txt(Math.min((lxL3 + lxR3) / 2, X(d.yOut) - 56), Y(d.zPort) - 24, '③ 出水 +' + mm(d.zPort), 11, C.out, 'middle')
      : txt(cx3, ty3,
        '③ 出水 +' + mm(d.zPort), 11, C.out, 'middle');
    o += txt(X(d.yIn) + 16, Y(d.zWs) + 4, '② 排污 ' + sg(d.zWs), 11, C.ws, 'start');

    /* ★ v99 压力表：侧视（沿机组轴线看）里 ①③ 是**断面圆**，表就挂在圆的外缘上 ——
       ★ v103：PG1/PG2 一律朝上（方向一致），不挤进罐体/汇流节点那一堆管件里。
       挂点必须是断面圆的**正上 / 正下**一点（挂点即"表接在管子哪一点"），故候选只变
       短管方向与标号落位、挂点不动 —— 主闸门对侧视正好也只量这一点（20 个候选见 SIDE_*）。 */
    var rrInS = Math.max(4, c.dnIn / 2 * sc), rrOutS = Math.max(4, c.dnOut / 2 * sc);
    o += gaugeP('side:in', gaugeCands([[X(d.yIn), Y(d.zInTop) - rrInS]], SIDE_DIRS_IN, SIDE_LABS),
      'PG1', C.in);
    /* ★ v103b：首选正上（同 PG1，标号朝上）；斜上/左右为退路；全撞时退回断面圆正下（v99 原位） */
    o += gaugeP('side:out', gaugeCands([[X(d.yOut), Y(d.zPort) - rrOutS]],
      [[0, -G_OFF]], ['u'])
      .concat(gaugeCands([[X(d.yOut), Y(d.zPort) - rrOutS]], SIDE_DIRS_OUT.slice(1), SIDE_LABS))
      .concat([[X(d.yOut), Y(d.zPort) + rrOutS, 0, G_OFF, 'd']]), 'PG2', C.out);
    o += txt(VW - 14, 18, '侧视 · 左=后 / 右=前', 11, C.txt3, 'end');
    return o;
  }

  /* ================= 轴测图（等轴测） ================= */
  function renderAxo(c) {
    var d = der(c);
    var u = function (x, y) { return 0.866 * (x + y); };
    var v = function (x, y, z) { return 0.5 * (x - y) - z; };
    var x0 = -220, x1 = (c.n - 1) * c.s + 220;
    var xE = Math.max(0, c.mainExt || 0), x0i = x0 - xE, x1o = x1 + xE;   /* ★ v102：① 左端=x0i、③ 右端=x1o（③ 左端、② 不动）；标注锚点按 v89 契约不动 */

    var probe = [
      [x0, d.yIn, d.zTop], [x1, d.yIn, d.zTop], [x0, d.yOut, 0], [x1o, d.yOut, 0],
      [x0, d.yIn, d.zTop + 90], [x1, 0, 0], [x0i, d.yIn, d.zInTop],
      /* ★ v92：② 排污总管的两端 —— 方式一里它的标高由「排污支管长」决定，参数调到极端
         （② 落到地面以下）时不纳入包围盒就会被裁掉（同 v82 给方式二加末端点的做法）。 */
      [x0, d.yIn, d.zWs - 400], [x1, d.yIn, d.zWs - 400]   /* 再让 400mm：② 的引注文字在其下方，只贴到管端仍会被裁 */
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
    var oy = padTop - vmin * sc + ((VH - padTop - pad) - (vmax - vmin) * sc) / 2 + 28;   /* v28：图形整体下移 28px——probe 包围盒底部虚扩致居中偏上（原上空 6.1/下空 63.3），均衡后 34/35 */
    var X = function (x, y) { return ox + u(x, y) * sc; };
    var Y = function (x, y, z) { return oy + v(x, y, z) * sc; };
    var rx = 1.2247 * sc, ry = 0.7071 * sc;                 // 单位半径的水平圆投影

    var o = DEFS;
    var p1TagX = 0, p1TagY = 0;   /* G1「P1 常闭」引注坐标（③ rail 之后补画，避免被管带盖住） */
    /* ② 排污总管（最前 → 最后画）；先画 ① 与罐体，再 ③，最后 ② */
    /* ①上 进水总管（唯一进水总管，罐后高位） */
    o += pipe(X(x0i, d.yIn), Y(x0i, d.yIn, d.zInTop), X(x1, d.yIn), Y(x1, d.yIn, d.zInTop), C.in, C.inL, c.dnIn, sc);
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
      /* 罐后口卡箍（v52：进水侧——画在罐体之前，罐体侧影遮住菱形内侧一半，只露出朝后探出的部分；
         用户批注「进水管的菱形应该是被罐体遮挡了一部分的」）。hw 定义在此（axoF 沿用）。 */
      var hw = Math.max(3.5, c.dnBr * sc * 0.55);
      var hpx = X(cx, R), hpy = Y(cx, R, d.zPort);
      o += '<path data-fs-coup="axoB' + i + '" d="M' + r2(hpx) + ' ' + r2(hpy - hw) + ' L' + r2(hpx + hw * 1.15) + ' ' + r2(hpy) +
        ' L' + r2(hpx) + ' ' + r2(hpy + hw) + ' L' + r2(hpx - hw * 1.15) + ' ' + r2(hpy) + ' Z" fill="' + C.fit +
        '" stroke="' + C.fitS + '" stroke-width="1" stroke-linejoin="round"/>';
      /* 罐体：底椭圆 + 侧影 + 顶椭圆（水平圆 → 固定比例椭圆） */
      var erx = rx * R, ery = Math.max(3, ry * R);
      o += '<ellipse cx="' + r2(X(cx, 0)) + '" cy="' + r2(Y(cx, 0, d.zBot)) + '" rx="' + r2(erx) + '" ry="' + r2(ery) +
        '" fill="' + (bw ? C.bwF : C.tank) + '" stroke="' + (bw ? C.bw : C.tankS) + '" stroke-width="1"/>';
      var blu = X(cx, R), blv = Y(cx, R, d.zBot), tlu = X(cx, R), tlv = Y(cx, R, d.zTop);
      var bru = X(cx, -R), brv = Y(cx, -R, d.zBot), tru = X(cx, -R), trv = Y(cx, -R, d.zTop);
      o += '<path d="M' + r2(blu) + ' ' + r2(blv) + ' L' + r2(tlu) + ' ' + r2(tlv) + ' L' + r2(tru) + ' ' + r2(trv) +
        ' L' + r2(bru) + ' ' + r2(brv) + ' Z" fill="' + (bw ? C.bwF : C.tank) + '" stroke="none"/>';
      o += line(tlu, tlv, blu, blv, bw ? C.bw : C.tankS, 1);
      o += line(tru, trv, bru, brv, bw ? C.bw : C.tankS, 1);
      o += '<ellipse cx="' + r2(X(cx, 0)) + '" cy="' + r2(Y(cx, 0, d.zTop)) + '" rx="' + r2(erx) + '" ry="' + r2(ery) +
        '" fill="' + (bw ? C.bwF : C.tank) + '" stroke="' + (bw ? C.bw : C.tankS) + '" stroke-width="1.2"/>';
      /* 罐前口卡箍（v43 图示；v52：排水/出水侧——画在罐体之上，图层最上层完整显示，
         用户批注「排水管的菱形位于图层最上层显示出来」） */
      var fpx = X(cx, -R), fpy = Y(cx, -R, d.zPort);
      o += '<path data-fs-coup="axoF' + i + '" d="M' + r2(fpx) + ' ' + r2(fpy - hw) + ' L' + r2(fpx + hw * 1.15) + ' ' + r2(fpy) +
        ' L' + r2(fpx) + ' ' + r2(fpy + hw) + ' L' + r2(fpx - hw * 1.15) + ' ' + r2(fpy) + ' Z" fill="' + C.fit +
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
      o += txt(X(cx, 0), Y(cx, 0, d.zTop + 70) - 8, 'G' + (i + 1), 10, bw ? C.bw : C.txt3, 'middle', bw ? 700 : 400, 'fs-tcode');   /* v85：引注码，放大后不缩小 */
      /* 轴测图：只给第 1 组引注阀位与排气口（其余组构造相同：G2=V2/P2、G3=V3/P3、G4=V4/P4） */
      if (i === 0) {
        o += txt(ox + m1 * sc + vwA / 2 + 4, oy + m1v * sc + 3, 'V1', 9, C.valveS, 'start', 0, 'fs-tcode');
        p1TagX = ox + m2 * sc + vwA / 2 + 4; p1TagY = oy + m2v * sc + 3;
        o += txt(X(cx, 0) + 7, Y(cx, 0, d.zTop + 70) - 8, '⑥', 9, C.txt3, 'start', 0, 'fs-tcode');
      }
    }

    o += pipe(X(x0, d.yOut), Y(x0, d.yOut, d.zPort), X(x1o, d.yOut), Y(x1o, d.yOut, d.zPort), C.out, C.outL, c.dnOut, sc);
    /* 出水总阀 V0（v12：③ 末端管内）：有组反冲时自动关闭（停水反冲） */
    var vw0A = Math.max(7, VALVE_W * sc), vh0A = Math.max(7, VALVE_W * sc * 0.8);
    var v0u = ox + u(x1o - 40, d.yOut) * sc, v0v = oy + v(x1o - 40, d.yOut, d.zPort) * sc;
    o += v0Valve(v0u - vw0A / 2, v0v - vh0A / 2, vw0A, vh0A, v0Open(c));
    o += txt(p1TagX, p1TagY, 'P1 常闭', 9, C.valveS, 'start', 0, 'fs-tcode');   /* 后画于阀块右侧罐身留白处：不与罐描边线交叠 */
    /* 管端堵头（v17）：① 末端（右端死头）与 ③ 上游端（左端死头）——等轴测斜向短板，垂直于管轴；
     * ① 左端=进水来向、③ 右端=V0 出水去向、② 左端=排污排向，均接走不设堵头 */
    var axDx = 0.866, axDy = 0.5;   /* +x 世界方向在轴测屏幕上的单位方向（0.866, 0.5） */
    o += axoCap(X(x1, d.yIn) + axDx * 1.2, Y(x1, d.yIn, d.zInTop) + axDy * 1.2, axDx, axDy,
      Math.max(3, c.dnIn * sc) + 5, C.in, 'axoIn');
    o += axoCap(X(x0, d.yOut) - axDx * 1.2, Y(x0, d.yOut, d.zPort) - axDy * 1.2, axDx, axDy,
      Math.max(3, c.dnOut * sc) + 5, C.out, 'axoOut');

    o += txt(X(x0, d.yIn) - 6, Y(x0, d.yIn, d.zInTop), '① 进水总管（+' + mm(d.zInTop) + '）· DN' + c.dnIn, 11, C.in, 'end');
    o += txt(X(x1, d.yOut) + 6, Y(x1, d.yOut, d.zPort) + 12, '③ 出水总管', 11, C.out, 'start');
    o += txt(X(x1, d.yIn) + 6, Y(x1, d.yIn, d.zWs) - 6, '② 排污总管', 11, C.ws, 'start');   /* v48：括号说明删除（用户批注） */
    o += txt(14, 18, '轴测 · 进水阀 V（立管）+ 排污阀 P（节点下·常闭·直落 ②）· G1=V1/P1…G4=V4/P4 · 支管平接罐后口（与③同高）', 11, C.txt3, 'start');

    /* ★ v99 压力表：轴测里挂点只取**远离罐体的空角** —— PG1 靠 ① 左端（上游）、
       PG2 落在 ③ 那一带的空档；短管一律朝屏幕正上/正下，与其余三视图同观感。
       最后画 ⇒ 永远压在管带/罐体之上，不会被遮。
       挂点沿 ①③ 管轴按定比铺候选（轴测里沿轴走 = 屏幕朝 (0.866, 0.5) 走，
       离轴距离恒定 ⇒ 择优选位不会把表带离管子）；具体落在哪由 pickGauges() 现选。 */
    var hwInA = Math.max(3, c.dnIn * sc) / 2, hwOutA = Math.max(3, c.dnOut * sc) / 2;
    /* ★ v103：**首选**挂**加长段**（PG1 [x0i, x0]、PG2 [x1, x1o]）方向朝上（PG2 原为正下）；
       ★ v103b 兜底 = v99 原全管长候选（fb1A/fb2A；v105b 由 g1F/g2F 改名，避免与旧静态挂点 mustNot 契约撞名），极端参数下加长段没干净空档时自动落回。 */
    var g1A = [0.30, 0.50, 0.70].map(function (f) { return x0i + (x0 - x0i) * f; });
    var g2A = [0.30, 0.50, 0.70].map(function (f) { return x1 + (x1o - x1) * f; });
    var fb1A = [0.02, 0.14, 0.28, 0.44, 0.62].map(function (f) { return x0 + (x1 - x0) * f; });
    var fb2A = [0.50, 0.34, 0.66, 0.20, 0.80].map(function (f) { return x0 + (x1 - x0) * f; });
    /* ★ v108：首选候选扩容 —— 3 挂点 × 标号(u/r/l) = 9 个正上候选 + 加长段斜上 6 个（标号 r/l），
       高位罐/粗管等参数下加长段正上被罐体斜投影/文字擦碰时有变体可绕，尽量避免落到朝下兜底
       （2026-09-22 用户批注「压力表方向应朝上」；契约 _p1/_verify_fs_gauge_dir_v108.cjs）。 */
    o += gaugeP('axo:in', gaugeCands(
      g1A.map(function (t) { return [X(t, d.yIn), Y(t, d.yIn, d.zInTop) - hwInA]; }),
      [[0, -G_OFF]], ['u', 'r', 'l'])
      .concat(gaugeCands(
      g1A.map(function (t) { return [X(t, d.yIn), Y(t, d.yIn, d.zInTop) - hwInA]; }),
      [[-G_OFF * 0.71, -G_OFF * 0.71]], ['r', 'l']))
      .concat(gaugeCands(
      fb1A.map(function (t) { return [X(t, d.yIn), Y(t, d.yIn, d.zInTop) - hwInA]; }),
      [[0, -G_OFF], [-G_OFF, 0], [G_OFF, 0]], ['r', 'u', 'l'])), 'PG1', C.in);
    o += gaugeP('axo:out', gaugeCands(
      g2A.map(function (t) { return [X(t, d.yOut), Y(t, d.yOut, d.zPort) - hwOutA]; }),
      [[0, -G_OFF]], ['u', 'r', 'l'])
      .concat(gaugeCands(
      g2A.map(function (t) { return [X(t, d.yOut), Y(t, d.yOut, d.zPort) - hwOutA]; }),
      [[-G_OFF * 0.71, -G_OFF * 0.71]], ['r', 'l']))
      .concat(gaugeCands(
      fb2A.map(function (t) { return [X(t, d.yOut), Y(t, d.yOut, d.zPort) + hwOutA]; }),
      [[0, G_OFF], [-G_OFF * 0.71, G_OFF * 0.71], [G_OFF, 0]], ['r', 'd', 'l'])), 'PG2', C.out);
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
    var LWA = lwRunA(c);   /* ★ v92：节点 → ② 的竖直排污立管长（= 生效的「排污支管长」） */
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
        val: sg(d.zWs) + ' / +' + mm(d.zBot) + ' / +' + mm(d.zPort) + ' / +' + mm(d.zTop) + ' / +' + mm(d.zInTop), cls: '' },
      /* ★ v92：把「排污支管长」在方式一里的实际作用显性化 —— 它就是节点 → ② 的竖直排污立管长，
         ② 管中标高 = 节点(+罐口 120) − 参数值。手动态才可能与默认不同，故同时标出自动/手动。
         cls：② 落到地面以下亮红（bad）、架空亮黄（warn）、贴地不着色。 */
      { id: 'wrunA', label: '排污立管长（节点 → ② 直落）',
        val: LWA + ' mm（' + (LWA / 1000).toFixed(2) + ' m）· ② 管中 ' + sg(d.zWs) + '（' + wsPosWord(d.zWs) + '）· ' +
          (c.wRunAuto ? '自动＝节点至' + wsPosWord(d.zWs) : '手动指定'),
        cls: d.zWs < 0 ? 'bad' : ((d.zWs > Z_WASTE + 0.5) ? 'warn' : '') },
      { id: 'loss', label: '过滤与阀门损失（本页设定）', val: f(c.loss, 1) + ' m', cls: '' },
      { id: 'lossref', label: '过滤损失参考区间', val: '清洁 2~3 m · 需反冲洗 5~7 m（行业经验，待校正）', cls: '' }
    ];
    if (k.nDump > 0) rows.push({ id: 'dumpwarn', label: '⚠ 直排短路警告', val: '有组 V 与 P 同开：进水不经过滤直接排入 ②，请关闭该组 P', cls: 'bad' });
    if (k.nBW > 0 && k.act === 0) rows.push({ id: 'noflow', label: '⚠ 无净水来源', val: '没有组在过滤，③ 内无净水，反冲洗实际无水流', cls: 'bad' });
    if (k.nOff > 0 && k.nDump === 0 && k.nBW === 0) rows.push({ id: 'offnote', label: '隔离组', val: k.nOff + ' 组 V/P 均关（未参与过滤）', cls: 'warn' });
    return rows;
  }

  /* ================= 方式二（接法 B）· 四视图渲染 + 选型计算（v80） =================
   * 下面五个 ...B 函数是上方同名函数的**整份复制**（本轮第一版），因此输出方式与方式一
   * 逐字符相同 —— 这一点由 _p1/_filtersys_mode_e2e.cjs 直接断言
   *（A、B 两版的四张 SVG 与选型计算行必须全等，用以证明拷贝没有笔误）。
   *
   * ★ 后续约定：将来要在方式二里改「排污管 ② / 给水管 ① 的安装接法」，
   *   只改本区的 B 函数，上方原版（方式一）一个字都不动。
   *   两种方式共用同一份参数 cfg，各自没有独立存档。
   */
  var RENDER_A = { top: renderTop, front: renderFront, side: renderSide, axo: renderAxo };
  var RENDER_B = { top: renderTopB, front: renderFrontB, side: renderSideB, axo: renderAxoB };


  function renderTopB(c) {
    var d = der(c), mg = Math.max(220, c.od * 1.2);
    /* ★ v82：朝后伸出的排污管必须装进视口（俯视「上=后」）—— 原 ymax 只到 yIn+340，
       LWB=540 的管段会被裁掉。改用只在后侧留余量的 mapTopB。 */
    var LWB = lwRunB(c);
    var M = mapTopB(c, d, mg, LWB), X = M.X, Y = M.Y, sc = M.sc;
    var x0 = -200, x1 = (c.n - 1) * c.s + 120;
    var xE = Math.max(0, c.mainExt || 0), x0i = x0 - xE, x1o = x1 + xE;   /* ★ v102：① 进水端=x0i（向左）、③ 出水端=x1o（向右）；③ 左端与 ② 不动 */   /* v29：右端延伸 200→120——为出水箭头/文字再右移腾出视界空间（整组右端元素随 x1 左移，V0/堵头相对关系不变） */
    var o = DEFS;

    /* ★ v84（方式二）：② 排污主管 —— 把各组「朝后水平排污支管」的末端横向串成**一根总管**
       （与 ③ 出水总管同理：各机组出水支管汇入一根 ③）。位置 = 各支管末端平面 y = yIn + LWB，
       标高 = 支管层 zPort（v83 定的层），口径沿用 dnWs（与方式一 ② 总管同口径）。
       先画主管，组循环里的支管与接口件再压上去。（方式一仍用贴地 ② 总管，不动。） */
    o += pipeTag(pipe(X(x0), Y(d.yIn + LWB), X(x1), Y(d.yIn + LWB), C.ws, C.wsL, c.dnWs, sc), 'topWsMainB');
    /* ③ 出水总管（前） */
    o += pipe(X(x0), Y(d.yOut), X(x1o), Y(d.yOut), C.out, C.outL, c.dnOut, sc);
    /* ① 进水总管（后，唯一进水总管）——横向总管上不放活接图示（v18 用户定：快接只在支管上） */
    o += pipe(X(x0i), Y(d.yIn), X(x1), Y(d.yIn), C.in, C.inL, c.dnIn, sc);

    var msT = modes(c);
    for (var j = 0; j < c.n; j++) {
      var gx = j * c.s, mT = msT[j], bw = (mT === 'backwash' || mT === 'dump');
      /* 接驳支管：汇流节点 → 罐后缘 平接（+zPort，与③同高，不装阀） */
      o += line(X(gx), Y(c.od / 2), X(gx), Y(d.yIn), C.inL, Math.max(2, c.dnBr * sc));
      /* 汇流节点（支管沿Y + ①上竖管沿Z 交汇；正下方接排污立管 P） */
      o += '<circle cx="' + r2(X(gx)) + '" cy="' + r2(Y(d.yIn)) + '" r="2.5" fill="' + C.in + '"/>';
      /* ★ v82/v83：方式二排污管 —— 节点 → 朝后（俯视向上）水平伸出 LWB，末端为排污口断面圆。
         管中标高 = **支管层 zPort**（v83 抬到与接驳支管同层；俯视是平面图看不出标高，
         侧视/前视/轴测上体现「一条水平直通线」）；P1 阀挂在这段水平管中段。 */
      o += pipe(X(gx), Y(d.yIn), X(gx), Y(d.yIn + LWB), C.ws, C.wsL, c.dnWs, sc);
      /* ★ v84：支管末端不再各自开「排污口」—— 改为**接入 ② 排污主管**（接口三通箍块） */
      var wrB = Math.max(4, c.dnWs / 2 * sc);
      o += '<rect data-fs-out="topWsTeeB' + j + '" x="' + r2(X(gx) - wrB * 0.78) +
        '" y="' + r2(Y(d.yIn + LWB) - wrB * 0.78) + '" width="' + r2(wrB * 1.56) +
        '" height="' + r2(wrB * 1.56) + '" rx="2" fill="' + C.fit + '" stroke="' + C.fitS +
        '" stroke-width="1"><title>G' + (j + 1) + ' 排污支管接入 ② 排污主管</title></rect>';
      var yPB = Y(d.yIn + LWB * 0.5);
      o += '<rect x="' + r2(X(gx) - wrB * 1.15) + '" y="' + r2(yPB - wrB * 1.15) + '" width="' + r2(wrB * 2.3) +
        '" height="' + r2(wrB * 2.3) + '" rx="2" class="fs-valve" data-fs-valve="' + j + ':p" cursor="pointer" fill="' +
        (bw ? C.valve : '#FFFFFF') + '" stroke="' + (bw ? C.valveS : C.fitS) + '" stroke-width="1">' +
        '<title>P' + (j + 1) + ' 排污阀（方式二 · 朝后水平段中段，常闭）</title></rect>';
      if (!bw) o += line(X(gx) - wrB * 1.15 + 1.2, yPB + wrB * 1.15 - 1.5,
        X(gx) + wrB * 1.15 - 1.2, yPB - wrB * 1.15 + 1.5, C.fitS, 1.3);
      /* 前支管：罐前缘 → ③ */
      o += line(X(gx), Y(-c.od / 2), X(gx), Y(d.yOut), C.outL, Math.max(2, c.dnBr * sc));
      /* 管件表达：罐前/后口接头 + ③ 三通口箍（v33：改画在罐圆之前——罐圆完整可见，接头仅外侧探出圆缘；③ 三通口在管上不受影响） */
      var pbw = Math.max(2, c.dnBr * sc), pow = Math.max(3, c.dnOut * sc);
      o += fitRect(X(gx) - pbw * 0.65, Y(c.od / 2) - pbw * 0.65, pbw * 1.3, pbw * 1.3, 2);   /* 罐后口接头 */
      o += fitRect(X(gx) - pbw * 0.65, Y(-c.od / 2) - pbw * 0.65, pbw * 1.3, pbw * 1.3, 2);  /* 罐前口接头 */
      o += fitRect(X(gx) - pow * 0.65, Y(d.yOut) - pbw * 0.65, pow * 1.3, pbw * 1.3, 2);     /* ③ 三通口 */
      /* 罐（俯视为圆）——v33：后画，盖住接头内侧半段，圆形显示完整更美观 */
      o += '<circle cx="' + r2(X(gx)) + '" cy="' + r2(Y(0)) + '" r="' + r2(c.od / 2 * sc) +
        '" fill="' + (bw ? C.bwF : C.tank) + '" stroke="' + (bw ? C.bw : C.tankS) + '" stroke-width="1.1"/>';
      o += '<circle cx="' + r2(X(gx)) + '" cy="' + r2(Y(0)) + '" r="' + r2(Math.max(3, (c.od / 2 - 45) * sc)) +
        '" fill="none" stroke="' + (bw ? C.bwL : C.ghost) + '" stroke-width="0.8" stroke-dasharray="3 3"/>';
      /* 阀位：进水阀 V + 排污阀 P 同在节点竖管上，俯视投影重合 → 画一块（先垫管件箍座，阀块坐于其上） */
      var rw = Math.max(3, c.dnIn * sc) * 1.3;
      o += '<rect x="' + r2(X(gx) - rw / 2) + '" y="' + r2(Y(d.yIn) - rw / 2) + '" width="' + r2(rw) + '" height="' + r2(rw) +
        '" rx="3" fill="' + C.fit + '" stroke="' + C.fitS + '" stroke-width="1"/>';
      o += fitShine(X(gx) - rw / 2 + 2.5, Y(d.yIn) - rw / 2 + 3, X(gx) + rw / 2 - 2.5, Y(d.yIn) - rw / 2 + 3);
      /* 支管快捷接头（v25 沟槽卡箍式）：前后两根支管 37.5% 处各一只——对卡两半壳+唇边+中缝+螺栓，
         拆开快接即可整体抽出罐体检修；37.5%（原 40%）+ 块高 14 是为避开 V 阀座上缘 189.8mm（块带 136.4~183.6mm，净空 6.2mm） */
      var qcW = Math.max(12, pbw + 14), qcH = 14;
      var yQb = Y(c.od / 2) + (Y(d.yIn) - Y(c.od / 2)) * 0.375;
      var yQf = Y(-c.od / 2) + (Y(d.yOut) - Y(-c.od / 2)) * 0.375;
      o += grooveCoupling(X(gx), yQb, qcH, qcW, 'v', 'br' + j, 'G' + (j + 1) + ' 后支管沟槽卡箍快接 · 对卡两半壳+螺栓紧固 · 拆开可整体抽出罐体检修');
      o += grooveCoupling(X(gx), yQf, qcH, qcW, 'v', 'bf' + j, 'G' + (j + 1) + ' 前支管沟槽卡箍快接 · 拆开可整体抽出罐体检修');
      if (j === c.n - 1) o += txt(X(gx) + qcW / 2 + 9, yQb + 3, '沟槽快接', 9, C.fitS, 'start');   /* v58：右移到末组（G6）卡箍右侧行尾空白——原 j===0 处文字压在 G2 卡箍上（用户 2026-09-19 指令） */
      var vw = Math.max(7, VALVE_W * sc), vh = Math.max(6, VALVE_W * sc * 0.7);
      var modeTxt = { filter: '过滤', backwash: '反冲洗', dump: '直排短路', off: '隔离' }[mT];
      var vFill = (mT === 'filter') ? C.valve : (bw ? C.bw : '#FFFFFF');
      var vStrk = (mT === 'off') ? C.fitS : (bw ? C.bw : C.valveS);
      o += '<rect x="' + r2(X(gx) - vw / 2) + '" y="' + r2(Y(d.yIn) - vh / 2) + '" width="' + r2(vw) + '" height="' + r2(vh) +
        '" rx="2" class="fs-valve" data-fs-valve="' + j + ':cycle" cursor="pointer" fill="' + vFill + '" stroke="' + vStrk +
        '" stroke-width="1"><title>G' + (j + 1) + ' 阀组 · ' + modeTxt + '（点击切换：过滤→反冲→隔离→直排）</title></rect>';
      if (mT === 'off') o += line(X(gx) - vw / 2 + 1, Y(d.yIn) + vh / 2 - 1, X(gx) + vw / 2 - 1, Y(d.yIn) - vh / 2 + 1, C.fitS, 1.2);
      /* 俯视图：只给第 1 组引注阀位（其余组构造相同：G2=V2/P2、G3=V3/P3、G4=V4/P4）；锚在箍座左缘之外 */
      if (j === 0) {
        o += txt(X(gx) - rw / 2 - 4, Y(d.yIn) - 2, 'V1', 10, C.valveS, 'end');
        /* v82：P1 已随排污管挪到朝后水平段上（见上方的阀块），节点处不再标注 P1 */
        o += txt(X(gx) + wrB + 6, Y(d.yIn + LWB * 0.5) + 3, 'P1', 10, C.valveS, 'start');
      }
      o += txt(X(gx), Y(0) + 4, 'G' + (j + 1), 11, bw ? C.bw : C.txt3, 'middle', bw ? 700 : 400);
    }

    /* 水流方向层（动画虚线）：按各组阀态推导 ①③② 与每组支管有否流动及方向 */
    var hasV = false, hasF = false, hasW = false;
    msT.forEach(function (m) {
      if (m === 'filter') { hasV = true; hasF = true; }
      else if (m === 'backwash') { hasW = true; }
      else if (m === 'dump') { hasV = true; hasW = true; }
    });
    if (hasV) o += flow(X(x0i), Y(d.yIn), X(x1), Y(d.yIn), C.in);
    var v0o = v0Open(c);
    if (hasF) o += flow(X(x0), Y(d.yOut), X(x1o), Y(d.yOut), C.out);            /* ③ 管内通长流（V0 在管端外延伸段，不占管内） */
    if (hasW) o += flow(X(x0), Y(d.yIn + LWB), X(x1), Y(d.yIn + LWB), C.ws);   /* v84：② 排污主管内通长流（各组支管汇入后向右送走） */
    if (hasF && v0o) o += '<line x1="' + r2(X(x1o)) + '" y1="' + r2(Y(d.yOut)) + '" x2="' + r2(X(x1o + 80)) +
      '" y2="' + r2(Y(d.yOut)) + '" class="fs-flow" data-fs-ext="1" stroke="' + C.out +
      '" stroke-width="2.2" stroke-linecap="round"/>';                          /* V0 开：延伸段有水流出（data-fs-ext 供闸门断言） */
    /* v82：贴地 ② 总管已取消 ⇒ 不再有「沿 ② 反向排出」的整条流线；
       排污水流改为「每组沿朝后水平管向后流」，在下面组循环里逐组画。 */
    for (var j2 = 0; j2 < c.n; j2++) {
      var gx2 = j2 * c.s, m2t = msT[j2];
      if (m2t === 'filter') {
        o += flow(X(gx2), Y(d.yIn), X(gx2), Y(c.od / 2), C.in);          /* 节点 → 罐后口 */
        o += flow(X(gx2), Y(-c.od / 2), X(gx2), Y(d.yOut), C.out);       /* 罐前口 → ③ */
      } else if (m2t === 'backwash') {
        o += flow(X(gx2), Y(d.yOut), X(gx2), Y(-c.od / 2), C.out);       /* ③ → 罐前口（净水倒行入罐） */
        o += flow(X(gx2), Y(c.od / 2), X(gx2), Y(d.yIn), C.ws);          /* 罐后口 → 节点 */
      }
      /* v82：排污流向 = 节点 → 朝后水平段（俯视向上），逐组各流各的 */
      if (m2t === 'backwash' || m2t === 'dump') {
        o += flow(X(gx2), Y(d.yIn), X(gx2), Y(d.yIn + LWB), C.ws, m2t === 'dump');
      }
    }

    /* 出水总阀 V0（v16：移到 ③ 管端**外侧**延伸短管上，不再与 G 末组三通口重叠）
     * 右端一律用世界坐标偏移（随缩放自适应，n=6 最紧时也不出界）；出水箭头指向外（v16 修正反向）。 */
    var vw0 = Math.max(7, VALVE_W * sc), vh0 = Math.max(6, VALVE_W * sc * 0.7);
    o += line(X(x1o), Y(d.yOut), X(x1o + 80), Y(d.yOut), C.out, Math.max(3, c.dnOut * sc));
    o += v0Valve(X(x1o + 12), Y(d.yOut) - vh0 / 2, vw0, vh0, v0o);
    o += txt(X(x1o + 12) + vw0 / 2, Y(d.yOut) + vh0 / 2 + 11, 'V0', 10, C.valveS, 'middle');
    o += arrow(X(x1o + 190), Y(d.yOut), X(x1o + 222), Y(d.yOut), C.out, 1.6);   /* v29：随 ext 缩短再右移（空隙 150→190mm；n=6 箭头头距右缘 15px） */
    o += txt(X(x1o + 218), Y(d.yOut) - 12, '出水', 12, C.out, 'end');   /* end 锚压箭头上方：n=6 字形右缘 663.5 距右缘 680 净空 16px */

    /* 管端堵头（v17）：① 末端（末组之后死头）与 ③ 上游端（首组之前死头）为盲板端盖；
     * ① 左端=进水来向、③ 右端=V0 出水去向、② 左端=排污排向，均接走不设堵头 */
    o += endCapV(X(x1) + 1, Y(d.yIn), Math.max(3, c.dnIn * sc) + 5, C.in, 'topIn');
    o += endCapV(X(x0) - 1, Y(d.yOut), Math.max(3, c.dnOut * sc) + 5, C.out, 'topOut');

    /* 流向箭头（v22：整体移到管端外侧、与管道脱开——进水箭头指向管但不压管） */
    o += arrow(X(x0i) - 42, Y(d.yIn), X(x0i) - 16, Y(d.yIn), C.in, 1.6);
    o += txt(X(x0i) - 29, Y(d.yIn) - 10, '进水', 12, C.in, 'middle');
    /* 「出水」箭头已在上方随 V0 画（指向外）；排污不另设右端引注：② 与 ① 俯视重合 */

    /* 尺寸与注记 */
    /* 罐径 OD 标注已按用户要求取消（v27）：「过滤器 OD200 这种文字不标注」——几何参数不再上图，S=400 保留 */
    /* v82b：S 尺寸线原在 ① 线之上，方式二那里整片被「朝后伸出」的排污管占住 ⇒ 移到管端之上。
       v84：管端之上现在又多了 ② 排污主管管带（半宽 ≈ dnWs·sc/2）⇒ 再上移到 -26px。 */
    o += dimH(X(0), X(c.s), Y(d.yIn + LWB) - 26, 'S=' + c.s, 1);
    /* v51：W 标注固定屏幕 y=352（v47 的 372 上移 20px，与图形拉近）——两行总管文字仍在其下方 */
    o += dimH(X(-c.od / 2), X((c.n - 1) * c.s + c.od / 2), 352,
      '总宽 W = ' + (c.n - 1) + 'S + OD = ' + d.W + ' mm', -1);   /* v57：图形在上 */
    o += dimV(X(x0i) - 64, Y(d.yIn), Y(d.yOut), '2Δ=' + (2 * c.delta), 1);   /* v57：图形在右 */   /* v22：左移让位进水箭头 */
    o += txt(X(x0), 388, '② 排污主管（方式二）：各组支管朝后水平 ' + LWB + ' mm 汇入 · 管中 +' + mm(d.zPort) +
      ' · DN' + c.dnWs, 11, C.ws, 'start');   /* v83：标高随支管层；本行已贴近画布宽，别再往里加字（实测加 7 字即溢出 680） */   /* v47：移到 W 标注下方；v51 上移 20px */
    o += txt(X(x0), 372, '③ 出水总管（前 · +' + mm(d.zPort) + '）  ·  DN' + c.dnOut, 11, C.out, 'start');   /* v47：移到 W 标注下方；v51 上移 20px */
    /* ① 标注（v21）：移到右端管上方避开左端 S/OD 尺寸文字；排污立管说明并入 ② 行 */
    /* v82b：① 标注原在 ① 线之上（方式二被新管段压住）⇒ 移到末组右侧的空角（管段够不到那里） */
    o += txt(X(x1) + 8, Y(d.yIn) - 12, '① 进水总管（+' + mm(d.zInTop) + '）· DN' + c.dnIn, 11, C.in, 'start');

    /* ★ v99 压力表 → ★ v103（2026-09-22 用户批注）：**首选** = 方向朝上（同 PG1）+ 挂**加长段**——
       PG1 首选 ① 进水端加长段 [x0i, x0]、PG2 首选 ③ 出水端加长段 [x1, x1o]；
       段内按屏幕步距铺候选（mainExt=0 时三点重合于管端，行为确定）。
       ★ v103b 兜底 = v99 原全管长 × 多方向候选（A_TIN/A_TOUT）：极端参数（n2 紧 Δ150 / n6 S250 /
       dn315）下加长段上方没有干净空档时，择优自动落回原位 —— 宁可方向不一致也不压字/压管件。
       恒有 PG1.x < PG2.x（主闸门「进水表在上游侧」断言）在任何 n/S/Δ 下都成立。 */
    var hwInT = Math.max(3, c.dnIn * sc) / 2, hwOutT = Math.max(3, c.dnOut * sc) / 2;
    var xP2T = (c.n - 2) * c.s + c.s / 2;
    var p2UpT = (c.delta - c.od / 2) * sc >= 58;
    var UP_IN_T = [[-hwInT, 0, -G_OFF, 'u']];
    var UP_OUT_T = [[-hwOutT, 0, -G_OFF, 'u']];
    /* PG1 兜底臂：① 后缘朝后 → 朝左（上游）→ 前缘朝前 / 带内朝左（v99 原顺序）。PG2 兜底：按 v90 分档。 */
    var A_TIN = [
      [-hwInT, 0, -G_OFF, 'u'], [-hwInT, 0, -G_OFF, 'r'], [-hwInT, -G_OFF, 0, 'l'],
      [hwInT, 0, G_OFF, 'd'], [hwInT, 0, G_OFF, 'r'], [hwInT, -G_OFF, 0, 'l'],
      [6, 0, G_OFF, 'd'], [0, 0, -G_OFF, 'r']
    ];
    var A_TOUT = p2UpT ? [
      [-hwOutT, 0, -G_OFF, 'r'], [-hwOutT, 0, -G_OFF, 'd'], [-hwOutT, -G_OFF, 0, 'l'],
      [hwOutT, 0, G_OFF, 'r'], [hwOutT, -G_OFF, 0, 'l'], [hwOutT, 0, G_OFF, 'd']
    ] : [
      [hwOutT, 0, G_OFF, 'r'], [hwOutT, 0, G_OFF, 'd'], [hwOutT, -G_OFF, 0, 'l'],
      [-hwOutT, 0, -G_OFF, 'r'], [-hwOutT, -G_OFF, 0, 'l'], [-hwOutT, 0, -G_OFF, 'd']
    ];
    o += gaugeP('top:in', segCands(X(x0i), X(x0), 30, Y(d.yIn), UP_IN_T).concat(segCands(X(x0) + 10, X(xP2T) - 40, 30, Y(d.yIn), A_TIN)), 'PG1', C.in);
    o += gaugeP('top:out', segCands(X(x1), X(x1o), 30, Y(d.yOut), UP_OUT_T).concat(segCands(X(xP2T) + 14, X(x1) - 10, 30, Y(d.yOut), A_TOUT)), 'PG2', C.out);
    o += txt(VW - 14, 18, '俯视 · 上=后 / 下=前', 11, C.txt3, 'end');
    return o;
  }


  function renderFrontB(c) {
    var d = der(c), mg = Math.max(260, c.od * 1.3);
    var LWB = lwRunB(c);   /* v82：朝后伸出长度（自动/手动由 lwRunB 决定） */
    var extF = Math.max(0, c.mainExt || 0);   /* ★ v102：①左/③右 各加长 extF ⇒ 视口同步外扩 */
    var hmin = -c.od / 2 - mg - extF, hmax = (c.n - 1) * c.s + c.od / 2 + mg + extF;
    var M = mapElev(hmin, hmax, Math.min(-120, d.zWs - 160)   /* ★ v92：zmin 让位给可能下移的 ②（160mm < 180mm ⇒ 默认仍 -120、逐像素不变；极端参数下约 17px 余量够放 ② 圆与标注） */, Math.max(d.zTop + 320, d.zInTop + 300), 16, false);   /* v38：上界按 zInTop 兜底（H=600 时顶部说明贴 ① 管带） */   /* v32：zmax 220→320——虚拟顶加高使图形整体下移，顶部说明(y=18)与 ① 管线/标高脱开（原几乎叠着） */
    var X = M.X, Y = M.Y, sc = M.sc;
    var h0 = -120, h1 = (c.n - 1) * c.s + 120;
    var hE = Math.max(0, c.mainExt || 0), h0i = h0 - hE, h1o = h1 + hE;   /* ★ v102：① 左端=h0i、③ 右端=h1o（③ 左端、② 不动） */
    var o = DEFS;

    /* 地面线 */
    o += line(X(hmin), Y(0), X(hmax), Y(0), C.dim, 1.2);
    /* ★ v82（方式二）：贴地 ② 排污总管不再画（各机组朝后直排）。 */
    /* ③ 出水总管 +0.720（接驳支管与罐口同高，位于罐后不另画通长线） */
    o += pipe(X(h0), Y(d.zPort), X(h1o), Y(d.zPort), C.out, C.outL, c.dnOut, sc);
    /* ①上 进水总管（虚线，位于罐体之后）——横向总管上不放活接图示（v18） */
    o += line(X(h0i), Y(d.zInTop), X(h1), Y(d.zInTop), C.in, Math.max(1.6, c.dnIn * sc * 0.5), '7 5');
    /* ★ v84（方式二）：② 排污主管 —— 本视向（沿 y 看）它与 ③ 出水总管**同标高(zPort)、同 x 跨度**
       ⇒ 真实投影完全重合。按本项目「位于罐后的管画虚线」的既有约定（① 亦然），② 画红虚线压在
       ③ 之上；两条线重合正说明「②③ 同层」，不是画错。 */
    o += pipeTag(pipe(X(h0), Y(d.zPort), X(h1), Y(d.zPort), C.ws, C.wsL, c.dnWs, sc, '7 5'), 'frontWsMainB');

    var msF = modes(c);
    for (var i = 0; i < c.n; i++) {
      var cx = i * c.s, mF = msF[i], bw = (mF === 'backwash' || mF === 'dump');
      /* 罐体 */
      o += '<rect x="' + r2(X(cx - c.od / 2)) + '" y="' + r2(Y(d.zTop)) + '" width="' + r2(c.od * sc) +
        '" height="' + r2(c.h * sc) + '" fill="' + (bw ? C.bwF : C.tank) +
        '" stroke="' + (bw ? C.bw : C.tankS) + '" stroke-width="1.1"/>';
      /* 卡箍（罐底金属箍） */
      o += '<rect x="' + r2(X(cx - c.od / 2)) + '" y="' + r2(Y(d.zBot + 46)) + '" width="' + r2(c.od * sc) +
        '" height="' + r2(46 * sc) + '" fill="none" stroke="' + C.ghost + '" stroke-width="1"/>';
      /* 罐顶排气阀 ⑥ */
      var vx = c.od * 0.16;
      o += '<rect x="' + r2(X(cx) - vx * sc) + '" y="' + r2(Y(d.zTop) - 60 * sc) + '" width="' + r2(2 * vx * sc) +
        '" height="' + r2(60 * sc) + '" fill="' + (bw ? C.bwF : C.tank) +
        '" stroke="' + (bw ? C.bw : C.tankS) + '" stroke-width="0.8"/>';
      if (i === 0) o += txt(X(cx) + vx * sc + 5, Y(d.zTop) - 60 * sc + 11, '⑥ 排气', 10, C.txt3, 'start');
      /* ★ v82/v83（方式二）：排污管自节点（zPort）直接折向**朝后水平**，本视向与管轴重合
         ⇒ 真实投影就是一个断面圆（在罐体之后被遮 ⇒ 虚线）。v83 抬到支管层后，这个圆正好
         落在 ③ 管线的高度上 —— 真实投影如此（烟囱式重合），不是画错。竖直隐管随之取消。 */
      var rwF = Math.max(4, c.dnWs / 2 * sc);
      /* ★ v84：这个圆 = 该组排污支管的断面（管轴沿本视向）——已接入 ② 排污主管 ⇒ 由「排污口」改称接入点 */
      o += '<circle data-fs-out="frontWsTeeB' + i + '" cx="' + r2(X(cx)) + '" cy="' + r2(Y(d.zPort)) +
        '" r="' + r2(rwF) + '" fill="' + C.wsF + '" stroke="' + C.ws + '" stroke-width="1.2" stroke-dasharray="4 3"/>';
      /* v82b：行内长标注会横穿罐体/卡箍（实测 6 处压实体）⇒ 只在首组给个短引注，说明交给脚注。
         v83：引注移到断面圆**上方**，免得正好压在 ③ 管带上。 */
      if (i === 0) o += txt(X(cx) + rwF + 6, Y(d.zPort) - rwF - 3, '接入 ②', 10, C.valveS, 'start');
      var vw = Math.max(8, VALVE_W * sc), vh = Math.max(7, VALVE_W * sc * 0.62);
      /* 组号 */
      o += txt(X(cx), Y(d.zTop) + 16, 'G' + (i + 1), 11, bw ? C.bw : C.txt3, 'middle', bw ? 700 : 400);
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
    if (hasVF) o += flow(X(h0i), Y(d.zInTop), X(h1), Y(d.zInTop), C.in);
    var v0oF = v0Open(c);
    if (hasFF) o += flow(X(h0), Y(d.zPort), v0oF ? X(h1o) : X(h1o) + 14, Y(d.zPort), C.out); /* V0 关：③ 流停在阀前 */
    /* 出水总阀 V0（v12：③ 右端外延短管上）：有组反冲时自动关闭（停水反冲） */
    var vw0F = Math.max(7, VALVE_W * sc), vh0F = Math.max(6, VALVE_W * sc * 0.62);
    var v0xF = X(h1o) + 14;
    o += line(X(h1o), Y(d.zPort), v0xF + vw0F, Y(d.zPort), C.outL, Math.max(2.4, c.dnOut * sc));
    o += v0Valve(v0xF, Y(d.zPort) - vh0F / 2, vw0F, vh0F, v0oF);
    o += txt(v0xF + vw0F / 2, Y(d.zPort) - vh0F / 2 - 4, 'V0', 10, C.valveS, 'middle');
    /* 管端堵头（v17）：① 末端与 ③ 上游端（与顶视/轴测同口径；① 前视为罐后虚线，堵头按虚线宽度收窄） */
    o += endCapV(X(h1) + 1, Y(d.zInTop), Math.max(3, c.dnIn * sc * 0.5) + 5, C.in, 'frontIn');
    o += endCapV(X(h0) - 1, Y(d.zPort), Math.max(3, c.dnOut * sc) + 5, C.out, 'frontOut');
    /* v82：朝后水平段的流向在本视向退化为一个点 ⇒ 不画流线（侧视/顶视/轴测上有） */
    for (var i2 = 0; i2 < c.n; i2++) {
      var cx2 = i2 * c.s, m2f = msF[i2];
      if (m2f === 'filter' || m2f === 'dump') o += flow(X(cx2), Y(d.zInTop), X(cx2), Y(d.zPort), C.in, m2f === 'dump');
      /* v83：排污管已与支管同层 ⇒ 本视向没有竖直段可画（原「zPort → zBot」那条流线取消） */
    }

    /* 尺寸与标高 */
    o += dimH(X(0), X(c.s), Y(d.zTop) - 34, 'S=' + c.s, 1);   /* v57：图形在下 */
    o += dimV(X(hmax) - 26   /* v44：右移 8px 与 V0 阀脱开 */, Y(0), Y(d.zTop), 'H总=' + (c.hm + c.h), -1);   /* v57：图形在左 */
    o += elevMark(X(hmin) + 36   /* v46：再左移 20px 对齐侧视 v40 脱开幅度 */, Y(d.zTop), '+' + mm(d.zTop));
    o += elevMark(X(hmin) + 36   /* v46：再左移 20px 对齐侧视 v40 脱开幅度 */, Y(d.zInTop), '+' + mm(d.zInTop));
    o += elevMark(X(hmin) + 36   /* v46：再左移 20px 对齐侧视 v40 脱开幅度 */, Y(d.zPort), '+' + mm(d.zPort));
    o += elevMark(X(hmin) + 36   /* v46：再左移 20px 对齐侧视 v40 脱开幅度 */, Y(d.zBot), '+' + mm(d.zBot));
    /* v82：贴地 ② 总管已取消 ⇒ 不再保留 +' + mm(d.zWs) + ' 这一层刻度 */
    o += elevMark(X(hmin) + 36   /* v46：再左移 20px 对齐侧视 v40 脱开幅度 */, Y(0), '±0.000');

    /* ★ v99 压力表 → ★ v103（2026-09-22 用户批注）：**首选** = 朝上 + 挂**加长段**——
       PG1 首选 ① 进水端加长段 [h0i, h0]（仍要求 ① 高出罐顶 120mm 才装，理由同前）；
       PG2 首选 ③ 出水端加长段 [h1, h1o]。
       ★ v103b 兜底 = v99 原全管长 × 多方向候选（A_FIN/A_FOUT），极端参数自动落回。 */
    var hwInF = Math.max(1.6, c.dnIn * sc * 0.5) / 2, hwOutF = Math.max(3, c.dnOut * sc) / 2;
    var UP_IN_F = [[-hwInF, 0, -G_OFF, 'u']];
    var UP_OUT_F = [[-hwOutF, 0, -G_OFF, 'u']];
    var A_FIN = [
      [-hwInF, 0, -G_OFF, 'r'], [-hwInF, 0, -G_OFF, 'u'], [-hwInF, -G_OFF, 0, 'l'],
      [-hwInF, G_OFF, 0, 'r'], [hwInF, 0, G_OFF, 'r'], [hwInF, 0, G_OFF, 'd'],
      [-hwInF, 0, -G_OFF, 'l'], [hwInF, -G_OFF, 0, 'l']
    ];
    var A_FOUT = [
      [hwOutF, 0, G_OFF, 'r'], [hwOutF, 0, G_OFF, 'd'], [hwOutF, -G_OFF, 0, 'l'],
      [-hwOutF, 0, -G_OFF, 'r'], [-hwOutF, -G_OFF, 0, 'l'], [hwOutF, G_OFF, 0, 'r']
    ];
    if (d.zInTop >= d.zTop + 120)
      o += gaugeP('front:in', segCands(X(h0i), X(h0), 34, Y(d.zInTop), UP_IN_F).concat(segCands(X(h0) + 10, X(h1) - 10, 34, Y(d.zInTop), A_FIN)), 'PG1', C.in);
    /* ★ v111（2026-09-22 用户批注「PG2 应往右移到总管加长段内」）：h1=(n-1)s+120 可能落在
       罐右缘 (n-1)s+od/2 之内（od=200 时 h1 比罐缘仅靠外 20mm），表盘视觉上压罐右肩。
       首选改挂**罐缘之后**的净加长段，且从净段**中点**起铺（不再从段左缘起铺），段尾 h1o 兜底；
       兜底 A_FOUT 不变。h1v=min(max(h1,罐缘),h1o)：ext 极小时段宽趋 0，与旧候选同点等价。 */
    var h1v = Math.min(Math.max(h1, (c.n - 1) * c.s + c.od / 2), h1o);
    o += gaugeP('front:out', segCands((X(h1v) + X(h1o)) / 2, X(h1o), 34, Y(d.zPort), UP_OUT_F).concat(segCands(X(h0) + 10, X(h1) - 10, 34, Y(d.zPort), A_FOUT)), 'PG2', C.out);
    /* 注释（v21）：移到地面线下方作脚注，不再横穿四只罐体 */
    /* ★ v92：这条 ② 脚注改钉在**地面线**上（Y(0) − 60×sc ≡ 原 Y(d.zWs)+… 在 zWs=60 下逐位相等，
       因 mapElev 的 Y 对 z 是斜率 −sc 的线性函数）⇒ 默认输出不变；方式一里参数把 ② 顶高/压低时
       脚注不再跟着跑、极端值下也就不会被裁。（A/B 两份逐字符相同，B 版 zWs 恒 60 ⇒ 对 B 亦逐位相等。） */
    o += txt(Math.min(X(hmin) + 60, VW - FS_FOOT_W), Y(0) - 60 * sc + 44, '支管/罐口与 ③ 同层 +' + mm(d.zPort) + '（平接）；方式二：各组支管朝后汇入 ② 排污主管（罐后红虚线）', 11, C.txt2, 'start');   /* v82b：缩短至不溢出——原句含"只见断面圆"已并入右上注 */
    o += txt(VW - 14, 18, '前视 · 从前往后看（①路在罐后虚线；② 排污主管沿 x 横穿，与 ③ 同层 ⇒ 投影重合）', 11, C.txt3, 'end');
    return o;
  }


  function renderSideB(c) {
    var d = der(c), mg = Math.max(300, c.od * 1.4);
    /* v81：方式二的排污管朝后水平伸出 LWB —— 必须把 hmax 扩到容得下它，
       否则这段管子画到 680×420 视口之外被裁掉（原 hmax = yIn + mg 只到 yIn+300）。 */
    var LWB = lwRunB(c);                            /* v82：水平段长 = 原立管段长（≈0.44 m），可在左栏调 */
    var hmin = d.yOut - mg, hmax = Math.max(d.yIn + mg, d.yIn + LWB + 120);
    var M = mapElev(hmin, hmax, Math.min(-120, d.zWs - 160)   /* ★ v92：同前视（默认仍是 -120） */, Math.max(d.zTop + 220, d.zInTop + 260), 16, true, 22);   /* v38：上界按 zInTop 兜底（H=600 时 zTop+220 不够） */   /* v28：图形下移 22px——原上空 -4.4px（顶部被裁）/下空 40.5px，均衡后 17.6/18.5 */
    var X = M.X, Y = M.Y, sc = M.sc;
    var m0 = modes(c)[0], bw = (m0 === 'backwash' || m0 === 'dump');
    var o = DEFS;
    var cxc = X(0);

    o += line(X(hmin), Y(0), X(hmax), Y(0), C.dim, 1.2);
    /* v61：三根总管断面圆已移到「水流方向层」之后绘制（原在此处会被随后画的管带盖住） */
    /* ① 断面（v18：翻边外圈已取消——横向总管上不放活接图示） */
    /* ①上 → 汇流节点 立管（进水阀 V1 装立管中段） */
    o += line(X(d.yIn), Y(d.zInTop), X(d.yIn), Y(d.zPort), C.inL, Math.max(2.4, c.dnBr * sc));
    o += '<circle cx="' + r2(X(d.yIn)) + '" cy="' + r2(Y(d.zPort)) + '" r="2.4" fill="' + C.in + '"/>';
    var vwS = Math.max(8, VALVE_W * sc), vhS = Math.max(8, VALVE_W * sc * 0.8);
    o += valveRect(X(d.yIn) - vwS / 2, Y((d.zPort + d.zInTop) / 2) - vhS / 2, vwS, vhS,
      (m0 === 'filter' || m0 === 'dump'), '0:v', 'V1 进水阀（立管中段）');
    o += txt(X(d.yIn) + vwS / 2 + 4, Y((d.zPort + d.zInTop) / 2) + 3, 'V1', 10, C.valveS, 'start');

    /* ★ v81（方式二专属）：排污管接法改变 —— 原「三通下方立管直落 ②」整体旋转 90° 成水平，
       按侧视方位（左=后 / 右=前）**朝后伸出**；三通、过滤器与进出水管一律不动。
         · ★ v83（用户第二轮批注：箭头指的两根管子要**在一个水平高度**）——
           水平段管中标高 zWB = **接驳支管层 zPort**（与罐口/③ 同层）。节点处因此是一条
           水平直通线（左排污 / 右支管），不再有「落到罐底再折向」的那截短竖段；
         · 水平段长 LWB = 原立管段长（zBot − zWs，用户标注 ≈0.44 m）；
         · P1 仍为常闭阀，改装在水平段中段；data-fs-valve 标签保持 '0:p' ⇒ 图上点击/阀表联动不变。 */
    var zWB = d.zPort;
    var xWB0 = X(d.yIn), xWB1 = X(d.yIn + LWB), yWBpx = Y(zWB);
    var wsBandB = Math.max(2.4, c.dnWs * sc * 0.75);
    /* ★ v83：节点已无「下臂 → 罐底」的短竖段（排污管与支管同层，直接由节点朝后）——
       原来这里画的那截竖管连同三通下臂一起去掉，管件改成三臂（见下面管件段）。
       于是 xWB0/xWB1 这条红线与右侧的支管蓝线**共线**，正是用户要的「一个水平高度」。 */
    /* 水平段：自节点朝后（屏幕向左）水平伸出 LWB，末端为排污口 */
    o += line(xWB0, yWBpx, xWB1, yWBpx, bw ? C.ws : C.wsL, wsBandB);
    /* ★ v82（照用户草图）：排污口端头画成**断面圆**（本图例的管端断面画法），不再用盲板端盖。 */
    /* ★ v84：这个圆现在代表**② 排污主管**的断面 —— 主管沿 x 横穿，本视向（沿 x）看就是一个圆，
       位置正好落在各支管末端的 (xWB1, yWBpx)，与「支管朝后伸到主管」的接法一致。 */
    var rwS = Math.max(5, c.dnWs / 2 * sc);
    o += '<circle data-fs-out="sideWsMainB" cx="' + r2(xWB1) + '" cy="' + r2(yWBpx) + '" r="' + r2(rwS) +
      '" fill="' + C.wsF + '" stroke="' + C.ws + '" stroke-width="1.4"/>' +
      '<circle cx="' + r2(xWB1) + '" cy="' + r2(yWBpx) + '" r="' + r2(Math.max(2, rwS * 0.45)) +
      '" fill="none" stroke="' + C.ws + '" stroke-width="0.9"/>';
    var vxMidB = (xWB0 + xWB1) / 2;
    var vwB = Math.max(8, VALVE_W * sc), vhB = Math.max(7, VALVE_W * sc * 0.62);
    var pOpen = (m0 === 'backwash' || m0 === 'dump');
    /* ★ 管轴改成水平后，阀体的长短边必须跟着转 90°：长边（vwB）**跨管**、短边（vhB）沿管轴。
       否则阀宽 20.7 < 管带厚 18.9 的对照会反过来 —— 阀会缩在管带里几乎看不见
       （方式一竖向管上的阀是「长边跨管」，所以看得见；这一点必须一致）。 */
    o += valveRect(vxMidB - vhB / 2, yWBpx - vwB / 2, vhB, vwB, pOpen, '0:p', 'P1 排污阀（水平排污管中段，常闭）');
    /* ★ v81→v83：阀标签位置随「管轴水平化 + 管子抬到支管层」两次重定：
         · 方式一贴阀右侧 —— 那根管子是**竖**的，右侧是空的；管轴转水平后右侧就是管带本身（实测压 35×13px）；
         · v81 放管带下方（yWBpx + 管带半厚 + 20）—— 当时上方只有 ≈14px 空白、且会撞 +0.720 标高；
         · v83 排污管抬到 zPort 后，**原在标注列（x = X(yIn)−44）的 +0.600 罐底标高回到了那一片**
           ⇒ 下方位置反而撞上它（实测 37×10px）。而此刻管带上方的空间已经腾空（zPort 那层的标高符号
           已搬到管端外侧）⇒ 改放**管带上方**：管带外缘 −12px 为基线。 */
    o += txt(vxMidB, yWBpx - wsBandB / 2 - 12, pOpen ? 'P1 开（转至水平）' : 'P1 常闭（转至水平）', 10, C.valveS, 'middle');

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
      '" height="' + r2(c.h * sc) + '" fill="' + (bw ? C.bwF : C.tank) +
      '" stroke="' + (bw ? C.bw : C.tankS) + '" stroke-width="1.1"/>';
    o += line(X(c.od / 2), Y(d.zBot + 46), X(-c.od / 2), Y(d.zBot + 46), C.ghost, 1);

    /* 管件表达：汇流节点三通（圆角 T + 三端法兰）+ 罐口承口套环 + 三处总管接口套环 */
    var nbw = Math.max(2.4, c.dnBr * sc);            /* 支管/立管带宽 */
    var nx = X(d.yIn), ny = Y(d.zPort);
    /* v54：三通比例重塑成 T 形；v56：整体微缩、水平支臂改短（AL 1.6→1.1，用户批注「左侧接支管的接头长了」） */
    var tw = nbw * 1.15, ex = nbw * 0.95, AL = nbw * 1.1, ALb = nbw * 1.1, rT = Math.min(4, nbw * 0.24);
    /* ★ v83：方式二节点 = 三臂（上·①立管 / 右·接驳支管 / **左·朝后排污管**），无下臂。
       三臂等长（ALb = AL）⇒ 左右两根管子看起来就是同一条水平线的两段。 */
    o += '<path d="' + roundedTee3(nx, ny, tw, ex, ALb, AL, nbw * 1.15, rT) +
      '" fill="' + C.fit + '" stroke="' + C.fitS + '" stroke-width="1.4" stroke-linejoin="round"/>';
    o += fitFlange(nx - tw / 2 - 1.8, ny - ex, nx + tw / 2 + 1.8, ny - ex);   /* 上端法兰（①侧） */
    o += fitFlange(nx - ALb, ny - nbw * 0.75 - 1.8, nx - ALb, ny + nbw * 0.75 + 1.8); /* ★ v83 排污臂端法兰（左/朝后） */
    o += fitFlange(nx + AL, ny - nbw * 0.75 - 1.8, nx + AL, ny + nbw * 0.75 + 1.8); /* 支管端法兰 */
    o += fitShine(nx - tw / 2 + tw * 0.26, ny - ex + 3, nx - tw / 2 + tw * 0.26, ny - nbw * 0.6 - 1);
    var cw = nbw * 0.5, ch = nbw * 1.5;               /* 承口套环：厚 cw × 宽 ch（v20：0.62→0.5，给快接腾位） */
    o += fitCollar(X(c.od / 2), Y(d.zPort), cw, ch);              /* 罐后口套环 */
    o += fitCollar(X(-c.od / 2), Y(d.zPort), cw, ch);             /* 罐前口套环（③ 侧） */
    /* 管端接总管的三处连接件 */
    var secIn = Math.max(4, c.dnIn / 2 * sc), secOut = Math.max(4, c.dnOut / 2 * sc), secWs = Math.max(4, c.dnWs / 2 * sc);
    o += fitCollar(X(d.yIn), Y(d.zInTop) + secIn + nbw * 0.28, cw, ch);   /* 立管顶 ↔ ① 断面 */
    o += fitCollar(X(d.yOut) - secOut + nbw * 0.1, Y(d.zPort), cw, ch);   /* 前支管端 ↔ ③ 断面 */
    /* v82：端头改断面圆后不再叠套环（草图里管端就是一个圆，加了反而糊） */
    /* 支管快接（v25 沟槽卡箍式）：前后支管中段各一只——壳+唇边+中缝（侧视紧凑不画螺栓），与顶视同口径 */
    var qcSw = Math.max(8, nbw * 0.45), qcSh = Math.max(10, nbw * 1.3);
    var xQbS = ((nx + AL) + X(c.od / 2)) / 2;                       /* 三通臂法兰 ↔ 罐后口套环 之间 */
    o += grooveCoupling(xQbS, Y(d.zPort), qcSw, qcSh, 'h', 'sideBr', 'G1 后支管沟槽卡箍快接 · 对卡两半壳+螺栓紧固 · 拆开可整体抽出罐体检修');
    var xQfS = (X(-c.od / 2) + (X(d.yOut) - secOut + nbw * 0.1)) / 2; /* 罐前口套环 ↔ ③ 端套环 之间 */
    o += grooveCoupling(xQfS, Y(d.zPort), qcSw, qcSh, 'h', 'sideBf', 'G1 前支管沟槽卡箍快接 · 拆开可整体抽出罐体检修');

    /* 水流方向层（动画虚线，以第 1 组阀态为准；直排亮红） */
    if (m0 === 'filter' || m0 === 'dump') o += flow(X(d.yIn), Y(d.zInTop), X(d.yIn), Y(d.zPort), C.in, m0 === 'dump');
    /* v81→v83：反冲/直排时的水流跟着改道 —— 自节点**直接朝后水平**流向排污口（左）。
       v83 管子抬到支管层后，原先「节点下 → 弯头」那段竖向流向已退化成零长度死线，删除。 */
    if (m0 === 'backwash' || m0 === 'dump') {
      o += flow(xWB0, yWBpx, xWB1, yWBpx, C.ws, m0 === 'dump');
    }
    if (m0 === 'filter') {
      o += flow(X(d.yIn), Y(d.zPort), X(c.od / 2), Y(d.zPort), C.in);      /* 节点 → 罐后口 */
      o += flow(X(-c.od / 2), Y(d.zPort), X(d.yOut), Y(d.zPort), C.out);   /* 罐前口 → ③ */
    } else if (m0 === 'backwash') {
      o += flow(X(d.yOut), Y(d.zPort), X(-c.od / 2), Y(d.zPort), C.out);   /* ③ → 罐前口（净水倒行入罐） */
      o += flow(X(c.od / 2), Y(d.zPort), X(d.yIn), Y(d.zPort), C.ws);      /* 罐后口 → 节点 → 排污 */
    }

    /* v61 图层顺序（用户批注：色块压在圆上不好看，圆应遮挡管道）：
       三根总管断面圆在此绘制 —— 位于 管带(①②③) + 管件 + 水流虚线 之上，圆面遮住管端；
       又位于 标高/文字 之下，圆内注释与刻度仍清晰。
       （唯一能同时看清前后错位与标高链的视图，故保留此三圆） */
    /* v82：方式二不画贴地 ② 排污总管（其断面圆、刻度、套环、文字一并不画） */
    o += '<circle cx="' + r2(X(d.yOut)) + '" cy="' + r2(Y(d.zPort)) + '" r="' + r2(Math.max(4, c.dnOut / 2 * sc)) +
      '" fill="' + C.outF + '" stroke="' + C.out + '" stroke-width="1.4"/>';
    o += '<circle cx="' + r2(X(d.yIn)) + '" cy="' + r2(Y(d.zInTop)) + '" r="' + r2(Math.max(4, c.dnIn / 2 * sc)) +
      '" fill="' + C.inF + '" stroke="' + C.in + '" stroke-width="1.4"/>';

    /* 罐顶排气口 ⑥（侧视/左视为竖管，标出标高链顶端）
       ★ v108：③ 出水标签在净宽不足时升到 PG2 走廊顶之上（见下方 v90/v108 注释），可能与本标注
       同带（高压侧实测压 12.9×12.5）—— 相交则本标注上移 16px 让开（③ 布局参数须提前算）。 */
    var rOut3 = Math.max(4, c.dnOut / 2 * sc), lxL3 = X(-c.od / 2) + 6, lxR3 = X(d.yOut) - rOut3 - 6;
    var cx3 = Math.max(X(d.yOut), X(-c.od / 2) + 46), ty3 = Y(d.zPort) - rOut3 - 48;
    var y6 = Y(d.zTop + 70) + 4;
    if (lxR3 - lxL3 < 82 &&
        cx3 + 40 > cxc + 6 && cx3 - 40 < cxc + 46 &&
        ty3 + 3 > y6 - 8 && ty3 - 12 < y6 + 4) y6 -= 16;
    o += line(cxc, Y(d.zTop), cxc, Y(d.zTop + 70), C.tankS, 2.4);
    o += txt(cxc + 6, y6, '⑥ 排气', 10, C.txt3, 'start');

    o += elevMark(X(d.yIn) - 44   /* v37：标高列贴立管左侧跟随图形；v40：间距 24→44 与图形脱开（用户批注太近） */, Y(d.zTop), '+' + mm(d.zTop));
    o += elevMark(X(d.yIn) - 44   /* v37：标高列贴立管左侧跟随图形；v40：间距 24→44 与图形脱开（用户批注太近） */, Y(d.zInTop), '+' + mm(d.zInTop));
    o += elevMark(/* ★ v83：排污管抬到「支管/③ 层」后，占住了原标注列（x = X(yIn)−44）的这一层 ——
       符号与字样会被压在管带上（v81 实测同类交叠 37×10px）。故把**这一层**的符号挂到管端外侧，
       与下方的 L 尺寸线一起读；数值不变（排污口与支管同层）。 */
      xWB1 - 30, Y(d.zPort), '+' + mm(d.zPort));
    o += elevMark(X(d.yIn) - 44   /* v37/v40：标注列回到罐底这一层（v83 后该层已空出来） */, Y(d.zBot), '+' + mm(d.zBot));
    /* v82：贴地 ② 总管在方式二不画 ⇒ 不再保留 +' + mm(d.zWs) + ' 这一层刻度 */
    o += elevMark(X(d.yIn) - 44   /* v37：标高列贴立管左侧跟随图形；v40：间距 24→44 与图形脱开（用户批注太近） */, Y(0), '±0.000');
    o += txt(X(d.yIn) + 10, Y(d.zInTop) - 20, '①上 进水 +' + mm(d.zInTop), 11, C.in, 'start');
    /* v34：删「汇流节点 +0.720（支管与③同高）」文字标注（用户批注取消） */
    /* ★ v90（用户批注：文字与图形重叠）——「③ 出水」标签移到 ③ 出水总管**上方**。
       原写法 `Y(d.zPort) + 20` 落在管带(sw≈20.7)下沿内侧、右端还顶住 ③ 断面圆：默认几何实测
       压管带 2.0px、压断面圆 5.0×3.3px（用户 hm500 那组更差：3.4px / 5.0×6.7px）；
       实测见 _p1/_probe_outlet_label_before.txt。成因是**两个随参数变的硬约束**把单锚点挤死了：
         · 罐体右缘 = 罐前口 = X(−od/2)          —— od 越大越往右长（od400 时压罐体 6.8px）；
         · ③ 断面圆左缘 = X(yOut) − dnOut/2·sc   —— dnOut 越大越往左伸（od400+dnOut315 净宽仅 56px < 标签 76.1px）。
       故分两档（确定性，无测量歧义）：
         档 1 常规：居中于「罐前口 +6 ~ ③ 断面圆左缘 −6」之间、管轴上方 24px（默认净宽 118.8px ≫ 82px）；
         档 2 空间不足（净宽 < 82px）：x 仍居中于原位（max(X(yOut), X(-od/2)+46) —— 罐体/管带/
               P1 文字均不压，v90 契约全绿原证），**y 升到 PG2 正上候选走廊顶之上**：
               走廊顶 = Y−rOut3−41（挂点→短管 18→标号顶 23），基线取 Y−rOut3−48 留 4px ——
               ★ v108：原 y=Y−max(rOut3+10,24) 时文字带正横穿走廊（ov 28×13.7），会把侧视 PG2
               择优整条逼到朝左（2026-09-22 用户批注「压力表方向应朝上」）；走廊是垂直通道，
               文字悬于其顶不算挡。右对齐方案（end 钉 X(yOut)−20）已试并否决 —— od400 系组
               罐体投影右缘伸到圆心左 ~60px，左移文字压罐体/进水管带（v90 契约 17 项红）。
               Math.max 同时兜住「Δ < od/2」时罐体右缘比 ③ 断面圆更靠右的退化几何。
       契约：_p1/_verify_fs_outlet_label_v90.cjs（9 组参数 × 2 接法：净空 ≥2px、零交叠、零溢出）。 */
    /* ★ v108（2026-09-22 用户批注「压力表安装方向应朝上」）：③ 文字右缘必须让开 PG2 的**正上候选走廊**
       （表盘 r10 + 标号「PG2」半宽 ~11 ⇒ 走廊半宽 13，取圆心左 15px 为界），否则侧视 PG2 择优被
       这行字挡住、整条退路落到朝左（实测默认参数交叠 28×15.1 全横穿走廊，见 _p1/_v108_side_probe.cjs）。
       主分支：中心 cap 到圆心左 56（=15+文字半宽 40+1，实测半宽 38.0；文字仍在 [lxL3,lxR3] 带内只左移）；
       左移后与全图零交叠已由探针预检（movedHits=[]）。 */
    o += (lxR3 - lxL3 >= 82)
      ? txt(Math.min((lxL3 + lxR3) / 2, X(d.yOut) - 56), Y(d.zPort) - 24, '③ 出水 +' + mm(d.zPort), 11, C.out, 'middle')
      : txt(cx3, ty3,
        '③ 出水 +' + mm(d.zPort), 11, C.out, 'middle');
    /* v82：'② 排污总管' 文字随贴地总管一并取消 */
    /* v81：新增——旋转后排污口落在 +0.500（= 罐底标高），标注避开 P1 阀体。
       竖向让位：① 上方 -12px 会与管端的标高符号（+0.500，画在管轴高度）叠字 —— 故抬到 -26px；
       ② 下方 ≤ -6px 区间是 L 尺寸线标签的位置，也不能放。经测 -26px 时两两文字重叠数 = 0。 */
    o += txt(xWB1 - 6, yWBpx - 26, '② 排污主管 +' + mm(zWB), 11, C.ws, 'end');
    /* ★ v82（照用户草图）：排污口「距地」虚线 —— 自排污口竖直落到地面 ±0.000 并标注 */
    o += line(xWB1, yWBpx + rwS, xWB1, Y(0), C.dim, 0.9, '4 4');
    o += txt(xWB1 + 7, (yWBpx + rwS + Y(0)) / 2, '距地 +' + mm(zWB), 10, C.txt2, 'start');
    /* v81/v83：水平排污管的尺寸线（dir=-1：图形在尺寸线上方，端线朝上延长）。
       标高符号不再另画 —— 上面搬到管端的 elevMark(Y(d.zPort)) 就是这一层的标高（排污口 = 支管层），
       重复画两个会两两叠字（初版实测 37×5px 重叠）。 */
    o += dimH(xWB1, xWB0, yWBpx + wsBandB / 2 + 42,
      '水平长度 ≈ ' + (LWB / 1000).toFixed(2) + ' m（原立管段长 ' + LWB + ' mm）', -1);
    /* v83：排污管抬到支管层后，本行文字会伸到管端断面圆/尺寸线那一片（实测压 21×10、27×13）
       —— 回到 v82 的短文案；「与支管同层」在图上已由左右共线自明，并写在计算表/俯视行注里。 */
    o += txt(VW - 14, 46, '方式二 · 各组支管朝后（左）水平 ' + LWB + ' mm，汇入 ② 排污主管 +' + mm(zWB), 11, C.txt3, 'end');
    /* v82b：原放 y=32 会与「①上 进水 +1.520」重叠（实测 88×12px）—— 下移一行 */

    /* ★ v99 压力表：侧视（沿机组轴线看）里 ①③ 是**断面圆**，表就挂在圆的外缘上 ——
       ★ v103：PG1/PG2 一律朝上（方向一致），不挤进罐体/汇流节点那一堆管件里。
       挂点必须是断面圆的**正上 / 正下**一点（挂点即"表接在管子哪一点"），故候选只变
       短管方向与标号落位、挂点不动 —— 主闸门对侧视正好也只量这一点（20 个候选见 SIDE_*）。 */
    var rrInS = Math.max(4, c.dnIn / 2 * sc), rrOutS = Math.max(4, c.dnOut / 2 * sc);
    o += gaugeP('side:in', gaugeCands([[X(d.yIn), Y(d.zInTop) - rrInS]], SIDE_DIRS_IN, SIDE_LABS),
      'PG1', C.in);
    /* ★ v103b：首选正上（同 PG1，标号朝上）；斜上/左右为退路；全撞时退回断面圆正下（v99 原位） */
    o += gaugeP('side:out', gaugeCands([[X(d.yOut), Y(d.zPort) - rrOutS]],
      [[0, -G_OFF]], ['u'])
      .concat(gaugeCands([[X(d.yOut), Y(d.zPort) - rrOutS]], SIDE_DIRS_OUT.slice(1), SIDE_LABS))
      .concat([[X(d.yOut), Y(d.zPort) + rrOutS, 0, G_OFF, 'd']]), 'PG2', C.out);
    o += txt(VW - 14, 18, '侧视 · 左=后 / 右=前', 11, C.txt3, 'end');
    return o;
  }


  function renderAxoB(c) {
    var d = der(c);
    var LWB = lwRunB(c);   /* v82：朝后伸出长度 */
    var u = function (x, y) { return 0.866 * (x + y); };
    var v = function (x, y, z) { return 0.5 * (x - y) - z; };
    var x0 = -220, x1 = (c.n - 1) * c.s + 220;
    var xE = Math.max(0, c.mainExt || 0), x0i = x0 - xE, x1o = x1 + xE;   /* ★ v102：① 左端=x0i、③ 右端=x1o（③ 左端、② 不动）；标注锚点按 v89 契约不动 */

    var probe = [
      [x0, d.yIn, d.zTop], [x1, d.yIn, d.zTop], [x0, d.yOut, 0], [x1o, d.yOut, 0],
      [x0, d.yIn, d.zTop + 90], [x1, 0, 0], [x0i, d.yIn, d.zInTop],
      [x1, d.yIn + LWB, d.zPort],  /* v82/v83：朝后伸出的排污管末端（zPort 层）—— 不纳入包围盒就会被裁掉 */
      [x0, d.yIn + LWB, d.zPort]   /* v84：② 排污主管的左端（同一末端平面上的另一端） */
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
    var oy = padTop - vmin * sc + ((VH - padTop - pad) - (vmax - vmin) * sc) / 2 + 28;   /* v28：图形整体下移 28px——probe 包围盒底部虚扩致居中偏上（原上空 6.1/下空 63.3），均衡后 34/35 */
    var X = function (x, y) { return ox + u(x, y) * sc; };
    var Y = function (x, y, z) { return oy + v(x, y, z) * sc; };
    var rx = 1.2247 * sc, ry = 0.7071 * sc;                 // 单位半径的水平圆投影

    var o = DEFS;
    var p1TagX = 0, p1TagY = 0;   /* G1「P1 常闭」引注坐标（③ rail 之后补画，避免被管带盖住） */
    /* ② 排污总管（最前 → 最后画）；先画 ① 与罐体，再 ③，最后 ② */
    /* ①上 进水总管（唯一进水总管，罐后高位） */
    o += pipe(X(x0i, d.yIn), Y(x0i, d.yIn, d.zInTop), X(x1, d.yIn), Y(x1, d.yIn, d.zInTop), C.in, C.inL, c.dnIn, sc);
    /* ★ v84（方式二）：② 排污主管 —— 各组排污支管末端的横向总管（同 ③ 的汇流逻辑）。
       先画（处于底层），组循环里的支管与接口件再压上去。（方式一仍用贴地 ② 总管，不动。） */
    o += pipeTag(pipe(X(x0, d.yIn + LWB), Y(x0, d.yIn + LWB, d.zPort), X(x1, d.yIn + LWB), Y(x1, d.yIn + LWB, d.zPort),
      C.ws, C.wsL, c.dnWs, sc), 'axoWsMainB');

    var msA = modes(c);
    for (var i = 0; i < c.n; i++) {
      var cx = i * c.s, mA = msA[i], bw = (mA === 'backwash' || mA === 'dump');
      var R = c.od / 2;
      /* v82/v83/v84（方式二）：排污支管 = 节点处 90° 折向**朝后水平**伸出 LWB，末端接入 ② 排污主管。
         v83：管轴抬到与接驳支管同层（zPort）⇒ 节点是三臂、无竖直段，与侧视/前视一致。
         v84：末端由「排污口端盖」改为「接入 ② 排污主管」的接口菱形（主管 = 上方先画的那根横管）。 */
      o += line(X(cx, d.yIn), Y(cx, d.yIn, d.zPort), X(cx, d.yIn + LWB), Y(cx, d.yIn + LWB, d.zPort),
        bw ? C.ws : C.wsL, Math.max(2, c.dnWs * sc * 0.7));
      /* ★ v84：支管末端不再各自设端盖「排污口」—— 改为**接入 ② 排污主管**（接口菱形箍块）。 */
      var twB = Math.max(4, c.dnWs * sc * 0.8);
      var tpx = X(cx, d.yIn + LWB), tpy = Y(cx, d.yIn + LWB, d.zPort);
      o += '<path data-fs-out="axoWsTeeB' + i + '" d="M' + r2(tpx) + ' ' + r2(tpy - twB) +
        ' L' + r2(tpx + twB * 1.15) + ' ' + r2(tpy) + ' L' + r2(tpx) + ' ' + r2(tpy + twB) +
        ' L' + r2(tpx - twB * 1.15) + ' ' + r2(tpy) + ' Z" fill="' + C.fit + '" stroke="' + C.fitS +
        '" stroke-width="1" stroke-linejoin="round"/>';
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
      /* 罐后口卡箍（v52：进水侧——画在罐体之前，罐体侧影遮住菱形内侧一半，只露出朝后探出的部分；
         用户批注「进水管的菱形应该是被罐体遮挡了一部分的」）。hw 定义在此（axoF 沿用）。 */
      var hw = Math.max(3.5, c.dnBr * sc * 0.55);
      var hpx = X(cx, R), hpy = Y(cx, R, d.zPort);
      o += '<path data-fs-coup="axoB' + i + '" d="M' + r2(hpx) + ' ' + r2(hpy - hw) + ' L' + r2(hpx + hw * 1.15) + ' ' + r2(hpy) +
        ' L' + r2(hpx) + ' ' + r2(hpy + hw) + ' L' + r2(hpx - hw * 1.15) + ' ' + r2(hpy) + ' Z" fill="' + C.fit +
        '" stroke="' + C.fitS + '" stroke-width="1" stroke-linejoin="round"/>';
      /* 罐体：底椭圆 + 侧影 + 顶椭圆（水平圆 → 固定比例椭圆） */
      var erx = rx * R, ery = Math.max(3, ry * R);
      o += '<ellipse cx="' + r2(X(cx, 0)) + '" cy="' + r2(Y(cx, 0, d.zBot)) + '" rx="' + r2(erx) + '" ry="' + r2(ery) +
        '" fill="' + (bw ? C.bwF : C.tank) + '" stroke="' + (bw ? C.bw : C.tankS) + '" stroke-width="1"/>';
      var blu = X(cx, R), blv = Y(cx, R, d.zBot), tlu = X(cx, R), tlv = Y(cx, R, d.zTop);
      var bru = X(cx, -R), brv = Y(cx, -R, d.zBot), tru = X(cx, -R), trv = Y(cx, -R, d.zTop);
      o += '<path d="M' + r2(blu) + ' ' + r2(blv) + ' L' + r2(tlu) + ' ' + r2(tlv) + ' L' + r2(tru) + ' ' + r2(trv) +
        ' L' + r2(bru) + ' ' + r2(brv) + ' Z" fill="' + (bw ? C.bwF : C.tank) + '" stroke="none"/>';
      o += line(tlu, tlv, blu, blv, bw ? C.bw : C.tankS, 1);
      o += line(tru, trv, bru, brv, bw ? C.bw : C.tankS, 1);
      o += '<ellipse cx="' + r2(X(cx, 0)) + '" cy="' + r2(Y(cx, 0, d.zTop)) + '" rx="' + r2(erx) + '" ry="' + r2(ery) +
        '" fill="' + (bw ? C.bwF : C.tank) + '" stroke="' + (bw ? C.bw : C.tankS) + '" stroke-width="1.2"/>';
      /* 罐前口卡箍（v43 图示；v52：排水/出水侧——画在罐体之上，图层最上层完整显示，
         用户批注「排水管的菱形位于图层最上层显示出来」） */
      var fpx = X(cx, -R), fpy = Y(cx, -R, d.zPort);
      o += '<path data-fs-coup="axoF' + i + '" d="M' + r2(fpx) + ' ' + r2(fpy - hw) + ' L' + r2(fpx + hw * 1.15) + ' ' + r2(fpy) +
        ' L' + r2(fpx) + ' ' + r2(fpy + hw) + ' L' + r2(fpx - hw * 1.15) + ' ' + r2(fpy) + ' Z" fill="' + C.fit +
        '" stroke="' + C.fitS + '" stroke-width="1" stroke-linejoin="round"/>';
      /* 排气阀 ⑥ */
      o += line(X(cx, 0), Y(cx, 0, d.zTop), X(cx, 0), Y(cx, 0, d.zTop + 70), C.tankS, 2.4);
      /* 进水阀 V（立管中段）+ 排污阀 P（节点下排污立管中段，默认常闭）——均可点击 */
      var vwA = Math.max(7, VALVE_W * sc), vhA = Math.max(7, VALVE_W * sc * 0.8);
      var m1 = u(cx, d.yIn), m1v = v(cx, d.yIn, (d.zPort + d.zInTop) / 2);
      o += valveRect(ox + m1 * sc - vwA / 2, oy + m1v * sc - vhA / 2, vwA, vhA,
        (mA === 'filter' || mA === 'dump'), i + ':v', 'V' + (i + 1) + ' 进水阀（立管中段）');
      /* v82：P 阀随排污管挪到「朝后水平段中段」 */
      var m2 = u(cx, d.yIn + LWB * 0.5), m2v = v(cx, d.yIn + LWB * 0.5, d.zPort);
      o += valveRect(ox + m2 * sc - vwA / 2, oy + m2v * sc - vhA / 2, vwA, vhA,
        (mA === 'backwash' || mA === 'dump'), i + ':p', 'P' + (i + 1) + ' 排污阀（方式二 · 朝后水平段中段）');
      /* 水流方向层（动画虚线；直排亮红） */
      if (mA === 'filter' || mA === 'dump') o += flow(X(cx, d.yIn), Y(cx, d.yIn, d.zInTop), X(cx, d.yIn), Y(cx, d.yIn, d.zPort), C.in, mA === 'dump');
      if (mA === 'backwash' || mA === 'dump') {
        /* v83：与支管同层 ⇒ 自节点直达排污口，没有竖直段 */
        o += flow(X(cx, d.yIn), Y(cx, d.yIn, d.zPort), X(cx, d.yIn + LWB), Y(cx, d.yIn + LWB, d.zPort), C.ws, mA === 'dump');
      }
      if (mA === 'filter') {
        o += flow(X(cx, d.yIn), Y(cx, d.yIn, d.zPort), X(cx, R), Y(cx, R, d.zPort), C.in);            /* 节点 → 罐后口 */
        o += flow(X(cx, -R), Y(cx, -R, d.zPort), X(cx, d.yOut), Y(cx, d.yOut, d.zPort), C.out);       /* 罐前口 → ③ */
      } else if (mA === 'backwash') {
        o += flow(X(cx, d.yOut), Y(cx, d.yOut, d.zPort), X(cx, -R), Y(cx, -R, d.zPort), C.out);       /* ③ → 罐前口（倒行） */
        o += flow(X(cx, R), Y(cx, R, d.zPort), X(cx, d.yIn), Y(cx, d.yIn, d.zPort), C.ws);            /* 罐后口 → 节点 → 排污 */
      }
      o += txt(X(cx, 0), Y(cx, 0, d.zTop + 70) - 8, 'G' + (i + 1), 10, bw ? C.bw : C.txt3, 'middle', bw ? 700 : 400, 'fs-tcode');   /* v85：引注码，放大后不缩小 */
      /* 轴测图：只给第 1 组引注阀位与排气口（其余组构造相同：G2=V2/P2、G3=V3/P3、G4=V4/P4） */
      if (i === 0) {
        o += txt(ox + m1 * sc + vwA / 2 + 4, oy + m1v * sc + 3, 'V1', 9, C.valveS, 'start', 0, 'fs-tcode');
        p1TagX = ox + m2 * sc + vwA / 2 + 4; p1TagY = oy + m2v * sc + 3;
        o += txt(X(cx, 0) + 7, Y(cx, 0, d.zTop + 70) - 8, '⑥', 9, C.txt3, 'start', 0, 'fs-tcode');
      }
    }

    o += pipe(X(x0, d.yOut), Y(x0, d.yOut, d.zPort), X(x1o, d.yOut), Y(x1o, d.yOut, d.zPort), C.out, C.outL, c.dnOut, sc);
    /* 出水总阀 V0（v12：③ 末端管内）：有组反冲时自动关闭（停水反冲） */
    var vw0A = Math.max(7, VALVE_W * sc), vh0A = Math.max(7, VALVE_W * sc * 0.8);
    var v0u = ox + u(x1o - 40, d.yOut) * sc, v0v = oy + v(x1o - 40, d.yOut, d.zPort) * sc;
    o += v0Valve(v0u - vw0A / 2, v0v - vh0A / 2, vw0A, vh0A, v0Open(c));
    o += txt(p1TagX, p1TagY, 'P1 常闭', 9, C.valveS, 'start', 0, 'fs-tcode');   /* 后画于阀块右侧罐身留白处：不与罐描边线交叠 */
    /* 管端堵头（v17）：① 末端（右端死头）与 ③ 上游端（左端死头）——等轴测斜向短板，垂直于管轴；
     * ① 左端=进水来向、③ 右端=V0 出水去向、② 左端=排污排向，均接走不设堵头 */
    var axDx = 0.866, axDy = 0.5;   /* +x 世界方向在轴测屏幕上的单位方向（0.866, 0.5） */
    o += axoCap(X(x1, d.yIn) + axDx * 1.2, Y(x1, d.yIn, d.zInTop) + axDy * 1.2, axDx, axDy,
      Math.max(3, c.dnIn * sc) + 5, C.in, 'axoIn');
    o += axoCap(X(x0, d.yOut) - axDx * 1.2, Y(x0, d.yOut, d.zPort) - axDy * 1.2, axDx, axDy,
      Math.max(3, c.dnOut * sc) + 5, C.out, 'axoOut');

    o += txt(X(x0, d.yIn) - 6, Y(x0, d.yIn, d.zInTop), '① 进水总管（+' + mm(d.zInTop) + '）· DN' + c.dnIn, 11, C.in, 'end');
    o += txt(X(x1, d.yOut) + 6, Y(x1, d.yOut, d.zPort) + 12, '③ 出水总管', 11, C.out, 'start');
    /* ★ v84：标注 ② 排污主管（贴其右端，与方式一 ② 总管同一引注习惯） */
    o += txt(X(x1, d.yIn + LWB) - 8, Y(x1, d.yIn + LWB, d.zPort) + 18,
      '② 排污主管', 11, C.ws, 'end');   /* v84b：右对齐 + 轴线下方；且**只留管名**——
        与方式一轴测的 '② 排污总管' 同风格（v48 用户批注：括号说明删除）；
        口径/标高已在俯视行注与计算表里，此处再堆括号会把标号拉长去压邻近支管。 */
    o += txt(14, 18, '轴测 · 方式二：各组排污支管朝后水平 ' + LWB + ' mm 汇入 ② 排污主管 · G1=V1/P1…G4=V4/P4 · 支管平接罐后口（与③同高）', 11, C.txt3, 'start');

    /* ★ v99 压力表：轴测里挂点只取**远离罐体的空角** —— PG1 靠 ① 左端（上游）、
       PG2 落在 ③ 那一带的空档；短管一律朝屏幕正上/正下，与其余三视图同观感。
       最后画 ⇒ 永远压在管带/罐体之上，不会被遮。
       挂点沿 ①③ 管轴按定比铺候选（轴测里沿轴走 = 屏幕朝 (0.866, 0.5) 走，
       离轴距离恒定 ⇒ 择优选位不会把表带离管子）；具体落在哪由 pickGauges() 现选。 */
    var hwInA = Math.max(3, c.dnIn * sc) / 2, hwOutA = Math.max(3, c.dnOut * sc) / 2;
    /* ★ v103：**首选**挂**加长段**（PG1 [x0i, x0]、PG2 [x1, x1o]）方向朝上（PG2 原为正下）；
       ★ v103b 兜底 = v99 原全管长候选（fb1A/fb2A；v105b 由 g1F/g2F 改名，避免与旧静态挂点 mustNot 契约撞名），极端参数下加长段没干净空档时自动落回。 */
    var g1A = [0.30, 0.50, 0.70].map(function (f) { return x0i + (x0 - x0i) * f; });
    var g2A = [0.30, 0.50, 0.70].map(function (f) { return x1 + (x1o - x1) * f; });
    var fb1A = [0.02, 0.14, 0.28, 0.44, 0.62].map(function (f) { return x0 + (x1 - x0) * f; });
    var fb2A = [0.50, 0.34, 0.66, 0.20, 0.80].map(function (f) { return x0 + (x1 - x0) * f; });
    /* ★ v108：首选候选扩容 —— 3 挂点 × 标号(u/r/l) = 9 个正上候选 + 加长段斜上 6 个（标号 r/l），
       高位罐/粗管等参数下加长段正上被罐体斜投影/文字擦碰时有变体可绕，尽量避免落到朝下兜底
       （2026-09-22 用户批注「压力表方向应朝上」；契约 _p1/_verify_fs_gauge_dir_v108.cjs）。 */
    o += gaugeP('axo:in', gaugeCands(
      g1A.map(function (t) { return [X(t, d.yIn), Y(t, d.yIn, d.zInTop) - hwInA]; }),
      [[0, -G_OFF]], ['u', 'r', 'l'])
      .concat(gaugeCands(
      g1A.map(function (t) { return [X(t, d.yIn), Y(t, d.yIn, d.zInTop) - hwInA]; }),
      [[-G_OFF * 0.71, -G_OFF * 0.71]], ['r', 'l']))
      .concat(gaugeCands(
      fb1A.map(function (t) { return [X(t, d.yIn), Y(t, d.yIn, d.zInTop) - hwInA]; }),
      [[0, -G_OFF], [-G_OFF, 0], [G_OFF, 0]], ['r', 'u', 'l'])), 'PG1', C.in);
    o += gaugeP('axo:out', gaugeCands(
      g2A.map(function (t) { return [X(t, d.yOut), Y(t, d.yOut, d.zPort) - hwOutA]; }),
      [[0, -G_OFF]], ['u', 'r', 'l'])
      .concat(gaugeCands(
      g2A.map(function (t) { return [X(t, d.yOut), Y(t, d.yOut, d.zPort) - hwOutA]; }),
      [[-G_OFF * 0.71, -G_OFF * 0.71]], ['r', 'l']))
      .concat(gaugeCands(
      fb2A.map(function (t) { return [X(t, d.yOut), Y(t, d.yOut, d.zPort) + hwOutA]; }),
      [[0, G_OFF], [-G_OFF * 0.71, G_OFF * 0.71], [G_OFF, 0]], ['r', 'd', 'l'])), 'PG2', C.out);
    return o;
  }


  function calcRowsB(c) {
    var k = calc(c), d = k.d;
    var LWB = lwRunB(c);   /* v82 */
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
      /* v82/v83/v84：方式二没有贴地 ②；排污管抬到支管同层，末端的 ② 排污主管 = 支管罐口层 */
      { id: 'zchain', label: '标高链 ② 排污主管(=支管罐口层)/罐顶⑥/①上',
        val: '+' + mm(d.zPort) + ' / +' + mm(d.zTop) + ' / +' + mm(d.zInTop), cls: '' },
      /* ★ v84：② 排污主管（各组排污支管汇入的那根横管）—— 口径与标高显性化 */
      { id: 'wsMainB', label: '② 排污主管（方式二 · 各组支管汇入）',
        val: 'DN' + c.dnWs + ' · 管中 +' + mm(d.zPort) + ' · 距节点 ' + LWB + ' mm（= 排污支管长）', cls: '' },
      /* v82：新增一行把「朝后伸出长度」显性化（左栏参数在计算表里也看得到）
         ★ v86：行名随左栏一起改为「排污支管长（水平）」——全页只留一个叫法。 */
      { id: 'wrunB', label: '排污支管长（水平）',
        val: LWB + ' mm（' + (LWB / 1000).toFixed(2) + ' m）· 管中 +' + mm(d.zPort) + '（与支管同层）' +
          ' · 末端接 ② 排污主管 · ' + (c.wRunAuto ? '自动＝原立管段长' : '手动指定'), cls: '' },
      { id: 'loss', label: '过滤与阀门损失（本页设定）', val: f(c.loss, 1) + ' m', cls: '' },
      { id: 'lossref', label: '过滤损失参考区间', val: '清洁 2~3 m · 需反冲洗 5~7 m（行业经验，待校正）', cls: '' }
    ];
    if (k.nDump > 0) rows.push({ id: 'dumpwarn', label: '⚠ 直排短路警告', val: '有组 V 与 P 同开：进水不经过滤直接排入 ② 排污主管，请关闭该组 P', cls: 'bad' });
    if (k.nBW > 0 && k.act === 0) rows.push({ id: 'noflow', label: '⚠ 无净水来源', val: '没有组在过滤，③ 内无净水，反冲洗实际无水流', cls: 'bad' });
    if (k.nOff > 0 && k.nDump === 0 && k.nBW === 0) rows.push({ id: 'offnote', label: '隔离组', val: k.nOff + ' 组 V/P 均关（未参与过滤）', cls: 'warn' });
    return rows;
  }


  /* ================= DOM ================= */
  function rangeRow(spec) {
    /* v36：滑块已取消（用户批注）——数字框直接输入，事件仍走 rootEl 委托 */
    return '<div class="fs-row">' +
      '<label>' + esc(spec.label) + '</label>' +
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
    /* ---- 操作按钮组（v13 从顶部条移到左栏顶部）
       ★ v88（2026-09-20 用户截图批注）：三个按钮横向排一行 ——「恢复默认参数」从右列过滤损失卡下
       搬上来；同时取消两个按钮**面上**的 ⟵ / →（箭头占的宽度正好是第三个按钮需要的：
       保留箭头 332px > 可用 303px 必换行，去箭头 301px ≤ 303px 才排得下）。data-fs-act 委托不变。 ---- */
    h += '<div class="fs-group fs-actions">' +
      '<button type="button" class="fs-bar-btn" data-fs-act="syncFlow" title="从当前设计方案读联合流量作为本页设计流量 Q">取当前方案流量</button>' +
      '<button type="button" class="fs-bar-btn solid" data-fs-act="writeLoss" title="把本页过滤损失写入三级/二级计算的「过滤与阀门损失」">写入过滤损失</button>' +
      /* v88：第三个操作按钮 —— 原在右列过滤损失卡下方（v41），用户批注搬到这里与上面两个同排 */
      '<button type="button" class="fs-bar-btn" data-fs-act="reset" title="把本页机组 / 管径 / 过滤损失等参数复位为默认值">恢复默认参数</button>' +
      '</div>';
    /* v36：机组参数 + 管路管径 并排；v39：过滤损失卡片移入右列（管路管径下方），说明文字留 duo 后全宽 */
    h += '<div class="fs-duo">' +
      '<div class="fs-duo-col">' +
      '<div class="fs-group"><div class="fs-gh">机组参数</div>' +
      RANGES.map(rangeRow).join('') + '</div>' +
      '</div>' +
      '<div class="fs-duo-col">' +
      '<div class="fs-group"><div class="fs-gh">管路管径</div>' +
      DNS.map(function (x) {
        return '<div class="fs-row"><label>' + esc(x.label) + '</label>' +
          '<select data-fs-sel="' + x.k + '">' + opt + '</select><span class="fs-unit">DN</span></div>';
      }).join('') + '</div>' +
      '<div class="fs-group"><div class="fs-gh">过滤损失<em>可回写扬程计算</em></div>' +
      '<div class="fs-row"><label>损失取值</label>' +
      '<input type="number" data-fs-num="loss" min="0" max="30" step="0.5"><span class="fs-unit">m</span></div>' +
      '</div>' +
      /* v88：「恢复默认参数」已上移到左栏顶部按钮组（与 syncFlow / writeLoss 同排，见上）；
         右列过滤损失卡下方现在只剩下面这个切换按钮（v41 的旧位置已作废）。 */
      /* v80：「切换接法」按钮紧随过滤损失卡 —— 在方式一 / 方式二之间来回切换。
         两种方式共用同一份参数，切换只换右侧四视图与选型计算的渲染。 */
      '<button type="button" class="fs-bar-btn" data-fs-act="switchMode">' + switchBtnText() + '</button>' +
      '</div>' +
      '</div>';
    h += '<div class="fs-note">清洁状态约 2~3 m，压差报警前约 5~7 m。<b>点上方「写入过滤损失」</b>即可把该值送进三级 / 二级计算的扬程算式。</div>';
    h += '<div class="fs-group"><div class="fs-gh">阀门操作模拟<em>点图上阀块或下方表格行</em></div>' +
      '<div class="fs-chips" id="fsChips"></div>' +
      '<div class="fs-valves" id="fsValves"></div>' +
      '<div class="fs-note"><b>V0 出水总阀</b>（③ 下游端）：正常开启产水；<b>任一组反冲时自动关闭</b>——③ 内净水不外送，全部倒行用于反冲（停水反冲式）。<br>' +
      '<b>过滤</b>：V 开 P 关 → ① → 罐滤芯 → ③（正常产水）。<br>' +
      '<span id="fsFlowLegend">' + flowLegend() + '</span>' +   /* v82：反冲/直排去向随方式刷新 */
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
      /* ★ v99：压力表图例（四视图统一：PG1 挂 ① 进水、PG2 挂 ③ 出水） */
      '<span><i class="fs-lg fs-lg-gauge"></i>压力表（PG1 ① 进水 / PG2 ③ 出水，两表之差 = 过滤损失 ΔP）</span>' +
      '<span><i class="fs-lg-square" style="background:' + C.wsF + ';border:1px solid ' + C.ws + '"></i>反冲 / 直排中的组</span>' +
      '</div></div>';
    h += '</section>';
    h += '</div></div>';
    return h;
  }
  function vcard(id, title, note) {
    /* v59：仅轴测图卡带「放大」按钮（放大后占四窗之和的范围）；其余三张不带按钮，默认视觉逐像素不变 */
    var zbtn = (id === 'axo')
      ? '<button type="button" class="fs-zbtn" data-fs-act="axoZoom" data-fs-zoomed="0" title="放大到四窗之和的范围（再点还原）">放大</button>'
      : '';
    return '<div class="fs-vcard' + (id === 'axo' ? ' fs-vcard--axo' : '') + '"><div class="fs-vcard-h"><b>' + esc(title) + '</b>' + zbtn + '<em>' + esc(note) + '</em></div>' +
      '<svg id="' + SVG_IDS[id] + '" viewBox="0 0 ' + VW + ' ' + VH + '" preserveAspectRatio="xMidYMid meet"></svg></div>';
  }

  /* ================= 渲染 ================= */
  function render() {
    if (!rootEl || !cfg) return;
    if (cfg.bw >= cfg.n) cfg.bw = -1;
    /* ★ v99 压力表：候选由 gaugeP 收集进 G_PEND（不写进视图字符串），写完视图内容后
       由 stageGauges 分批注入并当场择优 —— 见 gaugeP / stageGauges 上的实测说明。 */
    G_PEND = [];
    var R = (mode === 'b') ? RENDER_B : RENDER_A;
    var v = {
      top: R.top(cfg), front: R.front(cfg),
      side: R.side(cfg), axo: R.axo(cfg)
    };
    var gEls = [];
    Object.keys(SVG_IDS).forEach(function (k) {
      var el = rootEl.querySelector('#' + SVG_IDS[k]);
      if (el) { el.innerHTML = v[k]; gEls.push(el); }
    });
    try { stageGauges(gEls, G_PEND); } catch (e) {}
    var box = rootEl.querySelector('#fsCalc');
    if (box) {
      box.innerHTML = ((mode === 'b') ? calcRowsB(cfg) : calcRows(cfg)).map(function (r) {
        return '<div class="fs-kv" data-fs-kv="' + r.id + '">' +
          '<span class="fs-kv-note">' + esc(r.label) + '</span>' +
          '<span class="' + (r.cls ? 'fs-' + r.cls : '') + '">' + esc(r.val) + '</span></div>';
      }).join('');
    }
    renderChips();
    renderValves();
    syncModeBtn();
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
    h += '<button type="button" class="fs-chip" data-fs-bw="-1">全过滤</button>';
    box.innerHTML = h;
  }
  /* 面板阀门一览：每组一枚胶囊（V/P 开关态 + 组态名），点击与图上阀块同为 cycle 切换 */
  /* v49：改表格排版（用户批注「做个表格显示」）——每行一组：机组/进水阀/排污阀/组态，V0 总阀首行（自动联动不可点）。
     契约属性原样保留在行上：.fs-vchip（e2e 计数 n+1）、data-fs-valve="i:cycle"（点击委托 closest）、data-v0、data-mode（状态配色）。 */
  function renderValves() {
    var box = rootEl && rootEl.querySelector('#fsValves');
    if (!box) return;
    var arr = valveArr(cfg), ms = modes(cfg);
    var map = { filter: '过滤', backwash: '反冲洗', dump: '直排短路', off: '隔离' };
    /* V0 出水总阀（v12）：非点击自动联动——有组反冲时自动关闭（停水反冲） */
    var v0o = v0Open(cfg);
    var h = '<table class="fs-vtable"><thead><tr><th>机组</th><th>进水阀</th><th>排污阀</th><th>组态</th></tr></thead><tbody>';
    h += '<tr class="fs-vchip" data-v0="' + (v0o ? 'open' : 'closed') + '"' +
      ' title="V0 出水总阀（机组 ③ 下游端，自动联动不可点击）：任一组反冲时自动关闭——③ 内净水全部倒行用于反冲（停水反冲式）">' +
      '<td>V0 总阀</td><td colspan="2">' + (v0o ? '开 · 产水' : '关 · 反冲中') + '</td><td>自动联动</td></tr>';
    for (var i = 0; i < cfg.n; i++) {
      h += '<tr class="fs-vchip" data-mode="' + ms[i] + '" data-fs-valve="' + i + ':cycle"' +
        ' title="G' + (i + 1) + ' 阀组（点击行切换：过滤→反冲→隔离→直排）">' +
        '<td>G' + (i + 1) + '</td><td>V' + (i + 1) + (arr[i].v ? '开' : '关') + '</td>' +
        '<td>P' + (i + 1) + (arr[i].p ? '开' : '关') + '</td><td>' + map[ms[i]] + '</td></tr>';
    }
    h += '</tbody></table>';
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
    /* v82：手改过「排污支管长」就退出自动跟随（复位按钮可回到自动态）★ v86 改名 */
    if (k === 'wRun') cfg.wRunAuto = false;
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
      /* v82：自动跟随态下，输入框显示「实际生效长度」，而不是存档里的占位值 540 ——
         否则改罐底架装 h 后，图上长度会变、框里数字不变（看着像没联动）。
         ★ v92：wRun 的自动值**分接法**（方式一 660 / 方式二 540），故一律走 wRunEff(cfg, mode)，
         保证「框里的数 = 图上那根排污管的长度」在两种接法下都成立。 */
      el.value = (k === 'wRun') ? wRunEff(cfg, mode) : cfg[k];
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
    /* v59：轴测图放大/还原——放大时该卡横跨两列（= 四窗之和的范围），其余三张收起 */
    if (name === 'axoZoom') {
      var grid = rootEl ? rootEl.querySelector('.fs-grid') : null;
      var card = rootEl ? rootEl.querySelector('.fs-vcard--axo') : null;
      if (!grid || !card) return;
      var on = !grid.classList.contains('is-axo-zoom');
      if (on) { grid.classList.add('is-axo-zoom'); card.classList.add('is-axo-zoom'); }
      else { grid.classList.remove('is-axo-zoom'); card.classList.remove('is-axo-zoom'); }
      if (btn) {
        btn.setAttribute('data-fs-zoomed', on ? '1' : '0');
        btn.textContent = on ? '还原' : '放大';
      }
      return;
    }
    if (name === 'switchMode') {
      mode = (mode === 'b') ? 'a' : 'b';
      saveMode();
      syncModeBtn();
      syncInputs();   /* ★ v92：wRun 的自动跟随值分接法（660/540），换接法后左栏必须跟着刷新 */
      render();
      planNote('已切换到' + (mode === 'b' ? '方式二（接法 B）' : '方式一（接法 A）') +
        '：参数与现在方式完全相同，只是右侧图面按各自的接法渲染。', true);
      return;
    }
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
    mode = loadMode();
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
    MODE_KEY: MODE_KEY,
    mode: function () { return mode; },
    setMode: function (m) {
      mode = (m === 'b') ? 'b' : 'a';
      saveMode();
      if (!isMountedNow()) mount();
      syncModeBtn(); syncInputs(); render();   /* ★ v92：同 doAct，wRun 自动值随接法刷新 */
      return mode;
    },
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
