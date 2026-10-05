'use strict';
const test=require('node:test'), assert=require('node:assert/strict'),path=require('node:path');
const T=require(path.join(process.env.RUNYE_TEST_ROOT || path.join(__dirname,'..'),'runye-terrain.js'));
const options={lift:5,target:1,existing:0,filter:5,pumpHead:40};
test('uphill required head includes signed rise once and existing safety rule',()=>{
 const r=T.assess({high:120,low:115},100,8,options);
 assert.equal(r.rise,20);assert(Math.abs(r.requiredHead-(5+20+10.2+8+5+2)*1.1)<1e-10);
 assert(Math.abs(r.pressureLow-2/10.2)<1e-10);assert(Math.abs(r.pressureHigh-20/10.2)<1e-10);
});
test('downhill decreases required head and raises static pressure',()=>{
 const up=T.assess({high:110},100,8,options),down=T.assess({high:90,low:80},100,8,options);
 assert.equal(down.rise,-10);assert(Math.abs(up.requiredHead-down.requiredHead-22)<1e-10);
 assert(down.pressureHigh>up.pressureHigh);
});
test('negative absolute elevations use the same datum correctly',()=>{
 assert.equal(T.assess({high:-50,low:-60},-40,8,options).rise,-10);
});
test('gravity supply never yields negative pump selection',()=>{
 assert.equal(T.assess({high:0},100,0,options).requiredHead,0);
});
test('existing pressure offsets pumping requirement; missing pump only hides pressure checks',()=>{
 const r=T.assess({high:120},100,8,{...options,existing:1,pumpHead:null});
 assert(Math.abs(r.requiredHead-(5+20+8+5+2)*1.1)<1e-10);assert.equal(r.pressureLow,null);assert.equal(r.pressureHigh,null);
});
test('missing source or plot elevation does not imply sea level zero',()=>{
 assert.equal(T.assess({high:10},null,8,options),null);assert.equal(T.assess({},0,8,options),null);
});
test('archive validation preserves zero and negative heights but rejects inverted ranges',()=>{
 const r=T.validate({version:1,enabled:true,source:0,pumpHead:0,maxPressure:1.2,plots:{a:{high:0,low:-5},b:{high:2,low:3},c:{high:'4'}}});
 assert.equal(r.source,0);assert.equal(r.pumpHead,0);assert.deepEqual(r.plots,{a:{high:0,low:-5}});
});
test('legacy project import explicitly clears prior terrain configuration',()=>{
 T.importState({version:1,enabled:true,source:100,plots:{a:{high:120}}});T.importState(null);
 assert.equal(T.exportState().enabled,false);assert.equal(T.exportState().source,null);assert.deepEqual(T.exportState().plots,{});
});
