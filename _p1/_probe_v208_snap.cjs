/* _p1/_probe_v208_snap.cjs · [v208 取证]「配件到管道附近 / 管道到配件附近不吸附」到底卡在哪
 * 纪律：**先 dump 状态机再改代码**。这里全部用真实鼠标（不走任何 export setter），
 * 把「拖动到一个已悬空端口附近」这件事按不同距离档做一遍，量出：
 *  ① 松手后是否真的接驳；
 *  ② 有效吸附半径是多少（规划 px / 屏幕 px 两个单位都报）；
 *  ③ 拖动过程中（还没松手）有没有吸附提示/预对齐 —— 这是「体感吸附」的关键；
 *  ④ 从素材库 HTML5 真实拖入有没有问题（puppeteer setDragInterception）。
 */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');
const killTree = require('./_edge_kill.cjs');

const WS = 'C:\\Users\\AHS\\runye-irrigation';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = path.join(WS, '_verify_out');
const PORT = 9544;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileUrl = (p) => 'file:///' + encodeURI(p.replace(/\\/g, '/'));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const proc = spawn(EDGE, [
    '--headless=new', '--allow-file-access-from-files', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(OUT, 'profile_v208probe'), '--no-first-run', '--no-default-browser-check',
    '--window-size=1500,950', 'about:blank'
  ], { stdio: 'ignore' });
  let browser = null;
  for (let i = 0; i < 50; i++) {
    try { browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:' + PORT, defaultViewport: null }); break; }
    catch (e) { await sleep(400); }
  }
  if (!browser) { console.error('Edge connect failed'); killTree(proc.pid); process.exit(1); }
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 950 });
  await page.goto(fileUrl(path.join(WS, '管路接驳拼装.html')), { waitUntil: 'load', timeout: 90000 });
  await sleep(900);
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) { } });
  await page.reload({ waitUntil: 'load' });
  await sleep(1000);

  const R = (fn, ...a) => page.evaluate(fn, ...a);
  const getComps = () => R(() => window.RyPipeAssembler.getComps());
  const getConns = () => R(() => window.RyPipeAssembler.getConns());
  const planToClient = (x, y) => R((px, py) => {
    const svg = document.getElementById('paSvg'), vp = document.getElementById('paVp');
    const p = svg.createSVGPoint(); p.x = px; p.y = py;
    const q = p.matrixTransform(vp.getScreenCTM());
    return { x: q.x, y: q.y };
  }, x, y);
  const zoomNow = () => R(() => document.getElementById('paVp').getScreenCTM().a);

  async function fresh() {
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) { } });
    await page.reload({ waitUntil: 'load' });
    await sleep(900);
    await page.click('#btnExample');
    await sleep(400);
  }

  console.log('=== A. 拖动**已有管件**到另一个已悬空端口附近（不同距离档）===');
  console.log('   目标 = 示例末端 s3 的 R 口；被测件 = 从素材库「点击」新加的默认 DN110 弯头');
  const rows = [];
  for (const d of [6, 12, 20, 30, 60]) {
    await fresh();
    await page.click('.pa-item[data-add="elbow90"]');
    await sleep(300);
    const comps = await getComps();
    const nc = comps[comps.length - 1];
    const s3 = comps[4];
    const T = { x: s3.x + s3.len * 12, y: s3.y };
    const before = (await getConns()).length;
    const z = await zoomNow();
    /* 抓点 = 弯头横边中点（plan 偏移 +32,0）；要让它最终落在 T+(0.6d,0.8d) */
    const grab = await planToClient(nc.x + 32, nc.y);
    const dst = await planToClient(T.x + 0.6 * d + 32, T.y + 0.8 * d);
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    let mid = null;
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(grab.x + (dst.x - grab.x) * i / 6, grab.y + (dst.y - grab.y) * i / 6);
      await sleep(25);
    }
    /* 拖动中、松手前：观察有没有「吸附提示」或已被预对齐 */
    const midComps = await getComps();
    const mc = midComps.filter((c) => c.id === nc.id)[0];
    const greenHighlight = await R(() => document.querySelectorAll('#paSvg circle[stroke="#16a34a"]').length);
    mid = Math.abs(mc.x - T.x) < 0.6 && Math.abs(mc.y - T.y) < 0.6;
    await page.mouse.up();
    await sleep(300);
    const after = (await getConns()).length;
    rows.push({ d, screen: Math.round(d * z), before, after, snapped: after > before, midAligned: mid, greenHighlight });
    console.log('   距 ' + String(d).padStart(2) + ' 规划px（屏幕 ' + Math.round(d * z) + 'px）→ 松手后接驳 ' +
      (after > before ? '是 ✓' : '否 ✗') + '；拖动中已预对齐 ' + (mid ? '是' : '否') +
      '；拖动中绿圈高亮数 ' + greenHighlight);
  }

  console.log('\n=== B. 从素材库真实 HTML5 拖入管子端口附近 ===');
  await fresh();
  await page.setDragInterception(true);
  const compsB = await getComps();
  const s3B = compsB[4];
  const TB = { x: s3B.x + s3B.len * 12, y: s3B.y };
  const beforeB = (await getConns()).length;
  const itemBox = await (await page.$('.pa-item[data-add="elbow90"]')).boundingBox();
  const dropPt = await planToClient(TB.x + 10, TB.y + 8);
  let dragRes = 'n/a';
  try {
    await page.mouse.dragAndDrop({ x: itemBox.x + itemBox.width / 2, y: itemBox.y + itemBox.height / 2 },
      { x: dropPt.x, y: dropPt.y }, { delay: 60 });
    await sleep(500);
    const afterB = (await getConns()).length;
    dragRes = afterB > beforeB ? '接驳成功 ✓' : '未接驳 ✗';
  } catch (e) { dragRes = '拖放异常：' + e.message; }
  console.log('   拖入到端口 12 规划px 处 → ' + dragRes);
  await page.setDragInterception(false);

  console.log('\n=== C. 反向：拖**管道**去靠近配件 ===');
  await fresh();
  const compsC = await getComps();
  const rdC = compsC[3];               // 变径
  await page.click('.pa-item[data-add="straight"]');
  await sleep(300);
  const compsC2 = await getComps();
  const ncC = compsC2[compsC2.length - 1];          // 新加的直管
  const beforeC = (await getConns()).length;
  const grabC = await planToClient(ncC.x + ncC.len * 12 / 2, ncC.y);
  /* 把新直管的 L 口放到「变径 L 口」的……变径 L 已占用，改用 s3.R（开放）不行，
     这里改测试：把新直管拖到“悬空的 s1.L”附近（反向 = 管道靠近管道/配件都算） */
  const s1C = compsC2[0];
  const dstC = await planToClient(s1C.x + 8 + ncC.len * 12 / 2, s1C.y + 6);
  await page.mouse.move(grabC.x, grabC.y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) { await page.mouse.move(grabC.x + (dstC.x - grabC.x) * i / 6, grabC.y + (dstC.y - grabC.y) * i / 6); await sleep(25); }
  await page.mouse.up();
  await sleep(300);
  const afterC = (await getConns()).length;
  console.log('   把新建直管拖到 s1 的 L 口约 10 规划px 处，松手 → ' + (afterC > beforeC ? '接驳成功 ✓' : '未接驳 ✗'));

  console.log('\n=== 汇总 ===');
  console.log('   A 组: ' + rows.map((r) => r.d + 'px' + (r.snapped ? '✓' : '✗')).join('  '));
  console.log('   拖动过程中是否实时吸附/对齐: ' + (rows.some((r) => r.midAligned) ? '有' : '完全没有 —— 只在松手那一刻判定'));
  const firstOK = rows.filter((r) => r.snapped).map((r) => r.d);
  console.log('   实测有效半径上限: ' + (firstOK.length ? Math.max.apply(null, firstOK) + ' 规划px（≈' + rows.filter((r) => r.snapped).slice(-1)[0].screen + ' 屏幕px）' : '全部未吸附'));

  await page.screenshot({ path: path.join(OUT, 'probe_v208_snap.png') });
  try { await browser.disconnect(); } catch (e) { }
  killTree(proc.pid);
  process.exit(0);
})().catch((e) => { console.error('EXCEPTION: ' + e.stack); process.exit(2); });
