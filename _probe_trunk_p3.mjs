'use strict';
/* _probe_trunk_p3.mjs —— 三期验收：选中 / 拖拐点 / 右键 6 项菜单 / 打断 / 合并 / 参数剪贴板
 *
 * 判据全部落在「库里的数据」和「DOM 上的可观测结果」，不看截图猜：
 *   ① 拖拐点后查 localStorage 里那个点的经纬度，逐位比较，不用"看起来动了"
 *   ② 打断后两段的坐标并集必须**严格等于**打断前的坐标集合（multiset 比较）
 *   ③ 合并后编号与参数必须等于「列表里在前那条」—— 这是用户点名的语义
 *   ④ 菜单 6 项文案与顺序逐字比对（以后有人插一项在中间，这条会立刻红）
 *
 * 与任务书 §6.5 的一处偏差（如实记录，不是漏做）：
 *   C1 原文要求「拖 15px 后状态栏投影变化」。15px 在 fitBounds 后约 6.5 m，
 *   对一条 320 m 的线只改 2.8 m —— 能变，但**只要视图缩放稍有不同就可能落到同一
 *   个一位小数上**，从而假红。所以这里拆成两条更强的判据：
 *     C1a 点数不变 / C1b 该拐点坐标逐位变了（直接查库，不受缩放影响）
 *     C1c 投影字符串确实变了（同样的 15px 拖动）
 *   两条都过才算"拖动真的改了数据、状态栏真的跟着数据走"。
 *
 * 用法：node _probe_trunk_p3.mjs
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

/* ── 种子数据 ────────────────────────────────────────────────────────────
   坐标系是 GCJ-02（与 plot.trunk 契约一致）。为了让"拖 15px"的位移量可读，
   地块取 0.002°(≈222m) × 0.005°(≈528m)，fitBounds 后约 2.3 px/m。
   T1 造一个浅 V（中间拐点离底边 39m）：顶点竖直挪 6.5m 会让总长变 ~2.8m，
   落在 fmtLen 的 toFixed(1) 上才看得见 —— 直线的话怎么拖都不变，等于白测。
   T2 的**起点严格等于 T1 的终点**，这是"相连"的唯一判据（0.3 m 容差内）。 */
const RING_A = [[18.2500, 109.5180], [18.2500, 109.5230], [18.2520, 109.5230], [18.2520, 109.5180]];
const T1_PTS = [[18.2505, 109.5190], [18.25085, 109.5205], [18.2505, 109.5220]];
const T2_PTS = [[18.2505, 109.5220], [18.2514, 109.5227]];
/* T3 要压在 T1 下方：T1 在 C2 之后会变成一条 lat=18.2505 的**水平直线**
   （中间拐点被并掉），如果 T3 的中间拐点也落在 lat=18.2505 上，两条线会在那一点交叉，
   右键就打到 T1 上去了（上一版的假红就是这么来的，不是代码问题，是种子数据退化）。
   所以 T3 整体下沉 0.0002°(≈22m ≈ 50px)，保留"能在两个拐点之间取到线身中点"这个前提。 */
const T3_PTS = [[18.2502, 109.5185], [18.25025, 109.5198], [18.2503, 109.5210]];

const PLOTS = [
  { id: 'p3-a', name: 'P3-A', sqm: 12000, mu: 18, ts: 300, areaM2: 12000, source: 'map',
    polyLatLng: RING_A,
    trunk: { schema: 2, source: 'map', coordinateSystem: 'GCJ-02', revision: 7, trunks: [
      { id: 'T1', main: true, points: T1_PTS, params: { material: 'PE', dn: 63, designFlow: 12.5 } },
      { id: 'T2', main: false, points: T2_PTS, params: { material: 'PVC', dn: 50, designFlow: 8 } },
      { id: 'T3', main: false, points: T3_PTS, params: { material: 'PE', dn: 90, designFlow: 20 } },
    ] } },
  /* 只有一条干线：验「删掉最后一条 ⇒ trunk=null、状态栏回 —」 */
  { id: 'p3-b', name: 'P3-B', sqm: 9000, mu: 13.5, ts: 200, areaM2: 9000, source: 'map',
    polyLatLng: [[18.2610, 109.5310], [18.2610, 109.5330], [18.2625, 109.5330], [18.2625, 109.5310]],
    trunk: { schema: 2, source: 'map', coordinateSystem: 'GCJ-02', revision: 3, trunks: [
      { id: 'T1', main: true, points: [[18.2614, 109.5316], [18.2622, 109.5326]], params: { material: 'PE', dn: 75, designFlow: 15 } },
    ] } },
];

const MENU_EXPECT = ['1. 删除这条干线', '2. 在拐点处打断', '3. 与相连干线合并',
  '4. 复制参数', '5. 粘贴参数', '6. 标记当前拐点'];

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
    if (!localStorage.getItem('__p3_seed')) {
      localStorage.setItem('runye_plot_library', JSON.stringify(plots));
      localStorage.setItem('runyeLocalAdminSession', '1');
      localStorage.setItem('__p3_seed', '1');
    }
  }, PLOTS);

  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  /* confirm 一律接受；prompt 给一个固定答案 —— 菜单里的「标记当前拐点」要它 */
  const dialogs = [];
  page.on('dialog', async d => {
    dialogs.push({ type: d.type(), message: d.message() });
    try {
      if (d.type() === 'prompt') await d.accept('三通口');
      else await d.accept();
    } catch (e) { }
  });

  const killMask = async () => {
    await page.evaluate(() => {
      if (document.getElementById('__probe_mask_kill')) return;
      /* 公告层会盖住整张地图把点击全吃掉（二期踩过：domClicks=0、页面不报错）。
         只压样式不删节点 —— 容器可能被页面 JS 引用。 */
      const st = document.createElement('style'); st.id = '__probe_mask_kill';
      st.textContent = '[class*="ry-ann"]{display:none!important;pointer-events:none!important}';
      document.head.appendChild(st);
    });
  };

  const statusText = () => page.evaluate(() => {
    const el = document.getElementById('mapStatusbar');
    return el ? el.textContent.replace(/\s+/g, '') : '';
  });
  const projOf = async () => {
    const t = await statusText();
    const m = t.match(/投影：([\d.]+)/);
    return m ? Number(m[1]) : null;
  };
  const st = () => page.evaluate(() => window.RyMapHost.trunkState());
  const trunkOf = id => page.evaluate(pid => {
    const s = window.RyPlotLibraryStore.read();
    const p = (s.plots || []).find(x => x.id === pid);
    return p ? p.trunk : 'NO_PLOT';
  }, id);
  const trunkById = (trunk, id) => (trunk && Array.isArray(trunk.trunks) ? trunk.trunks.find(t => String(t.id) === String(id)) : null);
  const ptOf = q => Array.isArray(q) ? { lat: q[0], lng: q[1] } : { lat: q.lat, lng: q.lng };
  const projOfPt = p => page.evaluate(o => window.RyMapHost.project(o.lat, o.lng), p);

  await page.goto(APP, { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction(() => window.RyMapHost && window.RyTrunkSchema && window.RyTrunkEdit, null, { timeout: 30000 });
  await killMask();
  await page.waitForTimeout(900);

  /* ---------- C0 入口 ---------- */
  const btn0 = await page.evaluate(() => {
    const b = document.getElementById('btnEditTrunk');
    return b ? { exists: true, disabled: b.disabled, text: b.textContent.trim() } : { exists: false };
  });
  rec('C0a 「编辑总管」按钮存在且未选地块时置灰', btn0.exists && btn0.disabled === true, JSON.stringify(btn0));

  await killMask();
  await page.locator('#myPlotList .place-item[data-plot-id="p3-a"] .place-go').click();
  await page.waitForTimeout(1200);
  const btn1 = await page.evaluate(() => document.getElementById('btnEditTrunk').disabled);
  rec('C0b 选中带干线的地块后按钮可用', btn1 === false, 'disabled=' + btn1);

  await page.locator('#btnEditTrunk').click();
  await page.waitForTimeout(600);
  const s0 = await st();
  rec('C0c 进入编辑态，默认选中主干 T1', s0.mode === 'edit' && s0.activeTrunkId === 'T1', JSON.stringify({ mode: s0.mode, active: s0.activeTrunkId }));
  rec('C0d 拐点手柄数 = 主干折点数（3）', s0.vertexHandles === 3, 'handles=' + s0.vertexHandles);

  const box = await page.locator('#map').boundingBox();

  /* ---------- C1 拖中间拐点 15px ---------- */
  const apexBefore = ptOf(T1_PTS[1]);
  const pApex = await projOfPt(apexBefore);
  const projBefore = await projOf();
  await page.mouse.move(box.x + pApex.x, box.y + pApex.y);
  await page.mouse.down();
  /* 先拖到中途（+40px）读一次状态栏：验"拖动中就在更新"，
     再回到 +15px 松手 —— 最终位移仍是任务书要求的 15px。 */
  await page.mouse.move(box.x + pApex.x, box.y + pApex.y + 40, { steps: 4 });
  await page.waitForTimeout(160);
  const projMid = await projOf();
  await page.mouse.move(box.x + pApex.x, box.y + pApex.y + 15, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(900);

  let trunkA = await trunkOf('p3-a');
  let t1 = trunkById(trunkA, 'T1');
  const apexAfter = t1 ? ptOf(t1.points[1]) : null;
  const projAfter = await projOf();
  const sAfterDrag = await st();
  rec('C1a 拖中间拐点后点数不变（仍 3 点）', !!t1 && t1.points.length === 3, 'points=' + (t1 ? t1.points.length : 'null'));
  rec('C1b 该拐点坐标逐位变了（查库，不靠肉眼）',
    !!apexAfter && Math.abs(apexAfter.lat - apexBefore.lat) > 1e-7,
    JSON.stringify({ before: apexBefore, after: apexAfter }));
  rec('C1c 松手后状态栏投影与拖动前不同',
    projBefore !== null && projAfter !== null && projBefore !== projAfter,
    projBefore + ' → ' + projAfter);
  rec('C1e 拖动**过程中**状态栏就在更新（不是松手才变）',
    projMid !== null && projMid !== projBefore, projBefore + ' → 拖动中 ' + projMid);
  rec('C1d 拖完仍在编辑态、手柄还在', sAfterDrag.mode === 'edit' && sAfterDrag.vertexHandles === 3,
    JSON.stringify({ mode: sAfterDrag.mode, handles: sAfterDrag.vertexHandles }));

  /* ---------- C2 拖到邻点上 ⇒ 并掉这个拐点 ----------
     ★ 这里有个必须写下来的事实：fitBounds 后约 2.3 px/m，MERGE_M=0.3 m 只有 0.7 px，
       比一次像素取整还小 —— 纯按米判的话这个手势**永远触发不了**（实测落点差 0.67 m）。
       所以手势层另加 8px 的"够得着"下限（见 online-map.js MERGE_PX 注释），
       0.3 m 继续管数据层判定。这条断言就是锁住这个下限的。 */
  const pApex2 = await projOfPt(ptOf(t1.points[1]));
  const pNeighbor = await projOfPt(ptOf(t1.points[0]));
  await page.mouse.move(box.x + pApex2.x, box.y + pApex2.y);
  await page.mouse.down();
  await page.mouse.move(box.x + pNeighbor.x, box.y + pNeighbor.y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(900);
  trunkA = await trunkOf('p3-a');
  t1 = trunkById(trunkA, 'T1');
  const keepOk = !!t1 && t1.points.length === 2 &&
    Math.abs(ptOf(t1.points[0]).lat - T1_PTS[0][0]) < 1e-9 &&
    Math.abs(ptOf(t1.points[0]).lng - T1_PTS[0][1]) < 1e-9 &&
    Math.abs(ptOf(t1.points[1]).lat - T1_PTS[2][0]) < 1e-9 &&
    Math.abs(ptOf(t1.points[1]).lng - T1_PTS[2][1]) < 1e-9;
  rec('C2 拖到邻点上后该拐点被并掉（剩首尾两点，且首尾仍是原值）', keepOk,
    'points=' + (t1 ? t1.points.length : 'null') + ' → ' + JSON.stringify(t1 ? t1.points : null));

  /* ---------- C6 菜单 6 项文案与顺序（顺带在 T1 线身上取一次） ---------- */
  const mid = { lat: (ptOf(t1.points[0]).lat + ptOf(t1.points[1]).lat) / 2,
    lng: (ptOf(t1.points[0]).lng + ptOf(t1.points[1]).lng) / 2 };
  const pMid = await projOfPt(mid);
  await page.mouse.click(box.x + pMid.x, box.y + pMid.y, { button: 'right' });
  await page.waitForTimeout(500);
  const menu = await page.evaluate(() => {
    const el = document.getElementById('trunkCtxMenu');
    if (!el || el.hidden) return null;
    return {
      zIndex: getComputedStyle(el).zIndex,
      items: Array.from(el.querySelectorAll('.tcm-item')).map(b => ({
        text: b.textContent.trim(), disabled: b.disabled, act: b.getAttribute('data-act')
      }))
    };
  });
  rec('C6a 右键线身弹出菜单', !!menu, menu ? 'items=' + menu.items.length : 'null');
  rec('C6b 6 项文案与顺序逐字匹配', !!menu && menu.items.map(i => i.text).join('|') === MENU_EXPECT.join('|'),
    menu ? menu.items.map(i => i.text).join(' | ') : '');
  rec('C6c 菜单 z-index 高于 PWA 安装条（2000）', !!menu && Number(menu.zIndex) > 2000, menu ? menu.zIndex : '');
  rec('C6d 点在线身（非拐点）时「打断」「标记拐点」置灰',
    !!menu && menu.items.find(i => i.act === 'split').disabled === true &&
    menu.items.find(i => i.act === 'markVertex').disabled === true,
    menu ? JSON.stringify(menu.items.map(i => [i.act, i.disabled])) : '');
  /* 关菜单：点地图空白处。**不能用 ESC** —— 编辑态里 ESC 是"退出编辑"（见 C9），
     用它关菜单会把编辑态一起退掉，后面所有右键都会消失在 idle 态里（这是上一版的假红原因）。 */
  await page.mouse.click(box.x + 200, box.y + box.height - 200);
  await page.waitForTimeout(300);
  const closed = await page.evaluate(() => {
    const el = document.getElementById('trunkCtxMenu');
    return !el || el.hidden;
  });
  rec('C6e 点地图空白处关闭菜单（ESC 留给退出编辑）', closed === true);

  /* ---------- C3 打断 T3（中间拐点） ---------- */
  const pT3mid = await projOfPt(ptOf(T3_PTS[1]));
  await page.mouse.click(box.x + pT3mid.x, box.y + pT3mid.y, { button: 'right' });
  await page.waitForTimeout(500);
  const menuOnVtx = await page.evaluate(() => {
    const el = document.getElementById('trunkCtxMenu');
    if (!el || el.hidden) return null;
    return {
      head: el.querySelector('.tcm-head') ? el.querySelector('.tcm-head').textContent.trim() : '',
      splitEnabled: !!el.querySelector('.tcm-item[data-act="split"]') && !el.querySelector('.tcm-item[data-act="split"]').disabled
    };
  });
  rec('C3a 右键拐点：命中 T3 且「打断」可用',
    !!menuOnVtx && menuOnVtx.head.includes('T3') && menuOnVtx.splitEnabled === true, JSON.stringify(menuOnVtx));

  await page.locator('#trunkCtxMenu .tcm-item[data-act="split"]').click();
  await page.waitForTimeout(900);
  const trunkB = await trunkOf('p3-a');
  /* 按**集合**比：打断点必然同时出现在两段里（前段末、后段首），
     用 multiset 比会凭空多出一个元素，那不是代码错。 */
  const setEq = (a, b) => {
    const key = q => { const p = ptOf(q); return p.lat.toFixed(9) + ',' + p.lng.toFixed(9); };
    const x = Array.from(new Set(a.map(key))).sort(), y = Array.from(new Set(b.map(key))).sort();
    return x.length === y.length && x.every((v, i) => v === y[i]);
  };
  const head = trunkById(trunkB, 'T3');
  const tail = (trunkB.trunks || []).find(t => String(t.id) !== 'T1' && String(t.id) !== 'T2' && String(t.id) !== 'T3') || null;
  const jointOk = !!head && !!tail &&
    Math.abs(ptOf(head.points[head.points.length - 1]).lat - ptOf(tail.points[0]).lat) < 1e-12 &&
    Math.abs(ptOf(head.points[head.points.length - 1]).lng - ptOf(tail.points[0]).lng) < 1e-12;
  rec('C3b 打断后干线数 +1（3 → 4）', Array.isArray(trunkB.trunks) && trunkB.trunks.length === 4,
    'n=' + (trunkB && trunkB.trunks ? trunkB.trunks.length : 'null'));
  rec('C3c 前段保留 T3，后段拿到新编号', !!head && !!tail, head && tail ? head.id + ' / ' + tail.id : 'missing');
  rec('C3d 两段首尾严格相接（坐标逐位相等）', jointOk);
  rec('C3e 两段坐标并集 = 打断前的坐标集合',
    !!head && !!tail && setEq(head.points.concat(tail.points), T3_PTS));

  /* ---------- C4 合并 T1 + T2（编号/参数沿用列表在前那条） ---------- */
  const t1ParamsBefore = JSON.parse(JSON.stringify(trunkById(trunkB, 'T1').params));
  dialogs.length = 0;
  const midPts = [ptOf(trunkById(trunkB, 'T1').points[0]), ptOf(trunkById(trunkB, 'T1').points[1])];
  const pMid2 = await projOfPt({ lat: (midPts[0].lat + midPts[1].lat) / 2, lng: (midPts[0].lng + midPts[1].lng) / 2 });
  await page.mouse.click(box.x + pMid2.x, box.y + pMid2.y, { button: 'right' });
  await page.waitForTimeout(500);
  const mergeBtn = await page.evaluate(() => {
    const b = document.querySelector('#trunkCtxMenu .tcm-item[data-act="merge"]');
    return b ? { exists: true, disabled: b.disabled } : { exists: false };
  });
  rec('C4a T1 与 T2 相连 ⇒「合并」项可用', mergeBtn.exists && mergeBtn.disabled === false, JSON.stringify(mergeBtn));

  await page.locator('#trunkCtxMenu .tcm-item[data-act="merge"]').click();
  await page.waitForTimeout(1000);
  const trunkC = await trunkOf('p3-a');
  const t1c = trunkById(trunkC, 'T1');
  const confirmMsg = (dialogs.find(d => d.type === 'confirm') || {}).message || '';
  rec('C4b 合并前弹了二次确认（文案写清删哪条、沿用哪条）',
    !!confirmMsg && confirmMsg.includes('T2') && confirmMsg.includes('T1'), confirmMsg.replace(/\n/g, ' ⏎ '));
  rec('C4c 合并后干线数 -1（4 → 3）', trunkC.trunks.length === 3, 'n=' + trunkC.trunks.length);
  rec('C4d 合并后编号仍是 T1（列表在前那条），T2 消失',
    !!t1c && !trunkById(trunkC, 'T2'), 'ids=' + trunkC.trunks.map(t => t.id).join(','));
  rec('C4e 折点 = 两段首尾去重拼接（3 点）', !!t1c && t1c.points.length === 3, 'points=' + (t1c ? t1c.points.length : 'null'));
  rec('C4f 参数深度等于第一段的参数（没被第二条盖掉）',
    !!t1c && JSON.stringify(t1c.params) === JSON.stringify(t1ParamsBefore),
    JSON.stringify(t1c ? t1c.params : null) + ' vs ' + JSON.stringify(t1ParamsBefore));

  /* ---------- C8 标记拐点（label 要能穿过 normalize → 写库 → 读回） ---------- */
  const pT3v0 = await projOfPt(ptOf(T3_PTS[0]));
  await page.mouse.click(box.x + pT3v0.x, box.y + pT3v0.y, { button: 'right' });
  await page.waitForTimeout(400);
  await page.locator('#trunkCtxMenu .tcm-item[data-act="markVertex"]').click();
  await page.waitForTimeout(400);
  /* [v838] 标记弹窗从原生 prompt 换成自定义 DOM 弹窗（#ryNodeDialog）——
     探针同步走真实用户路径：填名称 → 点确定。
     旧 page.on('dialog') 的 prompt 接管在 v838 起不再触发，标签永远写不进库，
     且弹窗遮罩会挡住后续右键菜单（copyParams 无限重试超时）。 */
  await page.waitForSelector('#ryNodeDialog', { timeout: 3000 });
  await page.fill('#ryNodeDialog .ry-node-name input', '三通口');
  await page.locator('#ryNodeDialog .ry-node-btn.is-primary').click();
  await page.waitForTimeout(900);
  const trunkD = await trunkOf('p3-a');
  const labels = (trunkById(trunkD, 'T3') || {}).params || {};
  rec('C8 拐点标签穿过了 normalize/写库/读回（params.labels.0）',
    !!labels.labels && labels.labels['0'] === '三通口', JSON.stringify(labels.labels || null));

  /* ---------- C5 复制参数 → 粘贴到另一条 ---------- */
  const t1p = JSON.parse(JSON.stringify(trunkById(trunkD, 'T1').params));
  const pT1mid = await projOfPt({ lat: (ptOf(trunkById(trunkD, 'T1').points[0]).lat + ptOf(trunkById(trunkD, 'T1').points[1]).lat) / 2,
    lng: (ptOf(trunkById(trunkD, 'T1').points[0]).lng + ptOf(trunkById(trunkD, 'T1').points[1]).lng) / 2 });
  await page.mouse.click(box.x + pT1mid.x, box.y + pT1mid.y, { button: 'right' });
  await page.waitForTimeout(400);
  await page.locator('#trunkCtxMenu .tcm-item[data-act="copyParams"]').click();
  await page.waitForTimeout(500);
  const clip = await st();
  rec('C5a 复制后剪贴板非空', clip.clipboardEmpty === false, 'clipboardEmpty=' + clip.clipboardEmpty);

  /* 找 T4（打断出来的那条）的线身 */
  const t4 = (trunkD.trunks || []).find(t => ['T1', 'T2', 'T3'].indexOf(String(t.id)) < 0);
  const t4a = ptOf(t4.points[0]), t4b = ptOf(t4.points[1]);
  const pT4mid = await projOfPt({ lat: (t4a.lat + t4b.lat) / 2, lng: (t4a.lng + t4b.lng) / 2 });
  await page.mouse.click(box.x + pT4mid.x, box.y + pT4mid.y, { button: 'right' });
  await page.waitForTimeout(400);
  const pasteState = await page.evaluate(() => {
    const b = document.querySelector('#trunkCtxMenu .tcm-item[data-act="pasteParams"]');
    const head = document.querySelector('#trunkCtxMenu .tcm-head');
    return { disabled: b ? b.disabled : null, head: head ? head.textContent.trim() : '' };
  });
  rec('C5b 右键命中 T4 且「粘贴参数」可用',
    pasteState.disabled === false && pasteState.head.includes(t4.id), JSON.stringify(pasteState));
  await page.locator('#trunkCtxMenu .tcm-item[data-act="pasteParams"]').click();
  await page.waitForTimeout(900);
  const trunkE = await trunkOf('p3-a');
  const t4After = trunkById(trunkE, t4.id);
  rec('C5c 粘贴后目标线参数 = 源参数（深度相等）',
    !!t4After && JSON.stringify(t4After.params) === JSON.stringify(t1p),
    JSON.stringify(t4After ? t4After.params : null) + ' vs ' + JSON.stringify(t1p));

  /* ---------- C9 ESC 退出编辑 ---------- */
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const sExit = await st();
  rec('C9a ESC 退出编辑态、手柄清空',
    sExit.mode === 'idle' && sExit.vertexHandles === 0, JSON.stringify({ mode: sExit.mode, handles: sExit.vertexHandles }));
  const handleDom = await page.evaluate(() => document.querySelectorAll('.ry-trunk-vtx').length);
  rec('C9b DOM 里不留拐点手柄', handleDom === 0, 'n=' + handleDom);

  /* ---------- C7 删掉唯一一条 ⇒ trunk=null、状态栏回 — ---------- */
  await killMask();
  await page.locator('#myPlotList .place-item[data-plot-id="p3-b"] .place-go').click();
  await page.waitForTimeout(1200);
  await page.locator('#btnEditTrunk').click();
  await page.waitForTimeout(600);
  const sB = await st();
  rec('C7a 切到 p3-b 后编辑态选中的是它自己的 T1', sB.mode === 'edit' && sB.activeTrunkId === 'T1',
    JSON.stringify({ mode: sB.mode, active: sB.activeTrunkId, count: sB.trunkCount }));

  const pBmid = await projOfPt({ lat: 18.2618, lng: 109.5321 });
  await page.mouse.click(box.x + pBmid.x, box.y + pBmid.y, { button: 'right' });
  await page.waitForTimeout(400);
  const bMenu = await page.evaluate(() => {
    const head = document.querySelector('#trunkCtxMenu .tcm-head');
    const del = document.querySelector('#trunkCtxMenu .tcm-item[data-act="delete"]');
    return { head: head ? head.textContent.trim() : '', delDisabled: del ? del.disabled : null };
  });
  rec('C7b 命中该线的菜单且「删除」可用', bMenu.head.includes('T1') && bMenu.delDisabled === false, JSON.stringify(bMenu));
  await page.locator('#trunkCtxMenu .tcm-item[data-act="delete"]').click();
  await page.waitForTimeout(1000);

  const trunkB2 = await trunkOf('p3-b');
  const sbText = await statusText();
  rec('C7c 删除最后一条后库里的 trunk 变成 null（不是空壳 v2）', trunkB2 === null, JSON.stringify(trunkB2));
  rec('C7d 状态栏总管回「—」', sbText.includes('总管：—'), sbText);
  rec('C7e 编辑态自动退出（没线可编辑了）', (await st()).mode === 'idle', (await st()).mode);

  rec('C10 无 pageerror', pageErrors.length === 0, pageErrors.join(' | ') || '(none)');

  const shot = path.join(ROOT, '_shots', 'p3-trunk-edit.png');
  fs.mkdirSync(path.dirname(shot), { recursive: true });
  await page.screenshot({ path: shot }).catch(() => {});

  const fail = out.filter(o => !o[1]).length;
  console.log(`\n== trunk-p3: ${out.length - fail}/${out.length} 通过 ==`);
  fs.writeFileSync(path.join(ROOT, '_probe_trunk_p3_out.json'),
    JSON.stringify({ out, pageErrors, dialogs }, null, 2));
  await browser.close();
  process.exitCode = fail ? 1 : 0;
})();
