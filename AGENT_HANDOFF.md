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

## 17. v532-rail-drift-gate 面板双副本改为「防漂移闸门」（2026-10-17 · 已发布上线）

用户问「各种覆盖都排查完了、都修改完毕了吗」。诚实答复：**没完**，并给出剩余量化的四类问题。
用户两次决策：先选「做面板双副本合并」，实测失败回滚后改选「加防漂移闸门」。

### 剩余覆盖的量化（跨文件归一化选择器 + 规则体复扫）
| 面 | 现状 |
|---|---|
| 二级面板 | 内联 158 条 rail 副本：109 纯副本 / 14 值漂移 / 35 仅内联 |
| 三级面板 | 内联 74 条：46 纯副本 / 3 漂移 / 25 仅内联 |
| 控件字号 | `mod/*.css` 34 条 `font-size` 里 33 条不带 `!important`，全被 typography 13px 压死 |
| 滚动条 | index 内联 / style-05 / runye-theme / terrain.css 各写一套同值规则 |
| 地形 | `terrain/index.html` 与主页 `#terrainSection` 双份 DOM（架构级，不动） |

### 一、合并方案：试过、量过、全部回滚
`mod/ry-cad-toolbar.js` 的 `moveIn()` 把 `#ppSide`/`#tlSide` 原节点搬进 `#ryCadSide`，
搬走后 `#pipePlanSection .pp-yy` 不再匹配 ⇒ 历史上有整批换前缀的孪生规则。v529 只把
`.pp-side` 一支做成 `:is()` 双命中，其余 `.pp-title/.pp-toolbar/.pp-stage/.pp-legend` 仍是两份。

用 v529 同款 `:is()` 合并的两版，A/B 定向快照（DOM 路径 key + 50 个 computed 属性，
**同版本连跑两次噪声基线仅 0~1 条**）：

| 版本 | 选择器 | 特异性 | base diff | rail diff |
|---|---|---|---|---|
| V1 | `:is(#X,[data-pp=X])` | (1,0,0) | 60 | 113 |
| V2 | `:is(#X,#ryCadSide [data-pp=X])` | (1,1,0) | 74 | 120 |

典型回归：`#planTapeSpacing` 等原生 `input` `display:block→none`、`sl-input display:none→block`、
`#ppPlanBar2` 宽度 300→295、`.pp-plan-item` 278→273。

**根因（记牢）**：副本 `#ryCadSide [data-pp="X"] .pp-side` = **(1,1,0)**，比原版
`#X .pp-side` = **(1,0,0)** 高**一级**，rail 态正是靠这一级赢过一批 (1,0,1) 竞争者。
⇒ **双副本无法用选择器合并消除**，强行合并必掉一级。已 `cp _backup_*/` 回滚，`git diff` 干净。

### 二、改为「不许漂移」
* `scripts/check_panel_drift.cjs`（新增，零依赖纯文本解析，处理 `@media` 嵌套）
  * `canon()` 把 `:is(#X,#ryCadSide [data-pp="X"])` / `:is(#X,[data-pp="X"])` /
    `#ryCadSide [data-pp="X"]` / `#X` 一律归一化到 `[data-pp="X"]`；
  * 三类漂移全报：`value`（值不同）、`only-inline`（副本有基准无）、`only-base`（基准有副本无）；
  * `--verbose` 打明细，`--update` 写回基线。
* `scripts/panel-drift-baseline.json`（新增）登记 4 条**有意不同**并写明理由：
  * `@media(max-width:768px) .pp-title` 的 `font-size:13px` / `font-weight:600` / `line-height:1.3`
    —— 窄栏约 200px 宽，栏内适配；
  * `body.ry-tool [data-pp="tlPipePlanSection"] .pp-side` 的 `border-right-color:transparent`
    —— 避免与工具栏分隔线叠成双线。
* `ci_check_static.cjs` 接入第 ⑥ 项（文件头「三类」→「四类」）。
* 顺手清掉 `index.html` 内联 **21 条**被 `border-radius:0!important` 压平的死圆角：
  **未登记漂移 17 → 4**。

### 验证
* `node scripts/check_panel_drift.cjs --verbose` → 内联 rail 规则 200 组 / 基准 1506 组 / 同键比对 187 组，✓ 已登记 4 条。
* **负向测试**：注入 `#tlPipePlanSection .pp-side .pp-plan-bar{letter-spacing:9px}` → `exit=1`；还原 → `exit=0`。
* `ci_check_static` **PASS=12 FAIL=0**；`node --test tests/*.test.cjs` **122/122**；
  `_repro_v520_planparams` **29/29**；`_smoke_publish` ALL PASS；线上 `_smoke_v521_live` **26/26**。
* commit `0b30c53`，线上 `sw.js` VERSION = `v532-rail-drift-gate`（6 次轮询后生效）。

### 版本与混编处理（重要）
* 并行会话先占了 `v531-data-service-plot-store`，本提交在其沿革上方追加并把 VERSION 抬到
  `v532-rail-drift-gate`，两者共用一次缓存失效。
* `ci_check_static.cjs` 是**混编文件**：本提交只 `git apply --cached` 了 ⑥ 相关 17 行 hunk，
  并行会话的 ④b（独立地形页顺序）/ ④c（独立地图页顺序）/ ⑤（经济设置适配器）112 行
  留在工作区由其自行提交。
* 案例：`git add -p` 不可用时，用「`git diff` 导出 → 按 `@@` 切 hunk → 关键字筛 → `git apply --cached`」，
  工作区文件保持不变，落盘仍是完整合并态。

### 下一步（未做，均为独立决策项）
1. 控件字号：`mod/*.css` 33 条不带 `!important` 的 `font-size` 被 `runye-typography.css` 的
   13px 全压死 —— 要么给关键控件加 `!important` + 更高特异性，要么在 typography 里按容器排除。
2. 滚动条 4 份同值规则收敛为一份。
3. 地形双份 DOM 属于架构级（`terrain/index.html` vs 主页 `#terrainSection`），需要产品决策。

## 18. v533-scrollbar-single-source 全局滚动条收敛（2026-10-17 · 已发布上线）

用户答「各种覆盖都排查完了吗」后列出的遗留项之一：滚动条 4 份同值规则。

### 事实
`*::-webkit-scrollbar` 特异性 0，谁后加载谁赢。`runye-theme.css` 在 `:head` 里最后加载且用
`width:var(--ry-scroll-w)` 定义 ⇒ 另外 **7 处副本全部被压掉**，但每处写的值不同
（index 内联 5px 绿 / style-05 4px 灰 / terrain.css 5px #c9d6ce+3px 圆角 /
runye-hydraulics 两份 5px 绿+2.5px 圆角 / 三级系统图·二级系统图·管路接驳拼装 各 5px 绿）。
**读源码完全看不出真实渲染值**，这就是「多层覆盖」最典型的形态。

### 实测（两个口径，`_probe_v533_fonts_scroll.mjs`）
`getComputedStyle(el,'::-webkit-scrollbar').width` + 真实 `offsetWidth-clientWidth`，
6 个页面改前改后逐项一致：**通用滚动条 4px / rgba(100,116,139,.45) / 圆角 999px**。
保留的**生效例外**：`.pp-side`、`#ryCadSide .ry-cad-grps` = 5px + `rgba(188,211,198,.25)`（选择器更具体）。

### 闸门 ⑦
`ci_check_static.cjs` 扫描根目录 + `mod/ terrain/ hydraulic-calc/ filter-system/ tl-workspace/
modeling/ digital-agriculture/` 的 .css/.html，凡 `*::-webkit-scrollbar` 开头且不在
`runye-theme.css` 里的声明行一律报红，并确认 theme 里那条定义还在。
负向测试：注入 `*::-webkit-scrollbar{width:9px}` → FAIL；还原 → PASS。

---

## 19. v534-panel-type-scale 密集面板字号按设计值生效（2026-10-17 · 已发布上线）

用户决策：**给密集面板开豁免**（另一选项是「保持全站 13px 不动」）。

### 根因
`runye-typography.css` 的 `p,li,input,select,textarea,button,.btn…{font-size:var(--ry-fs-body)!important}`
是全站正文口径（13px）。`:where()` 把特异性压到裸元素级，但 `!important` 压过一切普通声明 ⇒
面板里「设计好 10/11/12/12.5/15px」的声明全部失效。`<p>`/`<small>` 也被同一条一起压掉。

### 处置（不动全局口径、不开容器级豁免）
给面板自己的声明补 `!important`（特异性本就更高，加 `!important` 即可反压）：
* `mod/online-map.css`：`.mbtn` 12px ×3 处（draw-tools / float-actions / 角度保存行）、
  分区下拉 11px、`.ry-angle-panel .hint` 10px、`.results .row .v small` 10px、`.ang-btn small` 10px
* `terrain/terrain.css`：`.t-sprow input,select` 12.5px、`.t-tabs`/`.t-unit`/`.t-modebtn` 12px、
  `.t-canvas-nav button` 15px、`details.t-fold>summary small` 11px
* `terrain/terrain-main.css`：同上 7 条；并把 `.t-sprow select` 扩成 `input,select`
  （原来只有 select 有规则 ⇒ 主页地形输入框一直吃 13px，与独立页 12.5px 不一致）
* `runye-map-measure.html` 内联副本：7 条同步，其中 3 条**原本没写 font-size**（纯吃全局 13px），
  按 index 侧设计值补齐 —— 两页自此同值

### A/B 实测（`_dump_fonts.mjs`，容器内逐元素 fontSize+lineHeight 快照，逐 key 比对）
| 目标 | 变化元素 | 分布（元素数×改前→改后） |
|---|---|---|
| 地形独立页 | 47 | 34×(13→12.5) 6×(13→12) 4×(12→11) 3×(13→15) |
| 主页地形区块 | 49 | 34×(13→12.5) 8×(13→12) 4×(12→11) 3×(13→15) |
| 在线地图独立页 | 20 | 11×(13→12) 7×(12→10) 1×(13→10) 1×(13→11) |
| 主页在线地图区块 | 20 | 11×(13→12) 7×(12→10) 1×(13→10) 1×(13→11) |

**容器外 0 处变化**（快照 key 数改前=改后：233/233、218/218、173/173、154/154）。
⚠ 主页区块默认 `display:none`（离线无 CDN 时地图/地形不显示），探针需
`el.style.setProperty('display','block','important')` 强制后测量；A/B 两次同样强制，可比。

### 残余「仍被压死」（有意不动，均非密集面板）
`.fn-nav .fn-link` 12.5→13（0.5px）、`.ry-mbr-btn` 12→13、`.pp-rail-tab-float` 12→13、
`.ry-pwa-install` 14→13、`.ry-pwa-install small` 11→12；地形页只剩 `.fn-nav .fn-link` 与
`.t-navhint`（11 vs 11.5）。
被压死清单规模：index **46 组元素 → 26**，地形页 **52 → 3**。

### 验证
* ci_check_static PASS=14 FAIL=0；`node --test tests/*.test.cjs` 122/122；
  `_repro_v520_planparams` 29/29；`_smoke_publish` ALL PASS；线上 `_smoke_v521_live` 26/26
* 缓存键：`index.html` 的 `mod/online-map.css`、`terrain/terrain-main.css` 与
  `terrain/index.html` 的 `terrain.css` 均抬到 `?v=534-panel-type-scale`；`sw.js` → v534
* 线上核对：`terrain.css` 含 `font-size: 12.5px !important`；index 已引用 `?v=534-panel-type-scale`


---

## 20. v535-terrain-single-source 地形双份样式表合并（2026-10-17 · 待发布）

### 为什么动
`terrain/index.html`（独立页）与主页 `#terrainSection`（嵌入）各挂一套完整样式表：
`terrain/terrain.css`（143 条）与 `terrain/terrain-main.css`（159 条，去 `#terrainSection ` 前缀后 170 条）。
两份从来不是「一份被覆盖」，而是**同一套规则的同构副本**，各自演化 —— 已经出现
`.t-sprow input` 只在一侧、字号 `!important` 单边加过（v534 就要在两处同时改）。

### 合并前先量，别猜
逐规则归一化后比对（去 `#terrainSection ` 前缀 + 压缩空白）：
* **重名 139 条，逐值完全相同 = 139，值不同 = 0**
* 仅独立页 4 条：`:root` 令牌表、`body`、`body.t-col-resizing`×2
* 仅嵌入 20 条：容器 `body` 等价项、三列栅格骨架、`@media(max-width:1100px)` 单列降级、
  `.t-panel` / `.t-hintbox`、5 行滚动条副本

⇒ 结论：**不是两套设计，是一套设计抄了两份**。合并只丢重复，不丢视觉。

### 怎么合并
1. `terrain/terrain.css` 变成唯一出处，三段结构：
   * 裸 `.t-*` 通用组件规则（`.t-` 是地形模块专属命名空间）
   * 令牌双命中：`body.t-page, #terrainSection{ --g-* / --u-* / --radius / --font … }`
     —— 独立页命中 `body.t-page`，嵌入页命中 `#terrainSection`，**不会外泄全局令牌**
   * 末尾「嵌入模式差异」段：只写嵌入才有的那 20 条
2. 页面级 5 条（`*{box-sizing}` / `body{}` / `button` / `input` / `a`）**搬进 `terrain/index.html`
   的内联 `<style>`** —— 理由：`terrain.css` 现在会被主页加载，这几条是全局选择器，
   留在表里就会污染主页（`*{box-sizing:border-box}` 尤其致命）。
3. `terrain/terrain-main.css` 删除；`sw.js` CORE 去掉该行；`index.html` 改引
   `terrain/terrain.css?v=535-terrain-single-source`；`terrain/index.html` 同步抬 `?v=`。

### ⚠ 顺序承重（这次踩到的唯一真坑）
```css
#terrainSection .t-body{ height:calc(100vh - var(--fn-nav-h,48px) - 42px); … }  /* (1,1,0) */
#terrainSection>.t-body{ flex:1; min-height:0; height:auto }                      /* (1,1,0) ← 必须在其后 */
```
两者特异性**相同**，靠文档序决胜。第一版合并时我把 `flex:1` 那条挪到了前面 ⇒
`height:calc` 反压，`.t-body` 从「内容高 1850」被压成 **886**，侧栏因出滚动条再少 4px，
`width` 全线 `284→280`、`258→254`（114 个元素的差异，全是这一个根因的下游）。
判据：**遇到「整片元素同时少 4px」先查滚动条，再看是谁把它挤出了滚动条。**

### A/B 实测（HEAD 基线树 vs 新版，37 个 computed 属性逐元素）
`git archive HEAD | tar -x -C $TEMP/rybase` + `RY_ROOT=$TEMP/rybase node _dump_style.mjs …`，
同一探针跑两棵树，逐 key 比对：

| 目标 | 元素 | 差异 |
|---|---|---|
| 主页 `#terrainSection`（1520px） | 218 | **0** |
| 主页 `#terrainSection`（1050px，走 `@media ≤1100` 单列分支） | 217 | **0** |
| 独立地形页 `terrain/index.html` | 233 | **0**（仅路径编号 `div:9→div:11` 位移，5 组属性逐字节相同） |
| 主页全页默认视图（外泄面） | 186 | **0** |

窄视口确认 media 真的生效：`.t-body` 栅格 `1028px` 单列、高度 `2093px`（宽屏是 `304px 10px 1fr` / `886`）。
外泄检查：主页 112 个 `.t-*` 元素**全部**在 `#terrainSection` 内（`leakN=0`）；terrain.css 里
裸 `.t-*` 规则 142 条、带 `#terrainSection`/`body.t-page` 前缀 21 条。

### 验证
* `ci_check_static` PASS=15 FAIL=0（④ 项确认 CORE 与页面引用一致，删除的文件没留悬空条目）
* `node --test tests/*.test.cjs` 122/122；`_repro_v520_planparams` 29/29；`_smoke_publish` ALL PASS

### 探针增强（可复用）
`_dump_style.mjs` 现支持两个环境变量：
* `RY_ROOT` → 换根目录（A/B 两棵树必用，比「备份-覆盖-还原」安全，不碰工作区）
* `RY_VP=宽,高` → 同时改 `--window-size` 与 `Emulation.setDeviceMetricsOverride`
  （**只改后者也够**，但只改 `--window-size` 无效 —— 探针里已经硬编码了 metrics override，
  窄屏测试会假绿：innerWidth 仍是 1520，`@media` 分支根本没走到）

---

## 21. v538-toolbar-font-11 二级/三级工具栏字号统一到 11px（2026-10-17 · 待发布）

### 用户口径
> 「二级地块工具栏跟三级管网工具栏的文字统一，都按照三级管网工具栏的文字大小执行，
> 两个工具栏的所有文字都统一，不要出现不同大小的文字，一个文字高度就行了，
> 如果要区分的话，那就个别文字加粗就行。」

确认过的两个边界：**管径下拉也降到 11px**（用户选「全部 11px」）；
**黑底扬程计算式条不动**（`#ppCalcDetail` 是结果展示，保留 10~11.5px 层次）。

### 改前实测（`_probe_toolbar_typo.mjs`，逐元素 fontSize/fontWeight/lineHeight/高度）
| 面板 | 分布 |
|---|---|
| 三级 `#tlSide`（基准） | 11px×32 可见（label/区按钮/亩数/列头）+ 11px/700×6（改径重算值）+ **13px×3**（管径下拉，被全局压） |
| 二级 `#ppSide` | 11px×10（单位）+ **12px×20**（label）+ **12px/600×10**（计算值）+ **12px×10**（输入框数字）+ **13px/600×2**（方案下拉、调用按钮） |

### 根因（两条，都属"被全站口径压"或"设计值不同"）
1. **设计值不同**：`mod/ry-panel.css` 给二级 label/val/input 写了 12px，三级写的是 11px。
2. **被 `runye-typography.css` 压**：`input/select/button{font-size:var(--ry-fs-body)!important}`(13px)
   把二级的方案下拉、调用按钮，以及三级的 3 个管径下拉（CSS 明明写 11px）全顶成 13px。
   ⇒ 与 v534 同一处置：**面板要自己的字号，就在自己那条声明上加 `!important`**（特异性本就够）。

### 改动（5 处，全在 CORE 里）
`mod/ry-panel.css`：label 12→11、val 12→11、native input 12→`11 !important`、
`--sl-input-font-size-small` 12→11（这是 sl-input 内真实可见的数字）、
方案条 `input/select` 与 `.pp-recipe-btn` → `11px !important`。
`mod/style-01.css`：`.tl-plan-result .pp-cal-sel` 的 11px → `11px!important`。

### ⚠ 两个坑
1. **`.tl-plan-result` 前缀是承重的**：rail 态 `#tlSide` 被 `mod/ry-cad-toolbar.js` 搬进 `#ryCadSide`，
   `#tlPipePlanSection .pp-side …` 祖先链断裂（v109 老坑）。改三级左栏样式一律挂类/ID，别挂 section 前缀。
2. **`#tlPumpUpdateBtn` 一开始被我误改**：它在 `#tlPumpUpdateBox`（独立白底卡片，`font:11.5px/1.6`）里，
   不是工具栏条。改成 11px 会让卡片内部 11.5/10.5/11 三档自相矛盾 ⇒ 已回退。

### 未动清单（都不是「工具栏条」，是独立卡片/提示）
| 元素 | 字号 | 性质 |
|---|---|---|
| `#tlPumpUpdateBox` 标题 | 11.5px/700 | 管径调整卡（白底卡片） |
| `#tlPumpUpdateNote` / `#tlPumpUpdateDelta` | 10.5px | 同上，说明/对比行 |
| `#tlPumpUpdateBtn` | 13px（设计 12，被全局压） | 同上，卡片内按钮 —— **既存"被压死"，本轮未处理** |
| `#tlLossCard` | 11.5px | 管段长度/水头损失卡 |
| `#tlPpHint` | 14px | 画布空态大提示 |
| `#ppCalcDetail` | 10~11.5px 多档 | 黑底扬程计算式条（用户明确保留） |

### 实测（改前→改后，逐元素 5 属性）
* 二级：**43 个元素** 12/13→11（20 label + 10 val + 13 input + 2 select/button）
* 三级：**3 个元素** 13/700→11/700（管径下拉）
* 两级**可见**文字全部 11px；余下非 11px 的只有 `input[type=hidden]`×2 与上表卡片/提示
* 外溢：主页全页默认视图 186 元素 × 37 属性 **0 差异**
* 布局影响：仅 10 个 label 各矮 1.3px（line-height 15.6→14.3），行高由 24px 输入框撑着，
  `#ppPlanBar` 行距不变

### 验证
`ci_check_static` PASS=15 FAIL=0（含 ⑥ 面板漂移闸门：本轮改的都是带 `:is(#pipePlanSection,…)` 前缀的
规则或 `.tl-plan-result` 类规则，内联副本里没有同属性的 font-size，故无新增漂移）；
`node --test` 122/122；`_repro_v520_planparams` 29/29；`_smoke_publish` ALL PASS。

---

## 22. v539-toolbar-font-unify 工具栏统一收尾（卡片三档归一 + 字重拉齐）

### 「三档自相矛盾」到底是什么
上一轮我回退 `#tlPumpUpdateBtn` 的理由是「卡片内部会变成 11.5/10.5/11」。
根因不是代码互相干扰，而是**逐处 inline 写死三个值**：

| 位置 | 改前写法 | 实际渲染 |
|---|---|---|
| 卡片本体 `#tlPumpUpdateBox` | `font:11.5px/1.6 …`（简写，标题继承） | 标题 **11.5px** |
| 说明 `#tlPumpUpdateNote` | inline `font-size:10.5px` | **10.5px** |
| 按钮 `#tlPumpUpdateBtn` | inline `font-size:12px` | **13px**（被全站 `button{13px!important}` 顶掉） |

所以只改按钮 ⇒ 11.5 / 10.5 / 11，比原来更乱。**正解是把三处一起改（用户说的「重写统一」）**。

### 改动
1. 两张白底卡片的 `font` 简写 **11.5px → 11px**（`#tlPumpUpdateBox` + `#tlLossCard`）
2. 说明行 / delta 行**删掉 inline `font-size`**，改为继承卡片（11px）
3. 按钮**删掉 inline `font-size:12px`**，字号归 CSS：`#tlPumpUpdateBtn{font-size:11px!important}`
   —— 必须 `!important`，inline 不带 `!important` 反压不了全站的 `button{13px!important}`
4. **字重拉齐**：设计值 600（二级原本就是 600，三级从 400 提上来）、实际值 `.pp-plan-val-real` 700、
   列头 600、标签 400

### ⚠ 又一个「双副本」实例（v532 定论再次应验）
三级 `.pp-plan-val` 的 400 来自 **`index.html:452` 的 rail 内联副本**
`#ryCadSide [data-pp="tlPipePlanSection"] .pp-side .pp-plan-val{font-weight:400}`，
特异性 (1,3,0)，压过 style-01.css 里我新加的 `.tl-plan-result .pp-plan-val` (0,2,0)。
**只改 CSS 那一处，字重不会变**。必须两处同步 —— 漂移闸门（ci ⑥）正是为此存在。

顺带查明：`#tlPipePlanSection .pp-side .pp-plan-val{font-weight:400}` 这条**从未生效过**
（rail 态 `#tlSide` 被搬进 `#ryCadSide`，`#tlPipePlanSection` 祖先不存在；三级 val 一直是继承来的 400）。
所以三级左栏里凡是「以为在管、其实没管」的规则，都要按这个思路复查一遍：**挂 section 前缀的一律可疑**。

### 实测（卡片可见态，`_probe_card_font.mjs` 先切视图再强制显示）
| 元素 | 改前 | 改后 |
|---|---|---|
| 卡片本体 | 11.5/400 | **11/400** |
| 标题「管径调整 · 扬程确认」 | 11.5/700 | **11/700** |
| 说明「图面改管径只作标注…」 | 10.5/400 | **11/400** |
| 按钮「⇧ 更新水泵扬程」 | 13/600 | **11/600** |

全量分布（`_probe_toolbar_typo.mjs`，含隐藏元素）：
* 二级：11px 全部，label/unit 400、val 600、select/button 600
* 三级：11px 全部，label/区按钮 400、列头 600、设计值 600、实际值 700、按钮 600
* 全页默认视图 186 元素 × 37 属性 **0 差异**

### 未动
`#tlPpHint`（14px「📋 请先在面积测量工具中描绘并闭合边界」，空态引导提示，非工具栏文字）、
`#ppCalcDetail`（黑底扬程计算式条，用户已确认保留 10~11.5px 层次）。

### 验证
`ci_check_static` PASS=16、面板漂移闸门 ✓、`node --test` 122/122、`_smoke_publish` ALL PASS。

---

## 23. v542-panel-css-prune 面板样式死规则清理 + 同值重复块合并（2026-10-17）

用户诉求：「二级/三级工具栏样式堆了好几层，梳理一下重构，让整体统一」。

### 先量化，别拍脑袋
新增 `_audit_panel_css.mjs`：把两份左栏当作测量对象，在 **rail 态**（左栏被搬进 `#ryCadSide`）
与 **原位态**（搬回 section）各量一遍，逐条判断每条 CSS 规则是否命中面板元素，并统计
「同一元素同一属性被多少条规则竞争」。

修前账本：

| 项 | 数 |
|---|---|
| 参与计算的规则（含全部样式表） | 2862 |
| 命中面板元素的规则 | 97 |
| 面板相关但**从不命中**的规则 | 418 |
| 命中文件分布 | `style-01.css` 42 ／ `index.html` 内联 23 ／ `ry-panel.css` 21 ／ 工具栏内联 10 ／ `typography` 1 |
| 单属性竞争层数 | `background-color` 最多 7 层，`font-size` 6 层；187 个元素平均 2.2 层 |

两个大头死块：
1. **`#threeLevelView .pp-plan-*` 共 252 条**（`mod/style-01.css`）——`#threeLevelView` 这个 overlay
   仍在 DOM 里（`<div class="tl-overlay" id="threeLevelView">`），但它内部的 `.pp-plan-*` 结构
   早已随面板迁移消失（实测 `#threeLevelView .pp-plan-item` = 0）。整套旧皮肤留在原地。
2. **`#ryCadSide [data-pp="pipePlanSection"] .pp-title…` 共 125 条**（`index.html` 内联）——
   `.pp-title` 全局已无该元素（实测 `.pp-title` = 0）。

### 工具链（已入库，可复用）
- `_audit_panel_css.mjs` —— 规则命中 + 竞争层数 + 重复声明审计（`RY_ROOT` 换根）
- `_prune_dead_css.mjs` —— 按审计结果删「两态皆不命中」的规则（`--write` 落盘）
- `_merge_dup_rules.mjs` —— 同值重复规则合并成逗号分组（**不用 `:is()`**，见下）
- `_diff_panel_copies.mjs` —— 两处副本按归一化选择器逐属性比对
- `_ab_panel_dump.mjs` —— 四态快照（rail.pp / rail.tl / base.pp / base.tl），40 个 computed 属性
- `_probe_pp_vs_tl.mjs` —— 二级 vs 三级同名部件对照

### 两个必须记住的踩坑
1. **死规则判据必须是「两态都不命中」的交集**。第一版取了 rail+base 的**并集**，
   于是「rail 专用副本」被误判成死规则删掉 —— 二级面板当场掉皮肤（`#ryCadSide [data-pp=…] .pp-side`
   这类规则在 rail 态是活的、原位态才死）。回归被 A/B 抓到，已回滚重做。
2. **无头页面会被判后台 ⇒ `rAF` 不跑 ⇒ 工具栏搬移失效**。`MutationObserver` 里的 `syncAll` 走
   `requestAnimationFrame`，不 `Page.bringToFront` 的话状态时有时无，探针会给出自相矛盾的数字。
   另外 `sl-input` 走 CDN，偶发不认领 ⇒ 原生回退/组件互换，产生 20 处假差异；
   用 `--host-resolver-rules=MAP cdn.jsdelivr.net 127.0.0.1` 固定成离线回退态才可比。

### 改动
- `mod/style-01.css`：删 140 条两态皆不命中的规则（`#threeLevelView .pp-plan-*` 一族），
  合并 6 组同值重复块；文件 1374 → 1237 条规则
- `index.html` 内联：删 104 条死规则（`.pp-title` / `.pp-hint` 旧块族），合并 6 组；
  内联 CSS 45817 → 38456 字符（-16.1%）
- 合计：死规则 418 → 229（剩下的全是带状态伪类/伪元素/移动端前缀的**探针假阴性**，一律不删）

### 验证
- A/B 四态快照（`rail.pp` 96 / `rail.tl` 77 / `base.pp` 96 / `base.tl` 77 个元素 × 40 属性）：
  **0 处差异**，含同态两次基线复跑（0 差异，证明测量本身可重复）
- `ci_check_static` PASS=17 FAIL=0（含 ⑥ 面板双副本无新增漂移）
- `node --test tests/*.test.cjs` 122/122
- `_smoke_publish` ALL PASS

### 没做的那一半（结论 + 依据）
两个工具栏**不是同一套部件**：`.pp-btn` / `.pp-cols-h1` / `.pp-plan-val-real` / `.pp-cal-sel`
只在三级存在，`.pp-recipe-btn` 只在二级。共有部件的字号字重已一致，但颜色/内边距/背景/宽度
仍不同（二级 `input` 64x24 透明底 vs 三级 136x24 白底；二级 `.pp-plan-bar` 无内边距 vs 三级 8/10px）——
这是「参数列表」与「结果表」的业务差异，不是历史堆叠，不该强行抹平。

真正还能再降层的是**归属迁移**：把 `index.html` 内联那 22 条 rail 副本搬进 `mod/ry-panel.css` /
`mod/style-01.css`，让同级部件只有一个 owner。风险点：内联块在文档序里位于 `ry-panel.css`
**之前**，搬过去会变成之后 ⇒ 同特异性平手时改判。需专门一轮 A/B（本次未做，留作下一版）。

---

## 24. v543-panel-single-owner 面板样式单一归属（内联 179 条全部迁出）

用户指令：「2，彻底清洗干净，不然我担心后面有隐患。」

### 做了什么
把 `index.html` 内联 `<style>` 里所有面板相关规则（正则 `pp-|ppSide|tlSide|pipePlanSection|ryCadSide|ry-cad|tl-plan|tlCal`）
整块抽出，按归属迁回：
- 二级 `.pp-*` / `#ppSide` / `#pipePlanSection` / `#ryCadSide` / `.ry-cad-*` → **`mod/ry-panel.css`**（111 条）
- 三级 `#tlPipePlanSection` / `#tlSide` / `.tl-plan-*` / `#tlCal*` → **`mod/style-01.css`**（68 条）

迁完再顺手把「原位 + rail」同值副本用**逗号分组**并成一条（`style-01.css` 合并 32 组），
每个分支保留自己原来的特异性（不用 `:is()`，理由见 §17/v531）。

结果：`index.html` 内联 CSS **45.8KB → 6.3KB**，面板皮肤不再有第二份。

### 三条必须记住的
1. **落点必须在目标文件「末尾」**。先试过 `--at=top`：内联块原本位于 `ry-panel.css` 之前，
   放到开头等于让它们继续「输给」ry-panel 自己的同名规则；放末尾才是它们原本的相对次序语义。
   实测末尾 0 差异（放开头未采纳）。
2. **迁移只搬位置，选择器一个字都不改**。不改写、不加前缀、不用 `:is()` —— 一旦改选择器就是改特异性，
   v531 的教训（base diff 60/74、rail 113/120）就是改选择器改出来的。
3. **「面板外 0 命中」是可以证明的**：`_probe_moved_scope.mjs` 逐条 `querySelectorAll` 后判断
   `el.closest('#ppSide|#tlSide|#ryCadSide')`。235 条迁移选择器里，面板外命中 12 条，
   逐条核实全是**区块级布局**（`#pipePlanSection > .pp-body`、`body.ry-tool.ry-cad-vp > main`），
   本来就是面板布局的一部分，不是外泄。

### 验收（这次把量测面扩到 8 个）
`_ab_panel_dump.mjs` 现在输出 12 份快照：`rail/base × {pp, tl, secPP, secTL, main, page}`。
有效比对面 8 个（page 含大量动态节点，元素数每次不同，只作参考）：

| 面 | rail | base |
|---|---|---|
| `#ppSide` 96 元素 | 0 差异 | 0 差异 |
| `#tlSide` 77 元素 | 0 差异 | 0 差异 |
| `#pipePlanSection` 82/178 元素 | 0 | 0 |
| `#tlPipePlanSection` 125/202 元素 | 0 | 0 |
| `main` 1725 元素 | 0（仅 4 个动态节点缺失） | 0 |

每个元素 40 个 computed 属性 + 尺寸。合并后又跑了一次，仍 0 差异。
中途出现过的 `opacity 1→0.72` 经复跑确认是 `.pp-quick` 的 `transition:opacity .16s` 被截在过渡中间，
不是样式变化 —— **单次快照出现孤立的过渡属性差异时，必须复跑一次再下结论**。

### 新增闸门 ⑥b（防回退）
`ci_check_static` 增加第 ⑥b 项：读 index.html 所有 `<style>` 块、**去掉注释**后扫选择器，
一旦再出现 `.pp-` / `#ppSide` / `#tlSide` / `#pipePlanSection` / `#tlPipePlanSection` / `#ryCadSide` / `ry-cad-`
就红灯。这就是「以后不许再抄一份回去」的锁。

### 状态
`ci_check_static` PASS=18 FAIL=0 ｜ `node --test tests/*.test.cjs` 122/122 ｜ `_smoke_publish` ALL PASS。

## 25. v544-float-card-unify 悬浮卡片与横向工具栏统一（2026-10-17 · 已发布上线）

### 用户诉求（原话）
> 「查找这些面板的属性，分成两类，一类就是横向工具栏，另外一类就是悬浮面板…我像是先样式统一，
> 然后细节再统一，比如说悬浮面板要去是位置可以移动的，可以折叠的，宽度可调的，变化位置之后要记录的。
> 你先查，我们再商议怎么处理，我还是担心之前的问题，各种规则 样式 混在一起了，不统一，代码乱了。」

批复：「图层卡补齐可拖/可折/可调宽（建议补齐）、确认删除旧卡、独立页统一改 —— 按 ①②③ 三步推进」。

### 审计结论（改动前）
| 物件 | 外壳 | 交互 | 按钮规格 |
|---|---|---|---|
| `#tlWsLayerPanel`（三级图层控制） | JS cssText 手写 | 手写 pointer 三件套 | `26px / 11.5px` |
| `#grHydPanel`（驳接点） | JS cssText 手写 | 手写 pointer 三件套 | 借 `.gr-card` |
| `.ai-panel`（AI 侧栏） | JS cssText 手写 | 手写 pointer 三件套 + 独立调宽 | 11px |
| `.rym-layer-panel`（在线地图图层卡） | `runye-map-enhance.js` 注入 `<style>` | **无**（固定右上角） | 12px |
| `#mapDrawTools`（地图绘制条） | `online-map.css` | `rypDraggable` | `.mbtn` 28px/12px，两条页各覆盖一次 |
| `#ppQuickBar`（地块分区快捷条） | `style-01.css` `.pp-quick` | `plot-editor.js` 手写 45 行 | `26px / 11.5px` |

四份外壳的 `background` 有 `#fff` 与 `rgba(255,255,255,.97)` 两种，圆角 8/10 两种，字号 12/11.5/11 三种。

### 三步落地
1. **外壳唯一出处** —— `mod/ry-panel.css` 末尾新增 `.ry-float-card / -head / -title / -grip / -caret / -body`。
   四张卡的 `cssText` 只剩「定位 / 尺寸 / 层级 / 溢出 / 布局方向」。
   语义配色例外（AI 面板的绿字白底）写在 `runye-ai-plan.css` 的 `.ai-panel.ry-float-card` ——
   **必须双类**：`runye-ai-plan.css`（第 24 行）比 `mod/ry-panel.css`（第 247 行）先加载，单类会被后加载者压掉。
2. **交互唯一实现** —— `mod/ry-panel.js` 的 `rypDraggable` 补齐 5 个声明式开关
   （`keep-default` / `drag-threshold` / `drag-dblclick-reset` / `drag-clamp` / `fold-default`），
   新增 `placeWhenVisible()`（容器隐藏时 rect 全 0 会把面板压到 0，改为轮询到有尺寸再落位）与
   `rypResizePanel()`（不依赖 `.mw-shell` 的宽度手柄）。三张卡手写交互共约 260 行删除。
3. **工具栏唯一规格** —— `.ry-hbar` / `.ry-hbar-btn`：高 26、字号 `11px!important`、内距 `0 8px`。
   两条条 + 独立页同步换类；`plot-editor.js` 的 45 行手写拖动删除，存档键与 `{l,t}` 格式不变。

### 三个坑（都会再踩）
1. **`.ry-toolbar` 撞名**。初版类名叫 `.ry-toolbar`，而 `runye-theme.css:156` 早有一个同名 opt-in 类
   （`min-height:var(--ry-toolbar-h)` = 56px + `background` + `color:var(--ry-s-800)`）。
   结果 `#ppQuickBar` 被撑到 56px 高、文字变 `#334155`，A/B 直接抓到 `base.secPP 493x38 → 516x56`。
   ⇒ 改名 `.ry-hbar`。**结论：新增全局类名前先 `grep -rn "\.类名" --include=*.css`。**
2. **`classList.toggle('folded', undefined)` 会「加上」类**。旧写法
   `safeRead(key)==='1' || (!safeRead(key) && legacyKey && safeRead(legacyKey)==='1')` 在 `legacyKey`
   未声明时整条 `&&` 链返回 `undefined`，而 WebIDL 把 optional boolean 的 `undefined` 当「没给 force」
   ⇒ 纯 toggle ⇒ `#designParametersPanel` 首次访问被折叠成 48px 竖条（线上实测是展开的，本地 HEAD 快照是折叠的）。
   v544 把 `folded` 强制成严格 boolean。**凡是把变量当第二参数传给 `classList.toggle` 的地方都要防 undefined。**
3. **探针的 `display:none` 假红**。离线无 CDN 时 `#pipePlanSection`/`#onlineMapSection` 常驻 `display:none`，
   `style.display='block'` 无效，必须 `setProperty('display','block','important')` + 轮询容器 `clientWidth>0`；
   否则按钮 `getBoundingClientRect().height` 与 `offsetLeft/offsetTop` 全 0，表现为「拖动不生效 + 按钮高 0」，
   而 `fontSize` 仍然读得到 11px —— 极易误判成实现问题（本次先判成红，实为探针）。

### 新增守卫
`ci_check_static` 第 ⑧ 项：四张卡必须挂 `.ry-float-card`；挂类后紧跟的 `X.style.cssText`
不得再出现 `background / box-shadow / border-radius / border: / font:`。只扫「className 行 + 其后 3 行」，
不做全文模糊匹配（实测全文匹配有 25 处误报：注释、图例色块、`innerHTML` 里的图例背景色）。
已做注入自测：往 `inline-27` 的 cssText 加 `background:#fff;border:1px solid #cbd5e1;` 立刻红灯。

### 状态
`ci_check_static` PASS=12 FAIL=0（本次提交版；工作区因并行会话另加 7 项共 19）｜
`node --test tests/*.test.cjs` 122/122 ｜ 卡片外壳 A/B 61 元素 × 55 属性 0 差异 ｜
行为探针 31/31 ｜ 工具栏探针 17/17 ｜ 线上冒烟 27/27。

---

## 25b. v545-rect-clamp 快捷条「藏在里面了，拖不出来了」（2026-10-17 · 已发布上线）

首次提交号 `3131fdc`（版本串曾用 `v544b-rect-clamp`），随后 `d7ccaa4` 仅改版本串形态为
`v545-rect-clamp` —— 线上冒烟的 `/^v\d{3}-[a-z0-9-]+$/` 不认字母后缀。**修复内容两笔相同。**

### 用户原话
「地块分区的顶部工具栏 藏在里面了，拖不出来了，」（附截图：`#ppQuickBar` 贴在区块左缘外、抓手看不见）

### 根因三层（v544 换坐标系才暴露，v248 的实现把它遮住了）
1. **`.pp-canvas-wrap` 从来没有 `position`** —— `#ppHint` / `#ppQuickBar` 两个 `absolute` 浮层都写在它里面，
   实测 `offsetParent=MAIN`，CSS 的 `left:10px;top:8px` 落在画布左外侧 **272px**。
   成组管路页 `#grPipeSection #grCanvasWrap` 一直有 `position:relative`（style-01 末尾），二级页漏了这一条；
   v248 的旧拖动实现全程用「wrap 视口 rect」计算，把问题完全掩盖了。
2. **`rypDraggable` 混用两套坐标**：`offsetLeft` + `bounds.clientWidth` 算夹紧，存档却是「相对 bounds」。
   `offsetParent` 不是 bounds 时两者差 272px ⇒ 老用户 v248 存的「画布相对坐标」被解释到画布外、
   夹紧范围也错位，条顶在区块左缘、抓手被裁掉，怎么拖都回不来。
3. **`placeWhenVisible` 的 10s 重试队列没有「用户已开拖」守卫** ⇒ 拖动中途被拽回存档点（「拖了又弹回去」）。

### 改法
- `mod/style-01.css`：补 `#pipePlanSection .pp-canvas-wrap{position:relative}` ⇒
  **CSS 默认位 / `offsetLeft` / 拖动夹紧 / 存档四者归一坐标系**（与 `#grCanvasWrap` 同级口径）。
- `mod/ry-panel.js`：`rypDraggable` **全程 `getBoundingClientRect`** —— 新增 `clampRect` / `moveRectTo`，
  删掉 `limits()` / `place()`；拖动 = 起始 rect + 指针位移；夹紧 = bounds rect；
  存档 = rect 相对 bounds（**与 v248 旧格式一致，老存档免迁移**）；写 `style.left` 用
  `offsetLeft + 视口位移差`，不再依赖 `offsetParent` 是谁；`placeCancelled` 守卫；
  `resize` 重夹紧同样 rect 化。
- `index.html`：`#ppQuickBar` 补 `data-ry-drag-threshold="4" data-ry-drag-dblclick-reset="1"`，
  抓手 `title` 标出「双击工具条 = 回到默认位置」——**拖丢了的逃生口**。

### 验收
新增 `_probe_rect_live.mjs`（直连线上，同一套 8 项断言）：`wrap` 是定位祖先 / 老存档
`{l:30,t:16}` 落回 (30,16) / 条完整在画布内 / 抓手可命中 / 拖动跟手 (+120,+60) /
存档=画布相对坐标 / 双击复位 (10,8) / 双击清存档 —— **8/8**（本地与线上各跑一遍）。
回归：工具栏探针 17/17 ｜ 行为探针 31/31 ｜ 外壳 A/B 六面（pp/tl × rail/base + secTL）0 差异 ｜
`ci_check_static` PASS=19 FAIL=0 ｜ 单测 123/123 ｜ 线上冒烟 **27/27**。

### 一条判据（可复用）
> **看到 `absolute` 浮层位置不对，先查 `offsetParent.id`；看到「拖动不跟手 / 拖了弹回」，先查两套坐标是否混用。**
> 同一个组件里只要出现「`offsetLeft` 夹紧 + rect 存档」这种混搭，`offsetParent` 一变就整体崩 272px。

---

## 25c. v547-card-rhythm 卡内节奏统一（2026-10-17 · 已发布上线）

提交号 `7cbfe48`。外壳统一（v544）后的第二层：三张**可见**卡内部原来仍各写一套。

### 前置发现：四张卡其实只剩三张
审计时发现 `.ai-panel` 自 **v484** 起在主页常驻 `display:none`（`runye-ai-plan.js` 的
`syncSection()`：非 smartEntry 直接隐藏）——智能规划只走导航 `?smart=1` 全屏工作台。
**它已不是可见卡片**，内部不纳入卡内口径；v547 的通用控件规则必须 `:not(.ai-panel)` 排除它，
否则会把它的 13px 控件一起改掉。

### 实测四类不一致（改前）
1. 行距：图层卡 label `margin:2px 0`（相邻净距 2），地图卡 0；
2. 分组标题：只有图层卡有，inline `margin:8px 0 3px;padding-top:6px`（行盒 26.19）；
3. 说明行：图层卡 11px/1.6=17.6，水力卡 `.gr-empty` 11px/1.5=16.5；
4. 卡内控件：被 style-01 全局 typography 顶成 **13px**（比卡正文 12 还大）；图层卡 chip 的
   inline `font-size:11px` **不带 !important ⇒ 从未生效**（§四.1 的坑第二次实锤）。

### 口径（唯一出处：mod/ry-panel.css「卡内节奏」段）
五个角色类 + 四个辅助类：`.ry-float-row`（行 19.2 行盒，勾选框 12px）/ `.ry-float-sec`
（分组标题 12/600，上 8 下 3，带顶线加 `.is-divided`）/ `.ry-float-note`（说明 11/16.5）/
`.ry-float-legend`（图例 10/15）/ `.ry-float-chip`（动作按钮 20px/11）；
`.ry-float-value`（值行，键 52px）/ `.ry-float-label` / `.ry-float-chips` / `.ry-float-sep`。
卡内 `input/select/textarea` 统一 12px（`:not(.ai-panel)`）。
**三档行高 19.2 / 16.5 / 15；两档间距：组内 0、组间 8。**
水力卡数据区（`.gr-hyd-sum` / `.gr-hyd-tbl`）**不并入**（10.5px 密集数值表自成体系），
只把 `.gr-hint` 归说明档、`.gr-btn` 归动作按钮档（11.5→11）。

### 验收
- `_probe_card_rhythm.mjs`：在真实页面建角色元素读 computed 值（不依赖选择状态），24/24，可 `RY_URL=` 直连线上。
- 外壳 A/B（`_probe_float_cards.mjs` 基线树 A/B）153 处差异逐条核对全部属本改动，`.ai-panel` 0 差异。
- 行为 31/31、工具栏 17/17、ci PASS=19、单测 123/123、线上冒烟 27/27。
- 卡片特写：图层卡 244→237px、地图卡 257→260px、水力卡 134→139px。

### 版本号
并行会话已把 sw VERSION 抬到 `v546-terrain-transfer-tab-binding` ⇒ 本版取更高号 `v547-card-rhythm`
（沿革段落追加在 v545 之后；sw.js 仍混编，只暂存自己的 hunk）。

---

## 25d. v548-card-data-rhythm 水力卡数据区并进卡内节奏（2026-10-17 · 已发布上线）

提交号 `717bbb7`。用户对 v547 留下的两处「有意不并入」批复「没有就改吧，我同意」⇒
把其一（水力卡数据区）并入口径；**另一处（.ai-panel 内部）保持不动** —— 它自 v484 起主页整卡
`display:none`，只有 `?smart=1` 全屏工作台在用，改成卡节奏会打乱工作台的 14px 体系。

### 第四个实锤：`table/td/th` 也被全局 typography 压成 13px
改前先诊断（`_shot_hyd_table.mjs` 的规则枚举）：`runye-typography.css:131/136` 对
`table:where(:not(.topbar *))` 与 `th,td:where(:not(.topbar *))` 打了
`font-size:var(--ry-fs-body)=13px !important` —— `.gr-hyd-tbl` 原写的 `10.5px` **从未生效**，
表格实际一直渲染 13px（比卡正文 12px 还大）。与 §四.1 的 input 是同一款坑：
> **凡是会被全局 typography 点名的元素（p/li/table/input/select/button/td/th），卡内想改字号必须带 `!important`。**

### 改动（mod/style-01.css）
- `.gr-hyd-tbl` 表体 `11px!important`/16.5、单元内距 `2px 4px`→`3px 6px`、表头 600；
- `.gr-hyd-sum` 组间 4→6（对齐 `.ry-float-sep`）、单元内距 3px 6px→4px 6px、span 10px/15（图例档）、
  b 保持 14px/19.2（数值强调档，刻意与 12px 正文对比）。

### 验收
`_shot_hyd_table.mjs`：真实数据要靠「⚡ 生成各块管路」无头造不出 ⇒ 在真实卡片里注入与
`inline-29.js` 同结构的样例（.gr-hyd-sum + .gr-hyd-tbl），改前/改后/线上三张特写 +
行高断言（表体行高 24.5→23.5、行字号 13→11、面板 340→335）。ci PASS=19、单测 123/123、
行为 31/31、线上冒烟 27/27。

---

## 25e. v550-front-in-plot 总管移进分区（2026-10-17 · 已发布上线）

提交号 `56cbf5f`（+`9130d92` ?v= 对齐）。用户：「管路规划页面这个总管的生成逻辑改一下，
现在水源位置不动，总管移动到分区内，移动到最近的第二个分区内……垂直与主管，偏离主管三通
一定的距离。端头被主管直接裁剪掉。」三项几何经 AskUserQuestion 确认（会话记录可查）：
① 距第 2 排顶边往下 **15 米**（=「偏离主管三通一定的距离」），且总管可沿主管走向拖动；
② 两端**截止于第 2 排最左/最右主管**（不横贯全幅宽）；③ 第 1 排主管上端**裁到三通为止**
（不再伸向地块外）。

### 改动（mod/inline-09.js，front 唯一生成点，v517 起无第二副本）
- **总管几何**：横向分支（主管竖置）`frontY = yPos[1] + min(15, ySrc[1]*0.5)`、
  `x ∈ [第2排最左主管x, 最右主管x]`；纵向分支对称（第 2 列、左缘往右 15 米、截止于最上/最下
  主管）。分区不足 2 列/行时退回旧几何。
- **守卫别写反（A/B 抓到的真 bug）**：横向总管的 x 范围取自**列** ⇒ 守卫是 `cols>=2`；
  纵向总管的 y 范围取自**行** ⇒ `rows>=2`。首版写反 ⇒ 单行地块 12 列时走纵向分支且
  y 范围塌成一点 ⇒ **零长度总管**（图脚「总管 0.0 m」、水泵扬程掉 3.5 m）。基线对比
  （`git archive HEAD` + RY_ROOT）实测抓到；已加退化兜底（front 长度 <0.5m ⇒ 退回旧几何）。
- **水源连接段 `data-tlsrcpipe`**：水源留在旧总管起点（地块外沿），与总管脱开后用
  「垂直优先」折线接到总管近端；与总管同色（#111827）同宽 6，仅示意（不进 frontPipe
  数据/长度/水力/分段）。水源已在总管上（≤0.5m）不画。
- **主管接入段改「物理线全跨度」判定**（tlStubs）：v143 的按 key 归并增加累计跨度
  `tlMainSpan`；总管 y（x）落在该物理线跨度内 ⇒ **三通画在交点、不画接入段**（旧代码永远从
  归并代表段顶端拉线，总管进分区后会画穿过整排的长接入线）；跨度外 ⇒ 接最近的跨度端点
  （旧几何下=顶端，行为逐字节不变）。三通阀符号 `stubM>1` 门照旧（跨度内 stubM 记 2）。

### 硬约束核对（§五/既有机制全不动）
front 保持 2 点（tl-path-measure `fp.length!==2` 闸不触发）；`FRONT_JUNC_TOL=60` 下行 3+
主管的「远距接入」在旧几何本就存在且按 t 合并，新几何距离更近不恶化；`moves['front']`
(v167) 保留逻辑不动，拖动沿主管走向滑移（正交锁定既有）；快照仍落设计几何（tlFrontDesign）。

### 验收
`_probe_front_geom.mjs`（新探针，支持 RY_URL 直连线上 / RY_ROOT 换基线 / RY_SHOT 截图 /
RY_FOOTER 读图脚）：三种地块形状（横 600×400、竖 400×600、扁 800×160）双朝向 **43/43**，
本地与线上直连同分。单测 122/122（红 1 = 并行会话未入库的 runye_hydraulics_core.test.cjs，
基线无此文件）；ci PASS=22 FAIL=0；双页冒烟 ALL PASS；线上冒烟 **27/27**。

### 混编注记（§八 实战）
并行会话在途把 VERSION 抬到 `v549`→`v552-project-network-owner` 且**保留了我的 v550 沿革
段** ⇒ 按规则取更高号不回退，sw.js 整文件提交；inline-09.js / index.html 用「diff 按行号/
内容滤 hunk → `git apply --cached`」只暂存自己的 hunk（对方的 designRevisionId 水力快照、
?v=509/?v=2-project-owner 留在工作区）。`_smoke_v521_live` 的「style-01 ?v= 与 VERSION 同步」
闸门因对方抬 VERSION 未带 style-01 而红 ⇒ v550b 一行把 style-01 ?v= 对齐到
`552-project-network-owner`（style-01 内容未变）。

### 探针坑位备查
- `tlAutoGenerate()` 无边界会 `alert` 阻塞无头 evaluate ⇒ 探针先种
  `window.measuredPolygon` 并挂 `Page.javascriptDialogOpening` 自动接受。
- 截图：`#tlPipePlanSection` 整节 + `.ry-pane-pipe` 都要 `setProperty('display','block','important')`，
  只强节不行；`Page.captureScreenshot` 的 clip 需取整 + scale:1，否则 Invalid parameters。
- 页内 eval 里没有 `process` —— 环境开关要先 `ev()` 注入 `window.__flag`。

## §25f v556-front-row1-main-elbow：总管贴第 1 排顶边 ＋ 最外一排主管末端 90°弯头（2026-10-18）

用户口径（示意图三轮确认后才动代码，用户原话：「不画对，不准改代码」）：
- 「总管移动到 123 区内……端头被主管直接裁剪掉」⇒ v550 的「第 2 排 + 15 米」作废，
  改 **第 1 排（123 区）、贴排顶边（偏移 0 米）**；水源不动、两端截止于最左/最右主管不变。
- 「主管最边上的地块接到 90°弯头……弯头向上接一段……之后再接支管，支管向两侧延伸」
  三轮澄清后的定论：**最外一排（789 / 28/29/30 区）主管不再向下延伸到底边**，截止于
  「分区中心往下 18% 分区高」；截止点接 **90°弯头**，之后**照抄其他地块**链路：
  连接管 → 阀门 → 支管三通 → 支管（支管几何不变、仍贯通分区向上下两侧延伸）。
  唯一区别 = 主管末端由「三通」改「90°弯头」。
  ⚠ 「向两侧延伸」= **支管三通之后支管向上、向下两侧延伸**，不是分两根叉管（第一版图误读）。

### 改动（唯一生成点 mod/inline-09.js）
1. 总管几何：`FRONT_IN_ROW = 1→0`、`FRONT_IN_OFFSET = 15→0`（`yPos[0] + min(0, …)`；
   纵向对称 `xPos[0]`）。守卫 `cols>=2` / `rows>=2` 与退化兜底（<0.5m 退回旧几何）不动。
2. 最外一排主管截止：`MAIN_END_ELBOW_R = 0.18` ⇒ 末端 y = 分区中心 + 18% 分区高，
   并钳进支管范围（上下 gapV/gapH 内）；纵向分支对称（最外一**列**、末端 x）。
   仅改**自布管**分支；二级页传导几何（`ppHasPipes`）不在本轮范围。
3. 末端阀门：`valves.push({x:brX, y:末端y, ax:mainX, ay:末端y, elbow:true, mi:主管下标})`
   ⇒ 连接管水平（纵向分支：竖直）、阀门仍落点支管，之后支管照旧。
4. 图面符号：末端锚点方块**保留 `data-junction-tee`**（水流路径取锚点、既有 verify 定位靠它），
   另打 `data-junction-elbow="1"` + 白色直角折线（水平连接管走 └、竖直走 ┐）以示区别。

### 材料清单同步（用户明确要求「相关的材料清单统计都要跟着变」）
- 主管长度自动缩短（lens 取自图面几何 `tlFigParamLines`，无需另改）；阀门数量不变（末端照样接阀）。
- 材料表：`zoneTeeN = zoneValveN − zoneElbowN`；新增一行 `autoFitRows('mainEndElbow',
  '主管末端 90°弯头', zoneElbowSpec(Ø 主管), zoneElbowN)`。
- `zoneElbowN` 取自快照阀门的 `elbow` 标记，并按所属主管段 `v.mi` 的遮蔽态剔除
  （与 v162「遮蔽不计入材料」同口径）。
- `runye-material-audit.js`：autoFittings 新增 `zoneElbow` 分桶，末端弯头分区不再进 `zoneTee`。
- `core/data-service.js`：管件清单 FIT 表补 `['zoneElbow','主管末端 90°弯头']`。
- `verify_ry_tool.js`：两行锁定字面跟随（`zoneValveSpec,zoneTeeN` ＋ 新增 mainEndElbow 行）。

### 验收
`_probe_front_geom.mjs` 扩到 v554 口径：F1 改「第 1 排顶边+0」，新增
E1 末排主管末端=中心+18%（不再到底边）/ E2 末端弯头阀数=末排分区数 /
E3 弯头连接管与主管垂直（锚点=主管末端）/ E4 图面弯头符号数 / E5–E6 材料表两行数量。
ci_check_static PASS=23 FAIL=0。

### 坑位
- 无头环境里 `window.render()` 抛 `Cannot read properties of undefined (reading 'length')`
  （材料表 DOM 重渲染在探针上下文不可用）⇒ 材料口径断言改走数据层
  （`RyMaterialAudit.autoFittings` + 快照阀门标记），不要靠 DOM 行。
- 版本：并行会话在我改的过程中连续抬号（v553 → v555-plot-scoped-bridge）⇒ 按规则取更高号
  **v556-front-row1-main-elbow**（不回退对方的号；我的 v554 沿革段保留在 sw.js）。


## §25g v564（批次 F-3）：总管三通 = 总管折线的「断点」，可沿主管向下拖动

### 用户口径（四轮示意图确认后才动代码）
1. 对象 = 总管×主管交接的三通（图面深蓝方块 `data-junction-front`）。
2. 方向 = **沿主管（竖向）上下移**，不是沿总管轴左右滑。
3. **关键更正（用户原话）**：「总管不是不动 —— 总管被总管三通分成了若干总管段，三通相当于
   若干总管段的断点，三通移动之后总管也随之变化，总管整体会变成折线」。
4. ①= A 口径：三通下移后它上方那段主管去掉，主管从三通起算（末端不动）⇒ **主管变短**。
5. 折线走**斜接**；**只能往下拖**；**吸附 1 米**；**拖动后记住**；**材料清单跟着变**。

### 改动（前端唯一生成点 mod/inline-09.js）
- 数据层：`localStorage['tlFrontNodeDrops_v1']`，键 = 物理主管线键（`V<x>`/`H<y>`）+ 地块指纹
  `sig = round(base)|x1,x2,…`（换地块/重排分区自动失效）；`window.tlFrontNodeDropSet/Of/Drops` 导出。
- 几何：主管物理线归并（`tlMainLines/tlMainIdx/tlMainSpan`）**提前到总管几何之前**（折线顶点由它派生）；
  `frontPipe` 由 2 点直线改 N 点折线（顶点 = 各断点）；退回几何（分区不足 2 排/列）按
  「首端 + 断点 + 尾端」拼折线（`tlFrontPolyLine`）；主管截断 `tlTruncateMainByNode`
  （判据 = 断点坐标 > 主管起点，退回几何下断点没越过起点时不截断、只缩接入段）。
- 限位：`上限 = min(主管末端上方 5 m, 该物理主管上分区阀锚点上方 2 m)`，< 0 视为不可拖。
- 交互：三通方块输出 `data-junction-key/sig/off/max/axis/mps`（mps = 该主管 SVG 单位/米，供像素换算）；
  `tlInitDrag` 命中后沿主管轴拖动（尺寸线之后、整图平移之前），松手落盘 + `tlAutoGenerate` 重生成；
  光标 ns-resize / ew-resize + 琥珀 hover。
- 走向判定：`frontHoriz` 改用「分支设计朝向」（折线后端点 y 不等，按端点推断会把横向总管误判成竖向）。

### 联动（无需另改：几何一改自动跟着走）
总管折线长↑ / 主管截断后长↓ ⇒ 材料清单 `tlFigParamLines` 与最不利路径、扬程全部重算。

### 配套修正（不加就会回归）
- `frontRatios` 只认两点直线 ⇒ 折线时改由顶点切段 `tlFrontPolyCuts` + **弧长**取点 `tlFrontPolyAt`
  （两点线性插值在折线上会错位）；否则总管分段遮蔽会哑火。
- 水流动画改优先取整管引用 `path[data-tlpipe="front"][data-tlpipe-ref]`（分段 path 只有 2 点，
  与 `frontPipe` 点数不等 ⇒ 水源端「要不要反序」判断失效）。

### 验收
`_probe_front_node.mjs` 本地 **51/51**：B0 无偏移共线 / N1 断点下移 / N2 折线变长 / N3 主管截断 /
N4 只影响一根 / N5 图面三通跟随 / N6 clamp / N7 真实拖动（吸附 21 m、落 localStorage）/ N8 复位。
`_probe_front_geom.mjs`（v556）61/61 无回归；ci_check_static PASS=26 FAIL=0；`_smoke_publish.mjs` ALL PASS；
单测 135/136（唯一红灯 `tests/runye_hydraulics_core.test.cjs` 属并行会话未入库新测试，非本次引入）。

### 坑位
- **探针地块延迟一拍**：`window.measuredPolygon` 经 store 传导，首次 `tlAutoGenerate()` 读到的仍是上一块
  ⇒ 探针里必须连调两次，第二次才是本块几何（否则会看到「布局翻转」的假象）。
- 断点定位不能靠 `frontPipe[idx]`：退回几何下 frontPipe 含固定的首/尾端点，断点不在同一位置
  ⇒ 按 `axis` 取 x/y、用 `sig` 里的 pos 序号反查顶点下标。
- 拖动位移方向要按 `axis` 施加（V→clientY，H→clientX），否则位移算成 0、松手不落盘。
- 工具函数若定义在渲染函数内部，拖动回调（`tlInitDrag` 另一作用域）访问不到 ⇒ 导出到 window。
- 版本：并行会话连续抬到 v561-terrain-import-atomic / v563-project-restore-binding
  ⇒ 按规则取更高号 **v564-front-node-drag**（不回退对方）。

### §25h v568-front-node-drag-ws —— 三通拖动「真实鼠标点不到」修复（工作区补入口 + 简图命中）
背景：v564 上线后用户反馈「拖动总管三通没看到实际效果；一选总管就选到整条，三通选不上」。

**根因（实测，非推测）**
- 简图：三通 rect（9×9）画完后紧接着画「三通自己的连接线」line，起点=三通中心、stroke 3.5、
  后画所以在上层 ⇒ elementFromPoint 命中的是 line 而不是 rect；命中判定要求同时带
  data-junction-front，而 line 只有 data-junction-key ⇒ closest 失败 ⇒ 退化成整图平移。
  CDP 真实鼠标实测：点 (450,348) 顶层=line[H300]，拖动后地块组 translate(33.6,0)、三通没动、没落盘。
- **v564 的 51/51 是假绿**：旧探针把 MouseEvent 直接派发到 rect 元素本身（target=rect），
  绕过了命中判定。与 v155「节点不能拖动」同款坑 ⇒ **拖动类改动必须走 CDP 真实鼠标验证**。
- 工作区：v564 只做在简图（tlInitDrag 挂在简图 svg 上），工作区根本没有三通拖动入口，
  而用户正是在工作区操作 ⇒ 点总管走「自动管线整条拖动」（v170 正交锁定），三通选不上。

**改动**
1. mod/inline-09.js
   - 三通加 r=11 透明命中圈（置顶）、阀门⊗加 r=9 命中圈：工作区 [data-tllinkhit] 同款做法；
     hover 琥珀描边即「抓住了」的反馈（屏幕实测命中窗口 10.4px → 20.9px）。
   - tlInitDrag 命中兜底：closest("[data-junction-front][data-junction-key]") 失败时，
     退到 closest("[data-junction-key]") 再反查同组带 front 的元素取限位属性（点连接线/阀门也生效）。
   - tlDiagramData 新增 frontNodes：[{mk,axis,pos,base,at,x,y,off,max,sig}]（设计几何，未含 tlFrontMv 平移）
     —— 工作区没有 DOM 命中层，靠世界坐标拾取，必须拿到这份清单。
2. tl-workspace/tl-workspace.js（新增三通断点拖动）
   - pickFrontNode(p,tolM)：世界坐标最近断点（容差 = 12px 换算米数 ×1.4）。
   - pointerdown 分支排在「自动管线整条拖动」之前、各模式分支之后（技能 §2.143：越具体越靠前；
     maskMode/fitMode/lineMode 开启时行为一条不动）。
   - 位移直接取世界坐标差（米）⇒ 吸附 1 m、clamp[0,max]；比简图的「像素→SVG→米」更可靠。
   - 拖动中跟随 tip「三通下移 N m（上限 M m）」；松手 tlFrontNodeDropSet + tlAutoGenerate 重生成
     （与 v98h 阶梯同款：先记视口 → 重生成 → 还原视口）。

**验收（_probe_front_node_ws.mjs，全部走 CDP 真实鼠标）**
- W1 工作区能查到三通（底图克隆带 key）｜W2 frontNodes 已落｜W3 落盘 off=38 ≤ max 58.33
- W4 总管几何真变 200 m → 203.6 m｜W4b 未误写 moves.front｜W5 对照：点总管管身不写三通偏移
- W6 简图三通中心顶层 = circle[data-junction-hit]（不再是 line）
- 回归：_probe_front_node 51/51、_probe_front_geom 61/61、ci 26/0、双页冒烟 ALL PASS、单测 138/139
  （唯一红灯 runye_hydraulics_core 属既存，非本次引入）。

**坑位（可复用）**
- 拖动/命中类改动，探针**禁止**用 dispatchEvent 派发到目标元素本身（会绕过命中判定、制造假绿），
  必须用 Input.dispatchMouseEvent 走真实坐标。
- 新增同属性的辅助元素（命中圈）会让既有多处选择器计数翻倍 ⇒ 回归探针要收紧成
  rect[data-junction-tee][data-junction-front]（本次 D2/B0c 因此红过一轮）。
- 版本：并行会话已抬到 v567-current-plot-anchor-fail-closed ⇒ 取更高号 **v568**（不回退对方）。

### §25i v571-source-straight-move —— 水源连接段改直线 + 水源可任意拖动
用户原话：「这里不要做成折线，就按照移动后的三通的位置 跟水源连起来，形成直线就行了。
还有，水源位置要变成可任意移动的。」（附截图箭头指向水源右侧的直角折点）

**① 连接段改直线**
- 旧口径（v550）：水源→总管是「垂直优先」两段折线（先横后竖 / 先竖后横），水源一挪就多一个直角。
- 新口径：`scPts=[sourcePos, scEnd]` 两点直连；scEnd = **总管上离水源最近的顶点**
  —— 横向/纵向主分支下这些顶点就是各三通（含 v564 拖动后的位置），正好实现「按移动后的三通位置连」
  （实测：拖三通 off=29 后，连接段终点与三通屏幕距离 0px）。

**② 水源可任意拖动（简图 + 工作区）**
- 数据层：`localStorage["tlSourceMove_v1"] = {sig,x,y}`，sig = 地块 bbox + 顶点数（换地块自动失效）；
  导出 tlSourceMoveOf / Set / Clear、tlSourceLinkLen。
- 优先级：用户拖动值 > 二级页 ppShare.source > 自动推断；拖过的水源**不再随**总管整体平移(AE.moves.front)叠加。
- 简图：tlInitDrag 里新增 srcDrag（预览=水源 g 平移 + 连接段 d 起点跟随；松手整米吸附 + 落盘 + 重生成）。
- 工作区：pickSource（世界坐标）+ srcPointDrag，排在三通之前、各模式分支之后；松手同样落盘+重生成（记视口）。
  ⚠ 工作区不需要 DOM 层级命中，水源是克隆底图上的圆点，但拾取一律走世界坐标。
- 右键换向（plot-editor.js tlSrcFlip）在写 state.source **之前**先调 tlSourceMoveClear()，
  否则拖动值优先级更高会把换向结果盖掉（看起来"右键没反应"）。

**③ 长度口径（用户选「自动计入」）**
- `tlSourceLinkLen(d)` = 水源到总管最近顶点的直线长度（与绘图同一份几何）。
- 计入三处：render() 的 matFrontLen（材料）、computeThreeLevel 的 frontLenUsed（水力，含 hydraulicPath 分支）。
- 口径：总管长度 = 图面总管(wp.front) + 水源连接段直线 + 「水源距离」输入框(planSrcDist，地块外补充，默认 0)。

**验收（_probe_source_straight.mjs，全 CDP 真实鼠标）8/8**
- S1 连接段 2 点直线（d="M99.3 110.0 L136.0 339.5"）｜S2 终点=最近顶点(0,150)、长 151.91 m
- S3 简图拖水源落盘 {sig:"0,0|600x400|4",x:5,y:22}、重生成后 sourcePos 跟随
- S4 frontLenUsed 351.9 = wp.front 200 + 连接段 151.9 + 水源距离 0（连接段确已计入）
- S5 拖三通 off=29 后，连接段终点与三通屏幕距离 0px（跟随生效）
- S6 工作区拖水源落盘并生效
- 回归：_probe_front_node_ws 8/8、_probe_front_node 51/51、_probe_front_geom 61/61、ci PASS=28 FAIL=0、
  双页冒烟 ALL PASS、单测 140/141（唯一红灯 runye_hydraulics_core 属既存）。

**坑位**
- 水源拖动分支必须排在**尺寸线之前**：水源是精确 DOM 圆点（r=18 热区），尺寸线是坐标容差模糊命中；
  水源贴在地块外侧、与尺寸线邻近，放在其后会被抢走（实测：拖水源变成拖尺寸线，水源不动也不落盘）。
- 拖动水源后「水源距离 planSrcDist」仍是手动输入项，不要把两者混为一谈（前者是图面连接段，后者是地块外实际距离）。
- 版本：并行会话已提交到 v570-irrigation-scope-guard ⇒ 取更高号 **v571**（不回退对方）。

### §25j v572-plan-val-regular —— 三级左栏数值改常规字重（用户要求）
用户：截图红框（三级「管网参数/生成与输出」左栏，联合流量→支管流速）「加粗字体都变成不加粗的普通字体」。
- `.pp-plan-val` 的 font-weight 600 → 400，**三处必须同改**（v539 双副本坑）：
  · `mod/style-01.css:2693` `.tl-plan-result .pp-plan-val`（结果栏，原位/rail 两态都命中）
  · `mod/style-01.css:2694` `#tlPipePlanSection .pp-side .pp-plan-val`（左栏原位态）
  · `mod/style-01.css:4170` `#ryCadSide [data-pp="tlPipePlanSection"] .pp-side .pp-plan-val`（**rail 态副本**，漏改则工具栏搬移后又变粗）
- 通用 `.pp-plan-val{font-weight:600;font-size:14px}`（style-01.css:1107）与二级页 `ry-panel.css:432` **不动** —— 只改三级专属三条。
- 实测（getComputedStyle）：tlPlanCombinedFlow / PumpFlow / PumpHead / PumpPower / MotorPower / FrontPipe / MainPipe / BranchPipe 全部 `400/11px`。
- 未动：列头 `.pp-plan-cols-head`（600）、改径后橙值 `.pp-plan-val-real`（700）—— 仍有强调语义，若用户要一起改需另说。
- ci PASS=28 FAIL=0。版本 v572（CORE 含 style-01.css ⇒ 必须抬；index.html 的 style-01.css?v= 同步）。

### §25k v573-grp-bg-set-btn —— 分组标题底色统一 + 设置按钮瘦身
用户：截图箭头指向工具栏第一组「二级 · 地块与灌溉参数」，要求「这里也应该有浅浅的绿色底色，
三级管线 / 地形高程 都有」；另外「参数设置文字缩小，改为『设置』两个字，前面的图标也取消」。
- 底色：`mod/ry-panel.css` 原本是 `#ryCadSide .ry-cad-grp:not(#ryCadGrpPipe)>summary{background:#f4f9f6}`
  —— 显式把第一组排除在外（历史遗留）⇒ 去掉 `:not(...)`，三组同底色 `#f4f9f6`、hover `#eaf3ed`。
- 按钮：index.html 里 `⚙ 参数设置` → `设置`；`.ry-cad-set-btn` 增 `font-size:11px!important`
  （typography 对 `button` 打 13px !important，不带 !important 压不住）。
- 实测：`#ryCadGrpPipe>summary` background-color = rgb(244,249,246)；`#ryCadGrpPipeSet` = 11px / 文案「设置」。
- 注：截图脚本取不到坐标（#ryCadSide 默认 display:none，只在 body.ry-tool.ry-cad-vp 制图视图显示），
  故本次以 computed 值为准，未留截图。
- ci PASS=28 FAIL=0；ry-panel.css 与 index.html 均在 CORE ⇒ sw VERSION v573 + `ry-panel.css?v=` 同步。

### §25l v574-angle-float-unify —— 分区角度悬浮面板外壳统一到 .ry-float-card
用户：「在线地图页面，分区角度这个悬浮面板跟图层那个悬浮面板不一样，要跟图层悬浮面板样式统一，
我之前要求所有悬浮面板都统一的。」
- 图层面板（runye-map-enhance.js 动态建）= v544 统一壳 `.ry-float-card`；
  分区角度面板仍是旧壳 `.ryp-float/.ryp-titlebar`（绿边 + 深绿标题条白字）。
- 改法：容器/标题条/正文/折叠按钮 全部换成统一壳类（ry-float-card / ry-float-head /
  ry-float-title / ry-float-caret / ry-float-body），删掉 `.ry-angle-panel` 与 `.ry-angle-head` 里
  的 background/border/box-shadow/font-size（颜色归 .ry-float-card），只留定位与内部排版。
- **两处副本同步**：① index.html HTML + mod/online-map.css（#onlineMapSection 版，压缩单行）；
  ② runye-map-measure.html（独立页，HTML + 内联 <style>）。
- 关键坑：`.ry-angle-body` 从 `padding:7px` 改 `display:flex` 后是**作者样式**，会盖掉 UA 的
  `[hidden]{display:none}` ⇒ 必须补 `.ry-angle-body[hidden]{display:none!important}`，否则折叠点了没反应。
- 验收 `_probe_float_unify.mjs` 5/5：两块卡的 bg/border/shadow/font/color 逐值相同
  （rgba(255,255,255,.97) / rgb(203,213,225) / 0 10px 28px / 12px）、标题条 bg #f1f5f9 + 字 #1f2937、
  标题条不再是 rgb(23,62,50)、类名含 ry-float-card、折叠 none→flex。ci PASS=28 FAIL=0。

### §25m v575-chip-neutral —— 分区角度面板按钮改「默认中性、交互才变绿」
用户质疑：「回传地块绘制/保存地块/应用并重新划分 那些按钮怎么是绿色的，应该是点击之后变色吧？
这个绿色是怎么考虑的？参照了什么标准？查一下这个悬浮面板是不是有多层嵌套跟样式覆盖的情况。」

**绿色溯源**：runye-theme.css:12 `--ry-green-600:#173e32`（v427-deepgreen-brand 全站品牌主色）
→ online-map.css:2 `--g-600:var(--ry-green-600)` → `.mbtn-primary{background:var(--g-600);color:#fff}`。
项目内两套口径并存：① `.mbtn-primary`/`.btn-primary` = **主操作常绿**；② `.mbtn.btn-on` = **切换按钮选中后变绿**
（顶部绘制工具条那排）。这三个是动作型 ⇒ 沿用了①。
⚠ 同一 token 有两套值：style-01.css:1705 的 `--g-600:#16a34a`（亮绿）vs online-map.css 重定向的 #173e32。

**多层嵌套与覆盖（#btnSavePlot 实测 6 层）**
1. `#onlineMapSection .mbtn`（白底/34px/12px/600）
2. `#onlineMapSection .map-float-actions .mbtn`（28px/12px!/700/绿边/圆角4px）
3. `#onlineMapSection .ry-angle-panel .save-row .mbtn`（保存行专属）
4. `.mbtn-primary`（绿实心，盖掉 1、2 的白底）
5. typography `button:where(:not(.topbar *)){font-size:13px!important}`（被 2 的 !important 压住）
6. `style-01.css body *{border-radius:0!important}` ⇒ **2 里的 `border-radius:4px` 是死声明**（computed 0px）

**改法（用户选「默认中性、交互才变绿」）**
- 五个按钮全部改用卡内统一规格 `.ry-float-chip`；主操作加 `.is-primary`。
- `.ry-float-chip.is-primary` = **白底 + 深绿边 + 绿字，hover/active 才绿底白字** —— 新增在
  ry-panel.css「卡内节奏」区（卡内按钮唯一出处）。
- 删掉两处副本里 `.map-float-actions .mbtn*` / `.save-row .mbtn` 的绿色声明（含那条死圆角）。
- 尺寸统一 24px/11px/整行宽。

**验收 _probe_chip_unify.mjs 8/8（含真实鼠标 hover）**：中性按钮 白/#cbd5e1；
保存地块与应用并重新划分 默认 白/#173e32/#14532d，**hover 变 rgb(23,62,50) 底 + 白字**，移开恢复；
五个按钮全部 24px/11px/130px 宽。ci PASS=28 FAIL=0。

### §25n v577-settings-fixed-height —— 设置弹窗高度固定 + 文字统一 -1px
用户：「这个设置，应该统一一个高度，按照必须得最高的高度统计，点击切换的时候即便不需要那么高，
也要按照统一高度显示，不需要的区域留白就行了，这样才不会感觉页面跳来跳去的。再有，设置内的所有文字都缩小一级。」
- 实测六页签内容高：管材单价 472 / 造价假设 208 / 标注与文字 202 / 标注几何 457 / 工程参数 202 /
  灌溉参数 762 ⇒ 整窗高度 298~792 摆动 494px。
- 改 `#rySetModal{height:min(88vh,800px)}`（保留 max-height:88vh）：按最高页签整窗高度定死，
  内容少的页签留白，最高页超出部分照旧在 `.rs-body` 内滚动。实测 6 页签 modal 恒 = 792（差 0）。
- 字号统一 -1px：基础 13→12、标题 15→14、页签 12.5→11.5、h4 13→12、说明 11.5→10.5、
  标签/单位 12→11、input/select 12→11（!important）、按钮 12→11（!important）、角标 12→11、φ 11.5→10.5。
  ⚠ `.rs-note` 是 `<p>`，被 typography `p{font-size:13px!important}` 顶回 13px ⇒ 必须 !important；
    input/select/button 同理（typography 对控件打 13px!important）。
- 验收 `_probe_set_height.mjs`：六页签 modal 792 恒定；字号实测 title 14 / nav 11.5 / h4 12 / note 10.5 /
  label 11 / unit 11 / input 11 / btn 11。ci PASS=28 FAIL=0。
- 版本：并行会话已抬到 v576 ⇒ 取更高号 v577。

### §25o v578-chip-hover-unify —— 卡内按钮 hover 变色统一 + 规则精简
用户：「这些按钮手放上就变色这个效果是对的，但是变色还不统一，各有各的颜色，统一一个颜色，
这个按钮是不是有多层覆盖跟嵌套，如果有，样式代码简化下。」
- 实测（真实鼠标逐个 hover）：中性 chip hover 只把边框 #cbd5e1→#94a3b8、字色 #475569→#334155
  （几乎看不出）；主操作 chip hover 变深绿底 #173e32 + 白字 ⇒ 五个按钮观感各异。
- 改：hover / active **只改底色且全 chip 同色**（#eaf3ed / #d8e9df）；主次只由默认态的
  边框与字色表达（中性 #cbd5e1/#475569 vs 主操作 #173e32/#14532d）。
- 规则精简：颜色相关 6 条（chip / chip:hover / danger / is-primary / is-primary:hover / is-primary:active）
  → 3 条（chip:hover 只 1 个属性、chip:active、is-primary 只留默认态），互不覆盖；
  另把 online-map.css 与 measure 页两处同值的「整行宽 24px」尺寸规则合并成一条逗号分组。
- 实测 hover 后五个按钮 bg 全部 rgb(234,243,237)；边框/字色保持默认（主次可辨）。ci PASS=28 FAIL=0。

### §25p v580-front-move-removed —— 取消「总管整体移动」
用户：「管路编辑页面中之前应该有要求总管整体移动的代码，现在是移动总管三通自动重构管道了，
那就不存在总管一起移动的情况了，所以那段代码要取消吧。」
拍板：只删总管(front) 的；拖总管只选中、不移动。

删除清单：
  ① tl-workspace.js：v170 正交锁定 4 字段（startW/curW/lockAxis/committed）+ pointermove 里的
     锁轴分支；autoDrag 提交 movePipe 时加 autoDrag.pid !== 'front'。
  ② inline-09.js：渲染层不再叠加 AE.moves['front']（frontPipe/sourcePos 直接用设计几何）。
  ③ tl-auto-edits.js：syncGeometry 里 v167「几何变化时保留 moves['front']」特例取消。
  ④ inline-09.js：v170b 的接入段裁剪外壳 if(tlFrontMv) 连带删除。

**关键坑**：④ 那段引用了已删变量 tlFrontMv ⇒ ReferenceError ⇒ tlAutoGenerate 整个挂掉、
工作区渲染不出来（#tlWsCanvas 不挂载）。**删变量必须全局搜一遍引用**，不能只删定义处。

保留：moves 机制本身（主管/支管整条让位拖动仍需要，实测 movePipe(main-0 / branch-0) 均返回
true 并写入 dx）、selectAuto 选中行为、inline-24 复位按钮（判据是 moveOf(id)，front 恒 null
⇒ 自动不显示）、inline-27 系统图的 _fm 分支（_fm 恒 null ⇒ 对总管自动不触发）。

验收：_probe_front_node_ws 新增 G1/G2/G3 全绿（拖自动管线不写 moves[front]；
movePipe(main-0/branch-0) 仍 true；拖后 frontPipe 不变）+ 原 W1~W6 全绿；
回归 _probe_front_node 51/51、_probe_front_geom 61/61、_probe_source_straight 8/8、ci 28/0、
单测 140/141（红灯 runye_hydraulics_core 既存）、双页冒烟 ALL PASS。
版本：并行会话已抬到 v579 ⇒ 取更高号 v580。

### §25q v581-flow-route-polyline —— 水流动画跟随重构后的折线总管
用户：「拖动总管三通导致水流动画的线对不上了，能根据重构的管道路径来演示动画吗？难度大不大？」
（确认两处界面都有问题；选「现在就改」。）

根因（tlFlowRoute，动画路线是「从已画好的 path 上取最近点拼出来」，v218 设计）：
① 总管段用 `for (k=1; k<=tap.i; k++) sub.push(fPts[k])` 截取，tap.i 是**最近线段的起点下标**——
   垂足落在第一段时恒为 0 ⇒ sub 只有起点，**总管段整段消失**（水流从总管起点直接横穿到主管）；
   多顶点折线时又会把垂足所在那一小段整段跳过。
② 接入段用 `sub.concat([mp[0]])` **直连**，而图面的接入段是沿主管走向画的另一条线（v550/v556），
   拖三通后接入点位置/方向都变了 ⇒ 视觉错位。

改动：
- 新增 `tlFlowSliceTo(fPts, 垂足)`：按**弧长**从水源端走到垂足，包含途中所有折点。
- 新增 `tlFlowStubBetween(svg, a, b)`：读图面 `path[data-tlstub]`，两端点就近配对（反向也认），
  阈值 = 直线距 ×1.6 + 8 防错配；匹配不到才回退直连。
- 实测（接点不在总管起点时）：水流第 2 点从「直接跳到主管 (232.6,358.8)」变为
  落在总管斜线上的垂足 (85.9,388.2) —— 该点在 `M80,358.8→125.8,587.7` 上，误差 0.02px。

难度评估：主体改动集中在一个函数（约 100 行），不动数据层/材料/水力，风险低。
剩余：图面本身没有画接入段（主管跨度覆盖、直接相交）时，水流仍用直连——因为图面没有那条线可读。

回归：_probe_front_node_ws 全绿、_probe_front_node 51/51、ci 28/0、单测 140/141（既存红灯）、
双页冒烟 ALL PASS。

### §25r v582-ws-rerender-after-regen —— 拖三通后水流动画仍按旧路由的根因
用户：「不行，动画演示没有按照新的管道路由演示，继续排查原因，解决掉。」

前一轮（v581）误判：只修了 tlFlowRoute 的取点（总管段弧长切片 + 接入段读图面 stub），
虽然正确但**不是**用户看到的现象的主因。

真根因（实测抓到）：**工作区底图没有重新克隆**。
- 工作区底图是 `cloneNode(#tlDiagramContent svg)`，克隆的是「简图重建前」的 SVG
  （inline-27 的订阅注释里早就记载过这个「差一帧」问题）。
- 我给三通/水源拖动的结算只写了 `window.tlAutoGenerate()` 就完事，**没有补 rerenderKeepView()**
  ⇒ 拖完后工作区里 `path[data-tlpipe="front"]` 的 d 拖前拖后完全一致
  （实测：M38.8 313.0 L38.8 416.0 L38.8 519.0 两次一模一样）。
- 水流动画是「从已画好的 path 上取点」（v218 设计）⇒ 读到旧 path ⇒ 一直按旧路由演示。

修（tl-workspace.js 两处结算）：
- `tlAutoGenerate()` 之后再补一次 `rerenderKeepView()`（底图重克隆）。
- 演示组存在时再 `applyGroupHighlight()` 重涂水流 —— 否则重克隆后动画层被清空、拖完动画直接消失。

实测（600x400，真实鼠标拖 H300 → off=38）：
- 工作区总管 d：`M136.0 339.5 L136.0 645.5` → `M194.1 339.5 L136.0 645.5`（新折线）
- 覆盖层可见总管 d 同步（M194.14 339.5L136 645.5）
- 动画 d 同步跟随：起点 136.0 → 194.1

回归：_probe_front_node_ws 11 项 OK、_probe_source_straight 8/8、_probe_front_node 51/51、
ci 28/0、单测 140/141（既存红灯）、双页冒烟 ALL PASS。

### §25s v583-flow-host-group —— 动画层挂载组修正（+ 未复现的坦白记录）
用户三度反馈「动画演示没按新管道路由」；v581（取点）、v582（底图重克隆）之后仍如此。

本轮新查到并修正的一处（稳健性，非该现象主因）：
- 工作区克隆底图时组内 id 全部加 `tlWsPipe_` 前缀 ⇒ `#tlPlotGroup` **查不到**，
  `hostG = svg.querySelector('#tlPlotGroup') || svg` 会静默回退挂到 **svg 根**。
  实测父链：总管 path → `tlWsPipe_tlPlotGroup`，而动画层曾是 `g →`（svg 根）。
- 改为兜底顺序：#tlPlotGroup → #tlWsPipe_tlPlotGroup → #tlWsFrontBase → svg 根。
- 对照实测：工作区 view 是改 **viewBox**（对 svg 根同样生效），所以缩放 1.33 倍后
  管道与动画层的 CTM 仍相同、同点屏幕坐标差 0 px ⇒ 这处**不是**用户现象的原因，但分层始终不妥，已修。

已排除的假设（均有实测数据）：
1. 取点逻辑（v581 修：总管段弧长切片 + 接入段读图面 stub）—— 修后水流起点跟随新几何（136→194.1）。
2. 工作区底图未重克隆（v582 修：补 rerenderKeepView + 重涂）—— 修后 path[data-tlpipe=front] 的 d 会更新。
3. 坐标系/层级/缩放（v583 修）—— CTM 一致、缩放 0 px 偏差。
4. 多三通/横向总管/逐组演示 —— 动画的取水点与主管起点一致，几何上吻合。

⚠ 结论：在我能构造的场景里**复现不出**用户看到的现象。根因很可能在用户真实地块
（不规则多边形/多块/合并组/阶梯分区）下才出现，需其现场取数。已准备控制台诊断片段（见本会话记录），
待用户提供其场景下的输出再定位。

### §25t v584-front-node-reset —— 新增「总管三通复位」一键功能
用户：「感觉这个改起来比较麻烦，你给我增加一个总管三通复位功能吧，如果总管三通复位了，实际上它的动画演示就没问题了。」

入口：三级左栏工具轨按钮 `#tlFrontNodeResetBtn`（class tl-ws-btn，与「多选管道/遮蔽管道/路径测算/多选标注」
同排，排在 #tlAutoPipe 之前以满足 A6 契约），文案「三通复位」。该排随 #tlSide 会搬进 CAD 侧栏 ⇒ 简图与工作区两处都可见。

实现：`window.tlFrontNodeReset()`（inline-09.js，与 tlSourceMove* 同一导出区）
- 读 tlFrontNodeDrops()：无偏移 ⇒ toast「三通都在初始位置，无需复位」并返回 false（不重绘）；
- 有偏移 ⇒ removeItem('tlFrontNodeDrops_v1') → tlAutoGenerate({scroll:false}) →
  工作区补一次 rerenderKeepView()（v582 教训：宿主重建后底图要重克隆）→ toast「已复位 N 个三通，总管回到直线」。

实测（_probe_front_reset.mjs 6/6，真实鼠标点按钮）：
- 按钮文案「三通复位」可见；
- 无偏移点击 ⇒ false（不重绘）；
- 拖三通 off=40 ⇒ 总管非直线（[[40,150],[0,350]]）；
- 点复位 ⇒ localStorage {}、三通 off 全 0、总管回 [[0,150],[0,350]]（直线）；
- 复位后演示 ⇒ 水流首点与总管起点一致（[[136,339.5],…]）。

回归：_probe_front_node 51/51、_probe_front_node_ws 全绿、_probe_source_straight 8/8、
ci 28/0、单测 140/141（既存红灯）、双页冒烟 ALL PASS。

### §25u v585-flow-source-seg —— 水流动画补上「水源 → 总管起点」
用户：「水源到第一段主管有一段没有动画路径演示，这个要改过来。」

根因：总管 path 只覆盖「各三通之间」的折线；水源到第一个三通是**另一条** path
（`data-tlsrcpipe`，v571 起为直线）。而水流路线从 `fPts[0]`（第一个三通）起算
⇒ 水源到第一段主管之间没有水流（截图红箭头处）。

改：取离 `fPts[0]` 最近的 `circle[fill="#f59e0b"]`（水源圆），把它的圆心前插为每条路线的起点；
距离 ≤1px 不插（水源已贴着总管起点时避免零长段）。

实测（_probe_flow_srcseg.mjs 3/3）：
- 水源圆点 (38.8,121.7)，总管起点 (80,342.4)，相距 224.5px；
- 水流路径变为 [水源] → [总管起点] → [主管起点]；
- 与图面 `data-tlsrcpipe` 的 d（`M38.8 121.7 L80.0 342.4`）**逐点一致**。

回归：_probe_front_node 51/51、_probe_front_node_ws 11 项 OK、_probe_source_straight 8/8、
_probe_front_reset 6/6（R3 断言改看第 2 点，因首点已是水源）、ci 28/0、单测 140/141、双页冒烟 PASS。

### §25v v586-cad-grip-explicit —— 左侧工具栏收起/展开入口显性化
用户：「地块分区的右侧工具栏关闭按钮不在工具栏附近，有时候关闭了，再想打开就找不到这个按钮了。」
（注：截图里是左侧工具栏，用户口误说「右侧」。）

查出两个问题：
1. 收起入口就是顶部那行整宽的「⚙ 工具栏」按钮（深绿底），长得像标题不像按钮，也没有收起图标；
2. **点工具栏内任意空白处都会整栏收起** —— `ry-cad-toolbar.js` 的 `side` click 处理器末尾
   `if(inGrp) return; if(closest('.ry-cad-grp')) return; toggleRail();`，这是"有时候关闭了"的误关来源。

改动：
- HTML：`#ryCadSideGrip` 内拆两个 span —— 左「⚙ 工具栏」、右 `#ryCadSideGripIcon`（展开态 « / 收起态 »）。
- CSS：展开态 `justify-content:space-between` + 图标 15px；收起态竖条加 `box-shadow:2px 0 10px`，
  图标转横排 17px 置顶 —— 40px 竖条整条可点（实测 h=831），明显"点这里展开"。
- JS：删掉「点空白折叠」；改为 `#ryCadSideGrip` 单独绑 click（`data-ry-gbound` 防重复绑定）；
  `applyWidth()` 里同步 `aria-expanded` / `title`（收起工具栏 / 展开工具栏）/ 图标字符。

实测 `_probe_cad_grip.mjs` 9/9（真实鼠标）：展开 318px、grip top=1px、icon «、title 收起工具栏；
点后 40px、竖条 h=831 中心 elementFromPoint 命中自身（无遮挡）、icon »、title 展开工具栏；
点工具栏空白后仍 open=1 / w=318（不再误关）。

回归：_probe_front_node 51/51、_probe_front_reset 6/6、ci 28/0、单测 140/141（既存红灯）、双页冒烟 PASS。

### v588（已上线）：云端地块库「载入地图」一键回填主站
- 主站 mod/online-map.js 新增 importCloudRingFromUrl()：URL 带 cloudring（[[lat,lng],…]）时
  ① rySetTab('onlineMapSection','map') 切到在线地图 ② points = ring → refresh() 重画并更新面积
  ③ fitBounds 缩放到该地块 ④ toast「已载入云端地块（X 亩）」⑤ history.replaceState 清掉参数防重复导入。
- 云端 admin.html 每行操作改为「载入地图」（跳主站带参）+「下载」（GeoJSON）两个按钮。
- 实测 _probe_cloud_import.mjs 3/3：区块 ry-active、多边形 1 个、亩数 1225.45、URL 参数已清。

### v589（云端，已重新部署）：状态流转 + 内部备注 + 用户进度自查
- 数据库：GRANT UPDATE ON plots；新增策略 plots_update_admin（仅管理员可 UPDATE）。
- 管理页 admin.html：每行「状态下拉（新提交/处理中/已完成）+ 内部备注输入 + 保存」，
  保存走 update(...).eq('id').select()；空数组按“无权限/没改动”提示（RLS 语义）。
- 提交页 index.html：登录后多出「我提交的地块」列表（编号/名称/亩数/进度/时间），
  进度用中文徽标（new=新提交 amber、doing=处理中 blue、done=已完成 green）。
  RLS 保证用户只能读到自己的行 ⇒ 无需额外“查询码”，登录即可自查。
- 后续（三期）：把设计方案回传云端，形成「地块↔设计」配对样本库（用于统计/回测/学习）。

### v590（主站已推送；云端已部署）：设计方案回传 → 「地块 ↔ 设计」样本库
- 云端新表 `plot_designs`（plot_id / zone_count / mu / design JSONB / owner_id / created_at），
  RLS：管理员可 INSERT 与 SELECT 全部；普通用户可读「自己地块」的设计。
- 云端新页 `design.html`：管理员登录 → 显示设计摘要 → 确认回传 → 返回设计编号。
- 管理页 admin.html：列表新增「设计」列，显示已回传的设计编号与分区数（绿色标记）；
  「载入地图」链接额外带 cloudid，主站据此记住当前地块号。
- 主站：① online-map.js 导入地块时把 cloudid 存 localStorage('ry_cloud_plot_id')；
        ② 三级工具轨新增「☁ 回传设计」按钮 → window.tlUploadDesign() 读
           管径/流速/水泵扬程/功率/流量/分区数/亩数 → 带参跳云端 design.html。
- 用途：每块地形成「原始地块 ↔ 设计方案」配对，供统计、比对、回测、学习。
- 回归：ci 28/0、单测 140/141（既存红灯）、front_node 51/51、front_reset 6/6（偶发一次已复跑通过）、
  cloud_import 3/3、双页冒烟 PASS。

### v591（云端已部署）：地块库统计看板 stats.html
- 入口：管理页顶部「📊 统计看板」→ https://plot-library.app.workbuddy.host/stats.html
- 登录（手机 OTP）+ 口令激活（同管理页）；数据由 RLS 保证只有管理员能看全部。
- 内容：
  ① 概览 KPI：地块总数、累计亩数、平均亩数、已出设计数、已完成数
  ② 面积分布直方图（0-5/5-10/10-20/20-50/50-100/100+ 亩）
  ③ 处理进度分布（新提交/处理中/已完成）
  ④ 设计侧：平均分区数、总管/主管/支管**众数管径**、平均扬程
  ⑤ 「面积 → 分区数」配对明细表（最近 30 份：亩数/分区数/三级管径/扬程）
- 说明：目前库里还没有真实地块数据，看板会显示「还没有地块数据」；等地块与设计攒起来自动出图。

### v593（主站）：三级左栏表头「水力项」加粗，与「设计值」同字重同字号
- 根因：`.tl-plan-result .pp-plan-cols-head` 整行 600/11px，但通用规则 `.pp-plan-label{font-weight:400}`
  特异性更高，把表头里的「水力项」压回常规字重，视觉上比旁边两列小一号。
- 改：只给表头那一格放行 —— `.tl-plan-result .pp-plan-cols-head > .pp-plan-label{font-weight:600;font-size:11px}`。
- 实测 _probe_hyd_head 3/3：水力项 600/11px = 设计值 600/11px = 改径重算 600/11px；
  字段行（联合流量/水泵流量/水泵扬程/计算轴功率）仍 400/11px 未被带跑。
- 混编注意：并行会话的 v592（cloud-design-binding）尚未提交且改了 sw CORE 列表 ⇒
  本次用 git hash-object + update-index --cacheinfo 构造只含自己改动的 index/sw blob 提交，
  避免把对方未完成代码带上线。

### v594（主站）：地块分区页「右侧工具栏」折叠后无法找回 —— 补回标签定位
用户：「地块分区右侧控制面板不见了，这个怎么回事。」

根因（实测）：
- 右侧工具轨默认折叠（v254 设计要求），折叠态唯一的入口是 body 级代理 `.pp-rail-tab-float`；
- `mod/style-01.css` 里**只写了它的 `:hover`**，没有 `position` 等基础定位 ⇒ 代理是普通文档流按钮，
  实测落在 **x=0**，被左侧工具栏（#ryCadSide，宽 318）整块盖住；
- 同一份 `syncProxy()` 又因为"代理可见"把真把手 `#ppRailToggle` 设成 `visibility:hidden`
  ⇒ **两边都看不见**，右侧就成了空白。
修：补齐代理定位 —— `position:fixed; right:0; top:50%`、竖排写「工具栏」、`z-index:9995`
（按 v254/v270 注释原意：贴右缘、压在 AI 面板 9993 之上）。

实测 `_probe_pp_rail.mjs` 3/3（真实鼠标）：
- 折叠态标签 rect x=1376 / w=24（视口 1400），中心 `elementFromPoint` 命中 `pp-rail-tab-float`；
- 点击后 `pp-rail-off` 移除、`.pp-toolbar` w=126 回到可视区（x=1274）。

### v595（主站）：二级 / 三级右侧工具轨样式统一 + 去层层覆盖
用户：「检查地块分区跟管路规划页面的右侧面板是否统一，要求两个面板统一样式，不能层层覆盖层层嵌套，检查代码然后简化。」

诊断（实测）：
- 两页"右侧工具轨"都是 `.pp-toolbar`，但 **DOM 嵌套不同**：
  二级 = `#pipePlanSection > .pp-body > .pp-stage > .ry-pane-edit > #ppToolbar`
  三级 = `#tlPipePlanSection > .pp-stage > #tlToolbar`（直接子级）
- 旧代码按中间层写两套：`.pp-stage>.pp-toolbar` 与 `.ry-pane-edit>.pp-toolbar`。
  其中 `.pp-stage>.pp-toolbar` 在**二级一条都没命中**（style-01.css 1163-1166 注释已实证），
  于是又补 `body.ry-tool ...` 更具体的规则去压 ⇒ 层层叠加；二级工具轨命中 9~11 条规则、跨 3 个文件。

简化（v595）：
- 折叠动画、折叠态、把手隐藏三条规则，一律改为**不依赖中间层**的后代选择器；
- 二级 + 三级 + CAD 侧栏搬移态（`#ryCadSide [data-pp=...]`）四个作用域**合成一条**（逗号分组）；
- 删掉已证伪的死选择器（`.pp-stage>.pp-toolbar` / `.pp-stage.pp-rail-off>.pp-grip-tool`）。

验证：
- 二级折叠态 opacity 0 / visibility hidden，展开态 1 / visible，transition(0.16s/0.18s) 保留；
- 三级 #tlToolbar 已被同一条规则覆盖（当前仍 display:none，属功能决定，未改）；
- ci 28/0、_probe_pp_rail 3/3（折叠标签仍可见可点）、_probe_cloud_import 3/3。
- 提交方式：并行会话仍在改 inline-09/online-map/cloudfn 等 ⇒ 用 hash-object + update-index
  构造只含自己改动的 index/sw blob，避免带上对方未完成代码。

### v596（主站）：删掉三级页的空壳工具轨 #tlToolbar（用户要求"调出来看看"）
- 真相：`<div class="pp-toolbar" id="tlToolbar" style="display:none"></div>` —— **内部为空**、
  无任何 JS 引用；内容早在历史版本搬走（系统图工具条 2026-09-12 整条取消）。
  "调出来"只会是一条空白竖条 ⇒ 正确处理是删除，而不是显示。
- 连带清理三级的 .pp-toolbar 作用域（不留死代码）：
  style-01.css v595 统一规则与 2980 共享规则里的 `#tlPipePlanSection .pp-toolbar` 部分、
  ry-panel.css 的三级把手规则；二级工具轨不受影响（v595 实测口径保持）。
- 暂存区核验：index 无 tlToolbar、style-01 无三级作用域。

## 26. v613 ~ v615 三级左栏样式收口（2026-10-20 · 三批全部未提交、未推送）

> **这一节是"进行中状态"，不是历史沿革。** HEAD 仍是 `f5ed5a2 v612-flat-radius`；
> v613 / v614 / v615 三批改动**只在工作区**。用户已看过对照图并逐版调整过口径，
> 但**从未说"推送"** —— 动手发布前必须再问一次。

### 26.0 接手第一件事：看清工作区是混编的

`git status --porcelain` 有 **30+ 个已修改文件**，来自多个并行会话，跟本次工作无关的有：
`core/terrain-bridge-store.js`、`core/measured-area-bridge-store.js`、`runye-material-audit.js`、
`mod/inline-11.js`、`mod/inline-12.js`、`mod/inline-16.js`、`mod/inline-29.js`、`mod/online-map.js`、
`mod/plot-editor.js`、`runye-entitle.js`、`runye-inverse-design.js`、`runye-map-partition.js`、
`runye-nav.js`、`runye-map-measure.html`、`terrain/index.html`、`cloudfn/*`、`tests/*`、`docs/*`、`ci_check_static.cjs`…

⇒ **禁止 `git add -A` / `git commit -a`**。提交走 §26.7 的 hash-object 混编法。

**本次工作涉及的文件（6 个）**：
`index.html`、`sw.js`、`mod/style-01.css`、`mod/plan-calc-render.js`、`mod/inline-09.js`、`mod/inline-27.js`。
其中 `index.html` 与 `sw.js` **同时含并行会话的改动**（版本串、bridge-store 引用、sw 注释精简），
提交时必须"HEAD 为底 + 只替换自己那几段"。

### 26.1 这三批在解决什么

用户连提四个递进要求（原文留在 style-01.css 各段注释里）：
1. 「三级水力计算结果，左侧面板样式有多层嵌套/覆盖的情况，底色还有那个框应该取消」
2. 「轮灌演示那组内容文字左侧要与联合灌溉/面积成组那些文字左侧对齐」
3. 「你看扬程这个很明显看不清楚，我建议你按照二级工具栏那个扬程样式来」
4. 「红框内的文字跟按钮用一个样式来要求它呢，现在按钮太长了…不要新建样式，就用二级面板的样式」

→ 目标态：**三级左栏 = 二级 CAD 特性面板的同一套语言**（v609 定的口径）：
灰条分组 + 22px 行网格 + 标签左/值右 + 实线分隔，全站只有一处深色块（扬程算式带，与二级同款）。

### 26.2 三级左栏现在的结构（从上到下 5 个灰条分组）

| # | 分组标题（灰条） | 载体 | 说明 |
|---|---|---|---|
| 1 | 地块与灌溉参数 | `#tlPlanBar` 的 `.pp-plan-bar::before` | v611 定的灰条 |
| 2 | 水力计算结果 | `#tlPlanBar2` 的 `.pp-res-head` 伪标题 | 可点折叠（默认展开） |
| 3 | 扬程计算式 | `#ppHeadBreak` 内 `<div class="tl-flat-head">` | [v614] 下面接一条深色算式带 |
| 4 | 管径调整 · 扬程确认 | `#tlPumpUpdateBox` 内 `.tl-flat-head` | [v615] 说明+按钮同一行 |
| 5 | 管段长度与水头损失 | `#tlLossCard` 内 `.tl-flat-head` | [v613] 三行数据 + 合计 |

### 26.3 统一网格的五个角色类（唯一出处 = `mod/style-01.css`）

| 类 | 作用 | 关键值 | 输出方 |
|---|---|---|---|
| `.tl-flat-head` | 灰条标题 | 22px / `#dcdfdd` / `#2c2c2a` / 600 / 上下 1px `#cfd4d1` | index.html 静态 + JS |
| `.tl-flat-row` | 22px 数据行（标签左、值右） | flex / `min-height:22px` / `padding:0 10px` / 底线 `#e8ecea` | `inline-09.js` `tlRefreshLossCard` |
| `.tl-flat-line` | 22px 单行长文本 | 同上但不分两栏 | `inline-27.js` `tlPumpUpdateRun` |
| `.tl-flat-note` | 多行小字说明 | 10.5px / `#64748b` / `padding:5px 10px` | 同上 + index.html |
| `.pphb-formula` + `.pphb-{name,num,op,eq,final}` | 扬程算式带词法 | 深底 `rgba(15,23,42,.90)`、绿名/黄值/近白括号/淡绿结论 | `plan-calc-render.js` `renderHeadBreakdown` |

**纪律**：新增任何"左栏信息块"一律复用这五类，**结构由 JS 输出类名、不写 inline 样式**。
样式只在 style-01.css 里定义一次，选择器一律**双祖先**（见 §26.5 坑 1）。

### 26.4 逐版改动（文件级，便于 review）

**v613 `v613-flat-cards`（两块信息卡并入网格）**
- `index.html`：`#tlPumpUpdateBox` 的标题/说明两个 div 换成 `.tl-flat-head` / `.tl-flat-note`；
  四处 `?v=` 抬到 `613-flat-cards`（style-01 / ry-panel / inline-09 / inline-27）。
- `mod/inline-09.js`：`tlRefreshLossCard` 改为输出 `.tl-flat-head/.tl-flat-note/.tl-flat-row`，**不写 inline 样式**。
- `mod/inline-27.js`：`tlPumpUpdateRun` 的四行结果改输出 `.tl-flat-line`。
- `mod/style-01.css`：v613 段（约 2734 行起）定义四类 + 更新按钮 22px；
  三块拍平规则里 `margin:0` 改 `margin:0!important`（见坑 2）。
- `sw.js`：`VERSION='v613-flat-cards'`。

**v614 `v614-head-formula`（扬程看不清的根治）**
- 根因（实测，不是猜）：v611 把 `.pp-head-break` 的深色底拍成 `transparent`，**但没清它自带的
  `color:#e8eef7`** ⇒ 容器与 11 行明细 computed color 全是 `rgb(232,238,247)`、bg 全透明，
  浅色字落白面板对比度 **1.16:1**；行高只有 16.5px、标签与数值无间距（读成「提升5.00」）。
  另：`plan-calc-render.js` 输出的 `.pphb-row/.pphb-k/.pphb-v` **全站一条 CSS 都没写过**。
- `index.html`：`<details id="ppHeadBreak">` → `<div>`（details 会藏内容，div 才能直接铺算式带）。
- `mod/plan-calc-render.js`：`renderHeadBreakdown` 改为输出
  `.tl-flat-head`「扬程计算式」+ 一条 `.pphb-formula`；
  **9 项全保留**（含三级独有的「总管损失 / 已有压力」），数值与加减口径**一字未改**。
- `mod/style-01.css`：v614 段（约 2812 行起）删掉 `#ppHeadBreak>summary` 那 4 条（含 `>summary~*`），
  换成 `.pphb-formula` + 五类词法配色，**与 `ry-panel.css` 的 `.pp-calc-formula/.pp-cf-*` 逐项同值**。
- `sw.js`：`VERSION='v614-head-formula'`；`plan-calc-render.js` 在 CORE 里，故必须抬版本。

**v615 `v615-btn-row`（说明 + 按钮并成一行）**
- `index.html`：`#tlPumpUpdateBox` 内改成
  `<div class="pp-plan-item" id="tlPumpUpdateRow"><span class="tl-flat-note" id="tlPumpUpdateNote">…</span><button id="tlPumpUpdateBtn">…</button></div>`；
  按钮 inline 的 `width:100%;padding:5px 8px` 删掉。
- `mod/style-01.css`：v615 段（约 2774 行起）把**原有那条** `#tlPumpUpdateBtn` 改成二级 `.pp-recipe-btn` 规格
  （20px / `padding:0 8px` / 白底 / 1px `#e2e8f0` / `#334155` / 11px 600 / nowrap）+ `:disabled` 态；
  行容器直接用**已有的** `.pp-plan-item`，不新增行样式。
- 实测：按钮 280px → **98.3px**，右缘距行右 10px，`sameRow:true`，`btnIsFullWidth:false`。
- `sw.js`：`VERSION='v615-btn-row'`；`style-01.css?v=615-btn-row`。

**当前版本串（工作区现状，别改错）**
```
sw.js                      VERSION = 'v619-undo-cover'
index.html:20              mod/style-01.css?v=619-undo-cover
index.html:248             mod/ry-panel.css?v=619-undo-cover
index.html:2261            mod/plan-calc-render.js?v=614-head-formula
index.html:2262            mod/inline-09.js?v=619-undo-cover
index.html:2273            mod/inline-12.js?v=619-undo-cover
index.html:2303            tl-workspace/tl-nodes.js?v=619-undo-cover
index.html:2320            mod/inline-27.js?v=619-undo-cover
index.html:2390            runye-undo.js?v=619-undo-cover
```

### 26.5 五个坑（踩过，别重踩）

1. **两态选择器**：三级 `#tlSide` 切 tab 时被搬进 `#ryCadSide`，祖先链断裂 ⇒
   每条规则都要**同时**挂 `#tlPipePlanSection .pp-side …` 与 `#ryCadSide [data-pp="tlPipePlanSection"] .pp-side …`。
   只写一条在另一态完全不生效（v613 行规则就这么翻过车）。
2. **`!important` 只准用在三类**：颜色 / 边框 / 阴影。用途是压 index.html 上的 inline
   （`#tlPumpUpdateBox` 有 inline `margin-top:10px`、`#tlLossCard` 有 `margin-top:12px`，
   不带 `!important` 压不住 ⇒ 灰条之间留 10/12px 白缝、网格断成三截）。
3. **style-01.css 里禁止任何不带 `!important` 的 `border-radius`**（连 `border-radius:0` 都不行）：
   全站 `body *{border-radius:0!important}` 已压平，写它就是死声明，线上冒烟专门查这条（v611 判红过）。
4. **inline `opacity` 在扮 disabled**：`inline-27.js` 在未改管径时给按钮写 `opacity:.5`。
   把"灰底大按钮"换成"白底小按钮"后 0.5 会把描边和字吃没（白底半透明 = 与面板同色）。
   现用 `opacity:1!important` 收回 + `:disabled` 显式表态。**改任何"缩小/变透明"的控件都要查这个。**
5. **改 `index.html` 的 CRLF**：工作区里 `index.html` / `mod/style-01.css` 是 **CRLF**，
   `sw.js` / `mod/plan-calc-render.js` 是 **LF**。用 Python 改必须
   `io.open(p, encoding='utf-8', newline='')` 读、`newline=''` 写、自己拼 `\r\n`；
   图省事用默认文本模式会整文件换行被改（v613 踩过，断言 0 命中）。

### 26.6 怎么验（本地无头，Edge CDP）

```bash
cd C:/Users/AHS/runye-irrigation
node ci_check_static.cjs                      # 期望 PASS=28 FAIL=0
node --test tests/*.test.cjs                  # 期望 153 pass / 1 fail（见 §26.8）
```

`_probe_tl_skin.mjs`（本次主力探针，环境变量组合）：

| 变量 | 作用 |
|---|---|
| `GEN=1` | 先跑 `tlAutoGenerate()` 让生成图后才现身的块现身（需种 `measuredPolygon`） |
| `HB=1` | 展开并逐行量 `#ppHeadBreak`（容器/每行 color、bg、行高） |
| `PUMP=1` | 量 `#tlPumpUpdateRow`（行高、按钮宽高、说明换行数、左右内边距对称性） |
| `PUMPON=1` | 把「更新水泵扬程」置为可用态（截图对照禁用/可用两副样子） |
| `DELTA=1` | 跑 `tlPumpUpdateRun()` 让四行 `.tl-flat-line` 现身 |
| `DEMO18=1` | 走真实渲染路径铺 18 个轮灌 chips（别用 cloneNode，会全红误导） |
| `MODE=orig` | 把 `#tlSide` 搬回 `#tlPipePlanSection > .pp-body` 验"原位态"选择器 |
| `SHOT=…png` | 视口截图 + 落 `_box.json`（本站 `captureScreenshot` 的 clip 常算出 0 宽，只能外部按坐标裁） |

```bash
GEN=1 HB=1 PUMP=1 SHOT=C:/tmp/x.png node _probe_tl_skin.mjs
# 再用 python + PIL 按 _box.json 的 x/y/width/height × dpr 裁
```

二级对照：`SHOT=…png node _shot_panel_sl.mjs`。
⚠ 该脚本按 `#ppSide` 可见矩形裁切，**二级「扬程计算式」那条算式带在裁切线以下，本次没截到**；
要对照得先把它滚进可视区再截。

### 26.7 发布口径（混编提交 + 推送 + 线上校验）

1. **只提交自己的 hunk**（`index.html` / `sw.js` 混有并行改动）：
   ```bash
   git show HEAD:<path> > /tmp/base/<path>          # 以 HEAD 为底
   # 在副本上只替换自己那几段（断言命中数 == 1），再
   git hash-object -w --path=<path> /tmp/base/<path>
   git update-index --cacheinfo 100644,<sha>,<path>
   git diff --cached --stat                          # 核对行数，确认无夹带
   ```
2. `git commit -F -`（写清 v613+v614+v615 三段），推送要带代理：
   `git -c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897 push`
   （端口会变，先用 `netstat -ano | grep LISTENING` 找，别死磕 7897）。
3. 判断"代码上去没有"用 **GitHub API**，别用 `raw.githubusercontent.com`（v610 实测不实时）：
   `curl -H 'Accept: application/vnd.github.raw' https://api.github.com/repos/<o>/<r>/contents/<path>?ref=master`
4. Pages 翻新可能很慢（v608 实测 35 分钟），期间别反复推。
5. 线上跑 `node _smoke_v521_live.mjs`（期望 27/27），它逐字比对
   `style-01.css?v=` 与 sw VERSION，且查"style-01 无无效圆角声明"。
   curl 校验大 CSS 先比字节数再比 sha256（会截断在 245760 字节，造成假 DIFF）。

### 26.8 已知红灯 / 待办

- **单测 1 条既存红**：`tests/runye_hydraulics_core.test.cjs:27` 断言 `overlay.version === 1`，
  而 `runye-hydraulics-core.js:655` 已返回 `version: 2`（早前提交 `74bf67e` 没同步测试）。
  与本次工作无关，**修不修看用户**。
- **既存红（历史登记）**：`verify_pp_tabs` 14/34、`verify_sketchup` 3/6、`verify_cascade_pp` 1/38、
  `verify_nav_compact` 10 项；本机无头权益拉不通 ⇒ 导航/表单类大面积假红。
- **§26.9 待用户拍板的口径**（不是本次工作，但同页相关）：
  地块裁剪后管道长度仍按设计几何计（多算约 33%，`_probe_clip_len.mjs` 可复现）；
  三级简图 28 区底部双「20 m」叠字（批次 F-1）。
- **三级「扬程计算式」现在的形态是 details 改 div 后的常显块**（与二级一致，不可折叠）。
  若用户回头要折叠，需给 `.pphb-formula` 加一层显隐，**不要再改回 `<details>`**
  （details 会把 `.tl-flat-head` 一起藏起来）。

### 26.9 一句话交接

三级左栏的"多层嵌套/看不清"已经收口成二级同一套语言（灰条 + 22px 网格 + 一条深色算式带），
**三批改动全部躺在工作区没提交**；下一步只差用户点头 → 按 §26.7 混编提交并发布。

### 26.10 v615 本地复验记录（2026-10-20 接手会话，仍未提交、未推送）

**门禁 / 单测**

| 项 | 结果 |
|---|---|
| `node ci_check_static.cjs` | **PASS=28 FAIL=0** |
| `node --test tests/*.test.cjs` | **154 pass / 0 fail**（接手时 153/1，见下方修复 ①） |
| `_probe_tl_skin.mjs`（GEN/HB/PUMP/PUMPON/DELTA/DEMO18/MODE=orig） | 全项符合 §26.4 预期 |
| `verify_text_contrast.js` | ⛔ 本机**跑不起来**：`Cannot find module 'puppeteer-core'`（环境既存，非本次改动引入） |
| `verify_ry_tool.js` | ⛔ **启动即崩**：缺 `iso-diagram/network-editor.css`（§1 已登记既存红，崩在 952 行模块载入期，`must` 清单根本没跑到） |

**实测数字（工作区 v615，1400×1400 视口、dpr2、GEN=1 生成过管线图）**

- 行网格：`#tlSide` 内 16 个可见 `.pp-plan-item`，**14 行 = 22.0px**；两处 34px / 31px 是**多行说明**
  （「联合流量依据…」「当前使用设计管径…」）自然换行，不是网格失效。
- 按钮行：`#tlPumpUpdateBtn` **98.3 × 20px**，`sameRow:true`、`btnIsFullWidth:false`，
  左内边距 10 / 右内边距（行右缘 − 按钮右缘）**10**，对称；禁用态 `#94a3b8` on `#f1f5f9` 仍可读
  —— 坑 4 那条 inline `opacity:.5` 已被 `opacity:1!important` 收回。
- 轮灌演示：`titleX=20` 与 `.pp-plan-label` 的 `rowLabelX=20` 对齐；18 组 chips 折 2 行、`chipsW=280`。
- 扬程算式带：容器 bg `rgba(15,23,42,.90)`（合成到白底 ≈ #272e3f）、文字 `#e8eef7` ⇒ 对比度 **≈11.6:1**
  （v611 事故态 1.16:1）；`.tl-flat-head` `#2c2c2a` on `#dcdfdd` ≈ 11:1。**「看不清」已根治。**
- 三块拍平：`ppHeadBreak / tlPumpUpdateBox / tlLossCard` computed 圆角全 `0px`、bg `transparent`、`box-shadow:none`。
- `style-01.css` 的「无效圆角」（`_smoke_v521_live.mjs` §114 同口径：不带 `!important` 且非 `50%`）= **0**。
- 版本串与 §26.4 表逐字一致；`style-01.css?v=615-btn-row` 与 `sw VERSION` 去 `v` 后相等 ⇒ 冒烟 §113 会过。
- 原位态选择器：`MODE=orig` 下 `#tlSide` 搬回 `.pp-body` 后侧栏宽度为 0（父容器未激活，无头环境量不到布局），
  但 `#tlPlanBar2::before` 灰条仍 `22px / #dcdfdd / 上下 1px #cfd4d9`、三块圆角仍 0 ⇒ 双祖先两态都生效；
  v613–v615 新增的规则**逐条**都写了 `#tlPipePlanSection …` + `#ryCadSide [data-pp=…] …` 两套（静态核过）。

**已修（本地改动，仍未提交）**

1. `tests/runye_hydraulics_core.test.cjs:27`：`overlay.version` 断言 1 → **2**，并加「v2 必须带
   `networkTs` / `plotId` / `designRevisionId` 三键」；根因是 `74bf67e` 抬契约时没同步测试。→ 单测 154/154。
2. `verify_ry_tool.js:64` 契约串：`<details id="ppHeadBreak" class="pp-head-break" hidden`
   → `<div id="ppHeadBreak" class="pp-head-break" hidden`（v614 把 details 改 div，契约没跟，会假红）。
3. `verify_text_contrast.js` D2 段：旧类名 `.pphb-row / .pphb-v / summary` **全站已无产出**，
   样本口径换成 `.pphb-formula / .pphb-name / .pphb-num / .pphb-op / .pphb-eq / .pphb-final / .tl-flat-head`；
   `need` 改为 `{formula:1, head:1, name:1, num:10, op:9, eq:3, final:1}`
   （按 `renderHeadBreakdown` 实产个数核算：9 项名称/数值 + 安全系数 1 个数值 = 10 num，
   8 个项间符号 + 1 个 × = 9 op，括号/等号 3）；`natural / injected` 判据与「结论取数」
   （`.pphb-final .pphb-v` → `.pphb-final`）同步改。
   ⚠ **这处只做了静态核对，本机缺 `puppeteer-core` 没跑通** —— 换台装了 puppeteer 的机器要先跑一次 D2。

**⇒ 提交清单仍是 6 个文件，不变。** 上面三处修复所在文件**全是 gitignore 的本地脚本**：
`.gitignore:28` 的 `verify_*.js`（`verify_ry_tool.js` / `verify_text_contrast.js`）与
`.gitignore:82` 的 `tests/*`（`runye_hydraulics_core.test.cjs` 不在白名单里）——`git status` 完全不显示，
**永远不会进提交**。两条推论：
① 那条「既存红」只存在于本机，远端仓库没有这个测试文件，别去线上找；
② `verify_*` / `tests/*` 的修复只对下一次本地复验有效，**不要指望随发布一起上线**。
`index.html` / `sw.js` 依旧混有并行会话改动，§26.7 的混编法不变。

**两条口径提醒（不是本次改动引入，但会误导读代码的人）**

- §26.5 坑 2 写「`!important` 只准用在颜色/边框/阴影」，实际 v613–v615 段里有 32 处，还用在
  `margin/padding/font-size`：压 `index.html` 上的 inline `margin-top` 与
  `runye-typography` 的 `button{font-size:13px!important}`（见 `style-01.css` 2880 行注释）。
  规则的真实边界是「**只准用来压必须压掉的外部声明**」，不是按属性类别禁。
- `style-01.css` 2872 / 2879 两条旧规则（`.pp-plan-label` / `.pp-plan-val`）至今**只挂**
  `#tlPipePlanSection` 一个祖先，即 §26.5 坑 1 说的两态断裂在它们身上仍存在（rail 态下这两条不生效，
  标签字重/颜色靠别处兜住，实测行高不受影响）。属 legacy，动它有回归风险，**本轮未改，等用户点头再说**。

### 26.11 v616-btn-narrow「更新水泵扬程」按钮去图标 + 收窄（2026-10-20 · 仍未提交）

用户原话（附截图，红框圈住该行）：
> 「更新水泵扬程前面的图标取消，这个按钮的左右宽度压缩一点，这样前面的文字就可以变为两行了。」

**实机诊断（截图量出来的，不是猜）**：用户面板比 `SIDEW=300` 的默认态窄（≈235px 外宽 / 217px 内容宽），
按钮「⇧ 更新水泵扬程」占 **98.3px**、间距 6px ⇒ 说明文字只剩 **~111px**，
23 字文案在 11px 字号下要 253px ⇒ 被挤成 **3 行**（截图上「当前使用设计管径；调整 / 图面管径后自动重算扬 / 程。」），
按钮同时贴到右缘（截图上只露出一角）。

**三处联动改动**

| # | 文件 | 改了什么 |
|---|---|---|
| ① | `index.html:1231`、`mod/inline-27.js:328/334/337` | 按钮文案去掉行首符号：`⇧ 更新水泵扬程` / `⇧ 恢复设计水泵扬程` / `↻ 重新校核水泵扬程` → 全去掉符号（**同一按钮三个状态一起改**，否则状态切换时按钮宽度跳变） |
| ② | `mod/style-01.css` `#tlPumpUpdateBtn` | 左右内边距 `0 8px` → `0 6px`；同时本行 `#tlPumpUpdateRow` 的 `gap` 由 `.pp-plan-item` 继承的 6px 收到 **4px**（只这一行，不影响其它行节奏） |
| ③ | `index.html:1230`、`mod/inline-27.js:327` | 说明文案 23 字 → **16 字**：`当前使用设计管径；改径自动重算。`（原「…调整图面管径后自动重算扬程。」）。**②只把文字区从 111 加到 129，仍卡在 2 行门槛（需 ≥127）的边缘，③ 才是真正让它稳在 2 行的那一步** —— 两处文案必须同改，否则 JS 刷新一次就回退 |

顺带修：`inline-27.js:336` 的「点**下方**按钮…」→「点**右侧**按钮…」（v615 已把按钮挪到同一行，措辞过期）。

**实测（SIDEW 三档，`_probe_tl_skin.mjs`，本次给探针加了 `SIDEW=<px>` 环境变量钉侧栏宽度）**

| 内容宽度 | 按钮 | 文字区 | 说明行数 |
|---|---|---|---|
| 300（默认） | 80px | 196px | **1 行**（宽屏不啰嗦） |
| 247 | 80px | 143px | **2 行** |
| **217（≈用户实机）** | **80px** | **113px** | **2 行**（改前 3 行） |

- 按钮 98.3 → **80px**（−18.3），`sameRow:true`、右缘距行右 **10px**、左内边距 10px，左右对称未破。
- 行高 30.7（两行说明自然撑高），22px 网格与灰条不受影响；三块拍平圆角仍全 0。
- 禁用态 `#94a3b8` on `#f1f5f9` / 可用态 `#334155` on `#fff` 两副样子都实测截图过。
- 门禁：`ci_check_static` **PASS=28 FAIL=0**；单测 **154/154**。
- 版本串：`sw VERSION` / `style-01.css?v=` / `inline-27.js?v=` 全部 → **`616-btn-narrow`**（三者必须同步，
  冒烟 §113 只比 style-01 与 sw；但 inline-27 变了不抬版本会让 PWA 缓存吃到旧 JS）。

**⇒ 本次提交范围仍是 §26.10 那 6 个文件**，只是版本串换成 v616。**仍未提交、未推送。**

### 26.12 v617-btn-flat：按钮去掉旧皮肤 + hover 回到全站口径（2026-10-20 · 仍未提交）

用户原话（附三级左栏截图，红框圈住「更新水泵扬程」按钮）：
> 「更新水泵扬程改为更新扬程，然后这个按钮的特效跟其他的统一，手放在上面变色就好了，
>   你现在样式看起来挺复杂的。还有没有类似情况也统一改了，你这个特效是遵循的哪里的样式，
>   我印象中整个程序中没有这个样式，不要新造样式，面板样式要简化，代码简洁，
>   不要多层覆盖/嵌套，后面改起来也麻烦。」

**「复杂」的真正来源（不是 v615 那段写多了）**

那颗按钮同时挂着 `class="pp-btn-generate"` —— 那是「生成施工图 / 生成系统图」的**主操作大按钮皮肤**
（`style-01.css:1155` 绿渐变 `linear-gradient(135deg,#16a34a,#15803d)` +
`hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(22,163,74,.4)}`）。
v615 又给它写了白底小按钮规格，于是只能靠 5 个 `!important` 去压那层旧皮肤 ⇒ **两层规则互相打架**，
改一处要同时看两处 —— 用户说的「多层覆盖/嵌套」就是这个。

**改法（做减法）**

| # | 文件 | 改了什么 | 净效果 |
|---|---|---|---|
| ① | `index.html:1231` | 删掉 `class="pp-btn-generate"`；文案 `更新水泵扬程` → **`更新扬程`** | 旧皮肤整层消失，`!important` 从 5 处降到 2 处 |
| ② | `inline-27.js` | 三个状态文案同缩：`更新扬程` / `恢复设计扬程` / `重新校核`（去掉「水泵」；同一按钮宽度才稳定） | 按钮 80 → **58px** |
| ③ | `style-01.css` `#tlPumpUpdateBtn` | 一条规则只留几何 + 白底 + 11px 字；删掉 `width:auto!important`、`display:inline-block`、`margin:0!important`、`font-family`、3 个颜色 `!important` | 只剩 `font-size!important`（压全局 typography 的 `button{13px!important}`）与 `opacity!important`（压 inline-27 写的 inline `.5`） |
| ④ | `style-01.css` | hover 由「边绿 + 字绿 + 底绿」三连变 → **只改底色** `#eaf3ed`；新增 `:active` `#d8e9df` | 与 v578 全站口径一致 |
| ⑤ | `ry-panel.css` `.pp-recipe-btn:hover` | 同一条三连变（v609 抄的就是它）→ 只改底色 `#eaf3ed` + 补 `:active` `#d8e9df` | **这是唯一「类似情况」**（面板里另一条同款 hover） |
| ⑥ | `style-01.css` `.tl-flat-note`（本行） | 加 `text-wrap:balance` | 窄面板折 2 行时折在「；」后，不再出现「改径自 / 动重算」切词 |

**「hover 只改底色」的出处（回答用户那句「遵循哪里的样式」）**
`mod/ry-panel.css` 的 `[v578]` 注释，是全站唯一写死的口径：
> 「hover / active **只改底色，且所有 chip 同一个色** … hover #eaf3ed / active #d8e9df；
>   主次只由**默认态**的边框与字色表达，不再各写一套 hover」

三级这颗按钮原来那条三连变不是基础口径，是 v615 抄 `.pp-recipe-btn` 时带进来的（那份自己也是 v609 新写的），
所以用户「整个程序中没有这个样式」的印象是对的 —— 现在两处都收回到 v578。

**实测（`_probe_tl_skin.mjs`，本次新增 `HOVER=1`：真派发 `Input.dispatchMouseEvent` 到按钮中心，
逐态读 computed —— `getComputedStyle` 不支持 `:hover` 伪类，只有真触发才验得到）**

| 态 | 宽度 | bg | color | border | shadow / transform |
|---|---|---|---|---|---|
| 默认 | 58px | `#fff` | `rgb(51,65,85)` | `#e2e8f0` | none / none |
| hover | 58px | **`#eaf3ed`** | 不变 | 不变 | none / none |
| active | 58px | **`#d8e9df`** | 不变 | 不变 | none / none |
| disabled | 58px | `#f1f5f9` | `#94a3b8` | 不变 | none / none |

- 说明文字：217px 内容宽 → **2 行**（折在「；」后）；282px → **1 行**。行内左右内边距仍各 10px。
- 门禁：`ci_check_static` **PASS=28 FAIL=0**；单测 **154/154**；`node --check inline-27.js` 通过。
- 版本串 → **`617-btn-flat`**（sw / style-01 / ry-panel / inline-27 四处同步；ry-panel 这轮也改了，必须抬）。

**同族但**没动**的 hover（留着等用户点名，别自作主张）**

| 选择器 | 现状 | 为什么没动 |
|---|---|---|
| `.ry-hbar .ry-hbar-btn:hover` | 边 `#16a34a` + 字 `#15803d` + 底 `#f0fdf4` | 浮在做图区/卫星图上的横向工具条，`ry-panel.css:1128` 有独立规格；改它要连 `.btn-on` 态一起看 |
| `.ry-cad-set-btn:hover` | 只变边 + 字（无底色） | ⚙ 设置按钮，无底色变化，不属于「三连变」 |
| `.pp-rail-toggle:hover` | 只变字 + 边 | 轨道切换页签，同上 |
| `.pp-btn-generate:hover` | 位移 + 投影（主操作皮肤） | 「生成施工图 / 生成系统图 / 综合分析」三家还在用，属**主操作**语义，单独决定 |

**⇒ 提交范围：6 个文件不变**（`index.html` / `sw.js` / `style-01.css` / `ry-panel.css` / `plan-calc-render.js` / `inline-09.js` / `inline-27.js`
—— 严格说是 7 个，`ry-panel.css` 本轮新进）。**仍未提交、未推送。**

**同轮补丁（v618，用户口述）**：说明文案
`当前使用设计管径；改径自动重算。` → **`当前为设计管径，改径后重算。`**（16 → 15 字，
两处同改：`index.html:1230` 静态 + `mod/inline-27.js:327` 刷新态）。
实测：217px 内容宽折成 `当前为设计管径，` / `改径后重算。`（`text-wrap:balance` 让折点正好落在逗号后，
不再切词）；282px 仍是 1 行。

### 26.13 v618-src-brief：「联合流量依据」文案简化（2026-10-20 · 仍未提交）

用户原话（附水力计算结果截图，指向联合流量下面那行小字）：
> 「联合流量依据：联合分区M13（25区、26区）…… 文字改下、简化，改为：依据：分区M13……」

**改动（只动文案，不动数据口径）**

`mod/inline-09.js` `tlUpdatePlanBar` 里 `#tlPlanCombinedSrc` 的两处输出：
- `联合流量依据：联合分区 M13（25区、26区）· 实际面积和 36.0 亩`
  → **`依据：分区 M13（25区、26区）· 实际面积和 36.0 亩`**
- 兜底句 `联合流量依据：暂无图面分组数据（按单区流量 × N 估算）`
  → **`依据：暂无图面分组数据（按单区流量 × N 估算）`**

理由：前四个字「联合流量」与该行上方的行标题完全重复，窄面板下还要多折一行。
**数值口径一字未改**（仍取 `worstGroup.sum/666.67`、仍按同一 `computeThreeLevel` 结果）。

`verify_ry_tool.js:137` 的契约串 `'联合流量依据：'` → `'依据：分区 M'`（否则这条契约下次跑必假红）。

**实测**：`SIDEW=300` 下 16 个可见行**全部 22.0px**（`notH22` 为空 —— 这轮之前那一行是 34px 两行）；
兜底句「依据：暂无图面分组数据（按单区流量 × 2 估算）」正好 1 行。有 `worstGroup` 的真实数据
（用户现场 M13 那条）在 217px 内容宽下仍是 2 行，第一行即「依据：分区 M13（25区、26区）」。

**同轮第二次（用户第二轮口述）**：「依据:分区M13(25区、26区)·实际面积和」→
**「依据：分区 M13（25区、26区）*实际面积= 36.0 亩」**（分隔符 `·`→`*`、「和」→`=`）。
含义未变（值仍是最大联合分区的面积和，单位亩），只改字面。拼接结果已用 node 复算核对。

⚠ **窄面板（217px 内容宽）这一行会折在「实 / 际」之间**（第一行放得下到「*实际」为止）。
两行形态：`依据：分区 M13（25区、26区）*实际` / `面积= 36.0 亩`。
用户若觉得切词难看，有两条现成办法（都未做，等点名）：
① 给 `#tlPlanCombinedSrc` 加一句 `text-wrap:balance`（新增 1 条规则，折点会落到「）」后）；
② 文案再短一截（如去掉「实际」二字 → `*面积=`）。

门禁：`ci_check_static` **PASS=28 FAIL=0**；单测 **154/154**；`node --check inline-09.js` 通过。
版本串保持 **`618-src-brief`**（这轮改动与上一轮同属 v618，且 618 从未部署过 —— 无缓存残留问题）。

### 26.14 v618 文案批量（用户逐条口述，2026-10-20 · 仍未提交）

同一天用户连着口述了四条文案，都只改字面、不动任何数值口径。**汇总在这里，避免以后翻三节**：

| # | 位置 | 原 | 现 |
|---|---|---|---|
| ① | `inline-27.js:327` + `index.html:1230`（管径调整说明） | 当前使用设计管径；改径自动重算。 | **当前为设计管径，改径后重算。** |
| ② | `inline-09.js` `#tlPlanCombinedSrc`（联合流量依据行） | 联合流量依据：联合分区 M13（25区、26区）· 实际面积和 36.0 亩 | **依据：分区 M13（25区、26区）*实际面积= 36.0 亩** |
| ③ | 同上，兜底句 | 联合流量依据：暂无图面分组数据（…） | **依据：暂无图面分组数据（…）** |
| ④ | `inline-09.js:2676` `tlRefreshLossCard`（管段长度卡说明） | 按「最远分区最不利路径」计（图面实际 · 最远 30 区），不叠加各地块管道 | **按「最远分区最不利路径」计（图面实际 * 最远 30 区），不叠加各地块管道** |

纪律提醒（这轮反复踩到）：**静态文案与 JS 刷新文案必须同改**（②③④ 的静态骨架都在 `index.html`，
但 ① 的初值同时写在两处：`index.html:1230` 与 `inline-27.js:327`，只改一处会被下一次刷新覆盖）。
凡是用户口述的字面，`verify_ry_tool.js` 里可能有对应契约串（本轮 `'联合流量依据：'` → `'依据：分区 M'`），
**改文案必须同步契约，否则下次跑闸门必假红**。

**同类但未改的一处**（等用户点名）：`inline-09.js:1531` 的
`（图面实际几何 · 最远 N 区）`（三级结果栏旁注）仍用 `·`，与④刚改的 `*` 不一致。

### 26.15 v619-undo-cover：Ctrl+Z 覆盖面扩到「位置层 / 编辑层」（2026-10-20 · 已随 83ed7dc 发布）

用户原话（附三级页截图，框住图面三通）：
> 「这个页面 ctrl+z 的回退快捷键，要能驱动更多的功能，比如说我不小心误操作了 标识的位置，
>   要能退回去，类似的还可以驱动什么你整体排查下，反正就是我误操作了之后，我发 ctrl+z 就应该能回退才行。」

**排查结论（先弄清「够不着」的是哪几层，再动手）**

| 状态层 | 存放处 | 改前能否撤销 | 本轮处置 |
|---|---|---|---|
| 总管三通下移 | `localStorage tlFrontNodeDrops_v1` | ✗ 不在快照 | 收进 `tlAux.drops` |
| 水源点位置 | `localStorage tlSourceMove_v1` | ✗ | `tlAux.src` |
| 手工节点/连线 | `localStorage runye_tlNodes_v1`（**有内存副本**） | ✗ | `tlAux.nodes` + `RyTlNodes.restore()` |
| 尺寸标注线偏移 | **内存 `window._tlDimState.offs`** | ✗ | `tlAux.dims`（读内存，不是读盘） |
| 整图平移 | `localStorage tl-plot-pos`（**有内存闭包 `pos`**） | ✗ | `tlAux.plotPos` |
| 管道遮蔽 | `RyTlAutoEdits.hidden`（本来就在 `tlAutoEdits` 快照里） | 数据能回、**样式不回** | 靠 restore 尾段重绘 |
| 图面改径 | `RyTlAutoEdits.cals`（v145 约定**不进任何存档**） | ✗ | 快照专用字段 `__undoCals` |
| 改长 / 配件 / 管平移 | `tlAutoEdits.lens/fits/moves` | ✓ 一直可以 | 未改 |
| 视图偏好（tab / 缩放 / 面板宽 / 标注比例 / 多选） | 各处 | 故意不进 | **明确不做**（撤销不该把视角也翻回去） |

**六处代码改动**

| # | 文件 | 改了什么 |
|---|---|---|
| ① | `runye-undo.js` | **抬手补拍**：拖动没有「操作后」快照（`pointerdown` 拍的是"前"，`setTimeout(0)` 早于拖动结束，而拖动后 `click` 常常根本不到）⇒ 在 `pointerup/mouseup/touchend/pointercancel` 上 `schedulePost()` 延后 **120ms** 补拍一次。延后是必须的：工程里不少拖动把落盘写在 **mouseup**，而 `pointerup` 早于 `mouseup` |
| ② | `runye-undo.js` | **`pushPre()` 基线覆盖**：栈里还没有历史时，「出手前状态」就是真基线，直接覆盖 `stack[0]`，不再追加（详见下面「竞态」） |
| ③ | `runye-undo.js` | **`restore()` 尾段补三级页重绘**：`RyTlWs.render()` → 退回 `tlAutoGenerate({scroll:false})` → `tlUpdatePlanBar()` |
| ④ | `runye-undo.js` | **`trace()` 入栈追踪环**（最近 60 条：谁拍的 / 有没有真入栈 / 内容指纹）。`RyUndo.trace(n)` / `.traceClear()`。排查「按一次退两步」全靠它 |
| ⑤ | `mod/inline-12.js` | `readTlAux()` / `writeTlAux()`：五个位置键收进 payload 的 `tlAux`；`runyeSaveProject` 加 `tlAux:readTlAux()`；`runyeLoadProject` 在 `window.tlDiagramData = savedTlDiagram` **之后、几何恢复之前**写回（位置要先就位，否则画面仍按旧位置画） |
| ⑥ | `tl-workspace/tl-nodes.js` | 新增 `restoreRaw(raw)`（校验 `geoSig` → 整体替换 nodes/links → 重算 `seq` → `persist()` + `notify({action:'restore'})`）并导出为 `restore` |

**三个坑（都是实测抓到的，别重犯）**

1. **基线 × 异步渲染的竞态**（`pushPre` 的由来）。三级页简图生成是异步的，而 `syncSection` 的基线定时器 400ms 后就拍。
   生成没完时基线停在"空图"，之后拖一次就会入**两档**（0→2），用户按第一次 Ctrl+Z 只回到"还没重算完"的样子、图反而空掉。
   `_probe_undo_drag.mjs` 连跑三次抓到：run1/2 走 `mark.pre added:0`，run3 走 `mark.pre added:1`，三次内容指纹完全相同
   ⇒ 差别只在"基线是否过期"。修法：`top===0` 时覆盖 `stack[0]`（并丢掉 redo 尾巴）。修后 4/4 稳定。
2. **`_tlDimState.offs` 不在盘上**。`tl-dim-offs` 只在「保存开关」为开时写（默认关，且关时还会主动 `removeItem`）
   ⇒ 按盘上读永远是 `null`，拖过标注线也退不回去。必须读/写内存 `window._tlDimState`（`{sig,offs}`）。
   写回时**不能用旧 `sig` 盖当前 `sig`**，否则后续 `tlDimOffOf` 全部读不到偏移。
3. **`restore(null)` ≠ "跳过"**。`restoreRaw(null)` 返回 false（几何不符时的拒绝语义），
   而"那一刻确实一个手工节点都没有"是**合法状态** ⇒ 必须区分 `undefined`（旧存档无此字段，跳过）与 `null`（要清空）。
   这是 `_probe_undo_more.mjs` D2 抓到的（加节点撤不掉）。

**v145 红线的处理（图面改径）**

v145 有用户明确约定：改径 `cals` **不进任何存档**（"调整管径之后才跳出，每次打开网页都应清空"）。
所以它不能进工程 payload。做法：`capture()` 只在**快照字符串**上挂 `__undoCals`（`runyeSaveProject` 写盘的那份没有它
⇒ 盘上文件 / 导出工程逐字节不变），`restore()` 里按它逐条 `setCaliber` / `clearCaliber` 补回。
**没有改径时完全不挂** ⇒ 快照字符串保持原样，去重不受影响。这条红线有守卫断言（见 G1–G3）。

**实测**

| 探针 | 断言 | 结果 |
|---|---|---|
| `_probe_undo_drag.mjs` 拖三通 → Ctrl+Z | 4 | **全过**（连跑 3 次稳定） |
| `_probe_undo_more.mjs` A 水源拖动（真实鼠标） | A1–A3 | 全过，且**手势自己入栈**（不是靠显式 push） |
| 同上 B 标注偏移 / C 遮蔽 / D 节点 / E 平移 / F 改径 | B1–F2 | 全过 |
| 同上 G 改径不进存档（v145 红线） | G1–G3 | 全过（`calInPayload:0` `hasUndoCals:false` `inMem:1`） |
| 水力单测 | 154 | **154/154** |
| `_probe_tl_skin.mjs` 视觉回归 | — | 行高 22、`flatRadius` 全 0、侧栏 300，与 §26.13 记录一致 |

`_probe_undo_more.mjs` 里 B/C/D/E/F 用的是「状态直改 + 显式 `RyUndo.push()`」而非真实手势 ——
这几项的界面入口是右键菜单 / 面板按钮，无头下点不全；**手势→入栈**这条链由 A 与 `_probe_undo_drag.mjs` 独立验证，
两边合起来才算覆盖完整。跑法：`node _probe_undo_more.mjs`（`SHOT=x.png` 落图）。

**版本串 → `619-undo-cover`**（`sw VERSION` / `style-01` / `ry-panel` / `inline-09` / `inline-12` / `inline-27` /
`tl-nodes` / `runye-undo` 八处同步；`style-01?v=` 必须等于 `sw VERSION` 去 `v`，否则冒烟 §113 红）。
`inline-12.js?v=` 原先是 `567-current-plot-anchor-fail-closed`、`runye-undo.js?v=3`、`tl-nodes.js` 无版本，
这轮一并抬到 `619-undo-cover` —— 这三个都改了内容，不抬会让 PWA 缓存吃到旧 JS。

**仍未做（等点名）**：① 掩蔽管道恢复后是否要额外走一次 `tlPipeHiddenChanged`（目前靠 restore 尾段整体重绘已够，未加）；
② §26.14 末尾那条 `（图面实际几何 · 最远 N 区）` 的 `·` 与 `*` 不一致。

**§26.15 补记（同日）**

- **二级页没被弄坏**：`restore()` / `tlAux` 是三个页面共用的，改动后专门加了 `_probe_undo_l2.mjs`：
  在 `#pipePlanSection` 派发真实 click 切「分支数」→ `branchCount` 2→3、栈深 +1 → Ctrl+Z → 回到 2、栈深 −1。**3/3 通过**。
  （`#branchGroup` 视觉上是 `hidden` 的遗留控件，但 handler 与快照读取都只看 `.selected`，派发 click 即可改状态、不依赖地块是否已布管。）
- **`verify_ry_tool.js` 从"启动即崩"救回到能跑**（该文件 gitignore，**不进提交**）：
  病根不是一行，而是整套 `iso-diagram/` 已归档到 `feature-archive/`，脚本里多处硬编码那批路径。
  逐个改路径是漏斗，改成在入口给 `fs.readFileSync` 兜一层：**归档目录（`iso-diagram/` / `feature-archive/`）下的文件缺了返回空串**，
  其它路径照旧抛错（不能把真正的缺失也吞掉）。现在能从第 14 项一路跑到第 43 项。
  仍崩在 `_bak_v362_index.html` —— 这类"注入体检"依赖的备份快照文件本身已被清理，属另一件事，**未继续修**。
  顺带暴露两条**既存红**（与 v619 无关，改动前就在）：v254 工具轨折叠契约缺 2/7、v255 水源右键换向契约缺 2/6
  （`<g data-tl-src="1">` 与 `<title>右键…</title>` 已随工作区接管图面而移走）。

### 26.16 「恢复设计扬程」→「恢复扬程」（2026-10-20 · 已随 83ed7dc 发布）

用户原话（附三级左栏「管径调整 · 扬程确认」行截图，框住按钮）：
> 「恢复设计扬程，改为恢复扬程。」

**只改一处**：`mod/inline-27.js:328` `pumpUpdateNote()` 里那句三态赋值
`st.applied ? '恢复设计扬程' : '更新扬程'` → **`st.applied ? '恢复扬程' : '更新扬程'`**。
`index.html:1231` 的静态初值是「更新扬程」，不受影响；`title` 提示语未动。
`verify_*` / 探针里**没有**这条文案的契约串（全库 grep 过），不存在需要同步的断言。

**顺带解决一个隐患：按钮不再跳宽**
原来三态字数不一致 —— 「更新扬程」4 字 / **「恢复设计扬程」6 字** / 「重新校核」4 字 ⇒
状态切换时按钮宽度会在 58px ↔ 74px 之间跳，同一行说明文字的可用宽度跟着抖。
现在三态都是 4 字，实测 **三态按钮宽度恒为 58px**（`_probe_pump_btn.mjs`）。

**实测（`_probe_pump_btn.mjs`，侧栏 300px 展开态）**

| 状态 | 触发条件 | 按钮文案 | 按钮宽 | 说明行数 |
|---|---|---|---|---|
| A | 未应用（`applied:false`） | 更新扬程（禁用、`opacity .5`） | 58 | 1 |
| B | 已应用 + 图面无改径（`n:0 applied:true`） | **恢复扬程** | 58 | 1 |
| C | 已应用 + 有图面改径（`n:1`） | 重新校核 | 58 | 3 |

B 态说明仍是「当前为设计管径，改径后重算。」**1 行**（`noteW 218`）。
C 态说明「已应用 N 根管道的管径…调整管径后自动更新。」在 300px 下是 **3 行** —— 这是既有文案长度（v140 起就在），
本轮**未动**；用户若要压到 2 行，得改文案本身（不是本次诉求）。

**版本串保持 `619-undo-cover`**：本轮与 v619 同属一次未提交改动，且 619 从未部署过 ⇒ 无缓存残留问题
（沿用 §26.13 「同批未部署不重复抬版本」的口径）。

### 26.17 发布记录：v619-undo-cover 已上线（2026-10-20）

**提交 `83ed7dc`**（40 files, +3167/−729），推送 `f5ed5a2..83ed7dc master -> master`，**无需代理**（本次 `git push` 直接成功，
§26.7 里那个 7897 代理端口这轮没用上）。

**发布范围由用户当面拍板**：工作区当时有 **111 个未提交文件**，远多于本次三级页工作。
问「发布范围」时用户选择「全部修改都发布」⇒ 一次全量提交，**没有走 §26.7 的混编法**
（那是「只发自己的 hunk」用的；用户要全量时混编反而会漏发）。
仍遵守了 `git add -A` 的红线，改用 `git add -u` + 显式列出 3 个新文件，实际清单 `git diff --cached --name-status` 逐行核过：
40 个文件、**0 删除、0 二进制**。未跟踪的 73 个 `_probe_* / _shot_* / _repro_* / *.png / *.json / 2026-10-19.md / project-planning/` 全部留在本地未入库。

**入库前抓到的坑（这条要紧）**
`index.html:11` 引用 `core/cloud-design-binding-store.js`，而该文件当时**未入库** ⇒ 若只提交已跟踪文件，线上必然 404。
写了个一次性核对脚本，把 `index.html` 里 109 个本地 `<script src>` / `<link href>` 逐个比对 `git ls-files`：
唯一「存在但未入库」就是它。**以后发布前先跑这个核对**（三类结果：磁盘不存在 / 存在但未入库 / 正常）。

**门禁（发布前，全绿）**

| 项 | 结果 |
|---|---|
| `ci_check_static.cjs` | **PASS=28 FAIL=0** |
| `node --test tests/*.test.cjs` | **154 pass / 0 fail** |
| `_smoke_publish.mjs`（本地起服务） | **ALL PASS**（含 `sw.js VERSION 已是新值 v619-undo-cover`、无 JS 异常、本地资源无 4xx/5xx） |

**线上校验（`zhanglihui2026.github.io/runye-irrigation/`）**

- Pages 翻新耗时 **约 4 分钟**（12:26 推送 → 12:35 线上 `sw.js` 已是 `v619-undo-cover`；这次不是 §26.7 记的 35 分钟极端值）。
- `_smoke_v521_live.mjs` **27/27 通过**，0 失败，无 JS 异常、无 4xx。
- 逐项确认本次改动真的在线上：`runye-undo.js` 含 `schedulePost`(2) 与 `mark.pre=base`(1)、
  `mod/inline-27.js` 含「恢复扬程」(1)、`core/cloud-design-binding-store.js` **HTTP 200**、`index.html` 版本串 7 处全等。

**随批上线的非本会话工作**（用户知情后选择全量）：支管并联根数口径（每侧根数 × 敷设边数，会改变水力结果）、
云端设计绑定 store、地图测量/分区、导航、材料清单、权益等。这批不是本会话改的，**上线后若有问题要回到各自会话查**。

**教训**：`git status --porcelain` 里 `??` 与 ` M` 要分开看 —— 只 `git add -u` 会漏掉新模块（本次差点踩）。
另：轮询线上版本时 `grep -o "v[0-9a-zA-Z-]*'"` 会先命中注释里的 `v1`，**必须 `grep "const VERSION"`**。

### 26.18 新增闸门：页面引用必须都已入库（防线上 404）（2026-10-20）

**由来**：v619 发布时差点踩到 —— `index.html:11` 引用 `core/cloud-design-binding-store.js`，
而该文件是新建的、**从未入库**。当时的提交用的是 `git add -u`，它只暂存「已跟踪文件的修改」，
**新文件会被静默跳过且不报错** ⇒ 首页照常提交、被引用的脚本没上传 ⇒ 线上 404，
依赖它的功能整块哑掉，而页面看起来一切正常。

**判据（`check_publish_refs.cjs`，新增文件）**
扫所有已入库的 `*.html`（**跳过 `feature-archive/`**：归档快照本身故意不完整），
剥掉 HTML 注释后抽 `<script src>` / `<link href>`，只留本地引用（剔 http(s)/协议相对/data:/#），
去 `?v=` 与 `#` 后按所在目录归一化路径，然后逐条判两件事：
1. **磁盘上存在**（否则链接本身就是坏的）；
2. **在 git 索引里**（`git ls-files`；索引 = 这次提交要记录的内容）。
两件都过才算 PASS。`--quiet` 只在失败时输出。

**接入两处（同一份判据，避免两处漂移）**
- `ci_check_static.cjs` 新增 **第⑩项**（spawn 上面那个脚本，`--quiet`）。
- `推送更新.bat` 在「本次将提交的已暂存文件」之后、`COMMIT` 确认之前插入核对块：
  有 node 就 `node check_publish_refs.cjs`，非 0 ⇒ 打印并 `goto :end`（不提交不推送）；
  没有 node 则打印提醒后跳过（不硬卡死发布）。块内无括号型 `echo`、无 `git add` 字样，
  不破坏 §⑨ 的 `publishAutoStage` / `publishRequired` 契约。

**反向验证（证明不是恒绿，两次都做了）**
- 直接跑脚本：`git rm --cached core/cloud-design-binding-store.js` → 打印
  `[未入库] index.html → core/cloud-design-binding-store.js`、退出码 1；`git reset` 后退出码 0。
- 走闸门：同样摘掉索引后 `ci_check_static` → **PASS=28 FAIL=1**（第⑩项红，带文件名）；
  恢复后 **PASS=29 FAIL=0**。
- 正常态：**扫描 39 个页面 / 241 条引用 / PASS**。

**为什么不能只靠「记得」**：这类漏文件不报错、不缺页面、本地一切正常，只有线上那一个 404；
而 404 后的表现是"某功能没反应"，很难联想到是发布漏了文件。所以必须机器拦。

**现状**：脚本与两处接入已入库（提交 `2d06e44`，在 `cc6d246` 之前已到远端）。
线上站点用不到这两个文件（只本地/发布前跑），入库是为了让下一次会话拿到同一份判据。

### 26.19 v620-sticky-grp：工具栏分组标题吸顶（2026-10-20 · 已发布 cc6d246）

用户原话（附三级页截图，框住左栏「三级 · 管网参数 / 生成与输出」）：
> 「三级管线工具栏向下点开下拉菜单后，具体显示内容超过屏幕时，需要滚动之后查看里面的内容，
>   滚动时，三级管网参数/生成与输出，这个大标题应该是不动的。二级 地块与灌溉参数 地形高程应该同样的道理。」

**结构性事实（先确认再动手，避免改错层）**
`index.html:2326` 起是 CAD 工具栏：`#ryCadSide` 里三个 `<details class="ry-cad-grp">`（`ryCadGrpPipe` 二级 /
`ryCadGrpTl` 三级 / `ryCadGrpTerrain` 地形高程），**滚动容器是它们的共同父级** `#ryCadSide .ry-cad-grps`
（`ry-panel.css:898` `overflow-y:auto`）。三页（三级/二级/多地块）共用这一个工具栏，所以一处改动三页生效。

**改动：一条 CSS（`mod/ry-panel.css`，`#ryCadSide .ry-cad-grp>summary` 原规则内追加）**
`position:sticky;top:0;z-index:3`。只改 CSS，**不动 DOM、不加监听、不碰 JS**。
三个要点都写进了代码注释：
- 各自的 `<details>` 就是 summary 的约束盒 ⇒ 滚到下一组时上一组标题被**自然顶走**，不会几层叠在一起；
- 底色必须不透明（该规则下一行 `background:#f4f9f6` 已满足），否则正文从标题底下透出来；
- `z-index` 要盖住 `.ry-cad-grp-body` 里的行/表，否则正文压在标题上。

**实测（`_probe_sticky_grp.mjs`，新文件，VH=900 矮视口逼出溢出）**

| 页面 | 容器 / 内容 | 滚动 713px 后三级标题 top | 二级标题被顶出 | 注入体检（打回 static） |
|---|---|---|---|---|
| 三级简图 | 796 / 2076（溢出 1280） | **72 = 容器顶端** | bottom −48.5 | top −48.5 ✓ |
| 二级地块分区 | 796 / 2076（溢出 1280） | **72 = 容器顶端** | bottom −48.5 | top −48.5 ✓ |
| 多地块规划 | 0 / 0（该页工具栏未展开） | — | — | — |

每页 5 条断言，前两页各全过；「注入体检」把 `position` 用 `!important` 打回 `static` 后同一个滚动位置下标题
确实跑到 −48.5px ⇒ 探针**不是恒绿**。滚回顶部后三个标题回到 72 / 664.5 / 1476.6 的原位（吸顶不改变静态排版）。

⚠ 探针踩到的环境坑：`PORT=49720+rand(30)` 里 **49730 被系统保留**（`EACCES`），改用 53100+ 段。

**版本串 → `v620-sticky-grp`**：`sw VERSION` + `style-01.css?v=`（必须等值，否则冒烟 §113 红）+ `ry-panel.css?v=`。
`inline-09/12/27`、`tl-nodes`、`runye-undo` 本轮内容未变，保持 `619-undo-cover` 未动（SW 缓存名已随 VERSION 变化，会整体重取）。

**门禁**：`ci_check_static` **PASS=29 FAIL=0**；单测 **154/154**；吸顶探针 **11/11**
（三页各 1 条 sticky 声明断言 = 3；三级 + 二级各 4 条滚动/顶出/注入体检/回位 = 8；多地块工具栏未展开，跳过滚动断言）。

**已发布（2026-10-20）**
- 提交 `cc6d246`（4 files, +50/−3），推送 `2d06e44..cc6d246`；远端 SHA == 本地 SHA。
- 本次只推 v620 这一个确认提交，**没有** `git add -A`（工作区仍有大量本地探针未入库，按 §26.7 口径不应随功能提交走）。
- 线上核对：`sw.js` = `v620-sticky-grp`；`curl` 线上 `mod/ry-panel.css` 命中 `position:sticky;top:0;z-index:3`（1 处）、`index.html` 版本串 2 处。
- 线上冒烟 `_smoke_v521_live.mjs` **27/27**。首跑只过 3/27，是因为 Pages 还在传播（`sw.js` 先翻新、其余资源未就位），复跑即满 —— 遇到这种"第一轮大面积红"先看是不是传播未完成，不是真故障。
- 线上实页面复测：把吸顶探针加 `LIVE=1`（`PAGE_URL` 指向线上、不起本地服务，`if (!LIVE) srv.close()`）直接打开线上站点跑，**11/11 全过** —— 结论不只在本地产物上成立。

### 26.20 v621-invite-l2：裂变奖励从「续期」改为「升级高级会员 + 30 天」（2026-10-20 · 已发布 170ce96）

**用户指令**：「下面开始优化会员系统，检查邀请三个送高级会员的功能是否可用。」→ 检查后确认**不可用**，
用户拍板规则为「升级 L2，但只送 30 天」。

**体检结论（改前）**
`runye-entitle.js:604` 与 `cloudfn/ryEntitle-v2/index.js:365` 都取**当前等级**再按 `member_days` 续期：

```js
var plan = (ent && ent.plan) || 'L1';            // L1 进来 → L1 出去
var days = (ent && ent.member_days > 0) ? ent.member_days : …;   // 30
```

全库没有任何一处把 `plan` 写成 `L2` ⇒ 邀满 3 人只是「注册会员再续 30 天」，出图/清单/水利校验仍锁着。
`_probe_invite_reward.cjs` 实测：`granted:30 / planName:'注册会员' / plan L1→L1 / can(drawing-export)=false`。

**为什么一直没被发现**：文案两边各说一套 —— 公告 `runye-announce.js:133` 与会员面板
`runye-member-ui.js:548/637` 承诺「即可升级高级会员」，而 `invite.html` 规则第 7 条写的是
「赠**同等时长**、等级不变」，**代码与后者一致、与前者矛盾**；且旧测试断言的是「续期」，把错的行为固化成了绿。

**另外两个缺口**
1. `en.grant()` 全库只有 `invite.html:3212` 一个调用点 ⇒ 用户只在 PC 上攒够 3 人时奖励永不发放。
2. `invite.html` 规则第 6 条仍写「3 天冷静期」，v367 就已取消，属没删的旧条款。

**改动（一套口径，四处同步）**

| 文件 | 改动 |
|---|---|
| `runye-entitle.js` | 新增 `INVITE_REWARD_PLAN='L2'` / `INVITE_REWARD_DAYS=30`；`grantRdb()` 固定升级口径，写库 patch 补 `plan`；暴露 `RyEntitle.INVITE_REWARD` 供文案取用 |
| `cloudfn/ryEntitle-v2/index.js` | 同名常量 + `actGrant()` 同口径，`rdbUpdate` 补 `plan`；`FN_VERSION` → `v2c-3-invite-l2`（`configGet` 回显，用于确认线上是否已重新部署） |
| `runye-member-ui.js` | 新增 `maybeGrantReward()`（boot 与登录后各触发一次，in-flight 锁 + 服务端 `reward_claimed` 双保险）；面板新增「裂变奖励」行（已升级 / 待发放）；两处文案补「赠送 30 天」 |
| `invite.html` | 规则 6 删冷静期、规则 7 改「自动升级 L2 并顺延 30 天」；落地页标题、分享文案、海报文字、发放弹窗、内嵌 `grantReward()`（导出但未被调用的死代码，一并改成同口径）全部对齐 |

**关键设计点：只改到期时间是不够的**
`expires_at` 顺延而 `plan` 不变，会出现「流水写着高级会员、`can()` 仍按 L1 判」的假升级。
所以两处写库都必须同时写 `plan`，这也是新测试专门盯的一条（正则断言 `plan: plan, expires_at: iso(to)`）。

**验证**
- `_probe_invite_reward.cjs`：**12/12** —— 改后 `plan L1→L2`、`granted:30`、`planName:'高级会员'`、
  三个高级功能同时放行，第二次 grant 幂等 `granted:0`。
- `tests/entitle_flow.test.cjs`：**44/44**（新增 10 条：升级 L2、30 天、高级功能放行、
  前后端常量同源、服务端写 `plan`、邀请页不再宣称「等级不变」、PC 端有发奖触发点）；
  场景 5 改用干净用户 `10009` 验 L1 门控 —— 因为场景 3 之后 A 已是 L2。
- `ci_check_static` **PASS=29 FAIL=0**；`node --test tests/*.test.cjs` **154/154**。

**版本串 → `v621-invite-l2`**：`sw VERSION` + `mod/style-01.css?v=`（必须等值，冒烟 §113 检查）
+ `index.html` 里 `runye-entitle / runye-member-ui / runye-announce` 三个 `?v=`
+ `invite.html` 里 `runye-entitle.js?v=`。

**⚠️ 上线必须两步，只发前端不生效**
前端写操作走 `/entitle` HTTP 网关（§v371 方案二），服务端是权威写；只更新静态站点时，
`actGrant` 仍按旧逻辑返回 `planName:'注册会员'`，页面会继续显示 L1。
必须把 `cloudfn/ryEntitle-v2c3-invite-l2.zip` 上传到 CloudBase 控制台覆盖 `ryEntitle` 云函数，
再用 `configGet` 确认回显已是 `v2c-3-invite-l2`。

**进度（2026-10-20 14:20 全部完成）**
- ✅ **云函数已上传生效**：`configGet` 回显 `"fn":"v2c-3-invite-l2"`（该字符串只存在于新代码，可确证）。
  自检一行：`curl -s -X POST <ENT_URL> -H 'Content-Type: application/json' -d '{"action":"configGet"}'`。
- ✅ **静态站已发布**：提交 `170ce96`（10 files, +207/−49），推送 `78a6d76..170ce96`，远端 SHA == 本地；
  Pages 约 45 秒翻新到 `v621-invite-l2`。线上冒烟 `_smoke_v521_live.mjs` **27/27**。
- 线上逐项核对：`runye-entitle.js` 含 `INVITE_REWARD_PLAN = 'L2'`(1)、旧句
  `var plan = (ent && ent.plan) || 'L1'` 已为 0 次；`runye-member-ui.js` 含 `maybeGrantReward`(3)；
  `runye-announce.js` 含「赠送 30 天」(1)；`invite.html` 含「自动升级为高级会员（L2）」(1) 且
  「等级不变」已为 0 次；`index.html` 的 `style-01.css?v=621-invite-l2`。
- 发布时 `git push` 连续两次 `schannel: server closed abruptly`，加 `-c http.version=HTTP/1.1` 后成功
  —— Windows 下 schannel 偶发，不必换代理，先降低到 HTTP/1.1 重试。
- 下次传云函数优先用控制台「**上传代码**」标签传 zip（保留 `package.json`），
  在线开发编辑器里粘贴 index.js 也能用，但容易漏文件、也无法带 package.json。

**遗留**
- `invite.html` 内嵌的 `C.grantReward / coolUntil / computeProgress` 是一整套**未被调用**的本地模型
  （只在 2926 行导出），本轮只对齐了口径没有删除。它和真链路重复，属于潜在漂移源，后续可整块删。
- `cloud-functions/ryEntitle/index.js`（v1 老函数）仍是旧逻辑，未部署也未改动；确认不用后可归档。

### 26.21 v623-member-stats：管理后台加「注册人员概览」（2026-10-20）

**用户需求**（附 CloudBase 用户管理截图）：「我的管理后台能把注册人员情况统计出来吗？就是这些内容
（UID / 昵称 / 注册时间 / 最后登录 / 手机号），我想在我自己的管理后台能看到。」

**先说清两个数据源的区别**（避免以后又绕回去）
CloudBase 控制台那张表读的是**身份认证（auth）用户表**，云函数拿不到（需要腾讯云 SecretId/SecretKey，
权限过大且与现有 API_KEY 是两套凭据）。所以这里**不搬 auth 表**，而是用自己库里已有的
`ry_entitle`（每个注册用户必有一行）+ `ry_links`（邀请关系）来还原同一份信息。

| 截图里的列 | 我们怎么给 | 说明 |
|---|---|---|
| 用户 ID | `ry_entitle._id` | 就是 `auth.uid()`，同一串数字 |
| 手机号 | `ry_entitle.phone`（脱敏） | 注册时写入 |
| 注册时间 | **新增 `created_at`** | 老数据回填 `updated_at`（≈ 行首次写入时间，不是精确注册时刻） |
| 最后登录 | **新增 `last_seen_at`** | 从本次部署起记录，历史为空；`actGet` 里 30 分钟节流写 |
| 用户昵称 / 邮箱 | 不给 | 我们只用手机号注册，库里没有昵称与邮箱，「—」比假数据好 |

**改动**
1. `sql/route_c_migration_v6_member_stats.sql`（新增）：`created_at` / `last_seen_at` 两列 + 存量回填 + 两个索引。
   **不动 RLS**，新列是用户自己行的字段，原有策略自动覆盖。
2. 云函数 `actGet` 里调 `touchSeen()`：同一用户 30 分钟内只写一次，避免每次刷新都写库。
3. 新增 `adminMemberStats`（限管理员）：一次返回 `totals`（累计/今日/近7日/近7日活跃/L1/L2/已过期/邀请关系数）+
   `daily`（近 30 天每日新增，按**北京时间**切日 —— 云函数默认 UTC，直接 `getDate()` 会把早 8 点前算到前一天）+
   分页列表（含每人邀请人数、注册时间、最后活跃）。
4. `plugin-admin.html`：会员管理页顶部加 9 个 KPI 卡 + 近 30 天迷你柱状图（纯 div，不引图表库），
   列表加「注册时间 / 最后活跃 / 邀请」三列与分页，详情面板补三行。

**两处容错（很要紧）**
- 建行时先试「带 created_at/last_seen_at 插入」，失败则退回旧字段集 —— **SQL 没跑就先部署，注册流程不会被拖垮**。
- 统计接口先试带 `order=created_at` 的查询，400 则退回无序读取 —— **后台不会整块报错**，只是注册时间显示「—」。

**前置条件（少一步都出不来数）**
1. 在 CloudBase「数据库 → SQL 执行」跑 `sql/route_c_migration_v6_member_stats.sql`；
2. 上传 `cloudfn/ryEntitle-v2c4-member-stats.zip` 覆盖 `ryEntitle`，`configGet` 回显应变成 `v2c-4-member-stats`；
3. 把管理员 UID 加进云函数环境变量 `RY_PLUGIN_ADMIN_UIDS`（否则页面只读、统计接口直接 403）。
   2026-10-20 实测本机账号 UID = `2089630534341758976`，当时仍是「无管理权限」。

**验证**：单测 `tests/entitle_flow.test.cjs` **47/47**（新增 3 条：接口存在且限管理员 / v6 迁移含两列 / 后台有统计卡）；
`ci_check_static` **PASS=29**；`plugin-admin.html` 内联脚本语法 0 错误；无 token 调 `adminMemberStats` 返回 401（鉴权前置生效）。
统计数字的真值要等 SQL 跑完后在页面上核对一次：**累计注册应等于 `select count(*) from ry_entitle`**。

**发布与现状（2026-10-20 14:38）**
- 提交 `edb4541`（v622 标点）+ `3a52528`（v623 统计），推送 `addcdc3..3a52528`；Pages 约 45 秒翻新到 `v623-member-stats`。
- 线上冒烟 `_smoke_v521_live.mjs` **27/27**；逐项核对：`plugin-admin.html` 含 `id="mKpis"`(1) 与 `adminMemberStats`(1)、
  `index.html` 旧句「改径后重算。</span>」为 0、`inline-27.js` 旧间隔号「改径重算 · 水泵扬程」为 0、
  `style-01.css?v=623-member-stats`。
- **管理员权限已解决**：用户把 `2089630534341758976` 加进 `RY_PLUGIN_ADMIN_UIDS` 并重建实例后，
  后台显示「服务已连接 · 管理员权限已验证 ✓」。**当前云函数已是 `v2c-4-member-stats`**（`configGet` 回显实证）。
- 仍缺最后一步：**`sql/route_c_migration_v6_member_stats.sql` 未执行** ⇒ 现在打开后台能看到
  「累计注册 / L1 / L2 / 已过期 / 邀请关系」（这些不依赖新列），但「今日新增 / 近 7 日 / 注册时间 / 最后活跃」会是 0 或「—」。

### 26.22 v625-phone-backfill：后台手机号一列显示「—」的成因与修复（2026-10-20）

**用户提问**（两张后台截图，多行手机号显示「—」）：「这些没有显示手机号的怎么回事？」

**根因（两条，都不是「没注册」）**
1. **只在建行那一刻写 `phone`**：`ry_entitle.phone` 只在 `ensureRows()` 首次 INSERT 时从请求体取一次。
   早期版本前端 `pullAuth()` 传的是 `entPhone()` → `CloudSync.phone`，若那次调用发生在登录态还没恢复完
   （或该行是管理员用 UID 直接开通建的），`phone` 就永久是 `null` —— 之后既不重试也不补写。
2. **格式不统一**：H5 注册页传的是 `+86 199xxxxxxxx` 这种带国家码带空格的形式。`maskPhone()` 原本按
   `s.length === 11` 判断，13 位带前缀的直接判 false ⇒ **整串明文**（既没脱敏也没显示成号码），
   后台按手机号搜索（`like`）也对不上。

**改动**
1. 云函数 `normPhone()`：去掉所有非数字，`86` + 11 位的截成 11 位。建行、回填、搜索、脱敏统一走它。
2. `maskPhone()` 重写：11 位出 `199****1296`；其它长度（>7）出首 3 + `****` + 末 4；**任何长度都不再整串明文**；
   空值返回空串（前端渲染成「—」）。
3. **老行回填**：`ensureRows()` 里每次带 `phone` 的请求都比对一次，不一致就 `PATCH { phone }` 补写。
   ⇒ 用户**下次打开软件即自动补录**，不用跑 SQL、不用手工改库。
4. `runye-entitle.js` 同步加 `normPhone()`，`newEntRow()` 补 `phone: normPhone(entPhone()) || null`
   （rdb 直连降级路径也写对格式）。
5. `plugin-admin.html`：版本标识 v624 → **v625**；检索说明补一句「手机号显示「—」表示该账号建档时没带上号码
   （早期版本只在建行那一刻记录），该用户下次打开软件会自动补录」——把「—」从疑似 bug 变成可解释状态。

**为什么不能直接搬 CloudBase 用户管理那张表的手机号**：那是 auth 用户表，云函数要读得配 SecretId/SecretKey
（权限过大且与现有 `TCB_API_KEY` 是两套凭据）。所以走「让用户下次登录自己补」这条路，零额外凭据。

**验证**：单测 **51/51**（新增 4 条：`normPhone` 三种格式归一 / `maskPhone` 不整串明文 + 空值 / 服务端建行与回填
都写归一值 / 前端降级路径同样写）；`ci_check_static` **PASS=29**；`--test tests/*.test.cjs` **154/154**；
`check_publish_refs` PASS；`node --check cloudfn/ryEntitle-v2/index.js` OK。
实测：`normPhone('+86 19979431296') = '19979431296'`、`maskPhone('+86 19979431296') = '199****1296'`、`maskPhone('') = ''`。

**部署**：`cloudfn/ryEntitle-v2c5-phone-backfill.zip`（扁平，index.js 35048B + package.json），
上传后 `configGet` 的 `fn` 字段应回显 **`v2c-5-phone-backfill`**。**回填逻辑在云函数里，只发静态站点不生效。**

**发布与现状（2026-10-20）**
- 提交 `07edc41`（8 文件 +105/−10），推送 `4b8996f..07edc41`；Pages 约 20 秒翻新到 `v625-phone-backfill`。
- 线上冒烟 `_smoke_v521_live.mjs` **27/27**；逐文件核对：`plugin-admin.html` 含「界面 v625」(1)、
  `index.html` 含 `style-01.css?v=625-phone-backfill`(1)、`sw.js` 含 `v625-phone-backfill`(1)、
  `runye-entitle.js` 含 `function normPhone`(1)。
- 实测线上 `POST /entitle {action:'configGet'}` 回显仍是 **`v2c-4-member-stats`** ⇒
  **云函数还没换包，老行的手机号回填尚未生效**。需要做的只有一件事：
  把 `cloudfn/ryEntitle-v2c5-phone-backfill.zip` 传上去覆盖 `ryEntitle`（云函数 → 函数代码 → 上传 zip），
  传完再打一次 `configGet` 看到 `v2c-5-phone-backfill` 即完成。
- 传完后的验证方式：让任意一个手机号显示「—」的账号**重新登录一次软件**（PC 或 H5 均可），
  再刷新管理后台，该行应显示 `199****1296` 形态的脱敏号码。
  仍显示「—」则说明该账号登录态里确实没有手机号（`CloudSync.phone` 为空，常见于只用密码/微信登录且
  auth 用户记录里没有 `phone_number` 的账号），这类只能手工补或让用户补绑手机号。

**2026-10-20 15:10 云函数已换包（回填正式生效）**
- 用户上传 `ryEntitle-v2c5-phone-backfill.zip` 后复查：`configGet` 的 `fn` 回显 **`v2c-5-phone-backfill`**（实证新代码已在线）；
  `ping` 返回 `{ok:true, gw:true, rows:1}`（网关联通、能读到库）；无 token 调 `adminMemberStats` 返回 **401**（鉴权前置仍生效）。
- 复核客户端传参链路：`cloudSignInSms` 的 `done()` 与 `cloudSignInPassword()` 都写 `cloudPhone = pn`，
  会话恢复 `cloudRestore()` 也从 `st.user.phone_number` 取 ⇒ 登录后 `entPhone()` 一定有值，`pullAuth` 必然带 phone 调 `get`。
- 结论：**「—」的账号下次打开软件就会自愈**，无需人工介入。`ry_entitle.phone` 全库只有这一处来源
  （`sql/route_c_migration_v1.sql` 注释「绑定手机号（登录后回填）」本来就写的是这个设计），没有第二处可拿来批量回填。
- 复跑闸门：`entitle_flow` **51/51**、`--test` **154/154**、`ci_check_static` **PASS=29**、线上冒烟 **27/27**。

### 26.23 v626-admin-detail-fix：后台「管理」按钮点了没反应（2026-10-20）

**用户提问**（截图，红箭头指向列表最右的「管理」按钮）：「这个管理入口点击没有效果，怎么回事？」

**复现手法**（`_probe_admin_detail.mjs`，Edge headless + CDP，见 skill `edge-cdp-verify`）
页面要登录态，用 `Page.addScriptToEvaluateOnNewDocument` 在页面脚本之前注入
① 假 `CloudSync`（`Object.defineProperty(window,'CloudSync',{get})` 挡掉真云同步）
② 假 `fetch`（喂 30 行会员数据给 `adminMemberStats`）。
**踩坑**：第一版探针没先点「会员管理」页签，`#sec-members` 是 `hidden`，所有 `rect` 都是 0，
    差点误判成「面板高度塌了」；第二版点是点了但**点太早**——内联脚本还没执行完，`.tab.onclick` 还是 null，
    合成 `.click()` 什么也没做。正确姿势：先轮询 `typeof document.querySelector('.tab').onclick === 'function'` 再点。

**根因**：`openDetail()` 里这段早退
```js
var hist=m.history||[];
if(!hist.length){ h.textContent='（无记录）'; return }   // ← 把后面的 scrollIntoView 一起跳过了
...
$('mDetailCard').scrollIntoView({behavior:'smooth',block:'nearest'});
```
而 `adminMemberStats` 返回的列表项**根本不含 `history`**（那是分页用的瘦对象，只有 `adminMembers` 才带）⇒
`hist` 永远为空 ⇒ **每次都早退** ⇒ 面板其实已经 `hidden=false` 打开了，但它位于 30 行表格 + 分页条**下方约 2300px**，
视口一动不动。用户看到的就是「点了没反应」。顺带 `mBind` 那行占位也被跳过，会残留上一个人的绑定关系文本。

**改动（纯前端，不需要重传云函数）**
1. 把历史表格渲染拆成 `renderHist()`；新增 `loadHist(m)` 按需拉：
   走**已部署的** `adminMembers {q: uid}`（它的返回里带 `history`，且支持按 uid 精确匹配），
   不必为这一行去改云函数再让用户传一次包。
2. `openDetail()` 去掉早退：无论有没有历史，都先 `scrollIntoView`，再异步填历史；
   `mBind` 占位无条件重置。
3. `plugin-admin.html` 版本标识 v625 → **v626**；`sw.js` → `v626-admin-detail-fix`；`index.html` 的
   `style-01.css?v=` 同步（发布纪律 §26.7）。

**验证**
- 探针（修复后）：点击 → `hidden:false / top:53 / h:702 / scrollY:2295 / inViewport:true`，
  历史懒加载出 **2 行**，`mBind` 占位已重置，**JS 异常 0**。
- 单测 **54/54**（新增 3 条：`openDetail` 到 `scrollIntoView` 之间不得出现 `return` /
  `loadHist` 必须走 `adminMembers` / `mBind` 占位必须重置）；`--test` **154/154**；`ci_check_static` **PASS=29**；`check_publish_refs` PASS。
- 断言写法教训：一开始用正则查旧代码字符串，结果**被我自己写在注释里的同一段代码**命中 —— 改成
  切片取 `openDetail` 函数体再查 `\breturn\b`，才对得上「行为」而不是「文本」。

### 26.24 v627-diagram-fit：三级管线简图 / 系统图「不能全部显示」（2026-10-20）

**用户提问**（截图，红箭头指向图纸右下角）：线上版本「三级管线简图不能全部显示出来，系统图同样也是」。

**复现与定位**（`_probe_tl_fit.mjs`，Edge headless + CDP + 本地静态服务，沿用 `_probe_tl_skin.mjs` 骨架）
量 `#tlDiagramContent` 及其祖先链的 rect / computed style，喂一幅 528×237 地块后生成图。实测 1400×620 窗口：

| 节点 | 高度 | 结论 |
|---|---|---|
| `#tlPipePlanSection` | 553 | ✅ 正好 = 620 − 导航 − 1 − 状态栏 |
| `.pp-stage` | 553 | ✅ |
| `#tlDiagramWrap`（`.pp-diagram-wrap`） | **818** | ❌ 溢出父级 265px |
| `#tlDiagramContent` | **818** | ❌ 跟着内容走 |
| 内部 `svg` | 802 | 被 `main{overflow:hidden}` 裁掉底部 |

**根因（两个叠加）**
1. **高度链断了**：视图切换在 `.pp-stage` 与 `.pp-diagram-wrap` 之间插了一层 `.ry-pane`
   （`index.html` 现结构是 `.pp-stage > .ry-pane-pipe > #tlDiagramWrap`），而 style-01.css 里那条
   `#tlPipePlanSection .pp-stage>.pp-diagram-wrap{...min-height:0}` 写的还是**直接子节点**路径 ⇒ 匹配不到。
   图纸卡于是退回 `min-height:auto`，作为 flex 列的子项**不能缩到内容以下** ⇒ 被内容撑高。
2. **SVG 只受宽度约束**：`#tlDiagramContent svg{width:100%;height:auto}`，宽扁窗口下按宽度算出的高度
   必然超过可用高度 ⇒ 溢出。

**修法**
1. `mod/style-01.css` 补 `.pp-stage>.ry-pane>.pp-diagram-wrap` 路径（含 `#ryCadSide` 克隆那一路），
   `margin:0;flex:1 1 auto;min-height:0;display:flex;flex-direction:column;overflow:hidden`。
   多一个 class ⇒ 特异性 (1,2,0) 压过 `#tlPipePlanSection .pp-diagram-wrap{margin:20px 0;border:...}` 的 (1,1,0)。
2. `body.ry-tool #tlDiagramContent > svg`（含 `#ppDiagramContent`）加 `height:100%;max-height:100%` ——
   宽高都取容器尺寸，配合 viewBox 默认 `preserveAspectRatio="xMidYMid meet"` 自动等比缩放居中。
   容器高度仍为 auto 时 `height:100%` 解析成 auto，**退化为原行为**，不会把图压扁。
3. 系统图视图容器 `#tlSysDiagramContent` 由 `overflow:hidden` 改 **`auto`**：该视图里除 iframe（首部系统图）
   之外下方还叠着「三级管线施工简图」图框 `#tlSysPipeBox`（约 1000px 高），hidden 会把它整块裁掉
   **且没有滚动条**，用户完全够不到。改 auto 后系统图仍按容器等比适配，往下滚可见图框。
4. `#tlSysPipeBoxBody svg{max-width:100%;height:auto;display:block}` 防止克隆 SVG 横向撑破。

**验证（实机量测，不是目测）**
- 1400×620：`#tlDiagramContent` 553、`scrollH==clientH`、`svg 537`、`svgClippedV=false`、`gapBottom=8`。
- 1920×1080 / 1280×800 / 1600×700 / 1400×620 四档窗口：一律 `vOver=0`、`svgClippedV=false`。
- 系统图：`#tlSysDiagramContent` 539（`overflowY:auto`、`scrollH 1637` 可滚到图框）；
  **iframe 内部** `docScrollH == docClientH == 539`、`vOver=0` ⇒ A3 图幅整张可见（`ryFitEmbedSheet` 生效）。
- 截图肉眼复核：`C:/tmp/tl_fit_pipe2.png`（A3 图框上下边框、1区~9区、528m/217m 标注、底部参数行与图例全在）、
  `C:/tmp/tl_fit_sys.png`（系统图整张：标题栏、流程图、图例、设备表、设计说明、图签全在）。
- 新增 `tests/diagram_fit.test.cjs`（5 项：三张图纸卡的父节点必须是 `.ry-pane` / 高度链规则按真实路径存在 /
  SVG 需 `height:100%` / 系统图容器不得 hidden / 克隆 SVG 不得撑破）。
  **这类 bug 的共性就是「DOM 多一层、选择器没跟上」，所以把结构 × 样式锁在一起，改层级不配套就立刻红。**
- 闸门：`--test` **155/155**、`ci_check_static` **PASS=29**、`check_publish_refs` PASS、`entitle_flow` 54/54。

**发布（2026-10-20 15:52）**
- 提交 `e3c3b44`（5 文件：`mod/style-01.css` / `index.html` / `sw.js` / `tests/diagram_fit.test.cjs` / 本文档），
  推送 `eaadf61..e3c3b44`。**`tests/*` 在 .gitignore 里（第 82 行），新测试要用 `git add -f`** ——
  已入库的 42 个测试文件都是这么来的。
- 推送时又遇上 `CONNECT tunnel failed, response 502`（第一次），第二次 `HTTP/1.1` 成功。**重试即可，不要改远端**。
- 线上核对：`sw.js` → `v627-diagram-fit`；`index.html` → `style-01.css?v=627-diagram-fit`；
  线上 `mod/style-01.css` 含 `pp-stage>.ry-pane>.pp-diagram-wrap`（2 处：本页 + #ryCadSide）与
  `max-height:100%}`（SVG 规则）；线上冒烟 **27/27**。
- 探针 `_probe_tl_fit.mjs` **不随仓库提交**（本仓库 60+ 个 `_probe_*.mjs` 都是本地工具）；
  需要复跑就 `node _probe_tl_fit.mjs`，可加 `VW/VH/INJECT/SHOT/SHOT2` 环境变量。

### 26.25 v628-cloud-sdk-precache：后台「CloudBase 初始化失败」的真正原因（2026-10-20）

**用户提问**（截图）：「后台链接失败，应该是哪里有了问题」——服务状态显示
「后台连接失败：CloudBase 初始化失败」，页面本身能打开（界面 v626）。

**先排除误判**
- 线上 `pwa/vendor/cloudbase-js-sdk-3.8.2.bundle.js` → HTTP 200、787218 字节；`cloud-sync.js` 也 200。
- 本机起静态服务打开 `plugin-admin.html`：`typeof cloudbase === 'object'`、`CloudSync.init()` → **`{ok:true}`**
  ⇒ **代码路径没问题，是浏览器那一侧没拿到 SDK**。
- 时间线也对得上：15:26（v625）后台还正常（截图有统计），15:40 发 v626、15:52 发 v627，15:54 就报错。

**根因（三段串起来才致命）**
1. `pwa/vendor/cloudbase-js-sdk-3.8.2.bundle.js`（787KB）**不在 CORE 白名单**里
   （CORE 只有 leaflet / epanet / images），所以它只会走「被请求时才落盘」的 RUNTIME 缓存。
2. `RUNTIME_CACHE = PREFIX + VERSION + '-runtime'` 是**版本作用域**，而 `activate` 会把
   `PREFIX*` 里除当前 CORE/RUNTIME 之外的缓存全删 ⇒ **每发一个版本，这 787KB 就被清空**，
   下次打开必须重新从 GitHub Pages 拉一遍。
3. `cloud-sync.js` 的 `cloudInit()` **只等 10 秒**就判 `sdk_not_loaded`。
   ⇒ 网络稍慢（国内访问 Pages 很常见）必然失败，而且**发版越勤越容易踩**——我今天 30 分钟内发了 3 版。

**为什么没把 SDK 塞进 CORE**：CORE 的 install 是原子 `addAll`，塞一个 787KB 进去会明显抬高
「一次失败就整包不更新」的概率——那会让以后所有修复都发不出去，代价太大。

**改动**
1. `sw.js`
   - 新增**版本无关**的 `VENDOR_CACHE = PREFIX + 'vendor'`，`VENDOR = ['pwa/vendor/cloudbase-js-sdk-3.8.2.bundle.js']`；
   - `activate` 删除旧缓存时**排除 VENDOR_CACHE**（这是「跨版本保留」的关键一行）；
   - `install` 在 `skipWaiting()` **之后**补大件，且**缓存已有就跳过**（第一版写成 `addAll` +
     `cache:'reload'`，等于每版照旧重下 787KB，等于没优化——已改掉），整体 try/catch 不影响 SW 更新；
   - `fetch` 对 VENDOR 走**缓存优先**，且分支排在通用 `local()`（网络优先）之前。
2. `cloud-sync.js`：SDK 就绪 deadline **10 秒 → 20 秒**（兜底冷启动；正常情况已是毫秒级命中缓存）。
3. `plugin-admin.html`：失败时摊开 `window._cloudLastError` 的真实原因（`sdk_not_loaded` /
   `init_failed` / `no_access_key` 各给一句可操作的话）+ **「重新连接」按钮**；
   重试时若 `typeof cloudbase === 'undefined'` 会**重新挂一次 script**（SW 缓存优先 ⇒ 一般立刻命中）。

**验证（实机，`_probe_sw_vendor.mjs`）**
- 装 SW 后 `caches.keys()` = `["runye-pwa-/-v628-cloud-sdk-precache-core","runye-pwa-/-vendor"]`，
  vendor 里有 `cloudbase-js-sdk-3.8.2.bundle.js`；
- 页面侧该资源 `transferSize: 0`（来自缓存），**把本地服务器关掉再重载，`typeof cloudbase` 仍是 object**
  ⇒ 确实由 SW 缓存供给。
- **跨版本保留实测**：同一浏览器 profile 先把版本从 v628 改成 v629 再跑 →
  `caches` 变成 `["runye-pwa-/-vendor","runye-pwa-/-v629-bump-sim-core"]`（旧 core 被删、**vendor 留住**），
  SDK 仍 `transferSize: 0`、断网仍可加载。**这正是旧版做不到的事**。
- 失败 UX：用 `FAKE_FAIL=1` 注入「init 永远失败」的假 CloudSync →
  服务状态「后台连接失败：CloudBase 初始化失败」+ 原因提示 + 「重新连接」按钮可见。
- 新增 `tests/sw_vendor_cache.test.cjs`（7 组契约：VENDOR 名字不含 VERSION / activate 不删 /
  install 用「没有才下载」/ 不用 addAll / 大件缓存优先且排在 local 之前 / deadline ≥ 20s / 后台有重试按钮）。
- 闸门：`--test` **156/156**、`ci_check_static` **PASS=29**、`check_publish_refs` PASS。

**发布（2026-10-20 16:08）**
- 提交 `443dc5e`（7 文件：`sw.js` / `cloud-sync.js` / `plugin-admin.html` / `index.html` / `invite.html` /
  `tests/sw_vendor_cache.test.cjs` / 本文档），推送 `1d3a2c9..443dc5e`。
- 版本口径：`sw.js` = `v628-cloud-sdk-precache`，`index.html` 的 `style-01.css?v=` 同步；
  `cloud-sync.js?v=371b → 371c`（三个页面 index / invite / plugin-admin 都改了）。
- 线上核对：`sw.js` 含 `VENDOR_CACHE`(5 处) 与 `name !== VENDOR_CACHE`(1 处)；
  `cloud-sync.js?v=371c` 含 `Date.now() + 20000`；`plugin-admin.html` 有 `id="retryBtn"` 且「界面 v628」；
  线上冒烟 **27/27**。
- **用户侧要发生一次「一次性下载」**：新的 SW 装好后才会把 787KB 放进 `-vendor` 缓存。
  建议顺序：先打开主程序（index.html）让 SW 装好 → 再开后台。之后每次发版都不再重复下载。
  若首屏仍报错，点后台新增的「重新连接」；仍不行再 Ctrl+F5。






### 26.26 v629-pp-view-fit：「地块分区只显示一半」的真正原因（不是 CSS 嵌套）（2026-10-20）

**用户口径**：「这个面板的问题 一直没解决，让你改了好几次都没解决，地块分区怎么就显示一半呢？
是不是又出现了多层覆盖/嵌套的情况」。

**先纠正自己的方向**：用户猜「多层覆盖/嵌套」，我前几轮也顺着这条线查，但
**v627 修的是三级 SVG 图纸卡的高度链**（`.pp-stage>.ry-pane>.pp-diagram-wrap`），
跟二级画布根本不是一回事 —— 二级「地块分区」的图是 `<canvas id="ppCanvas">`，
canvas 里的线被切与 CSS 的 `overflow` / `min-height` **无关**，是**视图变换**把图挪出了画布。

**根因（三件叠加，全是纯 JS 状态问题）**
1. `ppUpdateTransform()` 的比例是写死的：`var s = 0.5 * ppState.zoom;`（1px=2m × zoom），
   全文**没有一句**「内容是否装得下画布」的判断；
2. `zoom / panX / panY` 被 `ppGetState()` / `ppSetState()` **存进地块存档**（云端 per-plot）⇒
   在做图区滚一次滚轮（`deltaY` 一次 ±10%，`ppState.zoom` 上不封顶到 10）就被**永久记住**；
   用户截图右下角那个「缩放 347%」就是它 —— 之后每次打开这个地块都只看到一角；
3. `ppResize()` 只按容器重设画布像素尺寸，重算变换时**仍然沿用那个 zoom**。

**怎么证实的（`_probe_pp_ink.mjs`，新写，读 canvas 像素算墨迹包围盒）**
- 手法：`getImageData` 扫非底色像素求 bbox，与 `canvas.width/height`、`transform` 期望内容矩形对照；
  `ink.touchesBottom/touchesTop` 为真 = 内容被 canvas 自己裁掉。
- 修复前 `VW=1086 VH=581 ZOOM=3.47`：期望内容高 **411px** > 画布可用高，`gapTop=0`、`gapBottom=0`，
  上下各切一刀 —— 与用户截图完全一致。
- 同一窗口修复后：zoom 被夹到 **2.68**，内容 `708×318` 装进 `1082×418`，`gapTop=50`、无一条边被切。

**修法（只收口「视图状态」，绘制 / 分区 / 水力 / 材料一行未动）** — `mod/plot-editor.js`
- 新增 `ppContentSize()`（scale=1 时内容多大）/ `ppFitScale()`（装进画布需要的比例）/
  `ppClampViewToFit()` / `ppFitView()` / `ppIsViewClipped()` / `ppSyncFitBtn()`；
- `ppResize()`：量完画布尺寸 → **先 `ppClampViewToFit()` 再 `ppUpdateTransform()`**（顺序不能反：
  变换是按 `ppCanvas.width/height` 算的）；
- `ppLoadPolygon()` 也收口一次 ⇒ 存档里存着 347% 的地块一打开就是整幅，不用等下一次 resize；
- **只缩不放**：只在 `s > sfit*1.001` 时才退比例，用户主动放大不会被无条件改掉；
- **平移一并收口**：内容整幅装得下时 `panX/panY` 归零（平移量同样进存档，拖歪一次会永久偏出去）；
  放大态下的平移是合理操作，不清；
- `ppSized` 闸门（自己踩的坑）：`<canvas>` 出厂默认 `300×150`，初始化时 `ppResize` 在「本页未激活」会
  return，`ppLoadPolygon` 拿到的是 300×150 ⇒ 按它算「装得下」会把正常比例**永久压到 42%**。
  故只有量到 >60px 才允许收口；
- 滚轮处理器**故意不调用**收口（`wheel` 走 `ppUpdateTransform`），否则滚轮永远放不大；
- 重绘出口包了一层：`var ppRenderBase=ppRender; ppRender=function(){ ppRenderBase.apply(...); ppSyncFitBtn(); }`，
  保证分区旋转 / 重新分区 / 回退之后胶囊状态跟着变。

**新增出口按钮**：`#ppFitViewBtn`（画布内绝对定位胶囊「⤢ 适应窗口」，`mod/style-01.css` 的 `.pp-fitview`）。
默认 `display:none`，只有 `ppIsViewClipped()` 为真（图上一定有线条被切）才加 `.is-on`；
放在 `#ppCanvasWrap` 里 ⇒ 不占版面高度、不进 `.ry-pane-edit` 网格，不会引出新的「多一层」问题。
实测：滚轮 25 次 → zoom 10、`clipped:true`、胶囊亮起且在画布内（1400×620：x=1303,y=499,86×24）→
点一下 → `zoom 3.527`、`clipped:false`、胶囊自动收起。

**契约测试**：`tests/pp_view_fit.test.cjs`（15 项）——收口函数齐全 / `ppResize` 里 clamp 必须在
`ppUpdateTransform` 之前 / `ppLoadPolygon` 也收口 / 只缩不放的区间顺序 / `ppSized` 闸门 /
**wheel 里不许出现 clamp** / 胶囊 DOM 在画布容器内 + 默认隐藏 + `is-on` 才显示 / 重绘出口包了一层 /
点击走 `ppFitView()`。

**闸门**：`node --test tests/*.test.cjs` **157/157**、`ci_check_static` PASS=29、`check_publish_refs` PASS。
**版本口径**：`sw.js` = `v630-fitview-radius`（v629 首次发布后冒烟发现 `border-radius:12px` 撞 v530 检查，删死声明并抬版本），`style-01.css?v=` / `plot-editor.js?v=` 同步（后者原停在
`612-flat-radius`，这次一并抬）。

### 26.27 v631-cred-pick：后台「没有管理权限」＝读到了匿名会话的 UID（2026-10-20）

**用户口径**：「似乎还是不行，当前账号没有管理权限」（截图：服务已连接 ·
当前账号没有管理权限 · 当前账号 UID：`ROg2duHzXTK-5LmGCdsww`）。

**先认身份**：那个 UID 不是会员账号。本机实测（`_probe_cred.mjs` 在线上环境真跑一次匿名登录）：

| 身份 | JWT `sub` 形态 | 例 |
|---|---|---|
| CloudBase **匿名会话** | 21 位随机串，`is_anonymous: true`，`name: "Anonymous"` | `wbZ7_O-4FTzLdBQL920TVQ` |
| 会员（手机号登录） | 19 位数字 | `2089630534341758976`（= `RY_PLUGIN_ADMIN_UIDS` 里登记的那个） |

⇒ 后台把匿名 uid 拿去和白名单比，永远不匹配。**匿名 uid 每次/每设备都不同，加进白名单也没用。**

**两处代码缺陷（都实测坐实）**
1. `cloudAuthSub()` / `cloudAuthToken()` 只按 localStorage 顺序取「第一颗 `sub !== 'anon'`」的凭据，
   **从不看 `payload.is_anonymous`**。本机注入两颗凭据（先匿名、后会员）实测：
   `authSub()` 返回匿名 sub，会员凭据就在旁边却没用上 ⇒ 后台无权限，
   而且 `/entitle` 的写操作（领奖/绑定/权益）会被记到匿名 uid 名下。
2. `cloudEnsureAnon()` 不看有没有已持久化的会话，直接 `signInAnonymously()`；
   而主程序每次启动都先走这一步（`runye-member-ui.js` boot：`ensureAnon()` → `en.init()`）
   ⇒ 手机号登录得到的会员会话会被一次匿名登录顶掉（这正是「以前能管、现在突然不能管」的成因）。

**修法**（`cloud-sync.js`）
- 新增 `cloudDecodeJwt` / `cloudReadCreds` / `cloudPickCred`：**会员优先、匿名兜底**；
  `authSub` 与 `authToken` 共用同一次择取（不再靠 `payload.sub === authSub()` 回找，
  authSub 一旦挑错就整组错）；
- `cloudEnsureAnon()`：先 `cloudRestore()`，**有会话就 return true，绝不匿名登录**；没有才建匿名会话；
- 新增 `CloudSync.authInfo()`：`{sub, anon, key, creds, members, memberSub}`，供后台/诊断一眼看穿身份。

**后台（`plugin-admin.html`，界面 v631）**：新增 `readIdent()/identTag()/applyAdminState()`。
- 账号行变成 `当前账号 UID：xxx（会员账号 / 匿名会话）`；
- 匿名态的服务状态直接写「**当前是匿名身份，不是会员账号（无管理权限）**」，并在说明里写明
  「把这个 UID 加进 `RY_PLUGIN_ADMIN_UIDS` 也不会生效」，同时给「回主程序」链接让用户去登录；
- 非匿名但仍无权限时，才提示「把上面的 UID 登记到环境变量（改完需重启/重建云函数实例）」。

**契约测试**：`tests/cred_pick.test.cjs`（17 项，**行为级**）——把 `cloudPickCred/authSub/authToken/authInfo`
抠出来塞进 vm + 假 localStorage 真跑：匿名在前→必须挑会员、authToken 与 authSub 同源、
只剩匿名→退回匿名但 `authInfo().anon=true`、坏凭据不抛、`ensureAnon` 里 `signInAnonymously` 必须排在
`cloudRestore()` 之后（**先剥注释再比顺序**，第一版就是被说明文字骗了）。
闸门：`--test` **158/158**、`ci_check_static` PASS=29、`check_publish_refs` PASS。

**版本口径**：`sw.js` = `v631-cred-pick`；`style-01.css?v=` 同步（未改样式，但契约要求与 SW 同值）；
`cloud-sync.js?v=371c → 631-cred-pick`（index / invite / plugin-admin 三处）。

**用户侧还要做一步**：回主程序用**手机号登录一次**（把会员会话重新建立起来）。
登录后后台会显示 19 位 UID（`2089…`）—— 那个才是白名单里登记过的身份，管理权限随即恢复。

### 26.28 v632-login-deeplink：把「匿名态 → 登录 → 回后台」接成一条路（2026-10-20）

**v631 上线后用户仍然反馈同一张截图**（刷新后还是同一个匿名 uid）。说明问题不在代码判身份，
在**路走不通**：v631 的提示写的是「请先回主程序用手机号登录」，但主程序的登录框**藏在右上角会员胶囊
的弹层里**——用户点进主程序，看到的是一个能用的工具页，找不到登录入口，就退回来了。

**修法（深链闭环）**
1. `runye-member-ui.js` 新增两个小函数：
   - `qsVal(name)`：读查询串（`?login=1` / `?back=...`）；
   - `backTarget()`：只放行**站内相对 `.html`**（`/^[A-Za-z0-9._\-\/]+\.html(\?[^#]*)?$/` 且不含 `//`），
     挡掉 `//evil.com`、`http(s)://`、`javascript:` 这类开放重定向。
2. boot 末尾（权益拉完、胶囊渲染完之后）：`if (qsVal('login') === '1') RyMemberUI.openPanel();`
   ⇒ 从后台点过来，**落地就是手机号输入框**，不用先找胶囊。
3. `doLogin` 成功回调里：`var back = backTarget(); if (back) setTimeout(… location.replace(back), 900);`
   ⇒ 登录完成自动回 `plugin-admin.html`，后台按新会话重新判权限。
4. `plugin-admin.html` 匿名态那句话从「回主程序」改成按钮直链
   `index.html?login=1&back=plugin-admin.html`（「去主程序用手机号登录 →」+「登录成功后会自动回到本页」）。

**为什么用 `location.replace` 而不是 `location.href`**：登录页是一次性中转，不该留在历史里，
否则用户按返回又回到登录框（而那时已经登录成功，看起来像"没生效"）。

**契约测试**：`tests/cred_pick.test.cjs` 追加 **7 项**——`qsVal/backTarget` 存在、`backTarget` 有白名单正则、
放行 `plugin-admin.html` / 拦掉 `//evil.com` 与 `http://`、boot 里 `?login=1` 必须调 `openPanel`、
`doLogin` 成功路径必须 `location.replace(backTarget())`、后台匿名态链接必须带 `login=1` 和 `back=`。

**版本口径**：`sw.js` = `v632-login-deeplink`；`style-01.css?v=` 同步（同值契约）；
`runye-member-ui.js?v=632-login-deeplink`（在 CORE 缓存里，必须抬版本才刷得动）。

**这一条之后用户的操作**：后台点一次按钮 → 输入手机号 + 验证码 → 自动回后台，
账号行显示 19 位 UID 且带「（会员账号）」字样，管理权限恢复。**只需要做这一次**。
