/* ============================================================
   plugins/pipe-optim/main.js —— 「老模块 → 插件」迁移样板（阶段四）
   ------------------------------------------------------------
   ★ 本文件**不改动** pipe_optim_ui.js 的任何一行业务逻辑，只做三件事：
       1) 接管入口：摘掉老模块自己注入的导航按钮，改由插件体系注册（位置不变）
       2) 事件桥接：老模块 dispatch 在 document 上的 ry:pipe-optim-export
                    转发进插件事件总线，并补上「亩均造价」
       3) 崩溃隔离 + 干净卸载：open() 全程 try/catch；deactivate 原样还原
   ★ 卸载语义：
       takeOverNav=true（默认）→ 激活时摘掉老按钮、注销时插回原位；
       takeOverNav=false       → 完全不碰老按钮，只做事件桥接（灰度用）。
   ============================================================ */

var LEGACY_BTN_SEL = '[data-ry-pipeoptim]';   /* 老模块 injectNavButton() 打的标记 */
var OVERLAY_ID = 'poOverlay';                 /* 老模块弹窗根节点（只读地隐藏，不摘除） */

var ctxRef = null;
var unnav = null;
var onExport = null;
var lastExport = null;
var stopped = false;
var legacy = null;      /* { el, parent, next, sel } —— 摘下来的老按钮，卸载时还原 */

/* ------------------------------------------------------------
   等老模块就绪：条件等待（不是盲 sleep）——
   window.PipeOptim 一出现就立刻继续，最多等 40×50ms=2s。
   index.html 里 <script src="pipe_optim_ui.js"> 是同步脚本，
   早于本 ES Module 执行，正常情况下第一次判断即命中。
   ------------------------------------------------------------ */
function waitLegacy(cb) {
  var tries = 0, MAX = 40;
  (function step() {
    if (stopped) return;
    var P = (typeof window !== 'undefined') ? window.PipeOptim : null;
    if (P && typeof P.open === 'function') { cb(true); return; }
    if (++tries >= MAX) { cb(false); return; }
    setTimeout(step, 50);
  })();
}

/* 老按钮原来所在的容器 → 选择器（迁移后按钮必须落回原处，不能跳到主导航条） */
function containerSelOf(el) {
  var p = el && el.parentElement;
  if (!p) return null;
  if (p.classList && p.classList.contains('fn-more-panel')) return '.fn-more-panel';
  if (p.getAttribute && p.getAttribute('data-ry-fnnav') !== null) return '[data-ry-fnnav]';
  var id = p.id || '';
  if (id && /^[A-Za-z][\w-]*$/.test(id)) return '#' + id;
  return null;
}

/* 摘掉老按钮；返回它原所在容器的选择器（供 registerNav 复用，保持位置不变） */
function takeOver() {
  var el = document.querySelector(LEGACY_BTN_SEL);
  if (!el || !el.parentNode) return null;
  var parent = el.parentNode;
  var next = el.nextSibling;
  var sel = containerSelOf(el);
  try {
    parent.removeChild(el);
  } catch (e) { return null; }
  legacy = { el: el, parent: parent, next: next, sel: sel };
  return sel;
}

/* 卸载时原样插回（含原来的兄弟位置） */
function restore() {
  if (!legacy) return;
  try {
    if (legacy.next && legacy.next.parentNode === legacy.parent) {
      legacy.parent.insertBefore(legacy.el, legacy.next);
    } else {
      legacy.parent.appendChild(legacy.el);
    }
  } catch (e) { /* 容器已被导航重建冲掉时插不回去，也不该影响卸载 */ }
  legacy = null;
}

/* 打开老模块弹窗（唯一入口；异常一律上报 runtime，绝不冒泡到主程序） */
function open() {
  var P = (typeof window !== 'undefined') ? window.PipeOptim : null;
  if (!P || typeof P.open !== 'function') {
    if (ctxRef) ctxRef.runtime.reportError(new Error('window.PipeOptim 不可用（pipe_optim_ui.js 未加载？）'));
    return false;
  }
  try { P.open(); return true; }
  catch (e) { if (ctxRef) ctxRef.runtime.reportError(e); return false; }
}

/* 事件桥接：document 上的老事件 → 插件总线，并补亩均造价 */
function bridge() {
  if (!ctxRef || !ctxRef.events || typeof ctxRef.events.emit !== 'function') return;
  onExport = function (ev) {
    var d = (ev && ev.detail) || {};
    var areaMu = 0;
    try {
      var snap = ctxRef.data.readDiagram && ctxRef.data.readDiagram();
      var a = Number(snap && snap.meta && snap.meta.measuredArea) || 0;
      /* measuredArea 单位是 m²（与 BOM 口径一致：面积/行距=滴灌带米数） */
      if (a > 0) areaMu = Math.round(a / 666.667 * 100) / 100;
    } catch (e) { /* 读不到面积不影响转发 */ }
    var cost = Number(d.totalCost) || 0;
    lastExport = {
      scheme: d.scheme || '',
      totalCost: cost,
      areaMu: areaMu,
      perMu: (areaMu > 0 && cost > 0) ? Math.round(cost / areaMu * 100) / 100 : null,
      at: new Date().toISOString()
    };
    ctxRef.events.emit('pipe-optim-export', lastExport);   /* core/event-bus: EVENTS.PIPE_OPTIM_EXPORT */
  };
  document.addEventListener('ry:pipe-optim-export', onExport);
}

export function activate(ctx) {
  ctxRef = ctx;
  stopped = false;
  var cfg = (ctx.manifest && ctx.manifest.config) || {};
  var nav = (ctx.manifest && ctx.manifest.ui && ctx.manifest.ui.nav) || {};

  waitLegacy(function (ok) {
    if (stopped) return;                       /* 期间已被卸载 */
    if (!ok) {
      ctx.runtime.reportError(new Error('window.PipeOptim 超时未就绪 —— 不接管导航，仅跳过'));
      return;
    }
    if (cfg.takeOverNav !== false && typeof ctx.ui.registerNav === 'function') {
      var sel = takeOver();                    /* 老按钮先摘下来，避免双入口 */
      unnav = ctx.ui.registerNav({
        label: nav.label || '管网优化',
        title: nav.title || '管网优化详细分析（Jaya 群智能 · 只读）',
        order: nav.order,
        container: sel || null,                /* null → 默认主导航条 */
        onClick: function () { open(); }
      });
    }
    bridge();
    ctx.runtime.log('boot', '已接管老模块入口 v' + (ctx.manifest.version || '?'));
  });

  /* 返回值会被 loader 记进 registry[id].api —— 闸门与调试都靠它读内部状态 */
  return {
    open: open,
    lastExport: function () { return lastExport; },
    state: function () {
      return { nav: !!unnav, stolen: !!legacy, bridged: !!onExport, stopped: stopped };
    }
  };
}

export function deactivate() {
  stopped = true;
  if (onExport) {
    try { document.removeEventListener('ry:pipe-optim-export', onExport); } catch (e) { }
    onExport = null;
  }
  if (unnav) { try { unnav(); } catch (e) { } unnav = null; }
  restore();

  /* 弹窗只隐藏、不摘除：老模块闭包里的 overlayEl 仍指向这个节点，
     摘掉会让它下次 open() 时给一个脱离文档的节点设 display 而「点了没反应」。 */
  try {
    var ov = document.getElementById(OVERLAY_ID);
    if (ov) ov.style.display = 'none';
  } catch (e) { }

  ctxRef = null;
}
