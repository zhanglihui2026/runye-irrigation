'use strict';
/* 「谁在压这个属性」解释器：枚举命中某元素某属性 computed 值的全部 CSS 规则，按文档序打印，
   带 !important 标记与来源文件（含 index.html 内联 <style>，媒体查询递归展开）。
   排查「值不是我写的那个」时用它，比逐个 grep CSS 快，也不会漏内联规则。
   用法：node _explain_css.mjs <page> <cssProp> <selector>
   例：  node _explain_css.mjs index.html grid-template-columns "#terrainSection .t-body"
   注：容器选择器请写成能唯一定位的形式；目标视图未激活时元素未渲染，getBBox 会返回 0。 */
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
const PROP = process.argv[3] || 'grid-template-columns';
const CONTAINER = process.argv[4] || 'body';

const PORT = 15100 + Math.floor(Math.random() * 60);
const CDP = 14700 + Math.floor(Math.random() * 60);
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
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-proxy-server', '--remote-debugging-port=' + CDP, '--user-data-dir=C:\\tmp\\cdp_dump_' + Date.now(), '--window-size=1520,980'], { stdio: 'ignore' });
const hreq = (method, p) => new Promise((res, rej) => {
  const req = http.request({ host: '127.0.0.1', port: CDP, path: p, method }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); });
  req.on('error', rej); req.end();
});
for (let i = 0; i < 60; i++) { try { await hreq('GET', '/json/version'); break; } catch (e) { await sleep(300); } }
let idc = 1, ws = null; const pend = {};
const send = (m, p = {}) => new Promise((res, rej) => { const id = idc++; pend[id] = { res, rej }; ws.send(JSON.stringify({ id, method: m, params: p })); setTimeout(() => { if (pend[id]) { delete pend[id]; rej(new Error('timeout')); } }, 60000); });
const url = 'http://127.0.0.1:' + PORT + '/' + PAGE + (PAGE.indexOf('?') >= 0 ? '' : '?full=1');
const t = JSON.parse(await hreq('PUT', '/json/new?' + encodeURIComponent(url)));
ws = new WS(t.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
ws.addEventListener('message', e => { const o = JSON.parse(e.data); if (o.id && pend[o.id]) { const { res, rej } = pend[o.id]; delete pend[o.id]; o.error ? rej(new Error(o.error.message)) : res(o.result); } });
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1520, height: 980, deviceScaleFactor: 1, mobile: false });
for (let i = 0; i < 50; i++) {
  const r = await send('Runtime.evaluate', { expression: "(document.readyState==='complete')", returnByValue: true });
  if (r.result && r.result.value === true) break;
  await sleep(700);
}
await sleep(1500);
const ev = async x => {
  const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { __err: String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text) };
  return r.result.value;
};
const res = await ev(`(function(){
  var sel = ${JSON.stringify(CONTAINER)};
  var prop = ${JSON.stringify(PROP)};
  var el = document.querySelector(sel);
  if (!el) return { err: 'no element ' + sel };
  var hits = []; var order = 0;
  function walk(list, media){
    for (var i = 0; i < list.length; i++) {
      var r = list[i]; order++;
      if (r.type === 4) { var m = true; try { m = matchMedia(r.conditionText).matches; } catch (e) {} if (m) walk(r.cssRules, r.conditionText); continue; }
      if (r.type !== 1) continue;
      var v = r.style.getPropertyValue(prop);
      if (!v) continue;
      var hit = false; try { hit = el.matches(r.selectorText); } catch (e) {}
      if (hit) hits.push({ sel: r.selectorText, val: v, imp: r.style.getPropertyPriority(prop) === 'important',
                           media: media || '', href: (r.parentStyleSheet && r.parentStyleSheet.href || 'inline').split('/').slice(-2).join('/'), order: order });
    }
  }
  for (var s = 0; s < document.styleSheets.length; s++) {
    var sh = document.styleSheets[s]; var l; try { l = sh.cssRules; } catch (e) { continue; } if (l) walk(l, '');
  }
  return { sel: sel, prop: prop, computed: getComputedStyle(el).getPropertyValue(prop), hits: hits };
})()`);
if (res && res.hits) {
  console.log('computed ' + res.prop + ' = ' + res.computed + '   (' + res.hits.length + ' 条规则命中，按文档序)');
  res.hits.forEach(function (h) { console.log('  [' + h.order + '] ' + (h.imp ? '!' : ' ') + h.val + '   <- ' + h.sel + '   @' + h.href + (h.media ? ' @' + h.media : '')); });
} else console.log(JSON.stringify(res));
ws.close(); try { child.kill(); } catch (e) { } srv.close(); process.exit(0);
