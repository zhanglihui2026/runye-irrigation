
// ===== Project save/load =====
(function(){
  var SAVE_KEY='runye_irrigation_saved_project_v1';
  function readPlotLibrary(){
    var store=window.RyPlotLibraryStore;
    if(!store||typeof store.read!=='function') return [];
    var snapshot=store.read();
    return snapshot&&snapshot.ok&&Array.isArray(snapshot.plots)?snapshot.plots:[];
  }
  function resolveProjectPlotBinding(value){
    if(value==null||value==='') return {id:null,reason:null};
    var id=String(value), store=window.RyPlotLibraryStore, snapshot=null, matches=0;
    if(!store||typeof store.read!=='function') return {id:null,reason:'unavailable'};
    try{snapshot=store.read();}catch(e){return {id:null,reason:'unavailable'};}
    if(!snapshot||!snapshot.ok||!Array.isArray(snapshot.plots)) return {id:null,reason:'unavailable'};
    var plots=snapshot.plots;
    for(var i=0;i<plots.length;i++){
      if(plots[i]&&String(plots[i].id)===id) matches++;
    }
    if(matches===1) return {id:id,reason:null};
    return {id:null,reason:matches>1?'duplicate':'missing'};
  }
  function writeCurrentPlotAnchor(id){
    id=id==null||id===''?null:String(id);
    var store=window.RyIrrigationDataStore;
    if(!store||typeof store.writeCurrentPlotAnchor!=='function') return false;
    return store.writeCurrentPlotAnchor(id)!==false;
  }
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

  // [2026-10-12 数字农业剥离] 原「存档后广播地块给对端模块」的耦合已按用户决定整体切除，
  // 桥接层文件与调用点一并删除；此处只做纯本地存档，不再往外广播。
  /* ===== [v619 2026-10-20] 「用户拖出来的位置」纳入工程快照 =====
     用户诉求：「我不小心误操作了标识的位置，要能退回去；只要是误操作，Ctrl+Z 就应该能回退」。
     这几个位置原先各自躺在自己的 localStorage 键里（三通下移 / 水源点 / 手工节点 / 尺寸标注线 /
     整图平移），工程存档和撤销快照都够不着 ⇒ 拖错了既没法撤销、导出工程也带不走。
     现在统一收进 payload 的 `tlAux` 一栏（架构上仍是「只有一份序列化」，不新增第二套状态模型）。
     读/写全部 try-catch 兜底：旧存档没有 tlAux ⇒ 原样跳过，行为与改动前完全一致。 */
  function readTlAux(){
    function rd(k){ try{ var s=localStorage.getItem(k); return s?JSON.parse(s):null; }catch(e){ return null; } }
    /* 标注线偏移例外：它的真实状态在内存 window._tlDimState（{sig,offs}），
       而 localStorage 'tl-dim-offs' 只在这个「保存开关」为开时才写（默认关，且关时还会主动清档）。
       按盘上的值拍快照 ⇒ 默认情况下永远是 null，拖过标注线也退不回去 ⇒ 这里直接读内存。
       sig 是布局签名，尺寸随分区/组变化而变，恢复时按它校验（不符就不套用旧偏移）。 */
    var dims=null;
    try{
      var ds=window._tlDimState;
      if(ds && ds.sig && ds.offs && Object.keys(ds.offs).length) dims={ sig:ds.sig, offs:ds.offs };
    }catch(e){}
    return {
      drops:rd('tlFrontNodeDrops_v1'),   // 总管三通下移量 {mk:{sig,off}}
      src:rd('tlSourceMove_v1'),         // 水源点绝对坐标 {sig,x,y}
      nodes:rd('runye_tlNodes_v1'),      // 手工节点/连线
      dims:dims,                         // 尺寸标注线偏移 {sig,offs}（内存态）
      plotPos:rd('tl-plot-pos')          // 整图平移 {x,y}
    };
  }
  function writeTlAux(aux){
    if(!aux||typeof aux!=='object') return;
    function wr(k,v){ try{ if(v==null) localStorage.removeItem(k); else localStorage.setItem(k,JSON.stringify(v)); }catch(e){} }
    wr('tlFrontNodeDrops_v1',aux.drops);
    wr('tlSourceMove_v1',aux.src);
    wr('tl-plot-pos',aux.plotPos);
    /* 标注线：写回内存态。布局签名不符 → 只清偏移、保留当前 sig（偏移本就是按当前布局的坐标），
       不能把整份旧 sig 盖上去，否则旧的 sig 会让后续 tlDimOffOf 全部读不到。 */
    try{
      var ds=window._tlDimState;
      if(ds){
        if(aux.dims && aux.dims.sig===ds.sig && aux.dims.offs) ds.offs=JSON.parse(JSON.stringify(aux.dims.offs));
        else ds.offs={};
        try{ if(window._tlDimSaveOn) localStorage.setItem('tl-dim-offs',JSON.stringify({sig:ds.sig,offs:ds.offs})); }catch(e2){}
      }
    }catch(e){}
    /* 节点有内存副本（RyTlNodes 只在启动时读一次盘），必须走它的 restore 才会重绘。
       ★ null 与 undefined 必须区分开：undefined = 旧存档/旧快照压根没有这一栏（跳过，保持现状）；
         null = 那一刻确实一个手工节点都没有（要清空）—— 否则「加节点」这一步永远撤不掉，
         因为撤到"没有节点"的那份快照时会被当成"跳过"（v619 探针 D2 抓到）。 */
    try{
      if(window.RyTlNodes){
        if(aux.nodes===undefined) { /* 旧快照无此字段：不动 */ }
        else if(aux.nodes && typeof aux.nodes==='object') window.RyTlNodes.restore(aux.nodes);
        else if(window.RyTlNodes.reset) window.RyTlNodes.reset();
      }
    }catch(e){}
  }

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
      tlDiagramData:window.tlDiagramData||null,
      tlEditPipes:(window.RyTlEditPipes && window.tlDiagramData) ? window.RyTlEditPipes.serialize() : null,
      tlAutoEdits:(window.RyTlAutoEdits && window.tlDiagramData) ? window.RyTlAutoEdits.serialize() : null,
      manualGroups:(typeof window.tlManualGroups!=='undefined' && window.tlManualGroups) ? window.tlManualGroups : [],
      zoneStep:(typeof tlZoneStepCount==='function' && tlZoneStepCount()>0) ? window.tlZoneStep : null,
      ppGenSig:(typeof window.__ryPpGenSig!=='undefined'&&window.__ryPpGenSig)?window.__ryPpGenSig:null,
      tlAux:readTlAux()
    };
    localStorage.setItem(key||SAVE_KEY,JSON.stringify(data));
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
    if(!data||typeof data!=='object'||Array.isArray(data)){toast('保存数据格式无效');return;}
    /* 恢复前先确定工程的地块归属。缺失/已删除/重复的地块ID按未绑定工程载入，
       并清除当前标签页锚点，避免把存档中的图纸与页面原地块身份混用。 */
    var plotBinding=resolveProjectPlotBinding(data.currentPlotId);
    if(plotBinding.reason==='unavailable'){
      toast('地块库当前不可用，无法核对存档归属，方案未恢复');
      return;
    }
    if(!writeCurrentPlotAnchor(plotBinding.id)){
      toast('当前地块状态无法安全更新，方案未恢复');
      return;
    }
    window.currentPlotId=plotBinding.id;
    var bindingNotice=plotBinding.reason
      ? (plotBinding.reason==='duplicate'?'存档关联地块ID重复，已按未绑定工程恢复':'存档关联地块已不存在，已按未绑定工程恢复')
      : null;
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
    /* v161：刷新地块库高亮；归属和活动锚点已在任何工程状态写入前完成校验。 */
    try{ if(typeof window.runyeRenderPlotLib==='function') window.runyeRenderPlotLib(); }catch(e){}
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
    /* 管网几何由工作区共享；兼容旧存档的 isoDiagram.data 字段名。 */
    var savedTlDiagram = (data.tlDiagramData && data.tlDiagramData.version === 1)
      ? data.tlDiagramData
      : (data.isoDiagram && data.isoDiagram.data && data.isoDiagram.data.version === 1 ? data.isoDiagram.data : null);
    window.tlDiagramData = savedTlDiagram;
    /* [v619] 位置层先于下面的几何/编辑恢复写回：三通下移、水源、标注线偏移都要在
       渲染（renderThreeLevel / 工作区重绘）之前就位，否则画面仍按旧位置画。 */
    writeTlAux(data.tlAux);
    if (savedTlDiagram) {
      if (window.RyTlEditPipes) window.RyTlEditPipes.syncGeometry(savedTlDiagram);
      if (window.RyTlAutoEdits) window.RyTlAutoEdits.syncGeometry(savedTlDiagram);
    }
    /* 共享图面数据层恢复（2026-09-15 阶段1）：几何签名随存档校验，不符拒绝 */
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
    toast(bindingNotice||'方案已打开');
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
     做法：①「设为当前 / 保存地块 / 地图回传落库」时写本标签页锚点；旧 localStorage 锚点仅作新标签页默认值
             并静默留存完整工作状态（复用既有 runyeSaveProject 快照）；
           ② 本页加载完成时，若锚点地块仍在库中、且存档记录的当前地块与锚点一致，
             则静默恢复（宁可不恢复，也不恢复成错方案）；
           ③ 地图回传（runyeMeasuredArea）与图片测量优先：前者由 applyMapMeasuredArea
             处理并会写新锚点，后者清锚点，两者都不会被自动恢复覆盖。 */
  window.runyeMarkCurrentPlot=function(id){
    return writeCurrentPlotAnchor(id);
  };
  /* 「本页当前地块已变为 id」：记锚点 + 静默留存完整状态（id 为空 = 只清锚点，不动存档） */
  window.runyeSetCurrentPlot=function(id){
    window.runyeMarkCurrentPlot(id);
    if(id && typeof window.runyeSaveProject==='function'){ try{ window.runyeSaveProject(true); }catch(e){} }
  };
  function ryAutoRestoreProject(){
    try{
      if(window.__runyeAutoRestored) return;
      if(window.RyMeasuredAreaBridgeStore.readRaw()) return;              /* 地图回传优先 */
      var store=window.RyIrrigationDataStore;
      if(!store||typeof store.readCurrentPlotAnchor!=='function') return;
      var anchor=store.readCurrentPlotAnchor();
      if(!anchor||!anchor.ok) return;
      var a=anchor&&anchor.ok ? {id:anchor.id} : null;
      if(!a||!a.id) return;
      var raw=localStorage.getItem(SAVE_KEY); if(!raw) return;
      var snap=null; try{ snap=JSON.parse(raw); }catch(e){}
      if(!snap||snap.currentPlotId!==a.id) return;                       /* 存档与锚点不一致 → 不恢复 */
      var lib=readPlotLibrary();
      var hit=false; for(var i=0;i<lib.length;i++){ if(lib[i].id===a.id){ hit=true; break; } }
      if(!hit) return;                                                   /* 地块已删除 → 不恢复 */
      window.__runyeAutoRestored=true;
      window.runyeLoadProject({key:SAVE_KEY, silent:true});
      /* load 恢复三级管网几何与设计状态；设计工作区按恢复的地块/参数延迟重建，
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
    /* AI 规划由独立的 ?smart=1 页面接收回程快照。普通标签不能消费共享的一次性标记，
       否则会抢先删除标记并把另一标签的共享快照载入当前地块。 */
    var search=window.location&&typeof window.location.search==='string'?window.location.search:'';
    if(!/(?:^|[?&])smart=1(?:&|$)/.test(search))return;
    var had=false;
    try{had=!!localStorage.getItem('runye_aiplot_anchor_v1');}catch(e){}
    if(!had)return;
    try{
      if(window.__runyeAutoRestored){localStorage.removeItem('runye_aiplot_anchor_v1');return;} /* v161 已恢复 → 锚冗余 */
      if(window.RyMeasuredAreaBridgeStore.readRaw())return;  /* 地图回传优先 */
      var raw=localStorage.getItem(SAVE_KEY);if(!raw)return;
      var snap=null;try{snap=JSON.parse(raw);}catch(e){return;}
      if(!snap||!Array.isArray(snap.measuredPolygon)||snap.measuredPolygon.length<3)return;
      var savedPlotId=snap.currentPlotId==null||snap.currentPlotId===''?null:String(snap.currentPlotId);
      var pagePlotId=window.currentPlotId==null||window.currentPlotId===''?null:String(window.currentPlotId);
      if(pagePlotId&&pagePlotId!==savedPlotId)return;
      var plotStore=window.RyIrrigationDataStore;
      if(plotStore&&typeof plotStore.readCurrentPlotAnchor==='function'){
        var anchor=plotStore.readCurrentPlotAnchor();
        if(!anchor||anchor.ok!==true)return;
        var anchorPlotId=anchor.id==null||anchor.id===''?null:String(anchor.id);
        if(anchorPlotId!==savedPlotId)return;
      }else if(savedPlotId&&pagePlotId!==savedPlotId)return;
      window.runyeLoadProject({key:SAVE_KEY,silent:true});
      try{localStorage.removeItem('runye_aiplot_anchor_v1');}catch(e){}
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
      if(window.RyMeasuredAreaBridgeStore.readRaw()) return;              /* 地图回传优先 */
      var raw=localStorage.getItem(SAVE_KEY); if(!raw) return;
      var snap=null; try{ snap=JSON.parse(raw); }catch(e){ return; }
      if(!snap || !snap.ppGenSig) return;
      if(!Array.isArray(snap.measuredPolygon) || snap.measuredPolygon.length<3) return;
      if(window.ryPolySig(snap.measuredPolygon)!==snap.ppGenSig) return; /* 边界已改 → 不恢复 */
      /* 自动恢复不能像手动「载入方案」那样切换当前地块。共享快照若属于另一标签页，
         v161 会因锚点不匹配让位；这里也必须核对当前标签页锚点，避免随后把它改回存档地块。 */
      var savedPlotId=snap.currentPlotId==null||snap.currentPlotId===''?null:String(snap.currentPlotId);
      var pagePlotId=window.currentPlotId==null||window.currentPlotId===''?null:String(window.currentPlotId);
      if(pagePlotId&&pagePlotId!==savedPlotId) return;
      var plotStore=window.RyIrrigationDataStore;
      if(plotStore&&typeof plotStore.readCurrentPlotAnchor==='function'){
        var anchor=plotStore.readCurrentPlotAnchor();
        if(!anchor||anchor.ok!==true) return;
        var anchorPlotId=anchor.id==null||anchor.id===''?null:String(anchor.id);
        if(anchorPlotId!==savedPlotId) return;
      }else if(savedPlotId&&pagePlotId!==savedPlotId) return;
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
