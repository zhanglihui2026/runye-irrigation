# 扬程对不上问题：管损/流速口径排查任务书

> 状态：阶段 A 取证完成，待用户拍板阶段 B｜范围：三级「分区与管路」页 扬程链（改径重算列、管损卡、水泵扬程）｜类型：口径取证与钉死，先取证后改
> 用户场景（2026-11-08 截图实测）：主管改径 Ø180→Ø110 并「更新水泵扬程」后，水泵扬程 32.2 → 77.2 m（+45.0 m）；管损卡显示 总管 200.0 m · 损失 3.48 m／主管 392.0 m · 损失 42.32 m／支管 41.7 m · 损失 1.17 m／合计 633.7 m · 损失 46.97 m；主管流速橙列 5.83 m/s。

## 1. 已核实结论（2026-11-08 node 复算，先钉死的部分）

以下为已逐位验证、**不是 bug** 的部分，研究时不必重查：

1. **主管损失 42.32 m 物理正确**：`hazenWilliams(392, 90.3, 93.82, C=150) = 42.31` 逐位吻合。
   - 公式（全站唯一出处 `runye-hydraulics-core.js` / `hydraulic-calc/hc-core.js`）：
     `hf = 1.113e9 · L · Q^1.852 / (C^1.852 · D^4.87)`，Q: m³/h，D: 内径 mm。
   - 内径 = OD × (1 − 2/SDR)，SDR=13.6（`mod/inline-09.js` 顶部常量）→ Ø110 内径 93.8 mm。
   - C_HAZEN = 150（`mod/inline-09.js:3`）。
2. **主管长 392 m 的结算口径**：图面已生成时取「最不利路径」上那条主管的**实际折线长**
   （`tlWorstPathLen()` → `wp.main`，`mod/inline-09.js:1528`）；无图面才退回左栏「单区主管长度」试算输入
   （`#tl_mainPipeLen`，默认 300）。底部状态条的 745.5 m 是全部 10 根主管总长（材料口径），两者口径不同、都对。
3. **+45 m 扬程跳变的来源**：管损合计 46.97 − 改径前约 1.97 ≈ 45.0，即几乎全部来自 Ø110 主管
   （比阻 ∝ D^4.87，Ø180→Ø110 内径比 153.5/93.8 ⇒ 比阻 ×11；392 m 长度放大）。对照表：
   Ø110=42.31 / Ø125=22.70 / Ø140=13.07 / Ø160=6.82 / Ø180=3.84 / Ø200=2.30（392 m @ 90.3 m³/h）。

## 2. 待研究疑点（本任务的核心）

### 疑点① 主管「改径重算」列流速 5.83 m/s 的流量口径

- 同口径复算：90.3 m³/h @ Ø110（内径 93.8）= **3.63 m/s**；5.83 m/s 反推流量 ≈ **145.1 m³/h** ≠ 90.3。
- 同屏支管橙列 2.71 m/s 复算**精确吻合**（45.15 = 90.3/2 根并联 @ Ø90 内径 76.8）⇒ 支管口径链是对的，
  主管流速行的流量或管径入参疑似与管损卡不一致。
- 相关代码（执行时须复核行号）：
  - 流速行：`mod/inline-09.js` `tlRealSet('tlPlanMainVelocityReal', actualVelocity(hp ? hp.mainFlow : r.zoneFlow, usedCals['main-' + worstZi] || r.mainPipe.od), 'm/s', 2)`（约 3482 行）；
  - `hp = r.hydraulicPath = pathCheck.worst`（约 1691 行），`mainFlow: z.flow`（`hydraulic-calc/pipe-path-loss.js:37`，单区自身流量）；
  - `usedCals` 来自 `tlAppliedPipeOverride().calibers`，注意全局键（`main`）与逐区键（`main-<zi>`）两套并存。
- 需回答：145.1 m³/h 从哪来？（最不利分区的自身流量？面积换算出入？逐区改径键回退到别的 od？）

### 疑点② 管损卡总管行 3.48 m 的管径口径

- 反推：3.48 = hazen(200, 90.3, **136.5**) → 内径 136.5 mm ≈ **Ø160**；
  与总管选管显示 Ø180（应 1.94 m）/ Ø210（应 0.93 m）都不吻合。
- 可能解释：用户会话中应用过 Ø160 改径未退回（inline 记忆位）；或 `frontPipeLoss` 的管径来源另有口径。
- 相关代码：`tlRefreshLossCard`（`mod/inline-09.js` 约 3306 行）、
  `frontPipeLoss = hazenWilliams(frontLenUsed, combinedFlow, frontPipe.id)`（约 1623 行）、
  `tlFrontLenUse` 收口（约 1090 行，src='mapTrunk'|'figure'|'input'）。

## 3. 执行阶段建议

### 阶段 A：探针取证（只读）

1. 用 `_probe_front_purge.mjs` 的全链脚手架（注入地块→二级生成→三级生成）复现用户配置：
   按 129.51 亩 / 10 分区 / 滴头间距 0.25、滴带间距 0.8、滴头流量 2.0 建区，应用主管 Ø110 改径 + 「更新水泵扬程」。
2. 一次读取并对照：`r.combinedFlow / r.zoneFlow / hp.mainFlow / hp.frontFlow / worstZi / usedCals 全量 /
   r.frontPipe.od 与 .id / r.mainPipe.od 与 .id`，与管损卡、流速橙列逐项对账。
3. 复算基准（node 一行即可）：
   `const hazen=(L,Q,D,C=150)=>1.113e9*L*Math.pow(Q,1.852)/(Math.pow(C,1.852)*Math.pow(D,4.87));`
   `const inn=od=>od*(1-2/13.6);`

### 阶段 B：口径钉死与修复（取证后另行确认）

1. 给出两个疑点的根因结论（口径不一致 vs 显示层取错 vs 用户会话残留），先向用户汇报再动代码。
2. 若确认为口径不一致：明确「改径重算列」与「管损卡」各自应该用的流量/管径口径，写进注释与本文件，必要时收口到单一函数。
3. 回归：全量测试 + `_probe_front_purge.mjs` + 新增流速/管损对账探针。

## 4. 边界

- 本任务为**研究取证**优先；未取得根因结论前不改公式、不改算法、不动水力校核页。
- 用户已确认的物理事实（主管 42.32 m 损失、392 m 长度口径）不作为疑点重查。

## 5. 阶段 A 取证记录（2026-11-08，探针 `_probe_head_audit.mjs` / `_probe_diag_fig.mjs` / `_probe_residue.mjs`）

### 5.0 【P0·新发现·已实锤】图面最不利路径链自 v900 起整体死亡

- 全项目 `segTrunk` 只有一处赋值：`mod/inline-09.js:4958` 硬编码 `segTrunk: null`。
  引入提交 = **fb12ca2 v900（2026-11-02）**：该提交主题是「水源 tooltip 修正」，
  但顺带把 `segTrunk: (function(){...tlSegTrunkLoc...})()` 生成 IIFE 与地图反投段一并删除
  ——commit 信息未提及此删除，属**静默误删活功能**（tlSegTrunkLoc 是 v859 段总管引擎的活输入）。
- 连锁（`segWorstPath` inline-09.js:1252-1255）：`d.segTrunk` 恒 null ⇒ `tlWorstPathLen()` 恒 EMPTY
  ⇒ `wp.fromFigure` 恒 false ⇒ **`RyPipePathLoss.calculate` 永不被调用、`r.hydraulicPath` 恒 null**
  （探针实证：tlDiagramData.mainPipes=30 根在场，pathCheck 钩子仍全程 null）。
- 后果：
  1. 管损卡「生成管线图后改用图面实际几何」承诺失效，恒显示「（试算输入值）」；
  2. 主管/支管长度永用试算输入（A 边 / 满跨÷并联根数），**图面折线长、图面改长增量、手绘驳接几何全部不进扬程**（手绘总管仅经 tlFrontLenUse 进 front 一行的长度）；
  3. 流速橙列退化为三种流量口径混排（见 5.1）；
  4. 逐区/逐段改径模型（pipe-path-loss 按取水点分段递减）整体旁路，改径损失退化为「全局代表流量×设计长度」。
- 注：v1011/v1015 只是清了已死的自动总管渲染代码；**链路死亡时点是 v900**。

### 5.1 疑点① 取证结果：口径矩阵已钉死，5.83 与 2.71 数学上不可同源

- 干净会话探针（zoneCount=1，13 亩/区）：主管改 Ø110 后橙列 2.32 m/s = 57.78@内径93.8 **精确吻合**；
  管损卡主管 24.59 m = hazen(521, 57.78, 93.82) **精确吻合** ⇒ 无图面退化链本身自洽。
- 流速橙列口径（hp 恒 null 后，inline-09.js:3481-3483）：
  | 行 | 流量口径 | 管径口径 |
  |---|---|---|
  | 总管 | `r.combinedFlow` | `usedCals.front \|\| r.frontPipe.od` |
  | 主管 | `r.zoneFlow` | `usedCals['main-'+worstZi] \|\| r.mainPipe.od`（worstZi 恒 null ⇒ 恒 r.mainPipe.od） |
  | 支管 | `r.branchFlow`（= zoneFlow/并联数） | `usedCals['branch-'+worstZi] \|\| r.branchPipe.od` |
- 用户会话流量口径由管损卡数字反推锁定：42.32=hazen(392,**90.3**,93.82)、3.48=hazen(200,**90.3**,136.5)、
  支管 2.71=45.15(=90.3/2)@76.8 ⇒ zoneFlow=combinedFlow=90.3、并联 2 根。
- **数学不相容**：若 5.83 与 2.71 出自同一口径链（同一 zoneFlow/同一并联数），则
  5.83 需流量 145.1@Ø110，而该会话全链只有 90.3/45.15 两个流量，无任何代码路径可产出 145.1。
  ⇒ 5.83 必然来自「另一时刻/另一行/另一口径」的读数，候选：
  a. 改径**前**截图残留（Ø180 设计档时代某行的值）；
  b. 下拉选项提示（tlCalSelOptions 每档带流速提示）被读成橙列；
  c. 用户会话 zoneFlow 实为 145.1（阶梯裁剪造成最大区 21.8 亩）而 90.3 是另一区——需现场数据分辨。
- **待用户补充**：完整面板截图（含联合流量行 + 三行橙列同框）或 F12 执行
  `JSON.stringify({zoneFlow, combinedFlow, zoneCount, manualCals: window.tlManualCals})` 的结果。

### 5.2 疑点② 取证结果：残留改径口径分叉，已复现实锤

- 用户会话数字反推：3.48 = hazen(200, 90.3, **136.5**) ⇒ 管损卡总管行按 **Ø160 内径**在算。
  设计档反推：selectPipe(90.3, 1.5) ⇒ Ø180（内径 153.5，应显示 2.39 m）≠ 160。
- frontPipe.id 覆写只有一条路：`manualCals.front`（inline-09.js:1719-1723 无图面分支覆写）。
  ⇒ **用户会话存在「总管 Ø160 手动改径残留」**（曾把总管下拉选到 160 未选回设计档）。
- 探针复现（`_probe_residue.mjs`）：注入 manualCals.front=160 后——
  管损卡总管 2.92→1.52 m（跟随 Ø160）✔、总管橙列 1.10 m/s（Ø160 口径）✔、
  但设计列仍显示「Ø 140 mm / 1.43 m/s」（设计档）✔ ——
  即**管损卡/橙列跟随残留改径档、设计列与下拉「设计」标注显示设计档**，两处口径分叉，
  与用户「反推 Ø160 vs 显示 Ø180」的现象完全同构。
- 附加发现：PE_OD_SERIES = 50/63/75/90/110/125/140/160/180/200/225/250/280/315/355/400/450/500，
  **不存在 Ø210 档**——用户记忆中的「Ø210」应为 Ø200 或 Ø225 的误读（或来自对比表）。

### 5.3 阶段 B 修复进展（2026-11-08 晚，用户拍板）

1. **P0：恢复图面最不利路径链 —— 已完成（v1017-seg-trunk-restore，未部署）**：
   - index.html 恢复引入 `mod/tl-seg-trunk.js?v=887-tape-zone-vgate`（v887 悬空注释物归原位）；
   - inline-09.js 恢复四处：tlSegTrunkLoc 生成（src:null）+ 图面干线/驳接点渲染 + 快照 segTrunk IIFE + trunkSource auto/missing + 地图反投段；
   - 测试契约同步两处反转（seg_trunk_to_map ① / auto_trunk_removed segTrunk 条）；版本闸保持恰 14 处主串；
   - ry-panel.css（上一轮 caret 黑框修复）query 抬 v1017-caret-flat 防缓存；
   - 回归：124/124 测试全过；_probe_front_purge 21/21；探针实证 wp.fromFigure=true、
     pathCheck 被调用（calibers main-0..29 传入）、管损卡「试算输入值」→「图面实际 × 最远 3 区」
     （总管 320 m 干线段、主管 54.2 m 图面折线）。
2. **P1：残留改径显示收口 —— 方案已给示意图，待用户确认后实施**。
3. **P1：橙列口径矩阵注释 —— 方案已给示意图，待用户确认后实施（纯注释，页面零变化）。**

### 5.4 阶段 C：最远水路数据源更换（v1019-map-routes-worstpath，2026-11-08 晚，用户拍板，未部署）

**用户截图实证（392×300 / 10 区 / 总管未绘）**：紫线标「最远 2 区 · 233.1 m」——
探针 `_probe_worstpath.mjs` 复现实锤：段总管 build 合并共线分支把两排布局的 10 条主管
塌缩成 2 组（joinPts 只剩 2 个、len=150 竖线），segWorstPath 按 joinPts[zi] 同序取数 ⇒
8 个区被静默跳过、run 全是假距离。**P0**。

**用户方案（拍板采纳）**：在线地图轮灌演示动画对每个分区分别计算了正确的水路路径
（buildFlowRoutes 真实管道图：手绘总管+段总管反投线+主管链+支管，Dijkstra 逐区寻路），
用这份数据算水泵扬程、标最远水路。

**实施（v1019，主串同抬 14 处）**：
1. map-flow-demo.js：buildFlowRoutes 参数化（allZones 全量寻路）；无手绘总管时段总管
   反投线（segLL）也可作干线参与寻路（原 early-return 拒绝）；导出 routesAll（全分区
   逐区寻路 + missing 覆盖率守卫）与 buildRoutes（纯函数，单测/探针直测）。
2. inline-09.js 新增 tlRoutesWorstPath：front=干线段真实长、main=沿主管链真实长
   （**链式主管过境段计入**——旧模型只算本区那条，下游区被系统性低估）、branch 沿用
   v601 满跨口径；wp.zones 同构喂 RyPipePathLoss（管损链/管损卡不回退）；
   标注几何按「切片经纬点→投影回原始折线（段号 i,比例 t)→图面米坐标同点」逐顶点重建，
   手绘总管部分沿 v879 口径计入长度不画。
3. segWorstPath 降级为兜底引擎，加两道守卫：接点必须落在本区主管上（≤1 m）、
   有主管拿不到接点（skipped>0）⇒ 整体 EMPTY（宁缺不错）。
4. tlWorstPathLen 链：legacy(frontPipe) → **routes（主）** → segWorstPath（兜底）→ EMPTY。
5. tlWorstPathMarkSVG 空段守卫（routes 引擎 frontPts 可为空——手绘总管无图面对应物）。

**验证**：探针 `_probe_routes_wp.mjs` 三步——①无地图 ctx：routesAll=null ⇒ 诚实 EMPTY
（假路径不再可能）；②合成经纬数据（两排十区，引擎直测+stub 接线）：10 区全覆盖、
最远 10 区（front=150/main=251.5/branch=39.2）、geom 重建成功（frontPts=立管 4 点、
mainPts=过境链 22 点）；③重新生成后图面标注「最远 10 区 · 401.5 m」在位、
computeThreeLevel 三长全部消费 routes 引擎。回归 721/721（worst_path_seg 新增 ⑦⑧ 两锁）。

**口径差异待办（用户指示：记入待办，回头统一处理）**
—— **v1020-caliber-cleanup（2026-11-08 深夜，用户「这五件事能处理吗，都处理掉吧」）五条全清，主串同抬 14 处**：

- [x] ① **已清（v1020）**：tlRoutesWorstPath 求长改**图面米**——主管（main:zi）/段总管
      （segment:0）切片经「反投（__runyeGeoBase/__runyeMapFrameInv）→原始折线（段号 i,比例 t）→
      图面米坐标同点」重建后求和（linePairOf 按 key 缓存反投，重建丢点/反投基建不可用 ⇒
      诚实回退地图口径 llLen）；手绘总管（trunk:i）只存在于地图画布，保持地图折算米。
      材料清单与扬程链自此同口径。
- [x] ② **已清（v1020）**：map-flow-demo collect 的 mainsLL/branchLL 改走
      `RyTlAutoEdits.effPts(pid, dd)` 有效几何再投影（手动改长/平移进入轮灌演示与最远水路）；
      顺带修正 v1019 在 tlRoutesWorstPath branchLens 处 `effPts(pid, 折线)` 的误传参
      （第二参应是整个 tlDiagramData，此前静默失效、改长从未生效）——⑨ 用例锁定。
- [x] ③ **已清（v1020）**：链式主管过境段组合流量三段式落地——map-flow-demo 路由切片补
      `(a,b)` 弧长身份（同一物理 edge 各区路径共享）；tlRoutesWorstPath 产出
      `zones[].mainSegs = [{key, len, downZi}]`（downZi=路径同样经过该切片的分区号集，
      树形拓扑下该段流量=这些分区流量和）；computeThreeLevel 把 downZi 换算逐段 flow 喂
      RyPipePathLoss，calculate 支持 mainSegs 逐段 hazen（无 mainSegs 逐位兼容旧口径，
      row.main 回填段长合计、mainSegFlowMax 记逐段流量峰值）。⑩ 用例 + pipe_path_loss 用例锁定。
- [x] ④ **已决议（v1020，关闭）**：**方案乙（梳形/Γ形干线模型升级）由 v1019 routes 引擎
      取代**——routes 引擎对任意布局拓扑正确，无需再升级干线模型；segTrunk 塌缩几何数据
      仍保留（快照/地图反投不变），且 tlFrontLenUse 的 segLen 兜底加**同款塌缩守卫**
      （tlSegTrunkUsable：joinPts 覆盖每根主管且落线上 ≤1 m，否则 segLen=0）——
      两台引擎都 EMPTY 时段总管全长不再从扬程后门溜回（v1019 只收口了 run，漏了 segLen）。
      ⑪ 用例锁定。
- [x] ⑤ **已清（v1020）**：routes+seg 都不可用（wp.fromFigure=false）但管线图已生成
      （tlDiagramHasPipes：dd.mainPipes 非空）时，扬程拆解卡来源行与管损卡 ziTxt 明示
      **「自动水路不可用，请在在线地图绘制总管后重算」**（琥珀色强调）；未生成管线图仍
      显示原「试算输入值；生成管线图后改用图面实际几何」，不添噪。

**v1020 验证**：worst_path_seg 11/11（新增 ⑨ AE 改长进 routes 长度、⑩ 过境段 downZi、
⑪ segLen 塌缩守卫三锁；⑥ 因 extract 清单补 tlSegTrunkUsable 后恢复）；pipe_path_loss
mainSegs 三断言；`_probe_routes_wp.mjs` 复跑无回归（最远 10 区 · 401.0 m、fromRoutes、
geom 重建正常）；npm test 全量 **724/724**。未部署。
