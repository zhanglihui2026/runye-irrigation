/* tests/_v193_group_edit_contract.cjs · v193「成组编辑 整组/逐块」静态契约
 *
 * 单独成文件，是为了让「注入体检」能**在内存里**对改动后的源码重跑同一套断言 ——
 * 不必真去写 index.html（写文件就要备份/还原，正是上次 git checkout 抹改动那类风险），
 * 也不必再 spawn 一个 node 子进程（本环境 spawnSync 报 EBUSY）。
 * 契约本身与 tests/plot_merge.smoke.cjs 的 ③-k 是同一份，不存在两份漂移。
 */
'use strict';
const assert = require('node:assert');

module.exports = function v193GroupEditContracts(INDEX_SRC, helpers) {
  const { stripComments, bodyOf, countIn } = helpers;
  /* 用户原话（第四次）：「成组地块传到二级管路之后，进一步编辑的话，再给我一个切换按钮，
     这个单独编辑，跟三级管路编辑页面分开，否则我担心跟原来的一些计算规则跟逻辑搞混了。」
     用户拍板：① 逐块单独编辑 ② 先不让成组地块进三级页 ③ 水力和材料各块完全独立
               ④ 旋转/镜像作用于整组 ⑤ 施工图出一张总图
     ★ 核心设计原则（本契约真正要钉住的东西）：
       **不写成组的“新算法”，而是让成组退化成“多次单块”** ——
       逐块模式下 ppState.polyPts 就是那一块自己的环 ⇒ 分区/布管/面积/材料/水力
       全部走现有单地块逻辑、一行不改 ⇒ 结构上不可能与单块规则串味。
     行为侧由 _p1/_probe_group_edit.cjs 的 B0~B9（38 条，7 个注入点）实测；
     这里只钉住**结构性前提**，防止有人把结构改掉而行为探针恰好没覆盖到。 */
  const NC = stripComments(INDEX_SRC);

  /* --- ① 切换控件与状态机存在且在载入时初始化 --- */
  ['ppGroupEditWrap', 'ppGeWhole', 'ppGePerPlot', 'ppGePlotSel', 'ppGeTrunk'].forEach(function (id) {
    assert.ok(INDEX_SRC.indexOf('id="' + id + '"') > 0, '工具栏应有 #' + id);
  });
  ['ppInitGroupEdit', 'ppGroupActiveSubs', 'ppSetGroupMode', 'ppSelectGroupPlot',
    'ppGroupEditBlocks', 'ppAddTrunkPipe', 'ppXformGroupAll'].forEach(function (fn) {
      assert.match(NC, new RegExp('function ' + fn + '\\('), '应有 ' + fn + '()');
    });
  /* ★ ppInitGroupEdit 必须在 ppLoadPolygon 里、且**早于** polyPts 之后的变换：
     它决定了 bounds 用的是整组外框还是某一块，晚了就白算一遍。 */
  assert.strictEqual(countIn(INDEX_SRC, 'ppLoadPolygon', 'ppInitGroupEdit('), 1,
    'ppLoadPolygon 应初始化成组编辑状态 1 次');
  /* 非成组必须把状态机置空（否则上一次的成组态会残留到下一个单地块上） */
  assert.match(bodyOf(INDEX_SRC, 'ppInitGroupEdit', 900), /__runyeGroupEdit=null/,
    'ppInitGroupEdit 在非成组时必须把 __runyeGroupEdit 置 null');

  /* --- ② 「逐块 = 退化成单块」的结构性前提：环必须按模式取 --- */
  assert.match(bodyOf(INDEX_SRC, 'ppGetSubPlotRings', 900), /ppGroupActiveSubs\(\)/,
    'ppGetSubPlotRings 必须按 ppGroupActiveSubs() 取环（否则逐块态仍画整组，下游全串味）');
  assert.match(bodyOf(INDEX_SRC, 'ppGroupActiveSubs', 900), /ge\.mode==='perPlot'/,
    'ppGroupActiveSubs 在逐块态应只返回当前那一块');

  /* --- ③ 切块必须存档旧块（否则切走再切回，编辑结果凭空消失） --- */
  assert.strictEqual(countIn(INDEX_SRC, 'ppSelectGroupPlot', 'ppCaptureSlot()', 1200), 1,
    'ppSelectGroupPlot 应在切走前把当前块存档 1 次');
  assert.strictEqual(countIn(INDEX_SRC, 'ppSetGroupMode', 'ppCaptureSlot()', 1600), 1,
    'ppSetGroupMode（逐块→整组）也应先存档当前块');

  /* --- ④ 整组态必须拦住块级编辑（只留总管 / 只读拾取） --- */
  assert.match(bodyOf(INDEX_SRC, 'ppGroupEditBlocks', 600), /ge\.mode!=='whole'/,
    'ppGroupEditBlocks 只在整组态生效（逐块态不能拦）');
  assert.match(bodyOf(INDEX_SRC, 'ppGroupEditBlocks', 600), /mode==='trunk'\|\|mode==='pickPipe'/,
    '整组态只放行「总管」与「管线拾取」（块级一律拦掉）');
  /* 拦了还不够，得有**消费点**：模式切换、画布落点、按钮置灰 —— 三处（缺一处就能绕） */
  const blockUses = (NC.match(/ppGroupEditBlocks\(/g) || []).length;
  assert.ok(blockUses >= 4, 'ppGroupEditBlocks 的消费点应 ≥ 4 处（定义1 + 模式切换 + 画布落点 + 按钮置灰），实际 ' + blockUses);
  assert.ok(bodyOf(INDEX_SRC, 'ppSetMode', 1400).indexOf('ppGroupEditBlocks(') >= 0,
    'ppSetMode 必须拦块级模式（只靠按钮 disable 会被脚本绕过）');
  assert.ok(bodyOf(INDEX_SRC, 'ppSyncGroupEditUI', 2600).indexOf("setAttribute('disabled','disabled')") >= 0,
    'ppSyncGroupEditUI 必须把块级按钮置灰（与其点了报错，不如根本点不动）');

  /* --- ⑤ 总管是独立一层，绝不混进各块的统计（拍板 ③） --- */
  const atp = bodyOf(INDEX_SRC, 'ppAddTrunkPipe', 600);
  assert.match(atp, /ge\.trunkPipes\.push\(/, '总管必须落到 ge.trunkPipes（整组级）');
  /* ★ 反向断言：绝不能 push 进 ppState 的任何一类管线 —— 那正是用户担心的「串味」 */
  assert.ok(!/ppState\.(mainPipes|branchPipes|subBranchPipes)\.push\(/.test(atp),
    'ppAddTrunkPipe 不得把总管 push 进 ppState 的管线数组（否则混进各块水力/材料）');
  /* 施工图里总管要单独一层、且不进裁剪组（它本来就要穿过块间空隙） */
  assert.match(NC, /id="ppTrunkLayer"/, '施工图应有独立的 #ppTrunkLayer');

  /* --- ⑥ 成组地块进不了三级页（拍板 ②）：三条路都要拦，缺一条就能绕进去 --- */
  assert.match(NC, /function ryIsGroupPlot\(\)/, '应有 ryIsGroupPlot（成组判定）');
  assert.match(NC, /function ryGroupThirdLevelGuard\(\)/, '应有 ryGroupThirdLevelGuard（三级页拦截）');
  const guardUses = (NC.match(/ryGroupThirdLevelGuard\(\)/g) || []).length;
  assert.ok(guardUses >= 4, '三级页拦截应被 ≥4 处调用（定义1 + rySetTab + ryShowSection + 导航点击），实际 ' + guardUses);
  assert.ok(bodyOf(INDEX_SRC, 'rySetTab', 400).indexOf('ryGroupThirdLevelGuard') >= 0, 'rySetTab 必须拦（否则内部直接调 rySetTab 能进去）');
  assert.ok(bodyOf(INDEX_SRC, 'ryShowSection', 400).indexOf('ryGroupThirdLevelGuard') >= 0, 'ryShowSection 必须拦（否则导航能进去）');

  /* --- ⑦ 旋转 / 镜像作用于整组（拍板 ④）：各块 slot 都要跟着变 --- */
  assert.strictEqual(countIn(INDEX_SRC, 'ppRepartitionFromRotatedPlot', 'ppXformGroupAll('), 1,
    '重新分区（旋转落定）应整组变换 1 次');
  assert.strictEqual(countIn(INDEX_SRC, 'ppApplyMirror', 'ppXformGroupAll('), 2,
    'ppApplyMirror 应整组变换 2 次（撤销旧镜像 + 应用新镜像）—— 只查存在性会被前一次蒙混');
  /* 只转当前块是「看起来对、一换块就崩」的经典形状 ⇒ 直接反向断言循环上界 */
  assert.ok(!/si===ge\.current/.test(bodyOf(INDEX_SRC, 'ppXformGroupAll', 1400)),
    'ppXformGroupAll 不得只转当前块（必须遍历全部 slot）');

  /* --- ⑧ 施工图 = 一张总图（拍板 ⑤）：出图时临时切整组视图并还原 --- */
  const gdw = bodyOf(INDEX_SRC, 'ppGenerateDiagram', 1600);
  assert.match(gdw, /ge\.mode='whole'/, '出图前必须临时切成整组视图（否则画的是当前块的图）');
  assert.match(gdw, /ge\.mode=mode0/, '出完图必须把 mode 还原（否则编辑态被偷偷改掉）');
  assert.match(gdw, /finally\{|finally \{|finally\s*\{/, '还原必须放在 finally 里（中途 return / 抛错也要还原）');
};
