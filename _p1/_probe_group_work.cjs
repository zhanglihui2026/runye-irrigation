/* _p1/_probe_group_work.cjs · [v194]「成组管路」页的行为探针（真渲染，Edge headless）
 *
 * 覆盖：整组总览 / 总管编辑 / 管径 / 材料汇总口径 / 按块进入三级页 / 返回 / 各块独立。
 *
 * 用法：
 *   node _p1/_probe_group_work.cjs                    # 正常跑，应全绿
 *   node _p1/_probe_group_work.cjs --inject 1         # 缺陷注入体检
 *   node _p1/_probe_group_work.cjs --inject all
 *
 * 退出码（用户长期教训：新写的断言必须靠「注入缺陷 → 断言变红」来证，不能靠「改完全绿」）：
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
const PORT = 9477;
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
  /* ★ 锚点里的换行必须写 \r?\n：index.html 是 CRLF，字面 '\n' 会静默 0 命中
     ⇒ 注入失效、体检假绿（实测踩过）。 */
  const sub1 = (anchor, rep, tag) => {
    const parts = anchor.split('\n').map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const re = new RegExp(parts.join('\\r?\\n'));
    const cnt = (s.match(re) || []).length;
    if (cnt !== 1) { console.error('[inject] 锚点' + tag + ' 漂移：期望 1 处，实际 ' + cnt + ' :: ' + anchor.slice(0, 70)); process.exit(2); }
    s = s.replace(re, rep); applied.push(tag);
  };

  if (INJ === 1 || INJ === 99) {
    /* 进三级页前不确保「逐块模式」⇒ ppState.polyPts 还是外框 ⇒ G6b 必须红 */
    sub1("    if (B && B.setGroupMode) { try { B.setGroupMode('perPlot'); } catch (e) { } }",
      "    /* [inject 1] 不切逐块模式 */", '1');
  }
  if (INJ === 2 || INJ === 99) {
    /* 进三级页前不切二级页的块 ⇒ 分区网格拿错 ⇒ G6b/G6c 必须红 */
    sub1("    if (B && B.selectGroupPlot) { try { B.selectGroupPlot(i); } catch (e) { } }",
      "    /* [inject 2] 不切块 */", '2');
  }
  if (INJ === 3 || INJ === 99) {
    /* 返回时不恢复整组外框 ⇒ G7c 必须红 */
    sub1("    if (window.__runyeGroupFrame && window.__runyeGroupFrame.length) {\r\n      window.measuredPolygon = clone(window.__runyeGroupFrame);\r\n    }",
      "    /* [inject 3] 不恢复外框 */", '3');
  }
  if (INJ === 4 || INJ === 99) {
    /* 返回时不存档本块的三级结果 ⇒ G7d / G8 必须红 */
    sub1("      W.blocks[i].tlData = clone(window.tlDiagramData);",
      "      /* [inject 4] 不存档 */", '4');
  }
  if (INJ === 5 || INJ === 99) {
    /* 总管长度并进各块的主管合计 ⇒ 「各块明细」被污染 ⇒ G5d / G9 必须红 */
    sub1("      tMain += ml; tBr += bl; tSb += sl;",
      "      tMain += ml; tMain += tk; tBr += bl; tSb += sl; // [inject 5] 总管并进各块", '5');
  }
  if (INJ === 6 || INJ === 99) {
    /* 三级页拦截不认「按块进入」的放行标记 ⇒ 成组页点进去被自己拦住 ⇒ G6a 必须红 */
    sub1("  if(window.__runyeTlBlock!=null)return false;",
      "  if(false)return false; // [inject 6] 不放行", '6');
  }

  const p = path.join(WS, '_inj_grpwork.html');
  fs.writeFileSync(p, s, 'utf8');
  console.log('[inject] 已注入 ' + applied.join(' / ') + ' → ' + p);
  return p;
}

let pass = 0, fail = 0;
const check = (n, ok, extra) => {
  console.log((ok ? '  [PASS] ' : '  [FAIL] ') + n + (extra ? ' :: ' + extra : ''));
  ok ? pass++ : fail++;
};

/* ---------- 夹具：两块 300×400，中间 30m 缝（与二级页探针同口径）---------- */
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
    '--user-data-dir=' + path.join(OUT, 'profile_grpwork'),
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

  /* 二级页工具栏必须排版出来（隐藏期间量到的宽高是 0，后续点击会全落空） */
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
    console.error('\n[FATAL] 二级页工具栏未排版 —— 后续点击全会落空。');
    try { await browser.disconnect(); } catch (e) {}
    try { proc.kill(); } catch (e) {}
    process.exit(2);
  }

  /* 页面内通用工具 */
  await page.evaluate(() => {
    const bbox = (pts) => {
      const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      (pts || []).forEach((p) => {
        b.minX = Math.min(b.minX, p.x); b.minY = Math.min(b.minY, p.y);
        b.maxX = Math.max(b.maxX, p.x); b.maxY = Math.max(b.maxY, p.y);
      });
      return b;
    };
    window.__gw = {
      W: function () { return window.__runyeGroupWork; },
      bbox: bbox,
      sumLen: function (lines) {
        var t = 0;
        (lines || []).forEach(function (l) {
          for (var i = 0; i + 1 < l.length; i++) {
            t += Math.sqrt((l[i + 1].x - l[i].x) ** 2 + (l[i + 1].y - l[i].y) ** 2);
          }
        });
        return t;
      },
      /* ★ 画布落点会被浏览器把 clientX/Y 取整（CSSOM 里 clientX 是 long），
         世界坐标换算回来有 ±0.5px 误差 ⇒ 长度对不到理想值。
         ⇒ 断言分两层：①「界面/汇总表 = 数据层」（精确）②「数据层 ≈ 理想几何」（容差 1 m）。 */
      f1: function (v) { return (Math.round(v * 10) / 10).toFixed(1); },
      sig: function (pts) {
        const b = bbox(pts);
        return [b.minX, b.minY, b.maxX, b.maxY].map((v) => Math.round(v)).join(',');
      },
      /* 二级页画布：世界坐标 → client 坐标（与二级页探针同口径） */
      ppToClient: function (mx, my) {
        const c = document.getElementById('ppCanvas');
        const r = c.getBoundingClientRect();
        const st = window.RunyeBridge.state, t = st.transform;
        return {
          x: r.left + (mx - t.minX) * t.scaleX * t.scale + t.offsetX + (st.panX || 0),
          y: r.top + (my - t.minY) * t.scaleY * t.scale + t.offsetY + (st.panY || 0)
        };
      },
      ppDraw: function (wpts) {
        const c = document.getElementById('ppCanvas');
        wpts.forEach((w) => {
          const p = window.__gw.ppToClient(w.x, w.y);
          c.dispatchEvent(new MouseEvent('mousedown', { clientX: p.x, clientY: p.y, button: 0, bubbles: true }));
          c.dispatchEvent(new MouseEvent('mouseup', { clientX: p.x, clientY: p.y, button: 0, bubbles: true }));
        });
        const l = window.__gw.ppToClient(wpts[wpts.length - 1].x, wpts[wpts.length - 1].y);
        c.dispatchEvent(new MouseEvent('dblclick', { clientX: l.x, clientY: l.y, button: 0, bubbles: true }));
      },
      /* 组页画布：先打两个探针点反解出仿射变换，再把世界坐标换成 client 坐标。
         ★ 不复制页面内部的 view 结构（它是私有的）；用「打点 → 读回世界坐标」反解，
           页面改了 fit 算法也不会让探针失效。 */
      calib: function () {
        const c = document.getElementById('grCanvas');
        const r = c.getBoundingClientRect();
        const W = window.__runyeGroupWork;
        const fire = (x, y) => c.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, button: 0, bubbles: true }));
        const u1 = 80, v1 = 60, u2 = 260, v2 = 300;
        fire(r.left + u1, r.top + v1);
        fire(r.left + u2, r.top + v2);
        const d = (W.draw || []).slice(-2);
        if (d.length < 2) return null;
        const sx = (u2 - u1) / (d[1].x - d[0].x), sy = (v2 - v1) / (d[1].y - d[0].y);
        return {
          rect: r, sx: sx, sy: sy,
          ox: u1 - d[0].x * sx, oy: v1 - d[0].y * sy
        };
      },
      grToClient: function (cal, mx, my) {
        return { x: cal.rect.left + mx * cal.sx + cal.ox, y: cal.rect.top + my * cal.sy + cal.oy };
      },
      grFire: function (type, x, y) {
        document.getElementById('grCanvas')
          .dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true }));
      },
      esc: function () { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); },
      /* 组页画布像素采样：ctx 被 setTransform(dpr,...) 过，取图要乘 dpr */
      px: function (cal, mx, my) {
        const c = document.getElementById('grCanvas');
        const ctx = c.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const p = window.__gw.grToClient(cal, mx, my);
        const x = Math.round((p.x - cal.rect.left) * dpr), y = Math.round((p.y - cal.rect.top) * dpr);
        if (x < 0 || y < 0 || x >= c.width || y >= c.height) return null;
        const d = ctx.getImageData(x, y, 1, 1).data;
        return [d[0], d[1], d[2]];
      },
      bg: function () {
        const c = document.getElementById('grCanvas');
        const d = c.getContext('2d').getImageData(4, 4, 1, 1).data;
        return [d[0], d[1], d[2]];
      },
      /* 汇总表解析：把 tbody 按分组切成 [{grp, rows:[[..]]}] */
      matTable: function () {
        const trs = Array.prototype.slice.call(document.querySelectorAll('#grMat tbody tr'));
        const out = [];
        trs.forEach((tr) => {
          const tds = Array.prototype.slice.call(tr.querySelectorAll('td'));
          if (tr.classList.contains('gr-grp')) { out.push({ grp: tds[0].textContent.trim(), rows: [] }); return; }
          if (!out.length) out.push({ grp: '(无分组)', rows: [] });
          out[out.length - 1].rows.push({
            sum: tr.classList.contains('gr-sum'),
            cells: tds.map((t) => t.textContent.trim())
          });
        });
        return out;
      },
      show: function (id) {
        try { if (window.ryShowSection) window.ryShowSection(document.getElementById(id), null); } catch (e) {}
      },
      active: function (id) { return document.getElementById(id).classList.contains('ry-active'); }
    };
  });

  /* ================= G0 反向对照：非成组地块 =================
   * ★ 先证明「不是成组时新页是空态」—— 否则 G1「2 块被接管」和
   *   G6「三级页能进」都可能是恒绿。 */
  console.log('\n— G0 反向对照：非成组时「成组管路」页应为空态 —');
  const g0 = await page.evaluate(async () => {
    const G = window.__gw;
    window.measuredPolygon = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }];
    window.measuredArea = 120000;
    window.measuredPolygonSource = 'area';
    window.__runyeSubPlots = null;
    if (typeof window.ppLoadPolygon === 'function') window.ppLoadPolygon();
    await new Promise((r) => setTimeout(r, 300));
    G.show('grPipeSection');
    if (typeof window.grRefreshGroupPage === 'function') window.grRefreshGroupPage();
    await new Promise((r) => setTimeout(r, 400));
    return {
      blocks: G.W().blocks.length,
      emptyShown: getComputedStyle(document.getElementById('grEmpty')).display !== 'none',
      count: document.getElementById('grBlockCount').textContent,
      mu: document.getElementById('grTotalMu').textContent,
      hint: (document.getElementById('grBlocks').textContent || '').indexOf('当前不是成组地块') >= 0,
      backBarShown: getComputedStyle(document.getElementById('grTlBackBar')).display !== 'none'
    };
  });
  console.log('        ' + JSON.stringify(g0));
  check('G0a 非成组：数据层为空（0 块）', g0.blocks === 0, 'blocks=' + g0.blocks);
  check('G0b 非成组：画布显示空态提示', g0.emptyShown === true);
  check('G0c 非成组：侧栏显示 0 块 / — 亩', g0.count === '0' && g0.mu === '—', g0.count + ' 块 / ' + g0.mu + ' 亩');
  check('G0d 非成组：子地块列表给出提示文案', g0.hint === true);
  check('G0e 非成组：三级页返回条隐藏', g0.backBarShown === false);

  /* ================= 装载成组地块 ================= */
  await page.evaluate((FIX) => {
    window.measuredPolygon = FIX.frame.map((p) => ({ x: p.x, y: p.y }));
    window.measuredArea = 240000;
    window.measuredPolygonSource = 'map';
    window.__runyeGroupName = '成组地块A';
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

  /* ================= G1 数据层接管 ================= */
  console.log('\n— G1 组页数据层：接管二级页的各块 —');
  const g1 = await page.evaluate(async () => {
    const G = window.__gw;
    G.show('grPipeSection');
    if (typeof window.grRefreshGroupPage === 'function') window.grRefreshGroupPage();
    await new Promise((r) => setTimeout(r, 500));
    const W = G.W();
    return {
      blocks: W.blocks.length,
      mu: W.blocks.map((b) => b.mu),
      ringSig: W.blocks.map((b) => G.sig(b.ring)),
      frameSig: G.sig(W.frame),
      slotOk: W.blocks.every((b) => b.slot && typeof b.slot === 'object'),
      barName: document.getElementById('grPlotName').textContent,
      barCount: document.getElementById('grBlockCount').textContent,
      barMu: document.getElementById('grTotalMu').textContent,
      emptyShown: getComputedStyle(document.getElementById('grEmpty')).display !== 'none',
      navItems: document.querySelectorAll('#grBlocks .gr-block').length,
      active: G.active('grPipeSection')
    };
  });
  console.log('        ' + JSON.stringify(g1));
  check('G1a 成组后组页切得过去（section 带 ry-active）', g1.active === true);
  check('G1b 数据层接管了 2 块', g1.blocks === 2, 'blocks=' + g1.blocks);
  check('G1c 各块亩数来自二级页（180 × 2）', JSON.stringify(g1.mu) === '[180,180]', JSON.stringify(g1.mu));
  check('G1d 各块环正确（0,0,300,400 / 330,0,630,400）',
    g1.ringSig[0] === '0,0,300,400' && g1.ringSig[1] === '330,0,630,400', JSON.stringify(g1.ringSig));
  check('G1e 整组外框 = 0,0,630,400（不是某一块）', g1.frameSig === '0,0,630,400', g1.frameSig);
  check('G1f 各块都带上了二级页的编辑槽', g1.slotOk === true);
  check('G1g 顶部信息条：名称 / 2 块 / 360.00 亩',
    g1.barCount === '2' && g1.barMu === '360.00' && g1.barName === '成组地块A',
    g1.barName + ' / ' + g1.barCount + ' 块 / ' + g1.barMu + ' 亩');
  check('G1h 空态提示已隐藏', g1.emptyShown === false);
  check('G1i 子地块列表渲染出 2 条', g1.navItems === 2, 'items=' + g1.navItems);

  /* ================= G2 画布总览（像素） ================= */
  console.log('\n— G2 组页画布：整组总览，两块都在 —');
  const g2 = await page.evaluate(async () => {
    const G = window.__gw;
    document.getElementById('grFit').click();          // 先适应窗口，保证采样点在画布内
    await new Promise((r) => setTimeout(r, 300));
    const W = G.W();
    document.getElementById('grTrunkDraw').click();    // 进画模式，打探针点反解变换
    const cal = G.calib();
    G.esc();                                           // 撤掉探针点，回到点选模式
    await new Promise((r) => setTimeout(r, 200));
    const bg = G.bg();
    const d = (a, b) => Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
    return {
      calOk: !!cal, bg: bg,
      A: G.px(cal, 150, 200), B: G.px(cal, 480, 200), GAP: G.px(cal, 315, 200),
      dA: d(G.px(cal, 150, 200), bg), dB: d(G.px(cal, 480, 200), bg), dGap: d(G.px(cal, 315, 200), bg),
      mode: W.mode
    };
  });
  console.log('        基准 rgba(' + g2.bg + ') / 块0 色距 ' + (g2.dA || 0).toFixed(1) +
    ' / 块1 色距 ' + (g2.dB || 0).toFixed(1) + ' / 空隙色距 ' + (g2.dGap || 0).toFixed(1));
  check('G2a 前置闸门：坐标变换反解成功（否则后面全是假绿）', g2.calOk === true);
  check('G2b 画布底色不是白（拿 white 当基准必假红）', String(g2.bg) !== '255,255,255', String(g2.bg));
  check('G2c 总览里两块都有填充（色距 > 8）',
    g2.dA > 8 && g2.dB > 8, 'A ' + (g2.dA || 0).toFixed(1) + ' / B ' + (g2.dB || 0).toFixed(1));
  check('G2d 块间空隙保持画布底色（没被外框吞成实体，色距 < 5）',
    g2.dGap < 5, '空隙 ' + (g2.dGap || 0).toFixed(1));
  check('G2e Esc 后退出画总管模式', g2.mode === 'pick', 'mode=' + g2.mode);

  /* ================= G3 总管编辑 ================= */
  console.log('\n— G3 总管：本页可画线（跨块、走在空隙里）—');
  const g3 = await page.evaluate(async () => {
    const G = window.__gw, W = G.W();
    document.getElementById('grTrunkDraw').click();          // 进画模式
    const cal = G.calib();
    G.esc();
    await new Promise((r) => setTimeout(r, 200));
    document.getElementById('grTrunkDraw').click();          // 再进一次，干净地画
    await new Promise((r) => setTimeout(r, 150));
    const p1 = G.grToClient(cal, 150, 380), p2 = G.grToClient(cal, 480, 380);
    G.grFire('click', p1.x, p1.y);
    G.grFire('click', p2.x, p2.y);
    const drawN = (W.draw || []).length;
    G.grFire('dblclick', p2.x, p2.y);                        // 收线
    await new Promise((r) => setTimeout(r, 300));
    const ln = W.trunk.lines.length;
    const len = ln ? W.trunk.lines[0].reduce(function (a, p, i, arr) {
      return i ? a + Math.sqrt((p.x - arr[i - 1].x) ** 2 + (p.y - arr[i - 1].y) ** 2) : 0;
    }, 0) : -1;
    return {
      drawN: drawN, lines: ln, len: len, mode: W.mode,
      uiLen: document.getElementById('grTrunkLen').textContent,
      uiN: document.getElementById('grTrunkN').textContent
    };
  });
  console.log('        ' + JSON.stringify(g3));
  check('G3a 画模式落了 2 个点', g3.drawN === 2, 'draw=' + g3.drawN);
  check('G3b 双击收线：总管 1 根', g3.lines === 1, 'lines=' + g3.lines);
  check('G3c 总管长度 ≈ 330 m（横穿空隙；容差 1m = 落点取整误差）',
    Math.abs(g3.len - 330) < 1.0, 'len=' + g3.len.toFixed(2));
  check('G3d 侧栏长度/根数 = 数据层算出来的值', g3.uiLen === g3.len.toFixed(1) && g3.uiN === '1',
    g3.uiLen + ' m / ' + g3.uiN + ' 根（数据层 ' + g3.len.toFixed(1) + '）');

  /* ================= G4 管径 ================= */
  console.log('\n— G4 总管管径 —');
  const g4 = await page.evaluate(async () => {
    const G = window.__gw, W = G.W();
    const sel = document.getElementById('grTrunkDn');
    const opts = sel.querySelectorAll('option').length;
    sel.value = '160'; sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 250));
    return {
      opts: opts, dn: W.trunk.dn,
      mat: document.getElementById('grTrunkMat').textContent,
      src: (typeof PE_OD_SERIES !== 'undefined') ? 'PE_OD_SERIES' : 'fallback'
    };
  });
  console.log('        ' + JSON.stringify(g4));
  check('G4a 管径下拉已填充（接 PE_OD_SERIES，非手写）', g4.opts >= 10 && g4.src === 'PE_OD_SERIES',
    g4.opts + ' 项 / 来源 ' + g4.src);
  check('G4b 改管径 → 数据层跟着变', g4.dn === 160, 'dn=' + g4.dn);
  check('G4c 材质显示同步（Ø160 mm PE）', g4.mat === 'Ø160 mm PE', g4.mat);

  /* ================= G5 汇总口径（先在二级页给块0 画一根主管）================= */
  console.log('\n— G5 材料汇总：各块明细 + 整组总管 + 合计 —');
  const g5 = await page.evaluate(async () => {
    const G = window.__gw;
    /* 走真实入口：组页 →「二级改这块的管」→ 二级页逐块态停在块0 → 画一根主管 */
    const btn = document.querySelector('#grBlocks button[data-act="l2"][data-i="0"]');
    if (btn) btn.click();
    await new Promise((r) => setTimeout(r, 700));
    const pp = {
      mode: window.__runyeGroupEdit ? window.__runyeGroupEdit.mode : null,
      cur: window.__runyeGroupEdit ? window.__runyeGroupEdit.current : -1
    };
    document.querySelector('#ppToolbar .pp-btn[data-mode="main"]').click();
    await new Promise((r) => setTimeout(r, 200));
    G.ppDraw([{ x: 60, y: 200 }, { x: 240, y: 200 }]);       // 块0 内一根 180m 主管
    await new Promise((r) => setTimeout(r, 400));
    pp.main = window.RunyeBridge.state.mainPipes.length;
    /* 回组页 */
    G.show('grPipeSection');
    if (typeof window.grRefreshGroupPage === 'function') window.grRefreshGroupPage();
    await new Promise((r) => setTimeout(r, 500));
    const W = G.W();
    const expMain0 = G.sumLen(((W.blocks[0].slot || {}).mainPipes) || []);
    const expMain1 = G.sumLen(((W.blocks[1].slot || {}).mainPipes) || []);
    const expTrunk = G.sumLen(W.trunk.lines);
    return {
      pp: pp,
      slot0Main: ((W.blocks[0].slot || {}).mainPipes || []).length,
      slot1Main: ((W.blocks[1].slot || {}).mainPipes || []).length,
      table: G.matTable(),
      trunkLines: W.trunk.lines.length,
      expMain0: expMain0, expMain1: expMain1, expTrunk: expTrunk,
      expSum: expMain0 + expMain1 + expTrunk
    };
  });
  console.log('        二级页: ' + JSON.stringify(g5.pp) + ' / slot 主管 ' + g5.slot0Main + ' , ' + g5.slot1Main);
  console.log('        汇总表: ' + JSON.stringify(g5.table));
  check('G5a 前置闸门：「二级改这块的管」把二级页切到逐块态块0',
    g5.pp.mode === 'perPlot' && g5.pp.cur === 0, JSON.stringify(g5.pp));
  check('G5b 前置闸门：块0 在二级页画上了 1 根主管', g5.pp.main === 1, 'n=' + g5.pp.main);
  check('G5c 组页数据层拿到了各块的编辑结果（块0 有 1 根、块1 是 0）',
    g5.slot0Main === 1 && g5.slot1Main === 0, g5.slot0Main + ' / ' + g5.slot1Main);
  {
    const t = g5.table;
    const grps = t.map((x) => x.grp);
    check('G5d 汇总分三组：各块明细 / 整组总管 / 合计行',
      grps.length === 2 && grps[0].indexOf('各块明细') >= 0 && grps[1].indexOf('整组总管') >= 0 &&
      t.some((x) => x.rows.some((r) => r.sum && r.cells[0] === '合计')),
      JSON.stringify(grps));
    const detail = (t[0] || {}).rows || [];
    const trunkRow = ((t[1] || {}).rows || [])[0];
    const sumRow = (t[1] || {}).rows ? (t[1].rows.find((r) => r.sum) || null) : null;
    const e0 = g5.expMain0.toFixed(1), e1 = g5.expMain1.toFixed(1), et = g5.expTrunk.toFixed(1);
    check('G5e 各块明细 2 行，且长度 = 数据层（块0 ' + e0 + '，块1 ' + e1 + '）',
      detail.length === 2 && detail[0].cells[2] === e0 && detail[1].cells[2] === e1,
      JSON.stringify(detail.map((r) => r.cells[2])));
    check('G5f 整组总管单独一行（' + et + ' m，不算进任何一块）',
      !!trunkRow && trunkRow.cells[2] === et, trunkRow ? trunkRow.cells[2] : 'null');
    check('G5g 合计行 = 各块之和 + 总管（' + g5.expSum.toFixed(1) + ' m）',
      !!sumRow && sumRow.cells[2] === g5.expSum.toFixed(1), sumRow ? sumRow.cells[2] : 'null');
    check('G5h 几何正确：块0 那根主管 ≈ 180 m（60→240）',
      Math.abs(g5.expMain0 - 180) < 1.0, 'len=' + g5.expMain0.toFixed(2));
    check('G5i 几何正确：总管 ≈ 330 m（150→480 横穿空隙）',
      Math.abs(g5.expTrunk - 330) < 1.0, 'len=' + g5.expTrunk.toFixed(2));
  }

  /* ================= G6 按块进入三级页 =================
   * ★ 关键：进入前**故意把二级页停在整组态**。
   *   这样「setGroupMode('perPlot')」才是 load-bearing —— 若少了它，
   *   ppSelectGroupPlot 只在 perPlot 态才 ppApplySlot ⇒ polyPts 会留在外框。 */
  console.log('\n— G6 按块进入三级页（进入前二级页停在整组态，最能暴露问题）—');
  const g6 = await page.evaluate(async () => {
    const G = window.__gw;
    /* 先回二级页，停在整组态 */
    G.show('pipePlanSection');
    await new Promise((r) => setTimeout(r, 400));
    document.getElementById('ppGeWhole').click();
    await new Promise((r) => setTimeout(r, 500));
    const before = {
      geMode: window.__runyeGroupEdit.mode,
      polySig: G.sig(window.RunyeBridge.state.polyPts)
    };
    /* 回组页，进块 1 的三级页 */
    G.show('grPipeSection');
    if (typeof window.grRefreshGroupPage === 'function') window.grRefreshGroupPage();
    await new Promise((r) => setTimeout(r, 400));
    window.__alerts = [];
    const btn = document.querySelector('#grBlocks button[data-act="tl"][data-i="1"]');
    if (btn) btn.click();
    await new Promise((r) => setTimeout(r, 2600));      // 三级页自动布管比较重
    const bar = document.getElementById('grTlBackBar');
    return {
      before: before,
      tlBlock: window.__runyeTlBlock,
      tlActive: G.active('tlPipePlanSection'),
      ppPolySig: G.sig(window.RunyeBridge.state.polyPts),
      mpSig: G.sig(window.measuredPolygon || []),
      tlData: !!window.tlDiagramData,
      barShown: getComputedStyle(bar).display !== 'none',
      barName: document.getElementById('grTlBlockName').textContent,
      barInfo: document.getElementById('grTlBlockInfo').textContent,
      alerts: window.__alerts.length,
      frameKept: G.sig(window.__runyeGroupFrame || [])
    };
  });
  console.log('        ' + JSON.stringify(g6));
  check('G6a 前置闸门：进入前二级页确实停在整组态（外框 0,0,630,400）',
    g6.before.geMode === 'whole' && g6.before.polySig === '0,0,630,400', JSON.stringify(g6.before));
  check('G6b ★ 三级页放行了（成组地块按块进入不该被自己拦）',
    g6.tlActive === true && g6.alerts === 0, 'active=' + g6.tlActive + ' alerts=' + g6.alerts);
  check('G6c ★ 二级页已切到块1（polyPts = 330,0,630,400，不是外框）',
    g6.ppPolySig === '330,0,630,400', g6.ppPolySig);
  check('G6d measuredPolygon 换成块1 的环', g6.mpSig === '330,0,630,400', g6.mpSig);
  check('G6e 记录了当前块号 __runyeTlBlock = 1', g6.tlBlock === 1, 'i=' + g6.tlBlock);
  check('G6f 三级页真的生成了结果（tlDiagramData 非空）', g6.tlData === true);
  check('G6g 三级页顶部返回条可见', g6.barShown === true);
  check('G6h 返回条写明「第 2 块」并说明按单地块口径',
    g6.barName.indexOf('第 2 块') >= 0 && g6.barInfo.indexOf('各块独立') >= 0,
    g6.barName + ' ／ ' + g6.barInfo);
  check('G6i 整组外框已备份（供返回时恢复）', g6.frameKept === '0,0,630,400', g6.frameKept);

  /* ================= G7 返回 ================= */
  console.log('\n— G7 返回成组管路页 —');
  const g7 = await page.evaluate(async () => {
    const G = window.__gw;
    document.getElementById('grTlBackBtn').click();
    await new Promise((r) => setTimeout(r, 900));
    const W = G.W();
    return {
      grActive: G.active('grPipeSection'),
      tlBlock: window.__runyeTlBlock,
      mpSig: G.sig(window.measuredPolygon || []),
      b1Tl: !!W.blocks[1].tlData,
      b0Tl: !!W.blocks[0].tlData,
      barShown: getComputedStyle(document.getElementById('grTlBackBar')).display !== 'none',
      tags: Array.prototype.slice.call(document.querySelectorAll('#grBlocks .gr-tag'))
        .map((t) => t.textContent.trim())
    };
  });
  console.log('        ' + JSON.stringify(g7));
  check('G7a 返回后切回「成组管路」页', g7.grActive === true);
  check('G7b 按块编辑标记已清掉（否则成组拦截从此永远放行）', g7.tlBlock === null, 'i=' + g7.tlBlock);
  check('G7c measuredPolygon 恢复成整组外框 0,0,630,400', g7.mpSig === '0,0,630,400', g7.mpSig);
  check('G7d 块1 的三级结果已存档', g7.b1Tl === true);
  check('G7e 块0 此时还没跑三级（各块独立，没被串写）', g7.b0Tl === false);
  check('G7f 三级页返回条已隐藏', g7.barShown === false);
  check('G7g 子地块列表标出「三级已生成 / 未生成」',
    g7.tags.length === 2 && g7.tags[0].indexOf('未生成') >= 0 && g7.tags[1].indexOf('已生成') >= 0,
    JSON.stringify(g7.tags));

  /* ================= G8 各块独立（第二块也要能跑）================= */
  console.log('\n— G8 再跑块0：两块结果各自存档、互不覆盖 —');
  const g8 = await page.evaluate(async () => {
    const G = window.__gw;
    G.show('grPipeSection');
    if (typeof window.grRefreshGroupPage === 'function') window.grRefreshGroupPage();
    await new Promise((r) => setTimeout(r, 400));
    const btn = document.querySelector('#grBlocks button[data-act="tl"][data-i="0"]');
    if (btn) btn.click();
    await new Promise((r) => setTimeout(r, 2600));
    const inBlock = { mpSig: G.sig(window.measuredPolygon || []), ppSig: G.sig(window.RunyeBridge.state.polyPts) };
    document.getElementById('grTlBackBtn').click();
    await new Promise((r) => setTimeout(r, 900));
    const W = G.W();
    return {
      inBlock: inBlock,
      b0Tl: !!W.blocks[0].tlData,
      b1Tl: !!W.blocks[1].tlData,
      same: JSON.stringify(W.blocks[0].tlData) === JSON.stringify(W.blocks[1].tlData),
      mpSig: G.sig(window.measuredPolygon || []),
      mu: W.blocks.map((b) => Math.round(b.mu))
    };
  });
  console.log('        ' + JSON.stringify(g8));
  check('G8a 进块0 时 measuredPolygon / polyPts 都是块0 的环（0,0,300,400）',
    g8.inBlock.mpSig === '0,0,300,400' && g8.inBlock.ppSig === '0,0,300,400', JSON.stringify(g8.inBlock));
  check('G8b 块0 的三级结果也存档了', g8.b0Tl === true);
  check('G8c 块1 的结果没被覆盖（还在）', g8.b1Tl === true);
  check('G8d 两块的结果**不相同**（各块独立算，不是同一份）', g8.same === false);
  check('G8e 返回后外框仍是整组的 0,0,630,400', g8.mpSig === '0,0,630,400', g8.mpSig);

  /* ================= G9 汇总不串味（跑完三级后复查）================= */
  console.log('\n— G9 复查汇总口径：各块明细里绝不能出现总管长度 —');
  const g9 = await page.evaluate(async () => {
    const G = window.__gw;
    G.show('grPipeSection');
    if (typeof window.grRefreshGroupPage === 'function') window.grRefreshGroupPage();
    await new Promise((r) => setTimeout(r, 500));
    const W = G.W();
    const t = G.matTable();
    const detail = (t[0] || {}).rows || [];
    const sumRow = (t[1] || {}).rows ? (t[1].rows.find((r) => r.sum) || null) : null;
    const trunkRow = ((t[1] || {}).rows || [])[0];
    const perBlock = detail.map((r) => parseFloat(r.cells[2]));
    return {
      perBlock: perBlock, trunk: trunkRow ? parseFloat(trunkRow.cells[2]) : -1,
      sum: sumRow ? parseFloat(sumRow.cells[2]) : -1,
      trunkLines: W.trunk.lines.length,
      eps: (function () {
        const s = perBlock.reduce((a, v) => a + v, 0);
        return Math.abs(s + (trunkRow ? parseFloat(trunkRow.cells[2]) : 0) - (sumRow ? parseFloat(sumRow.cells[2]) : 0));
      })()
    };
  });
  console.log('        ' + JSON.stringify(g9));
  check('G9a 各块明细仍是 2 行（没把总管摊进任何一块）', g9.perBlock.length === 2, JSON.stringify(g9.perBlock));
  /* 容差 0.2：表里每个格子都四舍五入到 1 位小数，三格相加最多带 0.15 的取整残差 */
  check('G9b 合计 = 各块之和 + 总管（误差 < 0.2 m）', g9.eps < 0.2, 'ε=' + g9.eps.toFixed(3));
  check('G9c 总管仍是单独一组，且没被摊进任何一块（≈330 m）',
    Math.abs(g9.trunk - 330) < 1.0 && g9.perBlock.every((v) => v < 200),
    'trunk=' + g9.trunk + ' 各块=' + JSON.stringify(g9.perBlock));
  check('G9d 全程无 JS 报错', errs.length === 0, errs.slice(0, 2).join(' | '));

  console.log('\n==== ' + (INJ ? '注入 ' + (INJ === 99 ? 'all' : INJ) : '正常') + '：PASS ' + pass + ' / FAIL ' + fail + ' ====');
  if (INJ) console.log('（注入体检：退出码 0 = 缺陷已被本诊断捕获；1 = 恒绿没抓到）');

  try { await page.screenshot({ path: path.join(OUT, 'grpwork_' + (INJ ? 'inj' + INJ : 'ok') + '.png') }); } catch (e) {}
  try { await browser.disconnect(); } catch (e) {}
  try { proc.kill(); } catch (e) {}

  if (INJ) process.exit(fail > 0 ? 0 : 1);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('\n[FATAL] ' + (e && e.stack ? e.stack : e));
  process.exit(2);
});
