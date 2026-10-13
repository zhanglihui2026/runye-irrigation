# TASK_bom-nav-merge_20261012 —— 材料清单 / BOM 导出 导航合并

> 执行者：Agent S（导航合并专项）
> 背景：当前导航存在两个高度相似入口 —— ①「材料清单」（plugins/material-list 壳插件接管，点击切到主程序 #detailsSection 页面区块，纯统计查看）；②「BOM 导出」（plugins/bom 原生插件，点击开插件面板，含 生成清单/导出CSV/存入档案 三动作）。两功能数据同源（`Core.ctx.data.readBom()`），但入口重复、用户易混淆。
> 目标：**导航只保留一个「材料清单」入口**，点击后同时呈现「统计视图（页面区块）」与「导出/存档（BOM 面板）」，消除双入口。
> 依赖规范：`PLUGIN_DEV.md`（插件六条硬约束）、`架构结构图.md`（§4 插件清单）、现有闸门三件套。
> **禁止改动**：bom 插件的业务逻辑（生成/渲染/CSV/存档 全部原样）；主程序 #detailsSection 区块；core/loader；会员门控语义。

---

## 0. 一句话目标

导航合并：删掉「BOM 导出」独立导航项，让「材料清单」点击 = 切页面区块 + 自动展开 BOM 面板（生成清单视图）。**bom 插件面板本身的全部能力零改动**，只是入口从两个变成一个。

## 1. 现状（已核实，勿推翻）

| 项 | 导航标签 | 点击行为 | 归属 |
|---|---|---|---|
| A | 材料清单 | `ryJumpToSection('detailsSection')` → 切主程序页面区块（纯统计） | plugins/material-list（壳，v390） |
| B | BOM 导出 | 切换 `panel.style.display` → 打开/关闭 bom 面板（生成/CSV/存档） | plugins/bom（原生，阶段二） |

- material-list 插件：`legacySel=".fn-link[data-target=detailsSection]"` 摘老项 → `registerNav({ label:'材料清单', onClick: open })` → open 走 `ryJumpToSection(sectionId)` + `lightSelf()`。含重渲染抑制器（MutationObserver 防权益重渲染复活老项双入口）——**此机制必须保留**。
- bom 插件：`registerNav({ label:'BOM 导出', onClick: togglePanel })`；activate 时 `refreshArchives()`；面板 `data-ry-plugin="bom"` 挂在 `ctx.ui.mountPoint`；`generate()` 调 `ctx.data.readBom()`。
- core/ui-shell.js `registerNav(item)`：按 `item.id` 去重（重复返回 no-op + guard.reportError）；返回 unregister 函数；`unregisterNav(id)` 可移除指定 id 的导航项。

## 2. 合并方案（推荐：B 壳触发 + A 保持接管）

**导航上保留 material-list 的「材料清单」入口**，bom 插件**不再注册自己的导航项**（或注册后由 material-list 触发），改为通过**事件总线广播**让 material-list 点击时联动打开 bom 面板。

### 2.1 改动清单

| 文件 | 动作 |
|---|---|
| `plugins/bom/main.js` | ① activate 中**不再 registerNav**（或保留注册但 label 改 'BOM 导出（隐藏）' 且不挂载——推荐直接不注册）；② 暴露 `window.__ryBomOpen()` / 或通过事件总线 `emit('bom-open-request')` 让外部可触发面板打开；③ 面板显示逻辑保持 `togglePanel()`，新增 `openPanel()`（force 显示 + refreshArchives + 若无 current 则 generate） |
| `plugins/material-list/main.js` | open() 中原 `ryJumpToSection(sectionId)` **之后追加**：触发 bom 面板打开（事件总线 emit 或调 `window.__ryBomOpen()`），实现「切区块 + 开面板」一次点击双动作 |
| `core/event-bus.js`（如需） | 确认是否有可用事件（如 `bom-open-request`）——若已有通用 emit/on 机制则直接复用，否则在 material-list 直接调 bom 暴露的全局函数（不新增事件协议） |
| `sw.js` | 版本升至 `v393-bom-nav-merge`，CORE 白名单同步（bom/material-list 的 manifest+main 已在 CORE，若 main.js 有实质改动无需新增条目，但必须抬版本） |

**推荐依赖方向**：material-list → 调 bom（壳依赖面板），保持「bom 插件业务零改动」优先。具体二选一：
- **方案甲（推荐）**：bom 插件 activate 时暴露 `window.RyBomPanel = { open, close, toggle, isOpen }`；material-list 的 open() 里 `if (window.RyBomPanel) window.RyBomPanel.open()`。简单直接，同 index.html 页面内两个插件运行时序：material-list 与 bom 均由 loader 激活，无跨页。
- **方案乙**：事件总线。若 event-bus 已有通用通道且成本低则用；否则不必为合并引入新协议。

### 2.2 时序与边界（必须处理）

| 边界 | 处理 |
|---|---|
| 会员门控 | material-list 保留 `feat: bom-export` 门控（点击锁定走 showUpgrade）；bom 面板本身无门控（权限 read:*）——**合并后「材料清单」被锁 = 面板也不应打开**（在 material-list 的 gate 通过后才触发面板） |
| 面板独立开关 | 用户点「材料清单」开面板后，可单独点面板 × 关闭；再点导航重新打开——`openPanel()` 须幂等（已开则保持，未开则开） |
| 面板已开再点导航 | 保持打开 + 重新 generate（或仅 refreshArchives），不关闭（「点一次=打开视图，再点=刷新」优于 toggle 关闭，避免误关） |
| 页面区块与面板并存 | 两者不互斥：区块在主内容区，面板在右上角浮层，同屏不冲突。若视觉拥挤，可后续再议（本次不做布局改动） |
| deactivate 清理 | bom 的 unnav 引用改为可空（不注册则无注销）；material-list 的 open 里对 `window.RyBomPanel` 判空（bom 被全站关闭时静默跳过，不影响区块切换） |
| 直接 URL / 移动端 | `#detailsSection` 直链仍工作（material-list 的 ryJumpToSection 原样保留）；移动端语义不变（不额外处理） |

## 3. 验收标准（全绿才算完成）

1. **闸门**：`_gate_plugins.cjs` + `_smoke_plugins.cjs` + `verify_nav_compact.js` 全绿。**注意**：compact 闸门若断言「BOM 导出」导航项存在（WANT_ITEMS 或插件数），需先判期望值过期还是真回归——按闸门注释更新期望值（若 WANT_ITEMS 含 'BOM 导出' 改为不含，插件导航数从 13 减 1 或按实际）——**不允许删断言硬过**。
2. **手动验证（浏览器 console 脚本或人工）**：
   - 点导航「材料清单」→ 主程序切到 #detailsSection 区块 **且** BOM 面板自动展开（含当前设计图清单）
   - 面板 × 关闭 → 再点「材料清单」→ 面板重新打开
   - 导航中**不再出现**「BOM 导出」项（唯一入口）
   - 直接访问 `index.html#detailsSection` → 区块正常、面板不自动弹（直链语义）
   - 会员锁定态（`?env=online` 无权限）→ 点「材料清单」走升级引导，**面板不弹出**
3. **回归**：bom 面板三动作（生成/导出CSV/存入档案）逐一可用；material-list 的高亮联动（lightSelf/clearTap）正常；重渲染抑制器有效（权益就绪后无双入口复活）
4. `git diff --stat` 只含：plugins/bom/main.js、plugins/material-list/main.js、sw.js、（如涉及）core/event-bus.js

## 4. 红线（违反即失败）

- **不改 bom 的业务逻辑**（generate/render/exportCsv/saveIntoArchive 一行不动，只改「入口注册」与「暴露 open」）
- 不新增 localStorage 键、不引入新依赖、不改 core/loader 激活时序
- 不破坏会员门控三态 fail-open 语义
- 不 commit / 不 push / 不发布（沿用发布纪律）
- 自测脚本用完即删

## 5. 闸门红时的判定（重要）

- `verify_nav_compact.js` 若红：先判断是「期望值过期」（导航结构变化）还是「真回归」。期望值过期 → 按文件注释更新；真回归 → 修复后重跑。
- **特别提醒**：合并后插件导航项总数会变化（bom 不再注册导航），compact 闸门中若断言了具体插件导航数必须同步核对。
- 不得通过删断言/注释断言让闸门变绿。

## 6. 完成动作

1. 改完跑 §3 全部验收
2. 汇报：bom/material-list 各改了什么（精确到函数）、sw.js 版本、闸门结果与期望值 diff
3. 浏览器截图：点「材料清单」后的「区块 + 面板同屏」效果
4. 更新 `架构结构图.md`（§4 插件清单合并说明 + §10 变更记录追加 v393）
