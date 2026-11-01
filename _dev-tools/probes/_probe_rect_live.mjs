'use strict';
/* 线上专项复测：直连 GitHub Pages，验证 v544b 的「快捷条在画布内 / 拖得动 / 双击复位」。
   与 _probe_rect_fix.mjs 同一套断言，区别只在目标页 = 线上地址（不启本地静态服务）。 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { spawn } = require('child_process');
const http = require('http');
const WS = globalThis.WebSocket;
const EDGE = 'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CDP = 17500 + Math.floor(Math.random() * 30);
const LIVE = 'https://zhanglihui2026.github.io/runye-irrigation/index.html?full=1&cb=' + Date.now();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const child = spawn(EDGE, ['--headless=new','--disable-gpu','--no-sandbox','--no-proxy-server','--remote-debugging-port='+CDP,'--user-data-dir=C://tmp//cdp_live_'+Date.now(),'--window-size=1400,900'], { stdio: 'ignore' });
const hreq=(m,p)=>new Promise((res,rej)=>{const q=http.request({host:'127.0.0.1',port:CDP,path:p,method:m},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(d));});q.on('error',rej);q.end();});
for(let i=0;i<60;i++){try{await hreq('GET','/json/version');break;}catch(e){await sleep(300);}}
let idc=1,ws;const pend={};
const send=(m,p={})=>new Promise((res,rej)=>{const id=idc++;pend[id]={res,rej};ws.send(JSON.stringify({id,method:m,params:p}));setTimeout(()=>{if(pend[id]){delete pend[id];rej(new Error('timeout '+m));}},120000);});
const t=JSON.parse(await hreq('PUT','/json/new?'+encodeURIComponent(LIVE)));
ws=new WS(t.webSocketDebuggerUrl);
await new Promise(r=>ws.addEventListener('open',r));
ws.addEventListener('message',e=>{const o=JSON.parse(e.data);if(o.id&&pend[o.id]){const{res,rej}=pend[o.id];delete pend[o.id];o.error?rej(new Error(o.error.message)):res(o.result);}});
await send('Runtime.enable');await send('Page.enable');
try{await send('Page.bringToFront');await send('Emulation.setFocusEmulationEnabled',{enabled:true});}catch(e){}
await send('Emulation.setDeviceMetricsOverride',{width:1400,height:900,deviceScaleFactor:1,mobile:false});
const ev=async x=>{const r=await send('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)return{__err:String(r.exceptionDetails.text)};return r.result.value;};
console.log('URL =', LIVE);
for(let i=0;i<80;i++){const r=await ev("location.hostname.indexOf('github.io')>=0 && !!window.rypDraggable && !!document.getElementById('ppQuickBar')");if(r===true)break;await sleep(500);}
await sleep(800);
/* 预置老用户存档（v248 旧格式：画布相对坐标），复现用户现场 */
await ev(`localStorage.setItem('ppQuickBarPos', JSON.stringify({l:30,t:16})); location.reload(); 1`);
await sleep(4000);
for(let i=0;i<80;i++){const r=await ev("location.hostname.indexOf('github.io')>=0 && !!window.rypDraggable");if(r===true)break;await sleep(500);}
await sleep(1200);
console.log(await ev(`(async function(){
  function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
  var out=[]; function A(n,ok,info){ out.push((ok?'OK   ':'FAIL ')+n+(ok?'':'  :: '+info)); }
  try{ ryShowSection('pipePlanSection'); }catch(e){}
  document.getElementById('pipePlanSection').style.setProperty('display','block','important');
  var t0=Date.now(); while(Date.now()-t0<8000 && document.getElementById('ppCanvasWrap').clientWidth<200){ await sleep(150); }
  await sleep(1500);
  var bar=document.getElementById('ppQuickBar'), wrap=document.getElementById('ppCanvasWrap');
  var br=bar.getBoundingClientRect(), wr=wrap.getBoundingClientRect();
  var relL=br.left-wr.left, relT=br.top-wr.top;
  A('wrap 是定位祖先（offsetParent 不是 MAIN）', wrap.contains(bar) && bar.offsetParent===wrap,
    'offsetParent='+(bar.offsetParent&&(bar.offsetParent.id||bar.offsetParent.tagName)));
  A('老存档 {l:30,t:16} 落在画布内 (30,16) 附近', Math.abs(relL-30)<3 && Math.abs(relT-16)<3, '实际相对画布 '+Math.round(relL)+','+Math.round(relT));
  A('条完整在画布内', relL>=-1 && br.right<=wr.right+1 && relT>=-1 && br.bottom<=wr.bottom+1,
    'rel='+Math.round(relL)+','+Math.round(relT)+' barW='+Math.round(br.width)+' wrapW='+Math.round(wr.width));
  var grip=document.getElementById('ppQuickGrip'), gr=grip.getBoundingClientRect();
  var hit=document.elementFromPoint(gr.left+gr.width/2, gr.top+gr.height/2);
  A('抓手可命中（没被挡/没被裁）', !!hit && (hit===grip||grip.contains(hit)), hit?(hit.id||hit.className||hit.tagName):'null');
  var sx=gr.left+gr.width/2, sy=gr.top+gr.height/2;
  function mev(t2,cx,cy,buttons){ grip.dispatchEvent(new PointerEvent(t2,{bubbles:true,cancelable:true,clientX:cx,clientY:cy,pointerId:7,pointerType:'mouse',button:0,buttons:buttons===undefined?1:buttons,isPrimary:true})); }
  mev('pointermove',sx,sy,0); mev('pointerdown',sx,sy,1);
  for(var i=1;i<=12;i++){ mev('pointermove', sx+10*i, sy+5*i, 1); await sleep(16); }
  mev('pointerup', sx+120, sy+60, 0);
  await sleep(250);
  var br2=bar.getBoundingClientRect();
  var movedL=br2.left-br.left, movedT=br2.top-br.top;
  A('拖动跟随指针 (+120,+60)', Math.abs(movedL-120)<6 && Math.abs(movedT-60)<6, '实际移动 '+Math.round(movedL)+','+Math.round(movedT));
  var st=null; try{ st=JSON.parse(localStorage.getItem('ppQuickBarPos')||'null'); }catch(e){}
  var br3=bar.getBoundingClientRect(), wr3=wrap.getBoundingClientRect();
  A('存档=画布相对坐标（旧格式兼容）', st && Math.abs(st.l-(br3.left-wr3.left))<3 && Math.abs(st.t-(br3.top-wr3.top))<3, JSON.stringify(st));
  var g2=grip.getBoundingClientRect(); var cx2=g2.left+g2.width/2, cy2=g2.top+g2.height/2;
  function clk(t2,c3,d3){ grip.dispatchEvent(new MouseEvent(t2,{bubbles:true,cancelable:true,clientX:c3,clientY:d3,button:0})); }
  clk('mousedown',cx2,cy2); clk('mouseup',cx2,cy2); clk('click',cx2,cy2);
  clk('mousedown',cx2,cy2); clk('mouseup',cx2,cy2); clk('click',cx2,cy2); clk('dblclick',cx2,cy2);
  await sleep(400);
  var br4=bar.getBoundingClientRect(), wr4=wrap.getBoundingClientRect();
  A('双击回默认位（画布内 10,8 附近）', Math.abs(br4.left-wr4.left-10)<6 && Math.abs(br4.top-wr4.top-8)<6,
    '相对画布 '+Math.round(br4.left-wr4.left)+','+Math.round(br4.top-wr4.top));
  A('双击清存档', !localStorage.getItem('ppQuickBarPos'), localStorage.getItem('ppQuickBarPos'));
  return out.join('\\n');
})()`));
try{ws.close();}catch(e){}try{child.kill();}catch(e){}
process.exit(0);
