/* verify_zone_area_drift.js —— 设计亩数 / 实划亩数 双口径显示闸门
   ═══════════════════════════════════════════════════════════════════════════
   背景（2026-11-05 用户反馈）：左侧「分区面积」填 24 亩，图面分区标签却是
   25.0 亩，用户读作「算错了」。根因是整数列数 + 余数均摊（不是 bug）：
   设计格宽 24*666.67/160 = 100 m，地块外接宽 521 m 除不尽 ⇒ 落 5 列，
   余 21 m 均摊进各列 ⇒ 每列 104.2 m ⇒ 单格 25.0 亩（+4.2%）。
   本轮按用户选定的方案 B 改界面：实划值后面并列设计值，偏差 >3% 标琥珀。

   本闸门验证（页面级 + 真实渲染）：
     A. RyZoneGeometry.VERSION = 890 且 zoneAreaDrift 已导出
     B. 函数口径：24 -> 25.0 双口径；25 -> 25.0 单口径；3% 内不打扰
     C. 几何链路复现截图：521x480 / 24 亩 / 固定边 160 -> 5 列 104.2 x 160 = 25.0 亩
     D. 三个改动文件按新版本串 968 装载（防旧缓存静默回退）
     E. 无脚本错误（pageerror / console.error，已排除 file:// 的 CORS 噪声）
     F. 端到端：注入 521x480 地块 + 24 亩/区 + 铺设长度 80，走真实「生成施工图」
        路径，施工简图表头出「设计 24.0 亩，+4.2%」、分区标签出「25.0亩 设24.0」
   用法：node verify_zone_area_drift.js [工作目录]
   输出：<工作目录>/_p1/zone_area_drift_report.txt + zone_drift_diagram.png
        exit 0=全过 / 1=有失败
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

    /* ---------- A / B / C / D ---------- */
    const data = await page.evaluate(() => {
      const G = window.RyZoneGeometry;
      const out = { hasG: !!G, ver: G ? Number(G.VERSION) : 0, hasDrift: !!(G && typeof G.zoneAreaDrift === 'function') };
      if (!out.hasDrift) return out;
      const MU = 666.67;
      out.case24 = G.zoneAreaDrift(24 * MU, 16672);
      out.case25 = G.zoneAreaDrift(25 * MU, 16672);
      out.caseSmall = G.zoneAreaDrift(24 * MU, 24.4 * MU);
      const L = G.manualZoneLayout(521, 480, 24, 160, MU, 500);
      const xp = G.splitZoneLength(521, L.designW, 500);
      const yp = G.splitZoneLength(480, L.designH, 500);
      out.repro = {
        designW: L.designW, cols: xp.length, rows: yp.length,
        cellW: xp[0], cellH: yp[0], cellMu: (xp[0] * yp[0]) / MU, designMu: L.zoneArea / MU
      };
      out.srcs = Array.from(document.querySelectorAll('script[src]'))
        .map(s => s.getAttribute('src'))
        .filter(s => /zone-geometry|plot-editor|inline-09/.test(s));
      return out;
    });

    check('A1 RyZoneGeometry 已加载', data.hasG);
    check('A2 VERSION = 891（v969 末排并入上排同文件上抬）', data.ver === 891, '实际 ' + data.ver);
    check('A3 zoneAreaDrift 已导出', data.hasDrift);

    if (data.hasDrift) {
      check('B1 24 -> 25.0 双口径', data.case24.text === '25.0亩 设24.0' && data.case24.drift === true,
        JSON.stringify({ text: data.case24.text, drift: data.case24.drift, pct: data.case24.deltaPct.toFixed(1) }));
      check('B2 25 -> 25.0 单口径（不漂移）', data.case25.text === '25.0亩' && data.case25.drift === false,
        JSON.stringify({ text: data.case25.text, drift: data.case25.drift }));
      check('B3 3% 内不打扰', data.caseSmall.drift === false, JSON.stringify({ text: data.caseSmall.text }));

      const r = data.repro;
      check('C1 列数 5（截图 15 区 = 5x3）', r.cols === 5, '实际 ' + r.cols);
      check('C2 行数 3', r.rows === 3, '实际 ' + r.rows);
      check('C3 格宽 104.2 m', Math.abs(r.cellW - 104.2) < 0.05, '实际 ' + r.cellW.toFixed(2));
      check('C4 格高 160 m', Math.abs(r.cellH - 160) < 0.01, '实际 ' + r.cellH.toFixed(2));
      check('C5 实划 25.0 亩', Math.abs(r.cellMu - 25.0) < 0.05, '实际 ' + r.cellMu.toFixed(2));
      check('C6 设计 24.0 亩', Math.abs(r.designMu - 24) < 0.05, '实际 ' + r.designMu.toFixed(2));
    }

    const srcs = data.srcs || [];
    const bad = srcs.filter(s => !/969-zone-merge-last/.test(s));
    check('D1 三个改动文件均按 969 装载', srcs.length >= 2 && bad.length === 0,
      bad.length ? '仍为旧串: ' + bad.join(' , ') : srcs.join(' , '));

    /* ---------- F：端到端真实渲染 ---------- */
    const f1 = await page.evaluate(() => {
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
      return { touched, polyN: (window.ppGetPolyPts && window.ppGetPolyPts().length) || 0 };
    });
    await sleep(800);

    const clicked = await page.evaluate(() => {
      const btn = document.getElementById('ppGenerate');
      if (btn) btn.click();
      return !!btn;
    });
    await sleep(2500);

    const f2 = await page.evaluate(() => {
      const host = document.getElementById('ppDiagramContent');
      const all = host ? Array.from(host.querySelectorAll('text')).map(t => t.textContent.trim()) : [];
      return {
        head: all.find(t => /面积.*地块.*分区/.test(t)) || '',
        zoneAreas: all.filter(t => /亩 设/.test(t)),
        zoneCount: all.filter(t => /^\d+区$/.test(t)).length
      };
    });

    check('F0 端到端前置条件（地块/参数已注入）', f1.polyN === 4 && f1.touched && clicked,
      JSON.stringify({ poly: f1.polyN, touched: f1.touched, clicked }));
    check('F1 表头写出「（设计 24.0，+4.2%）」',
      /标准区 25\.\d+ 亩（设计 24\.0，\+4\.2%）/.test(f2.head), f2.head.slice(0, 100));
    check('F2 分区标签写出「25.0亩 设24.0」', f2.zoneAreas.length >= 12 && f2.zoneAreas.every(t => t === '25.0亩 设24.0'),
      '标签数 ' + f2.zoneAreas.length + '，样例 ' + JSON.stringify(f2.zoneAreas.slice(0, 3)));

    /* 关掉首访公告卡（.ry-ann-card，position:fixed z-index 11991），否则会盖住施工简图 */
    await page.evaluate(() => {
      document.querySelectorAll('.ry-ann-card').forEach(n => { n.style.display = 'none'; });
    });
    await sleep(400);

    /* 留一张实测图：把简图 SVG 单独渲染成 2 倍图，便于人工复核标签颜色 */
    try {
      const svgStr = await page.evaluate(() => {
        const s = document.querySelector('#ppDiagramContent svg');
        return s ? s.outerHTML : '';
      });
      if (svgStr && svgStr.length > 500) {
        fs.writeFileSync(path.join(OUT, 'zone_drift_diagram.svg'), svgStr, 'utf8');
        const p2 = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 });
        await p2.setContent('<body style="margin:0;background:#fff">' +
          svgStr.replace('<svg', '<svg width="1400"') + '</body>');
        await sleep(400);
        await p2.screenshot({ path: path.join(OUT, 'zone_drift_diagram.png'), fullPage: true });
        await p2.close();
        console.log('截图已保存: _p1/zone_drift_diagram.png');
      } else {
        console.log('未取到 SVG，跳过截图');
      }
    } catch (eShot) {
      try { await page.screenshot({ path: path.join(OUT, 'zone_drift_diagram.png'), fullPage: false }); console.log('元素截图失败，改用整页截图'); } catch (e2) { console.log('截图失败: ' + eShot.message); }
    }

    /* ---------- E：错误 ---------- */
    const realErrors = errors.filter(e => !/favicon|ERR_FILE_NOT_FOUND|ERR_CONNECTION|ERR_NAME_NOT_RESOLVED|ERR_FAILED|Failed to load resource|CORS policy|tcloudbase|Access to (script|fetch)/i.test(e));
    check('E1 无脚本错误', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

    if (data.hasDrift) {
      console.log('\n复现数据: 地块 521x480m / 设计 24 亩 / 固定边 160m -> ' +
        data.repro.cols + ' 列 x ' + data.repro.rows + ' 行，格 ' +
        data.repro.cellW.toFixed(1) + 'x' + data.repro.cellH.toFixed(0) + 'm = ' +
        data.repro.cellMu.toFixed(1) + ' 亩');
      console.log('实渲表头: ' + f2.head);
      console.log('实渲标签: ' + JSON.stringify(f2.zoneAreas.slice(0, 3)));
    }
  } catch (err) {
    check('执行异常', false, err && err.message);
  } finally {
    try { if (browser) await browser.close(); } catch (e) { }
  }

  const ok = results.length > 0 && results.every(Boolean);
  fs.writeFileSync(path.join(OUT, 'zone_area_drift_report.txt'),
    lines.join('\n') + '\n\n' + (ok ? '结论：全部通过' : '结论：存在失败项'), 'utf8');
  console.log('\n' + (ok ? '== 全部通过 ==' : '== 存在失败项 =='));
  process.exit(ok ? 0 : 1);
})();
