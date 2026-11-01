'use strict';
/* v584 总管三通复位：真实鼠标点按钮验证
   R1 拖三通后：有偏移、总管是折线（两点不共线）
   R2 点「三通复位」：localStorage 清空、frontNodes 全 off=0、总管回到直线
   R3 复位后触发演示：水流路径起点与总管起点一致
   R4 无偏移时点复位：不报错、不重绘（返回 false）
   用法：node _probe_front_reset.mjs */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { spawn } = require('child_process');
const http = require('http'); const fs = require('fs'); const path = require('path');
const WS = globalThis.WebSocket;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = 'C:/Users/AHS/runye-irrigation';
const PORT = 32460 + Math.floor(Math.random() * 30);
const CDP = 31960 + Math.floor(Math.random() * 30);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const srv = http.createServer((req, r2) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const fp = path.join(ROOT, p.replace(/^\//, '')); if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r2.writeHead(404); r2.end('nf'); return; }
  r2.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(fp).pipe(r2); });
await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-proxy-server', '--host-resolver-rules=MAP cdn.jsdelivr.net 127.0.0.1', '--remote-debugging-port=' + CDP, '--user-data-dir=C:\\tmp\\cdp_fr_' + Date.now(), '--window-size=1400,900'], { stdio: 'ignore' });
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
const mouse = async (type, x, y) => send('Input.dispatchMouseEvent', { type: type, x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
for (let i = 0; i < 80; i++) { if (await ev("!!window.RyPlanParams && typeof window.tlAutoGenerate==='function'") === true) break; await sleep(500); }

const L = []; const A = (n, ok, g, w) => L.push((ok ? 'OK   ' : 'FAIL ') + n + ' = ' + g + (ok ? '' : '  (期望 ' + w + ')'));

const SNAP = `JSON.stringify((function(){
  var d=window.tlDiagramData||{};
  var ls=JSON.parse(localStorage.getItem('tlFrontNodeDrops_v1')||'{}');
  var nodes=(d.frontNodes||[]).map(function(n){return {mk:n.mk,off:n.off};});
  var fp=d.frontPipe||[];
  function straight(P){ if(P.length<2) return true; var x0=P[0].x,y0=P[0].y;
    return P.every(function(p){ return Math.abs(p.x-x0)<0.01 || Math.abs(p.y-y0)<0.01; }); }
  return { ls:ls, nodes:nodes, fp:fp.map(function(p){return [Math.round(p.x*10)/10,Math.round(p.y*10)/10];}), isStraight:straight(fp) };
})())`;

await ev(`(function(){
  try{ window.rySetTab('tlPipePlanSection','pipe'); }catch(e){}
  var n=document.getElementById('tlPipePlanSection');
  while(n&&n!==document.documentElement){ try{n.style.setProperty('display','block','important');}catch(e){} n=n.parentElement; }
  try{ localStorage.removeItem('tlFrontNodeDrops_v1'); }catch(e){}
  window.measuredPolygon=[{x:0,y:0},{x:600,y:0},{x:600,y:400},{x:0,y:400}];
  window.tlAutoGenerate(); window.tlAutoGenerate();
  return 1;
})()`);
await sleep(600);

/* R4：无偏移时点复位 */
const btnPos = JSON.parse(await ev(`(function(){
  var b=document.getElementById('tlFrontNodeResetBtn'); if(!b) return 'null';
  b.scrollIntoView({block:'center'});
  var r=b.getBoundingClientRect();
  return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2,vis:r.width>0&&r.height>0,txt:b.textContent.trim()});
})()`));
if (btnPos === 'null') { console.log('FAIL 找不到复位按钮'); process.exit(0); }
console.log('复位按钮：文案「' + btnPos.txt + '」可见=' + btnPos.vis);
const r4 = await ev(`(function(){ try{ return String(window.tlFrontNodeReset()); }catch(e){ return 'ERR '+e.message; } })()`);
A('R4 无偏移时复位返回 false（不重绘）', r4 === 'false', r4, 'false');

/* 拖三通（注入，保证几何变化） */
const inj = await ev(`(function(){
  var fns=(window.tlDiagramData&&window.tlDiagramData.frontNodes)||[];
  if(!fns.length) return 'no nodes';
  var m=fns[0];
  window.tlFrontNodeDropSet(m.mk, m.sig, Math.min(40, m.max||0));
  window.tlAutoGenerate();
  return 'ok';
})()`);
await sleep(800);
const s1 = JSON.parse(await ev(SNAP));
console.log('拖后：localStorage=' + JSON.stringify(s1.ls) + ' frontPipe=' + JSON.stringify(s1.fp) + ' 直线=' + s1.isStraight);
A('R1 拖三通后产生偏移且总管不再是直线', Object.keys(s1.ls).length > 0 && !s1.isStraight,
  '偏移键 ' + JSON.stringify(Object.keys(s1.ls)) + '，总管直线=' + s1.isStraight, '有偏移 + 非直线');

/* 真实点击复位 */
await mouse('mousePressed', btnPos.x, btnPos.y);
await mouse('mouseReleased', btnPos.x, btnPos.y);
await sleep(1000);
const s2 = JSON.parse(await ev(SNAP));
console.log('复位后：localStorage=' + JSON.stringify(s2.ls) + ' frontPipe=' + JSON.stringify(s2.fp) + ' 直线=' + s2.isStraight);
A('R2a 复位后 localStorage 清空', Object.keys(s2.ls).length === 0, JSON.stringify(s2.ls), '{}');
A('R2b 复位后三通偏移全为 0', s2.nodes.every(n => !n.off), JSON.stringify(s2.nodes), '全 0');
A('R2c 复位后总管回到直线', s2.isStraight, JSON.stringify(s2.fp), '直线');

/* R3：复位后演示 */
const flow = JSON.parse(await ev(`(function(){
  try{ window.tlApplyDemoHighlight(1); }catch(e){}
  var svg=document.querySelector('#tlDiagramContent svg');
  var fr=svg.querySelector('path[data-tlpipe="front"][data-tlpipe-ref]')||svg.querySelector('path[data-tlpipe="front"]');
  var fl=[].slice.call(svg.querySelectorAll('[data-tlflow="flow"]'));
  function P(s){ var a=(s.match(/-?\\d+(?:\\.\\d+)?/g)||[]).map(Number),o=[]; for(var i=0;i+1<a.length;i+=2)o.push([a[i],a[i+1]]); return o; }
  var F=P(fr.getAttribute('d'));
  return JSON.stringify({front:F.slice(0,2), flows:fl.slice(0,2).map(function(f){ return P(f.getAttribute('d')).slice(0,3); })});
})()`));
console.log('演示：总管前2点=' + JSON.stringify(flow.front) + ' 水流首点=' + JSON.stringify(flow.flows));
/* [v585] 水流首点已改为「水源圆点」，第二点才是总管起点 ⇒ 断言改看第二点 */
const ok3 = flow.flows.length > 0 && flow.flows.every(function (f) {
  return Math.hypot(f[1][0] - flow.front[0][0], f[1][1] - flow.front[0][1]) < 2;
});
A('R3 复位后水流第2点与总管起点一致', ok3, JSON.stringify(flow.flows), '第2点贴合总管起点');

console.log('');
console.log(L.join('\n'));
const fail = L.filter(x => x.startsWith('FAIL')).length;
console.log('--- ' + (L.length - fail) + '/' + L.length + ' 通过');
try { child.kill(); } catch (e) { }
srv.close();
process.exit(0);
