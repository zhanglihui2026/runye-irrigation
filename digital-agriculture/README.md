# 数字农业模块（digital-agriculture/）

润野数字农业子系统的统一目录：七彩花生水肥与植保决策、数字农业工作台、生育期与植保节点数据源。2026-09-13 自仓库根目录剥离而来。开发规则见 `AGENTS.md`。

**系统边界（v382 起）**：灌溉导航入口、`irrigation-bridge.js` 和绘制边界后自动回写工作台的握手已移除。数字农业工作台仍与灌溉工具通过同源 localStorage 键 `runye_plot_library` 共享地块数据；该共享存储是当前遗留跨模块契约，字段约定见根目录 `RYPLOT_SCHEMA.md`。早期拆分方案 `../docs/digital-agriculture-extraction.md` 记录的是 v382 之前的设计，不代表当前握手仍可用。

## 站点结构

| 文件 | 说明 |
| --- | --- |
| `index.html` | 数字农业统一入口（导航卡片；可独立使用） |
| `peanut-tool.html` | 七彩花生水肥与植保决策工具（原根目录 `peanut-tool.html`） |
| `workbench.html` | 数字农业工作台：地块全周期管理（原根目录 `workbench.html`） |
| `qicai-huasheng/schedule-core.js` | 生育期与植保节点**唯一数据源**（原根 `qicai-huasheng/schedule-core.js`） |
| `digital-agriculture.css` | 入口页样式 |
| `digital-agriculture.js` | 读取并校验历史遗留的只读地块快照；当前无灌溉侧生产方 |

旧地址兼容：根目录 `peanut-tool.html` / `workbench.html` / `数字农业.html` 为跳转壳（`location.replace` 到本目录）；根 `qicai-huasheng/schedule-core.js` 为同步兼容加载器。

## 历史数据兼容

`digital-agriculture.js` 暂时保留对 `runye_digital_bridge_v1` 的只读解析，以兼容浏览器中可能残留的旧快照。v382 已删除根目录 `irrigation-bridge.js` 及其加载入口，因此当前没有该快照的生产方，也不保证能从灌溉工具获得新数据。工作台对 `runye_plot_library` 的共享读写仍在运行；不要将旧 `runye_pending_land` 回写握手与该共享地块库混为一谈。

- 如果浏览器仍有旧快照，入口页可能展示它；它不代表当前灌溉项目状态。
- 不新增灌溉侧写入、回跳或边界回写逻辑。若未来确需跨系统交换数据，应先重新确定产品边界、数据所有者和经确认的接口契约。

## 本地使用

双击 `index.html` 即可（file://）；或仓库根目录起静态服务：

```
python -m http.server 8080
# 访问 http://localhost:8080/digital-agriculture/index.html
```
