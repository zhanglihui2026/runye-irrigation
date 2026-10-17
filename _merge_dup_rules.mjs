'use strict';
/* 合并「同值重复规则」：把归一化后同选择器、同声明的一批规则合成一条分组规则。
   ⚠ 不用 :is() 合并（v531 定论：:is 取最高特异性 ⇒ 原位分支被抬高一级 ⇒ 必回归）。
     这里改成逗号分组，每个分支保留自己原来的特异性，只把声明合并成一份。
   用法：node _merge_dup_rules.mjs <文件> [--write] [--dry]
        .css 直接处理；.html 逐个 <style> 块处理。 */
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const target = args[0];
if (!target) { console.error('缺少目标文件'); process.exit(1); }
const WRITE = args.includes('--write');

function parseRules(text, from = 0, to = text.length, out = []) {
  let i = from;
  while (i < to) {
    while (i < to && /\s/.test(text[i])) i++;
    if (text.startsWith('/*', i)) { const e = text.indexOf('*/', i + 2); i = e < 0 ? to : e + 2; continue; }
    if (i >= to) break;
    let j = i, depth = 0, quote = '';
    while (j < to) {
      const c = text[j];
      if (quote) { if (c === quote && text[j - 1] !== '\\') quote = ''; j++; continue; }
      if (c === '"' || c === "'") { quote = c; j++; continue; }
      if (c === '(' || c === '[') depth++;
      else if (c === ')' || c === ']') depth--;
      else if (c === '{' && depth <= 0) break;
      else if (c === '}' && depth <= 0) { j++; break; }
      j++;
    }
    if (j >= to) break;
    if (text[j] !== '{') { i = j; continue; }
    const selector = text.slice(i, j).trim();
    let k = j + 1, d2 = 1, q2 = '';
    while (k < to && d2 > 0) {
      const c = text[k];
      if (q2) { if (c === q2 && text[k - 1] !== '\\') q2 = ''; }
      else if (c === '"' || c === "'") q2 = c;
      else if (c === '{') d2++;
      else if (c === '}') d2--;
      k++;
    }
    if (/^@(media|supports|container|layer)/i.test(selector)) parseRules(text, j + 1, k - 1, out);
    else if (!selector.startsWith('@')) out.push({ start: i, selStart: i, selEnd: j, end: k, selector, body: text.slice(j + 1, k - 1) });
    i = k;
  }
  return out;
}

const ROOTS = [
  /#ryCadSide\s+\[data-pp="(?:pipePlanSection|tlPipePlanSection)"\]/g,
  /#pipePlanSection\b/g,
  /#tlPipePlanSection\b/g,
];
const norm = sel => {
  let s = sel.replace(/\s+/g, ' ').trim();
  for (const r of ROOTS) s = s.replace(r, ':ROOT');
  return s.replace(/:ROOT\s+:ROOT/g, ':ROOT');
};
const normBody = body => body.replace(/\/\*[\s\S]*?\*\//g, '')
  .split(';').map(x => x.trim()).filter(Boolean).join(';')
  .replace(/\s+/g, ' ');

function mergeOne(css, label) {
  const rules = parseRules(css);
  const groups = new Map();
  rules.forEach(r => {
    const key = norm(r.selector);
    if (!/pp-|ry-cad|tl-plan/.test(key)) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  });
  const edits = [];   /* {from,to,text} */
  let merged = 0, saved = 0;
  for (const [key, arr] of groups) {
    if (arr.length < 2) continue;
    if (new Set(arr.map(r => normBody(r.body))).size !== 1) continue;   /* 值不同不合并 */
    /* 选择器全集（去重、保序） */
    const sels = [];
    arr.forEach(r => r.selector.split(',').forEach(s => { const t = s.replace(/\s+/g, ' ').trim(); if (t && sels.indexOf(t) < 0) sels.push(t); }));
    if (sels.length < 2) continue;
    const keep = arr[0];
    edits.push({ from: keep.selStart, to: keep.selEnd, text: sels.join(', ') });
    arr.slice(1).forEach(r => edits.push({ from: r.start, to: r.end, text: '' }));
    merged++; saved += arr.length - 1;
  }
  if (!edits.length) return { css, merged: 0, saved: 0 };
  edits.sort((a, b) => b.from - a.from);
  let out = css;
  for (const e of edits) out = out.slice(0, e.from) + e.text + out.slice(e.to);
  if (merged) console.log('  ' + label + '：合并 ' + merged + ' 组，去掉 ' + saved + ' 条重复声明块');
  return { css: out, merged, saved };
}

const full = path.resolve(target);
const raw = fs.readFileSync(full, 'utf8');
let res;
if (/\.html?$/i.test(full)) {
  let n = 0, s = 0, idx = 0;
  const out = raw.replace(/<style([^>]*)>([\s\S]*?)<\/style>/gi, (all, attrs, css) => {
    idx++;
    const r = mergeOne(css, 'style#' + idx);
    n += r.merged; s += r.saved;
    return '<style' + attrs + '>' + r.css + '</style>';
  });
  res = { css: out, merged: n, saved: s };
} else res = mergeOne(raw, path.basename(full));

console.log('\n' + path.relative(process.cwd(), full) + '：合并 ' + res.merged + ' 组 / 去掉 ' + res.saved + ' 块重复');
if (WRITE && res.merged) { fs.writeFileSync(full, res.css); console.log('  ✓ 已写入'); }
