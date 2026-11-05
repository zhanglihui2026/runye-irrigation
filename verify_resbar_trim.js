/* verify_resbar_trim.js —— v972「二级水力计算结果条裁撤 + 每亩流量移位」页面级闸门
   ═══════════════════════════════════════════════════════════════════════════
   用户要求（2026-11-05 截图红框）：
     ① 「每亩流量」行移入灌溉参数区、放在「目标流速」之下；
     ② 二级「水力计算结果」整条（#ppPlanBar2 + v252/v609 折叠头）取消；
     ③ 别删错 —— 三级页「水力计算结果」（#tlPlanBar2，带改径重算下拉）必须原样健在。

   本闸门（页面级 + 真实渲染，注入 521×480 地块 / 24 亩 / 铺设长度 80）：
     A. #ppPlanBar2 不存在；#tlPlanBar2 存在且带 pp-res-head（三级未受伤）
     B. #planIntensity 在 #ppPlanBar 内、位于 #planTargetV 之后（DOM 次序）
     C. 生成后 #planIntensity 非「—」（守卫写入生效）
     D. window.planData.zoneFlow/pumpHead/pumpPower 为有限数（数据侧零损失）
     E. 无脚本错误（calcPlan 写已删元素不再抛错；排除 file:// CORS 噪声）
   用法：node verify_resbar_trim.js [工作目录]
   输出：<工作目录>/_p1/resbar_trim_report.txt   exit 0=全过 / 1=有失败
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

    const a = await page.evaluate(() => {
      const bar2 = document.getElementById('ppPlanBar2');
      const tlBar2 = document.getElementById('tlPlanBar2');
      const inten = document.getElementById('planIntensity');
      const targetV = document.getElementById('planTargetV');
      const bar = document.getElementById('ppPlanBar');
      let afterTarget = false, inBar = false;
      if (inten && targetV && bar) {
        inBar = bar.contains(inten);
        afterTarget = !!(targetV.compareDocumentPosition(inten) & Node.DOCUMENT_POSITION_FOLLOWING);
      }
      return {
        bar2Gone: !bar2,
        tlAlive: !!tlBar2 && tlBar2.classList.contains('pp-res-head'),
        inBar: inBar, afterTarget: afterTarget
      };
    });
    check('A1 二级 #ppPlanBar2 已整条移除', a.bar2Gone);
    check('A2 三级 #tlPlanBar2 健在且仍带折叠头（别删错）', a.tlAlive);
    check('B1 每亩流量在灌溉参数区 #ppPlanBar 内', a.inBar);
    check('B2 每亩流量位于目标流速之后', a.afterTarget);

    /* 注入地块 + 生成（真实 calcPlan 路径） */
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

    const c = await page.evaluate(() => {
      const inten = document.getElementById('planIntensity');
      const pd = window.planData || {};
      return {
        inten: inten ? inten.textContent.trim() : null,
        zf: typeof pd.zoneFlow === 'number' && isFinite(pd.zoneFlow),
        ph: typeof pd.pumpHead === 'number' && isFinite(pd.pumpHead),
        pw: typeof pd.pumpPower === 'number' && isFinite(pd.pumpPower),
        mv: typeof pd.mainVelocity === 'number' && isFinite(pd.mainVelocity)
      };
    });
    check('C1 生成后每亩流量已写入（非「—」）', c.inten && c.inten !== '—', JSON.stringify(c.inten));
    check('D1 planData 数据侧零损失（zoneFlow/pumpHead/pumpPower/mainVelocity）',
      c.zf && c.ph && c.pw && c.mv, JSON.stringify({ zf: c.zf, ph: c.ph, pw: c.pw, mv: c.mv }));

    const realErrors = errors.filter(e => !/favicon|ERR_FILE_NOT_FOUND|ERR_CONNECTION|ERR_NAME_NOT_RESOLVED|ERR_FAILED|Failed to load resource|CORS policy|tcloudbase|Access to (script|fetch)/i.test(e));
    check('E1 无脚本错误', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));
  } catch (err) {
    check('执行异常', false, err && err.message);
  } finally {
    try { if (browser) await browser.close(); } catch (e) { }
  }

  const ok = results.length > 0 && results.every(Boolean);
  fs.writeFileSync(path.join(OUT, 'resbar_trim_report.txt'),
    lines.join('\n') + '\n\n' + (ok ? '结论：全部通过' : '结论：存在失败项'), 'utf8');
  console.log('\n' + (ok ? '== 全部通过 ==' : '== 存在失败项 =='));
  process.exit(ok ? 0 : 1);
})();
