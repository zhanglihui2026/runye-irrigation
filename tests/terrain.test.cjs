'use strict';
const test=require('node:test'), assert=require('node:assert/strict'),path=require('node:path');
const T=require(path.join(process.env.RUNYE_TEST_ROOT || path.join(__dirname,'..'),'runye-terrain.js'));
const TerrainCore=require(path.join(__dirname,'..','terrain','terrain-core.js'));
const HydraulicCore=require(path.join(__dirname,'..','hydraulic-calc','hc-core.js'));
const DesignCore=require(path.join(__dirname,'..','hydraulic-calc','design-core.js'));
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
test('terrain boost-stage power uses the shared hydraulic power equation',()=>{
 const input={q_m3h:100,total_head_m:100,split_at_m:40,eta:0.7};
 const result=TerrainCore.boostModel(input);
 assert.equal(result.ok,true);
 for(const [stage,head] of [[result.stage1,40],[result.stage2,60]]){
  assert.equal(stage.power_kw,Math.round(HydraulicCore.power(input.q_m3h,head,input.eta)*100)/100);
  assert.equal(stage.motor_kw,DesignCore.motor(HydraulicCore.power(input.q_m3h,head,input.eta)));
 }
});
test('terrain and shared motor selection agree through the 315 kW catalog limit',()=>{
 const q=1000, eta=0.7, exactHead=315*1000*eta/(2.725*q);
 const atLimit=TerrainCore.boostModel({q_m3h:q,total_head_m:exactHead+10,split_at_m:exactHead,eta});
 assert.equal(atLimit.stage1.power_kw,315);
 assert.equal(atLimit.stage1.motor_kw,315);
 assert.equal(atLimit.stage1.motor_kw,DesignCore.motor(HydraulicCore.power(q,exactHead,eta)));
});
test('terrain intentionally reports no standard motor above 315 kW while shared design extrapolates',()=>{
 const q=1000, eta=0.7, head=316*1000*eta/(2.725*q);
 const result=TerrainCore.boostModel({q_m3h:q,total_head_m:head+10,split_at_m:head,eta});
 assert.equal(result.stage1.power_kw,316);
 assert.equal(result.stage1.motor_kw,null);
 assert.equal(DesignCore.motor(HydraulicCore.power(q,head,eta)),320);
});
test('terrain pipe diameter is an upward nominal-size estimate, distinct from PE design selection',()=>{
 const flow=50, targetVelocity=1.5;
 const estimate=TerrainCore.pipeDN(flow,targetVelocity);
 const design=DesignCore.selectPipe(flow,targetVelocity,[32,40,50,63,75,90,110,125,140,160,180,200,225,250,280,315],13.6,32,315);
 assert.equal(estimate.dn,110);
 assert(estimate.theory < estimate.dn);
 assert.equal(design.od,125);
 assert(Math.abs(design.v-targetVelocity)<0.06);
});
