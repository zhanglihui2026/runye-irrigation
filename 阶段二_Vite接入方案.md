# 阶段二 · npm + Vite 工程化（方案A：Vite 只做本地预览）

> 状态：**方案文档（未执行）** ｜ 生成日期：2026-10-14
> 背景：阶段一界面样板已定稿；用户选定「完整工程化 + 零侵入 + 方案A（Vite 仅本地预览，发布方式不变）」
> 执行原则：**不污染项目根 / 不破坏静态托管 / 不改 index.html 的脚本引入方式**

---

## 1. 目标

在不改变现有发布链路、不改造 `index.html` 的 100+ 全局 `<script>` 的前提下，把 Vite 用作**本地开发预览**，为阶段三（Vue3 组件化）铺路。

**方案A 明确不做的事：**
- 不把 `dist/` 作为 GitHub Pages 发布源（发布仍走现有静态托管）
- 不改 `index.html` 里任何 `<script src>` / `<link>` 的引用方式（保留 `mod/inline-*.js`、`runye-*.js`、`?v=xxx` 原样）
- 不在项目根塞入与现有 `_*/`、`verify_*`、静态托管纪律冲突的产物

## 2. 现状核查（已确认）

| 项 | 结论 |
|---|---|
| 项目形态 | 纯原生多页 PWA，`index.html` 直接引入 100+ 全局 script/link，手工 `?v=` 版本号 |
| 项目根 package.json | 无 |
| 已有 node 环境 | `.workbuddy\binaries\node\workspace`（esbuild 0.28.2、jsdom、playwright-core 等，供 CloudBase SDK 构建 + 闸门测试用）|
| Node 版本 | 20.19.0（`.workbuddy\binaries\node\versions\20.19.0`），满足 Vite 要求 |
| git | 通过 GitHub Desktop 提供（`C:\ProgramData\AHS\GitHubDesktop\bin`）|
| 发布纪律 | 架构图 §9：线上 GitHub Pages 为老版本，未经明确发布不得推送 |
| 闸门契约 | `expand_index.cjs` 依赖 index.html + mod 外链的文本契约，**不可改动** |

## 3. 方案A 落地方式（推荐：借用已有 workspace，不污染项目根）

**为什么不推荐在项目根新建 package.json + npm install vite：**
- 会引入项目根 `node_modules/`、`package-lock.json`，与现有 `.gitignore` 的 `_*/` / `verify_*` 纪律、静态托管定位不一致；
- 用户已有 `workspace` 工程环境，新建第二套 npm 依赖会割裂、易出隐患；
- 方案A 只用到"本地 dev server 看效果"，不需要 Vite 参与构建产物。

**推荐做法**：在现有 `workspace` 环境里加装 `vite`，在项目根放一个**纯声明、不装依赖**的 `vite.config.js` + 一个最小入口说明，`npm run dev` 指向 Vite dev server 预览 `index.html`。

---

## 4. 待执行文件清单（仅产出，未执行）

### 4.1 在现有 workspace 环境安装 Vite（第 1 步，唯一需要装依赖的动作）

在 `.workbuddy\binaries\node\workspace` 目录执行（用 Node 20 的 npm，完整路径）：

```bash
cd "C:/Users/AHS/.workbuddy/binaries/node/workspace"
"C:/Users/AHS/.workbuddy/binaries/node/versions/20.19.0/node-v20.19.0-win-x64/npm.cmd" install --save-dev vite@5
```

> 说明：vite@5 兼容 Node 20；装进 workspace 而非项目根，避免污染 runye-irrigation。
> ⚠️ 若用户不想动 workspace，可跳过本步，方案A 改走「手动/静态预览」方式（见 §6 备选）。

### 4.2 项目根放置 vite.config.js（声明式，指向 index.html 作入口）

```js
// runye-irrigation/vite.config.js —— 方案A：Vite 仅作本地预览，不参与发布构建
import { defineConfig } from 'vite';

export default defineConfig({
  // 零侵入：index.html 现有 <script src> / <link> 全为经典引用，Vite 按原样 serve，
  // 不做 ESM 改写、不重写 ?v= 版本号
  appType: 'mpa',            // 多页应用模式，尊重各独立 .html 入口
  build: {
    // 方案A 不产出发布用的 dist；如需本地试构建，产物进 ./_vite_dist（下划线开头，被 gitignore 忽略）
    outDir: '_vite_dist',
    emptyOutDir: true,
    // 关键：不尝试把经典全局脚本当作 ES module 打包，避免破坏全局依赖
    rollupOptions: {
      input: {},
    },
  },
  server: {
    port: 5173,
    open: false,             // 不开浏览器，避免干扰你正在看的样板
  },
});
```

> **注意**：`appType:'mpa'` 让 Vite 以多页方式服务独立 `.html`（在线地图 / 管线规划等页面都是独立 html）。经典 `<script src>` 在 dev 下由 Vite 静态 serve，行为与现有一致。

### 4.3 项目根可选 package.json（最小声明，不含依赖，仅放脚本）

> 若不想碰 workspace，也可以放此文件 + 把 vite 装进项目根（二选一，见 §3 权衡）。推荐**不放**，以下仅为可选项说明：

```json
{
  "name": "runye-irrigation",
  "private": true,
  "version": "0.0.0",
  "scripts": {
    "dev": "vite"
  },
  "devDependencies": {}
}
```

---

## 5. 迁移路线（阶段二 → 阶段三）

| 里程碑 | 动作 | 验收 |
|---|---|---|
| **M1 预览跑通** | workspace 装 vite + 项目根放 vite.config.js | `npm run dev` 后浏览器打开 `localhost:5173/index.html`，**页面与现状一致**（功能、布局、全局脚本行为不变）|
| **M2 逐页冒烟** | 打开在线地图/地块划分/管线规划/智能规划四页，对照基线截图 | 无 JS 报错、无资源 404、`?v=` 正常解析 |
| **M3 ESM 试点** | 挑 `runye-geo.js` 或 `mod/zone-geometry.js` 改造成 `export`，其余全局脚本不动 | 改造模块功能正常，**全局依赖不受影响**（关键验证）|
| **M4 阶段三入口** | 写清哪些全局脚本可逐步转 ESM、哪些耦合太深建议冻结 | 迁移路线文档 + 架构图变更记录 |

## 6. 备选（若不想在 workspace 装 vite）

若用户不希望动任何 node 环境，方案A 的"本地预览"可退化为：
- 直接用浏览器打开 `index.html`（现状就是这样，无需 Vite）；
- 或后续阶段二仅保留"迁移路线文档 + 可行性结论"，把 Vite 实际安装推迟到阶段三真正组件化时。

---

## 7. 风险清单

| 风险 | 等级 | 缓解 |
|---|---|---|
| Vite dev 对 `?v=xxx` 的解析 | 中 | 经典 script 由静态 serve，`?v=` 按查询串透传；M2 逐页冒烟兜底 |
| `appType:'mpa'` 与现有路由冲突 | 低 | 项目是多页独立 html，正好匹配；不改内部路由 |
| 误把 dist 当发布源 | 低 | 方案A 明确 outDir 用 `_vite_dist`（被 gitignore 忽略），不碰 GH Pages |
| 破坏闸门文本契约 | 高 | **红线**：绝不改 index.html 的 mod 外链引用；改动前先跑 `_gate_plugins.cjs` / `_smoke_plugins.cjs` / `verify_nav_compact.js` |

## 8. 待用户拍板

- [ ] 是否同意在 `.workbuddy\binaries\node\workspace` 安装 vite（推荐），还是完全不动环境（走 §6 备选）
- [ ] M3 试点挑哪个模块：`runye-geo.js` 或 `mod/zone-geometry.js`（或用户指定）
- [ ] 是否接受本方案文档作为阶段二的交付基准

---

*本文档由阶段二执行产出；未经用户明确同意，不实际安装、不执行命令、不推送发布。*
