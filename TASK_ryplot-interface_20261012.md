# TASK_ryplot-interface_20261012 —— ryPlot 数据接口 + L4 细化

> 执行者：Agent D（data-service 契约实现）
> 依赖契约：`RYPLOT_SCHEMA.md`（第 4 节接口签名、第 2 节 L4 层、第 3 节版本规则）
> 分工依据：`地块主链路架构规划.md`（分工表：D 负责 data-service / L5；本任务 D 牵头，L4 字段需与 C 核对口径）
> 执行顺序：**先本任务（接口）→ 验收通过后 → 再派回传协议改造任务**（用户已拍板）

---

## 0. 一句话目标

在 `core/data-service.js` 上**追加**三个 ryPlot 数据接口（不动现有 17 个接口），并把 RYPLOT_SCHEMA 的 **L4 flow 层字段细化**落地到契约文档。本任务不改造任何页面回传逻辑。

## 1. 改什么（精确到文件）

| 文件 | 动作 |
|---|---|
| `core/data-service.js` | 追加 `getPlotContext()` / `mutateLayer(layer, patch)` / `resolvePlotRef(plotId)` 三个接口，加入 return 对象 |
| `RYPLOT_SCHEMA.md` | 第 2 节 L4 `flow` 层字段表**替换为细化版**（见 §3）；第 4 节接口签名保持已定稿版不动 |

**禁止改动**：`runye-map-measure.html`（回传协议是下一步任务）、`mod/inline-*.js`、`hydraulic-calc/`、`plugins.json`、`sw.js`、`index.html`。

## 2. 接口实现要求

### 2.1 `getPlotContext()`
- 返回：`{ schemaVersion, id, name, source, geometry, zones, pipes, flow, bom, capturedAt, migratedFrom }`
- 组装规则（**只组装、不落库**，零侵入）：
  - `pipes/zones` ← `window.tlDiagramData`（缺则为 null，**不补默认值**）
  - `geometry` ← 现有全局：`window.measuredArea`、`window.measuredPolygon`、`window.__runyeMapFramePoly`、`window.__runyeGeoBase`、`window.__runyeSubPlots`、`window.__runyeGroupName`（各自缺则对应字段 null）
  - `flow` ← 先取 `tlDiagramData.meta.flowModel` + `meta.pump` 组装 `model/pump` 两层；`segments` 本任务**先置 null**（§3 注：逐段由水力插件后续懒计算回挂，接口必须容忍 null）
  - `bom` ← 复用现有 `readBom()` 结果
  - `source` ← 调 `resolvePlotRef()` 从 `runye_plot_library` 找当前地块（取 `window.currentPlotId` 或 `__runyePlotRef`，找不到返回 null）
  - `id/name` ← source 存在时取 source.id/name，否则 null
- `schemaVersion` = 1；若组装时发现旧存档缺字段，标记 `migratedFrom` 逻辑留空（版本规则见 §3.2，本任务只建框架不写迁移函数）

### 2.2 `mutateLayer(layer, patch)`
- `layer ∈ 'source'|'geometry'|'zones'|'pipes'|'flow'|'bom'`，其余值返回 `{ ok:false, error:'unknown-layer' }`
- 校验：对照 RYPLOT_SCHEMA 第 2 节各层**必填字段**（L0 source 的 id/sqm/polyLatLng 必填；L3 pipes 的 mainPipes/branchPipes 必填；其余层按当前是否已有数据判定）；必填缺失 → `{ ok:false, error:'missing-field:'+field }`，**拒绝写半成品**
- 写路径（按层映射现有通道，**不新建存储键**）：
  - `source` → 写 `runye_plot_library`（按 id upsert）
  - `geometry` → 写 `window.measuredArea/measuredPolygon/__runyeMapFramePoly/__runyeGeoBase/__runyeSubPlots/__runyeGroupName`
  - `zones/pipes` → 写 `window.tlDiagramData.zones` / 主体（不触发重算，只挂数据）
  - `flow` → 写 `window.tlDiagramData.meta.flowModel/pump`（segments 暂不落）
  - `bom` → 本任务仅接收并返回 ok（BOM 已是计算产物，落库走档案系统，不在此写）
- 成功后：`return { ok:true, schemaVersion:1 }`，并 `try{ window.dispatchEvent(new CustomEvent('ryPlotChanged',{detail:{layer}})); }catch(e){}`（event-bus 已有，UI 可订阅）
- 全程 try/catch，异常返回 `{ ok:false, error:String(e) }`

### 2.3 `resolvePlotRef(plotId)`
- 读 `localStorage['runye_plot_library']`（数组），按 `id === plotId` 返回该条记录（**深拷贝**）；找不到返回 null
- 记录格式按现地块库：`{ id, name, mu, sqm, poly, polyLatLng, center, geo, crs, crop, source, ts, note, merged?, subPlots?, partitionPlan? }`（runye-map-measure.html 1319-1345 口径）

## 3. L4 flow 层细化字段（写入 RYPLOT_SCHEMA.md 第 2 节）

```js
flow: {
  model: {                       // 流量模型（口径与 computeThreeLevel/flowModel 一致）
    zoneFlow, branchFlow,        // 单区流量 / 单支管流量（m³/h）
    combinedFlow,                // 总管联合流量（m³/h）= zoneFlow × zoneCount
    zoneCount, branchCount
  },
  pump: { flow, head, power },   // 泵选型（文本快照，来自结果条）
  segments: [                    // 逐管段核算（★ 本任务只定义 schema，值由水力插件懒计算回挂）
    {
      pid,                       // 段标识：'front' | 'front-N' | 'main-N' | 'branch-N'（沿用图面 pid）
      type,                      // 'front'|'main'|'branch'
      len,                       // 段长 m（图面有效几何，pipeLenM 口径）
      od,                        // 段外径 mm（图面改径后值）
      flow,                      // 段流量（front→combinedFlow，main→zoneFlow，branch→branchFlow）
      v,                         // 流速 m/s = Q / (π/4 · d²)（d 为 SDR13.6 内径）
      hf,                        // 沿程损失 m（Hazen-Williams，C=150）
      c                          // C 值（默认 150，可标定）
    }
  ],
  economy: { vmin: 0.8, vmax: 2.0 }   // 经济流速区间（与 hc-core 一致）
}
```
注：
- 流量口径三处同源：front→`combinedFlow`、main→`zoneFlow`、branch→`branchFlow`（inline-27.js:62）
- 损失公式唯一：`hf = 1.113e9·L·Q^1.852/(C^1.852·D^4.87)`，C=150、SDR13.6 内径（hc-core.js:8-11）
- **本任务不实现 segments 计算**，`getPlotContext()` 返回 `flow.segments = null`；水力侧（Agent C）后续打开时算并 `mutateLayer('flow', …)` 回挂

## 4. 验收标准（全绿才算完成）

1. **接口自测**：写一个临时脚本（`_diag_ryplot.cjs` 或浏览器 console 段）验证：
   - 有 `tlDiagramData` 时 `getPlotContext()` 返回 L0-L3 全量、L4 model/pump 就位、segments=null、L5 bom 就位
   - 无数据时各层为 null（**不得**抛错、不得自动补 0）
   - `mutateLayer('zones', {cols:2,rows:2})`（最小合法 patch）→ ok:true 且 `tlDiagramData.zones` 已挂
   - `mutateLayer('bogus', …)` → `{ok:false, error:'unknown-layer'}`
   - `mutateLayer('source', {id:'x'})`（缺必填）→ `{ok:false, error:'missing-field:…'}`
   - `resolvePlotRef('p…')` 命中返回深拷贝、改返回值不影响地块库原记录
2. **闸门**：`_gate_plugins.cjs` + `_smoke_plugins.cjs` + `verify_nav_compact.js` 全绿
3. **契约一致**：RYPLOT_SCHEMA.md 第 2 节 L4 已替换为细化版；其余章节未动
4. `git diff --stat` 只含 `core/data-service.js` + `RYPLOT_SCHEMA.md` + 自测脚本

## 5. 红线（违反即失败）

- 不改 `runye-map-measure.html` 回传逻辑（下个任务做）
- 不改任何水力计算口径、不写第二套公式
- 不新增全局变量（`window.ryPlot` 本任务**不落**，只做组装返回）
- 不新建 localStorage 键（复用 `runye_plot_library` / `runyeMeasuredArea` / 存档键）
- 不 commit / 不 push / 不发布（沿用 AGENT_HANDOFF 纪律）
- 自测脚本用完即删或放入 `_verify_out/` 之外的一次性位置，不留垃圾

## 6. 完成动作

1. 改完跑 §4 全部验收
2. 汇报：接口签名确认 + 验收结果 + `git diff --stat`
3. **不要**动回传协议——等用户派「回传 ID 协议改造」任务（将含 runye-map-measure.html btnCopy / inline-16.js applyMapMeasuredArea 两处改造）
