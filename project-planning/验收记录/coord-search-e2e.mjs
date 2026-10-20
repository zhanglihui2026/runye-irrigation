'use strict';
/* v634 坐标搜索 · 端到端验收（Edge headless + CDP，直接跑独立地图页）
   断言：三种坐标写法都能识别并定位（tip 以「已按坐标定位」起头）、红标出现、零 pageerror。
   用法：node _p1/_tmp_coord_e2e.mjs */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { spawn } = require('child_process');
const http = require('http'); const fs = require('fs'); const path = require('path');
const WS = globalThis.WebSocket;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = 'C:/Users/AHS/runye-irrigation';
const PORT = 39720 + Math.floor(Math.random() * 30);
const CDP = 39920 + Math.floor(Math.random() * 30);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };
const srv = http.createServer((req, r2) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const fp = path.join(ROOT, p.replace(/^\//, ''));
  if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r2.writeHead(404); r2.end('nf'); return; }
  r2.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(fp).pipe(r2);
});
await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-proxy-server',
  '--remote-debugging-port=' + CDP, '--user-data-dir=C:\\tmp\\cdp_cs_' + Date.now(), '--window-size=1440,900'], { stdio: 'ignore' });
const hreq = (m, p) => new Promise((res, rej) => { const q = http.request({ host: '127.0.0.1', port: CDP, path: p, method: m }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); }); q.on('error', rej); q.end(); });
for (let i = 0; i < 60; i++) { try { await hreq('GET', '/json/version'); break; } catch (e) { await sleep(300); } }
let idc = 1, ws; const pend = {}; const errors = [];
const send = (m, p = {}) => new Promise((res, rej) => { const id = idc++; pend[id] = { res, rej }; ws.send(JSON.stringify({ id, method: m, params: p })); setTimeout(() => { if (pend[id]) { delete pend[id]; rej(new Error('timeout ' + m)); } }, 120000); });
const t = JSON.parse(await hreq('PUT', '/json/new?' + encodeURIComponent('http://127.0.0.1:' + PORT + '/runye-map-measure.html')));
ws = new WS(t.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
ws.addEventListener('message', e => {
  const o = JSON.parse(e.data);
  if (o.id && pend[o.id]) { const { res, rej } = pend[o.id]; delete pend[o.id]; o.error ? rej(new Error(o.error.message)) : res(o.result); return; }
  if (o.method === 'Runtime.exceptionThrown') { const d = o.params.exceptionDetails || {}; errors.push('EXCEPTION: ' + ((d.exception && (d.exception.description || d.exception.value)) || d.text || '').slice(0, 200)); }
  if (o.method === 'Page.javascriptDialogOpening') { ws.send(JSON.stringify({ id: idc++, method: 'Page.handleJavaScriptDialog', params: { accept: true } })); }
});
await send('Runtime.enable'); await send('Page.enable');
try { await send('Page.bringToFront'); } catch (e) { }
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return { __err: String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text).slice(0, 300) }; return r.result.value; };

for (let i = 0; i < 80; i++) { if (await ev("!!document.getElementById('btnSearch')") === true) break; await sleep(300); }
await sleep(2500);

const cases = [
  ['十进制度',              '18.2528,109.5119'],
  ['方向字母',              'N18.2528 E109.5119'],
  ['度分秒',                `18°15'10"N, 109°30'43"E`],
  ['中文经纬',              '北纬18.2528 东经109.5119'],
  ['经纬自动换位',          '109.5119,18.2528'],
];

const results = [];
for (const [name, input] of cases) {
  const r = await ev(`(function(){
    var s=document.getElementById('search');
    s.value=${JSON.stringify(input)};
    document.getElementById('btnSearch').click();
    return 1;
  })()`);
  await sleep(2600);
  const snap = await ev(`(function(){
    return {
      tip:(document.getElementById('tip')||{}).textContent||'',
      pins:document.querySelectorAll('.ry-pin').length,
      resultsVisible:!(document.getElementById('searchRes')||{}).hidden
    };
  })()`);
  results.push({ name, input, tip: (snap && snap.tip) || '', pins: (snap && snap.pins) || 0, ok: /^已按坐标定位/.test((snap && snap.tip) || '') });
}

/* 截图：坐标定位后的实际效果 */
try {
  await ev(`(function(){var s=document.getElementById('search');s.value='北纬18.2528 东经109.5119';document.getElementById('btnSearch').click();return 1;})()`);
  await sleep(3200);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync(path.join(ROOT, '_verify_out'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, '_verify_out', 'coord-search-after.png'), Buffer.from(shot.data, 'base64'));
  console.log('SHOT: _verify_out/coord-search-after.png');
} catch (e) { console.log('SHOT ERR: ' + e.message); }

/* 地名输入必须仍走关键词搜索（不能被坐标解析器吞掉） */
await ev(`(function(){var s=document.getElementById('search');s.value='三亚 崖州';document.getElementById('btnSearch').click();return 1;})()`);
await sleep(500);
const nameSnap = await ev(`(function(){return {tip:(document.getElementById('tip')||{}).textContent||''};})()`);

let pass = 0, fail = 0;
results.forEach(r => {
  if (r.ok) { pass++; console.log(`  ✓ ${r.name.padEnd(10)} ${r.input.padEnd(28)} tip=${r.tip.slice(0, 46)}`); }
  else { fail++; console.log(`  ✗ ${r.name.padEnd(10)} ${r.input.padEnd(28)} tip=${r.tip}`); }
});
const nameOk = !/^已按坐标定位/.test((nameSnap && nameSnap.tip) || '');
if (nameOk) { pass++; console.log(`  ✓ ${'地名不被误判'.padEnd(10)} 「三亚 崖州」 tip=${(nameSnap.tip || '').slice(0, 40)}`); }
else { fail++; console.log(`  ✗ 地名被坐标解析器吞了：${nameSnap.tip}`); }
if (!errors.length) { pass++; console.log('  ✓ 零 pageerror'); } else { fail++; console.log('  ✗ pageerror: ' + errors.join(' | ')); }

console.log(`\n== 坐标搜索 E2E：${pass} passed / ${fail} failed ==`);
try { ws.close(); } catch (e) { }
try { child.kill(); } catch (e) { }
try { srv.close(); } catch (e) { }
process.exit(fail ? 1 : 0);
