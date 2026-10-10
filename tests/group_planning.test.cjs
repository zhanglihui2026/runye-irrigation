'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
// Pure regression for the real group controller; no browser or third-party dependency.
const root=process.env.RUNYE_TEST_ROOT || path.join(__dirname,'..');
const html = require('../expand_index.cjs')(path.join(__dirname, '..', 'index.html'));
function functionSource(name){const start=html.indexOf('function '+name+'(');assert(start>=0);for(let end=html.indexOf('}',start);end>=0;end=html.indexOf('}',end+1)){const text=html.slice(start,end+1);try{new vm.Script(text);return text;}catch(e){}}throw Error(name);}
function fixture(){
 const inputs={planTapeSpacing:{value:'.4'},planEmitterSpacing:{value:'.3'},planEmitterFlow:{value:'.8'},planTapeLaySide:{value:'100'},planN:{value:'4'},planIntensity:{textContent:'999'}};
 const win={addEventListener(){},measuredPolygon:[{x:0,y:0},{x:450,y:0},{x:450,y:200},{x:0,y:200}]};
 const doc={getElementById:id=>inputs[id] || null,querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}};
 const box={window:win,document:doc,console,setTimeout,clearTimeout,MAIN_PIPE_MIN_OD:90,BRANCH_PIPE_MAX_OD:160,SDR:13.6,
  selectPipe:(q,v,min,max)=>({od:Math.max(min || 50,50),id:45}),hazenWilliams:(length,q,id)=>length*q/id,christiansenF:()=>1};
 vm.createContext(box);vm.runInContext(functionSource('ppPolyArea')+'\n'+functionSource('ppClipPolyToRect'),box);
 win.RunyeBridge={polyArea:box.ppPolyArea,clipPolyToRect:box.ppClipPolyToRect,groupLiveSlot:()=>null,
  zoneCutsFor:bb=>({zoneCount:1,cols:1,rows:1,xPlan:[bb.w],yPlan:[bb.h],xSrc:[bb.w],ySrc:[bb.h],xPos:[bb.minX,bb.minX+bb.w],yPos:[bb.minY,bb.minY+bb.h]})};
 const marker=html.indexOf('window.__runyeGroupWork = W');const start=html.lastIndexOf('(function () {',marker),end=html.indexOf('\n})();',marker)+'\n})();'.length;
 vm.runInContext(html.slice(start,end),box);
 win.__runyeSubPlots=[{id:'A',name:'三角',poly:[{x:0,y:0},{x:200,y:0},{x:0,y:200}]},{id:'B',name:'矩形',poly:[{x:250,y:0},{x:450,y:0},{x:450,y:100},{x:250,y:100}]}];
 win.__runyeGroupEdit={active:true,mode:'whole',current:0,framePts:win.measuredPolygon,slots:win.__runyeSubPlots.map(s=>({polyPts:s.poly,mainPipes:[[{x:0,y:0},{x:0,y:20}]],branchPipes:[]})),trunkPipes:[]};
 win.grRefreshGroupPage();return {win,inputs,W:win.__runyeGroupWork};
}
test('group flow clips real fields and ignores stale display text',()=>{const {W,win,inputs}=fixture();assert(Math.abs(W.hyd.totalFlow-266.6666666666667)<1e-8);inputs.planEmitterFlow.value='1.6';win.grRefreshGroupPage();assert(Math.abs(W.hyd.totalFlow-533.3333333333333)<1e-8);});
test('group branch fallback follows the existing direction and end gap',()=>{const {W}=fixture();const spans=[200,100];W.hyd.blocks.forEach((b,i)=>{const span=spans[i],gap=Math.min(Math.max(span*.06,4),14,span*.22);assert.equal(b.zones[0].bL,span-2*gap);});});
test('new group and standalone plot do not inherit group design state',()=>{const {W,win}=fixture();W.blocks[0].tlData={old:true};W.trunk.lines.push([{x:0,y:0},{x:5,y:0}]);win.__runyeGroupEdit={...win.__runyeGroupEdit,trunkPipes:[]};win.grRefreshGroupPage();assert.equal(W.blocks[0].tlData,null);assert.equal(W.trunk.lines.length,0);win.__runyeSubPlots=null;win.grRefreshGroupPage();assert.equal(W.blocks.length,0);assert.equal(win.__runyeGroupFrame,null);});
test('total trunk shares the canonical geometry used by plot transforms',()=>{const {W,win}=fixture();win.__runyeGroupEdit.trunkPipes=[[{x:0,y:0},{x:30,y:0}]];win.grRefreshGroupPage();assert.equal(W.trunk.lines,win.__runyeGroupEdit.trunkPipes);assert.equal(W.hyd.trunkLen,30);});
