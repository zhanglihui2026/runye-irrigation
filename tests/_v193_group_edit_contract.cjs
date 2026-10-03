/* tests/_v193_group_edit_contract.cjs · v193「成组编辑 整组/逐块」静态契约
 *
 * 单独成文件，是为了让「注入体检」能**在内存里**对改动后的源码重跑同一套断言 ——
 * 不必真去写 index.html（写文件就要备份/还原，正是上次 git checkout 抹改动那类风险），
 * 也不必再 spawn 一个 node 子进程（本环境 spawnSync 报 EBUSY）。
 * 契约本身与 tests/plot_merge.smoke.cjs 的 ③-k 是同一份，不存在两份漂移。
 */
'use strict';
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

/* 跨页导航是 runye-nav.js 的 ITEMS（唯一出处）。它不参与「注入体检」（体检只改 index.html），
   所以这里自己读一份即可 —— 不用把它塞进参数里让调用方多背一个包袱。 */
const NAV_SRC = fs.readFileSync(path.join(__dirname, '..', 'runye-nav.js'), 'utf8');

module.exports = function v193GroupEditContracts(INDEX_SRC, helpers) {
  const { stripComments, bodyOf, countIn } = helpers;
  const ENHANCE_NAV_SRC = NAV_SRC;
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

  /* --- ① 切换控件与状态机存在且在载入时初始化 ---
     [v194] #ppGeTrunk 与 ppAddTrunkPipe 已按用户决策撤掉（总管统一在「成组管路」页编辑），
     见下方 ⑤ 的**反向断言**。 */
  ['ppGroupEditWrap', 'ppGeWhole', 'ppGePerPlot', 'ppGePlotSel'].forEach(function (id) {
    assert.ok(INDEX_SRC.indexOf('id="' + id + '"') > 0, '工具栏应有 #' + id);
  });
  ['ppInitGroupEdit', 'ppGroupActiveSubs', 'ppSetGroupMode', 'ppSelectGroupPlot',
    'ppGroupEditBlocks', 'ppXformGroupAll', 'ppDrawGroupTrunk'].forEach(function (fn) {
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
  assert.match(bodyOf(INDEX_SRC, 'ppGroupEditBlocks', 600), /mode!=='pickPipe'/,
    '整组态只放行「管线拾取」（块级一律拦掉；总管已迁去成组管路页）');
  /* 拦了还不够，得有**消费点**：模式切换、画布落点、按钮置灰 —— 三处（缺一处就能绕） */
  const blockUses = (NC.match(/ppGroupEditBlocks\(/g) || []).length;
  assert.ok(blockUses >= 4, 'ppGroupEditBlocks 的消费点应 ≥ 4 处（定义1 + 模式切换 + 画布落点 + 按钮置灰），实际 ' + blockUses);
  assert.ok(bodyOf(INDEX_SRC, 'ppSetMode', 1400).indexOf('ppGroupEditBlocks(') >= 0,
    'ppSetMode 必须拦块级模式（只靠按钮 disable 会被脚本绕过）');
  assert.ok(bodyOf(INDEX_SRC, 'ppSyncGroupEditUI', 2600).indexOf("setAttribute('disabled','disabled')") >= 0,
    'ppSyncGroupEditUI 必须把块级按钮置灰（与其点了报错，不如根本点不动）');

  /* --- ⑤ 总管：编辑入口唯一（成组管路页），二级页只剩只读渲染（v194 拍板 ③） ---
     ★ 为什么要有反向断言：总管是**整组级**对象，二级页能画 + 新页也能画
       ⇒ 同一份数据两个入口，必然改一处漏一处。这里钉死「二级页不能再有入口」。 */
  assert.ok(!/id="ppGeTrunk"/.test(INDEX_SRC),
    '二级页不得再有 #ppGeTrunk 按钮（总管编辑入口必须唯一：成组管路页）');
  assert.ok(!/function ppAddTrunkPipe\(/.test(NC),
    '二级页不得再有 ppAddTrunkPipe()（总管不再由二级页落线）');
  assert.ok(!/ppState\.mode==='trunk'/.test(NC),
    '二级页不得再有 trunk 模式（模式会带出画线入口，等于又把入口开回来了）');
  /* 但只读渲染必须还在：二级施工图画的是「一张总图」，总管要在上面看得见 */
  assert.match(NC, /id="ppTrunkLayer"/, '施工图应有独立的 #ppTrunkLayer（只读，不进裁剪组）');
  assert.match(bodyOf(INDEX_SRC, 'ppDrawGroupTrunk', 700), /ge\.trunkPipes/,
    'ppDrawGroupTrunk 应渲染 ge.trunkPipes（与成组管路页同一份数据）');
  /* 迁移：历史数据（v193 在二级页画的总管）要能被新页接管，不能凭空消失 */
  assert.match(bodyOf(INDEX_SRC, 'grSync', 2200), /ge\.trunkPipes/,
    'grSync 必须迁移 __runyeGroupEdit.trunkPipes（旧数据不丢）');

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

  /* =========================================================================
     --- ⑨ ~ ⑫ [v194] 成组管路页 + 按块进入三级页 ---
     ========================================================================= */

  /* --- ⑨ 新页存在，且插在「二级管路」与「三级管路编辑」之间（工作流顺序） --- */
  const iGr = INDEX_SRC.indexOf('<section id="grPipeSection"');
  const iPp = INDEX_SRC.indexOf('<section id="pipePlanSection"');
  const iTl = INDEX_SRC.indexOf('<section id="tlPipePlanSection"');
  assert.ok(iGr > 0, '应有 #grPipeSection（成组管路页）');
  assert.ok(iPp < iGr && iGr < iTl,
    '#grPipeSection 必须位于二级与三级之间（二级逐块画管 → 本页总管 → 三级按块深入）');
  assert.match(INDEX_SRC, /<section id="grPipeSection" class="ry-sec"/,
    '#grPipeSection 必须带 .ry-sec（否则 ryShowSection 的 "main > .ry-sec" 扫不到它）');
  /* 导航：runye-nav.js 是跨页共用的唯一出处，漏了这一项 = 整页没有入口 */
  assert.match(ENHANCE_NAV_SRC, /hash:\s*'grPipeSection'/,
    'runye-nav.js 的 ITEMS 里应有「成组管路」入口（跨页导航的唯一出处）');

  /* --- ⑩ 按块进入三级页：三件事缺一不可 ---
     tlAutoGenerate() 的输入只有两个：measuredPolygon（当单地块用）与
     RunyeBridge.getZoneCuts()（内部读二级页的 ppState.polyPts）。⇒ 必须**同时**摆对：
       a) measuredPolygon = 这一块的环
       b) ppState.polyPts  = 这一块的环（靠 setGroupMode + selectGroupPlot）
     ★★ 曾经这里写的是「selectGroupPlot 必须早于 measuredPolygon」—— 那是**恒真断言**：
        ppSelectGroupPlot() 内部自己就会 ppApplySlot()，两条语句谁先谁后结果完全一样，
        注入「交换顺序」只会让**源码文本**变红，行为一点没变（断言测的不是它声称的东西）。
        ⇒ 改成下面三条各自独立可失效的断言，行为侧由 _p1/_probe_group_work.cjs 的 G6 实测。 */
  const geb = bodyOf(INDEX_SRC, 'grEnterBlock', 1600);
  assert.match(geb, /selectGroupPlot/, 'grEnterBlock 必须把二级页切到那一块');
  /* ★ setGroupMode('perPlot') 不是装饰：ppSelectGroupPlot 只在 ge.mode==='perPlot'
       时才 ppApplySlot()。若二级页停在**整组态**，光调 selectGroupPlot 只会改 ge.current，
       ppState.polyPts 仍是外框 ⇒ getZoneCuts() 返回外框的分区网格，三级页分区全错。 */
  assert.match(geb, /setGroupMode\(/, 'grEnterBlock 必须确保二级页处于逐块模式（否则 polyPts 还是外框）');
  assert.match(geb, /measuredPolygon\s*=\s*b\.ring/, 'grEnterBlock 必须把 measuredPolygon 换成该块的环');
  assert.match(geb, /__runyeTlBlock\s*=\s*i/, 'grEnterBlock 必须记下当前块号（供返回条与拦截放行用）');
  /* ★ 隐藏的地雷：grSync() 会用 window.measuredPolygon 当整组外框的兜底。
       若在「按块编辑中」刷新（此时 measuredPolygon 已是**某一块**的环），
       W.frame 就被污染成那一块 ⇒ 返回成组页时外框丢失。
       ⇒ 必须优先取二级页的 ge.framePts，只有它没有时才退回 measuredPolygon。 */
  assert.match(bodyOf(INDEX_SRC, 'grSync', 2200), /ge\.framePts[\s\S]{0,160}?measuredPolygon/,
    'grSync 必须优先用 ge.framePts 当整组外框（measuredPolygon 在按块编辑时会变成某一块）');
  /* 返回：先存本块的三级结果，再恢复整组外框 —— 少了前者，换块回来结果就没了 */
  const gbk = bodyOf(INDEX_SRC, 'grBackFromTl', 1400);
  assert.match(gbk, /tlData\s*=\s*clone\(window\.tlDiagramData\)/, '返回时必须把本块的三级结果存档');
  assert.match(gbk, /measuredPolygon\s*=\s*clone\(window\.__runyeGroupFrame\)/, '返回时必须恢复整组外框');
  assert.match(gbk, /__runyeTlBlock\s*=\s*null/, '返回时必须清掉「按块编辑」标记（否则成组拦截永远放行）');

  /* --- ⑪ 按块编辑时三级页必须放行，且界面上必须写明是第几块 --- */
  assert.match(bodyOf(INDEX_SRC, 'ryGroupThirdLevelGuard', 700), /window\.__runyeTlBlock!=null/,
    'ryGroupThirdLevelGuard 必须在「按块进入」时放行（此刻口径确实就是单地块）');
  assert.match(INDEX_SRC, /id="grTlBackBar"/, '三级页应有「按块编辑」返回条（算完不知道算到谁头上就完了）');
  assert.match(INDEX_SRC, /id="grTlBackBtn"/, '返回条上要有「返回成组管路」按钮');

  /* --- ⑫ 汇总口径：各块明细 + 总管单独一行 + 合计（拍板 ④） --- */
  const gmat = bodyOf(INDEX_SRC, 'grRenderMat', 2400);
  assert.match(gmat, /各块明细/, '汇总必须分「各块明细」组');
  assert.match(gmat, /整组总管/, '汇总必须有「整组总管」单独一组');
  /* ★ 不能只写 /合计/ —— 空态提示文案里也有「分块明细与合计」四字，会把断言顶住
     （v16 注入「把合计行改名」时契约仍全绿，就是这个原因）。必须钉到 gr-sum 那一行。 */
  assert.match(gmat, /class="gr-sum"><td>合计<\/td>/, '汇总必须有合计行（且必须是 gr-sum 那一行）');
  /* ★ 反向断言：总管长度绝不能并进任何一块的明细 —— 那正是「串味」 */
  assert.ok(!/tMain\s*\+=\s*tk/.test(gmat),
    '总管长度不得并进各块的主管合计（各块口径必须独立）');
  assert.match(gmat, /tMain\s*\+\s*tk/, '合计行应把总管长度加进去（总价才拿得出来）');

  /* =========================================================================
     --- ⑬ [v194] 二级页「正在编辑的那一块」必须能被组页实时读到 ---
     =========================================================================
     ★★ 这条是 _p1/_probe_group_work.cjs 的 G5c 实测抓出来的真 bug：
        grSync 原来只读 __runyeGroupEdit.slots[i]，而 slots[i] 只在
        「切块 / 切模式」时才从 ppState 捕获一次。
        ⇒ 用户在二级页画完管**直接切到成组管路页**，组页看到的还是切块前的快照，
          刚画的管在总览和汇总里**都不出现**（实测：二级页 mainPipes=1，组页 slot=0）。
        修法：RunyeBridge 暴露 groupLiveSlot()（内部调纯函数 ppCaptureSlot()），
        grSync 对「当前正在编辑的那一块」优先取实时的一份。 */
  assert.match(NC, /groupLiveSlot:\s*function/,
    'RunyeBridge 应有 groupLiveSlot()（把二级页正在编辑的那一块取出来）');
  const gsy = bodyOf(INDEX_SRC, 'grSync', 2600);
  assert.match(gsy, /groupLiveSlot/, 'grSync 必须调 groupLiveSlot() 取实时快照');
  /* ★ 正则要留空格：源码写的是 `i === liveIdx`（带空格），写成 /i===liveIdx/ 永远 0 命中。 */
  assert.match(gsy, /i\s*===\s*liveIdx/, 'grSync 只对「当前正在编辑的那一块」用实时快照（其余仍读 slot）');
  /* 反向：不得退回「只读 slots[i]」—— 那个 bug 的形状就是缺了 live 这一路 */
  assert.ok(/live/.test(gsy) && /slot:\s*\(/.test(gsy),
    'grSync 的 slot 取值必须是「实时优先、快照兜底」二选一结构');

  /* 空态文案：0 块时面积要显示「—」而不是「0.00 亩」（后者像「有地块但面积为 0」） */
  assert.match(bodyOf(INDEX_SRC, 'grRenderBar', 900), /n\s*\?\s*fmt\(mu,\s*2\)\s*:\s*'—'/,
    'grRenderBar 在 0 块时面积应显示「—」');

  /* =========================================================================
     --- ⑭ [v196] 成组管路页：各块分区线必须画出来；总管只留手画 ---
     =========================================================================
     用户原话：「这个页面要把管路跟每个地块分区都显示出来，这样我才能判断后续怎么规整，
     只显示主管跟支管，总管不用显示，总管我会根据实际情况，手动画。」
     ⇒ ① 分区几何必须**走 RunyeBridge.zoneCutsFor 桥**（内部就是二级页同一套
        ppGetZoneLayout/ppGetZoneCuts）—— v196 第一版在成组页 IIFE 里直接引用
        ppState/ppGetZoneCuts，跨 IIFE 够不着，group_work 探针 FATAL 实测抓到。
       ② 「⚡ 自动生成总管」按钮与 grAutoTrunk 整个撤掉（用户手动画）。 */
  assert.match(NC, /zoneCutsFor:\s*function/,
    'RunyeBridge 应有 zoneCutsFor()（成组页分区线走二级页同一套分区几何）');
  /* ★ swap-restore 必须完整：ppGetZoneCuts 在 sig 不匹配时会经 ppResetCutSnap
     改写 ppState.cutSnap 和 mergePreview —— 不还原就会污染二级页当前状态。
     ★★ zoneCutsFor 是**对象方法**（zoneCutsFor: function(...)）—— bodyOf 只认
       'function zoneCutsFor(' 永远切不到它 ⇒ zcf 恒为空串，三条还原断言变成
       「对空串恒红」的假红（红的原因不是缺陷本身）。必须用方法签名锚切窗口。 */
  const zi = NC.indexOf('zoneCutsFor: function(');
  assert.ok(zi >= 0, 'RunyeBridge.zoneCutsFor 方法签名必须存在（对象方法锚）');
  const zcf = NC.slice(zi, zi + 1200);
  assert.match(zcf, /finally/,
    'zoneCutsFor 必须 try/finally（分区快照换入后无论成败都要还原）');
  assert.match(zcf, /cutSnap\s*=\s*keepSnap/, 'zoneCutsFor 必须还原 cutSnap');
  assert.match(zcf, /cutOverrides\s*=\s*keepOv/, 'zoneCutsFor 必须还原 cutOverrides');
  assert.match(zcf, /mergePreview\s*=\s*keepMp/, 'zoneCutsFor 必须还原 mergePreview');
  /* grZonesFor 必须走桥 —— 反向断言正是第一版 ReferenceError 的形状 */
  const gz = bodyOf(NC, 'grZonesFor', 1800);
  assert.match(gz, /RunyeBridge/, 'grZonesFor 应取 window.RunyeBridge');
  assert.match(gz, /zoneCutsFor\(/, 'grZonesFor 必须调 RunyeBridge.zoneCutsFor()');
  assert.ok(!/ppState|ppGetZoneCuts|ppGetZoneLayout|ppZoneActualAreaM2/.test(gz),
    '成组页 IIFE 里不得直接引用二级页私有（ppState / ppGetZoneCuts / ppGetZoneLayout / ppZoneActualAreaM2）—— 跨 IIFE 够不着，直接引用就是 ReferenceError');
  /* grRender 里要有分区绘制段（裁剪到块环 + 非标琥珀描边只算本块自己的环） */
  const grd = bodyOf(NC, 'grRender', 4200);
  assert.match(grd, /grZonesFor\(/, 'grRender 应逐块调 grZonesFor 画分区线');
  assert.match(grd, /217,119,6/, '非标分区应有琥珀描边（口径同二级页）');
  assert.match(grd, /clipPolyToRect/, '分区面积必须裁剪到本块环（不得走 ppZoneActualAreaM2）');
  /* 「⚡ 自动生成」撤掉。★★ 按钮断言必须用**原始 INDEX_SRC**（不走 NC）：
     stripComments 会把 accept="image/*" 属性值里的 /* 当块注释起点、一直吞到
     600 行后的 CSS 注释才闭合 ⇒ NC 里成组页整段 HTML 消失 ⇒ 走 NC 的按钮
     反向断言恒真（假绿，_gate v25 恒绿实测抓到）。（index.html 已把 accept
     改成扩展名列表根治，但断言仍钉在原始源码上，防同类问题复发。） */
  assert.ok(!/id="grTrunkAuto"/.test(INDEX_SRC), '「⚡ 自动生成」按钮应已撤掉（用户手动画总管）');
  assert.ok(!/function\s+grAutoTrunk\b/.test(NC), 'grAutoTrunk 函数应已删（死代码会让人以为还在自动生成）');
  assert.match(NC, /分区线/, '图例应有「分区线」项');

  /* =========================================================================
     --- ⑮ [v197] 成组逐块：分区规划尺寸必须 = 本块真实 bounds ---
     =========================================================================
     用户原话：「这个分区是按照18亩划分的，逐块划分却不是，要改成统一的，
     按照设定的亩数划分才行。」（2026-10-04 实测截图：整组 9 区 ≈18 亩/区，
     逐块 12 区却只有 3.3~8.9 亩/区。）
     根因：runyePlanDims 是按**回传时刻整组实测面积**算的全局规划尺寸（650×420）；
     逐块拿本块 bounds（300×400）去除以它 ⇒ sx·sy≈块/整组 ≈0.44
     ⇒ 18 亩/区实际切出 ≈7.9 亩，且区数按整组 dims 切（11×3），与整组对不上。
     修法（v189 原则：改上游）：ppGetPlanDims 在 perPlot 直接返回本块 bounds ——
     布管/材料/水力/三级页（走 Bridge.getZoneCuts / getPlanDims）全链路自动跟随。 */
  const ppd = bodyOf(NC, 'ppGetPlanDims', 1600);
  assert.match(ppd, /mode\s*===\s*'perPlot'/, 'ppGetPlanDims 应识别成组逐块模式（v197）');
  assert.match(ppd, /w\s*:\s*b\.w,\s*h\s*:\s*b\.h/,
    '逐块时 dims 必须取本块 bounds（sx=sy=1，设定亩数才落地）');

  /* =========================================================================
     --- ⑯ [v198] 成组管路页：主管/支管必须有尺寸标注 ---
     =========================================================================
     用户原话：「这个页面增加尺寸标注，显示主管 支管。」
     ⇒ 每根主管/支管在长度中点标管长（白底小牌、屏幕字号）；grRender 的标注层
       必须画在**所有线之后**（否则被线压住）。 */
  assert.match(NC, /function\s+grLabel\(/, 'grRender 应有 grLabel()（白底尺寸标注）');
  assert.match(NC, /function\s+grMidOf\(/, 'grMidOf()（折线长度中点）应存在');
  const grd16 = bodyOf(NC, 'grRender', 5200);
  /* ★ 分色各断一条：只删一种时另一条仍顶住 ⇒ 断言恒绿的假捕获（v28 首版实测） */
  assert.match(grd16, /grLabel\(fmt\(sumLen\(\[l\]\),\s*1\),\s*grMidOf\(l\),\s*'#185FA5'\)/,
    '主管应逐根标注管长（蓝字）');
  assert.match(grd16, /grLabel\(fmt\(sumLen\(\[l\]\),\s*1\),\s*grMidOf\(l\),\s*'#15803d'\)/,
    '支管应逐根标注管长（绿字）');
  /* 反向：标注调用必须在 strokeLines 之后（同一 grRender 内先画线后标字） */
  assert.ok(grd16.indexOf('grLabel(') > grd16.indexOf('strokeLines('),
    '尺寸标注必须画在管线之后（标注层在最上，不被线压住）');
  assert.match(NC, /管长/, '图例应有「线上数字=管长(m)」说明');

  /* =========================================================================
     --- ⑰ [v199] 二级左栏「入口压力」输入（fld_tapePressure 镜像） ---
     =========================================================================
     用户原话：「左侧工具栏增加入口压力输入。」
     入口压力 = 01 一级表单「滴灌带入口工作压力 fld_tapePressure」（扬程计算式条的
     「入口压力」= bar×10.2m）。★ 必须**镜像** fld_*（v91 机制），不得建第二份数据源 ——
     calcPlan / 扬程分解 / 计算式条内联编辑全都只认 fld_*。 */
  assert.match(NC, /id="planTapePressure"/, '二级左栏应有「入口压力」输入框（v199）');
  assert.match(NC, /\[\s*'planTapePressure',\s*'fld_tapePressure'\s*\]/,
    '入口压力必须与 fld_tapePressure 双向镜像（同一物理量，不得建第二份数据源）');
  assert.match(NC, /'planLift',\s*'planDh',\s*'planTapePressure'\]/,
    '入口压力改值后必须触发 calcPlan 重算（扬程/计算式条实时跟随）');

  /* =========================================================================
     --- ⑱ [v201] 整组态自动布管必须逐块落档 + 本块尺寸口径 + 组页一键生成 ---
     =========================================================================
     用户原话：「尺寸标注没有，主管跟支管未显示，要显示出来。」
     根因（_p1/_diag_v201_group_pipes.cjs 实测，路径 A）：回传后默认「整组」态，
       点「自动管路」产物只落在整组合并视图 ppState 里，ppSetGroupMode 明确
       「整组态的管线不存档」⇒ 一根都没进 ge.slots[i] ⇒ 成组管路页无从画起。
     ⇒ 三个结构性前提，缺一不可：
       ① ppBuildAutoPipes 纯内核存在，且整组态逐块调用并写回 ge.slots[i]；
       ② 内核带 useOwnDims（ppGetPlanDims 的 ppOwnDimOverride 通道）——
         否则整组态拿整组估算 dims 去切每一块（实测 36 根 vs 逐块 14 根，
         v197 同类口径串味复发）；
       ③ 成组管路页有「⚡ 生成各块管路」按钮，且走桥（不写第二份算法）。 */
  const zcfW = NC.indexOf('zoneCutsFor: function(');
  assert.ok(zcfW > 0, 'RunyeBridge.zoneCutsFor 桥应存在（v196）');
  const zcf18 = NC.slice(zcfW, zcfW + 1200);
  assert.match(zcf18, /ppOwnDimOverride=true/,
    'zoneCutsFor 必须按本块 bbox 尺寸算分区（否则成组管路页的分区线退回整组口径）');
  assert.match(NC, /var ppOwnDimOverride=false/, 'ppOwnDimOverride 开关应存在（v201）');
  assert.match(NC, /function\s+ppBuildAutoPipes\(/, '应有自动布管纯内核 ppBuildAutoPipes()');
  const bapW = NC.indexOf('function ppBuildAutoPipes(');
  const bap = NC.slice(bapW, bapW + 3000);
  assert.match(bap, /ppOwnDimOverride/, '内核应接 useOwnDims → ppOwnDimOverride（本块尺寸口径）');
  assert.match(bap, /finally\{ ppState\.polyPts=keepPoly/, '内核必须还原 ppState.polyPts（swap-restore）');
  const agW = NC.indexOf('function ppAutoGeneratePipes(');
  const ag = NC.slice(agW, agW + 4200);
  assert.match(ag, /ppIsGroupWhole\(\)/, '整组态必须走「逐块生成」分支');
  assert.match(ag, /ppBuildAutoPipes\(s\.polyPts,\s*planN,\s*isThree,\s*true\)/,
    '整组态逐块生成必须按本块尺寸（useOwnDims=true，否则主管根数与逐块态对不上）');
  assert.match(ag, /ppCollectGroupAllPipes\(\)/,
    '整组视图必须用既有合并函数（与 ppSetGroupMode 同一套口径，不写第二份）');
  assert.match(ag, /ppSlotRebuildIds\(s\)/, '写回 slot 后必须重建 pipeIds/hiddenPipes');
  assert.match(NC, /function\s+ppIsGroupWhole\(/, '应有 ppIsGroupWhole() 判定');
  assert.match(NC, /autoPipesWhole:\s*function/, 'RunyeBridge 应暴露 autoPipesWhole（组页一键布管的唯一入口）');
  assert.match(NC, /clearPipesWhole:\s*function/, 'RunyeBridge 应暴露 clearPipesWhole');
  const cpW = NC.indexOf('function ppClearPipes(');
  const cp = NC.slice(cpW, cpW + 1400);
  assert.match(cp, /ppIsGroupWhole\(\)/, '整组态「清除管路」必须落回各块 slot（与生成对称）');
  /* 组页侧：按钮存在（HTML 属性断言一律钉原始 INDEX_SRC，v196 stripComments 陷阱） */
  assert.ok(INDEX_SRC.indexOf('id="grPipeAuto"') > 0, '成组管路页应有「⚡ 生成各块管路」按钮');
  assert.ok(INDEX_SRC.indexOf('id="grPipeClear"') > 0, '成组管路页应有「🗑 清除各块管路」按钮');
  const grIife = NC.slice(NC.indexOf('window.__runyeGroupWork = W'));
  assert.match(grIife, /autoPipesWhole\(\)/, '组页生成必须走桥（不得在本页重写布管算法）');
  assert.match(grIife, /未布管/, '子地块列表应标出「未布管」状态（让用户分辨「没数据」与「页面坏了」）');
};
