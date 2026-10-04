/* _p1/_shot_v214_btnshape.cjs · [v214] 按钮形状与其他页统一 验证
 * 用户原话：「现在管路拼接页面 的按钮 都是胶囊式的，跟其他页面不统一 都统一吧」
 *
 * 取证（_probe_v214_btnshape.cjs 实测）：
 *   本页 .pa-btn  8px 圆角 / 24px 高 ⇒ 圆角÷半高 = 0.67（明显发圆，用户说的"胶囊"）；
 *   二级系统图 / 主站 index 的按钮 border-radius **全是 0**（直角方钮）。
 *   ⇒ 统一方向：把本页「按钮族」改直角，跟着对照页走。
 *
 * 断言覆盖三件事，缺一不可：
 *   ① 真改了（圆角 0、胶囊度 < 0.2）；
 *   ② 没改过头（面板容器/圆点指示灯不该被顺手改成直角）；
 *   ③ 跨页口径真的对齐（拿二级系统图当基准，不是凭记忆写死数字）。
 */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const puppeteer = require('./_pptr.cjs');
const killTree = require('./_edge_kill.cjs');

const WS = 'C:\\Users\\AHS\\runye-irrigation';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = path.join(WS, '_verify_out');
/* ★ PA_PAGE / PA_PORT / PA_TAG 是注入体检的接入口：不读它们，注入的坏副本永远打不开，
   体检会拿**原文件**跑一遍 ⇒ 全绿 ⇒ 闸门形同虚设（v214 实测 0/6 就是这么来的）。 */
const PORT = parseInt(process.env.PA_PORT || '9541', 10);
const PAGE = process.env.PA_PAGE || '管路接驳拼装.html';
const TAG = process.env.PA_TAG || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileUrl = (p) => 'file:///' + encodeURI(p.replace(/\\/g, '/'));

let pass = 0, fail = 0;
const check = (n, ok, extra) => { console.log((ok ? '  [PASS] ' : '  [FAIL] ') + n + (extra ? ' :: ' + extra : '')); ok ? pass++ : fail++; };

/* 量一批元素的圆角 + 胶囊度（圆角 ÷ 半高） */
const SCAN = `(function(sel){
  var rows = [];
  document.querySelectorAll(sel).forEach(function(e){
    var r = e.getBoundingClientRect(); if (!r.width || !r.height) return;
    var br = parseFloat(getComputedStyle(e).borderTopLeftRadius) || 0;
    rows.push({ t:(e.textContent||'').trim().replace(/\\s+/g,' ').slice(0,8),
      br: br, h: Math.round(r.height), pill: +(br / (r.height/2)).toFixed(2) });
  });
  return rows;
})`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const proc = spawn(EDGE, ['--headless=new', '--allow-file-access-from-files',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(OUT, 'profile_v214' + TAG),
    '--no-first-run', '--no-default-browser-check', '--window-size=1500,950', 'about:blank'], { stdio: 'ignore' });
  let browser = null;
  for (let i = 0; i < 50; i++) {
    try { browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:' + PORT, defaultViewport: null }); break; }
    catch (e) { await sleep(400); }
  }
  if (!browser) { console.error('Edge connect failed'); killTree(proc.pid); process.exit(1); }
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.setViewport({ width: 1500, height: 950 });
  await page.goto(fileUrl(path.join(WS, PAGE)), { waitUntil: 'load', timeout: 90000 });
  await sleep(1200);
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) { } });
  await page.reload({ waitUntil: 'load' });
  await sleep(1400);
  await page.click('#btnExample'); await sleep(500);

  /* ---------- ① 工具条 / 左栏 CTA 按钮 ---------- */
  const tb = await page.evaluate(SCAN + `('.pa-toolbar .pa-btn')`);
  const cta = await page.evaluate(SCAN + `('.pa-lib-top .pa-btn')`);
  check('① 画布工具条按钮全部直角（border-radius=0）',
    tb.length > 0 && tb.every((r) => r.br === 0),
    'n=' + tb.length + ' 圆角=' + JSON.stringify(tb.map((r) => r.br).filter((v, i, a) => a.indexOf(v) === i)));
  check('①b 工具条按钮不再发圆（圆角÷半高 < 0.2，改前实测 0.67）',
    tb.every((r) => r.pill < 0.2), 'max=' + Math.max.apply(null, tb.map((r) => r.pill)));
  check('② 左栏「⚡ 载入示例管路」大按钮同样直角',
    cta.length > 0 && cta.every((r) => r.br === 0), 'n=' + cta.length);

  /* ---------- 选中一根管 ⇒ 右栏属性面板出 chip ---------- */
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
  const selOk = await page.evaluate(() => !!window.RyPipeAssembler.getSel());
  check('③ 前置：已选中一根管（右栏属性面板出 chip）', selOk);
  const rc = await page.evaluate(SCAN + `('.pa-r-scroll .pa-chip')`);
  check('④ 右栏口径/管长 chip 全部直角', rc.length > 0 && rc.every((r) => r.br === 0),
    'n=' + rc.length + ' 圆角=' + JSON.stringify(rc.map((r) => r.br).filter((v, i, a) => a.indexOf(v) === i)));

  /* ---------- 右键菜单里的 chip 与菜单项 ---------- */
  await page.mouse.click(hit.x, hit.y, { button: 'right' }); await sleep(400);
  const mc = await page.evaluate(SCAN + `('.pa-menu .pa-chip')`);
  const mi = await page.evaluate(SCAN + `('.pa-menu-i')`);
  check('⑤ 右键菜单里的管径 / 方向轴 chip 全部直角', mc.length > 0 && mc.every((r) => r.br === 0), 'n=' + mc.length);
  check('⑥ 右键菜单条目（换选型/复制/删除）全部直角', mi.length > 0 && mi.every((r) => r.br === 0), 'n=' + mi.length);
  await page.keyboard.press('Escape'); await sleep(200);

  /* ---------- 状态徽标（原先是 999px 纯胶囊，最扎眼） ---------- */
  const stt = await page.evaluate(SCAN + `('.pa-status')`);
  check('⑦ 工具条右端状态徽标不再是胶囊（999px → 直角）',
    stt.length === 0 || stt.every((r) => r.br === 0), JSON.stringify(stt));
  /* 反向：徽标里的圆点指示灯是 50% 圆形，不该被顺手改成直角 */
  const dot = await page.evaluate(() => {
    const e = document.querySelector('.pa-status .dot');
    if (!e) return null; const cs = getComputedStyle(e);
    return { br: cs.borderTopLeftRadius, w: Math.round(e.getBoundingClientRect().width) };
  });
  check('⑧ 反向：徽标里的圆点指示灯仍是圆的（不是按钮，不该被误伤）',
    !dot || parseFloat(dot.br) >= dot.w / 2 - 0.5, JSON.stringify(dot));

  /* ---------- 反向：面板/容器不该被改成直角 ---------- */
  const keep = await page.evaluate(() => {
    const g = (sel) => { const e = document.querySelector(sel); return e ? parseFloat(getComputedStyle(e).borderTopLeftRadius) : null; };
    return { menu: g('.pa-menu'), toolbar: g('.pa-toolbar'), mat: g('.pa-mat'), input: g('.pa-field input') };
  });
  check('⑨ 反向：面板/容器/输入框保持原有圆角（只动按钮族，不过度改动）',
    keep.toolbar > 0 && keep.input > 0, JSON.stringify(keep));

  /* ---------- 跨页口径基准：拿二级系统图当基准，不是凭记忆写死数字 ---------- */
  await page.goto(fileUrl(path.join(WS, '二级系统图.html')), { waitUntil: 'load', timeout: 90000 });
  await sleep(1200);
  const ref = await page.evaluate(SCAN + `('.btn-line button, .no-print button')`);
  const refBr = ref.length ? ref[0].br : null;
  check('⑩ 跨页一致：本页按钮圆角 = 二级系统图按钮圆角（口径基准实测 ' + refBr + 'px）',
    ref.length > 0 && tb.length > 0 && refBr === tb[0].br,
    '本页=' + (tb[0] && tb[0].br) + ' 对照页=' + refBr);

  await page.goto(fileUrl(path.join(WS, PAGE)), { waitUntil: 'load', timeout: 90000 });
  await sleep(1200);
  await page.click('#btnExample'); await sleep(500);
  check('⑪ 全程无 JS 报错', errs.length === 0, errs.slice(0, 2).join(' | '));
  await page.screenshot({ path: path.join(OUT, 'pa_v214_btnshape.png') });
  console.log('[shot] _verify_out/pa_v214_btnshape.png');
  console.log('\n=== 汇总：' + pass + ' 通过 / ' + fail + ' 失败 ===');
  await browser.disconnect();
  killTree(proc.pid);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error('EXCEPTION: ' + (e && e.message)); killTree.sweepTestEdges(); process.exit(1); });
