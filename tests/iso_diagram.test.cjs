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
  /* 2026-09-15 契约更新：标注简化 —— 管道引线标注只剩总管 1 条，主管/支管规格并入图例；默认不标阀门编号 */
  ok((svg.match(/data-pipe-note="1"/g) || []).length === 1, '管道引线标注仅剩总管 1 条（主管/支管不再逐根标注）');
  ok(svg.includes('总管 Ø200') && svg.includes('主管 Ø110') && svg.includes('支管 Ø63'), '图例文字含三类管道规格');
  const valveLabelCount = (svg.match(new RegExp('>' + m.valves[0].id + ' Ø', 'g')) || []).length
    + (svg.match(new RegExp('>' + m.valves[m.valves.length - 1].id + ' Ø', 'g')) || []).length;
  ok(valveLabelCount === 0, '默认不显示阀门编号（编辑过才显示）');
}

/* 9. 分区材料统计 computeStats（2026-09-13，只读汇总） */
{
  iso.clearManual();
  const st = iso.computeStats(mkData());
  ok(st && Array.isArray(st.zones) && st.zones.length === 6, '统计：6 个分区（实际 ' + (st && st.zones.length) + '）');
  const z = st.zones[0]; /* 1区：主管 main-0（y0→100=100m）、支管 branch-0（y6→94=88m） */
  ok(z.id === '1区' && Math.abs(z.area - 10000) < 1e-6, '1区 面积 = 10000 ㎡');
  ok(Math.abs(z.areaMu - 15) < 1e-6, '1区 面积 = 15.00 亩');
  ok(Math.abs(z.mainLen - 100) < 1e-6 && Math.abs(z.branchLen - 88) < 1e-6, '1区 主管 100 m / 支管 88 m（实际 ' + z.mainLen + '/' + z.branchLen + '）');
  ok(z.valves === 1 && z.tees === 1 && z.elbows === 0, '1区 阀 1 / 三通 1 / 弯头 0');
  ok(Math.abs(z.pipeLen - 188) < 1e-6, '1区 管道合计 188 m');
  /* ★ 2026-09-17 第四十三轮新契约：分区 id ＝ 地块分区标号（行主序 zi+1 →「N区」），
     不再用网格坐标 R{r}C{c}（用户反馈「右侧分区编号与地块分区编号不同」）。 */
  const ids = st.zones.map(function (c) { return c.id; }).join(',');
  ok(ids === '1区,2区,3区,4区,5区,6区', '分区 id 行主序 1区…6区（实际 ' + ids + '）');
  ok(st.zones[3].id === '4区', '跨行区号连续：zones[3] = 第二行第一列 = 4区（cols=3）');
  ok(!/R\d+C\d+/.test(ids), '旧网格坐标 R{r}C{c} 不得复活');
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
  iso.addManual('elbow', 'dn110', 'branch', 0, { x: 60, y: 40 });   /* branch-0 → 1区 */
  iso.addManual('tee', 'dn110', 'main', 0, { x: 32, y: 60 });       /* main-0 → 1区 */
  iso.addManual('valve', 'dn63', 'front', 0, { x: 100, y: -20 });   /* 总管 → 仅合计 */
  const st = iso.computeStats(mkData());
  const z = st.zones[0], t = st.totals;
  ok(z.id === '1区' && z.elbows === 1 && z.tees === 2, '手工弯头/三通归入 1区（弯1/三通2，实际 ' + z.elbows + '/' + z.tees + '）');
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

/* 10. 地块轮廓线（2026-09-13 要求显示；2026-09-16 改为虚线参考线，不裁剪管线） */
{
  iso.clearManual();
  const d = mkData(), original = JSON.stringify(d);
  const svg = iso.renderSVG(d);
  ok(!svg.includes('data-plot-outline'), '旧版地块轮廓线标记已取消（不再绘制 data-plot-outline）');
  ok(svg.includes('stroke="#94a3b8"') && svg.includes('stroke-dasharray="6,4"'), '地块轮廓以灰色虚线参考线绘制（可见且不裁剪管线）');
  const cells = (svg.match(/<polygon points="/g) || []).length;
  ok(cells >= 6, '分区分割线保留（分区网格 polygon 仍在，实际 ' + cells + '）');
  ok(JSON.stringify(d) === original, '取消轮廓线不改平面数据');
}

/* 11. 地块裁剪 → 2026-09-16 契约改写：取消裁剪，管线完整显示
       原契约（2026-09-13）「管线超出地块的部分不显示」，2026-09-14 曾豁免总管及接入段；
       2026-09-16 用户要求轴测图管线不被地块剪切 —— 旋转后的三通分支 / 从分支口接出的
       生长管可能落在地块外，裁剪会让它们「看不见」。新契约：地块轮廓仅作虚线参考线，
       主管/支管/立管/阀门/三通/配件一律不挂 clip-path。
       保留反向断言：不得再出现 isoPlotClip / clip-path（防裁剪复活）。 */
{
  iso.clearManual();
  const d = mkData(), original = JSON.stringify(d);
  const svg = iso.renderSVG(d);
  ok(!svg.includes('isoPlotClip') && !svg.includes('<clipPath') && !svg.includes('clip-path='), '地块裁剪已取消（无 isoPlotClip / clip-path）');
  ok(svg.includes('stroke-dasharray="6,4"'), '地块轮廓以虚线参考线保留（可见但不裁剪）');
  /* 总管绘制组（4c）与接入段组（4a）仍须存在 —— 管线完整显示，不因裁剪消失 */
  ok(/<g><path data-tlpipe="front"[^>]*d="[^"]+" fill="none" stroke="#f97316" stroke-width="2.2"/.test(svg), '总管绘制组保留完整（不再被裁）');
  ok(svg.includes('<g fill="none" stroke="#f97316" stroke-width="1.5">'), '总管接入段组保留完整（不再被裁）');
  ok(svg.includes('>P</text>'), '水源符号保留');
  const d2 = mkData(); d2.poly = [];
  const svg2 = iso.renderSVG(d2);
  ok(!svg2.includes('isoPlotClip') && !svg2.includes('stroke-dasharray="6,4"'), '无有效轮廓（poly 空）→ 不画参考线不报错');
  ok(JSON.stringify(d) === original, '取消裁剪不改平面数据');
}

/* 12. 三通第三口绕「宿管中心轴」旋转（2026-09-16 用户口径修正）
   —— 旋转轴 = **该三通所在管道的中心轴**（管道沿 Y 走向 → 绕 Y 轴；沿 X 走向 → 绕 X 轴），
      不是世界 X/Y/Z 三选一。三通两端接管道（贯通杆 = 管轴），第三个口绕管轴扫出。
      自动三通（TEE-F01 总管上 / TEE-B01 主管上）与手工三通（M-T01）共用同一套几何。
      反向契约：未旋转的自动三通渲染不得新增任何图元（等价性基线零差异）。 */
{
  iso.clearManual();
  const d = mkData();
  iso.renderSVG(d);                          /* 建立 viewState.model（自动三通旋转依赖模型） */
  const m = iso.buildModel(d);
  const tf = m.tees.filter(t => t.type === 'front-main')[0];   /* 总管（沿 X）上的自动三通 */
  const tb = m.tees.filter(t => t.type === 'main-branch')[0];  /* 主管（沿 Y）上的自动三通 */

  ok(iso.teeAxisLabel(tf) === '沿 X 轴走向', '总管沿 X 走向 → 旋转轴 = X 轴（实际 ' + iso.teeAxisLabel(tf) + '）');
  ok(iso.teeAxisLabel(tb) === '沿 Y 轴走向', '主管沿 Y 走向 → 旋转轴 = Y 轴（实际 ' + iso.teeAxisLabel(tb) + '）');
  const kx = iso.teeThroughDir(tf), ky = iso.teeThroughDir(tb);
  ok(Math.abs(Math.abs(kx.x) - 1) < 1e-9 && Math.abs(kx.z) < 1e-9, '宿管中心轴（总管）单位向量 = ±X（实测 ' + kx.x.toFixed(3) + ',' + kx.y.toFixed(3) + '）');
  ok(Math.abs(Math.abs(ky.y) - 1) < 1e-9 && Math.abs(ky.z) < 1e-9, '宿管中心轴（主管）单位向量 = ±Y');

  const b0 = iso.teeBranchDir(tb);
  ok(Math.abs(b0.x * ky.x + b0.y * ky.y + b0.z * ky.z) < 1e-9 && Math.abs(b0.z) < 1e-9,
    '未旋转：第三口 ⊥ 管轴且水平（缺省方向）');
  ok(iso.teeBranchSpin(tb.id) === 0, '未旋转：累计转角 = 0');
  ok(iso.fittingInfo(tb.id).axisLabel === '沿 Y 轴走向' && iso.fittingInfo(tb.id).branchSpin === 0,
    'fittingInfo 暴露 axisLabel/branchSpin（供右键菜单显示旋转轴）');

  ok(iso.rotateTee(tb.id, 15) === true, '**自动三通可旋转**（rotateTee 返回 true，旧逻辑 !info.manual 直接拦截 → 功能不可达）');
  const b1 = iso.teeBranchDir(tb);
  ok(iso.teeBranchSpin(tb.id) === 15, '累计转角 = 15°（实际 ' + iso.teeBranchSpin(tb.id) + '）');
  ok(Math.abs(b1.x * ky.x + b1.y * ky.y + b1.z * ky.z) < 1e-9, '旋转后第三口仍严格 ⊥ 管轴（管口不被拧歪）');
  ok(Math.abs(b1.z) > 0.2, '绕 Y 轴转 15° → 出现竖向分量（实测 z=' + b1.z.toFixed(3) + '）');
  const ang = Math.acos(Math.max(-1, Math.min(1, b0.x * b1.x + b0.y * b1.y + b0.z * b1.z))) * 180 / Math.PI;
  ok(Math.abs(ang - 15) < 1e-6, '绕轴实际扫过严格 15°（实测 ' + ang.toFixed(6) + '°）');
  ok(iso.teeBranchDir(tf) !== null, '总管上的自动三通同样可查第三口方向（同一套几何）');

  iso.rotateTee(tb.id, 75);
  const b2 = iso.teeBranchDir(tb);
  ok(Math.abs(Math.abs(b2.z) - 1) < 1e-9 && iso.teeBranchSpin(tb.id) === 90,
    '再转 75°（合计 90°）→ 第三口正竖直（可作上翻立管），实测 z=' + b2.z.toFixed(6));
  ok(JSON.stringify(iso.buildModel(d).tees) === JSON.stringify(m.tees), '旋转不改模型：自动三通逐字节不变（只读红线）');

  const svg = iso.renderSVG(d);
  const seg = (svg.match(new RegExp('<g class="iso-fit" data-fit="' + tb.id + '"[\\s\\S]*?</g>')) || [''])[0];
  ok(seg.indexOf('#16a34a') >= 0, '已旋转的自动三通渲染出「第三口」短杆（支管绿）');
  ok((seg.match(/<path /g) || []).length === 2, '已旋转的自动三通补画 T 形两杆（贯通杆 + 第三口）');
  const segF = (svg.match(new RegExp('<g class="iso-fit" data-fit="' + tf.id + '"[\\s\\S]*?</g>')) || [''])[0];
  ok(segF.indexOf('<path ') < 0 && segF.indexOf('#16a34a') < 0, '反向：未旋转的自动三通不补画任何图元（渲染与改动前逐字节一致）');

  /* 存档往返：旋转覆盖进存档并原样恢复 */
  const saved = iso.exportState();
  ok(saved.state.autoSpin && saved.state.autoSpin[tb.id] && saved.state.autoSpin[tb.id].branchSpin === 90, '旋转覆盖写入存档（autoSpin）');
  iso.resetTeeBranch(tb.id);
  ok(iso.importState(saved, d) === true && iso.teeBranchSpin(tb.id) === 90, '存档恢复后旋转角回到 90°');

  /* 复位 */
  ok(iso.resetTeeBranch(tb.id) === true && iso.teeBranchSpin(tb.id) === 0, '复位：累计转角归零');
  const b3 = iso.teeBranchDir(tb);
  ok(Math.abs(b3.z) < 1e-9 && Math.abs(b3.x - b0.x) < 1e-9 && Math.abs(b3.y - b0.y) < 1e-9, '复位后第三口回到缺省（垂直管轴、水平）');
  const svg3 = iso.renderSVG(d);
  const seg3 = (svg3.match(new RegExp('<g class="iso-fit" data-fit="' + tb.id + '"[\\s\\S]*?</g>')) || [''])[0];
  ok(seg3.indexOf('<path ') < 0, '复位后 T 形消失（渲染回到基线）');

  /* 手工三通：同一套「宿管中心轴」几何 */
  iso.addManual('tee', '110', 'main', 0, { x: 50, y: 30 });
  ok(iso.fittingInfo('M-T01').axisLabel === '沿 Y 轴走向', '手工三通同样按宿管中心轴定轴（主管 → Y 轴）');
  ok(iso.rotateTee('M-T01', 30) === true && iso.teeBranchSpin('M-T01') === 30, '手工三通绕管轴旋转 30°');
  const kk = iso.teeThroughDir(iso.fittingInfo('M-T01'));
  const bb = iso.fittingInfo('M-T01').branchDir;
  ok(bb && Math.abs(bb.x * kk.x + bb.y * kk.y + bb.z * kk.z) < 1e-9, '手工三通旋转后第三口仍 ⊥ 其宿管中心轴');

  /* 12b. 生长管跟随旋转（2026-09-16 用户需求：三通接出的主管方向不对 → 转动它）
     契约：spawnPipeFromTee 的接管记录 teeId 指回宿三通；rotateTee / resetTeeBranch 时
     整根折线绕三通点、绕宿管中心轴**刚体旋转**（管长不变、起点严格回贴三通）。 */
  iso.resetTeeBranch('M-T01');
  const pidG = iso.spawnPipeFromTee('M-T01');
  ok(pidG === 'M-G01', '从分支口接出生长管（M-G01）');
  const pipeRec = () => iso.exportState().state.manual.filter((x) => x.id === pidG)[0];
  const pg0 = pipeRec();
  ok(pg0 && pg0.teeId === 'M-T01' && pg0.pts.length === 2, '生长管记录 teeId（跟随旋转的依据）');
  const CG = { x: 50, y: 30 };
  const vg0 = [pg0.pts[1].x - CG.x, pg0.pts[1].y - CG.y, pg0.pts[1].z - pg0.pts[0].z];
  const beforeUndo = JSON.stringify(iso.exportState());
  iso.rotateTee('M-T01', 90);
  const pg1 = pipeRec();
  const vg1 = [pg1.pts[1].x - CG.x, pg1.pts[1].y - CG.y, pg1.pts[1].z - pg1.pts[0].z];
  const lg0 = Math.hypot(...vg0), lg1 = Math.hypot(...vg1);
  const angG = Math.acos(Math.max(-1, Math.min(1, (vg0[0] * vg1[0] + vg0[1] * vg1[1] + vg0[2] * vg1[2]) / (lg0 * lg1)))) * 180 / Math.PI;
  ok(Math.abs(lg1 - lg0) < 1e-9 && Math.abs(angG - 90) < 1e-6,
    '旋转三通 90° → 接管刚体跟随（长度不变 ' + lg0.toFixed(3) + '=' + lg1.toFixed(3) + '，向量夹角恰 90°）');
  ok(pg1.pts[0].x === CG.x && pg1.pts[0].y === CG.y && pg1.pts[0].z === pg0.pts[0].z, '接管起点严格回贴三通点');
  ok(Math.abs(Math.abs(vg1[2]) - lg1) < 1e-9, '转 90° 后接管竖直（立管方向，实测 z=' + vg1[2].toFixed(6) + '）');
  iso.undoEdit();
  ok(JSON.stringify(iso.exportState()) === beforeUndo, 'undo 回滚旋转（checkpoint 在改动前，含接管跟随）');
  iso.rotateTee('M-T01', 90);
  iso.resetTeeBranch('M-T01');
  const pg2 = pipeRec();
  ok(Math.abs(pg2.pts[1].x - pg0.pts[1].x) < 1e-9 && Math.abs(pg2.pts[1].y - pg0.pts[1].y) < 1e-9 && Math.abs(pg2.pts[1].z - pg0.pts[1].z) < 1e-9,
    '复位 → 接管回到原方向（末端逐点一致）');

  /* 异常参数 */
  ok(iso.rotateTee('NOPE-99', 15) === false, '未知 id 旋转返回 false');
  ok(iso.rotateTee('TEE-B01', 0) === false, '0° 旋转返回 false（无操作）');
  ok(iso.rotateTee('TEE-B01', NaN) === false, '非数角度返回 false');
  ok(iso.resetTeeBranch('TEE-B01') === true, '复位未旋转过的三通也返回 true（幂等）');
}

console.log('\n== 结论：PASS=' + pass + ' FAIL=' + fail + ' ==');
process.exit(fail ? 1 : 0);
