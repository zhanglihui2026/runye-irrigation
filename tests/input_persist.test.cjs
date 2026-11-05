'use strict';
/* tests/input_persist.test.cjs —— [v978] 设计输入自动持久化
 *
 * 背景（线上事故）：v977 上线强刷后，二级 fld_* / 三级 tl_* 设计输入回退 HTML 默认值，
 * 滴灌参数 perM2 变 1.2 倍，地图卡片全部流量回到旧参数时代——用户看到
 * 「之前的数据冒出来了」。根因：地块/分组/节点都持久化了，唯独设计输入没存。
 *
 * 钉四件事：
 *  ① mod/inline-33.js 存在且挂载在 index.html 最后（还原要在「与二级联动」派生之后
 *     用存档覆盖回用户手改值，挂早了手改值会被联动值顶掉）；
 *  ② 还原顺序铁律：先 calcPlan()（走联动派生）再覆盖 tl_*——顺序倒了持久化就形同虚设；
 *  ③ 只认 fld_ / tl_ / planSrcDist 三类 id，别的输入（搜索框、坐标框）一概不存；
 *  ④ sw.js CORE 含 inline-33 且不带 ?v=（version_sync ③ 的离线雷）；index.html
 *     版本串与 sw VERSION 同抬。
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const modText = fs.readFileSync(path.join(ROOT, 'mod', 'inline-33.js'), 'utf8');
const htmlText = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const swText = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

test('[v978] inline-33 挂载在 index.html 所有脚本之后', () => {
  const m = htmlText.match(/<script src="mod\/inline-33\.js\?v=([^"]+)"><\/script>/);
  assert.ok(m, 'index.html 必须挂载 mod/inline-33.js');
  const tagAt = htmlText.indexOf(m[0]);
  assert.equal(m[1], '978-inputpersist', '挂载版本串必须与 sw VERSION 同抬');
  /* 不得有脚本排在它后面（type=module 的 bootstrap/shoelace CDN 除外：模块天然异步） */
  const after = htmlText.slice(tagAt + m[0].length);
  const later = [...after.matchAll(/<script src="([^"]+)"><\/script>/g)]
    .filter((x) => !/type="module"/.test(x.input.slice(x.index - 30, x.index + 60)));
  assert.deepEqual(later.map((x) => x[1]), [], 'inline-33 必须是最后一个经典脚本');
});

test('[v978] 还原顺序：calcPlan 先于 tl_ 覆盖（手改值赢联动派生值）', () => {
  const calcAt = modText.indexOf('window.calcPlan');
  const tlAt = modText.indexOf("id.indexOf('tl_') !== 0");
  assert.ok(calcAt > 0, '还原里必须调 calcPlan（走二级联动派生）');
  assert.ok(tlAt > calcAt, 'tl_ 存档覆盖必须在 calcPlan 之后——否则联动值顶掉手改值');
  const saveAt = modText.lastIndexOf('save();', modText.indexOf('return n > 0'));
  assert.ok(saveAt > tlAt, '还原收尾必须 save() 回写最终屏幕态，防中间联动值留在存档');
});

test('[v978] 只存设计输入：fld_ / tl_ / planSrcDist', () => {
  assert.ok(modText.includes('ID_RE = /^(fld_|tl_)/'), 'id 白名单正则必须钉死');
  assert.ok(modText.includes("SPECIAL_IDS = { planSrcDist: 1 }"), 'planSrcDist 在白名单');
  /* 快照循环里必须有白名单过滤，不允许整表无差别保存 */
  assert.ok(/ID_RE\.test\(id\) \|\| SPECIAL_IDS\[id\]/.test(modText));
  assert.ok(!/querySelectorAll\('input\)\s*\.forEach/.test(modText.replace(/\[id\]/g, '')),
    '快照不得绕过白名单');
});

test('[v978] 复位按钮包一层补存（程序赋值不触发 change）', () => {
  assert.ok(modText.includes("'resetDefaults'"), '二级复位要补存');
  assert.ok(modText.includes("'resetThreeLevelDefaults'"), '三级复位要补存');
});

test('[v978] sw.js CORE 登记 inline-33 且不带 ?v=；版本同抬', () => {
  const m = swText.match(/const CORE = \[([\s\S]*?)\n\];/);
  assert.ok(m, 'CORE 数组存在');
  const entries = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  assert.ok(entries.includes('mod/inline-33.js'), 'CORE 必须含 inline-33');
  assert.ok(entries.every((e) => !e.includes('?v=')), 'CORE 条目不许带 ?v=（离线 key miss 雷）');
  const v = swText.match(/^const VERSION = '([^']+)';/m);
  assert.equal(v[1], 'v978-inputpersist');
  assert.ok(!htmlText.includes('?v=977-cardlist'), '旧版本串必须清零');
  assert.equal(htmlText.split('?v=978-inputpersist').length - 1, 14, '13 处同抬 + 1 处新挂载');
});
