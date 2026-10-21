#!/usr/bin/env node
'use strict';

/* Local verification aggregator. scripts/check.cjs remains the authoritative
 * CI/core gate; this command adds local browser and repository-specific gates
 * without reimplementing or duplicating the core checks.
 *
 * Usage:
 *   node scripts/gate.cjs [--filter=core|equiv|n02|pump|nav|panel]
 *   node scripts/gate.cjs --strict   # a skipped stage also fails the command
 *   node scripts/gate.cjs --list
 *   node scripts/gate.cjs --json
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const option = (name, fallback) => {
  const arg = argv.find((item) => item.startsWith(`--${name}=`));
  return arg ? arg.slice(name.length + 3) : fallback;
};
const FILTER = option('filter', '').toLowerCase();
const TIMEOUT = Number(option('timeout', 600000)) || 600000;
const STRICT = argv.includes('--strict');
const JSON_OUTPUT = argv.includes('--json');

const RUNTIME_MODULES = path.resolve(path.dirname(process.execPath), '..', 'node_modules');
const MODULE_PATHS = [...new Set([
  RUNTIME_MODULES, path.join(ROOT, 'node_modules'),
  ...(process.env.NODE_PATH || '').split(path.delimiter),
].filter((folder) => folder && fs.existsSync(folder)))];
const CHILD_ENV = { ...process.env };
if (MODULE_PATHS.length) CHILD_ENV.NODE_PATH = MODULE_PATHS.join(path.delimiter);

function canResolve(name) {
  return MODULE_PATHS.some((folder) => {
    try { require.resolve(name, { paths: [folder] }); return true; } catch (_) { return false; }
  });
}
function hasEdge() {
  return [process.env.EDGE_PATH,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe']
    .filter(Boolean).some((file) => fs.existsSync(file));
}

const stages = [
  /* verify_ry_tool.js 保留为历史源码审计工具，但当前执行会报告多个已废弃
   * 功能/旧导航契约（例如已剥离的 iso-diagram）。未经逐条重校前不纳入正式门禁，
   * 避免把旧预期冒充当前产品回归。 */
  { id: 'core', name: '核心门禁（scripts/check.cjs，含语法、静态契约、单测、水力与拼接）', script: 'scripts/check.cjs' },
  {
    id: 'equiv', name: '简化等价性证据比较（Puppeteer + 现存基线）', script: 'scripts/simplify-equivalence.cjs',
    browser: 'puppeteer-core',
    requires: ['_p1/baseline.json'],
    skip: '缺少等价性基线；采集当前快照不能证明此前改动等价',
  },
  {
    id: 'n02', name: 'N02 三入口地块回传（Playwright + Edge）',
    script: 'project-planning/验收记录/n02-three-entry.cjs', browser: 'playwright',
  },
  {
    id: 'pump', name: '管径/水泵恢复冒烟验收（Playwright + Edge）',
    script: 'tests/pipe_pump_restore.smoke.cjs', browser: 'playwright',
  },
  {
    id: 'nav', name: '导航紧凑与遮挡回归（Playwright + Edge）',
    script: 'scripts/nav-compact-acceptance.cjs', browser: 'playwright',
  },
  {
    id: 'panel', name: '面板漂移检查', script: 'scripts/check_panel_drift.cjs',
    requires: ['scripts/panel-drift-baseline.json'],
    skip: '缺少面板漂移基线；不能据此报告通过',
  },
];

function selectedStages() {
  if (!FILTER) return stages;
  return stages.filter((stage) => `${stage.id} ${stage.name}`.toLowerCase().includes(FILTER));
}

function runStage(stage) {
  const absent = (stage.requires || []).filter((file) => !fs.existsSync(path.join(ROOT, file)));
  if (absent.length) return { state: 'SKIPPED', ms: 0, note: `${stage.skip || '缺少前置材料'}：${absent.join(', ')}` };
  if (!fs.existsSync(path.join(ROOT, stage.script))) return { state: 'SKIPPED', ms: 0, note: `验收脚本缺失：${stage.script}` };
  if (stage.browser && !canResolve(stage.browser)) {
    return { state: 'SKIPPED', ms: 0, note: `当前 Node 环境无法解析 ${stage.browser}；请设置正确的 NODE_PATH` };
  }
  if (stage.browser && !hasEdge()) return { state: 'SKIPPED', ms: 0, note: '未找到 Microsoft Edge；可通过 EDGE_PATH 指定可执行文件' };

  const started = Date.now();
  const result = spawnSync(process.execPath, [stage.script], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    timeout: TIMEOUT, env: CHILD_ENV,
  });
  const ms = Date.now() - started;
  if (result.error?.code === 'ETIMEDOUT') return { state: 'FAIL', ms, note: `超过 ${Math.round(TIMEOUT / 1000)} 秒` };
  if (result.error) return { state: 'FAIL', ms, note: `执行失败：${result.error.message}` };

  const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
  const tail = output.split(/\r?\n/).filter(Boolean).slice(-8);
  return result.status === 0
    ? { state: 'PASS', ms, note: tail.at(-1) || '退出码 0' }
    : { state: 'FAIL', ms, note: `退出码 ${result.status}`, tail };
}

function main() {
    if (argv.includes('--list')) {
    for (const stage of stages) console.log(`${stage.id}\t${stage.name}`);
    return;
  }
  const selected = selectedStages();
  if (!selected.length) {
    console.error(`没有阶段匹配 --filter=${FILTER}`);
    process.exitCode = 2;
    return;
  }
  const results = [];
  for (const stage of selected) {
    if (!JSON_OUTPUT) process.stdout.write(`▶ ${stage.name} … `);
    const result = runStage(stage);
    results.push({ id: stage.id, name: stage.name, ...result });
    if (!JSON_OUTPUT) {
      console.log(`${result.state} (${(result.ms / 1000).toFixed(1)}s) ${result.note}`);
      for (const line of result.tail || []) console.log(`    ${line}`);
    }
  }
  const pass = results.filter((result) => result.state === 'PASS').length;
  const fail = results.filter((result) => result.state === 'FAIL').length;
  const skipped = results.filter((result) => result.state === 'SKIPPED').length;
  if (JSON_OUTPUT) console.log(JSON.stringify({ pass, fail, skipped, strict: STRICT, results }, null, 2));
  else {
    console.log(`\n汇总：PASS ${pass}，FAIL ${fail}，SKIPPED ${skipped}，共 ${results.length} 项`);
    if (skipped) console.log('SKIPPED 表示未验证；使用 --strict 可让跳过项导致命令失败。');
  }
  if (fail || (STRICT && skipped)) process.exitCode = 1;
}

main();
