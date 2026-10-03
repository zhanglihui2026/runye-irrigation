/* ③-k（v193 成组编辑）静态契约的「注入体检」
 *
 * 目的：证明 tests/_v193_group_edit_contract.cjs 里那套断言不是恒绿的 ——
 *       逐个把源码改坏，断言**必须变红**（AssertionError）。
 *
 * ★★ 为什么要**在内存里**做：
 *   · 写回 index.html 再还原 ⇒ 一旦中途抛错就把工作副本留在改坏的状态；
 *     尤其不能用 `git checkout -- index.html` 还原（2026-10-03 事故：把未提交的
 *     改动整片抹掉了）。改成只读 index.html 一次，改的是字符串副本，磁盘零风险。
 *   · 本环境 spawnSync(node) 报 EBUSY ⇒ 不能再靠「起一个子进程跑测试」来判断红绿；
 *     直接 require 契约模块、捕获 AssertionError 即可，且**不产生第二份契约**。
 *
 * 用法：node _p1/_gate_v193_contract.cjs
 * 退出码：全部被捕获 0 / 有恒绿的 1 / 锚点漂移 2
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const contract = require(path.join(ROOT, 'tests', '_v193_group_edit_contract.cjs'));

/* 与 tests/plot_merge.smoke.cjs 顶层的工具保持同一实现（同文件复制，避免互相依赖） */
const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1');
const bodyOf = (src, fnName, len) => {
  const i = src.indexOf('function ' + fnName + '(');
  return i < 0 ? '' : stripComments(src.slice(i, i + (len || 3000)));
};
const countIn = (src, fnName, needle, len) => {
  const b = bodyOf(src, fnName, len || 3000);
  if (!b) return -1;
  return (b.match(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
};
const helpers = { stripComments, bodyOf, countIn };

/* 锚点里的换行必须写 \r?\n（index.html 是 CRLF，字面 \n 会静默 0 命中 ⇒ 注入假生效） */
const rep1 = (s, anchor, rep, tag) => {
  const parts = anchor.split('\n').map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(parts.join('\\r?\\n'));
  const cnt = (s.match(re) || []).length;
  if (cnt !== 1) { console.error('  [漂移] ' + tag + '：期望 1 处，实际 ' + cnt + ' :: ' + anchor.slice(0, 60)); return null; }
  return s.replace(re, rep);
};

const CASES = [
  { id: 'k1', name: 'ppGetSubPlotRings 退回全环（逐块态仍画整组）',
    anchor: '    var subs=ppGroupActiveSubs();\n    if(!subs||!subs.length)return null;',
    rep: '    var subs=window.__runyeSubPlots;\n    if(!subs||!subs.length)return null;' },

  { id: 'k2', name: '切块不存档旧块（切走再切回，编辑结果凭空消失）',
    anchor: "    if(ge.mode==='perPlot') ge.slots[ge.current]=ppCaptureSlot();   // 存档旧块",
    rep: '    /* k2 不存档 */' },

  { id: 'k3', name: 'ppGroupEditBlocks 恒放行（整组态不再拦块级编辑）',
    anchor: "    return !(mode==='trunk'||mode==='pickPipe');",
    rep: '    return false;' },

  { id: 'k4', name: '总管 push 进 ppState.mainPipes（混进各块的水力/材料）',
    anchor: '    ge.trunkPipes.push(line.map(function(p){return{x:p.x,y:p.y};}));',
    rep: '    ppState.mainPipes.push(line.map(function(p){return{x:p.x,y:p.y};}));' },

  { id: 'k5', name: 'ryShowSection 去掉三级页拦截（导航能绕进去）',
    anchor: "    if(sec && sec.id==='tlPipePlanSection' && typeof ryGroupThirdLevelGuard==='function' && ryGroupThirdLevelGuard())return;",
    rep: '    /* k5 */' },

  { id: 'k6', name: 'ppXformGroupAll 只转当前块（一换块就错位）',
    anchor: '    ge.slots.forEach(function(s){\n      if(Array.isArray(s.polyPts))s.polyPts=s.polyPts.map(fn);',
    rep: '    ge.slots.forEach(function(s,si){\n      if(Array.isArray(s.polyPts)&&si===ge.current)s.polyPts=s.polyPts.map(fn);' },

  { id: 'k7', name: '施工图不临时切整组视图（出的是当前块的图，不是总图）',
    anchor: "      ge.mode='whole';                             //   画的就不是「一张总图」而是「当前块的图」。",
    rep: "      /* k7 ge.mode='whole'; */" },

  { id: 'k8', name: 'ppSyncGroupEditUI 不再置灰块级按钮（靠点击时才拦，防不住脚本）',
    anchor: "        b.setAttribute('disabled','disabled');",
    rep: '        /* k8 */' },

  { id: 'k9', name: 'ppInitGroupEdit 在非成组时不置 null（上一个成组态残留到单地块）',
    anchor: "    if(!subs||subs.length<2){ window.__runyeGroupEdit=null; ppSyncGroupEditUI(); return false; }",
    rep: '    if(!subs||subs.length<2){ ppSyncGroupEditUI(); return false; }' },

  { id: 'k10', name: 'ppLoadPolygon 不再初始化成组编辑状态',
    anchor: '    ppInitGroupEdit();',
    rep: '    /* k10 */' }
];

let caught = 0, missed = 0, drift = 0;
for (const c of CASES) {
  const s = rep1(INDEX_SRC, c.anchor, c.rep, c.id);
  if (s === null) { drift++; continue; }
  let red = false, msg = '';
  try {
    contract(s, helpers);       // 通过 = 恒绿 = 拦不住
    red = false;
  } catch (e) {
    red = /AssertionError/.test(String(e.name || '')) || /AssertionError/.test(String(e.message || ''));
    msg = String(e.message || '').split('\n')[0].slice(0, 70);
  }
  if (red) { caught++; console.log('  [捕获] ' + c.id + ' ' + c.name + '  :: ' + msg); }
  else { missed++; console.log('  [恒绿!] ' + c.id + ' ' + c.name + '  → 这套契约拦不住它'); }
}

console.log('\n==== ③-k 注入体检：捕获 ' + caught + ' / ' + CASES.length +
  '  恒绿 ' + missed + '  锚点漂移 ' + drift + ' ====');
process.exit((missed || drift) ? 1 : 0);
