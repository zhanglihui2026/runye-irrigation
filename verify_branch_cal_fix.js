/* verify_branch_cal_fix.js —— v972「支管改径无图面联动 + 档位上限<主管」页面级闸门
   ═══════════════════════════════════════════════════════════════════════════
   用户反馈（2026-11-05）：
     ① 「支管的管径选择之后 相关的扬程 流速 计算数据没有变，应该随着支管调整数据就要变」
        根因① tlBindCalSels 首元素一次性绑定，三级面板 DOM 重建后新 <select> 无监听；
        根因② computeThreeLevel 只在图面路径（wp.fromFigure）分支应用 tlManualCals，
        无图面时选档完全不参与计算，改径列恒「—」、下拉被刷新回设计值。
     ② 「支管可选择的管径范围一定是比主管细的，比主管粗的按照常理是不会选的」

   本闸门（注入 521×480 地块 / 24 亩 / 铺设长度 80，真实渲染）：
     A. 版本串 = 972-branch-cal-fix、面板下拉存在
     B. 支管下拉全部档位 < 主管有效管径，设计档在列（含「设计」标注）
     C. 无图面（tlDiagramData=null）选支管 Ø63 → tlManualCals.branch=63、
        改径重算列（扬程/流速 Real）点亮且扬程 > 设计值（管径变细损失增大）、
        下拉选中值保持 Ø63 不被重置
     D. 选回设计值 → 覆盖清除、改径列恢复「—」
     E. 委托绑定存活：把 #tlCalSelBranch 换成全新元素（模拟面板重建）后选档仍生效
     F. 无脚本错误（排除 file:// CORS 噪声）
   用法：node verify_branch_cal_fix.js [工作目录]
   输出：<工作目录>/_p1/branch_cal_fix_report.txt   exit 0=全过 / 1=有失败
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const WS = process.argv[2] || 'C:\\Users\\AHS\\runye-irrigation';
const OUT = path.join(WS, '_p1');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const lines = [];
const results = [];
function check(name, cond, detail) {
  results.push(!!cond);
  const s = (cond ? '[PASS] ' : '[FAIL] ') + name + (detail ? '  :: ' + detail : '');
  lines.push(s);
  console.log(s);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const num = t => { const m = /(-?\d+(?:\.\d+)?)/.exec(t || ''); return m ? Number(m[1]) : NaN; };

(async () => {
  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: 'msedge' });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

    await page.goto('file:///' + path.join(WS, 'index.html').replace(/\\/g, '/'), { waitUntil: 'load', timeout: 90000 });
    await sleep(2500);

    const a = await page.evaluate(() => ({
      sel: !!document.getElementById('tlCalSelBranch')
    }));
    check('A1 #tlCalSelBranch 存在', a.sel);
    const verOk = fs.readFileSync(path.join(WS, 'index.html'), 'utf8').includes('972-branch-cal-fix');
    check('A2 版本串 = 972-branch-cal-fix', verOk);

    /* 注入地块并生成（同 verify_zone_area_drift F 路径） */
    await page.evaluate(() => {
      window.measuredPolygon = [{ x: 0, y: 0 }, { x: 521, y: 0 }, { x: 521, y: 480 }, { x: 0, y: 480 }];
      window.measuredArea = 521 * 480;
      if (typeof window.ppLoadPolygon === 'function') window.ppLoadPolygon();
      const setVal = (id, v) => {
        const el = document.getElementById(id);
        if (!el) return false;
        el.value = v;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      };
      const mode = document.getElementById('planZoneMode');
      if (mode) { mode.value = 'manual'; mode.dispatchEvent(new Event('change', { bubbles: true })); }
      setVal('planZoneMuManual', 24);
      setVal('planTapeLaySide', 80);
      if (typeof window.calcPlan === 'function') { try { window.calcPlan(); } catch (e) { } }
    });
    await sleep(800);
    await page.evaluate(() => { const b = document.getElementById('ppGenerate'); if (b) b.click(); });
    await sleep(2500);

    /* B：支管档位全部 < 主管有效管径 */
    const b = await page.evaluate(() => {
      const numIn = t => { const m = /(-?\d+(?:\.\d+)?)/.exec(t || ''); return m ? Number(m[1]) : NaN; };
      const sel = document.getElementById('tlCalSelBranch');
      if (!sel) return null;
      const opts = Array.from(sel.options).map(o => ({ v: Number(o.value), t: o.textContent }));
      const mainTxt = (document.getElementById('tlPlanMainPipe') || {}).textContent || '';
      return { opts, mainOd: numIn(mainTxt), des: Number(sel.getAttribute('data-design')), val: sel.value };
    });
    check('B1 支管下拉存在且有选项', b && b.opts.length > 0, b ? '档数 ' + b.opts.length : '无下拉');
    check('B2 全部档位 < 主管管径(' + (b ? b.mainOd : '?') + ') mm',
      b && b.mainOd > 0 && b.opts.every(o => o.v < b.mainOd),
      b ? '档位 ' + b.opts.map(o => o.v).join(',') : '');
    check('B3 设计档在列且标「设计」',
      b && b.opts.some(o => o.v === b.des && /设计/.test(o.t)),
      b ? 'design=' + b.des : '');
    check('B4 最大档 = 比主管小一档（180 < 200）', b && b.opts[b.opts.length - 1].v === 180,
      b ? '最大档 ' + b.opts[b.opts.length - 1].v : '');

    /* C：无图面场景选支管 Ø63 → 改径列点亮、扬程升高 */
    const c0 = await page.evaluate(() => {
      window.tlDiagramData = null;                    // 模拟用户当前「无三级图面」状态
      const head = (document.getElementById('tlPlanPumpHead') || {}).textContent || '';
      return { desHead: head };
    });
    const c1 = await page.evaluate(() => {
      const el = document.getElementById('tlCalSelBranch');
      el.value = '63';
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { manual: window.tlManualCals ? window.tlManualCals.branch : undefined };
    });
    await sleep(1500);
    const c2 = await page.evaluate(() => ({
      headReal: (document.getElementById('tlPlanPumpHeadReal') || {}).textContent || null,
      velReal: (document.getElementById('tlPlanBranchVelocityReal') || {}).textContent || null,
      selVal: (document.getElementById('tlCalSelBranch') || {}).value || null
    }));
    const desHeadV = num(c0.desHead), realHeadV = num(c2.headReal);
    check('C1 无图面选 Ø63 → tlManualCals.branch=63', c1.manual === 63, '实际 ' + c1.manual);
    check('C2 改径重算扬程点亮且 ≠ 「—」', c2.headReal && c2.headReal !== '—', JSON.stringify(c2.headReal));
    check('C3 改径扬程(' + realHeadV + ') > 设计扬程(' + desHeadV + ')（管径变细损失增大）',
      isFinite(realHeadV) && isFinite(desHeadV) && realHeadV > desHeadV);
    check('C4 改径重算支管流速点亮且 ≠ 「—」', c2.velReal && c2.velReal !== '—' && /m\/s/.test(c2.velReal),
      JSON.stringify(c2.velReal));
    check('C5 下拉选中值保持 63（不被重置回设计值）', String(c2.selVal) === '63', '实际 ' + c2.selVal);

    /* D：选回设计值 → 覆盖清除 */
    const d = await page.evaluate(() => {
      const el = document.getElementById('tlCalSelBranch');
      el.value = String(el.getAttribute('data-design'));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return window.tlManualCals ? window.tlManualCals.branch : undefined;
    });
    await sleep(1200);
    const d2 = await page.evaluate(() => (document.getElementById('tlPlanPumpHeadReal') || {}).textContent || null);
    check('D1 选回设计值 → 覆盖清除（branch=null）', d === null, '实际 ' + d);
    check('D2 改径列恢复「—」', d2 === '—', JSON.stringify(d2));

    /* E：委托绑定存活——把下拉换成全新元素（模拟三级面板 DOM 重建）后选档仍生效 */
    const e1 = await page.evaluate(() => {
      const el = document.getElementById('tlCalSelBranch');
      const fresh = el.cloneNode(true);           // 克隆节点不带任何旧监听
      el.parentNode.replaceChild(fresh, el);
      const el2 = document.getElementById('tlCalSelBranch');
      el2.value = '63';
      el2.dispatchEvent(new Event('change', { bubbles: true }));
      return { replaced: el2 !== el, manual: window.tlManualCals ? window.tlManualCals.branch : undefined };
    });
    await sleep(1200);
    const e2 = await page.evaluate(() => ({
      headReal: (document.getElementById('tlPlanPumpHeadReal') || {}).textContent || null
    }));
    check('E1 新元素（模拟面板重建）选 Ø63 仍生效 manual=63',
      e1.replaced && e1.manual === 63, '实际 ' + e1.manual);
    check('E2 重建后改径列依旧点亮', e2.headReal && e2.headReal !== '—', JSON.stringify(e2.headReal));

    const realErrors = errors.filter(e => !/favicon|ERR_FILE_NOT_FOUND|ERR_CONNECTION|ERR_NAME_NOT_RESOLVED|ERR_FAILED|Failed to load resource|CORS policy|tcloudbase|Access to (script|fetch)/i.test(e));
    check('F1 无脚本错误', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));
  } catch (err) {
    check('执行异常', false, err && err.message);
  } finally {
    try { if (browser) await browser.close(); } catch (e) { }
  }

  const ok = results.length > 0 && results.every(Boolean);
  fs.writeFileSync(path.join(OUT, 'branch_cal_fix_report.txt'),
    lines.join('\n') + '\n\n' + (ok ? '结论：全部通过' : '结论：存在失败项'), 'utf8');
  console.log('\n' + (ok ? '== 全部通过 ==' : '== 存在失败项 =='));
  process.exit(ok ? 0 : 1);
})();
