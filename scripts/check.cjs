#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const root = path.resolve(__dirname, '..');
const node = process.execPath;

function run(label, command, args, options = {}) {
  console.log(`\n== ${label} ==`);
  const summary = options.summary === true;
  delete options.summary;
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    ...options
  });
  if (result.stdout) {
    if (summary && result.status === 0) {
      const lines = result.stdout.split(/\r?\n/).filter(line =>
        /^(?:ℹ tests |ℹ pass |ℹ fail |ℹ skipped |== 结论：|== ci_check_static：|全部检查通过。)/.test(line)
      );
      process.stdout.write((lines.length ? lines.join('\n') : '通过。') + '\n');
    } else process.stdout.write(result.stdout);
  }
  if (result.stderr && !(summary && result.status === 0)) process.stderr.write(result.stderr);
  if (result.error) {
    console.error(`${label}: ${result.error.message}`);
    return 1;
  }
  return result.status === 0 ? 0 : (result.status || 1);
}

const listed = spawnSync('git', [
  'ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', '*.js', '*.cjs', '*.mjs'
], { cwd: root, encoding: 'buffer', maxBuffer: 16 * 1024 * 1024 });
if (listed.error || listed.status !== 0) {
  console.error(`无法通过 Git 枚举检查文件：${listed.error?.message || listed.stderr?.toString() || listed.status}`);
  process.exit(1);
}

// Git's cached path can retain the old name while a tracked file is moved into
// an untracked archive directory. Syntax-check files that exist at their
// current paths; ci_check_static separately verifies every runtime reference.
const files = listed.stdout.toString('utf8').split('\0').filter(file =>
  file && fs.existsSync(path.resolve(root, file))
);
if (files.length < 50) {
  console.error(`语法检查枚举到 ${files.length} 个 JS/CJS/MJS 文件，低于安全下限 50。`);
  process.exit(1);
}

let syntaxFailures = 0;
for (const file of files) {
  const result = spawnSync(node, ['--check', file], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) {
    syntaxFailures++;
    console.error(`\n语法错误：${file}`);
    if (result.stderr) process.stderr.write(result.stderr);
  }
}
console.log(`语法检查：${files.length} 个 JS/CJS/MJS 文件，失败 ${syntaxFailures} 个`);
if (syntaxFailures) process.exit(1);

// ESLint 静态检查（第二道：语法过关之后的字面/结构缺陷）。
// 口径见 eslint.config.js 文件头：第一轮只开「一报就是真缺陷」的规则，首跑必须 0 错。
// eslint 是 devDependency ⇒ 没跑过 npm install 的机器上跳过，不让发布闸因为缺依赖卡死。
const eslintBin = path.join(root, 'node_modules', 'eslint', 'bin', 'eslint.js');
if (fs.existsSync(eslintBin)) {
  if (run('ESLint 静态检查', node, ['scripts/lint.cjs']) !== 0) process.exit(1);
} else {
  console.log('\n== ESLint 静态检查 ==\nnode_modules/eslint 未安装，跳过（在本机跑一次 npm install 即自动纳入）。');
}

if (run('静态契约', node, ['ci_check_static.cjs']) !== 0) process.exit(1);

const listedTests = spawnSync('git', [
  'ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', 'tests/*.test.cjs'
], { cwd: root, encoding: 'buffer', maxBuffer: 8 * 1024 * 1024 });
if (listedTests.error || listedTests.status !== 0) {
  console.error(`无法通过 Git 枚举测试：${listedTests.error?.message || listedTests.stderr?.toString() || listedTests.status}`);
  process.exit(1);
}
const tests = listedTests.stdout.toString('utf8').split('\0').filter(Boolean).sort();
if (!tests.length) {
  console.error('没有找到可运行的 tests/*.test.cjs，拒绝以空测试集通过。');
  process.exit(1);
}

/* 盲区提示（只打印，不影响退出码）：
   `git ls-files --exclude-standard` 会漏掉 `.gitignore` 里的 tests/*，而本仓库的惯例是
   "新增测试要 git add -f"。忘了加就会得到一个**永远不会被执行**的测试文件 ——
   本地 `node --test tests/*.test.cjs` 照样绿（glob 不看 git），于是没人发现它没进闸门。
   2026-10-31 实测：磁盘 56 个、闸门只跑 47 个，差的 9 个全绿但从未拦过任何回归。
   把它们打印出来，让"看着有测试、其实没跑"这件事每次运行都可见。 */
const testsDir = path.join(root, 'tests');
const testsOnDisk = fs.existsSync(testsDir)
  ? fs.readdirSync(testsDir).filter((f) => f.endsWith('.test.cjs')).sort()
  : [];
const enumeratedTests = new Set(tests.map((p) => path.basename(p)));
const notEnumeratedTests = testsOnDisk.filter((f) => !enumeratedTests.has(f));
if (notEnumeratedTests.length) {
  console.log(`\n⚠ 有 ${notEnumeratedTests.length} 个测试文件因未入库而不会被执行（.gitignore 的 tests/* + --exclude-standard）：`);
  for (const f of notEnumeratedTests) console.log(`    tests/${f}`);
  console.log('    ⇒ 要让它们真正拦住回归：git add -f <文件>；入库后自动纳入本闸门。');
}

if (run(`Node 单测（${tests.length} 个文件）`, node, ['--test', ...tests], { summary: true }) !== 0) process.exit(1);

if (run('水力计算核心与 WASM 等价验证', node, ['hydraulic-calc/native/verify.cjs']) !== 0) process.exit(1);

const plotSmoke = path.join(root, 'tests', 'plot_merge.smoke.cjs');
const listedSmoke = spawnSync('git', [
  'ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', 'tests/plot_merge.smoke.cjs'
], { cwd: root, encoding: 'buffer' });
if (listedSmoke.error || listedSmoke.status !== 0) {
  console.error(`无法检查 plot_merge smoke 状态：${listedSmoke.error?.message || listedSmoke.stderr?.toString() || listedSmoke.status}`);
  process.exit(1);
}
if (listedSmoke.stdout.toString('utf8').split('\0').filter(Boolean).length) {
  if (run('地块拼接契约', node, ['--test', 'tests/plot_merge.smoke.cjs'], { summary: true }) !== 0) process.exit(1);
} else {
  console.log('\n== 地块拼接契约 ==\n未纳入 Git 的 tests/plot_merge.smoke.cjs，跳过。');
}

console.log('\n全部检查通过。');
