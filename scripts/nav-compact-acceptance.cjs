/* verify_nav_compact.js —— 顶部功能区导航「紧凑高度 + 首项名称」闸门
   ═══════════════════════════════════════════════════════════════════════════
   背景（2026-09-12 用户截图 + 两条要求）：
     1) 导航栏上下高度变小一点  → html{--fn-nav-h} 42px → 36px（吸顶区 43 → 37）
     2) 首项「设计参数 · 选型对比」→「标准分区预设」
        （同步改：导航项文字 / 底部状态栏 #ryStSection / JS NAMES 映射）

   为什么必须常驻把关：
     · --fn-nav-h 是全站吸顶高度的**单一来源**，被至少三处相对引用：
         - 各功能区满屏高  height:calc(100vh - var(--fn-nav-h))
         - 跳转落点        scroll-margin-top:calc(var(--fn-nav-h) + 1px)
         - JS              stickyOffset() 实时量 .fn-nav 高度
       任一处写成硬编码数字，改高度后就会「导航变矮了、区块还留一条缝」或
       「点导航后上一个区块底部从吸顶栏下露出来」。本闸门把三处一起量住。
     · 导航项文字被 JS（NAMES 映射）与静态 HTML 各写一份，只改一处会让
       底部状态栏与导航栏显示不一致 —— 典型「改一半」缺陷。

   断言（桌面 1360×900 一组 + 窄屏 700×900 一组）：
     A. --fn-nav-h 计算值 = 36px（桌面）/ 34px（窄屏 ≤768）
     B. .fn-nav 总高 = A + 1px 底边线
     C. .fn-link 高 = A（导航项与吸顶等高）
     D. 导航项数量与顺序齐备（15 项，2026-09-27 同步：本轮新增「⚙️ 设置」；
        并修掉两处早已 stale 的点名 —— 详见下方 D 处注释）
     E. 首项文字 = 「标准分区预设」
     F. 首项仍指向 #designInput（data-target / href 未被改名带跑）
     G. 点击首项 → 底部状态栏分区名 = 「标准分区预设」（HTML 与 JS 两处同步）
     H. 吸顶贴合：#designInput 顶边 = .fn-nav 底边（scroll-margin-top 正确）
     I. 满屏跟随（桌面 ≥1101 工具模式）：#designInput 高 = 视口 − A − 1px 底边线 − 状态栏高
        —— 导航矮了 6px，区块必须正好高 6px 补回来，否则底部留缝或溢出。
        （≤1100 是滚动模式、区块按内容自然流，只断言「高 ≥ 视口」，不套满屏公式。）
     J. 全页 DOM 文本中不再出现旧名「设计参数 · 选型对比」
     K. 无 pageerror
   注：I 的第一版曾写成「≈ 视口 − A」而误报 —— 漏掉了工具模式下还要扣掉
       1px 底边线与底部状态栏（CSS 实为 calc(100vh − var(--fn-nav-h) − 1px − var(--ry-status-h))），
       且窄屏根本不套该公式。凡「满屏 = 视口 − X」类断言，X 必须把整条链扣净。
   用法：node verify_nav_compact.js [工作目录]
   输出：<工作目录>/_verify_out/nav_compact_gate.txt + 两张截图
         exit 0 = 全过 / 1 = 有失败
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const WS = process.argv[2] || path.resolve(__dirname, '..');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = path.join(WS, '_verify_out');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
const OLDNAME = '设计参数 · 选型对比';
const NEWNAME = '标准分区预设';
const EXPECT = { desktop: 36, narrow: 34 };

/* ★ [v376 2026-10-11] 必须用 ?full=1 打开，否则整份闸门都在量一个被隐藏的导航条。
   根因（本次实测定位）：mod/inline-01.js 第 1 行自 v344 起
     if(!location.search&&!location.hash) location.replace('index.html?smart=1#pipePlanSection')
   —— 裸 index.html 一律跳「智能规划落地模式」，而 runye-ai-plan.js 会给 body 加
   .ry-smart-entry，CSS 里 `body.ry-smart-entry .fn-nav{display:none}` 直接把导航条藏掉。
   于是本闸门过去量到的全是 0：H（0 vs 0 相等）、I（0 vs 833 却因 secH 也 0 而…）、
   M2b/M3（全 0）都在**空过**，红的那几条也只是因为期望值过期。
   ⇒ 修法：① 显式 ?full=1 进完整工具模式；② 加 Z 项「被测元素必须非零尺寸」，
      以后再发生「量错元素/元素被藏」，直接判红而不是静默空过。 */
/* 附 &rymock=L2：runye-entitle.js 的本地联调钩子（v358），把会员门控解锁。
   不加的话「更多 ▾」面板里绝大多数项都带「·锁」且点击被捕获阶段拦截，
   M4（点面板项 → 面板收起）永远测不到 —— 等于只测了「锁住了点不动」。 */
const ENTRY_QUERY = '?full=1&rymock=L2';

const results = [];
function check(name, cond, detail) {
  results.push({ ok: !!cond, n: name, d: detail || '' });
  console.log((cond ? '  [PASS] ' : '  [FAIL] ') + name + (detail ? '  :: ' + detail : ''));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fileUrl = p => 'file:///' + p.replace(/\\/g, '/');
/* 桌面档必须带 ?full=1（见 ENTRY_QUERY 处注释）；窄屏档沿用裸地址：
   它断言的是「≤768px 整页重定向进手机预览页」，加参数反而会挡掉 v344 的落地跳转语义。 */
const urlFor = sc => fileUrl(path.join(WS, 'index.html')) + (sc && sc.fullscreen ? ENTRY_QUERY : '');

const MEASURE = () => {
  const nav = document.querySelector('.fn-nav');
  const links = [...nav.querySelectorAll('.fn-link')];
  const first = links[0];
  const r = e => { const b = e.getBoundingClientRect(); return { w: +b.width.toFixed(2), h: +b.height.toFixed(2), top: +b.top.toFixed(2), bottom: +b.bottom.toFixed(2) }; };
  /* [v376] 满屏/吸顶断言改量 #pipePlanSection（「地块分区」）：
     #designInput 在 v346 导航收敛后已不在默认可见区块里（工具模式只显示当前功能区），
     量它恒为 0 ⇒ H/I 变成 0==0 的空过。改量「当前真正可见的功能区」。 */
  const sec = document.getElementById('pipePlanSection');
  return {
    navVar: getComputedStyle(document.documentElement).getPropertyValue('--fn-nav-h').trim(),
    nav: { ...r(nav), offsetH: nav.offsetHeight },
    link: first ? { text: first.textContent.trim(), ...r(first), offsetH: first.offsetHeight } : null,
    linkCount: links.length,
    linkTexts: links.map(a => a.textContent.trim()),
    firstTarget: first ? (first.getAttribute('data-target') || '') : '',
    firstPlug: first ? (first.getAttribute('data-ry-plugin-nav') || '') : '',
    firstHref: first ? (first.getAttribute('href') || '') : '',
    secTop: sec ? +sec.getBoundingClientRect().top.toFixed(2) : null,
    secH: sec ? +sec.getBoundingClientRect().height.toFixed(2) : null,
    innerH: window.innerHeight,
    /* 工具模式下区块满屏高还扣掉底部状态栏：
       height:calc(100vh - var(--fn-nav-h) - 1px - var(--ry-status-h))
       —— 直接量元素实高，避免变量名/边框口径不一致 */
    statusH: (function () {
      const sb = document.getElementById('ryStatusBar');
      if (!sb) return 0;
      const cs = getComputedStyle(sb);
      if (cs.display === 'none' || cs.visibility === 'hidden') return 0;
      return +sb.getBoundingClientRect().height.toFixed(2);
    })(),
    statusSection: (document.getElementById('ryStSection') || {}).textContent || '',
    bodyHasOld: document.body.innerText.indexOf('设计参数 · 选型对比') >= 0,
    bodyHasNew: document.body.innerText.indexOf('标准分区预设') >= 0,
    /* [v376] 插件导航项单独列：它们由插件体系挂载（data-ry-plugin-nav），
       顺序由插件 order 决定 —— 与老导航清单混在一条断言里只会让 D 项变得脆弱。
       这里只点名「插件 id 齐备」，标签/顺序由 _gate_plugins.cjs 的 C32/C33 把关。 */
    pluginNavIds: [...document.querySelectorAll('[data-ry-plugin-nav]')].map(e => e.getAttribute('data-ry-plugin-nav')),
    /* [v635] 「·锁」/「·同步中」是权益状态装饰，不是名字 —— runye-nav.js 的 norm()
       注释已写明「是装饰不是名字」，这里比较前必须同口径归一化。
       否则未登录（·锁）与同步中（·同步中）都会让 D/J2 假红：实测 11 项顺序全对，
       只因「地块绘制 ·锁」≠「地块绘制」就判不合格。 */
    pluginNavTexts: [...document.querySelectorAll('[data-ry-plugin-nav]')]
      .map(e => e.textContent.trim().replace(/\s*·\s*(?:锁|同步中)\s*$/, '').trim()),
    legacyTextsRaw: links.filter(a => !a.hasAttribute('data-ry-plugin-nav')).map(a => a.textContent.trim()),
    legacyTexts: links.filter(a => !a.hasAttribute('data-ry-plugin-nav'))
      .map(a => a.textContent.trim().replace(/\s*·\s*(?:锁|同步中)\s*$/, '').trim()),
    legacyCount: links.filter(a => !a.hasAttribute('data-ry-plugin-nav')).length
  };
};

(async () => {
  let browser = null;
  try {
  browser = await chromium.launch({
    channel: 'msedge', executablePath: process.env.EDGE_PATH || EDGE, headless: true,
    args: ['--allow-file-access-from-files', '--no-first-run', '--no-default-browser-check'],
  });

  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await page.setViewportSize({ width: 1360, height: 900 });
  /* [v402] 与云端插件开关解耦：abort 云端 entitle 请求 → loader fail-open 全开，
     避免「契约期望全部激活、云端开关动态 disabled」的环境性假红（同 _gate_plugins.cjs）。 */
  await page.route('**/*', route => /app\.tcloudbase\.com\/entitle/.test(route.request().url())
    ? route.abort() : route.continue());
  await page.goto(urlFor({ fullscreen: true }), { waitUntil: 'load', timeout: 90000 });
  await sleep(1600);

  const lines = [];
  lines.push('顶部功能区导航：紧凑高度 + 首项名称');
  lines.push('工作目录：' + WS);
  lines.push('');

  const scenarios = [
    /* fullscreen：桌面 ≥1101px 走工具模式，区块高度 = 100vh − 导航 − 1px − 状态栏（恰好一屏）；
       ≤1100px 是滚动模式，区块按内容自然流，不套满屏公式（只验导航自身几何）。 */
    { tag: '桌面 1360×900', w: 1360, h: 900, want: EXPECT.desktop, fullscreen: true, file: 'nav_compact_desktop.png' },
    /* [2026-10-06 修正] 原「窄屏 700×900 量 34px 导航」是**不可达场景**：
       RyMobile 的开关是 matchMedia('(max-width:768px)')（runye-mobile.js 第 4 行），
       ≤768px 整页直接 location.replace 进「手机地图界面预览」，.fn-nav 根本不存在
       ⇒ runye-nav.css 里 @media(max-width:768px) 的 34px 带在浏览器里永远量不到
       （此前该场景每次都抛 "Cannot read properties of null" 假红）。
       改成显式断言「≤768 重定向进手机预览页」，把这个行为钉住。 */
    { tag: '窄屏 700×900', w: 700, h: 900, want: EXPECT.narrow, fullscreen: false, mobileRedirect: true, file: 'nav_compact_narrow.png' }
  ];

  for (let i = 0; i < scenarios.length; i++) {
    const sc = scenarios[i];
    // 每档使用独立 page，避免桌面状态影响窄屏重定向检查。
    const pg = i === 0 ? page : await browser.newPage();
    if (i > 0) {
      pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
      await pg.setViewportSize({ width: sc.w, height: sc.h });
      /* [v402] 同主 page：云端开关解耦 */
      await pg.route('**/*', route => /app\.tcloudbase\.com\/entitle/.test(route.request().url())
        ? route.abort() : route.continue());
      await pg.goto(urlFor(sc), { waitUntil: 'load', timeout: 90000 });
      await sleep(1600);
    }

    /* ★★★ [v635] 两个前置闸门 —— 不修它们，下面 9 条断言全会假红。
       ---------------------------------------------------------------
       ① 权益就绪：runye-nav.js 的 accessState() → RyEntitle.access(feat)，
          而 access() 在 `state === null` 时**恒返回 'pending'**（三态设计，见
          runye-entitle.js:434「未取得服务端状态时必须等待」）。于是接口没返回前
          所有 feat 项都带「·同步中」+ aria-disabled + **捕获阶段拦截点击**
          （makeItem 里 e.preventDefault + stopImmediatePropagation）。
          实测：等 1.6s → 11/19 项 pending，点「地块分区」secDisp=none、区块高 0；
               等 12s → ready=true，23 项全部正常。
          ⇒ Z/G/H/I/D/E/F2 集体假红的真因是**闸门等得不够久**，不是布局坏了。
          修法 = 轮询到「.fn-pending 归零且 ready() 为真」再量（技能 §4：
          必须轮询到目标量稳定且达标再取值），超时才红 —— 不放宽任何断言。
       ② 公告模态：runye-announce.js「每次访问都弹」，全屏遮罩 z-index:11990 挂在
          body 根层叠上下文；而 body.ry-tool > .ry-nav 的 z-index:60 创建了层叠
          上下文，把面板自己的 z-index:99999 关在里面 ⇒ 对外只有 60 层，
          遮罩 11990 必然盖住面板 ⇒ M3 的 3×3 elementFromPoint 全落在遮罩上，
          稳定 0/9（连跑 3 次 + 350/700/1400ms 三个时点均 0/9，非抖动、非 v634 回归
          ——历史存档 _verify_out/nav_compact_gate.txt 同样 0/9）。
          模态盖住下层是**正确语义**，所以不改布局；这里做真实用户的第一步：关掉它。 */
    let entWait = { ok: true, ms: 0, pending: 0, ready: null, stable: 0 };
    let annClosed = { ok: true, was: false };
    if (!sc.mobileRedirect) {
      const t0 = Date.now();
      let prevSig = '', sameTimes = 0;
      for (let i = 0; i < 40; i++) {          /* 上限 20s */
        const s = await pg.evaluate(() => {
          let ready = null;
          try { ready = !!(window.RyEntitle && window.RyEntitle.ready && window.RyEntitle.ready()); } catch (e) {}
          const links = [].slice.call(document.querySelectorAll('.fn-nav .fn-link'));
          return {
            pending: links.filter(a => a.classList.contains('fn-pending')).length,
            /* 收敛签名：插件项 id + 文字。抑制器（MutationObserver）摘老项是异步的，
               pending 归零 ≠ 集合稳定 —— 必须两项都达标，否则量到「老项 + 插件项」并存态。 */
            sig: links.map(a => (a.getAttribute('data-ry-plugin-nav') || '-') + ':' + a.textContent.trim()).join('|'),
            ready,
          };
        });
        if (s.pending === 0 && s.sig === prevSig) sameTimes++; else sameTimes = 0;
        prevSig = s.sig;
        const nItems = s.sig ? s.sig.split('|').length : 0;
        entWait = { ok: s.pending === 0 && sameTimes >= 2, ms: Date.now() - t0, pending: s.pending, ready: s.ready, stable: nItems };
        if (entWait.ok) break;
        await sleep(500);
      }
      /* 公告：先走官方入口 RyAnnounce.close()，再兜底点 ×/按钮，最后轮询到遮罩消失 */
      const hadMask = await pg.evaluate(() => !!document.querySelector('.ry-ann-mask'));
      annClosed = { ok: !hadMask, was: hadMask };
      if (hadMask) {
        await pg.evaluate(() => {
          try { if (window.RyAnnounce && window.RyAnnounce.close) window.RyAnnounce.close(); } catch (e) {}
          const x = document.querySelector('.ry-ann-x'); if (x) { try { x.click(); } catch (e) {} }
          const b = [].slice.call(document.querySelectorAll('.ry-ann-btn'))
            .find(n => /开始使用|知道了|关闭/.test(n.textContent || ''));
          if (b) { try { b.click(); } catch (e) {} }
        });
        for (let i = 0; i < 12; i++) {        /* 上限 3s */
          const still = await pg.evaluate(() => !!document.querySelector('.ry-ann-mask'));
          annClosed = { ok: !still, was: true };
          if (!still) break;
          await sleep(250);
        }
      }
      check(sc.tag + ' Z0 ★前置：权益已就绪且导航项集合已收敛（否则点击被拦截 / 老项与插件项并存 → 后续全假红）',
        entWait.ok, entWait.pending + ' 项 pending / ' + entWait.stable + ' 项 / ready=' + entWait.ready + '，等 ' + entWait.ms + 'ms');
      check(sc.tag + ' Z0b ★前置：公告全屏模态已清（否则 z=11990 遮罩盖住 z=60 的导航上下文）',
        annClosed.ok, annClosed.was ? (annClosed.ok ? '已关闭' : '关不掉，仍遮挡') : '本页无公告');
    }

    if (sc.fullscreen) {
      /* [v376] 先点「地块分区」把 #pipePlanSection 切到前台，再量它（工具模式下
       非当前功能区一律 display:none，不切就量到 0）。 */
      await pg.evaluate(() => { const a = document.querySelector('.fn-link[data-target="pipePlanSection"]'); if (a) a.click(); });
      await sleep(500);
    }
    if (sc.mobileRedirect) {
      /* [2026-10-06] ≤768px 整页重定向进手机预览页（见 scenarios 处注释）——
         把这个行为本身钉住，别再假装能量窄屏导航。 */
      const mob = await pg.evaluate(() => ({
        title: document.title,
        fnNav: !!document.querySelector('.fn-nav'),
        isMobilePage: /手机地图界面预览/.test(document.title),
      }));
      check(sc.tag + ' N1 ≤768px 重定向进「手机地图界面预览」', mob.isMobilePage, 'title="' + mob.title + '"');
      check(sc.tag + ' N2 手机预览页没有 .fn-nav（34px 窄屏带在浏览器里不可达）', !mob.fnNav);
      try { await pg.screenshot({ path: path.join(OUT, sc.file), clip: { x: 0, y: 0, width: sc.w, height: Math.min(260, sc.h) } }); } catch (e) { }
      continue;
    }

    let d;
    try { d = await pg.evaluate(MEASURE); }
    catch (e) { check(sc.tag + ' 可测', false, 'evaluate 异常: ' + e.message); continue; }

    lines.push('── ' + sc.tag);
    lines.push('   --fn-nav-h=' + d.navVar + '  .fn-nav=' + d.nav.h + 'px  .fn-link=' + (d.link ? d.link.h + 'px' : '—')
      + '  首项="' + (d.link ? d.link.text : '—') + '"  项数=' + d.linkCount);
    lines.push('   #designInput top=' + d.secTop + ' h=' + d.secH + '（视口 ' + d.innerH + '）  状态栏="' + d.statusSection + '"');
    lines.push('');

    /* ★ Z：反空过前置断言（2026-10-11 补）
       曾经整份闸门量的是一个 display:none 的 .fn-nav（v344 默认跳 ?smart=1 落地模式），
       于是 B/C/H/I/M2b/M3 全都在拿 0 跟 0 比 —— 看着绿，其实一条都没测。
       先把「被测元素必须有非零尺寸」钉死：以后再量错元素，这里直接红。 */
    check(sc.tag + ' Z 被测元素非零尺寸（导航条/导航项/功能区都真的可见）',
      d.nav.h > 0 && !!d.link && d.link.h > 0 && d.secH > 0,
      '导航高=' + d.nav.h + ' 导航项高=' + (d.link ? d.link.h : '—') + ' 区块高=' + d.secH);

    const wantVar = sc.want + 'px';
    check(sc.tag + ' A --fn-nav-h = ' + wantVar, d.navVar === wantVar, '实际 ' + d.navVar);

    check(sc.tag + ' B .fn-nav 总高 = ' + (sc.want + 1) + 'px（含 1px 底边线）',
      Math.abs(d.nav.h - (sc.want + 1)) < 0.6, '实际 ' + d.nav.h + 'px');

    check(sc.tag + ' C .fn-link 高 = ' + sc.want + 'px（与吸顶等高）',
      !!d.link && Math.abs(d.link.h - sc.want) < 0.6, d.link ? '实际 ' + d.link.h + 'px' : '未找到 .fn-link');

    /* D 2026-09-13 更新：导航去重后按钮清单唯一出处是 runye-nav.js，
       实际 16 项 = 13 项 runye-nav.js 共享清单 + 主页静态特有项（⚙️生成系统图 / ⚙️设置）
       + pipe_optim_ui.js 末尾追加的「管网优化详细分析」。
       ※ 2026-10-03 同步（v194 新增「成组管路」）：它插在「二级管路」与「三级管路编辑」
         之间 —— 工作流顺序如此（二级逐块画管 → 成组管路做总管 → 三级按块深入），
         清单必须按真实顺序点名，不能只改数字。
       逐项点名而非只数个数——清单被误删/重复注入都能抓到。
       ※ 2026-09-27 同步（本轮新增「⚙️ 设置」）：同时修掉两处早已 stale 的点名 ——
         ① 顺序错：真实顺序里「经济指标分析」在「轴测图」之后、「系统图」在「过滤系统」之后；
         ② 残留已改名的「水力计算器」（该区块导航名 2026-09-17 第六十二轮已改「经济指标分析」），
            且漏了 2026-09-24 加入的「管网优化详细分析」。
         实测证据（同一闸门跑两遍）：基线目录 14 项 ≠ 期望 13 项 → 本项早已假红、无信号；
         修法是「换成真实清单」而不是放宽为只数个数——保住「误删/重复注入能抓到」的能力。
         ※ 2026-10-06 同步（v247 用户要求调序 + 折叠）：①成组管路 → 三级管路编辑之后；
           ②材料清单 → 管路拼装之前；③「管路拼装/经济指标分析/数字化建模/滴灌带查询」
           折叠进「更多 ▾」（runye-nav.js MORE_ITEMS），「管网优化详细分析」由 pipe_optim_ui.js
           追加进同一面板。document 顺序 = 顶层 10 项 + 静态 2 项 + 「更多 ▾」+ 面板 5 项 = 18 项
           （⚠ 更多 ▾ 在 DOM 里排在静态项**之后**——mount() 是 appendChild；⚙️设置 的 order:999
            只影响视觉顺序，视觉上它仍在最右。D 项一贯按 **document 顺序**点名）。
         ※ 2026-10-06 同步（v250 用户要求）：①在线地图 → 地块绘制 之前；
           ②「二级管路」改名「地块分区」；③「三级管路编辑」改名「管路规划」。 */
    /* [v377 同步水力校核壳迁移后的真实清单（document 顺序）]
       顶层 4 项（pre:1）+ 主页静态 2 项 + 智能规划 + 更多 ▾ + 面板 10 项 = 18 项。
       「水力校核」老项已由 hydraulics 插件接管（data-ry-plugin-nav，见 D2），不再在此列；
       「管网优化详细分析」由 pipe-optim 插件接管并改名为「管网优化」（同为插件项）。 */
    /* [v378] 「管路拼装」已由 plugins/pipe-assemble 接管（壳迁移），从老项清单移到插件清单；
       它在面板里的**位置不变**（仍在「系统图」之后、「经济指标分析」之前）——
       位置由 MORE_WANT 那条断言把关，这里只认「它不再是老项」。
       [v380] 「智能规划」同理，由 plugins/ai-plan 接管。 */
    /* [v387 同步（2026-10-12，两项用户指令叠加后的真实清单）]
       ① v385/v386 四功能剥离下线（多地块规划/管路拼装/经济指标分析/数字化建模入口摘除）；
       ② v387「更多」内容全部展开到顶栏：地块绘制/地形模块/材料清单/轴测图/系统图/滴灌带查询
         六项移入顶层 ITEMS，MORE_ITEMS 置空（面板保留，承接「管网优化详细分析」——
         它已由 pipe-optim 插件接管改名为「管网优化」，见 D2，不再是老项）。
       document 顺序 = 顶层共享 6 项 + 主页静态 2 项 + 展开的 5 项 + 「更多 ▾」 = 13 项。 */
    /* [v390 同步（2026-10-12 用户指令：过滤系统/材料清单/轴测图/系统图四项壳迁移为外挂插件）]
       四项老项由各自插件接管（见 D2），不再是老项；「⚙️ 生成系统图」静态按钮与
       「地块绘制」按用户明确要求留在主程序，不动。 */
    /* [v391 同步（2026-10-12 用户指令：顶栏重排 + 多地块规划恢复 + 管网优化脱开）]
       ① 智能规划第一（ai-plan 插件锚定「地块绘制」之前）；② 地块绘制移到 在线地图 之前；
       ③ 多地块规划恢复上线（v386 剥离、v391 按原条目加回，地形模块之后）；
       ④ 管网优化入口由 pipe-optim 插件直接持有（老模块不再注入按钮）。
       document 顺序 = pre 4 项 + 主页静态 3 项 + 后段 4 项 + 「更多 ▾」 = 11 项。 */
    /* [v399-file-menu 同步（2026-10-12 用户指令：导航增加「文件 ▾」统一导入/导出菜单）]
       主页新增静态项「📂 文件 ▾」（#fnFileMenu，逻辑在 mod/inline-32.js），
       视觉钉在 ⚙️设置 左侧（order 998 < 设置 999），DOM 顺序位于 ⚙️生成系统图 与 ⚙️设置 之间。
       ⚠ 按钮文本含 emoji「📂」与箭头「▾」，比较时按完整 textContent。 */
    /* [v402 同步（2026-10-12 用户指令：顶栏二次收敛）]
       ① 过滤系统/轴测图/系统图/滴灌带查询 折叠回「更多 ▾」（ITEMS→MORE_ITEMS）；
       ② 协议自检(hello-world)/参数标定(calib) 插件 nav container='.fn-more-panel' 同入面板（见 M）；
       ③ 「文件 ▾」按钮去 📂 图标（文本='文件 ▾'）并由 mod/inline-32.js relocate 挂到「地块绘制」
         之前（智能规划仍第一：ai-plan 与 relocate 同锚地块绘制前，后到者紧邻锚点）；
       ④ v346「更多内项目线上锁」退役（面板项全是上线功能，feat 门控兜底）。
       document 顺序 = 文件 ▾(runye-nav fileMenu 顶层项) + pre 4 项 + 静态 2 项
         + 地形模块/多地块规划 + 「更多 ▾」+ 面板内老项「滴灌带查询」= 11 项。
       （材料清单/过滤系统/轴测图/系统图老项被各自壳插件接管摘除，见 D2；「文件 ▾」为
         runye-nav fileMenu 顶层项、位于「地块绘制」之前、无图标；面板内老项「滴灌带查询」
         无接管插件、按 document 顺序排在「更多 ▾」btn 之后。） */
    const WANT_ITEMS = ['文件 ▾', '地块绘制', '在线地图', '地块分区', '管路规划', '⚙️ 生成系统图', '⚙️ 设置',
      '地形模块', '多地块规划', '更多 ▾', '滴灌带查询'];
    const itemsOk = d.legacyCount === WANT_ITEMS.length &&
      WANT_ITEMS.every((t, i) => d.legacyTexts[i] === t);
    check(sc.tag + ' D 老导航项数量与顺序齐备（' + WANT_ITEMS.length + ' 项）',
      itemsOk, '实际 ' + d.legacyCount + ' 项 :: ' + (d.legacyTextsRaw || d.legacyTexts).join(' / '));

    /* [v394] BOM 面板入口并入 material-list，独立导航项移除；当前共 12 项。 */
    /* [v398] +contour-dxf（等高线解析插件，TASK_contour-dxf_20261012）→ 13 项。
       注：任务书原写「13→14」，未计入 v394 已把 BOM 导航并入材料清单（13 插件 - 1 = 12 项）
       的现状，按实际导航项数对齐。 */
    /* [v635] 去掉 'iso-view'（轴测图）：plugins/iso-view/ 目录已不存在，
       产品代码（js/html/manifest）零引用，只剩 .aoci 历史索引快照里有路径记录
       ⇒ 该功能确已下线，期望清单里留着只会恒红。不是放宽，是删掉不再存在的项。 */
    const WANT_PLUGINS = ['ai-plan', 'hydraulics', 'pipe-optim', 'hello-world', 'archive', 'case-lib', 'calib', 'sprinkler',
      'filter-system', 'material-list', 'sys-view', 'contour-dxf'];
    const plugOk = WANT_PLUGINS.every(id => d.pluginNavIds.indexOf(id) >= 0)
      && d.pluginNavIds.length === WANT_PLUGINS.length;
    check(sc.tag + ' D2 插件导航项齐备（' + WANT_PLUGINS.length + ' 个，无重复）',
      plugOk, '实际 ' + d.pluginNavIds.join(' / '));

    check(sc.tag + ' E 首项文字 = 「智能规划」',
      !!d.link && d.link.text === '智能规划', '实际 "' + (d.link ? d.link.text : '') + '"');

    check(sc.tag + ' F 首项为智能规划插件项（data-ry-plugin-nav=ai-plan；独立窗口行为由冒烟闸门把关）',
      d.firstPlug === 'ai-plan',
      'data-target="' + d.firstTarget + '" href="' + d.firstHref + '" plug="' + d.firstPlug + '"');

    check(sc.tag + ' F2 智能规划在在线地图之前、在线地图在地块分区之前（v391 重排）',
      d.linkTexts.indexOf('智能规划') >= 0 && d.linkTexts.indexOf('智能规划') < d.linkTexts.indexOf('在线地图')
      && d.linkTexts.indexOf('在线地图') < d.linkTexts.indexOf('地块分区'),
      '实际 ' + d.linkTexts.join(' / '));

    // 点「地块分区」→ 状态栏分区名（验证导航项文字与状态栏 HTML/JS 两处同步）
    const clicked = await pg.evaluate(async () => {
      const a = document.querySelector('.fn-link[data-target="pipePlanSection"]');
      if (!a) return { ok: false };
      a.click();
      await new Promise(r => setTimeout(r, 450));
      return { ok: true, status: (document.getElementById('ryStSection') || {}).textContent || '' };
    });
    check(sc.tag + ' G 点「地块分区」→ 状态栏分区名 = 「地块分区」',
      clicked.ok && clicked.status === '地块分区', '实际 "' + (clicked.status || '') + '"');

    check(sc.tag + ' H 吸顶贴合：#pipePlanSection 顶边 = .fn-nav 底边',
      d.secTop !== null && Math.abs(d.secTop - d.nav.bottom) < 1.5,
      '区块顶 ' + d.secTop + ' vs 导航底 ' + d.nav.bottom);

    if (sc.fullscreen) {
      /* 工具模式满屏公式：height:calc(100vh − var(--fn-nav-h) − 1px 底边线 − var(--ry-status-h))
         —— 导航矮了 6px，区块就必须正好高 6px 补回来，否则底部会留一条空隙或溢出。 */
      const wantH = d.innerH - sc.want - 1 - d.statusH;
      check(sc.tag + ' I 满屏跟随：#pipePlanSection 高 = 视口 ' + d.innerH + ' − ' + sc.want
        + ' − 1px − ' + d.statusH + '(状态栏) = ' + wantH.toFixed(2) + 'px',
        d.secH !== null && Math.abs(d.secH - wantH) < 3,
        '实际 ' + d.secH + 'px（差 ' + (d.secH === null ? '—' : (d.secH - wantH).toFixed(2)) + '）');
    } else {
      check(sc.tag + ' I 窄屏自然流：#pipePlanSection 高 ≥ 视口（不套满屏公式）',
        d.secH !== null && d.secH >= d.innerH - 1, '实际 ' + d.secH + 'px vs 视口 ' + d.innerH);
    }

    check(sc.tag + ' J DOM 文本已无旧名「' + OLDNAME + '」',
      !d.bodyHasOld, d.bodyHasOld ? '页面仍出现旧名' : '干净');

    /* J2 原断言「DOM 含新名 标准分区预设」——该改名已被 v346 导航收敛覆盖，新名不复存在，
       留着只会恒红。换成同源且更有信号的一条：**导航不许出现同名项**
       （老项之间重复 = 注入重复；老项与插件项同名 = 用户看到两个一样入口分不清，
       该缺陷 2026-10-11 在 bom 插件上真实发生过一次）。 */
    const allTexts = d.legacyTexts.concat(d.pluginNavTexts);
    const dupNames = allTexts.filter((t, i) => allTexts.indexOf(t) !== i);
    check(sc.tag + ' J2 导航无同名项（老项之间 + 老项与插件项之间）',
      dupNames.length === 0, dupNames.length ? '重复=' + [...new Set(dupNames)].join('/') : '干净');

    /* ── M：v247「更多 ▾」折叠组（2026-10-06 用户要求）──────────────────────
       M1 默认收起  M2 点开可见 5 项且在触发钮下方  M3 面板项遮挡体检
       M4 点面板项 → 收起并切区  M5 点外部 → 收起 */
    /* [v376] 面板为 11 项；[v384] 起「管路拼装」「管网优化」已由 pipe-assemble/pipe-optim
       插件接管（老项摘除、插件项挂主导航条）⇒ 面板回落为 9 项老项。
       [v387 2026-10-12 用户指令「更多的内容都展开吧」] 9 项老项全部移入 ITEMS 顶栏、
       MORE_ITEMS 置空 ⇒ 面板仅剩 pipe-optim 插件项「管网优化」（core ui-shell makeNavEl
       class='fn-link'，container='.fn-more-panel'）。面板机制保留，承接插件注入。 */
    /* [v402 2026-10-12 用户指令「顶栏二次收敛」] 面板承接 8 项：
       插件项 7（过滤系统/材料清单代管BOM/轴测图/系统图/等高线解析/管网优化/协议自检/参数标定
       —— filter-system/iso-view/sys-view/material-list/contour-dxf 壳插件 nav
       container='.fn-more-panel' 面板化，顶层老项由接管摘除）
       + 老项 1（滴灌带查询，无接管插件、面板内保留）。
       插件项到达时序不定（面板重建/重挂多轮）⇒ 改集合断言（点名防误删，顺序不脆断）。 */
    /* [v635] 去掉「轴测图」：随 plugins/iso-view 下线一并消失（同 D2 的注释），
       面板实际 7 项 —— 过滤系统 / 系统图 / 等高线解析 / 滴灌带查询 / 管网优化 / 参数标定 / 协议自检。 */
    const MORE_WANT = ['过滤系统', '系统图', '滴灌带查询', '等高线解析', '管网优化', '协议自检', '参数标定'];
    const moreGeo = await pg.evaluate(() => {
      const more = document.querySelector('.fn-nav .fn-more');
      const btn = document.querySelector('.fn-nav .fn-more-btn');
      const panel = document.querySelector('.fn-nav .fn-more-panel');
      if (!more || !btn || !panel) return { exists: false };
      const r = e => { const b = e.getBoundingClientRect(); return { t: +b.top.toFixed(1), b: +b.bottom.toFixed(1), l: +b.left.toFixed(1), r: +b.right.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };
      /* [v358] 面板项在「无权限」时会带「 ·锁」后缀（会员门控的视觉标记）——
         它是状态装饰不是名字的一部分，比较前归一化，否则 M2/M4 全靠环境是否登录而红。 */
      const nm = a => a.textContent.trim().replace(/\s*·\s*锁\s*$/, '').trim();
      return {
        exists: true, hiddenAtStart: panel.hidden,
        btnText: btn.textContent.replace(/\s+/g, ' ').trim(),
        btn: r(btn),
        items: [...panel.querySelectorAll('.fn-link')].map(nm),
      };
    });
    check(sc.tag + ' M1 「更多 ▾」存在且面板默认收起', moreGeo.exists && moreGeo.hiddenAtStart,
      moreGeo.exists ? 'btn="' + moreGeo.btnText + '" hidden=' + moreGeo.hiddenAtStart : '缺 .fn-more/.fn-more-btn/.fn-more-panel');

    /* [v377] 重试兜底：权益就绪触发的重渲染（RyEntitle.onChange → render）是异步的，
       偶发正好落在「点开面板 → 量几何」之间，把打开态整个冲掉（实测 M2b panel.h=0 一次）。
       量出来不是「打开且可见」就重试，最多 3 次 —— 消除时序抖动误报，而不是放宽断言。 */
    const measureOpen = () => pg.evaluate(() => {
      const btn = document.querySelector('.fn-nav .fn-more-btn');
      const panel = document.querySelector('.fn-nav .fn-more-panel');
      const r = e => { const b = e.getBoundingClientRect(); return { t: +b.top.toFixed(1), b: +b.bottom.toFixed(1), l: +b.left.toFixed(1), r: +b.right.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };
      const nm = a => a.textContent.trim().replace(/\s*·\s*锁\s*$/, '').trim();
      /* ★遮挡体检：面板项 3×3 采样 elementFromPoint 必须命中面板内部 ——
         面板是 position:fixed，若被 .fn-inner 的 overflow 裁掉（历史方案会这样），
         这里会是 0/9。 */
      const probe = (el) => {
        const b = el.getBoundingClientRect();
        let hit = 0, tot = 0; const bad = [];
        for (let i = 1; i <= 3; i++) for (let j = 1; j <= 3; j++) {
          const px = Math.round(b.left + b.width * i / 4), py = Math.round(b.top + b.height * j / 4);
          const e2 = document.elementFromPoint(px, py); tot++;
          if (e2 && panel.contains(e2)) hit++; else bad.push(px + ',' + py + '=' + (e2 ? e2.tagName : 'null'));
        }
        return { hit, tot, bad: bad.slice(0, 2) };
      };
      /* [v387] 面板可能没有任何 .fn-link（MORE_ITEMS 置空 + 插件未注入的极端时序）
         → first 为 null 时给空探测结果兜底，别让 getBoundingClientRect 抛 TypeError。 */
      const first = panel.querySelector('.fn-link');
      return {
        hidden: panel.hidden, expanded: btn.getAttribute('aria-expanded'),
        items: [...panel.querySelectorAll('.fn-link')].map(nm),
        panel: r(panel), btn: r(btn), probe: first ? probe(first) : { hit: 0, tot: 0, bad: ['no .fn-link'] },
        inViewport: panel.getBoundingClientRect().bottom <= window.innerHeight + 1,
      };
    });
    let openState = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      await pg.evaluate(() => { document.querySelector('.fn-nav .fn-more-btn').click(); });
      await sleep(350);
      const s = await measureOpen();
      const good = !s.hidden && s.expanded === 'true' && s.panel.h > 0 && s.btn.h > 0;
      openState = s;
      if (good) break;
      await sleep(600);   /* 给可能正在进行/即将进行的重渲染留时间，再重试 */
    }
    /* [v402] 集合断言：无重复 + 与 MORE_WANT 互为相同集合（点名防误删，顺序不脆断） */
    const moreItemsOk = openState.items.length === MORE_WANT.length &&
      new Set(openState.items).size === openState.items.length &&
      MORE_WANT.every(t => openState.items.indexOf(t) >= 0);
    check(sc.tag + ' M2 点「更多 ▾」→ 面板打开且 ' + MORE_WANT.length + ' 项齐备', !openState.hidden && openState.expanded === 'true'
      && moreItemsOk,
      'items=' + JSON.stringify(openState.items));
    /* 反空过：面板/按钮必须有真实尺寸，否则 t/b 全 0 → 上式恒真（历史坑，见 Z 项注释） */
    check(sc.tag + ' M2b 面板在触发钮下方且不溢出视口',
      openState.panel.h > 0 && openState.btn.h > 0
      && openState.panel.t >= openState.btn.b - 1 && openState.inViewport,
      'panel.top=' + openState.panel.t + ' btn.bottom=' + openState.btn.b + ' panel.bottom=' + openState.panel.b
      + ' panel.h=' + openState.panel.h + ' btn.h=' + openState.btn.h);
    check(sc.tag + ' M3 ★面板项遮挡体检 9/9 命中面板内',
      openState.probe.tot === 9 && openState.probe.hit === openState.probe.tot,
      openState.probe.hit + '/' + openState.probe.tot + ' 被挡=' + JSON.stringify(openState.probe.bad));

    /* [v387] M4 点面板项「管网优化」（pipe-optim 插件项）→ 面板收起 + 管网优化弹窗弹出
       （旧断言点「经济指标分析」——该老项已随 v386 剥离、v387 移出面板） */
    await pg.evaluate(() => {
      const nm = a => a.textContent.trim().replace(/\s*·\s*锁\s*$/, '').trim();
      const it = [...document.querySelectorAll('.fn-nav .fn-more-panel .fn-link')]
        .find(a => nm(a) === '管网优化');
      if (it) it.click();
    });
    await sleep(650);
    const afterClick = await pg.evaluate(() => {
      const ov = document.getElementById('poOverlay');
      return {
        hidden: document.querySelector('.fn-nav .fn-more-panel').hidden,
        overlayShown: !!ov && getComputedStyle(ov).display !== 'none',
      };
    });
    check(sc.tag + ' M4 点面板项「管网优化」→ 面板收起且弹窗弹出', afterClick.hidden === true && afterClick.overlayShown,
      'hidden=' + afterClick.hidden + ' overlay=' + afterClick.overlayShown);
    /* [v387] 收尾：关掉弹窗再进 M5 —— poOverlay 是全屏遮罩，不关会吃掉 M5 的「点外部」坐标点击 */
    await pg.evaluate(() => { const ov = document.getElementById('poOverlay'); if (ov) ov.style.display = 'none'; });
    await sleep(150);

    /* M5 点外部 → 收起（重新打开再点页面空白处） */
    await pg.evaluate(() => { document.querySelector('.fn-nav .fn-more-btn').click(); });
    await sleep(250);
    await pg.mouse.click(680, 500);
    await sleep(350);
    const afterOutside = await pg.evaluate(() => document.querySelector('.fn-nav .fn-more-panel').hidden);
    check(sc.tag + ' M5 点面板外 → 面板收起', afterOutside === true, 'hidden=' + afterOutside);

    try { await pg.screenshot({ path: path.join(OUT, sc.file), clip: { x: 0, y: 0, width: sc.w, height: Math.min(260, sc.h) } }); } catch (e) { }
  }

  check('K 无页面运行期异常', errs.length === 0, errs.slice(0, 3).join(' | '));

  const pass = results.filter(r => r.ok).length;
  const fail = results.length - pass;
  lines.push('');
  lines.push('【断言结果】');
  results.forEach(r => lines.push('  ' + (r.ok ? 'PASS' : 'FAIL') + '  ' + r.n + (r.d ? '  :: ' + r.d : '')));
  lines.push('');
  lines.push('共 ' + results.length + ' 项，通过 ' + pass + '，失败 ' + fail);

  fs.writeFileSync(path.join(OUT, 'nav_compact_gate.txt'), lines.join('\n'), 'utf8');

  process.exitCode = fail === 0 ? 0 : 1;
  } catch (error) {
    console.error('导航紧凑回归运行失败：' + (error.stack || error.message));
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
})();
