
// ===== Project save/load =====
(function(){
  var SAVE_KEY='runye_irrigation_saved_project_v1';
  /* [v355] 边界多边形几何签名（cm 粒度）：「已生成施工图」跨页恢复的几何锚。
     挂 window 上：ppGenerate 点击处所在脚本块先于本块执行，但点击发生在整页 load 之后，
     运行期取到即可。 */
  window.ryPolySig=function(poly){
    try{ return (poly||[]).map(function(p){ return Math.round(p.x*100)+','+Math.round(p.y*100); }).join(';'); }catch(e){ return ''; }
  };

  function projectToast(msg){
    if(typeof atShowToast==='function') atShowToast(msg);
    else alert(msg);
  }

  function collectInputValues(){
    var values={};
    document.querySelectorAll('input[id]').forEach(function(input){
      if(input.type==='file') return;
      if(input.closest('#headModal')) return;   // 首部系统图编辑器参数不随项目保存
      if(input.type==='checkbox') values[input.id]=input.checked;
      else values[input.id]=input.value;
    });
    return values;
  }

  function restoreInputValues(values){
    values=values||{};
    Object.keys(values).forEach(function(id){
      var input=document.getElementById(id);
      if(!input||input.type==='file') return;
      if(input.closest('#headModal')) return;   // 跳过编辑器参数
      if(input.type==='checkbox') input.checked=!!values[id];
      else input.value=values[id];
    });
  }

  function getSelectedBranchCount(){
    return parseInt(document.querySelector('#branchGroup .selected')?.dataset?.n||'2',10);
  }

  function getSelectedLayoutSides(){
    return parseInt(document.querySelector('#layoutGroup .selected')?.dataset?.sides||'1',10);
  }

  // 地块数据同步到数字农业已外移至 irrigation-bridge.js（window.runyeSharePlotToDigital / runyeOpenDigitalAgriculture）。

  window.runyeSaveProject=function(silent,key){
    /* v161：可选第二参 key —— 静默自动留存与「手动保存」共用同一套快照构造，
       不传 key 时写原有 SAVE_KEY，行为与改动前一致。 */
    /* [v284] __ryUndoQuiet：撤销模块只借「构造快照」这一步，不需要它顺手重算材料清单 */
    if(!window.__ryUndoQuiet&&typeof updateMaterialTotals==='function') updateMaterialTotals();
    var data={
      savedAt:new Date().toISOString(),
      inputValues:collectInputValues(),
      branchCount:getSelectedBranchCount(),
      layoutSides:getSelectedLayoutSides(),
      tlBranchCount:readSelectedInt('#tl_branchGroup .selected', 2),
      tlLayoutSides:readSelectedInt('#tl_layoutGroup .selected', 1),
      pipeOdOverride:tlAppliedPipeOverride(),
      measuredArea:window.measuredArea||0,
      /* v161：快照一并记录当前地块 id —— 自动恢复时用它校验「存档 ↔ 锚点」一致，
         不一致宁可不恢复，避免把旧方案套到新地块上。 */
      currentPlotId:window.currentPlotId||null,
      measuredPolygon:window.measuredPolygon||[],
      geoBase:window.__runyeGeoBase||null,
      mapFramePoly:window.__runyeMapFramePoly||null,
      materialPrices:JSON.parse(JSON.stringify(window.materialPrices||materialPrices||{})),
      materialQtyOverrides:JSON.parse(JSON.stringify(window.materialQtyOverrides||materialQtyOverrides||{})),
      customMaterials:JSON.parse(JSON.stringify(window.customMaterials||customMaterials||{})),
      pipePlan:typeof window.ppGetState==='function'?window.ppGetState():null,
      groupPlan:window.grExportState ? window.grExportState() : null,
      terrain:window.RyTerrain ? window.RyTerrain.exportState() : null,
      isoDiagram:window.RyIsoDiagram && window.tlDiagramData ? {data:window.tlDiagramData, editor:window.RyIsoDiagram.exportState()} : null,
      tlEditPipes:(window.RyTlEditPipes && window.tlDiagramData) ? window.RyTlEditPipes.serialize() : null,
      tlAutoEdits:(window.RyTlAutoEdits && window.tlDiagramData) ? window.RyTlAutoEdits.serialize() : null,
      constructionNet:(window.RyNetEditor && window.RyNetEditor.exportForProject) ? window.RyNetEditor.exportForProject() : null,
      manualGroups:(typeof window.tlManualGroups!=='undefined' && window.tlManualGroups) ? window.tlManualGroups : [],
      zoneStep:(typeof tlZoneStepCount==='function' && tlZoneStepCount()>0) ? window.tlZoneStep : null,
      ppGenSig:(typeof window.__ryPpGenSig!=='undefined'&&window.__ryPpGenSig)?window.__ryPpGenSig:null
    };
    localStorage.setItem(key||SAVE_KEY,JSON.stringify(data));
    if(!window.__ryUndoQuiet) window.runyeSharePlotToDigital();   /* [v284] 撤销快照不广播到数字农业 */
    if(silent!==true)projectToast('方案已保存到本机');
  };

  window.runyeLoadProject=function(keyOrOpts,silentOpt){
    /* v161：支持指定存档 key 与静默恢复（自动恢复走静默、不弹提示）。
       点按钮调用时第一个实参是 Event 对象 → 落回默认 key + 非静默，行为同改动前。 */
    var _key=SAVE_KEY, _silent=(silentOpt===true);
    if(typeof keyOrOpts==='string'){ _key=keyOrOpts; }
    else if(keyOrOpts && typeof keyOrOpts==='object'){ if(keyOrOpts.key) _key=String(keyOrOpts.key); if(keyOrOpts.silent===true) _silent=true; }
    var toast=function(m){ if(!_silent) projectToast(m); };
    var raw=localStorage.getItem(_key);
    if(!raw){toast('还没有保存过方案');return;}
    var data;
    try{data=JSON.parse(raw);}catch(e){toast('保存数据读取失败');return;}
    // 先清除上一方案的计算覆盖；旧存档缺字段时使用明确默认值。
    tlPipeOdOverride = null;
    restoreInputValues(data.inputValues);
    if(window.RyTerrain) window.RyTerrain.importState(data.terrain || null);
    var tlBc = [2,3,4].includes(Number(data.tlBranchCount)) ? Number(data.tlBranchCount) : 2;
    var tlLs = [1,2].includes(Number(data.tlLayoutSides)) ? Number(data.tlLayoutSides) : 1;
    document.querySelectorAll('#tl_branchGroup button').forEach(function (b) { b.classList.toggle('selected', +b.dataset.n === tlBc); });
    document.querySelectorAll('#tl_layoutGroup button').forEach(function (b) { b.classList.toggle('selected', +b.dataset.sides === tlLs); });
    if(typeof selectBranch==='function') selectBranch(parseInt(data.branchCount||2,10));
    if(typeof selectLayout==='function') selectLayout(parseInt(data.layoutSides||1,10));
    if(typeof materialPrices!=='undefined'){
      Object.keys(materialPrices).forEach(function(k){delete materialPrices[k];});
      Object.assign(materialPrices,data.materialPrices||{});
    }
    if(typeof materialQtyOverrides!=='undefined'){
      Object.keys(materialQtyOverrides).forEach(function(k){delete materialQtyOverrides[k];});
      Object.assign(materialQtyOverrides,data.materialQtyOverrides||{});
    }
    if(typeof customMaterials!=='undefined'){
      Object.keys(customMaterials).forEach(function(k){
        customMaterials[k]=Object.assign({name:'',spec:'',qty:'',price:''},(data.customMaterials||{})[k]||{});
      });
    }
    window.measuredArea=parseFloat(data.measuredArea)||0;
    window.measuredPolygon=Array.isArray(data.measuredPolygon)?data.measuredPolygon:[];
    window.__runyeSubPlots = data.groupPlan && Array.isArray(data.groupPlan.subPlots) ? data.groupPlan.subPlots : null;
    if (data.groupPlan && Array.isArray(data.groupPlan.frame)) window.measuredPolygon = data.groupPlan.frame;
    /* v161：「当前地块」随方案恢复 —— 仅当地块仍在库中（防已删除地块复活）；
       恢复后刷新地块库高亮，使「设为当前」标记与切页前一致。 */
    (function(){
      var cid=data.currentPlotId; if(!cid) return;
      var lib=[]; try{ lib=JSON.parse(localStorage.getItem('runye_plot_library')||'[]'); }catch(e){}
      var hit=false; for(var i=0;i<lib.length;i++){ if(lib[i].id===cid){ hit=true; break; } }
      if(!hit) return;
      window.currentPlotId=cid;
      try{ if(typeof window.runyeRenderPlotLib==='function') window.runyeRenderPlotLib(); }catch(e){}
    })();
    window.__runyeGeoBase=(data.geoBase && typeof data.geoBase.refLat==='number' && typeof data.geoBase.refLng==='number' && isFinite(data.geoBase.refLat) && isFinite(data.geoBase.refLng))?data.geoBase:null;
    /* [map-enhance 2026-09-29] 存档一并恢复「地图口径」地块；旧存档无此字段 → null，
       反投退化为改动前行为，不会比原来更差。 */
    window.__runyeMapFramePoly = (Array.isArray(data.mapFramePoly) && data.mapFramePoly.length>=3) ? data.mapFramePoly : null;
    if(typeof render==='function') render();
    if(typeof calcPlan==='function') calcPlan();
    if(typeof window.ppSetState==='function') window.ppSetState(data.pipePlan||{});
    else if(typeof window.ppLoadPolygon==='function') window.ppLoadPolygon();
    if (window.grRestoreState) window.grRestoreState(data.groupPlan || null);
    // 施工简图管线恢复后重渲染，材料清单随之采用施工简图实际长度
    if(typeof render==='function') render();
    if(typeof updateMaterialTotals==='function') updateMaterialTotals();
    if(window.RyIsoDiagram){
      var isoSaved=data.isoDiagram;
      window.RyIsoDiagram.cancelEdit();
      // 先绑定目标方案几何，避免用上一方案的签名拒绝本方案改长、改径存档。
      if (isoSaved && isoSaved.data) {
        if (window.RyTlEditPipes) window.RyTlEditPipes.syncGeometry(isoSaved.data);
        if (window.RyTlAutoEdits) window.RyTlAutoEdits.syncGeometry(isoSaved.data);
      }
      /* 共享图面数据层先恢复（2026-09-15 阶段1）：几何签名随存档校验，不符拒绝 */
      if(window.RyTlEditPipes){
        if(data.tlEditPipes && window.RyTlEditPipes.restore(data.tlEditPipes)){
          toast('三级手工管线已随方案恢复 ' + window.RyTlEditPipes.count() + ' 条');
        }else{
          window.RyTlEditPipes.reset();     // 无存档或签名不符 → 清空，不复活旧几何上的管线
          if(window.RyTlEditPipes.discardSaved) window.RyTlEditPipes.discardSaved();  // 兜底档一并作废（防同几何幽灵恢复）
        }
      }
      /* 自动管线图面编辑随主方案恢复（几何签名校验，2026-09-15 阶段2） */
      if(window.RyTlAutoEdits){
        if(data.tlAutoEdits && window.RyTlAutoEdits.restore(data.tlAutoEdits)){
          toast('三级自动管线编辑已随方案恢复（改长 ' + Object.keys(window.RyTlAutoEdits.lensMap()).length + ' 处 · 配件 ' + window.RyTlAutoEdits.fitCount() + ' 个）');
        }else{
          window.RyTlAutoEdits.reset();     // 无存档或签名不符 → 清空，不复活旧几何上的编辑
          if(window.RyTlAutoEdits.discardSaved) window.RyTlAutoEdits.discardSaved();
        }
      }
      if(isoSaved && isoSaved.data && isoSaved.data.version === 1){
        // 尚未打开轴测页时 editor.geometry 可能为空；仍须恢复有效的原始图面。
        window.RyIsoDiagram.importState(isoSaved.editor,isoSaved.data);
        window.tlDiagramData=isoSaved.data;
        window.RyIsoDiagram.render(document.getElementById('tlIsoDiagramContent'),isoSaved.data);
      }else{
        window.tlDiagramData=null;
        window.RyIsoDiagram.render(document.getElementById('tlIsoDiagramContent'),null);
      }
    }
    /* 施工管网模型随主方案恢复（几何签名校验，不符时在面板提供选择） */
    if(window.RyNetEditor && window.RyNetEditor.importForProject){
      window.RyNetEditor.importForProject(data.constructionNet||null);
    }
    if (typeof window !== 'undefined') {
      window.tlManualGroups = Array.isArray(data.manualGroups) ? data.manualGroups : [];
      /* v98h 阶梯分区覆盖表随方案恢复（签名不符时 tlZoneStepFor 会自行作废，不会套到新几何上） */
      if (data.zoneStep && data.zoneStep.x && data.zoneStep.y && data.zoneStep.sig) {
        window.tlZoneStep = { sig: String(data.zoneStep.sig), x: data.zoneStep.x, y: data.zoneStep.y };
      } else if (typeof tlZoneStepClear === 'function') {
        tlZoneStepClear();
      }
      window.tlPendingSel = [];
      window.tlGroupMode = false;
      try { if (typeof window.tlRefreshGroupPanel === 'function') window.tlRefreshGroupPanel(); } catch (e) { }
      try { if (window.tlPersistManualGroups) window.tlPersistManualGroups(); } catch(e){}
    }
    // 二级重算会同步三级输入；以存档中的三级参数为准恢复最终计算条件。
    restoreInputValues(data.inputValues);
    document.querySelectorAll('#tl_branchGroup button').forEach(function (b) { b.classList.toggle('selected', +b.dataset.n === tlBc); });
    document.querySelectorAll('#tl_layoutGroup button').forEach(function (b) { b.classList.toggle('selected', +b.dataset.sides === tlLs); });
    tlPipeOdOverride = tlNormalizePipeOverride(data.pipeOdOverride);
    if (!tlAppliedPipeOverride()) tlPipeOdOverride = null;
    renderThreeLevel();
    if (typeof tlUpdatePlanBar === 'function') tlUpdatePlanBar();
    if (window.tlPumpUpdateNote) window.tlPumpUpdateNote();
    toast('方案已打开');
  };

  ['saveProjectBtn','ppSaveProject'].forEach(function(id){
    var btn=document.getElementById(id);
    if(btn) btn.addEventListener('click',window.runyeSaveProject);
  });
  ['loadProjectBtn','ppLoadProject'].forEach(function(id){
    var btn=document.getElementById(id);
    if(btn) btn.addEventListener('click',window.runyeLoadProject);
  });

  /* ===== v161：跨页（在线地图）返回后自动恢复上次地块与二级/三级划分 =====
     背景：本页点「在线地图」是整页跳转，本页 JS 内存状态（measuredPolygon /
     __runyeGeoBase / __runyeMapFramePoly / currentPlotId）全部销毁；返回时既无
     存档也无锚点 ⇒ 地块与基于它生成的二级/三级划分全空。
     做法：①「设为当前 / 保存地块 / 地图回传落库」时记锚点 runye_current_plot_v1
             并静默留存完整工作状态（复用既有 runyeSaveProject 快照）；
           ② 本页加载完成时，若锚点地块仍在库中、且存档记录的当前地块与锚点一致，
             则静默恢复（宁可不恢复，也不恢复成错方案）；
           ③ 地图回传（runyeMeasuredArea）与图片测量优先：前者由 applyMapMeasuredArea
             处理并会写新锚点，后者清锚点，两者都不会被自动恢复覆盖。 */
  var CUR_PLOT_KEY='runye_current_plot_v1';
  window.runyeMarkCurrentPlot=function(id){
    try{ if(id) localStorage.setItem(CUR_PLOT_KEY,JSON.stringify({id:String(id),ts:Date.now()}));
         else localStorage.removeItem(CUR_PLOT_KEY); }catch(e){}
  };
  /* 「本页当前地块已变为 id」：记锚点 + 静默留存完整状态（id 为空 = 只清锚点，不动存档） */
  window.runyeSetCurrentPlot=function(id){
    window.runyeMarkCurrentPlot(id);
    if(id && typeof window.runyeSaveProject==='function'){ try{ window.runyeSaveProject(true); }catch(e){} }
  };
  function ryAutoRestoreProject(){
    try{
      if(window.__runyeAutoRestored) return;
      if(localStorage.getItem('runyeMeasuredArea')) return;              /* 地图回传优先 */
      var a=null; try{ a=JSON.parse(localStorage.getItem(CUR_PLOT_KEY)||'null'); }catch(e){}
      if(!a||!a.id) return;
      var raw=localStorage.getItem(SAVE_KEY); if(!raw) return;
      var snap=null; try{ snap=JSON.parse(raw); }catch(e){}
      if(!snap||snap.currentPlotId!==a.id) return;                       /* 存档与锚点不一致 → 不恢复 */
      var lib=[]; try{ lib=JSON.parse(localStorage.getItem('runye_plot_library')||'[]'); }catch(e){}
      var hit=false; for(var i=0;i<lib.length;i++){ if(lib[i].id===a.id){ hit=true; break; } }
      if(!hit) return;                                                   /* 地块已删除 → 不恢复 */
      window.__runyeAutoRestored=true;
      window.runyeLoadProject({key:SAVE_KEY, silent:true});
      /* load 只把三级数据渲染进轴测图容器（#tlIsoDiagramContent）；三级平面图
         （#tlDiagramContent）与设计工作区（#tlWsContent）需按恢复的地块/参数重建，
         否则用户回到三级页仍是一片空白。二级施工图同理重出一次。 */
      /* 重建期间临时静音弹窗：tlAutoGenerate / ppGenerateDiagram 在「无地块」或「生成出错」时会
         alert，自动恢复阶段弹窗既打断用户，也会阻塞页面（无头浏览器里更是把整页挂住）。
         另加「地块存在」前置守卫，无地块时纯跳过。重建完成立即复位 alert。 */
      var _ryAlert0=window.alert;
      try{
        window.alert=function(){};
        var _ryPoly=(typeof window.ppGetPolyPts==='function')?window.ppGetPolyPts():(window.measuredPolygon||[]);
        /* [v356] 方案B懒重放：打开只恢复状态；图面重放延迟到首次进入管路相关页
           （ryShowSection 收口消费 __ryLazyReplay），打开不再卡在同步生成上 */
        if(_ryPoly && _ryPoly.length>=3) window.__ryLazyReplay=true;
      }catch(e){}finally{ window.alert=_ryAlert0; }
      try{ if(typeof tlUpdatePlanBar==='function') tlUpdatePlanBar(); }catch(e){}
      try{ if(typeof atShowToast==='function') atShowToast('已恢复上次地块与划分'); }catch(e){}
    }catch(e){ try{ console.warn('[v161] auto restore skipped:',e&&e.message); }catch(_){} }
  }
  /* [v327] AI规划往返恢复：点「AI规划」跳助手页前已静默存档（runyeSaveProject）+写一次性锚
     （runye_aiplot_anchor_v1）。返回本页时消费锚，静默恢复快照——页内手画/图片测量的边界
     没有 runye_current_plot_v1 锚，v161 自动恢复不覆盖，来回一趟就丢地块、无法重新划分。 */
  function ryAiRestoreProject(){
    var had=false;
    try{had=!!localStorage.getItem('runye_aiplot_anchor_v1');}catch(e){}
    if(!had)return;
    try{localStorage.removeItem('runye_aiplot_anchor_v1');}catch(e){}
    try{
      if(window.__runyeAutoRestored)return;                 /* v161 已恢复 → 锚冗余 */
      if(localStorage.getItem('runyeMeasuredArea'))return;  /* 地图回传优先 */
      var raw=localStorage.getItem(SAVE_KEY);if(!raw)return;
      var snap=null;try{snap=JSON.parse(raw);}catch(e){return;}
      if(!snap||!Array.isArray(snap.measuredPolygon)||snap.measuredPolygon.length<3)return;
      window.runyeLoadProject({key:SAVE_KEY,silent:true});
      var _ryAlert0=window.alert;
      try{
        window.alert=function(){};
        var _ryPoly=(typeof window.ppGetPolyPts==='function')?window.ppGetPolyPts():(window.measuredPolygon||[]);
        /* [v356] 方案B懒重放：同 v161/v355——打开只恢复状态，重放延迟到进管路页 */
        if(_ryPoly&&_ryPoly.length>=3)window.__ryLazyReplay=true;
      }catch(e){}finally{window.alert=_ryAlert0;}
      try{if(typeof tlUpdatePlanBar==='function')tlUpdatePlanBar();}catch(e){}
      try{if(typeof atShowToast==='function')atShowToast('已恢复跳转 AI 助手前的地块与划分');}catch(e){}
    }catch(e){}
  }
  /* [v355] 「已生成施工图」跨页自动恢复（v161 的补充路径）：
     手画 / 图片测量 / AI 规划回带的地块没有 runye_current_plot_v1 锚，v161 不覆盖，
     点完「生成施工图」再切页（含整页跳在线地图）回来管道规划就是一片空。
     这里改以「生成时的边界签名（ppGenSig）」为恢复依据，恢复前自校验：
     存档边界重算签名必须与 ppGenSig 一致 —— 边界没变，设计才仍有效；
     变了宁可不恢复（不把旧设计套到新边界，与 v161 原则一致）。
     v161 已恢复（地图回传锚路径）时本函数自动让位。 */
  function ryPpGenRestoreProject(){
    try{
      if(window.__runyeAutoRestored) return;
      if(localStorage.getItem('runyeMeasuredArea')) return;              /* 地图回传优先 */
      var raw=localStorage.getItem(SAVE_KEY); if(!raw) return;
      var snap=null; try{ snap=JSON.parse(raw); }catch(e){ return; }
      if(!snap || !snap.ppGenSig) return;
      if(!Array.isArray(snap.measuredPolygon) || snap.measuredPolygon.length<3) return;
      if(window.ryPolySig(snap.measuredPolygon)!==snap.ppGenSig) return; /* 边界已改 → 不恢复 */
      window.__runyeAutoRestored=true;
      window.__ryPpGenSig=snap.ppGenSig;   /* 记回内存：后续 pagehide 继续留存 */
      window.runyeLoadProject({key:SAVE_KEY, silent:true});
      var _ryAlert0=window.alert;
      try{
        window.alert=function(){};
        var _ryPoly=(typeof window.ppGetPolyPts==='function')?window.ppGetPolyPts():(window.measuredPolygon||[]);
        /* [v356] 方案B懒重放：打开只恢复状态；图面重放延迟到首次进入管路相关页
           （ryShowSection 收口消费 __ryLazyReplay），打开不再卡在同步生成上 */
        if(_ryPoly && _ryPoly.length>=3) window.__ryLazyReplay=true;
      }catch(e){}finally{ window.alert=_ryAlert0; }
      try{ if(typeof tlUpdatePlanBar==='function') tlUpdatePlanBar(); }catch(e){}
      try{ if(typeof atShowToast==='function') atShowToast('已恢复上次生成的施工图'); }catch(e){}
    }catch(e){ try{ console.warn('[v355] ppGen restore skipped:',e&&e.message); }catch(_){} }
  }
  if(document.readyState==='complete') setTimeout(function(){ryAutoRestoreProject();ryAiRestoreProject();ryPpGenRestoreProject();},0);
  else window.addEventListener('load',function(){ setTimeout(function(){ryAutoRestoreProject();ryAiRestoreProject();ryPpGenRestoreProject();},0); });

  /* 切页（含整页跳到「在线地图」）前留存当前完整状态 —— pagehide 是最后可靠时机。
     有它之后，用户「生成施工图」再切页也不会丢图面，无需在每个生成函数里插桩；
     无当前地块（或地块已删）时不动任何存档。 */
  window.addEventListener('pagehide',function(){
    try{
      if(window.currentPlotId && typeof window.runyeSetCurrentPlot==='function'){
        window.runyeSetCurrentPlot(window.currentPlotId);
      }else if(window.__ryPpGenSig && typeof window.runyeSaveProject==='function'){
        /* [v355] 无地块库锚的地块（手画/图片测量/AI 回带）：点过「生成施工图」后切页也要
           留存完整快照（ppGenSig 随存档走，恢复时自校验几何一致性，见 ryPpGenRestoreProject）。 */
        window.runyeSaveProject(true);
      }
    }catch(e){}
  });
})();
