#!/usr/bin/env node
/* v1085-pipes-back-to-level3 回归锁：管路内容归三级，二级只负责规划地块。
 *
 * 用户原话（2026-11-14，第二次同题）：
 *   「是不是我之前要求把所有管路放在了二级导致的。你这样，把管路这些内容，
 *     还是放在三级，二级只负责规划地块。」
 *
 * 历史：v1056/v1057（M13）把方向定成「二级平面画布 = 自动管线唯一可见层，
 * 三级叠加层把主管/支管/阀门全部透明化」。本版反转回来：
 *   · 二级画布只画：地块边界、分区网格、分区号/面积、地块标注（管路一律不画）；
 *   · 三级工作区：主管/支管/阀门/三级管/滴灌带全部可见；
 *   · 「显示/隐藏管路」开关（__ryPipelineLayerVisible）语义改为只管三级层
 *     —— 关掉时三级克隆底图才把线体透明化。
 * 依据：二级的「主管/支管」绘制与拾取按钮 2026-09-28 起就 display:none
 * （手工画线不进水力计算），二级既不能画也不能选管 ⇒ 那一层再画一遍只是
 * 「同一套管画两遍」的来源，没有任何编辑价值。
 *
 * 附带修：v1084 的诊断在一类失败下会整条缺失（支管切口与端点重合 ⇒ 段长 0 ⇒
 * allCovered 数不到 2，而 diag 无条目）⇒ 提示条只剩通用建议。本版 mergeDiag()
 * 按 allCovered 逐区补原因，并把诊断放到提示最前。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }
function ok(cond, msg) {
  if (!cond) { console.error('FAIL: ' + msg); process.exitCode = 1; }
  else console.log('ok: ' + msg);
}

const pe = read('mod/plot-editor.js');
const tl = read('tl-workspace/tl-workspace.js');
const demo = read('mod/map-flow-demo.js');
const sw = read('sw.js');
const html = read('index.html');

/* 锁1：二级不再画管路 */
ok(pe.includes('var ppPipeLayerSuppressed=true;'), '[v1085] 二级管线层恒抑制');
ok(pe.includes('管路内容归三级，二级只负责规划地块'), '[v1085] 口径注释在位');
ok((pe.split('if(window.__ryPipelineLayerVisible!==false&&!ppPipeLayerSuppressed){').length - 1) === 2,
  '[v1085] 管线块与阀门块都挂了抑制守卫（两处）');
ok(!pe.includes('var ppPipeLayerSuppressed=false;'), '[v1085] 不再有"恒 false"的旧口径');

/* 锁2：三级恢复可见 */
ok(/if \(window\.__ryPipelineLayerVisible === false\) \{\s*\n\s*var m13Pipes/.test(tl),
  '[v1085] 只有「隐藏管路」开关关掉时才透明化克隆线体');
ok(tl.includes("hidAttr('branch-' + bi, COLORS.branch, 1.6)"), '[v1085] 兜底支管线体恢复可见（带遮蔽灰虚线口径）');
ok(tl.includes("hidAttr('main-' + mi, COLORS.main, 2.6)"), '[v1085] 兜底主管线体恢复可见');
ok(tl.includes("r=\"3.6\" fill=\"' + COLORS.valve + '\" stroke=\"#fff\""), '[v1085] 阀门圆恢复可见');
ok(tl.includes("stroke=\"' + st.c + '\" stroke-width=\"' + st.w + '\""), '[v1085] 改长管线体恢复可见');
ok(!/data\.mainPipes \|\| \[\]\)\.forEach\(function \(l, mi\) \{ if \(l && l\.length >= 2\) s\.push\('<path d="' \+ pl\(l\) \+ '" fill="none" stroke="rgba\(0,0,0,0\)"/.test(tl),
  '[v1085] 兜底主管不再画透明线（旧 M13 口径已撤）');

/* 锁3：诊断补齐 + 前置 */
ok(/function mergeDiagForTip\(diag,allCovered,total\)/.test(demo), '[v1084b] mergeDiagForTip 在位');
ok(demo.includes('mergeDiag: mergeDiagForTip'), '[v1084b] mergeDiag 导出（单测直测）');
ok(demo.includes('var dgTip=mergeDiagForTip(diagAll,allCovered,d.total);'),
  '[v1084b] 失败提示按 allCovered 补齐诊断');
ok(/if\(ctx\.tip\)ctx\.tip\(demoDiagText\(dgTip\)/.test(demo), '[v1084b] 诊断放在提示最前（先原因后建议）');

/* 锁4：功能 —— mergeDiag 必须给"路线到了但没经过支管"的区补上原因 */
global.window = {}; global.document = {};
new Function(demo)();
const D = global.window.RyMapFlowDemo;
const merged = D.mergeDiag({ zones: [{ zi: 2, reason: '没有分区阀门' }], fittings: { placed: 1 }, missing: 0 },
  { 0: 2, 1: 2, 2: 0, 3: 1 }, 4);
ok(merged.zones.length === 2, '[v1084b] 已有一条 + 补一条 = 2 条原因（已达 2 的区不产生噪声）');
ok(merged.zones.some(z => z.zi === 2 && /没有分区阀门/.test(z.reason)), '[v1084b] 原条目不被覆盖（同区不重复补）');
ok(!merged.zones.some(z => z.zi === 0 || z.zi === 1), '[v1084b] 两端都通的区不入诊断');
ok(merged.zones.some(z => z.zi === 3 && /只通一端/.test(z.reason)), '[v1084b] allCovered=1 → 「只通一端」');
const merged0 = D.mergeDiag({ zones: [] }, { 0: 0 }, 1);
ok(merged0.zones.length === 1 && /支管两端都没进入水路/.test(merged0.zones[0].reason),
  '[v1084b] allCovered=0 且无条目 → 「支管两端都没进入水路」');
const txt = D.diagText(merged);
ok(/^ 【诊断】/.test(txt) && /第4区/.test(txt), '[v1084b] 诊断文案以【诊断】开头并点名分区');

/* 锁5：版本纪律（动态读 sw VERSION） */
const m = /^const VERSION = '(v[\w-]+)';/m.exec(sw);
ok(!!m && /^v\d{3,4}-[\w-]+$/.test(m[1]), '[v1085] sw VERSION 形如 vNNNN- slug：' + (m && m[1]));
const want = m ? m[1].replace(/^v/, '') : '';
ok(html.split('?v=' + want).length - 1 === 17, '[v1085] index.html 版本串 17 处同值');

console.log(process.exitCode ? '\n[v1085] 有断言失败' : '\n[v1085] 全部通过');
