'use strict';

// Isolated Edge check for the group member source of truth after clear and undo.
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
  const port = server.address().port;
  const profile = fs.mkdtempSync(path.join(root, '.group-undo-'));
  const browser = spawn(edge, ['--headless=new', '--disable-gpu', '--no-first-run',
    '--no-default-browser-check', '--no-proxy-server', '--remote-debugging-port=0',
    '--user-data-dir=' + profile, '--window-size=1500,950'], { stdio: 'ignore' });
  let ws;
  try {
    const activePortFile = path.join(profile, 'DevToolsActivePort');
    for (let i = 0; i < 80 && !fs.existsSync(activePortFile); i++) await sleep(250);
    assert.ok(fs.existsSync(activePortFile), 'Edge debugging port did not open');
    const cdpPort = Number(fs.readFileSync(activePortFile, 'utf8').split(/\r?\n/)[0]);
    const url = 'http://127.0.0.1:' + port + '/index.html?full=1&rymock=L2#pipePlanSection';
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
      if (await evaluate("!!window.grRestoreState && !!window.RunyeBridge && !!document.getElementById('ppUndo')")) break;
      await sleep(250);
    }
    const result = await evaluate(`(function(){
      const a=[{x:0,y:0},{x:100,y:0},{x:100,y:80},{x:0,y:80}];
      const b=a.map(p=>({x:p.x+120,y:p.y}));
      const frame=[{x:0,y:0},{x:220,y:0},{x:220,y:80},{x:0,y:80}];
      const slot=(ring,x)=>({polyPts:ring,mainPipes:[[{x:x,y:20},{x:x+50,y:20}]],
        branchPipes:[],subBranchPipes:[],source:null,valves:[],
        pipeIds:{main:['m1'],branch:[],subbranch:[]},hiddenPipes:{main:{},branch:{},subbranch:{}},
        nextPipeId:2,partitionCuts:{x:[],y:[]},cutSnap:null,cutOverrides:{x:{},y:{}},
        areaLocked:false,zoneAngleDeg:0,zoneAuto:true});
      const saved={version:1,frame,subPlots:[{id:'plot-a',poly:a},{id:'plot-b',poly:b}],
        blocks:[{id:'plot-a',ring:a,tlData:null,tlState:null},{id:'plot-b',ring:b,tlData:null,tlState:null}],
        trunk:{lines:[],dn:50},edit:{mode:'whole',current:0,framePts:frame,
          slots:[slot(a,10),slot(b,130)],trunkPipes:[],trunkDn:50}};
      const restored=window.grRestoreState(saved);
      const before=window.grExportState();
      const initialMode=window.__runyeGroupEdit.mode;
      const work=window.__runyeGroupWork,groupId=work.canonicalGroupId;
      work.canonicalGroupId='invalid-group-binding';
      const rejectedClear=window.RunyeBridge.clearPipesWhole();
      const rejectedAuto=window.RunyeBridge.autoPipesWhole();
      work.canonicalGroupId=groupId;
      const afterRejected=window.grExportState();
      const clearResult=window.RunyeBridge.clearPipesWhole();
      const cleared=window.grExportState();
      document.getElementById('ppUndo').click();
      const undone=window.grExportState();
      const restoredAgain=undone&&window.grRestoreState(undone);
      const roundTrip=window.grExportState();
      const perPlot=roundTrip&&JSON.parse(JSON.stringify(roundTrip));
      if(perPlot){perPlot.edit.mode='perPlot';perPlot.edit.current=1;}
      const restoredPerPlot=perPlot&&window.grRestoreState(perPlot);
      const revisionBeforeExport=window.__runyeGroupWork.canonicalDesign.revision;
      const perPlotExport=window.grExportState();
      const revisionAfterExport=window.__runyeGroupWork.canonicalDesign.revision;
      const nextSlot=JSON.parse(JSON.stringify(window.__runyeGroupEdit.slots[1]));
      nextSlot.mainPipes.push([{x:140,y:40},{x:180,y:40}]);
      nextSlot.pipeIds.main.push('m2');nextSlot.nextPipeId=3;
      const memberCommitted=window.grCommitGroupMemberSlot(1,nextSlot);
      const afterMemberEdit=window.grExportState();
      return {restored,clearResult,rejectedClear,rejectedAuto,
        afterRejected:afterRejected&&afterRejected.edit.slots.map(s=>s.mainPipes.length),
        before:before&&before.edit.slots.map(s=>s.mainPipes.length),
        cleared:cleared&&cleared.edit.slots.map(s=>s.mainPipes.length),
        undone:undone&&undone.edit.slots.map(s=>s.mainPipes.length),
        roundTrip:roundTrip&&roundTrip.edit.slots.map(s=>s.mainPipes.length),
        initialMode,finalMode:roundTrip&&roundTrip.edit.mode,restoredAgain,restoredPerPlot,
        perPlotMode:window.__runyeGroupEdit.mode,
        perPlotPipes:perPlotExport&&perPlotExport.edit.slots.map(s=>s.mainPipes.length),
        revisionBeforeExport,revisionAfterExport,memberCommitted,
        editedPipes:afterMemberEdit&&afterMemberEdit.edit.slots.map(s=>s.mainPipes.length),
        trunkDn:roundTrip&&roundTrip.canonicalDrawingDesign.groups[0].trunkNetwork.dn,
        canonical:!!(undone&&undone.canonicalDrawingDesign&&roundTrip&&roundTrip.canonicalDrawingDesign),
        shadow:window.__runyeDrawingDesignShadow};
    })()`);
    assert.equal(result.restored, true, JSON.stringify(result));
    assert.equal(result.rejectedClear, false, JSON.stringify(result));
    assert.equal(result.rejectedAuto, false, JSON.stringify(result));
    assert.deepEqual(result.afterRejected, [1, 1], JSON.stringify(result));
    assert.equal(result.clearResult, true, JSON.stringify(result));
    assert.deepEqual(result.before, [1, 1], JSON.stringify(result));
    assert.deepEqual(result.cleared, [0, 0], JSON.stringify(result));
    assert.deepEqual(result.undone, [1, 1], JSON.stringify(result));
    assert.equal(result.restoredAgain, true, JSON.stringify(result));
    assert.deepEqual(result.roundTrip, [1, 1], JSON.stringify(result));
    assert.equal(result.initialMode, 'whole', JSON.stringify(result));
    assert.equal(result.finalMode, 'whole', JSON.stringify(result));
    assert.equal(result.restoredPerPlot, true, JSON.stringify(result));
    assert.equal(result.perPlotMode, 'perPlot', JSON.stringify(result));
    assert.deepEqual(result.perPlotPipes, [1, 1], JSON.stringify(result));
    assert.equal(result.revisionAfterExport, result.revisionBeforeExport, JSON.stringify(result));
    assert.equal(result.memberCommitted, true, JSON.stringify(result));
    assert.deepEqual(result.editedPipes, [1, 2], JSON.stringify(result));
    assert.equal(result.trunkDn, 50, JSON.stringify(result));
    assert.equal(result.canonical, true, JSON.stringify(result));
    console.log('group restore → clear → undo → restore: OK');
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
