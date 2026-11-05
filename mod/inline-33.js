/* [v978] 设计输入自动持久化（用户 2026-11-05 拍板，决策点①）
 *
 * 事故复盘：v977 上线强制刷新后，二级 fld_* / 三级 tl_* 全部设计输入回退到 HTML
 * 默认值（地块、分组、施工节点都在 localStorage，唯独最关键的滴灌参数没存），
 * 滴灌参数一变 perM2 变 1.2 倍，地图卡片全部流量回到「旧参数时代」——
 * 用户看到的就是「之前的数据冒出来了」。
 *
 * 本模块只做两件事，不碰任何计算：
 *   1. 存：任何 fld_* / tl_* / planSrcDist 输入 change（input 防抖兜底）即整表快照
 *      到 localStorage['runye_design_inputs_v1']；四个支管/布设按钮组的选中态一并记。
 *   2. 还原：页面加载完（本文件是最后一个脚本）按固定顺序回填——
 *      ① fld_* + planSrcDist  →  ② 二级按钮组  →  ③ calcPlan()（二级算一遍，
 *      顺带走「与二级联动」把 tl_ 带成派生值）  →  ④ tl_* 用存档覆盖（用户手改值
 *      必须赢过联动派生值）  →  ⑤ 三级按钮组  →  ⑥ renderThreeLevel/tlUpdatePlanBar
 *      →  ⑦ save() 把最终屏幕态写回（防止中间联动值留在存档里）。
 *      顺序不能倒：先 calcPlan 再覆盖 tl_，保证「手改值 > 联动值」。
 *
 * 边界：
 *   · resetDefaults / resetThreeLevelDefaults 是程序赋值、不触发 change，
 *     这里包一层在复位后补存，否则下次刷新又回到复位前的旧值。
 *   · syncThreeLevelFromPlan（二级→三级联动）同样不触发 change，故意**不**包：
 *     联动写入的是 fld_ 的派生值，fld_ 本身在存档里，下次 calcPlan 会重新派生出
 *     同样的值；存档只保留用户「手动选择」的 tl_ 值（联动语义归决策点②管）。
 *   · 只认 id 前缀 fld_ / tl_ 与 planSrcDist，绝不碰别的输入（搜索框、坐标框等）。
 */
(function () {
  'use strict';
  var LS_KEY = 'runye_design_inputs_v1';
  var ID_RE = /^(fld_|tl_)/;
  var SPECIAL_IDS = { planSrcDist: 1 };
  var GROUPS = ['branchGroup', 'layoutGroup', 'tl_branchGroup', 'tl_layoutGroup'];

  function snapshot() {
    var out = { v: 1, at: new Date().toISOString(), inputs: {}, groups: {} };
    document.querySelectorAll('input[id]').forEach(function (el) {
      var id = el.id || '';
      if (ID_RE.test(id) || SPECIAL_IDS[id]) out.inputs[id] = el.value;
    });
    GROUPS.forEach(function (gid) {
      var sel = document.querySelector('#' + gid + ' button.selected');
      if (sel) out.groups[gid] = sel.dataset.n || sel.dataset.sides || null;
    });
    return out;
  }

  var saveT = 0;
  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(snapshot())); } catch (e) { }
  }
  function saveSoon() {
    try { clearTimeout(saveT); } catch (e) { }
    saveT = setTimeout(save, 400);
  }

  function setGroupSel(gid, val) {
    if (val == null) return;
    var n = Number(val);
    if (!isFinite(n)) return;
    document.querySelectorAll('#' + gid + ' button').forEach(function (b) {
      var bv = (b.dataset.n != null) ? Number(b.dataset.n) : Number(b.dataset.sides);
      if (isFinite(bv)) b.classList.toggle('selected', bv === n);
    });
  }

  /* 还原。返回 true = 确实回填过（供日志/排查）。 */
  function restore() {
    var snap = null;
    try { snap = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) { snap = null; }
    if (!snap || typeof snap !== 'object') return false;
    var inputs = snap.inputs || {};
    var n = 0, i;
    /* ① 二级输入 */
    Object.keys(inputs).forEach(function (id) {
      if (id.indexOf('tl_') === 0) return;               /* tl_ 留到联动之后再覆盖 */
      var el = document.getElementById(id);
      if (el && typeof inputs[id] === 'string' && inputs[id] !== '') { el.value = inputs[id]; n++; }
    });
    /* ② 二级按钮组 */
    setGroupSel('branchGroup', snap.groups && snap.groups.branchGroup);
    setGroupSel('layoutGroup', snap.groups && snap.groups.layoutGroup);
    /* ③ 二级算一遍，顺带走联动把 tl_ 带成派生值（与用户平时改输入的路径完全一致） */
    try { if (typeof window.calcPlan === 'function') window.calcPlan(); } catch (e) { }
    /* ④ 三级输入用存档覆盖 —— 用户手改值赢过联动派生值 */
    Object.keys(inputs).forEach(function (id) {
      if (id.indexOf('tl_') !== 0) return;
      var el = document.getElementById(id);
      if (el && typeof inputs[id] === 'string' && inputs[id] !== '') { el.value = inputs[id]; n++; }
    });
    /* ⑤ 三级按钮组 */
    setGroupSel('tl_branchGroup', snap.groups && snap.groups.tl_branchGroup);
    setGroupSel('tl_layoutGroup', snap.groups && snap.groups.tl_layoutGroup);
    /* ⑥ 刷新三级显示 */
    try { if (typeof window.renderThreeLevel === 'function') window.renderThreeLevel(); } catch (e) { }
    try { if (typeof window.tlUpdatePlanBar === 'function') window.tlUpdatePlanBar(); } catch (e) { }
    /* ⑦ 把最终屏幕态写回存档，防止 ③ 的中间联动值留在存档里 */
    save();
    return n > 0;
  }

  /* ---- 监听：只认设计输入的 id，别的输入一概不存 ---- */
  function isDesignInput(t) {
    return !!(t && t.tagName === 'INPUT' && t.id && (ID_RE.test(t.id) || SPECIAL_IDS[t.id]));
  }
  /* [v981] 决策点②：三级字段被用户亲手改过 → 打脏标记（dataset.ryDirty）。
     二级联动（syncThreeLevelFromPlan 的 setv）见到脏标记就跳过，不再悄悄顶回手改值；
     「↻ 同步」按钮（tlForceSyncFromPlan）先清脏再全量同步 = 用户主动要求覆盖。
     只认真实用户事件（程序赋值不触发 input/change，天然不会误标）。 */
  function markDirty(t) {
    if (isDesignInput(t) && t.id.indexOf('tl_') === 0) {
      try { t.dataset.ryDirty = '1'; } catch (e) { }
    }
  }
  function clearDirty() {
    document.querySelectorAll('input[id^="tl_"]').forEach(function (el) {
      try { delete el.dataset.ryDirty; } catch (e) { }
    });
  }
  document.addEventListener('change', function (ev) {
    if (isDesignInput(ev.target)) { markDirty(ev.target); save(); }
  }, true);
  document.addEventListener('input', function (ev) {
    if (isDesignInput(ev.target)) { markDirty(ev.target); saveSoon(); }
  }, true);
  GROUPS.forEach(function (gid) {
    document.addEventListener('click', function (ev) {
      var t = ev.target && ev.target.closest ? ev.target.closest('#' + gid + ' button') : null;
      if (t) setTimeout(save, 0);   /* 原有 selected 切换先跑完再快照 */
    });
  });

  /* [v981] 决策点②：「↻ 同步」按钮入口 = 用户主动要求强制覆盖手改值。
     先清全部脏标记再走原联动三连（sync → render → planBar）。 */
  window.tlForceSyncFromPlan = function () {
    clearDirty();
    try { if (typeof window.syncThreeLevelFromPlan === 'function') window.syncThreeLevelFromPlan(); } catch (e) { }
    try { if (typeof window.renderThreeLevel === 'function') window.renderThreeLevel(); } catch (e) { }
    try { if (typeof window.tlUpdatePlanBar === 'function') window.tlUpdatePlanBar(); } catch (e) { }
  };

  /* ---- 复位按钮是程序赋值、不触发 change，包一层补存；顺带清脏标记
     （复位后字段不再是「用户手改态」，联动恢复对它们的覆盖权） ---- */
  ['resetDefaults', 'resetThreeLevelDefaults'].forEach(function (fn) {
    var orig = window[fn];
    if (typeof orig === 'function') {
      window[fn] = function () {
        var r = orig.apply(this, arguments);
        if (fn === 'resetThreeLevelDefaults') clearDirty();
        save();
        return r;
      };
    }
  });

  /* ---- 本文件是最后一个脚本，DOM 与全部计算入口都已就位，直接还原 ---- */
  try { restore(); } catch (eRestore) { }
})();
