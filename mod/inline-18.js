
(function(){
  var nav=document.getElementById('fnNav');
  if(!nav) return;
  var inner=nav.querySelector('.fn-inner');
  var head=document.querySelector('.ry-nav .main-header');

  /* 工具模式判定。唯一开关是 body 上的 ry-tool 类（由 </head> 前的引导脚本按
     视口宽 ≥1101px 添加，页面 resize 时也会重算），所以必须用函数实时读取，
     不能缓存成常量 —— 窄屏加载后再拖宽窗口时，缓存值会永远停在 false。

     ⚠ 历史 Bug（本次修复）：本脚本原先直接引用了一个从未声明的 TOOL，
     第一个 forEach 走到「被隐藏的区块」（#networkSection / #irrCompareSection，
     offsetParent 为 null）时求值 TOOL 立即抛 ReferenceError，整段脚本中断：
       · 下面 forEach 里的导航点击事件根本没绑上
       · window.ryShowSection / window.ryJumpToSection 也没挂上去
     宽屏当时"看起来还能切"只是因为浏览器原生锚点跳转兜了底；
     一旦功能区真的按 display:none 收起，锚点就无处可跳，表现为"点了没反应"。 */
  function isTool(){ return document.body.classList.contains('ry-tool') || (window.RyMobile && window.RyMobile.isActive()); }

  /* CAD 单一制图区：分区与管路渲染固定在同一宿主与相机中；工具上下文只切换操作组，
     两套领域数据仍由各自编辑器维护，公共画布通过同一世界坐标投影管路叠加层。 */
  (function initDrawingWorkspace(){
    if(window.RyDrawingWorkspace) return;
    var activeMode='';
    var lastDrawingMode='partition';
    var listeners=[];
    var savedViewports={};
    var sharedHost=null;
    var stageByMode={};
    var stageHomes={};
    var nodeHomes=[];
    var canvasStack=null;
    var toolbarStack=null;
    var plannerPanel=null;
    var cameraAnchorPoly=null;
    var cameraAnchorIndices=null;
    var layerState={partition:true,pipeline:true};
    var renderedPipelineData=null;
    function rememberNode(node){
      if(!node||nodeHomes.some(function(x){return x.node===node;}))return;
      nodeHomes.push({node:node,parent:node.parentNode,next:node.nextSibling});
    }
    function decorateToolbar(root){
      if(!root)return;
      /* [v815 图标统一] 图标改由 mod/ry-icons.js 提供单色线性 SVG（24×24 网格、
         1.7px 圆头描边、currentColor）。此处先跑一遍：命中 id 精确表 / 标签规则的
         按钮会挂上 <svg class="ry-ico">，并写入 data-ry-icon=图标名。
         下面原有的字形表保留为**兜底**（未覆盖的按钮仍用字符），不再影响已挂
         SVG 的按钮 —— 判断条件是 hasAttribute('data-ry-icon')。
         回退：删本函数首行 RyIcons.decorate 调用即可恢复 v798~v802 的字形图标。 */
      if(window.RyIcons)window.RyIcons.decorate(root);
      /* [v798 图标重配] 用户实测「三通阀门 弯头 节点 直线，要有各自对应的合适的图标，
         现在感觉都不太匹配」。五个管件按钮换成工程制图语义符号：
         阀门 = ⋈ 对顶三角（工程图纸阀门标准符号）；三通 = ⊤ T 形分叉；
         弯头 = ∟ 直角弯；节点 = ⊕ 圆心接点（顺带解决与「锁定面积」◉ 撞图标）；
         划线 = ╱ 斜线段（画一条连接线）。 */
      var rules=[[/阀门/,'⋈'],[/三通/,'⊤'],[/弯头/,'∟'],[/节点/,'⊕'],[/划线|画线/,'╱'],[/遮蔽|隐藏/,'⊘'],[/多选/,'☑'],[/改长|长度/,'↔'],[/改直径|改径/,'🔧'],[/删除|清除/,'⌫'],[/恢复位置|复位/,'⌖'],[/标注保存|保存/,'💾'],[/回传|上传/,'☁'],[/导出|CAD/,'📐'],[/生成|自动管路/,'⇢'],[/分区|地块划分/,'▧'],[/网格/,'▦'],[/锁定面积/,'🔒'],[/回退|撤销/,'↶'],[/重置|恢复/,'⟲'],[/旋转|\+90/,'↻'],[/AI规划/,'🤖'],[/放大/,'＋'],[/缩小/,'−'],[/适应/,'⛶']];
      Array.prototype.forEach.call(root.querySelectorAll('button'),function(button){
        var label=(button.textContent||'').trim(),description=button.getAttribute('title')||label;
        /* [v798] 五个管件按钮 id 显式映射（优先于 rules 正则）：「节点」的 title 含
           「阀门/三通」（配件组合说明）、「划线」的 title 含「节点圆点」，正则会错配
           （实测节点→⋈、划线→⊕），与 v787 ppAiPlan 同款修法。 */
        /* [v800] 多选/遮蔽换语义图标：多选 = ☑ 勾选框（逐段加选）；遮蔽 = ⊘ 禁止/排除
           （被遮蔽的管灰色虚线且不计入材料清单）。id 显式映射优先于 rules 正则。 */
        var icons={ppPlotPanelToggle:'▤',ppResetCuts:'⟲',ppLockArea:'🔒',ppUndo:'↶',ppAutoPipe:'⇢',ppZoneAutoBtn:'▧',ppRotateZones:'↻',ppGenerate:'▣',ppAiPlan:'🤖',tlAutoPipe:'☁',tlDimMultiBtn:'▦',tlFrontNodeResetBtn:'⌖',tlWsFitValve:'⋈',tlWsFitTee:'⊤',tlWsFitElbow:'∟',tlWsFitNode:'⊕',tlLineBtn:'╱',tlWsMultiBtn:'☑',tlWsMaskBtn:'⊘',tlDimSaveBtn:'💾'};
        /* [v787] ppAiPlan 显式定 🤖：其 title 含「回传」二字，规则表 /回传|上传/ 排在
           /AI规划/ 之前会把图标错配成 ☁（悬浮态时代按钮带文字未露馅，图标化后必修）。 */
        var icon=icons[button.id];
        if(!icon)for(var i=0;i<rules.length;i++)if(rules[i][0].test(label+' '+description)){icon=rules[i][1];break;}
        /* [v815] 已由 RyIcons 挂过 SVG 的按钮：data-ry-icon 已是图标名，不再被
           字形表覆盖（否则 CSS 的 content:attr(data-ry-icon) 与 SVG 会同时出现）。 */
        var hasSvg=button.hasAttribute('data-ry-ico-svg');
        if(!hasSvg)button.setAttribute('data-ry-icon',icon||label.charAt(0)||'•');
        /* [v802 字形比例] 彩色 emoji（🔒💾☁📐🔄🔧）字形满格、单色数学符号（⋈⊤∟⊕╱↶⌖）
           字形只有 ~0.6em —— 同一 font-size 下视觉一大一小。emoji 按钮打标记，
           CSS 对其缩小 ::before，使两类图标视觉高度一致。 */
        if(!hasSvg&&icon&&/[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(icon))button.setAttribute('data-ry-icon-emoji','1');
        button.setAttribute('aria-label',label||description);
        button.title=description.indexOf(label)===0?description:label+'：'+description;
      });
    }
    function copy(value){
      if(value==null)return value;
      try{return JSON.parse(JSON.stringify(value));}catch(e){return null;}
    }
    function mkSep(){
      var span=document.createElement('span');span.className='ry-drawing-tsep';return span;
    }
    /* [v777 合并工具栏] 左栏不再按档位互斥折叠：只确保二级/三级参数组展开，
       不关闭任何组 —— 用户手动展开的分组（多地块/地形）保持原状。 */
    function syncRailGroups(mode){
      ['ryCadGrpPipe','ryCadGrpTl'].forEach(function(id){
        var details=document.getElementById(id);
        if(details&&!details.hasAttribute('open'))details.setAttribute('open','open');
      });
    }
    /* [v777 合并工具栏] 两套功能按钮全部常驻同一顶部工具栏，不再按档位互斥隐藏。 */
    function syncToolGroups(){
      if(!toolbarStack)return;
      Array.prototype.forEach.call(toolbarStack.querySelectorAll('[data-ry-tool-group]'),function(node){
        node.hidden=false;
      });
    }
    function modeForSection(id){
      if(id==='pipePlanSection')return 'partition';
      if(id==='tlPipePlanSection')return 'pipeline';
      return '';
    }
    function ensureSharedHost(){
      if(sharedHost)return sharedHost;
      var main=document.querySelector('body > main');
      var pp=document.querySelector('#pipePlanSection > .pp-body > .pp-stage');
      var tl=document.querySelector('#tlPipePlanSection > .pp-body > .pp-stage');
      var ppSide=document.getElementById('ppSide');
      var tlSide=document.getElementById('tlSide');
      var ppCanvas=document.getElementById('ppCanvasWrap');
      var tlCanvas=document.getElementById('tlWsContent');
      /* [v826b] 必须在任何 DOM 搬迁之前取到胶囊引用：稍后 ppCanvasWrap 会被搬进
         尚未插入 body 的 sharedHost，那时 getElementById 搜不到游离树里的节点。 */
      var ppFitChip=document.getElementById('ppFitViewBtn');
      if(!main||!pp||!tl||!ppCanvas||!tlCanvas)return null;
      sharedHost=document.createElement('div');
      sharedHost.id='ryDrawingHost';
      sharedHost.className='ry-drawing-host';
      sharedHost.setAttribute('role','region');
      sharedHost.setAttribute('aria-label','统一绘图工作区');
      nodeHomes=[];
      toolbarStack=document.createElement('div');toolbarStack.className='ry-drawing-toolbar';
      toolbarStack.setAttribute('role','toolbar');toolbarStack.setAttribute('aria-label','绘图工具');
      /* [v777 合并工具栏] 用户要求：地块分区与管路规划的功能按钮全部放在同一顶部
         工具栏，不再点击切换档位。图层开关 → 分区工具组 → 管路工具组。 */
      /* 图层开关：分区与管路各自独立显隐；显隐只叠加/撤掉图层，不替换画布与视口。 */
      [['partition','▧','显示/隐藏分区图层'],['pipeline','⌁','显示/隐藏管路图层']].forEach(function(item){
        var button=document.createElement('button');button.type='button';button.className='ry-drawing-layer-toggle';
        /* [v802 样式统一] 图标改走 data-ry-icon 属性（与装饰体系同一渲染通道），
           盒子/字形由 style-01.css v802 统一段管理——不再自绘 span，消除两套尺寸。 */
        button.setAttribute('data-ry-icon',item[1]);button.title=item[2];button.setAttribute('aria-label',item[2]);
        button.setAttribute('data-ry-layer-toggle',item[0]);
        button.addEventListener('click',function(){layerState[item[0]]=!layerState[item[0]];syncLayers();});
        toolbarStack.appendChild(button);
      });
      toolbarStack.appendChild(mkSep());
      /* [v779 取消] 通用「地块规划清单」入口 ▤（v775 引入、v777 常驻）已按用户截图标注移除
         （红箭头指向它与工具组内「多地块编辑」两键：「两个按钮保留一个就行」）——
         两键本就指向同一 #ppPlotPanel，v777 两组常驻后纯重复；保留工具组内原按钮
         #ppPlotPanelToggle（aria-expanded 同步、绑定见下方 v775 修复块）。
         要恢复：从 git 历史恢复本注释上方被删除的 plotToggle 创建块（.ry-drawing-plot-toggle）。 */
      /* [v778 取消] 通用缩放三键（＋ − ⛶）已按用户截图标注移除（红箭头指向这三键：「这些按钮先取消」）。
         缩放仍走鼠标滚轮与双击适应窗口（底图相机唯一，ppZoomView/ppFitView 能力未动）。
         要恢复：从 git 历史恢复本注释上方被删除的创建块（v775 引入，
         [['＋','放大视图（也可用鼠标滚轮）',1.25],…].forEach … ry-drawing-zoom-btn）。 */
      toolbarStack.appendChild(mkSep());
      /* [v775 修复] 面板入host与开关绑定必须发生在工具组被摘入工具栏之前：
         工具组一旦 appendChild 到尚未入档的 toolbarStack（detached），
         document.getElementById 只查文档树就再也查不到组内按钮 —— 旧顺序下
         「多地块编辑」开关的绑定永远被跳过（按钮点了没反应的根因）。
         开关统一用分区工具组内查询，detached/attached 都能命中。 */
      var partitionTools=document.getElementById('ppToolbar');
      var quickTools=document.getElementById('ppQuickBar');
      var pipelineTools=document.getElementById('tlWsToolbar');
      /* [v788 单层工具栏] 用户截图（箭头指组分隔线的断口）指令：「我要把所有功能都放在
         一个工具栏……只有一层关系，就是面板里面执行按钮，另外，分区旋转角度那一套，
         还是要单独拎出来」。
         ⇒ ① 分区组 + 管路组 = 唯一的顶部工具栏内容，组间分隔线由 CSS 隐藏（v788 段），
           按钮连成一条，不再有"两个工具栏拼接"的断口感；
         ② #ppQuickBar（分区角度 + ↻+90° + 生成施工图；🤖AI规划 v794 删、重新分区 v804 删）
           恢复 v783 悬浮卡片：rememberNode + 入 sharedHost + rypInitAll 注册拖拽（默认位画布左上
           top:52px/left:16px，避开工具栏与多地块编辑面板；双击抓手回默认位）。
         decorateToolbar 的 ppAiPlan:'🤖' 显式图标（v787 修的 ☁ 错配）保留——悬浮态按钮
         带文字不受影响，回到工具栏态（若有）也不会再错配。
         要把角度组收回工具栏：改回 toolbarStack 挂载并删 CSS v788 段（见 git 历史 v787）。 */
      rememberNode(quickTools);
      if(quickTools)sharedHost.appendChild(quickTools);
      plannerPanel=document.getElementById('ppPlotPanel');
      rememberNode(plannerPanel);
      if(plannerPanel)sharedHost.appendChild(plannerPanel);
      /* [v789 右缘抽屉] 用户指令：「多地块编辑变成向右侧折叠的工具栏，点击之后打开，
         平时是折叠起来的，在右侧」。
         ⇒ ① 面板进宿主后默认收起（hidden=true；restoreStageHomes 卸载时已有
           home.node.hidden=false 兜底，窄屏回原页恢复原可见性）；
         ② 右缘竖排抽屉标签 #ppPlotDrawerTab（absolute 贴 host 右缘、不出流不占网格行），
           点击开/合面板，aria-expanded 与 .open 高亮同步；
         ③ 工具组内 ☰「多地块编辑」（#ppPlotPanelToggle）与抽屉标签共用同一状态同步。 */
      if(plannerPanel){
        plannerPanel.hidden=true;
        /* [v790 抽屉位重置] 挂载时清掉旧布局留下的拖拽存档与内联坐标：
           rypDraggable 挂载时会恢复 data-ry-position-key 存档（runye_plot_edit_panel_pos，
           v789 之前面板在旧页面布局里拖过的位置），挂进宿主后被解释到左上角、
           大部分压进左侧栏底下，只露出一条边（用户实测「又给挤到角落了」）。
           抽屉语义 = 每次挂载都从右缘默认位（CSS right:44px）打开；会话内拖拽仍自由
           （rypDraggable 照常写存档、双击抓手回默认位），下次挂载再次重置。 */
        try{ localStorage.removeItem('runye_plot_edit_panel_pos'); }catch(e){}
        plannerPanel.style.left='';
        plannerPanel.style.top='';
        plannerPanel.style.right='';
        plannerPanel.style.bottom='';
      }
      /* [v792 图层面板归位 → v792b 每次挂载都归位] 用户实测「控制最远水路开关的那个
         悬浮面板不见了」，v792 首版只在 ensureSharedHost（仅首次）搬入仍看不见。
         两个残余缺口：① 面板可拖拽（v164b），用户拖过 → 存档 runye_tlWsLayerPanel_pos
         被 rypDraggable 恢复（placeWhenVisible 的 bounds 闭包锁旧容器 .ry-pane-ws），
         旧坐标在新定位上下文里被解释到画布外、被 overflow:hidden 裁掉；inline-27 同时
         读档置 manualPos=true，自动对齐永久失效。② restoreStageHomes 卸载把面板还原回
         原分栏后，第二次进工具模式没有任何代码把它搬回宿主。
         ⇒ 归位 + 重置放 mountSharedHost（每次挂载都跑，见下方 homeLayerPanel）；
         ensureSharedHost 只在 v790 处管一次性的挂载链，不再掺合面板。 */
      var plotDrawerTab=document.createElement('button');
      plotDrawerTab.type='button';
      plotDrawerTab.setAttribute('id','ppPlotDrawerTab');
      plotDrawerTab.className='pp-plot-drawer-tab';
      plotDrawerTab.textContent='多地块编辑';
      plotDrawerTab.setAttribute('aria-controls','ppPlotPanel');
      plotDrawerTab.setAttribute('aria-expanded','false');
      plotDrawerTab.title='多地块编辑：点击展开 / 收起（地块规划清单与成组编辑面板）';
      function syncPlotDrawer(){
        var panel=document.getElementById('ppPlotPanel'),tab=document.getElementById('ppPlotDrawerTab');
        if(!panel||!tab)return;
        var open=!panel.hidden;
        if(open){
          /* [v791 弹出位避让] 图层控制面板（#tlWsLayerPanel）自动对齐画布右上角，
             与抽屉默认位（right:44px/top:98px）重叠 —— 用户实测「同时出现两个控制面板」。
             打开时量一次图层控制面板的底缘，把抽屉面板放到它下方；图层控制不存在/
             隐藏（rect 高 0）时自然回退默认 98。面板已不是悬浮面板（CSS v791 段
             pointer-events 摘掉拖拽链），top 一经设置不会被拖走。 */
          var lp=document.getElementById('tlWsLayerPanel');
          if(lp){
            var lr=lp.getBoundingClientRect();
            if(lr.width>4&&lr.height>4)panel.style.top=(Math.ceil(lr.bottom)+8)+'px';
          }
        }
        tab.setAttribute('aria-expanded',String(open));
        tab.classList.toggle('open',open);
        var t=document.getElementById('ppPlotPanelToggle');
        if(t)t.setAttribute('aria-expanded',String(open));
      }
      plotDrawerTab.addEventListener('click',function(){
        var panel=document.getElementById('ppPlotPanel');if(!panel)return;
        panel.hidden=!panel.hidden;
        syncPlotDrawer();
      });
      sharedHost.appendChild(plotDrawerTab);
      /* [v803 双抽屉统一] 图层控制面板（#tlWsLayerPanel）与多地块编辑同一套抽屉语义：
         右缘竖排标签 #tlWsLayerDrawerTab（在多地块标签下方），点击弹出/收起面板。
         面板本体由 inline-27 创建（boot 可能晚于宿主挂载——慢 CDN），点击时面板
         尚不存在则主动 ensure() 补建，再切换 hidden；弹开时调 align() 让面板
         贴画布右上并让出标签宽度（right>=26px），不会盖住右缘标签，用户才能再点收回。
         面板无拖拽/折叠属性（v803 已在 inline-27 整组移除）⇒ 无多层覆盖/嵌套。 */
      var layerDrawerTab=document.createElement('button');
      layerDrawerTab.type='button';
      layerDrawerTab.setAttribute('id','tlWsLayerDrawerTab');
      layerDrawerTab.className='pp-plot-drawer-tab';
      layerDrawerTab.textContent='图层控制';
      layerDrawerTab.setAttribute('aria-controls','tlWsLayerPanel');
      layerDrawerTab.setAttribute('aria-expanded','false');
      layerDrawerTab.title='图层控制：点击展开 / 收起（图层显隐与最远水路开关）';
      function syncLayerDrawer(){
        var panel=document.getElementById('tlWsLayerPanel'),tab=document.getElementById('tlWsLayerDrawerTab');
        if(!panel||!tab)return;
        var open=!panel.hidden;
        tab.setAttribute('aria-expanded',String(open));
        tab.classList.toggle('open',open);
      }
      layerDrawerTab.addEventListener('click',function(){
        var panel=document.getElementById('tlWsLayerPanel');
        if(!panel){
          try{ if(window.tlWsLayerPanel&&typeof window.tlWsLayerPanel.ensure==='function')window.tlWsLayerPanel.ensure(); }catch(e){}
          panel=document.getElementById('tlWsLayerPanel');
        }
        if(!panel)return;
        panel.hidden=!panel.hidden;
        if(!panel.hidden){
          try{ if(window.tlWsLayerPanel&&typeof window.tlWsLayerPanel.align==='function')window.tlWsLayerPanel.align(); }catch(e){}
        }
        syncLayerDrawer();
      });
      sharedHost.appendChild(layerDrawerTab);
      /* [v788] 悬浮面板（多地块编辑 + 分区角度组）一次注册拖拽/折叠。 */
      if(quickTools||plannerPanel){
        if(typeof window.rypInitAll==='function')window.rypInitAll(sharedHost);
      }
      if(plannerPanel){
        var panelToggle=partitionTools?partitionTools.querySelector('#ppPlotPanelToggle'):document.getElementById('ppPlotPanelToggle');
        if(panelToggle&&!panelToggle.__ryPlotPanelBound){
          panelToggle.__ryPlotPanelBound=true;
          panelToggle.addEventListener('click',function(){
            var panel=document.getElementById('ppPlotPanel');if(!panel)return;
            panel.hidden=!panel.hidden;
            syncPlotDrawer();
          });
        }
      }
      syncPlotDrawer();
      [partitionTools,pipelineTools].forEach(rememberNode);
      [partitionTools,pipelineTools].forEach(function(root,i){
        if(!root)return;
        var mode=i===1?'pipeline':'partition';
        root.setAttribute('data-ry-tool-group',mode);root.setAttribute('role','group');
        root.setAttribute('aria-label',mode==='pipeline'?'管路与节点工具':'地块与分区工具');
        root.addEventListener('click',function(e){
          if(e.target.closest&&e.target.closest('button,input,select'))window.RyDrawingWorkspace.setToolMode(mode);
        },true);
        toolbarStack.appendChild(root);
      });
      /* [v788] 分区组 + 管路组 = 工具栏全部内容；组间不再加分隔线（CSS v788 段把
         DOM 里遗留的 sep 一并隐藏），消除"两个工具栏拼接"的断口感。 */
      if(pipelineTools&&!pipelineTools.__rySharedCameraZoom){
        pipelineTools.__rySharedCameraZoom=true;
        pipelineTools.addEventListener('click',function(e){
          var button=e.target&&e.target.closest?e.target.closest('#tlWsZoomIn,#tlWsZoomOut,#tlWsZoomFit'):null;
          if(!button||!sharedHost||!sharedHost.parentNode||document.body.getAttribute('data-ry-sec')!=='pipePlanSection')return;
          e.preventDefault();e.stopPropagation();if(e.stopImmediatePropagation)e.stopImmediatePropagation();
          if(button.id==='tlWsZoomFit'){if(typeof window.ppFitView==='function')window.ppFitView();return;}
          if(typeof window.ppZoomView==='function')window.ppZoomView(button.id==='tlWsZoomIn'?1.25:0.8);
        },true);
      }
      decorateToolbar(partitionTools);decorateToolbar(quickTools);decorateToolbar(pipelineTools);
      /* [v815] 上面三次只覆盖三个工具组；图层开关（▧/⌁）是直接挂在工具栏上的，
         不在任何组内 ⇒ 再对整条工具栏跑一次 RyIcons.decorate（幂等，已挂的跳过），
         否则这两个按钮会一直留着字形图标。 */
      if(window.RyIcons)window.RyIcons.decorate(toolbarStack);
      [partitionTools,pipelineTools].forEach(rememberNode);
      canvasStack=document.createElement('div');canvasStack.className='ry-drawing-canvas';canvasStack.setAttribute('aria-label','分区与管路叠加画布');
      stageHomes.partition={parent:pp.parentNode,next:pp.nextSibling};
      stageHomes.pipeline={parent:tl.parentNode,next:tl.nextSibling};
      [ppSide,tlSide,ppCanvas,tlCanvas].forEach(rememberNode);
      if(ppSide)sharedHost.appendChild(ppSide);
      if(tlSide)sharedHost.appendChild(tlSide);
      canvasStack.appendChild(ppCanvas);canvasStack.appendChild(tlCanvas);
      /* [v826b] 「⤢ 适应窗口」胶囊必须排在叠加层之后、直属 canvasStack，否则永远点不到。
         #ppCanvasWrap 自身是 position:absolute + z-index:1 ⇒ 它自己就是一个堆叠上下文，
         把内部任何 z-index（哪怕是 2100）都封在 1；而 #tlWsContent 是 z-index:2 的兄弟层，
         整层 <svg> 会盖死胶囊。实测（_probe_fitbtn.mjs）：胶囊亮起后 elementFromPoint
         命中的是 svg.tl-ws-svg，真实点击进不去 ⇒ ppFitView() 从不执行，
         宏观表现就是「缩放按钮点了没反应」（zoom 9.85 原地不动、只有 pan 被拖走）。
         做法：把胶囊提到 canvasStack 直下、append 在叠加层之后（配合 .pp-fitview 的 z-index:3），
         只搬一个浮层，不动任何图层顺序或相机。restoreStageHomes 会按 nodeHomes 放回原位。 */
      (function(){
        if(!ppFitChip||ppFitChip.parentNode!==ppCanvas)return;
        nodeHomes.push({node:ppFitChip,parent:ppFitChip.parentNode,next:ppFitChip.nextSibling});
        canvasStack.appendChild(ppFitChip);
      })();
      /* Wheel navigation always belongs to the base camera, including over pipe nodes. */
      canvasStack.addEventListener('wheel',function(e){
        if(e.target.closest&&e.target.closest('#ppPlotPanel'))return;
        if(e.target.closest&&e.target.closest('#ppQuickBar'))return;
        if(e.target===document.getElementById('ppCanvas'))return;
        e.preventDefault();e.stopPropagation();
        document.getElementById('ppCanvas').dispatchEvent(new WheelEvent('wheel',{clientX:e.clientX,clientY:e.clientY,deltaY:e.deltaY,cancelable:true}));
      },{capture:true,passive:false});
      sharedHost.appendChild(toolbarStack);sharedHost.appendChild(canvasStack);
      stageHomes.partition={parent:pp.parentNode,next:pp.nextSibling};
      stageHomes.pipeline={parent:tl.parentNode,next:tl.nextSibling};
      stageByMode.partition=pp;stageByMode.pipeline=tl;
      pp.setAttribute('data-ry-drawing-layer','partition');
      tl.setAttribute('data-ry-drawing-layer','pipeline');
      ppCanvas.setAttribute('data-ry-canvas-layer','partition');
      tlCanvas.setAttribute('data-ry-canvas-layer','pipeline');
      observeCanvas();
      return sharedHost;
    }
    /* [v792b 图层面板每次挂载归位 → v803 挂载即折叠] 面板搬进宿主后：
       ① 清旧拖拽存档（历史遗留路径防御，v803 起面板已无 rypDraggable，正常不再有新档）；
       ② 清内联坐标（避免旧坐标被解释到画布外被裁掉）；
       ③ hidden=true —— 抽屉语义 = 平时折叠，由右缘 #tlWsLayerDrawerTab 点开
         （弹开时 inline-27 的 align() 贴画布右上并让出标签宽度）；
       ④ 同步抽屉标签高亮态。
       （v792b 时代的 'ry-panel-pos-reset' 派发已删：inline-27 的监听随拖拽机制
       一起退役，改由 align() 直接调用兜位。） */
    function homeLayerPanel(){
      try{ localStorage.removeItem('runye_tlWsLayerPanel_pos'); }catch(e){}
      var lp=document.getElementById('tlWsLayerPanel');
      if(!lp){
        /* [v792c] 慢 CDN（beacon/jsdelivr）拖住 DOMContentLoaded ⇒ inline-27 的
           boot 还没跑、面板从未创建——这是用户实测「面板不见了」的最终根因
           （file:// 直开无 SW，资源加载策略与探针的 http 环境不同）。
           宿主挂载时主动 ensure 一次，把面板创建与 DOMContentLoaded 彻底解耦；
           ensure 幂等，boot 之后照常跑也不会重复创建。 */
        try{ if(window.tlWsLayerPanel&&typeof window.tlWsLayerPanel.ensure==='function')window.tlWsLayerPanel.ensure(); }catch(e){}
        lp=document.getElementById('tlWsLayerPanel');
        if(!lp)return;
      }
      if(lp.parentNode!==sharedHost){
        rememberNode(lp);
        sharedHost.appendChild(lp);
      }
      lp.style.left='';lp.style.top='';lp.style.right='';lp.style.bottom='';
      lp.hidden=true;
      try{ if(window.tlWsLayerPanel&&typeof window.tlWsLayerPanel.align==='function')window.tlWsLayerPanel.align(); }catch(e){}
      var layerTab=document.getElementById('tlWsLayerDrawerTab');
      if(layerTab){layerTab.setAttribute('aria-expanded','false');layerTab.classList.remove('open');}
    }
    function mountSharedHost(mode){
      var host=ensureSharedHost();
      if(!host)return false;
      /* 宿主固定在同一个地块工作区；旧 tl 锚点只改变工具组，不移动画布。 */
      var target=document.getElementById('pipePlanSection');
      var body=target&&target.querySelector(':scope > .pp-body');
      if(!body)return false;
      if(host.parentNode!==body)body.appendChild(host);
      homeLayerPanel();
      host.style.display=mode?'':'none';
      host.setAttribute('data-ry-tool-mode',mode||'partition');
      Array.prototype.forEach.call(host.querySelectorAll('[data-ry-drawing-mode-button]'),function(button){button.setAttribute('aria-pressed',String(button.getAttribute('data-ry-drawing-mode-button')===(mode||'partition')));});
      Array.prototype.forEach.call(host.querySelectorAll('[data-ry-layer-toggle]'),function(button){var key=button.getAttribute('data-ry-layer-toggle');button.setAttribute('aria-pressed',String(!!layerState[key]));});
      Object.keys(stageByMode).forEach(function(key){if(stageByMode[key])stageByMode[key].style.display='none';});
      /* [v777 合并工具栏] 两套工具组全部常驻；左栏只确保二级/三级组展开。
         双层 rAF：压过 ry-cad-toolbar 在功能区切换那一拍的自动展开。 */
      syncToolGroups();syncRailGroups(mode||'partition');
      requestAnimationFrame(function(){requestAnimationFrame(function(){
        syncToolGroups();syncRailGroups(mode||'partition');
      });});
      syncLayers();
      requestAnimationFrame(syncCamera);
      return true;
    }
    function observeCanvas(){
      if(!canvasStack||canvasStack.__ryObserved)return;canvasStack.__ryObserved=true;
      if(window.ResizeObserver){var ro=new ResizeObserver(function(){requestAnimationFrame(syncCamera);});ro.observe(canvasStack);}
      var tl=document.getElementById('tlWsContent');
      if(tl&&window.MutationObserver){var mo=new MutationObserver(function(){requestAnimationFrame(function(){syncLayers();syncCamera();});});mo.observe(tl,{childList:true,subtree:true});}
      window.addEventListener('resize',function(){requestAnimationFrame(syncCamera);});
    }
    function syncLayers(){
      if(!canvasStack)return;
      var pp=document.getElementById('ppCanvasWrap'),tl=document.getElementById('tlWsContent');
      if(pp)pp.style.visibility=layerState.partition?'visible':'hidden';
      if(tl){
        var data=window.tlDiagramData;
        if(data&&data!==renderedPipelineData&&window.RyTlWs){
          renderedPipelineData=data;window.RyTlWs.render(tl,data);
          /* [v784] 重新生成后重置分区视图为「适应窗口」：ppFitScale 已含 0.8 标注余量系数，
             保证图幅外沿的尺寸标注（旋转后左端更低）随图一起落入画布可视区；
             否则沿用户上一次的紧边缩放，底部尺寸线左半段会被画布边裁掉（用户实测）。 */
          if(layerState.pipeline){try{if(typeof window.ppFitView==='function')window.ppFitView();}catch(e){}}
        }
        if(!data)renderedPipelineData=null;
        var ready=!!data&&!!tl.querySelector('svg.tl-ws-svg');
        tl.style.visibility=layerState.pipeline&&ready?'visible':'hidden';
        /* [v777 合并工具栏] 交互不再按档位切换：管线层 ready 即可交互；
           SVG 空白区域默认不接收指针事件，点击自动穿透到底图画布。 */
        tl.style.pointerEvents=layerState.pipeline&&ready?'auto':'none';
      }
      if(toolbarStack)Array.prototype.forEach.call(toolbarStack.querySelectorAll('[data-ry-layer-toggle]'),function(b){var key=b.getAttribute('data-ry-layer-toggle');b.setAttribute('aria-pressed',String(!!layerState[key]));});
      requestAnimationFrame(syncCamera);
    }
    function syncCamera(){
      var wrap=document.getElementById('ppCanvasWrap'),canvas=document.getElementById('ppCanvas'),layer=document.getElementById('tlWsContent');
      var svg=layer&&layer.querySelector('svg.tl-ws-svg'),data=window.tlDiagramData;
      if(!wrap||!canvas||!svg||!data||!Array.isArray(data.poly)||data.poly.length<3||typeof window.ppMapToCanvas!=='function'||!window.RyTlWs||!window.RyTlWs.getWorldTransform)return;
      var world=window.RyTlWs.getWorldTransform();if(!world||!world.k)return;
      try{
        layer.style.transform='none';
        var ctm=svg.getScreenCTM(),rect=wrap.getBoundingClientRect();if(!ctm||!rect.width||!rect.height)return;
        if(cameraAnchorPoly!==data.poly){
          cameraAnchorPoly=data.poly;cameraAnchorIndices=null;
          var p0=data.poly[0],best=0;
          for(var bi=1;bi<data.poly.length-1&&!cameraAnchorIndices;bi++)for(var ci=bi+1;ci<data.poly.length;ci++){
            var p1=data.poly[bi],p2=data.poly[ci];
            var area=Math.abs(p0.x*(p1.y-p2.y)+p1.x*(p2.y-p0.y)+p2.x*(p0.y-p1.y));
            if(area>best){best=area;cameraAnchorIndices=[0,bi,ci];}
          }
          if(best<1e-8)cameraAnchorIndices=null;
        }
        if(!cameraAnchorIndices)return;
        /* [v775 修复] 本机 Edge 的 getScreenCTM() 返回对象没有 transformPoint 方法
           （异常原被 catch 吞掉 ⇒ 仿射对齐从未生效、管路层比例始终不随底图）。
           改为按 2×3 矩阵分量手动变换：x'=a·x+c·y+e，y'=b·x+d·y+f。 */
        function ctmApply(m,px,py){return{x:m.a*px+m.c*py+m.e,y:m.b*px+m.d*py+m.f};}
        var tri=cameraAnchorIndices.map(function(index){
          var p=data.poly[index],q=window.ppMapToCanvas(p.x,p.y);
          var sp=ctmApply(ctm,(p.x+world.ox)*world.k,(p.y+world.oy)*world.k);
          return{source:sp,target:{x:rect.left+q.x*(rect.width/(canvas.width||rect.width)),y:rect.top+q.y*(rect.height/(canvas.height||rect.height))}};
        });
        var source=tri.map(function(x){return x.source;}),target=tri.map(function(x){return x.target;});
        var x1=source[0].x,y1=source[0].y,x2=source[1].x,y2=source[1].y,x3=source[2].x,y3=source[2].y;
        var det=(x1*(y2-y3)+x2*(y3-y1)+x3*(y1-y2));if(Math.abs(det)<1e-6)return;
        /* [v776 修复] 克莱姆第三分量（截距）旧式整体差一个负号 —— F 把管路层映到 −target，
           表现为分区底图与管路图层恒定错位（用户实测两层"锁定重叠"失败）。
           正确展开：γ=(v1(x2y3−y2x3)+v2(y1x3−x1y3)+v3(x1y2−y1x2))/det。 */
        function solve(v){return[(v[0]*(y2-y3)+v[1]*(y3-y1)+v[2]*(y1-y2))/det,(x1*(v[1]-v[2])+x2*(v[2]-v[0])+x3*(v[0]-v[1]))/det,(v[0]*(x2*y3-y2*x3)+v[1]*(y1*x3-x1*y3)+v[2]*(x1*y2-y1*x2))/det];}
        var ax=solve(target.map(function(p){return p.x;})),ay=solve(target.map(function(p){return p.y;}));
        var layerRect=layer.getBoundingClientRect(),P=new DOMMatrix().translate(layerRect.left,layerRect.top),F=new DOMMatrix([ax[0],ay[0],ax[1],ay[1],ax[2],ay[2]]),local=P.inverse().multiply(F).multiply(P);
        layer.style.transformOrigin='0 0';layer.style.transform='matrix('+[local.a,local.b,local.c,local.d,local.e,local.f].join(',')+')';
      }catch(e){}
    }
    function restoreStageHomes(){
      nodeHomes.forEach(function(home){
        if(!home.node||!home.parent)return;
        var ref=home.next&&home.next.parentNode===home.parent?home.next:null;
        home.parent.insertBefore(home.node,ref);
        home.node.removeAttribute('data-ry-tool-group');home.node.removeAttribute('data-ry-floating-planner');
        home.node.removeAttribute('data-ry-canvas-layer');home.node.style.visibility='';home.node.style.transform='';
        home.node.hidden=false;
      });
      Object.keys(stageByMode).forEach(function(mode){
        var stage=stageByMode[mode],home=stageHomes[mode];
        if(!stage||!home||!home.parent)return;
        var ref=home.next&&home.next.parentNode===home.parent?home.next:null;
        home.parent.insertBefore(stage,ref);
        stage.removeAttribute('data-ry-drawing-layer');
        stage.style.display='';
      });
      if(sharedHost&&sharedHost.parentNode)sharedHost.parentNode.removeChild(sharedHost);
      sharedHost=null;stageByMode={};stageHomes={};nodeHomes=[];canvasStack=null;toolbarStack=null;plannerPanel=null;cameraAnchorPoly=null;cameraAnchorIndices=null;renderedPipelineData=null;
    }
    function serialized(api){
      try{return api&&typeof api.serialize==='function'?copy(api.serialize()):null;}catch(e){return null;}
    }
    function viewportSnapshot(pp){
      var pipelineView=null;
      try{
        if(window.RyTlWs&&typeof window.RyTlWs.getView==='function')pipelineView=copy(window.RyTlWs.getView());
      }catch(e){}
      return {
        partition:pp?{zoom:Number(pp.zoom)||1,panX:Number(pp.panX)||0,panY:Number(pp.panY)||0}:null,
        pipeline:pipelineView
      };
    }
    function captureViewport(mode){
      try{
        if(mode==='partition'&&typeof window.ppGetView==='function')savedViewports.partition=copy(window.ppGetView());
        if(mode==='pipeline'&&window.RyTlWs&&typeof window.RyTlWs.getView==='function')savedViewports.pipeline=copy(window.RyTlWs.getView());
      }catch(e){}
    }
    function restoreViewport(mode){
      var saved=savedViewports[mode];if(!saved)return false;
      var restored=false;
      try{
        if(mode==='partition'&&typeof window.ppSetView==='function')restored=window.ppSetView(saved);
        if(mode==='pipeline'&&window.RyTlWs&&typeof window.RyTlWs.setView==='function')restored=window.RyTlWs.setView(saved);
      }catch(e){}
      /* 快照是跨功能区往返时的一次性恢复值。保留它会让同一功能区再次走
         ryShowSection 时，把用户刚刚调整的视图又覆盖回上一次的旧位置。 */
      if(restored)delete savedViewports[mode];
      return restored;
    }
    function snapshot(){
      var bridge=window.RunyeBridge, pp=bridge&&typeof bridge.getPartitionSnapshot==='function'?bridge.getPartitionSnapshot():null, tl=window.tlDiagramData;
      // 设计坐标始终沿用当前工具的真实地块几何；视图平移/缩放单独存放，不混入地块边界。
      var parcel=activeMode==='partition'&&pp&&Array.isArray(pp.polyPts)&&pp.polyPts.length>=3
        ?pp.polyPts
        :(activeMode==='pipeline'&&tl&&Array.isArray(tl.poly)&&tl.poly.length>=3
          ?tl.poly
          :(Array.isArray(window.measuredPolygon)&&window.measuredPolygon.length>=3
            ?window.measuredPolygon
            :(tl&&Array.isArray(tl.poly)?tl.poly:[])));
      var cuts=null;
      try{if(bridge&&typeof bridge.getZoneCuts==='function')cuts=bridge.getZoneCuts();}catch(e){}
      return {
        schema:'runye-drawing-scene/v1',
        coordinateSystem:'meter',
        activeMode:activeMode,
        parcelBoundary:copy(Array.isArray(parcel)?parcel.map(function(p){return{x:Number(p.x),y:Number(p.y)};}):[]),
        // 仅为画布视口状态，不代表设计旋转；分区角度只记录在 partition.angleDeg。
        viewports:viewportSnapshot(pp),
        partition:pp?{
          boundary:copy(pp.polyPts||[]),
          angleDeg:Number(pp.zoneAngleDeg)||0,
          cuts:copy(cuts),
          partitionCuts:copy(pp.partitionCuts||null),
          cutSnap:copy(pp.cutSnap||null),
          cutOverrides:copy(pp.cutOverrides||null),
          mainPipes:copy(pp.mainPipes||[]),
          branchPipes:copy(pp.branchPipes||[]),
          subBranchPipes:copy(pp.subBranchPipes||[]),
          source:copy(pp.source||null),
          valves:copy(pp.valves||[])
        }:null,
        pipeline:tl?{
          world:tl.world||null,
          plot:copy(tl.plot||null),
          poly:copy(tl.poly||[]),
          zones:copy(tl.zones||null),
          mainPipes:copy(tl.mainPipes||[]),
          branchPipes:copy(tl.branchPipes||[]),
          branchFullSpans:copy(tl.branchFullSpans||[]),
          dripTapes:copy(tl.dripTapes||[]),
          frontPipe:copy(tl.frontPipe||null),
          sourcePos:copy(tl.sourcePos||null),
          valves:copy(tl.valves||[]),
          partialFlags:copy(tl.partialFlags||[]),
          zoneActMu:copy(tl.zoneActMu||[])
        }:null,
        pipelineEdits:{
          automatic:serialized(window.RyTlAutoEdits),
          manual:serialized(window.RyTlEditPipes)
        }
      };
    }
    window.RyDrawingWorkspace={
      activateSection:function(id){
        var next=modeForSection(id);
        if(next)activeMode=next;
        if(next)lastDrawingMode=next;
        var main=document.querySelector('body > main');
        if(main){
          if(next)main.setAttribute('data-ry-drawing-mode',next);
          else main.removeAttribute('data-ry-drawing-mode');
        }
        if(next&&isTool())mountSharedHost(next);
        listeners.slice().forEach(function(fn){try{fn(next||activeMode||lastDrawingMode);}catch(e){}});
        return next||activeMode;
      },
      setToolMode:function(mode){
        /* [v777 合并工具栏] 档位 API 保留给导航/兜底调用；工具组已全部常驻，
           这里只更新内部上下文与左栏展开，不再切换任何按钮可见性。 */
        if(mode!=='partition'&&mode!=='pipeline')return false;
        activeMode=mode;lastDrawingMode=mode;mountSharedHost(mode);
        listeners.slice().forEach(function(fn){try{fn(mode);}catch(e){}});
        return true;
      },
      syncCamera:syncCamera,
      zoomBy:function(factor){return typeof window.ppZoomView==='function'&&window.ppZoomView(factor);},
      fitView:function(){return typeof window.ppFitView==='function'&&window.ppFitView();},
      panBy:function(dx,dy){
        return !!(sharedHost&&sharedHost.parentNode&&document.body.getAttribute('data-ry-sec')==='pipePlanSection'&&
          typeof window.ppPanView==='function'&&window.ppPanView(dx,dy));
      },
      refreshPlot:function(){
        if(!isTool())return;
        activeMode='partition';lastDrawingMode='partition';mountSharedHost(activeMode);
        requestAnimationFrame(function(){
          window.dispatchEvent(new Event('resize'));
          if(typeof window.ppFitView==='function')window.ppFitView();
          syncLayers();
        });
      },
      restoreActiveViewport:function(){return restoreViewport(activeMode);},
      getActiveMode:function(){return activeMode;},
      getLastMode:function(){return lastDrawingMode;},
      getSceneSnapshot:snapshot,
      subscribe:function(fn){
        if(typeof fn!=='function')return function(){};
        listeners.push(fn);
        return function(){var i=listeners.indexOf(fn);if(i>=0)listeners.splice(i,1);};
      }
    };
    var lastToolMode=isTool();
    /* [v775] 管路数据变化守护：生成/重生成只改 window.tlDiagramData 引用，不动 #tlWsContent
       的 DOM，MutationObserver 捕获不到 ⇒ 工具档位内点「生成管线图」后叠加层不上屏。
       守护轮询只在数据引用变化时才做一次 syncLayers（渲染 + 相机同步），平时零 DOM 操作。
       typeof 守卫：闸门 VM 桩 / Node 沙箱没有定时器，直接跳过（零动作惯例）。 */
    if(typeof setInterval==='function'){
      setInterval(function(){
        if(window.tlDiagramData&&window.tlDiagramData!==renderedPipelineData&&(activeMode||sharedHost)){
          try{syncLayers();}catch(e){}
        }
      },400);
    }
    window.addEventListener('resize',function(){
      var nextToolMode=isTool();
      if(nextToolMode===lastToolMode)return;
      lastToolMode=nextToolMode;
      if(!nextToolMode){
        /* Let ry-cad-toolbar restore its sidebar nodes first; their original
           parent during tool mode is this host, so restore our outer nodes next frame. */
        requestAnimationFrame(function(){
          restoreStageHomes();activeMode='';
          var main=document.querySelector('body > main');
          if(main)main.removeAttribute('data-ry-drawing-mode');
        });
        return;
      }
      var id=document.body.getAttribute('data-ry-sec')||'';
      if(!modeForSection(id)){
        var active=document.querySelector('main > .ry-sec.ry-active');
        id=active&&active.id||'pipePlanSection';
      }
      var sec=document.getElementById(id);
      if(sec&&typeof window.ryShowSection==='function')window.ryShowSection(sec);
    });
  })();

  /* ★ [v511 2026-10-16] 导航项收集改为「可重入」。
     用户实测：管路规划 → 底部切「三级简图」→ 再点顶部「管路规划」，视图卡在 pipe
     回不到工作区。根因＝runye-nav.js 的 RyEntitle.onChange → RyFnNav.render() 会在
     「会员权益异步就绪」时**重建**全部 [data-ry-navitem]（先摘旧节点、再建新节点）。
     本脚本在解析期就把 click 绑在**那批旧元素**上，重建一发生就两处同时坏掉：
       · 新元素没有 click 处理器 ⇒ 点击只剩浏览器原生锚点跳转 → hashchange →
         ryJumpToSection → ryShowSection —— 这条路**不复位视图**（三级仍停在 pipe），
         也不清 data-ry-clean，正是用户看到的现象；
       · activate() 点亮的是已脱离文档的旧节点 ⇒ 导航高亮一并丢失。
     病史同 v376（runye-nav.js 里「重建后 href 改写丢失」那段注释记的是同一根因）。
     ⇒ 收集抽成可重入的 collectItems()，并在文件下半部挂 MutationObserver，
        导航一被重建就重收 + 补绑 + 恢复高亮。 */
  function collectItems(prune){
    var out=[];
    Array.prototype.slice.call(nav.querySelectorAll('.fn-link')).forEach(function(a){
      var id=a.getAttribute('data-target');
      // 无 data-target 的是普通站内页链接（如「滴灌带查询」）：原样保留，不参与滚动高亮
      if(!id) return;
      var sec=document.getElementById(id);
      if(!sec){ if(prune && a.parentNode) a.parentNode.removeChild(a); return; }
      // 目标区块被 display:none 隐藏时（页面已隐藏「管网布置」「数据对比」），同步从导航剔除。
      // 例外：工具模式下所有非当前功能区都是 display:none，但它们是本模式管理的功能区
      //       （带 .ry-sec），必须保留在导航里，否则切一次导航就被清空。
      if(sec.offsetParent===null && !(isTool() && sec.classList.contains('ry-sec'))){
        if(prune && a.parentNode) a.parentNode.removeChild(a); return;
      }
      a.setAttribute('href','#'+id);
      out.push({link:a, sec:sec});
    });
    return out;
  }
  /* prune 只在初始化这一次为 true：把页面自身隐藏的区块（管网布置/数据对比）从导航里摘掉。
     重建后的重收用 false —— 那时 DOM 是渲染器刚产出的，不该再动它的节点。 */
  var NAV_BOUND='_ryNavClickBound';
  var items=collectItems(true);
  if(!items.length) return;

  function stickyOffset(){
    var h=head?head.getBoundingClientRect().height:0;
    return h + nav.getBoundingClientRect().height;
  }
  /* [v511] 不再预算 links 快照：导航重建后 items 整体换新，
     高亮必须按**当前**元素列表算，否则点亮的是脱离文档的旧节点（表现为「高亮丢了」）。 */
  function activate(link){
    if(!link&&isTool()&&document.body.getAttribute('data-ry-sec')==='tlPipePlanSection')link=nav.querySelector('[data-ry-drawing-entry]');
    items.forEach(function(it){ it.link.classList.toggle('active', it.link===link); });
  }
  function scrollYNow(){
    return window.pageYOffset || document.documentElement.scrollTop || 0;
  }

  /* 导航点击＝直接切换（不做平滑滚动动画）
     注意：html 上有全局 scroll-behavior:smooth，若用 behavior:'auto' 会跟随它变成平滑滚动，
     所以必须用 behavior:'instant'；老浏览器不认 instant 会抛 TypeError，
     故先把根元素的 scroll-behavior 临时压成 auto 再跳，作为双保险。 */
  function jumpTo(top){
    var root=document.documentElement;
    var prev=root.style.scrollBehavior;
    root.style.scrollBehavior='auto';
    try{ window.scrollTo({top:top, behavior:'instant'}); }
    catch(err){ window.scrollTo(0, top); }
    root.style.scrollBehavior=prev;
  }

  /* 单视口：显示指定功能区，其余隐藏；同步导航高亮与底部状态栏。
     仅工具模式使用；非工具模式由下面的滚动逻辑接管。 */
  function ryShowSection(sec, link){
    var drawingRedirectMode='';
    if(window.RyMobile && window.RyMobile.isActive() && sec && window.RyMobile.sections.indexOf(sec.id)<0) sec=document.getElementById('pipePlanSection');
    /* 二级简图停用：无论由顶部导航、插件还是旧跳转入口进入，都统一回到编辑工作区。 */
    if(sec && sec.id==='pipePlanSection' && sec.getAttribute('data-ry-view')!=='edit'){
      sec.setAttribute('data-ry-view','edit');
      sec.setAttribute('data-ry-clean','0');
    }
    /* [v193] 成组地块拦截三级页入口（与 rySetTab 里的拦截互为兜底） */
    if(sec && sec.id==='tlPipePlanSection' && typeof ryGroupThirdLevelGuard==='function' && ryGroupThirdLevelGuard())return;
    /* 分区与管路在桌面工具模式共用固定画布；旧三级锚点只选择管路工具组。 */
    if(sec&&sec.id==='tlPipePlanSection'&&isTool()){
      drawingRedirectMode='pipeline';
      sec=document.getElementById('pipePlanSection');
      if(sec){sec.setAttribute('data-ry-view','edit');sec.setAttribute('data-ry-clean','0');}
    }
    /* [v242] 离开「从成组页进来的二级页逐块编辑」这条流（切到别的功能区）就撤掉标记 ——
       否则「◀ 返回成组管路」会一直挂在二级页上，而此刻用户早已不是从成组页进来的，
       那个键会指回一个他没去过的来路。
       ★ 本函数是切功能区的唯一收口（顶部导航 / rySetTab / ryJumpToSection 都汇到这里），
         在这里清才不会漏；成组页那条返回路径本身已先清成 null（幂等，无副作用）。 */
    if(sec && sec.id!=='pipePlanSection') window.__runyeGroupPlotEdit=null;
    var all=document.querySelectorAll('main > .ry-sec');
    for(var i=0;i<all.length;i++){ all[i].classList.toggle('ry-active', all[i]===sec); }
    /* 2026-09-12：写 body[data-ry-sec]，供底部状态栏里的主区 Tab 条判断该显示哪一组
       （纯状态标记，不改任何跳转 / 事件逻辑；:has() 兜底规则见样式区第 13 段）。 */
    try{ if(sec && sec.id) document.body.setAttribute('data-ry-sec', sec.id); }catch(err){}
    try{ if(window.RyDrawingWorkspace) window.RyDrawingWorkspace.activateSection(sec&&sec.id); }catch(err){}
    if(drawingRedirectMode&&window.RyDrawingWorkspace)window.RyDrawingWorkspace.setToolMode(drawingRedirectMode);
    window.scrollTo(0,0);
    /* 隐藏期间量到的画布宽度是 0，显示后必须让各画布重算尺寸。
       地块绘制的 atResizeCanvas（window resize）与二级管路的 ppResize 都监听 resize，
       等下一帧再发，确保布局已按新的 display 重排。 */
    function refit(){
      try{ window.dispatchEvent(new Event('resize')); }catch(err){}
      try{ if(window.RyDrawingWorkspace)window.RyDrawingWorkspace.restoreActiveViewport(); }catch(err2){}
    }
    if(window.requestAnimationFrame) window.requestAnimationFrame(refit); else setTimeout(refit, 16);
    if(!link){ for(var j=0;j<items.length;j++){ if(items[j].sec===sec){ link=items[j].link; break; } } }
    activate(link||null);
    /* v142：材料清单页数据取三级简图口径（管长/实际管径/分区阀与三通数量），
       图面改动后切入本页时重渲染一次，保证统计与三级简图同源最新。 */
    try{ if(sec && sec.id==='detailsSection' && typeof window.render==='function') window.render(); }catch(err){}
    /* [v194] 切入成组管路页时重排一次：只调刷新、不调切换（否则递归）。
       隐藏期间画布宽高量到 0，不重排就是一张空白。 */
    try{ if(sec && sec.id==='grPipeSection' && typeof window.grRefreshGroupPage==='function') window.grRefreshGroupPage(); }catch(err){}
    /* [v356] 方案B懒重放消费点：打开时各恢复链只置 __ryLazyReplay 不重放图面；
       首次切入二级/三级管路页在这里一次性重放（静音弹窗），随后的 v355 ws 钩子
       用重放出的新鲜数据补渲染工作区。用户不进管路页就永不重放——打开零图面成本。 */
    try{
      if(window.__ryLazyReplay && sec && (sec.id==='pipePlanSection'||sec.id==='tlPipePlanSection')){
        window.__ryLazyReplay=false;
        var _la0=window.alert;
        try{
          window.alert=function(){};
          if(typeof window.ppGenerateDiagram==='function') window.ppGenerateDiagram({scroll:false});
          if((window.measuredPolygon||[]).length>=3 && typeof tlAutoGenerate==='function') tlAutoGenerate({scroll:false,stay:true});
        }catch(e){}finally{ window.alert=_la0; }
        try{ if(typeof renderThreeLevel==='function') renderThreeLevel(); }catch(e){}
        try{ if(typeof tlUpdatePlanBar==='function') tlUpdatePlanBar(); }catch(e){}
      }
    }catch(err){}
    /* [v355] 三级停在 ws 视图切入、图面数据已在而画布仍是初始空态提示时，就地补渲染一次。
       背景：整页重载后 data-ry-view 本就是 "ws"，导航点击（data-ry-view!=='ws' 才调 rySetTab）
       会跳过渲染 ⇒ v161/v355 恢复链重放出的 tlDiagramData 永远不被画进 #tlWsContent，
       用户看到的就是「请先生成三级管线平面图」空态。
       容器已有 svg（用户正在看的图面）绝不动，保住视口与编辑态；
       恢复链不触发 rySetTab，这里就是它唯一的上屏时机（此刻 ry-active 已切上，画布宽高已可量）。 */
    try{
      if(sec && sec.id==='tlPipePlanSection' && sec.getAttribute('data-ry-view')==='ws' && window.tlDiagramData && window.RyTlWs){
        var wsC=document.getElementById('tlWsContent');
        if(wsC && !wsC.querySelector('svg')){
          if(typeof window.tlWsStatsRender==='function'){ try{ window.tlWsStatsRender(); }catch(eS){} }
          window.RyTlWs.render(wsC, window.tlDiagramData);
        }
      }
    }catch(err){}
    if(typeof window.ryStatusUpdate==='function') window.ryStatusUpdate(sec);
  }
  window.ryShowSection=ryShowSection;

  /* 供页面其它模块调用：跳到指定功能区。
     工具模式＝切换到该功能区；非工具模式＝滚动定位，落点几何与「点导航」完全一致
     （同一 stickyOffset()、同一 jumpTo()）。
     用途：地块库「设为当前」确认后，直接跳到「二级管路制图区」查看生成的施工简图。
     传入要素 id（如 'pipePlanSection'）；同步点亮对应导航项。 */
  window.ryJumpToSection=function(id){
    if(window.RyMobile && window.RyMobile.isActive() && window.RyMobile.sections.indexOf(id)<0) id='pipePlanSection';
    var el=document.getElementById(id);
    if(!el) return false;
    /* 清理历史满屏态（.sys-view / .pipe-view 已由主区 Tab 取代，这里只做兼容清理） */
    if(el.classList.contains('sys-view')) el.classList.remove('sys-view');
    if(el.classList.contains('pipe-view')) el.classList.remove('pipe-view');
    if(isTool()){ ryShowSection(el); return true; }
    var link=null;
    for(var i=0;i<items.length;i++){ if(items[i].sec===el){ link=items[i].link; break; } }
    var top=el.getBoundingClientRect().top + scrollYNow() - stickyOffset();
    if(top<0) top=0;
    jumpTo(top);
    activate(link);
    return true;
  };

  /* 单个导航项的点击行为。与「绑定」解耦成具名函数（[v511]）：
     导航重建后新元素复用同一份逻辑，不用把整段处理器再抄一遍。 */
  function navItemClick(it, e){
    e.preventDefault();
    if(it.link.hasAttribute('data-ry-drawing-entry')&&isTool()&&window.RyDrawingWorkspace&&window.RyFnNav){
      window.RyFnNav.openDrawingMode(window.RyDrawingWorkspace.getActiveMode()||window.RyDrawingWorkspace.getLastMode()||'partition');
      return;
    }
    /* [v193] 成组地块拦截三级页入口：在导航这里就 return，
       否则 rySetTab / ryShowSection 里的拦截会各弹一次窗（一次点击两声 alert）。 */
    if(it.sec && it.sec.id==='tlPipePlanSection' && typeof ryGroupThirdLevelGuard==='function' && ryGroupThirdLevelGuard())return;
    /* 若目标区块停在满屏视图（.sys-view 施工图 / .pipe-view 管线图），
       点导航应回到绘图编辑区，而非停留在简图区 —— 先退出满屏态。 */
    if(it.sec.classList.contains('sys-view')) it.sec.classList.remove('sys-view');
    if(it.sec.classList.contains('pipe-view')) it.sec.classList.remove('pipe-view');
    /* ★ 顶部导航＝绘图工作区（2026-09-13）：不管底部状态栏切到哪个简图，
       点顶部一律回到该功能区的绘图工作区 —— 二级复位到「管线编辑」、
       三级复位到「三级设计工作区」，并清除输出模式标记（左属性栏恢复）。
       rySetTab 会把三级的标记写成 "1"，所以复位后必须再写 "0"（顺序不可倒）。
       try/catch：此处任何异常都只中断本次点击；[v511] 起各项各自持有处理器，
       不再共用一个 forEach，因此不会像旧写法那样「一坏就整条导航全失绑」。 */
    try{
      if(typeof rySetTab==='function'){
        if(it.sec.id==='pipePlanSection' && it.sec.getAttribute('data-ry-view')!=='edit'){
          rySetTab(it.sec.id,'edit');
        }else if(it.sec.id==='tlPipePlanSection' && it.sec.getAttribute('data-ry-view')!=='ws'){
          rySetTab(it.sec.id,'ws');
        }
      }
      it.sec.setAttribute('data-ry-clean','0');
    }catch(err){}
    /* ★ 工具模式＝单视口切换：点导航直接换功能区，不做滚动定位。
       这里以前缺这条分支 —— 工具模式下其它功能区都是 display:none，
       锚点无处可跳，点击因此"完全没反应"。 */
    if(isTool()){
      /* rySetTab 会在目标未激活时自行切入；避免再激活一次并排队两次 resize。 */
      if(!it.sec.classList.contains('ry-active')) ryShowSection(it.sec, it.link);
      else activate(it.link);
      return;
    }
    /* 落点 = 区块顶 − 吸顶高度，**不再额外多减 14px**。
       吸顶区实际高 37px（.fn-nav 内容 36px + 1px 底边线），stickyOffset() 已按
       真实高度返回 37，减满 37 才能让功能区的上边正好贴上导航底边。
       原写法 `- stickyOffset() - 14` 会让落点再低 14px —— 上一个功能区的最后
       14px 就会从导航下方露出来，看起来像"上一个功能区串进了本功能区"。
       此处与 CSS 的 scroll-margin-top:calc(var(--fn-nav-h) + 1px) 完全一致。 */
    var top=it.sec.getBoundingClientRect().top + scrollYNow() - stickyOffset();
    if(top<0) top=0;
    jumpTo(top);
    activate(it.link);
  }
  /* [v511] 绑定去重：标记打在元素自身。RyFnNav.render() 重建会换掉元素，标记随旧元素
     一起消失 ⇒ 新元素下次会被重新绑上；没被重建的元素不会被绑第二次（不会双触发）。 */
  function bindNavItem(it){
    if(!it.link || it.link[NAV_BOUND]) return;
    it.link[NAV_BOUND]=true;
    it.link.addEventListener('click', function(e){ navItemClick(it, e); });
  }
  function bindAllNavItems(){ for(var bi=0;bi<items.length;bi++) bindNavItem(items[bi]); }
  bindAllNavItems();
  /* ★ [v511] 重建兜底（本次修复的关键）：#fnNav 是页面静态节点、自身不会被重建，
     只有它的 [data-ry-navitem] 后代被整体替换 ⇒ 盯住容器的 childList+subtree 即可覆盖
     任何一次重建（权益同步 / 插件接管 / 会员徽标重挂都走这条路）。
     回调只做「重收 + 补绑 + 恢复高亮」，用 setTimeout 合并同一轮 mount 的多次变更。 */
  var navRebuildTimer=null;
  function refreshNavItems(){
    items=collectItems(false);
    bindAllNavItems();
    /* 重建把 .active 一起带走了（高亮由本脚本维护，runye-nav.js 只负责建节点）——
       不补回来，权益同步一完成导航条就「全灭」，用户会以为坏了。 */
    var cur=document.querySelector('main > .ry-sec.ry-active');
    var lk=null;
    for(var ri=0;ri<items.length;ri++){ if(items[ri].sec===cur){ lk=items[ri].link; break; } }
    activate(lk);
    /* 非工具模式的高亮由滚动 spy() 维护，items 换代后重算一次 */
    if(!isTool() && typeof spy==='function') spy();
  }
  try{
    if(typeof MutationObserver==='function' && nav && nav.nodeType===1){
      var navObserver=new MutationObserver(function(){
        if(navRebuildTimer) return;
        navRebuildTimer=setTimeout(function(){ navRebuildTimer=null; try{ refreshNavItems(); }catch(err2){} },0);
      });
      navObserver.observe(nav,{childList:true,subtree:true});
    }
  }catch(err1){}

  var ticking=false;
  function spy(){
    ticking=false;
    var y=scrollYNow();
    var mark=y + stickyOffset() + 24;
    // 「概览」已从导航移除：未滚动到第一个区块之前，不高亮任何一项
    var current=null;
    for(var i=0;i<items.length;i++){
      if(items[i].sec.getBoundingClientRect().top + y <= mark) current=items[i];
    }
    var doc=document.documentElement;
    if(y + window.innerHeight >= doc.scrollHeight - 4) current=items[items.length-1];
    activate(current?current.link:null);
  }
  function onScroll(){
    if(ticking) return;
    ticking=true;
    if(window.requestAnimationFrame) window.requestAnimationFrame(spy);
    else setTimeout(spy, 50);
  }
  /* 工具模式下页面不滚动，滚动高亮无意义（高亮由 ryShowSection 维护） */
  if(!isTool()){
    window.addEventListener('scroll', onScroll);
    window.addEventListener('resize', spy);
    spy();
  } else {
    ryShowSection(document.querySelector('main > .ry-sec.ry-active') || items[0].sec, null);
  }
})();
