# 润野灌溉 · 水力拓扑只读审计报告

日期：2026-10-16 15:30 · 版本基线：sw.js `v489-legend-right`（工作树未提交状态）
范围：`runye-hydraulics-core.js`、`runye_network_layout` 的生产者/消费者及相关测试。
约束：只读；未改代码、未运行测试、未动归档；`feature-archive/三维与轴测图` 仅用于数据契约对比。

---

## 0. 数据流总览（实测调用链）

```
[生产者 P1] mod/inline-09.js:3906-3995（tlAutoGenerate 尾部「管网反投」）
    tlDiagramData(米制) --__runyeGeoBase + __runyeMapFramePoly 仿射逆变换--> 经纬度
    ├─ writeNetworkLayout({sourcePos, segments[{id,name,dn,kind,latLng}], plotId, crs:'GCJ-02', ts})   :3966
    ├─ 二次读改写：补 net.valves / net.dripTapes（不整写 key）                                          :3968-3988
    └─ writeHydraulicDesign({version:1, geometry, hydraulics})  → 'runye_hydraulic_design_v1'          :3831
[生产者 P2] mod/online-map.js:1408-1444（工程文件导入：校验 + 回滚式恢复，非运行时生产者）
[消费者 C1] runye-hydraulics-page.js:123  → Core.compute(net,opts) / Core.computeDesign(design,opts)
[消费者 C2] runye-map-enhance.js:866-976  renderNetwork：segments/valves/dripTapes 只读渲染
            + readHydraulicOverlay('runye_hydraulic_overlay_v1') :26-31（networkTs !== net.ts 即拒用）
[消费者 C3] runye-nav.js:50-52（导航项声明，无数据消费）
[覆盖层桥] runye-hydraulics-page.js:134-136 → Core.mapOverlay(full,net) → MAP_OVERLAY_KEY → C2
[插件适配] plugins/hydraulics/main.js:299-319（hazen/christiansenF/compute 透传）
```

键名集中于 `core/irrigation-data-store.js`（`runye_network_layout` / `runye_hydraulic_design_v1`），读写全部经 `RyIrrigationDataStore`，无裸 key 写入（map-enhance 对 overlay key 例外，见 §3.4）。

---

## 1. 逐项核查

### 1.1 坐标端点聚类 — `runye-hydraulics-core.js`

| 机制 | 位置 | 证据与判断 |
|---|---|---|
| 经纬度→局部平面 | :86-90 `toPlane` 等距圆柱，原点=包围盒中心 :217 | 场地尺度（<2km）误差可忽略；原点取中心保证 cos(lat) 稳定 |
| **仅聚段端点** | :226-244 `ends` 只取 `latLng[0]` 与 `latLng[last]`，O(n²) 最近锚点合并，容差 `snapTol=3m`（:67） | 折线**内部顶点**不参与聚类，只经 T 形分裂（见下）间接成为连接点。X 形交叉（两段都从对方中间穿过、端点都不靠近）**不会连通**——当前无任何处理与告警 |
| 聚类顺序依赖 | :234-244 首到点为锚，链式传递（A-B 2m、B-C 2.5m、A-C 4m 全并一节点） | 传递合并对几百段规模可接受，但**同一输入不同段序可能产生不同节点集**（影响节点编号、EPANET 坐标表），树形结构不变 |
| T 形搭接分裂 | :121-191 `splitAtTaps`：端点距他段折线<tol 且距他段**两端点均>tol**（真 T 判据 :131-136）→ 在垂足插入坐标切片 | 「真 T」判据防点对点接头被误分裂出零长段/假环（:132 注释为 2026-10-08 冒烟教训）；同区间多三通按投影点 1e-5 判重（:152-155）；每端点只挂最近一段（:157 `break`）——端点同时贴近两条段时另一条失去连接 |
| 分裂后 ID | :181-187 `id/name` 加 `_a.._x` 后缀，`sourceId` 保留原始 id | 分裂只发生在计算树内，**localStorage 契约段 id 不被改写**（core 对 layout 只读，:11-12） |

### 1.2 水源根节点 — :247-260

- 有 `sourcePos`：取**最近节点**为根，距最近端点 >50m 仅告警（:256）。
- **风险**：不校验最近节点是否在 `kind='front'` 段上。若水源点离某支管端点更近，树将从支管中段起算，主管/总管反向成为"下游"，流量递推与最不利路径系统性失真且**无告警**。
- 无 `sourcePos`：根=`endNode[0]`（第一条有效段首端点，:258-259）并告警——行为已定义但纯属猜测，仅供展示口径。

### 1.3 BFS 建树 — :262-294

- 邻接表按节点聚合（:263-267），`queue.shift()` 逐层定向；`link.end ^ 1` 翻转端点（:279）。
- 两端均可达 → 记环并 `seenSeg` 标记防重复报（:281-284）；结束仍未入树 → orphans（:295-297，环段因 seenSeg 不重复计入）。
- `order` 为上游→下游 BFS 序，供 `assignFlows` 逆序叶→根递推（:354-366，方向写反会让上游拿 0 流量——:356 注释为实测教训）。
- **并行段（同节点对两条段）**：第二条两端均可达 → 判为 loop，正确。
- **复合节点度数无上限**：三通/十字（分裂后）自然形成多子段，树语义成立。

### 1.4 环与孤立段 — :281-301, :384-385, :399-408

- 环段与孤立段**不入水损、不入递推、不入 EPANET inp**（:531-533 `e.up<0` 跳过），仅在 `segRows.status`（`loop`/`disconnected`）与 warnings 呈现。
- 设计决策（:384-385 注释）：反投常把同一施工线拆成显示段，局部未连通**不封死**整页校核，仅系统总流量为零才阻断（:467）。合理性成立，但"部分管网被静默降级"依赖用户注意到 warnings——UI 侧 `warnBox`（page.js:141）是唯一出口。

### 1.5 多连接与滴灌带挂接 — :305-335

- 每条带两端点对全部 branch 段求全局最近 (tape,branch,end)，≤`tapeSnapTol`(8m) 才挂接；等距时**先到先得**（段序依赖）。
- 挂接目标限定 `kind='branch'`（:311）：地图手绘/导入网络若无 branch 段，全部带不挂接 → blockers（:381-383）阻断校核。行为一致但对手绘场景偏严格。
- 带流量 `N=floor(len/spacing)`×`qDrip`（:325-327），`[v320]` 已修 ÷1000（m³/h，:327 注释）——与 hc.hazen/velocity/泵 2.725e-3 全链路同单位（:367 注释）。

### 1.6 管段 ID 与管径映射 — 生产者 :3956-3963

- `id = prefix+index`（front0 / main0.. / branch0..），`name = prefix+(i+1)`；`dnOf` 用正则 `(\d+)` 从 `meta.pipes` **文本**抽第一段数字（:3956）。
- **映射是"每类一个代表径"**：`segDn={front,main,branch}` 三值，同 kind 全部段共用一个 dn（:3958-3963）。而三级图面支持**逐段改径**（`RyTlAutoEdits.setCaliber('main-3',...)`）——反投不携带逐段实径。叠加 `meta.pipes` 是设计径文本（inline-09.js:3820 附近注释「meta.pipes 保持设计径文本不动」），**用户改径后 layout dn 不会更新** → 水力校核（layout 模式）按旧径计算且无告警。
- 兜底：main 缺失→90、branch→63、front→main（:3958,3961）。front 兜底借用 main 径无告警。
- 设计模式（computeDesign :663-717）管径取 `hydraulics.*.od`（:3831 写入的也是设计径 `r.frontPipe.od`，`tlAppliedPipeOverride` 的逐段 usedCals **未写入**）→ 同样丢失逐段改径。
- ID 消费端对齐：`mapOverlay` 按 `sourceId||name` 合并分裂段（:631-649），map-enhance 用 `hydraulic.items[s.id]` 取记录（runye-map-enhance.js:880），s.id=原始生产者 id → **键链路一致**。

---

## 2. 与归档 network-model.js 的契约对比（仅对比，不假设复用）

| 维度 | 归档 iso-diagram/network-model.js（feature-archive） | 现行 runye_network_layout 契约 |
|---|---|---|
| 坐标空间 | 米制平面（`data.frontPipe/mainPipes/branchPipes/valves/poly`，version:1，单位米；iso-diagram.js:16,275,1514） | 经纬度 GCJ-02（segments[].latLng），CRS 显式标注 |
| 拓扑表达 | 配件/端口图（Port/Fitting/Connection，SNAP_TOL=0.2m，network-model.js:24-26,93-96） | 无节点表，纯段列表 + 端点聚类重建 |
| 管径 | 逐配件 caliber | 每 kind 一个 dn |
| 容差 | 0.2m 工程吸附 / 2.0m 投影归属 | 3m 端点聚类 / 8m 带挂接 |

结论：两者几何空间、粒度、容差三个维度都不同。归档实现**不能直接复用**；其价值是两个可借鉴的判据：①0.2m vs 3m 的容差经验（3m 对经纬度反投误差是合理的，但需有测试钉住）；②「节点中心距 vs 折线实长」的长度口径选择——现行实现用折线实长（polylineLen :91-102，Haversine），比归档第一版的中心距更准。

---

## 3. 发现的问题（按严重度）

| # | 问题 | 位置 | 影响 |
|---|---|---|---|
| **H1** | 插件适配器签名错位：`W.RyHydCore.compute(opts||{})` 把参数对象当 **net** 传（compute(net,opts)），`net.segments=undefined` → 恒返回「管网无有效管段」空树；另 `christiansenF(n,x)` 第二参 x 在核心中不存在（christiansenF(N) 单参 :720-723） | plugins/hydraulics/main.js:310-318 | 插件侧全链路校核透传实际不可用；smoke 只测了 hazen/christiansen 数值（_smoke_plugins.cjs:168）未测 compute 透传，属漏网 |
| **H2** | 逐段改径丢失：layout dn 与 design od 都是"每类代表设计径"，图面改径（setCaliber/改径重算）不进任何水力数据通道 | inline-09.js:3958-3963, :3831-3847 | 校核结果可能按错误管径计算，超流速/水损失真且无告警 |
| M1 | 根节点不校验 kind：sourcePos 最近节点可能在支管上，树反向 | hyd-core :247-260 | 拓扑方向性失真，无告警 |
| M2 | mapOverlay 合并顺序依赖：先低优先级后高优先级时 flow 被整体替换（`priority[r.status]>=priority[old.status]` 即覆盖 :638-646），混合状态分裂段的 flow/loss 汇总取决于段序 | hyd-core :631-649 | 仅影响地图叠加弹窗数值显示，不影响计算 |
| M3 | X 形交叉不连通且无告警（两端点聚类 + 单向 T 分裂均覆盖不到） | hyd-core :121-244 | 手绘/导入管网可能静默丢下游 |
| L1 | `dnOf` 依赖 meta.pipes 文本格式（`(\d+)` 取首数） | inline-09.js:3956 | 文案格式一变 dn 即错，属脆弱字符串契约 |
| L2 | 聚类顺序依赖 → EPANET 节点编号不稳定（对 diff 类测试不友好） | hyd-core :234-244 | 仅测试/导出稳定性问题 |
| L3 | 等距滴灌带挂接先到先得（段序依赖） | hyd-core :317-323 | 边界场景需求归属差一档 |

---

## 4. 架构判断

**判断：保留独立实现；不抽共享转换层；修（或删）插件适配器。**

1. **保留独立实现**：`buildTree/splitAtTaps/attachTapes/assignFlows` 是 `runye_network_layout` 契约在运行时的**唯一**拓扑重建实现，纯函数、零 DOM、永不抛异常（:194）、关键坑位都有实测教训注释锚（:132,:153,:356,:367）。单消费者前提下重抽象无收益、只有回归风险。
2. **不抽共享转换层**：现存的第二条水力路径（P1 的 writeHydraulicDesign → `computeDesign`）**有意绕过拓扑**（:661-663 注释「不从地图/滴灌带几何反推」）——它消费的是规划期已算定的流量，不是可重建的几何拓扑。两条路径只有公式层共享（hc-core/design-core，已经共享）。归档 network-model 的配件图模型与两者均不同构。**触发条件**：将来出现第三个需要「layout → 拓扑」的消费者（如管网优化插件要真实树），再把 `splitAtTaps+buildTree+attachTapes` 抽为 `RyNetTopo.fromNetworkLayout(net,opts)`——三者已是纯函数，抽取边界干净，届时做即可。
3. **适配器**：plugins/hydraulics/main.js 的 compute 透传（H1）是唯一跨契约适配点，当前是坏的。建议修复为双参透传并在 smoke 补断言；若插件并无真实调用方，删掉透传只留 hazen/christiansenF 数值桥更诚实。

---

## 5. 行为等价所需测试清单（列出，未运行）

核心修复/保留决策的每一条证据都应能被以下测试钉住（全部可用 Node 直 require `runye-hydraulics-core.js`，无需 DOM）：

- **T1 端点聚类**：① 端点距 2.9m 合并 / 3.1m 不合并（snapTol 边界）；② 链式传递（A-B 2m、B-C 2.5m、A-C 4m → 单节点）且 **3 种段序输入产生同构树**（锁定 L2 的可接受范围）；③ 内部顶点不聚类的现状固化（防误改）。
- **T2 T 形分裂**：① 支管端点落主管中间（垂足<3m、距主管两端>3m）→ 分裂 `_a/_b`、`sourceId` 不变、下游段拿到支管需求；② 同一主管两个三通 → 三段（:152 判重）；③ 点对点接头不分裂（零长段防护）；④ 同点 1e-5 内重复投影只切一次。
- **T3 水源根**：① 最近节点胜出；② >50m 告警文案在 warnings；③ 无 sourcePos → 根=endNode[0] + 告警；④（修 H2/M1 前先固化现状）root 落在非 front 段的当前行为。
- **T4 环**：① 并行段第二条报 loop 且不入 segRows 水损；② 三角环恰报 1 条；③ 环段不出现在 toInp [PIPES]。
- **T5 孤立段**：不接水源的链全部 orphan、有 warning、其余分区照常出结果（:384 设计决策）、qTotal=0 时 blockers。
- **T6 流量递推与单位**：单链 3 段各挂已知 N 滴头的带 → 手算 Q 对照（锁 [v320] ÷1000 口径）；branchTailQ 只累加一次（:353）。
- **T7 ID↔dn 映射**：① `meta.pipes.front='Ø 225 mm'` → dn 225；② 缺失兜底 90/63/front→main；③ 分裂段 mapOverlay 合并回原 id（flow 累加、velocity 取 max）；④ map-enhance `items[s.id]` join 键一致（可用假 net+overlay 走 readHydraulicOverlay 断言）。
- **T8 overlay 时效**：`networkTs !== net.ts` → readHydraulicOverlay 返回 null（runye-map-enhance.js:26-31）。
- **T9 computeDesign**：① branch 需水合计与 combinedFlow 差 >2% 时告警（:706-709）；② maxRole 拼路径不含断链（path 元素连续性断言）；③ toInpDesign 需水节点=branch 远端、root=front 起端。
- **T10 契约入口**：① online-map 工程导入对 segments 缺坐标/crs 非法拒绝并回滚（online-map.js:1420-1441）；② verify_ry_tool.js:235 的 `'net.valves = valvesLL'` 契约锚仍在。
- **T11 插件适配器（修 H1 后）**：`api.compute(net,opts)` 透传后返回 `valid:true` 的最小 fixture；christiansenF 单参调用数值与 RyDesignCore.christiansen 一致。

---

## 6. 审计范围声明

本报告只覆盖 `runye-hydraulics-core.js`、`runye_network_layout` 生产/消费链与相关测试现状；未审计 hc-core/design-core 公式正确性（仅核对了单位口径一致性）、EPANET WASM 求解链（hydraulics-wasm.js）、水力计算器页（hydraulic-calc.html）与地图绘制侧管网编辑。未修改任何代码；探针/验证脚本未新建；归档文件未读取移动。
