'use strict';
/* _probe_trunk_p4.mjs —— 四期验收：撤销 / 重做（只回滚 plot.trunk 这一个数据域）
 *
 * 判据全部落在「库里的字节」和「撤销栈的对外数字」上：
 *   D1 真走一次绘制保存，再 Ctrl+Z：trunks 内容回退，**revision 继续增加**（撤销也是一次正常写入）
 *   D2 Ctrl+Shift+Z 恢复
 *   D3 撤销前后，`runye_plot_library` 之外的**所有 localStorage 键**必须逐字节相等
 *      （外加内存里的 window.tlDiagramData）—— 这条是"改错数据域"的唯一证据
 *   D4 切地块 ⇒ 栈空，undo 返回 false 且不写库
 *   D5 连做 55 次编辑 ⇒ 栈长被 limit 卡住（不爆），旧快照被丢弃但还能撤
 *   D6 输入框里 Ctrl+Z 走浏览器原生文本撤销，总管一个字节不动
 *
 * 用法：node _probe_trunk_p4.mjs
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

const RING = [[18.2500, 109.5180], [18.2500, 109.5230], [18.2520, 109.5230], [18.2520, 109.5180]];
/* T1 放在上半区，D1 的新线画在下半区 —— 两处相距 200px 以上，绘制时不会被吸附搅局。 */
const T1_PTS = [[18.2512, 109.5190], [18.2515, 109.5205], [18.2512, 109.5220]];
const NEW_A = { lat: 18.2504, lng: 109.5190 };
const NEW_B = { lat: 18.2504, lng: 109.5210 };

const mkTrunk = pts => ({ schema: 2, source: 'map', coordinateSystem: 'GCJ-02', revision: 3, trunks: [
  { id: 'T1', main: true, points: pts, params: { material: 'PE', dn: 63, designFlow: 12.5 } }] });

const PLOTS = [
  { id: 'p4-a', name: 'P4-A', sqm: 12000, mu: 18, ts: 300, areaM2: 12000, source: 'map',
    polyLatLng: RING, trunk: mkTrunk(T1_PTS) },
  { id: 'p4-b', name: 'P4-B', sqm: 9000, mu: 13.5, ts: 200, areaM2: 9000, source: 'map',
    polyLatLng: [[18.2610, 109.5310], [18.2610, 109.5330], [18.2625, 109.5330], [18.2625, 109.5310]],
    trunk: mkTrunk([[18.2614, 109.5316], [18.2618, 109.5323], [18.2620, 109.5328]]) },
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
    if (!localStorage.getItem('__p4_seed')) {
      localStorage.setItem('runye_plot_library', JSON.stringify(plots));
      localStorage.setItem('runyeLocalAdminSession', '1');
      localStorage.setItem('__p4_seed', '1');
    }
  }, PLOTS);

  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  const dialogs = [];
  page.on('dialog', async d => { dialogs.push({ type: d.type(), message: d.message() }); try { await d.accept(); } catch (e) { } });

  const killMask = async () => {
    await page.evaluate(() => {
      const st = document.getElementById('__probe_mask_kill');
      if (st) return;
      const s = document.createElement('style'); s.id = '__probe_mask_kill';
      s.textContent = '[class*="ry-ann"]{display:none!important;pointer-events:none!important}#warn{display:none!important}';
      document.head.appendChild(s);
    });
  };

  const st = () => page.evaluate(() => window.RyMapHost.trunkState());
  const trunkOf = id => page.evaluate(pid => {
    const s = window.RyPlotLibraryStore.read();
    const p = (s.plots || []).find(x => x.id === pid);
    if (!p) return 'NO_PLOT';
    return p.trunk === undefined ? null : p.trunk;
  }, id);
  const revOf = id => page.evaluate(pid => {
    const s = window.RyPlotLibraryStore.read();
    const p = (s.plots || []).find(x => x.id === pid);
    return p && p.trunk ? p.trunk.revision : null;
  }, id);
  const projOfPt = p => page.evaluate(o => window.RyMapHost.project(o.lat, o.lng), p);

  /* 「别的数据域」指纹：runye_plot_library 之外的全部 localStorage 键 + 内存里的 tlDiagramData。
     先取两次确认**自身稳定**，否则噪音会被误判成"撤销改错了东西"。 */
  const outsidePrint = () => page.evaluate(() => {
    const map = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k === 'runye_plot_library') continue;
      map[k] = localStorage.getItem(k);
    }
    const keys = Object.keys(map).sort();
    return {
      keys: keys.join('|'),
      body: JSON.stringify(keys.map(k => [k, map[k]])),
      tl: JSON.stringify(window.tlDiagramData === undefined ? null : window.tlDiagramData)
    };
  });
  const stableOutsidePrint = async () => {
    let prev = await outsidePrint();
    for (let i = 0; i < 4; i++) {
      await page.waitForTimeout(400);
      const now = await outsidePrint();
      if (now.body === prev.body && now.tl === prev.tl) return now;
      prev = now;
    }
    return prev;
  };

  await page.goto(APP, { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction(() => window.RyMapHost && window.RyTrunkHistory, null, { timeout: 30000 });
  await killMask();
  await page.waitForTimeout(900);

  /* ---------- D0 基线 ---------- */
  const h0 = (await st()).history;
  rec('D0a 撤销栈在页面上就位（limit=50、初始为空）',
    !!h0 && h0.limit === 50 && h0.size === 0 && h0.canUndo === false, JSON.stringify(h0));

  await killMask();
  await page.locator('#myPlotList .place-item[data-plot-id="p4-a"] .place-go').click();
  await page.waitForTimeout(1200);
  const box = await page.locator('#map').boundingBox();
  const rev0 = await revOf('p4-a');
  rec('D0b 选中地块后有 1 条干线、栈仍为空（选地块本身不算一次编辑）',
    (await st()).trunkCount === 1 && (await st()).history.size === 0, 'rev=' + rev0);

  /* ---------- D1 画 → 保存 → Ctrl+Z ---------- */
  await page.locator('#btnDrawTrunk').click();
  await page.waitForTimeout(400);
  for (const pt of [NEW_A, { lat: NEW_A.lat, lng: 109.5200 }, NEW_B]) {
    const p = await projOfPt(pt);
    await page.mouse.click(box.x + p.x, box.y + p.y);
    await page.waitForTimeout(180);
  }
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);
  const afterDraw = await trunkOf('p4-a');
  const h1 = (await st()).history;
  rec('D1a 新画一条并保存后库里 2 条干线', !!afterDraw && afterDraw.trunks.length === 2,
    'n=' + (afterDraw ? afterDraw.trunks.length : 'null'));
  rec('D1b 保存成功后入栈（size=2：基线 + 新状态）', h1.size === 2 && h1.canUndo === true, JSON.stringify(h1));

  const revBeforeUndo = await revOf('p4-a');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(1000);
  const afterUndo = await trunkOf('p4-a');
  const revAfterUndo = await revOf('p4-a');
  rec('D1c Ctrl+Z 后库里回到 1 条（内容真的回退了）',
    !!afterUndo && afterUndo.trunks.length === 1 && afterUndo.trunks[0].id === 'T1',
    'n=' + (afterUndo ? afterUndo.trunks.length : 'null') + ' / ' + (afterUndo ? afterUndo.trunks.map(t => t.id).join(',') : ''));
  rec('D1d 撤销也是一次正常写入 ⇒ revision 继续增加（不是把旧字节覆盖回去）',
    revAfterUndo === revBeforeUndo + 1, revBeforeUndo + ' → ' + revAfterUndo);
  rec('D1e 撤销后栈游标回到基线（canRedo 变 true）', (await st()).history.canRedo === true,
    JSON.stringify((await st()).history));

  /* ---------- D2 Ctrl+Shift+Z 恢复 ---------- */
  await page.keyboard.press('Control+Shift+z');
  await page.waitForTimeout(1000);
  const afterRedo = await trunkOf('p4-a');
  rec('D2a Ctrl+Shift+Z 恢复到 2 条', !!afterRedo && afterRedo.trunks.length === 2,
    'n=' + (afterRedo ? afterRedo.trunks.length : 'null'));
  rec('D2b 重做不新建历史（栈长仍是 2，只是游标前进）',
    (await st()).history.size === 2 && (await st()).history.canRedo === false,
    JSON.stringify((await st()).history));
  /* Ctrl+Y 也应当重做：先撤一步再试 */
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(800);
  await page.keyboard.press('Control+y');
  await page.waitForTimeout(800);
  rec('D2c Ctrl+Y 与 Ctrl+Shift+Z 等价',
    (await trunkOf('p4-a')).trunks.length === 2, 'n=' + (await trunkOf('p4-a')).trunks.length);

  /* ---------- D3 别的数据域零影响 ---------- */
  const printBefore = await stableOutsidePrint();
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(900);
  const printAfter = await outsidePrint();
  rec('D3a 撤销没有碰 runye_plot_library 之外的任何 localStorage 键',
    printBefore.keys === printAfter.keys && printBefore.body === printAfter.body,
    printBefore.keys === printAfter.keys ? '逐字节相等' : ('键集合变了：' + printBefore.keys + ' → ' + printAfter.keys));
  rec('D3b 内存里的 tlDiagramData（已回传的系统管网）没被碰',
    printBefore.tl === printAfter.tl, 'len=' + printBefore.tl.length);
  await page.keyboard.press('Control+Shift+z');
  await page.waitForTimeout(900);
  rec('D3c 重做同样不碰别的域',
    (await stableOutsidePrint()).body === printBefore.body, '');

  /* ---------- D6 输入框里 Ctrl+Z 走原生撤销 ---------- */
  const trunkBeforeD6 = JSON.stringify(await trunkOf('p4-a'));
  const histBeforeD6 = JSON.stringify((await st()).history);
  await page.locator('#search').click();
  await page.locator('#search').fill('');
  await page.keyboard.type('abc');
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await page.waitForTimeout(200);
  const emptied = await page.locator('#search').inputValue();
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);
  const restored = await page.locator('#search').inputValue();
  rec('D6a 输入框里 Ctrl+Z 恢复了文本（浏览器原生撤销真的生效）',
    emptied === '' && restored === 'abc', '空→"' + restored + '"');
  rec('D6b 输入框里 Ctrl+Z 完全没有动总管数据',
    JSON.stringify(await trunkOf('p4-a')) === trunkBeforeD6, '');
  rec('D6c 输入框里 Ctrl+Z 也没有动撤销栈',
    JSON.stringify((await st()).history) === histBeforeD6, histBeforeD6 + ' → ' + JSON.stringify((await st()).history));
  await page.locator('#search').fill('');
  await page.locator('#search').blur();

  /* ---------- D7 绘制中 Ctrl+Z 先撤草稿点，不碰已保存的历史 ---------- */
  const revBeforeD7 = await revOf('p4-a');
  const histBeforeD7 = JSON.stringify((await st()).history);
  const trunkBeforeD7 = JSON.stringify(await trunkOf('p4-a'));
  await killMask();
  await page.locator('#btnDrawTrunk').click();
  await page.waitForTimeout(400);
  for (const pt of [{ lat: 18.2508, lng: 109.5192 }, { lat: 18.2508, lng: 109.5208 }]) {
    const p = await projOfPt(pt);
    await page.mouse.click(box.x + p.x, box.y + p.y);
    await page.waitForTimeout(180);
  }
  const draft2 = (await st()).draftPoints;
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  const draft1 = (await st()).draftPoints;
  rec('D7a 绘制中 Ctrl+Z 只撤草稿点（2 → 1），不动已保存的历史',
    draft2 === 2 && draft1 === 1 && (await revOf('p4-a')) === revBeforeD7,
    'draft ' + draft2 + '→' + draft1 + ' / rev 仍 ' + revBeforeD7);
  rec('D7b 这一步没有污染撤销栈', JSON.stringify((await st()).history) === histBeforeD7, '');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  rec('D7c 草稿点撤完（0）', (await st()).draftPoints === 0, 'draft=' + (await st()).draftPoints);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(700);
  rec('D7d 草稿清空后 Ctrl+Z 才轮到历史栈（库里 revision +1）',
    (await revOf('p4-a')) === revBeforeD7 + 1, revBeforeD7 + ' → ' + (await revOf('p4-a')));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.keyboard.press('Control+y');
  await page.waitForTimeout(700);
  /* 只比 trunks：revision 必然又涨了两号（撤销 +1、重做 +1），比整体 JSON 会假红。 */
  rec('D7e 撤销后能重做回原状（trunks 内容还原）',
    JSON.stringify((await trunkOf('p4-a')).trunks) === JSON.stringify(JSON.parse(trunkBeforeD7).trunks), '');

  /* ---------- D4 切地块 ⇒ 栈空 ---------- */
  const hBeforeSwitch = (await st()).history;
  await killMask();
  await page.locator('#myPlotList .place-item[data-plot-id="p4-b"] .place-go').click();
  await page.waitForTimeout(1200);
  const hAfterSwitch = (await st()).history;
  const revB0 = await revOf('p4-b');
  rec('D4a 切地块后撤销栈被清空', hAfterSwitch.size === 0 && hAfterSwitch.canUndo === false,
    '前 ' + hBeforeSwitch.size + ' 步 → 后 ' + hAfterSwitch.size + ' 步');
  const undoRet = await page.evaluate(() => window.RyMapHost.undoTrunk());
  await page.waitForTimeout(600);
  rec('D4b 切地块后 undo 无效且不写库',
    undoRet === false && (await revOf('p4-b')) === revB0, 'undo=' + undoRet + ' rev=' + revB0 + '→' + (await revOf('p4-b')));

  /* ---------- D5 55 次编辑 ⇒ 栈不爆 ---------- */
  await page.locator('#btnEditTrunk').click();
  await page.waitForTimeout(700);
  const lastPt = async () => {
    const t = await trunkOf('p4-b');
    const q = t.trunks[0].points[t.trunks[0].points.length - 1];
    return Array.isArray(q) ? { lat: q[0], lng: q[1] } : { lat: q.lat, lng: q.lng };
  };
  const revStart = await revOf('p4-b');
  let moved = 0;
  for (let i = 0; i < 55; i++) {
    const p = await projOfPt(await lastPt());
    const dx = (i % 2 === 0) ? 8 : -8;
    await page.mouse.move(box.x + p.x, box.y + p.y);
    await page.mouse.down();
    await page.mouse.move(box.x + p.x + dx, box.y + p.y, { steps: 2 });
    await page.mouse.up();
    await page.waitForTimeout(45);
    moved++;
  }
  await page.waitForTimeout(700);
  const h5 = (await st()).history;
  const revEnd = await revOf('p4-b');
  rec('D5a 55 次编辑都真的写进去了（revision +55）',
    revEnd === revStart + 55, revStart + ' → ' + revEnd + '（做了 ' + moved + ' 次拖动）');
  rec('D5b 栈长被 limit 卡住，不随点击次数增长', h5.size === 50, 'size=' + h5.size);
  rec('D5c 旧快照确实被丢弃（dropped>0），不是"假装满了"', h5.dropped > 0, 'dropped=' + h5.dropped);
  rec('D5d 栈满之后仍然能撤', h5.canUndo === true, JSON.stringify({ cursor: h5.cursor, size: h5.size }));
  const revBeforeBatchUndo = await revOf('p4-b');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(700);
  rec('D5e 栈满时撤销一步仍然写库（revision +1）',
    (await revOf('p4-b')) === revBeforeBatchUndo + 1, revBeforeBatchUndo + ' → ' + (await revOf('p4-b')));

  rec('D10 无 pageerror', pageErrors.length === 0, pageErrors.join(' | ') || '(none)');

  const shot = path.join(ROOT, '_shots', 'p4-undo.png');
  fs.mkdirSync(path.dirname(shot), { recursive: true });
  await page.screenshot({ path: shot }).catch(() => {});

  const fail = out.filter(o => !o[1]).length;
  console.log(`\n== trunk-p4: ${out.length - fail}/${out.length} 通过 ==`);
  fs.writeFileSync(path.join(ROOT, '_probe_trunk_p4_out.json'),
    JSON.stringify({ out, pageErrors, dialogs }, null, 2));
  await browser.close();
  process.exitCode = fail ? 1 : 0;
})();
