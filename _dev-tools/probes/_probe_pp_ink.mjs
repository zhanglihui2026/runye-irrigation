'use strict';
/* _probe_pp_ink.mjs —— 「地块分区」画布：量「绘制内容」是否超出画布（= 用户说的"只显示一半"）
 * 用法：node _probe_pp_ink.mjs
 *      VW=1512 VH=800 ZOOM=3.47 node _probe_pp_ink.mjs   （复现用户 347% 缩放态）
 *      SHOT=<path>
 * 手法：直接读 canvas 像素，算非底色像素的包围盒（ink box），
 *      再和 canvas 尺寸 / transform 的期望内容矩形对照。
 *       ink 触到画布边缘 ⇒ 内容被 canvas 自身裁掉。
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { spawn } = require('child_process');
const http = require('http'); const fs = require('fs'); const path = require('path');
const WS = globalThis.WebSocket;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = process.env.RY_ROOT || 'C:/Users/AHS/runye-irrigation';
const VW = Number(process.env.VW || 1512), VH = Number(process.env.VH || 800);
const PORT = 48680 + Math.floor(Math.random() * 40), CDP = 48980 + Math.floor(Math.random() * 40);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const srv = http.createServer((req, r2) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const fp = path.join(ROOT, p.replace(/^\//, '')); if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r2.writeHead(404); r2.end('nf'); return; } r2.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(fp).pipe(r2); });
await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
const PROXY = process.env.RY_PROXY || 'http://127.0.0.1:7897';
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox',
  '--proxy-server=' + PROXY, '--proxy-bypass-list=127.0.0.1;localhost',
  '--remote-debugging-port=' + CDP,
  '--user-data-dir=C:\\tmp\\cdp_ppink_' + Date.now(), '--window-size=' + VW + ',' + VH], { stdio: 'ignore' });
const hreq = (m, p) => new Promise((res, rej) => { const q = http.request({ host: '127.0.0.1', port: CDP, path: p, method: m }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); }); q.on('error', rej); q.end(); });
for (let i = 0; i < 60; i++) { try { await hreq('GET', '/json/version'); break; } catch (e) { await sleep(300); } }
let idc = 1, ws; const pend = {};
const send = (m, p = {}) => new Promise((res, rej) => { const id = idc++; pend[id] = { res, rej }; ws.send(JSON.stringify({ id, method: m, params: p })); setTimeout(() => { if (pend[id]) { delete pend[id]; rej(new Error('timeout ' + m)); } }, 60000); });
const TARGET = process.env.URL || ('http://127.0.0.1:' + PORT + '/index.html');
const t = JSON.parse(await hreq('PUT', '/json/new?' + encodeURIComponent(TARGET)));
ws = new WS(t.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
ws.addEventListener('message', e => { const o = JSON.parse(e.data); if (o.id && pend[o.id]) { const { res, rej } = pend[o.id]; delete pend[o.id]; o.error ? rej(new Error(o.error.message)) : res(o.result); return; } if (o.method === 'Page.javascriptDialogOpening') { ws.send(JSON.stringify({ id: idc++, method: 'Page.handleJavaScriptDialog', params: { accept: true } })); } });
await send('Runtime.enable'); await send('Page.enable');
try { await send('Page.bringToFront'); await send('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch (e) { }
await send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
await send('Page.reload', { ignoreCache: true });
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return { __err: String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text).slice(0, 300) }; return r.result.value; };
for (let i = 0; i < 80; i++) { if (await ev('typeof window.ryShowSection==="function" && !!document.getElementById("ppCanvas")') === true) break; await sleep(400); }
const HIDE = "(function(){document.querySelectorAll('.ry-ann-mask,.ry-ann-card').forEach(function(e){e.style.setProperty('display','none','important');});return 1;})()";
await ev("(function(){try{window.RyAnnounce&&window.RyAnnounce.close&&window.RyAnnounce.close();}catch(e){}return 1;})()");
await ev(HIDE);

/* 用户截图里那块地：不规则六边形，bbox 约 528×237 m（左侧与右侧带斜边） */
const POLY = 'window.measuredPolygon=[{x:0,y:60},{x:70,y:0},{x:470,y:0},{x:528,y:80},{x:528,y:237},{x:0,y:237}];';
await ev("(function(){" + POLY + "window.measuredArea=528*237;return 1;})()");

console.log('进入地块分区:', JSON.stringify(await ev("(function(){try{window.ryShowSection(document.getElementById('pipePlanSection'),null);window.ppLoadPolygon&&window.ppLoadPolygon();return 1;}catch(e){return 'err '+e.message;}})()")));
await sleep(1200);
await ev(HIDE);
await ev("(function(){window.dispatchEvent(new Event('resize'));return 1;})()");
await sleep(800);

if (process.env.ZOOM) {
  await ev("(function(){var st=window.RunyeBridge&&window.RunyeBridge.state;if(!st)return 'no state';st.zoom=" + Number(process.env.ZOOM) + ";window.dispatchEvent(new Event('resize'));return st.zoom;})()");
  await sleep(900);
}

const MEAS = `(function(){
  function box(el){ if(!el) return null; var r=el.getBoundingClientRect(); return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),b:Math.round(r.bottom),r:Math.round(r.right)}; }
  var wrap=document.getElementById('ppCanvasWrap'), cv=document.getElementById('ppCanvas'), ctx=cv.getContext('2d');
  var out={vp:{w:innerWidth,h:innerHeight}, wrap:box(wrap), canvasBox:box(cv),
    canvasAttr:{w:cv.width,h:cv.height}, wrapClient:{w:wrap.clientWidth,h:wrap.clientHeight},
    canvasOver:Math.round(cv.getBoundingClientRect().height - wrap.clientHeight)};
  /* —— 墨迹包围盒：跳过 1px 采样，底色以四角像素为参照 —— */
  var d=ctx.getImageData(0,0,cv.width,cv.height).data;
  function px(x,y){var i=(y*cv.width+x)*4;return [d[i],d[i+1],d[i+2],d[i+3]];}
  var bg=px(1,1);
  var minX=1e9,minY=1e9,maxX=-1,maxY=-1,n=0;
  for(var y=0;y<cv.height;y+=2){ for(var x=0;x<cv.width;x+=2){ var p=px(x,y);
    if(Math.abs(p[0]-bg[0])+Math.abs(p[1]-bg[1])+Math.abs(p[2]-bg[2])>24){ n++; if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y; } } }
  out.bg=bg; out.inkPixels=n;
  out.ink = n? {x:minX,y:minY,r:maxX,b:maxY,w:maxX-minX,h:maxY-minY,
    gapLeft:minX, gapRight:cv.width-1-maxX, gapTop:minY, gapBottom:cv.height-1-maxY,
    touchesBottom:maxY>=cv.height-3, touchesRight:maxX>=cv.width-3, touchesLeft:minX<=2, touchesTop:minY<=2} : null;
  var sec=document.getElementById('pipePlanSection');
  out.layout={bodyCls:document.body.className, dataSec:document.body.getAttribute('data-ry-sec'),
    dataView:sec.getAttribute('data-ry-view'), dataRail:sec.getAttribute('data-ry-rail'), dataClean:sec.getAttribute('data-ry-clean'),
    stageCls:(document.querySelector('#pipePlanSection .pp-stage')||{}).className,
    paneCls:(document.querySelector('#pipePlanSection .ry-pane-edit')||{}).className,
    sideW:getComputedStyle(sec).getPropertyValue('--pp-side-w'), toolW:getComputedStyle(sec).getPropertyValue('--pp-tool-w'),
    side:box(document.querySelector('#pipePlanSection .pp-side')),
    toolbar:box(document.getElementById('ppToolbar'))};
  var st=window.RunyeBridge&&window.RunyeBridge.state;
  out.fitBtn=(function(){var b=document.getElementById('ppFitViewBtn');if(!b)return {exists:false};
    var r=b.getBoundingClientRect();var cs2=getComputedStyle(b);
    return {exists:true,on:b.classList.contains('is-on'),display:cs2.display,
      box:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)},
      overlapsCanvas:r.bottom<=cv.getBoundingClientRect().bottom+1};})();
  out.view=window.__ppViewDebug?window.__ppViewDebug():null;
  if(st&&st.transform){ var tr=st.transform;
    out.zoom=st.zoom; out.pan={x:st.panX,y:st.panY};
    out.transform={scale:tr.scale, minX:tr.minX, minY:tr.minY, scaleX:tr.scaleX, scaleY:tr.scaleY, offsetX:+tr.offsetX.toFixed(1), offsetY:+tr.offsetY.toFixed(1)};
    /* 期望内容矩形（按 transform 推算）：内容宽 = displayW*scale，高 = displayH*scale
       displayW 无法直读，用 offsetX 反推：offsetX = pad + (W-2pad-contentW)/2 */
    var pad=50;
    out.expectContentW=+(cv.width-2*pad-2*(tr.offsetX-pad)).toFixed(1);
    out.expectContentH=+(cv.height-2*pad-2*(tr.offsetY-pad)).toFixed(1);
    out.expectOverflowY=+(out.expectContentH-(cv.height-2*pad)).toFixed(1);
    out.expectOverflowX=+(out.expectContentW-(cv.width-2*pad)).toFixed(1);
  }
  return out;
})()`;

const m = await ev(MEAS);
console.log('\n=== 地块分区画布 ===');
console.log(JSON.stringify(m, null, 1));

/* 5) 强制「用户自己滚轮放大」的裁切态（走真实 wheel 事件，连变换一起重算），确认：
      a. 胶囊 #ppFitViewBtn 亮起且落在画布内；
      b. 点一下整幅回来（clipped=false、胶囊自动收起）。 */
await ev("(function(){var cv=document.getElementById('ppCanvas');var r=cv.getBoundingClientRect();"
  + "for(var i=0;i<25;i++){cv.dispatchEvent(new WheelEvent('wheel',{deltaY:-100,clientX:r.left+r.width/2,clientY:r.top+r.height/2,bubbles:true,cancelable:true}));}"
  + "return 1;})()");
await sleep(400);
console.log('裁切态:', JSON.stringify(await ev("(function(){var d=window.__ppViewDebug();var b=document.getElementById('ppFitViewBtn');var r=b.getBoundingClientRect();var cv=document.getElementById('ppCanvas').getBoundingClientRect();"
  + "return {clipped:d.clipped,zoom:+d.zoom.toFixed(3),btnOn:b.classList.contains('is-on'),btnDisplay:getComputedStyle(b).display,"
  + "btn:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)},insideCanvas:(r.top>=cv.top&&r.bottom<=cv.bottom+1&&r.right<=cv.right+1)};})()")));
const snap = async (file) => {
  await ev("(function(){document.body.getBoundingClientRect();return new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(function(){r(1)})})})})()");
  await sleep(500);
  await send('Page.captureScreenshot', { format: 'png' });
  await sleep(250);
  const rect = await ev("(function(){var c=document.getElementById('ppCanvasWrap');var r=c.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)};})()");
  const shot = await send('Page.captureScreenshot', { format: 'png', clip: Object.assign({ scale: 1 }, rect) });
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
  console.log('截图已存: ' + file);
};
if (process.env.SHOT_CLIP) await snap(process.env.SHOT_CLIP);
await ev("(function(){document.getElementById('ppFitViewBtn').click();return 1;})()");
await sleep(400);
console.log('点一下之后:', JSON.stringify(await ev("(function(){var d=window.__ppViewDebug();var b=document.getElementById('ppFitViewBtn');"
  + "return {clipped:d.clipped,zoom:+d.zoom.toFixed(3),btnOn:b.classList.contains('is-on')};})()")));

/* 6) 平移收口：把图拖歪（panX/panY 非 0，这份状态也会进存档）后改窗口，应自动回中 */
await ev("(function(){var st=window.RunyeBridge.state;st.panX=400;st.panY=200;window.ppRender();window.dispatchEvent(new Event('resize'));return 1;})()");
await sleep(600);
console.log('拖歪后改窗口:', JSON.stringify(await ev("(function(){var d=window.__ppViewDebug();return {panX:d.panX,panY:d.panY,clipped:d.clipped};})()")));

if (process.env.SHOT) {
  await ev("(function(){document.body.getBoundingClientRect();return new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(function(){r(1)})})})})()");
  await sleep(600);
  await send('Page.captureScreenshot', { format: 'png' });
  await sleep(300);
  const rect = await ev("(function(){var c=document.getElementById('ppCanvasWrap');var r=c.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)};})()");
  const shot = await send('Page.captureScreenshot', { format: 'png', clip: Object.assign({ scale: 1 }, rect) });
  fs.writeFileSync(process.env.SHOT, Buffer.from(shot.data, 'base64'));
  console.log('截图已存: ' + process.env.SHOT);
}

try { ws.close(); } catch (e) { }
try { child.kill('SIGKILL'); } catch (e) { }
srv.close();
process.exit(0);
