
/* —— v125（2026-09-23 用户要求）：标注线多选 + 尺寸调整保存开关 ——
   多选镜像水管多选交互（多选按钮 aria-pressed、无位移点击加选/取消、退出清空）；
   选择集/保存标志都是 window 级，尺寸拖动的按下点（简图 mousedown / ws 捕获 pointerdown / touch）
   在 tlInitDrag 内按 tlDimGroupFor 取组。保存开关持久化在 localStorage 'tl-dim-save'：
   开=点按钮即把当前 offs 写档（此后每次拖动结束也写）；关=清档（刷新即恢复初始位置）。 */
(function(){
  var mBtn=document.getElementById('tlDimMultiBtn'),sBtn=document.getElementById('tlDimSaveBtn');
  window._tlDimMulti=false;
  window._tlDimSel=[];
  try{window._tlDimSaveOn=localStorage.getItem('tl-dim-save')==='1';}catch(e){window._tlDimSaveOn=false;}
  function drawM(){
    if(!mBtn)return;
    var on=!!window._tlDimMulti;
    mBtn.classList.toggle('active',on);
    mBtn.setAttribute('aria-pressed',on?'true':'false');
    mBtn.textContent=on?'标注多选':'多选标注';   /* 2026-09-25 用户要求：激活态由「多选标注中 · 点此退出」缩短为「标注多选」，状态仍由 .active 深色表达 */
    mBtn.title=on
      ?'多选标注已开启：无位移地点尺寸线逐条加选/取消；拖动任一已选尺寸线时全部已选一起平移；点本按钮退出并清空选择'
      :'多选标注：开启后点尺寸线逐条加选（无位移点击），再点已选线取消；拖动任一已选尺寸线时全部已选一起平移';
  }
  function drawS(){
    if(!sBtn)return;
    var on=!!window._tlDimSaveOn;
    sBtn.classList.toggle('active',on);
    sBtn.setAttribute('aria-pressed',on?'true':'false');
    sBtn.textContent='标注保存';   /* 2026-09-24 用户要求：文字恒定，状态只由颜色(.active)表达；2026-09-25 用户要求改「标注保存」 */
    sBtn.title=on
      ?'已保存：尺寸拖动结果写入本地，刷新页面后仍保留（按钮深色）。再点一次取消并清除已保存数据（刷新即恢复初始位置）'
      :'未保存：尺寸拖动仅本次有效，刷新页面即恢复初始位置（按钮浅色）。点「标注保存」把当前调整写入本地（刷新后保留）';
  }
  /* 选择集同步到两份渲染：class 挂在 [data-dim] 组上，ws 克隆自简图时会一并带上 */
  window.tlDimSelSync=function(){
    var all=document.querySelectorAll('[data-dim]');
    for(var i=0;i<all.length;i++){
      var g=all[i],on=window._tlDimSel.indexOf(g.getAttribute('data-dim'))>=0;
      if(on)g.classList.add('tl-dimsel');else g.classList.remove('tl-dimsel');
    }
  };
  window.tlDimMultiToggle=function(){
    window._tlDimMulti=!window._tlDimMulti;
    if(!window._tlDimMulti){window._tlDimSel=[];window.tlDimSelSync();}
    drawM();
  };
  window.tlDimSaveToggle=function(){
    window._tlDimSaveOn=!window._tlDimSaveOn;
    try{
      localStorage.setItem('tl-dim-save',window._tlDimSaveOn?'1':'0');
      if(window._tlDimSaveOn&&window._tlDimState)localStorage.setItem('tl-dim-offs',JSON.stringify({sig:window._tlDimState.sig,offs:window._tlDimState.offs}));
      else localStorage.removeItem('tl-dim-offs');
    }catch(e){}
    drawS();
  };
  drawM();drawS();
})();
