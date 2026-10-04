/* _p1/_shot_v218_flow.cjs · [v218] 轮灌演示 · 水流动画 + 阀门开启 验证
 * 用户原话：「轮灌区切换的动画演示时，要把水流模拟出来，从水源过来是怎么走的，
 *            哪几个阀门开启，可以让阀门转动之类的方式模拟阀门开启。」
 *
 * ★ 全程走真实入口（与 _shot_v215_tldemo.cjs 同引导路径），不手工塞 DOM。
 * ★ 接 PA_PAGE / PA_PORT / PA_TAG（v214 教训：不接 = 注入体检永远测原文件 = 假绿）。
 *
 * 断言：
 *   ① 演示前：两画布都没有水流层
 *   ② 点「组1」→ 简图 + 工作区都出现 [data-tlflow]，且 <>
 *      · 水流 path 数 = 该组分区数＋.assertEqualsN zones of that group
 *      · 每条水流**起点必须是水源**（水源圈中心 → 路线首点距离 < 8px）
 *      · 路线**终点落在对应分区矩形内**（否则水没真的流到那一区）
 *   ③ 开启的阀门数 = 本组分区数；非本组的阀门不在集合里
 *   ④ 阀门标记上有 rotate 动画类；组切换后阀门集合跟着换（不残留）
 *   ⑤ 退出演示 → 两个画布水流层清空、分区恢复原色
 *   ⑥ 演示跨「重新生成管线图」仍然有位（v215 恢复点）
 *   ⑦ 无 JS 报错
 *
 * 用法：node _shot_v218_flow.cjs [--inject]   （--inject：人为制造缺陷，断言必须变红）
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
const PORT = parseInt(process.env.PA_PORT || '9580', 10);
const PAGE = process.env.PA_PAGE || 'index.html';
const TAG = process.env.PA_TAG || '';
const INJECT = process.argv.indexOf('--inject') >= 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileUrl = (p) => 'file:///' + encodeURI(p.replace(/\\/g, '/'));

let pass = 0, fail = 0;
const check = (n, ok, extra) => { console.log((ok ? '  [PASS] ' : '  [FAIL] ') + n + (extra ? ' :: ' + extra : '')); ok ? pass++ : fail++; };
const info = (s) => console.log('  [INFO] ' + s);

/* 注入用例表（--inject）：每条必须让**指定的那条**断言变红，绿色的一方必须保持绿。
   ⚠ 判据松紧同样重要：I1 最早写成「把 sub 换成整根总管」——那样起点仍是水源、终点仍在分区里，
     断言照样全绿 ⇒ 注入被自己写哑了（闸门三要素：存在 + 判定 + 判据松紧）。 */
const INJ_SPEC = INJECT ? [
  /* I1「水流不从水源来」：直接跳过总管段，路线只从该区主管起算
     ⇒ 期望：②「每条水流起点都贴着水源」变红 */
  ['  var out = sub.concat([mp[0]]);',
    '  var out = [mp[0]];',
    '水流不从水源起算（期望：②起点贴水源 红）'],
  /* I2「阀门不按分区过滤」：所有红⊗一律开启 ⇒ 期望：③「开启阀门数 = 本组分区数」变红 */
  ['        if (vx < rx || vx > rx + rw || vy < ry || vy > ry + rh) continue;',
    '        if (false) continue;',
    '所有红⊗一律视为开启（期望：③阀门数 = 本组分区数 红）'],
  /* I3「切组不清旧层」：水流叠加双层 ⇒ 期望：④「水流仅 1 层」变红 */
  ['  tlFlowClear(svg);\n  if (!svg || g == null || !svg.querySelectorAll) return;',
    '  if (false) tlFlowClear(svg);\n  if (!svg || g == null || !svg.querySelectorAll) return;',
    '切组不清旧层（期望：④水流仅 1 层 红）']
] : [];

const PROBE = `(()=>{try{
  function dump(sel){
    var h=document.querySelector(sel); if(!h) return {missing:true};
    var svg = (h.tagName && h.tagName.toLowerCase()==='svg') ? h : h.querySelector('svg');
    if(!svg) return {missing:true};
    var layer=svg.querySelector('[data-tlflow]') ? svg.querySelector('g[data-tlflow^="g"]') : null;
    var flows=[]; svg.querySelectorAll('path[data-tlflow="flow"]').forEach(function(p){ flows.push(p.getAttribute('d')); });
    var halos=svg.querySelectorAll('path[data-tlflow="halo"]').length;
    var valves=[]; svg.querySelectorAll('g[data-tlflow="valve"]').forEach(function(g){
      var c=g.querySelector('circle'); var hh=g.querySelector('.tl-demo-valve-open');
      valves.push({cx:+c.getAttribute('cx'), cy:+c.getAttribute('cy'),
        org: hh? (hh.getAttribute('style')||'').indexOf('transform-origin')>=0 : false});
    });
    var src=svg.querySelector('circle[data-tlflow="src"]');
    var rects=[]; svg.querySelectorAll('rect[data-zi]').forEach(function(r){
      rects.push({zi:+r.getAttribute('data-zi'), g:+r.getAttribute('data-g'),
        x:+r.getAttribute('x'), y:+r.getAttribute('y'), w:+r.getAttribute('width'), h:+r.getAttribute('height'),
        fill:r.getAttribute('fill')});
    });
    return {missing:false, hasLayer:!!layer, flows:flows, halos:halos, valves:valves,
      src: src?{cx:+src.getAttribute('cx'), cy:+src.getAttribute('cy')}:null, rects:rects,
      layerCount: svg.querySelectorAll('[data-tlflow]').length};
  }
  return JSON.stringify({diagram:dump('#tlDiagramContent'), ws:dump('#tlWsContent'),
    demoG: window.__tlDemoGroup==null?null:window.__tlDemoGroup});
}catch(e){return 'ERR:'+e.message;}})()`;

function firstLast(d) {
  const nums = (d.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  const pts = []; for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  return { pts, first: pts[0], last: pts[pts.length - 1] };
}
const dist = (a, b) => Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);
const inRect = (p, r) => p[0] >= r.x - 0.6 && p[0] <= r.x + r.w + 0.6 && p[1] >= r.y - 0.6 && p[1] <= r.y + r.h + 0.6;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  let pageFile = path.join(WS, PAGE);
  if (INJECT) {
    let src = fs.readFileSync(pageFile, 'utf8');
    const EOL = src.indexOf('\r\n') >= 0 ? '\r\n' : '\n';   /* 换行符实测，不背结论 */
    /* ★ 一次只注一条：三条一起注，红起来了也无法归因到具体哪条断言（闸门体检的常识） */
    const idx = Math.max(0, parseInt(String(TAG).replace(/[^0-9]/g, ''), 10) - 1);
    const pair = INJ_SPEC[idx];
    if (!pair) { console.error('未找到注入 I' + (idx + 1) + '（TAG=' + TAG + '）'); process.exit(2); }
    {
      const from = pair[0].replace(/\n/g, EOL), to = pair[1].replace(/\n/g, EOL);
      const n = src.split(from).length - 1;
      if (n !== 1) { console.error('注入 I' + (idx + 1) + ' 锚点命中 ' + n + ' 处（要求恰好 1）'); process.exit(2); }
      src = src.replace(from, to);
      console.log('== 注入模式 I' + (idx + 1) + '：' + pair[2]);
    }
    pageFile = path.join(WS, '_inj_v218_' + TAG + '.html');
    fs.writeFileSync(pageFile, src, 'utf8');
    console.log('== 注入模式：已生成 ' + path.basename(pageFile));
  }
  const proc = spawn(EDGE, ['--headless=new', '--allow-file-access-from-files',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(OUT, 'profile_v218' + TAG),
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

  /* ---------- 真实入口引导 ---------- */
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

  const hosts = ['diagram', 'ws'];
  const HNAME = { diagram: '三级简图', ws: '三级工作区' };

  /* ---------- ① 演示前：无水流层 ---------- */
  let s0 = JSON.parse(await page.evaluate(PROBE));
  hosts.forEach(function (h) {
    check('① ' + HNAME[h] + ' 演示前无水流层', !s0[h].missing && s0[h].layerCount === 0, 'layerCount=' + (s0[h].missing ? 'missing' : s0[h].layerCount));
  });
  const zone0 = s0.diagram.rects;
  const gMap = {};
  zone0.forEach(r => { (gMap[r.g] = gMap[r.g] || []).push(r.zi); });
  info('分区分组：' + JSON.stringify(gMap) + '（共 ' + zone0.length + ' 区）');

  /* ---------- ② 点「组1」 ---------- */
  await page.evaluate(() => {
    var b = document.querySelector('#tlDemoChips button[data-demo-g="1"]'); if (b) b.click();
  });
  await sleep(700);
  let s1 = JSON.parse(await page.evaluate(PROBE));
  check('② 演示态 = 组1', s1.demoG === 1, 'demoG=' + s1.demoG);
  const g1 = gMap[1] || [];
  hosts.forEach(function (h) {
    const S = s1[h];
    check('② ' + HNAME[h] + ' 出现水流层', !!S.hasLayer, 'hasLayer=' + S.hasLayer);
    check('② ' + HNAME[h] + ' 水流线条数 = 该组分区数(' + g1.length + ')', S.flows.length === g1.length,
      'flows=' + S.flows.length + ' halos=' + S.halos);
    check('② ' + HNAME[h] + ' 光晕底衬与流线同数', S.halos === S.flows.length, 'halo=' + S.halos + ' flow=' + S.flows.length);
    check('② ' + HNAME[h] + ' 有水源脉冲圈', !!S.src, JSON.stringify(S.src));
    /* 起点 = 水源；终点 = 落在本组某个分区矩形内 */
    const src = S.src;
    let srcOk = true, srcWorst = -1, endOk = true, endWorst = -1, endsIn = [];
    S.flows.forEach(function (d) {
      const fl = firstLast(d);
      if (src) { const dd = dist(fl.first, [src.cx, src.cy]); srcWorst = Math.max(srcWorst, dd); if (dd > 8) srcOk = false; }
      let hit = null;
      g1.forEach(function (zi) {
        const r = zone0.find(x => x.zi === zi);
        if (r && inRect(fl.last, r)) hit = zi;
      });
      endsIn.push(hit);
      if (hit == null) endOk = false; else endWorst = Math.max(endWorst, 0);
    });
    check('② ' + HNAME[h] + ' 每条水流起点都贴着水源（≤8px）', srcOk, '最大起点偏离=' + srcWorst.toFixed(2) + 'px');
    check('② ' + HNAME[h] + ' 每条水流终点都落在本组某分区内', endOk, '命中分区=' + JSON.stringify(endsIn));
    /* 阀门 */
    check('③ ' + HNAME[h] + ' 开启阀门数 = 本组分区数(' + g1.length + ')', S.valves.length === g1.length,
      '打开=' + S.valves.length + ' 坐标=' + JSON.stringify(S.valves.map(v => [v.cx, v.cy])));
    check('③ ' + HNAME[h] + ' 阀门都带旋转锚点（会转）', S.valves.length > 0 && S.valves.every(v => v.org),
      'org=' + S.valves.map(v => v.org).join(','));
    const outside = S.valves.filter(v => !g1.some(zi => {
      const r = zone0.find(x => x.zi === zi); return r && inRect([v.cx, v.cy], r);
    }));
    check('③ ' + HNAME[h] + ' 没有「不属于本组」的阀门被打开', outside.length === 0,
      '越界=' + JSON.stringify(outside.map(v => [v.cx, v.cy])));
  });

  /* ---------- ④ 切到组0：阀门/水流跟着换，不残留 ---------- */
  await page.evaluate(() => { var b = document.querySelector('#tlDemoChips button[data-demo-g="0"]'); if (b) b.click(); });
  await sleep(700);
  const s2 = JSON.parse(await page.evaluate(PROBE));
  check('④ 切组后演示态 = 组0', s2.demoG === 0, 'demoG=' + s2.demoG);
  hosts.forEach(function (h) {
    const S = s2[h];
    check('④ ' + HNAME[h] + ' 水流仅 1 层（旧的被清掉，不叠加）', S.flows.length === (gMap[0] || []).length,
      'flows=' + S.flows.length + ' 期望=' + (gMap[0] || []).length);
    const g0 = gMap[0] || [];
    const bad = S.valves.filter(v => !g0.some(zi => {
      const r = zone0.find(x => x.zi === zi); return r && inRect([v.cx, v.cy], r);
    }));
    check('④ ' + HNAME[h] + ' 组1 的阀门已关闭（无残留）', bad.length === 0, '残留=' + JSON.stringify(bad.map(v => [v.cx, v.cy])));
  });

  /* ---------- ⑤ 退出演示 ---------- */
  await page.evaluate(() => { var b = document.getElementById('tlDemoExit'); if (b) b.click(); });
  await sleep(700);
  const s3 = JSON.parse(await page.evaluate(PROBE));
  check('⑤ 退出后演示态 = null', s3.demoG === null, 'demoG=' + JSON.stringify(s3.demoG));
  hosts.forEach(function (h) {
    check('⑤ ' + HNAME[h] + ' 水流层清空', s3[h].layerCount === 0, 'layerCount=' + s3[h].layerCount);
    const restored = s3[h].rects.every(r => r.fill !== 'rgba(100,116,139,0.06)');
    check('⑤ ' + HNAME[h] + ' 分区恢复原色', restored, 'sample=' + JSON.stringify(s3[h].rects.slice(0, 2).map(r => r.fill)));
  });

  /* ---------- ⑥ 演示跨「重新生成管线图」保持 ---------- */
  await page.evaluate(() => { var b = document.querySelector('#tlDemoChips button[data-demo-g="2"]'); if (b) b.click(); });
  await sleep(500);
  await page.evaluate(() => { const b = document.getElementById('tlAutoPipe'); if (b) b.click(); });
  await sleep(2200);
  const s4 = JSON.parse(await page.evaluate(PROBE));
  check('⑥ 重新生成后演示态仍是组2', s4.demoG === 2, 'demoG=' + s4.demoG);
  hosts.forEach(function (h) {
    check('⑥ ' + HNAME[h] + ' 重新生成后水流层自动重建', s4[h].flows.length === (gMap[2] || []).length,
      'flows=' + s4[h].flows.length + ' 期望=' + (gMap[2] || []).length);
  });

  /* ---------- ⑦ 错误 ---------- */
  check('⑦ 无 JS 未捕获异常', errs.length === 0, JSON.stringify(errs.slice(0, 3)));

  /* ---------- 截图（人工肉眼复核留档） ---------- */
  try {
    await page.screenshot({ path: path.join(OUT, 'v218_flow_ws' + TAG + '.png') });
    await page.evaluate(() => { if (typeof window.rySetTab === 'function') window.rySetTab('tlPipePlanSection', 'dia'); });
    await sleep(900);
    await page.screenshot({ path: path.join(OUT, 'v218_flow_dia' + TAG + '.png') });
    info(' 留档截图：_verify_out/v218_flow_ws' + TAG + '.png / v218_flow_dia' + TAG + '.png');
  } catch (eS) { info('截图失败：' + eS.message); }

  console.log('\n== 汇总 ==');
  console.log('断言 ' + pass + '/' + (pass + fail) + ' PASS' + (fail ? '  FAIL=' + fail : ''));
  try { await page.close(); } catch (e) { }
  try { await browser.disconnect(); } catch (e) { }
  killTree(proc.pid);
  await sleep(600);
  if (INJECT) { try { fs.unlinkSync(pageFile); } catch (e) { } }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e && e.message); process.exit(2); });
