'use strict';
/* 面板 A/B 样式快照（用于样式重构的等价验证）
   输出四份快照：
     rail.pp / rail.tl  —— 两条左栏在 #ryCadSide 内时的全部后代
     base.pp / base.tl  —— 搬回 section 原位时的全部后代
     rail.page / base.page —— 整页可见元素（查外溢）
   key 一律相对于「面板根节点 / body」，因此 rail 与原位两种 DOM 位置可以逐 key 对齐。
   用法：node _ab_panel_dump.mjs <out.json>   ｜ RY_ROOT=<目录> 换根 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WS = globalThis.WebSocket;

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = process.env.RY_ROOT || 'C:/Users/AHS/runye-irrigation';
const OUT = process.argv[2] || '_ab_panel.json';
const PORT = 15700 + Math.floor(Math.random() * 40);
const CDP = 15300 + Math.floor(Math.random() * 40);
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
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-proxy-server', '--host-resolver-rules=MAP cdn.jsdelivr.net 127.0.0.1', '--remote-debugging-port=' + CDP, '--user-data-dir=C:\\tmp\\cdp_ab_' + Date.now(), '--window-size=1520,980'], { stdio: 'ignore' });
const hreq = (m, p) => new Promise((res, rej) => { const q = http.request({ host: '127.0.0.1', port: CDP, path: p, method: m }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); }); q.on('error', rej); q.end(); });
for (let i = 0; i < 60; i++) { try { await hreq('GET', '/json/version'); break; } catch (e) { await sleep(300); } }
let idc = 1, ws; const pend = {};
const send = (m, p = {}) => new Promise((res, rej) => { const id = idc++; pend[id] = { res, rej }; ws.send(JSON.stringify({ id, method: m, params: p })); setTimeout(() => { if (pend[id]) { delete pend[id]; rej(new Error('timeout')); } }, 120000); });
const t = JSON.parse(await hreq('PUT', '/json/new?' + encodeURIComponent('http://127.0.0.1:' + PORT + '/index.html?full=1')));
ws = new WS(t.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
ws.addEventListener('message', e => { const o = JSON.parse(e.data); if (o.id && pend[o.id]) { const { res, rej } = pend[o.id]; delete pend[o.id]; o.error ? rej(new Error(o.error.message)) : res(o.result); } });
await send('Runtime.enable'); await send('Page.enable');
/* 无头新标签常被判后台 ⇒ rAF 不跑 ⇒ MutationObserver 里的 syncAll 被卡住。必须前置 + 聚焦仿真 */
try{ await send('Page.bringToFront'); await send('Emulation.setFocusEmulationEnabled',{enabled:true}); }catch(e){}
await send('Emulation.setDeviceMetricsOverride', { width: 1520, height: 980, deviceScaleFactor: 1, mobile: false });
for (let i = 0; i < 60; i++) {
  const r = await send('Runtime.evaluate', { expression: "!!window.RyPlanParams && !!document.getElementById('ppSide') && !!document.getElementById('tlSide')", returnByValue: true });
  if (r.result && r.result.value === true) break;
  await sleep(500);
}
await sleep(1500);
const ev = async x => {
  const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { __err: String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text) };
  return r.result.value;
};

const DUMP = `(function(rootSel){
  var root=document.querySelector(rootSel);
  if(!root) return {err:'missing '+rootSel};
  function pathOf(el){
    var segs=[];
    while(el && el!==root){ var p=el.parentNode, i=p?Array.prototype.indexOf.call(p.children,el):0;
      segs.unshift(el.tagName.toLowerCase()+':'+i); el=p; }
    return segs.join('>');
  }
  var PROPS=['fontSize','lineHeight','fontWeight','fontFamily','color','backgroundColor','backgroundImage',
    'borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth','borderTopColor','borderRightColor',
    'borderBottomColor','borderLeftColor','borderTopStyle','borderRadius','paddingTop','paddingRight','paddingBottom',
    'paddingLeft','marginTop','marginRight','marginBottom','marginLeft','display','visibility','width','height',
    'gap','rowGap','gridTemplateColumns','flexDirection','flexWrap','alignItems','justifyContent','textAlign',
    'letterSpacing','overflowY','boxShadow','position','opacity','verticalAlign','whiteSpace','minWidth','maxWidth','zIndex'];
  var out={}, list=[root].concat([].slice.call(root.querySelectorAll('*')));
  for(var i=0;i<list.length;i++){
    var el=list[i];
    if(/^(SCRIPT|STYLE|LINK|META)$/.test(el.tagName)) continue;
    var cs=getComputedStyle(el), vals=[];
    for(var k=0;k<PROPS.length;k++){ var v=cs[PROPS[k]]; vals.push(/px$/.test(v)?String(Math.round(parseFloat(v)*100)/100):v); }
    var r=el.getBoundingClientRect();
    out[pathOf(el)]=vals.join('|')+'||'+Math.round(r.width)+'x'+Math.round(r.height);
  }
  return out;
})`;

const waitStable = async (sel) => {
  /* 等字体与布局稳定：连续两次尺寸相同才算数 */
  await ev(`document.fonts && document.fonts.ready ? document.fonts.ready.then(()=>1) : 1`);
  let prev = null;
  for (let i = 0; i < 30; i++) {
    const r = await ev(`(function(){ var e=document.querySelector(${JSON.stringify(sel)});
      if(!e) return null; var b=e.getBoundingClientRect(); return Math.round(b.width)+'x'+Math.round(b.height); })()`);
    if (r && r === prev && r !== '0x0') return r;
    prev = r; await sleep(300);
  }
  return prev;
};
const forceState = async (sec) => {
  await ev(`(function(){ try{ if(window.ryShowSection) window.ryShowSection(${JSON.stringify(sec)}); }catch(e){} return true; })()`);
  await sleep(700);
  await ev(`document.body.setAttribute('data-ry-sec', ${JSON.stringify(sec)})`);
  await ev(`document.body.classList.remove('ry-tool'); document.body.classList.add('ry-tool')`);
  /* 轮询等待搬移真的发生（MutationObserver → rAF，偶发要 2 跳） */
  for (let i = 0; i < 20; i++) {
    const ok = await ev(`(function(){ var a=document.getElementById('ppSide'), b=document.getElementById('tlSide');
      var want=${JSON.stringify(sec)}==='designInput' ? false : true;
      var inRail = !!(a&&a.closest('#ryCadSide')) && !!(b&&b.closest('#ryCadSide'));
      return inRail===want; })()`);
    if (ok === true) break;
    await sleep(400);
    if (i === 4 || i === 9) { await ev(`document.body.classList.remove('ry-tool'); document.body.classList.add('ry-tool')`); }
  }
  /* 固定工具栏展开态，避免 41 vs 319 的让位宽度污染对比 */
  await ev(`(function(){ var s=document.getElementById('ryCadSide'); if(s) s.setAttribute('data-ry-open','1'); return true; })()`);
  await sleep(500);
};

const result = { meta: { root: ROOT } };
/* ── rail 态 ── */
await forceState('tlPipePlanSection');
await waitStable('#ppSide');
result.meta.rail = await ev(`(function(){ var a=document.getElementById('ppSide'), b=document.getElementById('tlSide');
  return { ppInRail: !!(a&&a.closest('#ryCadSide')), tlInRail: !!(b&&b.closest('#ryCadSide')),
    slInput: !!(window.customElements && window.customElements.get('sl-input')),
    fbShown: document.querySelectorAll('.ryp-native-fallback').length }; })()`);
result['rail.pp'] = await ev(DUMP + "('#ppSide')");
result['rail.tl'] = await ev(DUMP + "('#tlSide')");
await waitStable('#tlSide');
result['rail.secPP'] = await ev(DUMP + "('#pipePlanSection')");
result['rail.secTL'] = await ev(DUMP + "('#tlPipePlanSection')");
result['rail.main'] = await ev(DUMP + "('main')");
result['rail.page'] = await ev(DUMP + "('body')");

/* ── 原位态 ── */
await forceState('designInput');
result.meta.base = await ev(`(function(){ var a=document.getElementById('ppSide'), b=document.getElementById('tlSide');
  var s1=document.getElementById('pipePlanSection'), s2=document.getElementById('tlPipePlanSection');
  if(s1) s1.style.setProperty('display','block','important');
  if(s2) s2.style.setProperty('display','block','important');
  return { ppInRail: !!(a&&a.closest('#ryCadSide')), tlInRail: !!(b&&b.closest('#ryCadSide')) }; })()`);
await waitStable('#ppSide');
result['base.pp'] = await ev(DUMP + "('#ppSide')");
result['base.tl'] = await ev(DUMP + "('#tlSide')");
result['base.secPP'] = await ev(DUMP + "('#pipePlanSection')");
result['base.secTL'] = await ev(DUMP + "('#tlPipePlanSection')");
result['base.main'] = await ev(DUMP + "('main')");
result['base.page'] = await ev(DUMP + "('body')");

fs.writeFileSync(path.join(ROOT, OUT), JSON.stringify(result));
console.log('rail=' + JSON.stringify(result.meta.rail) + '  base=' + JSON.stringify(result.meta.base));
for (const k of ['rail.pp', 'rail.tl', 'rail.secPP', 'rail.secTL', 'rail.main', 'rail.page', 'base.pp', 'base.tl', 'base.secPP', 'base.secTL', 'base.main', 'base.page']) {
  console.log('  ' + k.padEnd(10) + Object.keys(result[k] || {}).length + ' 元素');
}
console.log('→ ' + OUT);
ws.close(); try { child.kill(); } catch (e) { } srv.close(); process.exit(0);
