/* node modeling/tests/node_viewport.cjs [siteRoot]
   专项闸门：电池区画布缩放/平移、节点尺寸收窄、折叠、悬停功能说明。
   默认校验仓库内的 modeling/parametric；传入改动前副本目录可做反向验证。

   关注点：SVG 连线层不随画布缩放，因此判定「连线端点是否仍精确对准端口」
   是本轮改动最易出错之处 —— 缩放后若坐标系错配，端点会肉眼可见地偏离端口。 */
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

/** 读取当前画布 transform 的缩放分量与平移分量 */
function readMatrix(page) {
  return page.evaluate(() => {
    const el = document.getElementById('nodeCanvas');
    if (!el) return null;
    const t = getComputedStyle(el).transform;
    if (!t || t === 'none') return { scale: 1, x: 0, y: 0, raw: 'none' };
    const m = t.match(/matrix\(([^)]+)\)/);
    if (!m) return { scale: 1, x: 0, y: 0, raw: t };
    const p = m[1].split(',').map(Number);
    return { scale: p[0], x: p[4], y: p[5], raw: t };
  });
}

/** 连线端点 vs 端口中心的最大偏差（核心正确性） */
function wireAlignment(page) {
  return page.evaluate(() => {
    const cont = document.getElementById('nodeEditor');
    const cr = cont.getBoundingClientRect();
    const wires = Array.from(document.querySelectorAll('#wires path.wire'));
    if (!wires.length) return { n: 0, matched: 0, maxErr: -1 };
    const centers = Array.from(document.querySelectorAll('.port')).map((p) => {
      const r = p.getBoundingClientRect();
      return { x: r.left + r.width / 2 - cr.left, y: r.top + r.height / 2 - cr.top };
    });
    const near = (pt) => centers.reduce((a, c) => Math.min(a, Math.hypot(c.x - pt[0], c.y - pt[1])), Infinity);
    let maxErr = 0, matched = 0;
    for (const w of wires) {
      const d = w.getAttribute('d') || '';
      const a = d.match(/^M\s*([-\d.]+)[\s,]+([-\d.]+)/);
      const b = d.match(/([-\d.]+)[\s,]+([-\d.]+)\s*$/);
      if (!a || !b) return { n: wires.length, matched: -1, maxErr: -1 };
      const e1 = near([parseFloat(a[1]), parseFloat(a[2])]);
      const e2 = near([parseFloat(b[1]), parseFloat(b[2])]);
      maxErr = Math.max(maxErr, e1, e2);
      if (e1 < 2 && e2 < 2) matched++;
    }
    return { n: wires.length, matched, maxErr };
  });
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

  /* ---------- A 画布：缩放 / 平移 / 尺寸 ---------- */
  await check('A1 存在内层画布层 #nodeCanvas', async () => {
    const has = await page.evaluate(() => !!document.getElementById('nodeCanvas'));
    return { pass: has, detail: has ? '已存在' : '缺失：无法承载缩放平移' };
  });

  await check('A2 电池宽度已收窄至 168px', async () => {
    const w = await page.evaluate(() => {
      const n = document.querySelector('.node');
      return n ? Math.round(n.getBoundingClientRect().width) : -1;
    });
    return { pass: w === 168, detail: `实测 ${w}px（期望 168）` };
  });

  await check('A3 滚轮缩放生效且倍率标签同步', async () => {
    const before = await readMatrix(page);
    const box = await page.locator('#nodeEditor').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(200);
    const after = await readMatrix(page);
    const label = await page.evaluate(() => {
      const el = document.getElementById('nodeZoomLabel');
      return el ? el.textContent.trim() : null;
    });
    const grew = after && before && after.scale > before.scale + 0.05;
    const labeled = label && /%$/.test(label) && label !== '100%';
    return { pass: !!(grew && labeled),
             detail: `scale ${before && before.scale.toFixed(2)} → ${after && after.scale.toFixed(2)}，标签 ${label}` };
  });

  await check('A4 空白处拖动可平移画布', async () => {
    const box = await page.locator('#nodeEditor').boundingBox();
    const before = await readMatrix(page);
    // 选一块没有节点的空白区域（容器右下角）
    await page.mouse.move(box.x + box.width - 20, box.y + box.height - 20);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 80, box.y + box.height - 70, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    const after = await readMatrix(page);
    const movedX = Math.abs((after && after.x) - (before && before.x));
    const movedY = Math.abs((after && after.y) - (before && before.y));
    return { pass: movedX > 20 && movedY > 20, detail: `位移 dx=${movedX.toFixed(0)} dy=${movedY.toFixed(0)}` };
  });

  await check('A5 多档极端缩放下连线端点始终对准端口', async () => {
    const box = await page.locator('#nodeEditor').boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const rows = [];
    let worst = 0, allMatched = true, sawSmall = false, sawLarge = false;

    await page.mouse.move(cx, cy);
    // 放大档
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -240);
    await page.waitForTimeout(200);
    let m = await readMatrix(page);
    if (!m) return { pass: false, detail: '无内层画布层，无法缩放' };
    let al = await wireAlignment(page);
    rows.push(`放大 ${m.scale.toFixed(2)}× 偏差 ${al.maxErr.toFixed(2)}px`);
    worst = Math.max(worst, al.maxErr); if (al.matched !== al.n || !al.n) allMatched = false;
    if (m.scale > 1.3) sawLarge = true;

    // 缩小档
    for (let i = 0; i < 11; i++) await page.mouse.wheel(0, 240);
    await page.waitForTimeout(200);
    m = await readMatrix(page); al = await wireAlignment(page);
    rows.push(`缩小 ${m.scale.toFixed(2)}× 偏差 ${al.maxErr.toFixed(2)}px`);
    worst = Math.max(worst, al.maxErr); if (al.matched !== al.n || !al.n) allMatched = false;
    if (m.scale < 0.8) sawSmall = true;

    return { pass: allMatched && sawSmall && sawLarge && worst >= 0 && worst < 2.5,
             detail: rows.join(' | ') + `，两端 ${al.n} 条连线，最大偏差 ${worst.toFixed(2)}px` };
  });

  await check('A6 「重置」恢复原始倍率', async () => {
    if (!(await page.locator('#btnNodeReset').count())) {
      return { pass: false, detail: '缺少「重置」按钮' };
    }
    await page.locator('#btnNodeReset').click();
    await page.waitForTimeout(150);
    const m = await readMatrix(page);
    const label = await page.evaluate(() => {
      const el = document.getElementById('nodeZoomLabel');
      return el ? el.textContent.trim() : null;
    });
    return { pass: m && Math.abs(m.scale - 1) < 0.01 && Math.abs(m.x) < 1 && Math.abs(m.y) < 1 && label === '100%',
             detail: `scale=${m && m.scale.toFixed(2)} pan=(${m && m.x.toFixed(0)},${m && m.y.toFixed(0)}) 标签=${label}` };
  });

  /* ---------- B 折叠 ---------- */
  await check('B1 每个电池都有折叠按钮', async () => {
    const r = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('.node'));
      const withFold = nodes.filter((n) => n.querySelector('.node-fold')).length;
      return { total: nodes.length, withFold };
    });
    return { pass: r.total > 0 && r.withFold === r.total, detail: `${r.withFold}/${r.total} 个` };
  });

  await check('B2 折叠后节点变矮、拾取区隐藏、端口仍可见', async () => {
    const armed = await page.evaluate(() => {
      const n = Array.from(document.querySelectorAll('.node')).find((el) => el.querySelector('.pick-btn'));
      return !!(n && n.querySelector('.node-fold'));
    });
    if (!armed) return { pass: false, detail: '无折叠按钮，无法折叠' };
    const before = await page.evaluate(() => {
      const n = Array.from(document.querySelectorAll('.node')).find((el) => el.querySelector('.pick-btn'));
      return n ? n.getBoundingClientRect().height : 0;
    });
    await page.evaluate(() => {
      const n = Array.from(document.querySelectorAll('.node')).find((el) => el.querySelector('.pick-btn'));
      n.querySelector('.node-fold').click();
    });
    await page.waitForTimeout(250);
    const after = await page.evaluate(() => {
      const n = Array.from(document.querySelectorAll('.node')).find((el) => el.querySelector('.pick-btn'));
      const pb = n.querySelector('.pick-box');
      const port = n.querySelector('.port');
      return {
        h: n.getBoundingClientRect().height,
        collapsedClass: n.classList.contains('collapsed'),
        pickShown: pb ? getComputedStyle(pb).display !== 'none' : true,
        portW: port ? port.getBoundingClientRect().width : 0,
      };
    });
    return { pass: after.collapsedClass && after.h < before - 4 && !after.pickShown && after.portW > 0,
             detail: `高 ${before.toFixed(0)}→${after.h.toFixed(0)}px，拾取区可见=${after.pickShown}，端口宽=${after.portW.toFixed(0)}px` };
  });

  await check('B3 折叠态下连线仍保持且端点对准', async () => {
    const cnt = await page.locator('#wires path.wire').count();
    const al = await wireAlignment(page);
    return { pass: cnt > 0 && al.matched === al.n && al.maxErr < 2.5,
             detail: `连线${al.n}条/对准${al.matched}条/最大偏差${al.maxErr.toFixed(2)}px` };
  });

  await check('B4 再次点击可展开还原', async () => {
    const armed = await page.evaluate(() => {
      const n = Array.from(document.querySelectorAll('.node')).find((el) => el.querySelector('.pick-btn'));
      return !!(n && n.querySelector('.node-fold'));
    });
    if (!armed) return { pass: false, detail: '无折叠按钮，无法展开' };
    const before = await page.evaluate(() => {
      const n = Array.from(document.querySelectorAll('.node')).find((el) => el.querySelector('.pick-btn'));
      return n.getBoundingClientRect().height;
    });
    await page.evaluate(() => {
      const n = Array.from(document.querySelectorAll('.node')).find((el) => el.querySelector('.pick-btn'));
      n.querySelector('.node-fold').click();
    });
    await page.waitForTimeout(250);
    const after = await page.evaluate(() => {
      const n = Array.from(document.querySelectorAll('.node')).find((el) => el.querySelector('.pick-btn'));
      const pb = n.querySelector('.pick-box');
      return { h: n.getBoundingClientRect().height, pickShown: pb ? getComputedStyle(pb).display !== 'none' : false };
    });
    return { pass: after.h > before + 4 && after.pickShown,
             detail: `折叠高 ${before.toFixed(0)} → 展开 ${after.h.toFixed(0)}px，拾取区恢复=${after.pickShown}` };
  });

  /* ---------- C 悬停功能说明 ---------- */
  await check('C1 电池标题带功能说明文案', async () => {
    const r = await page.evaluate(() => {
      const heads = Array.from(document.querySelectorAll('.node-head'));
      const withDesc = heads.filter((h) => h.dataset.desc && h.dataset.desc.length > 10).length;
      return { total: heads.length, withDesc };
    });
    return { pass: r.total > 0 && r.withDesc === r.total, detail: `${r.withDesc}/${r.total} 个标题带说明` };
  });

  await check('C2 悬停标题后说明浮层实际渲染出文案', async () => {
    const head = page.locator('.node-head').first();
    await head.hover();
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const h = document.querySelector('.node-head');
      const cs = getComputedStyle(h, '::after');
      return { opacity: parseFloat(cs.opacity), vis: cs.visibility, content: cs.content || 'none' };
    });
    // 关键：必须校验 content 真的渲染出说明文案。
    // 缺少 .has-desc 规则时 ::after 的 content 为 none，而 opacity/visibility 仍是默认值，
    // 只判可见性会得出「永远通过」的假绿。
    const hasText = r.content && r.content !== 'none' && r.content.length > 12;
    return { pass: r.opacity > 0.5 && r.vis === 'visible' && hasText,
             detail: `opacity=${r.opacity} visibility=${r.vis} 文案长度=${r.content.length}` };
  });

  /* ---------- Z 无脚本异常 ---------- */
  await check('Z 无页面脚本错误', async () => {
    return { pass: errors.length === 0, detail: errors.length ? errors.join(' | ') : '无' };
  });

  await page.screenshot({ path: path.join(out, 'node_viewport.png') });
  await browser.close();

  const passed = results.filter((r) => r.passed).length;
  const lines = results.map((r) => `${r.passed ? 'PASS' : 'FAIL'}  ${r.name}  — ${r.detail}`);
  const summary = `\n===== node_viewport ${passed}/${results.length} 通过 =====\n`;
  fs.writeFileSync(path.join(out, 'node_viewport.txt'), lines.join('\n') + summary);
  console.log(lines.join('\n') + summary);
  if (passed !== results.length) process.exitCode = 1;
}

run().catch((e) => { console.error(e.stack); process.exitCode = 1; });
