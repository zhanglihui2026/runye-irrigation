#!/usr/bin/env node
'use strict';

/**
 * 静态检查入口 —— 只 lint **git 已跟踪** 的脚本。
 *
 * 为什么不用 `eslint .`：
 *   这个仓库根目录下常年堆着一次性探针、`_backup_*` 历史副本、`verify_*.cjs` 验收脚本
 *   （都在 .gitignore 里，但 eslint 不读 .gitignore）。直接 `eslint .` 会把它们当成源码，
 *   报出一堆「解析失败」「模板字符串」，噪音盖掉真信号。
 *
 *   改用 `git ls-files --cached --others --exclude-standard` 取文件集 —— 与发布闸
 *   `scripts/check.cjs` 的语法检查完全同一套口径：**已跟踪 + 未跟踪但未被忽略**。
 *   好处是新写的文件不用 `git add` 就已经在闸内，而被忽略的临时产物永远进不来。
 *
 * 用法：
 *   npm run lint          # 全量
 *   npx eslint mod/inline-09.js mod/plot-editor.js   # 只看指定文件（走同一份 config）
 */

const { execFileSync, spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

const EXCLUDE_PREFIXES = [
  'feature-archive/', // 功能归档快照，不参与发布
  'pwa/vendor/'       // 第三方 minify 打包
];

const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', '*.js', '*.cjs', '*.mjs'],
  { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
)
  .split('\0')
  .filter(Boolean)
  .filter(f => !EXCLUDE_PREFIXES.some(p => f.startsWith(p)))
  .filter(f => !f.endsWith('.min.js'));

if (files.length === 0) {
  console.error('lint: 没有找到任何已跟踪脚本，检查 git 状态');
  process.exit(1);
}

console.log(`lint: ${files.length} 个脚本（已跟踪 + 未跟踪但未被忽略）`);

const eslintBin = path.join(root, 'node_modules', 'eslint', 'bin', 'eslint.js');
const extraArgs = process.argv.slice(2);   // 透传，如 `node scripts/lint.cjs --fix --debug`
const result = spawnSync(process.execPath, [eslintBin, ...files, '--max-warnings', '0', ...extraArgs], {
  cwd: root,
  stdio: 'inherit'
});

if (result.error) {
  console.error('lint: eslint 启动失败 ——', result.error.message);
  console.error('      先跑 `npm install`（eslint 是 devDependency）');
  process.exit(1);
}

process.exitCode = result.status === 0 ? 0 : 1;
