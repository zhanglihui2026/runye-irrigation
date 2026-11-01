'use strict';
/* 字号 A/B 快照：激活区块后，dump 该容器内每个可见元素的 fontSize（path 为 key）
   用法：node _dump_fonts.mjs <page> <sectionOrEmpty> <containerSel> <out.json> */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { spawn, spawnSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WS = globalThis.WebSocket;

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = 'C:/Users/AHS/runye-irrigation';
const PAGE = process.argv[2] || 'index.html';
const SECTION = process.argv[3] || '';
const CONTAINER = process.argv[4] || 'body';
const OUT = process.argv[5] || '_dump_fonts.json';
const PORT = 15100 + Math.floor(Math.random() * 60);
const CDP = 14700 + Math.floor(Math.random() * 60);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const srv = http.createServer((req, r2) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const fp = path.join(ROOT, p.replace(/^\//, ''));
  if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r2.writeHead(404); r2.end('nf'); return; }
  r2.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(fp).pipe(r2);
});
await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
try { spawnSync('powershell', ['-NoProfile', '-Command', "Get-CimInstance Win32_Process -Filter \"Name='msedge.exe'\" | Where-Object { $_.CommandLine -like '*headless*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"], { stdio: 'ignore', timeout: 30000 }); } catch (e) { }
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-proxy-server', '--remote-debugging-port=' + CDP, '--user-data-dir=C:\\tmp\\cdp_dump_' + Date.now(), '--window-size=1520,980'], { stdio: 'ignore' });
const hreq = (method, p) => new Promise((res, rej) => {
  const req = http.request({ host: '127.0.0.1', port: CDP, path: p, method }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); });
  req.on('error', rej); req.end();
});
for (let i = 0; i < 60; i++) { try { await hreq('GET', '/json/version'); break; } catch (e) { await sleep(300); } }
let idc = 1, ws = null; const pend = {};
const send = (m, p = {}) => new Promise((res, rej) => { const id = idc++; pend[id] = { res, rej }; ws.send(JSON.stringify({ id, method: m, params: p })); setTimeout(() => { if (pend[id]) { delete pend[id]; rej(new Error('timeout')); } }, 60000); });
const url = 'http://127.0.0.1:' + PORT + '/' + PAGE + (PAGE.indexOf('?') >= 0 ? '' : '?full=1');
const t = JSON.parse(await hreq('PUT', '/json/new?' + encodeURIComponent(url)));
ws = new WS(t.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
ws.addEventListener('message', e => { const o = JSON.parse(e.data); if (o.id && pend[o.id]) { const { res, rej } = pend[o.id]; delete pend[o.id]; o.error ? rej(new Error(o.error.message)) : res(o.result); } });
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1520, height: 980, deviceScaleFactor: 1, mobile: false });
for (let i = 0; i < 50; i++) {
  const r = await send('Runtime.evaluate', { expression: "(document.readyState==='complete')", returnByValue: true });
  if (r.result && r.result.value === true) break;
  await sleep(700);
}
await sleep(1500);
const ev = async x => {
  const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { __err: String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text) };
  return r.result.value;
};
if (SECTION) {
  const ok = await ev(`(function(){ try{ window.ryShowSection && window.ryShowSection('${SECTION}'); return true; }catch(e){ return String(e); } })()`);
  console.log('showSection(' + SECTION + ')=' + JSON.stringify(ok));
  await sleep(1500);
  /* 离线无 CDN 时区块可能不显示（地图/地形依赖外部资源），强制 display:block 再量
     —— A/B 两次都用同样的强制，可比 */
  const forced = await ev(`(function(){
    var el = document.querySelector(${JSON.stringify(CONTAINER)});
    if (!el) return 'missing';
    el.style.setProperty('display','block','important');
    el.removeAttribute('hidden');
    return getComputedStyle(el).display;
  })()`);
  console.log('forced display=' + JSON.stringify(forced));
  await sleep(600);
}
const info = await ev(`(function(){
  var root = document.querySelector(${JSON.stringify(CONTAINER)});
  if (!root) return { err: 'container missing' };
  var cs = getComputedStyle(root);
  return { display: cs.display, vis: cs.visibility, h: root.getBoundingClientRect().height,
           cls: root.className, view: document.body.getAttribute('data-ry-view') || document.body.dataset.ryView || '',
           sec: document.body.getAttribute('data-ry-sec') || '' };
})()`);
console.log('container=' + JSON.stringify(info));
const dump = await ev(`(function(){
  var root = document.querySelector(${JSON.stringify(CONTAINER)});
  if (!root) return { err: 'container missing' };
  function pathOf(el){
    var segs = [];
    while (el && el !== root) {
      var p = el.parentNode, i = p ? Array.prototype.indexOf.call(p.children, el) : 0;
      segs.unshift(el.tagName.toLowerCase() + ':' + i);
      el = p;
    }
    return segs.join('>');
  }
  var out = {};
  var list = root.querySelectorAll('*');
  for (var i = 0; i < list.length; i++) {
    var el = list[i];
    if (/^(SCRIPT|STYLE|LINK|META)$/.test(el.tagName)) continue;
    var r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    var cs = getComputedStyle(el);
    out[pathOf(el)] = cs.fontSize + '|' + cs.lineHeight;
  }
  return out;
})()`);
if (dump && dump.__err) { console.log('ERR ' + dump.__err); }
else {
  const keys = Object.keys(dump);
  fs.writeFileSync(path.join(ROOT, OUT), JSON.stringify(dump, null, 0));
  console.log('元素 ' + keys.length + ' → ' + OUT);
}
ws.close(); try { child.kill(); } catch (e) { } srv.close(); process.exit(0);
