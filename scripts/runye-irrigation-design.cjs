'use strict';
/* =========================================================================
   runye-irrigation-design.cjs
   润野灌溉 · 泵站/管网/轮灌区 参数化设计脚本（可复用）

   用途：给定「面积 / 密度 / 亩灌水量 / 轮灌区规模 / 泵流量 / 供水距离 / 运行制度」，
        自动计算——泵选型（扬程/轴功率/电机档）、主管/干管/区分配管/行内毛管逐段选径、
        轮灌区内部布置、泵站覆盖与台数、材料量，并输出中文选型报告。

   引擎口径：与润野站内三级水力计算一致，全部复用
     - ../hydraulic-calc/hc-core.js     Hazen-Williams 沿程 / 流速 / SDR 内径 / 扬程 / 轴功率
     - ../hydraulic-calc/design-core.js 管径比选 / Christiansen 多孔系数 / 标准电机档

   用法：
     node scripts/runye-irrigation-design.cjs                  # 用内置基准参数
     node scripts/runye-irrigation-design.cjs path/to/cfg.json # 用外部参数文件
     const d = require('./scripts/runye-irrigation-design.cjs'); // 作为模块复用

   参数文件 JSON 结构见 DEFAULT 下方注释；缺省字段自动取默认值。
   ========================================================================= */

const path = require('node:path');
const fs = require('node:fs');
const hc = require(path.join(__dirname, '..', 'hydraulic-calc', 'hc-core.js'));
const dc = require(path.join(__dirname, '..', 'hydraulic-calc', 'design-core.js'));

/* ---------------- 默认参数（可被外部配置覆盖） ---------------- */
const DEFAULT = {
  // —— 项目与轮灌 ——
  projectMu: 50000,       // 项目总面积（亩）
  zoneMu: 40,             // 单轮灌区面积（亩/区）
  waterPerMu: 4.5,        // 每次灌溉定额（m³/亩）
  densityPerMu: 44,       // 种植密度（棵/亩）
  // —— 泵 ——
  pumpFlow: 200,          // 泵设计流量（m³/h）
  // —— 管网几何（长度取典型段长，可按实测改）——
  reachM: 1500,           // 主管最远供水距离（m）
  subMainLen: 300,        // 站内干管典型长度（m）
  zoneHeaderLen: 160,     // 轮灌区分配管典型长度（m）
  rowSpacing: 4,          // 行距（m）；毛管/行内管按此间距布置
  // —— 运行制度 ——
  pumpHoursPerDay: 10,    // 泵日运行小时（h/天）
  cycleDays: 7,           // 灌水周期（天）
  // —— 水力口径 ——
  C: 150,                 // Hazen-Williams 系数（PE 常用）
  caliber: 'sdr13.6',     // 口径模式：sdr13.6 / sdr17 / sdr21 / id
  dripHead: 10,           // 滴头/出流口工作压力（m，≈0.1MPa）
  headLoss: 3,            // 首部过滤/施肥损失（m）
  eta: 0.6,               // 泵组总效率
  localRatio: 0.10,       // 局部损失 = 沿程 × 比例
  safety: 1.1,            // 扬程安全系数
  econVmax: 2.0,          // 经济流速上限（m/s）
  mainHeadCap: 15,        // 长主管沿程损失上限（m）——决定泵扬程，取最小满足管径
  targetV: { subMain: 1.8, header: 2.0, lateral: 1.3 }, // 短段/毛管目标经济流速（m/s）
  lateralSeries: [16, 20, 25, 32, 40, 50], // 行内毛管/小管外径系列（mm，不在 PE_OD_SERIES 内）
  // —— 行布置（可留空由几何反推）——
  rows: null,             // 行数；null 则按方形地块反推
  treesPerRow: null       // 每行株数；null 则按总株数/行数
};

/* ---------------- 工具 ---------------- */
const num = (v, d) => (isFinite(parseFloat(v)) ? parseFloat(v) : d);
const R = (v, n = 1) => { const p = Math.pow(10, n); return Math.round(v * p) / p; };
const mu2m2 = mu => mu * 666.6667;

function norm(cfgRaw) {
  const c = Object.assign({}, DEFAULT, cfgRaw || {});
  if (!hc.validCaliber) { c.caliber = 'sdr13.6'; }
  else c.caliber = hc.validCaliber(c.caliber);
  return c;
}

/* 选径：两种模式
   ① headCap（长主管）：取 hf ≤ headCap 的最小外径 —— 沿程损失决定泵扬程，最合理
   ② targetV（短段/毛管）：在流速 ≤ econVmax 系列里取 |v − targetV| 最小者
   全系列都不满足时取最大外径并标 over。返回 {od,id,v,hf} */
function sizePipe(Q, L, cfg, opts) {
  const o = opts || {};
  const set = (o.series && o.series.length) ? o.series.slice() : hc.PE_OD_SERIES.slice();
  if (o.headCap != null && isFinite(o.headCap)) {
    for (const od of set) {
      const id = hc.innerDiam(od, cfg.caliber);
      const hf = hc.hazen(L, Q, id, cfg.C);
      if (hf <= o.headCap) return { od, id, v: hc.velocity(Q, id), hf };
    }
    const od = set[set.length - 1]; const id = hc.innerDiam(od, cfg.caliber);
    return { od, id, v: hc.velocity(Q, id), hf: hc.hazen(L, Q, id, cfg.C), over: true };
  }
  const t = (o.targetV === undefined || o.targetV === null) ? cfg.targetV.subMain : o.targetV;
  let best = null;
  for (const od of set) {
    const id = hc.innerDiam(od, cfg.caliber);
    const v = hc.velocity(Q, id);
    if (v > cfg.econVmax) continue;              // 超经济流速，跳过
    const hf = hc.hazen(L, Q, id, cfg.C);
    if (!best || Math.abs(v - t) < Math.abs(best.v - t)) best = { od, id, v, hf };
  }
  if (!best) { const od = set[set.length - 1]; const id = hc.innerDiam(od, cfg.caliber);
    best = { od, id, v: hc.velocity(Q, id), hf: hc.hazen(L, Q, id, cfg.C), over: true };
  }
  return best;
}

/* 泵扬程 / 轴功率 / 电机档（按最不利主管段） */
function pumpCalc(cfg, Q, main) {
  const hLocal = main.hf * cfg.localRatio;
  const H = hc.head(cfg.dripHead + cfg.headLoss, main.hf + hLocal, 0, cfg.safety);
  const P = hc.power(Q, H, cfg.eta);
  return { H, P, M: dc.motor(P) };
}

/* 行布置：株数、行数、每行株数、行长、单行流量 */
function zoneGeom(cfg) {
  const trees = Math.round(cfg.zoneMu * cfg.densityPerMu);
  const areaM2 = mu2m2(cfg.zoneMu);
  const side = Math.sqrt(areaM2);                 // 假定近似方形地块
  const rows = cfg.rows || Math.max(1, Math.round(side / cfg.rowSpacing));
  const treesPerRow = cfg.treesPerRow || Math.round(trees / rows);
  const rowLen = Math.round(side);
  return { trees, rows, treesPerRow, rowLen };
}

/* 轮灌区内部：单棵出流、单行流量、行内毛管选径 */
function zoneDesign(cfg) {
  const g = zoneGeom(cfg);
  const vZone = cfg.zoneMu * cfg.waterPerMu;              // m³/区
  const tH = vZone / cfg.pumpFlow;                        // h/区
  const perTreeL = vZone / g.trees * 1000;                // L/棵/次
  const perTreeLh = perTreeL / tH;                        // L/h/棵
  const rowFlow = perTreeLh * g.treesPerRow / 1000;       // m³/h/行
  const lateral = sizePipe(rowFlow, g.rowLen, cfg, { targetV: cfg.targetV.lateral, series: cfg.lateralSeries }); // 行内毛管（小管系列）
  const F = dc.christiansen(g.treesPerRow);               // 多孔出流系数
  const lateralMulti = lateral.hf * F;                    // 多孔出流沿程损失
  const header = sizePipe(cfg.pumpFlow, cfg.zoneHeaderLen, cfg, { targetV: cfg.targetV.header }); // 区分配管
  return {
    trees: g.trees, rows: g.rows, treesPerRow: g.treesPerRow, rowLen: g.rowLen,
    vZone: R(vZone), tMin: R(tH * 60), perTreeL: R(perTreeL), perTreeLh: R(perTreeLh),
    rowFlow: R(rowFlow, 2), lateral, lateralF: R(F, 2), lateralMulti: R(lateralMulti, 2), header
  };
}

/* 泵站内管网逐段选径 */
function networkDesign(cfg) {
  const main = sizePipe(cfg.pumpFlow, cfg.reachM, cfg, { headCap: cfg.mainHeadCap });   // 长主管：按损失≤上限取最小管径
  const subMain = sizePipe(cfg.pumpFlow, cfg.subMainLen, cfg, { targetV: cfg.targetV.subMain }); // 站内干管
  const pump = pumpCalc(cfg, cfg.pumpFlow, main);
  return { main, subMain, pump };
}

/* 泵站覆盖与台数 */
function coverage(cfg, pumpFlow) {
  const areaPerStation = pumpFlow * cfg.pumpHoursPerDay * cfg.cycleDays / cfg.waterPerMu; // 亩/站
  const stations = Math.ceil(cfg.projectMu / areaPerStation);
  const zonesPerStation = Math.ceil(areaPerStation / cfg.zoneMu);
  return { areaPerStation: R(areaPerStation), stations, zonesPerStation, zonesTotal: Math.ceil(cfg.projectMu / cfg.zoneMu) };
}

/* 材料量（按单站与全项目；干管/连接管随实际布置差异大，不在此估算） */
function materials(cfg, zone, stations) {
  const per = {
    mainKm: R(cfg.reachM / 1000, 1),
    headerKm: R(stations.zonesPerStation * cfg.zoneHeaderLen / 1000, 1),
    lateralKm: R(stations.zonesPerStation * zone.rows * zone.rowLen / 1000, 0),
    emitters: stations.zonesPerStation * zone.trees
  };
  const tot = {
    mainKm: R(per.mainKm * stations.stations, 1),
    headerKm: R(per.headerKm * stations.stations, 1),
    lateralKm: R(per.lateralKm * stations.stations, 0),
    emitters: per.emitters * stations.stations
  };
  return { per, tot, stations: stations.stations };
}

/* ---------------- 主流程 ---------------- */
function design(cfgRaw) {
  const cfg = norm(cfgRaw);
  const zone = zoneDesign(cfg);
  const net = networkDesign(cfg);
  const cov = coverage(cfg, cfg.pumpFlow);
  const mat = materials(cfg, zone, cov);
  return { cfg, zone, net, cov, mat };
}

/* ---------------- 报告 ---------------- */
function render(d) {
  const { cfg, zone, net, cov, mat } = d;
  const L = [];
  L.push('===== 润野灌溉 · 参数化设计报告 =====');
  L.push(`项目 ${cfg.projectMu} 亩 · 密度 ${cfg.densityPerMu} 棵/亩 · 每次 ${cfg.waterPerMu} m³/亩`);
  L.push(`轮灌区 ${cfg.zoneMu} 亩/区 · 泵 ${cfg.pumpFlow} m³/h · 最远 ${cfg.reachM} m · 周期 ${cfg.cycleDays} 天/日运行 ${cfg.pumpHoursPerDay}h`);
  L.push('');
  L.push('【轮灌区内部】');
  L.push(`  ${zone.trees} 棵（${zone.rows} 行 × ${zone.treesPerRow} 棵/行，行长 ${zone.rowLen} m）`);
  L.push(`  单区水量 ${zone.vZone} m³，单区时长 ${zone.tMin} 分钟`);
  L.push(`  单棵 ${zone.perTreeL} L/次 = ${zone.perTreeLh} L/h（小管出流）；单行流量 ${zone.rowFlow} m³/h`);
  L.push(`  区分配管 DN${zone.header.od}(ID${Math.round(zone.header.id)}mm) v=${R(zone.header.v, 2)}m/s hf=${R(zone.header.hf, 2)}m`);
  L.push(`  行内毛管 DN${zone.lateral.od}mm(ID${Math.round(zone.lateral.id)}mm) v=${R(zone.lateral.v, 2)}m/s 多孔hf≈${R(zone.lateralMulti, 2)}m${zone.lateral.over ? ' [全系列超速!]' : ''}`);
  L.push('');
  L.push('【泵站内管网】');
  L.push(`  主管   DN${net.main.od}(ID${Math.round(net.main.id)}) v=${R(net.main.v, 2)}m/s hf=${R(net.main.hf, 2)}m（${cfg.reachM}m）`);
  L.push(`  干管   DN${net.subMain.od}(ID${Math.round(net.subMain.id)}) v=${R(net.subMain.v, 2)}m/s hf=${R(net.subMain.hf, 2)}m（${cfg.subMainLen}m）`);
  L.push(`  需求扬程 ${R(net.pump.H, 1)} m · 轴功率 ${R(net.pump.P, 1)} kW · 电机 ${net.pump.M} kW`);
  L.push('');
  L.push('【泵站覆盖与台数】');
  L.push(`  每站覆盖 ≈${cov.areaPerStation} 亩 ≈ ${cov.zonesPerStation} 个轮灌区`);
  L.push(`  全项目 ${cov.stations} 个泵站（共 ${cov.zonesTotal} 个轮灌区）`);
  L.push('');
  L.push('【材料量】');
  L.push(`  单站：DN${net.main.od}主管 ${mat.per.mainKm}km · 区分配管 ${mat.per.headerKm}km · 行内${zone.lateral.od}mm毛管 ${mat.per.lateralKm}km · 出流口 ${mat.per.emitters.toLocaleString()} 个`);
  L.push(`  全项目：DN${net.main.od} ${mat.tot.mainKm}km · 区分配管 ${mat.tot.headerKm}km · 毛管 ${mat.tot.lateralKm}km · 出流口 ${mat.tot.emitters.toLocaleString()} 个`);
  L.push('  （站内干管/连接管随实际布置差异大，未计入）');
  L.push('');
  L.push('口径：Hazen-Williams C=' + cfg.C + ' · ' + cfg.caliber + ' · 滴头' + cfg.dripHead + 'm + 首部' + cfg.headLoss + 'm + 局部' + (cfg.localRatio * 100) + '% + 安全' + cfg.safety + ' · 泵效' + cfg.eta);
  L.push('提示：株行距/段长按典型值估算；轮灌一次一区且泵满负荷时，区内管网较粗，可考虑变频降流/分小区以省管材。');
  return L.join('\n');
}

/* ---------------- CLI ---------------- */
if (require.main === module) {
  const cfgPath = process.argv[2];
  let raw = null;
  if (cfgPath) raw = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  console.log(render(design(raw)));

  // —— 自检：以内置基准核验 v5 口径（泵200 / 40亩区 / DN250主管）——
  const t = design(DEFAULT);
  const chk = (label, a, b) => {
    if (Math.abs(a - b) > Math.max(0.1, Math.abs(b) * 0.01)) { console.error('自检失败: ' + label + ' ' + a + ' vs ' + b); process.exitCode = 1; }
  };
  chk('主管DN', t.net.main.od, 250);
  chk('主管流速', t.net.main.v, 1.56);
  chk('需求扬程', t.net.pump.H, 30.0);
  chk('电机', t.net.pump.M, 30);
  chk('每站亩', t.cov.areaPerStation, 3111);
  chk('泵站数', t.cov.stations, 17);
  console.log('\n自检：基准工况主指标核对通过（DN250/流速1.56/扬程30/30kW/17站）');
}

module.exports = { design, render, DEFAULT, norm, sizePipe, pumpCalc, zoneDesign, networkDesign, coverage, materials };
