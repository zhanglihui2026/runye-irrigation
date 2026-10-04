/* v214：按钮形状改前/改后对比图（同机同参，唯一变量是 CSS 圆角） */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const puppeteer = require('./_pptr.cjs');
const killTree = require('./_edge_kill.cjs');
const WS = 'C://Users//AHS//runye-irrigation';
const EDGE = 'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = path.join(WS, '_verify_out');
const PORT = 9696;
const FILE = process.argv[2] || 'pa_v214_after.png';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const proc = spawn(EDGE, ['--headless=new', '--allow-file-access-from-files',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(OUT, 'profile_v214s'),
    '--no-first-run', '--window-size=1500,950', 'about:blank'], { stdio: 'ignore' });
  let browser = null;
  for (let i = 0; i < 40; i++) { try { browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:' + PORT, defaultViewport: null }); break; } catch (e) { await sleep(400); } }
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 950 });
  await page.goto('file:///' + encodeURI(path.join(WS, '管路接驳拼装.html').replace(/\\/g, '/')), { waitUntil: 'load' });
  await sleep(800);
  await page.click('#btnExample'); await sleep(500);
  /* 选中一根管 ⇒ 右栏属性面板出 chip；再开一次右键菜单 */
  await page.evaluate(() => {
    const A = window.RyPipeAssembler, c = A.getComps()[0];
    const m = document.querySelector('.pa-comp[data-id="' + c.id + '"] .pa-main');
    const svg = m.ownerSVGElement; let ux, uy;
    if (m.tagName.toLowerCase() === 'line') { ux = (+m.getAttribute('x1') + +m.getAttribute('x2')) / 2; uy = (+m.getAttribute('y1') + +m.getAttribute('y2')) / 2; }
    else { const p0 = m.getPointAtLength(m.getTotalLength() / 2); ux = p0.x; uy = p0.y; }
    const pt = svg.createSVGPoint(); pt.x = ux; pt.y = uy;
    const sp = pt.matrixTransform(m.getScreenCTM());
    window.__hit = { x: sp.x, y: sp.y };
  });
  const hit = await page.evaluate(() => window.__hit);
  await page.mouse.click(hit.x, hit.y); await sleep(400);
  await page.mouse.click(hit.x, hit.y, { button: 'right' }); await sleep(400);
  await page.screenshot({ path: path.join(OUT, FILE) });
  console.log('[shot] _verify_out/' + FILE);
  await browser.disconnect();
  killTree(proc.pid);
})().catch((e) => { console.error(e && e.message); killTree.sweepTestEdges(); process.exit(1); });
