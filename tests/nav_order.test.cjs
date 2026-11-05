'use strict';
/* tests/nav_order.test.cjs —— 顶栏功能模块顺序（2026-11-04 用户指令）
 *
 * 用户原话：「导航栏功能模块的顺序调整下，地形模块与多地块规划一起移动到分区与管路后面，
 *            放在智能规划前面。」
 * [v974] 地形模块已剥离为独立页（terrain/index.html，入口收进文件菜单），顶栏只剩
 *        多地块规划保持在分区与管路之后、智能规划之前。
 *
 * 为什么锁的是 runye-nav.js 的 ITEMS 而不是 DOM 断言：
 *   顶栏由 runye-nav.js 的 ITEMS 渲染（唯一出处），渲染规则是
 *     · pre:1 的项 insertBefore(marker) —— 恒排在静态项之前，组内按数组顺序；
 *     · 不带 pre 的项 appendChild 到末尾 —— 智能规划/水力校核/材料清单在这一组。
 *   所以「想让某项站到智能规划前面」= 必须进 pre 组，光调数组位置没用（第一版就是这么错的）。
 *   本文件按同一规则模拟一遍渲染顺序，防止后人只改数组不改 pre。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'runye-nav.js'), 'utf8');

/* 只取真正的 ITEMS 数组块（注释里的条目要在解析前剔掉：v805 退役的「地块绘制」还留在
   /* ... *\/ 注释块里，直接按行匹配会把它当成活条目）。 */
function parseItems() {
  const start = src.indexOf('var ITEMS = [');
  assert.ok(start >= 0, '找不到 ITEMS');
  const end = src.indexOf('\n  ];', start);
  assert.ok(end > start, '找不到 ITEMS 结束');
  const body = src.slice(start, end)
    .replace(/\/\*[\s\S]*?\*\//g, '');           /* 剔块注释 */
  const out = [];
  const re = /\{[^{}]*?label:\s*'([^']+)'[^{}]*?\}/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    const chunk = m[0];
    out.push({
      label: m[1],
      pre: /pre:\s*1/.test(chunk),
      routeOnly: /routeOnly:\s*1/.test(chunk),
      hash: (chunk.match(/hash:\s*'([^']+)'/) || [])[1] || ''
    });
  }
  return out;
}

const items = parseItems();
/* 模拟 runye-nav 的渲染顺序：pre 组（数组顺序）→ 非 pre 组（数组顺序）；routeOnly 不上顶栏 */
const rendered = items.filter(i => !i.routeOnly)
  .filter(i => i.pre).map(i => i.label)
  .concat(items.filter(i => !i.routeOnly && !i.pre).map(i => i.label));

test('① 多地块规划带 pre:1；地形模块不再上顶栏（v974 剥离为独立页）', () => {
  const g = items.find(i => i.label === '多地块规划');
  assert.ok(g, 'ITEMS 里必须有多地块规划');
  assert.equal(g.pre, true, '多地块规划必须 pre:1 —— 渲染规则里 pre 组才排得进前段');
  assert.equal(g.hash, 'grPipeSection');
  /* [v974] 地形模块彻底剥离为独立页（terrain/index.html），入口收进「文件」菜单；
     顶栏不再有地形 tab —— 若这里红了，说明有人把地形 tab 加回来了。 */
  const t = items.find(i => i.label === '地形模块');
  assert.equal(t, undefined, '地形模块不许再出现在顶栏 ITEMS 里（v974 已剥离）');
});

test('② 渲染后：分区与管路 → 多地块规划 → 智能规划', () => {
  const iP = rendered.indexOf('分区与管路');
  const iG = rendered.indexOf('多地块规划');
  const iS = rendered.indexOf('智能规划');
  assert.ok(iP >= 0 && iG >= 0 && iS >= 0, '三个入口都要在顶栏出现：' + rendered.join(' / '));
  assert.ok(iG > iP, '多地块规划要在分区与管路之后');
  assert.ok(iG < iS, '多地块规划要在智能规划之前');
});

test('③ 不许因搬移产生重复入口（同一 label 只能出现一次）', () => {
  const labels = items.map(i => i.label);
  const dup = labels.filter((l, i) => labels.indexOf(l) !== i);
  assert.deepEqual(dup, [], '重复的导航项会渲染两个入口：' + dup.join(','));
});

test('④ 智能规划仍不带 pre（它排在 pre 组之后，是"分区/地形之后的第一项"）', () => {
  const s = items.find(i => i.label === '智能规划');
  assert.ok(s, 'ITEMS 里必须有智能规划');
  assert.equal(s.pre, false, '智能规划一旦加了 pre:1 就会跑到文件/在线地图前面');
});
