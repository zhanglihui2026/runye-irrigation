'use strict';
/* 悬浮卡片的样式快照（v544 统一卡片外壳的等价验证）
   抓 #tlWsLayerPanel / #grHydPanel / .ai-panel / .rym-layer-panel
   的 root / head / body 及全部后代：40 个 computed 属性 + 尺寸 + 位置。
   用法：node _probe_float_cards.mjs <out.json>   ｜ RY_ROOT=<目录> 换根 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WS = globalThis.WebSocket;

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = process.env.RY_ROOT || 'C:/Users/AHS/runye-irrigation';
const OUT = process.argv[2] || '_float_cards.json';
const PORT = 15900 + Math.floor(Math.random() * 40);
const CDP = 15500 + Math.floor(Math.random() * 40);
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
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-proxy-server',
  '--host-resolver-rules=MAP cdn.jsdelivr.net 127.0.0.1', '--remote-debugging-port=' + CDP,
  '--user-data-dir=C:\\tmp\\cdp_fc_' + Date.now(), '--window-size=1400,900'], { stdio: 'ignore' });
const hreq = (m, p) => new Promise((res, rej) => { const q = http.request({ host: '127.0.0.1', port: CDP, path: p, method: m }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); }); q.on('error', rej); q.end(); });
for (let i = 0; i < 60; i++) { try { await hreq('GET', '/json/version'); break; } catch (e) { await sleep(300); } }
let idc = 1, ws; const pend = {};
const send = (m, p = {}) => new Promise((res, rej) => { const id = idc++; pend[id] = { res, rej }; ws.send(JSON.stringify({ id, method: m, params: p })); setTimeout(() => { if (pend[id]) { delete pend[id]; rej(new Error('timeout ' + m)); } }, 120000); });
const t = JSON.parse(await hreq('PUT', '/json/new?' + encodeURIComponent('http://127.0.0.1:' + PORT + '/index.html?full=1')));
ws = new WS(t.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
ws.addEventListener('message', e => { const o = JSON.parse(e.data); if (o.id && pend[o.id]) { const { res, rej } = pend[o.id]; delete pend[o.id]; o.error ? rej(new Error(o.error.message)) : res(o.result); } });
await send('Runtime.enable'); await send('Page.enable');
try { await send('Page.bringToFront'); await send('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch (e) { }
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
for (let i = 0; i < 80; i++) {
  const r = await send('Runtime.evaluate', { expression: "!!window.RyPlanParams && !!document.getElementById('ppSide')", returnByValue: true });
  if (r.result && r.result.value === true) break;
  await sleep(500);
}
await sleep(1200);
const ev = async x => {
  const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { __err: String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text) };
  return r.result.value;
};

/* 让区块可见（主页区块默认 display:none，必须 important） */
await ev(`(function(){
  ['tlPipePlanSection','grPipeSection','onlineMapSection','pipePlanSection'].forEach(function(id){
    var s=document.getElementById(id); if(s) s.style.setProperty('display','block','important');
  });
  try{ if(window.ryShowSection) ryShowSection('onlineMapSection'); }catch(e){}
  return true;
})()`);
await sleep(2500);

const DUMP = `(function(sel){
  var root=document.querySelector(sel);
  if(!root) return {err:'missing'};
  function pathOf(el){
    var segs=[];
    while(el && el!==root){ var p=el.parentNode, i=p?Array.prototype.indexOf.call(p.children,el):0;
      segs.unshift(el.tagName.toLowerCase()+':'+i); el=p; }
    return segs.join('>')||'ROOT';
  }
  var PROPS=['fontSize','lineHeight','fontWeight','fontFamily','color','backgroundColor','backgroundImage',
    'borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth','borderTopColor','borderRightColor',
    'borderBottomColor','borderLeftColor','borderTopStyle','borderBottomStyle','borderRadius','paddingTop','paddingRight',
    'paddingBottom','paddingLeft','marginTop','marginRight','marginBottom','marginLeft','display','visibility',
    'width','height','gap','rowGap','gridTemplateColumns','flexDirection','flexWrap','alignItems','justifyContent',
    'textAlign','letterSpacing','overflowY','overflowX','boxShadow','position','opacity','verticalAlign','whiteSpace',
    'minWidth','maxWidth','maxHeight','zIndex','top','right','left','bottom','boxSizing','cursor'];
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

const cards = [
  ['tlWsLayerPanel', '#tlWsLayerPanel'],
  ['grHydPanel', '#grHydPanel'],
  ['aiPanel', '.ai-panel'],
  ['rymLayerPanel', '.rym-layer-panel']
];
const res = {};
for (const [name, sel] of cards) {
  res[name] = await ev('(' + DUMP + ')(' + JSON.stringify(sel) + ')');
  if (res[name] && res[name].__err) res[name] = { err: res[name].__err };
}
res.__meta = {
  url: 'index.html',
  slInput: await ev("!!(window.customElements && customElements.get('sl-input'))"),
  cards: Object.fromEntries(cards.map(([n, s]) => [n, !!(res[n] && !res[n].err)]))
};
fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
console.log('wrote', OUT, '| cards:', JSON.stringify(res.__meta.cards));
try { ws.close(); } catch (e) { }
try { child.kill(); } catch (e) { }
try { srv.close(); } catch (e) { }
process.exit(0);
