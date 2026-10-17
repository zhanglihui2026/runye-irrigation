'use strict';
/* 量两张白底卡片（#tlPumpUpdateBox 管径调整 / #tlLossCard 水头损失）可见态的字号字重。
   这两张卡默认 display:none，且祖先 #tlPipePlanSection 未激活时也是隐藏 ⇒ 必须先切视图
   再强制显示卡片本身，否则 dump 到 0 个元素。
   用法：node _probe_card_font.mjs [out.json]   （支持 RY_ROOT / RY_URL / RY_VP） */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { spawn } = require('child_process');
const http = require('http'), fs = require('fs'), path = require('path');
const WS = globalThis.WebSocket;

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = process.env.RY_ROOT || 'C:/Users/AHS/runye-irrigation';
const OUT = process.argv[2] || '_card_font.json';
const PORT = 15100 + Math.floor(Math.random() * 60), CDP = 14700 + Math.floor(Math.random() * 60);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const srv = http.createServer((q, r2) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const fp = path.join(ROOT, p.replace(/^\//, ''));
  if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r2.writeHead(404); r2.end('nf'); return; }
  r2.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(fp).pipe(r2);
});
await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-proxy-server', '--remote-debugging-port=' + CDP, '--user-data-dir=C:\\tmp\\cdp_card_' + Date.now(), '--window-size=' + (process.env.RY_VP || '1520,980')], { stdio: 'ignore' });
const hreq = (m, p) => new Promise((res, rej) => {
  const q = http.request({ host: '127.0.0.1', port: CDP, path: p, method: m }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); });
  q.on('error', rej); q.end();
});
for (let i = 0; i < 60; i++) { try { await hreq('GET', '/json/version'); break; } catch (e) { await sleep(300); } }
let idc = 1, ws = null; const pend = {};
const send = (m, p = {}) => new Promise((res, rej) => { const id = idc++; pend[id] = { res, rej }; ws.send(JSON.stringify({ id, method: m, params: p })); setTimeout(() => { if (pend[id]) { delete pend[id]; rej(new Error('timeout')); } }, 60000); });
const url = process.env.RY_URL || ('http://127.0.0.1:' + PORT + '/index.html?full=1');
const t = JSON.parse(await hreq('PUT', '/json/new?' + encodeURIComponent(url)));
ws = new WS(t.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
ws.addEventListener('message', e => { const o = JSON.parse(e.data); if (o.id && pend[o.id]) { const { res, rej } = pend[o.id]; delete pend[o.id]; o.error ? rej(new Error(o.error.message)) : res(o.result); } });
await send('Runtime.enable'); await send('Page.enable');
const VP = (process.env.RY_VP || '1520,980').split(',').map(Number);
await send('Emulation.setDeviceMetricsOverride', { width: VP[0], height: VP[1], deviceScaleFactor: 1, mobile: false });
for (let i = 0; i < 50; i++) { const r = await send('Runtime.evaluate', { expression: "document.readyState==='complete'", returnByValue: true }); if (r.result && r.result.value === true) break; await sleep(700); }
for (let i = 0; i < 60; i++) { const r = await send('Runtime.evaluate', { expression: "!!window.RyPlanParams && !!document.getElementById('tlPumpUpdateBox')", returnByValue: true }); if (r.result && r.result.value === true) break; await sleep(500); }
await sleep(1000);
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return { __err: r.exceptionDetails.text }; return r.result.value; };
/* 先切到三级视图（否则祖先隐藏），再把卡片本身强制显示 */
await ev(`(function(){ try{ window.rySetTab && window.rySetTab('tlPipePlanSection','pipe');
  window.ryShowSection && window.ryShowSection('tlPipePlanSection'); return true; }catch(e){ return String(e); } })()`);
await sleep(1800);
const out = {};
for (const sel of ['#tlPumpUpdateBox', '#tlLossCard']) {
  await ev(`(function(){ var el=document.querySelector('${sel}'); if(!el) return 'missing';
    el.style.setProperty('display','block','important'); return getComputedStyle(el).display; })()`);
  await sleep(400);
  const dump = await ev(`(function(){
    var root = document.querySelector('${sel}'); if(!root) return {err:'missing'};
    function own(el){ for(var i=0;i<el.childNodes.length;i++){var n=el.childNodes[i]; if(n.nodeType===3&&n.nodeValue.trim()!=='')return true;} return false; }
    var rows=[], list=root.querySelectorAll('*');
    var push=function(el,txt){
      var r=el.getBoundingClientRect(); if(r.width===0||r.height===0) return;
      var cs=getComputedStyle(el);
      var c=(typeof el.className==='string'&&el.className.trim())?'.'+el.className.trim().split(/\\s+/).slice(0,2).join('.'):'';
      rows.push({el:el.tagName.toLowerCase()+(el.id?'#'+el.id:'')+c, txt:txt, fs:cs.fontSize, fw:cs.fontWeight, lh:cs.lineHeight});
    };
    var ccs=getComputedStyle(root);
    rows.push({el:'(卡片本体)', txt:'', fs:ccs.fontSize, fw:ccs.fontWeight, lh:ccs.lineHeight});
    for(var i=0;i<list.length;i++){ var el=list[i];
      if(/^(SCRIPT|STYLE|LINK|META|SVG|PATH|CIRCLE|LINE|RECT|TEXT|G)$/.test(el.tagName)) continue;
      if(/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(el.tagName)){ push(el,'['+el.tagName.toLowerCase()+'] '+(el.textContent||el.value||'').trim().slice(0,12)); continue; }
      if(!own(el)) continue;
      var tx=''; for(var k=0;k<el.childNodes.length;k++){var n=el.childNodes[k]; if(n.nodeType===3)tx+=n.nodeValue;}
      push(el,tx.trim().replace(/\\s+/g,' ').slice(0,20));
    }
    return {rows:rows};
  })()`);
  out[sel] = dump;
}
fs.writeFileSync(path.join(ROOT, OUT), JSON.stringify(out, null, 1));
for (const sel of Object.keys(out)) {
  console.log('\n===== ' + sel + ' =====');
  const r = out[sel];
  if (r.err) { console.log('  ERR ' + r.err); continue; }
  (r.rows || []).forEach(x => console.log('  ' + (x.fs + '/' + x.fw).padEnd(11) + ' lh=' + x.lh.padEnd(8) + x.el + '  «' + x.txt + '»'));
}
console.log('\n明细 → ' + OUT);
ws.close(); try { child.kill(); } catch (e) { } srv.close(); process.exit(0);
