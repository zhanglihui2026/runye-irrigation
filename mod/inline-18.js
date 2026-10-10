
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

  var items=[];
  Array.prototype.slice.call(nav.querySelectorAll('.fn-link')).forEach(function(a){
    var id=a.getAttribute('data-target');
    // 无 data-target 的是普通站内页链接（如「滴灌带查询」）：原样保留，不参与滚动高亮
    if(!id) return;
    var sec=document.getElementById(id);
    if(!sec){ if(a.parentNode) a.parentNode.removeChild(a); return; }
    // 目标区块被 display:none 隐藏时（页面已隐藏「管网布置」「数据对比」），同步从导航剔除。
    // 例外：工具模式下所有非当前功能区都是 display:none，但它们是本模式管理的功能区
    //       （带 .ry-sec），必须保留在导航里，否则切一次导航就被清空。
    if(sec.offsetParent===null && !(isTool() && sec.classList.contains('ry-sec'))){
      if(a.parentNode) a.parentNode.removeChild(a); return;
    }
    a.setAttribute('href','#'+id);
    items.push({link:a, sec:sec});
  });
  if(!items.length) return;

  var links=items.map(function(it){ return it.link; });

  function stickyOffset(){
    var h=head?head.getBoundingClientRect().height:0;
    return h + nav.getBoundingClientRect().height;
  }
  function activate(link){
    links.forEach(function(a){ a.classList.toggle('active', a===link); });
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
    if(window.RyMobile && window.RyMobile.isActive() && sec && window.RyMobile.sections.indexOf(sec.id)<0) sec=document.getElementById('pipePlanSection');
    /* [v193] 成组地块拦截三级页入口（与 rySetTab 里的拦截互为兜底） */
    if(sec && sec.id==='tlPipePlanSection' && typeof ryGroupThirdLevelGuard==='function' && ryGroupThirdLevelGuard())return;
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
    window.scrollTo(0,0);
    /* 隐藏期间量到的画布宽度是 0，显示后必须让各画布重算尺寸。
       地块绘制的 atResizeCanvas（window resize）与二级管路的 ppResize 都监听 resize，
       等下一帧再发，确保布局已按新的 display 重排。 */
    function refit(){
      try{ window.dispatchEvent(new Event('resize')); }catch(err){}
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

  items.forEach(function(it){
    it.link.addEventListener('click', function(e){
      e.preventDefault();
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
         try/catch：此处任何异常都会中断整个 forEach，后续导航项将全部失绑。 */
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
      if(isTool()){ ryShowSection(it.sec, it.link); return; }
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
    });
  });

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
