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
 * 所以本文件只做「零依赖 + 纯文本」那一层，把三类最容易在改动中被静默改坏、
 * 而本地又没人跑的问题拦在推送/PR 上：
 *   ① 内联 <script> 语法（vm.Script 编译，不执行、无副作用）；
 *   ② HTML 内重复 id（**先剥 <script> 体与注释**，否则注释里引用的 id 会假红）；
 *   ③ 常量单一来源（管径 CAL_SERIES / PE_OD_SERIES、单价 TL_PIPE_PRICE_DEF 各只允许一处定义）。
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

let pass = 0, fail = 0;
function check(name, ok, extra) {
  console.log((ok ? '  ✓ ' : '  ✗ FAIL ') + name + (extra ? ' — ' + extra : ''));
  if (ok) pass++; else fail++;
}

const html = fs.readFileSync(INDEX, 'utf8');

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

console.log('\n== ci_check_static：PASS=' + pass + ' FAIL=' + fail + ' ==');
process.exit(fail ? 1 : 0);
