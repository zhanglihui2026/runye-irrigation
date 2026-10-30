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
      panned.rects.panel.right >= panned.rects.wrap.right - 25,
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
      const ring=[[18.2,109.5],[18.2,109.502],[18.201,109.502],[18.201,109.5]];
      const plot={id:'browser-map-plot',name:'Browser map plot',polyLatLng:ring,
        sqm:23500,mu:35.25,source:'map',ts:100};
      localStorage.setItem('runye_plot_library',JSON.stringify([plot]));
      const libraryBefore=localStorage.getItem('runye_plot_library');
      const id=window.RyMeasuredAreaBridgeStore.write({ryPlotRef:{id:plot.id,
        geometryKey:JSON.stringify([ring]),areaM2:plot.sqm}});
      const applied=window.runyeApplyMapPayload(id);
      return {applied,id,plotId:window.currentPlotId,area:window.measuredArea,
        poly:window.measuredPolygon,libraryUnchanged:localStorage.getItem('runye_plot_library')===libraryBefore,
        consumed:window.RyMeasuredAreaBridgeStore.readRaw(id)===null,
        host:!!document.getElementById('ryDrawingHost')?.contains(document.getElementById('ppCanvasWrap'))};
    })()`);
    assert.equal(handoff.applied, true, JSON.stringify(handoff));
    assert.equal(handoff.plotId, 'browser-map-plot', JSON.stringify(handoff));
    assert.equal(handoff.area, 23500, JSON.stringify(handoff));
    assert.equal(handoff.poly.length, 4, JSON.stringify(handoff));
    assert.ok(handoff.libraryUnchanged && handoff.consumed && handoff.host, JSON.stringify(handoff));
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
