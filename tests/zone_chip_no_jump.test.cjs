'use strict';
/* tests/zone_chip_no_jump.test.cjs —— 「在线地图上点联合灌溉 1/2/3/4 区不跳页」
 *
 * 用户口径（2026-11-04）：「这轮罐区切换 1区 2区 点击按钮就会跳转到分区与管路页面，这步要省略掉」。
 *
 * 根因链（写清楚，别让后人又"顺手恢复"）：
 *   #tlZoneCountGroup 的 click → tlAutoGenerate() → 函数尾部 `if(!options.stay) tlShowWorkspace()`
 *   → rySetTab('tlPipePlanSection','ws') → inline-17 的 rySetTab 末尾发现该功能区未激活就
 *   `window.ryShowSection(sec)` ⇒ 整个页面被切到「分区与管路」。
 *   而 map-flow-demo 的 v864 dock 把 #tlPlanBar（正是这一排按钮）搬进了 #mapDemoDock，
 *   于是"在在线地图上点分组"这条路必然被弹走。
 *
 * 本文件锁三条：
 *   ① 必须有 tlPlanBarOnMap() 这个判据，且两条依据都在（#mapDemoDock 祖先 / 地图功能区激活）；
 *   ② tlAutoGenerate 的跳转条件必须同时排除"在地图上"，否则又会弹走；
 *   ③ 不在地图上时仍然要跳（这是原设计：生成完落在三级设计工作区）——别把条件写反；
 *   ④ 留在地图时刷新轮灌演示 chips（分组变了不刷，点下去会演上一组）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const src = read('mod/inline-09.js');

function region(startMark, endMark) {
  const a = src.indexOf(startMark);
  assert.ok(a >= 0, '找不到起点：' + startMark);
  const b = src.indexOf(endMark, a + startMark.length);
  assert.ok(b > a, '找不到终点：' + endMark);
  return src.slice(a, b);
}

test('① tlPlanBarOnMap：两条判据都在（dock 祖先 + 地图功能区激活）', () => {
  const fn = region('function tlPlanBarOnMap()', 'function tlAutoGenerate(options)');
  assert.ok(/getElementById\('tlPlanBar'\)/.test(fn), '必须看 #tlPlanBar 的归属');
  assert.ok(/closest\('#mapDemoDock'\)/.test(fn), '必须认 dock（#mapDemoDock）祖先');
  assert.ok(/getElementById\('onlineMapSection'\)/.test(fn), '必须有地图功能区兜底判据');
  assert.ok(/ry-active/.test(fn), '兜底判据要按 ry-active 判断是否激活');
  assert.ok(/catch\s*\(\s*e\s*\)\s*\{\s*return false;?\s*\}/.test(fn), '异常要吞掉返回 false（判据绝不能抛）');
});

test('② tlAutoGenerate：在地图上不跳页，但别处照旧跳', () => {
  const fn = region('function tlAutoGenerate(options)', 'function tlParseTfStr(str)');
  assert.ok(/if\s*\(\s*!\s*options\.stay\s*&&\s*!\s*_onMapNow\s*\)/.test(fn),
    '跳转条件必须排除"在地图上"：if(!options.stay && !_onMapNow)');
  assert.ok(/try\{\s*tlShowWorkspace\(\);\s*\}\s*catch/.test(fn), '不在地图上仍要跳（原设计：落在三级设计工作区）');
  /* 防止把条件写反成"只有在地图上才跳" */
  assert.ok(!/if\s*\(\s*_onMapNow\s*\)\s*\{?\s*try\{\s*tlShowWorkspace/.test(fn), '条件不许写反');
});

test('③ 留在地图时要刷新轮灌演示 chips', () => {
  const fn = region('function tlAutoGenerate(options)', 'function tlParseTfStr(str)');
  assert.ok(/RyMapFlowDemo\s*&&\s*typeof\s*window\.RyMapFlowDemo\.refresh\s*===\s*'function'/.test(fn),
    '分组变了必须调 window.RyMapFlowDemo.refresh() 重建组 chips');
});
