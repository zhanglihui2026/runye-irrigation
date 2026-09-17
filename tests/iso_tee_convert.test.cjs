/* iso_tee_convert.test.cjs — 手工三通 同径/异径转换 + 自动接管 回归（2026-09-14）
 * 状态存于编辑参数（teeType/branchSpec/branchLen），走 beginEdit→previewEdit→applyEdit 事务。
 * 覆盖：convertTee（reducing 取另一管径 / equal 同径）、setBranchLen（范围校验）、
 *       渲染含接管、fittingInfo 生效字段、统计接管长度计入、撤销、存档往返与非法档拒收。
 * 运行：node tests/iso_tee_convert.test.cjs （退出码非 0 即失败） */
'use strict';
const iso = require('../iso-diagram/iso-diagram.js');
const assert = require('assert');

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

function mkData() {
  return {
    version: 1, world: 'meter', generatedAt: '2026-09-14 20:00',
    plot: { w: 300, h: 200 },
    poly: [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 200 }, { x: 0, y: 200 }],
    zones: { cols: 3, rows: 2, xPos: [0, 100, 200, 300], yPos: [0, 100, 200] },
    frontPipe: [{ x: 0, y: -20 }, { x: 300, y: -20 }],
    sourcePos: { x: 0, y: -20 },
    mainPipes: [[{ x: 32, y: 0 }, { x: 32, y: 200 }], [{ x: 132, y: 0 }, { x: 132, y: 200 }]],
    branchPipes: [[{ x: 60, y: 6 }, { x: 60, y: 194 }], [{ x: 160, y: 6 }, { x: 160, y: 194 }]],
    valves: [{ x: 60, y: 50, ax: 32, ay: 18 }, { x: 160, y: 50, ax: 132, ay: 18 }],
    dripTapes: [],
    meta: { zoneCount: 6, pump: { flow: '120', head: '35', power: '18.5' }, pipes: { front: 'Ø200', main: 'Ø110', branch: 'Ø90' } }
  };
}

const data = mkData();
iso.attachData(data);
iso.renderSVG(data);
iso.clearManual();

/* 放置（规格随所在管径由 placeFromEvent 完成，此处模拟已放在 Ø110 主管上） */
const m = iso.addManual('tee', '110', 'main', 0, { x: 32, y: 50 });
ok(m && m.id === 'M-T01', '放置 110 三通于主管', m && m.id);

/* 转换：异径 → 分支口管径取支管 Ø90 */
ok(iso.convertTee(m.id, 'reducing') === true, 'convertTee reducing 成功');
let p = iso.getParams(m.id);
ok(p.teeType === 'reducing' && p.branchSpec === '90' && p.branchLen === 1, '异径生效 110→90、默认接 1m',
  JSON.stringify({ t: p.teeType, s: p.branchSpec, l: p.branchLen }));
let svg = iso.renderSVG(data);
ok(svg.indexOf('90×1m') >= 0, '渲染含接管标注 90×1m');

/* 转换：同径 → 分支口=进口管径 */
ok(iso.convertTee(m.id, 'equal') === true, 'convertTee equal 成功');
p = iso.getParams(m.id);
ok(p.teeType === 'equal' && p.branchSpec === '110', '同径生效 110→110', JSON.stringify({ t: p.teeType, s: p.branchSpec }));
svg = iso.renderSVG(data);
ok(svg.indexOf('110×1m') >= 0 && svg.indexOf('90×1m') < 0, '渲染标注切换为 110×1m');

/* fittingInfo 生效字段 */
let info = iso.fittingInfo(m.id);
ok(info && info.manual && info.teeType === 'equal' && info.branchSpec === '110' && info.branchLen === 1,
  'fittingInfo 含 teeType/branchSpec/branchLen', JSON.stringify(info));
ok(info.typeName.indexOf('110转110') >= 0, 'typeName 显示 110转110', info.typeName);

/* 接管长度调整 + 范围校验 */
ok(iso.setBranchLen(m.id, 2.5) === true, 'setBranchLen 2.5 成功');
info = iso.fittingInfo(m.id);
ok(info.branchLen === 2.5, '长度已更新 2.5');
ok(iso.setBranchLen(m.id, 0.2) === false, '长度 0.2 拒绝（<0.5）');
ok(iso.setBranchLen(m.id, 20) === false, '长度 20 拒绝（>10）');
ok(iso.setBranchLen(m.id, NaN) === false, '长度 NaN 拒绝');
ok(iso.setBranchLen('M-T99', 1) === false, '不存在配件拒绝');
ok(iso.convertTee(m.id, 'bad') === false, '非法转换类型拒绝');
ok(iso.convertTee('M-T99', 'equal') === false, '不存在三通转换拒绝');

svg = iso.renderSVG(data);
ok(svg.indexOf('110×2.5m') >= 0, '渲染标注 110×2.5m');

/* 统计：接管长度计入管道长度（本例主管未归区 → unmapped 进合计） */
const two5 = iso.computeStats(data).totals.branchLen;
iso.undoEdit(); /* 撤销 setBranchLen → 回 1m */
const oneM = iso.computeStats(data).totals.branchLen;
ok(Math.abs(oneM - (two5 - 1.5)) < 1e-9, '统计接管 2.5m 与 1m 差 1.5m', two5 + ' vs ' + oneM);
iso.undoEdit(); /* 撤销 convertTee equal → 回异径（该转换前的快照） */
p = iso.getParams(m.id);
ok(p.teeType === 'reducing' && p.branchSpec === '90', '撤销同径转换回到异径态', JSON.stringify({ t: p.teeType, s: p.branchSpec }));
iso.undoEdit(); /* 撤销 convertTee reducing → 未转换态 */
p = iso.getParams(m.id);
ok(!p.teeType && !p.branchSpec && p.branchLen === 1, '再撤销恢复未转换态', JSON.stringify({ t: p.teeType, s: p.branchSpec, l: p.branchLen }));

/* 重做转换到异径（供存档用例） */
ok(iso.convertTee(m.id, 'reducing') === true, '重新转换为异径');
ok(iso.setBranchLen(m.id, 1.5) === true, '接管长度 1.5');

/* 存档往返（字段存于 edits，随 exportState/importState 走） */
const saved = iso.exportState();
iso.clearManual();
ok(iso.importState(saved, data) === true, '存档导入成功');
p = iso.getParams(m.id);
ok(p.teeType === 'reducing' && p.branchSpec === '90' && p.branchLen === 1.5, '转换字段往返保留', JSON.stringify({ t: p.teeType, s: p.branchSpec, l: p.branchLen }));

/* 非法档拒收：branchLen 越界 / 非法 teeType（存于 edits，经 validParams 校验） */
const bad = JSON.parse(JSON.stringify(saved));
bad.state.edits['M-T01'].branchLen = 99;
ok(iso.importState(bad, data) === false, 'branchLen 越界存档拒收');
const bad2 = JSON.parse(JSON.stringify(saved));
bad2.state.edits['M-T01'].teeType = 'weird';
ok(iso.importState(bad2, data) === false, '非法 teeType 存档拒收');

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项' + (fail === 0 ? '  == 全部通过 ==' : '  == 存在失败 =='));
process.exit(fail === 0 ? 0 : 1);
