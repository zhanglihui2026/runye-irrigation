#!/usr/bin/env node
/* =====================================================================
 * ci_check_static.cjs — CI 可跑的「零依赖静态闸门」（2026-10-02 v184 / P6）
 *
 * 为什么单独有这么一个文件（而不是直接跑 verify_ry_tool.js）：
 *   · verify_ry_tool.js（178 项 DOM/JS 契约）与 verify_settings.js 都被 .gitignore 的
 *     `verify_*.js` 排除 —— **不在版本库里** ⇒ GitHub Actions 的 checkout 上看不到它们；
 *   · `tests/` 目录整体被 .gitignore 排除（既有 13 个测试因「已跟踪」而保留在库中）；
 *   · 浏览器 smoke（tests/*.smoke.cjs）需要本机 Edge + puppeteer-core，CI 跑不了
 *     —— 它们仍由本机批跑 `_p1/_gates.cjs` 覆盖（P1/P5 的 5 条已纳入该批跑清单）。
 * 所以本文件只做「零依赖 + 纯文本」那一层，把四类最容易在改动中被静默改坏、
 * 而本地又没人跑的问题拦在推送/PR 上：
 *   ① 内联 <script> 语法（vm.Script 编译，不执行、无副作用）；
 *   ② HTML 内重复 id（**先剥 <script> 体与注释**，否则注释里引用的 id 会假红）；
 *   ③ 常量单一来源（管径 CAL_SERIES / PE_OD_SERIES、单价 TL_PIPE_PRICE_DEF 各只允许一处定义）；
 *   ⑥ 面板皮肤「双副本」不许漂移（scripts/check_panel_drift.cjs，v532）；
 *   ⑦ 全局滚动条只允许在 runye-theme.css 定义一次（v533）；
 *   ④ 主页面关键同步脚本的依赖顺序正确；主页面本地脚本、样式表、样式表本地 url()
 *      资源及插件清单声明的 manifest/入口与 Service Worker CORE 清单一致，未缓存项必须
 *      登记为有明确降级行为的可选项，且 CORE 资源必须存在且不重复。
 * 退出码：全过 0，任一不过 1（CI 靠退出码判定，别只 console.log 不设码）。
 *
 * 用法：node ci_check_static.cjs
 * ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const INDEX = path.join(ROOT, 'index.html');
const SW = path.join(ROOT, 'sw.js');

let pass = 0, fail = 0;
function check(name, ok, extra) {
  console.log((ok ? '  ✓ ' : '  ✗ FAIL ') + name + (extra ? ' — ' + extra : ''));
  if (ok) pass++; else fail++;
}

/* [v357] 单文件已拆分：mod/ 外链拼回虚拟单文件视图，①②③ 锚不变 */
const expandIndex = require('./expand_index.cjs');
const indexSource = fs.readFileSync(INDEX, 'utf8');
const html = expandIndex(INDEX);
const sw = fs.readFileSync(SW, 'utf8');

/* ---------- ① 内联 <script> 语法 ---------- */
const inline = [];
const reScript = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
let m;
while ((m = reScript.exec(html)) !== null) {
  if (/\bsrc\s*=/.test(m[1])) continue;          // 外链脚本跳过
  if (/\btype\s*=\s*["']?(?!text\/javascript|module|application\/javascript)/i.test(m[1])) continue;
  inline.push({ code: m[2], line: html.slice(0, m.index).split('\n').length + 1 });
}
let syntaxBad = [];
inline.forEach((b, i) => {
  try { new vm.Script(b.code, { filename: 'index.html#inline' + (i + 1) + '(line ' + b.line + ')' }); }
  catch (e) { syntaxBad.push('#' + (i + 1) + '@行' + b.line + ' ' + e.message); }
});
check('① 内联 <script> 语法（共 ' + inline.length + ' 段，vm.Script 编译）',
  inline.length > 0 && syntaxBad.length === 0, syntaxBad.slice(0, 3).join(' | '));

/* ---------- ② HTML 内重复 id ---------- */
/* 先剥 <script>…</script> 与 <style>…</style> 体（JS 里拼的 HTML 字符串不属于静态 DOM，
   CSS 注释里引用的 id 也不是元素 —— plotLibStyle 的两次历史假红，一次来自 <style> 内注释、
   一次来自 <!-- --> 注释），再剥 <!-- … -->。 */
const htmlOnly = html
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
  .replace(/<!--[\s\S]*?-->/g, '');
const ids = {};
const reId = /\bid\s*=\s*["']([^"']+)["']/g;
let k;
while ((k = reId.exec(htmlOnly)) !== null) { ids[k[1]] = (ids[k[1]] || 0) + 1; }
const dupIds = Object.keys(ids).filter((x) => ids[x] > 1);
check('② HTML 内 id 唯一（静态 DOM 共 ' + Object.keys(ids).length + ' 个 id）',
  dupIds.length === 0, dupIds.map((x) => x + '×' + ids[x]).join(','));

/* ---------- ④ 主页面脚本顺序与离线 CORE ---------- */
const coreMatch = sw.match(/const CORE = \[([\s\S]*?)\n\];/);
const coreSource = coreMatch ? coreMatch[1] : '';
const coreEntries = [...coreSource.matchAll(/^\s*"([^"\r\n]+)"\s*,?(?:\s*\/\*[^\r\n]*\*\/)?\s*$/gm)]
  .map((entry) => entry[1]);
const coreSet = new Set(coreEntries);
const localPageScripts = new Set();
const missingPageScripts = [];
const pageScriptTags = [...indexSource.matchAll(/<script\b([^>]*)>/gi)];
const orderedPageScripts = [];
for (const match of pageScriptTags) {
  const attrs = match[1];
  const srcMatch = attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
  if (!srcMatch) continue;
  let url;
  try { url = new URL(srcMatch[1], 'https://runye.invalid/'); } catch (_) { continue; }
  if (url.origin !== 'https://runye.invalid') continue;
  const asset = decodeURIComponent(url.pathname.replace(/^\//, ''));
  orderedPageScripts.push({ asset, attrs });
  localPageScripts.add(asset);
  if (!fs.existsSync(path.join(ROOT, asset))) missingPageScripts.push(asset);
}
const localPageStylesheets = new Set();
const missingPageStylesheets = [];
for (const match of indexSource.matchAll(/<link\b([^>]*)>/gi)) {
  const attrs = match[1];
  if (!/\brel\s*=\s*["']?stylesheet\b/i.test(attrs)) continue;
  const hrefMatch = attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i);
  if (!hrefMatch) continue;
  let url;
  try { url = new URL(hrefMatch[1], 'https://runye.invalid/'); } catch (_) { continue; }
  if (url.origin !== 'https://runye.invalid') continue;
  const asset = decodeURIComponent(url.pathname.replace(/^\//, ''));
  localPageStylesheets.add(asset);
  if (!fs.existsSync(path.join(ROOT, asset))) missingPageStylesheets.push(asset);
}
const localStylesheetAssets = new Set();
const missingStylesheetAssets = [];
for (const stylesheet of localPageStylesheets) {
  let source;
  try { source = fs.readFileSync(path.join(ROOT, stylesheet), 'utf8'); }
  catch (_) { continue; }
  for (const match of source.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
    const reference = match[1].trim();
    if (!reference || reference[0] === '#' || /^(?:data:|blob:|https?:)/i.test(reference)) continue;
    let url;
    try { url = new URL(reference, 'https://runye.invalid/' + stylesheet); } catch (_) { continue; }
    if (url.origin !== 'https://runye.invalid') continue;
    const asset = decodeURIComponent(url.pathname.replace(/^\//, ''));
    localStylesheetAssets.add(asset);
    if (!fs.existsSync(path.join(ROOT, asset))) missingStylesheetAssets.push(asset);
  }
}

/* index.html 的经典脚本执行顺序是同步依赖契约。CORE 资源检查使用原始入口，
   因 expandIndex 会把 mod/ 外链替换成内联正文，不能从展开视图恢复真实资源列表或顺序。 */
const scriptOrderRules = [
  ['mod/material-formulas.js', 'mod/material-table.js'],
  ['mod/material-table.js', 'mod/inline-09.js'],
  ['mod/tl-polyline-geometry.js', 'mod/inline-09.js'],
  ['mod/plan-calc-render.js', 'mod/inline-09.js'],
  ['mod/inline-09.js', 'mod/tl-header-layout.js'],
  ['mod/inline-11.js', 'mod/plot-editor.js'],
  ['mod/head-system-svg.js', 'mod/inline-14.js']
];
const scriptOrderErrors = [];
for (const [before, after] of scriptOrderRules) {
  const beforeMatches = orderedPageScripts.filter((item) => item.asset === before);
  const afterMatches = orderedPageScripts.filter((item) => item.asset === after);
  if (beforeMatches.length !== 1 || afterMatches.length !== 1) {
    scriptOrderErrors.push(`${before} → ${after}：两项都必须在 index.html 中且各出现一次`);
    continue;
  }
  const beforeIndex = orderedPageScripts.indexOf(beforeMatches[0]);
  const afterIndex = orderedPageScripts.indexOf(afterMatches[0]);
  if (beforeIndex >= afterIndex) scriptOrderErrors.push(`${before} 必须先于 ${after}`);
}
const synchronousScriptAssets = [...new Set(scriptOrderRules.flat())];
for (const asset of synchronousScriptAssets) {
  const item = orderedPageScripts.find((candidate) => candidate.asset === asset);
  if (item && (/\b(?:async|defer)(?=\s|=|$)/i.test(item.attrs) || /\btype\s*=\s*["']module["']/i.test(item.attrs))) {
    scriptOrderErrors.push(`${asset} 必须保持同步经典脚本`);
  }
}
check('④a 同步脚本依赖顺序', scriptOrderErrors.length === 0, scriptOrderErrors.join(' | '));

/* CloudBase 仅提供云端能力；cloud-sync.js 在 SDK 缺失时保留本地模式。 */
const optionalPageScripts = new Map([
  ['pwa/vendor/cloudbase-js-sdk-3.8.2.bundle.js', '云端 SDK 可选；缺失时 cloud-sync.js 降级到本地模式']
]);
const notCached = [...localPageScripts].filter((asset) => !coreSet.has(asset) && !optionalPageScripts.has(asset));
const uncachedPageStylesheets = [...localPageStylesheets].filter((asset) => !coreSet.has(asset));
const uncachedStylesheetAssets = [...localStylesheetAssets].filter((asset) => !coreSet.has(asset));
const missingCoreFiles = coreEntries.filter((asset) => !fs.existsSync(path.join(ROOT, asset)));
const duplicateCoreEntries = coreEntries.filter((asset, index) => coreEntries.indexOf(asset) !== index);
const pluginAssets = ['plugins.json'];
const pluginManifestErrors = [];
const pluginStylesheets = new Set();
try {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'plugins.json'), 'utf8'));
  for (const plugin of (Array.isArray(config.plugins) ? config.plugins : [])) {
    const base = String(plugin.path || '').replace(/\\/g, '/').replace(/\/+$/, '') + '/';
    const manifestPath = base + 'manifest.json';
    pluginAssets.push(manifestPath);
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, manifestPath), 'utf8'));
      const entryAsset = base + (manifest.entry || 'main.js');
      pluginAssets.push(entryAsset);
      const entrySource = fs.readFileSync(path.join(ROOT, entryAsset), 'utf8');
      /* 插件经 import.meta.url 拼出的本地脚本/样式也属于运行时资源契约。
         例如 contour-dxf 懒加载 terrain-core.js，多个插件在 activate 时再挂 style.css。 */
      for (const reference of entrySource.matchAll(/new\s+URL\(\s*["']([^"']+\.(?:css|js|mjs|json|wasm|svg|png|jpe?g|gif|woff2?))([?#][^"']*)?["']\s*,\s*import\.meta\.url\s*\)/gi)) {
        const resource = path.posix.normalize(path.posix.join(path.posix.dirname(entryAsset), reference[1]));
        pluginAssets.push(resource);
        if (/\.css$/i.test(resource)) pluginStylesheets.add(resource);
      }
      /* 覆盖通过路径常量拼出 SITE_ROOT + file 的串行脚本注入（例如 CORE_CHAIN/CORE_FILE）。 */
      for (const reference of entrySource.matchAll(/\b(?:file\s*:|CORE_FILE\s*=)\s*["']([^"']+\.(?:js|mjs))["']/gi)) {
        pluginAssets.push(reference[1].replace(/\\/g, '/'));
      }
    } catch (error) {
      pluginManifestErrors.push(manifestPath + '：' + error.message);
    }
  }
} catch (error) {
  pluginManifestErrors.push('plugins.json：' + error.message);
}
const missingPluginAssets = pluginAssets.filter((asset) => !fs.existsSync(path.join(ROOT, asset)));
const uncachedPluginAssets = pluginAssets.filter((asset) => !coreSet.has(asset));
const pluginStyleDependencies = new Set();
const missingPluginStyleDependencies = [];
for (const stylesheet of pluginStylesheets) {
  let source;
  try { source = fs.readFileSync(path.join(ROOT, stylesheet), 'utf8'); }
  catch (_) { continue; }
  for (const match of source.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
    const reference = match[1].trim();
    if (!reference || reference[0] === '#' || /^(?:data:|blob:|https?:)/i.test(reference)) continue;
    let url;
    try { url = new URL(reference, 'https://runye.invalid/' + stylesheet); } catch (_) { continue; }
    if (url.origin !== 'https://runye.invalid') continue;
    const asset = decodeURIComponent(url.pathname.replace(/^\//, ''));
    pluginStyleDependencies.add(asset);
    if (!fs.existsSync(path.join(ROOT, asset))) missingPluginStyleDependencies.push(asset);
  }
}
const uncachedPluginStyleDependencies = [...pluginStyleDependencies].filter((asset) => !coreSet.has(asset));
check('④ 主页面本地脚本/样式表已纳入 Service Worker CORE（可选脚本须有明确降级理由）',
  !!coreMatch && notCached.length === 0 && uncachedPageStylesheets.length === 0 && uncachedStylesheetAssets.length === 0 && missingCoreFiles.length === 0 && missingPageScripts.length === 0 && missingPageStylesheets.length === 0 && missingStylesheetAssets.length === 0 && duplicateCoreEntries.length === 0 &&
    missingPluginAssets.length === 0 && uncachedPluginAssets.length === 0 && missingPluginStyleDependencies.length === 0 && uncachedPluginStyleDependencies.length === 0 && pluginManifestErrors.length === 0,
  [
    notCached.length ? '未缓存：' + notCached.join(', ') : '',
    uncachedPageStylesheets.length ? '样式表未缓存：' + uncachedPageStylesheets.join(', ') : '',
    uncachedStylesheetAssets.length ? '样式依赖未缓存：' + uncachedStylesheetAssets.join(', ') : '',
    missingCoreFiles.length ? 'CORE 文件缺失：' + missingCoreFiles.join(', ') : '',
    missingPageScripts.length ? '页面脚本文件缺失：' + missingPageScripts.join(', ') : '',
    missingPageStylesheets.length ? '页面样式表文件缺失：' + missingPageStylesheets.join(', ') : '',
    missingStylesheetAssets.length ? '样式依赖文件缺失：' + missingStylesheetAssets.join(', ') : '',
    duplicateCoreEntries.length ? 'CORE 重复：' + duplicateCoreEntries.join(', ') : '',
    missingPluginAssets.length ? '插件文件缺失：' + missingPluginAssets.join(', ') : '',
    uncachedPluginAssets.length ? '插件资源未缓存：' + uncachedPluginAssets.join(', ') : '',
    missingPluginStyleDependencies.length ? '插件样式依赖缺失：' + missingPluginStyleDependencies.join(', ') : '',
    uncachedPluginStyleDependencies.length ? '插件样式依赖未缓存：' + uncachedPluginStyleDependencies.join(', ') : '',
    pluginManifestErrors.length ? '插件清单错误：' + pluginManifestErrors.join('; ') : '',
    optionalPageScripts.size ? '显式可选：' + [...optionalPageScripts].map(([asset, reason]) => asset + '（' + reason + '）').join('; ') : ''
  ].filter(Boolean).join(' | '));

/* ---------- ③ 常量单一来源 ---------- */
function countDef(re) { return (html.match(re) || []).length; }
const calDef = countDef(/const CAL_SERIES = \[/g);
const peDef = countDef(/const PE_OD_SERIES = \[/g);
const priceDef = countDef(/var TL_PIPE_PRICE_DEF = \{/g);
check('③a 管径档位单一来源：CAL_SERIES 定义 1 处 / PE_OD_SERIES 定义 1 处',
  calDef === 1 && peDef === 1, 'CAL=' + calDef + ' PE_OD=' + peDef);
check('③b 管材单价默认表单一来源：TL_PIPE_PRICE_DEF 定义 1 处',
  priceDef === 1, 'n=' + priceDef);
/* 三处消费点必须引用同一全局（防有人把字面量塞回去） */
const priceRefs = ['var DEF=TL_PIPE_PRICE_DEF;', 'var PRICES_DEFAULT = TL_PIPE_PRICE_DEF;',
  'var PDEF = TL_PIPE_PRICE_DEF;'].filter((r) => html.indexOf(r) < 0);
check('③c 单价表三个消费点均引用同一全局', priceRefs.length === 0,
  priceRefs.length ? '缺引用：' + priceRefs.join(' | ') : '3/3');
/* 引用计数：定义之外至少各有一处使用，防「收敛成孤儿常量」 */
const calUse = countDef(/CAL_SERIES/g), peUse = countDef(/PE_OD_SERIES/g);
check('③d 常量确有使用点（不是收敛成孤儿）', calUse > 1 && peUse > 1 && priceDef >= 1,
  'CAL 出现 ' + calUse + ' 次 / PE_OD 出现 ' + peUse + ' 次');

/* ---------- ⑥ 面板双副本漂移（v532） ---------- */
/* 地块分区/三级管路的左栏在 body.ry-tool 下被 ry-cad-toolbar.js 搬进 #ryCadSide，
   搬走后 `#X .pp-yyy` 不再匹配 ⇒ index.html 内联 <style> 里长期存在一份换前缀的孪生规则
   （`#ryCadSide [data-pp="X"] .pp-yyy`）。这两份**必须逐条同值**，且无法合并
   （副本特异性 (1,1,0) 比原版高一级，是 rail 态赢过竞争者的依据；v531 试过合并，
   A/B 实测 base 60~74 处、rail 113~120 处视觉变化，已回滚）。这里只守「不许漂移」：
   v530 删 style-01 的 .pp-side{border-radius:12px} 时内联没跟上，正是该闸门要拦的形态。 */
const driftRes = require('child_process').spawnSync(process.execPath,
  [path.join(ROOT, 'scripts', 'check_panel_drift.cjs')], { encoding: 'utf8' });
const driftLines = (driftRes.stdout || '').trim().split('\n');
check('⑥ 面板双副本无新增漂移（index.html 的 rail 副本 vs mod/style-01.css / mod/ry-panel.css）',
  driftRes.status === 0,
  driftLines[driftLines.length - 1] || (driftRes.stderr || '').slice(0, 200));

/* ---------- ⑦ 全局滚动条单一出处（v533） ---------- */
/* `*::-webkit-scrollbar` 是纯特异性 0 的全局规则，谁后加载谁赢 ⇒ 历史上 index.html 内联、
   mod/style-05.css、terrain/terrain.css 各复制了一份（值还各不相同：5px 绿 / 4px 灰 / 5px 灰绿）。
   v533 实测三处副本从未生效（runye-theme.css 在 :head 里最后加载，通用滚动条恒为
   4px + rgba(100,116,139,.45) + 圆角 999px），已全部删除，只留 runye-theme.css 一处。
   本项守「不许再复制」：容器级细条（`.pp-side`、`#ryCadSide .ry-cad-grps` 等选择器更具体的）
   不在此列，那是真在生效的例外。 */
const SCROLLBAR_OWNER = 'runye-theme.css';
const scrollbarScopeDirs = ['', 'mod', 'terrain', 'hydraulic-calc', 'filter-system', 'tl-workspace', 'modeling', 'digital-agriculture'];
const scrollbarFiles = [];
for (const dir of scrollbarScopeDirs) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) continue;
  for (const name of fs.readdirSync(abs)) {
    if (!/\.(css|html)$/i.test(name)) continue;
    scrollbarFiles.push(path.posix.join(dir, name));
  }
}
const scrollbarViolations = [];
for (const rel of scrollbarFiles) {
  if (rel === SCROLLBAR_OWNER) continue;
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  src.split('\n').forEach((line, i) => {
    if (/^\s*\*::-(webkit-)?scrollbar/.test(line)) scrollbarViolations.push(rel + ':' + (i + 1));
  });
}
const themeSrc = fs.readFileSync(path.join(ROOT, SCROLLBAR_OWNER), 'utf8');
const themeHasGlobal = /^\s*\*::-webkit-scrollbar\s*\{/m.test(themeSrc);
check('⑦ 全局滚动条只在 runye-theme.css 定义一次（容器级细条例外）',
  scrollbarViolations.length === 0 && themeHasGlobal,
  (themeHasGlobal ? '' : 'runye-theme.css 缺少 *::-webkit-scrollbar 定义；') +
  (scrollbarViolations.length ? '重复定义：' + scrollbarViolations.join(', ') : ''));

console.log('\n== ci_check_static：PASS=' + pass + ' FAIL=' + fail + ' ==');
process.exit(fail ? 1 : 0);
