
/* ============================================================================
   04 二级管路 —— 参数栏 / 工具轨 宽度可拖拽（仿天正功能区拖宽）
   ----------------------------------------------------------------------------
   做法（纯附加，不改任何既有 id、事件绑定与计算逻辑）：
   1. 运行时在 .pp-body 的「参数栏」与「图纸区」之间注入 .pp-grip-side，
      在 .pp-stage 的「画布列」与「工具轨」之间注入 .pp-grip-tool；
      两条拖拽条各占网格里一个 10px 的列（原来这 10px 是列间距 gap），不额外占宽。
   2. 拖动时改写 #pipePlanSection 上的 CSS 变量 --pp-side-w / --pp-tool-w，
      grid-template-columns 直接消费变量 → 列宽即时变化；
      并用 rAF 节流派发 window resize，复用页面现成的 ppResize() 重算画布像素尺寸与
      比例（ppUpdateTransform + ppRender），所以拖动过程中图纸是「边拖边自适应」。
   3. 松手写入 localStorage(runye_pp_panel_w)，下次进入自动恢复；双击拖拽条恢复默认自适应宽度。
   4. 窄屏（≤1100px）时 .pp-grip 被 CSS 隐藏，且本段不写任何内联宽度 → 上下自然流零影响。
   ============================================================================ */
(function(){
  var sec=document.getElementById('pipePlanSection');
  if(!sec) return;
  function directChild(parent,cls){
    if(!parent) return null;
    for(var i=0;i<parent.children.length;i++){
      if(parent.children[i].classList&&parent.children[i].classList.contains(cls)) return parent.children[i];
    }
    return null;
  }
  var body=directChild(sec,'pp-body');
  if(!body) return;
  var side=directChild(body,'pp-side');
  var stage=directChild(body,'pp-stage');
  var tool=document.getElementById('ppToolbar');
  if(!side||!stage||!tool) return;

  var KEY='runye_pp_panel_w';
  /* 拖拽边界：下限保证字段/按钮不被压瘪，上限保证画布不被挤没；
     MAX_SIDE / MAX_TOOL 是硬上限，实际可用上限还会按当前版心宽度动态收紧。 */
  var MIN_SIDE=200,MAX_SIDE=560,MIN_TOOL=92,MAX_TOOL=280;
  var CANVAS_MIN=320;                 /* 给画布+另一侧留的最小宽度 */

  function clampNum(v,lo,hi){
    v=parseFloat(v);
    if(isNaN(v)) return null;
    return Math.max(lo,Math.min(hi,v));
  }
  function loadWs(){ try{ return JSON.parse(localStorage.getItem(KEY))||{}; }catch(e){ return {}; } }
  function saveWs(o){ try{ localStorage.setItem(KEY,JSON.stringify(o)); }catch(e){} }

  function maxSide(){
    var inner=body.clientWidth-28;                              /* 减去 .pp-body 左右 padding(14×2) */
    return Math.max(MIN_SIDE,Math.min(MAX_SIDE,inner-10-CANVAS_MIN));
  }
  function maxTool(){
    return Math.max(MIN_TOOL,Math.min(MAX_TOOL,stage.clientWidth-10-CANVAS_MIN));
  }
  function applySide(px){ if(px==null) sec.style.removeProperty('--pp-side-w'); else sec.style.setProperty('--pp-side-w',px+'px'); }
  function applyTool(px){ if(px==null) sec.style.removeProperty('--pp-tool-w'); else sec.style.setProperty('--pp-tool-w',px+'px'); }

  /* 启动即恢复上次拖出的宽度（越界会被夹回合法区间） */
  var ws=loadWs();
  var savedSide=clampNum(ws.side,MIN_SIDE,MAX_SIDE);
  var savedTool=clampNum(ws.tool,MIN_TOOL,MAX_TOOL);
  if(savedSide) applySide(Math.min(savedSide,maxSide()));
  if(savedTool) applyTool(Math.min(savedTool,maxTool()));

  /* rAF 节流：拖拽中每帧最多重算一次画布尺寸 */
  var pend=false;
  function refit(){
    if(pend) return; pend=true;
    var run=function(){ pend=false; try{ window.dispatchEvent(new Event('resize')); }catch(e){} };
    if(window.requestAnimationFrame) window.requestAnimationFrame(run); else setTimeout(run,16);
  }

  function makeGrip(cls,label){
    var g=document.createElement('div');
    g.className='pp-grip '+cls;
    g.title=label;
    g.setAttribute('role','separator');
    g.setAttribute('aria-orientation','vertical');
    return g;
  }
  var gripSide=makeGrip('pp-grip-side','拖动调整参数栏宽度 · 双击恢复默认');
  var gripTool=makeGrip('pp-grip-tool','拖动调整工具条宽度 · 双击恢复默认');
  body.insertBefore(gripSide,stage);      /* 插在参数栏与图纸区之间（列 2） */
  /* 工具轨拖拽条要挂在「真正承载网格的那一层」。
     Tab 改造后工具条被包进 .ry-pane-edit（网格也随之下移），若仍挂在 .pp-stage，
     它会成为 .pp-stage 竖向 flex 里的一个 0 高度项 → 既看不见也 hover 不到，
     工具轨宽度就拖不动了。找到 .ry-pane-edit 就挂进去，找不到则维持原行为。 */
  var paneEdit=null;
  for(var pi=0;pi<stage.children.length;pi++){
    var ch=stage.children[pi];
    if(ch.classList&&ch.classList.contains('ry-pane-edit')){ paneEdit=ch; break; }
  }
  (paneEdit||stage).appendChild(gripTool); /* 插在画布列与工具轨之间（列 2） */

  var EV=window.PointerEvent
    ? {down:'pointerdown',move:'pointermove',up:'pointerup',cancel:'pointercancel'}
    : {down:'mousedown',move:'mousemove',up:'mouseup',cancel:'blur'};
  var drag=null;

  function beginDrag(e,kind,grip){
    if(e.button!=null&&e.button!==0) return;             /* 只响应左键 */
    drag={kind:kind,grip:grip,x:e.clientX,
          sideW:side.getBoundingClientRect().width,
          toolW:tool.getBoundingClientRect().width};
    grip.classList.add('dragging');
    document.body.classList.add('pp-col-resizing');
    if(e.preventDefault) e.preventDefault();             /* 阻止拖拽时选中文字/原生拖影 */
  }
  function onMove(e){
    if(!drag) return;
    var dx=e.clientX-drag.x;
    if(drag.kind==='side'){
      var w=clampNum(drag.sideW+dx,MIN_SIDE,maxSide());
      if(w!=null) applySide(w);
    }else{
      var w2=clampNum(drag.toolW-dx,MIN_TOOL,maxTool());  /* 向左拖＝工具轨变宽 */
      if(w2!=null) applyTool(w2);
    }
    refit();
  }
  function endDrag(){
    if(!drag) return;
    var kind=drag.kind,grip=drag.grip;
    drag=null;
    grip.classList.remove('dragging');
    document.body.classList.remove('pp-col-resizing');
    /* 只持久化「本次拖过的那一侧」：另一侧保持 var() 缺省 → 继续走响应式 clamp */
    var o=loadWs();
    if(kind==='side') o.side=Math.round(side.getBoundingClientRect().width);
    else o.tool=Math.round(tool.getBoundingClientRect().width);
    saveWs(o);
    refit();
  }
  function bind(grip,kind){
    grip.addEventListener(EV.down,function(e){ beginDrag(e,kind,grip); });
    grip.addEventListener('dblclick',function(){
      var o=loadWs();
      if(kind==='side'){ delete o.side; applySide(null); }
      else{ delete o.tool; applyTool(null); }
      saveWs(o); refit();
    });
  }
  bind(gripSide,'side');
  bind(gripTool,'tool');
  document.addEventListener(EV.move,onMove);
  document.addEventListener(EV.up,endDrag);
  document.addEventListener(EV.cancel,endDrag);
  window.addEventListener('blur',endDrag);   /* 指针移出窗口后松手收不到 up/cancel，兜底收尾 */

  /* 窗口尺寸变化后把已拖出的宽度重新夹回合法区间（拖拽进行中不干预，否则会跟手打架） */
  window.addEventListener('resize',function(){
    if(drag) return;
    var o=loadWs();
    var s=clampNum(o.side,MIN_SIDE,MAX_SIDE), t=clampNum(o.tool,MIN_TOOL,MAX_TOOL);
    if(s) applySide(Math.min(s,maxSide()));
    if(t) applyTool(Math.min(t,maxTool()));
  });
})();
