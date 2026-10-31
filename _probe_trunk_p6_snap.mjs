'use strict';
/* _probe_trunk_p6_snap.mjs —— v835 接通后的捕捉行为验收
 *
 * p5 证明的是「坐标能可靠反算」（23/23）。p6 证明的是「接进去之后行为对」：
 *   H1 三类候选真的进了候选集（byKind 里 valve-node / branch-start / zone-vertex 计数 > 0）
 *   H2 真实鼠标移到阀门上 ⇒ 命中 valve-node，且白圈标记 .ry-snap-mark 出现
 *   H3 ★ 地块归属不一致时三类必须**整体消失**（tlDiagramData 属于分区页 currentPlotId，
 *      地图页在编辑 currentMapPlotId —— 不是同一块时吸上去就是别人家的管子）
 *   H4 守卫触发时不误伤原有三类：地块顶点照样能吸
 *   H5 远离一切目标时不吸（不会"到处都有吸力"）
 *
 * 用法：node _probe_trunk_p6_snap.mjs
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
const BASE = 'file:///' + path.join(ROOT, 'index.html').split(path.sep).join('/') + '?full=1&rymock=L2';

const MLAT = 6378137 * Math.PI / 180;
const LAT0 = 18.25, LNG0 = 109.518;
const DLAT = 170 / MLAT;
const DLNG = 300 / (MLAT * Math.cos(LAT0 * Math.PI / 180));
const RING = [[LAT0, LNG0], [LAT0, LNG0 + DLNG], [LAT0 - DLAT, LNG0 + DLNG], [LAT0 - DLAT, LNG0]];

function worldOf(ring) {
  const lats = ring.map(p => p[0]), lngs = ring.map(p => p[1]);
  const clat = lats.reduce((a, b) => a + b, 0) / lats.length;
  const cosLat = Math.cos(clat * Math.PI / 180);
  const xs = ring.map(p => (p[1] - lngs[0]) * MLAT * cosLat);
  const ys = ring.map(p => (p[0] - clat) * MLAT);
  return { clat, refLng: lngs[0], cosLat, xs, ys,
    canvas: xs.map((x, i) => ({ x: x, y: -ys[i] })), frame: xs.map((x, i) => ({ x: x, y: ys[i] })) };
}
const W = worldOf(RING);

const mkPlot = (id, name) => ({
  id, name, sqm: 51000, mu: 76.5, ts: 1780000000000, source: 'map', note: '', crs: 'GCJ-02',
  polyLatLng: RING, poly: W.frame, mapFramePoly: W.frame,
  geo: { refLat: +W.clat.toFixed(6), refLng: +W.refLng.toFixed(6), proj: 'mercatorLocal', ts: 1780000000000 },
  center: { lat: +W.clat.toFixed(6), lng: +(W.refLng + DLNG / 2).toFixed(6) },
  /* 带一条已保存干线：H1d 要验「原有 trunk-vertex 没被新三类挤掉」，
     种子里没有干线的话这一条恒为 0，断言就没有意义。 */
  trunk: { schema: 2, source: 'map', coordinateSystem: 'GCJ-02', revision: 1, trunks: [
    { id: 'T1', main: true, points: [[18.2498, 109.5186], [18.2498, 109.5198], [18.2495, 109.5206]],
      params: { material: 'PE', dn: 63, designFlow: 12.5 } }] },
});

const out = [];
const rec = (label, ok, detail) => {
  out.push([label, ok, detail]);
  console.log((ok ? '  OK   ' : '  FAIL ') + label + (detail ? '  ' + detail : ''));
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  if (!EDGE) { console.log('找不到 Microsoft Edge'); process.exitCode = 1; return; }
  const browser = await chromium.launch({
    channel: 'msedge', headless: true, executablePath: EDGE,
    args: ['--allow-file-access-from-files', '--no-first-run', '--no-default-browser-check'],
  });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, serviceWorkers: 'block' });
  await context.route(/^https?:\/\//, r => r.abort());
  await context.addInitScript(plots => {
    if (!localStorage.getItem('__p6_seed')) {
      localStorage.setItem('runye_plot_library', JSON.stringify(plots));
      localStorage.setItem('runyeLocalAdminSession', '1');
      localStorage.setItem('__p6_seed', '1');
    }
  }, [mkPlot('p6-a', 'P6-A'), mkPlot('p6-b', 'P6-B')]);

  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) { } });

  const killMask = () => page.evaluate(() => {
    if (document.getElementById('__probe_mask_kill')) return;
    const s = document.createElement('style'); s.id = '__probe_mask_kill';
    s.textContent = '[class*="ry-ann"]{display:none!important;pointer-events:none!important}#warn{display:none!important}';
    document.head.appendChild(s);
  });

  /* ---- 1. 分区页造施工图数据（tlDiagramData） ---- */
  await page.goto(BASE + '#pipePlanSection', { waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 80; i++) {
    if (await page.evaluate("!!window.ppLoadPolygon && !!window.tlAutoGenerate && !!window.RyTrunkSnap")) break;
    await sleep(250);
  }
  await killMask();
  const gen = await page.evaluate(({ ring, pid }) => {
    const lats = ring.map(p => p[0]), lngs = ring.map(p => p[1]);
    const clat = lats.reduce((a, b) => a + b, 0) / lats.length;
    const mlat = 6378137 * Math.PI / 180, cosLat = Math.cos(clat * Math.PI / 180);
    const xs = [], ys = [];
    ring.forEach(p => { xs.push((p[1] - lngs[0]) * mlat * cosLat); ys.push((p[0] - clat) * mlat); });
    window.measuredPolygon = xs.map((x, i) => ({ x: x, y: -ys[i] }));
    window.__runyeMapFramePoly = xs.map((x, i) => ({ x: x, y: ys[i] }));
    window.__runyeGeoBase = { refLat: clat, refLng: lngs[0] };
    window.measuredArea = 51000;
    window.measuredPolygonSource = 'map';
    window.currentPlotId = pid;
    const tp = [[18.2495, 109.5185], [18.2495, 109.5194], [18.2490, 109.5203]];
    window.__runyeImportedTrunk = { plotId: pid, revision: 1, trunkId: 'T1',
      points: tp.map(q => ({ x: (q[1] - lngs[0]) * mlat * cosLat, y: -(q[0] - clat) * mlat })) };
    if (typeof window.ppLoadPolygon === 'function') window.ppLoadPolygon();
    window.tlAutoGenerate({ scroll: false });
    return { hasDiagram: !!window.tlDiagramData, valves: window.tlDiagramData ? window.tlDiagramData.valves.length : -1,
      branches: window.tlDiagramData ? window.tlDiagramData.branchPipes.length : -1 };
  }, { ring: RING, pid: 'p6-a' });
  rec('H0 施工图数据已生成', gen.hasDiagram && gen.valves > 0 && gen.branches > 0, JSON.stringify(gen));

  /* ---- 2. 切到地图页，选同一块地，进绘制态 ---- */
  await page.goto(BASE + '#onlineMapSection', { waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 80; i++) {
    if (await page.evaluate("!!window.RyMapHost && !!document.getElementById('btnDrawTrunk')")) break;
    await sleep(250);
  }
  await killMask();
  await sleep(600);

  const picked = await page.evaluate(pid => {
    const go = document.querySelector('#myPlotList .place-go[data-plot-id="' + pid + '"]');
    if (!go) return { ok: false, why: 'no-row', rows: document.querySelectorAll('#myPlotList .place-go').length };
    go.click();
    return { ok: true };
  }, 'p6-a');
  rec('H0b 地图页能选中地块 p6-a', picked.ok, JSON.stringify(picked));
  await sleep(1200);

  /* 进绘制态（refreshSnapTargets 在 setTrunkMode('draw') 里触发） */
  const drew = await page.evaluate(() => {
    const b = document.getElementById('btnDrawTrunk');
    if (!b) return { ok: false, why: 'no-btn' };
    b.click();
    return { ok: true, mode: window.RyMapHost.trunkState().mode };
  });
  await sleep(800);
  rec('H0c 已进入总管绘制态', drew.ok && drew.mode === 'draw', JSON.stringify(drew));

  /* ---- H1：三类真的进了候选集 ---- */
  const h1 = await page.evaluate(() => {
    const st = window.RyMapHost.snapStats();
    const ts = window.RyMapHost.trunkState();
    return { stats: st, extras: ts.snapExtras, plotId: ts.plotId, curPlot: window.currentPlotId };
  });
  const bk = (h1.stats && h1.stats.byKind) || {};
  rec('H1a 阀门进了候选集', (bk['valve-node'] || 0) > 0, 'byKind=' + JSON.stringify(bk));
  rec('H1b 支管起点进了候选集', (bk['branch-start'] || 0) > 0, '');
  rec('H1c 分区顶点进了候选集', (bk['zone-vertex'] || 0) > 0, '');
  rec('H1d 原有三类没被挤掉', (bk['plot-vertex'] || 0) > 0 && (bk['trunk-vertex'] || 0) > 0,
    'plot-vertex=' + (bk['plot-vertex'] || 0) + ' trunk-vertex=' + (bk['trunk-vertex'] || 0));
  rec('H1e 出口里能看到自校准结果', !!(h1.extras && h1.extras.sign === -1), JSON.stringify(h1.extras));

  /* ---- H2：真实鼠标移到阀门上 ⇒ 命中阀门 + 标记出现 ---- */
  const valveLL = await page.evaluate(() => {
    const dd = window.tlDiagramData;
    if (!dd || !dd.valves || !dd.valves.length) return null;
    /* 找一个离所有地块顶点都远的阀门，避免被 plot-vertex 优先级抢走 */
    const b = dd.valves[0];
    return { x: b.x, y: b.y };
  });

  const centerLL = await page.evaluate(v => {
    /* 用站点自己的反算口径把阀门世界坐标变回经纬度：借 snapStats 的 sign + geoBase */
    const base = window.__runyeGeoBase, mlat = 6378137 * Math.PI / 180;
    const cosLat = Math.cos(base.refLat * Math.PI / 180);
    const sign = (window.RyMapHost.trunkState().snapExtras || {}).sign || -1;
    return { lat: base.refLat + sign * (v.y / mlat), lng: base.refLng + v.x / (mlat * cosLat) };
  }, valveLL);

  const box = await page.evaluate(() => {
    const r = document.getElementById('map').getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
  const screenPt = await page.evaluate(ll => {
    const p = window.RyMapHost.project(ll.lat, ll.lng);
    const r = document.getElementById('map').getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  }, centerLL);

  const inView = screenPt.x > box.x + 5 && screenPt.x < box.x + box.w - 5 &&
                 screenPt.y > box.y + 5 && screenPt.y < box.y + box.h - 5;
  if (inView) {
    await page.mouse.move(screenPt.x, screenPt.y, { steps: 4 });
    await sleep(350);
  }
  const h2 = await page.evaluate(ll => {
    const hit = window.RyTrunkSnap.nearest(ll);
    const mark = document.querySelector('.ry-snap-mark');
    return { hit: hit, hasMark: !!mark };
  }, centerLL);
  rec('H2a 阀门位置上命中 valve-node', inView && !!(h2.hit && h2.hit.kind === 'valve-node'),
    JSON.stringify({ inView, hit: h2.hit }));
  rec('H2b 白圈标记真的出现在地图上', inView && h2.hasMark === true, 'hasMark=' + h2.hasMark);

  /* ---- H3：地块归属不一致 ⇒ 三类整体消失 ---- */
  const h3 = await page.evaluate(() => {
    const keep = window.currentPlotId;
    window.currentPlotId = 'p6-b';                  // 分区页说"当前是 B"，地图页在编辑 A
    const n = window.RyMapHost.refreshSnapTargets();
    const st = window.RyMapHost.snapStats();
    const ts = window.RyMapHost.trunkState();
    const res = { n: n, byKind: st.byKind, extras: ts.snapExtras };
    window.currentPlotId = keep;                    // 还原
    return res;
  });
  const bk3 = h3.byKind || {};
  rec('H3 地块归属不一致时，阀门/支管起点/分区顶点必须整体消失',
    h3.extras === null && !bk3['valve-node'] && !bk3['branch-start'] && !bk3['zone-vertex'],
    JSON.stringify({ extras: h3.extras, byKind: bk3 }));

  /* ---- H4：守卫触发时不误伤原有三类 ---- */
  rec('H4 守卫触发后地块顶点仍然能吸', (bk3['plot-vertex'] || 0) > 0, JSON.stringify(bk3));

  /* ---- H5：还原归属后三类回来；远离一切目标时不吸 ---- */
  const h5 = await page.evaluate(() => {
    const n = window.RyMapHost.refreshSnapTargets();
    const st = window.RyMapHost.snapStats();
    const base = window.__runyeGeoBase;
    /* 地块外 300m（南）—— 附近没有任何候选 */
    const far = { lat: base.refLat - 0.0035, lng: base.refLng + 0.0015 };
    const hitFar = window.RyTrunkSnap.nearest(far);
    return { n: n, byKind: st.byKind, hitFar: hitFar };
  });
  rec('H5a 归属恢复后三类回来了', (h5.byKind['valve-node'] || 0) > 0, JSON.stringify(h5.byKind));
  rec('H5b 远离一切目标时不吸（不是"到处都有吸力"）', h5.hitFar === null, JSON.stringify(h5.hitFar));

  rec('H6 无 pageerror', pageErrors.length === 0, pageErrors.join(' | ') || '(none)');

  const shot = path.join(ROOT, '_shots', 'p6-snap.png');
  fs.mkdirSync(path.dirname(shot), { recursive: true });
  await page.screenshot({ path: shot }).catch(() => {});

  const fail = out.filter(o => !o[1]).length;
  console.log(`\n== trunk-p6-snap: ${out.length - fail}/${out.length} 通过 ==`);
  fs.writeFileSync(path.join(ROOT, '_probe_trunk_p6_snap_out.json'),
    JSON.stringify({ out, gen, h1, h2, h3, h5, pageErrors }, null, 2));
  await browser.close();
  process.exitCode = fail ? 1 : 0;
})();
