/* =====================================================================
 * tests/network_assembly.smoke.cjs — 接管/装配入口「已下线」回归（2026-09-15 第三次改约）
 * 运行：NODE_PATH=<workspace>/node_modules node tests/network_assembly.smoke.cjs
 * 演变：
 *   2026-09-14    清单式接管 UI 下线；2026-09-15 恢复「白圈就地递归接管」双视图装配版；
 *   2026-09-15 晚 用户拍板：接管/延伸/修剪/改径/统计等施工编辑操作整体取消（平面+轴测），
 *                 左栏位置保留空置，待重定方案（network-editor.js EDITOR_OFF /
 *                 index.html ISO_FITTING_UI_OFF）。
 * 本回归（真实 Edge，独立 profile）盯「入口必须消失 + 引擎保留」：
 *   - #cnPanelCard / #cnPop 不得出现；popupItems() 恒为空；
 *   - 「接管道/接三通/接弯头/接阀门」等接管文案不得出现在页面任何渲染文本里；
 *   - 点图（轴测 svg）不弹任何就地菜单；
 *   - 轴测图本体正常渲染、左栏空置；
 *   - 模型引擎保留：setCaliber（事务内改径）+ undo 复原 + serialize 往返仍可用；
 *   - 原平面数据零改动、无页面报错。
 * ===================================================================== */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const puppeteer = require('puppeteer-core');

const WS = 'C:\\Users\\AHS\\runye-irrigation';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = path.join(WS, '_verify_out');
const PORT = 9437;
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
    '--user-data-dir=' + path.join(OUT, 'profile_assembly'),
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

  /* ---- 准备：注入平面数据 + 渲染轴测 ---- */
  await page.evaluate((data) => {
    localStorage.clear();
    window.tlDiagramData = JSON.parse(JSON.stringify(data));
    window.__planSnapshot = JSON.stringify(window.tlDiagramData);
    const ctn = document.getElementById('tlIsoDiagramContent');
    window.RyIsoDiagram.render(ctn, window.tlDiagramData);
    if (typeof rySetTab === 'function') { try { rySetTab('tlPipePlanSection', 'iso'); } catch (e) {} }
  }, DATA);
  await sleep(900);

  /* ---- 断言一：接管/装配入口全部消失 ---- */
  const gone = await page.evaluate(() => {
    /* innerText（渲染文本）：textContent 会把 <script> 注释也算进去，反向断言必假红 */
    const txt = document.body.innerText;
    const hit = (w) => txt.indexOf(w) >= 0;
    return {
      editor: typeof window.RyNetEditor,
      card: !!document.getElementById('cnPanelCard'),
      pop: !!document.getElementById('cnPop'),
      popItems: window.RyNetEditor ? window.RyNetEditor.popupItems() : ['no-api'],
      wPipe: hit('接管道'), wTee: hit('接三通'), wElbow: hit('接弯头'), wValve: hit('接阀门'),
      wTitle: hit('管网装配'), wOld: hit('施工管网编辑'),
      wStart: hit('新建起始管道'), wList: hit('施工顺序清单'), wAdd: hit('＋ 添加到清单')
    };
  });
  check('下线：RyNetEditor 已注入但未启用', gone.editor === 'object' && !gone.card,
    'editor=' + gone.editor + ' card=' + gone.card);
  check('下线：#cnPop 就地菜单容器不得出现', !gone.pop);
  check('下线：popupItems() 恒为空数组', Array.isArray(gone.popItems) && gone.popItems.length === 0,
    JSON.stringify(gone.popItems));
  check('反向：接管文案（接管道/接三通/接弯头/接阀门）不得出现',
    !gone.wPipe && !gone.wTee && !gone.wElbow && !gone.wValve,
    [gone.wPipe && '接管道', gone.wTee && '接三通', gone.wElbow && '接弯头', gone.wValve && '接阀门'].filter(Boolean).join(','));
  check('反向：「管网装配 / 施工管网编辑」标题不得出现', !gone.wTitle && !gone.wOld);
  check('反向：更早下线的清单式接管（新建起始管道/施工顺序清单/＋添加到清单）不得复活',
    !gone.wStart && !gone.wList && !gone.wAdd);

  /* ---- 断言二：点图不弹菜单 ---- */
  const clickProbe = await page.evaluate(() => {
    const svg = document.querySelector('#tlIsoDiagramContent svg');
    if (!svg) return { ok: false };
    const r = svg.getBoundingClientRect();
    svg.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
    svg.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
    return { ok: true, pop: !!document.getElementById('cnPop'), popShown: (document.getElementById('cnPop') || {}).style ? document.getElementById('cnPop').style.display !== 'none' : false };
  });
  check('下线：点击图面不弹就地菜单', clickProbe.ok && !clickProbe.pop);

  /* ---- 断言三：轴测图本体正常、左栏空置 ---- */
  const kept = await page.evaluate(() => {
    const aside = document.getElementById('tlIsoSide');
    const cards = aside ? [...aside.querySelectorAll('.tl-iso-card')] : [];
    return {
      isoRendered: !!document.querySelector('#tlIsoDiagramContent svg'),
      side: !!aside,
      /* 2026-09-15 阶段1/2：插入管线卡(.tl-iso-pipe-card)与自动管线选中卡(.tl-iso-autocard)有意可见，
         其余编辑类卡仍须隐藏（反向验证：若新卡被误隐藏 → pipeCardShown 报红） */
      editHidden: cards.length > 0 && cards.every((c) => c.classList.contains('tl-iso-pipe-card') || c.classList.contains('tl-iso-autocard') || getComputedStyle(c).display === 'none'),
      pipeCardShown: cards.some((c) => c.classList.contains('tl-iso-pipe-card') && getComputedStyle(c).display !== 'none'),
      layer: document.querySelectorAll('g.cn-layer').length
    };
  });
  check('保留：轴测图 SVG 正常渲染', kept.isoRendered);
  check('下线：轴测左栏编辑卡隐藏，管线/自动管线卡可见（阶段1/2 契约）', kept.side && kept.editHidden && kept.pipeCardShown);
  check('下线：轴测图无 cn-layer 叠加层', kept.layer === 0, 'n=' + kept.layer);

  /* ---- 断言四：引擎保留 —— setCaliber 事务改径 + undo 复原 + serialize 往返 ---- */
  const eng = await page.evaluate((data) => {
    try {
      const M = window.RyNetModel;
      const net = new M.ConstructionNetwork().fromPlan(JSON.parse(JSON.stringify(data)));
      const seg = Object.values(net.segments).filter((s) => s.kind === 'main' && s.length >= 100)[0];
      if (!seg) return { ok: false, err: 'no long main seg' };
      const before = seg.caliber;
      net.beginEdit();
      const r = net.setCaliber(seg.id, 160);
      net.commitEdit();
      const after = net.segments[seg.id].caliber;
      const snap1 = JSON.stringify(net.serialize());
      net.undo();
      const restored = net.segments[seg.id].caliber;
      const snap2 = JSON.stringify(net.serialize());
      return { ok: r && r.ok !== false && after === 160 && restored === before && snap1 !== snap2,
        before: before, after: after, restored: restored };
    } catch (e) { return { ok: false, err: String(e) }; }
  }, DATA);
  check('引擎：setCaliber 事务内改径仍可用（改径→160）', eng.ok && eng.after === 160,
    'before=' + eng.before + ' after=' + eng.after + ' ' + (eng.err || ''));
  check('引擎：undo 一步完整复原管径', eng.restored === eng.before, 'restored=' + eng.restored);

  /* ---- 收尾 ---- */
  const planOk = await page.evaluate(() => JSON.stringify(window.tlDiagramData) === window.__planSnapshot);
  check('原平面数据零改动', planOk);
  check('无页面报错', errs.length === 0, errs.join(' | ').slice(0, 200));

  await browser.close();
  proc.kill();
  console.log('\n== 结论：PASS=' + pass + ' FAIL=' + fail + ' ==');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('SMOKE CRASH:', e.message + '\n' + (e.stack || '').split('\n').slice(0, 6).join('\n')); process.exit(2); });
