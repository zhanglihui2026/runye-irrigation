const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const ringA = [[18.2,109.5],[18.2,109.501],[18.201,109.501]];
const ringB = [[18.4,109.7],[18.4,109.701],[18.401,109.701]];
const plot = (id,ring) => ({id,name:id,polyLatLng:ring,sqm:1000,mu:1.5,source:'map',ts:10,poly:ring.map((_,i)=>({x:i,y:i}))});
function fixture(plots) {
  const data = new Map([['runye_plot_library',JSON.stringify(plots)]]);
  const calls = {jumps:[],alerts:[],saves:0,projectSaves:0,loads:0,diagrams:0,refreshes:0,initialPipes:0,networks:0,initialNetworkOptions:null,initialPipesReady:false};
  const list = {children:[],set innerHTML(v){this.children=[]},appendChild(x){this.children.push(x)}};
  const document = {
    readyState:'loading',addEventListener(type,fn){this.onready=fn},
    getElementById(id){return id==='plotLibList'?list:null},
    createElement(){const buttons={};return {className:'',querySelector(sel){return buttons[sel]||(buttons[sel]={addEventListener(type,fn){this.click=fn}})}}}
  };
  const location={search:'',hash:'',pathname:'/index.html'};
  const ctx={document,location,URLSearchParams,URL,console,Date,Math,JSON,
    history:{state:null,replaceState(state,title,url){const next=new URL(url,'https://local.test/');location.search=next.search;location.hash=next.hash;location.pathname=next.pathname;}},
    localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},
    alert:m=>calls.alerts.push(m),updatePlan(){},
    ppLoadPolygon(){calls.loads++},ppGenerateDiagram(){calls.diagrams++},
    tlAutoGenerate(options){calls.networks++;calls.initialNetworkOptions=options;},
    runyeSaveProject(){calls.projectSaves++;return true;},
    ryJumpToSection:id=>calls.jumps.push(id),runyeSetCurrentPlot:id=>{calls.saves++},
    runyeSaveCurrentPlotBeforeSwitch(){return true},
    RyPlotPartitionEditor:{ensureInitialPipes(){calls.initialPipes++;return calls.initialPipesReady}},
    RyDrawingWorkspace:{refreshPlot(){calls.refreshes++;assert.equal(calls.jumps.at(-1),'pipePlanSection','refresh happens after the viewport is visible')}},
  };
  ctx.window=ctx;vm.createContext(ctx);
  for(const f of ['core/plot-library-store.js','core/measured-area-bridge-store.js','mod/inline-13.js','mod/inline-16.js'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx,{filename:f});
  return {ctx,data,calls,list,document};
}
const a=plot('a',ringA), b=plot('b',ringB);
const f=fixture([a,b]);
const original=f.data.get('runye_plot_library');
f.ctx.__ryLazyReplay=true;
const geometryKey=JSON.stringify([ringB]);
const transferId=f.ctx.RyMeasuredAreaBridgeStore.write({ryPlotRef:{id:'b',geometryKey,areaM2:1000}});
f.ctx.location.search='?ryPlotTransfer='+encodeURIComponent(transferId);
assert.equal(f.ctx.runyeApplyMapPayload(),true);
assert.equal(f.ctx.currentPlotId,'b');
assert.equal(f.data.get('runye_plot_library'),original,'map source must not be overwritten');
assert.equal(f.data.has(f.ctx.RyMeasuredAreaBridgeStore.keyPrefix+transferId),false,'consumed reference');
assert.equal(f.ctx.location.search,'','successful receive removes its URL token');
assert.equal(f.calls.jumps.at(-1),'pipePlanSection');
assert.equal(f.calls.loads>0 && f.calls.diagrams>0,true);
assert.equal(f.calls.initialPipes,1,'map handoff checks whether the new plot needs its first default L2 pipe design');
assert.equal(f.ctx.__ryLazyReplay,false,'incoming map geometry cancels outgoing deferred generation');
assert.equal(f.calls.refreshes,1,'map handoff refreshes and fits the single drawing viewport');
const firstDesign=fixture([a]);
firstDesign.calls.initialPipesReady=true;
const firstId=firstDesign.ctx.RyMeasuredAreaBridgeStore.write({ryPlotRef:{id:'a',geometryKey:JSON.stringify([ringA]),areaM2:1000}});
firstDesign.ctx.location.search='?ryPlotTransfer='+encodeURIComponent(firstId);
assert.equal(firstDesign.ctx.runyeApplyMapPayload(),true,'a valid new plot handoff completes');
assert.equal(firstDesign.calls.networks,1,'first-use default pipes also build the shared level-three pipe layer');
assert.equal(firstDesign.calls.initialNetworkOptions.stay,true,'initial generation keeps the user in partition view');
assert.equal(firstDesign.calls.projectSaves,1,'both levels are archived after initial generation');
const missingRef=fixture([a]);
const stalePayload=JSON.stringify({ryPlotRef:{id:'missing',geometryKey:JSON.stringify([ringB]),areaM2:1000}});
const staleId=missingRef.ctx.RyMeasuredAreaBridgeStore.write(JSON.parse(stalePayload));
missingRef.ctx.location.search='?ryPlotTransfer='+encodeURIComponent(staleId);
assert.equal(missingRef.ctx.runyeApplyMapPayload(),false,'stale map references fail without importing');
assert.equal(missingRef.ctx.RyMeasuredAreaBridgeStore.readRaw(staleId),stalePayload,'failed reference remains available for recovery');
assert.equal(missingRef.ctx.location.search,'?ryPlotTransfer='+encodeURIComponent(staleId),'failed receive keeps its recovery token');
const startupHash=fixture([a]);
startupHash.ctx.location.hash='#pipePlanSection';
const startupId=startupHash.ctx.RyMeasuredAreaBridgeStore.write({ryPlotRef:{id:'a',geometryKey:JSON.stringify([ringA]),areaM2:1000}});
startupHash.ctx.location.search='?ryPlotTransfer='+encodeURIComponent(startupId);
startupHash.document.onready();
assert.equal(startupHash.ctx.currentPlotId,'a','startup hash still consumes the map reference');
assert.equal(startupHash.calls.jumps.length,1,'receiver performs the initial page switch once');
assert.equal(startupHash.ctx.__rySkipNextLinkedSectionRoute,'pipePlanSection','load hash route is suppressed after receiver navigation');
assert.match(fs.readFileSync(path.join(root,'runye-nav.js'),'utf8'),/__rySkipNextLinkedSectionRoute\s*===\s*hash[\s\S]*?__rySkipNextLinkedSectionRoute\s*=\s*null[\s\S]*?return;/,'navigation consumes the one-shot initial hash marker');
const previewTransfer=fixture([a]);
const previewId=previewTransfer.ctx.RyMeasuredAreaBridgeStore.write({ryPlotRef:{id:'a',geometryKey:JSON.stringify([ringA]),areaM2:1000}});
previewTransfer.ctx.location.search='?partitionPreview=1&ryPlotTransfer='+encodeURIComponent(previewId);
assert.equal(previewTransfer.ctx.runyeApplyMapPayload(),true,'a targeted handoff takes priority over partition preview mode');
assert.equal(previewTransfer.ctx.location.search,'?partitionPreview=1','successful receive removes only its own query token');
const selected=f.list.children[0];
selected.querySelector('[data-act="current"]').click();
assert.equal(f.ctx.currentPlotId,'a','drawing library selects clicked plot');
assert.equal(f.calls.jumps.at(-1),'pipePlanSection');
const corrupt=fixture([a]);
corrupt.data.set('runye_plot_library','{bad json');
corrupt.ctx.measuredArea=1000;
assert.throws(()=>corrupt.ctx.runyePersistMeasuredPlot({plotId:'a'}),/地块库读取失败/);
assert.equal(corrupt.data.get('runye_plot_library'),'{bad json','a failed read must not replace corrupt stored bytes');
const dup=fixture([plot('same',ringA),plot('same',ringB)]);
dup.list.children[1].querySelector('[data-act="current"]').click();
assert.equal(dup.ctx.currentPlotId,null,'duplicate id must not pick first row');
assert.equal(dup.calls.alerts.length>0,true);
const mapSrc=fs.readFileSync(path.join(root,'mod/online-map.js'),'utf8');
const irrigationStoreSrc=fs.readFileSync(path.join(root,'core/irrigation-data-store.js'),'utf8');
assert.match(irrigationStoreSrc,/readRawNetworkLayout:\s*function\s*\(plotId\)/,'the irrigation store exports the raw scoped snapshot API');
assert.match(mapSrc,/typeof irrigationStore\.readRawNetworkLayout!=='function'/,'map project import must check the exported raw snapshot API');
assert.doesNotMatch(mapSrc,/typeof irrigationStore\.readNetworkLayoutRaw!=='function'/,'map project import must not check a nonexistent API name');
assert.match(mapSrc,/var viewKey='runye_map_view';[\s\S]*?localStorage\.removeItem\(viewKey\);else localStorage\.setItem\(viewKey,JSON\.stringify\(d\.view\)\)/,'project import must consistently write or clear the exported map view key');
assert.doesNotMatch(mapSrc,/keys\[1\]/,'project import must not write the map view through an undefined key');
const start=mapSrc.indexOf('function sendPlotToDesign(plot, btnEl){');
const end=mapSrc.indexOf('// 回传地块绘制',start);
assert.equal(start>=0 && end>start,true);
assert.match(fs.readFileSync(path.join(root,'runye-map-enhance.js'),'utf8'),/opts\.onSendDesign\(p\)/);
const sent=new Map([['runye_plot_library',original]]);
const sentCalls={applied:0,alerts:[],jumps:[],payloads:[],transferIds:[]};
const sender={window:null,document:{getElementById:id=>id==='onlineMapSection'?{}:null},
  location:{search:'',hash:'',pathname:'/index.html'},history:{state:null,
    replaceState(state,title,url){const next=new URL(url,'https://local.test/');sender.location.search=next.search;sender.location.hash=next.hash;sender.location.pathname=next.pathname;},
    pushState(state,title,url){const next=new URL(url,'https://local.test/');sender.location.search=next.search;sender.location.hash=next.hash;sender.location.pathname=next.pathname;}},
  localStorage:{getItem:k=>sent.get(k)||null,setItem:(k,v)=>sent.set(k,v)},
  lsGet:k=>JSON.parse(sent.get(k)||'[]'),setTimeout:fn=>{fn();return 1},
  alert:m=>sentCalls.alerts.push(m),console,JSON,URL,URLSearchParams,Math,Number,String,Date,isFinite};
sender.window=sender;
sender.ryJumpToSection=id=>sentCalls.jumps.push(id);
vm.createContext(sender);
vm.runInContext(fs.readFileSync(path.join(root,'core/measured-area-bridge-store.js'),'utf8'),sender,{filename:'core/measured-area-bridge-store.js'});
sender.runyeApplyMapPayload=id=>{
  sentCalls.applied++; sentCalls.transferIds.push(id);
  const raw=sender.RyMeasuredAreaBridgeStore.readRaw(id);
  sentCalls.payloads.push(JSON.parse(raw));
  sender.RyMeasuredAreaBridgeStore.remove(id);
  sender.ryJumpToSection('pipePlanSection'); return true;
};
vm.runInContext(mapSrc.slice(start,end)+'\nwindow.__send=sendPlotToDesign;',sender);
sender.__send(b,null);
assert.equal(sentCalls.payloads[0].ryPlotRef.id,'b');
assert.ok(sentCalls.transferIds[0]);
assert.equal(sentCalls.applied,1,'same-page transfer must invoke receiver');
assert.equal(sender.location.hash,'#pipePlanSection');
assert.equal(sender.location.search,'','successful same-page transfer clears its URL token');
assert.equal(sentCalls.jumps.length,1,'receiver performs the only same-page navigation');

// Execute the actual per-row arrow handler used by the map's "我的地块" list.
const rowSendStart=mapSrc.indexOf('sd.onclick=function(){',mapSrc.indexOf('function renderMyPlots(){'));
const rowSendEnd=mapSrc.indexOf('\n      };',rowSendStart)+8;
assert.equal(rowSendStart>=0 && rowSendEnd>rowSendStart,true,'map plot-list arrow handler must be present');
sender.p=b; sender.sd={};
vm.runInContext(mapSrc.slice(rowSendStart,rowSendEnd),sender);
sender.sd.onclick.call(sender.sd);
assert.equal(sentCalls.payloads[1].ryPlotRef.id,'b','plot-list arrow sends its own clicked plot');
assert.notEqual(sentCalls.transferIds[1],sentCalls.transferIds[0],'each transfer gets a distinct payload id');
assert.equal(sentCalls.applied,2,'plot-list arrow reaches the map payload receiver');
assert.equal(sentCalls.jumps.length,2,'plot-list arrow navigates only once');

// Execute the callback passed to the right-click popup integration.
const popupCallback=mapSrc.match(/onSendDesign:function\(p\)\{ sendPlotToDesign\(p, document\.getElementById\('btnCopy'\)\); \}/);
assert.ok(popupCallback,'right-click popup callback must route to the shared sender');
sender.popupSend=vm.runInContext('('+popupCallback[0].replace(/^onSendDesign:/,'')+')',sender);
sender.popupSend(b);
assert.equal(sentCalls.payloads[2].ryPlotRef.id,'b','popup sends its own clicked plot');
assert.notEqual(sentCalls.transferIds[2],sentCalls.transferIds[1],'popup transfer gets its own payload id');
assert.equal(sentCalls.applied,3,'right-click popup reaches the map payload receiver');
assert.equal(sentCalls.jumps.length,3,'right-click popup navigates only once');

// The standalone map navigates with its own token; another tab cannot replace that payload.
const externalData=new Map([['runye_plot_library',original]]);
const external={window:null,document:{getElementById:()=>null},location:{search:'',hash:'',pathname:'/runye-map-measure.html',href:''},
  history:{state:null},localStorage:{getItem:k=>externalData.get(k)||null,setItem:(k,v)=>externalData.set(k,v),removeItem:k=>externalData.delete(k)},
  lsGet:k=>JSON.parse(externalData.get(k)||'[]'),setTimeout:fn=>{fn();return 1},alert(){},console,JSON,URL,URLSearchParams,
  Math,Number,String,Date,isFinite};
external.window=external;vm.createContext(external);
vm.runInContext(fs.readFileSync(path.join(root,'core/measured-area-bridge-store.js'),'utf8'),external);
vm.runInContext(mapSrc.slice(start,end)+'\nwindow.__send=sendPlotToDesign;',external);
external.__send(b,null);
const externalUrl=new URL(external.location.href,'https://local.test/');
const externalTransferId=externalUrl.searchParams.get('ryPlotTransfer');
assert.equal(externalUrl.pathname,'/index.html');
assert.ok(externalTransferId,'standalone map URL carries its transfer token');
assert.equal(JSON.parse(external.RyMeasuredAreaBridgeStore.readRaw(externalTransferId)).ryPlotRef.id,'b');
assert.equal(externalData.has('runyeMeasuredArea'),false,'transfer payload is never stored in a shared singleton slot');

const oldTransfers=[...sent.keys()].filter(key=>key.startsWith(sender.RyMeasuredAreaBridgeStore.keyPrefix));
sender.__send({...b,polyLatLng:ringA},null);
assert.deepEqual([...sent.keys()].filter(key=>key.startsWith(sender.RyMeasuredAreaBridgeStore.keyPrefix)),oldTransfers,'stale map popup must not create a transfer');
assert.equal(sentCalls.alerts.length,1);
sent.set('runye_plot_library',JSON.stringify([b,plot('b',ringA)]));
sender.__send(b,null);
assert.deepEqual([...sent.keys()].filter(key=>key.startsWith(sender.RyMeasuredAreaBridgeStore.keyPrefix)),oldTransfers,'duplicate id must not create a transfer');
assert.equal(sentCalls.alerts.length,2);

// Two tabs sharing localStorage read only the transfer addressed by their own URL token.
const sharedTransfers=new Map();
function transferTab(id){
  const tab={window:null,location:{search:'?ryPlotTransfer='+id},localStorage:{getItem:k=>sharedTransfers.get(k)||null,
    setItem:(k,v)=>sharedTransfers.set(k,v),removeItem:k=>sharedTransfers.delete(k)},URLSearchParams,Date,Math,JSON};
  tab.window=tab;vm.createContext(tab);
  vm.runInContext(fs.readFileSync(path.join(root,'core/measured-area-bridge-store.js'),'utf8'),tab);
  return tab;
}
const transferA='transfer-tab-a-1234', transferB='transfer-tab-b-5678';
sharedTransfers.set('runyeMeasuredArea:'+transferA,JSON.stringify({ryPlotRef:{id:'plot-a'}}));
sharedTransfers.set('runyeMeasuredArea:'+transferB,JSON.stringify({ryPlotRef:{id:'plot-b'}}));
assert.equal(transferTab(transferA).RyMeasuredAreaBridgeStore.read().ryPlotRef.id,'plot-a');
assert.equal(transferTab(transferB).RyMeasuredAreaBridgeStore.read().ryPlotRef.id,'plot-b');

// Execute the actual project-import handler and verify its map-view storage key.
function importFixture(initialView) {
  const data = new Map([['runye_plot_library',JSON.stringify([plot('before-import',ringA)])]]);
  if(initialView!==undefined)data.set('runye_map_view',JSON.stringify(initialView));
  const input={files:[],value:''};
  const importCalls={alerts:[],clears:0};
  const document={getElementById(id){
    if(id==='fileProj')return input;
    if(id==='btnClear')return {click(){importCalls.clears++}};
    return null;
  }};
  const ctx={window:null,document,console,Date,Math,JSON,isFinite,
    localStorage:{getItem:k=>data.has(String(k))?data.get(String(k)):null,
      setItem:(k,v)=>data.set(String(k),String(v)),removeItem:k=>data.delete(String(k))},
    sessionStorage:{getItem:()=>null},FileReader:function(){
      this.readAsText=file=>{this.result=file.content;this.onload()};
    },RunyeGeo:require(path.join(root,'runye-geo.js')),
    alert:m=>importCalls.alerts.push(m),setDrawing(){},refreshPlotLibrary(){},
    map:{setView(){}},toDisplay:v=>[v.lat,v.lng]};
  ctx.window=ctx;vm.createContext(ctx);
  for(const file of ['core/plot-library-store.js','core/irrigation-data-store.js'])
    vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
  const handlerStart=mapSrc.indexOf("document.getElementById('fileProj').onchange=function(e){");
  const handlerMarker='\n  };\n\n  renderMyPlots();';
  const handlerEnd=mapSrc.indexOf(handlerMarker,handlerStart);
  assert.equal(handlerStart>=0 && handlerEnd>handlerStart,true,'project import handler must be present');
  vm.runInContext(mapSrc.slice(handlerStart,handlerEnd+5),ctx,{filename:'mod/online-map.js#import-handler'});
  return {ctx,data,input,importCalls,run(content){input.files=[{content}];input.value='selected';input.onchange({target:input})}};
}
const importedView={lat:18.25,lng:109.51,zoom:14};
const importedPlot=id=>({id,name:id,poly:[{x:0,y:0},{x:1,y:0},{x:0,y:1}],sqm:1000,mu:1.5});
const importWithView=importFixture({lat:10,lng:20,zoom:8});
importWithView.run(JSON.stringify({app:'runye-irrigation',version:1,plots:[importedPlot('imported')],network:null,view:importedView}));
assert.equal(importWithView.data.get('runye_map_view'),JSON.stringify(importedView),'project import writes the imported map view under runye_map_view');
assert.equal(importWithView.data.has('undefined'),false,'project import must not create the undefined localStorage key');
assert.equal(importWithView.importCalls.alerts.some(m=>m.indexOf('工程已导入')===0),true,'valid project import completes');
const importWithoutView=importFixture({lat:10,lng:20,zoom:8});
importWithoutView.run(JSON.stringify({app:'runye-irrigation',version:1,plots:[importedPlot('imported-no-view')],network:null,view:null}));
assert.equal(importWithoutView.data.has('runye_map_view'),false,'project without a saved view clears the previous map view');
assert.equal(importWithoutView.data.has('undefined'),false);
const importFailure=importFixture({lat:10,lng:20,zoom:8});
importFailure.ctx.RyIrrigationDataStore.writeNetworkLayout=()=>false;
importFailure.run(JSON.stringify({app:'runye-irrigation',version:1,plots:[importedPlot('failed-import')],network:null,view:importedView}));
assert.equal(importFailure.data.get('runye_map_view'),JSON.stringify({lat:10,lng:20,zoom:8}),'a failed project import leaves the previous map view intact');
assert.deepEqual(JSON.parse(importFailure.data.get('runye_plot_library')).map(p=>p.id),['before-import'],'a failed project import restores the previous plot library');
assert.equal(importFailure.data.has('undefined'),false);
console.log('three plot transfer routes, source preservation and duplicate guard: OK');

// Exercise the real workspace controller with a minimal DOM, without opening a user browser.
function workspaceFixture(){
  const nodes=new Map(),frames=[],events={};
  class Element{
    constructor(id){this.id=id||'';this.children=[];this.attrs={};this.style={};this.textContent='';this.hidden=false;this.className='';this.handlers={};if(id)nodes.set(id,this);}
    setAttribute(k,v){this.attrs[k]=String(v);if(k==='id'){this.id=String(v);nodes.set(this.id,this);}}
    getAttribute(k){return Object.hasOwn(this.attrs,k)?this.attrs[k]:null;}
    hasAttribute(k){return Object.hasOwn(this.attrs,k);}
    removeAttribute(k){delete this.attrs[k];}
    appendChild(n){if(n.parentNode)n.parentNode.removeChild(n);this.children.push(n);n.parentNode=this;return n;}
    removeChild(n){this.children.splice(this.children.indexOf(n),1);n.parentNode=null;}
    insertBefore(n,ref){if(!ref)return this.appendChild(n);if(n.parentNode)n.parentNode.removeChild(n);this.children.splice(this.children.indexOf(ref),0,n);n.parentNode=this;return n;}
    get nextSibling(){return this.parentNode&&this.parentNode.children[this.parentNode.children.indexOf(this)+1]||null;}
    get classList(){return {contains:c=>this.className.split(' ').includes(c),toggle:(c,on)=>{const s=new Set(this.className.split(' ').filter(Boolean));if(on===undefined)on=!s.has(c);on?s.add(c):s.delete(c);this.className=[...s].join(' ');return on;}};}
    addEventListener(k,fn){this.handlers[k]=fn;}
    querySelectorAll(selector){
      const matches=n=>selector==='button'?n.tagName==='button':selector==='svg.tl-ws-svg'?n.tagName==='svg'&&n.classList.contains('tl-ws-svg'):
        selector[0]==='['?n.hasAttribute(selector.slice(1,-1)):selector[0]==='#'?n.id===selector.slice(1):n.classList.contains(selector.slice(1));
      const found=[];for(const n of this.children){if(matches(n))found.push(n);found.push(...n.querySelectorAll(selector));}return found;
    }
    querySelector(s){return this.querySelectorAll(s)[0]||null;}
  }
  const body=new Element('body'),main=new Element('main');body.appendChild(main);
  const pp=new Element('pipePlanSection'),tl=new Element('tlPipePlanSection'),pb=new Element('ppBody'),tb=new Element('tlBody');
  main.appendChild(pp);main.appendChild(tl);pp.appendChild(pb);tl.appendChild(tb);
  const ps=new Element('ppStage'),ts=new Element('tlStage');pb.appendChild(ps);tb.appendChild(ts);
  const ppSide=new Element('ppSide'),tlSide=new Element('tlSide');pb.appendChild(ppSide);tb.appendChild(tlSide);
  for(const id of ['ppCanvasWrap','ppCanvas','ppToolbar','ppQuickBar','ppPlotPanel'])ps.appendChild(new Element(id));
  const panel=nodes.get('ppPlotPanel');panel.appendChild(new Element('ppPlotWorkflow'));panel.appendChild(new Element('ppGroupEditWrap'));
  const panelToggle=new Element('ppPlotPanelToggle');panelToggle.tagName='button';panelToggle.textContent='多地块编辑';nodes.get('ppToolbar').appendChild(panelToggle);
  for(const id of ['tlWsContent','tlWsToolbar'])ts.appendChild(new Element(id));
  for(const id of ['tlWsZoomIn','tlWsZoomOut','tlWsZoomFit']){const b=new Element(id);b.tagName='button';nodes.get('tlWsToolbar').appendChild(b);}
  const button=new Element('ppLockArea');button.tagName='button';button.textContent='锁定面积';button.setAttribute('title','拖动网格时保持面积');nodes.get('ppToolbar').appendChild(button);
  const selectors={'body > main':main,'#pipePlanSection > .pp-body > .pp-stage':ps,'#tlPipePlanSection > .pp-body > .pp-stage':ts};
  pp.querySelector=s=>s===':scope > .pp-body'?pb:null;
  const document={body,getElementById:id=>nodes.get(id)||null,querySelector:s=>selectors[s]||null,createElement(tag){const e=new Element();e.tagName=tag;return e;}};
  const calls={renders:0,fit:0,pan:[],zoom:[],panelInit:0};
  const ctx={document,console,Event:function(type){this.type=type},requestAnimationFrame:fn=>frames.push(fn),
    addEventListener:(type,fn)=>{events[type]=fn},dispatchEvent(){},ppFitView(){calls.fit++},ppZoomView(factor){calls.zoom.push(factor);return true},ppPanView(x,y){calls.pan.push([x,y]);return true},rypInitAll(){calls.panelInit++},
    RyTlWs:{render(ctn){calls.renders++;const svg=new Element();svg.tagName='svg';svg.className='tl-ws-svg';ctn.appendChild(svg);}}};
  ctx.window=ctx;vm.createContext(ctx);
  const source=fs.readFileSync(path.join(root,'mod/inline-18.js'),'utf8');
  const start=source.indexOf('(function initDrawingWorkspace(){'),end=source.indexOf('\n  })();',start)+'\n  })();'.length;
  vm.runInContext('function isTool(){return true;}\n'+source.slice(start,end),ctx);
  return {ctx,nodes,calls,ps,button,flush(){let n=0;while(frames.length&&n++<50)frames.shift()();assert(n<50,'animation frame queue settles');}};
}
const workspace=workspaceFixture(),ws=workspace.ctx.RyDrawingWorkspace;
ws.activateSection('onlineMapSection');
assert.equal(workspace.nodes.get('ppCanvasWrap').parentNode,workspace.ps,'visiting the map must not mount or move a hidden drawing viewport');
workspace.ctx.document.body.setAttribute('data-ry-sec','pipePlanSection');
ws.activateSection('pipePlanSection');
assert.equal(workspace.nodes.get('ppPlotPanel').parentNode.id,'ryDrawingHost','plot editor floats outside the horizontal tool groups');
assert.equal(workspace.nodes.get('ppQuickBar').parentNode.id,'ryDrawingHost','[v788] 分区角度/AI规划/生成施工图组 floats as an independent draggable panel (user: 单独拎出来), not a toolbar child');
assert.equal(workspace.nodes.get('ppQuickBar').getAttribute('data-ry-tool-group'),null,'[v788] quick panel is NOT a toolbar group anymore');
assert.equal(workspace.nodes.get('ppPlotWorkflow').parentNode,workspace.nodes.get('ppPlotPanel'),'the original checklist node moves with its panel');
assert.equal(workspace.calls.panelInit,1,'floating editor is registered with the shared drag/fold controller');
assert.equal(workspace.nodes.get('ppPlotPanel').hidden,true,'[v789] 多地块编辑 panel starts collapsed as a right-edge drawer');
assert.equal(workspace.nodes.get('ppPlotPanel').style.left,'','[v790] mount clears stale drag inline position so the drawer opens at the CSS default (right edge)');
const panelToggle=workspace.nodes.get('ppPlotPanelToggle');
panelToggle.handlers.click();assert.equal(workspace.nodes.get('ppPlotPanel').hidden,false,'toolbar icon opens the drawer');
panelToggle.handlers.click();assert.equal(workspace.nodes.get('ppPlotPanel').hidden,true,'click again collapses the drawer');
const drawerTab=workspace.nodes.get('ppPlotDrawerTab');
assert.equal(drawerTab.getAttribute('aria-expanded'),'false','[v789] drawer tab starts collapsed');
drawerTab.handlers.click();assert.equal(workspace.nodes.get('ppPlotPanel').hidden,false,'drawer tab opens the panel');
assert.equal(drawerTab.classList.contains('open'),true,'[v789] drawer tab highlights when open');
drawerTab.handlers.click();assert.equal(workspace.nodes.get('ppPlotPanel').hidden,true,'drawer tab collapses the panel');
assert.equal(drawerTab.classList.contains('open'),false,'[v789] drawer tab highlight clears when closed');
const canvasParent=workspace.nodes.get('ppCanvasWrap').parentNode;
ws.setToolMode('pipeline');
assert.equal(workspace.nodes.get('ppCanvasWrap').parentNode,canvasParent,'tool selection preserves the same viewport node');
/* [v777 合并工具栏] 用户要求：两套功能按钮全部常驻同一顶部工具栏，不再档位切换。
   setToolMode 只更新内部上下文，不改变任何工具组可见性。 */
assert.equal(workspace.nodes.get('ppToolbar').hidden,false,'partition tools stay visible in the merged toolbar');
assert.equal(workspace.nodes.get('tlWsToolbar').hidden,false,'pipeline tools stay visible in the merged toolbar');
ws.setToolMode('partition');
assert.equal(workspace.nodes.get('ppToolbar').hidden,false,'merged toolbar keeps partition tools visible');
assert.equal(workspace.nodes.get('tlWsToolbar').hidden,false,'merged toolbar keeps pipeline tools visible');
ws.setToolMode('pipeline');
assert.equal(workspace.button.getAttribute('aria-label'),'锁定面积');
assert(workspace.button.getAttribute('data-ry-icon'),'an icon is assigned even when a long description exists');
assert.equal(workspace.nodes.get('tlWsContent').style.visibility,'hidden','an old SVG cannot show without current pipeline data');
workspace.ctx.tlDiagramData={poly:[{x:0,y:0},{x:20,y:0},{x:0,y:20}]};
ws.setToolMode('pipeline');
assert.equal(workspace.calls.renders,1,'current pipeline geometry is rendered into the existing overlay');
assert.equal(workspace.nodes.get('tlWsContent').style.pointerEvents,'auto');
ws.setToolMode('partition');
/* [v777 合并工具栏] 混合模式下管线层 ready 即可交互，不再按档位切 none；
   分区编辑不被拦截由 SVG visiblePainted 默认行为保证（空白穿透、
   全幅背景 rect 已被 pointer-events:none 禁用），此处断言交互保持开启。 */
assert.equal(workspace.nodes.get('tlWsContent').style.pointerEvents,'auto','merged mode keeps the ready pipe layer interactive; blank areas pass through to the base canvas');
assert.equal(workspace.calls.renders,1,'changing tools does not regenerate pipeline geometry');
const zoomIn=workspace.nodes.get('tlWsZoomIn');
workspace.nodes.get('tlWsToolbar').handlers.click({target:{closest(){return zoomIn;}},preventDefault(){},stopPropagation(){},stopImmediatePropagation(){}});
assert.deepEqual(workspace.calls.zoom,[1.25],'pipeline zoom-in toolbar updates the shared base camera');
assert.equal(workspace.calls.fit,1,'[v784] rendering new pipeline data refits the base camera once (ppFitScale dim-margin refit); zoom-in adds none');
const zoomFit=workspace.nodes.get('tlWsZoomFit');
workspace.nodes.get('tlWsToolbar').handlers.click({target:{closest(){return zoomFit;}},preventDefault(){},stopPropagation(){},stopImmediatePropagation(){}});
assert.equal(workspace.calls.fit,2,'pipeline fit toolbar fits the shared drawing camera');
assert.equal(ws.panBy(10,20),true);assert.deepEqual(workspace.calls.pan,[[10,20]],'pipe panning uses the shared base camera');
workspace.ctx.tlDiagramData=null;ws.refreshPlot();workspace.flush();
assert.equal(workspace.nodes.get('tlWsContent').style.visibility,'hidden','incoming map plot detaches the previous network overlay');
assert.equal(workspace.calls.fit,3,'shared fit plus a newly received plot request the base camera fit');
console.log('shared viewport, combined toolbar, incoming plot and overlay interaction: OK');
