/* 量一下右侧双面板滚动条的实际占用宽度（offsetWidth - clientWidth） */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const puppeteer = require('puppeteer-core');
const killTree = require('./_edge_kill.cjs');
const WS = 'C://Users//AHS//runye-irrigation';
const EDGE = 'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = path.join(WS, '_verify_out');
const PORT = 9688;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const proc = spawn(EDGE, ['--headless=new', '--allow-file-access-from-files',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(OUT, 'profile_sb'),
    '--no-first-run', '--window-size=1500,950', 'about:blank'], { stdio: 'ignore' });
  let browser = null;
  for (let i = 0; i < 40; i++) { try { browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:' + PORT, defaultViewport: null }); break; } catch (e) { await sleep(400); } }
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 950 });
  await page.goto('file:///' + encodeURI(path.join(WS, '管路接驳拼装.html').replace(/\\/g, '/')), { waitUntil: 'load' });
  await sleep(900);
  await page.click('#btnExample');
  await sleep(600);
  const r = await page.evaluate(() => {
    const m = (sel) => { const e = document.querySelector(sel); return e ? { w: e.offsetWidth - e.clientWidth, sw: e.scrollWidth, ch: e.clientHeight } : null; };
    return { props: m('#paProps'), results: m('#paResults'), lib: m('.pa-lib') };
  });
  console.log('右侧面板滚动条占用宽度：', JSON.stringify(r));
  await page.screenshot({ path: path.join(OUT, 'pa_v210_scrollbar.png') });
  await browser.disconnect();
  killTree(proc.pid);
})().catch((e) => { console.error(e && e.message); process.exit(1); });
