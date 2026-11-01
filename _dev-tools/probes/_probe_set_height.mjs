'use strict';
/* 设置弹窗：六个页签的内容高度量测 + 切换后高度是否恒定 + 字号是否已 -1
   M1 逐个页签量 #rySetBody 的 scrollHeight（内容高）
   M2 切换页签后 #rySetModal 的渲染高度是否恒定（当前应不恒定 = 用户抱怨的"跳来跳去"）
   M3 字号抽查（标题/页签/标签/输入/按钮） */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { spawn } = require('child_process');
const http = require('http'); const fs = require('fs'); const path = require('path');
const WS = globalThis.WebSocket;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = 'C:/Users/AHS/runye-irrigation';
const PORT = 26460 + Math.floor(Math.random() * 30);
const CDP = 25960 + Math.floor(Math.random() * 30);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const srv = http.createServer((req, r2) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const fp = path.join(ROOT, p.replace(/^\//, '')); if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r2.writeHead(404); r2.end('nf'); return; }
  r2.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(fp).pipe(r2); });
await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-proxy-server', '--host-resolver-rules=MAP cdn.jsdelivr.net 127.0.0.1', '--remote-debugging-port=' + CDP, '--user-data-dir=C:\\tmp\\cdp_sh_' + Date.now(), '--window-size=1400,900'], { stdio: 'ignore' });
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
for (let i = 0; i < 80; i++) { if (await ev("!!document.getElementById('rySetModal')") === true) break; await sleep(500); }

const out = JSON.parse(await ev(`(function(){
  var modal=document.getElementById('rySetModal'), mask=document.getElementById('rySetMask'), body=document.getElementById('rySetBody');
  if(!modal||!body) return JSON.stringify({err:'no modal'});
  modal.classList.add('open'); mask.classList.add('open');
  modal.style.setProperty('display','flex','important');
  var tabs=[].slice.call(document.querySelectorAll('#rySetNav button'));
  var res=[];
  tabs.forEach(function(b){
    b.click();
    var mh=modal.getBoundingClientRect().height;
    var bh=body.getBoundingClientRect().height;
    res.push({ tab:b.getAttribute('data-tab'), label:b.textContent.trim(),
      bodyContentH: Math.round(body.scrollHeight), bodyBoxH: Math.round(bh), modalH: Math.round(mh) });
  });
  /* 回到第一个页签，同时抽查字号 */
  tabs[0].click();
  function fs(sel){ var el=document.querySelector(sel); return el?getComputedStyle(el).fontSize:'-'; }
  var fonts={ title:fs('#rySetModal .rs-title'), nav:fs('#rySetNav button'),
    h4:fs('#rySetModal h4'), note:fs('#rySetModal .rs-note'),
    label:fs('#rySetModal .rs-row>label'), unit:fs('#rySetModal .rs-unit'),
    inputNum:fs('#rySetModal input[type=number]'), btn:fs('#rySetModal button.rs-btn') };
  return JSON.stringify({ tabs:res, fonts:fonts });
})()`));
if (out.err) { console.log('ERR ' + out.err); process.exit(2); }
console.log('页签内容高度：');
out.tabs.forEach(t => console.log('  ' + t.label.padEnd(8) + ' 内容 ' + String(t.bodyContentH).padStart(4) + ' px ｜ body盒 ' + String(t.bodyBoxH).padStart(4) + ' ｜ modal ' + String(t.modalH).padStart(4)));
const hs = out.tabs.map(t => t.modalH);
const maxH = Math.max.apply(null, hs), minH = Math.min.apply(null, hs);
console.log('');
console.log('modal 高度区间：' + minH + ' ~ ' + maxH + '（差 ' + (maxH - minH) + ' px）' + (maxH - minH > 2 ? '  ← 切换会跳动' : '  ← 已恒定'));
console.log('内容最高页签：' + out.tabs.reduce((a, b) => b.bodyContentH > a.bodyContentH ? b : a).label + ' / ' + Math.max.apply(null, out.tabs.map(t => t.bodyContentH)) + ' px');
console.log('字号：' + JSON.stringify(out.fonts));
try { child.kill(); } catch (e) { }
srv.close();
process.exit(0);
