/* ============================================================
   plugins/pipe-assemble —— 「管路拼装」老模块迁移（壳，阶段五第 2 项）
   ------------------------------------------------------------
   迁移对象：管路接驳拼装.html（独立页面），入口是 runye-nav.js 渲染的
   MORE_ITEMS 项「管路拼装」—— 在「更多 ▾」面板里，**不是**顶级导航项。
   本插件只做三件事：接管入口 → 在**原容器原位置**补回 → 点击跳同一页面。
   业务零改动（连 href 都是 manifest 配置的）。

   ★ 与水力校核（plugins/hydraulics）同形态但两处不同，别照抄：
     1) 位置：水力校核在顶级导航条（before:'.fn-more'）；管路拼装在折叠面板里，
        必须带 container='.fn-more-panel'，否则插件按钮会跳到主导航条上。
        锚点用 beforeLabel（按文字）而不是 before（选择器）——
        面板项是 runye-nav.js 统一渲染的，只有 data-ry-navitem="1"，
        href 还会随页面有没有 data-base 在 '#xxx' 与 'index.html#xxx' 之间变。
     2) 会员门控：老项 feat='pro-others'（L2 高级会员），老入口自带「·锁」+ 升级引导。
        换成插件导航若丢掉这道闸 = 付费功能对全员敞开 ——
        **这是迁移引入的越权，不是原有行为**，所以这里把 runye-nav.js 的
        gate() 三态 fail-open 语义原样搬过来（详见下方 gate() 注释）。

   ★ 与水力校核相同的一条：老项由 RyFnNav.render() 渲染，而**权益层就绪会触发
     重渲染**把它原样再造出来 —— 只摘一次必然出现「老项 + 插件项」双入口。
     ⇒ 必须挂抑制器（MutationObserver）：重渲染造一次摘一次。
   ============================================================ */
var unnav = null;        /* ctx.ui.registerNav 的注销函数 */
var mo = null;           /* 抑制器 observer */
var taken = null;        /* 被摘老项的存根 { el, parent, next } */
var stopped = false;
var onEntitle = null;    /* 权益变化 → 刷新锁定态的监听函数（卸载时摘掉） */

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
   会员门控：与 runye-nav.js 的 gate() **同一套三态 fail-open** ——
     只有「已确认无权限」才锁：
       a) 权益层未加载（离线 / 脚本缺失 / 老页面没引 runye-entitle.js）→ 放行；
       b) 已加载但还没拿到服务端真相（ready()===false）→ 放行；
       c) 已拿到真相 → 严格按 RyEntitle.can(feat) 判定。
   为什么不能图省事直接 `!RyEntitle.can(feat)`：
     网络抖动 / 云函数没部署 / SDK 加载慢，都会让 can() 在这一刻返回 false，
     那样老用户会被当场锁死 —— 这是「把可用性当权限」的典型错法。
   ------------------------------------------------------------ */
function gate(ctx) {
  var feat = cfg(ctx).feat;
  if (!feat) return true;
  var E = (typeof window !== 'undefined') ? window.RyEntitle : null;
  if (!E || typeof E.can !== 'function') return true;
  if (E.mockPlan) return E.can(feat);          /* 本地联调钩子 ?rymock= */
  if (typeof E.ready === 'function' && !E.ready()) return true;
  return E.can(feat);
}

/* 锁定态点击 → 升级引导（面板由 runye-member-ui.js 提供；未加载则退化为 toast，
   与 runye-nav.js 的 showToast 同款 DOM/类名，皮肤在 runye-nav.css 的 .ry-nav-toast） */
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
  toast('「' + label + '」为高级会员功能 · 邀请好友即可开通');
}

/* 权益变化 → 刷新插件导航项的锁定态。
   必要性：面板里的插件项会随面板重建而重挂（自然刷新），但万一插件项落在
   主导航条上（container 缺失时的降级路径），它不带 data-ry-navitem、
   不会被 RyFnNav.render() 重建 —— 锁定态就永远停在挂载那一刻。 */
function bindEntitle(ctx) {
  var E = (typeof window !== 'undefined') ? window.RyEntitle : null;
  onEntitle = function () {
    if (stopped) return;
    try { if (ctx.ui && typeof ctx.ui.refreshNavs === 'function') ctx.ui.refreshNavs(); } catch (e) { }
  };
  if (E && typeof E.onChange === 'function') {
    try { E.onChange(onEntitle); } catch (e) { }
  }
  document.addEventListener('ryentitle-ready', onEntitle);
}

function unbindEntitle() {
  if (onEntitle) {
    try { document.removeEventListener('ryentitle-ready', onEntitle); } catch (e) { }
    onEntitle = null;
  }
}

function activate(ctx) {
  var c = cfg(ctx);
  var nc = navCfg(ctx);

  /* ★ 模块级状态复位：deactivate 会把 stopped 置 true，而 ES 模块只加载一次 ——
     不复位的话，第二次 activate（重新加载插件 / 闸门多环境跑）时 probe 直接短路，
     接管和导航注册全都不发生（这条 bug 在 hydraulics 上被闸门 C35 实测抓到过）。 */
  stopped = false; taken = null; mo = null; unnav = null;

  /* 点击行为 = 老入口的同款跳转（href 由 manifest 配置，不写死） */
  function open() {
    try { window.location.assign(c.href); }
    catch (e) { ctx.runtime.reportError(e); }
  }

  /* 条件等待老项出现 + 老容器已渲染（runye-nav.js 在解析期渲染，通常立刻就有；
     上限 40×50ms，超时则降级为「只加插件入口、不动老项」—— 入口不能丢）
     ★ 容器必须等：container 选择器此刻命中不到时，core containersFor 会退回
       主导航条 —— 按钮就从「更多」面板跳到顶栏了（位置变了，等于没保住原位）。
     ★ 锚点不在这里等：core mountNavs 自带 20 次有界重试（见 core/ui-shell.js）。 */
  var tries = 0;
  (function probe() {
    if (stopped) return;
    var legacy = c.takeOverNav === false ? null : findLegacy(ctx);
    var boxOk = !c.container || !!document.querySelector(c.container);
    if (legacy && boxOk) {
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
        container: c.container || null,        /* 原容器：回到「更多 ▾」面板里 */
        beforeLabel: c.beforeLabel || null,    /* 原位置：插回「经济指标分析」之前 */
        gate: function () { return gate(ctx); },
        onLocked: function () { onLocked(ctx); },
        onClick: open
      });
    }
    bindEntitle(ctx);
    ctx.runtime.log('boot', '管路拼装插件已激活' + (taken ? '（已接管老入口）' : '（未找到老入口，降级）'));
  })();
}

function deactivate() {
  stopped = true;
  unbindEntitle();
  if (mo) { try { mo.disconnect(); } catch (e) { } mo = null; }
  if (unnav) { try { unnav(); } catch (e) { } unnav = null; }
  /* 老项插回原位（原来是老项的 parent 在 next 之前） */
  if (taken && taken.parent) {
    try { taken.parent.insertBefore(taken.el, taken.next); } catch (e) { }
  }
  taken = null;
}

export { activate, deactivate };
