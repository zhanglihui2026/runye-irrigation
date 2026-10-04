/* _p1/_shot_v223_flowvalve.cjs · [v223] 轮灌演示：主管→支管段的水流必须经过该支管的阀门
 * 用户原话：「模拟联合灌溉区水流时，主管出来的水流进入支管那一段，
 *            要跟主管到支管的阀门对应。」
 *
 * 背景：图面上每根支管的阀是挂在主管上的红⊗（斜连接管连接），v218 的水流线
 *   从主管直接斜切进支管起点 ⇒ 水流与阀门位置对不上。v223 把路线改为
 *   「主管取水点（阀在主管上的垂足）→ 阀门中心 → 支管」，并把途经阀门并入开启集合
 *   （与分区矩形阀按 4px 去重，同一枚阀不画双环）。
 *
 * ★ 全程真实入口（与 _shot_v218_flow.cjs 同引导）；接 PA_PAGE/PA_PORT/PA_TAG。
 *
 * 断言：
 *   ① 演示组1：每条水流折线上存在一点距「该区支管阀中心」<3px（= 水流从阀里过）
 *   ② 每条水流的「阀后首点」必须落在支管起点 8px 内（过了阀就进支管，不再斜切）
 *   ③ 开启环无双环：[data-tlflow=valve] 圆心两两距离 ≥4px
 *   ④ 无 JS 报错
 * 注入体检（--inject，TAG=1 选条目）：
 *   I1「退回旧斜切」：取水点退回支管起点垂足、不经过阀 ⇒ ①② 必须变红
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

const INJ_SPEC = INJECT ? [
  /* I1「退回旧斜切」：整段退回 v218 行为 —— 取水点=支管起点在主管上的垂足、不经阀 */
  ["        var jt = tlFlowNear([vv.x, vv.y], mp);\n        out.push(jt.q);\n        out.push([vv.x, vv.y]);",
    "        out.push(tlFlowNear(bp[0], mp).q); /* INJ I1 退回旧斜切 */",
    '退回旧斜切、不经过阀门（期望：①水流过阀 ②阀后即支管 都红）']
] : [];

const PROBE = `(()=>{try{
  function dump(sel){
    var h=document.querySelector(sel); if(!h) return {missing:true};
    var svg=(h.tagName&&h.tagName.toLowerCase()==='svg')?h:h.querySelector('svg');
    if(!svg) return {missing:true};
    function ptsOf(d){var n=(d.match(/-?\\d+(?:\\.\\d+)?/g)||[]).map(Number);var p=[];for(var i=0;i+1<n.length;i+=2)p.push([n[i],n[i+1]]);return p;}
    var flows=[]; svg.querySelectorAll('path[data-tlflow="flow"]').forEach(function(p){flows.push(ptsOf(p.getAttribute('d')));});
    var rings=[]; svg.querySelectorAll('g[data-tlflow="valve"] circle').forEach(function(c){rings.push([+c.getAttribute('cx'),+c.getAttribute('cy')]);});
    /* 每个分区的支管：zi → 入水端（靠主管那端，按 v218 同款「近总管者」无法在探针里判，
       改用两端里离流线更近的一端 —— 由断言侧配对） */
    var branches=[]; svg.querySelectorAll('path[data-tlpipe^="branch-"]').forEach(function(p){
      var m=/branch-(\\d+)/.exec(p.getAttribute('data-tlpipe'));
      var q=ptsOf(p.getAttribute('d'));
      branches.push({zi:m?+m[1]:-1, p0:q[0], p1:q[q.length-1]});
    });
    var vAll=[]; svg.querySelectorAll('circle[fill="#ef4444"]').forEach(function(c){
      if(c.closest&&c.closest('[data-junction-valve]'))return;
      vAll.push([+c.getAttribute('cx'),+c.getAttribute('cy')]); });
    var rects=[]; svg.querySelectorAll('rect[data-zi]').forEach(function(r){
      rects.push({zi:+r.getAttribute('data-zi'), g:+r.getAttribute('data-g')}); });
    return {flows:flows, rings:rings, branches:branches, vAll:vAll, rects:rects,
      layerCount: svg.querySelectorAll('[data-tlflow]').length};
  }
  return JSON.stringify({diagram:dump('#tlDiagramContent'), ws:dump('#tlWsContent')});
}catch(e){return JSON.stringify({err:e.message});}})()`;

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  let pageFile = path.join(WS, PAGE);
  if (INJECT) {
    let src = fs.readFileSync(path.join(WS, 'index.html'), 'utf8');
    const EOL = src.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
    const idx = Math.max(0, parseInt(String(TAG).replace(/[^0-9]/g, ''), 10) - 1);
    const pair = INJ_SPEC[idx];
    if (!pair) { console.error('未找到注入 I' + (idx + 1)); process.exit(2); }
    const from = pair[0].replace(/\n/g, EOL), to = pair[1].replace(/\n/g, EOL);
    const n = src.split(from).length - 1;
    if (n !== 1) { console.error('注入 I1 锚点命中 ' + n + ' 处（要求恰好 1）'); process.exit(2); }
    src = src.replace(from, to);
    pageFile = path.join(WS, '_inj_v223_' + TAG + '.html');
    fs.writeFileSync(pageFile, src, 'utf8');
    console.log('== 注入模式 I1：' + pair[2]);
  }
  const proc = spawn(EDGE, ['--headless=new', '--allow-file-access-from-files',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(OUT, 'profile_v223' + TAG),
    '--no-first-run', '--no-default-browser-check', '--window-size=1500,950', 'about:blank'], { stdio: 'ignore' });
  let browser = null;
  for (let i = 0; i < 50; i++) {
    try { browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:' + PORT, defaultViewport: null }); break; }
    catch (e) { await sleep(400); }
  }
  if (!browser) { console.error('Edge connect failed'); killTree(proc.pid); process.exit(1); }
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.setViewport({ width: 1500, height: 950 });
  await page.goto(fileUrl(pageFile), { waitUntil: 'load', timeout: 120000 });
  await sleep(1500);
  await page.evaluate(() => { document.body.classList.add('ry-tool'); try { localStorage.clear(); } catch (e) { } });
  await page.evaluate(() => {
    window.measuredPolygon = [{ x: 0, y: 0 }, { x: 320, y: 0 }, { x: 320, y: 200 }, { x: 0, y: 200 }];
    window.measuredPolygonSource = 'verify';
    if (typeof window.ppLoadPolygon === 'function') window.ppLoadPolygon();
    if (typeof window.ryShowSection === 'function') window.ryShowSection(document.getElementById('pipePlanSection'), null);
  });
  await sleep(400);
  await page.evaluate(() => { const b = document.getElementById('ppGenerate'); if (b) b.click(); });
  await sleep(1500);
  await page.evaluate(() => { if (typeof window.ryShowSection === 'function') window.ryShowSection(document.getElementById('tlPipePlanSection'), null); });
  await sleep(400);
  await page.evaluate(() => { const b = document.getElementById('tlAutoPipe'); if (b) b.click(); });
  await sleep(2000);
  await page.evaluate(() => { if (typeof window.rySetTab === 'function') window.rySetTab('tlPipePlanSection', 'ws'); });
  await sleep(1400);
  await page.evaluate(() => { var b = document.querySelector('#tlDemoChips button[data-demo-g="1"]'); if (b) b.click(); });
  await sleep(700);

  const S = JSON.parse(await page.evaluate(PROBE));
  const hosts = ['diagram', 'ws'];
  const HNAME = { diagram: '三级简图', ws: '三级工作区' };

  hosts.forEach(function (h) {
    const D = S[h];
    if (D.missing || D.err) { check(HNAME[h] + ' 场景可采集', false, JSON.stringify(D).slice(0, 80)); return; }
    /* 流 fi ↔ 分区：g=1 的 rects DOM 顺序 = zis 顺序（与 tlDemoRenderFlow 一致）；
       支管起点 = branch-{zi} 两端里离该流线更近的一端；阀 = 距该起点 <60px 的红⊗ */
    const g1rects = D.rects.filter(r => r.g === 1);
    let passCnt = 0, worst = -1, worstIdx = -1;
    let nextOk = true, nextWorst = -1;
    D.flows.forEach(function (pts, fi) {
      const ziR = g1rects[fi];
      const br = ziR ? D.branches.find(b => b.zi === ziR.zi) : null;
      if (!br) { worst = Infinity; worstIdx = fi; nextOk = false; return; }
      /* 阀 = 距 branch 任一端 <60px 的红⊗（阀挂在支管入水端）；入水端 = 离阀更近的端 */
      let best = null;
      D.vAll.forEach(function (v) {
        const d = Math.min(dist(v, br.p0), dist(v, br.p1));
        if (d < 60 && (!best || d < best.d)) best = { v: v, d: d };
      });
      if (!best) { worst = Infinity; worstIdx = fi; nextOk = false; return; }
      const bStart = (dist(best.v, br.p0) <= dist(best.v, br.p1)) ? br.p0 : br.p1;
      let bd = Infinity;
      pts.forEach(function (p) { bd = Math.min(bd, dist(p, best.v)); });
      if (bd < 3) passCnt++; else if (bd > worst) { worst = bd; worstIdx = fi; }
      /* ② 过阀后下一贴点 = 支管起点 */
      let vi = -1, dmin = Infinity;
      pts.forEach(function (p, i) { const d = dist(p, best.v); if (d < dmin) { dmin = d; vi = i; } });
      if (vi < 0 || vi === pts.length - 1) { nextOk = false; return; }
      const nx = dist(pts[vi + 1], bStart);
      nextWorst = Math.max(nextWorst, nx);
      if (nx > 8) nextOk = false;
    });

    check('① ' + HNAME[h] + ' 每条水流都经过该区支管阀（<3px）',
      passCnt === D.flows.length && D.flows.length > 0,
      '经过=' + passCnt + '/' + D.flows.length + (worstIdx >= 0 ? ' 最差流#' + worstIdx + ' 偏离=' + (worst === Infinity ? '∞' : worst.toFixed(2)) + 'px' : ''));
    check('② ' + HNAME[h] + ' 过阀后下一贴点即支管起点（<8px）', nextOk && D.flows.length > 0,
      '最大偏离=' + nextWorst.toFixed(2) + 'px');
    /* 无双环 */
    let doubleRing = 0;
    for (let i = 0; i < D.rings.length; i++)
      for (let j = i + 1; j < D.rings.length; j++)
        if (dist(D.rings[i], D.rings[j]) < 4) doubleRing++;
    check('③ ' + HNAME[h] + ' 开启环无双环（同位 ≤1 环）', doubleRing === 0, 'rings=' + D.rings.length + ' 重叠=' + doubleRing);
  });

  check('④ 无 JS 报错', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log('\n== 汇总 ==\n断言 ' + pass + '/' + (pass + fail) + ' PASS');
  const okAll = fail === 0 && errs.length === 0;
  try { await page.close(); } catch (e) { }
  try { await browser.disconnect(); } catch (e) { }
  killTree(proc.pid); await sleep(400);
  if (INJECT) {
    try { if (path.dirname(pageFile) === WS && path.basename(pageFile).indexOf('_inj_v223_') === 0) fs.unlinkSync(pageFile); } catch (e) { }
    /* 注入模式语义：应当红（fail>0）才算注入有效 */
    console.log(fail > 0 ? '== 注入命中（闸门有效）==' : '== 注入未命中（闸门被写哑！）==');
    process.exit(fail > 0 ? 0 : 1);
  }
  if (!okAll) process.exitCode = 1;
  process.exit(0);
})().catch(e => { console.error('FATAL', e && e.message); process.exit(2); });
