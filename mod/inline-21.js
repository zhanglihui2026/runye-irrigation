
/* ============================================================================
   03 地块绘制 —— 左属性栏宽度可拖拽（.at-grip）
   ----------------------------------------------------------------------------
   与 04 二级管路的 .pp-grip 同一套做法（纯附加，不改任何既有 id、事件绑定与计算逻辑）：
   1. 运行时在 .at-main 里、.at-sidebar 与 .at-canvas-wrap 之间注入 .at-grip（占 8px）；
   2. 拖动改写 #areaTool 上的 CSS 变量 --at-side-w，左栏宽度即时变化；
      并用 rAF 节流派发 window resize，复用页面现成的 atResizeCanvas() 重算画布
      像素尺寸并重绘 —— 左栏变宽则画布变窄，画布内容随之重排，不裁切。
   3. 松手写入 localStorage(runye_at_side_w)，下次进入自动恢复；
      双击拖拽条清除变量 → 回到默认（工具模式 272px / 普通模式 280px）。
   4. 窄屏（≤768px）左栏改为顶部横向排布，CSS 隐藏拖拽条且本段不写变量 → 零影响。
   ============================================================================ */
(function(){
  var sec=document.getElementById('areaTool');
  if(!sec) return;
  var main=sec.querySelector('.at-main');
  if(!main) return;
  var side=main.querySelector('.at-sidebar');
  var wrap=main.querySelector('.at-canvas-wrap');
  if(!side||!wrap) return;

  var KEY='runye_at_side_w';
  /* 下限保证字段/按钮不被压瘪；上限保证画布不被挤没（画布至少留 CANVAS_MIN） */
  var MIN_SIDE=200,MAX_SIDE=560,CANVAS_MIN=320,GRIP_W=8;

  function clampNum(v,lo,hi){ v=parseFloat(v); if(isNaN(v)) return null; return Math.max(lo,Math.min(hi,v)); }
  function loadW(){ try{ return JSON.parse(localStorage.getItem(KEY))||{}; }catch(e){ return {}; } }
  function saveW(o){ try{ localStorage.setItem(KEY,JSON.stringify(o)); }catch(e){} }
  function maxSide(){ return Math.max(MIN_SIDE,Math.min(MAX_SIDE,main.clientWidth-GRIP_W-CANVAS_MIN)); }
  function applySide(px){ if(px==null) sec.style.removeProperty('--at-side-w'); else sec.style.setProperty('--at-side-w',px+'px'); }

  /* 启动即恢复上次拖出的宽度（越界会被夹回合法区间） */
  var saved=clampNum(loadW().side,MIN_SIDE,MAX_SIDE);
  if(saved) applySide(Math.min(saved,maxSide()));

  /* rAF 节流：拖拽中每帧最多重算一次画布 */
  var pend=false;
  function refit(){
    if(pend) return; pend=true;
    var run=function(){ pend=false; try{ window.dispatchEvent(new Event('resize')); }catch(e){} };
    if(window.requestAnimationFrame) window.requestAnimationFrame(run); else setTimeout(run,16);
  }

  var grip=document.createElement('div');
  grip.className='at-grip';
  grip.title='拖动调整工具栏宽度 · 双击恢复默认';
  grip.setAttribute('role','separator');
  grip.setAttribute('aria-orientation','vertical');
  main.insertBefore(grip,wrap);

  var EV=window.PointerEvent
    ? {down:'pointerdown',move:'pointermove',up:'pointerup',cancel:'pointercancel'}
    : {down:'mousedown',move:'mousemove',up:'mouseup',cancel:'blur'};
  var drag=null;

  grip.addEventListener(EV.down,function(e){
    if(e.button!=null&&e.button!==0) return;             /* 只响应左键 */
    drag={x:e.clientX,w:side.getBoundingClientRect().width};
    grip.classList.add('dragging');
    document.body.classList.add('at-col-resizing');
    if(e.preventDefault) e.preventDefault();             /* 阻止拖拽时选中文字 */
  });
  function onMove(e){
    if(!drag) return;
    var w=clampNum(drag.w+(e.clientX-drag.x),MIN_SIDE,maxSide());
    if(w!=null) applySide(w);
    refit();
  }
  function endDrag(){
    if(!drag) return;
    drag=null;
    grip.classList.remove('dragging');
    document.body.classList.remove('at-col-resizing');
    var o=loadW(); o.side=Math.round(side.getBoundingClientRect().width); saveW(o);
    refit();
  }
  grip.addEventListener('dblclick',function(){
    var o=loadW(); delete o.side; saveW(o); applySide(null); refit();
  });
  document.addEventListener(EV.move,onMove);
  document.addEventListener(EV.up,endDrag);
  document.addEventListener(EV.cancel,endDrag);
  window.addEventListener('blur',endDrag);             /* 指针移出窗口后松手收不到 up/cancel，兜底收尾 */

  /* 窗口尺寸变化后把已拖出的宽度重新夹回合法区间（拖拽进行中不干预，否则跟手打架） */
  window.addEventListener('resize',function(){
    if(drag) return;
    var s=clampNum(loadW().side,MIN_SIDE,MAX_SIDE);
    if(s) applySide(Math.min(s,maxSide()));
  });
})();
