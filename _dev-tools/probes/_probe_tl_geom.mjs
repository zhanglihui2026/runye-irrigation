'use strict';
/* _probe_tl_geom.mjs —— dump 三级规划页 tlDiagramData 的真实几何形状
 * （mainPipes / valves / frontPipe / zones 网格），供「段总管」设计定形。
 * 复用 _probe_tl_head 的 CDP 骨架；地块种子沿用 p1/p7 的 runye_plot_library。
 * 用法：node _dev-tools/probes/_probe_tl_geom.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { spawn } = require('child_process');
const http = require('http'); const fs = require('fs'); const path = require('path');
const WS = globalThis.WebSocket;
const EDGE = 'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = process.env.RY_ROOT || 'C:/Users/AHS/runye-irrigation';
const VW = 1400, VH = 900;
const PORT = 47320 + Math.floor(Math.random() * 40), CDP = 47620 + Math.floor(Math.random() * 40);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml' };
const srv = http.createServer((req,r2)=>{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/index.html';const fp=path.join(ROOT,p.replace(/^\//,''));if(!fs.existsSync(fp)||fs.statSync(fp).isDirectory()){r2.writeHead(404);r2.end('nf');return;}r2.writeHead(200,{'Content-Type':MIME[path.extname(fp).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(fp).pipe(r2);});
await new Promise(r=>srv.listen(PORT,'127.0.0.1',r));
const child = spawn(EDGE,['--headless=new','--disable-gpu','--no-sandbox','--no-proxy-server','--host-resolver-rules=MAP cdn.jsdelivr.net 127.0.0.1','--remote-debugging-port='+CDP,'--user-data-dir=C://tmp//cdp_tlg_'+Date.now(),'--window-size='+VW+','+VH],{stdio:'ignore'});
const hreq=(m,p)=>new Promise((res,rej)=>{const q=http.request({host:'127.0.0.1',port:CDP,path:p,method:m},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(d));});q.on('error',rej);q.end();});
for(let i=0;i<60;i++){try{await hreq('GET','/json/version');break;}catch(e){await sleep(300);}}
let idc=1,ws;const pend={};
const send=(m,p={})=>new Promise((res,rej)=>{const id=idc++;pend[id]={res,rej};ws.send(JSON.stringify({id,method:m,params:p}));setTimeout(()=>{if(pend[id]){delete pend[id];rej(new Error('timeout '+m));}},60000);});
const t=JSON.parse(await hreq('PUT','/json/new?'+encodeURIComponent('http://127.0.0.1:'+PORT+'/index.html?full=1&rymock=L2')));
ws=new WS(t.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r));
ws.addEventListener('message',e=>{const o=JSON.parse(e.data);if(o.id&&pend[o.id]){const{res,rej}=pend[o.id];delete pend[o.id];o.error?rej(new Error(o.error.message)):res(o.result);return;}});
await send('Runtime.enable');await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride',{width:VW,height:VH,deviceScaleFactor:1,mobile:false});
const ev=async x=>{const r=await send('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)return{__err:String((r.exceptionDetails.exception&&r.exceptionDetails.exception.description)||r.exceptionDetails.text).slice(0,400)};return r.result.value;};

/* 地块种子：4 行 3 列意愿 → 用 2 区起跑（默认），面积 36 亩方形 */
const SEED = `(function(){
  if(localStorage.getItem('__tlg_seed')) return 'seeded';
  var poly=[[18.2500,109.5180],[18.2500,109.5230],[18.2520,109.5230],[18.2520,109.5180]];
  var plots=[{id:'tlg-a',name:'TLG-A',sqm:24000,mu:36,ts:600,areaM2:24000,source:'map',polyLatLng:poly}];
  localStorage.setItem('runye_plot_library',JSON.stringify(plots));
  localStorage.setItem('runyeLocalAdminSession','1');
  localStorage.setItem('__tlg_seed','1');
  return 'ok';
})()`;

await ev('localStorage.clear();' + SEED);
await send('Page.reload',{ignoreCache:true});
for(let i=0;i<60;i++){if(await ev('!!window.tlAutoGenerate')===true)break;await sleep(400);}
/* 先在地图页选中地块（回传地块上下文），再切三级 */
for(let i=0;i<25;i++){ if(await ev("!!document.querySelector('#myPlotList .place-item[data-plot-id=tlg-a] .place-go')")===true)break; await sleep(400); }
const go = await ev("(function(){var b=document.querySelector('#myPlotList .place-item[data-plot-id=tlg-a] .place-go');if(!b)return 'no-go';b.click();return 'clicked';})()");
console.log('GO ' + JSON.stringify(go));
await sleep(2200);
/* place-go 会切到地图画布；再从 tab 切三级（plot 上下文此时应已建立） */
await sleep(1200);
const st2 = await ev("(function(){try{window.rySetTab('tlPipePlanSection','pipe');return 'tab-ok:'+window.currentPlotId;}catch(e){return 'err '+e.message;}return 1;})()");
console.log('TAB ' + JSON.stringify(st2));
for(let i=0;i<25;i++){ if(await ev('!!window.tlDiagramData')===true)break; await sleep(400); }
await sleep(2500);
const diag = await ev(`JSON.stringify({sec:document.body.getAttribute('data-ry-sec'), plot:window.currentPlotId||null, hasAuto:!!window.tlAutoGenerate, lib:!!window.RyPlotLibraryStore})`);
console.log('DIAG ' + JSON.stringify(diag));

const dump = await ev(`JSON.stringify((function(){
  var dd=window.tlDiagramData;
  if(!dd) return {err:'no tlDiagramData'};
  var r2=function(v){return Math.round(v*100)/100;};
  return {
    generatedAt: dd.generatedAt,
    world: dd.world,
    zones: dd.zones ? {cols:dd.zones.cols, rows:dd.zones.rows, xPos:dd.zones.xPos, yPos:dd.zones.yPos} : null,
    mainPipes: (dd.mainPipes||[]).map(function(l){return l.map(function(p){return [r2(p.x),r2(p.y)];});}),
    branchPipes: (dd.branchPipes||[]).slice(0,4).map(function(l){return l.map(function(p){return [r2(p.x),r2(p.y)];});}),
    valves: (dd.valves||[]).map(function(v){return [r2(v.x),r2(v.y)];}),
    frontPipe: dd.frontPipe ? dd.frontPipe.map(function(p){return [r2(p.x),r2(p.y)];}) : null,
    sourcePos: dd.sourcePos ? [r2(dd.sourcePos.x),r2(dd.sourcePos.y)] : null,
    poly: (dd.poly||[]).slice(0,4).map(function(p){return [r2(p.x),r2(p.y)];})
  };
})())`);
console.log(typeof dump === 'string' ? dump : JSON.stringify(dump));
try{ ws.close(); }catch(e){}
try{ child.kill(); }catch(e){}
try{ srv.close(); }catch(e){}
process.exit(0);
