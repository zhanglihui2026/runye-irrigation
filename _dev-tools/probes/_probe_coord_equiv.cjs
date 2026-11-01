'use strict';
/* _probe_coord_equiv.cjs —— v836 切片的行为等价性证明（**A/B 对照**）
 *
 * 要回答的问题：
 *   「把 frame 换算搬进 core/coord-frame.js 之后，分区 / 管路 / 材料 / 存档 的输出
 *     有没有哪怕一位数字变了？」
 *
 * ★ 为什么不用「A 生成一次、B 生成一次，再比结果」这种朴素做法
 *   站点 `tlAutoGenerate` 尾部会走规范绘图模型提交（`ryCommitSingleLevel3CanonicalFromRuntime`），
 *   连续重生成/换角度重生成会被以「规范绘图模型拒绝三级生成结果」拒绝，**且与坐标换算无关**：
 *   把 HEAD 的旧实现注入回去照样红。实测序列 0°,30° 失败、0°,0°,30° 时好时坏 ⇒ 是既有竞态，
 *   不是本切片引入的。拿它当判据会得到一个随机红的探针。
 *
 * ★ 所以改成两条更硬、且完全确定性的判据：
 *   E1 同一页面内，把 `git show HEAD:mod/inline-09.js` 里那两个**旧实现原文**取出来，
 *      与 `core/coord-frame.js` 的现实现，在**管线真实产生的 frame 对象**上逐点对比。
 *      覆盖：真实 0° 帧、同帧改 30°、同帧改 12.5°+缩放 2、null 帧、带闭包回调的帧。
 *      —— 这直接证明"换实现不改变任何一位数字"，比比两次生成结果更强。
 *   E2 两个独立场景各做**一次**生成（0°），逐字段比对 tlDiagramData / ppGetState /
 *      材料表 / runyeSaveProject 快照。E1 保证数学一致，E2 保证整条管线在真实页面里一致。
 *   E3 旧实现被真正执行过（计数桩），否则 E1 是"拿自己比自己"。
 *
 * ★ 四跑结构（v836 定稿）：N1 N2 N3 = 现实现连跑三次，O1 = 旧实现接管。
 *   为什么不是 A/B 两跑：实测 `pp.zoom` 在**同一份实现**上就 6.2986 / 1 / 6.2986 交替跳，
 *   `optPrice*` 跟着一起跳（ppFitView 与材料价回填谁先跑完的竞态）。
 *   两跑比对会把这种抖动当成"切片引入的差异"。所以：
 *     E4 先用 N1/N2/N3 求出「同实现重跑也会抖的字段集」= 不稳定集（噪声底线）；
 *     E2 再要求 N2 vs O1 的差异**不超出**这个集合——超出才算切片真的改了行为。
 *   不是放宽判据：不稳定集是拿同实现实测出来的，且逐字段打印，读者可复核。
 *
 * 零依赖：本机 Edge + 原生 CDP（playwright 装不上，npm registry 502）。
 * 用法：node _probe_coord_equiv.cjs
 */

const { spawn, execFileSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const WS = globalThis.WebSocket;
const EDGE = [
  process.env.EDGE_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
].filter(Boolean).find(p => fs.existsSync(p));

const ROOT = process.cwd();
const APP = 'file:///' + path.join(ROOT, 'index.html').split(path.sep).join('/') + '?full=1&rymock=L2#pipePlanSection';
const SAVE_KEY = '__ry_equiv_snapshot';

const MLAT = 6378137 * Math.PI / 180;
const LAT0 = 18.25, LNG0 = 109.518;
const DLAT = 170 / MLAT;
const DLNG = 300 / (MLAT * Math.cos(LAT0 * Math.PI / 180));
const RING = [[LAT0, LNG0], [LAT0, LNG0 + DLNG], [LAT0 - DLAT, LNG0 + DLNG], [LAT0 - DLAT, LNG0]];
const SEED = [{
  id: 'eq1', name: 'EQ1', sqm: 51000, mu: 76.5, ts: 1780000000000,
  source: 'map', note: '', crs: 'GCJ-02', polyLatLng: RING,
  poly: RING.map(p => ({ x: (p[1] - LNG0) * MLAT * Math.cos(LAT0 * Math.PI / 180), y: (p[0] - LAT0) * MLAT })),
  geo: { refLat: LAT0, refLng: LNG0, proj: 'mercatorLocal', ts: 1780000000000 },
  center: { lat: LAT0 - DLAT / 2, lng: LNG0 + DLNG / 2 }
}];

/* ---------- 参照物：从 HEAD 的 inline-09 切出旧实现（不手打） ---------- */
function sliceFnFrom(src, name) {
  const lines = src.split('\n');
  const start = lines.findIndex(l => l.includes('function ' + name + '('));
  if (start < 0) throw new Error('HEAD 里找不到 ' + name);
  let depth = 0, end = -1;
  for (let i = start; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end >= 0) break;
  }
  return lines.slice(start, end + 1).join('\n');
}

let OLD_WORLD, OLD_GRID;
try {
  const headSrc = execFileSync('git', ['show', 'HEAD:mod/inline-09.js'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  OLD_WORLD = sliceFnFrom(headSrc, 'tlFrameToWorld');
  OLD_GRID = sliceFnFrom(headSrc, 'tlFrameToGrid');
  if (/RyCoordFrame/.test(OLD_WORLD)) {
    console.log('HEAD 里的 tlFrameToWorld 已是转发版 —— 参照物无效（本切片是否已提交？）');
    process.exit(1);
  }
} catch (e) {
  console.log('无法从 HEAD 取得旧实现：' + e.message);
  process.exit(1);
}

const results = [];
const rec = (label, ok, detail) => {
  results.push([label, ok, detail]);
  console.log((ok ? '  OK   ' : '  FAIL ') + label + (detail ? '  ' + detail : ''));
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

function httpGet(u) {
  return new Promise((res, rej) => {
    http.get(u, r => { let d = ''; r.on('data', c => { d += c; }); r.on('end', () => res(d)); }).on('error', rej);
  });
}

function cdpClient(url) {
  const pending = new Map(); const events = []; let id = 0;
  return new Promise((resolve, reject) => {
    const ws = new WS(url);
    ws.addEventListener('error', e => reject(e.error || new Error('ws error')));
    ws.addEventListener('message', m => {
      const msg = JSON.parse(m.data.toString());
      if (msg.id !== undefined && pending.has(msg.id)) {
        const p = pending.get(msg.id); pending.delete(msg.id);
        msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
      } else if (msg.method) events.push(msg);
    });
    ws.addEventListener('open', () => {
      const send = (method, params = {}) => {
        const myid = ++id;
        const pr = new Promise((res, rej) => pending.set(myid, { resolve: res, reject: rej }));
        ws.send(JSON.stringify({ id: myid, method, params }));
        return pr;
      };
      resolve({ ws, events, send, close: () => ws.close() });
    });
  });
}

async function evalIn(client, expression) {
  const r = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) {
    const d = r.exceptionDetails;
    throw new Error((d.exception && (d.exception.description || d.exception.value)) || d.text || 'eval failed');
  }
  return r.result.value;
}

/* ---------- 驱动与抓取 ---------- */
const DRIVE = `(function(){
  var mlat = 6378137 * Math.PI / 180;
  var ring = ${JSON.stringify(RING)};
  var lats = ring.map(function(p){return p[0];}), lngs = ring.map(function(p){return p[1];});
  var clat = lats.reduce(function(a,b){return a+b;},0)/lats.length;
  var cosLat = Math.cos(clat*Math.PI/180);
  var xs = ring.map(function(p){return (p[1]-lngs[0])*mlat*cosLat;});
  var ys = ring.map(function(p){return (p[0]-clat)*mlat;});
  window.measuredPolygon = xs.map(function(x,i){return {x:x,y:-ys[i]};});
  window.__runyeMapFramePoly = xs.map(function(x,i){return {x:x,y:ys[i]};});
  window.__runyeGeoBase = { refLat: clat, refLng: lngs[0] };
  window.measuredArea = 51000;
  window.measuredPolygonSource = 'map';
  window.currentPlotId = 'eq1';
  if (typeof window.ppLoadPolygon === 'function') window.ppLoadPolygon();
  if (typeof window.ppSetZoneAngleDeg === 'function') window.ppSetZoneAngleDeg(0);
  if (typeof window.tlAutoGenerate === 'function') window.tlAutoGenerate({ scroll: false });
  return true;
})()`;

const CAPTURE_STATE = `(function(){
  var out = {};
  out.diagram = window.tlDiagramData || null;
  out.pp = (typeof window.ppGetState === 'function') ? window.ppGetState() : null;
  var gt = document.querySelector('.materials-card .grand-total-val');
  out.matGrand = gt ? String(gt.textContent) : null;
  out.matRows = Array.prototype.map.call(
    document.querySelectorAll('.materials-card tbody tr'),
    function(tr){
      var pi = tr.querySelector('.price-input');
      return [tr.dataset.key || '', tr.dataset.qty || '', pi ? String(pi.value) : ''];
    }
  );
  try { out.matTbl = (typeof matTbl !== 'undefined') ? JSON.parse(JSON.stringify(matTbl)) : null; } catch(e){ out.matTbl = 'ERR:'+e.message; }
  return out;
})()`;

const CAPTURE_SAVE = `(function(){
  var out = {};
  try {
    out.saveOk = window.runyeSaveProject(true, ${JSON.stringify(SAVE_KEY)});
    var raw = localStorage.getItem(${JSON.stringify(SAVE_KEY)});
    out.saved = raw ? JSON.parse(raw) : null;
  } catch(e){ out.saveErr = e.message; }
  return out;
})()`;

/* E1：旧实现 vs 现实现，在真实点位与多种 frame 上逐点对比 */
const COMPARE_IMPL = `(function(){
  var CF = window.RyCoordFrame;
  var dd = window.tlDiagramData;
  if (!dd) return { err: 'no-diagram' };

  /* 点位：地块环 + 全部管线/阀门 + zones 网格交点 */
  var pts = [];
  (dd.poly || []).forEach(function(p){ pts.push({ x: +p.x, y: +p.y }); });
  (dd.mainPipes || []).forEach(function(l){ l.forEach(function(p){ pts.push({ x: +p.x, y: +p.y }); }); });
  (dd.branchPipes || []).forEach(function(l){ l.forEach(function(p){ pts.push({ x: +p.x, y: +p.y }); }); });
  (dd.valves || []).forEach(function(p){ pts.push({ x: +p.x, y: +p.y }); });
  var z = dd.zones || {};
  (z.xPos || []).forEach(function(x){ (z.yPos || []).forEach(function(y){ pts.push({ x: +x, y: +y }); }); });
  /* 再补一批合成点，覆盖负坐标与大数 */
  for (var i = 0; i < 60; i++) pts.push({ x: (i * 37) % 700 - 200 + i * 0.137, y: (i * 53) % 400 - 120 + i * 0.311 });

  var base = z.frame || null;
  var frames = [];
  frames.push({ name: 'null-frame', frame: null });
  if (base) {
    frames.push({ name: 'real-0deg', frame: base });
    frames.push({ name: 'real-30deg', frame: { angle: 30, center: base.center, origin: base.origin, scaleX: base.scaleX, scaleY: base.scaleY } });
    frames.push({ name: 'real-12.5deg-x2', frame: { angle: 12.5, center: base.center, origin: base.origin, scaleX: (base.scaleX || 1) * 2, scaleY: (base.scaleY || 1) * 2 } });
    frames.push({ name: 'real-neg-origin', frame: { angle: -47, center: base.center, origin: { x: -100, y: -50 }, scaleX: base.scaleX, scaleY: base.scaleY } });
  }
  /* 带闭包回调的帧：plot-editor 的 ppGridFrame() 就是这种 */
  frames.push({ name: 'closure-callbacks', frame: {
    angle: 0, center: { x: 0, y: 0 }, origin: { x: 0, y: 0 },
    toWorld: function(p){ return { x: p.x * 3 + 1, y: p.y * 3 - 1 }; },
    toGrid: function(p){ return { x: p.x / 3 - 1, y: p.y / 3 + 1 }; }
  } });

  var out = { nPts: pts.length, frames: [], maxDiffWorld: 0, maxDiffGrid: 0, worst: null };
  frames.forEach(function(f){
    var worstW = 0, worstG = 0;
    pts.forEach(function(p){
      var wNew = CF.frameToWorld(f.frame, p), wOld = window.__oldW(f.frame, p);
      var gNew = CF.frameToGrid(f.frame, p),  gOld = window.__oldG(f.frame, p);
      var dw = Math.max(Math.abs(wNew.x - wOld.x), Math.abs(wNew.y - wOld.y));
      var dg = Math.max(Math.abs(gNew.x - gOld.x), Math.abs(gNew.y - gOld.y));
      if (!isFinite(dw)) dw = Infinity;
      if (!isFinite(dg)) dg = Infinity;
      if (dw > worstW) worstW = dw;
      if (dg > worstG) worstG = dg;
      if ((dw > out.maxDiffWorld || dg > out.maxDiffGrid) && out.worst === null) {
        out.worst = { frame: f.name, p: p, wNew: wNew, wOld: wOld, gNew: gNew, gOld: gOld };
      }
    });
    out.frames.push({ name: f.name, worstWorld: worstW, worstGrid: worstG });
    if (worstW > out.maxDiffWorld) out.maxDiffWorld = worstW;
    if (worstG > out.maxDiffGrid) out.maxDiffGrid = worstG;
  });
  return out;
})()`;

/* 严格比对（忽略时间戳） */
const VOLATILE = new Set(['generatedAt', 'savedAt']);
function diffPaths(a, b, prefix, out) {
  if (out.length >= 8) return;
  if (a === b) return;
  const ta = typeof a, tb = typeof b;
  if (ta !== tb || a === null || b === null || ta !== 'object') {
    out.push(prefix + ': ' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b));
    return;
  }
  if (Array.isArray(a) !== Array.isArray(b)) { out.push(prefix + ': 数组/对象类型不同'); return; }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (VOLATILE.has(k)) continue;
    diffPaths(a[k], b[k], prefix ? prefix + '.' + k : k, out);
    if (out.length >= 8) return;
  }
}

async function scenario(label, port, overrideRyCoordFrame) {
  console.log('\n=== ' + label + (overrideRyCoordFrame ? '（RyCoordFrame 已换成 HEAD 旧实现）' : '（当前工作区）') + ' ===');
  const ud = path.join(os.tmpdir(), 'cdp_eq_' + label + '_' + Date.now());
  const child = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
    '--allow-file-access-from-files', '--window-size=1600,1000',
    '--remote-debugging-port=' + port, '--user-data-dir=' + ud
  ], { stdio: 'ignore' });

  let client = null;
  try {
    for (let i = 0; i < 60; i++) {
      try { await httpGet('http://127.0.0.1:' + port + '/json/version'); break; } catch (e) { await sleep(200); }
    }
    const targets = JSON.parse(await httpGet('http://127.0.0.1:' + port + '/json'));
    const target = targets.find(t => t.type === 'page');
    client = await cdpClient(target.webSocketDebuggerUrl);
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    try { await client.send('Network.enable'); await client.send('Network.setBlockedURLs', { urls: ['http://*', 'https://*'] }); } catch (e) { }
    await client.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });

    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `try{
        localStorage.setItem('runye_plot_library', ${JSON.stringify(JSON.stringify(SEED))});
        localStorage.setItem('runyeLocalAdminSession','1');
        localStorage.removeItem(${JSON.stringify(SAVE_KEY)});
      }catch(e){}`
    });

    await client.send('Page.navigate', { url: APP });
    let landed = false;
    for (let attempt = 0; attempt < 4 && !landed; attempt++) {
      for (let i = 0; i < 25; i++) {
        let href = '';
        try { href = await evalIn(client, 'location.href'); } catch (e) { href = ''; }
        if (href.indexOf('/index.html') >= 0) { landed = true; break; }
        await sleep(200);
      }
      if (!landed) { try { await client.send('Page.stopLoading'); } catch (e) { } await client.send('Page.navigate', { url: APP }); }
    }
    if (!landed) throw new Error('导航没能落在 index.html（headless 默认视口会被判成手机页）');

    for (let i = 0; i < 80; i++) {
      let ready = false;
      try { ready = await evalIn(client, "!!(window.ppLoadPolygon && window.tlAutoGenerate && window.RyCoordFrame)"); } catch (e) { }
      if (ready) break;
      await sleep(300);
    }

    /* 旧实现始终注入为 __oldW / __oldG 当参照物；overrideRyCoordFrame 时才真正接管 */
    const inject =
      OLD_WORLD.replace('function tlFrameToWorld', 'function __oldW') + '\n' +
      OLD_GRID.replace('function tlFrameToGrid', 'function __oldG') + '\n' +
      'window.__oldCalls = 0;\n' +
      (overrideRyCoordFrame
        ? 'RyCoordFrame.frameToWorld = function(f,p){ window.__oldCalls++; return __oldW(f,p); };\n' +
          'RyCoordFrame.frameToGrid  = function(f,p){ window.__oldCalls++; return __oldG(f,p); };\n'
        : '') +
      'true;';
    if (await evalIn(client, inject) !== true) throw new Error('旧实现注入失败');

    /* 只生成一次 */
    await evalIn(client, DRIVE);
    let fresh = false;
    for (let i = 0; i < 30; i++) {
      const has = await evalIn(client, "!!(window.tlDiagramData && window.tlDiagramData.world==='meter')").catch(() => false);
      if (has) { fresh = true; break; }
      await sleep(200);
    }
    if (!fresh) throw new Error('生成后没有拿到 tlDiagramData（world!=meter）');
    await evalIn(client, 'new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(r);});})');
    await sleep(400);

    const state = await evalIn(client, CAPTURE_STATE);
    const save = await evalIn(client, CAPTURE_SAVE);
    const cmp = await evalIn(client, COMPARE_IMPL);
    const oldCalls = await evalIn(client, 'window.__oldCalls || 0');
    return { state, save, cmp, oldCalls };
  } finally {
    try { client && client.close(); } catch (e) { }
    try { child.kill('SIGKILL'); } catch (e) { }
    await sleep(300);
    try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) { }
  }
}

/* 逐字段比对工具 */
const cmpState = (x, y) => ({
  diag: (() => { const o = []; diffPaths(x.diagram, y.diagram, 'diagram', o); return o; })(),
  pp: (() => { const o = []; diffPaths(x.pp, y.pp, 'pp', o); return o; })(),
  mat: x.matGrand === y.matGrand
    && JSON.stringify(x.matRows) === JSON.stringify(y.matRows)
    && JSON.stringify(x.matTbl) === JSON.stringify(y.matTbl),
  matDetail: '总价 ' + x.matGrand + ' / 行数 ' + (x.matRows || []).length +
    (x.matGrand === y.matGrand ? '' : ' ≠ ' + y.matGrand + ' / ' + (y.matRows || []).length)
});

/* 字段名（去掉 ": 值 ≠ 值" 尾巴），用来求不稳定集 */
const fieldOf = s => String(s).split(':')[0];
const fieldSet = arr => new Set(arr.map(fieldOf));

(async () => {
  if (!EDGE) { console.log('找不到 Microsoft Edge'); process.exitCode = 1; return; }
  const watchdog = setTimeout(() => { console.log('\n看门狗超时（420s）'); process.exit(2); }, 420000);

  try {
    /* 四跑：现实现 ×3（求噪声底线）+ 旧实现 ×1（作为被检对象） */
    const N1 = await scenario('N1', 9336, false);
    const N2 = await scenario('N2', 9337, false);
    const N3 = await scenario('N3', 9338, false);
    const O1 = await scenario('O1', 9339, true);

    /* 把每个 run 的关键易抖值直接打出来，"交替跳"这件事一眼可见 */
    const zoomOf = r => (r.state.pp && r.state.pp.zoom !== undefined) ? r.state.pp.zoom : 'n/a';
    const pxOf = r => {
      const row = (r.state.matRows || []).find(x => x[0] === 'pipe' || /pipe/.test(x[0]));
      return row ? row[2] : 'n/a';
    };
    console.log('\n--- 易抖字段实测（同一实现也会变，见下） ---');
    console.log('  pp.zoom      N1=' + zoomOf(N1) + '  N2=' + zoomOf(N2) + '  N3=' + zoomOf(N3) + '  O1=' + zoomOf(O1));
    console.log('  材料价输入   N1=' + pxOf(N1) + '  N2=' + pxOf(N2) + '  N3=' + pxOf(N3) + '  O1=' + pxOf(O1));

    /* E1：旧 vs 新，逐点（用首个场景即可，两边都注入了 __oldW 当参照物） */
    const cmp = N1.cmp;
    if (cmp && cmp.err) {
      rec('E1 新旧实现逐点对比', false, cmp.err);
    } else {
      const per = (cmp.frames || []).map(f => f.name + ' w=' + f.worstWorld.toExponential(1) + ' g=' + f.worstGrid.toExponential(1));
      const ok = cmp.maxDiffWorld === 0 && cmp.maxDiffGrid === 0;
      rec('E1 新旧实现逐点一致（' + cmp.nPts + ' 点 × ' + cmp.frames.length + ' 种 frame）', ok,
        ok ? '最大差 0（逐位相同）' : 'world ' + cmp.maxDiffWorld + ' / grid ' + cmp.maxDiffGrid + ' | ' + per.join(' ; '));
    }

    /* E3：旧实现真的被跑过 */
    rec('E3 旧实现确实被执行（否则 E1 是拿自己比自己）', O1.oldCalls > 0,
      'N1=' + N1.oldCalls + ' / N2=' + N2.oldCalls + ' / N3=' + N3.oldCalls + ' / O1=' + O1.oldCalls);

    /* E4：不稳定集 = N1/N2/N3 之间出现过的全部差异字段（噪声底线） */
    const nPair = [cmpState(N1.state, N2.state), cmpState(N2.state, N3.state), cmpState(N1.state, N3.state)];
    const nSave = [];
    [[N1, N2], [N2, N3], [N1, N3]].forEach(([a, b]) => {
      const o = []; diffPaths(a.save.saved, b.save.saved, 'saved', o); nSave.push(...o);
    });
    const unstablePp = fieldSet(nPair.flatMap(p => p.pp));
    const unstableSaved = fieldSet(nSave);
    const nDiag = nPair.flatMap(p => p.diag);
    const nMatOk = nPair.every(p => p.mat);
    rec('E4 噪声底线（同实现 N1/N2/N3 三跑互相比对）', nDiag.length === 0 && nMatOk,
      'diagram ' + nDiag.length + ' 处 / 材料' + (nMatOk ? '一致' : '不一致') +
      ' ⇒ 不稳定集 pp{' + [...unstablePp].join(',') + '} saved{' + [...unstableSaved].join(',') + '}');

    /* E2：条件对齐的正式比对 N2(现实现) vs O1(旧实现接管) */
    const d = cmpState(N2.state, O1.state);
    const dSave = []; diffPaths(N2.save.saved, O1.save.saved, 'saved', dSave);

    rec('E2a tlDiagramData 逐字段一致（现实现 vs 旧实现接管）', d.diag.length === 0,
      d.diag.length ? d.diag.slice(0, 4).join(' | ') : '无差异（' + (d.diag.length) + ' 处）');

    /* pp：差异必须全部落在不稳定集里 */
    const ppOut = d.pp.filter(s => !unstablePp.has(fieldOf(s)));
    rec('E2b 分区状态 ppGetState 一致（不稳定字段除外）', ppOut.length === 0,
      d.pp.length === 0 ? '无差异'
        : '抖动域内 ' + d.pp.length + ' 处 ' + d.pp.slice(0, 3).join('; ') +
          (ppOut.length ? ' | ✗ 域外 ' + ppOut.slice(0, 3).join('; ') : ' | 域外 0 处'));

    rec('E2c 材料表一致', d.mat, d.matDetail);

    const saveOut = dSave.filter(s => !unstableSaved.has(fieldOf(s)));
    rec('E2d runyeSaveProject 快照一致（不稳定字段除外）', N2.save.saveOk === O1.save.saveOk && saveOut.length === 0,
      'saveOk N2=' + N2.save.saveOk + ' O1=' + O1.save.saveOk +
      (dSave.length === 0 ? ' | 无差异'
        : ' | 抖动域内 ' + dSave.length + ' 处' + (saveOut.length ? ' | ✗ 域外 ' + saveOut.slice(0, 3).join('; ') : ' | 域外 0 处')));
  } catch (e) {
    rec('探针执行', false, e && e.message);
  } finally {
    clearTimeout(watchdog);
  }

  const fail = results.filter(r => !r[1]).length;
  console.log('\n== 结论：' + (fail ? 'FAIL ' + fail + ' / ' + results.length + ' 项' : 'PASS ' + results.length + ' 项') + ' ==');
  process.exitCode = fail ? 1 : 0;
})();
