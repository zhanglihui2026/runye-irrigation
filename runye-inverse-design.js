/* Inverse trials reuse the forward hydraulic model. No automatic pipe reselection. */
(function(root,factory){
  var node=typeof module==='object'&&module.exports;
  var api=factory(node?require('./hydraulic-calc/design-core.js'):root.RyDesignCore,
    node?require('./hydraulic-calc/pipe-path-loss.js'):root.RyPipePathLoss);
  if(node) module.exports=api; else {root.RyInverseDesign=api; root.addEventListener('DOMContentLoaded',function(){install(root,api);});}
  function install(w,api){
    var doc=w.document,scope='fld',saved=null,trial=null,current=null,key='runye_inverse_source_v1';
    var dialog=doc.createElement('dialog');dialog.id='ryInverseDialog';
    dialog.innerHTML='<header><strong>滴灌带改善与水源校核</strong><button type="button" data-action="close">关闭</button></header><div class="ri-body"><p id="riScope"></p><section><h3>滴灌带压差改善</h3><p>按现有固定滴头流量模型，将沿程摩阻压差控制在 50% 以内。此值不代表实际灌水均匀度；山地高差、滴头压力流量关系需另行校核。</p><label>产品允许最大工作压力（bar）<input id="riMaxPressure" type="number" min="0" step="0.1" placeholder="查产品资料后填写"></label><button type="button" data-action="tape">求解改善方案</button><div id="riTape"></div></section><section id="riSourceSection"><h3>可用水源 · 固定当前管径</h3><p>请填写同一个实际工作点的流量和扬程。扬程填写水泵可提供的增压扬程；已有入口压力仍按原表单计入，勿重复填写。</p><div class="ri-fields"><label>可用扬程（m）<input id="riHead" type="number" min="0" step="0.1"></label><label>水源流量（m³/h）<input id="riFlow" type="number" min="0" step="0.1"></label></div><button type="button" data-action="source">校核并推荐轮灌</button><div id="riSource"></div></section><p id="riMessage" role="status"></p><button type="button" data-action="undo" disabled>撤销本次应用（恢复应用前整份方案）</button></div>';
    doc.body.appendChild(dialog);
    function el(id){return doc.getElementById(id);} function num(id){return Number(el(id).value);}
    function calc(){
      if(scope==='plan'){var r={tapeLen:num('planTapeLaySide'),tapeSpacing:num('planTapeSpacing'),emitterSpacing:num('planEmitterSpacing'),emitterFlow:num('planEmitterFlow'),tapeOD:num('fld_tapeOD'),tapePressure:num('fld_tapePressure')};r.tapeDeltaPct=api.tapeLoss(r,r.tapeLen,r.tapeOD)/(r.tapePressure*10.2)*100;return r;}
      return scope==='tl'?w.computeThreeLevel():w.compute();
    }
    function fingerprint(){return JSON.stringify([Array.from(doc.querySelectorAll('input[id],select[id]')).filter(function(e){return !e.id.startsWith('ri');}).map(function(e){return[e.id,e.value,e.checked];}),w.tlManualGroups,w.tlDiagramData,w.tlManualCals,w.RyTlAutoEdits&&w.RyTlAutoEdits.serialize(),w.RyTlAutoEdits&&w.RyTlAutoEdits.calibersMap(),w.tlAppliedPipeOverride&&w.tlAppliedPipeOverride(),w.RyTerrain&&w.RyTerrain.exportState()]);}
    function notice(s){el('riMessage').textContent=s;}
    function sourcePrefs(){return JSON.stringify([el('riHead').value,el('riFlow').value]);}
    function restore(snap){var slot='runye_inverse_undo_temp';w.localStorage.setItem(slot,snap.raw);try{w.tlManualCals=JSON.parse(snap.manualCals);w.runyeLoadProject(slot,true);if(w.RyTlAutoEdits&&w.tlDiagramData){var cals=JSON.parse(snap.draftCalibers);Object.keys(cals).forEach(function(pid){w.RyTlAutoEdits.setCaliber(pid,cals[pid],w.tlDiagramData);});}w.renderThreeLevel();}finally{w.localStorage.removeItem(slot);}}
    function snapshot(){
      if(!w.runyeSaveProject||!w.runyeLoadProject)throw Error('当前页面不支持安全撤销，无法应用。');
      var slot='runye_inverse_undo_temp';w.runyeSaveProject(true,slot);
      var raw=w.localStorage.getItem(slot);w.localStorage.removeItem(slot);
      if(!raw)throw Error('无法保存撤销快照，未修改方案。');return {raw:raw,manualCals:JSON.stringify(w.tlManualCals),draftCalibers:JSON.stringify(w.RyTlAutoEdits?w.RyTlAutoEdits.calibersMap():{})};
    }
    function open(s){scope=s;current=calc();trial=null;el('riTape').textContent='';el('riSource').textContent='';notice('');el('riScope').textContent=s==='tl'?'当前：三级管路规划':s==='plan'?'当前：二级地块规划（使用二级当前滴灌参数）':'当前：一级参数计算（长度应用会同步二级单边铺设长度）';el('riSourceSection').hidden=s!=='tl';dialog.showModal();}
    ['fld','tl'].forEach(function(s){var input=el(s+'_tapeLen');if(!input)return;var b=doc.createElement('button');b.type='button';b.className='ri-entry';b.textContent=s==='tl'?'压差改善 / 水源校核':'求解滴灌带压差改善';b.onclick=function(){open(s);};input.closest('.field').insertAdjacentElement('afterend',b);});
    var planInput=el('planTapeLaySide');if(planInput){var planButton=doc.createElement('button');planButton.type='button';planButton.className='ri-entry';planButton.textContent='滴灌带压差改善';planButton.onclick=function(){open('plan');};/* [v280 2026-10-06 用户要求] 与「地形高差」并排一行、各占一半：行容器由 runye-terrain.js 的 root.RyPlanBtnRow() 统一管（它建行 + 排序，保证压差改善在左）；取不到就退回原行为 */var planRow=typeof w.RyPlanBtnRow==='function'?w.RyPlanBtnRow(planButton):null;if(!planRow)planInput.closest('.pp-plan-item').insertAdjacentElement('afterend',planButton);}
    try{var prefs=JSON.parse(w.localStorage.getItem(key)||'{}');['Head','Flow','MaxPressure'].forEach(function(k){if(prefs[k]!=null)el('ri'+k).value=prefs[k];});}catch(e){}
    function persist(){try{w.localStorage.setItem(key,JSON.stringify({Head:el('riHead').value,Flow:el('riFlow').value,MaxPressure:el('riMaxPressure').value}));}catch(e){notice('浏览器无法保存水源设置；本次校核仍可进行。');}}
    dialog.addEventListener('click',function(ev){var b=ev.target.closest('button[data-action]');if(!b)return;try{
      var act=b.dataset.action;if(act==='close'){dialog.close();return;}
      if(act==='undo'){
        if(!saved)return;restore(saved);
        saved=null;b.disabled=true;trial=null;el('riTape').textContent='';el('riSource').textContent='';notice('已恢复应用前整份方案。');return;
      }
      if(act==='tape'){
        current=calc();var result=api.tapeOptions(current,num('riMaxPressure'));persist();
        trial={kind:'tape',fingerprint:fingerprint(),result:result};
        el('riTape').innerHTML='<p>当前摩阻压差：'+current.tapeDeltaPct.toFixed(1)+'%</p>'+result.map(function(o,i){return '<div class="ri-option"><strong>'+o.label+'</strong><p>'+o.detail+'</p><button type="button" data-action="applyTape" data-index="'+i+'" '+(o.allowed?'':'disabled')+'>应用'+(o.field==='tapeLen'?'并重新划分':'')+'</button></div>';}).join('')+'<p>压力补偿滴头可作为产品选型方向，需依据厂家补偿压力范围选型，不自动替换。</p>';return;
      }
      if(act==='source'){
        current=calc();persist();if(!current.inversePath||!current.inversePath.zones.length)throw Error('请先从二级规划生成三级图面，取得真实分区面积与路径。');
        if(w.RyTlEditPipes&&w.RyTlEditPipes.list().length)throw Error('图面含手工新增管线，当前路径模型不能完整识别其供水拓扑，暂不自动推荐轮灌。');
        if(w.RyTlAutoEdits&&Object.values(w.RyTlAutoEdits.serialize().hidden||{}).some(Boolean))throw Error('图面存在隐藏或停用管段，当前校核未识别断水关系，请恢复管段后校核。');
        var input=Object.assign({},current.inversePath,{frontOd:current.frontPipe.od,mainOd:current.mainPipe.od,branchOd:current.branchPipe.od,branchCount:current.branchCount,branchF:current.branchF,baseHead:current.lift+current.dh+current.tapePressureM-current.existPressure*10.2+current.filterLoss+2,sourceDistance:Number(el('planSrcDist').value)||0});
        var res=api.sourceGroups(input,num('riHead'),num('riFlow'));
        trial={kind:'source',fingerprint:fingerprint(),result:res,input:input,prefs:sourcePrefs()};
        var html='<p>当前分组：'+res.current.map(function(g,i){return '第'+(i+1)+'组 '+g.flow.toFixed(2)+' m³/h、'+g.head.toFixed(2)+' m '+(g.ok?'通过':'不足');}).join('；')+'</p>';
        if(res.failed.length)html+='<p>单独灌溉仍不满足的分区：'+res.failed.map(function(z){return z+1;}).join('、')+'。需缩小分区、调整固定管径或改善水源；增加轮灌组不能解决。</p>';
        else html+='<p>仅按流量的理论组数下限：'+res.lowerBound+'；兼顾当前路径扬程的可行建议：'+res.groups.length+' 组（不保证数学最少）。建议分组中最大同时灌溉面积 '+res.maxArea.toFixed(2)+' 亩。</p><p>'+res.groups.map(function(g,i){return '第'+(i+1)+'组：分区 '+g.map(function(z){return z+1;}).join(' / ');}).join('；')+'</p><button type="button" data-action="applyGroups">应用轮灌分组并重新生成图面</button>';
        el('riSource').innerHTML=html+'<p>按当前管径、分区和路径估算，不自动扩大地块。未计入新增接头局部损失、田间瞬变和未录入高程；请结合实测校核。</p>';return;
      }
      if(act==='applyTape'||act==='applyGroups'){
        if(!trial||trial.fingerprint!==fingerprint())throw Error('方案已变化，请重新求解后再应用。');
        if((act==='applyTape')!==(trial.kind==='tape'))throw Error('请重新求解对应方案。');
        var option=act==='applyTape'?trial.result[Number(b.dataset.index)]:null;
        if(option&&(!option.allowed||(option.field==='tapePressure'&&num('riMaxPressure')<option.value)))throw Error('产品允许压力不足，请核实后重新求解。');
        if(act==='applyGroups'&&trial.prefs!==sourcePrefs())throw Error('水源条件已变化，请重新校核。');
        var before=snapshot();
        try{
          if(option){var prefix=scope==='plan'?'fld':scope;el(prefix+'_'+option.field).value=option.value;
            if(option.field==='tapeLen'){
              ['tapeSpacing','emitterSpacing','emitterFlow','tapeOD','tapePressure'].forEach(function(k){el('fld_'+k).value=current[k];el('tl_'+k).value=current[k];var plan=el('plan'+k[0].toUpperCase()+k.slice(1));if(plan)plan.value=current[k];});
              el('planTapeLaySide').value=option.value;el('fld_tapeLen').value=option.value;el('tl_tapeLen').value=option.value;w.calcPlan();if(w.RunyeBridge)w.RunyeBridge.autoPipesWhole();if(w.tlAutoGenerate)w.tlAutoGenerate({scroll:false});
            }
            else el(prefix+'_'+option.field).dispatchEvent(new Event('input',{bubbles:true}));
            if(scope==='plan')w.calcPlan();
            w.render();w.renderThreeLevel();
            if(calc().tapeDeltaPct>50.00001)throw Error('应用后的正向计算未达到压差目标，已恢复原方案。');
          }else{
            var fixed=Object.assign({},trial.input.calibers||{});fixed.front=fixed.front||trial.input.frontOd;
            trial.input.zones.forEach(function(z){fixed['main-'+z.zi]=fixed['main-'+z.zi]||trial.input.mainOd;fixed['branch-'+z.zi]=fixed['branch-'+z.zi]||trial.input.branchOd;});
            w.tlManualGroups=trial.result.groups.map(function(g){return g.slice();});
            w.tlManualCals.front=fixed.front;w.tlAutoGenerate({scroll:false});
            w.tlPipeOdOverride={version:1,geoKey:w.RyTlAutoEdits.geometryKey(w.tlDiagramData),calibers:fixed};
            Object.keys(fixed).forEach(function(pid){if(w.RyTlAutoEdits.allPids(w.tlDiagramData).includes(pid))w.RyTlAutoEdits.setCaliber(pid,fixed[pid],w.tlDiagramData);});
            w.render();w.renderThreeLevel();
            if(w.tlRefreshGroupPanel)w.tlRefreshGroupPanel();if(w.tlRefreshGroupStatus)w.tlRefreshGroupStatus();
            var after=w.computeThreeLevel(),verify=api.sourceGroups(Object.assign({},trial.input,after.inversePath),num('riHead'),num('riFlow'));
            if(verify.current.some(function(g){return !g.ok;}))throw Error('重新生成后的图面未通过水源校核，已恢复原方案。');
          }
          saved=before;el('riMessage').textContent='已应用并重算。撤销会恢复应用前整份方案，包括后续修改，请及时使用。';el('riTape').textContent='';el('riSource').textContent='';trial=null;
          dialog.querySelector('[data-action="undo"]').disabled=false;
        }catch(err){restore(before);throw err;}
      }
    }catch(err){notice(err.message);}});
    api.open=open;
  }
})(typeof window!=='undefined'?window:globalThis,function(core,path){
  'use strict';
  function positive(n,name){if(!Number.isFinite(n)||n<=0)throw Error(name+'必须是大于 0 的有限数值。');}
  function loss(r,L,od){var ep=L/r.emitterSpacing;return core.hazen(L,ep*r.emitterFlow/1000,od*.8,150)*core.christiansen(ep);}
  function tapeOptions(r,maxPressure){
    ['tapeLen','tapeOD','emitterSpacing','emitterFlow','tapePressure'].forEach(function(k){positive(r[k],k);});
    var before=loss(r,r.tapeLen,r.tapeOD),target=r.tapePressure*10.2*.5;
    if(before<=target)throw Error('当前摩阻压差已在 50% 以内，无需为此缩短或升压。');
    var lo=0,hi=r.tapeLen;for(var i=0;i<60;i++){var mid=(lo+hi)/2;if(loss(r,mid,r.tapeOD)<=target)lo=mid;else hi=mid;}
    var len=Math.floor(lo*10)/10,needID=r.tapeOD*.8*Math.pow(before/target,1/4.87);
    var od=[16,20,25].find(function(d){return d>=r.tapeOD&&loss(r,r.tapeLen,d)<=target;});
    var pressure=Math.ceil(before/(.5*10.2)*100)/100;
    return [
      {field:'tapeLen',value:len,allowed:len>=10,label:'① 单条滴灌带 '+len.toFixed(1)+' m',detail:'当前 '+r.tapeLen+' m → '+len.toFixed(1)+' m；摩阻压差 '+(loss(r,len,r.tapeOD)/(r.tapePressure*10.2)*100).toFixed(1)+'%。应用会同步当前滴灌参数与单边长度，重新划分分区并生成管线；已有手工图面修改可能重建。'+(len<10?' 低于当前规划最小单边长度 10 m，不能直接应用。':'')},
      {field:'tapeOD',value:od,allowed:!!od,label:'② '+(od?'改用外径 Ø'+od+' 滴灌带':'常用外径档位不足'),detail:'模型要求内径至少 '+needID.toFixed(2)+' mm；'+(od?'外径 '+od+' mm 按当前 0.8 系数折算内径 '+(od*.8).toFixed(2)+' mm，摩阻压差 '+(loss(r,r.tapeLen,od)/(r.tapePressure*10.2)*100).toFixed(1)+'%。':'16 / 20 / 25 mm 均不满足。')+'实际内径需按产品资料核实。'},
      {field:'tapePressure',value:pressure,allowed:Number.isFinite(maxPressure)&&maxPressure>=pressure,label:'③ 入口工作压力 '+pressure.toFixed(2)+' bar',detail:'当前 '+r.tapePressure+' → '+pressure.toFixed(2)+' bar；计入 1.10 安全系数后，所需水泵扬程增加约 '+((pressure-r.tapePressure)*10.2*1.1).toFixed(2)+' m。仅在固定滴头流量假设下成立；请先填写产品允许压力并核实水泵能力。'}
    ];
  }
  function sourceGroups(s,H,Q){
    positive(H,'可用扬程');positive(Q,'水源流量');
    if(!s.zones||!s.zones.length||!Number.isFinite(s.baseHead))throw Error('路径或静扬程参数无效。');
    ['frontOd','mainOd','branchOd','branchCount'].forEach(function(k){positive(s[k],k);});
    if(!Number.isFinite(s.branchF)||s.branchF<=0||!Number.isFinite(s.sourceDistance)||s.sourceDistance<0)throw Error('路径参数无效。');
    var seen=new Set();s.zones.forEach(function(z){if(seen.has(z.zi)||!Number.isInteger(z.zi))throw Error('分区编号无效。');seen.add(z.zi);positive(z.flow,'分区流量');positive(z.area,'分区面积');['run','main','branch'].forEach(function(k){if(!Number.isFinite(z[k])||z[k]<0)throw Error('管线长度无效。');});});
    var input=Object.assign({},s,{zones:s.zones.map(function(z){return Object.assign({},z,{run:z.run+s.sourceDistance});}),innerDiam:function(od){positive(Number(od),'管径');return core.inner(Number(od),13.6);},hazen:function(L,q,d){return core.hazen(L,q,d,150);}});
    function evaluate(ids){var zs=ids.map(function(id){var z=s.zones.find(function(z){return z.zi===id;});if(!z)throw Error('轮灌引用了不存在的分区。');return z;});var flow=zs.reduce(function(a,z){return a+z.flow;},0),area=zs.reduce(function(a,z){return a+z.area;},0);input.groups=[ids];var r=path.calculate(input);var head=Math.max(0,s.baseHead+(r.worst?r.worst.total:0))*1.1;return{flow:flow,area:area,head:head,ok:flow<=Q+1e-8&&head<=H+1e-8};}
    var current=(s.groups||[]).map(evaluate),failed=s.zones.filter(function(z){return !evaluate([z.zi]).ok;}).map(function(z){return z.zi;});
    var groups=[];
    if(!failed.length)s.zones.slice().sort(function(a,b){return b.flow-a.flow||a.zi-b.zi;}).forEach(function(z){var g=groups.find(function(ids){return evaluate(ids.concat(z.zi)).ok;});if(g)g.push(z.zi);else groups.push([z.zi]);});
    return{current:current,groups:groups,failed:failed,lowerBound:Math.ceil(s.zones.reduce(function(a,z){return a+z.flow;},0)/Q),maxArea:groups.reduce(function(a,g){return Math.max(a,evaluate(g).area/666.67);},0),recommended:groups.map(evaluate)};
  }
  return{tapeOptions:tapeOptions,tapeLoss:loss,sourceGroups:sourceGroups};
});
