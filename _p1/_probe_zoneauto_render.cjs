/* 二级管路页「地块划分」开关 · 真渲染验证（Edge/CDP）
   用户反馈（2026-10-03 截图）：「这里什么都没有，这个是要控制 是否按照左侧面板的参数自动划分地块的。」
   症状假设：工具栏里只剩一个孤零零的绿色对勾，看不到「地块划分」文字。
   本探针用真浏览器渲染，量 #ppZoneAutoWrap / #ppZoneAutoTxt 的
   getBoundingClientRect() 与 getComputedStyle().color，并把
   「文字色 vs 工具栏背景色」的对比度算出来，判定「是否真的看不见」。

   铁律（headless-render-verify）：
     · 独立 --user-data-dir（否则 msedge 单实例转发、静默退出）
     · spawn Edge + --remote-debugging-port + puppeteer.connect（不用 launch()）
     · --allow-file-access-from-files（否则 file:// 下资源被拦）
   用法：
     node _p1/_probe_zoneauto_render.cjs            # 正常：全绿=0 / 有红=1
     node _p1/_probe_zoneauto_render.cjs --shot     # 额外存两张截图（开/关）
     node _p1/_probe_zoneauto_render.cjs --inject 1 # 把 v188 的深色文字规则注掉 → 必须变红
     node _p1/_probe_zoneauto_render.cjs --inject 2 # 注掉 ppSyncFineGroup 的调用 → 必须变红

   注入体检（用户长期教训：新写的契约必须靠「注入缺陷 → 断言非零退出」来证）：
     退出码语义 —— 正常：全绿 0 / 有红 1；
                   注入：缺陷已被捕获 0 / 恒绿(没抓到) 1 / 锚点漂移 2（不静默放行）。
*/
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');

const WS = 'C:\\Users\\AHS\\runye-irrigation';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = path.join(WS, '_verify_out');
const PORT = 9455;
const SHOT = process.argv.includes('--shot');
const INJ = (() => {
  const i = process.argv.indexOf('--inject');
  if (i < 0) return 0;
  const v = process.argv[i + 1];
  return v === 'all' ? 99 : (parseInt(v, 10) || 0);
})();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileUrl = (p) => 'file:///' + p.replace(/\\/g, '/');

/* ---- 注入：就地把 index.html 的字面锚点替换掉，生成一份临时副本供页面加载 ---- */
const SRC_HTML = path.join(WS, 'index.html');
function makeInjectedCopy() {
  const orig = fs.readFileSync(SRC_HTML, 'utf8');
  let s = orig;
  const applied = [];
  if (INJ === 1 || INJ === 99) {
    /* 把 v188 的深色文字规则注掉 → 文字回到白字叠浅底 → 对比度断言必须红 */
    const anchor = '#pipePlanSection .pp-toolbar>.pp-check-label{color:#334155;font-weight:500}';
    if (s.indexOf(anchor) < 0) { console.error('[inject] 锚点1 漂移：未找到「' + anchor + '」'); process.exit(2); }
    s = s.replace(anchor, '/* [inject 1] ' + anchor + ' */');
    applied.push('1: 注掉 v188 深色文字规则');
  }
  if (INJ === 2 || INJ === 99) {
    /* 把 ppSyncFineGroup 在「关掉分区」分支里的那次调用注掉
       → 微调组不再随开关从 adjustCut 退出 → 4.5b（关闭后微调组收起）必须红。
       锚点带足上下文，避免命中别处同名调用（15237 行那处是另一条路径）。 */
    const a2 = `          b.classList.toggle('active', b.getAttribute('data-mode')==='main');
        });
        ppSyncFineGroup();`;
    const cnt = s.split(a2).length - 1;
    if (cnt !== 1) { console.error('[inject] 锚点2 漂移：期望 1 处，实际 ' + cnt + ' 处'); process.exit(2); }
    s = s.replace(a2, `          b.classList.toggle('active', b.getAttribute('data-mode')==='main');
        });
        /* [inject 2] ppSyncFineGroup(); */`);
    applied.push('2: 注掉 ppSetZoneAuto 里退出 adjustCut 时的 ppSyncFineGroup()');
  }
  if (INJ === 3 || INJ === 99) {
    /* ★★ v189 核心缺陷注入：把「关闭 → 返回 1×1 单区」退回成旧的「数据照常算、
     *   只在末端隐藏」半吊子实现 —— 即让短路分支失效。
     *   期望：4.5 / 4.8b / 5.3（分区数）必须红，而 4.2（body 类）仍绿
     *   —— 精确证明「真的不划分」与「只是把线藏起来」被区分开了。 */
    const a3 = 'if(!ppZoneAutoOn()){';
    const cnt3 = s.split(a3).length - 1;
    if (cnt3 !== 1) { console.error('[inject] 锚点3 漂移：期望 1 处，实际 ' + cnt3 + ' 处'); process.exit(2); }
    s = s.replace(a3, 'if(false){ /* [inject 3] 短路失效：退回「只藏线、数据照算」的旧行为 */');
    applied.push('3: 让「关闭=不划分」短路失效（退化回旧半吊子实现）');
  }
  /* ⚠ 临时副本必须写在**与 index.html 同一目录**：页面的 css/js 都是相对路径引用，
     放到 _verify_out/ 会让它们全部 404 ⇒ 脚本没跑 ⇒ #pipePlanSection 恒 display:none
     ⇒ 探针在「工具栏未排版」前置闸门处 exit 2（本次实测踩到）。
     文件名以 `_inj_` 开头，写入后立即用完即删。 */
  const p = path.join(WS, '_inj_zoneauto.html');
  fs.writeFileSync(p, s, 'utf8');
  console.log('[inject] ' + applied.join(' / ') + ' → 临时副本 ' + p);
  return p;
}

let pass = 0, fail = 0;
const check = (n, ok, extra) => {
  console.log((ok ? '  [PASS] ' : '  [FAIL] ') + n + (extra ? ' :: ' + extra : ''));
  ok ? pass++ : fail++;
};

/* ---- 颜色工具：把 rgb(a) 解析成 [r,g,b,a] ---- */
function parseColor(s) {
  if (!s) return null;
  s = String(s).trim();
  let m = s.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const p = m[1].split(',').map((x) => parseFloat(x.trim()));
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  }
  m = s.match(/^#([0-9a-f]{6})$/i);
  if (m) {
    const h = m[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
  }
  m = s.match(/^#([0-9a-f]{3})$/i);
  if (m) {
    const h = m[1];
    return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16), 1];
  }
  return null;
}
function over(fg, bg) { // fg 半透明叠在 bg 上 → 实际可见色
  const a = fg[3];
  return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1];
}
function lum(c) {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}
function contrast(a, b) {
  const l1 = lum(a), l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const target = INJ ? makeInjectedCopy() : SRC_HTML;
  const proc = spawn(EDGE, [
    '--headless=new', '--allow-file-access-from-files',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(OUT, 'profile_zoneauto'),
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

  /* 切到二级管路页 —— 注意 id 是 #pipePlanSection（不是 #tlPipePlanSection，
     后者是三级设计工作区）。工具栏在 data-ry-view="edit" 这一屏。 */
  await page.evaluate(() => {
    try { window.ryShowSection(document.getElementById('pipePlanSection'), null); } catch (e) {}
  });
  await sleep(900);
  /* 确保处于「管线编辑」屏（draw/sys 屏工具栏不出现） */
  await page.evaluate(() => {
    try {
      const sec = document.getElementById('pipePlanSection');
      if (sec && sec.getAttribute('data-ry-view') !== 'edit') sec.setAttribute('data-ry-view', 'edit');
      const show = document.querySelector('body[data-ry-sec]');
      if (show) document.body.setAttribute('data-ry-sec', 'pipePlanSection');
    } catch (e) {}
  });
  await sleep(600);
  /* 前置断言：确认工具栏真的排版出来了（宽高非 0），否则后续量测无意义 */
  {
    const barOk = await page.evaluate(() => {
      const b = document.getElementById('ppToolbar');
      if (!b) return false;
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    if (!barOk) {
      console.error('\n[FATAL] 工具栏未排版（宽或高为 0）—— 进入二级管路页的方式失效，后续量测无效。');
      console.error('        #pipePlanSection 当前 display =',
        await page.evaluate(() => { const s = document.getElementById('pipePlanSection'); return s ? getComputedStyle(s).display : 'missing'; }));
      try { await browser.disconnect(); } catch (e) {}
      try { proc.kill(); } catch (e) {}
      process.exit(2);   /* 2 = 进入方式漂移，不静默放行 */
    }
  }

  /* ★★ 生成施工图 —— 不生成就**根本没有分区层**，则 4.x 的分区数断言无从谈起。
   *   路径：window.measuredPolygon（本地米坐标）→ window.ppLoadPolygon() → window.ppGenerateDiagram()。
   *   为什么必须真生成：分区层 <g class="pp-zone-layer"> 是 ppGenerateDiagram 里拼 SVG 出来的，
   *   未生成时 #ppDiagramContent 只有一句「请先生成施工图」的空态文案（实测 exists:false）。
   *
   * ★★★ 地块尺寸必须**足够大**，否则本组断言**退化、恒绿**（实测踩到）：
   *   分区数下限由 `calcZoneLayout` 的 `minN = max(ceil(W/S)*ceil(H/S), ceil(W*H/S²))` 决定，
   *   其中 S = 2 × planTapeLaySide（默认 100 ⇒ S=200m）。
   *   · 用 60m×40m 的小地块：minN = max(1×1, 1) = 1 ⇒ 开/关**都**是 1 区
   *     ⇒ 「关闭后塌到 1」与「开启后回到 ≥2」两头都测不出区别（假绿）。
   *   · 用 600m×400m：minN = max(3×2, 6) = 6 ⇒ 开启 = 6 区、关闭 = 1 区，差异一目了然。
   *   这与「测试样本必须能区分出正反例」是同一条原则：**先问有没有反例能让断言变红**。 */
  {
    const genOk = await page.evaluate(() => {
      try {
        const W = 600, H = 400;             // 600m × 400m = 36ha，确保自动划分出多区
        window.measuredPolygon = [
          { x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }
        ];
        window.measuredArea = W * H;
        window.measuredPolygonSource = 'area';
        if (typeof window.ppLoadPolygon === 'function') window.ppLoadPolygon();
        if (typeof window.ppGenerateDiagram === 'function') { window.ppGenerateDiagram({ scroll: false }); return true; }
        return false;
      } catch (e) { return false; }
    });
    await sleep(900);
    const zoneProbe = await page.evaluate(() => {
      const g = document.querySelector('#ppDiagramContent g.pp-zone-layer');
      return { hasSvg: !!document.querySelector('#ppDiagramContent svg'), hasZoneLayer: !!g, rects: g ? g.querySelectorAll('rect').length : -1 };
    });
    if (!genOk || !zoneProbe.hasZoneLayer || zoneProbe.rects < 1) {
      console.error('\n[FATAL] 施工图未生成 / 没有分区层，后续分区数断言无效。');
      console.error('        ' + JSON.stringify(zoneProbe));
      try { await browser.disconnect(); } catch (e) {}
      try { proc.kill(); } catch (e) {}
      process.exit(2);
    }
    /* 基准非空闸门：必须是「多区」才有对照意义（1 区的话本组断言全无鉴别力）。 */
    if (zoneProbe.rects < 2) {
      console.error('\n[FATAL] 基准地块只分出 ' + zoneProbe.rects + ' 个区 —— 本组「关掉塌到 1」断言将恒绿、无鉴别力。');
      console.error('        请把 window.measuredPolygon 的尺寸调大（当前 600×400 仍不足说明 S 被改大了）。');
      try { await browser.disconnect(); } catch (e) {}
      try { proc.kill(); } catch (e) {}
      process.exit(2);
    }
    console.log('[setup] 施工图已生成：' + JSON.stringify(zoneProbe));
  }

  /* ---- 量测：#ppZoneAutoWrap / #ppZoneAutoTxt ---- */
  const probe = () => page.evaluate(() => {
    const wrap = document.getElementById('ppZoneAutoWrap');
    const txt = document.getElementById('ppZoneAutoTxt');
    const chk = document.getElementById('ppZoneAutoChk');
    const bar = document.getElementById('ppToolbar');
    const cs = (el) => (el ? getComputedStyle(el) : null);
    /* 从文字节点往上找到第一个不透明背景，作为「文字实际叠在什么颜色上」 */
    function bgChain(el) {
      const out = [];
      let n = el;
      while (n && out.length < 8) {
        const b = getComputedStyle(n).backgroundColor;
        out.push({ tag: n.tagName + (n.id ? '#' + n.id : '') + (n.className && typeof n.className === 'string' ? '.' + n.className.split(/\s+/).join('.') : ''), bg: b });
        n = n.parentElement;
      }
      return out;
    }
    const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };
    return {
      exists: !!(wrap && txt && chk),
      barRect: r(bar),
      barCS: bar ? { display: cs(bar).display, flexDirection: cs(bar).flexDirection, bg: cs(bar).backgroundColor, bgImage: cs(bar).backgroundImage.slice(0, 120), overflowY: cs(bar).overflowY, scrollH: bar.scrollHeight, clientH: bar.clientHeight } : null,
      wrapRect: r(wrap),
      wrapCS: wrap ? { display: cs(wrap).display, color: cs(wrap).color, visibility: cs(wrap).visibility, opacity: cs(wrap).opacity, fontSize: cs(wrap).fontSize, whiteSpace: cs(wrap).whiteSpace, overflow: cs(wrap).overflow, width: cs(wrap).width, minWidth: cs(wrap).minWidth, flex: cs(wrap).flex } : null,
      wrapText: wrap ? (wrap.textContent || '').trim() : null,
      txtRect: r(txt),
      txtCS: txt ? { display: cs(txt).display, color: cs(txt).color, visibility: cs(txt).visibility, opacity: cs(txt).opacity, fontSize: cs(txt).fontSize, overflow: cs(txt).overflow, textOverflow: cs(txt).textOverflow, whiteSpace: cs(txt).whiteSpace, scrollW: txt.scrollWidth, clientW: txt.clientWidth } : null,
      txtText: txt ? txt.textContent : null,
      chkRect: r(chk),
      chkCS: chk ? { display: cs(chk).display, visibility: cs(chk).visibility, opacity: cs(chk).opacity, accentColor: cs(chk).accentColor, width: cs(chk).width, height: cs(chk).height } : null,
      chkChecked: chk ? chk.checked : null,
      bodyZoneAutoOff: document.body.classList.contains('ry-zoneauto-off'),
      bgChain: txt ? bgChain(txt) : [],
      /* 该 label 落在工具栏可视区内吗 */
      inToolbar: (() => {
        if (!wrap || !bar) return null;
        const a = wrap.getBoundingClientRect(), b = bar.getBoundingClientRect();
        return a.top >= b.top - 1 && a.bottom <= b.bottom + 1 && a.left >= b.left - 1 && a.right <= b.right + 1;
      })(),
    };
  });

  let p = await probe();

  console.log('\n=== [0] 前提 ===');
  check('0.1 三个节点都存在（wrap/txt/chk）', p.exists === true);
  check('0.2 工具栏存在且可见', !!(p.barRect && p.barRect.w > 0 && p.barRect.h > 0), JSON.stringify(p.barRect));
  check('0.3 默认开启（body 无 ry-zoneauto-off）', p.bodyZoneAutoOff === false, 'off=' + p.bodyZoneAutoOff);

  console.log('\n=== [1] 开关本体「看得见」===');
  check('1.1 #ppZoneAutoWrap 有非零尺寸', !!(p.wrapRect && p.wrapRect.w > 0 && p.wrapRect.h > 0), JSON.stringify(p.wrapRect));
  check('1.2 #ppZoneAutoWrap display 不是 none', p.wrapCS && p.wrapCS.display !== 'none', 'display=' + (p.wrapCS && p.wrapCS.display));
  check('1.3 #ppZoneAutoWrap visibility=visible', p.wrapCS && p.wrapCS.visibility === 'visible', 'visibility=' + (p.wrapCS && p.wrapCS.visibility));
  check('1.4 #ppZoneAutoWrap 落在工具栏可视区内', p.inToolbar === true, 'inToolbar=' + p.inToolbar);

  console.log('\n=== [2] 「地块划分」文字「看得见」===');
  const txtPresent = !!(p.txtRect && p.txtRect.w > 0 && p.txtRect.h > 0);
  check('2.1 #ppZoneAutoTxt 有非零尺寸（文字真的被排版出来了）', txtPresent, JSON.stringify(p.txtRect));
  check('2.2 #ppZoneAutoTxt display 不是 none', p.txtCS && p.txtCS.display !== 'none', 'display=' + (p.txtCS && p.txtCS.display));
  check('2.3 #ppZoneAutoTxt visibility=visible', p.txtCS && p.txtCS.visibility === 'visible', 'visibility=' + (p.txtCS && p.txtCS.visibility));
  check('2.4 #ppZoneAutoTxt opacity>0', p.txtCS && parseFloat(p.txtCS.opacity) > 0, 'opacity=' + (p.txtCS && p.txtCS.opacity));
  check('2.5 文字没被 overflow 裁掉（scrollW <= clientW+1）', !!(p.txtCS && p.txtCS.scrollW <= p.txtCS.clientW + 1), p.txtCS ? ('scrollW=' + p.txtCS.scrollW + ' clientW=' + p.txtCS.clientW) : 'n/a');

  /* ---- 对比度：文字色叠到工具栏背景上 ---- */
  console.log('\n=== [3] 文字与底色的对比度（真正的「看不见」判据）===');
  let bgColor = null, bgSrc = '';
  for (let i = 0; i < p.bgChain.length; i++) {
    const c = parseColor(p.bgChain[i].bg);
    if (c && c[3] > 0.05) { bgColor = c; bgSrc = p.bgChain[i].tag + ' @ ' + p.bgChain[i].bg; break; }
  }
  if (!bgColor) { bgColor = [255, 255, 255, 1]; bgSrc = 'fallback white'; }
  const fgRaw = p.txtCS ? parseColor(p.txtCS.color) : null;
  let ratio = null, fgEff = null;
  if (fgRaw) {
    fgEff = over(fgRaw, bgColor);
    ratio = contrast(fgEff, bgColor);
  }
  console.log('  [info] 文字声明色 = ' + (p.txtCS && p.txtCS.color) + '；底色来源 = ' + bgSrc);
  console.log('  [info] 文字落底后的实际色 = ' + (fgEff ? 'rgb(' + fgEff.slice(0, 3).map((v) => Math.round(v)).join(',') + ')' : 'n/a') + '；对比度 = ' + (ratio === null ? 'n/a' : ratio.toFixed(2)));
  /* 可读性门槛：正文 12px 属小字，AA 要求 4.5:1；这里放宽到 3.0 视为「勉强可见」，
     低于 3.0 即认定为「肉眼看不见」= 用户反馈的「什么都没有」。 */
  check('3.1 文字对比度 >= 3.0（肉眼可见）', ratio !== null && ratio >= 3.0, ratio === null ? 'n/a' : ratio.toFixed(2) + ':1');
  check('3.2 文字对比度 >= 4.5（小字 AA 达标）', ratio !== null && ratio >= 4.5, ratio === null ? 'n/a' : ratio.toFixed(2) + ':1');

  console.log('\n=== [4] 开关语义（v189：关掉 = **真的不自动划分**，整块当一个区）===');
  check('4.1 默认勾选 = 自动划分开启', p.chkChecked === true, 'checked=' + p.chkChecked);
  /* ★★ v189 核心断言（前置于「关」操作之前必须先拿到「开」时的分区数）：
   *   开关关闭 = ppGetZoneLayout 直接返回 1×1 单区布局 ⇒ 全链路（分区线/分区数/
   *   面积/水力/材料/三级工作区）都应看到**一个区**。这是「真的不划分」与
   *   「只是把线藏起来」的唯一分水岭 —— 后者数据仍是 N 区，一测就露。
   *   怎么观测：分区线图层里每个分区一个 <rect>（源码 15800 行），故「rect 数 = 分区数」。
   *   ⚠ 基准必须选**大**地块：分区下限 minN = max(ceil(W/S)*ceil(H/S), ceil(W·H/S²))，
   *     S = 2×「单边铺设长度」（默认 200m）；地块太小时 minN=1 ⇒ 开/关都是 1 区 ⇒ 恒绿。
   *     本探针用 600m×400m（minN=6）⇒ 开启 20 区、关闭 1 区，差异明确。 */
  const zonesOn = await page.evaluate(() => {
    /* 分区层的真实结构（源码 15782 行）：<g class="pp-zone-layer"> 下**每个分区一个 <rect>**
       —— 所以「rect 数」就是「分区数」，可直接量。 */
    const g = document.querySelector('#ppDiagramContent g.pp-zone-layer');
    if (!g) return { exists: false, n: -1 };
    return { exists: true, n: g.querySelectorAll('rect').length };
  });
  check('4.1b 开启时确有多条分区线（基准非空，否则下面 4.5b 无从对照）',
    zonesOn.exists && zonesOn.n >= 2, JSON.stringify(zonesOn));

  /* ★ 4.1c 先进入「调网格」模式，让微调组（#ppCutFineGroup）处于展开态 ——
   *   这样 4.5b 的「关闭后收起」才有反例可测。
   *   为什么必须先展开：不点「调网格」时微调组本来就是 none，4.5b 会**恒绿**
   *   （实测：--inject 2 注掉 ppSyncFineGroup 调用后，4.5b 仍 PASS ⇒ 断言无鉴别力）。
   *   这与「一致性烟测只取全 0 的样本」是同一种病：**样本退化 ⇒ 绿得毫无信息量**。 */
  const entered = await page.evaluate(() => {
    const b = document.querySelector('#ppToolbar .pp-btn[data-mode="adjustCut"]');
    if (!b) return { ok: false, reason: 'no-btn' };
    b.click();
    const fg = document.getElementById('ppCutFineGroup');
    return { ok: true, active: b.classList.contains('active'), fineDisplay: fg ? getComputedStyle(fg).display : 'missing' };
  });
  await sleep(500);
  check('4.1c 前置：能进入「调网格」且微调组展开（给 4.5b 造出可测的反例）',
    entered.ok && entered.active === true && entered.fineDisplay !== 'none',
    JSON.stringify(entered));

  /* 点一下 → 关 */
  await page.evaluate(() => {
    const chk = document.getElementById('ppZoneAutoChk');
    chk.checked = false;
    chk.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await sleep(600);
  const off = await probe();
  check('4.2 关闭后 body.ry-zoneauto-off 已加', off.bodyZoneAutoOff === true);
  check('4.3 关闭后文案变为「地块划分（不划分）」', off.txtText === '地块划分（不划分）', 'txt=' + JSON.stringify(off.txtText));
  check('4.4 关闭后文字仍可见（对比度不劣化）', off.txtRect && off.txtRect.w > 0, JSON.stringify(off.txtRect));
  /* ★★ 核心：关闭后分区数必须塌到 1（而不是「线藏了、数据还是 N 区」）。
   *   注意判据要能区分「隐藏」与「真的只有 1 个」：
   *   · 只数节点数 —— 若实现是「CSS 隐藏」节点数仍 = N ⇒ 报红（正是我们要抓的）。
   *   · 反向对照 4.8b 会在重新开启后断言节点数回到 ≥2，证明本判据非恒真。 */
  const zonesOff = await page.evaluate(() => {
    const g = document.querySelector('#ppDiagramContent g.pp-zone-layer');
    if (!g) return { exists: false, n: -1 };
    /* 「rect 数 = 分区数」。另外读一个独立证据：标签层里的「N区」文字个数。 */
    const labels = document.querySelectorAll('#ppDiagramContent g.pp-zone-label text');
    return { exists: true, n: g.querySelectorAll('rect').length, labels: labels.length };
  });
  check('4.5 ★★ 关闭后分区数塌到 1（真的不划分，不是把线藏起来）',
    zonesOff.exists && zonesOff.n <= 1, JSON.stringify(zonesOff));
  /* 微调组：关闭后应**收起**（v189 起不再自动切到调网格）；开启时才按模式显隐 */
  const ctlSel = await page.evaluate(() => {
    const b = document.querySelector('#ppToolbar .pp-btn[data-mode="adjustCut"]');
    const fg = document.getElementById('ppCutFineGroup');
    return {
      active: !!b && b.classList.contains('active'),
      btnExists: !!b,
      fineDisplay: fg ? getComputedStyle(fg).display : 'missing',
    };
  });
  check('4.5b ★ 关闭后从「调网格」退出且微调组收起（不是残留展开）',
    ctlSel.btnExists && ctlSel.active === false && ctlSel.fineDisplay === 'none',
    JSON.stringify(ctlSel));
  check('4.5c 关闭后调网格相关按钮被禁用（视觉置灰 + 不可点）',
    await page.evaluate(() => {
      const b = document.querySelector('#ppToolbar .pp-btn[data-mode="adjustCut"]');
      if (!b) return false;
      const cs = getComputedStyle(b);
      return cs.pointerEvents === 'none' && parseFloat(cs.opacity) < 0.9;
    }), '见 body.ry-zoneauto-off 下的置灰规则');

  if (SHOT) {
    await page.screenshot({ path: path.join(OUT, 'zoneauto_off.png') });
  }

  /* 再点一下 → 开（复原） */
  await page.evaluate(() => {
    const chk = document.getElementById('ppZoneAutoChk');
    chk.checked = true;
    chk.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await sleep(600);
  const on = await probe();
  check('4.6 恢复开启后 body 类移除', on.bodyZoneAutoOff === false);
  check('4.7 恢复开启后文案回到「地块划分」', on.txtText === '地块划分', 'txt=' + JSON.stringify(on.txtText));
  /* 反向对照：重新开启后仍应**停在 main 模式**（不自动回到调网格）⇒ 微调组保持收起 */
  const fineWhenOn = await page.evaluate(() => {
    const fg = document.getElementById('ppCutFineGroup');
    const b = document.querySelector('#ppToolbar .pp-btn[data-mode="adjustCut"]');
    return { display: fg ? getComputedStyle(fg).display : 'missing', active: !!b && b.classList.contains('active') };
  });
  check('4.8 恢复开启后仍是 main 模式、微调组收起（与 4.5b 同口径）',
    fineWhenOn.display === 'none' && fineWhenOn.active === false, JSON.stringify(fineWhenOn));
  /* ★★ 反向对照（关键）：重新开启后分区数必须回到 ≥2。
   *   这一条是 4.5 的「另一头」—— 证明 4.5 不是恒真（否则关/开都 =1 也能绿）。 */
  const zonesBack = await page.evaluate(() => {
    const g = document.querySelector('#ppDiagramContent g.pp-zone-layer');
    if (!g) return { exists: false, n: -1 };
    return { exists: true, n: g.querySelectorAll('rect').length };
  });
  check('4.8b ★★ 恢复开启后分区数回到 ≥2（证明 4.5 不是恒真）',
    zonesBack.exists && zonesBack.n >= 2, JSON.stringify(zonesBack));
  if (SHOT) {
    await page.screenshot({ path: path.join(OUT, 'zoneauto_on.png') });
  }

  console.log('\n=== [5] 刷新持久化 ===');
  await page.evaluate(() => {
    const chk = document.getElementById('ppZoneAutoChk');
    chk.checked = false;
    chk.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await sleep(400);
  await page.reload({ waitUntil: 'load' });
  await sleep(1500);
  await page.evaluate(() => { try { window.ryShowSection(document.getElementById('tlPipePlanSection'), null); } catch (e) {} });
  await sleep(700);
  const afterReload = await probe();
  check('5.1 关闭态刷新后保持关闭', afterReload.bodyZoneAutoOff === true);
  check('5.2 关闭态刷新后文字仍「地块划分（不划分）」', afterReload.txtText === '地块划分（不划分）', 'txt=' + JSON.stringify(afterReload.txtText));
  /* ★★ 刷新后仍必须是「真的 1 个区」—— 证明持久化恢复的是行为而不只是外观。
     ⚠ reload 后 window.measuredPolygon 丢失（它只活在内存里，不写 localStorage），
       施工图自然也没了 ⇒ 必须**重新给地块 + 重新生成**再量，否则量到的是「无图层」
       （= 假红：不是功能坏，是样本没准备好）。这与「关掉时 20→1」是同一块地。 */
  await page.evaluate(() => {
    try {
      const W = 600, H = 400;
      window.measuredPolygon = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
      window.measuredArea = W * H; window.measuredPolygonSource = 'area';
      if (typeof window.ppLoadPolygon === 'function') window.ppLoadPolygon();
      if (typeof window.ppGenerateDiagram === 'function') window.ppGenerateDiagram({ scroll: false });
    } catch (e) {}
  });
  await sleep(900);
  const zonesAfterReload = await page.evaluate(() => {
    const g = document.querySelector('#ppDiagramContent g.pp-zone-layer');
    if (!g) return { exists: false, n: -1 };
    return { exists: true, n: g.querySelectorAll('rect').length };
  });
  check('5.3 ★★ 关闭态刷新后重新生成，分区数仍为 1（行为持久化，不只是外观）',
    zonesAfterReload.exists && zonesAfterReload.n <= 1, JSON.stringify(zonesAfterReload));

  console.log('\n=== [6] 无页面错误 ===');
  check('6.1 无 pageerror', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log('\n---------------------------------------------');
  console.log('PASS=' + pass + '  FAIL=' + fail);
  if (SHOT) console.log('截图已存：_verify_out/zoneauto_on.png / zoneauto_off.png');

  try { await browser.disconnect(); } catch (e) {}
  try { proc.kill(); } catch (e) {}
  if (INJ) { try { fs.unlinkSync(path.join(WS, '_inj_zoneauto.html')); } catch (e) {} }
  /* 退出码语义：
       正常：全绿 0 / 有红 1
       注入：缺陷已被断言捕获(=有红) 0 / 恒绿(没抓到) 1
     —— 注入模式下「全绿」= 契约失效，必须报 1，不能静默放行。 */
  if (INJ) {
    if (fail === 0) {
      console.error('\n[inject] ✗ 契约失效：注入缺陷后仍然全绿 —— 断言没拦住任何东西！');
      process.exitCode = 1;
    } else {
      console.log('\n[inject] ✓ 注入缺陷已被捕获（FAIL=' + fail + '）—— 断言有效。');
      process.exitCode = 0;
    }
  } else {
    process.exitCode = fail > 0 ? 1 : 0;
  }
})().catch((e) => {
  console.error('探针异常：', e && e.stack || e);
  process.exitCode = 1;
});
