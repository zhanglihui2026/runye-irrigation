/* _p1/_shot_v208_snap.cjs · [v208] 「拖到附近就自动吸附」验证
 * 用户反馈：「配件到管道附近 或者 管道到配件附近，不能自动吸附，这个要改下。」
 *
 * 取证（_p1/_probe_v208_snap.cjs）实测出的旧症状：
 *   · 有效半径只有 ~34 屏幕px（40px 就接不上）；
 *   · 全程零反馈 —— 只在松手那一刻判定，拖动看不到任何「要吸上了」的信号。
 * 本脚本按**屏幕像素**给距离档（与 zoom 解耦），覆盖：
 *   V1/V2 松手后应接驳（含旧版必红的 48 屏幕px 档）
 *   V3    负对照：拖到 110 屏幕px 外 **不能** 接驳（防「到处乱粘」）
 *   V4    **拖动过程中**（未松手）就实时磁吸对位并显示绿色高亮 —— 体感的关键
 *   V5    反向同样成立：拖「管道」去靠近配件
 *   V6    拖动已连通的整串：一起平移、原有接口不开缝（moveWithBranch）
 *   V7    素材库 HTML5 真实拖入也能吸附
 *   V8    全程无 JS 报错
 * 全部真实鼠标操作（除了只读 getter）。
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
const PAGE = process.env.PA_PAGE || '管路接驳拼装.html';
const PORT = parseInt(process.env.PA_PORT || '9546', 10);
const TAG = process.env.PA_TAG || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileUrl = (p) => 'file:///' + encodeURI(p.replace(/\\/g, '/'));

let pass = 0, fail = 0;
const check = (n, ok, extra) => { console.log((ok ? '  [PASS] ' : '  [FAIL] ') + n + (extra ? ' :: ' + extra : '')); ok ? pass++ : fail++; };
const near0 = (v) => Math.abs(v) < 0.6;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const proc = spawn(EDGE, [
    '--headless=new', '--allow-file-access-from-files', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(OUT, 'profile_v208' + TAG), '--no-first-run', '--no-default-browser-check',
    '--window-size=1500,950', 'about:blank'
  ], { stdio: 'ignore' });
  let browser = null;
  for (let i = 0; i < 50; i++) {
    try { browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:' + PORT, defaultViewport: null }); break; }
    catch (e) { await sleep(400); }
  }
  if (!browser) { console.error('Edge connect failed'); killTree(proc.pid); process.exit(1); }
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.setViewport({ width: 1500, height: 950 });
  await page.goto(fileUrl(path.join(WS, PAGE)), { waitUntil: 'load', timeout: 90000 });
  await sleep(900);
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) { } });
  await page.reload({ waitUntil: 'load' });
  await sleep(1000);

  const R = (fn, ...a) => page.evaluate(fn, ...a);
  const getComps = () => R(() => window.RyPipeAssembler.getComps());
  const getConns = () => R(() => window.RyPipeAssembler.getConns());
  const zoomNow = () => R(() => document.getElementById('paVp').getScreenCTM().a);
  const planToClient = (x, y) => R((px, py) => {
    const svg = document.getElementById('paSvg'), vp = document.getElementById('paVp');
    const p = svg.createSVGPoint(); p.x = px; p.y = py;
    const q = p.matrixTransform(vp.getScreenCTM());
    return { x: q.x, y: q.y };
  }, x, y);
  const maxGap = async () => {
    const r = await R(() => {
      const API = window.RyPipeAssembler;
      return API.getConns().map((k) => {
        const A = API.portPosOf(k.a.id, k.a.side), B = API.portPosOf(k.b.id, k.b.side);
        return Math.hypot(A.x - B.x, A.y - B.y);
      });
    });
    return r.length ? Math.max.apply(null, r) : 0;
  };
  async function fresh() {
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) { } });
    await page.reload({ waitUntil: 'load' });
    await sleep(800);
    await page.click('#btnExample');
    await sleep(400);
  }
  /* 把「被测组件」拖到目标端口附近：distScreen = 屏幕像素，方向上取 (0.6,0.8) 斜向 */
  async function dragNear(nc, grabPlan, T, distScreen, release) {
    const z = await zoomNow();
    const dvp = distScreen / z;
    const grab = await planToClient(grabPlan.x, grabPlan.y);
    const dst = await planToClient(T.x + 0.6 * dvp + grabPlan.off, T.y + 0.8 * dvp + grabPlan.offY);
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) { await page.mouse.move(grab.x + (dst.x - grab.x) * i / 6, grab.y + (dst.y - grab.y) * i / 6); await sleep(25); }
    const mid = {
      comps: await getComps(),
      rings: await R(() => document.querySelectorAll('#paSvg circle[stroke="#16a34a"]').length)
    };
    if (release === false) { await page.mouse.up(); }
    else { await page.mouse.up(); await sleep(300); }
    return mid;
  }

  console.log('\n=== V1/V2/V3 距离档：，被测件=库里新加的弯头，目标=示例末端 s3 的 R 口 ===');
  for (const dist of [32, 48, 110]) {
    await fresh();
    await page.click('.pa-item[data-add="elbow90"]');
    await sleep(300);
    let comps = await getComps();
    const nc = comps[comps.length - 1], s3 = comps[4];
    const T = { x: s3.x + s3.len * 12, y: s3.y };
    const before = (await getConns()).length;
    const mid = await dragNear(nc, { x: nc.x + 32, y: nc.y, off: 32, offY: 0 }, T, dist, true);
    const after = (await getConns()).length;
    const mc = (await getComps()).filter((c) => c.id === nc.id)[0];
    if (dist === 110) {
      check('V3 负对照：' + dist + ' 屏幕px 之外**不能**自动接驳（防止到处乱粘）', after === before,
        before + ' → ' + after + ' 连接');
    } else {
      check('V' + (dist === 32 ? 1 : 2) + ' ' + dist + ' 屏幕px 拖到附近松手 ⇒ 自动接驳' +
        (dist === 48 ? '（旧版 34px 半径时必红）' : ''), after > before, before + ' → ' + after + ' 连接');
      check('V' + (dist === 32 ? 1 : 2) + 'b 接驳后端口严格重合', near0(await maxGap()), 'maxGap=' + (await maxGap()).toFixed(3));
      check('V' + (dist === 32 ? 1 : 2) + 'c 配件口径自动跟随管道 DN' + s3.dn, mc.dn === s3.dn, 'dn=' + mc.dn);
    }
    /* V4：拖动过程中（松手前）就应已磁吸对位 + 绿圈提示 */
    if (dist !== 110) {
      const midNow = mid.comps.filter((c) => c.id === nc.id)[0];
      check('V4a 拖动**过程中**（未松手）已实时磁吸对位',
        Math.abs(midNow.x - T.x) < 0.6 && Math.abs(midNow.y - T.y) < 0.6,
        '拖拽中位置=(' + midNow.x + ',' + midNow.y + ') 目标=(' + T.x + ',' + T.y + ')');
      check('V4b 拖动过程中显示了绿色吸附提示圈', mid.rings >= 1, '绿圈数=' + mid.rings);
    }
  }

  console.log('\n=== V5 反向：拖「管道」去靠近配件 ===');
  /* ★ 目标特意取 s3 的 R 口（DN90）：新加的直管默认是 DN110，**必须**先把口径改成 90
     才接得上 —— 这条同时也是 K5（注入：吸附时不改口径）的判别样本。 */
  await fresh();
  await page.click('.pa-item[data-add="straight"]');
  await sleep(300);
  let comps = await getComps();
  const pipe = comps[comps.length - 1], s3v = comps[4];
  const before5 = (await getConns()).length;
  await dragNear(pipe, { x: pipe.x + pipe.len * 12 / 2, y: pipe.y, off: pipe.len * 12 / 2, offY: 0 },
    { x: s3v.x + s3v.len * 12, y: s3v.y }, 30, true);
  const after5 = (await getConns()).length;
  const pipeNow = (await getComps()).filter((c) => c.id === pipe.id)[0];
  check('V5 把新直管（库里默认 DN110）拖到 DN90 管道口附近 ⇒ 自动接驳', after5 > before5, before5 + ' → ' + after5);
  check('V5b 接驳后无错位缝', near0(await maxGap()), 'maxGap=' + (await maxGap()).toFixed(3));
  check('V5c 管道口径已跟随改成 DN' + s3v.dn, pipeNow.dn === s3v.dn, 'dn=' + pipeNow.dn);

  console.log('\n=== V6 拖动已连通的串：整串一起走，原有接口不开缝 ===');
  await fresh();
  const before6 = await getComps();
  const lens6 = JSON.stringify(before6.map((c) => [c.id, c.x, c.y]));
  const e1v = before6[1];
  const grab6 = await planToClient(e1v.x + 32, e1v.y);
  await page.mouse.move(grab6.x, grab6.y);
  await page.mouse.down();
  for (let i = 1; i <= 5; i++) { await page.mouse.move(grab6.x + i * 8, grab6.y + i * 5); await sleep(25); }
  await page.mouse.up();
  await sleep(300);
  const after6 = await getComps();
  const deltas = after6.map((c) => {
    const b = before6.filter((x) => x.id === c.id)[0];
    return Math.round(Math.hypot(c.x - b.x, c.y - b.y));
  });
  const sameShift = deltas.every((d) => Math.abs(d - deltas[0]) < 0.6);
  check('V6a 拖动其中一件 ⇒ 连通的整串同量平移', sameShift && deltas[0] > 0, '各位移=' + deltas.join(','));
  check('V6b 移动整串后原有接口依然严格重合（没有被拉出缝）', near0(await maxGap()), 'maxGap=' + (await maxGap()).toFixed(3));
  check('V6c 只是位移，没有把任何一件删掉', after6.length === before6.length && lens6 !== JSON.stringify(after6.map((c) => [c.id, c.x, c.y])));

  console.log('\n=== V7 素材库 HTML5 真实拖入 ===');
  await fresh();
  await page.setDragInterception(true);
  const compsB = await getComps(); const s3B = compsB[4];
  const TB = { x: s3B.x + s3B.len * 12, y: s3B.y };
  const beforeB = (await getConns()).length;
  const itemBox = await (await page.$('.pa-item[data-add="elbow90"]')).boundingBox();
  const dropPt = await planToClient(TB.x + 12, TB.y + 9);
  await page.mouse.dragAndDrop({ x: itemBox.x + itemBox.width / 2, y: itemBox.y + itemBox.height / 2 },
    { x: dropPt.x, y: dropPt.y }, { delay: 60 });
  await sleep(400);
  const afterB = (await getConns()).length;
  check('V7 从素材库拖到管道口附近 ⇒ 自动接驳', afterB > beforeB, beforeB + ' → ' + afterB);
  await page.setDragInterception(false);
  await page.screenshot({ path: path.join(OUT, 'pa_v208_snap.png') });

  console.log('\n=== V8 无 JS 报错 ===');
  check('V8 全程无 pageerror', errs.length === 0, errs.slice(0, 3).join(' || '));

  console.log('\n=== 汇总：' + pass + ' 通过 / ' + fail + ' 失败 ===');
  try { await browser.disconnect(); } catch (e) { }
  killTree(proc.pid);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('EXCEPTION: ' + e.stack); process.exit(2); });
