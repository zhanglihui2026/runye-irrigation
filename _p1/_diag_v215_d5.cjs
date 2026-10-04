/* v215 诊断：点「生成管线图」后，三级简图 #tlDiagramContent 的 svg 到底有没有被重建？
 * （D5 注入「恢复点被删」后 ⑪ 仍绿 ⇒ 怀疑简图根本没重建，断言恒绿） */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const puppeteer = require('./_pptr.cjs');
const killTree = require('./_edge_kill.cjs');
const WS = 'C:\\Users\\AHS\\runye-irrigation';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = path.join(WS, '_verify_out');
const PAGE = process.argv[2] || 'index.html';
const PORT = 9655;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileUrl = (p) => 'file:///' + encodeURI(p.replace(/\\/g, '/'));

const SNAP = `(function(){
  var c=document.getElementById('tlDiagramContent'); if(!c) return {err:'no container'};
  var svg=c.querySelector('svg'); if(!svg) return {err:'no svg'};
  if(!svg.__id){ svg.__id = 'svg'+(window.__svgSeq=(window.__svgSeq||0)+1); }
  var rs=svg.querySelectorAll('rect[data-zi]');
  var demo=0, orig=0, first=null;
  rs.forEach(function(r){ var f=r.getAttribute('fill')||'';
    if(f===r.getAttribute('data-fill')) orig++; else demo++; });
  if(rs[0]) first={zi:rs[0].getAttribute('data-zi'), fill:rs[0].getAttribute('fill'), dfill:rs[0].getAttribute('data-fill')};
    return { id:svg.__id, n:rs.length, orig:orig, demo:demo, first:first, len:(c.innerHTML||'').length,
    demoG:window.__tlDemoGroup, view:(document.querySelector('#tlPipePlanSection [data-ry-tab].on')||{}).getAttribute ? 'x' : 'y' };
  })()`;

(async () => {
  const proc = spawn(EDGE, ['--headless=new', '--allow-file-access-from-files',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(OUT, 'profile_v215d'),
    '--no-first-run', '--window-size=1500,950', 'about:blank'], { stdio: 'ignore' });
  let browser = null;
  for (let i = 0; i < 50; i++) { try { browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:' + PORT, defaultViewport: null }); break; } catch (e) { await sleep(400); } }
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 950 });
  await page.goto(fileUrl(path.join(WS, PAGE)), { waitUntil: 'load', timeout: 120000 });
  await sleep(1500);
  await page.evaluate(() => { document.body.classList.add('ry-tool'); try { localStorage.clear(); } catch (e) { } });
  await page.evaluate(() => {
    window.measuredPolygon = [{ x: 0, y: 0 }, { x: 320, y: 0 }, { x: 320, y: 200 }, { x: 0, y: 200 }];
    window.measuredPolygonSource = 'verify';
    if (typeof window.ppLoadPolygon === 'function') window.ppLoadPolygon();
    if (typeof window.ryShowSection === 'function') window.ryShowSection(document.getElementById('pipePlanSection'), null);
  });
  await sleep(400);
  await page.evaluate(() => { const b = document.getElementById('ppGenerate'); if (b) b.click(); });
  await sleep(1500);
  await page.evaluate(() => { if (typeof window.ryShowSection === 'function') window.ryShowSection(document.getElementById('tlPipePlanSection'), null); });
  await sleep(400);
  await page.evaluate(() => { const b = document.getElementById('tlAutoPipe'); if (b) b.click(); });
  await sleep(2000);
  await page.evaluate(() => { if (typeof window.rySetTab === 'function') window.rySetTab('tlPipePlanSection', 'ws'); });
  await sleep(1200);

  /* 开演示（组0） */
  await page.click('#tlDemoChips button[data-demo-g="0"]');
  await sleep(400);
  console.log('演示中 · 重生成前 :', JSON.stringify(await page.evaluate(SNAP)));

  await page.evaluate(() => { const b = document.getElementById('tlAutoPipe'); if (b) b.click(); });
  await sleep(2200);
  console.log('演示中 · 重生成后 :', JSON.stringify(await page.evaluate(SNAP)));

  /* 对照：直接调 tlAutoGenerate（若它是全局函数） */
  const r2 = await page.evaluate(() => {
    if (typeof window.tlAutoGenerate !== 'function') return 'tlAutoGenerate 非全局';
    try { window.tlAutoGenerate(); } catch (e) { return 'ERR ' + e.message; }
    return 'ok';
  });
  await sleep(1200);
  console.log('直调 tlAutoGenerate:', r2);
  console.log('直调后           :', JSON.stringify(await page.evaluate(SNAP)));

  await browser.disconnect();
  killTree(proc.pid);
})().catch((e) => { console.error(e && e.message); killTree.sweepTestEdges(); process.exit(1); });
