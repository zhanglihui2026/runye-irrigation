# 数字农业模块开发规则（digital-agriculture/）

适用于 `digital-agriculture/` 及其子目录。开发前先读本文与 `README.md`；用户明确指定的需求优先，不要把本轮授权扩展成其他模块的改造。

## 1. 功能范围

- 七彩花生水肥与植保决策（`peanut-tool.html`）；
- 数字农业工作台：地块档案、农事记录、植保方案、报表（`workbench.html`，数据层 `runye_db_v1`）；
- 生育期与植保节点统一数据源（`qicai-huasheng/schedule-core.js`，`window.QICAI_SCHEDULE` / `window.QICAI_SCHEDULE_DETAILS`）；
- 统一入口页（`index.html`，读桥接数据展示来自精准灌溉的地块）。
- `decision-engine/`、`lajiao-zhibao/`、`qicai-huasheng/` 其余页面暂留仓库根目录，归属待审；未经确认不得移动或删除。

## 2. 硬性边界（禁止事项）

- **不得修改灌溉计算**：流量、管径、扬程、泵功率、分区、面积、滴灌带长度、材料清单，一律与数字农业无关。
- **不得直接读取灌溉页面 DOM**：不访问 `parent.document` / `opener.document` / `top`；跨页只经数据接口。
- **数据只能通过版本化桥接接口传递**：即 `runye_digital_bridge_v1`（payload 契约见 `README.md`），生产方在根目录 `irrigation-bridge.js`。
- **不得反向修改灌溉计算结果**：数字农业侧对桥接数据只读；`runye_db_v1` 的写回由灌溉侧桥接主动完成，本模块不得代写。
- **生育期与植保数据的唯一来源是 `qicai-huasheng/schedule-core.js`**：任何页面需要生育期/植保节点数据，必须加载它；禁止复制数据到第二个文件形成双源。
- **以下代码禁止重新放回 index.html（根宿主）**：数字农业页面专用 HTML/CSS/JS、生育期与植保节点数据、工作台渲染逻辑、数字农业专用弹窗/表格/卡片、`runye_db_v1` / `runye_pending_land` 的读写实现。它们只属于本目录与 `irrigation-bridge.js`。

## 3. 页面跳转

- 旧地址 `根/peanut-tool.html`、`根/workbench.html`、`根/数字农业.html` 是跳转壳，一律 `window.location.replace('digital-agriculture/...')`（带原 query/hash），不得删除壳页。
- 模块内互跳用相对路径：`workbench.html`、`peanut-tool.html`、`index.html`（统一入口）；回精准灌溉用 `../index.html`；去根目录独立工具用 `../qicai-huasheng/index.html`、`../lajiao-zhibao/index.html`、`../decision-engine/index.html`。
- 工作台「绘制边界」链路：本模块写 `runye_pending_land` → 跳 `../index.html?from=workbench#areaTool` → 灌溉侧保存后由 `irrigation-bridge.js` 回写 `runye_db_v1` 并跳回 `digital-agriculture/workbench.html?space=1#/land/<id>`。不要改这套握手。

## 4. localStorage key 命名规则

| key | 归属 | 读写方 |
|---|---|---|
| `runye_digital_bridge_v1` | 桥接（v1 协议） | 灌溉侧写；本模块只读 |
| `runyePlotData` | 旧兼容 key（deprecated，待退役） | 灌溉侧写；`peanut-tool.html` 读；新增功能禁止再依赖它 |
| `runye_db_v1` | 工作台数据中心 | 本模块读写；灌溉侧仅经 `irrigation-bridge.js` 写回 |
| `runye_pending_land` | 工作台↔灌溉握手 | 本模块写/清；灌溉侧读/清 |
| `runye_plot_library` | **灌溉地块库** | 本模块**禁止写**；只读展示须注明来源 |

新增 key 必须以 `runye_digital_` 前缀命名并登记到 README；禁止复用灌溉内部临时状态作公共接口。

## 5. 如何新增功能

1. 先确认新功能属于"地块/农事/植保/决策"域，不是灌溉设计域；灌溉设计需求去根宿主做。
2. 数据需求走 `runye_digital_bridge_v1`（升级协议先 bump version 并同步改 `irrigation-bridge.js` 与本文档）。
3. 新页面放进本目录，引用 `qicai-huasheng/schedule-core.js` 用相对路径 `qicai-huasheng/schedule-core.js`；主题样式优先 `../runye-theme.css` 或本目录 `digital-agriculture.css`。
4. 新增文件在本目录 `README.md` 站点表中登记；改动握手/key 时同步根目录 `README.md` 与 `docs/digital-agriculture-extraction.md`。

## 6. 如何验证旧入口

每次改动后至少检查：

1. 三个旧地址仍可达：根 `peanut-tool.html`、`workbench.html`、`数字农业.html` 打开后应 replace 到新地址（带参数）。
2. `qicai-huasheng/index.html` 的导航（`../数字农业.html` 等）跳转链仍成立。
3. `qicai-huasheng/schedule-core.js` 旧路径兼容壳能同步加载新数据源（`window.QICAI_SCHEDULE` 非空）。
4. 统一入口 `digital-agriculture/index.html`：直接打开不报错（无地块时隐藏地块卡）；从灌溉工具「保存方案」后打开能显示地块卡。
5. file:// 双击与本地 HTTP 两种方式都要过。
6. 控制台无新增错误。

## 7. 与参数化建模的关系

`modeling/`（参数化建模）与数字农业互不依赖；数字农业不得读写建模数据，建模不得读写 `runye_db_v1`。
