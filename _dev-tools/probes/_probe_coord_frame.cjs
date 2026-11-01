'use strict';
/* _probe_coord_frame.cjs —— v836 切片回归：core/coord-frame.js 接入后主页面是否照旧
 *
 * 为什么需要浏览器层：单测证明的是「模块的数学与原实现逐值一致」，
 * 但模块有没有**真的被加载**、inline-09 的转发有没有**真的被调用**，只有真页面能回答。
 * 这条链路断了的表现是分区/管路整体错位，而 Node 单测全绿。
 *
 * 零依赖：playwright 装不上（npm registry 502），改用本机 Edge + 原生 CDP
 * （node 22 自带 WebSocket）。写法遵循 edge-cdp-verify 技能的最小骨架。
 *
 * 判据：
 *   C1 window.RyCoordFrame 在位，两个方法都是函数
 *   C2 加载与生成全过程无 Runtime.exceptionThrown
 *   C3 tlDiagramData 生成成功且 world==='meter'（0° 与 30° 各一次）
 *   C4 mainPipes / branchPipes / valves 全部落在地块包围盒内（≈ 换算把点放对了）
 *   C5 用图面**真实 frame**（tlDiagramData.zones.frame）做往返，误差 < 1e-6 m
 *   C6 分区角度 30° 的点集必须与 0° **不同**
 *      —— 给 C4 长牙：若 frame 换算退化成恒等，30° 的点会与 0° 一模一样，C6 立刻红
 *
 * 只读：不改站点行为、不写 repo；Edge profile 落在系统临时目录，结束即删。
 * 用法：node _probe_coord_frame.cjs
 */

const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const WS = globalThis.WebSocket;
const PORT = 9333;
const EDGE = [
  process.env.EDGE_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
].filter(Boolean).find(p => fs.existsSync(p));

const ROOT = process.cwd();
const APP = 'file:///' + path.join(ROOT, 'index.html').split(path.sep).join('/') + '?full=1&rymock=L2#pipePlanSection';

/* 300 m × 170 m 地块（与 v835 探针同尺寸，保证一定能生成管路） */
const MLAT = 6378137 * Math.PI / 180;
const LAT0 = 18.25, LNG0 = 109.518;
const DLAT = 170 / MLAT;
const DLNG = 300 / (MLAT * Math.cos(LAT0 * Math.PI / 180));
const RING = [[LAT0, LNG0], [LAT0, LNG0 + DLNG], [LAT0 - DLAT, LNG0 + DLNG], [LAT0 - DLAT, LNG0]];
const SEED = [{
  id: 'cf1', name: 'CF1', sqm: 51000, mu: 76.5, ts: 1780000000000,
  source: 'map', note: '', crs: 'GCJ-02', polyLatLng: RING,
  poly: RING.map(p => ({ x: (p[1] - LNG0) * MLAT * Math.cos(LAT0 * Math.PI / 180), y: (p[0] - LAT0) * MLAT })),
  geo: { refLat: LAT0, refLng: LNG0, proj: 'mercatorLocal', ts: 1780000000000 },
  center: { lat: LAT0 - DLAT / 2, lng: LNG0 + DLNG / 2 }
}];

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

/* 在页面里跑表达式，取回值（或捕获异常详情） */
async function evalIn(client, expression) {
  const r = await client.send('Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise: true, allowUnsafeEvalBlockedByCSP: true
  });
  if (r.exceptionDetails) {
    const d = r.exceptionDetails;
    throw new Error((d.exception && (d.exception.description || d.exception.value)) || d.text || 'eval failed');
  }
  return r.result.value;
}

/* 驱动一次：装地块 → 设分区角度 → 生成 → 取包围盒/往返/点集指纹 */
const DRIVE_SRC = (angle) => `(function(){
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
  window.currentPlotId = 'cf1';
  if (typeof window.ppLoadPolygon === 'function') window.ppLoadPolygon();
  if (typeof window.ppSetZoneAngleDeg === 'function') window.ppSetZoneAngleDeg(${angle});
  if (typeof window.tlAutoGenerate === 'function') window.tlAutoGenerate({ scroll: false });
  var dd = window.tlDiagramData || {};
  if (!dd || !Array.isArray(dd.poly) || dd.poly.length < 3) return { err: 'no-diagram' };
  var pxs = dd.poly.map(function(p){return +p.x;}), pys = dd.poly.map(function(p){return +p.y;});
  var bb = { x0: Math.min.apply(null,pxs), x1: Math.max.apply(null,pxs), y0: Math.min.apply(null,pys), y1: Math.max.apply(null,pys) };
  var pts = [];
  (dd.mainPipes||[]).forEach(function(l){ l.forEach(function(p){ pts.push(p); }); });
  (dd.branchPipes||[]).forEach(function(l){ l.forEach(function(p){ pts.push(p); }); });
  (dd.valves||[]).forEach(function(p){ pts.push(p); });
  var EPS = 1e-6, out = [];
  pts.forEach(function(p){
    if (!p || !isFinite(p.x) || !isFinite(p.y) || p.x < bb.x0-EPS || p.x > bb.x1+EPS || p.y < bb.y0-EPS || p.y > bb.y1+EPS) out.push(p);
  });
  var f = dd.zones && dd.zones.frame ? dd.zones.frame : null;
  var rtErr = 0, rtN = 0;
  if (f) {
    for (var i = 0; i < 40; i++) {
      var q = { x: bb.x0 + (bb.x1-bb.x0)*(i/39), y: bb.y0 + (bb.y1-bb.y0)*(((i*7)%40)/39) };
      var back = window.RyCoordFrame.frameToWorld(f, window.RyCoordFrame.frameToGrid(f, q));
      var e = Math.max(Math.abs(back.x-q.x), Math.abs(back.y-q.y));
      if (e > rtErr) rtErr = e;
      rtN++;
    }
  }
  return {
    hasDD: !!window.tlDiagramData, world: dd.world || null,
    nMain: (dd.mainPipes||[]).length, nBranch: (dd.branchPipes||[]).length, nValve: (dd.valves||[]).length,
    angle: f ? f.angle : null,
    nPts: pts.length, nOut: out.length, worst: out.slice(0,2),
    hasFrame: !!f, rtErr: rtErr, rtN: rtN,
    sig: pts.map(function(p){ return (+p.x).toFixed(4)+','+(+p.y).toFixed(4); }).join('|')
  };
})()`;

(async () => {
  if (!EDGE) { console.log('找不到 Microsoft Edge'); process.exitCode = 1; return; }

  const UD = path.join(os.tmpdir(), 'cdp_cf_' + Date.now());
  let child = null, client = null;
  const watchdog = setTimeout(() => { console.log('\n看门狗超时（90s）'); try { child && child.kill('SIGKILL'); } catch (e) { } process.exit(2); }, 90000);

  try {
    child = spawn(EDGE, [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
      '--allow-file-access-from-files', '--window-size=1600,1000',
      '--remote-debugging-port=' + PORT, '--user-data-dir=' + UD
    ], { stdio: 'ignore' });

    for (let i = 0; i < 60; i++) {
      try { await httpGet('http://127.0.0.1:' + PORT + '/json/version'); break; } catch (e) { await sleep(200); }
    }
    const targets = JSON.parse(await httpGet('http://127.0.0.1:' + PORT + '/json'));
    const target = targets.find(t => t.type === 'page');
    if (!target) throw new Error('没有可用的 page target');

    client = await cdpClient(target.webSocketDebuggerUrl);
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    try { await client.send('Network.enable'); await client.send('Network.setBlockedURLs', { urls: ['http://*', 'https://*'] }); } catch (e) { }

    /* 视口必须先设成桌面尺寸：headless 默认 800×600，站点会判定为手机并跳去
       runye-mobile-map-preview.html —— 那上面所有主程序全局都不存在（假红）。 */
    try {
      await client.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
    } catch (e) { }

    /* 页面脚本执行前植入地块库（等价 playwright 的 addInitScript） */
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `try{
        if(!localStorage.getItem('__cf_seed')){
          localStorage.setItem('runye_plot_library', ${JSON.stringify(JSON.stringify(SEED))});
          localStorage.setItem('runyeLocalAdminSession','1');
          localStorage.setItem('__cf_seed','1');
        }
      }catch(e){}`
    });

    await client.send('Page.navigate', { url: APP });

    /* 导航必须真的落在 index.html 上：本机 Edge 曾把 target 复用到别的会话页
       （实测拿到 runye-mobile-map-preview.html#second），不校验就往下跑会得到"全 undefined"的假红。 */
    let landed = false;
    for (let attempt = 0; attempt < 4 && !landed; attempt++) {
      for (let i = 0; i < 25; i++) {
        let href = '';
        try { href = await evalIn(client, 'location.href'); } catch (e) { href = ''; }
        if (href.indexOf('/index.html') >= 0) { landed = true; break; }
        await sleep(200);
      }
      if (!landed) {
        try { await client.send('Page.stopLoading'); } catch (e) { }
        await client.send('Page.navigate', { url: APP });
      }
    }
    if (!landed) throw new Error('导航没能落在 index.html（target 被复用或文件被拦截）');

    /* 轮询就绪（不用固定睡眠） */
    let ready = false;
    for (let i = 0; i < 80; i++) {
      try {
        ready = await evalIn(client, "!!(window.ppLoadPolygon && window.tlAutoGenerate && window.RyPlotLibraryStore && window.RyCoordFrame)");
      } catch (e) { ready = false; }
      if (ready) break;
      await sleep(300);
    }

    /* C1 模块在位 */
    const mod = await evalIn(client, `({
      has:!!window.RyCoordFrame,
      w: typeof (window.RyCoordFrame&&window.RyCoordFrame.frameToWorld),
      g: typeof (window.RyCoordFrame&&window.RyCoordFrame.frameToGrid),
      /* 诊断：同批加载的兄弟模块在不在、script 标签在不在 */
      zoneGeom: typeof window.RyZoneGeometry,
      trunkSchema: typeof window.RyTrunkSchema,
      storageGuard: typeof window.RyStorageGuard,
      tagCount: document.querySelectorAll('script[src*="coord-frame"]').length,
      ppLoad: typeof window.ppLoadPolygon,
      tlAuto: typeof window.tlAutoGenerate,
      plotLib: typeof window.RyPlotLibraryStore,
      readyState: document.readyState,
      href: location.href, title: document.title,
      htmlLen: (document.documentElement && document.documentElement.innerHTML || '').length,
      nScripts: document.scripts.length
    })`);
    rec('C1 RyCoordFrame 在位且两个方法可调用', !!(mod && mod.has && mod.w === 'function' && mod.g === 'function'), JSON.stringify(mod));
    if (!ready) throw new Error('页面未就绪（缺少 ppLoadPolygon / tlAutoGenerate / RyCoordFrame）');

    /* 0° */
    console.log('\n=== 0° ===');
    const a0 = await evalIn(client, DRIVE_SRC(0));
    await sleep(600);
    const b0 = await evalIn(client, DRIVE_SRC(0));   // 生成有异步渲染，再取一次稳定结果
    rec('C3(0°) tlDiagramData 生成且 world=meter', !!(b0 && b0.hasDD && b0.world === 'meter'),
      b0 ? `主干 ${b0.nMain} 组 / 支管 ${b0.nBranch} 组 / 阀门 ${b0.nValve} 个` : String(a0));
    rec('C4(0°) 管线/阀门点全在 poly 包围盒内', b0.nOut === 0, `${b0.nPts} 点，越界 ${b0.nOut}` + (b0.nOut ? ' 例:' + JSON.stringify(b0.worst) : ''));
    rec('C5(0°) 真实 frame 往返 < 1e-6 m', b0.hasFrame ? b0.rtErr < 1e-6 : false,
      b0.hasFrame ? `${b0.rtN} 点，最大 ${b0.rtErr.toExponential(2)}` : '图面无 frame');

    /* 30° */
    console.log('\n=== 30° ===');
    await evalIn(client, DRIVE_SRC(30));
    await sleep(600);
    const b30 = await evalIn(client, DRIVE_SRC(30));
    rec('C3(30°) tlDiagramData 生成且 world=meter', !!(b30 && b30.hasDD && b30.world === 'meter'),
      b30 ? `主干 ${b30.nMain} 组 / 支管 ${b30.nBranch} 组 / 阀门 ${b30.nValve} 个，图面 angle=${b30.angle}` : '');
    rec('C4(30°) 管线/阀门点全在 poly 包围盒内', b30.nOut === 0, `${b30.nPts} 点，越界 ${b30.nOut}` + (b30.nOut ? ' 例:' + JSON.stringify(b30.worst) : ''));
    rec('C5(30°) 真实 frame 往返 < 1e-6 m', b30.hasFrame ? b30.rtErr < 1e-6 : false,
      b30.hasFrame ? `${b30.rtN} 点，最大 ${b30.rtErr.toExponential(2)}` : '图面无 frame');

    /* C6：30° 必须真的改变世界坐标 */
    const same = b0.sig && b30.sig && b0.sig === b30.sig;
    rec('C6 30° 点集与 0° 不同（frame 换算确实生效）', !same,
      same ? '两角度点集完全一致 ⇒ 旋转没传到世界坐标' : `0° ${b0.nPts} 点 / 30° ${b30.nPts} 点`);

    /* C2：异常 */
    const errs = client.events
      .filter(e => e.method === 'Runtime.exceptionThrown')
      .map(e => {
        const d = e.params.exceptionDetails;
        return (d.exception && (d.exception.description || d.exception.value)) || d.text || 'unknown';
      })
      /* 断网导致的 CDN 失败不算本切片的问题，但如果是 ReferenceError 必须红 */
      .filter(t => !/Failed to fetch|net::ERR|ERR_BLOCKED|beacon/i.test(t));
    rec('C2 加载与生成无脚本异常', errs.length === 0, errs.slice(0, 3).join(' / ') || '0 条');
  } catch (e) {
    rec('探针执行', false, e && e.message);
  } finally {
    clearTimeout(watchdog);
    try { client && client.close(); } catch (e) { }
    try { child && child.kill('SIGKILL'); } catch (e) { }
    await sleep(300);
    try { fs.rmSync(UD, { recursive: true, force: true }); } catch (e) { /* profile 目录留不下就算了 */ }
  }

  const fail = results.filter(r => !r[1]).length;
  console.log('\n== 结论：' + (fail ? 'FAIL ' + fail + ' / ' + results.length + ' 项' : 'PASS ' + results.length + ' 项') + ' ==');
  process.exitCode = fail ? 1 : 0;
})();
