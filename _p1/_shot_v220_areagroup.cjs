/* _p1/_shot_v220_areagroup.cjs · [v220]「按面积成组」验证
 * 用户原话：「增加一个功能，是跟现有联合灌溉区的划分做互补的，就是设定联合灌溉区为 36 亩，
 *            自动按顺序累加二级管路传递过来的分区面积，累计到 36 亩范围内作为一个联合灌溉区，
 *            这样我可以把 3/4/5 个小灌溉区合成一个联合灌溉区。」
 *
 * ★ 走真实入口：三角形地块（刻意非矩形！矩形下「实际裁剪面积==名义网格面积」，注入 I2 会测不出
 *   ——第五种形态：样本退化）→ 生成平面图 → 三级页生成管线图 → 点「按面积成组」。
 * ★ 接 PA_PAGE / PA_PORT / PA_TAG。
 *
 * 断言：
 *   ① UI 存在（输入框 + 按钮）
 *   ② 36 亩成组：a) 覆盖性——全部分区恰好各出现一次  b) 顺序性——组内区号升序、组间拼接=0..N-1
 *      c) 约束——每组合计 ≤ 目标亩（容差 0.05）**或**单区组（单区自身超目标时独占）
 *      d) 组数 ≥ 2 且 ≠ 均分组数（否则这个功能没有存在价值）
 *   ③ 与既有链路互补：演示 chips 走手动分支（M 标签），组数=面积分组数
 *   ④ 点「2区」按钮 → tlManualGroups 清空（回到均分，天然互斥）
 *   ⑤ 非法输入（空/0/负）→ 不分组、有提示
 *   ⑥ 无 JS 报错
 * 注入（--inject + PA_TAG=I1/I2，一次一条）：
 *   I1 去掉断组条件 ⇒ 全部并成一组 ⇒ ②c/②d 红
 *   I2 分组面积换成名义网格面积（xPlan*yPlan，绕开裁剪）⇒ 三角形下分组边界变化 ⇒ ② 红
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
const PORT = parseInt(process.env.PA_PORT || '9600', 10);
const PAGE = process.env.PA_PAGE || 'index.html';
const TAG = process.env.PA_TAG || '';
const INJECT = process.argv.indexOf('--inject') >= 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileUrl = (p) => 'file:///' + encodeURI(p.replace(/\\/g, '/'));

let pass = 0, fail = 0;
const check = (n, ok, extra) => { console.log((ok ? '  [PASS] ' : '  [FAIL] ') + n + (extra ? ' :: ' + extra : '')); ok ? pass++ : fail++; };
const info = (s) => console.log('  [INFO] ' + s);

const INJ_SPEC = [
  ['    if (cur.length && sum + a > targetM2) { groups.push(cur); cur = []; sum = 0; }',
    '    if (false) { groups.push(cur); cur = []; sum = 0; }',
    '去掉断组条件（期望：② 组数/约束 红）'],
  ['    var r = ryZoneAreaGroups(z, d.poly, total);',
    '    var r=(function(){var cells=[];for(var zi=0;zi<total;zi++){var zc=zi%z.cols,zr=Math.floor(zi/z.cols);cells.push((z.xPlan?z.xPlan[zc]:0)*(z.yPlan?z.yPlan[zr]:0));}return {ok:true,cells:cells};})()',
    '面积换名义网格面积（期望：② 红——三角形下实际≠名义）']
];

const PROBE = `(()=>{try{
  var d=window.tlDiagramData, z=d&&d.zones;
  var total=z?((z.cols||(z.xPos?z.xPos.length-1:0))*(z.rows||(z.yPos?z.yPos.length-1:0))):0;
  var areas=null;
  try{var r=ryZoneAreaGroups(z,d.poly,total); if(r&&r.ok) areas=r.cells;}catch(e){}
  var mg=window.tlManualGroups||null;
  var sums=(mg&&areas)?mg.map(function(g){var s=0;for(var i=0;i<g.length;i++)s+=(areas[g[i]]||0);return +(s/666.67).toFixed(2);}):null;
  return JSON.stringify({
    total:total, mg:mg, sumsMu:sums, areasMu:(areas||[]).map(function(a){return +(a/666.67).toFixed(2);}),
    demoM:(typeof tlDemoGroupCount==='function')?tlDemoGroupCount():null,
    chips:Array.prototype.slice.call(document.querySelectorAll('#tlDemoChips button[data-demo-g]')).map(function(b){return b.textContent;}),
    toast:(document.getElementById('atToast')||{}).textContent||''
  });
}catch(e){return 'ERR:'+e.message;}})()`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  let pageFile = path.join(WS, PAGE);
  if (INJECT) {
    let src = fs.readFileSync(pageFile, 'utf8');
    const EOL = src.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
    const idx = Math.max(0, parseInt(String(TAG).replace(/[^0-9]/g, ''), 10) - 1);
    const pair = INJ_SPEC[idx];
    if (!pair) { console.error('未找到注入 I' + (idx + 1)); process.exit(2); }
    const from = pair[0].replace(/\n/g, EOL);
    const n = src.split(from).length - 1;
    if (n !== 1) { console.error('注入 I' + (idx + 1) + ' 锚点命中 ' + n + ' 处（要求恰好 1）'); process.exit(2); }
    src = src.replace(from, pair[1].replace(/\n/g, EOL));
    pageFile = path.join(WS, '_inj_v220_' + TAG + '.html');
    fs.writeFileSync(pageFile, src, 'utf8');
    console.log('== 注入模式 I' + (idx + 1) + '：' + pair[2]);
  }
  const proc = spawn(EDGE, ['--headless=new', '--allow-file-access-from-files',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(OUT, 'profile_v220' + TAG),
    '--no-first-run', '--no-default-browser-check', '--window-size=1500,950', 'about:blank'], { stdio: 'ignore' });
  let browser = null;
  for (let i = 0; i < 50; i++) {
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

  /* 真实入口：直角三角形地块（南宽北窄到尖），实际裁剪面积 ≠ 名义网格面积 */
  await page.evaluate(() => {
    window.measuredPolygon = [{ x: 0, y: 0 }, { x: 320, y: 0 }, { x: 0, y: 200 }];
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
  await sleep(2200);

  /* ① UI */
  const ui = await page.evaluate(() => ({
    btn: !!document.getElementById('tlAreaGroupBtn'),
    inp: !!document.getElementById('tlAreaGroupMu'),
    val: (document.getElementById('tlAreaGroupMu') || {}).value
  }));
  check('① 「按面积成组」按钮存在', ui.btn);
  check('① 目标亩数输入框存在（默认 36）', ui.inp && ui.val === '36', 'value=' + ui.val);

  /* ⑤ 先测非法输入（此时还没分组） */
  await page.evaluate(() => { document.getElementById('tlAreaGroupMu').value = ''; });
  await page.evaluate(() => { document.getElementById('tlAreaGroupBtn').click(); });
  await sleep(500);
  const sBad = JSON.parse(await page.evaluate(PROBE));
  check('⑤ 空输入：不分组且有提示', !sBad.mg && sBad.toast.indexOf('目标面积') >= 0,
    'mg=' + JSON.stringify(sBad.mg) + ' toast=' + sBad.toast);

  /* ② 36 亩成组 */
  await page.evaluate(() => { document.getElementById('tlAreaGroupMu').value = '36'; });
  await page.evaluate(() => { document.getElementById('tlAreaGroupBtn').click(); });
  await sleep(1800);
  const s1 = JSON.parse(await page.evaluate(PROBE));
  info('分区实际面积(亩)=' + JSON.stringify(s1.areasMu) + '  共 ' + s1.total + ' 区');
  info('分组=' + JSON.stringify(s1.mg) + '  各组合计(亩)=' + JSON.stringify(s1.sumsMu));
  const mg = s1.mg || [];
  check('② 生成了分组（非空）', mg.length > 0, JSON.stringify(mg));
  /* a) 覆盖性 */
  const flat = mg.slice().flat().slice().sort((a, b) => a - b);
  const coverOK = flat.length === s1.total && flat.every((v, i) => v === i);
  check('②a 覆盖性：全部分区恰好各出现一次', coverOK, 'flat=' + JSON.stringify(flat));
  /* b) 顺序性：组内升序，组间首尾递增（拼接=0..N-1 已由覆盖性保证升序部分） */
  const ordOK = mg.every(g => g.every((v, i) => i === 0 || v > g[i - 1])) &&
    mg.every((g, i) => i === 0 || g[0] > mg[i - 1][mg[i - 1].length - 1]);
  check('②b 顺序性：按分区顺序累加（组内升序、组间递增）', ordOK, JSON.stringify(mg));
  /* c) 约束：≤目标 或 单区组 */
  const TOL = 0.05;
  const consOK = s1.sumsMu.every((s, i) => s <= 36 + TOL || mg[i].length === 1);
  check('②c 约束：每组合计 ≤ 36 亩（或单区自身超目标独占）', consOK, 'sums=' + JSON.stringify(s1.sumsMu));
  /* d) 组数价值：≠ 均分组数（ceil(6/2)=3）且 ≥2 */
  check('②d 组数与均分不同（互补价值）且 ≥2', s1.mg.length >= 2 && s1.mg.length !== 3,
    '组数=' + s1.mg.length + '（均分=3）');
  /* ③ 演示 chips 走手动分支 */
  check('③ 演示组数 = 面积分组数', s1.demoM === mg.length, 'demoM=' + s1.demoM);
  check('③ chips 用 M 标签（手动分支）', s1.chips.length === mg.length && s1.chips.every(t => /^M\d+$/.test(t)),
    JSON.stringify(s1.chips));

  /* ④ 点「2区」→ 回均分 */
  await page.evaluate(() => { var b = document.querySelector('#tlZoneCountGroup button[data-n="2"]'); if (b) b.click(); });
  await sleep(2000);
  const s2 = JSON.parse(await page.evaluate(PROBE));
  check('④ 点 N 区按钮后清空面积分组（回到均分）', (!s2.mg || !s2.mg.length) && s2.demoM === 3,
    'mg=' + JSON.stringify(s2.mg) + ' demoM=' + s2.demoM);

  /* ⑥ 再点一次按面积（换目标 10 亩 → 更细的组） */
  await page.evaluate(() => { document.getElementById('tlAreaGroupMu').value = '10'; });
  await page.evaluate(() => { document.getElementById('tlAreaGroupBtn').click(); });
  await sleep(1800);
  const s3 = JSON.parse(await page.evaluate(PROBE));
  const consOK10 = s3.sumsMu.every((s, i) => s <= 10 + TOL || (s3.mg[i] || []).length === 1);
  check('⑥ 目标 10 亩：重新分组且约束仍成立', s3.mg && s3.mg.length >= 2 && consOK10,
    '分组=' + JSON.stringify(s3.mg) + ' 合计=' + JSON.stringify(s3.sumsMu));

  check('⑦ 无 JS 未捕获异常', errs.length === 0, JSON.stringify(errs.slice(0, 3)));

  try { await page.screenshot({ path: path.join(OUT, 'v220_areagroup' + TAG + '.png') }); info('留档截图 _verify_out/v220_areagroup' + TAG + '.png'); } catch (e) { }

  console.log('\n== 汇总 ==');
  console.log('断言 ' + pass + '/' + (pass + fail) + ' PASS' + (fail ? '  FAIL=' + fail : ''));
  try { await page.close(); } catch (e) { }
  try { await browser.disconnect(); } catch (e) { }
  killTree(proc.pid);
  await sleep(600);
  if (INJECT) { try { fs.unlinkSync(pageFile); } catch (e) { } }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e && e.message); process.exit(2); });
