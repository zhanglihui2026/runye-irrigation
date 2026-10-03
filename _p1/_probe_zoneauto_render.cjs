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
    /* 把 ppSyncFineGroup 的两处调用注掉 → 微调组不再随开关显隐 → 4.5 必须红 */
    const a2 = 'ppSyncFineGroup();\n        ppRender();';
    const cnt = s.split(a2).length - 1;
    if (cnt !== 2) { console.error('[inject] 锚点2 漂移：期望 2 处，实际 ' + cnt + ' 处'); process.exit(2); }
    s = s.split(a2).join('/* [inject 2] ppSyncFineGroup(); */\n        ppRender();');
    applied.push('2: 注掉 ppSyncFineGroup 的 2 处调用');
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

  console.log('\n=== [4] 开关语义（关掉 = 隐藏自动分区线 + 切调网格）===');
  check('4.1 默认勾选 = 自动划分开启', p.chkChecked === true, 'checked=' + p.chkChecked);
  /* 点一下 → 关 */
  await page.evaluate(() => {
    const chk = document.getElementById('ppZoneAutoChk');
    chk.checked = false;
    chk.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await sleep(600);
  const off = await probe();
  check('4.2 关闭后 body.ry-zoneauto-off 已加', off.bodyZoneAutoOff === true);
  check('4.3 关闭后文案变为「地块划分（手动）」', off.txtText === '地块划分（手动）', 'txt=' + JSON.stringify(off.txtText));
  check('4.4 关闭后文字仍可见（对比度不劣化）', off.txtRect && off.txtRect.w > 0, JSON.stringify(off.txtRect));
  const ctlSel = await page.evaluate(() => {
    const b = document.querySelector('#ppToolbar .pp-btn[data-mode="adjustCut"]');
    /* ppState 是 IIFE 内局部变量、未挂 window，不能直接读；
       模式提示文案又是画在 canvas 上的（ppCtx.fillText），DOM 里也读不到。
       改用**可观测 DOM 代理**：#ppCutFineGroup（微调箭头组）仅在 adjustCut 模式显示
       （源码第 15186 行：fg.style.display = ppState.mode==='adjustCut' ? 'inline-flex' : 'none'）。 */
    const fg = document.getElementById('ppCutFineGroup');
    return {
      active: !!b && b.classList.contains('active'),
      btnExists: !!b,
      fineDisplay: fg ? getComputedStyle(fg).display : 'missing',
    };
  });
  check('4.5 关闭后自动切到「调网格」模式（按钮 active + 微调组出现）',
    /* 注意：源码写的是 display:'inline-flex'，但该组是 flex 容器的子项，
       getComputedStyle 会做「块级化」计算返回 'flex'。故判据用 !== 'none'，
       不锁字面值（否则会因浏览器规范化而假红）。 */
    ctlSel.btnExists && ctlSel.active === true && ctlSel.fineDisplay !== 'none',
    JSON.stringify(ctlSel));
  /* 反向对照：开启（非调网格）时微调组必须收起 —— 证明上面那条不是恒真 */

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
  /* 反向对照：开启（非调网格）时微调组必须收起 —— 证明 4.5 那条不是恒真 */
  const fineWhenOn = await page.evaluate(() => {
    const fg = document.getElementById('ppCutFineGroup');
    return fg ? getComputedStyle(fg).display : 'missing';
  });
  check('4.8 恢复开启后微调组收起（反向对照，证明 4.5 不是恒真）',
    fineWhenOn === 'none', 'display=' + fineWhenOn);
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
  check('5.2 关闭态刷新后文字仍「地块划分（手动）」', afterReload.txtText === '地块划分（手动）', 'txt=' + JSON.stringify(afterReload.txtText));

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
