/* ============================================================
   plugins/pipe-optim/main.js —— 「老模块 → 插件」迁移样板（阶段四）
   ------------------------------------------------------------
   ★ 本文件**不改动** pipe_optim_ui.js 的任何一行业务逻辑，只做三件事：
       1) 持有入口：[v391] 起老模块不再自注入导航按钮（与主程序脱开，用户指令），
          本插件直接在「更多 ▾」面板内注册导航入口（container 取 manifest.config.container）
       2) 事件桥接：老模块 dispatch 在 document 上的 ry:pipe-optim-export
                    转发进插件事件总线，并补上「亩均造价」
       3) 崩溃隔离 + 干净卸载：open() 全程 try/catch；deactivate 摘净自己的产物
   ★ 点击仍调 window.PipeOptim.open()（弹窗业务零改动）；模块缺失时点击才上报，
     入口本身常在（入口不能丢优先于业务可用）。
   ============================================================ */

var OVERLAY_ID = 'poOverlay';                 /* 老模块弹窗根节点（只读地隐藏，不摘除） */

var ctxRef = null;
var unnav = null;
var onExport = null;
var lastExport = null;
var stopped = false;

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

  /* [v391] 入口直接注册（不再等老按钮注入/接管）：
     container 取 manifest.config.container（'.fn-more-panel'）；
     面板此刻缺失时 core containersFor 会先降级主导航条、等面板出现后由
     observer 重挂回面板（入口不能丢优先于位置一致）。 */
  if (typeof ctx.ui.registerNav === 'function') {
    unnav = ctx.ui.registerNav({
      label: nav.label || ctx.id,
      title: nav.title || '',
      order: nav.order,
      container: cfg.container || null,      /* null → 默认主导航条（灰度开关） */
      onClick: function () { open(); }
    });
  }
  bridge();
  ctx.runtime.log('boot', '管网优化插件入口已注册 v' + (ctx.manifest.version || '?'));

  /* 返回值会被 loader 记进 registry[id].api —— 闸门与调试都靠它读内部状态 */
  return {
    open: open,
    lastExport: function () { return lastExport; },
    state: function () {
      return { nav: !!unnav, bridged: !!onExport, stopped: stopped };
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

  /* 弹窗只隐藏、不摘除：老模块闭包里的 overlayEl 仍指向这个节点，
     摘掉会让它下次 open() 时给一个脱离文档的节点设 display 而「点了没反应」。 */
  try {
    var ov = document.getElementById(OVERLAY_ID);
    if (ov) ov.style.display = 'none';
  } catch (e) { }

  ctxRef = null;
}
