# ryPlot 数据契约（现状基线 v1）

本文记录主链路当前真实载体与跨页引用方式，不迁移旧存档、不把水力或 BOM 结果复制进上游地块。

## 地块库条目

本机同源页面共享 `localStorage['runye_plot_library']` 数组。现有条目字段以兼容为主：

| 字段 | 类型 | 含义 |
|---|---|---|
| `id` | string | 地块稳定标识；跨页引用主键，历史库可能有重复值 |
| `name` | string | 用户可读名称 |
| `polyLatLng` | `[lat, lng][]` | GCJ-02 经纬度边界；地图回传的权威几何 |
| `poly` | `{x,y}[]` | 局部米坐标，供设计画布使用 |
| `sqm` / `mu` | number | 实测面积（平方米）/亩；亩换算口径为 666.67 m² |
| `ts` | number | 现有保存时间戳（毫秒）；新接口的 `savedAt` 兼容读取此字段 |
| `geo` / `crs` | object/string | 局部投影原点及坐标基准 |
| `merged` / `subPlots` / `polyLatLngSet` | optional | 成组地块及成员环；成员之间的间隙必须保留 |
| `partitionPlan` / `partitions` | optional | 地图侧分区角度方案及其分区结果 |

旧条目可能残留 `crop`、`plantingDate`、`basal`、`locationName` 等历史种植字段；润野灌溉不读取这些字段，不再新增或更新这些字段，也不自动清理浏览器存量数据。数字农业页面不得读取本地地块库。若未来恢复数字农业工作台，唯一允许的跨模块边界是灌溉向工作台显式单向传递地块快照，不共享此键。

记录可能来自地图手绘、文件导入、二级页回传或旧版本存档，字段不齐时按对应层未就绪处理。读取器优先使用 `polyLatLng`、`sqm`、`ts`；兼容别名为 `geojson`、`areaM2`、`savedAt`。不得仅因缺少新字段而拒绝旧记录。

## 跨页引用

地图页向二级页写入 `localStorage['runyeMeasuredArea']` 时只写引用，不复制几何：

```json
{
  "ryPlotRef": {
    "id": "地块库条目 id",
    "savedAt": 0,
    "areaM2": 0,
    "geometryKey": "地图点击地块的规范化边界指纹"
  }
}
```

地图弹窗和“我的地块”箭头共用发送链路，携带边界指纹；同页切换时立即消费引用，独立页则在加载后消费。地块绘制页“设为当前”直接读取同一地块库，不经过一次性引用。三条链路最终都进入地块分区页并保存当前工程；地图回传只改变当前工程，不把旋转后的画布几何覆盖回地块库原始边界。发送端与二级页按 `id + geometryKey` 定位；由于工程恢复锚点仍使用 `id`，重复编号必须明确拒绝。旧版引用仍按 `id` 与 `savedAt` 兼容解析；目标不存在或边界无效时必须报错并保留引用，不能静默选用其他地块。

## tlDiagramData 分层

`tlDiagramData.schemaVersion` 缺省按 `1` 读取；当前写入同时保留历史 `version: 1`。字段分层如下：

| 层 | 当前字段 | 产出/写入者 | 下游规则 |
|---|---|---|---|
| L1 geometry | `plot`、`poly` | 地块分区 | 下游只读；缺失表示尚未生成画布几何 |
| L2 zones | `zones`、`partialFlags`、`zoneActMu` | 地块分区 | 下游只读；保留阶梯覆盖与分区边界 |
| L3 pipes | `mainPipes`、`branchPipes`、`valves`、`dripTapes`、`frontPipe`、`sourcePos` | 管路规划 | 作为管网规划完成的基线；缺字段按未生成处理 |
| L4 flow | `meta.flowModel`、`meta.pump`、`segments`、`economy` | 水力计算 | 仅保存模型/泵快照；逐段核算由水力插件按需计算，缺失为 `null` |

L4 `flow` 层的上下文形状：

```js
flow: {
  model: {                       // 与 computeThreeLevel / meta.flowModel 一致
    zoneFlow, branchFlow,        // 单区流量 / 单支管流量（m³/h）
    combinedFlow,                // 总管联合流量（m³/h）= zoneFlow × zoneCount
    zoneCount, branchCount
  },
  pump: { flow, head, power },   // 泵选型文本快照，来源 meta.pump
  compliance: {                 // 可选：hydraulic-calc/compliance-check.js 产出的逐项判定快照
    standard, checks, summary, checkedAt
  },
  segments: [                    // 仅定义结构；当前返回 null，由水力插件按需回挂
    {
      pid,                       // front | front-N | main-N | branch-N
      type,                      // front | main | branch
      len,                       // 管段长度 m（pipeLenM 口径）
      od,                        // 管段外径 mm（图面改径后值）
      flow,                      // front→combinedFlow；main→zoneFlow；branch→branchFlow
      v,                         // 流速 m/s，SDR13.6 内径
      hf,                        // 沿程损失 m，Hazen-Williams
      c                          // 海森系数，默认 150
    }
  ],
  economy: { vmin: 0.8, vmax: 2.0 } // 经济流速区间（hc-core 口径）
}
```

`compliance` 仅在收到明确的设计参数或现场实测值后产生；缺失数据的判据为“未评估”，不得写成合格。当前 `getPlotContext()` 只读透传 `tlDiagramData.meta.compliance`，由 `mutateLayer('flow', {compliance})` 挂接；本接口不代替保存流程。

流量沿用现有 `meta.flowModel`，不另算；损失公式沿用 `hydraulic-calc/hc-core.js`：`hf = 1.113e9·L·Q^1.852/(C^1.852·D^4.87)`，其中 `Q` 为 m³/h、`D` 为 SDR13.6 管内径 mm。`getPlotContext()` 不计算 `segments`，缺失的 flow 子字段保持 `null`；`mutateLayer('flow', …)` 仅挂接模型/泵数据，不落盘逐段结果。
| L5 bom | `core/data-service.js` 的 `readBom()` 输出 | BOM 模块 | 只读消费，不写回 `tlDiagramData` |

旧快照不做强制迁移：缺少 `schemaVersion` 视为 v1；新版本仍保留旧字段名和 `version`，让既有恢复、导出和插件读取路径继续工作。遇到未知的更高版本时应只读显示可识别字段，不覆盖原快照。

## 单一写入边界

- 地块几何由地块库及其 ID 引用承载；不得在跨页消息里再复制一份边界。
- L1-L3 仍由地图/分区/管路主链路负责；下游不得改写这些上游层。水力结果只可通过 `mutateLayer('flow', …)` 挂载到 L4（本轮不计算逐段损失）；BOM 只读消费，不写回 `tlDiagramData`。
- 本文是 v1 兼容基线。把现有多个 localStorage 载体收敛成统一 `ryPlot` 写入 API，需要另做迁移与回滚设计，不在本轮隐式完成。
