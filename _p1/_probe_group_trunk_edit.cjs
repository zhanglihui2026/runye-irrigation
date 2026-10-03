/* _p1/_probe_group_trunk_edit.cjs · [v195]「成组管路」页 总管 删除/清空/选中 行为探针
 *
 * 复现用户真实操作流：画总管 → 落点 → 双击收线 → 想删掉它。
 * 用户反馈：「清空跟删除选中这些 似乎都不能弄」。
 *
 * 用法：
 *   node _p1/_probe_group_trunk_edit.cjs                 # 正常跑，应全绿
 *   node _p1/_probe_group_trunk_edit.cjs --inject 1      # 缺陷注入体检
 */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');

const WS = 'C:\\Users\\AHS\\runye-irrigation';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = path.join(WS, '_verify_out');
const PORT = 9481;
const INJ = (() => {
  const i = process.argv.indexOf('--inject');
  if (i < 0) return 0;
  const v = process.argv[i + 1];
  return v === 'all' ? 99 : (parseInt(v, 10) || 0);
})();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileUrl = (p) => 'file:///' + p.replace(/\\/g, '/');
const SRC_HTML = path.join(WS, 'index.html');

function makeInjectedCopy() {
  const s0 = fs.readFileSync(SRC_HTML, 'utf8');
  let s = s0;
  const applied = [];
  const sub1 = (anchor, rep, tag) => {
    const parts = anchor.replace(/\r/g, '').split('\n').map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const re = new RegExp(parts.join('\\r?\\n'));
    const cnt = (s.match(re) || []).length;
    if (cnt !== 1) { console.error('[inject] 锚点' + tag + ' 漂移：期望 1 处，实际 ' + cnt); process.exit(2); }
    s = s.replace(re, rep); applied.push(tag);
  };

  if (INJ === 1 || INJ === 99) {
    /* 双击收线后不退出画线模式（用户以为点图是「选中」，实际还在加点）⇒ T2 必须红
       [v195] 锚点跟到新代码：收线后那句 W.mode='pick' */
    sub1("        W.mode = 'pick';\r\n        grRender(); grRenderTrunk(); grRenderMat();",
      "        /* [inject 1] 不退出画线模式 */\r\n        grRender(); grRenderTrunk(); grRenderMat();", '1');
  }
  if (INJ === 2 || INJ === 99) {
    /* Esc 不清掉正在画的点 ⇒ 画线模式残留 ⇒ T5 必须红 */
    sub1("      if (e.key === 'Escape' && W.mode === 'draw') { W.draw = null; W.mode = 'pick'; grRenderTrunk(); grRender(); }",
      "      if (e.key === 'Escape' && W.mode === 'draw') { W.draw = null; /* [inject 2] 不退模式 */ grRenderTrunk(); grRender(); }", '2');
  }
  if (INJ === 3 || INJ === 99) {
    /* 清空不刷汇总（删掉了但材料表里还留着）⇒ T4f 必须红
       [v195] 锚点跟到新代码：清空后那组刷新调用 */
    sub1("      grRender(); grRenderTrunk(); grRenderMat();\r\n      grHint('已清空 ' + n + ' 根总管。');",
      "      grRender(); grRenderTrunk(); /* [inject 3] 不刷汇总 */\r\n      grHint('已清空 ' + n + ' 根总管。');", '3');
  }
  if (INJ === 4 || INJ === 99) {
    /* 删除选中后不刷总管长度显示 ⇒ T4 必须红 */
    sub1("      W.trunk.lines.splice(W.sel, 1); W.sel = -1;\r\n      grRender(); grRenderTrunk(); grRenderMat();",
      "      W.trunk.lines.splice(W.sel, 1); W.sel = -1;\r\n      grRender(); /* [inject 4] 不刷显示 */ grRenderMat();", '4');
  }
  if (INJ === 5 || INJ === 99) {
    /* grExitDraw 空操作 ⇒ 画线模式中点「删除/清空」仍卡在画线 ⇒ T7 必须红
       ★ 必须让函数**提前 return**，只在后面加注释等于没注入（本轮实测 27/0 恒绿）。 */
    sub1("  function grExitDraw() {\r\n    if (W.mode !== 'draw') return false;",
      "  function grExitDraw() {\r\n    return false; /* [inject 5] 不退模式 */\r\n    if (W.mode !== 'draw') return false;", '5');
  }

  const p = path.join(WS, '_inj_grptrunk.html');
  fs.writeFileSync(p, s, 'utf8');
  console.log('[inject] 已注入 ' + applied.join(' / ') + ' → ' + p);
  return p;
}

let pass = 0, fail = 0;
const check = (n, ok, extra) => {
  console.log((ok ? '  [PASS] ' : '  [FAIL] ') + n + (extra ? ' :: ' + extra : ''));
  ok ? pass++ : fail++;
};

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
    '--user-data-dir=' + path.join(OUT, 'profile_grptrunk'),
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
  await page.evaluateOnNewDocument(() => {
    window.__alerts = []; window.__confirms = [];
    window.alert = function (m) { window.__alerts.push(String(m)); };
    /* ★ 记录而不是直接放行：要能断言「清空真的弹了确认」 */
    window.confirm = function (m) { window.__confirms.push(String(m)); return true; };
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

  /* 页面内工具 */
  await page.evaluate(() => {
    const bbox = (pts) => {
      const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      (pts || []).forEach((p) => {
        b.minX = Math.min(b.minX, p.x); b.minY = Math.min(b.minY, p.y);
        b.maxX = Math.max(b.maxX, p.x); b.maxY = Math.max(b.maxY, p.y);
      });
      return b;
    };
    window.__gt = {
      W: function () { return window.__runyeGroupWork; },
      bbox: bbox,
      sumLen: function (lines) {
        var t = 0;
        (lines || []).forEach(function (l) {
          for (var i = 0; i + 1 < l.length; i++) t += Math.hypot(l[i + 1].x - l[i].x, l[i + 1].y - l[i].y);
        });
        return t;
      },
      show: function (id) {
        try { if (window.ryShowSection) window.ryShowSection(document.getElementById(id), null); } catch (e) {}
      },
      /* ★ 用「打探针点反解仿射」拿世界↔画布映射（不复制页面私有的 view）。
         落点必须**避开分区线**：用 (20,20) / (80,20) —— 地块左上角，远离任何内部界线。
         ★ 探针自身的副作用教训（MEMORY 铁律）：落点选几何中心会踩线、改掉分区布局。 */
      calib: function () {
        const c = document.getElementById('grCanvas');
        const r = c.getBoundingClientRect();
        const W = window.__runyeGroupWork;
        const fire = (x, y) => c.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, button: 0, bubbles: true }));
        const u1 = 80, v1 = 60, u2 = 260, v2 = 300;
        const m0 = W.mode;
        if (m0 !== 'draw') document.getElementById('grTrunkDraw').click();
        fire(r.left + u1, r.top + v1); fire(r.left + u2, r.top + v2);
        const d = (W.draw || []).slice(-2);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        if (d.length < 2) return null;
        return {
          rect: r,
          sx: (u2 - u1) / (d[1].x - d[0].x), sy: (v2 - v1) / (d[1].y - d[0].y),
          ox: u1 - d[0].x * ((u2 - u1) / (d[1].x - d[0].x)), oy: v1 - d[0].y * ((v2 - v1) / (d[1].y - d[0].y))
        };
      },
      toC: function (cal, mx, my) {
        return { x: cal.rect.left + mx * cal.sx + cal.ox, y: cal.rect.top + my * cal.sy + cal.oy };
      },
      fire: function (type, x, y) {
        document.getElementById('grCanvas')
          .dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true }));
      }
    };
  });

  /* ---------- 装载成组地块 ---------- */
  await page.evaluate((FIX) => {
    window.measuredPolygon = FIX.frame.map((p) => ({ x: p.x, y: p.y }));
    window.measuredArea = 240000;
    window.measuredPolygonSource = 'map';
    window.__runyeGroupName = '成组地块A';
    window.__runyeSubPlots = FIX.rings.map(function (r, i) {
      return { id: 'sub' + (i + 1), name: '子地块' + (i + 1), mu: 180, sqm: 120000, poly: r.map((q) => ({ x: q.x, y: q.y })) };
    });
    if (typeof window.ppLoadPolygon === 'function') window.ppLoadPolygon();
    if (typeof window.ppSetZoneAuto === 'function') window.ppSetZoneAuto(true);
  }, FIX);
  await sleep(900);

  await page.evaluate(() => {
    const G = window.__gt;
    G.show('grPipeSection');
    if (typeof window.grRefreshGroupPage === 'function') window.grRefreshGroupPage();
  });
  await sleep(600);

  /* ---------- T0 反向对照：空态下按钮不该误删 ---------- */
  console.log('\n— T0 反向对照：还没画总管时 —');
  const t0 = await page.evaluate(async () => {
    const G = window.__gt, W = G.W();
    const hint = () => document.getElementById('grTrunkHint').textContent;
    document.getElementById('grTrunkDel').click();   // 没选中
    const hDel = hint();
    document.getElementById('grTrunkClear').click(); // 没东西可清
    await new Promise((r) => setTimeout(r, 120));
    const hClr = hint(), btn = document.getElementById('grTrunkClear').textContent;
    return { n: W.trunk.lines.length, hDel: hDel, hClr: hClr, btn: btn, confirms: window.__confirms.length };
  });
  console.log('        ' + JSON.stringify(t0));
  check('T0a 空态点「删除选中」：只给提示、不报错', t0.hDel.indexOf('先在图上点') >= 0, t0.hDel);
  check('T0a2 空态点「清空」：提示「没有总管可清空」', t0.hClr.indexOf('没有总管可清空') >= 0, t0.hClr);
  check('T0a3 空态点「清空」：按钮**不进入**武装态', t0.btn === '清空', t0.btn);
  check('T0b 空态点「清空」：不弹原生确认（已不依赖 confirm）', t0.confirms === 0, 'confirm×' + t0.confirms);

  /* ---------- T1 画一根总管（用户真实操作） ---------- */
  console.log('\n— T1 画总管：点「画总管」→ 落两点 → 双击收线 —');
  const t1 = await page.evaluate(async () => {
    const G = window.__gt, W = G.W();
    const cal = G.calib();
    if (!cal) return { err: 'calib failed' };
    document.getElementById('grTrunkDraw').click();          // 进画线模式
    await new Promise((r) => setTimeout(r, 150));
    const p1 = G.toC(cal, 150, 380), p2 = G.toC(cal, 480, 380);
    G.fire('click', p1.x, p1.y); G.fire('click', p2.x, p2.y);
    const drawN = (W.draw || []).length;
    G.fire('dblclick', p2.x, p2.y);
    await new Promise((r) => setTimeout(r, 300));
    return {
      drawN: drawN, lines: W.trunk.lines.length,
      mode: W.mode,                                          // ★ 收线后还在不在画线模式？
      len: G.sumLen(W.trunk.lines),
      btnActive: document.getElementById('grTrunkDraw').classList.contains('active'),
      hint: document.getElementById('grTrunkHint').textContent
    };
  });
  console.log('        ' + JSON.stringify(t1));
  check('T1a 落了 2 个点', t1.drawN === 2, 'draw=' + t1.drawN);
  check('T1b 双击收线：总管 1 根', t1.lines === 1, 'lines=' + t1.lines);

  /* ---------- T2 ★ 收线后必须退出画线模式（用户反馈的根因之一） ---------- */
  console.log('\n— T2 收线后：用户接下来点图应该是「选中」，不是继续加点 —');
  check('T2a ★ 双击收线后退出画线模式（W.mode = pick）', t1.mode === 'pick', 'mode=' + t1.mode);
  check('T2b ★ 「画总管」按钮不再高亮', t1.btnActive === false, 'active=' + t1.btnActive);
  check('T2c 提示文案回到「可点选」的说法',
    t1.hint.indexOf('点选') >= 0 || t1.hint.indexOf('选中') >= 0, t1.hint);

  /* ---------- T3 点选总管 → 删除选中 ---------- */
  console.log('\n— T3 点选 + 删除选中 —');
  const t3 = await page.evaluate(async () => {
    const G = window.__gt, W = G.W();
    const cal = G.calib();
    if (!cal) return { err: 'calib failed' };
    /* 点在总管线段正中间（150,380)-(480,380) 的中点 (315,380) */
    const p = G.toC(cal, 315, 380);
    G.fire('click', p.x, p.y);
    await new Promise((r) => setTimeout(r, 250));
    const sel = W.sel;
    const before = W.trunk.lines.length;
    document.getElementById('grTrunkDel').click();
    await new Promise((r) => setTimeout(r, 250));
    return {
      sel: sel, before: before, after: W.trunk.lines.length,
      selAfter: W.sel,
      uiN: document.getElementById('grTrunkN').textContent,
      uiLen: document.getElementById('grTrunkLen').textContent
    };
  });
  console.log('        ' + JSON.stringify(t3));
  check('T3a 点线能选中（W.sel = 0）', t3.sel === 0, 'sel=' + t3.sel);
  check('T3b 「删除选中」真的删掉了（1 → 0）', t3.before === 1 && t3.after === 0,
    t3.before + ' → ' + t3.after);
  check('T3c 删完取消选中', t3.selAfter === -1, 'sel=' + t3.selAfter);
  check('T3d 侧栏根数/长度同步归零', t3.uiN === '0' && t3.uiLen === '0.0', t3.uiN + ' / ' + t3.uiLen);

  /* ---------- T4 两段式「清空」 ---------- */
  console.log('\n— T4 清空（两段式：第一次武装，再点才清）—');
  const t4 = await page.evaluate(async () => {
    const G = window.__gt, W = G.W();
    const cal = G.calib();
    document.getElementById('grTrunkDraw').click();
    await new Promise((r) => setTimeout(r, 150));
    const p1 = G.toC(cal, 150, 380), p2 = G.toC(cal, 480, 380);
    G.fire('click', p1.x, p1.y); G.fire('click', p2.x, p2.y);
    G.fire('dblclick', p2.x, p2.y);
    await new Promise((r) => setTimeout(r, 300));
    const before = W.trunk.lines.length;
    const btn = document.getElementById('grTrunkClear');
    /* 第一次点 → 应进入武装态，但**还没清** */
    btn.click();
    await new Promise((r) => setTimeout(r, 200));
    const armed = { n: W.trunk.lines.length, txt: btn.textContent, isArm: btn.classList.contains('gr-btn-arm') };
    /* 第二次点 → 真清 */
    btn.click();
    await new Promise((r) => setTimeout(r, 300));
    const done = {
      n: W.trunk.lines.length, sel: W.sel, txt: btn.textContent, isArm: btn.classList.contains('gr-btn-arm'),
      uiN: document.getElementById('grTrunkN').textContent,
      uiLen: document.getElementById('grTrunkLen').textContent,
      matSum: (function () {
        const t = Array.prototype.slice.call(document.querySelectorAll('#grMat tbody tr'))
          .find((r) => r.classList.contains('gr-sum'));
        return t ? t.querySelectorAll('td')[2].textContent.trim() : '(无)';
      })()
    };
    /* 3 秒超时自动还原（单独验一次武装态的超时） */
    document.getElementById('grTrunkDraw').click();
    await new Promise((r) => setTimeout(r, 150));
    const p3 = G.toC(cal, 150, 380), p4 = G.toC(cal, 480, 380);
    G.fire('click', p3.x, p3.y); G.fire('click', p4.x, p4.y);
    G.fire('dblclick', p4.x, p4.y);
    await new Promise((r) => setTimeout(r, 300));
    btn.click();
    await new Promise((r) => setTimeout(r, 200));
    const arm2 = { n: W.trunk.lines.length, txt: btn.textContent };
    await new Promise((r) => setTimeout(r, 3300));
    const disarmed = { n: W.trunk.lines.length, txt: btn.textContent, isArm: btn.classList.contains('gr-btn-arm') };
    return { before: before, armed: armed, done: done, arm2: arm2, disarmed: disarmed };
  });
  console.log('        ' + JSON.stringify(t4));
  check('T4a 前置：又画上了 1 根', t4.before === 1, 'n=' + t4.before);
  check('T4b 第一次点进入武装态（按钮变「⚠ 确认清空？」）但**还没清**',
    t4.armed.isArm === true && t4.armed.txt.indexOf('确认清空') >= 0 && t4.armed.n === 1,
    'txt=' + t4.armed.txt + ' n=' + t4.armed.n);
  check('T4c 第二次点真的清掉了（1 → 0）', t4.done.n === 0, t4.before + ' → ' + t4.done.n);
  check('T4d 清空后取消选中 + 按钮还原',
    t4.done.sel === -1 && t4.done.isArm === false && t4.done.txt === '清空',
    'sel=' + t4.done.sel + ' txt=' + t4.done.txt);
  check('T4e 侧栏同步归零', t4.done.uiN === '0' && t4.done.uiLen === '0.0', t4.done.uiN + ' / ' + t4.done.uiLen);
  check('T4f 材料汇总同步（合计不再含 330）', t4.done.matSum === '0.0', '合计主管=' + t4.done.matSum);
  check('T4g ★ 3 秒不点 → 自动解除武装（不会一直停在「待确认」）',
    t4.disarmed.isArm === false && t4.disarmed.txt === '清空' && t4.disarmed.n === 1,
    'txt=' + t4.disarmed.txt + ' n=' + t4.disarmed.n);

  /* ---------- T5 Esc 也能退出画线模式 ---------- */
  console.log('\n— T5 Esc 退出画线模式 —');
  const t5 = await page.evaluate(async () => {
    const G = window.__gt, W = G.W();
    document.getElementById('grTrunkDraw').click();
    await new Promise((r) => setTimeout(r, 150));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise((r) => setTimeout(r, 200));
    return { mode: W.mode, draw: (W.draw || []).length, btnActive: document.getElementById('grTrunkDraw').classList.contains('active') };
  });
  console.log('        ' + JSON.stringify(t5));
  check('T5a Esc 后退出画线模式', t5.mode === 'pick', 'mode=' + t5.mode);
  check('T5b Esc 后按钮不高亮', t5.btnActive === false, 'active=' + t5.btnActive);

  /* ---------- T7 画线模式中点「删除/清空」必须先退出画线模式 ----------
     ★ 这正是用户踩的坑：收线后仍停在画线模式，点图想「选中」实际在加点。
       就算用户自己没发现，点「删除选中」时也不该继续画 —— 想删除就不是想画线。 */
  console.log('\n— T7 画线模式中点「删除/清空」→ 自动退出画线模式 —');
  const t7 = await page.evaluate(async () => {
    const G = window.__gt, W = G.W();
    document.getElementById('grTrunkDraw').click();          // 进画线模式
    await new Promise((r) => setTimeout(r, 150));
    const inDraw = W.mode;
    document.getElementById('grTrunkDel').click();           // 想删除 ≠ 想画线
    await new Promise((r) => setTimeout(r, 200));
    const afterDel = { mode: W.mode, draw: (W.draw || []).length };
    document.getElementById('grTrunkDraw').click();          // 再进画线模式
    await new Promise((r) => setTimeout(r, 150));
    document.getElementById('grTrunkClear').click();         // 想清空 ≠ 想画线
    await new Promise((r) => setTimeout(r, 200));
    const afterClr = { mode: W.mode, draw: (W.draw || []).length, btn: document.getElementById('grTrunkClear').textContent };
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return { inDraw: inDraw, afterDel: afterDel, afterClr: afterClr };
  });
  console.log('        ' + JSON.stringify(t7));
  check('T7a 前置：确实进了画线模式', t7.inDraw === 'draw', 'mode=' + t7.inDraw);
  check('T7b ★ 画线中点「删除选中」→ 自动退出画线模式', t7.afterDel.mode === 'pick', JSON.stringify(t7.afterDel));
  check('T7c ★ 画线中点「清空」→ 自动退出画线模式', t7.afterClr.mode === 'pick', JSON.stringify(t7.afterClr));
  check('T7d 正在画的半截线一并丢弃', t7.afterDel.draw === 0 && t7.afterClr.draw === 0,
    'draw=' + t7.afterDel.draw + ',' + t7.afterClr.draw);

  check('T6 全程无 JS 报错', errs.length === 0, errs.slice(0, 2).join(' | '));

  console.log('\n==== ' + (INJ ? '注入 ' + (INJ === 99 ? 'all' : INJ) : '正常') + '：PASS ' + pass + ' / FAIL ' + fail + ' ====');
  if (INJ) console.log('（注入体检：退出码 0 = 缺陷已被本诊断捕获；1 = 恒绿没抓到）');

  try { await page.screenshot({ path: path.join(OUT, 'grptrunk_' + (INJ ? 'inj' + INJ : 'ok') + '.png') }); } catch (e) {}
  try { await browser.disconnect(); } catch (e) {}
  try { proc.kill(); } catch (e) {}

  if (INJ) process.exit(fail > 0 ? 0 : 1);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('\n[FATAL] ' + (e && e.stack ? e.stack : e));
  process.exit(2);
});
