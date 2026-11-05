/* verify_zone_merge_last.js —— v969「末排并入上排」页面级端到端闸门
   ═══════════════════════════════════════════════════════════════════════════
   背景：v969 在二级「分区划定」旁新增 #planZoneMergeLast 勾选项（方案C）。
   勾选后行方向末排整排并入上一排：行切分 [160,160,160] → [160,320]，
   15 区 → 10 区；桥接 getZoneCuts() 读 ppGetZoneCuts ⇒ 三级页 / 施工简图 /
   水力 / 材料全链路自动跟随。切割线快照签名含 |m 标志，勾选即作废旧快照。

   本闸门验证（页面级 + 真实渲染，注入 521×480 地块 / 24 亩 / 铺设长度 80）：
     A. RyZoneGeometry.VERSION = 891
     B. 纯函数：splitZoneLength(480,160,500,true) = [160,320]；manualZoneLayout 10 区
     C. 勾选端到端：ppGenerate 走真实路径 → 施工简图表头「10分区」、
        分区标签 10 个且为「50.0亩 设24.0」（104.2×320=50 亩，双口径并显）
     D. 取消勾选：重算回到 15 分区（开关可逆，快照签名正确失效重建）
     E. 无脚本错误（排除 file:// CORS 噪声）
   用法：node verify_zone_merge_last.js [工作目录]
   输出：<工作目录>/_p1/zone_merge_last_report.txt   exit 0=全过 / 1=有失败
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

    /* ---------- A / B ---------- */
    const data = await page.evaluate(() => {
      const G = window.RyZoneGeometry;
      const out = { ver: G ? Number(G.VERSION) : 0 };
      const parts = G.splitZoneLength(480, 160, 500, true);
      out.merged = parts;
      const L = G.manualZoneLayout(521, 480, 24, 160, 666.67, 500, true);
      out.layout = { rows: L.rows, N: L.N, mergeLastRow: L.mergeLastRow, yParts: L.yParts };
      out.checkbox = !!document.getElementById('planZoneMergeLast');
      out.wrapper = (typeof planZoneMergeLastOn === 'function');
      return out;
    });
    check('A1 RyZoneGeometry.VERSION = 891', data.ver === 891, '实际 ' + data.ver);
    check('A2 #planZoneMergeLast 存在于面板', data.checkbox);
    check('A3 planZoneMergeLastOn 包装可用', data.wrapper);
    check('B1 splitZoneLength(480,160)+merge → [160,320]',
      Array.isArray(data.merged) && data.merged.length === 2 &&
      Math.abs(data.merged[0] - 160) < 1e-6 && Math.abs(data.merged[1] - 320) < 1e-6,
      JSON.stringify(data.merged));
    check('B2 manualZoneLayout+merge → 5列×2行=10区',
      data.layout.N === 10 && data.layout.rows === 2 && data.layout.mergeLastRow === true,
      JSON.stringify(data.layout));

    /* ---------- C：勾选端到端 ---------- */
    const gen = async checked => page.evaluate(chk => {
      const cb = document.getElementById('planZoneMergeLast');
      if (!cb) return { cb: false };
      cb.checked = chk;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
      cb.dispatchEvent(new Event('input', { bubbles: true }));
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
      const touched = setVal('planZoneMuManual', 24) && setVal('planTapeLaySide', 80);
      if (typeof window.calcPlan === 'function') { try { window.calcPlan(); } catch (e) { } }
      return { cb: true, touched, polyN: (window.ppGetPolyPts && window.ppGetPolyPts().length) || 0 };
    }, checked);
    const read = async () => page.evaluate(() => {
      const host = document.getElementById('ppDiagramContent');
      const all = host ? Array.from(host.querySelectorAll('text')).map(t => t.textContent.trim()) : [];
      return {
        head: all.find(t => /面积.*地块.*分区/.test(t)) || '',
        zoneAreas: all.filter(t => /亩 设/.test(t)),
        zoneCount: all.filter(t => /^\d+区$/.test(t)).length
      };
    });

    const c1 = await gen(true);
    await sleep(800);
    const btn = await page.evaluate(() => { const b = document.getElementById('ppGenerate'); if (b) b.click(); return !!b; });
    await sleep(2500);
    const c2 = await read();
    check('C0 勾选注入完成', c1.cb && c1.touched && c1.polyN === 4 && btn,
      JSON.stringify({ touched: c1.touched, poly: c1.polyN, btn }));
    check('C1 勾选后表头为「10分区」', /10分区/.test(c2.head), c2.head.slice(0, 90));
    check('C2 标签口径：5 个 25.0亩（上排）+ 5 个 50.0亩（并入排），双口径并显',
      c2.zoneAreas.length === 10 &&
      c2.zoneAreas.filter(t => t === '25.0亩 设24.0').length === 5 &&
      c2.zoneAreas.filter(t => t === '50.0亩 设24.0').length === 5,
      '标签数 ' + c2.zoneAreas.length + '，样例 ' + JSON.stringify([...new Set(c2.zoneAreas)]));

    /* ---------- D：取消勾选可逆 ---------- */
    await gen(false);
    await sleep(800);
    await page.evaluate(() => { const b = document.getElementById('ppGenerate'); if (b) b.click(); });
    await sleep(2500);
    const d2 = await read();
    check('D1 取消勾选后回到「15分区」', /15分区/.test(d2.head), d2.head.slice(0, 90));
    check('D2 标签数回到 15', d2.zoneAreas.length === 15, '标签数 ' + d2.zoneAreas.length);

    /* ---------- E ---------- */
    const realErrors = errors.filter(e => !/favicon|ERR_FILE_NOT_FOUND|ERR_CONNECTION|ERR_NAME_NOT_RESOLVED|ERR_FAILED|Failed to load resource|CORS policy|tcloudbase|Access to (script|fetch)/i.test(e));
    check('E1 无脚本错误', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

    console.log('\n勾选渲染表头: ' + c2.head);
  } catch (err) {
    check('执行异常', false, err && err.message);
  } finally {
    try { if (browser) await browser.close(); } catch (e) { }
  }

  const ok = results.length > 0 && results.every(Boolean);
  fs.writeFileSync(path.join(OUT, 'zone_merge_last_report.txt'),
    lines.join('\n') + '\n\n' + (ok ? '结论：全部通过' : '结论：存在失败项'), 'utf8');
  console.log('\n' + (ok ? '== 全部通过 ==' : '== 存在失败项 =='));
  process.exit(ok ? 0 : 1);
})();
