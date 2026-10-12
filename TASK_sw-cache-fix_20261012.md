# 修复任务：sw.js PWA 缓存清单 + 版本号（v380-cache-fix）

> 派发日期：2026-10-12 ｜ 仓库：`C:\Users\AHS\runye-irrigation`
> 背景：昨晚完成插件化阶段五（v379，全部闸门已验证全绿）。审核发现 sw.js 的 CORE 缓存白名单没跟上新增文件、index.html 两个脚本的 ?v= 版本号滞后。**本任务只做 4 处小改 + 回归验证，不改任何业务逻辑。**

---

## 一、改动清单（共 2 个文件、4 处）

### 1. `C:\Users\AHS\runye-irrigation\sw.js`

**① 升 VERSION**
```diff
- const VERSION = 'v379-plugin-hydcore';
+ const VERSION = 'v380-cache-fix';
```

**② CORE 数组补 pipe-assemble 插件**（在 `"plugins/hydraulics/main.js",` 这一行之后追加）：
```diff
   "plugins/hydraulics/manifest.json",
   "plugins/hydraulics/main.js",
+  "plugins/pipe-assemble/manifest.json",
+  "plugins/pipe-assemble/main.js",
```

**③ CORE 数组补 runye-typography.css**（在 `"runye-theme.css",` 这一行之后追加）：
```diff
   "runye-theme.css",
+  "runye-typography.css",
```

> 原因：pipe-assemble 是 v378 迁移的插件但没登记进 SW 白名单（离线态取不到，违反"新增插件必登记"纪律）；typography.css 全站页面已引用（含 offline.html）但离线缓存没有（离线时字号样式 404）。

### 2. `C:\Users\AHS\runye-irrigation\index.html`

**④ 升两个脚本版本号**（只改这 2 行的 `?v=` 数字，其余一律不动）：
```diff
- <script src="runye-nav.js?v=346"></script>
+ <script src="runye-nav.js?v=380"></script>
```
```diff
- <script src="mod/inline-18.js?v=357"></script>
+ <script src="mod/inline-18.js?v=380"></script>
```

> 原因：runye-nav.js 修改于 10-11 23:39（v378 动过 mount 重渲染逻辑）、inline-18.js 修改于 22:39，引用版本未升 → 浏览器缓存窗口内可能拿旧脚本。v380 与 sw.js VERSION 保持一致。

---

## 二、验证（node 不在 PATH，用全路径；闸门脚本会起本地端口 8123/8124）

```powershell
Set-Location C:\Users\AHS\runye-irrigation

# 1) sw.js 语法
& 'C:\Program Files\nodejs\node.exe' --check sw.js

# 2) 插件契约闸门（37 契约 + 35 变异）
& 'C:\Program Files\nodejs\node.exe' _gate_plugins.cjs
# 期望末尾：ALL OK · 插件协议闸门全部通过

# 3) 真实页面冒烟（27 项）
& 'C:\Program Files\nodejs\node.exe' _smoke_plugins.cjs
# 期望末尾：ALL OK

# 4) 导航紧凑闸门（需 NODE_PATH 指向 puppeteer）
$env:NODE_PATH='C:/Users/AHS/.workbuddy/binaries/node/workspace/node_modules'
& 'C:\Program Files\nodejs\node.exe' verify_nav_compact.js
# 期望：EXIT=0 全部通过
```

若 8123/8124 报 `EADDRINUSE`（端口被占用）：等 3 秒重跑一次即可（TimeWait 残留），不要改代码。

---

## 三、红线（绝对不要动）

- ❌ 不改任何插件 `main.js` / `manifest.json`（**含 pipe-assemble 本身**——它已经正常工作）
- ❌ 不改 `runye-theme.css` / `runye-typography.css` 的内容
- ❌ 不改 `invite.html`、`runye-nav.js` 的内容（只允许改 index.html 里对 runye-nav.js 的引用版本号）
- ❌ 不碰 `_gate_plugins.cjs` / `_smoke_plugins.cjs`（今早并行 agent 刚更新，改了就冲突）
- ❌ 不做 `git commit` / `git push` / 任何部署（发布等用户明确指令）
- ❌ 不要用 python 重写任何 `.md` 文件（本任务不涉及，但这是项目纪律）

---

## 四、验收标准

1. `sw.js` 的 VERSION = `v380-cache-fix`，CORE 数组含 `plugins/pipe-assemble/manifest.json`、`plugins/pipe-assemble/main.js`、`runye-typography.css`
2. `index.html` 中 `runye-nav.js` 引用为 `?v=380`、`mod/inline-18.js` 引用为 `?v=380`，无 `?v=346` / `?v=357` 残留
3. 三组闸门全绿（gate ALL OK / smoke ALL OK / nav_compact EXIT=0）
4. `git diff` 只涉及 `sw.js` 与 `index.html` 两个文件
