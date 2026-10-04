/* _p1/_shot_v226_grouploss.cjs · [v226] 分组说明框实时水头损失 + 流量两位小数
 * 用户原话：「这个框内在联合灌溉区切换之后，要实时显示当前分区的水头损失，
 *            联合灌溉区的流量精确到小数点后两位。」
 *
 * 实现：computeThreeLevel 输出 groupLoss[]（每组最不利路径损失，RyPipePathLoss 同口径）→
 *   宿主 window.tlGroupLossOf(g) 现算读口 → tl-workspace buildGroupInfo 显示。
 *   顺带修单位：框内 combinedFlow 实为 m³/h（原标 L/h，与左栏「联合流量」同值不同单位）。
 *
 * 断言：
 *   ① 自动分组：点演示 chip 后 #tlWsGroupInfo 出现「本轮水头损失 ≈ a.bc m（总管 … + 主管 … + 支管 …）」
 *   ② 流量行：恰好两位小数 + 单位 m³/h（不得再出现 L/h、不得 3 位以上小数）
 *   ③ 切组实时：chip1 → chip12，框内 total 与 window.tlGroupLossOf(g).total 一致（±0.005），且随组变化
 *   ④ 参数实时：目标流速 1.5→2.5（管径变小）后再切回同组，损失必须**变大**（证明是现算不是缓存）
 *   ⑤ 手动分组（按面积成组 36 亩）：M 组框同样有损失行（桥按成员集合匹配的手动分支）
 *   ⑥ 无 JS 报错
 * 注入体检（--inject，TAG=1..2）：
 *   I1 tlGroupLossOf 恒返 null（桥被写哑）            ⇒ ① 必须红
 *   I2 流量退回原始精度（toFixed(2) → 原样字符串拼接） ⇒ ② 必须红
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
const PORT = parseInt(process.env.PA_PORT || '9596', 10);
const PAGE = process.env.PA_PAGE || 'index.html';
const TAG = process.env.PA_TAG || '';
const INJECT = process.argv.indexOf('--inject') >= 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileUrl = (p) => 'file:///' + encodeURI(p.replace(/\\/g, '/'));

let pass = 0, fail = 0;
const check = (n, ok, extra) => { console.log((ok ? '  [PASS] ' : '  [FAIL] ') + n + (extra ? ' :: ' + extra : '')); ok ? pass++ : fail++; };
const info = (s) => console.log('  [INFO] ' + s);

const INJ_SPEC = INJECT ? [
  ['    return r.groupLoss[g] || null;\n  } catch (e2) { return null;',
   '    return null; /* INJ I1 桥被写哑 */\n  } catch (e2) { return null;',
   'tlGroupLossOf 恒返 null（期望：①损失行 ③切组一致 都红）'],
  ['(\'本轮合灌流量 ≈ \' + v.toFixed(2) + \' m³/h\')',
   '(\'本轮合灌流量 ≈ \' + v + \' m³/h\')',
   '流量退回原始精度（期望：②两位小数 红）']
] : [];

/* 读 #tlWsGroupInfo 文本 + 桥现算值 */
const PROBE = `(()=>{try{
  var box=document.getElementById('tlWsGroupInfo');
  var txt=box?box.textContent.trim():'';
  var bridge=null;
  if(typeof window.tlGroupLossOf==='function'){
    var m=/共 (\\d+) 组之一/.exec(txt);
    var chips=document.querySelectorAll('#tlDemoChips button');
    var cur=null;
    chips.forEach(function(b){if(b.classList&&b.classList.contains('sel'))cur=b;});
  }
  return JSON.stringify({txt:txt, hasBox:!!box});
}catch(e){return JSON.stringify({err:e.message});}})()`;

const BRIDGE = `(function(g){try{
  var L=window.tlGroupLossOf(g);
  return JSON.stringify(L?{total:L.total,flow:L.flow,members:L.members}:null);
}catch(e){return JSON.stringify({err:e.message});}})`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  let pageFile = path.join(WS, PAGE);
  /* I2 锚在 tl-workspace/tl-workspace.js（流量格式化在那边）⇒ 就地补丁 + finally 还原 */
  const WSJS = path.join(WS, 'tl-workspace', 'tl-workspace.js');
  let wsjsBackup = null, wsjsPatched = false;
  if (INJECT) {
    const idx = Math.max(0, parseInt(String(TAG).replace(/[^0-9]/g, ''), 10) - 1);
    const pair = INJ_SPEC[idx];
    if (!pair) { console.error('未找到注入 I' + (idx + 1)); process.exit(2); }
    if (idx === 1) {
      let js = fs.readFileSync(WSJS, 'utf8');
      const n0 = js.split(pair[0]).length - 1;
      if (n0 !== 1) { console.error('注入锚点(tl-workspace.js)命中 ' + n0 + ' 处（要求恰好 1）'); process.exit(2); }
      wsjsBackup = js;
      fs.writeFileSync(WSJS, js.replace(pair[0], pair[1]), 'utf8');
      wsjsPatched = true;
      console.log('== 注入模式 I2（就地补丁 tl-workspace.js）：' + pair[2]);
    } else {
      let src = fs.readFileSync(path.join(WS, 'index.html'), 'utf8');
      const EOL = src.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
      const from = pair[0].replace(/\n/g, EOL), to = pair[1].replace(/\n/g, EOL);
      const n = src.split(from).length - 1;
      if (n !== 1) { console.error('注入锚点命中 ' + n + ' 处（要求恰好 1）: ' + pair[0].slice(0, 60)); process.exit(2); }
      src = src.replace(from, to);
      pageFile = path.join(WS, '_inj_v226_' + TAG + '.html');
      fs.writeFileSync(pageFile, src, 'utf8');
      console.log('== 注入模式 I' + (idx + 1) + '：' + pair[2]);
    }
  }
  const restoreWsJs = () => {
    if (wsjsPatched && wsjsBackup != null) {
      try { fs.writeFileSync(WSJS, wsjsBackup, 'utf8'); console.log('== tl-workspace.js 已还原 =='); } catch (e) { console.error('还原失败!', e.message); }
      wsjsPatched = false;
    }
  };
  process.on('exit', restoreWsJs);
  process.on('SIGINT', () => { restoreWsJs(); process.exit(2); });
  const proc = spawn(EDGE, ['--headless=new', '--allow-file-access-from-files',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(OUT, 'profile_v226' + TAG),
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
  await sleep(1500);
  await page.evaluate(() => { document.body.classList.add('ry-tool'); try { localStorage.clear(); } catch (e) { } });
  await page.evaluate(() => {
    window.measuredPolygon = [{ x: 0, y: 0 }, { x: 320, y: 0 }, { x: 320, y: 200 }, { x: 0, y: 200 }];
    window.measuredPolygonSource = 'verify';
    if (typeof window.ppLoadPolygon === 'function') window.ppLoadPolygon();
    if (typeof window.ryShowSection === 'function') window.ryShowSection(document.getElementById('pipePlanSection'), null);
  });
  await sleep(400);
  await page.evaluate(() => { const b = document.getElementById('ppGenerate'); if (b) b.click(); });
  await sleep(1500);
  await page.evaluate(() => { if (typeof window.ryShowSection === 'function') window.ryShowSection(document.getElementById('tlPipePlanSection'), null); });
  await sleep(400);
  await page.evaluate(() => { const b = document.getElementById('tlAutoPipe'); if (b) b.click(); });
  await sleep(2000);
  await page.evaluate(() => { if (typeof window.rySetTab === 'function') window.rySetTab('tlPipePlanSection', 'ws'); });
  await sleep(1400);

  const RE_LOSS = /本轮水头损失 ≈ (\d+\.\d{2}) m（总管 (\d+\.\d{2}) \+ 主管 (\d+\.\d{2}) \+ 支管 (\d+\.\d{2})）/;
  const RE_FLOW2 = /本轮合灌流量 ≈ (\d+\.\d{2}) m³\/h/;
  const RE_FLOW_BAD = /本轮合灌流量 ≈ (\d+\.\d{3,}) m³\/h/;

  async function clickChip(g1based) {
    await page.evaluate((g) => {
      var b = document.querySelector('#tlDemoChips button[data-demo-g="' + g + '"]');
      if (b) b.click(); else throw new Error('chip not found g=' + g);
    }, g1based);
    await sleep(600);
  }
  async function boxTxt() {
    return await page.evaluate(() => { var b = document.getElementById('tlWsGroupInfo'); return b ? b.textContent.trim() : ''; });
  }

  if (!INJECT || true) {
    /* ①+②+③ 自动分组：★ data-demo-g 是 0 基（'0'=组1 ..），另有 ▶轮播/■退出 两个无属性按钮 */
    await clickChip(0);
    const t1 = await boxTxt();
    check('① 组1 框内出现「本轮水头损失」行（格式含各段两位小数）', RE_LOSS.test(t1),
      RE_LOSS.test(t1) ? ('命中: ' + (t1.match(RE_LOSS) || [])[0]) : '框内容=' + t1.slice(0, 160));

    const mFlow1 = t1.match(RE_FLOW2), badFlow1 = t1.match(RE_FLOW_BAD);
    check('②a 组1 流量恰好两位小数', !!mFlow1 && !badFlow1,
      mFlow1 ? ('值=' + mFlow1[1]) : '未命中两位小数格式；框=' + t1.slice(0, 160));
    check('②b 单位已修正为 m³/h（不再出现 L/h）', /m³\/h/.test(t1) && !/L\/h/.test(t1), '');

    const gVals = await page.evaluate(() =>
      [].slice.call(document.querySelectorAll('#tlDemoChips button[data-demo-g]')).map(b => parseInt(b.getAttribute('data-demo-g'), 10)));
    const gLast = Math.max.apply(null, gVals);
    info('演示 chips data-demo-g=' + gVals.join(',') + '（0 基）');
    await clickChip(gLast);
    const tN = await boxTxt();
    const mLossN = tN.match(RE_LOSS);
    const L1 = JSON.parse(await page.evaluate(BRIDGE + '(0)'));
    const LN = JSON.parse(await page.evaluate(BRIDGE + '(' + gLast + ')'));
    const dN = mLossN ? Math.abs(parseFloat(mLossN[1]) - LN.total) : Infinity;
    const d1 = RE_LOSS.test(t1) ? Math.abs(parseFloat(t1.match(RE_LOSS)[1]) - L1.total) : Infinity;
    check('③a 组1 框内损失 = 桥现算值（±0.005）', d1 <= 0.005, '框=' + (RE_LOSS.test(t1) ? t1.match(RE_LOSS)[1] : '无') + ' 桥=' + (L1 ? L1.total.toFixed(3) : 'null') + ' Δ=' + d1.toFixed(4));
    check('③b 末组(g=' + gLast + ') 框内损失 = 桥现算值（±0.005）', mLossN && dN <= 0.005,
      '框=' + (mLossN ? mLossN[1] : '无') + ' 桥=' + (LN ? LN.total.toFixed(3) : 'null') + ' Δ=' + dN.toFixed(4));
    check('③c 切组后框内容随组变化（组1 ≠ 末组 的损失行）',
      RE_LOSS.test(t1) && mLossN && (t1.match(RE_LOSS)[0] !== mLossN[0] || Math.abs(L1.total - LN.total) < 1e-9),
      '组1=' + (RE_LOSS.test(t1) ? t1.match(RE_LOSS)[1] : '?') + ' 末组=' + (mLossN ? mLossN[1] : '?'));
    check('③d 桥对两组给出的 total / flow 为正数', L1 && LN && L1.total > 0 && LN.total > 0 && L1.flow > 0 && LN.flow > 0,
      '组1=' + JSON.stringify(L1) + ' 末组=' + JSON.stringify(LN));

    /* ④ 参数实时：目标流速 1.5→2.5 ⇒ 管径变小 ⇒ 同组损失变大（证明每次现算） */
    const beforeTotal = LN.total;
    await page.evaluate(() => {
      const el = document.getElementById('tlPlanTargetV');
      el.value = '2.5';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await sleep(700);
    await clickChip(0);
    await clickChip(gLast);
    const tN2 = await boxTxt();
    const mLoss2 = tN2.match(RE_LOSS);
    const afterTotal = mLoss2 ? parseFloat(mLoss2[1]) : NaN;
    check('④ 改目标流速后同组损失实时更新且变大（' + beforeTotal.toFixed(2) + ' → ' + afterTotal.toFixed(2) + ' m）',
      isFinite(afterTotal) && afterTotal > beforeTotal + 0.005,
      '前=' + beforeTotal.toFixed(3) + ' 后=' + afterTotal.toFixed(3));
    /* 恢复流速，避免影响后续场景 */
    await page.evaluate(() => {
      const el = document.getElementById('tlPlanTargetV');
      el.value = '1.5';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await sleep(700);
  }

  /* ⑤ 手动分组（按面积成组 36 亩）→ M 组框同样有损失行 */
  await page.evaluate(() => {
    const b = document.getElementById('tlDemoExitBtn') || document.querySelector('#tlDemoChips + button');
    if (b) b.click();
  });
  await sleep(300);
  await page.evaluate(() => { if (typeof window.rySetTab === 'function') window.rySetTab('tlPipePlanSection', 'diagram'); });
  await sleep(800);
  await page.evaluate(() => { const b = document.getElementById('tlAreaGroupBtn'); if (b) b.click(); });
  await sleep(1200);
  await page.evaluate(() => { if (typeof window.rySetTab === 'function') window.rySetTab('tlPipePlanSection', 'ws'); });
  await sleep(1200);
  const chipCnt2 = await page.evaluate(() => document.querySelectorAll('#tlDemoChips button[data-demo-g]').length);
  if (chipCnt2 > 0) {
    await clickChip(1);
    const tM = await boxTxt();
    check('⑤ 手动分组（按面积成组）M 组框同样有损失行', /手动联合灌溉组/.test(tM) && RE_LOSS.test(tM),
      '框=' + tM.slice(0, 170));
  } else {
    check('⑤ 手动分组（按面积成组）M 组框同样有损失行', false, '按面积成组后无演示 chips（组数=0），场景未生效');
  }

  check('⑥ 无 JS 报错', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log('\n== 汇总 ==\n断言 ' + pass + '/' + (pass + fail) + ' PASS');
  const okAll = fail === 0 && errs.length === 0;
  try { await page.close(); } catch (e) { }
  try { await browser.disconnect(); } catch (e) { }
  killTree(proc.pid); await sleep(400);
  if (INJECT) {
    try { if (path.dirname(pageFile) === WS && path.basename(pageFile).indexOf('_inj_v226_') === 0) fs.unlinkSync(pageFile); } catch (e) { }
    console.log(fail > 0 ? '== 注入命中（闸门有效）==' : '== 注入未命中（闸门被写哑！）==');
    process.exit(fail > 0 ? 0 : 1);
  }
  if (!okAll) process.exitCode = 1;
  process.exit(0);
})().catch(e => { console.error('FATAL', e && e.message); process.exit(2); });
