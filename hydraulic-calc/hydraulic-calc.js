/* 水力计算器 · 界面（2026-09-17 第六十二轮）
 *
 * 宿主：index.html 的 #threeDModelingSection（本轮起该区块由「三维建模占位页」改为水力计算器；
 * 原占位内容与「先体验参数化建模」入口已取消，见 _p1/_patch_hydcalc.py）。
 *
 * 计算全部委托给 hydraulic-calc/hc-core.js（window.RyHcCore，须先于本文件加载）——
 * 本文件只做「建 DOM / 读输入 / 写结果 / 存档」，不含任何水力公式。
 *
 * 挂载策略（懒挂载）：宿主 section 静态为空，用 IntersectionObserver 在**该区块首次可见时**
 * 才建 DOM —— 与 modeling/integration.js 同一套路。好处：不打开水力计算器就不产生任何 DOM，
 * 对 verify_simplify_equivalence 的快照（全站 body * 计算样式）零增量。
 * 测试可直接调 window.RyHydraulicCalc.mount() 强制挂载（幂等）。
 *
 * 存档：runye_hydraulic_calc_cfg_v1。**只在用户改动时写**（挂载/浏览不写），与本站
 * 「没动过就不落盘」的既有约定一致。
 */
(function () {
  'use strict';

  var Core = (typeof window !== 'undefined') ? window.RyHcCore : null;
  var CFG_KEY = 'runye_hydraulic_calc_cfg_v1';
  var SEC_ID = 'threeDModelingSection';

  var OD_DATALIST_ID = 'hcOdList';
  var MAINS_ID = 'hcMains';
  var LEG_TABLE_ID = 'hcLegTable';
  var ALL_TABLE_ID = 'hcAllTable';
  var NET_BOX_ID = 'hcNetBox';
  var NET_SVG_ID = 'hcNetSvg';

  /* 「已挂载」一律以 DOM 为准（.hc-wrap 是否在文档里），不缓存布尔标志：
     外部清空区块或换过 DOM 后仍如实反映，也与 mount() 的幂等自愈判定同源。 */
  function isMountedNow() {
    var s = document.getElementById(SEC_ID);
    return !!(s && s.querySelector('.hc-wrap'));
  }
  var rootEl = null;
  var cfg = null;
  var lastSrc = null;   /* 三级方案来源说明（importThreeLevel 写入，展示在左栏顶部 .hc-src）；{title, rows[]} */
  function srcNoteHtml() {
    if (!lastSrc) return '';
    return '<b>' + esc(lastSrc.title || '') + '</b>' +
      (lastSrc.rows && lastSrc.rows.length ? '<ul>' + lastSrc.rows.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul>' : '');
  }

  /* ---------------- 数值/文本工具 ---------------- */
  function f(v, n) {
    var x = Number(v);
    if (!isFinite(x)) x = 0;
    return x.toFixed(n === undefined ? 3 : n);
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* 长度 / 流量一律规整到两位小数（2026-09-19 用户要求：精确到小数点后两位）。
     ★ 统一在 normalize 之后落一次 —— cfg 内部值与输入框显示值因此同源，否则
       domOutOfSync()（字符串比对）会永久判「不同步」→ 每次渲染重建卡片 → 输入焦点丢失。 */
  function tidy2(c) {
    if (!c) return c;
    if (c.trunk) c.trunk.len = Core.r2(Number(c.trunk.len) || 0);
    (c.mains || []).forEach(function (m) {
      m.len = Core.r2(Number(m.len) || 0);
      (m.taps || []).forEach(function (t) {
        t.len = Core.r2(Number(t.len) || 0);
        t.flow = Core.r2(Number(t.flow) || 0);
      });
    });
    return c;
  }
  function nm(c) { return tidy2(Core.normalize(c)); }   /* normalize 后统一规整（所有入口汇聚于此） */

  /* ---------------- 存档 ---------------- */
  function loadCfg() {
    try {
      var raw = window.localStorage.getItem(CFG_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || !o.mains || !o.mains.length || !o.trunk) return null;
      return nm(o);
    } catch (e) { return null; }
  }
  function saveCfg() {
    try { window.localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) { }
  }

  /* ---------------- DOM 骨架 ---------------- */
  function shellHtml() {
    var opt = Core.CALIBER_MODES.map(function (m) {
      return '<option value="' + m.id + '">' + esc(m.label) + '</option>';
    }).join('');
    var dl = Core.PE_OD_SERIES.map(function (od) { return '<option value="' + od + '"></option>'; }).join('');
    return '' +
      '<div class="hc-wrap">' +
      '  <aside class="hc-side">' +
      '    <div class="hc-src" data-hc="srcNote" style="display:none"></div>' +
      '    <div class="hc-h">参数 · 改任意一项，右侧结果立即更新</div>' +
      '    <div class="hc-group">' +
      '      <div class="hc-h">全局</div>' +
      '      <div class="hc-row"><label>管径口径</label><select data-hc="caliber">' + opt + '</select></div>' +
      '      <div class="hc-row"><label>Hazen 系数 C</label><input type="number" data-hc="C" min="80" max="160" step="1"><span class="hc-unit"></span></div>' +
      '      <div class="hc-row"><label>三通 ζ</label><input type="number" data-hc="juncZeta" min="0" step="0.1"><span class="hc-unit"></span></div>' +
      '      <div class="hc-row hc-row-chk"><label><input type="checkbox" data-hc="includeLocal"> 计入三通 / 分水口局部损失</label></div>' +
      '      <div class="hc-row"><label>支管流量统一</label><input type="number" data-hc="bulkFlow" min="0" step="0.5"><button type="button" class="hc-btn hc-btn-sm" data-hc-act="applyBulkFlow">应用</button></div>' +
      '    </div>' +
      '    <div class="hc-group">' +
      '      <div class="hc-h">总管（水源 → 分水三通）</div>' +
      '      <div class="hc-row"><label>管径 OD</label><input type="number" list="' + OD_DATALIST_ID + '" data-hc="trunkOd" min="1" step="5"><span class="hc-unit">mm</span></div>' +
      '      <div class="hc-row"><label>长度</label><input type="number" data-hc="trunkLen" min="0" step="5"><span class="hc-unit">m</span></div>' +
      '      <div class="hc-row hc-row-ro"><label>总管流量</label><b data-hc-out="trunkFlow">—</b></div>' +
      '    </div>' +
      '    <div class="hc-group">' +
      '      <div class="hc-h">主管与支管</div>' +
      '      <div id="' + MAINS_ID + '"></div>' +
      '      <div class="hc-foot">' +
      '        <button type="button" class="hc-btn" data-hc-act="addMain">＋ 增加一根主管</button>' +
      '        <button type="button" class="hc-btn" data-hc-act="reset">恢复默认参数</button>' +
      '      </div>' +
      '    </div>' +
      '    <datalist id="' + OD_DATALIST_ID + '">' + dl + '</datalist>' +
      '  </aside>' +
      '  <section class="hc-main">' +
      '    <div class="hc-block">' +
      '      <div class="hc-block-h">管网示意图' +
      '        <span class="hc-block-note">点图中任意支管或主管分段 → 该条路径高亮并立即算出水头损失；' +
      '        管径 / 长度一改，图与数值同步更新（末端 Σ 为该路径合计）</span>' +
      '      </div>' +
      '      <div class="hc-net" id="' + NET_BOX_ID + '"></div>' +
      '      <div class="hc-net-bar">' +
      '        <span class="hc-net-cur" data-hc-out="netCur"></span>' +
      '        <span class="hc-net-legend">' +
      '          <span><i class="hc-lg hc-lg-on"></i>当前路径</span>' +
      '          <span><i class="hc-lg hc-lg-worst"></i>最不利</span>' +
      '          <span><i class="hc-lg hc-lg-best"></i>最有利</span>' +
      '        </span>' +
      '      </div>' +
      '    </div>' +
      '    <div class="hc-pick">' +
      '      <span>计算路径（也可直接点上方管网图）</span>' +
      '      <select data-hc="pathMain"></select>' +
      '      <span>→</span>' +
      '      <select data-hc="pathTap"></select>' +
      '      <button type="button" class="hc-btn" data-hc-act="jumpWorst">跳到最不利路径</button>' +
      '      <span class="hc-block-note" data-hc-out="pickNote"></span>' +
      '    </div>' +
      '    <div class="hc-hero">' +
      '      <div class="hc-hero-num"><b data-hc-out="total">0.000</b><i>m</i></div>' +
      '      <div class="hc-hero-sub">' +
      '        <span>沿程损失 <b data-hc-out="hf">0.000</b> m</span>' +
      '        <span>局部损失 <b data-hc-out="hlocal">0.000</b> m</span>' +
      '      </div>' +
      '      <div class="hc-hero-path" data-hc-out="pathText"></div>' +
      '    </div>' +
      '    <div class="hc-block">' +
      '      <div class="hc-block-h">分段明细<span class="hc-block-note">沿所选路径逐段累加（每段流量各自不同）</span></div>' +
      '      <div class="hc-table-wrap"><table class="hc-table" id="' + LEG_TABLE_ID + '"></table></div>' +
      '    </div>' +
      '    <div class="hc-block">' +
      '      <div class="hc-block-h">任意组合对比<span class="hc-block-note" data-hc-out="combNote"></span></div>' +
      '      <div class="hc-table-wrap"><table class="hc-table" id="' + ALL_TABLE_ID + '"></table></div>' +
      '    </div>' +
      '    <p class="hc-note">' +
      '      沿程水头损失按 Hazen-Williams：<code>hf = 1.113×10⁹ · L · Q^1.852 / (C^1.852 · D^4.87)</code>' +
      '      （L 为 m、Q 为 m³/h、<b>D 为内径</b> mm、C 默认 150）—— 与本站二级 / 三级水力计算同口径。' +
      '      局部损失：路径上每个三通按 <code>ζ·v²/(2g)</code>，v 取分流后<b>下游管</b>流速，ζ 默认 1.0、可关闭。' +
      '      管径默认按 PE100 / SDR13.6 由外径折算内径 <code>D = OD×(1−2/13.6)</code>；' +
      '      也可在「管径口径」切到 SDR17 / SDR21，或选「直接按内径」后直接填内径值。' +
      '      流量在支管末端给定（每根支管一个设计流量），上游按下游求和自动累加 —— 故「任意组合」的每条路径都能独立成算。' +
      '      <b>流速</b>列按 0.8~2.0 m/s 经济流速区间标注（偏低 / 偏高仅供参考：滴灌支管常年在 0.2~0.6 m/s）。' +
      '    </p>' +
      '  </section>' +
      '</div>';
  }

  /* ---------------- 参数 → DOM ---------------- */
  function mainsHtml() {
    var only1 = cfg.mains.length <= 1;
    return cfg.mains.map(function (m, mi) {
      var taps = m.taps.map(function (t, ti) {
        return '' +
          '<div class="hc-tap-row">' +
          '  <span class="hc-tap-no">' + (ti + 1) + '</span>' +
          '  <input type="number" data-hc="tapAt" data-mi="' + mi + '" data-ti="' + ti + '" min="0" step="10" value="' + t.at + '" title="该三通距本主管起点的距离（m）">' +
          '  <input type="number" list="' + OD_DATALIST_ID + '" data-hc="tapOd" data-mi="' + mi + '" data-ti="' + ti + '" min="1" step="5" value="' + t.od + '" title="支管管径 OD（mm）">' +
          '  <input type="number" data-hc="tapLen" data-mi="' + mi + '" data-ti="' + ti + '" min="0" step="5" value="' + f(t.len, 2) + '" title="支管长度（m）">' +
          '  <input type="number" data-hc="tapFlow" data-mi="' + mi + '" data-ti="' + ti + '" min="0" step="0.5" value="' + f(t.flow, 2) + '" title="该支管末端设计流量（m³/h）">' +
          '  <button type="button" class="hc-btn hc-btn-sm hc-btn-danger" data-hc-act="delTap" data-mi="' + mi + '" data-ti="' + ti + '" title="删除该三通 / 支管"' + (m.taps.length <= 1 ? ' disabled' : '') + '>×</button>' +
          '</div>';
      }).join('');
      return '' +
        '<div class="hc-main-card" data-main="' + mi + '">' +
        '  <div class="hc-main-card-h">' +
        '    <strong>主管 ' + (mi + 1) + '</strong>' +
        '    <span class="hc-sp"></span>' +
        '    <button type="button" class="hc-btn hc-btn-sm" data-hc-act="addTap" data-mi="' + mi + '">＋ 三通</button>' +
        '    <button type="button" class="hc-btn hc-btn-sm hc-btn-danger" data-hc-act="delMain" data-mi="' + mi + '"' + (only1 ? ' disabled' : '') + '>删除主管</button>' +
        '  </div>' +
        '  <div class="hc-row"><label>管径 OD</label><input type="number" list="' + OD_DATALIST_ID + '" data-hc="mainOd" data-mi="' + mi + '" min="1" step="5" value="' + m.od + '"><span class="hc-unit">mm</span></div>' +
        '  <div class="hc-row"><label>长度</label><input type="number" data-hc="mainLen" data-mi="' + mi + '" min="0" step="5" value="' + f(m.len, 2) + '"><span class="hc-unit">m</span></div>' +
        '  <div class="hc-row hc-row-ro"><label>流量（累加）</label><b data-hc-out="mainFlow" data-mi="' + mi + '">—</b></div>' +
        '  <div class="hc-tap-row hc-tap-head"><span>支管</span><span>距起点 m</span><span>管径 OD</span><span>长 m</span><span>流量 m³/h</span><span></span></div>' +
        taps +
        '</div>';
    }).join('');
  }

  function renderMains() {
    var box = rootEl.querySelector('#' + MAINS_ID);
    if (box) box.innerHTML = mainsHtml();
    rootEl.querySelector('[data-hc="trunkOd"]').value = cfg.trunk.od;
    rootEl.querySelector('[data-hc="trunkLen"]').value = f(cfg.trunk.len, 2);
    rootEl.querySelector('[data-hc="C"]').value = cfg.C;
    rootEl.querySelector('[data-hc="juncZeta"]').value = cfg.juncZeta;
    rootEl.querySelector('[data-hc="caliber"]').value = cfg.caliber;
    rootEl.querySelector('[data-hc="includeLocal"]').checked = !!cfg.includeLocal;
    if (!rootEl.querySelector('[data-hc="bulkFlow"]').value) {
      rootEl.querySelector('[data-hc="bulkFlow"]').value = (cfg.mains[0] && cfg.mains[0].taps[0]) ? f(cfg.mains[0].taps[0].flow, 2) : f(6, 2);
    }
    renderPathPickers();
  }

  function renderPathPickers() {
    var sm = rootEl.querySelector('[data-hc="pathMain"]');
    var st = rootEl.querySelector('[data-hc="pathTap"]');
    var mi = Math.max(0, Math.min(cfg.mains.length - 1, parseInt(sm.value, 10) || 0));
    sm.innerHTML = cfg.mains.map(function (m, i) {
      return '<option value="' + i + '">主管 ' + (i + 1) + '</option>';
    }).join('');
    sm.value = String(mi);
    var taps = cfg.mains[mi].taps;
    var ti = Math.max(0, Math.min(taps.length - 1, parseInt(st.value, 10) || 0));
    st.innerHTML = taps.map(function (t, j) {
      return '<option value="' + j + '">支管 ' + (j + 1) + '（' + f(t.len, 2) + ' m / ' + f(t.flow, 2) + ' m³/h）</option>';
    }).join('');
    st.value = String(ti);
  }

  function curPath() {
    var mi = Math.max(0, Math.min(cfg.mains.length - 1, parseInt(rootEl.querySelector('[data-hc="pathMain"]').value, 10) || 0));
    var n = cfg.mains[mi].taps.length;
    var ti = Math.max(0, Math.min(n - 1, parseInt(rootEl.querySelector('[data-hc="pathTap"]').value, 10) || 0));
    return { mi: mi, ti: ti };
  }

  /* ---------------- 管网示意图（图上网选路径，2026-09-17 第六十三轮） ----------------
   * 用户：「我想要的是通过图来模拟，就是把我刚才说的画个图出来，然后选择不同的管道路径
   *        水头损失的变化情况计算出来。」
   *
   * 画法（树状示意，横向 = 沿管长方向）：
   *   水源 ──总管──┬── 主管1 ──┬───┬───┬───┬     每条主管占一条「车道」；
   *                │           支1 支2 支3 支4     支管自车道向下伸出，
   *                └── 主管2 ──┬───┬───┬───┬     末端标注**该路径合计**水头损失。
   *   · 分水口位置按「该三通距起点 ÷ 主管长」**按比例落点** —— 改长度 / 改距起点，图上立刻看出疏密变化；
   *   · 线宽按管径（相对全图最大管径）—— 粗细一眼可比；
   *   · 管径 / 长度 / 流量一改，本图随 renderResults() 整体重画（图与数值必然同源）。
   *
   * ★ 图上每个支管末端的 Σ 值**直接取 Core.allPaths() 同一行**，不另算一套 ——
   *   e2e 会逐值比对「图上数字 vs 对比表数字」，防止两处口径漂移。
   */
  var NET = {
    PAD_L: 58, PAD_T: 36, PAD_R: 16, PAD_B: 22,
    X_SRC: 26,               /* 水源圆心 x */
    TRUNK_MIN: 96, TRUNK_MAX: 210,
    MAIN_LEN: 520,           /* 主管起点 → 末端的像素长 */
    BRANCH_H: 52,            /* 支管竖直段像素长 */
    LANE_GAP: 132,           /* 相邻主管车道间距（须 > BRANCH_H + 末端标注高） */
    ARC_DX: 34               /* 分水立管 → 主管起点 */
  };

  /* 小箭头（不引 marker：marker 的颜色无法跟着高亮态变，会让"当前路径"箭头仍是灰的） */
  function netArrow(x, y, dir) {
    var w = 4.5;
    if (dir === 'd') return 'M' + (x - w) + ',' + (y - 8) + 'L' + (x + w) + ',' + (y - 8) + 'L' + x + ',' + y + 'Z';
    return 'M' + (x - 8) + ',' + (y - w) + 'L' + (x - 8) + ',' + (y + w) + 'L' + x + ',' + y + 'Z';
  }

  /* 生成整张图的 SVG 字符串。sel = {mi,ti} 当前路径；all = Core.allPaths(cfg) 的结果。 */
  function netSvgHtml(sel, all) {
    var c = cfg, n = c.mains.length;
    var maxMain = 0, maxOd = 1;
    c.mains.forEach(function (m) {
      if (m.len > maxMain) maxMain = m.len;
      if (m.od > maxOd) maxOd = m.od;
      m.taps.forEach(function (t) { if (t.od > maxOd) maxOd = t.od; });
    });
    if (c.trunk.od > maxOd) maxOd = c.trunk.od;

    var tl = Math.max(0, c.trunk.len);
    var trunkPx = NET.TRUNK_MIN + (NET.TRUNK_MAX - NET.TRUNK_MIN) * ((tl + maxMain) > 0 ? tl / (tl + maxMain) : 0);
    var laneY = function (i) { return NET.PAD_T + 26 + i * NET.LANE_GAP; };
    var yMid = (laneY(0) + laneY(n - 1)) / 2;
    var xSplit = NET.PAD_L + trunkPx;
    var xMain0 = xSplit + NET.ARC_DX;
    var xEnd = xMain0 + NET.MAIN_LEN;
    var W = Math.round(xEnd + 64 + NET.PAD_R);
    var H = Math.round(laneY(n - 1) + NET.BRANCH_H + 58 + NET.PAD_B);
    var swOf = function (od) { return Math.round((1.5 + 4.5 * Math.min(1, od / maxOd)) * 10) / 10; };

    var byPath = {};
    all.rows.forEach(function (r) { byPath[r.mi + ',' + r.ti] = r; });

    var o = [];
    var T = function (x, y, s, cls, anchor) {
      return '<text class="hc-nt ' + (cls || '') + '" x="' + Math.round(x) + '" y="' + Math.round(y) + '"' +
        (anchor ? ' text-anchor="' + anchor + '"' : '') + '>' + s + '</text>';
    };
    o.push('<svg id="' + NET_SVG_ID + '" class="hc-net-svg" width="' + W + '" height="' + H +
      '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="管网示意图：点选管道路径查看水头损失">');

    /* ── 水源 ── */
    o.push('<circle class="hc-nsrc" cx="' + NET.X_SRC + '" cy="' + yMid + '" r="8"/>');
    o.push(T(NET.X_SRC, yMid + 26, '水源', 'hc-nt-lab', 'middle'));

    /* ── 总管（所有路径共用，恒为「在路径上」→ 恒绿）── */
    var swT = swOf(c.trunk.od);
    o.push('<line class="hc-npipe hc-non" x1="' + (NET.X_SRC + 8) + '" y1="' + yMid + '" x2="' + xSplit +
      '" y2="' + yMid + '" stroke-width="' + swT + '"/>');
    /* v57：选中路径水流动画——白色流动虚线叠加在管道上（绘制方向=水流方向） */
    o.push('<line class="hc-nflow" x1="' + (NET.X_SRC + 8) + '" y1="' + yMid + '" x2="' + xSplit +
      '" y2="' + yMid + '" stroke-width="' + Math.min(2.2, swT * 0.5) + '"/>');
    o.push('<path class="hc-narw hc-non" d="' + netArrow(xSplit, yMid, 'r') + '"/>');
    var xT = (NET.X_SRC + 8 + xSplit) / 2;
    o.push(T(xT, yMid - 25, '总管 Ø' + Core.fmt(c.trunk.od), 'hc-nt-lab hc-nt-b', 'middle'));
    o.push(T(xT, yMid - 12, f(c.trunk.len, 2) + ' m · Q ' + f(all.trunkFlow, 2), 'hc-nt-lab', 'middle'));

    /* ── 分水立管（多主管时才有实线段）+ 分水节点 ── */
    if (n > 1) {
      o.push('<line class="hc-npipe hc-non" x1="' + xSplit + '" y1="' + laneY(0) + '" x2="' + xSplit +
        '" y2="' + laneY(n - 1) + '" stroke-width="' + swT + '"/>');
      /* v57：立管上只画水源 → 所选主管那段（车道方向） */
      o.push('<line class="hc-nflow" x1="' + xSplit + '" y1="' + yMid + '" x2="' + xSplit +
        '" y2="' + laneY(sel.mi) + '" stroke-width="' + Math.min(2.2, swT * 0.5) + '"/>');
    }
    o.push('<circle class="hc-nnode hc-non" cx="' + xSplit + '" cy="' + yMid + '" r="4.5"/>');
    if (n > 1) o.push(T(xSplit, yMid + 22, '分水三通', 'hc-nt-lab hc-nt-dim', 'middle'));

    /* ── 各主管「车道」+ 分水口 + 支管 ── */
    c.mains.forEach(function (m, i) {
      var y = laneY(i), M = m.taps.length;
      var xAt = function (t) {
        return m.len > 0 ? xMain0 + NET.MAIN_LEN * Math.max(0, Math.min(1, t.at / m.len)) : xMain0;
      };
      var slot = NET.MAIN_LEN / Math.max(1, M);
      o.push(T(xMain0, y - 14, '主管' + (i + 1) + ' Ø' + Core.fmt(m.od) + ' · ' + f(m.len, 2) + ' m · Q ' +
        f(Core.mainFlow(c, i), 2) + ' m³/h', 'hc-nt-lab hc-nt-b' + (i === sel.mi ? ' hc-non-t' : '')));
      var prev = xMain0;
      m.taps.forEach(function (t, j) {
        var x = Math.max(prev, xAt(t));      /* 位置重合/逆序时退化成一个点，保证段长非负 */
        var isSeg = (i === sel.mi && j <= sel.ti);   /* 本段在所选路径上 */
        var isTap = (i === sel.mi && j === sel.ti);  /* 整根支管在所选路径末端 */
        var row = byPath[i + ',' + j] || {};
        var yb = y + NET.BRANCH_H;
        o.push('<g class="' + ('hc-nhot' + (isTap ? ' is-on' : '')) + '" data-hc-path="' + i + ',' + j + '"' +
          ' tabindex="0" role="button" aria-label="' + esc(row.label || ('主管' + (i + 1) + ' 支管' + (j + 1))) + '">');
        o.push('<title>' + esc((row.label || '') + '　合计 ' + f(row.total || 0, 3) + ' m（沿程 ' +
          f(row.hf || 0, 3) + ' + 局部 ' + f(row.hlocal || 0, 3) + '）') + '</title>');
        /* 可点热区：本段主管（prev → x）+ 下方支管与标注整块 */
        o.push('<rect class="hc-nhit" x="' + Math.round(prev - 6) + '" y="' + Math.round(y - 12) +
          '" width="' + Math.round((x - prev) + 12) + '" height="' + (NET.BRANCH_H + 62) + '"/>');
        /* 本段主管 */
        if (x - prev > 0.5) {
          o.push('<line class="hc-npipe' + (isSeg ? ' hc-non' : '') + '" x1="' + Math.round(prev) + '" y1="' + y +
            '" x2="' + Math.round(x) + '" y2="' + y + '" stroke-width="' + swOf(m.od) + '"/>');
          if (isSeg) o.push('<line class="hc-nflow" x1="' + Math.round(prev) + '" y1="' + y +
            '" x2="' + Math.round(x) + '" y2="' + y + '" stroke-width="' + Math.min(2, swOf(m.od) * 0.45) + '"/>');
        }
        /* 分水口 */
        o.push('<circle class="' + (isSeg ? 'hc-nnode hc-non' : 'hc-nnode-off') + '" cx="' + Math.round(x) +
          '" cy="' + y + '" r="' + (isTap ? 5 : 4) + '"/>');
        /* 支管竖直段 + 流向箭头 + 末端节点 */
        o.push('<line class="hc-npipe' + (isSeg ? ' hc-non' : '') + '" x1="' + Math.round(x) + '" y1="' + y +
          '" x2="' + Math.round(x) + '" y2="' + yb + '" stroke-width="' + swOf(t.od) + '"/>');
        if (isTap) o.push('<line class="hc-nflow" x1="' + Math.round(x) + '" y1="' + y +
          '" x2="' + Math.round(x) + '" y2="' + yb + '" stroke-width="' + Math.min(2, swOf(t.od) * 0.45) + '"/>');
        o.push('<path class="hc-narw' + (isSeg ? ' hc-non' : '') + '" d="' + netArrow(x, yb - 2, 'd') + '"/>');
        o.push('<circle class="' + (isTap ? 'hc-nend hc-non' : 'hc-nend') + '" cx="' + Math.round(x) +
          '" cy="' + (yb + 4) + '" r="3.5"/>');
        /* 末端标注：槽位够宽才写全名（相邻太挤时自动精简，避免叠字） */
        var l1 = slot >= 96 ? ('支管' + (j + 1) + ' ' + Core.fmt(t.od) + '/' + Core.fmt(t.len)) : (slot >= 62 ? ('支' + (j + 1)) : '');
        if (l1) o.push(T(x, yb + 20, esc(l1), 'hc-nt-lab', 'middle'));
        if (slot >= 62) {
          o.push(T(x, yb + 35, 'Σ ' + f(row.total || 0, 2) + ' m',
            'hc-nt-sum' + (row.isWorst ? ' hc-nworst' : (row.isBest ? ' hc-nbest' : '')) + (isTap ? ' is-on' : ''), 'middle'));
        }
        o.push('</g>');
        prev = x;
      });
      /* 最后一个分水口之后若还剩管段（用户把三通都没放到末端）→ 虚线画出来，标明本路径无流量 */
      if (m.len > 0 && xEnd - prev > 4) {
        o.push('<line class="hc-ntail" x1="' + Math.round(prev) + '" y1="' + y + '" x2="' + Math.round(xEnd) +
          '" y2="' + y + '" stroke-width="' + swOf(m.od) + '"/>');
      }
    });

    o.push('</svg>');
    return o.join('');
  }

  /* 画图 + 刷新图下那句话（每次 renderResults 都重画 → 与数值必然同源） */
  function renderNet(res, all) {
    var box = rootEl.querySelector('#' + NET_BOX_ID);
    if (!box) return;
    box.innerHTML = netSvgHtml({ mi: res.mi, ti: res.ti }, all);
    var cur = rootEl.querySelector('[data-hc-out="netCur"]');
    if (cur) {
      cur.innerHTML = '当前路径 <b>' + esc(res.label) + '</b>：合计 <b>' + f(res.total, 3) + ' m</b>' +
        '（沿程 ' + f(res.hf, 3) + ' + 局部 ' + f(res.hlocal, 3) + '）' +
        '　·　图上 ' + all.rows.length + ' 条组合路径都已标出各自合计，点一下即切换';
    }
  }

  /* 选中路径（下拉与图上点击共用同一条通道）：先写 pathMain 再重填 pathTap，
     最后 renderResults() 让图 / hero / 明细 / 对比表一起跟上。 */
  function selectPath(mi, ti) {
    if (!rootEl || !cfg) return;
    mi = Math.max(0, Math.min(cfg.mains.length - 1, parseInt(mi, 10) || 0));
    var sm = rootEl.querySelector('[data-hc="pathMain"]');
    if (!sm) return;
    sm.value = String(mi);
    renderPathPickers();
    sm.value = String(mi);
    var taps = cfg.mains[mi].taps;
    ti = Math.max(0, Math.min(taps.length - 1, parseInt(ti, 10) || 0));
    rootEl.querySelector('[data-hc="pathTap"]').value = String(ti);
    renderResults();
  }

  /* ---------------- 结果 ---------------- */
  function renderResults() {
    var p = curPath();
    var res = Core.pathLoss(cfg, p.mi, p.ti);
    var sums = Core.summary(cfg);

    var set = function (k, v, mi) {
      var sel = '[data-hc-out="' + k + '"]' + (mi === undefined ? '' : '[data-mi="' + mi + '"]');
      var el = rootEl.querySelector(sel);
      if (el) el.innerHTML = v;
    };

    set('total', f(res.total, 3));
    set('hf', f(res.hf, 3));
    set('hlocal', f(res.hlocal, 3));
    set('trunkFlow', f(res.trunkFlow, 2) + ' m³/h（' + sums.taps + ' 根支管之和）');
    cfg.mains.forEach(function (m, i) { set('mainFlow', f(Core.mainFlow(cfg, i), 2) + ' m³/h', i); });

    var legLen = res.legs.reduce(function (s, l) { return s + l.L; }, 0);
    set('pathText', '<b>' + esc(res.label) + '</b><br>总管 ' + f(cfg.trunk.len, 2) + ' m + 主管' + (p.mi + 1) + ' ' +
      f(res.legs.reduce(function (s, l) { return s + (l.kind === 'main' ? l.L : 0); }, 0), 2) + ' m + 支管' + (p.ti + 1) + ' ' +
      f(cfg.mains[p.mi].taps[p.ti].len, 2) + ' m = <b>' + f(legLen, 2) + ' m</b>；本路流量由支管末端反推（'
      + f(res.tapFlowIn, 2) + ' m³/h → 主管 ' + f(res.mainFlow, 2) + ' m³/h → 总管 ' + f(res.trunkFlow, 2) + ' m³/h）');
    set('pickNote', '共 ' + sums.mains + ' 根主管 × ' + cfg.mains[p.mi].taps.length + ' 根支管');
    set('combNote', sums.taps + ' 条组合路径 · 全部管道总长 ' + f(sums.totalLen, 2) + ' m');

    var all = Core.allPaths(cfg);
    renderNet(res, all);
    renderLegTable(res);
    renderAllTable(all, p);
  }

  function renderLegTable(res) {
    var t = rootEl.querySelector('#' + LEG_TABLE_ID);
    if (!t) return;
    var h = '<thead><tr><th>管段 / 损失项</th><th>管径 OD(mm)</th><th>内径(mm)</th><th>长度(m)</th>' +
      '<th>流量(m³/h)</th><th>流速(m/s)</th><th>沿程(m)</th><th>局部(m)</th><th>小计(m)</th></tr></thead><tbody>';
    res.legs.forEach(function (l) {
      var chip = '';
      if (l.status === '流速偏高') chip = '<span class="hc-chip hc-chip-warn">偏高</span>';
      else if (l.status === '流速偏低') chip = '<span class="hc-chip hc-chip-low">偏低</span>';
      h += '<tr>' +
        '<td class="hc-td-name">' + esc(l.name) + '</td>' +
        '<td>' + f(l.od, 0) + '</td><td>' + f(l.id, 1) + '</td><td>' + f(l.L, 2) + '</td>' +
        '<td>' + f(l.Q, 2) + '</td><td>' + f(l.v, 3) + chip + '</td>' +
        '<td>' + f(l.hf, 3) + '</td><td>—</td><td>' + f(l.hf, 3) + '</td></tr>';
    });
    res.localLegs.forEach(function (l) {
      h += '<tr>' +
        '<td class="hc-td-name">局部 · ' + esc(l.name) + '</td>' +
        '<td>—</td><td>—</td><td>—</td><td>—</td><td>' + f(l.v, 3) + '</td>' +
        '<td>—</td><td>' + f(l.hf, 3) + '</td><td>' + f(l.hf, 3) + '</td></tr>';
    });
    var legLen = res.legs.reduce(function (s, l) { return s + l.L; }, 0);
    h += '<tr class="hc-row-sum"><td class="hc-td-name">合计（' + esc(res.label) + '）</td>' +
      '<td>—</td><td>—</td><td>' + f(legLen, 2) + '</td><td>' + f(res.trunkFlow, 2) + '</td><td>—</td>' +
      '<td>' + f(res.hf, 3) + '</td><td>' + f(res.hlocal, 3) + '</td><td>' + f(res.total, 3) + '</td></tr>';
    h += '</tbody>';
    t.innerHTML = h;
  }

  /* 全部组合表：直接吃 Core.allPaths() 的行（每行自带 mi/ti/流量/损失/最不利标记），
     不再自己去 pathLoss 一遍 —— 之前误读 summary() 上并不存在的 rows 字段，导致整块渲染抛异常。 */
  function renderAllTable(all, sel) {
    var t = rootEl.querySelector('#' + ALL_TABLE_ID);
    if (!t) return;
    var h = '<thead><tr><th>#</th><th>路径</th><th>主管流量(m³/h)</th><th>支管流量(m³/h)</th>' +
      '<th>沿程(m)</th><th>局部(m)</th><th>合计(m)</th><th>备注</th></tr></thead><tbody>';
    all.rows.forEach(function (r) {
      var isSel = (r.mi === sel.mi && r.ti === sel.ti);
      var mark = [];
      if (r.isWorst) mark.push('<span class="hc-chip hc-chip-worst">最不利</span>');
      if (r.isBest) mark.push('<span class="hc-chip hc-chip-low">最有利</span>');
      if (isSel) mark.push('<span class="hc-chip">当前</span>');
      h += '<tr class="' + (r.isWorst ? 'hc-row-worst' : '') + '">' +
        '<td>' + (r.mi + 1) + '-' + (r.ti + 1) + '</td>' +
        '<td class="hc-td-name">总管 → 主管' + (r.mi + 1) + ' → 支管' + (r.ti + 1) + '</td>' +
        '<td>' + f(r.Qmain, 2) + '</td><td>' + f(r.Qtap, 2) + '</td>' +
        '<td>' + f(r.hf, 3) + '</td><td>' + f(r.hlocal, 3) + '</td>' +
        '<td><b>' + f(r.total, 3) + '</b></td>' +
        '<td>' + mark.join('') + '</td></tr>';
    });
    h += '</tbody>';
    t.innerHTML = h;
  }

  /* ---------------- 输入 → cfg ---------------- */
  /* 把 DOM 上所有 [data-hc] 的当前值读回 cfg。不做归一化（保存/重排由调用方决定）。 */
  function syncFromDom() {
    var q = function (sel) { return rootEl.querySelector(sel); };
    var n = Core.num;
    cfg.C = n(q('[data-hc="C"]').value, cfg.C);
    cfg.juncZeta = Core.nonNeg(q('[data-hc="juncZeta"]').value);
    cfg.caliber = Core.validCaliber(q('[data-hc="caliber"]').value);
    cfg.includeLocal = !!q('[data-hc="includeLocal"]').checked;
    cfg.trunk.od = Core.pos(q('[data-hc="trunkOd"]').value, cfg.trunk.od);
    cfg.trunk.len = Core.nonNeg(q('[data-hc="trunkLen"]').value);
    cfg.mains.forEach(function (m, mi) {
      var om = q('[data-hc="mainOd"][data-mi="' + mi + '"]');
      var lm = q('[data-hc="mainLen"][data-mi="' + mi + '"]');
      if (om) m.od = Core.pos(om.value, m.od);
      if (lm) m.len = Core.nonNeg(lm.value);
      m.taps.forEach(function (t, ti) {
        var s = '[data-mi="' + mi + '"][data-ti="' + ti + '"]';
        var a = q('[data-hc="tapAt"]' + s), o = q('[data-hc="tapOd"]' + s);
        var l = q('[data-hc="tapLen"]' + s), fl = q('[data-hc="tapFlow"]' + s);
        if (a) t.at = Core.nonNeg(a.value);
        if (o) t.od = Core.pos(o.value, t.od);
        if (l) t.len = Core.nonNeg(l.value);
        if (fl) t.flow = Core.nonNeg(fl.value);
      });
    });
  }

  /* 归一化后，若 DOM 上某个输入框的显示值与归一化结果不一致（被 clamp / 排序 / 去非法），
     才重建主管卡 —— 避免每次输入都重建 DOM 导致焦点丢失。 */
  function domOutOfSync() {
    var q = function (sel) { return rootEl.querySelector(sel); };
    /* 长度类输入框显示的是两位补零串（'40.00'），内部是 40 —— 必须按数值 + 两位取整比，
       否则每次渲染都判「不同步」而重建卡片。管径 / 距起点仍按原字符串比对（未做补零）。 */
    var sameNum = function (el, val) { return !!el && Core.r2(Number(el.value) || 0) === Core.r2(Number(val) || 0); };
    if (String(q('[data-hc="trunkOd"]').value) !== String(cfg.trunk.od)) return true;
    if (!sameNum(q('[data-hc="trunkLen"]'), cfg.trunk.len)) return true;
    for (var mi = 0; mi < cfg.mains.length; mi++) {
      if (!q('[data-hc="mainOd"][data-mi="' + mi + '"]')) return true;
      if (String(q('[data-hc="mainOd"][data-mi="' + mi + '"]').value) !== String(cfg.mains[mi].od)) return true;
      if (!sameNum(q('[data-hc="mainLen"][data-mi="' + mi + '"]'), cfg.mains[mi].len)) return true;
      for (var ti = 0; ti < cfg.mains[mi].taps.length; ti++) {
        var s = '[data-mi="' + mi + '"][data-ti="' + ti + '"]';
        var a = q('[data-hc="tapAt"]' + s);
        if (!a) return true;
        if (String(a.value) !== String(cfg.mains[mi].taps[ti].at)) return true;
      }
    }
    return false;
  }

  /* ---------------- 动作 ---------------- */
  function resetCfg() {
    cfg = Core.defaultConfig();
    renderMains();
    renderResults();
    saveCfg();
  }

  function act(name, mi, ti) {
    if (name === 'addMain') {
      syncFromDom();
      var last = cfg.mains[cfg.mains.length - 1];
      cfg.mains.push({
        od: last ? last.od : 160,
        len: last ? last.len : 0,
        taps: [{ at: last ? last.len : 0, od: 110, len: 80, flow: last && last.taps[0] ? last.taps[0].flow : 6 }]
      });
    } else if (name === 'delMain') {
      if (cfg.mains.length <= 1) return;
      syncFromDom();
      cfg.mains.splice(mi, 1);
    } else if (name === 'addTap') {
      syncFromDom();
      var m = cfg.mains[mi];
      if (!m) return;
      var prev = m.taps[m.taps.length - 1];
      m.taps.push({ at: m.len, od: prev ? prev.od : 110, len: prev ? prev.len : 80, flow: prev ? prev.flow : 6 });
    } else if (name === 'delTap') {
      var m2 = cfg.mains[mi];
      if (!m2 || m2.taps.length <= 1) return;
      syncFromDom();
      m2.taps.splice(ti, 1);
    } else if (name === 'applyBulkFlow') {
      syncFromDom();
      var v = Core.nonNeg(rootEl.querySelector('[data-hc="bulkFlow"]').value);
      cfg.mains.forEach(function (mm) { mm.taps.forEach(function (t) { t.flow = v; }); });
    } else if (name === 'reset') {
      resetCfg();
      return;
    } else if (name === 'jumpWorst') {
      syncFromDom();
      cfg = nm(cfg);
      var w = Core.worstPath(cfg);
      if (w) {
        rootEl.querySelector('[data-hc="pathMain"]').value = String(w.mi);
        renderPathPickers();
        rootEl.querySelector('[data-hc="pathMain"]').value = String(w.mi);
        rootEl.querySelector('[data-hc="pathTap"]').value = String(w.ti);
      }
      renderResults();
      saveCfg();
      return;
    } else return;

    cfg = nm(cfg);
    renderMains();
    renderResults();
    saveCfg();
  }

  /* ---------------- 事件 ---------------- */
  function bind() {
    rootEl.addEventListener('input', function (ev) {
      var el = ev.target;
      if (!el || !el.getAttribute || !el.getAttribute('data-hc')) return;
      var k = el.getAttribute('data-hc');
      if (k === 'bulkFlow') return;              /* 统一流量输入框是「动作参数」，不入 cfg */
      syncFromDom();
      renderResults();                           /* 只刷结果：不动输入框 DOM，避免焦点丢失 */
    });
    rootEl.addEventListener('change', function (ev) {
      var el = ev.target;
      if (!el || !el.getAttribute || !el.getAttribute('data-hc')) return;
      var k = el.getAttribute('data-hc');
      if (k === 'bulkFlow') return;
      /* 路径下拉：换主管要连支管下拉一起重填（各主管的三通数可以不同），
         否则会留下「上一根主管的支管项」。路径不入存档，故不 saveCfg。 */
      if (k === 'pathMain') { renderPathPickers(); renderResults(); return; }
      if (k === 'pathTap') { renderResults(); return; }
      syncFromDom();
      cfg = nm(cfg);                 /* 失焦时做归一化（clamp / 排序） */
      if (domOutOfSync()) renderMains();         /* 只在显示值真的被纠正时才重建 */
      renderResults();
      saveCfg();
    });
    rootEl.addEventListener('click', function (ev) {
      /* 图上选路径优先（第六十三轮）：点中任一分段 / 支管 → 选中该条路径 */
      var hot = ev.target && ev.target.closest ? ev.target.closest('[data-hc-path]') : null;
      if (hot) {
        var pp = String(hot.getAttribute('data-hc-path') || '').split(',');
        selectPath(parseInt(pp[0], 10), parseInt(pp[1], 10));
        return;
      }
      var el = ev.target && ev.target.closest ? ev.target.closest('[data-hc-act]') : null;
      if (!el || el.disabled) return;
      var mi = parseInt(el.getAttribute('data-mi'), 10);
      var ti = parseInt(el.getAttribute('data-ti'), 10);
      act(el.getAttribute('data-hc-act'), isFinite(mi) ? mi : 0, isFinite(ti) ? ti : 0);
    });
  }

  /* ---------------- 挂载 ----------------
   * 幂等 + 自愈：判定依据是「.hc-wrap 是否仍在文档里」而不是一个布尔标志 ——
   * 只要区块被外部清空（或换过 DOM），下一次 mount() 会重新建壳并重挂事件，配置依然保留。
   * ★ 为什么不能只靠 IntersectionObserver：IO 依赖元素真的与视口相交，
   *   而本区块在「非工具模式」下是 height:auto 的空区块（高度 0）→ 可能永远不相交、永不挂载；
   *   所以另加「显式展示钩子」（ryShowSection / ryJumpToSection 命中本区块就挂载）双保险。
   */
  function mount() {
    var sec = document.getElementById(SEC_ID);
    if (!sec || !Core) return null;
    var wrap = sec.querySelector('.hc-wrap');
    if (!wrap) sec.insertAdjacentHTML('beforeend', shellHtml());
    rootEl = sec.querySelector('.hc-wrap');
    if (!rootEl.__hcBound) { bind(); rootEl.__hcBound = 1; }
    if (!cfg) cfg = loadCfg() || Core.defaultConfig();
    renderMains();
    renderResults();
    if (lastSrc) {
      var srcEl = rootEl.querySelector('[data-hc="srcNote"]');
      if (srcEl) { srcEl.innerHTML = srcNoteHtml(); srcEl.style.display = ''; }
    }
    return rootEl;
  }

  /* 命中本区块就挂载：包一层同名全局函数（原函数行为逐一保持，只多一次 mount()）。
     · 工具模式：ryJumpToSection → 内部调 ryShowSection → 两条路都覆盖；
     · 非工具模式：ryJumpToSection 自己就是入口，直接覆盖。 */
  function hookShow() {
    ['ryShowSection', 'ryJumpToSection'].forEach(function (name) {
      var orig = window[name];
      if (typeof orig !== 'function' || orig.__hcHooked) return;
      var wrapped = function () {
        var r = orig.apply(this, arguments);
        try {
          var a0 = arguments[0];
          var id = (typeof a0 === 'string') ? a0 : (a0 && a0.id);
          if (id === SEC_ID) mount();
        } catch (e) { }
        return r;
      };
      wrapped.__hcHooked = 1;
      window[name] = wrapped;
    });
  }

  function autoMount() {
    hookShow();
    var sec = document.getElementById(SEC_ID);
    if (!sec) return;
    if (window.IntersectionObserver && !sec.querySelector('.hc-wrap')) {
      var io = new IntersectionObserver(function (es) {
        for (var i = 0; i < es.length; i++) {
          if (es[i].isIntersecting) { io.disconnect(); mount(); return; }
        }
      });
      io.observe(sec);
    }
  }

  /* ---------------- 对外 API ---------------- */
  window.RyHydraulicCalc = {
    core: Core,
    SEC_ID: SEC_ID,
    CFG_KEY: CFG_KEY,
    mount: mount,
    autoMount: autoMount,
    isMounted: isMountedNow,
    root: function () { return rootEl; },
    getConfig: function () { return cfg ? clone(cfg) : null; },
    setConfig: function (c) {
      cfg = nm(c);
      if (!isMountedNow()) mount();
      renderMains(); renderResults(); saveCfg();
      return cfg;
    },
    /* 三级方案数据导入（2026-09-19）：地块划分→三级管线图生成后自动推送全分区数据。
       data = { trunk:{od,len}, mains:[{od,len,taps:[{at,od,len,flow}]}], srcTitle, srcRows }；
       trunkFlow=Σ主管流量=combinedFlow（mains 为三级侧组装的最远 zoneCount 根主管）；normalize 负责数值清洗（at clamp/排序）；
       导入后自动跳到最不利路径，左栏顶部显示来源行。注意：会覆盖当前 cfg（自动推送口径，用户已确认）。 */
    importThreeLevel: function (data) {
      /* v2.1（2026-09-19 用户核对流量）：联合灌溉口径 —— data.mains 为三级侧按「最远 zoneCount 区」组装的主管组
         （全图轮灌、同时只开 zoneCount 区），trunkFlow=Σ主管流量=combinedFlow。 */
      var mains = (data && data.mains || []).filter(function (m) {
        if (!m || !(m.od > 0) || !m.taps || !m.taps.length) return false;
        for (var ti = 0; ti < m.taps.length; ti++) if (!m.taps[ti] || !(m.taps[ti].od > 0)) return false;
        return true;
      });
      if (!data || !data.trunk || !mains.length) return null;
      var c = Core.defaultConfig();
      c.trunk = { od: data.trunk.od, len: data.trunk.len };
      c.mains = mains;
      cfg = nm(c);
      lastSrc = { title: data.srcTitle || data.src || '', rows: data.srcRows || [] };
      if (!isMountedNow()) mount();
      renderMains(); renderResults();
      try {
        var w = Core.worstPath(cfg);
        if (w) selectPath(w.mi, w.ti);
      } catch (e) { }
      var srcEl = rootEl && rootEl.querySelector('[data-hc="srcNote"]');
      if (srcEl) { srcEl.innerHTML = srcNoteHtml(); srcEl.style.display = lastSrc ? '' : 'none'; }
      saveCfg();
      return cfg;
    },
    reset: resetCfg,
    refresh: function () { renderMains(); renderResults(); },
    path: curPath,
    selectPath: selectPath,
    worstPath: function () { return cfg ? Core.worstPath(cfg) : null; },
    summary: function () { return cfg ? Core.summary(cfg) : null; },
    /* 供 e2e 读渲染结果（读 DOM，不信任内部状态） */
    legRows: function () {
      var t = rootEl && rootEl.querySelector('#' + LEG_TABLE_ID);
      if (!t) return null;
      return Array.prototype.slice.call(t.querySelectorAll('tbody tr')).map(function (tr) {
        return Array.prototype.slice.call(tr.children).map(function (td) { return td.textContent.trim(); });
      });
    },
    allRows: function () {
      var t = rootEl && rootEl.querySelector('#' + ALL_TABLE_ID);
      if (!t) return null;
      return Array.prototype.slice.call(t.querySelectorAll('tbody tr')).map(function (tr) {
        return Array.prototype.slice.call(tr.children).map(function (td) { return td.textContent.trim(); });
      });
    },
    /* 图上路径（第六十三轮）：三条只读钩子，全部从**渲染出的 DOM** 里读，
       不返回任何内部状态 —— 这样 e2e 断言的是「用户真的看到了什么」。 */
    netSvg: function () {
      var s = rootEl && rootEl.querySelector('#' + NET_SVG_ID);
      return s ? s.outerHTML : null;
    },
    netPaths: function () {
      var s = rootEl && rootEl.querySelector('#' + NET_SVG_ID);
      if (!s) return null;
      return Array.prototype.map.call(s.querySelectorAll('[data-hc-path]'), function (g) {
        return g.getAttribute('data-hc-path');
      });
    },
    netSums: function () {
      var s = rootEl && rootEl.querySelector('#' + NET_SVG_ID);
      if (!s) return null;
      return Array.prototype.map.call(s.querySelectorAll('[data-hc-path]'), function (g) {
        var sum = g.querySelector('.hc-nt-sum'), ti = g.querySelector('title');
        var cls = (g.getAttribute('class') || '');
        return {
          path: g.getAttribute('data-hc-path'), on: cls.indexOf('is-on') >= 0, cls: cls,
          total: sum ? parseFloat(String(sum.textContent).replace(/[^\d.]/g, '')) : null,
          title: ti ? ti.textContent : ''
        };
      });
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoMount);
  else autoMount();
})();
