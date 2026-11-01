'use strict';
/* 二级页（地块分区 #pipePlanSection）撤销回归 —— v619 动过共用的 restore()/tlAux，必须确认没把二级页弄坏。
   验法：真实点击「自动管路」→ 主管线数变化 → Ctrl+Z → 必须回到点击前。
   用法：node _probe_undo_l2.mjs
   退出码：0=全过，1=有断言红。 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { spawn } = require('child_process');
const http = require('http'); const fs = require('fs'); const path = require('path');
const WS = globalThis.WebSocket;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = process.env.RY_ROOT || 'C:/Users/AHS/runye-irrigation';
const VW = 1600, VH = 1000;
const PORT = 49500 + Math.floor(Math.random() * 40), CDP = 49900 + Math.floor(Math.random() * 40);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const srv = http.createServer((req, r2) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const fp = path.join(ROOT, p.replace(/^\//, ''));
  if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r2.writeHead(404); r2.end('nf'); return; }
  r2.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(fp).pipe(r2);
});
await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox',
  '--remote-debugging-port=' + CDP, '--user-data-dir=C:\\tmp\\cdp_ul2_' + Date.now(),
  '--window-size=' + VW + ',' + VH], { stdio: 'ignore' });
const hreq = (m, p) => new Promise((res, rej) => { const q = http.request({ host: '127.0.0.1', port: CDP, path: p, method: m }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); }); q.on('error', rej); q.end(); });
for (let i = 0; i < 60; i++) { try { await hreq('GET', '/json/version'); break; } catch (e) { await sleep(300); } }
let idc = 1, ws; const pend = {};
const send = (m, p = {}) => new Promise((res, rej) => { const id = idc++; pend[id] = { res, rej }; ws.send(JSON.stringify({ id, method: m, params: p })); setTimeout(() => { if (pend[id]) { delete pend[id]; rej(new Error('timeout ' + m)); } }, 60000); });
const t = JSON.parse(await hreq('PUT', '/json/new?' + encodeURIComponent('http://127.0.0.1:' + PORT + '/index.html')));
ws = new WS(t.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
ws.addEventListener('message', e => {
  const o = JSON.parse(e.data);
  if (o.id && pend[o.id]) { const { res, rej } = pend[o.id]; delete pend[o.id]; o.error ? rej(new Error(o.error.message)) : res(o.result); return; }
  if (o.method === 'Page.javascriptDialogOpening') ws.send(JSON.stringify({ id: idc++, method: 'Page.handleJavaScriptDialog', params: { accept: true } }));
});
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
await send('Page.reload', { ignoreCache: true });
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return { __err: String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text).slice(0, 300) }; return r.result.value; };
const HIDE = "(function(){document.querySelectorAll('.ry-ann-mask').forEach(function(e){e.style.setProperty('display','none','important');});try{window.RyAnnounce&&window.RyAnnounce.close&&window.RyAnnounce.close();}catch(e){}return 1;})()";
for (let i = 0; i < 80; i++) { if (await ev('!!window.ppGetState && !!window.RyUndo') === true) break; await sleep(400); }
await ev(HIDE);
await ev("(function(){try{window.rySetTab('pipePlanSection','pipe');}catch(e){return 'err '+e.message;}return 1;})()");
await sleep(1200);
/* 二级页要有一个地块才能布管 */
await ev("(function(){window.measuredPolygon=[{x:0,y:0},{x:60,y:0},{x:60,y:40},{x:0,y:40}];window.measuredArea=2400;try{if(typeof render==='function')render();if(typeof calcPlan==='function')calcPlan();}catch(e){return 'err '+e.message;}return 1;})()");
await sleep(1200);
await ev(HIDE);

const ST = `JSON.stringify((function(){
  var s=null; try{ s=window.ppGetState?window.ppGetState():null; }catch(e){}
  function n(k){ if(!s) return null; var v=s[k]; return Array.isArray(v)?v.length:(v==null?null:v); }
  return { mains:n('mainPipes')!=null?n('mainPipes'):n('mains'), branches:n('branchPipes')!=null?n('branchPipes'):n('branches'),
           undo: window.RyUndo?window.RyUndo.debug():null, keys: s?Object.keys(s).length:0 };
})())`;
const read = async () => { const s = await ev(ST); try { return typeof s === 'string' ? JSON.parse(s) : s; } catch (e) { return { err: String(s) }; } };
const un = v => JSON.stringify(v);
let ok = true;
const chk = (name, cond, extra) => { console.log((cond ? '✓ ' : '✗ ') + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); if (!cond) ok = false; };

/* 二级页操作：切换「分支数」按钮组（branchCount 在快照里，不依赖地块是否已布管）。
   #branchGroup 视觉上是 hidden 的（旧版遗留控件），但 handler 与快照读取都只看 .selected，
   派发真实 click 即可改变工程状态 —— 这正是要验的「误操作能退回去」。 */
const ST2 = `JSON.stringify((function(){
  var sel=document.querySelector('#branchGroup .selected');
  return { n: sel?sel.getAttribute('data-n'):null, undo: window.RyUndo?window.RyUndo.debug():null };
})())`;
const read2 = async () => { const s = await ev(ST2); try { return typeof s === 'string' ? JSON.parse(s) : s; } catch (e) { return { err: String(s) }; } };

const b = await read2();
console.log('切换前:', un(b));
console.log('派发:', await ev(`(function(){
  var bs=[].slice.call(document.querySelectorAll('#branchGroup button'));
  if(!bs.length) return 'none';
  var tgt=null;
  for(var i=0;i<bs.length;i++){ if(!bs[i].classList.contains('selected')){ tgt=bs[i]; break; } }
  if(!tgt) return 'allSelected';
  tgt.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,button:0}));
  return 'clicked '+tgt.getAttribute('data-n');
})()`));
await sleep(900);
const a = await read2();
console.log('切换后:', un(a));
chk('二级页 1 分支数已改变', un(a.n) !== un(b.n), { before: b.n, after: a.n });
chk('二级页 2 点击自己入了一档', a.undo && b.undo && a.undo.top === b.undo.top + 1, { before: b.undo, after: a.undo });
await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', modifiers: 2, key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 2, key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90 });
await sleep(1100);
const u = await read2();
console.log('撤销后:', un(u));
chk('二级页 3 Ctrl+Z 回到切换前', un(u.n) === un(b.n), { want: b.n, got: u.n });

if (process.env.SHOT) {
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(process.env.SHOT, Buffer.from(shot.data, 'base64'));
  console.log('截图:', process.env.SHOT);
}
try { child.kill(); } catch (e) { }
srv.close();
console.log(ok ? '\n== 二级页撤销探针：全部通过 ==' : '\n== 二级页撤销探针：有断言失败 ==');
process.exit(ok ? 0 : 1);
