#!/usr/bin/env node
/* ============================================================================
   [v359b] CloudBase Web SDK 自托管 bundle · 可复现构建脚本（审核报告 §5-2 修复）
   ----------------------------------------------------------------------------
   产物：pwa/vendor/cloudbase-js-sdk-3.8.2.bundle.js
         （@cloudbase/js-sdk@3.8.2 + 全部依赖，自包含 IIFE，普通 <script> 同步加载，
          执行后挂 window.cloudbase 并派发 cloudbase-ready 事件）
   用法：node build_sdk_bundle.cjs        （在项目根执行）
   依赖：esbuild 0.28.2 及 SDK 各依赖包已装入
         C:/Users/AHS/.workbuddy/binaries/node/workspace/node_modules
         （安装命令见 BUILD_ENV.md；esbuild 必须 --ignore-scripts，见注释）
   退出码：0 = 构建成功且自检通过；1 = 任何一步失败
   ⚠️ 历史教训：npm install esbuild 不带 --ignore-scripts 会因 postinstall
      spawn 另一版本 node 报 EBUSY；且不写入 package.json 的包会被下次
      npm install 当多余包清掉。
   ========================================================================== */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const WS = 'C:/Users/AHS/.workbuddy/binaries/node/workspace';
const NM = path.join(WS, 'node_modules');
const ESBUILD_EXE = path.join(NM, '@esbuild', 'win32-x64', 'esbuild.exe');
const OUT = path.join(__dirname, 'pwa', 'vendor', 'cloudbase-js-sdk-3.8.2.bundle.js');
const ENTRY = path.join(WS, '_ry_sdk_entry.mjs');

/* 版本钉死（--save-exact 安装）：重建产物必须逐字节可对账 */
const PINNED = {
  'esbuild': '0.28.2',
  '@cloudbase/js-sdk': '3.8.2',
  '@cloudbase/adapter-interface': '0.7.1',
  '@cloudbase/adapter-wx_mp': '1.3.1',
};

/* 打包入口内容：与生产 bundle 的行为契约 —— 挂全局 + 派发就绪事件 */
const ENTRY_SRC = [
  '/* 润野灌溉 —— CloudBase Web SDK 自托管打包入口（由 build_sdk_bundle.cjs 生成）',
  '   作用：把 ESM 的 @cloudbase/js-sdk 打成自包含 IIFE，执行后直接挂',
  '        window.cloudbase 并派发 cloudbase-ready，与原先 <script type="module"> 行为一致。 */',
  "import cloudbase from '@cloudbase/js-sdk';",
  '',
  'window.cloudbase = cloudbase;',
  'window.__RY_SDK_BUNDLED__ = true;',
  'try { window.dispatchEvent(new Event(\'cloudbase-ready\')); } catch (e) { }',
  '',
].join('\n');

function fail(msg) { console.error('[FAIL] ' + msg); process.exitCode = 1; }

/* ---- 1. 版本对账（钉死版本，漂移即失败） ---- */
for (const [pkg, want] of Object.entries(PINNED)) {
  const pj = path.join(NM, pkg, 'package.json');
  if (!fs.existsSync(pj)) { fail('缺少依赖 ' + pkg + '（见脚本头注释的安装命令）'); process.exit(process.exitCode || 1); }
  const got = JSON.parse(fs.readFileSync(pj, 'utf8')).version;
  if (got !== want) { fail(pkg + ' 版本漂移：装了 ' + got + '，钉死 ' + want); process.exit(1); }
  console.log('[ver ] ' + pkg + '@' + got + ' ✓');
}
if (!fs.existsSync(ESBUILD_EXE)) { fail('esbuild 平台二进制缺失：' + ESBUILD_EXE); process.exit(1); }

/* ---- 2. 入口文件（内容不匹配则重写，保证可复现） ---- */
const cur = fs.existsSync(ENTRY) ? fs.readFileSync(ENTRY, 'utf8') : null;
if (cur !== ENTRY_SRC) {
  fs.writeFileSync(ENTRY, ENTRY_SRC, 'utf8');
  console.log('[entry] 已写入/更新 ' + ENTRY);
} else {
  console.log('[entry] 与预期一致 ✓');
}

/* ---- 3. 构建（esbuild CLI：--format=iife，勿改 ----
   历史：曾有人把 format 写成 esm/entry 指向 dist/index.esm.js，
        会把生产 IIFE 产物覆盖成非自包含 ESM —— 审核报告 §5-2） */
const args = [
  ENTRY,
  '--bundle', '--format=iife', '--platform=browser', '--target=es2018',
  '--minify', '--legal-comments=none',
  '--define:process.env.NODE_ENV="production"',
  '--outfile=' + OUT,
];
console.log('[build] esbuild ' + args.join(' '));
try {
  execFileSync(ESBUILD_EXE, args, { stdio: ['ignore', 'pipe', 'inherit'] });
} catch (e) {
  fail('esbuild 构建失败：' + e.status);
  process.exit(1);
}

/* ---- 4. 自检（不过即 exit 1） ---- */
const buf = fs.readFileSync(OUT);
const txt = buf.toString('utf8');
const checks = {
  '体积 > 200KB': buf.length > 200 * 1024,
  '无静态裸导入': !/(^|[;\n}])import\s*["']/.test(txt),
  '无动态裸导入': !/import\s*\(\s*["']/.test(txt),
  '挂载全局在位': /window\.cloudbase\s*=/.test(txt),
  '就绪事件在位': /cloudbase-ready/.test(txt),
};
let ok = true;
for (const [k, v] of Object.entries(checks)) {
  console.log('[' + (v ? 'OK ' : 'FAIL') + '] ' + k);
  if (!v) ok = false;
}
const sha = crypto.createHash('sha256').update(buf).digest('hex');
console.log('[out ] ' + OUT);
console.log('[size] ' + buf.length + ' bytes');
console.log('[sha ] ' + sha);
console.log('\nRESULT: ' + (ok ? 'PASS' : 'FAIL'));
if (!ok) process.exit(1);
