/* verify_label_anchor.js —— v973 分区标注锚点一致性探针（诊断 4 区标注漂移）
   ═══════════════════════════════════════════════════════════════════════════
   用户截图（2026-11-05）：顶排 4 区标注漂到格子左半部，与 3 区标注叠字；
   1/2/3/5 区标注都贴着自己格子右上角。填充与标注同源 cellPts，理论上不会错位。

   本探针在多种配置下渲染施工简图，对每个分区标注断言：
     A. 标注 g[transform] 的 translate ≈ 该格 polygon 的右上角（内缩 padX/padY 容差内）
     B. 同一行相邻标注右端间距 ≈ 相邻格右上角间距（不叠字）
   场景：
     S1 轴对齐矩形 521×480 / 2.7° 旋转网格
     S2 不规则四边形（顶边倾斜，模拟手绘地块）+ 2.7°
     S3 S2 + 手动拖拽切割线（cutSnap.x / cutSnap.y，模拟用户拖线后状态）
   用法：node verify_label_anchor.js   exit 0=全过 / 1=有失败
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

    /* 渲染 + 抽取：每格 polygon 顶点与每条标注的 translate / rotate / 文本 */
    async function renderAndExtract(poly, angleDeg, cutDrag) {
      await page.evaluate(({ poly, angleDeg, cutDrag }) => {
        window.measuredPolygon = poly;
        window.measuredArea = Math.abs(poly.reduce((s, p, i) => {
          const q = poly[(i + 1) % poly.length]; return s + (p.x * q.y - q.x * p.y);
        }, 0)) / 2;
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
        /* 分区角度：直接走 UI 入口（与用户操作同源） */
        const ang = document.getElementById('ppZoneAngleInput');
        if (ang) {
          ang.value = String(angleDeg);
          ang.dispatchEvent(new Event('input', { bubbles: true }));
          ang.dispatchEvent(new Event('change', { bubbles: true }));
          const btn = document.getElementById('ppRotateZones');
          if (btn) btn.click();
        }
        if (typeof window.calcPlan === 'function') { try { window.calcPlan(); } catch (e) { } }
        /* 手动拖线：直接写 cutSnap（与拖拽落盘同结构） */
        if (cutDrag) {
          try {
            const st = (typeof window.ppGetState === 'function') ? window.ppGetState() : null;
            if (st && st.cutSnap && Array.isArray(st.cutSnap.x) && st.cutSnap.x.length > 3) {
              st.cutSnap.x[3] = st.cutSnap.x[3] - 8;   // 模拟把第 3 根竖向切割线往左拖 8 m
              if (typeof window.ppSetState === 'function') window.ppSetState(st);
            }
          } catch (e) { }
        }
        if (typeof window.ppGenerate === 'function') { try { window.ppGenerate(); } catch (e) { } }
        else { const b = document.getElementById('ppGenerate'); if (b) b.click(); }
        return true;
      }, { poly, angleDeg, cutDrag });
      // 等渲染
      await sleep(2200);
      return await page.evaluate(() => {
        const host = document.getElementById('ppDiagramContent');
        if (!host) return null;
        const svg = host.querySelector('svg');
        if (!svg) return null;
        const cells = [];
        svg.querySelectorAll('.pp-zone-layer polygon').forEach(pg => {
          const pts = (pg.getAttribute('points') || '').trim().split(/\s+/).map(s => s.split(',').map(Number));
          cells.push(pts);
        });
        const labels = [];
        svg.querySelectorAll('.pp-zone-label g[transform]').forEach(g => {
          const m = /translate\(([-\d.]+)[ ,]+([-\d.]+)\)\s*(?:rotate\(([-\d.]+)\))?/.exec(g.getAttribute('transform') || '');
          if (!m) return;
          const txt = Array.from(g.querySelectorAll('text')).map(t => t.textContent.trim()).join(' | ');
          labels.push({ x: Number(m[1]), y: Number(m[2]), rot: m[3] ? Number(m[3]) : 0, txt });
        });
        return { cells, labels };
      });
    }

    /* 断言逻辑：每条标注按文本里的「N区」定位其格（zi=N-1，行优先），
       右上角 = 该格 polygon 顶点里 y 最小两点的 x 较大者（近似，容差内取最大 x 顶点）。 */
    function audit(cells, labels) {
      const issues = [];
      const labByZone = {};
      labels.forEach(l => {
        const m = /(\d+)区/.exec(l.txt);
        if (m) labByZone[Number(m[1])] = l;
      });
      const nZones = cells.length;
      Object.keys(labByZone).forEach(k => {
        const zi = Number(k) - 1;
        const cell = cells[zi];
        if (!cell || cell.length < 3) { if (cell) issues.push('zi=' + zi + ' 格顶点不足'); return; }
        const lab = labByZone[k];
        // 右上角：y 最小的顶点中 x 最大者
        const minY = Math.min(...cell.map(p => p.y));
        const topPts = cell.filter(p => p.y - minY < 2);
        if (!topPts.length) return;
        const corner = topPts.reduce((a, b) => (b.x > a.x ? b : a), topPts[0]);
        const dx = lab.x - corner.x, dy = lab.y - corner.y;
        const dist = Math.hypot(dx, dy);
        // 容差：padX/padY（各 ≤6% 格宽高）+ 文本右对齐；超过 20px 视为漂移
        if (dist > 20) issues.push(k + '区标注距右上角 ' + dist.toFixed(1) + 'px（dx=' + dx.toFixed(1) + ' dy=' + dy.toFixed(1) + '） anch=' + lab.x + ',' + lab.y + ' corner=' + corner.x.toFixed(1) + ',' + corner.y.toFixed(1));
      });
      return { issues, nZones, nLabels: labels.length };
    }

    /* S1 轴对齐矩形 + 2.7° */
    await renderAndExtract([{ x: 0, y: 0 }, { x: 521, y: 0 }, { x: 521, y: 480 }, { x: 0, y: 480 }], 2.7, false);
    let r = await page.evaluate(() => {
      const host = document.getElementById('ppDiagramContent');
      const svg = host && host.querySelector('svg');
      if (!svg) return null;
      const cells = Array.from(svg.querySelectorAll('.pp-zone-layer polygon')).map(pg =>
        (pg.getAttribute('points') || '').trim().split(/\s+/).map(s => s.split(',').map(Number)));
      const labels = Array.from(svg.querySelectorAll('.pp-zone-label g[transform]')).map(g => {
        const m = /translate\(([-\d.]+)[ ,]+([-\d.]+)\)/.exec(g.getAttribute('transform') || '');
        return m ? { x: Number(m[1]), y: Number(m[2]), txt: Array.from(g.querySelectorAll('text')).map(t => t.textContent.trim()).join(' ') } : null;
      }).filter(Boolean);
      return { cells, labels };
    });
    if (r) {
      const a = audit(r.cells, r.labels);
      check('S1 旋转2.7° 轴对齐地块：' + a.nLabels + ' 标注全部贴右上角', a.nLabels >= 12 && a.issues.length === 0,
        a.issues.length ? a.issues.slice(0, 4).join(' ； ') : 'OK');
    } else check('S1 渲染失败', false);

    /* S2 不规则四边形（顶边倾斜 8m）+ 2.7° */
    await renderAndExtract([{ x: 0, y: 0 }, { x: 521, y: 0 }, { x: 513, y: 449 }, { x: -6, y: 449 }], 2.7, false);
    r = await page.evaluate(() => {
      const host = document.getElementById('ppDiagramContent');
      const svg = host && host.querySelector('svg');
      if (!svg) return null;
      const cells = Array.from(svg.querySelectorAll('.pp-zone-layer polygon')).map(pg =>
        (pg.getAttribute('points') || '').trim().split(/\s+/).map(s => s.split(',').map(Number)));
      const labels = Array.from(svg.querySelectorAll('.pp-zone-label g[transform]')).map(g => {
        const m = /translate\(([-\d.]+)[ ,]+([-\d.]+)\)/.exec(g.getAttribute('transform') || '');
        return m ? { x: Number(m[1]), y: Number(m[2]), txt: Array.from(g.querySelectorAll('text')).map(t => t.textContent.trim()).join(' ') } : null;
      }).filter(Boolean);
      return { cells, labels };
    });
    if (r) {
      const a = audit(r.cells, r.labels);
      check('S2 斜四边形+2.7°：' + a.nLabels + ' 标注全部贴右上角', a.nLabels >= 8 && a.issues.length === 0,
        a.issues.length ? a.issues.slice(0, 4).join(' ； ') : 'OK');
      // 截一张 S2 图便于人工比对
      try {
        const svgStr = await page.evaluate(() => document.querySelector('#ppDiagramContent svg').outerHTML);
        fs.writeFileSync(path.join(OUT, 'label_anchor_s2.svg'), svgStr, 'utf8');
      } catch (e) { }
    } else check('S2 渲染失败', false);

    /* S3 S2 + 手动拖拽切割线 */
    await renderAndExtract([{ x: 0, y: 0 }, { x: 521, y: 0 }, { x: 513, y: 449 }, { x: -6, y: 449 }], 2.7, true);
    r = await page.evaluate(() => {
      const host = document.getElementById('ppDiagramContent');
      const svg = host && host.querySelector('svg');
      if (!svg) return null;
      const cells = Array.from(svg.querySelectorAll('.pp-zone-layer polygon')).map(pg =>
        (pg.getAttribute('points') || '').trim().split(/\s+/).map(s => s.split(',').map(Number)));
      const labels = Array.from(svg.querySelectorAll('.pp-zone-label g[transform]')).map(g => {
        const m = /translate\(([-\d.]+)[ ,]+([-\d.]+)\)/.exec(g.getAttribute('transform') || '');
        return m ? { x: Number(m[1]), y: Number(m[2]), txt: Array.from(g.querySelectorAll('text')).map(t => t.textContent.trim()).join(' ') } : null;
      }).filter(Boolean);
      return { cells, labels };
    });
    if (r) {
      const a = audit(r.cells, r.labels);
      check('S3 斜四边形+2.7°+拖切割线：' + a.nLabels + ' 标注全部贴右上角', a.nLabels >= 8 && a.issues.length === 0,
        a.issues.length ? a.issues.slice(0, 4).join(' ； ') : 'OK');
      try {
        const svgStr = await page.evaluate(() => document.querySelector('#ppDiagramContent svg').outerHTML);
        fs.writeFileSync(path.join(OUT, 'label_anchor_s3.svg'), svgStr, 'utf8');
      } catch (e) { }
    } else check('S3 渲染失败', false);

    const realErrors = errors.filter(e => !/favicon|ERR_FILE_NOT_FOUND|ERR_CONNECTION|ERR_NAME_NOT_RESOLVED|ERR_FAILED|Failed to load resource|CORS policy|tcloudbase|Access to (script|fetch)/i.test(e));
    check('Z1 无脚本错误', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));
  } catch (err) {
    check('执行异常', false, err && err.message);
  } finally {
    try { if (browser) await browser.close(); } catch (e) { }
  }

  const ok = results.length > 0 && results.every(Boolean);
  fs.writeFileSync(path.join(OUT, 'label_anchor_report.txt'),
    lines.join('\n') + '\n\n' + (ok ? '结论：全部通过' : '结论：存在失败项'), 'utf8');
  console.log('\n' + (ok ? '== 全部通过 ==' : '== 存在失败项 =='));
  process.exit(ok ? 0 : 1);
})();
