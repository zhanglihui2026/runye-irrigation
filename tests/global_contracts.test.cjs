'use strict';
/* tests/global_contracts.test.cjs —— 五个「无主全局」的**写入面**契约（v836 续）
 *
 * 为什么要有这个文件：
 *   AGENT_HANDOFF §26.75 的契约表只有人读，没有东西守。给 `measuredPolygon` 添第 13 个写点、
 *   或者给 `runyeSaveProject` 长出第二个实现，闸门一声不响 —— 而这两件事恰好最容易"顺手"做出来
 *   （新模块要地块多边形，就直接 `window.measuredPolygon = ...`）。这正是任务书里
 *   「关键模块契约」要防的东西：不是算错，是**多了一个没人知道的写者**。
 *
 * 粒度（想过才定成这样的）：
 *   钉 **文件集合**，不钉行号、不钉处数。行号随任何编辑漂；处数随合理重构变。
 *   而"又有一个新文件开始写这个全局"才是真正的契约破坏信号。
 *   处数只在失败信息里打印出来，帮忙定位。
 *
 * 扫描范围：运行时源码树 = 顶层 *.js + mod/ core/ plugins/ tl-workspace/ hydraulic-calc/ terrain/。
 *   刻意排除 `_*.js` / `verify_*.js` / `_backup*` / `_archive_*` / `feature-archive/`：
 *   它们不是发布链路的一部分。实测排除前 `measuredPolygon` 会数出「22 个文件」——
 *   那里面 18 个是旧备份和一次性截图脚本，这种基线毫无意义。
 *
 * ★ 正则必须带 `(?!=)`：
 *     `window.runyeSaveProject === 'function'` 在 `window\.X\s*=` 下也算命中。
 *   v836 第一版盘点就是这么把 plugins/ai-plan 的两处「读+调用」误报成了写点，
 *   差点得出"有 3 个实现"的错误结论。下面有一条测试专门钉住这个陷阱。
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SRC_DIRS = ['mod', 'core', 'plugins', 'tl-workspace', 'hydraulic-calc', 'terrain'];
const SKIP_DIR = /^(node_modules|feature-archive|_)/;
const SKIP_FILE = /^(_|verify_)/;

/* ---------- 扫描器 ---------- */

/* 写点计数。`(?!=)` 排除 `===`/`==` 比较（见文件头）。 */
function countWrites(text, name) {
  const re = new RegExp('window\\.' + name + '\\s*=(?!=)', 'g');
  return (text.match(re) || []).length;
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIR.test(entry.name)) continue;
      walk(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.js') && !SKIP_FILE.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function sourceFiles() {
  const files = [];
  for (const f of fs.readdirSync(ROOT)) {
    if (f.endsWith('.js') && !SKIP_FILE.test(f)) files.push(path.join(ROOT, f));
  }
  for (const d of SRC_DIRS) {
    const full = path.join(ROOT, d);
    if (fs.existsSync(full)) walk(full, files);
  }
  return files;
}

/* 返回 { 'mod/inline-12.js': 3, ... }，只列真有写点的文件 */
function writersOf(name) {
  const hits = {};
  for (const file of sourceFiles()) {
    const n = countWrites(fs.readFileSync(file, 'utf8'), name);
    if (n > 0) hits[path.relative(ROOT, file).split(path.sep).join('/')] = n;
  }
  return hits;
}

/* ---------- 基线（= AGENT_HANDOFF §26.75 契约表的实测值） ---------- */
const EXPECTED = {
  tlDiagramData: {
    'mod/inline-09.js': 1, 'mod/inline-12.js': 3, 'mod/plot-editor.js': 1
  },
  measuredPolygon: {
    'mod/inline-09.js': 1, 'mod/inline-10.js': 1, 'mod/inline-12.js': 2,
    'mod/inline-13.js': 2, 'mod/inline-16.js': 4, 'mod/inline-29.js': 2
  },
  currentPlotId: {
    'mod/inline-10.js': 1, 'mod/inline-12.js': 1, 'mod/inline-13.js': 6, 'mod/inline-16.js': 1
  },
  measuredArea: {
    'mod/inline-10.js': 1, 'mod/inline-11.js': 1, 'mod/inline-12.js': 1,
    'mod/inline-13.js': 1, 'mod/inline-16.js': 2
  },
  runyeSaveProject: {
    'mod/inline-12.js': 1
  }
};

const fmt = (o) => Object.keys(o).sort().map((k) => k + '×' + o[k]).join(', ');

/* ---------- ① 写入文件集合不许变 ---------- */
for (const [name, expected] of Object.entries(EXPECTED)) {
  test('契约面：window.' + name + ' 的写入文件集合不变', () => {
    const actual = writersOf(name);
    const got = Object.keys(actual).sort();
    const want = Object.keys(expected).sort();
    const added = got.filter((f) => !want.includes(f));
    const removed = want.filter((f) => !got.includes(f));
    assert.deepEqual(got, want,
      'window.' + name + ' 的写入面变了。\n' +
      (added.length ? '  新增写者：' + added.join(', ') + '\n' : '') +
      (removed.length ? '  消失写者：' + removed.join(', ') + '\n' : '') +
      '  当前实测：' + fmt(actual) + '\n' +
      '  ⇒ 这是「无单一所有者」的全局，加写者前先读 AGENT_HANDOFF §26.75 契约表，\n' +
      '     确认不会与其它模块抢值；确认后同步更新本文件的 EXPECTED 与那张表。');
  });
}

/* ---------- ② 架构约束：核心/插件层不许写主页全局 ---------- */
test('架构约束：core/ 与 plugins/ 不写这五个主页全局（它们只消费）', () => {
  const offenders = [];
  for (const name of Object.keys(EXPECTED)) {
    for (const file of Object.keys(writersOf(name))) {
      if (file.startsWith('core/') || file.startsWith('plugins/')) offenders.push(file + ' → ' + name);
    }
  }
  assert.deepEqual(offenders, [],
    'core/ 是插件侧的访问层（只经 bootstrap.js → ctx.data 暴露），plugins/ 只消费主页状态。\n' +
    '  出现写入说明有人在把插件体系反向接进主流程：' + offenders.join('; '));
});

/* ---------- ③ runyeSaveProject 只能有一个实现 ---------- */
test('唯一实现：window.runyeSaveProject 全站只有一个赋值点', () => {
  const actual = writersOf('runyeSaveProject');
  const lines = Object.values(actual).reduce((a, b) => a + b, 0);
  assert.equal(lines, 1,
    'window.runyeSaveProject 出现了 ' + lines + ' 个赋值点（' + fmt(actual) + '）。\n' +
    '  存档入口必须唯一：多一份实现 = 两份快照格式，而 restore 只认其中一份（静默丢档）。');
  assert.deepEqual(Object.keys(actual), ['mod/inline-12.js'],
    'runyeSaveProject 的唯一实现应在 mod/inline-12.js（§26.75 记录的位置）');
});

/* ---------- ④ 扫描器自检：别把 === 当赋值 ---------- */
test('扫描器自检：比较运算不算写入（第一版盘点就栽在这）', () => {
  assert.equal(countWrites("if (typeof window.runyeSaveProject === 'function') {}", 'runyeSaveProject'), 0,
    '`===` 被判成了写入 —— 这会把所有"读+调用"方误报成实现');
  assert.equal(countWrites('if (window.measuredPolygon == null) {}', 'measuredPolygon'), 0, '`==` 同样不算');
  assert.equal(countWrites('window.runyeSaveProject = fn;', 'runyeSaveProject'), 1);
  assert.equal(countWrites('window.measuredPolygon=[];', 'measuredPolygon'), 1, '无空格的写法也要算');
  assert.equal(countWrites('window.measuredPolygonX = 1;', 'measuredPolygon'), 0,
    '名字前缀相同的另一个全局不许被误算');
});

/* ---------- ⑤ 文档与代码不许漂开 ---------- */
test('契约表在场：AGENT_HANDOFF §26.75 仍记录着这五个全局', () => {
  const doc = fs.readFileSync(path.join(ROOT, 'AGENT_HANDOFF.md'), 'utf8');
  assert.ok(doc.includes('关键模块契约盘点'), '§26.75 的标题被改了？');
  for (const name of Object.keys(EXPECTED)) {
    assert.ok(doc.includes('`window.' + name + '`'), '§26.75 契约表里找不到 window.' + name);
  }
  /* measuredPolygon 12 处这条是 v836 实测修正的（上一版写 10 处，漏了 inline-09 的防御性回填） */
  assert.ok(/measuredPolygon[\s\S]{0,200}12 处/.test(doc),
    '§26.75 应记录 measuredPolygon = 12 处 / 6 文件（含 inline-09:1782 的防御性回填）');
});

console.log('global_contracts：5 个无主全局的写入面 × 架构分层 × 存档唯一性 已锁定');
