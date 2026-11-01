'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
process.env.NODE_ENV='test';process.env.AI_ACCESS_TOKENS=JSON.stringify({'case-token':'case-account'});
const lib=require('../lib/case-library.cjs');
const handler=require('../api/case-library.js');
function sample(extra){return Object.assign({source:'manual',status:'deployed',feature:{area_m2:12000,mu:18,bbox_ratio:1.5},engine_check:{pump_head_m:31,pump_flow_m3h:11,main_od_mm:90,branch_od_mm:63},plan:{polygon:[{x:0,y:0},{x:120,y:0},{x:120,y:100},{x:0,y:100}],input_values:{planTapeSpacing:.7},pipe_plan:{mainPipes:[[{x:0,y:0},{x:50,y:0}]]},manual_groups:[[0,1]]},feedback:{rating:5,note:'已安装并验收'}},extra||{});}
async function post(body,token='case-token'){let raw;await handler({method:'POST',headers:{authorization:'Bearer '+token},body},{setHeader(){},end(s){raw=s}});return JSON.parse(raw);}
test('anonymous valid case enters library and is retrievable',async()=>{lib._reset();const r=await post({action:'submit',consent:true,case:sample()});assert.equal(r.code,0);const rows=await lib.retrieve({area:12000,ratio:1.5});assert.equal(rows.length,1);assert.equal(rows[0].source,'manual');assert.equal(rows[0].status,'deployed');assert.equal(rows[0].design.input_values.planTapeSpacing,.7);});
test('explicit consent and existing access token are mandatory',async()=>{lib._reset();assert.equal((await post({action:'submit',consent:false,case:sample()})).code,400);assert.equal((await post({action:'submit',consent:true,case:sample()},'bad')).code,401);});
test('unverified hydraulics and bad source are rejected',async()=>{lib._reset();assert.equal((await post({action:'submit',consent:true,case:sample({engine_check:{pump_head_m:0,pump_flow_m3h:0}})})).code,400);assert.equal((await post({action:'submit',consent:true,case:sample({source:'other'})})).code,400);});
test('manual deployed ranks ahead of ai and abandoned is excluded',async()=>{lib._reset();await post({action:'submit',consent:true,case:sample({source:'ai',feedback:{rating:5,note:''}})});await post({action:'submit',consent:true,case:sample({source:'manual',status:'pending',feedback:{rating:5,note:''}})});await post({action:'submit',consent:true,case:sample({source:'manual',status:'deployed',feedback:{rating:1,note:''}})});await post({action:'submit',consent:true,case:sample({source:'manual',status:'abandoned',feedback:{rating:5,note:''}})});const rows=await lib.retrieve({area:12000,ratio:1.5});assert.equal(rows.length,3);assert.equal(rows[0].source,'manual');assert.equal(rows[0].status,'deployed');assert.equal(rows.some(x=>x.status==='abandoned'),false);});
test('raw geolocation and account identifiers are not part of normalized engineering record',()=>{const x=lib.normalize(sample({geoBase:{lat:1,lng:2},currentPlotId:'person-plot'}));assert.equal(x.plan.geoBase,undefined);assert.equal(x.owner_hash,undefined);assert.equal(x.plan.polygon[0].x,0);});

/* [v845 众包案例库打包] query action：检索闭环的对外出口。此前 api 只收 submit，retrieve 是死代码。 */
test('query action returns ranked desensitized cases behind member auth',async()=>{
  lib._reset();
  await post({action:'submit',consent:true,case:sample()});
  await post({action:'submit',consent:true,case:sample({source:'ai',status:'pending',feedback:{rating:5,note:''}})});
  /* 鉴权：坏 token 401；无 area 400 */
  assert.equal((await post({action:'query',q:{area:12000}},'bad')).code,401);
  assert.equal((await post({action:'query',q:{}})).code,400);
  assert.equal((await post({action:'query',q:{area:-5}})).code,400);
  assert.equal((await post({action:'query',q:{area:'abc'}})).code,400);
  /* 正常检索：manual+deployed 排前；返回已脱敏（无 owner_hash / 无 polygon） */
  const r=await post({action:'query',q:{area:12000,ratio:1.5}});
  assert.equal(r.code,0);
  assert.ok(Array.isArray(r.data)&&r.data.length===2);
  assert.equal(r.data[0].source,'manual');assert.equal(r.data[0].status,'deployed');
  assert.equal(r.data.some(c=>'owner_hash' in c),false);
  assert.equal(r.data.some(c=>c.plan&&c.plan.polygon),false); /* 检索出口不给地块边界 */
});
test('query with no hits returns empty array not error',async()=>{lib._reset();const r=await post({action:'query',q:{area:999999}});assert.equal(r.code,0);assert.deepEqual(r.data,[]);});
