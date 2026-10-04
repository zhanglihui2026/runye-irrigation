/* _p1/_diag_v208_v5.cjs · 定位 V5 场景卡死（逐步打点 + 短协议超时） */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');
const killTree = require('./_edge_kill.cjs');
const WS = 'C:\\Users\\AHS\\runye-irrigation';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = path.join(WS, '_verify_out');
const PORT = 9552;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileUrl = (p) => 'file:///' + encodeURI(p.replace(/\\/g, '/'));
const t0 = Date.now();
const log = (m) => console.log('  [' + String(Date.now() - t0).padStart(6) + 'ms] ' + m);

(async () => {
  const proc = spawn(EDGE, ['--headless=new', '--allow-file-access-from-files', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(OUT, 'profile_v208diag'), '--no-first-run', '--window-size=1500,950', 'about:blank'], { stdio: 'ignore' });
  let browser = null;
  for (let i = 0; i < 50; i++) { try { browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:' + PORT, defaultViewport: null, protocolTimeout: 15000 }); break; } catch (e) { await sleep(400); } }
  const page = await browser.newPage();
  page.on('pageerror', (e) => log('PAGEERROR: ' + e.message));
  await page.setViewport({ width: 1500, height: 950 });
  await page.goto(fileUrl(path.join(WS, '管路接驳拼装.html')), { waitUntil: 'load' });
  await sleep(900);
  const R = (fn, ...a) => page.evaluate(fn, ...a);
  async function step(name, fn) {
    log('→ ' + name);
    try { await fn(); log('   ✓ ' + name); }
    catch (e) { log('   ✗ ' + name + ' :: ' + e.message.split('\n')[0]); throw e; }
  }

  await step('reload 清库', async () => {
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) { } });
    await page.reload({ waitUntil: 'load' }); await sleep(700);
  });
  await step('载入示例', async () => { await page.click('#btnExample'); await sleep(300); });
  await step('点击素材库「直管」', async () => { await page.click('.pa-item[data-add="straight"]'); await sleep(300); });
  await step('读取 comps', async () => { const c = await R(() => window.RyPipeAssembler.getComps()); log('   comps=' + c.length + ' last=' + JSON.stringify(c[c.length - 1])); });
  const comps = await R(() => window.RyPipeAssembler.getComps());
  const pipe = comps[comps.length - 1], s3 = comps[4];
  const T = { x: s3.x + s3.len * 12, y: s3.y };
  const z = await R(() => document.getElementById('paVp').getScreenCTM().a);
  log('   zoom=' + z + ' 目标口=' + JSON.stringify(T));
  const planToClient = (x, y) => R((px, py) => {
    const svg = document.getElementById('paSvg'), vp = document.getElementById('paVp');
    const p = svg.createSVGPoint(); p.x = px; p.y = py;
    const q = p.matrixTransform(vp.getScreenCTM()); return { x: q.x, y: q.y };
  }, x, y);
  const grab = await planToClient(pipe.x + pipe.len * 12 / 2, pipe.y);
  const dvp = 30 / z;
  const dst = await planToClient(T.x + 0.6 * dvp + pipe.len * 12 / 2, T.y + 0.8 * dvp);
  log('   grab=' + JSON.stringify(grab) + ' dst=' + JSON.stringify(dst));
  await step('按下鼠标', async () => { await page.mouse.move(grab.x, grab.y); await page.mouse.down(); });
  for (let i = 1; i <= 6; i++) {
    await step('移动 ' + i + '/6', async () => {
      await page.mouse.move(grab.x + (dst.x - grab.x) * i / 6, grab.y + (dst.y - grab.y) * i / 6);
      await sleep(30);
      const st = await R(() => window.RyPipeAssembler.getComps().map((c) => Math.round(c.x) + ',' + Math.round(c.y)).join(' | '));
      log('     ' + st);
    });
  }
  await step('松手', async () => { await page.mouse.up(); await sleep(300); });
  await step('读取结果', async () => {
    const cc = await R(() => window.RyPipeAssembler.getConns());
    log('   conns=' + cc.length);
  });
  try { await browser.disconnect(); } catch (e) { }
  killTree(proc.pid);
  process.exit(0);
})().catch((e) => { console.error('ABORT: ' + e.message.split('\n')[0]); process.exit(2); });
