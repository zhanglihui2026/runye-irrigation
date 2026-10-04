/* _p1/_probe_v218_geom.cjs · [v218] 轮灌演示 · 水流动画可行性取证
 * 目的：**先量再改** —— 在改任何代码之前，把两个画布（三级简图 / 三级工作区）里
 *   ① 管道路径元素（data-tlpipe）  ② 分区 rect（data-zi/data-g）
 *   ③ 阀门（红⊗圆 + 交接三通方块） ④ 水源点
 * 的真实 DOM 结构与坐标口径 dump 出来。严禁凭肉眼估。
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
const PORT = parseInt(process.env.PA_PORT || '9560', 10);
const PAGE = process.env.PA_PAGE || 'index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileUrl = (p) => 'file:///' + encodeURI(p.replace(/\\/g, '/'));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const proc = spawn(EDGE, ['--headless=new', '--allow-file-access-from-files',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(OUT, 'profile_v218'),
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
  await page.goto(fileUrl(path.join(WS, PAGE)), { waitUntil: 'load', timeout: 120000 });
  await sleep(1500);
  await page.evaluate(() => { document.body.classList.add('ry-tool'); try { localStorage.clear(); } catch (e) { } });

  /* 真实入口引导（照搬 _shot_v215_tldemo.cjs） */
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
  await sleep(1500);

  const dump = await page.evaluate(() => {
    function attrOf(el) { return el.getAttribute('d') ? el.getAttribute('d').slice(0, 90) : (el.getAttribute('points') || '').slice(0, 90); }
    function hostInfo(sel) {
      const host = document.querySelector(sel);
      if (!host) return { missing: true };
      const svg = host.tagName && host.tagName.toLowerCase() === 'svg' ? host : host.querySelector('svg');
      if (!svg) return { missing: true, why: 'no svg', html: host.innerHTML.slice(0, 120) };
      const pipes = [];
      svg.querySelectorAll('[data-tlpipe],[data-tlpipe-seg]').forEach(function (p) {
        pipes.push({
          tag: p.tagName, attr: p.getAttribute('data-tlpipe') || p.getAttribute('data-tlpipe-seg'),
          ref: !!p.getAttribute('data-tlpipe-ref'),
          stroke: p.getAttribute('stroke'), sw: p.getAttribute('stroke-width'),
          d: attrOf(p)
        });
      });
      const rects = [];
      svg.querySelectorAll('rect[data-zi]').forEach(function (r) {
        rects.push({ zi: r.getAttribute('data-zi'), g: r.getAttribute('data-g'), x: r.getAttribute('x'), y: r.getAttribute('y') });
      });
      const valves = [];
      svg.querySelectorAll('circle[fill="#ef4444"]').forEach(function (c) {
        valves.push({ cx: +c.getAttribute('cx'), cy: +c.getAttribute('cy'), r: c.getAttribute('r') });
      });
      const tees = [];
      svg.querySelectorAll('[data-junction-tee]').forEach(function (t) {
        tees.push({
          front: !!t.getAttribute('data-junction-front'),
          x: t.tagName === 'rect' ? +t.getAttribute('x') + 4.5 : null,
          y: t.tagName === 'rect' ? +t.getAttribute('y') + 4.5 : null, tag: t.tagName
        });
      });
      const srcs = [];
      svg.querySelectorAll('circle').forEach(function (c) {
        const f = c.getAttribute('fill');
        if (f && f !== '#ef4444' && f !== '#fff' && f !== 'none') srcs.push({ fill: f, cx: c.getAttribute('cx'), cy: c.getAttribute('cy'), r: c.getAttribute('r') });
      });
      const groups = [];
      svg.querySelectorAll('g[id]').forEach(function (g) { groups.push(g.getAttribute('id')); });
      return {
        missing: false,
        viewBox: svg.getAttribute('viewBox'),
        nChildren: svg.children.length,
        pipesN: pipes.length, pipes: pipes.slice(0, 24),
        rectsN: rects.length, rects: rects.slice(0, 12),
        valvesN: valves.length, valves: valves.slice(0, 16),
        teesN: tees.length, tees: tees.slice(0, 16),
        srcsN: srcs.length, srcs: srcs.slice(0, 8),
        groups: groups.slice(0, 30)
      };
    }
    const dd = window.tlDiagramData;
    return {
      diagram: hostInfo('#tlDiagramContent'),
      ws: hostInfo('#tlWsContent'),
      data: dd ? {
        version: dd.version, world: dd.world,
        polyN: (dd.poly || []).length,
        frontN: (dd.frontPipe || []).length,
        mainN: (dd.mainPipes || []).length,
        branchN: (dd.branchPipes || []).length,
        valvesN: (dd.valves || []).length,
        sourcePos: dd.sourcePos || null,
        frontHead: (dd.frontPipe || []).slice(0, 3),
        main0Head: ((dd.mainPipes || [])[0] || []).slice(0, 3),
        branch0Head: ((dd.branchPipes || [])[0] || []).slice(0, 3)
      } : null,
      planView: window.tlPlanView ? { s: window.tlPlanView.s, minX: window.tlPlanView.minX, minY: window.tlPlanView.minY } : null
    };
  });

  console.log('====== #tlDiagramContent（三级施工简图）======');
  console.log(JSON.stringify(dump.diagram, null, 1));
  console.log('\n====== #tlWsContent（三级工作区）======');
  console.log(JSON.stringify(dump.ws, null, 1));
  console.log('\n====== tlDiagramData ======');
  console.log(JSON.stringify(dump.data, null, 1));
  console.log('\n====== tlPlanView ======');
  console.log(JSON.stringify(dump.planView));
  console.log('\n====== page errors ======');
  console.log(JSON.stringify(errs.slice(0, 10)));

  try { await page.close(); } catch (e) { }
  try { await browser.disconnect(); } catch (e) { }
  killTree(proc.pid);
  await sleep(600);
  process.exit(0);
})().catch(e => { console.error('FATAL', e && e.message); process.exit(2); });
