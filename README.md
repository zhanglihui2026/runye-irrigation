# 润野灌溉设计工具（整合在线地图版）

基于耐特菲姆（Netafim）数据的灌溉系统设计工具，包含在线地图面积测量功能。

## 站点结构

| 文件 | 说明 |
| --- | --- |
| `index.html` | 润野灌溉设计工具主程序（精准灌溉 / 实际方案 / 面积测量 / 管路规划 / 材料清单），并承载「数字农业」导航入口 |
| `irrigation-bridge.js` | 灌溉 ↔ 数字农业最小桥接层（协议 v1，key `runye_digital_bridge_v1`） |
| `runye-landing.html` | 导航门户页 |
| `runye-map-measure.html` | 在线地图面积测量（Leaflet + 高德卫星瓦片，支持在卫星图上画框实测亩数并回传设计工具） |
| `runye-irrigation-illustrated-manual.html` | 使用说明 |
| `二级系统图.html` | 二级管路系统图（接收主程序计算结果） |
| `三级系统图.html` | 三级管路系统图（接收主程序计算结果） |
| `耐特菲姆滴灌带长度查询器.html` | 滴灌带最大铺设长度查询（入口压力 × 坡度） |
| `digital-agriculture/` | 数字农业模块（统一入口、花生决策工具、工作台、生育期数据源），见 [模块 README](digital-agriculture/README.md) 与 [开发规则](digital-agriculture/AGENTS.md) |
| `peanut-tool.html` | （旧入口跳转壳 → digital-agriculture/peanut-tool.html） |
| `数字农业.html` | （旧入口跳转壳 → digital-agriculture/index.html） |
| `workbench.html` | （旧入口跳转壳 → digital-agriculture/workbench.html） |
| `qicai-huasheng/schedule-core.js` | （旧路径兼容加载器 → digital-agriculture/qicai-huasheng/schedule-core.js） |
| `hero-driptape.jpg` | 门户页 Hero 底图 |

数字农业剥离的完整清单、依赖关系与验证记录见 [docs/digital-agriculture-extraction.md](docs/digital-agriculture-extraction.md)。

## 入口

打开 `index.html` 或 `runye-landing.html` 即可使用。所有页面顶部导航栏可互相跳转，"返回主页"按钮回到门户页。

## 建模模块

顶部“数字化建模”进入独立的参数化节点建模试验区；“三维建模”仅预留入口。模块使用与主界面一致的主题，模型只保留于当前会话，不读写灌溉计算、地块库或材料清单。

后续 agent 请先阅读 [建模开发规则](modeling/AGENTS.md) 和 [模块说明与接口](modeling/README.md)。源码在 `modeling/parametric/`，修改后运行 `node modeling/build.cjs` 更新离线嵌入页。用户直接打开即可运行，无需构建。

## 发布说明

本仓库用于 GitHub Pages 静态托管。根目录即站点根，仓库名 `runye-irrigation`。

> 注意：`runye-map-measure.html` 与 `index.html` 的"地图回传"功能依赖联网加载高德卫星瓦片与 Leaflet CDN，并通过 localStorage 跨页传参，发布后照常可用。
