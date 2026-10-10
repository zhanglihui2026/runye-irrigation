
/* ═══ v239（2026-10-05 用户要求）：驳接点 / 管径 / 水头损失 → 画布右侧悬浮面板 ══════════
   用户原话：「红框这部分功能，单独做个控制面板放在右侧，宽度可调整的，做成悬浮的那种，
   类似三级管路编辑页面中 图层显示/隐藏 控制面板一样。」
   做法与三级页 #tlWsLayerPanel 同款（那份是 2026-09-30 用户要求的三面板合并浮层）：
     · 面板 = 画布容器 #grCanvasWrap（position:relative）内的绝对定位浮层，只浮在图上；
     · 左栏那张卡【整张 DOM 搬家】进面板，内部 id 与结构一字不改 ⇒ grRenderHyd 仍按
       #grHyd 渲染、静态闸门的 DOM 契约不受影响（只挪位置，不重写内容）；
     · 标题栏：拖动=移动 · 双击=回右上默认位 · 单击=折叠/展开；
       ↔ 手柄=左右拖动调宽（260~760px，localStorage 记忆）；
     · 工具栏「▤ 水力面板」显隐开关（状态也记忆），一键让浮层让位看全图。
   红线：纯版式/交互层 —— 不碰任何水力数据、算法与既有 id。 */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  var W_KEY = 'runye_grHydPanel_w', POS_KEY = 'runye_grHydPanel_pos', ON_KEY = 'runye_grHydPanel_on';
  var MINW = 260, MAXW = 760, DEFW = 420;
  var panel = null, bodyEl = null, collapsed = false, manualPos = false;
  function $(id) { return document.getElementById(id); }

  function syncBtn() {
    var b = $('grHydPanelBtn');
    if (b && panel) b.classList.toggle('gr-btn-on', !panel.classList.contains('grp-hidden'));
  }
  function ensure() {
    if (panel) return panel;
    var host = $('grCanvasWrap'), card = $('grTakeoffCard');
    if (!host || !card) return null;          /* 不是这一页 / DOM 未就绪：静默跳过 */
    panel = document.createElement('div');
    panel.id = 'grHydPanel';
    var head = document.createElement('div');
    head.className = 'grp-head';
    head.title = '拖动 = 移动面板 · 双击 = 回到画布右上默认位 · 单击 = 折叠/展开';
    head.innerHTML = '<b>驳接点 / 管径 / 水头损失</b>'
      + '<span id="grpGrip" title="左右拖动调节面板宽度（' + MINW + '~' + MAXW + 'px，自动记忆）">\u2194</span>'
      + '<span id="grpCaret">\u25be</span>';
    bodyEl = document.createElement('div');
    bodyEl.className = 'grp-body';
    bodyEl.appendChild(card);                 /* ★ 整张卡搬进来（搬家，不是复制） */
    panel.appendChild(head); panel.appendChild(bodyEl);
    host.appendChild(panel);

    /* 恢复上次的宽度 / 位置 / 显隐 */
    try {
      var sw = parseInt(localStorage.getItem(W_KEY), 10);
      if (isFinite(sw) && sw >= MINW && sw <= MAXW) panel.style.width = sw + 'px';
    } catch (e) { }
    try {
      var sp = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
      if (sp && isFinite(sp.x) && isFinite(sp.y)) {
        manualPos = true;
        panel.style.left = sp.x + 'px'; panel.style.top = sp.y + 'px'; panel.style.right = 'auto';
      }
    } catch (e) { }
    try { if (localStorage.getItem(ON_KEY) === '0') panel.classList.add('grp-hidden'); } catch (e) { }

    /* 标题栏：拖动移动 / 单击折叠 / 双击复位 */
    var pid = null, st = null, moved = false, suppress = false;
    head.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      pid = e.pointerId; moved = false;
      st = { x: e.clientX, y: e.clientY, l: panel.offsetLeft, t: panel.offsetTop };
      try { head.setPointerCapture(e.pointerId); } catch (err) { }
    });
    head.addEventListener('pointermove', function (e) {
      if (pid === null || e.pointerId !== pid || !st) return;
      var dx = e.clientX - st.x, dy = e.clientY - st.y;
      if (!moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      moved = true; suppress = true;
      var op = panel.offsetParent || document.body;
      var w = panel.offsetWidth || DEFW, h = panel.offsetHeight || 120;
      var L = Math.max(4, Math.min(st.l + dx, (op.clientWidth || 1200) - w - 4));
      var T = Math.max(4, Math.min(st.t + dy, (op.clientHeight || 800) - h - 4));
      panel.style.left = L + 'px'; panel.style.top = T + 'px'; panel.style.right = 'auto';
    });
    function endDrag(e) {
      if (pid === null || (e && e.pointerId !== pid)) return;
      pid = null;
      if (moved) {
        manualPos = true;
        try { localStorage.setItem(POS_KEY, JSON.stringify({ x: panel.offsetLeft, y: panel.offsetTop })); } catch (err) { }
      }
    }
    head.addEventListener('pointerup', endDrag);
    head.addEventListener('pointercancel', endDrag);
    head.addEventListener('click', function () {
      if (suppress) { suppress = false; return; }
      collapsed = !collapsed;
      bodyEl.style.display = collapsed ? 'none' : '';
      var c = $('grpCaret'); if (c) c.textContent = collapsed ? '\u25b8' : '\u25be';
    });
    head.addEventListener('dblclick', function () {
      manualPos = false;
      panel.style.left = 'auto'; panel.style.top = '8px'; panel.style.right = '8px';
      try { localStorage.removeItem(POS_KEY); } catch (err) { }
    });

    /* ↔ 手柄：右锚定拖左加宽 / 左锚定拖右加宽 */
    var rPid = null, rs = null, grip = $('grpGrip');
    if (grip) {
      grip.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;
        rPid = e.pointerId;
        rs = { x: e.clientX, w: panel.offsetWidth, ra: !(panel.style.left && panel.style.left !== 'auto') };
        try { grip.setPointerCapture(e.pointerId); } catch (err) { }
        e.preventDefault(); e.stopPropagation();
      });
      grip.addEventListener('pointermove', function (e) {
        if (rPid === null || e.pointerId !== rPid || !rs) return;
        var nw = rs.ra ? (rs.w + (rs.x - e.clientX)) : (rs.w + (e.clientX - rs.x));
        panel.style.width = Math.max(MINW, Math.min(MAXW, nw)) + 'px';
      });
      function endR() {
        if (rPid === null) return;
        rPid = null;
        try { localStorage.setItem(W_KEY, String(panel.offsetWidth)); } catch (err) { }
      }
      grip.addEventListener('pointerup', endR);
      grip.addEventListener('pointercancel', endR);
    }
    syncBtn();
    return panel;
  }

  function toggle() {
    var p = ensure(); if (!p) return;
    var hide = !p.classList.contains('grp-hidden');
    p.classList.toggle('grp-hidden', hide);
    try { localStorage.setItem(ON_KEY, hide ? '0' : '1'); } catch (e) { }
    syncBtn();
  }

  function boot() {
    ensure();
    var b = $('grHydPanelBtn');
    if (b) b.addEventListener('click', function (e) { e.preventDefault(); toggle(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  window.grHydPanelToggle = toggle;
})();
