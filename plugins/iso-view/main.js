/* ============================================================
   plugins/iso-view —— 「轴测图」老模块迁移（壳，v390）
   ------------------------------------------------------------
   迁移对象：runye-nav.js ITEMS 渲染的**动作按钮**「轴测图」
   （makeItem 对 act 项打 data-ry-navact="iso"，点击调
   window.RyFnNavActions['iso'] → mod/inline-05.js → tlShowIsoDiagram()）。
   业务零改动：三级轴测图渲染、RyFnNavActions 注册链路全部原样保留，
   本插件只接管**导航入口**：
     摘老项 → 插件项在「更多 ▾」之前原位补上 → 点击走同一动作。
   ★ 与 hydraulics 同款的两个关键机制（2026-10-12 实测教训，勿删）：
     ① 重渲染抑制器：权益层就绪会触发 RyFnNav.render()，把老项原样再造出来
        —— 只摘一次必然出现「老项 + 插件项」双入口，必须挂 MutationObserver。
     ② 模块级状态复位：ES 模块只加载一次，deactivate 会把 stopped 置 true，
        不复位的话第二次 activate（闸门多环境跑）直接短路。
   ============================================================ */
var unnav = null;        /* ctx.ui.registerNav 的注销函数 */
var mo = null;           /* 重渲染抑制器 */
var taken = null;        /* 被摘老项的存根 { el, parent, next } */
var stopped = false;
var ctxRef = null;

function cfg(ctx) { return (ctx.manifest && ctx.manifest.config) || {}; }
function navCfg(ctx) { return (ctx.manifest && ctx.manifest.ui && ctx.manifest.ui.nav) || {}; }
function norm(t) { return String(t || '').replace(/\s*·\s*锁\s*$/, '').trim(); }

/* 会员门控：语义与 runye-nav.js gate() 完全一致（三态 fail-open） */
function gate(ctx) {
  var feat = cfg(ctx).feat;
  if (!feat) return true;
  var E = (typeof window !== 'undefined') ? window.RyEntitle : null;
  if (!E || typeof E.can !== 'function') return true;
  if (E.mockPlan) return E.can(feat);
  if (typeof E.ready === 'function' && !E.ready()) return true;
  return E.can(feat);
}

function onLocked(ctx) {
  var lb = navCfg(ctx).label || ctx.id;
  var U = (typeof window !== 'undefined') ? window.RyMemberUI : null;
  if (U && typeof U.showUpgrade === 'function') { U.showUpgrade(lb); return; }
  toast('「' + lb + '」为高级会员功能 · 邀请好友即可开通');
}

function toast(msg) {
  try {
    var d = document.createElement('div');
    d.className = 'ry-nav-toast';
    d.setAttribute('role', 'status');
    d.textContent = msg;
    document.body.appendChild(d);
    setTimeout(function () { d.classList.add('show'); }, 10);
    setTimeout(function () {
      d.classList.remove('show');
      setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 300);
    }, 2400);
  } catch (e) { }
}

/* 找老入口：属性选择器（data-ry-navact 由 runye-nav.js makeItem 打上） */
function findLegacy(ctx) {
  var sel = cfg(ctx).legacySel;
  if (!sel) return null;
  try { return document.querySelector(sel); } catch (e) { return null; }
}

/* 摘老项（记录原位，deactivate 时插回） */
function takeOver(ctx, el) {
  taken = { el: el, parent: el.parentNode, next: el.nextSibling };
  if (taken.parent) taken.parent.removeChild(el);
  ctx.runtime.log('takeover', '已摘老导航项「' + norm(el.textContent) + '」');
}

/* 抑制器：权益重渲染把老项造出来就再摘一次（只在我们接管期间生效） */
function startSuppressor(ctx) {
  if (typeof MutationObserver === 'undefined') return;
  mo = new MutationObserver(function () {
    if (stopped || !taken) return;
    var again = findLegacy(ctx);
    if (again) {
      if (again.parentNode) again.parentNode.removeChild(again);
      ctx.runtime.log('takeover', '重渲染复活了老项 → 再次摘除');
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });
}

function activate(ctx) {
  var c = cfg(ctx);
  var nc = navCfg(ctx);

  /* ★ 模块级状态复位（ES 模块只加载一次，见文件头说明②） */
  stopped = false; taken = null; mo = null; unnav = null; ctxRef = ctx;

  /* 点击行为 = 老动作按钮的同款调用：window.RyFnNavActions[act]()。
     RyFnNavActions 缺注册（inline-05.js 未到/被删）时直接调页面全局函数兜底，
     与 inline-05 内部的 `if (typeof tlShowIsoDiagram === 'function')` 语义一致。 */
  function open() {
    try {
      var act = c.act;
      var A = window.RyFnNavActions;
      if (A && typeof A[act] === 'function') { A[act](); return; }
      var fn = act === 'sys' ? window.tlShowSysDiagram : window.tlShowIsoDiagram;
      if (typeof fn === 'function') { fn(); return; }
      ctx.runtime.log('degrade', '动作未注册且页面全局函数不可用：' + act);
    } catch (e) { if (ctxRef) ctxRef.runtime.reportError(e); }
  }

  /* 条件等待老项出现（上限 40×50ms，超时降级为「只补插件入口」） */
  var tries = 0;
  (function probe() {
    if (stopped) return;
    var legacy = c.takeOverNav === false ? null : findLegacy(ctx);
    var anchorOk = !c.insertBefore || !!document.querySelector(c.insertBefore);
    if (legacy && anchorOk) {
      takeOver(ctx, legacy);
      startSuppressor(ctx);
    } else if (tries++ < 40) {
      setTimeout(probe, 50);
      return;
    } else if (c.takeOverNav !== false) {
      ctx.runtime.log('degrade', '等老导航项超时 —— 不接管，仅补插件入口');
    }

    if (ctx.ui.registerNav) {
      unnav = ctx.ui.registerNav({
        label: nc.label || ctx.id,
        title: nc.title || '',
        order: nc.order,
        beforeLabel: c.beforeLabel || null,   /* [v390] 锚在稳定老项「滴灌带查询」之前，不挤占 hydraulics 与「更多 ▾」的毗邻位（C35） */
        before: c.insertBefore || null,
        gate: function () { return gate(ctx); },
        onLocked: function () { onLocked(ctx); },
        onClick: open
      });
    }
    ctx.runtime.log('boot', '轴测图插件已激活' + (taken ? '（已接管老入口）' : '（未找到老入口，降级）'));
  })();

  return {
    open: open,
    state: function () { return { nav: !!unnav, stolen: !!taken, stopped: stopped }; }
  };
}

function deactivate() {
  stopped = true;
  if (mo) { try { mo.disconnect(); } catch (e) { } mo = null; }
  if (unnav) { try { unnav(); } catch (e) { } unnav = null; }
  if (taken && taken.parent) {
    try { taken.parent.insertBefore(taken.el, taken.next); } catch (e) { }
  }
  taken = null;
  ctxRef = null;
}

export { activate, deactivate };
