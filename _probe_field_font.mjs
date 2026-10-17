'use strict';
/* 量「真实可见」的输入框字号（sl-input shadow 内 native input）与黑底计算式条的字号分布 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { spawn } = require('child_process');
const http = require('http'), fs = require('fs'), path = require('path');
const WS = globalThis.WebSocket;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = process.env.RY_ROOT || 'C:/Users/AHS/runye-irrigation';
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
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-proxy-server', '--remote-debugging-port=' + CDP, '--user-data-dir=C:\\tmp\\cdp_ff_' + Date.now(), '--window-size=1520,980'], { stdio: 'ignore' });
const hreq = (m, p) => new Promise((res, rej) => {
  const q = http.request({ host: '127.0.0.1', port: CDP, path: p, method: m }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); });
  q.on('error', rej); q.end();
});
for (let i = 0; i < 60; i++) { try { await hreq('GET', '/json/version'); break; } catch (e) { await sleep(300); } }
let idc = 1, ws = null; const pend = {};
const send = (m, p = {}) => new Promise((res, rej) => { const id = idc++; pend[id] = { res, rej }; ws.send(JSON.stringify({ id, method: m, params: p })); setTimeout(() => { if (pend[id]) { delete pend[id]; rej(new Error('timeout')); } }, 60000); });
const t = JSON.parse(await hreq('PUT', '/json/new?' + encodeURIComponent('http://127.0.0.1:' + PORT + '/index.html?full=1')));
ws = new WS(t.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
ws.addEventListener('message', e => { const o = JSON.parse(e.data); if (o.id && pend[o.id]) { const { res, rej } = pend[o.id]; delete pend[o.id]; o.error ? rej(new Error(o.error.message)) : res(o.result); } });
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1520, height: 980, deviceScaleFactor: 1, mobile: false });
for (let i = 0; i < 50; i++) { const r = await send('Runtime.evaluate', { expression: "document.readyState==='complete'", returnByValue: true }); if (r.result && r.result.value === true) break; await sleep(700); }
for (let i = 0; i < 60; i++) { const r = await send('Runtime.evaluate', { expression: "!!window.RyPlanParams && !!document.getElementById('ppSide')", returnByValue: true }); if (r.result && r.result.value === true) break; await sleep(500); }
await sleep(1200);
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return { __err: r.exceptionDetails.text }; return r.result.value; };
const out = await ev(`(function(){
  function fsOf(el){ if(!el) return null; var c=getComputedStyle(el); return c.fontSize+'/'+c.fontWeight; }
  var res={};
  var sl=document.querySelectorAll('#ppSide sl-input');
  var samples=[];
  for(var i=0;i<Math.min(sl.length,4);i++){
    var s=sl[i], inner=s.shadowRoot&&s.shadowRoot.querySelector('input');
    samples.push({host:fsOf(s), inner:fsOf(inner), varSmall:getComputedStyle(s).getPropertyValue('--sl-input-font-size-small').trim(), hidden:s.hasAttribute('hidden')});
  }
  res.slInputs=samples;
  var f=document.getElementById('ppCalcDetail');
  res.calcDetail={ txt:(f?f.textContent:'').slice(0,40), fs: f?fsOf(f):null, h: f?Math.round(f.getBoundingClientRect().height):null };
  if(f){ var inner2=f.querySelectorAll('*'); var g={};
    for(var j=0;j<inner2.length;j++){ var k=fsOf(inner2[j]); if(!k) continue; var tx=(inner2[j].textContent||'').trim().slice(0,14); (g[k]=g[k]||[]).push(tx); }
    res.calcInner=g; }
  var pl=document.querySelector('#ppSide .pp-plan-label');
  res.ppLabel = pl? { fs:fsOf(pl), lh:getComputedStyle(pl).lineHeight, h:Math.round(pl.getBoundingClientRect().height*10)/10 } : null;
  var tl2=document.querySelector('#tlSide .pp-plan-label');
  res.tlLabel = tl2? { fs:fsOf(tl2), lh:getComputedStyle(tl2).lineHeight, h:Math.round(tl2.getBoundingClientRect().height*10)/10 } : null;
  var sel=document.getElementById('ppRecipeSelect');
  res.recipeSel = sel? {fs:fsOf(sel), h:Math.round(sel.getBoundingClientRect().height)} : null;
  var ap=document.getElementById('ppRecipeApply');
  res.recipeBtn = ap? {fs:fsOf(ap), h:Math.round(ap.getBoundingClientRect().height)} : null;
  var cal=document.querySelector('#tlSide .pp-cal-sel');
  res.tlCalSel = cal? {fs:fsOf(cal), h:Math.round(cal.getBoundingClientRect().height)} : null;
  return res;
})()`);
console.log(JSON.stringify(out, null, 1));
ws.close(); try { child.kill(); } catch (e) { } srv.close(); process.exit(0);
