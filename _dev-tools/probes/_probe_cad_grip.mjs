'use strict';
/* v586 左侧工具栏收起入口：
   T1 展开态：标题行在工具栏顶部、右侧有 « 图标、title=收起
   T2 点该行 → 收起：栏宽 40、竖条可见、中心点命中自身（没被遮挡）
   T3 点工具栏内空白 → 不再收起（v586 取消误关）
   T4 再点竖条 → 展开回 318
   用法：node _probe_cad_grip.mjs */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { spawn } = require('child_process');
const http = require('http'); const fs = require('fs'); const path = require('path');
const WS = globalThis.WebSocket;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = 'C:/Users/AHS/runye-irrigation';
const PORT = 34460 + Math.floor(Math.random() * 30);
const CDP = 33960 + Math.floor(Math.random() * 30);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const srv = http.createServer((req, r2) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const fp = path.join(ROOT, p.replace(/^\//, '')); if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r2.writeHead(404); r2.end('nf'); return; }
  r2.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(fp).pipe(r2); });
await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-proxy-server', '--host-resolver-rules=MAP cdn.jsdelivr.net 127.0.0.1', '--remote-debugging-port=' + CDP, '--user-data-dir=C:\\tmp\\cdp_cg_' + Date.now(), '--window-size=1400,900'], { stdio: 'ignore' });
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
for (let i = 0; i < 80; i++) { if (await ev("typeof window.rySetTab==='function' && !!window.RyPlanParams") === true) break; await sleep(500); }

await ev(`(function(){ try{ window.rySetTab('pipePlanSection','plan'); }catch(e){} return 1; })()`);
let okVp = false;
for (let i = 0; i < 30; i++) {
  const b = await ev(`document.body.classList.contains('ry-cad-vp')`);
  if (b === true) { okVp = true; break; }
  await sleep(400);
}
if (!okVp) { console.log('FAIL 未进入制图视图（body 无 ry-cad-vp）'); process.exit(0); }
await sleep(600);

const L = []; const A = (n, ok, g, w) => L.push((ok ? 'OK   ' : 'FAIL ') + n + ' = ' + g + (ok ? '' : '  (期望 ' + w + ')'));
const ST = `JSON.stringify((function(){
  var s=document.getElementById('ryCadSide'), g=document.getElementById('ryCadSideGrip');
  if(!s||!g) return {err:'no el'};
  var rs=s.getBoundingClientRect(), rg=g.getBoundingClientRect();
  var ic=document.getElementById('ryCadSideGripIcon');
  var cx=rg.left+rg.width/2, cy=rg.top+rg.height/2;
  var top=document.elementFromPoint(cx,cy);
  return { open:s.getAttribute('data-ry-open'), sideW:Math.round(rs.width), gripW:Math.round(rg.width), gripH:Math.round(rg.height),
    gripTop:Math.round(rg.top-rs.top), icon:ic?ic.textContent.trim():'-', title:g.title,
    hitSelf: !!(top&&(top===g||g.contains(top))), hitTag: top?top.tagName+'.'+(top.className||''):'null', cx:cx, cy:cy };
})())`;

/* 初始可能是收起态（localStorage 记忆）⇒ 先点开 */
let st0 = JSON.parse(await ev(ST));
if (st0.open === '0') {
  await mouse('mousePressed', st0.cx, st0.cy); await mouse('mouseReleased', st0.cx, st0.cy); await sleep(600);
}
/* T1 展开态 */
let st = JSON.parse(await ev(ST));
console.log('展开态：' + JSON.stringify(st));
A('T1a 标题行贴在工具栏顶部（距顶 ≤1px）', Math.abs(st.gripTop) <= 1, st.gripTop + 'px', '0px');
A('T1b 右侧有 « 收起图标', st.icon === '«', '「' + st.icon + '」', '«');
A('T1c title 为「收起工具栏」', st.title.indexOf('收起') >= 0, st.title, '含"收起"');

/* T2 点它 → 收起 */
await mouse('mousePressed', st.cx, st.cy); await mouse('mouseReleased', st.cx, st.cy); await sleep(600);
const st2 = JSON.parse(await ev(ST));
console.log('收起后：' + JSON.stringify(st2));
A('T2a 栏宽收到 40px', st2.sideW === 40, st2.sideW + 'px', '40px');
A('T2b 竖条仍在顶部且可见', st2.gripH > 40 && Math.abs(st2.gripTop) <= 1, 'h=' + st2.gripH + ' top=' + st2.gripTop, '可见');
A('T2c 竖条中心点命中自身（没被遮挡）', st2.hitSelf === true, st2.hitTag, '命中 grip');
A('T2d 收起态图标变 »', st2.icon === '»', '「' + st2.icon + '」', '»');
A('T2e 收起态 title 为「展开工具栏」', st2.title.indexOf('展开') >= 0, st2.title, '含"展开"');

/* T3 点工具栏内空白 → 不应收起（此时已收起，先展开再测） */
await mouse('mousePressed', st2.cx, st2.cy); await mouse('mouseReleased', st2.cx, st2.cy); await sleep(600);
const st3 = JSON.parse(await ev(ST));
const blank = JSON.parse(await ev(`(function(){
  var s=document.getElementById('ryCadSide'); var rs=s.getBoundingClientRect();
  /* 取工具栏底部空白（分组区下方、foot 之上） */
  return JSON.stringify({x:rs.left+rs.width/2, y:rs.bottom-30});
})()`));
await mouse('mousePressed', blank.x, blank.y); await mouse('mouseReleased', blank.x, blank.y); await sleep(500);
const st4 = JSON.parse(await ev(ST));
A('T3 点工具栏空白不再整栏收起', st4.open === '1' && st4.sideW > 100, 'open=' + st4.open + ' w=' + st4.sideW, 'open=1 且宽>100');

console.log('');
console.log(L.join('\n'));
const fail = L.filter(x => x.startsWith('FAIL')).length;
console.log('--- ' + (L.length - fail) + '/' + L.length + ' 通过');
try { child.kill(); } catch (e) { }
srv.close();
process.exit(0);
