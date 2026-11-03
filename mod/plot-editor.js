/* [v420-split] 绘图编辑器（07 管路规划与施工简图 IIFE）—— 自 mod/inline-11.js 原样迁出（2026-10-14）。
   边界：本文件正文 = inline-11.js 原 402..4071 行逐字节搬运（CRLF 保留，零改写）。
   加载顺序铁律：必须紧跟 mod/inline-11.js 之后同步执行（index.html），不得提前/延后。
   依赖与公开 API 审计：见 _p1/_audit11_report.md。 */
// ===== 07 管路规划与施工简图 =====
/* [v889 2026-11-03 缓存守卫] zone-geometry.js 方向规则变更必须同步更新资源串和SW版本；
   弱网下 SW 静默回退旧缓存 / 旧标签页驻留旧脚本
   ⇒ 用户拿到旧方向逻辑，修复看起来「没生效」（用户三次报同一问题，本地探针全绿）。
   本文件在 index.html 中装载于 zone-geometry.js 之后，此处校验其数字版本：
   落后于页面要求 ⇒ 硬刷新一次；sessionStorage 防离线死循环（刷一次仍旧就放行，
   至少 console 里留下显式证据，不再无声错下去）。 */
  (function(){
    try{
      var need = 889;
      var g = window.RyZoneGeometry;
      var ver = (g && Number(g.VERSION)) || 0;
      if (ver < need) {
        var k = 'ryZgGateReloaded' + need;
        if (!window.sessionStorage || !window.sessionStorage.getItem(k)) {
          if (window.sessionStorage) window.sessionStorage.setItem(k, '1');
          window.location.reload();
          return;
        }
        try { console.warn('[ry:zone-geo-gate] RyZoneGeometry.VERSION=' + ver + ' 落后于页面要求 ' + need + '——缓存旧文件在跑，布管方向可能仍按旧规则（刷新或清缓存后消失）'); } catch (eWarn) {}
      }
    }catch(eGate){}
  })();
(function(){
  var ppCanvas=document.getElementById('ppCanvas');
  var ppCtx=ppCanvas.getContext('2d');
  var ppWrap=document.getElementById('ppCanvasWrap');
  var ppHintEl=document.getElementById('ppHint');
  var ppToolbar=document.getElementById('ppToolbar');
  var ppEmpty=document.getElementById('ppEmpty');
  var ppLegend=document.getElementById('ppLegend');
  var ppPickResult=document.getElementById('ppPickResult');

  var ppState={
    mode:'main',
    mainPipes:[],branchPipes:[],subBranchPipes:[],source:null,valves:[],
    currentLine:[],polyPts:[],transform:null,hoverPt:null,mouseWorld:null,lastSVG:null,
    lineDrawMode:'free',
    pipeLevel:'two',
    pickedPipe:null,
    hiddenPipes:{main:{},branch:{},subbranch:{}},
    pipeIds:{main:[],branch:[],subbranch:[]},
    nextPipeId:1,
    zoneRotated:false,
    zoneAngleDeg:0,
    zoom:1, panX:0, panY:0, isPanning:false, panStartX:0, panStartY:0,
    cutOverrides:{x:{},y:{}},
    // 手动调整后的内部切割线位置快照（世界坐标，升序）；sig 用于识别基础划分是否变化
    cutSnap:{sig:'',x:null,y:null},
    mergePreview:null, // 拖动中待合并预览 {axis,index,target}
    dragCut:null,
    hoverCut:null,
    lastSelectedCut:null,
    areaLocked:false, // 分区面积锁定：开启后拖动/微调网格线只整体平移、各区面积不变（任务K 2026-09-26）
    zoneAuto:true,    // [v185] 地块划分开关：true=自动划分并显示分区线；false=隐藏自动分区线（改手动，见 ppSetZoneAuto）
    history:[]
  };
  /* 角度变化后，直到自动管线按新分区成功重建前，持续保留该标记。 */
  var ppAnglePipeRegenPending=false;

  /* [v201] 「此刻正在按**某一块自己的环**算分区」的临时开关。
     ★ 为什么还需要它（v197 只认 mode==='perPlot' 不够）：
        ① 整组态跑「自动管路」是逐块调 ppBuildAutoPipes —— 彼时 ge.mode 仍是
           'whole'，若无此开关就会拿**整组估算 dims** 去切每一块 ⇒ 同一块
           在整组态生成 36 根主管、切到逐块态却只有 14 根（实测），口径串了；
        ② 「成组管路」页画各块分区线走 RunyeBridge.zoneCutsFor(bb,…)，
           bb 就是那一块的 bbox ⇒ 同样必须按本块尺寸算。
       单地块 / 二级页整组视图不受影响（那条路径不置此标志）。 */
  var ppOwnDimOverride=false;
  var ppCutDragPreimage=null;
  var ppCutSinglePreimage=null;
  var ppCutStepPreimage=null;

  function ppGroupMemberPreimage(){
    var ge=window.__runyeGroupEdit;
    if(!ge||!ge.active||ge.mode!=='perPlot')return null;
    if(!Array.isArray(ge.slots)||!ge.slots[ge.current])return {index:ge.current,slot:null,invalid:true};
    var slot=ppCloneJSON(ge.slots[ge.current]);
    return slot?{index:ge.current,slot:slot,invalid:false}:{index:ge.current,slot:null,invalid:true};
  }
  function ppReadGroupMemberSlot(ge,index){
    if(!ge||!Array.isArray(ge.slots)||!Number.isInteger(index)||index<0||index>=ge.slots.length)return {ok:false};
    var work=window.__runyeGroupWork,adapter=window.RyDrawingDesignGroupAdapter;
    if(!work||!work.canonicalDesign)return {ok:true,canonical:false,slot:ge.slots[index]};
    var subs=window.__runyeSubPlots||[],memberIds=subs.map(function(plot){return String(plot&&plot.id||'');});
    if(memberIds.length!==ge.slots.length||!memberIds.every(function(id){return !!id;}))return {ok:false,canonical:true};
    var groupId='legacy-group:'+JSON.stringify(memberIds);
    if(work.canonicalGroupId!==groupId||!adapter||typeof adapter.toLegacyMemberSlot!=='function')return {ok:false,canonical:true};
    var projected=adapter.toLegacyMemberSlot(work.canonicalDesign,groupId,memberIds[index],ge.slots[index]);
    return projected&&projected.ok?{ok:true,canonical:true,slot:projected.slot}:{ok:false,canonical:true,error:projected&&projected.error};
  }
  function ppReadGroupMemberSlots(ge){
    if(!ge||!Array.isArray(ge.slots))return {ok:false,error:'group-slots-unavailable'};
    var slots=[];
    for(var i=0;i<ge.slots.length;i++){
      var read=ppReadGroupMemberSlot(ge,i);
      if(!read.ok){
        var error=read.error||'canonical-member-projection-failed';
        window.__runyeDrawingDesignShadow={ok:false,stage:'group-read',error:error,index:i};
        return {ok:false,error:error,index:i};
      }
      slots.push(read.slot);
    }
    return {ok:true,slots:slots};
  }
  function ppDiscardLatestHistoryEntry(){
    if(Array.isArray(ppState.history)&&ppState.history.length)ppState.history.pop();
  }
  function ppCommitGroupMemberEdit(preimage,reason){
    if(!preimage)return true;
    if(preimage.invalid||!preimage.slot)return false;
    if(ppSaveGroupMemberSlot(preimage.index,ppCaptureSlot()))return true;
    ppApplySlot(preimage.slot);
    if(reason!=='undo')ppDiscardLatestHistoryEntry();
    ppUpdateLockAreaBtn();
    if(typeof updatePlan==='function')updatePlan();
    ppUpdateTransform();ppRender();
    if(typeof window.ppRefreshTLAfterCuts==='function')window.ppRefreshTLAfterCuts();
    else if(typeof window.ppRefreshDiagramIfVisible==='function')window.ppRefreshDiagramIfVisible();
    console.warn('[plot-editor] group member transaction rejected');
    return false;
  }
  function ppCommitSinglePlotEdit(preimage,reason,refreshMaterials,refreshPlan){
    if(!preimage||typeof window.ryCommitSinglePlotL2Snapshot!=='function')return true;
    var after=window.ppGetState();
    var designKeys=['polyPts','mainPipes','branchPipes','subBranchPipes','source','valves','hiddenPipes','pipeIds','nextPipeId',
      'cutSnap','partitionCuts','cutOverrides','areaLocked','zoneAngleDeg','zoneRotated','zoneAuto','couplerNodes'];
    if(!designKeys.some(function(key){return JSON.stringify(preimage[key])!==JSON.stringify(after[key]);}))return true;
    var result=window.ryCommitSinglePlotL2Snapshot(preimage,after);
    if(result!==false){
      if(result===true){ppRefreshDiagramOrReset();if(refreshMaterials&&typeof ppRefreshMaterials==='function')ppRefreshMaterials();}
      return true;
    }
    if(reason!=='undo')ppDiscardLatestHistoryEntry();
    ppApplySlot(preimage);
    ppUpdateLockAreaBtn();
    if(refreshPlan&&typeof updatePlan==='function')updatePlan();
    ppUpdateTransform();ppRender();ppUpdateAutoPipeButton();ppRefreshDiagramOrReset();
    if(refreshMaterials&&typeof ppRefreshMaterials==='function')ppRefreshMaterials();
    console.warn('[plot-editor] single-plot '+reason+' transaction rejected');
    return false;
  }
  function ppCommitCutDragSnapshots(groupPreimage,singlePreimage,reason){
    if(groupPreimage&&!ppCommitGroupMemberEdit(groupPreimage))return false;
    return !singlePreimage||ppCommitSinglePlotEdit(singlePreimage,reason,true,true);
  }
  function ppCommitGroupMemberStep(preimage, nextStep, previousStep, discardHistoryOnReject){
    if(!preimage)return true;
    if(preimage.invalid||!preimage.slot)return false;
    var change={index:preimage.index,slot:ppCaptureSlot(),stepOverrides:nextStep,stepPreimage:previousStep};
    if(ppSaveGroupMemberSlots([change]))return true;
    if(discardHistoryOnReject)ppDiscardLatestHistoryEntry();
    ppApplySlot(preimage.slot);
    window.tlZoneStep=ppCloneJSON(previousStep)||{sig:'',x:{},y:{}};
    if(window.tlDiagramData&&window.tlDiagramData.zones){
      var old=window.tlZoneStep;
      window.tlDiagramData.zones.cutOffX=old&&Object.keys(old.x||{}).length?old.x:null;
      window.tlDiagramData.zones.cutOffY=old&&Object.keys(old.y||{}).length?old.y:null;
    }
    ppUpdateLockAreaBtn();
    if(typeof updatePlan==='function')updatePlan();
    ppUpdateTransform();ppRender();
    if(typeof window.ppRefreshTLAfterCuts==='function')window.ppRefreshTLAfterCuts();
    else if(typeof window.ppRefreshDiagramIfVisible==='function')window.ppRefreshDiagramIfVisible();
    console.warn('[plot-editor] group member step transaction rejected');
    return false;
  }

  function ppZoneAngle(){
    var a=Number(ppState.zoneAngleDeg);
    if(!isFinite(a)||Math.abs(a)<0.001)a=ppState.zoneRotated?90:0;
    a=((a+180)%360+360)%360-180;
    return Math.abs(a)<0.05?0:Math.round(a*10)/10;
  }
  function ppSyncZoneAngleUI(preserveInput){
    var a=ppZoneAngle(),input=document.getElementById('ppZoneAngleInput'),btn=document.getElementById('ppRotateZones');
    if(input&&!preserveInput)input.value=String(a);
    if(btn)btn.classList.toggle('active',Math.abs(a)>0.001);
  }
  function ppApplyZoneAngle(value,refreshPlan,preserveInput,preimageOverride){
    var a=Number(value);if(!isFinite(a))return false;
    a=((a+180)%360+360)%360-180;
    if(Math.abs(a)<0.05)a=0;
    a=Math.round(a*10)/10;
    var previousAngle=ppZoneAngle();
    var groupPreimage=refreshPlan?ppGroupMemberPreimage():null;
    if(groupPreimage&&groupPreimage.invalid)return false;
    var singlePreimage=refreshPlan&&!groupPreimage&&typeof window.ppGetState==='function'
      ?(preimageOverride||window.ppGetState()):null;
    ppUnlockArea();
    ppState.zoneAngleDeg=a;
    ppState.zoneRotated=Math.abs(Math.abs(a)-90)<0.001;
    /* updatePlan rebuilds the angle-dependent partition cuts and cut snapshot.
       Commit only after that rebuild, so the canonical before/after comparison
       sees one coherent L2 state instead of rejecting its own refreshed cuts. */
    if(refreshPlan&&typeof updatePlan==='function')updatePlan();
    if(groupPreimage&&!ppCommitGroupMemberEdit(groupPreimage)){
      ppSyncZoneAngleUI(preserveInput);
      return false;
    }
    if(singlePreimage&&typeof window.ryCommitSinglePlotL2Snapshot==='function'){
      var singleCommit=window.ryCommitSinglePlotL2Snapshot(singlePreimage,window.ppGetState());
      if(singleCommit===false){
        ppDiscardLatestHistoryEntry();
        ppApplySlot(singlePreimage);
        ppUpdateLockAreaBtn();
        ppSyncZoneAngleUI(preserveInput);
        if(typeof updatePlan==='function')updatePlan();
        ppUpdateTransform();ppRender();ppRefreshDiagramOrReset();
        console.warn('[plot-editor] single-plot canonical partition transaction rejected');
        return false;
      }
    }
    if(Math.abs(a-previousAngle)>0.001)ppAnglePipeRegenPending=true;
    ppSyncZoneAngleUI(preserveInput);
    ppRender();
    if(refreshPlan)ppRefreshDiagramOrReset();
    return true;
  }
  function ppGridFrame(poly,b,dims,angleDeg){
    var pts=poly||ppState.polyPts||[];if(!pts.length)return null;
    b=b||ppGetBounds();dims=dims||ppGetPlanDims(b);
    var sx=b.w>0?dims.w/b.w:1,sy=b.h>0?dims.h/b.h:1;
    var angle=(isFinite(Number(angleDeg))?Number(angleDeg):ppZoneAngle())*Math.PI/180,cs=Math.cos(angle),sn=Math.sin(angle);
    var c={x:dims.w/2,y:dims.h/2};
    function toGrid(p){var x=(p.x-b.minX)*sx-c.x,y=(p.y-b.minY)*sy-c.y;return{x:c.x+x*cs+y*sn,y:c.y-x*sn+y*cs};}
    function toWorld(p){var x=p.x-c.x,y=p.y-c.y,gx=c.x+x*cs-y*sn,gy=c.y+x*sn+y*cs;return{x:b.minX+gx/sx,y:b.minY+gy/sy};}
    var gp=pts.map(toGrid),gb={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};
    gp.forEach(function(p){gb.minX=Math.min(gb.minX,p.x);gb.minY=Math.min(gb.minY,p.y);gb.maxX=Math.max(gb.maxX,p.x);gb.maxY=Math.max(gb.maxY,p.y);});
    gb.w=gb.maxX-gb.minX;gb.h=gb.maxY-gb.minY;
    return{angle:(isFinite(Number(angleDeg))?Number(angleDeg):ppZoneAngle()),center:c,origin:{x:b.minX,y:b.minY},toGrid:toGrid,toWorld:toWorld,poly:gp,bounds:gb,scaleX:sx,scaleY:sy};
  }
  function ppCutPoint(cuts,x,y){return cuts&&cuts.frame?cuts.frame.toWorld({x:x,y:y}):{x:x,y:y};}
  function ppCutCanvas(cuts,x,y){var p=ppCutPoint(cuts,x,y);return ppToCanvas(p.x,p.y);}

  function ppGetPlanDims(b){
    /* [v197] 成组**逐块**模式：分区以「本块真实尺寸」为准（sx=sy=1）。
       ★★ 为什么（2026-10-04 用户实测截图抓到）：runyePlanDims 是按**回传时刻的
         实测面积**（整组）算的全局规划尺寸（如 650×420）；逐块编辑拿本块 bounds
         （如 300×400）去除以整组 dims ⇒ sx·sy≈块/整组面积比 ≈0.44
         ⇒ 「18 亩/区」实际切出 ≈7.9 亩的区（用户截图 6.4~8.9 亩），且区数按
         整组 dims 切（11×3），整组 9 区 vs 逐块 33 区对不上 —— 设定形同虚设。
       ⇒ 修在上游（v189 原则：改这里而不是改渲染）：逐块时 dims=本块 bounds，
         每区 = 固定边×另一边 = 真实的 18 亩；布管/材料/水力/三级页（走
         Bridge.getZoneCuts / getPlanDims）**全链路自动跟随**，无需各自改。
       ★ 单地块与整组模式不变：dims 本来就由实测面积推算（sx≈1），是设定口径；
         整组视图用户已认可（截图 1），不动。 */
    var gePer=window.__runyeGroupEdit;
    if((ppOwnDimOverride||(gePer&&gePer.active&&gePer.mode==='perPlot'))&&b&&b.w>0&&b.h>0){
      return { w:b.w, h:b.h };
    }
    var aEl=document.getElementById('planA');
    var bEl=document.getElementById('planB');
    var stDims=window.runyePlanDims||{};
    var planW=(isFinite(stDims.A)&&stDims.A>0)?stDims.A:parseFloat(aEl?aEl.textContent:'');
    var planH=(isFinite(stDims.B)&&stDims.B>0)?stDims.B:parseFloat(bEl?bEl.textContent:'');
    return {
      w:(isFinite(planW)&&planW>0)?planW:b.w,
      h:(isFinite(planH)&&planH>0)?planH:b.h
    };
  }

  function ppGetZoneLayout(b,planN){
    /* [v189 2026-10-03] 用户纠正口径（务必守住）：
       「地块划分」开关**关闭** = 该地块**完全不自动划分分区**（整块当一个区），
       而**不是**之前实现的「只是把分区线藏起来、数据照常算」。
       用户原话：「如果这个开关关闭之后，地块就不自动划分分区了，你修改过来。」
       ⇒ 做法：在最上游 ppGetZoneLayout 直接返回「1 列 × 1 行」的单区布局，
         于是所有下游（分区线渲染 / 分区数 / 面积 / 水力 / 材料 / 三级工作区）
         拿到的都是「一个区」，**天然全链路一致**，不会出现「画面是一个区、
         计算按四个区」这种自相矛盾。
       ⇒ 为什么改这里而不是改渲染：渲染只是末端；改末端会留下「数据仍是 4 区」
         的半吊子状态（正是上一版被用户否掉的那种做法）。
       ⇒ 三个开关口径的分工（别混）：
         · 本开关 = 要不要**自动划分**（关闭 → 不划，整块一区）；
         · 「调网格」= 自动划分之后，**手动微调**分区线位置；
         · 「重置网格」= 把分区线恢复成系统默认位置。
       ★★ 单位口径（v189 修正，踩过坑）：`zoneW/zoneH` 必须是 **plan 米**，
         而不是 `b.w/b.h`（后者是 SVG 像素包围盒）。原因：下游 `ppGetZoneCuts`
         拿 `zoneW/zoneH` 去和 `ppGetPlanDims()` 的 plan 米（planA/planB）做运算
         (`ppSplitLength(dims.w, xDesign)`)；单位一旦混用，像素值通常远大于 plan 米，
         `ppSplitLength` 的 `while` 会多切一刀 ⇒ 关闭分区后仍会残留 2 个分区（实测）。
       ★★ 第二个坑（也是实测踩到）：`ppGetZoneCuts` 里有**长短边互换**逻辑 ——
         `longIsX = dims.w >= dims.h; xDesign = longIsX ? shortSide : longSide;`
         ⇒ `xDesign` 取的是 `zoneW/zoneH` 里**较短**的那条！所以只把「对应轴」给足
         （如 zoneW=planW=600 / zoneH=planH=400）会被换成 xDesign=400 < 600
         ⇒ `ppSplitLength(600,400)` = [400,200] ⇒ **仍切 2 格**。
         ⇒ 正确做法：`zoneW/zoneH` **两条都给「整块的对角上限」**（≥ max(planW,planH)），
           这样无论长短边怎么互换，`ppSplitLength(total, step>=total)` 都只返回 1 段。
           取 `Math.hypot(w,h)` 作为统一的「比任何边都大」的安全上界，
           保证 `step ≥ total` 恒成立（hypot ≥ max(W,H) ≥ 任何单边）。 */
    if(!ppZoneAutoOn()){
      /* 取「根本不切」的等价布局：设计边长给「比整块任何边都大」的值，
         `ppSplitLength(total,total)` 的 `while(total-used > step+0.05)` 立即为假 ⇒ 返回 [total]（1 段）。
         ⇒ 1 × 1 = 1 个区，全链路一致。 */
      var _d0=ppGetPlanDims(b),_f0=ppGridFrame(ppState.polyPts,b,_d0),_gd0=_f0?_f0.bounds:_d0;
      var _big=Math.hypot(_gd0.w||1,_gd0.h||1);   // ≥ max(gridW,gridH)，不会残留自动切分
      return {
        cols:1, rows:1, N:1,
        zoneW:_big, zoneH:_big,
        drawZoneW:_big, drawZoneH:_big,
        zoneArea:(_gd0.w||1)*(_gd0.h||1), rotated:false,
        autoOff:true
      };
    }
    var dims=ppGetPlanDims(b),frame=ppGridFrame(ppState.polyPts,b,dims),gd=frame?frame.bounds:dims;
    var manualZoneMu=getManualPlanZoneMu(gd.w,gd.h);
    ppSyncManualZoneWarning(document.getElementById('planZoneMuManual'));
    var base=calcPlanZoneLayout(gd.w,gd.h,planN,manualZoneMu);
    var xDesign=base.designW,yDesign=base.designH;
    var cols=splitZoneLength(gd.w,xDesign).length;
    var rows=splitZoneLength(gd.h,yDesign).length;
    return {
      cols:cols,
      rows:rows,
      N:cols*rows,
      designW:xDesign, designH:yDesign,
      zoneW:base.zoneW,
      zoneH:base.zoneH,
      drawZoneW:base.drawZoneW,
      drawZoneH:base.drawZoneH,
      zoneArea:base.zoneArea,
      rotated:ppState.zoneRotated
    };
  }

  /* ============================================================================
     [v629 2026-10-20] 「地块分区只显示一半」的**真正根因**（此前三次都改错了地方）
     ----------------------------------------------------------------------------
     现象：用户反复反馈「地块分区怎么就显示一半」，并猜是「多层覆盖/嵌套」。
     但 v627 修的 .ry-pane 高度链是三级简图的事，与二级画布无关 —— 二级画布是
     <canvas>，它的内容由 ppUpdateTransform 的变换决定，不是 CSS 裁的。

     根因（无 CSS 参与）：
       ① 比例是写死的：`s = 0.5 * zoom`（1px=2m × zoom），代码里**没有任何**
          「内容是否装得下画布」的判断；
       ② zoom / panX / panY 又被 ppGetState/ppSetState 持久化进云端地块存档
          （plot-editor.js 3645 / 3731）⇒ 用户在做图区**滚一次滚轮**（wheel zoom
          1.1/0.9 一次一跳，很容易滚出 347%）或拖一次平移，这个状态就被永久记住，
          此后每次打开这个地块都是同一张「只看到一角」的图；
       ③ ppResize 只按容器尺寸重设画布，重算变换时**仍然沿用那个 zoom**。

     实测（_probe_pp_ink.mjs，读 canvas 像素算墨迹包围盒）：
       VW=1086 VH=581 ZOOM=3.47 → ink 触到画布上/下沿（gapTop=0、gapBottom=0），
       期望内容高 411px > 画布可用高 → 上下各切一刀，正是用户截图的样子。

     修法（只收口视图状态，不动任何绘制/分区/水力逻辑）：
       · ppContentSize() 算「scale=1 时内容多大」；
       · ppFitScale()   算「装进画布需要的 scale」；
       · ppClampViewToFit()  ★只缩不放★：装不下就退到装得下的比例并清平移。
         ppResize 里调用 ⇒ 每次进场 / 改窗口 / 切页回来都保证整幅可见；
         滚轮放大不受影响（wheel 走 ppUpdateTransform，不经过 ppResize）。
       · ppFitView() 一键「适应窗口」（可放大也可缩小），只给下面的小按钮用。
     ============================================================================ */
  var PP_VIEW_PAD=50;                 /* 与 ppUpdateTransform 里的 pad 同值 */
  /* ★ 画布是否已按容器**真量过**一次。
     坑（v629 自己踩到并修）：<canvas> 出厂默认 300×150。初始化顺序是
     `setTimeout(function(){ppResize();ppLoadPolygon();})`，而工具模式下 ppResize 在
     「本页还没激活」时会直接 return ⇒ ppLoadPolygon 拿到的仍是 300×150，
     按它算「装得下」会得出 zoom≈42% 并把用户存档里的正常比例**永久压小**。
     所以：只有真量过（宽高都 >60px）才允许收口。 */
  var ppSized=false;

  function ppContentSize(){
    if(!ppState.polyPts||!ppState.polyPts.length) return null;
    var b=ppGetBounds(),db=ppGetDisplayBounds(true);   /* [v652c] 适应窗口在逐块态框整组 */
    if(!b||!db) return null;
    var dims=ppGetPlanDims(b);
    var sx=b.w>0?dims.w/b.w:1, sy=b.h>0?dims.h/b.h:1;
    var w=db.w*sx, h=db.h*sy;
    if(!(w>0)||!(h>0)) return null;
    return {w:w,h:h};
  }
  function ppFitScale(){
    if(!ppSized) return null;                  /* 还没真量过容器 → 不给比例（见 ppSized 注释） */
    var m=ppContentSize(); if(!m) return null;
    var aw=ppCanvas.width-2*PP_VIEW_PAD, ah=ppCanvas.height-2*PP_VIEW_PAD;
    if(!(aw>8)||!(ah>8)) return null;          /* 画布还没量到尺寸（隐藏/首帧）→ 先不动 */
    var s=Math.min(aw/m.w, ah/m.h);
    /* [v784] 管线图层（三级施工图）存在时预留标注余量：syncCamera 相机锁定只保证「地块多边形」
       与底图重合，而施工图幅在地块外沿还有尺寸标注（下方 42 / 左侧 66 图幅px，旋转后左端更低），
       紧边 fit 会把它们推出画布被裁（用户实测：分区旋转后底部尺寸线左半段消失）。
       0.8 ≈ 两侧各留 10% 画布 —— 覆盖 42~66 图幅px × 锁定比例的常见区间。 */
    try{
      var _tld=window.tlDiagramData;
      if(_tld&&_tld.poly&&_tld.poly.length>2) s*=0.8;
    }catch(e){}
    return s;
  }
  function ppClampViewToFit(){
    var sfit=ppFitScale(); if(sfit==null) return false;
    var changed=false;
    var s=0.5*(ppState.zoom||1);
    if(s>sfit*1.001){                         /* 装不下 → 才退到装得下的比例（只缩不放） */
      ppState.zoom=Math.max(0.1,Math.min(10,sfit/0.5));
      s=0.5*ppState.zoom;
      changed=true;
    }
    /* 内容整幅都装得下时，平移没有意义 —— 它只会把图推出画布，而平移量同样被存进
       地块存档（ppGetState/ppSetState）⇒ 用户拖歪一次就会永久偏出去。这里一并归零。
       放大态（内容比画布大）下的平移是合理操作，不动。 */
    var m=ppContentSize();
    if(m&&m.w*s<=ppCanvas.width+1&&m.h*s<=ppCanvas.height+1&&(ppState.panX||ppState.panY)){
      ppState.panX=0;ppState.panY=0;changed=true;
    }
    return changed;
  }
  function ppFitView(){
    var sfit=ppFitScale(); if(sfit==null) return false;
    ppState.zoom=Math.max(0.1,Math.min(10,sfit/0.5));
    ppState.panX=0;ppState.panY=0;
    ppUpdateTransform();ppRender();ppSyncFitBtn();
    return true;
  }
  /* 内容现在是否比画布大（= 图上一定有线被切）。只用于决定要不要亮出「适应窗口」按钮。 */
  function ppIsViewClipped(){
    if(!ppSized) return false;
    var m=ppContentSize(); if(!m) return false;
    var s=0.5*(ppState.zoom||1);
    return m.w*s>ppCanvas.width+1 || m.h*s>ppCanvas.height+1;
  }
  function ppSyncFitBtn(){
    var btn=document.getElementById('ppFitViewBtn');
    if(!btn) return;
    var on=!!ppState.polyPts.length && ppIsViewClipped();
    btn.classList.toggle('is-on',on);
  }
  window.ppFitView=ppFitView;
  window.__ppViewDebug=function(){
    var m=ppContentSize(),s=0.5*(ppState.zoom||1);
    return {zoom:ppState.zoom,scale:s,panX:ppState.panX,panY:ppState.panY,
      content:m?{w:+m.w.toFixed(1),h:+m.h.toFixed(1)}:null,
      contentPx:m?{w:+(m.w*s).toFixed(1),h:+(m.h*s).toFixed(1)}:null,
      canvas:{w:ppCanvas.width,h:ppCanvas.height},
      fitScale:ppFitScale(),clipped:ppIsViewClipped()};
  };

  function ppResize(){
    if(document.body.classList.contains('ry-tool') && !document.getElementById('pipePlanSection').classList.contains('ry-active')) return;
    /* Entering a tool group dispatches resize even when the shared viewport has not
       changed. Do not clamp a deliberately zoomed or panned camera on that event. */
    if(ppCanvas.width===ppWrap.clientWidth&&ppCanvas.height===ppWrap.clientHeight&&ppSized)return;
    ppCanvas.width=ppWrap.clientWidth;
    ppCanvas.height=ppWrap.clientHeight;
    if(ppCanvas.width>60&&ppCanvas.height>60) ppSized=true;
    /* [v629] 关键一行：画布尺寸一旦变化，先保证「整幅装得下」，再算变换。 */
    ppClampViewToFit();
    ppUpdateTransform();ppRender();ppSyncFitBtn();
  }

  /* CAD 单一制图区迁移：导航切换会触发宿主尺寸重排，读写该视口不触碰地块或分区设计数据。 */
  window.ppGetView=function(){return{zoom:ppState.zoom,panX:ppState.panX,panY:ppState.panY};};
  /* Shared CAD canvas bridge: callers project the authoritative map coordinates
     through the exact same camera used by the partition renderer. */
  window.ppMapToCanvas=function(x,y){
    if(!isFinite(Number(x))||!isFinite(Number(y)))return null;
    if(!ppState.transform)ppUpdateTransform();
    var p=ppToCanvas(Number(x),Number(y));
    return{x:p.x,y:p.y,width:ppCanvas.width,height:ppCanvas.height};
  };
  window.ppSetView=function(view){
    if(!view||!isFinite(Number(view.zoom))||!isFinite(Number(view.panX))||!isFinite(Number(view.panY)))return false;
    ppState.zoom=Math.max(0.1,Math.min(10,Number(view.zoom)));
    ppState.panX=Number(view.panX);ppState.panY=Number(view.panY);
    ppUpdateTransform();ppRender();ppSyncFitBtn();
    return true;
  };
  window.ppPanView=function(dx,dy){
    if(!isFinite(dx)||!isFinite(dy))return false;
    ppState.panX+=dx;ppState.panY+=dy;
    ppUpdateTransform();ppRender();ppSyncFitBtn();
    return true;
  };
  /* Shared CAD camera zoom: all input sources update the partition camera, then
     reproject the pipeline overlay onto that exact view. */
  window.ppZoomView=function(factor,x,y){
    factor=Number(factor);if(!isFinite(factor)||factor<=0)return false;
    var pos={x:isFinite(Number(x))?Number(x):ppCanvas.width/2,y:isFinite(Number(y))?Number(y):ppCanvas.height/2};
    var nz=Math.max(0.1,Math.min(10,ppState.zoom*factor));
    if(nz===ppState.zoom)return false;
    var mw=ppToMeters(pos.x,pos.y);
    ppState.zoom=nz;ppUpdateTransform();
    var np=ppToCanvas(mw.x,mw.y);
    ppState.panX+=pos.x-np.x;ppState.panY+=pos.y-np.y;
    ppRender();ppSyncFitBtn();
    return true;
  };

  function ppApplySavedPartitionCuts(){
    var saved=ppState.partitionCuts;
    if(!saved||!Array.isArray(saved.x)||!Array.isArray(saved.y)||ppState.polyPts.length<3)return false;
    try{
      var b=ppGetBounds();
      var n=parseInt(document.getElementById('planN')&&document.getElementById('planN').value)||parseInt(document.getElementById('fld_N')&&document.getElementById('fld_N').value)||4;
      var layout=ppGetZoneLayout(b,n);
      ppState.cutSnap={sig:ppGetZoneCutSignature(b,layout),x:saved.x.slice(),y:saved.y.slice()};
      return true;
    }catch(e){return false;}
  }

  function ppLoadPolygon(){
    if(!window.measuredPolygon||window.measuredPolygon.length<3){
      ppHintEl.style.display='block';ppToolbar.style.display='flex';
      ppEmpty.style.display='block';ppLegend.style.display='none';
      ppState.polyPts=[];ppState.transform=null;
      /* Replacing a grouped plot with an empty/invalid boundary must also detach
         the prior group's editor state and controls from the now-empty canvas. */
      window.__runyeGroupEdit=null;
      ppResetCutSnap('');
      ppSyncGroupEditUI();
      ppRender();return;
    }
    ppHintEl.style.display='none';ppToolbar.style.display='flex';
    ppEmpty.style.display='none';ppLegend.style.display='flex';
    ppState.polyPts=window.measuredPolygon.map(function(p){return{x:p.x,y:p.y};});
    /* [v193] 成组地块：初始化「整组 / 逐块」编辑状态（非成组 → 置 null，UI 自动隐藏）。
       必须在 ppUpdateTransform 之前，因为整组/逐块会决定 bounds 用的是外框还是某一块。 */
    var ppHasGroup=ppInitGroupEdit();
    /* 成组成员的分区线快照属于各自 slot。新地块才清除旧快照；成组初始化若再清一次，
       会把当前成员刚恢复的手动分区位置抹掉。 */
    if(!ppHasGroup)ppResetCutSnap('');
    ppApplySavedPartitionCuts();
    /* [v629] 存档恢复 / 首次进场也走本函数 ⇒ 在这里同样收口一次，
       否则「云端存着 zoom=347%」的地块一打开仍是裁切态（ppResize 那时还没量到内容）。 */
    ppClampViewToFit();
    ppUpdateTransform();ppRender();ppSyncFitBtn();
  }
  window.ppLoadPolygon=ppLoadPolygon;
  window.ppGetPolyPts=function(){ return ppState.polyPts.map(function(p){return{x:p.x,y:p.y};}); };
  window.ppSetZoneAngleDeg=function(value){
    return ppApplyZoneAngle(value,false);
  };

  // ===== 数据传导桥：供三级页读取二级页的分区网格与管线几何（二级页状态 ppState 为 IIFE 私有，三级页顶层函数访问不到，故在此暴露）=====
  window.RunyeBridge = {
    get state(){ return ppState; },
    getZoneCuts: function(){
      if(!ppState.polyPts.length) return null;
      var b=ppGetBounds();
      var planN=parseInt((document.getElementById('planN')&&document.getElementById('planN').value))||4;
      var zl=ppGetZoneLayout(b,planN);
      return ppGetZoneCuts(b,zl);
    },
    getPlanDims: function(){ return ppGetPlanDims(ppGetBounds()); },
    /* [v194] 供「成组管路」页驱动二级页的整组/逐块状态机（pp* 全在 IIFE 里，外面够不着）。
       成组管路页要「按块进入三级页」，必须先让二级页切到那一块 —— 因为三级页的
       分区网格走 getZoneCuts()（读 ppState.polyPts），不切就会拿错那一块的分区。 */
    groupEdit: function(){ return window.__runyeGroupEdit||null; },
    setSourcePosition: function(point){
      if(!point||!Number.isFinite(Number(point.x))||!Number.isFinite(Number(point.y)))return false;
      var ge=window.__runyeGroupEdit;
      if(ge&&ge.active&&ge.mode==='whole')return false;
      var groupPreimage=ppGroupMemberPreimage();
      if(groupPreimage&&groupPreimage.invalid)return false;
      var singlePreimage=!groupPreimage&&!ppIsGroupWhole()&&typeof window.ppGetState==='function'
        ?window.ppGetState():null;
      ppPushHistory();
      ppState.source={x:Number(point.x),y:Number(point.y)};
      if(groupPreimage)return ppCommitGroupMemberEdit(groupPreimage,'source-flip');
      return !singlePreimage||ppCommitSinglePlotEdit(singlePreimage,'source-flip',false,false);
    },
    getPartitionState: function(){
      return {cutSnap:ppCloneJSON(ppState.cutSnap),cutOverrides:ppCloneJSON(ppState.cutOverrides),
        zoneAngleDeg:ppState.zoneAngleDeg,zoneRotated:!!ppState.zoneRotated};
    },
    getPlotPolygon: function(){
      return ppState.polyPts.map(function(point){return{x:Number(point.x),y:Number(point.y)};});
    },
    getPartitionSnapshot: function(){
      return ppCloneJSON({polyPts:ppState.polyPts,zoneAngleDeg:ppState.zoneAngleDeg,partitionCuts:ppState.partitionCuts,
        cutSnap:ppState.cutSnap,cutOverrides:ppState.cutOverrides,mainPipes:ppState.mainPipes,
        branchPipes:ppState.branchPipes,subBranchPipes:ppState.subBranchPipes,source:ppState.source,
        valves:ppState.valves,zoom:ppState.zoom,panX:ppState.panX,panY:ppState.panY});
    },
    hasPlot: function(){return Array.isArray(ppState.polyPts)&&ppState.polyPts.length>=3;},
    restorePartitionState: function(next){
      if(!next||typeof next!=='object')return false;
      var ge=window.__runyeGroupEdit;
      if(ge&&ge.active&&ge.mode==='whole')return false;
      var groupPreimage=ppGroupMemberPreimage();
      if(groupPreimage&&groupPreimage.invalid)return false;
      var singlePreimage=!groupPreimage&&!ppIsGroupWhole()&&typeof window.ppGetState==='function'
        ?window.ppGetState():null;
      var angle=Number(next.zoneAngleDeg);
      if(!isFinite(angle))angle=0;
      angle=((angle+180)%360+360)%360-180;
      if(Math.abs(angle)<0.05)angle=0;
      angle=Math.round(angle*10)/10;
      ppPushHistory();
      ppState.cutSnap=next.cutSnap?ppCloneJSON(next.cutSnap):{sig:'',x:null,y:null};
      ppState.cutOverrides=next.cutOverrides?ppCloneJSON(next.cutOverrides):{x:{},y:{}};
      ppState.zoneAngleDeg=angle;
      ppState.zoneRotated=Math.abs(Math.abs(angle)-90)<0.001;
      if(groupPreimage&&!ppCommitGroupMemberEdit(groupPreimage,'partition-restore'))return false;
      if(singlePreimage&&!ppCommitSinglePlotEdit(singlePreimage,'partition-restore',false,true))return false;
      ppSyncZoneAngleUI();
      return true;
    },
    setGroupMode: function(m){ if(typeof ppSetGroupMode==='function') ppSetGroupMode(m); },
    selectGroupPlot: function(i){ if(typeof ppSelectGroupPlot==='function') ppSelectGroupPlot(i); },
    /* [v242] 成组编辑区的 UI 同步（含「◀ 返回成组管路」的显隐，它读 window.__runyeGroupPlotEdit）。
       成组管路页切进来 / 退回去都要立刻刷一次，否则按钮要等到下一次选块才跟上。 */
    syncGroupEditUI: function(){ if(typeof ppSyncGroupEditUI==='function') ppSyncGroupEditUI(); },
    /* [v194] 把二级页**此刻正在编辑**的那一块取出来（逐块态才有意义；整组态是合并视图）。
       ★ 为什么必须有它：ge.slots[i] 只在「切块 / 切模式」时才从 ppState 捕获，
         用户在二级页画完管**直接切到成组管路页**时，slots[i] 还是旧的 ⇒ 刚画的管看不见。
         （_p1/_probe_group_work.cjs 的 G5c 实测抓到：二级页 mainPipes=1，组页 slot=0。）
       ppCaptureSlot() 是纯函数（只读 ppState 造一个新对象），不会动 ge.slots。 */
    /* [v201] 成组管路页要能「一键给全组各块布管 / 清管」。
       ppAutoGeneratePipes / ppClearPipes 全在 IIFE 里 ⇒ 只在本侧暴露入口，
       内部**就是二级页同一套**（已按整组态逐块生成、写回各块 slot）—— 不写第二份算法。 */
    autoPipesWhole: function(){ try{ return ppAutoGeneratePipes()===true; }catch(e){ return false; } },
    /* 地图首次交接到分区页时，只为从未建立过L2方案的新地块生成初始管线。
       已有档案即使为空也视为用户保存过的设计，不自动覆盖；组模式先检查全部成员槽。 */
    ensureInitialPipes: function(){
      if(!ppState.polyPts||ppState.polyPts.length<3)return false;
      var ge=window.__runyeGroupEdit;
      if(ppHasPipeContent())return false;
      if(ge&&ge.active&&Array.isArray(ge.slots)&&ge.slots.some(function(s){
        return !!(s&&((s.mainPipes&&s.mainPipes.length)||(s.branchPipes&&s.branchPipes.length)||
          (s.subBranchPipes&&s.subBranchPipes.length)||(s.valves&&s.valves.length)||s.source));
      }))return false;
      var id=window.currentPlotId==null?'':String(window.currentPlotId);
      if(id){
        var savedKeys=['runye_plot_design_v1:'+encodeURIComponent(id),'runye_group_design_v1:'+encodeURIComponent(id)];
        try{if(savedKeys.some(function(key){return window.localStorage.getItem(key)!=null;}))return false;}catch(eSaved){return false;}
      }
      return ppAutoGeneratePipes()===true;
    },
    clearPipesWhole: function(){ try{ return ppClearPipes()===true; }catch(e){ return false; } },
    groupLiveSlot: function(){
      var ge=window.__runyeGroupEdit;
      if(!ge||!ge.active||ge.mode!=='perPlot') return null;
      try{ return ppCaptureSlot(); }catch(e){ return null; }
    },
    /* [v196] 供「成组管路」页按块画分区线（用户原话：「这个页面要把管路跟每个地块
       分区都显示出来」）。分区几何**必须复用本 IIFE 内的同一套函数**（ppGetZoneLayout /
       ppGetZoneCuts），不写第二份算法 —— 但这两个函数内部读全局 ppState.cutSnap /
       cutOverrides，而每块自己的快照在 slot 里 ⇒ 由本桥做「换入 → 算 → 还原」
       （try/finally；ppGetZoneCuts 在 sig 不匹配时会经 ppResetCutSnap 改写
       cutSnap 和 mergePreview，两个都要还原）。
       ★ 成组页 IIFE 里没有 ppState / ppGetZoneCuts（跨 IIFE 够不着）——
         v196 第一版直接引用直接 ReferenceError（group_work 探针 FATAL 抓到）。 */
    zoneCutsFor: function(bb, planN, cutSnap, cutOverrides, zoneAngleDeg, polyPts){
      if(!bb||!(bb.w>0.5)||!(bb.h>0.5))return null;
      var keepSnap=ppState.cutSnap, keepOv=ppState.cutOverrides, keepMp=ppState.mergePreview, keepOwn=ppOwnDimOverride, keepAngle=ppState.zoneAngleDeg, keepRot=ppState.zoneRotated, keepPoly=ppState.polyPts;
      try{
        if(Array.isArray(polyPts)&&polyPts.length>=3)ppState.polyPts=polyPts.map(function(p){return{x:+p.x,y:+p.y};});
        ppState.cutSnap=cutSnap||{sig:'',x:null,y:null};
        ppState.cutOverrides=cutOverrides||{x:{},y:{}};
        ppState.zoneAngleDeg=isFinite(Number(zoneAngleDeg))?Number(zoneAngleDeg):0;
        ppState.zoneRotated=Math.abs(ppState.zoneAngleDeg%180)===90;
        ppOwnDimOverride=true;   /* [v201] 传进来的 bb 就是某一块的 bbox ⇒ 按本块尺寸分区 */
        var zl=ppGetZoneLayout(bb,planN);
        return ppGetZoneCuts(bb,zl);
      }catch(e){ return null; }
      finally{ ppState.cutSnap=keepSnap; ppState.cutOverrides=keepOv; ppState.mergePreview=keepMp; ppOwnDimOverride=keepOwn; ppState.zoneAngleDeg=keepAngle; ppState.zoneRotated=keepRot; ppState.polyPts=keepPoly; }
    },
    cutToWorld: function(cuts,x,y){return ppCutPoint(cuts,x,y);},
    polyToGrid: function(cuts,poly){return cuts&&cuts.frame?(poly||[]).map(cuts.frame.toGrid):(poly||[]).map(function(p){return{x:p.x,y:p.y};});},
    polyToWorld: function(cuts,poly){return cuts&&cuts.frame?(poly||[]).map(cuts.frame.toWorld):(poly||[]).map(function(p){return{x:p.x,y:p.y};});},
    /* 非标分区判断用的两个纯函数桥（成组页只算本块自己的环，不能走
       ppZoneActualAreaM2 —— 那个在成组时会经 ppGetSubPlotRings() 把全部
       成员环都裁剪进来，本块 cell 会被别的块污染）。 */
    clipPolyToRect: function(poly,x0,y0,x1,y1){ try{ return ppClipPolyToRect(poly,x0,y0,x1,y1); }catch(e){ return null; } },
    polyArea: function(poly){ try{ return ppPolyArea(poly); }catch(e){ return 0; } },
    /* v98d：三级画布拖动「组边界线」→ 复用二级的分区线位置（写回共享 cutSnap），二级/三级同步。
       allowMerge=false 时不触发「拖到邻线即合并」，以保护手动分组的区号不失效。 */
    cutDragBegin: function(){
      try{
        ppCutDragPreimage=ppGroupMemberPreimage();
        if(ppCutDragPreimage&&ppCutDragPreimage.invalid)return;
        ppCutSinglePreimage=!ppCutDragPreimage&&!ppIsGroupWhole()&&typeof window.ppGetState==='function'?window.ppGetState():null;
        ppPushHistory();
      }catch(e){ppCutDragPreimage=null;ppCutSinglePreimage=null;}
    },
    cutDragTo: function(axis,index,worldVal,allowMerge){
      if(ppCutDragPreimage&&ppCutDragPreimage.invalid)return null;
      var r=null;
      try{ r = allowMerge ? ppDragCutTo(axis,index,worldVal) : ppDragCutPosOnly(axis,index,worldVal); }catch(e){}
      try{ ppRender(); }catch(e){}
      return r;
    },
    cutDragEnd: function(allowMerge){
      var merged=false;
      if(allowMerge){ try{ merged=ppCommitMerge(); }catch(e){} }
      else { try{ ppState.mergePreview=null; }catch(e){} }
      var preimage=ppCutDragPreimage,singlePreimage=ppCutSinglePreimage;
      ppCutDragPreimage=null;ppCutSinglePreimage=null;
      if(!ppCommitCutDragSnapshots(preimage,singlePreimage,'cut-drag'))return false;
      try{ ppRender(); }catch(e){}
      ppRefreshTLAfterCuts();
      return merged;
    },
    getCuts: function(){ var c=ppCurrentCuts(); return c?{xPos:c.xPos.slice(),yPos:c.yPos.slice(),cols:c.cols,rows:c.rows}:null; },
    /* ===== v98h 三级「阶梯分区」拖动（只动被抓的那一段，不动同一线上的其它段）=====
       lane = 行号（axis='x' 时）/ 列号（axis='y' 时），由工作区命中时给出。
       写入 window.tlZoneStep（稀疏覆盖表）并同步当前快照 zones.cutOffX/cutOffY
       （画布克隆底图 / 逐格面积 / 流量都读它）；返回值把两张表回给工作区做防御性同步。 */
    cutStepDragBegin: function(){
      try{
        ppCutStepPreimage=ppGroupMemberPreimage();
        if(ppCutStepPreimage&&ppCutStepPreimage.invalid)return;
        if(ppCutStepPreimage){
          ppCutStepPreimage=Object.assign({},ppCutStepPreimage,{step:ppCloneJSON(window.tlZoneStep)});
        }else if(!ppIsGroupWhole()&&window.__runyeSingleCanonicalDesign){
          ppCutStepPreimage={single:true,step:ppCloneJSON(window.tlZoneStep),diagram:ppCloneJSON(window.tlDiagramData)};
        }else{
          ppCutStepPreimage=null;
        }
        ppPushHistory();
      }catch(e){ppCutStepPreimage=null;}
    },
    cutStepDragTo: function(axis,index,lane,worldVal){
      try{
        if(ppCutStepPreimage&&ppCutStepPreimage.invalid)return null;
        if(lane==null) return null;
        var base=ppCurrentCuts(); if(!base) return null;
        var arr=(axis==='x')?base.xPos:base.yPos;
        if(index<=0||index>=arr.length-1) return null;
        var spec={cols:base.cols,rows:base.rows,xPos:base.xPos,yPos:base.yPos};
        var st=tlZoneStepFor(spec);
        if(!st){ window.tlZoneStep={sig:tlZoneGridSig(spec),x:{},y:{}}; st=window.tlZoneStep; }
        var map=(axis==='x')?st.x:st.y;
        var key=lane+','+index;
        var getv=function(k){ var v=map[lane+','+k]; if(v!=null&&isFinite(v)) return v; return arr[k]; };
        var lo=getv(index-1), hi=getv(index+1);
        var minGap=Math.max(2,4*ppWorldPerPixel(axis));
        var lo2=lo+minGap, hi2=hi-minGap;
        if(lo2>hi2) lo2=hi2=(lo+hi)/2;
        map[key]=Math.max(lo2,Math.min(hi2,worldVal));
        if(window.tlDiagramData&&window.tlDiagramData.zones){
          window.tlDiagramData.zones.cutOffX=st.x;
          window.tlDiagramData.zones.cutOffY=st.y;
        }
        return {ok:true,x:st.x,y:st.y,pos:map[key]};
      }catch(e){ return null; }
    },
    cutStepDragEnd: function(){
      var st=window.tlZoneStep;
      if(st&&st.x&&st.y&&window.tlDiagramData&&window.tlDiagramData.zones){
        window.tlDiagramData.zones.cutOffX=st.x;
        window.tlDiagramData.zones.cutOffY=st.y;
      }
      var preimage=ppCutStepPreimage;ppCutStepPreimage=null;
      if(preimage&&preimage.single){
        var changed=JSON.stringify(preimage.step)!==JSON.stringify(st)||
          JSON.stringify(preimage.diagram)!==JSON.stringify(window.tlDiagramData);
        if(changed&&typeof window.ryCommitSingleLevel3CanonicalFromRuntime==='function'&&
            !window.ryCommitSingleLevel3CanonicalFromRuntime()){
          ppDiscardLatestHistoryEntry();
          window.tlZoneStep=ppCloneJSON(preimage.step)||{sig:'',x:{},y:{}};
          window.tlDiagramData=ppCloneJSON(preimage.diagram);
          if(typeof window.ppRefreshTLAfterCuts==='function')window.ppRefreshTLAfterCuts();
          console.warn('[plot-editor] single-plot level3 cut-step transaction rejected');
          return false;
        }
      }else if(preimage&&!ppCommitGroupMemberStep(preimage,ppCloneJSON(st),preimage.step,true))return false;
      /* ⚠ 这里**故意不**调 runyeSaveProject()：它内部会 projectToast('方案已保存到本机')，
         等于每松一次手就弹一次提示（v98d 真渲染闸门的「生成图过程中无 alert 弹窗」会因此变红）。
         旧路径 cutDragEnd 同样不落盘 —— 拖动只改内存，落盘交给用户点「保存」。
         阶梯覆盖表不会丢：它既进 saveProject 的 zoneStep 字段，也随
         tlDiagramData.zones.cutOffX/Y 走 isoDiagram.data。 */
      return tlZoneStepCount();
    },
    cutStepReset: function(){
      var preimage=ppGroupMemberPreimage();
      if(preimage&&preimage.invalid)return false;
      var previousStep=ppCloneJSON(window.tlZoneStep);
      tlZoneStepClear();
      if(window.tlDiagramData&&window.tlDiagramData.zones){
        window.tlDiagramData.zones.cutOffX=null; window.tlDiagramData.zones.cutOffY=null;
      }
      if(preimage&&!ppCommitGroupMemberStep(Object.assign({},preimage,{step:previousStep}),null,previousStep))return false;
      return true;
    },
    zoneStepCount: function(){ return tlZoneStepCount(); }
  };

  function ppGetBounds(){
    var minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(var i=0;i<ppState.polyPts.length;i++){
      var p=ppState.polyPts[i];
      if(p.x<minX)minX=p.x;if(p.x>maxX)maxX=p.x;
      if(p.y<minY)minY=p.y;if(p.y>maxY)maxY=p.y;
    }
    return{minX:minX,minY:minY,w:maxX-minX,h:maxY-minY};
  }

  function ppBoundsFromPoints(points){
    var minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(var i=0;i<points.length;i++){
      var p=points[i];
      if(p.x<minX)minX=p.x;if(p.x>maxX)maxX=p.x;
      if(p.y<minY)minY=p.y;if(p.y>maxY)maxY=p.y;
    }
    return{minX:minX,minY:minY,w:maxX-minX,h:maxY-minY};
  }

  function ppPointInPlot(point){
    if(!ppState.polyPts||ppState.polyPts.length<3)return true;
    var fn=window.atPointInPolygon||atPointInPolygon;
    if(typeof fn!=='function')return true;
    /* [v190] 成组地块：落在**任一成员环**内才算地块内 —— 落在块间空隙里不算
       （否则空隙里能放阀门/吸管线，与「空隙不算面积」矛盾）。 */
    var rings=ppGetSubPlotRings();
    if(rings){
      for(var i=0;i<rings.length;i++){
        if(rings[i].length>=3&&fn(point,rings[i]))return true;
      }
      return false;
    }
    return fn(point,ppState.polyPts);
  }

  /* ===== [v837 2026-10-31 用户实测] 分区旋转后「网格与管路整体画到地块外面」的统一裁剪 =====
     现象（用户原话：「分区角度 30° 时，分区网格和管路整体画到地块边界外面」）：
     分区角度非 0 时，格子是**旋转后的外接框**切出来的，格子四角、整条网格线、按整格撒出去的
     管路都一定伸到地块多边形外面。线上 v834 实测（300×170m 地块、30°、两管程）：
       · 网格线：画出去的长度只有 **32%** 落在地块内（最长的一条线 100% 在外）
       · 主管：界内长度 52%（越界采样 50%）
       · 支管：界内长度 51%
     办法：一律裁到地块多边形。**只用一份实现** —— ppClipPolylineToRing（v659，逐线段求交点
     → 按 t 排序切子段 → 子段中点内外判定 → 连续界内子段首尾拼接），不另写线-多边形求交。
     [v837] 撤掉 v830 那份临时实现 ppClipSegToPoly：它与 ppClipPolylineToRing 重复，而且
       「只保留最长的一段界内区间」在**凹多边形**上会把另一段真实管段吞掉（U 形地块一条线
       穿进穿出两次，就只剩一条臂有管）。
     ★ 0° 必须逐位不变：矩形地块上所有线本来就整段在界内 ⇒ 下面原值透传（不走 lerp），
       生成结果与旧实现完全相同。这是本改动的回归底线。
     ★ 为什么透传要显式写：ppClipPolylineToRing 内部用 lerp 取端点，t=1 时
       a+(b-a)*1 在浮点下未必等于 b（如 0.1+(0.3-0.1)*1 = 0.30000000000000004），
       不透传就会让「0° 生成结果哈希不变」这条底线随机破掉。 */
  function ppClipSegsToPlot(a, b, poly) {
    var ring = poly || ppState.polyPts;
    if (!ring || ring.length < 3) return [[a, b]];
    /* ★ 必须把 ppRingIn 传进去：网格线里**正好压在地块边上**的那几条（0° 时的最外圈、
       30° 时贴边的），用纯射线法会判成「在界外」⇒ 整条线被裁没（实测 0° 下第 4 条竖线
       直接消失）。ppRingIn = 射线法 或 落在边上。 */
    var segs = ppClipPolylineToRing([a, b], ring, ppRingIn);
    if (!segs.length) return [];
    var same = function (p, q) { return Math.abs(p.x - q.x) < 1e-9 && Math.abs(p.y - q.y) < 1e-9; };
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      if (s.length === 2 && same(s[0], a) && same(s[1], b)) segs[i] = [a, b];
    }
    return segs;
  }
  try { window.ppClipSegsToPlot = ppClipSegsToPlot; } catch (eClip) { }

  /* [v837] 「在环内」的软判定：射线法 或 压在环边上。
     为什么需要：网格线的最外圈那几条本来就与地块边重合，射线法对**边界上的点**的结果是
     未定义的（实现在 inline-10.js atPointInPolygon，用的是严格 `<`）—— 实测 0° 下右侧
     那条竖线被判成整条在界外、于是整条不画，比越界更糟（用户会以为网格少了一条）。
     容差取环尺度的相对值：网格裁剪时环是**世界系多边形（米）**，管路裁剪时环是
     **格系多边形**（实测 cutScaleX/Y=1、origin=地块包围盒左下 ⇒ 相对世界只是一个平移，
     量级可能到 1e5），一处写死的绝对容差不可能同时合适。 */
  function ppOnRingEdge(p, ring, tol) {
    var n = ring.length;
    for (var i = 0, j = n - 1; i < n; j = i++) {
      var ax = ring[j].x, ay = ring[j].y, bx = ring[i].x, by = ring[i].y;
      var dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
      var t = L2 < 1e-18 ? 0 : ((p.x - ax) * dx + (p.y - ay) * dy) / L2;
      if (t < -1e-9 || t > 1 + 1e-9) continue;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      var qx = ax + dx * t, qy = ay + dy * t;
      if (Math.sqrt((p.x - qx) * (p.x - qx) + (p.y - qy) * (p.y - qy)) <= tol) return true;
    }
    return false;
  }
  function ppRingIn(p, ring) {
    var fnIn = window.atPointInPolygon || atPointInPolygon;
    if (typeof fnIn === 'function' && fnIn(p, ring)) return true;
    var ext = 0;
    for (var i = 0; i < ring.length; i++) {
      ext = Math.max(ext, Math.abs(ring[i].x), Math.abs(ring[i].y));
    }
    return ppOnRingEdge(p, ring, Math.max(1e-9, ext * 1e-9));
  }

  /* [v837] 格子在界内的形心（世界坐标）—— 只在「格子中心已经跑到地块外」时用来把标注拽回来。
     复用 ppClipPolyToRect：地块换到格系 → 按本格矩形裁一刀 → 取裁剪后多边形的面积形心。 */
  function ppZoneClipCenterWorld(zc, zr, cuts) {
    try {
      if (!cuts || !cuts.frame || !ppState.polyPts || ppState.polyPts.length < 3) return null;
      var local = ppState.polyPts.map(cuts.frame.toGrid);
      var clipped = ppClipPolyToRect(local, cuts.xPos[zc], cuts.yPos[zr], cuts.xPos[zc + 1], cuts.yPos[zr + 1]);
      var c = ppPolyCentroid(clipped);
      return c ? cuts.frame.toWorld(c) : null;
    } catch (eC) { return null; }
  }
  function ppPolyCentroid(pts) {
    if (!pts || pts.length < 3) return null;
    var a = 0, cx = 0, cy = 0;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var cross = pts[j].x * pts[i].y - pts[i].x * pts[j].y;
      a += cross; cx += (pts[j].x + pts[i].x) * cross; cy += (pts[j].y + pts[i].y) * cross;
    }
    if (Math.abs(a) < 1e-9) return null;
    return { x: cx / (3 * a), y: cy / (3 * a) };
  }

  function ppGetRotatedPlotPoints(){
    if(!ppState.polyPts.length)return [];
    /* 规划坐标是地块的固定真实坐标；只有分区网格可以改变方向。 */
    return ppState.polyPts.map(function(p){return{x:p.x,y:p.y};});
  }

  /* 成组地块保留每个成员的原始局部米坐标；边界位置和朝向不可变。 */
  function ppGetSubPlotRings(){
    /* [v193] 按编辑模式取环：整组=全部成员环；逐块=只有当前那一块。
       ⇒ 下游（画布 / 施工图 / 面积 / 点位判定）不用改一行就自动跟着模式走。 */
    var subs=ppGroupActiveSubs();
    if(!subs||!subs.length)return null;
    var rings=[];
    subs.forEach(function(s){
      if(s&&Array.isArray(s.poly)&&s.poly.length>=3){
        rings.push(s.poly.map(function(q){return{x:+q.x,y:+q.y};}));
      }
    });
    return rings.length?rings:null;
  }
  function ppGetRotatedSubRings(){
    var rings=ppGetSubPlotRings();
    if(!rings)return null;
    return rings;
  }
  /* ===== [v652c 2026-10-21 用户要求] 逐块态「冻结邻块」 =====
   * 用户原话：「这个多地块编辑某一块的时候，其他块冻结就好了，不要编辑某一块的时候，
   *   其他块都不显示了，这样不够直观，我要看这块在整体中是什么关系，这样好判断总管怎么连接好。」
   * ⇒ 逐块模式下其余成员环照常画出来（灰显 + 虚线框 + 块名），但**只读**：
   *   不进分区/面积/水力/材料，不参与点位判定与命中（那些仍走 ppGetSubPlotRings=仅当前块，
   *   「成组退化成多次单块、一行规则不改」的结构原封不动）——邻块只是看得见、摸不着。
   * 显示用真实坐标；分区旋转只改变分区网格，不变换地块边界。 */
  function ppGetFrozenSubRings(){
    var ge=window.__runyeGroupEdit;
    var subs=window.__runyeSubPlots;
    if(!ge||!ge.active||ge.mode!=='perPlot'||!subs||subs.length<2)return null;
    var rings=[];
    subs.forEach(function(s,i){
      if(i===ge.current)return;
      if(s&&Array.isArray(s.poly)&&s.poly.length>=3){
        rings.push({name:s.name||('子地块'+(i+1)),poly:s.poly.map(function(q){return{x:+q.x,y:+q.y};})});
      }
    });
    if(!rings.length)return null;
    return rings;
  }
  /* ================= [v193 2026-10-03] 成组地块「整组 / 逐块」编辑 =================
   * 用户原话：「成组地块传到二级管路之后，进一步编辑的话，再给我一个切换按钮，这个
   *   单独编辑，跟三级管路编辑页面分开，否则我担心跟原来的一些计算规则跟逻辑搞混了。」
   * 用户拍板：① 逐块单独编辑 ② 各块结果完全独立 ③ 地块坐标和朝向固定
   *          ④ 旋转分区网格而非地块 ⑤ 施工图出一张总图
   *
   * ★★ 设计原则：**不写成组的“新算法”，而是让成组退化成“多次单块”**。
   *   逐块模式下 ppState.polyPts 就是那一块自己的环 ⇒ 分区 / 布管 / 面积 / 材料 / 水力
   *   **全部走现有单地块逻辑，一行都不改** ⇒ 结构上不可能与单块规则串味。
   *   这正是用户担心的那件事的解法：不是“小心别搞混”，而是“根本没有两套规则”。
   *
   * 两种模式：
   *   · whole   整组：只读总览 —— 画全部成员环 + 全部块的管线（合并显示）+ 总管；
   *                    **不可编辑管线**（编辑必须切到逐块，否则分不清画的是哪块）
   *   · perPlot 逐块：一次只编辑一块，ppState 整份换成本块的 slot
   *
    * 每块一份 slot 的字段（PP_SLOT_KEYS）—— 每块的边界、分区方向、角度与管线跟随成员；
    * 视图类（zoom/pan/transform）和交互模式（mode）不进 slot，切块时保持一致。
   */
  var PP_SLOT_KEYS=['polyPts','mainPipes','branchPipes','subBranchPipes','source','valves',
    'pipeIds','nextPipeId','hiddenPipes','cutOverrides','cutSnap','partitionCuts','mergePreview','areaLocked',
    'zoneRotated','zoneAngleDeg','zoneAuto','couplerNodes'];
  /* [v913-coupler-nodes] couplerNodes = 接驳节点参数（[{pipeKey:'m1', s:米}]，每主管至多 1 条）。
     s 以 tlDiagramData.mainPipes（世界米）折线为基准；四接入点（成员槽/提交检测/ppGetState/
     ppSetState）全部显式接线，事务/undo 零新代码（进 ppState 后由 preimage/after 自动覆盖）。
     canonical 投影在 inline-09 tlAutoGenerate（写 dd.couplerNodes 世界米坐标）。 */

  function ppCloneJSON(v){ try{ return JSON.parse(JSON.stringify(v===undefined?null:v)); }catch(e){ return null; } }

  function ppClipSlotPipesToRing(slot, ring){
    if(!slot||!ring||ring.length<3)return slot;
    var sets=[
      {key:'mainPipes',idKey:'main',prefix:'m'},
      {key:'branchPipes',idKey:'branch',prefix:'b'},
      {key:'subBranchPipes',idKey:'subbranch',prefix:'s'}
    ];
    var usedIds=Object.create(null);
    ['main','branch','subbranch'].forEach(function(idKey){
      (slot.pipeIds&&slot.pipeIds[idKey]||[]).forEach(function(id){if(id)usedIds[String(id)]=true;});
    });
    var nextId=Number.isSafeInteger(slot.nextPipeId)&&slot.nextPipeId>0?slot.nextPipeId:1;
    function freshId(prefix){
      var id;
      do{id=prefix+nextId++;}while(usedIds[id]);
      usedIds[id]=true;
      return id;
    }
    sets.forEach(function(set){
      var lines=slot[set.key]||[],oldIds=slot.pipeIds&&slot.pipeIds[set.idKey]||[];
      var hidden=slot.hiddenPipes&&slot.hiddenPipes[set.idKey]||{},out=[],ids=[],nextHidden={};
      lines.forEach(function(line,index){
        var originalId=oldIds[index]&&String(oldIds[index]);
        var isHidden=!!(hidden[String(index)]||originalId&&hidden[originalId]);
        ppClipPolylineToRing(line,ring).forEach(function(seg,segmentIndex){
          var id=segmentIndex===0&&originalId&&ids.indexOf(originalId)<0?originalId:freshId(set.prefix);
          ids.push(id);out.push(seg);
          if(isHidden)nextHidden[id]=true;
        });
      });
      slot[set.key]=out;
      slot.pipeIds=slot.pipeIds||{main:[],branch:[],subbranch:[]};
      slot.pipeIds[set.idKey]=ids;
      slot.hiddenPipes=slot.hiddenPipes||{main:{},branch:{},subbranch:{}};
      slot.hiddenPipes[set.idKey]=nextHidden;
    });
    slot.nextPipeId=nextId;
    return slot;
  }

  function ppCaptureSlot(){
    var s={};
    PP_SLOT_KEYS.forEach(function(k){ s[k]=ppCloneJSON(ppState[k]); });
    /* [v660 用户实测「主管支管应该被地块裁切，现在还不行」] 成组态下任何 ppState→slot
       的存档路径（切块 / 返回成组 / grSync 实时快照）都按本块环裁剪管线——保证块档案
       里的管不出环。跨块段的「分配到邻块」走「生成施工图」的全量裁剪分发；这里只负责
       「本块不收出环管」。非成组（单地块自由画）不受限。 */
    try{
      var geC=window.__runyeGroupEdit;
      if(geC&&geC.active&&window.__runyeSubPlots&&window.__runyeSubPlots.length>=2){
        var ringC=(s.polyPts&&s.polyPts.length>=3)?s.polyPts:null;
        if(!ringC&&geC.slots&&geC.slots[geC.current]&&geC.slots[geC.current].polyPts&&geC.slots[geC.current].polyPts.length>=3){
          ringC=geC.slots[geC.current].polyPts;
        }
        if(ringC)ppClipSlotPipesToRing(s,ringC);
      }
    }catch(eCap){ }
    try{
      var cutsNow=ppCurrentCuts();
      if(cutsNow)s.partitionCuts={x:cutsNow.xPos.slice(1,-1),y:cutsNow.yPos.slice(1,-1)};
    }catch(eCuts){ }
    return s;
  }
  function ppApplySlot(s){
    if(!s)return;
    PP_SLOT_KEYS.forEach(function(k){ ppState[k]=ppCloneJSON(s[k]); });
    /* [v242] 根因修复（「双击地块进三级页」这条路上实测撞出来的）：
       ppCloneJSON(undefined) 走的是 JSON.stringify(null) ⇒ **null**，于是「缺字段的
       slot」（老版本存档、或只带 mainPipes/branchPipes 的最简 slot）会把
       polyPts / mainPipes… 直接置成 null；而下游到处是 `if(!ppState.polyPts.length)`
       这种判空 —— null.length 自己就 TypeError。触发链很短：rySetTab 末尾派发一次
       resize → ppResize → ppRender / ppUpdateTransform 就炸，控制台连刷
       「Cannot read properties of null」。这里按 ppState 初值的语义把**数组型**字段
       补齐成空数组（只补 null/undefined，不动已有值），一处修根，不再逐个补防御。 */
    ['polyPts','mainPipes','branchPipes','subBranchPipes','valves'].forEach(function(k){
      if(ppState[k]==null) ppState[k]=[];
    });
    /* [v657] 对象/标量型字段同样兜底 —— v657 探针实测：最小 slot（{}）经上面数组兜底后
       hiddenPipes 仍是 null，ppPushHistory→ppCloneState 读 .main 直接 TypeError
       （「Cannot read properties of null (reading 'main')」）。真实流程字段齐全不触发，
       但老存档/外部合成 slot 走到就会崩，这里按 ppBlankSlot 语义一次补齐。 */
    if(ppState.hiddenPipes==null) ppState.hiddenPipes={main:{},branch:{},subbranch:{}};
    if(ppState.pipeIds==null) ppState.pipeIds={main:[],branch:[],subbranch:[]};
    if(!ppState.nextPipeId) ppState.nextPipeId=1;
    if(ppState.cutOverrides==null) ppState.cutOverrides={x:{},y:{}};
    if(ppState.partitionCuts==null)ppState.partitionCuts=null;
    /* [v898 mergePreview 评估] 预览标志是会话内瞬态（ppDrawCutHandles 仅在 adjustCut 档画它），
       随 slot 持久化是「捕获一致性」设计，但恢复后残留非 null 会在切回 adjustCut 时画出
       一次幽灵橙色合并高亮（极窄窗口：拖动中恰好捕获 slot）。恢复原语统一置空，与
       ppBlankSlot 的 mergePreview:null 语义对齐。 */
    ppState.mergePreview=null;
    if(ppState.zoneRotated==null)ppState.zoneRotated=false;
    if(!isFinite(Number(ppState.zoneAngleDeg)))ppState.zoneAngleDeg=ppState.zoneRotated?90:0;
    if(ppState.zoneAuto==null)ppState.zoneAuto=true;
    ppSyncZoneAngleUI();
    if(typeof ppApplyZoneAutoUI==='function')ppApplyZoneAutoUI();
    /* 自动分区位置也作为成员设计快照保存。重新成组后按当前成员尺寸重建签名，
       让原有的内部切割线位置优先于组级外框重新计算出来的默认网格。 */
    ppApplySavedPartitionCuts();
  }
  function ppBlankSlot(polyPts){
    return {
      polyPts:(polyPts||[]).map(function(q){return{x:+q.x,y:+q.y};}),
      mainPipes:[],branchPipes:[],subBranchPipes:[],source:null,valves:[],
      pipeIds:{main:[],branch:[],subbranch:[]},nextPipeId:1,
      hiddenPipes:{main:{},branch:{},subbranch:{}},
      cutOverrides:{x:{},y:{}},cutSnap:{sig:'',x:null,y:null},partitionCuts:null,mergePreview:null,areaLocked:false,
      zoneRotated:false,zoneAngleDeg:0,zoneAuto:true
    };
  }

  /* ===== [v677 成组继承] 单地块设计 → 组内子地块 =====
     用户原话（2026-10-23）：「所有地块都是单地块进行划分，最后才拼成一组，
     如果先成组，注定很多细节无法无法完善」；「成组时继承各块已有设计」（确认「2 是的」）。
     数据来源（按优先级）：
       ① runye_plot_design_v1:<sub.id> —— 用户在该地块单地块态下保存工程时按块留档
         （runyeSaveProject 写入，见 inline-12.js）；
       ② 主存档 SAVE_KEY.pipePlan —— 旧流程兜底（最后一次单地块态的 pipePlan），
         仅接受**顶点逐点匹配**（防把 A 块的设计错配到形状相近的 B 块上）。
     几何换算：单地块与成组的投影原点不同（inline-16.js applyMapMeasuredArea），
     用「质心对齐」算平移量 Δ，管线/阀门/水源/分区线快照全部平移；
     cutSnap.sig 只含 bbox 尺寸（ppCutSig，平移不变）⇒ 手动线位原样继承。
     校验不过（形状对不上）⇒ 返回 null，回退空白槽（与旧行为一致）。 */
  function ppCentroidOf(poly){
    var cx=0,cy=0,n=(poly||[]).length||1;
    (poly||[]).forEach(function(p){cx+=(+p.x)||0;cy+=(+p.y)||0;});
    return {x:cx/n,y:cy/n};
  }
  function ppDesignCandidates(sub,archiveOnly){
    var list=[];
    try{
      if(sub&&sub.id!=null&&String(sub.id).length){
        var raw=localStorage.getItem('runye_plot_design_v1:'+encodeURIComponent(String(sub.id)));
        if(raw){
          var d=JSON.parse(raw);
          if(d&&d.design&&d.design.polyPts&&d.design.polyPts.length>=3){
            if(Object.prototype.hasOwnProperty.call(d,'canonicalDrawingDesign')&&d.canonicalDrawingDesign){
              var model=window.RyDrawingDesignModel,adapter=window.RyDrawingDesignLegacyAdapter;
              var canonical=d.canonicalDrawingDesign,check=model&&model.validate(canonical);
              var plotId=String(sub.id),projected=null;
              if(check&&check.ok&&canonical.projectId==='legacy-project:'+plotId&&canonical.plots.length===1&&
                  canonical.groups.length===0&&canonical.plots[0].plotId===plotId&&adapter&&
                  typeof adapter.toLegacyPatch==='function'){
                var baseline={currentPlotId:plotId,measuredPolygon:ppCloneJSON(d.design.polyPts),pipePlan:ppCloneJSON(d.design)};
                projected=adapter.toLegacyPatch(canonical,plotId,baseline);
              }
              if(!projected||!projected.ok||!projected.snapshot||!projected.snapshot.pipePlan){
                list.push({invalidCanonical:true,strict:false});
              }else list.push({design:projected.snapshot.pipePlan,strict:false,canonical:true});
            }else list.push({design:d.design,strict:false,canonical:false});
          }
        }
      }
    }catch(e){}
    if(!archiveOnly) try{
      var raw2=localStorage.getItem('runye_irrigation_saved_project_v1');
      if(raw2){ var p2=JSON.parse(raw2); if(p2&&p2.pipePlan&&p2.pipePlan.polyPts&&p2.pipePlan.polyPts.length>=3) list.push({design:p2.pipePlan,strict:true}); }
    }catch(e2){}
    return list;
  }
  function ppInheritSlot(sub,archiveOnly){
    if(!sub||!sub.poly||sub.poly.length<3)return null;
    var ring=sub.poly.map(function(q){return{x:+q.x,y:+q.y};});
    var cands=ppDesignCandidates(sub,archiveOnly);
    for(var ci=0;ci<cands.length;ci++){
      if(cands[ci].invalidCanonical)return null;
      var d=cands[ci].design;
      var src=(d.polyPts||[]).map(function(q){return{x:+q.x,y:+q.y};});
      if(src.length<3)continue;
      var cS=ppCentroidOf(ring),cD=ppCentroidOf(src);
      var dx=cS.x-cD.x,dy=cS.y-cD.y;
      /* 形状校验：顶点数相等 → 逐点平均偏差 <1m；
         点数不等 → 仅非严格来源（按块留档）允许，面积差 <1% 兜底（管线随后裁回环内）。
         严格来源（SAVE_KEY 兜底）点数不等一律拒绝 —— 防同形不同位错配。 */
      var ok=false;
      if(ring.length===src.length){
        var sum=0;
        for(var i=0;i<ring.length;i++){
          var ax=src[i].x+dx-ring[i].x,ay=src[i].y+dy-ring[i].y;
          sum+=Math.sqrt(ax*ax+ay*ay);
        }
        ok=(sum/ring.length)<1.0;
      }else if(!cands[ci].strict){
        var a1=Math.abs(ppPolyArea(ring)),a2=Math.abs(ppPolyArea(src));
        ok=a2>1&&(Math.abs(a1-a2)/a2)<0.01;
      }
      if(!ok)continue;
      /* 仅继承非平凡设计：有管线或手动分区线快照 */
      var hasPipes=((d.mainPipes||[]).length+(d.branchPipes||[]).length+(d.subBranchPipes||[]).length)>0;
      var hasCut=!!(d.cutSnap&&((Array.isArray(d.cutSnap.x)&&d.cutSnap.x.length)||(Array.isArray(d.cutSnap.y)&&d.cutSnap.y.length)));
      var hasPartition=!!(d.partitionCuts&&((Array.isArray(d.partitionCuts.x)&&d.partitionCuts.x.length)||(Array.isArray(d.partitionCuts.y)&&d.partitionCuts.y.length)));
      if(!hasPipes&&!hasCut&&!hasPartition)continue;
      var mv=function(lines){return (lines||[]).map(function(l){return (l||[]).map(function(p){return{x:(+p.x)+dx,y:(+p.y)+dy};});});};
      var slot=ppBlankSlot(ring);
      var cutsAreLocal=Math.abs(isFinite(Number(d.zoneAngleDeg))?Number(d.zoneAngleDeg):(d.zoneRotated?90:0))>0.001;
      slot.mainPipes=mv(d.mainPipes);
      slot.branchPipes=mv(d.branchPipes);
      slot.subBranchPipes=mv(d.subBranchPipes);
      slot.valves=(d.valves||[]).map(function(p){return{x:(+p.x)+dx,y:(+p.y)+dy};});
      slot.source=d.source?{x:(+d.source.x)+dx,y:(+d.source.y)+dy}:null;
      /* 轴对齐旧快照保存世界坐标，随地块平移；旋转网格快照保存网格局部坐标，不能平移。 */
      if(d.cutSnap){
        slot.cutSnap={sig:d.cutSnap.sig||'',
          x:Array.isArray(d.cutSnap.x)?d.cutSnap.x.map(function(v){return (+v)+(cutsAreLocal?0:dx);}):null,
          y:Array.isArray(d.cutSnap.y)?d.cutSnap.y.map(function(v){return (+v)+(cutsAreLocal?0:dy);}):null};
      }
      if(d.cutOverrides){
        var ov={x:{},y:{}};
        Object.keys(d.cutOverrides.x||{}).forEach(function(k){ov.x[k]=(+d.cutOverrides.x[k])+(cutsAreLocal?0:dx);});
        Object.keys(d.cutOverrides.y||{}).forEach(function(k){ov.y[k]=(+d.cutOverrides.y[k])+(cutsAreLocal?0:dy);});
        slot.cutOverrides=ov;
      }
      if(d.partitionCuts){
        slot.partitionCuts={
          x:Array.isArray(d.partitionCuts.x)?d.partitionCuts.x.map(function(v){return (+v)+(cutsAreLocal?0:dx);}):[],
          y:Array.isArray(d.partitionCuts.y)?d.partitionCuts.y.map(function(v){return (+v)+(cutsAreLocal?0:dy);}):[]
        };
      }
      if(d.hiddenPipes)slot.hiddenPipes=ppCloneJSON(d.hiddenPipes)||slot.hiddenPipes;
      if(d.pipeIds)slot.pipeIds=ppCloneJSON(d.pipeIds)||slot.pipeIds;
      if(+d.nextPipeId>1)slot.nextPipeId=+d.nextPipeId;
      slot.areaLocked=!!d.areaLocked;
      slot.zoneRotated=!!d.zoneRotated;
      slot.zoneAngleDeg=isFinite(Number(d.zoneAngleDeg))?Number(d.zoneAngleDeg):(slot.zoneRotated?90:0);
      slot.zoneAuto=d.zoneAuto!==false;
      /* 保底裁回环内，并同步重建ID/隐藏映射，避免裁剪改变管线数量后错配。 */
      try{ppClipSlotPipesToRing(slot,ring);}catch(eClip){ }
      return slot;
    }
    return null;
  }

  /* 单地块切换时只从该 ID 的 L2 档案恢复，绝不拿共享快照兜底，以免把另一块的管线
     套到当前边界。形状校验、质心平移和环内裁剪复用组内继承的同一实现。 */
  window.ppRestorePlotDesign=function(plotId){
    if(window.__runyeGroupEdit&&window.__runyeGroupEdit.active)return false;
    var slot=ppInheritSlot({id:plotId,poly:ppState.polyPts},true);
    if(!slot)return false;
    ppApplySlot(slot);
    ppUpdateTransform();ppRender();ppUpdateAutoPipeButton();
    return true;
  };

  /* 载入成组地块时初始化（非成组 → 置 null，UI 自动隐藏） */
  function ppInitGroupEdit(){
    var subs=window.__runyeSubPlots;
    if(!subs||subs.length<2){ window.__runyeGroupEdit=null; ppSyncGroupEditUI(); return false; }
    var frame=(window.measuredPolygon||[]).map(function(p){return{x:+p.x,y:+p.y};});
    window.__runyeGroupEdit={
      /* 新组默认逐块显示：成组只汇总成员，不把成员重新当成一个大地块分区。
         用户仍可显式切到整组只读总览。 */
      active:true, mode:'perPlot', current:0,
      framePts:frame,                                   // 整组模式用的参考外框（不参与面积）
      /* [v677 成组继承] 逐块尝试从「按块设计留档 / 主存档」继承该块在单地块态的
         设计（管线+分区线位，质心平移对位）；没命中给空白槽（与旧行为一致）。 */
      slots:subs.map(function(s){ return ppInheritSlot(s)||ppBlankSlot(s.poly); }),
      trunkPipes:[], trunkHidden:{}                     // 总管：跨块手动画，不进各块统计
    };
    ppApplySlot(window.__runyeGroupEdit.slots[0]);
    ppSyncGroupEditUI();
    return true;
  }

  /* 当前编辑对象的环：非成组=null（走 polyPts）；整组=全部成员环；逐块=[当前块] */
  function ppGroupActiveSubs(){
    var subs=window.__runyeSubPlots;
    if(!subs||!subs.length)return null;
    var ge=window.__runyeGroupEdit;
    if(ge&&ge.active&&ge.mode==='perPlot'){
      var one=subs[ge.current];
      return one?[one]:null;
    }
    return subs;
  }

  function ppSaveGroupMemberSlots(changes){
    var ge=window.__runyeGroupEdit;
    if(!ge||!ge.slots||!Array.isArray(changes)||!changes.length)return false;
    if(typeof window.grCommitGroupMemberSlots==='function'){
      return window.grCommitGroupMemberSlots(changes)===true;
    }
    return false;
  }
  function ppSaveGroupMemberSlot(index, slot){
    return ppSaveGroupMemberSlots([{index:index,slot:slot}]);
  }

  function ppSetGroupMode(mode){
    var ge=window.__runyeGroupEdit;
    if(!ge||!ge.active)return;
    mode=(mode==='perPlot')?'perPlot':'whole';
    if(ge.mode===mode){ ppSyncGroupEditUI(); return; }
    if(mode==='perPlot'){
      /* 整组 → 逐块：整组态的管线是「各块合并出来的只读视图」，不存档；
         直接载入当前块的 slot（坐标都是同一世界坐标系，无需换算） */
      var memberRead=ppReadGroupMemberSlot(ge,ge.current);
      if(!memberRead.ok)return;
      ge.mode='perPlot';
      ppApplySlot(memberRead.slot);
      ppState.history=[];                 // 撤销栈不跨块
    }else{
      /* 逐块 → 整组：先把当前块存回 slot，再切成外框 + 合并视图 */
      if(!ppSaveGroupMemberSlot(ge.current,ppCaptureSlot()))return;
      var merged=ppCollectGroupAllPipes();
      if(!merged)return;
      ge.mode='whole';
      ppState.polyPts=ge.framePts.map(function(p){return{x:p.x,y:p.y};});
      ppState.mainPipes=merged.main; ppState.branchPipes=merged.branch;
      ppState.subBranchPipes=merged.subbranch;
      ppState.source=null; ppState.valves=[];
      ppState.pipeIds={main:[],branch:[],subbranch:[]}; ppState.nextPipeId=1;
      ppState.hiddenPipes={main:{},branch:{},subbranch:{}};
      ppEnsurePipeIds('main');ppEnsurePipeIds('branch');ppEnsurePipeIds('subbranch');
      ppState.history=[];
    }
    /* 模式跟着切：[v194] 整组态没有任何可画的块级模式了（总管已迁去「成组管路」页），
       统一落到「管线拾取」（只读量长度）；逐块态回到「主管」。
       不跟着切的话，切完仍停在被禁用的模式上，画面上看不出为什么点不动。 */
    if(mode==='whole'){ if(ppGroupEditBlocks(ppState.mode))ppState.mode='pickPipe'; }
    else { if(ppState.mode==='pickPipe')ppState.mode='main'; }
    ppState.currentLine=[]; ppState.hoverPt=null; ppState.dragCut=null; ppState.hoverCut=null;
    if(mode==='whole') ppResetCutSnap('');
    ppUpdateTransform(); ppRender();
    ppSyncGroupEditUI();
    ppRefreshDiagramOrReset();
  }

  function ppSelectGroupPlot(i){
    var ge=window.__runyeGroupEdit;
    if(!ge||!ge.active)return;
    i=parseInt(i,10)||0;
    if(i<0||i>=ge.slots.length||i===ge.current)return;
    if(ge.mode==='perPlot'&&!ppSaveGroupMemberSlot(ge.current,ppCaptureSlot()))return;   // 提交旧块后再切换
    var memberRead=ge.mode==='perPlot'?ppReadGroupMemberSlot(ge,i):null;
    if(memberRead&&!memberRead.ok)return;
    ge.current=i;
    /* [v242] 「从成组页进来」时换块 ⇒ 返回落点跟着换（退回成组页要停在用户最后看的那一块，
       否则按块高亮会指回原来那块，用户会以为没生效）。非该路径进来的不置标记。 */
    if(window.__runyeGroupPlotEdit!=null)window.__runyeGroupPlotEdit=i;
    if(ge.mode==='perPlot') ppApplySlot(memberRead.slot);            // canonical优先投影成员槽
    ppState.currentLine=[]; ppState.hoverPt=null;
    ppState.dragCut=null; ppState.hoverCut=null; ppState.history=[];
    // Keep the selected block's saved cuts; getZoneCuts validates the geometry signature.
    ppUpdateTransform(); ppRender();
    ppSyncGroupEditUI();
    ppUpdateAutoPipeButton(); ppUpdatePickResult(null);
    ppRefreshDiagramOrReset();
  }

  /* 整组态的「只读合并视图」：各块管线 + 总管（用于总览与出总图） */
  function ppCollectGroupAllPipes(){
    var ge=window.__runyeGroupEdit;
    var out={main:[],branch:[],subbranch:[]};
    if(!ge||!ge.active)return out;
    var memberRead=ppReadGroupMemberSlots(ge);
    if(!memberRead.ok)return null;
    memberRead.slots.forEach(function(s){
      (s.mainPipes||[]).forEach(function(l){out.main.push(l.map(function(p){return{x:p.x,y:p.y};}));});
      (s.branchPipes||[]).forEach(function(l){out.branch.push(l.map(function(p){return{x:p.x,y:p.y};}));});
      (s.subBranchPipes||[]).forEach(function(l){out.subbranch.push(l.map(function(p){return{x:p.x,y:p.y};}));});
    });
    return out;
  }

  /* 整组态：块级编辑一律拦掉，只留「管线拾取」（只读量长度）。
     ★ 不拦的后果：整组态画的管线落在哪个块、算进谁的水力，无从判断 —— 正是用户担心的串味。
     [v194] 总管改为在「成组管路」页统一编辑，二级页不再有总管模式 ⇒ 放行表里去掉 'trunk'。 */
  function ppGroupEditBlocks(mode){
    var ge=window.__runyeGroupEdit;
    if(!ge||!ge.active||ge.mode!=='whole')return false;
    return mode!=='pickPipe';
  }
  /* 总管：成组地块专属的跨块连接层，独立于 ppState（不进任何一块的水力/材料统计）。
     [v194] 这里只剩**只读渲染** —— 编辑入口已迁到「成组管路」页（#grPipeSection），
     二级页不再提供 ppAddTrunkPipe / trunk 模式，避免同一份数据两个入口。 */
  function ppDrawGroupTrunk(){
    var ge=window.__runyeGroupEdit;
    if(!ge||!ge.active||!ge.trunkPipes||!ge.trunkPipes.length)return;
    ge.trunkPipes.forEach(function(l,i){
      if(ge.trunkHidden&&ge.trunkHidden['t'+i])ppDrawLine(l,'rgba(100,116,139,.55)',4,[7,5]);
      else ppDrawLine(l,'#7c3aed',5);
    });
  }

  function ppSyncGroupEditUI(){
    var ge=window.__runyeGroupEdit;
    var wrap=document.getElementById('ppGroupEditWrap');
    var bWhole=document.getElementById('ppGeWhole');
    var bPer=document.getElementById('ppGePerPlot');
    var sel=document.getElementById('ppGePlotSel');
    var on=!!(ge&&ge.active&&ge.slots&&ge.slots.length>=2);
    if(!wrap)return;
    wrap.style.display=on?'':'none';
    /* [v242] 「◀ 返回成组管路」只在**从成组页双击地块进来的**时候显示 ——
       window.__runyeGroupPlotEdit 就是那条手势的标记（由 grEnterPlotL2 写、grBackFromPlotEdit 清）。
       手动点「逐块」切进来的不显示：那时并没有「上一页」可退，摆一个返回键只会让人误会。 */
    var back=document.getElementById('ppBackToGroupBtn');
    if(back)back.style.display=(window.__runyeGroupPlotEdit==null)?'none':'';
    if(!on){ grSyncSecondLevelToGroupPage(); return; }
    /* [v194] 成组态有变化就同步给「成组管路」页（它俩看的是同一份 __runyeGroupEdit） */
    grSyncSecondLevelToGroupPage();
    if(bWhole)bWhole.classList.toggle('active',ge.mode==='whole');
    if(bPer)bPer.classList.toggle('active',ge.mode==='perPlot');
    if(sel){
      /* [v228] 下拉已由块按钮列表（#ppGePlotChips）取代 → select 恒隐藏，
         仅作值同步锚点（旧逻辑读 sel.value 的引用路径不变）。 */
      sel.style.display='none';
      var subs=window.__runyeSubPlots||[];
      var keep=sel.value;
      sel.innerHTML='';
      subs.forEach(function(s,i){
        var op=document.createElement('option');
        op.value=String(i);
        op.textContent=(s&&s.name)||('子地块'+(i+1));
        sel.appendChild(op);
      });
      sel.value=String(ge.current);
      if(keep&&sel.value!==keep)sel.value=String(ge.current);
    }
    /* [v228 2026-10-05 用户要求] 逐块模式：子地块平铺块按钮 —— 一块一钮、当前块高亮，
       点钮即切（事件委托见 bindGroupEditUI）。整组态隐藏；签名校验避免每帧重建。 */
    var chips=document.getElementById('ppGePlotChips');
    if(chips){
      chips.style.display=(ge.mode==='perPlot')?'flex':'none';
      var subsC=window.__runyeSubPlots||[];
      var sig=subsC.length+':'+ge.current;
      if(chips.getAttribute('data-sig')!==sig){
        chips.innerHTML='';
        subsC.forEach(function(s,i){
          var c=document.createElement('button');
          c.type='button';
          c.className='pp-btn-ghost pp-ge-chip';
          c.setAttribute('data-idx',String(i));
          c.textContent=(s&&s.name)||('块'+(i+1));
          chips.appendChild(c);
        });
        chips.setAttribute('data-sig',sig);
      }
      Array.prototype.forEach.call(chips.children,function(c){
        c.classList.toggle('active',parseInt(c.getAttribute('data-idx'),10)===ge.current);
      });
    }
    /* 整组态：把块级编辑按钮（主管/支管/一级管/水源/阀门/调网格）置灰禁用 ——
       与其点了再弹窗报错，不如根本点不动，从交互上杜绝「在整组态画了不知算哪块的管」。 */
    document.querySelectorAll('#ppToolbar [data-mode]').forEach(function(b){
      var m=b.getAttribute('data-mode');
      var blocked=on&&ge.mode==='whole'&&ppGroupEditBlocks(m);
      b.classList.toggle('pp-ge-disabled',!!blocked);
      if(blocked){
        /* 原 title 先存起来，解除禁用时原样还回去（调网格的 title 是长说明，不能丢） */
        if(!b.hasAttribute('data-ge-title0'))b.setAttribute('data-ge-title0', b.getAttribute('title')||'');
        b.setAttribute('disabled','disabled');
        b.title='整组为总览态：块级编辑请切到「逐块」';
      }else{
        b.removeAttribute('disabled');
        if(b.hasAttribute('data-ge-title0')){
          var t0=b.getAttribute('data-ge-title0');
          if(t0)b.setAttribute('title',t0); else b.removeAttribute('title');
          b.removeAttribute('data-ge-title0');
        }
      }
    });
  }

  // Deep clone pipe planning state for undo
  function ppCloneState(){
    return {
      mainPipes:ppState.mainPipes.map(function(l){return l.map(function(p){return{x:p.x,y:p.y};});}),
      branchPipes:ppState.branchPipes.map(function(l){return l.map(function(p){return{x:p.x,y:p.y};});}),
      subBranchPipes:(ppState.subBranchPipes||[]).map(function(l){return l.map(function(p){return{x:p.x,y:p.y};});}),
      source:ppState.source?{x:ppState.source.x,y:ppState.source.y}:null,
      valves:ppState.valves.map(function(p){return{x:p.x,y:p.y};}),
      currentLine:ppState.currentLine.map(function(p){return{x:p.x,y:p.y};}),
      pipeLevel:ppState.pipeLevel||'two',
      hiddenPipes:{main:Object.assign({},ppState.hiddenPipes.main),branch:Object.assign({},ppState.hiddenPipes.branch),subbranch:Object.assign({},ppState.hiddenPipes.subbranch||{})},
      pipeIds:{main:ppState.pipeIds.main.slice(),branch:ppState.pipeIds.branch.slice(),subbranch:(ppState.pipeIds.subbranch||[]).slice()},
      nextPipeId:ppState.nextPipeId,
      cutOverrides:{
        x:Object.assign({},ppState.cutOverrides.x),
        y:Object.assign({},ppState.cutOverrides.y)
      },
      cutSnap:{
        sig:(ppState.cutSnap&&ppState.cutSnap.sig)||'',
        x:(ppState.cutSnap&&ppState.cutSnap.x)?ppState.cutSnap.x.slice():null,
        y:(ppState.cutSnap&&ppState.cutSnap.y)?ppState.cutSnap.y.slice():null
      },
      zoneAngleDeg:ppZoneAngle(),zoneRotated:!!ppState.zoneRotated,areaLocked:!!ppState.areaLocked,
      zoneAuto:ppState.zoneAuto!==false,
      /* [v913] undo 快照必须带接驳节点参数——手工字段清单，漏加即 undo 不回退节点 */
      couplerNodes:JSON.parse(JSON.stringify(ppState.couplerNodes||[]))
    };
  }

  function ppPushHistory(){
    /* 历史快照只记录撤销点，不代表自动管线已经按当前角度重建。
       pending 只能由成功的自动布管消费；普通编辑/保存动作不得清掉重建要求。 */
    if(!ppState.history)ppState.history=[];
    var snapshot=ppCloneState();
    /* Group operations such as clear-all mutate every member slot while the canvas
       shows only a merged, read-only view. Keep the member source data with the undo
       frame; the merged ppState alone cannot reconstruct which member owned a pipe. */
    var ge=window.__runyeGroupEdit;
    if(ge&&ge.active){
      var members=ppReadGroupMemberSlots(ge);
      if(!members.ok)return false;
      snapshot.groupSlots=members.slots.map(function(slot){return ppCloneJSON(slot);});
      if(ge.mode==='perPlot'&&ge.current>=0&&ge.current<snapshot.groupSlots.length){
        snapshot.groupSlots[ge.current]=ppCaptureSlot();
      }
    }
    ppState.history.push(snapshot);
    if(ppState.history.length>50)ppState.history.shift();
    return true;
  }

  function ppRestoreState(snap){
    ppState.mainPipes=snap.mainPipes.map(function(l){return l.map(function(p){return{x:p.x,y:p.y};});});
    ppState.branchPipes=snap.branchPipes.map(function(l){return l.map(function(p){return{x:p.x,y:p.y};});});
    ppState.subBranchPipes=(snap.subBranchPipes||[]).map(function(l){return l.map(function(p){return{x:p.x,y:p.y};});});
    ppState.source=snap.source?{x:snap.source.x,y:snap.source.y}:null;
    ppState.valves=snap.valves.map(function(p){return{x:p.x,y:p.y};});
    ppState.currentLine=snap.currentLine.map(function(p){return{x:p.x,y:p.y};});
    ppState.pipeLevel=snap.pipeLevel||'two';
    ppState.hiddenPipes={main:Object.assign({},snap.hiddenPipes.main),branch:Object.assign({},snap.hiddenPipes.branch),subbranch:Object.assign({},snap.hiddenPipes.subbranch||{})};
    ppState.pipeIds={main:snap.pipeIds.main.slice(),branch:snap.pipeIds.branch.slice(),subbranch:(snap.pipeIds.subbranch||[]).slice()};
    ppState.nextPipeId=snap.nextPipeId;
    ppState.cutOverrides={
      x:Object.assign({},snap.cutOverrides.x),
      y:Object.assign({},snap.cutOverrides.y)
    };
    ppState.cutSnap={
      sig:(snap.cutSnap&&snap.cutSnap.sig)||'',
      x:(snap.cutSnap&&snap.cutSnap.x)?snap.cutSnap.x.slice():null,
      y:(snap.cutSnap&&snap.cutSnap.y)?snap.cutSnap.y.slice():null
    };
    ppState.zoneAngleDeg=isFinite(Number(snap.zoneAngleDeg))?Number(snap.zoneAngleDeg):(snap.zoneRotated?90:0);
    ppState.zoneRotated=!!snap.zoneRotated;
    ppState.areaLocked=!!snap.areaLocked;
    /* [v913] undo 恢复接驳节点参数：旧历史条目无此字段 ⇒ 恢复为空数组（节点尚未创建，语义正确） */
    ppState.couplerNodes=JSON.parse(JSON.stringify(snap.couplerNodes||[]));
    if(typeof snap.zoneAuto==='boolean'){
      ppState.zoneAuto=snap.zoneAuto;
      try{localStorage.setItem('runye_zone_auto',snap.zoneAuto?'1':'0');}catch(e){}
      ppApplyZoneAutoUI();
    }
    ppUpdateLockAreaBtn();
    ppSyncZoneAngleUI();
    ppState.mergePreview=null;
    if(typeof ppSyncPipeLevelUI==='function')ppSyncPipeLevelUI(); // 该函数未定义时跳过，避免回退中断
  }

  function ppUndoStep(){
    if(!ppState.history||ppState.history.length===0)return false;
    var snap=ppState.history[ppState.history.length-1];
    if(ppIsGroupWhole()){
      if(!Array.isArray(snap.groupSlots)||snap.groupSlots.length!==(window.__runyeSubPlots||[]).length)return false;
      var current=ppCloneState(), changes=snap.groupSlots.map(function(slot,index){
        return {index:index,slot:ppCloneJSON(slot)};
      });
      if(changes.some(function(change){return !change.slot;})||!ppSaveGroupMemberSlots(changes)){
        ppRestoreState(current);
        return false;
      }
      ppRestoreState(snap);
      ppState.history.pop();
      return true;
    }
    var groupPreimage=ppGroupMemberPreimage();
    if(groupPreimage&&groupPreimage.invalid)return false;
    var singlePreimage=!groupPreimage&&typeof window.ppGetState==='function'?window.ppGetState():null;
    var current=ppCloneState();
    ppRestoreState(snap);
    if(groupPreimage&&!ppCommitGroupMemberEdit(groupPreimage,'undo')){
      ppRestoreState(current);return false;
    }
    if(singlePreimage&&!ppCommitSinglePlotEdit(singlePreimage,'undo',false,true)){
      ppRestoreState(current);return false;
    }
    ppState.history.pop();
    return true;
  }

  /* [v652c] includeFrozen=true：逐块态把冻结邻块的显示外框并入取景框 ——
     只给**交互画布**的取景/适配用（ppUpdateTransform / ppContentSize），
     施工简图出图（另一个调用点）必须保持当前块口径，不许把邻块框进图纸。 */
  function ppGetDisplayBounds(includeFrozen){
    if(!ppState.polyPts.length)return{minX:0,minY:0,w:1,h:1};
    var base=ppGetBounds();
    var rotated=ppBoundsFromPoints(ppGetRotatedPlotPoints());
    var minX=Math.min(base.minX,rotated.minX);
    var minY=Math.min(base.minY,rotated.minY);
    var maxX=Math.max(base.minX+base.w,rotated.minX+rotated.w);
    var maxY=Math.max(base.minY+base.h,rotated.minY+rotated.h);
    if(includeFrozen){
      var fr=ppGetFrozenSubRings();
      if(fr)fr.forEach(function(r){
        var fb=ppBoundsFromPoints(r.poly);
        minX=Math.min(minX,fb.minX);minY=Math.min(minY,fb.minY);
        maxX=Math.max(maxX,fb.minX+fb.w);maxY=Math.max(maxY,fb.minY+fb.h);
      });
    }
    return{minX:minX,minY:minY,w:maxX-minX,h:maxY-minY};
  }

  function ppNiceStep(range,targetCount){
    if(range<=0||!isFinite(range))return 10;
    var raw=range/targetCount;
    var mag=Math.pow(10,Math.floor(Math.log10(raw)));
    var norm=raw/mag;
    var step;
    if(norm<1.5)step=1;else if(norm<3)step=2;else if(norm<7)step=5;else step=10;
    return step*mag;
  }

  function ppZoneSizeLabel(w,h){
    function f(v){
      if(!isFinite(v))return '—';
      var rounded=Math.round(v);
      return Math.abs(v-rounded)<0.05?String(rounded):v.toFixed(1);
    }
    return f(w)+'×'+f(h)+'m';
  }

  function ppSplitLength(total,step){
    /* [v877] 改为委托唯一实现 zone-geometry.splitZoneLength（窄条吸收）。
       旧本地副本 `rest>0.05 → push(rest)` 会把余数独立成贴边窄条段，且与
       manualZoneLayout / ppGetZoneLayout（走 zone-geometry）失配：
       layout.N ≠ cuts.zoneCount（655×327 / 45亩 实测 9 vs 12）。 */
    return window.RyZoneGeometry.splitZoneLength(total, step,
      (typeof MAX_MANUAL_ZONE_COUNT === 'number') ? MAX_MANUAL_ZONE_COUNT : 500);
  }

  // ===== 分区线快照（支持拖动合并减区）=====
  // 基础划分签名：地块尺寸/分区行列数/设计分区尺寸任一变化，手动调整即失效并重置
  function ppCutSig(dims,nx,ny,xDesign,yDesign){
    return [Math.round((dims.w||0)*100),Math.round((dims.h||0)*100),nx,ny,Math.round((xDesign||0)*100),Math.round((yDesign||0)*100)].join('_');
  }
  // 1 画布像素对应的世界坐标长度（用于把"像素阈值"换算成世界距离）
  function ppWorldPerPixel(axis){
    var t=ppState.transform;
    if(!t)return 1;
    var ps=(axis==='x'?t.scaleX:t.scaleY)*(t.scale||1);
    if(!ps||!isFinite(ps)||ps===0)return 1;
    return 1/Math.abs(ps);
  }
  function ppResetCutSnap(sig){
    ppState.cutSnap={sig:sig||'',x:null,y:null};
    ppState.mergePreview=null;
    return ppState.cutSnap;
  }
  // 用快照中的内部线位置重建 [起点, ...内部线, 终点]
  function ppApplyCutSnap(pos,snapArr){
    if(!snapArr||!snapArr.length)return pos;
    var lo=pos[0],hi=pos[pos.length-1];
    var mid=snapArr.filter(function(v){return isFinite(v)&&v>lo+0.5&&v<hi-0.5;}).sort(function(a,b){return a-b;});
    var out=[],prev=lo;
    for(var i=0;i<mid.length;i++){
      if(mid[i]-prev>=0.5){out.push(mid[i]);prev=mid[i];}
    }
    return [lo].concat(out,[hi]);
  }
  // 取当前分区线数组（含手动调整与合并结果），index 为内部线索引（1..len-2）
  function ppCurrentCuts(){
    if(!ppState.polyPts||ppState.polyPts.length<3)return null;
    var b=ppGetBounds();
    var planN=parseInt(document.getElementById('planN')?.value)||parseInt(document.getElementById('fld_N')?.value)||4;
    return ppGetZoneCuts(b,ppGetZoneLayout(b,planN));
  }
  // 设置第 index 条内部线的位置（写入快照）
  function ppSetCutPos(axis,index,pos){
    var cuts=ppCurrentCuts();
    if(!cuts)return;
    var arr=cuts[axis==='x'?'xPos':'yPos'];
    if(index<=0||index>=arr.length-1)return;
    var snap=ppState.cutSnap;
    if(!snap||snap.sig!==cuts.sig)snap=ppResetCutSnap(cuts.sig);
    var seed=snap[axis];
    if(!seed||seed.length!==arr.length-2){
      seed=[];
      for(var i=1;i<arr.length-1;i++)seed.push(arr[i]);
      snap[axis]=seed;
    }
    seed[index-1]=pos;
  }
  // 拖动某条内部线：靠近相邻内部线 OR 地块边界时吸附并标记待合并；否则夹在两邻线之间
  // target 含义：
  //   1..arr.length-2 → 合并到那条相邻内部线（保留目标线位置）
  //   0               → 合并到地块上边界 / 左边界（整条线消失）
  //   arr.length-1    → 合并到地块下边界 / 右边界（整条线消失）
  function ppDragCutTo(axis,index,newPos){
    var cuts=ppCurrentCuts();
    if(!cuts)return null;
    var arr=cuts[axis==='x'?'xPos':'yPos'];
    if(index<=0||index>=arr.length-1)return null;
    var lo=arr[index-1],hi=arr[index+1];
    var thr=Math.max(2,25*ppWorldPerPixel(axis));   // 合并吸附阈值 ≈25 画布像素（放宽，拖到边线即合并）
    var minGap=Math.max(2,4*ppWorldPerPixel(axis)); // 与相邻线的最小间距
    var target=-1;
    if(index===1 && newPos<=lo+thr)target=0;                              // 第一条线拖到上/左边线(可越过)→合并到边线
    else if(index===arr.length-2 && newPos>=hi-thr)target=arr.length-1;     // 最后一条线拖到下/右边线(可越过)→合并到边线
    else if(index-1>=1 && newPos>lo-minGap && newPos<=lo+thr)target=index-1; // 中间线拖到上一条内部线附近
    else if(index+1<=arr.length-2 && newPos<hi+minGap && newPos>=hi-thr)target=index+1; // 中间线拖到下一条内部线附近
    if(target>=0){
      // 几乎重合：保留极小偏移（>过滤阈值）让线在拖动中仍可见，松手时真正合并
      var off=Math.max(0.6,0.75*ppWorldPerPixel(axis));
      var tp;
      if(target===0)tp=lo+off;
      else if(target===arr.length-1)tp=hi-off;
      else tp=(target<index)?(arr[target]+off):(arr[target]-off);
      ppSetCutPos(axis,index,tp);
      ppState.mergePreview={axis:axis,index:index,target:target};
      return {merge:true,target:target,count:arr.length-1};
    }
    ppState.mergePreview=null;
    var lo2=lo+minGap,hi2=hi-minGap;
    if(lo2>hi2)lo2=hi2=(lo+hi)/2;
    ppSetCutPos(axis,index,Math.max(lo2,Math.min(hi2,newPos)));
    return {merge:false,count:arr.length-1};
  }
  // 松手时执行合并：删除被拖动的那条线。target=0/length-1 表示合并到边界（整条消失），其他表示合并到相邻内部线
  function ppCommitMerge(){
    var mp=ppState.mergePreview;
    ppState.mergePreview=null;
    if(!mp)return false;
    var snap=ppState.cutSnap;
    var arr=snap&&snap[mp.axis];
    if(!arr||arr.length===0)return false;
    var i=mp.index-1;
    if(i<0||i>=arr.length)return false;
    arr.splice(i,1);
    // 选中线索引：合并到边界时已无线可选；合并到相邻内部线时指向目标
    if(mp.target===0||mp.target===(arr.length+1))ppState.lastSelectedCut=null;
    else{
      var newIdx=(mp.target<mp.index)?mp.target:(mp.target-1);
      if(newIdx>=1&&newIdx<=arr.length)ppState.lastSelectedCut={axis:mp.axis,index:newIdx};
      else ppState.lastSelectedCut=null;
    }
    return true;
  }

  /* v98d：只移动第 index 条内部线（夹在左右邻线之间），不做「拖到邻线即合并」。
     三级画布拖「组边界线」用，避免误合并导致手动分组的区号失效。 */
  function ppDragCutPosOnly(axis,index,newPos){
    var cuts=ppCurrentCuts(); if(!cuts)return null;
    var arr=cuts[axis==='x'?'xPos':'yPos'];
    if(index<=0||index>=arr.length-1)return null;
    var lo=arr[index-1],hi=arr[index+1];
    var minGap=Math.max(2,4*ppWorldPerPixel(axis));
    var lo2=lo+minGap,hi2=hi-minGap;
    if(lo2>hi2)lo2=hi2=(lo+hi)/2;
    ppState.mergePreview=null;
    ppSetCutPos(axis,index,Math.max(lo2,Math.min(hi2,newPos)));
    return {merge:false,count:arr.length-1};
  }

  /* 任务K（2026-09-26）：面积锁定状态下的整轴刚性平移。
     拖动任一条内部线时，整条轴（所有内部线）按相同 delta 平移，格宽不变 → 各区面积不变。
     不做合并、不夹在邻线之间，仅在地块边界内做整体平移约束。 */
  function ppDragCutAxis(axis,anchorIndex,newPos){
    var cuts=ppCurrentCuts();
    if(!cuts)return null;
    var key=axis==='x'?'xPos':'yPos';
    var arr=cuts[key];
    if(anchorIndex<=0||anchorIndex>=arr.length-1)return null;
    var minGap=Math.max(2,4*ppWorldPerPixel(axis));
    var delta=newPos-arr[anchorIndex];
    // 约束整体平移，使最外侧两条内部线仍落在地块边界内（保持格序）
    var dMin=arr[0]+minGap-arr[1];
    var dMax=arr[arr.length-1]-minGap-arr[arr.length-2];
    if(dMin>dMax){ delta=0; }
    else { if(delta<dMin)delta=dMin; if(delta>dMax)delta=dMax; }
    var orig=arr.slice();
    for(var i=1;i<arr.length-1;i++){ ppSetCutPos(axis,i,orig[i]+delta); }
    ppState.mergePreview=null;
    return {merge:false,count:arr.length-1,axis:axis,delta:delta};
  }

  function ppGetZoneCutSignature(b,layout){
    var dims=ppGetPlanDims(b);
    var frame=ppGridFrame(ppState.polyPts,b,dims),gd=frame?frame.bounds:dims;
    var xDesign=layout.designW || layout.zoneW,yDesign=layout.designH || layout.zoneH;
    var xPlan=ppSplitLength(gd.w,xDesign),yPlan=ppSplitLength(gd.h,yDesign);
    return ppCutSig(gd,xPlan.length,yPlan.length,xDesign,yDesign)+'|a'+ppZoneAngle().toFixed(3);
  }
  function ppGetZoneCuts(b,layout){
    var dims=ppGetPlanDims(b);
    var frame=ppGridFrame(ppState.polyPts,b,dims),gd=frame?frame.bounds:{minX:0,minY:0,maxX:dims.w,maxY:dims.h,w:dims.w,h:dims.h};
    var xDesign=layout.designW || layout.zoneW,yDesign=layout.designH || layout.zoneH;
    var xPlan=ppSplitLength(gd.w,xDesign),yPlan=ppSplitLength(gd.h,yDesign);
    var xSrc=[],ySrc=[],xPos=[gd.minX],yPos=[gd.minY];
    for(var xi=0;xi<xPlan.length;xi++){xSrc.push(xPlan[xi]);xPos.push(xPos[xPos.length-1]+xSrc[xi]);}
    for(var yi=0;yi<yPlan.length;yi++){ySrc.push(yPlan[yi]);yPos.push(yPos[yPos.length-1]+ySrc[yi]);}
    xPos[xPos.length-1]=gd.maxX;
    yPos[yPos.length-1]=gd.maxY;
    // 应用手动拖动/合并后的内部切割线快照（线数量可变 → 分区数随之变化）
    var sig=ppGetZoneCutSignature(b,layout);
    var snap=ppState.cutSnap;
    if(!snap||snap.sig!==sig)snap=ppResetCutSnap(sig);
    xPos=ppApplyCutSnap(xPos,snap.x);
    yPos=ppApplyCutSnap(yPos,snap.y);
    xSrc=[];xPlan=[];
    for(var xa=0;xa<xPos.length-1;xa++){
      var wSrc=xPos[xa+1]-xPos[xa];
      xSrc.push(wSrc);
      xPlan.push(wSrc);
    }
    ySrc=[];yPlan=[];
    for(var ya=0;ya<yPos.length-1;ya++){
      var hSrc=yPos[ya+1]-yPos[ya];
      ySrc.push(hSrc);
      yPlan.push(hSrc);
    }
    return {xPlan:xPlan,yPlan:yPlan,xSrc:xSrc,ySrc:ySrc,xPos:xPos,yPos:yPos,cols:xPlan.length,rows:yPlan.length,designW:xDesign,designH:yDesign,sig:sig,zoneCount:xPlan.length*yPlan.length,frame:frame,bounds:gd};
  }

  // ===== 分区真实面积（裁剪到地块多边形）=====
  // 多边形面积（鞋带公式），pts: [{x,y},...]
  function ppPolyArea(pts){
    return window.RyZoneGeometry.polyAreaM2(pts);
  }
  // Sutherland-Hodgman：将多边形裁剪到轴对齐矩形 [x0,y0]-[x1,y1]
  function ppClipPolyToRect(poly,x0,y0,x1,y1){
    return window.RyZoneGeometry.clipPolyToRect(poly,x0,y0,x1,y1);
  }
  // 分区网格 cell(zc,zr) 实际落在线段多边形内的面积（m²）
  // plotPoly 与 zoneCuts 须处于同一世界坐标（米）
  function ppZoneActualAreaM2(zc,zr,zoneCuts,plotPoly){
    var nom=zoneCuts.xPlan[zc]*zoneCuts.yPlan[zr];
    var x0=zoneCuts.xPos[zc], y0=zoneCuts.yPos[zr];
    var x1=zoneCuts.xPos[zc+1], y1=zoneCuts.yPos[zr+1];
    /* [v190] 成组地块：分区实际面积 = Σ「各成员环裁剪到本分区」的面积。
       ★ 块间空隙不属于任何一个成员环 ⇒ 不计入面积（用户原话：
         「两个地块之间有 3 米，那这个三米就留着…不要自动填充面积，这里就空着」）。
       若按 ppState.polyPts（= 外框/凸包）算，空隙会被当成地块面积吞掉。 */
    var rings=ppGetSubPlotRings();
    if(rings){
      var sum=0;
      for(var ri=0;ri<rings.length;ri++){
        var local=zoneCuts.frame?rings[ri].map(zoneCuts.frame.toGrid):rings[ri];
        sum+=ppPolyArea(ppClipPolyToRect(local,x0,y0,x1,y1));
      }
      return sum;
    }
    if(!plotPoly||plotPoly.length<3)return nom;
    var plotLocal=zoneCuts.frame?plotPoly.map(zoneCuts.frame.toGrid):plotPoly;
    var clipped=ppClipPolyToRect(plotLocal,x0,y0,x1,y1);
    return ppPolyArea(clipped);
  }

  function ppUpdateTransform(){
    if(!ppState.polyPts.length)return;
    var b=ppGetBounds();var displayB=ppGetDisplayBounds(true);var pad=50;   /* [v652c] 逐块态取景含冻结邻块 */
    var dims=ppGetPlanDims(b);
    var planScaleX=b.w>0?dims.w/b.w:1;
    var planScaleY=b.h>0?dims.h/b.h:1;
    var displayW=displayB.w*planScaleX;
    var displayH=displayB.h*planScaleY;
    var s=0.5*ppState.zoom; // 固定比例 1px=2m，乘以zoom
    ppState.transform={
      scale:s,minX:displayB.minX,minY:displayB.minY,scaleX:planScaleX,scaleY:planScaleY,
      offsetX:pad+(ppCanvas.width-2*pad-displayW*s)/2,
      offsetY:pad+(ppCanvas.height-2*pad-displayH*s)/2
    };
  }

  function ppToCanvas(mx,my){
    var t=ppState.transform;if(!t)return{x:mx,y:my};
    return{x:(mx-t.minX)*t.scaleX*t.scale+t.offsetX+ppState.panX,y:(my-t.minY)*t.scaleY*t.scale+t.offsetY+ppState.panY};
  }
  function ppToMeters(cx,cy){
    var t=ppState.transform;if(!t)return{x:cx,y:cy};
    return{x:(cx-t.offsetX-ppState.panX)/(t.scaleX*t.scale)+t.minX,y:(cy-t.offsetY-ppState.panY)/(t.scaleY*t.scale)+t.minY};
  }

  function ppCanConstrainLine(){
    return ppState.mode==='main'||ppState.mode==='branch';
  }

  function ppGetConstrainedPoint(raw){
    if(!raw)return raw;
    if(ppState.lineDrawMode!=='ortho'||!ppCanConstrainLine()||ppState.currentLine.length<1){
      return{x:raw.x,y:raw.y};
    }
    var last=ppState.currentLine[ppState.currentLine.length-1];
    var dx=raw.x-last.x;
    var dy=raw.y-last.y;
    if(Math.abs(dx)>=Math.abs(dy)){
      return{x:raw.x,y:last.y};
    }
    return{x:last.x,y:raw.y};
  }

  function ppLineLen(line){
    var len=0;
    if(!line)return len;
    var sx=1,sy=1;
    if(ppState.polyPts&&ppState.polyPts.length>=3){
      var bounds=ppGetBounds();
      var dims=ppGetPlanDims(bounds);
      sx=bounds.w>0?dims.w/bounds.w:1;
      sy=bounds.h>0?dims.h/bounds.h:1;
    }
    for(var i=1;i<line.length;i++){
      var a=line[i-1],b=line[i];
      var dx=(b.x-a.x)*sx;
      var dy=(b.y-a.y)*sy;
      len+=Math.sqrt(dx*dx+dy*dy);
    }
    return len;
  }

  function ppPointToSegmentDistance(p,a,b){
    var vx=b.x-a.x,vy=b.y-a.y;
    var wx=p.x-a.x,wy=p.y-a.y;
    var c1=vx*vx+vy*vy;
    if(c1<=0)return Math.sqrt(wx*wx+wy*wy);
    var t=(wx*vx+wy*vy)/c1;
    t=Math.max(0,Math.min(1,t));
    var px=a.x+t*vx,py=a.y+t*vy;
    var dx=p.x-px,dy=p.y-py;
    return Math.sqrt(dx*dx+dy*dy);
  }

  function ppFindNearestPipe(worldPt){
    var best=null;
    function scan(list,type,label){
      for(var i=0;i<list.length;i++){
        var line=list[i];
        for(var j=1;j<line.length;j++){
          var dist=ppPointToSegmentDistance(worldPt,line[j-1],line[j]);
          if(!best||dist<best.dist){
            best={type:type,label:label,index:i,line:line,dist:dist,length:ppLineLen(line)};
          }
        }
      }
    }
    scan(ppState.mainPipes,'main','主管');
    scan(ppState.branchPipes,'branch','支管');
    if(ppState.subBranchPipes)scan(ppState.subBranchPipes,'subbranch','一级管');
    if(!best)return null;
    var scale=(ppState.transform&&ppState.transform.scale)?ppState.transform.scale:1;
    var sx=(ppState.transform&&ppState.transform.scaleX)?ppState.transform.scaleX:1;
    var sy=(ppState.transform&&ppState.transform.scaleY)?ppState.transform.scaleY:1;
    var avgCanvasScale=Math.max(0.0001,scale*(Math.abs(sx)+Math.abs(sy))/2);
    return best.dist*avgCanvasScale<=14?best:null;
  }

  function ppPipeKey(type,index){
    var group=type==='main'?'main':type==='subbranch'?'subbranch':'branch';
    ppEnsurePipeIds(group);
    var ids=ppState.pipeIds&&ppState.pipeIds[group]?ppState.pipeIds[group]:[];
    var prefix=group==='main'?'m':(group==='subbranch'?'s':'b');
    return ids[index]||(prefix+'-legacy-'+index);
  }

  function ppEnsurePipeIds(group){
    if(!ppState.pipeIds)ppState.pipeIds={main:[],branch:[],subbranch:[]};
    if(!ppState.pipeIds[group])ppState.pipeIds[group]=[];
    var list=group==='main'?ppState.mainPipes:group==='subbranch'?(ppState.subBranchPipes||[]):ppState.branchPipes;
    var prefix=group==='main'?'m':(group==='subbranch'?'s':'b');
    for(var i=0;i<list.length;i++){
      if(!ppState.pipeIds[group][i]){
        ppState.pipeIds[group][i]=prefix+(ppState.nextPipeId++);
      }
    }
    ppState.pipeIds[group]=ppState.pipeIds[group].slice(0,list.length);
  }

  function ppNormalizeHiddenPipes(){
    if(!ppState.hiddenPipes)ppState.hiddenPipes={main:{},branch:{},subbranch:{}};
    ['main','branch','subbranch'].forEach(function(group){
      if(!ppState.hiddenPipes[group])ppState.hiddenPipes[group]={};
      ppEnsurePipeIds(group);
      var normalized={};
      Object.keys(ppState.hiddenPipes[group]).forEach(function(k){
        if(/^\d+$/.test(k)){
          var id=ppState.pipeIds[group][parseInt(k,10)];
          if(id)normalized[id]=true;
        }else{
          normalized[k]=true;
        }
      });
      ppState.hiddenPipes[group]=normalized;
    });
  }

  /* [v897 审计标记·死代码] 手动画管收线链（ppAddPipe ← ppFinishCurrentLine ← dblclick/ppSetMode）
     自 v304（2026-10-08，用户要求）在 canvas mousedown 拦截 main/branch/subbranch 三种落点后
     实际不可达（currentLine 恒为空）。且本函数**绕过 canonical 事务**（无 preimage/无 CAS）——
     未来若恢复手动绘制（删 v304 guard），必须先给本链补 ppCommitSinglePlotEdit 事务，
     参见 project-planning/剩余写路径审计_2026-11-02.md。 */
  function ppAddPipe(type,line){
    try{console.warn('[plot-editor] ppAddPipe 触发：v304 后手动画管链应为死代码，若非测试环境请反馈');}catch(e){}
    var group=type==='main'?'main':type==='subbranch'?'subbranch':'branch';
    if(group==='main')ppState.mainPipes.push(line);
    else if(group==='subbranch'){if(!ppState.subBranchPipes)ppState.subBranchPipes=[];ppState.subBranchPipes.push(line);}
    else ppState.branchPipes.push(line);
    ppEnsurePipeIds(group);
  }


  function ppIsPipeHidden(type,index){
    var group=type==='main'?'main':type==='subbranch'?'subbranch':'branch';
    var key=ppPipeKey(type,index);
    return !!(ppState.hiddenPipes&&ppState.hiddenPipes[group]&&ppState.hiddenPipes[group][key]);
  }

  function ppTogglePipeHidden(pick){
    if(!pick)return;
    var group=pick.type==='main'?'main':pick.type==='subbranch'?'subbranch':'branch';
    var key=ppPipeKey(pick.type,pick.index);
    if(!ppState.hiddenPipes)ppState.hiddenPipes={main:{},branch:{},subbranch:{}};
    if(!ppState.hiddenPipes[group])ppState.hiddenPipes[group]={};
    if(ppState.hiddenPipes[group][key])delete ppState.hiddenPipes[group][key];
    else ppState.hiddenPipes[group][key]=true;
  }

  function ppHasVisiblePipe(type){
    var list=type==='main'?ppState.mainPipes:type==='subbranch'?(ppState.subBranchPipes||[]):ppState.branchPipes;
    for(var i=0;i<list.length;i++){
      if(!ppIsPipeHidden(type,i))return true;
    }
    return false;
  }

  function ppUpdatePickResult(pick){
    ppState.pickedPipe=pick||null;
    if(!ppPickResult)return;
    if(!pick){
      ppPickResult.style.display='none';
      return;
    }
    ppPickResult.style.display='flex';
    document.getElementById('ppPickType').textContent=pick.label;
    document.getElementById('ppPickName').textContent='第 '+(pick.index+1)+' 条'+(ppIsPipeHidden(pick.type,pick.index)?'（已遮蔽）':'');
    document.getElementById('ppPickLength').textContent=pick.length.toFixed(1);
  }

  function ppDrawLine(pts,color,width,dash){
    if(pts.length<1)return;
    ppCtx.strokeStyle=color;ppCtx.lineWidth=width;
    ppCtx.lineCap='round';ppCtx.lineJoin='round';
    if(dash)ppCtx.setLineDash(dash);else ppCtx.setLineDash([]);
    ppCtx.beginPath();
    for(var i=0;i<pts.length;i++){
      var p=ppToCanvas(pts[i].x,pts[i].y);
      if(i===0)ppCtx.moveTo(p.x,p.y);else ppCtx.lineTo(p.x,p.y);
    }
    if(ppState.mouseWorld&&pts===ppState.currentLine){
      var draft=ppGetConstrainedPoint(ppState.mouseWorld);
      var dp=ppToCanvas(draft.x,draft.y);
      ppCtx.lineTo(dp.x,dp.y);
    }
    ppCtx.stroke();ppCtx.setLineDash([]);
  }

  function ppTracePlotPath(){
    /* [v190] 成组地块：把**每个成员环**作为一条子路径画进同一条 path
     * （fill 用 nonzero 绕向，互不相交的环各自填充，块间空隙自然留空）。 */
    var rings=ppGetRotatedSubRings();
    ppCtx.beginPath();
    if(rings){
      rings.forEach(function(r){
        for(var i=0;i<r.length;i++){
          var p=ppToCanvas(r[i].x,r[i].y);
          if(i===0)ppCtx.moveTo(p.x,p.y);else ppCtx.lineTo(p.x,p.y);
        }
        ppCtx.closePath();
      });
      return;
    }
    var pts=ppGetRotatedPlotPoints();
    for(var i=0;i<pts.length;i++){
      var p=ppToCanvas(pts[i].x,pts[i].y);
      if(i===0)ppCtx.moveTo(p.x,p.y);else ppCtx.lineTo(p.x,p.y);
    }
    ppCtx.closePath();
  }

  // ===== Cut-line hit testing & drag =====
  function ppHitTestCutLine(worldPt){
    if(!ppState.polyPts.length)return null;
    var b=ppGetBounds();
    var planN=parseInt(document.getElementById('planN')?.value)||parseInt(document.getElementById('fld_N')?.value)||4;
    var layout=ppGetZoneLayout(b,planN);
    var cuts=ppGetZoneCuts(b,layout);
    var gridPt=cuts.frame?cuts.frame.toGrid(worldPt):worldPt, gb=cuts.bounds||b;
    // threshold in world (image-pixel) units — convert 9 canvas px
    var t=ppState.transform;
    var thr=t?9/(t.scale*(Math.abs(t.scaleX)+Math.abs(t.scaleY))/2):5;
    var best=null;
    // vertical lines (xPos interior 1..len-2)
    for(var xi=1;xi<cuts.xPos.length-1;xi++){
      var dx=Math.abs(gridPt.x-cuts.xPos[xi]);
      if(dx<thr&&gridPt.y>=gb.minY-5&&gridPt.y<=gb.maxY+5){
        if(!best||dx<best.dist){best={axis:'x',index:xi,dist:dx,pos:cuts.xPos[xi]};}
      }
    }
    // horizontal lines (yPos interior 1..len-2)
    for(var yi=1;yi<cuts.yPos.length-1;yi++){
      var dy=Math.abs(gridPt.y-cuts.yPos[yi]);
      if(dy<thr&&gridPt.x>=gb.minX-5&&gridPt.x<=gb.maxX+5){
        if(!best||dy<best.dist){best={axis:'y',index:yi,dist:dy,pos:cuts.yPos[yi]};}
      }
    }
    return best;
  }

  /* v98c：网格线拖动是否就绪 —— 「调网格」模式，或「未在画线」时悬停网格线即可直接拖动
     （免点右侧控制面板的「调网格」）。排除拾取/遮蔽/水源/阀门等专用模式，避免抢占其点击语义。 */
  function ppCutDragReady(){
    if(ppState.mode==='adjustCut')return true;
    if(ppState.mode==='pickPipe'||ppState.mode==='maskPipe'||ppState.mode==='source'||ppState.mode==='valve')return false;
    return ppState.currentLine.length===0;
  }

  function ppDrawCutHandles(b,cuts){
    if(ppState.mode!=='adjustCut')return;
    ppCtx.save();
    var mp=ppState.mergePreview;
    for(var xi=1;xi<cuts.xPos.length-1;xi++){
      var isHover=ppState.hoverCut&&ppState.hoverCut.axis==='x'&&ppState.hoverCut.index===xi;
      var isDrag=ppState.dragCut&&ppState.dragCut.axis==='x'&&ppState.dragCut.index===xi;
      var isSel=ppState.lastSelectedCut&&ppState.lastSelectedCut.axis==='x'&&ppState.lastSelectedCut.index===xi;
      var isMerge=!!(mp&&mp.axis==='x'&&(mp.index===xi||mp.target===xi));
      var gb=cuts.bounds||b,midY=(gb.minY+gb.maxY)/2;
      var hp=ppCutCanvas(cuts,cuts.xPos[xi],midY);
      ppCtx.fillStyle=isMerge?'#f97316':isDrag?'#f59e0b':(isHover||isSel)?'#22c55e':'rgba(59,130,246,.6)';
      ppCtx.strokeStyle='#fff';ppCtx.lineWidth=isMerge?3:2;
      ppCtx.beginPath();ppCtx.arc(hp.x,hp.y,isMerge?9:((isHover||isDrag||isSel)?7:5),0,Math.PI*2);ppCtx.fill();ppCtx.stroke();
    }
    for(var yi=1;yi<cuts.yPos.length-1;yi++){
      var isHover2=ppState.hoverCut&&ppState.hoverCut.axis==='y'&&ppState.hoverCut.index===yi;
      var isDrag2=ppState.dragCut&&ppState.dragCut.axis==='y'&&ppState.dragCut.index===yi;
      var isSel2=ppState.lastSelectedCut&&ppState.lastSelectedCut.axis==='y'&&ppState.lastSelectedCut.index===yi;
      var isMerge2=!!(mp&&mp.axis==='y'&&(mp.index===yi||mp.target===yi));
      var gb2=cuts.bounds||b,midX=(gb2.minX+gb2.maxX)/2;
      var hp2=ppCutCanvas(cuts,midX,cuts.yPos[yi]);
      ppCtx.fillStyle=isMerge2?'#f97316':isDrag2?'#f59e0b':(isHover2||isSel2)?'#22c55e':'rgba(59,130,246,.6)';
      ppCtx.strokeStyle='#fff';ppCtx.lineWidth=isMerge2?3:2;
      ppCtx.beginPath();ppCtx.arc(hp2.x,hp2.y,isMerge2?9:((isHover2||isDrag2||isSel2)?7:5),0,Math.PI*2);ppCtx.fill();ppCtx.stroke();
    }
    // 合并预览提示：拖动线吸附到相邻线/边界时提示松开后的分区数变化
    if(mp){
      var arr=cuts[mp.axis==='x'?'xPos':'yPos'];
      var dirLabel=mp.axis==='x'?'竖向':'横向';
      var perLine=mp.axis==='x'?cuts.rows:cuts.cols;
      var n=Math.max(2,arr.length-1);
      var totalNow=cuts.cols*cuts.rows;
      var tip;
      if(mp.target===0){
        tip='松开鼠标：'+dirLabel+' 第 1 行/列将被移除（'+dirLabel+' '+n+' → '+(n-1)+'，共 '+totalNow+' → '+(totalNow-perLine)+' 区）';
      }else if(mp.target===arr.length-1){
        tip='松开鼠标：'+dirLabel+' 第 '+n+' 行/列将被移除（'+dirLabel+' '+n+' → '+(n-1)+'，共 '+totalNow+' → '+(totalNow-perLine)+' 区）';
      }else{
        tip='松开鼠标：'+dirLabel+' '+n+' 区合并为 '+(n-1)+' 区（共 '+(totalNow-perLine)+' 区）';
      }
      ppCtx.font='13px sans-serif';
      ppCtx.textAlign='center';ppCtx.textBaseline='middle';
      var tw=ppCtx.measureText(tip).width+28;
      var tx=ppCanvas.width/2,ty=22;
      ppCtx.fillStyle='rgba(249,115,22,.94)';
      ppCtx.fillRect(tx-tw/2,ty-15,tw,30);
      ppCtx.fillStyle='#000';
      ppCtx.fillText(tip,tx,ty);
    }
    ppCtx.restore();
  }

  function ppDrawZones(b){
    var planN=parseInt(document.getElementById('planN')?.value)||parseInt(document.getElementById('fld_N')?.value)||4;
    var layout=ppGetZoneLayout(b,planN);
    var cuts=ppGetZoneCuts(b,layout);
    /* 2026-09-27：分区底色改用「三级设计工作区」同一套 4 色循环调色板
       （红/琥珀/绿/蓝，α=.30）—— 与 tl-workspace.js 的 GROUP_FILLS 逐色一致，
       用户要求「二级地块划分颜色参照三级管线」。原为 8 色 α=.12（偏灰、偏花）。 */
    var fills=['rgba(191,88,88,.30)','rgba(214,162,73,.30)','rgba(75,173,111,.30)','rgba(84,127,196,.30)'];
    var strokes=['rgba(51,65,85,.28)','rgba(51,65,85,.28)','rgba(51,65,85,.28)','rgba(51,65,85,.28)'];
    ppCtx.save();
    ppTracePlotPath();
    ppCtx.clip();
    ppCtx.lineWidth=1;
    ppCtx.setLineDash([7,4]);
    // 第一遍：仅绘制分区矩形（受地块多边形裁剪，体现真实边界）
    for(var zr=0;zr<cuts.rows;zr++){
      for(var zc=0;zc<cuts.cols;zc++){
        var zi=zr*cuts.cols+zc;
        var q1=ppCutCanvas(cuts,cuts.xPos[zc],cuts.yPos[zr]);
        var q2=ppCutCanvas(cuts,cuts.xPos[zc+1],cuts.yPos[zr]);
        var q3=ppCutCanvas(cuts,cuts.xPos[zc+1],cuts.yPos[zr+1]);
        var q4=ppCutCanvas(cuts,cuts.xPos[zc],cuts.yPos[zr+1]);
        var x=Math.min(q1.x,q2.x,q3.x,q4.x),y=Math.min(q1.y,q2.y,q3.y,q4.y);
        var w=Math.max(q1.x,q2.x,q3.x,q4.x)-x,h=Math.max(q1.y,q2.y,q3.y,q4.y)-y;
        var _m2=ppZoneActualAreaM2(zc,zr,cuts,ppState.polyPts);
        var _mu=_m2/666.67;
        var _std=cuts.xPlan[zc]*cuts.yPlan[zr]/666.67;
        var _partial=_std>0 && _mu<_std*0.97 && _mu>0.05;
        /* 2026-09-27：非标区不再整块涂琥珀 —— 与三级工作区同规则（保留本区底色，仅琥珀描边区分） */
        ppCtx.fillStyle=fills[zi%fills.length];
        ppCtx.strokeStyle=_partial?'rgba(217,119,6,.9)':strokes[zi%strokes.length];
        ppCtx.beginPath();ppCtx.moveTo(q1.x,q1.y);ppCtx.lineTo(q2.x,q2.y);ppCtx.lineTo(q3.x,q3.y);ppCtx.lineTo(q4.x,q4.y);ppCtx.closePath();ppCtx.fill();ppCtx.stroke();
      }
    }
    ppCtx.restore(); // 结束地块裁剪
    // 第二遍：文字标注层（不再裁剪，避免被地块边界切掉）
    /* [v653] 实切口径下逐区标注建议主管管径（ryZonePipePick 单源，与 gr 琥珀点同色），
       并把逐区实切面积发布到 window.__ppZoneActuals —— calcPlan 的实切模式与
       「分区管径明细」吃这份。签名不变不回调 calcPlan（render 本就由 calcPlan 触发，
       最多多走一轮，无死循环）。 */
    var __calActual = (function(){ try { return localStorage.getItem('runye_caliber_mode') === 'actual'; } catch(e){ return false; } })();
    var __tsp = parseFloat((document.getElementById('planTapeSpacing')||{}).value) || 0.4;
    var __esp = parseFloat((document.getElementById('planEmitterSpacing')||{}).value) || 0.3;
    var __ef  = parseFloat((document.getElementById('planEmitterFlow')||{}).value) || 0.8;
    var __tv  = parseFloat((document.getElementById('planTargetV')||{}).value) || 1.5;
    var __par = (typeof readSelectedInt === 'function')
      ? (readSelectedInt('#branchGroup .selected', 2) * readSelectedInt('#layoutGroup .selected', 1)) : 2;
    var __act = [];
    ppCtx.setLineDash([]);
    ppCtx.textBaseline='top';
    for(var zr=0;zr<cuts.rows;zr++){
      for(var zc=0;zc<cuts.cols;zc++){
        var zi=zr*cuts.cols+zc;
        var q1=ppCutCanvas(cuts,cuts.xPos[zc],cuts.yPos[zr]);
        var q2=ppCutCanvas(cuts,cuts.xPos[zc+1],cuts.yPos[zr]);
        var q3=ppCutCanvas(cuts,cuts.xPos[zc+1],cuts.yPos[zr+1]);
        var q4=ppCutCanvas(cuts,cuts.xPos[zc],cuts.yPos[zr+1]);
        var x=Math.min(q1.x,q2.x,q3.x,q4.x),y=Math.min(q1.y,q2.y,q3.y,q4.y);
        var w=Math.max(q1.x,q2.x,q3.x,q4.x)-x,h=Math.max(q1.y,q2.y,q3.y,q4.y)-y;
        var zoneScreenW=Math.hypot(q2.x-q1.x,q2.y-q1.y),zoneScreenH=Math.hypot(q3.x-q2.x,q3.y-q2.y);
        var labelAngle=Math.atan2(q2.y-q1.y,q2.x-q1.x);
        if(labelAngle>Math.PI/2)labelAngle-=Math.PI;else if(labelAngle<-Math.PI/2)labelAngle+=Math.PI;
        var _m2=ppZoneActualAreaM2(zc,zr,cuts,ppState.polyPts);
        var _mu=_m2/666.67;
        /* [v850 用户反馈] 标注放到分块**右上角**（原居中，压着主管线难读）。
           q1 左上 / q2 右上 / q3 右下 / q4 左下。锚点 = q2 沿边内缩（局部 x 缩 padX、
           y 缩 padY），文字右对齐（textAlign='right'），行从锚点向下排。
           与三级页 inline-09 的 SVG 标注、施工简图导出同一批口径。 */
        var labelPadX=5,labelPadY=4;
        var lUx=zoneScreenW>0?(q2.x-q1.x)/zoneScreenW:1, lUy=zoneScreenW>0?(q2.y-q1.y)/zoneScreenW:0;
        var lVx=zoneScreenH>0?(q4.x-q1.x)/zoneScreenH:0, lVy=zoneScreenH>0?(q4.y-q1.y)/zoneScreenH:1;
        var labelAnchor={x:q2.x-labelPadX*lUx+labelPadY*lVx,y:q2.y-labelPadX*lUy+labelPadY*lVy};
        var labelCenter={x:labelAnchor.x,y:labelAnchor.y};
        /* [v837→v850→v860] 出界兜底三级化：锚点出界（旋转/裁剪最外圈常见）时——
           ① 先在格子参数面上扫锚：从右上角 (t=1,s=0) 沿顶边向左（t↓）、再逐行向下（s↑）
             找第一个界内点 ⇒ 标注仍在格子右上区域、贴着地块边界内移（v860 用户：
             「还有分区的文字不在分区的右上角」——v850 直接回退形心会让最外圈标注
             跑到格子中间）；② 整格扫不出界内点（极端碎格）才回退「本格 ∩ 地块」
             形心（界内），标注不再浮在空白里。 */
        if(_mu>0.05&&!ppPointInPlot(ppToMeters(labelAnchor.x,labelAnchor.y))){
          var __fixed=(function(){
            for(var __sj=0;__sj<=8;__sj++){
              for(var __si=12;__si>=1;__si--){
                var __t=__si/12,__s=__sj/8;
                var __cx=q1.x+(q2.x-q1.x)*__t+(q4.x-q1.x)*__s - labelPadX*lUx + labelPadY*lVx;
                var __cy=q1.y+(q2.y-q1.y)*__t+(q4.y-q1.y)*__s - labelPadX*lUy + labelPadY*lVy;
                if(ppPointInPlot(ppToMeters(__cx,__cy))) return {x:__cx,y:__cy};
              }
            }
            return null;
          })();
          if(__fixed){
            labelCenter={x:__fixed.x,y:__fixed.y};
          }else{
            var __cw=ppZoneClipCenterWorld(zc,zr,cuts);
            if(__cw&&ppPointInPlot(__cw)){
              var __cc=ppToCanvas(__cw.x,__cw.y);
              labelCenter={x:__cc.x,y:__cc.y};
            }
          }
        }
        var _std=cuts.xPlan[zc]*cuts.yPlan[zr]/666.67;
        var _partial=_std>0 && _mu<_std*0.97 && _mu>0.05;
        if(_mu>0.05)__act.push({zi:zi,m2:_m2,mu:_mu});
        var __pick=(__calActual&&_mu>0.05&&window.ryZonePipePick)?window.ryZonePipePick(_m2,__tsp,__esp,__ef,__tv,__par):null;
        if(_mu>0.05&&zoneScreenW>16&&zoneScreenH>11){
          var zoneSizeText=ppZoneSizeLabel(cuts.xPlan[zc],cuts.yPlan[zr]);
          var zoneAreaText=(_partial?_mu:(cuts.xPlan[zc]*cuts.yPlan[zr]/666.67)).toFixed(1)+'亩';
          var baseFont=Math.max(6,Math.min(10,Math.min(zoneScreenW/12,zoneScreenH/4.5)));
          ppCtx.save();ppCtx.translate(labelCenter.x,labelCenter.y);ppCtx.rotate(labelAngle);
          ppCtx.fillStyle='#000';ppCtx.textAlign='right';ppCtx.textBaseline='middle';
          var rowH=baseFont*1.15,r1=baseFont*0.65;
          if(zoneScreenH>=31){
            ppCtx.font=baseFont+'px sans-serif';ppCtx.fillText((zi+1)+'区',0,r1);
            ppCtx.font=baseFont+'px sans-serif';ppCtx.fillText(zoneSizeText,0,r1+rowH);
            if(zoneScreenH>=43)ppCtx.fillText(zoneAreaText,0,r1+rowH*2);
          }else{
            ppCtx.font=Math.max(5.5,baseFont*.82)+'px sans-serif';
            ppCtx.fillText((zi+1)+'区 '+zoneSizeText,0,r1);
          }
          /* [v653] 实切口径：该区按实切面积的建议主管/支管档 */
          if(__pick&&zoneScreenH>=57){ppCtx.fillStyle='#7c2d12';ppCtx.font=Math.max(6,baseFont*.9)+'px sans-serif';ppCtx.fillText('主 Ø'+__pick.main.od+' / 支 Ø'+__pick.branch.od,0,r1+rowH*3.15);}
          ppCtx.restore();
        }
      }
    }
    /* [v653] 发布逐区实切面积：签名去重后再回调 calcPlan（实切模式的结果栏/明细吃这份） */
    try{
      var __sig=JSON.stringify(__act);
      if(__sig!==window.__ppZoneActualsSig){
        window.__ppZoneActualsSig=__sig;
        window.__ppZoneActuals=__act;
        if(__calActual&&typeof window.calcPlan==='function')window.calcPlan();
      }
    }catch(ePub){}
    ppCtx.textBaseline='alphabetic';
    ppCtx.save();
    ppCtx.strokeStyle='rgba(15,23,42,.38)';
    ppCtx.lineWidth=1.1;
    ppCtx.setLineDash([7,5]);
    /* [v837] 网格线同样裁到地块多边形。
       ★ 旧写法是「从格系包围框 minY 画到 maxY」—— 30° 下这个包围框就是**旋转外接框**，
         每条线两端各伸出一截到地块外（线上实测：画出去的长度只有 32% 在地块内）。
         第一遍的分区底色本来就被 ppTracePlotPath 的 clip 裁掉了，只有这一遍的虚线没裁，
         于是画面上「色块在地块内、虚线探到地块外」——用户看到的就是这个。
       ★ 这里不开 canvas 的 clip 而是真裁线段：①与第一遍的口径一致（真几何 vs 画布遮罩）；
         ②网格线的命中判定 ppHitTestCutLine 用的是几何，两边不会各说各话。 */
    var __gbLine=cuts.bounds||b;
    var __gridSegs=[], __stroked=[];
    for(var bx=0;bx<cuts.xPos.length;bx++){
      __gridSegs.push([ppCutPoint(cuts,cuts.xPos[bx],__gbLine.minY),ppCutPoint(cuts,cuts.xPos[bx],__gbLine.maxY)]);
    }
    for(var by=0;by<cuts.yPos.length;by++){
      __gridSegs.push([ppCutPoint(cuts,__gbLine.minX,cuts.yPos[by]),ppCutPoint(cuts,__gbLine.maxX,cuts.yPos[by])]);
    }
    __gridSegs.forEach(function(seg){
      ppClipSegsToPlot(seg[0],seg[1]).forEach(function(s){
        __stroked.push(s);
        var c1=ppToCanvas(s[0].x,s[0].y),c2=ppToCanvas(s[1].x,s[1].y);
        ppCtx.beginPath();ppCtx.moveTo(c1.x,c1.y);ppCtx.lineTo(c2.x,c2.y);ppCtx.stroke();
      });
    });
    ppCtx.restore();
    ppCtx.setLineDash([]);
    /* 测量钩子：把本次真正画出去的切分与网格线段交出去（探针用，无行为影响）。 */
    try{ window.__ppLastCuts=cuts; window.__ppLastGridSegs=__stroked; }catch(eCuts){}
    ppDrawCutHandles(b,cuts);
  }

  // Draw drip tape as thin perpendicular lines along a sub-branch pipe
  function ppDrawDripTape(line){
    if(!line||line.length<2)return;
    // Drip tape spacing: every 2 meters along the pipe, each tape 3m long
    var spacing=2;
    var tapeLen=3;
    ppCtx.save();
    ppCtx.strokeStyle='rgba(167,139,250,.6)';
    ppCtx.lineWidth=0.8;
    ppCtx.setLineDash([]);
    for(var i=1;i<line.length;i++){
      var p1=line[i-1],p2=line[i];
      var dx=p2.x-p1.x,dy=p2.y-p1.y;
      var segLen=Math.sqrt(dx*dx+dy*dy);
      if(segLen<0.5)continue;
      var ux=dx/segLen,uy=dy/segLen;
      // Perpendicular unit vector
      var px=-uy,py=ux;
      var n=Math.floor(segLen/spacing);
      for(var j=0;j<=n;j++){
        var t=j*spacing;
        if(t>segLen)t=segLen;
        var cx=p1.x+ux*t,cy=p1.y+uy*t;
        // Draw tape on both sides
        var s1=ppToCanvas(cx+px*tapeLen,cy+py*tapeLen);
        var s2=ppToCanvas(cx-px*tapeLen,cy-py*tapeLen);
        ppCtx.beginPath();
        ppCtx.moveTo(s1.x,s1.y);
        ppCtx.lineTo(s2.x,s2.y);
        ppCtx.stroke();
      }
    }
    ppCtx.restore();
  }

  function ppRender(){
    ppCtx.clearRect(0,0,ppCanvas.width,ppCanvas.height);
    // Soft gray background for the pipe planning canvas.
    ppCtx.fillStyle='#dfe4e2';
    ppCtx.fillRect(0,0,ppCanvas.width,ppCanvas.height);

    if(!ppState.polyPts.length){
      // Empty state: just show hint text
      ppCtx.fillStyle='rgba(15,23,42,.42)';ppCtx.font='10px sans-serif';ppCtx.textAlign='left';
      /* [v896] 缩放文字画在左下角：右下角会被 .ry-pwa-install 浮条（fixed right/bottom 16px, z-index 2000）遮挡 */
      ppCtx.fillText('缩放 '+((ppState.zoom*100).toFixed(0))+'%',8,ppCanvas.height-18);
      ppCtx.fillStyle='rgba(15,23,42,.46)';ppCtx.font='14px sans-serif';ppCtx.textAlign='center';
      ppCtx.fillText('请先到「在线地图」画框并回传地块',ppCanvas.width/2,ppCanvas.height/2);
      return;
    }

    var b=ppGetBounds();

    /* [v652c] 逐块态冻结邻块：灰显底图画在当前块之下——看得见、摸不着，
       编辑时也能看到本块在整组里的位置关系（用户原话见 ppGetFrozenSubRings 注）。 */
    var frozen=ppGetFrozenSubRings();
    if(frozen){
      frozen.forEach(function(r){
        ppCtx.beginPath();
        r.poly.forEach(function(p,i2){
          var c=ppToCanvas(p.x,p.y);
          if(i2===0)ppCtx.moveTo(c.x,c.y);else ppCtx.lineTo(c.x,c.y);
        });
        ppCtx.closePath();
        ppCtx.fillStyle='rgba(100,116,139,.10)';ppCtx.fill();
        ppCtx.strokeStyle='rgba(71,85,105,.42)';ppCtx.lineWidth=1.5;
        ppCtx.setLineDash([6,4]);ppCtx.stroke();ppCtx.setLineDash([]);
        /* 块名标在环的外接框中心，屏幕字号固定 11px（不随缩放变大变小） */
        var nX=Infinity,nY=Infinity,xX=-Infinity,xY=-Infinity;
        r.poly.forEach(function(p){
          if(p.x<nX)nX=p.x;if(p.x>xX)xX=p.x;if(p.y<nY)nY=p.y;if(p.y>xY)xY=p.y;
        });
        var cp=ppToCanvas((nX+xX)/2,(nY+xY)/2);
        ppCtx.fillStyle='rgba(71,85,105,.78)';ppCtx.font='11px sans-serif';
        ppCtx.textAlign='center';ppCtx.textBaseline='middle';
        ppCtx.fillText(r.name,cp.x,cp.y);
        ppCtx.textAlign='start';ppCtx.textBaseline='alphabetic';
      });
    }

    // Polygon fill
    ppCtx.fillStyle='rgba(26,71,49,.06)';
    ppTracePlotPath();
    ppCtx.fill();
    ppDrawZones(b);

    // Scale + zoom indicator bottom-left [v896] 挪到左下角：右下角被 .ry-pwa-install 浮条遮挡
    ppCtx.fillStyle='rgba(15,23,42,.42)';ppCtx.font='10px sans-serif';ppCtx.textAlign='left';
    var zPct=(ppState.zoom*100).toFixed(0)+'%';
    ppCtx.fillText('缩放 '+zPct,8,ppCanvas.height-18);

    // Polygon outline
    ppCtx.strokeStyle='rgba(26,71,49,.65)';
    ppCtx.lineWidth=2;ppCtx.setLineDash([]);
    ppTracePlotPath();
    ppCtx.stroke();

    /* [v193] 总管（成组地块跨块连接层）：独立于 ppState 的 mainPipes…，
       所以**天然不进任何一块的水力与材料统计**（用户拍板 ③）。 */
    ppDrawGroupTrunk();

    /* [v875 统一工作区双层去重] 三级管线层（含段总管/尺寸标注）已生成且与二级管线
       **同一代**（主/支/阀几何逐线一致）时，二级画布不再重复画静态管线层。
       背景：统一绘图工作区把「分区图层」（二级画布）与「管路图层」（三级工作区）
       叠在同一视口，同一套管在两层各画一遍——用户实测「有两组管线，一组包含总管的，
       一组不包含总管的，把不包含总管那组不要」。带总管的权威显示在三级层，二级画布
       这份无总管的重复显示按用户要求去掉。
       · 正在画线（currentLine 非空）时不抑制：编辑时必须看得见二级管线。
       · 三级数据与二级不一致（过期/其他地块代际）时不抑制：保持原有显示，
         下一次「生成施工图」后两级重新同代、抑制自动生效。 */
    var ppPipeLayerSuppressed=false;
    (function(){
      /* [v875b 修订] 豁免判据改为「正在画线」而不是「处于手绘档位」：
         mode='main' 是工具栏常驻默认档（探针实测待机态也是 'main'），按档位豁免
         等于永不抑制。只在 currentLine 非空（用户正在落点画线）时豁免，
         画线过程中管线立即恢复可见，落点间隙的待机态仍走抑制。 */
      if(ppState.currentLine&&ppState.currentLine.length)return;
      var dd=window.tlDiagramData;
      if(!dd||!Array.isArray(dd.mainPipes)||!dd.mainPipes.length)return;
      if(!Array.isArray(ppState.mainPipes)||!ppState.mainPipes.length)return;
      if((dd.mainPipes||[]).length!==ppState.mainPipes.length)return;
      function sig(list){
        return (list||[]).map(function(l){
          return (l||[]).map(function(p){return Number(p.x).toFixed(1)+','+Number(p.y).toFixed(1);}).join(';');
        }).join('|');
      }
      try{
        /* 只比主管：三级会对传导支管做端点缩进（tlTrimBranchToZone）并把次支管
           并入 branchPipes，支管几何逐值比对会永久失配；主管无任何改写（探针实测
           生成后两级 toFixed(1) 逐值一致），是可靠的同代判据。 */
        if(sig(dd.mainPipes)!==sig(ppState.mainPipes))return;
      }catch(eSig){return;}
      ppPipeLayerSuppressed=true;
    })();
    /* [v875] 调试/验收锚点：探针与线上排障直接读最近一次渲染的抑制判定与判据摘要。 */
    window.__ppPipeLayerDedupe={suppressed:ppPipeLayerSuppressed,
      ddMains:Array.isArray(window.tlDiagramData&&window.tlDiagramData.mainPipes)?window.tlDiagramData.mainPipes.length:0,
      ppMains:Array.isArray(ppState.mainPipes)?ppState.mainPipes.length:0,mode:ppState.mode||''};

    // Main pipes
    if(!ppPipeLayerSuppressed){
    ppState.mainPipes.forEach(function(l,idx){
      if(!ppIsPipeHidden('main',idx))ppDrawLine(l,'#185FA5',4);
    });
    // Branch pipes
    ppState.branchPipes.forEach(function(l,idx){
      if(!ppIsPipeHidden('branch',idx))ppDrawLine(l,'#16a34a',2.5);
    });
    // Sub-branch pipes (一级管) — three-level mode only
    if(ppState.subBranchPipes){
      ppState.subBranchPipes.forEach(function(l,idx){
        if(!ppIsPipeHidden('subbranch',idx)){
          ppDrawLine(l,'#185FA5',2);
          // Drip tape: thin perpendicular lines along the sub-branch pipe
          ppDrawDripTape(l);
        }
      });
    }
    ppState.mainPipes.forEach(function(l,idx){
      if(ppIsPipeHidden('main',idx))ppDrawLine(l,'rgba(100,116,139,.55)',3,[7,5]);
    });
    ppState.branchPipes.forEach(function(l,idx){
      if(ppIsPipeHidden('branch',idx))ppDrawLine(l,'rgba(100,116,139,.48)',2,[7,5]);
    });
    if(ppState.subBranchPipes){
      ppState.subBranchPipes.forEach(function(l,idx){
        if(ppIsPipeHidden('subbranch',idx))ppDrawLine(l,'rgba(100,116,139,.42)',1.5,[7,5]);
      });
    }
    if(ppState.pickedPipe&&ppState.pickedPipe.line){
      var pt=ppState.pickedPipe.type;
      var pickedHidden=ppIsPipeHidden(pt,ppState.pickedPipe.index);
      var pickW=pt==='main'?7:pt==='subbranch'?5:5;
      var pickOW=pt==='main'?4:pt==='subbranch'?2:2.5;
      var pickColor=pt==='main'?'#185FA5':pt==='subbranch'?'#185FA5':'#16a34a';
      ppDrawLine(ppState.pickedPipe.line,'#f59e0b',pickW);
      ppDrawLine(ppState.pickedPipe.line,pickedHidden?'rgba(100,116,139,.65)':pickColor,pickOW,pickedHidden?[7,5]:null);
    }
    } /* [v875] !ppPipeLayerSuppressed 结束：静态管线层整块由三级层接管 */

    /* [v913-coupler-nodes] 接驳节点（交互画布，2D context）：dd.couplerNodes（世界米）
       → frameToGrid 回格系 → ppToCanvas 上屏。失配节点（x/y null）不画但参数保留。
       依赖 dd.zones.frame + window.RyCoordFrame，缺席则整段静默跳过。
       选中/拖动态橙色填充；描边 #b45309 为本元素独占色（探针像素扫描锚点）。 */
    (function(){
      var cctx=ppCouplerCtx();if(!cctx)return;
      var clist=cctx.dd.couplerNodes;
      if(!Array.isArray(clist))return;
      clist.forEach(function(n){
        if(n.x==null||n.y==null)return;
        var cg=cctx.frame?cctx.F.frameToGrid(cctx.frame,{x:n.x,y:n.y}):{x:n.x,y:n.y};
        var cp=ppToCanvas(cg.x,cg.y);
        var csel=(ppCouplerSelected===n.pipeKey)||ppState.dragCoupler===n.pipeKey;
        ppCtx.beginPath();ppCtx.arc(cp.x,cp.y,csel?7:5.5,0,Math.PI*2);
        ppCtx.fillStyle=csel?'#f59e0b':'#fff';ppCtx.fill();
        ppCtx.lineWidth=2;ppCtx.strokeStyle='#b45309';ppCtx.stroke();
      });
    })();

    // Current line being drawn
    if(ppState.currentLine.length>0){
      var c=ppState.mode==='main'?'#185FA5':ppState.mode==='branch'?'#16a34a':ppState.mode==='subbranch'?'#185FA5':'rgba(0,0,0,.35)';
      var w=ppState.mode==='main'?4:ppState.mode==='branch'?2.5:ppState.mode==='subbranch'?2:1.5;
      ppDrawLine(ppState.currentLine,c,w);
      // Vertices
      ppCtx.fillStyle=c;
      ppState.currentLine.forEach(function(pt){
        var p=ppToCanvas(pt.x,pt.y);
        ppCtx.beginPath();ppCtx.arc(p.x,p.y,3,0,Math.PI*2);ppCtx.fill();
      });
    }

    // Source
    if(ppState.source){
      var sp=ppToCanvas(ppState.source.x,ppState.source.y);
      ppCtx.fillStyle='#f59e0b';ppCtx.beginPath();
      ppCtx.arc(sp.x,sp.y,8,0,Math.PI*2);ppCtx.fill();
      ppCtx.strokeStyle='#fff';ppCtx.lineWidth=2;ppCtx.stroke();
      ppCtx.fillStyle='#000';ppCtx.font='10px sans-serif';ppCtx.textAlign='center';
      /* [v487] 「水源」标注与点脱开距离：基线 -13→-22（点圆半径 8，原间隙仅约 5px） */
      ppCtx.fillText('水源',sp.x,sp.y-22);
    }

    // Valves
    if(!ppPipeLayerSuppressed){
    ppState.valves.filter(function(v){return ppPointInPlot(v);}).forEach(function(v,idx){
      var vp=ppToCanvas(v.x,v.y);
      window.ryValveCanvas(ppCtx,vp.x,vp.y);   /* v159：与总管×主管交接阀同规格（尺寸取自 window.RY_VALVE） */
    });
    }

    /* [v251 2026-10-06 用户要求] 画布左上那行操作提示（模式 / 快捷键说明）已取消 ——
       原绘制语句整块移除；像素闸门 _v246b_pixels.py 的 A 项已同步反转为
       「快捷条下方该区域必须无文字」。 */

    // Length tooltip while drawing
    if(ppState.currentLine.length>0&&ppState.hoverPt&&ppState.mouseWorld&&(ppState.mode==='main'||ppState.mode==='branch'||ppState.mode==='subbranch')){
      var last=ppState.currentLine[ppState.currentLine.length-1];
      var mw=ppGetConstrainedPoint(ppState.mouseWorld);
      var segLen=ppLineLen([last,mw]);
      var totalLen=ppLineLen(ppState.currentLine.concat([mw]));
      var txtSeg='段长: '+segLen.toFixed(1)+' m';
      var txtTotal='总长: '+totalLen.toFixed(1)+' m';
      ppCtx.font='bold 14px sans-serif';
      var wSeg=ppCtx.measureText(txtSeg).width;
      var wTot=ppCtx.measureText(txtTotal).width;
      var tw=Math.max(wSeg,wTot)+24,th=46;
      var hp=ppToCanvas(mw.x,mw.y);
      var tx=hp.x+18,ty=hp.y-th/2;
      if(tx+tw>ppCanvas.width)tx=hp.x-tw-18;
      if(ty<0)ty=2;if(ty+th>ppCanvas.height)ty=ppCanvas.height-th-2;
      ppCtx.fillStyle='rgba(0,0,0,.85)';
      ppCtx.beginPath();
      if(ppCtx.roundRect){ppCtx.roundRect(tx,ty,tw,th,6);}
      else{ppCtx.rect(tx,ty,tw,th);}
      ppCtx.fill();
      ppCtx.strokeStyle='rgba(255,255,255,.3)';ppCtx.lineWidth=1;ppCtx.stroke();
      ppCtx.fillStyle='#86efac';ppCtx.textAlign='left';
      ppCtx.fillText(txtSeg,tx+12,ty+18);
      ppCtx.fillStyle='#86efac';
      ppCtx.fillText(txtTotal,tx+12,ty+36);
    }
  }
  /* [v629] 「适应窗口」胶囊的显隐收口在这里，而不是在每个调用点撒一遍：
     分区旋转 / 重新分区 / 回退 / 加管都会改内容尺寸或平移量，只有这里能保证不漏。
     做法：把局部 ppRender 换成一个转发器（函数声明可重新赋值），
     内部所有 ppRender() 调用立刻跟着生效，绘制逻辑一行没动。 */
  var ppRenderBase=ppRender;
  ppRender=function(){ ppRenderBase.apply(null,arguments); ppSyncFitBtn();try{if(window.RyDrawingWorkspace)window.RyDrawingWorkspace.syncCamera();}catch(e){} };
  window.ppRender=ppRender;

  var ppSpacePressed=false;
  var ppMouseDownPos=null; // track if mousedown was a potential click vs drag
  /* [v242] 「双击地块轮廓外 = 退回成组页」的中间标记：由 mouseup 判定并立起，dblclick 消费。
     声明在这里（而不是在使用点旁边）是为了让 mousedown 里的复位看得见同一个变量。 */
  var ppDblOutside=false;

  // Helper: get client coords relative to canvas
  function ppClientPos(e){
    var rect=ppCanvas.getBoundingClientRect();
    return{x:e.clientX-rect.left,y:e.clientY-rect.top};
  }

  /* ===== [v913-coupler-nodes] 接驳节点：放置 / 拖动 / 定位面板 =====
     数据：ppState.couplerNodes=[{pipeKey,s 米}]（s 以 dd.mainPipes 世界米折线为基准）。
     非等比 frame（scaleX≠scaleY）下弧长必须在世界米系算：
     鼠标格系 → frameToWorld → 世界米垂足投影 → s；渲染 dd.couplerNodes(x,y) → frameToGrid → ts()。
     事务：松手走现有 ppCommitSinglePlotEdit（preimage/after 自动感知，undo 零新代码）。
     成组态（ppIsGroupWhole）禁用——成员槽继承语义留待后续批次。 */
  var ppCouplerPlacing=false,ppCouplerSelected=null,ppCouplerDrag=null,
      ppCouplerPreimage=null,ppCouplerSinglePreimage=null;
  function ppCouplerCtx(){
    var dd=window.tlDiagramData;
    if(!dd||dd.world!=='meter'||!Array.isArray(dd.mainPipes)||!dd.mainPipes.length)return null;
    var frame=(dd.zones&&dd.zones.frame)?dd.zones.frame:null;
    var F=window.RyCoordFrame;
    if(!F||typeof F.frameToWorld!=='function'||typeof F.frameToGrid!=='function')return null;
    return {dd:dd,frame:frame,F:F};
  }
  /* 世界米点 → 最近主管垂足。返回 {pipeKey,idx,s,fx,fy,d}（s=世界米弧长，d=垂距米）或 null。 */
  function ppCouplerProject(worldPt){
    var ctx=ppCouplerCtx();if(!ctx)return null;
    var best=null;
    ctx.dd.mainPipes.forEach(function(line,idx){
      var acc=0;
      for(var k=1;k<line.length;k++){
        var ax=line[k-1].x,ay=line[k-1].y,bx=line[k].x,by=line[k].y;
        var vx=bx-ax,vy=by-ay,den=vx*vx+vy*vy;
        if(den<=0)continue;
        var t=((worldPt.x-ax)*vx+(worldPt.y-ay)*vy)/den;
        t=Math.max(0,Math.min(1,t));
        var fx=ax+vx*t,fy=ay+vy*t;
        var d=Math.hypot(worldPt.x-fx,worldPt.y-fy);
        if(!best||d<best.d)best={d:d,idx:idx,s:acc+Math.sqrt(den)*t,fx:fx,fy:fy};
        acc+=Math.sqrt(den);
      }
    });
    if(!best)return null;
    /* [v913] 身份口径：pipeKey='m'+(dd.mainPipes 索引+1)——投影几何锚在 dd.mainPipes
       （tlAutoGenerate 从分区网格确定性重建，重生成顺序稳定 ⇒ pipeKey 跨重生成稳定）。
       不能用 ppState.pipeIds.main 做身份源：自动生成流（ensureInitialPipes/#ppGenerate
       直通分支）里 L2 手绘层为空 ⇒ pipeIds.main=[]，会全量 missing。 */
    best.pipeKey='m'+(best.idx+1);
    return best;
  }
  /* upsert 节点参数（同 pipeKey 覆盖，否则追加）；拖动中实时写内存，松手统一走事务。 */
  function ppCouplerUpsert(pipeKey,s){
    ppState.couplerNodes=Array.isArray(ppState.couplerNodes)?ppState.couplerNodes:[];
    var found=ppState.couplerNodes.filter(function(n){return n.pipeKey===pipeKey;})[0];
    if(found)found.s=s;
    else ppState.couplerNodes.push({pipeKey:pipeKey,s:s});
  }
  function ppCouplerRemove(pipeKey){
    ppState.couplerNodes=(Array.isArray(ppState.couplerNodes)?ppState.couplerNodes:[])
      .filter(function(n){return n.pipeKey!==pipeKey;});
  }
  function ppCouplerSetPlacing(on){
    ppCouplerPlacing=!!on;
    var btn=document.getElementById('ppCouplerBtn');
    if(btn)btn.classList.toggle('active',ppCouplerPlacing);
    ppCanvas.style.cursor=ppCouplerPlacing?'crosshair':'grab';
    var panel=document.getElementById('ppCouplerPanel');
    if(panel)panel.style.display=ppCouplerPlacing?'block':'none';
    if(ppCouplerPlacing&&!ppIsGroupWhole()&&typeof tip==='function')tip('接驳节点：点击主管线放置或选中节点，拖动调整，Esc 退出');
  }
  function ppCouplerSyncPanel(){
    var panel=document.getElementById('ppCouplerPanel');
    if(!panel)return;
    var inp=panel.querySelector('input');
    var lab=panel.querySelector('.pp-coupler-pipe');
    var node=ppState.couplerNodes&&ppCouplerSelected?ppState.couplerNodes.filter(function(n){return n.pipeKey===ppCouplerSelected;})[0]:null;
    if(lab)lab.textContent=ppCouplerSelected?('主管 '+ppCouplerSelected):'未选中';
    if(inp){inp.value=node?String(Math.round(node.s*10)/10):'';inp.disabled=!node;}
  }
  window.ppCouplerSyncPanel=ppCouplerSyncPanel;   /* 面板输入事件与外部探针共用 */
  /* [v913] 跨模块/探针入口：定位面板与地图端（步骤 2b）复用同一 upsert/remove 口径 */
  window.ppCouplerUpsert=ppCouplerUpsert;
  window.ppCouplerRemove=ppCouplerRemove;

  // Wheel zoom — centered on mouse position
  ppCanvas.addEventListener('wheel',function(e){
    e.preventDefault();
    var pos=ppClientPos(e);
    var delta=e.deltaY>0?0.9:1.1;
    window.ppZoomView(delta,pos.x,pos.y);
  },{passive:false});

  // Keyboard — space for pan, arrows for fine-tune
  var ppKeyHandler=function(e){
    if(e.code==='Space'&&!ppSpacePressed&&document.activeElement===document.body){
      ppSpacePressed=true;ppCanvas.style.cursor='grab';e.preventDefault();
    }
    /* [v913-coupler-nodes] Esc 退出接驳节点放置模式（输入框聚焦时不抢） */
    if(e.code==='Escape'&&ppCouplerPlacing&&(!document.activeElement||document.activeElement.tagName!=='INPUT')){
      ppCouplerSetPlacing(false);ppRender();
    }
    // Arrow keys for fine-tune in adjustCut mode
    if(ppState.mode==='adjustCut'&&!ppSpacePressed&&document.activeElement===document.body){
      var dir=null;
      if(e.code==='ArrowUp')dir='up';
      else if(e.code==='ArrowDown')dir='down';
      else if(e.code==='ArrowLeft')dir='left';
      else if(e.code==='ArrowRight')dir='right';
      if(dir){e.preventDefault();ppNudgeCut(dir);}
    }
  };
  var ppKeyUpHandler=function(e){
    if(e.code==='Space'){ppSpacePressed=false;ppCanvas.style.cursor=ppState.mode==='adjustCut'?'default':'grab';}
  };
  document.addEventListener('keydown',ppKeyHandler);
  document.addEventListener('keyup',ppKeyUpHandler);

  // Mousedown — start pan or track for click
  ppCanvas.addEventListener('mousedown',function(e){
    var pos=ppClientPos(e);
    ppMouseDownPos=pos;
    ppDblOutside=false;   /* [v242] 新的按下 ⇒ 上一轮的「双击轮廓外退出」标记作废（见 mouseup 处） */
    // Middle button or space+left → start panning
    if(e.button===1||(ppSpacePressed&&e.button===0)){
      ppState.isPanning=true;ppState.panStartX=pos.x-ppState.panX;ppState.panStartY=pos.y-ppState.panY;
      ppCanvas.style.cursor='grabbing';e.preventDefault();return;
    }
    // Left click — will be handled as click on mouseup if no significant drag
    if(e.button===0){
      ppState.isPanning=false; // not panning, but tracking for click
      // 网格线拖动（v98c）：调网格模式，或未在画线时悬停即可直接拖动
      if(ppCutDragReady()){
        var world=ppToMeters(pos.x,pos.y);
        var hit=ppHitTestCutLine(world);
        if(hit){
          var cutPreimage=ppGroupMemberPreimage();
          if(cutPreimage&&cutPreimage.invalid)return;
          var cutSinglePreimage=!cutPreimage&&!ppIsGroupWhole()&&typeof window.ppGetState==='function'
            ?window.ppGetState():null;
          ppPushHistory();
          ppCutDragPreimage=cutPreimage;
          ppCutSinglePreimage=cutSinglePreimage;
          ppState.dragCut={axis:hit.axis,index:hit.index};
          ppState.lastSelectedCut={axis:hit.axis,index:hit.index};
          ppState.mergePreview=null;
          ppCanvas.style.cursor=hit.axis==='x'?'ew-resize':'ns-resize';
          e.preventDefault();return;
        }
      }
      /* [v913-coupler-nodes] 接驳节点放置/选中：放置模式下点击主管线（垂距 ≤3m 世界米）
         创建或选中节点并直接进入拖动（点击=零位移拖动，松手统一提交）。
         成组态禁用（成员槽继承语义留待后续批次）。 */
      if(ppCouplerPlacing){
        if(ppIsGroupWhole()){
          if(typeof tip==='function')tip('成组地块请在拆组后调整接驳节点');
        }else{
          var cw=ppToMeters(pos.x,pos.y);
          var cctx=ppCouplerCtx();
          var wpt=(cctx&&cctx.frame)?cctx.F.frameToWorld(cctx.frame,cw):cw;
          var chit=ppCouplerProject(wpt);
          if(chit&&chit.d<=3){
            ppPushHistory();
            ppCouplerPreimage=ppGroupMemberPreimage();
            ppCouplerSinglePreimage=window.ppGetState();
            ppState.dragCoupler=chit.pipeKey;
            ppCouplerSelected=chit.pipeKey;
            ppCouplerUpsert(chit.pipeKey,chit.s);
            ppRender();
            ppCouplerSyncPanel();
            e.preventDefault();return;
          }
        }
      }
    }
  });

  // Mousemove
  ppCanvas.addEventListener('mousemove',function(e){
    var pos=ppClientPos(e);
    if(ppState.isPanning){
      ppState.panX=pos.x-ppState.panStartX;ppState.panY=pos.y-ppState.panStartY;
      ppRender();return;
    }
    // Dragging a cut line（靠近相邻线时吸附并标记合并）
    if(ppState.dragCut){
      var world2=ppToMeters(pos.x,pos.y);
      var dcK=ppState.dragCut;
      var dcCuts=ppCurrentCuts(),dcLocal=dcCuts&&dcCuts.frame?dcCuts.frame.toGrid(world2):world2;
      var dcCoord=dcLocal[dcK.axis==='x'?'x':'y'];
      // 面积锁定：整轴刚性平移（面积不变）；否则单线拖动（可合并）
      if(ppState.areaLocked&&!ppBmFreeOk(dcK.axis,dcK.index))ppDragCutAxis(dcK.axis,dcK.index,dcCoord);
      else ppDragCutTo(dcK.axis,dcK.index,dcCoord);
      ppRender();
      if(typeof window.ppRefreshDiagramIfVisible==='function')window.ppRefreshDiagramIfVisible();
      return;
    }
    /* [v913-coupler-nodes] 接驳节点拖动：鼠标格系 → 世界米 → 垂足投影 → 实时更新参数。
       预览与松手落点走同一投影函数 ppCouplerProject（v852 教训）。 */
    if(ppState.dragCoupler){
      var cmW=ppToMeters(pos.x,pos.y);
      var cmCtx=ppCouplerCtx();
      var cmWpt=(cmCtx&&cmCtx.frame)?cmCtx.F.frameToWorld(cmCtx.frame,cmW):cmW;
      var cmHit=ppCouplerProject(cmWpt);
      if(cmHit&&cmHit.pipeKey===ppState.dragCoupler){
        ppCouplerUpsert(cmHit.pipeKey,cmHit.s);
        ppCouplerSyncPanel();
      }
      ppRender();
      return;
    }
    // If dragging with left button (no space, not dragging cut), check threshold
    if(ppMouseDownPos&&e.buttons===1&&!ppSpacePressed&&!ppState.dragCut&&!ppState.dragCoupler){
      var dx2=pos.x-ppMouseDownPos.x,dy2=pos.y-ppMouseDownPos.y;
      if(Math.abs(dx2)>2||Math.abs(dy2)>2){
        // Start panning
        ppState.isPanning=true;
        ppState.panStartX=ppMouseDownPos.x-ppState.panX;
        ppState.panStartY=ppMouseDownPos.y-ppState.panY;
        ppCanvas.style.cursor='grabbing';return;
      }
    }
    ppState.mouseWorld=ppToMeters(pos.x,pos.y);
    ppState.hoverPt=pos;
    // 网格线悬停命中（调网格模式 / 未画线时的直接拖动）→ 光标提示
    if(ppCutDragReady()){
      var hit=ppHitTestCutLine(ppState.mouseWorld);
      ppState.hoverCut=hit;
      if(hit)ppState.lastSelectedCut={axis:hit.axis,index:hit.index};
      ppCanvas.style.cursor=hit?(hit.axis==='x'?'ew-resize':'ns-resize'):(ppState.mode==='adjustCut'?'default':'grab');
    } else {
      ppState.hoverCut=null;
    }
    ppRender();
  });

  // Mouseup — stop pan or add point
  ppCanvas.addEventListener('mouseup',function(e){
    // Finalize cut line drag（存在合并预览时执行合并，分区数随之减少）
    if(ppState.dragCut){
      // 面积锁定：只平移、不合并（合并会改变区数与面积）
      var ppBmWasOk=ppBmFreeOk(ppState.dragCut.axis,ppState.dragCut.index);
      var ppMerged=(ppState.areaLocked&&!ppBmWasOk)?false:ppCommitMerge();
      ppState.dragCut=null;
      ppState.hoverCut=null;
      ppCanvas.style.cursor=ppState.mode==='adjustCut'?'default':'grab';
      ppMouseDownPos=null;
      var cutPreimage=ppCutDragPreimage,cutSinglePreimage=ppCutSinglePreimage;
      ppCutDragPreimage=null;ppCutSinglePreimage=null;
      if(!ppCommitCutDragSnapshots(cutPreimage,cutSinglePreimage,'cut-drag'))return;
      /* v166：调网格松手后同步重建三级简图（60m/545m/224m 标注线与分区色块随新界线）——
         原来只刷二级简图，三级简图停留旧网格，工作区克隆的也是旧图（与 cutDragEnd 链路对齐）。 */
      if(typeof window.ppRefreshTLAfterCuts==='function')window.ppRefreshTLAfterCuts();
      else if(typeof window.ppRefreshDiagramIfVisible==='function')window.ppRefreshDiagramIfVisible();
      if(ppMerged&&typeof ppRefreshMaterials==='function')ppRefreshMaterials();
      ppRender();
      return;
    }
    /* [v913-coupler-nodes] 接驳节点松手结算：点击=零位移拖动也走这里——统一事务提交。
       成功后 ppRefreshDiagramOrReset 联动三级重投影（tlAutoGenerate 重读 couplerNodes）。 */
    if(ppState.dragCoupler){
      ppState.dragCoupler=null;
      ppMouseDownPos=null;
      ppCanvas.style.cursor=ppCouplerPlacing?'crosshair':'grab';
      var cpPreimage=ppCouplerPreimage,cpSingle=ppCouplerSinglePreimage;
      ppCouplerPreimage=null;ppCouplerSinglePreimage=null;
      if(ppIsGroupWhole()){ppRender();return;}
      var cpOk=ppCommitSinglePlotEdit(cpSingle,'coupler-move',true,true);
      if(cpOk===false){
        /* 事务拒绝：ppCommitSinglePlotEdit 已回滚 ppApplySlot(preimage)，这里恢复选中态 */
        ppCouplerSelected=null;
      }else{
        /* [v913] 投影刷新：ppCommitSinglePlotEdit 成功分支只刷二级快照（ppRefreshDiagramIfVisible），
           不重建 tlDiagramData——couplerNodes 只投影进 dd，必须 tlAutoGenerate 才会重投影
           （与 cut-drag 松手 :2841 同一口径）。 */
        if(typeof window.ppRefreshTLAfterCuts==='function')window.ppRefreshTLAfterCuts();
      }
      ppRender();
      ppCouplerSyncPanel();
      return;
    }
    if(ppState.isPanning){
      ppState.isPanning=false;ppCanvas.style.cursor=ppSpacePressed?'grab':(ppState.mode==='adjustCut'?'default':'grab');
      ppMouseDownPos=null;return;
    }
    // Was a clean click (no drag)
    if(ppMouseDownPos&&e.button===0){
      var pos=ppClientPos(e);
      var dx=pos.x-ppMouseDownPos.x,dy=pos.y-ppMouseDownPos.y;
      if(Math.abs(dx)<=2&&Math.abs(dy)<=2){
        /* [v242] 双击第二击（e.detail>=2）落在地块轮廓【外面】⇒ 这一下是「退出手势」的一半，
           不当落点（详见 ppCanExitByDbl 上方说明）。每次干净点击都会重算本标记，不会残留。 */
        ppDblOutside=(e.detail>=2)&&ppCanExitByDbl(ppToMeters(pos.x,pos.y));
        if(ppDblOutside){ppMouseDownPos=null;return;}
        // It's a click – add point
        if(ppState.mode==='pickPipe'){
          var pick=ppFindNearestPipe(ppToMeters(pos.x,pos.y));
          ppUpdatePickResult(pick);
          if(!pick)alert('未拾取到管线，请点击靠近主管、支管或一级管的位置');
          ppRender();ppMouseDownPos=null;return;
        }
        /* In group-wide view only read-only pipe picking is allowed. Keep this
           guard ahead of source/valve handlers as well as the pipe drawing guard. */
        if(ppGroupEditBlocks(ppState.mode)){ppMouseDownPos=null;return;}
        if(ppState.mode==='maskPipe'){
          var maskPick=ppFindNearestPipe(ppToMeters(pos.x,pos.y));
          if(!maskPick){alert('未拾取到管线，请点击靠近主管、支管或一级管的位置');ppMouseDownPos=null;return;}
          var maskPreimage=ppGroupMemberPreimage();
          if(maskPreimage&&maskPreimage.invalid){ppMouseDownPos=null;return;}
          var maskSinglePreimage=!maskPreimage&&!ppIsGroupWhole()&&typeof window.ppGetState==='function'
            ?window.ppGetState():null;
          ppPushHistory();
          ppTogglePipeHidden(maskPick);
          if(maskPreimage&&!ppCommitGroupMemberEdit(maskPreimage)){ppMouseDownPos=null;return;}
          if(maskSinglePreimage&&!ppCommitSinglePlotEdit(maskSinglePreimage,'pipe-visibility',true,true)){ppMouseDownPos=null;return;}
          ppUpdatePickResult(maskPick);
          if(typeof window.ppRefreshDiagramIfVisible==='function')window.ppRefreshDiagramIfVisible();
          ppRefreshMaterials();
          ppRender();ppMouseDownPos=null;return;
        }
        if(ppState.mode==='source'){
          var sourcePreimage=ppGroupMemberPreimage();
          if(sourcePreimage&&sourcePreimage.invalid){ppMouseDownPos=null;return;}
          var sourceSinglePreimage=!sourcePreimage&&!ppIsGroupWhole()&&typeof window.ppGetState==='function'
            ?window.ppGetState():null;
          ppPushHistory();
          ppState.source=ppToMeters(pos.x,pos.y);
          if(sourcePreimage&&!ppCommitGroupMemberEdit(sourcePreimage)){ppMouseDownPos=null;return;}
          if(sourceSinglePreimage&&!ppCommitSinglePlotEdit(sourceSinglePreimage,'source-placement',false)){ppMouseDownPos=null;return;}
          ppRender();ppMouseDownPos=null;return;
        }
        if(ppState.mode==='valve'){
          var valvePt=ppToMeters(pos.x,pos.y);
          if(!ppPointInPlot(valvePt)){ppMouseDownPos=null;return;}
          var valvePreimage=ppGroupMemberPreimage();
          if(valvePreimage&&valvePreimage.invalid){ppMouseDownPos=null;return;}
          var valveSinglePreimage=!valvePreimage&&!ppIsGroupWhole()&&typeof window.ppGetState==='function'
            ?window.ppGetState():null;
          ppPushHistory();
          ppState.valves.push(valvePt);
          if(valvePreimage&&!ppCommitGroupMemberEdit(valvePreimage)){ppMouseDownPos=null;return;}
          if(valveSinglePreimage&&!ppCommitSinglePlotEdit(valveSinglePreimage,'valve-placement',true)){ppMouseDownPos=null;return;}
          ppRender();ppMouseDownPos=null;return;
        }
        if(ppState.mode==='adjustCut'){ppMouseDownPos=null;return;}
        /* [v193] 整组态不允许落块级管线的点 —— 按钮已置灰，这里是兜底
           （模式也可能被脚本/键盘改动，不能只靠按钮 disable 这一道）。 */
        if(ppGroupEditBlocks(ppState.mode)){ppMouseDownPos=null;return;}
        /* [v304 2026-10-08 用户要求] 手动管线绘制禁用：v96 已隐藏绘制模式按钮，但默认 mode='main'
           时画布干净左键点击仍在此落管线点（右键撤点、双击/右键成线照旧），用户点选查看时屡屡误画。
           现对 main/branch/subbranch 三种落点全部拦截——「自动管路」生成的管线、调网格/平移缩放/
           回退/双击地块进出 等交互均不经过此路径，零影响。恢复绘制：删掉下面这行 guard 即可。 */
        if(ppState.mode==='main'||ppState.mode==='branch'||ppState.mode==='subbranch'){ppMouseDownPos=null;return;}
        ppPushHistory();
        var linePt=ppToMeters(pos.x,pos.y);
        linePt=ppGetConstrainedPoint(linePt);
        ppState.currentLine.push(linePt);ppRender();ppUpdateAutoPipeButton();
      }
    }
    ppMouseDownPos=null;
  });

  ppCanvas.addEventListener('mouseleave',function(){
    ppState.hoverPt=null;ppState.mouseWorld=null;ppState.hoverCut=null;
    if(ppState.dragCut){
      var ppMergedLeave=ppCommitMerge(); // 移出画布时按当前预览结算合并
      ppState.dragCut=null;
      var cutPreimageLeave=ppCutDragPreimage,cutSinglePreimageLeave=ppCutSinglePreimage;
      ppCutDragPreimage=null;ppCutSinglePreimage=null;
      if(!ppCommitCutDragSnapshots(cutPreimageLeave,cutSinglePreimageLeave,'cut-drag')){ppMouseDownPos=null;return;}
      /* v166：同 mouseup —— 移出画布结算的合并也要同步三级简图（原路径完全不刷） */
      if(typeof window.ppRefreshTLAfterCuts==='function')window.ppRefreshTLAfterCuts();
      if(ppMergedLeave&&typeof ppRefreshMaterials==='function')ppRefreshMaterials();
    }
    if(ppState.isPanning){ppState.isPanning=false;ppCanvas.style.cursor=ppState.mode==='adjustCut'?'default':'grab';}
    ppMouseDownPos=null;ppRender();
  });

  /* [v242] 双击【地块轮廓外面】= 退回成组管路页（CAD 式：布局里双击进图纸、视口外双击退出）。
     用户原话：「…或者是在布局的窗口内双击进入图纸编辑，在视口外面 双击就退出了。」
     「我这里双击进入的是二级页面，不是三级页面，更正一下。」⇒ 进/出的这一对都在二级页。
     ★ 只在 window.__runyeGroupPlotEdit != null（= 从成组页进来的）时才成立 ——
       平时双击本页是「落点 / 收线」，绝不能被这层含义吃掉。
     ★ 判据的几何用 ppPointInPlot（与阀门落点、面积同源），**拿不到轮廓 / 轮廓不合法一律
       当作在图上** —— 宁可这次不退出，也不能把「双击收线」误判成退页。
     ★ 为什么判定放在 mouseup 而不是 dblclick：双击的**第二击本身也是一次 click**，会先被
       mouseup 当成一个落点塞进 currentLine（主管/支管模式下 100% 发生）——等 dblclick 再取
       消就晚了：收线那条路会顺手收出一根零长度的管。
       ⇒ 口径：mouseup 认出「这是双击的第二击 且 落在地块外」= 这一击不落点，只把标记
         ppDblOutside 立起来；dblclick 见标记为真才真退出（此刻 currentLine 里最多只剩第一击
         留下的一个点，退出时一并丢掉，不会留半根线）。 */
  function ppCanExitByDbl(world){
    if(window.__runyeGroupPlotEdit==null)return false;
    if(typeof window.grBackFromPlotEdit!=='function')return false;
    if(!ppState.polyPts||ppState.polyPts.length<3)return false;
    return !ppPointInPlot(world);
  }
  function ppExitToGroupPage(){
    ppState.currentLine=[];ppState.hoverPt=null;ppState.hoverCut=null;
    ppRender();ppUpdateAutoPipeButton();
    return window.grBackFromPlotEdit()!==false;
  }

  // Double click to finish
  ppCanvas.addEventListener('dblclick',function(e){
    if(ppDblOutside){ppDblOutside=false;ppExitToGroupPage();return;}
    if(ppState.mode==='pickPipe'||ppState.mode==='maskPipe'||ppState.mode==='adjustCut')return;
    if(ppState.currentLine.length<2){ppState.currentLine=[];ppRender();return;}
    ppFinishCurrentLine();   /* [v193] 统一入口（含新增的「总管」），不再在这里单列三种 */
    ppUpdatePickResult(null);
    ppState.currentLine=[];ppState.hoverPt=null;ppRender();ppUpdateAutoPipeButton();
    ppRefreshMaterials();
  });

  // Right-click = undo last point (no context menu)
  ppCanvas.addEventListener('contextmenu',function(e){e.preventDefault();
    if(ppState.currentLine.length>0){ppState.currentLine.pop();ppUpdatePickResult(null);ppRender();ppUpdateAutoPipeButton();}
  });

  /* [v193] 把「结束当前线段落到哪一类管线」抽出来 —— 原逻辑散在 dblclick 与模式按钮
     两处，新增「总管」必须同时改两处，正是典型的「改一处漏一处」。 */
  function ppFinishCurrentLine(){
    if(ppState.currentLine.length<2)return;
    ppPushHistory();
    if(ppState.mode==='main')ppAddPipe('main',ppState.currentLine);
    else if(ppState.mode==='branch')ppAddPipe('branch',ppState.currentLine);
    else if(ppState.mode==='subbranch')ppAddPipe('subbranch',ppState.currentLine);
  }
  /* [v193] 模式切换的统一入口（原为模式按钮点击里的内联逻辑）。
     「总管」按钮是 .pp-btn-ghost.pp-ge-mode，不在 '#ppToolbar .pp-btn[data-mode]' 选择器里，
     原来的委托抓不到它 —— 抽成本函数后两条路径共用同一口径。 */
  function ppSetMode(mode){
    if(ppGroupEditBlocks(mode)){
      alert('整组是总览态，块级管线编辑请切到「逐块」再选子地块。');
      ppSyncGroupEditUI();
      return;
    }
    ppFinishCurrentLine();
    ppState.currentLine=[];ppState.mode=mode;
    ppState.hoverCut=null;
    ppCanvas.style.cursor=ppState.mode==='adjustCut'?'default':'grab';
    ppUpdateAutoPipeButton();
    ppRefreshMaterials();
    if(ppState.mode!=='pickPipe'&&ppState.mode!=='maskPipe'&&ppState.mode!=='adjustCut')ppUpdatePickResult(null);
    /* 高亮：原来只扫 .pp-btn[data-mode]，总管按钮扫不到 ⇒ 点总管后主管仍亮着。
       改成扫全部 [data-mode]，一次 toggle 到位。 */
    document.querySelectorAll('#ppToolbar [data-mode]').forEach(function(b){
      b.classList.toggle('active', b.getAttribute('data-mode')===mode);
    });
    // Show fine-tune group only in adjustCut mode
    // [v188] 改用统一入口 ppSyncFineGroup()，与「地块划分」开关那条路径共用同一口径，
    //        避免「两条路径各写一遍、改一处漏一处」（本次就是这个 bug）。
    if(typeof ppSyncFineGroup==='function') ppSyncFineGroup();
    else { var fg=document.getElementById('ppCutFineGroup'); if(fg)fg.style.display=ppState.mode==='adjustCut'?'inline-flex':'none'; }
    ppRender();
  }

  // Mode buttons
  document.querySelectorAll('#ppToolbar .pp-btn[data-mode]').forEach(function(btn){
    btn.addEventListener('click',function(){ ppSetMode(btn.dataset.mode); });
  });

  function ppSetLineDrawMode(mode){
    ppState.lineDrawMode=mode==='ortho'?'ortho':'free';
    var orthoBtn=document.getElementById('ppLineOrtho');
    if(orthoBtn)orthoBtn.classList.toggle('active',ppState.lineDrawMode==='ortho');
    ppRender();
  }

  document.getElementById('ppLineOrtho').addEventListener('click',function(){
    ppSetLineDrawMode(ppState.lineDrawMode==='ortho'?'free':'ortho');
  });

  // ===== Three-level pipeline legend update =====
  function ppUpdateLegend(isThree){
    var legend=document.getElementById('ppLegend');
    if(!legend)return;
    var items=legend.querySelectorAll('.pp-legend-item');
    // Rebuild legend
    legend.innerHTML='<span class="pp-legend-item"><i style="background:#185FA5"></i>主管</span>'
      +'<span class="pp-legend-item"><i style="background:#16a34a"></i>支管</span>'
      +(isThree?'<span class="pp-legend-item"><i style="background:#185FA5"></i>一级管</span><span class="pp-legend-item"><i style="background:#a78bfa;height:2px;width:18px"></i>滴灌带</span>':'')
      +'<span class="pp-legend-item"><i style="background:#f59e0b;border-radius:50%;width:10px;height:10px"></i>水源</span>'
      +'<span class="pp-legend-item"><i style="background:#ef4444;border-radius:50%;width:10px;height:10px"></i>阀门</span>';
  }

  // Undo — global step-back through all operations
  /* [v913-coupler-nodes] 接驳节点：放置模式按钮 + 定位面板事件 */
  (function(){
    var btn=document.getElementById('ppCouplerBtn');
    if(btn)btn.addEventListener('click',function(){
      if(ppIsGroupWhole()){if(typeof tip==='function')tip('成组地块请在拆组后调整接驳节点');return;}
      ppCouplerSetPlacing(!ppCouplerPlacing);
      if(!ppCouplerPlacing){ppCouplerSelected=null;ppRender();}
    });
    var panel=document.getElementById('ppCouplerPanel');
    if(panel){
      var inp=panel.querySelector('input');
      if(inp)inp.addEventListener('change',function(){
        var v=Number(inp.value);
        if(!ppCouplerSelected||!isFinite(v)||v<0){ppCouplerSyncPanel();return;}
        if(ppIsGroupWhole()){ppCouplerSyncPanel();return;}
        var pre=window.ppGetState();
        ppPushHistory();
        ppCouplerUpsert(ppCouplerSelected,v);
        var ok=ppCommitSinglePlotEdit(pre,'coupler-input',true,true);
        if(ok===false)ppCouplerSelected=null;
        else if(typeof window.ppRefreshTLAfterCuts==='function')window.ppRefreshTLAfterCuts();   /* [v913] 重投影 dd.couplerNodes */
        ppRender();ppCouplerSyncPanel();
      });
      var rm=panel.querySelector('.pp-coupler-remove');
      if(rm)rm.addEventListener('click',function(){
        if(!ppCouplerSelected||ppIsGroupWhole())return;
        var pre=window.ppGetState();
        ppPushHistory();
        ppCouplerRemove(ppCouplerSelected);
        var ok=ppCommitSinglePlotEdit(pre,'coupler-remove',true,true);
        if(ok===false)ppCouplerSelected=null;
        else if(typeof window.ppRefreshTLAfterCuts==='function')window.ppRefreshTLAfterCuts();   /* [v913] 重投影 dd.couplerNodes */
        ppRender();ppCouplerSyncPanel();
      });
    }
  })();

  document.getElementById('ppUndo').addEventListener('click',function(){
    var ok=ppUndoStep();    if(ok){
      ppUpdatePickResult(null);
      ppRender();ppUpdateAutoPipeButton();
      /* v166：回退后同步三级简图（界线可能回到上一状态） */
      if(typeof window.ppRefreshTLAfterCuts==='function')window.ppRefreshTLAfterCuts();
      else if(typeof window.ppRefreshDiagramIfVisible==='function')window.ppRefreshDiagramIfVisible();
      ppRefreshMaterials();
    }
  });

  function ppHasPipeContent(){
    return !!(ppState.mainPipes.length||ppState.branchPipes.length||(ppState.subBranchPipes&&ppState.subBranchPipes.length)||ppState.valves.length||ppState.currentLine.length||ppState.source);
  }

  function ppUpdateAutoPipeButton(){
    var btn=document.getElementById('ppAutoPipe');
    if(!btn)return;
    var has=ppHasPipeContent();
    btn.classList.toggle('active',has);
    ppSetBtnLabel(btn,has?'清除管路':'自动管路'); // [v824] 用 setLabel 保住 SVG
  }

  function ppRefreshDiagramOrReset(){
    if(!window.ppRefreshDiagramIfVisible||!window.ppRefreshDiagramIfVisible()){
      ppState.lastSVG=null;
      var content=document.getElementById('ppDiagramContent');
      if(content) content.innerHTML='<div class="pp-diagram-empty">完成面积测量并点击「生成施工图」后，这里显示最终施工图。</div>';
    }
  }

  function ppClearPipes(){
    var groupPreimage=ppGroupMemberPreimage();
    if(groupPreimage&&groupPreimage.invalid)return false;
    var singlePreimage=!groupPreimage&&!ppIsGroupWhole()&&typeof window.ppGetState==='function'
      ?window.ppGetState():null;
    if(ppPushHistory()===false)return false;
    /* [v201] 整组态的「清除管路」必须落到各块 slot —— 与整组态的生成互为逆操作。
       否则只有二级页的合并视图清了、各块 slot 还在 ⇒ 成组管路页照样把管画出来，
       用户点「清除管路」却看着管子还在（第二份「两页不一致」的坑）。 */
    if(ppIsGroupWhole()){
      var memberRead=ppReadGroupMemberSlots(window.__runyeGroupEdit);
      if(!memberRead.ok){ppDiscardLatestHistoryEntry();return false;}
      var changes=[];
      memberRead.slots.forEach(function(s,index){
        if(!s)return;
        var next=ppCloneJSON(s);
        if(!next){changes.push({index:index,slot:null});return;}
        next.mainPipes=[];next.branchPipes=[];next.subBranchPipes=[];next.source=null;next.valves=[];
        ppSlotRebuildIds(next);
        changes.push({index:index,slot:next});
      });
      if(changes.length&&!ppSaveGroupMemberSlots(changes)){
        ppDiscardLatestHistoryEntry();
        console.warn('[plot-editor] group pipe-clear transaction rejected');
        return false;
      }
      /* 同步推给「成组管路」页，避免它停在旧画面 */
      setTimeout(function(){ try{ ppSyncGroupEditUI(); }catch(e){} },0);
    }
    ppState.mainPipes=[];ppState.branchPipes=[];ppState.subBranchPipes=[];
    ppState.source=null;ppState.valves=[];ppState.currentLine=[];ppState.hiddenPipes={main:{},branch:{},subbranch:{}};ppState.pipeIds={main:[],branch:[],subbranch:[]};ppState.nextPipeId=1;ppState.cutOverrides={x:{},y:{}};ppResetCutSnap('');
    if(groupPreimage&&!ppCommitGroupMemberEdit(groupPreimage))return false;
    if(singlePreimage&&typeof window.ryCommitSinglePlotL2Snapshot==='function'){
      var singleCommit=window.ryCommitSinglePlotL2Snapshot(singlePreimage,window.ppGetState());
      if(singleCommit===false){
        ppDiscardLatestHistoryEntry();
        ppApplySlot(singlePreimage);
        ppUpdateLockAreaBtn();
        ppUpdatePickResult(null);ppRender();ppUpdateAutoPipeButton();ppRefreshDiagramOrReset();ppRefreshMaterials();
        console.warn('[plot-editor] single-plot pipe-clear transaction rejected');
        return false;
      }
    }
    ppUpdatePickResult(null);ppRender();
    ppUpdateAutoPipeButton();
    if(typeof window.ppRefreshDiagramIfVisible==='function') window.ppRefreshDiagramIfVisible();
    ppRefreshMaterials();
    return true;
  }

  /* [v201] 自动布管的**纯几何内核**：给一套环点 → 算出该块内部的主管 / 支管 /
     一级管 / 阀门。*不写* ppState —— 只在其间临时借 ppState.polyPts 以复用既有
     ppGetBounds / ppGetZoneLayout / ppGetZoneCuts / ppPointInPlot，finally 原样还原
     （与 RunyeBridge.zoneCutsFor 同款 swap-restore）。
     ★★ 为什么必须拆出来（用户实测：「尺寸标注没有，主管跟支管未显示」，
        证据 _p1/_diag_v201_group_pipes.cjs 路径 A）：
        旧代码整组态点「自动管路」时，拿的是**外框 bounds** 一把梭 ——
        ① 把块间空隙当成地布了管；② 产物只落在整组合并视图 ppState 里，
           而 ppSetGroupMode 明确写着「整组态的管线是只读视图、不存档」
           ⇒ 一根都没进 ge.slots[i] ⇒ 成组管路页永远画不出来、jimmy尺寸标注也无从标。
        拆出来之后整组态 =「对每一块各调一次本函数」，与 v193 铁律一致
        （成组 = 多次单块，一行布管规则都不改写）。 */
  /* [v638 2026-10-20 用户口径] 主管与支管在平面上其实是**同一位置的上下两层**
     （主管埋地下、支管在地面），图上把它们错开只是为了两根都看得见。
     所以错开量必须**固定**，不能被地块压缩或拉伸 ——
     用户原话：「主管跟支管在图中显示的距离，不应该被地块压缩，不管地块大小，应该都保持一致」。

     为什么用「固定的实地距离」而不是「分区块的百分比」，也不是「地块跨度比例」：
       本画布是**固定比例**的（见 ppUpdateTransform：s = 0.5×zoom，注释写明「1px=2m」），
       不随地块大小变化 ⇒ 一个固定的实地距离，在任意缩放下就是固定的像素数，
       地块大小、分区数目都不再影响它。三级图框同样是固定比例（s 被上限 2 夹住，
       常规地块恒为 2 单位/m），且取的是同一个数 ⇒ 两个视图的视觉间距天生一致。
     旧口径是「主管落分区块宽/高的 40%、支管落中线」⇒ 错开量 = 分区块尺寸的 10%，
     实测同一套代码：520×237m/16 区 → 20m；200×120m/8 区 → 12m；60×40m/4 区 → 6m。
     这就是用户说的「被地块压缩」。
     zoneDim 是错开方向上的分区尺寸。两根线改成「对称夹住真实位置」（各让一半）后，
     只有窄于间距的极窄小分区才会触发硬边界，正常地块一律拿到那个固定米数。 */
  var PP_MAIN_BRANCH_GAP_M = 20;    /* 唯一一处数值，三级简图经 window.RyMainBranchGap 取同一个值 */
  function ppGapM() {
    /* 探针/比对用：window.__ryMainBranchGapM 可临时改值，不影响正常使用（不设就一直用 PP_MAIN_BRANCH_GAP_M） */
    var o = (typeof window !== 'undefined') ? window.__ryMainBranchGapM : null;
    return (typeof o === 'number' && isFinite(o) && o > 0) ? o : PP_MAIN_BRANCH_GAP_M;
  }
  function ppVisGap(zoneDim) {
    var g = ppGapM();
    /* 硬边界：两根线是「对称夹住真实位置」的（各让一半），
       所以间距只要不超过分区尺寸的 90%，两根就都还留在本分区里。
       —— 这个边界只在极窄分区（< 22m）才会咬到 20m，正常地块一律拿到全量。 */
    if (zoneDim > 0) g = Math.min(g, zoneDim * 0.9);
    return g;
  }
  /* 三级简图（mod/inline-09.js）取同一个数 —— 两个视图都是定比例的，同值即同「实地间距」。
     数值只有一份，改这里就够；inline-09 里有 20 的兜底字面量（plot-editor 未加载时用）。
     ★ 为什么是 20 米：v637 在用户当时那块 520×237m 地块上错开量正好约 20 米（45% 缩放下
       约 4~5 物理像素，蓝绿两根一眼分得开），用户就是对着那张图提的要求 ⇒ 以这个观感为基准，
       把它从「那块地块恰好算出来的值」提升成「所有地块都用这个值」。 */
  if (typeof window !== 'undefined') window.RyMainBranchGap = { m: ppGapM };

  function ppBuildAutoPipes(polyPts, planN, isThree, useOwnDims, forceDir, gridAngle) {
    var out = { main: [], branch: [], subbranch: [], valves: [] };
    var keepPoly = ppState.polyPts, keepOwn = ppOwnDimOverride, keepAngle=ppState.zoneAngleDeg, keepRot=ppState.zoneRotated, keepSnap=ppState.cutSnap, keepOverrides=ppState.cutOverrides;
    var frame=null;
    try {
      ppState.polyPts = (polyPts || []).map(function (p) { return { x: p.x, y: p.y }; });
      if (useOwnDims) ppOwnDimOverride = true;   /* 见 ppGetPlanDims 处 [v201] 说明 */
      if (ppState.polyPts.length < 3) return out;
      var sourceBounds=ppGetBounds(),sourceDims=ppGetPlanDims(sourceBounds);
      var effectiveAngle=isFinite(Number(gridAngle))?Number(gridAngle):ppZoneAngle();
      frame=ppGridFrame(ppState.polyPts,sourceBounds,sourceDims,effectiveAngle);
      /* [v865] 0° 也走格系统一变换（修复「0°+地块原点偏移 ⇒ 管线全空」老缺陷）：
         ppGetZoneCuts 的网格恒铺在 frame.bounds（格系）上，管线坐标恒是格系——
         旧代码 0° 时不把 ppState.polyPts 换成格系环（条件 Math.abs(angle)>0.001），
         格系管线被拿去裁世界系环，地块 min 角不在原点时两系错开 ⇒ 全部裁空。
         0° 的 frame 是纯平移+缩放（无旋转），toGrid/toWorld 互逆，变换后行为=
         旧实现（min 角在原点、scale=1 时 toWorld 恒等）。 */
      if(frame){
        ppState.polyPts=frame.poly.map(function(p){return{x:p.x,y:p.y};});
        ppState.zoneAngleDeg=0;ppState.zoneRotated=false;
        ppState.cutSnap={sig:'',x:null,y:null};ppState.cutOverrides={x:{},y:{}};
      }
      var b = ppGetBounds(),layout=ppGetZoneLayout(b,planN);
      if(frame&&keepSnap&&keepSnap.x&&keepSnap.y){
        ppState.cutSnap={sig:ppGetZoneCutSignature(b,layout),x:keepSnap.x.slice(),y:keepSnap.y.slice()};
      }
      var cuts = ppGetZoneCuts(b, layout);
      /* [v837] 每根线都裁到地块多边形；裁完不足 1 m 的整根丢弃（旋转角下的幽灵角格子）。
         ★ 这里 ppState.polyPts 已被上面换成**格系**多边形（角度≠0 时），管坐标也在格系，
           所以裁剪环就是 ppPipeClipPoly —— 两者同一个坐标系，别换成外面那份世界多边形。
         0° 时所有线整段在界内 ⇒ 原值推入，结果与旧实现逐点相同。 */
      var ppPipeClipPoly = ppState.polyPts;
      function pushSeg(arr, a, c, minLen) {
        var segs = ppClipSegsToPlot(a, c, ppPipeClipPoly), pushed = 0;
        var min = (minLen === undefined ? 1 : minLen);
        for (var si = 0; si < segs.length; si++) {
          var seg = segs[si];
          var L = Math.sqrt((seg[1].x - seg[0].x) * (seg[1].x - seg[0].x) + (seg[1].y - seg[0].y) * (seg[1].y - seg[0].y));
          if (L < min) continue;
          arr.push(seg); pushed++;
        }
        return pushed > 0;
      }

      /* 布管方向单一事实来源，与三级页共用 RyZoneGeometry.tapeAxisOf。
         优先级（硬约束在前，冲突时牺牲后者）：
           ① 滴灌带 ∥ tapeAxis，主管 ∥ 支管 ⊥ tapeAxis（同一函数一次算出，不可能被违反）；
           ② 第一分区沿自身长边铺带，其余分区固定沿同一轴向；
           ③ 全块方向统一（单一 tapeAxis 天然满足）；
           ④ 单边铺设长度只影响滴灌带分段数，不得改变方向。
         RyZoneGeometry 缺失时也按第一分区选择，不能退回全图多数方向。 */
      if (forceDir !== 'v' && forceDir !== 'h') {
        var _ryG = (typeof window !== 'undefined') ? window.RyZoneGeometry : null;
        var _ryAx = (_ryG && typeof _ryG.tapeAxisOf === 'function')
          ? _ryG.tapeAxisOf(cuts, ((typeof planZoneFixedSide === 'function') ? planZoneFixedSide() : 200))
          : null;
        if (_ryAx && _ryAx.ok) {
          try { window.__ryTapeAxisReport = _ryAx; } catch (eRep) { }   /* 三级页/探针共用同一份代价报告 */
          forceDir = (_ryAx.tapeAxis === 'x') ? 'v' : 'h';   /* 带 ∥ x ⇒ 主管·支管竖直（⊥ 带） */
        } else {
          var firstWidth = Number(cuts.xSrc && cuts.xSrc[0]) || Number(cuts.xPlan[0]) || 0;
          var firstHeight = Number(cuts.ySrc && cuts.ySrc[0]) || Number(cuts.yPlan[0]) || 0;
          forceDir = firstWidth >= firstHeight ? 'v' : 'h';
        }
      }

      for (var zr = 0; zr < cuts.rows; zr++) {
        for (var zc = 0; zc < cuts.cols; zc++) {
          var zx = cuts.xPos[zc], zy = cuts.yPos[zr];
          var zoneW = cuts.xSrc[zc], zoneH = cuts.ySrc[zr];
          var centerX = zx + zoneW / 2, centerY = zy + zoneH / 2;
          /* 全部区域沿第1分区确定的方向布管；forceDir 由第一分区长边派生 */
          var fixedSideIsHorizontal = (forceDir === 'v') ? true
            : (forceDir === 'h') ? false
            : (cuts.xPlan[zc] >= cuts.yPlan[zr]);
          if (fixedSideIsHorizontal) {
            /* [v638] 主管/支管「对称夹住真实位置」：错开量固定（见 ppVisGap），
               两根各让一半 ⇒ 无论间距多大，只要分区装得下就都留在分区内。
               （旧口径：主管落分区块 40%、支管落中线 ⇒ 间距 = 10% 块宽，随分区尺寸缩放） */
            var gapV1 = ppVisGap(zoneW);
            var mainX = centerX - gapV1 / 2, branchX = centerX + gapV1 / 2;
            pushSeg(out.main, { x: mainX, y: zy }, { x: mainX, y: zy + zoneH });
            // 支管两端各缩进一段距离（分区边长 6%，4~14m），不与分区边缘相接，使各地块支管视觉上独立断开
            var gapV2 = Math.min(Math.max(zoneH * 0.06, 4), 14, zoneH * 0.22);
            pushSeg(out.branch, { x: branchX, y: zy + gapV2 }, { x: branchX, y: zy + zoneH - gapV2 });
            if (ppPointInPlot({ x: branchX, y: centerY })) out.valves.push({ x: branchX, y: centerY });
            // Three-level: sub-branch pipes perpendicular to branch (horizontal)
            if (isThree) {
              var nSub = Math.max(2, Math.floor(zoneH / 15));
              for (var sb = 1; sb <= nSub; sb++) {
                var sbY = zy + zoneH * sb / (nSub + 1);
                pushSeg(out.subbranch, { x: zx + zoneW * 0.15, y: sbY }, { x: zx + zoneW * 0.85, y: sbY }, 0.5);
              }
            }
          } else {
            /* [v638] 同竖向分支：对称夹住真实位置，错开量固定 */
            var gapH1 = ppVisGap(zoneH);
            var mainY = centerY - gapH1 / 2, branchY = centerY + gapH1 / 2;
            pushSeg(out.main, { x: zx, y: mainY }, { x: zx + zoneW, y: mainY });
            // 支管两端缩进，与分区边缘留出空隙
            var gapH2 = Math.min(Math.max(zoneW * 0.06, 4), 14, zoneW * 0.22);
            pushSeg(out.branch, { x: zx + gapH2, y: branchY }, { x: zx + zoneW - gapH2, y: branchY });
            if (ppPointInPlot({ x: centerX, y: branchY })) out.valves.push({ x: centerX, y: branchY });
            // Three-level: sub-branch pipes perpendicular to branch (vertical)
            if (isThree) {
              var nSub2 = Math.max(2, Math.floor(zoneW / 15));
              for (var sb2 = 1; sb2 <= nSub2; sb2++) {
                var sbX = zx + zoneW * sb2 / (nSub2 + 1);
                pushSeg(out.subbranch, { x: sbX, y: zy + zoneH * 0.15 }, { x: sbX, y: zy + zoneH * 0.85 }, 0.5);
              }
            }
          }
        }
      }
    } finally {
      /* [v865] 0° 也 toWorld：管线恒生成于格系，统一转回世界系（0° 时 toWorld=纯平移+缩放）。 */
      if(frame){
        ['main','branch','subbranch'].forEach(function(k){out[k]=out[k].map(function(line){return line.map(frame.toWorld);});});
        out.valves=out.valves.map(frame.toWorld);
      }
      ppState.polyPts = keepPoly; ppOwnDimOverride = keepOwn; ppState.zoneAngleDeg=keepAngle; ppState.zoneRotated=keepRot; ppState.cutSnap=keepSnap; ppState.cutOverrides=keepOverrides;
    }
    return out;
  }

  /* [v201] 给某个 slot 重建 pipeIds / hiddenPipes / nextPipeId（长度必须对得上，
     否则 ppPipeKey(type,i) 取到 undefined ⇒ 隐藏判定与拾取都对不上号）。 */
  function ppSlotRebuildIds(s) {
    if (!s) return;
    s.pipeIds = { main: [], branch: [], subbranch: [] };
    s.hiddenPipes = { main: {}, branch: {}, subbranch: {} };
    var map = [['main', 'mainPipes', 'm'], ['branch', 'branchPipes', 'b'], ['subbranch', 'subBranchPipes', 's']];
    var maxN = 0;
    map.forEach(function (t) {
      var arr = s[t[1]] || [], pre = t[2];
      for (var i = 0; i < arr.length; i++) { s.pipeIds[t[0]].push(pre + (i + 1)); maxN = Math.max(maxN, i + 1); }
    });
    s.nextPipeId = maxN + 1;
  }

  function ppIsGroupWhole() {
    var ge = window.__runyeGroupEdit;
    return !!(ge && ge.active && ge.mode === 'whole' && ge.slots && ge.slots.length >= 2);
  }

  function ppAutoGeneratePipes() {
    if (!ppState.polyPts.length) { alert('请先到「在线地图」画框并回传地块'); return false; }
    /* [v892] 入口即重置失败原因：alert 文案只反映本次失败，
       不再吃到上一轮遗留的 __runyeSingleL2CommitFailure 旧值误导归因。 */
    window.__runyeSingleL2CommitFailure=null;
    var groupPreimage=ppGroupMemberPreimage();
    if(groupPreimage&&groupPreimage.invalid)return false;
    var singlePreimage=!groupPreimage&&!ppIsGroupWhole()&&typeof window.ppGetState==='function'
      ?window.ppGetState():null;
    if(ppPushHistory()===false)return false;

    var planN = parseInt(document.getElementById('planN')?.value) || parseInt(document.getElementById('fld_N')?.value) || 4;
    var isThree = ppState.pipeLevel === 'three';

    /* [v201] 整组态：逐块生成、逐块存档到 ge.slots[i]，整组视图 = 各块之和。
       ★ 不再用外框 bounds 一把梭 —— 那样既把块间空隙当成了地，产物又无处可存
         （用户实测：成组管路页一根管都看不到）。合并走既有的 ppCollectGroupAllPipes，
         与 ppSetGroupMode 里「逐块 → 整组」的合并口径严格同一套。 */
    if (ppIsGroupWhole()) {
      var geW = window.__runyeGroupEdit;
      var memberRead=ppReadGroupMemberSlots(geW);
      if(!memberRead.ok){ppDiscardLatestHistoryEntry();return false;}
      var memberChanges=[];
      memberRead.slots.forEach(function (s,slotIndex) {
        if (!s || !s.polyPts || s.polyPts.length < 3) return;
        s = ppCloneJSON(s);
        if(!s){memberChanges.push({index:slotIndex,slot:null});return;}
        var r = ppBuildAutoPipes(s.polyPts, planN, isThree, true, null, s.zoneAngleDeg);
        s.mainPipes = r.main; s.branchPipes = r.branch; s.subBranchPipes = r.subbranch;
        s.valves = r.valves; s.source = null;
        s.cutOverrides = { x: {}, y: {} }; s.mergePreview = null;
        ppSlotRebuildIds(s);
        memberChanges.push({index:slotIndex,slot:s});
      });
      if(memberChanges.length&&!ppSaveGroupMemberSlots(memberChanges)){
        ppDiscardLatestHistoryEntry();
        console.warn('[plot-editor] group auto-pipe transaction rejected');
        return false;
      }
      var mg = ppCollectGroupAllPipes();
      if(!mg)return false;
      ppState.mainPipes = mg.main; ppState.branchPipes = mg.branch; ppState.subBranchPipes = mg.subbranch;
      ppState.source = null; ppState.valves = [];
      ppState.pipeIds = { main: [], branch: [], subbranch: [] }; ppState.nextPipeId = 1;
      ppState.hiddenPipes = { main: {}, branch: {}, subbranch: {} };
      ppState.currentLine = [];
      ppEnsurePipeIds('main'); ppEnsurePipeIds('branch'); ppEnsurePipeIds('subbranch');
      ppUpdatePickResult(null);
      ppResetCutSnap('');
      ppRender();
      ppUpdateAutoPipeButton();
      if (typeof window.ppRefreshDiagramIfVisible === 'function') window.ppRefreshDiagramIfVisible();
      ppRefreshMaterials();
      /* 立刻推给「成组管路」页 —— 它只看得到 slots，不刷新就还是空的 */
      ppSyncGroupEditUI();
      ppAnglePipeRegenPending=false;
      return true;
    }

    /* 单块 / 逐块态：照旧写 ppState（行为与 v201 之前完全一致） */
    var prevMainCount=(ppState.mainPipes||[]).length;
    var r2 = ppBuildAutoPipes(ppState.polyPts, planN, isThree);
    /* [v892 2026-11-02 用户报「旋转角度后生成施工图管线消失」] 重建空结果保护：
       地块上明明有管线、重建却一根不剩 ⇒ 大概率旋转角度下格系与地块多边形
       裁剪异常（坐标系错位/幽灵角格），按失败处理并**保留旧管线**——
       不允许「点生成施工图后图上管线凭空消失」这种静默结果。 */
    if(!r2.main.length && !r2.branch.length && prevMainCount>0){
      ppDiscardLatestHistoryEntry();
      if(singlePreimage)ppApplySlot(singlePreimage);
      if(typeof updatePlan==='function')updatePlan();
      ppUpdateTransform();ppRender();ppUpdateAutoPipeButton();ppRefreshDiagramOrReset();ppRefreshMaterials();
      window.__runyeSingleL2CommitFailure='重建管线结果为空（裁剪后一根不剩），已保留原管线';
      alert('按新分区角度重生成管线未完成：重建管线结果为空（可能被地块裁剪全部丢弃）。已保留原管线与画面，请调整分区角度后重试；若反复出现请截图反馈。');
      return false;
    }
    ppState.mainPipes = r2.main;
    ppState.branchPipes = r2.branch;
    ppState.subBranchPipes = r2.subbranch;
    ppState.valves = r2.valves;
    ppState.currentLine = [];
    ppState.hiddenPipes = { main: {}, branch: {}, subbranch: {} };
    ppState.pipeIds = { main: [], branch: [], subbranch: [] }; ppState.nextPipeId = 1;
    ppUpdatePickResult(null);
    ppEnsurePipeIds('main'); ppEnsurePipeIds('branch'); ppEnsurePipeIds('subbranch');

    if(groupPreimage&&!ppCommitGroupMemberEdit(groupPreimage))return false;
    if(singlePreimage&&typeof window.ryCommitSinglePlotL2Snapshot==='function'){
      var singleCommit=window.ryCommitSinglePlotL2Snapshot(singlePreimage,window.ppGetState());
      if(singleCommit===false){
        ppDiscardLatestHistoryEntry();
        ppApplySlot(singlePreimage);
        ppUpdateLockAreaBtn();
        if(typeof updatePlan==='function')updatePlan();
        ppUpdateTransform();ppRender();ppUpdateAutoPipeButton();ppRefreshDiagramOrReset();ppRefreshMaterials();
        console.warn('[plot-editor] single-plot auto-pipe transaction rejected');
        return false;
      }
    }
    ppRender();
    ppUpdateAutoPipeButton();
    if (typeof window.ppRefreshDiagramIfVisible === 'function') window.ppRefreshDiagramIfVisible();
    ppRefreshMaterials();
    ppAnglePipeRegenPending=false;
    return true;
  }

  function ppRepartitionDesign(opts){
    if(!ppState.polyPts.length){alert('请先到「在线地图」画框并回传地块');return;}
    if(ppHasPipeContent()&&!confirm('重新分区会清除当前绘制的管线、阀门和水源，是否继续？'))return;
    var groupPreimage=ppGroupMemberPreimage();
    if(groupPreimage&&groupPreimage.invalid)return false;
    var singlePreimage=!groupPreimage&&!ppIsGroupWhole()&&typeof window.ppGetState==='function'
      ?window.ppGetState():null;
    ppPushHistory();
    ppUnlockArea(); // 重新分区会改变各区面积，锁定态自动解除（任务K 2026-09-26）
    /* 重分区只重建分区与清理管路；地块、多地块成员环和世界坐标均保持不变。 */
    ppState.mainPipes=[];
    ppState.branchPipes=[];
    ppState.subBranchPipes=[];
    ppState.source=null;
    ppState.valves=[];
    ppState.currentLine=[];
    ppState.hiddenPipes={main:{},branch:{},subbranch:{}};
    ppState.pipeIds={main:[],branch:[],subbranch:[]};
    ppState.nextPipeId=1;
    ppState.cutOverrides={x:{},y:{}};ppResetCutSnap('');
    ppState.dragCut=null;ppState.hoverCut=null;
    ppUpdatePickResult(null);
    if(groupPreimage&&!ppCommitGroupMemberEdit(groupPreimage))return;
    if(singlePreimage&&typeof window.ryCommitSinglePlotL2Snapshot==='function'){
      var singleCommit=window.ryCommitSinglePlotL2Snapshot(singlePreimage,window.ppGetState());
      if(singleCommit===false){
        ppDiscardLatestHistoryEntry();
        ppApplySlot(singlePreimage);
        ppUpdateLockAreaBtn();
        if(typeof updatePlan==='function')updatePlan();
        ppUpdateTransform();ppRender();ppUpdateAutoPipeButton();ppRefreshDiagramOrReset();ppRefreshMaterials();
        console.warn('[plot-editor] single-plot repartition transaction rejected');
        return false;
      }
    }
    // Recalculate the plan against the unchanged plot geometry.
    if(typeof updatePlan==='function') updatePlan();
    ppUpdateTransform();
    ppRender();
    ppUpdateAutoPipeButton();
    ppRefreshDiagramOrReset();
  }

  /* [2026-11-02 取消「自动管路」入口] 原 click 绑定（document.getElementById('ppAutoPipe')
     addEventListener，有管→ppClearPipes / 没管→ppAutoGeneratePipes）已随按钮一并删除——
     与「生成施工图」#ppGenerate 重复（都调 ppAutoGeneratePipes）。若删除 DOM 却留此绑定，
     元素不存在会抛 TypeError 中断整个编辑器初始化（v804「重新分区」同款坑）。
     底层函数全部保留：ppAutoGeneratePipes 供 #ppGenerate(:4959)/autoPipesWhole/ensureInitialPipes
     调用；ppClearPipes 供 clearPipesWhole(:634) 调用。 */

  document.getElementById('ppRotateZones').addEventListener('click',function(){
    ppPushHistory();
    ppApplyZoneAngle(ppZoneAngle()+90,true);
  });
  /* [v804 取消「重新分区」按钮] 分区角度输入/↻+90° 均实时自动重算（ppApplyZoneAngle），
     手动驱动按钮冗余，按钮已删（index.html）。此处原 click 绑定无判空，必须随按钮
     一起移除，否则脚本加载即抛 TypeError 断掉整个编辑器初始化。
     ppRepartitionDesign 函数本体保留：AI 应用链 ppRepartitionDesign({aiApply:true})
     （3160/3277 行）仍在调用。 */

  (function bindZoneAngleInput(){
    var input=document.getElementById('ppZoneAngleInput');if(!input)return;
    var pushed=false,startAngle=0,designPreimage=null;
    input.addEventListener('focus',function(){
      pushed=false;startAngle=ppZoneAngle();
      designPreimage=typeof window.ppGetState==='function'?window.ppGetState():null;
    });
    input.addEventListener('input',function(){
      var raw=Number(input.value);if(input.value.trim()===''||!isFinite(raw))return;
      raw=Math.max(-180,Math.min(180,raw));
      if(Math.abs(raw-startAngle)>0.001){
        if(!pushed){ppPushHistory();pushed=true;}
        /* input 事件先更新 ppState.zoneAngleDeg，随后 change 事件再次调用
           ppApplyZoneAngle 时 previousAngle 已等于最终值，无法再发现角度变化。
           因此在用户开始改值时就置脏；点击「生成施工图」会据此重建二级主管/支管，
           避免小角度旋转未改变横/竖分类时沿用旧方向管线。 */
        ppAnglePipeRegenPending=true;
      }
      ppApplyZoneAngle(raw,false,true);
    });
    input.addEventListener('change',function(){
      var raw=Number(input.value);if(input.value.trim()===''||!isFinite(raw)){ppSyncZoneAngleUI();return;}
      raw=Math.max(-180,Math.min(180,raw));
      if(!pushed&&Math.abs(raw-startAngle)>0.001)ppPushHistory();
      ppApplyZoneAngle(raw,true,false,designPreimage);ppSyncZoneAngleUI();pushed=false;designPreimage=null;
    });
  })();

  /* ===== [v325 2026-10-09 用户要求] AI 规划闭环：带地块信息跳 AI 助手；回传结果提示应用 ===== */
  (function ppAiPlanFlow(){
    function snapshot(){
      function g(id){var el=document.getElementById(id);return el?el.value:null;}
      return {lift:g('planLift'),tapeLaySide:g('planTapeLaySide'),tapeSpacing:g('planTapeSpacing'),
        emitterSpacing:g('planEmitterSpacing'),emitterFlow:g('planEmitterFlow'),
        zoneMu:g('planZoneMuManual'),targetV:g('planTargetV'),tapePressure:g('planTapePressure'),zones:g('planN')};
    }
    var btn=document.getElementById('ppAiPlan');
    /* [v512 安全] #ppAiPlan 在主站导航之外，原先**完全没有权益校验**：
       已确认无权的账号（甚至屏蔽了权益层的页面）点它就能开智能规划工作台 ——
       绕开 `ai-plan` 门控的第二入口（实测见 _sec_audit.mjs 向量 A2）。
       ⚠ 这里刻意用 **fail-closed** 口径：拿不到权益层即视为无权。
         该层是同源静态文件，正常用户不会加载失败；而 runye-nav.js 主站导航
         为避免网络抖动锁死老用户走的是 fail-open —— 新加的闸门从严，不跟它对齐。 */
    function aiPlanAccess(){
      var E = (typeof window!=='undefined') ? window.RyEntitle : null;
      if(!E || typeof E.access!=='function') return 'denied';
      return E.access('ai-plan');
    }
    if(btn && window.RyEntitle && typeof window.RyEntitle.bindControl==='function'){
      try{ window.RyEntitle.bindControl(btn,'ai-plan','AI 规划'); }catch(e){}
    }
    if(btn)btn.addEventListener('click',function(){
      var _st=aiPlanAccess();
      if(_st!=='allowed'){
        if(_st==='pending'){ alert('正在同步会员权益，请稍后重试。'); return; }
        try{ if(window.RyMemberUI&&typeof RyMemberUI.showUpgrade==='function'){ RyMemberUI.showUpgrade('智能规划'); return; } }catch(e){}
        alert('「智能规划」为会员功能 · 邀请好友即可开通'); return;
      }
      try{localStorage.setItem('runye_ai_plan_v1',JSON.stringify({mode:'request',at:Date.now(),params:snapshot()}));}catch(e){}
      /* [v327 / N03] 全量方案写入一次性交接槽，并把不可猜的 ID 放进智能规划页 URL。
         SAVE_KEY 是跨标签共享的最近存档；AI 往返必须绑定发起它的这一份快照，不能让
         另一个标签页先写入的地块覆盖当前请求。旧 runye_aiplot_anchor_v1 仅供旧链接恢复。 */
      var handoffId=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,14);
      var handoffKey='runye_ai_plot_handoff_v1:'+handoffId;
      try{
        if(typeof window.runyeSaveProject!=='function')throw new Error('save unavailable');
        window.runyeSaveProject(true,handoffKey);
        if(!localStorage.getItem(handoffKey))throw new Error('handoff snapshot missing');
      }catch(eSave){alert('当前方案未能安全保存，AI 规划暂未打开，请检查本地存储空间后重试。');return;}
      /* [v331b 2026-10-09 用户要求] AI规划同样走独立窗口（旧对话页已被智能规划工作台替代重定向）：
         主窗口原地不动、地块分区手动规划不受影响；弹窗内 v327 锚自动恢复当前边界。 */
      var smartUrl='index.html?smart=1&handoffId='+encodeURIComponent(handoffId)+'#pipePlanSection';
      var _smartWin=window.open(smartUrl,'runye_smart','width=1180,height=860');
      if(!_smartWin)location.href=smartUrl;
    });
    function applyPlan(plan){
      function set(id,v){var el=document.getElementById(id);
        if(el&&v!==null&&v!==undefined&&isFinite(+v)){el.value=v;
          el.dispatchEvent(new Event('change',{bubbles:true}));el.dispatchEvent(new Event('input',{bubbles:true}));}}
      var p=plan.params||{};
      set('planZoneMuManual',p.zoneMu);set('planTargetV',p.targetV);set('planTapePressure',p.tapePressure);
      set('planTapeLaySide',p.tapeLaySide);set('planTapeSpacing',p.tapeSpacing);
      set('planEmitterSpacing',p.emitterSpacing);set('planEmitterFlow',p.emitterFlow);set('planLift',p.lift);
      /* [v517] 三级 tlPlanTargetV 输入已取消：planTargetV（上面已 set+派发事件）是唯一入口，
         三级经 mod/inline-09.js 的联动监听自动跟随，无需再单独回填。 */
      if(typeof ppRepartitionDesign==='function'){try{ppRepartitionDesign({aiApply:true});}catch(e){}}
    }
    function checkPlan(){
      var w=null;try{w=JSON.parse(localStorage.getItem('runye_ai_plan_v1')||'null');}catch(e){}
      if(!w||w.mode!=='plan')return;
      var btn2=document.getElementById('ppAiPlan');if(!btn2)return;
      if(document.getElementById('ppAiPlanNotice'))return;
      var p=w.params||{},desc=[];
      if(p.zones!=null)desc.push('共 '+p.zones+' 区');
      if(p.zoneMu!=null)desc.push('每区 '+p.zoneMu+' 亩');
      if(p.tapePressure!=null)desc.push('入口压力 '+p.tapePressure+' bar');
      if(p.targetV!=null)desc.push('目标流速 '+p.targetV+' m/s');
      if(p.emitterFlow!=null)desc.push('滴头流量 '+p.emitterFlow+' L/h');
      var bar=document.createElement('div');
      bar.id='ppAiPlanNotice';
      bar.style.cssText='position:absolute;top:44px;left:10px;z-index:4;background:#f0fdf4;border:1px solid #bbd8c6;color:#15803d;font-size:11.5px;padding:6px 10px;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,.08);display:flex;gap:8px;align-items:center;white-space:nowrap';
      bar.innerHTML='🤖 AI 规划：'+(desc.join('，')||'参数已更新')+
        ' <button id="ppAiPlanApply" type="button" style="border:0;background:#15803d;color:#fff;border-radius:4px;padding:3px 10px;cursor:pointer;font-size:11px">应用并重新分区</button>'+
        '<button id="ppAiPlanSkip" type="button" style="border:1px solid #cbd5e1;background:#fff;color:#64748b;border-radius:4px;padding:3px 8px;cursor:pointer;font-size:11px">忽略</button>';
      var host=btn2.closest('.pp-canvas-wrap')||btn2.parentElement.parentElement;
      host.appendChild(bar);
      document.getElementById('ppAiPlanApply').onclick=function(){
        applyPlan(w);
        try{localStorage.setItem('runye_ai_plan_v1',JSON.stringify({mode:'applied',at:Date.now()}));}catch(e){}
        bar.remove();};
      document.getElementById('ppAiPlanSkip').onclick=function(){
        try{localStorage.setItem('runye_ai_plan_v1',JSON.stringify({mode:'applied',at:Date.now()}));}catch(e){}
        bar.remove();};
    }
    setTimeout(checkPlan,600);setTimeout(checkPlan,2500);setTimeout(checkPlan,6000);
    window.addEventListener('storage',function(e){if(e.key==='runye_ai_plan_v1')checkPlan();});
  })();

  /* ===== [v491 2026-10-16 用户要求] 灌溉配方库（二级左侧面板 #ppRecipeBar）：
     把第 1 行 10 项输入参数整组保存为命名方案、随时调用回填，持续沉淀
     灌溉参数组合方案库。DOM = index.html #ppRecipeBar；
     皮肤 = mod/ry-panel.css .pp-recipe-*。
     数据 = localStorage['runye_irrigation_recipes_v1']：
       {version:1, recipes:[{id,name,at,params:{10 个参数 id:值}}]}
     交互（全部无弹窗，反馈走 #ppRecipeStatus）：
       💾 存  —— 按名称框保存（同名覆盖更新；空名自动「方案 N」）；
       调用   —— 回填 10 值 + 派发 change/input 触发实时重算（v517 起三级无独立目标流速输入、
                 按新参数重划分区，与 ppAiPlanFlow.applyPlan 同一套联动）；
       ✎ 改名 —— 用名称框内容改选中方案名（名称框为空则提示）；
       🗑 删除 —— 删选中方案。
     撤掉：删本 IIFE + index.html #ppRecipeBar + ry-panel.css .pp-recipe-* 即可。 ===== */
  (function ppRecipeFlow(){
    var KEY='runye_irrigation_recipes_v1';
    /* 红框 10 项（2026-10-16 用户圈定）：水泵提升/地形高差/水源距离/滴带间距/滴孔间距/
       滴头流量/铺设长度/分区划定/入口压力/目标流速 —— 均为 #ppPlanBar 内原生 input id */
    var IDS=['planLift','planDh','planSrcDist','planTapeSpacing','planEmitterSpacing',
      'planEmitterFlow','planTapeLaySide','planZoneMuManual','planTapePressure','planTargetV'];
    var $=function(id){return document.getElementById(id);};
    /* [v526]（2026-10-17 用户要求）工具栏只留「调用端口」（选择方案+调用）；
       方案命名/保存/改名/删除移入设置弹窗「灌溉参数」页签（#ryRecipe*，由 inline-28 渲染，
       按钮走 #rySetBody 事件委托调 window.RyRecipes）。
       ⚠ 设置页 DOM 会被 render() 重建 ⇒ ryRecipe* 一律每次现查、不缓存；
       全部判空：设置页不在时对应功能退化为不可用，工具栏调用不受影响。 */
    var selEl=$('ppRecipeSelect'),statusEl=$('ppRecipeStatus');
    if(!selEl||!$('ppRecipeApply'))return;
    function read(){try{var d=JSON.parse(localStorage.getItem(KEY)||'null');if(d&&d.version===1&&Array.isArray(d.recipes))return d.recipes;}catch(e){}return [];}
    function write(list){try{localStorage.setItem(KEY,JSON.stringify({version:1,recipes:list}));return true;}catch(e){status('保存失败：浏览器不允许写入本地存储','err');return false;}}
    function status(msg,cls){
      [statusEl,$('ryRecipeStatus')].forEach(function(el){if(!el)return;
        el.textContent=msg;el.className=el.className.replace(' pp-recipe-err','')+(cls==='err'?' pp-recipe-err':'');});
      if(status._t)clearTimeout(status._t);
      status._t=setTimeout(function(){[statusEl,$('ryRecipeStatus')].forEach(function(el){if(el&&el.textContent===msg)el.textContent='';});},4000);
    }
    function snapshot(){var p={};IDS.forEach(function(id){var el=$(id);p[id]=el?el.value:null;});return p;}
    /* [v634 2026-10-20 用户要求]「调用」之后面板与结果必须一起跟着变。原实现三处缺陷：
       ① 自己写一套 set()，绕开 v520 的单一入口 RyPlanParams.set（落盘/派发口径分家）；
       ② 只写原生 input，不碰 sl-input 代理 —— 代理 setter 是靠 try{}catch(_){} 静默劫持的，
          劫持失败时屏幕上显示的还是旧值（"值变了但看着没变"）；
       ③ 不管有没有地块、有没有管线都直冲 ppRepartitionDesign
          —— 无地块 alert、有管线 confirm 并清空，用户一取消就只剩"值变了、什么都没重算"。
       现改为：单一入口写入 → 强制同步代理 → 轻量重算链必跑 → 重分区按条件守卫。 */
    function applyParams(p){
      var wrote=[],skipped=[],viaPlan=false;
      /* ① 单一入口优先（v520 起三个入口都应落到这里：同源派发 + 自动落盘） */
      try{
        if(window.RyPlanParams&&typeof window.RyPlanParams.set==='function'){
          var patch={};
          IDS.forEach(function(id){
            if(p[id]!==null&&p[id]!==undefined&&String(p[id])!=='')patch[id]=p[id];
          });
          window.RyPlanParams.set(patch);viaPlan=true;
        }
      }catch(e){viaPlan=false;}
      /* ② 兜底写入 + 强制同步 sl-input 代理（劫持成功时本步幂等） */
      function set(id,v){
        var el=$(id);
        if(!(el&&v!==null&&v!==undefined&&isFinite(+v)&&String(v)!=='')){skipped.push(id);return;}
        if(String(el.value)!==String(v)||!viaPlan){
          el.value=v;
          el.dispatchEvent(new Event('change',{bubbles:true}));
          el.dispatchEvent(new Event('input',{bubbles:true}));
        }
        var px=document.querySelector('sl-input[data-ry-proxy-for="'+id+'"]');
        if(px&&String(px.value)!==String(el.value)){try{px.value=el.value;}catch(e){}}
        wrote.push(id);
      }
      IDS.forEach(function(id){set(id,p[id]);});
      /* ③ 轻量重算链：一定执行，不依赖 ppRepartitionDesign 是否走得下去 */
      try{if(typeof ppPullLiftDh==='function')ppPullLiftDh();}catch(e){}
      try{if(typeof calcPlan==='function')calcPlan();}catch(e){}
      try{if(typeof ppRender==='function')ppRender();}catch(e){}
      try{if(typeof ppRefreshDiagramOrReset==='function')ppRefreshDiagramOrReset();}catch(e){}
      try{if(typeof renderThreeLevel==='function')renderThreeLevel();}catch(e){}
      try{if(typeof tlUpdatePlanBar==='function')tlUpdatePlanBar();}catch(e){}
      /* ④ 重分区：只在「有地块 + 没有已画管线」时做，避免 alert / confirm 清图 */
      var repart='skip',note='';
      try{
        var hasPlot=!!(window.RunyeBridge&&typeof window.RunyeBridge.hasPlot==='function'&&window.RunyeBridge.hasPlot());
        var hasPipe=(typeof ppHasPipeContent==='function')?!!ppHasPipeContent():false;
        if(!hasPlot){note='未画地块，仅回填参数';}
        else if(hasPipe){note='已有管线保留、未重排';}
        else if(typeof ppRepartitionDesign==='function'){
          ppRepartitionDesign({aiApply:true});repart='done';
        }
      }catch(e){repart='err';}
      return {wrote:wrote,skipped:skipped,repart:repart,note:note};
    }
    function fillSelect(sel,list,keepId){
      if(!sel)return;
      var old=keepId||sel.value;
      sel.innerHTML='<option value="">— 选择方案 —</option>';
      list.forEach(function(r){
        var o=document.createElement('option');o.value=r.id;
        var d=new Date(r.at||0);
        o.textContent=r.name+'（'+(d.getMonth()+1)+'/'+d.getDate()+' 存）';
        sel.appendChild(o);
      });
      if(old&&list.some(function(r){return r.id===old;}))sel.value=old;
    }
    function refreshSelect(keepId){
      var list=read();
      fillSelect(selEl,list,keepId);
      fillSelect($('ryRecipeSelect'),list,keepId);
    }
    function curSelId(){var s=$('ryRecipeSelect');return (s&&s.value)?s.value:(selEl.value||null);}
    /* [v634] 「调用」取方案的目标：**以工具栏下拉为准**（那是用户眼前选中的），
       工具栏没选时才回退设置页下拉。curSelId 的语义（设置页优先）留给改名/删除，不动。 */
    function applyTargetId(){
      if(selEl&&selEl.value)return selEl.value;
      var g=$('ryRecipeSelect');
      if(g&&g.value)return g.value;
      /* [v634b] 两处都没选：回退到「最近保存的方案」并把它选上。
         用户点「调用」的本意就是用方案，不该被一句 4 秒就消失的「请先选择方案」挡回来
         （工具栏宽度不足时下拉框本身就可能看不见，等于让按钮空转）。 */
      var list=read();
      if(!list.length)return null;
      list.sort(function(a,b){return (b.at||0)-(a.at||0);});
      var id=list[0].id;
      if(selEl){try{selEl.value=id;}catch(e){}}
      if(g){try{g.value=id;}catch(e){}}
      return id;
    }
    function curName(){var el=$('ryRecipeName');return el?(el.value||'').trim():'';}
    function doSave(){
      var list=read(),name=curName()||('方案'+(list.length+1));
      var i=list.findIndex(function(r){return r.name===name;});
      if(i>=0){list[i].params=snapshot();list[i].at=Date.now();if(write(list)){refreshSelect(list[i].id);status('已更新「'+name+'」的参数');}}
      else{var r={id:'r_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),name:name,at:Date.now(),params:snapshot()};list.push(r);if(write(list)){refreshSelect(r.id);status('已保存「'+name+'」');}}
    }
    function doRename(){
      /* [v491b 修复沿用] 必须在同一个 read() 数组里找再写回——两次独立 JSON.parse 会把改名写在游离对象上。 */
      var rid=curSelId();var list=read();
      var r=list.find(function(x){return x.id===rid;});
      if(!r){status('请先选择要改名的方案','err');return;}
      var nn=curName();if(!nn){status('请先在「方案名称」框里输入新名称','err');return;}
      if(list.some(function(x){return x.id!==r.id&&x.name===nn;})){status('已有同名方案「'+nn+'」','err');return;}
      r.name=nn;r.at=Date.now();
      if(write(list)){refreshSelect(r.id);status('已改名为「'+nn+'」');}
    }
    function doDel(){
      var rid=curSelId();
      if(!rid||!read().some(function(x){return x.id===rid;})){status('请先选择要删除的方案','err');return;}
      var list=read().filter(function(x){return x.id!==rid;});
      if(write(list)){refreshSelect();status('已删除方案');}
    }
    $('ppRecipeApply').onclick=function(){
      var rid=applyTargetId();
      var r=read().find(function(x){return x.id===rid;})||null;
      if(!r){status('请先在下拉里选择一个方案','err');return;}
      var got=applyParams(r.params||{})||{};
      var miss=(got.skipped&&got.skipped.length)||0;
      var tip='已调用「'+r.name+'」：'+(got.wrote?got.wrote.length:0)+' 项已回填并重算';
      if(miss)tip+='；'+miss+' 项无有效值未回填（'+got.skipped.join('、')+'）';
      if(got.note)tip+='；'+got.note;
      status(tip,miss?'err':undefined);
    };
    /* 旧工具栏 保存/✎/🗑 若 DOM 还在（回滚场景）也照常绑定；不在则跳过 */
    var _old=[[$('ppRecipeSave'),doSave],[$('ppRecipeRename'),doRename],[$('ppRecipeDel'),doDel]];
    _old.forEach(function(pr){if(pr[0])pr[0].onclick=pr[1];});
    window.addEventListener('storage',function(e){if(e.key===KEY)refreshSelect();});
    refreshSelect();
    /* [v526] 设置页管理入口（inline-28 在 #rySetBody 上事件委托调用） */
    window.RyRecipes={ read:read, save:doSave, rename:doRename, del:doDel, refresh:refreshSelect };
  })();


  /* ===== [v248 2026-10-06] 快捷条(#ppQuickBar)整条可拖动。
         [v544] 手写拖动实现（pointer 三件套 + 夹紧 + 存档）已删除，改为在 index.html 上
         声明 data-ry-panel / data-ry-position-key="ppQuickBarPos" + 抓手上 data-ry-drag，
         由 mod/ry-panel.js 的 rypDraggable 统一接管（同一份实现，夹紧容器仍是 #ppCanvasWrap）。
         存档键与格式（{l,t} 相对画布左上角）保持不变 ⇒ 老用户的位置记忆继续有效。 ===== */

  /* ===== [v249 2026-10-06 用户要求] 右侧竖排工具轨「靠右折叠」：点画布右上角把手，
         工具列整条向右缘收起（横向滑出、画布加宽），再点展开；
         状态存 localStorage('ppRailOff')；折叠只改版面，按钮事件全部保留。 ===== */
  (function ppRailCollapse(){
    var stage=document.querySelector('#pipePlanSection .pp-stage'),pane=stage?stage.querySelector('.ry-pane-edit'):null,btn=document.getElementById('ppRailToggle');
    if(!stage||!btn)return;
    /* [v270] body 级置顶代理：外观复制 .pp-rail-tab（z9995 > AI 面板 9993），
       点击转发真按钮；显隐 = 折叠中 && 真按钮 display≠none（真按钮可见期间
       visibility:hidden 防双影）。真按钮的 display 由分区视图/顶栏切换的 CSS 控制，
       代理用 ryShowSection 包装 + MutationObserver 双保险跟随。 */
    var proxy=null;
    function ensureProxy(){
      if(proxy)return;
      proxy=document.createElement('button');
      proxy.type='button';
      proxy.className='pp-rail-tab-float';
      proxy.textContent='工具栏';
      document.body.appendChild(proxy);
      proxy.addEventListener('click',function(){ btn.click(); });
    }
    function syncProxy(offNow){
      ensureProxy();
      /* [v649 2026-10-21] 必须同时满足「本页是当前功能区」。
         原来只判 getComputedStyle(btn).display!=='none' —— display 不会从
         display:none 的祖先继承，所以切到三级 / 多地块页时，二级那个把手
         在计算样式里仍是 flex，代理「工具栏」竖标签就跟着留在**别的页面**的
         视口右缘（用户看到多地块页右边凭空多出一条竖排「工具栏」）。
         ⇒ 追加 ry-active 判定，切页即隐藏。 */
      var ownSec=document.getElementById('pipePlanSection');
      var onOwn=!!(ownSec && ownSec.classList.contains('ry-active'));
      var vis=(offNow && onOwn && getComputedStyle(btn).display!=='none');
      proxy.style.display=vis?'flex':'none';
      proxy.setAttribute('title',offNow?'展开工具栏':'收起工具栏（靠右折叠）');
      btn.style.visibility=vis?'hidden':'';
    }
    function apply(off){
      stage.classList.toggle('pp-rail-off',off);
      if(pane)pane.classList.toggle('pp-rail-off',off);
      btn.classList.toggle('pp-rail-tab',off);
      /* [v270 2026-10-06 用户要求] 折叠标签条永远置顶（见 .pp-rail-tab-float CSS 注释）：
         第一版 inline position:fixed 已被探针证伪 —— fixed 只换包含块、不换层叠上下文，
         真按钮仍是 main{z-index:1} 的子孙，根上下文的 AI 面板(z9993)照样盖住。
         ⇒ 改用 body 级置顶代理（.pp-rail-tab-float，z9995），显隐随折叠态与真按钮可见性同步。 */
      syncProxy(off);
      btn.textContent=off?'工具栏':'\u00bb';
      btn.setAttribute('title',off?'展开工具栏':'收起工具栏（靠右折叠）');
      btn.setAttribute('aria-expanded',off?'false':'true');
    }
    /* [v254] 默认折叠：无存档即折叠；有存档尊重用户上一次的显式选择 */
    var off=true;
    var saved=null;
    try{ saved=localStorage.getItem('ppRailOff'); }catch(err){}
    off=(saved===null)?true:(saved==='1');
    apply(off);
    /* [v270] 代理跟随顶栏分区切换：包装 ryShowSection（ai-plan 也包装过，链式无冲突） */
    if(typeof window.ryShowSection==='function'){
      var origShowRail=window.ryShowSection;
      window.ryShowSection=function(){ var r=origShowRail.apply(this,arguments); setTimeout(function(){ syncProxy(off); },0); return r; };
    }
    /* [v270] 代理跟随二级内部子视图切换（data-ry-view/class/style 变化） */
    try{
      var secEl=btn.closest('#pipePlanSection')||stage;
      new MutationObserver(function(){ syncProxy(off); }).observe(secEl,{attributes:true,attributeFilter:['class','style','data-ry-view']});
    }catch(err){}
    btn.addEventListener('click',function(){
      off=!stage.classList.contains('pp-rail-off');
      try{ localStorage.setItem('ppRailOff',off?'1':'0'); }catch(err){}
      apply(off);
      try{ window.dispatchEvent(new Event('resize')); }catch(err){}
    });
  })();

  /* ===== [v252 2026-10-06 用户要求]「水力计算结果」面板默认折叠：
         点标题行展开、再点收起；输入框/下拉/按钮上的点击不触发折叠
         （目标流速、改径重算交互不受影响）。
         CSS 侧：标题行箭头按五宿主重写 ::before content；字段行 display:none!important。
         [v306 2026-10-08 用户要求] 默认态按页面区分：地块分区页（二级 ppPlanBar2）
         保持载入即折叠（v252 原行为）；管路规划页（三级 tlPlanBar2）默认展开 ——
         init 增加 defaultOff 参数，tlPlanBar2 只加 pp-res-head（点击可折叠）不加
         pp-res-off（初始展开）。两宿主均为静态 HTML，init 载入一次可靠。 ===== */
  (function ppResCollapse(){
    function init(bar, defaultOff){
      if(!bar)return;
      bar.classList.add('pp-res-head');
      if(defaultOff)bar.classList.add('pp-res-off');
      bar.addEventListener('click',function(e){
        if(e.target&&e.target.closest&&e.target.closest('input,select,button'))return;
        bar.classList.toggle('pp-res-off');
      });
    }
    /* [v609] 二级「水力计算结果」默认改为展开（原 v252 是 true=默认折叠）。
       用户 2026-10-20：「默认三组 暂时不用收起 22吧」—— 特性面板三组要一眼看全，
       折叠能力保留（点灰条仍可收起/展开），只是初始不再收起。
       要退回 v252 行为：把下面第一个参数 true 即可。 */
    init(document.getElementById('ppPlanBar2'), false);
    init(document.getElementById('tlPlanBar2'), false);


  /* ===== [v899 用户拍板] tlSrcFlip 右键水源换向（v255）整体移除 =====
     原功能读 tlDiagramData.frontPipe/sourcePos 定位换向端点；v873 起设计侧两者恒置 null
     （设计侧只拥有段总管），该功能实际退化为永久弹「请先生成管线图」误导提示。
     三选一（A 移除监听 / B 改文案 / C 恢复功能改读段总管口径）中用户 2026-11-02 拍板 A。
     注：三级 SVG 里的 [data-tl-src] 热区元素保留（纯渲染标记，无行为），水源方向现在
     由地图总管的画法定义。 */
  })();


  /* ===== [v640 2026-10-21 用户要求]「扬程计算式」二级 / 三级都改成可折叠，且**默认折叠**。
     用户原话：「二级 三级控制面板中的扬程计算式 默认都是可以折叠起来的，改下。」
     两个宿主的 DOM 形态不一样，所以不能照搬 ppResCollapse（那条是给「水力计算结果」整条 .pp-plan-bar
     挂 pp-res-head、用 ::before 拼箭头）：
       · 二级：灰条标题是静态的 <div class="ry-props-head">扬程计算式</div>，
               内容容器是紧跟其后的 #ppCalcDetail ⇒ 折叠态直接挂在这两个元素上。
       · 三级：#ppHeadBreak 的 innerHTML 由 mod/plan-calc-render.js 的 renderHeadBreakdown
               每次重绘（标题 .tl-flat-head + 算式带 .pphb-formula 都是生成的）⇒
               折叠态必须挂在**容器** #ppHeadBreak 上，否则下一次重绘/重算就把状态冲掉；
               点击用容器委托，命中 .tl-flat-head 才算。
     不记忆状态：与「水力计算结果」同口径 —— 每次进入都是默认折叠（用户要的就是这个默认）。
     可点区域排除 input/select/button/a：二级算式带里「提升 / 地形」是可编辑输入，
     万一展开时点它们不能被折叠抢走。
     需要撤掉：删本 IIFE + ry-panel.css / style-01.css 里带 [v640] 的两段 CSS，
     并把 index.html 的两个 ?v= 与 sw.js 版本按前一个版本回退即可。 ===== */
  (function ppFormulaFold(){
    function paint(head, detail, off){
      if (head) {
        head.classList.toggle('pp-fold-off', off);
        head.setAttribute('aria-expanded', off ? 'false' : 'true');
        head.title = off ? '点击展开扬程计算式' : '点击收起扬程计算式';
      }
      if (detail) detail.classList.toggle('pp-fold-body-off', off);
    }
    /* —— 二级 —— */
    var d2 = document.getElementById('ppCalcDetail');
    var h2 = d2 && d2.previousElementSibling;
    if (h2 && h2.classList && h2.classList.contains('ry-props-head')) {
      h2.classList.add('pp-fold-head');
      h2.setAttribute('role', 'button');
      h2.setAttribute('tabindex', '0');
      paint(h2, d2, true);
      var toggle2 = function(){
        paint(h2, d2, !h2.classList.contains('pp-fold-off'));
      };
      h2.addEventListener('click', function(e){
        if (e.target && e.target.closest && e.target.closest('input,select,button,a,textarea')) return;
        toggle2();
      });
      h2.addEventListener('keydown', function(e){
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle2(); }
      });
    }
    /* —— 三级 —— */
    var host = document.getElementById('ppHeadBreak');
    if (host) {
      host.classList.add('pp-fold-off');
      var paint3 = function(off){
        host.classList.toggle('pp-fold-off', off);
        var hd = host.querySelector('.tl-flat-head');
        if (hd) {
          hd.setAttribute('aria-expanded', off ? 'false' : 'true');
          hd.title = off ? '点击展开扬程计算式' : '点击收起扬程计算式';
          hd.style.cursor = 'pointer';
        }
      };
      paint3(true);
      host.addEventListener('click', function(e){
        if (!e.target || !e.target.closest) return;
        if (e.target.closest('input,select,button,a')) return;
        if (!e.target.closest('.tl-flat-head')) return;
        paint3(!host.classList.contains('pp-fold-off'));
      });
      /* 重绘后把 aria/title 补到新生成的标题上（折叠 class 在容器上，不受重绘影响） */
      try {
        new MutationObserver(function(){
          var hd = host.querySelector('.tl-flat-head');
          if (hd && !hd.dataset.ppFoldBound) {
            hd.dataset.ppFoldBound = '1';
            paint3(host.classList.contains('pp-fold-off'));
          }
        }).observe(host, { childList: true });
      } catch (e) { }
    }
  })();

  /* ===== [v193] 成组编辑切换：整组 / 逐块 + 选择子地块 + 总管 ===== */
  (function bindGroupEditUI(){
    var bWhole=document.getElementById('ppGeWhole');
    var bPer=document.getElementById('ppGePerPlot');
    var sel=document.getElementById('ppGePlotSel');
    if(bWhole)bWhole.addEventListener('click',function(){ ppSetGroupMode('whole'); });
    if(bPer)bPer.addEventListener('click',function(){ ppSetGroupMode('perPlot'); });
    if(sel)sel.addEventListener('change',function(){ ppSelectGroupPlot(parseInt(this.value,10)||0); });
    /* [v242] 「◀ 返回成组管路」：与「在地块轮廓外面双击」同一个出口函数（不在本页另写一份）。 */
    var backBtn=document.getElementById('ppBackToGroupBtn');
    if(backBtn)backBtn.addEventListener('click',function(){
      if(typeof window.grBackFromPlotEdit==='function')window.grBackFromPlotEdit();
    });
    /* [v228] 块按钮列表：事件委托（按钮由 ppSyncGroupEditUI 动态生成，不在生成处逐个绑） */
    var chips=document.getElementById('ppGePlotChips');
    if(chips)chips.addEventListener('click',function(e){
      var b=e.target;
      while(b&&b!==chips&&!(b.classList&&b.classList.contains('pp-ge-chip')))b=b.parentNode;
      if(!b||b===chips)return;
      ppSelectGroupPlot(parseInt(b.getAttribute('data-idx'),10)||0);
    });
  })();

  // 任务K（2026-09-26）：分区面积锁定按钮的 UI 同步与自动解锁
  // [v824] 状态不许写 textContent —— 那会连 decorate() 挂的 <svg class="ry-ico"> 一起
  // 清掉，且没人再补挂（用户实测：点一下按钮图标就永久变空白）。
  // 现在：图标 lock ⇄ unlock、类 active、aria-pressed、title 四件套表达状态。
  function ppSetBtnLabel(btn,text){
    if(!btn)return;
    if(window.RyIcons&&window.RyIcons.setLabel)window.RyIcons.setLabel(btn,text);
    else btn.textContent=text;
  }
  function ppSetBtnIcon(btn,name){
    if(!btn||!window.RyIcons||!window.RyIcons.setIcon)return;
    window.RyIcons.setIcon(btn,name);
  }
  function ppUpdateLockAreaBtn(){
    var btn=document.getElementById('ppLockArea');
    if(!btn)return;
    var on=!!ppState.areaLocked;
    ppSetBtnIcon(btn,on?'unlock':'lock');
    ppSetBtnLabel(btn,on?'已锁定面积':'锁定面积');
    btn.classList.toggle('active',on);
    btn.setAttribute('aria-pressed',on?'true':'false');
    btn.title=on
      ?'已锁定分区面积：拖动网格线只整体平移分区、不改变各区面积；再点一次解锁'
      :'锁定分区面积：开启后拖动网格线只整体平移分区，不改变各区面积（如 18 亩保持 18 亩）；例外：最外侧分区线拖到地块边线可直接合并减区；合并/重置/重新分区/旋转等操作会先自动解锁';
  }
  function ppUnlockArea(){
    if(ppState.areaLocked){ ppState.areaLocked=false; ppUpdateLockAreaBtn(); }
  }
  var ppResetCutsBtn=document.getElementById('ppResetCuts');
  if(ppResetCutsBtn){
    ppResetCutsBtn.addEventListener('click',function(){
      if(ppIsGroupWhole())return;
      var groupPreimage=ppGroupMemberPreimage();
      if(groupPreimage&&groupPreimage.invalid)return;
      var singlePreimage=!groupPreimage&&typeof window.ppGetState==='function'?window.ppGetState():null;
      ppPushHistory();
      ppUnlockArea(); // 重置网格会改变各区面积，锁定态自动解除（任务K 2026-09-26）
      ppState.cutOverrides={x:{},y:{}};ppResetCutSnap('');
      ppState.dragCut=null;ppState.hoverCut=null;ppState.lastSelectedCut=null;
      if(groupPreimage&&!ppCommitGroupMemberEdit(groupPreimage))return;
      if(singlePreimage&&!ppCommitSinglePlotEdit(singlePreimage,'cut-reset',false,true))return;
      ppRender();
      if(typeof window.ppRefreshDiagramIfVisible==='function')window.ppRefreshDiagramIfVisible();
    });
  }
  /* ===== [v185 建 / v189 改语义] 地块划分开关（用户要求）=====
   * 用户诉求：大地块传到二级管路页面后默认**自动划分**分区（按左侧面板参数）；
   *   不需要自动划分时，关掉本开关 = **该地块不再自动划分分区**（整块当一个区）。
   *
   * ⚠ v189 语义纠正（2026-10-03，用户原话）：
   *   「这个是显示分区线的的，而不是点击之后开启分区线调节的，你理解错了，
   *     我的意思是 如果这个开关关闭之后，地块就不自动划分分区了，你修改过来。」
   *   ⇒ 上一版把本开关实现成「只隐藏分区线、数据照常按 N 区算」是**错的**；
   *     正确口径是**真的不划分**：关闭后分区数=1，面积/水力/材料全按整块算。
   *   ⇒ 实现落在最上游 ppGetZoneLayout（开关关闭 → 返回 1×1 单区布局），
   *     全链路天然一致，不留「画面一个区、数据四个区」的半吊子状态。
   *   ⇒ 不再「关闭时自动切到调网格模式」—— 那是上一版错误语义下的附带行为；
   *     现在的口径下关闭=不划分，没有「需要用户去手动调线」这回事
   *     （想手动划分：保持开关打开，然后用「调网格」微调）。
   *   · 状态持久化到 localStorage['runye_zone_auto']，刷新/切页后保持。
   */
  /* ===== [v822 恒自动分区] 地块一律按左侧面板参数自动划分，不再有「整块一区」态 =====
   * 背景（P0）：陈年 localStorage['runye_zone_auto']='0' 在 v795 删除顶部「地块划分」
   *   开关按钮后用户再无法改回，导致 ppGetZoneLayout 恒走 1×1 单区分支 —— 用户实测
   *   「地块不能被分区」，画布整块一色只剩「1区」。用户明确表态：从未要求过
   *   「整块一区」，分区应始终自动进行。
   * 决策：本函数是全链路**唯一**的布局决策点（ppGetZoneLayout 仅调它），故恒返回 true
   *   ⇒ 布局永远走自动划分分支，与 ppState.zoneAuto / localStorage 的历史值彻底解耦。
   * 为何不动 ppState.zoneAuto / localStorage / 存档导出：这些值仍被规范绘图模型
   *   （drawing-design-legacy-adapter）用来推导 partition.mode 并参与 CAS 事务比对；
   *   若强行改写，会与既有存档里固化的 partition.mode='manual' 冲突，触发
   *   「single-plot ... transaction rejected」反而让编辑失效（已实测）。保留其原值，
   *   仅用本函数切断它对「是否分区」的影响 —— 这是副作用最小、最不易回归的收口位置。
   *   localStorage 的历史 '0' 自此不再具有任何决策作用，作为无害遗留保留，不做清洗。 */
  function ppZoneAutoOn(){ return true; }
  /* [v202] 开关控件由 checkbox 改为切换按钮（用户原话：「点击执行，不要勾选，
     勾选的话 整体看起来不统一」）。active 高亮 = 正在自动划分，与「↻ 分区旋转90°」
     的 active 口径一致；关闭时给琥珀描边提示「现在是整块一区」。
     旧 id（ppZoneAutoChk/ppZoneAutoWrap/ppZoneAutoTxt）已随 checkbox 一起移除。 */
  function ppApplyZoneAutoUI(){
    var on = ppZoneAutoOn();
    if(document.body) document.body.classList.toggle('ry-zoneauto-off', !on);
    var btn=document.getElementById('ppZoneAutoBtn');
    if(btn){
      btn.classList.toggle('active', on);
      ppSetBtnLabel(btn,on ? '地块划分' : '地块不划分'); // [v824] 保住 SVG 图标
      btn.title = on
        ? '正在自动划分：按左侧面板参数切分区。点击后本块不自动划分，整块作为一个区参与面积/水力/材料计算。'
        : '当前：本块不自动划分分区（整块当一个区）。点击恢复按左侧面板参数自动划分。';
    }
  }
  /* [v188 2026-10-03] 把「模式切换要同步微调箭头组显隐」这件事归一到一个函数。
     起因（Edge 真渲染实测）：从「调网格」进入 adjustCut 时，按钮 active 变了、
     mode 也变了，但 #ppCutFineGroup 仍是 display:none 的话就会「按钮亮了却没有微调箭头」。
     与既有 ppSetMode 里的写法保持同一口径：adjustCut → inline-flex，否则 none。 */
  function ppSyncFineGroup(){
    var fg=document.getElementById('ppCutFineGroup');
    if(fg) fg.style.display = (ppState.mode==='adjustCut') ? 'inline-flex' : 'none';
  }
  function ppSetZoneAuto(on){
    on = !!on;
    var changed=on!==!!ppState.zoneAuto;
    var groupPreimage=changed?ppGroupMemberPreimage():null;
    if(groupPreimage&&groupPreimage.invalid)return false;
    var singlePreimage=changed&&!groupPreimage&&!ppIsGroupWhole()&&typeof window.ppGetState==='function'
      ?window.ppGetState():null;
    if(changed)ppPushHistory();
    ppState.zoneAuto = on;
    if(groupPreimage&&!ppCommitGroupMemberEdit(groupPreimage))return false;
    if(singlePreimage&&typeof window.ryCommitSinglePlotL2Snapshot==='function'){
      var singleCommit=window.ryCommitSinglePlotL2Snapshot(singlePreimage,window.ppGetState());
      if(singleCommit===false){
        ppDiscardLatestHistoryEntry();
        ppApplySlot(singlePreimage);
        ppApplyZoneAutoUI();
        if(typeof updatePlan==='function')updatePlan();
        ppRender();
        if(typeof window.ppRefreshDiagramIfVisible==='function')window.ppRefreshDiagramIfVisible();
        if(typeof window.tlRefreshFromPlan==='function'){try{window.tlRefreshFromPlan();}catch(e){}}
        console.warn('[plot-editor] single-plot zone-auto transaction rejected');
        return false;
      }
    }
    try{ localStorage.setItem('runye_zone_auto', on ? '1' : '0'); }catch(e){}
    ppApplyZoneAutoUI();
    /* 开关改变的是「分区怎么算」⇒ 必须重算 + 重绘下游，而不只是切个 CSS 类。
       ppRender 负责二级画布；ppRefreshDiagramIfVisible 负责施工简图/材料联动。 */
    try{
      if(ppState.mode==='adjustCut' && !on){
        /* 关闭划分后「调网格」失去意义（没有内部线可拖）⇒ 退出该模式，避免残留按钮高亮。 */
        ppState.mode='main';
        document.querySelectorAll('#ppToolbar .pp-btn[data-mode]').forEach(function(b){
          b.classList.toggle('active', b.getAttribute('data-mode')==='main');
        });
        ppSyncFineGroup();
      }
      ppRender();
      if(typeof window.ppRefreshDiagramIfVisible==='function') window.ppRefreshDiagramIfVisible();
      /* 三级页若在跑，也要跟着变（它读同一份分区网格）。 */
      if(typeof window.tlRefreshFromPlan==='function'){ try{ window.tlRefreshFromPlan(); }catch(e){} }
    }catch(e){}
    return true;
  }
  /* [v822 恒自动分区] 初始态恒为自动划分，并一次性清除陈年残留。
     v795 起顶部「地块划分」开关按钮已删除，用户无法再主动关闭分区；
     localStorage['runye_zone_auto'] 里的 '0' 是 v185~v202 老开关时代遗留的脏数据，
     旧逻辑会读它把地块卡成整块 1 区（用户 P0 现场）。这里清除该残留、初始恒 true，
     与 ppZoneAutoOn() 恒 true 的语义对齐，全链路一致（纯内部，不涉任何 UI）。 */
  (function ppInitZoneAuto(){
    ppState.zoneAuto = true;
    try{ if(localStorage.getItem('runye_zone_auto')==='0') localStorage.removeItem('runye_zone_auto'); }catch(e){}
    ppApplyZoneAutoUI();
    var btn=document.getElementById('ppZoneAutoBtn');
    if(btn){
      btn.classList.toggle('active', ppZoneAutoOn());
      btn.addEventListener('click',function(){ ppSetZoneAuto(!ppZoneAutoOn()); });
    }
    window.ppSetZoneAuto=ppSetZoneAuto;
    window.ppZoneAutoOn=ppZoneAutoOn;
  })();

  var ppLockAreaBtn=document.getElementById('ppLockArea');
  if(ppLockAreaBtn){
    ppLockAreaBtn.addEventListener('click',function(){
      var groupPreimage=ppGroupMemberPreimage();
      if(groupPreimage&&groupPreimage.invalid)return;
      var singlePreimage=!groupPreimage&&!ppIsGroupWhole()&&typeof window.ppGetState==='function'
        ?window.ppGetState():null;
      ppPushHistory();
      ppState.areaLocked=!ppState.areaLocked;
      if(groupPreimage&&!ppCommitGroupMemberEdit(groupPreimage))return;
      if(singlePreimage&&!ppCommitSinglePlotEdit(singlePreimage,'area-lock',false,false))return;
      ppUpdateLockAreaBtn();
    });
    ppUpdateLockAreaBtn(); // 同步初始文案（默认未锁定）
  }
  // 2026-09-28 晚（用户拍板）：取消豁免开关按钮，横竖一个原则——
  // 「锁定面积」开启时，最外侧内部线（index=1 或 len-2）永远可直接拖到边线合并减区；中间线仍整轴平移。
  // 未锁定时维持原吸附合并逻辑不变（ppBmFreeOk 仅在锁定态参与判定）。
  function ppBmFreeOk(axis,index){
    if(!ppState.areaLocked)return false;
    var cuts=ppCurrentCuts(); if(!cuts)return false;
    var arr=cuts[axis==='x'?'xPos':'yPos'];
    return index===1||index===arr.length-2;
  }


  // ===== 网格线微调 =====
  // Fine-tune cut line position (0.3m per click)
  function ppFineStepWorld(axis){
    var t=ppState.transform;
    if(!t||!t.scaleX||!t.scaleY)return 0.5;
    var ps=axis==='x'?t.scaleX:t.scaleY;
    if(!ps||ps===0)return 0.5;
    return 0.3/ps;
  }
  function ppNudgeCut(dir){
    if(ppState.mode!=='adjustCut')return;
    var sel=ppState.lastSelectedCut;
    if(!sel){ sel=ppState.hoverCut; }
    if(!sel){return;}
    var groupPreimage=ppGroupMemberPreimage();
    if(groupPreimage&&groupPreimage.invalid)return;
    var singlePreimage=!groupPreimage&&!ppIsGroupWhole()&&typeof window.ppGetState==='function'
      ?window.ppGetState():null;
    // 面积锁定：微调改为整轴刚性平移，各区面积不变（任务K 2026-09-26）
    if(ppState.areaLocked){
      ppPushHistory();
      var b2=ppGetBounds(); if(!b2)return;
      var planN2=parseInt(document.getElementById('planN')?.value)||parseInt(document.getElementById('fld_N')?.value)||4;
      var layout2=ppGetZoneLayout(b2,planN2);
      var cuts2=ppGetZoneCuts(b2,layout2); if(!cuts2)return;
      var ax=sel.axis;
      var s=ppFineStepWorld(ax);
      var d=0;
      if(ax==='x'){ if(dir==='left')d=-s; else if(dir==='right')d=s; else return; }
      else { if(dir==='up')d=-s; else if(dir==='down')d=s; else return; }
      if(d===0)return;
      var arr2=cuts2[ax==='x'?'xPos':'yPos'];
      var mg=Math.max(2,4*ppWorldPerPixel(ax));
      var dMin=arr2[0]+mg-arr2[1], dMax=arr2[arr2.length-1]-mg-arr2[arr2.length-2];
      var delta=d;
      if(dMin>dMax)delta=0; else { if(delta<dMin)delta=dMin; if(delta>dMax)delta=dMax; }
      var o2=arr2.slice();
      for(var i2=1;i2<arr2.length-1;i2++){ ppSetCutPos(ax,i2,o2[i2]+delta); }
      ppState.mergePreview=null;
      if(groupPreimage&&!ppCommitGroupMemberEdit(groupPreimage))return;
      if(singlePreimage&&!ppCommitSinglePlotEdit(singlePreimage,'cut-nudge-locked',false,true))return;
      ppRender();
      /* v166：整轴刚性平移后同步三级简图 */
      if(typeof window.ppRefreshTLAfterCuts==='function')window.ppRefreshTLAfterCuts();
      else if(typeof window.ppRefreshDiagramIfVisible==='function')window.ppRefreshDiagramIfVisible();
      return;
    }
    ppPushHistory();
    var b=ppGetBounds();
    if(!b)return;
    var planN=parseInt(document.getElementById('planN')?.value)||parseInt(document.getElementById('fld_N')?.value)||4;
    var layout=ppGetZoneLayout(b,planN);
    var cuts=ppGetZoneCuts(b,layout);
    if(!cuts)return;
    var axis=sel.axis;
    var idx=sel.index;
    var arr=cuts[axis==='x'?'xPos':'yPos'];
    if(idx<=0||idx>=arr.length-1)return; // 该线已被合并删除
    // Get current position (with manual adjustments applied)
    var curPos=arr[idx];
    var step=ppFineStepWorld(axis);
    var delta=0;
    if(axis==='x'){
      // vertical line: left = decrease x, right = increase x
      if(dir==='left')delta=-step;
      else if(dir==='right')delta=step;
      else return; // up/down not applicable
    }else{
      // horizontal line: up = decrease y, down = increase y
      if(dir==='up')delta=-step;
      else if(dir==='down')delta=step;
      else return; // left/right not applicable
    }
    var newPos=curPos+delta;
    // Constrain between neighbors
    var minBound=arr[idx-1]+2;
    var maxBound=arr[idx+1]-2;
    if(newPos<minBound)newPos=minBound;
    if(newPos>maxBound)newPos=maxBound;
    ppSetCutPos(axis,idx,newPos);
    ppState.lastSelectedCut={axis:axis,index:idx};
    if(groupPreimage&&!ppCommitGroupMemberEdit(groupPreimage))return;
    if(singlePreimage&&!ppCommitSinglePlotEdit(singlePreimage,'cut-nudge',false,true))return;
    ppRender();
    /* v166：微调后同步三级简图（键盘方向键与微调按钮都走这里） */
    if(typeof window.ppRefreshTLAfterCuts==='function')window.ppRefreshTLAfterCuts();
    else if(typeof window.ppRefreshDiagramIfVisible==='function')window.ppRefreshDiagramIfVisible();
  }
  ['ppFineUp','ppFineDown','ppFineLeft','ppFineRight'].forEach(function(id){
    var btn=document.getElementById(id);
    if(btn){
      var dir=id.replace('ppFine','').toLowerCase();
      btn.addEventListener('click',function(){ppNudgeCut(dir);});
    }
  });

  // Generate diagram
  function ppArrow(p1,p2,color){
    var a=Math.atan2(p2.y-p1.y,p2.x-p1.x);var len=10;
    var x1=p2.x-len*Math.cos(a-Math.PI/6),y1=p2.y-len*Math.sin(a-Math.PI/6);
    var x2=p2.x-len*Math.cos(a+Math.PI/6),y2=p2.y-len*Math.sin(a+Math.PI/6);
    return'<polygon points="'+p2.x.toFixed(1)+','+p2.y.toFixed(1)+' '+x1.toFixed(1)+','+y1.toFixed(1)+' '+x2.toFixed(1)+','+y2.toFixed(1)+'" fill="'+color+'"/>';
  }

  /* [v193] 施工图 = **一张总图**（用户拍板 ⑤）：逐块态出图时，临时把 ppState 换成
     整组视图（外框 + 各块管线合并 + 总管），出完立刻还原 —— ppState 仍停在当前块，
     编辑态不受影响。整组态本来就已是整组视图，直接走 core。 */
  function ppGenerateDiagram(options){
    var ge=window.__runyeGroupEdit;
    if(!(ge&&ge.active&&ge.mode==='perPlot'))return ppGenerateDiagramCore(options);
    if(!ppSaveGroupMemberSlot(ge.current,ppCaptureSlot()))return null; // canonical提交成功后再生成组图
    var back=ppCaptureSlot();                      // 出图后原样还原
    var mode0=ge.mode;                             // ★ 连 mode 一起临时切成 whole：
    try{                                           //   否则 ppGroupActiveSubs() 仍只返回当前块，
      ge.mode='whole';                             //   画的就不是「一张总图」而是「当前块的图」。
      ppState.polyPts=ge.framePts.map(function(p){return{x:p.x,y:p.y};});
      var m=ppCollectGroupAllPipes();
      if(!m)return null;
      ppState.mainPipes=m.main; ppState.branchPipes=m.branch; ppState.subBranchPipes=m.subbranch;
      ppState.source=null; ppState.valves=[];
      ppState.hiddenPipes={main:{},branch:{},subbranch:{}};
      ppEnsurePipeIds('main');ppEnsurePipeIds('branch');ppEnsurePipeIds('subbranch');
      return ppGenerateDiagramCore(options);
    } finally {
      ge.mode=mode0;                               // 先还原 mode，再还原 slot
      ppApplySlot(back);
    }
  }
  function ppGenerateDiagramCore(options){
    options=options||{};
    var doScroll=options.scroll!==false;
    if(!ppState.polyPts.length){alert('请先到「在线地图」画框并回传地块');return;}
    var r=window._r||{};
    var pd=window.planData||{};
    // 直接引用计算器结果
    var mainPipeOD=pd.mainPipeOD||(r.mainPipe?('Ø '+r.mainPipe.od+' mm'):'—');
    var mainPipeLen=r.mainPipeLen?r.mainPipeLen.toFixed(1)+' m':'—';
    var branchPipeOD=pd.branchPipeOD||(r.branchPipe?('Ø '+r.branchPipe.od+' mm'):'—');
    var pFlow=r.zoneFlow?r.zoneFlow.toFixed(1)+' m³/h':'—';
    var pHead=r.pumpHead?r.pumpHead.toFixed(1)+' m':'—';
    var motorKW=r.motorKW_rounded?r.motorKW_rounded+' kW':'—';
    var areaMu=window.measuredArea?(window.measuredArea/666.67).toFixed(2):(r.totalMu?r.totalMu.toFixed(2):'—');
    var stDims=window.runyePlanDims||{};
    var planA=document.getElementById('planA')?document.getElementById('planA').textContent:(isFinite(stDims.A)?String(stDims.A):'—');
    var planB=document.getElementById('planB')?document.getElementById('planB').textContent:(isFinite(stDims.B)?String(stDims.B):'—');
    var planPumpFlow=document.getElementById('planPumpFlow')?document.getElementById('planPumpFlow').textContent:'—';
    var planPumpHead=document.getElementById('planPumpHead')?document.getElementById('planPumpHead').textContent:'—';
    var planPumpPower=document.getElementById('planPumpPower')?document.getElementById('planPumpPower').textContent:'—';
    var planIntensity=document.getElementById('planIntensity')?document.getElementById('planIntensity').textContent:'—';
    var planTapeSpacing=document.getElementById('planTapeSpacing')?document.getElementById('planTapeSpacing').value:'—';
    var planEmitterSpacing=document.getElementById('planEmitterSpacing')?document.getElementById('planEmitterSpacing').value:'—';
    var layoutSides=parseInt(document.querySelector('#layoutGroup .selected')?.dataset?.sides||1);

    var b=ppGetBounds();
    var displayB=ppGetDisplayBounds();
    var plotDims=ppGetPlanDims(b);
    var plotW=plotDims.w,plotH=plotDims.h;
    var plotScaleX=b.w>0?plotW/b.w:1;
    var plotScaleY=b.h>0?plotH/b.h:1;
    var plotDisplayW=displayB.w*plotScaleX;
    var plotDisplayH=displayB.h*plotScaleY;
    // A3/A4 横向工程图纸比例：宽:高 ≈ 1.414:1（420×297 mm）
    var svgW=1190,svgH=841,pad=60,bottomH=130;
    var drawW=svgW-2*pad,drawH=svgH-pad-bottomH;
    var drawY2=svgH-bottomH;
    var s=Math.min(drawW/plotDisplayW,drawH/plotDisplayH);
    s=Math.min(s,2);
    var ox=pad+(drawW-plotDisplayW*s)/2,oy=pad+(drawH-plotDisplayH*s)/2;
    function ts(mx,my){return{x:(mx-displayB.minX)*plotScaleX*s+ox,y:(my-displayB.minY)*plotScaleY*s+oy};}
    function gridWorld(gx,gy){return zoneCuts&&zoneCuts.frame?zoneCuts.frame.toWorld({x:gx,y:gy}):{x:gx,y:gy};}
    function tsGrid(gx,gy){var p=gridWorld(gx,gy);return ts(p.x,p.y);}
    function gridCellPoints(x0,y0,x1,y1){return[tsGrid(x0,y0),tsGrid(x1,y0),tsGrid(x1,y1),tsGrid(x0,y1)];}
    function svgPoints(points){return points.map(function(p){return p.x.toFixed(1)+','+p.y.toFixed(1);}).join(' ');}

    /* [v190] 成组地块：施工图里**每个成员环各写一条子路径**（M…L…Z 循环），
       块间空隙不写进 d ⇒ 底色填充 / 分区裁剪 / 描边都自然留出空隙，
       与画布 ppTracePlotPath 同口径（都用 ppGetRotatedSubRings）。 */
    var d='';
    var _svgRings=ppGetRotatedSubRings()||[ppGetRotatedPlotPoints()];
    _svgRings.forEach(function(rg){
      if(!rg||rg.length<3)return;
      for(var i=0;i<rg.length;i++){
        var p=ts(rg[i].x,rg[i].y);
        d+=(i===0?'M':'L')+p.x.toFixed(1)+' '+p.y.toFixed(1)+' ';
      }
      d+='Z ';
    });
    d=d.trim();

    var planN=parseInt(document.getElementById('planN')?.value)||4;
    var zoneLayout=ppGetZoneLayout(b,planN);
    var zoneCuts=ppGetZoneCuts(b,zoneLayout);
    planN=zoneCuts.cols*zoneCuts.rows;
    var _nomMuMin=Infinity,_nomMuMax=0;
    for(var _zr0=0;_zr0<zoneCuts.rows;_zr0++){for(var _zc0=0;_zc0<zoneCuts.cols;_zc0++){
      var _nomMu=zoneCuts.xPlan[_zc0]*zoneCuts.yPlan[_zr0]/666.67;
      if(_nomMu<_nomMuMin)_nomMuMin=_nomMu;
      if(_nomMu>_nomMuMax)_nomMuMax=_nomMu;
    }}
    var zoneAreaMu=(!isFinite(_nomMuMin)||_nomMuMax<=0)?'0.00':((Math.round(_nomMuMin*100)!==Math.round(_nomMuMax*100))?(_nomMuMin.toFixed(2)+'~'+_nomMuMax.toFixed(2)):_nomMuMax.toFixed(2));
    // 预统计：实际面积小于标准分区的"非标准分区"数量
    var plotPoly=ppState.polyPts&&ppState.polyPts.length>=3?ppState.polyPts.map(function(p){return{x:p.x,y:p.y};}):null;
    var partialCount=0;
    for(var _zr=0;_zr<zoneCuts.rows;_zr++){for(var _zc=0;_zc<zoneCuts.cols;_zc++){
      var _m2=ppZoneActualAreaM2(_zc,_zr,zoneCuts,plotPoly);
      var _mu=_m2/666.67;
      var _stdMu=zoneCuts.xPlan[_zc]*zoneCuts.yPlan[_zr]/666.67;
      if(_stdMu>0&&_mu<_stdMu*0.97&&_mu>0.05)partialCount++;
    }}

    var parts=[];
    parts.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+svgW+' '+svgH+'" style="background:#fff">');
    parts.push('<rect x="8" y="8" width="'+(svgW-16)+'" height="'+(svgH-16)+'" fill="none" stroke="#999" stroke-width="1.5" rx="2"/>');
    parts.push('<text x="'+svgW/2+'" y="42" text-anchor="middle" font-size="20" font-weight="700" fill="#1a4731">润野灌溉 · 施工简图</text>');
    var headerExtra=partialCount>0?(' | 非标准 '+partialCount+' 区'):'';
    parts.push('<text x="34" y="42" text-anchor="start" font-size="12" font-weight="700" fill="#334155">面积 '+areaMu+' 亩 | 地块 '+planA+'×'+planB+' m | '+planN+'分区 | 标准区 '+zoneAreaMu+' 亩'+headerExtra+'</text>');
    parts.push('<g id="ppPlotGroup">');
    parts.push('<defs><clipPath id="ppPlotClip"><path d="'+d+'"/></clipPath></defs>');
    parts.push('<path d="'+d+'" fill="rgba(134,239,172,.1)" stroke="none"/>');

    // Plot outline
    parts.push('<path d="'+d+'" fill="none" stroke="#1a4731" stroke-width="2"/>');

    // Auto-generated partition zone blocks. Each zone side is limited to 200m.
    var planN=parseInt(document.getElementById('planN')?.value)||4;
    var zoneLayout=ppGetZoneLayout(b,planN);
    var zoneCuts=ppGetZoneCuts(b,zoneLayout);
    planN=zoneCuts.cols*zoneCuts.rows;
    /* 2026-09-27：与二级画布 / 三级工作区统一 —— 4 色循环（红/琥珀/绿/蓝，α=.30） */
    var zoneCols=['rgba(191,88,88,.30)','rgba(214,162,73,.30)','rgba(75,173,111,.30)','rgba(84,127,196,.30)'];
    var zoneStrokes=['rgba(51,65,85,.28)','rgba(51,65,85,.28)','rgba(51,65,85,.28)','rgba(51,65,85,.28)'];
    var labelParts=[];
    parts.push('<g clip-path="url(#ppPlotClip)" class="pp-zone-layer">');
    for(var zr=0;zr<zoneCuts.rows;zr++){
      for(var zc=0;zc<zoneCuts.cols;zc++){
        var zi=zr*zoneCuts.cols+zc;
        var zx=zoneCuts.xPos[zc], zy=zoneCuts.yPos[zr];
        var zoneW=zoneCuts.xSrc[zc], zoneH=zoneCuts.ySrc[zr];
        var cellPts=gridCellPoints(zx,zy,zx+zoneW,zy+zoneH);
        var ci=zi%zoneCols.length;
        // 实际落在线段多边形内的面积（m²）与标准区比较，判定是否"非完整分区"
        var actualM2=ppZoneActualAreaM2(zc,zr,zoneCuts,plotPoly);
        var actualMu=actualM2/666.67;
        var _stdMu=zoneCuts.xPlan[zc]*zoneCuts.yPlan[zr]/666.67;
        var isPartial=_stdMu>0 && actualMu<_stdMu*0.97;
        var cellFill=zoneCols[ci];   /* 2026-09-27：非标区保留本色（三级同规则），仅描边用琥珀区分 */
        var cellStroke=isPartial?'rgba(217,119,6,.85)':zoneStrokes[ci];
        parts.push('<polygon points="'+svgPoints(cellPts)+'" fill="'+cellFill+'" stroke="'+cellStroke+'" stroke-width="1" stroke-dasharray="6,3"/>');
      }
    }
    parts.push('</g>');
    // 文字标注层：移到裁剪之外单独绘制，避免被地块边界切掉；非标分区居中标注实际亩数
    for(var zr=0;zr<zoneCuts.rows;zr++){
      for(var zc=0;zc<zoneCuts.cols;zc++){
        var zi=zr*zoneCuts.cols+zc;
        var zx=zoneCuts.xPos[zc], zy=zoneCuts.yPos[zr];
        var zoneW=zoneCuts.xSrc[zc], zoneH=zoneCuts.ySrc[zr];
        var cellPts=gridCellPoints(zx,zy,zx+zoneW,zy+zoneH);
        var cellXs=cellPts.map(function(p){return p.x;}),cellYs=cellPts.map(function(p){return p.y;});
        var rx=Math.min.apply(null,cellXs),ry=Math.min.apply(null,cellYs),rw=Math.max.apply(null,cellXs)-rx,rh=Math.max.apply(null,cellYs)-ry;
        // Screen-space lengths along the partition grid axes (the axis-aligned bbox
        // shrinks as the grid rotates and must not decide whether dimensions exist).
        var zoneScreenW=Math.hypot(cellPts[1].x-cellPts[0].x,cellPts[1].y-cellPts[0].y);
        var zoneScreenH=Math.hypot(cellPts[2].x-cellPts[1].x,cellPts[2].y-cellPts[1].y);
        var labelAngle=Math.atan2(cellPts[1].y-cellPts[0].y,cellPts[1].x-cellPts[0].x)*180/Math.PI;
        if(labelAngle>90)labelAngle-=180;else if(labelAngle<-90)labelAngle+=180;
        /* [v850 用户反馈] 标注放到分块**右上角**（原居中，压着管线难读）。
           cellPts 布局：[0]左上 [1]右上 [2]右下 [3]左下。锚点 = 右上角沿边内缩
           （局部 x 缩 PADX、y 缩 PADY），文字右对齐（text-anchor:end），行全部从
           锚点向下排（y 正值），与三级页 inline-09 同一批口径。 */
        var labelPadX=Math.max(4,zoneScreenW*0.04), labelPadY=Math.max(3,zoneScreenH*0.06);
        var lUx=zoneScreenW>0?(cellPts[1].x-cellPts[0].x)/zoneScreenW:1, lUy=zoneScreenW>0?(cellPts[1].y-cellPts[0].y)/zoneScreenW:0;
        var lVx=zoneScreenH>0?(cellPts[3].x-cellPts[0].x)/zoneScreenH:0, lVy=zoneScreenH>0?(cellPts[3].y-cellPts[0].y)/zoneScreenH:1;
        var labelCorner={x:cellPts[1].x-labelPadX*lUx+labelPadY*lVx, y:cellPts[1].y-labelPadX*lUy+labelPadY*lVy};
        var actualM2=ppZoneActualAreaM2(zc,zr,zoneCuts,plotPoly);
        var actualMu=actualM2/666.67;
        var _stdMu=zoneCuts.xPlan[zc]*zoneCuts.yPlan[zr]/666.67;
        var isPartial=_stdMu>0 && actualMu<_stdMu*0.97;
        if(actualMu>0.05){
          // Dimensions are reported in grid-axis order (x × y), including partial cells.
          // Use a readable rotation of the text with the grid and choose detail by the
          // cell's true along-axis space, not its shrinking screen-aligned bounding box.
          var zoneSizeText=ppZoneSizeLabel(zoneCuts.xPlan[zc],zoneCuts.yPlan[zr]);
          var zoneAreaText=(isPartial?actualMu:(zoneCuts.xPlan[zc]*zoneCuts.yPlan[zr]/666.67)).toFixed(1)+'亩';
          var detailFont=Math.max(6.5,Math.min(10.5,Math.min(zoneScreenW/12,zoneScreenH/4.8)));
          var compactFont=Math.max(6,Math.min(8.5,Math.min(zoneScreenW/18,zoneScreenH/2.8)));
          labelParts.push('<g transform="translate('+labelCorner.x.toFixed(1)+' '+labelCorner.y.toFixed(1)+') rotate('+labelAngle.toFixed(2)+')" text-anchor="end" fill="#000">');
          if(zoneScreenW>=42&&zoneScreenH>=20){
            var titleY=detailFont*1.2;
            labelParts.push('<text x="0" y="'+titleY.toFixed(1)+'" font-size="'+detailFont.toFixed(1)+'">'+(zi+1)+'区</text>');
            if(zoneScreenH>=34){
              labelParts.push('<text x="0" y="'+(titleY+detailFont*1.15).toFixed(1)+'" font-size="'+detailFont.toFixed(1)+'">'+zoneSizeText+'</text>');
              if(zoneScreenH>=48)labelParts.push('<text x="0" y="'+(titleY+detailFont*2.25).toFixed(1)+'" font-size="'+compactFont.toFixed(1)+'">'+zoneAreaText+'</text>');
            }else{
              labelParts.push('<text x="0" y="'+(titleY+detailFont*1.15).toFixed(1)+'" font-size="'+compactFont.toFixed(1)+'">'+zoneSizeText+'</text>');
            }
          }else if(zoneScreenW>=28&&zoneScreenH>=12){
            labelParts.push('<text x="0" y="'+compactFont.toFixed(1)+'" font-size="'+compactFont.toFixed(1)+'">'+(zi+1)+'区 '+zoneSizeText+'</text>');
          }
          labelParts.push('</g>');
        }
      }
    }
    parts.push('<g class="pp-zone-label">'+labelParts.join('')+'</g>');

    parts.push('<g class="pp-zone-label" fill="none" stroke="#334155" stroke-width="1" stroke-dasharray="7,5" opacity="0.48">');
    for(var bz=0;bz<zoneCuts.xPos.length;bz++){
      var bv1=tsGrid(zoneCuts.xPos[bz],zoneCuts.bounds.minY),bv2=tsGrid(zoneCuts.xPos[bz],zoneCuts.bounds.maxY);
      parts.push('<line x1="'+bv1.x.toFixed(1)+'" y1="'+bv1.y.toFixed(1)+'" x2="'+bv2.x.toFixed(1)+'" y2="'+bv2.y.toFixed(1)+'"/>');
    }
    for(var br=0;br<zoneCuts.yPos.length;br++){
      var bh1=tsGrid(zoneCuts.bounds.minX,zoneCuts.yPos[br]),bh2=tsGrid(zoneCuts.bounds.maxX,zoneCuts.yPos[br]);
      parts.push('<line x1="'+bh1.x.toFixed(1)+'" y1="'+bh1.y.toFixed(1)+'" x2="'+bh2.x.toFixed(1)+'" y2="'+bh2.y.toFixed(1)+'"/>');
    }
    parts.push('</g>');

    // Overall dimensions follow the rotated partition frame while land geometry stays fixed.
    /* v124：二级页与三级页共用同一组标注几何细项（二级页不乘 tlDS，保持既有语义） */
    var DG=(window.RyDimGeo?window.RyDimGeo.get():{ext:4,gap:4,tick:4,tickW:2.8,font:12});
    /* v148：二级页同口径 —— GAP 不乘 tlDS（二级保持既有语义），ASC = 运行时 canvas 实测的墨水高度（见 __ryInkAscent） */
    var GAP=DG.gap;
    var INK=(window.__ryInkM?window.__ryInkM(DG.font):{a:DG.font*0.75,d:0});
    var ASC=INK.a, DESC=INK.d;
    function ppDimLabel(value){
      if(!isFinite(value))return '— m';
      var rounded=Math.round(value);
      return Math.abs(value-rounded)<0.05?rounded+' m':value.toFixed(1)+' m';
    }
    var dimB=zoneCuts.bounds, dimTL=tsGrid(dimB.minX,dimB.minY), dimTR=tsGrid(dimB.maxX,dimB.minY);
    var dimBL=tsGrid(dimB.minX,dimB.maxY), dimBR=tsGrid(dimB.maxX,dimB.maxY);
    function unitVec(a,b){var dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;return{x:dx/len,y:dy/len};}
    function addVec(p,v,n){return{x:p.x+v.x*n,y:p.y+v.y*n};}
    function dimTick(p,u){var k=DG.tick;parts.push('<line x1="'+(p.x-u.x*k-u.y*k).toFixed(1)+'" y1="'+(p.y-u.y*k+u.x*k).toFixed(1)+'" x2="'+(p.x+u.x*k+u.y*k).toFixed(1)+'" y2="'+(p.y+u.y*k-u.x*k).toFixed(1)+'" stroke-width="'+DG.tickW+'"/>');}
    var ux=unitVec(dimBL,dimBR), uy=unitVec(dimTL,dimBL), nx={x:-ux.y,y:ux.x}, ny={x:-uy.y,y:uy.x};
    var h1=addVec(dimBL,nx,38),h2=addVec(dimBR,nx,38),v1=addVec(dimTL,ny,48),v2=addVec(dimBL,ny,48);
    parts.push('<g stroke="#111111" stroke-width="0.95" fill="none" opacity="0.98" stroke-linecap="square">');
    [[addVec(dimBL,nx,4),addVec(dimBL,nx,38+DG.ext)],[addVec(dimBR,nx,4),addVec(dimBR,nx,38+DG.ext)],
      [addVec(dimTL,ny,4),addVec(dimTL,ny,48+DG.ext)],[addVec(dimBL,ny,4),addVec(dimBL,ny,48+DG.ext)]].forEach(function(pair){
      parts.push('<line x1="'+pair[0].x.toFixed(1)+'" y1="'+pair[0].y.toFixed(1)+'" x2="'+pair[1].x.toFixed(1)+'" y2="'+pair[1].y.toFixed(1)+'"/>');
    });
    parts.push('<line x1="'+h1.x.toFixed(1)+'" y1="'+h1.y.toFixed(1)+'" x2="'+h2.x.toFixed(1)+'" y2="'+h2.y.toFixed(1)+'"/>');dimTick(h1,ux);dimTick(h2,ux);
    parts.push('<line x1="'+v1.x.toFixed(1)+'" y1="'+v1.y.toFixed(1)+'" x2="'+v2.x.toFixed(1)+'" y2="'+v2.y.toFixed(1)+'"/>');dimTick(v1,uy);dimTick(v2,uy);
    parts.push('</g>');
    var hAngle=Math.atan2(ux.y,ux.x)*180/Math.PI, vAngle=Math.atan2(uy.y,uy.x)*180/Math.PI;
    if(hAngle>90)hAngle-=180;else if(hAngle<-90)hAngle+=180;
    if(vAngle>90)vAngle-=180;else if(vAngle<-90)vAngle+=180;
    var hMid={x:(h1.x+h2.x)/2,y:(h1.y+h2.y)/2},vMid={x:(v1.x+v2.x)/2,y:(v1.y+v2.y)/2};
    parts.push('<g font-size="'+DG.font+'" font-weight="700" fill="#111111">');
    parts.push('<text transform="translate('+hMid.x.toFixed(1)+' '+hMid.y.toFixed(1)+') rotate('+hAngle.toFixed(2)+')" x="0" y="'+(-GAP-DESC).toFixed(2)+'" text-anchor="middle">'+ppDimLabel(dimB.w)+'</text>');
    parts.push('<text transform="translate('+vMid.x.toFixed(1)+' '+vMid.y.toFixed(1)+') rotate('+vAngle.toFixed(2)+')" x="0" y="'+(-GAP-DESC).toFixed(2)+'" text-anchor="middle">'+ppDimLabel(dimB.h)+'</text>');
    parts.push('</g>');

    // Pipe length note uses the same top-left cut grid as the zones.
    var noteCol=0;
    var noteRow=0;
    var noteCell=gridCellPoints(zoneCuts.xPos[noteCol],zoneCuts.yPos[noteRow],zoneCuts.xPos[noteCol+1],zoneCuts.yPos[noteRow+1]);
    var zoneDimX1=Math.min.apply(null,noteCell.map(function(p){return p.x;}));
    var zoneDimY1=Math.min.apply(null,noteCell.map(function(p){return p.y;}));
    var zoneDimY2=Math.max.apply(null,noteCell.map(function(p){return p.y;}));
    var showPipeNoteMain=ppHasVisiblePipe('main');
    var showPipeNoteBranch=ppHasVisiblePipe('branch');
    parts.push('<path d="'+d+'" fill="none" stroke="#1a4731" stroke-width="2.2"/>');

    /* [v193] 总管（成组地块跨块连接层）：
       · **不进裁剪组** —— 它本来就要穿过块间空隙，裁到地块里就断了；
       · 不累加 actualMainTotal / actualBranchTotal ⇒ 不影响各块的材料与水力（拍板 ③）。 */
    (function(){
      var ge=window.__runyeGroupEdit;
      if(!ge||!ge.active||!ge.trunkPipes||!ge.trunkPipes.length)return;
      parts.push('<g id="ppTrunkLayer">');
      ge.trunkPipes.forEach(function(l,i){
        if(ge.trunkHidden&&ge.trunkHidden['t'+i])return;
        if(!l||l.length<2)return;
        var td='';
        for(var k=0;k<l.length;k++){var p=ts(l[k].x,l[k].y);td+=(k===0?'M':'L')+p.x.toFixed(1)+' '+p.y.toFixed(1)+' ';}
        parts.push('<path d="'+td+'" fill="none" stroke="#7c3aed" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>');
      });
      parts.push('</g>');
    })();

    // Main pipes & branch pipes — clipped to plot boundary
    parts.push('<g clip-path="url(#ppPlotClip)">');
    // Main pipes
    var actualMainTotal=0;
    ppState.mainPipes.forEach(function(l,idx){
      if(ppIsPipeHidden('main',idx))return;
      var md='';
      for(var i=0;i<l.length;i++){var p=ts(l[i].x,l[i].y);md+=(i===0?'M':'L')+p.x.toFixed(1)+' '+p.y.toFixed(1)+' ';}
      parts.push('<path d="'+md+'" fill="none" stroke="#185FA5" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>');
      // Calculate actual drawn length in meters
      var actualLen=ppLineLen(l);
      actualMainTotal+=actualLen;
      if(l.length>=2){
        var p1=ts(l[l.length-2].x,l[l.length-2].y),p2=ts(l[l.length-1].x,l[l.length-1].y);
        parts.push(ppArrow(p1,p2,'#185FA5'));
      }
    });

    // Branch pipes
    var actualBranchTotal=0;
    ppState.branchPipes.forEach(function(l,idx){
      if(ppIsPipeHidden('branch',idx))return;
      var bd='';
      for(var i=0;i<l.length;i++){var p=ts(l[i].x,l[i].y);bd+=(i===0?'M':'L')+p.x.toFixed(1)+' '+p.y.toFixed(1)+' ';}
      parts.push('<path d="'+bd+'" fill="none" stroke="#16a34a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>');
      // Calculate actual drawn length in meters
      var actualLen=ppLineLen(l);
      actualBranchTotal+=actualLen;
    });
    parts.push('</g>');

    /* [v913-coupler-nodes] 接驳节点渲染：读 dd.couplerNodes（世界米）→ frameToGrid 回格系 →
       ts() 上屏。失配节点（x/y null）不画但参数保留（重挂后自动复活）。
       依赖 dd.zones.frame（纯数据）+ window.RyCoordFrame —— 两者缺席则整段静默跳过。 */
    (function(){
      var ctx=ppCouplerCtx();if(!ctx)return;
      var list=ctx.dd.couplerNodes;
      if(!Array.isArray(list)||!list.length)return;
      list.forEach(function(n){
        if(n.x==null||n.y==null)return;
        var g=ctx.frame?ctx.F.frameToGrid(ctx.frame,{x:n.x,y:n.y}):{x:n.x,y:n.y};
        var p=ts(g.x,g.y);
        var sel=(ppCouplerSelected===n.pipeKey)||ppState.dragCoupler===n.pipeKey;
        parts.push('<circle cx="'+p.x.toFixed(1)+'" cy="'+p.y.toFixed(1)+'" r="'+(sel?7:5.5)+'" fill="'+(sel?'#f59e0b':'#fff')+'" stroke="#b45309" stroke-width="2" data-pp-coupler="'+n.pipeKey+'"><title>接驳节点 · '+n.pipeKey+' · 距起点 '+(Math.round(n.s*10)/10)+'m</title></circle>');
      });
    })();

    if(showPipeNoteMain||showPipeNoteBranch){
      var pipeNoteX=zoneDimX1+10;
      var pipeNoteY=Math.max(zoneDimY1+18,zoneDimY2-24);
      parts.push('<g text-anchor="start" font-size="9.5" font-weight="700">');
      if(showPipeNoteMain)parts.push('<text x="'+pipeNoteX.toFixed(1)+'" y="'+pipeNoteY.toFixed(1)+'" fill="#185FA5">主管 '+mainPipeOD+'</text>');
      if(showPipeNoteBranch)parts.push('<text x="'+pipeNoteX.toFixed(1)+'" y="'+(pipeNoteY+15).toFixed(1)+'" fill="#166534">支管 '+branchPipeOD+'</text>');
      parts.push('</g>');
    }

    // Source
    if(ppState.source){
      var sp=ts(ppState.source.x,ppState.source.y);
      parts.push('<circle cx="'+sp.x.toFixed(1)+'" cy="'+sp.y.toFixed(1)+'" r="10" fill="#f59e0b" stroke="#fff" stroke-width="2"/>');
      /* [v487 2026-10-16 用户要求] 「水源/水泵」标注与水源点示意圆脱开距离：基线 -16→-30
         （原间隙仅约 6px，文字几乎压着圆），下方流量/扬程行 +22→+32 同步拉开。 */
      parts.push('<text x="'+sp.x.toFixed(1)+'" y="'+(sp.y-30).toFixed(1)+'" text-anchor="middle" font-size="11" font-weight="600" fill="#92400e">水源/水泵</text>');
      parts.push('<text x="'+sp.x.toFixed(1)+'" y="'+(sp.y+32).toFixed(1)+'" text-anchor="middle" font-size="9" fill="#92400e">'+pFlow+' · '+pHead+'</text>');
    }

    // 阀门与主管的斜向连接管：每个阀门沿 45° 斜拉接到最近的主管线段（与三级页一致的斜向风格），画在红圈之下
    (function(){
      function ppClamp(v,a,b){return v<a?a:(v>b?b:v);}
      var segs=[];
      ppState.mainPipes.forEach(function(l,li){
        if(ppIsPipeHidden('main',li))return;
        for(var i=0;i+1<l.length;i++)segs.push([l[i],l[i+1]]);
      });
      if(segs.length){
        var connSvg=[];
        ppState.valves.filter(function(v){return ppPointInPlot(v);}).forEach(function(v){
          var best=null,bestD=Infinity;
          segs.forEach(function(sg){
            var dx=sg[1].x-sg[0].x,dy=sg[1].y-sg[0].y;
            var horiz=Math.abs(dy)<=Math.abs(dx)*0.25, vert=Math.abs(dx)<=Math.abs(dy)*0.25;
            var pj;
            if(vert){ // 主管竖向：连接点 x=主管x，y 沿 45° 偏（阀门在右→左上，在左→右下）
              var px=sg[0].x, off=Math.abs(v.x-px);
              var py=(v.x>=px)?(v.y-off):(v.y+off);
              py=ppClamp(py,Math.min(sg[0].y,sg[1].y),Math.max(sg[0].y,sg[1].y));
              pj={x:px,y:py};
            }else if(horiz){ // 主管横向：连接点 y=主管y，x 沿 45° 偏（阀门在下→右，在上→左）
              var py2=sg[0].y, off2=Math.abs(v.y-py2);
              var px2=(v.y>=py2)?(v.x+off2):(v.x-off2);
              px2=ppClamp(px2,Math.min(sg[0].x,sg[1].x),Math.max(sg[0].x,sg[1].x));
              pj={x:px2,y:py2};
            }else{ // 斜主管：退化用最近点投影
              var c=dx*dx+dy*dy; if(c===0){pj={x:sg[0].x,y:sg[0].y};}
              else{var t=((v.x-sg[0].x)*dx+(v.y-sg[0].y)*dy)/c; if(t<0)t=0; else if(t>1)t=1; pj={x:sg[0].x+dx*t,y:sg[0].y+dy*t};}
            }
            if(!pj)return;
            var ex=v.x-pj.x,ey=v.y-pj.y,dd=ex*ex+ey*ey;
            if(dd<bestD){bestD=dd;best=pj;}
          });
          if(best && Math.sqrt(bestD)>3){
            var a=ts(v.x,v.y),bp=ts(best.x,best.y);
            connSvg.push('<line x1="'+a.x.toFixed(1)+'" y1="'+a.y.toFixed(1)+'" x2="'+bp.x.toFixed(1)+'" y2="'+bp.y.toFixed(1)+'"/>');
          }
        });
        if(connSvg.length){
          parts.push('<g clip-path="url(#ppPlotClip)" stroke="#185FA5" stroke-width="3.5" stroke-linecap="round" fill="none">');
          parts.push(connSvg.join(''));
          parts.push('</g>');
        }
      }
    })();

    // Valves (只画阀门符号，不标注名称)
    ppState.valves.filter(function(v){return ppPointInPlot(v);}).forEach(function(v,idx){
      var vp=ts(v.x,v.y);
      parts.push(window.ryValveSVG(vp.x, vp.y));   /* v159：与总管×主管交接阀同规格（尺寸取自 window.RY_VALVE） */
    });
    parts.push('</g>');

    // Calculation book (draggable + resizable like three-level header, no fill, transparent background)
    var cbX0=34, cbY0=drawY2+18;
    var cbDefW=svgW-68;
    var pdCalc=window.planData||{};
    /* v178：此处原有 11 个 cbXxx 取值（lift/dh/tapePressureM/existPressureM/mainLoss/branchLoss/filterLoss/pumpPower/motorKW/safetyFactor/marginHead），
       cbSegs 精简后即零引用 —— 已删（取值本身无副作用，删后输出逐字节不变）。 */
    var cbPumpHead=Number(pdCalc.pumpHead)||0;
    var cbZoneFlow=Number(pdCalc.zoneFlow)||0;
    var cbTapeLen=Number(pdCalc.tapeLen)||100;
    var cbEmitterFlow=Number(pdCalc.emitterFlow)||0.8;
    var cbTapeSpacing=Number(pdCalc.tapeSpacing)||0.8;
    var cbEmitterSpacing=Number(pdCalc.emitterSpacing)||0.3;
    var cbMainOD=pdCalc.mainPipeOD||'Ø — mm';
    var cbBranchOD=pdCalc.branchPipeOD||'Ø — mm';
    var cbActualMainStr=actualMainTotal>0?actualMainTotal.toFixed(1)+'m':'未绘制';
    var cbActualBranchStr=actualBranchTotal>0?actualBranchTotal.toFixed(1)+'m':'未绘制';
    var cbHasCalc=cbZoneFlow>0&&cbPumpHead>0;

    var cbSegs=[];
    cbSegs.push('滴灌带 '+cbTapeLen+'m | 滴孔流量 '+cbEmitterFlow+' L/h | 孔距 '+cbEmitterSpacing+'m | 带距 '+cbTapeSpacing+'m');
    cbSegs.push('主管 '+cbMainOD+' | 支管 '+cbBranchOD+' | 实测主管 '+cbActualMainStr+' | 实测支管 '+cbActualBranchStr);
    if(!cbHasCalc){
      cbSegs.push('未获取到水泵计算中间量，请先在参数面板完成计算后再生成施工图。');
    }

    window._ppCalcBookSegs=cbSegs;
    window._ppCalcBookX0=cbX0;
    window._ppCalcBookY0=cbY0;
    window._ppCalcBookDefW=cbDefW;

    var cbLines=ppRewrapCalcBook(cbDefW);
    var cbH=cbLines.length*18+12;
    parts.push('<g id="ppCalcBookGroup">');
    parts.push('<rect id="ppCalcBookBg" x="'+(cbX0-8)+'" y="'+(cbY0-14)+'" width="'+(cbDefW+16)+'" height="'+cbH+'" fill="rgba(255,255,255,0)" stroke="none" rx="2"/>');
    for(var ci=0;ci<cbLines.length;ci++){
      parts.push('<text x="'+cbX0+'" y="'+(cbY0+ci*18)+'" text-anchor="start" font-size="11" font-weight="600" fill="#334155" class="pp-cb-text">'+cbLines[ci]+'</text>');
    }
    var cbHandleX=cbX0-8+cbDefW+16-8;
    var cbHandleY=cbY0-14+cbH-8;
    parts.push('<rect id="ppCalcBookHandle" x="'+cbHandleX+'" y="'+cbHandleY+'" width="8" height="8" fill="rgba(99,102,241,.35)" rx="2" style="cursor:nwse-resize"/>');
    parts.push('</g>');

    // 比例尺（带刻度的视觉标尺，固定在底部右下角，不随计算书框拖动）
    var rawM=100/s;
    var niceM=ppNiceStep(rawM,1);
    niceM=Math.max(10,Math.round(niceM/10)*10);
    var barPx=niceM*s;
    var barX2=svgW-34, barX1=barX2-barPx;
    var barY=drawY2+bottomH-44;
    parts.push('<text x="'+barX1.toFixed(1)+'" y="'+(barY-8).toFixed(1)+'" text-anchor="start" font-size="10" font-weight="700" fill="#1a4731">比例尺</text>');
    parts.push('<g stroke="#334155" fill="none" stroke-linecap="round">');
    parts.push('<line x1="'+barX1.toFixed(1)+'" y1="'+barY+'" x2="'+barX2.toFixed(1)+'" y2="'+barY+'" stroke-width="1.6"/>');
    for(var tk=0;tk<=4;tk++){var tx=barX1+barPx*tk/4;var th=(tk===0||tk===4)?12:(tk===2?9:6);parts.push('<line x1="'+tx.toFixed(1)+'" y1="'+barY+'" x2="'+tx.toFixed(1)+'" y2="'+(barY+th).toFixed(1)+'" stroke-width="'+(tk===0||tk===4?1.6:1)+'"/>');}
    parts.push('</g>');
    parts.push('<g font-size="9" font-weight="600" fill="#111827">');
    parts.push('<text x="'+barX1.toFixed(1)+'" y="'+(barY+22).toFixed(1)+'" text-anchor="middle">0</text>');
    parts.push('<text x="'+((barX1+barX2)/2).toFixed(1)+'" y="'+(barY+22).toFixed(1)+'" text-anchor="middle">'+Math.round(niceM/2)+'</text>');
    parts.push('<text x="'+barX2.toFixed(1)+'" y="'+(barY+22).toFixed(1)+'" text-anchor="middle">'+niceM+' m</text>');
    parts.push('</g>');

    parts.push('</svg>');
    var svgStr=parts.join('');
    document.getElementById('ppDiagramContent').innerHTML=svgStr;
    document.getElementById('ppDiagramWrap').style.display='block';
    /* v129b（2026-09-23 用户要求）：「下载/打印A3」按钮取消 —— 不再重新显示（DOM 与 click 监听保留，按钮恒 display:none）。
       原两行：ppDownload/ppPrint.style.display='inline-block' */
    ppState.lastSVG=svgStr;
    try{ ppInitCalcBookDrag(); }catch(e){ console.warn('[ppGenerateDiagram] calc book drag init failed', e); }
    try{ ppInitPlotDrag(); }catch(e){ console.warn('[ppGenerateDiagram] plot drag init failed', e); }
    if(doScroll) document.getElementById('ppDiagramWrap').scrollIntoView({behavior:'smooth',block:'nearest'});
  }

  function ppMeasureText(str){
    var w=0;
    for(var k=0;k<str.length;k++){
      var ch=str[k];
      w+=(ch.charCodeAt(0)>255?12:6.5);
    }
    return w;
  }

  function ppRewrapCalcBook(maxW){
    var segs=window._ppCalcBookSegs;
    if(!segs||!segs.length)return [];
    var lines=[],cur='';
    for(var i=0;i<segs.length;i++){
      var trial=cur?cur+'  |  '+segs[i]:segs[i];
      if(cur && ppMeasureText(trial)>maxW){
        lines.push(cur);
        cur=segs[i];
      }else{
        cur=trial;
      }
    }
    if(cur)lines.push(cur);
    if(lines.length>4){
      var rest=lines.slice(1).join('  |  ');
      lines=[lines[0],rest];
    }
    return lines;
  }

  /* 二级施工简图：底部计算书可拖动 + 右下角可调宽度（参考三级管线左上角信息框） */
  function ppInitCalcBookDrag(){
    var ctn=document.getElementById('ppDiagramContent');
    if(!ctn)return;
    var svgEl=ctn.querySelector('svg');
    if(!svgEl)return;
    var g=svgEl.querySelector('#ppCalcBookGroup');
    if(!g)return;
    var handle=svgEl.querySelector('#ppCalcBookHandle');
    if(!handle)return;
    if(window._ppCbMove)document.removeEventListener('mousemove',window._ppCbMove);
    if(window._ppCbUp)document.removeEventListener('mouseup',window._ppCbUp);

    var svgW=1190,svgH=841;
    var frameX=8,frameY=8,frameW=svgW-16,frameH=svgH-16;
    var pos={x:0,y:0};
    var cbW=window._ppCalcBookDefW||(svgW-68);
    try{
      var saved=JSON.parse(localStorage.getItem('pp-calcbook-pos'));
      if(saved&&typeof saved.x==='number')pos=saved;
      var savedW=parseFloat(localStorage.getItem('pp-calcbook-w'));
      if(savedW>0)cbW=savedW;
    }catch(e){}

    function applyPos(){
      g.setAttribute('transform','translate('+pos.x.toFixed(1)+','+pos.y.toFixed(1)+')');
    }

    function getScale(){
      var rect=svgEl.getBoundingClientRect();
      return rect.width>0?svgW/rect.width:1;
    }

    function renderBookForWidth(w){
      var lines=ppRewrapCalcBook(w);
      var h=lines.length*18+12;
      var x0=window._ppCalcBookX0||34;
      var y0=window._ppCalcBookY0||0;
      var bg=g.querySelector('#ppCalcBookBg');
      if(bg){
        bg.setAttribute('width',w+16);
        bg.setAttribute('height',h);
      }
      var oldTexts=g.querySelectorAll('.pp-cb-text');
      oldTexts.forEach(function(t){t.remove();});
      for(var j=0;j<lines.length;j++){
        var t=document.createElementNS('http://www.w3.org/2000/svg','text');
        t.setAttribute('x',x0);
        t.setAttribute('y',y0+j*18);
        t.setAttribute('text-anchor','start');
        t.setAttribute('font-size','11');
        t.setAttribute('font-weight','600');
        t.setAttribute('fill','#334155');
        t.setAttribute('class','pp-cb-text');
        t.textContent=lines[j];
        g.insertBefore(t,handle);
      }
      var hnd=g.querySelector('#ppCalcBookHandle');
      if(hnd){
        hnd.setAttribute('x',x0-8+w+16-8);
        hnd.setAttribute('y',y0-14+h-8);
      }
      return lines.length;
    }

    renderBookForWidth(cbW);
    applyPos();

    var dragStart=null;
    g.addEventListener('mousedown',function(e){
      if(e.button!==0)return;
      if(e.target===handle||(e.target.closest&&e.target.closest('#ppCalcBookHandle')))return;
      e.preventDefault();
      var scale=getScale();
      dragStart={x:e.clientX,y:e.clientY,ox:pos.x,oy:pos.y,scale:scale};
      document.body.style.userSelect='none';
    });

    var resizeStart=null;
    handle.addEventListener('mousedown',function(e){
      if(e.button!==0)return;
      e.preventDefault();
      e.stopPropagation();
      var scale=getScale();
      resizeStart={x:e.clientX,y:e.clientY,ow:cbW,scale:scale};
      document.body.style.userSelect='none';
    });

    window._ppCbMove=function(ev){
      if(dragStart){
        var s=dragStart.scale;
        pos.x=dragStart.ox+(ev.clientX-dragStart.x)*s;
        pos.y=dragStart.oy+(ev.clientY-dragStart.y)*s;
        pos.x=Math.max(-20,Math.min(frameW-100,pos.x));
        pos.y=Math.max(-50,Math.min(frameH-30,pos.y));
        applyPos();
      }
      if(resizeStart){
        var s2=resizeStart.scale;
        var dx=(ev.clientX-resizeStart.x)*s2;
        cbW=Math.max(200,Math.min(svgW-60,resizeStart.ow+dx));
        renderBookForWidth(cbW);
      }
    };

    window._ppCbUp=function(){
      if(dragStart){dragStart=null;document.body.style.userSelect='';}
      if(resizeStart){resizeStart=null;document.body.style.userSelect='';}
      localStorage.setItem('pp-calcbook-pos',JSON.stringify(pos));
      localStorage.setItem('pp-calcbook-w',cbW.toString());
    };

    document.addEventListener('mousemove',window._ppCbMove);
    document.addEventListener('mouseup',window._ppCbUp);

    g.addEventListener('dblclick',function(e){
      e.stopPropagation();
      e.preventDefault();
      pos={x:0,y:0};
      cbW=window._ppCalcBookDefW||svgW-68;
      renderBookForWidth(cbW);
      applyPos();
      localStorage.setItem('pp-calcbook-pos',JSON.stringify(pos));
      localStorage.setItem('pp-calcbook-w',cbW.toString());
    });
  }

  /* 二级施工简图：图纸主体（地块/分区/管线/标注）可整体平移拖动，尺寸不变；参考三级管线 tlPlotGroup 拖动方式 */
  function ppInitPlotDrag(){
    var ctn=document.getElementById('ppDiagramContent');
    if(!ctn)return;
    var svgEl=ctn.querySelector('svg');
    if(!svgEl)return;
    var plotG=svgEl.querySelector('#ppPlotGroup');
    if(!plotG)return;
    if(window._ppPlotMove)document.removeEventListener('mousemove',window._ppPlotMove);
    if(window._ppPlotUp)document.removeEventListener('mouseup',window._ppPlotUp);

    var svgW=1190,svgH=841,frameX=8,frameY=8,frameW=svgW-16,frameH=svgH-16;
    var pos={x:0,y:0};
    try{
      var saved=JSON.parse(localStorage.getItem('pp-plot-pos'));
      if(saved&&typeof saved.x==='number')pos=saved;
    }catch(e){}

    var bbox=plotG.getBBox();
    function clampPos(p){
      var minX=frameX-bbox.x;
      var maxX=frameX+frameW-(bbox.x+bbox.width);
      var minY=frameY-bbox.y;
      var maxY=frameY+frameH-(bbox.y+bbox.height);
      if(minX>maxX){minX=maxX=(minX+maxX)/2;}
      if(minY>maxY){minY=maxY=(minY+maxY)/2;}
      p.x=Math.max(minX,Math.min(maxX,p.x));
      p.y=Math.max(minY,Math.min(maxY,p.y));
      return p;
    }

    function applyPos(){
      plotG.setAttribute('transform','translate('+pos.x.toFixed(1)+','+pos.y.toFixed(1)+')');
    }
    if(pos.x||pos.y){clampPos(pos);applyPos();}

    function getScale(){
      var rect=svgEl.getBoundingClientRect();
      return rect.width>0?svgW/rect.width:1;
    }

    var dragStart=null;
    svgEl.addEventListener('mousedown',function(e){
      if(e.button!==0)return;
      var target=e.target;
      if(!target||!target.closest)return;
      // 点击计算书时交给计算书自己的拖动逻辑
      if(target.closest('#ppCalcBookGroup'))return;
      // 点击图纸组内部 或 SVG 背景空白处 均可拖动图纸
      var hitPlot=target===svgEl||target.closest('#ppPlotGroup');
      if(!hitPlot)return;
      e.preventDefault();
      var scale=getScale();
      dragStart={x:e.clientX,y:e.clientY,ox:pos.x,oy:pos.y,scale:scale};
      document.body.style.userSelect='none';
      svgEl.style.cursor='grabbing';
    });

    window._ppPlotMove=function(ev){
      if(!dragStart)return;
      var s=dragStart.scale;
      pos.x=dragStart.ox+(ev.clientX-dragStart.x)*s;
      pos.y=dragStart.oy+(ev.clientY-dragStart.y)*s;
      clampPos(pos);
      applyPos();
    };

    window._ppPlotUp=function(){
      if(!dragStart)return;
      dragStart=null;
      document.body.style.userSelect='';
      svgEl.style.cursor='';
      localStorage.setItem('pp-plot-pos',JSON.stringify(pos));
    };

    document.addEventListener('mousemove',window._ppPlotMove);
    document.addEventListener('mouseup',window._ppPlotUp);

    plotG.addEventListener('dblclick',function(e){
      e.stopPropagation();
      e.preventDefault();
      pos={x:0,y:0};
      applyPos();
      localStorage.setItem('pp-plot-pos',JSON.stringify(pos));
    });
  }

  function ppRefreshDiagramIfVisible(){
    var wrap=document.getElementById('ppDiagramWrap');
    if(!wrap||!ppState.polyPts.length||!ppState.lastSVG)return false;
    ppGenerateDiagram({scroll:false});
    return true;
  }
  /* v98d：分区线被拖动后 —— 二级施工图若可见则重建；三级整图重建（几何随新分区线，
     自动管线编辑按几何签名决定是否保留）+ 重算三级结果 + 刷分组面板。 */
  function ppRefreshTLAfterCuts(){
    try{ if(typeof ppRefreshDiagramIfVisible==='function') ppRefreshDiagramIfVisible(); }catch(e){}
    try{
      var poly=(typeof window!=='undefined')?window.measuredPolygon:null;
      if(poly&&poly.length>=3&&typeof tlAutoGenerate==='function') tlAutoGenerate({scroll:false,stay:true});
      else if(typeof renderThreeLevel==='function') renderThreeLevel();
    }catch(e){}
    /* 2026-09-22 修复：绿色「水力计算结果」栏必须从实时分区网格独立重算，不能依赖 tlAutoGenerate 成功。
       tlUpdatePlanBar() 在 tlAutoGenerate 末尾才调用，而整段被 try/catch 吞掉；一旦简图重绘在某种几何下抛错，
       绿栏就不刷新（红栏在下方独立 try 中照常刷新）—— 与「红变绿不变」现象一致。
       此处补一次独立重算：computeThreeLevel 直接读 RunyeBridge.getZoneCuts + measuredPolygon + tlManualGroups，
       不依赖 tlDiagramData，故即使上方 tlAutoGenerate 失败，绿栏也一定随新界线更新。 */
    try{ if(typeof tlUpdatePlanBar==='function') tlUpdatePlanBar(); }catch(e){}
    try{ if(typeof window.tlRefreshGroupStatus==='function') window.tlRefreshGroupStatus(); }catch(e){}
  }
  window.ppRefreshDiagramIfVisible=ppRefreshDiagramIfVisible;
  window.ppGenerateDiagram=ppGenerateDiagram;
  /* v166：二级页调网格/微调/回退后同步重建三级简图的统一入口。
     导出原因：上述调用点走 window（与 ppRefreshDiagramIfVisible 同款防御式写法），
     且便于验收脚本拦截计数。 */
  window.ppRefreshTLAfterCuts=ppRefreshTLAfterCuts;

  /* ===== [v659 2026-10-21 用户拍板] 管线按地块边界裁剪 =====
     用户原话：「总管跟支管应该是被地块裁切过的，这个要改过来」——v657 分发是整段
     分配（中点归块/当前块全收），横跨两块的管会整根塞进一个块，图上压过邻块与空隙。
     ⇒ 分发改「裁剪口径」：每根管线与各块环求交，在边界处断开成子段，
       环内子段归该块、环外（空隙/越界）部分丢弃。块内生成的管裁剪后原样保留。
     ppClipPolylineToRing：折线 × 环 → 环内子段数组。逐线段收集与环边的交点参数 t，
     排序切成子段，子段中点用 atPointInPolygon 判内；连续环内子段首尾拼接成一根。
     挂 window 供探针与组页复用。 */
  function ppSegXt(a,b,c,d){
    var den=(b.x-a.x)*(d.y-c.y)-(b.y-a.y)*(d.x-c.x);
    if(Math.abs(den)<1e-12)return null;
    var t=((c.x-a.x)*(d.y-c.y)-(c.y-a.y)*(d.x-c.x))/den;
    var u=((c.x-a.x)*(b.y-a.y)-(c.y-a.y)*(b.x-a.x))/den;
    if(t<0||t>1||u<0||u>1)return null;
    return t;
  }
  function ppClipPolylineToRing(line,ring,fnInOverride){
    var out=[];
    if(!line||line.length<2||!ring||ring.length<3)return out;
    /* [v837] 第三个参数是纯增量：给「需要边界容差」的调用方（分区裁剪 ppClipSegsToPlot）用，
       不传时行为与 v659 完全一致（v659 的调用点是块间分发，那里不需要软判定）。 */
    var fnIn=fnInOverride||window.atPointInPolygon||atPointInPolygon;
    var cur=null;   /* 正在拼接的环内折线 */
    var lastPt=null;
    function lerp(p,q,t){ return {x:p.x+(q.x-p.x)*t, y:p.y+(q.y-p.y)*t}; }
    for(var i=0;i+1<line.length;i++){
      var a=line[i], b=line[i+1];
      var ts=[0,1];
      for(var j=0;j<ring.length;j++){
        var t=ppSegXt(a,b,ring[j],ring[(j+1)%ring.length]);
        if(t!=null&&t>1e-9&&t<1-1e-9)ts.push(t);
      }
      ts.sort(function(x,y){return x-y;});
      for(var k=0;k+1<ts.length;k++){
        if(ts[k+1]-ts[k]<1e-9)continue;
        var p0=lerp(a,b,ts[k]), p1=lerp(a,b,ts[k+1]);
        var mid=lerp(a,b,(ts[k]+ts[k+1])/2);
        if(!fnIn(mid,ring)){ if(cur&&cur.length>=2)out.push(cur); cur=null; lastPt=null; continue; }
        if(cur&&lastPt&&Math.abs(lastPt.x-p0.x)<1e-6&&Math.abs(lastPt.y-p0.y)<1e-6){
          cur.push(p1);
        }else{
          if(cur&&cur.length>=2)out.push(cur);
          cur=[p0,p1];
        }
        lastPt=p1;
      }
    }
    if(cur&&cur.length>=2)out.push(cur);
    return out;
  }
  window.ppClipPolylineToRing=ppClipPolylineToRing;

  function ppMainDirectionOutdated(){
    if(ppIsGroupWhole()||!ppState.mainPipes||!ppState.mainPipes.length)return false;
    var expected=ppBuildAutoPipes(ppState.polyPts,
      parseInt(document.getElementById('planN')?.value)||parseInt(document.getElementById('fld_N')?.value)||4,
      ppState.pipeLevel==='three');
    function longestDirection(lines){
      var best=null,bestLen=0;
      (lines||[]).forEach(function(line){
        if(!line||line.length<2)return;
        var a=line[0],b=line[line.length-1],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
        if(len>bestLen){best={x:dx/len,y:dy/len};bestLen=len;}
      });
      return best;
    }
    var oldDir=longestDirection(ppState.mainPipes),newDir=longestDirection(expected.main);
    return !!(oldDir&&newDir&&Math.abs(oldDir.x*newDir.x+oldDir.y*newDir.y)<0.94);
  }

  document.getElementById('ppGenerate').addEventListener('click',function(){
    /* 分区角度改变后，先按新角度重建自动主管/支管，再生成二级图与三级图。
       角度待重建状态不会被普通历史记录清掉，只有自动布管成功后才消费。
       [v873] 重生成失败必须让用户看见——此前 fail-closed 回滚只有 console.warn，
       用户点按钮毫无反应（真机实测「旋转角度后生成施工图没反应」）。 */
    var rebuildForMapAngle=false;
    try{
      /* 地图端应用角度会将持久化网络标为 needsReplan；分区恢复走 ppSetState/restore，
         不经过 ppApplyZoneAngle，因此本地 pending 标记不足以识别该路径。 */
      var mapNet=window.RyIrrigationDataStore&&window.RyIrrigationDataStore.readNetworkLayout
        ?window.RyIrrigationDataStore.readNetworkLayout():null;
      rebuildForMapAngle=!!(mapNet&&mapNet.needsReplan);
      var priorDiagram=window.tlDiagramData;
      var priorAngle=priorDiagram&&priorDiagram.zones&&priorDiagram.zones.frame
        ?Number(priorDiagram.zones.frame.angle):null;
      if(isFinite(priorAngle)&&Math.abs(priorAngle-ppZoneAngle())>0.05)rebuildForMapAngle=true;
    }catch(eMapReplan){console.warn('[ppGenerate] 地图角度状态读取失败',eMapReplan);}
    if((ppAnglePipeRegenPending||rebuildForMapAngle||ppMainDirectionOutdated())&&!ppAutoGeneratePipes()){
      ppAnglePipeRegenPending=true;
      alert('按新分区角度重生成管线未完成：'+(window.__runyeSingleL2CommitFailure||'布管或设计提交失败')+'。当前画面已保留。');
      return;
    }
    /* [v656 2026-10-21 用户拍板] 成组态智能分流：多地块点「生成施工图」不进三级，
       直接回「多地块规划页」——用户流程是「在二级逐块把管路生成好、检查没问题，
       再传递给多地块规划页手绘总管」。出口复用 grBackFromPlotEdit（与「◀ 返回成组
       管路」同一正规路径：存档当前块 → 清标记 → 切页 → grSync 重算组态），零新数据
       通道；整组态（只读合并视图，无可存档）直接 grShowGroupPage 切页。
       单地块（未成组）不进此分支，行为与 v104 完全一致。 */
    var geJump=window.__runyeGroupEdit;
    if(geJump&&geJump.active&&window.__runyeSubPlots&&window.__runyeSubPlots.length>=2){
      /* [v657 2026-10-21 用户实测反馈] 跳转前把二级成果「按块分发」进各块 slot：
         用户在二级（可能整组外框口径）生成好主管/支管，跳组页后各块档案还是空的
         （材料 0.0m、图上无管）——因为块级管路的真身在 slots，ppState 不自动分发。
         分发规则：管段中点落在哪块环内就归哪块（管段生成时本就按分区裁剪在块内，
         不会跨块）；都不在时归质心最近的块。只在本组所有块都还没有管路时分发，
         防重复点击管段翻倍。分发后若处于逐块态，把当前块实时快照同步成分发结果
         ——否则 grSync 的 groupLiveSlot 覆盖会让当前块拿到未分发的整组管。
         分区线仍由组页按块口径显示（方案一，用户拍板「按块分发」）。 */
      try{
        if((ppState.mainPipes&&ppState.mainPipes.length)||(ppState.branchPipes&&ppState.branchPipes.length)||(ppState.subBranchPipes&&ppState.subBranchPipes.length)){
          /* [v660 用户实测修正] 分发=「全量裁剪分配 + 分配非空才覆盖」：
             - v659 的「slots 全空才分发」在真实会话里失效——用户反复测试后 slots 已有
               旧横跨管（v657 整段分配遗留），重传被跳过、旧错数据永不修正（用户截图复现）。
             - 现口径：只要二级 ppState 有管，就对每块环做全量裁剪；某块**裁剪结果非空**
               才覆盖该块（修正旧数据），裁剪为空则保留该块原管（不毁三级页逐块精修）。
             - 裁剪分配天然幂等：重复点击「生成施工图」不会翻倍（每次都是替换式重算）。 */
          var subRings=window.__runyeSubPlots.map(function(sp){return sp.poly;});
          var memberRead=ppReadGroupMemberSlots(geJump);
          if(!memberRead.ok)return;
          var memberChanges=[];
          var clipTo=function(list,si){
            var s=memberRead.slots[si];
            var ring=(s&&s.polyPts&&s.polyPts.length>=3)?s.polyPts:subRings[si];
            var out=[];
            (list||[]).forEach(function(line){
              ppClipPolylineToRing(line,ring).forEach(function(seg){ out.push(ppCloneJSON(seg)); });
            });
            return out;
          };
          memberRead.slots.forEach(function(s,si){
            if(!s)return;
            s=ppCloneJSON(s);
            if(!s)throw new Error('group-member-clone-failed');
            var mC=clipTo(ppState.mainPipes,si);
            var bC=clipTo(ppState.branchPipes,si);
            var sbC=clipTo(ppState.subBranchPipes,si);
            if(mC.length||bC.length||sbC.length){
              s.mainPipes=mC; s.branchPipes=bC; s.subBranchPipes=sbC;
              if(typeof ppSlotRebuildIds==='function')ppSlotRebuildIds(s);
              memberChanges.push({index:si,slot:s});
            }
          });
          if(memberChanges.length&&!ppSaveGroupMemberSlots(memberChanges))return;
          if(geJump.mode==='perPlot'&&geJump.slots[geJump.current])ppApplySlot(geJump.slots[geJump.current]);
        }
      }catch(eDist){console.warn('[plot-editor] group distribution rejected',eDist);return;}
      var back=false;
      try{ if(window.__runyeGroupPlotEdit!=null&&typeof window.grBackFromPlotEdit==='function') back=!!window.grBackFromPlotEdit(); }catch(eGr){ }
      if(!back&&typeof window.grShowGroupPage==='function'){ try{ window.grShowGroupPage(); }catch(eGr2){ } }
      return;   /* 不跑单地块口径的 tlAutoGenerate / tlShowWorkspace */
    }
    ppGenerateDiagram({scroll:false});
    // 同步生成三级管线施工简图：默认按当前选择的分区数（首次为2区一总管），调整4/6/8区后再次点击即按新选择重算
    try{
      if(window.measuredPolygon && window.measuredPolygon.length>=3 && typeof tlAutoGenerate==='function'){
        tlAutoGenerate({scroll:false,rethrowError:true});
        if(!window.tlDiagramData||!window.tlDiagramData.mainPipes||!window.tlDiagramData.mainPipes.length||
           !window.tlDiagramData.branchPipes||!window.tlDiagramData.branchPipes.length){
          throw new Error('管线生成结果为空，请检查当前分区与地块边界');
        }
      }
    }catch(e){
      console.error('[ppGenerate] 三级管线图生成失败', e);
      alert('生成施工图失败：'+(e&&e.message?e.message:String(e))+'。当前地块与原有数据已保留。');
      return;
    }
    // 二级首部系统图（二级系统图.html）的自动弹出已按要求取消（用户 2026-09-12）：
    // 原为 try{ if(typeof openL2Head==='function') openL2Head(); }catch(e){...}
    // 取消原因：「⚙️ 生成系统图」按钮取消后，生成施工图时不应再自动弹新窗口。
    // 二级简图切换已暂停；生成后直接进入三级设计工作区。
    /* v104（用户 2026-09-22 要求）：「生成施工图」点完**直接跳到「三级管路编辑」页**
       —— 即 tlPipePlanSection 的 ws 视图（三级设计工作区，与顶部导航「三级管路编辑」同一落点）。
       理由：二/三级施工图在这一句之前都已生成完毕，用户的下一步就是去三级编辑管路
       （插入主管/支管、联合灌溉分组、拖分界线），不该再把人留在二级「简图」上。
       ⚠ 用既有 helper tlShowWorkspace()（= rySetTab('tlPipePlanSection','ws')）而不是自己调
         ryJumpToSection：rySetTab 内部会在目标 section 未激活时自动补 ryShowSection，
         且会一并写好 data-ry-clean='0'（ws 是工作区，左属性栏保留），无需再手工补标记。
       二级简图已停用，生成过程中不再切换到 draw 视图。 */
    try{ if(typeof tlShowWorkspace==='function') tlShowWorkspace(); }catch(e){ console.warn('[ppGenerate] 跳三级管路编辑失败', e); }
    /* [v875] 三级快照落地后二级画布必须重绘一次：ppAutoGeneratePipes 里的 ppRender
       发生在 tlAutoGenerate 之前，那时 tlDiagramData 还是上一代 —— 同代抑制判定
       会落空，二级画布残留一份无总管的重复管线层（用户实测「两组管线」）。 */
    try{ ppRender(); }catch(eRe){ console.warn('[ppGenerate] 二级画布同步重绘失败', eRe); }
    /* [v355] 生成成功即记「已生成」边界签名：此后切页/整页重载（含手画、图片测量、AI 回带等
       没有地块库锚的路径）可按签名自动恢复。签名锚在边界多边形本身——几何没变设计就有效，
       变了宁可不恢复（与 v161 原则一致）。恢复链见 ryPpGenRestoreProject。 */
    try{
      if(window.measuredPolygon && window.measuredPolygon.length>=3 && typeof window.ryPolySig==='function'){
        window.__ryPpGenSig=window.ryPolySig(window.measuredPolygon);
      }
    }catch(e){}
  });

  // Download
  document.getElementById('ppDownload').addEventListener('click',function(){
    if(!ppState.lastSVG)return;
    var blob=new Blob([ppState.lastSVG],{type:'image/svg+xml'});
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');a.href=url;a.download='irrigation-diagram.svg';a.click();
    URL.revokeObjectURL(url);
  });

  // ppSavePng「保存图片」按钮已移除，事件绑定同步移除

  // Print A3
  document.getElementById('ppPrint').addEventListener('click',function(){
    if(!ppState.lastSVG)return;
    var w=window.open('','_blank','width=1200,height=900');
    w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>润野灌溉·施工简图</title><style>');
    w.document.write('@page{size:A3 landscape;margin:5mm}');
    w.document.write('body{margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#fff}');
    w.document.write('svg{max-width:100%;max-height:100vh}');
    w.document.write('@media print{body{margin:0}}</style>  <link rel="stylesheet" href="runye-theme.css"></head><body>');
    w.document.write(ppState.lastSVG);
    w.document.write('</body></html>');
    w.document.close();
    setTimeout(function(){w.print();},500);
  });

  window.ppGetState=function(){
    return {
      /* [v677 成组继承] polyPts / cutSnap / cutOverrides / areaLocked 进导出：
         runyeSaveProject 据此写「按地块设计留档」，成组时逐块平移继承。
         ppSetState 不读这几个字段（polyPts 仍由量测边界重建），旧消费方零影响。 */
      polyPts:(ppState.polyPts||[]).map(function(p){return{x:p.x,y:p.y};}),
      mainPipes:JSON.parse(JSON.stringify(ppState.mainPipes||[])),
      branchPipes:JSON.parse(JSON.stringify(ppState.branchPipes||[])),
      subBranchPipes:JSON.parse(JSON.stringify(ppState.subBranchPipes||[])),
      pipeLevel:ppState.pipeLevel||'two',
      source:ppState.source?JSON.parse(JSON.stringify(ppState.source)):null,
      valves:JSON.parse(JSON.stringify(ppState.valves||[])),
      lineDrawMode:ppState.lineDrawMode||'free',
      hiddenPipes:JSON.parse(JSON.stringify(ppState.hiddenPipes||{main:{},branch:{},subbranch:{}})),
      pipeIds:JSON.parse(JSON.stringify(ppState.pipeIds||{main:[],branch:[],subbranch:[]})),
      nextPipeId:ppState.nextPipeId||1,
      cutSnap:JSON.parse(JSON.stringify(ppState.cutSnap||{sig:'',x:null,y:null})),
      partitionCuts:(function(){
        try{
          if(!ppState.polyPts||ppState.polyPts.length<3)return null;
          var b=ppGetBounds();
          var n=parseInt(document.getElementById('planN')&&document.getElementById('planN').value)||parseInt(document.getElementById('fld_N')&&document.getElementById('fld_N').value)||4;
          var cuts=ppGetZoneCuts(b,ppGetZoneLayout(b,n));
          return {x:cuts.xPos.slice(1,-1),y:cuts.yPos.slice(1,-1)};
        }catch(e){return null;}
      })(),
      cutOverrides:JSON.parse(JSON.stringify(ppState.cutOverrides||{x:{},y:{}})),
      areaLocked:!!ppState.areaLocked,
      zoneRotated:!!ppState.zoneRotated,
      zoneAngleDeg:ppZoneAngle(),
      zoneAuto:ppState.zoneAuto!==false,
      /* [v913-coupler-nodes] 白名单式构造——漏加此行则节点参数永远进不了存档与提交快照。 */
      couplerNodes:JSON.parse(JSON.stringify(ppState.couplerNodes||[])),
      zoom:ppState.zoom||1,
      panX:ppState.panX||0,
      panY:ppState.panY||0,
      lastSVG:ppState.lastSVG||''
    };
  };
  // 材料清单数据传导：统计施工简图实际绘制（未遮蔽）的主管/支管总长；hasPipes=false 时调用方回退理论值。
  // 滴灌带不在施工简图布置，由调用方按总面积 ÷ 滴灌带间距直接传导。
  /* [v604 2026-10-19 用户口径] 二级施工简图的支管同样在两端缩进 gap（分区边长 6%，4~14m），
     那只是显示约定 —— 材料清单按**设计满跨**计（留边不进长度）。满跨按支管中点所在分区、
     沿支管方向取该分区净跨；几何拿不到（如整组多块叠加态）时退回图面线长。 */
  function ppBranchFullSpan(line) {
    try {
      if (typeof ppIsGroupWhole === 'function' && ppIsGroupWhole()) return 0;
      if (!line || line.length < 2) return 0;
      var b = ppGetBounds();
      var nEl = document.getElementById('planN') || document.getElementById('fld_N');
      var planN = (nEl && parseInt(nEl.value, 10)) || 4;
      var cuts = ppGetZoneCuts(b, ppGetZoneLayout(b, planN));
      if (!cuts || !cuts.xPos || !cuts.yPos) return 0;
      var a = line[0], z = line[line.length - 1];
      var mid = { x: (a.x + z.x) / 2, y: (a.y + z.y) / 2 };
      var vert = Math.abs(a.x - z.x) < Math.abs(a.y - z.y);
      var E = 1e-6, i;
      if (vert) {
        for (i = 0; i + 1 < cuts.yPos.length; i++) {
          if (mid.y >= cuts.yPos[i] - E && mid.y <= cuts.yPos[i + 1] + E) return cuts.ySrc[i] || 0;
        }
      } else {
        for (i = 0; i + 1 < cuts.xPos.length; i++) {
          if (mid.x >= cuts.xPos[i] - E && mid.x <= cuts.xPos[i + 1] + E) return cuts.xSrc[i] || 0;
        }
      }
    } catch (e) { }
    return 0;
  }
  window.ppGetMaterialStats=function(){
    var stats={mainLen:0,branchLen:0,hasPipes:false};
    (ppState.mainPipes||[]).forEach(function(line,i){
      if(ppIsPipeHidden('main',i))return;
      stats.mainLen+=ppLineLen(line);
    });
    (ppState.branchPipes||[]).forEach(function(line,i){
      if(ppIsPipeHidden('branch',i))return;
      var drawn=ppLineLen(line);
      var span=ppBranchFullSpan(line);
      /* 每区图面只画一条代表支管；支管总材料量按设计满跨统计，
         边数/根数只拆分单根设计长度，不能再折减汇总用量。手动拉长增量计入。 */
      stats.branchLen+=(span>0)?Math.max(span,drawn):drawn;
    });
    stats.hasPipes=stats.mainLen>0||stats.branchLen>0;
    return stats;
  };
  // 施工简图管线变化后刷新页面（材料清单随之重算传导值）
  function ppRefreshMaterials(){
    if(typeof window.render==='function'){
      try{ window.render(); }catch(e){}
    }
  }
  window.ppSetState=function(saved){
    saved=saved||{};
    ppAnglePipeRegenPending=false;
    ppState.mainPipes=JSON.parse(JSON.stringify(saved.mainPipes||[]));
    ppState.branchPipes=JSON.parse(JSON.stringify(saved.branchPipes||[]));
    ppState.subBranchPipes=JSON.parse(JSON.stringify(saved.subBranchPipes||[]));
    ppState.pipeLevel='two'; // Always two-level in drawing; three-level is now a separate view
    ppState.source=saved.source?JSON.parse(JSON.stringify(saved.source)):null;
    ppState.valves=JSON.parse(JSON.stringify(saved.valves||[]));
    ppState.currentLine=[];
    ppState.pipeIds=JSON.parse(JSON.stringify(saved.pipeIds||{main:[],branch:[],subbranch:[]}));
    if(!Array.isArray(ppState.pipeIds.main))ppState.pipeIds.main=[];
    if(!Array.isArray(ppState.pipeIds.branch))ppState.pipeIds.branch=[];
    if(!Array.isArray(ppState.pipeIds.subbranch))ppState.pipeIds.subbranch=[];
    ppState.nextPipeId=saved.nextPipeId||1;
    ppState.partitionCuts=(saved.partitionCuts&&Array.isArray(saved.partitionCuts.x)&&Array.isArray(saved.partitionCuts.y))
      ?ppCloneJSON(saved.partitionCuts):null;
    ppState.hiddenPipes=JSON.parse(JSON.stringify(saved.hiddenPipes||{main:{},branch:{},subbranch:{}}));
    if(!ppState.hiddenPipes.main)ppState.hiddenPipes.main={};
    if(!ppState.hiddenPipes.branch)ppState.hiddenPipes.branch={};
    if(!ppState.hiddenPipes.subbranch)ppState.hiddenPipes.subbranch={};
    ppEnsurePipeIds('main');
    ppEnsurePipeIds('branch');
    ppEnsurePipeIds('subbranch');
    ppNormalizeHiddenPipes();
    ppUpdatePickResult(null);
    ppUpdateLegend(false);
    ppState.lineDrawMode=saved.lineDrawMode==='ortho'?'ortho':'free';
    ppState.zoneRotated=!!saved.zoneRotated;
    ppState.zoneAngleDeg=isFinite(Number(saved.zoneAngleDeg))?Number(saved.zoneAngleDeg):(ppState.zoneRotated?90:0);
    /* 旧存档里的地块旋转值不再应用；设计几何始终使用原始地块坐标。 */
    if(typeof saved.zoneAuto==='boolean')ppState.zoneAuto=saved.zoneAuto;
    /* [v913-coupler-nodes] 接驳节点参数回填：非法项（缺 pipeKey/s 或非正 s）直接丢弃，
       旧存档无此字段 ⇒ 自然回退 []，零迁移成本。 */
    ppState.couplerNodes=(Array.isArray(saved.couplerNodes)?saved.couplerNodes:[])
      .filter(function(n){return n&&typeof n.pipeKey==='string'&&n.pipeKey&&isFinite(Number(n.s))&&Number(n.s)>=0;})
      .map(function(n){return {pipeKey:n.pipeKey,s:Number(n.s)};});
    ppState.zoom=saved.zoom||1;
    ppState.panX=saved.panX||0;
    ppState.panY=saved.panY||0;
    ppState.lastSVG=saved.lastSVG||'';
    ppSyncZoneAngleUI();
    ppApplyZoneAutoUI();
    if(ppState.lastSVG){
      document.getElementById('ppDiagramContent').innerHTML=ppState.lastSVG;
      document.getElementById('ppDiagramWrap').style.display='block';
      /* v129b（同上）：状态恢复路径也不重新显示下载/打印A3。
         原两行：ppDownload/ppPrint.style.display='inline-flex' */
    }else{
      document.getElementById('ppDiagramContent').innerHTML='<div class="pp-diagram-empty">完成面积测量并点击「生成施工图」后，这里显示最终施工图。</div>';
      document.getElementById('ppDiagramWrap').style.display='block';
    }
    if(typeof ppSetLineDrawMode==='function')ppSetLineDrawMode(ppState.lineDrawMode);
    ppLoadPolygon();
    ppUpdateTransform();
    ppRender();
    ppUpdateAutoPipeButton();
  };

  // Resize + init
  window.addEventListener('resize',ppResize);
  /* 共享制图区会在二级/三级功能区之间换宿主父级；侧栏宽度或布局变化不保证伴随
     window.resize。直接观察画布容器，避免 canvas backing store 沿用旧尺寸而模糊/裁切。 */
  if(typeof ResizeObserver==='function'&&ppWrap){
    var ppContainerResizeFrame=0;
    var ppContainerResizeObserver=new ResizeObserver(function(entries){
      var entry=entries&&entries[entries.length-1],rect=entry&&entry.contentRect;
      if(!rect||Math.round(rect.width)===ppCanvas.width&&Math.round(rect.height)===ppCanvas.height)return;
      if(ppContainerResizeFrame)return;
      var schedule=window.requestAnimationFrame||function(fn){return setTimeout(fn,16);};
      ppContainerResizeFrame=schedule(function(){ppContainerResizeFrame=0;ppResize();});
    });
    ppContainerResizeObserver.observe(ppWrap);
  }
  setTimeout(function(){ppResize();ppLoadPolygon();ppUpdateAutoPipeButton();},200);
  /* [v629] 「适应窗口」小按钮：只在图被裁掉时显示（见 ppSyncFitBtn），点一下整幅回来。
     放在画布内的绝对定位浮层里 ⇒ 不占版面高度、不参与 .ry-pane-edit 网格，引不出新的嵌套问题。 */
  (function(){
    var btn=document.getElementById('ppFitViewBtn');
    if(!btn) return;
    btn.addEventListener('click',function(e){
      e.preventDefault();e.stopPropagation();
      ppFitView();
    });
  })();
})();
