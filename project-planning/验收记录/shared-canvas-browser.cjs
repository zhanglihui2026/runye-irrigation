'use strict';

// Exercise the real shared camera in an isolated Edge profile.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const edge = [process.env.EDGE_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => p && fs.existsSync(p));
assert.ok(edge, 'Microsoft Edge is required');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((request, response) => {
  const target = path.resolve(root, '.' + decodeURIComponent(request.url.split('?')[0]));
  if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
    response.writeHead(404); response.end(); return;
  }
  response.writeHead(200, { 'content-type': mime[path.extname(target)] || 'application/octet-stream',
    'cache-control': 'no-store' });
  fs.createReadStream(target).pipe(response);
});
const requestJson = (port, method, url) => new Promise((resolve, reject) => {
  const request = http.request({ host: '127.0.0.1', port, method, path: url }, response => {
    let body = ''; response.on('data', chunk => { body += chunk; });
    response.on('end', () => { try { resolve(JSON.parse(body)); } catch (error) { reject(error); } });
  });
  request.on('error', reject); request.end();
});

async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const profile = fs.mkdtempSync(path.join(root, '.shared-canvas-'));
  const browser = spawn(edge, ['--headless=new', '--disable-gpu', '--no-first-run',
    '--no-default-browser-check', '--no-proxy-server', '--remote-debugging-port=0',
    '--user-data-dir=' + profile, '--window-size=1600,1000'], { stdio: 'ignore' });
  let ws;
  try {
    const activePortFile = path.join(profile, 'DevToolsActivePort');
    for (let i = 0; i < 80 && !fs.existsSync(activePortFile); i++) await sleep(250);
    assert.ok(fs.existsSync(activePortFile), 'Edge debugging port did not open');
    const cdpPort = Number(fs.readFileSync(activePortFile, 'utf8').split(/\r?\n/)[0]);
    const url = 'http://127.0.0.1:' + server.address().port + '/index.html?full=1&rymock=L2#pipePlanSection';
    const tab = await requestJson(cdpPort, 'PUT', '/json/new?' + encodeURIComponent(url));
    ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
    let seq = 0; const pending = new Map();
    ws.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.method === 'Page.javascriptDialogOpening') {
        ws.send(JSON.stringify({ id: ++seq, method: 'Page.handleJavaScriptDialog', params: { accept: true } }));
      }
      if (!pending.has(message.id)) return;
      const item = pending.get(message.id); pending.delete(message.id); clearTimeout(item.timer);
      message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result);
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++seq; const item = { resolve, reject, timer: null }; pending.set(id, item);
      ws.send(JSON.stringify({ id, method, params }));
      item.timer = setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(method + ' timed out')); } }, 30000);
    });
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    await send('Runtime.enable'); await send('Page.enable');
    for (let i = 0; i < 80; i++) {
      if (await evaluate("!!window.ppLoadPolygon && !!window.tlAutoGenerate && !!window.RyDrawingWorkspace")) break;
      await sleep(250);
    }
    const setup = await evaluate(`(function(){
      window.measuredPolygon=[{x:0,y:0},{x:300,y:0},{x:300,y:170},{x:0,y:170}];
      window.measuredArea=51000;
      window.ppLoadPolygon();
      window.tlAutoGenerate({scroll:false});
      return {generated:!!window.tlDiagramData, poly:window.tlDiagramData&&window.tlDiagramData.poly};
    })()`);
    assert.ok(setup.generated, JSON.stringify(setup));
    const regeneration = await evaluate(`(function(){
      window.measuredPolygon=[{x:0,y:0},{x:527,y:0},{x:527,y:320},{x:500,y:320},{x:500,y:396},{x:0,y:396}];
      window.measuredArea=527*396-27*76; window.ppLoadPolygon();
      document.getElementById('planTapeLaySide').value='80';
      document.getElementById('planZoneMuManual').value='30';
      const angle=document.getElementById('ppZoneAngleInput'); angle.value='3.7';
      angle.dispatchEvent(new Event('input',{bubbles:true}));
      const before=window.tlDiagramData;
      document.getElementById('ppGenerate').click();
      const d=window.tlDiagramData;
      return {fresh:d!==before,main:d&&d.mainPipes&&d.mainPipes.length,branch:d&&d.branchPipes&&d.branchPipes.length,tape:d&&d.dripTapes&&d.dripTapes.length,shadow:window.__runyeDrawingDesignShadow};
    })()`);
    assert.ok(regeneration.fresh && regeneration.main && regeneration.branch && regeneration.tape, JSON.stringify(regeneration));
    await sleep(300);
    const visible = await evaluate(`(function(){const e=document.getElementById('tlWsContent');return {visibility:getComputedStyle(e).visibility,pipes:e.querySelectorAll('[data-tlpipe^="main-"]').length,tapes:e.querySelectorAll('[data-tltape]').length};})()`);
    assert.ok(visible.visibility==='visible' && visible.pipes && visible.tapes, JSON.stringify(visible));
    assert.equal(await evaluate(`(function(){
      const tab=document.getElementById('tlWsLayerDrawerTab');
      if(!tab)return false;
      tab.click();
      const panel=document.getElementById('tlWsLayerPanel');
      return !!panel&&!panel.hidden;
    })()`), true, 'The layer drawer must open before its viewport position is measured');
    const sample = `new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
      window.RyDrawingWorkspace.syncCamera();
      const layer=document.getElementById('tlWsContent'),svg=layer.querySelector('svg.tl-ws-svg');
      const wrap=document.getElementById('ppCanvasWrap'),canvas=document.getElementById('ppCanvas');
      const rect=wrap.getBoundingClientRect(),ctm=svg.getScreenCTM();
      const world=window.RyTlWs.getWorldTransform();
      const errors=window.tlDiagramData.poly.map(p=>{
        const q=window.ppMapToCanvas(p.x,p.y);
        const worldPt={x:(p.x+world.ox)*world.k,y:(p.y+world.oy)*world.k};
        const svgPt={x:ctm.a*worldPt.x+ctm.c*worldPt.y+ctm.e,y:ctm.b*worldPt.x+ctm.d*worldPt.y+ctm.f};
        const canvasPt={x:rect.left+q.x*rect.width/canvas.width,y:rect.top+q.y*rect.height/canvas.height};
        return Math.hypot(svgPt.x-canvasPt.x,svgPt.y-canvasPt.y);
      });
      const panel=document.getElementById('tlWsLayerPanel');
      resolve({errors,zoom:window.ppGetView().zoom,pan:window.ppGetView(),
        canvasNode:canvas.parentElement.id,svgNode:svg.parentElement.id,
        visible:getComputedStyle(layer).visibility,transform:layer.style.transform,
        rects:{wrap:rect.toJSON(),layer:layer.getBoundingClientRect().toJSON(),
          panel:panel&&panel.getBoundingClientRect().toJSON()}});
    })))`;
    const before = await evaluate(sample);
    assert.equal(before.visible, 'visible', JSON.stringify(before));
    assert.ok(Math.max(...before.errors) < 3, JSON.stringify(before));
    assert.equal(await evaluate('window.RyDrawingWorkspace.zoomBy(1.25)'), true);
    const zoomed = await evaluate(sample);
    assert.ok(Math.max(...zoomed.errors) < 3, JSON.stringify(zoomed));
    assert.ok(zoomed.zoom > before.zoom, JSON.stringify({ before, zoomed }));
    assert.equal(await evaluate('window.RyDrawingWorkspace.panBy(43,-27)'), true);
    const panned = await evaluate(sample);
    assert.ok(Math.max(...panned.errors) < 3, JSON.stringify(panned));
    assert.notDeepEqual(panned.pan, zoomed.pan);
    assert.ok(panned.rects.panel.right <= panned.rects.wrap.right &&
      panned.rects.panel.right >= panned.rects.wrap.right - 28,
    'The layer panel must stay at the stable viewport right edge: ' + JSON.stringify(panned.rects));
    assert.ok(panned.rects.panel.top >= panned.rects.wrap.top &&
      panned.rects.panel.top <= panned.rects.wrap.top + 25,
    'The layer panel must stay at the stable viewport top edge: ' + JSON.stringify(panned.rects));
    if (process.env.RY_SHARED_CANVAS_SHOT) {
      const screenshotPath = path.resolve(process.env.RY_SHARED_CANVAS_SHOT);
      assert.ok(screenshotPath.startsWith(root + path.sep), 'Screenshot must stay inside the workspace');
      const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
    }
    const handoff = await evaluate(`(function(){
      const ring=[[18.2,109.5],[18.2,109.502],[18.2008,109.502],
        [18.2008,109.5019],[18.201,109.5019],[18.201,109.5]];
      const plot={id:'browser-map-plot',name:'Browser map plot',polyLatLng:ring,
        sqm:23500,mu:35.25,source:'map',ts:100,
        partitionPlan:{version:1,angle:-2,cutSnap:{sig:'',x:null,y:null},
          cutOverrides:{x:{},y:{}},params:{planZoneMuManual:'25',planN:'3'}}};
      localStorage.setItem('runye_plot_library',JSON.stringify([plot]));
      const libraryBefore=localStorage.getItem('runye_plot_library');
      const id=window.RyMeasuredAreaBridgeStore.write({ryPlotRef:{id:plot.id,
        geometryKey:JSON.stringify([ring]),areaM2:plot.sqm}});
      const priorSave=window.runyeSaveCurrentPlotBeforeSwitch,priorPlot=window.currentPlotId;
      window.currentPlotId='old-unsaved-plot';
      window.runyeSaveCurrentPlotBeforeSwitch=function(){
        const error=new Error('canonical validation rejected');
        error.beforeSwitchSaveFailed=true;error.saveReason='verify-failed';error.storageFull=false;
        throw error;
      };
      const priorAlert=window.alert;let blockedMessage='';
      window.alert=function(message){blockedMessage=String(message);};
      const rejected=window.runyeApplyMapPayload(id);
      window.alert=priorAlert;
      const preserved=window.RyMeasuredAreaBridgeStore.readRaw(id)!==null;
      const oldPlotUnchanged=window.currentPlotId==='old-unsaved-plot';
      window.runyeSaveCurrentPlotBeforeSwitch=priorSave;
      window.currentPlotId=priorPlot;
      const applied=window.runyeApplyMapPayload(id);
      return {rejected,preserved,oldPlotUnchanged,blockedMessage,applied,id,plotId:window.currentPlotId,area:window.measuredArea,
        poly:window.measuredPolygon,libraryUnchanged:localStorage.getItem('runye_plot_library')===libraryBefore,
        consumed:window.RyMeasuredAreaBridgeStore.readRaw(id)===null,
        host:!!document.getElementById('ryDrawingHost')?.contains(document.getElementById('ppCanvasWrap'))};
    })()`);
    assert.equal(handoff.rejected, false, JSON.stringify(handoff));
    assert.ok(handoff.preserved && handoff.oldPlotUnchanged, JSON.stringify(handoff));
    assert.match(handoff.blockedMessage, /当前设计仍保留在画面中/, JSON.stringify(handoff));
    assert.doesNotMatch(handoff.blockedMessage, /刷新页面/, JSON.stringify(handoff));
    assert.equal(handoff.applied, true, JSON.stringify(handoff));
    assert.equal(handoff.plotId, 'browser-map-plot', JSON.stringify(handoff));
    assert.equal(handoff.area, 23500, JSON.stringify(handoff));
    assert.equal(handoff.poly.length, 6, JSON.stringify(handoff));
    const invalidTarget = await evaluate(`(function(){
      const oldId=window.currentPlotId,oldDiagram=window.tlDiagramData;
      const bad={id:'browser-invalid-plot',name:'Invalid boundary',sqm:1200,mu:1.8,
        poly:[{x:0,y:0},{x:10,y:0}],source:'area',ts:101};
      const library=JSON.parse(localStorage.getItem('runye_plot_library'));
      library.push(bad);localStorage.setItem('runye_plot_library',JSON.stringify(library));
      const previousReset=window.runyeResetPlotScopedNetworkState;
      let resets=0;
      window.runyeResetPlotScopedNetworkState=function(){resets++;return previousReset();};
      window.runyeRenderPlotLib();
      const button=document.querySelector('#ppPlotWorkflowList [data-edit-id="browser-invalid-plot"]');
      if(!button)throw new Error('invalid target plot button missing');
      button.click();
      window.runyeResetPlotScopedNetworkState=previousReset;
      return {resets,plotId:window.currentPlotId,oldId,diagramPreserved:window.tlDiagramData===oldDiagram};
    })()`);
    assert.deepEqual(invalidTarget,
      { resets: 0, plotId: handoff.plotId, oldId: handoff.plotId, diagramPreserved: true },
      JSON.stringify(invalidTarget));
    const validSwitch = await evaluate(`(function(){
      const messages=[],oldAlert=window.alert;window.alert=m=>messages.push(String(m));
      const next={id:'browser-next-plot',name:'Next boundary',sqm:12000,mu:18,
        poly:[{x:0,y:0},{x:150,y:0},{x:150,y:80},{x:0,y:80}],source:'area',ts:102};
      const library=JSON.parse(localStorage.getItem('runye_plot_library'));
      library.push(next);localStorage.setItem('runye_plot_library',JSON.stringify(library));
      window.runyeRenderPlotLib();
      document.querySelector('#ppPlotWorkflowList [data-edit-id="browser-next-plot"]').click();
      const first={id:window.currentPlotId,poly:window.measuredPolygon,diagram:window.tlDiagramData};
      document.querySelector('#ppPlotWorkflowList [data-edit-id="browser-map-plot"]').click();
      window.alert=oldAlert;
      return {first,returnId:window.currentPlotId,returnPoly:window.measuredPolygon,messages};
    })()`);
    assert.equal(validSwitch.first.id, 'browser-next-plot', JSON.stringify(validSwitch));
    assert.equal(validSwitch.first.poly.length, 4, JSON.stringify(validSwitch));
    assert.equal(validSwitch.first.diagram, null, JSON.stringify(validSwitch));
    assert.equal(validSwitch.returnId, handoff.plotId, JSON.stringify(validSwitch));
    assert.equal(validSwitch.returnPoly.length, 6, JSON.stringify(validSwitch));
    assert.equal(validSwitch.messages.length, 0, JSON.stringify(validSwitch));
    assert.ok(handoff.libraryUnchanged && handoff.consumed && handoff.host, JSON.stringify(handoff));
    assert.equal(await evaluate(`window.runyeSaveProject(true)`), true, 'Map plot must save before reload');
    await send('Page.reload', { ignoreCache: true });
    for (let i = 0; i < 80; i++) {
      if (await evaluate("!!window.ppLoadPolygon && !!window.tlAutoGenerate && !!window.RyPlotPartitionEditor")) break;
      await sleep(250);
    }
    assert.equal(await evaluate(`window.runyeLoadProject({silent:true})`), true, 'Saved map plot must restore');
    const mapAngleReturn = await evaluate(`(function(){
      const messages=[],oldAlert=window.alert;window.alert=m=>messages.push(String(m));
      const state=window.RunyeBridge.getPartitionState();
      const restored=window.RyMapPartition.restore({version:1,angle:-2,
        cutSnap:state.cutSnap,cutOverrides:state.cutOverrides,
        params:{planZoneMuManual:'25',planN:'3'}});
      const before=window.tlDiagramData;
      document.getElementById('ppGenerate').click();window.alert=oldAlert;
      const d=window.tlDiagramData;
      return {restored,fresh:d!==before,main:d&&d.mainPipes&&d.mainPipes.length,
        branch:d&&d.branchPipes&&d.branchPipes.length,messages,
        shadow:window.__runyeSingleDrawingDesignShadow};
    })()`);
    assert.ok(mapAngleReturn.restored && mapAngleReturn.fresh && mapAngleReturn.main &&
      mapAngleReturn.branch && !mapAngleReturn.messages.length, JSON.stringify(mapAngleReturn));
    const rotatedHandoff = await evaluate(`(function(){
      const messages=[];const oldAlert=window.alert;window.alert=m=>messages.push(String(m));
      document.getElementById('ppGenerate').click();
      const initial=window.tlDiagramData&&window.tlDiagramData.mainPipes.length;
      const angle=document.getElementById('ppZoneAngleInput');angle.value='3.7';
      angle.dispatchEvent(new Event('input',{bubbles:true}));
      angle.dispatchEvent(new Event('change',{bubbles:true}));
      const before=window.tlDiagramData;document.getElementById('ppGenerate').click();
      window.alert=oldAlert;const d=window.tlDiagramData;
      return {initial,fresh:d!==before,main:d&&d.mainPipes&&d.mainPipes.length,branch:d&&d.branchPipes&&d.branchPipes.length,tape:d&&d.dripTapes&&d.dripTapes.length,messages,shadow:window.__runyeDrawingDesignShadow,commitFailure:window.__runyeSingleL2CommitFailure};
    })()`);
    assert.ok(rotatedHandoff.initial && rotatedHandoff.fresh && rotatedHandoff.main && rotatedHandoff.branch && rotatedHandoff.tape, JSON.stringify(rotatedHandoff));
    await sleep(300);
    assert.equal(await evaluate(`getComputedStyle(document.getElementById('tlWsContent')).visibility`), 'visible');
    const rejectedGeneration = await evaluate(`(function(){
      const messages=[];const oldAlert=window.alert,oldCommit=window.ryCommitSingleLevel3CanonicalFromRuntime;
      window.alert=m=>messages.push(String(m));
      window.ryCommitSingleLevel3CanonicalFromRuntime=()=>false;
      try{document.getElementById('ppGenerate').click();}
      finally{window.alert=oldAlert;window.ryCommitSingleLevel3CanonicalFromRuntime=oldCommit;}
      const layer=document.getElementById('tlWsContent');
      return {messages,main:window.tlDiagramData&&window.tlDiagramData.mainPipes&&window.tlDiagramData.mainPipes.length,
        visible:getComputedStyle(layer).visibility,drawn:layer.querySelectorAll('[data-tlpipe^="main-"]').length};
    })()`);
    assert.ok(rejectedGeneration.main && rejectedGeneration.visible==='visible' && rejectedGeneration.drawn &&
      rejectedGeneration.messages.some(m=>m.includes('生成施工图失败')), JSON.stringify(rejectedGeneration));
    console.log('shared canvas: generated overlay, zoom, and pan align within 3px; maximum errors',
      [before, zoomed, panned].map(x => Math.max(...x.errors).toFixed(2)).join(', '));
    console.log('viewport and layer bounds', JSON.stringify(panned.rects));
    console.log('map handoff: stable plot reference reaches the same drawing host and preserves the library');
  } finally {
    if (ws) ws.close();
    browser.kill();
    if (browser.exitCode === null) await new Promise(resolve => browser.once('exit', resolve));
    await new Promise(resolve => server.close(resolve));
    if (!path.resolve(profile).startsWith(root + path.sep)) throw new Error('Unsafe profile cleanup path');
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
