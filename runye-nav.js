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
  /* [v346 2026-10-09 用户指令] 导航收敛：顶层只留 智能规划/在线地图/地块分区/管路规划/过滤系统/水力校核，
     其余全部并入 MORE_ITEMS「更多 ▾」。
     [v387 2026-10-12 用户指令] 「更多」内容全部展开到顶栏——六项回到 ITEMS 顶层。
     [v401 2026-10-12 用户指令] 顶栏二次收敛：过滤系统/轴测图/系统图/滴灌带查询 折叠回「更多 ▾」
     （协议自检/参数标定由插件侧 container='.fn-more-panel' 同步折叠）。
     ★ v346 的「更多内项目线上锁」随本次解除：折叠项全部是已上线功能（各自带 feat 会员门控，
       由 makeItem 的 gate() 兜底），线上整体拦截会把正式功能锁死 —— 面板委托拦截与
       openLinkedSection 的 hash 直达拦截一并移除，IS_ONLINE 保留作诊断备用。 */
  var ITEMS = [
    /* [v331] 智能规划独立窗口：win:1 点击弹新窗全屏对话，主窗口原地不动 */
    /* [v358] feat = 会员功能 key（见 runye-entitle.js 的 FEATURES）：
         ai-plan / online-map / zone-split / pipe-layout  → L1 注册会员（匿名试用也放行）
         hydraulic-check / pro-others                     → L2 高级会员 */
    { label: '智能规划', href: 'index.html?smart=1#pipePlanSection', win: 1, feat: 'ai-plan', title: '独立窗口打开：AI 对话规划（主窗口地块分区不受影响）' },
    /* [v391 2026-10-12 用户指令] 顶栏重排：智能规划第一（由 ai-plan 插件锚定在「地块绘制」
       之前实现）、地块绘制放到 在线地图 之前 —— 故本条提前并加 pre:1（与 v250 旧序对调）。 */
    /* [v402 2026-10-12 用户指令] 「文件」成为真顶层项（fileMenu:1，放「地块绘制」之前）：
       由本渲染器产出 DOM，顺序=数组顺序（彻底消除静态块 relocate 与插件锚定的位置竞态）；
       去掉 📂 图标。面板本体由 mod/inline-32.js 动态创建（RyFileMenu.toggle(btn)）。 */
    { label: '文件',         fileMenu: 1, pre: 1, feat: '', title: '文件：导入 / 导出 / 工程 统一入口' },
    { label: '地块绘制',     hash: 'areaTool',                 pre: 1, feat: 'pro-others', title: '地块绘制工具（比例尺 / 绘制边界 / 地块库）' },
    /* [v250] 在线地图 移到 地块绘制 之前（v346 起地块绘制折叠进「更多」；v391 按用户指令对调回来） */
    { label: '在线地图',     href: 'runye-map-measure.html',   pre: 1, feat: 'online-map' },
    /* [v250] 「二级管路」改名「地块分区」、「三级管路编辑」改名「管路规划」（hash/id 不变，仅显示名变） */
    { label: '地块分区',     hash: 'pipePlanSection',          pre: 1, feat: 'zone-split' },
    { label: '管路规划',     hash: 'tlPipePlanSection',        pre: 1, feat: 'pipe-layout' },
    /* [v311 2026-10-08 用户要求] 水力校核 顶级导航项（独立模块：自动读 runye_network_layout，
       树状拓扑+全链路水损+滴灌带多孔出流+水泵选型+EPANET WASM 对照），原软件逻辑零改动 */
    { label: '水力校核',     href: 'runye-hydraulics.html',     feat: 'hydraulic-check', title: '水力校核：自动读已布置管网，逐段流量/流速/水损 + 最不利路径 + 需求扬程与水泵选型' },
    /* [v387 2026-10-12 用户指令] 「更多」内容全部展开到顶栏（四功能剥离后「更多」只剩 6 项，
       没必要再折叠）。「更多 ▾」机制保留：面板仍承接 pipe-optim 插件的「管网优化」入口
       与将来恢复的功能项。 */
    /* [v358] feat 说明：'pro-others' = 高级会员通配键（L1 四大功能之外的全部）；
       feat:'' = 完全免费、不参与门控。滴灌带查询器是公开查询小工具，保持免费。 */
    /* [NEW MODULE: 地形模块] 卸载=删除本行+terrain/+sw.js 条目 */
    { label: '地形模块',     href: 'terrain/index.html',       feat: 'pro-others', title: '地形模块：shp/RTK边界导入、CGCS2000校验、面积、高程数据源登记' },
    /* [v391 2026-10-12 用户指令] 多地块规划 恢复上线（v386 剥离时业务全保留，此处按原条目加回，
       位置：地形模块 之后） */
    { label: '多地块规划',   hash: 'grPipeSection',            feat: 'pro-others', title: '成组地块：全组总览 + 总管编辑 + 按块进入管路规划' },
    /* [v385 2026-10-12 用户指令] 四项功能剥离下线（入口摘除，业务代码/页面全部保留，将来需要时
       把对应行加回 MORE_ITEMS 或 ITEMS 即可恢复）：多地块规划(已于 v391 恢复)、管路拼装(独立页+
       pipe-assemble 壳插件同步摘除)、经济指标分析(#threeDModelingSection)、数字化建模
       (#parametricModelingSection)。恢复格式照抄下面被注释的原条目。 */
    /* { label: '管路拼装',     href: '管路接驳拼装.html',         feat: 'pro-others', title: '管路接驳拼装：管件级拼装 + 单向水力计算' }, */
    /* { label: '经济指标分析', hash: 'threeDModelingSection',     feat: 'pro-others', title: '管径经济指标分析：前期管材投入 vs 后期电费，找年均总成本最低的平衡点' }, */
    /* { label: '数字化建模',   hash: 'parametricModelingSection', feat: 'pro-others', title: '数字化建模 · 参数化节点建模' }, */
    { label: '材料清单',     hash: 'detailsSection',           feat: 'bom-export' }
  ];
  /* [v401 2026-10-12 用户指令] 「更多 ▾」折叠面板：过滤系统/轴测图/系统图/滴灌带查询 折叠于此；
     协议自检（hello-world）/ 参数标定（calib）由插件 nav 声明 container='.fn-more-panel' 同入面板；
     pipe_optim_ui.js 的「管网优化详细分析」注入项仍落这里。
     feat 说明：'pro-others' = 高级会员通配键；feat:'' = 完全免费（滴灌带查询是公开查询小工具）。 */
  var MORE_ITEMS = [
    { label: '过滤系统',     hash: 'filterSystemSection',      feat: 'pro-others', title: '过滤系统 · GREEN 型单体并联机组（初稿）' },
    { label: '轴测图',       act: 'iso', page: 'index.html',   feat: 'drawing-export', title: '三级管线轴测图（先「生成管线图」再点）' },
    { label: '系统图',       act: 'sys', page: 'index.html',   feat: 'drawing-export', title: '三级系统图（供水首部系统图）' },
    { label: '滴灌带查询',   href: '耐特菲姆滴灌带长度查询器.html', feat: '' }
  ];
  function curFile() {
    var p = decodeURIComponent((global.location && global.location.pathname) || '');
    return p.split('/').pop() || 'index.html';
  }
  /* [v346→v401] 线上锁已退役：v401 起「更多」面板承接的全部是已上线功能（feat 会员门控兜底），
     v346 的线上整体拦截（面板委托 + hash 直达）两处已移除。IS_ONLINE 暂留诊断备用
     （?env=online 测试钩子语义不变），当前无消费者。 */
  var IS_ONLINE = (function () {
    if (!global.location) return false;
    /* [v346] 测试钩子：?env=online 强制按线上锁运行（只能强锁不能强解锁，供本地预览/探针） */
    if (/[?&]env=online(?:&|$)/.test(global.location.search || '')) return true;
    if (global.location.protocol === 'file:') return false;
    var h = global.location.hostname || '';
    return !!h && h !== 'localhost' && h !== '127.0.0.1';
  })();
  /* [v346] 锁定提示 toast（样式在 runye-nav.css 的 .ry-nav-toast 段） */
  function showToast(msg) {
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
  }
  /* [v358 2026-10-10] 会员门控判定（唯一入口）。
     三态 fail-open —— 只有「已确认无权限」才锁：
       a) 权益层未加载（离线 / 脚本缺失 / 老页面没引 runye-entitle.js）
          → 放行：完全保持旧行为，接入本模块的页面零回归；
       b) 已加载但还没拿到服务端真相（RyEntitle.ready()===false）
          → 放行：网络抖动 / 云函数还没部署 / SDK 加载慢，都不该把老用户当场锁死；
       c) 已拿到真相 → 严格按 RyEntitle.can(feature) 判定。
     b → c 的切换由 RyEntitle.onChange → RyFnNav.render() 重新渲染（见文件末尾订阅）。 */
  function gate(feature) {
    if (!feature) return true;                      /* 未标注 feat = 免费功能，不参与门控 */
    var E = global.RyEntitle;
    if (!E || typeof E.can !== 'function') return true;
    if (E.mockPlan) return E.can(feature);          /* 本地联调钩子 ?rymock= */
    if (typeof E.ready === 'function' && !E.ready()) return true;
    return E.can(feature);
  }
  /* [v358] 无权限点击 → 升级引导（面板由 runye-member-ui.js 提供；未加载则退化为 toast） */
  function showUpgrade(label) {
    var U = global.RyMemberUI;
    if (U && typeof U.showUpgrade === 'function') { U.showUpgrade(label); return; }
    showToast('「' + label + '」为高级会员功能 · 邀请好友即可开通');
  }
  /* 单个导航项 → 元素（顶层与「更多」面板共用同一套皮肤/属性逻辑） */
  function makeItem(it, base, root) {
    /* [v286g] root=子目录页声明的根前缀（如 terrain/ 页的 ../）：
       有 root 的页面绝不是 act 宿主页（主页在站点根）⇒ act 项恒为跨页 <a>。 */
    var localAction = it.act && curFile() === it.page && !root;
    /* [v402] 「文件」项：button 触发 mod/inline-32.js 的 RyFileMenu.toggle（面板动态创建，
       本页未加载 inline-32（子页）时点击无害——只切 aria 态）；文字恒为「文件 ▾」。 */
    if (it.fileMenu) {
      var fb = document.createElement('button');
      fb.type = 'button';
      fb.className = 'fn-link';
      fb.setAttribute('data-ry-navitem', '1');
      fb.setAttribute('data-ry-filemenu', '1');
      fb.setAttribute('aria-haspopup', 'true');
      fb.setAttribute('aria-expanded', 'false');
      fb.title = it.title || '';
      fb.textContent = '文件 ▾';
      fb.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (global.RyFileMenu && typeof global.RyFileMenu.toggle === 'function') {
          global.RyFileMenu.toggle(fb);
        }
      });
      return fb;
    }
    var a = document.createElement(localAction ? 'button' : 'a');
    if (localAction) a.type = 'button';
    a.className = 'fn-link';
    a.setAttribute('data-ry-navitem', '1');
    if (it.href === 'runye-map-measure.html' || it.hash === 'pipePlanSection' || it.hash === 'tlPipePlanSection') a.setAttribute('data-ry-mobile-nav', '1');
    /* [v392] 页面级外挂：桌面端由 RyFrameShell 接管；href/feat 留作移动端和脚本故障兜底。 */
    var framePage = it.href === 'runye-map-measure.html' ? 'online-map' : it.href === 'terrain/index.html' ? 'terrain' : it.href === 'runye-hydraulics.html' ? 'hydraulics' : '';
    if (framePage) { a.setAttribute('data-fr-page', framePage); a.setAttribute('data-fr-feature', it.feat || ''); }
    /* [v358] 锁定态：「·锁」标记 + 捕获阶段拦截（阻断 href 跳转 / data-target 处理器 /
       act 动作 / win 独立窗口 四条路径，与 v346 的线上锁同一手法） */
    var locked = !gate(it.feat);
    a.textContent = locked ? (it.label + ' ·锁') : it.label;
    if (locked) {
      a.classList.add('fn-locked');
      a.setAttribute('data-ry-locked', '1');
      a.setAttribute('aria-disabled', 'true');
      a.title = '「' + it.label + '」为高级会员功能 · 点击查看开通方式';
      a.addEventListener('click', function (e) {
        e.preventDefault();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        showUpgrade(it.label);
      }, true);
    } else if (it.title) {
      a.title = it.title;
    }
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
        /* [v376 2026-10-11 修复] 锚点必须带 '#'：
           base 在子页里声明成 "index.html#"（自带井号），但**主页自己的导航没有 data-base**
           ⇒ base='' 时这里曾拼出 href="detailsSection"（相对路径），点它直接跳到
           file/https://.../detailsSection → 404，而不是跳锚点。
           更隐蔽的是它**时好时坏**：mod/inline-18.js 事后会把这批 href 改写成 '#'+id，
           但 RyEntitle.onChange → RyFnNav.render() 会**重建**全部导航项（权益就绪时），
           重建后改写就丢了 ⇒ 权益拉取得早/晚决定用户点下去是跳锚点还是 404。
           ⇒ 修在源头：base 为空时补 '#'，任何一次渲染都自带正确 href，不再依赖事后改写。 */
        a.href = root + (base || '#') + it.hash;
        if (!base) a.setAttribute('data-target', it.hash);
      }
    } else {
      // [v235] 移动端直接进新的手机地图预览页；桌面端仍走旧地图页
      var navHref = it.href;
      if (navHref === 'runye-map-measure.html' && global.RyMobile && global.RyMobile.isActive()) {
        navHref = 'runye-mobile-map-preview.html?v=242';
      }
      a.href = root + navHref;
      /* [v331] 独立窗口项：preventDefault 后弹窗，主窗口原地不动；先存档快照+写锚（v327 恢复机制复用） */
      if (it.win) {
        a.addEventListener('click', function (e) {
          e.preventDefault();
          try { if (typeof global.runyeSaveProject === 'function') global.runyeSaveProject(true); } catch (err) { }
          try { localStorage.setItem('runye_aiplot_anchor_v1', JSON.stringify({ at: Date.now(), src: 'smart-popup' })); } catch (err) { }
          var w = global.open(a.href, 'runye_smart', 'width=1180,height=860');
          if (!w) global.location.href = a.href; /* 弹窗被拦截 → 回退本页跳转（旧行为） */
        });
      }
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
    btn.title = '更多工具：过滤系统 / 轴测图 / 系统图 / 滴灌带查询 / 管网优化详细分析';
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
    /* [v401] v346 线上锁已解除：面板内全部是已上线功能（feat 会员门控由 makeItem 的 gate 兜底），
       委托拦截会把正式功能对线上用户锁死（toast「即将开放」），与现状矛盾。 */
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
    /* [v389] 跨渲染保留「更多」面板里的外部注入按钮（如 pipe_optim_ui.js 的「管网优化详细分析」，
       标记：不带 data-ry-navitem）。背景：面板整体建在 wrap[data-ry-navitem] 里，本渲染器
       重建导航时会连面板一起清掉 —— 过去插件接管跑在权益渲染之前（按钮先被插件摘走），
       时序上掩盖了这个问题；v388 起 loader 先等服务端插件开关（controlPromise 网络 trip）
       再激活插件，接管被推迟到权益重渲染之后，按钮被清空 → 插件容器判定 null →
       「管网优化」错落顶栏、面板恒空（compact 闸门 M2/M3/M4 红）。修法：重建前把面板里
       非本渲染器生成的子节点摘下保存，新面板建好后原样回插 —— 与权益渲染、插件接管
       谁先谁后无关，面板永远承接住注入项。 */
    var preserved = [];
    try {
      /* 只保留「外部注入」的按钮：插件项（data-ry-plugin-nav）与会员徽标（data-ry-mbr）
         虽也不带 data-ry-navitem，但它们由 core ui-shell 的 MutationObserver 自行重挂，
         这里再回插会双份 —— 必须排除。 */
      Array.prototype.slice.call(el.querySelectorAll('.fn-more-panel')).forEach(function (p) {
        Array.prototype.slice.call(p.children).forEach(function (c) {
          if (!c.hasAttribute) return;
          if (c.hasAttribute('data-ry-navitem') || c.hasAttribute('data-ry-plugin-nav') || c.hasAttribute('data-ry-mbr')) return;
          preserved.push(c);
        });
      });
    } catch (e0) { }
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
    /* [v389] 外部注入按钮回插到新面板（见 mount 开头的 preserved 采集）。
       只回插仍"孤儿"的节点：若插件接管已把老按钮摘走（legacy 保存、不在 DOM），
       preserved 里根本不会有它；若它还在 DOM，说明接管未发生，回插让它继续承接。 */
    try {
      var newPanel = more.querySelector('.fn-more-panel');
      if (newPanel) {
        preserved.forEach(function (c) {
          if (c && c.parentNode !== newPanel) newPanel.appendChild(c);
        });
      }
    } catch (e4) { }
    /* [v377] 第三方导航项（插件 data-ry-plugin-nav / 会员徽标等）在 mount 期间被
       逐个 appendChild 的老项挤到了后面（老项全插到它们之后）。这里把它们按
       原相对顺序移回「更多 ▾」之前 —— 插件迁移项的「原位置」才保得住
       （实测：水力校核插件项被挤到 ⚙️设置 后面、跑到智能规划之前）。 */
    try {
      var third = el.querySelectorAll('[data-ry-plugin-nav],[data-ry-mbr]');
      for (var t = 0; t < third.length; t++) {
        if (third[t].parentNode === el) el.insertBefore(third[t], more);
      }
    } catch (e3) { }
  }
  /* [v358] 权益就绪 / 等级变化 → 重新渲染导航（锁定态随之收紧或放宽）。
     时序说明：runye-nav.js 在解析到即渲染，此时权益大概率还没拉回来（ready()=false，全放行）；
     等 RyEntitle.init() 返回后 emit，这里重渲染一次才真正上锁。 */
  (function () {
    var E = global.RyEntitle;
    if (E && typeof E.onChange === 'function') {
      E.onChange(function () { try { global.RyFnNav.render(); } catch (e) { } });
    }
    /* 权益层晚于导航加载（脚本顺序颠倒）时的兜底 */
    document.addEventListener('ryentitle-ready', function () {
      try {
        if (global.RyEntitle && typeof global.RyEntitle.onChange === 'function') {
          global.RyEntitle.onChange(function () { try { global.RyFnNav.render(); } catch (e) { } });
        }
        global.RyFnNav.render();
      } catch (e) { }
    });
  })();
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
    /* [v401] v346 折叠项 hash 直达拦截已解除（同面板拦截：功能已上线，feat 门控兜底） */
    /* [v358] 会员门控：#hash 直达走与点击完全相同的 gate，避免「点按钮被拦、直接输网址却能进」 */
    if (!gate(item.feat)) { showUpgrade(item.label); return; }
    if (item.act && global.RyFnNavActions && typeof global.RyFnNavActions[item.act] === 'function') {
      global.RyFnNavActions[item.act]();
    } else if (item.hash && typeof global.ryJumpToSection === 'function') {
      global.ryJumpToSection(item.hash);
    }
  }
  global.addEventListener('load', openLinkedSection);
  global.addEventListener('hashchange', openLinkedSection);
})(typeof window !== 'undefined' ? window : globalThis);
