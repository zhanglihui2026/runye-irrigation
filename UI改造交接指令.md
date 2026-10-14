# 润野灌溉 · UI 改造交接指令

> 生成日期：2026-10-14 ｜ 交接方：豆包助手（历史会话）
> 接收方：后续负责「润野灌溉 UI 改造」的 agent / 开发者
> 目的：让接手的你**无需重新探索**，直接按本文档推进。所有商议结论、定稿样式、工具、真实项目当前状态、落地路线、风险红线已在此一次性交代清楚。

---

## 0. 一句话背景

「润野灌溉」是**纯原生多页 PWA**（无 React/Vue/Angular，无 npm 构建，`index.html` 直接引入 100+ 全局 `<script>`/`<link>`，手工 `?v=` 版本号），功能完整但界面陈旧。用户对界面不满，希望整体 UI 现代化，并已定稿一套**深墨绿品牌色 + 紧凑面板**的视觉方向，且已接受 Shoelace（Web Components）作为控件方案。**当前处于"真实项目改造"阶段：品牌色深墨绿已落地到全局 token，面板结构改造尚未开始。**

---

## 1. 定稿视觉标准（最高优先级，不可偏离）

### 1.1 品牌色：深墨绿（与顶部导航同源）

用户明确否掉过**两次亮绿**（`#22c55e`/`#16a34a` 系），最终定稿为**深墨绿 `#173e32`**（PIL 从用户参考图精确提取，不是近似色）。**"所有蓝色都要改成绿色，按钮/底色/字体都要绿，且要用深墨绿"。**

已在 `runye-theme.css` 落地（**已生效，勿再改回亮绿**）：

| 变量 | 现值 | 说明 |
|---|---|---|
| `--ry-green-50/100/200` | `#f0fdf4/#dcfce7/#bbf7d0` | 浅绿底（hover/底色，保留）|
| `--ry-green-500` | `#1d4d3e` | |
| `--ry-green-600` | **`#173e32`** | 主色（主按钮/表格头/链接/条带）|
| `--ry-green-700` | `#14532d` | hover |
| `--ry-green-800` | `#123026` | |
| `--ry-green-900` | `#0f2a20` | |
| `--ry-success` | `#14532d` | 成功态对齐深墨绿 |
| `--ry-info` | `#173e32` | 原蓝 `#2563eb` 已改（死变量，0 引用）|
| `--ry-btn-shadow` | `rgba(23,62,50,.25)` | |

**⚠️ 数据语义色保留**：`terrain/terrain.css:359` 的等高线图例渐变蓝（`#2563eb→#06b6d4→#22c55e→#eab308→#f97316→#dc2626`）是**高程数据可视化语义**，不是品牌蓝，**禁止改**。

### 1.2 侧边工具面板：紧凑分组（定稿样板）

定稿样板：`C:\Users\AHS\Doubao\chats\2026-10-14\new-chat\runye-param-panel\侧边工具面板_紧凑分组样板\侧边工具面板_紧凑分组样板.html`
（文件内已含全套深墨绿 + 紧凑布局，可直接打开看最终观感）

已确认的紧凑参数（用户逐项拍板，勿改）：

| 项 | 值 |
|---|---|
| 顶部导航高 | 48px |
| 面板标题栏高 | 36px |
| 分组标题 padding | 2px |
| 行高 | 26px |
| 行左右留白 | 12px |
| 按钮区间隔 | 3px |
| 工作区外边距 | 4px |
| 工具栏条 | 3px |
| 底部分隔 | 6px |
| 导航与内容间 | 3px |
| 滚动条 | 4px 半透明（`scrollbar-width:thin` + webkit 4px，轨道透明，圆角丸，无箭头）|
| 拖宽条（grip）| 视觉条 2px，热区 14px |
| 属性查看器与导航间距 | 3px |
| 单位标注 | `white-space:nowrap; flex:none`，输入框收缩而单位保持同行（260px 窄面板实测 OK）|

**拖动条 hover 色**：定稿为深墨绿 `--ry-green-600`（用户明确"跟导航一样深墨绿"）。

---

## 2. UI 面板体系规范（v1，已归纳真实项目）

完整规范见 `C:\Users\AHS\runye-irrigation\UI面板设计规范.md`。核心结论：

### 2.1 七族面板（A–G）

| 族 | 名称 | 常驻？ | 可折叠 | 可拖 | 记忆 | 典型实例 |
|---|---|---|---|---|---|---|
| A | 四周固定条带 | 常驻 | 部分 | 否 | 否 | 顶导航/工具轨/左栏/状态栏 |
| B | 侧边面板 | 常驻 | ✅ | 拖宽 | 宽度 | 参数/结果/图层/分组面板 |
| C | 悬浮面板 | 触发 | ✅ | 拖动 | 位置+折叠 | 分区角度/AI 智能规划 |
| D | 右键弹出 | 触发 | 否 | 否 | 否 | 图元右键/节点配件/管径面板 |
| E | 模态对话框 | 触发 | 否 | 否 | 否 | 设置/会员/登录 |
| F | 轻提示 | 瞬时 | 否 | 否 | 否 | Toast/状态徽章 |
| G | 现代工具面板 | 触发 | 属性检查器可折叠 | 属性检查器可拖宽 | 宽度 | **属性检查器/命令面板（项目当前缺失，属新增）** |

**统一前缀 `ryp-`**（Runye Panel）：`ryp-card`/`ryp-titlebar`/`ryp-fold`/`ryp-grip`/`ryp-body`/`ryp-band`/`ryp-float`/`ryp-menu`/`ryp-modal`/`ryp-toast`/`ryp-inspector`/`ryp-palette`。

**通用 token**（§1 建议追加到 `runye-theme.css`）：`--ry-panel-bg`/`--ry-panel-border`/`--ry-panel-head-h:44px`/`--ry-panel-fold-w:28px`/`--ry-panel-grip-w:6px`/`--ry-panel-sidebar-w:280px`/`--ry-panel-result-w:300px`。

**z-index 阶梯**（总表）：工具轨 100 / 侧边 110 / 悬浮 200 / 右键 300 / 命令 350 / 模态 400 / Toast 500。

**通用交互库**（治本）：落成一个 `mod/ry-panel.js`，导出三函数 `rypCollapsible(rootEl)` / `rypResize(rootEl)` / `rypDraggable(rootEl)`，末尾 `rypInitAll(document)` 扫描 `[data-ry-panel]`。折叠/拖宽/拖动**只实现一次**，替换各处手动实现。空值守卫：元素缺失即 `return` 不抛错。

### 2.2 待决/未定（接手时需与用户确认）

- 规范 §9：**全量 7 族一次迁移，还是先试点 `#ryAnglePanel` + 参数面板验证规范**（建议先试点）
- 是否补 **G 族（属性检查器 + 命令面板）**——项目当前无，属新增能力，需用户拍板是否引入
- **AI 智能规划大悬浮窗**：用户已定**不删除、不隐藏、暂不处理**（它连主页面智能规划链路，删会影响 5 处依赖：`window.RyAiPlan` 被 runye-nav.js、runye-entitle.js、plugins/ai-plan/main.js、runye-case-library.js、sw.js 引用）。**保持现状，不动。**

---

## 3. 技术选型与工具（已定，勿推翻）

### 3.1 技术栈

- **控件库：Shoelace（Web Components）** —— 已被用户接受（三页面样板）。CDN 用 jsDelivr：`https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.15.1/cdn/...`。
- **CSS 框架：Bulma 已被用户否**（"刚才的不怎么样"），**不要再用 Bulma**。
- **品牌化 Shoelace**：必须覆盖 `--sl-color-primary-50..950` 全套 CSS 变量 + `--sl-color-primary-text:#fff` + `--sl-focus-ring-color:rgba(23,62,50,.35)`，否则默认蓝色残留（用户会抓）。
- **前端框架**：用户曾问 React/Vue，但项目是纯原生多页，**阶段一/二用原生 + Shoelace，不引入框架**；阶段三才考虑 Vue3（见 §5）。

### 3.2 已知坑（必看，避免重踩）

- **PWA 缓存**：改 CSS/JS 后**必须**同时升 `index.html` 里的 `?v=` 和 `sw.js` 的 `VERSION`（当前 `v427-deepgreen-brand`），否则 Service Worker cache-first 供旧缓存，用户"看不到效果"。这是历史踩过的根因。
- **Shoelace 初始化**：内联脚本须等 `customElements.whenDefined(...)` 再初始化，否则滑块/开关读数为空导致计算错（NaN bug）。
- **图标缺失**：Shoelace 2.15.1 无 `enter`/`minus`/`vector-square`/`arrow-expand`/`folder-open` 图标（404），用替代名（`arrow-return-left`/`dash`/`square`/`arrows-expand`/`folder`）。
- **sl-input 不填满父容器**：须设 `--input-width:100%`。
- **theme.css 注释警告**：**不得设 `scrollbar-width` 标准属性**，否则 Chrome 忽略 `::-webkit-scrollbar` 自定义。
- **导航**：顶部导航在 `runye-nav.css`，`--u-nav:#173e32` 已是深墨绿，**无需改**。
- **闸门契约**：`expand_index.cjs` 依赖 index.html + mod 外链的文本契约，**不可改动** mod 外链引用方式。
- **环境**：Windows 会话无 Bash（用 PowerShell）；复杂逻辑下沉 Python 显式 `utf-8`；shot.py 因 playwright 未装降级 Edge CLI（长页只截首屏）。
- **发布纪律**：架构图 §9，线上 GitHub Pages 为老版本，**未经用户明确"发布"不得推送**。

---

## 4. 当前真实项目状态（2026-10-14 快照）

### 4.1 已落地（本次会话完成，勿回滚）

| 文件 | 改动 | 状态 |
|---|---|---|
| `runye-theme.css` | 品牌色深墨绿化（§1.1 全部 token）| ✅ 已生效 |
| `index.html` | `runye-theme.css?v=1`→`?v=2` | ✅ 已升 |
| `sw.js` | VERSION `v426-...`→`v427-deepgreen-brand` | ✅ 已升 |
| `架构结构图.md` | 变更记录已追加（深墨绿落地 + 阶段二方案未执行）| ✅ 已记 |

### 4.2 未动（现状保持）

- 顶部导航（本就深墨绿）
- 所有页面结构 / JS / 插件 / 闸门脚本
- AI 智能规划悬浮窗（用户定：暂不处理）
- `terrain.css` 等高线渐变蓝（数据语义色）

### 4.3 真实项目改造的注意点

**用户对"直接改真实项目全局 CSS"一度强烈不满**（历史教训：改 theme.css 后因缓存看不到效果、以为改乱了）。接手后：
- 改真实项目前**先备份**到 `_backup_*/`（项目有 `_backup_*`/`_patch_*` 惯例）
- 每步改完**必升 `?v=` + sw.js VERSION**，并明确告诉用户刷新方式（Ctrl+Shift+R / 无痕窗口 / Unregister SW）
- **小步推进，一次一项**，让用户逐步验收，不要一次大改

---

## 5. 落地路线（三阶段，已商定）

### 阶段一：界面样板（已完成 ✅）
已产出 12 个独立自包含样板（见 §6），用户已验收：深墨绿品牌色、侧边工具面板紧凑分组定稿。

### 阶段二：npm + Vite 工程化（方案A，已出文档未执行）
详见 `阶段二_Vite接入方案.md`。要点：方案A = **Vite 仅本地预览、发布链路不变、零侵入**（不改 index.html 的 mod 外链/`?v=`/全局 script）。**当前被用户搁置**，理由是"先把样式改进去再商量"。接手时若用户仍搁置，**不要擅自执行 Vite 安装**。

### 阶段三：Vue3 组件化（远期）
用户曾问"将来要更专业更复杂、加很多功能用哪种方式更好"，已答**Vue3 组件化**。这是远期目标，非当前重点。迁移路线见阶段二文档 §5（M1 预览跑通→M2 逐页冒烟→M3 ESM 试点→M4 阶段三入口）。

---

## 6. 样板文件清单（历史产物，可作视觉基准）

全部在 `C:\Users\AHS\Doubao\chats\2026-10-14\new-chat\runye-param-panel\`：

| 文件 | 状态 |
|---|---|
| `侧边工具面板_紧凑分组样板\侧边工具面板_紧凑分组样板.html` | **定稿**（族B 紧凑分组，最高优先参照）|
| `细化样板_族A-D-G2\细化样板_族A-D-G2.html` | 族 A/D/G2 协同样板，已交付 |
| `属性检查器_规范Shoelace样板\属性检查器_规范Shoelace样板.html` | 族 G1 属性检查器，已交付 |
| `层级阶梯_规范Shoelace样板\层级阶梯_规范Shoelace样板.html` | z-index 六层演示，已交付 |
| `重构样板_三页面\管线规划_Shoelace样板.html` 等 3 个 Shoelace | 已接受 |
| `重构样板_三页面\*_Bulma样板.html` 等 3 个 Bulma | **被否，勿参考** |
| `灌溉参数面板优化样板.html` / `_shoelace.html` | 早期对比，可参考 |

**注**：所有样板均为独立自包含 HTML，**从未写入真实项目**。真实项目改造时，应从定稿样板提取样式/结构，小步搬到真实项目，而非直接复制整页。

---

## 7. 接手后的推荐执行顺序

1. **读本文档 + `UI面板设计规范.md` + 定稿样板**，建立全貌（无需重新探索）。
2. **确认真实项目现状**：读 `runye-theme.css`（应已是深墨绿）、`sw.js` VERSION、`index.html` ?v=，与 §4.1 核对。
3. **与用户确认范围**：规范 §9 待决项——先试点 `#ryAnglePanel` + 参数面板，还是全量；是否补 G 族。
4. **推进真实项目面板改造**：追加 `--ry-panel-*` token → 建 `mod/ry-panel.js` 交互库 → 试点改造 → 逐个套用（每步升版本号 + 跑 `verify_*.cjs` 回归 + 更新架构图变更记录）。
5. **用户"先歇一下"或"先做样板预览"时**：尊重，不擅自动真实项目。

---

## 8. 红线（触碰即失败）

- ❌ 改回亮绿主色（用户两次否决）
- ❌ 用 Bulma（被否）
- ❌ 改 `expand_index.cjs` 依赖的 mod 外链文本契约
- ❌ 删除/隐藏 AI 智能规划悬浮窗（用户定：暂不处理）
- ❌ 改 `terrain.css` 等高线渐变（数据语义色）
- ❌ 未经用户明确"发布"就推送 GitHub Pages
- ❌ 改真实项目 CSS 后不升 `?v=` + sw.js VERSION（用户看不到效果 → 以为改乱）
- ⚠️ 用户偏好：项目涉及架构变动的任务完成后，必须同步更新根目录「架构结构图.md」变更记录章节
