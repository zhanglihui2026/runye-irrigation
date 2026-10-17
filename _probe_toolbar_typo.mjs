'use strict';
/* 两个工具栏（二级 #ppSide / 三级 #tlSide）的文字字号分布探针
   只统计「直接含文本节点」的元素（避免继承值重复计数），按 fontSize 分组汇总 + 明细。
   用法：node _probe_toolbar_typo.mjs [out.json]   （RY_ROOT / RY_VP 同 _dump_style.mjs） */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { spawn, spawnSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WS = globalThis.WebSocket;

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = process.env.RY_ROOT || 'C:/Users/AHS/runye-irrigation';
const OUT = process.argv[2] || '_toolbar_typo.json';
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
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-proxy-server', '--remote-debugging-port=' + CDP, '--user-data-dir=C:\\tmp\\cdp_typo_' + Date.now(), '--window-size=' + (process.env.RY_VP || '1520,980')], { stdio: 'ignore' });
const hreq = (method, p) => new Promise((res, rej) => {
  const req = http.request({ host: '127.0.0.1', port: CDP, path: p, method }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); });
  req.on('error', rej); req.end();
});
for (let i = 0; i < 60; i++) { try { await hreq('GET', '/json/version'); break; } catch (e) { await sleep(300); } }
let idc = 1, ws = null; const pend = {};
const send = (m, p = {}) => new Promise((res, rej) => { const id = idc++; pend[id] = { res, rej }; ws.send(JSON.stringify({ id, method: m, params: p })); setTimeout(() => { if (pend[id]) { delete pend[id]; rej(new Error('timeout')); } }, 60000); });
const url = 'http://127.0.0.1:' + PORT + '/index.html?full=1';
const t = JSON.parse(await hreq('PUT', '/json/new?' + encodeURIComponent(url)));
ws = new WS(t.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
ws.addEventListener('message', e => { const o = JSON.parse(e.data); if (o.id && pend[o.id]) { const { res, rej } = pend[o.id]; delete pend[o.id]; o.error ? rej(new Error(o.error.message)) : res(o.result); } });
await send('Runtime.enable'); await send('Page.enable');
const VP = (process.env.RY_VP || '1520,980').split(',').map(Number);
await send('Emulation.setDeviceMetricsOverride', { width: VP[0], height: VP[1], deviceScaleFactor: 1, mobile: false });
for (let i = 0; i < 50; i++) {
  const r = await send('Runtime.evaluate', { expression: "(document.readyState==='complete')", returnByValue: true });
  if (r.result && r.result.value === true) break;
  await sleep(700);
}
/* 轮询就绪闸门：并行会话新增 core 脚本后首屏会拖到 10s+，别赌 sleep */
for (let i = 0; i < 60; i++) {
  const r = await send('Runtime.evaluate', { expression: "!!window.RyPlanParams && !!document.getElementById('ppSide') && !!document.getElementById('tlSide')", returnByValue: true });
  if (r.result && r.result.value === true) break;
  await sleep(500);
}
await sleep(1200);
const ev = async x => {
  const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { __err: String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text) };
  return r.result.value;
};

const DUMP = `(function(sel){
  var root = document.querySelector(sel);
  if (!root) return { err: 'container missing: ' + sel };
  function hasOwnText(el){
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType === 3 && n.nodeValue.trim() !== '') return true;
    }
    return false;
  }
  function desc(el){
    var c = (el.className && typeof el.className === 'string') ? el.className.trim().split(/\\s+/).slice(0,3).join('.') : '';
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (c ? '.' + c : '');
  }
  var rows = [], list = root.querySelectorAll('*');
  for (var i = 0; i < list.length; i++) {
    var el = list[i];
    if (/^(SCRIPT|STYLE|LINK|META|SVG|PATH|CIRCLE|LINE|RECT|TEXT|G|POLYGON|POLYLINE)$/.test(el.tagName)) continue;
    var r = el.getBoundingClientRect();
    var vis = r.width > 0 && r.height > 0;
    var isField = /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName);
    if (!hasOwnText(el) && !isField) continue;
    var cs = getComputedStyle(el);
    var txt = '';
    for (var k = 0; k < el.childNodes.length; k++) {
      var n = el.childNodes[k];
      if (n.nodeType === 3) txt += n.nodeValue;
    }
    if (isField) txt = '[value=' + (el.value || '') + ']';
    rows.push({
      el: desc(el),
      txt: txt.trim().replace(/\\s+/g, ' ').slice(0, 18),
      fs: cs.fontSize,
      fw: cs.fontWeight,
      lh: cs.lineHeight,
      color: cs.color,
      vis: vis,
      h: Math.round(r.height * 10) / 10
    });
  }
  return { rows: rows, rootW: Math.round(root.getBoundingClientRect().width), inRail: !!root.closest('#ryCadSide') };
})`;
/* 三级要先把视图切到 pipe，否则目标视图未激活时元素未渲染 */
const out = {};
for (const item of [
  { key: 'pp', label: '二级 地块工具栏 (#ppSide)', sel: '#ppSide', sec: 'pipePlanSection' },
  { key: 'tl', label: '三级 管网工具栏 (#tlSide)', sel: '#tlSide', sec: 'tlPipePlanSection' }
]) {
  await ev(`(function(){ try{
      if (window.rySetTab) window.rySetTab('${item.sec}','pipe');
      if (window.ryShowSection) window.ryShowSection('${item.sec}');
      return true; }catch(e){ return String(e); } })()`);
  await sleep(1800);
  const res = await ev(DUMP + '(' + JSON.stringify(item.sel) + ')');
  out[item.key] = { label: item.label, sel: item.sel, res };
}
fs.writeFileSync(path.join(ROOT, OUT), JSON.stringify(out, null, 1));
for (const k of ['pp', 'tl']) {
  const o = out[k], res = o.res || {};
  console.log('\n===== ' + o.label + ' =====');
  if (res.err) { console.log('  ERR ' + res.err); continue; }
  console.log('  inRail=' + res.inRail + '  rootW=' + res.rootW + '  文本/输入元素=' + (res.rows || []).length);
  const g = {};
  (res.rows || []).forEach(r => { const key = r.fs + '/' + r.fw + (r.vis ? '' : '(隐藏)'); (g[key] = g[key] || []).push(r); });
  Object.keys(g).sort((a, b) => parseFloat(a) - parseFloat(b)).forEach(key => {
    const arr = g[key];
    console.log('  ' + key.padEnd(16) + ' ×' + String(arr.length).padEnd(3) + ' 例: ' + arr.slice(0, 8).map(r => r.txt + '(' + r.el + ')').join(' | '));
  });
}
console.log('\n明细 → ' + OUT);
ws.close(); try { child.kill(); } catch (e) { } srv.close(); process.exit(0);
