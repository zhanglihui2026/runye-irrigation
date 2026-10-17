'use strict';
/* 二级 vs 三级：同名部件的 computed 样式对照
   回答「两个工具栏现在还差在哪」。用法：node _probe_pp_vs_tl.mjs */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WS = globalThis.WebSocket;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = process.env.RY_ROOT || 'C:/Users/AHS/runye-irrigation';
const PORT = 15900 + Math.floor(Math.random() * 40);
const CDP = 15500 + Math.floor(Math.random() * 40);
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
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-proxy-server', '--host-resolver-rules=MAP cdn.jsdelivr.net 127.0.0.1', '--remote-debugging-port=' + CDP, '--user-data-dir=C:\\tmp\\cdp_cmp_' + Date.now(), '--window-size=1520,980'], { stdio: 'ignore' });
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
await sleep(1200);
/* 让两条左栏都进 rail */
for (let i = 0; i < 12; i++) {
  await ev("(function(){ try{ window.ryShowSection('tlPipePlanSection'); }catch(e){} document.body.setAttribute('data-ry-sec','tlPipePlanSection'); document.body.classList.remove('ry-tool'); document.body.classList.add('ry-tool'); return 1; })()");
  await sleep(700);
  const ok = await ev("(function(){var a=document.getElementById('ppSide'),b=document.getElementById('tlSide');return !!(a&&a.closest('#ryCadSide'))&&!!(b&&b.closest('#ryCadSide'));})()");
  if (ok === true) break;
}
await sleep(800);

const PROBE = `(function(){
  var PROPS=['fontSize','fontWeight','lineHeight','color','backgroundColor','paddingTop','paddingBottom','paddingLeft','paddingRight',
    'marginTop','marginBottom','height','borderRadius','borderTopWidth','gap','display','textAlign','letterSpacing'];
  var CLASSES=['.pp-plan-label','.pp-plan-val','.pp-plan-unit','.pp-plan-item','.pp-plan-item input','.pp-plan-bar','.pp-btn',
    '.pp-cols-h1','.pp-cols-h2','.pp-plan-val-real','.pp-head-break','.pp-recipe-btn','.pp-cal-sel','.pp-hint'];
  function pick(root, sel){
    if(!root) return null;
    var el=root.querySelector(sel); if(!el) return null;
    var cs=getComputedStyle(el); var o={};
    PROPS.forEach(function(p){ o[p]=cs[p]; });
    var r=el.getBoundingClientRect(); o._w=Math.round(r.width*10)/10; o._h=Math.round(r.height*10)/10;
    o._txt=(el.textContent||'').trim().slice(0,10);
    return o;
  }
  var out={};
  CLASSES.forEach(function(c){ out[c]={pp:pick(document.getElementById('ppSide'),c), tl:pick(document.getElementById('tlSide'),c)}; });
  return out;
})()`;
const res = await ev(PROBE);
if (res && res.__err) { console.log('ERR', res.__err); }
else {
  const order = ['fontSize', 'fontWeight', 'color', 'backgroundColor', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'height', 'borderRadius', 'gap', 'display', 'textAlign'];
  let same = 0, diff = 0;
  for (const cls of Object.keys(res)) {
    const { pp, tl } = res[cls];
    if (!pp || !tl) { console.log('\n' + cls.padEnd(22) + (pp ? '（三级无此部件）' : '（二级无此部件）')); continue; }
    const d = order.filter(k => pp[k] !== tl[k]).map(k => k + ': ' + pp[k] + ' ≠ ' + tl[k]);
    const sizeSame = pp._w === tl._w && pp._h === tl._h;
    if (!d.length && sizeSame) { same++; console.log('= ' + cls.padEnd(20) + ' 完全一致'); }
    else {
      diff++;
      console.log('≠ ' + cls.padEnd(20) + (pp._txt ? '「' + pp._txt + '」「' + tl._txt + '」' : ''));
      d.forEach(x => console.log('    ' + x));
      if (!sizeSame) console.log('    尺寸: ' + pp._w + 'x' + pp._h + ' ≠ ' + tl._w + 'x' + tl._h);
    }
  }
  console.log('\n同值部件 ' + same + ' 个 / 有差异 ' + diff + ' 个');
}
ws.close(); try { child.kill(); } catch (e) { } srv.close(); process.exit(0);
