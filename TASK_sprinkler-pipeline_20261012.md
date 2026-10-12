# TASK_sprinkler-pipeline_20261012 —— 喷灌项目全链路改造（terrain 深挖 + sprinkler 插件桥）

> 执行者：Agent S（喷灌专项）
> 依据方案：用户拍板「功能在页面（terrain 页面级外挂）、桥在插件（plugins/sprinkler 模块级壳，照抄 plugins/hydraulics 样板）」
> 目标项目：50-60 亩/小区、200-250 亩/大区的喷灌工程（12×12m 喷头网格 + 160/110/50 三级 PE 管网 + 25mm×3m 镀锌立管 + 高位蓄水池 + 二次加压 + 板框过滤）
> 依赖规范：`PLUGIN_DEV.md`（插件六条硬约束 + 壳迁移样板 §9/§10）、`hydraulic-calc/` 口径（不得另写第二套公式）
> 执行顺序：**P0（本任务）→ P1 → P2**，全部限定在 terrain/ 目录 + 新建 plugins/sprinkler/，**主应用其他页面零改动**

---

## 0. 一句话目标

让软件能对这个喷灌项目出「规划图 + 喷灌 BOM（施工预算级）」：terrain 喷灌模块从"估算"升级为"可出图可出清单"，并通过一个 sprinkler 壳插件把结果桥接进主应用 BOM/水力消费链路。**不改任何主应用页面，不改滴灌/微灌任何逻辑。**

## 1. 改什么（精确到文件）

| 文件 | 动作 | 优先级 |
|---|---|---|
| `terrain/terrain-core.js` | ① sprinklerEstimate/sprinklerLayout 支持**直接填间距**（12×12）；② 新增喷灌 BOM 统计函数；③ 新增蓄水池容积估算；④ 新增二次加压模型；⑤ 新增沟槽土方量 | P0+P1+P2 |
| `terrain/index.html` | 喷灌参数区（行 142-183）追加：直接填间距、立管规格、蓄水池、二次加压、板框过滤、沟槽深度输入 | P0+P1+P2 |
| `terrain/terrain-ui.js` | 「估算」按钮结果落 `localStorage['runyeSprinklerResult']`（数据桥）；喷灌 BOM 展示区 | P0 |
| `plugins/sprinkler/manifest.json` | 新插件（壳，照抄 plugins/hydraulics 结构） | P0 |
| `plugins/sprinkler/main.js` | 注入 terrain-core 内核 → 暴露 API → 读桥数据 → 主应用 BOM 消费 | P0 |
| `plugins.json` | plugins 数组追加 `{ "id": "sprinkler", "path": "plugins/sprinkler/" }` | P0 |
| `sw.js` | CORE 列表追加 `plugins/sprinkler/main.js` + `plugins/sprinkler/manifest.json`（若插件体系缓存机制要求；沿用现有写法） | P0 |
| `tests/terrain_sprinkler_layout.test.cjs` | 追加直接填间距 / BOM 统计 / 蓄水池 / 二次加压 / 土方断言（新函数全覆盖） | P0+P1+P2 |

**禁止改动**：`index.html`（主应用）、`runye-nav.js`、`mod/inline-*.js`、`runye-map-measure.html`、`hydraulic-calc/`、`core/data-service.js`、`runye-entitle.js`、现有滴灌/微灌逻辑。

---

## 2. P0 —— 打通喷灌出图 + BOM 链路（核心）

### 2.1 terrain-core.js · 直接填间距（喷头 12×12）

`sprinklerLayout(plots, input)`（行 674）与 `sprinklerEstimate(input, areaM2)`（行 569）追加可选输入：

```
input.spacing_m   // 直接指定喷头间距（m）。提供时 S = spacing_m，忽略 spacing_k 推导；
                  // 不提供则保持现有 R×k 行为（向后兼容，不得破坏现有调用）
```

- 方形布置：`S = row = spacing_m`；三角形布置：`row = S·√3/2`（沿用行 581 口径）
- 校验：`spacing_m > 0`；若 `spacing_m/R < 0.8 或 > 1.6` → `warn`（提示偏离 GB/T 50085 常规 0.8~1.2R 区间），**不硬拦**（用户备注"严格按照 12m×12m 布局"，12m 是硬参数）
- `sprinklerEstimate` 同样支持 `spacing_m`，headArea 用实际 S×row 计算
- 返回对象保持现有字段不变，追加 `spacingMode: 'fixed'|'factor'`、`spacing_m`（当 fixed 时）

### 2.2 terrain-core.js · 喷灌 BOM 统计（新增纯函数）

新增 `sprinklerBom(layoutResult, opts)`，入参为 `sprinklerLayout` 的返回对象，输出施工预算级清单：

```js
{
  version: 1,
  heads: { count, flowLh, radius_m, spacing_m },   // 喷头数、单头流量(L/h)、半径、间距
  risers: { count, od_mm, height_m },              // 立管数 = 喷头数；默认 25mm × 3m
  pipes: {
    mainline: { dn_mm, len_m },                    // 干管（连接主管至小区）→ mainline 长度
    laterals: { dn_mm, len_m },                    // 支管（小区内）→ laterals 长度合计
    mainDN, latDN                                  // 沿用 sprinklerLayout 管径初估
  },
  shifts: { groupCount, headsPerShift },           // 轮灌组 → 分区阀门数
  valves: { count },                               // = groupCount（每小区独立总阀）
  tank: { volume_m3, note },                       // P1 蓄水池
  boost: { /* P1 二次加压 */ },
  trench: { depth_m, width_m, volume_m3 },         // P2 沟槽土方
  filter: { /* P2 板框过滤 */ }
}
```

- `risers.count = heads.length`；`pipes.laterals.len_m = Σ laterals 线段长`；`pipes.mainline.len_m = mainline 线段长`；`valves.count = groupCount`
- 全部从 layoutResult 现算，**不新开公式、不造假数**；缺字段置 null
- 管径初估沿用行 814-827 口径（mainline@1.2m/s、laterals@1.5m/s）——**不得重写**

### 2.3 terrain/index.html + terrain-ui.js · 结果落桥

- 喷灌参数区（行 142-183）在「喷头与布置」组追加：
  - `直接填间距（m）`：number 输入，placeholder "12"（留空 = 用间距系数 k）
  - `立管规格`：口径 mm（默认 25）、高度 m（默认 3）——P0 只落 BOM 统计，P1 才画图例
- 「估算」按钮（spCalc）点击后：除现有估算结果展示外，调 `sprinklerLayout` → `sprinklerBom` → 写
  ```js
  localStorage['runyeSprinklerResult'] = JSON.stringify({ version:1, ts: Date.now(), plotRef:{id,name,mu,sqm}, bom:{...} , layout:{...} });
  ```
- 页面加一块「喷灌材料清单」折叠区展示该 BOM（纯展示，样式沿用 t-card / t-sprow）
- **与地图回传同款套路**：写前 `removeItem` 再 set，确保每次是全新快照

### 2.4 plugins/sprinkler/ · 壳插件（照抄 hydraulics）

**manifest.json**（仿 `plugins/hydraulics/manifest.json`）：

```json
{
  "id": "sprinkler",
  "name": "喷灌成果（terrain 内核宿主 · 壳）",
  "version": "1.0.0",
  "entry": "main.js",
  "requires": { "core": ">=1.0.0", "plugins": [] },
  "ui": { "nav": { "label": "喷灌成果", "order": 13, "title": "喷灌成果：读取 terrain 喷灌设计结果，合并进材料清单与水力口径" } },
  "permissions": ["read:diagram", "archive:read", "event:subscribe", "event:emit", "ui:nav"],
  "config": {
    "autoloadCore": true,
    "feat": "pro-others",
    "storageKey": "runyeSprinklerResult"
  }
}
```

**main.js** 职责（三步，照抄 `plugins/hydraulics/main.js` 的骨架与容错模式）：
1. **注入内核**：仿 CORE_CHAIN/loadOne/loadCore（行 46-150），把 `terrain/terrain-core.js`（→ `window.RyTerrainCore`）按需 `<script>` 注入主页，等就绪 → `events.emit('sprinkler-core-ready')`；超时/失败 → `ctx.runtime.reportError` + **fail-open**（不冒异常到主程序）
2. **暴露 API**（activate 返回值，loader 记入 `registry['sprinkler'].api`）：
   ```js
   { loadCore, coreReady, coreMissing,
     estimate: (input, areaM2) => 透传 RyTerrainCore.sprinklerEstimate（无内核返回 null）,
     layout:   (plots, input) => 透传 RyTerrainCore.sprinklerLayout（无内核返回 null）,
     bom:      (layoutResult, opts) => 透传 RyTerrainCore.sprinklerBom（无内核返回 null）,
     readBridged: () => 读 localStorage[storageKey] 深拷贝（解析失败返回 null） }
   ```
   ⚠ 全部判空返回 null，**宁可"算不了"也不造假数**（PLUGIN_DEV §9.6）
3. **BOM 桥消费**：监听 `storage` 事件（key 命中 storageKey）或主应用 `bom-updated` 事件（若存在），把桥数据里的喷灌 BOM 追加到主应用材料清单展示（只读快照，不写回 tlDiagramData）

### 2.5 plugins.json + sw.js

- `plugins.json` plugins 数组追加一行（格式与现有 9 项一致）
- `sw.js` CORE 列表追加 sprinkler 两个文件（沿用现有条目写法；不确定则先加，闸门会查）

---

## 3. P1 —— 构件补齐（施工预算级）

### 3.1 蓄水池容积估算（terrain-core.js 新增 `tankVolumeEstimate(input)`）

```
input: { area_mu, etc_mm, days, eta }
V(m³) = area_mu × 667 × etc_mm × days / 1000 / eta
```
- 输入默认建议：area_mu 取当前地块亩数、etc_mm 取 spEtc、days 默认 2（供水中断缓冲天数）、eta 取 spEta
- 返回 `{ volume_m3, formula, note }`，容积按 `Math.ceil(volume_m3)` 取整（工程惯例，标注"建议值，可按日轮灌调整"）
- terrain/index.html 参数区加「蓄水池」组：`水池容积（m³）` 输入 + 「按参数估算」按钮 → 回填

### 3.2 二次加压（terrain-core.js 新增 `boostModel(input)`）

```
input: { q_m3h, total_head_m, split_at_m }   // 总扬程 + 二级加压起点（如主管末端）
输出: {
  stage1: { flow, head, power_kw },          // 主加压（到高位水池/主管起端）
  stage2: { flow, head, power_kw },          // 二次加压（支管入口压力均衡）
  note: '二次加压保障全域水压均衡（分区独立管控）'
}
```
- 功率公式沿用现有泵口径（P=ρgQH/η，η=0.7，与主应用 pump.power 同口径——**先核对 hydraulic-calc/design-core.js 的 motor 选型，能复用就复用，不得另写一套**）
- terrain/index.html 加「二次加压」组：总扬程、二级起点扬程输入 → 显示两段泵选型

### 3.3 立管图例（terrain-ui.js）

- 在喷灌布置图上，每个喷头点（heads）上方画立管符号（竖短线 + 顶部圆点，样式复用现有喷头绘制，class 前缀 `t-sp-`），数量 = heads.length
- 图例（行 204-205 `#spLegend`）追加「立管 25mm×3m」条目

---

## 4. P2 —— 增强项

### 4.1 沟槽土方（terrain-core.js 的 sprinklerBom 追加）

```
trench = { depth_m: 0.5, width_m: 0.4,   // 深度固定 0.5（需求"沟深50cm"），宽度按主管0.5/干管0.4/支管0.3 分档
           volume_m3 = Σ(len × depth × width) }
```
- terrain/index.html 加「沟槽施工」组：沟深（默认 0.5m）输入 + 管沟宽三档（默认 0.5/0.4/0.3）

### 4.2 板框过滤 / 溶肥设施（BOM 追加 + 图例）

- sprinklerBom 追加 `filter: { type:'板框过滤', sets:1, note:'茶枯有机肥液过滤，防喷头堵塞' }`、`fert: { tank:'溶肥容器', pool:'肥液中转池', sets:1 }`
- terrain/index.html 加「肥液与过滤」组：勾选启用 + 数量（默认各 1 套）→ 计入 BOM 与图例
- 图例追加「板框过滤器」「溶肥容器」条目

---

## 5. 验收标准（全绿才算完成）

1. **现有测试不破**：`node tests/terrain_sprinkler_layout.test.cjs` 全部通过（回归）
2. **新函数单测**：同文件追加断言——
   - 直接填间距：`sprinklerLayout(sq100, {range_m:10, spacing_m:12, layout:'square'})` → spacing=12、rowSpacing=12、headCount 与 12×12 网格一致、spacingMode='fixed'
   - 不传 spacing_m 时行为与旧版完全一致（回归）
   - `sprinklerBom(layoutResult)` → risers.count===heads.length、valves.count===groupCount、mainline/laterals 长度=线段长、无假数
   - `tankVolumeEstimate({area_mu:60, etc_mm:4.5, days:2, eta:0.7})` → volume_m3 可复算（手算对拍）
   - `boostModel({q_m3h, total_head_m, split_at_m})` → 两段功率可复算
   - `sprinklerBom` 含 trench/filter/fert 字段（P2 后）
3. **插件闸门**：`_gate_plugins.cjs` + `_smoke_plugins.cjs` + `verify_nav_compact.js` 全绿
4. **插件协议**：manifest 校验通过、`RyCore.loader.registry()['sprinkler']` 状态 active；未加载 terrain-core 时不抛错（fail-open）
5. **浏览器手动验证**：terrain 页填 12×12 + 350L/h → 出图含立管图例 → localStorage 出现 `runyeSprinklerResult` → 主页插件面板能读到喷灌 BOM
6. `git diff --stat` 只含：`terrain/`（三文件）、`plugins/sprinkler/`（两文件）、`plugins.json`、`sw.js`、`tests/terrain_sprinkler_layout.test.cjs`

## 6. 红线（违反即失败）

- **不改主应用任何页面**（index.html / runye-nav.js / mod/ / runye-map-measure.html）——喷灌只在 terrain + 插件桥
- 不新建第二套水力公式（管径初估、泵功率一律复用 terrain-core / hydraulic-calc 现口径）
- 喷头工作压力按 **0.2-0.3 MPa（200-300 kPa）** 处理（需求原文"2-3MPa"已确认为笔误）；terrain 默认 300kPa 不动
- 插件内不写死 label（单一来源 manifest）、类名一律 `sp-` 前缀、深拷贝读数据、deactivate 零残留（PLUGIN_DEV §5 六条硬约束）
- 不 commit / 不 push / 不发布（沿用 AGENT_HANDOFF 纪律）
- 测试脚本只放 `tests/`，不留一次性脚本垃圾

## 7. 完成动作

1. P0 → 验收 §5 全绿 → 汇报（含 `git diff --stat` + 手动验证截图/console 证据）
2. P1/P2 顺序完成（每阶段跑一次 §5 回归）
3. 汇报格式：改了什么（文件×函数）、验收结果、浏览器验证证据、遗留缺口
4. **不要**动主应用页面与滴灌/微灌逻辑——有疑问回读本任务 §6 红线
