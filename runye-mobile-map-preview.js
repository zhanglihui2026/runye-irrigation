(function(){
 'use strict';
 var $=function(id){return document.getElementById(id);};
 var map=null, base='satellite', mode='draw', panel=null, drawing=false, points=[], plotName='新建地块',groups=2;
 var visibility={boundary:true,second:true,third:true,branch:true}, layers={};
 var toastTimer,partition=null,drawBackup=null,draftGuide=null;
 var settingsKey='runye_mobile_settings_v1';
 var settingRules={fontMain:[14,10,24],fontMenu:[11,9,20],fontTitle:[18,14,26],tapeSpacing:[0.4,0.1],emitterSpacing:[0.3,0.05],emitterFlow:[0.8,0.1],tapeLength:[100,10],zoneArea:[18,0.1],partitionAngle:[0,0,180],pumpLift:[5,0],terrainRise:[5,0],sourceDistance:[0,0],inletPressure:[1,0]};
 var settings={};Object.keys(settingRules).forEach(function(key){settings[key]=settingRules[key][0];});
 function validSetting(key,value){var rule=settingRules[key];return typeof value==='number'&&Number.isFinite(value)&&value>=rule[1]&&(rule.length<3||value<=rule[2])&&(!/^font|partitionAngle$/.test(key)||Number.isInteger(value));}
 try{var saved=JSON.parse(localStorage.getItem(settingsKey));if(saved&&saved.version===1&&saved.values)Object.keys(settingRules).forEach(function(key){if(validSetting(key,saved.values[key]))settings[key]=saved.values[key];});}catch(e){}
 function fillSettings(){document.querySelectorAll('[data-setting]').forEach(function(input){input.value=settings[input.dataset.setting];});$('settingsStatus').textContent='';}
 function applySettings(){
  var style=document.documentElement.style;style.setProperty('--ry-font-main',settings.fontMain+'px');style.setProperty('--ry-font-menu',settings.fontMenu+'px');style.setProperty('--ry-font-title',settings.fontTitle+'px');
  ['tapeSpacing','emitterSpacing','emitterFlow','tapeLength','zoneArea','partitionAngle'].forEach(function(key){$(key).value=settings[key];});$('angleSlider').value=settings.partitionAngle;
  $('hydraulicSummary').textContent='供水初始值：提升 '+settings.pumpLift+' m · 高差 '+settings.terrainRise+' m · 水源距离 '+settings.sourceDistance+' m · 入口 '+settings.inletPressure+' bar';
  renderLayers();
 }
 $('settingsForm').onsubmit=function(event){
  event.preventDefault();var next={},invalid=false;
  document.querySelectorAll('[data-setting]').forEach(function(input){var key=input.dataset.setting,value=input.value.trim()===''?NaN:Number(input.value);if(!validSetting(key,value))invalid=true;next[key]=value;});
  if(invalid){$('settingsStatus').textContent='请检查参数范围，字体及角度请输入整数。';return;}
  settings=next;applySettings();
  try{localStorage.setItem(settingsKey,JSON.stringify({version:1,values:settings}));$('settingsStatus').textContent='已保存并应用，下次打开自动使用这些初始值。';}catch(e){$('settingsStatus').textContent='已应用到当前页面；浏览器不允许保存，关闭后可能丢失。';}
 };
 $('resetSettings').onclick=function(){document.querySelectorAll('[data-setting]').forEach(function(input){input.value=settingRules[input.dataset.setting][0];});$('settingsStatus').textContent='已填入默认值，点击“保存并应用”后生效。';};
 function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(function(){$('toast').hidden=true;},2600);}
 function openPanel(name){
  panel=name;$('toolSheet').hidden=false;document.body.classList.add('sheet-open');
  document.querySelectorAll('[data-content]').forEach(function(el){el.hidden=el.dataset.content!==name;});
  var titles={draw:['地块工具','描绘与导入'],second:['二级管线规划','参数与分区图层'],third:['三级管线规划','联合灌溉与管路图层'],layers:['同一底图 · 多层叠加','地图与图层'],more:['润野灌溉','更多工具'],settings:['偏好与初始值','设置']};
  $('sheetKicker').textContent=titles[name][0];$('sheetTitle').textContent=titles[name][1];
  if(/^(draw|second|third)$/.test(name)){
   mode=name;
  }
  document.querySelectorAll('.bottom-tools button').forEach(function(b){b.classList.toggle('active',b.dataset.panel===name);});
  if(name==='settings')fillSettings();syncSummary();renderLayers();
 }
 function closePanel(){panel=null;$('toolSheet').hidden=true;document.body.classList.remove('sheet-open');document.querySelectorAll('.bottom-tools button').forEach(function(b){b.classList.toggle('active',b.dataset.panel===mode);});}
 document.querySelectorAll('[data-panel]').forEach(function(button){button.addEventListener('click',function(){if(panel===button.dataset.panel)closePanel();else openPanel(button.dataset.panel);});});
 $('closeSheet').onclick=closePanel;
 function importFile(){$('importFile').click();}
 ['importButton','moreImport'].forEach(function(id){$(id).onclick=importFile;});
 function gcj(p){var q=RunyeGeo.wgs2gcj(p[0],p[1]);return [q.lat,q.lng];}
 function display(p){if(base==='satellite')return p;var q=RunyeGeo.gcj2wgs(p[0],p[1]);return [q.lat,q.lng];}
 function fromDisplay(p){return base==='satellite'?[p.lat,p.lng]:gcj([p.lat,p.lng]);}
 function area(){
  if(points.length<3)return 0;
  var lat=points.reduce(function(n,p){return n+p[0];},0)/points.length, factor=6378137*Math.PI/180;
  var ring=points.map(function(p){return [(p[1]-points[0][1])*factor*Math.cos(lat*Math.PI/180),(p[0]-points[0][0])*factor];}),sum=0;
  ring.forEach(function(p,i){var q=ring[(i+1)%ring.length];sum+=p[0]*q[1]-q[0]*p[1];});return Math.abs(sum)/2;
 }
 function syncSummary(){
  var a=area(),mu=(a/666.67).toFixed(2);
  $('selectionCard').hidden=points.length<3||drawing;
  $('plotArea').innerHTML=mu+' <small>亩</small>';$('plotName').textContent=plotName;
  $('plotStatus').textContent=mode==='draw'?'边界已闭合':mode==='second'?'二级分区 · '+(partition?partition.zones.length:0)+' 区':'三级管路 · 界面示意';
  $('nextStage').textContent=mode==='draw'?'二级规划 →':mode==='second'?'三级规划 →':'规划工具 ↑';
  document.querySelectorAll('[data-summary-area]').forEach(function(el){el.textContent=points.length>=3?'当前地块 · 约 '+mu+' 亩':'尚未选择地块';});
  $('drawCount').textContent=points.length?'已添加 '+points.length+' 个点'+(points.length>=3?' · 约 '+mu+' 亩 · 回到起点点击确定完成':' · 移动地图后点击确定继续'):'移动地图对准黄色光标，再点击确定';
  $('undoPoint').disabled=!points.length;
  $('confirmPoint').classList.toggle('can-close',canCloseDrawing());
 }
 function canCloseDrawing(){return !!(drawing&&map&&points.length>=3&&map.latLngToContainerPoint(display(points[0])).distanceTo(map.latLngToContainerPoint(map.getCenter()))<=12);}
 function updateDraftGuide(){
  if(!draftGuide)return;draftGuide.clearLayers();if(!drawing||!points.length)return;
  var cursor=fromDisplay(map.getCenter());
  L.polyline([display(points[points.length-1]),display(cursor)],{color:'#ffe000',weight:2,dashArray:'5,5',interactive:false}).addTo(draftGuide);
  if(points.length>=3)L.circleMarker(display(points[0]),{radius:12,color:canCloseDrawing()?'#59d58c':'#ffe000',weight:2,fillOpacity:0,interactive:false}).addTo(draftGuide);
 }
 function addLines(group,segs,style){segs.forEach(function(s){L.polyline(s.map(display),Object.assign({interactive:false},style)).addTo(group);});}
 function renderLayers(){
  if(!map)return;
  Object.keys(layers).forEach(function(k){layers[k].clearLayers();if(map.hasLayer(layers[k]))map.removeLayer(layers[k]);});
  if(points.length){
   if(points.length>=3&&!drawing)L.polygon(points.map(display),{color:'#ffad2b',weight:2,fillColor:'#f9d967',fillOpacity:.09,interactive:false}).addTo(layers.boundary);
   else L.polyline(points.map(display),{color:'#ffad2b',weight:2,interactive:false}).addTo(layers.boundary);
   if(drawing)points.forEach(function(p){L.marker(display(p),{icon:L.divIcon({className:'vertex',iconSize:[9,9],iconAnchor:[4.5,4.5]}),interactive:false}).addTo(layers.boundary);});
  }
  partition=null;
  try{
   partition=RyMobilePartition.build(points,Number($('tapeLength').value),Number($('zoneArea').value),Number($('partitionAngle').value));
   $('partitionDimensions').textContent='标准分区：'+partition.fixed.toFixed(1)+' × '+partition.derived.toFixed(2)+' m（固定边 = 单边长度 × 2）';
   $('partitionResult').textContent=points.length>=3?'共 '+partition.zones.length+' 区 · 裁切后实际面积见地图标签':'绘制或导入地块后自动划分';
  }catch(e){$('partitionDimensions').textContent='';$('partitionResult').textContent=e.message;}
  if(partition&&points.length>=3&&mode!=='draw'){
   addLines(layers.second,partition.lines,{color:'#f1d260',weight:1.5,dashArray:'5,4'});
   partition.zones.forEach(function(zone,i){L.marker(display(zone.label),{icon:L.divIcon({className:'',html:'',iconSize:[0,0]}),interactive:false}).bindTooltip((i+1)+'区 · '+zone.mu.toFixed(2)+'亩',{permanent:true,direction:'center',className:'zone-label'}).addTo(layers.second);});
   addLines(layers.third,partition.main,{color:'#185fa5',weight:3});
   partition.zones.forEach(function(zone){addLines(layers.branch,zone.branch,{color:'#16a34a',weight:2});if(mode==='third')addLines(layers.branch,zone.subbranch,{color:'#54a9e8',weight:1.5});});
  }
  Object.keys(layers).forEach(function(k){if(visibility[k]||(drawing&&k==='boundary'))layers[k].addTo(map);});updateDraftGuide();syncSummary();
 }
 function fit(){if(map&&points.length)map.fitBounds(L.latLngBounds(points.map(display)),{paddingTopLeft:[75,110],paddingBottomRight:[70,190],maxZoom:18});else if(map)map.setView([18.2528,109.5119],15);}
 function setDrawing(on){drawing=on;document.body.classList.toggle('drawing',on);$('drawStrip').hidden=!on;if(map)map.dragging.enable();syncSummary();renderLayers();}
 $('startDrawing').onclick=function(){if(!map){toast('地图尚未加载，请检查网络');return;}drawBackup={points:points.map(function(p){return p.slice();}),plotName:plotName,mode:mode};mode='draw';points=[];plotName='新建地块';closePanel();setDrawing(true);toast('移动地图对准黄色光标，点击确定添加点；回到起点确定完成');};
 $('undoPoint').onclick=function(){if(!drawing)return;points.pop();renderLayers();};
 $('confirmPoint').onclick=function(){
  if(!drawing||!map)return;
  map.stop();
  if(canCloseDrawing()){
   if(area()<1){toast('地块面积过小或边界未形成有效面积，请返回调整点位');return;}
   drawBackup=null;setDrawing(false);toast('地块已闭合，可进入二级规划');return;
  }
  var point=fromDisplay(map.getCenter());
  if(points.some(function(p){return map.distance(display(point),display(p))<.1;})){toast('请移动地图选择不同的边界点，至少需要三个点');return;}
  points.push(point);renderLayers();
 };
 $('cancelDrawing').onclick=function(){if(!drawing)return;if(drawBackup){points=drawBackup.points;plotName=drawBackup.plotName;mode=drawBackup.mode;}else points=[];drawBackup=null;setDrawing(false);toast('已取消本次绘制');};
 $('nextStage').onclick=function(){openPanel(mode==='draw'?'second':mode==='second'?'third':'third');};
 $('previewSecond').onclick=function(){if(points.length<3){toast('请先绘制地块或加载示例');return;}mode='second';renderLayers();closePanel();};
 $('toThird').onclick=function(){if(points.length<3){toast('请先选择地块');return;}openPanel('third');};
 $('backSecond').onclick=function(){openPanel('second');};
 $('previewThird').onclick=function(){if(points.length<3){toast('请先选择地块');return;}mode='third';renderLayers();closePanel();};
 function demo(){
  if(!map){toast('地图尚未加载，请检查网络');return;}
  var center=[18.3651,109.1762],lat=center[0],factor=6378137*Math.PI/180;
  points=[[-150,-90],[150,-90],[150,90],[-150,90]].map(function(p){return [lat+p[1]/factor,center[1]+p[0]/(factor*Math.cos(lat*Math.PI/180))];});
  plotName='示例地块';mode='draw';setDrawing(false);closePanel();fit();toast('示例已加载，可展开二级或三级工具条');
 }
 $('demoButton').onclick=demo;$('moreDemo').onclick=demo;
 $('clearPlot').onclick=function(){points=[];setDrawing(false);closePanel();toast('当前预览地块已清除');};
 $('importFile').onchange=function(){
  var file=this.files[0];if(!file)return;
  file.text().then(function(text){
   var arr=/\.kml$|\.ovkml$/i.test(file.name)||/<kml[\s>]/i.test(text.slice(0,800))?RunyeMapEnhance.parse.kml(text):RunyeMapEnhance.parse.geoJSON(text);
   if(!arr||!arr.length)throw new Error('没有找到有效地块边界，请选择奥维导出的 KML 或 GeoJSON。');
   points=arr[0].polyLatLng.map(gcj);plotName=arr[0].name||file.name;mode='draw';setDrawing(false);closePanel();fit();toast(arr.length>1?'已预览第一个地块，共导入 '+arr.length+' 个':'地块轨迹已导入');
  }).catch(function(e){toast(e.message);});this.value='';
 };
 document.querySelectorAll('[data-layer]').forEach(function(input){input.onchange=function(){visibility[input.dataset.layer]=input.checked;document.querySelectorAll('[data-layer="'+input.dataset.layer+'"]').forEach(function(other){other.checked=input.checked;});renderLayers();};});
 document.querySelectorAll('[data-group]').forEach(function(b){b.onclick=function(){groups=Number(b.dataset.group);document.querySelectorAll('[data-group]').forEach(function(other){other.classList.toggle('active',other===b);});renderLayers();};});
 ['zoneArea','tapeLength'].forEach(function(id){$(id).oninput=renderLayers;});
 function setAngle(value){var a=Math.max(0,Math.min(180,Number(value)||0));$('partitionAngle').value=a;$('angleSlider').value=a;renderLayers();}
 $('partitionAngle').oninput=function(){setAngle(this.value);};$('angleSlider').oninput=function(){setAngle(this.value);};
 $('angleMinus').onclick=function(){setAngle(Number($('partitionAngle').value)-1);};$('anglePlus').onclick=function(){setAngle(Number($('partitionAngle').value)+1);};
 $('searchForm').onsubmit=function(e){e.preventDefault();var m=$('searchInput').value.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,，\s]\s*(-?\d+(?:\.\d+)?)$/);if(m&&map&&Math.abs(Number(m[1]))<=90&&Math.abs(Number(m[2]))<=180){var p=gcj([Number(m[1]),Number(m[2])]);map.setView(display(p),16);toast('已定位到输入坐标');}else toast('界面预览可输入经纬度，如 18.3651,109.1762');};
 $('fitButton').onclick=fit;$('zoomIn').onclick=function(){if(map)map.zoomIn();};$('zoomOut').onclick=function(){if(map)map.zoomOut();};
 applySettings();
 if(typeof L==='undefined'){$('mapFailure').hidden=false;return;}
 map=L.map('map',{center:[18.2528,109.5119],zoom:15,zoomControl:false,doubleClickZoom:false});
 var satellite=L.tileLayer('https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',{subdomains:'1234',maxZoom:19,attribution:'© 高德地图'});
 var street=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{subdomains:'abc',maxZoom:19,attribution:'© OpenStreetMap'});
 satellite.addTo(map);L.control.scale({imperial:false,position:'bottomleft'}).addTo(map);
 Object.keys(visibility).forEach(function(k){layers[k]=L.layerGroup();});
 draftGuide=L.layerGroup().addTo(map);
 map.on('move zoom',function(){if(drawing){updateDraftGuide();syncSummary();}});
 map.on('moveend',function(){var p=fromDisplay(map.getCenter());$('coordinates').textContent=p[0].toFixed(5)+'°N '+p[1].toFixed(5)+'°E';});
 document.querySelectorAll('[data-base]').forEach(function(b){b.onclick=function(){if(base===b.dataset.base)return;var p=fromDisplay(map.getCenter()),zoom=map.getZoom();base=b.dataset.base;map.removeLayer(base==='satellite'?street:satellite);(base==='satellite'?satellite:street).addTo(map);map.setView(display(p),zoom);$('mapSource').textContent=base==='satellite'?'高德卫星':'OpenStreetMap';document.querySelectorAll('[data-base]').forEach(function(other){other.classList.toggle('active',other===b);});renderLayers();};});
 window.RyMobileMapPreview={getMap:function(){return map;},getState:function(){return {mode:mode,panel:panel,drawing:drawing,points:points.map(function(p){return p.slice();}),partition:partition,settings:Object.assign({},settings),visibility:Object.assign({},visibility),layers:Object.keys(layers).reduce(function(r,k){r[k]=layers[k].getLayers().length;return r;},{})};}};
 function openLinkedStage(){var stage=location.hash.slice(1);if(stage==='second'||stage==='third')openPanel(stage);}
 window.addEventListener('hashchange',openLinkedStage);openLinkedStage();syncSummary();
})();
