'use strict';
/* tests/version_sync.test.cjs —— 发布版本号「同抬」与 CORE 登记卫生
 *
 * 为什么要有这个文件（不是风格洁癖，是已经出过线上故障）：
 *   v632 那次只把 `sw.js` 的 VERSION 抬了，忘了抬 index.html 里 `style-01.css?v=`。
 *   结果老用户浏览器按旧的 `?v=` 命中 HTTP 缓存 ⇒ 拿到旧 CSS，界面看起来"没生效"，
 *   于是一路怀疑到 SW 和构建上去查，实际只差一个查询串。
 *   这个一致性到今天为止**只靠人记着**，没有任何脚本守它。
 *
 * 钉三件事：
 *   ① `sw.js` 的 `VERSION`（去掉开头的 v）必须逐字等于每个页面 `style-01.css?v=` 的值；
 *   ② 审计函数本身要被反向用例证明会红（拿合成文本喂它，不是只跑真仓库——真仓库全绿
 *      只说明"今天没坏"，不说明"坏了会响"）；
 *   ③ `CORE` 条目不许带 `?v=`：install 会按原样 addAll（带着查询串），而 fetch 侧按
 *      `key()`（抹掉查询串）去查 ⇒ 存的和查的不是同一个 key，离线必然 miss。
 *      名单里现在一条都没有，加一条就是给离线态埋一颗只在断网时才炸的雷。
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

/* ---------- 审计函数（纯函数，便于反向自检） ---------- */

function readVersion(swText) {
  const m = swText.match(/^const VERSION = '([^']+)';/m);
  return m ? m[1] : null;
}

function styleRefVersions(htmlText) {
  return [...htmlText.matchAll(/style-01\.css\?v=([^"'<>\s)]*)/g)].map((m) => m[1]);
}

/* version: sw.js 的 VERSION；pages: [{ path, text }]；返回不一致清单 */
function auditVersionSync(version, pages) {
  const want = version.replace(/^v/, '');
  const bad = [];
  for (const page of pages) {
    const got = styleRefVersions(page.text);
    if (!got.length) continue;
    const wrong = got.filter((v) => v !== want);
    if (wrong.length) bad.push({ path: page.path, want, got: wrong });
  }
  return bad;
}

function coreEntries(swText) {
  const m = swText.match(/const CORE = \[([\s\S]*?)\n\];/);
  if (!m) return null;
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

/* ---------- 真仓库 ---------- */
const swText = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

/* 生产页面：仓库根目录的 *.html（跳过 _ 开头的备份/探针页） */
const pages = fs.readdirSync(ROOT)
  .filter((f) => f.endsWith('.html') && !/^_/.test(f))
  .map((f) => ({ path: f, text: fs.readFileSync(path.join(ROOT, f), 'utf8') }));

test('发布纪律：sw.js 里存在 VERSION 常量', () => {
  const v = readVersion(swText);
  assert.ok(v, 'sw.js 里应有一行 `const VERSION = \'v...\';`（activate 靠它清旧缓存）');
  assert.ok(/^v/.test(v), 'VERSION 应以 v 开头，如 v836-coord-frame，实际 ' + v);
});

test('发布纪律：每个页面的 style-01.css?v= 都等于 sw VERSION 去 v', () => {
  const v = readVersion(swText);
  assert.ok(v, '先要有 VERSION 才能谈同抬');
  const bad = auditVersionSync(v, pages);
  assert.deepEqual(bad, [],
    '版本号没同抬（v632 就栽在这里：SW 抬了、CSS 查询串没抬 ⇒ 老用户命中旧缓存，界面"没生效"）。\n' +
    bad.map((b) => '  ' + b.path + '：sw=' + b.want + '，页面写的是 ' + b.got.join(' / ')).join('\n') + '\n' +
    '  ⇒ 要么把 VERSION 改成匹配页面，要么把页面的 ?v= 改成 ' + v.replace(/^v/, ''));
});

test('发布纪律：至少有一个页面真的引用了 style-01.css?v=（否则上一条是空断言）', () => {
  const withRef = pages.filter((p) => styleRefVersions(p.text).length > 0);
  assert.ok(withRef.length > 0,
    '没有页面引用 mod/style-01.css?v= —— 上一条测试会「因为没东西可比对」而恒绿，必须当成红处理');
});

/* ---------- ② 反向自检：审计函数真的会红 ---------- */
test('审计自检：版本不一致必须被点名（合成文本，不碰真仓库）', () => {
  const html = '<link rel="stylesheet" href="mod/style-01.css?v=835-old">';
  const bad = auditVersionSync('v836-coord-frame', [{ path: 'index.html', text: html }]);
  assert.equal(bad.length, 1, '版本不一致时审计函数必须报出来');
  assert.deepEqual(bad[0].got, ['835-old']);

  const ok = auditVersionSync('v836-coord-frame', [{ path: 'index.html', text: html.replace('835-old', '836-coord-frame') }]);
  assert.deepEqual(ok, [], '一致时不许有输出');

  const noRef = auditVersionSync('v836-coord-frame', [{ path: 'x.html', text: '<html></html>' }]);
  assert.deepEqual(noRef, [], '没引用这个样式表的页面跳过（如 plugin-admin.html）');
});

/* ---------- ③ CORE 名单不许带查询串 ---------- */
test('CORE 卫生：名单条目不许带 ?v=（addAll 存的 key 与 fetch 查的 key 会不一致）', () => {
  const entries = coreEntries(swText);
  assert.ok(entries && entries.length > 20, 'sw.js 的 CORE 名单没解析出来（' + (entries ? entries.length : 'null') + '）');
  const withQuery = entries.filter((e) => e.includes('?'));
  assert.deepEqual(withQuery, [],
    'CORE 里出现了带查询串的条目：' + withQuery.join(', ') + '\n' +
    '  install 按原样 addAll、fetch 按 key()（抹掉 ?v=）查 ⇒ 存查不同 key，离线必 miss。\n' +
    '  版本号请写在页面标签上，名单里写裸路径。');
});

test('CORE 卫生：名单里不许有空串或纯空白条目', () => {
  const entries = coreEntries(swText);
  assert.ok(entries, 'CORE 名单没解析出来');
  const empty = entries.filter((e) => !e.trim());
  assert.deepEqual(empty, [], 'CORE 里有空条目，addAll 会去请求当前目录');
});
