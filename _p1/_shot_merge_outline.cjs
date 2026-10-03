/* 拼接地块「各自轮廓线、无外框」· 真浏览器渲染截图（Edge/CDP）
   用户诉求（原话）：「地块拼接之后 是各自的轮廓线，外面不用再加一个框。」
   本脚本用真 Edge 渲染在线地图页，注入一个「3 子块拼接」的地块库，
   然后截图 + 量测每条可见多边形路径，用**像素/几何事实**证明：
     A) 存在 3 条独立闭合子轮廓（各自作物色）
     B) 不存在「包围 3 块的可见外框」
   用法：
     node _p1/_shot_merge_outline.cjs          # 截图 + 量测（全绿=0 / 有红=1）
     node _p1/_shot_merge_outline.cjs --inject # 恢复"画外框"旧行为 → 必须变红
*/
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');

const WS = 'C:\\Users\\AHS\\runye-irrigation';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = path.join(WS, '_verify_out');
const PORT = 9458;
const INJ = process.argv.includes('--inject');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileUrl = (p) => 'file:///' + p.replace(/\\/g, '/');

let pass = 0, fail = 0;
const ok = (n, cond, extra) => {
  console.log((cond ? '  [PASS] ' : '  [FAIL] ') + n + (extra ? ' :: ' + extra : ''));
  cond ? pass++ : fail++;
};

/* ---- 造一个「3 子块拼接」的地块库（与 jsdom 探针同构）---- */
const B = [18.2528, 109.5119], D = 0.0004;
function rect(lat, lng, crop, name, id) {
  return {
    id: id, name: name, mu: 2.8, sqm: 1900, crop: crop,
    polyLatLng: [[lat, lng], [lat, lng + D], [lat + D, lng + D], [lat + D, lng]],
    center: { lat: lat + D / 2, lng: lng + D / 2 },
    geo: { refLat: lat + D / 2, refLng: lng, proj: 'mercatorLocal' },
    source: 'map', crs: 'GCJ-02', poly: [[lat, lng], [lat, lng + D], [lat + D, lng + D], [lat + D, lng]]
  };
}
const S1 = rect(B[0], B[1], '七彩花生', '子块1', 's1');
const S2 = rect(B[0], B[1] + D, '水稻', '子块2', 's2');
const S3 = rect(B[0] + D, B[1], '玉米', '子块3', 's3');

/* 凸包（= 三块拼起来的外包矩形），模拟 merge.plots 的产物 */
const hullLatLng = [[B[0], B[1]], [B[0], B[1] + 2 * D], [B[0] + 2 * D, B[1] + 2 * D], [B[0] + 2 * D, B[1]]];
const BIG = {
  id: 'big1', name: '三块拼接', mu: 8.4, sqm: 5700, crop: '七彩花生',
  merged: true,
  polyLatLng: hullLatLng,
  subPlots: [
    { id: 's1', name: '子块1', crop: '七彩花生', polyLatLng: S1.polyLatLng },
    { id: 's2', name: '子块2', crop: '水稻', polyLatLng: S2.polyLatLng },
    { id: 's3', name: '子块3', crop: '玉米', polyLatLng: S3.polyLatLng }
  ],
  center: { lat: B[0] + D, lng: B[1] + D },
  geo: { refLat: B[0] + D, refLng: B[1], proj: 'mercatorLocal' },
  source: 'map', crs: 'GCJ-02'
};
const LIB = [BIG];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  /* ---- 注入：把 runye-map-enhance.js 里「不画可见外框」的判定改回旧行为，
          生成一份**同目录**临时副本（页面用相对路径引它，放别处会 404）。
          锚点即源码里那行 `var isMerged = ...`；未命中则 exit 2，不静默放行。 ---- */
  let target = path.join(WS, 'runye-map-measure.html');
  let injectedJs = null;
  if (INJ) {
    const jsPath = path.join(WS, 'runye-map-enhance.js');
    const orig = fs.readFileSync(jsPath, 'utf8');
    const anchor = 'var isMerged = !!(p.merged && p.subPlots && p.subPlots.length);';
    if (orig.indexOf(anchor) < 0) {
      console.error('[inject] 锚点漂移：未找到「' + anchor + '」'); process.exit(2);
    }
    const mutant = orig.replace(anchor, 'var isMerged = false; // [inject] 恢复旧行为：把凸包当可见外框画');
    injectedJs = path.join(WS, '_inj_map_enhance.js');
    fs.writeFileSync(injectedJs, mutant, 'utf8');

    /* 再把页面里对 runye-map-enhance.js 的引用指向注入版 */
    const html = fs.readFileSync(path.join(WS, 'runye-map-measure.html'), 'utf8');
    const htmlAnchor = '<script src="runye-map-enhance.js"></script>';
    if (html.indexOf(htmlAnchor) < 0) {
      console.error('[inject] 锚点漂移：页面未找到 ' + htmlAnchor); process.exit(2);
    }
    const injHtml = path.join(WS, '_inj_map_measure.html');
    fs.writeFileSync(injHtml, html.replace(htmlAnchor, '<script src="_inj_map_enhance.js"></script>'), 'utf8');
    target = injHtml;
    console.log('[inject] 已生成注入版页面 + 注入版模块（恢复「画可见外框」旧行为）');
  }

  const proc = spawn(EDGE, [
    '--headless=new', '--allow-file-access-from-files',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(OUT, 'profile_mergeshot'),
    '--no-first-run', '--no-default-browser-check',
    '--window-size=1400,900', 'about:blank',
  ], { stdio: 'ignore' });

  let browser = null;
  for (let i = 0; i < 50; i++) {
    try { browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:' + PORT, defaultViewport: null }); break; }
    catch (e) { await sleep(400); }
  }
  if (!browser) { console.error('Edge connect failed'); proc.kill(); process.exit(1); }

  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.setViewport({ width: 1400, height: 900 });

  /* 先注入地块库，再打开页面（页面启动时读 localStorage） */
  await page.goto(fileUrl(target), { waitUntil: 'load', timeout: 90000 });
  await sleep(1200);
  await page.evaluate((lib) => {
    try { localStorage.clear(); } catch (e) {}
    localStorage.setItem('runye_plot_library', JSON.stringify(lib));
  }, LIB);
  await page.reload({ waitUntil: 'load' });
  await sleep(2500);
  if (INJ) console.log('[inject] 已用注入版 runye-map-enhance.js（恢复「画可见外框」旧行为）');

  /* ---- 量测：把地图上每条 SVG 路径（Leaflet 渲染的 polygon）读出来 ---- */
  const measured = await page.evaluate(() => {
    const paths = Array.from(document.querySelectorAll('path.leaflet-interactive, path.leaflet-clickable, svg.leaflet-zoom-animated path'));
    const seen = new Set();
    const out = [];
    paths.forEach((p) => {
      const d = p.getAttribute('d') || '';
      if (!d || seen.has(d)) return;
      seen.add(d);
      const cs = getComputedStyle(p);
      const bb = p.getBBox ? p.getBBox() : { x: 0, y: 0, width: 0, height: 0 };
      out.push({
        stroke: cs.stroke, strokeWidth: cs.strokeWidth, fill: cs.fill,
        fillOpacity: cs.fillOpacity, strokeOpacity: cs.strokeOpacity,
        // 路径段数近似：按 "M" / "L" 计数（闭合多边形 N 顶点）
        segs: (d.match(/[ML]/g) || []).length,
        bbox: { w: +bb.width.toFixed(1), h: +bb.height.toFixed(1) },
        d: d.slice(0, 120)
      });
    });
    /* 地图容器与中心 */
    const mapEl = document.getElementById('map') || document.querySelector('.leaflet-container');
    const mr = mapEl ? mapEl.getBoundingClientRect() : null;
    return { paths: out, mapRect: mr ? { w: mr.width, h: mr.height } : null };
  });

  console.log('\n=== 地图上的可见多边形（共 ' + measured.paths.length + ' 条唯一路径）===');
  measured.paths.forEach((p, i) => {
    console.log('  #' + i + ' stroke=' + p.stroke + ' sw=' + p.strokeWidth +
      ' fill=' + p.fill + ' fillOp=' + p.fillOpacity + ' segs=' + p.segs +
      ' bbox=' + p.bbox.w + 'x' + p.bbox.h);
  });

  const filled = measured.paths.filter((p) => parseFloat(p.fillOpacity) > 0.02);
  console.log('\n=== 判定 ===');
  ok('地图上有可见多边形（地块画出来了）', filled.length > 0, filled.length + ' 条有填充');

  /* A) 至少 3 条独立闭合子轮廓 */
  const fourSeg = filled.filter((p) => p.segs >= 4 && p.segs <= 5);
  ok('A) 存在 ≥3 条「四顶点闭合」子轮廓（各自独立成块）',
    fourSeg.length >= 3, fourSeg.length + ' 条（期望 ≥3）');

  /* B) 不存在「外框」：外框的特征是 bbox ≈ 三个子块并集、且包含子块。
     ★ 判据加固：不能只跟「子块高度」比 —— 若注入把子块全干掉、只剩一个大框，
       比较基准就空了，B 会假绿。故改用一个**绝对+相对**双重判据：
         · 相对：某条路径的 bbox 面积 > 最小路径 bbox 面积的 2 倍（明显是并集框）；
         · 绝对：该路径不是「4 顶点小块」的尺寸档。
       同时要求 A 项（≥3 条子轮廓）成立，B 才有意义 —— 两者合起来才拦得住。 */
  const areas = filled.map((p) => p.bbox.w * p.bbox.h).filter((a) => a > 0);
  const minArea = areas.length ? Math.min.apply(null, areas) : 0;
  const bigFrame = filled.filter((p) => {
    const a = p.bbox.w * p.bbox.h;
    return minArea > 0 && a > minArea * 2.0;
  });
  ok('B) ★ 不存在「明显大于子块的外框」（外部不再加框）',
    bigFrame.length === 0,
    bigFrame.length ? ('发现 ' + bigFrame.length + ' 个疑似外框, bbox=' +
      bigFrame.map((p) => p.bbox.w + 'x' + p.bbox.h).join(',')) : '无');
  /* B2) 反向补强：不允许出现「只有 1 条填充路径」的情况 —— 那意味着退化成画一个大框 */
  ok('B2) ★ 填充路径数 ≥3（若只剩 1 条 = 退化成「画一个大框」，旧行为）',
    filled.length >= 3, filled.length + ' 条');

  /* C) 紫色外框/紫虚线不存在 */
  const purple = filled.filter((p) => /#7c3aed|#a78bfa|124,\s*58,\s*237|167,\s*139,\s*250/i.test(p.stroke + ' ' + p.fill));
  ok('C) ★ 可见层没有任何紫色（旧外框色 #7c3aed / #a78bfa）', purple.length === 0,
    purple.length ? purple.map((p) => p.stroke).join(',') : '无');

  /* D) 无页面错误 */
  ok('D) 无 pageerror', errs.length === 0, errs.slice(0, 2).join(' | '));

  /* 截图 */
  const shot = path.join(OUT, INJ ? 'merge_outline_injected.png' : 'merge_outline.png');
  /* 顺便把拼接块在图上的屏幕包围盒算出来（取所有可见子轮廓的并集），
     供后续裁剪放大 —— 避免靠肉眼猜坐标裁错位置。 */
  const clip = await page.evaluate(() => {
    const paths = Array.from(document.querySelectorAll('svg.leaflet-zoom-animated path'));
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, n = 0;
    paths.forEach((p) => {
      const cs = getComputedStyle(p);
      if (parseFloat(cs.fillOpacity) <= 0.02) return;   // 跳过不可见层
      const r = p.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top);
      x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom);
      n++;
    });
    if (!n) return null;
    const pad = 40;
    return { x: Math.max(0, x0 - pad), y: Math.max(0, y0 - pad), width: (x1 - x0) + pad * 2, height: (y1 - y0) + pad * 2, count: n };
  });
  await page.screenshot({ path: shot });
  if (clip) {
    const zoomShot = path.join(OUT, INJ ? 'merge_outline_zoom_injected.png' : 'merge_outline_zoom.png');
    await page.screenshot({ path: zoomShot, clip: { x: clip.x, y: clip.y, width: clip.width, height: clip.height } });
    console.log('  [info] 拼接区并集 bbox=' + Math.round(clip.width) + 'x' + Math.round(clip.height) +
      '（含 ' + clip.count + ' 条可见层）→ 放大图：' + path.basename(zoomShot));
  }

  console.log('\n---------------------------------------------');
  console.log('PASS=' + pass + '  FAIL=' + fail + '   截图：' + shot);

  try { await browser.disconnect(); } catch (e) {}
  try { proc.kill(); } catch (e) {}
  if (INJ) {
    try { fs.unlinkSync(path.join(WS, '_inj_map_enhance.js')); } catch (e) {}
    try { fs.unlinkSync(path.join(WS, '_inj_map_measure.html')); } catch (e) {}
  }

  if (INJ) {
    if (fail === 0) { console.error('[inject] ✗ 注入后仍全绿 —— 断言无鉴别力'); process.exitCode = 1; }
    else { console.log('[inject] ✓ 注入被捕获（FAIL=' + fail + '）'); process.exitCode = 0; }
  } else {
    process.exitCode = fail > 0 ? 1 : 0;
  }
})().catch((e) => { console.error('异常：', e && e.stack || e); process.exitCode = 1; });
