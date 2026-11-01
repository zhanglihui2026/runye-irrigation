#!/usr/bin/env node
'use strict';
/* [v866-map-parse-fix] 地图区 HTML 标签配对静态锁。
 *
 * 病史（v864 引入、v866 修复）：地图左栏 aside 内多出一个游离 </section>，
 * 浏览器解析到它时把 #onlineMapSection 整个提前闭合 —— 后面的 .side-grip /
 * .map-wrap 被解析成 MAIN 直下兄弟节点，地图容器脱离 .main 的 flex 行布局，
 * 高度塌成 ~97px = 用户看到的「dock 搬进左栏后地图看不到了」。
 * 与 JS 无关（DOM 搬移探针为空、禁 JS 复现）；纯解析层问题。
 *
 * 锁：从 <section id="onlineMapSection" 到 <div class="map-wrap"> 之间的
 * section/aside 开合标签数量必须两两相等（map-wrap 之前地图区只有这两类
 * 容器开合，div/h4 等叶子标签历史上有注释穿插，不在本锁范围内）。
 * 游离 </section> 一旦再出现（无论编辑哪段注释时手滑），本锁立即红。 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const start = html.indexOf('<section id="onlineMapSection"');
assert.notStrictEqual(start, -1, 'index.html 必须包含 #onlineMapSection');
const end = html.indexOf('<div class="map-wrap">', start);
assert.notStrictEqual(end, -1, '.map-wrap 必须在 #onlineMapSection 之后');
const seg = html.slice(start, end);

const count = (s, re) => (s.match(re) || []).length;
const secOpen = count(seg, /<section[\s>]/g);
const secClose = count(seg, /<\/section\s*>/g);
const asideOpen = count(seg, /<aside[\s>]/g);
const asideClose = count(seg, /<\/aside\s*>/g);

assert.strictEqual(secOpen, secClose,
  `地图区（#onlineMapSection → .map-wrap 之间）section 标签不配对：开 ${secOpen} / 闭 ${secClose}。` +
  '游离 </section> 会令浏览器把整个 #onlineMapSection 提前闭合，.map-wrap 被解析成 MAIN 直下，' +
  '地图脱离 .main flex 布局而塌陷（v864 回归、v866 修复，见 AGENT_HANDOFF §26.103）。');
assert.strictEqual(asideOpen, asideClose,
  `地图区 aside 标签不配对：开 ${asideOpen} / 闭 ${asideClose}。`);

console.log('ok html_map_section: section/aside 配对正常');
