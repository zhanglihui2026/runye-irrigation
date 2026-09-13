# 数字农业模块（digital-agriculture/）

润野数字农业子系统的统一目录：七彩花生水肥与植保决策、数字农业工作台、生育期与植保节点数据源。2026-09-13 自仓库根目录剥离而来，剥离清单与依赖关系见 `../docs/digital-agriculture-extraction.md`。开发规则见 `AGENTS.md`。

## 站点结构

| 文件 | 说明 |
| --- | --- |
| `index.html` | 数字农业统一入口（导航卡片 + 展示来自精准灌溉的当前地块） |
| `peanut-tool.html` | 七彩花生水肥与植保决策工具（原根目录 `peanut-tool.html`） |
| `workbench.html` | 数字农业工作台：地块全周期管理（原根目录 `workbench.html`） |
| `qicai-huasheng/schedule-core.js` | 生育期与植保节点**唯一数据源**（原根 `qicai-huasheng/schedule-core.js`） |
| `digital-agriculture.css` | 入口页样式 |
| `digital-agriculture.js` | 桥接数据读取与校验（模块侧，只读） |

旧地址兼容：根目录 `peanut-tool.html` / `workbench.html` / `数字农业.html` 为跳转壳（`location.replace` 到本目录）；根 `qicai-huasheng/schedule-core.js` 为同步兼容加载器。

## 数据接口（v1）

生产方：根目录 `irrigation-bridge.js`（由精准灌溉 `index.html` 加载）。存储 key：`runye_digital_bridge_v1`。

```json
{
  "version": 1,
  "source": "runye-irrigation",
  "generatedAt": 1789249881255,
  "plot": {
    "id": "p123",              // 必填，≤64 字符
    "name": "东方便地块",        // 必填，≤100 字符
    "areaMu": 30.5,            // 必填，单位亩，(0, 1e6]
    "areaSqm": 20333.33,       // 可选，单位平方米，>0
    "crop": "七彩花生",          // 可选，≤50 字符
    "plantingDate": "2026-03-01" // 可选，YYYY-MM-DD 或空串
  }
}
```

- URL 传参：`index.html?plotId=<encodeURIComponent(id)>`。
- 校验失败不写入、不跳转，只 console.warn + 非阻塞提示，灌溉工具不受影响。
- 不传递 DOM / 函数 / window / 灌溉内部计算对象；数字农业侧对桥接数据**只读**。
- 旧 key `runyePlotData` 仍由灌溉侧双写供 `peanut-tool.html` 兼容读取，标记 deprecated，新增功能禁止依赖。

## 本地使用

双击 `index.html` 即可（file://）；或仓库根目录起静态服务：

```
python -m http.server 8080
# 访问 http://localhost:8080/digital-agriculture/index.html
```
