#!/usr/bin/env node
'use strict';
/* tests/v1087_symbol_display_world.test.cjs —— 「符号必须贴在画出来的管线上」回归锁
 *
 * 用户 2026-11-15 第六次复测原话（贴施工图截图）：
 *   「看这张图，节点落在管路上有点漂移，个别主管上的小方块也有漂移，
 *     查一下是什么问题，记录修改之前的版本，别因为改这个，把之前修复好的内容破坏掉了。」
 *
 * 背景：v1058 起，主/支管重合时管线画的是**显示副本**（整线刚性平移 ±gap/2 = ±10m）。
 * v1059 已把三级工作区节点/连线/配件、二级接驳节点改到显示口径，但三级简图里
 * 三类符号仍留在**实体位**：
 *   ① 阀门红⊗ ← ppGetPipeDisplayGeometry().valves，该字段当时返回原坐标不偏移；
 *   ② 三通/弯头小方块 ← valveAnchors，而判定用「阀门距**支管**中心线 ≤0.5m」，
 *      阀门实际锚在**分区形心**、支管走**本列统一中心线**（v1079 定线），
 *      旋转地块里两者横向差 0~5.4m ⇒ 27 个阀门里 18 个拿不到锚点，退回实体 v.ax/ay；
 *   ③ 施工节点紫圆/节点连线 ← window.__tlPlanGeo（设计几何）。
 * 于是「阀门/节点整体偏 10m」+「个别方块偏」两个症状同时出现，其实是同一个口径错。
 *
 * 本文件锁三件事：
 *   A. 源码：阀门随显示主管平移、归属判据改「最近主管段」、__tlPlanGeo 用显示副本；
 *   B. 数学：把「实体 + 刚体位移」复算一遍，钉住
 *        · 显示阀门到显示主管的距离 === 实体阀门到实体主管的距离（刚体平移不改相对几何）
 *        · 锚点必须落在显示主管上（不是实体主管）
 *        · 弯头判定的 |ay−y| vs |ax−x| 不因平移而改变
 *   C. 可选浏览器锁：真实页面生成一次 3.3° 图，量「三通方块 / 施工节点 → 画出来的主管折线」
 *      的像素距离必须 ≈ 0。设 RUNYE_BROWSER_TESTS=1 才跑。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const pe = fs.readFileSync(path.join(ROOT, 'mod', 'plot-editor.js'), 'utf8');
const i09 = fs.readFileSync(path.join(ROOT, 'mod', 'inline-09.js'), 'utf8');

function bodyOfDisplayGeom() {
  const i = pe.indexOf('function ppGetPipeDisplayGeometry');
  assert.ok(i > 0, 'ppGetPipeDisplayGeometry 必须存在');
  return pe.slice(i, i + 9000);
}

/* ---------------- A. 源码锁 ---------------- */
test('A1 [v1087] 阀门必须随显示主管一起平移：返回 displayValves，不得再回吐实体坐标', () => {
  const body = bodyOfDisplayGeom();
  assert.ok(/var displayValves=\[\],valveAnchors=\[\];/.test(body),
    '必须新建 displayValves / valveAnchors 两个输出数组');
  assert.ok(/displayValves\.push\(\{x:v\.x\+\(d\?d\.x:0\),y:v\.y\+\(d\?d\.y:0\)\}\);/.test(body),
    '阀门坐标必须施加主管的显示位移');
  assert.ok(/valves:displayValves/.test(body), '返回值的 valves 必须是显示位');
  assert.ok(!/valves:valvePoints\.map\(function\(v\)\{return\{x:v\.x,y:v\.y\};\}\)/.test(body),
    'v1087 前的「阀门保留真实分区中心坐标」实现不得回退');
});

test('A2 [v1087] 阀门归属判据必须是「最近主管段」，不能再拿支管 0.5m 容差当判据', () => {
  const body = bodyOfDisplayGeom();
  assert.ok(/function nearestMainOn\(p\)/.test(body), '必须有 nearestMainOn');
  assert.ok(/var hit=nearestMainOn\(v\);/.test(body), '每个阀门按最近主管段定归属');
  assert.ok(!/Math\.hypot\(v\.x-proj\.x,v\.y-proj\.y\)<=0\.5\)valveShift\[vi\]/.test(body),
    '支管 0.5m 容差判据必须删除（阀门锚分区形心、支管走列中心线，两线天然差 0~5.4m）');
});

test('A3 [v1087] 锚点必须落在显示主管上：投影点之后要叠加同一刚体位移', () => {
  const body = bodyOfDisplayGeom();
  assert.ok(/valveAnchors\.push\(\(d&&hit\)\?\{x:hit\.proj\.x\+d\.x,y:hit\.proj\.y\+d\.y\}:null\);/.test(body),
    '锚点 = 垂足(实体) + 主管显示位移');
});

test('A4 [v1087] 施工节点/连线几何源 __tlPlanGeo 必须取显示副本', () => {
  const i = i09.indexOf('window.__tlPlanGeo = {');
  assert.ok(i > 0, '__tlPlanGeo 必须存在');
  const seg = i09.slice(Math.max(0, i - 1400), i + 700);
  assert.ok(/var __tlViewMains=\(tlPipeDisplay&&tlPipeDisplay\.main&&tlPipeDisplay\.main\.length\)\?tlPipeDisplay\.main:mainPipes;/.test(seg),
    '主管必须优先取 tlPipeDisplay.main（画出来的那根）');
  assert.ok(/var __tlViewBranches=\(tlPipeDisplay&&tlPipeDisplay\.branch&&tlPipeDisplay\.branch\.length\)\?tlPipeDisplay\.branch:branchPipes;/.test(seg),
    '支管必须优先取 tlPipeDisplay.branch');
  assert.ok(/mainPipes: __tlViewMains\.map/.test(seg), 'mainPipes 必须用 __tlViewMains');
  assert.ok(/branchPipes: __tlViewBranches\.map/.test(seg), 'branchPipes 必须用 __tlViewBranches');
  assert.ok(!/mainPipes: mainPipes\.map\(function\(line\)\{return line\.map/.test(seg),
    'v1087 前的「直接用设计几何」实现不得回退');
});

/* ---------------- B. 数学锁 ---------------- */
/* 复刻 ppGetPipeDisplayGeometry 的核心算式（与源码同形），验证刚体平移不改相对几何。 */
function displayGeom(mains, branches, valves, gap) {
  const axis = (line) => {
    const a = line[0], b = line[line.length - 1];
    const dx0 = b.x - a.x, dy0 = b.y - a.y, L = Math.hypot(dx0, dy0);
    let n = { x: -dy0 / L, y: dx0 / L };
    if (Math.abs(n.x) >= Math.abs(n.y)) { if (n.x < 0) { n.x = -n.x; n.y = -n.y; } }
    else if (n.y < 0) { n.x = -n.x; n.y = -n.y; }
    return { n: n, dx: dx0 / L, dy: dy0 / L, length: L };
  };
  const center = (l) => ({ x: (l[0].x + l[l.length - 1].x) / 2, y: (l[0].y + l[l.length - 1].y) / 2 });
  const mainShift = {}, branchShift = {};
  branches.forEach((bl, bi) => {
    const bc = center(bl), ba = axis(bl);
    let best = -1, bestD = Infinity;
    mains.forEach((ml, mi) => {
      const ma = axis(ml);
      if (Math.abs(ba.dx * ma.dy - ba.dy * ma.dx) > 0.06) return;
      const lateral = Math.abs((ml[0].x - bl[0].x) * ba.n.x + (ml[0].y - bl[0].y) * ba.n.y);
      if (lateral > 2.0) return;
      const p0 = bl[0].x * ba.dx + bl[0].y * ba.dy, p1 = bl[bl.length - 1].x * ba.dx + bl[bl.length - 1].y * ba.dy;
      const q0 = ml[0].x * ba.dx + ml[0].y * ba.dy, q1 = ml[ml.length - 1].x * ba.dx + ml[ml.length - 1].y * ba.dy;
      const overlap = Math.min(Math.max(p0, p1), Math.max(q0, q1)) - Math.max(Math.min(p0, p1), Math.min(q0, q1));
      if (overlap <= Math.min(0.5, ba.length * 0.5)) return;
      if (lateral < bestD) { bestD = lateral; best = mi; }
    });
    if (best < 0) return;
    const dx = ba.n.x * gap / 2, dy = ba.n.y * gap / 2;
    mainShift[best] = { x: -dx, y: -dy }; branchShift[bi] = { x: dx, y: dy };
  });
  function nearestMainOn(p) {
    let best = null, bestD = Infinity;
    for (let mi = 0; mi < mains.length; mi++) {
      const ml = mains[mi]; if (!ml || ml.length < 2) continue;
      for (let si = 0; si + 1 < ml.length; si++) {
        const a = ml[si], b = ml[si + 1], vx = b.x - a.x, vy = b.y - a.y, L2 = vx * vx + vy * vy;
        let t = L2 > 1e-12 ? ((p.x - a.x) * vx + (p.y - a.y) * vy) / L2 : 0;
        if (t < 0) t = 0; else if (t > 1) t = 1;
        const dseg = Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t));
        if (dseg < bestD) { bestD = dseg; best = { mi: mi, proj: { x: a.x + vx * t, y: a.y + vy * t }, dist: dseg }; }
      }
    }
    return best;
  }
  const displayValves = [], valveAnchors = [];
  valves.forEach((v) => {
    const hit = nearestMainOn(v);
    const d = (hit && mainShift[hit.mi]) ? mainShift[hit.mi] : null;
    displayValves.push({ x: v.x + (d ? d.x : 0), y: v.y + (d ? d.y : 0) });
    valveAnchors.push((d && hit) ? { x: hit.proj.x + d.x, y: hit.proj.y + d.y } : null);
  });
  const shifted = (lines, map) => lines.map((line, i) => {
    const d = map[i]; return line.map((p) => ({ x: p.x + (d ? d.x : 0), y: p.y + (d ? d.y : 0) }));
  });
  return { main: shifted(mains, mainShift), branch: shifted(branches, branchShift), valves: displayValves, valveAnchors: valveAnchors, mainShift: mainShift };
}

function distToLine(p, line) {
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i], b = line[i + 1], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
    let t = L2 < 1e-12 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2;
    t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)));
  }
  return best;
}

/* 现场形状：主管=支管的复制（ppBuildAutoPipes 就是这么造的），阀门锚在**分区形心**，
   形心相对本列中心线按行滑动 0~5m —— 这正是旋转地块下的真实布局。 */
function siteScene() {
  const mains = [], branches = [], valves = [];
  const colX = [40, 140, 240];
  const rowY = [0, 70, 140, 210];
  const drift = [[-4.2, 3.1, 0.6], [2.7, -3.6, 1.9], [-1.2, 4.8, -2.4], [3.9, -2.2, 4.4]];
  for (let r = 0; r < rowY.length; r++) {
    for (let c = 0; c < colX.length; c++) {
      const x = colX[c], y0 = rowY[r], y1 = rowY[r] + 70;
      const line = [{ x: x, y: y0 }, { x: x, y: y1 }];
      branches.push(line.map((p) => ({ x: p.x, y: p.y })));
      mains.push(line.map((p) => ({ x: p.x, y: p.y })));   /* 主管 = 支管复制 */
      valves.push({ x: x + drift[r][c], y: (y0 + y1) / 2 });
    }
  }
  return { mains, branches, valves };
}

test('B1 [v1087] 刚体平移不改相对几何：显示阀门→显示主管 必须等于 实体阀门→实体主管', () => {
  const { mains, branches, valves } = siteScene();
  const g = displayGeom(mains, branches, valves, 20);
  assert.ok(Object.keys(g.mainShift).length > 0, '这组现场形状必须至少有一对主支管配对成功');
  valves.forEach((v, i) => {
    let dPhys = Infinity; mains.forEach((L) => { dPhys = Math.min(dPhys, distToLine(v, L)); });
    let dView = Infinity; g.main.forEach((L) => { dView = Math.min(dView, distToLine(g.valves[i], L)); });
    assert.ok(Math.abs(dPhys - dView) < 1e-9,
      '阀' + (i + 1) + '：显示位相对几何必须与实体位逐位相同（' + dPhys.toFixed(3) + ' vs ' + dView.toFixed(3) + '）');
  });
});

test('B2 [v1087] 锚点必须落在显示主管上（不是实体主管），且全部阀门都要有锚点', () => {
  const { mains, branches, valves } = siteScene();
  const g = displayGeom(mains, branches, valves, 20);
  let withShift = 0;
  g.valves.forEach((v, i) => {
    const a = g.valveAnchors[i];
    if (a) {
      withShift++;
      let d = Infinity; g.main.forEach((L) => { d = Math.min(d, distToLine(a, L)); });
      assert.ok(d < 1e-9, '阀' + (i + 1) + ' 的锚点必须压在显示主管上，实测偏 ' + d.toFixed(3) + 'm');
      /* 锚点若错用实体主管，会偏正好 |显示位移| = 10m */
      let dEntity = Infinity; mains.forEach((L) => { dEntity = Math.min(dEntity, distToLine(a, L)); });
      assert.ok(dEntity > 5, '阀' + (i + 1) + ' 的锚点不应回到实体主管上（那说明位移没叠加）');
    }
  });
  assert.ok(withShift >= valves.length * 0.9,
    '至少 90% 的阀门必须拿得到锚点（v1087 前只有 9/27），实测 ' + withShift + '/' + valves.length);
});

test('B3 [v1087] 弯头判定不因平移改变：|ay−y| 与 |ax−x| 必须逐位守恒', () => {
  const { mains, branches, valves } = siteScene();
  const g = displayGeom(mains, branches, valves, 20);
  let checked = 0;
  valves.forEach((v, i) => {
    const a = g.valveAnchors[i]; if (!a) return;
    const vv = g.valves[i];
    /* 实体口径的「连接管锚点」= 显示锚点 − 同一刚体位移（这正是源码施加的变换） */
    const shift = { x: vv.x - v.x, y: vv.y - v.y };
    const axEntity = a.x - shift.x, ayEntity = a.y - shift.y;
    /* v.elbow 的 elH = |ay−y| ≤ |ax−x|（inline-09 用它区分 90°弯头画法） */
    const elHBefore = Math.abs(ayEntity - v.y) <= Math.abs(axEntity - v.x);
    const elHAfter = Math.abs(a.y - vv.y) <= Math.abs(a.x - vv.x);
    assert.equal(elHAfter, elHBefore,
      '阀' + (i + 1) + '：平移后「连接管水平/竖直」判定必须不变，否则弯头符号会画成另一个朝向');
    assert.ok(Math.abs(Math.abs(a.x - vv.x) - Math.abs(axEntity - v.x)) < 1e-9, 'x 向差量必须守恒');
    assert.ok(Math.abs(Math.abs(a.y - vv.y) - Math.abs(ayEntity - v.y)) < 1e-9, 'y 向差量必须守恒');
    checked++;
  });
  assert.ok(checked >= valves.length * 0.9, '必须覆盖到绝大多数阀门，实测 ' + checked + '/' + valves.length);
});

/* ---------------- C. 可选浏览器锁 ---------------- */
test('C1 [v1087] 真实页面：三通方块 / 施工节点 → 画出来的主管折线 必须几乎为 0m', { skip: process.env.RUNYE_BROWSER_TESTS !== '1' }, async () => {
  const { chromium } = require('playwright');
  const B = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const ctx = await B.newContext({ viewport: { width: 1600, height: 1000 } });
    const p = await ctx.newPage();
    p.on('dialog', async (d) => { try { await d.dismiss(); } catch (e) { } });
    await p.goto('file:///' + ROOT.replace(/\\/g, '/') + '/index.html', { waitUntil: 'load', timeout: 90000 });
    await p.waitForTimeout(2600);
    await p.evaluate(() => {
      const it = Array.from(document.querySelectorAll('a,button,li,span,div'));
      const n = it.find((x) => (x.textContent || '').trim() === '分区与管路' && x.offsetParent !== null);
      if (n) n.click();
    });
    await p.waitForTimeout(1800);
    await p.evaluate(() => {
      window.measuredPolygon = [{ x: 0, y: 0 }, { x: 526, y: 0 }, { x: 526, y: 535 }, { x: 0, y: 535 }];
      window.measuredArea = 253467;
      window.ppLoadPolygon();
      const s = (id, v) => { const e = document.getElementById(id); if (!e) return; e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); };
      s('planN', 12); s('planTapeLaySide', 100);
      window.calcPlan(); window.ppSetZoneAngleDeg(3.3); window.ppRender();
    });
    await p.waitForTimeout(800);
    await p.evaluate(() => { const b = document.getElementById('ppGenerate'); if (b) b.click(); });
    await p.waitForTimeout(2600);
    await p.evaluate(() => {
      const g = window.__tlPlanGeo, N = window.RyTlNodes; if (!g || !N) return;
      for (let i = 0; i < Math.min(3, g.mainPipes.length); i++) {
        const L = g.mainPipes[i]; let s = 0;
        for (let j = 0; j + 1 < L.length; j++) s += Math.hypot(L[j + 1].x - L[j].x, L[j + 1].y - L[j].y);
        if (s > 20) N.addAt('main-' + i, s * 0.5);
      }
    });
    await p.waitForTimeout(800);
    const o = await p.evaluate(() => {
      const svg = document.querySelector('#tlDiagramContent svg');
      if (!svg) return { error: 'no svg' };
      const parse = (d) => { const n = (d.match(/-?\d+(?:\.\d+)?/g) || []).map(Number); const q = []; for (let i = 0; i + 1 < n.length; i += 2) q.push({ x: n[i], y: n[i + 1] }); return q; };
      const seg = (p, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy; let t = L2 < 1e-12 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2; t = Math.max(0, Math.min(1, t)); return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)); };
      const near = (p, ls) => { let b = Infinity; ls.forEach((L) => { for (let i = 0; i + 1 < L.length; i++) b = Math.min(b, seg(p, L[i], L[i + 1])); }); return b; };
      const plen = (L) => { let s = 0; for (let i = 0; i + 1 < L.length; i++) s += Math.hypot(L[i + 1].x - L[i].x, L[i + 1].y - L[i].y); return s; };
      const mains = [];
      svg.querySelectorAll('path[data-tlpipe]').forEach((el) => {
        if ((el.getAttribute('data-tlpipe') || '').indexOf('main-') !== 0) return;
        const q = parse(el.getAttribute('d') || ''); if (q.length >= 2) mains.push(q);
      });
      let pxSum = 0; mains.forEach((L) => { pxSum += plen(L); });
      let mSum = 0; ((window.__tlPlanGeo || {}).mainPipes || []).forEach((L) => { mSum += plen(L); });
      const scale = mSum > 1e-6 ? pxSum / mSum : 0;
      const tees = [];
      svg.querySelectorAll('rect[data-junction-tee]').forEach((el) => {
        tees.push({ x: +el.getAttribute('x') + +el.getAttribute('width') / 2, y: +el.getAttribute('y') + +el.getAttribute('height') / 2 });
      });
      const nodes = [];
      svg.querySelectorAll('circle[data-tlnode]').forEach((el) => { nodes.push({ x: +el.getAttribute('cx'), y: +el.getAttribute('cy') }); });
      const mx = (a) => (a.length ? Math.max.apply(null, a) : 0);
      return {
        scale: scale,
        teeMaxM: scale > 0 ? mx(tees.map((q) => near(q, mains) / scale)) : 999,
        nodeMaxM: scale > 0 ? mx(nodes.map((q) => near(q, mains) / scale)) : 999,
        nTee: tees.length, nNode: nodes.length
      };
    });
    await ctx.close();
    assert.ok(!o.error, o.error || '');
    assert.ok(o.nTee > 0, '必须有阀门三通方块可测');
    assert.ok(o.nNode > 0, '必须有施工节点可测');
    assert.ok(o.teeMaxM < 0.6, '三通方块离可见主管最远 ' + o.teeMaxM.toFixed(2) + 'm（v1087 前是 10m 级）');
    assert.ok(o.nodeMaxM < 0.6, '施工节点离可见主管最远 ' + o.nodeMaxM.toFixed(2) + 'm（v1087 前是 10m 级）');
  } finally { await B.close(); }
});
