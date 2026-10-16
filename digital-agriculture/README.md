# 数字农业模块（digital-agriculture/）

润野数字农业子系统集中在本目录，包含七彩花生水肥与植保、辣椒植保、气候与市场决策和农艺参考资料。数字农业工作台源码已从运行目录移至 `../feature-archive/数字农业工作台/`，不再从本模块提供入口。开发规则见 `AGENTS.md`。

**系统边界：** 数字农业运行页面不依赖灌溉页面 DOM、账号、云服务或 `runye_plot_library`。花生决策页的面积、区域、播期、底肥与天气参数仅保存在本页本机状态中。旧快照 key 不再读取，也不自动删除浏览器残留数据。灌溉工具保留自身的作物需水设计输入和项目档案作物标签；这些数据不与数字农业页面共享。工作台源码当前归档且不执行；唯一允许的未来跨模块关系是灌溉工具把地块单向交给工作台，当前没有活动接收端。

## 站点结构

| 文件 | 说明 |
| --- | --- |
| `index.html` | 数字农业统一入口（导航卡片；可独立使用） |
| `peanut-tool.html` | 七彩花生水肥与植保决策工具（原根目录 `peanut-tool.html`） |
| `qicai-huasheng/` | 七彩花生植保方案、每日建议、配置及素材；`schedule-core.js` 是生育期与植保节点**唯一数据源** |
| `lajiao-zhibao/` | 辣椒全程植保方案 |
| `decision-engine/` | 气候/市场通用决策与辣椒决策页面 |
| `references/` | 花生农艺参考资料 |
| `digital-agriculture.css` | 入口页样式 |

数字农业生育期计算云函数源码保存在 `cloud-functions/calcStage/`，但当前不属于润野灌溉的 CloudBase 部署清单，也没有活动调用方。部署配置只保留灌溉主程序使用的 `syncDb`。如需恢复作物计算服务，应在数字农业侧单独部署并核对调用关系，不要将其重新加入灌溉主程序的 `cloudbaserc.json`。

旧地址兼容：根目录 `peanut-tool.html` / `数字农业.html` 及根 `qicai-huasheng/`、`lajiao-zhibao/`、`decision-engine/` 页面均为轻量跳转壳（`location.replace` 到本目录并保留 query/hash）；根 `qicai-huasheng/schedule-core.js`、`schedule-data.js`、`schedule-details.js` 为兼容加载器。根 `workbench.html` 跳转壳不存在且不再提供。

## 历史数据兼容

浏览器中可能残留 `runye_digital_bridge_v1`、`runyePlotData` 等旧 key；当前代码不再读取或删除它们。`runye_plot_library` 归润野灌溉所有，数字农业页面不得访问。工作台归档期间，数字农业模块独立运行。

- 灌溉与种植页面之间不共享运行数据、账号、云服务或导航入口。
- 若恢复工作台，唯一允许的接口是灌溉工具显式发送地块快照到工作台；工作台不得回写灌溉工程，种植页面不得直接读取该快照。

## 本地使用

双击 `index.html` 即可（file://）；或仓库根目录起静态服务：

```
python -m http.server 8080
# 访问 http://localhost:8080/digital-agriculture/index.html
```
