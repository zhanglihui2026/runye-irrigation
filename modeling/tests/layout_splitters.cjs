/* node modeling/tests/layout_splitters.cjs [siteRoot]
   专项闸门：三区（A 绘图区 / B 参数+三维区 / C 电池区）之间的可拖动分隔条。
   默认校验仓库内的 modeling/parametric；传入改动前副本目录可做反向验证。

   关注点：拖动不能只改 CSS 盒子尺寸 —— 三个区里的 canvas 位图必须随之重绘，
   否则会出现「布局变了、画面却拉伸或错位」的假象。因此 D 组直接比对
   canvas 的位图尺寸（width/height 属性），而不是容器尺寸。 */
const fs = require('node:fs'), path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const root = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '../..');
const out = path.join(root, '_modeling_verify');
fs.mkdirSync(out, { recursive: true });
const target = pathToFileURL(path.join(root, 'modeling/parametric/index.html')).href;

const results = [];
function check(name, fn) { return Promise.resolve()
  .then(fn)
  .then(r => results.push({ name, passed: !!(r && r.pass), detail: (r && r.detail) || '' }))
  .catch(e => results.push({ name, passed: false, detail: '异常: ' + e.message })); }

/** 三区几何 + canvas 位图尺寸 + 内联样式 + 主轴方向 */
function geom(page) {
  return page.evaluate(() => {
    const g = (id) => {
      const e = document.getElementById(id);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { w: r.width, h: r.height, x: r.x, y: r.y, r: r.right, b: r.bottom };
    };
    const bmp = (id) => { const e = document.getElementById(id); return e ? { w: e.width, h: e.height } : null; };
    const el = (id) => document.getElementById(id);
    const br = el('bottomRow'), lf = el('left');
    return {
      vp2dWrap: g('vp2dWrap'), bottomRow: g('bottomRow'), left: g('left'), right: g('right'),
      splitH: g('splitH'), splitV: g('splitV'), main: g('main'),
      bmp2d: bmp('vp2d'), bmp3d: bmp('vp3d'),
      inlineBottomH: br ? br.style.height : null,
      inlineLeftW: lf ? lf.style.width : null,
      inlineLeftH: lf ? lf.style.height : null,
      mainDir: el('main') ? getComputedStyle(el('main')).flexDirection : null,
    };
  });
}

/** 轮询至布局与画布位图稳定（避免固定 sleep 量到中间态） */
async function settle(page) {
  let prev = null;
  for (let i = 0; i < 25; i++) {
    const g = await geom(page);
    const sig = JSON.stringify([
      g.vp2dWrap && Math.round(g.vp2dWrap.h), g.bottomRow && Math.round(g.bottomRow.h),
      g.left && Math.round(g.left.w), g.left && Math.round(g.left.h), g.bmp2d, g.bmp3d,
    ]);
    if (sig === prev) return g;
    prev = sig;
    await page.waitForTimeout(60);
  }
  return geom(page);
}

/** 按住分隔条拖动指定位移 */
async function dragBy(page, sel, dx, dy) {
  const box = await page.locator(sel).boundingBox({ timeout: 2000 }).catch(() => null);
  if (!box) return false;
  const sx = box.x + box.width / 2, sy = box.y + box.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + dx, sy + dy, { steps: 10 });
  await page.mouse.up();
  return true;
}

async function run() {
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

  /* ---------- A 分隔条存在性与默认态 ---------- */
  await check('A1 两条分隔条 #splitH / #splitV 均存在', async () => {
    const g = await geom(page);
    return { pass: !!g.splitH && !!g.splitV,
             detail: `splitH=${g.splitH ? '有' : '缺失'} splitV=${g.splitV ? '有' : '缺失'}` };
  });

  await check('A2 默认不写任何内联尺寸（未拖动 = 不改动观感）', async () => {
    const g = await geom(page);
    const clean = g.inlineBottomH === '' && g.inlineLeftW === '' && g.inlineLeftH === '';
    return { pass: clean,
             detail: `bottomH="${g.inlineBottomH}" leftW="${g.inlineLeftW}" leftH="${g.inlineLeftH}"` };
  });

  await check('A3 #splitH 位于绘图区与「参数+三维」区之间', async () => {
    const g = await geom(page);
    if (!g.splitH || !g.vp2dWrap || !g.bottomRow) return { pass: false, detail: '缺失必要元素' };
    const ok = g.splitH.y >= g.vp2dWrap.b - 1 && g.splitH.b <= g.bottomRow.y + 1;
    return { pass: ok, detail: `绘图区底=${g.vp2dWrap.b.toFixed(1)} 条=${g.splitH.y.toFixed(1)}~${g.splitH.b.toFixed(1)} B区顶=${g.bottomRow.y.toFixed(1)}` };
  });

  await check('A4 #splitV 位于左侧两区与电池区之间', async () => {
    const g = await geom(page);
    if (!g.splitV || !g.left || !g.right) return { pass: false, detail: '缺失必要元素' };
    const ok = g.splitV.x >= g.left.r - 1 && g.splitV.r <= g.right.x + 1;
    return { pass: ok, detail: `左栏右=${g.left.r.toFixed(1)} 条=${g.splitV.x.toFixed(1)}~${g.splitV.r.toFixed(1)} 电池区左=${g.right.x.toFixed(1)}` };
  });

  await check('A5 分隔条保持细线宽度（≤8px，不破坏贴合观感）', async () => {
    const g = await geom(page);
    if (!g.splitH || !g.splitV) return { pass: false, detail: '缺失分隔条' };
    return { pass: g.splitH.h <= 8 && g.splitV.w <= 8,
             detail: `splitH 高=${g.splitH.h}px splitV 宽=${g.splitV.w}px` };
  });

  /* ---------- B 拖动 #splitH：A ↔ B ---------- */
  const base = await settle(page);
  const baseA = base.vp2dWrap.h, baseB = base.bottomRow.h;
  const baseBmpA = base.bmp2d.h;

  await check('B1 向下拖动：B 区变矮、A 区变高，总高守恒', async () => {
    const ok = await dragBy(page, '#splitH', 0, 120);
    if (!ok) return { pass: false, detail: '无法抓取 #splitH' };
    const g = await settle(page);
    const dA = g.vp2dWrap.h - baseA, dB = g.bottomRow.h - baseB;
    const sumOk = Math.abs((g.vp2dWrap.h + g.bottomRow.h) - (baseA + baseB)) < 8;
    return { pass: dB < -100 && dA > 100 && sumOk,
             detail: `A ${baseA.toFixed(0)}→${g.vp2dWrap.h.toFixed(0)} (${dA > 0 ? '+' : ''}${dA.toFixed(0)}) / B ${baseB.toFixed(0)}→${g.bottomRow.h.toFixed(0)} (${dB.toFixed(0)}) 总高差=${((g.vp2dWrap.h + g.bottomRow.h) - (baseA + baseB)).toFixed(1)}` };
  });

  await check('B2 拖动后 A 区画布位图随之重绘（不是拉伸）', async () => {
    const g = await settle(page);
    const moved = Math.abs(g.bmp2d.h - baseBmpA);
    const matches = Math.abs(g.bmp2d.h - g.vp2dWrap.h) <= 2;
    return { pass: moved > 100 && matches,
             detail: `画布位图高 ${baseBmpA}→${g.bmp2d.h}（容器高 ${g.vp2dWrap.h.toFixed(0)}，偏差 ${Math.abs(g.bmp2d.h - g.vp2dWrap.h).toFixed(1)}px）` };
  });

  await check('B3 反向拖动：B 区变高、A 区变矮', async () => {
    const before = await settle(page);
    const ok = await dragBy(page, '#splitH', 0, -200);
    if (!ok) return { pass: false, detail: '无法抓取 #splitH' };
    const g = await settle(page);
    return { pass: g.bottomRow.h - before.bottomRow.h > 150 && g.vp2dWrap.h < before.vp2dWrap.h,
             detail: `B ${before.bottomRow.h.toFixed(0)}→${g.bottomRow.h.toFixed(0)} / A ${before.vp2dWrap.h.toFixed(0)}→${g.vp2dWrap.h.toFixed(0)}` };
  });

  await check('B4 拖到极限仍保底：A、B 各自不小于 120px', async () => {
    await dragBy(page, '#splitH', 0, -2000);
    let g = await settle(page);
    const up = { A: g.vp2dWrap.h, B: g.bottomRow.h };
    await dragBy(page, '#splitH', 0, 3000);
    g = await settle(page);
    const down = { A: g.vp2dWrap.h, B: g.bottomRow.h };
    const moved = up.B - down.B;   // 无拖动功能时该值为 0，可反证闸门有效
    return { pass: up.A >= 119 && up.B >= 119 && down.A >= 119 && down.B >= 119 && moved > 100,
             detail: `上极限 A=${up.A.toFixed(0)}/B=${up.B.toFixed(0)}，下极限 A=${down.A.toFixed(0)}/B=${down.B.toFixed(0)}，两极差=${moved.toFixed(0)}` };
  });

  await check('B5 双击复位：内联样式清空且高度回到默认', async () => {
    await page.locator('#splitH').dblclick({ timeout: 2000 });
    const g = await settle(page);
    const back = Math.abs(g.bottomRow.h - baseB) < 3;
    return { pass: g.inlineBottomH === '' && back,
             detail: `内联高度="${g.inlineBottomH}" 高度 ${g.bottomRow.h.toFixed(0)}（默认 ${baseB.toFixed(0)}）` };
  });

  /* ---------- C 拖动 #splitV：左侧两区 ↔ 电池区（宽屏左右） ---------- */
  await check('C1 向左拖动：左栏变窄、电池区变宽', async () => {
    const before = await settle(page);
    const ok = await dragBy(page, '#splitV', -200, 0);
    if (!ok) return { pass: false, detail: '无法抓取 #splitV' };
    const g = await settle(page);
    const dL = g.left.w - before.left.w, dR = g.right.w - before.right.w;
    return { pass: dL < -150 && dR > 150,
             detail: `左栏 ${before.left.w.toFixed(0)}→${g.left.w.toFixed(0)} (${dL.toFixed(0)}) / 电池区 ${before.right.w.toFixed(0)}→${g.right.w.toFixed(0)} (+${dR.toFixed(0)})` };
  });

  await check('C2 拖动后电池区画布随之重排（位图宽度匹配容器）', async () => {
    const g = await settle(page);
    const ne = await page.evaluate(() => {
      const e = document.getElementById('nodeEditor');
      return e ? Math.round(e.getBoundingClientRect().width) : -1;
    });
    const fits = ne > 0 && ne <= Math.round(g.right.w) + 2;
    // C1 已把电池区拉宽约 200，节点画布应显著宽于默认；否则说明重排没跟上
    const widened = ne > base.right.w + 50;
    return { pass: fits && widened,
             detail: `节点画布宽=${ne}（默认 ${base.right.w.toFixed(0)}）电池区宽=${g.right.w.toFixed(0)}` };
  });

  await check('C3 拖到极限仍保底：两侧各自不小于 260px', async () => {
    await dragBy(page, '#splitV', -3000, 0);
    let g = await settle(page);
    const narrow = { L: g.left.w, R: g.right.w };
    await dragBy(page, '#splitV', 4000, 0);
    g = await settle(page);
    const wide = { L: g.left.w, R: g.right.w };
    const moved = wide.L - narrow.L;   // 无拖动功能时该值为 0
    return { pass: narrow.L >= 259 && narrow.R >= 259 && wide.L >= 259 && wide.R >= 259 && moved > 100,
             detail: `左极限 L=${narrow.L.toFixed(0)}/R=${narrow.R.toFixed(0)}，右极限 L=${wide.L.toFixed(0)}/R=${wide.R.toFixed(0)}，两极差=${moved.toFixed(0)}` };
  });

  await check('C4 双击复位：宽度回到默认且内联样式清空', async () => {
    await page.locator('#splitV').dblclick({ timeout: 2000 });
    const g = await settle(page);
    // 复位后回到 CSS 默认的左右等分（#right 有 640px 最小宽，宽屏下等分即可）
    const equal = Math.abs(g.left.w - g.right.w) < 12;
    return { pass: g.inlineLeftW === '' && g.inlineLeftH === '' && equal,
             detail: `内联 leftW="${g.inlineLeftW}" leftH="${g.inlineLeftH}"；左=${g.left.w.toFixed(0)} 右=${g.right.w.toFixed(0)}` };
  });

  /* ---------- D 三区联动重绘 ---------- */
  let d1Before3dW = null;
  await check('D1 拖竖条后绘图区画布位图宽度同步变化', async () => {
    const before = await settle(page);
    d1Before3dW = before.bmp3d ? before.bmp3d.w : null;
    const ok = await dragBy(page, '#splitV', -260, 0);
    if (!ok) return { pass: false, detail: '无法抓取 #splitV' };
    const g = await settle(page);
    const moved = before.bmp2d.w - g.bmp2d.w;
    const matches = Math.abs(g.bmp2d.w - g.vp2dWrap.w) <= 2;
    return { pass: moved > 200 && matches,
             detail: `画布位图宽 ${before.bmp2d.w}→${g.bmp2d.w}（容器宽 ${g.vp2dWrap.w.toFixed(0)}）` };
  });

  await check('D2 拖竖条后三维预览画布位图同步变化', async () => {
    const g = await settle(page);
    const pv = await page.evaluate(() => {
      const e = document.getElementById('previewWrap');
      const c = document.getElementById('vp3d');
      return { cw: Math.round(e.getBoundingClientRect().width), bw: c.width };
    });
    const moved = d1Before3dW == null ? 0 : Math.abs(pv.bw - d1Before3dW);
    return { pass: Math.abs(pv.bw - pv.cw) <= 2 && moved > 50,
             detail: `三维画布位图宽 ${d1Before3dW}→${pv.bw}（变化 ${moved}）容器宽=${pv.cw}` };
  });

  await page.screenshot({ path: path.join(out, 'splitters_wide.png') });

  /* ---------- E 堆叠模式（矮屏）：竖条自动转横向 ----------
     独立开一个矮屏页面，而不是把现有页面 setViewportSize —— 后者会留下中间态
     （实测切换后 #left 停在 537px 而非媒体查询的 750px）。独立页面等同真实场景。 */
  const page2 = await browser.newPage({ viewport: { width: 1080, height: 612 } });
  page2.on('pageerror', (e) => errors.push(e.message));
  page2.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page2.goto(target);
  await page2.waitForSelector('.node', { timeout: 15000 });
  await page2.waitForTimeout(400);

  await check('E1 矮屏堆叠模式下 #splitV 转为横向拖动', async () => {
    const g = await settle(page2);
    if (!g.splitV) return { pass: false, detail: '缺失 #splitV' };
    const st = await page2.evaluate(() => {
      const e = document.getElementById('splitV');
      const cs = getComputedStyle(e);
      return { cls: e.className, cursor: cs.cursor, h: e.getBoundingClientRect().height,
               aria: e.getAttribute('aria-orientation'),
               dir: getComputedStyle(document.getElementById('main')).flexDirection };
    });
    return { pass: g.mainDir === 'column' && st.cursor === 'row-resize' && /as-row/.test(st.cls) && st.aria === 'horizontal',
             detail: `mainDir=${st.dir} cursor=${st.cursor} class="${st.cls}" 条高=${st.h.toFixed(0)}px` };
  });

  await check('E2 堆叠模式下拖动竖条改变左栏高度', async () => {
    // 矮屏下 #splitV 位于页面下方（y≈825），需先滚动到视野内才抓得到
    await page2.locator('#splitV').scrollIntoViewIfNeeded({ timeout: 2000 });
    const before = await settle(page2);
    const ok = await dragBy(page2, '#splitV', 0, 120);
    if (!ok) return { pass: false, detail: '无法抓取 #splitV' };
    const g = await settle(page2);
    const dH = g.left.h - before.left.h;
    return { pass: Math.abs(dH - 120) < 12,
             detail: `左栏高 ${before.left.h.toFixed(0)}→${g.left.h.toFixed(0)}（位移 +120，实得 ${dH.toFixed(0)}）` };
  });

  await check('E3 堆叠模式下横条仍可上下拖动', async () => {
    await page2.locator('#splitH').scrollIntoViewIfNeeded({ timeout: 2000 });
    const before = await settle(page2);
    const ok = await dragBy(page2, '#splitH', 0, -80);
    if (!ok) return { pass: false, detail: '无法抓取 #splitH' };
    const g = await settle(page2);
    return { pass: g.bottomRow.h - before.bottomRow.h > 60,
             detail: `B 区高 ${before.bottomRow.h.toFixed(0)}→${g.bottomRow.h.toFixed(0)}` };
  });

  await page2.screenshot({ path: path.join(out, 'splitters_stacked.png') });

  await check('F1 全程无 JS 报错', async () => {
    return { pass: errors.length === 0, detail: errors.length ? errors.slice(0, 3).join(' | ') : '无' };
  });

  const pass = results.filter((r) => r.passed).length;
  console.log('\n===== ' + pass + '/' + results.length + ' 通过 =====');
  for (const r of results) {
    console.log((r.passed ? 'PASS  ' : 'FAIL  ') + r.name + (r.detail ? '  — ' + r.detail : ''));
  }
  await browser.close();
  process.exit(pass === results.length ? 0 : 1);
}

run().catch((e) => { console.error(e); process.exit(1); });
