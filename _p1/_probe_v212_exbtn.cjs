/* v212：「载入示例管路」已挪到左侧素材库顶部 —— 量位置 + 出图 */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const puppeteer = require('puppeteer-core');
const killTree = require('./_edge_kill.cjs');
const WS = 'C://Users//AHS//runye-irrigation';
const EDGE = 'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = path.join(WS, '_verify_out');
const PORT = 9691;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const proc = spawn(EDGE, ['--headless=new', '--allow-file-access-from-files',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(OUT, 'profile_v212'),
    '--no-first-run', '--window-size=1500,950', 'about:blank'], { stdio: 'ignore' });
  let browser = null;
  for (let i = 0; i < 40; i++) { try { browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:' + PORT, defaultViewport: null }); break; } catch (e) { await sleep(400); } }
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 950 });
  await page.goto('file:///' + encodeURI(path.join(WS, '管路接驳拼装.html').replace(/\\/g, '/')), { waitUntil: 'load' });
  await sleep(1000);
  const r = await page.evaluate(() => {
    const b = document.getElementById('btnExample');
    const lib = document.getElementById('paLib');
    const hdr = document.querySelector('.pa-left .pa-pane-h');
    const tb = document.querySelector('.pa-toolbar');
    const rr = (e) => { const q = e.getBoundingClientRect(); return { x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width) }; };
    return {
      inLeftPanel: !!b.closest('.pa-left'),
      inToolbar: !!b.closest('.pa-toolbar'),
      btn: rr(b), lib: rr(lib), hdr: rr(hdr),
      toolbarHasIt: !!tb.querySelector('#btnExample'),
      toolbarBtns: tb.querySelectorAll('.pa-btn').length
    };
  });
  console.log('布局：', JSON.stringify(r));
  await page.click('#btnExample');
  await sleep(600);
  await page.screenshot({ path: path.join(OUT, 'pa_v212_exbtn.png') });
  await browser.disconnect();
  killTree(proc.pid);
})().catch((e) => { console.error(e && e.message); process.exit(1); });
