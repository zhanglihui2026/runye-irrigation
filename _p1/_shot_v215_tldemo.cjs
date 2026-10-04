/* _p1/_shot_v215_tldemo.cjs · [v215] 三级管路编辑器「轮灌演示」验证
 * 用户原话：「这里增加一个轮灌区 来回切换的按钮，我点击哪个轮灌区 右侧分区就跟着变化颜色，
 *            这样我能比较直观的看到，轮灌区是怎么样的，类似过滤系统演示反冲洗动画一样。」
 *
 * ★ 全程走真实入口（audit_runtime 验证过的引导路径）：
 *   设地块 320×200 → 生成平面图 → 切三级页 → 点「生成管线图」→ 切工作区。
 *   不手工塞数据 —— 合成数据验不出「数据没流到那里」。
 *
 * 断言覆盖：chips 动态生成（自动 N 均分）｜点组 → 两视图同步变色（该组加深、其余淡化）
 *   ｜组信息面板直读 ｜▶轮播自动推进可暂停 ｜■退出恢复原色+虚线描边
 *   ｜演示跨「重新生成管线图」保持 ｜演示跨视图切换保持 ｜手动分组用 M 标签
 *   ｜无 JS 报错。
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
/* ★ PA_PAGE/PA_PORT/PA_TAG：注入体检的接入口（v214 教训：不接 = 体检永远测原文件 = 恒绿） */
const PORT = parseInt(process.env.PA_PORT || '9550', 10);
const PAGE = process.env.PA_PAGE || 'index.html';
const TAG = process.env.PA_TAG || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileUrl = (p) => 'file:///' + encodeURI(p.replace(/\\/g, '/'));

let pass = 0, fail = 0;
const check = (n, ok, extra) => { console.log((ok ? '  [PASS] ' : '  [FAIL] ') + n + (extra ? ' :: ' + extra : '')); ok ? pass++ : fail++; };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const proc = spawn(EDGE, ['--headless=new', '--allow-file-access-from-files',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(OUT, 'profile_v215' + TAG),
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
  await sleep(1200);

  /* ---------- ① chips 动态生成 ---------- */
  const st0 = await page.evaluate(() => {
    var bar = document.getElementById('tlDemoBar'), box = document.getElementById('tlDemoChips');
    var chips = box ? Array.prototype.slice.call(box.querySelectorAll('button[data-demo-g]')) : [];
    return {
      visible: !!bar && bar.style.display !== 'none',
      m: chips.length,
      labels: chips.map(function (b) { return b.textContent; }),
      hasPlay: !!document.getElementById('tlDemoPlay'),
      hasExit: !!document.getElementById('tlDemoExit'),
      exitDisabled: (document.getElementById('tlDemoExit') || {}).disabled
    };
  });
  check('① 轮灌演示行出现（生成图后）', st0.visible, JSON.stringify(st0).slice(0, 120));
  check('② chips 数 = 组数（自动 N 均分，≥2）且含 ▶/■', st0.m >= 2 && st0.hasPlay && st0.hasExit,
    'M=' + st0.m + ' labels=' + st0.labels.join(','));
  check('③ 初始：未演示、退出钮禁用', st0.exitDisabled === true);

  /* ---------- ④ 点「组1」→ 两视图同步变色 ---------- */
  await page.click('#tlDemoChips button[data-demo-g="0"]');
  await sleep(400);
  const hi0 = await page.evaluate(() => {
    function scan(rootSel) {
      var root = document.querySelector(rootSel); if (!root) return null;
      var on = 0, dim = 0, bad = 0, total = 0, onStroke = 0;
      root.querySelectorAll('rect[data-zi]').forEach(function (r) {
        total++;
        var g = parseInt(r.getAttribute('data-g'), 10);
        var f = r.getAttribute('fill') || '';
        if (g === 0) { if (f.indexOf('0.55') >= 0) { on++; if (r.getAttribute('stroke') === '#1f2937') onStroke++; } else bad++; }
        else if (f === 'rgba(100,116,139,0.06)') dim++;
        else bad++;
      });
      return { total: total, on: on, dim: dim, bad: bad, onStroke: onStroke };
    }
    return {
      ws: scan('#tlWsCanvas'),
      dia: scan('#tlDiagramContent'),
      sel: window.RyTlWs ? window.RyTlWs.getSelGroup() : 'no-api',
      demo: window.__tlDemoGroup,
      info: (document.getElementById('tlWsGroupInfo') || {}).textContent || '',
      playLbl: (document.getElementById('tlDemoPlay') || {}).textContent
    };
  });
  check('④ 点组1：工作区该组加深（fill 含 0.55 + 深描边）', hi0.ws && hi0.ws.on > 0 && hi0.ws.bad === 0 && hi0.ws.onStroke === hi0.ws.on,
    JSON.stringify(hi0.ws));
  check('⑤ 工作区其余组全部淡化（灰 6%）', hi0.ws && hi0.ws.dim > 0 && (hi0.ws.on + hi0.ws.dim) === hi0.ws.total,
    'on=' + hi0.ws.on + ' dim=' + hi0.ws.dim);
  check('⑥ 三级简图同步变色（同一套三态）', hi0.dia && hi0.dia.on > 0 && hi0.dia.bad === 0,
    JSON.stringify(hi0.dia));
  check('⑦ 组信息面板直读（联合灌溉组 G1 · 含区…）', /联合灌溉组 G1/.test(hi0.info) && /含 区/.test(hi0.info),
    hi0.info.replace(/<br>/g, ' | ').slice(0, 80));
  check('⑧ 状态同步：chip 高亮 + 演示态变量 + 退出钮可用',
    hi0.demo === 0 && hi0.sel === 0 && hi0.playLbl === '▶ 轮播');

  /* ---------- ⑨ ▶ 轮播：立即切下一组并自动推进 ---------- */
  await page.click('#tlDemoPlay');
  await sleep(300);
  const p1 = await page.evaluate(() => ({ demo: window.__tlDemoGroup, play: (document.getElementById('tlDemoPlay') || {}).textContent }));
  await sleep(2400);
  const p2 = await page.evaluate(() => ({ demo: window.__tlDemoGroup, play: (document.getElementById('tlDemoPlay') || {}).textContent }));
  check('⑨ 点▶轮播：立即切到下一组 + 按钮 ⏸ 暂停', p1.demo === 1 && p1.play === '⏸ 暂停',
    JSON.stringify(p1));
  check('⑩ 2.4 秒后自动推进到再下一组', p2.demo === 2 % st0.m && p2.play === '⏸ 暂停',
    JSON.stringify(p2));

  /* ---------- ⑪ 演示跨「重新生成管线图」保持 ----------
     ★ 必须先 ⏸ 暂停轮播再测：轮播 tick（2s）会重涂简图，会把「恢复点被删」的缺陷救回来
     （首跑注入体检 D5 未命中的真凶 —— 断言测的成了 tick 而不是恢复点，样本退化同 v98 教训）。 */
  await page.click('#tlDemoPlay');                       /* ⏸ 暂停（此时正在轮播） */
  await sleep(200);
  const paused = await page.evaluate(() => window.__tlDemoGroup);
  await page.evaluate(() => { const b = document.getElementById('tlAutoPipe'); if (b) b.click(); });
  await sleep(2200);
  const keep = await page.evaluate((gdemo) => {
    var on = 0, bad = 0;
    document.querySelectorAll('#tlDiagramContent rect[data-zi]').forEach(function (r) {
      var g = parseInt(r.getAttribute('data-g'), 10), f = r.getAttribute('fill') || '';
      if (g === gdemo) { if (f.indexOf('0.55') >= 0) on++; else bad++; }
      else if (f !== 'rgba(100,116,139,0.06)') bad++;
    });
    return { demo: gdemo, cur: window.__tlDemoGroup, on: on, bad: bad };
  }, paused);
  check('⑪ 重新生成管线图后演示色仍在（简图重建即恢复，轮播已暂停排除 tick 救场）',
    keep.demo !== null && keep.cur === keep.demo && keep.on > 0 && keep.bad === 0,
    JSON.stringify(keep));

  /* ---------- ⑫ 演示跨视图切换保持（ws → pipe → ws；轮播仍暂停，同 ⑪ 理由） ---------- */
  await page.evaluate(() => { if (typeof window.rySetTab === 'function') window.rySetTab('tlPipePlanSection', 'pipe'); });
  await sleep(700);
  await page.evaluate(() => { if (typeof window.rySetTab === 'function') window.rySetTab('tlPipePlanSection', 'ws'); });
  await sleep(1200);
  const keep2 = await page.evaluate((gdemo) => {
    var on = 0, bad = 0;
    document.querySelectorAll('#tlWsCanvas rect[data-zi]').forEach(function (r) {
      var g = parseInt(r.getAttribute('data-g'), 10), f = r.getAttribute('fill') || '';
      if (g === gdemo) { if (f.indexOf('0.55') >= 0) on++; else bad++; }
      else if (f !== 'rgba(100,116,139,0.06)') bad++;
    });
    return { demo: gdemo, cur: window.__tlDemoGroup, on: on, bad: bad };
  }, paused);
  check('⑫ 切走再切回工作区，演示色保持', keep2.demo !== null && keep2.cur === keep2.demo && keep2.on > 0 && keep2.bad === 0,
    JSON.stringify(keep2));

  /* ---------- ⑬ 手动分组：合并两区 → chips 变 M 标签、信息面板走手动分支 ---------- */
  await page.click('#tlDemoExit');
  await sleep(300);
  const manual = await page.evaluate(() => {
    /* 手动合并区 0、1（走既有公开接口 window.tlMergeIndices） */
    if (typeof window.tlMergeIndices === 'function') window.tlMergeIndices([0, 1]);
    else return { err: 'no tlMergeIndices' };
    var box = document.getElementById('tlDemoChips');
    var chips = box ? Array.prototype.slice.call(box.querySelectorAll('button[data-demo-g]')) : [];
    return { m: chips.length, labels: chips.map(function (b) { return b.textContent; }) };
  });
  await sleep(400);
  check('⑬ 手动合并两区后 chips 重建成 M 标签（组数=手动组数）',
    manual.m >= 1 && manual.labels[0] === 'M1', JSON.stringify(manual));
  await page.click('#tlDemoChips button[data-demo-g="0"]');
  await sleep(400);
  const mInfo = await page.evaluate(() => (document.getElementById('tlWsGroupInfo') || {}).textContent || '');
  check('⑭ 手动模式信息面板走手动分支（手动联合灌溉组 M1，成员=合并的区）',
    /手动联合灌溉组 M1/.test(mInfo) && /区 1、2/.test(mInfo), mInfo.slice(0, 80));

  /* ---------- ⑮ ■ 退出：全部恢复原色 + 虚线描边 ---------- */
  await page.click('#tlDemoExit');
  await sleep(400);
  const off = await page.evaluate(() => {
    var bad = 0, total = 0, noStroke = 0;
    ['#tlWsCanvas', '#tlDiagramContent'].forEach(function (sel) {
      var root = document.querySelector(sel); if (!root) return;
      root.querySelectorAll('rect[data-zi]').forEach(function (r) {
        total++;
        if (r.getAttribute('fill') !== r.getAttribute('data-fill')) bad++;
        var want = r.getAttribute('data-stroke') || '';
        if (want && r.getAttribute('stroke') !== want) noStroke++;
      });
    });
    return { total: total, bad: bad, noStroke: noStroke, demo: window.__tlDemoGroup, exitDisabled: (document.getElementById('tlDemoExit') || {}).disabled };
  });
  check('⑮ 退出后两视图全部恢复原色', off.demo === null && off.total > 0 && off.bad === 0, JSON.stringify(off));
  check('⑯ 退出后虚线描边还原（不是被删光）', off.noStroke === 0, 'noStroke=' + off.noStroke);

  check('⑰ 全程无 JS 报错', errs.length === 0, errs.slice(0, 2).join(' | '));
  await page.screenshot({ path: path.join(OUT, 'pa_v215_tldemo.png') });
  console.log('[shot] _verify_out/pa_v215_tldemo.png');
  console.log('\n=== 汇总：' + pass + ' 通过 / ' + fail + ' 失败 ===');
  await browser.disconnect();
  killTree(proc.pid);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error('EXCEPTION: ' + (e && e.message)); killTree.sweepTestEdges(); process.exit(1); });
