/* ============================================================
   runye-nav.js — 顶部功能区导航「按钮清单」唯一出处（2026-09-13 去重）
   index.html（站内锚点 + data-target，参与滚动高亮/单视口切换）
   与 runye-map-measure.html（跨页链接）共用本清单。
   页面用法：
     <div class="fn-inner" data-ry-fnnav>（可含本页特有静态项，如主页 ⚙️生成系统图）</div>
     <script src="runye-nav.js"></script>
   带纯锚点项的页面写 data-base="index.html#"，主页不写（锚点就地生效）。
   清单增减只改 ITEMS / MORE_ITEMS —— 所有页面顶部导航同步变化。
   ⚠ 不收录「管网布置(#networkSection)/数据对比(#irrCompareSection)」：
     两区块在主页 display:none 且无入口（主页导航脚本会自动剔除隐藏区块），
     2026-09-13 起清单与主页实际可见项保持一致；两区块恢复上线时加回本清单即可。

   [v247 2026-10-06 用户要求] 两处调序 + 折叠组：
     1) 成组管路 移到 三级管路编辑 之后；
     2) 材料清单 移到 管路拼装 之前；
     3) 「管路拼装 / 经济指标分析 / 数字化建模 / 滴灌带查询」折叠进「更多 ▾」
        （MORE_ITEMS；管网优化详细分析由 pipe_optim_ui.js 注入到同一面板）。
     折叠面板 position:fixed（.fn-inner 是 overflow-x:auto 的滚动容器，
     absolute 会被裁掉）；皮肤在 runye-nav.css 的 .fn-more-* 段。
   ============================================================ */
(function (global) {
  'use strict';
  /* 顶层常驻项（pre:1 = 注入到本页静态特有项之前） */
  var ITEMS = [
    { label: '标准分区预设', hash: 'designInput',              pre: 1 },
    /* [v250 2026-10-06 用户要求] 在线地图 移到 地块绘制 之前 */
    { label: '在线地图',     href: 'runye-map-measure.html',   pre: 1 },
    { label: '地块绘制',     hash: 'areaTool',                 pre: 1 },
    /* [NEW MODULE: 地形模块] 阶段1 基础框架（terrain/ 独立目录，卸载=删除本行+terrain/+sw.js 条目） */
    { label: '地形模块',     href: 'terrain/index.html',       pre: 1, title: '地形模块：shp/RTK边界导入、CGCS2000校验、面积、高程数据源登记' },
    /* [v250 2026-10-06 用户要求] 「二级管路」改名「地块分区」；
       [v250] 「三级管路编辑」改名「管路规划」（底部状态栏 NAMES 映射与
       pipe_optim_ui 提示文案同步改名）。hash/id 不变，仅显示名变。 */
    { label: '地块分区',     hash: 'pipePlanSection',          pre: 1 },
    { label: '管路规划',     hash: 'tlPipePlanSection',        pre: 1 },
    /* [v247] 成组管路：整组总览 + 总管编辑 + 按块进入三级页。用户拍板放到「三级管路编辑」之后。
       ★ 仅成组地块才有意义 —— 非成组时该页显示空态提示，导航项保留（不玩"显隐猜谜"，
       点进去看到一句明确的说明，比点了没反应强）。 */
    { label: '多地块规划',   hash: 'grPipeSection',            pre: 1, title: '成组地块：全组总览 + 总管编辑 + 按块进入管路规划' },
    /* [v247] 材料清单移到「管路拼装」之前（管路拼装本身已折叠进「更多」） */
    { label: '材料清单',     hash: 'detailsSection',           pre: 1 },
    { label: '轴测图',       act: 'iso', page: 'index.html',   pre: 1, title: '三级管线轴测图（先「生成管线图」再点）' },
    { label: '过滤系统',     hash: 'filterSystemSection',      pre: 1, title: '过滤系统 · GREEN 型单体并联机组（初稿）' },
    { label: '系统图',       act: 'sys', page: 'index.html',   pre: 1, title: '三级系统图（供水首部系统图）' }
  ];
  /* [v247] 折叠进「更多 ▾」的低频项：面板竖排，点开才见。
     act 项不放这里（轴测图/系统图留在顶层）；管网优化详细分析由 pipe_optim_ui.js 追加进面板。 */
  var MORE_ITEMS = [
    { label: '管路拼装',     href: '管路接驳拼装.html',         title: '管路接驳拼装：管件级拼装 + 单向水力计算' },
    /* [v299 2026-10-08 用户要求] 水力校核：独立模块（自动读 runye_network_layout，
       树状拓扑+全链路水损+滴灌带多孔出流+水泵选型+EPANET WASM 对照），原软件逻辑零改动 */
    { label: '水力校核',     href: 'runye-hydraulics.html',     title: '水力校核：自动读已布置管网，逐段流量/流速/水损 + 最不利路径 + 需求扬程与水泵选型' },
    { label: '经济指标分析', hash: 'threeDModelingSection',     title: '管径经济指标分析：前期管材投入 vs 后期电费，找年均总成本最低的平衡点' },
    { label: '数字化建模',   hash: 'parametricModelingSection', title: '数字化建模 · 参数化节点建模' },
    { label: '滴灌带查询',   href: '耐特菲姆滴灌带长度查询器.html' }
  ];
  function curFile() {
    var p = decodeURIComponent((global.location && global.location.pathname) || '');
    return p.split('/').pop() || 'index.html';
  }
  /* 单个导航项 → 元素（顶层与「更多」面板共用同一套皮肤/属性逻辑） */
  function makeItem(it, base, root) {
    /* [v286g] root=子目录页声明的根前缀（如 terrain/ 页的 ../）：
       有 root 的页面绝不是 act 宿主页（主页在站点根）⇒ act 项恒为跨页 <a>。 */
    var localAction = it.act && curFile() === it.page && !root;
    var a = document.createElement(localAction ? 'button' : 'a');
    if (localAction) a.type = 'button';
    a.className = 'fn-link';
    a.setAttribute('data-ry-navitem', '1');
    if (it.href === 'runye-map-measure.html' || it.hash === 'pipePlanSection' || it.hash === 'tlPipePlanSection') a.setAttribute('data-ry-mobile-nav', '1');
    a.textContent = it.label;
    if (it.title) a.title = it.title;
    if (it.act && !localAction) {
      a.href = root + it.page + '#nav-' + it.act;
    } else if (localAction) {
      /* 动作按钮：点击调页面注册的 window.RyFnNavActions[act]（无注册则忽略） */
      a.setAttribute('data-ry-navact', it.act);
      a.addEventListener('click', function () {
        if (global.RyFnNavActions && typeof global.RyFnNavActions[it.act] === 'function') {
          global.RyFnNavActions[it.act]();
        }
      });
    } else if (it.hash) {
      if (global.RyMobile && global.RyMobile.isActive() && (it.hash === 'pipePlanSection' || it.hash === 'tlPipePlanSection')) {
        a.href = 'runye-mobile-map-preview.html?v=242#' + (it.hash === 'pipePlanSection' ? 'second' : 'third');
      } else {
        a.href = root + base + it.hash;
        if (!base) a.setAttribute('data-target', it.hash);
      }
    } else {
      // [v235] 移动端直接进新的手机地图预览页；桌面端仍走旧地图页
      var navHref = it.href;
      if (navHref === 'runye-map-measure.html' && global.RyMobile && global.RyMobile.isActive()) {
        navHref = 'runye-mobile-map-preview.html?v=242';
      }
      a.href = root + navHref;
      /* 当前页高亮：仅普通站内链接参与（锚点项由页面自有逻辑管理 active） */
      if (curFile() === navHref.split('#')[0]) a.classList.add('active');
    }
    return a;
  }
  /* [v247] 「更多 ▾」折叠组：触发钮 + 竖排面板。
     面板 position:fixed（.fn-inner overflow-x:auto 会裁掉 absolute 后代），
     坐标在打开时按触发钮实时算，滚动/改窗即收起。 */
  var morePanelEl = null;
  var moreGlobalsBound = false;
  function buildMore(base, root) {
    var wrap = document.createElement('div');
    wrap.className = 'fn-more';
    wrap.setAttribute('data-ry-navitem', '1');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fn-link fn-more-btn';
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-haspopup', 'true');
    btn.title = '更多工具：管路拼装 / 水力校核 / 经济指标分析 / 数字化建模 / 滴灌带查询 / 管网优化详细分析';
    var caret = document.createElement('span');
    caret.className = 'fn-more-caret';
    caret.setAttribute('aria-hidden', 'true');
    caret.textContent = '▾';
    btn.appendChild(document.createTextNode('更多 '));
    btn.appendChild(caret);
    var panel = document.createElement('div');
    panel.className = 'fn-more-panel';
    panel.hidden = true;
    panel.setAttribute('role', 'menu');
    MORE_ITEMS.forEach(function (it) { panel.appendChild(makeItem(it, base, root)); });
    wrap.appendChild(btn);
    wrap.appendChild(panel);
    morePanelEl = panel;

    function place() {
      var r = btn.getBoundingClientRect();
      panel.style.top = Math.round(r.bottom + 2) + 'px';
      panel.style.right = Math.max(6, Math.round(global.innerWidth - r.right)) + 'px';
      panel.style.left = 'auto';
    }
    function open() {
      panel.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      wrap.classList.add('open');
      place();
    }
    function close() {
      if (panel.hidden) return;
      panel.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      wrap.classList.remove('open');
    }
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (panel.hidden) open(); else close();
    });
    /* 点面板里的项 → 先收起（跳转/切区由各自 href/data-target 照常生效） */
    panel.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('.fn-link') : null;
      if (t) close();
    });
    /* 全局收起监听只绑一次（mount 可能重复调用，重复绑会堆积监听器） */
    if (!moreGlobalsBound) {
      moreGlobalsBound = true;
      document.addEventListener('pointerdown', function (e) {
        var w = e.target && e.target.closest ? e.target.closest('.fn-more') : null;
        if (!w) closeAll();
      });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAll(); });
      global.addEventListener('resize', function () { if (morePanelEl && !morePanelEl.hidden) placeLast(); });
      global.addEventListener('scroll', function () { closeAll(); }, true);
    }
    wrap._place = place;
    return wrap;
  }
  /* 全局收起 / 重排助手（监听器闭包里引用，避免绑死在某一次 mount 的节点上） */
  var lastWrap = null;
  function closeAll() {
    if (!lastWrap) return;
    var panel = lastWrap.querySelector('.fn-more-panel');
    var btn = lastWrap.querySelector('.fn-more-btn');
    if (panel && !panel.hidden) {
      panel.hidden = true;
      if (btn) btn.setAttribute('aria-expanded', 'false');
      lastWrap.classList.remove('open');
    }
  }
  function placeLast() {
    if (lastWrap && lastWrap._place) lastWrap._place();
  }
  function mount(el) {
    var base = el.getAttribute('data-base') || '';
    /* [v286g] 子目录页（如 terrain/index.html）声明 data-root="../"，站内相对链接统一上跳一级 */
    var root = el.getAttribute('data-root') || '';
    /* 重复调用防护：只清本渲染器注入的节点，保留页面静态子项 */
    Array.prototype.slice.call(el.querySelectorAll('[data-ry-navitem]')).forEach(function (n) {
      if (n.parentNode) n.parentNode.removeChild(n);
    });
    var marker = el.firstElementChild;
    ITEMS.forEach(function (it) {
      var a = makeItem(it, base, root);
      if (it.pre && marker) el.insertBefore(a, marker);
      else el.appendChild(a);
    });
    /* [v247] 折叠组追加在末尾（⚙️设置 带 order:999 仍钉在最右，视觉顺序不受 DOM 影响） */
    var more = buildMore(base, root);
    lastWrap = more;
    el.appendChild(more);
  }
  global.RyFnNav = {
    items: ITEMS,
    moreItems: MORE_ITEMS,
    /* [v247] 「更多」面板元素 —— pipe_optim_ui.js 把「管网优化详细分析」追加到这里 */
    getMorePanel: function () { return morePanelEl; },
    render: function () {
      var els = document.querySelectorAll('[data-ry-fnnav]');
      for (var i = 0; i < els.length; i++) mount(els[i]);
      return els.length;
    }
  };
  /* 关键时序：本脚本必须紧随导航标记之后引入，解析到即立即渲染 ——
     主页底部的导航逻辑脚本（绑定点击/高亮）在解析时就查询 .fn-link，
     若推迟到 DOMContentLoaded 才注入，主页导航会整条失灵。
     只有当挂载点还没出现（脚本放在 <head> 之类）时才退到 DOMContentLoaded 重试一次；
     mount() 自带 [data-ry-navitem] 清理，重复渲染安全。 */
  if (!global.RyFnNav.render() && document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { global.RyFnNav.render(); });
  }
  // 跨页入口在宿主初始化完成后切换实际功能区，不能只滚动到隐藏区块。
  function openLinkedSection() {
    if (curFile() !== 'index.html') return;
    var hash = global.location.hash.slice(1);
    var all = ITEMS.concat(MORE_ITEMS);   /* [v247] 折叠项也要能被 #hash 直达 */
    var item = all.filter(function (it) { return it.hash === hash || (it.act && 'nav-' + it.act === hash); })[0];
    if (!item) return;
    if (item.act && global.RyFnNavActions && typeof global.RyFnNavActions[item.act] === 'function') {
      global.RyFnNavActions[item.act]();
    } else if (item.hash && typeof global.ryJumpToSection === 'function') {
      global.ryJumpToSection(item.hash);
    }
  }
  global.addEventListener('load', openLinkedSection);
  global.addEventListener('hashchange', openLinkedSection);
})(typeof window !== 'undefined' ? window : globalThis);
