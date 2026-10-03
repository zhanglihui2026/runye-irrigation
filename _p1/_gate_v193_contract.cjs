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

  /* [v194] 二级页总管入口已撤 ⇒ 放行表只剩 pickPipe */
  { id: 'k3', name: 'ppGroupEditBlocks 恒放行（整组态不再拦块级编辑）',
    anchor: "    return mode!=='pickPipe';",
    rep: '    return false;' },

  /* [v194] k4 原来的注入点（ppAddTrunkPipe）已随入口一起删了 ⇒ 换成「入口复活」类缺陷 */
  { id: 'k4', name: '二级页总管按钮 #ppGeTrunk 复活（同一份数据两个入口）',
    anchor: '        <button type="button" class="pp-btn-ghost pp-ge-mode" id="ppGePerPlot" data-ge="perPlot">逐块</button>',
    rep: '        <button type="button" class="pp-btn-ghost pp-ge-mode" id="ppGePerPlot" data-ge="perPlot">逐块</button>\r\n        <button type="button" id="ppGeTrunk">总管</button>' },

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
    rep: '    /* k10 */' },

  /* =======================================================================
     [v194] 成组管路页 / 按块进三级页 的注入用例
     ======================================================================= */

  /* --- ⑤ 总管编辑入口唯一性（反向断言组） --- */
  { id: 'v1', name: '二级页 ppAddTrunkPipe 复活（总管又能从二级页落线了）',
    anchor: '  function ppDrawGroupTrunk(){',
    rep: '  function ppAddTrunkPipe(){ }\r\n  function ppDrawGroupTrunk(){' },

  { id: 'v2', name: "二级页 trunk 模式复活（模式会带出画线入口，等于入口开回来）",
    anchor: '  function ppDrawGroupTrunk(){',
    rep: "  function ppDrawGroupTrunk(){\r\n    if(ppState.mode==='trunk')return;" },

  { id: 'v3', name: '施工图 #ppTrunkLayer 消失（总图上看不见总管）',
    anchor: '      parts.push(\'<g id="ppTrunkLayer">\');',
    rep: '      parts.push(\'<g id="ppTrunkLayerX">\');' },

  { id: 'v4', name: 'grSync 不迁移旧总管（v193 在二级页画的总管凭空消失）',
    anchor: '    if (!W.trunk.lines.length && ge && ge.trunkPipes && ge.trunkPipes.length) {\r\n      W.trunk.lines = clone(ge.trunkPipes);\r\n    }',
    rep: '    /* v4 不迁移 */' },

  /* --- ⑩ grEnterBlock / grBackFromTl ---
     ★ v5 原来是「把两条语句交换顺序」—— 那是**恒真断言**（ppSelectGroupPlot 内部
       自己会 ppApplySlot，谁先谁后结果一样），注入后红的是**源码文本**不是行为。
       换成下面 v5a/v5b/v5c 三条各自独立可失效的注入。 */
  { id: 'v5a', name: 'grEnterBlock 不确保逐块模式（整组态下 polyPts 还是外框 ⇒ 分区网格拿外框的）',
    anchor: '    if (B && B.setGroupMode) { try { B.setGroupMode(\'perPlot\'); } catch (e) { } }',
    rep: '    /* v5a 不切逐块模式 */' },

  { id: 'v5b', name: 'grEnterBlock 不切二级页的块（三级页分区网格拿的是别的块）',
    anchor: '    if (B && B.selectGroupPlot) { try { B.selectGroupPlot(i); } catch (e) { } }',
    rep: '    /* v5b 不切块 */' },

  { id: 'v5c', name: 'grEnterBlock 不换 measuredPolygon（三级页按整组外框算面积）',
    anchor: '    window.measuredPolygon = b.ring.map(function (p) { return { x: p.x, y: p.y }; });',
    rep: '    /* v5c 不换环 */' },

  { id: 'v5d', name: 'grSync 退回用 measuredPolygon 当外框（按块编辑中刷新 ⇒ 外框被污染成那一块）',
    anchor: '    W.frame = clone((ge && ge.framePts && ge.framePts.length) ? ge.framePts : (window.measuredPolygon || []));',
    rep: '    W.frame = clone(window.measuredPolygon || []);' },

  { id: 'v6', name: 'grEnterBlock 不记块号（返回条不知道在算第几块，拦截也永远放行）',
    anchor: '    window.__runyeTlBlock = i;',
    rep: '    /* v6 不记 */' },

  { id: 'v7', name: 'grBackFromTl 不存档本块三级结果（换块再回来结果就没了）',
    anchor: '      W.blocks[i].tlData = clone(window.tlDiagramData);',
    rep: '      /* v7 不存档 */' },

  { id: 'v8', name: 'grBackFromTl 不清 __runyeTlBlock（成组拦截从此永远放行）',
    anchor: '    window.__runyeTlBlock = null;',
    rep: '    /* v8 不清 */' },

  /* --- ⑪ 放行与返回条 --- */
  { id: 'v9', name: 'ryGroupThirdLevelGuard 去掉按块放行（成组管路页点进去被自己拦住）',
    anchor: '  if(window.__runyeTlBlock!=null)return false;',
    rep: '  if(false)return false;' },

  { id: 'v10', name: '三级页返回条 #grTlBackBar 消失（算完不知道算到谁头上）',
    anchor: '  <div id="grTlBackBar" class="gr-tl-bar" style="display:none">',
    rep: '  <div id="grTlBackBarX" class="gr-tl-bar" style="display:none">' },

  { id: 'v11', name: '返回条上的「返回成组管路」按钮消失（进得去出不来）',
    anchor: '    <button type="button" class="gr-tl-btn" id="grTlBackBtn"',
    rep: '    <button type="button" class="gr-tl-btn" id="grTlBackBtnX"' },

  /* --- ⑨ 新页位置与注册 --- */
  { id: 'v12', name: '#grPipeSection 被改名/删除（成组管路页整页没了）',
    anchor: '<section id="grPipeSection" class="ry-sec" data-ry-view="overview">',
    rep: '<section id="grPipeSectionX" class="ry-sec" data-ry-view="overview">' },

  { id: 'v13', name: '#grPipeSection 少了 .ry-sec（ryShowSection 扫不到 ⇒ 导航点了没反应）',
    anchor: '<section id="grPipeSection" class="ry-sec" data-ry-view="overview">',
    rep: '<section id="grPipeSection" class="ry-secX" data-ry-view="overview">' },

  /* 注：⑨ 的「runye-nav.js 里要有入口」这条**无法**用改 index.html 的方式注入
     （它读的是另一个文件）⇒ 由 tests/plot_merge.smoke.cjs 的 ③-k 直接对
     runye-nav.js 现读现测，这里不重复。 */

  /* --- ⑫ 汇总口径 --- */
  { id: 'v14', name: '汇总不再分「各块明细」（只剩一个总数，看不出各块多少）',
    anchor: '    h += \'<tr class="gr-grp"><td colspan="5">各块明细（互不串味，各块独立口径）</td></tr>\';',
    rep: '    h += \'<tr class="gr-grp"><td colspan="5">全部（互不串味，各块独立口径）</td></tr>\';' },

  { id: 'v15', name: '汇总不再有「整组总管」单独一组（总管被摊进各块）',
    anchor: '    h += \'<tr class="gr-grp"><td colspan="5">整组总管</td></tr>\';',
    rep: '    h += \'<tr class="gr-grp"><td colspan="5">总管</td></tr>\';' },

  { id: 'v16', name: '汇总没有合计行（拿不出整组报价）',
    anchor: '    h += \'<tr class="gr-sum"><td>合计</td><td>\'',
    rep: '    h += \'<tr class="gr-sum"><td>总</td><td>\'' },

  { id: 'v17', name: '合计行漏加总管长度（整组主管量偏小）',
    anchor: '      fmt(tMain + tk, 1) + \'</td><td>\' + fmt(tBr, 1) + \'</td><td>\' + fmt(tSb, 1) + \'</td></tr>\';',
    rep: '      fmt(tMain, 1) + \'</td><td>\' + fmt(tBr, 1) + \'</td><td>\' + fmt(tSb, 1) + \'</td></tr>\';' },

  { id: 'v18', name: '★ 总管长度并进各块主管（正是用户担心的「串味」）',
    anchor: '      tMain += ml; tBr += bl; tSb += sl;',
    rep: '      tMain += ml; tMain += tk; tBr += bl; tSb += sl;' },

  /* --- ⑬ 二级页「正在编辑的那一块」必须实时可见 ---
     ★ 这一条是 _p1/_probe_group_work.cjs 的 G5c **实测**抓出来的真 bug
       （静态契约当时没覆盖 ⇒ 补上；行为侧由 G5c 长期盯）。 */
  { id: 'v19', name: '★ grSync 退回只读 slots[i]（二级页画完直接切过来 ⇒ 刚画的管看不见）',
    anchor: '    var live = (B && B.groupLiveSlot) ? B.groupLiveSlot() : null;',
    rep: '    var live = null;   /* v19 退回只读快照 */' },

  { id: 'v20', name: '删掉 RunyeBridge.groupLiveSlot（组页拿不到实时快照）',
    anchor: '    groupLiveSlot: function(){',
    rep: '    groupLiveSlotRemoved: function(){' },

  { id: 'v21', name: '0 块时面积显示 0.00 亩（像「有地块但面积为 0」）',
    anchor: "    if ($('grTotalMu')) $('grTotalMu').textContent = n ? fmt(mu, 2) : '—';",
    rep: "    if ($('grTotalMu')) $('grTotalMu').textContent = fmt(mu, 2);" },

  /* --- ⑭ [v196] 成组页分区线 / 总管只手画 --- */
  { id: 'v22', name: '★ grZonesFor 退回直接引二级页私有（跨 IIFE 够不着 ⇒ ReferenceError）',
    anchor: '    return B.zoneCutsFor(bb, planN, b.slot && b.slot.cutSnap, b.slot && b.slot.cutOverrides);',
    rep: '    return ppGetZoneCuts(bb, ppGetZoneLayout(bb, planN));   /* v22 退回跨 IIFE 直引 */' },

  { id: 'v23', name: '删掉 RunyeBridge.zoneCutsFor（分区几何桥消失）',
    anchor: '    zoneCutsFor: function(bb, planN, cutSnap, cutOverrides){',
    rep: '    zoneCutsForRemoved: function(bb, planN, cutSnap, cutOverrides){' },

  { id: 'v24', name: 'zoneCutsFor 不还原分区快照（污染二级页当前 cutSnap / cutOverrides）',
    anchor: '      finally{ ppState.cutSnap=keepSnap; ppState.cutOverrides=keepOv; ppState.mergePreview=keepMp; }',
    rep: '      finally{ }   /* v24 不还原 */' },

  { id: 'v25', name: '「⚡ 自动生成」按钮复活（用户已拍板手动画总管）',
    anchor: '        <button type="button" class="pp-btn-ghost gr-btn" id="grTrunkDel" title="删除选中的总管（先在图上点选一根）">🗑 删除选中</button>',
    rep: '        <button type="button" class="pp-btn-ghost gr-btn" id="grTrunkAuto" title="自动连线">⚡ 自动生成</button>\n        <button type="button" class="pp-btn-ghost gr-btn" id="grTrunkDel" title="删除选中的总管（先在图上点选一根）">🗑 删除选中</button>' },

  { id: 'v26', name: 'grRender 不画分区线（用户看不到每块内部怎么分，没法判断怎么规整）',
    anchor: '      var cuts = grZonesFor(b);',
    rep: '      var cuts = null;   /* v26 分区线不画 */' },

  { id: 'v27', name: '★ 逐块分区退回整组规划 dims（18 亩/区实际切出 ≈7.9 亩，v197 主缺陷）',
    anchor: "    if(gePer&&gePer.active&&gePer.mode==='perPlot'&&b&&b.w>0&&b.h>0){\n      return { w:b.w, h:b.h };\n    }",
    rep: '    /* v27 逐块不再取本块 bounds */' },

  { id: 'v28', name: '主管/支管尺寸标注被去掉（用户看不到每根管多长）',
    anchor: "      (s.mainPipes || []).forEach(function (l) {\n        if (l && l.length >= 2) grLabel(fmt(sumLen([l]), 1), grMidOf(l), '#185FA5');\n      });\n      (s.branchPipes || []).forEach(function (l) {\n        if (l && l.length >= 2) grLabel(fmt(sumLen([l]), 1), grMidOf(l), '#15803d');\n      });",
    rep: '      /* v28 标注不画 */' }
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
