# 润野灌溉 · 接手须知（Agent Handoff）

> **给接手本项目的 AI agent / 开发者**：先读这一页，再动代码。
> 最后更新：**2026-10-16** ｜ 当前阶段：**数据资产化主链路收口进行中**（v382 已移除旧握手；2026-10-16 数字农业工作台源码进一步移入 `feature-archive/数字农业工作台/`，当前运行入口已断开；下一步 **Step 0 `core/land-store.js` 加壳 + 坐标口径标记**）；插件化阶段五已完成 4 项壳迁移（pipe-optim / hydraulics / pipe-assemble / ai-plan，余滴灌带查询/会员体系，详见「▶ 当前任务」末尾的插件迁移参考）；**会员云调用被平台拦截，架构路线待用户拍板**
> ⚠ 缓存版本号已由我抬到 **`v382-da-decouple`**（sw.js VERSION + index.html `?v=` 后缀）。此前 v380/v381 两轮别的会话改缓存号的问题已了结。接手动这两个文件前先 `git diff` 看有没有未提交的并行改动。
> 相关文档：`README.md`（站点结构）｜`CLOUDBASE_SETUP.md`（云开发配置）｜`AI_ONLINE.md`（AI 在线模块）｜`发布与更新说明.md`
> 插件化：`插件化与数据资产化实施方案.md`（§10 是阶段一交付记录，**§12 是当前主线：架构梳理 + 数据链路 + 六步计划**）｜`PLUGIN_DEV.md`（插件开发说明）｜闸门 `_gate_plugins.cjs` / `_smoke_plugins.cjs`
> 数据链路：`地块主链路架构规划.md`（多 Agent 分工版）｜`RYPLOT_SCHEMA.md`（ryPlot 现状基线 v1）

---

## ▶ 当前任务（v382 起，接手 agent 从这里开工）

**主线（用户已拍板，见方案文档 §12）**：数据资产化主链路收口，六步计划，**每步跑五道门全绿才算完成；未经用户明确说「发布」，任何一步都不部署**。

| 步 | 内容 | 闸门配套 | 状态 |
|---|---|---|---|
| -1 | 移除灌溉侧数字农业导航和旧握手 | C40/I40 | ✅ **v382-da-decouple 已完成**；工作台运行源码于 2026-10-16 另行归档并移除活动入口 |
| 0 | `core/land-store.js` 加壳（物理存储仍走 `runye_plot_library`，**零迁移**）+ `geometry.orientation` 坐标口径标记 + 存量修复脚本 | C41 口径标记必填 / C42 rev 冲突拒绝 | **← 下一步开工** |
| 1 | 收口剩下 5 个写入方 → 全走 land-store | C43 单一口径 | 待 |
| 2 | `RyMapPartition` 提为共享 ES Module，干掉隐藏 iframe | C44 分区不依赖主页加载 | 待 |
| 3 | 派生层只读 land；`runye_network_layout` **一步到位**收进 `land.network`，三读方（map-enhance / runye-hydraulics.html / runye-ai-chat-test.html）同轮改 | C45 network 按 land_id 分域 | 待 |
| 4 | 拆巨石文件：inline-09.js(6002行) / inline-11.js(4029行) / index.html(2911行) | 既有闸门全量回归 | 待 |
| 5 | 文档收尾 | — | 待 |

**Step 0 开工前必读**（都是上一轮规划期挖出来的，别重新踩）：
- 双坐标口径（P0）：`measuredPolygon`（图面，y 取反）vs `__runyeMapFramePoly`（地图，y 不取反），**无元数据标记**，现状靠 `ryOrientPlotPoly()` 几何判据（容差 0.5m）猜 —— 猜错不报错。用户已拍板「Step 0 就加标记 + 修存量」。
- `runye_plot_library` 曾有 6 方写入（Step -1 后 5 方，见方案文档 §12.0.1 表）；`runye_network_layout` 是单例键、多地块互覆盖（Step 3 一步到位收进 `land.network`，不留双写过渡期 —— 用户拍板）。
- land-store 目标态：L1 主链路生产层 / L2 派生消费层 / L0 Land 数据层；`land_id` 主键 + `rev` 乐观锁；`geometry/partitions/network/derived` 分区。现状数据契约基线在 `RYPLOT_SCHEMA.md`。
- **C40 假绿教训**（详见方案文档 §12.1）：契约做「剥注释后扫描」会被 `index.html` 第 1145 行注释里的字面量 `/*` 吞掉 60% 文件。C40 已改为零启发式直接扫原文；**新契约要扫描文件时，默认零启发式，别引入注释剥离**。

**数字农业剥离后的现状：** ① 花生工具不再自动取得灌溉当前地块；② 工作台「绘制边界」握手已移除；③ 工作台源码和恢复记录现位于 `feature-archive/数字农业工作台/`，数字农业入口及七彩花生页面均不再链接到工作台；④ `digital-agriculture/` 仍保留花生决策与独立入口，不属于灌溉主程序运行链路。恢复工作台前须先修复其共享地块库整库覆盖风险。

---

### 附：插件化阶段五参考（壳迁移模板与纪律，仍然有效）

**已迁移**：管路拼装（v378，`plugins/pipe-assemble/`，折叠面板内入口样板）、**AI 规划（v381，`plugins/ai-plan/`，★独立窗口入口样板）**、水力校核（壳迁移 v377 + 真改造 v379：成为水力计算内核宿主）。**剩余**：滴灌带查询（`feat:''` 免费、无门控，最简单）→ 会员体系（卡在 §0 云函数拦截，待用户拍板架构路线，**不要自己动手改架构**）。

**三套现成模板，按老入口形态三选一**（都在闸门看管下，别另起炉灶）：
- 老入口 = 「更多 ▾」面板内按钮、**注入一次**（老模块自己 `injectNavButton`）→ 抄 `plugins/pipe-optim/`（`container` 定位原面板；参照 C22–C26 契约族）；
- 老入口 = **顶级导航项**、由 `RyFnNav.render()` 渲染、**权益就绪会重渲染复活** → 抄 `plugins/hydraulics/`（条件 probe 等老项+锚点齐 → 摘除 + 抑制器 MutationObserver → `registerNav({ before })` 插回原位；参照 C35 / I27 / I28）；
- 老入口 = **「更多 ▾」面板内项、由 `RyFnNav.render()` 渲染、会重渲染复活** → 抄 **`plugins/pipe-assemble/`**（= 上面两条的合体：`container: '.fn-more-panel'` + **`beforeLabel` 按文字落位** + 抑制器 + 门控；参照 C36 / I29–I31）。
  ⚠ 面板项**不能用 CSS 选择器定位**：`runye-nav.js` 只打 `data-ry-navitem="1"`，且 `href` 随页面有无 `data-base` 在 `#xxx` / `index.html#xxx` 之间变 —— 只能按可见文字找（`core/ui-shell.js` 的 `anchorFor()`，含 `·锁` 归一化）。
- **★ 老入口是 `win:1`（弹独立窗口）** → 抄 **`plugins/ai-plan/`**（参照 C39 / I36–I39）。
  ⚠ 这一条最贵：把它写成 `location.assign(href)`，用户正在画的地块分区会在眼前被整页冲掉（v331 的「主窗口不受影响」当场作废）。必须复刻四步：**先 `runyeSaveProject(true)` 静默存档 → 写 `runye_aiplot_anchor_v1` 一次性锚 → `window.open(href,'runye_smart','width=1180,height=860')` → 被拦截才回落本页跳转**；且 href 必须原样带 `?smart=1`，少了 query 打开的就只是普通主页。
- **多个插件锚同一个元素时**（如 ai-plan 与 hydraulics 都以「更多 ▾」为锚）→ **必须用 `beforeLabel` 指定彼此的相对顺序**。
  ⚠ 「谁先挂载谁离锚点更近」——插件激活顺序不定，实测出现过导航顺序被倒置（智能规划跑到水力校核后面）。`core/ui-shell.js` 的 `anchorFor()` 现在是「`beforeLabel` 找不到才降级用 `before` 选择器」。

**⛔ 壳迁移必须连会员门控一起搬**（v378 补的洞，别再漏）：老项若有 `feat`（如 `pro-others` / `hydraulic-check` = L2），插件必须把 `gate`/`onLocked` 传给 `registerNav`，且 `gate()` 要沿用 `runye-nav.js` 的**三态 fail-open**（权益层未加载 / `ready()===false` → 放行；拿到真相才严格判）。只搬入口不搬门控 = 老入口锁着、插件入口敞着，**付费功能对全员开放**。

**必守流程**（每一轮都要，六步计划同样适用）：
1. 迁移 = 壳（manifest.config 驱动，业务零改动，标签只认 `ctx.manifest.ui.nav.label`，禁在 main.js 写死 label）；
2. 闸门 `_gate_plugins.cjs` 加契约 + **注入变异证明它拦得住**；`_smoke_plugins.cjs` 加真页面检查（跨导航断言必须在 Node 侧编排，`page.evaluate` 活不过导航）；
3. `verify_nav_compact.js` 的 `WANT_ITEMS`/`WANT_PLUGINS` 期望同步（当前 **16 老项 + 9 插件项**，迁一个改一个；`MORE_WANT` 面板 11 项**顺序**不变也要复验）；`sw.js` 改了 CORE 白名单文件（含 `core/*.js` 全部、`runye-nav.js`）必升 `VERSION`，**新增插件还要把它的 manifest/main 登记进 CORE 列表**（否则 PWA 离线态取不到）。
4. 全绿（插件闸门 **41 契约 + 40 变异** / 冒烟 **29 项** / verify_nav_compact / verify_nav_switch / verify_ry_tool 均 EXIT=0）→ 更新本文件 + 方案文档 §11.x/§12 + 工作日志。
5. **冒烟踩坑**：面板内的插件项默认 `hidden`，puppeteer 的 `.click()` 会报 `Node is either not clickable` ⇒ 用 `page.evaluate(() => el.click())`；跨导航断言必须在 Node 侧编排（`page.evaluate` 活不过导航）。
6. **闸门跑到一半被中断（超时/强杀/崩）后，第一件事跑 `node _check_unmutated.cjs`**（EXIT=0 才干净）。见 §7 作业纪律第 6 条 —— 变异是**就地改源码**的，中断会留下看起来完全正常的"被改坏"的源码。

**⛔ 硬约束**：未经用户明确说「发布」，不做 CloudStudio 部署 / GitHub 推送 / Vercel——只允许本地编辑与本地操作。改 `.md` 一律用编辑工具（python 重写会被回滚）。

**已知抖动**：verify_nav_compact M2 系曾出现一次「权益重渲染正好冲掉面板打开态」，已加重试兜底；若再现 M2b 红（panel.h=0）先怀疑重渲染时序，别急着改断言。

**挂起的用户待办**（完成后提醒，勿代办）：① 登录存 5 条档案实测 `ry_kv` 找回；② 是否删 `index.html` 里 `<script src="pipe_optim_ui.js"></script>`；③ 发布指令；④ 会员云调用 `EXCEED_AUTHORITY` 架构路线三选一（§2 Q1 / §5）。会员体系的云函数调用被平台 `EXCEED_AUTHORITY` 环境级拦截（见 §0/§5，三条候选架构待用户拍板）。

---

## 0. 一句话现状

会员/权益功能**代码已写完**，云端 `ryEntitle` 云函数**已部署成功**，SDK 已自托管，
但被 CloudBase 平台的一道环境级策略拦住 —— **所有客户端身份都无法调用任何云函数**（`EXCEED_AUTHORITY`）。
⚠️ **2026-10-10 晚实测定案**：不仅匿名用户被拦，**手机号登录用户（role=authenticated）同样被拦**
（②B kvSet/kvGet 回环实测；此前截图的 `{result:null,error:null}` 是 SDK 把 403 当返回值 resolve 的假象，非调通）。
⇒ **浏览器直连云函数此路不通，会员前端必须改架构**：A) Vercel 服务端中转 / B) CloudBase HTTP 访问服务 / C) JS SDK `app.rdb()` 直连 PG + RLS（见 §5）。

---

## 1. 上线架构分布（2026-10-10 用户交代）

| 部分 | 放在哪 | 备注 |
|---|---|---|
| 前端工具本体（静态页） | **GitHub Pages** `https://zhanglihui2026.github.io/runye-irrigation/` | |
| 大模型 API 调用 | **Vercel** `https://runye-irrigation.vercel.app` | Serverless 函数持密钥代理 |
| 账号 / 权益 / 数据同步 | **腾讯云 CloudBase**（上海） | 环境 `runye-irrigation-d3e8xef4540bae5` |
| 本地联调 | `http://localhost:8080` | 已在 CloudBase「安全来源」白名单内 |

> ⚠️ **GitHub Pages 上跑的是老版本**。实测（2026-10-10）：`/cloud-sync.js`、`/runye-entitle.js`、
> `/runye-member-ui.js` 全部 **404**，会员相关 markers 全 0，`runye-ai-plan.js?v=355`（本地是 358）。
> Vercel 上也有一份同代老前端副本（同样没有会员代码）。
> ⇒ **任何"线上测试会员功能"的想法现在都不成立，必须先发布。**
>
> **✅ 2026-10-16 更新：GitHub Pages 已随本次发布同步为最新版本**（commit `a21b45b`，
> 用户明确说「发布」后由 agent 推送）。实测线上 HTTP 200，`sw.js` = `v503-ui-batch-plot-store`，
> `index.html` 上 `?v=` 与动画/CSS 实测一致，新增 `core/plot-library-store.js` 线上 200。
> 会员三件套（cloud-sync.js / runye-entitle.js / runye-member-ui.js）已在库并随发布上线。
> 本次批量上线内容：地块图库 store（并行会话）、分区格只画内部分割线（修重复轮廓）、
> 三级图右缘标注间距 14→30px、轮灌演示水流动画 .85→.22s、地形模块标题去图标、
> 「保存地点」按钮去图标并移入搜索行右侧。
> Vercel 副本未动，仍为老版本（仅承载大模型 API 代理，前端静态页走 Pages）；
> 线上测试会员功能前先确认 Vercel 是否也需要同步。
>
> **✅ 2026-10-16 第二次发布：`commit ba95376`，`sw.js` = `v511-nav-rebind`（已实测线上
> HTTP 200、`index.html` 引用 `mod/inline-18.js?v=511-nav-rebind`、线上 `mod/inline-18.js`
> 17972 字节含修复）。本次内容：**
> · **v511-nav-rebind 修「管路规划 → 底部切三级简图 → 再点顶部管路规划切不回工作区」**
>   （用户实测报告）。根因＝runye-nav.js 的 `RyEntitle.onChange → RyFnNav.render()` 在会员
>   权益异步就绪时**重建**全部导航项，而 `mod/inline-18.js` 在解析期就把 click 绑在旧元素上
>   ⇒ 新元素无处理器，点击只剩原生锚点 → hashchange → `ryJumpToSection` → `ryShowSection`
>   —— 这条路**不复位视图**（三级仍 `data-ry-view="pipe"`），用户在同一个功能区里就表现为
>   「点了没反应」；同时导航高亮丢失（`activate()` 点亮的是脱离文档的旧节点）。
>   修法：`collectItems()` 可重入 + 具名 `navItemClick()` + 按元素标记去重绑定 +
>   `#fnNav` 上的 MutationObserver 重建后「重收/补绑/恢复高亮」。病史同 v376。
>   回归脚本 `_repro_tabswitch.mjs`（gitignore，等权益就绪复现真实时序）：改前 4 过/8 红、
>   改后 12/12。
> · v510-remove-missing-pages（并行会话）：CORE 去掉已删页面的预缓存引用。
> · 已确认的**既存红**（改前/改后逐条同值，不要再当回归查）：`verify_pp_tabs` 14/34
>   （rySetTab 定位器只查 index.html，v376 已搬到 `mod/inline-09.js`）、`verify_nav_compact`
>   10 项（权益「同步中」→ 点击被捕获拦截 + 旧项名契约）、`verify_construct_fit` 19/21
>   （2 项 PP 二级可见尺寸）、`verify_sketchup` 3过/6红+FATAL（`.fn-link[data-target=
>   "designInput"]` 选择器已过期）、`verify_ry_tool` 启动即崩（缺
>   `iso-diagram/network-editor.css`）、`verify_cascade_pp` 1/38。

---

## 2. 🔴 需要用户明确方向的 5 个问题

> 这几件事**只有用户能定**，agent 不要自己拍板。每条都写清了"为什么要问"和"选项是什么"。

### Q1. 是否做架构迁移？（最重要，影响后续所有工作）
**背景**：现在三块（静态前端 / AI 后端 / 账号后端）分散在三个平台，且前两者在国内可达性存疑。
**选项**：
- **路线 1 · 最小改动**：前端继续留 GitHub Pages，只加手机号登录。改动最小，但国内可达性风险不解决。
- **路线 2 · 收拢腾讯云（推荐终局）**：静态托管 + 云函数 + 数据库全部收进 CloudBase，AI 代理也搬进来，
  只留一个国内域名。工作量大，但一次解决可达性 + 分散 + 跨域三个问题。
- **路线 3 · Vercel 当后端**：前端不动，用 Vercel 服务端凭证去调 CloudBase（服务端调用不受那道策略限制）。
  折中，但 Vercel 在国内是否可达仍是问号。
> **待用户拍板**。用户原话：「至于是否迁移，咱们再商量」。

### Q2. 真实用户主要在国内吗？
**背景**：`*.vercel.app` 实测**直连不通**（连控制组 `swr.vercel.app` / `hyperui.vercel.app` 都超时，
只有 `vercel.com` 主站正常），GitHub Pages 也慢。
**影响**：若用户在境内 ⇒ 这是**上线阻塞项，不是优化项**，必须走路线 2。
**验证方式**：请用户用**手机 4G/5G（关 WiFi、别开代理）**打开一次三个地址，反馈能否打开。

### Q3. AI 接口对全网开放是有意的吗？
**背景**：Vercel 自检返回 `"access_configured": false` + `"self_register": true` + `"free_limit": 5`。
地址又明写在公开的前端 JS 里（`runye-ai-plan.js` 的 `DEFAULT_API`）。
⇒ **任何人拿到地址就能自助注册并白嫖 5 次 AI 生成**，额度成本全记在用户账上。
**待确认**：是有意做免费引流，还是配置遗漏。

### Q4. 两个生产域名是否加入 CloudBase「安全来源」白名单？
`https://zhanglihui2026.github.io` 与 `https://runye-irrigation.vercel.app`。
**实测证据**：在生产 origin 下注入 SDK 实跑，报
`from origin 'https://zhanglihui2026.github.io' has been blocked by CORS policy`。
⇒ 不加白名单，**线上连匿名登录都起不来**。这条几乎不需要犹豫，属于"必然要加"。

### Q5. 匿名用户的策略是继续 `trial` 还是切 `locked`？
**背景**：既然匿名注定不能调云函数，匿名态只能靠本地缓存跑「体验版」。
本地体验要不要限制次数、AI 规划 / 在线地图这些有成本的入口要不要给匿名用户限额 —— 产品决策，需用户拍。

---

## 3. ⛔ 硬约束（别重复踩，这些已经查到底了）

### 3.1 匿名用户**不能**调用云函数 —— 平台禁止，非配置问题
三条独立成立的证据：

1. **探针实测**：拿 `ryEntitle`、`syncDb`、`calcStage` 以及一个**根本不存在的函数名** `__no_such_fn_xyz__`
   分别调用 ⇒ **四个全部返回 `EXCEED_AUTHORITY`**。
   不存在的函数也被同样拦 ⇒ **拦截发生在资源查找之前** ⇒ 环境级一刀切，
   可一次性排除"打包错/入口错/依赖错"这一整类怀疑。
2. **认证层是通的**：摘掉凭证 → `401 {"code":"MISSING_CREDENTIALS"}`；带匿名 token → `EXCEED_AUTHORITY`。
   错误码**变化** ⇒ 认证过了，卡在授权。
3. **实拍默认安全规则**：环境级默认规则内容就是
   `{"*":{"invoke":"auth != null && auth.loginType != 'ANONYMOUS'"}}` —— **明确排除匿名**。

**错误码对照（官方接口文档明确区分）**：
- `EXCEED_AUTHORITY` = 被**云函数安全规则**拦
- `ACTION_FORBIDDEN` = 被**身份鉴权机制**拦
- `MISSING_CREDENTIALS` (401) = 网关对无凭证请求的回复，早于授权判定

### 3.2 云函数安全规则在本环境**改不了**（只读）
- 「权限控制」弹窗里的 Monaco 编辑器**只读**，报 `Cannot edit in read-only editor`，【确定】按钮灰显。
- 后端 API `ModifyResourcePermission` / `DescribeRoleList` 在 PG 型环境直接报
  `does not support PostgreSQL type environments`（社区 issue #1403 同型同报错）。
- ⇒ 本环境（CloudBase 2.0 / PG 型）**把云函数安全规则冻结成只读展示**。

### 3.3 OPA 策略鉴权路线：**实测无效，别再试**
在「OPA 策略鉴权」页（表格视图）加了两条 allow：
`允许 / 云函数 / 所有用户（不限）` + `允许 / 云函数 / 匿名登录用户`，页面提示「保存成功」。
**三轮复测（保存后 0s / +2min / +6min）仍全部 `EXCEED_AUTHORITY`**。
页面自己写着「与平台默认策略共同生效，**拒绝优先**」—— 用户 allow 压不住平台默认拒绝。

### 3.4 三个**不是**入口的地方（已实测排除）
| 路径 | 实际是什么 |
|---|---|
| `#/identity/auth-control` | 身份鉴权，与 `EXCEED_AUTHORITY` 无关 |
| 「安全管控」菜单 | 是 OPA 那一页的入口，不是安全规则 |
| 云函数详情页的「鉴权设置」 | 同上 |

**真正的入口**：腾讯云官方《云函数》控制台文档（`cloud.tencent.com/document/product/876/46899`）里，
工具栏上是**并排的两个不同按钮**：「**权限控制**」（我们要的）和「**安全管控**」（OPA 页）。
⚠️ 弹窗里那条黄色提示「请使用【鉴权设置】OPA」**是误导**。

### 3.5 官方口径（唯一的好消息，路线 3 的理论依据）
腾讯云《云函数》文档「五、注意事项」第 2 条：
> 「权限控制**仅对客户端发起的调用生效，服务端始终具有全部权限**」

⇒ 这道闸只拦浏览器直连；**Vercel / 云函数 / 自建服务器等服务端发起可以绕过**。

### 3.6 结论（⛔ 2026-10-10 晚已被实测推翻并重写）
- ~~润野的云函数必须由已登录用户调用~~ → **实测：手机号登录用户调 ryEntitle/syncDb 仍 `EXCEED_AUTHORITY`**（②B 回环，uid=kzcRk1iTvkM3vkQXY27NhA，role=authenticated）。
- 叠加无凭证探针（401 MISSING_CREDENTIALS）与匿名探针，**三方一致：本环境所有客户端身份都被环境级一刀切拦截**。
- 官方口径「**匿名转正后 UID 不变、云端数据继承**」已实测兑现（手机号登录后 uid 与匿名一致），此部分仍有效。
- ⚠️ SDK 吞错假象教训：部分路径下 SDK 把 403 错误体当**返回值** resolve（res.result=undefined → callFn 返 null）⇒ 页面显示 `{result:null,error:null}`，勿据此判「调通」；判活必须看②B 回环或裸调抓 err.code。
- 时效注记：以上为截至 **2026-10-10 晚** 的实测状态；平台策略可能变化，复用前应按「诊断要点」重新定性。

---

## 4. 🐞 已知代码缺陷 / 待修项

| # | 位置 | 问题 | 建议修法 | 优先级 |
|---|---|---|---|---|
| ~~1~~ | `cloud-sync.js` `cloudInit()` | ~~无等待、无重试~~ | **✅ 已修复（v359，v359b 完善）**：SDK 未就绪时轮询等待（墙钟 10s 上限）再判 `sdk_not_loaded`；v359b 按审核意见补并发安全（共享 pending，真实 init 只调 1 次）+ 成功后清初始化阶段旧错误。原描述「永久失败直到刷新」过重 —— 实际影响是 boot 链路单次调用碰上 SDK 未就绪即整轮失败（fail-open），函数再次调用本可重试 | 已解决 |
| ~~2~~ | `runye-member-ui.js:410` `SDK_URL` | ~~运行时依赖 jsdelivr~~ | **✅ 已修复（v359）**：SDK 已自托管为 `pwa/vendor/cloudbase-js-sdk-3.8.2.bundle.js`（768KB 自包含 IIFE），三个页面（index / cloud-sms-test / cloud-diag）都用普通 `<script>` 标签同步加载；member-ui 里的 jsdelivr import 降级为 bundle 404 时的兜底。无头实测：**三页面 0 次 jsdelivr 请求，匿名登录全部成功** | 已解决 |
| ~~3~~ | `+esm` 非自包含 | ~~不能单文件拷贝~~ | **✅ 已解决（v359）**：esbuild 0.28.2 打包（入口 `_ry_sdk_entry.mjs`：import SDK → 挂 window.cloudbase → 派发 cloudbase-ready）。打包脚本 `_bundle_sdk.cjs` 在交付物目录。**坑：npm 装 esbuild 必须带 `--ignore-scripts`**（否则 postinstall spawn 另一版本 node 报 EBUSY）；且 esbuild 必须写进 package.json，否则下次 `npm install` 会被当多余包清掉 | 已解决 |
| 4 | `runye-member-ui.js:20` | `INVITE_PAGE = ''` 邀请落地页地址**未填** | 会员 H5 部署后回填，或用 `window.RY_INVITE_PAGE_URL` 覆盖 | 中 |
| 5 | 生产环境 | GitHub Pages / Vercel 上**都是老版本前端**，无会员代码 | 用户确认发布后再推（见 §7 发布纪律） | 中 |

### 🚧 v359 新发现：`.gitignore` 把会员云同步层挡在仓库外（发布阻塞项）
`.gitignore` 第 21-22 行（「云端诊断/CloudBase 本地文件（不发布到 GitHub Pages）」）明确忽略：
- `cloud-sync.js`（**会员/同步的唯一适配层，没它整个会员体系在前端跑不起来**）
- `cloud-diag.html`（诊断页，可不发）

同时这些文件**从未被 git 跟踪**（`git ls-files` 为空）—— 这与「GitHub Pages 生产环境会员三件套全 404」完全吻合。
另外 `runye-entitle.js`、`runye-member-ui.js` 也**未被跟踪**（不在 ignore 名单，只是从没 add 过）。

⇒ **将来发布时的必做清单**：
1. 从 `.gitignore` 移除 `cloud-sync.js`（历史顾虑应是「含密钥」——现在里面只有 **Publishable Key，本就是公开设计的**，无风险）；`cloud-diag.html` 视需要。
2. `git add cloud-sync.js runye-entitle.js runye-member-ui.js pwa/vendor/cloudbase-js-sdk-3.8.2.bundle.js`（bundle 已入库）。
3. 确认 Vercel 侧副本同样带上这几件。
4. sw.js 是 network-first（在线永远走服务器），不 bump VERSION 也不会卡旧版；若想把 bundle 纳入离线 CORE 再另说（会员功能本需在线，非必需）。

---

## 5. 当前进度

### ✅ 已完成
- 账号体系统一为手机号（代码改造完毕）
- 云函数 `ryEntitle`（权益）+ `syncDb`（跨设备同步）**已部署成功**
- CloudBase 套餐**已升级个人版**（40,000 资源点/月；短信 50 点/条）
- `EXCEED_AUTHORITY` **根因完全闭环**（证据见 §3.1）
- 生产环境核查完毕（老版本 + 白名单缺失 + Vercel 后端健康）
- 本地短信测试页 `cloud-sms-test.html` 已就绪并通过自检
- **[v359] CloudBase SDK 自托管完成**（2026-10-10）：`pwa/vendor/cloudbase-js-sdk-3.8.2.bundle.js`（768KB，esbuild 打包自包含）；`cloudInit()` 就绪等待已修；闸门 `verify_ry_tool.js` 全部通过；三页面无头复测 PASS（0 jsdelivr 请求 + 匿名登录成功）。**至此会员链路在前端侧已无外部 CDN 依赖**，重测不会再卡在 `sdk_not_loaded`
- **[v372 2026-10-11] 插件化阶段一上线**：`core/` 六模块 + `plugins.json` + 两个插件（hello-world 样板 / archive 业务样板）
  + `PLUGIN_DEV.md`。`index.html` 只加了一行 `<script type="module" src="core/bootstrap.js?v=1">`，删掉即整体卸载。
  **存储已定案走 `ry_kv`（`app.rdb()` + RLS）**，不再尝试云函数（见 §3.1，客户端一律被拦）。
  闸门：`_gate_plugins.cjs`（13 契约 + 5 注入体检 + 还原复检，全绿）、`_smoke_plugins.cjs`（真实 index.html 冒烟）。
  ⚠ **存量红灯**：`verify_nav_compact.js` / `verify_nav_switch.js` 在本次改动**前**就已报红（v346 导航收敛后未同步更新），已做 BEFORE/AFTER 对照确认非本次引入，需单独立项。
- **[v373 2026-10-11] 插件化阶段二 ~ 四完成**：
  + 阶段二 `plugins/bom/`（复用既有 BOM 内核 `RyMaterialAudit`，非重写）+ archive 插件扩展「实测反馈 / 偏差率」（红=超支、绿=节约）。
  + 阶段三 `plugins/case-lib/`（相似案例检索 + P25/中位/P75 造价区间 + 报告导出；加权：面积 .4 / 作物 .25 / 区域 .2 / 水源 .15）。
  + 阶段四 `plugins/pipe-optim/`：**老模块 `pipe_optim_ui.js` 一行业务逻辑都没改**，外面套壳接管入口 + 事件桥接 + 卸载还原。按钮落在**原容器** `fn-more-panel`（位置不变），无「双入口」。
  + core 增强：`ui-shell` 导航项支持 `container`（自定义容器，被重建冲掉时退回主导航条，**入口不能丢**优先于位置一致）；`event-bus` 登记 `pipe-optim-export`。
  + SW `VERSION` → `v373-plugin-pipeoptim`（**改 core 文件必须同步改，否则离线态取旧文件**）。
  + 闸门扩到 **25 契约 + 17 组注入体检**（新增 C22–C26 / I13–I17），全绿；并实测「注入 I13 后 `EXITCODE=1`」证明闸门拦得住。真实页面冒烟 16 项全绿。
  + ⚠ 两处新踩坑（已写进 `PLUGIN_DEV.md` §9）：① 卸载时**不许摘**老模块弹窗根节点（闭包仍握引用，摘了就「点了没反应」），只 `display:none`；② 等老模块就绪要**等条件**不要写死 sleep（实测 40×50ms ≈ 2317ms，闸门写死 2300ms 会差 17ms 假红）。
  + 📌 **待用户决策**：① 登录态存 5 条档案后确认都能从 `ry_kv` 找回；② 是否删掉 `index.html` 里 `<script src="pipe_optim_ui.js">` 那一行、完全收归插件（现保留，可逆）。
- **[v374 2026-10-11 晚] 阶段三补齐「参考方案」**：`core/data-service.js` 新增 `recommend()` ——
  在 `findSimilar` 之上再给两层：逐管段 DN（首部/主管/支管按**相似度加权投票** `0.5+score`，附 confidence）
  + 参考拓扑（干管/支管/滴灌带**亩均长度取中位**，不用均值）。case-lib 面板顶部渲染，只做参考、不写回、不改水力计算。
  口径取舍：加权但留 0.5 底（不让单个高相似案例独断）；取中位（亩均样本长尾重，均值会被带偏）。
  闸门 **27 契约 + 19 组注入体检**全绿（新增 C27/C28、I18/I19；C28 刻意让「中位 40 ≠ 首值 20 ≠ 均值 60」）。
  SW `VERSION` → `v374-plugin-reco`。
- **[v375 2026-10-11 晚] 阶段三第 3 项「水力参数反推」落地（opt-in 硬闸门）**：
  + `core/data-service.js` 新增纯计算三件套 `hazenLoss()` / `invertHazenC()` / `hazenDefaults()`
    （公式与 `hydraulic-calc/hc-core.js`、`index.html hazenWilliams()` 同源；默认 C 优先取 `window.C_HAZEN`）。
  + 新插件 `plugins/calib/`：填 L/Q/D/实测 hf → 反推 C + 与默认 C 偏差 + 理论 vs 实测损失 + **口径文档**（Core 提供，与代码同源）。
  + **opt-in 三条硬闸门**：勾选框默认不勾；未勾选点写入直接拒绝；勾选后**只写档案 `design.optimization.hazenC`**。
    ⚠ 主程序 `C_HAZEN` / `hazenWilliams()` **没有任何插件能改** —— ctx 里根本没有这条通道（方案硬性要求）。
  + 补掉阶段一验收第 4 项：C31 验证 `applyProject` 后主程序 `tlDiagramData` 真的被换成档案快照（此前只验了通道）。
  + 闸门 → **30 契约 + 23 组注入体检**全绿；冒烟 18 项全绿。SW `VERSION` → `v375-plugin-calib`。
  + ⚠ **本环境一个坑**：用 python 脚本重写 `.md` **会在下一轮被回滚**（进程内回读是有的、下一轮就没了）；
    用 Edit/Write 工具写才持久。改文档一律用编辑工具，改完再 grep 复验。
- **[v376 2026-10-11 晚] 存量红灯清零 + 顺带修掉两条真缺陷**（详见方案文档 §11.8）：
  + **真缺陷 1 · 插件同名双入口**：bom 插件导航叫「材料清单」撞老导航同名项 → 改名「BOM 导出」；根因是标签写了**两份**（manifest + main.js 写死），archive/bom/case-lib 三个插件统一改为只认 `ctx.manifest.ui.nav.label`；
  + **真缺陷 2 · 面板锚点 href 漏 `#`**：`runye-nav.js` 拼 `root + base + hash`，主页 `index.html` 无 `data-base` ⇒ `href="detailsSection"`（相对路径）→ 解锁态点「更多 ▾」面板项**跳 404 而不是跳锚点**；且 `mod/inline-18.js` 的事后改写会被权益就绪触发的 `RyFnNav.render()` 重建冲掉（**时好时坏**）。已修为 `root + (base || '#') + it.hash`；
  + **两条红灯闸门复活**：`verify_nav_compact.js`（根因：v344 起裸 index.html 跳 `?smart=1`，CSS 把 `.fn-nav` 藏了 → 过去整份闸门在量隐藏导航条、0==0 空过；改走 `?full=1&rymock=L2` + 新增 Z 项反空过前置断言 + 期望按 v346 后现状更新）、`verify_nav_switch.js`（导航脚本已抽成 `mod/inline-18.js`，按文件定位；`rySetTab` 在 `mod/inline-09.js`）。**都做了注入体检证明拦得住**；
  + 插件闸门 → **32 契约 + 25 变异**全绿（新增 C32 同名双入口 / C33 标签单一来源，变异 I24/I25）；真页面冒烟 **19 项**全绿（新增真页面同名双入口体检）；`verify_ry_tool.js` EXIT=0。SW `VERSION` → `v376-nav-href-fix`（改 `runye-nav.js` 必须升，它在 SW CORE 白名单里）。
  + **§7 开源本地准备（未发布）**：新增 `plugins/_template/`（manifest + main.js + style.css 三件齐、逐行中文注释，复制改名即用；受 C34/I26 闸门看管）；README 增补「插件生态」章节 + **安全声明（Trust-by-code）**（§7 第 4 条要求写进开源 README 的那条）；PLUGIN_DEV.md 快速起步改为「先复制模板」。闸门 → **33 契约 + 26 变异**全绿。
- **[v377 2026-10-11 深夜] 阶段五壳迁移打样：水力校核 → `plugins/hydraulics/`**（详见方案文档 §11.9）：
  + **迁移形态**：水力校核是独立页面 + 顶级导航项，与 pipe-optim（面板按钮、注入一次）不同 —— 老项由 `RyFnNav.render()` 渲染、**权益就绪会重渲染复活**。方案 = 条件 probe 等老项 + 摘除 + **抑制器 MutationObserver**（复活一次摘一次）+ `deactivate` 按存根插回原位。业务零改动（href 都在 manifest.config 里）。
  + **core 增强**：`ui-shell.js` ① `placeIn` 支持 `item.before`（CSS 选择器锚点，插到命中兄弟之前）；② mountNavs 对「锚点暂缺」做**有界重试**（≤20 帧）再退 appendChild —— 真页面权益重渲染分块重建，重挂载常跑在「更多 ▾」重建完成之前。
  + **runye-nav.js 增强**：`mount()` 重渲染会把老项逐个 appendChild 到末尾、把第三方项（插件/会员徽标）挤到后面 —— 末尾按原相对顺序把它们移回「更多 ▾」之前。
  + **插件侧真 bug（闸门 C35 抓到）**：hydraulics 模块级 `stopped` 在 deactivate 后不复位，ES 模块只加载一次 ⇒ 第二次 activate 全短路。已在 activate 开头复位状态。
  + **闸门**：34 契约 + 28 变异全绿（新增 C35 接管+原位+复活抑制、C32 升级为轮询等 7 项导航齐再查同名；I27 matchLabel 写错→C32+C35 双红、I28 core before 失效→C35 红）。真页面冒烟 **23 项**全绿（新增 hydraulics 激活 / 接管+位置 / Node 侧点击→真跳 `runye-hydraulics.html`）。`verify_nav_compact` 期望同步 18 老项 + 7 插件项 + M2 重试消抖；href 注入复检 EXIT=1 拦截有效。`verify_ry_tool` EXIT=0。SW `VERSION` → `v377-plugin-hydraulics`（改 core/ui-shell.js + runye-nav.js 必须升）。
  + **遗留抖动记录**：verify_nav_compact M2 曾出现一次「权益重渲染正好冲掉打开态」（panel.h=0），已加重试兜底；若再现红色 M2b 先怀疑重渲染时序，别急着改断言。

- **[v378 2026-10-11 深夜] 阶段五第 2 项：管路拼装 → `plugins/pipe-assemble/`**（详见方案文档 §11.10）：
  + **形态**：独立页面 `管路接驳拼装.html` + 入口在「更多 ▾」**面板内**（`MORE_ITEMS`），由 `RyFnNav.render()` 渲染、**权益就绪会重渲染复活** ⇒ 走「hydraulics 的抑制器 + pipe-optim 的 container」合体方案。
  + **core 增强（core/ui-shell.js）**：① 抽出 `anchorFor()` —— 落位锚点两种写法共用：`before`（CSS 选择器）/ **`beforeLabel`（按可见文字找兄弟，含 `·锁` 归一化）**，20 次有界重试也共用它；面板项只有 `data-ry-navitem="1"`、`href` 还随页面有无 `data-base` 变，只能按文字定位。② 导航项支持 **`gate` / `onLocked`**（会员门控透传）：锁定态显示「原名 ·锁」+ `data-ry-locked`，且 **gate 在点击那一刻重算**（不是挂载那一刻）；③ 新增 `refreshNavs()`（权益变化后刷新锁定态，不重建节点）。
  + **★ 补掉 v377 遗留缺陷**：壳迁移只搬了入口、**没搬会员门控** —— 老项 `feat='pro-others'/'hydraulic-check'`（L2）在老入口带「·锁」+升级引导，换成插件导航后闸没了 = **付费功能对全员开放**。hydraulics 与 pipe-assemble 一并接回，`gate()` 沿用 `runye-nav.js` 的三态 fail-open（未加载/未就绪→放行，拿到真相才严格判）。真页面实测：接管后插件项文本为「水力校核 ·锁」「管路拼装 ·锁」（v377 时是无锁的，洞确实存在）。
  + **闸门**：**35 契约 + 31 变异**全绿（新增 C36：接管 + 面板内原位 + 复活抑制 + **门控行为体检**（造「已确认无权限」权益层断言真变锁定态；**不点按钮** —— 门控若失效会真跳页、把整轮闸门带崩）；I29 matchLabel 写错→C32+C36、I30 core beforeLabel 失效→C36、I31 门控被摘→C36）。真页面冒烟 **26 项**全绿（新增 pipe-assemble 激活 / 面板内原位置（前=系统图、后=经济指标分析）/ DOM click → 真跳 `管路接驳拼装.html`）。`verify_nav_compact` 期望同步 **17 老项 + 8 插件项**（M2 面板 11 项顺序不变）；`verify_nav_switch` / `verify_ry_tool` EXIT=0。SW `VERSION` → `v378-plugin-pipeassemble`。
  + **§6 余量**：滴灌带查询（`feat:''` 免费、无门控，比本次更简单）→ AI 规划 → 会员体系。
- **[v381 2026-10-12 早晨] 阶段五第 3 项：智能规划 → `plugins/ai-plan/`**（详见方案文档 §11.12）：
  + **形态**：`runye-ai-plan.js`（82KB）由主页第 19 行同步加载、业务零改动；入口是 `runye-nav.js` ITEMS 第一条，而它是 **`win:1` 独立窗口**语义 —— 与前三个迁移都不一样。
  + **★ 最贵的一条**：`open()` 逐行复刻老入口的四步（静默存档 → 写 `runye_aiplot_anchor_v1` 锚 → `window.open(href,'runye_smart','width=1180,height=860')` → 被拦截才回落本页跳转）。写成 `location.assign` 会让用户正在画的地块分区被整页冲掉（v331 要求当场作废）。href 必须原样带 `?smart=1`。
  + **门控**：`feat:'ai-plan'`（L1），沿用三态 fail-open。第二个入口 `#ppAiPlan`（老设计方案区块内按钮，带参数快照）**不接管**，两套入口不打架。
  + **顺带登记复用通道**：`window.RyAiPlan` 已挂好（Node 也能 require），插件只暴露 `kernel()/kernelReady()/provenance()`，不重复实现。
  + **踩坑（真缺陷，已修）**：ai-plan 与 hydraulics 都锚 `.fn-more` 时，**谁先挂载谁离锚点更近**，而插件激活顺序不定 ⇒ 导航顺序被倒置（智能规划跑到水力校核后面，C35 当场红）。修法：`beforeLabel: '水力校核'` + core `anchorFor()` 支持「`beforeLabel` 没命中才降级用 `before` 选择器」。
  + **闸门**：**38 契约 + 39 变异**全绿。新增 **C39**（接管 + 原位 + 抑制 + **弹窗语义**：stub `window.open` 后点击，断言 open 只调一次、url/窗名/尺寸全对、存档被调用、锚点已写、本页未跳转、回落分支仍在）+ **I36–I39**（匹配串/降级成本页跳转/href 丢 smart=1/不存档）均验证拦得住。真页面冒烟 **29 项**全绿（新增两条：老项已摘且插回「更多 ▾」前；点击确实走 window.open 且参数全对）。`verify_nav_compact` 期望同步 **16 老项 + 9 插件项**（DOM 顺序实测 `ai-plan → hydraulics` ✓）。SW `VERSION` → `v381-plugin-aiplan` 并把 ai-plan 两文件登记进 CORE。
  + **本轮顺带修掉闸门自身的两个缺陷**（都会产出假信号，详见 §7 第 6/7 条）：① 变异还原改到 `finally`（以前抛错就不还原，留下"被改坏但仍能跑"的源码）；② 「回初始态」改 `goto(GATE_URL)`（以前 `page.reload()` 会停在被上一条带跑的页面上，造成最后两条变异连续超时 + 整轮慢到十几分钟）。另新增 `node _check_unmutated.cjs` 作为中断后的源码体检。
  + **§6 余量**：滴灌带查询（`feat:''` 免费、无门控）→ 会员体系。

- **[v379 2026-10-12 凌晨] 水力校核「真改造」：从壳变成水力计算内核宿主**（详见方案文档 §11.11）：
  + **为什么必须改**：主页 `index.html` **不加载** `hydraulic-calc/hc-core.js` 等三件套（只有 `runye-hydraulics.html` 自己用 `<script>` 加载），且插件体系只在主页跑 ⇒ 主页上下文里**根本没有这套内核**。后果是 `core/data-service.js` 的 `hazenLoss` 只能走 v375 抄进去的那份内置实现，**口径回到两份**。
  + **做了什么**：① `plugins/hydraulics/main.js` 新增串行加载器（`hc-core.js → design-core.js → runye-hydraulics-core.js`，**顺序敏感**：design-core 构造时取 `root.RyHcCore`，hydraulics-core 缺前两者直接 throw），站点根由 `import.meta.url` 反推（防子目录页解析错），等条件不等 sleep，60×50ms 上限，并发共享 promise，失败 fail-open（只 reportError，入口照常可用）；② 加载完 emit 新事件 `hydraulics-core-ready`；③ 通过 api 暴露 `loadCore / coreReady / hazen / christiansenF / compute` 给其它插件用，返回 `null` 表示「内核没到」（不许造一个看起来合理的假数）。
  + **消灭口径双份**：`core/data-service.js` 的 `hazenLoss` 改为**优先调用** `RyHcCore.hazen()`，没内核才用内置兜底；`hazenDefaults()` 新增 `engine: 'hc-core' | 'builtin'` 字段明示「这个数是哪来的」（UI/归档能答）。已用 Node 交叉校验：内核与内置式在 L/Q/D/C 全组合下**相对偏差 = 0**。
  + **闸门**：**37 契约 + 35 变异**全绿。新增 **C37**（口径单一来源四条硬断言：无内核兜底能算 / 忠实内核逐值相等 / **挂一个返回值=3.7 的伪装内核，data-service 必须跟着变** ← 唯一能证明「确实在调内核而非各写一份」的断言 / 内核返 0 或 NaN → null）+ **C38**（hydraulics 真把三内核请进主页并能算，含独立手算交叉校验）。变异 **I32**（口径退回自抄）/ **I33**（engine 写死）/ **I34**（关 autoloadCore）/ **I35**（串行链被短路）均验证拦得住。真页面冒烟 **27 项**全绿（新增：三内核齐 + hazen 与手算一致 + Christiansen F 可算 + `engine==='hc-core'`）。SW `VERSION` → `v379-plugin-hydcore`。
  + ⚠ **踩坑两条**（都写进代码注释）：① `alreadyInPage()` 用「页面里有没有这个 `<script>` 标签」判断是否补载是错的 —— **标签在 ⇏ 全局在**（脚本报错/被移除/测试里被手动删过），会白等到超时；判据只能用目标全局是否出现，拿不到就重新注入（UMD 重挂 global 无副作用）。② 写 C38 时**不能**在里面主动调 `api.loadCore()` —— 否则 I34（关掉 autoload）会被"救活"，闸门再也区分不了「自动加载」与「有人替它加载」。
  + **§6 余量**：滴灌带查询（`feat:''` 免费、无门控，最简单）→ AI 规划 → 会员体系。

### 🔄 进行中 —— 会员跑通（用户当前主要要求）
**唯一未知数**：手机号登录后能否调通云函数？需要用户跑一次实测：
1. 本地起服务：`cd C:/Users/AHS/runye-irrigation && python -m http.server 8080`
2. 浏览器开 `http://localhost:8080/cloud-sms-test.html`
3. 走「发验证码 → 登录 → 调云函数」，页面会自动出结论
4. 两个附带验证点：① 全新手机号能否**自动注册** ② 同号二次登录 **uid 是否不变、到期日是否不被重置**

> 2026-10-10 复测注记：匿名调云函数仍 `EXCEED_AUTHORITY`（裸调 ryEntitle 与不存在函数均 403，环境级一刀切未变）。
> 但 SDK 已本地化，前端侧不再有 `sdk_not_loaded` 风险，实测可聚焦「手机号登录 → 调函数」这一步。

### ⏸️ 待用户拍板
见 §2 的 Q1–Q5。

---

## 6. 可复用工具索引

| 工具 | 位置 | 用途 |
|---|---|---|
| `cloud-sms-test.html` | `runye-irrigation/` 根目录 | 手机号登录 + 调云函数**实测页**，自带结论输出与「复制结果」按钮 |
| `_smoke_live.cjs` | `C:/Users/AHS/Doubao/chats/2026-10-10/new-chat-1/` | 线上链路烟测（A 就绪 / B 登录 / C 云函数 / D 本地降级） |
| `_probe_authz.cjs` | 同上 | 权限**定性探针**：区分"一刀切拦所有函数"还是"只拦某个函数"（含不存在函数名对照） |
| `_check_sms_page.cjs` | 同上 | `cloud-sms-test.html` 的**无头自检**（断言就绪文案、按钮启用、4xx/5xx 完整 URL、无 pageerror） |
| `_probe_prod_origin.cjs` | 同上 | 在**生产 origin** 下注入 SDK 实跑，判定白名单是否放行（CORS 拦 = 没白名单） |
| `_probe_vercel.cjs` | 同上 | Vercel 可达性双模式探测（默认走代理 / `--no-proxy-server` 强制直连） |
| `润野灌溉-云函数部署手册.md` | 同上 | 部署全流程 + 三条路线 + 全部实拍记录 |
| `润野灌溉-上线架构方案对比.md` | 同上 | 架构现状 / 三处硬问题 / 三条路线 / 建议 |

**运行环境**：Node `C:/Users/AHS/.workbuddy/binaries/node/versions/22.12.0/node.exe`；
`puppeteer-core` 在 `C:/Users/AHS/.workbuddy/binaries/node/workspace/node_modules`；浏览器用本机 Edge headless。

---

## 7. 诊断手法与作业纪律（都是踩过坑换来的）

### 诊断套路
- **判「认证层 vs 授权层」**：摘掉凭证再打一次，错误码**变化** ⇒ 认证已过、卡授权。
- **判「资源级 vs 环境级」**：用**不存在的资源名**当探针；同样被拦 ⇒ 拦截先于资源查找 ⇒ 环境级一刀切。
- **判「白名单」**：在目标 origin 下实跑，**CORS 拦 = 没白名单**；能过 CORS 但报 `EXCEED_AUTHORITY` = 白名单已放行。

### 作业纪律（违反必然产出假阴性）
1. **慢时序一律"等条件"而不是"盲等 sleep"**。
   实测教训：`_smoke_live.cjs` 曾 `await sleep(6000)` 盲等，ESM 还没挂上 window ⇒ 产出**整页假阴性**
   （看起来像天塌了，实则只是没等到）。改用 `page.waitForFunction(() => typeof window.cloudbase !== 'undefined')` 后立刻全绿。
2. **单次调用不加重试 = 假阴性发生器**。`ensureAnon()` 在 SDK 刚落地那一刻偶发 `sdk_not_loaded`，
   必须给有限重试（3 次 × 4s 已验证有效）。
3. **curl 的结论可能是假阴性，判定外部服务可达性必须用真浏览器复核**。
   实测教训：`curl https://runye-irrigation.vercel.app/api/ai-irrigation` 返回 `000`，
   据此差点判定"Vercel 完全不通"——**实际是沙箱代理拦了 `*.vercel.app`**，真浏览器拿到的是 **200**。
4. **页面/脚本交给用户之前，自己必须先无头跑一遍自检**；报告要打印 4xx/5xx 的**完整 URL**
   （只写"有个 404"无法判断是否要紧，例如 favicon 的 404 就无关）。
5. **给用户的操作步骤要"别让我点来点去"**：用户已明确要求尽量少手工操作。
   能用脚本探测的先探测，能把结论自动打印出来的就自动打印。
6. **[v381] 闸门被中断 ≠ 源码干净 —— 必跑 `_check_unmutated.cjs`**。
   注入体检是**就地改源码**再跑的（写变异 → reload → 跑契约 → 还原）。
   一旦中断在「已写入变异、尚未还原」这一步，源码就停在变异态，
   而它看起来就是一份正常源码：能读、能编译、页面能跑，只是行为被悄悄改了。
   2026-10-12 实测踩到两次：`plugins/ai-plan/manifest.json` 被留在
   `href` 丢 `?smart=1` + `saveProject:false` 的状态下，整整一轮没人发现。
   现已在闸门里加 `finally` 还原兜底（抛错也还原），另配 `node _check_unmutated.cjs`
   作为外部核查。⇒ **中断后先体检，再谈别的。**
7. **[v381] 「变异体检超时」先怀疑页面被上一条带跑了，别急着改断言**。
   闸门里凡是「回到初始态」都必须 `goto(GATE_URL)`，**不能 `page.reload()`** ——
   reload 重载的是当前 URL；若有契约/变异把页面导航走了（实测：I37 把 ai-plan 的
   `mode` 改成 navigate，C39 那次点击就真的跳到了 index.html），
   后续所有 reload 都停在 index.html 上，`__bootReady` 永远等不到，
   表现是「最后两条变异连续超时 + 整轮慢到十几分钟」，很像"变异有毒"，其实不是。
   闸门已加自救日志：发现不在闸门页会打印 `[闸门自救]`。

### 🔒 发布纪律（**重要**）
**改完文件不要自动发布。** 本地改动 + 本地 `git commit` 可以，
但 **CloudStudio 部署 / GitHub 推送 / 任何对外可见的更新，必须等用户明确说"发布"**。

---

## 8. 一句话交接

> 会员代码写完了，云端函数也部署了，卡在**平台不给匿名调云函数**这道闸上 —— 已经查到底，改不了。
> 正解是**让用户用手机号登录**，这一步还没实测过。
> 请先陪用户跑一遍 `cloud-sms-test.html`；
> 迁移架构、AI 接口开放度、白名单这几件事，**等用户拍板，别自己动手**。
>
> **2026-10-11 深夜补注（v378）**：插件化已推进到阶段五第 2 项（水力校核 + 管路拼装壳迁移完成，35 契约+31 变异、真页面冒烟 26 项全绿）。
> 当前主线 = §6 剩余老模块迁移（滴灌带查询 → AI 规划 → 会员体系），从「▶ 当前任务」一节开工。
> ⚠ 壳迁移务必连**会员门控**一起搬（v378 补的洞：只搬入口会让 L2 付费功能对全员开放）。
> 云函数拦截问题依旧挂起（见 §0），等用户拍板架构路线。

> **2026-10-12 补注（v382，主线已切换）**：插件化阶段五已完成 4 项（+ ai-plan v381：38 契约+39 变异、冒烟 29 项全绿）。
> **当前主线 = 数据资产化主链路收口（方案文档 §12 六步计划）**：Step -1 数字农业完全剥离已交付（41 契约+40 变异全绿，含 C40/I40 与一个值得记住的假绿教训），**下一步 = Step 0 land-store 加壳**，从「▶ 当前任务」一节开工。
> ⚠ 三条已向用户同步的剥离影响（花生工具手工填面积、工作台握手消失、页面目录保留无入口）**是拍板代价不是缺陷，勿"修复"**。

---

## 9. 🔐 会员门控链路安全审计报告（2026-10-16 · v513-sec-gate）

> 用户原话：「检查一下 从主界面 切换到智能规划页面，智能规划页面又切换回完整工具，
> 整个链路是否安全，有没有什么漏洞，可以破解会员系统的，查出来，能改就改掉，
> 改不掉要重点记录。」
> 授权范围＝用户本人项目自查。审计脚本 `_sec_audit.mjs`（gitignore，**生产态仿真**：
> 起本地静态服务 + Edge `--host-resolver-rules=MAP runye-audit.local 127.0.0.1`，
> 让 `location.hostname` 既非 localhost 又是 http ⇒ 走**线上分支**，否则
> `isLocalTestHost()` 会把后门放行、测不出真结论）；线上只读探测 `_sec_live.mjs`。

### 9.1 已修（实测转绿）

| 编号 | 严重度 | 漏洞 | 修法 | 文件 |
|---|---|---|---|---|
| **B** | ★★★ | `RyEntitle.mockPlan` 是**普通可写属性** ⇒ 控制台一行 `RyEntitle.mockPlan='L2'` 让 `can()/access()` 全部放行 | 改闭包变量 `mockPlanVar` + `Object.defineProperty(..., {get, configurable:false})` 只读访问器；取值条件里再算 `isLocalTestHost()` ⇒ 线上恒 `null` | `runye-entitle.js` |
| **C2** | ★★★ | `RyEntitle.state` 交出的是**活对象** ⇒ `E.state.entitle={plan:'L2'}; E.state.trial=false` 就地提权（等级直接显示「高级会员 · 26740 天」） | 交出前 `freezeState()` 深冻结（`entitle/progress/invites/claims/rewards` 各元素）；内部一律换新对象赋值，冻结无副作用 | `runye-entitle.js` |
| **A2** | ★★★ | 绘图编辑器静态按钮 `#ppAiPlan`（「AI 规划」**第二入口**）此前**零权益校验**，`?rymock=locked` 下仍能打开 | 补 `aiPlanAccess()` **fail-closed**（取不到权益层即 denied，与导航的兼容放行刻意不同）+ `RyEntitle.bindControl` + 无权走 `RyMemberUI.showUpgrade` | `mod/plot-editor.js` |
| **E** | ★★★ | `terrain/index.html`、`管路接驳拼装.html` 独立 URL 直达**零门控** | 地形门控加在 `terrain/terrain-ui.js`（该文件是独立页与主页 `#terrainSection` 的**唯一共用实现** ⇒ 一处覆盖两个入口）；管路拼装页注入同款门控脚本 | `terrain/terrain-ui.js`、`管路接驳拼装.html` |
| **I** | ★★★ | 主页地址栏直接敲 `index.html#terrainSection` 可绕过导航点击门控（v401 起 hash 直达拦截已移除） | 同 E（`terrain-ui.js` 统一门控），并挂 `RyEntitle.onChange` + 20s 轮询兜底 | `terrain/terrain-ui.js` |
| **G** | ★★ | 智能规划侧栏「地形模块 / 水力校核」是**独立页 href**（自带门控但不一致） | 改为走主站门控的 in-app 锚点 `index.html#terrainSection` / `#hydraulicsSection` | `runye-ai-plan.js` |

**设计要点（本次过程中发现并当场纠正，避免了一次线上事故）**：主页内 `#terrainSection`
的门控**必须**用**区块内 `absolute` 遮罩**，不能用全屏 `fixed` —— 否则任何无权用户
一打开主页就被遮罩盖住**整个软件**。审计里加了回归护栏向量 **I0** 锁死这一点，并有
正向对照 **I2**（本地管理员 L2 ⇒ 遮罩撤掉、估算按钮有输出）确认不误伤付费用户。

### 9.2 ⛔ 未修 —— 纯前端门控的结构性上限（**重点记录**）

| 编号 | 现象（实测） | 为什么修不掉 | 缓解 |
|---|---|---|---|
| **C3** | 控制台覆写判定函数本身：`RyEntitle.can=()=>true; RyEntitle.access=()=>'allowed'` ⇒ 全部 allowed（`writable:true`） | 只要判定逻辑跑在用户能改的 JS 里，就必然可被改；`Object.freeze` 拦不住给实例属性赋值/覆写，封成 `configurable:false` 也会被整体替换 `window.RyEntitle` 绕过 | **真正的付费墙是服务端 entitlement**：所有写操作走 `/entitle`（云函数持服务端身份直写 PG），前端门控只是 UI 层 |
| **D** | 屏蔽 `runye-entitle.js` 后 `runye-nav.js` 走 **fail-open**（`!E → 'allowed'`）⇒ 21 个导航项全部解锁（`blockedCount:0`），**单个脚本即可绕过** | 是 v358 起的有意设计（老页面/未加载权益层时保留兼容放行），改成 fail-closed 会让「权益层加载失败」直接变成全站不可用 | 关键动作**都另有一层校验**（各插件 `gate()` + 服务端）；若要彻底，只能把 L2 能力的**数据**（而非入口）挪到需鉴权的服务端接口后面 |
| — | `runye-map-measure.html`（在线地图＝L1）、`耐特菲姆滴灌带长度查询器.html`（`feat:''` 免费）无门控 | 非漏洞：L1 对匿名 trial 本就放行、查询器是公开小工具 | 无需处理 |

> **一句话结论**：能改的 6 处都改了；剩下「覆写判定函数 / 屏蔽权益脚本」属于
> **纯前端门控的物理上限**，只要业务数据仍在浏览器里就算"能算出来"。要把这两条
> 真正闭合，方向只有一个——**把 L2 能力的计算与数据搬到需鉴权的服务端接口后面**
> （对应 §2 Q1 架构迁移的同一个答案）。

### 9.3 实测已安全（无需改，留作回归基线）

* **D2** 线上域名下本地管理员不可用：`localAdminAvailable()=false`、`activateLocalAdmin()=false`、`plan` 仍 `L1`。
* **H** `/entitle` 网关负向鉴权：`adminMemberGrant` / `pluginsSet` / `get` 无 token 与伪造 token **一律 code 401**；线上只读探测：`adminMembers` → **403「无会员管理权限」**，`pluginsGet` → code 0 但 `admin:false`。
* **F** 匿名 trial 只拿 L1 四功能（`zone-split/ai-plan/pipe-layout/online-map`），L2（`drawing-export/bom-export/hydraulic-check/pro-others`）全 denied。
* **服务端权威**：`sql/route_c_migration_v5_rls_tighten.sql` 已 revoke 浏览器身份对 `ry_entitle/ry_invite/ry_links/ry_bind` 的写权限（写只留 service_role）；`api/ai-irrigation.js` 校验 Bearer 访问码。
* **J（全站普查）** 站内带门控页：`index.html`（插件级 + 地形区块）、`terrain/index.html`、`runye-hydraulics.html`、`管路接驳拼装.html`、`invite.html`。
* `plugin-admin.html`（润野管理后台）页面本身公开可见，但**所有动作服务端鉴权**（实测 403），非漏洞。

### 9.4 审计/回归脚本与结果

| 脚本 | 用途 | 结果 |
|---|---|---|
| `_sec_audit.mjs` | 门控链路全向量（D/D2/A/A2/B/C/C2/C3/E/F/G/H/I0/I/I2/J） | **28 过 / 1 红**（唯一红＝C3 结构性上限，已在 9.2 记录） |
| `_sec_live.mjs` | 线上**只读**探测（绝不写生产库） | **5 过 / 0 红** |
| `verify_nav_switch.js` | 导航切换回归 | **30 过 / 0 红** |
| `_smoke_publish.mjs` | 双页发布冒烟（期望版本已更新） | **ALL PASS** |

### 9.5 发布

* `commit 4d76c79`（`v513-sec-gate`），已 push；随后一次小提交统一 `?v=` 标签。
* 线上核对（GitHub Pages）：`sw.js = v513-sec-gate-hydraulic-coord`、
  `terrain/terrain-ui.js` 含 `terrainEntitlementGate`、`index.html` 4 处 `?v=513-sec-gate`、
  `mod/plot-editor.js` 含 `aiPlanAccess`、`runye-entitle.js` 含 `mockPlanVar`。
* ⚠ **版本名与并行会话合并**：抬版本时发现并行会话已把 `sw.js` 抬到
  `v513-hydraulic-coordinate-guard`（未提交未发布），为免互相覆盖，两者并成同一个
  版本名 `v513-sec-gate-hydraulic-coord`（都在 CORE 白名单内，必须抬版本重建离线缓存）。

## 10. v521-plan-params-store 灌溉参数集（2026-10-17 · 已发布上线）

### 功能
* 二级「地块与灌溉参数」10 项（planLift/planDh/planSrcDist/planTapeSpacing/planEmitterSpacing/
  planEmitterFlow/planTapeLaySide/planZoneMuManual/planTapePressure/planTargetV）落
  「当前参数集」`localStorage['runye_plan_params_v1']`：工具栏手动改 / AI 回填 / 命名方案调用
  一律 write-through 自动落盘（防抖 350ms），刷新不丢。
* 设置弹窗新增「灌溉参数」页签（`RENDER.irrig`），保存即同步回工具栏并重算；
  工具栏组标题 `#ryCadGrpPipe` summary 加「⚙ 参数设置」按钮直达（`window.RyPlanParams.openSettings`）。
* 涉及文件：`mod/inline-28.js`（参数集模块 + 页签 + save/pageDefault 分支）、
  `index.html`（页签按钮 + ⚙按钮 + `?v=521-plan-params`）、`sw.js`。
* commit `7bc6a6c`；验证：`_repro_v520_planparams.mjs` **20/20**、`_smoke_publish.mjs` ALL PASS、
  `verify_nav_switch.js` 30/0、`verify_settings.js` 对照基线 8 既存红无新增、`ci_check_static` PASS=8。

### 发布（git push 被阻断 → Git Data API）
* 当日 `git push` 连续 18 次 `CONNECT tunnel failed, response 502`（代理对 github.com 持续阻断，
  非间歇）→ 走 `github-publish-when-push-blocked` skill 的 Git Data API 路线。
* 发布脚本 `_p1/_pub_api.py`（Python 移植版，--dry/--apply/--verify；node spawnSync 在沙箱 EBUSY 不可用）。
* ⚠ **新坑：`git log --format=%B` 会多补一个尾换行** ⇒ 用它当 message 发 API，SHA 必不命中。
  正确做法：读原始提交对象字节、取 `\n\n` 之后的消息（尾恰好 1 个 `\n`），四变体穷举定位。
  author/committer 日期用 iso-strict（含 +0800），API 会忠实保留时区串，SHA 可精确命中本地。
* 核验：远端 tip == 本地 HEAD（SHA 全等）、根树一致、385 文件 blob SHA 全等、提交信息一致；
  Pages build `built`（commit=7bc6a6c）；线上冒烟 `_smoke_v521_live.mjs` **12/12**（线上 sw=v522、
  ⚙按钮/页签在、参数集落盘、保存同步、无异常无 4xx）。

### 探针新教训（写探针的必读）
1. **`calcPlan` 首行守卫**：`window.measuredArea<=0` 直接 return（inline-11.js）——
   造地块验证计算链必须同时造 `measuredPolygon`（≥3 点）**和** `measuredArea>0`，缺一整条链不跑。
2. **设置弹窗 save()/pageDefault() 尾部都调 `refresh()`**（inline-28.js），有地块时会点
   「综合分析」+ `tlAutoGenerate` 重生成三级管网图——无头+合成多边形下会卡死（>60s 无响应）。
   无头探针验证保存/恢复默认时**先摘地块**（polygon=null, area=0），执行完再回填地块验证联动。
3. 探针正则 `/\\d/` 匹配的是字面量 `\d` 不是数字——写完要盯实测值核对断言语义。

## 11. v525-plan-readonly-port 工具面板转只读「调用端口」（2026-10-17 · 已发布上线）

* 用户要求：左侧工具面板只留调用端口，参数的保存/修改全部放设置页。落地：`#ppPlanBar` 的
  10 项输入（原生 input + sl-input 代理）加 `readonly` 只读展示；「设置 · 灌溉参数」页签是唯一
  编辑入口（⚙ 参数设置直达）；程序化回填（方案调用 / AI 回填 / 设置保存派发事件）不受影响。
* commit `423db4c`；验证：探针 21/21（新增 10 项 readonly 断言）、冒烟 ALL PASS、导航 30/0、
  设置基线 8 既存红无新增；Pages built；线上冒烟 **13/13**。
* ⚠ **与并行会话 v524 同文件叠加**：index.html/sw.js 均带其改动，**2 个 core 新文件
  （economic-settings-store / measured-area-bridge-store）随批入库**——否则 index.html 引用的
  `<script src="core/...">` 线上 404（「被引用但未入库」闸门教训）。
* ⚠ `ci_check_static.cjs` 被并行会话在途修改搞出语法错误（HEAD 版本正常），本轮该闸门跳过——
  并行会话提交前必须自己跑一遍。

## 12. v526-recipe-to-settings 灌溉方案管理移入设置页（2026-10-17 · 已发布上线）

* 用户要求：红框中的「方案命名+保存」在参数设置中体现；地块分区页只负责调用；工具栏 ✎/🗑 图标取消；
  组标题「二级 · 地块与灌溉参数 / 水力」→「二级 · 地块与灌溉参数」。
* 落地：`#ppRecipeBar` 只留 选择方案+调用（名称框/保存/✎/🗑 删除）；「灌溉参数」页签追加
  「灌溉方案」管理区（方案名称输入 + 保存为方案 + 已存方案下拉 + 改名/删除）。
* 实现要点：plot-editor `ppRecipeFlow` 重构——设置页 `ryRecipe*` 元素**每次现查不缓存**
  （render() 会重建 #rySetBody），按钮走 `#rySetBody` **事件委托**调 `window.RyRecipes`；
  两个下拉（工具栏/设置页）由 refreshSelect 同步刷新；旧工具栏按钮 DOM 若在（回滚）照常绑定。
* commit `4c4da03`；验证：探针 26/26（含 保存→改名→删除 E2E）、冒烟 ALL PASS、导航 30/0、
  设置基线无新增红、ci_check_static PASS=9（并行会话已修复其语法错误）；Pages built；线上冒烟 15/15。

## 13. v527-plan-params-live-tweak 撤销面板只读（2026-10-17 · 已发布上线）

* 用户澄清了业务逻辑（推翻 v525 的只读）：调用方案 → 整组回填 → **面板可直接微调，右侧地块分区实时重划**；
  微调只作用于当前地块并自动记住（刷新不丢，参数集 write-through 本来就覆盖这块），
  **不回写已存方案**（方案库只在「设置 · 灌溉参数」保存/改名/删除）。
* 落地：撤掉 10 项（原生+代理共 20 处）`readonly` 与 v525 的 cursor CSS；⚙ 按钮与设置页说明文案改口径。
* commit `9901ade`；验证：探针 28/28（新增「微调已记住」与「微调不回写方案库」两项）、冒烟 ALL PASS、
  导航 30/0、设置基线无新增、CI PASS=10；Pages built；线上冒烟 15/15。
* ⚠ 探针等待从 6s 提到 10s：并行批次新增 core 脚本后页面加载变长，6s 时 inline-28 尚未执行 ⇒
  `RyPlanParams` 全红假象（诊断脚本 8s 正常才定位到）。另遇两次「并行会话正在写文件」的瞬态崩溃
  （探针/冒烟各一次），重跑即过——不是代码问题。

## 14. v528-recipe-bar-no-label 方案条去掉「方案」二字（2026-10-17 · 已发布上线）

* 用户截图圈注：方案条左侧「方案」二字标签取消（调用区只留 下拉 + 调用按钮）。
* 落地：删 `#ppRecipeBar` 内 `<span class="pp-plan-label">方案</span>` 一行；CSS 不用改
  （`.pp-recipe-row > .pp-plan-label{flex:none}` 无匹配即失效）。
* commit `c578a23`；探针 29/29（新增 labelGone 断言）；线上冒烟 15/15。

## 15. v529-panel-single-source 地块分区左栏样式收敛单一出处（2026-10-17 · 已发布上线）

用户要求：「这个面板样式是否存在多层覆盖，要简化代码」。审计结论 + 处置：

### 审计（无头 `getComputedStyle` + 遍历 `document.styleSheets` 枚举命中规则）
1. **真·双副本（本轮删掉的那份）**：`index.html` 内联 `<style>` 里有一整块
   `#ryCadSide [data-pp="pipePlanSection"] .pp-side …` 共 **42 条规则 / 146 行**，与
   `mod/ry-panel.css` 的 `#pipePlanSection .pp-side …` **逐行相同（仅前缀不同）**。
   成因：`mod/ry-cad-toolbar.js` 把 `#ppSide` **原节点搬进** `#ryCadSide`，搬走后
   `#pipePlanSection .pp-side` 不再匹配 ⇒ 当时复制了一份换前缀顶上。两份各自维护，改一处必漏一处。
2. **两条全局 `!important` 把所有控件字号/圆角锁死**：
   `runye-typography.css:108` `input/select/button:where(:not(.topbar *)){font-size:13px!important}`、
   `style-01.css:3450` `body,body *,body *::before,body *::after{border-radius:0!important}`。
   ⇒ 面板里写的 `font-size:11/12px`、`border-radius:6px` 在 index 页**从来没生效过**
   （实测 computed 13px / 0px）；行内 style 写 11px/6px 也一样死。只在没加载这两张表的
   样板页（`ryp-demo.html`）里有效。
3. **设置弹窗「灌溉方案」区裸奔**：`mod/style-05.css` 只覆盖了 `input[type=number]` 与 `.rs-cell input`，
   方案名称框（text）与已存方案下拉（select）落到浏览器原生 `2px inset` 边框 + 0 padding；
   三个方案按钮是 JS 里写的长串行内 style（字号同样被压成 13px）。
4. 另有一层**必需、未动**：`index.html` 的 `body.ry-tool #ryCadSide [data-pp] .pp-side{…!important}`
   （搬入工具栏后整宽/去内边距/去滚动）与 `#ryCadSide … !important` 主题层——它们是「栏内适配」，
   不与面板皮肤重复。

### 处置
* `mod/ry-panel.css` 成为面板皮肤**唯一出处**：块内 51 处选择器改成
  `:is(#pipePlanSection,#ryCadSide [data-pp="pipePlanSection"]) …` 双位置形式
  （特异性 = `:is()` 内最高的 `#ryCadSide [data-pp=…]`，与原两份完全相同），
  加载顺序仍在 index.html 内联之后 ⇒ 渲染等价。
* `index.html` 删除那 42 条 / 146 行副本；⚙ 参数设置按钮的行内 style 收成 `.ry-cad-set-btn`
  （只声明真正生效的属性，字号/圆角不再写）；`ry-panel.css` / `style-05.css` / `inline-28.js`
  的 `?v=` 一并抬到 `529-single-source`。
* `mod/style-05.css` 补 `#rySetModal .rs-row input[type=text] / select`（1px #cbd5e1 边框、
  4px 7px padding、focus 描边）与 `#ryRecipeStatus{min-height:14px}`；`inline-28.js` 三个按钮
  改用既有 `.rs-btn`、两个控件去掉行内 style。
* commit 见下；**验证 A/B 等价**：同一无头量测脚本跑「改前 / 改后」两版，
  ① 区块内原位 ② 手工搬进 `#ryCadSide` 之后，两态 285 行 computed 输出**逐字节相同**；
  ⚙ 按钮 computed 也逐项相同（13px/0px/2px 8px/边框 #c9d8d0）。设置页为**有意变化**：
  名称框/下拉由 `2px inset` → `1px solid #cbd5e1` + padding 4px 7px，按钮统一 `.rs-btn`。
* 回归：探针 29/29、`_smoke_publish` ALL PASS（含独立地图页，它也用 ry-panel.css）、
  `ci_check_static` PASS=11、`node --test tests/*.test.cjs` 121/121。
* ⚠ 探针/冒烟本轮又踩「加载未就绪」：并行会话把首屏拖到 >10s，`sleep(10000)` 不够 ⇒
  两个脚本都改成**轮询就绪闸门**（`window.RyPlanParams && #ppRecipeApply`），reload 后同样要等；
  否则前半段全红、后半段（页已加载完）却绿，极易误判成"代码坏了"。

## 16. v530-flat-skin-cleanup UI 规范审计四项落地（2026-10-17 · 已发布上线）

用户要求：「继续深挖是否还有多层覆盖，读 UI 设计要求，发现问题先商量再改」。四条决策经用户确认后落地。
规范文件 = 仓库根 `UI面板设计规范.md`（490 行，六族面板 A~G）。

### 审计结论（对照规范逐条查）
1. **裸 `h1` 吃掉展示级 36px**：`runye-typography.css` 的 `h1:where(:not(.topbar *))` 本意是落地页大标题，
   实测把地形「地形模块·测试中」（`terrain-main.css` 设计 14px）与水力校核（设计 15px）都顶成 36px。
2. **圆角语言整体失真**：`style-01.css` 自身 `body,body *,…{border-radius:0!important}` 是唯一执行者，
   同文件里却有 200+ 条 `border-radius`（含 28 条带 `!important` 的自相矛盾写法）。
   ⚠ 但**不是全死**：带 `!important` 的（`.ry-nav .brand-logo{…var(--radius-xs)!important}` 一族）
   特异性高于 `body *`，实测 33 个元素披 3px、17 个披 6px。
3. **三代 `.pp-plan-*` 深绿玻璃皮肤**（白字 `#fff` / 深底 `rgba(255,255,255,.05)` / `#bbf7d0`）仍在，
   早已被 `ry-panel.css`、`#grPipeSection`、`#tlPipePlanSection` 三处浅色皮肤顶掉。
4. **44px 最小热区是纸面条款**：可见可点元素 44 个里 42 个 < 44px（导航 36 / 弹窗按钮 29 / 面板按钮 24）。
5. **规范 token 纸面化**：`--ry-panel-radius` / `--ry-panel-sidebar-w` / `--ry-panel-result-w` 在 CSS 里从未定义。
6. **`:root` 不是作用域**：`--ry-panel-bg/border/head-h` 在 `mod/ry-panel.css` 两处 `:root` 各写一遍，
   同特异性后写者全域生效 ⇒ 顶部那份 `36px/#fff` 从未生效（实测 44px / #f8fafc）。

### 处置
* `runye-typography.css`：排除条件改为 **`:not(:where(.t-top *,.result-head *))`**（`：where()` 保持特异性 0,0,1）。
  ⚠ **必须按容器类、不能按区块 id**：独立页 `terrain/index.html` 没有 `#terrainSection`，
  第一版写 `:not(#terrainSection *)` 实测漏网、仍是 36px；`.t-top` / `.result-head` 两页通用。
* `mod/style-01.css`：
  ① GEN1 十行「深绿玻璃」**瘦身为中性骨架**（只留 flex / gap / padding / 字号 / select 26px 高），
     深色值全删；GEN2 / GEN2B / GEN3 三块补丁整块删。
     ⚠ 第一版整块 10 条全删，定向 A/B 立刻抓到 **21 处布局差异**（`#grBar` 的 `display:flex→block`、
     `gap:12px→normal`、`#tlCalSel*` 的 `26px→auto`）——「死皮肤」里混着**活布局**，
     `#grPipeSection` 的「成组地块/子地块/总面积」行完全靠 `.pp-plan-item{display:flex;gap:4px}` 排一行。
  ② 圆角只删**不带 `!important`** 的（208 → 36，其余全是 `50%` 圆点语义 + enforcer 自身）。
     ⚠ 第一版把带 `!important` 的一起删：实测 33 元素 3px→0px，另 2 元素 0→4px
     （删掉一层 `border-radius:0!important` 反而让 `var(--radius)!important` 生效）。
     判据只能靠实测：`body *{…!important}` 压得住**无** `!important` 的声明，压不住有 `!important` 且特异性更高的。
* `mod/ry-panel.css`：三处 token 收敛到顶部 `:root` 唯一定义，取值 = 收敛前**实测值**（44px / #f8fafc），视觉零变化。
* `UI面板设计规范.md`：原则 3 改双阈值（桌面 ≥28 / 触屏 ≥44）；`--ry-panel-radius` 改 `0px` 并注明
  只保留 `50%` 圆点语义；新增 **§1.1 token 落地状态表**；新增 **§9.1 v530 决策记录**。
* 版本：`sw.js` → `v530-flat-skin-cleanup`；`?v=` 抬 `index.html`（style-01 / ry-panel / typography）、
  `runye-map-measure.html`、`runye-hydraulics.html`、`terrain/index.html`。

### 两条「不是死代码」的更正（v529 曾误判）
* `terrain/terrain.css`（359 行）→ 被 `terrain/index.html:15` 用**相对路径** `href="terrain.css"` 引用，不删。
* `#threeLevelView`（`style-01.css` 里 `display:none !important`）→ `index.html:2773` 有 DOM、
  `mod/inline-09.js:1689` 仍在切 `.active`，只是被永久隐藏，不删。

### 验证
* 定向 A/B（121 个 `.pp-plan-*` 元素 × 29 属性，base / 搬入工具栏两态）：
  `plan diff = 0`、`brHist` 逐 key 相同，`fsHist` 仅 `36px×2 → 14px/15px`（即 h1 修复本身）。
* 独立页实测：`terrain/index.html` h1 **14px/21px**、`runye-hydraulics.html` **15px/18px**；
  未受影响的 `runye-landing.html`「投入更少」仍 36px、`digital-agriculture` 仍 36px。
* `ci_check_static` PASS=11；`node --test tests/*.test.cjs` 121/121；`_repro_v520_planparams` 29/29；
  `_smoke_publish` ALL PASS；线上 `_smoke_v521_live` 26/26（含 5 项 v530 新断言）。
* commit `cba20eb`；未纳入 `terrain/index.html` 的另一会话在途改动（新增 `hc-core.js` 引用），只抬了它的 `?v=`。
