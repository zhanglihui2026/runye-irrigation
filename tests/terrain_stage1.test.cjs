/* ============================================================
   terrain_stage1.test.cjs — 地形模块阶段1 纯函数冒烟测试 + 注入体检
   纪律（用户记忆 2026-09 系列）：每个断言必须有「能变红」的反例；
   解析器必须对坏数据精确报错（注入缺陷 → 断言 error 路径命中）。
   运行：node tests/terrain_stage1.test.cjs
   ============================================================ */
'use strict';
const path = require('path');
const core = require(path.join(__dirname, '..', 'terrain', 'terrain-core.js'));

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name); }
}

/* ---------- 1. 面积 ---------- */
console.log('[1] 面积（正例 + 退化反例）');
const rect = [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 200 }, { x: 0, y: 200 }];
ok(Math.abs(core.polygonAreaM2(rect) - 60000) < 1e-6, '矩形 300x200 = 60000 ㎡');
ok(core.polygonAreaM2([...rect].reverse()) === 60000, '逆时针同样 60000（方向无关）');
ok(core.polygonAreaM2(rect.slice(0, 2)) === 0, '反例：2 点 → 0');
ok(core.polygonAreaM2([{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 200, y: 200 }]) === 0, '反例：共线 → 0');
ok(core.polygonAreaM2([{ x: NaN, y: 0 }, { x: 300, y: 0 }, { x: 0, y: 200 }]) === 0, '反例：NaN → 0（不抛异常）');
ok(core.sqmToMu(666.67) === 1, '666.67 ㎡ = 1 亩');
ok(core.sqmToMu(1333.34) === 2, '1333.34 ㎡ = 2 亩');
const twoPlots = [{ poly: rect }, { poly: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }] }, { poly: [], level: 2 }];
ok(core.plotsTotalAreaM2(twoPlots) === 70000, '多子多边形汇总 60000+10000（空环不计）= 70000，level 字段不影响');

/* ---------- 2. 坐标系 ---------- */
console.log('[2] CGCS2000 识别（prj 精确 + 启发式，含反例）');
ok(core.parsePRJ('GEOGCS["CGCS2000",DATUM["China_Geodetic_Coordinate_System_2000"...]]').cs === 'CGCS2000', 'prj 含 CGCS2000 → 命中');
ok(core.parsePRJ('PROJCS["CGCS2000 / 3-degree Gauss-Kruger CM 111E",GEOGCS["GCS_China_Geodetic_Coordinate_System_2000"...').cs === 'CGCS2000', 'prj 投影坐标系含 CGCS2000 → 命中');
ok(core.parsePRJ('GEOGCS["WGS 1984"...]').cs === 'WGS84', 'prj WGS84 → 命中（非 CGCS2000）');
ok(core.parsePRJ('GEOGCS["GCS_Xian_1980"...]').cs === 'unknown-plane' && /西安/.test(core.parsePRJ('GEOGCS["GCS_Xian_1980"...]').warn), '反例：西安-1980 → 非 CGCS2000 且有告警');
ok(core.parsePRJ('').cs === 'unknown', '反例：空 prj → unknown');
ok(core.parsePRJ('PROJCS["SomeRandomCRS"]').cs === 'unknown', '反例：陌生 prj → unknown');
ok(core.heuristicCS([{ x: 512345.6, y: 3546789.2 }, { x: 512360, y: 3546801 }]).cs === 'unknown-plane', '启发式：米级平面坐标 → 疑似 CGCS2000 投影');
ok(core.heuristicCS([{ x: 111.5, y: 34.2 }, { x: 111.6, y: 34.3 }]).cs === 'lonlat', '反例：经纬度 → lonlat（必须告警锁面积）');
ok(core.heuristicCS([{ x: 5, y: 6 }]).cs === 'lonlat', '反例：异常小数值 → 保守判 lonlat（锁面积 + 提示投影，安全侧）');
const d = core.detectCoordSystem(null, [{ x: 512345.6, y: 3546789.2 }]);
ok(d.cs === 'unknown-plane' && d.confidence === 'medium', '无 prj 时走启发式，置信度 medium（提示核实）');
ok(core.detectCoordSystem('GEOGCS["CGCS2000"...]').confidence === 'high', '有 prj 时 prj 优先，置信度 high');

/* ---------- 3. CSV ---------- */
console.log('[3] CSV 解析（多分隔符/表头/坏行，含反例）');
const c1 = core.parseCSV('X,Y,Z\r\n512345.6,3546789.2,89.5\r\n512360.1,3546801.5,89.7\r\n512372.8,3546795.0,89.6\r\n');
ok(c1.ok && c1.points.length === 3 && c1.hasZ && c1.skippedRows === 1, '表头 + 逗号 + CRLF → 3 点带 Z');
const c2 = core.parseCSV('512345.6;3546789.2\n512360.1;3546801.5\n512372.8;3546795.0\n');
ok(c2.ok && c2.points.length === 3 && !c2.hasZ, '分号分隔、无表头 → 3 点无 Z');
const c3 = core.parseCSV('X\tY\tZ\n1\t2\t3\n4\t5\t6\n7\t8\t9\n');
ok(c3.ok && c3.hasZ, 'Tab 分隔 → 正常');
const c4 = core.parseCSV('X,Y\nabc,def\n1,2\n3,4\n5,6');
ok(c4.ok && c4.points.length === 3 && c4.skippedRows === 2, '坏行(字母)+表头被跳过 → 3 有效点');
const c5 = core.parseCSV('X,Y,Z\n1,2,10\n2,3,11\n3,4,12\n4,5,13\n5,6,14\n6,7,15\n7,8,16\n8,9,17\n9,10,18\n10,11,19\n11,12,20\n12,13,21\n13,14,22\n14,15,23\n15,16,24\n16,17,25\n17,18,26\n18,19,27\n19,20,28\n20,21,');
ok(c5.ok && c5.hasZ && c5.missingZRows === 1 && c5.zCount === 19, 'RTK 零星缺 Z（1/20）→ 保留有效点并报告缺失');
ok(!core.parseCSV('X,Y\n1,2\n3,4').ok, '反例：有效行不足 3 → error');
ok(!core.parseCSV('').ok, '反例：空文件 → error');
ok(!core.parseCSV('a;b;c\nd;e;f\ng;h;i').ok, '反例：全字母 → error');

/* ---------- 4. shp 二进制（手工构造 + 注入缺陷） ---------- */
console.log('[4] shp 解析（构造二进制正例 + 注入缺陷反例）');
function buildSHP(shapeType, numPoints, pts) {
  const recBody = [];
  recBody.push(Buffer.from([shapeType, 0, 0, 0]));              // type (LE)
  const box = Buffer.alloc(32); box.writeDoubleLE(0, 0); recBody.push(box);
  const parts = Buffer.alloc(8);
  parts.writeInt32LE(1, 0); parts.writeInt32LE(numPoints, 4);
  recBody.push(parts);
  recBody.push(Buffer.from([0, 0, 0, 0]));                       // parts[0]=0
  const pb = Buffer.alloc(numPoints * 16);
  pts.forEach((p, i) => { pb.writeDoubleLE(p.x, i * 16); pb.writeDoubleLE(p.y, i * 16 + 8); });
  recBody.push(pb);
  if (shapeType === 15) {                                        // PolygonZ: Zbox + Zs
    recBody.push(Buffer.alloc(16));
    const zb = Buffer.alloc(numPoints * 8);
    pts.forEach((p, i) => zb.writeDoubleLE(90 + i, i * 8));
    recBody.push(zb);
  }
  const body = Buffer.concat(recBody);
  const head = Buffer.alloc(100);
  head.writeInt32BE(9994, 0);
  head.writeInt32BE((100 + body.length + 8) / 2, 24);
  head.writeInt32LE(shapeType, 32);
  const rh = Buffer.alloc(8);
  rh.writeInt32BE(1, 0); rh.writeInt32BE(body.length / 2, 4);
  return Buffer.concat([head, rh, body]);
}
const sqPts = [{ x: 512345.6, y: 3546789.2 }, { x: 512360.1, y: 3546789.2 }, { x: 512360.1, y: 3546801.5 }, { x: 512345.6, y: 3546801.5 }];
const r5 = core.parseSHP(buildSHP(5, 4, sqPts).buffer.slice(buildSHP(5, 4, sqPts).byteOffset, buildSHP(5, 4, sqPts).byteOffset + buildSHP(5, 4, sqPts).byteLength));
ok(r5.ok && r5.features.length === 1, 'type=5 Polygon → 1 要素');
ok(r5.ok && Math.abs(r5.features[0].areaM2 - (14.5 * 12.3)) < 1, '面积 ≈ 14.5m × 12.3m（平方英尺级矩形，米坐标口径）');
const rz = core.parseSHP(buildSHP(15, 4, sqPts).buffer.slice(buildSHP(15, 4, sqPts).byteOffset, buildSHP(15, 4, sqPts).byteOffset + buildSHP(15, 4, sqPts).byteLength));
ok(rz.ok && rz.features[0].zHint != null && Math.abs(rz.features[0].zHint - 90) < 1e-9, 'type=15 PolygonZ → zHint 读出首点 Z');
ok(!core.parseSHP(Buffer.alloc(50)).ok, '反例：文件过短 → error');
ok(!core.parseSHP(buildSHP(1, 1, [{ x: 1, y: 2 }]).buffer.slice(0)).ok, '反例：type=1（点要素）→ error「只支持面要素」');
const badHead = buildSHP(5, 4, sqPts); badHead.writeInt32BE(9993, 0);
ok(!core.parseSHP(badHead.buffer.slice(badHead.byteOffset)).ok, '反例：魔数 9993 → error');
/* 注入缺陷：环点数 < 3 → 结构异常必须被拦 */
ok(!core.parseSHP(buildSHP(5, 2, sqPts.slice(0, 2)).buffer.slice(0)).ok, '注入缺陷：numPoints=2 → error（环太短拦截）');

/* ---------- 5. 高程接口层 ---------- */
console.log('[5] 高程统一接口（契约字段 + DSM 防护反例）');
const cls1 = core.classifyElevFile('RTK点位2026.csv');
ok(cls1.ok && cls1.data_type === 'rtk_xyz' && cls1.previewOnly === false, '.csv → rtk_xyz，可用于工程');
const cls2 = core.classifyElevFile('site_dtm.tif');
ok(cls2.ok && cls2.data_type === 'dtm_raster', '文件名含 dtm → dtm_raster');
const cls3 = core.classifyElevFile('site_dsm.tif');
ok(cls3.ok && cls3.data_type === 'dsm_raster' && cls3.previewOnly === true, '文件名含 dsm → DSM 仅预览');
const cls4 = core.classifyElevFile('result.tif');
ok(cls4.ok && cls4.needConfirm === true, '反例：无名可辨 tif → needConfirm 人工确认');
ok(!core.classifyElevFile('boundary.shp').ok, '反例：.shp 不是高程文件 → error');
const rec1 = core.buildElevRecord({ data_type: 'rtk_xyz', point_list: Array.from({ length: 100 }, (_, i) => ({ x: i, y: i, z: i })), coverage_area_m2: 10000, file_name: 'a.csv' });
ok(rec1.ok && rec1.record.confidence === 'high', 'RTK 100 点且覆盖密度足够 → 置信度 high');
const rec2 = core.buildElevRecord({ data_type: 'rtk_xyz', point_list: [{ x: 1, y: 2, z: 3 }], file_name: 'b.csv' });
ok(rec2.ok && rec2.record.confidence === 'low', '反例：RTK 1 点 → 低置信度');
const recSparse = core.buildElevRecord({ data_type: 'rtk_xyz', point_list: Array.from({ length: 25 }, (_, i) => ({ x: i, y: i, z: i })), coverage_area_m2: 100000, file_name: 'sparse.csv' });
ok(recSparse.ok && recSparse.record.confidence === 'medium', '反例：25 点覆盖 10 ha → 不高估为高置信度');
const cleaned = core.filterElevationOutliers([{x:0,y:0,z:100},{x:1,y:0,z:101},{x:2,y:0,z:99},{x:3,y:0,z:100},{x:4,y:0,z:102},{x:5,y:0,z:101},{x:6,y:0,z:100},{x:7,y:0,z:999}]);
ok(cleaned.removed === 1 && cleaned.points.length === 7, 'RTK 明显飞点（999m）→ 保守剔除');
const rec3 = core.buildElevRecord({ data_type: 'dsm_raster', point_list: [], file_name: 'd.tif' });
ok(rec3.ok && rec3.record.confidence === 'low' && rec3.record.meta.preview_only === true, 'DSM → 置信度强制 low + previewOnly');
/* 契约字段完整性（用户给定 JSON 契约） */
ok(['data_type', 'point_list', 'raster_info', 'boundary_constraint', 'confidence'].every(k => k in rec1.record), '输出结构含全部契约字段 {data_type,point_list,raster_info,boundary_constraint,confidence}');
ok(core.sampleAlongPath([{ x: 0, y: 0 }, { x: 1, y: 1 }], 5) === null, '无高程数据时 sampleAlongPath → null 降级');
ok(!core.buildElevRecord({ data_type: 'xxx' }).ok, '反例：未知类型 → error');

/* ---------- 6. 存储层（mock localStorage） ---------- */
console.log('[6] 存储层（抽样降级反例）');
const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};
const big = Array.from({ length: 12000 }, (_, i) => ({ x: i, y: i, z: 1 }));
const rs = core.buildElevRecord({ data_type: 'rtk_xyz', point_list: big, file_name: 'big.csv' });
const st1 = { plots: [], elevations: [rs.record], mode: 'engineering' };
ok(core.saveState(st1).ok, 'saveState 正常');
const back = core.loadState();
ok(back.elevations[0].point_list.length <= 5000 && back.elevations[0].meta.thinned === true, `反例注入：12000 点 → 持久化抽样至 ${back.elevations[0].point_list.length} ≤5000 并标记 thinned`);
ok(back.mode === 'engineering', '模式持久化往返一致');
ok(core.loadState.call({}) && core.loadState().mode === 'engineering', 'loadState 读回一致');

/* ---------- 5b. 在线地图回传：经纬度→局部米制投影 ---------- */
console.log('[5b] lonlatToLocalMeters（地图回传链路，含反例）');
const ll1 = core.lonlatToLocalMeters([{ lat: 34.0, lng: 111.0 }, { lat: 34.001, lng: 111.0 }, { lat: 34.001, lng: 111.001 }, { lat: 34.0, lng: 111.001 }]);
ok(ll1.ok && Math.abs(ll1.points[1].y - 111.32) < 0.5, '纬差 0.001° ≈ 111.32m（子午线弧长）');
ok(ll1.ok && ll1.points[0].x === 0 && ll1.points[0].y === 0, '首点为原点 (0,0)');
const expX = 111.32 * Math.cos(34.0 * Math.PI / 180); /* ≈ 92.28m */
ok(ll1.ok && Math.abs(ll1.points[2].x - expX) < 0.5, '经差按 cos(lat0) 收缩（≈' + expX.toFixed(2) + 'm）');
const llArea = core.polygonAreaM2(ll1.points);
ok(Math.abs(llArea - 111.32 * expX) / (111.32 * expX) < 1e-3, '投影后鞋带面积 = 111.32×92.28 ≈ 10273㎡（实测 ' + Math.round(llArea) + '，与地图球面口径一致）');
const ll2 = core.lonlatToLocalMeters([{ lat: 34, lng: 111 }, { lat: 34.001, lng: 111.001 }]);
ok(!ll2.ok, '反例：环点数 <3 → error');
ok(!core.lonlatToLocalMeters([{ lat: 34, lng: 111 }, { lat: NaN, lng: 111 }, { lat: 34.1, lng: 111.1 }]).ok, '反例：NaN 点 → error');
ok(!core.lonlatToLocalMeters('bad').ok, '反例：非数组 → error');
const ll3 = core.lonlatToLocalMeters([[34.0, 111.0], [34.001, 111.0], [34.001, 111.001]]);
ok(ll3.ok && Math.abs(ll3.points[1].y - 111.32) < 0.5, '兼容 [lat,lng] 数组格式');

/* ---------- 5c. 山地喷灌估算（调研参数校验 + 反例） ---------- */
console.log('[5c] sprinklerEstimate（正例手算 + 注入反例）');
const base = { range_m: 15, flow_m3h: 2.5, pressure_kpa: 300, layout: 'tri', spacing_k: 1.0,
               heads_per_shift: 12, soil: 'loam', slope_deg: 8, etc_mm: 4.5, eta: 0.7 };
const s1 = core.sprinklerEstimate(base, 60000);
ok(s1.ok && Math.abs(s1.spacing - 15) < 1e-9, 'k=1.0 → 间距 = R = 15m');
ok(s1.ok && Math.abs(s1.rowSpacing - 15 * Math.sqrt(3) / 2) < 1e-9, '三角形行距 = 0.866S');
ok(s1.ok && s1.headArea > 0 && Math.abs(s1.headArea - 15 * 12.99) < 0.5, '单喷头控制面积 = S×行距 ≈ 194.9㎡');
ok(s1.ok && s1.headCount === Math.ceil(60000 / s1.headArea), '喷头数 = ceil(面积/单控)');
ok(s1.ok && s1.shiftCount === Math.ceil(s1.headCount / 12), '轮灌组数 = ceil(总数/同时工作)');
ok(s1.ok && Math.abs(s1.systemFlow - 12 * 2.5) < 1e-9, '系统流量 = 同时工作 × q');
/* 组合强度（v298 P0-1 修正）：ρ = 1000q/headArea = 1000×2.5/(15×12.990) ≈ 12.83 mm/h > 壤土12 → 超标
   （旧公式分母 πR²=706.9 → 3.54 漏判；headArea 含三角形重叠修正） */
ok(s1.ok && Math.abs(s1.precipRate - 1000 * 2.5 / (15 * 15 * Math.sqrt(3) / 2)) < 1e-9 && !s1.precipOk && s1.warn.some(w => /超过/.test(w)),
   'P0-1：组合强度 12.83（headArea 分母）> 壤土12 → 正确判超标（旧公式 3.54 漏判）');
ok(s1.precipRate > 1000 * 2.5 / (Math.PI * 225), 'P0-1：新分母下强度恒大于旧 πR² 公式（headArea < πR² 当 k<1.77）');
/* 注入：流量放大 10 倍 → 强度 35.4 超标，且坡度 10°（>8°）允许值降档 12→10 */
const s2 = core.sprinklerEstimate(Object.assign({}, base, { flow_m3h: 25, slope_deg: 10 }), 60000);
ok(s2.ok && !s2.precipOk && s2.precipAllow === 10 && s2.warn.some(w => /超过/.test(w)), '注入缺陷：q×10 → 强度超标 + 坡地(10°)允许值降档(12→10)');
/* 坡度警告：15° 以上 */
const s3 = core.sprinklerEstimate(Object.assign({}, base, { slope_deg: 18 }), 60000);
ok(s3.ok && s3.warn.some(w => /15°/.test(w)), '坡度 18° → 触发 15° 警告');
/* 方形布置：行距 = S */
const s4 = core.sprinklerEstimate(Object.assign({}, base, { layout: 'square' }), 60000);
ok(s4.ok && Math.abs(s4.rowSpacing - s4.spacing) < 1e-9, '方形行距 = S');
/* 日灌水时长：ETc/(η×1000Q/A) = 4.5/(0.7×1000×30/60000) = 12.86h */
ok(s1.ok && s1.dailyHours != null && Math.abs(s1.dailyHours - 4.5 / (0.7 * 1000 * 30 / 60000)) < 0.01, '日喷洒时长公式校验（≈12.9h）');
/* 反例 */
ok(!core.sprinklerEstimate(Object.assign({}, base, { range_m: 0 }), 60000).ok, '反例：射程 ≤0 → error');
ok(!core.sprinklerEstimate(base, 0).ok, '反例：面积 0 → error（提示先导地块）');
ok(!core.sprinklerEstimate({}, 60000).ok, '反例：空参数 → error');
/* 间距系数越界夹回 */
const s5 = core.sprinklerEstimate(Object.assign({}, base, { spacing_k: 5 }), 60000);
ok(s5.ok && s5.warn.some(w => /夹回/.test(w)), '间距系数 5 → 夹回 1.6 并告警');
const s6 = core.sprinklerEstimate(Object.assign({}, base, { source_flow_m3h: 20 }), 60000);
ok(s6.ok && s6.sourceFlowOk === false && s6.warn.some(w => /水源可用流量/.test(w)), '水源 20 m³/h < 当前组 30 m³/h → 明确告警');
const s7 = core.sprinklerEstimate(Object.assign({}, base, { rated_flow_m3h: 2.5, rated_pressure_kpa: 300 }), 60000);
ok(s7.ok && s7.nozzleOk === true && Math.abs(s7.expectedFlow - 2.5) < 1e-9, '铭牌 q/P 与输入一致 → 喷嘴曲线校核通过');
const s8 = core.sprinklerEstimate(Object.assign({}, base, { rated_flow_m3h: 1, rated_pressure_kpa: 300 }), 60000);
ok(s8.ok && s8.nozzleOk === false && s8.warn.some(w => /喷嘴额定曲线/.test(w)), '铭牌 q/P 不一致 → 喷嘴曲线校核告警');

/* ---------- [5f] sanitizeRing 环预处理（v298 P0-2） ---------- */
console.log('[5f] sanitizeRing（正例手算 + 注入反例）');
/* 相邻重复点 + 首尾闭合重复 */
const dupRing = [{x:0,y:0},{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100},{x:0,y:0}];
const sd = core.sanitizeRing(dupRing);
ok(sd.ok && sd.pts.length === 4 && sd.removedDups === 2, '相邻重复+闭合重复 → 4 点（去 2）');
ok(sd.ok && Math.abs(core.polygonAreaM2(sd.pts) - 10000) < 1e-6, '去重后面积正确 10000');
ok(sd.warn.some(w => /去重/.test(w)), '去重触发告警');
/* 「8」字形（蝶形自交）：shoelace 面积恒 0，必须告警标记 */
const bow = core.sanitizeRing([{x:0,y:0},{x:100,y:100},{x:100,y:0},{x:0,y:100}]);
ok(bow.ok && bow.selfInt >= 1 && bow.warn.some(w => /自交/.test(w)), '「8」字自交 → 检测并告警（面积失真标记不静默）');
ok(Math.abs(core.polygonAreaM2(bow.pts)) < 1e-9, '反例佐证：蝶形 shoelace 面积 = 0（为何必须告警）');
/* 正常凸环：零告警 */
const clean = core.sanitizeRing([{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100}]);
ok(clean.ok && clean.warn.length === 0 && clean.selfInt === 0, '正常凸环零告警');
/* 回形（首尾闭合重复 2 点） */
const loop = core.sanitizeRing([{x:0,y:0},{x:50,y:0},{x:50,y:50},{x:0,y:50},{x:0,y:0},{x:0,y:0}]);
ok(loop.ok && loop.pts.length === 4, '回形闭合重复 → 4 点');
/* 离群点过滤（可选启用） */
const out1 = core.sanitizeRing([{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100},{x:100000,y:100000}], { outlierK: 3 });
ok(out1.ok && out1.removedOutliers === 1 && out1.pts.length === 4, 'outlierK=3 → 剔除 1 个离群点');
ok(core.polygonAreaM2(out1.pts) > 0 && Math.abs(core.polygonAreaM2(out1.pts) - 10000) < 1, '剔除后面积回归 10000（不离群时面积被拉爆）');
const out0 = core.sanitizeRing([{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100},{x:100000,y:100000}]);
ok(out0.ok && out0.removedOutliers === 0, '默认不启用离群过滤（保留原状）');
/* 反例 */
ok(core.sanitizeRing([{x:0,y:0},{x:1,y:1}]).ok === false, '反例：2 点 → error');
ok(core.sanitizeRing([{x:0,y:0},{x:0,y:0},{x:0,y:0}]).ok === false, '反例：全重复退化 → 去重后不足 3 → error');
ok(core.sanitizeRing([{x:0,y:0},{x:NaN,y:1},{x:2,y:2}]).ok === false, '反例：NaN 坐标 → error');

/* ---------- [5g] sampleAlongPath 沿管线高程采样（v298 P1-4） ---------- */
console.log('[5g] sampleAlongPath（Delaunay 线性插值 + IDW 兜底）');
const FLAT = [{x:0,y:0,z:10},{x:100,y:0,z:10},{x:100,y:100,z:10},{x:0,y:100,z:10}];
const flat = core.sampleAlongPath([{x:20,y:20},{x:80,y:80}], 20, FLAT);
ok(Array.isArray(flat) && flat.length === Math.floor(Math.hypot(60,60)/20)+1, '平面场：采样点数 = floor(折线长/step)+1（' + (flat && flat.length) + '）');
ok(flat && flat.every(p => Math.abs(p.z - 10) < 1e-6), '平面场：每点 z 精确 = 10（线性插值零误差）');
ok(flat && flat.every(p => isFinite(p.x) && isFinite(p.y) && isFinite(p.z)), '采样点结构 {x,y,z} 完整');
/* 斜坡 z=0.1x：底边 x=50 → z=5 */
const SLOPE = [{x:0,y:0,z:0},{x:100,y:0,z:10},{x:100,y:100,z:10},{x:0,y:100,z:0}];
const sl = core.sampleAlongPath([{x:0,y:0},{x:100,y:0}], 25, SLOPE);
ok(sl && sl.length === 5 && Math.abs(sl[2].z - 5) < 0.01, '斜坡 z=0.1x：底边中点插值 z=5±0.01（实际 ' + (sl && sl[2].z.toFixed(3)) + '）');
ok(sl && Math.abs(sl[0].z - 0) < 1e-9 && Math.abs(sl[4].z - 10) < 1e-9, '端点 z 精确落在点云值（0 与 10）');
/* 采样点恰在点云位置 → 精确取该点 z（IDW d=0 路径） */
const at = core.sampleAlongPath([{x:0,y:0},{x:100,y:0}], 100, SLOPE);
ok(at && at.length === 2 && Math.abs(at[1].z - 10) < 1e-9, '采样点与点云重合 → z 精确（d=0 直取）');
/* 凸包外 → IDW 兜底仍返回有限值 */
const out2 = core.sampleAlongPath([{x:-50,y:50},{x:150,y:50}], 50, SLOPE);
ok(out2 && out2.every(p => isFinite(p.z) && p.z > -1 && p.z < 11), '凸包外采样 → IDW 兜底返回有限值（不 null 不爆）');
/* 共线点云 → Delaunay 退化 → IDW 兜底 */
const COL = [{x:0,y:0,z:5},{x:50,y:0,z:5},{x:100,y:0,z:5}];
const col = core.sampleAlongPath([{x:25,y:0},{x:75,y:0}], 25, COL);
ok(col && col.every(p => Math.abs(p.z - 5) < 0.5), '共线点云（Delaunay 退化）→ IDW 兜底 z≈5');
/* 降级路径（契约保持） */
ok(core.sampleAlongPath([{x:0,y:0},{x:1,y:1}], 5) === null, '无第三参（无高程数据）→ null 降级');
ok(core.sampleAlongPath([{x:0,y:0},{x:1,y:1}], 5, []) === null, '空点云 → null');
ok(core.sampleAlongPath([{x:0,y:0,z:1}], 5, SLOPE) === null, '反例：管线仅 1 点 → null');
ok(core.sampleAlongPath([{x:0,y:0},{x:1,y:1}], 0, SLOPE) === null, '反例：step=0 → null');
ok(core.sampleAlongPath([{x:0,y:0},{x:1,y:1}], 5, [{x:0,y:0,z:1},{x:1,y:1,z:2}]) === null, '反例：高程点 <3 → null');

/* ---------- [5h] surfaceAreaApprox 地表斜面面积近似（v298 P1-5） ---------- */
console.log('[5h] surfaceAreaApprox（最小二乘平面拟合坡度）');
/* 斜坡 z = 0.1x（坡度 atan(0.1)=5.711°）9 点网格覆盖 100x100 */
const G9 = [];
for (let gx = 0; gx <= 2; gx++) for (let gy = 0; gy <= 2; gy++)
  G9.push({ x: gx * 50, y: gy * 50, z: 0.1 * gx * 50 });
const sa1 = core.surfaceAreaApprox(10000, G9);
ok(sa1.ok && Math.abs(sa1.slopeDeg - 5.7106) < 0.01, '拟合坡度 = atan(0.1) = 5.711°（实际 ' + sa1.slopeDeg.toFixed(4) + '）');
ok(sa1.ok && Math.abs(sa1.surfSqm - 10000 / Math.cos(5.7106 * Math.PI / 180)) < 0.1, '表面积 = 水平/cos(坡度) ≈ 10050.9（实际 ' + sa1.surfSqm.toFixed(1) + '）');
ok(sa1.ok && sa1.surfSqm >= 10000, '不变量：表面积 ≥ 水平投影（cos ≤ 1）');
/* 水平面 z=10：坡度 0 → 表面积 = 水平 */
const FLAT9 = G9.map(p => ({ x: p.x, y: p.y, z: 10 }));
const sa2 = core.surfaceAreaApprox(10000, FLAT9);
ok(sa2.ok && Math.abs(sa2.slopeDeg) < 1e-6 && Math.abs(sa2.surfSqm - 10000) < 1e-6, '水平面：坡度 0、表面积 = 水平投影');
/* 反例 */
ok(core.surfaceAreaApprox(10000, G9.slice(0, 2)).ok === false, '反例：高程点 <3 → error');
ok(core.surfaceAreaApprox(10000, [{x:0,y:0,z:1},{x:50,y:0,z:2},{x:100,y:0,z:3}]).ok === false, '反例：共线点云 → 拟合退化 error');
ok(core.surfaceAreaApprox(0, G9).ok === false, '反例：水平面积 0 → error');
ok(core.surfaceAreaApprox(10000) === undefined || core.surfaceAreaApprox(10000) === null || (core.surfaceAreaApprox(10000) && core.surfaceAreaApprox(10000).ok === false), '反例：未传点云 → 不产生有效结果');

/* [v298 探针回归] 真实 CGCS2000 量纲坐标（~1e6 m）：未中心化正规方程曾因
   灾难性相消误判「退化」——小坐标样本测不出，必须用真实量纲锁定该回归 */
(function () {
  var ptsCG = [];
  for (var ix = 0; ix < 5; ix++)
    for (var iy = 0; iy < 5; iy++) {
      var X = 512300 + ix * 25, Y = 3546700 + iy * 25;
      ptsCG.push({ x: X, y: Y, z: 0.1 * (X - 512300) });
    }
  var rCG = core.surfaceAreaApprox(10000, ptsCG);
  ok(rCG && rCG.ok === true, '真实量纲坐标：5×5 网格不被误判退化');
  ok(rCG && Math.abs(rCG.slopeDeg - 5.7106) < 0.01, '真实量纲坐标：坡度仍 = 5.711°（实际 ' + (rCG && rCG.slopeDeg.toFixed(4)) + '）');
  ok(rCG && Math.abs(rCG.surfSqm - 10049.9) < 1, '真实量纲坐标：表面积 ≈ 10049.9（实际 ' + (rCG && rCG.surfSqm.toFixed(1)) + '）');
})();

console.log('\n===== terrain stage1: PASS=' + pass + ' FAIL=' + fail + ' =====');
process.exitCode = fail ? 1 : 0;
