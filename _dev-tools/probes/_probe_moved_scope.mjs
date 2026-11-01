'use strict';
/* 校验：被迁出内联的这批选择器，有没有命中「面板之外」的元素。
   若全部为 0，则迁移在面板外不可能产生视觉影响（顺序变化只在面板内）。
   用法：node _probe_moved_scope.mjs [_moved_sels.json] */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WS = globalThis.WebSocket;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = process.env.RY_ROOT || 'C:/Users/AHS/runye-irrigation';
const SELS = JSON.parse(fs.readFileSync(process.argv[2] || '_moved_sels.json', 'utf8'));
const PORT = 16100 + Math.floor(Math.random() * 40);
const CDP = 15700 + Math.floor(Math.random() * 40);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
const srv = http.createServer((req, r2) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const fp = path.join(ROOT, p.replace(/^\//, ''));
  if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r2.writeHead(404); r2.end('nf'); return; }
  r2.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(fp).pipe(r2);
});
await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-proxy-server', '--host-resolver-rules=MAP cdn.jsdelivr.net 127.0.0.1', '--remote-debugging-port=' + CDP, '--user-data-dir=C:\\tmp\\cdp_scope_' + Date.now(), '--window-size=1520,980'], { stdio: 'ignore' });
const hreq = (m, p) => new Promise((res, rej) => { const q = http.request({ host: '127.0.0.1', port: CDP, path: p, method: m }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); }); q.on('error', rej); q.end(); });
for (let i = 0; i < 60; i++) { try { await hreq('GET', '/json/version'); break; } catch (e) { await sleep(300); } }
let idc = 1, ws; const pend = {};
const send = (m, p = {}) => new Promise((res, rej) => { const id = idc++; pend[id] = { res, rej }; ws.send(JSON.stringify({ id, method: m, params: p })); setTimeout(() => { if (pend[id]) { delete pend[id]; rej(new Error('timeout')); } }, 60000); });
const t = JSON.parse(await hreq('PUT', '/json/new?' + encodeURIComponent('http://127.0.0.1:' + PORT + '/index.html?full=1')));
ws = new WS(t.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
ws.addEventListener('message', e => { const o = JSON.parse(e.data); if (o.id && pend[o.id]) { const { res, rej } = pend[o.id]; delete pend[o.id]; o.error ? rej(new Error(o.error.message)) : res(o.result); } });
await send('Runtime.enable'); await send('Page.enable');
try { await send('Page.bringToFront'); await send('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch (e) { }
await send('Emulation.setDeviceMetricsOverride', { width: 1520, height: 980, deviceScaleFactor: 1, mobile: false });
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return { __err: String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text) }; return r.result.value; };
for (let i = 0; i < 60; i++) { const r = await ev("!!window.RyPlanParams && !!document.getElementById('ppSide')"); if (r === true) break; await sleep(500); }
for (let i = 0; i < 12; i++) {
  await ev("(function(){ try{ window.ryShowSection('tlPipePlanSection'); }catch(e){} document.body.setAttribute('data-ry-sec','tlPipePlanSection'); document.body.classList.remove('ry-tool'); document.body.classList.add('ry-tool'); return 1; })()");
  await sleep(700);
  const ok = await ev("(function(){var a=document.getElementById('ppSide'),b=document.getElementById('tlSide');return !!(a&&a.closest('#ryCadSide'))&&!!(b&&b.closest('#ryCadSide'));})()");
  if (ok === true) break;
}
await sleep(800);

const R = await ev(`(function(sels){
  var scope=['#ppSide','#tlSide','#ryCadSide'];
  function inScope(el){ for(var i=0;i<scope.length;i++){ if(el.closest(scope[i])) return true; } return false; }
  var rows=[];
  sels.forEach(function(s){
    var n=0, out=0, sample='';
    try{
      var nodes=document.querySelectorAll(s);
      n=nodes.length;
      for(var i=0;i<nodes.length;i++){ if(!inScope(nodes[i])){ out++; if(!sample) sample=(nodes[i].id?'#'+nodes[i].id:nodes[i].tagName.toLowerCase()+'.'+String(nodes[i].className).split(' ')[0]); } }
    }catch(e){ rows.push({sel:s, err:String(e).slice(0,40)}); return; }
    rows.push({sel:s, n:n, out:out, sample:sample});
  });
  return rows;
})(${JSON.stringify(SELS)})`);

if (R && R.__err) { console.log('ERR', R.__err); }
else {
  const leaked = R.filter(r => r.out > 0);
  const errs = R.filter(r => r.err);
  console.log('选择器 ' + R.length + ' 条 ｜ 解析失败 ' + errs.length + ' 条 ｜ 命中面板外 ' + leaked.length + ' 条');
  leaked.slice(0, 20).forEach(r => console.log('  ⚠ ' + r.sel.slice(0, 90) + '  面板外 ' + r.out + '/共' + r.n + ' 例:' + r.sample));
  errs.slice(0, 5).forEach(r => console.log('  解析失败: ' + r.sel.slice(0, 70) + ' — ' + r.err));
  const dead = R.filter(r => !r.err && r.n === 0).length;
  console.log('  从不命中任何元素（含面板内）= ' + dead + ' 条');
}
ws.close(); try { child.kill(); } catch (e) { } srv.close(); process.exit(0);
