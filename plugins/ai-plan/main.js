/* ============================================================
   plugins/ai-plan —— 「智能规划」老模块迁移（壳，阶段五第 3 项）
   ------------------------------------------------------------
   迁移对象：AI 对话规划工作台。业务代码 runye-ai-plan.js（82KB）**零改动**，
   它由主页 index.html 第 19 行同步加载，本插件不重复加载、也不碰它的 UI。

   ★ 与前面三个迁移都不一样的**一处** —— 入口是 win:1「独立窗口」语义：
       老入口是 runye-nav.js ITEMS 的第一条：标签「智能规划」、href 指向
       index.html 的 smart=1 工作台并带 #pipePlanSection 锚、win 标记 = 1。
       点击后：preventDefault → 静默存档 → 写一次性锚 → window.open(…)
               → 被浏览器拦截才回落本页跳转。
     [v331 用户要求] 这么绕的目的只有一个：**主窗口原地不动、地块分区手动规划不受影响**。
     ⇒ 换成插件导航时若图省事写成 location.assign(href)，
       用户正在画的分区会在眼前被整页冲掉 —— 这是迁移引入的**功能倒退**，必须挡住。
       所以 open() 里 popup 分支是逐行对齐 runye-nav.js 的实现，不是自由发挥。

   ★ 与 hydraulics 相同的两条：
     1) 老项由 RyFnNav.render() 渲染、**权益就绪会重渲染复活** ⇒ 要抑制器；
     2) 会员门控必须一起搬（feat:'ai-plan' = L1）。
       注：runye-nav.js 注释写明 L1 是「匿名试用也放行」，那由 RyEntitle.can() 决定，
       本插件不替它做判断，只负责把 gate 语义（三态 fail-open）原样接过来。

   ★ 另一个入口 `#ppAiPlan`（老设计方案区块里的按钮）**不动**：
     它是页面静态 DOM 里的业务按钮，且多一步「带当前参数快照」的请求，
     与本插件管的导航入口是两回事 —— 一起接管反而会造成两个入口互相打架。
   ============================================================ */
var unnav = null;        /* ctx.ui.registerNav 的注销函数 */
var mo = null;           /* 抑制器 observer */
var taken = null;        /* 被摘老项的存根 { el, parent, next } */
var stopped = false;

function cfg(ctx) { return (ctx.manifest && ctx.manifest.config) || {}; }
function navCfg(ctx) { return (ctx.manifest && ctx.manifest.ui && ctx.manifest.ui.nav) || {}; }

/* 归一化：线上锁会给导航项加「 ·锁」后缀，比较前去掉（是装饰不是名字） */
function norm(t) { return String(t || '').replace(/\s*·\s*锁\s*$/, '').trim(); }

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

/* ------------------------------------------------------------
   会员门控：与 runye-nav.js 的 gate() **同一套三态 fail-open**
   （只有「已确认无权限」才锁），防止网络抖动把老用户当场锁死。
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

function onLocked(ctx) {
  var label = navCfg(ctx).label || ctx.id;
  var U = (typeof window !== 'undefined') ? window.RyMemberUI : null;
  if (U && typeof U.showUpgrade === 'function') { U.showUpgrade(label); return; }
  toast('「' + label + '」为会员功能 · 点击查看开通方式');
}

/* ------------------------------------------------------------
   打开（本插件唯一有业务含量的地方）—— 逐行对齐 runye-nav.js 的 win:1 分支：
     ① 静默存档全量方案（v327：保护主窗口正在画的分区）
     ② 写一次性锚，返回本页时据此恢复边界
     ③ window.open(指定窗名/尺寸)：窗名 'runye_smart' 复用同一个窗口，
        避免每点一次弹一堆；尺寸 1180×860 是 v331 定的工作台形态
     ④ 被拦截（返回 null/undefined）才回落本页跳转 —— 旧行为，不能省
   ⚠ href 必须原样透传（含 ?smart=1 与 #pipePlanSection），
     少了 query 就不是 AI 工作台入口。
   ------------------------------------------------------------ */
function open(ctx) {
  var c = cfg(ctx);
  try {
    if (c.mode === 'popup') {
      /* ① ② 两步失败都只吞掉，不阻断打开 —— 存档/锚是**锦上添花**的现场保护，
         不该因为 localStorage 配额满之类的边缘情况就让入口失灵。 */
      if (c.saveProject !== false && typeof window.runyeSaveProject === 'function') {
        try { window.runyeSaveProject(true); } catch (e) { }
      }
      if (c.anchorKey) {
        try {
          window.localStorage.setItem(c.anchorKey, JSON.stringify({ at: Date.now(), src: 'smart-popup' }));
        } catch (e) { }
      }
      var w = window.open(c.href, c.winName || '', c.winFeatures || '');
      /* ④ 回落：浏览器拦了弹窗（常见于快捷方式启动 / 严格隐私设置） */
      if (!w) window.location.assign(c.href);
      return true;
    }
    window.location.assign(c.href);
    return true;
  } catch (e) {
    ctx.runtime.reportError(e);
    return false;
  }
}

/* 业务内核桥接：runye-ai-plan.js 已在主页加载并挂 window.RyAiPlan
   （Node 也能 require）。这里只登记一个**取用通道**，供其它插件复用同一份口径，
   不重复实现、也不改它一个字。取不到返回 null —— 宁可让调用方说「没有」，
   也不要替它编一个假的。 */
function aiPlanKernel() {
  try { return (typeof window !== 'undefined') ? (window.RyAiPlan || null) : null; }
  catch (e) { return null; }
}

function activate(ctx) {
  var c = cfg(ctx);
  var nc = navCfg(ctx);

  /* ★ 模块级状态复位：deactivate 会把 stopped 置 true，而 ES 模块只加载一次 ——
     不复位的话第二次 activate 全短路（这条 bug 在 hydraulics 上被 C35 抓到过）。 */
  stopped = false; taken = null; mo = null; unnav = null;

  /* 条件等待老项出现 + before 锚点（'.fn-more'）已渲染：
     两者都齐才接管，任一缺席就重试（上限 40×50ms）。
     等不到则降级为「只补插件入口、不动老项」—— 入口不能丢优先于位置一致。 */
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

    if (ctx.ui && typeof ctx.ui.registerNav === 'function') {
      unnav = ctx.ui.registerNav({
        label: nc.label || ctx.id,
        title: nc.title || '',
        order: nc.order,
        /* 原位置：插到「水力校核」之前（原导航里智能规划就排在它前面）。
           ★ 为什么不只用 insertBefore('.fn-more')：两个插件锚在同一个元素上时，
             谁先挂载谁离锚点更近 —— 而插件激活顺序不定（实测水力校核先激活，
             于是智能规划被插到了它后面，导航顺序被倒置）。
             beforeLabel 没命中时 core 会自动降级用 insertBefore 兜底。 */
        beforeLabel: c.beforeLabel || null,
        before: c.insertBefore || null,
        gate: function () { return gate(ctx); },
        pending: function () { return pending(ctx); },
        onLocked: function () { onLocked(ctx); },
        onClick: function () { open(ctx); }
      });
    }
    ctx.runtime.log('boot', '智能规划插件已激活' + (taken ? '（已接管老入口）' : '（未找到老入口，降级）'));
  })();

  return {
    open: function () { return open(ctx); },
    /* 给其它插件复用同一份 AI 内核（不加载、不代理改写） */
    kernel: aiPlanKernel,
    kernelReady: function () { return !!aiPlanKernel(); },
    /* 「当前参数是 AI 给的还是手填的」—— 案例沉淀时要能说清来源 */
    provenance: function () {
      var K = aiPlanKernel();
      if (!K || typeof K.getProvenance !== 'function') return null;
      try { return K.getProvenance(); } catch (e) { return null; }
    },
    state: function () {
      return { nav: !!unnav, stolen: !!taken, kernel: !!aiPlanKernel(), stopped: stopped };
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
}

export { activate, deactivate };
