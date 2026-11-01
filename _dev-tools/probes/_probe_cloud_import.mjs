'use strict';
/* v588 云端地块库「载入地图」回填主站：
   I1 打开 index.html?cloudring=… 后自动切到在线地图页
   I2 地块被画到地图上（.ry-mpoly 存在）且亩数显示 > 0
   I3 URL 参数已清掉（刷新不会重复导入）
   用法：node _probe_cloud_import.mjs */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { spawn } = require('child_process');
const http = require('http'); const fs = require('fs'); const path = require('path');
const WS = globalThis.WebSocket;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = 'C:/Users/AHS/runye-irrigation';
const PORT = 35460 + Math.floor(Math.random() * 30);
const CDP = 34960 + Math.floor(Math.random() * 30);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const srv = http.createServer((req, r2) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const fp = path.join(ROOT, p.replace(/^\//, '')); if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r2.writeHead(404); r2.end('nf'); return; }
  r2.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(fp).pipe(r2); });
await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-proxy-server', '--host-resolver-rules=MAP cdn.jsdelivr.net 127.0.0.1', '--remote-debugging-port=' + CDP, '--user-data-dir=C:\\tmp\\cdp_ci_' + Date.now(), '--window-size=1400,900'], { stdio: 'ignore' });
const hreq = (m, p) => new Promise((res, rej) => { const q = http.request({ host: '127.0.0.1', port: CDP, path: p, method: m }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); }); q.on('error', rej); q.end(); });
for (let i = 0; i < 60; i++) { try { await hreq('GET', '/json/version'); break; } catch (e) { await sleep(300); } }
let idc = 1, ws; const pend = {};
const send = (m, p = {}) => new Promise((res, rej) => { const id = idc++; pend[id] = { res, rej }; ws.send(JSON.stringify({ id, method: m, params: p })); setTimeout(() => { if (pend[id]) { delete pend[id]; rej(new Error('timeout ' + m)); } }, 120000); });
/* 一个约 30 亩的矩形（GCJ-02 经纬度） */
const ring = [[34.5000, 115.5000], [34.5000, 115.5100], [34.5080, 115.5100], [34.5080, 115.5000]];
const url = 'http://127.0.0.1:' + PORT + '/index.html?cloudring=' + encodeURIComponent(JSON.stringify(ring)) + '&cloudname=' + encodeURIComponent('测试地块');
const t = JSON.parse(await hreq('PUT', '/json/new?' + encodeURIComponent(url)));
ws = new WS(t.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
ws.addEventListener('message', e => { const o = JSON.parse(e.data); if (o.id && pend[o.id]) { const { res, rej } = pend[o.id]; delete pend[o.id]; o.error ? rej(new Error(o.error.message)) : res(o.result); } });
await send('Runtime.enable'); await send('Page.enable');
ws.addEventListener('message', e => { const o = JSON.parse(e.data); if (o.method === 'Page.javascriptDialogOpening') { ws.send(JSON.stringify({ id: idc++, method: 'Page.handleJavaScriptDialog', params: { accept: true } })); } });
try { await send('Page.bringToFront'); await send('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch (e) { }
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return { __err: String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text) }; return r.result.value; };
for (let i = 0; i < 80; i++) { if (await ev("!!window.RyPlanParams") === true) break; await sleep(500); }
await sleep(2500);

const out = await ev(`(function(){
  var sec=document.getElementById('onlineMapSection');
  var muEl=document.getElementById('mu');
  var polys=document.querySelectorAll('path.ry-mpoly, .ry-mpoly');
  return JSON.stringify({
    secActive: sec? (sec.getAttribute('class')||'') : 'none',
    mu: muEl? muEl.textContent : '-',
    polyCount: polys.length,
    hasParam: location.search.indexOf('cloudring')>=0,
    search: location.search.slice(0,40)
  });
})()`);
if (out.__err) { console.log('ERR ' + out.__err); process.exit(2); }
const r = JSON.parse(out);
console.log('在线地图区块 class: ' + r.secActive);
console.log('亩数显示: ' + r.mu + ' ｜ 地图多边形数: ' + r.polyCount + ' ｜ URL 仍有参数: ' + r.hasParam + '（' + r.search + '）');

const L = []; const A = (n, ok, g, w) => L.push((ok ? 'OK   ' : 'FAIL ') + n + ' = ' + g + (ok ? '' : '  (期望 ' + w + ')'));
A('I1 自动切到在线地图页', /ry-active/.test(r.secActive), r.secActive, '含 ry-active');
A('I2 地块已画到地图（多边形 + 亩数>0）', r.polyCount >= 1 && parseFloat(String(r.mu).replace(/,/g, '')) > 0, '多边形 ' + r.polyCount + '、亩 ' + r.mu, '多边形≥1 且亩数>0');
A('I3 URL 参数已清除', r.hasParam === false, 'hasParam=' + r.hasParam, 'false');
console.log('');
console.log(L.join('\n'));
const fail = L.filter(x => x.startsWith('FAIL')).length;
console.log('--- ' + (L.length - fail) + '/' + L.length + ' 通过');
try { child.kill(); } catch (e) { }
srv.close();
process.exit(0);
