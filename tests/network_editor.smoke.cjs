/* =====================================================================
 * tests/network_editor.smoke.cjs — 施工管网编辑器「v179 现状」回归
 * 运行：NODE_PATH=<workspace>/node_modules node tests/network_editor.smoke.cjs
 *
 * 演变（别把本契约当「下线」契约）：
 *   2026-09-14     清单式接管 UI 下线 → 09-15 恢复双视图装配版
 *   2026-09-15 晚  用户拍板施工编辑整体取消（EDITOR_OFF = true）→ 本脚本改盯「已下线 + 硬开关」
 *   2026-09-26     提交 7fd59cc（管径综合优化页）把 EDITOR_OFF 改回 false —— 编辑器**重新启用**
 *   2026-10-01     v179 用户要求：「三级管路编辑中的节点能解决大部分问题，轴测图中插入配件
 *                  的功能都取消」→ network-editor.js 加 ISO_OFF = true，
 *                  **轴测视图下施工编辑卡整体收起**（注释原文：平面视图的功能与行为完全不变）
 *   2026-10-02     本脚本按上述事实重定基：旧「整体下线 / 硬开关无效 / 无 #cnPanelCard /
 *                  无 g.cn-layer / 无「管网装配」标题」五类断言**全部过期**（旧契约已被
 *                  7fd59cc + v179 取代），改为 v179 现状契约。
 *
 * v179 现状契约（本脚本盯的就是这 6 条）：
 *   A 注入保留 —— network-editor.css/js 仍被引用、RyNetEditor 已注入；
 *   B 无平面数据不启用 —— 加载后 isActive()=false、getNet()=null、卡片不在视口；
 *   C 有数据即自动启用 —— 2026-09-15「两个视图都能直接操作」既有行为（不是本轮的错）；
 *   D 轴测视图收口 —— #cnPanelCard 自身 display:none（ISO_OFF）、不绑就地入口（点击不弹 #cnPop）、
 *      但**叠加层照旧绘制**（g.cn-layer=1，v179「只关入口不关显示」）；
 *   E 平面视图在用 —— 卡片挂 #tlSide、display≠none、显示摘要与「退出」（已启用态）；
 *   F 可编程开关干净 —— disable() → active=false + 叠加层移除；enable()/toggle() 可恢复；
 *      exportClean / tlExportSvgString 无编辑层痕迹；原平面数据零改动；无 pageerror。
 * 另有引擎契约：RyNetModel fromPlan / deserialize 往返语义等价、主方案保存加载往返。
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
    '--user-data-dir=' + path.join(OUT, 'profile_neteditor_v179'),
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
  const URL = fileUrl(path.join(WS, 'index.html'));
  await page.goto(URL, { waitUntil: 'load', timeout: 90000 });
  await sleep(1000);
  /* ★ 先清存储再 reload：profile 目录跨次复用，上一轮的存档会让「无数据」前提失真
     （旧脚本在断言之后才 clear，属既有隐患）。 */
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload({ waitUntil: 'load', timeout: 90000 });
  await sleep(1200);

  /* ---- A/B：模块保留；无平面数据不启用、卡片不在视口 ---- */
  const boot = await page.evaluate(() => {
    const cn = document.getElementById('cnPanelCard');
    const r = cn ? cn.getBoundingClientRect() : null;
    return {
      editor: typeof window.RyNetEditor,
      model: typeof window.RyNetModel,
      css: [...document.querySelectorAll('link[rel="stylesheet"]')].some((l) => /network-editor\.css/.test(l.href)),
      js: [...document.querySelectorAll('script[src]')].some((s) => /network-editor\.js/.test(s.src)),
      active: window.RyNetEditor ? window.RyNetEditor.isActive() : null,
      net: window.RyNetEditor ? window.RyNetEditor.getNet() : 'no-api',
      hasData: !!window.tlDiagramData,
      cardVisible: !!cn && getComputedStyle(cn).display !== 'none' && !!r && r.height > 0
    };
  });
  check('A 保留：RyNetEditor 已注入（模块未摘除）', boot.editor === 'object', String(boot.editor));
  check('A 保留：network-editor.css / .js 仍被引用', boot.css && boot.js);
  check('A 保留：RyNetModel 引擎在', boot.model === 'object', String(boot.model));
  check('B 无数据：未自动启用（isActive()=false）', boot.active === false && boot.hasData === false,
    'active=' + boot.active + ' hasData=' + boot.hasData);
  check('B 无数据：无模型实例（getNet()=null）', boot.net === null, String(boot.net));
  check('B 无数据：卡片不在视口（宿主栏未展开 → rect 高 0）', boot.cardVisible === false);

  /* ---- 准备：注入平面数据 + 渲染轴测 + 切到轴测视图 ---- */
  await page.evaluate((data) => {
    window.tlDiagramData = JSON.parse(JSON.stringify(data));
    window.__planSnapshot = JSON.stringify(window.tlDiagramData);
    localStorage.setItem('__v179_plan_snap', window.__planSnapshot);
    const ctn = document.getElementById('tlIsoDiagramContent');
    window.RyIsoDiagram.render(ctn, window.tlDiagramData);
    if (typeof rySetTab === 'function') { try { rySetTab('tlPipePlanSection', 'iso'); } catch (e) {} }
  }, DATA);
  await sleep(1000);
  await page.evaluate(() => { if (typeof rySetTab === 'function') { try { rySetTab('tlPipePlanSection', 'iso'); } catch (e) {} } });
  await sleep(600);

  /* ---- C/D：有数据即自动启用；轴测视图收口（卡片收起 + 入口不绑 + 层照画） ---- */
  const iso = await page.evaluate(() => {
    const E = window.RyNetEditor;
    const cn = document.getElementById('cnPanelCard');
    const aside = document.getElementById('tlIsoSide');
    const atxt = aside ? aside.innerText : '';
    const svg = document.querySelector('#tlIsoDiagramContent svg');
    let popAfterClick = null;
    if (svg) {
      const r = svg.getBoundingClientRect();
      svg.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
      svg.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
      popAfterClick = !!document.getElementById('cnPop');
    }
    return {
      view: E.view(), active: E.isActive(), net: E.getNet() ? 'model' : 'null',
      cnExists: !!cn, cnDisp: cn ? getComputedStyle(cn).display : null,
      cnParent: cn && cn.parentElement ? cn.parentElement.id : null,
      cnTxt: cn ? cn.innerText.replace(/\s+/g, ' ').slice(0, 40) : '',
      layer: document.querySelectorAll('#tlIsoDiagramContent g.cn-layer').length,
      hover: document.querySelectorAll('g.cn-hover').length,
      pop: !!document.getElementById('cnPop'), popAfterClick: popAfterClick,
      hasSvg: !!svg,
      pipeCardShown: !!aside && [...aside.querySelectorAll('.tl-iso-pipe-card')].some((c) => getComputedStyle(c).display !== 'none'),
      pipeCardHint: /三级管路编辑/.test(atxt),
      insertFitTxt: /插入配件/.test(atxt)
    };
  });
  check('C 现状：有平面数据即自动启用（active=true、getNet() 有模型）',
    iso.active === true && iso.net === 'model', 'active=' + iso.active + ' net=' + iso.net);
  check('C 现状：自动挂载发生在轴测视图（view=iso）', iso.view === 'iso', iso.view);
  check('D 收口：轴测视图下 #cnPanelCard 自身 display:none（ISO_OFF）',
    iso.cnExists && iso.cnDisp === 'none', 'cnDisp=' + iso.cnDisp + ' parent=' + iso.cnParent);
  check('D 收口：卡片内容为轴测态标题（不可见）', /管网装配（轴测图）/.test(iso.cnTxt), iso.cnTxt);
  check('D 收口：轴测图不绑就地入口 —— 点击/双击图面不弹 #cnPop',
    iso.hasSvg && !iso.pop && iso.popAfterClick === false,
    'hasSvg=' + iso.hasSvg + ' pop=' + iso.pop + ' afterClick=' + iso.popAfterClick);
  check('D 保留：叠加层照旧绘制（v179「只关入口不关显示」，iso svg 内 g.cn-layer=1）',
    iso.layer === 1, 'n=' + iso.layer);
  check('D 保留：无残留悬停层 g.cn-hover', iso.hover === 0, 'n=' + iso.hover);
  check('D 保留：轴测左栏「插入管线」卡可见且指路三级管路编辑',
    iso.pipeCardShown && iso.pipeCardHint, 'shown=' + iso.pipeCardShown + ' hint=' + iso.pipeCardHint);
  check('D 收口：轴测左栏不得出现「插入配件」（v179 主诉求）', !iso.insertFitTxt);

  /* ---- E：平面视图在用（v179 注释：平面视图的功能与行为完全不变） ---- */
  await page.evaluate(() => { if (typeof rySetTab === 'function') { try { rySetTab('tlPipePlanSection', 'pipe'); } catch (e) {} } });
  await sleep(900);
  const plan = await page.evaluate(() => {
    const E = window.RyNetEditor;
    const cn = document.getElementById('cnPanelCard');
    const txt = document.body.innerText;
    return {
      view: E.view(), active: E.isActive(),
      cnExists: !!cn, cnDisp: cn ? getComputedStyle(cn).display : null,
      cnParent: cn && cn.parentElement ? cn.parentElement.id : null,
      cnTxt: cn ? cn.innerText.replace(/\s+/g, ' ') : '',
      hover: document.querySelectorAll('g.cn-hover').length,
      wOld: /施工管网编辑/.test(txt),
      wMove: /沿管轴移动/.test(txt),
      wAnchor: /基准端/.test(txt),
      wPath: /沿线统计 · \d+ 段 · 合计/.test(txt),   /* 只禁「统计面板本体」，不禁提示语里的字样 */
      /* 「待确认明细」不再是要禁的旧面板文案 —— 它是**已启用卡片内部**的合法 disclosure。
         故改为归属校验：该文案的**最上层载体**必须落在 #cnPanelCard 内，不得外溢成独立面板。 */
      pendingOutside: (() => {
        const all = [...document.body.querySelectorAll('*')].filter((el) => /待确认明细/.test(el.textContent || ''));
        return all.filter((el) => !(el.parentElement && /待确认明细/.test(el.parentElement.textContent || ''))
          && !cn.contains(el)).length;
      })()
    };
  });
  check('E 在用：平面视图下卡片挂 #tlSide（非收起的轴测栏）',
    plan.cnExists && plan.cnParent === 'tlSide', 'parent=' + plan.cnParent);
  check('E 在用：平面视图下卡片 display≠none（ISO_OFF 只作用于轴测）',
    plan.cnDisp !== 'none', 'cnDisp=' + plan.cnDisp + ' view=' + plan.view);
  check('E 在用：卡片为已启用态（含「退出」且标题为平面图）',
    /管网装配（平面图）/.test(plan.cnTxt) && /退出/.test(plan.cnTxt), plan.cnTxt.slice(0, 60));
  check('E 在用：卡片显示施工摘要（配件 / 管段 / 总长）',
    /配件\s*\d+/.test(plan.cnTxt) && /管段\s*\d+/.test(plan.cnTxt) && /总长/.test(plan.cnTxt));
  check('E 哨兵：未选中任何管段时不得出现尺寸编辑 UI（沿管轴移动 / 基准端）',
    !plan.wMove && !plan.wAnchor, [plan.wMove && '沿管轴移动', plan.wAnchor && '基准端'].filter(Boolean).join(','));
  check('E 反向：旧标题「施工管网编辑」不得复活（原「待确认明细」已改归属校验）',
    !plan.wOld, plan.wOld ? '施工管网编辑' : '');
  check('E 归属：「待确认明细」只在 #cnPanelCard 内（不得外溢为独立面板）',
    plan.pendingOutside === 0, 'outside=' + plan.pendingOutside);
  check('E 哨兵：未选路径时不得出现「沿线统计」面板本体', !plan.wPath);
  check('E 保留：无残留悬停层 g.cn-hover', plan.hover === 0, 'n=' + plan.hover);

  /* ---- F：可编程开关干净（硬开关已死；改为「可编程且干净」） ---- */
  await page.evaluate(() => { if (typeof rySetTab === 'function') { try { rySetTab('tlPipePlanSection', 'iso'); } catch (e) {} } });
  await sleep(800);
  const sw = await page.evaluate(() => {
    const E = window.RyNetEditor;
    const cn = () => document.getElementById('cnPanelCard');
    const layer = () => document.querySelectorAll('#tlIsoDiagramContent g.cn-layer').length;
    const out = { before: { active: E.isActive(), layer: layer() } };
    try { E.disable(); } catch (e) { out.disErr = String(e); }
    out.afterDisable = {
      active: E.isActive(), layer: layer(),
      cnDisp: cn() ? getComputedStyle(cn()).display : null,
      cnTxt: cn() ? cn().innerText.replace(/\s+/g, ' ').slice(0, 40) : ''
    };
    try { E.enable(); } catch (e) { out.enErr = String(e); }
    out.afterEnable = { active: E.isActive(), layer: layer() };
    try { E.toggle(); } catch (e) { out.tgErr1 = String(e); }
    out.afterToggle1 = E.isActive();
    try { E.toggle(); } catch (e) { out.tgErr2 = String(e); }
    out.afterToggle2 = E.isActive();
    try { E.refresh(); } catch (e) { out.rfErr = String(e); }
    out.refreshOk = true;
    return out;
  });
  check('F 开关：disable() 生效 —— active=false 且叠加层被移除（layer=0）',
    sw.afterDisable.active === false && sw.afterDisable.layer === 0,
    'active=' + sw.afterDisable.active + ' layer=' + sw.afterDisable.layer);
  check('F 开关：disable() 后卡片回到未启用态（轴测视图仍 display:none）',
    sw.afterDisable.cnDisp === 'none' && /启用/.test(sw.afterDisable.cnTxt) && !/退出/.test(sw.afterDisable.cnTxt),
    'cnDisp=' + sw.afterDisable.cnDisp + ' txt=' + sw.afterDisable.cnTxt);
  check('F 开关：enable() 可恢复（active=true、叠加层重绘 layer=1）',
    sw.afterEnable.active === true && sw.afterEnable.layer === 1,
    'active=' + sw.afterEnable.active + ' layer=' + sw.afterEnable.layer);
  check('F 开关：toggle() 两次回到原态，refresh() 不抛错',
    sw.afterToggle1 === false && sw.afterToggle2 === true && sw.refreshOk === true && !sw.disErr && !sw.enErr && !sw.rfErr,
    JSON.stringify([sw.tgErr1, sw.tgErr2, sw.disErr, sw.enErr, sw.rfErr].filter(Boolean)));

  /* ---- 导出干净（exportClean 摘层后序列化） ---- */
  const exp = await page.evaluate(() => {
    const ctn = document.getElementById('tlIsoDiagramContent');
    const s = (typeof tlExportSvgString === 'function') ? tlExportSvgString(ctn) : '';
    const active = window.RyNetEditor.isActive();
    return { active: active, hasSvg: s.indexOf('<svg') >= 0, clean: s.indexOf('cn-layer') < 0 && s.indexOf('cn-hover') < 0 };
  });
  check('导出：active 态下 tlExportSvgString 仍无编辑层痕迹（exportClean 生效）',
    exp.hasSvg && exp.clean, 'active=' + exp.active);

  /* ---- 引擎保留（RyNetModel 仍可建模） ---- */
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

  /* ---- 主方案保存/加载往返（编辑器挂载不再是「保存后不挂卡」） ---- */
  const saved = await page.evaluate(() => {
    try { runyeSaveProject(); return { ok: true }; } catch (e) { return { ok: false, err: String(e) }; }
  });
  check('保存：runyeSaveProject 正常（不会因编辑器挂载而失败）', saved.ok, saved.err || '');
  await page.reload({ waitUntil: 'load', timeout: 90000 });
  await sleep(1200);
  const loadedBack = await page.evaluate(() => {
    try {
      if (typeof runyeLoadProject === 'function') runyeLoadProject();
      return { ok: true, hasData: !!window.tlDiagramData, active: window.RyNetEditor.isActive() };
    } catch (e) { return { ok: false, err: String(e) }; }
  });
  check('加载：runyeLoadProject 正常（数据恢复；编辑器挂载与否不限，以无报错为准）',
    loadedBack.ok && loadedBack.hasData, loadedBack.err || '');

  /* ---- 收尾 ---- */
  const planOk = await page.evaluate(() => {
    const snap = localStorage.getItem('__v179_plan_snap');
    localStorage.removeItem('__v179_plan_snap');
    return snap !== null && JSON.stringify(window.tlDiagramData) === snap;
  });
  check('原平面数据零改动', planOk);
  check('无页面报错', errs.length === 0, errs.join(' | ').slice(0, 200));

  await browser.close();
  proc.kill();
  console.log('\n== 结论：PASS=' + pass + ' FAIL=' + fail + ' ==');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('SMOKE CRASH:', e.message + '\n' + (e.stack || '').split('\n').slice(0, 6).join('\n')); process.exit(2); });
