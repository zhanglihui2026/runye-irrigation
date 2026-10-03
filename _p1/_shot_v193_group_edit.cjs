/* v193 成组编辑「整组 / 逐块」切换 · 真渲染截图（仅目检用，不做断言）
 * 用法：node _p1/_shot_v193_group_edit.cjs
 * 产出：_verify_out/v193_whole.png / v193_perplot.png
 */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');

const WS = 'C:\\Users\\AHS\\runye-irrigation';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = path.join(WS, '_verify_out');
const PORT = 9481;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileUrl = (p) => 'file:///' + p.replace(/\\/g, '/');

const FIX = {
  frame: [{ x: 0, y: 0 }, { x: 630, y: 0 }, { x: 630, y: 400 }, { x: 0, y: 400 }],
  rings: [
    [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 400 }, { x: 0, y: 400 }],
    [{ x: 330, y: 0 }, { x: 630, y: 0 }, { x: 630, y: 400 }, { x: 330, y: 400 }]
  ]
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const proc = spawn(EDGE, [
    '--headless=new', '--allow-file-access-from-files',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(OUT, 'profile_shot193'),
    '--no-first-run', '--no-default-browser-check',
    '--window-size=1500,950', 'about:blank',
  ], { stdio: 'ignore' });
  let browser = null;
  for (let i = 0; i < 50; i++) {
    try { browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:' + PORT, defaultViewport: null }); break; }
    catch (e) { await sleep(400); }
  }
  if (!browser) { console.error('connect failed'); proc.kill(); process.exit(1); }
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => { window.alert = function () {}; window.confirm = function () { return true; }; });
  await page.setViewport({ width: 1500, height: 950 });
  await page.goto(fileUrl(path.join(WS, 'index.html')), { waitUntil: 'load', timeout: 90000 });
  await sleep(1500);
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload({ waitUntil: 'load' });
  await sleep(1500);

  await page.evaluate(() => {
    try { window.ryShowSection(document.getElementById('pipePlanSection'), null); } catch (e) {}
  });
  await sleep(900);

  await page.evaluate((FIX) => {
    window.measuredPolygon = FIX.frame.map((p) => ({ x: p.x, y: p.y }));
    window.measuredArea = 240000; window.measuredPolygonSource = 'map';
    window.__runyeSubPlots = FIX.rings.map(function (r, i) {
      return { id: 'sub' + (i + 1), name: '子地块' + (i + 1), mu: 180, sqm: 120000,
        crop: '七彩花生', polyLatLng: [], center: null, poly: r.map((q) => ({ x: q.x, y: q.y })) };
    });
    if (typeof window.ppLoadPolygon === 'function') window.ppLoadPolygon();
    if (typeof window.ppSetZoneAuto === 'function') window.ppSetZoneAuto(true);
    if (typeof window.ppRender === 'function') window.ppRender();
  }, FIX);
  await sleep(900);

  /* 整组态：两块都画 */
  /* 整组态也导一张画布位图 */
  const sample = () => page.evaluate(() => {
    const g = window.__ge || null;
    /* 独立实现采样（shot 脚本不依赖探针注入的 __ge） */
    const c = document.getElementById('ppCanvas');
    const st = window.RunyeBridge.state, t = st.transform;
    const px = (mx, my) => {
      const x = Math.round((mx - t.minX) * t.scaleX * t.scale + t.offsetX + (st.panX || 0));
      const y = Math.round((my - t.minY) * t.scaleY * t.scale + t.offsetY + (st.panY || 0));
      if (x < 0 || y < 0 || x >= c.width || y >= c.height) return null;
      const d = c.getContext('2d').getImageData(x, y, 1, 1).data;
      return [d[0], d[1], d[2]];
    };
    const bgd = c.getContext('2d').getImageData(4, 4, 1, 1).data;
    const bg = [bgd[0], bgd[1], bgd[2]];
    const d = (a) => a ? Math.sqrt((a[0] - bg[0]) ** 2 + (a[1] - bg[1]) ** 2 + (a[2] - bg[2]) ** 2).toFixed(1) : '?';
    const A = px(150, 200), B = px(480, 200);
    return { mode: window.__runyeGroupEdit.mode, cur: window.__runyeGroupEdit.current,
             polyPts: window.RunyeBridge.state.polyPts.length,
             dA: d(A), dB: d(B) };
  });
  console.log('[whole] ' + JSON.stringify(await sample()));
  await page.screenshot({ path: path.join(OUT, 'v193_whole.png') });
  /* 逐块态：只画当前块 + 工具栏出现下拉 */
  await page.evaluate(async () => {
    document.getElementById('ppGePerPlot').click();
    await new Promise((r) => setTimeout(r, 600));
  });
  console.log('[perplot] ' + JSON.stringify(await sample()));
  await page.screenshot({ path: path.join(OUT, 'v193_perplot.png') });
  /* 导出画布**原始位图**（不经截图缩放，肉眼看最准） */
  const dump = async (name) => {
    const data = await page.evaluate(() => document.getElementById('ppCanvas').toDataURL('image/png'));
    fs.writeFileSync(path.join(OUT, name), Buffer.from(data.split(',')[1], 'base64'));
  };
  await dump('v193_canvas_perplot.png');

  const info = await page.evaluate(() => {
    const w = document.getElementById('ppGroupEditWrap');
    const r = w ? w.getBoundingClientRect() : null;
    return { mode: window.__runyeGroupEdit.mode, wrap: r ? { w: Math.round(r.width), h: Math.round(r.height) } : null };
  });
  console.log('[shot] ' + JSON.stringify(info));
  console.log('[shot] → ' + path.join(OUT, 'v193_whole.png') + ' / ' + path.join(OUT, 'v193_perplot.png'));

  try { await browser.disconnect(); } catch (e) {}
  try { proc.kill(); } catch (e) {}
  process.exit(0);
})().catch((e) => { console.error('[FATAL] ' + (e && e.stack || e)); process.exit(1); });
