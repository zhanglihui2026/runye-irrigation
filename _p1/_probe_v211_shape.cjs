/* v211 画廓尺寸确认：载入示例 + 拖一个三通进来看比例 */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const puppeteer = require('puppeteer-core');
const killTree = require('./_edge_kill.cjs');
const WS = 'C://Users//AHS//runye-irrigation';
const EDGE = 'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = path.join(WS, '_verify_out');
const PORT = 9690;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const proc = spawn(EDGE, ['--headless=new', '--allow-file-access-from-files',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(OUT, 'profile_v211'),
    '--no-first-run', '--window-size=1500,950', 'about:blank'], { stdio: 'ignore' });
  let browser = null;
  for (let i = 0; i < 40; i++) { try { browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:' + PORT, defaultViewport: null }); break; } catch (e) { await sleep(400); } }
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 950 });
  await page.goto('file:///' + encodeURI(path.join(WS, '管路接驳拼装.html').replace(/\\/g, '/')), { waitUntil: 'load' });
  await sleep(900);
  await page.click('#btnExample');
  await sleep(600);
  /* 从左侧素材库点一个三通，看它与已有管件的比例 */
  await page.click('.pa-item[data-add="tee"]');
  await sleep(400);
  await page.click('#btnFit');
  await sleep(500);
  const geo = await page.evaluate(() => {
    const API = window.RyPipeAssembler;
    const cs = API.getComps(), t = cs.filter((c) => c.kind === 'tee')[0];
    const e = cs.filter((c) => c.kind === 'elbow90')[0];
    const r = (id, s) => API.portPosOf(id, s);
    return {
      teeMain: t ? Math.hypot(r(t.id, 'R').x - r(t.id, 'L').x, r(t.id, 'R').y - r(t.id, 'L').y) : null,
      teeBranch: t ? Math.hypot(r(t.id, 'B').x - r(t.id, 'L').x, r(t.id, 'B').y - r(t.id, 'L').y) : null,
      elbowLegs: e ? [Math.abs(r(e.id, 'R').x - r(e.id, 'L').x), Math.abs(r(e.id, 'R').y - r(e.id, 'L').y)] : null
    };
  });
  console.log('几何：', JSON.stringify(geo));
  await page.screenshot({ path: path.join(OUT, 'pa_v211_shape.png') });
  await browser.disconnect();
  killTree(proc.pid);
})().catch((e) => { console.error(e && e.message); process.exit(1); });
