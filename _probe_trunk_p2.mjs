'use strict';
/* _probe_trunk_p2.mjs —— 二期验收：捕捉引擎 + 状态栏 + 常驻提示条
 *
 * 判据全部落在可观测面上：
 *   状态栏文本串、RyTrunkSnap.stats()、白圈标记是否在 DOM 里、点击后的落点坐标。
 * 特别验两条"错了但看不出来"的：
 *   · 缺数据必须是「—」而不是 0.00（伪造 0 高差会被拿去做水力判断）
 *   · 切换地块后状态栏不许残留上一块的值
 *
 * 用法：node _probe_trunk_p2.mjs
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
const APP = 'file:///' + path.join(ROOT, 'index.html').split(path.sep).join('/') + '?full=1&rymock=L2#onlineMapSection';

const PLOTS = [
  { id: 'p2-a', name: 'P2-A', sqm: 23500, mu: 35.25, ts: 300, areaM2: 23500, source: 'map',
    polyLatLng: [[18.2, 109.5], [18.2, 109.502], [18.201, 109.502], [18.201, 109.5]] },
  /* 第二块：验"切地块后状态栏不残留"，且它带一条 v1 总管（顺便验迁移后能显示） */
  { id: 'p2-b', name: 'P2-B', sqm: 36000, mu: 54, ts: 200, areaM2: 36000, source: 'map',
    polyLatLng: [[18.21, 109.51], [18.21, 109.513], [18.2115, 109.513], [18.2115, 109.51]],
    trunk: { schema: 1, source: 'map', coordinateSystem: 'GCJ-02', revision: 4,
      points: [[18.2105, 109.5105], [18.2112, 109.5125]] } },
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
    if (!localStorage.getItem('__p2_seed')) {
      localStorage.setItem('runye_plot_library', JSON.stringify(plots));
      localStorage.setItem('runyeLocalAdminSession', '1');
      localStorage.setItem('__p2_seed', '1');
    }
  }, PLOTS);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  const dialogs = [];
  page.on('dialog', d => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });

  /* 公告层（.ry-ann-mask / .ry-ann-list）会盖住整张地图，把点击全吃掉。
     只压制样式、不删节点 —— 容器可能被页面 JS 引用。 */
  const killMask = async () => {
    await page.evaluate(() => {
      if (document.getElementById('__probe_mask_kill')) return;
      const st = document.createElement('style'); st.id = '__probe_mask_kill';
      st.textContent = '[class*="ry-ann"]{display:none!important;pointer-events:none!important}';
      document.head.appendChild(st);
    });
  };

  const statusText = () => page.evaluate(() => {
    const el = document.getElementById('mapStatusbar');
    return el ? el.textContent.replace(/\s+/g, '') : '';
  });
  const snapStats = () => page.evaluate(() => window.RyTrunkSnap.stats());
  const markerCount = () => page.evaluate(() => document.querySelectorAll('#map path.leaflet-interactive').length);

  await page.goto(APP, { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction(() => window.RyMapHost && window.RyTrunkSchema && window.RyTrunkSnap, null, { timeout: 30000 });
  await killMask();
  await page.waitForTimeout(900);

  /* ---------- C1 状态栏结构 ---------- */
  const sbExists = await page.evaluate(() => !!document.getElementById('mapStatusbar'));
  rec('C1a 状态栏存在', sbExists);
  const emptyText = await statusText();
  rec('C1b 未选地块时五字段全为「—」', emptyText === '总管：—｜投影：—｜高差：—｜流速：—｜捕捉：开启', emptyText);
  rec('C1c 分隔符是全角 ｜ 且无 0.00', emptyText.includes('｜') && !emptyText.includes('0.00'), emptyText);

  /* ---------- 选地块：v1 总管应能显示（迁移后） ---------- */
  await killMask();
  await page.locator('#myPlotList .place-item[data-plot-id="p2-b"] .place-go').click();
  await page.waitForTimeout(1200);
  const withTrunk = await statusText();
  rec('C2a 选中带 v1 总管的地块后，总管编号显示出来', /总管：T\d/.test(withTrunk), withTrunk);
  rec('C2b 无高程数据时高差是「—」而不是 0.00', withTrunk.includes('高差：—') && !withTrunk.includes('0.00'), withTrunk);
  rec('C2c 无管径/流量时流速是「—」', withTrunk.includes('流速：—'), withTrunk);
  rec('C2d 投影显示实际长度（不是 —）', /投影：[\d.]+ ?m/.test(withTrunk), withTrunk);

  /* ---------- 切到 p2-a：状态栏必须清空，不许残留 ---------- */
  await killMask();
  await page.locator('#myPlotList .place-item[data-plot-id="p2-a"] .place-go').click();
  await page.waitForTimeout(1200);
  const switched = await statusText();
  rec('C3 切到无总管地块后状态栏清空（不残留上一块）',
    switched === '总管：—｜投影：—｜高差：—｜流速：—｜捕捉：开启', switched);

  /* ---------- C4 进入绘制：提示条 ---------- */
  await killMask();
  await page.locator('#btnDrawTrunk').click();
  await page.waitForTimeout(600);
  const hint = await page.evaluate(() => {
    const el = document.getElementById('mapTrunkHint');
    return { hidden: el.hidden, text: el.textContent, visible: el.offsetParent !== null };
  });
  rec('C4 常驻提示条出现且含关键操作', !hint.hidden && hint.visible &&
    hint.text.includes('双击') && hint.text.includes('Esc'), JSON.stringify(hint));

  /* ---------- C5 捕捉候选 ---------- */
  const st1 = await snapStats();
  rec('C5a 已采集候选点（地块顶点 4 个）', st1.total >= 4 && (st1.byKind['plot-vertex'] || 0) >= 4,
    JSON.stringify({ total: st1.total, byKind: st1.byKind }));
  rec('C5b 阈值是 10px / 0.3m 两个独立量', st1.snapPx === 10 && st1.mergeM === 0.3, `${st1.snapPx}/${st1.mergeM}`);

  /* 把鼠标移到第 1 个顶点旁 6px 处 —— 必须吸住 */
  const box = await page.locator('#map').boundingBox();
  const vtx = await page.evaluate(() => {
    const plot = JSON.parse(localStorage.getItem('runye_plot_library')).find(p => p.id === 'p2-a');
    return plot.polyLatLng.map(([lat, lng]) => window.RyMapHost.project(lat, lng));
  });
  rec('C5c 拿到 4 个顶点屏幕坐标', vtx.length === 4, JSON.stringify(vtx.map(v => [Math.round(v.x), Math.round(v.y)])));

  await page.mouse.move(box.x + vtx[0].x + 6, box.y + vtx[0].y + 2);
  await page.waitForTimeout(300);
  const near = await snapStats();
  rec('C5d 光标靠近顶点 6px → 吸住该顶点',
    !!near.lastHit && near.lastHit.kind === 'plot-vertex' && near.lastHit.dist <= 10,
    JSON.stringify(near.lastHit));

  const markerVisible = await page.evaluate(() => {
    /* 标记带固定 className（Leaflet 会把它加到 <path> 上）；不按 fill 颜色猜 —— */
    const el = document.querySelector('#map path.ry-snap-mark');
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  rec('C5e 白圈标记已渲染且可见', markerVisible);

  /* 移远 → 标记消失 */
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.2);
  await page.waitForTimeout(300);
  const far = await snapStats();
  rec('C5f 移远后不吸（lastHit 清空）', far.lastHit === null, JSON.stringify(far.lastHit));

  /* ---------- C6 点击落点 = 顶点坐标（逐位相等） ---------- */
  await page.mouse.move(box.x + vtx[1].x + 5, box.y + vtx[1].y - 3);
  await page.waitForTimeout(200);
  await page.mouse.click(box.x + vtx[1].x + 5, box.y + vtx[1].y - 3);
  await page.waitForTimeout(300);
  const draftPt = await page.evaluate(() => {
    /* 草稿点没有对外出口，用 trunkState 的 draftPoints 加"线段端点"双重确认：
       这里直接读 Leaflet 画出来的紫色虚线端点更可靠 —— 但更简单的是看吸附是否把点定在顶点上：
       吸附命中时落点应严格等于目标点的经纬度。 */
    const st = window.RyMapHost.trunkState();
    return st;
  });
  rec('C6a 点击后草稿有 1 个点', draftPt.draftPoints === 1, 'draft=' + draftPt.draftPoints);

  /* 再点第二个顶点（隔开避免双击判定），完成后查库里的点是否就是顶点坐标 */
  await page.mouse.move(box.x + vtx[2].x - 4, box.y + vtx[2].y + 5);
  await page.waitForTimeout(220);
  await page.mouse.click(box.x + vtx[2].x - 4, box.y + vtx[2].y + 5);
  await page.waitForTimeout(220);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);
  const saved = await page.evaluate(() => {
    const s = window.RyPlotLibraryStore.read();
    const plot = (s.plots || []).find(p => p.id === 'p2-a');
    return plot && plot.trunk ? plot.trunk.trunks[0].points : null;
  });
  const ring = await page.evaluate(() => {
    const plot = JSON.parse(localStorage.getItem('runye_plot_library')).find(p => p.id === 'p2-a');
    return plot.polyLatLng;
  });
  /* 吸附命中 ⇒ 落点必须**逐位等于**某个顶点，不是"接近" */
  const exact = !!saved && saved.length === 2 && saved.every(pt => {
    const lat = Array.isArray(pt) ? pt[0] : pt.lat, lng = Array.isArray(pt) ? pt[1] : pt.lng;
    return ring.some(([rlat, rlng]) => Math.abs(rlat - lat) < 1e-12 && Math.abs(rlng - lng) < 1e-12);
  });
  rec('C6b 两个落点逐位等于地块顶点（捕捉真的生效，不是"看起来近"）',
    exact, JSON.stringify(saved));

  /* ---------- C7 关捕捉后不吸 ---------- */
  await killMask();
  await page.locator('#btnDrawTrunk').click();
  await page.waitForTimeout(400);
  await page.locator('#btnSnapToggle').click();
  await page.waitForTimeout(300);
  const offText = await statusText();
  rec('C7a 关闭后状态栏与按钮同步为「关闭」', offText.includes('捕捉：关闭'), offText);

  const vx0 = await page.evaluate(() => {
    const plot = JSON.parse(localStorage.getItem('runye_plot_library')).find(p => p.id === 'p2-a');
    return window.RyMapHost.project(plot.polyLatLng[0][0], plot.polyLatLng[0][1]);
  });
  await page.mouse.move(box.x + vx0.x + 2, box.y + vx0.y + 2);
  await page.waitForTimeout(300);
  const offSnap = await snapStats();
  rec('C7b 关闭后即使 2px 也不吸', offSnap.lastHit === null, JSON.stringify(offSnap.lastHit));

  /* 快捷键 S 打开 */
  await page.keyboard.press('s');
  await page.waitForTimeout(300);
  const onText = await statusText();
  rec('C7c 快捷键 S 重新打开捕捉', onText.includes('捕捉：开启'), onText);

  /* ---------- C8 投影随光标增长 ---------- */
  await page.mouse.click(box.x + vx0.x, box.y + vx0.y);
  await page.waitForTimeout(250);
  await page.mouse.move(box.x + vx0.x + 200, box.y + vx0.y + 120);
  await page.waitForTimeout(300);
  const projText = await statusText();
  const projVal = parseFloat((projText.match(/投影：([\d.]+)/) || [])[1] || '0');
  rec('C8 绘制中投影随光标变大（>0）', projVal > 0, 'proj=' + projVal + 'm');

  /* ---------- C9 Esc 收尾，提示条消失 ---------- */
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  const hintAfter = await page.evaluate(() => {
    const el = document.getElementById('mapTrunkHint');
    return { hidden: el.hidden, visible: el.offsetParent !== null };
  });
  rec('C9 Esc 后提示条隐藏', hintAfter.hidden && !hintAfter.visible, JSON.stringify(hintAfter));

  rec('C10 无 pageerror', pageErrors.length === 0, pageErrors.join(' | ') || '(none)');
  rec('C11 无意外弹窗', dialogs.length === 0, JSON.stringify(dialogs));

  const shot = path.join(ROOT, '_shots', 'p2-statusbar.png');
  fs.mkdirSync(path.dirname(shot), { recursive: true });
  await page.screenshot({ path: shot }).catch(() => {});

  const fail = out.filter(o => !o[1]).length;
  console.log(`\n== trunk-p2: ${out.length - fail}/${out.length} 通过 ==`);
  fs.writeFileSync(path.join(ROOT, '_probe_trunk_p2_out.json'), JSON.stringify({ out, pageErrors, dialogs }, null, 2));
  await browser.close();
  process.exitCode = fail ? 1 : 0;
})();
