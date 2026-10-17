'use strict';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { spawn } = require('child_process');
const http = require('http'); const fs = require('fs'); const path = require('path');
const WS = globalThis.WebSocket;
const EDGE = 'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = process.env.RY_ROOT || 'C:/Users/AHS/runye-irrigation';
const PORT = 15100 + Math.floor(Math.random()*60), CDP = 14700 + Math.floor(Math.random()*60);
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
const srv = http.createServer((req,r2)=>{ let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/index.html';
  const fp=path.join(ROOT,p.replace(/^\//,'')); if(!fs.existsSync(fp)||fs.statSync(fp).isDirectory()){r2.writeHead(404);r2.end('nf');return;}
  r2.writeHead(200,{'Content-Type':MIME[path.extname(fp).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'}); fs.createReadStream(fp).pipe(r2); });
await new Promise(r=>srv.listen(PORT,'127.0.0.1',r));
const udd = process.env.TEMP + '\\edge_leak_' + Date.now();
const proc = spawn(EDGE,['--headless=new','--disable-gpu','--no-sandbox','--remote-debugging-port='+CDP,
  '--user-data-dir='+udd,'--window-size=1400,900','http://127.0.0.1:'+PORT+'/index.html'],{stdio:'ignore'});
let ws=null, id=0; const pend=new Map();
for(let i=0;i<40;i++){ try{ const r=await fetch('http://127.0.0.1:'+CDP+'/json/list'); const j=await r.json();
  const pg=j.find(t=>t.type==='page'&&t.url.includes('127.0.0.1')); if(pg){ ws=new WS(pg.webSocketDebuggerUrl); break; } }catch(e){} await sleep(300); }
ws.onmessage = ev => { const m=JSON.parse(ev.data); if(m.id&&pend.has(m.id)){ pend.get(m.id)(m); pend.delete(m.id);} };
await new Promise(r=>ws.onopen=r);
const send=(method,params={})=>new Promise(res=>{ const i=++id; pend.set(i,res); ws.send(JSON.stringify({id:i,method,params})); });
const evalJS = async expr => { const r = await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true}); return r.result && r.result.result ? r.result.result.value : (r.result||{}).value; };
await send('Page.enable'); await sleep(1000);
// 等首屏就绪（轮询闸门，别赌 sleep）
for(let i=0;i<60;i++){ const ok = await evalJS("!!window.RyPlanParams && !!document.querySelector('#terrainSection')"); if(ok) break; await sleep(500); }
const out = await evalJS(`(() => {
  var sec = document.getElementById('terrainSection');
  var all = Array.from(document.querySelectorAll('[class]'));
  var leak = [], count = 0;
  all.forEach(function(el){
    var cl = (el.getAttribute('class')||'').split(/\\s+/).filter(function(c){ return c.indexOf('t-')===0; });
    if(!cl.length) return;
    count++;
    if(sec && !sec.contains(el)) leak.push({tag:el.tagName.toLowerCase(), cls:cl.join(' '), id:el.id||'', txt:(el.textContent||'').trim().slice(0,24)});
  });
  // 反向：样式表里裸 .t- 规则条数
  var naked = 0, prefixed = 0;
  var targets = ['terrain/terrain.css'];
  Array.from(document.styleSheets).forEach(function(ss){
    var href = (ss.href||'');
    if(href.indexOf('terrain/terrain.css')<0) return;
    function walk(rules){
      Array.from(rules||[]).forEach(function(r){
        if(r.type===4){ walk(r.cssRules); return; }
        if(!r.selectorText) return;
        r.selectorText.split(',').forEach(function(s){ s=s.trim();
          if(/\\.t-[a-z]/.test(s)){ if(/^#terrainSection/.test(s)||/^body\\.t-page/.test(s)) prefixed++; else naked++; } });
      });
    }
    walk(ss.cssRules);
  });
  return {tElems:count, leak:leak.slice(0,15), leakN:leak.length, naked:naked, prefixed:prefixed, sheets:Array.from(document.styleSheets).filter(function(s){return (s.href||'').indexOf('terrain/')>=0;}).map(function(s){return s.href.split('/').pop();})};
})()`);
console.log(JSON.stringify(out,null,2));
try{ await send('Browser.close'); }catch(e){}
try{ proc.kill(); }catch(e){}
srv.close(); process.exit(0);
