'use strict';
/* _probe_admin_ident.mjs —— 后台在「匿名会话」身份下的实际呈现（v631）
 * 用法：SHOT=/c/tmp/admin_anon.png node _probe_admin_ident.mjs
 * 流程：先在同一个 profile 里打开主程序（会走 ensureAnon 建匿名会话），
 *      再打开 plugin-admin.html —— 复现用户看到「没有管理权限」的那种状态，
 *      检查新版是否把真实原因（匿名身份）写清楚、有没有「回主程序」入口。
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { spawn } = require('child_process');
const http = require('http'); const fs = require('fs');
const WS = globalThis.WebSocket;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CDP = 49580 + Math.floor(Math.random() * 40);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BASE = process.env.BASE || 'https://zhanglihui2026.github.io/runye-irrigation/';
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-proxy-server',
  '--remote-debugging-port=' + CDP, '--user-data-dir=C:\\tmp\\cdp_adminid_' + Date.now(), '--window-size=1400,900'], { stdio: 'ignore' });
const hreq = (m, p) => new Promise((res, rej) => { const q = http.request({ host: '127.0.0.1', port: CDP, path: p, method: m }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); }); q.on('error', rej); q.end(); });
for (let i = 0; i < 60; i++) { try { await hreq('GET', '/json/version'); break; } catch (e) { await sleep(300); } }
let idc = 1, ws; const pend = {};
const send = (m, p = {}) => new Promise((res, rej) => { const id = idc++; pend[id] = { res, rej }; ws.send(JSON.stringify({ id, method: m, params: p })); setTimeout(() => { if (pend[id]) { delete pend[id]; rej(new Error('timeout ' + m)); } }, 90000); });
const t = JSON.parse(await hreq('PUT', '/json/new?' + encodeURIComponent(BASE + 'index.html?full=1')));
ws = new WS(t.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
let navTarget = null;
ws.addEventListener('message', e => { const o = JSON.parse(e.data); if (o.id && pend[o.id]) { const { res, rej } = pend[o.id]; delete pend[o.id]; o.error ? rej(new Error(o.error.message)) : res(o.result); return; } if (o.method === 'Page.javascriptDialogOpening') { ws.send(JSON.stringify({ id: idc++, method: 'Page.handleJavaScriptDialog', params: { accept: true } })); } });
await send('Runtime.enable'); await send('Page.enable');
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true, timeout: 90000 }); if (r.exceptionDetails) return { __err: String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text).slice(0, 300) }; return r.result.value; };

/* ① 让主程序建好匿名会话（真实路径：runye-member-ui 的 boot → ensureAnon） */
for (let i = 0; i < 120; i++) { if (await ev('!!(window.CloudSync && window.CloudSync.authInfo)') === true) break; await sleep(500); }
for (let i = 0; i < 40; i++) {
  const info = await ev('window.CloudSync.authInfo()');
  if (info && info.sub) break;
  await sleep(500);
}
console.log('主程序身份:', JSON.stringify(await ev('window.CloudSync.authInfo()')));

/* ② 同一个 profile 打开后台 */
const url2 = BASE + 'plugin-admin.html?_=' + Date.now();
await send('Page.navigate', { url: url2 });
await sleep(2000);
for (let i = 0; i < 120; i++) { if (await ev('!!document.getElementById("service")') === true) break; await sleep(400); }
for (let i = 0; i < 60; i++) {
  const svc = await ev('(document.getElementById("service")||{}).textContent||""');
  if (svc && svc.indexOf('检查中') < 0) break;
  await sleep(700);
}
const state = await ev(`(function(){
  var g=function(id){var e=document.getElementById(id);return e?e.textContent:null};
  var hint=document.getElementById('serviceHint');
  return {ver:(document.getElementById('admVer')||{}).textContent,
    service:g('service'), account:g('account'), hint:hint?hint.textContent:null,
    hintHtml:hint?hint.innerHTML.slice(0,300):null,
    hasBackLink:!!(hint&&hint.querySelector('a[href*="index.html"]')),
    saveTitle:(document.getElementById('save')||{}).title,
    admin:window.__adminState===undefined?null:window.__adminState,
    authInfo:window.CloudSync&&CloudSync.authInfo?CloudSync.authInfo():null};
})()`);
console.log('后台状态:', JSON.stringify(state, null, 1));

if (process.env.SHOT) {
  await sleep(600);
  await send('Page.captureScreenshot', { format: 'png' });
  await sleep(300);
  const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1400, height: 420, scale: 1 } });
  fs.writeFileSync(process.env.SHOT, Buffer.from(shot.data, 'base64'));
  console.log('截图已存:', process.env.SHOT);
}
try { ws.close(); } catch (e) { }
try { child.kill('SIGKILL'); } catch (e) { }
process.exit(0);
