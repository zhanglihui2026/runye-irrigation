#!/usr/bin/env node
// Safely refresh generated CAD selector twins in index.html.
// Preview: node scripts/refresh-cad-twin-css.cjs
// Apply:   node scripts/refresh-cad-twin-css.cjs --apply --expected-sha256 <preview-hash>
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const pagePath = path.join(root, 'index.html');
const targetId = 'ryCadTwinCss';
const excludedStyleIds = new Set(['ryCadTwinCss', 'ryCadCss', 'plotLibStyle']);
const sections = ['pipePlanSection', 'tlPipePlanSection'];
const replacements = Object.fromEntries(sections.map((id) => [
  `#${id}`, `#ryCadSide [data-pp="${id}"]`,
]));
const endPatterns = Object.fromEntries(sections.map((id) => [
  id, new RegExp(`#${id}(?:\\[[^\\]]*\\]|[.:][A-Za-z_-]+)*$`),
]));

function splitTop(value, separator) {
  const parts = [];
  let buffer = '';
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (const char of value) {
    if (escaped) escaped = false;
    else if (char === '\\') escaped = true;
    else if (quote) { if (char === quote) quote = ''; }
    else if (char === '"' || char === "'") quote = char;
    else if (char === '(' || char === '[') depth += 1;
    else if (char === ')' || char === ']') depth -= 1;
    if (char === separator && depth === 0 && !quote) {
      parts.push(buffer);
      buffer = '';
    } else buffer += char;
  }
  parts.push(buffer);
  return parts;
}

function twinSelector(selector) {
  const keep = [];
  for (let part of splitTop(selector, ',')) {
    part = part.trim();
    if (!part) continue;
    let work = part;
    let changed = false;
    for (const id of sections) {
      const token = `#${id}`;
      if (!work.includes(token)) continue;
      const stripped = work.replace(/\([^()]*\)/g, '');
      if (!stripped.includes(token)) continue;
      const last = stripped.lastIndexOf(token);
      if (endPatterns[id].test(stripped.slice(last))) continue;
      work = work.split(token).join(replacements[token]);
      changed = true;
    }
    if (changed) keep.push(work);
  }
  return keep.length ? keep.join(',\n') : null;
}

function findRuleEnd(css, start) {
  let depth = 1;
  let quote = '';
  let comment = false;
  for (let i = start; i < css.length; i += 1) {
    const char = css[i];
    if (comment) {
      if (char === '*' && css[i + 1] === '/') { comment = false; i += 1; }
      continue;
    }
    if (quote) {
      if (char === '\\') i += 1;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '/' && css[i + 1] === '*') { comment = true; i += 1; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) return i;
  }
  return -1;
}

function generate(css) {
  const rules = [];
  let index = 0;
  while (index < css.length) {
    const comment = /^\s*\/\*[\s\S]*?\*\//.exec(css.slice(index));
    if (comment) { index += comment[0].length; continue; }
    const brace = css.indexOf('{', index);
    if (brace < 0) break;
    const prelude = css.slice(index, brace).trim();
    const end = findRuleEnd(css, brace + 1);
    if (end < 0) throw new Error(`Unclosed CSS rule: ${prelude}`);
    const body = css.slice(brace + 1, end);
    if (prelude.startsWith('@') && !/^@(font-face|keyframes|-webkit-keyframes)\b/i.test(prelude)) {
      rules.push({ kind: 'nested', prelude, body });
    } else rules.push({ kind: 'rule', prelude, body });
    index = end + 1;
  }

  const output = [];
  let count = 0;
  for (const rule of rules) {
    if (rule.kind === 'nested') {
      const nested = generate(rule.body);
      if (nested.css.trim()) output.push(`${rule.prelude}{\n${nested.css}\n}`);
      count += nested.count;
    } else {
      const twin = twinSelector(rule.prelude);
      if (twin) { output.push(`${twin}{${rule.body}}`); count += 1; }
    }
  }
  return { css: output.join('\n'), count };
}

function readSourceStyles(page) {
  const blocks = [];
  const tagPattern = /<link\b[^>]*>|<style\b[^>]*>[\s\S]*?<\/style\s*>/gi;
  for (const match of page.matchAll(tagPattern)) {
    const tag = match[0];
    if (/^<link\b/i.test(tag)) {
      const rel = /\brel\s*=\s*(['"])(.*?)\1/i.exec(tag);
      const href = /\bhref\s*=\s*(['"])(.*?)\1/i.exec(tag);
      if (!rel || !rel[2].toLowerCase().split(/\s+/).includes('stylesheet') || !href) continue;
      const url = new URL(href[2].replace(/&amp;/g, '&'), 'https://local.invalid/');
      if (url.origin !== 'https://local.invalid') continue;
      const assetPath = path.resolve(root, decodeURIComponent(url.pathname.slice(1)));
      if (!assetPath.startsWith(`${root}${path.sep}`)) throw new Error(`Stylesheet escapes repo root: ${href[2]}`);
      if (!fs.existsSync(assetPath)) throw new Error(`Linked stylesheet is missing: ${assetPath}`);
      blocks.push(fs.readFileSync(assetPath, 'utf8').replace(/^\uFEFF/, ''));
      continue;
    }
    const openEnd = tag.indexOf('>') + 1;
    const opening = tag.slice(0, openEnd);
    const body = tag.slice(openEnd, tag.toLowerCase().lastIndexOf('</style'));
    if (body.includes('document.write')) continue;
    const id = /\bid\s*=\s*(['"])(.*?)\1/i.exec(opening);
    if (id && excludedStyleIds.has(id[2])) continue;
    blocks.push(body);
  }
  if (!blocks.length) throw new Error('No source stylesheets found');
  return blocks.join('\n');
}

function locateTarget(page) {
  const pattern = /<style\b(?=[^>]*\bid\s*=\s*(['"])ryCadTwinCss\1)[^>]*>([\s\S]*?)<\/style\s*>/gi;
  const matches = [...page.matchAll(pattern)];
  if (matches.length !== 1) throw new Error(`Expected exactly one existing #${targetId} block; found ${matches.length}`);
  const match = matches[0];
  if (!/14c\. CAD 全局工具栏 · 选择器孪生|CAD global toolbar · generated selector twins/.test(match[2])) {
    throw new Error('Target style block lacks the generated ownership marker; refusing to replace it');
  }
  const start = match.index + match[0].indexOf('>') + 1;
  return { start, end: start + match[2].length, oldBlock: match[2] };
}

function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }

function makeBlock(css, count, newline) {
  const header = [
    '/* --- CAD global toolbar · generated selector twins ---',
    '   Source: local linked and inline styles; remote sheets and generated CAD styles are skipped.',
    '   Rebuild with scripts/refresh-cad-twin-css.cjs; preview by default, pass --apply to write.',
    `   Replaces only this style block. ${count} generated rules.`,
    '   Do not edit this block by hand. */',
  ].join(newline);
  return `${newline}${header}${newline}${css}${newline}`;
}

function printDiff(oldText, newText) {
  const oldLines = oldText.split(/\r?\n/);
  const newLines = newText.split(/\r?\n/);
  // Longest common subsequence gives a useful line diff without extra packages.
  const rows = oldLines.length + 1;
  const cols = newLines.length + 1;
  const dp = Array.from({ length: rows }, () => new Uint16Array(cols));
  for (let i = oldLines.length - 1; i >= 0; i -= 1) {
    for (let j = newLines.length - 1; j >= 0; j -= 1) {
      dp[i][j] = oldLines[i] === newLines[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const lines = ['--- index.html:#ryCadTwinCss (current)', '+++ index.html:#ryCadTwinCss (generated)'];
  let i = 0; let j = 0;
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      lines.push(` ${oldLines[i++]}`); j += 1;
    } else if (j < newLines.length && (i === oldLines.length || dp[i][j + 1] >= dp[i + 1][j])) {
      lines.push(`+${newLines[j++]}`);
    } else lines.push(`-${oldLines[i++]}`);
  }
  console.log(lines.join('\n'));
}

function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const hashIndex = args.indexOf('--expected-sha256');
  const expected = hashIndex >= 0 ? args[hashIndex + 1] : null;
  const unknown = args.some((arg, index) =>
    !['--apply', '--expected-sha256'].includes(arg) && index !== hashIndex + 1,
  );
  if (unknown || (hashIndex >= 0 && !expected)) {
    console.error('Usage: node scripts/refresh-cad-twin-css.cjs [--apply --expected-sha256 <hash>]');
    return 2;
  }
  if (expected && !apply) { console.error('--expected-sha256 requires --apply'); return 2; }

  const original = fs.readFileSync(pagePath);
  const digest = sha256(original);
  if (expected && expected.toLowerCase() !== digest) {
    console.error('Refusing: index.html SHA-256 changed since preview.');
    return 2;
  }
  let page;
  try { page = new TextDecoder('utf-8', { fatal: true }).decode(original); }
  catch { console.error('Refusing: index.html is not valid UTF-8.'); return 2; }

  let target; let generated;
  try {
    target = locateTarget(page);
    generated = generate(readSourceStyles(page));
  } catch (error) { console.error(`Refusing: ${error.message}`); return 2; }
  const newline = page.includes('\r\n') ? '\r\n' : '\n';
  const newBlock = makeBlock(generated.css, generated.count, newline);
  console.log(`index.html SHA-256: ${digest}`);
  console.log(`Generated selector rules: ${generated.count}`);
  if (target.oldBlock === newBlock) { console.log('CAD twin CSS is already current; no change needed.'); return 0; }
  printDiff(target.oldBlock, newBlock);
  if (!apply) {
    console.log(`Preview only. Review the diff, then rerun with --apply --expected-sha256 ${digest}`);
    return 0;
  }
  if (sha256(fs.readFileSync(pagePath)) !== digest) {
    console.error('Refusing: index.html changed while generating; rerun preview.');
    return 2;
  }
  const updated = page.slice(0, target.start) + newBlock + page.slice(target.end);
  const tempPath = path.join(root, `.index.html.${process.pid}.tmp`);
  try {
    fs.writeFileSync(tempPath, Buffer.from(updated, 'utf8'), { flag: 'wx' });
    fs.renameSync(tempPath, pagePath);
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }
  console.log('Applied: only the contents of #ryCadTwinCss were replaced.');
  return 0;
}

process.exitCode = main();
