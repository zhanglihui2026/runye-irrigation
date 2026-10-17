# 润野灌溉・UI 面板设计规范（v1）

> 本文档基于
> `index.html`
> /
> `runye-map-measure.html`
> /
> `runye-ai-plan.js`
> /
> `mod/plot-editor.js`
> /
> `tl-workspace`
> 的真实结构归纳，把项目里全部面板形态统一为一套可复用组件规范。
> 目标：
> **样式语言统一 + 交互（折叠 / 拖拽 / 记忆 / 层级）逻辑统一**
> ，治本于 "每个面板各自为政" 的现状。
> 现状结论：面板类型已齐全（6 族），缺的是统一规范。本文档只定规范、不迁移代码；落地时再按 "规范组件 → 逐个页面套用" 推进。



***

## 0. 六族面板总览



| 族 | 名称     | 常驻？ | 可折叠？     | 可拖动？     | 位置记忆？     | 典型实例                    |
| - | ------ | --- | -------- | -------- | --------- | ----------------------- |
| A | 四周固定条带 | 常驻  | 部分       | 否        | 否         | 顶导航 / 工具轨 / 左栏 / 状态栏    |
| B | 侧边面板   | 常驻  | 可折叠      | 可拖宽      | 宽度记忆      | 参数面板 / 结果面板 / 图层 / 分组面板 |
| C | 悬浮面板   | 触发  | 可折叠      | 可拖动      | 位置 + 折叠记忆 | 分区角度 / AI 智能规划          |
| D | 右键弹出   | 触发  | 否        | 否        | 否         | 图元右键 / 节点配件 / 管径面板      |
| E | 模态对话框  | 触发  | 否        | 否        | 否         | 设置 / 会员 / 登录            |
| F | 轻提示    | 瞬时  | 否        | 否        | 否         | Toast / 状态徽章            |
| G | 现代工具面板 | 触发  | 属性检查器可折叠 | 属性检查器可拖宽 | 宽度记忆      | 属性检查器 / 命令面板            |

**设计原则（跨族统一）**：



1. 同一件事只有一种做法 —— 折叠、拖拽、记忆各有且仅有一个通用实现。

2. 视觉语言来自现有 `--ry-*` token，新增 `--ry-panel-*` 专属 token，不新造色板。

3. 键盘可达 + 热区分双阈值 + 深浅色自动适配（沿用 `runye-theme.css` 的 `data-theme` 机制）。
   * **桌面（鼠标）≥ 28px**：`height` / `min-height` 不低于 28px，图标按钮不小于 24×24。
   * **触屏（`@media (pointer:coarse)`）≥ 44px**：所有可点元素升到 44px。
   * 例外：面板标题栏（`--ry-panel-head-h`）恒为 44px——它同时是拖拽/折叠把手。
   * ⚠ 原「全站 44px 最小热区」在桌面是纸面条款：v530 实测可见可点元素 44 个里 42 个 < 44px
     （导航 36、弹窗按钮 29、面板按钮 24）。硬拉 44 会让桌面版显著变松散，故改为双阈值，
     与「同一件事只有一种做法」不冲突：**同一个元素不同输入方式不同尺寸**。



***

## 1. 通用 token（新增，追加到 `runye-theme.css`）



```
:root{
  /* 面板外壳 */
  --ry-panel-bg:var(--ry-s-100);          /* 面板底色，跟随主题 */
  --ry-panel-border:var(--ry-s-300);
  --ry-panel-radius:0px;                   /* [v530] 全站扁平：style-01.css:3017
                                              body,body *{border-radius:0!important} 是唯一执行者，
                                              面板不声明圆角；仅圆点语义（border-radius:50%）豁免 */
  --ry-panel-shadow:var(--ry-shadow-md);
  /* 标题栏 */
  --ry-panel-head-h:44px;                  /* 标题栏高 = 最小热区高（唯一定义在 ry-panel.css 顶部 :root） */
  --ry-panel-head-bg:var(--ry-s-200);
  --ry-panel-head-fs:14px;
  --ry-panel-head-weight:600;
  /* 折叠 */
  --ry-panel-fold-w:28px;                  /* 折叠细条/箭头区宽 */
  --ry-panel-fold-arrow:16px;
  /* 拖拽条 */
  --ry-panel-grip-w:6px;                   /* 拖拽手柄宽 */
  --ry-panel-grip-hot:12px;                /* 命中热区宽 */
  --ry-panel-grip-color:transparent;
  --ry-panel-grip-hover:var(--ry-info);    /* 悬停高亮 */
  /* 尺寸 */
  --ry-panel-sidebar-w:280px;              /* 左侧栏默认宽（同 --ry-toolbar-w） */
  --ry-panel-result-w:300px;               /* 右侧结果面板默认宽 */
  /* 层级（z-index 阶梯，见 §7） */
  --ry-z-toolbar:100; --ry-z-sidebar:110; --ry-z-float:200;
  --ry-z-rightclick:300; --ry-z-modal:400; --ry-z-toast:500;
}
```

### 1.1 落地状态（v530 实测，别再照抄未落地的行）

| token | 实际落地 | 说明 |
|---|---|---|
| `--ry-panel-bg` / `--ry-panel-border` / `--ry-panel-head-h` | ✅ `mod/ry-panel.css` 顶部 `:root` | v530 收敛为唯一出处（下方「主设计参数面板」`:root` 里曾重复声明，`:root` 不是作用域，后写者全域生效 ⇒ 顶部 36px 从未生效，实测 44px） |
| `--ry-panel-head-bg` / `--ry-panel-fold-w` / `--ry-panel-grip-hot` / `--ry-z-float` | ✅ `mod/ry-panel.css` | 值与上表略有出入，以文件为准 |
| `--ry-panel-radius` | ❌ 全站圆角恒为 0 | 被扁平化 enforcer 压平；v530 已把 `style-01.css` 内 186 条无效 `border-radius` 声明删掉（209→23，余下全是 `50%` 圆点语义 + enforcer 自身） |
| `--ry-panel-sidebar-w` / `--ry-panel-result-w` | ❌ 从未定义 | 实际宽度由 `--ryp-input-col-width:372px` 与各页自身 `minmax()` 控制 |
| `--ry-panel-shadow` / `--ry-panel-grip-w` / `--ry-panel-head-fs` 等 | ❌ 未使用 | 需要时先落地再引用 |

> 命名规范：所有面板类统一前缀
> `ryp-`
> （Runye Panel），如
> `ryp-card`
> 、
> `ryp-titlebar`
> 、
> `ryp-fold`
> 、
> `ryp-grip`
> 。新写面板一律用前缀，不再散落
> `.pp-`
> /
> `.tl-`
> /
> `.at-`
> /
> `.smart-`
> 各自风格。



***

## 2. 族 A・四周固定条带

**定义**：钉在页面四边的常驻条带，承载全局导航 / 工具 / 状态。不参与折叠与拖动（个别工具轨可有 "收起为细条" 能力）。

### 组件构成



| 组件       | 类名             | 说明                                             |
| -------- | -------------- | ---------------------------------------------- |
| 条带容器     | `ryp-band`     | 固定定位：top/bottom/left/right + `--ry-panel-*` 外壳 |
| 工具单元     | `ryp-band-btn` | 44×44 最小热区、图标 + 文字、active/disabled 态           |
| 分隔线      | `ryp-band-sep` | 分组视觉分隔                                         |
| 折叠标签（可选） | `ryp-rail-tab` | 收起后贴边的细条，点击重新展开                                |

### 结构骨架



```
<div class="ryp-band ryp-band-top" data-ry-band>
  <div class="ryp-band-btn active"><svg …></svg><span>调网格</span></div>
  <span class="ryp-band-sep"></span>
  <div class="ryp-band-btn">…</div>
</div>
```

### 规范要点



* 唯一吸顶栏：`fn-nav` 已是 "唯一吸顶栏"，新条带不得再叠加第二根吸顶，统一由它承载。

* 已隐藏按钮（`display:none` 但保留 DOM + JS 引用的历史做法）——**规范不鼓励**：真不需要的功能应移除，避免契约探针永远数着幽灵按钮。过渡期保留但标记 `data-ry-ghost="1"`。

* 状态栏固定高度 `--ry-status-h:34px`，内容右对齐放 "制图标签 / 坐标 / 缩放"。



***

## 3. 族 B・侧边面板

**定义**：附着于工作区某一侧（左 / 右）的常驻面板，**可折叠 + 可拖宽 + 宽度记忆**。用于参数输入、结果展示、图层 / 分组、统计表。

### 组件构成



| 组件   | 类名             | 说明                        |
| ---- | -------------- | ------------------------- |
| 面板容器 | `ryp-card`     | 独立于工作区，`flex` 定宽列         |
| 标题栏  | `ryp-titlebar` | 44px 高、可整体点击折叠            |
| 折叠箭头 | `ryp-fold`     | 三角箭头，`.open`/`.closed` 旋转 |
| 折叠细条 | `ryp-rail-tab` | 收起后贴边的细条，点击重开             |
| 拖拽条  | `ryp-grip`     | 贴面板边缘，拖宽 / 双击恢复           |
| 内容体  | `ryp-body`     | 可滚动，`min-width:0` 防溢出     |

### 结构骨架



```
<aside class="ryp-card ryp-card-side" id="xPanel" data-ry-panel data-ry-collapsible>
  <div class="ryp-titlebar" data-ry-toggle>
    <span class="ryp-fold" data-ry-fold>▸</span>
    <span class="ryp-title">分区统计</span>
  </div>
  <div class="ryp-body" data-ry-body>…</div>
  <div class="ryp-grip" data-ry-grip data-ry-reset="双击恢复默认"></div>
</aside>
```

### 交互契约（通用实现，见 §6）



* **折叠**：点标题栏切换 `body.hidden`；箭头旋转；状态写 `localStorage[data-ry-panel-key+':folded']`。

* **拖宽**：拖 `ryp-grip` 改 `panel.style.width`；**没拖过不写任何变量走 CSS 回退宽**；拖过写 `localStorage`；双击恢复默认。

* 记忆键：`runye_panel_<id>`（沿用项目现有 `localStorage` 习惯）。

### 规范要点



* 左栏默认宽 `--ry-panel-sidebar-w:280px`；结果面板默认 `--ry-panel-result-w:300px`。

* 收起后必须留 `ryp-rail-tab` 细条（当前项目多处手动实现，统一收编）。

* 面板宽不得突破内容最小宽（`min-width` 守卫），防挤压画布。



***

## 4. 族 C・悬浮面板

**定义**：浮在工作区 / 地图之上，**可拖动 + 可折叠 + 位置 / 折叠记忆**。是产品特色（分区角度、AI 智能规划），最需要约束。

### 组件构成



| 组件        | 类名               | 说明                          |
| --------- | ---------------- | --------------------------- |
| 悬浮容器      | `ryp-float`      | `position:absolute`，相对工作区定位 |
| 标题栏（拖柄）   | `ryp-float-head` | `cursor:grab`，按住拖动          |
| 折叠按钮      | `ryp-float-fold` | 独立折叠钮（非整条标题栏）               |
| 内容体       | `ryp-float-body` | 可滚动                         |
| 缩放按钮组（可选） | `ryp-float-zoom` | 放大 / 缩小 / 适应                |

### 结构骨架



```
<div class="ryp-float" id="ryAnglePanel" data-ry-float data-ry-collapsible>
  <div class="ryp-float-head" data-ry-drag>
    <span class="ryp-float-title">分区角度</span>
    <button class="ryp-float-fold" data-ry-fold>▾</button>
  </div>
  <div class="ryp-float-body" data-ry-body>…</div>
</div>
```

### 交互契约（通用实现，见 §6）



* **拖动**：`data-ry-drag` 上的 `pointerdown → move → up`；`clamp` 在父容器内避免拖出视野；位置写 `localStorage`。

* **折叠记忆**：与拖位同 key（`runye_float_<id>`），JSON 存 `{l, t, folded}`。

* **多屏**：记录时同时存 "相对工作区坐标"（现有 `place(l,t)` 逻辑复用）。

* 层级固定 `--ry-z-float:200`，悬浮面板不得盖住模态对话框与右键菜单。

### 规范要点



* **不重叠**：同工作区最多 2 个悬浮面板，各自默认锚点错开（右上 / 右中），不做层叠管理。

* **记忆语义**：默认位置只在无记忆时写入，绝不覆盖用户拖过的位置（沿用现有 `ryAnglePanel` 原则）。

* AI 智能规划是 "大悬浮窗"（左历史 / 中对话 / 右成果 / 状态栏），按 `ryp-float` 规范收编，三栏拖宽逻辑保留为 `ryp-grip` 特例。



***

## 5. 族 D・右键弹出 / 族 E・模态 / 族 F・轻提示

### D・右键弹出

**定义**：选中图元后 `contextmenu` 触发，出现在指针处的小菜单 / 面板。



* 容器 `ryp-menu`：定位在 `e.clientX/clientY`，`clamp` 视口内，点空白 /`Esc` 关闭。

* 命中用**事件委托**挂 `document` 级 `contextmenu`，按 `data-ry-cm` 属性分发（复用现有 `[data-tl-src]`、改径菜单模式）。

* 层级 `--ry-z-rightclick:300`。

* 统一菜单项：图标（内联 SVG）+ 文字 + disabled / 危险态（危险项 `ryp-menu-item danger`，红字）。

### E・模态对话框

**定义**：居中弹层，遮挡全屏，必须 `role="dialog" aria-modal="true"`，可 Esc 关闭、可 Tab 陷阱。



* 容器 `ryp-modal`：半透明遮罩 `--ry-panel-shadow` + 中央卡片。

* 结构：`ryp-modal-head`（标题 + `ryp-modal-x` 关闭）× `ryp-modal-body`（可滚动）× `ryp-modal-foot`（左放 "恢复默认 / 说明"，右放 "取消 / 主操作"）。

* 层级 `--ry-z-modal:400`；打开时 `body` 锁滚动（`overflow:hidden`）。

* 设置页 `#rySetModal` 是标准范例：左 `ryp-modal-nav`（tab）+ 中部 `ryp-modal-body` + 底部按钮，全部沿用。

### F・轻提示



* Toast：`ryp-toast`，固定 `bottom:26px` 居中，`opacity/transform` 过渡，`--ry-z-toast:500`。统一 `atShowToast()` / `matFlash` 为一处 API。

* 状态徽章：`ryp-badge`（neutral/success/warn/danger/info 五态），沿用 `--ry-success/warn/…`。



***

## 5.5 族 G・现代工具面板（属性检查器 / 命令面板）

**定义**：面向 "选中即编辑" 与 "全局快速操作" 的两类现代工具面板。项目当前缺失，属**新增能力**，按规范先行定义、择机引入。

### G1・属性检查器（Property Inspector）

**用途**：选中图元（管线 / 节点 / 阀门 / 地块 / 分区线）后，在右侧显示该图元的属性并可就地编辑，改动实时同步到图面与计算。是对现有 "右键改径 / 节点配件面板 / 管段统计表" 这类散落编辑能力的**统一收编入口**。



| 组件  | 类名               | 说明                                 |
| --- | ---------------- | ---------------------------------- |
| 容器  | `ryp-inspector`  | 复用 `ryp-card` 外壳，右侧定位，可折叠 / 可拖宽    |
| 对象头 | `ryp-insp-head`  | 显示选中对象名 + 类型徽章，空选态显示 "未选择"         |
| 属性行 | `ryp-prop-row`   | 字段名 + 输入控件（复用现有 input /select/ 滑块） |
| 分组  | `ryp-prop-group` | 按类目分组（几何 / 水力 / 材料 / 标注）           |
| 主操作 | `ryp-insp-foot`  | 应用 / 重置该对象（可选）                     |



```
<aside class="ryp-inspector" id="ryInspector" data-ry-panel data-ry-collapsible data-ry-resizable>
  <div class="ryp-titlebar" data-ry-toggle>
    <span class="ryp-fold" data-ry-fold>▸</span>
    <span class="ryp-title">属性检查器</span>
    <span class="ryp-insp-type ryp-badge neutral">管线</span>
  </div>
  <div class="ryp-body" data-ry-body>
    <div class="ryp-insp-empty">点击图面上的管线 / 节点 / 地块查看属性</div>
    <div class="ryp-prop-group">
      <div class="ryp-prop-row"><label>管径</label><input …></div>
      <div class="ryp-prop-row"><label>管长</label><span>33.6 m</span></div>
    </div>
  </div>
</aside>
```

**交互契约**：



* 选中图元 → 面板显示其属性；点击空白 → 清空为 "未选择" 空态。

* 就地编辑 → 即时写回数据模型（等价右键改径 / 管段统计表改径），图面 + 水力 + 材料联动。

* 空态必须给引导文案，不做空白面板。

* 层级 `--ry-z-sidebar:110`（侧边属性，不高过悬浮 / 右键 / 模态）。

**与现有能力的边界**：属性检查器是 "常驻编辑入口"，右键菜单仍是 "上下文快捷动作"—— 两者共存，右键改径不删除，只是多一个常驻可编辑路径。改造落地时可先从管线（已有完整改径数据链）试点。

### G2・命令面板（Command Palette）

**用途**：`Ctrl+K`（或顶部搜索钮）唤起，模糊搜索并执行任意功能 —— 生成系统图 / 导出 DXF / 切换分区 / 回退 / 打开设置 / 跳转页面。功能多、层级深时是极佳导航入口。



| 组件   | 类名                  | 说明                                                   |
| ---- | ------------------- | ---------------------------------------------------- |
| 遮罩   | `ryp-palette`       | 顶部居中浮层，半透明遮罩 + 顶部搜索框，`--ry-z-command:350`（高于右键、低于模态） |
| 搜索框  | `ryp-palette-input` | 聚焦即用，`/` 或 `Ctrl+K` 唤起                               |
| 结果列表 | `ryp-palette-list`  | 模糊匹配项，↑↓ 选择、Enter 执行、Esc 关闭                          |
| 命令项  | `ryp-palette-item`  | 图标 + 名称 + 快捷键 + disabled 态                           |



```
<div class="ryp-palette" id="ryPalette" role="dialog" aria-label="命令面板" hidden>
  <div class="ryp-palette-box">
    <div class="ryp-palette-input-wrap">
      <svg …/><input class="ryp-palette-input" placeholder="输入命令或搜索…">
    </div>
    <ul class="ryp-palette-list">…</ul>
    <div class="ryp-palette-foot">↑↓ 选择 · Enter 执行 · Esc 关闭</div>
  </div>
</div>
```

**命令源**：由现有导航项（`runye-nav.js` 的 ITEMS /act 项）+ 各面板可寻址动作（`openTlSystemDiagramFromNav` / 导出 / 跳转 hash）汇总成命令注册表，单一出处。**不复制按钮逻辑**—— 命令面板只调已有函数，不是第二套实现。

**交互契约**：



* 唤起：`Ctrl+K` / `/` / 顶部搜索钮；关闭：`Esc` / 点遮罩。

* 命中 `[data-ry-cmd]` 注册的命令；执行后自动关闭。

* 键盘全可达（上下选择 / Enter 执行），鼠标仅作增强。



***

## 6. 通用交互库（治本：折叠 / 拖拽 / 记忆只实现一次）

建议落成一个 `mod/ry-panel.js`，供所有面板复用，替换各处手动实现。导出三个挂载函数：



```
/* 1. 折叠：给 [data-ry-collapsible] 装折叠。
 * 点击 [data-ry-toggle]（整条标题栏）或 [data-ry-fold]（独立按钮）切换 body 显隐。
 * 记忆键：element.dataset.ryKey + ':folded'；箭头 [data-ry-fold] 加 .open/.closed。 */
function rypCollapsible(rootEl){ /* 实现 */ }

/* 2. 拖宽：给 [data-ry-grip] 装宽度拖拽。
 * 拖 → panel.style.width；无记忆不写变量走 CSS 回退宽；双击 → 恢复 data-ry-reset 指定默认宽；
 * 拖过写 localStorage。 */
function rypResize(rootEl){ /* 实现 */ }

/* 3. 拖动：给 [data-ry-drag]（标题栏）装位置拖拽。
 * pointerdown/move/up；clamp 父容器内；位置+折叠写 localStorage（runye_float_<id>）。 */
function rypDraggable(rootEl){ /* 实现 */ }
```



* 三函数都做 `getElementById` 空值守卫（沿用项目惯例：元素缺失即 `return`，不抛错）。

* 初始化放 `mod/ry-panel.js` 末尾统一 `rypInitAll(document)`，扫描 `[data-ry-panel]`。



***

## 7. 层级阶梯（z-index 总表）



| 层        | 值                                 | 覆盖        |
| -------- | --------------------------------- | --------- |
| 工具轨 / 侧边 | `--ry-z-toolbar / --ry-z-sidebar` | 100 / 110 |
| 悬浮面板     | `--ry-z-float`                    | 200       |
| 右键菜单     | `--ry-z-rightclick`               | 300       |
| 模态对话框    | `--ry-z-modal`                    | 400       |
| Toast    | `--ry-z-toast`                    | 500       |

> 现有页面里的硬编码 z-index（如
> `ryFrameShell:20`
> 、
> `.smart-workbench`
> ）逐步收敛到本表，新写一律用 token。



***

## 8. 落地顺序（规范 → 逐个套用）



| 步骤 | 动作                                                       | 预估         |
| -- | -------------------------------------------------------- | ---------- |
| 1  | 追加 `--ry-panel-*` token 到 `runye-theme.css`              | 0.5h       |
| 2  | 新建 `mod/ry-panel.js` 通用交互库（折叠 / 拖宽 / 拖动三函数）              | 2h         |
| 3  | 先用 1 个现有面板试点（如 `#ryAnglePanel` 分区角度）改造为 `ryp-float` 验证规范 | 1h         |
| 4  | 逐个套用：B 族侧边（参数 / 结果 / 图层）→ C 族悬浮 → A 族条带 → D/E/F          | 每面板 0.5–1h |
| 5  | 每个面板套用后跑对应 `verify_*.cjs` 探针回归                           | 并入步骤 4     |

> 落地时注意：面板迁移涉及 DOM 结构调整（改类名 / 加
> `data-ry-*`
> ），
> **可能触及现有 JS 的&#x20;**
> `getElementById`
> **&#x20;与契约探针计数**
> —— 每改一个都要跑回归测试；若改到架构，按仓库约定同步更新根目录「架构结构图.md」变更记录。



***

## 9. 待办 / 未决



* [x] 落地范围：先试点 `#ryAnglePanel` + 主页面参数面板，验证共享交互与样式边界；全量迁移另行分批

* [ ] 是否补 "命令面板 / 属性检查器"（现代工具面板，当前项目无）

* [ ] AI 智能规划 `.smart-workbench` 大悬浮窗收编进 `ryp-float` 的边界（三栏拖宽特例）



### 9.1 v530 决策记录（2026-10-17，四条已确认）

1. **圆角 → 承认扁平**：不再追求 `--ry-panel-radius:14px`。唯一执行者是
   `mod/style-01.css` 的 `body,body *{border-radius:0!important}`，本文件凡写圆角处一律改 0；
   只保留 `border-radius:50%` 的圆点语义（图例/阀门/状态灯/水源图标）。
2. **h1 字号**：`runye-typography.css` 的裸 `h1{font-size:36px!important}` 是给落地页大标题的，
   把工具区标题（地形 14px、水力校核 15px）一并顶成 36px 属 bug，已用
   `:not(:where(#terrainSection *,#hydraulicsSection *))` 排除，纯函数区标题回各自面板字号。
3. **热区改双阈值**：见 §0 原则 3。
4. **旧皮肤直接删**：`style-01.css` 里三代 `.pp-plan-*`「深绿玻璃」皮肤（白字/深底）已删，
   保留仍在用的 `.pp-plan-bar-result` / `.pp-plan-spacer` / `.plan-apply-btn` / `.pp-select-sm`。
   另核实两条**不是死代码、不可删**：`terrain/terrain.css`（被 `terrain/index.html:15` 引用）、
   `#threeLevelView`（`index.html:2773` 有 DOM，`mod/inline-09.js` 仍在切 `.active`）。


### 9.2 v533 / v534 决策记录（2026-10-17，字号与滚动条的「唯一出处」）

**滚动条（v533）：唯一出处 = `runye-theme.css`。**
`*::-webkit-scrollbar` 是特异性 0 的全局规则，谁后加载谁赢。历史上 index.html 内联、
`mod/style-05.css`、`terrain/terrain.css`、`runye-hydraulics.html`（两份）、`三级系统图.html`、
`二级系统图.html`、`管路接驳拼装.html` 各复制了一份，取值还互不相同（5px 绿 / 4px 灰 / 5px 灰绿）。
逐页实测（`getComputedStyle(el,'::-webkit-scrollbar').width` + 真实 `offsetWidth-clientWidth`）：
**这些副本全部被 theme 压掉**，全站通用滚动条恒为 **4px / rgba(100,116,139,.45) / 圆角 999px**。
⇒ 已删除 7 处副本，`ci_check_static` 第 ⑦ 项守「除 theme 外不许再出现 `*::-webkit-scrollbar`」。
**例外（真在生效，不是副本）**：`.pp-side`、`#ryCadSide .ry-cad-grps` 的 5px 绿色细条
（选择器更具体）；以及各页容器级细条（`.fs-side`、`.at-sidebar`、`.tl-iso-stats`、`.te-mid` 等）。

**字号（v534）：正文口径 = `runye-typography.css`，面板密度口径 = 面板自己的声明（需 `!important`）。**
`--ry-fs-body:13px` 的 `p/li/input/select/button{…!important}` 是**全站正文**口径；
密集面板（在线地图左栏、地形模块）自带 10~15px 的一套尺度，`!important` 会把它整片压平
（.hint 设计 10px 实测 13px、缩放键设计 15px 实测 13px）。
规则：**面板要自己的生活尺度，就在自己那条声明上加 `!important`** —— 它的特异性
（`.mbtn` 0,1,0、`#terrainSection .t-unit button` 1,1,1）本就高于裸元素选择器，加 `!important`
即可反压全局；不要靠删 typography 的全局口径，也不要开容器级豁免（会波及未测量的元素）。

落地值（实测生效）：地图左栏 `.mbtn` 12px / 分区下拉 11px / 角度面板 `.hint` 10px /
结果行 `.v small` 10px；地形 `.t-sprow input,select` 12.5px / `.t-tabs`·`.t-unit`·`.t-modebtn` 12px /
`.t-canvas-nav button` 15px / `summary small` 11px。
⚠ **同一面板有多份副本必须同步加**（本次同步了 4 处：`mod/online-map.css`、`runye-map-measure.html` 内联、
`terrain/terrain.css`、`terrain/terrain-main.css`）。
（v535 起 `terrain-main.css` 已删除，地形只剩 `terrain/terrain.css` 一处 —— 见 §9.3。）

### 9.3 v535 决策记录（2026-10-17，地形模块样式「唯一出处」）

**地形模块样式唯一出处 = `terrain/terrain.css`。别再建 `#terrainSection` 前缀副本。**

地形是唯一有**两套入口**的模块：独立页 `terrain/index.html` 与主页 `#terrainSection`。
它俩历史上各挂一份样式表（`terrain.css` / `terrain-main.css`），实测**重名 139 条逐值完全相同、
0 处值不同** —— 不是两套设计，是一套设计抄了两份，且已经开始漂移（`.t-sprow input` 只在一侧）。

合并后的三段结构，**新增地形样式照这个放**：

| 段落 | 选择器形态 | 归属 |
|---|---|---|
| 通用组件 | 裸 `.t-*`（`.t-side` / `.t-card` / `.t-btn` …） | 两种形态共用，改这里 |
| 令牌 | `body.t-page, #terrainSection{ --g-* / --u-* … }` | 双命中，不写 `*`/`body` 的全局规则 |
| 嵌入差异 | `#terrainSection …` | 只有嵌入态才有的（三列栅格、`.t-panel`、单列降级） |

三条硬约束：
1. **页面级规则（`*{box-sizing}` / `body{}` / `button` / `input` / `a`）不许写进 `terrain.css`**
   —— 该表同时被主页加载，全局选择器会污染整个工具区。它们归 `terrain/index.html` 的内联 `<style>`。
2. **特异性相同时，顺序承重。** `#terrainSection .t-body{height:calc(…)}` 与
   `#terrainSection>.t-body{flex:1;min-height:0;height:auto}` 同为 (1,1,0)，后者必须在后，
   否则 `.t-body` 会被压成固定高、侧栏出滚动条、整栏元素少 4px（v535 踩过）。
3. **改完必须两形态 + 两视口都比对**（`_dump_style.mjs` 的 `RY_ROOT` / `RY_VP`）：
   主页 218 元素（1520px）/ 217（1050px 走单列分支）/ 独立页 233 / 主页全页 186，四张快照都要 0 差异。


### 9.4 v538 决策记录（2026-10-17，两个工具栏「一个文字高度」）

**二级地块工具栏（`#ppSide`）与三级管网工具栏（`#tlSide`）统一 11px，层级只用字重。**

用户口径：不要出现不同大小的文字，一个文字高度；要区分只加粗。落地：

| 角色 | 字号 | 字重 |
|---|---|---|
| 标签 / 单位 / 输入框数字 / 下拉 / 按钮 | **11px** | 400（按钮与下拉 600） |
| 列头（设计值 / 改径重算） | 11px | 600 |
| 结果数值（`.pp-plan-val` / `.pp-plan-val-real`） | 11px | 600 / 700 |
| 黑底扬程计算式 `#ppCalcDetail` | 10~11.5px（例外，不统一） | 分色 |

三条硬约束：
1. **`input/select/button` 必须带 `!important`** —— `runye-typography.css` 的
   `input/select/button{font-size:13px!important}` 会把它顶成 13px（本仓已有两处漏网就是它造成的：
   二级「调用」按钮、三级三个管径下拉，CSS 里明明写着 11px）。
2. **三级左栏样式一律挂 `.tl-plan-result` / ID，别挂 `#tlPipePlanSection .pp-side …`** ——
   rail 态 `#tlSide` 被搬进 `#ryCadSide`，section 祖先链断裂（v109 老坑，改一次踩一次）。
3. **区分「工具栏条」和「卡片/提示」**：`#tlPumpUpdateBox`、`#tlLossCard`（11.5px 白底卡片）、
   `#tlPpHint`（14px 空态提示）、`#ppCalcDetail`（黑底公式条）**不属于**工具栏条，各自保留层次；
   别一刀切成 11px，否则卡片内部（标题 11.5 / 说明 10.5 / 按钮 12）会自相矛盾。

量测脚本：`_probe_toolbar_typo.mjs`（按 fontSize/fontWeight 分组的分布表，含隐藏元素与输入框自身字号）。

#### v539 补充（用户追认「要统一就重写」）

1. **字号：11px 到底，含两张白底卡片。** `#tlPumpUpdateBox`（管径调整）/ `#tlLossCard`（水头损失）
   原来是 `font:11.5px/1.6` 简写 + 内部逐处 inline（说明 10.5、按钮 12）。现统一：卡片简写 11px，
   内部**删掉所有 inline font-size 改为继承**，按钮字号归 CSS `#tlPumpUpdateBtn{font-size:11px!important}`。
   ⇒ **新增卡片一律在卡片本体设一次 `font:11px/1.6 …`，内部不要再写 font-size。**
2. **字重口径（两级一致）**：标签 400 · 列头 600 · 设计值 600 · 实际值 700 · 按钮与下拉 600。
3. **改三级左栏任何属性，先查 rail 内联副本。** `index.html` 里那批
   `#ryCadSide [data-pp="tlPipePlanSection"] …` 特异性 (1,3,0)，会压过 `mod/style-01.css` 里的
   `.tl-plan-result …` (0,2,0)。只改一处 = 白改（v539 第一次就栽在这里）。
4. **`#tlPipePlanSection .pp-side …` 前缀的规则一律可疑**：rail 态祖先不存在，它从未生效过。
   新增/修正规则请挂 `.tl-plan-result` 或 ID；`ci_check_static` ⑥ 只查"两处值是否一致"，
   查不出"这条规则压根不匹配"。


***

*规范 v1・依据 runye-irrigation 真实结构归纳・2026-10-14 起按 `#ryAnglePanel` 与主页面参数面板试点落地；当前仅共用折叠和悬浮拖动，侧栏宽度拖拽未启用*

## 10. 面板样式的「死规则」判据（v542）

1. **判死必须两态都测**：左栏有两套 DOM 位置（原位 / 被 `moveIn()` 搬进 `#ryCadSide`）。
   一条规则在某一态不命中是**正常**的（它就是给另一态写的副本），只有**两态都不命中**才叫死规则。
   v542 第一版按「任一态不命中」删除，直接删掉二级面板的 rail 皮肤（A/B 抓到，已回滚）。
2. **死规则的两个真实来源**：
   - 结构搬走了、皮肤留下（`#threeLevelView .pp-plan-*` 252 条，`#threeLevelView` 里已无该结构）
   - 元素删了、规则留下（`.pp-title` 一族 125 条，全局 `.pp-title` = 0）
3. **合并重复块只能改写成逗号分组，不能用 `:is()`**（v531/v532 定论）：`:is()` 取参数里最高特异性，
   会把原位分支抬高一级 ⇒ 同特异性竞争改判 ⇒ 必回归。逗号分组让每个分支保留自己的特异性。
4. 带 `:hover/:focus/:active/::/html.ry-mobile` 的规则**永远不要当成死规则删**——探针量不到状态与伪元素。
