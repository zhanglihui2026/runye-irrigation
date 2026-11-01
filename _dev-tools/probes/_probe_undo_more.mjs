'use strict';
/* 撤销覆盖面探针（v619）：把「误操作 → Ctrl+Z」清单逐条打一遍。
   两类验法，分开验两件事：
     · 真实手势（拖动水源点）—— 验「手势会不会自己入栈」；
     · 状态直改 + 显式入栈（遮蔽 / 手工节点 / 标注偏移 / 整图平移）—— 验「恢复链会不会把它写回去」。
       这几项的界面入口是右键菜单/面板按钮，双击发不全，所以只验恢复链这条更有价值的半边。
   用法：node _probe_undo_more.mjs
   退出码：0=全过，1=有断言红。 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { spawn } = require('child_process');
const http = require('http'); const fs = require('fs'); const path = require('path');
const WS = globalThis.WebSocket;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = process.env.RY_ROOT || 'C:/Users/AHS/runye-irrigation';
const VW = 1600, VH = 1000;
const PORT = 49400 + Math.floor(Math.random() * 40), CDP = 49700 + Math.floor(Math.random() * 40);
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
  '--remote-debugging-port=' + CDP, '--user-data-dir=C:\\tmp\\cdp_umore_' + Date.now(),
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
await ev("(function(){try{window.rySetTab('tlPipePlanSection','pipe');}catch(e){return 'err '+e.message;}return 1;})()");
await sleep(1200);
await ev("(function(){window.measuredPolygon=[{x:0,y:0},{x:60,y:0},{x:60,y:40},{x:0,y:40}];window.measuredArea=2400;try{window.tlAutoGenerate();}catch(e){return 'err '+e.message;}return 1;})()");
await sleep(2800);
await ev(HIDE);

/* 统一状态读数：只读「用户看得见的东西」——盘上的 + 内存里的 */
const ST = `JSON.stringify((function(){
  function rd(k){try{var s=localStorage.getItem(k);return s?JSON.parse(s):null}catch(e){return null}}
  var AE=window.RyTlAutoEdits, N=window.RyTlNodes;
  var nds=(N&&N.list)?N.list():[];
  var dims=null;
  try{ if(window._tlDimState&&window._tlDimState.offs) dims=window._tlDimState.offs; }catch(e){}
  return {
    src: rd('tlSourceMove_v1'),
    dims: dims,
    hid: (AE&&AE.hiddenMap)?Object.keys(AE.hiddenMap()).sort():null,
    cals: (AE&&AE.calibersMap)?AE.calibersMap():null,
    nodes: nds.length,
    pos: rd('tl-plot-pos'),
    undo: window.RyUndo?window.RyUndo.debug():null
  };
})())`;
const read = async () => { const s = await ev(ST); try { return typeof s === 'string' ? JSON.parse(s) : s; } catch (e) { return { err: String(s) }; } };
const un = v => JSON.stringify(v);

let ok = true;
const chk = (name, cond, extra) => { console.log((cond ? '✓ ' : '✗ ') + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); if (!cond) ok = false; };

const ctrlZ = async () => {
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', modifiers: 2, key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 2, key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90 });
  await sleep(900);
};
/* 显式入栈：模拟「这一步操作被记进历史」（手势入栈链已由水源拖动那条独立验证） */
const pushNow = async () => await ev('(function(){var s=window.RyUndo.capture();return window.RyUndo.push(s)?1:0;})()');

/* ── A 水源点拖动（真实手势） ───────────────────────────────── */
console.log('\n── A 水源点拖动（真实鼠标） ──');
{
  const g = await ev(`JSON.stringify((function(){
    var els=[].slice.call(document.querySelectorAll('#tlPipePlanSection [data-tl-src]'));
    for(var i=0;i<els.length;i++){
      var r=els[i].getBoundingClientRect();
      if(r.width>1&&r.height>1) return {x:r.x+r.width/2,y:r.y+r.height/2,w:Math.round(r.width)};
    }
    return {none:1,total:els.length};
  })())`);
  const tg = typeof g === 'string' ? JSON.parse(g) : g;
  console.log('  水源点:', un(tg));
  if (tg && !tg.none) {
    await ev('window.RyUndo.traceClear&&window.RyUndo.traceClear(),1');
    const b = await read();
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: tg.x, y: tg.y, button: 'left', clickCount: 1, modifiers: 0, pointerType: 'mouse' });
    for (const k of [0.3, 0.6, 0.85, 1]) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: tg.x + 46 * k, y: tg.y - 38 * k, button: 'left', buttons: 1, modifiers: 0, pointerType: 'mouse' });
      await sleep(45);
    }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: tg.x + 46, y: tg.y - 38, button: 'left', clickCount: 1, modifiers: 0, pointerType: 'mouse' });
    await sleep(700);
    const a = await read();
    console.log('  入栈追踪:', un(await ev('window.RyUndo.trace?window.RyUndo.trace(12):null')));
    chk('A1 拖动改变了水源位置', un(a.src) !== un(b.src), { before: b.src, after: a.src });
    chk('A2 拖动自己入了一档（不是靠显式入栈）', a.undo && b.undo && a.undo.top === b.undo.top + 1, { before: b.undo, after: a.undo });
    await ctrlZ();
    const u = await read();
    chk('A3 Ctrl+Z 水源回到拖动前', un(u.src) === un(b.src), { want: b.src, got: u.src });
  } else chk('A 找到可见水源点', false, tg);
}

/* ── B 尺寸标注线偏移（恢复链） ─────────────────────────────── */
console.log('\n── B 标注线偏移 ──');
{
  const b = await read();
  const r = await ev(`(function(){try{
    if(!window._tlDimState) return 'no-state';
    var ks=Object.keys(window._tlDimState.offs);
    window._tlDimState.offs[ks.length?ks[0]:'gplot-h']=21;
    return 'ok';}catch(e){return 'err '+e.message;}})()`);
  const a = await read();
  chk('B1 标注偏移已改变', un(a.dims) !== un(b.dims), { call: r, before: b.dims, after: a.dims });
  const p = await pushNow();
  console.log('  显式入栈:', p);
  await ctrlZ();
  const u = await read();
  chk('B2 Ctrl+Z 标注偏移回到改动前', un(u.dims) === un(b.dims), { want: b.dims, got: u.dims });
}

/* ── C 管道遮蔽 ─────────────────────────────────────────────── */
console.log('\n── C 管道遮蔽 ──');
{
  const pid = await ev(`(function(){
    var AE=window.RyTlAutoEdits, d=window.tlDiagramData;
    if(!AE||!d||!AE.allPids) return null;
    var ps=AE.allPids(d)||[];
    for(var i=0;i<ps.length;i++){ if(/^branch-/.test(ps[i])) return ps[i]; }
    return ps[0]||null;
  })()`);
  console.log('  目标管段:', pid);
  if (pid) {
    const b = await read();
    const r = await ev(`(function(){try{window.tlPipeHiddenChanged({pid:${JSON.stringify(pid)},on:true});return 1;}catch(e){return 'err '+e.message;}})()`);
    await sleep(600);
    const a = await read();
    chk('C1 遮蔽已生效', Array.isArray(a.hid) && a.hid.indexOf(pid) >= 0, { call: r, hid: a.hid });
    await pushNow();
    await ctrlZ();
    const u = await read();
    chk('C2 Ctrl+Z 解除遮蔽', un(u.hid) === un(b.hid), { want: b.hid, got: u.hid });
  } else chk('C 取得可遮蔽管段', false, pid);
}

/* ── D 手工节点 ─────────────────────────────────────────────── */
console.log('\n── D 手工节点 ──');
{
  const b = await read();
  const r = await ev(`(function(){
    var N=window.RyTlNodes, AE=window.RyTlAutoEdits, d=window.tlDiagramData;
    if(!N||!N.addAt) return 'no-api';
    var ps=(AE&&AE.allPids)?AE.allPids(d)||[]:[];
    var pid=null; for(var i=0;i<ps.length;i++){ if(/^branch-/.test(ps[i])){pid=ps[i];break;} }
    if(!pid) pid=ps[0]||'branch-1';
    try{ var nd=N.addAt(pid, 6); return nd?('ok '+nd.id):'null'; }catch(e){ return 'err '+e.message; }
  })()`);
  await sleep(600);
  const a = await read();
  chk('D1 新增了手工节点', a.nodes === b.nodes + 1, { call: r, before: b.nodes, after: a.nodes });
  await pushNow();
  await ctrlZ();
  const u = await read();
  chk('D2 Ctrl+Z 撤掉该节点', u.nodes === b.nodes, { want: b.nodes, got: u.nodes });
}

/* ── E 整图平移（恢复链） ───────────────────────────────────── */
console.log('\n── E 整图平移 ──');
{
  const b = await read();
  const r = await ev(`(function(){try{localStorage.setItem('tl-plot-pos',JSON.stringify({x:37,y:-19}));return 1;}catch(e){return 'err '+e.message;}})()`);
  const a = await read();
  chk('E1 平移值已改变', un(a.pos) !== un(b.pos), { call: r, before: b.pos, after: a.pos });
  await pushNow();
  await ctrlZ();
  const u = await read();
  chk('E2 Ctrl+Z 平移回到改动前', un(u.pos) === un(b.pos), { want: b.pos, got: u.pos });
}

/* ── F 图面改径（v145 不进存档，只靠撤销快照的 __undoCals 带回来） ── */
console.log('\n── F 图面改径 ──');
{
  const b = await read();
  const pid = await ev(`(function(){
    var AE=window.RyTlAutoEdits, d=window.tlDiagramData;
    if(!AE||!d||!AE.allPids) return null;
    var ps=AE.allPids(d)||[];
    for(var i=0;i<ps.length;i++){ if(/^branch-/.test(ps[i])) return ps[i]; }
    return ps[0]||null;
  })()`);
  console.log('  目标管段:', pid);
  if (pid) {
    const r = await ev(`(function(){try{
      var AE=window.RyTlAutoEdits;
      var ok=AE.setCaliber(${JSON.stringify(pid)}, 90, window.tlDiagramData, 'probe');
      return ok?('ok '+JSON.stringify(AE.caliberOf(${JSON.stringify(pid)}))):'false';
    }catch(e){return 'err '+e.message;}})()`);
    await sleep(600);
    const a = await read();
    chk('F1 改径已生效', a.cals && Object.keys(a.cals).length > 0, { call: r, before: b.cals, after: a.cals });
    await pushNow();
    await ctrlZ();
    const u = await read();
    chk('F2 Ctrl+Z 改径回到改前（清空）', un(u.cals) === un(b.cals), { want: b.cals, got: u.cals });
  } else chk('F 取得可改径管段', false, pid);
}

/* ── G 红线守卫：改径仍不得进工程存档（v145 用户约定「每次打开网页都清空」） ── */
console.log('\n── G 改径不进存档（v145 红线） ──');
{
  const r = await ev(`JSON.stringify((function(){
    try{
      var AE=window.RyTlAutoEdits, d=window.tlDiagramData;
      var pid=null, ps=(AE&&AE.allPids)?AE.allPids(d)||[]:[];
      for(var i=0;i<ps.length;i++){ if(/^branch-/.test(ps[i])){pid=ps[i];break;} }
      AE.setCaliber(pid, 90, d, 'probe');
      window.runyeSaveProject(true, '__probe_guard__');
      var raw=localStorage.getItem('__probe_guard__');
      localStorage.removeItem('__probe_guard__');
      var o=JSON.parse(raw);
      return { calInPayload:o.tlAutoEdits?Object.keys(o.tlAutoEdits.cals||{}).length:-1,
               hasUndoCals:('__undoCals' in o), inMem:Object.keys(AE.calibersMap()).length };
    }catch(e){ return {err:String(e&&e.message)}; }
  })())`);
  const g = typeof r === 'string' ? JSON.parse(r) : r;
  console.log('  存档检查:', un(g));
  chk('G1 存档里 tlAutoEdits.cals 仍为空', g.calInPayload === 0, g);
  chk('G2 存档里没有撤销专用字段 __undoCals', g.hasUndoCals === false, g);
  chk('G3 内存里确实有改径（证明 G1 不是"没改"的假绿）', g.inMem > 0, g);
}

if (process.env.SHOT) {
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(process.env.SHOT, Buffer.from(shot.data, 'base64'));
  console.log('截图:', process.env.SHOT);
}
try { child.kill(); } catch (e) { }
srv.close();
console.log(ok ? '\n== 撤销覆盖面探针：全部通过 ==' : '\n== 撤销覆盖面探针：有断言失败 ==');
process.exit(ok ? 0 : 1);
