/* _p1/_shot_v203_pa_style.cjs · [v203] 管路接驳拼装页风格统一 验证
 * 用户原话：「页面风格跟其他页面统一，两侧工具栏文字大小这些都跟其他页面统一。」
 * 验证：① 顶部 fn-nav 注入且「管路拼装」自动高亮（与其他页同源导航）；
 *       ② 关键 token 与主站侧栏口径一致（pane-h 11px、item 名 11.5px、输入框 24px/11.5px、
 *          按钮 24px、表头浅绿 #f2f7f4）；③ 功能不回归（载入示例 → 水力/材料/状态正常）；
 *       ④ 无 JS 报错；⑤ 截图。
 */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');

const WS = 'C:\\Users\\AHS\\runye-irrigation';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = path.join(WS, '_verify_out');
const PORT = 9529;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileUrl = (p) => 'file:///' + encodeURI(p.replace(/\\/g, '/'));

let pass = 0, fail = 0;
const check = (n, ok, extra) => { console.log((ok ? '  [PASS] ' : '  [FAIL] ') + n + (extra ? ' :: ' + extra : '')); ok ? pass++ : fail++; };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const proc = spawn(EDGE, [
    '--headless=new', '--allow-file-access-from-files', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(OUT, 'profile_v203'), '--no-first-run', '--no-default-browser-check',
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
  await page.goto(fileUrl(path.join(WS, '管路接驳拼装.html')), { waitUntil: 'load', timeout: 90000 });
  await sleep(1500);

  /* ① 导航同源 */
  const nav = await page.evaluate(() => {
    const links = Array.prototype.slice.call(document.querySelectorAll('.fn-nav .fn-link'));
    const act = links.filter((a) => a.classList.contains('active')).map((a) => a.textContent);
    return { count: links.length, labels: links.map((a) => a.textContent), act };
  });
  check('① 顶部导航由 runye-nav.js 注入（与其他页同一份清单）', nav.count >= 12, 'n=' + nav.count);
  check('② 「管路拼装」自动高亮', nav.act.indexOf('管路拼装') >= 0, JSON.stringify(nav.act));

  /* ② 样式 token 与主站口径一致 */
  const st = await page.evaluate(() => {
    const gs = (sel, prop) => { const e = document.querySelector(sel); return e ? getComputedStyle(e)[prop] : null; };
    return {
      paneH: gs('.pa-pane-h', 'fontSize'),
      paneHColor: gs('.pa-pane-h', 'color'),
      itemName: gs('.pa-item .nm', 'fontSize'),
      itemDs: gs('.pa-item .ds', 'fontSize'),
      btnH: gs('.pa-btn', 'height'),
      btnFs: gs('.pa-btn', 'fontSize'),
      inputH: gs('.pa-field input', 'height'),
      inputFs: gs('.pa-field input', 'fontSize'),
      leftBg: gs('.pa-left', 'backgroundImage'),
      thBg: gs('.pa-mat th', 'backgroundColor'),
      thColor: gs('.pa-mat th', 'color'),
      kvFs: gs('.pa-kv', 'fontSize')
    };
  });
  check('③ 分组标题 11px + 主站绿 #2f6d43', st.paneH === '11px' && st.paneHColor === 'rgb(47, 109, 67)', JSON.stringify({ f: st.paneH, c: st.paneHColor }));
  check('④ 素材名 11.5px / 说明 10.5px（原 13/11）', st.itemName === '11.5px' && st.itemDs === '10.5px', JSON.stringify({ nm: st.itemName, ds: st.itemDs }));
  check('⑤ 按钮高 24px / 11.5px（原约 33px/13px）', st.btnH === '24px' && st.btnFs === '11.5px', JSON.stringify({ h: st.btnH, f: st.btnFs }));
  check('⑥ 输入框高 24px / 11.5px（原约 35px/13px）', st.inputH === '24px' && st.inputFs === '11.5px', JSON.stringify({ h: st.inputH, f: st.inputFs }));
  check('⑦ 侧栏底 = 主站浅绿渐变（rgb 形式断言）', /248, 251, 249/.test(st.leftBg || '') && /242, 247, 244/.test(st.leftBg || ''), (st.leftBg || '').slice(0, 90));
  check('⑧ 表头浅绿 #f2f7f4 + 字 #475569（原实心绿底白字）', st.thBg === 'rgb(242, 247, 244)' && st.thColor === 'rgb(71, 85, 105)', JSON.stringify({ bg: st.thBg, c: st.thColor }));
  check('⑨ 键值行 ≤11.5px（标题条已撤，无 pa-sub 断言）', parseFloat(st.kvFs) <= 11.5, JSON.stringify({ kv: st.kvFs }));
  const hdr = await page.evaluate(() => ({
    headerGone: !document.querySelector('.pa-header'),
    statusInToolbar: !!(document.querySelector('.pa-toolbar #paStatus')),
    statusTxt: (document.getElementById('paStatusTxt') || {}).textContent || ''
  }));
  check('⑨b 品牌标题条已整行撤掉（v204）', hdr.headerGone);
  check('⑨c 状态徽标在画布工具条里（id 不变，JS 零改动）', hdr.statusInToolbar && hdr.statusTxt.length > 0, hdr.statusTxt);

  /* ③ 功能不回归 */
  await page.evaluate(() => document.getElementById('btnExample').click());
  await sleep(700);
  const fn = await page.evaluate(() => ({
    comps: document.querySelectorAll('#paSvg .pa-comp').length,
    tot: document.getElementById('rTot').textContent,
    mat: (document.getElementById('matTable').querySelector('tbody').textContent || '').slice(0, 40),
    status: document.getElementById('paStatusTxt').textContent,
    zoom: document.getElementById('paZoomTxt').textContent
  }));
  check('⑩ 载入示例仍出图（5 个管件）', fn.comps === 5, 'comps=' + fn.comps);
  check('⑪ 水力合计有数值', /^\d+(\.\d+)? m$/.test(fn.tot), 'ΔH=' + fn.tot);
  check('⑫ 材料清单有行', fn.mat.indexOf('直管') >= 0, fn.mat);
  check('⑬ 头部状态正常', fn.status.length > 0, fn.status);

  check('⑭ 全程无 JS 报错', errs.length === 0, errs.join('|').slice(0, 160));

  await page.screenshot({ path: path.join(OUT, 'pa_v203_style.png') });
  console.log('[shot] _verify_out/pa_v203_style.png');

  console.log('\n==== v203 风格统一复现：PASS ' + pass + ' / FAIL ' + fail + ' ====');
  await browser.disconnect(); proc.kill();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('[FATAL]', e.message); process.exit(1); });
