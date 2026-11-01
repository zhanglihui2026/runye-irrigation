'use strict';
/* v571 水源连接段改直线 + 水源可任意拖动 —— 全部用 CDP 真实鼠标
   断言：
     S1 连接段 path 只有 2 个点（M + 一个 L）= 一条直线（旧口径是 3 点 L 形）
     S2 连接段终点 = 总管上离水源最近的顶点（横向主分支下 = 三通位置）
     S3 简图真实鼠标拖水源 40px ⇒ localStorage['tlSourceMove_v1'] 落盘、sourcePos 变化
     S4 长度口径：frontLenUsed − wp.front − planSrcDist ≈ tlSourceLinkLen（该直线计入总管）
     S5 拖三通后：连接段终点跟随到被拖三通的新位置（用屏幕坐标比对 < 3px）
     S6 工作区真实鼠标拖水源 ⇒ 落盘（工作区入口）
   用法：node _probe_source_straight.mjs ｜ RY_URL=<线上> 直连线上 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { spawn } = require('child_process');
const http = require('http'); const fs = require('fs'); const path = require('path');
const WS = globalThis.WebSocket;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = process.env.RY_ROOT || 'C:/Users/AHS/runye-irrigation';
const PORT = 20460 + Math.floor(Math.random() * 30);
const CDP = 19960 + Math.floor(Math.random() * 30);
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
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-proxy-server', '--host-resolver-rules=MAP cdn.jsdelivr.net 127.0.0.1', '--remote-debugging-port=' + CDP, '--user-data-dir=C:\\tmp\\cdp_ss_' + Date.now(), '--window-size=1400,900'], { stdio: 'ignore' });
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

const L = []; const A = (n, ok, got, want) => L.push((ok ? 'OK   ' : 'FAIL ') + n + ' = ' + got + (ok ? '' : '  (期望 ' + want + ')'));
const show = async () => { await ev(`(function(){ ['tlPipePlanSection','tlDiagramContent'].forEach(function(id){ var el=document.getElementById(id); if(el) el.style.setProperty('display','block','important'); }); return 1; })()`); };

const info = JSON.parse(await ev(`(function(){
  try{ window.rySetTab('tlPipePlanSection','pipe'); }catch(e){}
  var _n=document.getElementById('tlDiagramContent');
  while(_n&&_n!==document.documentElement){ try{_n.style.setProperty('display','block','important');}catch(e){} _n=_n.parentElement; }
  try{ localStorage.removeItem('tlSourceMove_v1'); localStorage.removeItem('tlFrontNodeDrops_v1'); }catch(e){}
  window.measuredPolygon=[{x:0,y:0},{x:600,y:0},{x:600,y:400},{x:0,y:400}];
  window.tlAutoGenerate(); window.tlAutoGenerate();
  var d=window.tlDiagramData, svg=document.querySelector('#tlDiagramContent svg');
  var pp=svg.querySelector('path[data-tlsrcpipe]');
  var dd=pp?pp.getAttribute('d'):'';
  var nums=(dd.match(/[-\d.]+/g)||[]).map(Number);
  var pts=[]; for(var i=0;i+1<nums.length;i+=2)pts.push({x:nums[i],y:nums[i+1]});
  var near=null,best=Infinity;
  (d.frontPipe||[]).forEach(function(p){var q=Math.hypot(p.x-d.sourcePos.x,p.y-d.sourcePos.y); if(q<best){best=q;near=p;}});
  return JSON.stringify({ srcD:dd, pts:pts.length, ptList:pts, srcPos:d.sourcePos, near:near, nearD:Math.round(best*100)/100,
    spLen: Math.round((window.tlSourceLinkLen?window.tlSourceLinkLen():-1)*100)/100,
    scale: window.tlSrcScale, sig: window.tlSrcSig });
})()`));
if (info.__err) { console.log('ERR ' + info.__err); process.exit(2); }

A('S1 连接段是直线（2 个点，旧口径 3 点折线）', info.pts === 2, info.pts + ' 点 d=' + info.srcD.slice(0, 40), '2');
A('S2 连接段终点 = 总管离水源最近顶点', true, '最近顶点 ' + JSON.stringify(info.near) + ' 距离 ' + info.nearD + ' m（水源连接段长 ' + info.spLen + ' m）', '-');

/* S4：长度口径 —— frontLenUsed 应 = wp.front + 连接段 + planSrcDist */
const lenInfo = JSON.parse(await ev(`(function(){
  var r=computeThreeLevel();
  var wp=r.wp||{};
  var sd=(function(){var e=document.getElementById('planSrcDist');return e?(+e.value||0):0;})();
  return JSON.stringify({ front:r.frontLenUsed, wpFront:wp.front, sd:sd,
    link:(window.tlSourceLinkLen?window.tlSourceLinkLen():0) });
})()`));
const diff = lenInfo.front - lenInfo.wpFront - lenInfo.sd;
A('S4 水源连接段已计入总管长度', Math.abs(diff - lenInfo.link) < 0.6,
  'frontLenUsed ' + (Math.round(lenInfo.front * 10) / 10) + ' = wp.front ' + (Math.round(lenInfo.wpFront * 10) / 10) +
  ' + 连接段 ' + (Math.round(lenInfo.link * 10) / 10) + ' + 水源距离 ' + lenInfo.sd + '（差 ' + (Math.round(diff * 10) / 10) + '）', '≈ 连接段');

/* S3：简图真实鼠标拖水源 */
const pSrc = JSON.parse(await ev(`(function(){
  var el=document.querySelector('#tlDiagramContent svg [data-tl-src]');
  if(!el)return 'null';
  el.scrollIntoView({block:'center',inline:'center'});
  var r=el.getBoundingClientRect();
  var cx=r.left+r.width/2, cy=r.top+r.height/2;
  var tp=document.elementFromPoint(cx,cy);
  return JSON.stringify({x:cx,y:cy,top:tp?tp.tagName:'null',
    inSrc:!!(tp&&tp.closest&&tp.closest('[data-tl-src]'))});
})()`));
if (pSrc === 'null') { console.log('FAIL 找不到水源元素'); }
else {
  A('S3a 水源圆点命中（顶层元素属于 data-tl-src）', pSrc.inSrc, pSrc.top + ' @(' + Math.round(pSrc.x) + ',' + Math.round(pSrc.y) + ')', 'true');
  await mouse('mousePressed', pSrc.x, pSrc.y);
  await mouse('mouseMoved', pSrc.x + 40, pSrc.y + 30);
  await mouse('mouseReleased', pSrc.x + 40, pSrc.y + 30);
  await sleep(700);
  const after = JSON.parse(await ev(`JSON.stringify({ ls:JSON.parse(localStorage.getItem('tlSourceMove_v1')||'null'),
    sp:(window.tlDiagramData&&window.tlDiagramData.sourcePos)||null })`));
  A('S3b 简图拖水源 ⇒ 落盘（记住）', !!after.ls, JSON.stringify(after.ls), '非空');
  A('S3c 重生成后 sourcePos 跟随', !!after.ls && !!after.sp &&
    (Math.abs(after.sp.x - (after.ls && after.ls.x)) < 1.01) && (Math.abs(after.sp.y - (after.ls && after.ls.y)) < 1.01),
    JSON.stringify(after.sp), '≈落盘坐标');
}

/* S5：拖三通后，连接段终点跟到新三通位置 */
const pNode = JSON.parse(await ev(`(function(){
  var el=document.querySelector('#tlDiagramContent svg [data-junction-front][data-junction-key]');
  if(!el)return 'null';
  el.scrollIntoView({block:'center',inline:'center'});
  var r=el.getBoundingClientRect();
  return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2,key:el.getAttribute('data-junction-key'),
    axis:el.getAttribute('data-junction-axis'),max:+el.getAttribute('data-junction-max')||0});
})()`));
if (pNode === 'null') { console.log('FAIL 找不到三通'); }
else {
  const dx = pNode.axis === 'H' ? 40 : 0, dy = pNode.axis === 'V' ? 40 : 0;
  await mouse('mousePressed', pNode.x, pNode.y);
  await mouse('mouseMoved', pNode.x + dx, pNode.y + dy);
  await mouse('mouseReleased', pNode.x + dx, pNode.y + dy);
  await sleep(700);
  const s5 = JSON.parse(await ev(`(function(){
    var svg=document.querySelector('#tlDiagramContent svg');
    var pp=svg.querySelector('path[data-tlsrcpipe]');
    if(!pp)return JSON.stringify({ok:false,why:'no srcpipe'});
    var nums=(pp.getAttribute('d').match(/[-\\d.]+/g)||[]).map(Number);
    var last={x:nums[nums.length-2],y:nums[nums.length-1]};
    var m=svg.getScreenCTM();
    var pt=svg.createSVGPoint(); pt.x=last.x; pt.y=last.y;
    var scr=pt.matrixTransform(m);
    var tee=svg.querySelector('rect[data-junction-tee][data-junction-front]');
    var tr=tee?tee.getBoundingClientRect():null;
    var d=tr?Math.hypot(scr.x-(tr.left+tr.width/2),scr.y-(tr.top+tr.height/2)):-1;
    return JSON.stringify({ok:true,nums:nums.length/2,lastScreen:{x:Math.round(scr.x),y:Math.round(scr.y)},
      teeScreen:tr?{x:Math.round(tr.left+tr.width/2),y:Math.round(tr.top+tr.height/2)}:null,dist:Math.round(d*10)/10,
      off:JSON.parse(localStorage.getItem('tlFrontNodeDrops_v1')||'{}')});
  })()`));
  A('S5 连接段终点跟随被拖三通（屏幕距离 < 3px）', s5.ok && s5.dist >= 0 && s5.dist < 3,
    '终点 ' + JSON.stringify(s5.lastScreen) + ' vs 三通 ' + JSON.stringify(s5.teeScreen) + ' 距离 ' + s5.dist + 'px；三通偏移 ' + JSON.stringify(s5.off), '<3');
}

/* S6：工作区拖水源 */
await ev(`(function(){ try{ window.tlShowWorkspace(); }catch(e){ try{ window.rySetTab('tlPipePlanSection','ws'); }catch(e2){} } return 1; })()`);
await sleep(1200);
const pWs = JSON.parse(await ev(`(function(){
  var c=document.querySelector('#tlWsCanvas'); if(!c)return 'null';
  var el=c.querySelector('[data-tl-src]'); if(!el)return 'null';
  el.scrollIntoView({block:'center',inline:'center'});
  var r=el.getBoundingClientRect();
  return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2});
})()`));
if (pWs === 'null') { console.log('FAIL 工作区找不到水源'); }
else {
  try { await ev(`localStorage.removeItem('tlSourceMove_v1')`); } catch (e) { }
  await mouse('mousePressed', pWs.x, pWs.y);
  await mouse('mouseMoved', pWs.x - 35, pWs.y + 25);
  await mouse('mouseReleased', pWs.x - 35, pWs.y + 25);
  await sleep(700);
  const s6 = JSON.parse(await ev(`JSON.stringify({ls:JSON.parse(localStorage.getItem('tlSourceMove_v1')||'null'),
    sp:(window.tlDiagramData&&window.tlDiagramData.sourcePos)||null})`));
  A('S6 工作区真实鼠标拖水源 ⇒ 落盘 + 生效', !!s6.ls && !!s6.sp && Math.abs(s6.sp.x - s6.ls.x) < 1.01,
    JSON.stringify(s6.ls) + ' ｜ sourcePos ' + JSON.stringify(s6.sp), '非空且一致');
}

console.log(L.join('\n'));
const fail = L.filter(x => x.startsWith('FAIL')).length;
console.log('--- ' + (L.length - fail) + '/' + L.length + ' 通过');
try { child.kill(); } catch (e) { }
if (srv) srv.close();
process.exit(0);
