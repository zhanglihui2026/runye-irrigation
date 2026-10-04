/* _p1/_shot_v216_btnrow.cjs · [v216] 左栏三钮一行 + 取消标签文字 验证
 * 用户原话：「修改红框的内容，保存分组 调出分组 恢复初始化三个按钮放在一行，其余的文字都取消。」
 *
 * 断言覆盖：三钮同行 ｜ 标签/文字行全部取消（且只删文字不删功能）
 * ｜三钮功能不回归（保存/调出/恢复初始化）｜★演示 chips 挂钩仍工作
 * （status 行删除后 tlRefreshGroupStatus 若保留旧的提前 return，chips 永远不刷新）
 * ｜演示照常 ｜无 JS 报错。
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
const TAG = process.env.PA_TAG || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileUrl = (p) => 'file:///' + encodeURI(p.replace(/\\/g, '/'));

let pass = 0, fail = 0;
const check = (n, ok, extra) => { console.log((ok ? '  [PASS] ' : '  [FAIL] ') + n + (extra ? ' :: ' + extra : '')); ok ? pass++ : fail++; };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const proc = spawn(EDGE, ['--headless=new', '--allow-file-access-from-files',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(OUT, 'profile_v216' + TAG),
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

  /* ---------- 真实入口引导（同 v215） ---------- */
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

  /* ---------- ① 三钮同行 ---------- */
  const row = await page.evaluate(() => {
    var ids = ['tlGroupSaveBtn', 'tlGroupRestoreBtn', 'tlGroupInitBtn'];
    var rs = ids.map(function (id) {
      var e = document.getElementById(id);
      if (!e) return null;
      var r = e.getBoundingClientRect();
      return { id: id, top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), visible: r.width > 0 && r.height > 0 };
    });
    return rs;
  });
  check('① 三钮都在（保存分组/调出分组/恢复初始化）', row.every((r) => r && r.visible), JSON.stringify(row));
  check('①b 三钮同一行（top 相差 ≤2px）',
    row[0] && row[1] && row[2] && Math.abs(row[0].top - row[1].top) <= 2 && Math.abs(row[1].top - row[2].top) <= 2,
    'top=' + row.map((r) => r.top).join(','));

  /* ---------- ② 文字全部取消 ---------- */
  const txt = await page.evaluate(() => {
    var bar = document.getElementById('tlPlanBar');
    var t = bar ? bar.textContent : '';
    return {
      hasLabel: { manual: t.indexOf('手动分组') >= 0, union: t.indexOf('联合分区') >= 0, auto: t.indexOf('分组：') >= 0, snap: t.indexOf('变更时') >= 0 },
      domGone: { status: !document.getElementById('tlGroupStatus'), hint: !document.getElementById('tlGroupSnapHint') },
      demoBarStill: !!document.getElementById('tlDemoBar'),
      targetVStill: !!document.getElementById('tlPlanTargetV')
    };
  });
  check('② 红框内文字全部取消（手动分组/联合分区/分组：/变更时）',
    !txt.hasLabel.manual && !txt.hasLabel.union && !txt.hasLabel.auto && !txt.hasLabel.snap, JSON.stringify(txt.hasLabel));
  check('②b status 行与快照提示 DOM 已删', txt.domGone.status && txt.domGone.hint, JSON.stringify(txt.domGone));
  check('②c 红框外的「轮灌演示」行与「目标流速」仍在（没误伤）', txt.demoBarStill && txt.targetVStill);

  /* ---------- ③ 三钮功能不回归 ---------- */
  /* 保存：先手动合并 0、1 两区，再点保存 */
  await page.evaluate(() => { window.tlMergeIndices([0, 1]); });
  await sleep(400);
  await page.click('#tlGroupSaveBtn'); await sleep(300);
  const saved = await page.evaluate(() => ({ mgLen: (window.tlManualGroups || []).length }));
  check('③ 手动合并两区 + 点「保存分组」无报错（快照已存）', saved.mgLen === 1 && errs.length === 0, JSON.stringify(saved));
  /* 点 N 区按钮（3区）→ 手动分组被清空（既有行为） */
  await page.evaluate(() => { var b = document.querySelector('#tlZoneCountGroup button[data-n="3"]'); if (b) b.click(); });
  await sleep(600);
  const cleared = await page.evaluate(() => ({ mgLen: (window.tlManualGroups || []).length }));
  check('③b 点「3区」后手动分组被清空（既有行为保持）', cleared.mgLen === 0, JSON.stringify(cleared));
  /* 调出：恢复快照 */
  await page.click('#tlGroupRestoreBtn'); await sleep(600);
  const restored = await page.evaluate(() => ({ mgLen: (window.tlManualGroups || []).length, first: (window.tlManualGroups || [[-9]])[0].slice(0, 2) }));
  check('③c 点「调出分组」→ 快照恢复（M1=[区1,区2]）', restored.mgLen === 1 && restored.first[0] === 0 && restored.first[1] === 1,
    JSON.stringify(restored));
  /* 恢复初始化：N 回初始 2 区、手动分组清空 */
  await page.evaluate(() => { var b = document.querySelector('#tlZoneCountGroup button[data-n="4"]'); if (b) b.click(); });
  await sleep(500);
  await page.click('#tlGroupInitBtn'); await sleep(800);
  const initBack = await page.evaluate(() => {
    var sel = document.querySelector('#tlZoneCountGroup .selected');
    return { n: sel ? sel.dataset.n : null, mgLen: (window.tlManualGroups || []).length };
  });
  check('③d 点「↺ 恢复初始化」→ N 回初始 2 区 + 手动分组清空', initBack.n === '2' && initBack.mgLen === 0, JSON.stringify(initBack));

  /* ---------- ④ ★ 演示 chips 挂钩仍工作（status 删除后的关键回归点） ---------- */
  await page.evaluate(() => { window.tlMergeIndices([0, 1]); });
  await sleep(500);
  const chips = await page.evaluate(() => {
    var box = document.getElementById('tlDemoChips');
    return { m: box ? box.querySelectorAll('button[data-demo-g]').length : 0,
      labels: box ? Array.prototype.map.call(box.querySelectorAll('button[data-demo-g]'), (b) => b.textContent) : [] };
  });
  check('④ 手动分组一变，演示 chips 自动重建为 M 标签（挂钩未随 status 行被删）',
    chips.m === 1 && chips.labels[0] === 'M1', JSON.stringify(chips));

  /* ---------- ⑤ 演示功能照常 ---------- */
  /* ★ 防御：上游缺陷导致 chips 缺失时这里要报 FAIL 而不是抛异常（否则体检把「闸门拦住」误判成「运行异常」） */
  if (chips.m > 0) {
    await page.click('#tlDemoChips button[data-demo-g="0"]');
    await sleep(400);
    const demo = await page.evaluate(() => {
      var on = 0, bad = 0;
      document.querySelectorAll('#tlWsCanvas rect[data-zi]').forEach(function (r) {
        var g = parseInt(r.getAttribute('data-g'), 10), f = r.getAttribute('fill') || '';
        if (g === 0) { if (f.indexOf('0.55') >= 0) on++; else bad++; }
        else if (f !== 'rgba(100,116,139,0.06)') bad++;
      });
      return { on: on, bad: bad };
    });
    check('⑤ 演示功能照常（点 M1 → 该组加深、其余淡化）', demo.on > 0 && demo.bad === 0, JSON.stringify(demo));
    await page.click('#tlDemoExit'); await sleep(300);
  } else {
    check('⑤ 演示功能照常（点 M1 → 该组加深、其余淡化）', false, '演示 chips 缺失，无法点击（上游 ④ 已红）');
  }

  check('⑥ 全程无 JS 报错', errs.length === 0, errs.slice(0, 2).join(' | '));
  await page.screenshot({ path: path.join(OUT, 'pa_v216_btnrow.png') });
  console.log('[shot] _verify_out/pa_v216_btnrow.png');
  console.log('\n=== 汇总：' + pass + ' 通过 / ' + fail + ' 失败 ===');
  await browser.disconnect();
  killTree(proc.pid);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error('EXCEPTION: ' + (e && e.message)); killTree.sweepTestEdges(); process.exit(1); });
