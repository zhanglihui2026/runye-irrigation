'use strict';
/* tests/plot_unique.test.cjs —— 地块唯一性（v885-plot-unique）静态锁。
 *
 * 用户实测：在线地图「我的地块」里同一地块出现两条（地图画框/测量的本体 +
 * 分区与管路生成施工图时自动同步的 auto-current 副本），卫星图上两层叠加。
 * 修复口径：本体已在库里 ⇒ 不再创建 auto-current 副本（分区方案本就由
 * RyMapPartition.capture 挂到本体），并顺手清理旧版本遗留的副本（自愈）；
 * 渲染层（map-enhance renderPlots / online-map renderMyPlots）按同一判据
 * 显示级去重兜底。本体不存在（设计来自手动画框）时 auto-current 机制保留。
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const i09 = fs.readFileSync(path.join(ROOT, 'mod', 'inline-09.js'), 'utf8');
const enhance = fs.readFileSync(path.join(ROOT, 'runye-map-enhance.js'), 'utf8');
const omap = fs.readFileSync(path.join(ROOT, 'mod', 'online-map.js'), 'utf8');

/* 锁 1：同步块 —— 先查本体，本体在库走「清理副本」分支，绝不走到 upsertGeneratedCurrent。 */
{
  const sync = i09.slice(i09.indexOf('[v885] 地块唯一性'), i09.indexOf('catch(ePlot){}'));
  assert.ok(sync.includes('hasOwner'), '本体存在判定必须在场');
  assert.ok(sync.includes("removeGeneratedCurrent(plotId)"), '本体在库时必须清理旧副本（自愈）');
  const atHasOwner = sync.indexOf('if(hasOwner){');
  const atRemove = sync.indexOf('removeGeneratedCurrent(plotId)');
  const atElse = sync.indexOf('}else{');
  const atUpsert = sync.indexOf('upsertGeneratedCurrent(plotId,entry)');
  assert.ok(atHasOwner !== -1 && atRemove !== -1 && atElse !== -1 && atUpsert !== -1,
    '同步块结构不完整');
  assert.ok(atHasOwner < atRemove && atRemove < atElse && atElse < atUpsert,
    '顺序必须是 hasOwner → 清理副本 → else → upsert（本体在库绝不建副本）');
}

/* 锁 2：map-enhance renderPlots 显示级去重。 */
{
  assert.ok(enhance.includes('autoDupOwnerExists'), 'renderPlots 必须有 auto 副本去重判定');
  assert.ok(enhance.includes("plots.filter(function (p) { return !autoDupOwnerExists(p, plots); })"),
    'renderPlots 必须按去重后的列表绘制');
}

/* 锁 3：online-map renderMyPlots 列表去重（我的地块不出现双行）。 */
{
  const list = omap.slice(omap.indexOf('function renderMyPlots('), omap.indexOf('function renderMyPlots(') + 3000);
  assert.ok(list.includes("p.source!=='auto'"), '我的地块列表必须过滤 auto 副本');
  assert.ok(list.includes('designPlotId'), '过滤判据必须认 designPlotId');
}
console.log('plot_unique: 3 locks OK');
