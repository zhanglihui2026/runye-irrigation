#!/usr/bin/env node
/* =====================================================================
 * check_panel_drift.cjs — 面板皮肤「双副本漂移」闸门（v532）
 *
 * 背景：地块分区（#pipePlanSection）与三级管路（#tlPipePlanSection）的左栏
 * 由 mod/ry-cad-toolbar.js 在 body.ry-tool 下**搬到 #ryCadSide**。搬走后
 * `#pipePlanSection .pp-xxx` 不再匹配，于是 index.html 内联 <style> 里长期存在
 * 一份换前缀的副本：`#ryCadSide [data-pp="pipePlanSection"] .pp-xxx`。
 *
 * 这不是重复代码问题，是**两份必须逐条同值**的孪生规则：
 *   · 副本特异性 (1,1,0) 比原版 (1,0,0) 高一级，rail 态靠这一级赢过一批 (1,0,1) 竞争者
 *     ⇒ v531 试过用 :is() 合并成一份，A/B 实测 base 60~74 处、rail 113~120 处视觉变化，
 *       两种特异性都试过，都不行 —— 所以「合并」这条路暂时封死，只能「防漂移」。
 *   · 现实事故：v530 在 style-01 删了 `.pp-side{…border-radius:12px}` 与
 *     `.pp-plan-bar{…border-radius:10px}`，内联那份没跟着改 ⇒ 当场漂移。
 *
 * 本闸门做的事：把两边规则**按规范化选择器对齐**，逐属性比值；
 * 值不同就报红（除非登记在 panel-drift-baseline.json 且写明理由）。
 * 全部零依赖、纯文本，CI 可跑。
 *
 * 用法：node scripts/check_panel_drift.cjs [--update] [--verbose]
 *   --update  把当前漂移写回基线（只在你**确认这些差异是有意的**之后用）
 * ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const IDS = ['pipePlanSection', 'tlPipePlanSection'];
const BASELINE = path.join(__dirname, 'panel-drift-baseline.json');

/* ---------- CSS 解析（无依赖，处理 @media 嵌套） ---------- */
function parseCss(cssText) {
  const css = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  const stack = [];
  const buf = [];
  let cur = null;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '{') {
      const sel = buf.join('').trim();
      buf.length = 0;
      stack.push(sel);
      if (sel.startsWith('@')) { cur = null; }
      else {
        cur = { sel, body: '', media: stack.slice(0, -1).join(' && ') };
        out.push(cur);
      }
      continue;
    }
    if (c === '}') { stack.pop(); cur = null; continue; }
    if (cur) cur.body += c; else buf.push(c);
  }
  return out;
}

/* ---------- 选择器规范化：把「原位 / 搬走后」两种写法归到同一个 key ---------- */
function canon(sel) {
  let s = sel;
  for (const x of IDS) {
    s = s.split(`:is(#${x}, #ryCadSide [data-pp="${x}"])`).join(`[data-pp="${x}"]`);
    s = s.split(`:is(#${x}, [data-pp="${x}"])`).join(`[data-pp="${x}"]`);
    s = s.split(`#ryCadSide [data-pp="${x}"]`).join(`[data-pp="${x}"]`);
    /* 原位写法（只替换作为选择器 token 出现的 #X，避免误伤 #Xxx 之类更长的 id） */
    s = s.replace(new RegExp(`#${x}(?![\\w-])`, 'g'), `[data-pp="${x}"]`);
  }
  return s.replace(/\s+/g, ' ').replace(/\s*([>+~,])\s*/g, '$1').trim();
}

/* ---------- 规则体 -> { prop: value }（后写覆盖前写） ---------- */
function declMap(body) {
  const m = {};
  for (const piece of body.split(';')) {
    const i = piece.indexOf(':');
    if (i < 0) continue;
    const p = piece.slice(0, i).trim().toLowerCase();
    let v = piece.slice(i + 1).trim();
    if (!p) continue;
    v = v.replace(/\s+/g, ' ').replace(/^0(px|em|rem|%)$/, '0').toLowerCase();
    m[p] = v;
  }
  return m;
}

function collect(rules, { railOnly }) {
  const map = new Map();          /* key -> { props, sel } */
  for (const r of rules) {
    if (railOnly && !IDS.some((x) => r.sel.indexOf(`#ryCadSide [data-pp="${x}"]`) >= 0)) continue;
    const key = r.media + '||' + canon(r.sel);
    if (!map.has(key)) map.set(key, { props: {}, sel: r.sel, media: r.media });
    Object.assign(map.get(key).props, declMap(r.body));
  }
  return map;
}

/* ---------- 读入 ---------- */
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const html = read('index.html');
const inlineCss = (html.match(/<style[^>]*>[\s\S]*?<\/style>/g) || [])
  .map((b) => b.replace(/^<style[^>]*>/, '').replace(/<\/style>$/, ''))
  .join('\n');
const refCss = [read('mod/style-01.css'), read('mod/ry-panel.css')].join('\n');

const inline = collect(parseCss(inlineCss), { railOnly: true });
const ref = collect(parseCss(refCss), { railOnly: false });

/* ---------- 比对 ---------- */
const drifts = [];
for (const [key, a] of inline) {
  const b = ref.get(key);
  if (!b) continue;                       /* 只有内联有 = 纯 rail 适配，不算漂移 */
  for (const p of Object.keys(a.props)) {
    if (!(p in b.props)) {
      /* 内联有、基准没有：可能是「rail 追加的覆盖」，也可能是「基准改了内联没跟上」。
         默认按漂移报（宁可让人看一眼），登记进基线即可放行。 */
      drifts.push({ key, prop: p, inline: a.props[p], base: '(基准无此声明)', kind: 'only-inline', sel: a.sel, media: a.media });
      continue;
    }
    if (a.props[p] === b.props[p]) continue;
    drifts.push({ key, prop: p, inline: a.props[p], base: b.props[p], kind: 'value', sel: a.sel, media: a.media });
  }
  /* 基准有、内联没有：搬走后这条声明会消失（很可能是漏抄），也报出来 */
  for (const p of Object.keys(b.props)) {
    if (p in a.props) continue;
    drifts.push({ key, prop: p, inline: '(内联无此声明)', base: b.props[p], kind: 'only-base', sel: a.sel, media: a.media });
  }
}

/* ---------- 基线 ---------- */
let baseline = [];
if (fs.existsSync(BASELINE)) {
  try { baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8')); } catch (e) { baseline = []; }
}
const bkey = (d) => d.key + '|' + d.prop;
const baseSet = new Set(baseline.map((x) => x.key + '|' + x.prop));

if (process.argv.includes('--update')) {
  const out = drifts.map((d) => ({
    key: d.key, prop: d.prop, inline: d.inline, base: d.base,
    reason: (baseline.find((x) => x.key + '|' + x.prop === bkey(d)) || {}).reason || 'TODO 说明为什么两边不同',
  }));
  fs.writeFileSync(BASELINE, JSON.stringify(out, null, 1) + '\n', 'utf8');
  console.log('已写回基线：' + out.length + ' 条 → ' + path.relative(ROOT, BASELINE));
  process.exit(0);
}

const fresh = drifts.filter((d) => !baseSet.has(bkey(d)));
const stale = baseline.filter((x) => !drifts.some((d) => bkey(d) === x.key + '|' + x.prop));

if (process.argv.includes('--verbose') || fresh.length) {
  console.log('面板双副本：内联 rail 规则 ' + inline.size + ' 组 / 基准样式表 ' + ref.size + ' 组 / 同键比对 ' +
    [...inline.keys()].filter((k) => ref.has(k)).length + ' 组');
  for (const d of drifts) {
    const tag = baseSet.has(bkey(d)) ? '已登记' : '★新增';
    console.log(`  ${tag}[${d.kind}] ${d.prop}: 内联「${d.inline}」 vs 基准「${d.base}」  @ ${d.sel.slice(0, 90)}`);
  }
}
if (stale.length) {
  console.log('  ⚠ 基线里有 ' + stale.length + ' 条已不再漂移（可删，不报红）：' +
    stale.slice(0, 3).map((x) => x.prop).join(', '));
}

if (fresh.length) {
  console.log('\n✗ 双副本漂移 ' + fresh.length + ' 条：改了一边没改另一边。' +
    '\n  若是有意为之，请 `node scripts/check_panel_drift.cjs --update` 并在基线里写清理由。');
  process.exit(1);
}
console.log('✓ 面板双副本无新增漂移（已登记 ' + baseline.length + ' 条）');
process.exit(0);
