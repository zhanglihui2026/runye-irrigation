/* ============================================================
   runye-nav.js — 顶部功能区导航「按钮清单」唯一出处（2026-09-13 去重）
   index.html（站内锚点 + data-target，参与滚动高亮/单视口切换）
   与 runye-map-measure.html（跨页链接）共用本清单。
   页面用法：
     <div class="fn-inner" data-ry-fnnav>（可含本页特有静态项，如主页 ⚙️生成系统图）</div>
     <script src="runye-nav.js"></script>
   带纯锚点项的页面写 data-base="index.html#"，主页不写（锚点就地生效）。
   清单增减只改 ITEMS —— 所有页面顶部导航同步变化。
   ⚠ 不收录「管网布置(#networkSection)/数据对比(#irrCompareSection)」：
     两区块在主页 display:none 且无入口（主页导航脚本会自动剔除隐藏区块），
     2026-09-13 起清单与主页实际可见项保持一致；两区块恢复上线时加回本清单即可。
   ============================================================ */
(function (global) {
  'use strict';
  var ITEMS = [
    { label: '标准分区预设', hash: 'designInput',              pre: 1 },
    { label: '地块绘制',     hash: 'areaTool',                 pre: 1 },
    { label: '在线地图',     href: 'runye-map-measure.html',   pre: 1 },
    { label: '二级管路',     hash: 'pipePlanSection',          pre: 1 },
    { label: '三级管路编辑', hash: 'tlPipePlanSection',   pre: 1 },
    { label: '轴测图',       act: 'iso', page: 'index.html',   pre: 1, title: '三级管线轴测图（先「生成管线图」再点）' },
    { label: '过滤系统',     hash: 'filterSystemSection', pre: 1, title: '过滤系统 · GREEN 型单体并联机组（初稿）' },
    { label: '系统图',       act: 'sys', page: 'index.html',   pre: 1, title: '三级系统图（供水首部系统图）' },
    { label: '材料清单',     hash: 'detailsSection',           pre: 1 },
    { label: '管径优化',     hash: 'threeDModelingSection', pre: 1, title: '管径综合优化：前期管材投入 vs 后期电费，找年均总成本最低的平衡点' },
    { label: '数字化建模',   hash: 'parametricModelingSection',pre: 1, title: '数字化建模 · 参数化节点建模' },
    { label: '滴灌带查询',   href: '耐特菲姆滴灌带长度查询器.html' }
    /* pre:1 = 注入到本页静态特有项（如 ⚙️生成系统图）之前；其余追加在末尾。
       act 项 = 本页动作按钮（渲染为 button，点击调 window.RyFnNavActions[act]）；
       page 项 = 动作所属页面（其他页面渲染为跨页链接）。 */
  ];
  function curFile() {
    var p = decodeURIComponent((global.location && global.location.pathname) || '');
    return p.split('/').pop() || 'index.html';
  }
  function mount(el) {
    var base = el.getAttribute('data-base') || '';
    /* 重复调用防护：只清本渲染器注入的节点，保留页面静态子项 */
    Array.prototype.slice.call(el.querySelectorAll('[data-ry-navitem]')).forEach(function (n) {
      if (n.parentNode) n.parentNode.removeChild(n);
    });
    var marker = el.firstElementChild;
    ITEMS.forEach(function (it) {
      var localAction = it.act && curFile() === it.page;
      var a = document.createElement(localAction ? 'button' : 'a');
      if (localAction) a.type = 'button';
      a.className = 'fn-link';
      a.setAttribute('data-ry-navitem', '1');
      a.textContent = it.label;
      if (it.title) a.title = it.title;
      if (it.act && !localAction) {
        a.href = it.page + '#nav-' + it.act;
      } else if (localAction) {
        /* 动作按钮：点击调页面注册的 window.RyFnNavActions[act]（无注册则忽略） */
        a.setAttribute('data-ry-navact', it.act);
        a.addEventListener('click', function () {
          if (global.RyFnNavActions && typeof global.RyFnNavActions[it.act] === 'function') {
            global.RyFnNavActions[it.act]();
          }
        });
      } else if (it.hash) {
        a.href = base + it.hash;
        if (!base) a.setAttribute('data-target', it.hash);
      } else {
        a.href = it.href;
        /* 当前页高亮：仅普通站内链接参与（锚点项由页面自有逻辑管理 active） */
        if (curFile() === it.href.split('#')[0]) a.classList.add('active');
      }
      if (it.pre && marker) el.insertBefore(a, marker);
      else el.appendChild(a);
    });
  }
  global.RyFnNav = {
    items: ITEMS,
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
    var item = ITEMS.filter(function (it) { return it.hash === hash || (it.act && 'nav-' + it.act === hash); })[0];
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
