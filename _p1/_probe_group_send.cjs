/* 成组地块「能不能真的传到二级管路页」· 真浏览器验证（Edge/CDP）
 *
 * 用户原话（2026-10-03，第三次）：「还是不行，两个地块成组之后不能直接传给二级页面吗，
 *   一定要整合成一个地块才行吗？你检查一下逻辑是怎么样的，我们一起商量下怎么改。」
 *
 * ★ 查出来的真因（比「空隙被吞」更靠前）：**成组地块压根没被选中过**
 *   原回传按钮 btnCopy：
 *     pid = currentMapPlotId || ('pm'+Date.now())
 *     saved = 库里取 pid 这条
 *     if (saved && saved.merged) payload.subPlots = ...
 *   而 currentMapPlotId **只在「保存地块」时赋值**、「完成」后被置回 null；
 *   成组地块是 RunyeMapEnhance.merge **直接写进地块库**的，从不设置 currentMapPlotId。
 *   ⇒ 在地图上点成组地块只是 fitBounds 飞过去 ⇒ 回传时 saved = 最后画的那个子地块
 *     ⇒ saved.merged === false ⇒ payload.subPlots 一个都不带。
 *
 * 修法（v191）：回传对象改成**显式指定的地块**——「我的地块」列表每条加「→ 回传」，
 *   点谁传谁；payload 由 buildPlotPayload(plot) 统一构造（成组时面积 = Σ 成员环）。
 *
 * 本探针真跑一遍「打开地图页 → 列表里点成组地块的『→ 回传』→ 读 localStorage」，
 * 对**回传产物**下断言，并保留一条**反向对照**（R6：走旧的 btnCopy 路径确实拿不到 subPlots，
 * 证明这个 bug 真实存在过，不是我臆想的）。
 *
 * 用法：
 *   node _p1/_probe_group_send.cjs            # 正常：全绿 0 / 有红 1
 *   node _p1/_probe_group_send.cjs --inject 1 # 成组时不带 subPlots → R3/R4 必须红
 *   node _p1/_probe_group_send.cjs --inject 2 # 面积退回外框口径 → R5 必须红
 *   node _p1/_probe_group_send.cjs --inject 3 # 去掉「→ 回传」按钮 → R1/R2 必须红
 *   node _p1/_probe_group_send.cjs --inject all
 *
 * 退出码：正常 全绿 0 / 有红 1；注入 已捕获 0 / 恒绿 1 / 锚点漂移 2。
 */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');

const WS = 'C:\\Users\\AHS\\runye-irrigation';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = path.join(WS, '_verify_out');
const PORT = 9463;
const INJ = (() => {
  const i = process.argv.indexOf('--inject');
  if (i < 0) return 0;
  const v = process.argv[i + 1];
  return v === 'all' ? 99 : (parseInt(v, 10) || 0);
})();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileUrl = (p) => 'file:///' + p.replace(/\\/g, '/');
const SRC_PAGE = path.join(WS, 'runye-map-measure.html');

/* ---- 注入：生成同目录临时副本（页面用相对路径引 css/js，放别处会 404）---- */
function makeInjectedCopy() {
  const orig = fs.readFileSync(SRC_PAGE, 'utf8');
  let s = orig;
  const applied = [];
  /* ★ 同理：锚点里的换行写成 \r?\n，兼容 CRLF/LF（否则静默 0 命中 ⇒ 体检假绿） */
  const sub1 = (anchor, rep, tag) => {
    const parts = anchor.replace(/\r/g, '').split('\n').map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const re = new RegExp(parts.join('\\r?\\n'));
    const cnt = (s.match(re) || []).length;
    if (cnt !== 1) { console.error('[inject] 锚点' + tag + ' 漂移：期望 1 处，实际 ' + cnt + ' 处 :: ' + anchor.slice(0, 60)); process.exit(2); }
    s = s.replace(re, rep);
    applied.push(tag);
  };
  if (INJ === 1 || INJ === 99) {
    /* 成组时不带 subPlots（退回 v189 之前的「只有外框」） */
    sub1('if(plot && plot.merged && ((ringSet&&ringSet.length)||subs.length)){',
      'if(false){ /* [inject 1] 成组时不再带各子地块 */', '1');
  }
  if (INJ === 2 || INJ === 99) {
    /* 面积退回外框口径（把块间空隙并进面积） */
    sub1('        payload.sqm=Math.round(sum);          // ★ 成员之和，不含块间空隙\n        payload.mu=+(sum/666.67).toFixed(2);',
      '        /* [inject 2] 面积退回外框口径 */', '2');
  }
  if (INJ === 3 || INJ === 99) {
    /* 去掉列表里的「→ 回传」按钮（回到「成组地块选不中」的旧形态） */
    sub1('      row.appendChild(go);\n      row.appendChild(sd);',
      '      row.appendChild(go);\n      /* [inject 3] row.appendChild(sd); */', '3');
  }
  const p = path.join(WS, '_inj_groupsend.html');
  fs.writeFileSync(p, s, 'utf8');
  console.log('[inject] 已注入 ' + applied.join(' / ') + ' → ' + p);
  return p;
}

/* ---------- 测地面积（探针自己算，不依赖页面实现）----------
 * 页面里的 geodesicArea 不是全局可见（实测 typeof = undefined），且就算可见，
 * 「用页面的函数验证页面的产物」也是自证 —— 判据必须独立。
 * 球面多边形面积（Chamberlain & Duquette）：
 *   A = R²/2 · Σ (λ_{i+1} − λ_i)(2 + sin φ_i + sin φ_{i+1})   —— 退化到矩形即 R²·Δλ·(sinφ₁−sinφ₂) */
const R_EARTH = 6378137;
function geoArea(ring) {
  if (!ring || ring.length < 3) return 0;
  const rad = (d) => d * Math.PI / 180;
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const dLam = rad(b[1] - a[1]);
    s += dLam * (2 + Math.sin(rad(a[0])) + Math.sin(rad(b[0])));
  }
  return Math.abs(R_EARTH * R_EARTH * s / 2);
}

let pass = 0, fail = 0;
const check = (n, ok, extra) => {
  console.log((ok ? '  [PASS] ' : '  [FAIL] ') + n + (extra ? ' :: ' + extra : ''));
  ok ? pass++ : fail++;
};

/* ---------- 夹具：两块相隔约 30m 的子地块 + 一个成组地块 ---------- */
const B = [18.2528, 109.5119];
const D = 0.0004;        // ≈ 44.5m（纬） / 42.3m（经，18°N）
const GAP = 0.0003;      // ≈ 31.7m 的缝
function ring(lat0, lng0) {
  return [[lat0, lng0], [lat0, lng0 + D], [lat0 + D, lng0 + D], [lat0 + D, lng0]];
}
const R1 = ring(B[0], B[1]);
const R2 = ring(B[0], B[1] + D + GAP);
const HULL = [[B[0], B[1]], [B[0], B[1] + 2 * D + GAP], [B[0] + D, B[1] + 2 * D + GAP], [B[0] + D, B[1]]];

const LIB = [
  { id: 's1', name: '子块A', mu: 2.8, sqm: 1882, crop: '七彩花生', polyLatLng: R1,
    center: { lat: B[0] + D / 2, lng: B[1] + D / 2 }, mergedInto: 'big1',
    geo: { refLat: B[0] + D / 2, refLng: B[1], proj: 'mercatorLocal' }, source: 'map', crs: 'GCJ-02', poly: [] },
  { id: 's2', name: '子块B', mu: 2.8, sqm: 1882, crop: '水稻', polyLatLng: R2,
    center: { lat: B[0] + D / 2, lng: B[1] + D + GAP + D / 2 }, mergedInto: 'big1',
    geo: { refLat: B[0] + D / 2, refLng: B[1] + D + GAP, proj: 'mercatorLocal' }, source: 'map', crs: 'GCJ-02', poly: [] },
  { id: 'big1', name: '两块成组', mu: 5.6, sqm: 3764, crop: '七彩花生', merged: true, grouped: true,
    polyLatLng: HULL, hullLatLng: HULL,
    polyLatLngSet: [R1, R2],
    /* ★ 子地块故意**不带 sqm/mu**：逼页面走「按环实测」而不是采信传进来的值
       （老记录里的 sqm 可能是凸包口径；带上 sqm 的话断言会退化成「把我给的数抄回来」）。 */
    subPlots: [
      { id: 's1', name: '子块A', crop: '七彩花生', polyLatLng: R1 },
      { id: 's2', name: '子块B', crop: '水稻', polyLatLng: R2 }
    ],
    center: { lat: B[0] + D / 2, lng: B[1] + (2 * D + GAP) / 2 },
    geo: { refLat: B[0] + D / 2, refLng: B[1], proj: 'mercatorLocal' }, source: 'group', crs: 'GCJ-02', poly: [] }
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const target = INJ ? makeInjectedCopy() : SRC_PAGE;

  const proc = spawn(EDGE, [
    '--headless=new', '--allow-file-access-from-files',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(OUT, 'profile_groupsend'),
    '--no-first-run', '--no-default-browser-check',
    '--window-size=1400,900', 'about:blank',
  ], { stdio: 'ignore' });

  let browser = null;
  for (let i = 0; i < 50; i++) {
    try { browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:' + PORT, defaultViewport: null }); break; }
    catch (e) { await sleep(400); }
  }
  if (!browser) { console.error('Edge connect failed'); proc.kill(); process.exit(1); }

  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.setViewport({ width: 1400, height: 900 });
  await page.goto(fileUrl(target), { waitUntil: 'load', timeout: 90000 });
  await sleep(1200);
  await page.evaluate((lib) => {
    try { localStorage.clear(); } catch (e) {}
    localStorage.setItem('runye_plot_library', JSON.stringify(lib));
  }, LIB);
  await page.reload({ waitUntil: 'load' });
  await sleep(2500);

  /* ---- R1：列表里成组地块那一行必须有「→ 回传」按钮 ---- */
  const listInfo = await page.evaluate(() => {
    const rows = [].slice.call(document.querySelectorAll('#myPlotList .place-item'));
    return rows.map(function (r) {
      const go = r.querySelector('.place-go');
      return {
        text: go ? (go.textContent || '').trim() : '',
        hasSend: !!r.querySelector('.place-send'),
        sendTitle: r.querySelector('.place-send') ? r.querySelector('.place-send').getAttribute('title') : null
      };
    });
  });
  console.log('\n— R1 我的地块列表 —');
  listInfo.forEach((r) => console.log('        ' + (r.hasSend ? '[→] ' : '[ ] ') + r.text));
  const grpRow = listInfo.filter((r) => r.text.indexOf('🔗') >= 0)[0];
  check('R1a 列表里存在成组地块那一行', !!grpRow, JSON.stringify(listInfo.map((r) => r.text)));
  check('R1b 成组地块那行有「→ 回传」按钮', !!(grpRow && grpRow.hasSend),
    grpRow ? ('title=' + grpRow.sendTitle) : 'no row');
  check('R1c 每一行（含普通地块）都有「→ 回传」', listInfo.length > 0 && listInfo.every((r) => r.hasSend),
    listInfo.filter((r) => !r.hasSend).map((r) => r.text).join(' | '));

  /* ---- R2~R5：点成组地块的「→ 回传」，读回传产物 ---- */
  console.log('\n— R2 点「→ 回传」后的 payload —');
  const res = await page.evaluate(() => {
    const rows = [].slice.call(document.querySelectorAll('#myPlotList .place-item'));
    let hit = null;
    rows.forEach(function (r) {
      const go = r.querySelector('.place-go');
      if (go && (go.textContent || '').indexOf('🔗') >= 0) hit = r;
    });
    if (!hit) return { err: 'no group row' };
    const btn = hit.querySelector('.place-send');
    if (!btn) return { err: 'no send button' };
    /* 期望面积：用页面自己的 geodesicArea 算，避免我这边硬编码 */
    const g = (typeof geodesicArea === 'function') ? geodesicArea : null;
    btn.click();                                    // 同步触发；350ms 后才跳转，来得及读
    let payload = null;
    try { payload = JSON.parse(localStorage.getItem('runyeMeasuredArea') || 'null'); } catch (e) {}
    if (!payload) return { err: 'payload not written' };
    return {
      payload: payload,
      merged: !!payload.merged,
      grouped: !!payload.grouped,
      subCount: (payload.subPlots || []).length,
      subRingLens: (payload.subPlots || []).map(function (s) { return (s.polyLatLng || []).length; }),
      subRings: (payload.subPlots || []).map(function (s) { return s.polyLatLng || []; }),
      sqm: payload.sqm,
      mu: payload.mu,
      polyLen: (payload.poly || []).length,
      polyRing: payload.poly || []
    };
  });

  if (res.err) {
    check('R2 回传产物写入成功', false, res.err);
  } else {
    /* 期望值由探针自己算（R1/R2 的环 + 外框），不依赖页面 */
    const expSum = Math.round(res.subRings.reduce((a, r) => a + geoArea(r), 0));
    const hullArea = Math.round(geoArea(res.polyRing));
    console.log('        merged=' + res.merged + ' grouped=' + res.grouped +
      ' subPlots=' + res.subCount + ' 环长=' + JSON.stringify(res.subRingLens));
    console.log('        sqm=' + res.sqm + '（Σ成员环应为 ' + expSum + ' / 外框 ' + hullArea + '） polyLen=' + res.polyLen);
    check('R2 merged 标记为 true', res.merged === true, String(res.merged));
    check('R3a 带上了 2 个子地块', res.subCount === 2, '实际 ' + res.subCount);
    check('R3b 每个子地块都有完整的环（≥3 点）',
      res.subRingLens.length === 2 && res.subRingLens.every((n) => n >= 3), JSON.stringify(res.subRingLens));
    /* ★ 核心：面积必须是成员之和，不能是外框（外框会把那条约 30m 的缝算进去） */
    check('R4 面积 = Σ 成员环实测（' + expSum + ' ㎡，±2%）',
      Math.abs(res.sqm - expSum) <= expSum * 0.02, '实测 ' + res.sqm);
    check('R5 面积 ≠ 外框（' + hullArea + ' ㎡）⇒ 块间空隙没被并进面积',
      Math.abs(res.sqm - hullArea) > expSum * 0.15,
      '实测 ' + res.sqm + ' vs 外框 ' + hullArea + '（差 ' + Math.abs(res.sqm - hullArea) + '）');
    check('R6 poly 是外框（4 点，仅作定位/缩放参考）', res.polyLen === 4, '实际 ' + res.polyLen + ' 点');
  }

  /* ---- R7 反向对照：走旧的「点 btnCopy」路径，确实拿不到 subPlots ----
   * 这条不是测新功能，是**证明上面那个 bug 真实存在过**：
   * currentMapPlotId 从不被成组地块赋值 ⇒ btnCopy 只能拿到当前画布草稿 ⇒ 无 subPlots。 */
  console.log('\n— R7 反向对照：旧路径（btnCopy）拿不到子地块 —');
  const old = await page.evaluate(() => {
    try { localStorage.removeItem('runyeMeasuredArea'); } catch (e) {}
    const btn = document.getElementById('btnCopy');
    if (!btn) return { err: 'no btnCopy' };
    let alerted = null;
    const origAlert = window.alert;
    window.alert = function (m) { alerted = m; };
    btn.click();
    window.alert = origAlert;
    let p = null;
    try { p = JSON.parse(localStorage.getItem('runyeMeasuredArea') || 'null'); } catch (e) {}
    return { alerted: alerted, hasSub: !!(p && p.subPlots && p.subPlots.length), payload: p };
  });
  if (old.err) {
    check('R7 旧路径仍可触发', false, old.err);
  } else {
    console.log('        旧路径 alert = ' + JSON.stringify(old.alerted) + ' / 带 subPlots = ' + old.hasSub);
    check('R7 旧路径（btnCopy）拿不到各子地块 —— 证明「成组地块选不中」这个 bug 真实存在',
      old.hasSub === false, '旧路径居然带上了 subPlots=' + old.hasSub);
  }

  if (errs.length) console.log('\n[pageerror] ' + errs.slice(0, 6).join('\n           '));

  console.log('\n==== ' + (INJ ? '注入 ' + (INJ === 99 ? 'all' : INJ) : '正常') + '：PASS ' + pass + ' / FAIL ' + fail + ' ====');
  try { await browser.disconnect(); } catch (e) {}
  try { proc.kill(); } catch (e) {}
  try { fs.unlinkSync(path.join(WS, '_inj_groupsend.html')); } catch (e) {}

  if (INJ) process.exit(fail > 0 ? 0 : 1);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('[FATAL] ' + (e && e.stack || e)); process.exit(1); });
