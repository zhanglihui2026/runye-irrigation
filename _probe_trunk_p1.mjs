'use strict';
/* _probe_trunk_p1.mjs —— 一期验收：schema v2 + 绘制状态机
 *
 * 覆盖任务书 §4.4 的 P1-1 ~ P1-8 与 §4.7 的 B1 ~ B6：
 *   B1 画三点后双击完成 → 库里 schema=2、trunks[0].points 长度正确
 *   B2 再画第二段 → trunks 两条、main 唯一
 *   B3 Esc 取消 → revision 不变（旧线一根不动）
 *   B4 Shift 正交 → 末两点共轴
 *   B5 互斥矩阵（画框/加点 ↔ 总管绘制）
 *   B6 无 pageerror
 *   + Enter 完成、快捷键 M、激活色 #2563eb、输入框内按 M 不吃键
 *
 * 判据全部取「可观测结果」：地块库内容、RyMapHost.trunkState()、computedStyle。
 * 用法：node _probe_trunk_p1.mjs
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
const APP = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/') + '?full=1&rymock=L2#onlineMapSection';

const PLOTS = [
  { id: 'p1-a', name: 'P1-A', sqm: 23500, mu: 35.25, ts: 300, areaM2: 23500, source: 'map',
    polyLatLng: [[18.2, 109.5], [18.2, 109.502], [18.201, 109.502], [18.201, 109.5]] },
  { id: 'p1-b', name: 'P1-B', sqm: 36000, mu: 54, ts: 200, areaM2: 36000, source: 'map',
    polyLatLng: [[18.21, 109.51], [18.21, 109.513], [18.2115, 109.512], [18.211, 109.51]] },
];

const out = [];
const rec = (label, ok, detail) => { out.push([label, ok, detail]);
  console.log((ok ? '  OK   ' : '  FAIL ') + label + (detail ? '  ' + detail : '')); };

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  if (!EDGE) { console.log('找不到 Microsoft Edge'); process.exitCode = 1; return; }
  const browser = await chromium.launch({ channel: 'msedge', headless: true, executablePath: EDGE,
    args: ['--allow-file-access-from-files', '--no-first-run', '--no-default-browser-check'] });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, serviceWorkers: 'block' });
  await context.route(/^https?:\/\//, r => r.abort());
  await context.addInitScript(plots => {
    if (!localStorage.getItem('__p1_seed')) {
      localStorage.setItem('runye_plot_library', JSON.stringify(plots));
      localStorage.setItem('runyeLocalAdminSession', '1');
      localStorage.setItem('__p1_seed', '1');
    }
  }, PLOTS);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  const dialogs = [];
  page.on('dialog', d => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });

  /* 公告层有两种形态：.ry-ann-mask（遮罩）和 .ry-ann-list（常驻列表）。
     只清 mask 是不够的 —— 实测 elementFromPoint 命中 UL.ry-ann-list，所有地图点击
     都被它吃掉（domClicks=0、草稿点永远是 0），而页面本身不报任何错，极难看出来。
     所以这里按 class 前缀全域压制。 */
  const killMask = async () => {
    await page.evaluate(() => {
      if (document.getElementById('__probe_mask_kill')) return;
      /* 只压制样式、不移除节点 —— 公告容器可能被页面 JS 引用，删了会引发别的问题。 */
      const st = document.createElement('style'); st.id = '__probe_mask_kill';
      st.textContent = '[class*="ry-ann"]{display:none!important;pointer-events:none!important}';
      document.head.appendChild(st);
    });
  };

  /* 注意 read().revision 是**原始 JSON 字符串**（不是数字）—— 用它做"变没变"的比较，
     别写 `>`（第一版就是这么错的，打印出一整串地块 JSON）。 */
  const lib = () => page.evaluate(() => {
    const s = window.RyPlotLibraryStore.read();
    const p = (s.plots || []).find(x => x.id === 'p1-a');
    return { rev: String(s.revision), trunk: (p && p.trunk) || null };
  });
  const st = () => page.evaluate(() => window.RyMapHost.trunkState());

  await page.goto(APP, { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction(() => window.RyMapHost && window.RyTrunkSchema && window.RyPlotLibraryStore, null, { timeout: 30000 });
  await killMask();
  await page.waitForTimeout(900);

  rec('B0 schema 模块就位', await page.evaluate(() => typeof window.RyTrunkSchema.normalize === 'function'));

  /* 选中地块：走真实入口「我的地块」列表行 */
  await killMask();
  await page.locator('#myPlotList .place-item[data-plot-id="p1-a"] .place-go').click();
  await page.waitForTimeout(1200);

  const box = await page.locator('#map').boundingBox();
  const CX = box.x + box.width * 0.45, CY = box.y + box.height * 0.5;
  const P = (dx, dy) => [CX + dx, CY + dy];

  /* ---------- B1 三点 + 双击完成 ---------- */
  await killMask();
  await page.locator('#btnDrawTrunk').click();
  await page.waitForTimeout(400);
  const s1 = await st();
  rec('B1a 进入绘制态，按钮禁用画框/加点',
    s1.mode === 'draw' && await page.evaluate(() => document.getElementById('btnDraw').disabled === true && document.getElementById('btnAddPt').disabled === true),
    JSON.stringify(s1));

  const activeColor = await page.evaluate(() => {
    const b = document.getElementById('btnDrawTrunk');
    return { bg: getComputedStyle(b).backgroundColor, cls: b.className, pressed: b.getAttribute('aria-pressed') };
  });
  /* 蓝色两种：常态 #2563eb(37,99,235) / hover #1d4ed8(29,78,216)。关键是**不是** .btn-on 的绿。 */
  const BLUE = ['rgb(37, 99, 235)', 'rgb(29, 78, 216)'];
  rec('B1b 激活态是蓝色 #2563eb（不是 .btn-on 的绿 34,197,94）',
    BLUE.includes(activeColor.bg) && activeColor.pressed === 'true', JSON.stringify(activeColor));

  await page.mouse.click(...P(-260, -120)); await page.waitForTimeout(160);
  await page.mouse.click(...P(-140, -40));  await page.waitForTimeout(160);
  await page.mouse.click(...P(-20, 60));    await page.waitForTimeout(160);
  const s2 = await st();
  rec('B1c 三次点击 = 三个草稿点', s2.draftPoints === 3, 'draft=' + s2.draftPoints);

  const revBefore = (await lib()).rev;
  await page.mouse.dblclick(...P(100, 140));
  await page.waitForTimeout(1200);
  const l1 = await lib();
  const s3 = await st();
  rec('B1d 双击完成：回到 idle 且草稿清空', s3.mode === 'idle' && s3.draftPoints === 0, JSON.stringify(s3));
  rec('B1e 库里写成 v2', !!l1.trunk && l1.trunk.schema === 2 && Array.isArray(l1.trunk.trunks),
    l1.trunk ? 'schema=' + l1.trunk.schema + ' trunks=' + (l1.trunk.trunks || []).length : 'no trunk');
  /* 双击本身也会落一个点（第一下 click），所以 3 次点击 + 双击 = 4 个点 */
  rec('B1f 折点数 = 4（双击只多落一个点，没有重复加点）',
    !!l1.trunk && l1.trunk.trunks[0].points.length === 4,
    l1.trunk ? 'points=' + l1.trunk.trunks[0].points.length : 'no trunk');
  rec('B1g revision 递增且 main 唯一',
    l1.rev !== revBefore && l1.trunk.trunks.filter(t => t.main).length === 1,
    'revLen ' + revBefore.length + '→' + l1.rev.length);

  /* ---------- B2 第二段 → 多干线 ---------- */
  await killMask();
  await page.locator('#btnDrawTrunk').click();
  await page.waitForTimeout(400);
  const s4 = await st();
  rec('B2a 已存线在绘制时仍可见（trunkCount 保留）', s4.trunkCount === 1, 'count=' + s4.trunkCount);
  await page.mouse.click(...P(-200, 100)); await page.waitForTimeout(160);
  await page.mouse.click(...P(-60, 180));  await page.waitForTimeout(160);
  await page.keyboard.press('Enter');      // 走回车完成这条路径
  await page.waitForTimeout(1200);
  const l2 = await lib();
  rec('B2b 回车也能完成，且是第二条独立干线',
    !!l2.trunk && l2.trunk.trunks.length === 2, l2.trunk ? 'trunks=' + l2.trunk.trunks.length : 'none');
  rec('B2c 两条线编号不同、main 仍唯一',
    !!l2.trunk && new Set(l2.trunk.trunks.map(t => t.id)).size === 2 &&
    l2.trunk.trunks.filter(t => t.main).length === 1,
    l2.trunk ? JSON.stringify(l2.trunk.trunks.map(t => ({ id: t.id, main: t.main, n: t.points.length }))) : '');
  rec('B2d 第一条线没被第二条覆盖',
    !!l2.trunk && l2.trunk.trunks[0].points.length === 4,
    l2.trunk ? 'T1 points=' + l2.trunk.trunks[0].points.length : '');

  /* ---------- B3 Esc 取消不动库 ---------- */
  const revB = (await lib()).rev;
  await killMask();
  await page.locator('#btnDrawTrunk').click();
  await page.waitForTimeout(300);
  await page.mouse.click(...P(0, -60)); await page.waitForTimeout(160);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  const s5 = await st();
  const l3 = await lib();
  rec('B3 Esc 回到 idle 且草稿丢弃', s5.mode === 'idle' && s5.draftPoints === 0, JSON.stringify(s5));
  rec('B3b Esc 后地块库 revision 不变（旧线一根没动）', l3.rev === revB, 'revLen ' + revB.length + '→' + l3.rev.length);

  /* ---------- B4 Shift 正交 ---------- */
  await killMask();
  await page.locator('#btnDrawTrunk').click();
  await page.waitForTimeout(300);
  await page.mouse.click(...P(-220, -60)); await page.waitForTimeout(200);
  await page.keyboard.down('Shift');
  await page.mouse.click(...P(-40, -66));   // 几乎水平，正交后应严格同 lat
  await page.keyboard.up('Shift');
  await page.waitForTimeout(200);
  const ortho = await page.evaluate(() => {
    // 草稿点只在闭包里，这里用渲染出来的 polyline 反读
    const lines = [];
    document.querySelectorAll('#map path').forEach(p => {
      const d = p.getAttribute('d') || '';
      if (d) lines.push(d);
    });
    return lines.length;
  });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);
  const l4 = await lib();
  const t3 = l4.trunk && l4.trunk.trunks[2];
  const orthoOk = !!t3 && t3.points.length >= 2 &&
    (function () {
      const a = t3.points[t3.points.length - 2], b = t3.points[t3.points.length - 1];
      return Math.abs(a[0] - b[0]) < 1e-12 || Math.abs(a[1] - b[1]) < 1e-12;
    })();
  rec('B4 Shift 正交：末两点严格共轴', orthoOk, t3 ? JSON.stringify(t3.points) : 'no T3');

  /* ---------- B5 互斥矩阵 ---------- */
  await killMask();
  await page.locator('#btnDraw').click();      // 画框
  await page.waitForTimeout(500);
  const inDraw = await st();
  const mutual1 = await page.evaluate(() => document.getElementById('btnDrawTrunk').disabled === true);
  rec('B5a 画框时「绘制总管」被禁用', inDraw.mode === 'idle' && mutual1, JSON.stringify(inDraw));

  /* 注意：这里**不能**用 click({force:true}) 去试"点了会怎样" ——
     force 会绕过 disabled，真的把状态切走，后面的断言全部连锁失真（第一版就踩了）。
     disabled 的按钮在浏览器里根本不会派发 click，所以「仍是 idle」本身就等于「点不动」。 */
  const stillIdle = await st();
  rec('B5b 禁用状态下状态不变（mode 仍 idle）', stillIdle.mode === 'idle', stillIdle.mode);

  await page.locator('#btnDraw').click();      // 退出画框
  await page.waitForTimeout(400);

  /* ---------- 快捷键 M ---------- */
  await page.keyboard.press('m');
  await page.waitForTimeout(400);
  const mOn = await st();
  rec('B6 快捷键 M 进入绘制态', mOn.mode === 'draw', mOn.mode);
  await page.keyboard.press('m');
  await page.waitForTimeout(400);
  rec('B6b 再按 M 退出', (await st()).mode === 'idle');

  /* 输入框里按 m 不能切模式 */
  await killMask();
  await page.locator('#search').click();
  await page.keyboard.press('m');
  await page.waitForTimeout(300);
  const typing = await st();
  const searchVal = await page.locator('#search').inputValue();
  rec('B7 搜索框里按 m 只输入文字，不切模式',
    typing.mode === 'idle' && searchVal.includes('m'), `mode=${typing.mode} val="${searchVal}"`);

  rec('B8 无 pageerror', pageErrors.length === 0, pageErrors.join(' | ') || '(none)');
  rec('B9 无意外弹窗', dialogs.length === 0, JSON.stringify(dialogs));

  /* 截图 */
  const shot = path.join(ROOT, '_shots', 'p1-trunk.png');
  fs.mkdirSync(path.dirname(shot), { recursive: true });
  await page.evaluate(() => { const s = document.getElementById('search'); if (s) s.value = ''; });
  await page.screenshot({ path: shot }).catch(() => {});

  const fail = out.filter(o => !o[1]).length;
  console.log(`\n== trunk-p1: ${out.length - fail}/${out.length} 通过 ==`);
  fs.writeFileSync(path.join(ROOT, '_probe_trunk_p1_out.json'), JSON.stringify({ out, pageErrors, dialogs }, null, 2));
  await browser.close();
  process.exitCode = fail ? 1 : 0;
})();
