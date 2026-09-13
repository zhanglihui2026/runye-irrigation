/* node modeling/tests/layout_regions.cjs [siteRoot]
   布局分区专项回归：
   • 底部行：三维预览(7) 与 参数调节(8) 必须左右并排，而非上下堆叠
   • 主区：左栏(4 5 6 7 8) 与 电池区(9 10 11) 之间只允许存在一条可拖动分隔条，
     除它之外不得有额外间距（gap=0、无边框）
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

/** 读取关键区域几何；缺元素时返回含 missing 标记的对象，由调用方决定如何报红 */
function geom(page) {
  return page.evaluate(() => {
    const g = (id) => {
      const e = document.getElementById(id);
      if (!e) return null;
      const b = e.getBoundingClientRect();
      return { l: +b.left.toFixed(1), r: +b.right.toFixed(1), t: +b.top.toFixed(1), b: +b.bottom.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) };
    };
    const main = document.getElementById('main');
    const leftEl = document.getElementById('left');
    return {
      left: g('left'), right: g('right'),
      splitV: g('splitV'), splitH: g('splitH'),
      preview: g('previewWrap'), props: g('props'),
      vp2d: g('vp2dWrap'), nodeEditor: g('nodeEditor'),
      mainGap: main ? getComputedStyle(main).gap : null,
      mainDir: main ? getComputedStyle(main).flexDirection : null,
      leftBorderRightW: leftEl ? parseFloat(getComputedStyle(leftEl).borderRightWidth) : null,
      leftBorderBottomW: leftEl ? parseFloat(getComputedStyle(leftEl).borderBottomWidth) : null,
      bottomRowDir: (() => { const e = document.getElementById('bottomRow'); return e ? getComputedStyle(e).flexDirection : null; })(),
    };
  });
}

/** 校验条件；缺样本一律判失败，避免"永远通过"的假绿 */
function need(g, keys) {
  const miss = keys.filter((k) => !g[k]);
  return miss.length ? '缺失元素: ' + miss.join(',') : null;
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

  const viewports = [[1600, 1000], [1440, 900], [1200, 800]];

  /* ---------- A 底部行：7 与 8 左右并排 ---------- */
  await check('A1 #bottomRow 存在且为横向 flex', async () => {
    const g = await geom(page);
    return { pass: g.bottomRowDir === 'row', detail: `flex-direction=${g.bottomRowDir}` };
  });

  for (const [w, h] of viewports) {
    await check(`A2 ${w}x${h}：三维预览(7) 与 参数调节(8) 顶部齐平（左右并排）`, async () => {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(250);
      const g = await geom(page);
      const m = need(g, ['preview', 'props']);
      if (m) return { pass: false, detail: m };
      const dTop = Math.abs(g.preview.t - g.props.t);
      const dH = Math.abs(g.preview.h - g.props.h);
      return { pass: dTop < 2 && dH < 2, detail: `顶部差=${dTop.toFixed(2)}px 高度差=${dH.toFixed(2)}px（7: ${g.preview.w}x${g.preview.h} / 8: ${g.props.w}x${g.props.h}）` };
    });

    await check(`A3 ${w}x${h}：7 紧邻 8 左侧且水平间距为 0`, async () => {
      const g = await geom(page);
      const m = need(g, ['preview', 'props']);
      if (m) return { pass: false, detail: m };
      const dx = +(g.props.l - g.preview.r).toFixed(2);
      return { pass: g.preview.r <= g.props.l + 0.6 && Math.abs(dx) < 1.2,
               detail: `水平间距=${dx}px（7右缘=${g.preview.r} 8左缘=${g.props.l}）` };
    });

    await check(`A4 ${w}x${h}：7、8 均落在左栏内，未越界到右栏`, async () => {
      const g = await geom(page);
      const m = need(g, ['left', 'preview', 'props']);
      if (m) return { pass: false, detail: m };
      const inLeft = g.preview.l >= g.left.l - 0.6 && g.props.r <= g.left.r + 0.6;
      return { pass: inLeft, detail: `左栏=[${g.left.l},${g.left.r}] 7=[${g.preview.l},${g.preview.r}] 8=[${g.props.l},${g.props.r}]` };
    });
  }

  /* ---------- B 主区：左右栏贴合 ---------- */
  for (const [w, h] of viewports) {
    // 契约演进：三区化之后，两区之间必须有一条「可拖动分隔条」，因此间距不再为 0。
    // 新契约 = 间隙恰好等于分隔条宽度 + 被分隔条完全占据 + 无边框 + 无 gap。
    // 这样既承认分隔条的存在，又继续守住「不得有多余留白」。
    await check(`B1 ${w}x${h}：左栏与电池区之间仅有可拖动分隔条（无多余间距）`, async () => {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(250);
      const g = await geom(page);
      const m = need(g, ['left', 'right', 'splitV']);
      if (m) return { pass: false, detail: m };
      if (g.mainDir !== 'row') return { pass: false, detail: `当前为堆叠模式 mainDir=${g.mainDir}` };
      if (g.leftBorderRightW === null) return { pass: false, detail: '缺失 #left' };
      const dx = +(g.right.l - g.left.r).toFixed(2);
      const gapZero = g.mainGap === '0px' || g.mainGap === 'normal' || parseFloat(g.mainGap) === 0;
      const barW = g.splitV.w;
      const noExtra = Math.abs(dx - barW) < 0.6;
      const occupied = g.splitV.l >= g.left.r - 0.6 && g.splitV.r <= g.right.l + 0.6;
      return { pass: gapZero && g.leftBorderRightW === 0 && occupied && noExtra && barW > 0 && barW <= 8,
               detail: `间距=${dx}px 分隔条宽=${barW}px 无多余=${noExtra} 占满=${occupied} border=${g.leftBorderRightW}px mainGap=${g.mainGap}` };
    });
  }

  /* ---------- C 不破坏既有结构 ---------- */
  await check('C1 2D 绘图区仍位于底部行上方且未被压扁', async () => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.waitForTimeout(250);
    const g = await geom(page);
    const m = need(g, ['vp2d', 'preview']);
    if (m) return { pass: false, detail: m };
    return { pass: g.vp2d.b <= g.preview.t + 1 && g.vp2d.h > 200,
             detail: `2D区高=${g.vp2d.h}px 底缘=${g.vp2d.b} 底部行顶=${g.preview.t}` };
  });

  await check('C2 节点画布(10) 仍占据右栏且宽度正常', async () => {
    const g = await geom(page);
    const m = need(g, ['right', 'nodeEditor']);
    if (m) return { pass: false, detail: m };
    const wk = g.nodeEditor.w / g.right.w;
    return { pass: wk > 0.9, detail: `节点画布宽=${g.nodeEditor.w} 右栏宽=${g.right.w} 占比=${(wk * 100).toFixed(1)}%` };
  });

  await check('C3 无 JS 报错', async () => {
    return { pass: errors.length === 0, detail: errors.length ? errors.slice(0, 3).join(' | ') : '无' };
  });

  await browser.close();

  const pass = results.filter((r) => r.passed).length;
  console.log('\n========== 布局分区专项回归 ==========');
  results.forEach((r) => console.log(`${r.passed ? 'PASS' : 'FAIL'}  ${r.name}\n      ${r.detail}`));
  console.log(`\n===== ${pass}/${results.length} 通过 =====`);
  process.exit(pass === results.length ? 0 : 1);
})();
