/* ============================================================
   plugins/material-list —— 「材料清单」老模块迁移（壳，v390）
   ------------------------------------------------------------
   迁移对象：runye-nav.js ITEMS 渲染的顶级导航项「材料清单」
   （锚点 data-target="detailsSection"，切到 #detailsSection 功能区）。
   业务零改动：材料清单区块、mod/inline-18.js 的切区收口、切入时的
   window.render() 重渲染（v142）全部原样保留，本插件只接管**导航入口**：
     摘老项 → 插件项在「更多 ▾」之前原位补上 → 点击走 ryJumpToSection。
   ★ 与 bom 插件（BOM 导出面板）互不相干：那是导出面板，本插件是
     页面里的「材料清单」功能区入口，会员门控键也不同（bom-export）。
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
var clearTap = null;     /* 高亮联动：document 捕获监听（deactivate 时摘除） */

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

/* 找老入口：属性选择器（data-target 由 runye-nav.js makeItem 在主页打上） */
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

/* 点亮自己 + 熄灭其它：老锚点被摘后已不在 mod/inline-18.js 的 items 注册表
   视觉范围里，它的 activate() 只能管注册表内的项 —— 插件项的高亮自己管。 */
function lightSelf() {
  try {
    var mine = document.querySelector('[data-ry-plugin-nav="material-list"]');
    if (!mine) return;
    var lit = document.querySelectorAll('.fn-nav .fn-link.active');
    for (var i = 0; i < lit.length; i++) lit[i].classList.remove('active');
    mine.classList.add('active');
  } catch (e) { }
}

function activate(ctx) {
  var c = cfg(ctx);
  var nc = navCfg(ctx);

  /* ★ 模块级状态复位（ES 模块只加载一次，见文件头说明②） */
  stopped = false; taken = null; mo = null; unnav = null; clearTap = null; ctxRef = ctx;

  /* 点击行为 = 老锚点的同款切区。 */
  function open() {
    try {
      var id = c.sectionId;
      if (typeof window.ryJumpToSection === 'function') { window.ryJumpToSection(id); }
      else {
        var sec = document.getElementById(id);
        if (sec) sec.scrollIntoView();
      }
      lightSelf();
      if (ctx.events && typeof ctx.events.emit === 'function') ctx.events.emit('bom-open-request');
    } catch (e) { if (ctxRef) ctxRef.runtime.reportError(e); }
  }

  /* 高亮联动：点导航里任何**别的**项都熄掉自己 */
  clearTap = function (e) {
    var t = e.target && e.target.closest ? e.target.closest('.fn-link') : null;
    if (!t) return;
    if (t.closest && t.closest('[data-ry-plugin-nav="material-list"]')) return;
    var mine = document.querySelector('[data-ry-plugin-nav="material-list"]');
    if (mine) mine.classList.remove('active');
  };
  document.addEventListener('click', clearTap, true);

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
    ctx.runtime.log('boot', '材料清单插件已激活' + (taken ? '（已接管老入口）' : '（未找到老入口，降级）'));
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
  if (clearTap) { try { document.removeEventListener('click', clearTap, true); } catch (e) { } clearTap = null; }
  if (taken && taken.parent) {
    try { taken.parent.insertBefore(taken.el, taken.next); } catch (e) { }
  }
  taken = null;
  ctxRef = null;
}

export { activate, deactivate };
