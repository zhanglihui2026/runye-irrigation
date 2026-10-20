/* ============================================================
   plugins/hydraulics —— 「水力校核」主页面导航与会员适配
   ------------------------------------------------------------
   水力校核由主页面 #hydraulicsSection 承载，入口是 runye-nav.js 的顶级导航项。
   本插件继续提供统一的权益门控和公共水力计算 API；导航目标仍指向主页面功能区。

   ★ 与 pipe-optim 的关键差异（为什么不能照抄）：
     pipe-optim 的老按钮由 pipe_optim_ui.js 注入一次，摘掉就没了；
     这里的老项由 RyFnNav.render() 渲染，而**权益层就绪会触发重渲染**，
     把老项原样再造出来 —— 只摘一次必然出现「老项 + 插件项」双入口。
     ⇒ 必须挂抑制器（MutationObserver）：重渲染造一次摘一次。
   [v379 真改造] 本插件从「只接管导航」升级为**水力计算内核的宿主**：
     主页通过同步脚本装配水力内核；插件仍以幂等方式校验/补载并广播就绪，
     让 core/data-service.js 与水力校核页共用同一套口径。
     ★ 内核之间有**加载顺序依赖**（design-core 取 root.RyHcCore、hydraulics-core
       缺了前一个会直接 throw），必须串行加载、逐个等就绪。
   ============================================================ */
var unnav = null;        /* ctx.ui.registerNav 的注销函数 */
var mo = null;           /* 抑制器 observer */
var taken = null;        /* 被摘老项的存根 { el, parent, next } */
var stopped = false;
var coreP = null;        /* 内核加载 Promise（并发共享，见 loadCore） */
var coreSettled = false; /* 上一轮是否已跑完（用于判断缓存是否过期） */
var ctxRef = null;

function cfg(ctx) { return (ctx.manifest && ctx.manifest.config) || {}; }
function navCfg(ctx) { return (ctx.manifest && ctx.manifest.ui && ctx.manifest.ui.nav) || {}; }

/* 归一化：线上锁会给面板项加「 ·锁」后缀，比较前去掉（是装饰不是名字） */
function norm(t) { return String(t || '').replace(/\s*·\s*(?:锁|同步中)\s*$/, '').trim(); }

/* ============================================================
   水力计算内核加载（v379 真改造）
   ------------------------------------------------------------
   三个文件 & 对外全局名，**顺序敏感**：
     hydraulic-calc/hc-core.js     → window.RyHcCore      单段 Hazen-Williams / 流速 / 内径折算
     hydraulic-calc/design-core.js → window.RyDesignCore  依赖 hc-core（构造时取 root.RyHcCore）
     runye-hydraulics-core.js      → window.RyHydCore     全链路校核，缺前两者会直接 throw
   三者都是**纯计算、零 DOM** 的 UMD（Node 也能 require），所以可以安全地用
   <script> 动态引入，不会影响页面布局与现有状态。
   ============================================================ */
var CORE_CHAIN = [
  { file: 'hydraulic-calc/hc-core.js', name: 'RyHcCore' },
  { file: 'hydraulic-calc/design-core.js', name: 'RyDesignCore' },
  { file: 'runye-hydraulics-core.js', name: 'RyHydCore' }
];

/* 站点根：由本模块的 URL 反推（plugins/hydraulics/main.js → 上两级）。
   ★ 不能直接写相对路径：宿主将来若从子目录页启动插件体系，
     'hydraulic-calc/...' 会被解析到子目录下变成 404。 */
var SITE_ROOT = (function () {
  try { return new URL('../../', import.meta.url).href; } catch (e) { return ''; }
})();

function coreGLobalFn() { return (typeof window !== 'undefined') ? window : null; }

/* 已注入过的 <script> 标签（自己加的才记 —— 清理时只摘自己的产物） */
var injected = [];

function injectedFor(file) {
  var hit = null;
  injected.forEach(function (t) { if (t.getAttribute('data-ry-hcore') === file) hit = t; });
  return hit;
}

/* 单个文件：已经有全局对象就直接用，否则注入再等。**等条件，不盲 sleep**。
   ★ 为什么不先用「页面里有没有这个 <script> 标签」来判断要不要注入：
     标签在 ⇏ 全局在。实测踩到的场景：脚本已被移除/执行出错/（测试里）被手动删过，
     标签还在 DOM 里、全局却没有 —— 按标签判断就不再补载，白白等到超时。
     ⇒ 判据只用**目标全局是否出现**；已注入过但仍拿不到，过 1s 就再注入一次
       （UMD 是幂等的纯挂 global，重复执行没有副作用）。 */
function loadOne(step) {
  return new Promise(function (resolve) {
    var W = coreGLobalFn();
    var tries = 0, MAX = 60;                 /* 60×50ms = 3s，网络再慢也够（本地是瞬时） */
    var tag = null;
    (function poll() {
      if (stopped) { resolve({ ok: false, reason: 'deactivated' }); return; }
      if (W && W[step.name]) { resolve({ ok: true, reused: !tag }); return; }
      var had = injectedFor(step.file);
      if (!tag && (!had || tries > 20)) {
        try {
          tag = document.createElement('script');
          tag.setAttribute('data-ry-hcore', step.file);
          tag.src = SITE_ROOT + step.file;
          tag.async = false;                 /* ★ 保序：三个之间必须串行，浏览器不会重排 */
          document.head.appendChild(tag);
          injected.push(tag);
        } catch (e) {
          resolve({ ok: false, reason: 'inject-failed: ' + step.file });
          return;
        }
      }
      if (++tries >= MAX) {
        resolve({ ok: false, reason: 'timeout: ' + step.name });
        return;
      }
      setTimeout(poll, 50);
    })();
  });
}

/* 串行加载整条链；失败即停（后面的文件依赖前面的，强行走下去只会得到半成品）。
   ★ 并发共享：模块级 coreP —— 多个插件同时要内核时只加载一次
     （CloudSync 那个「并发 init 时真实初始化被调 N 次」的坑，v359b 同款）。 */
function loadCore() {
  if (coreMissing().length === 0) {
    return coreP || (coreP = Promise.resolve({ ok: true, reused: true, missing: [] }));
  }
  /* ★ 缓存作废：上一轮已经加载完成、但全局现在又没了（被外部清掉 / 脚本被移除）
     —— 缓存里那个 ok:true 已经过期，不能再用，必须重新加载。 */
  if (coreP && coreSettled) { coreP = null; coreSettled = false; }
  if (coreP) return coreP;
  coreSettled = false;
  coreP = CORE_CHAIN.reduce(function (acc, step) {
    return acc.then(function (prev) {
      if (!prev.ok) return prev;
      return loadOne(step).then(function (r) {
        return r.ok ? prev : { ok: false, reason: r.reason, file: step.file };
      });
    });
  }, Promise.resolve({ ok: true })).then(function (r) {
    coreSettled = true;
    var missing = coreMissing();
    var out = { ok: r.ok && missing.length === 0, missing: missing, reason: r.reason || '' };
    if (!out.ok && ctxRef) {
      /* 内核拿不到 ≠ 插件废了：导航入口仍可到达功能区，页面会明确显示计算核心故障。
         上报后 fail-open，不许冒异常到主程序。 */
      ctxRef.runtime.reportError(new Error('水力内核加载不完整：' + (out.reason || missing.join(','))));
    }
    if (out.ok && ctxRef && ctxRef.events && typeof ctxRef.events.emit === 'function') {
      ctxRef.events.emit('hydraulics-core-ready', { at: Date.now() });
    }
    return out;
  });
  return coreP;
}

function coreMissing() {
  var W = coreGLobalFn();
  if (!W) return CORE_CHAIN.map(function (s) { return s.name; });
  return CORE_CHAIN.filter(function (s) { return !W[s.name]; })
    .map(function (s) { return s.name; });
}

function coreApiReady() { return coreMissing().length === 0; }

/* ------------------------------------------------------------
   [v378 补] 会员门控：老项 feat='hydraulic-check'（L2 高级会员），
   老入口自带「·锁」+ 升级引导。v377 只接管了入口、没接这道闸 ——
   等于「老入口锁着、插件入口敞着」，付费功能对全员开放。这里补回来。
   语义与 runye-nav.js 的 gate() 完全一致（三态 fail-open：只有「已确认
   无权限」才锁），否则网络抖动会把老用户当场锁死。
   ------------------------------------------------------------ */
function gate(ctx) {
  var feat = cfg(ctx).feat;
  if (!feat) return true;
  var E = (typeof window !== 'undefined') ? window.RyEntitle : null;
  if (!E || typeof E.can !== 'function') return true;
  if (E.mockPlan) return E.can(feat);
  if (typeof E.ready === 'function' && !E.ready()) return true;
  return E.can(feat);
}
function pending(ctx) {
  var feat = cfg(ctx).feat;
  var E = (typeof window !== 'undefined') ? window.RyEntitle : null;
  return !!(feat && E && typeof E.access === 'function' && E.access(feat) === 'pending');
}

function onLocked(ctx) {
  var label = navCfg(ctx).label || ctx.id;
  var U = (typeof window !== 'undefined') ? window.RyMemberUI : null;
  if (U && typeof U.showUpgrade === 'function') { U.showUpgrade(label); return; }
  toast('「' + label + '」为高级会员功能 · 邀请好友即可开通');
}

/* 与 runye-nav.js 的 showToast 同款（皮肤在 runye-nav.css 的 .ry-nav-toast） */
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

/* 找老入口：按标签匹配（data-ry-navitem 由 runye-nav.js 渲染） */
function findLegacy(ctx) {
  var want = norm(cfg(ctx).matchLabel);
  var list = document.querySelectorAll('[data-ry-navitem]');
  for (var i = 0; i < list.length; i++) {
    if (norm(list[i].textContent) === want) return list[i];
  }
  return null;
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

  /* ★ 模块级状态复位：deactivate 会把 stopped 置 true，而 ES 模块只加载一次 ——
     不复位的话，第二次 activate（重新加载插件 / 闸门多环境跑）时 probe 直接短路，
     接管和导航注册全都不发生（闸门 C35 实测抓到）。 */
  stopped = false; taken = null; mo = null; unnav = null; coreP = null; ctxRef = ctx;

  /* [v379] 是否自动把计算内核请进来。默认要 —— 理由不是「方便」，是**口径单一**：
     不加载时 core/data-service.js 的 hazenLoss 只能走内置兜底，那又变回两份记录；
     加载了才真正做到「本站水力口径只有一个出处」（hydraulic-calc/hc-core.js）。
     三个文件合计约 65KB、纯计算无副作用、async=false 串行加载不阻塞渲染。
     想省这 65KB 就把 manifest 的 config.autoloadCore 置 false（其它插件仍可按需
     await hydraulics.loadCore()，只是首次调用要等一次网络）。 */
  if (c.autoloadCore !== false) {
    loadCore().then(function (r) {
      ctx.runtime.log('core', '水力内核' + (r.ok ? '就绪（口径统一到 hc-core）' : '未就绪：' + (r.reason || r.missing.join(','))));
    });
  }

  /* 点击行为 = 老入口的同款跳转（href 由 manifest 配置，不写死） */
  function open() {
    try { window.location.hash = c.href || '#hydraulicsSection'; }
    catch (e) { ctx.runtime.reportError(e); }
  }

  /* 条件等待老项出现（runye-nav.js 在解析期渲染，通常立刻就有；
     上限 40×50ms，超时则降级为「只加插件入口、不动老项」—— 入口不能丢）
     ★ 还要等 before 锚点（.fn-more）渲染出来再注册导航：
       真页面实测 runye-nav.js 先渲染顶级项、后建「更多 ▾」折叠组 ——
       若只等老项，注册时锚点还不存在，core placeIn 只能退回 appendChild，
       位置就落到「⚙️ 设置」后面而不是「更多 ▾」之前（冒烟 beforeOk=false 实测踩中）。 */
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
        before: c.insertBefore || null,   /* 原位置：插回「更多 ▾」之前 */
        gate: function () { return gate(ctx); },
        pending: function () { return pending(ctx); },
        onLocked: function () { onLocked(ctx); },
        onClick: open
      });
    }
    ctx.runtime.log('boot', '水力校核插件已激活' + (taken ? '（已接管老入口）' : '（未找到老入口，降级）'));
  })();

  /* ============================================================
     对外 API（loader 记进 registry['hydraulics'].api）
     —— 其它插件要用水力计算一律走这里，不许再各自抄一份公式：
        window.RyCore.loader.registry()['hydraulics'].api.hazen(...)
     ⚠ 全部返回 null 表示「内核没到」，调用方必须自己判空 ——
       宁可让调用方显式说「算不了」，也不要返回一个看起来合理的假数。
     ============================================================ */
  return {
    open: open,
    /* 主动把内核请进来（幂等，可并发；已被 autoloadCore 请过就直接复用） */
    loadCore: loadCore,
    coreReady: coreApiReady,
    coreMissing: coreMissing,
    hazen: function (L, Q, d, C) {
      var W = coreGLobalFn();
      if (!W || !W.RyHcCore || typeof W.RyHcCore.hazen !== 'function') return null;
      var v = Number(W.RyHcCore.hazen(L, Q, d, C));
      return isFinite(v) ? v : null;
    },
    /* Christiansen 多口系数（滴灌带多孔出流折减）—— RyHydCore 提供 */
    christiansenF: function (n) {
      var W = coreGLobalFn();
      if (!W || !W.RyHydCore || typeof W.RyHydCore.christiansenF !== 'function') return null;
      var v = Number(W.RyHydCore.christiansenF(n));
      return isFinite(v) ? v : null;
    },
    /* 全链路校核透传（读已布置管网 → 树 → 流量 → 逐段结果） */
    compute: function (net, opts) {
      var W = coreGLobalFn();
      if (!W || !W.RyHydCore || typeof W.RyHydCore.compute !== 'function') return null;
      try { return W.RyHydCore.compute(net || {}, opts || {}); }
      catch (e) { if (ctxRef) ctxRef.runtime.reportError(e); return null; }
    },
    state: function () {
      return { nav: !!unnav, stolen: !!taken, coreReady: coreApiReady(), stopped: stopped };
    }
  };
}

function deactivate() {
  stopped = true;
  if (mo) { try { mo.disconnect(); } catch (e) { } mo = null; }
  if (unnav) { try { unnav(); } catch (e) { } unnav = null; }
  /* 老项插回原位（原来是老项的 parent 在 next 之前） */
  if (taken && taken.parent) {
    try { taken.parent.insertBefore(taken.el, taken.next); } catch (e) { }
  }
  taken = null;

  /* ★ 内核**不卸载**：① window.RyHcCore 等是页面级公共资源，删掉可能连累
       别的页面逻辑；② 它们是纯计算模块，留着只是几个函数对象，不构成泄漏。
       ⇒ 只把自己注入的 <script> 标签摘掉（那是本插件的 DOM 产物），
         已经挂上 window 的函数留给后续复用（deactivate 常发生在插件重载场景）。 */
  coreP = null;
  ctxRef = null;
}

export { activate, deactivate };
