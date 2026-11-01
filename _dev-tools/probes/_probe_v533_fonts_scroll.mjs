'use strict';
/* v533 探针：①滚动条宽度真值（computed + 实测 offsetWidth-clientWidth）
   ②被 runye-typography 的 13px !important 压死的控件字号清单（按选择器+声明值聚合）
   用法：node _probe_v533_fonts_scroll.mjs [page]   page 默认 index.html */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { spawn, spawnSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WS = globalThis.WebSocket;

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = 'C:/Users/AHS/runye-irrigation';
const PAGE = process.argv[2] || 'index.html';
const PORT = 14500 + Math.floor(Math.random() * 60);
const CDP = 14100 + Math.floor(Math.random() * 60);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };

const srv = http.createServer((req, r2) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const fp = path.join(ROOT, p.replace(/^\//, ''));
  if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r2.writeHead(404); r2.end('nf'); return; }
  r2.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(fp).pipe(r2);
});
await new Promise(r => srv.listen(PORT, '127.0.0.1', r));

try { spawnSync('powershell', ['-NoProfile', '-Command', "Get-CimInstance Win32_Process -Filter \"Name='msedge.exe'\" | Where-Object { $_.CommandLine -like '*headless*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"], { stdio: 'ignore', timeout: 30000 }); } catch (e) { }
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-proxy-server', '--remote-debugging-port=' + CDP, '--user-data-dir=C:\\tmp\\cdp_v533_' + Date.now(), '--window-size=1520,980'], { stdio: 'ignore' });

const hreq = (method, p) => new Promise((res, rej) => {
  const req = http.request({ host: '127.0.0.1', port: CDP, path: p, method }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); });
  req.on('error', rej); req.end();
});
let up = false;
for (let i = 0; i < 60; i++) { try { await hreq('GET', '/json/version'); up = true; break; } catch (e) { await sleep(300); } }
if (!up) { console.log('EDGE 启动失败'); process.exit(1); }

let idc = 1, ws = null; const pend = {}; const errs = [];
const send = (m, p = {}) => new Promise((res, rej) => { const id = idc++; pend[id] = { res, rej }; ws.send(JSON.stringify({ id, method: m, params: p })); setTimeout(() => { if (pend[id]) { delete pend[id]; rej(new Error('CDP timeout')); } }, 60000); });

const url = 'http://127.0.0.1:' + PORT + '/' + PAGE;
const t = JSON.parse(await hreq('PUT', '/json/new?' + encodeURIComponent(url)));
ws = new WS(t.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
ws.addEventListener('message', e => {
  const o = JSON.parse(e.data);
  if (o.method === 'Runtime.exceptionThrown') errs.push(String((o.params.exceptionDetails.exception && o.params.exceptionDetails.exception.description) || o.params.exceptionDetails.text).slice(0, 200));
  if (o.id && pend[o.id]) { const { res, rej } = pend[o.id]; delete pend[o.id]; o.error ? rej(new Error(o.error.message)) : res(o.result); }
});
await send('Runtime.enable'); await send('Page.enable');

/* 就绪闸门：并行会话会拖慢首屏，用轮询不用 sleep 赌 */
let ready = false;
for (let i = 0; i < 50; i++) {
  const r = await send('Runtime.evaluate', { expression: "(document.readyState==='complete')", returnByValue: true });
  if (r.result && r.result.value === true) { ready = true; break; }
  await sleep(700);
}
console.log('ready=' + ready + '  page=' + PAGE);
await sleep(1500);

const ev = async x => {
  const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { __err: String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text) };
  return r.result.value;
};

/* ---------- ① 滚动条 ---------- */
const sb = await ev(`(function(){
  function prob(el){
    if(!el) return null;
    var cs = getComputedStyle(el);
    var ov = cs.overflowY;
    var real = el.offsetWidth - el.clientWidth;
    var viaPseudo = '';
    try { viaPseudo = getComputedStyle(el, '::-webkit-scrollbar').width; } catch(e){}
    return { ov: ov, real: real, pseudoW: viaPseudo,
             thumb: (function(){ try { return getComputedStyle(el,'::-webkit-scrollbar-thumb').backgroundColor; } catch(e){ return ''; } })(),
             radius: (function(){ try { return getComputedStyle(el,'::-webkit-scrollbar-thumb').borderRadius; } catch(e){ return ''; } })() };
  }
  /* 造一个通用滚动容器，量「全局 *::-webkit-scrollbar」的真值 */
  var d = document.createElement('div');
  d.id='__sbProbe'; d.style.cssText='position:fixed;left:-9999px;top:0;width:120px;height:60px;overflow:auto;';
  d.innerHTML = '<div style="height:400px"></div>';
  document.body.appendChild(d);
  var general = prob(d);
  var out = { general: general, targets: {} };
  [['.pp-side', document.querySelector('.pp-side')],
   ['#ryCadSide .ry-cad-grps', document.querySelector('#ryCadSide .ry-cad-grps')],
   ['#rySetModal .rs-body', document.querySelector('#rySetModal .rs-body')],
   ['#tlEconPanel .te-mid', document.querySelector('#tlEconPanel .te-mid')],
   ['.at-sidebar', document.querySelector('.at-sidebar')]
  ].forEach(function(p){ var r = prob(p[1]); if(r) out.targets[p[0]] = r; });
  d.remove();
  return out;
})()`);

/* ---------- ② 被压死的 font-size ---------- */
const fs2 = await ev(`(function(){
  var rules = [];
  function walk(list, media){
    for (var i=0;i<list.length;i++){
      var r = list[i];
      if (r.type === 4 /* CSSMediaRule */){
        var m = null;
        try { m = window.matchMedia(r.conditionText).matches; } catch(e){ m = true; }
        if (m) walk(r.cssRules, r.conditionText);
        continue;
      }
      if (r.type !== 1 /* CSSStyleRule */) continue;
      var decl = r.style.getPropertyValue('font-size');
      if (!decl) continue;
      rules.push({ sel: r.selectorText, val: decl.trim(), imp: r.style.getPropertyPriority('font-size') === 'important',
                   media: media || '', src: (r.parentStyleSheet && r.parentStyleSheet.href) || 'inline', order: rules.length });
    }
  }
  for (var s=0;s<document.styleSheets.length;s++){
    var sh = document.styleSheets[s];
    var list; try { list = sh.cssRules; } catch(e){ continue; }
    if (list) walk(list, '');
  }
  var agg = {};
  var els = document.body.querySelectorAll('*');
  for (var e=0;e<els.length;e++){
    var el = els[e];
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'LINK') continue;
    var rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    var computed = parseFloat(getComputedStyle(el).fontSize);
    var mine = [];
    for (var k=0;k<rules.length;k++){
      var rr = rules[k];
      var hit = false;
      try { hit = el.matches(rr.sel); } catch(err){ hit = false; }
      if (hit) mine.push(rr);
    }
    if (!mine.length) continue;
    /* 找出「本元素自己直接声明过 font-size」的规则（排除继承来的） */
    var lastPlain = null, lastImp = null;
    for (var q=0;q<mine.length;q++){
      var m2 = mine[q];
      if (m2.imp) lastImp = m2; else lastPlain = m2;
    }
    if (!lastPlain) continue;
    var declared = parseFloat(lastPlain.val);
    if (!isFinite(declared)) continue;
    if (Math.abs(declared - computed) < 0.01) continue;   /* 声明生效了 */
    var key = lastPlain.sel + ' {' + lastPlain.val + '}' + (lastPlain.media ? ' @' + lastPlain.media : '');
    agg[key] = agg[key] || { sel: lastPlain.sel, val: lastPlain.val, media: lastPlain.media, computed: computed, n: 0, samples: [] };
    agg[key].n++;
    if (agg[key].samples.length < 3){
      var tag = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0,2).join('.') : '');
      agg[key].samples.push(tag + '=' + computed + 'px');
    }
  }
  var out = Object.keys(agg).map(function(k){ return agg[k]; });
  out.sort(function(a,b){ return b.n - a.n; });
  return { totalRules: rules.length, groups: out.length, affectedEls: out.reduce(function(s,x){ return s + x.n; }, 0), list: out };
})()`);

console.log('\n=== 滚动条 ===');
console.log(JSON.stringify(sb, null, 1));
console.log('\n=== font-size 被压死的声明（按元素数排序） ===');
if (fs2 && fs2.list) {
  console.log('含 font-size 的规则 ' + fs2.totalRules + ' 条 / 受影响声明组 ' + fs2.groups + ' / 受影响元素 ' + fs2.affectedEls);
  fs2.list.forEach(x => console.log('  ' + String(x.n).padStart(3) + '×  ' + x.sel + '  {' + x.val + '}' + (x.media ? ' @' + x.media : '') + '  → 实测 ' + x.computed + 'px   e.g. ' + x.samples.join(', ')));
} else console.log(JSON.stringify(fs2));
console.log('\n页面 JS 异常：' + (errs.length ? errs.join(' | ') : '无'));

ws.close();
try { child.kill(); } catch (e) { }
srv.close();
process.exit(0);
