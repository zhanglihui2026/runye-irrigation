'use strict';
/* 把 index.html 内联 <style> 里的面板规则迁移到归属样式表。
   归属规则：
     - 选择器含 tlPipePlanSection / tlSide / tl-plan / tlCal  → mod/style-01.css（三级）
     - 其余（pp- / ppSide / pipePlanSection / ryCadSide / ry-cad）→ mod/ry-panel.css（二级 + 工具栏容器）
   落点可选用 --at=end（默认）或 --at=top。
   带 @media 的规则会被包成同条件的 @media 块一并搬走，空掉的 @media 就地删除。

   用法：node _extract_inline_panel.mjs [--write] [--at=end|top] [--dry] */
import fs from 'fs';

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const AT = (args.find(a => a.startsWith('--at=')) || '--at=end').split('=')[1];
const PANEL_RE = /(pp-|ppSide|tlSide|pipePlanSection|ryCadSide|ry-cad|tl-plan|tlCal)/;

function parseRules(text, from = 0, to = text.length, out = [], media = '') {
  let i = from;
  while (i < to) {
    while (i < to && /\s/.test(text[i])) i++;
    if (text.startsWith('/*', i)) { const e = text.indexOf('*/', i + 2); i = e < 0 ? to : e + 2; continue; }
    if (i >= to) break;
    const start = i;
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
    const end = k;
    const bodyStart = j + 1, bodyEnd = k - 1;
    if (/^@media/i.test(selector)) {
      const before = out.length;
      parseRules(text, bodyStart, bodyEnd, out, selector);
      /* 子规则若全被抽走，把这条 @media 标记成空壳，回头整块删 */
      const inner = out.slice(before);
      if (inner.length && inner.every(r => r.extracted)) out[before] = { empty: true, start, end, media: selector };
      else if (!inner.length) out.push({ empty: true, start, end, media: selector });
    } else if (!selector.startsWith('@')) {
      const isPanel = PANEL_RE.test(selector);
      const isTl = /(tlPipePlanSection|tlSide|tl-plan|tlCal)/.test(selector);
      out.push({
        start, end, selector, isPanel, isTl, media,
        head: text.slice(i, j).trim(),
        body: text.slice(bodyStart, bodyEnd),
        extracted: isPanel
      });
    } else {
      /* @font-face / @keyframes 等：整体保留 */
      out.push({ start, end, selector, isPanel: false, keep: true, head: selector, body: '', media });
    }
    i = end;
  }
  return out;
}

const html = fs.readFileSync('index.html', 'utf8');
const blocks = [...html.matchAll(/(<style[^>]*>)([\s\S]*?)(<\/style>)/gi)];
const collected = { pp: [], tl: [] };   /* {media, text} */
let removed = 0, keptBlocks = [];

blocks.forEach(m => {
  const css = m[2];
  const rules = parseRules(css);
  if (!rules.length) { keptBlocks.push(m[0]); return; }
  const cuts = [];   /* {from,to} */
  rules.forEach(r => {
    if (r.empty) { cuts.push({ from: r.start, to: r.end }); return; }
    if (!r.extracted) return;
    const text = r.head + '{' + r.body + '}';
    (r.isTl ? collected.tl : collected.pp).push({ media: r.media, text });
    cuts.push({ from: r.start, to: r.end });
    removed++;
  });
  if (!cuts.length) { keptBlocks.push(m[0]); return; }
  cuts.sort((a, b) => b.from - a.from);
  let out = css;
  for (const c of cuts) {
    let s = c.from;
    while (s > 0 && (out[s - 1] === ' ' || out[s - 1] === '\t')) s--;
    out = out.slice(0, s) + out.slice(c.to);
  }
  keptBlocks.push(m[1] + out + m[3]);
});

/* 组装迁移文本：同一 @media 条件合并 */
function buildBlock(list, title) {
  const groups = new Map();
  list.forEach(it => {
    const k = it.media || '';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it.text);
  });
  let s = '\n\n/* ═══════════════════════════════════════════════════════════════\n' + title + '\n' +
    '   [v543] 从 index.html 内联 <style> 迁入 —— 面板样式单一归属。\n' +
    '   迁移时选择器原样保留（不改写、不加 :is()），因此特异性与迁移前一致。\n' +
    '   ═══════════════════════════════════════════════════════════════ */\n';
  for (const [media, texts] of groups) {
    if (media) s += media + '{\n' + texts.map(t => '  ' + t).join('\n') + '\n}\n';
    else s += texts.join('\n') + '\n';
  }
  return s;
}

const ppBlock = collected.pp.length ? buildBlock(collected.pp, '二级 · 地块与灌溉参数面板（#ppSide）＋ CAD 工具栏容器（#ryCadSide）') : '';
const tlBlock = collected.tl.length ? buildBlock(collected.tl, '三级 · 管网面板（#tlSide）') : '';
const dryIndex = keptBlocks.join('\n');

console.log('从内联迁出规则：二级/工具栏 ' + collected.pp.length + ' 条、三级 ' + collected.tl.length + ' 条（共 ' + removed + ' 条）');

function applyTo(file, block) {
  if (!block) return;
  const src = fs.readFileSync(file, 'utf8');
  const out = AT === 'top' ? insertTop(src, block) : src + block;
  console.log('  → ' + file + '  ' + (AT === 'top' ? '插到文件开头（保留 @charset/@import 之后）' : '追加到文件末尾') + '  +' + block.length + ' 字符');
  if (WRITE) fs.writeFileSync(file, out);
}
function insertTop(src, block) {
  const m = src.match(/^(\s*(?:@charset[^;]*;|@import[^;]*;)\s*)*/);
  const at = m ? m[0].length : 0;
  return src.slice(0, at) + block + src.slice(at);
}

applyTo('mod/ry-panel.css', ppBlock);
applyTo('mod/style-01.css', tlBlock);

if (WRITE) {
  /* 重建 index.html：把三块 <style> 换成清理后的版本 */
  let i = 0;
  const rebuilt = html.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/gi, (all) => keptBlocks[i++]);
  fs.writeFileSync('index.html', rebuilt);
  console.log('  ✓ index.html 已重写');
} else {
  console.log('  （未写入，加 --write 落盘）');
}
