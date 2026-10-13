# TASK_file-menu-complete_20261012 —— 导航「文件 ▾」统一导入/导出入口（重做完善版）

> 执行者：Agent（导航整合专项）
> 用户诉求：**导航栏增加一个「文件」入口，所有可导入/导出的功能都收进这个入口执行**（地图导入导出格式、最终图纸导出、工程文件、BOM 等），**文件折叠成菜单**，所有导入导出按钮都在「文件」菜单里。
> 背景：v399 已有一版「文件 ▾」菜单（提交 ad2714b 已推送线上），但用户验收后判定**完成质量不佳**，要求按本指令重做/完善。
> 本指令是**唯一执行依据**：先读现状 → 找差距 → 按本指令要求完善 → 跑全部验收 → 汇报。

---

## 0. 一句话目标

导航右侧「📂 文件 ▾」折叠菜单作为**全站唯一的导入/导出统一入口**：主程序内动作直接执行；独立页（地图/地形）动作经 iframe 壳 `RyFrameShell` 切页后远程触发。菜单按 导入 / 导出 / 工程 分组，全部可导入导出功能收齐、可点击、可触发、无空转。

## 1. 现状盘点（已核实，勿推翻；以实际代码为准复核）

### 1.1 已存在的 v399 文件菜单（本次完善的基础）
| 文件 | 内容 |
|---|---|
| `index.html` | 导航区静态块 `#fnFileMenu`（按钮 `#fnFileBtn` + 面板 `#fnFilePanel`，在 ⚙️设置 左侧，order 998）；`<script src="mod/inline-32.js?v=395">` 已引入 |
| `mod/inline-32.js`（新建）| 菜单构建 + 动作分发：GROUPS 三组（导入/导出/工程）16 项；`ACTIONS` 分主程序直调（`runyeDxf.export()`、`RyIsoDiagram.downloadSVG()`、headModal、`runyeSaveProject()`/`runyeLoadProject()`）+ 跨 iframe 触发（`RyFrameShell.show(page)` → `contentWindow` 按钮 click）；`W.RyFileMenu={open,close,toggle,isOpen}` |
| `runye-nav.css` | 独立 `.fn-file` 面板皮肤（**不复用 .fn-more**——之前误用导致 verify 的 `.fn-nav .fn-more-panel` 选择器量到 hidden 面板全红，已修） |
| `sw.js` | VERSION=`v399-file-menu`；CORE 已登记 `mod/inline-32.js` |
| `架构结构图.md` | §10 已追加 v399 记录 |

### 1.2 全站导入/导出功能点（必须全部收进文件菜单）
| 功能 | 位置 | 触发方式 |
|---|---|---|
| 导入地块（GeoJSON/KML/KMZ/奥维）| runye-map-measure.html | `#btnImport` → `#fileImport`（accept 含 .geojson,.json,.kml,.ovkml,.kmz；KMZ 已支持）|
| 导出工程（.runye.json）| runye-map-measure.html | `#btnExportProj` |
| 导入工程（.runye.json）| runye-map-measure.html | `#btnImportProj` → `#fileProj` |
| 导出地块 GeoJSON | runye-map-measure.html | `#btnGeoJSON` |
| 导出地块 KML | runye-map-measure.html | `#btnKML` |
| 导入 IRRICAD（粘贴/文件）| index.html 经济指标区 | `#icImportBox`（textarea）+ `#icImportBtn` + `#icFileInput` |
| 导入地形 shp 边界 | terrain/index.html | `#fileSHP`（hidden input）|
| 导入地形 RTK 边界 CSV | terrain/index.html | `#fileBoundaryCSV` |
| 导入地形 RTK 高程 CSV | terrain/index.html | `#fileElevCSV` |
| 坐标系 .prj 校验 | terrain/index.html | `#filePRJ` |
| 导出 CAD DXF | index.html | `window.runyeDxf.export()`（按钮 `#tlDxfExport`）|
| 导出轴测图 SVG | index.html | `window.RyIsoDiagram.downloadSVG()`（按钮 `#tlIsoDownload`）|
| 导出系统图 SVG/PNG/打印 | index.html | headModal 内 `#hmExportSVG`/`#hmExportPNG`/`#hmPrint`（打开入口 `openTlSystemDiagramFromNav()`）|
| 导出 BOM 清单 CSV | plugins/bom | BOM 面板内按钮（`window.RyBomPanel.open()` 打开面板）|
| 导出等高线高程点 CSV | plugins/contour-dxf | 面板内 `#bCSV` 按钮（**未暴露全局**，本次需决定接入方式）|
| 保存项目 | index.html | `window.runyeSaveProject()` |
| 载入项目 | index.html | `window.runyeLoadProject()` |

### 1.3 关键机制
- **iframe 壳**：`mod/inline-31.js`（v392）暴露 `window.RyFrameShell={show,hide,isVisible,pageId,_byId}`；frames 有 `online-map`（runye-map-measure.html）/`terrain`（terrain/index.html）/`hydraulics`；`show(page)` 懒加载后常驻；`mobile()` 时返回 false（移动端不切 iframe）。
- **锁定判定**：`RyFrameShell.show()` 内部有 `allowed(feature)`（feature 映射：online-map→'online-map'、terrain→'pro-others'、hydraulics→'hydraulic-check'）；文件菜单触发独立页动作时**必须走同一锁定判定**，被锁则弹会员升级提示而非空转。
- **verify 隔离**：`.fn-nav .fn-more-panel` 选择器会被任何带 fn-more-panel class 的面板干扰（v399 已踩坑）——文件菜单面板**必须保持独立 class**（现为 `.fn-file-panel`）。

## 2. 用户要求的执行目标（本次完善要点）

### 2.1 入口形态
- 导航右侧「📂 文件 ▾」按钮 + 折叠面板（现状已具备，保留）。
- 面板打开：点击按钮；关闭：点外部 / Esc / 点面板内任意项（现状已具备）。

### 2.2 菜单内容（分组完整、无遗漏、无空转）
- **导入组**：地块文件（地图页）、工程文件（地图页）、IRRICAD 数据（主程序）、地形 shp 边界（terrain）、地形 RTK 边界 CSV（terrain）、地形 RTK 高程 CSV（terrain）、坐标系 .prj（terrain）。
- **导出组**：CAD 图纸 DXF（主程序）、轴测图 SVG（主程序）、系统图 SVG/PNG（主程序）、地块 GeoJSON（地图页）、地块 KML（地图页）、BOM 清单 CSV（BOM 插件）、等高线高程 CSV（contour-dxf 插件）。
- **工程组**：保存项目（主程序）、载入项目（主程序）、导出工程文件（地图页）。

### 2.3 动作分发（核心质量要求）
1. **主程序内动作**：直接调用对应全局函数/按钮（现状已具备）。需补：BOM 导出（打开 BOM 面板并提示在面板内导出，或如果 RyBomPanel 已暴露 open 则直开）、等高线导出（决定：若 contour-dxf 暴露全局则直调；否则打开 contour-dxf 面板并聚焦其 CSV 按钮）。
2. **独立页动作**：`RyFrameShell.show(pageId)` 切页 → 等 iframe load 完成（懒加载首进需等 load 事件；已加载则短延时）→ 在 `contentWindow` 里触发对应按钮 click → 收起面板。**必须处理**：
   - `show()` 返回 false（移动端/无壳/锁定）时给明确提示；
   - 触发失败（页面未就绪/按钮缺失）时 toast 提示"请在该页面手动操作"而非静默；
   - 锁定（会员门控）时弹升级提示（复用 `RyMemberUI.showUpgrade` 或 ry-nav-toast），**不得绕过**。
3. **低配降级**：文件菜单整体不可用时（脚本缺失/壳缺失），原页面按钮必须保持可用（**不要删除任何原入口按钮**，见 2.4）。

### 2.4 原入口去留（重要决策）
- **双入口暂保留**：各页原有导入导出按钮**全部保留**（文件菜单先建起来，不删原按钮，避免改动面过大和功能回退风险）。用户后续确认收敛后再统一隐藏。
- 文件菜单是"统一入口"而非"唯一入口"——本次目标是**收齐 + 可触发**，不是删原按钮。

### 2.5 未就绪/低频项
- 等高线高程 CSV 导出：**必须收进菜单**（contour-dxf 已上线 v398，功能真实存在）。接入方式见 2.3。
- 不做导出 KMZ（用户明确只做导入）。

## 3. 验收标准（全绿才算完成）

1. **真实浏览器（puppeteer-core + Edge，入口 `index.html?full=1&rymock=L2`）**：
   - 导航可见「📂 文件 ▾」，点击展开，分组标题=导入/导出/工程，共 16 项（7 导入 + 7 导出 + 3 工程，见 2.2）；
   - 点击主程序动作（DXF/轴测图/系统图/保存/载入）→ 对应函数被调用（用 page.exposeFunction 或 DOM 观测验证，非只看不报错）；
   - 点击地图页动作（地块文件/GeoJSON/KML/工程导入导出）→ iframe 切到地图页且对应按钮被触发（观测 `#btnImport` 等是否收到 click——可在 contentWindow 里加临时监听或检查 file input 是否被 click）；
   - 点击地形动作 → iframe 切到地形页且 `#fileSHP` 等被触发；
   - 锁定路径：在 `?rymock=lock` 或未解锁态下点击被锁的独立页动作 → 弹升级提示且不触发按钮；
   - 点外部 / Esc → 面板收起；点面板项 → 面板先收起再执行动作。
2. **闸门全绿**：`verify_nav_compact.js`（注意：该文件被 .gitignore 忽略不入库，但必须本地跑绿；D 项老导航 11 项含「📂 文件 ▾」）、`_smoke_plugins.cjs`（端口 8124，跑前确认无残留进程占用）。
3. **回归**：地图页/地形页原有导入导出按钮照常工作（不删不改原有 onclick 绑定）；主程序 DXF/轴测图/系统图/保存/载入原按钮照常。
4. **无 pageerror**：浏览器控制台零错误。
5. `sw.js`：如改动 inline-32.js 或新增文件，版本抬一档（当前 v399 → v400-xxx）并更新 CORE；沿革注释追加。
6. `架构结构图.md`：§10 追加本次变更记录。

## 4. 红线（违反即失败）

- **不删任何原有导入导出按钮**（双入口保留原则）；
- **不改 runye-nav.js 的 ITEMS/MOUNT 机制**（文件菜单是静态块 + inline-32.js，不参与导航重建；不得往 ITEMS 里加文件菜单项）；
- **文件菜单面板保持独立 class `.fn-file-panel`**，严禁再挂 `fn-more-panel` class（verify 干扰已踩坑）；
- **不绕过会员锁定**：独立页动作触发前必须走 `RyFrameShell` 的锁定判定；
- 不新增 localStorage 键（工程/地块数据仍走既有通道）；
- 不引第三方库；
- 不 commit / 不 push（执行完汇报，由用户决定提交）；
- 等高线 CSV 若 contour-dxf 未暴露全局，**不得改插件内部逻辑**（插件业务零改动原则）——用"打开 contour-dxf 面板 + 聚焦导出按钮"的方式接入，或提示用户在该面板操作。

## 5. 执行步骤建议（非强制，可自行优化）

1. 读现状：`mod/inline-32.js`、`index.html` 导航区、`mod/inline-31.js`、`runye-nav.css` 的 .fn-file 段、`plugins/bom/manifest.json+main.js`（RyBomPanel 是否暴露）、`plugins/contour-dxf/main.js`（CSV 导出按钮 id）；
2. 对照 2.2 清单检查现有 16 项是否有遗漏/空转；重点补 BOM 导出、等高线 CSV 的接入；
3. 完善独立页动作的锁定判定与失败提示；
4. 跑 §3 全部验收（重点：真实点击验证触发，而非仅页面无错）；
5. 输出：改了什么（精确到文件/函数）、验收矩阵结果、截图（文件菜单展开 + 地图页被触发后）、遗留问题。

## 6. 完成动作

1. 跑 §3 验收全绿；
2. 汇报改动清单 + 验收证据 + 截图；
3. **不提交不推送**，等用户确认。
