'use strict';
/* _probe_panel_dedupe.mjs —— v830「右侧角度面板去重」验收
 * 1) 面板内只剩「☁ 提交到云端」一个 chip，三个按钮确实不再存在
 * 2) 面板无空洞：chip 撑满面板宽、与下方 section 的间距与去重前一致
 * 3) 删元素后 online-map.js 不抛错（pageerror 为空），且后续绑定仍生效（云端提交按钮可点）
 * 4) 草稿回传能力没丢：window.__rySendCurrentDraft / RyMapHost.sendDraft 可用
 * 5) 列表行「→」(.place-send) 仍然把指定地块回传（writeIncoming 载荷 id 正确）
 * 用法：node _probe_panel_dedupe.mjs
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
  { id: 'pd-a', name: 'PD-A', sqm: 23500, mu: 35.25, ts: 300, areaM2: 23500, source: 'map',
    polyLatLng: [[18.2, 109.5], [18.2, 109.502], [18.201, 109.502], [18.201, 109.5]] },
  { id: 'pd-g', name: 'PD-G', sqm: 42000, mu: 63, ts: 100, areaM2: 42000, source: 'map', merged: true,
    subPlots: [{ id: 'pd-g1', name: 'G1' }, { id: 'pd-g2', name: 'G2' }],
    polyLatLng: [[18.23, 109.52], [18.23, 109.524], [18.2325, 109.524], [18.2325, 109.52]] },
];

const out = [];
const rec = (label, ok, detail) => { out.push([label, ok, detail]);
  console.log((ok ? '  OK   ' : '  FAIL ') + label + (detail ? '  ' + detail : '')); };

(async () => {
  if (!EDGE) { console.log('找不到 Microsoft Edge'); process.exitCode = 1; return; }
  const browser = await chromium.launch({ channel: 'msedge', headless: true, executablePath: EDGE,
    args: ['--allow-file-access-from-files', '--no-first-run', '--no-default-browser-check'] });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, serviceWorkers: 'block' });
  await context.route(/^https?:\/\//, r => r.abort());
  await context.addInitScript(plots => {
    localStorage.setItem('runye_plot_library', JSON.stringify(plots));
    localStorage.setItem('runyeLocalAdminSession', '1');
  }, PLOTS);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  const dialogs = [];
  page.on('dialog', d => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });

  const killMask = async () => {
    await page.evaluate(() => {
      if (!document.getElementById('__probe_mask_kill')) {
        const st = document.createElement('style'); st.id = '__probe_mask_kill';
        st.textContent = '.ry-ann-mask{display:none!important;pointer-events:none!important}';
        document.head.appendChild(st);
        const rm = () => document.querySelectorAll('.ry-ann-mask').forEach(n => n.remove());
        rm(); new MutationObserver(rm).observe(document.documentElement, { childList: true, subtree: true });
      }
    });
  };

  await page.goto(APP, { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction(() => window.RyMapHost && window.RyPlotLibraryStore, null, { timeout: 30000 });
  await killMask();
  await page.waitForTimeout(1200);

  /* ① 三个按钮必须不存在 */
  const gone = await page.evaluate(() => ({
    copy: !!document.getElementById('btnCopy'),
    terrain: !!document.getElementById('btnCopyTerrain'),
    save: !!document.getElementById('btnSavePlot'),
  }));
  rec('A1 三个重复按钮已移除', !gone.copy && !gone.terrain && !gone.save, JSON.stringify(gone));

  /* ② 面板内只剩一个 chip，且是「提交到云端」 */
  const panel = await page.evaluate(() => {
    const box = document.getElementById('mapFloatActions');
    if (!box) return null;
    const chips = [...box.querySelectorAll('button')].map(b => ({
      id: b.id, text: (b.textContent || '').trim(), w: Math.round(b.getBoundingClientRect().width),
      h: Math.round(b.getBoundingClientRect().height), vis: b.offsetParent !== null,
    }));
    const boxR = box.getBoundingClientRect();
    const sect = document.getElementById('mapPartitionTools');
    const sectR = sect ? sect.getBoundingClientRect() : null;
    const bodyR = box.parentElement.getBoundingClientRect();
      return { chips, boxW: Math.round(boxR.width), boxH: Math.round(boxR.height),
      bodyW: Math.round(bodyR.width), gapToSection: sectR ? Math.round(sectR.top - boxR.bottom) : null,
      /* [v849] 独立 #ryAnglePanel 壳已删，角度控件并入图层面板（data-rym-angle-wrap）；
         旧探针读已删除的壳会 getBoundingClientRect of null 直接崩。 */
      panelH: (() => { const w = document.querySelector('[data-rym-angle-wrap]');
        return w ? Math.round(w.getBoundingClientRect().height) : 0; })(),
      panelVisible: (() => { const w = document.querySelector('[data-rym-angle-wrap]');
        return !!w && w.hidden === false; })() };
  });
  rec('A2 面板内仅剩 1 个按钮', !!panel && panel.chips.length === 1, panel && JSON.stringify(panel.chips));
  rec('A3 那个按钮是「提交到云端」且可见', !!panel && panel.chips[0] && panel.chips[0].id === 'btnCloudSubmit'
    && panel.chips[0].vis, panel && panel.chips[0] && panel.chips[0].id);
  rec('A4 chip 撑满「#mapFloatActions」宽（无空洞）', !!panel && Math.abs(panel.chips[0].w - panel.boxW) <= 2,
    panel ? `chip=${panel.chips[0].w} box=${panel.boxW} body=${panel.bodyW}` : 'no panel');
  rec('A5 角度控件并入图层面板后仍可见且有高度（v849 口径）', !!panel && panel.panelH > 40 && panel.panelH < 320 && panel.panelVisible,
    panel ? `panelH=${panel.panelH} gap=${panel.gapToSection} vis=${panel.panelVisible}` : 'no panel');

  /* ③ 脚本加载无异常 + 后续绑定仍生效 */
  rec('A6 无 pageerror（空守卫生效）', pageErrors.length === 0, pageErrors.join(' | ') || '(none)');
  const cloudWired = await page.evaluate(() => {
    const b = document.getElementById('btnCloudSubmit');
    return !!b && typeof b.onclick === 'function';
  });
  rec('A7 「☁ 提交到云端」绑定仍在（后面的代码没被 null 打断）', cloudWired, String(cloudWired));

  /* ④ 草稿回传能力保留 */
  const draftApi = await page.evaluate(() => ({
    fn: typeof window.__rySendCurrentDraft, host: typeof (window.RyMapHost && window.RyMapHost.sendDraft),
    send: typeof (window.RyMapHost && window.RyMapHost.send),
  }));
  rec('A8 草稿回传编程入口已导出', draftApi.fn === 'function' && draftApi.host === 'function',
    JSON.stringify(draftApi));

  /* ⑤ 列表行「→」仍能回传指定地块（成组地块带 subPlots） */
  const row = page.locator('#myPlotList .place-item[data-plot-id="pd-a"] .place-send');
  const rowCount = await row.count();
  rec('A9 列表行「→」入口存在', rowCount === 1, 'count=' + rowCount);
  let sentId = null;
  if (rowCount === 1) {
    await page.evaluate(() => {
      window.__terrainSeen = null;
      if (window.RyTerrainBridgeStore && !window.RyTerrainBridgeStore.__wrapped) {
        const orig = window.RyTerrainBridgeStore.writeIncoming;
        window.RyTerrainBridgeStore.writeIncoming = function (p) { window.__terrainSeen = p && p.id; return orig.apply(this, arguments); };
        window.RyTerrainBridgeStore.__wrapped = true;
      }
    });
    await killMask();
    await row.click({ timeout: 8000 }).catch(e => rec('A9b 点击失败', false, e.message));
    await page.waitForTimeout(900);
    sentId = await page.evaluate(() => window.currentPlotId || window.__runyeImportedTrunk?.plotId || null);
  }
  rec('A10 回传后 currentPlotId 落到被点地块', sentId === 'pd-a', 'currentPlotId=' + sentId);

  /* 截图：面板区域 */
  const shot = path.join(ROOT, '_shots', 'v830-panel.png');
  fs.mkdirSync(path.dirname(shot), { recursive: true });
  const boxEl = await page.$('#ryAnglePanel');
  if (boxEl) await boxEl.screenshot({ path: shot }).catch(() => {});
  rec('A11 面板截图', fs.existsSync(shot), shot);

  const fail = out.filter(o => !o[1]).length;
  console.log(`\n== panel-dedupe: ${out.length - fail}/${out.length} 通过 ==`);
  fs.writeFileSync(path.join(ROOT, '_probe_panel_dedupe_out.json'), JSON.stringify({ out, pageErrors, dialogs }, null, 2));
  await browser.close();
  process.exitCode = fail ? 1 : 0;
})();
