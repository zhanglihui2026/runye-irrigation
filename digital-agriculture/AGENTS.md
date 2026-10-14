# 数字农业模块开发规则（digital-agriculture/）

适用于 `digital-agriculture/` 及其子目录。开发前先读本文与 `README.md`；用户明确指定的需求优先，不要把本轮授权扩展成其他模块的改造。

## 1. 功能范围

- 七彩花生水肥与植保决策（`peanut-tool.html`）；
- 数字农业工作台：地块档案、农事记录、植保方案、报表（`workbench.html`，数据层 `runye_db_v1`）；
- 生育期与植保节点统一数据源（`qicai-huasheng/schedule-core.js`，`window.QICAI_SCHEDULE` / `window.QICAI_SCHEDULE_DETAILS`）；
- 统一入口页（`index.html`，数字农业独立入口；可能读取浏览器遗留的只读地块快照）。
- `decision-engine/`、`lajiao-zhibao/`、`qicai-huasheng/` 其余页面暂留仓库根目录，归属待审；未经确认不得移动或删除。

## 2. 硬性边界（禁止事项）

- **不得修改灌溉计算**：流量、管径、扬程、泵功率、分区、面积、滴灌带长度、材料清单，一律与数字农业无关。
- **不得直接读取灌溉页面 DOM**：不访问 `parent.document` / `opener.document` / `top`。v382 起导航入口和 `irrigation-bridge.js` 握手已移除；但 `runye_plot_library` 仍是工作台与灌溉工具共用的 localStorage 数据契约。
- `runye_digital_bridge_v1` 仅为历史遗留的只读快照格式；当前没有灌溉侧生产方。不得依赖其持续更新，也不得新增桥接生产、回跳或灌溉地块库写入。
- **不得修改灌溉计算结果**：数字农业独立管理 `runye_db_v1`；已移除灌溉侧向工作台自动回写的 `runye_pending_land` 握手。
- **生育期与植保数据的唯一来源是 `qicai-huasheng/schedule-core.js`**：任何页面需要生育期/植保节点数据，必须加载它；禁止复制数据到第二个文件形成双源。
- **以下代码禁止重新放回 index.html（根宿主）**：数字农业页面专用 HTML/CSS/JS、生育期与植保节点数据、工作台渲染逻辑、数字农业专用弹窗/表格/卡片及 `runye_db_v1` 的读写实现；它们只属于本目录。

## 3. 页面跳转

- 旧地址 `根/peanut-tool.html`、`根/workbench.html`、`根/数字农业.html` 是跳转壳，一律 `window.location.replace('digital-agriculture/...')`（带原 query/hash），不得删除壳页。
- 模块内互跳用相对路径：`workbench.html`、`peanut-tool.html`、`index.html`（统一入口）；回精准灌溉用 `../index.html`；去根目录独立工具用 `../qicai-huasheng/index.html`、`../lajiao-zhibao/index.html`、`../decision-engine/index.html`。
- v382 起已移除工作台「绘制边界」跨系统握手。不要依据旧流程文档恢复 `runye_pending_land`、灌溉侧回写或自动跳回；如需新流程，先明确新的产品需求与数据契约。

## 4. localStorage key 命名规则

| key | 归属 | 读写方 |
|---|---|---|
| `runye_digital_bridge_v1` | 历史快照格式 | 旧版本可能遗留；当前无生产方，本模块只读兼容 |
| `runyePlotData` | 更早期旧 key | 仅旧页面可能读取；当前无灌溉侧生产方，不新增依赖 |
| `runye_db_v1` | 工作台数据中心 | 本模块独立读写 |
| `runye_pending_land` | 已失效的历史握手 key | 当前仓库已无读写方；不得恢复旧握手或新增依赖 |
| `runye_plot_library` | 灌溉工具与工作台共享地块库 | 双方现有读写契约；字段及兼容规则见根目录 `RYPLOT_SCHEMA.md` |

新增 key 必须以 `runye_digital_` 前缀命名并登记到 README；禁止复用灌溉内部临时状态作公共接口。

## 5. 如何新增功能

1. 先确认新功能属于"地块/农事/植保/决策"域，不是灌溉设计域；灌溉设计需求去根宿主做。
2. 数字农业内部数据由本模块所有者管理；现有地块共享读写须遵守根目录 `RYPLOT_SCHEMA.md`。新增长期跨模块行为前先明确数据所有者和迁移路径，不得复用已失效的 `runye_pending_land` 握手。
3. 新页面放进本目录，引用 `qicai-huasheng/schedule-core.js` 用相对路径 `qicai-huasheng/schedule-core.js`；主题样式优先 `../runye-theme.css` 或本目录 `digital-agriculture.css`。
4. 新增文件在本目录 `README.md` 站点表中登记；改动握手/key 时同步根目录 `README.md` 与 `docs/digital-agriculture-extraction.md`。

## 6. 如何验证旧入口

每次改动后至少检查：

1. 三个旧地址仍可达：根 `peanut-tool.html`、`workbench.html`、`数字农业.html` 打开后应 replace 到新地址（带参数）。
2. `qicai-huasheng/index.html` 的导航（`../数字农业.html` 等）跳转链仍成立。
3. `qicai-huasheng/schedule-core.js` 旧路径兼容壳能同步加载新数据源（`window.QICAI_SCHEDULE` 非空）。
4. 统一入口 `digital-agriculture/index.html`：直接打开不报错；浏览器存在旧桥接快照时，其展示应标明为历史数据。工作台与灌溉工具共享地块库的行为另按 `RYPLOT_SCHEMA.md` 核验。
5. file:// 双击与本地 HTTP 两种方式都要过。
6. 控制台无新增错误。

## 7. 与参数化建模的关系

`modeling/`（参数化建模）与数字农业互不依赖；数字农业不得读写建模数据，建模不得读写 `runye_db_v1`。
