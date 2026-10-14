# 维护待办与本轮收尾（2026-10-14）

本轮按“可确定修复先完成；受外部审批、证据或语义影响的事项留待集中处理”执行。没有提交或部署。

## 已完成

- L1 权益配置强制限定为基础功能；CAD 图纸、BOM 清单、水力校核和高级通配权限固定为 L2。
- 管理后台把 L2 功能标成仅 L2；会员矩阵测试覆盖误配置场景。
- 导航插件入口与文件菜单在权益同步期间显示等待态，并在点击时重新判定状态。
- 自动及手动分区布局将总网格限制为 500 格；手动设置超限时明确提示并统一回退到自动布局，切分数组生成前完成有界计数。
- CAD 工具栏 IIFE 已从 `index.html` 原位抽至 `mod/ry-cad-toolbar.js`，保持普通同步脚本加载和原先执行顺序。
- 已检查云函数部署 ZIP：只含 `index.js`、`package.json`，且 ZIP 内源码与 `cloudfn/ryEntitle-v2/index.js` 一致。
- 水力反算代码当前使用 `1 / HAZEN.n`，默认 C 值也会读取有效 `window.C_HAZEN`；检查未发现需要改正的公式回归。
- 水力校核独立页面增加 L2 权益启动门控：权益未确认时不注册计算/导入事件；权益同步中显示等待并轮询，拒绝时引导查看会员权益。
- 本轮 AOCI 对 `sw.js` 的当前摘要绑定写入成功，Verify 显示治理对齐且无缺失、陈旧或待复核项；此前摘要校验异常本轮未复现，作为历史故障观察，不再按当前阻塞处理。
- 本地与 GitHub CI 共用 `node scripts/check.cjs`；静态契约新增主页面本地脚本、插件 manifest/入口与 Service Worker CORE 的一致性检查。案例库、CloudSync 适配层和撤销模块加入 CORE，版本升至 v433；CloudBase SDK 缺失时可降级到本地模式，作为显式检查例外。

## 待统一处理

1. **AOCI E-scale 尺寸提示**：当前 Aggregate Check 报告 14 条 E 标签与文件行数尺度不一致。E-scale 是提示，不是提交阻断；后续可按对象逐项核对语义与源码后再维护，不能只按行数机械改标签。
2. **大文件模块拆分审查**：除 CAD 工具栏外，当前工作区也包含从 `inline-11.js` 拆出的 `mod/plot-editor.js`、扬程展示 `mod/plan-calc-render.js`，以及从 `inline-09.js` 拆出的 `mod/material-table.js`、`mod/tl-header-layout.js`。这些拆分已落在当前工作区，但尚未通过本轮统一门禁；继续拆分前应先核实加载顺序、公开接口与测试基线。
3. **数字农业文档漂移**：本轮将 `digital-agriculture/README.md`、`AGENTS.md`、`digital-agriculture.js` 注释和入口页文案校正为 v382 后的独立边界；早期提取方案已标记为历史资料。对应 AOCI 4 条已更新并通过 Verify/Check/Guide。
4. **测试失败归因**：静态审阅确认桥接测试改为检查 v382 解耦边界是合理的，`partition_query` 的空 UI 桩与其几何测试目的相符；`plot_merge.smoke.cjs` 使用展开后的入口源码，不能仅因模块抽取认定 8 个失败是过期锚点。缺少本次失败名称和 AssertionError，当前无法逐条判定是否为真实回归。
5. **数字农业与地块库的剩余耦合**：工作台中失效的“先画边界/绘制边界/重新绘制”入口、旧 `runye_pending_land` 写入和自动回写承诺已清理；两侧仍共享 `runye_plot_library`，由 `RYPLOT_SCHEMA.md` 描述。下一阶段需按数据资产化主线明确该键的唯一所有者、写入接口和冲突处理，再逐步迁移，不能把旧握手恢复为隐式接口。

## 已核对、无需处理

- **AOCI `sw.js` 摘要异常**：此前失败批次正式写入数为 0；本轮 `sw.js` 当前候选成功写入，Verify 治理对齐且无陈旧/缺失，异常暂未复现。
- **`pg` 依赖**：云函数 `package.json` 没有 `pg`，部署 ZIP 仅含 `index.js` 和 `package.json` 且源码一致；没有可移除项。

## 验证

- 2026-10-14 已在当前工作区执行 `node scripts/check.cjs`：233 个 Git 可见 JS/CJS/MJS 文件语法检查通过；静态契约 7/7 通过；脚本枚举的 25 个 Node 测试文件全部通过；`tests/plot_merge.smoke.cjs` 23/23 通过。此前记录的 87/89 与 15/23 是旧基线，不再代表当前工作区结果。
- 本次通过结果仅覆盖当前本地工作区及脚本枚举的检查，不代表远端 CI、真实浏览器/CDP 行为或发布包已验证。
- `git diff --check`：通过；仅有 Git 的工作区换行符提示。
- `node --check mod/inline-09.js`、`node --check mod/inline-11.js`：历史记录为通过；本轮未运行测试套件。
- AOCI 本轮数字农业 4 条候选写入成功；Verify 无 stale/missing，Check `ok=true` 且无阻断项，Guide `complete=true` / `next_action=none`。仍有 10 条 E-scale 提示。
- 未提交或部署；当前工作区包含本轮之前已有的多文件改动与未跟踪文件，不能直接把全部工作区内容作为一次发布范围。
