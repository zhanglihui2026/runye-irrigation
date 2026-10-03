/* 二级管路页「成组地块 = 不吃掉块间空隙」· 真渲染验证（Edge/CDP）
 *
 * 用户原话（2026-10-03，连续两次）：
 *   「在线地图中两个地块之间明显是有空隙的，你怎么就给吃掉了。」
 *   「告诉你了不要拼接到一起…两个小地块中间那个区域…不要自动填充面积，这里就空着。」
 *
 * 病灶：地图侧 v189 已经把「各子地块环」传到 window.__runyeSubPlots，
 *       但二级页的绘制 / 算面积全都只认 ppState.polyPts（= 外框 / 凸包）
 *       ⇒ 块间空隙在二级页被当成地块本体填色、并入面积。
 *
 * 本探针真跑一遍「加载成组地块 → 生成施工图」，对**渲染产物**下断言：
 *   A1 施工图的地块 path 必须有 N 条子路径（每个成员环一条）⇒ 空隙留空
 *   A2 分区「实际亩数」= Σ 成员环，而不是外框面积 ⇒ 空隙不计入面积
 *   A3 旋转落定后子地块环跟随旋转（否则主轮廓转了、子块没转，错位）
 *   A4 镜像后子地块环跟随镜像
 *
 * 铁律（headless-render-verify）：
 *   · 独立 --user-data-dir（否则 msedge 单实例转发、静默退出）
 *   · spawn Edge + --remote-debugging-port + puppeteer.connect（不用 launch()）
 *   · --allow-file-access-from-files（否则 file:// 下资源被拦）
 *
 * 用法：
 *   node _p1/_probe_subplot_gap.cjs              # 正常：全绿=0 / 有红=1
 *   node _p1/_probe_subplot_gap.cjs --inject 1   # SVG d 退回单条外框 → A1 必须红
 *   node _p1/_probe_subplot_gap.cjs --inject 2   # 面积退回外框口径 → A2 必须红
 *   node _p1/_probe_subplot_gap.cjs --inject 3   # 去掉旋转同步 → A3 必须红
 *   node _p1/_probe_subplot_gap.cjs --inject 4   # 去掉镜像同步 → A4 必须红
 *   node _p1/_probe_subplot_gap.cjs --inject all
 *
 * 退出码语义（用户长期教训：新写的契约必须靠「注入缺陷 → 断言非零退出」来证）：
 *   正常：全绿 0 / 有红 1
 *   注入：缺陷已被捕获 0 / 恒绿(没抓到) 1 / 锚点漂移 2（不静默放行）
 */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');

const WS = 'C:\\Users\\AHS\\runye-irrigation';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = path.join(WS, '_verify_out');
const PORT = 9461;
const INJ = (() => {
  const i = process.argv.indexOf('--inject');
  if (i < 0) return 0;
  const v = process.argv[i + 1];
  return v === 'all' ? 99 : (parseInt(v, 10) || 0);
})();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileUrl = (p) => 'file:///' + p.replace(/\\/g, '/');

const SRC_HTML = path.join(WS, 'index.html');

/* ---- 注入：就地把 index.html 的字面锚点替换掉，生成一份临时副本供页面加载 ---- */
function makeInjectedCopy() {
  const orig = fs.readFileSync(SRC_HTML, 'utf8');
  let s = orig;
  const applied = [];
  const sub1 = (anchor, rep, tag) => {
    const cnt = s.split(anchor).length - 1;
    if (cnt !== 1) { console.error('[inject] 锚点' + tag + ' 漂移：期望 1 处，实际 ' + cnt + ' 处 :: ' + anchor.slice(0, 70)); process.exit(2); }
    s = s.replace(anchor, rep);
    applied.push(tag);
  };

  if (INJ === 1 || INJ === 99) {
    /* 施工图 path 退回「只写一条外框」⇒ d 里只有 1 个 M ⇒ A1 必须红 */
    sub1('var _svgRings=ppGetRotatedSubRings()||[ppGetRotatedPlotPoints()];',
      'var _svgRings=[ppGetRotatedPlotPoints()]; // [inject 1] 退回只用外框', '1');
  }
  if (INJ === 2 || INJ === 99) {
    /* 分区面积退回「整块外框」口径 ⇒ 空隙被并进面积 ⇒ A2 必须红 */
    sub1('    var rings=ppGetSubPlotRings();\n    if(rings){\n      var sum=0;',
      '    var rings=null; // [inject 2] 退回外框口径\n    if(rings){\n      var sum=0;', '2');
  }
  if (INJ === 3 || INJ === 99) {
    /* 旋转落定不同步子地块环 ⇒ 主轮廓转了、子块没转 ⇒ A3 必须红 */
    sub1('ppXformSubRings(function(pt){return ppRotatePoint(pt,deg,_rotC);});',
      '/* [inject 3] ppXformSubRings(function(pt){return ppRotatePoint(pt,deg,_rotC);}); */', '3');
  }
  if (INJ === 4 || INJ === 99) {
    /* 镜像不同步子地块环 ⇒ A4 必须红 */
    sub1('ppXformSubRings(tf2); // [v190] 子地块环随主轮廓一起应用新镜像',
      '/* [inject 4] ppXformSubRings(tf2); */', '4');
  }
  if (INJ === 5 || INJ === 99) {
    /* 画布绘制退回「只描外框」⇒ 空隙被填色 ⇒ A2f 必须红
       （A1 只覆盖 SVG 的 d，画布走的是 ppTracePlotPath，是另一条代码路径） */
    sub1('    var rings=ppGetRotatedSubRings();\n    ppCtx.beginPath();',
      '    var rings=null; // [inject 5] 画布退回只画外框\n    ppCtx.beginPath();', '5');
  }

  /* ⚠ 临时副本必须写在**与 index.html 同一目录**：页面的 css/js 都是相对路径引用，
     放到 _verify_out/ 会让它们全部 404 ⇒ 脚本没跑 ⇒ 前置闸门 exit 2。 */
  const p = path.join(WS, '_inj_subgap.html');
  fs.writeFileSync(p, s, 'utf8');
  console.log('[inject] 已注入 ' + applied.join(' / ') + ' → 临时副本 ' + p);
  return p;
}

let pass = 0, fail = 0;
const check = (n, ok, extra) => {
  console.log((ok ? '  [PASS] ' : '  [FAIL] ') + n + (extra ? ' :: ' + extra : ''));
  ok ? pass++ : fail++;
};

/* ---------- 夹具：两块 300×400 的子地块，中间留 30m 缝 ----------
 *   外框（ppState.polyPts / measuredPolygon）= 0..630 × 0..400 = 252000 ㎡ = 378.0 亩
 *   子地块 A = 0..300 × 0..400           = 120000 ㎡
 *   子地块 B = 330..630 × 0..400         = 120000 ㎡
 *   成员之和                              = 240000 ㎡ = 360.0 亩
 *   空隙                                  = 300..330 × 0..400 = 12000 ㎡ = 18.0 亩
 * ★ 缝特意放大到 30m（真实场景常是 3m）：378.0 vs 360.0 差 18 亩，
 *   断言「必须是 360、不能是 378」才有鉴别力 —— 若只差 1.8 亩，四舍五入后两边都可能写 361，
 *   断言就退化了（用户教训：先问有没有反例能让断言变红）。 */
const FIX = {
  frame: [{ x: 0, y: 0 }, { x: 630, y: 0 }, { x: 630, y: 400 }, { x: 0, y: 400 }],
  rings: [
    [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 400 }, { x: 0, y: 400 }],
    [{ x: 330, y: 0 }, { x: 630, y: 0 }, { x: 630, y: 400 }, { x: 330, y: 400 }]
  ],
  frameMu: +(630 * 400 / 666.67).toFixed(1),   // 378.0
  sumMu: +(240000 / 666.67).toFixed(1)         // 360.0
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const target = INJ ? makeInjectedCopy() : SRC_HTML;
  const proc = spawn(EDGE, [
    '--headless=new', '--allow-file-access-from-files',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(OUT, 'profile_subgap'),
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
  await page.setViewport({ width: 1500, height: 950 });
  await page.goto(fileUrl(target), { waitUntil: 'load', timeout: 90000 });
  await sleep(1500);
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload({ waitUntil: 'load' });
  await sleep(1500);

  /* 切到二级管路页（#pipePlanSection 的 edit 屏）—— 工具栏要真的排版出来 */
  await page.evaluate(() => {
    try { window.ryShowSection(document.getElementById('pipePlanSection'), null); } catch (e) {}
  });
  await sleep(900);
  await page.evaluate(() => {
    try {
      const sec = document.getElementById('pipePlanSection');
      if (sec && sec.getAttribute('data-ry-view') !== 'edit') sec.setAttribute('data-ry-view', 'edit');
      document.body.setAttribute('data-ry-sec', 'pipePlanSection');
    } catch (e) {}
  });
  await sleep(600);
  {
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
  }

  /* ---------- 装载成组地块夹具并生成施工图 ---------- */
  await page.evaluate((FIX) => {
    window.measuredPolygon = FIX.frame.map((p) => ({ x: p.x, y: p.y }));
    window.measuredArea = 240000;                 // 地图侧口径：成员之和（不含空隙）
    window.measuredPolygonSource = 'map';
    window.__runyeSubPlots = FIX.rings.map(function (r, i) {
      return {
        id: 'sub' + (i + 1), name: '子地块' + (i + 1), mu: 180, sqm: 120000,
        crop: '七彩花生', polyLatLng: [], center: null,
        poly: r.map((q) => ({ x: q.x, y: q.y }))
      };
    });
    if (typeof window.ppLoadPolygon === 'function') window.ppLoadPolygon();
    /* ★ 必须先把「地块划分」关掉 ⇒ 整块只有一个分区，该区的「实际亩数」才是
       「Σ 成员环」vs「外框」的直接对照（开着的时候 22 个小区、每区只有几亩，
       对照的是「小区里有没有空隙」，鉴别力被摊薄 —— 实测踩到）。 */
    if (typeof window.ppSetZoneAuto === 'function') window.ppSetZoneAuto(false);
    if (typeof window.ppGenerateDiagram === 'function') window.ppGenerateDiagram({ scroll: false });
  }, FIX);
  await sleep(1000);

  /* 前置闸门：施工图真的出来了（否则 A1/A2 恒绿、全无鉴别力） */
  const pre = await page.evaluate(() => {
    const svg = document.querySelector('#ppDiagramContent svg');
    const g = document.querySelector('#ppDiagramContent g#ppPlotGroup');
    return { hasSvg: !!svg, hasGroup: !!g, paths: g ? g.querySelectorAll('path').length : -1 };
  });
  {
    const rects = await page.evaluate(() => {
      const g = document.querySelector('#ppDiagramContent g.pp-zone-layer');
      return g ? g.querySelectorAll('rect').length : -1;
    });
    /* 基准闸门：必须是**单区**。多区的话「Σ成员环 vs 外框」的差额被摊到每个小区里，
       断言失去鉴别力（用户教训：样本退化 ⇒ 恒绿）。 */
    if (rects !== 1) {
      console.error('\n[FATAL] 分区数 = ' + rects + '（应为 1）—— 「地块划分」未关闭，A2 组断言无鉴别力。');
      try { await browser.disconnect(); } catch (e) {}
      try { proc.kill(); } catch (e) {}
      process.exit(2);
    }
  }
  if (!pre.hasSvg || !pre.hasGroup || pre.paths < 1) {
    console.error('\n[FATAL] 施工图未生成 —— 后续断言无效。' + JSON.stringify(pre));
    try { await browser.disconnect(); } catch (e) {}
    try { proc.kill(); } catch (e) {}
    process.exit(2);
  }
  console.log('[setup] 施工图已生成 ' + JSON.stringify(pre));
  console.log('[夹具] 外框 ' + FIX.frameMu + ' 亩 / 成员之和 ' + FIX.sumMu + ' 亩 / 空隙 ' + (FIX.frameMu - FIX.sumMu).toFixed(1) + ' 亩\n');

  /* ---------- 观测 1：地块 path 的子路径数 ---------- */
  const dInfo = await page.evaluate(() => {
    const g = document.querySelector('#ppDiagramContent g#ppPlotGroup');
    const d = g ? (g.querySelector('path') || {}).getAttribute ? g.querySelector('path').getAttribute('d') : null : null;
    if (!d) return null;
    return {
      d: d,
      mCount: (d.match(/M/g) || []).length,
      zCount: (d.match(/Z/gi) || []).length
    };
  });
  console.log('\n— A1 施工图地块 path —');
  check('A1a 地块 path 存在', !!dInfo);
  if (dInfo) {
    console.log('        d = ' + (dInfo.d.length > 160 ? dInfo.d.slice(0, 160) + '…' : dInfo.d));
    /* 两条子路径 = 两个成员环各画一圈 ⇒ 块间空隙不在任何一条子路径里 ⇒ 自然留空 */
    check('A1b 子路径数 = 2（每个成员环一条，空隙留空）', dInfo.mCount === 2, 'M×' + dInfo.mCount);
    check('A1c 每条子路径都闭合', dInfo.zCount === 2, 'Z×' + dInfo.zCount);
  }

  /* ---------- 观测 2：分区「实际亩数」口径 ---------- */
  const areaInfo = await page.evaluate(() => {
    const svg = document.querySelector('#ppDiagramContent svg');
    if (!svg) return null;
    const texts = [].slice.call(svg.querySelectorAll('text')).map((t) => (t.textContent || '').trim());
    const header = texts.find((t) => t.indexOf('面积') === 0) || '';
    const actual = texts.filter((t) => t.indexOf('实际') === 0);
    const m = actual.length ? actual[0].match(/实际\s*([\d.]+)\s*亩/) : null;
    return { header: header, actualTexts: actual, actualMu: m ? parseFloat(m[1]) : null, all: texts };
  });
  console.log('\n— A2 分区实际面积口径 —');
  check('A2a 施工图里有「实际 X 亩」标注（说明该区被判为非标区）', !!(areaInfo && areaInfo.actualMu !== null),
    areaInfo ? JSON.stringify(areaInfo.actualTexts) : 'no svg');
  if (areaInfo && areaInfo.actualMu !== null) {
    console.log('        标注 = ' + areaInfo.actualTexts[0] + '  / 表头 = ' + areaInfo.header);
    const v = areaInfo.actualMu;
    check('A2b 实际亩数 = Σ 成员环（' + FIX.sumMu + ' 亩，±1%）', Math.abs(v - FIX.sumMu) <= FIX.sumMu * 0.01,
      '实测 ' + v + ' 亩');
    /* 反向对照：绝不能是外框 378.0 亩 —— 差 18 亩，远大于任何舍入误差 */
    check('A2c 实际亩数 ≠ 外框面积（' + FIX.frameMu + ' 亩）⇒ 空隙没被并进面积',
      Math.abs(v - FIX.frameMu) > (FIX.frameMu - FIX.sumMu) * 0.5, '实测 ' + v + ' 亩');
  }
  if (areaInfo) {
    console.log('        表头 = ' + areaInfo.header);
    check('A2d 表头标注「非标准 1 区」（= 该区确实小于标准区，证明不是整块外框）',
      /非标准\s*1\s*区/.test(areaInfo.header), areaInfo.header);
  }

  /* ---------- 观测 2b：画布像素 —— 空隙到底有没有被填色 ----------
   * SVG 的 d 只证明「path 写对了」；用户肉眼看到的是**画布**。这里直接取像素：
   * 地块内（有分区底色）vs 块间空隙（应为画布底色，无任何填充）。
   * ★ 先把「地块划分」开回来 —— 关闭时分区层被 CSS 隐藏、只剩 6% 的极淡地块底色，
   *   地块内与空隙的色差只有十几个色阶，判据没有鉴别力（实测会退化）。 */
  console.log('\n— A2b 画布像素：空隙有没有被填充 —');
  const px = await page.evaluate(async () => {
    if (typeof window.ppSetZoneAuto === 'function') window.ppSetZoneAuto(true);
    if (typeof window.ppRender === 'function') window.ppRender();
    await new Promise((r) => setTimeout(r, 400));
    const st = window.RunyeBridge && window.RunyeBridge.state;
    const t = st && st.transform;
    const c = document.getElementById('ppCanvas');
    if (!t || !c) return { err: 'no transform/canvas' };
    const ctx = c.getContext('2d');
    const toC = (mx, my) => ({
      x: (mx - t.minX) * t.scaleX * t.scale + t.offsetX + (st.panX || 0),
      y: (my - t.minY) * t.scaleY * t.scale + t.offsetY + (st.panY || 0)
    });
    const at = (mx, my) => {
      const p = toC(mx, my);
      const d = ctx.getImageData(Math.round(p.x), Math.round(p.y), 1, 1).data;
      return [d[0], d[1], d[2], d[3]];
    };
    /* ★ 基准取「画布自身的空白处」（左上角，远离地块），而不是想当然的纯白 ——
       实测画布并非纯白（有底色/网格），硬编码 white 会让判据失真。 */
    const corner = ctx.getImageData(4, 4, 1, 1).data;
    const corner2 = ctx.getImageData(c.width - 5, 4, 1, 1).data;
    return {
      inA: at(150, 200), inB: at(480, 200),
      gap: at(315, 200), gap2: at(315, 120), gap3: at(315, 300),
      bgRef: [corner[0], corner[1], corner[2], corner[3]],
      bgRef2: [corner2[0], corner2[1], corner2[2], corner2[3]]
    };
  });
  {
    const dist = (a, b) => Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
    if (px.err) {
      check('A2e 画布可采样', false, px.err);
    } else {
      console.log('        画布空白基准 = rgba(' + px.bgRef + ') / rgba(' + px.bgRef2 + ')');
      console.log('        地块A内 = rgba(' + px.inA + ')  地块B内 = rgba(' + px.inB + ')');
      console.log('        空隙    = rgba(' + px.gap + ') / rgba(' + px.gap2 + ') / rgba(' + px.gap3 + ')');
      const b1 = px.bgRef, b2 = px.bgRef2;
      const dA = Math.min(dist(px.inA, b1), dist(px.inA, b2));
      const dB = Math.min(dist(px.inB, b1), dist(px.inB, b2));
      const dG = Math.min(dist(px.gap, b1), dist(px.gap, b2));
      const dG2 = Math.min(dist(px.gap2, b1), dist(px.gap2, b2));
      const dG3 = Math.min(dist(px.gap3, b1), dist(px.gap3, b2));
      /* 基准闸门：地块内必须真的有底色，否则「空隙 = 画布空白」这条断言恒真、无鉴别力 */
      check('A2e 地块内确实有分区底色（与画布空白色距 > 40，证明基准非空）', dA > 40 && dB > 40,
        'A ' + dA.toFixed(1) + ' / B ' + dB.toFixed(1));
      /* 空隙必须与画布空白**同色**（三个采样点都成立）⇒ 那里什么都没画 */
      check('A2f 块间空隙与画布空白同色（色距 < 10）⇒ 空隙确实没被填充',
        dG < 10 && dG2 < 10 && dG3 < 10,
        dG.toFixed(1) + ' / ' + dG2.toFixed(1) + ' / ' + dG3.toFixed(1));
    }
    /* 把「地块划分」关回单区，供后续 A3/A4 用 */
    await page.evaluate(async () => {
      if (typeof window.ppSetZoneAuto === 'function') window.ppSetZoneAuto(false);
      if (typeof window.ppRender === 'function') window.ppRender();
      await new Promise((r) => setTimeout(r, 300));
    });
  }

  /* ---------- 观测 3：旋转落定后子地块环跟随 ---------- */
  console.log('\n— A3 旋转落定同步 —');
  const rot = await page.evaluate(async () => {
    const inp = document.getElementById('ppPlotAngle');
    if (inp) { inp.value = '30'; inp.dispatchEvent(new Event('input', { bubbles: true })); }
    await new Promise((r) => setTimeout(r, 300));
    const btn = document.getElementById('ppRepartition');
    if (btn) btn.click();
    await new Promise((r) => setTimeout(r, 500));
    const bbox = (pts) => {
      let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
      pts.forEach((p) => { a = Math.min(a, p.x); b = Math.min(b, p.y); c = Math.max(c, p.x); d = Math.max(d, p.y); });
      return { minX: a, minY: b, maxX: c, maxY: d };
    };
    const subs = (window.__runyeSubPlots || []).slice();
    let union = [];
    subs.forEach((s) => { if (s && s.poly) union = union.concat(s.poly); });
    const frame = window.measuredPolygon || [];
    return { subBox: union.length ? bbox(union) : null, frameBox: frame.length ? bbox(frame) : null };
  });
  console.log('        子环并集 bbox = ' + JSON.stringify(rot.subBox));
  console.log('        主轮廓   bbox = ' + JSON.stringify(rot.frameBox));
  {
    const a = rot.subBox, b = rot.frameBox;
    check('A3a 旋转后两侧 bbox 都可测', !!(a && b));
    if (a && b) {
      const dev = Math.max(Math.abs(a.minX - b.minX), Math.abs(a.minY - b.minY),
        Math.abs(a.maxX - b.maxX), Math.abs(a.maxY - b.maxY));
      check('A3b 旋转后子地块环与主轮廓仍重合（偏差 ≤ 1m）', dev <= 1.0, '偏差 ' + dev.toFixed(2) + ' m');
      /* 反例证明：注入 3（不同步）时主轮廓转 30°、子环没转 ⇒ 偏差必然 > 30m */
      check('A3c 主轮廓确实被旋转了（不是两者都没动的假绿）',
        Math.abs(b.minY - 0) > 1 || Math.abs(b.minX - 0) > 1, JSON.stringify(b));
    }
  }
  {
    const d2 = await page.evaluate(() => {
      const g = document.querySelector('#ppDiagramContent g#ppPlotGroup');
      const p = g ? g.querySelector('path') : null;
      const d = p ? p.getAttribute('d') : null;
      return d ? (d.match(/M/g) || []).length : -1;
    });
    check('A3d 旋转后施工图仍是 2 条子路径', d2 === 2, 'M×' + d2);
  }

  /* ---------- 观测 4：镜像后子地块环跟随 ----------
   * ★★ 判据不能再用「两块并集 bbox」—— 实测踩到的退化陷阱：
   *    水平镜像只是把两块左右互换，**并集 bbox 恒等于外框 bbox、镜像前后一模一样**
   *    ⇒ 不同步也能通过（注入 4 恒绿）。必须改用**逐块位置**：
   *    镜像是以「当前外框 bbox 中心 cx」为轴做 x' = 2·cx − x，
   *    故 ring0 的中心必须搬到 2·cx − x₀ 处；不搬就是没同步。 */
  console.log('\n— A4 镜像同步 —');
  const mir = await page.evaluate(async () => {
    const ctr = (pts) => {
      let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
      pts.forEach((p) => { a = Math.min(a, p.x); b = Math.min(b, p.y); c = Math.max(c, p.x); d = Math.max(d, p.y); });
      return { cx: (a + c) / 2, cy: (b + d) / 2, minX: a, maxX: c };
    };
    const frame0 = (window.measuredPolygon || []).slice();
    const f0 = frame0.length ? ctr(frame0) : null;
    const subs0 = (window.__runyeSubPlots || []).map((s) => (s && s.poly ? ctr(s.poly) : null));

    const btn = document.querySelector('.pp-mirror-btn[data-mirror="h"]');
    if (btn) btn.click();
    await new Promise((r) => setTimeout(r, 500));

    const frame1 = (window.measuredPolygon || []).slice();
    const f1 = frame1.length ? ctr(frame1) : null;
    const subs1 = (window.__runyeSubPlots || []).map((s) => (s && s.poly ? ctr(s.poly) : null));
    return { f0: f0, f1: f1, subs0: subs0, subs1: subs1 };
  });
  {
    console.log('        镜像前 外框中心 x = ' + (mir.f0 ? mir.f0.cx.toFixed(1) : '?') +
      ' / ring0 中心 x = ' + (mir.subs0[0] ? mir.subs0[0].cx.toFixed(1) : '?'));
    console.log('        镜像后 外框中心 x = ' + (mir.f1 ? mir.f1.cx.toFixed(1) : '?') +
      ' / ring0 中心 x = ' + (mir.subs1[0] ? mir.subs1[0].cx.toFixed(1) : '?'));
    const f0 = mir.f0, s0 = mir.subs0[0], s1 = mir.subs1[0];
    check('A4a 镜像前后都可测（外框 + ring0）', !!(f0 && s0 && s1));
    if (f0 && s0 && s1) {
      const expect = 2 * f0.cx - s0.cx;          // 镜像后 ring0 中心应在的位置
      const dev = Math.abs(s1.cx - expect);
      check('A4b ring0 中心落在镜像后的位置（x\' = 2·cx − x，偏差 ≤ 1m）', dev <= 1.0,
        '实测 ' + s1.cx.toFixed(1) + ' / 应为 ' + expect.toFixed(1) + ' / 偏差 ' + dev.toFixed(2));
      /* 反「两者都没动」的假绿：ring0 必须真的挪窝了，否则说明镜像根本没生效 */
      check('A4c ring0 确实挪了位置（> 50m），不是「两边都没动」的假绿',
        Math.abs(s1.cx - s0.cx) > 50, '位移 ' + Math.abs(s1.cx - s0.cx).toFixed(1) + ' m');
      /* ring1 同理（证明不是只同步了一块） */
      const t0 = mir.subs0[1], t1 = mir.subs1[1];
      if (t0 && t1) {
        const dev1 = Math.abs(t1.cx - (2 * f0.cx - t0.cx));
        check('A4d ring1 同样落在镜像后的位置（偏差 ≤ 1m）', dev1 <= 1.0, '偏差 ' + dev1.toFixed(2));
      }
    }
  }
  {
    const d3 = await page.evaluate(() => {
      const g = document.querySelector('#ppDiagramContent g#ppPlotGroup');
      const p = g ? g.querySelector('path') : null;
      const d = p ? p.getAttribute('d') : null;
      return d ? (d.match(/M/g) || []).length : -1;
    });
    check('A4e 镜像后施工图仍是 2 条子路径', d3 === 2, 'M×' + d3);
  }

  /* ---------- 观测 5：端到端「地图回传 → 二级页 → 刷新」整条链路 ----------
   * 前面 4 组都是手工塞 window.__runyeSubPlots 的**白盒**夹具；用户真实走的是
   * 「在线地图成组 → 回传 payload → 二级页 applyMapMeasuredArea 解析」。
   * 这里按真实 payload 形状写 localStorage.runyeMeasuredArea、刷新页面，
   * 验证刷新后空隙**依然不被吃**（刷新丢失 = 用户刷新一次就回到 bug，等于没修）。 */
  console.log('\n— A5 端到端回传 + 刷新 —');
  {
    const wrote = await page.evaluate((FIX) => {
      try {
        const R = 6378137, mlat = R * Math.PI / 180;
        const LAT0 = 30.0, LNG0 = 120.0;
        const frameLats = FIX.frame.map((p) => LAT0 + p.y / mlat);
        const clat = frameLats.reduce((a, b) => a + b, 0) / frameLats.length;
        const cos = Math.cos(clat * Math.PI / 180);
        /* 与页面 applyMapMeasuredArea 完全同口径：x 米 → lng，y 米 → lat */
        const ll = (x, y) => [LAT0 + y / mlat, LNG0 + x / (mlat * cos)];
        localStorage.setItem('runyeMeasuredArea', JSON.stringify({
          sqm: 240000,                 // 地图侧口径：成员之和（不含空隙）
          poly: FIX.frame.map((p) => ll(p.x, p.y)),
          merged: true, grouped: true, plotId: 'pGapTest', name: '成组地块(带缝)',
          source: 'map', ts: Date.now(),
          subPlots: FIX.rings.map(function (r, i) {
            return {
              id: 'sub' + (i + 1), name: '子地块' + (i + 1), mu: 180, sqm: 120000,
              crop: '七彩花生', polyLatLng: r.map((q) => ll(q.x, q.y)), center: null
            };
          })
        }));
        return true;
      } catch (e) { return 'ERR ' + e.message; }
    }, FIX);
    check('A5a 已按真实 payload 形状写入 localStorage', wrote === true, String(wrote));

    await page.reload({ waitUntil: 'load' });
    await sleep(1600);
    await page.evaluate(() => {
      try { window.ryShowSection(document.getElementById('pipePlanSection'), null); } catch (e) {}
    });
    await sleep(800);
    const e2e = await page.evaluate(async () => {
      const subs = window.__runyeSubPlots || [];
      const info = {
        subCount: subs.length,
        ringLens: subs.map((s) => (s && s.poly ? s.poly.length : 0)),
        hasPoly: subs.every((s) => s && Array.isArray(s.poly) && s.poly.length >= 3)
      };
      if (typeof window.ppLoadPolygon === 'function') window.ppLoadPolygon();
      if (typeof window.ppSetZoneAuto === 'function') window.ppSetZoneAuto(false);
      if (typeof window.ppGenerateDiagram === 'function') window.ppGenerateDiagram({ scroll: false });
      await new Promise((r) => setTimeout(r, 600));
      const g = document.querySelector('#ppDiagramContent g#ppPlotGroup');
      const p = g ? g.querySelector('path') : null;
      const d = p ? p.getAttribute('d') : null;
      info.mCount = d ? (d.match(/M/g) || []).length : -1;
      const svg = document.querySelector('#ppDiagramContent svg');
      const texts = svg ? [].slice.call(svg.querySelectorAll('text')).map((t) => (t.textContent || '').trim()) : [];
      const act = texts.filter((t) => t.indexOf('实际') === 0);
      const m = act.length ? act[0].match(/实际\s*([\d.]+)\s*亩/) : null;
      info.actualText = act.length ? act[0] : null;
      info.actualMu = m ? parseFloat(m[1]) : null;
      return info;
    });
    console.log('        回传后 __runyeSubPlots = ' + e2e.subCount + ' 块 / 环长 ' + JSON.stringify(e2e.ringLens));
    console.log('        施工图子路径 = M×' + e2e.mCount + ' / 面积标注 = ' + e2e.actualText);
    check('A5b 刷新后仍恢复出 2 个子地块环', e2e.subCount === 2 && e2e.hasPoly, JSON.stringify(e2e.ringLens));
    check('A5c 刷新后施工图仍是 2 条子路径（空隙留空）', e2e.mCount === 2, 'M×' + e2e.mCount);
    check('A5d 刷新后面积仍是 Σ 成员环（' + FIX.sumMu + ' 亩 ±2%），不是外框 ' + FIX.frameMu + ' 亩',
      e2e.actualMu !== null && Math.abs(e2e.actualMu - FIX.sumMu) <= FIX.sumMu * 0.02
      && Math.abs(e2e.actualMu - FIX.frameMu) > (FIX.frameMu - FIX.sumMu) * 0.5,
      '实测 ' + e2e.actualMu + ' 亩');
  }

  if (errs.length) {
    console.log('\n[pageerror] ' + errs.slice(0, 8).join('\n           '));
  }

  console.log('\n==== ' + (INJ ? '注入 ' + (INJ === 99 ? 'all' : INJ) : '正常') + '：PASS ' + pass + ' / FAIL ' + fail + ' ====');
  if (INJ) console.log('（注入体检：退出码 0 = 缺陷已被本诊断捕获；1 = 恒绿没抓到；2 = 锚点漂移）');

  try { await browser.disconnect(); } catch (e) {}
  try { proc.kill(); } catch (e) {}
  try { fs.unlinkSync(path.join(WS, '_inj_subgap.html')); } catch (e) {}

  if (INJ) process.exit(fail > 0 ? 0 : 1);   // 注入：抓到 = 0；恒绿 = 1
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('[FATAL] ' + (e && e.stack || e)); process.exit(1); });
