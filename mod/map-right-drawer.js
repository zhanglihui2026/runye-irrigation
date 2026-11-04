/* mod/map-right-drawer.js —— 在线地图右缘抽屉（v961，用户 2026-11-04）
 *
 * 用户原话：「在线地图的图层悬浮面板及总管参数设置面板都靠右侧收起来，做法参照
 *   分区与管路页面中的多地块编辑 与图层控制面板。」
 *
 * 参照物口径（`mod/inline-18.js` + `mod/style-01.css` 的 #ppPlotDrawerTab / #tlWsLayerDrawerTab）：
 *   · 平时**收起**（面板 hidden），右缘只留一枚竖排标签（writing-mode:vertical-rl、12px、
 *     白底细边、min-height 96px），点击展开、再点收起，展开态标签变深绿底白字；
 *   · 面板展开后贴右缘标签左侧（right:36px），不压住标签 —— 否则收不回去；
 *   · 同一时刻只开一个：两个面板都从右缘弹出，同时开会互相盖住。
 *
 * 与参照页的差别（刻意的）：
 *   · 参照页两张卡**不许拖**（inline-18 把拖拽属性整组摘掉）。地图这两张卡原本就能拖/能调宽，
 *     这里**保留**拖拽能力：抽屉只负责「打开时把它摆回右缘」（每次 open 重新锚一次），
 *     用户拖走是自由，下次重新打开又回到右缘。不改成 !important 钉死，是因为钉死后
 *     ry-panel 的拖拽会「按了没反应」，比能拖更让人困惑。
 *   · 面板本体（`.rym-layer-panel` 在 #map 里、`#trunkPropPanel` 在 .map-wrap 里）**坐标系不同**：
 *     #map 从 .map-wrap 顶部 40px 处开始（工具条占位）。所以同一视觉高度要写两个 top：
 *     图层卡 top:12px（相对 #map）＝ 总管面板 top:52px（相对 .map-wrap）＝ 视口同一行。
 *
 * 启动时序：两个面板都是**别处懒创建**的（图层面板在 runye-map-enhance 建图时追加到 #map；
 *   总管面板在 online-map 的 ensureTrunkPanel 里挂到 .map-wrap），本模块用 MutationObserver
 *   等它们出现 —— 谁先到就先接管谁，不假设顺序（慢 CDN 下顺序会变）。
 *
 * 总管面板的特殊态：它「选中总管才弹、点 × 就不再自动弹」（online-map.syncTrunkPanel）。
 *   ⇒ 没选中总管时点标签**不能硬把空面板弹出来**（refresh 里 `if(!entry){hide();return;}` 会
 *     立刻又收起来，表现为闪一下）。宿主在 syncTrunkPanel 里写 `data-ry-has-trunk="1|0"`，
 *     本模块据此决定「展开」还是「提示先点选总管」。
 */
(function () {
  'use strict';

  var VERSION = '1.0.0';
  var RAIL_TOP = 52;      /* 相对 .map-wrap：工具条 40px + 12px 留白 */
  var PANEL_TOP_IN_MAP = 12;   /* 图层卡在 #map 内的等效高度（#map 顶 = .map-wrap 顶 + 40） */
  var PANEL_TOP = 52;          /* 总管面板在 .map-wrap 内的 top */
  var PANEL_RIGHT = 36;        /* 标签约 28px 宽 + 8px 间距，留出可点区域 */
  var HINT_MS = 1800;

  /* inMap：面板是否挂在高 40px 工具条的 #map 里（决定 top 用哪一档） */
  var DEFS = [
    { key: 'layer', label: '图层', sel: '.rym-layer-panel', inMap: true },
    { key: 'trunk', label: '总管参数', sel: '#trunkPropPanel', inMap: false }
  ];

  function byKey(key) {
    for (var i = 0; i < DEFS.length; i++) if (DEFS[i].key === key) return DEFS[i];
    return null;
  }
  function findPanel(def) {
    try { return document.querySelector(def.sel); } catch (e) { return null; }
  }

  /* ---- 右缘标签条 ---- */
  function ensureRail(wrap) {
    var rail = wrap.querySelector('.ry-map-rail');
    if (rail) return rail;
    rail = document.createElement('div');
    rail.className = 'ry-map-rail';
    rail.setAttribute('role', 'group');
    rail.setAttribute('aria-label', '地图右侧面板（点击展开 / 收起）');
    rail.style.top = RAIL_TOP + 'px';
    DEFS.forEach(function (def) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ry-map-rail-tab';
      b.setAttribute('data-ry-rail', def.key);
      b.setAttribute('aria-controls', def.sel === '#trunkPropPanel' ? 'trunkPropPanel' : '');
      b.setAttribute('aria-expanded', 'false');
      b.textContent = def.label;
      b.title = def.label + '：点击展开 / 收起';
      b.addEventListener('click', function () { toggle(def); });
      rail.appendChild(b);
    });
    wrap.appendChild(rail);
    return rail;
  }

  function railTab(key) {
    return document.querySelector('#onlineMapSection .ry-map-rail-tab[data-ry-rail="' + key + '"]');
  }

  /* ---- 位置锚定：每次展开都摆回右缘 ---- */
  function anchor(panel, def) {
    if (!panel || !panel.style) return;
    /* left/bottom 必须清掉：ry-panel 拖拽写的是 left/top，只改 right/top 会变成
       「left 和 right 同时生效被拉伸」或「bottom 和 top 同时生效被撑高」。 */
    panel.style.left = 'auto';
    panel.style.bottom = 'auto';
    panel.style.right = PANEL_RIGHT + 'px';
    panel.style.top = (def.inMap ? PANEL_TOP_IN_MAP : PANEL_TOP) + 'px';
    if (def.key === 'trunk') {
      /* 吸底改吸顶后，原来那条 max-height:calc(100% - 140px) 是按 bottom:30 量的，
         吸顶后要留出底部状态条（地图底部提示栈 ~40px），否则面板会压到提示条上。 */
      panel.style.maxHeight = 'calc(100% - 70px)';
    }
  }

  function closeOther(key) {
    DEFS.forEach(function (d) {
      if (d.key === key) return;
      var p = findPanel(d);
      if (p && !p.hidden) {
        p.hidden = true;
        /* ★ 必须**同步**刷一次标签态：只写 hidden 的话，标签高亮要等 MutationObserver
           的下一个微任务才熄灭 —— 探针在同一 tick 里读 classList 会读到「两个标签都亮」
           （v961 实测：外观上是一帧的错位，逻辑上是「谁是当前面板」有两个答案）。 */
        sync(d);
      }
    });
  }

  function flash(tab, msg) {
    if (!tab) return;
    var old = tab.title;
    tab.title = msg;
    tab.classList.add('is-hint');
    setTimeout(function () {
      tab.classList.remove('is-hint');
      tab.title = old;
    }, HINT_MS);
  }

  /* ---- 状态同步：以面板的 hidden 为唯一真相 ----
     ★ 不做「标签驱动面板」的单向同步：面板也会被别处打开/关闭（选中总管自动弹、点 × 关），
       只有盯着 hidden 才不会出现「标签亮着但面板关着」。 */
  function sync(def) {
    var panel = findPanel(def), tab = railTab(def.key);
    if (!tab) return;
    if (!panel) { tab.classList.remove('open'); tab.setAttribute('aria-expanded', 'false'); return; }
    var open = !panel.hidden;
    tab.classList.toggle('open', open);
    tab.setAttribute('aria-expanded', String(open));
    if (open) {
      anchor(panel, def);
      closeOther(def.key);
    }
  }

  function toggle(def) {
    var panel = findPanel(def);
    if (!panel) { flash(railTab(def.key), def.label + '：面板还没准备好，请稍后再点'); return; }
    if (!panel.hidden) { panel.hidden = true; sync(def); return; }   /* 收起 */
    if (def.key === 'trunk' && panel.getAttribute('data-ry-has-trunk') !== '1') {
      /* 没选中总管时硬弹空面板会「闪一下就没」（refresh 里 !entry 直接 hide） */
      flash(railTab(def.key), '先在地图上点选一条总管，再打开参数面板');
      return;
    }
    anchor(panel, def);        /* 先摆位再显示，避免在旧位置闪一帧 */
    closeOther(def.key);
    panel.hidden = false;
    sync(def);
  }

  /* ---- 接管一个面板 ---- */
  function attach(panel, def) {
    if (!panel || panel.getAttribute('data-ry-rail-bound') === '1') return;
    panel.setAttribute('data-ry-rail-bound', '1');
    panel.setAttribute('data-ry-rail', def.key);
    /* 默认收起（用户口径「平时是折叠起来的，在右侧」）。图层面板在别处是默认展开的，
       这里统一压成 hidden —— 它上面那些勾选状态存在 localStorage，收起不影响状态。 */
    panel.hidden = true;
    /* 面板自身的显隐只改 hidden 属性，不需要监听 style/class（面板内部刷新不会改 hidden） */
    if (window.MutationObserver) {
      var mo = new MutationObserver(function () { sync(def); });
      mo.observe(panel, { attributes: true, attributeFilter: ['hidden'] });
      panel.__ryRailMO = mo;
    }
    sync(def);
  }

  function boot() {
    var wrap = document.querySelector('#onlineMapSection .map-wrap');
    if (!wrap) return false;
    ensureRail(wrap);
    DEFS.forEach(function (def) {
      var p = findPanel(def);
      if (p) attach(p, def);
    });
    /* 两个面板都是懒创建的（慢 CDN 下顺序不定）⇒ 盯着 .map-wrap 子树，
       谁后到就补接管谁；已接管的会被 attach 的 guard 跳过。 */
    if (!wrap.__ryRailObserver && window.MutationObserver) {
      var mo = new MutationObserver(function () {
        DEFS.forEach(function (def) {
          var p = findPanel(def);
          if (p) attach(p, def);
        });
      });
      mo.observe(wrap, { childList: true, subtree: true });
      wrap.__ryRailObserver = mo;
    }
    return true;
  }

  var tries = 0;
  (function wait() {
    if (boot()) return;
    if (++tries > 120) return;         /* ~36s 后放弃（页面没地图区的引用页） */
    setTimeout(wait, 300);
  })();

  window.RyMapRightDrawer = {
    VERSION: VERSION,
    boot: boot,
    open: function (key) { var d = byKey(key); if (d) { var p = findPanel(d); if (p && p.hidden) toggle(d); } },
    close: function (key) { var d = byKey(key); if (d) { var p = findPanel(d); if (p && !p.hidden) { p.hidden = true; sync(d); } } },
    isOpen: function (key) { var d = byKey(key); if (!d) return false; var p = findPanel(d); return !!(p && !p.hidden); },
    state: function () {
      return DEFS.map(function (d) {
        var p = findPanel(d);
        return { key: d.key, exists: !!p, open: !!(p && !p.hidden) };
      });
    }
  };
})();
