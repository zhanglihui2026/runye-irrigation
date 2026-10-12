# 润野灌溉 · 插件开发说明（PLUGIN_DEV v1.0）

> 面向要给本工具写插件的人（含未来的社区开发者）。**30 分钟可以写出第一个插件。**
> 最后更新：2026-10-11 ｜ 对应 Core 版本：**1.0.0**
> 架构方案：`插件化与数据资产化实施方案.md`

---

## 1. 三句话理解插件

1. 主程序只做「加载 + 调度 + 数据 + 隔离」，**不实现任何业务功能**；
2. 插件是一个目录：`manifest.json` + `main.js`（可选 `style.css`），ES Module；
3. 插件通过 `ctx`（主程序注入的对象）拿数据、挂 UI、发事件 —— **拿不到 window 上那些主程序全局变量**，也没必要拿。

---

## 2. 最小插件（复制即可跑）

**最省事的起步方式**：直接复制 `plugins/_template/` 整个目录（manifest / main.js / style.css 三件齐，带逐行中文注释，模板本身受闸门 C34 看管、永不腐化），改 ① manifest 的 `id`/`name`、② main.js 里的 `tpl-` 前缀、③ 登记进 `plugins.json` —— 三处改完就能跑。下面是从零手写的最小版本，便于理解协议本身：

目录：`plugins/<id>/`

```
plugins/<id>/
  ├── manifest.json
  ├── main.js
  └── style.css        （可选）
```

**manifest.json**

```json
{
  "id": "my-plugin",
  "name": "我的插件",
  "version": "1.0.0",
  "entry": "main.js",
  "requires": { "core": ">=1.0.0", "plugins": [] },
  "ui": { "nav": { "label": "我的插件", "order": 90 } },
  "permissions": ["read:diagram", "ui:nav"]
}
```

**main.js**

```js
export function activate(ctx) {
  const box = document.createElement('div');
  box.textContent = 'hello, ' + ctx.id;
  ctx.ui.mountPoint.appendChild(box);            // 插件自己的容器
  // ★ 标签只认 manifest（单一来源）：main.js 里写死一份 label 会与 manifest 漂移，
  //   漂了没人发现，还可能撞上老导航里的同名项（C32/C33 就是拦这个的）
  const nav = ctx.manifest.ui && ctx.manifest.ui.nav || {};
  ctx.ui.registerNav({
    label: nav.label, title: nav.title,
    onClick: () => box.scrollIntoView(),
    // 可选 · [v377] before：CSS 选择器锚点 —— 导航项会插到命中元素**之前**（保住原位置）。
    //   老模块迁移时用它插回原位（如 before: '.fn-more'）；锚点暂缺时 core 会重试约 0.7s，
    //   仍找不到才退回末尾追加（「入口不能丢」优先于位置一致）。
    // before: '.fn-more',
  });
}
export function deactivate() {
  // 移除你建的一切 DOM、监听、样式
}
```

**登记**：在根目录 `plugins.json` 的 `plugins` 数组加一行 `{ "id": "my-plugin", "path": "plugins/my-plugin/" }`。
**离线**：若希望 PWA 离线可用，把新文件同步加进 `sw.js` 的 `CORE` 列表（在线不受影响，SW 是 network-first）。

---

## 3. manifest 字段

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | ✅ | 全局唯一，`[a-z0-9-]`；同时是样式前缀和命名空间 |
| `name` | ✅ | 显示名 |
| `version` | ✅ | `x.y.z`；**用作 `?v=` 破缓存**，改代码请升版本 |
| `entry` | | 入口文件，默认 `main.js` |
| `requires.core` | | 主程序最低版本（如 `>=1.0.0`），不满足则跳过 |
| `requires.plugins` | | 依赖的插件 id 数组，缺失则跳过 |
| `ui.nav` | | 导航栏挂载声明（`label` / `order` / `icon`） |
| `permissions` | | 权限数组，**未声明 = 无权限** |

---

## 4. ctx：主程序给你的东西

```js
ctx = {
  id, manifest,                                 // 自身信息
  data: { ... },                                // 按 permissions 裁剪
  events: { on, off, emit },
  ui: { mountPoint, registerNav, unregisterNav },
  runtime: { log, reportError }
}
```

### 权限 → 可用方法对照

| 权限 | 解锁 |
|---|---|
| `read:diagram` | `data.readDiagram()`（设计图深拷贝快照）、`data.captureProject()`（完整工程快照） |
| `write:diagram` | `data.applyProject(snap)` —— **唯一允许写回主程序数据的通道** |
| `archive:read` | `data.readArchives()`、`data.loadArchive(id)`、`data.findSimilar(q, opts)`、`data.recommend(q, opts)` |
| `archive:write` | `data.saveArchive(arc)`、`data.deleteArchive(id)` |
| `event:subscribe` | `events.on/off` |
| `event:emit` | `events.emit` |
| `ui:nav` | `ui.registerNav/unregisterNav` |

**无需权限、任何插件都能用的纯计算 / 只读常量**：
`data.computeDeviation(base, actual)`、`data.hazenLoss(p)`、`data.invertHazenC(p)`、`data.hazenDefaults()`

> 不声明就拿不到对应方法（拿到的是 `undefined`）。这是**最小权限原则**，不是 bug。
>
> ⚠ 注意这里**没有任何「改水力计算」的通道** —— 反推出的 C 值只能通过 `archive:write`
> 存进档案字段留痕，主程序的 `C_HAZEN` / `hazenWilliams()` 没有任何插件能改（方案硬性要求）。

### 预置事件类型

`diagram-changed` / `archive-saved` / `archive-loaded` / `nav-switch` / `plugin-loaded` / `pipe-optim-export`

---

## 5. 六条硬约束（违反会在评审中被打回）

1. **模块隔离**：ES Module 作用域天然隔离，**禁止污染 window**（老代码 `window.PipeOptim` 那套只作迁移兼容）；
2. **只读数据**：`ctx.data` 给的**全是深拷贝**，绝不直接写 `tlDiagramData` / `measuredPolygon` / `ppState` / `RunyeBridge`；
   要写回只能调 `ctx.data.applyProject()`（需 `write:diagram`）；
3. **崩溃隔离**：`activate` 由主程序 try/catch 包裹，插件抛错只让自己被禁用；
4. **样式前缀**：类名一律 `<id>-` 前缀，不覆盖主程序与其他插件；
5. **权限最小化**：只声明真正需要的权限；
6. **卸载干净**：`deactivate` 必须移除本插件全部 DOM、监听与样式。

---

## 6. 容错行为（对你有利）

| 场景 | 行为 |
|---|---|
| manifest 校验失败 / requires 不满足 / import 失败 | 跳过该插件，导航项隐藏，**主程序照常启动** |
| `activate` 抛错 | 捕获 → 标记「已禁用」→ 上报，其余插件不受影响 |
| `plugins.json` 缺失 | 无感跳过，只是没有插件 |

---

## 7. 调试

浏览器控制台里：

```js
RyCore.version                 // 主程序版本
RyCore.loader.registry()       // 各插件状态：active / skipped / error，含跳过原因
RyCore.guard.listErrors()      // 插件错误现场（含堆栈）
RyCore.guard.listDisabled()    // 被禁用的插件及原因
RyCore.data.storageMode()      // 'cloud'（已登录，ry_kv）| 'local'（未登录，localStorage）
```

---

## 8. 三个已知坑（都踩过）

1. **导航项会被主导航重建冲掉**：`runye-nav.js` 每次渲染都会清空容器内所有 `[data-ry-navitem]`。
   ⇒ 插件导航**不要**自己拼 DOM，一律走 `ctx.ui.registerNav()`（它用 `data-ry-plugin-nav` + MutationObserver 自动补回）。
2. **改了代码不生效**：插件 import 拼的是 `manifest.version`。改代码后**升版本号**，否则命中旧缓存。
3. **云存储只有一条路**：本 CloudBase 环境把所有浏览器直连云函数一刀切拦死
   （匿名 / 无凭证 / 已登录 全部 `EXCEED_AUTHORITY`，安全规则只读改不了）。
   ⇒ 云存档只能走 `ry_kv` 表（`app.rdb()` + RLS），**绝不要**调 `callFunction('syncDb')`。
   未登录时云通道不可用，`data.storageMode()` 会返回 `local`，UI 应明示「仅存本机」。

---

## 9. 把老模块迁成插件（照抄 `plugins/pipe-optim/`）

老模块（挂在 `window.XXX` 上的 IIFE）**一行业务逻辑都不用改**，外面套一层壳就行。壳只做三件事：

```js
export function activate(ctx) {
  // ① 等老模块就绪（条件等待 + 上限，别写死 sleep）
  whenLegacyReady(function (ok) {
    if (!ok) { ctx.runtime.reportError(new Error('老模块未就绪')); return; }
    // ② 摘掉老模块自注入的入口 → 改由插件注册，且落回**原容器**
    var sel = takeOverLegacyButton();          // 记住 parent + nextSibling
    unnav = ctx.ui.registerNav({
      label: '管网优化', container: sel,       // container 让按钮位置不变
      onClick: function () { safeOpen(); }     // 全程 try/catch → ctx.runtime.reportError
    });
    // ③ 把老模块 dispatch 在 document 上的事件转发进插件总线
    document.addEventListener('ry:pipe-optim-export', onExport);
  });
  return { open: safeOpen, state: function () { /* … */ } };
}
export function deactivate() { /* 摘监听 → unnav() → 把老按钮插回原位 */ }
```

四条死规矩：

1. **不许双入口**：接管前先把老按钮摘下来（`takeOver`），卸载时原样插回（连 `nextSibling` 都还原）——否则用户看到两个一样的按钮。
2. **位置不能变**：三种锚点按老入口形态选（[v378] 统一由 `core/ui-shell.js` 的 `anchorFor()` 处理，锚点暂缺时 core 有界重试 20 次后仍退 appendChild）：

   | 老入口 | 写法 | 样板 |
   |---|---|---|
   | 老模块自注入的面板按钮 | `container: '.fn-more-panel'` | `pipe-optim` |
   | 顶级导航项（有稳定 class） | `before: '.fn-more'`（CSS 选择器） | `hydraulics` |
   | **`runye-nav.js` 渲染的面板项** | `container: '.fn-more-panel'` + **`beforeLabel: '经济指标分析'`** | `pipe-assemble` |
   | **多个插件锚同一个元素时** | 另给 `beforeLabel` 指定**彼此**的相对顺序 | `ai-plan`（`beforeLabel: '水力校核'`） |

   ⚠ 面板项**别用 CSS 选择器**：它只有 `data-ry-navitem="1"`，没有稳定 id/class；`href` 还会随页面有没有 `data-base` 在 `#xxx` 与 `index.html#xxx` 之间变 —— 只能按**可见文字**定位（`beforeLabel` 自带「·锁」归一化）。容器万一被导航重建冲掉，core 会自动退回主导航条——**入口不能丢**优先于位置一致。
   ⚠ **多个插件锚同一个元素时，谁后挂载谁离锚点更近**，而插件激活顺序不定 ⇒ 导航顺序可能被整体倒置（实测：智能规划跑到水力校核之后）。必须用 `beforeLabel` 显式排出相对顺序。`core/ui-shell.js` 的 `anchorFor()` 是降级链：`beforeLabel` 没命中 → 用 `before` 选择器 → 都没有才 appendChild。
3. **不许摘掉老模块的弹窗根节点**：老模块闭包还握着那个节点引用，摘掉后它下次 `open()` 是给脱离文档的节点设 `display`，现象就是「点了没反应」。卸载时只 `display:none`。
4. **拿不到就降级**：老模块没加载时，不接管、不动它的按钮，只 `reportError` 一条，主程序照常。
5. **[v378] 会员门控必须一起搬**：老项若带 `feat`（`runye-nav.js` 的 `ITEMS`/`MORE_ITEMS` 里那列），插件必须把 `gate` / `onLocked` 传给 `registerNav`：
   ```js
   gate: function () { return gate(ctx); },      // false = 锁定（显示「原名 ·锁」）
   onLocked: function () { onLocked(ctx); }      // 点锁定项 → 升级引导（RyMemberUI.showUpgrade，未加载则 toast）
   ```
   `gate()` 必须沿用 `runye-nav.js` 的**三态 fail-open**：权益层未加载 → 放行；`ready() === false` → 放行；只有拿到真相才严格按 `RyEntitle.can(feat)` 判。否则网络抖动会把老用户当场锁死。
   **只搬入口不搬门控 = 老入口锁着、插件入口敞着，L2 付费功能对全员开放**（v377 在 hydraulics 上真实漏过一次，v378 补回）。

manifest 里用 `config.takeOverNav: false` 可以只做事件桥接、完全不碰老入口（灰度用）。

6. **[v379] 壳迁移的下半场是「复用」，不是「搬完就完」**。判断标准很直接：
   老模块若有一套**纯计算内核**（本站最典型的就是 `hydraulic-calc/hc-core.js` 那类 UMD），
   迁移完必须问一句 —— **插件体系所在的页面（主页）里有没有这套内核？**
   没有的话，别人要用它的口径就只能在自己那份里"照抄一遍"，于是又出现两份记录。
   这时迁移插件应当承担「**内核宿主**」职责（照抄 `plugins/hydraulics/` v379）：
   把内核按需加载进来 → emit `Xxx-core-ready` 广播就绪 → 通过 `activate()` 的返回值
   暴露纯函数 api，返回值拿不到时**返回 null**（宁可让调用方说"算不了"，也不造一个看着合理的假数）。
   ⚠ 顺带一条：**core 层若自己也实现了同式公式，必须改成调用内核**（本案是
   `core/data-service.js` 的 `hazenLoss`），否则宿主插件白加载 —— 加载了没人用，
   等于口径统一落空（C38 专门盯这条）。

---

## 10. 参考实现

- 最小样板：`plugins/hello-world/`（30 行内跑通完整闭环）
- 业务样板：`plugins/archive/`（存档 CRUD + 云优先/本地降级 + 导航 + 面板）
- **老模块迁移样板：`plugins/pipe-optim/`**（摘入口 + 事件桥接 + 卸载还原，老代码零改动）
- **壳迁移样板（顶级项）：`plugins/hydraulics/`**（接管 + 抑制器 + 原位 + 会员门控）
- **壳迁移样板（面板项）：`plugins/pipe-assemble/`**（`container` + `beforeLabel` 按文字落位 + 抑制器 + 会员门控）
- **壳迁移样板（独立窗口入口）：`plugins/ai-plan/`**（`win:1` 弹窗语义四步复刻 + `beforeLabel` 排相对顺序）
- **闸门被中断后的源码体检：`_check_unmutated.cjs`**（`node _check_unmutated.cjs`，EXIT=0 才说明没有变异残留）
- **opt-in 样板：`plugins/calib/`**（参数反推只给参考，勾选「采纳」才写档案，默认不改任何计算）
- 协议实现：`core/loader.js`（校验 → import → activate）、`core/data-service.js`（数据与存储）
