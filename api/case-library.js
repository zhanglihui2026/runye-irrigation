'use strict';
const cases=require('../lib/case-library.cjs');
const ORIGIN='https://zhanglihui2026.github.io';
function cors(res){res.setHeader('Access-Control-Allow-Origin',ORIGIN);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');}
function out(res,http,code,msg,data){res.statusCode=http;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({code,msg,data:data===undefined?null:data}));}
module.exports=async function(req,res){cors(res);if(req.method==='OPTIONS'){res.statusCode=204;res.end();return;}if(req.method!=='POST')return out(res,405,405,'只支持 POST');const b=typeof req.body==='string'?(()=>{try{return JSON.parse(req.body)}catch{return null}})():req.body;if(!b||b.action!=='submit'||b.consent!==true)return out(res,400,400,'必须明确授权后才能上传匿名案例。');try{return out(res,200,0,'ok',await cases.submit(req,b.case));}catch(e){return out(res,e.code||400,e.code||400,e.message||'案例入库失败。');}};
