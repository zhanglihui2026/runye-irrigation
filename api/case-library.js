'use strict';
/* [v845 众包案例库打包] 在 submit 之外新增 query action：
 *   POST { action:'query', q:{ area: m², ratio: bbox长宽比(可省) } } → top3 相似匿名案例（已脱敏）。
 *   鉴权与 submit 同源（Bearer 会员访问码 → quota.identity），防止匿名爬库；
 *   q.area 必须为有限正数（rank 按面积偏差排序，缺失会让排序失去意义）。
 *   [v845 前史] 此前本接口只接受 action==='submit'——服务端 lib.retrieve() 一直是死代码，
 *   上传的案例没有任何消费端；本 action 是检索闭环的对外出口。 */
const cases=require('../lib/case-library.cjs');
const quota=require('../lib/ai-quota.cjs');
const ORIGIN='https://zhanglihui2026.github.io';
function cors(res){res.setHeader('Access-Control-Allow-Origin',ORIGIN);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');}
function out(res,http,code,msg,data){res.statusCode=http;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({code,msg,data:data===undefined?null:data}));}
module.exports=async function(req,res){cors(res);if(req.method==='OPTIONS'){res.statusCode=204;res.end();return;}if(req.method!=='POST')return out(res,405,405,'只支持 POST');const b=typeof req.body==='string'?(()=>{try{return JSON.parse(req.body)}catch{return null}})():req.body;if(!b||typeof b!=='object'||Array.isArray(b))return out(res,400,400,'请求体必须是 JSON 对象。');
  if(b.action==='query'){
    try{quota.identity(req);}catch(e){return out(res,e.code||401,e.code||401,e.message||'需要有效的会员访问码。');}
    const q=b.q&&typeof b.q==='object'&&!Array.isArray(b.q)?b.q:{};
    const area=Number(q.area);
    if(!(Number.isFinite(area)&&area>0))return out(res,400,400,'q.area 必须为正数（地块面积 m²），用于按面积相似度排序。');
    const ratio=Number(q.ratio);
    try{return out(res,200,0,'ok',await cases.retrieve({area:area,ratio:(Number.isFinite(ratio)&&ratio>0)?ratio:1}));}
    catch(e){return out(res,e.code||503,e.code||503,e.message||'案例库暂不可用。');}
  }
  if(b.action!=='submit'||b.consent!==true)return out(res,400,400,'必须明确授权后才能上传匿名案例。');try{return out(res,200,0,'ok',await cases.submit(req,b.case));}catch(e){return out(res,e.code||400,e.code||400,e.message||'案例入库失败。');}};
