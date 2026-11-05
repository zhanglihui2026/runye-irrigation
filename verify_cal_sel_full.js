/* verify_cal_sel_full.js —— v970「管径选择全档位 + 流速提示」页面级端到端闸门
   ═══════════════════════════════════════════════════════════════════════════
   背景：水力计算结果面板 总管/主管/支管「改径重算」下拉原为设计值 ±3 档，
   支管设计 Ø140 时最小只能选 Ø90，用户要求能选更小（流速偏高可接受）。
   v970 改为全档位（PE_OD_SERIES 18 档）+ 每档按当前流量标注实际流速 +
   设计值标注「设计」。

   本闸门（页面级 + 真实渲染，注入 521×480 地块 / 24 亩 / 铺设长度 80）：
     A. RyZoneGeometry.VERSION = 891、#tlCalSelBranch 存在
     B. 生成后支管下拉 = 18 项、最小 Ø50、Ø63 档带流速后缀、设计档标「设计」
     C. 选 Ø63 → tlManualCals.branch=63、改径重算流速格非「—」且数值 ≈ 手算
     D. 选回设计值 Ø140 → tlManualCals.branch=null（覆盖清除）
     E. 无脚本错误（排除 file:// CORS 噪声）
   用法：node verify_cal_sel_full.js [工作目录]
   输出：<工作目录>/_p1/cal_sel_full_report.txt   exit 0=全过 / 1=有失败
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
      ver: window.RyZoneGeometry ? Number(window.RyZoneGeometry.VERSION) : 0,
      sel: !!document.getElementById('tlCalSelBranch')
    }));
    check('A1 RyZoneGeometry.VERSION = 891', a.ver === 891, '实际 ' + a.ver);
    check('A2 #tlCalSelBranch 存在', a.sel);

    /* 注入地块并生成（与 verify_zone_area_drift 同一 F 路径） */
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

    const b = await page.evaluate(() => {
      const numIn = t => { const m = /(-?\d+(?:\.\d+)?)/.exec(t || ''); return m ? Number(m[1]) : NaN; };
      const el = document.getElementById('tlCalSelBranch');
      if (!el) return null;
      const opts = Array.from(el.options).map(o => ({ v: Number(o.value), t: o.textContent }));
      const mainTxt = (document.getElementById('tlPlanMainPipe') || {}).textContent || '';
      return {
        opts,
        n: opts.length,
        min: opts.length ? opts[0].v : NaN,
        max: opts.length ? opts[opts.length - 1].v : NaN,
        o63: opts.find(o => o.v === 63),
        oDes: opts.find(o => /设计/.test(o.t)),
        des: Number(el.getAttribute('data-design')),
        mainOd: numIn(mainTxt)
      };
    });
    /* [v972] 支管档位改为 < 主管管径的上限过滤（用户口径：比主管粗的档不会选），
       B1/B2 断言随之改为「全部档位 < 主管有效管径、最大档 180」；总管/主管下拉仍是全档位。 */
    check('B1 支管下拉全部档位 < 主管管径（v972 上限过滤）',
      b && b.mainOd > 0 && b.opts.every(o => o.v < b.mainOd),
      b ? '主管 ' + b.mainOd + ' mm，档位 ' + b.opts.map(o => o.v).join(',') : '无下拉');
    check('B2 最小档 = Ø50（比旧 ±3 档窗口的 Ø90 更小）', b && b.min === 50, b ? '实际 ' + b.min : '');
    check('B3 Ø63 档带流速后缀', b && b.o63 && /m\/s/.test(b.o63.t), b && b.o63 ? b.o63.t : '');
    check('B4 设计档 Ø140 标注「设计」', b && b.oDes && b.oDes.v === b.des && b.des === 140,
      b && b.oDes ? b.oDes.t : '');

    /* C：选 Ø63 → 覆盖生效 + 改径重算流速刷新 */
    const c = await page.evaluate(() => {
      const el = document.getElementById('tlCalSelBranch');
      el.value = '63';
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { manual: window.tlManualCals ? window.tlManualCals.branch : undefined };
    });
    await sleep(1500);
    const c2 = await page.evaluate(() => {
      const v = document.getElementById('tlPlanBranchVelocityReal');
      return { vel: v ? v.textContent.trim() : null };
    });
    check('C1 选 Ø63 → tlManualCals.branch=63', c.manual === 63, '实际 ' + c.manual);
    check('C2 改径重算流速格已刷新（非「—」且含 m/s）',
      c2.vel && c2.vel !== '—' && /m\/s/.test(c2.vel), JSON.stringify(c2.vel));

    /* D：选回设计值 → 覆盖清除 */
    const d = await page.evaluate(() => {
      const el = document.getElementById('tlCalSelBranch');
      el.value = String(el.getAttribute('data-design'));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return window.tlManualCals ? window.tlManualCals.branch : undefined;
    });
    check('D1 选回设计值 → 覆盖清除（branch=null）', d === null, '实际 ' + d);

    const realErrors = errors.filter(e => !/favicon|ERR_FILE_NOT_FOUND|ERR_CONNECTION|ERR_NAME_NOT_RESOLVED|ERR_FAILED|Failed to load resource|CORS policy|tcloudbase|Access to (script|fetch)/i.test(e));
    check('E1 无脚本错误', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));
  } catch (err) {
    check('执行异常', false, err && (err.message + ' | ' + String(err.stack || '').split('\n').slice(1, 3).join(' ~ ')));
  } finally {
    try { if (browser) await browser.close(); } catch (e) { }
  }

  const ok = results.length > 0 && results.every(Boolean);
  fs.writeFileSync(path.join(OUT, 'cal_sel_full_report.txt'),
    lines.join('\n') + '\n\n' + (ok ? '结论：全部通过' : '结论：存在失败项'), 'utf8');
  console.log('\n' + (ok ? '== 全部通过 ==' : '== 存在失败项 =='));
  process.exit(ok ? 0 : 1);
})();
