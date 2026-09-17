/* =====================================================================
 * tests/network_editor.smoke.cjs — 施工编辑功能「已下线」回归验收（2026-09-15 改约）
 * 运行：NODE_PATH=<workspace>/node_modules node tests/network_editor.smoke.cjs
 * 演变：
 *   2026-09-14    清单式接管 UI 下线 → 2026-09-15 恢复双视图装配版（旧契约）；
 *   2026-09-15 晚 用户拍板：平面 + 轴测的施工编辑操作（接管/延伸/修剪/改径/统计）
 *                 整体取消，左栏位置保留空置，待重定方案（EDITOR_OFF / ISO_FITTING_UI_OFF）。
 * 本回归（真实 Edge，独立 profile）盯「下线 + 不复活 + 引擎保留」：
 *   - network-editor.css/js 仍被引用、RyNetEditor 已注入（模块未摘除，只是关入口）；
 *   - 任何路径都不得再出现 #cnPanelCard / g.cn-layer / g.cn-hover / #cnPop，
 *     主动调 enable()/refresh()/toggle()/mount() 也无法启用（硬开关）；
 *   - 「管网装配 / 施工管网编辑 / 待确认明细」等文案不得出现；
 *   - 轴测左栏 #tlIsoSide 位置保留但其编辑卡全部隐藏（整栏空置）；
 *   - tlExportSvgString 导出不含编辑层痕迹；
 *   - 主方案保存/加载往返正常；原平面数据零改动；
 *   - 模型引擎仍在（RyNetModel fromPlan → 建模 → serialize 往返一致）；
 *   - 无页面报错。
 * ===================================================================== */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const puppeteer = require('puppeteer-core');

const WS = 'C:\\Users\\AHS\\runye-irrigation';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = path.join(WS, '_verify_out');
const PORT = 9439;
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
    '--user-data-dir=' + path.join(OUT, 'profile_neteditor_off'),
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

  /* ---- 断言一：模块仍被加载（只是关入口），且加载后未启用 ---- */
  const loaded = await page.evaluate(() => ({
    editor: typeof window.RyNetEditor,
    model: typeof window.RyNetModel,
    css: [...document.querySelectorAll('link[rel="stylesheet"]')].some((l) => /network-editor\.css/.test(l.href)),
    js: [...document.querySelectorAll('script[src]')].some((s) => /network-editor\.js/.test(s.src)),
    active: window.RyNetEditor ? window.RyNetEditor.isActive() : null,
    net: window.RyNetEditor ? window.RyNetEditor.getNet() : 'no-api'
  }));
  check('保留：RyNetEditor 已注入（模块未摘除）', loaded.editor === 'object', String(loaded.editor));
  check('保留：network-editor.css / .js 仍被引用', loaded.css && loaded.js);
  check('下线：加载后未启用（isActive()=false）', loaded.active === false, String(loaded.active));
  check('下线：无模型实例（getNet()=null）', loaded.net === null, String(loaded.net));

  /* ---- 准备：注入平面数据 + 渲染轴测 + 切视图（有平面数据也不再自动启用） ---- */
  await page.evaluate((data) => {
    localStorage.clear();
    window.tlDiagramData = JSON.parse(JSON.stringify(data));
    window.__planSnapshot = JSON.stringify(window.tlDiagramData);
    /* 快照存 localStorage（reload 后 window 丢失） */
    localStorage.setItem('__edoff_plan_snap', window.__planSnapshot);
    const ctn = document.getElementById('tlIsoDiagramContent');
    window.RyIsoDiagram.render(ctn, window.tlDiagramData);
    if (typeof rySetTab === 'function') { try { rySetTab('tlPipePlanSection', 'pipe'); } catch (e) {} }
  }, DATA);
  await sleep(800);
  await page.evaluate(() => { if (typeof rySetTab === 'function') { try { rySetTab('tlPipePlanSection', 'iso'); } catch (e) {} } });
  await sleep(800);

  /* ---- 断言二：编辑 UI 全面缺席（两个视图都切过之后） ---- */
  const gone = await page.evaluate(() => {
    /* innerText（渲染文本）：textContent 会把 <script> 注释也算进去，反向断言必假红 */
    const txt = document.body.innerText;
    return {
      card: !!document.getElementById('cnPanelCard'),
      layer: document.querySelectorAll('g.cn-layer').length,
      hover: document.querySelectorAll('g.cn-hover').length,
      pop: !!document.getElementById('cnPop'),
      titleNew: /管网装配/.test(txt),
      titleOld: /施工管网编辑/.test(txt),
      pending: /待确认明细/.test(txt),
      stats: /沿线统计/.test(txt)
    };
  });
  check('下线：无 #cnPanelCard（切视图后也不挂）', !gone.card);
  check('下线：平面/轴测 svg 无 g.cn-layer 叠加层', gone.layer === 0, 'n=' + gone.layer);
  check('下线：无 g.cn-hover 悬停层', gone.hover === 0, 'n=' + gone.hover);
  check('下线：无 #cnPop 就地菜单容器', !gone.pop);
  check('反向：「管网装配」标题不得出现', !gone.titleNew);
  check('反向：旧标题「施工管网编辑」不得出现', !gone.titleOld);
  check('反向：「待确认明细 / 沿线统计」面板文案不得出现', !gone.pending && !gone.stats);

  /* ---- 断言三：硬开关 —— 主动调 API 也无法启用 ---- */
  const forced = await page.evaluate(() => {
    const E = window.RyNetEditor;
    try { E.enable(); } catch (e) {}
    try { E.toggle(); } catch (e) {}
    try { E.refresh(); } catch (e) {}
    try { E.mount(); } catch (e) {}
    return {
      active: E.isActive(),
      card: !!document.getElementById('cnPanelCard'),
      layer: document.querySelectorAll('g.cn-layer').length
    };
  });
  await sleep(400);
  check('下线：enable/toggle/refresh/mount 全部无效（硬开关）',
    forced.active === false && !forced.card && forced.layer === 0,
    'active=' + forced.active + ' card=' + forced.card + ' layer=' + forced.layer);

  /* ---- 断言四：轴测左栏编辑类卡全隐藏；「插入管线」卡为唯一可见卡
     （2026-09-15 阶段1 契约改写：旧「整栏空置」过期 —— 用户批准轴测图
     增加 插入主管/插入支管（共享图面数据层，与三级工作区双向同步），
     该卡 class 为 .tl-iso-pipe-card，配件布置/构件参数/编辑器卡仍全隐藏） ---- */
  const side = await page.evaluate(() => {
    const aside = document.getElementById('tlIsoSide');
    const cards = aside ? [...aside.querySelectorAll('.tl-iso-card')] : [];
    const editCards = cards.filter((c) => !c.classList.contains('tl-iso-pipe-card'));
    const pipeCard = cards.find((c) => c.classList.contains('tl-iso-pipe-card'));
    return {
      aside: !!aside,
      editHidden: editCards.length > 0 && editCards.every((c) => getComputedStyle(c).display === 'none'),
      pipeVisible: !!pipeCard && getComputedStyle(pipeCard).display !== 'none',
      /* 只看左栏自身渲染文本：CAD 栏分组标题「轴测 · 配件布置」不在此列 */
      fittingTxt: /配件布置/.test(aside ? aside.innerText : '')
    };
  });
  check('保留：#tlIsoSide 左栏骨架仍在（位置留空）', side.aside);
  check('下线：编辑类卡全部隐藏；插入管线卡为唯一可见卡（阶段1 新契约）',
    side.editHidden && side.pipeVisible, 'editHidden=' + side.editHidden + ' pipeVisible=' + side.pipeVisible);
  check('反向：「配件布置」文案不得出现', !side.fittingTxt);

  /* ---- 断言五：导出干净（exportClean 无层直通） ---- */
  const exp = await page.evaluate(() => {
    const ctn = document.getElementById('tlIsoDiagramContent');
    const s = (typeof tlExportSvgString === 'function') ? tlExportSvgString(ctn) : '';
    return { hasSvg: s.indexOf('<svg') >= 0, clean: s.indexOf('cn-layer') < 0 && s.indexOf('cn-hover') < 0 };
  });
  check('导出：tlExportSvgString 正常且无编辑层痕迹', exp.hasSvg && exp.clean);

  /* ---- 断言六：引擎保留（RyNetModel 仍可建模） ---- */
  const eng = await page.evaluate((data) => {
    try {
      const net = new window.RyNetModel.ConstructionNetwork().fromPlan(JSON.parse(JSON.stringify(data)));
      const segs = Object.keys(net.segments).length;
      const fits = Object.keys(net.fittings).length;
      const snap1 = JSON.stringify(net.serialize());
      /* deserialize 是静态方法（自带完整性校验）；currentKey 须传 geometryKey，否则记 legacyMismatch。
         ★ 往返不做字节级对比：deserialize 迁移会补齐空端口字段（system/material/conn/kind=null），
         serialize 又省略 null —— 这是模型既定行为。断言走语义等价（数量/高程/连接守恒）。 */
      const key = window.RyNetModel.geometryKey(JSON.parse(JSON.stringify(data)));
      const back = window.RyNetModel.ConstructionNetwork.deserialize(JSON.parse(snap1), key);
      const semEq = !!back && !back.error &&
        Object.keys(back.segments).length === segs &&
        Object.keys(back.fittings).length === fits &&
        Object.values(back.fittings).every((f) => f.elevation === null) &&
        Object.values(back.fittings).every((f) => Object.values(f.ports).every((p) =>
          (p.connected == null) || !!back.segments[p.connected]));
      return { ok: segs > 0, segs: segs, semEq: semEq, err: back && back.error };
    } catch (e) { return { ok: false, err: String(e) }; }
  }, DATA);
  check('引擎：RyNetModel fromPlan 仍可建模（段数>0）', eng.ok, 'segs=' + eng.segs + ' ' + (eng.err || ''));
  check('引擎：静态 deserialize 往返语义等价（数量/高程/连接守恒）', eng.semEq === true);

  /* ---- 断言七：主方案保存/加载往返不受影响 ---- */
  const saved = await page.evaluate(() => {
    try { runyeSaveProject(); return { ok: true }; } catch (e) { return { ok: false, err: String(e) }; }
  });
  check('保存：runyeSaveProject 正常（constructionNet=null 分支）', saved.ok, saved.err || '');
  await page.reload({ waitUntil: 'load', timeout: 90000 });
  await sleep(1000);
  const loadedBack = await page.evaluate(() => {
    try {
      if (typeof runyeLoadProject === 'function') runyeLoadProject();
      return { ok: true, hasData: !!window.tlDiagramData, card: !!document.getElementById('cnPanelCard') };
    } catch (e) { return { ok: false, err: String(e) }; }
  });
  check('加载：runyeLoadProject 正常且不挂编辑卡', loadedBack.ok && loadedBack.hasData && !loadedBack.card,
    loadedBack.err || '');

  /* ---- 收尾 ---- */
  const planOk = await page.evaluate(() => {
    const snap = localStorage.getItem('__edoff_plan_snap');
    localStorage.removeItem('__edoff_plan_snap');
    return snap !== null && JSON.stringify(window.tlDiagramData) === snap;
  });
  check('原平面数据零改动', planOk);
  check('无页面报错', errs.length === 0, errs.join(' | ').slice(0, 200));

  await browser.close();
  proc.kill();
  console.log('\n== 结论：PASS=' + pass + ' FAIL=' + fail + ' ==');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('SMOKE CRASH:', e.message + '\n' + (e.stack || '').split('\n').slice(0, 6).join('\n')); process.exit(2); });
