/* node modeling/tests/layout_rails.cjs [siteRoot]
   竖向工具栏专项回归：
   • 4 绘图工具栏（#drawRail）必须位于整页最左、竖向排列；
   • 9 电池工具栏（#battRail）必须位于整页最右、竖向排列；
   • 两条侧栏纵向铺满主体，且不参与三大区（绘图区/参数+三维区/电池区）布局；
   • 矮屏堆叠模式下侧栏转为整幅横条，不占用横向空间。
   传入改动前副本目录可做反向验证（改动前应大面积报红）。 */
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const root = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '../..');
const target = pathToFileURL(path.join(root, 'modeling/parametric/index.html')).href;

const results = [];
function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then((r) => results.push({ name, passed: !!(r && r.pass), detail: (r && r.detail) || '' }))
    .catch((e) => results.push({ name, passed: false, detail: '异常: ' + e.message }));
}

function railGeom(page) {
  return page.evaluate(() => {
    const g = (sel) => {
      const e = document.querySelector(sel);
      if (!e) return null;
      const b = e.getBoundingClientRect();
      return { l: +b.left.toFixed(1), r: +b.right.toFixed(1), t: +b.top.toFixed(1), b: +b.bottom.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) };
    };
    const main = document.getElementById('main');
    const btns = (rail) => Array.from(document.querySelectorAll(rail + ' .tool')).map((e) => {
      const b = e.getBoundingClientRect();
      return { l: +b.left.toFixed(1), r: +b.right.toFixed(1), t: +b.top.toFixed(1), b: +b.bottom.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) };
    });
    const owns = (railId, id) => {
      const rail = document.getElementById(railId), el = document.getElementById(id);
      return !!(rail && el && rail.contains(el));
    };
    return {
      vw: window.innerWidth,
      main: g('#main'), left: g('#left'), right: g('#right'),
      drawRail: g('#drawRail'), battRail: g('#battRail'),
      drawBtns: btns('#drawRail'), battBtns: btns('#battRail'),
      mainDir: main ? getComputedStyle(main).flexDirection : null,
      leftToolbarInRail: owns('drawRail', 'leftToolbar'),
      nodeToolbarInRail: owns('battRail', 'nodeToolbar'),
      leftToolbarInLeft: owns('left', 'leftToolbar'),
      nodeToolbarInRight: owns('right', 'nodeToolbar'),
      railTitles: document.querySelectorAll('.rail-title').length,
    };
  });
}

/** 竖排判定：第 i+1 个按钮整体位于第 i 个按钮下方（而非右侧） */
function verticalStack(btns) {
  if (!btns || btns.length < 2) return { pass: false, detail: '按钮不足 2 个' };
  let bad = 0, badH = 0;
  for (let i = 1; i < btns.length; i++) {
    const a = btns[i - 1], b = btns[i];
    if (!(b.t >= a.b - 2)) bad++;                       // 必须在下方
    if (Math.abs((a.l + a.r) / 2 - (b.l + b.r) / 2) > 3) bad++; // 中心线对齐
  }
  for (const b of btns) if (b.h > 44 || b.h < 20) badH++;      // 单行高度，未折行成两行
  return { pass: bad === 0 && badH === 0, detail: `排列异常=${bad} 折行/过矮=${badH}（首个按钮 ${btns[0].w}x${btns[0].h}）` };
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true, args: ['--headless=new', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(target);
  await page.waitForSelector('.node', { timeout: 15000 });
  await page.waitForTimeout(400);

  /* ---------- A 侧栏存在且位于整页两端 ---------- */
  await check('A1 #drawRail（4 绘图工具栏）与 #battRail（9 电池工具栏）均存在', async () => {
    const g = await railGeom(page);
    return { pass: !!g.drawRail && !!g.battRail, detail: `drawRail=${!!g.drawRail} battRail=${!!g.battRail}` };
  });

  await check('A2 4 绘图工具栏紧贴视口左缘且在绘图区左侧', async () => {
    const g = await railGeom(page);
    if (!g.drawRail || !g.left) return { pass: false, detail: '缺失元素' };
    const atLeft = g.drawRail.l < 2;
    const beforeLeft = g.drawRail.r <= g.left.l + 1.2;
    return { pass: atLeft && beforeLeft, detail: `rail=[${g.drawRail.l},${g.drawRail.r}] 绘图区左缘=${g.left.l} 贴左缘=${atLeft} 在其左=${beforeLeft}` };
  });

  await check('A3 9 电池工具栏紧贴视口右缘且在电池区右侧', async () => {
    const g = await railGeom(page);
    if (!g.battRail || !g.right) return { pass: false, detail: '缺失元素' };
    const atRight = Math.abs(g.battRail.r - g.vw) < 2;
    const afterRight = g.battRail.l >= g.right.r - 1.2;
    return { pass: atRight && afterRight, detail: `rail=[${g.battRail.l},${g.battRail.r}] 视口宽=${g.vw} 电池区右缘=${g.right.r} 贴右缘=${atRight} 在其右=${afterRight}` };
  });

  /* ---------- B 侧栏内容竖向排列 ---------- */
  await check('B1 4 绘图工具栏按钮竖向堆叠（上下排列、中心对齐、不折行）', async () => {
    const g = await railGeom(page);
    return verticalStack(g.drawBtns);
  });

  await check('B2 9 电池工具栏按钮竖向堆叠（上下排列、中心对齐、不折行）', async () => {
    const g = await railGeom(page);
    return verticalStack(g.battBtns);
  });

  await check('B3 两条侧栏纵向铺满主体区（高度贴合 #main）', async () => {
    const g = await railGeom(page);
    if (!g.main || !g.drawRail || !g.battRail) return { pass: false, detail: '缺失元素' };
    const d1 = Math.abs(g.drawRail.h - g.main.h), d2 = Math.abs(g.battRail.h - g.main.h);
    const top1 = Math.abs(g.drawRail.t - g.main.t), top2 = Math.abs(g.battRail.t - g.main.t);
    return { pass: d1 < 2 && d2 < 2 && top1 < 2 && top2 < 2,
             detail: `drawRail 高差=${d1}px battRail 高差=${d2}px 顶部差=${top1}/${top2}px` };
  });

  await check('B4 按钮未溢出侧栏（右缘受 rail 约束）', async () => {
    const g = await railGeom(page);
    if (!g.drawRail || !g.battRail) return { pass: false, detail: '缺失元素' };
    const over = [...(g.drawBtns || []), ...(g.battBtns || [])].filter((b) => b.r > ((b.l >= g.drawRail.l && b.r <= g.drawRail.r + 50) ? g.drawRail.r : g.battRail.r) + 0.6);
    return { pass: over.length === 0, detail: over.length ? `溢出 ${over.length} 个按钮` : '无溢出' };
  });

  /* ---------- C DOM 归属：工具栏移入侧栏、移出原区 ---------- */
  await check('C1 #leftToolbar 位于 #drawRail 内且不再属于 #left', async () => {
    const g = await railGeom(page);
    return { pass: g.leftToolbarInRail && !g.leftToolbarInLeft, detail: `在侧栏=${g.leftToolbarInRail} 在绘图区=${g.leftToolbarInLeft}` };
  });

  await check('C2 #nodeToolbar 位于 #battRail 内且不再属于 #right', async () => {
    const g = await railGeom(page);
    return { pass: g.nodeToolbarInRail && !g.nodeToolbarInRight, detail: `在侧栏=${g.nodeToolbarInRail} 在电池区=${g.nodeToolbarInRight}` };
  });

  await check('C3 分组标题（绘制/视图/电池/画布）正常渲染', async () => {
    const g = await railGeom(page);
    return { pass: g.railTitles >= 4, detail: `rail-title 数量=${g.railTitles}` };
  });

  /* ---------- D 矮屏堆叠模式：侧栏转横条 ---------- */
  /* 独立开矮屏页面，避免 setViewportSize 的中间态 */
  await check('D1 矮屏堆叠模式下侧栏转为整幅横条（不再占用横向空间）', async () => {
    const page2 = await browser.newPage({ viewport: { width: 1080, height: 612 } });
    page2.on('pageerror', (e) => errors.push(e.message));
    try {
      await page2.goto(target);
      await page2.waitForSelector('.node', { timeout: 15000 });
      await page2.waitForTimeout(400);
      const g = await railGeom(page2);
      if (!g.drawRail || !g.battRail || !g.main) return { pass: false, detail: '缺失元素' };
      const stacked = g.mainDir === 'column';
      const wide = g.drawRail.w > 300 && g.battRail.w > 300;
      // 横排判定：第二个按钮在第一个按钮右侧，而非下方
      const b = g.drawBtns;
      const horiz = !!(b && b.length >= 2 && b[1].l >= b[0].r - 2 && b[1].t < b[0].b);
      return { pass: stacked && wide && horiz,
               detail: `mainDir=${g.mainDir} drawRail宽=${g.drawRail.w} battRail宽=${g.battRail.w} 按钮横排=${horiz}` };
    } finally { await page2.close(); }
  });

  /* ---------- E 稳定性 ---------- */
  await check('E1 无 JS 报错', async () => {
    return { pass: errors.length === 0, detail: errors.length ? errors.slice(0, 3).join(' | ') : '无' };
  });

  await browser.close();

  const pass = results.filter((r) => r.passed).length;
  console.log('\n========== 竖向工具栏专项回归 ==========');
  results.forEach((r) => console.log(`${r.passed ? 'PASS' : 'FAIL'}  ${r.name}\n      ${r.detail}`));
  console.log(`\n===== ${pass}/${results.length} 通过 =====`);
  process.exit(pass === results.length ? 0 : 1);
})();
