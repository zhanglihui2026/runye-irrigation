'use strict';
/* v594 右侧工具栏折叠入口：折叠态「工具栏」标签必须可见可点，点开能恢复工具栏
   P1 折叠态：标签贴视口右缘、位于可视区
   P2 标签中心点命中自身（没被别的元素盖住）
   P3 点它 → 工具栏展开（pp-rail-off 移除，.pp-toolbar 回到可视区）
   用法：node _probe_pp_rail.mjs */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { spawn } = require('child_process');
const http = require('http'); const fs = require('fs'); const path = require('path');
const WS = globalThis.WebSocket;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = 'C:/Users/AHS/runye-irrigation';
const PORT = 39460 + Math.floor(Math.random() * 30);
const CDP = 38960 + Math.floor(Math.random() * 30);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const srv = http.createServer((req, r2) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const fp = path.join(ROOT, p.replace(/^\//, '')); if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r2.writeHead(404); r2.end('nf'); return; }
  r2.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(fp).pipe(r2); });
await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-proxy-server', '--host-resolver-rules=MAP cdn.jsdelivr.net 127.0.0.1', '--remote-debugging-port=' + CDP, '--user-data-dir=C:\\tmp\\cdp_rl_' + Date.now(), '--window-size=1400,900'], { stdio: 'ignore' });
const hreq = (m, p) => new Promise((res, rej) => { const q = http.request({ host: '127.0.0.1', port: CDP, path: p, method: m }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); }); q.on('error', rej); q.end(); });
for (let i = 0; i < 60; i++) { try { await hreq('GET', '/json/version'); break; } catch (e) { await sleep(300); } }
let idc = 1, ws; const pend = {};
const send = (m, p = {}) => new Promise((res, rej) => { const id = idc++; pend[id] = { res, rej }; ws.send(JSON.stringify({ id, method: m, params: p })); setTimeout(() => { if (pend[id]) { delete pend[id]; rej(new Error('timeout ' + m)); } }, 120000); });
const t = JSON.parse(await hreq('PUT', '/json/new?' + encodeURIComponent('http://127.0.0.1:' + PORT + '/index.html')));
ws = new WS(t.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
ws.addEventListener('message', e => { const o = JSON.parse(e.data); if (o.id && pend[o.id]) { const { res, rej } = pend[o.id]; delete pend[o.id]; o.error ? rej(new Error(o.error.message)) : res(o.result); } });
await send('Runtime.enable'); await send('Page.enable');
ws.addEventListener('message', e => { const o = JSON.parse(e.data); if (o.method === 'Page.javascriptDialogOpening') { ws.send(JSON.stringify({ id: idc++, method: 'Page.handleJavaScriptDialog', params: { accept: true } })); } });
try { await send('Page.bringToFront'); await send('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch (e) { }
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return { __err: String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text) }; return r.result.value; };
const mouse = async (type, x, y) => send('Input.dispatchMouseEvent', { type: type, x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
for (let i = 0; i < 80; i++) { if (await ev("!!window.RyPlanParams") === true) break; await sleep(500); }
/* 先确保是折叠态（清掉存档 → 默认折叠） */
await ev(`(function(){ try{ localStorage.removeItem('ppRailOff'); }catch(e){} return 1; })()`);
await ev(`(function(){ try{ window.rySetTab('pipePlanSection','edit'); }catch(e){} return 1; })()`);
await sleep(2500);

const L = []; const A = (n, ok, g, w) => L.push((ok ? 'OK   ' : 'FAIL ') + n + ' = ' + g + (ok ? '' : '  (期望 ' + w + ')'));
const ST = `JSON.stringify((function(){
  var stage=document.querySelector('#pipePlanSection .pp-stage');
  var proxy=document.querySelector('.pp-rail-tab-float');
  var tb=document.querySelector('#pipePlanSection .pp-toolbar');
  function r(el){ if(!el) return null; var b=el.getBoundingClientRect(); var c=getComputedStyle(el);
    return {x:Math.round(b.left),y:Math.round(b.top),w:Math.round(b.width),h:Math.round(b.height),disp:c.display,vis:c.visibility}; }
  var pr=r(proxy), hit=null;
  if(pr && pr.w>0){ var top=document.elementFromPoint(pr.x+pr.w/2, pr.y+pr.h/2); hit= top?(top.className||top.tagName).toString().slice(0,40):null; }
  return { off: stage?stage.classList.contains('pp-rail-off'):null, proxy:pr, hit:hit, toolbar:r(tb), vw:window.innerWidth };
})())`;

let st = JSON.parse(await ev(ST));
console.log('折叠态：off=' + st.off + ' 视口宽=' + st.vw);
console.log('  「工具栏」标签 rect=' + JSON.stringify(st.proxy));
console.log('  标签中心命中=' + st.hit + ' ｜ 工具栏 rect=' + JSON.stringify(st.toolbar));
A('P1 折叠态标签在可视区内（贴右缘）', !!st.proxy && st.proxy.w > 0 && st.proxy.x > st.vw - 60, st.proxy ? ('x=' + st.proxy.x + ' w=' + st.proxy.w) : 'null', 'x 接近视口右缘');
A('P2 标签中心命中自身（没被盖住）', !!st.hit && /pp-rail-tab-float/.test(st.hit), String(st.hit), 'pp-rail-tab-float');

if (st.proxy && st.proxy.w > 0) {
  const cx = st.proxy.x + st.proxy.w / 2, cy = st.proxy.y + st.proxy.h / 2;
  await mouse('mousePressed', cx, cy); await mouse('mouseReleased', cx, cy);
  await sleep(700);
  const st2 = JSON.parse(await ev(ST));
  console.log('点击后：off=' + st2.off + ' ｜ 工具栏 rect=' + JSON.stringify(st2.toolbar));
  A('P3 点击标签后工具栏展开', st2.off === false && st2.toolbar && st2.toolbar.w > 20 && st2.toolbar.x < st2.vw, 'off=' + st2.off + ' toolbar.w=' + (st2.toolbar && st2.toolbar.w), 'off=false 且工具栏回到可视区');
} else {
  A('P3 点击标签后工具栏展开', false, '标签不可见，无法点击', '可点击');
}
console.log('');
console.log(L.join('\n'));
const fail = L.filter(x => x.startsWith('FAIL')).length;
console.log('--- ' + (L.length - fail) + '/' + L.length + ' 通过');
try { child.kill(); } catch (e) { }
srv.close();
process.exit(0);
