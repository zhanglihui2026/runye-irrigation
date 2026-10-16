(function(root){
 'use strict';
 var PARAMS=['planTapeSpacing','planEmitterSpacing','planEmitterFlow','planTapeLaySide','planZoneMuManual','planZoneMode','planTargetV','planN','planSrcDist','fld_lift','fld_dh','fld_tapePressure','fld_existPressure','fld_filterLoss','fld_efficiency'];
 function copy(v){return JSON.parse(JSON.stringify(v));}
 function plotStore(){return root.RyPlotLibraryStore||null;}
 function readLibrary(){var store=plotStore();return store?store.read():{ok:false,error:'plot-library-store-unavailable'};}
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
  var state=readLibrary();if(!state.ok)return false;var matches=state.plots.filter(function(p){return p&&p.id===net.plotId;});if(matches.length!==1)return false;var p=matches[0];p.partitionPlan=plan;p.partitions=net.partitions;var saved=plotStore().replace(state.plots,state.revision);return !!saved.ok;
 }
 function preview(payload,angle){payload=copy(payload);payload.partitionPlan={version:1,angle:angle,params:(payload.partitionPlan||{}).params||{},zoneRotated:!!(payload.partitionPlan||{}).zoneRotated};root.runyeApplyMapPayload(payload);
  var b=root.RunyeBridge,F=root.__runyeMapFramePoly,c=center(F.map(p=>({x:p.x,y:-p.y}))),base=root.__runyeGeoBase,m=6378137*Math.PI/180,co=Math.cos(base.refLat*Math.PI/180);
  function ll(p){p=rotate(p,-angle,c);return[base.refLat-p.y/m,base.refLng+p.x/(m*co)];}
  return{plan:{version:1,angle:angle,params:params(),cutSnap:copy(b.state.cutSnap),cutOverrides:copy(b.state.cutOverrides),zoneRotated:!!b.state.zoneRotated},partitions:polygons(ll)};
 }
 function attach(map){
  var box=root.document.getElementById('mapPartitionTools');if(!box)return;var select=box.querySelector('select'),input=box.querySelector('input'),status=box.querySelector('[role=status]'),layer=root.L.layerGroup().addTo(map),iframe=null,busy=false;
  function library(){var state=readLibrary();return state.ok?state.plots:[];}
  function current(){return library().find(p=>p.id===select.value);}
  function geometry(p){return JSON.stringify([p.polyLatLng,p.polyLatLngSet,p.subPlots]);}
  /* [v499 2026-10-16 用户截图反馈] 分区格只画**内部分割线**，不再画整格外框。
   * 问题：分区格外边沿与「地块」图层轮廓重复，且分区按旋转框重划后与地块环有数米
   *   偏差，两圈线叠在一起被看成「我的地块 vs 当前地块两个重复地块」。
   * 判据（零启发式、不受旋转偏差影响）：一条边同时属于两个分区格 = 内部分割线（画）；
   *   只属于一个分区格 = 外边沿（跳过——地块图层已有权威轮廓）。端点按 1e-5（≈1.1m）
   *   量化配对，容忍裁剪产生的浮点噪声；只有 1 个分区时没有共享边 ⇒ 全跳过（正确：
   *   整块地即分区，地块图层轮廓已足够）。
   * 保留 fillOpacity 0.04 的格底淡填充（描边置零），分区范围仍可感知。 */
  function draw(p){
    layer.clearLayers();
    var parts=(p&&p.partitions||[]).filter(z=>z&&z.latLng&&z.latLng.length>=3);
    if(!parts.length)return;
    var style={color:'#f59e0b',weight:2,fillOpacity:0.04,interactive:false};
    parts.forEach(z=>root.L.polygon(z.latLng.map(q=>root.RyMapHost.toDisplay(q)),Object.assign({},style,{weight:0,opacity:0})).addTo(layer));
    function qkey(pt){return Math.round(pt[0]*1e5)+','+Math.round(pt[1]*1e5);}
    var edges={};
    parts.forEach(z=>{
      var q=z.latLng.map(qkey);
      for(var i=0;i<q.length;i++){
        var k1=q[i],k2=q[(i+1)%q.length],key=k1<k2?k1+'|'+k2:k2+'|'+k1;
        var e=edges[key];
        if(!e)edges[key]={n:1,a:z.latLng[i],b:z.latLng[(i+1)%z.latLng.length]};
        else e.n++;
      }
    });
    Object.keys(edges).forEach(function(k){
      var e=edges[k];
      if(e.n<2)return; // 外边沿：只属于一个分区格，跳过（地块图层已有轮廓）
      root.L.polyline([root.RyMapHost.toDisplay(e.a),root.RyMapHost.toDisplay(e.b)],{color:'#f59e0b',weight:2,interactive:false}).addTo(layer);
    });
  }
  /* [v481 2026-10-16 用户实测] 状态行着色：成功绿 / 失败红，错误不再淹没在小字里 */
  function setStatus(msg,kind){status.textContent=msg;status.style.color=kind==='err'?'#b91c1c':(kind==='ok'?'#166534':'');}
  /* [v482 2026-10-16 用户实测] 角度实时预览：未点「应用」前，把已划好的**分割线**旋转
     （输入角−已存角）度并**逐段裁剪在真实地块边界内**，只改显示不落数据。
     ★ v481 曾把分区格整块刚性旋转——格子的外边缘跟着转出去，看起来像「地块轮廓线也
       转动了」（用户指正：轮廓不应动）。现改为只画分割线：从分区格边里提取分割线
       （共享边/共线段按「方向+偏移」归并），旋转后与地块环求交取弦，越界部分裁掉。
       正式「应用并重新划分」由二级引擎重划并按边界裁剪，本来就是轮廓不动的 ✓。
     数学口径与 rotate() 一致：本地米制投影（x=Δlng·m·cos、y=Δlat·m），正角度从东向北
     （CCW），画前经 RyMapHost.toDisplay 做 GCJ 纠偏。 */
  function drawPreview(p,angle){
    var saved=valid(p&&p.partitionPlan)?p.partitionPlan.angle:0,d=(Number(angle)||0)-saved;
    if(!p||!p.partitions||!p.partitions.length||!isFinite(d)||Math.abs(d)<0.01){draw(p);return;}
    var m=6378137*Math.PI/180,ref=p.partitions[0].latLng[0],co=Math.cos(ref[0]*Math.PI/180);
    function toM(q){return {x:(q[1]-ref[1])*m*co,y:(q[0]-ref[0])*m};}
    function toLLm(pt){return [ref[0]+pt.y/m,ref[1]+pt.x/(m*co)];}
    /* 地块环（真实边界，永不旋转）：单块用 polyLatLng；成组用各成员环 */
    var rings=[];
    if(p.merged&&Array.isArray(p.polyLatLngSet))p.polyLatLngSet.forEach(r=>{if(r&&r.length>=3)rings.push(r.map(toM));});
    else if(p.merged&&Array.isArray(p.subPlots))p.subPlots.forEach(s=>{var r=s&&s.polyLatLng;if(r&&r.length>=3)rings.push(r.map(toM));});
    else if(p.polyLatLng&&p.polyLatLng.length>=3)rings.push(p.polyLatLng.map(toM));
    if(!rings.length){draw(p);return;}
    var mnx=1/0,mxx=-1/0,mny=1/0,mxy=-1/0;
    rings.forEach(r=>r.forEach(q=>{if(q.x<mnx)mnx=q.x;if(q.x>mxx)mxx=q.x;if(q.y<mny)mny=q.y;if(q.y>mxy)mxy=q.y;}));
    var cx=(mnx+mxx)/2,cy=(mny+mxy)/2,r=d*Math.PI/180,a=Math.cos(r),b=Math.sin(r);
    function rot(pt){var x=pt.x-cx,y=pt.y-cy;return {x:cx+x*a-y*b,y:cy+x*b+y*a};}
    /* 从分区格边提取分割线：已存格子在「已存角」坐标系里，边方向只有两组（u=分割方向、v=垂直），
       按（方向组+法向偏移）归并共线段；相邻格共享边偏移恒等 ⇒ 天然去重。 */
    var sa=saved*Math.PI/180,ua={x:Math.cos(sa),y:Math.sin(sa)},va={x:-Math.sin(sa),y:Math.cos(sa)},lines={};
    p.partitions.forEach(z=>{
      if(!z.latLng||z.latLng.length<3)return;
      var pts=z.latLng.map(toM);
      for(var i=0;i<pts.length;i++){
        var P1=pts[i],P2=pts[(i+1)%pts.length],wX=P2.x-P1.x,wY=P2.y-P1.y;
        var len=Math.sqrt(wX*wX+wY*wY);
        if(len<0.05)continue;
        /* [v486] 只收**真正平行于分割方向**的边（±2.5°内）——不规则地块的格子被边界裁剪后
           带有「沿地块边界走」的跟随边，方向任意；v483 曾把它们也当分割线并按边自身方向
           延伸 ⇒ 边界被当成一堆旋转线画出（用户截图里的放射状分区混乱即此）。 */
        var du=(wX*ua.x+wY*ua.y)/len,dv=(wX*va.x+wY*va.y)/len,alongU,dir;
        if(Math.abs(du)>=0.999){alongU=true;dir=ua;}
        else if(Math.abs(dv)>=0.999){alongU=false;dir=va;}
        else continue;
        var n=alongU?va:ua,off=Math.round((P1.x*n.x+P1.y*n.y)*10)/10,k=(alongU?'u':'v')+off,g=lines[k];
        var t1=P1.x*dir.x+P1.y*dir.y,t2=P2.x*dir.x+P2.y*dir.y;
        if(!g)lines[k]={dir:dir,minP:P1,maxP:P2,minT:Math.min(t1,t2),maxT:Math.max(t1,t2)};
        else{
          if(t1<g.minT){g.minT=t1;g.minP=P1;} if(t2>g.maxT){g.maxT=t2;g.maxP=P2;}
          if(t2<g.minT){g.minT=t2;g.minP=P2;} if(t1>g.maxT){g.maxT=t1;g.maxP=P1;}
        }
      }
    });
    /* 线段几何：求交、环内判断、取弦 */
    function segInt(A,B,C,D2){var rX=B.x-A.x,rY=B.y-A.y,sX=D2.x-C.x,sY=D2.y-C.y,den=rX*sY-rY*sX;if(Math.abs(den)<1e-9)return null;var t=((C.x-A.x)*sY-(C.y-A.y)*sX)/den;if(t<0||t>1)return null;return t;}
    function inRing(pt,ring){var inside=false;for(var i=0,j=ring.length-1;i<ring.length;j=i++){var xi=ring[i].x,yi=ring[i].y,xj=ring[j].x,yj=ring[j].y;if(((yi>pt.y)!==(yj>pt.y))&&(pt.x<(xj-xi)*(pt.y-yi)/(yj-yi)+xi))inside=!inside;}return inside;}
    layer.clearLayers();
    var style={color:'#f59e0b',weight:2,interactive:false},BIG=3000;
    Object.keys(lines).forEach(function(k){
      var L=lines[k];
      /* [v486] 延伸方向恒用分割方向 dir（v483 曾用 maxP−minP——混入边界跟随边时会偏出分割方向） */
      var A=rot({x:L.minP.x-L.dir.x*BIG,y:L.minP.y-L.dir.y*BIG}),B=rot({x:L.maxP.x+L.dir.x*BIG,y:L.maxP.y+L.dir.y*BIG});
      rings.forEach(function(ring){
        var ts=[];
        for(var i=0,j=ring.length-1;i<ring.length;j=i++){var t=segInt(A,B,ring[j],ring[i]);if(t!=null)ts.push(t);}
        if(!ts.length)return;
        ts.sort(function(x,y){return x-y;});
        for(var i2=0;i2+1<ts.length;i2++){
          var t1=ts[i2],t2=ts[i2+1];if(t2-t1<1e-6)continue;
          var mid={x:A.x+(B.x-A.x)*(t1+t2)/2,y:A.y+(B.y-A.y)*(t1+t2)/2};
          if(inRing(mid,ring))root.L.polyline([toLLm({x:A.x+(B.x-A.x)*t1,y:A.y+(B.y-A.y)*t1}),toLLm({x:A.x+(B.x-A.x)*t2,y:A.y+(B.y-A.y)*t2})].map(q=>root.RyMapHost.toDisplay(q)),style).addTo(layer);
        }
      });
    });
  }
  function refresh(){var old=select.value,list=library().filter(p=>!p.mergedInto&&p.polyLatLng&&p.polyLatLng.length>=3);select.innerHTML='';list.forEach(p=>{var o=root.document.createElement('option');o.value=p.id;o.textContent=p.name||p.id;select.appendChild(o);});if(list.some(p=>p.id===old))select.value=old;var p=current();input.value=p&&valid(p.partitionPlan)?p.partitionPlan.angle.toFixed(2):'0';draw(p);}
  select.onchange=function(){var p=current();input.value=p&&valid(p.partitionPlan)?p.partitionPlan.angle.toFixed(2):'0';draw(p);setStatus('正角度为从东向北旋转；真实地块边界不变。');};
  /* [v481] ±1° 与手动输入都实时转动分区线（预览），点「应用并重新划分」才真正重划 */
  box.querySelector('[data-angle-minus]').onclick=()=>{input.value=Math.max(-180,Number(input.value)-1);drawPreview(current(),Number(input.value));};
  box.querySelector('[data-angle-plus]').onclick=()=>{input.value=Math.min(180,Number(input.value)+1);drawPreview(current(),Number(input.value));};
  input.addEventListener('input',function(){drawPreview(current(),Number(input.value));});
  async function engine(){if(!iframe){iframe=root.document.createElement('iframe');iframe.src='index.html?partitionPreview=1';iframe.title='分区计算';iframe.setAttribute('aria-hidden','true');iframe.style.cssText='position:fixed;left:-10000px;width:1280px;height:900px;border:0';root.document.body.appendChild(iframe);}var start=Date.now();while(!iframe.contentWindow.RyMapPartition||!iframe.contentWindow.RunyeBridge||!iframe.contentWindow.runyeApplyMapPayload){if(Date.now()-start>20000)throw new Error('二级分区引擎加载超时');await new Promise(r=>setTimeout(r,100));}return iframe.contentWindow;}
  /* [v481] 应用逻辑抽成具名函数：send 未应用时自动先走一遍，成功才回二级 */
  var applyBtn=box.querySelector('[data-angle-apply]');
  async function applyNow(){if(busy)return false;var p=current(),angle=Number(input.value);if(!p||input.value.trim()===''||!Number.isFinite(angle)||angle<-180||angle>180){setStatus('请选择地块，角度范围为 −180° 至 180°。','err');return false;}busy=true;applyBtn.disabled=true;setStatus('正在按二级规则重新划分…');try{var payload=root.RyMapHost.payload(p),w=await engine(),result=w.RyMapPartition.preview(payload,angle);var state=readLibrary();if(!state.ok)throw new Error('地块库读取失败：'+state.error);var matches=state.plots.filter(function(q){return q&&q.id===p.id;});var live=matches.length===1?matches[0]:null;if(!result.partitions.length)throw new Error('未生成有效分区，请检查地块和分区参数');if(!live||geometry(live)!==geometry(p)||select.value!==p.id)throw new Error('地块已切换或编号重复，请重试');live.partitionPlan=result.plan;live.partitions=result.partitions;var saved=plotStore().replace(state.plots,state.revision);if(!saved.ok)throw new Error('地块库保存失败：'+saved.error);var net=root.RyIrrigationDataStore.readNetworkLayout();if(net&&(net.plotId===p.id||p.id==='auto-current'&&p.designPlotId===net.plotId)){net.partitionPlan=result.plan;net.partitions=result.partitions;net.segments=[];net.dripTapes=[];net.valves=[];net.sourcePos=null;net.needsReplan=true;root.RyIrrigationDataStore.writeNetworkLayout(net);root.RyMapHost.refresh();}draw(live);setStatus('已重新划分 '+result.partitions.length+' 个区域；旧管路需回二级重新规划。','ok');return true;}catch(e){setStatus('未应用：'+e.message,'err');return false;}finally{busy=false;applyBtn.disabled=false;}}
  applyBtn.onclick=applyNow;
  box.querySelector('[data-angle-send]').onclick=async function(){var p=current();if(!p||busy)return;var saved=valid(p.partitionPlan)?p.partitionPlan.angle:0;if(input.value.trim()===''||!Number.isFinite(Number(input.value))){setStatus('请先填写 −180° 至 180° 之间的角度。','err');return;}
   /* [v481] 旧版角度未应用时在这里**静默拒绝**（只有状态行小字，用户看不到 ⇒ 以为
      「调整角度后回传不了地块分区页」）。现改为：自动先「应用并重新划分」，
      成功后才回二级；失败则停在地图页并显示红色错误。 */
   if(Math.abs(Number(input.value)-saved)>0.006){var ok=await applyNow();p=current();if(!p)return;saved=valid(p.partitionPlan)?p.partitionPlan.angle:0;if(!ok||Math.abs(Number(input.value)-saved)>0.006)return;}
   root.RyMapHost.send(p,this);};
  root.addEventListener('storage',refresh);root.addEventListener('runye-plots-updated',refresh);refresh();return{refresh:refresh};
 }
 root.RyMapPartition={orient:orient,center:center,valid:valid,restore:restore,capture:capture,preview:preview,attach:attach};
})(typeof window!=='undefined'?window:globalThis);
