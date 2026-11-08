/* ===========================================================================
   [v815] 绘图工具栏统一图标集（单色线性 SVG）
   ---------------------------------------------------------------------------
   用户指令：「图标还是不好看，整体颜色也乱，要统一，图标大小要统一，样式要
   一种风格，三通阀门 弯头节点 直线这些，用个更形象的图标。遮蔽也用更形象的
   图标。整体颜色也乱，一会儿是黄色 一会儿是绿色 一会儿是红色的。」

   病因（均为历史遗留，不是某一处写错）：
     ① 图标全部是 Unicode 字符 / emoji（⋈ ⊤ ∟ ⊕ ╱ ⊘ 🔒 💾 🔧 ☁ 📐 🤖），
        字形来自不同字体，粗细细、字面大小、基线各不相同 —— 同一 font-size
        下 ⋈（≈0.6em）与 🔒（满格）视觉差一倍；
     ② 彩色 emoji 自带颜色，再叠加 style-01.css「WPS 式按功能配色」一组
        per-button color（阀门橙 #e8a33d / 三通青 #0ea5a3 / 弯头粉 #d95780 /
        节点蓝 / 划线黄 / 锁定紫 / 生成蓝），于是黄绿红蓝紫全上；
     ③ 那组配色还越界命中了快捷条里的 #ppGenerate / #ppRotateZones，
        把「生成施工图/↺+90°」的文字染成蓝色（用户上一轮说「普通黑色就行」）。

   做法：一套 24×24 网格、1.7px 圆头描边、currentColor 着色的线性图标，
   全部同尺寸渲染（18×18 in 32×32 按钮），颜色统一由按钮 color 决定，
   组件脚本不再参与配色。要回退：删本文件 + index.html 的 script 引入 +
   inline-18.js 的 RyIcons.decorate 调用 + style-01.css v815 段。
   =========================================================================== */
(function(){
  if(window.RyIcons) return;

  /* 图标名 → SVG 内部标记。统一 24×24 网格、无填充、末笔不外扩，
     保证 18px 下视觉重量一致（这是「大小统一」的真正落点：同网格同描边，
     而不是靠 font-size 猜）。 */
  var P = {
    /* —— 管道 / 管件 —— */
    main:      '<path d="M3.5 12h10.5"/><path d="M3.5 8.6v6.8"/><path d="M11.6 8.4l3.9 3.6-3.9 3.6"/>',
    branch:    '<path d="M3 7h18"/><path d="M7 7v12M13 7v12M19 7v12"/>',
    valve:     '<path d="M6.5 7.6v8.8L12 12z"/><path d="M17.5 7.6v8.8L12 12z"/><path d="M3 12h3.5M17.5 12H21"/>',
    tee:       '<path d="M3 8h18"/><path d="M12 8v13"/><path d="M8.6 21h6.8"/>',
    elbow:     '<path d="M4 21V10a6 6 0 0 1 6-6h11"/><path d="M9 21v-9.5A2.5 2.5 0 0 1 11.5 9H21"/>',
    node:      '<path d="M12 3.4v4.2M12 16.4v4.2M3.4 12h4.2M16.4 12h4.2"/><circle cx="12" cy="12" r="3"/>',
    line:      '<path d="M7.2 16.8L16.8 7.2"/><circle cx="5.6" cy="18.4" r="1.5"/><circle cx="18.4" cy="5.6" r="1.5"/>',
    mask:      '<path d="M3 9.5h18M3 14.5h18"/><path d="M4.6 20.2L19.4 3.8"/>',
    diameter:  '<circle cx="12" cy="12" r="8"/><path d="M7 17L17 7"/><path d="M7 17l.6-3.7M7 17l3.7-.6M17 7l-.6 3.7M17 7l-3.7.6"/>',
    diameter2: '<circle cx="8.6" cy="12" r="5.6"/><circle cx="15.4" cy="12" r="5.6"/><path d="M8.6 12h6.8"/>',
    length:    '<path d="M6 12h12"/><path d="M3 8v8M21 8v8"/><path d="M9 9L6 12l3 3M15 9l3 3-3 3"/>',

    /* —— 分区 / 编辑 —— */
    ortho:     '<path d="M5.5 19.5V5.5h13"/><rect x="3" y="17" width="5" height="5"/>',
    water:     '<path d="M12 3.2c0 0 5.8 6.1 5.8 9.9a5.8 5.8 0 0 1-11.6 0C6.2 9.3 12 3.2 12 3.2z"/>',
    grid:      '<rect x="3.5" y="3.5" width="17" height="17"/><path d="M3.5 9.2h17M3.5 14.8h17M9.2 3.5v17M14.8 3.5v17"/>',
    gridreset: '<rect x="3" y="3" width="12.5" height="12.5"/><path d="M3 9.2h12.5M9.2 3v12.5"/><path d="M21 15.5a4.6 4.6 0 1 1-3.2 1.3"/><path d="M17 13.6l.6 3.4 3.4-.6"/>',
    /* [v1012] 锁定/解锁图标放大：原图形只占 24 网格下半（锁体 15×9.6、钩半径 4），
       是全工具栏 30+ 图标里的异类小个子 —— 18px 渲染下约 11×14 空心细线，
       用户实测「锁定面积这个按钮不明显」。按 Feather 比例放大到与 grid/undo 等
       一致（锁体 17×10.5、钩半径 4.5），视觉分量约 +24%；颜色体系不动
       （默认墨色 / 激活绿底不变，状态区分仍由 lock⇄unlock + .active 承担）。 */
    lock:      '<rect x="3.5" y="10.5" width="17" height="10.5" rx="1.8"/><path d="M7.5 10.5V7a4.5 4.5 0 0 1 9 0v3.5"/>',
    unlock:    '<rect x="3.5" y="10.5" width="17" height="10.5" rx="1.8"/><path d="M7.5 10.5V7a4.5 4.5 0 0 1 8.7-1.5"/>',
    undo:      '<path d="M4.5 9.5h9.6a4.9 4.9 0 0 1 0 9.8H8.2"/><path d="M8.1 5.4L4 9.5l4.1 4.1"/>',
    /* [v951] 在线地图绘制条图标钮用：编辑（铅笔）/ 画框（多边形+顶点）/ 完成（对勾）。
       画框图标刻意保留顶点小圈 —— 它表达的是「点顶点围一块地」，不是「画一条线」，
       与 line（划线，两端点）区分开。 */
    pencil:    '<path d="M4.6 19.4l1.1-4.2 9.5-9.5a2.05 2.05 0 0 1 2.9 2.9l-9.5 9.5z"/><path d="M13.4 6.6l4 4"/>',
    polygon:   '<path d="M12 4.6l7 5-2.7 8H7.7L4.7 9.6z"/><circle cx="12" cy="4.6" r="1.5"/><circle cx="16.2" cy="17.6" r="1.5"/>',
    check:     '<path d="M4.8 12.9l4.7 4.6L19.3 6.7"/>',
    autopipe:  '<path d="M3 16.5h6.2a3.4 3.4 0 0 0 3.4-3.4V7"/><path d="M17.6 4.2l1.2 2.7 2.7 1.2-2.7 1.2-1.2 2.7-1.2-2.7-2.7-1.2 2.7-1.2z"/>',
    download:  '<path d="M12 4v10.6"/><path d="M7.8 10.4L12 14.6l4.2-4.2"/><path d="M4.5 19.4h15"/>',
    print:     '<path d="M7 9.4V4.5h10v4.9"/><rect x="4" y="9.4" width="16" height="6.6" rx="1.2"/><path d="M7 13.4h10v6.1H7z"/>',
    group:     '<rect x="3.5" y="3.5" width="17" height="17"/><rect x="7" y="7" width="4.4" height="4.4"/><rect x="12.6" y="7" width="4.4" height="4.4"/><rect x="7" y="12.6" width="4.4" height="4.4"/><rect x="12.6" y="12.6" width="4.4" height="4.4"/>',
    each:      '<rect x="3.5" y="3.5" width="7" height="7"/><rect x="13.5" y="3.5" width="7" height="7"/><rect x="3.5" y="13.5" width="7" height="7"/><rect x="13.5" y="13.5" width="7" height="7"/>',
    back:      '<path d="M9.6 6.4L4 12l5.6 5.6"/><path d="M4 12h9.4"/><path d="M19.6 5.6v12.8"/>',
    groupadd:  '<rect x="3.5" y="3.5" width="12.4" height="12.4"/><rect x="6.6" y="6.6" width="3" height="3"/><rect x="10.2" y="6.6" width="3" height="3"/><rect x="6.6" y="10.2" width="3" height="3"/><rect x="10.2" y="10.2" width="3" height="3"/><path d="M18.4 14.6v6M15.4 17.6h6"/>',
    fit:       '<path d="M9.4 3.8H3.8v5.6M14.6 3.8h5.6v5.6M14.6 20.2h5.6v-5.6M9.4 20.2H3.8v-5.6"/>',
    rotate:    '<path d="M20 12a8 8 0 1 1-2.7-6"/><path d="M20 4.4v5h-5"/>',
    sheet:     '<rect x="4" y="3" width="16" height="18" rx="1.2"/><path d="M8 8h8M8 12h8M8 16h4.6"/>',
    panel:     '<rect x="3.5" y="4.5" width="17" height="15"/><path d="M14.2 4.5v15"/>',

    /* —— 图层开关（无文字按钮，按 data-ry-layer-toggle 取值）—— */
    layers:    '<path d="M12 3.4l8.6 4.6L12 12.6 3.4 8z"/><path d="M3.4 12.1L12 16.7l8.6-4.6"/><path d="M3.4 16.1L12 20.7l8.6-4.6"/>',
    pipenet:   '<path d="M3 9h4.4M16.6 9H21M3 15h4.4M16.6 15H21"/><circle cx="12" cy="12" r="3.2"/>',

    /* —— 选中 / 视图 —— */
    trash:     '<path d="M4.5 7h15"/><path d="M9.4 7V4.5h5.2V7"/><path d="M6.6 7l1 13.2h9.8L18.4 7"/><path d="M10.4 10.8v5.8M13.6 10.8v5.8"/>',
    relocate:  '<path d="M4 9.4V4h5.4M20 9.4V4h-5.4M4 14.6V20h5.4M20 14.6V20h-5.4"/><circle cx="12" cy="12" r="2.6"/>',
    zoomin:    '<circle cx="10.6" cy="10.6" r="6.6"/><path d="M15.3 15.3L20.2 20.2"/><path d="M7.6 10.6h6M10.6 7.6v6"/>',
    zoomout:   '<circle cx="10.6" cy="10.6" r="6.6"/><path d="M15.3 15.3L20.2 20.2"/><path d="M7.6 10.6h6"/>',
    multi:     '<rect x="3.5" y="3.5" width="17" height="17" stroke-dasharray="3.2 2.4"/><path d="M8 12.2l2.9 2.9L16 9.4"/>',
    exitmulti: '<rect x="3.5" y="3.5" width="17" height="17" stroke-dasharray="3.2 2.4"/><path d="M9.4 9.4l5.2 5.2M14.6 9.4l-5.2 5.2"/>',
    up:        '<path d="M12 19.4V4.8"/><path d="M7.4 9.4L12 4.8l4.6 4.6"/>',
    down:      '<path d="M12 4.6v14.6"/><path d="M7.4 14.6L12 19.2l4.6-4.6"/>',
    left:      '<path d="M19.4 12H4.8"/><path d="M9.4 7.4L4.8 12l4.6 4.6"/>',
    right:     '<path d="M4.6 12h14.6"/><path d="M14.6 7.4L19.2 12l-4.6 4.6"/>',
    save:      '<path d="M4.5 4.5h11.2l3.8 3.8v11.2H4.5z"/><path d="M8.2 4.5v5.2h6.2V4.5"/><rect x="8.2" y="13" width="7.6" height="6.5"/>',
    upload:    '<path d="M12 20.2V9.4"/><path d="M7.8 13.6L12 9.4l4.2 4.2"/><path d="M4.5 4.6h15"/>',
    cad:       '<rect x="4" y="4" width="16" height="16"/><path d="M8.2 16.2l3.8-7 3.8 7"/><path d="M10.1 13.6h3.8"/>'
  };

  /* 按钮 id → 图标名（精确表，优先于标签正则）。
     精确表存在的意义：多个按钮标签相近（阀门 两组都有、两个「适应窗口」、
     两个「改直径」、两个「遮蔽」），靠正则容易错配。 */  var BY_ID = {
    ppLineOrtho:'ortho', ppResetCuts:'gridreset', ppLockArea:'lock', ppUndo:'undo',
    /* [v990] 从灌溉参数区搬进顶部工具栏的两枚切换钮：up=末排上并、
       diameter=管径口径。复用既有 SVG 笔画，工具栏零新增样式、零新图标。 */
    planZoneMergeLastBtn:'up', ppCaliberModeBtn:'diameter',
    ppAutoPipe:'autopipe', ppDownload:'download', ppPrint:'print',
    ppGeWhole:'group', ppGePerPlot:'each', ppBackToGroupBtn:'back',
    ppCreatePlotGroup:'groupadd', ppFitViewBtn:'fit', ppPlotPanelToggle:'panel',
    ppRotateZones:'rotate', ppGenerate:'sheet', ppAiPlan:'autopipe', ppZoneAutoBtn:'grid',
    ppFineUp:'up', ppFineDown:'down', ppFineLeft:'left', ppFineRight:'right',

    tlWsFitValve:'valve', tlWsFitTee:'tee', tlWsFitElbow:'elbow', tlWsFitNode:'node',
    tlLineBtn:'line', tlWsLenBtn:'length', tlWsDelBtn:'trash', tlWsMoveResetBtn:'relocate',
    tlWsCalBtn:'diameter', tlWsMultiCalBtn:'diameter2', tlWsMultiClearBtn:'exitmulti',
    tlWsZoomIn:'zoomin', tlWsZoomOut:'zoomout', tlWsZoomFit:'fit', tlWsMultiBtn:'multi',
    tlWsMaskBtn:'mask', tlDesignUploadBtn:'upload', tlDimSaveBtn:'save',
    tlAutoPipe:'autopipe', tlDxfExport:'cad',
    tlDimMultiBtn:'grid',

    /* [v951] 在线地图绘制条 #mapDrawTools（吸附顶部、图标钮）。
       为什么必须走精确表：这里有**两组同名**按钮（「完成」总管 / 「完成」地块，
       「撤销点」/「撤销」），按标签正则匹配必然错配；而且「绘制」「完成」这类
       泛词在 BY_LABEL 里根本认不出来（会被当成「生成管线」之类）。
       注意：btnUndo 用 back（左向箭头+竖挡板）而不是 undo —— 同一条里已经有一个
       undo（撤销点），并排两个同图标等于没有图标。 */
    btnPlaceReservoir:'water', btnDrawTrunk:'line', btnFinishTrunk:'save',
    btnUndoTrunk:'undo', btnEditTrunk:'pencil', btnDraw:'polygon',
    btnFinish:'check', btnAddPt:'node', btnUndo:'back', btnMeasure:'length',
    btnClear:'trash'
  };

  /* 无 id 的按钮（主管/支管/水源/阀门/遮蔽管线/调网格/整组…）走标签规则。
     只匹配「可见文案」，不匹配 title —— title 里塞满了别的按钮名，会错配。 */
  var BY_LABEL = [
    [/主管/, 'main'], [/支管/, 'branch'], [/水源/, 'water'],
    [/遮蔽|隐藏/, 'mask'], [/阀门/, 'valve'], [/三通/, 'tee'],
    [/弯头/, 'elbow'], [/节点/, 'node'], [/划线|画线/, 'line'],
    [/调网格|网格/, 'grid'], [/重置/, 'gridreset'], [/锁定面积/, 'lock'],
    [/自动管路|生成管线/, 'autopipe'], [/下载/, 'download'], [/打印/, 'print'],
    [/整组/, 'group'], [/逐块/, 'each'], [/返回成组/, 'back'],
    [/成组并/, 'groupadd'], [/适应窗口|适应/, 'fit'], [/旋转|\+90/, 'rotate'],
    [/生成施工图|施工图/, 'sheet'], [/CAD|DXF/, 'cad'], [/回传设计/, 'upload'],
    [/标注保存|保存/, 'save'], [/改直径|直径/, 'diameter'], [/改长|长度/, 'length'],
    [/删除|清除/, 'trash'], [/恢复位置|复位/, 'relocate'],
    [/放大|＋/, 'zoomin'], [/缩小|－/, 'zoomout'], [/多选/, 'multi'],
    [/横竖/, 'ortho'], [/^↑$/, 'up'], [/^↓$/, 'down'], [/^←$/, 'left'], [/^→$/, 'right']
  ];

  function nameFor(id, label){
    if(id && BY_ID[id]) return BY_ID[id];
    var t = String(label || '').trim();
    for(var i = 0; i < BY_LABEL.length; i++){
      if(BY_LABEL[i][0].test(t)) return BY_LABEL[i][1];
    }
    return '';
  }

  function svgFor(name){
    var body = P[name];
    if(!body) return '';
    return '<svg class="ry-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + body + '</svg>';
  }

  /* 给 root 内每个按钮挂图标：已有则跳过（可重复调用）。
     data-ry-icon 仍写入图标名 —— 其它脚本 / 探针契约不变，
     只是 CSS 不再用 content:attr() 渲染它。

     [v815] 快捷条 #ppQuickBar 例外：那里是**文字按钮**（分区角度 / ↺+90° /
     生成施工图），沿用 v783 的文本形态。若不排除，会被塞进一个 18px 的 SVG，
     而尺寸规则挂在 .ry-drawing-toolbar 下、对快捷条不生效，图标就会撑满整个
     按钮（首轮预览实测到，一大块黑色）。 */
  function decorate(root){
    if(!root) return 0;
    var n = 0;
    Array.prototype.forEach.call(root.querySelectorAll('button'), function(button){
      if(button.closest && button.closest('#ppQuickBar')) return;
      var label = (button.textContent || '').trim();
      var name = nameFor(button.id, label);
      /* 图层开关（分区 / 管路）是就地 new 出来的无文字按钮，只能按 data 属性取值，
         否则会一直留着 data-ry-icon 里的字形 ▧ / ⌁（首轮实测漏了这两个）。 */
      if(!name && button.hasAttribute('data-ry-layer-toggle')){
        name = button.getAttribute('data-ry-layer-toggle') === 'pipeline' ? 'pipenet' : 'layers';
      }
      if(!name) return;
      /* 已挂图标就先退出，别改 data-ry-icon —— 否则会把 setIcon() 写进去的
         状态图标名（如 lock → unlock）按 BY_ID 又掰回默认名。 */
      if(button.querySelector(':scope > .ry-ico')){
        if(!button.getAttribute('data-ry-icon')) button.setAttribute('data-ry-icon', name);
        return;
      }
      button.setAttribute('data-ry-icon', name);
      button.insertAdjacentHTML('afterbegin', svgFor(name));
      button.setAttribute('data-ry-ico-svg', '1');
      n++;
    });
    return n;
  }

  /* ── [v824] 换图标 / 改文案，都不许把已挂的 SVG 弄丢 ──────────────────────
     病根：历史脚本用 `btn.textContent='已锁定面积'` 表达状态。textContent 是
     「整体替换子节点」，会把 decorate() 刚插进去的 <svg class="ry-ico"> 一起清掉，
     而 decorate() 只在初始化跑那一次 ⇒ 用户点一下按钮，图标就**永久**消失，
     之后按钮只剩 font-size:0 藏起来的文字（= 空白方块）。
     实测（_probe_lock_click.mjs）：#ppLockArea 点一下 hasSvg 由 true 变 false，
     再点一次也回不来。
     所以状态变化一律走这两个函数：
       setIcon(btn, name)  只换图标（锁定/解锁这类状态本身就是图标要表达的）
       setLabel(btn, text) 只换文字，保留首子节点的 SVG。 */
  function setIcon(button, name){
    if(!button) return false;
    var body = P[name];
    if(!body) return false;
    button.setAttribute('data-ry-icon', name);
    var old = button.querySelector(':scope > .ry-ico');
    var html = svgFor(name);
    if(old){ old.outerHTML = html; }
    else { button.insertAdjacentHTML('afterbegin', html); }
    button.setAttribute('data-ry-ico-svg', '1');
    return true;
  }

  function setLabel(button, text){
    if(!button) return;
    var svg = button.querySelector(':scope > .ry-ico');
    if(svg){
      /* 保留 SVG，只替换它后面的文字节点 */
      var n = svg.nextSibling;
      while(n){ var nx = n.nextSibling; button.removeChild(n); n = nx; }
      button.appendChild(document.createTextNode(String(text)));
      return;
    }
    button.textContent = String(text);
    /* 兜底：若图标此前已被别的 textContent 擦掉，这里按 data-ry-icon 补挂回来 */
    var name = button.getAttribute('data-ry-icon');
    if(name){ setIcon(button, name); }
  }

  window.RyIcons = { decorate: decorate, nameFor: nameFor, svgFor: svgFor, setIcon: setIcon, setLabel: setLabel, names: Object.keys(P) };

  /* [v952] 标记容器自动挂图标：HTML 里带 data-ry-iconize 的容器，在本脚本载入的**那一刻**
     就装饰，不等宿主脚本（v951 让 online-map.js 在页面末尾调 decorate，主页面要跑 100+ 个
     脚本，线上实测慢网下会先闪出一排**空方块** —— 因为按钮的 font-size:0 在 CSS 里早就生效了）。
     现在容器一被标记就立即装饰，宿主那边留一次幂等调用当第二次机会即可。 */
  function iconizeAll(){
    var hosts = document.querySelectorAll('[data-ry-iconize]');
    for(var i = 0; i < hosts.length; i++){ try{ decorate(hosts[i]); }catch(e){} }
  }
  window.RyIcons.iconizeAll = iconizeAll;
  try{ iconizeAll(); }catch(e){}
})();
