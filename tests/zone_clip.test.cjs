'use strict';
/* tests/zone_clip.test.cjs —— 「分区旋转后网格/管路画到地块外」的裁剪契约（v837）
 *
 * 背景（用户原话）：「分区角度 30° 时，分区网格和管路整体画到地块边界外面」。
 * 成因：分区角度非 0 时，格子是**旋转后的外接框**切出来的 —— 格子四角、整条网格线、
 * 按整格撒出去的管路必然伸到地块多边形外面。线上 v834 实测（300×170 m、30°、两管程）：
 *   网格线画出去的长度只有 32.3% 落在地块内；主管界内长度 52.3%；支管 50.8%。
 *
 * 本文件钉五件事，全部用**源码切片**跑，不手抄几何：
 *   ① 0° 必须逐位不变 —— 裁剪对整段在界内的线要原值透传（否则浮点末位抖动会让
 *      「0° 生成结果哈希不变」这条底线随机破掉）
 *   ② 30° 的缺陷基线（未裁剪时明显越界）—— 防止以后有人把裁剪悄悄删掉、测试还绿
 *   ③ 30° 裁剪后一个采样点都不越界（含端点、含中段穿出）
 *   ④ 凹多边形（U 形）一条线穿进穿出两次必须返回 **2 段**
 *      ★ v830 的临时实现只保留「最长的一段界内区间」，会把另一条臂上的真实管段吞掉；
 *        本测试锁住「多段」这个性质，别退回单段
 *   ⑤ 部分出界的格子：标注锚点换成「本格 ∩ 地块」形心后必须真的在界内
 *
 * 运行时口径提醒：管路在 ppBuildAutoPipes 里裁剪时，ppState.polyPts 已被换成**格系**多边形
 * （见该函数 [v837] 注释），所以本文件里管路的用例都在格系里判内外；网格线在 ppDrawZones 里
 * 是世界系裁剪，用例也在世界系判。
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PLOTEDITOR = path.join(ROOT, 'mod', 'plot-editor.js');
const INLINE10 = path.join(ROOT, 'mod', 'inline-10.js');
const COORDFRAME = path.join(ROOT, 'core', 'coord-frame.js');
const ZONEGEO = require(path.join(ROOT, 'mod', 'zone-geometry.js'));

/* 大括号配平切片（与 tests/coord_frame.test.cjs 同法） */
function sliceFunction(src, name) {
  const lines = src.split('\n');
  const start = lines.findIndex((l) => new RegExp('function\\s+' + name + '\\s*\\(').test(l));
  if (start < 0) throw new Error('plot-editor.js 里找不到 ' + name);
  let depth = 0, end = -1;
  for (let i = start; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end >= 0) break;
  }
  if (end < 0) throw new Error(name + ' 的大括号没配平');
  return lines.slice(start, end + 1).join('\n');
}

const CF = new Function('window',
  fs.readFileSync(COORDFRAME, 'utf8') + '\nreturn window.RyCoordFrame;')({});

const ppSrc = fs.readFileSync(PLOTEDITOR, 'utf8');
const i10Src = fs.readFileSync(INLINE10, 'utf8');

const srcSegXt = sliceFunction(ppSrc, 'ppSegXt');
const srcClipLine = sliceFunction(ppSrc, 'ppClipPolylineToRing');
const srcClipSegs = sliceFunction(ppSrc, 'ppClipSegsToPlot');
const srcOnEdge = sliceFunction(ppSrc, 'ppOnRingEdge');
const srcRingIn = sliceFunction(ppSrc, 'ppRingIn');
const srcCentroid = sliceFunction(ppSrc, 'ppPolyCentroid');
const srcAtPoint = sliceFunction(i10Src, 'atPointInPolygon');

/* 切片自检：切歪了就别拿它当证据 */
assert.ok(srcClipLine.length > 600 && srcClipLine.length < 3000,
  'ppClipPolylineToRing 切片长度异常（' + srcClipLine.length + '）');
assert.ok(/ppSegXt\(/.test(srcClipLine), 'ppClipPolylineToRing 应调用 ppSegXt');
assert.ok(/atPointInPolygon/.test(srcClipLine), 'ppClipPolylineToRing 应做中点内外判定');
assert.ok(srcClipSegs.length > 200 && /ppClipPolylineToRing\(/.test(srcClipSegs),
  'ppClipSegsToPlot 应委托 ppClipPolylineToRing（不许自己再写一份求交）');
assert.ok(!/ppSegXt\(/.test(srcClipSegs), 'ppClipSegsToPlot 里不该再出现第二份求交实现');
assert.ok(/ppRingIn/.test(srcClipSegs),
  'ppClipSegsToPlot 必须把边界容差判定 ppRingIn 传给 ppClipPolylineToRing（否则贴边网格线整条消失）');
assert.ok(/ppOnRingEdge/.test(srcRingIn), 'ppRingIn 应委托 ppOnRingEdge');
assert.ok(/ppPointInPlot|atPointInPolygon/.test(srcAtPoint), 'atPointInPolygon 切片不对劲');

/* 生产实现（inline-10.js 的全局 atPointInPolygon），不手抄 */
const atPointInPolygon = new Function(srcAtPoint + '\nreturn atPointInPolygon;')();

function buildEnv(ppState) {
  return new Function('window', 'ppState', 'atPointInPolygon',
    srcSegXt + '\n' + srcClipLine + '\n' + srcOnEdge + '\n' + srcRingIn + '\n' +
    srcClipSegs + '\n' + srcCentroid +
    '\nreturn { ppClipPolylineToRing: ppClipPolylineToRing, ppClipSegsToPlot: ppClipSegsToPlot,' +
    ' ppPolyCentroid: ppPolyCentroid, ppRingIn: ppRingIn };'
  )({}, ppState, atPointInPolygon);
}

/* ---------------- 几何工具（只做「判定」，不复制裁剪逻辑） ---------------- */
const EPS = 0.05;   /* m：边界容差。网格线端点本来就落在边上，纯射线法会判成「外」 */

function boundsOf(pts) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  pts.forEach((p) => {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  });
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}
function segDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
  if (L2 < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}
function inside(p, poly) {
  if (atPointInPolygon(p, poly)) return true;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    if (segDist(p, poly[j], poly[i]) < EPS) return true;
  }
  return false;
}
function sampleOutside(segments, poly, S) {
  const n = S == null ? 40 : S;
  let total = 0, out = 0;
  segments.forEach((seg) => {
    for (let i = 0; i + 1 < seg.length; i++) {
      const A = seg[i], B = seg[i + 1];
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const p = { x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t };
        total++; if (!inside(p, poly)) out++;
      }
    }
  });
  return { total, out };
}
function totalLen(segments) {
  let s = 0;
  segments.forEach((seg) => {
    for (let i = 0; i + 1 < seg.length; i++) {
      s += Math.hypot(seg[i + 1].x - seg[i].x, seg[i + 1].y - seg[i].y);
    }
  });
  return s;
}

/* 300×170 m 地块 → 图纸 300000×170000 mm（与 ppGetPlanDims 的真实产物同量级） */
const DIMS = { w: 300000, h: 170000 };
const RECT = [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 170 }, { x: 0, y: 170 }];
/* U 形凹多边形：y<60 是整条底，y>60 只有 x<100 与 x>200 两条臂 */
const U_SHAPE = [
  { x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 170 }, { x: 200, y: 170 },
  { x: 200, y: 60 }, { x: 100, y: 60 }, { x: 100, y: 170 }, { x: 0, y: 170 }
];

/* 与 ppGridFrame 同口径：center 恒为图纸中心，origin 取地块世界包围盒左下，scale=图纸/地块 */
function frameOf(poly, angleDeg) {
  const b = boundsOf(poly);
  return {
    angle: angleDeg,
    center: { x: DIMS.w / 2, y: DIMS.h / 2 },
    origin: { x: b.minX, y: b.minY },
    scaleX: DIMS.w / b.w, scaleY: DIMS.h / b.h
  };
}

/* 复刻 ppDrawZones 现在要画的网格线：竖线跨满格系包围框的 minY..maxY，横线跨满 minX..maxX */
function gridGeometry(poly, angleDeg, nCols, nRows) {
  const frame = frameOf(poly, angleDeg);
  const gp = poly.map((p) => CF.frameToGrid(frame, p));
  const gb = boundsOf(gp);
  const xs = [], ys = [];
  for (let i = 0; i <= nCols; i++) xs.push(gb.minX + gb.w * i / nCols);
  for (let i = 0; i <= nRows; i++) ys.push(gb.minY + gb.h * i / nRows);
  const W = (x, y) => CF.frameToWorld(frame, { x, y });
  const segs = [];
  xs.forEach((x) => segs.push([W(x, gb.minY), W(x, gb.maxY)]));
  ys.forEach((y) => segs.push([W(gb.minX, y), W(gb.maxX, y)]));
  return { frame, gp, gb, xs, ys, segs };
}

/* ---------------- ① 0° 逐位不变 ---------------- */
test('0° 网格线：裁剪对整段在界内的线必须原值透传（端点逐位相同，不许差一个 ulp）', () => {
  const g = gridGeometry(RECT, 0, 3, 2);
  const env = buildEnv({ polyPts: RECT });
  let checked = 0;
  g.segs.forEach((seg, i) => {
    const out = env.ppClipSegsToPlot(seg[0], seg[1]);
    assert.equal(out.length, 1, '第 ' + i + ' 条线应原样返回 1 段，实际 ' + out.length);
    assert.deepEqual(out[0], seg, '第 ' + i + ' 条线的端点被浮点抖动改动了（0° 生成结果会变）');
    checked++;
  });
  assert.ok(checked >= 6, '至少应检查 6 条网格线，实际 ' + checked);
});

test('0° 主管/支管：整段在界内时原值透传', () => {
  const env = buildEnv({ polyPts: RECT });
  const cases = [
    [{ x: 50, y: 30 }, { x: 50, y: 140 }],
    [{ x: 120.5, y: 85 }, { x: 260.25, y: 85 }],
    [{ x: 0, y: 0 }, { x: 300, y: 170 }]
  ];
  cases.forEach((seg, i) => {
    const out = env.ppClipSegsToPlot(seg[0], seg[1]);
    assert.equal(out.length, 1, '用例 ' + i + ' 应只返回 1 段');
    assert.deepEqual(out[0], seg, '用例 ' + i + ' 端点被改动');
  });
});

/* ---------------- ② 30° 缺陷基线 + ③ 修复后全在界内 ---------------- */
test('30° 网格线：未裁剪时明显越界（缺陷基线），裁剪后零越界', () => {
  const g = gridGeometry(RECT, 30, 3, 2);
  const before = sampleOutside(g.segs, RECT, 40);
  assert.ok(before.out / before.total > 0.20,
    '未裁剪基线应明显越界（预期 >20%），实际 ' + (100 * before.out / before.total).toFixed(1) + '%');

  const env = buildEnv({ polyPts: RECT });
  const clipped = [];
  g.segs.forEach((seg) => env.ppClipSegsToPlot(seg[0], seg[1]).forEach((s) => clipped.push(s)));

  const after = sampleOutside(clipped, RECT, 40);
  assert.equal(after.out, 0,
    '裁剪后仍有 ' + after.out + '/' + after.total + ' 个采样点在地块外');

  /* 长度：旋转外接框比地块大约 1.9 倍，裁完应落在 30%~80% 之间 */
  const ratio = totalLen(clipped) / totalLen(g.segs);
  assert.ok(ratio > 0.30 && ratio < 0.80,
    '裁剪后长度占比异常：' + (100 * ratio).toFixed(1) + '%（预期 30%~80%）');
});

test('30° 主管（最外侧一格）：整根竖管裁到地块内，且长度确实变短', () => {
  const g = gridGeometry(RECT, 30, 3, 2);
  const gp = RECT.map((p) => CF.frameToGrid(g.frame, p));     /* 格系多边形 = 运行时裁剪环 */
  const env = buildEnv({ polyPts: gp });

  const zoneW = g.xs[1] - g.xs[0], zoneH = g.ys[1] - g.ys[0];
  const zx = g.xs[0], zy = g.ys[0];
  const mainX = zx + zoneW / 2;
  const a = { x: mainX, y: zy }, b = { x: mainX, y: zy + zoneH };

  /* 先确认这根「按整格撒出去」的管子自身就有一端在界外 —— 缺陷真实存在 */
  assert.ok(!inside(a, gp) || !inside(b, gp), '用例选取失效：这根本来就整段在界内，换一格重挑');

  const out = env.ppClipSegsToPlot(a, b, gp);
  assert.ok(out.length >= 1, '裁剪后不应整根消失');
  const bad = sampleOutside(out, gp, 40);
  assert.equal(bad.out, 0, '裁剪后主管仍有越界采样点：' + bad.out + '/' + bad.total);
  assert.ok(totalLen(out) < totalLen([[a, b]]) - 0.5,
    '裁剪后主管长度应明显变短（原 ' + totalLen([[a, b]]).toFixed(1) + '，裁后 ' + totalLen(out).toFixed(1) + '）');
});

/* ---------------- ④ 凹多边形多段 ---------------- */
test('凹多边形（U 形）：穿进穿出两次必须返回 2 段，不许只留最长的一段', () => {
  const env = buildEnv({ polyPts: U_SHAPE });
  const segs = env.ppClipSegsToPlot({ x: 0, y: 120 }, { x: 300, y: 120 });
  assert.equal(segs.length, 2, 'U 形上一条横线应切成 2 段，实际 ' + segs.length + ' 段');

  const lens = segs.map((s) => Math.hypot(s[1].x - s[0].x, s[1].y - s[0].y)).sort((x, y) => x - y);
  assert.ok(Math.abs(lens[0] - 100) < 1e-6, '左臂段长应为 100，实际 ' + lens[0]);
  assert.ok(Math.abs(lens[1] - 100) < 1e-6, '右臂段长应为 100，实际 ' + lens[1]);

  /* 两段都必须真的在 U 形内部（中点判定） */
  segs.forEach((s, i) => {
    const mid = { x: (s[0].x + s[1].x) / 2, y: (s[0].y + s[1].y) / 2 };
    assert.ok(inside(mid, U_SHAPE), '第 ' + i + ' 段中点在 U 形外部');
  });
});

test('整根在地块外：返回空数组（调用方据此丢弃，不产生幽灵管段）', () => {
  const env = buildEnv({ polyPts: RECT });
  assert.deepEqual(env.ppClipSegsToPlot({ x: -50, y: -50 }, { x: -50, y: 400 }), []);
  assert.deepEqual(env.ppClipSegsToPlot({ x: 400, y: 20 }, { x: 400, y: 160 }), []);
});

test('退化输入：空环/短环时原样返回，不抛错', () => {
  const env = buildEnv({ polyPts: [] });
  const seg = [{ x: 1, y: 2 }, { x: 3, y: 4 }];
  assert.deepEqual(env.ppClipSegsToPlot(seg[0], seg[1]), [seg]);
  const env2 = buildEnv({ polyPts: [{ x: 0, y: 0 }, { x: 1, y: 1 }] });
  assert.deepEqual(env2.ppClipSegsToPlot(seg[0], seg[1]), [seg]);
});

/* ---------------- ⑤ 标注锚点 ---------------- */
test('部分出界的格子：标注换到「本格 ∩ 地块」形心后必须真的在界内', () => {
  const g = gridGeometry(RECT, 30, 3, 2);
  const env = buildEnv({ polyPts: RECT });

  /* 复刻 ppZoneClipCenterWorld：地块 → 格系 → 按本格矩形裁一刀 → 形心 → 回世界 */
  const local = RECT.map((p) => CF.frameToGrid(g.frame, p));
  let movedCount = 0;
  for (let zc = 0; zc + 1 < g.xs.length; zc++) {
    for (let zr = 0; zr + 1 < g.ys.length; zr++) {
      const centerWorld = CF.frameToWorld(g.frame, {
        x: (g.xs[zc] + g.xs[zc + 1]) / 2, y: (g.ys[zr] + g.ys[zr + 1]) / 2
      });
      if (inside(centerWorld, RECT)) continue;      /* 中心在界内 ⇒ 运行时不改动，跳过 */
      const clipped = ZONEGEO.clipPolyToRect(local, g.xs[zc], g.ys[zr], g.xs[zc + 1], g.ys[zr + 1]);
      const c = env.ppPolyCentroid(clipped);
      assert.ok(c, '格子 ' + zc + ',' + zr + ' 裁剪后应能算出形心');
      const world = CF.frameToWorld(g.frame, c);
      assert.ok(inside(world, RECT),
        '格子 ' + zc + ',' + zr + ' 的形心换算回世界后仍在地块外（标注还是会飘出去）');
      movedCount++;
    }
  }
  assert.ok(movedCount > 0, '用例失效：30° 下应有格子的中心跑到地块外，实际一个都没有');
});

test('调用点契约：网格线、管路、标注都必须真的走裁剪（防止只留辅助函数、调用点被回退）', () => {
  const pushSegSrc = sliceFunction(ppSrc, 'pushSeg');
  assert.ok(/ppClipSegsToPlot\(/.test(pushSegSrc),
    'pushSeg 没走 ppClipSegsToPlot —— 管路又会整格撒到地块外');
  assert.ok(!/ppClipSegToPoly/.test(pushSegSrc),
    'pushSeg 又用回了 v830 那份临时实现 ppClipSegToPoly');

  const dzSrc = sliceFunction(ppSrc, 'ppDrawZones');
  assert.ok(/ppClipSegsToPlot\(/.test(dzSrc),
    'ppDrawZones 的网格线没走 ppClipSegsToPlot —— 虚线又会从旋转外接框两端伸出去');
  assert.ok(!/ppCutCanvas\(cuts,cuts\.xPos\[bx\]/.test(dzSrc),
    'ppDrawZones 里旧的「整条跨满包围框」画法又回来了');
  assert.ok(/ppZoneClipCenterWorld\(/.test(dzSrc),
    'ppDrawZones 里格子标注没做锚点回拽 —— 部分出界的格子里文字会飘在地块外');

  /* 全局只剩一份线-多边形求交：ppClipPolylineToRing */
  assert.ok(!/function ppClipSegToPoly\b/.test(ppSrc),
    'ppClipSegToPoly 应已删除（与 ppClipPolylineToRing 重复，且会吞掉凹多边形另一段管）');
});

test('ppPolyCentroid：正方形形心 = 几何中心（防止分母写错 3A/6A）', () => {
  const env = buildEnv({ polyPts: RECT });
  const sq = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  const c = env.ppPolyCentroid(sq);
  assert.ok(Math.abs(c.x - 5) < 1e-9, 'cx 应为 5，实际 ' + c.x);
  assert.ok(Math.abs(c.y - 5) < 1e-9, 'cy 应为 5，实际 ' + c.y);
  /* 顺时针输入也要一样（绕向不该影响形心） */
  const cw = env.ppPolyCentroid(sq.slice().reverse());
  assert.ok(Math.abs(cw.x - 5) < 1e-9 && Math.abs(cw.y - 5) < 1e-9, '绕向翻转后形心变了');
  assert.equal(env.ppPolyCentroid([{ x: 0, y: 0 }, { x: 1, y: 1 }]), null, '不足 3 点应返回 null');
});
