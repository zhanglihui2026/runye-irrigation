'use strict';
const crypto=require('node:crypto');
const LIMIT=5, memory=new Map();
function testMode(){return process.env.NODE_ENV==='test'&&process.env.AI_QUOTA_TEST_MODE==='1'&&!process.env.VERCEL;}
function identity(req,extraMembers){
 /* 会员名单是在线 AI 的唯一准入名单；保留旧 AI_ACCESS_TOKENS 仅供未升级环境诊断，
    一旦配置会员名单，额度身份也只从该名单取得，避免两份名单不一致。
    [v329] extraMembers：云端自助注册的会员码表（Redis/测试内存），与 env 名单合并（env 优先）。
    [v329] 管理员：用户编号带 'admin:' 前缀，或列入 env AI_ADMIN_USERS（逗号分隔）→ 不受5次限制。 */
 let accounts;try{accounts=JSON.parse(process.env.AI_MEMBER_TOKENS||process.env.AI_ACCESS_TOKENS||'{}');}catch{throw Object.assign(new Error('服务端会员访问码配置无效。'),{code:503});}
 if(extraMembers&&typeof extraMembers==='object'){for(const k in extraMembers){if(!Object.prototype.hasOwnProperty.call(accounts,k))accounts[k]=extraMembers[k];}}
 const header=String(req.headers?.authorization||''),token=header.startsWith('Bearer ')?header.slice(7):'';
 if(!token||!Object.prototype.hasOwnProperty.call(accounts,token)||typeof accounts[token]!=='string'||!accounts[token])throw Object.assign(new Error('请填写有效的会员访问码；每位会员共享5次额度，清缓存不会恢复次数。'),{code:401});
 let userId=String(accounts[token]),admin=userId.indexOf('admin:')===0;
 if(admin)userId=userId.slice(6);
 if(!userId)throw Object.assign(new Error('会员访问码对应的用户编号无效。'),{code:503});
 if(String(process.env.AI_ADMIN_USERS||'').split(',').map(s=>s.trim()).indexOf(userId)>=0)admin=true;
 return{key:crypto.createHash('sha256').update(userId).digest('hex'),admin:admin,userId:userId};
}
const RESERVE="local u=tonumber(redis.call('HGET',KEYS[1],'used') or '0'); local p=tonumber(redis.call('HGET',KEYS[1],'pending') or '0'); if u+p>=5 then return -1 end; redis.call('HINCRBY',KEYS[1],'pending',1); redis.call('HSET',KEYS[1],ARGV[1],'pending'); return 5-u-p-1";
const FINISH="local r=redis.call('HGET',KEYS[1],ARGV[1]); if r=='pending' then redis.call('HINCRBY',KEYS[1],'pending',-1); if ARGV[2]=='1' then redis.call('HINCRBY',KEYS[1],'used',1) end; redis.call('HDEL',KEYS[1],ARGV[1]) end; return 5-tonumber(redis.call('HGET',KEYS[1],'used') or '0')-tonumber(redis.call('HGET',KEYS[1],'pending') or '0')";
async function redis(script,key,args){
 const url=process.env.UPSTASH_REDIS_REST_URL,token=process.env.UPSTASH_REDIS_REST_TOKEN;
 if(!url||!token||!/^https:\/\//.test(url))throw Object.assign(new Error('AI持久额度服务未配置，已暂停调用以确保5次限制。'),{code:503});
 const r=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(['EVAL',script,1,key,...args]),signal:AbortSignal.timeout(10000)});
 const data=await r.json();if(!r.ok||data.error||!Number.isFinite(data.result))throw Object.assign(new Error('AI额度服务暂不可用，未继续调用模型。'),{code:503});return data.result;
}
async function reserve(account){
 const key='runye:ai:quota:v1:'+account,id='r:'+crypto.randomUUID();let left;
 if(testMode()){const q=memory.get(key)||{used:0,pending:new Set()};memory.set(key,q);if(q.used+q.pending.size>=LIMIT)left=-1;else{q.pending.add(id);left=LIMIT-q.used-q.pending.size;}}
 else left=await redis(RESERVE,key,[id]);
 if(left<0)throw Object.assign(new Error('本用户AI额度已用完或正在生成（每人共5次），请等待当前请求完成。'),{code:429});return{key,id,left};
}
async function finish(r,success){
 if(testMode()){const q=memory.get(r.key);if(q.pending.delete(r.id)&&success)q.used++;return LIMIT-q.used-q.pending.size;}
 return redis(FINISH,r.key,[r.id,success?'1':'0']);
}
module.exports={identity,reserve,finish,LIMIT,testMode,_reset:()=>memory.clear()};/* [v329] 导出 testMode 供注册存储层复用 */
