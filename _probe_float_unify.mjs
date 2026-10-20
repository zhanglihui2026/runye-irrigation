'use strict';
/* v574 悬浮面板外壳统一：分区角度 vs 图层 —— computed 逐值对比 + 折叠仍生效
   断言：
     U1 两块卡片的 背景/边框/阴影/字号 完全一致（统一外壳 .ry-float-card）
     U2 标题条（head）的 底色/字色/内距 一致
     U3 分区角度面板不再有绿标题（head 背景不是深绿）
     U4 折叠按钮点击后 body 隐藏、再点恢复
   用法：node _probe_float_unify.mjs */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { spawn } = require('child_process');
const http = require('http'); const fs = require('fs'); const path = require('path');
const WS = globalThis.WebSocket;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = 'C:/Users/AHS/runye-irrigation';
const PORT = 24460 + Math.floor(Math.random() * 30);
const CDP = 23960 + Math.floor(Math.random() * 30);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const srv = http.createServer((req, r2) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const fp = path.join(ROOT, p.replace(/^\//, '')); if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r2.writeHead(404); r2.end('nf'); return; }
  r2.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(fp).pipe(r2); });
await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-proxy-server', '--host-resolver-rules=MAP cdn.jsdelivr.net 127.0.0.1', '--remote-debugging-port=' + CDP, '--user-data-dir=C:\\tmp\\cdp_fu_' + Date.now(), '--window-size=1400,900'], { stdio: 'ignore' });
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
for (let i = 0; i < 80; i++) { if (await ev("typeof window.rySetTab==='function' || !!document.getElementById('onlineMapSection')") === true) break; await sleep(500); }

/* 打开在线地图视图，让两块卡都渲染 */
await ev(`(function(){
  try{ window.rySetTab('onlineMapSection','map'); }catch(e){}
  var sec=document.getElementById('onlineMapSection');
  var n=sec; while(n&&n!==document.documentElement){ try{n.style.setProperty('display','block','important');}catch(e){} n=n.parentElement; }
  return 1;
})()`);
await sleep(1500);

const got = JSON.parse(await ev(`(function(){
  function pick(el){
    if(!el) return null;
    var c=getComputedStyle(el);
    return { bg:c.backgroundColor, border:c.borderTopColor, bt:c.borderTopWidth,
      shadow:c.boxShadow, font:c.fontSize, color:c.color, pad:c.padding, h:c.height };
  }
  var a=document.getElementById('ryAnglePanel');
  var aHead=a?a.querySelector('.ry-angle-head'):null;
  var aBody=a?a.querySelector('.ry-angle-body'):null;
  var l=document.querySelector('.rym-layer-panel');
  var lHead=l?l.querySelector('.ry-float-head'):null;
  return JSON.stringify({ a:pick(a), aHead:pick(aHead), aBody:pick(aBody), aBodyDisplay:aBody?getComputedStyle(aBody).display:null,
    aClasses:a?a.className:'-', l:pick(l), lHead:pick(lHead), lFound:!!l,
    aHeadBg:aHead?getComputedStyle(aHead).backgroundColor:null, aHeadColor:aHead?getComputedStyle(aHead).color:null,
    lHeadBg:lHead?getComputedStyle(lHead).backgroundColor:null, lHeadColor:lHead?getComputedStyle(lHead).color:null });
})()`));

console.log('分区角度卡片  : ' + JSON.stringify(got.a));
console.log('图层卡片      : ' + JSON.stringify(got.l));
console.log('分区角度标题条: bg ' + got.aHeadBg + ' / color ' + got.aHeadColor);
console.log('图层标题条    : bg ' + got.lHeadBg + ' / color ' + got.lHeadColor);
console.log('分区角度类名  : ' + got.aClasses);

const L = [];
const A = (n, ok, g, w) => L.push((ok ? 'OK   ' : 'FAIL ') + n + ' = ' + g + (ok ? '' : '  (期望 ' + w + ')'));
if (!got.a) { console.log('FAIL 找不到分区角度面板'); }
else if (!got.l) {
  console.log('INFO 图层面板未渲染（在线地图未初始化），只对分区角度自身判据断言');
} else {
  A('U1 卡片外壳（背景/边框/阴影）与图层一致',
    got.a.bg === got.l.bg && got.a.border === got.l.border && got.a.shadow === got.l.shadow,
    'bg ' + got.a.bg + ' / ' + got.l.bg + '；border ' + got.a.border + ' / ' + got.l.border + '；shadow 同=' + (got.a.shadow === got.l.shadow), '逐值相同');
  A('U2 标题条（底色/字色）与图层一致',
    !!got.aHead && got.aHeadBg === got.lHeadBg && got.aHeadColor === got.lHeadColor,
    'bg ' + got.aHeadBg + ' / ' + got.lHeadBg + '；color ' + got.aHeadColor + ' / ' + got.lHeadColor, '逐值相同');
}
A('U3 标题条不再是深绿（旧 ryp 壳已撤）', got.aHeadBg !== 'rgb(23, 62, 50)', got.aHeadBg, '≠ rgb(23,62,50)');
A('U4 卡片类名含 ry-float-card', /ry-float-card/.test(got.aClasses), got.aClasses, '含 ry-float-card');

/* 折叠：点两下 */
const fold = JSON.parse(await ev(`(function(){
  var btn=document.getElementById('ryAngleFold');
  if(!btn) return JSON.stringify({ok:false});
  btn.click();
  var body=document.querySelector('#ryAnglePanel .ry-angle-body');
  var d1=body?getComputedStyle(body).display:'-';
  btn.click();
  var d2=body?getComputedStyle(body).display:'-';
  return JSON.stringify({ok:true, d1:d1, d2:d2});
})()`));
A('U5 折叠/展开仍生效', fold.ok && fold.d1 === 'none' && fold.d2 !== 'none', '折叠后 ' + fold.d1 + ' → 展开后 ' + fold.d2, "none → 非 none");

console.log('');
console.log(L.join('\n'));
const fail = L.filter(x => x.startsWith('FAIL')).length;
console.log('--- ' + (L.length - fail) + '/' + L.length + ' 通过');
try { child.kill(); } catch (e) { }
srv.close();
process.exit(0);
