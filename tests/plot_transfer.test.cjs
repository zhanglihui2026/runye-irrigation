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
  const calls = {jumps:[],alerts:[],saves:0,loads:0,diagrams:0};
  const list = {children:[],set innerHTML(v){this.children=[]},appendChild(x){this.children.push(x)}};
  const document = {
    readyState:'loading',addEventListener(type,fn){this.onready=fn},
    getElementById(id){return id==='plotLibList'?list:null},
    createElement(){const buttons={};return {className:'',querySelector(sel){return buttons[sel]||(buttons[sel]={addEventListener(type,fn){this.click=fn}})}}}
  };
  const ctx={document,location:{search:''},URLSearchParams,console,Date,Math,JSON,
    localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},
    alert:m=>calls.alerts.push(m),updatePlan(){},
    ppLoadPolygon(){calls.loads++},ppGenerateDiagram(){calls.diagrams++},
    ryJumpToSection:id=>calls.jumps.push(id),runyeSetCurrentPlot:id=>{calls.saves++},
  };
  ctx.window=ctx;vm.createContext(ctx);
  for(const f of ['core/plot-library-store.js','mod/inline-13.js','mod/inline-16.js'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx,{filename:f});
  return {ctx,data,calls,list,document};
}
const a=plot('a',ringA), b=plot('b',ringB);
const f=fixture([a,b]);
const original=f.data.get('runye_plot_library');
const geometryKey=JSON.stringify([ringB]);
f.data.set('runyeMeasuredArea',JSON.stringify({ryPlotRef:{id:'b',geometryKey,areaM2:1000}}));
assert.equal(f.ctx.runyeApplyMapPayload(),true);
assert.equal(f.ctx.currentPlotId,'b');
assert.equal(f.data.get('runye_plot_library'),original,'map source must not be overwritten');
assert.equal(f.data.get('runyeMeasuredArea'),undefined,'consumed reference');
assert.equal(f.calls.jumps.at(-1),'pipePlanSection');
assert.equal(f.calls.loads>0 && f.calls.diagrams>0,true);
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
const start=mapSrc.indexOf('function sendPlotToDesign(plot, btnEl){');
const end=mapSrc.indexOf('// 回传地块绘制',start);
assert.equal(start>=0 && end>start,true);
assert.match(mapSrc,/onSendDesign:function\(p\)\{ sendPlotToDesign\(p,/);
assert.match(fs.readFileSync(path.join(root,'runye-map-enhance.js'),'utf8'),/opts\.onSendDesign\(p\)/);
assert.match(mapSrc,/sd\.onclick=function\(\)\{[\s\S]*?sendPlotToDesign\(p, this\)/);
const sent=new Map([['runye_plot_library',original]]);
const sentCalls={applied:0,alerts:[]};
const sender={window:null,document:{getElementById:id=>id==='onlineMapSection'?{}:null},
  location:{hash:''},localStorage:{getItem:k=>sent.get(k)||null,setItem:(k,v)=>sent.set(k,v)},
  lsGet:k=>JSON.parse(sent.get(k)||'[]'),setTimeout:fn=>{fn();return 1},
  alert:m=>sentCalls.alerts.push(m),console,JSON,Math,Number,String,Date,isFinite};
sender.window=sender;
sender.runyeApplyMapPayload=()=>{sentCalls.applied++;return true};
vm.createContext(sender);
vm.runInContext(mapSrc.slice(start,end)+'\nwindow.__send=sendPlotToDesign;',sender);
sender.__send(b,null);
assert.equal(JSON.parse(sent.get('runyeMeasuredArea')).ryPlotRef.id,'b');
assert.equal(sentCalls.applied,1,'same-page transfer must invoke receiver');
assert.equal(sender.location.hash,'pipePlanSection');
const oldPayload=sent.get('runyeMeasuredArea');
sender.__send({...b,polyLatLng:ringA},null);
assert.equal(sent.get('runyeMeasuredArea'),oldPayload,'stale map popup must not change transfer');
assert.equal(sentCalls.alerts.length,1);
sent.set('runye_plot_library',JSON.stringify([b,plot('b',ringA)]));
sender.__send(b,null);
assert.equal(sent.get('runyeMeasuredArea'),oldPayload,'duplicate id must not choose another plot');
assert.equal(sentCalls.alerts.length,2);
console.log('three plot transfer routes, source preservation and duplicate guard: OK');
