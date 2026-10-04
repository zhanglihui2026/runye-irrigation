/* _p1/_shot_v219_libmirror.cjs · [v219] 地块库「设为当前」自动垂直镜像 验证
 * 用户原话：「存入地块库的地块 点击设为当前之后，地块也要自动垂直镜像。」
 *
 * ★ 走真实入口：往 localStorage 落三个不同口径的地块 → reload → 点每个地块的「设为当前」
 *   → 读 window.measuredPolygon。不手工调内部函数（合成调用验不出「按钮没接上」）。
 * ★ 接 PA_PAGE/PA_PORT/PA_TAG（v214 教训）。
 *
 * 用例（四个覆盖三种真实数据形态）：
 *   A 旧库存（v217 前落库）：poly = 「地图口径」未镜像 ⇒ 设为当前后必须翻一次
 *   B A 之后**再点一次**设为当前 ⇒ 幂等：必须保持已镜像，不得翻回去（★ 本轮最大的坑）
 *   C 新库存（v217 后本页落库）：poly 已是镜像口径 ⇒ 原样不动
 *   D 手画地块（无 geo / 无 polyLatLng）⇒ 绝不翻（REF 退化 == poly，翻了就是误伤）
 *
 * 注入体检（--inject + PA_TAG=J1/J2）：
 *   J1「无脑每次都翻」⇒ 期望用例 B 变红
 *   J2「干脆不翻」    ⇒ 期望用例 A 变红
 */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const puppeteer = require('./_pptr.cjs');
const killTree = require('./_edge_kill.cjs');

const WS = 'C:\\Users\\AHS\\runye-irrigation';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = path.join(WS, '_verify_out');
const PORT = parseInt(process.env.PA_PORT || '9590', 10);
const PAGE = process.env.PA_PAGE || 'index.html';
const TAG = process.env.PA_TAG || '';
const INJECT = process.argv.indexOf('--inject') >= 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileUrl = (p) => 'file:///' + encodeURI(p.replace(/\\/g, '/'));

let pass = 0, fail = 0;
const check = (n, ok, extra) => { console.log((ok ? '  [PASS] ' : '  [FAIL] ') + n + (extra ? ' :: ' + extra : '')); ok ? pass++ : fail++; };
const info = (s) => console.log('  [INFO] ' + s);

const INJ_SPEC = [
  /* J1 无脑翻转（典型「每次都翻」写法）。
     ⚠ 别写成「只删掉第一条 return」——那样已镜像的样本会落到 dSame>tol 分支也返回 NO，
        B 用例照样绿 ⇒ 注入被自己写哑了（闸门三要素：存在 + 判定 + 判据松紧，缺一不可）。
        正确做法是把整个三路判定换成无条件翻转。 */
  ['      if (dFlip <= tol && dFlip < dSame) return NO;                                   /* 已是图面口径 */\n      if (dSame <= tol) return { pts: poly.map(function (q) { return { x: +q.x, y: -(+q.y) }; }), flipped: true };\n      return NO;',
    '      return { pts: poly.map(function (q) { return { x: +q.x, y: -(+q.y) }; }), flipped: true };'],
  /* J2 干脆不翻：把定向逻辑整段摘掉（退化回 v217 之前的行为） */
  ['        var _o = ryOrientPlotPoly(window.measuredPolygon, window.__runyeMapFramePoly);',
    '        var _o = { pts: window.measuredPolygon, flipped: false };']
];

/* 测试数据：一块「南宽北窄」的梯形 —— 矩形旋转 180° 看不出来，梯形才分得出上下颠倒 */
const R = 6378137, mlat = R * Math.PI / 180, COS = Math.cos(18.25 * Math.PI / 180);
const REF = [[0, 0], [200, 0], [140, 120], [40, 120]];        // 「地图口径」(x东, y北)
const METER = REF.map(([x, y]) => ({ x: x, y: y }));           // 未镜像
const MIRR = REF.map(([x, y]) => ({ x: x, y: -y }));           // 已镜像（图面口径）
function toLL(pts) {   // 米 → 经纬度（地图口径，与 applyMapMeasuredArea 同式）
  return pts.map(p => [+(18.25 + p.y / mlat).toFixed(7), +(109.51 + p.x / (mlat * COS)).toFixed(7)]);
}
const GEO = { refLat: 18.25, refLng: 109.51 };

const PLOTS = [
  { id: 'v219a', name: 'A旧库存未镜像', sqm: 20000, mu: 30, poly: METER, mapFramePoly: METER, polyLatLng: toLL(METER), geo: GEO, source: 'map', ts: Date.now(), crop: '测试' },
  { id: 'v219c', name: 'C新库存已镜像', sqm: 20000, mu: 30, poly: MIRR, mapFramePoly: METER, polyLatLng: toLL(METER), geo: GEO, source: 'map', ts: Date.now(), crop: '测试' },
  { id: 'v219d', name: 'D手画无geo', sqm: 20000, mu: 30, poly: METER, ts: Date.now(), crop: '测试', source: 'area' }
];
const SEED = `(()=>{try{
  localStorage.setItem('runye_plot_library', JSON.stringify(${JSON.stringify(PLOTS)}));
  return 'ok';
}catch(e){return 'ERR:'+e.message;}})()`;
const READMP = `JSON.stringify({
  mp:(window.measuredPolygon||[]).map(function(p){return [Math.round(p.x*100)/100, Math.round(p.y*100)/100];}),
  mf:(window.__runyeMapFramePoly||[]).map(function(p){return [Math.round(p.x*100)/100, Math.round(p.y*100)/100];}),
  subs:(window.__runyeSubPlots||[]).map(function(s){return (s.poly||[]).map(function(p){return [p.x,p.y];});}),
  cur:window.currentPlotId||null
})`;
const CLICK_CURRENT = (id) => `(()=>{try{
  var rows=document.querySelectorAll('#plotLibList .pli-btn[data-act="current"]');
  var arr=JSON.parse(localStorage.getItem('runye_plot_library')||'[]');
  var idx=-1; for(var i=0;i<arr.length;i++) if(arr[i].id==='${id}') idx=i;
  if(idx<0||!rows[idx]) return 'NOBTN idx='+idx+' rows='+rows.length;
  rows[idx].click(); return 'ok';
}catch(e){return 'ERR:'+e.message;}})()`;

/*判定：mp 是否等于 mirror(ref)（允许 0.5 m 容差） */
function isMirrorOf(mp, ref) {
  if (!mp || !ref || mp.length !== ref.length) return false;
  return mp.every((p, i) => Math.abs(p[0] - ref[i][0]) <= 0.5 && Math.abs(p[1] + ref[i][1]) <= 0.5);
}
function isSameAs(mp, ref) {
  if (!mp || !ref || mp.length !== ref.length) return false;
  return mp.every((p, i) => Math.abs(p[0] - ref[i][0]) <= 0.5 && Math.abs(p[1] - ref[i][1]) <= 0.5);
}
const fmt = a => JSON.stringify(a);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  let pageFile = path.join(WS, PAGE);
  if (INJECT) {
    let src = fs.readFileSync(pageFile, 'utf8');
    const EOL = src.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
    const idx = Math.max(0, parseInt(String(TAG).replace(/[^0-9]/g, ''), 10) - 1);
    const pair = INJ_SPEC[idx];
    if (!pair) { console.error('未找到注入 J' + (idx + 1)); process.exit(2); }
    const from = pair[0].replace(/\n/g, EOL);
    const n = src.split(from).length - 1;
    if (n !== 1) { console.error('注入 J' + (idx + 1) + ' 锚点命中 ' + n + ' 处（要求恰好 1）'); process.exit(2); }
    src = src.replace(from, pair[1].replace(/\n/g, EOL));
    pageFile = path.join(WS, '_inj_v219_' + TAG + '.html');
    fs.writeFileSync(pageFile, src, 'utf8');
    console.log('== 注入模式 J' + (idx + 1));
  }
  const proc = spawn(EDGE, ['--headless=new', '--allow-file-access-from-files',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(OUT, 'profile_v219' + TAG),
    '--no-first-run', '--no-default-browser-check', '--window-size=1500,950', 'about:blank'], { stdio: 'ignore' });
  let browser = null;
  for (let i = 0; i < 50; i++) {
    try { browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:' + PORT, defaultViewport: null }); break; }
    catch (e) { await sleep(400); }
  }
  if (!browser) { console.error('Edge connect failed'); killTree(proc.pid); process.exit(1); }
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.setViewport({ width: 1500, height: 950 });
  await page.goto(fileUrl(pageFile), { waitUntil: 'load', timeout: 120000 });
  await sleep(1500);
  await page.evaluate(() => { document.body.classList.add('ry-tool'); try { localStorage.clear(); } catch (e) { } });
  await page.evaluate(SEED);
  await page.reload({ waitUntil: 'load' });
  await sleep(2200);

  const cnt = await page.evaluate(() => document.querySelectorAll('#plotLibList .pli-btn[data-act="current"]').length);
  check('⓪ 地块库渲染出 3 块测试地块', cnt === 3, '按钮数=' + cnt);

  async function clickAndRead(id) {
    const r = await page.evaluate(CLICK_CURRENT(id));
    await sleep(1100);
    const st = JSON.parse(await page.evaluate(READMP));
    return { clicked: r, ...st };
  }

  /* ---- A 旧库存（未镜像）⇒ 翻 ---- */
  const A1 = await clickAndRead('v219a');
  check('A 旧库存地块：设为当前后自动垂直镜像', isMirrorOf(A1.mp, METER.map(p => [p.x, p.y])),
    'click=' + A1.clicked + ' mp=' + fmt(A1.mp) + ' 期望=mirror(REF)');
  check('A 「地图口径」基准本身没被翻', isSameAs(A1.mf, METER.map(p => [p.x, p.y])), 'mf=' + fmt(A1.mf));

  /* ---- B 再点一次 ⇒ 幂等（不得翻回去）---- */
  const A2 = await clickAndRead('v219a');
  check('B 同一个地块再「设为当前」一次：保持镜像，不翻回去（★ double-flip 陷阱）',
    isMirrorOf(A2.mp, METER.map(p => [p.x, p.y])), 'mp=' + fmt(A2.mp));
  const A3 = await clickAndRead('v219a');
  check('B 第三次「设为当前」仍然稳定', isMirrorOf(A3.mp, METER.map(p => [p.x, p.y])), 'mp=' + fmt(A3.mp));

  /* ---- E 真·二次翻转风险：把「已定向好的 poly 存回地块库」后再设为当前 ----
     ★ B 那三条其实**拦不住**「无脑每次都翻」：本页 setCurrent 每次都从 loadLib() 重读，
       库存不动 ⇒ 无脑翻也只是「每次都从同一份原始数据翻一次」，结果照样稳定（绿得毫无信息量
       —— 第五种形态：样本退化）。真正会在现实里触发二次翻转的是「定向过的几何被写回库存」
       （用户改了面积/名字后再存一次、或地图页重存），所以这条才是判别依据：
       把 A 的 poly 改写成「已镜像」版本再设为当前 ⇒ 幂等实现必须纹丝不动。 */
  const before = JSON.parse(await page.evaluate(`(()=>{try{
    var arr=JSON.parse(localStorage.getItem('runye_plot_library')||'[]');
    for(var i=0;i<arr.length;i++) if(arr[i].id==='v219a') arr[i].poly=(window.measuredPolygon||[]).map(function(p){return {x:p.x,y:p.y};});
    localStorage.setItem('runye_plot_library', JSON.stringify(arr));
    return JSON.stringify(arr[0].poly);
  }catch(e){return 'ERR:'+e.message;}})()`));
  info('E 已把库存里 A 的 poly 改写为上次定向结果（模拟「存回去」）：' + before);
  const A4 = await clickAndRead('v219a');
  check('E 已定向却存回库的地块再设为当前：不得二次翻转（★ 幂等的真正判别点）',
    isMirrorOf(A4.mp, METER.map(p => [p.x, p.y])), 'mp=' + fmt(A4.mp) + ' 期望=mirror(REF)');

  /* ---- C 新库存（已镜像）⇒ 原样 ---- */
  const C1 = await clickAndRead('v219c');
  check('C 已是图面口径的新库存地块：原样不动（不二次镜像）',
    isMirrorOf(C1.mp, METER.map(p => [p.x, p.y])), 'mp=' + fmt(C1.mp) + ' 期望=mirror(REF)');
  check('C 基准仍为地图口径', isSameAs(C1.mf, METER.map(p => [p.x, p.y])), 'mf=' + fmt(C1.mf));

  /* ---- D 手画地块 ⇒ 绝不翻 ---- */
  const D1 = await clickAndRead('v219d');
  check('D 无 geo 的手画地块：一点都不翻（REF 退化必须保守）',
    isSameAs(D1.mp, METER.map(p => [p.x, p.y])), 'mp=' + fmt(D1.mp) + ' 期望=原样' + fmt(METER.map(p => [p.x, p.y])));

  check('⑦ 无 JS 未捕获异常', errs.length === 0, JSON.stringify(errs.slice(0, 3)));

  console.log('\n== 汇总 ==');
  console.log('断言 ' + pass + '/' + (pass + fail) + ' PASS' + (fail ? '  FAIL=' + fail : ''));
  try { await page.close(); } catch (e) { }
  try { await browser.disconnect(); } catch (e) { }
  killTree(proc.pid);
  await sleep(600);
  if (INJECT) { try { fs.unlinkSync(pageFile); } catch (e) { } }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e && e.message); process.exit(2); });
