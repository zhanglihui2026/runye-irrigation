'use strict';
/* tests/case_lib_remote.test.cjs —— case-lib 插件接在线匿名案例库（v846）
 *
 * 背景：v845 打通了检索闭环（api query action + RyCaseLibrary.queryCases），但
 * plugins/case-lib 只读本地档案。本批给插件加「查在线案例」按钮。
 *
 * 静态锁口径：
 *   · 按钮与检索函数要存在，且必须走 RyCaseLibrary.queryCases（唯一收口，别自己再拼一份 fetch）；
 *   · 展示行只准消费 feature/engine_check/source/status/rating —— 这是服务端 retrieve
 *     的返回面，本来就不含 owner_hash / 地块边界；万一有人「顺手」改成调 lib.normalize
 *     或自己拼 plan，就超出脱敏承诺了；
 *   · 免责文案必须带「不得照抄为本地结论」—— 别人工况的扬程不是本地扬程（v842 联合复核
 *     同一条纪律的插件版）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(ROOT, 'plugins', 'case-lib', 'main.js'), 'utf8');
const caseLib = fs.readFileSync(path.join(ROOT, 'runye-case-library.js'), 'utf8');

const stripJsComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

test('① 「查在线案例」按钮存在且绑 findRemote', () => {
  const live = stripJsComments(main);
  assert.ok(live.includes("'查在线案例'"), '按钮文案');
  assert.ok(/bRemote\.addEventListener\('click', findRemote\)/.test(live), '按钮要绑 findRemote');
  assert.ok(/function findRemote\(\)/.test(live), 'findRemote 函数要存在');
});

test('② 检索走 RyCaseLibrary.queryCases 唯一收口，且校验面积', () => {
  const live = stripJsComments(main);
  assert.ok(live.includes('L.queryCases({ area: area })'), '必须走 v845 的 queryCases，别自己拼 fetch');
  assert.ok(!live.includes("fetch("), '插件里不该出现裸 fetch');
  assert.ok(live.includes("if (!area) { toast("), '面积缺失要先拦');
  /* 依赖的 queryCases 在 runye-case-library.js 里真实存在并挂到全局 */
  const cl = stripJsComments(caseLib);
  assert.ok(cl.includes('function queryCases(q)'), 'queryCases 必须存在');
  assert.ok(/RyCaseLibrary=\{[^}]*queryCases/.test(cl), 'queryCases 必须挂到 RyCaseLibrary');
});

test('③ 展示行只消费脱敏返回面，不碰 owner / polygon', () => {
  const live = stripJsComments(main);
  assert.ok(live.includes('function remoteRow(c)'), 'remoteRow 要存在');
  assert.equal(live.includes('owner_hash'), false, '不该出现 owner 字段');
  assert.equal(live.includes('polygon'), false, '检索出口没有地块边界，也别想画');
  ['tape_spacing', 'emitter_flow', 'pump_head_m', 'main_od_mm'].forEach((k) => {
    assert.ok(live.includes(k), '工程参数行应展示 ' + k);
  });
});

test('④ 免责文案：不得照抄为本地结论', () => {
  const live = stripJsComments(main);
  assert.ok(live.includes('不得照抄为本地结论'), '他人工况 ≠ 本地结论（v842 同款纪律）');
});
