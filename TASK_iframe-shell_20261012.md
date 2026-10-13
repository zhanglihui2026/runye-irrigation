# TASK_iframe-shell_20261012 —— 页面级外挂 iframe 壳（切换零重载）

> 执行者：Agent S2（外壳改造专项）
> 用户痛点：在线地图 / 地形模块 / 水力校核 三个页面级外挂每次切换都是整页跳转、脚本全重跑、状态全丢。
> 方案：主程序 index.html 作为唯一外壳，新增 iframe 视图容器；导航点击 = 显示/隐藏对应 iframe，**子页面常驻隐藏、切换零重载**。
> 关键红利（不可破坏）：同源 iframe 与主程序共享 localStorage——现有数据桥（runyeMeasuredArea / runyeSprinklerResult / runye_hydraulic_design_v1）**零改动照常工作**；独立页业务零改动。
> 依赖规范：`PLUGIN_DEV.md`（插件六条硬约束）、`架构结构图.md`（§4/§5 外挂形态）、现有闸门三件套。

---

## 0. 一句话目标

把 `runye-map-measure.html`、`terrain/index.html`、`runye-hydraulics.html` 三个独立页嵌进 index.html 的 iframe 视图容器，导航点击从「整页跳转」改为「切 iframe 显示」，主程序壳（导航/会员/插件体系）只加载一次，切页不再重载。**三个独立页文件本身零改动。**

## 1. 改什么（精确到文件）

| 文件 | 动作 |
|---|---|
| `index.html` | ① `<main>` 内新增 iframe 视图容器（3 个隐藏 iframe + 容器 div）；② 新增 `mod/inline-31.js`（或就近 inline 文件）实现视图切换 JS；③ `<script>` 引入 |
| `mod/inline-31.js`（新建） | iframe 壳核心：容器构建、懒加载、切换、数据桥保持、事件转发 |
| `runye-nav.js` | ITEMS 中 3 个 href 跳转项（在线地图/地形模块/水力校核）改为「切 iframe 视图」：不再 `location.href`，改为调 `window.RyFrameShell.show(pageId)` |
| `sw.js` | 版本升至 `v391-iframe-shell`，CORE 列表追加 `mod/inline-31.js`（必须抬版本） |

**禁止改动**：`runye-map-measure.html`、`terrain/`（三个文件）、`runye-hydraulics.html`、`plugins/`、`core/`、`runye-entitle.js`、`runye-nav.css`（除非绝对必要）。**三个独立页一行不改。**

## 2. iframe 壳设计（mod/inline-31.js）

### 2.1 容器结构（index.html 的 `<main>` 内追加）

```html
<div id="ryFrameShell" class="ry-frame-shell" hidden>
  <iframe id="frMap"    data-fr-page="online-map"    src="runye-map-measure.html"    hidden></iframe>
  <iframe id="frTerrain" data-fr-page="terrain"      src="terrain/index.html"         hidden></iframe>
  <iframe id="frHyd"     data-fr-page="hydraulics"   src="runye-hydraulics.html"      hidden></iframe>
</div>
```

- 容器定位：`position:fixed; inset:0; top:var(--fn-nav-h); z-index: 低于导航高于区块`；`#ryFrameShell` 显示时隐藏当前 `ry-sec.ry-active`，隐藏时恢复（**与区块切换互斥，不允许两个同时可见**）
- 样式内联在 index.html 或 style-01.css（类名 `ry-frame-shell` 前缀，不污染现有）

### 2.2 暴露全局 `window.RyFrameShell`（四个方法）

```js
window.RyFrameShell = {
  show(pageId),        // 'online-map' | 'terrain' | 'hydraulics'：懒加载对应 iframe → 显示 → 隐藏其他 iframe + 隐藏 ry-sec
  hide(),              // 收起壳，恢复当前 ry-sec.ry-active 区块
  isVisible(pageId),   // 查询某页当前是否显示（导航高亮用）
  pageId(),            // 当前显示的页（导航高亮 / 状态栏用）
  _byId(pageId)        // 内部：pageId → iframe 元素（供测试探针）
};
```

### 2.3 懒加载（首进才 load，之后常驻）

- iframe `src` 写在 HTML 上但**不加 `loading` 限制**；首次 `show()` 时若 `iframe.getAttribute('data-loaded')!=='1'` → 设 `data-loaded=1`（此时才真正触发网络加载），并 `try{ iframe.contentWindow.focus(); }catch(e){}`
- 之后切换只做 `display`，**不重设 src、不销毁 iframe**（常驻缓存 = 零重载的核心）
- 内存/标签页语义：iframe 常驻可接受（三个页面均为中型，PWA 已全量预缓存）；若实测内存压力大，可对最不常用的页在 `hide()` 后置 `display:none` 但不销毁

### 2.4 数据桥（零改动，但必须验证）

- **同源 iframe 与主程序共享 localStorage**——三个桥键必须照常读写：
  - `runyeMeasuredArea`：地图页写入 → inline-16（主程序）消费
  - `runyeSprinklerResult`：terrain 写入 → plugins/sprinkler 消费
  - `runye_hydraulic_design_v1`：主程序写入 → 水力页消费
- **不得引入 postMessage 桥**——同源 localStorage 已够；若发现某键读不到（跨 iframe 时序问题），先查 iframe 是否真的同源（`file://` 下同源策略按 file 允许，线上 https 同源）再决定
- 会员/插件体系全在主程序壳，iframe 内页**不重复初始化**（它们本来就是独立页，保持原样）

### 2.5 导航联动（runye-nav.js 最小改动）

- ITEMS 中三个页的条目**不改结构**（label/feat/href 保留，href 留作兜底/深链）
- 点击处理：给这三项加 `data-fr-page` 标记；点击时 `if (window.RyFrameShell && !locked) { e.preventDefault(); RyFrameShell.show(pageId); }`
- **会员门控不变**：locked 判定照旧（gate(feat)），锁定时不切 iframe、走 showUpgrade（与现有行为一致）
- 高亮：当前显示 iframe 对应导航项加 `active`（复用现有 `.fn-link.active` 语义）
- **兜底**：`RyFrameShell` 不存在（脚本未加载/出错）→ 走原 `location.href` 整页跳转（入口不能丢，fail-open）

### 2.6 边界语义（必须处理）

| 边界 | 处理 |
|---|---|
| 直接 URL 访问三个独立页 | 完全正常（独立页本来就是完整页面，不依赖主程序） |
| iframe 内页的 `data-root="../"`（terrain） | 不变——terrain/index.html 自己声明的 root 只影响**它内部**的相对链接，与是否被 iframe 无关 |
| iframe 内页滚动/缩放 | 各自内部滚动条照常；主程序不干预（不套外层滚动） |
| 状态栏 | `ryStatusBar` 显示当前页名（可选增强，不做也行） |
| 打印 | iframe 内容打印为浏览器原生行为，**本任务不处理**（如需在 §9 记录） |
| 全屏/弹窗（AI 规划 win:1） | 不受影响——智能规划仍是独立窗口，不纳入 iframe 壳 |
| 移动端（≤768px 手机预览重定向） | 保持现状：`RyMobile.isActive()` 时三个导航项照旧走移动端逻辑（iframe 壳只服务桌面），见 §4 红线 |

## 3. 验收标准（全绿才算完成）

1. **闸门**：`_gate_plugins.cjs` + `_smoke_plugins.cjs` + `verify_nav_compact.js` 全绿（smoke 会因导航行为变化可能需同步断言——**若闸门红，先判断是"期望值过期"还是"真回归"，期望值过期按 §5 处理，真回归必须修**）
2. **新功能自测**（写 `_diag_frame_shell.cjs` 或浏览器 console 段，用完即删）：
   - `RyFrameShell.show('online-map')` → 地图 iframe 可见、其他隐藏、当前 `ry-sec.ry-active` 隐藏；`pageId()==='online-map'`
   - 再 `show('terrain')` → 地图隐藏、terrain 可见（**iframe 未销毁**：`data-loaded===1` 且 display 切换）
   - `hide()` → 壳隐藏、原 ry-sec 恢复
   - `show()` 同一页两次 → 幂等不重载（`contentWindow.location` 不重置）
   - 导航点击「在线地图」→ 触发 `RyFrameShell.show` 而非 `location.href`（拦截验证）
   - locked 项点击 → 不切 iframe、走升级引导
3. **数据桥验证**：
   - 地图页画一块地 → 回传主程序（inline-16 消费 runyeMeasuredArea）链路仍通
   - terrain 页估算喷灌 → `runyeSprinklerResult` 出现 → 主程序 sprinkler 插件面板能读到
   - 主程序算水力 → 水力页能读到 `runye_hydraulic_design_v1`
4. **回归**：主程序 7 个 hash 区块切换不受影响；智能规划独立窗口不受影响；移动端预览不受影响
5. `git diff --stat` 只含：`index.html`、`mod/inline-31.js`（新）、`runye-nav.js`、`sw.js`、自测脚本

## 4. 红线（违反即失败）

- **三个独立页文件一行不改**（runye-map-measure.html / terrain 三件 / runye-hydraulics.html）
- 不引入 postMessage 桥（localStorage 同源已够）；不新建 localStorage 键
- 不破坏会员门控（locked 判定、showUpgrade、三态 fail-open 全保留）
- 不破坏插件体系（core/loader、plugins.json、sprinkler 插件消费链路）
- 移动端语义不动：`RyMobile.isActive()` 时三个导航项照旧走移动端逻辑（手机预览重定向），iframe 壳只服务桌面
- 不 commit / 不 push / 不发布（沿用 AGENT_HANDOFF 纪律）
- 自测脚本用完即删，不留垃圾

## 5. 闸门红时的判定（重要）

- `verify_nav_compact.js` 的 D/M 系断言若红，**先看是期望值过期还是真回归**：期望值过期（如导航行为变化导致面板项/插件数变化）→ 按该文件注释更新期望值；真回归 → 修复后重跑
- 若因 iframe 导致 smoke 的「页面运行期异常」断言红 → 优先排查 iframe 加载时序（如 map 页在壳内初始化报错），修复后重跑
- **不得**通过删断言/注释断言让闸门变绿

## 6. 完成动作

1. 改完跑 §3 全部验收
2. 汇报：改了哪几行（runye-nav.js 精确到行）+ 新增 inline-31.js 职责 + 验收结果 + 闸门 diff 说明（若期望值更新，列出改了哪些期望）
3. 浏览器手动验证截图：切「在线地图」不刷新主程序（DevTools Network 面板只有 iframe 首载、无整页导航）、切回主程序区块状态保留
4. **同时**：更新 `架构结构图.md`（§4/§5 加 iframe 壳说明 + §10 变更记录追加一条 v391）
