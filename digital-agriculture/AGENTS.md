# 数字农业模块开发规则（digital-agriculture/）

适用于 `digital-agriculture/` 及其子目录。开发前先读本文与 `README.md`；用户明确指定的需求优先，不要把本轮授权扩展成其他模块的改造。

## 1. 功能范围

- 七彩花生水肥、植保与每日建议（`peanut-tool.html`、`qicai-huasheng/`）；
- 辣椒植保（`lajiao-zhibao/`）、气候与市场决策（`decision-engine/`）及农艺参考资料（`references/`）；
- 生育期与植保节点唯一数据源（`qicai-huasheng/schedule-core.js`，`window.QICAI_SCHEDULE` / `window.QICAI_SCHEDULE_DETAILS`）；
- 数字农业统一入口（`index.html`）；
- 数字农业工作台源码已移至 `../feature-archive/数字农业工作台/`，不属于当前运行模块。

## 2. 硬性边界（禁止事项）

- **不得修改灌溉计算**：流量、管径、扬程、泵功率、分区、面积、滴灌带长度、材料清单，一律与数字农业无关。
- **不得依赖灌溉运行时或数据**：不访问 `parent.document` / `opener.document` / `top`，不读取或写入 `runye_plot_library`、灌溉账号、灌溉云端或灌溉计算结果。花生工具的面积、区域、播期和农事参数由本页本机参数独立维护。
- 灌溉工具自身保留的作物需水输入、作物配方与项目档案标签属于灌溉设计域；数字农业不得读取或同步这些数据。
- 旧 `runye_digital_bridge_v1` 快照不再读取；本机残留数据不自动删除。不得恢复历史快照消费、回跳或灌溉地块库写入。
- **不得修改灌溉计算结果**：`runye_pending_land` 历史握手已移除；归档工作台不再运行或写共享地块库。
- **生育期与植保数据的唯一来源是 `qicai-huasheng/schedule-core.js`**：任何页面需要生育期/植保节点数据，必须加载它；禁止复制数据到第二个文件形成双源。
- **以下代码禁止重新放回 index.html（根宿主）**：数字农业页面专用 HTML/CSS/JS、生育期与植保节点数据、工作台渲染逻辑、数字农业专用弹窗/表格/卡片及 `runye_db_v1` 的读写实现；它们只属于本目录。

## 3. 页面跳转

- 根目录 `peanut-tool.html`、`数字农业.html`、`qicai-huasheng/*`、`lajiao-zhibao/*`、`decision-engine/*` 仅保留带原 query/hash 的跳转壳；业务实现不得回到根目录。
- 模块内互跳使用 `digital-agriculture/` 子树内相对路径；种植页面不提供返回润野灌溉的导航。
- 工作台源码目前归档，不存在活动接收端。不要依据旧流程文档恢复 `runye_pending_land`、共享灌溉地块库、反向回写或自动跳回；若将来恢复工作台，唯一允许的跨模块方向是灌溉工具显式单向传递地块到工作台，并先定义数据契约。

## 4. localStorage key 命名规则

| key | 归属 | 读写方 |
|---|---|---|
| `runye_digital_bridge_v1` | 已停用的旧快照格式 | 当前无读写方；不读取、不自动删除旧数据 |
| `runyePlotData` | 已停用的早期快照 key | 当前无读写方；不读取、不自动删除旧数据 |
| `runye_db_v1` | 已归档的工作台历史数据 | 当前模块无读写方；本机旧数据不自动删除 |
| `runye_pending_land` | 已失效的历史握手 key | 当前仓库已无读写方；不得恢复旧握手或新增依赖 |
| `runye_plot_library` | 润野灌溉地块库 | 仅灌溉工具读写；数字农业模块禁止访问 |

新增 key 必须以 `runye_digital_` 前缀命名并登记到 README；禁止复用灌溉内部临时状态作公共接口。

## 5. 如何新增功能

1. 先确认新功能属于"地块/农事/植保/决策"域，不是灌溉设计域；灌溉设计需求去根宿主做。
2. 数字农业内部数据由本模块所有者管理；不得共享读写根目录 `runye_plot_library`。新增长期跨模块行为前先明确数据所有者和迁移路径；只有未来工作台恢复后，才可设计灌溉工具到工作台的显式单向地块交接。
3. 新页面放进本目录；生育期与植保页面引用 `qicai-huasheng/schedule-core.js`。共享主题样式路径按页面深度回到仓库根目录，或使用本模块 `digital-agriculture.css`。
4. 新增文件在本目录 `README.md` 站点表中登记；改动握手/key 时同步根目录 `README.md` 与 `docs/digital-agriculture-extraction.md`。

## 6. 如何验证旧入口

每次改动后至少检查：

1. 旧根地址 `peanut-tool.html`、`数字农业.html` 及种植页路径应 replace 到本目录对应页面（保留 query/hash）。
2. 数字农业内部导航均保持在本目录，且页面不链接到灌溉工具。
3. `qicai-huasheng/schedule-core.js` 旧路径兼容壳能同步加载新数据源（`window.QICAI_SCHEDULE` 非空）。
4. 统一入口 `digital-agriculture/index.html`：直接打开不报错；不显示或链接到已归档的工作台，不读取历史桥接快照。
5. 唯一允许的未来跨模块关系是灌溉工具向数字农业工作台显式单向传递地块；不得反向写回或让种植页面读取灌溉运行数据。工作台当前归档，没有活动接收端。
6. file:// 双击与本地 HTTP 两种方式都要过。
7. 控制台无新增错误。

## 7. 与参数化建模的关系

`modeling/`（参数化建模）与数字农业互不依赖；数字农业不得读写建模数据，建模不得读写 `runye_db_v1`。
