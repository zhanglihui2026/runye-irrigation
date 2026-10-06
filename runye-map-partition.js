(function(root){
 'use strict';
 var PARAMS=['planTapeSpacing','planEmitterSpacing','planEmitterFlow','planTapeLaySide','planZoneMuManual','planZoneMode','planTargetV','planN','planSrcDist','fld_lift','fld_dh','fld_tapePressure','fld_existPressure','fld_filterLoss','fld_efficiency'];
 function copy(v){return JSON.parse(JSON.stringify(v));}
 function valid(p){return p&&p.version===1&&Number.isFinite(p.angle)&&p.angle>=-180&&p.angle<=180;}
 function rotate(p,deg,c){var r=deg*Math.PI/180,a=Math.cos(r),b=Math.sin(r),x=p.x-c.x,y=p.y-c.y;return{x:c.x+x*a-y*b,y:c.y+x*b+y*a};}
 function center(poly){return{x:(Math.min.apply(null,poly.map(p=>p.x))+Math.max.apply(null,poly.map(p=>p.x)))/2,y:(Math.min.apply(null,poly.map(p=>p.y))+Math.max.apply(null,poly.map(p=>p.y)))/2};}
 function orient(poly,angle,c){c=c||center(poly);return poly.map(p=>rotate(p,angle,c));}
 function params(){var p={};PARAMS.forEach(function(id){var e=root.document.getElementById(id);if(e)p[id]=e.value;});return p;}
 function restore(plan){if(!valid(plan))return;Object.keys(plan.params||{}).forEach(function(id){if(PARAMS.indexOf(id)<0)return;var e=root.document.getElementById(id);if(e)e.value=plan.params[id];});var b=root.RunyeBridge;if(b){b.state.cutSnap=plan.cutSnap?copy(plan.cutSnap):{sig:'',x:null,y:null};b.state.cutOverrides=plan.cutOverrides?copy(plan.cutOverrides):{x:{},y:{}};b.state.zoneRotated=!!plan.zoneRotated;}if(typeof root.calcPlan==='function')root.calcPlan();if(typeof root.ppRender==='function')root.ppRender();}
 function polygons(toLL){var b=root.RunyeBridge,cuts=b.getZoneCuts(),rings=root.__runyeSubPlots&&root.__runyeSubPlots.length?root.__runyeSubPlots.map(s=>s.poly):[b.state.polyPts],out=[];
  if(!cuts)return out;for(var y=0;y<cuts.yPos.length-1;y++)for(var x=0;x<cuts.xPos.length-1;x++)rings.forEach(function(r){var p=b.clipPolyToRect(r,cuts.xPos[x],cuts.yPos[y],cuts.xPos[x+1],cuts.yPos[y+1]);if(p&&p.length>=3&&b.polyArea(p)>0.01)out.push({latLng:p.map(toLL),area:b.polyArea(p)});});return out;
 }
 function capture(net){if(!net||!root.__runyeMapFrameInv||!root.RunyeBridge)return;var inv=root.__runyeMapFrameInv;
  function frame(p){var x=p.x-inv.tx,y=p.y-inv.ty;return{x:inv.ax*x+inv.bx*y,y:inv.ay*x+inv.by*y};}
  var angle=Math.atan2(inv.ay,inv.ax)*180/Math.PI,base=root.__runyeGeoBase,m=6378137*Math.PI/180,co=Math.cos(base.refLat*Math.PI/180);
  function ll(p){p=frame(p);return[base.refLat+p.y/m,base.refLng+p.x/(m*co)];}
  var plan={version:1,angle:angle,params:params(),cutSnap:copy(root.RunyeBridge.state.cutSnap),cutOverrides:copy(root.RunyeBridge.state.cutOverrides),zoneRotated:!!root.RunyeBridge.state.zoneRotated};
  net.partitionPlan=plan;net.partitions=polygons(ll);
  var list=JSON.parse(root.localStorage.getItem('runye_plot_library')||'[]'),p=list.find(p=>p.id===net.plotId);if(p){p.partitionPlan=plan;p.partitions=net.partitions;root.localStorage.setItem('runye_plot_library',JSON.stringify(list));}
 }
 function preview(payload,angle){payload=copy(payload);payload.partitionPlan={version:1,angle:angle,params:(payload.partitionPlan||{}).params||{},zoneRotated:!!(payload.partitionPlan||{}).zoneRotated};root.runyeApplyMapPayload(payload);
  var b=root.RunyeBridge,F=root.__runyeMapFramePoly,c=center(F.map(p=>({x:p.x,y:-p.y}))),base=root.__runyeGeoBase,m=6378137*Math.PI/180,co=Math.cos(base.refLat*Math.PI/180);
  function ll(p){p=rotate(p,-angle,c);return[base.refLat-p.y/m,base.refLng+p.x/(m*co)];}
  return{plan:{version:1,angle:angle,params:params(),cutSnap:copy(b.state.cutSnap),cutOverrides:copy(b.state.cutOverrides),zoneRotated:!!b.state.zoneRotated},partitions:polygons(ll)};
 }
 function attach(map){
  var box=root.document.getElementById('mapPartitionTools');if(!box)return;var select=box.querySelector('select'),input=box.querySelector('input'),status=box.querySelector('[role=status]'),layer=root.L.layerGroup().addTo(map),iframe=null,busy=false;
  function library(){return JSON.parse(root.localStorage.getItem('runye_plot_library')||'[]');}
  function current(){return library().find(p=>p.id===select.value);}
  function geometry(p){return JSON.stringify([p.polyLatLng,p.polyLatLngSet,p.subPlots]);}
  function draw(p){layer.clearLayers();(p&&p.partitions||[]).forEach(z=>root.L.polygon(z.latLng.map(q=>root.RyMapHost.toDisplay(q)),{color:'#f59e0b',weight:2,fillOpacity:0.04,interactive:false}).addTo(layer));}
  function refresh(){var old=select.value,list=library().filter(p=>!p.mergedInto&&p.polyLatLng&&p.polyLatLng.length>=3);select.innerHTML='';list.forEach(p=>{var o=root.document.createElement('option');o.value=p.id;o.textContent=p.name||p.id;select.appendChild(o);});if(list.some(p=>p.id===old))select.value=old;var p=current();input.value=p&&valid(p.partitionPlan)?p.partitionPlan.angle.toFixed(2):'0';draw(p);}
  select.onchange=function(){var p=current();input.value=p&&valid(p.partitionPlan)?p.partitionPlan.angle.toFixed(2):'0';draw(p);status.textContent='正角度为从东向北旋转；真实地块边界不变。';};
  box.querySelector('[data-angle-minus]').onclick=()=>{input.value=Math.max(-180,Number(input.value)-1);};box.querySelector('[data-angle-plus]').onclick=()=>{input.value=Math.min(180,Number(input.value)+1);};
  async function engine(){if(!iframe){iframe=root.document.createElement('iframe');iframe.src='index.html?partitionPreview=1';iframe.title='分区计算';iframe.setAttribute('aria-hidden','true');iframe.style.cssText='position:fixed;left:-10000px;width:1280px;height:900px;border:0';root.document.body.appendChild(iframe);}var start=Date.now();while(!iframe.contentWindow.RyMapPartition||!iframe.contentWindow.RunyeBridge||!iframe.contentWindow.runyeApplyMapPayload){if(Date.now()-start>20000)throw new Error('二级分区引擎加载超时');await new Promise(r=>setTimeout(r,100));}return iframe.contentWindow;}
  box.querySelector('[data-angle-apply]').onclick=async function(){if(busy)return;var p=current(),angle=Number(input.value);if(!p||input.value.trim()===''||!Number.isFinite(angle)||angle<-180||angle>180){status.textContent='请选择地块，角度范围为 −180° 至 180°。';return;}busy=true;this.disabled=true;status.textContent='正在按二级规则重新划分…';try{var payload=root.RyMapHost.payload(p),w=await engine(),result=w.RyMapPartition.preview(payload,angle);var list=library(),live=list.find(q=>q.id===p.id);if(!result.partitions.length)throw new Error('未生成有效分区，请检查地块和分区参数');if(!live||geometry(live)!==geometry(p)||select.value!==p.id)throw new Error('地块已切换，请重试');live.partitionPlan=result.plan;live.partitions=result.partitions;root.localStorage.setItem('runye_plot_library',JSON.stringify(list));var net=JSON.parse(root.localStorage.getItem('runye_network_layout')||'null');if(net&&(net.plotId===p.id||p.id==='auto-current'&&p.designPlotId===net.plotId)){net.partitionPlan=result.plan;net.partitions=result.partitions;net.segments=[];net.dripTapes=[];net.valves=[];net.sourcePos=null;net.needsReplan=true;root.localStorage.setItem('runye_network_layout',JSON.stringify(net));root.RyMapHost.refresh();}draw(live);status.textContent='已重新划分 '+result.partitions.length+' 个区域；旧管路需回二级重新规划。';}catch(e){status.textContent='未应用：'+e.message;}finally{busy=false;this.disabled=false;}};
  box.querySelector('[data-angle-send]').onclick=function(){var p=current();if(!p||busy)return;var saved=valid(p.partitionPlan)?p.partitionPlan.angle:0;if(input.value.trim()===''||!Number.isFinite(Number(input.value))||Math.abs(Number(input.value)-saved)>0.006){status.textContent='角度尚未应用，请先点击“应用并重新划分”，再回二级。';return;}root.RyMapHost.send(p,this);};
  root.addEventListener('storage',refresh);root.addEventListener('runye-plots-updated',refresh);refresh();return{refresh:refresh};
 }
 root.RyMapPartition={orient:orient,center:center,valid:valid,restore:restore,capture:capture,preview:preview,attach:attach};
})(typeof window!=='undefined'?window:globalThis);
