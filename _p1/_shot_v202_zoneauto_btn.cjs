/* _p1/_shot_v202_zoneauto_btn.cjs · [v202] 「地块划分」checkbox → 切换按钮
 * 用户原话：「这个按钮跟这个面板上的其他按钮一样，点击执行，不要勾选，勾选的话 整体看起来不统一。」
 * 验证：① 控件存在且是按钮（不再是 checkbox）；② 点击切换 ppState.zoneAuto 与
 *   分区数联动（v189 语义：关=整块 1 区）；③ active 高亮/文案/琥珀关闭态；
 *   ④ localStorage 持久化 + reload 保持；⑤ 无 JS 报错；⑥ 截图供样式统一性比对。
 */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');

const WS = 'C:\\Users\\AHS\\runye-irrigation';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = path.join(WS, '_verify_out');
const PORT = 9523;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileUrl = (p) => 'file:///' + p.replace(/\\/g, '/');

let pass = 0, fail = 0;
const check = (n, ok, extra) => { console.log((ok ? '  [PASS] ' : '  [FAIL] ') + n + (extra ? ' :: ' + extra : '')); ok ? pass++ : fail++; };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const proc = spawn(EDGE, [
    '--headless=new', '--allow-file-access-from-files', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(OUT, 'profile_v202'), '--no-first-run', '--no-default-browser-check',
    '--window-size=1500,950', 'about:blank'
  ], { stdio: 'ignore' });
  let browser = null;
  for (let i = 0; i < 50; i++) {
    try { browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:' + PORT, defaultViewport: null }); break; }
    catch (e) { await sleep(400); }
  }
  if (!browser) { console.error('Edge connect failed'); proc.kill(); process.exit(1); }
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.setViewport({ width: 1500, height: 950 });
  await page.goto(fileUrl(path.join(WS, 'index.html')), { waitUntil: 'load', timeout: 90000 });
  await sleep(1200);
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) { } });
  await page.reload({ waitUntil: 'load' });
  await sleep(1500);

  /* 给一个有效地块（单块 300×400），让二级页有分区可算 */
  await page.evaluate(() => {
    window.measuredArea = 300 * 400;
    window.measuredPolygon = [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 400 }, { x: 0, y: 400 }];
    try { window.ppLoadPolygon(); } catch (e) { }
    try { window.ryShowSection(document.getElementById('pipePlanSection'), null); } catch (e) { }
  });
  await sleep(800);

  const zoneN = () => page.evaluate(() => {
    const c = window.RunyeBridge.getZoneCuts();
    return c ? c.cols * c.rows : null;
  });

  /* ① 控件形态 */
  const s0 = await page.evaluate(() => {
    const btn = document.getElementById('ppZoneAutoBtn');
    return {
      hasBtn: !!btn, isButton: !!btn && btn.tagName === 'BUTTON',
      chkGone: !document.getElementById('ppZoneAutoChk'),
      labelGone: !document.querySelector('#pipePlanSection .pp-toolbar .pp-check-label'),
      active: !!btn && btn.classList.contains('active'),
      txt: btn ? btn.textContent : '',
      stored: localStorage.getItem('runye_zone_auto')
    };
  });
  check('① 控件是按钮 #ppZoneAutoBtn（不再是 checkbox）', s0.isButton && s0.chkGone, JSON.stringify(s0));
  check('② 工具栏里没有残留的勾选 label', s0.labelGone);
  check('③ 默认开启：active 高亮 + 文案「地块划分」', s0.active && s0.txt === '地块划分', s0.txt);
  const nOn = await zoneN();
  check('④ 开启时分区数 > 1', (nOn || 0) > 1, 'zones=' + nOn);

  /* ⑤ 点击 → 关闭 */
  await page.evaluate(() => document.getElementById('ppZoneAutoBtn').click());
  await sleep(500);
  const s1 = await page.evaluate(() => ({
    on: window.ppZoneAutoOn(),
    active: document.getElementById('ppZoneAutoBtn').classList.contains('active'),
    txt: document.getElementById('ppZoneAutoBtn').textContent,
    stored: localStorage.getItem('runye_zone_auto'),
    bodyOff: document.body.classList.contains('ry-zoneauto-off')
  }));
  const nOff = await zoneN();
  check('⑤ 点击后关闭：文案「地块不划分」+ 去 active + 落库', !s1.on && !s1.active && s1.txt === '地块不划分' && s1.stored === '0', JSON.stringify(s1));
  check('⑥ v189 语义联动：关闭后整块 1 区', nOff === 1, 'zones=' + nOff);
  check('⑦ body.ry-zoneauto-off 兜底类已挂', s1.bodyOff);

  /* ⑧ 再点 → 恢复 */
  await page.evaluate(() => document.getElementById('ppZoneAutoBtn').click());
  await sleep(500);
  const nOn2 = await zoneN();
  const s2 = await page.evaluate(() => ({
    on: window.ppZoneAutoOn(), txt: document.getElementById('ppZoneAutoBtn').textContent,
    stored: localStorage.getItem('runye_zone_auto')
  }));
  check('⑧ 再点恢复自动划分（分区数回来 + 落库 1）', s2.on && s2.txt === '地块划分' && s2.stored === '1' && nOn2 === nOn, 'zones=' + nOn2);

  /* ⑨ 持久化：关掉 → reload → 仍是关 */
  await page.evaluate(() => document.getElementById('ppZoneAutoBtn').click());
  await sleep(300);
  await page.reload({ waitUntil: 'load' });
  await sleep(1500);
  const s3 = await page.evaluate(() => ({
    on: window.ppZoneAutoOn(),
    active: !!(document.getElementById('ppZoneAutoBtn') && document.getElementById('ppZoneAutoBtn').classList.contains('active')),
    txt: document.getElementById('ppZoneAutoBtn') ? document.getElementById('ppZoneAutoBtn').textContent : ''
  }));
  check('⑨ 刷新后保持关闭态（active/文案同步）', !s3.on && !s3.active && s3.txt === '地块不划分', JSON.stringify(s3));

  check('⑩ 全程无 JS 报错', errs.length === 0, errs.join('|').slice(0, 160));

  /* 截图：恢复开启态再截（与面板其它按钮比对样式统一性）。
     ★ reload 后会回到默认页且内存里的地块已丢 ⇒ 先重建地块、切到二级管路页再截。 */
  await page.evaluate(() => {
    window.measuredArea = 300 * 400;
    window.measuredPolygon = [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 400 }, { x: 0, y: 400 }];
    try { window.ppLoadPolygon(); } catch (e) { }
    try { window.ryShowSection(document.getElementById('pipePlanSection'), null); } catch (e) { }
  });
  await sleep(600);
  await page.evaluate(() => { try { window.ppSetZoneAuto(true); } catch (e) { } });
  await sleep(600);
  await page.screenshot({ path: path.join(OUT, 'grv202_zoneauto_btn.png') });
  /* 关闭态也截一张（琥珀描边） */
  await page.evaluate(() => { try { window.ppSetZoneAuto(false); } catch (e) { } });
  await sleep(600);
  await page.screenshot({ path: path.join(OUT, 'grv202_zoneauto_off.png') });
  console.log('[shot] _verify_out/grv202_zoneauto_btn.png  _verify_out/grv202_zoneauto_off.png');

  console.log('\n==== v202 切换按钮复现：PASS ' + pass + ' / FAIL ' + fail + ' ====');
  await browser.disconnect(); proc.kill();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('[FATAL]', e.message); process.exit(1); });
