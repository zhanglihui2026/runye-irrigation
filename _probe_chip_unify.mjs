'use strict';
/* v575 分区角度面板按钮口径：默认中性、hover/按下才变绿 —— 真实鼠标 hover 验证
   C1 回传地块绘制 / 回传地形模块：白底 + 灰边 #cbd5e1（中性 chip）
   C2 保存地块 / 应用并重新划分：默认白底 + 深绿边 #173e32 + 绿字（不再实心常绿）
   C3 鼠标 hover 保存地块 ⇒ 变绿底 #173e32 + 白字（真实 :hover，非改类）
   C4 尺寸统一：24px 高 / 11px 字 / 整行宽
   用法：node _probe_chip_unify.mjs */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { spawn } = require('child_process');
const http = require('http'); const fs = require('fs'); const path = require('path');
const WS = globalThis.WebSocket;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = 'C:/Users/AHS/runye-irrigation';
const PORT = 25460 + Math.floor(Math.random() * 30);
const CDP = 24960 + Math.floor(Math.random() * 30);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const srv = http.createServer((req, r2) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const fp = path.join(ROOT, p.replace(/^\//, '')); if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r2.writeHead(404); r2.end('nf'); return; }
  r2.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(fp).pipe(r2); });
await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-proxy-server', '--host-resolver-rules=MAP cdn.jsdelivr.net 127.0.0.1', '--remote-debugging-port=' + CDP, '--user-data-dir=C:\\tmp\\cdp_cu_' + Date.now(), '--window-size=1400,900'], { stdio: 'ignore' });
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
const mouseMove = async (x, y) => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(x), y: Math.round(y), buttons: 0 });
for (let i = 0; i < 80; i++) { if (await ev("!!document.getElementById('onlineMapSection')") === true) break; await sleep(500); }

await ev(`(function(){
  try{ window.rySetTab('onlineMapSection','map'); }catch(e){}
  var n=document.getElementById('onlineMapSection');
  while(n&&n!==document.documentElement){ try{n.style.setProperty('display','block','important');}catch(e){} n=n.parentElement; }
  return 1;
})()`);
await sleep(1500);

const L = []; const A = (n, ok, g, w) => L.push((ok ? 'OK   ' : 'FAIL ') + n + ' = ' + g + (ok ? '' : '  (期望 ' + w + ')'));

const read = async (sel) => JSON.parse(await ev(`(function(){
  var el=document.querySelector('${sel}'); if(!el) return 'null';
  var c=getComputedStyle(el); var r=el.getBoundingClientRect();
  return JSON.stringify({bg:c.backgroundColor, bc:c.borderTopColor, color:c.color, h:c.height, fs:c.fontSize, w:Math.round(r.width),
    x:r.left+r.width/2, y:r.top+r.height/2, cls:el.className});
})()`));

const copy = await read('#btnCopy');
const terr = await read('#btnCopyTerrain');
const save = await read('#btnSavePlot');
const apply = await read('[data-angle-apply]');
const send2 = await read('[data-angle-send]');

console.log('回传地块绘制 : ' + JSON.stringify(copy));
console.log('回传地形模块 : ' + JSON.stringify(terr));
console.log('保存地块     : ' + JSON.stringify(save));
console.log('应用并重新划分: ' + JSON.stringify(apply));
console.log('回二级继续规划: ' + JSON.stringify(send2));

if (copy === 'null' || save === 'null') { console.log('FAIL 取不到按钮'); console.log(L.join('\n')); process.exit(0); }

A('C1a 回传地块绘制 = 白底灰边（中性）', copy.bg === 'rgb(255, 255, 255)' && copy.bc === 'rgb(203, 213, 225)', copy.bg + ' / ' + copy.bc, '白 / #cbd5e1');
A('C1b 回传地形模块 = 白底灰边（中性）', terr.bg === 'rgb(255, 255, 255)' && terr.bc === 'rgb(203, 213, 225)', terr.bg + ' / ' + terr.bc, '白 / #cbd5e1');
A('C2a 保存地块默认 = 白底 + 深绿边 + 绿字（不再实心绿）',
  save.bg === 'rgb(255, 255, 255)' && save.bc === 'rgb(23, 62, 50)' && save.color === 'rgb(20, 83, 45)',
  save.bg + ' / ' + save.bc + ' / ' + save.color, '白 / #173e32 / #14532d');
A('C2b 应用并重新划分默认 = 白底 + 深绿边（不再实心绿）',
  apply.bg === 'rgb(255, 255, 255)' && apply.bc === 'rgb(23, 62, 50)', apply.bg + ' / ' + apply.bc, '白 / #173e32');
A('C2c 回二级继续规划 = 白底灰边', send2.bg === 'rgb(255, 255, 255)' && send2.bc === 'rgb(203, 213, 225)', send2.bg + ' / ' + send2.bc, '白 / #cbd5e1');
A('C4 尺寸统一（24px / 11px / 整行）',
  [copy, terr, save, apply, send2].every(b => b.h === '24px' && b.fs === '11px') && Math.abs(copy.w - save.w) <= 1,
  'h ' + [copy.h, terr.h, save.h, apply.h, send2.h].join(',') + '；fs ' + [copy.fs, save.fs].join(',') + '；宽 ' + copy.w + '/' + save.w, '24px / 11px / 同宽');

/* C3：真实鼠标 hover 保存地块 */
await mouseMove(save.x, save.y);
await sleep(400);
const saveHover = await read('#btnSavePlot');
console.log('保存地块 hover: ' + JSON.stringify({ bg: saveHover.bg, color: saveHover.color }));
A('C3 hover 保存地块 ⇒ 绿底白字', saveHover.bg === 'rgb(23, 62, 50)' && saveHover.color === 'rgb(255, 255, 255)',
  saveHover.bg + ' / ' + saveHover.color, '#173e32 / 白');

/* 移开：恢复中性 */
await mouseMove(20, 700);
await sleep(400);
const saveOut = await read('#btnSavePlot');
A('C3b 移开后恢复白底绿边', saveOut.bg === 'rgb(255, 255, 255)' && saveOut.bc === 'rgb(23, 62, 50)',
  saveOut.bg + ' / ' + saveOut.bc, '白 / #173e32');

console.log('');
console.log(L.join('\n'));
const fail = L.filter(x => x.startsWith('FAIL')).length;
console.log('--- ' + (L.length - fail) + '/' + L.length + ' 通过');
try { child.kill(); } catch (e) { }
srv.close();
process.exit(0);
