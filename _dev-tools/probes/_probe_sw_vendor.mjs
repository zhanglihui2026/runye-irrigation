'use strict';
/* _probe_sw_vendor.mjs —— 验证 CloudBase SDK 已进「跨版本保留」的 VENDOR 缓存，且第二次加载不再走网络
 * 断言：① caches.keys() 里有 ...-vendor；② vendor 缓存里有 SDK 条目；
 *       ③ 第二次加载时该 bundle 的网络请求数 = 0（缓存优先命中）。
 */
import { createRequire } from 'module';
import http from 'http';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);
const { spawn } = require('child_process');
const ROOT = 'C:/Users/AHS/runye-irrigation';
const LPORT = 47833, CDP = 49210 + Math.floor(Math.random() * 40);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const srv = http.createServer((req, r2) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const fp = path.join(ROOT, p.replace(/^\//, ''));
  if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r2.writeHead(404); r2.end('nf'); return; }
  r2.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(fp).pipe(r2);
});
await new Promise(r => srv.listen(LPORT, '127.0.0.1', r));
const hreq = (m, p) => new Promise((res, rej) => { const q = http.request({ host: '127.0.0.1', port: CDP, path: p, method: m }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); }); q.on('error', rej); q.end(); });
const child = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ['--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=' + CDP, '--user-data-dir=' + (process.env.PROFILE || 'C:\\tmp\\cdp_swv_' + Date.now()), '--window-size=1280,900'], { stdio: 'ignore' });
for (let i = 0; i < 60; i++) { try { await hreq('GET', '/json/version'); break; } catch (e) { await sleep(300); } }
let idc = 1, ws; const pend = {}; let bundleReqs = 0;
const send = (m, p = {}) => new Promise((res, rej) => { const id = idc++; pend[id] = { res, rej }; ws.send(JSON.stringify({ id, method: m, params: p })); setTimeout(() => { if (pend[id]) { delete pend[id]; rej(new Error('timeout ' + m)); } }, 60000); });
const t = JSON.parse(await hreq('PUT', '/json/new?' + encodeURIComponent('http://127.0.0.1:' + LPORT + '/plugin-admin.html')));
ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
ws.addEventListener('message', e => {
  const o = JSON.parse(e.data);
  if (o.id && pend[o.id]) { const { res, rej } = pend[o.id]; delete pend[o.id]; o.error ? rej(new Error(o.error.message)) : res(o.result); return; }
  if (o.method === 'Network.requestWillBeSent' && /cloudbase-js-sdk/.test(o.params.request.url)) bundleReqs++;
});
await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return { __err: String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text).slice(0, 200) }; return r.result.value; };

/* SW 由主页面注册（作用域是站根），先开 index.html 把 SW 装上，再测后台页 */
await send('Page.navigate', { url: 'http://127.0.0.1:' + LPORT + '/index.html' });
for (let i = 0; i < 60; i++) { await sleep(500); if (await ev('typeof window.CloudSync') === 'object') break; }
/* 等 SW 注册 + 预缓存完成 */
for (let i = 0; i < 60; i++) { await sleep(500); const st = await ev("(async()=>{const r=await navigator.serviceWorker.getRegistration();return r?(r.active?'active':'no-active'):'no-reg';})()"); if (st === 'active') break; }
await sleep(4000);
/* 再打开后台页（此时已被 SW 接管），量 vendor 缓存 */
await send('Page.navigate', { url: 'http://127.0.0.1:' + LPORT + '/plugin-admin.html' });
for (let i = 0; i < 60; i++) { await sleep(400); if (await ev('typeof window.CloudSync') === 'object') break; }
await sleep(1500);
console.log('caches =', JSON.stringify(await ev("caches.keys()")));
console.log('vendor 缓存条目 =', JSON.stringify(await ev("(async()=>{const k=(await caches.keys()).filter(x=>x.endsWith('-vendor'));if(!k.length)return [];const c=await caches.open(k[0]);const ks=await c.keys();return ks.map(r=>r.url.split('/').pop());})()")));
console.log('typeof cloudbase =', await ev('typeof cloudbase'));

bundleReqs = 0;
await send('Page.reload', { ignoreCache: false });
for (let i = 0; i < 60; i++) { await sleep(400); if (await ev('typeof window.CloudSync') === 'object') break; }
await sleep(2500);
console.log('第二次加载 SDK 网络请求数 =', bundleReqs);
const perf = await ev("(function(){var e=performance.getEntriesByType('resource').filter(function(x){return /cloudbase-js-sdk/.test(x.name)});return e.map(function(x){return {name:x.name.split('/').pop(),transferSize:x.transferSize,dur:Math.round(x.duration)}})})()");
console.log('SDK 资源条目 =', JSON.stringify(perf));
console.log('service 文本 =', JSON.stringify(await ev("(function(){var e=document.getElementById('service');return e?e.textContent.trim():'(无)';})()")));
console.log('retryBtn 可见 =', await ev("(function(){var b=document.getElementById('retryBtn');return b?b.style.display!=='none':null;})()"));

/* 决定性一步：把本地服务器关掉再加载 —— 若 SDK 仍可用，说明确实来自 SW 缓存 */
console.log('\n[关掉本地服务器后重载]');
await new Promise(r => srv.close(r));
await send('Page.reload', { ignoreCache: false });
await sleep(6000);
console.log('  typeof cloudbase =', await ev('typeof cloudbase'));
console.log('  CloudSync =', await ev('typeof window.CloudSync'));
console.log('  service 文本 =', JSON.stringify(await ev("(function(){var e=document.getElementById('service');return e?e.textContent.trim():'(无)';})()")));
console.log('  _cloudLastError =', JSON.stringify(await ev('window._cloudLastError||null')));
try { ws.close(); } catch (e) { }
try { child.kill('SIGKILL'); } catch (e) { }
srv.close(); process.exit(0);
