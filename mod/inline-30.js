
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
  var MINW = 260, MAXW = 760;          /* 调宽范围；DEFW 随 v544 的默认宽度交给 CSS 后已无引用 */
  var panel = null, bodyEl = null;      /* collapsed / manualPos 已由 mod/ry-panel.js 接管 */
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
    panel.className = 'ry-float-card';   /* [v544] 外壳视觉统一（mod/ry-panel.css） */
    var head = document.createElement('div');
    head.className = 'grp-head ry-float-head';
    head.title = '拖动 = 移动面板 · 双击 = 回到画布右上默认位 · 单击 = 折叠/展开';
    head.innerHTML = '<b class="ry-float-title">驳接点 / 管径 / 水头损失</b>'
      + '<span id="grpGrip" class="ry-float-grip" title="左右拖动调节面板宽度（' + MINW + '~' + MAXW + 'px，自动记忆）">\u2194</span>'
      + '<span id="grpCaret" class="ry-float-caret">\u25be</span>';
    bodyEl = document.createElement('div');
    bodyEl.className = 'grp-body ry-float-body';
    bodyEl.appendChild(card);                 /* ★ 整张卡搬进来（搬家，不是复制） */
    panel.appendChild(head); panel.appendChild(bodyEl);
    /* [v544] 交互声明化：拖动 / 折叠 / 调宽交给 mod/ry-panel.js（原手写指针逻辑已删）。
       显隐开关（工具栏「▤ 水力面板」）是本面板专属语义，仍留在本文件。 */
    panel.setAttribute('data-ry-panel', '');
    panel.setAttribute('data-ry-panel-key', 'grHydPanel');
    panel.setAttribute('data-ry-position-key', POS_KEY);
    panel.setAttribute('data-ry-keep-default', '1');       /* 默认位由 #grHydPanel 的 CSS 给 */
    panel.setAttribute('data-ry-drag-threshold', '4');
    panel.setAttribute('data-ry-drag-dblclick-reset', '1');
    panel.setAttribute('data-ry-fold-key', 'runye_grHydPanel_fold');
    panel.setAttribute('data-ry-resize-key', W_KEY);
    panel.setAttribute('data-ry-resize-min', String(MINW));
    panel.setAttribute('data-ry-resize-max', String(MAXW));
    head.setAttribute('data-ry-drag', '');
    head.setAttribute('data-ry-toggle', '');
    bodyEl.setAttribute('data-ry-body', '');
    var grpCaret = panel.querySelector('#grpCaret');   /* 面板还没挂进文档，只能用子树查询 */
    grpCaret.setAttribute('data-ry-fold', '');
    grpCaret.setAttribute('data-ry-fold-open', '\u25be');
    grpCaret.setAttribute('data-ry-fold-closed', '\u25b8');
    var grpGrip = panel.querySelector('#grpGrip');
    grpGrip.setAttribute('data-ry-resize', '');
    host.appendChild(panel);

    /* 恢复上次的显隐；宽度与位置由框架按 data-ry-* 自己的存档恢复 */
    try { if (localStorage.getItem(ON_KEY) === '0') panel.classList.add('grp-hidden'); } catch (e) { }
    window.rypCollapsible(panel);
    window.rypDraggable(panel);
    window.rypResizePanel(panel);
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
