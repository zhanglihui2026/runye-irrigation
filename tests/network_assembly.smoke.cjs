/* =====================================================================
 * tests/network_assembly.smoke.cjs — 装配入口「v179 现状」回归
 * 运行：NODE_PATH=<workspace>/node_modules node tests/network_assembly.smoke.cjs
 * 演变（旧「已下线」契约已被取代，勿照旧口径改回）：
 *   2026-09-14    清单式接管 UI 下线；09-15 恢复「白圈就地递归接管」双视图装配版；
 *   2026-09-15 晚 用户拍板施工编辑整体取消（EDITOR_OFF = true）→ 本脚本改盯「入口必须消失」；
 *   2026-09-26    提交 7fd59cc 把 EDITOR_OFF 改回 false —— 编辑器重新启用；
 *   2026-10-01    v179 用户要求：轴测图「插入配件」全入口下线（ISO_FITTING_UI_OFF +
 *                 network-editor.js 的 ISO_OFF），**平面视图行为不变**；
 *   2026-10-02    本脚本重定基：旧「#cnPanelCard 不得出现 / popupItems 恒空 / 左栏空置」
 *                 三类断言过期，改为 v179 现状。
 *
 * 本回归（真实 Edge，独立 profile）盯两件事：
 *   一、轴测视图收口 —— #cnPanelCard 存在但自身 display:none（ISO_OFF）；轴测 svg 不绑就地入口
 *       （点/双击不弹 #cnPop、popupItems() 为空）；但叠加层照旧绘制（g.cn-layer=1，
 *       v179「只关入口不关显示」）；左栏「插入管线」卡可见并指路「三级管路编辑」。
 *   二、防复活哨兵 —— 更早的清单式接管文案（接管道/接三通/接弯头/接阀门、新建起始管道、
 *       施工顺序清单、＋ 添加到清单）与旧标题「施工管网编辑」不得在渲染文本里出现。
 *   另：模型引擎保留（setCaliber 事务改径 + undo 复原 + serialize 往返）、
 *       原平面数据零改动、无页面报错。
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
  await sleep(1000);
  /* ★ 先清存储再 reload：profile 目录跨次复用，上一轮存档会让「本脚本自带数据」前提失真 */
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload({ waitUntil: 'load', timeout: 90000 });
  await sleep(1200);

  /* ---- 准备：注入平面数据 + 渲染轴测 + 切到轴测视图 ---- */
  await page.evaluate((data) => {
    window.tlDiagramData = JSON.parse(JSON.stringify(data));
    window.__planSnapshot = JSON.stringify(window.tlDiagramData);
    const ctn = document.getElementById('tlIsoDiagramContent');
    window.RyIsoDiagram.render(ctn, window.tlDiagramData);
    if (typeof rySetTab === 'function') { try { rySetTab('tlPipePlanSection', 'iso'); } catch (e) {} }
  }, DATA);
  await sleep(900);
  await page.evaluate(() => { if (typeof rySetTab === 'function') { try { rySetTab('tlPipePlanSection', 'iso'); } catch (e) {} } });
  await sleep(500);

  /* ---- 断言一：轴测视图收口 + 防复活哨兵 ---- */
  const gone = await page.evaluate(() => {
    /* innerText（渲染文本）：textContent 会把 <script> 注释也算进去，反向断言必假红 */
    const txt = document.body.innerText;
    const hit = (w) => txt.indexOf(w) >= 0;
    const cn = document.getElementById('cnPanelCard');
    const aside = document.getElementById('tlIsoSide');
    return {
      editor: typeof window.RyNetEditor,
      cnExists: !!cn, cnDisp: cn ? getComputedStyle(cn).display : null,
      pop: !!document.getElementById('cnPop'),
      popItems: window.RyNetEditor ? window.RyNetEditor.popupItems() : ['no-api'],
      layer: document.querySelectorAll('#tlIsoDiagramContent g.cn-layer').length,
      pipeCardShown: !!aside && [...aside.querySelectorAll('.tl-iso-pipe-card')].some((c) => getComputedStyle(c).display !== 'none'),
      wTitle: hit('管网装配'), wOld: hit('施工管网编辑'),
      /* ★ 不能再用 body.innerText 禁「接管道/接三通/接弯头/接阀门」：v179 明确**保留**
         「右键已有配件 → 从分支口接管道」，该字样合法存在于 #tlIsoPipeHint 等提示语中
         （见 index.html:18471-18473 的保留项清单）。故改为精确判据：
         不得存在文本**恰好等于**旧清单式按钮标签的 <button>。 */
      oldBtns: [...document.querySelectorAll('button')].map((b) => b.textContent.trim())
        .filter((t) => ['接管道', '接三通', '接弯头', '接阀门'].indexOf(t) >= 0),
      insertFit: /插入配件/.test(document.body.innerText),
      wStart: hit('新建起始管道'), wList: hit('施工顺序清单'), wAdd: hit('＋ 添加到清单')
    };
  });
  check('A 保留：RyNetEditor 已注入（模块未摘除）', gone.editor === 'object', String(gone.editor));
  check('A 收口：轴测视图下 #cnPanelCard 自身 display:none（ISO_OFF）',
    gone.cnExists && gone.cnDisp === 'none', 'exists=' + gone.cnExists + ' disp=' + gone.cnDisp);
  check('A 收口：#cnPop 就地菜单容器不得出现', !gone.pop);
  check('A 收口：popupItems() 为空（未选中任何对象）',
    Array.isArray(gone.popItems) && gone.popItems.length === 0, JSON.stringify(gone.popItems));
  check('A 保留：轴测图仍绘制叠加层（g.cn-layer=1，只关入口不关显示）',
    gone.layer === 1, 'n=' + gone.layer);
  check('A 保留：轴测左栏「插入管线」卡可见', gone.pipeCardShown);
  check('防复活：旧清单式接管按钮（文本等于「接管道/接三通/接弯头/接阀门」的 button）不得复活',
    gone.oldBtns.length === 0, JSON.stringify(gone.oldBtns));
  check('A 收口：轴测视图渲染文本不得出现「插入配件」（v179 主诉求）', !gone.insertFit);
  check('防复活：「管网装配 / 施工管网编辑」标题不得进入轴测渲染文本',
    !gone.wTitle && !gone.wOld,
    [gone.wTitle && '管网装配', gone.wOld && '施工管网编辑'].filter(Boolean).join(','));
  check('防复活：更早下线的清单式接管（新建起始管道/施工顺序清单/＋添加到清单）不得复活',
    !gone.wStart && !gone.wList && !gone.wAdd);

  /* ---- 断言二：点图不弹菜单 ---- */
  const clickProbe = await page.evaluate(() => {
    const svg = document.querySelector('#tlIsoDiagramContent svg');
    if (!svg) return { ok: false };
    const r = svg.getBoundingClientRect();
    svg.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
    svg.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
    return { ok: true, pop: !!document.getElementById('cnPop'), items: window.RyNetEditor.popupItems() };
  });
  check('A 收口：点击/双击轴测图面不弹就地菜单（#cnPop 不出现、popupItems 空）',
    clickProbe.ok && !clickProbe.pop && Array.isArray(clickProbe.items) && clickProbe.items.length === 0,
    'pop=' + clickProbe.pop + ' items=' + JSON.stringify(clickProbe.items));

  /* ---- 断言三：轴测图本体正常、左栏构成符合 v179 ---- */
  const kept = await page.evaluate(() => {
    const aside = document.getElementById('tlIsoSide');
    const cards = aside ? [...aside.querySelectorAll('.tl-iso-card')] : [];
    const disp = (el) => (el ? getComputedStyle(el).display : 'missing');
    const visTxt = cards.filter((c) => disp(c) !== 'none').map((c) => c.innerText).join(' ');
    return {
      isoRendered: !!document.querySelector('#tlIsoDiagramContent svg'),
      side: !!aside,
      /* v179 轴测左栏：可见 = 插入管线卡 + 配件布置/管线类型/管道插入卡；
         施工编辑卡（#cnPanelCard）、自动管线选中卡、构件参数卡必须隐藏。 */
      pipeShown: cards.some((c) => c.classList.contains('tl-iso-pipe-card') && disp(c) !== 'none'),
      cnHidden: disp(document.getElementById('cnPanelCard')) === 'none',
      autoHidden: disp(document.getElementById('tlIsoAutoCard')) === 'none',
      infoHidden: disp(document.getElementById('tlIsoInfoCard')) === 'none',
      visInsertFit: /插入配件|延伸管道|修剪管道/.test(visTxt)
    };
  });
  check('保留：轴测图 SVG 正常渲染', kept.isoRendered);
  check('A 收口：施工编辑卡 / 自动管线选中卡 / 构件参数卡在轴测左栏均隐藏',
    kept.side && kept.cnHidden && kept.autoHidden && kept.infoHidden,
    'cn=' + kept.cnHidden + ' auto=' + kept.autoHidden + ' info=' + kept.infoHidden);
  check('保留：轴测左栏「插入管线」卡可见，且可见卡中无施工编辑入口（插入配件/延伸管道/修剪管道）',
    kept.pipeShown && !kept.visInsertFit, 'pipe=' + kept.pipeShown + ' visInsertFit=' + kept.visInsertFit);

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
