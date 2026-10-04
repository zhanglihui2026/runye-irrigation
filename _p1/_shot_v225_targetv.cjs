/* _p1/_shot_v225_targetv.cjs · [v225] 「目标流速」挪到「水力计算结果」标题右侧、同一行
 * 用户原话：「红框中的目标流速，放在水力计算结果 右侧，跟水力计算结果几个文字放在一行」
 *
 * 背景：标题「水力计算结果」是 **::before 伪元素**（:3242 / :3243 / :5309 三处定义），
 *   不是真实 DOM ⇒ 无法把 input 塞进标题里。v225 方案：把 .tl-target-v-row 作为 #tlPlanBar2
 *   的子节点 + 绝对定位贴到标题行右端（#tlPlanBar2 自身 position:relative）。
 *   ★ 双宿主：ry-tool 模式下 #tlSide 被搬进 #ryCadGrpTl ⇒ 规则必须挂 id 前缀（与祖先无关）。
 *
 * 断言（每个场景：普通模式 / ry-tool 模式）：
 *   ① DOM 位置：tlPlanTargetV 在 #tlPlanBar2 内、且已不在 #tlPlanBar（参数栏）内
 *   ② 右对齐：本行右缘与栏内容右缘对齐（±1px），且左缘落在标题文字右侧（不压标题）
 *   ③ 同一行：本行垂直中心 ≈ 标题文字垂直中心（±2.5px），且不越过下方「水力项」列头行
 *   ④ 输入框可见：白底深字（不是通用规则那套「白字+透明底」）、宽高够、未被裁切
 *   ⑤ 功能：改 1.5→2.5 触发重算（管径 / 流速 / 扬程 至少一项变化）
 *   ⑥ 无 JS 报错
 * 注入体检（--inject，TAG=1..3）：
 *   I1 去掉 .tl-target-v-row 类（退回普通 .pp-plan-item） ⇒ ②③ 必须红
 *   I2 把 top:5px 改成 top:60px（掉到内容区）       ⇒ ③ 必须红
 *   I3 去掉 #tlPlanBar2 的 position:relative        ⇒ ② 必须红
 */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const puppeteer = require('./_pptr.cjs');
const killTree = require('./_edge_kill.cjs');

const WS = 'C:\\Users\\AHS\\runye-irrigation';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = path.join(WS, '_verify_out');
const PORT = parseInt(process.env.PA_PORT || '9591', 10);
const PAGE = process.env.PA_PAGE || 'index.html';
const TAG = process.env.PA_TAG || '';
const INJECT = process.argv.indexOf('--inject') >= 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileUrl = (p) => 'file:///' + encodeURI(p.replace(/\\/g, '/'));

let pass = 0, fail = 0;
const check = (n, ok, extra) => { console.log((ok ? '  [PASS] ' : '  [FAIL] ') + n + (extra ? ' :: ' + extra : '')); ok ? pass++ : fail++; };
const info = (s) => console.log('  [INFO] ' + s);

const INJ_SPEC = INJECT ? [
  ['class="pp-plan-item tl-target-v-row"', 'class="pp-plan-item"', '退回普通 .pp-plan-item（期望：②右对齐 ③同一行 红）'],
  ['position:absolute;top:5px;right:11px', 'position:absolute;top:60px;right:11px', '掉到内容区（期望：③同一行 红）'],
  ['#tlPlanBar2.tl-plan-result{position:relative}', '#tlPlanBar2.tl-plan-result{}', '丢掉定位上下文（期望：②右对齐 红）']
] : [];

/* 采集：结果栏几何 + 标题伪元素计算样式 + 本行/输入框/列头行 位置 */
const PROBE = `(()=>{try{
  var bar=document.getElementById('tlPlanBar2');
  var bar1=document.getElementById('tlPlanBar');
  var inp=document.getElementById('tlPlanTargetV');
  if(!bar||!inp) return JSON.stringify({err:'missing bar2/input'});
  var row=inp.closest('.tl-target-v-row')||inp.parentElement;
  var cs=getComputedStyle(bar), bs=getComputedStyle(bar,'::before');
  var b=bar.getBoundingClientRect(), r=row.getBoundingClientRect(), i=inp.getBoundingClientRect();
  var head=bar.querySelector('.pp-plan-cols-head');
  var hr=head?head.getBoundingClientRect():null;
  var bt=parseFloat(cs.borderTopWidth)||0, pt=parseFloat(cs.paddingTop)||0;
  var pb=parseFloat(bs.paddingBottom)||0, bb=parseFloat(bs.borderBottomWidth)||0, mb=parseFloat(bs.marginBottom)||0;
  var bl=parseFloat(cs.borderLeftWidth)||0, pl=parseFloat(cs.paddingLeft)||0, pr=parseFloat(cs.paddingRight)||0;
  var is=inp?getComputedStyle(inp):null;
  /* 标题文字宽度：用 canvas 按伪元素字体实测（含 letter-spacing） */
  var cv=document.createElement('canvas'), ctx=cv.getContext('2d');
  ctx.font=(bs.fontStyle||'normal')+' '+(bs.fontWeight||'400')+' '+(bs.fontSize||'11px')+' '+(bs.fontFamily||'sans-serif');
  var ls=parseFloat(bs.letterSpacing); if(isNaN(ls)) ls=0;
  var txt=(bs.content||'').replace(/^"|"$/g,'');
  var titleW=ctx.measureText(txt).width + txt.length*ls;
  var chain=[], n=bar;
  while(n&&n!==document.body){chain.push((n.id?'#'+n.id:'')+(n.className&&typeof n.className==='string'?'.'+n.className.trim().split(/\\s+/).join('.'):'')); n=n.parentElement;}
  return JSON.stringify({
    bar:{l:b.left,t:b.top,r:b.right,w:b.width,h:b.height},
    content:{l:b.left+bl+pl, r:b.right-bl-pr, t:b.top+bt+pt},
    before:{content:txt, lh:bs.lineHeight, fs:bs.fontSize, pb:pb, bb:bb, mb:mb, ls:ls, titleW:titleW},
    row:{l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width,h:r.height},
    inp:{l:i.left,t:i.top,w:i.width,h:i.height, bg:is.backgroundColor, color:is.color, bd:is.borderTopWidth},
    head:hr?{l:hr.left,t:hr.top,r:hr.right,b:hr.bottom,h:hr.height}:null,
    inBar2: !!inp.closest('#tlPlanBar2'), inBar1: !!(bar1&&inp.closest('#tlPlanBar')),
    overflow: cs.overflow, host: chain.slice(0,3)
  });
}catch(e){return JSON.stringify({err:e.message});}})()`;

const READ_VALS = `(()=>{try{
  var g=function(id){var e=document.getElementById(id);return e?e.textContent.trim():'';};
  return JSON.stringify({vel:g('tlPlanFrontVelocity'),main:g('tlPlanMainPipe'),front:g('tlPlanFrontPipe'),
    head:g('tlPlanPumpHead'),sel:(document.getElementById('tlCalSelMain')||{}).value||''});
}catch(e){return JSON.stringify({err:e.message});}})()`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  let pageFile = path.join(WS, PAGE);
  if (INJECT) {
    let src = fs.readFileSync(path.join(WS, 'index.html'), 'utf8');
    const EOL = src.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
    const idx = Math.max(0, parseInt(String(TAG).replace(/[^0-9]/g, ''), 10) - 1);
    const pair = INJ_SPEC[idx];
    if (!pair) { console.error('未找到注入 I' + (idx + 1)); process.exit(2); }
    const from = pair[0].replace(/\n/g, EOL), to = pair[1].replace(/\n/g, EOL);
    const n = src.split(from).length - 1;
    if (n !== 1) { console.error('注入锚点命中 ' + n + ' 处（要求恰好 1）: ' + pair[0]); process.exit(2); }
    src = src.replace(from, to);
    pageFile = path.join(WS, '_inj_v225_' + TAG + '.html');
    fs.writeFileSync(pageFile, src, 'utf8');
    console.log('== 注入模式 I' + (idx + 1) + '：' + pair[2]);
  }
  const proc = spawn(EDGE, ['--headless=new', '--allow-file-access-from-files',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(OUT, 'profile_v225' + TAG),
    '--no-first-run', '--no-default-browser-check', '--window-size=1500,950', 'about:blank'], { stdio: 'ignore' });
  let browser = null;
  for (let i = 0; i < 60; i++) {
    try { browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:' + PORT, defaultViewport: null }); break; }
    catch (e) { await sleep(400); }
  }
  if (!browser) { console.error('Edge connect failed'); killTree(proc.pid); process.exit(1); }
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.setViewport({ width: 1500, height: 950 });
  await page.goto(fileUrl(pageFile), { waitUntil: 'load', timeout: 120000 });
  await sleep(1200);

  async function scenario(name, toolMode) {
    await page.evaluate((tm) => {
      document.body.classList.toggle('ry-tool', !!tm);
      try { localStorage.clear(); } catch (e) { }
    }, toolMode);
    await sleep(250);
    await page.evaluate(() => {
      window.measuredPolygon = [{ x: 0, y: 0 }, { x: 320, y: 0 }, { x: 320, y: 200 }, { x: 0, y: 200 }];
      window.measuredPolygonSource = 'verify';
      if (typeof window.ppLoadPolygon === 'function') window.ppLoadPolygon();
      if (typeof window.ryShowSection === 'function') window.ryShowSection(document.getElementById('pipePlanSection'), null);
    });
    await sleep(500);
    await page.evaluate(() => { const b = document.getElementById('ppGenerate'); if (b) b.click(); });
    await sleep(1500);
    await page.evaluate(() => { if (typeof window.ryShowSection === 'function') window.ryShowSection(document.getElementById('tlPipePlanSection'), null); });
    await sleep(500);
    await page.evaluate(() => { const b = document.getElementById('tlAutoPipe'); if (b) b.click(); });
    await sleep(2000);

    const M = JSON.parse(await page.evaluate(PROBE));
    if (M.err) { check(name + ' 可采集', false, M.err); return; }
    console.log('\n== ' + name + ' ==');
    info('栏宽=' + M.bar.w.toFixed(1) + ' 内容区[' + M.content.l.toFixed(1) + ',' + M.content.r.toFixed(1) + '] 标题="' + M.before.content + '" 标题宽≈' + M.before.titleW.toFixed(1));
    info('宿主链=' + M.host.join(' < '));
    info('本行 l=' + M.row.l.toFixed(1) + ' r=' + M.row.r.toFixed(1) + ' t=' + M.row.t.toFixed(1) + ' h=' + M.row.h.toFixed(1));

    /* ① DOM 位置 */
    check('① ' + name + ' 目标流速在结果栏 #tlPlanBar2 内、已离开参数栏', M.inBar2 && !M.inBar1,
      'inBar2=' + M.inBar2 + ' inBar1=' + M.inBar1);

    /* ② 右对齐 + 不压标题 */
    const rightOff = Math.abs(M.row.r - M.content.r);
    const leftGap = M.row.l - M.content.l;
    check('②a ' + name + ' 本行右缘与栏内容右缘对齐', rightOff <= 1.0, '偏差=' + rightOff.toFixed(2) + 'px');
    check('②b ' + name + ' 本行在标题文字右侧、不压标题', leftGap >= M.before.titleW * 0.75,
      '左缘距内容左=' + leftGap.toFixed(1) + 'px 标题宽≈' + M.before.titleW.toFixed(1) + 'px');

    /* ③ 与标题同一行：先按「列头行起点」反推标题行盒高（伪元素 block 高 = lh+pb+bb，外边距 mb） */
    let lh = parseFloat(M.before.lh);
    if (isNaN(lh) || !isFinite(lh)) {
      const fs = parseFloat(M.before.fs) || 11;
      if (M.head) lh = M.head.t - M.content.t - (M.before.pb + M.before.bb + M.before.mb);
      else lh = fs * 1.2;
    }
    const titleMid = M.content.t + lh / 2;
    const rowMid = M.row.t + M.row.h / 2;
    const dy = Math.abs(rowMid - titleMid);
    check('③a ' + name + ' 本行与「水力计算结果」同一行（垂直中心偏差 ≤2.5px）', dy <= 2.5,
      '行盒高=' + lh.toFixed(1) + ' 标题中心=' + titleMid.toFixed(1) + ' 本行中心=' + rowMid.toFixed(1) + ' Δ=' + dy.toFixed(2));
    const overlapHead = M.head ? (M.row.b - M.head.t) : 0;
    check('③b ' + name + ' 不压下方「水力项」列头行', overlapHead <= 0.5, '越界=' + overlapHead.toFixed(2) + 'px');

    /* ④ 输入框可见（防「白字透明底」那套通用规则） */
    const bgOk = /rgb\(255,\s*255,\s*255\)/.test(M.inp.bg) || /rgba?\(\s*2[0-9][0-9]/.test(M.inp.bg);
    const colOk = !/rgb\(255,\s*255,\s*255\)/.test(M.inp.color);
    check('④ ' + name + ' 输入框可见（白底深字 + 宽高够）',
      bgOk && colOk && M.inp.w >= 40 && M.inp.h >= 16,
      'w=' + M.inp.w.toFixed(0) + ' h=' + M.inp.h.toFixed(0) + ' bg=' + M.inp.bg + ' color=' + M.inp.color);

    /* ⑤ 功能：改值触发重算（先复位成 1.5 —— 两场景共用同一页面，避免沿用上一场景的值导致「无变化」假红） */
    await page.evaluate(() => {
      const el = document.getElementById('tlPlanTargetV');
      el.value = '1.5';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await sleep(600);
    const v1 = JSON.parse(await page.evaluate(READ_VALS));
    await page.evaluate(() => {
      const el = document.getElementById('tlPlanTargetV');
      el.value = '2.5';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await sleep(600);
    const v2 = JSON.parse(await page.evaluate(READ_VALS));
    const changed = Object.keys(v1).filter(k => v1[k] !== v2[k]);
    check('⑤ ' + name + ' 改 1.5→2.5 触发水力重算', changed.length > 0,
      '变化项=' + (changed.join(',') || '无') + ' | ' + JSON.stringify(v1) + ' → ' + JSON.stringify(v2));

    if (!INJECT && name.indexOf('普通') === 0) {
      try {
        const barEl = await page.$('#tlPlanBar2');
        await barEl.screenshot({ path: path.join(OUT, '_v225_bar2.png') });
        info('截图 → ' + path.join(OUT, '_v225_bar2.png'));
      } catch (e) { info('截图失败 ' + e.message); }
    }
  }

  await scenario('普通模式（#tlSide 在 .pp-side 内）', false);
  await scenario('ry-tool 模式（#tlSide 搬进 #ryCadGrpTl）', true);

  check('⑥ 无 JS 报错', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log('\n== 汇总 ==\n断言 ' + pass + '/' + (pass + fail) + ' PASS');
  const okAll = fail === 0 && errs.length === 0;
  try { await page.close(); } catch (e) { }
  try { await browser.disconnect(); } catch (e) { }
  killTree(proc.pid); await sleep(400);
  if (INJECT) {
    try { if (path.dirname(pageFile) === WS && path.basename(pageFile).indexOf('_inj_v225_') === 0) fs.unlinkSync(pageFile); } catch (e) { }
    console.log(fail > 0 ? '== 注入命中（闸门有效）==' : '== 注入未命中（闸门被写哑！）==');
    process.exit(fail > 0 ? 0 : 1);
  }
  if (!okAll) process.exitCode = 1;
  process.exit(0);
})().catch(e => { console.error('FATAL', e && e.message); process.exit(2); });
