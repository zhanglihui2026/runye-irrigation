/* _p1/_shot_v207_pa_ctxmenu.cjs · [v207] 管路拼装页 四项交互增强 验证
 * 用户原话：「点击管道右键可以直接选择直径，点击配件右键可以直接切换配件选型，
 *           管道改变直径之后 配件随之改变，配件到管道附近 要自动吸附，管道的长度 拖动可以自由调节。」
 *
 * ★ 纪律（v201 教训 10）：**合成数据 ≠ 真实路径**。本脚本所有变更都走真实入口：
 *     右键 = page.mouse.click(button:'right') → 真实 contextmenu 事件
 *     换选型 / 改管径 = 真实点击菜单里的那一项（菜单内容是页面自己构造的）
 *     拖入吸附 = 真实 drop 事件（DataTransfer 里塞 'text/pa'，与浏览器拖放同一条路径）
 *     调管长 = 真实按下 .pa-lenhandle 手柄拖动，不直接改内存里的 len
 *   只有「断言取值」用只读 getter（getComps/getConns/portPosOf），不改一字节状态。
 *
 * 断言清单：
 *   ① 右键管道 → 菜单弹出且列出 DN_LIST（当前口径打勾）
 *   ② 改管径 → 自身口径变，相邻配件随之变（e1/s2/变径大口 跟随）
 *   ③ 遇到同心变径 / 三通支管**停止扩散**（这条要能拦住「把有意保留的大小头拉平」）
 *   ④ 右键配件 → 菜单列出可选选型，点击后原位替换且原有连接一条不丢
 *   ⑤ 替换后整链重新排齐（所有连接两端端口几何重合，无错位缝）
 *   ⑥ 配件拖到管道口附近 → 自动吸附接驳 + **口径自动跟随**（原来 DN110 的配件吸上 DN75 的管子）
 *   ⑦ 负对照：落在离端口很远处 → 不接驳（防止"吸附半径失控乱粘"）
 *   ⑧ 右键本身不改变连接数（只是弹出菜单，不能顺手把东西连上）
 *   ⑨ 拖直管右端手柄 → 管长自由变化，下游整链跟着平移，且仍严格对接
 *   ⑩ 轴测图下手柄照常工作，拖完之后切回平面图数据一致
 *   ⑪ 全程无 JS 报错
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
const PORT = parseInt(process.env.PA_PORT || '9531', 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileUrl = (p) => 'file:///' + encodeURI(p.replace(/\\/g, '/'));

let pass = 0, fail = 0;
const check = (n, ok, extra) => { console.log((ok ? '  [PASS] ' : '  [FAIL] ') + n + (extra ? ' :: ' + extra : '')); ok ? pass++ : fail++; };
const near0 = (v) => Math.abs(v) < 0.6;

const PAGE = process.env.PA_PAGE || '管路接驳拼装.html';   /* [v207] 注入体检：指向被改坏的副本 */
const TAG = process.env.PA_TAG || '';                       /* 开 Edge profile 用，避免并发撞 profile */
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const proc = spawn(EDGE, [
    '--headless=new', '--allow-file-access-from-files', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(OUT, 'profile_v207' + TAG), '--no-first-run', '--no-default-browser-check',
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
  /* ★ 清库重载：复用同一 profile 时 localStorage 会跨次残留（v205/v206 实测 ⑱ 假红） */
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) { } });
  await page.reload({ waitUntil: 'load' });
  await sleep(1200);

  const R = (fn, ...a) => page.evaluate(fn, ...a);
  const getComps = () => R(() => window.RyPipeAssembler.getComps());
  const getConns = () => R(() => window.RyPipeAssembler.getConns());
  const byId = (list, id) => list.filter((c) => c.id === id)[0];
  /* 规划坐标 → 屏幕坐标（平面视图下 P 是恒等，直接用 viewport 的 CTM 即可） */
  const planToClient = (x, y) => R((px, py) => {
    const svg = document.getElementById('paSvg'), vp = document.getElementById('paVp');
    const p = svg.createSVGPoint(); p.x = px; p.y = py;
    const q = p.matrixTransform(vp.getScreenCTM());
    return { x: q.x, y: q.y };
  }, x, y);
  /* 所有连接两端的端口几何间隙最大值 —— 用页面自己的 portPosOf 算，
     渲染层也是按它画的 ⇒ 这里 ≈0 才说明画面上没有「接上了却错位」的缝 */
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
  const menuVisible = () => R(() => {
    const m = document.getElementById('paMenu');
    return { show: m.classList.contains('show'), disp: getComputedStyle(m).display, id: m.getAttribute('data-id') };
  });
  /* 点菜单项：找不到就**返回 false**，绝不抛异常 —— 否则一处缺陷会让整段脚本半途崩掉，
     后面的断言根本没机会执行（J8 注入体检实测：异常 ⇒ 后面的 ① 组一条都没跑）。 */
  const clickMenuItem = (sel, val) => page.evaluate((s, v) => {
    const el = Array.prototype.slice.call(document.querySelectorAll(s))
      .filter((c) => (v == null || c.getAttribute('data-val') === v))[0];
    if (!el) return false;
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return true;
  }, sel, val);
  const menuItems = () => R(() => Array.prototype.slice.call(
    document.querySelectorAll('#paMenu [data-act]')).map((e) => e.getAttribute('data-act') + ':' + (e.getAttribute('data-val') || '') + ':' + e.textContent.trim()));
  const dropLib = (kind, planX, planY) => page.evaluate((k, px, py) => {
    const svg = document.getElementById('paSvg'), vp = document.getElementById('paVp');
    const p = svg.createSVGPoint(); p.x = px; p.y = py;
    const q = p.matrixTransform(vp.getScreenCTM());
    const dt = new DataTransfer(); dt.setData('text/pa', k);
    document.getElementById('paWrap').dispatchEvent(new DragEvent('drop',
      { clientX: q.x, clientY: q.y, dataTransfer: dt, bubbles: true, cancelable: true }));
  }, kind, planX, planY);

  console.log('\n=== 基线：载入示例管路（110直管5m→110弯头→110直管3m→110×90变径→90直管6m）===');
  await page.click('#btnExample');
  await sleep(400);
  let comps = await getComps(), conns = await getConns();
  const s1 = comps[0], e1 = comps[1], s2 = comps[2], rd = comps[3], s3 = comps[4];
  check('基线 5 管件 / 4 连接', comps.length === 5 && conns.length === 4, comps.length + '件 ' + conns.length + '接');
  check('基线 revolver 无错位缝', near0(await maxGap()), 'maxGap=' + (await maxGap()).toFixed(3));
  const baseSnapshot = JSON.stringify({ c: comps, k: conns });

  console.log('\n=== ⑦ 负对照：落在远离一切端口的地方 ⇒ 不能自动接驳 ===');
  const before7 = (await getConns()).length;
  await dropLib('elbow90', 900, 620);
  await sleep(300);
  comps = await getComps(); conns = await getConns();
  check('⑦ 远处落点新增了管件但没接上', comps.length === 6 && conns.length === before7,
    comps.length + '件 ' + conns.length + '接（应有 6 件 / ' + before7 + ' 接）');

  console.log('\n=== ⑥ 配件拖到管道口附近 ⇒ 自动吸附 + 口径自动跟随 ===');
  /* 落在 s3（末段 DN90 直管）的**右端悬空口**旁 18px：这里只有 s3 一个候选，不会误吸到别的口 */
  const s3rX = s3.x + s3.len * 12, s3rY = s3.y;
  await dropLib('elbow90', s3rX + 14, s3rY + 11);
  await sleep(350);
  comps = await getComps(); conns = await getConns();
  const nb = comps[comps.length - 1];
  const nbConns = conns.filter((k) => k.a.id === nb.id || k.b.id === nb.id);
  check('⑥a 新配件已自动接驳到管道口', nbConns.length === 1, JSON.stringify(nbConns.map((k) => k.a.id + '-' + k.b.id)));
  check('⑥b 落点被精确对齐到端口（不差像素）',
    nbConns.length === 1 && nb.kind === 'elbow90' && nb.x === s3rX && nb.y === s3rY,
    'new=(' + nb.x + ',' + nb.y + ') 期望=(' + s3rX + ',' + s3rY + ')');
  check('⑥c 配件口径自动跟随管道（库里默认 DN110，此处 piping 为 DN' + s3.dn + '）', nb.dn === s3.dn, 'dn=' + nb.dn);
  check('⑥d 接驳后仍无错位缝', near0(await maxGap()), 'maxGap=' + (await maxGap()).toFixed(3));

  console.log('\n=== ③b前哨：右键变径 ⇒ 大口/小口菜单，且单侧改口不好外扩散 ===');
  /* ★ 这一步同时是 J2 注入体检的**判别样本**：先把小口单独改成 DN50（比 s3 的 DN90 小），
     让变径下游处于「有意不一致」状态。若有人把「同心变径是扩散边界」这条规则拿掉，
     后面改 s1 就会顺手把 s3 / 新配件也拉到 DN50 ⇒ ③b/③c 立刻变红。
     （教训：样本必须能区分 —— 用全一致的数据测边界规则，绿得毫无信息量） */
  const rdMid = await planToClient(rd.x + 28, rd.y);
  await page.mouse.click(rdMid.x, rdMid.y, { button: 'right' });
  await sleep(300);
  const mv0 = await menuVisible();
  check('③0a 右键变径弹出菜单且锁定该件', mv0.show && mv0.id === rd.id, JSON.stringify(mv0));
  const rdActs = (await menuItems()).filter((t) => t.indexOf('bigdn:') === 0 || t.indexOf('smalldn:') === 0);
  check('③0b 变径菜单里给出大口 / 小口两档调节', rdActs.length === 14, rdActs.length + ' 项');
  const smClick = await clickMenuItem('#paMenu .pa-chip[data-act="smalldn"]', '50');
  check('③0b2 菜单里找到「小口=50」并完成点击', smClick === true);
  await sleep(350);
  comps = await getComps();
  check('③0c 小口已改为 DN50', byId(comps, rd.id).smallDn === 50, 'smallDn=' + byId(comps, rd.id).smallDn);
  check('③0d 单侧改口不扩散到下游（s3 仍 DN90）', byId(comps, s3.id).dn === 90, 's3 dn=' + byId(comps, s3.id).dn);

  console.log('\n=== ① 右键管道 ⇒ 弹出「管径」菜单 ===');
  /* 点在 s1 直管的中点上。注意：右键会先跑 svg.pointerdown → selectComp，再跑 contextmenu → openMenu */
  const midSS = await planToClient(s1.x + (s1.len * 12) / 2, s1.y);
  const connBeforeRight = (await getConns()).length;
  await page.mouse.click(midSS.x, midSS.y, { button: 'right' });
  await sleep(300);
  let mv = await menuVisible();
  check('①a 右键管道弹出菜单', mv.show && mv.disp !== 'none', JSON.stringify(mv));
  check('①b 菜单锁定的正是被点的那一件', mv.id === s1.id, 'menu=' + mv.id + ' / s1=' + s1.id);
  let items = await menuItems();
  const dnActs = items.filter((t) => t.indexOf('dn:') === 0);
  check('①c 菜单列出 DN_LIST 七档直径', dnActs.length === 7, dnActs.join(' | '));
  check('①d 当前口径（DN' + s1.dn + '）标为选中', (await R(() => {
    const el = document.querySelector('#paMenu .pa-chip.on'); return el ? el.getAttribute('data-val') : null;
  })) === String(s1.dn));
  check('①e 管道菜单里带「切换为管件」选型区', (await R(() =>
    Array.prototype.slice.call(document.querySelectorAll('#paMenu .pa-menu-t')).map((e) => e.textContent).join('|'))).indexOf('切换为管件') >= 0);
  check('⑧ 右键本身不改变任何连接', (await getConns()).length === connBeforeRight);
  await page.screenshot({ path: path.join(OUT, 'pa_v207_menu_pipe.png') });

  console.log('\n=== ②改径联动 / ③遇变径停止 ===');
  /* 点 DN75：预期 直管(自身) → 弯头 → 直管 → 变径**大口** 全部跟到 75；
     但变径的小口 50 与之后的 s3 必须**保持不动**（那里是有意保留的异径分界） */
  const connBeforeDn = (await getConns()).length;
  const dnClick = await clickMenuItem('#paMenu .pa-chip[data-act="dn"]', '75');
  check('②0 菜单里找到「DN75」并完成点击', dnClick === true);
  await sleep(400);
  comps = await getComps();
  const posBefore = JSON.stringify((await getComps()).map((c) => [c.x, c.y]));
  const g = (id) => byId(comps, id);
  const newNb = comps.filter((c) => c.id === nb.id)[0];
  check('②a 被点的管道口径 → DN75', g(s1.id).dn === 75, 'dn=' + g(s1.id).dn);
  check('②b 相邻配件随之改变（弯头 → 75）', g(e1.id).dn === 75, 'elbow dn=' + g(e1.id).dn);
  check('②c 隔一节的另一段直管也随之改变（→ 75）', g(s2.id).dn === 75, 's2 dn=' + g(s2.id).dn);
  check('②e 同心变径迎面侧（大口）跟随 → 75', g(rd.id).bigDn === 75, 'bigDn=' + g(rd.id).bigDn);
  check('③a 同心变径背侧（小口）**未被拉平**（保持刚设的 DN50）', g(rd.id).smallDn === 50, 'smallDn=' + g(rd.id).smallDn);
  check('③b 变径之后的支管也**未被改动**（仍 90）', g(s3.id).dn === 90, 's3 dn=' + g(s3.id).dn);
  check('③c 新吸附在变径之后的那个配件也未被改动（仍 DN' + s3.dn + '）', newNb.dn === s3.dn, 'nb dn=' + newNb.dn);
  check('②f 菜单点完自动关闭', (await menuVisible()).show === false);
  check('②g 改径只改口径、不动几何（坐标与连接数都不变）', (await getConns()).length === connBeforeDn &&
    JSON.stringify((await getComps()).map((c) => [c.x, c.y])) === posBefore, 'conns 应为 ' + connBeforeDn);

  console.log('\n=== ④右键配件 ⇒ 直接切换选型 / ⑤整链重新排齐 ===');
  const beforeIds = (await getComps()).map((c) => c.id);
  const connBefore4 = (await getConns()).length;
  const e1now = byId(await getComps(), e1.id);
  /* 落点自证：从**页面真实渲染出的线段**里挑一点，并且必须用 elementFromPoint 反查
     「这一点到底归谁」，确认属于目标组件才点。
     ★ 为什么不能按「L 口 + 固定偏移」算：直管的「调管长」手柄画在顶层图层上，
       就压在下游管件第一段管身上 —— 弯头从 64px 缩到 40px 后，L 口 +12px 恰好落在手柄的
       14×14 方块里 ⇒ 右键命中的是手柄而不是弯头（实测 ④a 全红）。 */
  const compClickPoint = (id) => R((cid) => {
    const g = document.querySelector('#paSvg .pa-comp[data-id="' + cid + '"]');
    if (!g) return null;
    const svg = document.getElementById('paSvg'), vp = document.getElementById('paVp');
    const segs = [];
    g.querySelectorAll('path[d]').forEach(function (p) {
      const m = (p.getAttribute('d') || '').match(/^M\s*(-?[\d.]+)[ ,](-?[\d.]+)\s*L\s*(-?[\d.]+)[ ,](-?[\d.]+)/);
      if (m) segs.push([+m[1], +m[2], +m[3], +m[4]]);
    });
    g.querySelectorAll('line').forEach(function (l) {
      segs.push([+l.getAttribute('x1'), +l.getAttribute('y1'), +l.getAttribute('x2'), +l.getAttribute('y2')]);
    });
    const out = [];
    segs.forEach(function (s) {
      if (s.some(function (n) { return !isFinite(n); })) return;
      if (Math.hypot(s[2] - s[0], s[3] - s[1]) < 8) return;
      [0.5, 0.65, 0.35, 0.8, 0.2].forEach(function (f) {
        const pt = svg.createSVGPoint();
        pt.x = s[0] + (s[2] - s[0]) * f; pt.y = s[1] + (s[3] - s[1]) * f;
        const q = pt.matrixTransform(vp.getScreenCTM());
        const hit = document.elementFromPoint(q.x, q.y);
        const owner = hit && hit.closest ? hit.closest('.pa-comp') : null;
        if (owner && owner.getAttribute('data-id') === cid) out.push({ x: q.x, y: q.y });
      });
    });
    return out.length ? out[0] : null;
  }, id);
  const elbowMid = await compClickPoint(e1.id);
  check('④0 找得到弯头管身上的可落点（自证：该点归属于弯头本体）', !!elbowMid, JSON.stringify(elbowMid));
  await page.mouse.click(elbowMid.x, elbowMid.y, { button: 'right' });
  await sleep(300);
  mv = await menuVisible();
  check('④a 右键配件弹出菜单且锁定该件', mv.show && mv.id === e1.id, JSON.stringify(mv));
  const kindActs = (await menuItems()).filter((t) => t.indexOf('kind:') === 0);
  check('④b 菜单列出其余选型供切换（应含直管与其它 6 种管件）', kindActs.length === 6, kindActs.join(' | '));
  await page.screenshot({ path: path.join(OUT, 'pa_v207_menu_fitting.png') });
  /* 换成三通：新件端口更多（L,R,B），原两条连接必须一条不丢，且下游要跟着重排 */
  const teeClick = await clickMenuItem('#paMenu .pa-menu-i[data-act="kind"]', 'tee');
  check('④b2 菜单里找到「异径三通」并完成点击', teeClick === true);
  await sleep(450);
  comps = await getComps(); conns = await getConns();
  const tee = comps.filter((c) => c.kind === 'tee')[0];
  check('④c 原弯头已消失、新三通顶替其位置', !byId(comps, e1.id) && !!tee, 'comps=' + comps.map((c) => c.kind).join(','));
  check('④d 连接数一条不丢（仍是 ' + connBefore4 + ' 条）', conns.length === connBefore4, 'conns=' + conns.length);
  /* ★ 健壮性（教训 19）：换选型失败时 tee 会不存在，这里必须退化成「断言失败」而不是抛异常 ——
       一处异常会让整条脚本半途崩，后面的断言全没机会执行，诊断信息大幅缩水。 */
  const teeId = tee ? tee.id : null;
  const teeConns = conns.filter((k) => teeId && (k.a.id === teeId || k.b.id === teeId));
  check('④e 三通的左右两个口都还接着原来那两段', teeConns.length === 2, JSON.stringify(teeConns.map((k) => k.a.side + '-' + k.b.side)));
  check('④f 三通口径沿用被替代弯头的（DN75 主管）', !!tee && tee.mainDn === 75, tee ? ('main=' + tee.mainDn + ' branch=' + tee.branchDn) : '三通未生成');
  const gap5 = await maxGap();
  check('⑤ 换选型后整链重新排齐（连接两端严格重合）', near0(gap5), 'maxGap=' + gap5.toFixed(3));
  const leftIds = comps.map((c) => c.id).sort().join(',');
  const wantIds = beforeIds.filter((i) => i !== e1.id).concat([teeId]).sort().join(',');
  check('④g 只换了被替换那一件，其余组件（含 ID）全部保留', leftIds === wantIds,
    leftIds + ' vs ' + wantIds);

  console.log('\n=== ⑨ 拖直管右端「⇔」手柄 ⇒ 自由调节管长 ===');
  const zoomNow = () => R(() => document.getElementById('paVp').getScreenCTM().a);
  const s1now = byId(await getComps(), s1.id);
  const len0 = s1now.len, x0Down = byId(await getComps(), s2.id).x;
  const handle = await page.$('.pa-lenhandle[data-id="' + s1.id + '"]');
  const hb = handle ? await handle.boundingBox() : null;
  check('⑨a 直管右端渲染出了调长手柄', !!hb, hb ? 'box=' + JSON.stringify({ x: Math.round(hb.x), y: Math.round(hb.y), w: Math.round(hb.width) }) : 'not found');
  check('⑨a2 手柄画在独立顶层图层 #paLenLayer 里（否则会被下游管件抢掉命中）',
    await R(() => { const h = document.querySelector('.pa-lenhandle'); return !!h && h.parentNode.id === 'paLenLayer'; }));
  let len1 = null, x1Down = null;
  if (hb) {
    /* 拖动量按**规划长度**给定（120 规划px = 10m），换算成屏幕像素 = ×zoom，与点击倍率无关 */
    const z = await zoomNow(), dpx = 120, wantM = dpx / 12;
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) { await page.mouse.move(hb.x + hb.width / 2 + dpx * z * i / 8, hb.y + hb.height / 2); await sleep(20); }
    await page.mouse.up();
    await sleep(350);
    comps = await getComps();
    len1 = byId(comps, s1.id).len; x1Down = byId(comps, s2.id).x;
    check('⑨b 沿轴向拖 ' + dpx + ' 规划px ⇒ 管长 +' + wantM + 'm（SCALE=12 px/m，zoom=' + z.toFixed(2) + '）',
      Math.abs((len1 - len0) - wantM) < 0.11, len0 + 'm → ' + len1 + 'm');
    check('⑨c 下游整链跟着平移同样的距离（接口不被拉开）', Math.abs((x1Down - x0Down) - dpx) < 0.6,
      x0Down + ' → ' + x1Down + '（Δ 应为 ' + dpx + '）');
    const gap9 = await maxGap();
    check('⑨d 拖完之后仍严格对接，无缝', near0(gap9), 'maxGap=' + gap9.toFixed(3));
    const mat = await R(() => document.querySelector('#matTable tbody').textContent);
    check('⑨e 材料表跟着更新（管长变了）', mat.indexOf('直管') >= 0, mat.slice(0, 60).replace(/\s+/g, ' '));
  }

  console.log('\n=== ⑩ 轴测视图下同样可用 ===');
  const preIso = JSON.stringify((await getComps()).map((c) => [c.id, c.x, c.y, c.len, c.dn]));
  await page.evaluate(() => window.RyPipeAssembler.setView('iso'));
  await sleep(500);
  const isoInfo = await R(() => {
    const on = document.querySelector('#segView .vw.on');
    return {
      handles: document.querySelectorAll('.pa-lenhandle').length,
      straights: window.RyPipeAssembler.getComps().filter((c) => c.kind === 'straight').length,
      view: window.RyPipeAssembler.getView(),
      onView: on ? on.getAttribute('data-view') : null
    };
  });
  check('⑩a 切到轴测图且每根直管都有手柄', isoInfo.view === 'iso' && isoInfo.onView === 'iso' && isoInfo.handles === isoInfo.straights,
    JSON.stringify(isoInfo));
  check('⑩a2 切视图不动数据（组件几何一字未改）',
    JSON.stringify((await getComps()).map((c) => [c.id, c.x, c.y, c.len, c.dn])) === preIso);
  const h2 = await page.$('.pa-lenhandle[data-id="' + s1.id + '"]');
  const h2b = h2 ? await h2.boundingBox() : null;
  if (h2b) {
    /* 轴测下管道沿 (cos30,sin30) 方向走 ⇒ 规划坐标 +dpx 对应屏幕位移 (dpx·cos30·z, dpx·sin30·z) */
    const z = await zoomNow(), A = Math.cos(Math.PI / 6), B = Math.sin(Math.PI / 6);
    const dpx = 60, wantM = dpx / 12;
    const lenA = byId(await getComps(), s1.id).len;
    await page.mouse.move(h2b.x + h2b.width / 2, h2b.y + h2b.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(h2b.x + h2b.width / 2 + dpx * A * z * i / 6, h2b.y + h2b.height / 2 + dpx * B * z * i / 6);
      await sleep(20);
    }
    await page.mouse.up();
    await sleep(350);
    const lenB = byId(await getComps(), s1.id).len;
    check('⑩b 轴测下沿轴向拖 ' + dpx + ' 规划px ⇒ 管长 +' + wantM + 'm（zoom=' + z.toFixed(2) + '）',
      Math.abs((lenB - lenA) - wantM) < 0.11, lenA + 'm → ' + lenB + 'm');
    const gap10 = await maxGap();
    check('⑩c 轴测下拖完仍严格对接', near0(gap10), 'maxGap=' + gap10.toFixed(3));
    await page.screenshot({ path: path.join(OUT, 'pa_v207_iso_len.png') });
  }
  await page.evaluate(() => window.RyPipeAssembler.setView('plan'));   /* 切回俯视 */
  await sleep(400);
  const planAgain = await R(() => window.RyPipeAssembler.getTopology());
  const connCount = (await getConns()).length;
  const backView = await R(() => window.RyPipeAssembler.getView());
  check('⑩d 切回俯视图后画布照常渲染且拓扑完整', !!planAgain && backView === 'plan' && connCount === (await getConns()).length,
    'view=' + backView + ' conns=' + connCount + ' comps=' + (planAgain.topo ? planAgain.topo.components.length : '?'));

  console.log('\n=== ⑪ 无 JS 报错 ===');
  check('⑪ 全程无 pageerror / console.error', errs.length === 0, errs.slice(0, 3).join(' || '));

  console.log('\n基线快照 vs 现状（应当确实被改动过）: ' + (baseSnapshot !== JSON.stringify({ c: await getComps(), k: await getConns() }) ? '已变更 ✓' : '⚠ 未变更'));
  console.log('\n=== 汇总：' + pass + ' 通过 / ' + fail + ' 失败 ===');
  await page.screenshot({ path: path.join(OUT, 'pa_v207_final.png') });
  try { await browser.disconnect(); } catch (e) { }
  killTree(proc.pid);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('EXCEPTION: ' + e.stack); process.exit(2); });
