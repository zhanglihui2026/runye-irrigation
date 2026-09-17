/* =====================================================================
 * tests/network_junction.smoke.cjs — 「改管长 → 接头随动」引擎抽查 + 编辑 UI 下线回归
 * 运行：NODE_PATH=<workspace>/node_modules node tests/network_junction.smoke.cjs
 * 演变：
 *   2026-09-15 早 本脚本曾用真实鼠标驱动左栏「沿管轴移动 / 基准端」UI（21 项）；
 *   2026-09-15 晚 用户拍板施工编辑 UI 整体下线（平面+轴测，左栏空置待重定）。
 *                 → UI 交互断言随之退役，随动/锚点契约改由**模型 API 直驱**抽查，
 *                   完整契约仍由 tests/network_junction_move.test.cjs（100 项）覆盖。
 * 本回归（真实 Edge，独立 profile）盯：
 *   A) 编辑 UI 已下线：无 #cnPanelCard / cn-layer /「沿管轴移动」「基准端」入口，
 *      enable() 硬开关无效；
 *   B) 引擎保留（API 直驱）：
 *      1) 改上游主管段 18→21 → 三通 T-V1 沿主管轴滑 3m，阀门 V1 随动，
 *         锚固支管两子段重新切分且长度和守恒（M9 场景）；
 *      2) 以硬固定锚（◆）为移动端 → 分类拒绝、模型零变化；
 *      3) undo 一步完整复原。
 *   C) 原平面数据零改动、无页面报错。
 * ===================================================================== */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const puppeteer = require('puppeteer-core');

const WS = 'C:\\Users\\AHS\\runye-irrigation';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = path.join(WS, '_verify_out');
const PORT = 9436;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileUrl = (p) => 'file:///' + p.replace(/\\/g, '/');
const near = (a, b, eps) => Math.abs(a - b) < (eps || 1e-3);

const DATA = {
  version: 1, world: 'meter', plot: { w: 300, h: 200 },
  poly: [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 200 }, { x: 0, y: 200 }],
  zones: { cols: 2, rows: 2, xPos: [0, 150, 300], yPos: [0, 100, 200] },
  frontPipe: [{ x: 0, y: -20 }, { x: 300, y: -20 }],
  sourcePos: { x: 0, y: -20 },
  mainPipes: [[{ x: 40, y: 0 }, { x: 40, y: 200 }], [{ x: 190, y: 0 }, { x: 190, y: 200 }]],
  branchPipes: [
    [{ x: 80, y: 6 }, { x: 80, y: 94 }], [{ x: 230, y: 6 }, { x: 230, y: 94 }],
    [{ x: 80, y: 106 }, { x: 80, y: 194 }], [{ x: 230, y: 106 }, { x: 230, y: 194 }]
  ],
  valves: [
    { x: 80, y: 50, ax: 40, ay: 18 }, { x: 230, y: 50, ax: 190, ay: 18 },
    { x: 80, y: 150, ax: 40, ay: 118 }, { x: 230, y: 150, ax: 190, ay: 118 }
  ],
  dripTapes: [],
  meta: { zoneCount: 4, pump: { flow: '120', head: '35', power: '18.5' }, pipes: { front: 'O200', main: 'O110', branch: 'O63' } }
};

let pass = 0, fail = 0;
function check(name, ok, extra) {
  console.log((ok ? '  ✓ ' : '  ✗ FAIL ') + name + (extra ? ' — ' + extra : ''));
  if (ok) pass++; else fail++;
}

(async () => {
  const proc = spawn(EDGE, [
    '--headless=new', '--allow-file-access-from-files',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(OUT, 'profile_junc'),
    '--no-first-run', '--no-default-browser-check',
    '--window-size=1500,950', 'about:blank',
  ], { stdio: 'ignore' });

  let browser = null;
  for (let i = 0; i < 50; i++) {
    try { browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:' + PORT, defaultViewport: null }); break; }
    catch (e) { await sleep(400); }
  }
  if (!browser) { console.error('Edge connect failed'); proc.kill(); process.exit(1); }

  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('dialog', (d) => d.dismiss());
  await page.setViewport({ width: 1500, height: 950 });
  await page.goto(fileUrl(path.join(WS, 'index.html')), { waitUntil: 'load', timeout: 90000 });
  await sleep(1200);

  /* ---- 准备：注入平面数据（有数据也不再启用编辑） ---- */
  await page.evaluate((data) => {
    localStorage.clear();
    window.tlDiagramData = JSON.parse(JSON.stringify(data));
    window.__planSnapshot = JSON.stringify(window.tlDiagramData);
    if (typeof rySetTab === 'function') { try { rySetTab('tlPipePlanSection', 'pipe'); } catch (e) {} }
  }, DATA);
  await sleep(800);

  /* ---- A) 编辑 UI 已下线 ---- */
  const ui = await page.evaluate(() => {
    const E = window.RyNetEditor;
    try { E.enable(); } catch (e) {}
    try { E.refresh(); } catch (e) {}
    const txt = document.body.innerText;
    return {
      active: E.isActive(),
      card: !!document.getElementById('cnPanelCard'),
      layer: document.querySelectorAll('g.cn-layer').length,
      wMove: /沿管轴移动/.test(txt),
      wAnchor: /基准端/.test(txt),
      wConfirm: /确认修改|确认延伸|确认修剪/.test(txt)
    };
  });
  check('下线：enable/refresh 无效（active=false、无卡片、无叠加层）',
    ui.active === false && !ui.card && ui.layer === 0,
    'active=' + ui.active + ' card=' + ui.card + ' layer=' + ui.layer);
  check('反向：「沿管轴移动 / 基准端 / 确认修改」等编辑入口文案不得出现',
    !ui.wMove && !ui.wAnchor && !ui.wConfirm,
    [ui.wMove && '沿管轴移动', ui.wAnchor && '基准端', ui.wConfirm && '确认*'].filter(Boolean).join(','));

  /* ---- B) 引擎保留：API 直驱随动契约 ---- */
  const eng = await page.evaluate((data) => {
    const M = window.RyNetModel;
    const net = new M.ConstructionNetwork().fromPlan(JSON.parse(JSON.stringify(data)));
    function near(a, b) { return Math.abs(a - b) < 0.02; }
    /* 定位：主管 1 链（x=40 竖直）被 T-V1(40,18) 拆成 18/182；V1(80,50) 拆支管 44/44 */
    const mains = Object.values(net.segments).filter((s) => s.kind === 'main');
    const upSeg = mains.filter((s) => near(s.length, 18))[0];
    const tee = net.fittings['T-V1'];
    const valve = net.fittings['V1'];
    const brSegs = Object.values(net.segments).filter((s) => s.kind === 'branch' &&
      (s.a.fitting === 'V1' || s.b.fitting === 'V1'));
    const brSum0 = brSegs.reduce((a, s) => a + s.length, 0);
    if (!upSeg || !tee || !valve || brSegs.length !== 2) return { ready: false };
    return {
      ready: true,
      upId: upSeg.id, tee0: { x: tee.pos.x, y: tee.pos.y }, v0: { x: valve.pos.x, y: valve.pos.y },
      brSum0: brSum0, brLens: brSegs.map((s) => s.length).sort((a, b) => a - b)
    };
  }, DATA);
  check('准备：T-V1(40,18) 拆主管 18/182，V1(80,50) 拆支管 44/44',
    eng.ready && near(eng.tee0.x, 40) && near(eng.tee0.y, 18) &&
    near(eng.v0.x, 80) && near(eng.v0.y, 50) && near(eng.brSum0, 88) &&
    near(eng.brLens[0], 44, 0.05) && near(eng.brLens[1], 44, 0.05),
    JSON.stringify(eng).slice(0, 160));

  if (eng.ready) {
    const move = await page.evaluate((upId) => {
      const net = new window.RyNetModel.ConstructionNetwork().fromPlan(
        JSON.parse(JSON.stringify(window.tlDiagramData)));
      const upSeg = Object.values(net.segments).filter((s) => s.id === upId)[0];
      const brSegs = () => Object.values(net.segments).filter((s) => s.kind === 'branch' &&
        (s.a.fitting === 'V1' || s.b.fitting === 'V1'));
      net.beginEdit();
      const r = net.setSegmentLength(upSeg.id, 21);
      net.commitEdit();
      const tee = net.fittings['T-V1'].pos, v = net.fittings['V1'].pos;
      const bs = brSegs();
      return {
        ok: r.ok, reason: r.reason || '',
        tee: { x: tee.x, y: tee.y }, v: { x: v.x, y: v.y },
        brSum: bs.reduce((a, s) => a + s.length, 0),
        brLens: bs.map((s) => s.length).sort((a, b) => a - b),
        snapAfter: JSON.stringify(net.serialize())
      };
    }, eng.upId);
    check('随动：上游主管段 18→21 → ok=true', move.ok, move.reason);
    check('随动：三通 T-V1 沿主管轴滑动 (40,18)→(40,21)',
      near(move.tee.x, 40) && near(move.tee.y, 21), JSON.stringify(move.tee));
    check('随动：阀门 V1 随接驳段整体随动 (80,50)→(80,53)',
      near(move.v.x, 80) && near(move.v.y, 53), JSON.stringify(move.v));
    check('随动：锚固支管沿原管线重新切分，两子段长度和守恒（88m）',
      near(move.brSum, 88) && near(move.brLens[0], 41, 0.05) && near(move.brLens[1], 47, 0.05),
      'sum=' + move.brSum.toFixed(3) + ' lens=' + move.brLens.map((x) => x.toFixed(1)).join('/'));

    /* ◆ 分类拒绝：以硬固定锚（front 链端点）为移动端 → 拒绝且模型零变化（同一实例前后对照） */
    const hard = await page.evaluate(() => {
      const net = new window.RyNetModel.ConstructionNetwork().fromPlan(
        JSON.parse(JSON.stringify(window.tlDiagramData)));
      const hardId = Object.keys(net.hardFixed).filter((k) => net.fittings[k] &&
        net.fittings[k].type === 'endpoint')[0];
      const seg = Object.values(net.segments).filter((s) =>
        s.a.fitting === hardId || s.b.fitting === hardId)[0];
      if (!seg) return { ready: false };
      const before = JSON.stringify(net.serialize());
      net.beginEdit();
      const r = net.setSegmentLength(seg.id, seg.length + 5, { moveFitting: hardId });
      net.commitEdit();
      return { ready: true, ok: r.ok, reason: r.reason || '',
        unchanged: JSON.stringify(net.serialize()) === before };
    });
    check('锚点：以硬固定锚（◆）为移动端 → 分类拒绝', hard.ready && hard.ok === false, hard.reason);
    check('锚点：拒绝理由点名「硬固定锚点（◆）」，模型零变化',
      hard.ready && /硬固定锚点（◆）/.test(hard.reason) && hard.unchanged, hard.reason);

    /* undo 一步复原（在新实例上按事务路径走一遍） */
    const undo = await page.evaluate((upId) => {
      const net = new window.RyNetModel.ConstructionNetwork().fromPlan(
        JSON.parse(JSON.stringify(window.tlDiagramData)));
      const before = JSON.stringify(net.serialize());
      net.beginEdit();
      net.setSegmentLength(upId, 21);
      net.commitEdit();
      const changed = JSON.stringify(net.serialize()) !== before;
      const undone = net.undo() && JSON.stringify(net.serialize()) === before;
      return { changed: changed, undone: undone };
    }, eng.upId);
    check('撤销：commitEdit 后一步 undo 完整复原（长度与三通位置同时回滚）',
      undo.changed && undo.undone);
  }

  /* ---- 收尾 ---- */
  const planOk = await page.evaluate(() => JSON.stringify(window.tlDiagramData) === window.__planSnapshot);
  check('全流程原平面数据零改动', planOk);
  check('无页面报错', errs.length === 0, errs.join(' | ').slice(0, 200));

  await browser.close();
  proc.kill();
  console.log('\n== 结论：PASS=' + pass + ' FAIL=' + fail + ' ==');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('SMOKE CRASH:', e.message + '\n' + (e.stack || '').split('\n').slice(0, 6).join('\n')); process.exit(2); });
