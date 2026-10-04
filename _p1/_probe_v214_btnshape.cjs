/* v214 取证：本页「按钮都是胶囊式」到底指哪些元素 —— dump 实际 computed 值，
 * 并同时 dump 对照页（二级系统图 / 主站 index）的按钮，做同表对比。
 * 「胶囊度」= border-radius / (height/2)：≥1 就是纯胶囊（两端半圆），≥0.6 已经明显发圆。 */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const puppeteer = require('./_pptr.cjs');
const killTree = require('./_edge_kill.cjs');
const WS = 'C://Users//AHS//runye-irrigation';
const EDGE = 'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = path.join(WS, '_verify_out');
const PORT = 9695;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DUMP = `(function(sels, tag){
  var rows = [];
  sels.forEach(function(sel){
    document.querySelectorAll(sel).forEach(function(e){
      /* ★ 不能用对象当 key：DOM 元素转字符串全是 "[object HTMLButtonElement]" ⇒ 去重去成只剩 1 个 */
      if (e.__dumped) return; e.__dumped = 1;
      var r = e.getBoundingClientRect(); if (!r.width || !r.height) return;
      var cs = getComputedStyle(e);
      var br = parseFloat(cs.borderTopLeftRadius) || 0;
      var pill = br / (r.height / 2);
      rows.push({ page: tag, sel: sel, txt: (e.textContent||'').trim().replace(/\\s+/g,' ').slice(0,10),
        w: Math.round(r.width), h: Math.round(r.height), br: br,
        pill: +pill.toFixed(2), fs: cs.fontSize, pad: cs.padding });
    });
  });
  return rows;
})`;

(async () => {
  const proc = spawn(EDGE, ['--headless=new', '--allow-file-access-from-files',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(OUT, 'profile_v214'),
    '--no-first-run', '--window-size=1500,950', 'about:blank'], { stdio: 'ignore' });
  let browser = null;
  for (let i = 0; i < 40; i++) { try { browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:' + PORT, defaultViewport: null }); break; } catch (e) { await sleep(400); } }
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 950 });
  const open = async (rel) => { await page.goto('file:///' + encodeURI(path.join(WS, rel).replace(/\\/g, '/')), { waitUntil: 'load' }); await sleep(900); };

  /* ---------- 本页 ---------- */
  await open('管路接驳拼装.html');
  await page.click('#btnExample'); await sleep(500);
  /* 选中一根管 ⇒ 右栏出现 .pa-chip（属性面板） */
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
  const mine = await page.evaluate(DUMP + `(['.pa-toolbar button','.pa-lib-top button','.pa-btn','.pa-item','.pa-chip','.pa-status','.vw','button'], '拼装页')`);
  const inputs = await page.evaluate(DUMP + `(['.pa-field input','.pa-field select','.pa-toolbar','.pa-left .pa-pane-h'], '拼装页·输入/容器')`);
  /* 右键菜单里的条目也要量 */
  await page.mouse.click(hit.x, hit.y, { button: 'right' }); await sleep(400);
  const menu = await page.evaluate(DUMP + `(['.pa-menu .pa-chip','.pa-menu-i'], '拼装页·右键菜单')`);

  /* ---------- 对照页 ---------- */
  await open('二级系统图.html');
  const sys2 = await page.evaluate(DUMP + `(['.btn-line button','.no-print button','button'], '二级系统图')`);
  const sys2i = await page.evaluate(DUMP + `(['input','select'], '二级系统图·输入/容器')`);
  await open('index.html');
  const home = await page.evaluate(DUMP + `(['.btn','.ry-btn','button'], '主站 index')`);
  const homei = await page.evaluate(DUMP + `(['input','select'], '主站 index·输入/容器')`);

  const all = mine.concat(inputs, menu, sys2, sys2i, home, homei);
  const byPage = {};
  all.forEach((r) => { (byPage[r.page] = byPage[r.page] || []).push(r); });
  Object.keys(byPage).forEach((p) => {
    console.log('\n===== ' + p + ' =====');
    console.log('  文本/选择器'.padEnd(24) + ' 宽×高'.padEnd(12) + ' 圆角'.padEnd(8) + ' 胶囊度'.padEnd(9) + ' 字号');
    byPage[p].slice(0, 26).forEach((r) => {
      console.log('  ' + (r.txt || r.sel).slice(0, 22).padEnd(24) +
        (r.w + '×' + r.h).padEnd(12) + String(r.br).padEnd(8) +
        String(r.pill).padEnd(9) + r.fs + (r.pill >= 1 ? '   ← 纯胶囊' : (r.pill >= 0.6 ? '   ← 明显发圆' : '')));
    });
  });
  await browser.disconnect();
  killTree(proc.pid);
})().catch((e) => { console.error(e && e.message); killTree.sweepTestEdges(); process.exit(1); });
