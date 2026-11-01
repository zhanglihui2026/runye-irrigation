'use strict';
/* v585 水源→总管起点那段也要有水流：
   S1 水流路径首点 = 水源圆点（#f59e0b 最近那枚）
   S2 第二点 = 总管 path 起点（fPts[0]）
   S3 两者距离 > 1px（确实补了一段，不是零长）
   用法：node _probe_flow_srcseg.mjs */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { spawn } = require('child_process');
const http = require('http'); const fs = require('fs'); const path = require('path');
const WS = globalThis.WebSocket;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = 'C:/Users/AHS/runye-irrigation';
const PORT = 33460 + Math.floor(Math.random() * 30);
const CDP = 32960 + Math.floor(Math.random() * 30);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const srv = http.createServer((req, r2) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const fp = path.join(ROOT, p.replace(/^\//, '')); if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r2.writeHead(404); r2.end('nf'); return; }
  r2.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(fp).pipe(r2); });
await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-proxy-server', '--host-resolver-rules=MAP cdn.jsdelivr.net 127.0.0.1', '--remote-debugging-port=' + CDP, '--user-data-dir=C:\\tmp\\cdp_fs_' + Date.now(), '--window-size=1400,900'], { stdio: 'ignore' });
const hreq = (m, p) => new Promise((res, rej) => { const q = http.request({ host: '127.0.0.1', port: CDP, path: p, method: m }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); }); q.on('error', rej); q.end(); });
for (let i = 0; i < 60; i++) { try { await hreq('GET', '/json/version'); break; } catch (e) { await sleep(300); } }
let idc = 1, ws; const pend = {};
const send = (m, p = {}) => new Promise((res, rej) => { const id = idc++; pend[id] = { res, rej }; ws.send(JSON.stringify({ id, method: m, params: p })); setTimeout(() => { if (pend[id]) { delete pend[id]; rej(new Error('timeout ' + m)); } }, 120000); });
const t = JSON.parse(await hreq('PUT', '/json/new?' + encodeURIComponent('http://127.0.0.1:' + PORT + '/index.html?full=1')));
ws = new WS(t.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
ws.addEventListener('message', e => { const o = JSON.parse(e.data); if (o.id && pend[o.id]) { const { res, rej } = pend[o.id]; delete pend[o.id]; o.error ? rej(new Error(o.error.message)) : res(o.result); } });
await send('Runtime.enable'); await send('Page.enable');
ws.addEventListener('message', e => { const o = JSON.parse(e.data); if (o.method === 'Page.javascriptDialogOpening') { ws.send(JSON.stringify({ id: idc++, method: 'Page.handleJavaScriptDialog', params: { accept: true } })); } });
try { await send('Page.bringToFront'); await send('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch (e) { }
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return { __err: String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text) }; return r.result.value; };
for (let i = 0; i < 80; i++) { if (await ev("!!window.RyPlanParams") === true) break; await sleep(500); }

const out = await ev(`(function(){
  try{ window.rySetTab('tlPipePlanSection','pipe'); }catch(e){}
  var n=document.getElementById('tlDiagramContent');
  while(n&&n!==document.documentElement){ try{n.style.setProperty('display','block','important');}catch(e){} n=n.parentElement; }
  try{ localStorage.removeItem('tlFrontNodeDrops_v1'); }catch(e){}
  window.measuredPolygon=[{x:0,y:0},{x:700,y:0},{x:700,y:400},{x:0,y:400}];
  window.tlAutoGenerate(); window.tlAutoGenerate();
  try{ window.tlApplyDemoHighlight(1); }catch(e){}
  var svg=document.querySelector('#tlDiagramContent svg');
  var fr=svg.querySelector('path[data-tlpipe="front"][data-tlpipe-ref]')||svg.querySelector('path[data-tlpipe="front"]');
  function P(s){ var a=(s.match(/-?\\d+(?:\\.\\d+)?/g)||[]).map(Number),o=[]; for(var i=0;i+1<a.length;i+=2)o.push([a[i],a[i+1]]); return o; }
  var F=P(fr.getAttribute('d'));
  var srcs=[].slice.call(svg.querySelectorAll('circle[fill="#f59e0b"]'));
  var best=null;
  srcs.forEach(function(c){ var x=+c.getAttribute('cx'),y=+c.getAttribute('cy');
    var d=Math.hypot(x-F[0][0],y-F[0][1]); if(!best||d<best.d) best={x:x,y:y,d:d}; });
  var fl=[].slice.call(svg.querySelectorAll('[data-tlflow="flow"]')).map(function(f){ return P(f.getAttribute('d')); });
  var srcPipe=svg.querySelector('path[data-tlsrcpipe]');
  return JSON.stringify({ frontStart:F[0], src:best, flows:fl.slice(0,3).map(function(p){return p.slice(0,3);}),
    srcPipeD: srcPipe?srcPipe.getAttribute('d'):null });
})()`);
if (out.__err) { console.log('ERR ' + out.__err); process.exit(2); }
const r = JSON.parse(out);
console.log('总管起点 fPts[0] = ' + JSON.stringify(r.frontStart));
console.log('水源圆点(最近)  = ' + JSON.stringify(r.src));
console.log('水源连接段 path = ' + r.srcPipeD);
console.log('水流前三组前3点：');
r.flows.forEach(function (f, i) { console.log('  [' + i + '] ' + JSON.stringify(f)); });

const L = []; const A = (n, ok, g, w) => L.push((ok ? 'OK   ' : 'FAIL ') + n + ' = ' + g + (ok ? '' : '  (期望 ' + w + ')'));
const d1 = r.flows.map(function (f) { return Math.hypot(f[0][0] - r.src.x, f[0][1] - r.src.y); });
const d2 = r.flows.map(function (f) { return Math.hypot(f[1][0] - r.frontStart[0], f[1][1] - r.frontStart[1]); });
A('S1 水流首点 = 水源圆点', d1.every(function (d) { return d < 1.5; }), '偏差 ' + d1.map(function (d) { return d.toFixed(2); }).join(','), '<1.5px');
A('S2 水流第二点 = 总管起点', d2.every(function (d) { return d < 2; }), '偏差 ' + d2.map(function (d) { return d.toFixed(2); }).join(','), '<2px');
A('S3 水源与总管起点确有距离（补了一段）', r.src.d > 1, '水源距总管起点 ' + r.src.d.toFixed(1) + ' px', '>1px');
console.log('');
console.log(L.join('\n'));
const fail = L.filter(x => x.startsWith('FAIL')).length;
console.log('--- ' + (L.length - fail) + '/' + L.length + ' 通过');
try { child.kill(); } catch (e) { }
srv.close();
process.exit(0);
