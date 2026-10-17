'use strict';
/* 分析「同一 UI 两处副本」的值差异：
   把 #ryCadSide [data-pp="X"] 与 #X 归一成 :ROOT，按归一化选择器配对，逐属性比对。
   用法：node _diff_panel_copies.mjs   （输出报告，不改文件） */
import fs from 'fs';

const FILES = ['mod/ry-panel.css', 'mod/style-01.css', 'index.html'];

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
    const body = text.slice(j + 1, k - 1);
    if (/^@(media|supports|container|layer)/i.test(selector)) parseRules(text, j + 1, k - 1, out);
    else if (!selector.startsWith('@')) out.push({ selector, body });
    i = k;
  }
  return out;
}

const declsOf = body => {
  const d = {};
  body.split(';').forEach(part => {
    const idx = part.indexOf(':');
    if (idx < 0) return;
    const k = part.slice(0, idx).trim().toLowerCase();
    const v = part.slice(idx + 1).replace(/!important/gi, '').trim().replace(/\s+/g, ' ');
    if (k && !k.startsWith('/*')) d[k] = v;
  });
  return d;
};

/* 归一化：把两种 DOM 位置的祖先前缀都换成 :ROOT */
const ROOTS = [
  /#ryCadSide\s+\[data-pp="(?:pipePlanSection|tlPipePlanSection)"\]/g,
  /#pipePlanSection\b/g,
  /#tlPipePlanSection\b/g,
];
const norm = sel => {
  let s = sel.replace(/\s+/g, ' ').trim();
  for (const r of ROOTS) s = s.replace(r, ':ROOT');
  s = s.replace(/:ROOT\s+:ROOT/g, ':ROOT');
  return s;
};

const buckets = new Map();   /* normSel -> [{file, selector, decls}] */
for (const f of FILES) {
  const raw = fs.readFileSync(f, 'utf8');
  const chunks = /\.html?$/i.test(f)
    ? [...raw.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1])
    : [raw];
  for (const css of chunks) {
    for (const r of parseRules(css)) {
      if (!/pp-|ry-cad|tl-plan/.test(r.selector)) continue;
      const key = norm(r.selector);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push({ file: f, selector: r.selector.replace(/\s+/g, ' ').trim(), decls: declsOf(r.body) });
    }
  }
}

let same = 0, diff = 0, multi = 0;
const diffRows = [];
for (const [key, arr] of buckets) {
  if (arr.length < 2) continue;
  multi++;
  /* 按文件取代表（index.html 内联可能自身重复，取最后一条 = 文档序最靠后） */
  const byFile = {};
  arr.forEach(a => { byFile[a.file] = (byFile[a.file] && byFile[a.file].file === a.file) ? a : a; });
  const reps = Object.values(byFile).length >= 2 ? Object.values(byFile) : arr;
  const props = new Set();
  reps.forEach(r => Object.keys(r.decls).forEach(p => props.add(p)));
  const d = [];
  for (const p of props) {
    const vals = reps.map(r => (r.decls[p] === undefined ? '—' : r.decls[p]));
    if (new Set(vals).size > 1) d.push({ prop: p, vals });
  }
  if (d.length) { diff++; diffRows.push({ key, d, files: reps.map(r => r.file) }); }
  else same++;
}

console.log('归一化后同一选择器出现在 2 处以上的：' + multi + ' 组');
console.log('  逐值完全相同：' + same + ' 组');
console.log('  存在差异：' + diff + ' 组\n');
diffRows.sort((a, b) => b.d.length - a.d.length).forEach((row, i) => {
  console.log((i + 1) + ') ' + row.key.slice(0, 110) + '   [' + row.files.join(' vs ') + ']');
  row.d.slice(0, 6).forEach(x => console.log('     ' + x.prop.padEnd(16) + x.vals.map(v => String(v).slice(0, 46)).join('  ｜  ')));
  if (row.d.length > 6) console.log('     …另 ' + (row.d.length - 6) + ' 个属性不同');
});
