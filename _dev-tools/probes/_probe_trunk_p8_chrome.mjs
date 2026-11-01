'use strict';
/* _probe_trunk_p8_chrome.mjs —— v855-panel-drag-fold：总管参数面板可拖动 + 可折叠
 *
 * 判据落在 DOM 可观测值与 localStorage，不靠截图猜：
 *   ① 折叠按钮存在（▾），点一下 is-folded + tp-body 隐藏 + localStorage=1，再点还原
 *   ② 折叠/关闭按钮不触发拖拽（点完位置不动）
 *   ③ 按住标题栏拖动：inline left/top 接管（right/bottom=auto）、范围钳在宿主内、
 *     is-dragging 拖中在/拖完无、localStorage.ryTrunkPanelPos 与最终位置一致
 *   ④ 刷新后重新进编辑态：位置与折叠状态都恢复
 *   ⑤ 全程无 pageerror；折叠态下 tp* 控件仍取得到（refresh 不报错）
 *
 * 用法：node _dev-tools/probes/_probe_trunk_p8_chrome.mjs   （cwd = 仓库根）
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import fs from 'node:fs';
import path from 'node:path';
const { chromium } = require('playwright');

const ROOT = process.cwd();
const EDGE = [process.env.EDGE_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].filter(Boolean).find(p => fs.existsSync(p));
const APP = process.env.PROBE_URL
  || ('file:///' + path.join(ROOT, 'index.html').split(path.sep).join('/') + '?full=1&rymock=L2#onlineMapSection');

const RING = [[18.2500, 109.5180], [18.2500, 109.5230], [18.2520, 109.5230], [18.2520, 109.5180]];
const T1_PTS = [[18.2505, 109.5190], [18.25085, 109.5205], [18.2505, 109.5220]];

const PLOTS = [
  { id: 'p8-a', name: 'P8-A', sqm: 12000, mu: 18, ts: 300, areaM2: 12000, source: 'map',
    polyLatLng: RING,
    trunk: { schema: 2, source: 'map', coordinateSystem: 'GCJ-02', revision: 1, trunks: [
      { id: 'T1', main: true, points: T1_PTS, params: { material: 'PE', dn: 110, designFlow: 30, code: 'ZG-201' } },
    ] } },
];

const out = [];
const rec = (label, ok, detail) => {
  out.push([label, ok, detail]);
  console.log((ok ? '  OK   ' : '  FAIL ') + label + (detail ? '  ' + detail : ''));
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  if (!EDGE) { console.log('找不到 Microsoft Edge'); process.exitCode = 1; return; }
  const browser = await chromium.launch({ channel: 'msedge', headless: true, executablePath: EDGE,
    args: ['--allow-file-access-from-files', '--no-first-run', '--no-default-browser-check'] });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, serviceWorkers: 'block' });
  if (!process.env.PROBE_URL) await context.route(/^https?:\/\//, r => r.abort());
  await context.addInitScript(plots => {
    if (!localStorage.getItem('__p8_seed')) {
      localStorage.setItem('runye_plot_library', JSON.stringify(plots));
      localStorage.setItem('runyeLocalAdminSession', '1');
      localStorage.setItem('__p8_seed', '1');
    }
  }, PLOTS);

  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(''); } catch (e) { } });

  const killMask = () => page.evaluate(() => {
    if (document.getElementById('__probe_mask_kill')) return;
    const st = document.createElement('style');
    st.id = '__probe_mask_kill';
    st.textContent = '[class*="ry-ann"]{display:none!important;pointer-events:none!important}';
    document.head.appendChild(st);
  });

  /* 进地块 → 进总管编辑态（面板延迟创建，第一次显示才建） */
  async function openPanel() {
    await page.locator('#myPlotList .place-item[data-plot-id="p8-a"] .place-go').click();
    await sleep(1000);
    await page.locator('#btnEditTrunk').click();
    await sleep(900);
    await page.waitForSelector('#trunkPropPanel', { timeout: 15000 });
    await page.waitForFunction(() => {
      const el = document.getElementById('trunkPropPanel');
      return el && !el.hidden;
    }, null, { timeout: 15000 });
  }
  const chrome = () => page.evaluate(() => {
    const el = document.getElementById('trunkPropPanel');
    if (!el) return { exists: false };
    const body = el.querySelector('.tp-body');
    const foot = el.querySelector('.tp-foot');
    const st = n => n ? getComputedStyle(n).display : null;
    const r = el.getBoundingClientRect();
    return {
      exists: true, hidden: el.hidden,
      folded: el.classList.contains('is-folded'),
      dragging: el.classList.contains('is-dragging'),
      foldTxt: (el.querySelector('#tpFold') || {}).textContent,
      foldTitle: (el.querySelector('#tpFold') || {}).title,
      bodyDisp: st(body), footDisp: st(foot),
      bodyVisible: !!(body && body.offsetHeight > 0),
      styleLeft: el.style.left, styleTop: el.style.top,
      styleRight: el.style.right, styleBottom: el.style.bottom,
      pos: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
      lsFold: localStorage.getItem('ryTrunkPanelFolded'),
      lsPos: localStorage.getItem('ryTrunkPanelPos')
    };
  });

  await page.goto(APP, { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction(() => window.RyMapHost && window.RyTrunkSchema && window.RyTrunkPanel, null, { timeout: 30000 });
  await killMask();
  await sleep(900);
  await openPanel();

  /* ---------- C 折叠 ---------- */
  let c = await chrome();
  rec('C1 折叠按钮存在、初始 ▾/未折叠', c.exists && c.foldTxt === '▾' && !c.folded && c.bodyVisible,
    JSON.stringify({ foldTxt: c.foldTxt, folded: c.folded, bodyVisible: c.bodyVisible }));

  await page.locator('#trunkPropPanel #tpFold').click();
  await sleep(150);
  c = await chrome();
  rec('C2 点折叠 ⇒ is-folded + body/foot 隐藏 + localStorage=1',
    c.folded && c.foldTxt === '▸' && c.bodyDisp === 'none' && c.footDisp === 'none' && c.lsFold === '1',
    JSON.stringify({ folded: c.folded, bodyDisp: c.bodyDisp, footDisp: c.footDisp, lsFold: c.lsFold }));

  const posBeforeFoldClick = c.pos;
  await page.locator('#trunkPropPanel #tpFold').click();
  await sleep(150);
  c = await chrome();
  rec('C3 再点还原展开 + localStorage=0',
    !c.folded && c.foldTxt === '▾' && c.bodyDisp !== 'none' && c.lsFold === '0',
    JSON.stringify({ folded: c.folded, bodyDisp: c.bodyDisp, lsFold: c.lsFold }));

  /* ---------- D 拖拽 ---------- */
  /* D1 点折叠按钮不该拖动面板：记位置 → 点 → 位置不变 */
  const elBox = await page.locator('#trunkPropPanel').boundingBox();
  const pos0 = c.pos;
  await page.locator('#trunkPropPanel #tpFold').click();
  await sleep(120);
  await page.locator('#trunkPropPanel #tpFold').click(); /* 折了再展开，顺带证「点按钮不拖动」 */
  await sleep(120);
  c = await chrome();
  rec('D1 点折叠/展开按钮不触发拖拽（位置不动、无 inline left）',
    c.styleLeft === '' && c.styleTop === '' && c.pos.x === pos0.x && c.pos.y === pos0.y,
    JSON.stringify({ styleLeft: c.styleLeft, pos: c.pos, pos0 }));

  /* D2 按住标题栏拖动（Mouse 事件在 Chromium 会派生 Pointer 事件） */
  const headBox = await page.locator('#trunkPropPanel .tp-head').boundingBox();
  const hx = headBox.x + headBox.width / 2, hy = headBox.y + headBox.height / 2;
  await page.mouse.move(hx, hy);
  await page.mouse.down();
  await page.mouse.move(hx - 200, hy - 150, { steps: 8 });
  await sleep(60);
  let mid = await chrome();
  const draggingSeen = mid.dragging;
  await page.mouse.move(hx - 300, hy - 180, { steps: 4 });
  await page.mouse.up();
  await sleep(150);
  const d2 = await chrome();
  rec('D2 拖动后 inline left/top 接管、right/bottom 清空',
    d2.styleLeft !== '' && d2.styleTop !== '' && d2.styleRight === 'auto' && d2.styleBottom === 'auto',
    JSON.stringify({ left: d2.styleLeft, top: d2.styleTop, right: d2.styleRight, bottom: d2.styleBottom }));
  rec('D3 拖动中出现过 is-dragging、结束后移除', draggingSeen && !d2.dragging,
    JSON.stringify({ draggingSeen, draggingNow: d2.dragging }));
  rec('D4 位置确实移动了', d2.pos.x !== pos0.x && d2.pos.y !== pos0.y,
    JSON.stringify({ from: pos0, to: d2.pos }));
  const lsPos = d2.lsPos ? JSON.parse(d2.lsPos) : null;
  rec('D5 localStorage.ryTrunkPanelPos 与面板最终位置一致',
    lsPos && Math.abs(lsPos.x - parseFloat(d2.styleLeft)) < 1 && Math.abs(lsPos.y - parseFloat(d2.styleTop)) < 1,
    JSON.stringify({ lsPos, left: d2.styleLeft, top: d2.styleTop }));

  /* ---------- E 刷新恢复 ---------- */
  /* 折叠 + 已有位置，刷新后重新进编辑态应两者都恢复 */
  await page.locator('#trunkPropPanel #tpFold').click();
  await sleep(120);
  const saved = await page.evaluate(() => ({
    pos: localStorage.getItem('ryTrunkPanelPos'),
    fold: localStorage.getItem('ryTrunkPanelFolded')
  }));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.RyMapHost && window.RyTrunkSchema && window.RyTrunkPanel, null, { timeout: 30000 });
  await killMask();
  await sleep(900);
  await openPanel();
  const e = await chrome();
  rec('E1 刷新后位置恢复（inline left/top = localStorage 值）',
    e.styleLeft !== '' && e.styleRight === 'auto' &&
    Math.abs(parseFloat(e.styleLeft) - JSON.parse(saved.pos).x) < 1 &&
    Math.abs(parseFloat(e.styleTop) - JSON.parse(saved.pos).y) < 1,
    JSON.stringify({ saved: saved.pos, left: e.styleLeft, top: e.styleTop }));
  rec('E2 刷新后折叠状态恢复', e.folded && e.foldTxt === '▸' && e.lsFold === '1',
    JSON.stringify({ folded: e.folded, foldTxt: e.foldTxt, lsFold: e.lsFold }));
  rec('E3 折叠态下 tp* 控件仍取得到（refresh 不报错）',
    await page.evaluate(() => {
      const el = document.getElementById('trunkPropPanel');
      return !!(el.querySelector('#tpCode') && el.querySelector('#tpDn') && el.querySelector('#tpFold'));
    }));

  rec('Z1 全程无 pageerror', pageErrors.length === 0, pageErrors.join(' | ') || '(none)');

  await browser.close();
  const fails = out.filter(r => !r[1]);
  console.log('\n== ' + (out.length - fails.length) + '/' + out.length + ' 通过 ==');
  if (fails.length) process.exitCode = 1;
})().catch(e => { console.error('PROBE CRASH:', e.message); process.exitCode = 1; });
