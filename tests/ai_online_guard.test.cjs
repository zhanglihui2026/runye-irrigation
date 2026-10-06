const test=require('node:test'),assert=require('node:assert/strict');
const repo=require('path').join(__dirname,'..');const handler=require(repo+'/api/ai-irrigation.js');
process.env.NODE_ENV='test';process.env.AI_QUOTA_TEST_MODE='1';process.env.AI_ACCESS_TOKENS=JSON.stringify({'audit-token-alpha':'account-a','audit-token-rotated':'account-a','audit-token-beta':'account-b'});process.env.DEEPSEEK_API_KEY='test-placeholder';
const good={version:1,design:{tape_spacing:.4,emitter_spacing:.3,emitter_flow:.8}};
function body(){return{user_id:'ignored-browser-id',polygon:[{x:0,y:0},{x:200,y:0},{x:200,y:100},{x:0,y:100}],area:20000};}
let response=good,calls=0,last;
global.fetch=async(url,init)=>{calls++;last=JSON.parse(init.body);await new Promise(r=>setTimeout(r,10));return{ok:true,status:200,text:async()=>JSON.stringify({choices:[{message:{content:JSON.stringify(response)}}]})};};
async function run(p=body(),token='audit-token-alpha'){let raw;await handler({method:'POST',headers:{authorization:'Bearer '+token},body:p},{setHeader(){},end(s){raw=s}});return JSON.parse(raw);}
function reset(){handler.__test._reset();response=good;calls=0;}
test('six concurrent requests call upstream at most five times',async()=>{reset();const r=await Promise.all(Array.from({length:6},()=>run()));assert.equal(calls,5);assert.equal(r.filter(p=>p.code===0).length,5);assert.equal(r.filter(p=>p.code===429).length,1);assert.equal((await run()).code,429);});
test('browser id change and alternate code for same account do not reset quota',async()=>{reset();for(let i=0;i<5;i++)assert.equal((await run()).code,0);assert.equal((await run({...body(),user_id:'brand-new'},'audit-token-rotated')).code,429);assert.equal((await run(body(),'audit-token-beta')).code,0);});
test('empty and out of range plans return 422 without consuming success quota',async()=>{reset();response={};assert.equal((await run()).code,422);response={version:1,design:{tape_spacing:99,emitter_spacing:.3,emitter_flow:.8}};assert.equal((await run()).code,422);response=good;assert.equal((await run()).quota_left,4);});
test('invalid geometry blocked before paid model call',async()=>{reset();for(const polygon of [[],[{x:'bad',y:0},{x:10,y:0},{x:0,y:10}],[{x:0,y:0},{x:10,y:10},{x:0,y:10},{x:10,y:0}]])assert.equal((await run({...body(),polygon})).code,400);assert.equal(calls,0);});
test('wrong area and oversized pre-parsed body rejected',async()=>{reset();assert.equal((await run({...body(),area:50000})).code,400);assert.equal((await run({...body(),padding:'x'.repeat(270000)})).code,413);assert.equal(calls,0);});
test('child geometry and measured conditions are included; model does not invent hydraulic results',async()=>{reset();const prompt=handler.__test.buildUserPrompt({...body(),groups:[{name:'梯田甲',poly:[{x:0,y:0},{x:5,y:0},{x:0,y:5}]}],conditions:{pump_efficiency:65},terrain:{source:100}});assert.match(prompt,/梯田甲/);assert.match(prompt,/pump_efficiency/);assert.match(handler.__test.SYSTEM_PROMPT,/Hazen/);assert.doesNotMatch(handler.__test.SYSTEM_PROMPT,/Darcy|效率按 70/);await run();assert.equal(last.temperature,undefined);assert.equal(last.response_format.type,'json_object');});
test('missing credentials rejected; production cannot fall back to memory quota',async()=>{reset();assert.equal((await run(body(),'')).code,401);process.env.VERCEL='1';try{assert.equal((await run()).code,503);assert.equal(calls,0);}finally{delete process.env.VERCEL;}});
test('persistent quota REST commands survive handler reload and isolate failures',async()=>{
 reset();const savedFetch=global.fetch,store=new Map();let modelCalls=0;
 process.env.VERCEL='1';process.env.UPSTASH_REDIS_REST_URL='https://quota.test';process.env.UPSTASH_REDIS_REST_TOKEN='test-redis-token';
 global.fetch=async(url,init)=>{
  if(url==='https://quota.test'){
   const [op,script,n,key,id,success]=JSON.parse(init.body);assert.equal(op,'EVAL');assert.equal(n,1);assert.equal(init.headers.Authorization,'Bearer test-redis-token');
   let q=store.get(key)||{used:0,pending:new Set()};store.set(key,q);let result;
   if(script.includes('u+p>=5')){if(q.used+q.pending.size>=5)result=-1;else{q.pending.add(id);result=5-q.used-q.pending.size;}}
   else{if(q.pending.delete(id)&&success==='1')q.used++;result=5-q.used-q.pending.size;}
   return{ok:true,json:async()=>({result})};
  }
  modelCalls++;return savedFetch(url,init);
 };
 try{
  response={};assert.equal((await run()).code,422);response=good;
  const r=await Promise.all(Array.from({length:6},()=>run()));assert.equal(r.filter(p=>p.code===0).length,5);assert.equal(modelCalls,6); // invalid + 5 valid
  delete require.cache[require.resolve(repo+'/api/ai-irrigation.js')];const restarted=require(repo+'/api/ai-irrigation.js');let raw;
  await restarted({method:'POST',headers:{authorization:'Bearer audit-token-rotated'},body:body()},{setHeader(){},end(s){raw=s;}});
  assert.equal(JSON.parse(raw).code,429);assert.equal(modelCalls,6);
 }finally{global.fetch=savedFetch;delete process.env.VERCEL;delete process.env.UPSTASH_REDIS_REST_URL;delete process.env.UPSTASH_REDIS_REST_TOKEN;}
});
