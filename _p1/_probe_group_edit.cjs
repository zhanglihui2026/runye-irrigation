/* 二级管路页「成组地块 = 整组/逐块 分开编辑」· 真渲染验证（Edge/CDP）
 *
 * 用户原话（2026-10-03，第三次反馈后提的新需求）：
 *   「如果是成组地块传导到二级管路之后，进一步编辑的话，再给我一个切换按钮，
 *     这个单独编辑，跟三级管路编辑页面分开，否则我担心跟原来的一些计算规则
 *     跟逻辑搞混了，容易出错。」
 *
 * 用户拍板（两轮 AskUserQuestion）：
 *   ① 逐块单独编辑  ② 先不让成组地块进三级页  ③ 水力和材料各块完全独立
 *   ④ 旋转/镜像作用于整组  ⑤ 施工图出一张总图
 *
 * ★ 设计原则（本探针真正要守的东西）：
 *   **不写成组的“新算法”，而是让成组退化成“多次单块”** —— 逐块模式下
 *   ppState.polyPts 就是那一块自己的环，分区/布管/面积/材料/水力全部走
 *   现有单地块逻辑，一行都不改 ⇒ 结构上不可能与单块规则串味。
 *
 * 断言（全部针对**真实渲染产物 / 真实 UI 状态**，不查源码文本）：
 *   B0 反向对照：非成组地块时控件隐藏、三级页不拦（证明 B1/B8 不是恒绿）
 *   B1 成组时出现「整组 / 逐块」切换组
 *   B2 整组态：块级编辑按钮被禁用、总管按钮可见
 *   B3 逐块态：子地块下拉出现、块级按钮解禁、总管按钮隐藏
 *   B4 逐块态画布只画当前块（像素级：另一块必须与画布空白同色）
 *   B5 各块完全独立：块0 画的主管不会出现在块1，切回来还在
 *   B6 总管不进各块统计（画了总管，各块 mainPipes 不变）
 *   B7 旋转作用于整组：逐块态旋转，另一块的环也跟着转
 *   B8 成组地块进不了三级页（弹提示 + 不切过去）
 *   B9 施工图 = 一张总图：逐块态出图仍含全部成员环 + 总管层
 *
 * 铁律（headless-render-verify）：
 *   · 独立 --user-data-dir；spawn Edge + --remote-debugging-port + puppeteer.connect
 *   · --allow-file-access-from-files
 *
 * 用法：
 *   node _p1/_probe_group_edit.cjs              # 正常：全绿=0 / 有红=1
 *   node _p1/_probe_group_edit.cjs --inject 1   # ppGroupEditBlocks 恒放行 → B2 必须红
 *   node _p1/_probe_group_edit.cjs --inject 2   # 切块不存档旧块 → B5 必须红
 *   node _p1/_probe_group_edit.cjs --inject 3   # 施工图不换整组视图 → B9 必须红
 *   node _p1/_probe_group_edit.cjs --inject 4   # ppGetSubPlotRings 退回全环 → B4 必须红
 *   node _p1/_probe_group_edit.cjs --inject 5   # 去掉三级页拦截 → B8 必须红
 *   node _p1/_probe_group_edit.cjs --inject 6   # 旋转只转当前块 → B7 必须红
 *   node _p1/_probe_group_edit.cjs --inject 7   # 总管塞进 mainPipes → B6 必须红
 *   node _p1/_probe_group_edit.cjs --inject all
 *
 * 退出码（用户长期教训：新写的契约必须靠「注入缺陷 → 断言非零退出」来证）：
 *   正常：全绿 0 / 有红 1
 *   注入：被捕获 0 / 恒绿 1 / 锚点漂移 2
 */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');

const WS = 'C:\\Users\\AHS\\runye-irrigation';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = path.join(WS, '_verify_out');
const PORT = 9473;
const INJ = (() => {
  const i = process.argv.indexOf('--inject');
  if (i < 0) return 0;
  const v = process.argv[i + 1];
  return v === 'all' ? 99 : (parseInt(v, 10) || 0);
})();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileUrl = (p) => 'file:///' + p.replace(/\\/g, '/');
const SRC_HTML = path.join(WS, 'index.html');

/* ---- 注入：就地把 index.html 的字面锚点替换掉 ---- */
function makeInjectedCopy() {
  const s0 = fs.readFileSync(SRC_HTML, 'utf8');
  let s = s0;
  const applied = [];
  /* ★ 锚点里的换行必须写 \r?\n：index.html 经 git checkout 是 CRLF，
     字面 '\n' 会静默 0 命中 ⇒ 注入失效、体检假绿（实测踩过）。 */
  const sub1 = (anchor, rep, tag) => {
    const parts = anchor.replace(/\r/g, '').split('\n').map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const re = new RegExp(parts.join('\\r?\\n'));
    const cnt = (s.match(re) || []).length;
    if (cnt !== 1) { console.error('[inject] 锚点' + tag + ' 漂移：期望 1 处，实际 ' + cnt + ' :: ' + anchor.slice(0, 70)); process.exit(2); }
    s = s.replace(re, rep); applied.push(tag);
  };

  if (INJ === 1 || INJ === 99) {
    /* 整组态不再拦任何东西 ⇒ 块级按钮不会置灰、画布也拦不住 ⇒ B2 必须红
       [v194] 二级页已无总管模式 ⇒ 放行表里只剩 pickPipe */
    sub1("    return mode!=='pickPipe';",
      "    return false; // [inject 1] 整组态不再拦块级编辑", '1');
  }
  if (INJ === 2 || INJ === 99) {
    /* 切块时不把旧块的编辑结果存档 ⇒ 切走再切回，主管消失 ⇒ B5 必须红 */
    sub1("    if(ge.mode==='perPlot') ge.slots[ge.current]=ppCaptureSlot();   // 存档旧块",
      "    /* [inject 2] 切块不存档旧块 */", '2');
  }
  if (INJ === 3 || INJ === 99) {
    /* 施工图不再临时换整组视图 ⇒ 逐块态出图只有当前块 ⇒ B9 必须红 */
    sub1("    if(!(ge&&ge.active&&ge.mode==='perPlot'))return ppGenerateDiagramCore(options);",
      "    if(true)return ppGenerateDiagramCore(options); // [inject 3] 不换整组视图", '3');
  }
  if (INJ === 4 || INJ === 99) {
    /* ppGetSubPlotRings 退回「整组态全环」⇒ 逐块态画布仍画两块 ⇒ B4 必须红 */
    sub1("    var subs=ppGroupActiveSubs();\n    if(!subs||!subs.length)return null;",
      "    var subs=window.__runyeSubPlots; // [inject 4] 退回全环\n    if(!subs||!subs.length)return null;", '4');
  }
  if (INJ === 5 || INJ === 99) {
    /* 去掉 ryShowSection 里的三级页拦截 ⇒ B8 必须红
       （rySetTab / 导航处还有两道，这里只去掉 ryShowSection 那道，专门验 B8 这条断言） */
    sub1("    if(sec && sec.id==='tlPipePlanSection' && typeof ryGroupThirdLevelGuard==='function' && ryGroupThirdLevelGuard())return;",
      "    /* [inject 5] 去掉 ryShowSection 的三级拦截 */", '5');
  }
  if (INJ === 6 || INJ === 99) {
    /* 旋转只转当前块 ⇒ 另一块的环不跟着转 ⇒ B7 必须红 */
    sub1("    ge.slots.forEach(function(s){\n      if(Array.isArray(s.polyPts))s.polyPts=s.polyPts.map(fn);",
      "    ge.slots.forEach(function(s,si){\n      if(Array.isArray(s.polyPts)&&si===ge.current)s.polyPts=s.polyPts.map(fn); // [inject 6] 只转当前块", '6');
  }
  if (INJ === 7 || INJ === 99) {
    /* [v194] 二级页已不在 ppAddTrunkPipe 里落线，改注入**合并口径**本身：
       ppCollectGroupAllPipes 把总管也算进合并视图 ⇒ 总管混进整组统计 ⇒ B6 必须红。
       （B6 特意把 trunk 塞在「切回整组」之前，切整组才会跑这条合并路径。） */
    sub1("    });\n    return out;",
      "    });\n    (ge.trunkPipes||[]).forEach(function(l){out.main.push(l.map(function(p){return{x:p.x,y:p.y};}));}); // [inject 7] 总管混进合并视图\n    return out;", '7');
  }

  /* ⚠ 副本必须与 index.html 同目录：页面 css/js 是相对路径，放别处全 404。 */
  const p = path.join(WS, '_inj_grpedit.html');
  fs.writeFileSync(p, s, 'utf8');
  console.log('[inject] 已注入 ' + applied.join(' / ') + ' → ' + p);
  return p;
}

let pass = 0, fail = 0;
const check = (n, ok, extra) => {
  console.log((ok ? '  [PASS] ' : '  [FAIL] ') + n + (extra ? ' :: ' + extra : ''));
  ok ? pass++ : fail++;
};

/* ---------- 夹具：两块 300×400，中间 30m 缝（与 _probe_subplot_gap 同口径）---------- */
const FIX = {
  frame: [{ x: 0, y: 0 }, { x: 630, y: 0 }, { x: 630, y: 400 }, { x: 0, y: 400 }],
  rings: [
    [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 400 }, { x: 0, y: 400 }],
    [{ x: 330, y: 0 }, { x: 630, y: 0 }, { x: 630, y: 400 }, { x: 330, y: 400 }]
  ]
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const target = INJ ? makeInjectedCopy() : SRC_HTML;
  const proc = spawn(EDGE, [
    '--headless=new', '--allow-file-access-from-files',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(OUT, 'profile_grpedit'),
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
  page.on('pageerror', (e) => errs.push(e.message));
  /* 页面里的 alert/confirm 会阻塞 headless ⇒ 全程接管 */
  await page.evaluateOnNewDocument(() => {
    window.__alerts = [];
    window.alert = function (m) { window.__alerts.push(String(m)); };
    window.confirm = function () { return true; };
  });
  await page.setViewport({ width: 1500, height: 950 });
  await page.goto(fileUrl(target), { waitUntil: 'load', timeout: 90000 });
  await sleep(1500);
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload({ waitUntil: 'load' });
  await sleep(1500);

  await page.evaluate(() => {
    try { window.ryShowSection(document.getElementById('pipePlanSection'), null); } catch (e) {}
  });
  await sleep(900);
  const barOk = await page.evaluate(() => {
    const b = document.getElementById('ppToolbar');
    if (!b) return false;
    const r = b.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  if (!barOk) {
    console.error('\n[FATAL] 工具栏未排版 —— 进入二级管路页的方式失效。');
    try { await browser.disconnect(); } catch (e) {}
    try { proc.kill(); } catch (e) {}
    process.exit(2);
  }

  /* ---------- B0 反向对照：非成组地块 ----------
   * ★ 先证明「不是成组时一切如旧」—— 否则 B1「控件出现」和 B8「三级被拦」
   *   都可能是恒绿（用户教训：先问有没有反例能让断言变红）。 */
  console.log('\n— B0 反向对照：非成组地块应完全不受影响 —');
  const b0 = await page.evaluate(async () => {
    window.measuredPolygon = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }];
    window.measuredArea = 120000;
    window.measuredPolygonSource = 'area';
    window.__runyeSubPlots = null;
    if (typeof window.ppLoadPolygon === 'function') window.ppLoadPolygon();
    await new Promise((r) => setTimeout(r, 300));
    const wrap = document.getElementById('ppGroupEditWrap');
    /* 三级页：非成组必须能进（切过去后 tlPipePlanSection 带 ry-active） */
    window.__alerts = [];
    try { window.ryShowSection(document.getElementById('tlPipePlanSection'), null); } catch (e) {}
    await new Promise((r) => setTimeout(r, 300));
    const tlActive = document.getElementById('tlPipePlanSection').classList.contains('ry-active');
    try { window.ryShowSection(document.getElementById('pipePlanSection'), null); } catch (e) {}
    await new Promise((r) => setTimeout(r, 300));
    return {
      geNull: !window.__runyeGroupEdit,
      wrapShown: !!wrap && getComputedStyle(wrap).display !== 'none',
      tlActive: tlActive, alerts: window.__alerts.length
    };
  });
  console.log('        ' + JSON.stringify(b0));
  check('B0a 非成组：__runyeGroupEdit 为 null（成组状态机不介入）', b0.geNull === true);
  check('B0b 非成组：「整组/逐块」切换组隐藏', b0.wrapShown === false);
  check('B0c 非成组：三级页**能**进（不被拦）⇒ B8 的断言有反例、不是恒绿',
    b0.tlActive === true && b0.alerts === 0, 'active=' + b0.tlActive + ' alerts=' + b0.alerts);

  /* ---------- 装载成组地块 ---------- */
  await page.evaluate((FIX) => {
    window.measuredPolygon = FIX.frame.map((p) => ({ x: p.x, y: p.y }));
    window.measuredArea = 240000;
    window.measuredPolygonSource = 'map';
    window.__runyeSubPlots = FIX.rings.map(function (r, i) {
      return {
        id: 'sub' + (i + 1), name: '子地块' + (i + 1), mu: 180, sqm: 120000,
        crop: '七彩花生', polyLatLng: [], center: null,
        poly: r.map((q) => ({ x: q.x, y: q.y }))
      };
    });
    if (typeof window.ppLoadPolygon === 'function') window.ppLoadPolygon();
    if (typeof window.ppSetZoneAuto === 'function') window.ppSetZoneAuto(true);
    if (typeof window.ppRender === 'function') window.ppRender();
  }, FIX);
  await sleep(900);

  /* 页面内通用工具：模式 / 画布采样 / 画管线 */
  await page.evaluate(() => {
    window.__ge = {
      st: function () { return window.RunyeBridge.state; },
      ge: function () { return window.__runyeGroupEdit; },
      /* 世界坐标 → 画布 client 坐标 */
      toClient: function (mx, my) {
        const c = document.getElementById('ppCanvas');
        const r = c.getBoundingClientRect();
        const st = window.RunyeBridge.state, t = st.transform;
        return {
          x: r.left + (mx - t.minX) * t.scaleX * t.scale + t.offsetX + (st.panX || 0),
          y: r.top + (my - t.minY) * t.scaleY * t.scale + t.offsetY + (st.panY || 0)
        };
      },
      px: function (mx, my) {
        const c = document.getElementById('ppCanvas');
        const ctx = c.getContext('2d');
        const st = window.RunyeBridge.state, t = st.transform;
        const x = Math.round((mx - t.minX) * t.scaleX * t.scale + t.offsetX + (st.panX || 0));
        const y = Math.round((my - t.minY) * t.scaleY * t.scale + t.offsetY + (st.panY || 0));
        if (x < 0 || y < 0 || x >= c.width || y >= c.height) return null;
        const d = ctx.getImageData(x, y, 1, 1).data;
        return [d[0], d[1], d[2], d[3]];
      },
      bg: function () {
        const c = document.getElementById('ppCanvas');
        const d = c.getContext('2d').getImageData(4, 4, 1, 1).data;
        return [d[0], d[1], d[2]];
      },
      /* 走真实事件：mousedown/mouseup 落点 + dblclick 收线 */
      draw: function (wpts) {
        const c = document.getElementById('ppCanvas');
        const self = window.__ge;
        wpts.forEach(function (w) {
          const p = self.toClient(w.x, w.y);
          c.dispatchEvent(new MouseEvent('mousedown', { clientX: p.x, clientY: p.y, button: 0, bubbles: true }));
          c.dispatchEvent(new MouseEvent('mouseup', { clientX: p.x, clientY: p.y, button: 0, bubbles: true }));
        });
        const last = self.toClient(wpts[wpts.length - 1].x, wpts[wpts.length - 1].y);
        c.dispatchEvent(new MouseEvent('dblclick', { clientX: last.x, clientY: last.y, button: 0, bubbles: true }));
      },
      ctr: function (pts) {
        let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
        pts.forEach(function (p) { a = Math.min(a, p.x); b = Math.min(b, p.y); c = Math.max(c, p.x); d = Math.max(d, p.y); });
        return { cx: (a + c) / 2, cy: (b + d) / 2, minX: a, minY: b, maxX: c, maxY: d };
      }
    };
  });

  /* ---------- B1 切换控件出现 ---------- */
  console.log('\n— B1 成组编辑切换控件 —');
  const b1 = await page.evaluate(() => {
    const wrap = document.getElementById('ppGroupEditWrap');
    const sel = document.getElementById('ppGePlotSel');
    const ge = window.__runyeGroupEdit;
    return {
      shown: !!wrap && getComputedStyle(wrap).display !== 'none',
      opts: sel ? sel.querySelectorAll('option').length : -1,
      active: ge ? ge.mode : null, slots: ge ? ge.slots.length : -1,
      wholeActive: (document.getElementById('ppGeWhole') || {}).classList
        ? document.getElementById('ppGeWhole').classList.contains('active') : false
    };
  });
  console.log('        ' + JSON.stringify(b1));
  check('B1a 成组时出现「整组 / 逐块」切换组', b1.shown === true);
  check('B1b 默认停在「整组」', b1.active === 'whole' && b1.wholeActive === true, 'mode=' + b1.active);
  check('B1c 每个子地块一份编辑槽（2 块）', b1.slots === 2, 'slots=' + b1.slots);
  check('B1d 子地块下拉已填充 2 项', b1.opts === 2, 'options=' + b1.opts);

  /* ---------- B2 整组态：块级编辑被拦（[v194] 二级页不再有总管入口）---------- */
  console.log('\n— B2 整组态 = 总览（块级编辑禁用，二级页不再有总管入口）—');
  const b2 = await page.evaluate(() => {
    const q = (m) => document.querySelector('#ppToolbar .pp-btn[data-mode="' + m + '"]');
    /* ★ 只断言**页面上真的存在**的模式按钮（subbranch / pickPipe 没有对应按钮，
       写成 null 会把断言拖成永远的“缺失”，反而掩盖真正的回归）。 */
    const modes = ['main', 'branch', 'source', 'valve', 'maskPipe', 'adjustCut'];
    const out = {}; let present = 0;
    modes.forEach(function (m) { const b = q(m); if (b) { present++; out[m] = b.disabled; } else out[m] = 'MISSING'; });
    /* [v194] 总管编辑入口已迁到「成组管路」页 ⇒ 二级页**任何模式下都不该**再有入口。
       ★ 断言「没有」而不是「隐藏」：留着按钮就有哪天被重新接上线的可能，
         而「隐藏」的按钮在别的模式下又会冒出来 —— 那正是「同一份数据两个入口」。 */
    return { disabled: out, present: present, trunkGone: document.getElementById('ppGeTrunk') === null };
  });
  console.log('        disabled = ' + JSON.stringify(b2.disabled) +
    ' / 存在按钮 ' + b2.present + ' 个 / 无总管入口 ' + b2.trunkGone);
  const allBlocked = Object.keys(b2.disabled).every((m) => b2.disabled[m] === true);
  check('B2a 整组态：主管/支管/水源/阀门/遮蔽管线/调网格 全部禁用（' + b2.present + ' 个按钮都在）',
    allBlocked && b2.present >= 6, JSON.stringify(b2.disabled));
  check('B2b [v194] 二级页没有总管入口（总管统一在「成组管路」页编辑）', b2.trunkGone === true);

  /* B2c/B2d 兜底：按钮 disable 只是 UI 层 —— 绕过 ppSetMode 直接把 state.mode 改成 'main'，
     再用**真实鼠标**点画布，仍应落不上点（真正的闸门在 ppCanvas 的 mousedown 里）。
     ★ 反向对照：必须同时确认 mousedown **真的到达了画布** ——
       否则「没落上点」可能只是坐标没点中，是假绿。 */
  const b2c = await page.evaluate(async () => {
    const g = window.__ge, st = g.st();
    /* ★ 为什么不用 puppeteer 的真实鼠标点击（page.mouse.click）：
       画布**正中心**在 2 块夹具下恰好落在分区线上 ⇒ mousedown 走 dragCut 分支、
       mouseup 执行 ppCommitMerge() ⇒ **改掉了分区布局**，后面 B4/B5/B6 全线被污染
       （实测：真实点击后 B5 的 5 条断言全红，跳过就全绿）。
       ⇒ 改用与 B5（正向对照）**完全相同**的合成事件机制，唯一变量只有「整组守卫」。
     ★ 落点也要躲开分区线：选地块左上角 (20,20)，远离任何内部界线。 */
    window.__evCount = 0;
    const c = document.getElementById('ppCanvas');
    c.addEventListener('mouseup', function () { window.__evCount++; }, true);
    window.RunyeBridge.state.mode = 'main';      // 最强攻击：连 ppSetMode 都绕过
    const n0 = st.mainPipes.length;
    g.draw([{ x: 20, y: 20 }, { x: 80, y: 20 }]);
    await new Promise((r) => setTimeout(r, 300));
    return { ev: window.__evCount, mode: st.mode, cur: st.currentLine.length, n0: n0, n: st.mainPipes.length };
  });
  console.log('        强制 mode=' + b2c.mode + ' → 合成点击画布：mouseup 命中 ' + b2c.ev +
    ' 次 / currentLine ' + b2c.cur + ' / mainPipes ' + b2c.n0 + '→' + b2c.n);
  check('B2c 反向对照：事件确实到达了画布（否则下一条是假绿）', b2c.ev >= 2, 'mouseup×' + b2c.ev);
  check('B2d 兜底：绕过按钮直接置 mode=main，点画布仍落不上点',
    b2c.cur === 0 && b2c.n === b2c.n0, 'currentLine=' + b2c.cur + ' mainPipes ' + b2c.n0 + '→' + b2c.n);

  /* ---------- B4 画布：整组 vs 逐块 到底画了几块 ---------- */
  console.log('\n— B4 画布像素：整组画两块 / 逐块只画当前块 —');
  const dist = (a, b) => Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
  const sample = () => page.evaluate(() => {
    const g = window.__ge;
    return {
      A: g.px(150, 200), B: g.px(480, 200), bg: g.bg(),
      mode: g.ge() ? g.ge().mode : null, cur: g.ge() ? g.ge().current : -1
    };
  });
  {
    const s = await sample();
    const dA = dist(s.A, s.bg), dB = dist(s.B, s.bg);
    console.log('        整组态：A 色距 ' + dA.toFixed(1) + ' / B 色距 ' + dB.toFixed(1) + '（基准 rgba(' + s.bg + ')）');
    check('B4a 整组态两块都有分区底色（对照：证明采样点选对了）', dA > 30 && dB > 30,
      'A ' + dA.toFixed(1) + ' / B ' + dB.toFixed(1));

    /* 切到逐块 + 块 0 */
    await page.evaluate(async () => {
      document.getElementById('ppGePerPlot').click();
      await new Promise((r) => setTimeout(r, 500));
    });
    const s0 = await sample();
    const dA0 = dist(s0.A, s0.bg), dB0 = dist(s0.B, s0.bg);
    console.log('        逐块(0)：A 色距 ' + dA0.toFixed(1) + ' / B 色距 ' + dB0.toFixed(1) + ' / mode=' + s0.mode + ' cur=' + s0.cur);
    check('B4b 逐块(0)：当前块 A 仍有底色', dA0 > 30, 'A ' + dA0.toFixed(1));
    check('B4c 逐块(0)：另一块 B **不画**（与画布空白同色，色距 < 12）', dB0 < 12, 'B ' + dB0.toFixed(1));

    /* 切到块 1 */
    await page.evaluate(async () => {
      const sel = document.getElementById('ppGePlotSel');
      sel.value = '1'; sel.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 500));
    });
    const s1 = await sample();
    const dA1 = dist(s1.A, s1.bg), dB1 = dist(s1.B, s1.bg);
    console.log('        逐块(1)：A 色距 ' + dA1.toFixed(1) + ' / B 色距 ' + dB1.toFixed(1) + ' / mode=' + s1.mode + ' cur=' + s1.cur);
    check('B4d 逐块(1)：当前块 B 有底色', dB1 > 30, 'B ' + dB1.toFixed(1));
    check('B4e 逐块(1)：另一块 A **不画**', dA1 < 12, 'A ' + dA1.toFixed(1));
  }

  /* ---------- B3 逐块态：下拉出现 / 块级按钮解禁 / 总管隐藏 ---------- */
  console.log('\n— B3 逐块态 UI —');
  const b3 = await page.evaluate(() => {
    const q = (m) => document.querySelector('#ppToolbar .pp-btn[data-mode="' + m + '"]');
    const sel = document.getElementById('ppGePlotSel');
    return {
      selShown: !!sel && getComputedStyle(sel).display !== 'none',
      mainDisabled: q('main') ? q('main').disabled : null,
      branchDisabled: q('branch') ? q('branch').disabled : null,
      /* [v194] 逐块态同样不该有总管入口 —— 总管是**整组级**对象，
         逐块态画出来的「总管」根本不知道该算到哪个块头上。 */
      trunkGone: document.getElementById('ppGeTrunk') === null,
      polyPts0: JSON.stringify(window.RunyeBridge.state.polyPts)
    };
  });
  console.log('        ' + JSON.stringify({ selShown: b3.selShown, mainDisabled: b3.mainDisabled, branchDisabled: b3.branchDisabled, trunkGone: b3.trunkGone }));
  check('B3a 逐块态：子地块下拉出现', b3.selShown === true);
  check('B3b 逐块态：主管/支管解禁（能编辑了）', b3.mainDisabled === false && b3.branchDisabled === false);
  check('B3c [v194] 逐块态也没有总管入口（入口唯一：成组管路页）', b3.trunkGone === true);

  /* ---------- B5 各块完全独立（拍板 ③）---------- */
  console.log('\n— B5 各块编辑结果互不串味 —');
  await page.evaluate(async () => {
    /* 回到块 0 再画，保证断言顺序可复现 */
    const sel = document.getElementById('ppGePlotSel');
    sel.value = '0'; sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));
  });
  const b5 = await page.evaluate(async () => {
    const g = window.__ge, st = g.st();
    const dbg = {};
    /* 走真实路径：点「主管」按钮 → 在画布落两点 → 双击收线 */
    document.querySelector('#ppToolbar .pp-btn[data-mode="main"]').click();
    await new Promise((r) => setTimeout(r, 200));
    const mode = st.mode;
    dbg.ppM = (function () {
      const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      st.polyPts.forEach(function (q) {
        b.minX = Math.min(b.minX, q.x); b.minY = Math.min(b.minY, q.y);
        b.maxX = Math.max(b.maxX, q.x); b.maxY = Math.max(b.maxY, q.y);
      });
      return b;
    })();
    dbg.c1 = g.toClient(60, 200); dbg.c2 = g.toClient(240, 200);
    dbg.rect = (function () { const r = document.getElementById('ppCanvas').getBoundingClientRect(); return { w: r.width, h: r.height, l: r.left, t: r.top }; })();
    g.draw([{ x: 60, y: 200 }, { x: 240, y: 200 }]);
    await new Promise((r) => setTimeout(r, 300));
    dbg.curAfterDraw = st.currentLine.length;
    dbg.mainAfterDraw = st.mainPipes.length;
    const n0 = st.mainPipes.length;
    /* 切到块 1：那里不该有这根管 */
    const sel = document.getElementById('ppGePlotSel');
    sel.value = '1'; sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));
    const n1 = st.mainPipes.length;
    /* 再切回块 0：管还在 */
    sel.value = '0'; sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));
    const n0b = st.mainPipes.length;
    return { mode: mode, n0: n0, n1: n1, n0b: n0b, dbg: dbg,
             slot0: (g.ge().slots[0].mainPipes || []).length,
             slot1: (g.ge().slots[1].mainPipes || []).length };
  });
  console.log('        ' + JSON.stringify(b5));
  check('B5a 逐块态真的进到了「主管」模式（前置闸门）', b5.mode === 'main', 'mode=' + b5.mode);
  check('B5b 块0 画出 1 根主管', b5.n0 === 1, 'n=' + b5.n0);
  check('B5c 切到块1：那里 0 根（各块完全独立，拍板 ③）', b5.n1 === 0, 'n=' + b5.n1);
  check('B5d 切回块0：那根管还在（切块不丢编辑结果）', b5.n0b === 1, 'n=' + b5.n0b);
  check('B5e 两份 slot 各自记账（1 / 0）', b5.slot0 === 1 && b5.slot1 === 0,
    'slot0=' + b5.slot0 + ' slot1=' + b5.slot1);

  /* ---------- B10 [v197] 逐块分区按本块真实尺寸 ----------
     用户原话：「这个分区是按照18亩划分的，逐块划分却不是，要改成统一的，
     按照设定的亩数划分才行。」实测（2026-10-04 截图）：runyePlanDims 是按**整组**
     实测面积算的全局规划尺寸（650×420），逐块拿本块 bounds（300×400）去除以它
     ⇒ sx·sy≈0.44 ⇒ 18 亩/区实际切出 ≈7.9 亩，且区数按整组 dims 切对不上。
     修法（上游）：ppGetPlanDims 在 perPlot 直接返回本块 bounds（sx=sy=1）。
     B5 结束时正处于「块 0 逐块态」，正好验证。 */
  console.log('\n— B10 逐块分区 = 本块真实尺寸口径（v197） —');
  const b10 = await page.evaluate(() => {
    const B = window.RunyeBridge;
    const g = window.__ge, st = g.st();
    const bb = (function () {
      const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      st.polyPts.forEach(function (q) {
        b.minX = Math.min(b.minX, q.x); b.minY = Math.min(b.minY, q.y);
        b.maxX = Math.max(b.maxX, q.x); b.maxY = Math.max(b.maxY, q.y);
      });
      return b;
    })();
    const dims = B.getPlanDims();
    const cuts = B.getZoneCuts();
    if (!cuts) return { err: 'cuts=null' };
    const ring = st.polyPts.map((p) => ({ x: p.x, y: p.y }));
    const cells = [];
    for (let zr = 0; zr < cuts.rows; zr++) {
      for (let zc = 0; zc < cuts.cols; zc++) {
        const clipped = B.clipPolyToRect(ring, cuts.xPos[zc], cuts.yPos[zr], cuts.xPos[zc + 1], cuts.yPos[zr + 1]);
        cells.push(B.polyArea(clipped || []) / 666.67);
      }
    }
    const manualMu = parseFloat((document.getElementById('planZoneMuManual') || {}).value) || 0;
    return {
      dimsW: +dims.w.toFixed(1), dimsH: +dims.h.toFixed(1),
      bbW: +(bb.maxX - bb.minX).toFixed(1), bbH: +(bb.maxY - bb.minY).toFixed(1),
      cols: cuts.cols, rows: cuts.rows, manualMu: manualMu,
      mx: +Math.max.apply(null, cells).toFixed(1)
    };
  });
  console.log('        ' + JSON.stringify(b10));
  check('B10a 逐块态规划尺寸=本块真实 bounds（不再除以整组 dims，v197）',
    !b10.err && Math.abs(b10.dimsW - b10.bbW) < 0.5 && Math.abs(b10.dimsH - b10.bbH) < 0.5,
    'dims=' + b10.dimsW + 'x' + b10.dimsH + ' bb=' + b10.bbW + 'x' + b10.bbH);
  check('B10b 最大分区 ≈ 设定亩数（18 亩/区落地；余量/边界区只会更小）',
    !b10.err && Math.abs(b10.mx - b10.manualMu) <= 1.0,
    'mx=' + b10.mx + ' 亩, 设定=' + b10.manualMu);

  /* ---------- B6 总管不进各块统计 ----------
     [v194] 二级页已**不能画**总管（入口在「成组管路」页）。这里改测后半段 ——
     **只读渲染 + 不串味**：直接给 __runyeGroupEdit.trunkPipes 塞一根
     （等价于新页画完回填 / v193 历史数据迁移过来的情况），
     断言它只出现在 #ppTrunkLayer，不进任何一块的统计。 */
  console.log('\n— B6 总管：独立一层，不进各块的水力/材料（[v194] 二级页只读渲染）—');
  const b6 = await page.evaluate(async () => {
    const g = window.__ge, st = g.st();
    /* ★ 必须在**切回整组之前**把总管塞进去：切整组会跑 ppCollectGroupAllPipes
       合并各 slot，合并口径一旦把 trunkPipes 算进去，这里立刻看得出来
       （塞在切完之后才塞 ⇒ 合并已经跑完 ⇒ 断言会假绿）。 */
    g.ge().trunkPipes = [[{ x: 150, y: 380 }, { x: 480, y: 380 }]];   // 横穿块间空隙
    document.getElementById('ppGeWhole').click();
    await new Promise((r) => setTimeout(r, 500));
    const mergedMain = st.mainPipes.length;
    const mode = st.mode;                        // 整组态应落在「管线拾取」，不是 trunk
    const trunkN = (g.ge().trunkPipes || []).length;
    /* 回到逐块块0：它的主管数必须还是 1（总管没混进去） */
    document.getElementById('ppGePerPlot').click();
    await new Promise((r) => setTimeout(r, 400));
    const perMain = st.mainPipes.length;
    const inSlotsAny = g.ge().slots.map(function (s) { return (s.mainPipes || []).length; });
    return {
      mode: mode, mergedMain: mergedMain, trunkN: trunkN, perMain: perMain,
      inSlot: (g.ge().slots[0].mainPipes || []).length, inSlotsAny: inSlotsAny,
      slotsSum: inSlotsAny.reduce(function (a, n) { return a + n; }, 0)
    };
  });
  console.log('        ' + JSON.stringify(b6));
  check('B6a [v194] 整组态落在「管线拾取」而不是 trunk（二级页已无总管模式）',
    b6.mode === 'pickPipe', 'mode=' + b6.mode);
  check('B6b 前置闸门：总管数据确实塞进去了（1 根）', b6.trunkN === 1, 'trunk=' + b6.trunkN);
  check('B6c 合并视图 = 各块之和（总管**没有**混进整组统计）', b6.mergedMain === b6.slotsSum,
    'merged=' + b6.mergedMain + ' Σslots=' + b6.slotsSum);
  check('B6d 回逐块(0)：该块主管仍是 1 根（总管不算它的）', b6.perMain === 1 && b6.inSlot === 1,
    'state=' + b6.perMain + ' slot=' + b6.inSlot);
  check('B6e 总管也没进任何一份 slot（各 slot 根数 [1,0]）',
    JSON.stringify(b6.inSlotsAny) === '[1,0]', JSON.stringify(b6.inSlotsAny));

  /* ---------- B9 施工图 = 一张总图（拍板 ⑤）---------- */
  console.log('\n— B9 施工图：逐块态出图仍是一张总图 —');
  const b9 = await page.evaluate(async () => {
    if (typeof window.ppGenerateDiagram === 'function') window.ppGenerateDiagram({ scroll: false });
    await new Promise((r) => setTimeout(r, 700));
    const g = document.querySelector('#ppDiagramContent g#ppPlotGroup');
    const p = g ? g.querySelector('path') : null;
    const d = p ? p.getAttribute('d') : null;
    const trunkLayer = document.querySelector('#ppDiagramContent g#ppTrunkLayer');
    const st = window.RunyeBridge.state;
    return {
      mCount: d ? (d.match(/M/g) || []).length : -1,
      trunkPaths: trunkLayer ? trunkLayer.querySelectorAll('path').length : -1,
      /* 出图后 ppState 必须还原到当前块（不能停在整组视图上） */
      polyIsBlock0: (function () {
        const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
        st.polyPts.forEach(function (q) {
          b.minX = Math.min(b.minX, q.x); b.minY = Math.min(b.minY, q.y);
          b.maxX = Math.max(b.maxX, q.x); b.maxY = Math.max(b.maxY, q.y);
        });
        return Math.abs(b.minX - 0) < 1 && Math.abs(b.maxX - 300) < 1;
      })(),
      mainPipes: st.mainPipes.length
    };
  });
  console.log('        ' + JSON.stringify(b9));
  check('B9a 逐块态出图 = 一张总图（2 条子路径 = 两个成员环都在）', b9.mCount === 2, 'M×' + b9.mCount);
  check('B9b 总图里有总管层（1 根，只读渲染来自 ge.trunkPipes）', b9.trunkPaths === 1, 'paths=' + b9.trunkPaths);
  check('B9c 出完图 ppState 还原到当前块（不会停在外框上）', b9.polyIsBlock0 === true);
  check('B9d 出完图当前块的主管数不变（出图是只读的）', b9.mainPipes === 1, 'n=' + b9.mainPipes);

  /* ---------- B7 旋转作用于整组（拍板 ④）---------- */
  console.log('\n— B7 旋转作用于整组 —');
  const b7 = await page.evaluate(async () => {
    const g = window.__ge, st = g.st();
    /* 旋转中心 = 当前块（块0）的包围盒中心 —— 与 ppRepartitionFromRotatedPlot 同口径 */
    const b = g.ctr(st.polyPts);
    const c = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
    const before1 = g.ctr(window.__runyeSubPlots[1].poly);
    const deg = 30, rad = deg * Math.PI / 180;
    const expect = {
      x: c.x + (before1.cx - c.x) * Math.cos(rad) - (before1.cy - c.y) * Math.sin(rad),
      y: c.y + (before1.cx - c.x) * Math.sin(rad) + (before1.cy - c.y) * Math.cos(rad)
    };
    const inp = document.getElementById('ppPlotAngle');
    if (inp) { inp.value = '30'; inp.dispatchEvent(new Event('input', { bubbles: true })); }
    await new Promise((r) => setTimeout(r, 250));
    const btn = document.getElementById('ppRepartition');
    if (btn) btn.click();
    await new Promise((r) => setTimeout(r, 600));
    const after1 = g.ctr(window.__runyeSubPlots[1].poly);
    const slot1 = g.ge().slots[1].polyPts ? g.ctr(g.ge().slots[1].polyPts) : null;
    return {
      before1: before1, after1: after1, expect: expect, slot1: slot1,
      moved: Math.sqrt((after1.cx - before1.cx) ** 2 + (after1.cy - before1.cy) ** 2)
    };
  });
  {
    const e = b7.expect, a = b7.after1;
    const dev = Math.sqrt((a.cx - e.x) ** 2 + (a.cy - e.y) ** 2);
    console.log('        块1 中心 旋转前 (' + b7.before1.cx.toFixed(1) + ',' + b7.before1.cy.toFixed(1) +
      ') → 旋转后 (' + a.cx.toFixed(1) + ',' + a.cy.toFixed(1) + ') / 应为 (' + e.x.toFixed(1) + ',' + e.y.toFixed(1) + ')');
    console.log('        位移 ' + b7.moved.toFixed(1) + ' m / 偏差 ' + dev.toFixed(2) + ' m');
    check('B7a 旋转确实生效了（不是两者都没动的假绿）', b7.moved > 20, '位移 ' + b7.moved.toFixed(1) + ' m');
    check('B7b 逐块态旋转，另一块的环也跟着转（偏差 ≤ 2m）', dev <= 2.0, '偏差 ' + dev.toFixed(2) + ' m');
    check('B7c 另一块的 slot 同步更新（偏差 ≤ 2m）',
      !!b7.slot1 && Math.sqrt((b7.slot1.cx - e.x) ** 2 + (b7.slot1.cy - e.y) ** 2) <= 2.0,
      b7.slot1 ? '(' + b7.slot1.cx.toFixed(1) + ',' + b7.slot1.cy.toFixed(1) + ')' : 'null');
  }

  /* ---------- B8 成组地块进不了三级页（拍板 ②）---------- */
  console.log('\n— B8 成组地块拦截三级页入口 —');
  const b8 = await page.evaluate(async () => {
    const out = {};
    window.__alerts = [];
    /* ① 功能区切换这条路 */
    try { window.ryShowSection(document.getElementById('tlPipePlanSection'), null); } catch (e) {}
    await new Promise((r) => setTimeout(r, 350));
    out.activeAfterShow = document.getElementById('tlPipePlanSection').classList.contains('ry-active');
    out.alertsAfterShow = window.__alerts.length;
    /* ② 视图切换这条路
       ★ 必须切到一个**与当前不同**的 view 再断言「没变」——
         默认 data-ry-view 本来就是 'ws'，切 'ws' 时「不变」是恒真的假绿。 */
    const sec = document.getElementById('tlPipePlanSection');
    const view0 = sec.getAttribute('data-ry-view');
    const viewTry = (view0 === 'ws') ? 'sys' : 'ws';
    window.__alerts = [];
    try { window.rySetTab('tlPipePlanSection', viewTry); } catch (e) {}
    await new Promise((r) => setTimeout(r, 350));
    out.view0 = view0; out.viewTry = viewTry;
    out.viewAfterTab = sec.getAttribute('data-ry-view');
    out.alertsAfterTab = window.__alerts.length;
    out.sample = (window.__alerts[0] || '').slice(0, 40);
    /* 对照：二级页仍能正常切 */
    try { window.ryShowSection(document.getElementById('pipePlanSection'), null); } catch (e) {}
    await new Promise((r) => setTimeout(r, 300));
    out.ppActive = document.getElementById('pipePlanSection').classList.contains('ry-active');
    return out;
  });
  console.log('        ' + JSON.stringify(b8));
  check('B8a 走「切功能区」被拦：没切过去 + 弹了提示',
    b8.activeAfterShow === false && b8.alertsAfterShow >= 1,
    'active=' + b8.activeAfterShow + ' alerts=' + b8.alertsAfterShow);
  check('B8b 走「切视图」被拦：data-ry-view 没被改成目标视图', b8.viewAfterTab === b8.view0,
    b8.view0 + ' −(尝试 ' + b8.viewTry + ')→ ' + b8.viewAfterTab);
  check('B8c 提示文案说明了原因（含「成组地块」）', /成组地块/.test(b8.sample || ''), b8.sample);
  check('B8d 二级页不受影响（仍能切过去）', b8.ppActive === true);

  if (errs.length) console.log('\n[pageerror] ' + errs.slice(0, 8).join('\n           '));

  console.log('\n==== ' + (INJ ? '注入 ' + (INJ === 99 ? 'all' : INJ) : '正常') + '：PASS ' + pass + ' / FAIL ' + fail + ' ====');
  if (INJ) console.log('（注入体检：退出码 0 = 缺陷已被本诊断捕获；1 = 恒绿没抓到；2 = 锚点漂移）');

  try { await browser.disconnect(); } catch (e) {}
  try { proc.kill(); } catch (e) {}
  try { fs.unlinkSync(path.join(WS, '_inj_grpedit.html')); } catch (e) {}

  if (INJ) process.exit(fail > 0 ? 0 : 1);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('[FATAL] ' + (e && e.stack || e)); process.exit(1); });
