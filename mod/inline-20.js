
/* ============================================================================
   05 三级管路 —— 左参数栏宽度可拖拽（与 04 二级 .pp-grip-side 同一套做法）
   ----------------------------------------------------------------------------
   1. 运行时在 #tlPipePlanSection .pp-body 的「参数栏」与「图纸区」之间注入
      .pp-grip-side（占既有网格第 2 列 10px，不额外占宽）；
   2. 拖动改写 #tlPipePlanSection 上的 --pp-side-w（三级网格本就消费该变量），
      rAF 节流派发 window resize 让图纸/工作区自适应；
   3. 松手写 localStorage(runye_tl_panel_w)，双击恢复默认响应式宽度；
   4. 窄屏（≤1100px）CSS 隐藏拖拽条；输出模式（clean="1"）由 12.2 段隐藏并收 0。
   ============================================================================ */
(function(){
  var sec=document.getElementById('tlPipePlanSection');
  if(!sec) return;
  var body=sec.querySelector('.pp-body');
  if(!body) return;
  var side=document.getElementById('tlSide');
  var stage=body.querySelector('.pp-stage');
  if(!side||!stage) return;
  if(body.querySelector('.pp-grip-side')) return;   /* 防重复注入 */

  var KEY='runye_tl_panel_w';
  var MIN_SIDE=200,MAX_SIDE=560,CANVAS_MIN=320;
  function clampNum(v,lo,hi){ v=parseFloat(v); if(isNaN(v)) return null; return Math.max(lo,Math.min(hi,v)); }
  function loadWs(){ try{ return JSON.parse(localStorage.getItem(KEY))||{}; }catch(e){ return {}; } }
  function saveWs(o){ try{ localStorage.setItem(KEY,JSON.stringify(o)); }catch(e){} }
  function maxSide(){
    var inner=body.clientWidth-28;                  /* 减 .pp-body 左右 padding(14×2) */
    return Math.max(MIN_SIDE,Math.min(MAX_SIDE,inner-10-CANVAS_MIN));
  }
  function applySide(px){ if(px==null) sec.style.removeProperty('--pp-side-w'); else sec.style.setProperty('--pp-side-w',px+'px'); }

  var saved=clampNum(loadWs().side,MIN_SIDE,MAX_SIDE);
  if(saved) applySide(Math.min(saved,maxSide()));

  var pend=false;
  function refit(){
    if(pend) return; pend=true;
    var run=function(){ pend=false; try{ window.dispatchEvent(new Event('resize')); }catch(e){} };
    if(window.requestAnimationFrame) window.requestAnimationFrame(run); else setTimeout(run,16);
  }

  var g=document.createElement('div');
  g.className='pp-grip pp-grip-side';
  g.title='拖动调整参数栏宽度 · 双击恢复默认';
  g.setAttribute('role','separator');
  g.setAttribute('aria-orientation','vertical');
  body.insertBefore(g,stage);

  var EV=window.PointerEvent?{down:'pointerdown',move:'pointermove',up:'pointerup',cancel:'pointercancel'}:{down:'mousedown',move:'mousemove',up:'mouseup',cancel:'blur'};
  var drag=null;
  g.addEventListener(EV.down,function(e){
    if(e.button!=null&&e.button!==0) return;        /* 只响应左键 */
    drag={x:e.clientX,sideW:side.getBoundingClientRect().width};
    g.classList.add('dragging');
    document.body.classList.add('pp-col-resizing');
    if(e.preventDefault) e.preventDefault();
  });
  document.addEventListener(EV.move,function(e){
    if(!drag) return;
    var w=clampNum(drag.sideW+(e.clientX-drag.x),MIN_SIDE,maxSide());
    if(w!=null) applySide(w);
    refit();
  });
  function endDrag(){
    if(!drag) return;
    drag=null;
    g.classList.remove('dragging');
    document.body.classList.remove('pp-col-resizing');
    var o=loadWs();
    o.side=Math.round(side.getBoundingClientRect().width);
    saveWs(o);
    refit();
  }
  document.addEventListener(EV.up,endDrag);
  document.addEventListener(EV.cancel,endDrag);
  window.addEventListener('blur',endDrag);
  g.addEventListener('dblclick',function(){ var o=loadWs(); delete o.side; saveWs(o); applySide(null); refit(); });
  window.addEventListener('resize',function(){
    if(drag) return;
    var s=clampNum(loadWs().side,MIN_SIDE,MAX_SIDE);
    if(s) applySide(Math.min(s,maxSide()));
  });
})();
