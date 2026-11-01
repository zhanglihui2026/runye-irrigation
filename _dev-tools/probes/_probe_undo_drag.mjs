'use strict';
/* 撤销探针：真鼠标拖动「总管三通/阀门组」→ 按 Ctrl+Z → 位置必须回到拖动前。
   验证 v619 的两处修复：
     ① runye-undo.js 抬手补拍「操作后」快照（原来拖动根本不入栈）；
     ② mod/inline-12.js 把 tlFrontNodeDrops_v1 等「位置层」纳入快照 + 恢复后重绘工作区。
   用法：node _probe_undo_drag.mjs        （SHOT=…png 可选，落一张结束时的整页图）
   退出码：0=全过，1=有断言红。 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { spawn } = require('child_process');
const http = require('http'); const fs = require('fs'); const path = require('path');
const WS = globalThis.WebSocket;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = process.env.RY_ROOT || 'C:/Users/AHS/runye-irrigation';
const VW = 1600, VH = 1000;
const PORT = 49280 + Math.floor(Math.random() * 40), CDP = 49580 + Math.floor(Math.random() * 40);
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
  '--remote-debugging-port=' + CDP, '--user-data-dir=C:\\tmp\\cdp_undo_' + Date.now(),
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
const ev = async x => {
  const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { __err: String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text).slice(0, 300) };
  return r.result.value;
};
const HIDE = "(function(){document.querySelectorAll('.ry-ann-mask').forEach(function(e){e.style.setProperty('display','none','important');});try{window.RyAnnounce&&window.RyAnnounce.close&&window.RyAnnounce.close();}catch(e){}return 1;})()";
for (let i = 0; i < 80; i++) { if (await ev('!!window.tlAutoGenerate && !!window.RyUndo') === true) break; await sleep(400); }
await ev(HIDE);
/* 进三级页并生成简图（与真实使用一致） */
console.log('切三级:', await ev("(function(){try{window.rySetTab('tlPipePlanSection','pipe');}catch(e){return 'err '+e.message;}return 1;})()"));
await sleep(1200);
console.log('生成简图:', await ev("(function(){window.measuredPolygon=[{x:0,y:0},{x:60,y:0},{x:60,y:40},{x:0,y:40}];window.measuredArea=2400;try{window.tlAutoGenerate();}catch(e){return 'err '+e.message;}return 1;})()"));
await sleep(2500);
await ev(HIDE);

const RES = "JSON.stringify((function(){try{return {drops:localStorage.getItem('tlFrontNodeDrops_v1'),src:localStorage.getItem('tlSourceMove_v1'),pos:localStorage.getItem('tl-plot-pos'),undo:window.RyUndo?window.RyUndo.debug():null};}catch(e){return {err:String(e&&e.message)};}})())";
const read = async () => { const s = await ev(RES); try { return typeof s === 'string' ? JSON.parse(s) : s; } catch (e) { return { err: String(s) }; } };

/* 找一个「可拖动」的三通命中圈，并取它的屏幕坐标 */
const pick = await ev(`JSON.stringify((function(){
  var els=[].slice.call(document.querySelectorAll('[data-junction-front][data-junction-key]'));
  for(var i=0;i<els.length;i++){
    var el=els[i], max=parseFloat(el.getAttribute('data-junction-max'))||0;
    if(max<=0) continue;
    var r=el.getBoundingClientRect();
    if(r.width<1) continue;
    return {x:r.x+r.width/2,y:r.y+r.height/2,key:el.getAttribute('data-junction-key'),max:max,axis:el.getAttribute('data-junction-axis')};
  }
  return {none:true,total:els.length};
})())`);
let tg = null; try { tg = typeof pick === 'string' ? JSON.parse(pick) : pick; } catch (e) { tg = { parse: 'fail', raw: String(pick).slice(0, 120) }; }
console.log('目标三通:', JSON.stringify(tg));

const before = await read();
console.log('拖动前:', JSON.stringify(before));
await ev('window.RyUndo.traceClear&&window.RyUndo.traceClear(),1');

let ok = true;
const chk = (name, cond, extra) => { console.log((cond ? '✓ ' : '✗ ') + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); if (!cond) ok = false; };

if (tg && !tg.none && isFinite(tg.x)) {
  /* 真鼠标拖动：按下 → 分步移动 → 松开（工作区走 pointerdown/pointermove/pointerup + mousedown/mousemove/mouseup） */
  const dx = 0, dy = tg.axis === 'H' ? 0 : 0;   // 三通只沿轴向动，垂直方向给一点也会被限位收住
  const mx = tg.x + (tg.axis === 'H' ? 24 : 0), my = tg.y + (tg.axis === 'H' ? 0 : 24);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: tg.x, y: tg.y, button: 'left', clickCount: 1, modifiers: 0, pointerType: 'mouse' });
  for (const k of [0.25, 0.5, 0.75, 1]) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: tg.x + (mx - tg.x) * k, y: tg.y + (my - tg.y) * k, button: 'left', buttons: 1, modifiers: 0, pointerType: 'mouse' });
    await sleep(40);
  }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mx, y: my, button: 'left', clickCount: 1, modifiers: 0, pointerType: 'mouse' });
  await sleep(600);
  const afterDrag = await read();
  console.log('拖动后:', JSON.stringify(afterDrag));
  console.log('入栈追踪:', JSON.stringify(await ev('window.RyUndo.trace?window.RyUndo.trace(20):null')));
  chk('拖动改变了位置状态（tlFrontNodeDrops_v1 有值）', !!afterDrag.drops, afterDrag.drops);
  chk('拖动本身入栈（栈深 +1）', (afterDrag.undo && before.undo && afterDrag.undo.top === before.undo.top + 1), { pre: before.undo, post: afterDrag.undo });

  /* Ctrl+Z */
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', modifiers: 2, key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 2, key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90 });
  await sleep(900);
  const afterUndo = await read();
  console.log('撤销后:', JSON.stringify(afterUndo));
  chk('第一次 Ctrl+Z 就把位置退回去了（drops 回到拖动前）', String(afterUndo.drops) === String(before.drops), { before: before.drops, after: afterUndo.drops });
  chk('撤销后栈深减 1', (afterUndo.undo && afterDrag.undo && afterUndo.undo.top === afterDrag.undo.top - 1), { drag: afterDrag.undo, undo: afterUndo.undo });
} else {
  chk('找到可拖动的三通命中圈', false, tg);
}

if (process.env.SHOT) {
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(process.env.SHOT, Buffer.from(shot.data, 'base64'));
  console.log('截图:', process.env.SHOT);
}
try { child.kill(); } catch (e) { }
srv.close();
console.log(ok ? '\n== 撤销拖动探针：全部通过 ==' : '\n== 撤销拖动探针：有断言失败 ==');
process.exit(ok ? 0 : 1);
