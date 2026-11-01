'use strict';
/* _probe_tl_fit.mjs —— 量「三级管线简图 / 首部系统图」是否整幅可见（不裁切、不出滚动条）
 * 用法：node _probe_tl_fit.mjs
 * 量：容器 client/scroll 尺寸、svg 的 rect 是否越出容器、computed overflow、有没有滚动条。
 * 判定：verticalOverflow = scrollHeight - clientHeight；svgClipped = svgRect 越界。
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { spawn } = require('child_process');
const http = require('http'); const fs = require('fs'); const path = require('path');
const WS = globalThis.WebSocket;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = process.env.RY_ROOT || 'C:/Users/AHS/runye-irrigation';
const VW = Number(process.env.VW || 1280), VH = Number(process.env.VH || 760);
const PORT = 48480 + Math.floor(Math.random() * 40), CDP = 48780 + Math.floor(Math.random() * 40);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const srv = http.createServer((req, r2) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const fp = path.join(ROOT, p.replace(/^\//, '')); if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r2.writeHead(404); r2.end('nf'); return; } r2.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(fp).pipe(r2); });
await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
const PROXY = process.env.RY_PROXY || 'http://127.0.0.1:7897';
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox',
  '--proxy-server=' + PROXY, '--proxy-bypass-list=127.0.0.1;localhost',
  '--remote-debugging-port=' + CDP,
  '--user-data-dir=C:\\tmp\\cdp_tlfit_' + Date.now(), '--window-size=' + VW + ',' + VH], { stdio: 'ignore' });
const hreq = (m, p) => new Promise((res, rej) => { const q = http.request({ host: '127.0.0.1', port: CDP, path: p, method: m }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); }); q.on('error', rej); q.end(); });
for (let i = 0; i < 60; i++) { try { await hreq('GET', '/json/version'); break; } catch (e) { await sleep(300); } }
let idc = 1, ws; const pend = {};
const send = (m, p = {}) => new Promise((res, rej) => { const id = idc++; pend[id] = { res, rej }; ws.send(JSON.stringify({ id, method: m, params: p })); setTimeout(() => { if (pend[id]) { delete pend[id]; rej(new Error('timeout ' + m)); } }, 60000); });
const t = JSON.parse(await hreq('PUT', '/json/new?' + encodeURIComponent('http://127.0.0.1:' + PORT + '/index.html')));
ws = new WS(t.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
ws.addEventListener('message', e => { const o = JSON.parse(e.data); if (o.id && pend[o.id]) { const { res, rej } = pend[o.id]; delete pend[o.id]; o.error ? rej(new Error(o.error.message)) : res(o.result); return; } if (o.method === 'Page.javascriptDialogOpening') { ws.send(JSON.stringify({ id: idc++, method: 'Page.handleJavaScriptDialog', params: { accept: true } })); } });
await send('Runtime.enable'); await send('Page.enable');
try { await send('Page.bringToFront'); await send('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch (e) { }
await send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
await send('Page.reload', { ignoreCache: true });
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return { __err: String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text).slice(0, 300) }; return r.result.value; };
for (let i = 0; i < 60; i++) { if (await ev('!!window.tlAutoGenerate') === true) break; await sleep(400); }
const HIDE = "(function(){document.querySelectorAll('.ry-ann-mask,.ry-ann-card').forEach(function(e){e.style.setProperty('display','none','important');});return 1;})()";
/* INJECT=1：注入候选修复样式，用于「先验证再落盘」 */
const FIX_CSS = `
body.ry-tool #tlPipePlanSection .ry-pane>.pp-diagram-wrap,
body.ry-tool #ryCadSide [data-pp="tlPipePlanSection"] .ry-pane>.pp-diagram-wrap{
  margin:0;flex:1 1 auto;min-height:0;display:flex;flex-direction:column;overflow:hidden}
body.ry-tool #tlDiagramContent>svg,
body.ry-tool #ppDiagramContent>svg{height:100%;max-height:100%}
#tlPipePlanSection[data-ry-view="sys"] #tlSysDiagramWrap>#tlSysDiagramContent,
#ryCadSide [data-pp="tlPipePlanSection"][data-ry-view="sys"] #tlSysDiagramWrap>#tlSysDiagramContent{overflow:auto}
#tlSysPipeBoxBody svg{max-width:100%;height:auto;display:block}
`;
if (process.env.INJECT === '1') {
  await ev("(function(){var s=document.createElement('style');s.id='__fix';s.textContent=" + JSON.stringify(FIX_CSS) + ";document.head.appendChild(s);return 1;})()");
  console.log('已注入候选修复样式');
}
await ev("(function(){try{window.RyAnnounce&&window.RyAnnounce.close&&window.RyAnnounce.close();}catch(e){}return 1;})()");
await ev("(function(){try{window.rySetTab('tlPipePlanSection','pipe');}catch(e){return 'err '+e.message;}return 1;})()");
await sleep(1500);
await ev(HIDE);
/* 生成一幅宽扁地块（528×237 的比例更接近用户截图：宽 528m 深 237m） */
console.log('生成:', JSON.stringify(await ev("(function(){ window.measuredPolygon=[{x:0,y:0},{x:528,y:0},{x:528,y:237},{x:0,y:237}]; window.measuredArea=528*237; try{ window.tlAutoGenerate(); }catch(e){ return 'err '+e.message; } return 1; })()")));
await sleep(3000);
await ev(HIDE);
/* 生成后应用会自动切到「三级管线编辑」ws 视图，简图区那时是隐藏的（rect 全 0）——必须切回 pipe */
await ev("(function(){try{window.rySetTab('tlPipePlanSection','pipe');}catch(e){return 'err '+e.message;}return 1;})()");
await sleep(1500);
await ev(HIDE);
console.log('pipe 视图 data-ry-view=', JSON.stringify(await ev("(function(){var s=document.getElementById('tlPipePlanSection');return s?s.getAttribute('data-ry-view'):'no';})()")));

const MEAS = `(function(){
  function box(el){ if(!el) return null; var r=el.getBoundingClientRect(); return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),b:Math.round(r.bottom),r:Math.round(r.right)}; }
  function m(id){
    var c=document.getElementById(id); if(!c) return {id:id,missing:true};
    var cs=getComputedStyle(c);
    var svg=c.querySelector('svg');
    var out={id:id, box:box(c), clientH:c.clientHeight, scrollH:c.scrollHeight, clientW:c.clientWidth, scrollW:c.scrollWidth,
      overflowX:cs.overflowX, overflowY:cs.overflowY, flex:cs.flex, minHeight:cs.minHeight, boxSizing:cs.boxSizing};
    out.vOver=c.scrollHeight-c.clientHeight; out.hOver=c.scrollWidth-c.clientWidth;
    if(svg){ var sr=svg.getBoundingClientRect(); var cr=c.getBoundingClientRect();
      out.svg={w:Math.round(sr.width),h:Math.round(sr.height),top:Math.round(sr.top),bottom:Math.round(sr.bottom),right:Math.round(sr.right)};
      out.vb=(svg.getAttribute('viewBox')||''); out.par=svg.getAttribute('preserveAspectRatio')||'(default)';
      out.svgCssW=getComputedStyle(svg).width; out.svgCssH=getComputedStyle(svg).height; out.svgMaxH=getComputedStyle(svg).maxHeight;
      out.svgClippedV=sr.bottom>cr.bottom+1; out.svgClippedH=sr.right>cr.right+1;
      out.gapBottom=Math.round(cr.bottom-sr.bottom); out.gapRight=Math.round(cr.right-sr.right);
    }
    return out;
  }
  return {tl:m('tlDiagramContent'), sys:m('tlSysDiagramContent'), vp:{w:innerWidth,h:innerHeight},
    bodyCls:document.body.className, isTool:document.body.classList.contains('ry-tool'),
    doc:{bodyH:document.body.scrollHeight, bodyClientH:document.body.clientHeight, docH:document.documentElement.scrollHeight,
         bodyOverflow:getComputedStyle(document.body).overflow, htmlOverflow:getComputedStyle(document.documentElement).overflow},
    wrap:box(document.getElementById('tlDiagramWrap')),
    sec:box(document.getElementById('tlPipePlanSection')),
    stage:box(document.querySelector('#tlPipePlanSection .pp-stage')),
    css:(function(){function f(sel,id){var el=id?document.getElementById(id):document.querySelector(sel);if(!el)return null;var s=getComputedStyle(el);return {display:s.display,flex:s.flex,minHeight:s.minHeight,height:s.height,overflow:s.overflow,flexDirection:s.flexDirection};}
      return {sec:f(null,'tlPipePlanSection'), body:f('#tlPipePlanSection .pp-body'), stage:f('#tlPipePlanSection .pp-stage'), wrap:f(null,'tlDiagramWrap')};})(),
    main:box(document.querySelector('body.ry-tool main')||document.querySelector('main'))};
})()`;

console.log('\n=== 三级管线简图（pipe 视图）===');
console.log(JSON.stringify(await ev(MEAS), null, 1));
/* SHOT=<path>：截一张图纸区，肉眼确认整幅可见（skill 要求：先丢一帧再截，避免旧合成帧） */
if (process.env.SHOT) {
  await ev("(function(){document.body.getBoundingClientRect();return new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(function(){r(1)})})})})()");
  await sleep(700);
  await send('Page.captureScreenshot', { format: 'png' });   /* 丢弃帧 */
  await sleep(300);
  const rect = await ev("(function(){var c=document.getElementById('tlDiagramContent');var r=c.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)};})()");
  const shot = await send('Page.captureScreenshot', { format: 'png', clip: Object.assign({ scale: 1 }, rect) });
  fs.writeFileSync(process.env.SHOT, Buffer.from(shot.data, 'base64'));
  console.log('截图已存: ' + process.env.SHOT + '  rect=' + JSON.stringify(rect));
}

/* 切到「系统简图」视图再量一次 */
await ev("(function(){try{window.rySetTab('tlPipePlanSection','sys');}catch(e){return 'err '+e.message;}return 1;})()");
await sleep(3000);
await ev(HIDE);
console.log('\n=== 首部系统图（sys 视图）===');
console.log(JSON.stringify(await ev(MEAS), null, 1));
if (process.env.SHOT2) {
  await ev("(function(){document.body.getBoundingClientRect();return new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(function(){r(1)})})})})()");
  await sleep(700);
  await send('Page.captureScreenshot', { format: 'png' });
  await sleep(300);
  const rect2 = await ev("(function(){var c=document.getElementById('tlSysDiagramContent');var r=c.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)};})()");
  const shot2 = await send('Page.captureScreenshot', { format: 'png', clip: Object.assign({ scale: 1 }, rect2) });
  fs.writeFileSync(process.env.SHOT2, Buffer.from(shot2.data, 'base64'));
  console.log('系统图截图已存: ' + process.env.SHOT2 + '  rect=' + JSON.stringify(rect2));
}
console.log('\n系统图 iframe:', JSON.stringify(await ev("(function(){var f=document.getElementById('tlSysFrame');if(!f)return 'no frame';var r=f.getBoundingClientRect();var c=document.getElementById('tlSysDiagramContent');var cr=c?c.getBoundingClientRect():null;return {frameH:Math.round(r.height),frameBottom:Math.round(r.bottom),ctnH:cr?Math.round(cr.height):0,ctnBottom:cr?Math.round(cr.bottom):0,overflowH:cr?cr.height:0,scrollH:c?c.scrollHeight:0,clipped:cr?Math.round(r.bottom-cr.bottom):null};})()")));
console.log('iframe 内部:', JSON.stringify(await ev("(function(){var f=document.getElementById('tlSysFrame');if(!f)return 'no frame';var d;try{d=f.contentDocument;}catch(e){return 'x-origin';}if(!d)return 'no doc';var de=d.documentElement;var svg=d.querySelector('svg');var sr=svg?svg.getBoundingClientRect():null;return {docScrollH:de.scrollHeight,docClientH:de.clientHeight,bodyOverflow:d.body?getComputedStyle(d.body).overflow:'',hasFit:typeof d.defaultView.ryFitEmbedSheet,svg:svg?{w:Math.round(sr.width),h:Math.round(sr.height),bottom:Math.round(sr.bottom),right:Math.round(sr.right)}:null,vOver:de.scrollHeight-de.clientHeight};})()")));

try { ws.close(); } catch (e) { }
try { child.kill('SIGKILL'); } catch (e) { }
srv.close();
process.exit(0);
