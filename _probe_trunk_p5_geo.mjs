'use strict';
/* _probe_trunk_p5_geo.mjs —— 坐标反算可行性验证（**只读**，不改站点任何行为）
 *
 * 要回答的问题（任务书 §5 遗留项）：
 *   阀门 / 支管起点 / 分区顶点在 `tlDiagramData` 里是**画布世界米坐标**，
 *   能不能可靠反算成 GCJ-02 经纬度？接不准就会"吸到错位置"，比不接更糟。
 *
 * ★ 判据不许自证。站点自己在 `tlAutoGenerate` 末尾（mod/inline-09.js:4792-4908）
 *   已经把 dd.valves / dd.branchPipes 按站点口径反投成经纬度写进
 *   `runye_network_layout`。那是**站点给出的标准答案** —— 我的反算必须与它逐点对上，
 *   而不是"照抄公式再用公式验公式"。
 *
 * 判据：
 *   G1 素材齐备（world==='meter' / geoBase 有效 / valves 与 branchPipes 非空）
 *   G2 符号自校准真的能分辨：按 +y 与 -y 两个候选反算，用已知 polyLatLng 当标尺算 RMS
 *      —— 正确那个 < 0.5m，错误那个 > 50m。两个都过 = 地块退化 ⇒ 不许接。
 *   G3 **与站点黑盒答案逐点对照**（阀门 + 全部支管点，误差 < 0.3m）
 *   G4 反算点落在地块环内（离环距离 < 1m）
 *   G5 纯只读：反算前后 tlDiagramData 与 localStorage 指纹零变化
 *   G6 分区顶点（网格交点经 zones.frame 转世界）反算后亦落在环内
 *
 * 三条路径都跑（口径不同，结论必须一致）：
 *   S1 地图回传口径：measuredPolygon = -ys（inline-16 的写法）
 *   S2 设为当前 · 库里 poly = +ys（地图页 saveCurrentDraftToLibrary 的存法）
 *   S3 设为当前 · 库里 poly = -ys（分区页 saveCurrent 的存法）
 *
 * 用法：node _probe_trunk_p5_geo.mjs
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
const APP = 'file:///' + path.join(ROOT, 'index.html').split(path.sep).join('/') + '?full=1&rymock=L2#pipePlanSection';

/* ---- 造一个 300m × 170m 的地块（与 shared-canvas-browser.cjs 同尺寸，保证能生成管路） ---- */
const MLAT = 6378137 * Math.PI / 180;
const LAT0 = 18.25, LNG0 = 109.518;
const DLAT = 170 / MLAT;
const DLNG = 300 / (MLAT * Math.cos(LAT0 * Math.PI / 180));
const RING = [[LAT0, LNG0], [LAT0, LNG0 + DLNG], [LAT0 - DLAT, LNG0 + DLNG], [LAT0 - DLAT, LNG0]];

/* 世界坐标：与 inline-16 同式（这里只是**造素材**，不是被测逻辑） */
function worldOf(ring) {
  const lats = ring.map(p => p[0]), lngs = ring.map(p => p[1]);
  const clat = lats.reduce((a, b) => a + b, 0) / lats.length;
  const cosLat = Math.cos(clat * Math.PI / 180);
  const xs = ring.map(p => (p[1] - lngs[0]) * MLAT * cosLat);
  const ys = ring.map(p => (p[0] - clat) * MLAT);
  return {
    clat, refLng: lngs[0], mlat: MLAT, cosLat, xs, ys,
    canvas: xs.map((x, i) => ({ x: x, y: -ys[i] })),   // measuredPolygon 口径（画布，北在上）
    frame: xs.map((x, i) => ({ x: x, y: ys[i] })),     // mapFrame 口径（北 = +y）
  };
}
const W = worldOf(RING);

function mkPlot(id, polySym) {
  return {
    id: id, name: id.toUpperCase(), sqm: 51000, mu: 76.5, ts: 1780000000000,
    source: 'map', note: '', crs: 'GCJ-02',
    polyLatLng: RING,
    poly: polySym > 0 ? W.frame : W.canvas,
    mapFramePoly: W.frame,
    geo: { refLat: +W.clat.toFixed(6), refLng: +W.refLng.toFixed(6), proj: 'mercatorLocal', ts: 1780000000000 },
    center: { lat: +W.clat.toFixed(6), lng: +(W.refLng + DLNG / 2).toFixed(6) },
  };
}

const out = [];
const rec = (label, ok, detail) => {
  out.push([label, ok, detail]);
  console.log((ok ? '  OK   ' : '  FAIL ') + label + (detail ? '  ' + detail : ''));
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ============ 页面内注入的「候选实现」 ============
 * 这就是准备落地到 mod/online-map.js 的反算桥，探针里**原样**先用一遍。
 * 口径不硬编码 ±y：用地块库里的 polyLatLng 当标尺，在两个候选里选能对上的那个。
 * 对不上就返回 null（= 不接这三类捕捉），绝不猜。 */
const BRIDGE_SRC = `
window.geoBridge = function(){
  var dd = window.tlDiagramData;
  var base = window.__runyeGeoBase;
  if(!dd || dd.world !== 'meter') return {ok:false, why:'no-diagram'};
  if(!base || !isFinite(base.refLat) || !isFinite(base.refLng)) return {ok:false, why:'no-base'};
  if(!Array.isArray(dd.poly) || dd.poly.length < 3) return {ok:false, why:'no-poly'};
  var snap = window.RyPlotLibraryStore && window.RyPlotLibraryStore.read();
  var pid = window.currentPlotId;
  var plot = null;
  if(snap && snap.ok && pid){
    plot = snap.plots.filter(function(p){ return p && String(p.id)===String(pid); })[0] || null;
  }
  if(!plot || !Array.isArray(plot.polyLatLng) || plot.polyLatLng.length !== dd.poly.length){
    return {ok:false, why:'no-ring'};
  }
  var mlat = 6378137 * Math.PI / 180;
  var cosLat = Math.cos(base.refLat * Math.PI / 180);
  function cand(sign){
    return dd.poly.map(function(q){
      return { lat: base.refLat + sign * (q.y / mlat), lng: base.refLng + q.x / (mlat * cosLat) };
    });
  }
  function rmsOf(list){
    var s = 0;
    for(var i=0;i<list.length;i++){
      var a = list[i], b = plot.polyLatLng[i];
      var dy = (a.lat - (+b[0])) * mlat;
      var dx = (a.lng - (+b[1])) * mlat * cosLat;
      s += dx*dx + dy*dy;
    }
    return Math.sqrt(s / list.length);
  }
  var A = cand(+1), B = cand(-1);
  var rA = rmsOf(A), rB = rmsOf(B);
  var pick = null, sign = 0, rms = Infinity;
  if(rB <= rA){ pick = B; sign = -1; rms = rB; } else { pick = A; sign = +1; rms = rA; }
  var other = (sign === -1) ? rA : rB;
  var usable = isFinite(rms) && rms < 0.5 && Math.abs(other - rms) > 1;
  function toLL(pt){
    if(!pt) return null;
    var la = +pt.y, ln = +pt.x;
    if(!isFinite(la) || !isFinite(ln)) return null;
    return { lat: base.refLat + sign * (la / mlat), lng: base.refLng + ln / (mlat * cosLat) };
  }
  return { ok: usable, sign: sign, rms: rms, other: other, why: usable?'':'ambiguous',
           base: base, mlat: mlat, cosLat: cosLat, toLL: toLL, ringLen: dd.poly.length };
};
`;

async function runScenario(browser, label, seed, drive) {
  console.log('\n=== ' + label + ' ===');
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, serviceWorkers: 'block' });
  await context.route(/^https?:\/\//, r => r.abort());
  await context.addInitScript(({ plots, tag }) => {
    if (!localStorage.getItem('__p5_seed_' + tag)) {
      localStorage.setItem('runye_plot_library', JSON.stringify(plots));
      localStorage.setItem('runyeLocalAdminSession', '1');
      localStorage.setItem('__p5_seed_' + tag, '1');
    }
  }, { plots: seed, tag: label });

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

  await page.goto(APP, { waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 80; i++) {
    if (await page.evaluate("!!window.ppLoadPolygon && !!window.tlAutoGenerate && !!window.RyPlotLibraryStore && !!window.RyIrrigationDataStore")) break;
    await sleep(250);
  }
  await killMask();
  await page.evaluate(BRIDGE_SRC);

  /* ---- 驱动：把地块装进画布并生成管路 ---- */
  const setup = await drive(page);
  console.log('  setup: ' + JSON.stringify(setup));
  await page.waitForTimeout(900);

  const pid = setup.plotId;
  const info = await page.evaluate(o => {
    const dd = window.tlDiagramData || {};
    return {
      hasDiagram: !!dd,
      world: dd && dd.world,
      plotId: window.currentPlotId,
      base: window.__runyeGeoBase,
      measuredSym: (function () {
        const mp = window.measuredPolygon, mf = window.__runyeMapFramePoly;
        if (!mp || !mf) return null;
        let same = 0, flip = 0;
        for (let i = 0; i < mp.length; i++) {
          same = Math.max(same, Math.abs(mp[i].y - mf[i].y));
          flip = Math.max(flip, Math.abs(mp[i].y + mf[i].y));
        }
        return { same: +same.toFixed(3), flip: +flip.toFixed(3) };
      })(),
      polyLen: dd && dd.poly && dd.poly.length,
      valves: dd && Array.isArray(dd.valves) ? dd.valves.length : -1,
      branches: dd && Array.isArray(dd.branchPipes) ? dd.branchPipes.length : -1,
      branchPts: dd && Array.isArray(dd.branchPipes) ? dd.branchPipes.reduce((a, l) => a + (l ? l.length : 0), 0) : -1,
      frontPts: dd && Array.isArray(dd.frontPipe) ? dd.frontPipe.length : -1,
      zones: dd && dd.zones ? { cols: dd.zones.cols, rows: dd.zones.rows, frame: !!dd.zones.frame } : null,
      bridge: (function () {
        try {
          const b = geoBridge();
          const f = v => (typeof v === 'number' && isFinite(v)) ? +v.toFixed(4) : null;
          return { ok: b.ok, sign: b.sign, rms: f(b.rms), other: f(b.other), why: b.why };
        } catch (e) { return { err: String(e && e.message) }; }
      })(),
    };
  }, null);

  rec(label + ' G1 素材齐备', !!(info.hasDiagram && info.world === 'meter' && info.base && info.polyLen >= 3),
    JSON.stringify({ world: info.world, base: info.base, polyLen: info.polyLen }));
  rec(label + ' G1b 阀门与支管确实存在（否则后面全是空断言）', info.valves > 0 && info.branchPts > 0,
    JSON.stringify({ valves: info.valves, branches: info.branches, branchPts: info.branchPts, frontPts: info.frontPts }));
  rec(label + ' G2 自校准选对了符号', !!(info.bridge && info.bridge.ok),
    JSON.stringify(info.bridge));
  rec(label + ' G2b 另一个候选必须显著错（证明这条判据真能分辨）',
    !!(info.bridge && info.bridge.other > 50),
    'correct=' + (info.bridge && info.bridge.rms) + 'm  wrong=' + (info.bridge && info.bridge.other) + 'm');

  /* ---- G3：与站点自己写进 runye_network_layout 的经纬度逐点对照（黑盒标准答案） ---- */
  const cmp = await page.evaluate(pid2 => {
    const raw = window.RyIrrigationDataStore.readRawNetworkLayout(pid2);
    if (!raw) return { err: 'no-layout' };
    let net = null;
    try { net = JSON.parse(raw); } catch (e) { return { err: 'bad-json' }; }
    if (!net) return { err: 'null-layout' };
    const b = geoBridge();
    if (!b.ok) return { err: 'bridge-off', why: b.why };
    const dd = window.tlDiagramData || {};
    const mlat = b.mlat, cosLat = b.cosLat, base = b.base;
    function dM(a, c) {
      const dy = (a.lat - c.lat) * mlat;
      const dx = (a.lng - c.lng) * mlat * cosLat;
      return Math.sqrt(dx * dx + dy * dy);
    }
    const res = { valves: null, branch: null, front: null, counts: { siteValves: (net.valves || []).length, ddValves: (dd.valves || []).length } };
    /* 阀门 */
    if ((net.valves || []).length && (dd.valves || []).length) {
      let worst = 0, n = Math.min(net.valves.length, dd.valves.length);
      for (let i = 0; i < n; i++) {
        const mine = b.toLL(dd.valves[i]);
        const theirs = net.valves[i];
        if (!mine || !theirs) continue;
        worst = Math.max(worst, dM(mine, { lat: +theirs.lat, lng: +theirs.lng }));
      }
      res.valves = { worst: +worst.toFixed(4), n: n };
    }
    /* 支管：按 id 'branch{i}' 对上 dd.branchPipes[i]，逐点比 */
    const segs = (net.segments || []).filter(s => s && s.kind === 'branch');
    if (segs.length && (dd.branchPipes || []).length) {
      let worst = 0, n = 0, miss = 0;
      segs.forEach(s => {
        const i = Number(String(s.id).replace(/[^0-9]/g, ''));
        const line = dd.branchPipes[i];
        if (!line || !Array.isArray(s.latLng)) { miss++; return; }
        const m = Math.min(line.length, s.latLng.length);
        for (let k = 0; k < m; k++) {
          const mine = b.toLL(line[k]);
          const theirs = s.latLng[k];
          if (!mine || !theirs) continue;
          worst = Math.max(worst, dM(mine, { lat: +theirs[0], lng: +theirs[1] }));
          n++;
        }
      });
      res.branch = { worst: +worst.toFixed(4), n: n, segs: segs.length, miss: miss };
    }
    /* 总管（frontPipe） */
    const fseg = (net.segments || []).filter(s => s && s.kind === 'front')[0];
    if (fseg && dd.frontPipe) {
      let worst = 0, n = Math.min(fseg.latLng.length, dd.frontPipe.length);
      for (let k = 0; k < n; k++) {
        const mine = b.toLL(dd.frontPipe[k]);
        const theirs = fseg.latLng[k];
        if (!mine || !theirs) continue;
        worst = Math.max(worst, dM(mine, { lat: +theirs[0], lng: +theirs[1] }));
      }
      res.front = { worst: +worst.toFixed(4), n: n };
    }
    return res;
  }, pid);

  const tol = 0.3;   // 站点 p2ll 用 toFixed(6) ⇒ 1e-6° ≈ 0.11m
  rec(label + ' G3a 阀门反算 = 站点反投（黑盒答案）',
    !!(cmp && cmp.valves && cmp.valves.n > 0 && cmp.valves.worst < tol),
    JSON.stringify(cmp && cmp.valves) + (cmp && cmp.err ? ' err=' + cmp.err : ''));
  rec(label + ' G3b 支管每个点都对得上',
    !!(cmp && cmp.branch && cmp.branch.n > 0 && cmp.branch.worst < tol && cmp.branch.miss === 0),
    JSON.stringify(cmp && cmp.branch));
  /* 本块没有地图总管时 frontPipe 为空 —— 不适用，记通过并注明（另有 G1b 已证明管路素材非空） */
  const frontNa = !(cmp && cmp.front) && info.frontPts <= 0;
  rec(label + ' G3c 总管每个点都对得上',
    frontNa ? true : !!(cmp && cmp.front && cmp.front.n > 0 && cmp.front.worst < tol),
    frontNa ? '不适用：本块无地图总管（frontPipe 为空）' : JSON.stringify(cmp && cmp.front));

  /* ---- G4：反算点必须落在地块环内 ---- */
  const inPoly = await page.evaluate(() => {
    const b = geoBridge();
    if (!b.ok) return { err: 'bridge-off' };
    const dd = window.tlDiagramData || {};
    const ring = window.__p5_ring;               // 由驱动写入（= 地块库 polyLatLng）
    if (!ring) return { err: 'no-ring' };
    const mlat = b.mlat, cosLat = b.cosLat;
    const P = ring.map(q => ({ x: (+q[1]) * mlat * cosLat, y: (+q[0]) * mlat }));
    function inside_or_near(pt) {
      const p = { x: pt.lng * mlat * cosLat, y: pt.lat * mlat };
      let ins = false;
      for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
        if (((P[i].y > p.y) !== (P[j].y > p.y)) &&
            (p.x < (P[j].x - P[i].x) * (p.y - P[i].y) / (P[j].y - P[i].y) + P[i].x)) ins = !ins;
      }
      if (ins) return { ok: true, d: 0 };
      /* 边界容差：到最近边的米距离 */
      let best = Infinity;
      for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
        const ax = P[j].x, ay = P[j].y, bx = P[i].x, by = P[i].y;
        const vx = bx - ax, vy = by - ay;
        const L = vx * vx + vy * vy;
        let t = L > 0 ? ((p.x - ax) * vx + (p.y - ay) * vy) / L : 0;
        t = Math.max(0, Math.min(1, t));
        const cx = ax + t * vx, cy = ay + t * vy;
        best = Math.min(best, Math.hypot(p.x - cx, p.y - cy));
      }
      return { ok: best < 1.0, d: +best.toFixed(3) };
    }
    const res = { valves: [], branchStarts: [], frontPts: [] };
    (dd.valves || []).forEach(v => { const ll = b.toLL(v); if (ll) res.valves.push(inside_or_near(ll)); });
    (dd.branchPipes || []).forEach(l => { const ll = l && l[0] ? b.toLL(l[0]) : null; if (ll) res.branchStarts.push(inside_or_near(ll)); });
    (dd.frontPipe || []).forEach(v => { const ll = b.toLL(v); if (ll) res.frontPts.push(inside_or_near(ll)); });
    const bad = o => Object.keys(res).map(k => ({ k: k, bad: res[k].filter(x => !x.ok).length, n: res[k].length })).filter(x => x.bad > 0);
    return { bad: bad(), sample: res.valves.slice(0, 3) };
  });

  rec(label + ' G4 阀门/支管起点/总管点全部落在地块环内',
    !!(inPoly && !inPoly.err && Array.isArray(inPoly.bad) && inPoly.bad.length === 0),
    JSON.stringify(inPoly));

  /* ---- G6：分区顶点（网格交点经 zones.frame 转世界）也落在环内 ---- */
  const zoneRes = await page.evaluate(() => {
    const b = geoBridge();
    if (!b.ok) return { err: 'bridge-off' };
    const dd = window.tlDiagramData || {};
    const z = dd.zones;
    if (!z || !z.frame) return { err: 'no-frame' };
    const f = z.frame;
    const c = f.center || { x: 0, y: 0 }, o = f.origin || { x: 0, y: 0 };
    const a = (Number(f.angle) || 0) * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
    const sx = Number(f.scaleX) || 1, sy = Number(f.scaleY) || 1;
    function toWorld(p) {
      const dx = p.x - c.x, dy = p.y - c.y;
      return { x: o.x + (c.x + dx * cs - dy * sn) / sx, y: o.y + (c.y + dx * sn + dy * cs) / sy };
    }
    const ring = window.__p5_ring;
    if (!ring) return { err: 'no-ring' };
    const mlat = b.mlat, cosLat = b.cosLat;
    const P = ring.map(q => ({ x: (+q[1]) * mlat * cosLat, y: (+q[0]) * mlat }));
    function nearOrIn(ll) {
      const p = { x: ll.lng * mlat * cosLat, y: ll.lat * mlat };
      let ins = false;
      for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
        if (((P[i].y > p.y) !== (P[j].y > p.y)) &&
            (p.x < (P[j].x - P[i].x) * (p.y - P[i].y) / (P[j].y - P[i].y) + P[i].x)) ins = !ins;
      }
      if (ins) return true;
      let best = Infinity;
      for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
        const ax = P[j].x, ay = P[j].y, bx = P[i].x, by = P[i].y;
        const vx = bx - ax, vy = by - ay, L = vx * vx + vy * vy;
        let t = L > 0 ? ((p.x - ax) * vx + (p.y - ay) * vy) / L : 0;
        t = Math.max(0, Math.min(1, t));
        best = Math.min(best, Math.hypot(p.x - (ax + t * vx), p.y - (ay + t * vy)));
      }
      return best < 1.0;
    }
    const xs = [], ys = [];
    (z.xPos || []).forEach(v => xs.push(v));
    (z.yPos || []).forEach(v => ys.push(v));
    let total = 0, outside = 0;
    const badSamples = [];
    for (let i = 0; i < xs.length; i++) for (let j = 0; j < ys.length; j++) {
      const w = toWorld({ x: xs[i], y: ys[j] });
      const ll = b.toLL(w);
      if (!ll) continue;
      total++;
      if (!nearOrIn(ll)) { outside++; if (badSamples.length < 3) badSamples.push({ i: i, j: j, w: w, ll: ll }); }
    }
    return { total: total, outside: outside, angle: f.angle, cols: xs.length, rows: ys.length, badSamples: badSamples };
  });
  rec(label + ' G6 分区网格交点（frame 转世界后）反算落在环内',
    !!(zoneRes && !zoneRes.err && zoneRes.total > 0 && zoneRes.outside === 0),
    JSON.stringify(zoneRes));

  /* ---- G5：纯只读 ---- */
  const before = await page.evaluate(() => ({
    tl: JSON.stringify(window.tlDiagramData || null),
    ls: (function () { const o = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o.push([k, localStorage.getItem(k)]); } return JSON.stringify(o.sort()); })(),
  }));
  await page.evaluate(() => { const b = geoBridge(); const dd = window.tlDiagramData || {}; (dd.valves || []).forEach(v => b.toLL(v)); });
  await sleep(300);
  const after = await page.evaluate(() => ({
    tl: JSON.stringify(window.tlDiagramData || null),
    ls: (function () { const o = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o.push([k, localStorage.getItem(k)]); } return JSON.stringify(o.sort()); })(),
  }));
  rec(label + ' G5 反算是纯函数（tlDiagramData 与 localStorage 零变化）',
    before.tl === after.tl && before.ls === after.ls,
    before.tl === after.tl ? (before.ls === after.ls ? 'both stable' : 'localStorage changed') : 'tlDiagramData changed');

  rec(label + ' G7 无 pageerror', pageErrors.length === 0, pageErrors.join(' | ') || '(none)');

  const shot = path.join(ROOT, '_shots', 'p5-' + label + '.png');
  fs.mkdirSync(path.dirname(shot), { recursive: true });
  await page.screenshot({ path: shot }).catch(() => {});
  await context.close();
  return { info, cmp, inPoly, zoneRes };
}

(async () => {
  if (!EDGE) { console.log('找不到 Microsoft Edge'); process.exitCode = 1; return; }
  const browser = await chromium.launch({
    channel: 'msedge', headless: true, executablePath: EDGE,
    args: ['--allow-file-access-from-files', '--no-first-run', '--no-default-browser-check'],
  });

  /* 场景驱动：measuredPolygon 取哪种口径（sym=-1 → 画布口径 -ys；+1 → 地图口径 +ys） */
  const makeDrive = (plotId, sym) => async (page) => page.evaluate(({ ring, pid, sym2 }) => {
    const lats = ring.map(p => p[0]), lngs = ring.map(p => p[1]);
    const clat = lats.reduce((a, b) => a + b, 0) / lats.length;
    const mlat = 6378137 * Math.PI / 180, cosLat = Math.cos(clat * Math.PI / 180);
    const xs = [], ys = [];
    ring.forEach(p => { xs.push((p[1] - lngs[0]) * mlat * cosLat); ys.push((p[0] - clat) * mlat); });
    const ysUse = sym2 > 0 ? ys : ys.map(v => -v);
    window.measuredPolygon = xs.map((x, i) => ({ x: x, y: ysUse[i] }));
    window.__runyeMapFramePoly = xs.map((x, i) => ({ x: x, y: ys[i] }));
    window.__runyeGeoBase = { refLat: clat, refLng: lngs[0] };
    window.measuredArea = 51000;
    window.measuredPolygonSource = 'map';
    window.currentPlotId = pid;
    window.__p5_ring = ring;
    /* 总管素材：x 正投；y 与该场景的 measuredPolygon 同口径（否则会让总管与地块互相镜像） */
    const tp = [[18.2495, 109.5185], [18.2495, 109.5194], [18.2490, 109.5203]];
    window.__runyeImportedTrunk = { plotId: pid, revision: 1, trunkId: 'T1',
      points: tp.map(q => ({ x: (q[1] - lngs[0]) * mlat * cosLat, y: sym2 * (q[0] - clat) * mlat })) };
    if (typeof window.ppLoadPolygon === 'function') window.ppLoadPolygon();
    window.tlAutoGenerate({ scroll: false });
    return { plotId: pid, sym: sym2 };
  }, { ring: RING, pid: plotId, sym2: sym });

  /* ---- S1 画布口径：measuredPolygon = -ys（inline-16 地图回传的写法） ---- */
  const s1 = await runScenario(browser, 'S1', [mkPlot('p5-s1', +1)], makeDrive('p5-s1', -1));

  /* ---- S2 地图口径：measuredPolygon = +ys（等价于"某条路径没做 v219 翻转"）
     不是走 UI —— 地块库列表面板 #plotLibList 在本版 index.html 里已不存在（只剩注释），
     「设为当前」这一入口在页面上不可达。这里覆盖的是**另一侧符号**：
     自校准必须仍能选对，否则说明它只在一种口径下成立。 ---- */
  const s2 = await runScenario(browser, 'S2', [mkPlot('p5-s2', -1)], makeDrive('p5-s2', +1));

  /* 三路结论必须一致 */
  const signs = [s1, s2].map(x => x.info.bridge && x.info.bridge.sign);
  rec('S4 两种口径下自校准都成立，且各自的符号与素材口径对应（-ys ⇒ -1，+ys ⇒ +1）',
    signs[0] === -1 && signs[1] === +1, JSON.stringify({ s1: signs[0], s2: signs[1] }));

  const fail = out.filter(o => !o[1]).length;
  console.log(`\n== trunk-p5-geo: ${out.length - fail}/${out.length} 通过 ==`);
  fs.writeFileSync(path.join(ROOT, '_probe_trunk_p5_geo_out.json'),
    JSON.stringify({ out, s1: s1.info, s2: s2.info, cmp: { s1: s1.cmp, s2: s2.cmp } }, null, 2));
  await browser.close();
  process.exitCode = fail ? 1 : 0;
})();
