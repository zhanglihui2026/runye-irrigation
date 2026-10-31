#!/usr/bin/env node
'use strict';

/**
 * 生成 eslint.globals.json —— 全站隐式全局白名单。
 *
 * 为什么需要它：本站是「IIFE + 挂 window」写法，模块之间靠 `window.RyXxx = {...}` 通信。
 * 不配白名单直接跑 eslint，`no-undef` 会报出上千条假错，结论是「这个库没救了」——纯噪音。
 *
 * 口径：只从 **git 已跟踪** 的脚本里抓，避免把 `_backup_*` 之类的历史副本算进来。
 * 用法：`node scripts/gen-eslint-globals.cjs`（改动了 window 导出后重跑一次即可）
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const OUT = path.join(root, 'eslint.globals.json');

const tracked = execFileSync('git', ['ls-files', '*.js', '*.cjs', '*.mjs'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024
})
  .split(/\r?\n/)
  .filter(Boolean)
  // 归档快照与第三方打包产物不是我们的源码，不算全局来源
  .filter(f => !f.startsWith('feature-archive/'))
  .filter(f => !f.startsWith('pwa/vendor/'));

/** `window.X =` / `globalThis.X =` / `self.X =`，排除 `==` 与属性链 `window.a.b =` */
const RE = /(?:^|[^.\w$])(?:window|globalThis|self)\.([A-Za-z_$][\w$]*)\s*=(?!=)/g;

const names = new Set();
const sources = new Map();

for (const file of tracked) {
  let src;
  try {
    src = fs.readFileSync(path.join(root, file), 'utf8');
  } catch {
    continue;
  }
  RE.lastIndex = 0;
  let m;
  while ((m = RE.exec(src))) {
    names.add(m[1]);
    if (!sources.has(m[1])) sources.set(m[1], file);
  }
}

const sorted = [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
const payload = {
  _comment: '自动生成，勿手改。来源：scripts/gen-eslint-globals.cjs',
  _count: sorted.length,
  _scanned: tracked.length,
  browser: Object.fromEntries(sorted.map(n => [n, 'readonly']))
};

fs.writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log(`扫描 ${tracked.length} 个已跟踪脚本，提取 ${sorted.length} 个 window 全局 → eslint.globals.json`);
