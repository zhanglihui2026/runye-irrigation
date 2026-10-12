/* ============================================================
   mod/inline-32.js — 「文件 ▾」统一菜单（v395-file-menu 2026-10-12）
   ------------------------------------------------------------
   把散在各处的导入/导出/工程操作收进导航右侧一个折叠菜单。
   分组：导入 / 导出 / 工程。动作分发两类：
     ① 主程序内动作：直接调全局函数（runyeDxf / RyIsoDiagram / runyeSaveProject 等）；
     ② 独立页动作：先 RyFrameShell.show(page) 切到对应 iframe（懒加载），
        等 iframe load 完成后调用 contentWindow 里暴露的按钮/函数触发。
   皮肤使用独立 .fn-file 面板（不复用 .fn-more-panel），
   定位逻辑与 buildMore 同款（position:fixed 防 .fn-inner overflow 裁切）。
   卸载：删 index.html 的 #fnFileMenu 块 + 本文件 + sw.js CORE 条目即可。
   ============================================================ */
(function (W, D) {
  'use strict';
  /* [v402] 触发按钮改由 runye-nav.js 渲染（ITEMS 内 fileMenu:1 顶层项，位于「地块绘制」
     之前），点击经 W.RyFileMenu.toggle(btn) 进来；面板本体在此动态创建（body 直挂，
     position:fixed 定位），不再依赖 index.html 静态 #fnFileMenu 块。 */
  var curBtn = null;   /* 当前打开态关联的触发按钮 */
  var panel = null;    /* 懒创建的菜单面板 */

  /* ---------------- 菜单定义 ----------------
     type: 'fn' 主程序动作 / 'page' 独立页动作
     action: 主程序内要调用的函数名（window 上）；page 动作的触发函数名
     page:   iframe 页 id（online-map / terrain），须在 RyFrameShell._byId 中 */
  var GROUPS = [
    { title: '导入', items: [
      { label: '地块文件 (GeoJSON/KML/KMZ/奥维)', type: 'page', page: 'online-map', action: 'ryFileClickImport', title: '在线地图页打开「导入地块」文件选择器' },
      { label: '工程文件 (.runye.json)', type: 'page', page: 'online-map', action: 'ryFileClickImportProj', title: '在线地图页打开「导入工程」文件选择器' },
      { label: 'IRRICAD 数据', type: 'fn', action: 'ryFileOpenIrricad', title: '主程序「经济指标/对比」页 IRRICAD 粘贴与文件导入' },
      { label: '地形 shp 边界', type: 'page', page: 'terrain', action: 'ryFileClickSHP', title: '地形模块「导入 shp 边界」文件选择器' },
      { label: '地形 RTK 边界 CSV', type: 'page', page: 'terrain', action: 'ryFileClickBoundaryCSV', title: '地形模块「导入 RTK 边界 CSV」文件选择器' },
      { label: '地形 RTK 高程 CSV', type: 'page', page: 'terrain', action: 'ryFileClickElevCSV', title: '地形模块「上传 RTK 高程 CSV」文件选择器' },
      { label: '坐标系 .prj 校验', type: 'page', page: 'terrain', action: 'ryFileClickPRJ', title: '地形模块「上传 .prj 校验坐标系」文件选择器' }
    ]},
    { title: '导出', items: [
      { label: 'CAD 图纸 (DXF)', type: 'fn', action: 'ryFileExportDxf', title: '导出当前管线图为 2004 DXF（CAD 直接打开）' },
      { label: '轴测图 SVG', type: 'fn', action: 'ryFileExportIsoSvg', title: '下载三级管线轴测图 SVG' },
      { label: '系统图 SVG / PNG / 打印', type: 'fn', action: 'ryFileExportHead', title: '滴灌供水首部系统图：导出 SVG / PNG / 打印' },
      { label: '地块 GeoJSON', type: 'page', page: 'online-map', action: 'ryFileExportGeoJSON', title: '在线地图页导出全部地块为 GeoJSON' },
      { label: '地块 KML', type: 'page', page: 'online-map', action: 'ryFileExportKML', title: '在线地图页导出全部地块为 KML' },
      { label: 'BOM 清单 CSV', type: 'fn', action: 'ryFileExportBom', title: '打开材料清单面板并定位 CSV 导出按钮' },
      { label: '等高线高程 CSV', type: 'fn', action: 'ryFileExportContourCSV', title: '打开等高线解析面板；解析 DXF 后导出高程点 CSV' }
    ]},
    { title: '工程', items: [
      { label: '保存项目', type: 'fn', action: 'ryFileSaveProject', title: '把当前方案完整快照保存到本机' },
      { label: '载入项目', type: 'fn', action: 'ryFileLoadProject', title: '从本机恢复已保存的方案快照' },
      { label: '导出工程文件 (.runye.json)', type: 'page', page: 'online-map', action: 'ryFileClickExportProj', title: '在线地图页把地块库+管网+视图打包为工程文件' }
    ]}
  ];

  /* ---------------- 工具 ---------------- */
  function toast(msg) {
    try {
      var d = D.createElement('div');
      d.className = 'ry-nav-toast'; d.setAttribute('role', 'status');
      d.textContent = msg;
      D.body.appendChild(d);
      setTimeout(function () { d.classList.add('show'); }, 10);
      setTimeout(function () {
        d.classList.remove('show');
        setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 300);
      }, 2400);
    } catch (e) { }
  }
  function clickInFrame(win, id) {
    if (!win) return false;
    try {
      var el = win.document.getElementById(id);
      if (!el) return false;
      el.click();
      return true;
    } catch (e) { return false; }
  }
  function focusPluginControl(navSelector, panelSelector, buttonSelector, label, readyMessage) {
    var nav = D.querySelector(navSelector);
    if (!nav) { toast(label + '插件未激活'); return; }
    nav.click(); /* 复用插件导航的会员门控与升级提示 */
    setTimeout(function () {
      if (nav.getAttribute('data-ry-locked') === '1' || nav.getAttribute('aria-disabled') === 'true') return;
      var p = D.querySelector(panelSelector);
      if (!p || p.style.display === 'none') { toast(label + '面板未能打开，请检查插件状态'); return; }
      var control = p.querySelector(buttonSelector);
      if (!control) { toast(label + '操作入口未就绪'); return; }
      control.focus();
      toast(readyMessage);
    }, 80);
  }
  /* 跨 iframe 触发：show 懒加载后等 load 完成再执行（首次进入才需要等） */
  function runInFrame(page, fn, label) {
    var shell = W.RyFrameShell;
    if (!shell || typeof shell.show !== 'function') { toast('独立页容器不可用'); return; }
    var ok = shell.show(page);
    if (!ok) {
      if (typeof shell.isLocked !== 'function' || !shell.isLocked(page)) {
        toast('当前设备或页面容器无法打开「' + label + '」，请使用原页面入口操作');
      }
      return;
    }
    var fr = shell._byId ? shell._byId(page) : null;
    if (!fr) { toast('未找到页面容器'); return; }
    function exec() {
      var cw = fr.contentWindow;
      if (!fn(cw)) toast('「' + label + '」触发失败（页面可能未就绪，请在对应页面手动操作）');
    }
    if (fr.getAttribute('data-loaded') === '1') {
      /* 已加载过：等 300ms 让页面空闲再触发（跨 iframe 同步时序保险） */
      setTimeout(exec, 300);
    } else {
      fr.addEventListener('load', function onLoad() {
        fr.removeEventListener('load', onLoad);
        setTimeout(exec, 200);
      });
    }
  }

  /* ---------------- 动作实现 ---------------- */
  var ACTIONS = {
    /* —— 主程序内 —— */
    ryFileExportDxf: function () {
      if (W.runyeDxf && typeof W.runyeDxf.export === 'function') { W.runyeDxf.export(); return; }
      toast('DXF 导出模块未加载');
    },
    ryFileExportIsoSvg: function () {
      if (W.RyIsoDiagram && typeof W.RyIsoDiagram.downloadSVG === 'function') { W.RyIsoDiagram.downloadSVG(); return; }
      toast('轴测图未生成或模块未加载（请先生成管线图）');
    },
    ryFileExportHead: function () {
      var dlg = D.getElementById('headModal');
      if (!dlg) { toast('系统图编辑器未加载'); return; }
      dlg.style.display = 'block';
      setTimeout(function () {
        var svg = D.getElementById('hmExportSVG');
        if (svg) svg.click();
      }, 100);
    },
    ryFileExportBom: function () {
      focusPluginControl('[data-ry-plugin-nav="material-list"]', '[data-ry-plugin="bom"]', '.bom-btn:not(.primary)', 'BOM', 'BOM 面板已打开，请点击「导出 CSV」');
    },
    ryFileExportContourCSV: function () {
      var nav = D.querySelector('[data-ry-plugin-nav="contour-dxf"]');
      if (!nav) { toast('等高线解析插件未激活'); return; }
      nav.click(); /* 插件导航负责 pro-others 门控；不调用插件内部 API */
      setTimeout(function () {
        if (nav.getAttribute('data-ry-locked') === '1' || nav.getAttribute('aria-disabled') === 'true') return;
        var panelEl = D.querySelector('[data-ry-plugin="contour-dxf"]');
        var csv = panelEl && panelEl.querySelector('.cdxf-btn:not(.primary)');
        if (!panelEl || panelEl.style.display === 'none' || !csv) { toast('等高线解析面板未能打开，请检查插件状态'); return; }
        (csv.disabled ? panelEl.querySelector('.cdxf-btn.primary') : csv).focus();
        toast(csv.disabled ? '等高线面板已打开；选择 DXF 并解析后即可导出高程点 CSV' : '等高线面板已打开，请点击「导出高程点 CSV」');
      }, 80);
    },
    ryFileOpenIrricad: function () {
      var box = D.getElementById('icImportBox');
      if (!box) { toast('IRRICAD 导入区未加载'); return; }
      if (typeof W.ryJumpToSection === 'function') W.ryJumpToSection('irrCompareSection');
      setTimeout(function () { box.focus(); }, 150);
    },
    ryFileSaveProject: function () {
      if (typeof W.runyeSaveProject === 'function') { W.runyeSaveProject(); return; }
      toast('保存功能未加载');
    },
    ryFileLoadProject: function () {
      if (typeof W.runyeLoadProject === 'function') { W.runyeLoadProject(); return; }
      toast('载入功能未加载');
    },

    /* —— 独立页（iframe） —— */
    ryFileClickImport: function (cw) { return clickInFrame(cw, 'btnImport'); },
    ryFileClickImportProj: function (cw) { return clickInFrame(cw, 'btnImportProj'); },
    ryFileClickExportProj: function (cw) { return clickInFrame(cw, 'btnExportProj'); },
    ryFileExportGeoJSON: function (cw) { return clickInFrame(cw, 'btnGeoJSON'); },
    ryFileExportKML: function (cw) { return clickInFrame(cw, 'btnKML'); },
    ryFileClickSHP: function (cw) { return clickInFrame(cw, 'fileSHP'); },
    ryFileClickBoundaryCSV: function (cw) { return clickInFrame(cw, 'fileBoundaryCSV'); },
    ryFileClickElevCSV: function (cw) { return clickInFrame(cw, 'fileElevCSV'); },
    ryFileClickPRJ: function (cw) { return clickInFrame(cw, 'filePRJ'); }
  };

  /* ---------------- 面板构建 ---------------- */
  function ensurePanel() {
    if (panel) return panel;
    panel = D.createElement('div');
    panel.className = 'fn-file-panel';
    panel.setAttribute('role', 'menu');
    panel.hidden = true;
    D.body.appendChild(panel);
    return panel;
  }
  function build() {
    panel.innerHTML = '';
    GROUPS.forEach(function (g) {
      var title = D.createElement('div');
      title.className = 'fn-file-group';
      title.textContent = g.title;
      panel.appendChild(title);
      g.items.forEach(function (it) {
        var a = D.createElement('button');
        a.type = 'button';
        a.className = 'fn-file-item';
        a.textContent = it.label;
        if (it.title) a.title = it.title;
        a.setAttribute('data-ry-filemenu', '1');
        a.addEventListener('click', function (e) {
          e.stopPropagation();
          close();
          var act = ACTIONS[it.action];
          if (!act) { toast('该动作未实现'); return; }
          if (it.type === 'page') runInFrame(it.page, act, it.label);
          else act();
        });
        panel.appendChild(a);
      });
    });
  }

  /* ---------------- 开合与定位（buildMore 同款） ---------------- */
  function place() {
    if (!curBtn) return;
    var r = curBtn.getBoundingClientRect();
    panel.style.top = Math.round(r.bottom + 2) + 'px';
    panel.style.right = Math.max(6, Math.round(W.innerWidth - r.right)) + 'px';
    panel.style.left = 'auto';
  }
  function isOpen() { return !!panel && !panel.hidden; }
  function open(btn) {
    curBtn = btn || curBtn;
    ensurePanel();
    build();
    panel.hidden = false;
    if (curBtn) curBtn.setAttribute('aria-expanded', 'true');
    place();
  }
  function close() {
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    if (curBtn) curBtn.setAttribute('aria-expanded', 'false');
  }
  D.addEventListener('pointerdown', function (e) {
    if (!isOpen()) return;
    var t = e.target && e.target.closest ? e.target : null;
    if (curBtn && (t === curBtn || (t && curBtn.contains && curBtn.contains(t)))) return;
    if (t && panel.contains(t)) return;
    close();
  });
  D.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  W.addEventListener('resize', function () { if (isOpen()) place(); });
  W.addEventListener('scroll', function () { if (isOpen()) close(); }, true);

  /* 供导航项点击调用：toggle(btn) —— btn 为 runye-nav 渲染的「文件」按钮（makeItem fileMenu 分支） */
  W.RyFileMenu = {
    toggle: function (btn) {
      if (isOpen() && btn === curBtn) close();
      else { close(); open(btn); }
    },
    open: function (btn) { close(); open(btn); },
    close: close,
    isOpen: isOpen
  };
})(window, document);
