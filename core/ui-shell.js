/* ============================================================
   core/ui-shell.js — 插件 UI 挂载与导航注册（ES Module）
   ------------------------------------------------------------
   · 插件容器：#ry-plugin-root 下为每个插件建一个 slot（插件自管显隐）
   · 导航项：往 .fn-inner[data-ry-fnnav] 追加按钮
   ------------------------------------------------------------
   ⚠ 与 runye-nav.js 共存的关键约定（踩过才知道）：
     RyFnNav.render() 会清空容器内所有 [data-ry-navitem] 再重建，
     且权益层就绪后会**再渲染一次**（见 runye-nav.js 的 RyEntitle.onChange 订阅）。
     ⇒ 插件导航项**绝不能**带 data-ry-navitem，否则一渲染就被冲掉。
     ⇒ 这里统一用 data-ry-plugin-nav，并挂 MutationObserver：
       发现自己的节点被摘掉就补回（render 重建期间也不丢）。
   ============================================================ */

var ROOT_ID = 'ry-plugin-root';

function ensureRoot() {
  var root = document.getElementById(ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = ROOT_ID;
    root.setAttribute('data-ry-plugin-root', '1');
    /* 容器本身不参与布局：插件面板自己负责定位（fixed 浮层为主） */
    root.style.cssText = 'position:absolute;width:0;height:0;overflow:visible;left:0;top:0;';
    document.body.appendChild(root);
  }
  return root;
}

export function createUiShell(guard) {
  guard = guard || null;
  var navItems = [];            /* { id, label, title, onClick, order } */
  var slots = Object.create(null);
  var observer = null;
  var pending = false;

  function navSelector(id) { return '[data-ry-plugin-nav="' + id + '"]'; }

  function makeNavEl(item) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'fn-link';
    b.setAttribute('data-ry-plugin-nav', item.id);
    applyLock(b, item);          /* [v378] 文字/标题/class 一次设齐（含锁定态的「·锁」） */
    b.addEventListener('click', function (ev) {
      ev.preventDefault();
      /* ★ 锁定判定放在点击这一刻重算（不是挂按钮那一刻）：
         权益是异步拉回来的，用户可能在「权益还没到 → 放行」期间看到按钮，
         等真点下去时真相已到 —— 必须在点击时再问一次，否则越权窗口一直开着。 */
      if (isLocked(item)) {
        try { if (typeof item.onLocked === 'function') item.onLocked(ev); }
        catch (e) { if (guard) guard.reportError(item.id, e, 'nav-locked'); }
        return;
      }
      try {
        if (typeof item.onClick === 'function') item.onClick(ev);
      } catch (e) {
        if (guard) guard.reportError(item.id, e, 'nav-click');
      }
    });
    return b;
  }

  /* 每个导航项可自带 container（CSS 选择器），默认挂到主导航条 [data-ry-fnnav]。
     [阶段四 2026-10-11] 老模块迁移需要「按钮落回它原来所在的容器」
     （pipe_optim 原本在「更多」下拉面板里，迁移后不该跳到主导航条上）。 */
  function containersFor(item) {
    var sel = (item && item.container) || '[data-ry-fnnav]';
    var list = [];
    try { list = Array.prototype.slice.call(document.querySelectorAll(sel)); } catch (e) { list = []; }
    if (!list.length && sel !== '[data-ry-fnnav]') {
      /* 自定义容器此刻不存在（导航正在重建、面板被整个换掉）→ 退回默认容器。
         ★ 这是「入口不能丢」优先于「位置必须一致」：面板没了宁可落回主导航条，
           也不能让插件变成没有任何入口的死插件。 */
      try { list = Array.prototype.slice.call(document.querySelectorAll('[data-ry-fnnav]')); } catch (e2) { list = []; }
    }
    return list;
  }

  /* [v378] 导航项标签归一化：门控锁定态会加「 ·锁」后缀（状态装饰，不是名字的一部分）。
     凡按文字定位/比较的地方都必须先过这里，否则「锁没锁」会决定落位成败。 */
  function normLabel(t) { return String(t || '').replace(/\s*·\s*锁\s*$/, '').trim(); }

  /* [v378] 落位锚点两种写法：
       before      —— CSS 选择器（老导航有稳定 class/id 时用，如 '.fn-more'）；
       beforeLabel —— 按**可见文字**在 box 的直接子节点里找（新增）。
     beforeLabel 存在的理由：「更多 ▾」面板里的老项由 runye-nav.js 统一渲染，
     只有 data-ry-navitem="1"，**没有可依赖的 id/class**；而 href 在子页会变成
     'index.html#xxx'、在主页是 '#xxx' —— 用属性选择器定位跨页就废。
     按文字定位是唯一在「权益重渲染 → 面板整体重建」之后仍然稳定的方式
     （与插件侧 findLegacy 用同一套归一化，两边不会各说各话）。 */
  function anchorFor(box, item) {
    /* ① 按文字定位（首选：跨重渲染稳定） */
    if (item && item.beforeLabel) {
      var kids = box.children || [];
      for (var i = 0; i < kids.length; i++) {
        if (normLabel(kids[i].textContent) === normLabel(item.beforeLabel)) return kids[i];
      }
      /* ★ 找不到就**降级到 before 选择器**，而不是直接退回 appendChild：
         锚点是另一个插件的导航项时，它可能还没挂载（插件激活顺序不定）；
         给它一个「退到更稳的锚点」的机会，比掉到容器末尾好得多。 */
    }
    if (item && item.before) {
      try { return box.querySelector(item.before); } catch (e) { return null; }
    }
    return null;
  }

  /* [v377] 导航项落位：默认 appendChild；给了锚点就插到该元素前面。
     用途：老模块迁移要保住原位置（如「水力校核」原本紧挨「更多 ▾」之前，
     追加到末尾会改变顶级导航顺序）。★ 锚点找不到时退回 appendChild ——
     「入口不能丢」优先于「位置一致」（与 containersFor 的降级是同一条原则）。 */
  function placeIn(box, el, item) {
    var anchor = anchorFor(box, item);
    if (anchor && anchor.parentNode === box) box.insertBefore(el, anchor);
    else box.appendChild(el);
  }

  /* [v378] 锁定态：老导航项被会员门控拦住时会显示「原名 ·锁」并引导升级。
     插件接管的入口**必须保留这道闸** —— 否则「老入口锁着、插件入口敞着」，
     付费功能等于对全员开放（这是迁移本身引入的越权，不是原有行为）。
     gate 由插件提供（它才知道 feat 键与三态 fail-open 语义），core 只负责表现。 */
  function isLocked(item) { return !!(item && typeof item.gate === 'function' && !item.gate()); }

  function applyLock(b, item) {
    var locked = isLocked(item);
    var label = item.label || item.id;
    b.textContent = locked ? (label + ' ·锁') : label;
    try { b.classList.toggle('fn-locked', locked); } catch (e) { }
    if (locked) {
      b.setAttribute('data-ry-locked', '1');
      b.setAttribute('aria-disabled', 'true');
      b.title = '「' + label + '」为高级会员功能 · 点击查看开通方式';
    } else {
      b.removeAttribute('data-ry-locked');
      b.removeAttribute('aria-disabled');
      b.title = item.title || '';
    }
    return locked;
  }

  function mountNavs() {
    var n = 0, waiting = false;
    for (var j = 0; j < navItems.length; j++) {
      var item = navItems[j];
      var cs = containersFor(item);
      for (var i = 0; i < cs.length; i++) {
        var box = cs[i];
        var ex = box.querySelector(navSelector(item.id));
        if (ex) { applyLock(ex, item); continue; }   /* 已存在则不重复插；只刷新锁定态 */
        /* [v377] 锚点暂缺（导航正在分块重建）→ 有界重试等锚点，别急着退回 appendChild：
           真页面实测 RyFnNav.render() 分块追加顶级项，core 的重挂载常跑在「更多 ▾」重建完成之前，
           立即落位会把插件项插到中间（位置错，且不会再被纠正）。
           [v378] 重试条件改成共用 anchorFor —— beforeLabel 与 before 一视同仁。
           最多等 20 次（约 20×2帧 ≈ 0.7s），之后按「入口不能丢」落回 appendChild。 */
        if ((item.before || item.beforeLabel) && !anchorFor(box, item)) {
          item._beforeTries = (item._beforeTries || 0) + 1;
          if (item._beforeTries <= 20) { waiting = true; continue; }
        }
        placeIn(box, makeNavEl(item), item);
        n++;
      }
    }
    if (waiting) scheduleRemount();
    return n;
  }

  function scheduleRemount() {
    if (pending) return;
    pending = true;
    var kick = function () {
      pending = false;
      try { mountNavs(); } catch (e) { if (guard) guard.reportError('core', e, 'nav-remount'); }
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(kick);
    else setTimeout(kick, 16);
  }

  /* 可重复调用：observer 只建一次，但每次都会把「当前已知容器」补观察进去
     （新插件后注册自定义容器时也能被覆盖到）。 */
  function startObserver() {
    if (typeof MutationObserver === 'undefined') return;
    if (!observer) observer = new MutationObserver(scheduleRemount);
    var seen = [];
    var add = function (el) {
      if (!el || seen.indexOf(el) >= 0) return;
      seen.push(el);
      try { observer.observe(el, { childList: true }); } catch (e) { }
    };
    var cs = document.querySelectorAll('[data-ry-fnnav]');
    for (var i = 0; i < cs.length; i++) add(cs[i]);
    for (var j = 0; j < navItems.length; j++) {
      var c = containersFor(navItems[j]);
      for (var k = 0; k < c.length; k++) add(c[k]);
    }
  }

  function registerNav(item) {
    if (!item || !item.id) return function () { };
    if (navItems.some(function (x) { return x.id === item.id; })) {
      if (guard) guard.reportError(item.id, new Error('duplicate nav id'), 'registerNav');
      return function () { };
    }
    navItems.push({
      id: item.id,
      label: item.label || item.id,
      title: item.title || '',
      onClick: item.onClick || null,
      order: item.order == null ? 99 : item.order,
      container: item.container || null,     /* [阶段四] 可选：挂到指定容器（老模块迁移时保持原位） */
      before: item.before || null,           /* [v377] 可选：插到该选择器命中的兄弟元素之前（保住原位置） */
      beforeLabel: item.beforeLabel || null, /* [v378] 可选：插到「可见文字为此值」的兄弟之前（跨重渲染稳定） */
      gate: typeof item.gate === 'function' ? item.gate : null,       /* [v378] 可选：返回 false = 锁定（会员门控） */
      onLocked: typeof item.onLocked === 'function' ? item.onLocked : null
    });
    navItems.sort(function (a, b) { return a.order - b.order; });
    mountNavs();
    startObserver();
    return function unregister() {
      navItems = navItems.filter(function (x) { return x.id !== item.id; });
      var els = document.querySelectorAll(navSelector(item.id));
      for (var i = 0; i < els.length; i++) {
        if (els[i].parentNode) els[i].parentNode.removeChild(els[i]);
      }
    };
  }

  function unregisterNav(id) {
    var els = document.querySelectorAll(navSelector(id));
    for (var i = 0; i < els.length; i++) {
      if (els[i].parentNode) els[i].parentNode.removeChild(els[i]);
    }
    navItems = navItems.filter(function (x) { return x.id !== id; });
  }

  /* 插件挂载容器：默认隐藏，插件自己决定何时显示 */
  function createMount(id, opts) {
    opts = opts || {};
    ensureRoot();
    var el = document.getElementById('ry-plugin-' + id);
    if (!el) {
      el = document.createElement('div');
      el.id = 'ry-plugin-' + id;
      el.className = 'ry-plugin-slot';
      el.setAttribute('data-ry-plugin-mount', id);
      el.style.display = opts.visible === true ? '' : 'none';
      ensureRoot().appendChild(el);
    }
    slots[id] = el;
    return el;
  }

  function getMount(id) { return slots[id] || document.getElementById('ry-plugin-' + id) || null; }

  function destroyMount(id) {
    var el = getMount(id);
    if (el && el.parentNode) el.parentNode.removeChild(el);
    delete slots[id];
  }

  /* 整体销毁：停掉 observer + 摘掉本实例注册的全部导航项。
     ★ 闸门与「插件体系整体卸载」都需要它；不停 observer 的话，
       清 DOM 会被 observer 当成「被导航重建冲掉」而自动补回。 */
  function dispose() {
    if (observer) { try { observer.disconnect(); } catch (e) { } observer = null; }
    var ids = navItems.map(function (x) { return x.id; });
    navItems = [];
    ids.forEach(function (id) {
      var els = document.querySelectorAll(navSelector(id));
      for (var i = 0; i < els.length; i++) {
        if (els[i].parentNode) els[i].parentNode.removeChild(els[i]);
      }
    });
  }

  return {
    ensureRoot: ensureRoot,
    createMount: createMount,
    getMount: getMount,
    destroyMount: destroyMount,
    registerNav: registerNav,
    unregisterNav: unregisterNav,
    /* [v378] 权益变化后刷新已挂载导航项的锁定态（不重建节点，避免打断用户操作）。
       用途：插件导航在主导航条上时不会随 RyFnNav.render() 一起重建
       （它没有 data-ry-navitem），锁定态会停在挂载那一刻 —— 必须能外部触发刷新。 */
    refreshNavs: function () {
      for (var j = 0; j < navItems.length; j++) {
        var els = document.querySelectorAll(navSelector(navItems[j].id));
        for (var i = 0; i < els.length; i++) applyLock(els[i], navItems[j]);
      }
    },
    mountNavs: mountNavs,
    dispose: dispose,
    navIds: function () { return navItems.map(function (x) { return x.id; }); }
  };
}
