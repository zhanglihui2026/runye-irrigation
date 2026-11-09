
(function(){
  function el(id){ return document.getElementById(id); }
  var mainBtn=el('tlWsMain'), branchBtn=el('tlWsBranch'),
      hint=el('tlWsHint'),
      selInfo=el('tlWsSelInfo'), lenBtn=el('tlWsLenBtn'), delBtn=el('tlWsDelBtn'),
      /* 2026-09-18 第七十轮：⊞三通 / 🔩阀门（选中自动管线才临时出现）已取消，改为下面三个常驻按钮。 */
      fitValveBtn=el('tlWsFitValve'), fitTeeBtn=el('tlWsFitTee'), fitElbowBtn=el('tlWsFitElbow'), fitNodeBtn=el('tlWsFitNode'),
      moveResetBtn=el('tlWsMoveResetBtn'),
      fitDist=el('tlWsFitDist'), fitA=el('tlWsFitA'), fitB=el('tlWsFitB'),
      calBtn=el('tlWsCalBtn'), multiSep=el('tlWsMultiSep'), multiInfo=el('tlWsMultiInfo'),
      multiCalBtn=el('tlWsMultiCalBtn'), multiClearBtn=el('tlWsMultiClearBtn'), multiBtn=el('tlWsMultiBtn'),
      maskBtn=el('tlWsMaskBtn');   /* v162：管道遮蔽开关按钮 */
  var curAutoPid=null;
  /* [v824] 改按钮文字一律走这里：直接写 textContent 会连 RyIcons.decorate 挂的
     <svg class="ry-ico"> 一起清掉，按钮随即变空白（#ppLockArea 踩过同一个坑）。 */
  function setBtnLabel(b,t){ if(!b)return; if(window.RyIcons&&window.RyIcons.setLabel)window.RyIcons.setLabel(b,t); else b.textContent=t; }
  var HINT_IDLE='点「阀门/三通/弯头/节点」后再点管线即插入（弯头自动吸附到最近拐角/端头；节点=配件组合，点节点弹面板勾选配件、可两节点连线）；点击管线可选中，按住管线拖动可整条平移；总管按主管接入点分段，点选即选中所在段';
  function f1(v){ return (Math.round(v*10)/10).toFixed(1); }
  function refresh(m){
    if(mainBtn) mainBtn.classList.toggle('active', m==='main');
    if(branchBtn) branchBtn.classList.toggle('active', m==='branch');
    var cvn=document.querySelector('#tlWsContent .tl-ws-canvas');
    if(cvn) cvn.classList.toggle('tl-ws-inserting', !!m);
    if(hint) hint.textContent = m ? ('正在插入'+(m==='main'?'主管':'支管')+'：点击加点，双击/Enter 结束，Esc 取消') : HINT_IDLE;
  }
  /* 配件插入按钮态（2026-09-18 第七十轮）：与 drawMultiBtn 同理 —— 按钮态不由页面这
     一次点击决定，而由 RyTlWs.onFitModeChange 回推（进入画线/多选时会被模块内部自动踢出）。 */
  var FIT_BTNS={ valve:null, tee:null, elbow:null, node:null };
  var FIT_CN={ valve:'阀门', tee:'三通', elbow:'弯头', node:'节点' };
  function drawFitBtns(fm){
    Object.keys(FIT_BTNS).forEach(function(k){
      var b=FIT_BTNS[k]; if(!b) return;
      b.classList.toggle('active', fm===k);
      b.setAttribute('aria-pressed', fm===k?'true':'false');
    });
    var fcn=document.querySelector('#tlWsContent .tl-ws-canvas');
    if(fcn) fcn.classList.toggle('tl-ws-inserting', !!fm);
    if(hint && !(window.RyTlWs && RyTlWs.mode && RyTlWs.mode())) {
      hint.textContent = fm
        ? ('正在插入'+FIT_CN[fm]+'：点击管线即在该处插入'+(fm==='elbow'?'（自动吸附到最近的拐角/端头）':'')+'，再点本按钮或 Esc 退出')
        : HINT_IDLE;
    }
  }
  FIT_BTNS.valve=fitValveBtn; FIT_BTNS.tee=fitTeeBtn; FIT_BTNS.elbow=fitElbowBtn; FIT_BTNS.node=fitNodeBtn;
  Object.keys(FIT_BTNS).forEach(function(k){
    var b=FIT_BTNS[k]; if(!b) return;
    b.addEventListener('click', function(){ if(window.RyTlWs && RyTlWs.setFitMode) RyTlWs.setFitMode(k); });
  });
  if(window.RyTlWs){
    /* 汇总（2026-09-15 阶段1）：条数 + 按类型长度自动加减 */
    /* 2026-09-24（用户取消「手工 N 条」汇总文字）：钩子保留为空，维持模块回调契约
       （核心层在手工管线增删时仍会调用）；汇总口径见 RyTlWs.totals()，水力计算不受影响。 */
    RyTlWs.onManualChange=function(n){};
    RyTlWs.onModeChange=refresh;   /* Esc 退出插入模式时同步按钮高亮 */
    RyTlWs.onFitModeChange=drawFitBtns;   /* 第七十轮：配件插入模式的进入/退出回推按钮高亮与提示 */
    /* 选中信息 → 工具栏按钮（2026-09-15 阶段1 手工；阶段2 扩展自动管线/配件） */
    RyTlWs.onPipeSelect=function(info){
      var isAuto = info && info.auto, isFit = info && info.fit, isManFit = info && info.manFit;
      if(selInfo) selInfo.style.display = info ? '' : 'none';
      if(calBtn) calBtn.style.display = isAuto ? '' : 'none';   /* 选中自动管线 → 工具轨「改直径」入口（第三十九轮） */
      if(multiSep) multiSep.style.display='none';
      if(multiInfo) multiInfo.style.display='none';
      if(multiCalBtn) multiCalBtn.style.display='none';
      if(multiClearBtn) multiClearBtn.style.display='none';
      if(isAuto) curAutoPid = info.id; else curAutoPid=null;
      if(lenBtn) lenBtn.style.display = (info && !isFit && !isManFit) ? '' : 'none';   /* 配件无可改长度 */
      if(delBtn){ delBtn.style.display = (info && !isAuto) ? '' : 'none';   /* 自动管线不可删除 */
        setBtnLabel(delBtn, (isFit || isManFit) ? '🗑 删除配件' : '🗑 删除选中'); }
      if(moveResetBtn) moveResetBtn.style.display = (isAuto && window.RyTlAutoEdits && window.RyTlAutoEdits.moveOf(info.id)) ? '' : 'none';
      if(fitDist) fitDist.style.display = isFit ? '' : 'none';   /* 选中配件：两侧距离输入框（阶段2b） */
      if(isFit && fitA && fitB){
        var tot=(info.pipeLen!=null)?info.pipeLen:(info.atM||0), at=info.atM||0;
        fitA.value=at.toFixed(1); fitB.value=Math.max(0,tot-at).toFixed(1);
      }
      var lenTxt = (info && info.len != null) ? info.len.toFixed(1)+'m' : '';   /* 配件无 len 字段（2026-09-15 修复 pageerror） */
      var calTxt = (isAuto && window.tlPipeCalText) ? window.tlPipeCalText(info.id) : '';   /* 右侧工具轨直接显示管径（第三十九轮 #65） */
      /* v165：总管选中时显示段 pid（front-N）——与遮蔽写入的键一致，排查时一眼对得上 */
      if(selInfo) selInfo.textContent = info ? ('已选 '+((info.segIndex!=null&&info.id==='front')?('front-'+info.segIndex):info.id)+' '+info.kindLabel+' '+(calTxt?calTxt+' ':'')+lenTxt) : '';
      if(hint && !RyTlWs.mode()) hint.textContent = info
        ? (isManFit ? ('已选配件 '+info.id+'（'+info.kindLabel+'，挂在 '+(info.pid||'')+' 上）：右键配件可接管道（默认 1m）/换向/删除；点空白处取消')
          : (isFit ? ('已选配件 '+info.id+'（'+info.kindLabel+' · '+(info.pipeName||info.pid)+'）：可在管上拖动，或用「距起点/距终点」精确定位，可删除；点空白处取消')
            : (isAuto ? ('已选 '+info.kindLabel+'（'+info.id+' '+info.len.toFixed(1)+'m'+(window.tlPipeCalText&&window.tlPipeCalText(info.id)?'，'+window.tlPipeCalText(info.id):'')+(window.tlPipeHfText&&window.tlPipeHfText(info.id)?'，'+window.tlPipeHfText(info.id):'')+'）：可改长/右键改管径（右键还有「遮蔽此管」），或用工具轨的「阀门/三通/弯头」按钮在管线任意位置插入配件'+(window.tlIsPipeSegHidden&&window.tlIsPipeSegHidden((info.segIndex!=null&&info.id==='front')?('front-'+info.segIndex):info.id)?'【当前已遮蔽：灰色虚线显示、不计入材料清单】':'')+(window.tlIsPipeSegHidden&&window.tlIsPipeSegHidden((info.segIndex!=null&&info.id==='front')?('front-'+info.segIndex):info.id)?'':'（遮蔽管道模式下再点一段即可只遮该段）')+'；点空白处取消')
              : ('已选中 '+info.id+'（'+info.kindLabel+' '+info.len.toFixed(1)+'m）：按住可整条拖动，或改长/删除；点空白处取消'))))
        : HINT_IDLE;
      /* [v1030] 原「选中管线 → 右侧统计表滚到对应分区」钩子随统计表整套删除（含其对端实现）。 */
    };
  }
  function bindMode(btn){
    if(!btn) return;
    btn.addEventListener('click', function(){
      if(!window.RyTlWs) return;
      refresh(RyTlWs.setMode(btn.getAttribute('data-ws-mode')));
    });
  }
  bindMode(mainBtn); bindMode(branchBtn);
  /* 横竖锁定（2026-09-16）：画线新点约束水平/垂直；按住 Shift 临时反向 */
  var orthoBtn=el('tlWsOrtho');
  if(orthoBtn) orthoBtn.addEventListener('click', function(){
    if(!window.RyTlWs) return;
    var on=RyTlWs.setOrtho(!RyTlWs.ortho());
    orthoBtn.classList.toggle('active', on);
    var md=RyTlWs.mode();
    if(hint && md) hint.textContent='正在插入'+(md==='main'?'主管':'支管')+'：点击加点，双击/Enter 结束，Esc 取消'
      +(on?'；横竖锁定开：新点只能水平/垂直（按住 Shift 临时解除）':'');
  });
  var u=el('tlWsUndo'); if(u) u.addEventListener('click', function(){ if(window.RyTlWs) RyTlWs.undo(); });
  var c=el('tlWsClear'); if(c) c.addEventListener('click', function(){ if(window.RyTlWs) RyTlWs.clearManual(); });
  if(lenBtn) lenBtn.addEventListener('click', function(){
    if(!window.RyTlWs) return;
    var info=RyTlWs.getSelected(); if(!info) return;
    var v=prompt('新总长度（米）——前段保持不动，末段沿原方向拉伸/收缩', info.len.toFixed(1));
    if(v===null) return;
    var num=parseFloat(v);
    if(!RyTlWs.setSelLength(num)) alert('改长失败：请输入大于前段总长的正数（当前前段已占 '+info.len.toFixed(1)+'m 中的固定部分）');
  });
  if(moveResetBtn) moveResetBtn.addEventListener('click', function(){
    if(!window.RyTlAutoEdits) return;
    var info=RyTlWs.getSelected(); if(!info) return;
    RyTlAutoEdits.clearMove(info.id, 'ws');
    moveResetBtn.style.display='none';
  });
  if(delBtn) delBtn.addEventListener('click', function(){
    if(!window.RyTlWs) return;
    var info=RyTlWs.getSelected();
    if(info && info.fit) RyTlWs.deleteSelFit(); else RyTlWs.deleteSelected();
  });
  /* 两侧距离输入（阶段2b）：改任一侧，另一侧自动补齐（和=当前有效管长） */
  function wsFitInput(which){
    if(!window.RyTlWs) return;
    var info=RyTlWs.getSelected(); if(!info || !info.fit || info.pipeLen==null) return;
    var v=parseFloat((which==='a'?fitA:fitB).value); if(!isFinite(v)||v<0) return;
    RyTlWs.moveSelFit(which==='a' ? v : info.pipeLen - v);
  }
  if(fitA) fitA.addEventListener('change', function(){ wsFitInput('a'); });
  if(fitB) fitB.addEventListener('change', function(){ wsFitInput('b'); });
  /* 选中自动管线 → 工具轨「改直径」按钮（2026-09-17 第三十九轮）：与右键改径等效 */
  if(calBtn) calBtn.addEventListener('click', function(){
    if(!window.RyTlWs || !curAutoPid) return;
    var r=calBtn.getBoundingClientRect();
    if(RyTlWs.onAutoPipeContextMenu) RyTlWs.onAutoPipeContextMenu(curAutoPid, r.left, r.bottom);
  });
  /* 同类型管道多选（2026-09-17 第三十九轮）：整体改径 + 长度求和面板 */
  if(multiCalBtn) multiCalBtn.addEventListener('click', function(){
    if(!window.RyTlWs || !RyTlWs.getSelSet) return;
    var set=RyTlWs.getSelSet(); if(!set || !set.length) return;
    var r=multiCalBtn.getBoundingClientRect();
    if(RyTlWs.onAutoPipeContextMenu) RyTlWs.onAutoPipeContextMenu(set, r.left, r.bottom);
  });
  if(multiClearBtn) multiClearBtn.addEventListener('click', function(){ if(window.RyTlWs && RyTlWs.clearSelSet) RyTlWs.clearSelSet(); });
  RyTlWs.onMultiSelect=function(setInfo){
    var show = !!(setInfo && setInfo.count>=1);
    if(multiSep) multiSep.style.display = show ? '' : 'none';
    if(multiInfo) multiInfo.style.display = show ? '' : 'none';
    if(multiCalBtn) multiCalBtn.style.display = show ? '' : 'none';
    if(multiClearBtn) multiClearBtn.style.display = show ? '' : 'none';
    if(show && multiInfo){
      var tlabel = setInfo.type==='front'?'总管':(setInfo.type==='main'?'主管':'支管');
      multiInfo.textContent = '已选 '+setInfo.count+' 段 · 合计 '+setInfo.totalLen.toFixed(1)+' m · '+tlabel;
    }
    if(show){   /* 多选态：隐藏单选中才用的按钮，避免歧义 */
      if(lenBtn) lenBtn.style.display='none';
      if(delBtn) delBtn.style.display='none';
      if(moveResetBtn) moveResetBtn.style.display='none';
      if(fitDist) fitDist.style.display='none';
      if(calBtn) calBtn.style.display='none';
      if(selInfo) selInfo.style.display='none';
    }
  };
  /* 多选管道开关（2026-09-17 第五十八轮，用户要求「工具轨加一个控制按钮，点了我就能多选管道」）：
     按钮态由 RyTlWs.onMultiMode 回推 —— 因为「进插入模式自动退出多选」是工作区模块内部决定的，
     页面不能只认自己那次点击。文案写「动作」：未开 →「多选管道」，已开 →「多选中 · 点此退出」
     （2026-09-28 用户：按钮前缀图标取消，纯文字更简洁）。 */
  function drawMultiBtn(on){
    if(!multiBtn) return;
    /* [v797 合并多选] 用户要求：「管道多选按钮 跟标注多选按钮 合并成一个，功能就是
       多选功能」。按钮态 = 联合状态（管道多选 或 标注多选 任一开启即高亮）；
       标注侧变化经 tlMultiSyncUI（inline-25 drawM 回灌）走到这里统一渲染。 */
    var pipeOn = (typeof on==='boolean') ? on : !!(window.RyTlWs && RyTlWs.isMultiMode && RyTlWs.isMultiMode());
    var unified = pipeOn || !!window._tlDimMulti;
    multiBtn.classList.toggle('active', !!unified);
    multiBtn.setAttribute('aria-pressed', unified?'true':'false');
    setBtnLabel(multiBtn, unified ? '多选中 · 点此退出' : '多选');
    multiBtn.title = unified
      ? '多选已开启：点管身逐段加选管道（同类型），点尺寸线逐条加选标注；再点已选对象取消该段；点空白清空管道选择；点本按钮退出并清空两侧选择'
      : '多选：开启后点管身逐段加选管道（同类型），点尺寸线逐条加选标注；选中后旁边弹出信息卡可改管径、看长度累加；Ctrl/⌘ + 点管身可直接加选（无需开启）';
  }
  window.tlWsMultiToggle=function(){
    if(!window.RyTlWs || !RyTlWs.setMultiMode) return;
    RyTlWs.setMultiMode(!RyTlWs.isMultiMode());
  };
  /* [v797 合并多选] 统一入口：任一已开 → 全关（清空两侧选择集）；全关 → 全开。
     点管身加选管道、点尺寸线加选标注，两侧交互各自不变。 */
  window.tlMultiToggle=function(){
    var pipeOn = !!(window.RyTlWs && RyTlWs.isMultiMode && RyTlWs.isMultiMode());
    var dimOn = !!window._tlDimMulti;
    var target = !(pipeOn || dimOn);
    if(window.RyTlWs && RyTlWs.setMultiMode) RyTlWs.setMultiMode(target);
    if(!!window._tlDimMulti !== target){
      if(typeof window.tlDimMultiToggle==='function'){ try{ window.tlDimMultiToggle(); }catch(e){} }
    }
  };
  window.tlMultiSyncUI=function(){ try{ drawMultiBtn(); }catch(e){} };
  /* v162：管道遮蔽开关（2026-09-29 用户要求）—— 与 drawMultiBtn 同一套路：按钮态由
     RyTlWs.onMaskMode 回推（进画线/配件插入/多选时工作区内部会自动退出遮蔽模式，
     页面不能只认自己那次点击）。文案写「动作」：未开 →「遮蔽管道」，已开 →「遮蔽中 · 点此退出」。 */
  function drawMaskBtn(on){
    if(!maskBtn) return;
    maskBtn.classList.toggle('active', !!on);
    maskBtn.setAttribute('aria-pressed', on?'true':'false');
    setBtnLabel(maskBtn, on ? '遮蔽中 · 点此退出' : '遮蔽管道');
    maskBtn.title = on
      ? '遮蔽已开启：点管身即切换该管的遮蔽/取消遮蔽（不进入拖动）；被遮蔽的管道灰色虚线显示且不计入材料清单；Esc 或再点本按钮退出'
      : '遮蔽管道：开启后点管身切换该管的遮蔽/取消遮蔽；被遮蔽的管道以灰色虚线显示，且不计入材料清单（管长/管径/三通与阀门件数/该管上的节点配件）';
    if(hint && window.RyTlWs && RyTlWs.isMaskMode && RyTlWs.isMaskMode()){
      hint.textContent = '正在遮蔽管道：点管身切换该管「遮蔽/取消遮蔽」（被遮蔽的管灰色虚线、不计入材料清单）；右键管身也有同样一项；Esc 或再点本按钮退出';
    }
  }
  window.tlWsMaskToggle=function(){
    if(!window.RyTlWs || !RyTlWs.setMaskMode) return;
    RyTlWs.setMaskMode(!RyTlWs.isMaskMode());
  };
  if(window.RyTlWs){
    RyTlWs.onMultiMode=drawMultiBtn;
    drawMultiBtn(RyTlWs.isMultiMode ? RyTlWs.isMultiMode() : false);
    drawFitBtns(RyTlWs.fitMode ? RyTlWs.fitMode() : null);
    RyTlWs.onMaskMode=drawMaskBtn;   /* v162 */
    drawMaskBtn(RyTlWs.isMaskMode ? RyTlWs.isMaskMode() : false);
  }
})();
  /* 标注显隐开关（2026-09-28 用户要求）：三级工作区标注文字（区号/尺寸/亩数 <text>）隐藏/显示。
     隐藏后不遮挡周边图形；标注 text 层 pointer-events 已由 CSS 常驻禁用 —— 显示时也不拦截点击。 */
  function tlWsLabelsToggle(){
    if(!window.RyTlWs || typeof RyTlWs.toggleLabels!=='function') return;
    var off = RyTlWs.toggleLabels();
    /* 工具栏🖍按钮已取消（2026-09-28 用户：只留做图区右上角勾选一处）——只同步勾选框
       （程序赋值不触发 change，无死循环） */
    var chk=document.getElementById('tlWsLabelsChk');
    if(chk){ chk.checked=!off; }
    /* 勾选文字恒为「标注显示」，不随显隐切换（2026-09-28 用户：勾=显示，取消=隐藏，文字不变） */
  }
  /* 勾选框联动（2026-09-28 用户要求：做图区右上角勾选式标注显隐）：
     change → 与工具栏🖍按钮同一 toggle 入口（状态一致时不触发，防程序同步造成死循环）；
     位置对齐画布右上角：右侧面板宽度可变 → ResizeObserver(#tlWsContent) 跟随
     （#tlWsContent 是静态元素本体，innerHTML 重建不换元素 —— observer 无需重挂）。 */
  (function(){
    var chk=document.getElementById('tlWsLabelsChk');
    if(!chk) return;
    chk.addEventListener('change', function(){
      if(!window.RyTlWs || typeof RyTlWs.labelsOff!=='function') return;
      if(!!chk.checked === !!RyTlWs.labelsOff()) tlWsLabelsToggle();
    });
    var wrap=chk.parentElement, ctn=document.getElementById('tlWsContent');
    if(!wrap || !ctn) return;
    var pane=wrap.closest('.ry-pane-ws');
    if(!pane) return;
    var zoneWrap=document.getElementById('tlWsZoneChkWrap');
    var worstWrap=document.getElementById('tlWsWorstChkWrap');
    /* [v1012 2026-11-08 用户要求] 固定覆盖层三块布局：左上 #tlWsOvHeader 地块面积信息、
       底部中间 #tlWsOvLegend 图例、左下 #tlWsOvLengths 主管/支管长度 + 布管方向提示。
       v641 曾把图例挪到画布右下角，本轮改回「画布水平居中」——但仍必须按**画布**矩形算，
       不能按整个 .ry-pane-ws 算：它是三列栅格（画布 1fr ｜ 拖拽条 6px ｜ 工具轨），
       直接写 right:8px 会压工具轨按钮，直接写 left:50% 会偏到工具轨中线。
       left = (cr.left - pr.left) + cr.width/2，transform:translateX(-50%)；
       bottom = (pane.bottom - canvas.bottom) + 8 ⇒ 工具轨宽度/窗口缩放/手机端纵向布局自动跟随。
       左下块贴画布左缘 12px，max-width 按「图例左缘 − 24px」避让，窄画布自动换行。 */
    /* [v1021 2026-11-08 用户截图「主管/支管文字底下还有东西」] v1018 的强制重画只检测
       left/bottom **位置**变化，漏了第二类触发：**内容变化**——数值刷新（改长/改径后
       「1815.5 m」变短变长）、布管方向提示行增删（容器高度变）、maxWidth 变化（文字
       换行宽度变）都会让旧帧文字从新内容底下露出来，而此时位置没动、v1018 检测不触发。
       修复：改用共享旗标 _ovRepaintNeeded，三块覆盖层（legend/lengths/header）的
       位置、内容、宽度任一变化都置位，末尾统一对 #tlWsOverlays 同帧摘挂强制重画
       （同步执行无闪烁；全都没变时不做，零开销）。 */
    var _ovRepaintNeeded=false;
    function tlAlignWsOverlays(){
      try{
        var lg=document.getElementById('tlWsOvLegend'), len=document.getElementById('tlWsOvLengths');
        /* [v1012] 定位基准 = 覆盖层当前的 offsetParent：统一绘图工作区会把 #tlWsOverlays
           搬进 .ry-drawing-canvas（≈画布），旧分栏时代则是 .ry-pane-ws（含工具轨）。
           直接写死 pane 会在前者里把 left 算成 +365px、图例跑到画布外。 */
        var ov=document.getElementById('tlWsOverlays');
        var host=(ov&&ov.offsetParent)?ov.offsetParent:pane;
        var pr=host.getBoundingClientRect(), cr=ctn.getBoundingClientRect();
        if(pr.width<40) return;
        /* [v1012] 统一绘图工作区里 #tlWsContent 自身被相机 transform 缩放/平移
           （transform-origin:0 0），它的 getBoundingClientRect 会随缩放变化，
           **不能**拿来当固定层的定位基准。此时覆盖层与它同父（.ry-drawing-canvas），
           画布可见区就是这个父容器，直接用它的矩形：图例居中、左下贴 12/12px。
           旧分栏（覆盖层相对 .ry-pane-ws，含工具轨）才按 ctn 换算，沿用 v641 那套。 */
        var isShared=!!(host.classList&&host.classList.contains('ry-drawing-canvas'));
        /* [v1012b] 取消白底后 padding 一并去掉，文字下沿比原来下沉 4px ⇒
           bottom 8→12px 补回视觉高度（与 index.html 首帧兜底保持一致）。 */
        var baseL=isShared?0:Math.max(0,cr.left-pr.left);
        var baseB=isShared?12:Math.max(12,pr.bottom-cr.bottom+12);
        var baseW=isShared?pr.width:cr.width;
        if(lg){
          var _lgPrevL=parseFloat(lg.style.left), _lgPrevB=parseFloat(lg.style.bottom);
          lg.style.left=(baseL+baseW/2)+'px';
          lg.style.transform='translateX(-50%)';
          lg.style.right='auto';
          lg.style.bottom=baseB+'px';
          if(isFinite(_lgPrevL)&&
             (Math.abs(_lgPrevL-(baseL+baseW/2))>0.5||Math.abs(_lgPrevB-baseB)>0.5)) _ovRepaintNeeded=true;
        }
        if(len){
          var _lenPrevL=parseFloat(len.style.left), _lenPrevB=parseFloat(len.style.bottom);
          var _lenPrevW=parseFloat(len.style.maxWidth);
          len.style.left=(baseL+12)+'px';
          len.style.bottom=baseB+'px';
          var lgW=(lg&&lg.getBoundingClientRect().width)||308;
          len.style.maxWidth=Math.max(150,Math.floor((baseW-lgW)/2-24))+'px';
          if(isFinite(_lenPrevL)&&
             (Math.abs(_lenPrevL-(baseL+12))>0.5||Math.abs(_lenPrevB-baseB)>0.5||
              !isFinite(_lenPrevW)||Math.abs(_lenPrevW-parseFloat(len.style.maxWidth))>0.5)) _ovRepaintNeeded=true;
        }
        /* [v1012c] 「分区角度」悬浮卡是 rypDraggable：用户把它从顶部拖到图面下部后，
           原先只有 ResizeObserver 会重算对齐 ⇒ 信息块停在旧的避让位。这里补三路重算：
           卡片 style/class 变化（拖拽写行内坐标）、pointerup（拖拽结束兜底）、窗口 resize。
           [v1012c→v1017] 页眉水平**恒贴画布左缘 12px**（贴左侧工具栏边）：
           v1012c 的「地块分区快捷条在场则水平右移」分支取消 —— 用户实测页眉被推到
           画布中部（右移量封顶 = 画布 50%，正是截图里文字偏离的样子），拍板文字贴左优先
           （与 v1016「图面文字第一优先级」同口径）。垂直仍贴工具栏下沿 +8px 不变。 */
        var hd=document.getElementById('tlWsOvHeader');
        if(hd){
          var baseTop=pr.top+8;
          try{
            var tools=document.querySelector('.ry-drawing-toolbar');
            if(tools){ var tb=tools.getBoundingClientRect(); if(tb.height>0&&tb.bottom>baseTop) baseTop=tb.bottom+8; }
          }catch(eTop){}
          var _hdPrevT=parseFloat(hd.style.top), _hdPrevL=parseFloat(hd.style.left);
          hd.style.top=Math.max(6,Math.round(baseTop-pr.top))+'px';
          hd.style.left=Math.round(baseL+12)+'px';
          if(isFinite(_hdPrevL)&&
             (Math.abs(_hdPrevL-Math.round(baseL+12))>0.5||Math.abs(_hdPrevT-Math.max(6,Math.round(baseTop-pr.top)))>0.5)) _ovRepaintNeeded=true;
        }
        if(_ovRepaintNeeded){
          _ovRepaintNeeded=false;
          try{
            var _ovRepaint=document.getElementById('tlWsOverlays');
            if(_ovRepaint){ _ovRepaint.style.display='none'; void _ovRepaint.offsetHeight; _ovRepaint.style.display='block'; }
          }catch(eOvRepaint){}
        }
      }catch(e){}
    }
    window.tlAlignWsOverlays=tlAlignWsOverlays;
    window.tlAlignWsOvLegend=tlAlignWsOverlays;   /* 兼容 v641 旧调用点 */

    /* [v1012] 左下「主管/支管长度」单一数据源 = window.tlFigParamLines(computeThreeLevel())：
       ods = 图面加权代表径、lens = AE.effPts() 有效几何逐段累加的全地块实际长度，与材料清单 /
       简图参数行 / 水力页完全同口径。主管方向调整、图面改长/改径/平移/遮蔽都会改变 lens，
       因此必须实时刷新，不能只在生成时写死一次。 */
    function tlRefreshWsOverlays(){
      var box=document.getElementById('tlWsOvLengths');
      if(!box) return;
      var html='';
      try{
        var r=(typeof window.computeThreeLevel==='function')?window.computeThreeLevel():null;
        var pl=(r&&typeof window.tlFigParamLines==='function')?window.tlFigParamLines(r):null;
        function f1(v){ var n=Number(v); return (v!==null&&v!==undefined&&v!==''&&isFinite(n))?n.toFixed(1):'—'; }
        var odM=pl?pl.ods.main:(r&&r.mainPipe?r.mainPipe.od:'—');
        var odB=pl?pl.ods.branch:(r&&r.branchPipe?r.branchPipe.od:'—');
        var lM=pl?pl.lens.main:(r?r.mainLenUsed:null);
        var lB=pl?pl.lens.branch:(r?r.branchLenUsed:null);
        html='<div>主管 Ø '+odM+' mm · '+f1(lM)+' m</div>'
            +'<div>支管 Ø '+odB+' mm · '+f1(lB)+' m</div>';
      }catch(eLen){ html='<div style="color:#64748b">主管 / 支管长度：生成管线图后显示</div>'; }
      var hint=String(window.__tlWsAxisHint||'');
      if(hint) html+='<div style="margin-top:2px;color:#92400e;font-weight:600;font-size:10.5px;line-height:1.45">'+hint+'</div>';
      /* [v1021] 内容变化（数值刷新/提示行增删）也置位强制重画旗标——v1018 只管位置变化，
         文字底下旧帧（用户截图「主管/支管文字底下还有东西」）正是内容变化触发的。
         同值重写不置位，拖动时无谓重画为零。 */
      if(box.innerHTML!==html) _ovRepaintNeeded=true;
      box.innerHTML=html;
      tlAlignWsOverlays();
    }
    window.tlRefreshWsOverlays=tlRefreshWsOverlays;

    /* 图面编辑订阅：RyTlAutoEdits 的 len/caliber/move/hidden/batch 任何一次 notify 都代表
       有效几何变了 ⇒ 左下长度可能变。rAF 合并同一帧的多次通知，避免拖动时每帧反复
       computeThreeLevel。方向参数改变后「生成管线图」由 inline-09 覆盖层填充处直接调用本函数。 */
    try{
      var _ae=window.RyTlAutoEdits;
      if(_ae&&typeof _ae.onChange==='function'){
        var _ovPending=false;
        _ae.onChange(function(){
          if(_ovPending)return; _ovPending=true;
          (window.requestAnimationFrame||function(fn){return setTimeout(fn,0);})(function(){
            _ovPending=false; tlRefreshWsOverlays();
          });
        });
      }
    }catch(eOvSub){}
    /* [v1012c] 「分区角度」悬浮卡是 rypDraggable：用户把它从顶部拖到图面下部后，
       原先只有 ResizeObserver 会重算对齐 ⇒ 信息块停在旧的避让位。这里补三路重算：
       卡片 style/class 变化（拖拽写行内坐标）、pointerup（拖拽结束兜底）、窗口 resize。 */
    try{
      var _alignPending=false;
      var alignSoon=function(){
        if(_alignPending)return; _alignPending=true;
        (window.requestAnimationFrame||function(fn){return setTimeout(fn,0);})(function(){
          _alignPending=false; tlAlignWsOverlays();
        });
      };
      var quickEl=document.getElementById('ppQuickBar');
      if(quickEl&&window.MutationObserver){
        new MutationObserver(alignSoon).observe(quickEl,{attributes:true,attributeFilter:['style','class']});
      }
      window.addEventListener('pointerup',alignSoon);
      window.addEventListener('resize',alignSoon);
    }catch(eDragObs){}
    try{ window.addEventListener('load',function(){ tlRefreshWsOverlays(); tlAlignWsOverlays(); }); }catch(eOvLoad){}
    function tlAlignLabelsChk(){
      try{
        var pr=pane.getBoundingClientRect(), cr=ctn.getBoundingClientRect();
        if(cr.width<40) return;
        var r=Math.max(8,(pr.right-cr.right)+8), t=Math.max(8,(cr.top-pr.top)+8);
        wrap.style.right=r+'px'; wrap.style.top=t+'px';
        if(zoneWrap){ zoneWrap.style.right=r+'px'; zoneWrap.style.top=(t+28)+'px'; }
        if(worstWrap){ worstWrap.style.right=r+'px'; worstWrap.style.top=(t+56)+'px'; }
      }catch(e){}
      tlAlignWsOverlays();
    }
    if(window.ResizeObserver){ try{ new ResizeObserver(tlAlignLabelsChk).observe(ctn); }catch(e){} }
    tlAlignLabelsChk();
  })();
  /* 地块文字独立勾选框联动（2026-09-28）：change → toggleZoneLabels，与"标注显示"互不影响 */
  (function(){
    var chk=document.getElementById('tlWsZoneChk');
    if(!chk) return;
    chk.addEventListener('change', function(){
      if(!window.RyTlWs || typeof RyTlWs.toggleZoneLabels!=='function') return;
      var off=RyTlWs.toggleZoneLabels();
      /* 勾选文字恒为「地块文字」，不随显隐切换（2026-09-28 用户：文字不变） */
    });
  })();
  /* 最远水路勾选框联动（2026-09-28）：change → tlWorstPathToggle（原右侧工具轨按钮取消）；
     状态一致时不重复触发（防程序同步回写造成死循环） */
  (function(){
    var chk=document.getElementById('tlWsWorstChk');
    if(!chk) return;
    chk.addEventListener('change', function(){
      if(typeof window.tlWorstPathIsOn!=='function') return;
      if(!!chk.checked === !!window.tlWorstPathIsOn()) return;
      tlWorstPathToggle();
    });
  })();
