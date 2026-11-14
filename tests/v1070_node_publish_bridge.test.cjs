'use strict';
/* tests/v1070_node_publish_bridge.test.cjs —— [v1070] 发布块 p2ll 作用域桥接
 *
 * v1069 的失败弹窗暴露真实报错：「施工节点未能与管线组成同一发布快照：p2ll is not defined」。
 * 根因：p2ll/toFrame/ln2ll 声明在管网反投 IIFE（if(publishToMap) try{(function(){...})()}）
 * 内部；今日新加的发布块（routeGeometry/publishedNodes 冻结）在 tlAutoGenerate 函数级
 * 作用域直接引用 p2ll ⇒ ReferenceError ⇒ 发布必然失败、节点永远回传不了地图
 * （此前 catch 只 console.warn 所以无人看见——即「节点不能回传」的最终答案）。
 * 修复：tlAutoGenerate 函数级 tlPublishP2ll 桥接变量（IIFE 内 p2ll 定义后赋值），
 * 发布块入口 var p2ll=tlPublishP2ll 并做空值校验。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const i9 = fs.readFileSync(path.join(ROOT, 'mod', 'inline-09.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

test('[v1070] IIFE 内 p2ll 桥接出口存在且在定义后赋值', () => {
  assert.ok(i9.includes('var tlPublishP2ll=null;'), '函数级桥接变量必须声明');
  const defPos = i9.indexOf('function p2ll(pt){ pt=toFrame(pt);');
  const bridgePos = i9.indexOf('tlPublishP2ll=p2ll;');
  assert.ok(bridgePos > defPos && bridgePos < defPos + 400,
    '桥接赋值必须紧跟 p2ll 定义（同 IIFE 内）');
});

test('[v1070] 发布块入口：var p2ll=tlPublishP2ll + 空值校验', () => {
  const pubPos = i9.indexOf('var p2ll=tlPublishP2ll;');
  assert.ok(pubPos > 0, '发布块必须桥接 p2ll');
  const seg = i9.slice(pubPos, pubPos + 500);
  assert.ok(seg.includes("typeof p2ll!=='function'"), '必须做空值校验（基准/框线缺失时 fail-fast）');
  assert.ok(seg.includes('管线投影出口未就绪'), '校验失败必须带可辨认文案');
});

test('[v1070] 版本纪律：版本串动态等于 sw VERSION', () => {
  const v = sw.match(/^const VERSION = '([^']+)';/m);
  /* [v1071] 改动态：本锁只要求「index 版本串与 sw VERSION 同值同抬」，
     不写死版本号（写死会让之后每次抬版都炸）。 */
  assert.ok(v && /^v\d{3,4}-[\w-]+$/.test(v[1]), 'sw VERSION 必须存在且形如 vNNNN- slug');
  const want = v[1].replace(/^v/, '');
  assert.equal(html.split('?v=' + want).length - 1, 17, '版本串必须恰好 17 处（[v1071] 口径）');
});
