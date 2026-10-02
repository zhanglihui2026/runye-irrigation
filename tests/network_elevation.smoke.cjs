/* =====================================================================
 * tests/network_elevation.smoke.cjs — 真实高程契约抽查 + 施工编辑器 v179 现状回归
 * 运行：NODE_PATH=<workspace>/node_modules node tests/network_elevation.smoke.cjs
 * 演变（旧「已下线」契约已被取代，勿照旧口径改回）：
 *   2026-09-14 本脚本曾驱动左栏「真实高程」入口 UI（13 项：确认高程→延伸驳接→撤销）；
 *   2026-09-15 晚 用户拍板施工编辑 UI 整体取消（EDITOR_OFF = true）→ 本脚本改盯「已下线」；
 *   2026-09-26 提交 7fd59cc 把 EDITOR_OFF 改回 false（编辑器重新启用）；
 *   2026-10-01 v179 只收**轴测**入口（ISO_OFF），平面视图行为不变；
 *   2026-10-02 本脚本重定基：A 段「无卡片 / 硬开关无效」过期，改为 v179 现状。
 * 本回归（真实 Edge，独立 profile）盯：
 *   A) 施工编辑器 v179 现状（平面视图在用 + 可编程开关干净）：
 *      有平面数据即自动启用（active=true）、卡片挂 #tlSide 且不收起、
 *      disable()/enable() 可编程且生效、「真实高程 / 确认高程」旧入口文案不得复活；
 *      ★ 叠加层计数不在此断言 —— 本脚本不渲染平面 svg（无 host svg 时 drawLayer 直返），
 *        该项在 tests/network_editor.smoke.cjs 里以真实 svg 非平凡断言。
 *   B) 高程契约保留（模型 API 直驱）：
 *      1) fromPlan 全部配件 elevation === null（不默认 0、不继承显示层高 z）；
 *      2) 显示层高 z 各归其位（主管 -1 / 支管 0.3），与 elevation 严格分离；
 *      3) serialize/deserialize 往返保 null。
 *   C) 原平面数据零改动、无页面报错。
 * ===================================================================== */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const puppeteer = require('puppeteer-core');

const WS = 'C:\\Users\\AHS\\runye-irrigation';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = path.join(WS, '_verify_out');
const PORT = 9434;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileUrl = (p) => 'file:///' + p.replace(/\\/g, '/');

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
    '--user-data-dir=' + path.join(OUT, 'profile_elev'),
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

  /* ---- 准备：注入平面数据 ---- */
  await page.evaluate((data) => {
    localStorage.clear();
    window.tlDiagramData = JSON.parse(JSON.stringify(data));
    window.__planSnapshot = JSON.stringify(window.tlDiagramData);
    if (typeof rySetTab === 'function') { try { rySetTab('tlPipePlanSection', 'pipe'); } catch (e) {} }
  }, DATA);
  await sleep(800);

  /* ---- A) 施工编辑器 v179 现状：平面视图在用 + 可编程开关干净 ---- */
  const ui = await page.evaluate(() => {
    const E = window.RyNetEditor;
    const cn = () => document.getElementById('cnPanelCard');
    const cardDisp = () => (cn() ? getComputedStyle(cn()).display : 'missing');
    const out = { injected: typeof E, autoActive: E.isActive(), hasNet: !!E.getNet() };
    try { E.refresh(); } catch (e) { out.refreshErr = String(e); }
    out.afterRefresh = { active: E.isActive(), disp: cardDisp(), parent: cn() && cn().parentElement ? cn().parentElement.id : null };
    try { E.disable(); } catch (e) { out.disErr = String(e); }
    out.afterDisable = { active: E.isActive(), disp: cardDisp(),
      txt: cn() ? cn().innerText.replace(/\s+/g, ' ').slice(0, 24) : '' };
    try { E.enable(); } catch (e) { out.enErr = String(e); }
    out.afterEnable = { active: E.isActive(), disp: cardDisp() };
    const txt = document.body.innerText;
    out.wElev = /真实高程/.test(txt); out.wConfirm = /确认高程/.test(txt);
    return out;
  });
  check('A 现状：有平面数据即自动启用（平面视图施工编辑器在用）',
    ui.injected === 'object' && ui.autoActive === true && ui.hasNet === true,
    'injected=' + ui.injected + ' active=' + ui.autoActive + ' net=' + ui.hasNet);
  check('A 在用：卡片挂 #tlSide 且未收起（ISO_OFF 只作用于轴测）',
    ui.afterRefresh.parent === 'tlSide' && ui.afterRefresh.disp !== 'none',
    'parent=' + ui.afterRefresh.parent + ' disp=' + ui.afterRefresh.disp);
  check('A 开关：disable()→false 且卡片回未启用态；enable() 可恢复（非硬开关）',
    ui.afterDisable.active === false && ui.afterEnable.active === true &&
    /启用/.test(ui.afterDisable.txt) && !/退出/.test(ui.afterDisable.txt) &&
    !ui.disErr && !ui.enErr && !ui.refreshErr,
    'dis=' + ui.afterDisable.active + ' en=' + ui.afterEnable.active +
    ' txt=' + ui.afterDisable.txt + ' err=' + [ui.disErr, ui.enErr, ui.refreshErr].filter(Boolean).join('|'));
  check('A 反向：「真实高程 / 确认高程」旧入口文案不得复活', !ui.wElev && !ui.wConfirm,
    [ui.wElev && '真实高程', ui.wConfirm && '确认高程'].filter(Boolean).join(','));

  /* ---- B) 高程契约保留（模型 API 直驱） ---- */
  const eng = await page.evaluate((data) => {
    try {
      const M = window.RyNetModel;
      const net = new M.ConstructionNetwork().fromPlan(JSON.parse(JSON.stringify(data)));
      const fits = Object.values(net.fittings);
      const nullElev = fits.every((f) => f.elevation === null);
      /* 显示层高 z：总管/总管三通 -1.5、主管链 -1、阀门 0.3、支管 0.3 —— 各归其位 */
      const zValve = fits.filter((f) => f.type === 'valve').every((f) => f.z === 0.3);
      const zBranchEnd = fits.filter((f) => f.type === 'endpoint' && f.z === 0.3).length > 0;
      const zMain = Object.values(net.segments).filter((s) => s.kind === 'main').length > 0;
      const snap1 = JSON.stringify(net.serialize());
      /* deserialize 是静态方法（自带完整性校验）；currentKey 须传 geometryKey，否则记 legacyMismatch。
         ★ 往返不做字节级对比（deserialize 迁移补齐空端口字段是模型既定行为），走语义等价。 */
      const key = M.geometryKey(JSON.parse(JSON.stringify(data)));
      const back = M.ConstructionNetwork.deserialize(JSON.parse(snap1), key);
      const semEq = !!back && !back.error &&
        Object.keys(back.segments).length === Object.keys(net.segments).length &&
        Object.keys(back.fittings).length === fits.length;
      const roundNull = semEq && Object.values(back.fittings).every((f) => f.elevation === null);
      return {
        ok: true, n: fits.length, nullElev: nullElev, zValve: zValve,
        zBranchEnd: zBranchEnd, zMain: zMain,
        round: semEq,
        roundNull: roundNull, err: back && back.error
      };
    } catch (e) { return { ok: false, err: String(e) }; }
  }, DATA);
  check('契约：fromPlan 全部配件 elevation=null（不默认 0 / 不继承 z）',
    eng.ok && eng.nullElev, 'n=' + eng.n + ' ' + (eng.err || ''));
  check('契约：显示层高 z 与 elevation 严格分离（阀门 0.3 / 支管端点 0.3）',
    eng.ok && eng.zValve && eng.zBranchEnd);
  check('契约：serialize/deserialize 往返一致且 elevation 仍为 null',
    eng.ok && eng.round && eng.roundNull);

  /* ---- 收尾 ---- */
  const planOk = await page.evaluate(() => JSON.stringify(window.tlDiagramData) === window.__planSnapshot);
  check('全流程原平面数据零改动', planOk);
  check('无页面报错', errs.length === 0, errs.join(' | ').slice(0, 200));

  await browser.close();
  proc.kill();
  console.log('\n== 结论：PASS=' + pass + ' FAIL=' + fail + ' ==');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('SMOKE CRASH:', e.message + '\n' + (e.stack || '').split('\n').slice(0, 6).join('\n')); process.exit(2); });
