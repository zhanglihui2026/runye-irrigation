'use strict';
/* 死规则清理：按审计 JSON 里「从不命中」的选择器，删除对应 CSS 规则。
   只删「整组选择器全死」的规则；带状态伪类/伪元素/移动端前缀的一律跳过（这些是探针假阴性）。

   用法：
     node _prune_dead_css.mjs <目标文件> [--audit=_audit_panel_css.json] [--sheet=mod/style-01.css] [--write]
     node _prune_dead_css.mjs mod/style-01.css --sheet=mod/style-01.css          # 只报告
     node _prune_dead_css.mjs mod/style-01.css --sheet=mod/style-01.css --write  # 落盘

   目标文件可以是 .css，也可以是 .html（会逐个 <style> 块处理）。 */
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const target = args[0];
if (!target) { console.error('缺少目标文件'); process.exit(1); }
const getArg = (k, d) => { const a = args.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=').slice(1).join('=') : d; };
const WRITE = args.includes('--write');
const AUDIT = getArg('audit', '_audit_panel_css.json');
const SHEET = getArg('sheet', '');
const RISKY = /(ry-mobile|:hover|:focus|:active|:visited|:checked|:disabled|:not\(|::|@|html\.ry-|\.ry-wdrag)/;

const audit = JSON.parse(fs.readFileSync(AUDIT, 'utf8'));
/* ⚠ 必须是「两态都不命中」的交集：只取并集会把 rail 专属副本（如
   #ryCadSide [data-pp=...] .pp-side）判死，删了会直接掉皮肤（v540 实测回归）。 */
const skipped = [];
const deadByState = { rail: new Set(), base: new Set() };
for (const key of ['rail', 'base']) {
  const list = (audit[key] && audit[key].deadPanel) || [];
  for (const raw of list) {
    const m = raw.match(/^(.*?) \{(.*)\}$/);
    if (!m) continue;
    const sheet = m[1], sel = m[2];
    if (SHEET && sheet !== SHEET) continue;
    if (RISKY.test(sel)) { if (key === 'rail') skipped.push(sel); continue; }
    deadByState[key].add(sel.replace(/\s+/g, ' ').trim());
  }
}
/* 作用域收紧：整条选择器的每一段都必须落在面板作用域内。
   否则会误删「面板 + 别的工具」混编组（如 #pipePlanSection .pp-title, #areaTool .at-topbar h1）——
   那类规则在本轮两态里不命中，只是因为它所属的工具当时没显示。 */
const PANEL_SCOPE = /#(?:pipePlanSection|tlPipePlanSection|ppSide|tlSide|ryCadSide)\b|\[data-pp=/;
const inScope = sel => sel.split(',').every(p => PANEL_SCOPE.test(p));
const deadSet = new Set([...deadByState.rail].filter(x => deadByState.base.has(x) && inScope(x)));
const railOnly = [...deadByState.rail].filter(x => !deadByState.base.has(x));
const baseOnly = [...deadByState.base].filter(x => !deadByState.rail.has(x));

/* ── CSS 解析：返回顶层/媒体块内的所有 style 规则（含字节区间） ── */
function parseRules(text, from = 0, to = text.length, out = []) {
  let i = from;
  while (i < to) {
    /* 跳过空白与注释 */
    while (i < to && /\s/.test(text[i])) i++;
    if (text.startsWith('/*', i)) { const e = text.indexOf('*/', i + 2); i = e < 0 ? to : e + 2; continue; }
    if (i >= to) break;
    /* 读选择器（到 { 为止，括号/引号内不截断） */
    let j = i, depth = 0, quote = '';
    while (j < to) {
      const c = text[j];
      if (quote) { if (c === quote && text[j - 1] !== '\\') quote = ''; j++; continue; }
      if (c === '"' || c === "'") { quote = c; j++; continue; }
      if (c === '(' || c === '[') depth++;
      else if (c === ')' || c === ']') depth--;
      else if (c === '{' && depth <= 0) break;
      else if (c === '}' && depth <= 0) { j++; break; }   /* 乱序时跳过 */
      j++;
    }
    if (j >= to) break;
    if (text[j] !== '{') { i = j; continue; }
    const selector = text.slice(i, j).trim();
    /* 找配对 } */
    let k = j + 1, d2 = 1, q2 = '';
    while (k < to && d2 > 0) {
      const c = text[k];
      if (q2) { if (c === q2 && text[k - 1] !== '\\') q2 = ''; }
      else if (c === '"' || c === "'") q2 = c;
      else if (c === '{') d2++;
      else if (c === '}') d2--;
      k++;
    }
    const bodyStart = j + 1, bodyEnd = k - 1;
    if (/^@(media|supports|container|layer)/i.test(selector)) {
      parseRules(text, bodyStart, bodyEnd, out);           /* 递归进媒体块 */
    } else if (!selector.startsWith('@')) {
      out.push({ start: i, end: k, selector, bodyStart, bodyEnd });
    }
    i = k;
  }
  return out;
}

/* 选择器组里每一段都死 → 整条规则死 */
function ruleIsDead(sel) {
  const parts = sel.split(',').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (!parts.length) return false;
  return parts.every(p => deadSet.has(p));
}

function pruneCss(text, label) {
  const rules = parseRules(text);
  const doomed = rules.filter(r => ruleIsDead(r.selector));
  if (!doomed.length) return { text, removed: 0, bytes: 0, samples: [] };
  let out = text;
  for (let i = doomed.length - 1; i >= 0; i--) {
    const r = doomed[i];
    /* 连带吃掉行首缩进与后面的换行，避免留空行 */
    let s = r.start;
    while (s > 0 && (out[s - 1] === ' ' || out[s - 1] === '\t')) s--;
    out = out.slice(0, s) + out.slice(r.end);
  }
  return { text: out, removed: doomed.length, bytes: text.length - out.length, samples: doomed.slice(0, 5).map(d => d.selector) };
}

const full = path.resolve(target);
const raw = fs.readFileSync(full, 'utf8');
let result;
if (/\.html?$/i.test(full)) {
  /* 逐个 <style> 块处理 */
  let idx = 0;
  let total = { removed: 0, bytes: 0, samples: [] };
  const outHtml = raw.replace(/<style([^>]*)>([\s\S]*?)<\/style>/gi, (all, attrs, css) => {
    idx++;
    const r = pruneCss(css, 'style#' + idx);
    total.removed += r.removed; total.bytes += r.bytes;
    if (r.samples.length && total.samples.length < 5) total.samples = total.samples.concat(r.samples).slice(0, 5);
    if (r.removed) console.log('  <style> 块 #' + idx + ' 删除 ' + r.removed + ' 条');
    return '<style' + attrs + '>' + r.text + '</style>';
  });
  result = { text: outHtml, ...total };
} else {
  result = pruneCss(raw, target);
}

console.log('\n目标 ' + path.relative(process.cwd(), full) + (SHEET ? '  范围 ' + SHEET : ''));
console.log('  两态皆死选择器 ' + deadSet.size + ' 个（跳过状态伪类/移动端 ' + skipped.length + ' 个）');
console.log('  仅 rail 态死 ' + railOnly.length + ' 个、仅原位态死 ' + baseOnly.length + ' 个 —— 均保留不删');
console.log('  删除规则 ' + result.removed + ' 条，省 ' + result.bytes + ' 字符（' + (raw.length ? (result.bytes / raw.length * 100).toFixed(2) : 0) + '%）');
if (result.samples.length) result.samples.forEach(s => console.log('    例：' + s.slice(0, 100)));
if (WRITE && result.removed) { fs.writeFileSync(full, result.text); console.log('  ✓ 已写入'); }
else if (result.removed) console.log('  （未写入，加 --write 落盘）');
