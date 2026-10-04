/* _p1/_shot_v210_edit_move_view.cjs · [v210] 管路拼装页 复制 / 旋转 / 移动 + 四视图切换 验证
 *
 * 用户原话：「管路拼装中增加复制、旋转及移动功能，同时增加前视图 侧视图 窗口切换。」
 *
 * ★ 纪律（v201 教训 10）：**合成数据 ≠ 真实路径**。本脚本所有变更都走真实入口：
 *     复制   = 真点工具条按钮 / 真按 Ctrl+D / 真点右键菜单里的「复制该管件」
 *     旋转   = 真点 ↻ 按钮 / 真按 R（Shift+R 反向）/ 真点右键菜单里的「旋转 90°」
 *     移动   = 真按方向键（Shift 加速）/ 真按 ✥ 开关 / 真实 drop 落件看吸不吸附
 *     切视图 = 真点四段控件里的那个按钮
 *   只有「断言取值」用只读 getter（getComps/getConns/portPosOf/getView），不改一字节状态。
 *
 * 断言清单：
 *   ① 基线：载入示例 5 件 4 接、无错位缝
 *   ② 复制：按钮 / Ctrl+D / 右键菜单三条入口都能复制；口径·管长·朝向全部继承；
 *           错开落位（不能原地重合）；**复制体不继承连接**
 *   ③ 旋转：按钮 / R / Shift+R / 右键菜单四条入口；绕左端 L 口转（L 口不动、R 口转过去）；
 *           转完下游重新排齐（无缝）、连接数不变、水力结果不变（纯几何操作）
 *   ④ 移动：方向键 ±1px / Shift ±10px；整串跟着走；自由移动模式 开=不吸附、关=吸附
 *   ⑤ 四视图：四个按钮都能切且高亮同步；切换**不动数据**（坐标/管长/口径/连接/ΔH 一字不改）；
 *           前视压缩 Y、侧视压缩 X（按 cos70°≈0.342，用端口渲染坐标验证）；非俯视下旋转同样生效
 *   ⑥ 全程无 JS 报错
 */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');
const killTree = require('./_edge_kill.cjs');

const WS = 'C:\\Users\\AHS\\runye-irrigation';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = path.join(WS, '_verify_out');
const PORT = parseInt(process.env.PA_PORT || '9544', 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileUrl = (p) => 'file:///' + encodeURI(p.replace(/\\/g, '/'));

let pass = 0, fail = 0;
const check = (n, ok, extra) => { console.log((ok ? '  [PASS] ' : '  [FAIL] ') + n + (extra ? ' :: ' + extra : '')); ok ? pass++ : fail++; };
const near0 = (v) => Math.abs(v) < 0.6;

const PAGE = process.env.PA_PAGE || '管路接驳拼装.html';
const TAG = process.env.PA_TAG || '';
/* [v210] 分段运行：注入体检只跑与缺陷相关的那一段（PA_ONLY='3'），
   不必每次都把 52 条断言全跑一遍 —— 全量跑在"被改坏"的页面上偶发 CDP 挂住，
   段与段之间彼此独立（每段自己 reset + 载入示例），所以分段结果等价于全量结果。 */
const ONLY = (process.env.PA_ONLY || '').split(',').filter(Boolean);
const run = (k) => !ONLY.length || ONLY.indexOf(k) >= 0;
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const proc = spawn(EDGE, [
    '--headless=new', '--allow-file-access-from-files', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(OUT, 'profile_v210' + TAG), '--no-first-run', '--no-default-browser-check',
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
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.setViewport({ width: 1500, height: 950 });
  await page.goto(fileUrl(path.join(WS, PAGE)), { waitUntil: 'load', timeout: 90000 });
  await sleep(1000);
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) { } });
  await page.reload({ waitUntil: 'load' });
  await sleep(1200);

  const R = (fn, ...a) => page.evaluate(fn, ...a);
  const getComps = () => R(() => window.RyPipeAssembler.getComps());
  const getConns = () => R(() => window.RyPipeAssembler.getConns());
  const byId = (list, id) => list.filter((c) => c.id === id)[0];
  const planToClient = (x, y) => R((px, py) => {
    const svg = document.getElementById('paSvg'), vp = document.getElementById('paVp');
    const p = svg.createSVGPoint(); p.x = px; p.y = py;
    const q = p.matrixTransform(vp.getScreenCTM());
    return { x: q.x, y: q.y };
  }, x, y);
  const maxGap = async () => {
    const r = await R(() => {
      const API = window.RyPipeAssembler;
      return API.getConns().map((k) => {
        const A = API.portPosOf(k.a.id, k.a.side), B = API.portPosOf(k.b.id, k.b.side);
        return Math.hypot(A.x - B.x, A.y - B.y);
      });
    });
    return r.length ? Math.max.apply(null, r) : 0;
  };
  /* 端口渲染坐标（viewport 坐标，不含 zoom）—— 用来验证「视图压缩」与「旋转真的画出来了」 */
  const portScreen = () => R(() => {
    const out = {};
    document.querySelectorAll('#paSvg .pa-port').forEach((c) => {
      out[c.getAttribute('data-id') + ':' + c.getAttribute('data-side')] =
        { x: +c.getAttribute('cx'), y: +c.getAttribute('cy') };
    });
    return out;
  });
  /* 组件内部的 <line>（pipeLine 画出的管身）：验证**管身**确实跟着 rot 转。
     端口圆走 portPos（不经 PR）⇒ ③g 拦不住「端口转了、管身没转」，必须量管身。 */
  const compLines = (id) => R((cid) => {
    const g = document.querySelector('#paSvg .pa-comp[data-id="' + cid + '"]');
    if (!g) return null;
    return Array.prototype.slice.call(g.querySelectorAll('line')).map((l) => ({
      x1: +l.getAttribute('x1'), y1: +l.getAttribute('y1'),
      x2: +l.getAttribute('x2'), y2: +l.getAttribute('y2')
    }));
  }, id);
  const menuVisible = () => R(() => {
    const m = document.getElementById('paMenu');
    return { show: m.classList.contains('show'), disp: getComputedStyle(m).display, id: m.getAttribute('data-id') };
  });
  const clickMenuItem = (sel, val) => page.evaluate((s, v) => {
    const el = Array.prototype.slice.call(document.querySelectorAll(s))
      .filter((c) => (v == null || c.getAttribute('data-val') === v))[0];
    if (!el) return false;
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return true;
  }, sel, val);
  const menuItems = () => R(() => Array.prototype.slice.call(
    document.querySelectorAll('#paMenu [data-act]')).map((e) => e.getAttribute('data-act') + ':' + (e.getAttribute('data-val') || '')));
  const dropLib = (kind, planX, planY) => page.evaluate((k, px, py) => {
    const svg = document.getElementById('paSvg'), vp = document.getElementById('paVp');
    const p = svg.createSVGPoint(); p.x = px; p.y = py;
    const q = p.matrixTransform(vp.getScreenCTM());
    const dt = new DataTransfer(); dt.setData('text/pa', k);
    document.getElementById('paWrap').dispatchEvent(new DragEvent('drop',
      { clientX: q.x, clientY: q.y, dataTransfer: dt, bubbles: true, cancelable: true }));
  }, kind, planX, planY);
  /* 左键点中某件（选中它）。
     ★ 直管：取**渲染出来的两个端口圆的连线中点** —— 投影 P 是仿射变换（中点仍是中点），
       所以在**任意视图 + 任意旋转角**下这一点都精确落在管身上；
       若按规划坐标 + 固定偏移取点，前视/侧视下会整体点偏（实测 ⑤l0 点空 ⇒ 后续断言全假红），
       旋转后偏移方向也会失效（实测 ③i 假红：rot=90 的弯头，+30px 处早已不在管身上）。
     ★ 弯头等折线件：中点不在管身上（L 形），仍用「L 口 +30px」这一处（仅在俯视下用）。 */
  const compHitPoint = async (c) => {
    if (c.kind === 'straight') {
      return await R((cid) => {
        const cs = Array.prototype.slice.call(document.querySelectorAll('#paSvg .pa-port'))
          .filter(function (e) { return e.getAttribute('data-id') === cid; });
        if (cs.length < 2) return null;
        let sx = 0, sy = 0;
        cs.forEach(function (e) { sx += +e.getAttribute('cx'); sy += +e.getAttribute('cy'); });
        const svg = document.getElementById('paSvg'), vp = document.getElementById('paVp');
        const p = svg.createSVGPoint(); p.x = sx / cs.length; p.y = sy / cs.length;
        const r = p.matrixTransform(vp.getScreenCTM());
        return { x: r.x, y: r.y };
      }, c.id);
    }
    return await planToClient(c.x + 30, c.y);
  };
  const clickComp = async (c) => {
    const p = await compHitPoint(c); if (!p) return false;
    await page.mouse.click(p.x, p.y);
    await sleep(220); return true;
  };
  const rightClickComp = async (c) => {
    const p = await compHitPoint(c); if (!p) return false;
    await page.mouse.click(p.x, p.y, { button: 'right' });
    await sleep(300); return true;
  };
  const reset = async () => {
    await page.reload({ waitUntil: 'load' });
    await sleep(900);
    await page.click('#btnExample');
    await sleep(450);
  };
  const snap = async () => {
    const cs = await getComps();
    return JSON.stringify(cs.map((c) => [c.id, c.x, c.y, c.len, c.dn, c.rot || 0,
      c.bigDn || 0, c.smallDn || 0, c.mainDn || 0, c.branchDn || 0]));
  };

  /* ================= ① 基线 ================= */
  console.log('\n=== ① 基线：载入示例管路 ===');
  await page.click('#btnExample');
  await sleep(450);
  let comps = await getComps(), conns = await getConns();
  const s1 = comps[0], e1 = comps[1], s2 = comps[2], rd = comps[3], s3 = comps[4];
  check('①a 示例 5 管件 / 4 连接', comps.length === 5 && conns.length === 4, comps.length + '件 ' + conns.length + '接');
  check('①b 基线无错位缝', near0(await maxGap()), 'maxGap=' + (await maxGap()).toFixed(3));
  check('①c 默认视图 = 俯视 plan 且高亮在俯视上', await R(() => {
    const on = document.querySelector('#segView .vw.on');
    return window.RyPipeAssembler.getView() === 'plan' && on && on.getAttribute('data-view') === 'plan';
  }));

  /* ================= ② 复制 ================= */
  if (run('2')) {
  console.log('\n=== ② 复制（工具条按钮 / Ctrl+D / 右键菜单 三条入口）===');
  await reset();   /* [v210] 分段运行时也要有干净的示例管路 */
  comps = await getComps(); conns = await getConns();
  const z1 = comps[0];
  check('②0 点中 s1 并选中', (await clickComp(z1)) && await R(() => window.RyPipeAssembler.getSel()) === z1.id);
  const n0 = comps.length, k0 = conns.length;
  await page.click('#btnDup');
  await sleep(350);
  comps = await getComps(); conns = await getConns();
  const d1 = comps[comps.length - 1];
  check('②a 工具条「⧉ 复制」新增一件', comps.length === n0 + 1, comps.length + ' 件');
  check('②b 复制体继承 类型/口径/管长', d1.kind === z1.kind && d1.dn === z1.dn && d1.len === z1.len,
    JSON.stringify({ kind: d1.kind, dn: d1.dn, len: d1.len }));
  check('②c 复制体错开落位（不在原地重合，否则抓不到也看不出）',
    d1.x === z1.x + 36 && d1.y === z1.y + 36, '(' + d1.x + ',' + d1.y + ') vs (' + z1.x + ',' + z1.y + ')');
  check('②d 复制体**不继承连接**（否则两件共用一条连接，删一个会弄乱另一个）',
    conns.length === k0 && conns.filter((k) => k.a.id === d1.id || k.b.id === d1.id).length === 0,
    'conns=' + conns.length);
  check('②e 复制后自动选中新件（可以接着按 Ctrl+D 再复制）', await R(() => window.RyPipeAssembler.getSel()) === d1.id);

  await page.keyboard.down('Control'); await page.keyboard.press('KeyD'); await page.keyboard.up('Control');
  await sleep(350);
  comps = await getComps(); conns = await getConns();
  const d2 = comps[comps.length - 1];
  check('②f Ctrl+D 快捷键复制生效', comps.length === n0 + 2 && d2.id !== d1.id, comps.length + ' 件');
  check('②g Ctrl+D 复制的是**当前选中件**（d1 的属性被完整带走）',
    d2.kind === d1.kind && d2.dn === d1.dn && d2.len === d1.len && d2.x === d1.x + 36 && d2.y === d1.y + 36,
    JSON.stringify({ x: d2.x, y: d2.y, dn: d2.dn, len: d2.len }));

  await rightClickComp(d2);
  const mv2 = await menuVisible();
  check('②h 右键菜单弹出且锁定 d2', mv2.show && mv2.id === d2.id, JSON.stringify(mv2));
  const hasDup = (await menuItems()).indexOf('dup:') >= 0;
  check('②i 右键菜单里有「复制该管件」', hasDup, (await menuItems()).join(' | '));
  const dupClick = await clickMenuItem('#paMenu .pa-menu-i[data-act="dup"]', null);
  check('②i2 菜单项可点击', dupClick === true);
  await sleep(350);
  comps = await getComps();
  check('②j 右键菜单复制生效', comps.length === n0 + 3, comps.length + ' 件');
  await page.screenshot({ path: path.join(OUT, 'pa_v210_dup.png') });
  } /* end ② */

  /* ================= ③ 旋转 ================= */
  if (run('3')) {
  console.log('\n=== ③ 旋转（按钮 / R / Shift+R / 右键菜单 四条入口）===');
  await reset();
  comps = await getComps(); conns = await getConns();
  /* ★ ③h/③i 用**直管**（comps[2]）而不是弯头：直管的命中点取「两端口连线中点」，旋转后仍然
       精确落在管身上；弯头是 L 形，旋转 90° 后 L 口 +30px 处已经不在管身上 ⇒ 点空 ⇒ 假红。 */
  let a1 = comps[0], a2 = comps[2];
  const rL0 = await R((id) => window.RyPipeAssembler.portPosOf(id, 'L'), a1.id);
  const tot0 = await R(() => document.getElementById('rTot').textContent);
  await clickComp(a1);
  await page.click('#btnRot');
  await sleep(400);
  comps = await getComps(); conns = await getConns();
  const rot1 = byId(comps, a1.id).rot;
  check('③a 工具条「↻ 旋转」把 rot 从 0 转到 90', rot1 === 90, 'rot=' + rot1);
  const rL1 = await R((id) => window.RyPipeAssembler.portPosOf(id, 'L'), a1.id);
  check('③b 绕**左端 L 口**旋转：L 口原地不动', Math.abs(rL1.x - rL0.x) < 0.001 && Math.abs(rL1.y - rL0.y) < 0.001,
    JSON.stringify(rL0) + ' → ' + JSON.stringify(rL1));
  const rR1 = await R((id) => window.RyPipeAssembler.portPosOf(id, 'R'), a1.id);
  const Lpx = byId(comps, a1.id).len * 12;
  check('③c R 口转到 L 口正下方 len·12px 处（局部 (L,0) 转 90° ⇒ (0,L)）',
    Math.abs(rR1.x - rL1.x) < 0.001 && Math.abs((rR1.y - rL1.y) - Lpx) < 0.001,
    'Δ=(' + (rR1.x - rL1.x).toFixed(2) + ',' + (rR1.y - rL1.y).toFixed(2) + ') 期望 (0,' + Lpx + ')');
  check('③d 旋转后下游重新排齐，接口无错位缝', near0(await maxGap()), 'maxGap=' + (await maxGap()).toFixed(3));
  check('③e 旋转不动连接数', conns.length === 4, 'conns=' + conns.length);
  check('③f 旋转是纯几何操作：水力结果一字不变',
    (await R(() => document.getElementById('rTot').textContent)) === tot0, 'ΔH=' + tot0);
  const ps1 = await portScreen();
  check('③g 旋转在**画面上**也生效（不是只改了数据）',
    Math.abs(ps1[a1.id + ':R'].y - ps1[a1.id + ':L'].y - Lpx) < 0.001,
    JSON.stringify(ps1[a1.id + ':R']) + ' / ' + JSON.stringify(ps1[a1.id + ':L']));
  /* ★ ③g2 与 ③g 的分工：端口圆走 portPos（不过 PR），管身才走 PR()。
     只验端口会漏掉「端口转了、管身没转」这种缺陷 —— 所以必须再量一次管身线段。 */
  const lines1 = await compLines(a1.id);
  const main1 = (lines1 || []).reduce((acc, b) => !acc ? b :
    (Math.hypot(b.x2 - b.x1, b.y2 - b.y1) > Math.hypot(acc.x2 - acc.x1, acc.y2 - acc.y1) ? b : acc), null);
  check('③g2 管身线段跟着转（rot 应用到画法：竖直、长 ' + Lpx + 'px）',
    !!main1 && Math.abs(main1.x2 - main1.x1) < 0.01 && Math.abs(Math.abs(main1.y2 - main1.y1) - Lpx) < 0.01,
    JSON.stringify(main1));

  /* ★ 每一步都要**重新取** a2 的坐标：旋转会触发 cascadeAlign 重新排齐下游，
     拿上一次的坐标去点就会点空 ⇒ 没选中 ⇒ 快捷键看起来"失效"（实测 ③h/③i 假红）。 */
  comps = await getComps(); a2 = byId(comps, a2.id);
  await clickComp(a2);
  await page.keyboard.press('KeyR');
  await sleep(350);
  comps = await getComps();
  check('③h R 快捷键旋转生效', byId(comps, a2.id).rot === 90, 'rot=' + byId(comps, a2.id).rot);
  comps = await getComps(); a2 = byId(comps, a2.id);
  await clickComp(a2);
  await page.keyboard.down('Shift'); await page.keyboard.press('KeyR'); await page.keyboard.up('Shift');
  await sleep(350);
  comps = await getComps();
  check('③i Shift+R 反向旋转（90 → 0）', byId(comps, a2.id).rot === 0, 'rot=' + byId(comps, a2.id).rot);

  const a3 = (await getComps())[4];
  await rightClickComp(a3);
  const hasRot = (await menuItems()).indexOf('rot:') >= 0;
  check('③j 右键菜单里有「旋转 90°」', hasRot, (await menuItems()).join(' | '));
  await clickMenuItem('#paMenu .pa-menu-i[data-act="rot"]', null);
  await sleep(350);
  comps = await getComps();
  check('③k 右键菜单旋转生效', byId(comps, a3.id).rot === 90, 'rot=' + byId(comps, a3.id).rot);
  check('③l 三次旋转之后整条链依然无缝', near0(await maxGap()), 'maxGap=' + (await maxGap()).toFixed(3));
  await page.screenshot({ path: path.join(OUT, 'pa_v210_rot.png') });
  } /* end ③ */

  /* ================= ④ 移动 ================= */
  if (run('4')) {
  console.log('\n=== ④ 移动（方向键微调 / 整串联动 / 自由移动模式）===');
  await reset();
  comps = await getComps(); conns = await getConns();
  let b1 = comps[0];
  const pos0 = JSON.stringify((await getComps()).map((c) => [c.x, c.y]));
  await clickComp(b1);
  for (let i = 0; i < 5; i++) { await page.keyboard.press('ArrowRight'); await sleep(60); }
  await sleep(700);   /* 等历史去抖落地 */
  comps = await getComps();
  const dxAll = comps.map((c, i) => c.x - JSON.parse(pos0)[i][0]);
  check('④a 方向键 → 每次 1px（按 5 次 = +5px）', byId(comps, b1.id).x === b1.x + 5, 'x: ' + b1.x + ' → ' + byId(comps, b1.id).x);
  check('④b 整串跟着一起走（不会把已接好的接口拉开）',
    dxAll.every((d) => Math.abs(d - 5) < 0.001) && comps.every((c, i) => c.y === JSON.parse(pos0)[i][1]),
    JSON.stringify(dxAll));
  check('④c 移动后仍无错位缝', near0(await maxGap()), 'maxGap=' + (await maxGap()).toFixed(3));
  await page.keyboard.down('Shift'); await page.keyboard.press('ArrowDown'); await page.keyboard.up('Shift');
  await sleep(700);
  comps = await getComps();
  check('④d Shift+方向键 = 10px/次', byId(comps, b1.id).y === b1.y + 10, 'y: ' + b1.y + ' → ' + byId(comps, b1.id).y);

  /* 自由移动模式：开 = 拖入/拖动都不吸附；关 = 恢复吸附 */
  await dropLib('straight', 900, 620);
  await sleep(300);
  comps = await getComps();
  const fa = comps[comps.length - 1];
  const faR = { x: fa.x + fa.len * 12, y: fa.y };
  const k1 = (await getConns()).length;
  await page.click('#btnMove');
  await sleep(250);
  check('④e 「✥ 移动」开关已打开（S.moveMode=true 且按钮高亮）', await R(() => {
    const b = document.getElementById('btnMove');
    return window.RyPipeAssembler.getMoveMode() === true && b.classList.contains('primary');
  }));
  await dropLib('elbow90', faR.x + 12, faR.y + 9);
  await sleep(350);
  comps = await getComps(); conns = await getConns();
  const fb = comps[comps.length - 1];
  check('④f 自由移动模式下：新件落在端口 15px 旁也**不吸附**',
    conns.length === k1 && conns.filter((k) => k.a.id === fb.id || k.b.id === fb.id).length === 0,
    'conns=' + conns.length + '（应仍为 ' + k1 + '）');
  check('④g 且落点就是鼠标位置，没被拽去对位', fb.x === faR.x + 12 && fb.y === faR.y + 9,
    '(' + fb.x + ',' + fb.y + ')');
  /* 删掉它，再关掉开关做正对照（同一个落点，这次必须吸上） */
  await clickComp(fb);
  await page.keyboard.press('Delete');
  await sleep(350);
  await page.click('#btnMove');
  await sleep(250);
  check('④h 开关已关闭', await R(() => window.RyPipeAssembler.getMoveMode() === false));
  await dropLib('elbow90', faR.x + 12, faR.y + 9);
  await sleep(350);
  comps = await getComps(); conns = await getConns();
  const fc = comps[comps.length - 1];
  check('④i 正对照：关掉自由移动后同一落点**必须吸附**（证明 ④f 不是"本来就连不上"）',
    conns.filter((k) => k.a.id === fc.id || k.b.id === fc.id).length === 1,
    JSON.stringify(conns.filter((k) => k.a.id === fc.id || k.b.id === fc.id)));
  check('④j 吸附后被精确对位到端口上', Math.abs(fc.x - faR.x) < 0.001 && Math.abs(fc.y - faR.y) < 0.001,
    '(' + fc.x + ',' + fc.y + ') 期望 (' + faR.x + ',' + faR.y + ')');
  await page.click('#btnFit');   /* fa/fc 落在初始视野外，适应一下再截图 */
  await sleep(400);
  await page.screenshot({ path: path.join(OUT, 'pa_v210_move.png') });
  } /* end ④ */

  /* ================= ⑤ 四视图切换 ================= */
  if (run('5')) {
  console.log('\n=== ⑤ 四视图切换（俯视 / 前视 / 侧视 / 轴测）===');
  await reset();
  let b1 = (await getComps())[0];
  const data0 = await snap();
  const conns0 = (await getConns()).length;
  const totV0 = await R(() => document.getElementById('rTot').textContent);
  const viewBtns = await R(() => Array.prototype.slice.call(
    document.querySelectorAll('#segView .vw')).map((b) => b.getAttribute('data-view')));
  check('⑤a 视图控件有且只有四段：plan/front/side/iso',
    JSON.stringify(viewBtns) === JSON.stringify(['plan', 'front', 'side', 'iso']), JSON.stringify(viewBtns));

  const clickView = async (v) => {
    await page.evaluate((vv) => {
      const b = document.querySelector('#segView .vw[data-view="' + vv + '"]'); b.click();
    }, v);
    await sleep(450);
  };
  const viewState = () => R(() => {
    const on = document.querySelector('#segView .vw.on');
    return { v: window.RyPipeAssembler.getView(), on: on ? on.getAttribute('data-view') : null,
      nOn: document.querySelectorAll('#segView .vw.on').length };
  });

  await clickView('front');
  let vs = await viewState();
  check('⑤b 点「前视」⇒ S.view=front 且**只有**前视那一段高亮',
    vs.v === 'front' && vs.on === 'front' && vs.nOn === 1, JSON.stringify(vs));
  await clickView('side');
  vs = await viewState();
  check('⑤c 点「侧视」⇒ 切换与高亮同步', vs.v === 'side' && vs.on === 'side' && vs.nOn === 1, JSON.stringify(vs));
  await clickView('iso');
  vs = await viewState();
  check('⑤d 点「轴测」⇒ 切换与高亮同步', vs.v === 'iso' && vs.on === 'iso' && vs.nOn === 1, JSON.stringify(vs));
  await clickView('plan');
  vs = await viewState();
  check('⑤e 点「俯视」⇒ 切回默认视图', vs.v === 'plan' && vs.on === 'plan' && vs.nOn === 1, JSON.stringify(vs));

  /* 数据零改动：四个视图来回切，组件几何/连接/水力一字不变 */
  for (const v of ['front', 'side', 'iso', 'plan']) { await clickView(v); }
  check('⑤f 四视图来回切换，组件几何（坐标/管长/口径/朝向）一字未改', (await snap()) === data0);
  check('⑤g 连接数不变', (await getConns()).length === conns0);
  check('⑤h 水力结果不变（ΔH ' + totV0 + '）',
    (await R(() => document.getElementById('rTot').textContent)) === totV0);

  /* 前视压缩 Y、侧视压缩 X：用**渲染出来的端口坐标**验证（画法层面的真证据）。
     ★ 基准值不写死 64：弯头画廓尺寸以后还会调（v211 已从 64 缩到 40），
       先在俯视下量出 Δ 作为基准，再对比前/侧视的压缩量 —— 自校准，改尺寸不用改脚本。 */
  const c1 = (await getComps())[1];           // elbow90：L 与 R 口
  const K = Math.cos(70 * Math.PI / 180);     // ≈0.342
  const dOf = async () => {
    const ps = await portScreen();
    const L = ps[c1.id + ':L'], Rp = ps[c1.id + ':R'];
    return { dx: Rp.x - L.x, dy: Rp.y - L.y };
  };
  await clickView('plan');
  const dPlan = await dOf();
  await clickView('front');
  const dFront = await dOf();
  await clickView('side');
  const dSide = await dOf();
  check('⑤i 俯视：Δx===Δy（弯头两条直角边等长，基准不失真）',
    Math.abs(dPlan.dx - dPlan.dy) < 0.01 && dPlan.dx > 10, JSON.stringify(dPlan) + ' A=' + dPlan.dx);
  check('⑤j 前视：**纵向按 cos70° 压缩**（Δy≈' + (dPlan.dy * K).toFixed(1) + '，Δx 不变）',
    Math.abs(dFront.dy - dPlan.dy * K) < 0.6 && Math.abs(dFront.dx - dPlan.dx) < 0.01, JSON.stringify(dFront));
  check('⑤k 侧视：**横向按 cos70° 压缩**（Δx≈' + (dPlan.dx * K).toFixed(1) + '，Δy 不变）',
    Math.abs(dSide.dx - dPlan.dx * K) < 0.6 && Math.abs(dSide.dy - dPlan.dy) < 0.01, JSON.stringify(dSide));

  /* 非俯视视图下旋转同样生效（画法统一入口 PR() 的判别样本） */
  await clickView('front');
  comps = await getComps(); b1 = byId(comps, b1.id);      /* 同样要重取坐标（⑤ 之前已 reset 过） */
  await clickComp(b1);
  check('⑤l0 前视下能点中并选中首段直管', await R(() => window.RyPipeAssembler.getSel()) === b1.id,
    'sel=' + (await R(() => window.RyPipeAssembler.getSel())) + ' / b1=' + b1.id);
  const beforeRot = await portScreen();
  await page.click('#btnRot');
  await sleep(400);
  comps = await getComps();
  const afterRot = await portScreen();
  check('⑤l 前视下旋转：数据层 rot=90 且 R 口转到 L 口正下方',
    byId(comps, b1.id).rot === 90 &&
    Math.abs((afterRot[b1.id + ':R'].y - afterRot[b1.id + ':L'].y) - b1.len * 12 * K) < 0.6,
    'rot=' + byId(comps, b1.id).rot + ' Δy=' + (afterRot[b1.id + ':R'].y - afterRot[b1.id + ':L'].y).toFixed(2));
  check('⑤m 前视下旋转在画面上可见（R 口渲染位置确实变了）',
    Math.abs(afterRot[b1.id + ':R'].y - beforeRot[b1.id + ':R'].y) > 1,
    beforeRot[b1.id + ':R'].y.toFixed(2) + ' → ' + afterRot[b1.id + ':R'].y.toFixed(2));
  await page.screenshot({ path: path.join(OUT, 'pa_v210_views.png') });
  await clickView('plan');
  } /* end ⑤ */

  /* ================= ⑥ 无报错 ================= */
  console.log('\n=== ⑥ 全程无 JS 报错 ===');
  check('⑥ 无 pageerror / console.error', errs.length === 0, errs.slice(0, 3).join(' || '));

  console.log('\n=== 汇总：' + pass + ' 通过 / ' + fail + ' 失败 ===');
  console.log('结果：PASS=' + pass + '  FAIL=' + fail);
  await browser.disconnect();
  killTree(proc.pid);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => {
  console.error('运行异常：', e && e.stack || e);
  /* ★ [v208 教训 J3/J4] 异常退出**必须**把 Edge 进程树杀干净 —— 不然孤儿 renderer
     累积会拖垮机器，后续所有用例全部 ProtocolError 超时（本轮注入体检实测复现）。 */
  try { if (proc && proc.pid) killTree(proc.pid); } catch (e2) { }
  process.exit(1);
});
