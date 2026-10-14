# 润野灌溉设计工具（整合在线地图版）

基于耐特菲姆（Netafim）数据的灌溉系统设计工具，包含在线地图面积测量功能。

> 🤖 **接手本项目的 agent / 开发者请先读 [AGENT_HANDOFF.md](AGENT_HANDOFF.md)**
> —— 里面有上线架构分布、已知代码缺陷、平台硬约束（匿名不能调云函数）、以及**需要用户拍板的 5 个问题**。

## 站点结构

| 文件 | 说明 |
| --- | --- |
| `index.html` | 润野灌溉设计工具主程序（精准灌溉 / 实际方案 / 面积测量 / 管路规划 / 材料清单） |
| `runye-landing.html` | 导航门户页 |
| `runye-map-measure.html` | 在线地图面积测量（Leaflet + 高德卫星瓦片，支持在卫星图上画框实测亩数并回传地块绘制） |
| `runye-irrigation-illustrated-manual.html` | 使用说明 |
| `二级系统图.html` | 二级管路系统图（接收主程序计算结果） |
| `三级系统图.html` | 三级管路系统图（接收主程序计算结果） |
| `耐特菲姆滴灌带长度查询器.html` | 滴灌带最大铺设长度查询（入口压力 × 坡度） |
| `digital-agriculture/` | 数字农业模块（统一入口、花生决策工具、工作台、生育期数据源），见 [模块 README](digital-agriculture/README.md) 与 [开发规则](digital-agriculture/AGENTS.md）。**v382 移除了导航入口、`irrigation-bridge.js` 和绘制边界回写握手；共享地块库 `runye_plot_library` 仍由灌溉工具与工作台读写**，其数据契约见 `RYPLOT_SCHEMA.md` |
| `peanut-tool.html` | （旧入口跳转壳 → digital-agriculture/peanut-tool.html） |
| `数字农业.html` | （旧入口跳转壳 → digital-agriculture/index.html） |
| `workbench.html` | （旧入口跳转壳 → digital-agriculture/workbench.html） |
| `qicai-huasheng/schedule-core.js` | （旧路径兼容加载器 → digital-agriculture/qicai-huasheng/schedule-core.js） |
| `hero-driptape.jpg` | 门户页 Hero 底图 |

数字农业拆分方案的历史记录见 [docs/digital-agriculture-extraction.md](docs/digital-agriculture-extraction.md)；v382 后的边界与遗留影响见 `AGENT_HANDOFF.md` 与方案文档 §12.1。

## 入口

打开 `index.html` 或 `runye-landing.html` 即可使用。所有页面顶部导航栏可互相跳转，"返回主页"按钮回到门户页。

## 建模模块

顶部“数字化建模”进入独立的参数化节点建模试验区；“三维建模”仅预留入口。模块使用与主界面一致的主题，模型只保留于当前会话，不读写灌溉计算、地块库或材料清单。

后续 agent 请先阅读 [建模开发规则](modeling/AGENTS.md) 和 [模块说明与接口](modeling/README.md)。源码在 `modeling/parametric/`，修改后运行 `node modeling/build.cjs` 更新离线嵌入页。用户直接打开即可运行，无需构建。

## 插件生态（Plugin System v1）

主程序壳（`core/`）+ 插件（`plugins/<id>/`）：每个插件一个目录（`manifest.json` + `main.js` + `style.css`），ES Module 导出 `activate(ctx) / deactivate()`；权限按 manifest 声明裁剪、崩溃隔离、卸载零残留。协议字段、ctx 接口与六条硬约束见 **[PLUGIN_DEV.md](PLUGIN_DEV.md)**。

- **写第一个插件**：复制 `plugins/_template/` 整个目录，改 manifest 的 `id`/`name`、把代码里的 `tpl-` 前缀换成你的 id，再把目录登记进 `plugins.json` 即可（模板本身在闸门看管下，烂不了）。
- **内置插件**：`archive`（项目档案）/ `bom`（BOM 导出）/ `case-lib`（案例推荐）/ `calib`（水力参数标定 · opt-in）/ `pipe-optim`（管网优化，老模块迁移样板）/ `hello-world`（协议自检示例）。

### ⚠️ 安全声明（Trust-by-code，接插件前必读）

**安装插件 = 在你的浏览器里运行第三方代码。** 插件体系目前是纯前端沙箱：

- 权限裁剪（`manifest.permissions`）只约束**注入给插件的 API 面**，不是浏览器级隔离——拿到 `read:diagram` 的插件读到的数据，它理论上可以外传；
- 插件脚本没有 CSP 隔离、没有 iframe 沙箱，**不要安装来路不明的插件**；
- 社区插件分发（开放 `plugins.json` 为目录索引）启用前，必须先补 CSP / SRI / 审核机制三者之一；
- 存档数据是用户真实业务数据，云端每用户隔离（uid 维度），插件只能通过声明了 `archive:*` 权限的受控通道读写。

## 发布说明

本仓库用于 GitHub Pages 静态托管。根目录即站点根，仓库名 `runye-irrigation`。

> 注意：`runye-map-measure.html` 与 `index.html` 的"地图回传"功能依赖联网加载高德卫星瓦片与 Leaflet CDN，并通过 localStorage 跨页传参，发布后照常可用。
