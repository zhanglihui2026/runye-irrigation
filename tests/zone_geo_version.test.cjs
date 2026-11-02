'use strict';
/* [v887 2026-11-02] zone-geometry.js 缓存事故锁。
   事故：该文件 ?v= 串在 v425 停摆——v883/v886 两轮都实质修改 tapeAxisOf 却没抬串，
   用户浏览器拿到旧方向逻辑，三次报「滴灌带方向没改过来」，而本地探针全绿。
   锁三件事：
     ① index.html 引用 zone-geometry.js 的 ?v= 串必须与主页版本串（style-01.css?v=）
        同 token——往后任何一轮发布都会一并抬到新版本名，不可能再停摆；
     ② RyZoneGeometry 必须暴露数字 VERSION 且 >= 当前要求（页面闸门判据）；
     ③ plot-editor.js 必须含页面级缓存守卫（版本落后 ⇒ reload 一次 + sessionStorage 防循环）。 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const zgSrc = fs.readFileSync(path.join(ROOT, 'mod', 'zone-geometry.js'), 'utf8');
const peSrc = fs.readFileSync(path.join(ROOT, 'mod', 'plot-editor.js'), 'utf8');

function tag(file) {
  const m = indexHtml.match(new RegExp(file.replace(/[.]/g, '\\.') + '\\?v=([\\w-]+)'));
  return m ? m[1] : null;
}

test('[v887] index.html 的 zone-geometry.js 缓存串与主页版本串同 token（不许再停摆）', () => {
  const zg = tag('mod/zone-geometry.js');
  const main = tag('mod/style-01.css');
  assert.ok(zg, 'index.html 必须以 ?v= 引用 zone-geometry.js');
  assert.ok(main, 'index.html 必须以 ?v= 引用 style-01.css（version_sync 基准）');
  assert.strictEqual(zg, main,
    'zone-geometry.js 的 ?v= 串 (' + zg + ') 必须随发布抬到与主页一致 (' + main + ')——v883/v886 曾停摆在 v425');
});

test('[v887] RyZoneGeometry.VERSION 必须存在、为数字且 >= 887（页面闸门判据）', () => {
  const api = require(path.join(ROOT, 'mod', 'zone-geometry.js'));
  assert.ok(typeof api.VERSION === 'number' && isFinite(api.VERSION), 'VERSION 必须是数字');
  assert.ok(api.VERSION >= 887, 'VERSION=' + api.VERSION + ' 落后于闸门要求 887——改了 zone-geometry.js 必须同步抬 VERSION 与 ?v=');
  assert.strictEqual(typeof api.tapeAxisOf, 'function');
});

test('[v887] plot-editor.js 必须含页面级缓存守卫（落后即 reload 一次 + sessionStorage 防循环）', () => {
  assert.ok(/RyZoneGeometry/.test(peSrc) && /VERSION/.test(peSrc));
  assert.ok(peSrc.includes("sessionStorage.setItem(k, '1')"), '必须有 sessionStorage 防循环标记');
  assert.ok(peSrc.includes('window.location.reload()'), '版本落后必须强制刷新');
  /* 守卫必须在 tapeAxisOf 消费之前执行（文件头部） */
  const gatePos = peSrc.indexOf('ryZgGateReloaded');
  const iifePos = peSrc.indexOf('var ppCanvas=document');
  assert.ok(gatePos > -1 && iifePos > -1 && gatePos < iifePos, '守卫必须先于主体 IIFE 执行');
});

test('[v887] inline-18.js 缓存串不得落后于其实质修改版本（v873 曾停摆在 v823）', () => {
  const t = tag('mod/inline-18.js');
  assert.ok(t, 'index.html 必须以 ?v= 引用 inline-18.js');
  assert.match(t, /^v?(8[7-9]\d|9\d\d)-/, 'inline-18.js ?v= (' + t + ') 必须 >= v87x（v873 实质修改过它）');
});
