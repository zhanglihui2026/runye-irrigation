/* _p1/_shot_v203_pa_style.cjs · [v203] 管路接驳拼装页风格统一 验证
 * 用户原话：「页面风格跟其他页面统一，两侧工具栏文字大小这些都跟其他页面统一。」
 * 验证：① 顶部 fn-nav 注入且「管路拼装」自动高亮（与其他页同源导航）；
 *       ② 关键 token 与主站侧栏口径一致（pane-h 11px、item 名 11.5px、输入框 24px/11.5px、
 *          按钮 24px、表头浅绿 #f2f7f4）；③ 功能不回归（载入示例 → 水力/材料/状态正常）；
 *       ④ 无 JS 报错；⑤ 截图。
 */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const puppeteer = require('./_pptr.cjs');   /* [v213] 统一兜底入口：批跑环境常缺 NODE_PATH */
const killTree = require('./_edge_kill.cjs');

const WS = 'C:\\Users\\AHS\\runye-irrigation';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = path.join(WS, '_verify_out');
const PORT = 9529;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileUrl = (p) => 'file:///' + encodeURI(p.replace(/\\/g, '/'));

let pass = 0, fail = 0;
const check = (n, ok, extra) => { console.log((ok ? '  [PASS] ' : '  [FAIL] ') + n + (extra ? ' :: ' + extra : '')); ok ? pass++ : fail++; };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const proc = spawn(EDGE, [
    '--headless=new', '--allow-file-access-from-files', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(OUT, 'profile_v203'), '--no-first-run', '--no-default-browser-check',
    '--window-size=1500,950', 'about:blank'
  ], { stdio: 'ignore' });
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
  await page.goto(fileUrl(path.join(WS, '管路接驳拼装.html')), { waitUntil: 'load', timeout: 90000 });
  await sleep(1200);
  /* ★ 必须先清库并重载：本脚本复用同一个 Edge profile，上一次跑出的面板宽度/视图
     会留在 localStorage 里，导致「默认 236/340」的基准断言被上一次结果顶掉（实测 ⑱ 假红）。 */
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) { } });
  await page.reload({ waitUntil: 'load' });
  await sleep(1500);

  /* ① 导航同源 */
  const nav = await page.evaluate(() => {
    const links = Array.prototype.slice.call(document.querySelectorAll('.fn-nav .fn-link'));
    const act = links.filter((a) => a.classList.contains('active')).map((a) => a.textContent);
    return { count: links.length, labels: links.map((a) => a.textContent), act };
  });
  check('① 顶部导航由 runye-nav.js 注入（与其他页同一份清单）', nav.count >= 12, 'n=' + nav.count);
  check('② 「管路拼装」自动高亮', nav.act.indexOf('管路拼装') >= 0, JSON.stringify(nav.act));

  /* ② 样式 token 与主站口径一致 */
  const st = await page.evaluate(() => {
    const gs = (sel, prop) => { const e = document.querySelector(sel); return e ? getComputedStyle(e)[prop] : null; };
    return {
      paneH: gs('.pa-pane-h', 'fontSize'),
      paneHColor: gs('.pa-pane-h', 'color'),
      itemName: gs('.pa-item .nm', 'fontSize'),
      itemDs: gs('.pa-item .ds', 'fontSize'),
      btnH: gs('.pa-toolbar .pa-btn', 'height'),
      btnFs: gs('.pa-toolbar .pa-btn', 'fontSize'),
      inputH: gs('.pa-field input', 'height'),
      inputFs: gs('.pa-field input', 'fontSize'),
      leftBg: gs('.pa-left', 'backgroundImage'),
      thBg: gs('.pa-mat th', 'backgroundColor'),
      thColor: gs('.pa-mat th', 'color'),
      kvFs: gs('.pa-kv', 'fontSize')
    };
  });
  check('③ 分组标题 11px + 主站绿 #2f6d43', st.paneH === '11px' && st.paneHColor === 'rgb(47, 109, 67)', JSON.stringify({ f: st.paneH, c: st.paneHColor }));
  check('④ 素材名 11.5px / 说明 10.5px（原 13/11）', st.itemName === '11.5px' && st.itemDs === '10.5px', JSON.stringify({ nm: st.itemName, ds: st.itemDs }));
  /* [v212] 「⚡ 载入示例管路」挪到左侧素材库顶部（做成 28px 大按钮），画布工具条按钮仍是 24px。
     断言目标必须是 .pa-toolbar 里的按钮 —— 裸 .pa-btn 现在先命中左栏那个大按钮（假红）。 */
  check('⑤ 画布工具条按钮高 24px / 11.5px（原约 33px/13px）', st.btnH === '24px' && st.btnFs === '11.5px', JSON.stringify({ h: st.btnH, f: st.btnFs }));
  check('⑥ 输入框高 24px / 11.5px（原约 35px/13px）', st.inputH === '24px' && st.inputFs === '11.5px', JSON.stringify({ h: st.inputH, f: st.inputFs }));
  check('⑦ 侧栏底 = 主站浅绿渐变（rgb 形式断言）', /248, 251, 249/.test(st.leftBg || '') && /242, 247, 244/.test(st.leftBg || ''), (st.leftBg || '').slice(0, 90));
  check('⑧ 表头浅绿 #f2f7f4 + 字 #475569（原实心绿底白字）', st.thBg === 'rgb(242, 247, 244)' && st.thColor === 'rgb(71, 85, 105)', JSON.stringify({ bg: st.thBg, c: st.thColor }));
  check('⑨ 键值行 ≤11.5px（标题条已撤，无 pa-sub 断言）', parseFloat(st.kvFs) <= 11.5, JSON.stringify({ kv: st.kvFs }));
  const hdr = await page.evaluate(() => ({
    headerGone: !document.querySelector('.pa-header'),
    statusInToolbar: !!(document.querySelector('.pa-toolbar #paStatus')),
    statusTxt: (document.getElementById('paStatusTxt') || {}).textContent || ''
  }));
  check('⑨b 品牌标题条已整行撤掉（v204）', hdr.headerGone);
  check('⑨c 状态徽标在画布工具条里（id 不变，JS 零改动）', hdr.statusInToolbar && hdr.statusTxt.length > 0, hdr.statusTxt);

  /* ===== [v205] 左右栏宽度可拖拽 ===== */
  const g = await page.evaluate(() => ({
    l: !!document.getElementById('paGripL'), r: !!document.getElementById('paGripR'),
    cursor: getComputedStyle(document.getElementById('paGripL')).cursor,
    cols: getComputedStyle(document.querySelector('.pa-main')).gridTemplateColumns
  }));
  check('⑮ 两条拖拽条存在 + col-resize 光标', g.l && g.r && g.cursor === 'col-resize', JSON.stringify(g).slice(0, 120));
  const w0 = await page.evaluate(() => document.querySelector('.pa-left').getBoundingClientRect().width);
  const gl = await page.$('#paGripL');
  const gb = await gl.boundingBox();
  await page.mouse.move(gb.x + gb.width / 2, gb.y + 300);
  await page.mouse.down();
  await page.mouse.move(gb.x + gb.width / 2 + 80, gb.y + 300, { steps: 6 });
  await page.mouse.up();
  await sleep(300);
  const w1 = await page.evaluate(() => ({
    left: document.querySelector('.pa-left').getBoundingClientRect().width,
    saved: JSON.parse(localStorage.getItem('runye_pa_panel_w') || '{}').left
  }));
  check('⑯ 左拖 +80px：列宽跟手（236→约316）', Math.abs(w1.left - (w0 + 80)) < 3, 'w=' + w1.left.toFixed(1));
  check('⑰ 松手落库（runye_pa_panel_w.left）', Math.abs((w1.saved || 0) - (w0 + 80)) < 3, 'saved=' + w1.saved);
  const gr = await page.$('#paGripR');
  const grb = await gr.boundingBox();
  await page.mouse.move(grb.x + grb.width / 2, grb.y + 300);
  await page.mouse.down();
  await page.mouse.move(grb.x + grb.width / 2 - 60, grb.y + 300, { steps: 6 });
  await page.mouse.up();
  await sleep(300);
  const w2 = await page.evaluate(() => document.querySelector('.pa-right').getBoundingClientRect().width);
  check('⑱ 右拖 -60px：右栏变宽（340→约400）', Math.abs(w2 - 400) < 3, 'w=' + w2.toFixed(1));
  await page.evaluate(() => document.getElementById('paGripL').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
  await sleep(200);
  const w3 = await page.evaluate(() => ({
    left: document.querySelector('.pa-left').getBoundingClientRect().width,
    saved: JSON.parse(localStorage.getItem('runye_pa_panel_w') || '{}')
  }));
  check('⑲ 双击左拖拽条恢复默认 236px 且落库项删除', Math.abs(w3.left - 236) < 2 && w3.saved.left === undefined, 'w=' + w3.left.toFixed(1) + ' saved=' + JSON.stringify(w3.saved));

  /* ③ 功能不回归 */
  await page.evaluate(() => document.getElementById('btnExample').click());
  await sleep(700);
  const plan = await page.evaluate(() => ({
    view: window.RyPipeAssembler ? null : null,
    tot: document.getElementById('rTot').textContent,
    mat: (document.getElementById('matTable').querySelector('tbody').textContent || '').slice(0, 40),
    view: window.RyPipeAssembler.getView()
  }));
  const fn = await page.evaluate(() => ({
    comps: document.querySelectorAll('#paSvg .pa-comp').length,
    tot: document.getElementById('rTot').textContent,
    mat: (document.getElementById('matTable').querySelector('tbody').textContent || '').slice(0, 40),
    status: document.getElementById('paStatusTxt').textContent,
    zoom: document.getElementById('paZoomTxt').textContent
  }));
  check('⑩ 载入示例仍出图（5 个管件）', fn.comps === 5, 'comps=' + fn.comps);
  check('⑪ 水力合计有数值', /^\d+(\.\d+)? m$/.test(fn.tot), 'ΔH=' + fn.tot);
  check('⑫ 材料清单有行', fn.mat.indexOf('直管') >= 0, fn.mat);
  check('⑬ 头部状态正常', fn.status.length > 0, fn.status);

  /* ===== [v206] 轴测图切换 ===== */
  const before = await page.evaluate(() => ({
    planFirst: (window.RyPipeAssembler.getTopology().components[0] || {}),
    n: window.RyPipeAssembler.getTopology().components.length,
    tot: document.getElementById('rTot').textContent
  }));
  await page.evaluate(() => window.RyPipeAssembler.setView('iso'));
  await sleep(700);
  const iso = await page.evaluate(() => {
    const svgEl = document.getElementById('paSvg');
    const comps = svgEl.querySelectorAll('.pa-comp');
    const first = comps[0] ? comps[0].getBoundingClientRect() : null;
    const t = window.RyPipeAssembler.getTopology();
    const on = document.querySelector('#segView .vw.on');
    return {
      view: window.RyPipeAssembler.getView(),
      onView: on ? on.getAttribute('data-view') : null,
      hasGrid: svgEl.querySelectorAll('path[stroke="#cbd5e1"]').length > 0,
      ellipses: svgEl.querySelectorAll('ellipse').length,
      comps: comps.length,
      firstW: first ? Math.round(first.width) : 0,
      tot: document.getElementById('rTot').textContent
    };
  });
  /* [v210] 视图改为四段控件（俯视/前视/侧视/轴测）：断言「当前视图 = iso」且**高亮段也是 iso**
     （后者专门拦「状态变了、按钮没跟着亮」这种骗人的 UI） */
  check('⑳ 切到轴测：S.view=iso 且分段控件高亮在 iso 上', iso.view === 'iso' && iso.onView === 'iso',
    JSON.stringify({ v: iso.view, on: iso.onView }));
  /* 端面数 = Σ(每段折线 2 个端帽)：2直管+1直通+1弯头+1弯头+1三通支管+1堵头 = 7 段 ×2 = 14，
     其中 1 个堵头端帽是独立的 ellipse（非 isoStroke 生成）⇒ isoStroke 端帽 12 + 堵头 1 = 13。
     断言按「≥8 即为圆管画法生效」来写（平面图态 ellipse=0，足够区分）。 */
  check('㉑ 轴测底纹与圆管端面已画（网格 + 端面椭圆）', iso.hasGrid && iso.ellipses >= 8, 'ellipse=' + iso.ellipses);
  check('㉒ 组件数不变（只是换画法，不是重建）', iso.comps === 5, 'comps=' + iso.comps);
  check('㉓ 水力结果与平面视图一致（数据未变）', iso.tot === before.tot, 'plan=' + before.tot + ' iso=' + iso.tot);
  await page.screenshot({ path: path.join(OUT, 'pa_v206_iso.png') });
  await page.evaluate(() => window.RyPipeAssembler.setView('plan'));
  await sleep(500);
  const back = await page.evaluate(() => {
    const on = document.querySelector('#segView .vw.on');
    return {
      view: window.RyPipeAssembler.getView(),
      onView: on ? on.getAttribute('data-view') : null,
      hasGrid: document.querySelectorAll('#paSvg path[stroke="#cbd5e1"]').length > 0,
      tot: document.getElementById('rTot').textContent
    };
  });
  check('㉔ 切回俯视：视图与高亮都回到 plan、底纹消失、水力一致',
    back.view === 'plan' && back.onView === 'plan' && !back.hasGrid && back.tot === before.tot, JSON.stringify(back));

  check('⑭ 全程无 JS 报错', errs.length === 0, errs.join('|').slice(0, 160));

  await page.screenshot({ path: path.join(OUT, 'pa_v203_style.png') });
  console.log('[shot] _verify_out/pa_v203_style.png');

  console.log('\n==== v203 风格统一复现：PASS ' + pass + ' / FAIL ' + fail + ' ====');
  await browser.disconnect(); killTree(proc.pid);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('[FATAL]', e.message); process.exit(1); });
