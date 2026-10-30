
// ===== Project save/load =====
(function(){
  var SAVE_KEY='runye_irrigation_saved_project_v1';
  var RESTORE_ROLLBACK_KEY='runye_project_restore_rollback_v1', restoreRollbackActive=false;
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
  function writeCurrentPlotAnchor(id,options){
    id=id==null||id===''?null:String(id);
    var store=window.RyIrrigationDataStore;
    if(!store||typeof store.writeCurrentPlotAnchor!=='function') return false;
    return store.writeCurrentPlotAnchor(id,options)!==false;
  }
  function snapshotContainsGroup(snapshot){
    var group=snapshot&&snapshot.groupPlan;
    return !!(group&&((Array.isArray(group.subPlots)&&group.subPlots.length>0) ||
      (group.edit&&Array.isArray(group.edit.slots)&&group.edit.slots.length>0)));
  }
  function isGroupProjectSnapshot(snapshot){
    return !!((window.__runyeGroupEdit&&window.__runyeGroupEdit.active) || snapshotContainsGroup(snapshot));
  }
  function singleGenerationSignatureMismatch(snapshot){
    var geometry=snapshot&&snapshot.tlDiagramData;
    return !snapshotContainsGroup(snapshot)&&!!(geometry&&geometry.sourceSignature&&
      geometry.sourceSignature!==drawingDesignGenerationInputSignature(snapshot));
  }
  function sameCanonicalContent(a,b){
    function normalize(value){
      var copy=JSON.parse(JSON.stringify(value));
      copy.revision=0;
      (copy.plots||[]).forEach(function(plot){
        plot.revision=0;
        if(plot.generated) plot.generated.sourceRevision=0;
        var part=plot.partition;
        if(part&&part.cutSnap){
          ['x','y'].forEach(function(axis){
            var cuts=axis==='x'?part.xCuts:part.yCuts;
            if(part.cutSnap[axis]==null&&Array.isArray(cuts))part.cutSnap[axis]=cuts.slice();
          });
        }
      });
      (copy.groups||[]).forEach(function(group){group.revision=0;});
      return JSON.stringify(copy);
    }
    try{return normalize(a)===normalize(b);}catch(e){return false;}
  }
  function drawingDesignGenerationInputSignature(snapshot){
    snapshot=snapshot||{};
    var inputValues=snapshot.inputValues||collectInputValues(), inputs={};
    Object.keys(inputValues).sort().forEach(function(id){
      if(/^(fld_|tl_|plan)/.test(id)) inputs[id]=inputValues[id];
    });
    var plan=snapshot.pipePlan||(typeof window.ppGetState==='function'?window.ppGetState():{})||{};
    var planInputs={};
    ['polyPts','mainPipes','branchPipes','subBranchPipes','source','valves','hiddenPipes','pipeIds',
      'nextPipeId','cutSnap','partitionCuts','cutOverrides','areaLocked','zoneRotated','zoneAngleDeg','zoneAuto']
      .forEach(function(key){if(Object.prototype.hasOwnProperty.call(plan,key))planInputs[key]=plan[key];});
    /* 恢复时分区切线会从 partitionCuts 回填到 cutSnap。两者表示同一组切线，
       签名应在回填前后保持一致；真正不同的手动切线仍保留在签名中。 */
    if(planInputs.cutSnap&&planInputs.partitionCuts){
      planInputs.cutSnap=JSON.parse(JSON.stringify(planInputs.cutSnap));
      ['x','y'].forEach(function(axis){
        if(planInputs.cutSnap[axis]==null&&Array.isArray(planInputs.partitionCuts[axis]))
          planInputs.cutSnap[axis]=planInputs.partitionCuts[axis].slice();
      });
    }
    var zoneStep=snapshot.zoneStep!==undefined?snapshot.zoneStep:(window.tlZoneStep||null);
    if(!zoneStep||!Object.keys(zoneStep.x||{}).length&&!Object.keys(zoneStep.y||{}).length) zoneStep=null;
    var auxiliary=snapshot.tlAux!==undefined?snapshot.tlAux:readTlAux();
    var payload={
      boundary:snapshot.measuredPolygon!==undefined?snapshot.measuredPolygon:(window.measuredPolygon||[]),
      area:snapshot.measuredArea!=null?snapshot.measuredArea:(window.measuredArea||0),
      inputs:inputs,
      plan:planInputs,
      planDims:snapshot.planDims!==undefined?snapshot.planDims:(window.runyePlanDims||null),
      zoneStep:zoneStep,
      manualGroups:snapshot.manualGroups!==undefined?snapshot.manualGroups:(window.tlManualGroups||[]),
      auxiliary:auxiliary?{drops:auxiliary.drops||null,src:auxiliary.src||null}:null,
      groupPlan:snapshot.groupPlan!==undefined?snapshot.groupPlan:null,
      terrain:snapshot.terrain!==undefined?snapshot.terrain:(window.RyTerrain?window.RyTerrain.exportState():null)
    };
    var raw=JSON.stringify(payload),a=2166136261,b=5381;
    for(var i=0;i<raw.length;i++){
      var code=raw.charCodeAt(i);
      a=Math.imul(a^code,16777619);
      b=Math.imul(b,33)^code;
    }
    function hex(value){return ('00000000'+(value>>>0).toString(16)).slice(-8);}
    return hex(a)+hex(b);
  }
  window.ryDrawingDesignGenerationInputSignature=function(){
    return drawingDesignGenerationInputSignature();
  };
  window.ryCommitSinglePlotL2Snapshot=function(beforePlan,afterPlan){
    var plotId=window.currentPlotId==null?'':String(window.currentPlotId);
    if(!plotId||(window.__runyeGroupEdit&&window.__runyeGroupEdit.active)) return null;
    var model=window.RyDrawingDesignModel, adapter=window.RyDrawingDesignLegacyAdapter;
    var design=window.__runyeSingleCanonicalDesign;
    if(!design){
      var seeded=singlePlotCanonical({currentPlotId:plotId,measuredPolygon:beforePlan&&beforePlan.polyPts,pipePlan:beforePlan},plotId);
      if(!seeded) return null;
      design=seeded;
    }
    if(!model||!adapter||!model.validate(design).ok||
        design.projectId!=='legacy-project:'+plotId||design.plots.length!==1||
        design.groups.length!==0||design.plots[0].plotId!==plotId) return false;
    function importPlan(plan){
      if(!plan||!Array.isArray(plan.polyPts)||plan.polyPts.length<3) return null;
      return adapter.fromProjectSnapshot({currentPlotId:plotId,measuredPolygon:plan.polyPts,pipePlan:plan},{
        projectId:'legacy-project:'+plotId,plotId:plotId,frameId:'legacy-frame:'+plotId
      });
    }
    function comparable(plot){
      if(!plot) return '';
      var network=JSON.parse(JSON.stringify(plot.network||{}));
      delete network.level3Edits;
      return JSON.stringify({boundary:plot.geometry&&plot.geometry.boundary,partition:plot.partition,network:network});
    }
    var before=importPlan(beforePlan), after=importPlan(afterPlan);
    if(!before||!before.ok||!after||!after.ok||
        comparable(design.plots[0])!==comparable(before.design.plots[0])) return false;
    var nextPlot=after.design.plots[0];
    var updated=model.updatePlot(design,plotId,design.revision,function(target){
      target.geometry.boundary=JSON.parse(JSON.stringify(nextPlot.geometry.boundary));
      target.partition=JSON.parse(JSON.stringify(nextPlot.partition));
      target.network=JSON.parse(JSON.stringify(nextPlot.network));
      delete target.network.level3Edits;
      delete target.generated;
    });
    if(!updated||!updated.ok) return false;
    window.__runyeSingleCanonicalDesign=updated.design;
    window.__runyeSingleDrawingDesignShadow={ok:true,stage:'l2-partition-write',plotId:plotId,
      designRevision:updated.design.revision,plotRevision:updated.design.plots[0].revision};
    return true;
  };
  function singlePlotCanonical(snapshot,plotId){
    var model=window.RyDrawingDesignModel, adapter=window.RyDrawingDesignLegacyAdapter;
    if(!model||!adapter||typeof adapter.fromProjectSnapshot!=='function') return null;
    if(singleGenerationSignatureMismatch(snapshot)) return null;
    var imported=adapter.fromProjectSnapshot(snapshot,{
      projectId:'legacy-project:'+String(plotId),
      plotId:String(plotId),
      frameId:'legacy-frame:'+String(plotId)
    });
    if(!imported||!imported.ok||!imported.design||imported.design.plots.length!==1) return null;
    var next=imported.design, previous=window.__runyeSingleCanonicalDesign;
    if(previous&&model.validate(previous).ok&&previous.projectId===next.projectId&&
        previous.plots.length===1&&previous.groups.length===0&&previous.plots[0].plotId===String(plotId)){
      if(sameCanonicalContent(previous,next)) next=previous;
      else return null;
    }
    if(!model.validate(next).ok) return null;
    window.__runyeSingleCanonicalDesign=JSON.parse(JSON.stringify(next));
    return next;
  }
  window.ryCommitSingleLevel3CanonicalFromRuntime=function(){
    if(!window.currentPlotId||!window.tlDiagramData||
        (window.__runyeGroupEdit&&window.__runyeGroupEdit.active)) return false;
    var model=window.RyDrawingDesignModel, adapter=window.RyDrawingDesignLevel3Adapter;
    var design=window.__runyeSingleCanonicalDesign, plotId=String(window.currentPlotId);
    if(!model||!adapter||!design||!model.validate(design).ok||
        design.projectId!=='legacy-project:'+plotId||design.plots.length!==1||
        design.groups.length!==0||design.plots[0].plotId!==plotId) return false;
    var sourceSignature=window.tlDiagramData.sourceSignature;
    if(!sourceSignature||sourceSignature!==drawingDesignGenerationInputSignature()) return false;
    var plot=design.plots[0];
    var plan=typeof window.ppGetState==='function'?window.ppGetState():null;
    function comparableCutSnap(value){
      if(value==null)return 'null';
      var snap=JSON.parse(JSON.stringify(value));
      ['x','y'].forEach(function(axis){
        var cuts=axis==='x'?plot.partition.xCuts:plot.partition.yCuts;
        if(snap[axis]==null&&Array.isArray(cuts))snap[axis]=cuts.slice();
      });
      return JSON.stringify(snap);
    }
    if(!plan||JSON.stringify(plot.geometry.boundary)!==JSON.stringify(plan.polyPts)||
        JSON.stringify(plot.network.mainPipes)!==JSON.stringify(plan.mainPipes||[])||
        JSON.stringify(plot.network.branchPipes)!==JSON.stringify(plan.branchPipes||[])||
        JSON.stringify(plot.network.subBranchPipes)!==JSON.stringify(plan.subBranchPipes||[])||
        JSON.stringify(plot.network.source)!==JSON.stringify(plan.source==null?null:plan.source)||
        JSON.stringify(plot.network.valves)!==JSON.stringify(plan.valves||[])||
        JSON.stringify(plot.network.ids)!==JSON.stringify(plan.pipeIds||{main:[],branch:[],subbranch:[]})||
        JSON.stringify(plot.network.hidden)!==JSON.stringify(plan.hiddenPipes||{main:{},branch:{},subbranch:{}})||
        plot.network.nextPipeId!==(Number.isSafeInteger(plan.nextPipeId)&&plan.nextPipeId>0?plan.nextPipeId:1)||
        plot.partition.angleDeg!==(Number.isFinite(Number(plan.zoneAngleDeg))?Number(plan.zoneAngleDeg):(plan.zoneRotated?90:0))||
        plot.partition.mode!==(plan.zoneAuto===false?'manual':'auto')||
        plot.partition.areaLocked!==(plan.areaLocked===true)||
        JSON.stringify(plot.partition.xCuts)!==JSON.stringify(plan.partitionCuts&&plan.partitionCuts.x||[])||
        JSON.stringify(plot.partition.yCuts)!==JSON.stringify(plan.partitionCuts&&plan.partitionCuts.y||[])||
        comparableCutSnap(plot.partition.cutSnap)!==comparableCutSnap(plan.cutSnap)||
        JSON.stringify(plot.partition.stepOverrides)!==JSON.stringify(plan.cutOverrides||{x:{},y:{}})) return false;
    if(plot.generated&&typeof adapter.isCurrent==='function'&&
        !adapter.isCurrent(plot.generated,window.tlDiagramData,plot.revision)) return false;
    var snapshot={
      tlDiagramData:window.tlDiagramData,
      tlEditPipes:window.RyTlEditPipes?window.RyTlEditPipes.serialize():null,
      tlAutoEdits:window.RyTlAutoEdits?window.RyTlAutoEdits.serialize():null,
      tlAux:readTlAux(),
      manualGroups:window.tlManualGroups||[]
    };
    var converted=adapter.fromProjectSnapshot(snapshot,{sourceRevision:plot.revision});
    if(!converted||!converted.ok||!converted.generated||!converted.edits) return false;
    var updated=model.updatePlot(design,plotId,design.revision,function(target){
      target.generated=JSON.parse(JSON.stringify(converted.generated));
      target.network.level3Edits=JSON.parse(JSON.stringify(converted.edits));
    });
    if(!updated||!updated.ok) return false;
    window.__runyeSingleCanonicalDesign=updated.design;
    window.__runyeSingleDrawingDesignShadow={ok:true,stage:'level3-runtime-write',plotId:plotId,
      designRevision:updated.design.revision,plotRevision:updated.design.plots[0].revision};
    return true;
  };
  window.ryRestoreSingleLevel3CanonicalRuntime=function(){
    if(!window.currentPlotId||(window.__runyeGroupEdit&&window.__runyeGroupEdit.active)) return false;
    var model=window.RyDrawingDesignModel, adapter=window.RyDrawingDesignLevel3Adapter;
    var design=window.__runyeSingleCanonicalDesign, plotId=String(window.currentPlotId);
    if(!model||!adapter||!design||!model.validate(design).ok||
        design.projectId!=='legacy-project:'+plotId||design.plots.length!==1||
        design.groups.length!==0||design.plots[0].plotId!==plotId) return false;
    var plot=design.plots[0];
    if(!plot.generated||!adapter.isCurrent(plot.generated,plot.generated.level3Geometry,plot.revision)) return false;
    var baseline={tlAux:readTlAux()}, automatic=window.RyTlAutoEdits&&window.RyTlAutoEdits.serialize();
    var projected=adapter.toProjectPatch({generated:plot.generated,edits:plot.network.level3Edits},
      plot.generated.level3Geometry,plot.revision,baseline);
    if(!projected||!projected.ok) return false;
    var snapshot=projected.snapshot, checked=adapter.fromProjectSnapshot({
      tlDiagramData:snapshot.tlDiagramData,tlEditPipes:snapshot.tlEditPipes,
      tlAutoEdits:snapshot.tlAutoEdits,tlAux:snapshot.tlAux,manualGroups:snapshot.manualGroups
    },{sourceRevision:plot.revision});
    if(!checked||!checked.ok||JSON.stringify(checked.generated)!==JSON.stringify(plot.generated)||
        JSON.stringify(checked.edits)!==JSON.stringify(plot.network.level3Edits)) return false;
    var editPipes=window.RyTlEditPipes,autoEdits=window.RyTlAutoEdits,nodes=window.RyTlNodes;
    if(snapshot.tlEditPipes!=null&&(!editPipes||typeof editPipes.restore!=='function'))return false;
    if(snapshot.tlAutoEdits!=null&&(!autoEdits||typeof autoEdits.restore!=='function'))return false;
    if(snapshot.tlAux&&snapshot.tlAux.nodes!=null&&(!nodes||typeof nodes.restore!=='function'))return false;
    if(editPipes&&(typeof editPipes.syncGeometry!=='function'||typeof editPipes.reset!=='function'))return false;
    if(autoEdits&&(typeof autoEdits.syncGeometry!=='function'||typeof autoEdits.reset!=='function'))return false;
    if(nodes&&typeof nodes.reset!=='function')return false;
    var sessionCaliberKeys=automatic&&automatic.cals?Object.keys(automatic.cals):[];
    if(sessionCaliberKeys.length&&(!autoEdits||typeof autoEdits.setCaliber!=='function'))return false;
    var geometry=snapshot.tlDiagramData;
    window.tlDiagramData=JSON.parse(JSON.stringify(geometry));
    window.tlManualGroups=Array.isArray(snapshot.manualGroups)?JSON.parse(JSON.stringify(snapshot.manualGroups)):[];
    if(editPipes){
      editPipes.syncGeometry(geometry);
      if(snapshot.tlEditPipes){
        if(!editPipes.restore(snapshot.tlEditPipes)) return false;
      }else{
        editPipes.reset();
        if(editPipes.discardSaved) editPipes.discardSaved();
      }
    }
    if(autoEdits){
      autoEdits.syncGeometry(geometry);
      if(snapshot.tlAutoEdits){
        if(!autoEdits.restore(snapshot.tlAutoEdits)) return false;
      }else{
        autoEdits.reset();
        if(autoEdits.discardSaved) autoEdits.discardSaved();
      }
      var sessionCals=automatic&&automatic.cals||{};
      Object.keys(sessionCals).forEach(function(pid){
        autoEdits.setCaliber(pid,sessionCals[pid],geometry,'canonical-rollback');
      });
    }
    if(nodes){
      if(snapshot.tlAux&&snapshot.tlAux.nodes){
        if(!nodes.restore(snapshot.tlAux.nodes)) return false;
      }else nodes.reset();
    }
    var auxiliary=snapshot.tlAux;
    if(auxiliary===null) auxiliary={drops:null,src:null,dims:null,plotPos:null};
    if(auxiliary&&typeof auxiliary==='object'){
      writeTlAux({drops:auxiliary.drops,src:auxiliary.src,dims:auxiliary.dims,plotPos:auxiliary.plotPos});
    }
    try{if(window.RyTlWs&&typeof window.RyTlWs.rerenderKeepView==='function')window.RyTlWs.rerenderKeepView();}catch(eRender){}
    try{if(typeof renderThreeLevel==='function')renderThreeLevel();}catch(eDiagram){}
    window.__runyeSingleDrawingDesignShadow={ok:true,stage:'level3-runtime-rollback',plotId:plotId,
      designRevision:design.revision,plotRevision:plot.revision};
    return true;
  };
  function projectSingleCanonical(snapshot,expectedPlotId){
    if(!Object.prototype.hasOwnProperty.call(snapshot,'canonicalDrawingDesign')) return {ok:true,snapshot:snapshot,legacy:true};
    var model=window.RyDrawingDesignModel, adapter=window.RyDrawingDesignLegacyAdapter;
    var canonical=snapshot.canonicalDrawingDesign;
    if(singleGenerationSignatureMismatch(snapshot)){
      return {ok:false,error:'level3-generation-input-signature-mismatch'};
    }
    if(!model||!adapter||typeof adapter.toLegacyPatch!=='function') return {ok:false,error:'drawing-design-adapter-unavailable'};
    var validation=model.validate(canonical);
    if(!validation.ok||canonical.plots.length!==1||canonical.groups.length!==0||
        canonical.plots[0].plotId!==String(expectedPlotId)||canonical.projectId!=='legacy-project:'+String(expectedPlotId)){
      return {ok:false,error:'canonical-single-plot-binding-invalid'};
    }
    var projected=adapter.toLegacyPatch(canonical,String(expectedPlotId),snapshot);
    if(!projected||!projected.ok) return {ok:false,error:projected&&projected.error||'canonical-projection-failed'};
    var result=projected.snapshot;
    var roundTrip=adapter.fromProjectSnapshot(result,{
      projectId:'legacy-project:'+String(expectedPlotId),
      plotId:String(expectedPlotId),
      frameId:'legacy-frame:'+String(expectedPlotId)
    });
    if(!roundTrip||!roundTrip.ok||!roundTrip.design||
        !sameCanonicalContent(canonical,roundTrip.design)){
      return {ok:false,error:'canonical-projection-roundtrip-mismatch'};
    }
    result.canonicalDrawingDesign=JSON.parse(JSON.stringify(canonical));
    return {ok:true,snapshot:result,legacy:false};
  }
  function importLegacySingleCanonicalForRestore(snapshot,plotId){
    var model=window.RyDrawingDesignModel, adapter=window.RyDrawingDesignLegacyAdapter;
    if(!plotId||!model||typeof model.validate!=='function'||!adapter||
        typeof adapter.fromProjectSnapshot!=='function'||singleGenerationSignatureMismatch(snapshot)) return null;
    try{
      var imported=adapter.fromProjectSnapshot(snapshot,{
        projectId:'legacy-project:'+String(plotId),
        plotId:String(plotId),
        frameId:'legacy-frame:'+String(plotId)
      });
      if(!imported||!imported.ok||!imported.design||!model.validate(imported.design).ok||
          imported.design.projectId!=='legacy-project:'+String(plotId)||
          imported.design.plots.length!==1||imported.design.groups.length!==0||
          imported.design.plots[0].plotId!==String(plotId)) return null;
      return JSON.parse(JSON.stringify(imported.design));
    }catch(e){return null;}
  }
  function aiHandoffId(){
    try{
      var search=window.location&&typeof window.location.search==='string'?window.location.search:'';
      var match=/(?:^|[?&])handoffId=([A-Za-z0-9_-]{8,80})(?:&|$)/.exec(search);
      return match?match[1]:null;
    }catch(e){return null;}
  }
  function aiHandoffKey(id){return id?'runye_ai_plot_handoff_v1:'+id:null;}
  function aiSessionKey(id){return id?'runye_ai_plot_session_v1:'+id:null;}
  function projectSaveKey(){
    var id=aiHandoffId();
    return aiSessionKey(id)||SAVE_KEY;
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

  /* ===== [v820] 按地块/按组的小型留档（从 runyeSaveProject 主体里提出来） =====
     体积远小于主工程快照（不含三级管网），且是回传/切地块时真正必须保住的管网设计。
     必须在主快照之前写：主快照撞配额时它们已经落盘。 */
  function archivePlotDesign(data){
    /* [v677 成组继承] 非成组态把当前单地块的完整设计按地块 id 留档
       用户拍板的新方向：「所有地块都是单地块进行划分，最后才拼成一组」。
       留档键 runye_plot_design_v1:<plotId>；将来这块被划进组（或与其他块拼组）时，
       二级页 ppInitGroupEdit 按 sub.id 找回这份设计，质心平移继承到对应子地块 ——
       单地块在二级页布好的管/调好的分区线，成组后原样带过去，不再整组重画。
       ★ 成组态不写（各块设计已在 ge.slots 里，由 groupPlan 走主存档）；
       ★ 写档失败静默跳过：留档是增益路径，绝不能影响主存档本身。 */
    try{
      var _geNow=window.__runyeGroupEdit;
      var _pid=window.currentPlotId;
      if((_geNow&&_geNow.active)||!_pid) return false;
      /* 没有可归档的二级几何时，不会因主快照配额失败而丢失已有 L2 设计。 */
      if(!data.pipePlan||!data.pipePlan.polyPts||data.pipePlan.polyPts.length<3) return !data.canonicalDrawingDesign;
      var pp=data.pipePlan;
      var _design={
        savedAt:data.savedAt,
        polySig:typeof window.ryPolySig==='function'?window.ryPolySig(pp.polyPts):'',
        canonicalDrawingDesign:data.canonicalDrawingDesign||null,
        design:{
          polyPts:pp.polyPts,
          mainPipes:pp.mainPipes||[],
          branchPipes:pp.branchPipes||[],
          subBranchPipes:pp.subBranchPipes||[],
          valves:pp.valves||[],
          source:pp.source||null,
          cutSnap:pp.cutSnap||null,
          partitionCuts:pp.partitionCuts||null,
          cutOverrides:pp.cutOverrides||null,
          hiddenPipes:pp.hiddenPipes||null,
          pipeIds:pp.pipeIds||null,
          nextPipeId:pp.nextPipeId||1,
          areaLocked:!!pp.areaLocked,
          zoneRotated:!!pp.zoneRotated,
          zoneAngleDeg:isFinite(Number(pp.zoneAngleDeg))?Number(pp.zoneAngleDeg):(pp.zoneRotated?90:0),
          zoneAuto:pp.zoneAuto!==false
        }
      };
      return guardedSetItem('runye_plot_design_v1:'+encodeURIComponent(String(_pid)),_design);
    }catch(eArc){ return false; }
  }
  /* 组级设计另按组 ID 保存，避免切换到另一地块/组时覆盖唯一的当前工程快照。
     此档案包含组内 L2 slots 与手绘组级总管；与单地块 L2 档案完全分开。 */
  function archiveGroupDesign(data){
    try{
      if(!(window.__runyeGroupEdit&&window.__runyeGroupEdit.active)) return false;
      if(!window.currentPlotId||!data.groupPlan) return false;
      return guardedSetItem('runye_group_design_v1:'+encodeURIComponent(String(window.currentPlotId)),{
        savedAt:data.savedAt,
        design:data.groupPlan
      });
    }catch(eGroupArc){ return false; }
  }
  /* 统一写入口：优先走容量守卫（失败先回收一次性交接槽再重试），守卫缺失时退化为直接写。 */
  function guardedSetItem(key,value){
    var json;
    try{ json=JSON.stringify(value); }catch(e){ return false; }
    if(window.RyStorageGuard&&typeof window.RyStorageGuard.write==='function'){
      return window.RyStorageGuard.write(key,json).ok===true;
    }
    try{ localStorage.setItem(key,json); return true; }catch(e){ return false; }
  }

  window.runyeSaveProject=function(silent,key,snapshotOnly){
    /* v161：可选第二参 key —— 静默自动留存与「手动保存」共用同一套快照构造，
       不传 key 时写原有 SAVE_KEY，行为与改动前一致。 */
    /* [v284] __ryUndoQuiet：撤销模块只借「构造快照」这一步，不需要它顺手重算材料清单 */
    if(!window.__ryUndoQuiet&&typeof updateMaterialTotals==='function') updateMaterialTotals();
    var _groupActive=!!(window.__runyeGroupEdit&&window.__runyeGroupEdit.active);
    var _groupPlan=window.grExportState?window.grExportState():null;
    if(_groupActive&&(!_groupPlan||!_groupPlan.canonicalDrawingDesign)){
      try{console.warn('[drawing-design] canonical group snapshot unavailable; save refused');}catch(eGroupSaveWarn){}
      return false;
    }
    var data={
      savedAt:new Date().toISOString(),
      inputValues:collectInputValues(),
      branchCount:getSelectedBranchCount(),
      layoutSides:getSelectedLayoutSides(),
      tlBranchCount:readSelectedInt('#tl_branchGroup .selected', 2),
      tlLayoutSides:readSelectedInt('#tl_layoutGroup .selected', 1),
      pipeOdOverride:_groupActive?null:tlAppliedPipeOverride(),
      measuredArea:window.measuredArea||0,
      planDims:window.runyePlanDims||null,
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
      groupPlan:_groupPlan,
      terrain:window.RyTerrain ? window.RyTerrain.exportState() : null,
      tlDiagramData:_groupActive?null:(window.tlDiagramData||null),
      tlEditPipes:(!_groupActive&&window.RyTlEditPipes && window.tlDiagramData) ? window.RyTlEditPipes.serialize() : null,
      tlAutoEdits:(!_groupActive&&window.RyTlAutoEdits && window.tlDiagramData) ? window.RyTlAutoEdits.serialize() : null,
      manualGroups:(!_groupActive&&typeof window.tlManualGroups!=='undefined' && window.tlManualGroups) ? window.tlManualGroups : [],
      zoneStep:(!_groupActive&&typeof tlZoneStepCount==='function' && tlZoneStepCount()>0) ? window.tlZoneStep : null,
      ppGenSig:(!_groupActive&&typeof window.__ryPpGenSig!=='undefined'&&window.__ryPpGenSig)?window.__ryPpGenSig:null,
      tlAux:_groupActive?{drops:null,src:null,nodes:null,dims:null,plotPos:null}:readTlAux()
    };
    /* Keep single-plot project archives bound to the canonical model while the
       legacy fields remain the runtime projection consumed by the current UI.
       Once a matching canonical model exists, legacy runtime state may confirm it
       but must not silently replace it during save. */
    var canonicalSaveMustFail=false;
    try{
      if(data.currentPlotId&&!isGroupProjectSnapshot(data)){
        var prior=window.__runyeSingleCanonicalDesign, model=window.RyDrawingDesignModel;
        var hasBoundCanonical=!!(prior&&model&&model.validate(prior).ok&&
          prior.projectId==='legacy-project:'+String(data.currentPlotId)&&prior.plots.length===1&&
          prior.groups.length===0&&prior.plots[0].plotId===String(data.currentPlotId));
        canonicalSaveMustFail=hasBoundCanonical;
        if(hasBoundCanonical&&data.tlDiagramData&&data.tlDiagramData.sourceSignature&&
            data.tlDiagramData.sourceSignature===drawingDesignGenerationInputSignature(data)&&
            (typeof window.ryCommitSingleLevel3CanonicalFromRuntime!=='function'||
             window.ryCommitSingleLevel3CanonicalFromRuntime()!==true)){
          if(silent!==true)projectToast('三级状态未能提交到规范绘图模型，方案未保存');
          return false;
        }
        var canonical=singlePlotCanonical(data,data.currentPlotId);
        if(canonical&&hasBoundCanonical){
          var adapter=window.RyDrawingDesignLegacyAdapter;
          var projection=adapter&&adapter.toLegacyPatch(canonical,String(data.currentPlotId),data);
          if(!projection||!projection.ok){
            if(silent!==true)projectToast('规范绘图模型无法安全投影到存档，方案未保存');
            return false;
          }
          data=projection.snapshot;
          data.canonicalDrawingDesign=JSON.parse(JSON.stringify(canonical));
        }else if(canonical){
          data.canonicalDrawingDesign=canonical;
        }else if(hasBoundCanonical){
          if(silent!==true)projectToast('旧编辑状态与规范绘图模型不一致，方案未保存');
          return false;
        }else if(window.RyDrawingDesignModel&&window.RyDrawingDesignLegacyAdapter){
          try{console.warn('[drawing-design] 单地块规范快照未生成，保留兼容存档');}catch(eCanonicalWarn){}
        }
      }
      canonicalSaveMustFail=false;
    }catch(eCanonicalSave){
      if(canonicalSaveMustFail){
        if(silent!==true)projectToast('规范绘图模型保存校验异常，方案未保存');
        return false;
      }
    }
    /* ===== [v820] 先写小的「按地块留档」，再写大的主工程快照 =====
       旧顺序是「主快照 → L2 档案」。主快照含三级管网 tlDiagramData，可达 MB 级，
       一旦撞上 localStorage 配额就抛 QuotaExceededError，L2 档案根本没机会写 ——
       而回传/切地块时真正必须保住的正是 L2 档案（二级主管/支管/分区线）。
       故把体积小得多的留档提到前面：主快照写失败，管网设计也已经落盘。 */
    var _networkArchiveOk=!snapshotOnly;
    if(!snapshotOnly){
      _networkArchiveOk=_groupActive?archiveGroupDesign(data):archivePlotDesign(data);
      window.__ryLastNetworkArchiveOk=_networkArchiveOk===true;
    }
    var _saveKey=key||projectSaveKey();
    var _w=(window.RyStorageGuard&&typeof window.RyStorageGuard.writeSnapshot==='function')
      ? window.RyStorageGuard.writeSnapshot(_saveKey,data)
      : (function(){ try{ localStorage.setItem(_saveKey,JSON.stringify(data)); return {ok:true}; }catch(e){ return {ok:false,reason:'quota'}; } })();
    if(!_w||!_w.ok){
      /* 存不下：先把占用情况打进控制台，再给用户能照做的指引（旧版只有一句
         「exceeded the quota」，用户根本看不出是本机存储满了）。 */
      try{ if(window.RyStorageGuard) window.RyStorageGuard.report('工程快照写入失败',8); }catch(eRep){}
      /* 三级图面和手工调整只在完整快照里。配额不足时，只有没有三级图面且
         二级设计已独立落盘，调用方才能继续切换或回传。 */
      var _quotaFailed=!!(_w&&_w.reason==='quota');
      window.__ryLastSaveBlockedByL3=_quotaFailed&&!!data.tlDiagramData;
      window.__ryLastSaveStorageFull=_quotaFailed&&_networkArchiveOk===true&&!data.tlDiagramData;
      window.__ryLastSaveFullMessage=(window.RyStorageGuard&&typeof window.RyStorageGuard.fullMessage==='function')
        ? window.RyStorageGuard.fullMessage() : '本机存储已满，方案未能保存。请删除不用的旧档案后重试。';
      if(silent!==true) projectToast(window.__ryLastSaveFullMessage);
      return false;
    }
    if(_w.trimmed){
      /* 瘦身后才写进去：三级管网的懒算缓存/规范模型副本被剥掉，功能不受影响 */
      try{ console.warn('[v820] 工程快照已精简保存（level '+(_w.level||0)+'），释放 '+Math.round((_w.freed||0)/1024)+'KB'); }catch(eTrim){}
    }
    /* ===== [v677 成组继承] 非成组态把当前单地块的完整设计按地块 id 留档 =====
       用户拍板的新方向：「所有地块都是单地块进行划分，最后才拼成一组」。
       留档键 runye_plot_design_v1:<plotId>；将来这块被划进组（或与其他块拼组）时，
       二级页 ppInitGroupEdit 按 sub.id 找回这份设计，质心平移继承到对应子地块 ——
       单地块在二级页布好的管/调好的分区线，成组后原样带过去，不再整组重画。
       ★ 成组态不写（各块设计已在 ge.slots 里，由 groupPlan 走主存档）；
       ★ 写档失败静默跳过：留档是增益路径，绝不能影响主存档本身。 */
    if(silent!==true)projectToast('方案已保存到本机');
    return true;
  };

  function captureRestoreRollbackSnapshot(){
    if(typeof window.runyeSaveProject!=='function'||!window.localStorage)return null;
    var previousQuiet=window.__ryUndoQuiet,raw=null;
    try{
      window.__ryUndoQuiet=true;
      try{window.localStorage.removeItem(RESTORE_ROLLBACK_KEY);}catch(e0){}
      if(window.runyeSaveProject(true,RESTORE_ROLLBACK_KEY,true)!==true)return null;
      raw=window.localStorage.getItem(RESTORE_ROLLBACK_KEY);
      if(!raw)return null;
      var snapshot=JSON.parse(raw),edits=window.RyTlAutoEdits;
      if(edits&&typeof edits.calibersMap==='function'){
        var calibers=edits.calibersMap(),keys=calibers?Object.keys(calibers):[];
        if(keys.length){snapshot.__restoreCals={};keys.forEach(function(k){snapshot.__restoreCals[k]=calibers[k];});}
      }
      return JSON.stringify(snapshot);
    }catch(e){return null;}
    finally{
      window.__ryUndoQuiet=previousQuiet;
      try{window.localStorage.removeItem(RESTORE_ROLLBACK_KEY);}catch(e1){}
    }
  }
  function restoreAfterFailedProjectLoad(raw){
    if(typeof raw!=='string'||!raw||!window.localStorage||typeof window.runyeLoadProject!=='function')return false;
    var previousQuiet=window.__ryUndoQuiet,restored=false,snapshot=null;
    try{
      snapshot=JSON.parse(raw);
      window.__ryUndoQuiet=true;
      restoreRollbackActive=true;
      window.localStorage.setItem(RESTORE_ROLLBACK_KEY,raw);
      restored=window.runyeLoadProject(RESTORE_ROLLBACK_KEY,true)===true;
    }catch(e){restored=false;}
    finally{
      restoreRollbackActive=false;
      window.__ryUndoQuiet=previousQuiet;
      try{window.localStorage.removeItem(RESTORE_ROLLBACK_KEY);}catch(e1){}
    }
    if(!restored)return false;
    try{
      var edits=window.RyTlAutoEdits,want=snapshot&&snapshot.__restoreCals||{},current=edits&&typeof edits.calibersMap==='function'?edits.calibersMap()||{}:{};
      if(edits){
        Object.keys(current).forEach(function(k){if(!(k in want)&&typeof edits.clearCaliber==='function')edits.clearCaliber(k,'restore-rollback');});
        Object.keys(want).forEach(function(k){if(Math.abs((current[k]||0)-want[k])>1e-6&&typeof edits.setCaliber==='function')edits.setCaliber(k,want[k],null,'restore-rollback');});
      }
    }catch(e2){}
    return true;
  }

  window.runyeLoadProject=function(keyOrOpts,silentOpt){
    /* v161：支持指定存档 key 与静默恢复（自动恢复走静默、不弹提示）。
       点按钮调用时第一个实参是 Event 对象 → 落回默认 key + 非静默，行为同改动前。 */
    var _key=projectSaveKey(), _silent=(silentOpt===true), _anchorOptions=null;
    if(typeof keyOrOpts==='string'){ _key=keyOrOpts; }
    else if(keyOrOpts && typeof keyOrOpts==='object'){ if(keyOrOpts.key) _key=String(keyOrOpts.key); if(keyOrOpts.silent===true) _silent=true; if(keyOrOpts.isolated===true)_anchorOptions={sharedDefault:false}; }
    var toast=function(m){ if(!_silent) projectToast(m); };
    var raw=localStorage.getItem(_key);
    if(!raw){toast('还没有保存过方案');return false;}
    var data;
    try{data=JSON.parse(raw);}catch(e){toast('保存数据读取失败');return false;}
    if(!data||typeof data!=='object'||Array.isArray(data)){toast('保存数据格式无效');return false;}
    var restoringGroupSnapshot=snapshotContainsGroup(data);
    if(singleGenerationSignatureMismatch(data)){
      toast('三级生成图与存档中的设计输入不匹配，方案未恢复');
      return false;
    }
    /* 恢复前先确定工程的地块归属。缺失/已删除/重复的地块ID按未绑定工程载入，
       并清除当前标签页锚点，避免把存档中的图纸与页面原地块身份混用。 */
    var plotBinding=resolveProjectPlotBinding(data.currentPlotId);
    if(plotBinding.reason==='unavailable'){
      toast('地块库当前不可用，无法核对存档归属，方案未恢复');
      return false;
    }
    var restoredCanonicalDesign=null;
    if(Object.prototype.hasOwnProperty.call(data,'canonicalDrawingDesign')){
      var canonicalRestore=projectSingleCanonical(data,plotBinding.id);
      if(!canonicalRestore.ok){
        toast('规范绘图模型校验或旧格式投影失败，方案未恢复：'+canonicalRestore.error);
        return false;
      }
      data=canonicalRestore.snapshot;
      restoredCanonicalDesign=data.canonicalDrawingDesign;
    }else if(plotBinding.id){
      /* Legacy archives remain loadable even when conversion cannot represent every field.
         A successful preflight seeds the canonical runtime only after the plot anchor commits. */
      restoredCanonicalDesign=importLegacySingleCanonicalForRestore(data,plotBinding.id);
    }
    if(data.groupPlan&&
        (typeof window.grValidateRestoreState!=='function'||typeof window.grRestoreState!=='function')){
      toast('多地块组恢复器不可用，方案未恢复');
      return false;
    }
    if(data.groupPlan&&!window.grValidateRestoreState(data.groupPlan)){
      toast('多地块组快照校验或规范模型导入失败，方案未恢复');
      return false;
    }
    var rollbackSnapshot=null;
    if(!restoreRollbackActive){
      rollbackSnapshot=captureRestoreRollbackSnapshot();
      if(!rollbackSnapshot){
        toast('当前工程状态无法建立安全回滚点，方案未恢复');
        return false;
      }
    }
    try{
    if(!writeCurrentPlotAnchor(plotBinding.id,_anchorOptions)){
      toast('当前地块状态无法安全更新，方案未恢复');
      return false;
    }
    /* Publish the canonical model only after the plot anchor commits. Legacy imports are
       best-effort so unrepresentable historical fields retain their existing restore path. */
    window.__runyeSingleCanonicalDesign=restoredCanonicalDesign
      ? JSON.parse(JSON.stringify(restoredCanonicalDesign)) : null;
    window.__runyeSingleDrawingDesignShadow=null;
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
    var groupRestoreResult = window.grRestoreState
      ? window.grRestoreState(data.groupPlan || null)
      : null;
    /* A missing groupPlan intentionally clears any active group and returns false from
       grRestoreState; only a present group snapshot can fail the project restore. */
    if (data.groupPlan && groupRestoreResult === false) {
      throw new Error('多地块组规范状态恢复失败');
    }
    // 施工简图管线恢复后重渲染，材料清单随之采用施工简图实际长度
    if(typeof render==='function') render();
    if(typeof updateMaterialTotals==='function') updateMaterialTotals();
    /* 管网几何由工作区共享；兼容旧存档的 isoDiagram.data 字段名。 */
    var savedTlDiagram = !restoringGroupSnapshot && (data.tlDiagramData && data.tlDiagramData.version === 1)
      ? data.tlDiagramData
      : (!restoringGroupSnapshot && data.isoDiagram && data.isoDiagram.data && data.isoDiagram.data.version === 1 ? data.isoDiagram.data : null);
    window.tlDiagramData = savedTlDiagram;
    /* [v619] 位置层先于下面的几何/编辑恢复写回：三通下移、水源、标注线偏移都要在
       渲染（renderThreeLevel / 工作区重绘）之前就位，否则画面仍按旧位置画。 */
    writeTlAux(restoringGroupSnapshot?{drops:null,src:null,nodes:null,dims:null,plotPos:null}:data.tlAux);
    if (savedTlDiagram) {
      if (window.RyTlEditPipes) window.RyTlEditPipes.syncGeometry(savedTlDiagram);
      if (window.RyTlAutoEdits) window.RyTlAutoEdits.syncGeometry(savedTlDiagram);
    }
    /* 共享图面数据层恢复（2026-09-15 阶段1）：几何签名随存档校验，不符拒绝 */
    if(window.RyTlEditPipes){
      if(!restoringGroupSnapshot&&data.tlEditPipes && window.RyTlEditPipes.restore(data.tlEditPipes)){
        toast('三级手工管线已随方案恢复 ' + window.RyTlEditPipes.count() + ' 条');
      }else{
        window.RyTlEditPipes.reset();     // 无存档或签名不符 → 清空，不复活旧几何上的管线
        if(window.RyTlEditPipes.discardSaved) window.RyTlEditPipes.discardSaved();  // 兜底档一并作废（防同几何幽灵恢复）
      }
    }
    /* 自动管线图面编辑随主方案恢复（几何签名校验，2026-09-15 阶段2） */
    if(window.RyTlAutoEdits){
      if(!restoringGroupSnapshot&&data.tlAutoEdits && window.RyTlAutoEdits.restore(data.tlAutoEdits)){
        toast('三级自动管线编辑已随方案恢复（改长 ' + Object.keys(window.RyTlAutoEdits.lensMap()).length + ' 处 · 配件 ' + window.RyTlAutoEdits.fitCount() + ' 个）');
      }else{
        window.RyTlAutoEdits.reset();     // 无存档或签名不符 → 清空，不复活旧几何上的编辑
        if(window.RyTlAutoEdits.discardSaved) window.RyTlAutoEdits.discardSaved();
      }
    }
    if (typeof window !== 'undefined') {
      window.tlManualGroups = !restoringGroupSnapshot&&Array.isArray(data.manualGroups) ? data.manualGroups : [];
      /* v98h 阶梯分区覆盖表随方案恢复（签名不符时 tlZoneStepFor 会自行作废，不会套到新几何上） */
      if (!restoringGroupSnapshot&&data.zoneStep && data.zoneStep.x && data.zoneStep.y && data.zoneStep.sig) {
        window.tlZoneStep = { sig: String(data.zoneStep.sig), x: data.zoneStep.x, y: data.zoneStep.y };
      } else if (typeof tlZoneStepClear === 'function') {
        tlZoneStepClear();
      }
      window.tlPendingSel = [];
      window.tlGroupMode = false;
      /* Loading a complete project already carries manualGroups. Persisting here
         would save a partially restored state over the project being loaded. */
    }
    // 二级重算会同步三级输入；以存档中的三级参数为准恢复最终计算条件。
    restoreInputValues(data.inputValues);
    document.querySelectorAll('#tl_branchGroup button').forEach(function (b) { b.classList.toggle('selected', +b.dataset.n === tlBc); });
    document.querySelectorAll('#tl_layoutGroup button').forEach(function (b) { b.classList.toggle('selected', +b.dataset.sides === tlLs); });
    tlPipeOdOverride = restoringGroupSnapshot?null:tlNormalizePipeOverride(data.pipeOdOverride);
    if (!tlAppliedPipeOverride()) tlPipeOdOverride = null;
    renderThreeLevel();
    if (typeof tlUpdatePlanBar === 'function') tlUpdatePlanBar();
    if (window.tlPumpUpdateNote) window.tlPumpUpdateNote();
    toast(bindingNotice||'方案已打开');
    return true;
    }catch(restoreError){
      var rollbackOk=restoreRollbackActive||restoreAfterFailedProjectLoad(rollbackSnapshot);
      try{console.error('[project-restore] restore failed',restoreError);}catch(eLog){}
      toast(rollbackOk?'方案恢复失败，已恢复载入前状态':'方案恢复失败，载入前状态回滚未能确认');
      return false;
    }
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
    return writeCurrentPlotAnchor(id,aiHandoffId()?{sharedDefault:false}:null);
  };
  /* 「本页当前地块已变为 id」：记锚点 + 静默留存完整状态（id 为空 = 只清锚点，不动存档） */
  window.runyeSetCurrentPlot=function(id){
    if(id){
      if(typeof window.runyeSaveProject!=='function') return false;
      try{ if(window.runyeSaveProject(true)!==true) return false; }catch(e){ return false; }
    }
    return window.runyeMarkCurrentPlot(id)!==false;
  };
  /* 替换当前边界前先保存旧地块。hash 切页不会触发 pagehide，在线地图回传和地块库
     「设为当前」必须显式走这一步，避免旧二级管网被新 currentPlotId 错误归档。 */
  window.runyeSaveCurrentPlotBeforeSwitch=function(){
    if(!window.currentPlotId) return true;
    if(typeof window.runyeSaveProject!=='function') throw new Error('当前地块保存接口未加载');
    window.__ryLastSaveStorageFull=false;
    window.__ryLastSaveBlockedByL3=false;
    /* [v823] runyeSaveProject 在 silent=true 下有 5 处规范绘图模型校验失败分支只 return false、
       不设任何存储标记（本文件 529-606），且中间 projectToast 被 silent 吞掉 ⇒ 旧地块保存失败
       对用户完全静默，随后被下游误判为「非存储满」而硬 alert 中断回传（用户实测 P0）。
       这里把「旧地块保存失败」统一标记为可降级的 beforeSwitchSaveFailed，并附诊断类别
       saveReason，交给调用方判定是否有安全降级条件；校验失败发生在二级留档之前，
       不能宣称二级已保存，也不能清除旧地块运行态。 */
    var _ok;
    try{ _ok=window.runyeSaveProject(true); }
    catch(eThrow){
      var _et=new Error('当前地块快照写入异常：'+(eThrow&&eThrow.message?eThrow.message:'未知异常'));
      _et.storageFull=false;
      _et.beforeSwitchSaveFailed=true;
      _et.saveReason='exception';
      throw _et;
    }
    if(_ok!==true){
      var _reason = window.__ryLastSaveBlockedByL3 ? 'l3-blocked'
                  : window.__ryLastSaveStorageFull ? 'storage-full'
                  : 'verify-failed';
      window.__ryLastSaveReason=_reason;
      var _e=new Error(window.__ryLastSaveBlockedByL3
        ?'本机存储空间已满，当前三级管网未保存；请清理空间后重试'
        :(window.__ryLastSaveStorageFull?'本机存储空间已满'
          :'当前地块快照未确认写入（规范绘图模型校验未通过）'));
      _e.storageFull=!!window.__ryLastSaveStorageFull;
      _e.beforeSwitchSaveFailed=true;
      _e.saveReason=_reason;
      throw _e;
    }
    window.__ryLastSaveReason='';
    return true;
  };
  /* 新地块接管前清除运行时三级方案，避免旧块的总管/泵站编辑混入新块快照。
     旧块已先写入工程快照；各块在多地块页只恢复 L2 档案，组级总管由组页单独维护。 */
  window.runyeResetPlotScopedNetworkState=function(){
    window.tlDiagramData=null;
    window.tlManualGroups=[];
    window.tlPendingSel=[];
    window.tlGroupMode=false;
    /* A canonical single-plot model belongs to exactly one plot ID. Do not let the
       outgoing plot's model survive while the incoming plot is loading its own L2 slot. */
    window.__runyeSingleCanonicalDesign=null;
    window.__runyeSingleDrawingDesignShadow=null;
    window.__ryPpGenSig=null;
    try{ if(typeof tlPipeOdOverride!=='undefined') tlPipeOdOverride=null; }catch(eOverride){}
    try{ if(typeof tlZoneStepClear==='function') tlZoneStepClear(); }catch(eZone){}
    try{ if(typeof writeTlAux==='function') writeTlAux({drops:null,src:null,nodes:null,dims:null,plotPos:null}); }catch(eAux){}
    try{ if(window.RyTlEditPipes){ window.RyTlEditPipes.reset(); if(window.RyTlEditPipes.discardSaved) window.RyTlEditPipes.discardSaved(); } }catch(eEdit){}
    try{ if(window.RyTlAutoEdits){ window.RyTlAutoEdits.reset(); if(window.RyTlAutoEdits.discardSaved) window.RyTlAutoEdits.discardSaved(); } }catch(eAuto){}
    try{ if(window.RyTlNodes&&window.RyTlNodes.reset) window.RyTlNodes.reset(); }catch(eNodes){}
    return true;
  };
  /* 组级设计只在组 ID、成员和几何均匹配时恢复，防止组边界更新后套用旧总管。 */
  window.runyeRestoreGroupDesign=function(groupId){
    try{
      var ge=window.__runyeGroupEdit, current=window.__runyeSubPlots;
      if(!ge||!ge.active||!Array.isArray(current)||current.length<2||typeof window.grRestoreState!=='function') return false;
      var raw=localStorage.getItem('runye_group_design_v1:'+encodeURIComponent(String(groupId)));
      if(!raw) return false;
      var saved=JSON.parse(raw), design=saved&&saved.design, source=design&&design.subPlots;
      if(!Array.isArray(source)||source.length!==current.length) return false;
      var byId=Object.create(null);
      source.forEach(function(s){if(s&&s.id!=null)byId[String(s.id)]=s;});
      for(var i=0;i<current.length;i++){
        var a=current[i],b=a&&byId[String(a.id)];
        if(!a||!b||!Array.isArray(a.poly)||!Array.isArray(b.poly)||a.poly.length!==b.poly.length)return false;
        for(var j=0;j<a.poly.length;j++){
          if(Math.abs((+a.poly[j].x)-(+b.poly[j].x))>0.5||Math.abs((+a.poly[j].y)-(+b.poly[j].y))>0.5)return false;
        }
      }
      return window.grRestoreState(design)===true;
    }catch(eGroupRestore){ return false; }
  };
  function ryAutoRestoreProject(){
    try{
      if(window.__runyeAutoRestored) return;
      /* AI 新窗口必须先消费 URL 指定的源标签快照，不能先恢复共享默认槽。 */
      if(aiHandoffId()) return;
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
      if(window.runyeLoadProject({key:SAVE_KEY, silent:true})!==true) return;
      window.__runyeAutoRestored=true;
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
    var handoffId=aiHandoffId();
    if(handoffId){
      try{
        if(window.RyMeasuredAreaBridgeStore.readRaw())return;  /* 保留地图回传优先级 */
        var handoffKey=aiHandoffKey(handoffId), sessionKey=aiSessionKey(handoffId);
        var restoreKey=localStorage.getItem(handoffKey)?handoffKey:sessionKey;
        var handoffRaw=localStorage.getItem(restoreKey);
        if(!handoffRaw)return;
        var handoffSnap=JSON.parse(handoffRaw);
        if(!handoffSnap||!Array.isArray(handoffSnap.measuredPolygon)||handoffSnap.measuredPolygon.length<3)return;
        var expectedPlotId=handoffSnap.currentPlotId==null||handoffSnap.currentPlotId===''?null:String(handoffSnap.currentPlotId);
        var expectedPoly=(handoffSnap.groupPlan&&Array.isArray(handoffSnap.groupPlan.frame))?handoffSnap.groupPlan.frame:handoffSnap.measuredPolygon;
        if(window.runyeLoadProject({key:restoreKey,silent:true,isolated:true})!==true){
          try{if(typeof atShowToast==='function')atShowToast('AI 规划地块交接载入失败，请返回原页面重试');}catch(eLoadToast){}
          return;
        }
        var actualPlotId=window.currentPlotId==null||window.currentPlotId===''?null:String(window.currentPlotId);
        var actualPoly=(typeof window.ppGetPolyPts==='function')?window.ppGetPolyPts():(window.measuredPolygon||[]);
        var samePoly=typeof window.ryPolySig==='function'&&window.ryPolySig(actualPoly)===window.ryPolySig(expectedPoly);
        if(actualPlotId!==expectedPlotId||!samePoly){
          try{if(typeof atShowToast==='function')atShowToast('AI 规划地块交接未通过校验，请返回原页面重试');}catch(eToast){}
          return;
        }
        window.__runyeAutoRestored=true;
        if(restoreKey===handoffKey){try{localStorage.removeItem(handoffKey);}catch(eRemove){}}
        var _ryAlertH=window.alert;
        try{window.alert=function(){};if(actualPoly&&actualPoly.length>=3)window.__ryLazyReplay=true;}catch(eReplay){}finally{window.alert=_ryAlertH;}
        try{if(typeof tlUpdatePlanBar==='function')tlUpdatePlanBar();}catch(ePlan){}
        try{if(typeof atShowToast==='function')atShowToast('已恢复发起 AI 规划的地块与划分');}catch(eToast2){}
        return;
      }catch(eHandoff){try{console.warn('[ai-handoff] restore skipped:',eHandoff&&eHandoff.message);}catch(_){}return;}
    }
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
      if(window.runyeLoadProject({key:SAVE_KEY,silent:true})!==true){
        try{if(typeof atShowToast==='function')atShowToast('AI 规划恢复失败，请返回重试');}catch(eLoadToast){}
        return;
      }
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
      if(window.runyeLoadProject({key:SAVE_KEY, silent:true})!==true) return;
      window.__runyeAutoRestored=true;
      window.__ryPpGenSig=snap.ppGenSig;   /* 记回内存：后续 pagehide 继续留存 */
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
