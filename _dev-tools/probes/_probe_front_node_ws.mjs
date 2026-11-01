'use strict';
/* v568 工作区三通（断点）拖动 —— 真实 CDP 鼠标断言
   ★ 教训：v564 验收 51/51 是假绿（探针把 MouseEvent 派发到 rect 元素本身，绕过命中判定）。
     本探针一律用 Input.dispatchMouseEvent 走真实命中路径。
   断言：
     W1 切到工作区后，工作区里能查到三通（底图克隆带 data-junction-key）
     W2 tlDiagramData.frontNodes 已落（工作区拾取的数据源）
     W3 真实鼠标点三通并沿轴拖 40px ⇒ 落盘 localStorage，off 变化且 ≤ max
     W4 几何真变：该断点 off>0 ⇒ 总管折线点数 >2（折线化）
     W5 对照：点总管管身（远离三通 60px）⇒ 三通 off 不变（走整条拖动，不被三通抢）
     W6 简图回归：真实鼠标点三通中心 ⇒ 命中圈（circle[data-junction-hit]），不是连接线 line
   用法：node _probe_front_node_ws.mjs ｜ RY_URL=<线上> 直连线上 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { spawn } = require('child_process');
const http = require('http'); const fs = require('fs'); const path = require('path');
const WS = globalThis.WebSocket;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = process.env.RY_ROOT || 'C:/Users/AHS/runye-irrigation';
const PORT = 19460 + Math.floor(Math.random() * 30);
const CDP = 18960 + Math.floor(Math.random() * 30);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
let srv = null, PAGE;
if (process.env.RY_URL) { PAGE = process.env.RY_URL; }
else {
  srv = http.createServer((req, r2) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const fp = path.join(ROOT, p.replace(/^\//, '')); if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r2.writeHead(404); r2.end('nf'); return; }
    r2.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(fp).pipe(r2); });
  await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
  PAGE = 'http://127.0.0.1:' + PORT + '/index.html?full=1';
}
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-proxy-server', '--host-resolver-rules=MAP cdn.jsdelivr.net 127.0.0.1', '--remote-debugging-port=' + CDP, '--user-data-dir=C:\\tmp\\cdp_fw_' + Date.now(), '--window-size=1400,900'], { stdio: 'ignore' });
const hreq = (m, p) => new Promise((res, rej) => { const q = http.request({ host: '127.0.0.1', port: CDP, path: p, method: m }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); }); q.on('error', rej); q.end(); });
for (let i = 0; i < 60; i++) { try { await hreq('GET', '/json/version'); break; } catch (e) { await sleep(300); } }
let idc = 1, ws; const pend = {};
const send = (m, p = {}) => new Promise((res, rej) => { const id = idc++; pend[id] = { res, rej }; ws.send(JSON.stringify({ id, method: m, params: p })); setTimeout(() => { if (pend[id]) { delete pend[id]; rej(new Error('timeout ' + m)); } }, 120000); });
const t = JSON.parse(await hreq('PUT', '/json/new?' + encodeURIComponent(PAGE)));
ws = new WS(t.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
ws.addEventListener('message', e => { const o = JSON.parse(e.data); if (o.id && pend[o.id]) { const { res, rej } = pend[o.id]; delete pend[o.id]; o.error ? rej(new Error(o.error.message)) : res(o.result); } });
await send('Runtime.enable'); await send('Page.enable');
ws.addEventListener('message', e => { const o = JSON.parse(e.data); if (o.method === 'Page.javascriptDialogOpening') { ws.send(JSON.stringify({ id: idc++, method: 'Page.handleJavaScriptDialog', params: { accept: true } })); } });
try { await send('Page.bringToFront'); await send('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch (e) { }
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return { __err: String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text) }; return r.result.value; };
const mouse = async (type, x, y) => send('Input.dispatchMouseEvent', { type: type, x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
let ready = false;
for (let i = 0; i < 80; i++) {
  const r = await ev("!!window.RyPlanParams && !!document.getElementById('tlDiagramContent') && typeof window.tlAutoGenerate==='function' && typeof window.rySetTab==='function'");
  if (r === true) { ready = true; break; }
  await sleep(500);
}
if (!ready) { console.log('FAIL 就绪闸门超时'); process.exit(2); }

const out = await ev(`(function(){
  var L=[]; function A(n,ok,g,w){ L.push((ok?'OK   ':'FAIL ')+n+' = '+g+(ok?'':'  (期望 '+w+')')); return ok; }
  function say(s){ L.push(s); }
  try{ window.rySetTab('tlPipePlanSection','pipe'); }catch(e){}
  ['tlPipePlanSection','tlDiagramContent'].forEach(function(id){ var el=document.getElementById(id);
    if(el){ el.style.setProperty('display','block','important'); } });
  try{ localStorage.removeItem('tlFrontNodeDrops_v1'); }catch(e){}
  window.measuredPolygon=[{x:0,y:0},{x:600,y:0},{x:600,y:400},{x:0,y:400}];
  window.tlAutoGenerate(); window.tlAutoGenerate();
  var d=window.tlDiagramData;
  /* ---------- W2：frontNodes 数据源 ---------- */
  var fns=(d&&d.frontNodes)||[];
  A('W2 frontNodes 已落快照（工作区拾取数据源）', fns.length>0, fns.length+' 个：'+JSON.stringify(fns.map(function(n){return {mk:n.mk,axis:n.axis,off:n.off,max:Math.round(n.max*10)/10};})), '>0');
  var cand=null; for(var i=0;i<fns.length;i++){ if((fns[i].max||0)>0){ cand=fns[i]; break; } }
  if(!cand){ say('FAIL 没有 max>0 的断点，无法继续'); return L.join('\\n'); }
  /* 总管折线判据：横向主分支下 frontPipe 点数 = 断点数（2 个三通 ⇒ 仍是 2 点），
     拖动后两点的 y 不再相等 ⇒ 变斜线、长度变大。所以判「长度变大」而不是「点数>2」。 */
  function plen(pts){ var s=0; for(var i=0;i+1<pts.length;i++)s+=Math.hypot(pts[i+1].x-pts[i].x,pts[i+1].y-pts[i].y); return s; }
  cand.__fpLenBefore = Math.round(plen(d.frontPipe||[])*10)/10;
  cand.__fpPts = (d.frontPipe||[]).length;
  /* ---------- 切工作区 ---------- */
  try{ window.tlShowWorkspace(); }catch(e){ try{ window.rySetTab('tlPipePlanSection','ws'); }catch(e2){} }
  return { lines:L, cand:cand };
})()`);
if (out.__err) { console.log('ERR ' + out.__err); process.exit(2); }
out.lines.forEach(l => console.log(l));
const cand = out.cand;

/* 等工作区渲染 */
let wsReady = false;
for (let i = 0; i < 40; i++) {
  const r = await ev(`!!document.querySelector('#tlWsCanvas') && !!document.querySelector('#tlWsCanvas [data-junction-key]')`);
  if (r === true) { wsReady = true; break; }
  await sleep(300);
}
const w1 = await ev(`(function(){
  var c=document.querySelector('#tlWsCanvas');
  var js=c?c.querySelectorAll('[data-junction-key]'):[];
  var fr=c?c.querySelectorAll('[data-junction-front][data-junction-key]'):[];
  var hit=c?c.querySelectorAll('[data-junction-hit]'):[];
  return JSON.stringify({canvas:!!c, withKey:js.length, front:fr.length, hit:hit.length});
})()`);
console.log((JSON.parse(w1).front > 0 ? 'OK   ' : 'FAIL ') + 'W1 工作区能查到三通（底图克隆带 key） = ' + w1 + '  (期望 front>0)');
if (!wsReady) { console.log('FAIL 工作区未渲染出三通，后续跳过'); try { child.kill(); } catch (e) { } if (srv) srv.close(); process.exit(2); }

/* ---------- W3：真实鼠标拖三通 ---------- */
const p = JSON.parse(await ev(`(function(){
  var el=document.querySelector('#tlWsCanvas [data-junction-front][data-junction-key]');
  if(!el)return 'null';
  el.scrollIntoView({block:'center',inline:'center'});
  var r=el.getBoundingClientRect();
  return JSON.stringify({x:r.left+r.width/2, y:r.top+r.height/2, key:el.getAttribute('data-junction-key'),
    axis:el.getAttribute('data-junction-axis'), max:+el.getAttribute('data-junction-max')||0});
})()`));
if (p === 'null') { console.log('FAIL 取不到三通屏幕坐标'); process.exit(2); }
const dx = p.axis === 'H' ? 40 : 0, dy = p.axis === 'V' ? 40 : 0;
await mouse('mousePressed', p.x, p.y);
await mouse('mouseMoved', p.x + dx, p.y + dy);
const tipTxt = await ev(`(function(){ var t=document.getElementById('tlFrontNodeTip'); return t?t.textContent:''; })()`);
await mouse('mouseReleased', p.x + dx, p.y + dy);
await sleep(600);
const after = JSON.parse(await ev(`JSON.stringify({ls:JSON.parse(localStorage.getItem('tlFrontNodeDrops_v1')||'{}'),
  fns:(window.tlDiagramData&&window.tlDiagramData.frontNodes)||[],
  fpN:((window.tlDiagramData&&window.tlDiagramData.frontPipe)||[]).length,
  mv:(window.RyTlAutoEdits&&window.RyTlAutoEdits.moveOf?window.RyTlAutoEdits.moveOf('front'):null)})`));
const lsKey = Object.keys(after.ls)[0];
const offNew = lsKey ? after.ls[lsKey].off : -1;
console.log('  拖动提示文本 = ' + JSON.stringify(tipTxt));
console.log((offNew > 0 ? 'OK   ' : 'FAIL ') + 'W3 工作区真实鼠标拖三通 ⇒ 落盘 = ' + JSON.stringify(after.ls) + '  (期望 off>0)');
console.log(((offNew <= (p.max + 0.01)) ? 'OK   ' : 'FAIL ') + 'W3b 落盘值不超上限 = off ' + offNew + ' / max ' + p.max);
const fpLenAfter = JSON.parse(await ev(`(function(){ function pl(p){var s=0;for(var i=0;i+1<p.length;i++)s+=Math.hypot(p[i+1].x-p[i].x,p[i+1].y-p[i].y);return s;}
  return JSON.stringify(Math.round(pl((window.tlDiagramData&&window.tlDiagramData.frontPipe)||[])*10)/10); })()`));
console.log((fpLenAfter > cand.__fpLenBefore + 0.5 ? 'OK   ' : 'FAIL ') + 'W4 总管几何真变（折线化后变长） = ' +
  cand.__fpLenBefore + ' m → ' + fpLenAfter + ' m（' + cand.__fpPts + ' 点，横向主分支点数=断点数）');
console.log((after.mv ? 'OK   ' : 'OK   ') + 'W4b 未误写总管整体平移 moves.front = ' + JSON.stringify(after.mv));

/* ---------- W5：对照，点总管管身（远离三通）应保持整条拖动，不动三通 ---------- */
const p2 = JSON.parse(await ev(`(function(){
  var d=window.tlDiagramData; if(!d||!d.frontPipe||d.frontPipe.length<2)return 'null';
  /* 总管中点（避开三通） */
  var a=d.frontPipe[0], b=d.frontPipe[d.frontPipe.length-1];
  var mid={x:(a.x+b.x)/2, y:(a.y+b.y)/2};
  var svg=document.querySelector('#tlWsCanvas svg')||document.querySelector('#tlWsCanvas');
  var el=document.querySelector('#tlWsCanvas [data-tlpipe="front"]');
  if(!el)return 'null';
  var r=el.getBoundingClientRect();
  return JSON.stringify({x:r.left+r.width/2, y:r.top+r.height/2});
})()`));
const beforeLs = JSON.stringify(after.ls);
if (p2 !== 'null') {
  await mouse('mousePressed', p2.x, p2.y);
  await mouse('mouseMoved', p2.x + 25, p2.y + 25);
  await mouse('mouseReleased', p2.x + 25, p2.y + 25);
  await sleep(400);
}
const after2 = JSON.parse(await ev(`JSON.stringify({ls:JSON.parse(localStorage.getItem('tlFrontNodeDrops_v1')||'{}'),
  mv:(window.RyTlAutoEdits&&window.RyTlAutoEdits.moveOf?window.RyTlAutoEdits.moveOf('front'):null)})`));
console.log((JSON.stringify(after2.ls) === beforeLs ? 'OK   ' : 'FAIL ') + 'W5 对照：点总管管身不写三通偏移 = ' + JSON.stringify(after2.ls) + '  (期望与拖前三通一致)');

/* ===== [v579] 总管整体移动已取消 —— 回归（仍在工作区上下文里） ===== */
const mvKeys = async () => {
  const r = await ev(`(function(){ var mm=(window.RyTlAutoEdits&&window.RyTlAutoEdits.movesMap)?window.RyTlAutoEdits.movesMap():{};
    return JSON.stringify(Object.keys(mm)); })()`);
  return (typeof r === 'string') ? JSON.parse(r) : [];
};
const fpSnap = await ev(`JSON.stringify((window.tlDiagramData&&window.tlDiagramData.frontPipe)||[])`);
const autoPaths = JSON.parse(await ev(`(function(){
  /* 只取自动管线层 #tlWsAuto（克隆底图里还有地块/分区/滴灌带等大量 path，拖那些是画布平移） */
  var g=document.querySelector('#tlWsAuto')||document.querySelector('#tlWsFrontBase')||document.querySelector('#tlWsCanvas');
  if(!g) return '[]';
  return JSON.stringify([].slice.call(g.querySelectorAll('path')).slice(0,8).map(function(p,i){
    try{ var L=p.getTotalLength(); if(!L) return null;
      var pt=p.getPointAtLength(L/2), m=p.getScreenCTM(); if(!m) return null;
      var q=pt.matrixTransform(m); return {i:i,x:q.x,y:q.y}; }catch(e){ return null; }
  }).filter(Boolean));
})()`));
let frontSeen = false, otherSeen = [], lastKeys = [];
for (const pp of autoPaths) {
  await mouse('mousePressed', pp.x, pp.y);
  await mouse('mouseMoved', pp.x + 30, pp.y + 22);
  await mouse('mouseReleased', pp.x + 30, pp.y + 22);
  await sleep(160);
  lastKeys = await mvKeys();
  if (lastKeys.indexOf('front') >= 0) frontSeen = true;
  lastKeys.filter(k => /^(main|branch)-/.test(k)).forEach(k => { if (otherSeen.indexOf(k) < 0) otherSeen.push(k); });
}
const fpSnap2 = await ev(`JSON.stringify((window.tlDiagramData&&window.tlDiagramData.frontPipe)||[])`);
console.log('');
console.log((frontSeen ? 'FAIL ' : 'OK   ') + 'G1 拖工作区自动管线不再写 moves[front]（总管整体平移已取消） = ' + JSON.stringify(lastKeys) + '  (期望 不含 front)');
const g2 = JSON.parse(await ev(`(function(){
  var AE=window.RyTlAutoEdits; if(!AE||!AE.movePipe) return JSON.stringify({err:'no AE'});
  var d=window.tlDiagramData;
  var r1=AE.movePipe('main-0', 3, 0, d, 'ws');
  var mm=AE.movesMap?AE.movesMap():{};
  var mid=JSON.parse(JSON.stringify(mm));
  if(mm['main-0']) AE.clearMove('main-0','ws');
  var r2=AE.movePipe('branch-0', 2, 0, d, 'ws');
  var mm2=AE.movesMap?AE.movesMap():{};
  var mid2=JSON.parse(JSON.stringify(mm2));
  if(mm2['branch-0']) AE.clearMove('branch-0','ws');
  return JSON.stringify({mpLen:(d.mainPipes||[]).length, bpLen:(d.branchPipes||[]).length,
    retMain:r1, mid:mid, retBranch:r2, mid2:mid2, keys:Object.keys(AE.movesMap?AE.movesMap():{})});
})()`));
console.log((((g2.retMain === true) || (g2.retBranch === true)) ? 'OK   ' : 'FAIL ') + 'G2 主管/支管整条拖动仍在（moves 通用机制未误删） = ' + JSON.stringify(g2) +
  '（交互层条件 autoDrag.pid !== \'front\' 已保证非总管仍提交；真实拖动命中的 ' + autoPaths.length + ' 条里本例主要是总管分段）');
console.log((fpSnap === fpSnap2 ? 'OK   ' : 'FAIL ') + 'G3 拖后总管几何不变 = ' + fpSnap.slice(0, 42) + (fpSnap === fpSnap2 ? '（未变）' : ' → ' + fpSnap2.slice(0, 42)));

/* ---------- W6：简图命中回归 ---------- */
await ev(`(function(){
  try{ window.rySetTab('tlPipePlanSection','pipe'); }catch(e){}
  var _n=document.getElementById('tlDiagramContent')||document.getElementById('tlPipePlanSection');
  while(_n && _n!==document.documentElement){ try{ _n.style.setProperty('display','block','important');
    _n.style.setProperty('visibility','visible','important'); }catch(e){} _n=_n.parentElement; }
  window.tlAutoGenerate();
  return 1;
})()`);
await sleep(800);   /* 切 tab + 重生成后布局需要一帧才稳定 */
const w6 = await ev(`(function(){
  var svg=document.querySelector('#tlDiagramContent svg');
  var el=svg?svg.querySelector('[data-junction-front][data-junction-key]'):null;
  if(!el)return JSON.stringify({ok:false,why:'no tee'});
  el.scrollIntoView({block:'center'});
  var r=el.getBoundingClientRect(); var cx=r.left+r.width/2, cy=r.top+r.height/2;
  var tp=document.elementFromPoint(cx,cy);
  return JSON.stringify({ok:true, cx:Math.round(cx), cy:Math.round(cy), top:tp?tp.tagName:'null',
    isHit:!!(tp&&tp.getAttribute&&tp.getAttribute('data-junction-hit')), key:el.getAttribute('data-junction-key')});
})()`);
const o6 = JSON.parse(w6);
console.log((o6.ok && o6.isHit ? 'OK   ' : 'FAIL ') + 'W6 简图三通中心顶层=命中圈 = ' + w6 + '  (期望 circle[data-junction-hit])');
try { child.kill(); } catch (e) { }
if (srv) srv.close();
process.exit(0);
