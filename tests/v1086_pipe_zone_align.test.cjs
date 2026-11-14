#!/usr/bin/env node
'use strict';
/* tests/v1086_pipe_zone_align.test.cjs —— 「管线必须落在自己的分区框里」回归锁
 *
 * 用户 2026-11-14 第五次复测原话：
 *   「还是不对，没改过来，继续深挖，看看是不是管线本身生成的位置就不对，
 *     查，继续查，你说改过来了，实际上没改过来。」
 *
 * 现场数字（12 区，auditZones()）：支管 118.6m、起点外 +13.0m、终点外 −13.1m、
 * 横向 +0.0m、四行行高 118.6/132.8/132.9/117.3。
 * 判据：起点外 +13.0 与终点外 −13.1 之和 ≈ 0 ⇒ **整组平移**，不是缩短；
 *      而且支管长度与行高逐位相等 ⇒ 分区与管线用的是同一套切割线。
 *
 * 真根因（两处，都在 ppBuildAutoPipes）：
 *   ① ppGetZoneCuts 内部会再建一次 ppGridFrame，于是 cuts.xPos/yPos 活在**第二层格系**
 *      （grid2），而管线出图只经过外层 frame.toWorld（grid1→世界），少了一次
 *      cuts.frame.toWorld（grid2→grid1）⇒ 整组管线刚性错开 gd.min。
 *      角度 0° 时 grid1 ≡ grid2（恒等），所以这个缺陷长期隐形；角度 ≠ 0 时
 *      grid1 的包围盒被旋转撑大，两系立刻分家。
 *   ② 进入 grid1 之后仍拿「规划尺寸」去除「被旋转撑大的包围盒」⇒ ppGetZoneCuts 里
 *      sx/sy ≠ 1、再缩放一次 ⇒ 连切割数组本身都与分区框侧不同源。
 *      实测 384×502 地块 8°：grid1 包围盒 450×551，sx=0.853 / sy=0.912。
 *
 * 本文件锁三件事：
 *   A. 源码：两级 toWorld 复合、裁剪环与 cuts 同格系、网格尺寸按包围盒、阀门同格系判定；
 *   B. 数学：用真实的 ppGridFrame 复算「只走外层」与「两级复合」的差值，
 *      并钉住它就是 gd.min（这就是用户看到的 13.0m 那一类偏移）；
 *   C. 可选浏览器锁：装了 playwright 时在真实页面里生成一次 8° 的图，
 *      要求每根主管/支管的端点要么落在本格矩形的对应边，要么正好压在地块边界上。
 *      设 RUNYE_BROWSER_TESTS=1 才跑（默认跳过，避免拖慢纯逻辑测试）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const pe = fs.readFileSync(path.join(ROOT, 'mod', 'plot-editor.js'), 'utf8');

/* ---------------- A. 源码锁 ---------------- */
test('A1 [v1086] 管线出图必须两级 toWorld：cuts.frame.toWorld → frame.toWorld', () => {
  assert.match(pe, /var gridFrame = \(frame && cuts && cuts\.frame\) \? cuts\.frame : null;/,
    '必须显式取 cuts 的格系（grid2），不能再默认 grid1 ≡ grid2');
  assert.match(pe, /var toWorldPipe = gridFrame \? function \(p\) \{ return frame\.toWorld\(gridFrame\.toWorld\(p\)\); \} : frame\.toWorld;/,
    '出图必须复合两级变换；缺内层就是「整组管线相对分区框刚性平移」');
});

test('A2 [v1086] 裁剪环必须与 cuts 同一格系', () => {
  assert.match(pe, /var ppPipeClipPoly = gridFrame \? gridFrame\.poly : ppState\.polyPts;/,
    '拿 grid1 的环去裁 grid2 的线，会把整根管裁空（实测 8° 少画 2 根）');
  assert.match(pe, /var segs = ppClipSegsToPlot\(a, c, ppPipeClipPoly\)/,
    'pushSeg 必须用上面那份同格系环');
});

test('A3 [v1086] 进入格系后，分区尺寸按本格系包围盒取（不得再缩放一次）', () => {
  const sec = pe.slice(pe.indexOf('if (frame) ppOwnDimOverride = true;'), pe.indexOf('var cuts = ppGetZoneCuts(b, layout);'));
  assert.ok(sec.length > 0, '必须在 ppGetZoneLayout 之前把 ppOwnDimOverride 置真');
  assert.match(sec, /if \(frame\) ppOwnDimOverride = true;/,
    '旋转后 grid1 包围盒 ≠ 规划尺寸；不改成包围盒口径，ppGetZoneCuts 会按 0.853/0.912 再缩放一次');
  const fin = pe.slice(pe.indexOf('var toWorldPipe'));
  assert.match(fin, /ppOwnDimOverride = keepOwn/, 'finally 必须还原（否则污染后续调用）');
});

test('A4 [v1086] 阀门入界判定必须与管段同格系', () => {
  assert.match(pe, /function ppInPipePlot\(p\)/,
    '阀门若仍用世界系 ppPointInPlot 判 grid2 坐标，会整片误判');
  const hits = pe.match(/if \(ppInPipePlot\(\{ x: centerX, y: centerY \}\)\) out\.valves\.push/g) || [];
  assert.equal(hits.length, 2, '竖向/横向两个分支都必须走同格系判定');
  assert.ok(!/ppPointInPlot\(\{ x: centerX, y: centerY \}\)/.test(pe), '不得残留世界系判定');
});

/* ---------------- B. 数学锁：差值必须就是 gd.min ---------------- */
function src(name) {
  const start = pe.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'missing ' + name);
  for (let end = pe.indexOf('}', start); end >= 0; end = pe.indexOf('}', end + 1)) {
    const text = pe.slice(start, end + 1);
    try { new vm.Script(text); return text; } catch (e) { }
  }
  throw new Error('unbalanced ' + name);
}

test('B1 [v1086] 8° 时「只走外层」的偏移量 = grid1 包围盒原点（gd.min）', () => {
  const box = { Math, Infinity, Number, isFinite };
  vm.createContext(box);
  vm.runInContext(src('ppGridFrame'), box);
  const poly = [{ x: 0, y: 0 }, { x: 384, y: 0 }, { x: 384, y: 502 }, { x: 0, y: 502 }];
  const b = { minX: 0, minY: 0, w: 384, h: 502 };
  const dims = { w: 384, h: 502 };
  const outer = box.ppGridFrame(poly, b, dims, 8);
  /* grid1 = outer.poly（ppBuildAutoPipes 就是把 polyPts 换成它） */
  const g1 = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  outer.poly.forEach(p => {
    g1.minX = Math.min(g1.minX, p.x); g1.minY = Math.min(g1.minY, p.y);
    g1.maxX = Math.max(g1.maxX, p.x); g1.maxY = Math.max(g1.maxY, p.y);
  });
  g1.w = g1.maxX - g1.minX; g1.h = g1.maxY - g1.minY;
  /* 缺陷②：修复前 ppGetZoneCuts 用「规划尺寸 ÷ grid1 包围盒」⇒ 缩放 ≠ 1，切割数组再被缩放一次 */
  const innerNaive = box.ppGridFrame(outer.poly, g1, dims, 0);
  assert.ok(Math.abs(innerNaive.scaleX - 1) > 0.05 && Math.abs(innerNaive.scaleY - 1) > 0.05,
    '旋转后 grid1 包围盒必然被撑大 ⇒ 「规划尺寸 ÷ 包围盒」一定 ≠ 1（实测 0.853 / 0.912）');

  /* 修复后的口径：内层按包围盒取尺寸 ⇒ 只平移、不缩放 */
  const inner = box.ppGridFrame(outer.poly, g1, { w: g1.w, h: g1.h }, 0);
  assert.ok(Math.abs(inner.scaleX - 1) < 1e-9 && Math.abs(inner.scaleY - 1) < 1e-9,
    '包围盒口径下内层必须是纯平移（缩放恒为 1）');

  const grid2pt = { x: 384 / 2, y: 502 / 10 / 2 };
  const p2 = { x: grid2pt.x, y: grid2pt.y + 50 };
  const naive = outer.toWorld(grid2pt);                    /* 修复前：只走外层 */
  const right = outer.toWorld(inner.toWorld(grid2pt));     /* 修复后：两级复合 */
  const naive2 = outer.toWorld(p2), right2 = outer.toWorld(inner.toWorld(p2));

  /* ① 位移量必须恰好等于 grid1 包围盒原点的模（旋转不改模）—— 这就是"整组错开"那一类 */
  const shift = Math.hypot(right.x - naive.x, right.y - naive.y);
  const origin = Math.hypot(g1.minX, g1.minY);
  assert.ok(Math.abs(g1.minY) > 10, 'grid1 包围盒原点必须明显偏离 0，实测 minY=' + g1.minY.toFixed(2));
  assert.ok(Math.abs(shift - origin) < 1e-6,
    '少一层 toWorld 的后果就是整组刚性平移 |gd.min|，实测 ' + shift.toFixed(2) + 'm vs ' + origin.toFixed(2) + 'm');

  /* ② 平移不改长度（外层是刚体 ⇒ sx=sy=1）—— 这才是"长度一模一样、位置整体偏"的数学原因，
        也是用户现场「支管 118.6m = 行高、起点外 +13.0、终点外 −13.1」的形态。 */
  const lenNaive = Math.hypot(naive2.x - naive.x, naive2.y - naive.y);
  const lenRight = Math.hypot(right2.x - right.x, right2.y - right.y);
  assert.ok(Math.abs(lenNaive - lenRight) < 1e-6,
    '平移必须保持长度不变（否则现场会看到"管子变短"，而不是"位置偏"）');
});

/* ---------------- C. 可选：真实页面端到端 ---------------- */
test('C1 [v1086] 真实页面 8° 生成后，每根管线都落在自己的分区框里', { skip: process.env.RUNYE_BROWSER_TESTS !== '1' }, async () => {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const p = await ctx.newPage();
  p.on('dialog', async d => { try { await d.dismiss(); } catch (e) { } });
  await p.goto('file:///' + ROOT.replace(/\\/g, '/') + '/index.html', { waitUntil: 'load', timeout: 90000 });
  await p.waitForTimeout(2600);
  await p.evaluate(() => {
    const items = Array.from(document.querySelectorAll('a,button,li,span,div'));
    const nav = items.find(n => (n.textContent || '').trim() === '分区与管路' && n.offsetParent !== null);
    if (nav) nav.click();
  });
  await p.waitForTimeout(1800);
  await p.evaluate(() => {
    window.measuredPolygon = [{ x: 0, y: 0 }, { x: 384, y: 0 }, { x: 384, y: 502 }, { x: 0, y: 502 }];
    window.measuredArea = 384 * 502;
    window.ppLoadPolygon();
    const setVal = (id, v) => { const el = document.getElementById(id); if (!el) return; el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    const mode = document.getElementById('planZoneMode'); if (mode) { mode.value = 'manual'; mode.dispatchEvent(new Event('change', { bubbles: true })); }
    setVal('planZoneMuManual', 17); setVal('planTapeLaySide', 100);
    window.calcPlan();
    window.ppSetZoneAngleDeg(8);
    window.ppRender();
  });
  await p.waitForTimeout(800);
  await p.evaluate(() => { const btn = document.getElementById('ppGenerate'); if (btn) btn.click(); });
  await p.waitForTimeout(2400);
  const o = await p.evaluate(() => {
    const dd = window.tlDiagramData || {}, cuts = window.RunyeBridge.getZoneCuts(), f = cuts && cuts.frame;
    if (!f) return { error: 'no frame' };
    const ring = f.poly;
    function distToRing(q) {
      let best = Infinity;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[j], b2 = ring[i], dx = b2.x - a.x, dy = b2.y - a.y, L2 = dx * dx + dy * dy;
        let t = L2 < 1e-12 ? 0 : ((q.x - a.x) * dx + (q.y - a.y) * dy) / L2;
        t = Math.max(0, Math.min(1, t));
        best = Math.min(best, Math.hypot(q.x - (a.x + dx * t), q.y - (a.y + dy * t)));
      }
      return best;
    }
    const bad = [];
    let checked = 0;
    const cells = cuts.cols * cuts.rows;
    for (let zi = 0; zi < cells; zi++) {
      const c = zi % cuts.cols, r = Math.floor(zi / cuts.cols);
      const x0 = cuts.xPos[c], x1 = cuts.xPos[c + 1], y0 = cuts.yPos[r], y1 = cuts.yPos[r + 1];
      [['支管', (dd.branchPipes || [])[zi]], ['主管', (dd.mainPipes || [])[zi]]].forEach(([kind, L]) => {
        if (!L || L.length < 2) return;
        checked++;
        const a = L[0], z = L[L.length - 1], ga = f.toGrid(a), gz = f.toGrid(z);
        const vertical = Math.abs(ga.x - gz.x) < Math.abs(ga.y - gz.y);
        const eg = vertical ? [{ x: ga.x, y: y0 }, { x: ga.x, y: y1 }] : [{ x: x0, y: ga.y }, { x: x1, y: ga.y }];
        const ex = eg.map(f.toWorld);
        const latOk = vertical ? (ga.x >= x0 - 0.01 && ga.x <= x1 + 0.01) : (ga.y >= y0 - 0.01 && ga.y <= y1 + 0.01);
        const okA = Math.min(Math.hypot(a.x - ex[0].x, a.y - ex[0].y), Math.hypot(a.x - ex[1].x, a.y - ex[1].y)) < 0.8 || distToRing(ga) < 0.8;
        const okZ = Math.min(Math.hypot(z.x - ex[1].x, z.y - ex[1].y), Math.hypot(z.x - ex[0].x, z.y - ex[0].y)) < 0.8 || distToRing(gz) < 0.8;
        if (!latOk || !okA || !okZ) bad.push({ zi: zi + 1, kind, latOk, okA, okZ });
      });
    }
    return { checked, bad };
  });
  await browser.close();
  assert.ok(o.checked > 20, '必须真的检查到管线，实测 ' + o.checked);
  assert.deepEqual(o.bad, [], '管线必须落在自己的分区框里，实测不合格：' + JSON.stringify(o.bad.slice(0, 5)));
});
