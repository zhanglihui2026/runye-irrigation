/* iso_diagram.test.cjs — 轴测图纯几何回归（node --test 或直接 node 运行）
 * 覆盖任务十三要求的几何类测试：三通生成规则、阀门完整性、容差识别、
 * ID 唯一性、投影有限性/可逆性、退化输入、幂等渲染。
 * 运行：node tests/iso_diagram.test.cjs  （退出码非 0 即失败） */
'use strict';
const iso = require('../iso-diagram/iso-diagram.js');
const assert = require('assert');

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

/* ---------- 测试数据工厂 ---------- */
function mkData(opt) {
  opt = opt || {};
  const frontY = -20;
  return {
    version: 1, world: 'meter', generatedAt: '2026-09-13 09:00',
    plot: { w: 300, h: 200 },
    poly: [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 200 }, { x: 0, y: 200 }],
    zones: { cols: 3, rows: 2, xPos: [0, 100, 200, 300], yPos: [0, 100, 200] },
    frontPipe: [{ x: 0, y: frontY }, { x: 300, y: frontY }],
    sourcePos: { x: 0, y: frontY },
    mainPipes: [[{ x: 32, y: 0 }, { x: 32, y: 100 }], [{ x: 132, y: 0 }, { x: 132, y: 100 }], [{ x: 232, y: 0 }, { x: 232, y: 100 }],
                [{ x: 32, y: 100 }, { x: 32, y: 200 }], [{ x: 132, y: 100 }, { x: 132, y: 200 }], [{ x: 232, y: 100 }, { x: 232, y: 200 }]],
    branchPipes: [
      [{ x: 60, y: 6 }, { x: 60, y: 94 }], [{ x: 160, y: 6 }, { x: 160, y: 94 }], [{ x: 260, y: 6 }, { x: 260, y: 94 }],
      [{ x: 60, y: 106 }, { x: 60, y: 194 }], [{ x: 160, y: 106 }, { x: 160, y: 194 }], [{ x: 260, y: 106 }, { x: 260, y: 194 }]
    ],
    valves: [
      { x: 60, y: 50, ax: 32, ay: 18 }, { x: 160, y: 50, ax: 132, ay: 18 }, { x: 260, y: 50, ax: 232, ay: 18 },
      { x: 60, y: 150, ax: 32, ay: 118 }, { x: 160, y: 150, ax: 132, ay: 118 }, { x: 260, y: 150, ax: 232, ay: 118 }
    ],
    dripTapes: [[{ x: 40, y: 20 }, { x: 80, y: 20 }]],
    meta: { zoneCount: 6, pump: { flow: '120', head: '35', power: '18.5' }, pipes: { front: 'Ø200', main: 'Ø110', branch: 'Ø63' } }
  };
}

console.log('== iso-diagram 纯几何回归 ==');

/* 1. 总管 ↔ 主管：每条主管一个三通（6 主管 → 6 front-main 三通）+ 自动接入阀门 */
{
  const m = iso.buildModel(mkData());
  const fm = m.tees.filter(t => t.type === 'front-main');
  ok(fm.length === 6, '总管↔主管：6 主管生成 6 个三通（实际 ' + fm.length + '）');
  const autoV = m.valves.filter(v => v.auto);
  ok(autoV.length === 6, '每个主管接入点自动生成 1 个阀门（实际 ' + autoV.length + '）');
  ok(autoV.every(v => v.id.startsWith('V-F')), '接入阀门 ID 前缀 V-F');
}

/* 1b. 埋地层级：总管/主管 z 低于支管（地表），接入阀在地下 */
{
  ok(iso.HEIGHTS.front < 0 && iso.HEIGHTS.main < 0 && iso.HEIGHTS.branch > 0 && iso.HEIGHTS.tape === 0,
    '层级表达：总管(' + iso.HEIGHTS.front + ')/主管(' + iso.HEIGHTS.main + ') 埋地（z<0），支管(' + iso.HEIGHTS.branch + ')/滴灌带 地表');
  const m = iso.buildModel(mkData());
  const autoV = m.valves.filter(v => v.auto);
  ok(autoV.every(v => v.z < 0), '总管↔主管接入阀位于地下（z<0，实际 ' + (autoV[0] && autoV[0].z) + '）');
  ok(m.valves.filter(v => !v.auto).every(v => v.z > 0), '支管阀位于地表（z>0）');
}

/* 2. 主管↔支管：只认已有阀门（6 个 → 6 个 main-branch 三通），阀门位置优先用平面图数据 */
{
  const m = iso.buildModel(mkData());
  const bm = m.tees.filter(t => t.type === 'main-branch');
  ok(bm.length === 6, '主管↔支管：6 个已有阀门生成 6 个三通（实际 ' + bm.length + '）');
  const planV = m.valves.filter(v => !v.auto);
  ok(planV.length === 6 && planV.every((v, i) => {
    const src = mkData().valves[i];
    return v.point.x === src.x && v.point.y === src.y;
  }), '已有阀门位置与平面图逐点一致（不重复生成、不移动）');
  ok(planV.every(v => v.downstream.startsWith('branch-')), '每个支管阀门都关联到下游支管');
}

/* 3. 每个有效三通都有阀门 */
{
  const m = iso.buildModel(mkData());
  ok(m.tees.every(t => t.valveId && m.valves.some(v => v.id === t.valveId)), '每个三通都有对应阀门');
}

/* 4. 无真实连接的交叉线不生成三通（阀门斜拉点不在主管上 → 跳过） */
{
  const d = mkData();
  d.valves.push({ x: 70, y: 60, ax: 45.3, ay: 34.7 }); // 斜拉点悬空，不在任何主管上
  const m = iso.buildModel(d);
  ok(m.tees.filter(t => t.type === 'main-branch').length === 6, '悬空斜拉点不生成三通（实际 main-branch=' + m.tees.filter(t => t.type === 'main-branch').length + '）');
}

/* 5. 浮点微小误差（≤EPS=0.01）仍识别连接 */
{
  const d = mkData();
  d.mainPipes[0] = [{ x: 32.005, y: 0 }, { x: 32.005, y: 100 }]; // 主管 x 偏 5mm
  d.valves[0] = { x: 60, y: 50, ax: 32.006, ay: 18.004 };
  const m = iso.buildModel(d);
  ok(m.tees.filter(t => t.type === 'front-main').length === 6, '主管端点 5mm 偏移仍识别总管连接');
  ok(m.tees.filter(t => t.type === 'main-branch').length === 6, '斜拉点 6mm 偏移仍识别主管连接');
}

/* 6. 三通/阀门 ID 不重复 */
{
  const m = iso.buildModel(mkData());
  const ids = m.tees.map(t => t.id).concat(m.valves.map(v => v.id));
  ok(new Set(ids).size === ids.length, 'ID 唯一（共 ' + ids.length + ' 个）');
}

/* 7. 投影结果全部有限数（极小地块 / 大地块 / 旋转地块） */
{
  const cases = {
    tiny: mkData(), big: mkData(), rot: mkData()
  };
  cases.tiny.zones.xPos = [0, 0.1, 0.2, 0.3]; cases.tiny.plot = { w: 0.3, h: 0.2 };
  cases.big.mainPipes = [[{ x: 0, y: 0 }, { x: 0, y: 1e5 }]]; cases.big.frontPipe = [{ x: 0, y: -1e4 }, { x: 1e5, y: -1e4 }];
  cases.big.valves = []; cases.big.branchPipes = [];
  const c = Math.cos(0.6), s2 = Math.sin(0.6);
  cases.rot.poly = cases.rot.poly.map(p => ({ x: p.x * c - p.y * s2, y: p.x * s2 + p.y * c }));
  cases.rot.mainPipes = cases.rot.mainPipes.map(l => l.map(p => ({ x: p.x * c - p.y * s2, y: p.x * s2 + p.y * c })));
  let allFinite = true;
  for (const k of Object.keys(cases)) {
    const svg = iso.renderSVG(cases[k]);
    if (!svg) { allFinite = false; ok(false, '投影有限性[' + k + ']：SVG 为空'); continue; }
    const nums = svg.match(/-?\d+\.?\d*/g) || [];
    if (nums.some(n => !isFinite(parseFloat(n)))) { allFinite = false; ok(false, '投影有限性[' + k + ']：出现非有限数'); }
  }
  ok(allFinite, '极小/巨大/旋转地块投影全部有限数');
}

/* 8. 等轴测投影可逆性（同层） */
{
  let maxErr = 0;
  for (let i = 0; i < 200; i++) {
    const x = Math.random() * 1000 - 500, y = Math.random() * 1000 - 500, z = [0, 1, 2, 3][i % 4];
    const p = iso.projectIso(x, y, z, 1.7);
    const b = iso.unprojectIso(p.x, p.y, z, 1.7);
    maxErr = Math.max(maxErr, Math.abs(b.x - x), Math.abs(b.y - y));
  }
  ok(maxErr < 1e-6, '同层逆映射误差 < 1e-6（实际 ' + maxErr.toExponential(2) + '）');
}

/* 9. 无数据 / 坏数据不崩溃 */
{
  let threw = false, r1 = 'x', r2 = 'x';
  try { r1 = iso.renderSVG(null); r2 = iso.renderSVG({ version: 2 }); } catch (e) { threw = true; }
  ok(!threw && r1 === null && r2 === null, 'null / version≠1 返回 null 且不抛异常');
  const m = iso.buildModel(mkData());
  ok(m && m.tees.length > 0, '正常数据 buildModel 正常');
}

/* 10. 渲染幂等：同输入同输出（重复点击不叠加的前提） */
{
  const a = iso.renderSVG(mkData()), b = iso.renderSVG(mkData());
  ok(a === b, '同输入渲染输出逐字节一致（幂等）');
  ok(a.includes('data-iso="1"') && a.includes('</svg>'), '输出为完整 SVG');
}

/* 11. 阀门标签数量限制（>24 个阀门时不画编号文字，避免拥挤） */
{
  const d = mkData();
  for (let i = 0; i < 30; i++) d.valves.push({ x: 10 + i * 5, y: 99 + (i % 2), ax: 32, ay: 50 + i });
  const m = iso.buildModel(d);
  const svg = iso.renderSVG(d);
  const labelCount = (svg.match(/V-[BF]\d+/g) || []).filter(x => false).length; // 占位
  ok(m.valves.length > 24 && !/font-size="7"/.test(svg), '阀门 >24 时不画图上编号（用 title 悬停）');
}

/* 12. 手工配件层 API（2026-09-13）：放置状态 / 增删 / 编号序列 / 数据变更清空 / fittingInfo */
{
  const d = mkData();
  iso.attachData(d);
  ok(iso.manualCount() === 0, '初始手工配件为空');
  /* 放置模式 */
  ok(iso.startPlace('tee', 'dn110') === true && iso.placingKind() === 'tee', 'startPlace 进入放置模式（tee/dn110）');
  ok(iso.startPlace('nope', '') === false, '未知配件类型拒绝进入放置模式');
  iso.cancelPlace();
  ok(iso.placingKind() === null, 'cancelPlace 退出放置模式');
  /* 增删与编号序列 */
  const m1 = iso.addManual('tee', 'dn110', 'main', 0, { x: 50, y: 30 });
  const m2 = iso.addManual('elbow', '', 'branch', 1, { x: 60, y: 40 });
  const m3 = iso.addManual('valve', 'dn90', 'front', 0, { x: 70, y: -20 });
  ok(m1 && m1.id === 'M-T01' && m2 && m2.id === 'M-E01' && m3 && m3.id === 'M-V01', '手工配件编号按类型独立递增（M-T01/M-E01/M-V01）');
  ok(m1.z === iso.HEIGHTS.main && m2.z === iso.HEIGHTS.branch && m3.z === iso.HEIGHTS.front, '手工配件 z 随所在管段层高（主管埋地/支管地表/总管埋地）');
  ok(iso.manualCount() === 3, '手工配件计数 = 3');
  ok(iso.fittingInfo('M-T01') && iso.fittingInfo('M-T01').spec === 'dn110' && iso.fittingInfo('M-T01').manual === true, 'fittingInfo 命中手工配件（规格 dn110）');
  ok(iso.fittingInfo('M-E01').spec === '与管道同径', '未选规格显示「与管道同径」');
  ok(iso.removeManual('M-T01') === true && iso.manualCount() === 2, 'removeManual 删除成功');
  ok(iso.removeManual('M-T01') === false, '重复删除同一 id 返回 false');
  /* 自动构件参数查询 */
  ok(iso.fittingInfo('TEE-F01') && iso.fittingInfo('TEE-F01').manual === false && /总管×主管/.test(iso.fittingInfo('TEE-F01').typeName), 'fittingInfo 命中自动三通（总管×主管）');
  ok(iso.fittingInfo('NOPE') === null, 'fittingInfo 未知 id 返回 null');
  /* 数据引用变更 → 自动清空（重新生成平面图的语义） */
  iso.attachData(mkData());
  ok(iso.manualCount() === 2, '相同几何重新生成保留编辑');
  const changed=mkData(); changed.mainPipes[0][0].x+=2;
  iso.attachData(changed);
  ok(iso.manualCount() === 0, '管网几何变更 → 清空不适用的编辑');
  /* 渲染包含手工配件层（data-fit 标记）且幂等 */
  iso.attachData(d);
  iso.addManual('tee', 'dn110', 'main', 0, { x: 50, y: 30 });
  const s1 = iso.renderSVG(d), s2 = iso.renderSVG(d);
  ok(s1 === s2 && s1.includes('data-fit="M-T01"'), '手工配件渲染进 SVG（data-fit 标记）且幂等');
  const m = iso.buildModel(d);
  ok(!JSON.stringify(m).includes('M-T01'), '手工配件不混入 buildModel 自动模型（水力数据纯净）');
}

/* 8c. 正面斜轴测与空间连接。替代旧屏幕固定斜拉测试。 */
{
  iso.clearManual();
  const d = mkData(), original = JSON.stringify(d), m = iso.buildModel(d);
  const x = iso.projectIso(1,0,0,1), y = iso.projectIso(0,1,0,1), z = iso.projectIso(0,0,1,1);
  ok(x.x === 1 && x.y === 0 && Math.abs(y.x + y.y) < 1e-12 && y.y < 0 && z.x === 0 && z.y === -1, 'X水平/Y45度/Z竖直');
  const svg = iso.renderSVG(d);
  const routes = [...svg.matchAll(/data-connector="main-branch" d="M([\d.-]+) ([\d.-]+) L([\d.-]+) ([\d.-]+)"/g)];
  const valves = m.valves.filter(v => v.conn);
  const state = iso.getViewState();
  ok(routes.length === valves.length && routes.length > 0, '每个出水阀都有连续立管和连接段');
  ok(routes.every((r,i) => {
    const q=iso.projectIso(valves[i].point.x,valves[i].point.y,valves[i].z,state.k);
    const offset=state.branchOffsets[Number(valves[i].downstream.slice(7))];
    return r[1] === r[3] && Math.abs(Number(r[2])-Number(r[4])-28)<0.11 && Math.abs(Number(r[3])-state.ox-q.x-offset.x)<0.11 && Math.abs(Number(r[4])-state.oy-q.y-offset.y)<0.11;
  }), '整段连接平行Z轴且精确终止于展开后的支管接入点');
  ok((svg.match(/data-symbol="valve"/g)||[]).length === m.valves.length + 1, '全部自动阀门和图例采用通用阀门符号');
  ok(JSON.stringify(d) === original, '渲染不改变平面数据');
  ok(svg.includes('标高/埋深待设计确认') && svg.includes('不按比例'), '不虚构施工标高及比例');
}

/* 9. 分区材料统计 computeStats（2026-09-13，只读汇总） */
{
  iso.clearManual();
  const st = iso.computeStats(mkData());
  ok(st && Array.isArray(st.zones) && st.zones.length === 6, '统计：6 个分区（实际 ' + (st && st.zones.length) + '）');
  const z = st.zones[0]; /* R1C1：主管 main-0（y0→100=100m）、支管 branch-0（y6→94=88m） */
  ok(z.id === 'R1C1' && Math.abs(z.area - 10000) < 1e-6, 'R1C1 面积 = 10000 ㎡');
  ok(Math.abs(z.areaMu - 15) < 1e-6, 'R1C1 面积 = 15.00 亩');
  ok(Math.abs(z.mainLen - 100) < 1e-6 && Math.abs(z.branchLen - 88) < 1e-6, 'R1C1 主管 100 m / 支管 88 m（实际 ' + z.mainLen + '/' + z.branchLen + '）');
  ok(z.valves === 1 && z.tees === 1 && z.elbows === 0, 'R1C1 阀 1 / 三通 1 / 弯头 0');
  ok(Math.abs(z.pipeLen - 188) < 1e-6, 'R1C1 管道合计 188 m');
  const t = st.totals;
  ok(Math.abs(t.frontLen - 300) < 1e-6, '合计总管 300 m');
  ok(Math.abs(t.mainLen - 600) < 1e-6 && Math.abs(t.branchLen - 528) < 1e-6, '合计主管 600 m / 支管 528 m');
  ok(Math.abs(t.pipeLen - (300 + 600 + 528)) < 1e-6, '合计管道 = 总管+主管+支管');
  ok(t.valves === 12, '合计阀门 = 6 出水阀 + 6 主管接入阀（实际 ' + t.valves + '）');
  ok(t.tees === 12, '合计三通 = 6 接入 + 6 分支（实际 ' + t.tees + '）');
  ok(t.elbows === 0 && t.manual.elbow === 0, '无手工配件时弯头为 0');
  ok(t.inletValves === 6, '主管接入阀 6 个单独列出');
  ok(t.unmappedPipe < 1e-6, '无未归区管段');
}
/* 9b. 手工配件按所在管段归区 */
{
  iso.clearManual();
  iso.addManual('elbow', 'dn110', 'branch', 0, { x: 60, y: 40 });   /* branch-0 → R1C1 */
  iso.addManual('tee', 'dn110', 'main', 0, { x: 32, y: 60 });       /* main-0 → R1C1 */
  iso.addManual('valve', 'dn63', 'front', 0, { x: 100, y: -20 });   /* 总管 → 仅合计 */
  const st = iso.computeStats(mkData());
  const z = st.zones[0], t = st.totals;
  ok(z.elbows === 1 && z.tees === 2, '手工弯头/三通归入 R1C1（弯1/三通2，实际 ' + z.elbows + '/' + z.tees + '）');
  ok(z.valves === 1, '总管上的手工阀门不落入分区');
  ok(t.elbows === 1 && t.manual.tee === 1 && t.manual.elbow === 1 && t.manual.valve === 1, '合计含全部手工配件');
  iso.clearManual();
}
/* 9c. 无 zones 数据不崩溃，合计仍完整 */
{
  iso.clearManual();
  const d = mkData(); delete d.zones;
  const st = iso.computeStats(d);
  ok(st && st.zones.length === 0, '无 zones → 分区列表为空不崩溃');
  ok(Math.abs(st.totals.mainLen - 600) < 1e-6 && Math.abs(st.totals.branchLen - 528) < 1e-6, '无 zones → 主/支管长各自计入合计（600/528）');
  ok(Math.abs(st.totals.unmappedPipe - 1128) < 1e-6, '无 zones → 未归区管段 1128 m（600+528）');
  ok(st.totals.valves === 12, '无 zones → 阀门合计不丢（出水阀按未归区 + 接入阀）');
}
/* 9d. 非法数据返回 null */
ok(iso.computeStats({ version: 2 }) === null, 'version 非 1 → computeStats 返回 null');

/* 10. 地块轮廓线（2026-09-13 用户要求显示；分区线保留） */
{
  iso.clearManual();
  const d = mkData(), original = JSON.stringify(d);
  const svg = iso.renderSVG(d);
  ok(svg.includes('data-plot-outline="1"'), '轴测图绘制地块轮廓线（data-plot-outline）');
  const cells = (svg.match(/<polygon points="/g) || []).length;
  ok(cells >= 6 + 1, '分区分割线保留（含 6 分区网格 + 1 轮廓，实际 polygon ' + cells + '）');
  ok(JSON.stringify(d) === original, '绘制轮廓不改平面数据');
}

/* 11. 地块裁剪：管线超出地块的部分不显示（2026-09-13） */
{
  iso.clearManual();
  const d = mkData(), original = JSON.stringify(d);
  const svg = iso.renderSVG(d);
  ok(svg.includes('<clipPath id="isoPlotClip">'), '有地块轮廓 → 生成 isoPlotClip 裁剪路径');
  ok((svg.match(/clip-path="url\(#isoPlotClip\)"/g) || []).length >= 7, '总管/主管/支管/接入段/立管/阀门/三通等 ≥7 组挂裁剪（实际 ' + (svg.match(/clip-path="url\(#isoPlotClip\)"/g) || []).length + '）');
  ok(svg.includes('>P</text>'), '水源符号保留不裁');
  const d2 = mkData(); d2.poly = [];
  const svg2 = iso.renderSVG(d2);
  ok(!svg2.includes('isoPlotClip'), '无有效轮廓（poly 空）→ 不裁剪不报错');
  ok(JSON.stringify(d) === original, '裁剪不改平面数据');
}

console.log('\n== 结论：PASS=' + pass + ' FAIL=' + fail + ' ==');
process.exit(fail ? 1 : 0);
