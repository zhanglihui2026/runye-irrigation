
/* ═══ 14b. CAD 全局工具栏（2026-09-14；视口切换条已取消，切视口走旧入口） ═══
   仅真实浏览器（matchMedia 为原生函数）+ body.ry-tool 下接管；闸门 VM 桩 / Node
   环境零动作。接管 = 把 #ppSide / #tlSide 原节点移入 #ryCadSide
   对应分组（节点携带全部 id 与事件，业务 JS 不感知）；退出工具模式原样搬回。
   搬回用 insertBefore 时必须校验参照节点仍在原父节点内 —— 否则先搬回的那个还
   挂在工具栏里，会抛 NotFoundError；故倒序搬回 + 参照节点失效则退化为 append。 */
(function(){
  'use strict';
  function nativeOk(){ try{ return /native code/.test(String(window.matchMedia)); }catch(err){ return false; } }
  if(!nativeOk()) return;

  var HOSTS=[
    {sec:'pipePlanSection',   side:'ppSide',    grp:'ryCadGrpPipe'},
    {sec:'tlPipePlanSection', side:'tlSide',    grp:'ryCadGrpTl'}
  ];
  var W_SHUT=40, W_DEF=318, W_MIN=220, GAP=1;
  /* 展开宽度：用户拖过 → localStorage 记忆（栏宽）；没拖过 wOpen=null，
     不写任何变量，走 CSS 默认 318px（默认视觉逐像素不变）。 */
  var wOpen=null;
  try{
    var _w=parseInt(localStorage.getItem('ryCadWOpen'),10);
    if(_w>=W_MIN&&_w<=Math.max(W_MIN,Math.floor((window.innerWidth||1600)*0.46)-16)) wOpen=_w;
  }catch(err){}
  var memo={};

  function $(id){ return document.getElementById(id); }
  function isTool(){ return !!(document.body && document.body.classList.contains('ry-tool')); }
  function refit(){ try{ window.dispatchEvent(new Event('resize')); }catch(err){} }
  function railOpen(){ var s=$('ryCadSide'); return !!s && s.getAttribute('data-ry-open')!=='0'; }
  function applyWidth(){
    try{
      /* main 让位 = 左距 1 + 栏宽（2026-09-14 用户要求贴边 1px；折叠 40+1=41） */
      document.body.style.setProperty('--ry-cad-w',
        (railOpen()?((wOpen||W_DEF)+GAP):(W_SHUT+GAP))+'px');
    }catch(err){}
    if(wOpen!=null){
      try{ var s=$('ryCadSide'); if(s) s.style.setProperty('--ry-cad-w-open', wOpen+'px'); }catch(err){}
    }
    var g=$('ryCadSideGrip');
    if(g) g.setAttribute('aria-expanded', railOpen()?'true':'false');
  }

  function moveIn(){
    var changed=false;
    for(var i=0;i<HOSTS.length;i++){
      var h=HOSTS[i], side=$(h.side), grp=$(h.grp), sec=$(h.sec);
      if(!side||!grp||!sec) continue;
      if(side.getAttribute('data-ry-inrail')==='1'){
        if(sec.getAttribute('data-ry-rail')!=='1'){ sec.setAttribute('data-ry-rail','1'); changed=true; }
        continue;
      }
      memo[h.side]={parent:side.parentNode, next:side.nextSibling};
      var box=grp.querySelector('[data-host="'+h.side+'"]')||grp;
      box.appendChild(side);
      side.setAttribute('data-ry-inrail','1');
      sec.setAttribute('data-ry-rail','1');
      changed=true;
    }
    applyWidth();
    if(changed) refit();
  }

  function moveBackOne(h){
    var side=$(h.side), m=memo[h.side];
    if(!side||!m) return false;
    var p=m.parent;
    if(p&&p.parentNode){
      var ref=(m.next&&m.next.parentNode===p)?m.next:null;
      p.insertBefore(side, ref);
    }
    side.removeAttribute('data-ry-inrail');
    var sec=$(h.sec); if(sec) sec.removeAttribute('data-ry-rail');
    delete memo[h.side];
    return true;
  }

  function moveBack(){
    var changed=false;
    for(var i=HOSTS.length-1;i>=0;i--){ if(moveBackOne(HOSTS[i])) changed=true; }
    if(changed) refit();
  }

  /* 视口切换条已取消（2026-09-14 用户要求）：切视口由顶部导航 / 底部状态栏承担。
     分组初始默认折叠；切到某管路页时随动展开对应分组。
     仅在视口变化那一次触发；用户收起工具栏后不被反复顶开（除非再切视口）。 */
  var lastSpec=null;
  function syncAutoExpand(){
    var cur=curSec();
    var spec=cur;
    var el=$(cur);
    if(el&&el.getAttribute('data-ry-view')) spec=cur+':'+el.getAttribute('data-ry-view');
    if(lastSpec===null){ lastSpec=spec; return; }
    if(spec===lastSpec) return;
    lastSpec=spec;
    ensureFor(spec);
  }

  /* 当前功能区 id：优先 body[data-ry-sec]，为空时回退读 .ry-active
     （首屏 ryShowSection 可能尚未写入，否则切换条会一开始不显示） */
  function curSec(){
    var s=document.body.getAttribute('data-ry-sec')||'';
    if(s) return s;
    var a=document.querySelector('main > .ry-sec.ry-active');
    return a?a.id:'';
  }
  /* 工具栏显示门控（2026-09-14 用户要求）：只在二级管路 / 三级管路
     两个区块显示；地块绘制与其他功能区不显示、不让位。ry-cad-vp 驱动
     工栏显隐与 main 左让位（顶部让位已随视口切换条一并取消）。 */
  var VPS=['pipePlanSection','tlPipePlanSection'];
  /* 系统图视图排除（2026-09-14 用户要求）：三级管路切到「系统图」（data-ry-view="sys"）
     时左栏已整体让位给满屏系统图，工具栏跟随隐藏；切回三级简图/设计自动恢复。
     rySetTab 改 data-ry-view 后由 MutationObserver 触发 syncAll，显隐自动跟随。 */
  function inVp(){
    if(VPS.indexOf(curSec())<0) return false;
    if(curSec()==='tlPipePlanSection'){
      var el=$(curSec());
      if(el&&el.getAttribute('data-ry-view')==='sys') return false;
    }
    return true;
  }
  function syncVp(){ document.body.classList.toggle('ry-cad-vp', inVp()); }
  function syncAll(){ if(isTool()&&inVp()){ moveIn(); } else { moveBack(); } syncVp(); syncAutoExpand(); }

  /* 切到某管路页 → 工具栏自动展开 + 对应分组互斥展开：
     点二级管路展开二级分组、点三级管路展开三级分组，**其余分组同时折叠**。
     分组初始默认折叠
     （verify 9e 把关），仅在视口变化那一次触发；用户随后收起不被反复顶开
     （除非再切视口，那时按新目标重新互斥）。 */
  var GRP_FOR={'pipePlanSection':'ryCadGrpPipe','tlPipePlanSection':'ryCadGrpTl'};
  var ALL_GRPS=['ryCadGrpPipe','ryCadGrpTl','ryCadGrpTerrain'];
  function ensureFor(spec){
    try{
      if(!inVp()) return;
      var side=$('ryCadSide');
      if(side&&side.getAttribute('data-ry-open')==='0'){
        side.setAttribute('data-ry-open','1');
        try{ localStorage.setItem('ryCadOpen','1'); }catch(err){}
        applyWidth(); refit();
      }
      var s=spec||'';
      var g=GRP_FOR[s.split(':')[0]];
      for(var i=0;i<ALL_GRPS.length;i++){
        var d=$(ALL_GRPS[i]); if(!d) continue;
        if(ALL_GRPS[i]===g){ if(!d.hasAttribute('open')) d.setAttribute('open','open'); }
        else if(d.hasAttribute('open')) d.removeAttribute('open');
      }
    }catch(err){}
  }

  function toggleRail(){
    var side=$('ryCadSide'); if(!side) return;
    var open=side.getAttribute('data-ry-open')!=='0';
    side.setAttribute('data-ry-open', open?'0':'1');
    try{ localStorage.setItem('ryCadOpen', open?'0':'1'); }catch(err){}
    applyWidth(); refit();
  }

  function bind(){
    var side=$('ryCadSide');
    if(side&&!side.getAttribute('data-ry-bound')){
      side.setAttribute('data-ry-bound','1');
      try{ side.setAttribute('data-ry-open', localStorage.getItem('ryCadOpen')==='1'?'1':'0'); }
      catch(err){ side.setAttribute('data-ry-open','0'); }
      side.addEventListener('click',function(e){
        /* 分组内点击（勾选/输入/展开某组/编辑面板）不折叠整栏。
           ★ 必须用 e.composedPath() 判断：编辑面板的按钮处理器会先重渲染面板
           （innerHTML 替换），等 click 冒泡到本栏时 e.target 已脱离文档，
           e.target.closest('.ry-cad-grp') 会返回 null 而误触发折叠。 */
        var inGrp=false;
        try{
          var p=(e.composedPath&&e.composedPath())||[];
          for(var i=0;i<p.length;i++){
            var n=p[i];
            if(n&&n.classList&&(n.classList.contains('ry-cad-grp')||n.classList.contains('iso-editor'))) { inGrp=true; break; }
          }
        }catch(err){}
        if(inGrp) return;
        if(e.target&&e.target.closest&&e.target.closest('.ry-cad-grp')) return;
        toggleRail();
      });
    }
    /* 宽度拖拽：右缘把手按住左右拖，实时改宽 + rAF 让画布重排；松手 localStorage 记忆。
       拖动期间给把手打 .ry-wdrag 高亮；没拖过不写任何变量（默认视觉不变）。 */
    var wg=$('ryCadWGrip');
    if(wg&&!wg.getAttribute('data-ry-wbound')){
      wg.setAttribute('data-ry-wbound','1');
      var dragPid=null;
      wg.addEventListener('pointerdown',function(e){
        dragPid=e.pointerId;
        try{ wg.setPointerCapture(e.pointerId); }catch(err){}
        try{ wg.classList.add('ry-wdrag'); }catch(err){}
        e.preventDefault();
      });
      wg.addEventListener('pointermove',function(e){
        if(dragPid===null||e.pointerId!==dragPid) return;
        var side2=$('ryCadSide'); if(!side2) return;
        var max=Math.max(W_MIN,Math.floor((window.innerWidth||1600)*0.46)-16);
        var lx=side2.getBoundingClientRect().left;
        wOpen=Math.min(max,Math.max(W_MIN,Math.round(e.clientX-lx)));
        applyWidth();
        if(window.requestAnimationFrame) requestAnimationFrame(refit); else refit();
      });
      function endDrag(){
        if(dragPid===null) return;
        dragPid=null;
        try{ wg.classList.remove('ry-wdrag'); }catch(err){}
        try{ if(wOpen!=null) localStorage.setItem('ryCadWOpen',String(wOpen)); }catch(err){}
        applyWidth(); refit();
      }
      wg.addEventListener('pointerup',endDrag);
      wg.addEventListener('pointercancel',endDrag);
    }
    try{
      var mo=new MutationObserver(function(){
        var run=function(){ try{ syncAll(); }catch(err){} };
        if(window.requestAnimationFrame) requestAnimationFrame(run); else setTimeout(run,16);
      });
      mo.observe(document.body,{attributes:true,attributeFilter:['class','data-ry-sec']});
      HOSTS.forEach(function(h){
        var el=$(h.sec); if(el) mo.observe(el,{attributes:true,attributeFilter:['data-ry-view','class']});
      });
    }catch(err){}
    /* 打印：左栏交还区块内，保证纸质版式与原契约一致 */
    try{
      window.addEventListener('beforeprint',function(){
        document.body.classList.remove('ry-cad-vp');   /* 打印不占顶部条 */
        moveBack();
      });
      window.addEventListener('afterprint',function(){ syncAll(); });
    }catch(err){}
    syncAll();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bind); else bind();
})();
