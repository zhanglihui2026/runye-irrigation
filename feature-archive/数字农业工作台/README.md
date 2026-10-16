# 数字农业工作台归档

本目录保存从当前可运行页面中完整移除的数字农业工作台源码。它不再由主程序、数字农业入口页或七彩花生页面导航到达；归档文件不参与主程序脚本加载、插件注册或 Service Worker 缓存。

## 归档内容

- `source/digital-agriculture/workbench.html`：工作台原始完整页面源码。SHA-256：`2ECD1C72C667D6D666A1F7A968B48156D76CE6929906349CF935090910C484F2`。
- `automation-snapshot/`：原每日行情/天气 GitHub Actions 工作流、抓取脚本及其最后一次 `daily.json` 快照。该 workflow 只为已归档的工作台维护数据，当前运行页面无消费者，因此已从 `.github/workflows/` 移除，停止定时写主分支。
- `integration-snapshot/routes-before.md`：本次移除的入口与导航路径，供恢复时核对。
- `manifest.json`：归档文件摘要与恢复依赖清单。

工作台原先使用 `runye_db_v1` 管理自身档案，并读写共享的 `runye_plot_library`。归档后这些代码不再执行；其中整库重写及名称/面积回退匹配的风险一并停用。其他仍在运行的页面（例如花生决策页）有自己的地块字段写入逻辑，本次不改变它们。

每日行情/天气 workflow 原本每天从 Open-Meteo 采集天气，并保留 `prices`、`advice` 字段；工作流具有写权限并自动提交数据。迁移到 `automation-snapshot/` 后不会被 GitHub Actions 自动发现或执行。若未来恢复，须先确认仍有实际消费者，再将 workflow 与脚本按仓库根目录结构恢复。

## 恢复方式

1. 先复核归档源码、依赖及 `runye_plot_library` 数据所有权，不要直接把旧页面恢复到运行区。
2. 将 `source/digital-agriculture/workbench.html` 放回 `digital-agriculture/workbench.html`。
3. 如需入口，再单独恢复数字农业入口卡片和七彩花生页面导航；不要恢复根目录旧跳转壳，除非明确需要。
4. 重构 `syncLandsToPlotLibrary()`，确保按稳定 ID 做局部更新、删除有明确授权且不替换整库，再验证工作台与灌溉页面的数据隔离。
5. 检查 README、AGENTS、地块库契约、AOCI、静态检查及 Service Worker 资源清单。
6. 若恢复每日数据自动化，先确认数据消费者，再把 `automation-snapshot/.github/workflows/` 与 `.github/scripts/` 恢复到活动根目录，核验 `permissions: contents: write` 及提交目标。

## 恢复依赖

源码保留其原相对路径，因此放回 `digital-agriculture/workbench.html` 后使用原依赖路径：

- `digital-agriculture/qicai-huasheng/schedule-core.js`
- 根目录 `runye-theme.css` 与 `runye-typography.css`
- 工作台内链到的数字农业、花生植保、辣椒植保和决策页面

归档目录不得被页面、插件或 Service Worker 当作运行资源引用。
