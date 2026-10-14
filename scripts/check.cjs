#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

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

const files = listed.stdout.toString('utf8').split('\0').filter(Boolean);
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
if (run(`Node 单测（${tests.length} 个文件）`, node, ['--test', ...tests], { summary: true }) !== 0) process.exit(1);

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
