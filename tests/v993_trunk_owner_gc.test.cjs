'use strict';
/* tests/v993_trunk_owner_gc.test.cjs —— [v993] 在线地图总管「随地块删除」回归锁（2026-11-06）
 *
 * 用户拍板：「在地图上绘制的总管 属于哪个地块就应该归属哪个地块，当这个地块被删除之后，
 * 管道也随之清除」。
 *
 * 取证结论：数据层本来就是按地块存的（plot.trunk 挂在 plot 记录上，删记录即删数据），
 * 漏的是**显示层与闭包缓存**：trunkSaved / trunkSavedLayers / trunkNodeLayers /
 * trunkPoints / 撤销栈不会随地块库失效 ⇒ 屏幕上蓝线还在，甚至还能继续编辑。
 *
 * v993 改动（只动 mod/online-map.js，不碰分区/管网/持久化算法）：
 *   ① trunkOwnerPlotId 记录 trunkSaved 的真实归属（与 currentMapPlotId 会分叉）；
 *   ② trunkOwnerAlive() 纯函数：归属地块仍在且非成组/归档才算活着；
 *   ③ gcTrunkByPlotOwner() 挂在 renderMyPlots()：弹窗删除 / 左栏 × 删除 / 成组 /
 *      解散 / 工程导入 五条路径一处收口，统一 setTrunkMode('idle') 清图层与缓存；
 *   ④ RyMapHost.trunkState() 暴露 ownerPlotId 供探针验。
 *
 * 本测试钉五件事：纯函数边界、清理动作齐全、四处归属赋值同步、两条删除入口接线、
 * 版本闸门。库读取失败不许清（避免误删）也在源码锁里。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'mod', 'online-map.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const schema = fs.readFileSync(path.join(ROOT, 'core', 'trunk-schema.js'), 'utf8');

/* 把纯函数从 IIFE 里切出来单独跑：不依赖 Leaflet / DOM，可覆盖真实边界。 */
function loadOwnerAlive() {
  const start = src.indexOf('function trunkOwnerAlive(plots, ownerId){');
  assert.ok(start >= 0, 'trunkOwnerAlive 必须存在');
  const end = src.indexOf('\n  }', start);
  assert.ok(end > start, 'trunkOwnerAlive 的函数结束标记必须存在');
  const fnSrc = src.slice(start, end + 4);
  const fn = vm.runInNewContext('(function(){' + fnSrc + '\nreturn trunkOwnerAlive;})()',
    { String: String, console: console }, { filename: 'mod/online-map.js#trunkOwnerAlive' });
  assert.equal(typeof fn, 'function', '切出来的必须是可调用的函数');
  return fn;
}

function bodyOf(marker) {
  const start = src.indexOf(marker);
  assert.ok(start >= 0, marker + ' 必须存在');
  const end = src.indexOf('\n  }', start);
  assert.ok(end > start, marker + ' 的函数体必须完整');
  return src.slice(start, end + 4);
}

test('[v993] trunkOwnerAlive：普通地块活着，删除/成组/归档/无归属一律判失效', () => {
  const alive = loadOwnerAlive();
  assert.equal(alive([{ id: 'A' }], 'A'), true, '归属地块仍在 ⇒ 不清');
  assert.equal(alive([{ id: 7 }], '7'), true, '数字 id 与字符串 owner 可比');
  assert.equal(alive([{ id: 'B' }, { id: 'C' }], 'A'), false, '归属地块被删 ⇒ 回收');
  assert.equal(alive([], 'A'), false, '空库 ⇒ 回收');
  assert.equal(alive([{ id: 'A', merged: true }], 'A'), false, '成组地块由多地块规划管总管');
  assert.equal(alive([{ id: 'A', grouped: true }], 'A'), false, 'grouped 同样不再是独立可管地块');
  assert.equal(alive([{ id: 'A', mergedInto: 'G' }], 'A'), false, '已归入成组的子地块 ⇒ 回收');
  assert.equal(alive([{ id: 'A' }], null), false, '无归属 ⇒ 回收');
  assert.equal(alive([{ id: 'A' }], ''), false, '空 owner ⇒ 回收');
});

test('[v993] 回收动作：清数据/归属/选中/撤销栈/告警，并统一走 idle 重绘', () => {
  const gc = bodyOf('function gcTrunkByPlotOwner(){');
  assert.ok(gc.includes("if(!snap||!snap.ok) return;"), '库读取失败必须原样不动，不能误删刚画的总管');
  assert.ok(gc.includes('trunkSaved=null;'), '必须清已保存总管');
  assert.ok(gc.includes('trunkOwnerPlotId=null;'), '必须清归属标记');
  assert.ok(gc.includes('currentMapPlotId=null;'), '当前选中若指向已删地块必须复位');
  assert.ok(gc.includes('trunkHistory.clear()'), '撤销栈必须清，否则 Ctrl+Z 能把已删地块的总管写回来');
  assert.ok(gc.includes('hideTrunkWarn()'), '流速告警卡说的是旧线，必须一起收掉');
  assert.ok(gc.includes("setTrunkMode('idle');"), '统一走 idle：线层/节点层/草稿/按钮/状态栏/参数面板一并重绘');
  assert.ok(gc.includes('trunkNodeLayers.length'), '回收判据必须覆盖水源/三通节点层残留');
});

test('[v993] 每处 trunkSaved 赋值都同步 trunkOwnerPlotId', () => {
  const re = /trunkSaved\s*=/g;
  let m, count = 0;
  while ((m = re.exec(src))) {
    const tail = src.slice(m.index, m.index + 240);
    assert.ok(/trunkOwnerPlotId\s*=/.test(tail),
      'trunkSaved 赋值后必须同步归属标记，源码偏移 ' + m.index);
    count++;
  }
  assert.equal(count, 7, '声明 + commitTrunks / 绘制入口 / 编辑入口 / 换地块 + 回收清空 + v1080 清空管网 共 7 处');
  assert.ok(src.includes('var trunkOwnerPlotId=null;'), '归属变量必须初始化为 null');
});

test('[v993] 两条删除入口都接到 renderMyPlots（回收的唯一收口）', () => {
  assert.ok(src.includes('onPlotsChanged:function(){ renderMyPlots(); }'),
    '地图弹窗「删除地块」必须回调宿主重列');
  const delStart = src.indexOf('var now=latest.plots.filter');
  assert.ok(delStart >= 0, '左栏「我的地块 ×」删除逻辑必须存在');
  const delTail = src.slice(delStart, delStart + 500);
  assert.ok(delTail.includes('renderMyPlots();'), '左栏删除成功后必须重列（触发回收）');
  const rp = src.indexOf('function renderMyPlots(){');
  const gcCall = src.indexOf('gcTrunkByPlotOwner();', rp);
  const boxLine = src.indexOf("var box=document.getElementById('myPlotList');", rp);
  assert.ok(rp >= 0 && gcCall > rp && gcCall < boxLine,
    '回收必须是 renderMyPlots 的第一件事，不能排在 DOM 早退之后');
});

test('[v993] 探针出口与既有归属契约未被破坏', () => {
  const ts = bodyOf('function trunkState(){');
  assert.ok(ts.includes('ownerPlotId:'), 'trunkState 必须暴露真实归属，供探针验证「显示的是谁的总管」');
  assert.ok(src.includes('if(plot.merged||plot.grouped||plot.mergedInto) return null;'),
    'loadSavedTrunkFor 仍不得为成组/归档地块显示手绘总管');
  assert.ok(schema.includes('function hasUsableTrunk'), 'trunk-schema 的既有契约未动');
  assert.ok(schema.includes('function pickMainTrunk'), '主干选择口径未动');
});

test('[v994] 版本闸门：14 处 ?v= 与 sw.js VERSION 同步（动态，不写死版本号）', () => {
  /* [v994] 原断言把 v993-trunk-owner 写死，之后每抬一次版本都要改测试 ——
     改成与 v982/v988 等闸门同口径：从 sw.js 动态读 VERSION，再数 index.html 的命中数。 */
  const m = sw.match(/^const VERSION = '([^']+)';/m);
  assert.ok(m, 'sw.js 必须有 VERSION 常量');
  const ver = m[1].replace(/^v/, '');
  assert.equal(html.split('?v=' + ver).length - 1, 14,
    'index.html 必须正好 14 处当前版本串（动态版本锁口径）');
  assert.ok(!html.includes('992-cold-prune') && !html.includes('993-trunk-owner'),
    'index.html 不得残留旧版本串');
  assert.ok(!sw.includes('992-cold-prune') && !sw.includes("const VERSION = 'v993-trunk-owner'"),
    'sw.js 不得残留旧版本串');
});
