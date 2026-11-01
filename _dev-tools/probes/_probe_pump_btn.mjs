'use strict';
/* 扬程按钮三态文案探针（v619）：#
   1) 未应用（有改径/无改径）→ 「更新扬程」
   2) 已应用但当前无图面改径 → 「恢复扬程」（原「恢复设计扬程」，用户 v619 要求缩短）
   3) 已应用且有改径 → 「重新校核」
   顺带量：按钮宽度、说明行高、是否仍满足 2 行门槛（窄面板 SIDEW 可钉）。
   用法：node _probe_pump_btn.mjs        （SIDEW=217 钉侧栏宽度）
   退出码：0=全过，1=有断言红。 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { spawn } = require('child_process');
const http = require('http'); const fs = require('fs'); const path = require('path');
const WS = globalThis.WebSocket;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = process.env.RY_ROOT || 'C:/Users/AHS/runye-irrigation';
const VW = 1600, VH = 1000;
const PORT = 49620 + Math.floor(Math.random() * 40), CDP = 49940 + Math.floor(Math.random() * 40);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const srv = http.createServer((req, r2) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const fp = path.join(ROOT, p.replace(/^\//, ''));
  if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r2.writeHead(404); r2.end('nf'); return; }
  r2.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(fp).pipe(r2);
});
await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox',
  '--remote-debugging-port=' + CDP, '--user-data-dir=C:\\tmp\\cdp_pbtn_' + Date.now(),
  '--window-size=' + VW + ',' + VH], { stdio: 'ignore' });
const hreq = (m, p) => new Promise((res, rej) => { const q = http.request({ host: '127.0.0.1', port: CDP, path: p, method: m }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); }); q.on('error', rej); q.end(); });
for (let i = 0; i < 60; i++) { try { await hreq('GET', '/json/version'); break; } catch (e) { await sleep(300); } }
let idc = 1, ws; const pend = {};
const send = (m, p = {}) => new Promise((res, rej) => { const id = idc++; pend[id] = { res, rej }; ws.send(JSON.stringify({ id, method: m, params: p })); setTimeout(() => { if (pend[id]) { delete pend[id]; rej(new Error('timeout ' + m)); } }, 60000); });
const t = JSON.parse(await hreq('PUT', '/json/new?' + encodeURIComponent('http://127.0.0.1:' + PORT + '/index.html')));
ws = new WS(t.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
ws.addEventListener('message', e => {
  const o = JSON.parse(e.data);
  if (o.id && pend[o.id]) { const { res, rej } = pend[o.id]; delete pend[o.id]; o.error ? rej(new Error(o.error.message)) : res(o.result); return; }
  if (o.method === 'Page.javascriptDialogOpening') ws.send(JSON.stringify({ id: idc++, method: 'Page.handleJavaScriptDialog', params: { accept: true } }));
});
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
await send('Page.reload', { ignoreCache: true });
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return { __err: String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text).slice(0, 300) }; return r.result.value; };
const HIDE = "(function(){document.querySelectorAll('.ry-ann-mask').forEach(function(e){e.style.setProperty('display','none','important');});try{window.RyAnnounce&&window.RyAnnounce.close&&window.RyAnnounce.close();}catch(e){}return 1;})()";
for (let i = 0; i < 80; i++) { if (await ev('!!window.tlAutoGenerate && !!window.tlPumpUpdateRun') === true) break; await sleep(400); }
await ev(HIDE);
await ev("(function(){try{window.rySetTab('tlPipePlanSection','pipe');}catch(e){return 'err '+e.message;}return 1;})()");
await sleep(1200);
await ev("(function(){window.measuredPolygon=[{x:0,y:0},{x:60,y:0},{x:60,y:40},{x:0,y:40}];window.measuredArea=2400;try{window.tlAutoGenerate();}catch(e){return 'err '+e.message;}return 1;})()");
await sleep(2600);
await ev(HIDE);
/* 侧栏/结果栏默认是收起态（量到一片 0）⇒ 强制展开，与真实使用一致 */
await ev("(function(){var c=document.getElementById('ryCadSide');if(c)c.setAttribute('data-ry-open','1');var g=document.getElementById('ryCadGrpTl');if(g)g.open=true;var b=document.getElementById('tlPlanBar2');if(b)b.classList.remove('pp-res-off');return 1;})()");
for (let i = 0; i < 4; i++) {
  const w = await ev("(function(){var s=document.getElementById('tlSide');return s?Math.round(s.getBoundingClientRect().width):0;})()");
  if (w > 100) { console.log('侧栏宽度:', w); break; }
  await ev("(function(){var c=document.getElementById('ryCadSide');if(c)c.setAttribute('data-ry-open','1');return 1;})()");
  await sleep(500);
}
if (process.env.SIDEW) {
  console.log('钉侧栏:', await ev("(function(){var s=document.querySelector('#tlPipePlanSection .pp-side')||document.querySelector('.pp-side');if(s){s.style.setProperty('width','" + process.env.SIDEW + "px','important');}return 1;})()"));
  await sleep(400);
}

const dump = `JSON.stringify((function(){
  var b=document.getElementById('tlPumpUpdateBtn'), n=document.getElementById('tlPumpUpdateNote');
  if(!b) return {none:1};
  var rb=b.getBoundingClientRect(), rn=n?n.getBoundingClientRect():null;
  var lh=parseFloat(getComputedStyle(n||b).lineHeight)||15;
  return { txt:b.textContent.trim(), dis:b.disabled, op:getComputedStyle(b).opacity,
           btnW:Math.round(rb.width), noteW:rn?Math.round(rn.width):null,
           noteH:rn?Math.round(rn.height):null, noteLines:rn?Math.round(rn.height/lh):null,
           note:n?n.textContent.trim():null, st:window.tlPumpOverrideStat?window.tlPumpOverrideStat():null };
})())`;
const readD = async () => { const s = await ev(dump); try { return typeof s === 'string' ? JSON.parse(s) : s; } catch (e) { return { err: String(s) }; } };

let ok = true;
const chk = (name, cond, extra) => { console.log((cond ? '✓ ' : '✗ ') + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); if (!cond) ok = false; };

/* 状态 B：已应用覆盖，但图面没有改径 ⇒ 「恢复扬程」 */
console.log('\n── B 已应用 + 无图面改径 ──');
await ev(`(function(){try{
  var AE=window.RyTlAutoEdits, d=window.tlDiagramData;
  if(AE&&AE.clearHidden){} 
  window.tlManualCals={front:null,main:90,branch:null};
  if(typeof window.tlBuildPipeOverride==='function') window.tlBuildPipeOverride();
  if(typeof window.tlPumpUpdateNote==='function') window.tlPumpUpdateNote(); else { var f=null; }
  return 1;}catch(e){return 'err '+e.message;}})()`);
await ev("(function(){try{ var f=window.tlPumpUpdateNote; if(f) f(); return 1;}catch(e){return 'err '+e.message;}})()");
await sleep(500);
const B = await readD();
console.log('  状态:', JSON.stringify(B));
chk('B1 按钮文案 = 恢复扬程', B.txt === '恢复扬程', B.txt);
chk('B2 说明为「当前为设计管径，改径后重算」（v622 去掉句末句号）', B.note === '当前为设计管径，改径后重算', B.note);
chk('B3 说明未超 2 行', B.noteLines != null && B.noteLines <= 2, B.noteLines);
if (process.env.SHOTB) {
  const s2 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(process.env.SHOTB, Buffer.from(s2.data, 'base64'));
  console.log('截图(恢复扬程态):', process.env.SHOTB);
}

/* 状态 C：已应用 + 有图面改径 ⇒ 「重新校核」 */
console.log('\n── C 已应用 + 有图面改径 ──');
await ev(`(function(){try{
  var AE=window.RyTlAutoEdits, d=window.tlDiagramData;
  var ps=(AE&&AE.allPids)?AE.allPids(d)||[]:[];
  var pid=null; for(var i=0;i<ps.length;i++){ if(/^branch-/.test(ps[i])){pid=ps[i];break;} }
  if(pid) AE.setCaliber(pid, 90, d, 'probe');
  window.tlManualCals={front:null,main:90,branch:null};
  if(typeof window.tlBuildPipeOverride==='function') window.tlBuildPipeOverride();
  if(window.tlPumpUpdateNote) window.tlPumpUpdateNote();
  return pid||'none';}catch(e){return 'err '+e.message;}})()`);
await sleep(500);
const C = await readD();
console.log('  状态:', JSON.stringify(C));
chk('C1 按钮文案 = 重新校核', C.txt === '重新校核', C.txt);

/* 状态 A：未应用 ⇒ 「更新扬程」 */
console.log('\n── A 未应用 ──');
await ev(`(function(){try{
  var AE=window.RyTlAutoEdits, d=window.tlDiagramData;
  var ps=(AE&&AE.allPids)?AE.allPids(d)||[]:[]; var ids=Object.keys(AE.calibersMap());
  ids.forEach(function(k){ AE.clearCaliber(k,'probe'); });
  window.tlManualCals={front:null,main:null,branch:null};
  window.tlPipeOdOverride=null;
  if(window.tlPumpUpdateNote) window.tlPumpUpdateNote();
  return 1;}catch(e){return 'err '+e.message;}})()`);
await sleep(500);
const A = await readD();
console.log('  状态:', JSON.stringify(A));
chk('A1 按钮文案 = 更新扬程', A.txt === '更新扬程', A.txt);
chk('A2 三态文案都不含「设计扬程」', ['更新扬程', '恢复扬程', '重新校核'].indexOf(B.txt) >= 0 && B.txt.indexOf('设计') < 0, B.txt);

if (process.env.SHOT) {
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(process.env.SHOT, Buffer.from(shot.data, 'base64'));
  console.log('截图:', process.env.SHOT);
}
try { child.kill(); } catch (e) { }
srv.close();
console.log(ok ? '\n== 扬程按钮三态探针：全部通过 ==' : '\n== 扬程按钮三态探针：有断言失败 ==');
process.exit(ok ? 0 : 1);
