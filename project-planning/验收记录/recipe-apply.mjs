'use strict';
/* 探针：点「调用」后，面板 10 项参数与结果是否跟随配方变化。
   用法：node _p1/_tmp_probe_recipe_apply.mjs */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { spawn } = require('child_process');
const http = require('http'); const fs = require('fs'); const path = require('path');
const WS = globalThis.WebSocket;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = 'C:/Users/AHS/runye-irrigation';
const PORT = 39120 + Math.floor(Math.random() * 30);
const CDP = 39320 + Math.floor(Math.random() * 30);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const srv = http.createServer((req, r2) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const fp = path.join(ROOT, p.replace(/^\//, '')); if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r2.writeHead(404); r2.end('nf'); return; }
  r2.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(fp).pipe(r2); });
await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-proxy-server',
  '--remote-debugging-port=' + CDP, '--user-data-dir=C:\\tmp\\cdp_rc_' + Date.now(), '--window-size=1440,900'], { stdio: 'ignore' });
const hreq = (m, p) => new Promise((res, rej) => { const q = http.request({ host: '127.0.0.1', port: CDP, path: p, method: m }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); }); q.on('error', rej); q.end(); });
for (let i = 0; i < 60; i++) { try { await hreq('GET', '/json/version'); break; } catch (e) { await sleep(300); } }
let idc = 1, ws; const pend = {}; const errors = [];
const send = (m, p = {}) => new Promise((res, rej) => { const id = idc++; pend[id] = { res, rej }; ws.send(JSON.stringify({ id, method: m, params: p })); setTimeout(() => { if (pend[id]) { delete pend[id]; rej(new Error('timeout ' + m)); } }, 120000); });
const t = JSON.parse(await hreq('PUT', '/json/new?' + encodeURIComponent('http://127.0.0.1:' + PORT + '/index.html#pipePlanSection')));
ws = new WS(t.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
ws.addEventListener('message', e => {
  const o = JSON.parse(e.data);
  if (o.id && pend[o.id]) { const { res, rej } = pend[o.id]; delete pend[o.id]; o.error ? rej(new Error(o.error.message)) : res(o.result); return; }
  if (o.method === 'Runtime.exceptionThrown') { const d = o.params.exceptionDetails || {}; errors.push('EXCEPTION: ' + ((d.exception && (d.exception.description || d.exception.value)) || d.text || '').slice(0, 220)); }
  if (o.method === 'Page.javascriptDialogOpening') { ws.send(JSON.stringify({ id: idc++, method: 'Page.handleJavaScriptDialog', params: { accept: true } })); }
});
await send('Runtime.enable'); await send('Page.enable');
try { await send('Page.bringToFront'); await send('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch (e) { }
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return { __err: String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text).slice(0, 300) }; return r.result.value; };
for (let i = 0; i < 80; i++) { if (await ev("!!window.RyPlanParams") === true) break; await sleep(500); }
await sleep(1200);

const IDS = ['planLift', 'planDh', 'planSrcDist', 'planTapeSpacing', 'planEmitterSpacing',
  'planEmitterFlow', 'planTapeLaySide', 'planZoneMuManual', 'planTapePressure', 'planTargetV'];
const READ = `(function(){
  var ids=${JSON.stringify(IDS)};
  var vals={}, shown={}, labels={};
  ids.forEach(function(id){
    var e=document.getElementById(id); if(!e){vals[id]='<MISSING>';return;}
    vals[id]=e.value;
    var cs=getComputedStyle(e);
    shown[id]=(cs.display!=='none'&&cs.visibility!=='hidden')?'visible':'hidden';
    var it=e.closest('.pp-plan-item');
    var lb=it&&it.querySelector('.pp-plan-label');
    labels[id]=lb?lb.textContent.trim():'';
  });
  var res={};
  ['planIntensity','planPumpFlow','planPumpHead','planPumpPower','planMotorPower','planMainPipe','planBranchPipe'].forEach(function(k){var e=document.getElementById(k);if(e)res[k]=e.textContent.trim();});
  var proxy={};
  ids.forEach(function(id){
    var p=document.querySelector('sl-input[data-ry-proxy-for="'+id+'"]');
    var n=document.getElementById(id);
    proxy[id]=p?{value:p.value,hidden:!!p.hidden,nativeHidden:!!n.hidden,nativeValue:n.value}:null;
  });
  var _st=window.RunyeBridge&&window.RunyeBridge.state;
  var pipeN=_st?((_st.mainPipes||[]).length+(_st.branchPipes||[]).length+(_st.subBranchPipes||[]).length):-1;
  var host=document.getElementById('ryCadSide');
  var hr=host?host.getBoundingClientRect():null;
  var st=document.getElementById('ppRecipeStatus');
  return {vals:vals,shown:shown,labels:labels,proxy:proxy,pipeN:pipeN,
    hostBox:hr?{x:Math.round(hr.x),y:Math.round(hr.y),w:Math.round(hr.width),h:Math.round(hr.height)}:null,
    res:res,
    calc:(document.getElementById('ppCalcDetail')||{}).textContent||'',
    status:st?st.textContent:'',
    store:(function(){try{return JSON.parse(localStorage.getItem('runye_plan_params_v1')||'null');}catch(e){return 'ERR'}})(),
    area:(window.measuredArea||null)+'|'+((window.measuredPolygon||[]).length)};
})()`;

/* ★ 死坑：区块默认 display:none ⇒ 左栏 0×0、监听链不跑。必须先像用户点导航一样激活。 */
const act = await ev(`(function(){
  try{
    var sec=document.getElementById('pipePlanSection');
    if(typeof ryShowSection==='function') ryShowSection(sec);
    var s=document.getElementById('ppSide');
    var r=s?s.getBoundingClientRect():null;
    return {hasSec:!!sec, active:sec?sec.className:null, sideBox:r?{w:Math.round(r.width),h:Math.round(r.height)}:null};
  }catch(e){return {err:e.message};}
})()`);
await sleep(1200);

/* 先造一个真实地块：没有地块时 ppRepartitionFromRotatedPlot 会 alert 后直接 return */
const plot = await ev(`(function(){
  try{
    window.measuredPolygon=[{x:0,y:0},{x:200,y:0},{x:200,y:60},{x:0,y:60}];
    window.measuredArea=12000;
    if(typeof ppLoadPolygon==='function') ppLoadPolygon();
    if(window.ppState&&(!window.ppState.polyPts||!window.ppState.polyPts.length)){
      window.ppState.polyPts=[{x:0,y:0},{x:200,y:0},{x:200,y:60},{x:0,y:60}];
    }
    if(typeof updatePlan==='function') updatePlan();
    window.measuredArea=12000;
    if(typeof calcPlan==='function') calcPlan();
    if(typeof ppGenerateDiagram==='function') ppGenerateDiagram({scroll:false});
    return {area:window.measuredArea, polyPts:(window.ppState&&window.ppState.polyPts||[]).length};
    return {area:window.measuredArea, pts:(window.measuredPolygon||[]).length};
  }catch(e){return {err:e.message};}
})()`);
await sleep(1500);

/* 生成一套管线，用来验「调用不得毁图」 */
const pipeGen = await ev(`(function(){
  try{
    var st=window.RunyeBridge&&window.RunyeBridge.state;
    if(st&&(!st.polyPts||!st.polyPts.length)) st.polyPts=[{x:0,y:0},{x:200,y:0},{x:200,y:60},{x:0,y:60}];
    var b=document.getElementById('ppAutoPipe');
    if(b) b.click();
    var s2=window.RunyeBridge&&window.RunyeBridge.state;
    return {clicked:!!b, main:(s2&&s2.mainPipes||[]).length, branch:(s2&&s2.branchPipes||[]).length};
  }catch(e){return {err:e.message};}
})()`);
await sleep(1200);

const before = await ev(READ);
/* 种一个与当前值全不同的配方 */
const seeded = await ev(`(function(){
  var tgt={planLift:'9',planDh:'7',planSrcDist:'33',planTapeSpacing:'0.6',planEmitterSpacing:'0.5',
    planEmitterFlow:'1.2',planTapeLaySide:'66',planZoneMuManual:'12',planTapePressure:'2.2',planTargetV:'2.0'};
  localStorage.setItem('runye_irrigation_recipes_v1',JSON.stringify({version:1,recipes:[{id:'r_probe',name:'探针方案',at:Date.now(),params:tgt}]}));
  var refreshed=null; try{ if(window.RyRecipes&&window.RyRecipes.refresh) window.RyRecipes.refresh('r_probe'); refreshed='ok'; }catch(e){refreshed='ERR:'+e.message;}
  var sel=document.getElementById('ppRecipeSelect');
  return {refreshed:refreshed, selValue:sel?sel.value:null, opts:sel?[].map.call(sel.options,function(o){return o.value+'|'+o.textContent;}):null};
})()`);

/* 模拟真实点击「调用」 */
const clicked = await ev(`(function(){
  var b=document.getElementById('ppRecipeApply');
  if(!b) return {err:'no button'};
  b.click();
  return {ok:true, status:(document.getElementById('ppRecipeStatus')||{}).textContent||''};
})()`);
await sleep(900);
const after = await ev(READ);

/* 截左栏，对照用户截图 */
try {
  /* 截图前确保侧栏展开（生成管线后会被收起） */
  await ev(`(function(){var g=document.getElementById('ryCadSideGrip');var h=document.getElementById('ryCadSide');if(h&&h.getBoundingClientRect().width<100&&g)g.click();return 1;})()`);
  await sleep(700);
  const box = await ev(`(function(){
    var cand=['ryCadSide','ppSide'];
    for(var i=0;i<cand.length;i++){var e=document.getElementById(cand[i]);if(!e)continue;var r=e.getBoundingClientRect();if(r.width>10&&r.height>10)return {id:cand[i],x:Math.max(0,r.x),y:Math.max(0,r.y),w:r.width,h:Math.min(r.height,900)};}
    return null;})()`);
  if (box && box.w > 10 && box.h > 10) {
    const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: box.x, y: box.y, width: box.w, height: box.h, scale: 2 }, captureBeyondViewport: false });
    fs.mkdirSync(path.join(ROOT, '_verify_out'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, '_verify_out', '_tmp_ppside.png'), Buffer.from(shot.data, 'base64'));
    console.log('SHOT: _verify_out/_tmp_ppside.png  box=' + JSON.stringify(box));
  } else { console.log('SHOT SKIP: ppSide box=' + JSON.stringify(box)); }
} catch (e) { console.log('SHOT ERR: ' + e.message); }

/* 差异表 */
const diffs = [];
IDS.forEach(id => {
  const b = before.vals ? before.vals[id] : null;
  const a = after.vals ? after.vals[id] : null;
  diffs.push({ id, label: (before.labels || {})[id] || '', before: b, after: a, changed: String(b) !== String(a), shown: (after.shown || {})[id] });
});
console.log(JSON.stringify({ plot, pipeGen, pipeBefore: before.pipeN, pipeAfter: after.pipeN, seeded, clicked, diffs, beforeRes: before.res, afterRes: after.res, proxyAfter: after.proxy, hostBox: after.hostBox || before.hostBox, statusAfter: after.status, storeAfter: after.store, errors }, null, 2));
try { ws.close(); } catch (e) { }
try { child.kill(); } catch (e) { }
try { srv.close(); } catch (e) { }
process.exit(0);
