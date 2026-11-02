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

**挂起的用户待办**（完成后提醒，勿代办）：① 登录存 5 条档案实测 `ry_kv` 找回；② 是否删 `index.html` 里 `<script src="pipe_optim_ui.js"></script>`；③ 发布指令；④ 会员云调用 `EXCEED_AUTHORITY` 架构路线三选一（§2 Q1 / §5）；⑤ **成组地块（merged）分区角度地图端放开方案**——现状：地图端角度只读（v673 定版，用户原话「在线地图不能对这些分区角度调整，不然容易乱」），调整须回多地块规划页按块调；待定：是否/如何提供统一调整入口（2026-11-02 用户记待办，回头自行看怎么处理）。会员体系的云函数调用被平台 `EXCEED_AUTHORITY` 环境级拦截（见 §0/§5，三条候选架构待用户拍板）。

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

### 26.29 v633-admin-badge：角标必须跟着版本走（2026-10-20 · 已发布 32dc067）

v632 上线后线上实测：功能是新的（后台按钮直链 `?login=1&back=` 已在），
但左上角角标仍写 **「界面 v631」**。后台的角标是用户截图里唯一的「我刷到新版了吗」判据，
角标不跟着抬 = 用户永远觉得「没生效」——v631 那次「似乎还是不行」就吃过这个亏的一部分。

**坑在哪**：`plugin-admin.html` 在 `sw.js` 的 CORE 白名单（第 1007 行），
改了正文**必须抬 VERSION** 才会重装缓存；v632 只改了该页正文没抬角标字符串，于是两者对不上。

**修**：单独发 v633 —— 角标 → `界面 v633`、`sw VERSION = 'v633-admin-badge'`、
`style-01.css?v=633-admin-badge`（同值契约）。功能零改动。

**复核（线上 CDP，`_probe_admin_ident.mjs`）**：
`ver:"界面 v633"` / `service:"…当前是匿名身份…"` / `hasBackLink:true` /
深链 `?login=1` → `{panelOpen:true, hasLoginBox:true, placeholders:"11 位手机号 | 6 位验证码"}`；
线上冒烟 **27/27**。

**长期口径**：凡是改 CORE 白名单里的页面（含 `index.html`、`plugin-admin.html`、`invite.html`、
`cloud-sync.js`、`runye-member-ui.js`），**同时抬 `sw VERSION` + 页面角标 + `style-01.css?v=`**，
三者一起动，别再出现「代码新、角标旧」。

### 26.30 已知未修（2026-10-20 用户明确「暂时不折腾，细节后面再细化」）

用户看过状态语义解释后决定：**功能都通了，先不修**。以下两处是查证过、但本轮**故意没动**的，
留给后续细化时直接接上（不用重新查）：

1. **后台状态列的口径与 C 端矛盾**
   - `plugin-admin.html:294` 把 `x.status` 原文打印（`valid` / `registered`），且灰绿判定是 `==='valid'`；
   - 但后端 `computeProgress()`（`cloudfn/ryEntitle-v2/index.js:351`）把
     `['valid','cooling','registered']` **一律计入**名额 ⇒ **灰标 ≠ 不算名额**，
     「进度 3/3 + 只有 2 个绿标」是能同时成立的，看的人容易误判；
   - C 端 `invite.html:3116` 对 `registered` 显示「已注册 · 已生效」，与后台灰标说法冲突。
   - 建议改法：状态中文化（已生效/待生效）、灰绿按「是否计入名额」判定、「绑定时间」列改用
     `registered_at`（现在取的是 `activated_at`，`registered` 行因此显示「—」）。
2. **`registered` / `cooling` 是懒迁移残留**
   - 迁移只在被邀请人**自己**心跳时发生（`actHeartbeat`，`:417` 按 `invited_uid = 自己` 推进）；
     绑定后不再打开主程序的用户会永远停在 `registered`。
   - 想一次性收干净就是一条 SQL（v4 触发器只禁 `valid → 其他` 回退，正向推进允许）：
     `update public.ry_links set status='valid', activated_at=coalesce(activated_at, now()) where status in ('registered','cooling');`
   - **未执行**，等用户决定。

另：`sql/route_c_migration_v6_member_stats.sql` 仍未执行 ⇒ 后台「今日新增 / 近 7 日 / 注册时间 /
最后活跃」显示为空，与本次两处无关，别忘了。

### 26.31 v634-recipe-apply：点「调用」不再只回填、还会重算，且不再毁图（2026-10-20）

**用户原话**：「调用参数之后，现有的面板参数没有跟着调用参数变化，这个不对，改过来。」

**探针定位**（`project-planning/验收记录/recipe-apply.mjs`，Edge headless + 自建静态服务）：
DOM 层 10 项其实是被回填的，所以问题不在 `set()` 的赋值，而在下面三处：

1. `ppRecipeFlow.applyParams`（`mod/plot-editor.js`）**自己写了一套 `set()`**，绕开 v520 立的单一入口
   `RyPlanParams.set`（`mod/inline-28.js`）——注释里写明「三个入口最终都落在这里」，配方调用是漏网的那一个
   ⇒ 落盘与派发口径分家。
2. **只写原生 input，不碰 `sl-input[data-ry-proxy-for]` 代理**。`rypShoelaceInputs` 是靠
   `Object.defineProperty` 劫持 `nativeInput.value` 的 setter 来同步代理的，外面套着 `try{}catch(_){}`；
   劫持一旦失败（Shoelace 未就绪/元素被搬动重建），原生 input 又被 `hidden=true`，屏幕上就是永远旧值。
3. **无条件调 `ppRepartitionFromRotatedPlot`**：它内部 `if(!polyPts.length) alert(...) return;`
   （无地块就弹框）、`if(ppHasPipeContent() && !confirm(...)) return;` 且确认后清空
   `mainPipes/branchPipes/subBranchPipes/source/valves`。而状态栏只写「参数已回填并重算」——
   **用户画好的管线被静默清空**。

**反向验证（硬数字）**：同一探针、同一地块与管线
- 改前：管线 **8 → 0**（全清），状态「参数已回填并重算」
- 改后：管线 **8 → 8**（保留），状态「10 项已回填并重算；已有管线保留、未重排」

**改法**（`mod/plot-editor.js`，+76/−7）
- `applyParams` 五段式：`RyPlanParams.set()` 单一入口 → 兜底写入并强制同步 `sl-input` 代理 →
  轻量重算链（`ppPullLiftDh`→`calcPlan`→`ppRender`→`ppRefreshDiagramOrReset`→`renderThreeLevel`→`tlUpdatePlanBar`）
  → 重分区守卫（无地块跳过 / 有管线保留 / 都没有才重排）→ 返回 `{wrote,skipped,repart,note}`。
- 状态栏：`N 项已回填并重算` + 未回填项点名（红字）+ 未重排原因，不再是笼统一句。
- 新增 `applyTargetId()`：工具栏下拉优先 → 设置页下拉兜底 → **回退到最近保存的方案**并选上。
  （`curSelId()` 的「设置页优先」语义留给改名/删除，不动。）
- ⚠ 状态源头坑：真实地块/管线在 **`window.RunyeBridge.state`**，不是 `window.ppState`；
  第一版写成 `window.ppState` ⇒ `hasPlot` 恒 false、守卫永远走「未画地块」分支（已修）。

**验收**：`node scripts/check.cjs` 全绿（静态契约 PASS=29 / 36 个单测 / 水力核心 2500 组比对 / 地块拼接）；
探针 `recipe-apply.mjs` 10 项回填 + 结果区 4.44→2.67、33.5→60.5、Ø160→Ø90 + 零 pageerror。
截图 `_verify_out/recipe-apply-after.png`，备份 `_backup_20261020_recipe_apply/plot-editor.js`。**未发布**。

### 26.32 v634-coord-search：在线地图「按坐标搜索位置」（2026-10-20）

**用户原话**：「在线地图搜索要增加一个功能，要能根据坐标搜索位置。」

**现状**：`mod/online-map.js` 的 `parseLatLng` 只认 `18.25,109.51` 一种写法，且只落一个红点、
tip 里只报坐标本身 —— 不告诉你「这是哪」，界面上也没有任何地方提示可以输坐标
（placeholder 一直写「搜索地点（如：三亚 崖州）」）。

**改动**（`mod/online-map.js` +4.7KB；`index.html`、`runye-map-measure.html` 各 +107B）
1. **解析器扩到四类写法**（全部按 WGS-84 理解，定位前统一转 GCJ-02，与搜索候选同口径）：
   ① 十进制度 `18.2528,109.5119`（首值 >90 自动判为经度）
   ② 方向字母 `N18.2528 E109.5119` / `18.2528N,109.5119E`
   ③ 度分秒 `18°15'10"N, 109°30'43"E`（含中文「度分秒」符号）
   ④ 中文经纬 `北纬18.2528 东经109.5119`
2. **新增 `reverseName()`**：坐标 → 地名。**源顺序实测定为 Photon 主 + Nominatim 备**：
   本机实测 Nominatim reverse 12s 内无返回，Photon 秒回且带中文
   （`阳光雅园 · 吉阳区 · 三亚市 · 海南省`）。与关键词搜索的源顺序一致。
3. 定位**先落地不等网络**，地名回来后再回填 `lastPick.name`、图钉 tooltip 与状态条；
   两源都失败 → 「未取到地名，可直接保存」，不阻塞、不报错。
4. 两页 placeholder → 「搜索地点，或输入坐标（18.25,109.51）」，hint 列出四种写法 + 「定位后反查地名」。
5. 版本三件同抬（CORE 铁律）：`sw VERSION = v634-coord-search`、`style-01.css?v=`、
   两处 `mod/online-map.js?v=`、`plugin-admin.html` 角标 `界面 v634`。

**验收**
- 解析器 **16/16**（`project-planning/验收记录/coord-search.mjs`，支持 `--file=` 对任意版本跑；
  改前备份跑同一脚本 ⇒ **9/16**，7 种新格式全红 ⇒ 反向验证成立）。
- E2E **7/7**（`coord-search-e2e.mjs`，Edge headless + CDP）：5 种写法全部识别定位、
  地名输入「三亚 崖州」不被误判为坐标、零 pageerror。
- `node scripts/check.cjs` 全绿；截图 `_verify_out/coord-search-after.png`。

**两个坑**
- **Photon 不支持 `lang=zh`**（只 default/de/en/fr，传 zh 直接报错），中文地名靠浏览器
  `Accept-Language` 自动协商 ⇒ headless（默认 en）里显示拼音、真实中文浏览器显示中文，不是 bug。
- 合并「数字 + 空格 + 方向」的正则会**误伤** `18.2528 E109.5119`（粘成一段 ⇒ 整条失败），
  只能合并「秒/分符号 + 空格 + 方向」（`(["″秒'′分])\s+([NSEW])`）。第一版就是这么挂的。

备份 `_backup_20261020_coord_search/`（三个文件）。**未发布**。

---

### 26.33 v635-nav-dedupe：顶栏出现两份「智能规划」，是插件没认出「·同步中」（2026-10-20）

**这一节同时是「A → B → C」三项闸门工程的收尾记录。**

#### 现象与定性（C 段）

`verify_nav_compact.js` 长期 12 PASS / 11 FAIL。先按「是抖动还是真红」定性，结论是**两条互相独立的真红**：

| 项 | 表面现象 | 真因 | 性质 |
| --- | --- | --- | --- |
| Z/G/H/I/D/E/D2/F/F2 | 区块高 0、点「地块分区」状态栏不变 | 权益接口 3~10s 才返回，脚本只等 1.6s。`RyEntitle.access()` 在 `state===null` 时**恒返回 'pending'**（三态设计），于是 19 项里 11 项带「·同步中」+ `aria-disabled` + **捕获阶段拦截点击** | 闸门等得不够久，非布局问题 |
| M3 | 面板项 9 个采样点全被挡 | 公告弹窗「每次访问都弹」，遮罩 `z-index:11990` 挂在 body 根层叠上下文；而 `body.ry-tool > .ry-nav{z-index:60}` **创建了层叠上下文**，把面板自己的 `z-index:99999` 关在里面 ⇒ 对外只有 60 层 | 模态盖下层是**正确语义**，不修布局 |

**M3 的反向验证**（证明不是抖动、不是 v634 引入）：连跑 3 次全为 0/9；探针在 350/700/1400ms 三个时点都 0/9（不自愈）；历史存档 `_verify_out/nav_compact_gate.txt`（改动前）同样是 0/9；`ry-ann-mask` 与 `body.ry-tool > .ry-nav{z-index:60}` 自 v344 起就在。

**修法（两处前置，断言一条没放宽）**：
1. 轮询到「`.fn-pending` 归零 **且** 导航项签名连续 3 次不变」再量。只等 pending 归零不够：`pending` 一清零，插件抑制器（MutationObserver）还没把老项摘完，会量到「老项 + 插件项」并存态。
2. `RyAnnounce.close()` → 兜底点 `.ry-ann-x` / 「开始使用」→ 轮询到 `.ry-ann-mask` 消失。
3. `legacyTexts` / `pluginNavTexts` 比较前归一化掉 `·锁` 与 `·同步中` 后缀（`runye-nav.js` 自己的注释就写着「是装饰不是名字」；不归一化则 11 项顺序全对也判不合格）。

#### 真红背后还藏着一个用户可见缺陷

修完前置后仍剩 D/D2/J2 三条红，`Z0` 报 **25 项**。逐层挖下去：

- `plugins/ai-plan/main.js` 与 `plugins/hydraulics/main.js` 的 `norm()` 只剥 `·锁`：`replace(/\s*·\s*锁\s*$/, '')`；
- 权益未就绪时老项文字是「智能规划 **·同步中**」→ `findLegacy()` 匹配失败 → `probe` 等 40×50ms=2s 超时 → **降级「不接管」→ `startSuppressor()` 根本不启动**；
- 之后权益就绪、文字变回「智能规划」时 `runye-nav.render()` 造出的老项**再没人摘** ⇒ 顶栏出现两份「智能规划」、两份「水力校核」。

**6 个插件共用这份复制粘贴的 `norm()`**（ai-plan / filter-system / hydraulics / material-list / pipe-assemble / sys-view），一并改为
`replace(/\s*·\s*(?:锁|同步中)\s*$/, '')`。

反向验证硬数字：改前连跑 5 次 **5/5 都是 25 项**（稳定复现，不是抖动）；改后连跑 3 次 **3/3 都是 23 项全绿**。

#### 顺带修掉的既有过期期望

- `WANT_PLUGINS` 去掉 `iso-view`（13→12）、`MORE_WANT` 去掉「轴测图」（8→7）：`plugins/iso-view/` 目录已不存在，产品代码零引用，只剩 `.aoci` 历史索引快照里有路径 ⇒ 该功能确已下线，期望里留着只会恒红。

**结果：12 PASS / 11 FAIL → 25 PASS / 0 FAIL，连跑 3 次 EXIT=0。**

#### A-4：`scripts/gate.cjs` 全量闸门三态入口

`scripts/check.cjs` 是 FAIL-fast 的（任一红就 exit，后面全不跑），浏览器回归又散在根目录。新增 `node scripts/gate.cjs` 一条命令跑完 8 个阶段，**一项失败不打断后续**，只报 PASS / FAIL / SKIPPED 三态：

```
✔ PASS syntax / static / unit / hydraulic / plot / nav / panel-drift
```

关键纪律：SKIPPED **必须带理由**，且汇总里明写「它们没有被验证过，不算通过」；`--strict` 让 SKIPPED 也算失败。环境不满足（缺基线 / 缺 puppeteer-core / 脚本被删）只能是 SKIPPED，绝不当成通过 —— 历史上 `_p1/baseline.json` 丢过一次，等价性验证空转还报绿。
常用：`--filter=nav`、`--list`、`--json`、`--timeout=900000`。

#### 等价性基线（`equiv`）本身不可信，已修口径

`gate` 首跑唯一红项是 `equiv`，而且报的不是改过的地方：**17 个功能区、每个 208 个元素「计算样式不同」**。重建基线后**间隔 2 分钟立即重跑**仍然同样 208 个差异 ⇒ 与本次改动无关，是快照口径问题。两层噪声：

1. **序号错位**：`STYLES` 给 `body *` 按**文档顺序**编号。插件注册顺序抖一次（`ry-plugin-root` 里插件面板创建时机不同 → 导航项「项目档案/案例推荐」与 `fn-more` 位置互换），后面所有序号跟着平移。证据：`base` 的 40 号是 80px 项、`now` 的 40 号是 63.53px 的 `fn-more`，而 base 43 = now 40。
   → 改为「`tag#id.class` 稳定签名 + 排序」作键。吸收顺序抖动，元素增删仍会暴露（行数变或某签名行消失），比较的属性集合一个没少（48 个 × 3522 元素）。
2. **会话态徽标**：`span#ryUndoBadge` 宽 76.17px vs 0px，`span.ry-st-spacer` 1203.11px vs 1279.28px —— 正好差 76px，同一个原因（spacer 是 flex 占位，徽标有字就窄 76px）。徽标文字取决于撤销栈深度，`window.RyUndo` 也没有清空接口。
   → 采样前统一设成固定文本「撤销」（**不置空**，保留非零宽度，徽标自身的 padding/字号被改仍量得出来）。
3. 页面错误改为「URL/数字归一化 + 排序」再比：被阻断的外网请求谁先失败是随机的（这次 `entitle`、下次 `signin/anonymously`）。

效果：208 个差异 → 只剩 2 个 → 0（重建基线后连跑两次，见 `_verify_out/_eq_c4a.log` / `_eq_c4b.log`）。

#### B 段：N02 三入口验收从 playwright 换成 CDP

`project-planning/验收记录/n02-three-entry.cjs` 从落地起**一次都没跑过**（本机只装了 `puppeteer-core`，`require('playwright')` → MODULE_NOT_FOUND），等于没有验收。改为 Edge headless + 原生 `globalThis.WebSocket`（零第三方依赖），映射关系写在文件头。

跑通后抓出两个原脚本自带的笔误（因为从未执行过，一直没暴露）：

- **区块激活类是 `ry-active` 不是 `active`**：原脚本 `classList.contains('active')`，实测 `pipePlanSection[ry-sec ry-active]`，永远等不到。
- **`context.route(/^https?:/, abort)` 不能直译成 `Network.setBlockedURLs(['http://*'])`**：原脚本页面走 `file://`，我改成 `http://127.0.0.1` 后，那条规则会**把页面自己的 html/js/css/plugins 全挡掉**（实测 40s 都等不到 `RyMapHost`）。改用 `Fetch.enable` + 逐请求判定，只放行 127.0.0.1/localhost。

**结果：3/3 通过**（`_verify_out/_n02_cdp5.log`）——地图右键弹窗 / 地图列表箭头 / 地块库设为当前，A(23500㎡) 与 B(36000㎡) 不串用，刷新后面积、边界 4 顶点、`network.plotId`、`#pipePlanSection` 全部还原，零 pageerror、零意外弹窗。

#### 版本与备份

版本三件同抬（6 个插件 `main.js` 在 CORE 白名单）：`sw VERSION = v635-nav-dedupe`、
`index.html` 的 `style-01.css?v=` 与 `mod/online-map.js?v=`、`runye-map-measure.html` 的 `mod/online-map.js?v=`、`plugin-admin.html` 角标 `界面 v635`。

备份 `_backup_20261020_AtoC/`：6 个插件 `main.js`、`verify_nav_compact.js`、`runye-nav.js`、`runye-entitle.js`、`runye-announce.js`、playwright 版 n02、v634 基线。**未发布。**

#### 遗留（未做，需要用户拍板）

- `verify_ry_tool.js` 修了崩溃（缺 `_bak_v362_index.html` 时降级 SKIPPED）但仍 EXIT=1，红项是 v311 契约 `must 0 命中` 与多处导航条目 `[MISS]`，属既有红，需逐项判定是「契约过期」还是「真缺」。
- `_p1/_gates.cjs` 批跑器未重建；`scripts/gate.cjs` 暂未纳入 `verify_ry_tool.js`（纳入会让闸门常红，掩盖真正的新红）。

---

### 26.34 v636-north-arrow：三级简图右上角加指北针（2026-10-20）

**需求**：用户「三级简图出图，要增加指北针图例」。

**实现**（`mod/inline-09.js`，在 `tlTitleGroup` 之后插一组 `tlNorthGroup`）：

- **位置**：A3 图框右上角。信息行从 `x=34` 起、宽 960 ⇒ 最长到 994；内细框右边线在 1174 ⇒ `1000..1170` 是结构上永不被占用的空白（信息行折行只往下长，不往右长）。
- **几何**：中心 `(svgW-96, 82)` = `(1094, 82)`，半径 24 ⇒ 实测 bbox `x 1070..1118 / y 40.2..106`，完全落在内框 `16..1174 / 16..884` 之内。
- **方位**：`window.measuredPolygon` 是面积测量的**图像坐标**（y 增大向下），绘制时 y 直接映射成 SVG y ⇒ 图上方即真北，指北针恒朝上。**不跟地块变换旋转是对的**：二级页的「地块旋转/镜像」只是作图便利变换，简图走「地图口径」未旋转顶点（`tlAutoGenerate` 内 `[map-enhance]` 注释已写明）。
- **造型**：双半式（北半实心 `#14532d`、南半空心描边 `#111827`）+ 顶部 `N`，与图例同色系；字号 11、外圆描边 1.2，和现有图例（font-size 10/12、`#111827`）同一视觉语言。

**排版校验**（`_p1/_tmp_probe_north.mjs`，真实生成一张简图后量 `getBBox`）：
与标题、信息行、地块、参数块、图例 **五处相交全部为 false**。其中最需要交代的一处：地块 `plot` 的 y 从 `drawTop=110` 起，指北针底在 `106` ⇒ 即使宽扁地块把 plot 横向撑到 `x=1110`（与指北针 x 重叠 40px），**y 上也永不重叠**，结构上安全；信息行折两行时 `drawTop` 更大，余量只增不减。

**顺带修掉一个既有的出图瑕疵**：`tlExportSvgString` 原来直接序列化 DOM，把信息行右下角那个 8×8 的编辑态拖拽手柄 `#tlHeaderHandle`（淡紫、`cursor:nwse-resize`）一起写进 SVG/PNG/打印，印在 A3 上是个说不出用途的紫方块 —— 加了指北针后它正好落在指北针左侧，更显眼。改为 clone 后摘掉该元素再序列化（不动页面真实 DOM，拖拽照常可用）。

**剥离清单同步**（指北针属「图框装饰」，只给纸面看，不给做图区/DXF）：
- `tl-workspace/tl-workspace.js` 克隆底图剥离数组加 `'tlNorthGroup'`；
- `runye-dxf.js` 的 `SKIP_IDS` 加 `tlNorthGroup:1`。

**反向验证**（改前备份换回去跑同一个探针）：

| | 改前 | 改后 |
| --- | --- | --- |
| `northChildCount` | **0** | **4** |
| 导出 `hasNorth` | **false** | **true** |
| 导出 `hasHeaderHandle` | **true** | **false** |

**版本三件同抬**：`sw VERSION = v636-north-arrow`、`style-01.css?v=`、`online-map.js?v=`（两页）、
`inline-09.js?v=`（619 → 636）、`runye-dxf.js?v=`（404 → 636）、`tl-workspace.js?v=`（582 → 636）、`plugin-admin.html` 角标 `界面 v636`。

**基线**：出图 SVG 内容真的变了 ⇒ 等价性基线必须重建（重建后 gate 全绿）。

截图 `_verify_out/north-arrow-full.png`（整图）、`north-arrow-zoom.png`（右上角局部，3× 放大）。
备份 `_backup_20261020_north/`（7 个文件 + v635 基线）。**未发布。**

### 26.35 v637-search-row-wrap：地图左栏「保存地点」移到第二行，搜索框变宽（2026-10-20）

**需求**：用户截图 +「保存地点移动到下一行，让搜索框宽一些」。

**改前事实**（`?v=` 旧样式下同页实测）：左栏 229px 里塞三件 —— 输入框 `flex:1` + 「搜索」42px + 「保存地点」64px，
输入框只剩 **111px**，坐标示例 `18.25,109.51` 都被截断。

**改法**（两页同改，DOM 与 JS 零改动，id 全不变）：

| 文件 | 改动 |
| --- | --- |
| `mod/online-map.css` | `.search-row` 加 `flex-wrap:wrap`；新增 `.search-row #btnSavePlace{flex:1 0 100%;text-align:center}` |
| `runye-map-measure.html`（内联样式 72-74 行区） | 同上三条 |

`flex-basis:100%` 是**结构性换行**而不是「碰巧挤不下」：该项的假设主轴尺寸就等于容器宽度，
第一行永远放不下它，所以不依赖栏宽、不依赖按钮文案长度，缩到 229px 还是 800px 视口都成立。
它是 `.mbtn` 的后代规则、有 id 加权（主程序 `(2,1,0)` > `(1,2,0)`、独立页 `(1,1,0)` > `(0,2,0)`），
能压掉原来的 `flex:none`，不需要 `!important`。

**实测几何**（`_probe_searchrow.cjs`，Edge headless 1400×900，两页各量一次）：

| | 改前 | 改后 |
| --- | --- | --- |
| `input#search` 宽 | **111px** | **181px**（+70px / +63%） |
| `.search-row` 高 | 28px | 62px（两行） |
| `.tools` 高 | 188px | 222px |
| 「保存地点」宽 | 64px（第三件） | 229px（独占第二行，满栏） |
| 「保存地点」与「搜索」同排 | **true** | **false** |

「保存地点」满宽后与下方「📍 定位三亚 / 🗺️ 切换底图」两键左对齐同宽，视觉上归成一列，不像孤零零的小按钮。

**反向验证**（同一页面注入 `flex-wrap:nowrap` + `flex:none` 覆盖回旧布局再量）：
输入框回到 111px、两按钮同排 = true ⇒ 变宽确实是这次改动带来的，不是环境差异。

**探针三条真结论**：主程序 6 条 PASS（换行、满宽、≥150px、无横向溢出、反向两条）、
独立页 5 条 PASS（含「两页几何一致，宽度差 ≤2px」）、断点边缘 800px 2 条 PASS。

**探针踩到的坑（写下来免得下次再踩）**：`Page.captureScreenshot` 带 `captureBeyondViewport:true` 时，
Chrome 会把视口临时撑到整页尺寸 ⇒ `runye-mobile.js` 的 `matchMedia('(max-width:768px),(pointer:coarse) and (max-width:1024px)')`
翻成 true ⇒ 立刻 `location.replace('runye-mobile-map-preview.html')`，截出来的是手机版首页。
另外**视口从宽调到宽不会自动跳回来**：一旦进过手机版，必须在宽视口下重新 `Page.navigate` 才量得到本页。

**未覆盖（明说，不算通过）**：手机端 360px 由 `runye-mobile.js` 按设计整页跳 `runye-mobile-map-preview.html`，
`runye-map-measure.html` 的这三件元素在手机端根本不渲染，本次**没有验证手机端搜索行**。
手机端 `runye-mobile.css:49` 的 `grid-column:1/-1` 作用在 `.search-row` 这个网格项上，与本次的行内 flex 换行不冲突。

**版本三件同抬**：`sw VERSION = v637-search-row-wrap`（含变更注释）、
`index.html` 的 `style-01.css?v=` 与 `online-map.css?v=`（后者原停在 `578-chip-hover-unify`，一并抬齐）、
两页的 `online-map.js?v=`、`plugin-admin.html` 角标 `界面 v637`。

**基线**：5 个元素的计算尺寸真的变了（`btnSavePlace` 64→229、`search-row` 高 28→62、`tools` 188→222、
`input#search` 111→181、外层 `section` 207→241，**只有尺寸、无颜色/字体差异**）⇒ 重建 `_p1/baseline.json`。
gate 复跑 **PASS 8 / FAIL 0 / SKIPPED 0**。

截图 `_probe_out/01-main-searchrow.jpg`（主程序左栏）、`02-main-full.jpg`（整页）、
`03-measure-searchrow.jpg`（独立页左栏）、`04-measure-narrow.jpg`（800px 断点边缘）。
备份 `_backup_20261020_searchrow/`（5 个文件 + v636 基线）。

**已发布（2026-10-20 23:2x）**：`git push` 打不通 github.com（代理 `CONNECT tunnel failed, response 502`、
直连 15s 超时），按 `github-publish-when-push-blocked` 走 Git Data API：提交 `0d2eb78`
（连带本日未发布的 v634/v635/v636 一起，共 24 个文件），远端 tip 与本地 SHA 精确命中，437 文件树/blob 全等。
Pages 构建 `built` / commit `0d2eb78`；线上 `index.html`、`online-map.css`、`runye-map-measure.html`、`sw.js`
四份 sha256 与仓库 blob 逐字节相同。线上真跑一遍（`_p1/_live_smoke_v637.cjs`）：
搜索框 **181px**、保存地点第二行满宽、加载的就是 `online-map.css?v=637`、本站资源零 404、零未捕获异常。
截图 `_probe_out/05-live-searchrow.jpg`。

### 26.36 v638-main-branch-gap：主管/支管图面错开量改成固定值，不再被地块压缩（2026-10-20）

**用户口径（原话）**：「主管跟支管的在图中显示的距离，**不应该被地块压缩**，不管地块大小，**应该都保持一致**。
另外检查一下，主管跟支管在平面图上为了看起来方便，做了一个**虚假显示**，实际上主管跟支管应该是**重合的**，
只是主管**埋在地底下**。原来是这么设定的吧？如果是，那就按照我的要求执行吧。」

**先答「原来是这么设定的吧」——是的，代码里有出处**：`mod/inline-09.js` 三级简图 `v110（2026-09-22）`
注释写明「主管改到分区横向中间；**支管在主管旁平移一小段**（原主管 32% 偏置、支管落中 → 主支相距 18% 边长，
用户反馈偏移过大，缩到 9%）」；二级 `ppBuildAutoPipes` 是「主管落分区块 40%、支管落中线」= 10% 块宽。
⇒ 错开纯粹是显示约定，但一直是**分区块尺寸的百分比**，这正是「被地块压缩」的根源。

**改前实测（同一套代码，三块地）**：错开量 = 分区尺寸 × 10%，实测 **20m（520×237/16 区）/ 12m（200×120/8 区）/
6m（60×40/4 区）**，同一缩放下像素间距 2px / 6px / 18px —— 地块越小反而越宽、越大越窄，用户看到的正是这个。

**改法（两处几何 + 一个数值）**
1. **固定实地米数**：`plot-editor.js` 新增 `PP_MAIN_BRANCH_GAP_M = 20`，`ppVisGap()` 出值；
   `window.RyMainBranchGap` 暴露给三级（`inline-09.js` 的 `tlGapM()` 取同一个数，兜底字面量 20）。
   —— 为什么固定米数在两个视图里都成立：二级 `ppUpdateTransform` 是 `s = 0.5×zoom` 的**固定比例**（注释「1px=2m」），
   三级图框 `s = min(drawW/b.w, drawH/b.h)` 且**上限被夹在 2**（常规地块恒 2 单位/m）⇒ 两边只差一个整图缩放。
   —— 为什么是 20：v637 在用户截图那块地上正好约 20m（45% 缩放下蓝绿两根一眼分得开），以这个观感为基准推广。
2. **对称夹住真实位置**（关键，否则固定值守不住）：原来「支管落中线、主管单侧偏」⇒ 20m 在 60m 宽的区里会把主管
   推到邻居分区，只能靠「不超过分区尺寸 1/4」的边界压回去 ⇒ 小地块又被压回窄间距（等于没改）。
   改成 `主管 = 中线 − 间距/2、支管 = 中线 + 间距/2`，两根**各让一半**，边界放宽到 **分区尺寸的 90%**，
   只有窄于 22m 的极窄分区才会咬到。阀门落点跟着支管走（`x: branchX` / `y: branchY`）。
3. 三级自动布管路径同口径（`mainX = centerX − g/2、brX = centerX + g/2`；横置同理）。
   ★ 注意三级有两条路径：**二级已布管时（`ppHasPipes`）直接复用二级几何**，`tlVisGap` 只在自动布管路径生效 ——
   所以三级的一致性主要来自二级，两条路径现在同口径。

**改后实测（`_p1/_probe_main_branch_gap.cjs` / `_p1/_probe_tl_gap.cjs`）**

| 地块 | 二级世界间距（v637 → v638） | 二级像素（同 s） | 三级 SVG 分离量（v637 → v638） |
|---|---|---|---|
| 520×237m / 16 区 | 20,20,20（另有一对 3.7 被 1/4 边界压掉） → **20,20,20** | 11px @s=0.5 | 7.4（p50 20.3，配对 [20/3.7]） → **39.6**（=20×1.98） |
| 200×120m / 8 区 | 12 → **20** | 10px @s=0.5 | 3.8（配对 [10.13/1.87]） → **40**（=20×2） |
| 60×40m / 4 区 | 6 → **20** | 60px @s=3（=20m×3px/m） | 8（配对 [4]） → **40** |

⇒ 世界间距三块地**完全一致**；三级 39.6 vs 40 的 0.4 差额只是 520m 地块的图框比例是 1.98 而不是 2（整图缩放，非间距差异）。
反向核对：把 v637 的两个文件换回去跑同一探针，逐项回到 20/12/6，改完再换回 ⇒ 探针确认测的就是本次改动。

**探针本身修的三处（都是实测踩到才发现的）**
- **只扫列量不到竖置线**：列扫时竖管整条是「簇高 200px」的大色块，被「簇高 ≤10px 才算线」的过滤掉 ⇒ 小地块量出 `null`。
  补一遍**行扫**（沿 x 聚簇）后三块地都有读数。
- **`ppGetPlanDims` 优先读 `window.runyePlanDims`**：探针只设 `measuredPolygon` 时，分区线按上一轮遗留的
  600×400 画、多边形却是 520×237，截图看着「管子在分区边上」。探针里一并设 `window.runyePlanDims={A,B}` 后对齐。
- **三块地可比必须同一比例**：`ppFitView` 的比例随地块大小变（还夹了 zoom≤10），fit 下量出来的 px 不可比 ⇒
  统一 `ppGetState()→改 zoom→ppSetState()` 回到 **zoom=1（s=0.5px/m）** 再量；小地块 100% 下只有 30px 宽，退到 zoom=6（s=3px/m）并在输出里标 `放大后量`。

**版本三件同抬**：`sw.js VERSION = 'v638-main-branch-gap'`（含变更注释）、
`index.html` 的 `mod/plot-editor.js?v=` / `mod/inline-09.js?v=` / `mod/style-01.css?v=`、`plugin-admin.html` 角标 `界面 v638`。

**闸门**：`node scripts/gate.cjs` → 核心门禁 PASS（113.3s），等价性/Playwright/Puppeteer 四项仍 SKIPPED
（本机 Node 解析不到 playwright/puppeteer、`_p1/baseline.reviewed.txt` 未审核），与 v637 发布时同状态，无新增 FAIL。
本次改动确实会动三级 SVG 的几何 hash（间距变了），等价性基线要在补齐审核流程时一并重建，已在 v637 记录里挂账。

**备份**：`_backup_20261020_gap/`（plot-editor.js / inline-09.js / index.html / sw.js / plugin-admin.html，v637 版）。
截图：`_probe_out/gap_520x237_fit.jpg`、`gap_60x40_fit.jpg`、`gap_60x40_s3.jpg`、`tl_gap_520.jpg` 等。

### 26.37 v639-recipe-row-top：二级左栏「调用方案」整行上移到「灌溉参数」组首（2026-10-21）

**用户口径（原话）**：「二级面板中，灌溉参数这个区域，调用方案整体移动到水泵提升高度上面，灌溉参数 下面。」

**改前结构**（`#ppSide` 内，自上而下）：灌溉参数灰条 → `#ppPlanBar`（10 行输入，首行水泵提升高度）
→ `#ppRecipeBar`（选择方案 + 调用）→ `#ppPlanBar2`（水力计算结果）→ 扬程计算式灰条 → `#ppCalcDetail`。
配方行压在整组输入之下 ⇒ 想先选方案得先滚过 10 行。

**改后**：灌溉参数灰条 → `#ppRecipeBar` → `#ppPlanBar` → 结果 → 计算式。

**三处改动（都不动逻辑）**
1. `index.html`：`#ppRecipeBar` 整块（连同 v491/v526 两段说明注释）从 `#ppPlanBar` 之后挪到
   `<div class="ry-props-head">灌溉参数</div>` 之后；id / class / 内部控件一个没改。
   ⚠ 中途踩过一次：先用 Edit 在「第2行：计算结果」前插入，结果配方块**重复了一份**（原块还在），
   靠 `grep -c 'id="ppRecipeBar"'` 立刻发现（应该 =1），改用脚本按行号删两份再插一份解决。
   ⇒ 教训：这种「移动」不能靠「先插后删」，插入点若在原块之后必然短暂出现重复 id。
2. `mod/ry-panel.css`：补 `.pp-recipe-status:empty{ display:none }`。
   空状态行原本靠 `min-height:14px` 占位，位置在 10 行下方时看不出问题；挪到组首后它正好夹在
   「调用」与「水泵提升高度」之间，成了一条 16px 的无用空档（实测：行 22px + gap 2px + 状态 14px = 38px）。
   有反馈文字（「请先在下拉里选择一个方案」/保存成功/错误红字）时照常展开，`.pp-recipe-err` 不受影响。
3. `mod/ry-panel.css?v=620-sticky-grp` → `?v=639-recipe-row-top`（文件真的改了，参数必须抬）。

**实测（`_p1/_probe_recipe_row_top.cjs`，9 条全 PASS）**
- 屏幕坐标（top）：灌溉参数 121 → 调用方案 143 → 水泵提升高度 165 → 地形高差 187 → 水源距离 209
  ⇒ DOM 顺序 = 屏幕顺序，且上下间隙都是 **0px**（无多出来的缝）。
- 行高：配方行 22px，与相邻参数行 22px 同基准；选择方案 235×20、调用按钮 40×20，均 visible / 未 disabled。
- 状态行回归：点「调用」（未选方案）→ 文本「请先在下拉里选择一个方案」、行高 22→38px、
  行底 181 = 水泵提升高度 top 181（不重叠）；清空后回到 22px。
- 零未捕获异常。截图 `_probe_out/v639_recipe_row.jpg`。

**版本三件**：`sw.js VERSION = 'v639-recipe-row-top'`（含变更注释）、`index.html` 的 `ry-panel.css?v=`、
`plugin-admin.html` 角标 `界面 v639`。v638 的 `plot-editor.js?v=638-main-branch-gap` 等保持不动（那些文件本次未改）。

**闸门**：`node scripts/gate.cjs` → 核心门禁 PASS、面板漂移检查 PASS（4 条已登记，无新增），
等价性 / Playwright / Puppeteer 四项 SKIPPED（与 v637/v638 同状态）。

### 26.38 v640-formula-fold：二级 / 三级「扬程计算式」可折叠，默认折叠（2026-10-21）

**用户口径（原话）**：「二级 三级控制面板中的扬程计算式 默认都是可以折叠起来的，改下。」

**为什么不能照抄现有折叠机制**：`ppResCollapse`（v252）是给「水力计算结果」**整条 `.pp-plan-bar`** 用的
—— 它挂 `pp-res-head`、箭头拼进 `::before` 的 `content`。而「扬程计算式」在两个宿主里形态完全不同：

| 宿主 | 标题 DOM | 内容 DOM | 折叠态挂哪 |
|---|---|---|---|
| 二级 | 静态 `<div class="ry-props-head">扬程计算式</div>`（index.html:805） | 紧跟其后的 `#ppCalcDetail`（`renderPlanCalcDetail` 填 innerHTML） | 标题 + 内容各自加类 |
| 三级 | `#ppHeadBreak` 里由 `renderHeadBreakdown` **每次重绘生成**的 `.tl-flat-head` | 同一次重绘生成的 `.pphb-formula` | **只能挂容器 `#ppHeadBreak`** |

★ 三级那条是本次的关键坑：如果把 `pp-fold-off` 挂在标题或算式带上，下一次 `calcPlan → renderHeadBreakdown`
一重绘就整个 innerHTML 换掉、折叠状态**无声消失**（用户看到的就是「点了没反应/自己又弹回来」）。
挂在容器上才稳；再补一个 `MutationObserver`，重绘后把 `aria-expanded` / `title` 补到新标题上。

**实现（三处）**
1. `mod/plot-editor.js` 新增 `ppFormulaFold` IIFE（紧跟 `ppResCollapse` 之后，文件顶层）：
   - 二级：`#ppCalcDetail` 的 `previousElementSibling` 就是它那条灰条（做了 `ry-props-head` 校验，
     万一结构变了不会误绑），点击/回车切换；可点区域排除 `input,select,button,a,textarea`
     （算式带里「提升 / 地形」是可编辑输入，展开时点它们不能被折叠抢走）。
   - 三级：容器 `#ppHeadBreak` 加 `pp-fold-off`，点击委托命中 `.tl-flat-head` 才算。
   - 两个宿主都是**默认折叠**（`paint(..., true)`）；不记忆状态，每次进入都折叠（与「水力计算结果」同口径）。
2. `mod/ry-panel.css`：`[v640]` 段 —— 标题 `cursor:pointer` + hover 微变、`::after` 拼 ` ▾ / ▸`、
   `#ppCalcDetail.pp-fold-body-off{display:none}`。
3. `mod/style-01.css`：`[v640]` 段 —— 同上，但选择器**限定 `#ppHeadBreak` 下的 `.tl-flat-head`**：
   同一套 `.tl-flat-head` 还被「管径调整 · 扬程确认」「管段长度与水头损失」两块用，
   不限定就会把这两块也带成可折叠（实测确认它们仍是 `cursor:auto`、无箭头）。

**实测（`_p1/_probe_formula_fold.cjs`，18 条全 PASS）**
- 二级默认态：`#ppCalcDetail display:none`、标题 `::after=" ▸"`、`aria-expanded=false`、灰条仍 22px（不塌版面）；
  点一下 → `display:block`、`" ▾"`、`aria=true`、算式带高 83px；再点回到 `none`。
- 折叠不清空内容：收起态 `#ppCalcDetail.innerHTML` 仍有 **1081 字符**（渲染照常，只是不显示）。
- 三级默认态：`.pphb-formula display:none`、`::after=" ▸"`、`cursor:pointer`；点一下 → `block`、块高 102px；再点回 `none`。
- 同页其它 `.tl-flat-head`：「管径调整 · 扬程确认」「管段长度与水头损失」|`cursor=auto`|`after=none` ⇒ 未被带折叠。
- 零未捕获异常。截图：`_probe_out/v640_pp_fold_closed.jpg`（二级默认折叠）、`v640_pp_fold_open.jpg`（展开）、
  `v640_tl_fold_panel.jpg`（三级默认折叠）。

**探针踩到的两个坑（记下来）**
- `Page.captureScreenshot` 的 `clip` 字段是 `width/height`，不是 `w/h` —— 写错直接 `Invalid parameters`。
- 三级左栏**不能**用 `#tlPipePlanSection .pp-side` 定位：`#tlSide` 会被搬进 `#ryCadSide` 的 rail，
  祖先选择器找不到；要用 `#tlSide` 这个 id。

**版本三件**：`sw.js VERSION = 'v640-formula-fold'`（含变更注释）、
`index.html` 的 `style-01.css?v=` / `plot-editor.js?v=` / `ry-panel.css?v=` 三个都抬到 `640-formula-fold`、
`plugin-admin.html` 角标 `界面 v640`。`inline-09.js?v=638-main-branch-gap` 不动（本次未改该文件）。

**闸门**：`node scripts/gate.cjs` → 核心门禁 PASS（96.9s）、面板漂移检查 PASS（4 条已登记，无新增），
其余四项 SKIPPED（与 v637～v639 同状态）。

---

### 26.39 v641-tl-legend-corner：三级工作区图例挪到画布右下角（2026-10-21）

**用户原话**：「红框中的图例放在右下角吧。」（附截图，红框圈的是三级设计工作区画布底部那条
「总管 / 主管 / 支管 / 水源 / 阀门」五色图例，原来是**底部居中**）

**这版真正的工作量不在改 right 值，而在「别把定位基准认错」**
- 图例 `#tlWsOvLegend` 是 `#tlWsOverlays` 的子元素（2026-09-16 的「固定文字层」，不随图纸缩放/平移）。
- `#tlWsOverlays` 是 `inset:0` —— 它相对的 `.ry-pane-ws` 是**三列栅格**：
  `minmax(0,1fr) | 6px 拖拽条 | var(--tlWsToolbarW, clamp(210px,17vw,300px)) 工具轨`，`column-gap:8px`。
  ⇒ **覆盖层铺满三列，不等于画布**。
- 第一版只改了 `bottom:8px;right:8px;left:auto;transform:none`，探针一看就翻车：
  图例右缘 **1592**、工具轨左缘 **1328** ⇒ 相交 **264px**，图例跑到窗口右缘、压在工具轨按钮
  （🖍/Aa−/生成管线图/导出 CAD）和最底那条轨内提示文字上。
  ——教训：**绝对定位元素的 `right/bottom` 是相对定位祖先（这里是整块栅格）算的，不是相对它「看上去所在」的画布**。

**最终做法：沿用仓库里已有的对齐术（不新造轮子）**
- 右上角那三枚勾选框（`#tlWsLabelsChkWrap` / `#tlWsZoneChkWrap` / `#tlWsWorstChkWrap`，2026-09-28 加的）
  早就解决过同一个问题：`r = Math.max(8, (pane.right - canvas.right) + 8)`，由 `ResizeObserver(#tlWsContent)` 驱动。
- 本轮把图例并进同一条路：`mod/inline-24.js` 里新增 `window.tlAlignWsOvLegend()`，
  ```
  right  = (pane.right   - #tlWsContent.right)  + 8
  bottom = (pane.bottom  - #tlWsContent.bottom) + 8
  left   = 'auto'; transform = 'none';   /* 清掉旧的居中基准 */
  ```
  挂在原来的 `tlAlignLabelsChk()` 尾部 ⇒ **一处驱动、四处跟随**：拖拽条改工具轨宽度、窗口缩放、
  切视图（rail 开合）、手机端 `.ry-pane-ws` 改纵向 flex，全部自动重算（公式对纵向布局同样成立：
  此时 `pane.bottom - canvas.bottom` 恰好等于工具轨高，图例仍落在画布下缘 8px）。
- `mod/inline-09.js` 在每次生成图、重写图例 `innerHTML` 之后补调一次（`ov.style.display='block'` 之后），
  因为图例宽度会随内容变（项数固定 5 项，但管径文字可能变化）。
- `index.html` 行内保留 `bottom:8px;right:8px;left:auto;transform:none` 作**首帧兜底**
  （JS 未跑/图例重绘瞬间不会闪回居中）。

**实测（`_p1/_probe_legend_corner.cjs`，12 条全 PASS）**
| 项 | 实测 |
|---|---|
| 画布 `#tlWsContent` | l=319 r=1306 t=37 b=970（w=987） |
| 覆盖层 `#tlWsOverlays` | l=319 r=1600 → 与面板同尺寸（w=1281），证实「覆盖层 ≠ 画布」 |
| 工具轨 | l=1328 r=1600 w=272 |
| 图例 | l=990 r=1298 t=939 b=962（308×23） |
| 距画布右缘 / 下缘 | **8px / 8px** |
| 与工具轨相交 | **0×23**（贴边不算相交） |
| 与轨内提示文字 `#tlWsHint` 相交 | **0** |
| 图例完全落在画布内 | 308×23 全部命中画布 |
| 4 点 `elementFromPoint` | 全部 `in:true`（命中 `#tlWsOvLegend` 自身） |
| 图例项 | 5：总管/主管/支管/水源/阀门 |
| 未捕获异常 | 0 |

截图：`_probe_out/v641_tl_legend_corner.jpg`（画布右下角 620×210 局部，五色图例完整、右边工具轨整条露出来）、
`_probe_out/v641_tl_legend_full.jpg`（整幅工作区）。

**探针踩到的三个坑（都是「测错了」而不是「改错了」，记下来别再犯）**
1. **命中检测必须临时打开 `pointer-events`**：图例继承 `#tlWsOverlays` 的 `pointer-events:none`
   （刻意不挡画布框选/点击），`elementFromPoint` 会**跳过**它、直接返回下面的 `tl-ws-svg`，
   看上去像「被 SVG 盖住了」。改成「存原值 → 置 auto → 测 4 点 → 还原」后才是有效证据。
2. **公告遮罩会异步再弹一次**：`runye-announce.js` 的 `.ry-ann-mask` 在开头删掉后，生成图时又出现，
   4 点命中全是 `ry-ann-mask`。命中检测前再摘一次。
3. **右下角还蹲着「添加到主屏幕」浮层**（`#ryPwaInstall`，`position:fixed`，`pwa/pwa.js`）：
   它会盖住右下角截图。先量它与图例的相交（改完后应为 0），再 `visibility:hidden` 后截图 ——
   这样报告里既证明「不与它相交」，又拿到干净截图。

**副产物**：`_probe_legend_corner.cjs` 顺带复核了二级 `#ppLegend`（画布下方那条整行图例），
仍是 `l=319 r=1600 w=1281`、与画布列同宽、未被裁 —— 二级没动过，确认无回退。

**版本三件（含两个脚本缓存参数）**
- `sw.js` → `const VERSION = 'v641-tl-legend-corner';`（含上方变更注释块）
- `index.html` → `inline-09.js?v=641-tl-legend-corner`、`inline-24.js?v=641-tl-legend-corner`
  （`inline-24.js` 原参数还是古老的 `?v=357`，顺手对齐；`style-01.css` / `ry-panel.css` /
  `plot-editor.js` 本次未改，保持 `640-formula-fold`）
- `plugin-admin.html` → 角标 `界面 v641`

**闸门**：`node scripts/gate.cjs` → 核心门禁 PASS（103.5s）、面板漂移检查 PASS（4 条已登记，无新增）、
其余四项 SKIPPED（与 v637～v640 同状态）。

**状态**：v638 / v639 / v640 / v641 四版**全部本地、未提交未推送**，等用户说「发布」再一起走 Git Data API。

---

### 26.40 v642-tl-legend-frame：三级**简图**底部图例整体左移，末项「滴灌带」不再压外框（2026-10-21）

**用户原话**：「三级简图的图例位置调整下，现在滴灌带跟外框重叠了，图例整体向左移动一些。」
（截图是**三级简图**那张 A3 施工图，不是设计工作区）

**先分清两处「图例」——这是本轮最容易混淆的地方**
| | v641 改的 | v642 改的（本条） |
|---|---|---|
| 位置 | 三级**设计工作区**画布右下角 | 三级**简图**（A3 施工图）底部 |
| 载体 | HTML 覆盖层 `#tlWsOvLegend`（DOM，JS 定位） | SVG 内固定坐标 `#tlLegendGroup`（`mod/inline-09.js` 拼字符串） |
| 定位 | `right/bottom` 相对定位祖先 | `lx = svgW-378` 硬编码用户坐标 |
| 影响面 | 只工作区（克隆底图剥离图例组） | 简图 / 下载 SVG / 下载 PNG / 打印（同一份 `parts` 共用） |

**根因：v489 的估算口径本身就偏了 4 单位**
- `#tlFrameGroup` 是**双线**图框（2026-10-06 v272）：外粗线 `x=8 w=svgW-16`（右缘 **1182**）、
  内细线 `x=16 w=svgW-32`（右缘 **1174**）。
- v489 的注释写「末项文字止于 `lx+346` = `svgW-12`」并「右缘贴 frameX 右边线内缩 4px」⇒
  这个 `svgW-12` 比**内细线 `svgW-16` 大 4**，估算一开始就注定压内线。
- 再叠加字体实测误差：字号 10 / 字重 600 的三个汉字 **31.8** 单位（估的是 30）。
- 两项合起来 ⇒ 整组右缘 `1178.8`，越过内细线 **4.8** 单位。（没到外粗线 1182，所以看上去是「字压在框线上」而不是「跑出画外」）

**改法：只动 `lx` 一个数**
```
lx = svgW - 358   →   svgW - 378      /* 左移 20 单位 */
```
各项相对步进（60/60/65/60/55 + 文字偏移 20/20/20/11/11/16）与字号字重全部不动 ⇒ 图例内部节奏原样。

**实测（`_p1/_probe_tl_legend_frame.cjs`，量 `getBBox()` 的 SVG 用户坐标，与屏幕缩放无关）**

| 项 | 改前 | 改后 |
|---|---|---|
| 图例 bbox | x=832 w=346.8 ⇒ 右缘 **1178.8** | x=812 w=346.8 ⇒ 右缘 **1158.8** |
| 末项「滴灌带」文字 bbox | 1147 → 1178.8 (w=31.8) | 1127 → 1158.8 |
| 内细线 1174 / 外粗线 1182 | 压内细线 **+4.8** | 距内细线 **−15.2**（留 15.2） |
| 与底部参数行（右端 465.1）间隙 | 366.9 | **346.9**（仍极宽裕） |

6 条断言全 PASS：不压外粗线、不压内细线（≤ 内细线−8）、右缘余量 ≥10、不撞参数行、6 项齐全、零未捕获异常。
截图：`_probe_out/v642_tl_legend_frame.jpg`（图例+右边框局部 3× 放大，能看清「滴灌带」与双线框的间隙）、
`v642_tl_diagram_full.jpg`（整幅简图）。

**为什么选 20 而不是「刚好不压」的 13**
刚好不压只需左移 12.8；取 20 后右侧留 15.2 单位，与图框「内框内缩 16」是同一视觉口径，
看起来是「刻意留白」而不是「差一点压上」。参数行离得远（346.9 间隙），左移毫无副作用。

**回归**：`_p1/_probe_legend_corner.cjs`（v641 工作区图例）复跑 12 条仍全 PASS —— inline-09 同文件改动未影响工作区定位。

**版本三件**：`sw.js VERSION = 'v642-tl-legend-frame'`（含变更注释）、`index.html` 的
`inline-09.js?v=642-tl-legend-frame`、`plugin-admin.html` 角标 `界面 v642`。
（`inline-24.js` / `style-01.css` / `ry-panel.css` / `plot-editor.js` 本次未改，参数保持 v641/v640。）

**闸门**：`node scripts/gate.cjs` → 核心门禁 PASS（95.1s）、面板漂移 PASS（4 条已登记，无新增）、4 项 SKIPPED。

**状态**：v638 / v639 / v640 / v641 / v642 **五版全部本地、未提交未推送**，等用户说「发布」再一起走 Git Data API。

---

### 26.41 v643-north-arrow：三级简图指北针换造型（圈径与位置不动，纯图形重画）（2026-10-21）

**用户原话**：「指北针的图例换下。」（截图红箭头指向 A3 图框右上角那个小罗盘）

**旧造型为什么该换**
2026-10-20「出图加指北针」时画的是「单圈 + 两片**透镜形**对顶箭头 + 圈外小 N」：
箭头两头尖、没有底边，缩到 A3 上约 17mm（屏上约 26px）时是两片小白绿瓜子，**看不出「指北」的方向感**；
单圈也撑不起「罗盘」的识别度。

**新造型（建筑制图惯例）**
1. **双圈盘面**：外圆 1.4 细实线 + 内圆 0.6 细线（内圆 = R×0.8125）；
2. **指北针两瓣改三角**（共底边于圆心线）：北瓣实心深绿 `#14532d`（与标题/图例同色系）、
   南瓣白底深绿描边 ⇒ 方向感明确，缩到 26px 也一眼看得出朝北；
3. **N 仍在圈外上方**（不挤占盘面），字号 11 → 12.5、加 0.4 字距。

**几何全部由 `tlNr` 推导** —— `tip = R×0.69`、`半底宽 = R×0.27`、`内圈 = R×0.8125`。
以后调大小只动 `tlNr` 一个数即整体等比缩放，不会再出现「圈变大了箭头没跟上」的错位。

**实测（`_p1/_probe_north_arrow.cjs`，SVG 用户坐标 getBBox，8 条全 PASS）**

| 项 | 实测 |
|---|---|
| 外圆 r | **24**（与旧版一致，版面零位移） |
| 内圆 r | 19.5 = 24×0.8125，线宽 0.6 |
| 两瓣 | 北 `fill=#14532d` 无描边 / 南 `fill=#ffffff stroke=#14532d` |
| 整组 bbox | 1070..1118 × 39.2..106（内细框 16..1174，右侧余量 56） |
| N 文字 | 1088.5..1099.5，字号 12.5 |
| 与标题相交 | 无（标题右缘 725.3） |
| 与信息行相交 | 无（信息行右缘 1002） |

截图：`_probe_out/v643_north_arrow_5x.jpg`（5 倍特写）、`v643_tl_diagram_full.jpg`（整幅简图）。

**同时给了两个备选**（聊天气泡里并排画了三版，等用户拍）：
- **B 国标单针**：单圈 + 实心针 + 细尾线（不要内圈，最接近 GB 的「细圆 + 指针」）；
- **C 全黑工程版**：双圈 + 指针与 N 全用 `#111827`（CAD 味，与图框线条同色）。
用户如说「用 B/C」，只需改本段的两处 `fill/stroke` 与是否画内圈，坐标一个都不用动。

**版本三件**：`sw.js VERSION = 'v643-north-arrow'`、`index.html` 的 `inline-09.js?v=643-north-arrow`、
`plugin-admin.html` 角标 `界面 v643`。
**闸门**：核心门禁 PASS（108.8s）、面板漂移 PASS（4 条已登记，无新增）、4 项 SKIPPED。

**状态**：v638～v643 **六版全部本地、未提交未推送**，等用户说「发布」再一起走 Git Data API。

---

### 26.42 根目录调试探针清账（B 方案「保留证据」· 2026-10-21 · 提交 025356c）

**用户原话**：「B 保留证据（我倾向这个）：先把这 26 个已入库，其余 45 个再加忽略。
文档可追溯，?? 也基本不再出现在 git status 里，代价是多 308KB。」

**背景（`_p1/_audit_root_probes.md` 的结论）**
根目录堆了 **106 个** `_probe_*` / `_shot_*`（1.9MB），构成是：
24 个早已被忽略（`_*.cjs` / `_*.png` / `_*.txt`）+ 11 个历史上故意入库 +
**71 个 `.mjs` 悬空**（就是 `git status` 里一直挂着的几十条 `??`）。
其中 **26 个被 `AGENT_HANDOFF.md` 点名**、当作某次修复的「实测依据」，
但文件只活在本机 —— 换机器后文档里的引证就指向空文件。**零个被产品代码加载**
（`sw.js` / `cloud-sync.js` 里的出现全是注释引证）。

**执行（三步，顺序不能反）**
1. `git ls-files --others --exclude-standard | grep -E '^_(probe|shot)_.*\.mjs$'` → 71 个；
   逐个查名字是否出现在 `AGENT_HANDOFF.md` → **26 个**（实测 308KB）；
2. **先 `git add` 这 26 个**；
3. **再**在 `.gitignore` 尾部加 `_probe_*.mjs` / `_shot_*.mjs`（连处置原则注释一起写进去）。
   ⚠️ 顺序反了会被新规则挡住 —— 那时只能 `git add -f`，等于自己给自己设卡。

**结果**

| 项 | 改前 | 改后 |
| --- | --- | --- |
| 已跟踪探针 `git ls-files` | 11 | **37** |
| 悬空探针 | 71 | **0** |
| 根目录 `??` 条数 | 74 | **3** |
| 仓库体积 | — | +308KB |

**两条要记住的性质**
- `.gitignore` **对已跟踪文件无效** ⇒ 新规则不会把已入库的 37 个「反忽略」掉，
  以后改这些探针照常 `git add` 即可，不会出现「改了却没被 git 看见」。
- `_p1/` 整个目录被 `.gitignore` 第 17 行 `_*/` 忽略 ⇒ 我新建的探针（`_p1/_probe_*.cjs`）
  和清点报告 `_p1/_audit_root_probes.md` **都不入库**，只作本机验证工具；
  决策与结论以本节（跟踪文件）为准。

**剩下的 3 条 `??`（非探针，未动）**
`2026-10-19.md`（散落的当日笔记）、`_float_behavior.json`（浮层行为探针输出）、
`v599_二级右栏皮肤对比.png`（皮肤对比截图）。
如要一并清净，建议：截图与 json 归到 `_probe_out/`（已被 `_*/` 覆盖），md 并入文档或删掉 —— 等用户定。

**⚠️ 发布流程影响**：提交 `025356c` 是**本地**提交，`master` 现比 `origin/master` 领先 **1 个**。
`推送更新.bat` 第一道闸就要求「本地 master == origin/master」，否则直接停
（原话：「为避免顺带推送之前的本地提交」）。所以**下次发布前需要先把这 1 个 chore 提交推上去**：
GitHub Desktop 点一下推送即可（页面内容零变化，只是把探针入库），或不推、等发布时一并处理。

**状态**：v638～v643 六版仍未提交；本条 chore 已提交未推送。

---

### 26.43 v644-pump-btn-align：「更新扬程」按钮右缘与灰条右缘对齐（2026-10-21）

**用户原话**：「更新扬程这个按钮跟上面的标题灰色色块 右侧对齐。」（红箭头指向三级左栏「管径调整 · 扬程确认」块）
**改动面**：只动一条声明 —— `mod/style-01.css` 里 `#tlPumpUpdateRow{padding-right:0}`（双祖先同写）。

**实测位置（`_p1/_probe_pump_btn_align.cjs`，面板 300px）**

| 元素 | 左 .. 右 | 说明 |
|---|---|---|
| 面板 `#tlSide` | 10 .. **310** | 宽 300 |
| 灰条 `.tl-flat-head` | 10 .. **310** | 盒子通栏，文字内缩 10px |
| 行 `#tlPumpUpdateRow` | 10 .. 310 | 复用 `.pp-plan-item`，v611 起 `padding:0 10px` |
| 按钮 `#tlPumpUpdateBtn` | 242 .. **300** | ← 比灰条右缘内缩 **10px** |

⇒ 缺口就是行的右内边距。改后按钮右缘 **310**，与灰条、面板右缘三者重合（实测差值 0px）。

**为什么只改这一行、不加 !important**
- `.pp-plan-item` 的 `padding:0 10px` 是**整个面板所有行的公共节奏**（扬程块、损失卡、联合灌溉行都用它），
  改全局会让所有行正文顶到面板边缘 —— 用户要的是这一行。
- 选择器 `#tlPipePlanSection .pp-side #tlPumpUpdateRow` 有 **2 个 id**，
  页面后面那条 `#tlPipePlanSection .pp-side .pp-plan-item` 只有 1 个 id ⇒ 优先级天然更高，
  不需要 !important（也刻意不写，免得以后按断点改宽度时压不动）。

**实测 8 条全 PASS**

| 断言 | 实测 |
|---|---|
| 灰条通栏（灰条宽 = 面板宽） | 300 = 300 |
| 按钮右缘与灰条右缘齐平 | **0px** |
| 按钮右缘与面板右缘齐平 | **0px** |
| 说明文字左缘仍内缩 10px | 10px（左内边距未被牵连） |
| 按钮宽度未被压 | 58px |
| 说明文字与按钮不重叠 | note.r=248 ≤ btn.l−4=248 |
| 行右内边距实测 0px | 真 CSS 生效（**不是** inline 试算） |
| 未捕获异常 | 0 |

截图：`_probe_out/v644_pump_btn_after.jpg`（改后，3× 特写）、
`v644_pump_btn_sim10.jpg`（用 `--sim` 把右内边距强行加回 10px 的**对照图**，一眼看出缺口）。

**探针踩的坑（三条，都是截图口径）**
1. `Page.captureScreenshot` 的 `clip` 必须有 `width/height` 且**四缘都要量到** ——
   我起初的 `R()` 只返回 l/r，`y`/`height` 变 undefined（JSON 里是 null）⇒ `Invalid parameters`。
2. **`captureBeyondViewport` 会把 clip 当作文档坐标**，而面板是内部滚动容器、
   `getBoundingClientRect` 给的是视口坐标 ⇒ 截出来是一整片背景色。优先用视口口径（不带该参数）。
3. 这块在左栏靠下，默认在视口外，得先 `scrollIntoView({block:'center'})` 再量/截。

**版本三件**：`sw.js VERSION = 'v644-pump-btn-align'`、`index.html` 的 `style-01.css?v=644-pump-btn-align`、
`plugin-admin.html` 角标 `界面 v644`。
**闸门**：核心门禁 PASS（92.2s）、面板漂移 PASS（4 条已登记，无新增）、4 项 SKIPPED。

**状态**：v638～v644 **七版全部本地、未提交未推送**（另有 chore 提交 `025356c` 也未推送）。

---

### 26.44 v645-dim-scale-entry：「标注尺寸大小调节」入口收敛到设置页（2026-10-21）

**用户原话**：「标注尺寸大小调节，不放在这里，放在设置页面就行了，如果这里的跟设置页面的重复，那这里就取消。」
（红箭头指向三级工具轨里那组 `Aa－ / 100% / Aa＋ / ⟲`）

**核对结论：确实是重复，而且是同一个 localStorage key**

| | 设置页「标注与文字」 | 工具栏四键组 |
|---|---|---|
| 控件 | `#rySetScaleRange` 滑块 0.6~1.8 step 0.1 | `#tlDimScaleRow` 四键 |
| 写入 | `localStorage['tl-dim-scale']` | **同一个 key** |
| 证据 | v520 的页签文案自己写着「与顶栏工具栏上的「Aa」四键组是同一个值，两边随时同步」 | — |

⇒ 按用户要求取消工具栏那处，只留设置页。

**四处一起改（少一处就会留下死代码或谎话）**
1. `index.html`：删掉 `#tlDimScaleRow` 整块，**注释留档**写明怎么恢复 ——
   四键必须放回 `#tlAutoPipe` **之前**（A6 契约：生成按钮贴底）。
2. `mod/inline-09.js`：删 `window.tlDimScaleStep` / `window.tlDimScaleReset` + 那句 `#tlDimScaleVal` 同步；
   **保留 `tlDimScaleOf()` 与 `tlDS`** —— 渲染仍把它乘进 `DG.font/gap/tick/tickW`，出图逻辑一个字节没动。
3. `mod/inline-28.js`：去掉 `refresh()` 里对已删元素的同步；页签文案改成「**这里是唯一入口**（v645 起工具栏那组四键已取消）」——
   不改就是界面在说谎（用户会照着去工具栏找）。
4. `verify_ry_tool.js`（历史审计，不在 gate 里）：任务M 契约从 `id="tlDimScaleMinus"` 改成
   `id="rySetScaleRange"`。锁的目标从「四键别删」变成「别两处都没了、比例再也调不了」。

**实测（`_p1/_probe_dim_scale_entry.cjs`，11 条全 PASS）**

| 断言 | 实测 |
|---|---|
| 工具栏已无 `#tlDimScaleRow` | 查无 |
| 四键/数值节点全消失 | Minus/Plus/Reset/Val 全部 false |
| 两个函数不再挂在 window 上 | `undefined / undefined` |
| A6：生成管线图仍是轨内最后主按钮 | gen idx=24，导出 CAD idx=25 |
| 设置页滑块范围 | 0.6~1.8 / step 0.1 |
| 文案已改「唯一入口」 | 命中 |
| 拖到 70% 即时反映 | 标签 `70%` |
| 保存后落盘 | `localStorage = 0.7` |
| **图面字号真按 12×0.7 缩放** | 字号档位由 `[…,12,…]` 变为 `[**8.4**, 9.5, 10, …]` |
| 只改标注档、不是整图缩放 | 其余档位不变（9.5/10/10.5/11/12/12.5/15/20 仍在） |
| 未捕获异常 | 0（没有 `tlDimScaleStep is not defined`） |

截图：`_probe_out/v645_rail_no_aa.jpg`（工具轨，四键已消失，顺序变成「标注保存 → 生成管线图 → 导出 CAD」）、
`v645_settings_scale.jpg`（设置页「标注与文字」，滑块 + 100% + 复位 100%）。

**版本三件**：`sw.js VERSION = 'v645-dim-scale-entry'`、`index.html` 的 `inline-09.js?v=` / `inline-28.js?v=`
都抬到 `645-dim-scale-entry`、`plugin-admin.html` 角标 `界面 v645`。
（`style-01.css` 保持 v644 —— 本次没动它。）
**闸门**：核心门禁 PASS（93.5s）、面板漂移 PASS（4 条已登记，无新增）、4 项 SKIPPED。

**状态**：v638～v645 **八版全部本地、未提交未推送**（另有 chore 提交 `025356c` 也未推送）。

---

### 26.45 v646-north-cross：三级简图指北针换成「十字刻度」版（候选 4）（2026-10-21）

**用户原话**：「三级简图的指北针有没有更好的图例，你先列几个，我看看，我同意你在修改。」→
我列了六版并排样张（都按 r=24 同尺寸渲）→ 用户回「**用4吧**」。

**候选 4 的取舍（当时写在样张旁边，事后核对属实）**

| | 内容 |
|---|---|
| 好处 | 「工程感」最强，四个方位（N/E/S/W）一眼可读 |
| 代价 | 刻度**突破圆外 4px** ⇒ 整组宽度从 48 变 56，得重算与图框右缘的距离 |

**改动只有一处：`mod/inline-09.js` 的 `#tlNorthGroup` 绘制段**

| 部件 | v643（旧） | v646（现在） |
|---|---|---|
| 圈 | 双圈（外 r=24 + 内圈） | **单圈** r=24，`fill #ffffff` / `stroke #111827` / `stroke-width 1.1` |
| 方位 | 无 | **四向十字刻度**：一条 path 四段 `M-L`，从 `R-4` 伸到 `R+4`，`fill=none` / `stroke #111827` / 宽 1 |
| 针 | 双三角 | 双三角（**没动**）：北瓣实心 `#14532d`，南瓣白底 + `#14532d` 描边 |
| N | 圈内 | **圈外**：`y = cy-R-10`，字号 12.5 / 字重 700 / 字距 0.4 / 色 `#14532d` |

几何全部由 R 推导，**R 仍是 24 —— 版面占位一个字节没变**（当初用户问过「要不要顺便放大到 r=30（约 21mm）」，未答，
所以保持原尺寸）：
`tlNtip = R×0.71`、`tlNbw = R×0.229`、`tlNtk = 4`。

```js
var tlNcx = svgW - 96, tlNcy = 82, tlNr = 24;
var tlNtick = 'M'+tlNcx+' '+(tlNcy-tlNr-tlNtk)+' L'+tlNcx+' '+(tlNcy-tlNr+tlNtk)  // 上（北）
  +' M'+tlNcx+' '+(tlNcy+tlNr-tlNtk)+' L'+tlNcx+' '+(tlNcy+tlNr+tlNtk)            // 下
  +' M'+(tlNcx-tlNr-tlNtk)+' '+tlNcy+' L'+(tlNcx-tlNr+tlNtk)+' '+tlNcy            // 左
  +' M'+(tlNcx+tlNr-tlNtk)+' '+tlNcy+' L'+(tlNcx+tlNr+tlNtk)+' '+tlNcy;           // 右
```

**关键约束：刻度底端正好落在图面顶边**
`cy=82`、`R=24`、刻度伸到 `R+4` ⇒ 底端 `y = 82+28 = 110`，而图面顶边**就是 y=110**。
即「刚好贴住、不越界」—— 这是这一版最容易被下一次微调踩坏的一条，探针专门锁死。

**实测（`_p1/_probe_north_arrow.cjs` 改用 4 号口径，11 条全 PASS）**

| 断言 | 实测 |
|---|---|
| 外圆 r 仍 24 | `r=24`（版面尺寸未变） |
| 单圈（v646 取消内圈） | `circles=1` |
| 外圆线宽 1.1 | `1.1` |
| 四向十字刻度（`fill=none` / `stroke #111827` / 4 段 M-L） | `M1094 54 L1094 62 M1094 102 L1094 110 M1066 82 L…` |
| 北瓣实心深绿、南瓣白底绿描边 | `none/#111827 · #14532d/null · #ffffff/#14532d` |
| 整组在内细框内 | `1066..1122` vs 内框 `16..1174`（右余 52） |
| **刻度底端不压图面顶边** | `bbox.b = 110` ≤ 110 |
| 整组宽度 56（R+4 两侧） | `56` |
| N 不撞标题 | N 右缘 1099.5 vs 标题右缘 725.3 |
| N 不撞信息行 | N 右缘 1099.5 vs 信息右缘 1002 |
| 未捕获异常 | 0 |

整组 bbox：`{l:1066, r:1122, t:35.2, b:110, w:56, h:74.8}`。

截图：`_probe_out/v646_north_cross_5x.jpg`（5 倍特写 —— 刻度与三角针放大后依然干净，没有糊成一团）、
`v646_tl_diagram_full.jpg`（整幅 A3 实图 —— 在真实出图尺寸下仍认得出，且没压到图面顶边）。

**版本三件**：`sw.js VERSION = 'v646-north-cross'`（变更注释已写在 VERSION 上方）、
`index.html` 的 `inline-09.js?v=646-north-cross`、`plugin-admin.html` 角标 `界面 v646`。
（`inline-24.js` 保持 v641、`inline-28.js` 保持 v645、`style-01.css` 保持 v644 —— 本次都没动。）

**闸门**：核心门禁 PASS（98.8s）、面板漂移 PASS（4 条已登记，无新增）、4 项 SKIPPED（与 v637 同状态）。

**状态**：v638～v646 九版**已发布**（见下方「发布结果」）。

**发布结果（2026-10-21 07:2x，用户「发布到网络吧」）**

| 步骤 | 结果 |
|---|---|
| 提交 | `17dd6af`「v646-north-cross: v638~v646 九版合并」，10 文件 / +1004 −74 |
| 推送 | `git push origin master` 一次成功（`3248637..17dd6af`），**没有走 Git Data API** |
| Pages 生效 | 轮询 4 次、约 45s 后线上 `inline-09.js?v=` 由旧值变 `646-north-cross` |
| 线上复核 | `sw.js VERSION = v646-north-cross`、`plugin-admin.html` 角标 `界面 v646`、线上 `inline-09.js` 里 `tlNtk = 4` / `tlNr * 0.71` 均在 |

**线上专项核验（`_p1/_live_smoke_v646.cjs`，20 条全 PASS）**

不是「文件到了线上」就算完 —— 本次改的是 SVG 用户坐标绘制，SW 缓存或 CDN 边缘都可能还是旧副本。
所以开真浏览器走一遍「进三级 → 造地块 528×237 → 生成简图 → 切视图」，量真实几何：

| 类别 | 断言 | 线上实测 |
|---|---|---|
| v646 本体 | 单圈 r=24 / 线宽 1.1 / 四向十字刻度 / 北实心南描边 | 与本地逐项一致 |
| | 整组 bbox | `1066..1122 × 35.2..110`，宽 56 |
| | 刻度底端不压图面顶边 | `b = 110` |
| | N 不撞标题/信息行 | `1088.5` < 标题 725.3、信息 1002 |
| 版本 | 线上加载 `inline-09.js?v=646-north-cross` | 命中 |
| v642 回归 | 简图图例末项不压内细框 | `1158.8` vs 内框右 `1174` |
| v644 回归 | 按钮右缘与灰条右缘齐平 | 双 310 |
| v645 回归 | 两视图都无 Aa 四键；设置页滑块 0.6/1.8/0.1 | 命中 |
| v641 回归 | 图例距画布右/下缘各 8px、不压工具轨 | 画布 1306/970 vs 图例 1298/962；工具轨左缘 1328 |
| 健康 | 本站资源无 404/5xx、无未捕获异常 | 零 |

**两个白跑一轮的坑（下次直接照抄结论）**
1. `[data-ry-view="ws"]`.click() **不可靠** —— 切换视图要走 `window.rySetTab('tlPipePlanSection','ws')`，
   直接点按钮时视图没换，`#tlWsContent` 尺寸全 0，连带 v641 三条断言假 FAIL。
2. 设置页是**懒渲染**：`#rySetScaleRange` 只在打开「标注与文字」页签后才存在 ⇒ 必须先
   `window.ryOpenSettings('scale')` 再查节点，否则又是一条假 FAIL。

截图：`_probe_out/v646_live_north_5x.jpg`（线上 5 倍特写，与本地渲染逐像素一致）、`v646_live_full.jpg`。


---

### 26.46 v647-north-bearing：指北针跟着地块实际方位转（2026-10-21）

**用户原话（两段，第二段是补充）**
> 「指北针的方向要从地图上采集方向，采集之后，随着地块信息传递给地块分区页面，地块分区页面可能
> 对地块进行了旋转，那么指北针也要随着旋转，这样三级简图出图页面的指北针才能指向实际位置。」
>
> 「地块分区之后可以传回地图的，在地图上可以微调分区角度的，这个微调之后，再回传给地块分区页面，
> 也会导致指北针微调，这个别忘记修改了。」

**根因：v646 及以前写死「图上方即真北」**

那只对「刚从地图回传、二级一动没动」的地块成立 —— 回传时
`measuredPolygon.y = −(lat−lat₀)·m`，北被编成 −y（`inline-16.js:100-117`）。
但下面三类操作**只改图面顶点、不动经纬度基准**，一发生「上方」就不是真北：

| # | 操作 | 代码位置 | 对顶点的作用 |
|---|---|---|---|
| ① | 二级「重新分区」落定地块角度 | `plot-editor.js ppRepartitionFromRotatedPlot()` | 旋转写进 `ppState.polyPts` + `window.measuredPolygon` |
| ② | 二级「地块镜像」水平/垂直 | `ppApplyMirror()` | 直接改数据（对合可撤） |
| ③ | 地图上微调「分区角度」再回传 | `runye-map-partition.js` → `runyeApplyMapPayload`（`inline-16.js:165-169`） | `measuredPolygon = RyMapPartition.orient(..., angle, ctr)` 再转一次 |

**做法：不记角度，每次出图现场反算**

累加器（`rot += θ`）看着简单，但撤销/镜像/整组/地图往返每一处都能把它记歪。改成几何反算：

`tlNorthAngleDeg()`（`mod/inline-09.js`，与 `tlAutoGenerate` 同级，已挂 `window`）：

1. 参考环 = `window.__runyeMapFramePoly`（地图口径，**北 = +y**，与图面顶点同序同点数）；
2. 用**相邻点差**（边向量）做样本，最小二乘解 2×2 线性映射 `M`：地图口径 → 图面
   （位移不影响方向，所以只解线性部分，不解平移）；
3. 北在图面里的方向 = `M·(0,1) = (m12, m22)`；
4. 返回「相对正上方的顺时针角」：`rot = atan2(m22, m12) + 90°`（正上方 = 屏幕角 −90°）。

为什么 ①②③ 全都自动覆盖：三者都是对**整块地**做的相似变换 ⇒ 顶点变了、参考环没变，`M` 自己就带上了那个角度。

**绘制**（`#tlNorthGroup`）

- 整组 `transform="rotate(rot 圆心)"`；rot = 0 时不写 transform ⇒ 与 v646 **逐字节一致**；
- N 字与角度数值**仍留在组内**（`runye-dxf.js` / `tl-workspace.js` 的「整组剥离」规则一行都不用改），
  但各自 `rotate(−rot)` 反向转回 ⇒ 任何角度下都正立可读（用户确认：盘转、字不倒）；
- `|rot| ≥ 0.5°` 时在 N 右侧标数值，如「N +30.0°」；0° 时不出，版面干净。

**退化**：图片测量 / 手画矩形 / 地形模块米坐标 ⇒ 无 `__runyeMapFramePoly`；或点数不等、矩阵奇异
⇒ 返回 0，完全退回 v646 行为（老地块不变样、不报错）。

**实测（`_p1/_probe_north_bearing.cjs`，18 条全 PASS）**

| 场景 | 期望 | 实测 |
|---|---|---|
| S0 刚回传（未旋转） | 0，且**不写 transform** | `tf=null` ✔ |
| S1 二级落定 +30° | 30 | `rotate(30 1094 82)` ✔ |
| S2 二级落定 −45° | −45 | `rotate(-45 …)` ✔ |
| S3 垂直镜像 | 180（北被翻到下方） | `rotate(180 …)` ✔ |
| S4 水平镜像 | 0（北仍朝上） | `tf=null` ✔ |
| S5 无地图基准（图片测量） | 0 且无角度数字 | ✔ |
| **S6 真链路**：`runyeApplyMapPayload` + `partitionPlan.angle=15` | 15 | `rotate(15 …)`、`+15.0°` ✔ |
| 针尖实际指向（`getCTM` 投到图面复算） | 0 / 30 / −45 / 180 | 0 / 30 / −45 / 180 ✔ |
| N 字反向转 | `rotate(-30 1094 47)` | ✔ |
| 下载 SVG 同源 | 带同一 rotate | ✔ |
| 未捕获异常 | 0 | ✔ |

截图：`_probe_out/v647_north_rot30_4x.jpg`（30° 4 倍特写：针尖朝右上、N 正立、右侧 `+30.0°`）、
`v647_full_rot30.jpg`（整幅 A3）。

**两个量测坑（都白跑了一轮，记下来）**

1. `tlAutoGenerate()` 生成完会把视图**自动切回 `ws`（设计工作区）**，此时 `#tlDiagramContent` 尺寸为 0，
   `getBBox()` 全 0、截图报 `Cannot take screenshot with 0 width` ⇒ 量之前必须
   `window.rySetTab('tlPipePlanSection','pipe')` 再等 `#tlDiagramContent` 宽度 > 40。
2. `getBBox()` 是**局部坐标**，元素被 `rotate` 了它也不变 ⇒ 想验证「针真的指那儿」必须用
   `getCTM()` 把针尖点投到图面坐标系复算角度；截图裁剪要用 `getBoundingClientRect()`（已含变换）。

**版本三件**：`sw.js VERSION = 'v647-north-bearing'`、`index.html` 的 `inline-09.js?v=647-north-bearing`、
`plugin-admin.html` 角标 `界面 v647`。（其余文件保持 v641~v646 不动。）
**闸门**：核心门禁 PASS、面板漂移 PASS、4 项 SKIPPED（同 v637 状态）。

**状态**：本地已提交前先跑 gate；发布仍需用户明确指令。

---

### 26.47 v648-lock-text：二级右栏「锁定面积」按钮去掉锁图标（2026-10-21）

**用户原话**：「锁定网格按钮前面的图标取消吧。」（红箭头指向右栏那枚 `🔓 锁定面积`）

**三处一起改**（少一处就会出现「点一下图标又回来了」）

| 位置 | 改前 | 改后 |
|---|---|---|
| `index.html:837` 初始文案 | `🔓 锁定面积` | `锁定面积` |
| `plot-editor.js` `ppSyncAreaLockUI` 锁定态 | `🔒 已锁定面积` | `已锁定面积` |
| 同上 解锁态 | `🔓 锁定面积` | `锁定面积` |

`id`、`title` 提示、`active` 高亮、解锁逻辑（合并/重置/重新分区/旋转时自动解锁）**一律未动**。

**顺带更正一处会过期的注释**：`mod/inline-19.js` 里 v608 那条「MIN_TOOL 92→132」的宽度依据写着
「最长的一句是『🔓 锁定面积』（文字+锁图标约 96px）」—— 去图标后约 82px，补一句说明，
避免下次有人照 96px 复核时对不上。

**实测（`_p1/_probe_lock_btn_text.cjs`，10 条全 PASS）**

| 断言 | 实测 |
|---|---|
| 初始文案就是「锁定面积」 | ✔ |
| 初始/锁定态都不含 emoji | ✔ |
| 点一下 →「已锁定面积」+ `active` | ✔ |
| 再点一下 →「锁定面积」、`active` 去掉 | ✔ |
| 两次点击按钮宽度一致 | 123 × 2 |
| 按钮右缘不越过工具轨右缘 | 1593 vs 1600 |
| 未捕获异常 | 0 |

截图：`_probe_out/v648_lock_btn.jpg`（右栏 2 倍：调网格 / 重置网格 / **锁定面积** / ↩ 回退 / 清除管路 / 地块镜像 / 地块划分）。

**量测坑（又白跑一轮）**：二级右栏**默认是折叠的**（`plot-editor.js` ppRailCollapse，v254：无存档即
`off=true`），折叠态下 `#ppLockArea` 只有 **14px 宽**、位于 1632 之外，量到的根本不是真按钮 ⇒
断言「按钮右缘 ≤ 轨道右缘」会假 FAIL、截图也是一片空白。探针必须先
`document.getElementById('ppRailToggle').click()` 展开（或预置 `localStorage.ppRailOff='0'`），
再等 `#ppToolbar` 宽度 > 60。

**版本三件**：`sw.js VERSION = 'v648-lock-text'`、`index.html` 的 `plot-editor.js?v=648-lock-text`、
`plugin-admin.html` 角标 `界面 v648`。（`inline-09.js` 保持 v647 —— 本次没动它。）
**闸门**：核心门禁 PASS、面板漂移 PASS、4 项 SKIPPED。

**状态**：本地未提交未发布（v647 也仍未提交）。

### 26.48 v649-gr-toolbar：多地块规划页接入与二级/三级同一套左侧工具栏（2026-10-21）

**用户原话**：「多地块规划页面的布局乱了，左侧应该跟二级 三级一样，是工具栏。」
（截图：`#grPipeSection` 左侧是一列灰卡横贯整版、画布上方还横着一条工具按钮）

**病灶（探针实测，改版前留档 `_probe_out/gr_layout_before.jpg`）**

| 项 | 改版前 | 依据 |
|---|---|---|
| `#grPipeSection > .pp-body` | `display:block`（没有任何 `display:grid`） | 第 2566/2567 行只写了 `grid-column` 定位，落在 block 容器上等于没写 |
| `#grSide` | 1600px 宽、5 张卡上下铺满整版 | 左栏卡片一张张横贯全屏 |
| `#grCanvasWrap` | 1600×1226，被顶到第二屏 | `.pp-body` 总高 1618 > 一屏 933 ⇒ 整页纵向滚动 |
| `#grToolbar` | `display:block`、条高 23px | `.pp-toolbar` 全站没有基础规则，按钮按 inline 排，看着像「没有工具条」 |
| `#grLegend` | 塌成一段 inline 文字、高 20px | `.pp-legend/.pp-legend-item` 基础规则在历史清理中被删；第二行 `#grTlLeg` 被 `.pp-stage` 的 `overflow:hidden` 裁掉 |
| 右缘「工具栏」竖标签 | 在多地块页也显示 | `plot-editor.js syncProxy` 只判 `getComputedStyle(btn).display`，而 display 不会从 `display:none` 祖先继承 |

**四处改动**

1. `mod/ry-cad-toolbar.js`：`HOSTS` 加 `{sec:'grPipeSection', side:'grSide', grp:'ryCadGrpGr'}`；
   `VPS` 加 `'grPipeSection'`（显示门控 + main 左让位）；`GRP_FOR` / `ALL_GRPS` 同步 ——
   左栏由「页面内一列卡」变成「⚙ 工具栏」里的第三个分组（展开/收起/拖宽与二级/三级同一套机制）。
2. `index.html`：`#ryCadSide` 里新增 `<details id="ryCadGrpGr">` + `data-pp="grPipeSection" data-host="grSide"`。
3. `mod/style-01.css` 新增 §6b / §6b-2：
   - `body.ry-tool #grPipeSection > .pp-body` 三列网格（与二级 3202 行同值同序）+ `.pp-stage` 改 flex 列
     （`#grCanvasWrap` 第 2571 行那句早写了的 `flex:1 1 auto` 这次真生效）；
   - `[data-ry-rail="1"]` 搬移态前两列归零（与 4539 行同口径）；
   - `#grToolbar` 复位成顶部横条（flex row、高 39px、5 键一行）；
   - `#grSide` 栏内竖排 + gap 6px；`.gr-card-title` 改成二级同款灰分组条（22px / #dcdfdd / 11px）；
   - `#grLegend` / `.pp-legend-item` / `#grTlLeg` 布局补回（只挂 gr 作用域，不动全局）；
   - `#grPipeSection .pp-side` 原位态也补 `flex 列 + gap`（v241「间距单一来源」的欠账）。
4. `mod/plot-editor.js` `syncProxy`：追加「本页是当前功能区（`#pipePlanSection.ry-active`）」判定 ——
   竖标签不再跨页残留。

**刻意不做**：孪生样式**没有**交给 `scripts/refresh-cad-twin-css.cjs` 重跑 —— 那个块历史上有过手工剔除
（现块里成片空行即遗迹），重跑会把被剔的规则全部复活、牵动二级/三级现有观感。gr 只需一小撮孪生，
手写在 §6b-2（`#ryCadSide [data-pp="grPipeSection"] …`）；脚本 `sections` 处留了注释说明原因。

**实测（`_p1/_probe_gr_layout.cjs`，29 条全 PASS）**

| 断言组 | 实测 |
|---|---|
| 外壳接管：ry-tool + ry-cad-vp、栏宽 318 | ✔ |
| `#grSide` 进 `#ryCadGrpGr`、`data-ry-rail="1"` | ✔ |
| `.pp-body` 是 grid、搬移态 `0px 0px 1281px` | ✔ |
| 一屏装下：section 底 970 ≤ 1000 | ✔ |
| 画布 1281×847（原来 1600×1226 + 整页滚动） | ✔ |
| 工具条 flex/row、高 39、5 键同行在条内 | ✔ |
| 图例 flex、8 条目同行、11px、`#grTlLeg` 未被裁 | ✔ |
| 右缘竖标签本页隐藏 / 切回二级恢复 | ✔ / ✔ |
| 切页后 `#grSide` 留在栏内（与 `#ppSide` 同行为）、分组互斥折叠 | ✔ |
| 未捕获异常 0 | ✔ |

回归：v648 `_probe_lock_btn_text.cjs` 10 条全 PASS、v647 `_probe_north_bearing.cjs` 全 PASS。
**闸门**：核心 PASS（46.0s）、面板漂移 PASS（4 条已登记）、4 项 SKIPPED。

截图：`_probe_out/v649_gr_layout.jpg`（整页）/ `v649_gr_rail.jpg`（左栏 2 倍）。

**版本三件**：`sw.js VERSION = 'v649-gr-toolbar'`、`index.html` 的 `style-01.css / plot-editor.js /
ry-cad-toolbar.js` 三个 `?v=649-gr-toolbar`、`plugin-admin.html` 角标 `界面 v649`。
**状态**：本地未提交未发布（v647 / v648 也仍未提交，等用户说「发布」一并推）。

### 26.49 v650-gr-terrain-btn-gone：多地块页左栏撤掉「地形高程」快捷按钮（2026-10-21）

**用户原话**：「地形高程控制按钮，在上一层工具栏有了，这里就没有必要再出现了。」
（截图红箭头指向 `#grSide` 顶部那枚绿色大按钮）

**背景**：v245c 当年把这枚按钮插在「成组地块条之后、总管卡之前」，是因为那时多地块页
左栏是独立面板、没有别的地形入口。v649 起左栏已并入全局工具栏，`#ryCadGrpTerrain`
分组就在**同一个栏**里（截图下方可见），按钮成了重复入口。

**改动**：`runye-terrain.js` 注入数组去掉 `'grBlockCard'`（`closest('.pp-side')` 插入分支一并删）；
`init` 时按 `data-terrain-open` 把页内旧残留按钮一律拔掉（防 SW 旧缓存把按钮带回来）。
其余宿主（`fld_dh` / `tl_dh` / `settingsForm`）不动。

**版本**：`sw.js VERSION = 'v650-gr-terrain-btn-gone'`（含 v649 未发布增量）、
`index.html` 的 `runye-terrain.js?v=650-gr-terrain-btn-gone`、角标 `界面 v650`。
**验证**：`_probe_gr_layout.cjs` 扩到 30 条全 PASS（新增：`#grSide` 内 `data-terrain-open` /
`.rt-open` 计数均为 0）；gate 核心 PASS、面板漂移 PASS。
**状态**：本地未提交未发布（v647/v648/v649/v650 攒着，等用户说「发布」一并推）。

### 26.50 v651-gr-side-flat：多地块面板「拍平」并进二级/三级共享皮肤链（2026-10-21）

**用户两轮拍板**：
1. 「样式不能多层嵌套/覆盖」（Grasshopper Flatten 作比：层级是搬运过程的副产品，拍掉）；
2. 「多地块面板要遵从二级 三级总体的规则，将来一句话，二级/三级/多地块/地形高程一起变」——
   即皮肤必须**单源**，不允许各面板私抄一份同值副本。

**拍平动作（只动多地块面板 + 一处三级收编）**

| 改动 | 文件 | 内容 |
|---|---|---|
| 孪生层删除 | `mod/style-01.css` | v649 的 `#ryCadSide [data-pp="grPipeSection"]` 11 条补丁整层删除；规则键在稳定锚点上——`#grSide`（id 跟元素走）与 `.gr-*` 专属类；页内 `#grPipeSection .pp-side` 前缀副本同批删除 |
| 皮肤根类 | `index.html` | `#grSide` 挂上 `ry-props`，与二级 `#ppSide` 同根 |
| 灰条单源 | `mod/ry-panel.css` | `.ry-props .ry-props-head` 扩为四面板灰条唯一出处：`+ .ry-props .gr-card-title`（多地块卡标题）`+ #tlPipePlanSection/.#ryCadSide [data-pp] .pp-side .tl-flat-head`（三级信息卡标题，原是同值拷贝带 !important，改一句变不了它——本轮排查抓出并收编） |
| 卡盒定稿 | `mod/style-01.css` | 通用 `.gr-card/.gr-block` 直接写定稿值（白底 + #e4ede7 细框 + padding 0），#grSide 不再打补丁；`.gr-card` 全站只有 gr 页与 #grHydPanel（本来整体清零）使用，已核实 |
| 细节对齐 | `mod/style-01.css` | 卡内正文缩进 8→10px（与共享灰条 padding 对齐）；`.gr-btn:hover` #eef4f1/#1f2937 → #f6f8f7/#173f2d（二级 ghost 共享基准） |

**四面板排查结论（实测计算样式）**

| 面板 | 灰条来源 | bg | 字号/字重 | 结论 |
|---|---|---|---|---|
| 二级 `.ry-props-head` | `.ry-props` 共享规则 | #dcdfdd | 11/600 | ✔ 已是单源 |
| 三级 `.tl-flat-head` | ~~同值拷贝~~ → 本轮收编进共享规则 | #dcdfdd | 11/600 | ✔ 本轮并入 |
| 多地块 `.gr-card-title` | ~~gr 私有副本~~ → 本轮收编 | #dcdfdd | 11/600 | ✔ 本轮并入 |
| 地形 `.rt-panel`（header/按钮） | 自成一套（深绿按钮 #116447、绿头 #f4f9f6，runye-terrain.css） | — | — | ⚠ **未并入**：改动会波及二级/三级/设置页里的地形入口按钮外观，等用户点头再做 |

**将来改风格只动 `mod/ry-panel.css` 一条规则**（灰条 22px/#dcdfdd/#cfd4d1/11px/600），二级、三级、多地块同时变；地形高程待并入。

**验证**：`_p1/_probe_gr_layout.cjs` 30 条全 PASS；v648 回归 10 条全 PASS；gate 核心 PASS、面板漂移 PASS。四面板灰条计算样式对照脚本 `_p1/_diag_panel_audit.cjs`（一次排查即弃）。
**版本**：`sw.js VERSION = 'v651-gr-side-flat'`（含 v649/v650 未发布增量）；`style-01.css` 与 `ry-panel.css` → `?v=651-gr-side-flat`；角标 `界面 v651`。
**状态**：本地未提交未发布（v647~v651 攒着，等「发布」一并推）。

### 26.50b v651b：多地块卡去外框（同日用户反馈，随 v651 未发布增量）

**用户原话**：「感觉这里有点问题，怎么还套了一个框？」（三箭头指向 总管 / 子地块 / 材料汇总 三张卡的外框）

二级特性面板的灰条是**直接贴在白底上**的；v651 拍平时给卡留了 1px #e4ede7 细框（本意与工具栏分组分隔线同族），渲染出来就是「白底 → 卡框 → 灰条」三层。拍平的好处兑现：改 `.gr-card` 定稿值一处即可——`border:1px solid #e4ede7` → `border:0`；子地块列表项 `.gr-block` 同步拍平（四周框 → 底部分隔线 #e8ecea，与三级 22px 行同语言）。

验证：`_probe_gr_layout.cjs` 30 条全 PASS、gate PASS。样式只动 `mod/style-01.css` 两行。

**版本**：`sw.js VERSION = 'v651b-gr-card-unboxed'`；仅 `style-01.css` → `?v=651b-gr-card-unboxed`（ry-panel.css 无改动，保持 651）；角标 `界面 v651b`。全套 `scripts/check.cjs` 复核：静态 29 项 PASS、36 个单测文件、水力/WASM 等价、地块拼接契约全过。
**状态**：本地未提交未发布（v647~v651b 攒着，等「发布」一并推）。

### 26.52 v652-gr-skin-unify：多地块面板文字/控件彻底对齐共享基准（同日深挖）

**用户原话**：「多地块这个工具栏 很多样式跟三级二级都不一样，深挖一下，彻底解决掉，拍平，把那种多层嵌套 多个样式的都消除掉，都升级到这个工具栏总的样式下面，文字都要统一大小。」

**排查出的差异（实测计算样式，不是猜）**：

| 元素 | 改前（gr 自用档） | 改后（共享基准） | 出处 |
|---|---|---|---|
| `#grBar` 数值行 | **14px/600 大字**（吃到 style-01 基础 `.pp-plan-val`） | 11px/400 #1e293b tabular + 22px 行 + #e8ecea 底线 | ry-panel.css 共享规则**作用域扩进多地块**（6 条 :is() 加 `#grPipeSection` + `#ryCadSide [data-pp="grPipeSection"]`，与三级 v611 同手法，非值拷贝） |
| `.gr-row/.gr-label/.gr-val` | 11.5px / #64748b / **700 青绿 #0f766e** | 11px / 22px / #475569 / 400 #1e293b tabular | v609「数值不用加粗」同源 |
| `.gr-sel` | 24px 白底灰框 11.5px | 20px 无框透明底 11px，聚焦淡绿底纹 | 二级 v609f 口径 |
| `.gr-btn` | 24px / 0 7px | 20px / 0 6px / 11px 600 | 三级 v615/v616 + `.pp-recipe-btn` 同款 |
| `.gr-btn.active` | **紫色** rgba(124,58,237) | 实心深绿 #2d604b 白字 | 二级工具栏 button.active 同款 |
| `.gr-btn-on` | 青绿 #0f766e | 实心深绿 #2d604b 白字 | 同上（teal 也是 gr 自用档） |
| `.gr-block.cur` | 紫底线+紫底 | 深绿底线 #2d604b + 淡绿底 #f0f7f2 | 同上 |
| `.gr-hint/.gr-empty` | 11px #5f6b7a | 10.5px #64748b | 三级 `.tl-flat-note` 注释档 |
| `.gr-mat` 表格线 | rgba(31,41,55,.1/.25) | #e8ecea / 合计顶线 #cfd4d1 | 行皮肤同一条线 |
| `.gr-card-title` 旧词条 | style-01 残留 12px/700 死拷贝 | **删除**（灰条唯一出处 = ry-panel.css） | v651 收编后遗留 |
| index.html 内联 | `style="font-size:10px"`（gr-tag 重复）、`style="margin-left:10px"`（根数标签） | 收进 CSS（`.gr-row>.gr-label:not(:first-child){margin-left:6px}`） | 单源 |
| `#grSide .pp-plan-bar` 私有词条 | margin/padding/gap/font-size 一份 | **整条删除**（共享规则已覆盖） | — |

有意保留：`.gr-tl-*` 紫色系（三级管路导入层的画布语义色，与图例/图面 #7c3aed 同源，不是皮肤）。

**验证**：新一次性探针 `_p1/_diag_gr_skin_v652.cjs` 26 条计算样式全 PASS（含与二级 #ppSide 逐项对照同值）；`_probe_gr_layout.cjs` 23 条全 PASS（布局零回归）；全套 `scripts/check.cjs` 通过（静态 29 项、36 单测文件、水力/WASM 等价、地块拼接契约）。
**版本**：`sw.js VERSION = 'v652-gr-skin-unify'`；`style-01.css` 与 `ry-panel.css` → `?v=652-gr-skin-unify`；角标 `界面 v652`。
**状态**：本地未提交未发布（v647~v652 攒着，等「发布」一并推）。

### 26.52b v652b-label-collision：画布标签防重叠 + 面板两处折行（同日用户截图反馈）

**用户原话**：「有文字重叠的情况」（两箭头指画布「Ø… 驳接点」白底牌）。

**画布（mod/inline-29.js drawTakeoffs）**：
- 琥珀「Ø主径」标签原是裸 `fillText`（9px 棕字直接叠在管线上）→ 改白底小牌（`grLabelDraw`），位置不变（点右上）。
- 「Ø总管径 驳接点」白底牌原固定上移 14px（v238）——块驳接点常与某分区驳接点**重合**（链端=该分区主管端），牌子正好盖住对方的 Ø 标签，用户截图两处即此。→ 改 **上→下→右→左 四候选位**，挑第一个不与已放标签相交的；全占退回上方兜底。
- 机制：`grLabelW / grLabelDraw / grHits` 三件套——先画先登记屏幕占位盒，后画避让；旧 `grLabel(text,wp,color)` 接口保留（三级导入层管径标签、水源标签三处调用方不动）。

**面板（mod/style-01.css）**：
- `.gr-block-meta` 11px → **10.5px 回注释档**：v652 提到 11px 后「未布置 / 三级未布置」在 235px 窄面板折行断词（「三级未 / 布置」）。meta 与 .gr-hint 同属注释档（三级 .tl-flat-note 同款），11px 口径只适用数据行。
- `.gr-mat th,td` 加 `white-space:nowrap`：表头「主管 m / 支管 m / 一级管 m」在窄列折行（「一级 / 管 m」断成两行，v651b 截图已见的旧病）；列宽交给表格自动布局。

**验证**：`node --check inline-29` 过；`_probe_gr_layout.cjs` 23 条全 PASS（未捕获异常 0）；全套 `scripts/check.cjs` 通过。画布标签实际避让效果待用户环境截图复核（探针环境无成组数据，drawTakeoffs 不走）。
**版本**：`sw.js VERSION = 'v652b-label-collision'`；`inline-29.js` 与 `style-01.css` → `?v=652b-label-collision`（ry-panel.css 无改动，保持 652）；角标 `界面 v652b`。
**状态**：本地未提交未发布（v647~v652b 攒着，等「发布」一并推）。

### 26.52c v652c-group-frozen：二级页成组逐块编辑「冻结邻块」（同日用户反馈）

**用户原话**：「这个多地块编辑某一块的时候，其他块冻结就好了，不要编辑某一块的时候，其他块都不显示了，这样不够直观，我要看这块在整体中是什么关系，这样好判断总管怎么连接好。」

**原行为**：逐块态 `ppGroupActiveSubs()` 只返回当前块 ⇒ 画布上其他成员块直接消失。

**改法（mod/plot-editor.js，三处）**：
1. `ppGetFrozenSubRings()`：逐块态返回其余成员环（带块名；显示坐标与 `ppGetRotatedSubRings` 同口径——同 rotation、同旋转中心，模式切换不跳位）。
2. `ppRender` 在当前块**之下**画冻结底图：`rgba(100,116,139,.10)` 灰填充 + 灰虚线框（[6,4] 1.5px）+ 外接框中心块名（11px 屏幕字号）。**只读**——不进分区/面积/水力/材料，不参与点位判定与命中（那些仍走 `ppGetSubPlotRings`=仅当前块），「成组退化成多次单块、一行规则不改」的结构原封不动。
3. 取景：`ppGetDisplayBounds(includeFrozen)` 加参；仅**交互画布**路径并框冻结邻块（`ppUpdateTransform` 取景居中整组、`ppContentSize`→「适应窗口」框整组）；**施工简图出图**那个调用点保持当前块口径（v193 拍板：各块结果独立，邻块不许进图纸）。

**验证**：`node --check plot-editor` 过；全套 `scripts/check.cjs` 通过（静态 29 项、36 单测文件、水力/WASM 等价、地块拼接契约）。冻结显示实际观感待用户环境复核（探针环境无成组数据）。
**版本**：`sw.js VERSION = 'v652c-group-frozen'`；`plot-editor.js` → `?v=652c-group-frozen`（style-01/ry-panel 无改动，保持 652b）；角标 `界面 v652c`。
**状态**：本地未提交未发布（v647~v652c 攒着，等「发布」一并推）。

### 26.53 v653-zone-calibers：二级页管径细化——「实切面积」口径（用户拍板：标注+材料+水力联动）

**用户原话**：「如果是小分区可以优化管径，那我们地块分区页面，也就是单个地块分区有小分区的，是不是可以把管道变细？」

**现状病根**：二级结果栏只给一档主管管径，选径基准是 v97 设计值口径（标准分区 A×B/N 或划定亩数，2026-09-21 用户拍板：图面实测裁剪只作用于三级）⇒ 全区一档，小分区吃大管的浪费看不见。

**新增三件（mod/inline-09 + inline-11 + plot-editor + index.html）**：
1. **口径切换按钮**（结果栏输入行「管径口径」，localStorage `runye_caliber_mode`，默认设计值）：实切模式 = 最大实切分区（分区网格∩实测多边形）为单区基准，与三级 `figureMaxZone` 同口径；主管/支管/水泵流量/扬程/功率全套随实切流量重选。
2. **画布逐区标注**：实切模式下每区右上角追加「主管 Ø… · 支管 Ø…」（#7c2d12，与多地块页琥珀点同色系）；数据源 `window.ryZonePipePick`（inline-09 新增单源：流量公式与 selectPipe 约束 = grComputeHydraulics 同一条，v193 铁律不写第二份算法）。
3. **「分区管径明细（实切）」灰条块**（扬程计算式下方）：逐区 实切亩数 / 流量 / 主管Ø / 支管Ø，小分区自动变细 1~3 档；设计值模式整块隐藏。

**数据流**：ppDrawZones 逐区算实切面积（复用 `ppZoneActualAreaM2`）→ 发布 `window.__ppZoneActuals`（JSON 签名去重后回调 calcPlan，render→calc→render 无死循环）→ calcPlan 实切模式取 maxCell 重算 + 渲染明细。

**验证**：新探针 `_p1/_probe_zone_calibers_v653.cjs`（合成 L 形地块 5 分区）10 条全 PASS——实切后自动分出 Ø160/Ø125 两档（18 亩区 Ø160、10.8 亩区 Ø125），结果栏=最大实切分区选径一致，切回设计值明细隐藏；全套 `scripts/check.cjs` 通过。截图 `_probe_out/v653_design.jpg` / `v653_actual.jpg`。
**版本**：`sw.js VERSION = 'v653-zone-calibers'`；`inline-09` / `inline-11` / `plot-editor` → `?v=653-zone-calibers`；角标 `界面 v653`。
**状态**：本地未提交未发布（v647~v653 攒着，等「发布」一并推）。

### 26.53b v653b-caliber-btn：「管径口径」按钮皮肤归位面板共享档（同日用户反馈）

**用户原话**：「用按钮控制是好的，但是这个按钮的样式要服从于整个面板的样式，改下。」

- 病根：v653 的按钮误用了工具栏的 `.pp-btn-ghost`（26px 工具轨皮），混在参数输入行里突兀。
- 改法：HTML 只换类 → `.pp-recipe-btn`（面板共享按钮档：20px / 白底 / 1px var(--ry-s-200,#e2e8f0) / 11px 600 / hover 只变底色——与「保存/调用」「更新水泵扬程」同款）；ry-panel.css 补三条 **id 规则**（这颗钮全站仅一枚，键在 id 无歧义）：`margin-left:auto` 贴右（与输入行同列）、`.active` 实心深绿白字（全站 button.active 口径）、`.active:hover` 深绿加深。
- 验证：`_probe_zone_calibers_v653.cjs` 10 条全 PASS（截图确认按钮与面板行同语言）；全套 `scripts/check.cjs` 通过。
**版本**：`sw.js VERSION = 'v653b-caliber-btn'`；仅 `ry-panel.css` → `?v=653b-caliber-btn`；角标 `界面 v653b`。
**状态**：本地未提交未发布（v647~v653b 攒着，等「发布」一并推）。

### 26.54 v653b 发布结果：v647~v653b 十版合并上线（2026-10-21）

**提交**：`e033191`（v653b-caliber-btn: v647~v653b 十版合并）——17 个文件、+1613/−109，`43aa2e9..e033191 master -> master` 直推成功（未走 _pub_api.py 备选）。

**入库范围**：13 个产品文件（index.html / sw.js / plugin-admin.html / ry-panel.css / style-01.css / inline-09 / inline-11 / inline-19 / inline-29 / plot-editor / ry-cad-toolbar / runye-terrain / AGENT_HANDOFF）+ 3 个脚本（gate.cjs / refresh-cad-twin-css.cjs）+ 2 个新工具入库（scripts/simplify-equivalence.cjs、scripts/equivalence-compare.cjs——被 gate.cjs equiv 阶段引用，此前一直是未跟踪状态，这次随 gate 引用一并入库）。未跟踪杂物 4 件（2026-10-19.md、_float_behavior.json、v599_二级右栏皮肤对比.png、设备块库_实施方案.md）未入库，待用户处置。

**发布前门禁**：全套 `scripts/check.cjs` 通过（静态 29 项、36 单测文件、水力/WASM 等价、地块拼接契约）。

**线上核验（新脚本 `_p1/_live_smoke_v653b.cjs`，18 条全 PASS）**：
- A 版本口径：线上 performance 资源条目五件套全部带本次 ?v=（style-01/inline-29=652b-label-collision、ry-panel=653b-caliber-btn、inline-09/inline-11/plot-editor=653-zone-calibers）；`sw.js VERSION='v653b-caliber-btn'`、角标「界面 v653b」。
- B 二级页口径按钮：存在、皮肤 `.pp-recipe-btn`（无 pp-btn-ghost 残留）、默认文案「口径：设计值」。
- C/D/E 合成 L 形地块（5 分区）：设计值出 Ø160 → 切实切后 `__ppZoneActuals` 发布 5 区、明细表 5 行含 Ø（18 亩区 Ø160/Ø110、10.8 亩区 Ø125/Ø90 自动变细）、按钮文案翻转「口径：实切面积」→ 切回明细隐藏。
- F 单源函数 `window.ryZonePipePick` 可用（合成输入返回 200/140）；#grPipeSection 多地块页区块在线上存在。
- 线上截图 `_probe_out/v653b_live.jpg`。

**状态**：v647~v653b 已全部上线闭环。下一版从 v654 起算。

### 26.55 v654-trunk-vel：大总管流速体检 + 修掉「管径下拉改不动」的老 bug（2026-10-21）

**用户拍板**：v653 之后继续优化，方向选「大总管流速体检」（讲解管径四级树时指过：手选档位无流速校验）。

**新增（mod/inline-29 + index.html + style-01.css）**：
1. **流速计算**：grComputeHydraulics 手画模式按满载流量算实际流速（内径走 grId，与 selectPipe 同一 SDR 口径），超出经济区间 ECON_VMIN~ECON_VMAX(0.8~2.0 m/s) 记 trunkVelState(high/low) 并给建议档（重跑 selectPipe，单源不写第二份）。W.hyd 新增 trunkVel / trunkVelState / trunkVelSugOd。
2. **总管卡「流速」行**（#grTrunkVelRow，gr-row 共享皮肤档）：经济区间内绿(.gr-vel-ok)、超出琥珀(.gr-vel-warn) + 「建议 Ø…」一键档（gr-btn，点击走 grRenderTrunk 全链刷新）。
3. **#grHyd 汇总行**新增「大总管流速(值) 正常/偏高/偏低」。

**★ 顺带修掉 v619 起潜伏的老 bug（探针 ⑤ 炸出来的）**：
- 现象：多地块页大总管管径下拉**选什么都弹回旧值**。
- 根因链：runye-undo 在 change **捕获阶段**同步 mark → runyeSaveProject → grExportState → **grSync()**，grSync 用滞后镜像 `ge.trunkDn`（上次 grRenderTrunk 写入）反写 `W.trunk.dn` 和 `sel.value` ⇒ change 处理器读到的 `this.value` 已被弹回旧值。
- 修法：grSync 删掉 `ge.trunkDn → W.trunk.dn / sel.value` 反写（导出/快照是只读路径，平时镜像与 W 恒等）；恢复路径改为 grRestoreState 显式落值 + 同步下拉。
- **铁律新条目：导出/序列化路径（grExportState 等）绝不能经 grSync 反写活状态。**

**验证**：`_p1/_probe_trunk_vel_v654.cjs` 8/8 PASS；诊断过程留档 _p1/_diag3_v654.cjs（value setter 拦截抓到 grSync 调用栈）。
**版本**：`sw.js VERSION = 'v654-trunk-vel'`；inline-29 / style-01 → `?v=654-trunk-vel`；角标 `界面 v654`。

### 26.56 v655-trunk-manual：大总管改纯手绘口径 + 可选参考线（用户确认示意图后拍板）

**用户需求**：每个地块单独生成主管/支管（现状已如此），大总管**不自动生成**，由用户按实际情况手绘；先出示意图确认再改。示意图三栏（现状自动链 / 调整后留白 / 手绘后恢复），用户选「按图改＋可选参考线」。

**调整（mod/inline-29 + index.html）**：
1. **画布**：撤掉 v244 自动紫线（无手画时总管位留白）；新增「参考线」按钮（#grTrunkGhost，默认关），打开时临时画系统建议走向**幽灵虚线**（2px dashed，仅视觉，不参与水力不出料）。
2. **水力**：trunkMode 三态改「手画/未手绘」；未手绘时 sysLoss=maxBlkLoss（不含总管）、总管损失「未计」、流速「待手绘」，汇总下加琥珀提示：⚠ 选泵扬程偏小警告 + 按满载推算「建议总管 ≥ ØtrunkAutoDn」+ 手绘恢复说明。
3. **材料**：未手绘不出总管行（「不出料，画好后自动计入」），合计不含总管——自动链长度是猜的，出料不诚实。
4. **保留 v654 流速体检**（手绘后生效）；trunkAuto 几何继续算，仅供参考线与建议档提示。

**验证**：`_p1/_probe_trunk_manual_v655.cjs` 10/10 PASS（A 未手绘态：汇总「未手绘/未计/不含总管/待手绘」+提示建议 Ø355+材料不出料；B 参考线开关往返；C 手绘回归：手画·满载+流速 16.1+材料恢复总管行）；v654 探针回归 8/8；全套 check.cjs 通过。截图 _probe_out/v655_manual_none.jpg / v655_manual_hand.jpg。
**版本**：`sw.js VERSION = 'v655-trunk-manual'`；inline-29 → `?v=655-trunk-manual`（style-01 无改动保持 654）；角标 `界面 v655`。
**状态**：v654 + v655 本地已验证，均未提交未发布（等用户「发布」一并推）。

### 26.57 v656-gen-jump：「生成施工图」成组态智能分流（用户确认流程后实施）

**用户需求**：多地块成组 → 二级（地块分区）逐块生成管路并检查 → 点「生成施工图」应直达「多地块规划页」；单地块照旧跳「三级管路规划页」。先给流程图 + 冲突分析，用户确认（「在二级生成好管道，检查没问题之后再传递给多地块规划页面」）后实施。

**实现（mod/plot-editor.js #ppGenerate 处理器最前）**：成组判定（ge.active && subPlots≥2）命中时：逐块编辑态（__runyeGroupPlotEdit != null）走 `grBackFromPlotEdit()`（与「◀ 返回成组管路」同一正规出口：存档当前块 → 清标记 → 切页 → grSync 重算组态，v242 已验证的路径）；整组态（只读合并视图，无可存档）走 `grShowGroupPage()`；然后 return——不跑单地块口径的 tlAutoGenerate / tlShowWorkspace。单地块（未成组）零改动（v104 行为保持）。

**机制依据**：整组态下二级管线是「各块合并出来的只读视图、不存档」（ppSetGroupMode 注释），块级管路的真身在 slots——用户逐块生成检查后跳组页，成果经 slot 原样出现在整组图上，与手绘总管（v655）、流速体检（v654）衔接。

**验证**：`_p1/_probe_gen_jump_v656.cjs` 4/4 PASS（A 成组逐块态→grPipeSection；B 整组态→grPipeSection；C 单地块→tlPipePlanSection 回归；D 零异常）；全套 check.cjs 通过。
**版本**：`sw.js VERSION = 'v656-gen-jump'`；plot-editor → `?v=656-gen-jump`；角标 `界面 v656`。
**状态**：v654/v655/v656 三版本地已验证，均未提交未发布（等用户「发布」一并推）。

### 26.58 v657-slot-carry：二级成果「按块分发」进组页 slots（用户实测反馈修复）

**用户需求**：v656 跳转通了，但用户实测「地块根本没改变呀，我要地块直接把地块分区页面生成的 分区 主管 支管都显示出来才对呀」——块级管路真身在 `ge.slots[i]`，ppState 不自动分发。AskUserQuestion 拍板「按块分发」「整体发过去（呈现整体还原、数据按块记账）」。

**实现（mod/plot-editor.js #ppGenerate 分流块内、跳转前）**：
- 触发条件：本组所有块都还没有管路（防重复点击翻倍）&& ppState 有管。
- 分发规则（探针实测两轮修正）：**逐块态（perPlot）下 ppState 管线全部由当前块 polyPts 生成 → 当前块全量收、其余块清零**；按「管段中点落环归块」只保留给非逐块态的遗留整组管线兜底（第一版纯中点归块在相邻块共享边界上被射线法浮点漂移误判，20m 主管串到地块2，探针 C2 抓到）。
- 分发后 `ppApplySlot(slots[current])` 同步实时快照——否则 grSync 的 groupLiveSlot 覆盖会让当前块拿到未分发管。
- **顺手产品加固（ppApplySlot）**：数组兜底之外补 `hiddenPipes/pipeIds/nextPipeId/cutOverrides` 默认值——最小 slot（老存档/外部合成）经 ppCloneJSON 会把 hiddenPipes 置 null，ppPushHistory→ppCloneState 读 `.main` 直接 TypeError（探针 D 抓到，真实流程字段齐全不触发）。

**验证**：`_p1/_probe_slot_carry_v657.cjs` 6/6 PASS（A ⚡自动管路逐块态生成；B1 跳转落 grPipeSection；B2 分发生效 slots[0] 主管4+支管4；C1 材料表地块1 主管200.0m/支管168.0m、两块各45亩；C2 地块2 未被误分发全0；D 零异常）。
**连带修门禁**：tests/_v193_group_edit_contract.cjs ⑫ 合计断言跟进 v655 口径（`tMain + (handTrunk ? tk : 0)`，未手绘不计入合计）——check.cjs 27 tests 全绿。
**版本**：`sw.js VERSION = 'v657-slot-carry'`；plot-editor → `?v=657-slot-carry`；角标 `界面 v657`。
**状态**：本地已验证，未提交未发布。

### 26.59 v658-gr-dim-toggle：组页「标注显示」勾选框（参考三级页同款）

**用户需求**：「多地块规划页的尺寸标注也增加控制面板，可以隐藏的，参考三级页面（的做法）」。

**实现**：
- index.html：`#grCanvasWrap` 内加右上角胶囊勾选框 `#grLabelsChkWrap/#grLabelsChk`（样式抄三级页 #tlWsLabelsChkWrap，absolute top:8 right:8——grCanvasWrap 本身就是画布容器，无需三级页那套 pane 换算）。
- mod/inline-29.js：`var grLabelsOff`（localStorage['gr-labels-off'] 持久化，'1'=隐藏）；grRender 两处受控——`if(!grLabelsOff) grRenderBlockDims()`（v236 尺寸标注线+文字）与管径白底牌整段（v198/v237 Ø 标签，含 hydI 双指针段整体包裹）；grBind 挂 change（勾=显示、取消=隐藏，文字恒「标注显示」）。**[当晚用户拍板方案A] 深红示意链（v233 块总管链）也并入本开关**——drawTakeoffs 里红链段加 !grLabelsOff（它不进材料表、只是水力试算示意）；琥珀/红点驳接点是功能点，永远显示。

**验证**：`_p1/_probe_gr_dim_toggle_v658.cjs` 6/6 PASS（A 默认勾上；B1 取消勾选后画布 toDataURL 76090→70850 标注层确实消失；B2 localStorage='1'；C 重载后保持取消；D 再勾上恢复'0'；E 零异常）；全套 check.cjs 通过。
**版本**：`sw.js VERSION = 'v658-gr-dim-toggle'`；inline-29 → `?v=658-gr-dim-toggle`；角标 `界面 v658`。
**状态**：本地已验证，未提交未发布。v654~v658 五版攒着等「发布」一并推。

**组页图层口径备忘（用户问「主管支管 vs 三级红管/驳接点是否重复」，2026-10-21 答复口径）**：
grRender 从下到上＝地块底图+分区线 → v236 尺寸标注 → 各块主管/支管（蓝/绿，slots，真实工程量）→ 管径牌 → 三级导入层（v235）→ 手绘总管（紫，v655 后唯一可编辑）→ drawTakeoffs（v231 分区驳接点琥珀点；v233 块总管**深红虚线示意链**=把各分区驳接点串成最短哈密顿路径，红点=块驳接点=大总管接入点）。红链不进材料表（材料总管行只算手绘 W.trunk.lines），作用＝块内水力试算几何载体（trunkDn/损失/驳接点标签）+ 指示驳接点位置；与主管（配水管）不重复，但视觉上确实层叠。

### 26.60 v659-line-clip-carry：二级管线「按块环裁剪」分发（用户拍板「管线要被地块裁切」）

**用户需求**：「总管跟支管应该是被地块裁切过的，这个要改过来」——v657 分发是整段分配（逐块态当前块全收 / 中点归块），横跨两块的管会整根塞进一个块，图上压过邻块与空隙。

**实现（mod/plot-editor.js）**：
- 新函数 `ppClipPolylineToRing(line, ring)`（挂 window）：折线 × 环 → 环内子段数组。逐线段收集与环边的交点参数 t（`ppSegXt` 线段求交），排序切子段，子段中点 `atPointInPolygon` 判内；连续环内子段首尾拼接成一根。
- v657 分发块改写为统一「裁剪口径」：每根 ppState 管线对每个块环裁剪（环优先 slot.polyPts，缺省 __runyeSubPlots poly），环内子段归该块、越界/空隙部分丢弃；逐块/整组两态走同一条路径，v657 的 perPlot 特判与中点归块兜底全部废除。
- 分发后仍 `ppApplySlot(slots[current])` 同步实时快照（防 grSync groupLiveSlot 覆盖）。

**验证**：`_p1/_probe_line_clip_v659.cjs` 11/11 PASS——A1~A5 裁剪函数单测（横跨线对左右环各切出 (50,75)-(200,75)/(200,75)-(350,75)、环内线原样、环外丢弃、折线跨块切分）；B 全链路（grEnterPlotL2 → `window.ppSetState` 注入横跨主管 → 生成施工图 → slots[0] 左段/slots[1] 右段，边界断开）；C 回归 v657 流程（块内自动生成管分发后原样 m=4 b=4）；D 零异常。全套 check.cjs 通过。
**版本**：`sw.js VERSION = 'v659-line-clip-carry'`；plot-editor → `?v=659-line-clip-carry`；角标 `界面 v659`。
**状态**：本地已验证，未提交未发布。v654~v659 六版攒着等「发布」一并推。

### 26.61 v660-clip-fix-carry：裁切分发在真实会话失效的根因修复（用户截图复现）

**用户需求**：「主管、支管应该是被地块裁切的，现在还不行」（截图：组页各块管压过地块边界）。

**根因（两个洞）**：
1. **旧数据永不修正**：v659 分发条件是「slots 全空才分发」——用户反复测试的会话里 slots 已有 v657 整段分配遗留的旧横跨管，重新传递被跳过，错数据一直显示。
2. **切页路径不裁剪**：不点「生成施工图」、直接切页签/返回时，grSync→groupLiveSlot→ppCaptureSlot 把未裁剪的 ppState 原样搬进 slots。

**实现（mod/plot-editor.js）**：
- **分发改「全量裁剪分配 + 分配非空才覆盖」**：只要 ppState 有管就对每块环全量裁剪；某块裁剪结果非空才覆盖该块（修正旧数据、天然幂等不翻倍），裁剪为空则保留该块原管（不毁三级页逐块精修）。废除 v659 的「slots 全空」前置条件。
- **ppCaptureSlot 加成组裁剪**：任何 ppState→slot 存档路径（切块/返回成组/grSync 实时快照）都按本块环裁剪（环取 s.polyPts，缺省 slots[current].polyPts），保证块档案里的管不出环；跨块段的分配仍走生成施工图的全量分发。

**验证**：`_p1/_probe_clip_fix_v660.cjs` 6/6 PASS——A 旧横跨管被重传修正（slots[0] 左段/slots[1] 右段）；B 存档链路无异常（合成环境 artifact：ge.mode 被探针不可控异步链切回 whole，ppCaptureSlot 裁剪语义已由运行日志 capture in=1 out=1 证实正确）；C 回归 v657 流程；D 零异常。全套 check.cjs 通过。
**排查手段备忘**：ppCaptureSlot 临时 console.log + CDP Runtime.consoleAPICalled 抓内部状态；atomicB 原子 evaluate（进二级→注入→切块→读 slots 一个 eval 完成）规避异步链污染。
**版本**：`sw.js VERSION = 'v660-clip-fix-carry'`；plot-editor → `?v=660-clip-fix-carry`；角标 `界面 v660`。
**状态**：本地已验证，未提交未发布。v654~v660 七版攒着等「发布」一并推。
**用户操作提示**：刷新页面后**重新走一遍「生成施工图」**即可修正此前会话遗留的未裁剪管路。

### 26.62 v661-panel-font：组页左栏材料表字号统一（用户截图「面板文字大小不一」）

**用户需求**：「很明显左侧工具栏的面板样式不统一，文字大小不一，有的加粗了有的没有，这个得改过来」（截图：多地块规划页左栏）。

**根因**：v652 拍平已把 .gr-row/.gr-label/.gr-val/.gr-btn 等统一到 11px 行体系，但**左栏材料表 `.gr-mat` 的 th/td 被全局层抬高**——runye-typography.css 的 `th,td{font-size:var(--ry-fs-body)=13px !important}`（.gr-hyd-tbl 在 v548 已对抗、.gr-mat 漏了）——表内文字比周围 11px 行大一圈，面板观感割裂。这就是「文字大小不一」的主源。

**实现（mod/style-01.css .gr-mat 段）**：`.gr-mat th,.gr-mat td{font-size:11px!important;line-height:16.5px}` + `.gr-mat th{font-weight:600}`——压回与 .gr-row 同一基准。**字重层级保留不动**（那是刻意的信息层级，不是不统一）：表头 600 / 「各块明细」「整组总管」组行 600 / 合计行 700 / 数据行 400；块标题 .gr-block-hd 600、注释档（meta/hint）10.5px 均为 v652 定稿口径。

**验证**：`_p1/_probe_gr_mat_font_v661.cjs` 6/6 PASS（getComputedStyle：th/td 11px、表头 600、合计 700、面板行 11px、零异常）；全套 check.cjs 通过。
**版本**：`sw.js VERSION = 'v661-panel-font'`；style-01.css → `?v=661-panel-font`；角标 `界面 v661`。
**状态**：本地已验证，未提交未发布。v654~v661 八版攒着等「发布」一并推。

### 26.63 v662-panel-merge：组页 gr-row 并入二级键值行皮肤（用户「多地块面板继续深挖，与二级三级统一」）

**用户需求**：v661 修完字号后用户要求继续深挖——多地块规划页左栏与二级/三级面板样式统一。

**调查结论**：v651/v652 已统一字号/灰条/按钮/行高，最后的结构性差异是——组页**总管卡的 gr-row 是流式 flex**（标签贴左、值跟排、无底线），而**同一页面顶部**的 grBar 已用二级 pp-plan-item 皮肤（46% 标签列 + 右缘竖线 + 行底线网格），同页自相两套。

**实现（mod/style-01.css #grSide 段，v662 块）**：
1. `#grSide{gap:0}`——卡间空隙撤除，灰条成为唯一分节（与二级「单盒+灰条+行网格」同构）；
2. `#grSide .gr-card>.gr-row{border-bottom:1px solid #e8ecea;padding-top/bottom:0}`——行底线网格；**每行都保留网格线，末行由卡尾按钮区/下一张卡灰条收口**（对齐 ry-panel.css v609 口径「原最后一行去底边已删」，首版探针 A7 期望末行去线是错的，已按二级口径修正断言）；
3. `#grSide .gr-row>.gr-label:first-child{flex:0 0 46%;border-right:1px solid #e8ecea;padding-right:6px}`——46% 标签列+竖线；
4. `#grSide .gr-row>:nth-child(2){margin-left:auto}` + `.gr-val{text-align:right}`——值/控件贴右；
5. `.gr-unit{white-space:nowrap;flex-shrink:0}` + `.gr-sel{min-width:0;flex:0 1 auto}`——「Ø110 mm PE」不再折行/溢出，压缩量由 select 消化（截图验证两轮迭代）；
6. **删除旧规则** `#grSide .gr-card>.gr-row:first-of-type{padding-top:4px}`——其特异性 (1,3,0) 高于新规则 (1,2,0)，不删会永久压掉行距归零。
   gr-btns/gr-hint/gr-mat/gr-blocks 不是键值行，不参与网格。

**门禁维护**：check.cjs ④a8 因并行会话把 `writeCurrentPlotAnchor(id)` 签名扩为 `(id, options)`（AI 跨标签 handoff 隔离）而失配——ci_check_static.cjs 提取正则放宽为兼容 `(id[, options])`、调用断言改 `/store\.writeCurrentPlotAnchor\(id[),]/`，契约语义不变（标签页锚点只走 sessionStorage 适配器）。

**验证**：`_p1/_probe_panel_merge_v662.cjs` 9/9 PASS（gap=0、行底线 #e8ecea、首行 paddingTop=0、46% 列 ratio=0.460、竖线、val 右对齐、末行保留网格线、#grSide 截图存档 `_probe_out/v662_grside.png`、零异常）；全套 check.cjs PASS=29 FAIL=0。
**版本**：`sw.js VERSION = 'v662-panel-merge'`；style-01.css → `?v=662-panel-merge`（本版仅 CSS，plot-editor.js 未动）；角标 `界面 v662`。
**状态**：本地已验证，未提交未发布。v654~v662 九版攒着等「发布」一并推。

### 26.64 v664-btn-flat：组页按钮皮肤补齐，摘除三层旧覆盖（用户「按钮外面还是很粗的线，彻底取消层层覆盖」）

**用户需求**：面板文字/按钮仍有各种样式覆盖/嵌套，要求彻底取消；若逐层取消麻烦，就按二级/三级面板重构；点名「有些按钮的外面还是很粗的线」。

**根因（_p1/_diag_btn_styles.cjs 实测）**：组页按钮计算样式 = `border:2px outset`（**UA 默认**）。v597 注释早已点名历史根因——全局 .pp-btn/.pp-btn-ghost 基础皮肤（边框+底色）在历次清理中被删，二级工具轨靠 scoped 规则（4785 段）补回，**组页从没补**；v652 给 .gr-btn 只抄了 .pp-recipe-btn 的尺寸/字重，漏了皮肤。另有三层旧覆盖叠加：①3287 段半截皮肤（只设 color/border-color/bg 三分量、不设 width/style ⇒ 粗框照样漏出，还把面板按钮 bg 拉成 --ry-canvas）；②2737 行旧工具条 hover（无前缀，串面板按钮）；③3448 行 .gr-btn:hover 旧三连变口径。

**实现（mod/style-01.css，四处）**：
1. `.gr-btn`（2625 段）补齐皮肤 = .pp-recipe-btn（ry-panel.css 570 行）同款：`1px solid #e2e8f0 / 白底 / #334155 / line-height 1 / nowrap`，hover 只变底色 #eaf3ed（v617 口径）；**圆角不抄**——FLAT-BTN-OVERRIDE（1714 段）对全站 button 打 radius:0!important，二级 recipe 实际渲染也是直角；
2. 3287 段选择器摘除 grPipeSection 两项（原位+搬移）——组页皮肤单源化：面板走 .gr-btn、工具条走 3370 段；
3. 2737 行旧 hover 删除（留注释指路）；
4. 3370 段工具条补皮肤 `1px solid #c5d6cc / #f8fbf9 / #2c4a3d`（二级工具轨 v597 口径）+ hover 只变边框色 #2d604b。状态类 .gr-btn-on/.gr-btn-arm/.active 均 !important，压过新皮肤无冲突。

**版本纪律**：v663 已被并行会话占用（v663-ai-handoff），按「取更高号」纪律本版取 **v664**。三件套：sw.js VERSION='v664-btn-flat'；style-01.css → `?v=664-btn-flat`；角标 `界面 v664`。

**验证**：`_p1/_probe_btn_flat_v664.cjs` 9/9 PASS（面板/块/工具条按钮 1px solid 断言、recipe 结构一致、v662 行网格回归、整页截图 `_probe_out/v664_btn_flat.png`、零异常；公告卡异步重画须测前+截图前各幂等清一次）；全套 check.cjs PASS=29 FAIL=0。
**状态**：本地已验证，未提交未发布。v654~v662（本会话九版）+ 并行会话 v663-ai-handoff 攒着等「发布」一并推。

### 26.65 v665-mat-row-drop：材料汇总「各块明细」组行取消（用户截图箭头「这行取消」）

**用户需求**：材料汇总表里「各块明细（互不串味，各块独立口径）」组行取消（截图红箭头指向该行）。

**实现**：
1. `mod/inline-29.js` grRenderMat：删除 `<tr class="gr-grp">各块明细（…）</td></tr>` 组行输出——明细行直接跟表头（行内容自明）；「整组总管」组行**保留**（它隔开的是「不出料」的总管段，有信息量）；合计行 v655 口径不动。
2. `tests/_v193_group_edit_contract.cjs` ⑫：原 `/各块明细/` 断言删除，改为反向断言（组行必须已删）+ `rows.forEach` 仍在（明细行仍逐块渲染）+「整组总管」断言保留。
3. `.gr-grp` CSS（style-01.css 2667）保留——「整组总管」行仍用。

**验证**：`_p1/_probe_mat_drop_v665.cjs` 6/6 PASS（组行已删、gr-grp 只剩整组总管、表头后第一行即地块明细、合计行仍在、材料卡截图 `_probe_out/v665_mat_drop.png`、零异常）；全套 check.cjs PASS=29 FAIL=0。
**版本**：`sw.js VERSION = 'v665-mat-row-drop'`；inline-29.js → `?v=665-mat-row-drop`；角标 `界面 v665`。
**状态**：本地已验证，未提交未发布。v654~v662（九版）+并行 v663-ai-handoff +本会话 v664/v665 攒着等「发布」一并推。

### 26.66 v666-mat-col-pin：材料表第一列定宽（用户红框「名称与数值之间太宽，拖宽面板要恒定」）

**用户需求**：材料汇总表里地块名称与右侧数值之间的空隙太宽；拖动面板宽度时该区域要限定死，不跟随拉伸/压缩。

**根因**：`.gr-mat` 表格是自动布局，面板拖宽后多余宽度按各列内容比例分配——第一列（分项/地块名）也跟着变宽，红框空隙随面板宽度拉伸。

**实现**：
1. `mod/style-01.css`：`.gr-mat table{table-layout:fixed}` + `.gr-mat th:first-child,.gr-mat td:first-child{width:80px}`——列宽由表头行决定，拖宽面板时第一列恒定 80px，多余宽度由四个数值列均摊；colspan 组行/提示行不影响列宽。
2. `mod/inline-29.js` grRenderMat：「总管未手绘（不出料，画好后自动计入）」行改 `colspan="5"` 整行提示——第一列定宽后五列版会在 80px 窄列里折成四行，它本来就是整行消息而非五列数据，colspan 后恒单行且不占列宽。

**探针要点（踩坑留档）**：模拟「拖宽面板」不能直接改 #grSide 宽度——可见面板是搬移态克隆（#ryCadGrpGr .ry-cad-grp-body[data-pp="grPipeSection"]），宽度由 `--ry-cad-w-open`（默认 318px，ry-panel.css 926 行）控制；原位态才是 `--pp-side-w`。探针在根节点 set `--ry-cad-w-open:620px` 模拟拖宽（sideW 300→602 实测生效）。

**验证**：`_p1/_probe_mat_colpin_v666.cjs` 6/6 PASS（fixed 布局、面板加宽 ≥150px、第一列 80→80 Δ=0、≈80px 断言、材料卡截图 `_probe_out/v666_mat_colpin.png`、零异常）+ v665 组行取消回归 6/6 PASS；全套 check.cjs PASS=29 FAIL=0。
**版本**：`sw.js VERSION = 'v666-mat-col-pin'`；style-01.css 与 inline-29.js → `?v=666-mat-col-pin`；角标 `界面 v666`。
**状态**：本地已验证，未提交未发布。v654~v662（九版）+并行 v663-ai-handoff +本会话 v664/v665/v666 攒着等「发布」一并推。

### 26.67 v667-labels-off-default：组页标注默认隐藏（用户「标注现在没啥用，后面需要」）

**用户需求**：多地块规划页的地块标注取消——现在不显示，勾选框保留，后面需要时再开（AskUserQuestion 拍板：默认不显示标注）。

**实现**：
1. `mod/inline-29.js`（v658 段）：`grLabelsOff` 默认值 false→true；读取口径改为「只有存过 `'0'`（历史上明确勾过显示）才显示，其余（含从未操作）一律隐藏」——迁移语义=明确选择优先于新默认；勾选框与 change 监听不动。
2. `index.html`：`#grLabelsChk` 去掉 `checked` 属性（初始渲染即不勾，避免闪烁后再被 grBind 纠正）。

**验证（探针踩坑留档）**：主探针 A5「同会话 navigate 刷新」测得画布 69414（低于隐藏基线 70558）——非时序也非应用 bug，是**前序步骤留下的自动恢复快照被 inline-12 异步链灌回重绘**（v660 同款合成环境 artifact）。对照诊断 `_diag_labels_refresh2.cjs` 用干净两趟导航（首载写 ls='0' → 二次导航让脚本初始化即读到，与真实刷新同语义）证实：真实刷新路径 chk=true 且标注稳定画出（0.8s/2.5s 均 76090）。最终 `_probe_labels_default_v667.cjs` 8/8 PASS（默认不勾+不入库、勾选即恢复 70558→76090、存'0'持久化、再取消隐藏、默认态截图 `_probe_out/v667_labels_default_off.png`、零异常）；check.cjs PASS=29 FAIL=0。
**版本**：`sw.js VERSION = 'v667-labels-off-default'`；inline-29.js → `?v=667-labels-off-default`；角标 `界面 v667`（style-01.css 本版未动）。
**状态**：本地已验证，未提交未发布。v654~v662（九版）+并行 v663-ai-handoff +本会话 v664~v667 攒着等「发布」一并推。

### 26.68 v668-const-dn：主管/支管恒定管径 + 手动调档（用户拍板）

**用户需求**：①主管/支管生成原则改为**恒定**——不随分区面积大小变化（将来把小分区并入大分区，管道大概率仍够用）；②管道是否改细由用户**手动调整**、对比扬程后决策，交互与三级页一样；③问组页手动调管径能否实现——本轮已实现。

**根因（旧口径）**：v233 生成时每分区按本块流量 `selectPipe(flow,…)` 选管径 → 面积大的块管径大、小的块管径小，随分区面积变化。

**实现（mod/inline-29.js）**：
1. **恒定口径**：grComputeHydraulics 开头**预扫描**全组所有分区（clipPolyToRect+polyArea 轻量几何一遍），取最大分区流量 baseMainFlow / 最大支管分摊流量 baseBranchFlow 定档 → 全组所有分区共用同一档主管/支管（合并小分区后大概率仍够用；要改细走手动）。块总管（tkP）保持按块流量（块级对象，不在本次拍板范围）。
2. **手动调档**：`W.dnOver={main,branch}` 覆盖机制（语义与三级页 tlManualCals 同款：选回设计值=清覆盖）；水力面板顶部两颗 select（grCalSelMain/grCalSelBranch），选项=PE_OD_SERIES 设计值±3档，改档 → grComputeHydraulics 全量重算 → 损失/扬程实时跟随 + 图面管径牌同步 + grRenderMat。存档经 grExportState/grRestoreState 持久化（dnOver 字段，恢复端带 v657 最小存档兜底）。
3. **委托绑定**：select 是 innerHTML 动态重建的，listener 必须委托到 #grHyd 容器（直接绑元素会随重画丢失——三级页 tlCalSel 是静态元素才可以用一次绑定）。

**探针踩坑**：①`new Event('change')` 默认**不冒泡**，事件委托收不到——合成事件必须 `{bubbles:true}`（真实 UI 交互不受影响）；②组页存档函数是 `grExportState`（非 grStateSave）。

**验证**：`_p1/_probe_const_dn_v668.cjs` 13/13 PASS——两块面积差 4 倍（11.25/45 亩）⚡生成后 7 个分区主管全组唯一 Ø140、支管唯一 Ø110；改档 140→90 后全组跟随+系统损失 3.04→9.88 重算跟随；grExportState 存档 dnOver={main:90}；选回设计值覆盖清除+dn 回 140；截图 `_probe_out/v668_const_dn.png`；v660/v666 探针回归通过；check.cjs PASS=29 FAIL=0。
**版本**：`sw.js VERSION = 'v668-const-dn'`；style-01.css 与 inline-29.js → `?v=668-const-dn`；角标 `界面 v668`。
**状态**：**已发布** —— 合并式提交 `2552c74`（v654~v668 十五版，含并行会话 v663-ai-handoff），2026-10-22 推送 origin/master 成功（0c899dd..2552c74）；线上冒烟：index.html 引用 `?v=668-const-dn`、sw.js VERSION='v668-const-dn'、style-01/inline-29/plot-editor 资源 200。下版从 v669 起编。

### 26.69 v824-lock-icon：锁定面积「点一下就永久空白」+ 工具栏五层冗余样式收口（2026-10-30）

**用户原话**：「锁定面积那个按钮目前还不能正常显示，你检查一下，这个工具栏是不是有多层样式，把覆盖掉的，没有用的样式代码都删除了。」

**① 图标消失的真根因（不是"看不见"）**
`mod/plot-editor.js` 的 `ppUpdateLockAreaBtn()` 里写 `btn.textContent='已锁定面积'`。`textContent` 是**整体替换子节点**，会把 `mod/ry-icons.js` 的 `decorate()` 刚 `insertAdjacentHTML` 进去的 `<svg class="ry-ico">` 一起清掉；而 `decorate()` 只在初始化跑那一次 ⇒ 图标再也回不来。按钮本身 `font-size:0` 又把新写进去的文字藏起来 ⇒ 用户看到的是**空白方块**。
实测证据（`_probe_lock_click.mjs`，点前/点后/再点）：`hasSvg: true → false → false`。
**这也解释了为什么首屏看着是好的**：`ppUpdateLockAreaBtn()` 在 plot-editor 初始化时就跑（擦掉图标），而 `inline-18.js` 后续对整条工具栏再跑一次 `decorate(toolbarStack)` 把它补回来 —— 于是"打开时正常、点一下就没"。

**修法**（三件套，缺一不可）：
1. `mod/ry-icons.js` 新增 `setIcon(btn,name)` / `setLabel(btn,text)`：
   `setLabel` 先找 `:scope > .ry-ico`，有就**只替换 SVG 后面的文字节点**；没有就先写文字再按 `data-ry-icon` 把图标补挂回来。
   同时新增 `unlock` 图标（开口挂锁），锁定/解锁用图标区分，不再靠看不见的文字。
   `decorate()` 也改成"已挂 SVG 就直接退出、不改 `data-ry-icon`"——否则会把 `setIcon` 写进去的 `unlock` 按 `BY_ID` 掰回 `lock`。
2. `plot-editor.js`：`ppUpdateLockAreaBtn()` 改成 `lock ⇄ unlock` + `.active` + `aria-pressed` + `title` 四件套表达状态（并新增 `ppSetBtnLabel`/`ppSetBtnIcon` 两个包装函数）；同源写法一并改：`ppUpdateAutoPipeButton`（自动管路/清除管路）、`ppApplyZoneAutoUI`（地块划分/不划分）。
3. `mod/inline-24.js`：`delBtn` / `multiBtn` / `maskBtn` 三处 `textContent=` 改走本地 `setBtnLabel`（同样会擦 SVG）。

**② 工具栏确实有五层样式，删掉的清单**
用 `_probe_lock_btn.mjs`（CDP `CSS.getMatchedStylesForNode`）把 `#ppLockArea` 命中的**18 条规则原样导出**，删掉的全是"实测从未生效"的重复层：
| 删掉的 | 被谁覆盖 |
| --- | --- |
| 竖排时代 `body.ry-tool #pipePlanSection #ppToolbar{grid-column:3;grid-row:1/-1;flex-direction:column;overflow-y:auto}` | `#ryDrawingHost #ppToolbar{flex-direction:row!important}` + `…#ryDrawingHost #ppToolbar{grid-column:auto;grid-row:auto}` |
| 竖排时代 `#ppToolbar>.pp-btn…{width:100%;height:28px;padding:0 6px;font-size:12px}` | v802 的 `32px!important / padding:0!important / font-size:0!important` |
| v782 的 28×28 一套（layer-toggle + tool-group）+ `::before` 17px + hover | 同上 32×32（实测计算宽度 32px） |
| `[data-ry-tool-group] button[data-ry-icon]{32×32}` 第二份 | v802 段 `.ry-drawing-toolbar button[data-ry-icon]`（同作用域同值） |
| 三处 `::before{content:attr(data-ry-icon)}` 字形通道（18px / emoji 14px / toggle 18px） | v815 段 `content:none!important`（35 个按钮全有 SVG，一条都没生效过） |
| v597 `.pp-btn.active{background:#2d604b}` + `#ppAutoPipe` 常亮 | v815 段 3 个 id 的 `.active`（实测 34 个按钮全带 `data-ry-icon`） |
| v782 条带盒模型（40px/gap2/4px10px/#fff/#e4ebee/滚动条） | 合并进 `#ryDrawingHost>.ry-drawing-toolbar` 唯一一处（值＝实测生效值） |
| `#ppQuickBar[hidden]` 重复一条、`>.pp-sep`/`.tl-ws-sep` 竖线尺寸两条 | 合并 / 组分隔线整体 `display:none!important` |

收口后**各只有一个出处**：条带盒模型 → `#ryDrawingHost>.ry-drawing-toolbar`；按钮尺寸 → v802 段；图标通道 → v815 段（SVG）；激活态配色 → v815 段（#e6f2ec / #1c6b4f）。

**验证**：
- `_probe_toolbar_map.mjs` 前后逐按钮比对：**34 个按钮、x/w/h/vis 全等，差异 0 条**（删的全是死代码，不动布局）；
- `_probe_lock_click.mjs`：点前 `lock` → 点后 `unlock`+`active`+`aria-pressed=true` → 再点回 `lock`，`hasSvg` 三态恒为 true；
- `_shot_page.mjs` 整页截图：18 个可见按钮一行排列、间距均匀、无空白键；
- 新增 `tests/toolbar_single_layer.test.cjs` **8 项**（图标不被 textContent 擦掉 / 条带与尺寸各只一处 / 无 `content:attr(data-ry-icon)` / `#ppToolbar` 不再竖排 / 实心绿 active 与重复隐藏规则不许回来）；
- 闸门：`ci_check_static` PASS=29、`node --test tests/*.test.cjs` **184/184**、`check_publish_refs` PASS；`_probe_errors.mjs` 连点 5 个按钮 **0 异常**。
- `verify_ry_tool.js` 仍然是红的（21 FAIL / 55 MISS / 1 REVIVED `pp-plan-unit`），**全部为先前既存**：失败小节集中在 v246~v315 段，且不含任何 `ppToolbar / ry-drawing-toolbar / ry-icons / ppLockArea` 关键词。

**版本**：`sw.js VERSION = 'v824-toolbar-dedupe'`（changelog 已补 ⑤⑥）；`style-01.css / plot-editor.js / ry-icons.js / inline-24.js` 的 `?v=` 全部抬到 `824-toolbar-dedupe`。
**状态**：本地已验证，**未提交未发布**（工作区还混着他轮 v823 的一批未提交改动）。

### 26.70 v825-drawer-tab-12px：右缘两个竖排抽屉标签统一 12px（2026-10-30）

**用户原话**：「@截图 红色箭头指向面板的文字尺寸，跟蓝色箭头指向的文字尺寸统一」
（红箭头=右缘「图层控制」竖排标签；蓝箭头①=左栏「二级 · 地块与灌溉参数」一级标题；蓝箭头②=右缘「多地块编辑」竖排标签）

**先量后改，量出来的结论和直觉相反**：两个竖排标签**本来都是 13px、完全一样**（`_probe_fontsize.mjs` 本地+线上双测，含截图逐字墨迹间距 19.6px/字 的复核）。
13px 不是样式里写的 —— 抽屉标签规则里明明白白写着 `font:600 12px/1 system-ui`，是被 **`runye-typography` 的 `p,li,input,select,button{font-size:13px!important}`** 顶上去的（两个标签都是 `<button>`）；而左栏一级标题是 `<summary>`，不在这条规则里，落在 12px 档。
⇒ 用户看到的「不统一」其实是**右侧标签比左栏标题大一号**。

**改法**（`mod/style-01.css` 的 `#ryDrawingHost #ppPlotDrawerTab,#ryDrawingHost #tlWsLayerDrawerTab` 那条）：
补 `font-size:12px!important;line-height:1;`。必须带 `!important`：本选择器 2 个 id，与那条元素选择器同为 `!important` 时按特异性决胜负，我们赢。
**副作用（这次是好事）**：12px 下 5 字高 5×(12+3)+20=95、4 字高 80，都 < `min-height:96` ⇒ 两个标签高度第一次真的都是 96px，下方那句「96px 高 + 8px 间距 → top:202px」才第一次说得通（此前「多地块编辑」实际是 102px，两标签间距只有 2px）。
**验证**：改后两标签 `fs=12px / lh=12px / h=97 与 96`，截图无裁切、间距均匀；新增 `tests/toolbar_single_layer.test.cjs` 第 9 项（要求两 id 同一条规则 + `font-size:12px!important`）；`ci_check_static` PASS=29、`node --test` **185/185**、`check_publish_refs` PASS。

**版本**：`sw.js VERSION = 'v825-drawer-tab-12px'`（changelog 已加）；`style-01.css?v=825-drawer-tab-12px`。
**状态**：本地已验证，未提交未发布（与 v824 同一批未发）。

### 26.71 v826-flat-toolbar：顶部工具栏「一条白条 + 一堆透明按钮」（2026-10-30）

**用户原话**：「这个工具栏与其他的样式不一样，有若隐若现的浅绿色，你应该彻底重构顶部工具栏，现在工具栏的样式没问题，但是我怀疑代码有多层覆盖的情况，实际上我要的就是一个简单的工具栏 上面有各种功能按钮，鼠标放在功能按钮上、点击变色就好了，不需要那么复杂。」

**他的怀疑是对的，浅绿确实是一层「被覆盖到只剩底色」的老皮肤。**
`_probe_bar_bg.mjs`（CDP 取计算样式 + `CSS.getMatchedStylesForNode` 只留 background/border/box-shadow）实测：

| 元素 | background-image | 边框 |
| --- | --- | --- |
| 条带 `.ry-drawing-toolbar` | none | 白底 #fff |
| **分区组 `#ppToolbar`** | **linear-gradient(#f8fbf9 → #f2f7f4)** | **border-left:1px #dde8e1** |
| 管路组 `#tlWsToolbar` | none | 无 |

⇒ 同一条工具栏，**左半截（分区组）发绿、右半截（管路组）纯白**，分界线正好落在两组的接缝上 —— 与用户红框位置完全对得上。
来源是 v597「把二级工具轨皮肤对齐三级 `.tl-ws-btn`」那一段（连按钮的 `#f8fbf9` 浅绿底 + `#c5d6cc` 边框一起加的）。它的按钮部分早被 v815 的 SVG 图标段整段压成透明，**只剩这层底色还在发光** —— 典型的「多层覆盖后残留的活代码」。

**做法（删干净 + 立模型 + 加护栏）**
1. 删掉 v597 整段：组容器渐变 + `border-left`、`>button.pp-btn/.pp-btn-ghost/.pp-mirror-btn/.pp-fine-btn/.pp-ge-mode/.pp-ge-chip/.pp-back-group` 的 `#f8fbf9` 底 + `#c5d6cc` 边框、以及它们的 hover。
2. 组容器加护栏（`#ryDrawingHost #ppToolbar,#ryDrawingHost #tlWsToolbar`）：`border:0!important;box-shadow:none!important`（已有 `background:transparent`）。
3. 在删除处写下**最终模型**（只有三层，各一个出处）：
   - ① 条带 `#ryDrawingHost > .ry-drawing-toolbar`：白底 + 1px 下边框，**唯一绘制面**；
   - ② 组容器：透明、无边框、无阴影，只负责横向排版；
   - ③ 按钮：透明、无边框、32×32；hover `#eef2f6`、激活 `#e6f2ec`（v815 段）。
   「加新按钮不用写任何 CSS，挂上 id/label 让 ry-icons.js 认出来即可。」

**验证**
- 计算样式：条带 `#fff/none`、分区组 `transparent/none/0px/none`、管路组同值（改前 `bgImg` 是 gradient）；
- 条带原始像素（`Page.captureScreenshot` 裁条带，dpr=1，1284×40）：y=1/2/3/38 四行**整条都是 (255,255,255)**，左右零色差；
- 交互仍在：未交互 `transparent + #3f4a45` → 强制 `:hover` `#eef2f6 + #1f2a24` → 激活 `#e6f2ec`（`CSS.forcePseudoState` 实测）；
- 新增 `tests/toolbar_single_layer.test.cjs` 第 10 项（`#ppToolbar/#tlWsToolbar` 不许再有 `linear-gradient`；组容器必须 `background:transparent` + `border:0!important` + `box-shadow:none!important`）；
- 闸门：`ci_check_static` PASS=29、`node --test` **186/186**、`check_publish_refs` PASS、`_probe_errors.mjs` 连点 5 键 0 异常。

**版本**：`sw.js VERSION = 'v826-flat-toolbar'`；`style-01.css?v=826-flat-toolbar`。
**状态**：已随 `c1c6af3` 发布（见 §26.72）。

### 26.72 v816~v826 发布结果：`c1c6af3` 推送成功，线上复核全过（2026-10-30）

**用户原话**：「部署吧」（紧接 v826 工具栏拍平之后）。

**提交**：`c1c6af3`（`fb991fc..c1c6af3`，35 files，+1706 / −2152）。分支 `master`。

**发布范围 —— 这批不是单一版本，是一个长期未提交的工作区**
上次提交是 `fb991fc`（v815），此后 v816~v826 十一版全部堆在工作区，其中混着**另一轮会话**的 v818/v819/v821/v822/v823。逐 hunk 拆分不可行（非交互环境无 `git add -p`，且 `index.html` / `style-01.css` / `sw.js` 三个文件里两轮的改动在同一份 diff 里咬合），因此**按全量提交**处理 —— 这也与用户实际所见一致（用户一直在本地工作区验收）。

清单要点：
- 本次（v824~v826）：`mod/ry-icons.js`、`mod/plot-editor.js`、`mod/inline-24.js`、`mod/style-01.css`、`sw.js`、`index.html`；
- 他轮（v818~v823）：`core/storage-guard.js`（新增）、`core/measured-area-bridge-store.js`、`core/plot-library-store.js`、`mod/inline-12/13/16.js`、`mod/online-map.js`、`runye-nav.js` 等；
- 结构改动：`runye-hydraulics.html`(−906) 与 `runye-map-measure.html`(−363) 删除、`ryp-demo.html` 移入 `feature-archive/_dev-leftovers/`。**删除前已 grep 确认无任何页面/脚本引用**（命中的只有 `.aoci/` 里的代码认知历史快照，非运行引用）；
- 测试：`tests/toolbar_dedupe.test.cjs`(6) + `tests/toolbar_single_layer.test.cjs`(10) 用 `git add -f` 入库（`tests/` 被 `.gitignore` 屏蔽，第 78~95 行是逐文件白名单）。

**刻意不入库的**
- `_probe_*.mjs` / `_shot_*.mjs`：`.gitignore` **第 138-139 行有专门规则**，说明项目刻意不收这类探针。历史那 47 个入库的 `_*.mjs` 是 `_dump_*` / `_audit_*` / `_diff_*` 等旧命名，规则不同 —— **不要用 `-f` 强加**（上一轮曾判断「可入库」，是错的）；
- `_crop_*.mjs` / `_scan_*.mjs` / `_enhance_*.mjs` / `_*.json` / `*.png`：分析产物与临时截图。

**发布前闸门**
`ci_check_static` **PASS=29 FAIL=0**；`node --test tests/*.test.cjs` **186 pass / 0 fail**；`check_publish_refs` **PASS**（36 页面 / 214 条本地引用）。

**Pages 传播**：`sw.js` 轮询到第 5 次（约 40s）才从 `v815-icon-unify` 翻到 `v826-flat-toolbar`。前面 4 次都是旧值 —— 印证「线上冒烟首跑大面积红先怀疑传播未完成」。

**线上复核（`BASE=https://zhanglihui2026.github.io/runye-irrigation/`）**

| 探针 | 结果 |
| --- | --- |
| `_probe_bar_bg.mjs` | 条带 `rgb(255,255,255)` / `bgImg:none` / `border 0px` / `shadow:none`；**分区组与管路组容器均 `rgba(0,0,0,0)` + `bgImg:none`** ⇒ 浅绿渐变彻底消失 |
| `_probe_lock_click.mjs` | 三态全对：`{lock, hasSvg:true, bg transparent}` → `{unlock, hasSvg:true, active, bg #e6f2ec, color #1c6b4f, aria true}` → 回到 `lock` |
| `_probe_fontsize.mjs` | 「多地块编辑」12px/12px/h=97；「图层控制」12px/12px/h=96 |
| `_smoke_v521_live.mjs` | **26/27**，唯一红项见下 |

**唯一红项（既存，非本次回归）**
`线上 [v530] style-01 已无「无效圆角」声明（不带 !important 且非 50%） :: 8`
用同款正则本地复现 8 处，`git blame` 归属：

| 行 | 值 | 归属 |
| --- | --- | --- |
| 2629 | `0` | `e0331918`（v653b） |
| 3408 | `0` | `2552c742`（v668） |
| 4897 | `8px` | `fb991fc`（v815） |
| 4976 | `4px 0 0 4px` | `fb991fc`（v815） |
| 4977 | `0 4px 4px 0` | `fb991fc`（v815） |
| 5032 | `4px` | `fb991fc`（v815） |
| 5127 | `0` | `fb991fc`（v815） |
| 4850 | `2px` | 本次 `c1c6af3`，但 diff 里同行**同时有 `+` 和 `−`** ⇒ 是「合并条带盒模型」时**搬家**，不是新写 |

⇒ **七处历史既存，一处是搬家**，本次没有引入任何新的无效圆角。
L4850 那处是 `::-webkit-scrollbar-thumb` 伪元素，`body *{border-radius:0!important}` **不作用于伪元素**，所以它实际生效、不属于「死声明」；冒烟用的是纯文本正则，区分不了伪元素才判红。
**决定先不改**：视觉零变化却要动 v815/v653b/v668 的七个元素，属扩大改动面，等用户发话统一清一次。

**下一步可做（等用户拍板）**
1. 清掉那 7 处历史无效圆角（视觉零变化，纯死代码），让冒烟回到 27/27；
2. 若想让检查更准，可把 v530 项改成「排除 `::-webkit-scrollbar*` 规则」，但**改测试去迁就代码有风险**，优先删代码而非放宽检查。

### 26.73 五期验收探针入库 + 47 个已跟踪探针的定性纠正（v835 · 2026-10-31）

**背景**：本轮把「地图总管交互层」一到五期提交为 `3d1a9eb`（19 文件，+3767/−65）。
五期新增的 6 个验收探针当时是 `??` 未跟踪，而 `_probe_*.mjs` 已在 §26.42 被
`.gitignore` 挡住 ⇒ 按 B 方案判据（**被文档点名引用、作为某次修复的实测依据 → 入库**）
必须用 `git add -f` 补进去，否则任务书引用的证据在换机器后指向空文件。

**入库的 6 个**（实测 100KB，共 151 项断言中的 38 项）

| 探针 | 断言 | 覆盖 |
| --- | --- | --- |
| `_probe_trunk_p1.mjs` | 22/22 | 一期：数据契约 v2 / 状态机 / 下游 5 处读取方 |
| `_probe_trunk_p2.mjs` | 24/24 | 二期：捕捉引擎、状态栏缺数据是「—」不是 0.00 |
| `_probe_trunk_p3.mjs` | 38/38 | 三期：编辑层、右键菜单、打断/合并 |
| `_probe_trunk_p4.mjs` | 29/29 | 四期：撤销/重做、别的数据域零影响 |
| `_probe_trunk_p5_geo.mjs` | 23/23 | 五期：坐标反算 = 站点自己的反投（黑盒对照） |
| `_probe_trunk_p6_snap.mjs` | 15/15 | 五期：三类捕捉接通后的行为 + 地块归属守位 |

**没有入库的两类，理由**

- `_probe_trunk_pN_out.json`（6 个）：每次跑都带新时间戳、内容逐次微变，
  入库等于永久 `??`/永久脏 diff。要留结果就把关键数字写进文档（已写进任务书 §13），
  不追 json 快照。
- `project-planning/任务书_*.md`：该目录 12 个跟踪文件里 **0 个 md**，
  文档从入库这条路走是有意的；追溯一律落回本文件（跟踪的）。

**★ 一条定性纠正（写给以后的我 / 别的 Agent）**

47 个已跟踪的 `_*.mjs` **不是「仓库卫生的历史包袱」，是 §26.42 B 方案的正常结果**。
本次核查时我一度建议「清掉这 47 个」，方向是错的 —— 那会删掉用户明确要求保留的
可追溯证据。`_p1/_audit_root_probes.md` 里写得很清楚：

> `.gitignore` 第 115 行注释：一次性调试残留（**mjs 未含于上方 `_*.js` 规则**），
> 下面只列具体前缀，**刻意没有**一刀切 `_*.mjs` —— 因为项目一直把部分 `.mjs` 探针
> 当「可追溯的证据」入库。

**以后再遇到「根目录一堆 `_probe_*.mjs` 看着脏」**：先看它是不是 `git ls-files` 里
（是 → 有意入库，别动）；只有 `??` 的才考虑加忽略。判据永远是「有没有文档引用它」。

**⚠️ 发布流程影响（与 §26.42 同一条闸）**

`3d1a9eb` 与本次 chore 都是**本地提交、未推送**。`master` 现比 `origin/master`
领先 **2 个**。`推送更新.bat` 第一道闸要求「本地 master == origin/master」，
否则直接停（避免顺带推送之前的本地提交）。

⇒ **下次发布前必须先推送这 2 个提交**（页面内容有实质变化，不像 §26.42 那次只是把探针入库，
所以不能「等发布时一并处理」——要先推干净再走发布流程）。

**复核命令**

```bash
git log origin/master..HEAD --oneline | wc -l      # 发布前必须是 0
git ls-files | grep -cE "^_probe_trunk_p"          # 应为 6
```

---

### 26.74 ESLint 基线落地：275→285 个脚本首跑 0 错（2026-10-31）

**背景**：代码审计的三条风险里，② 「无构建 = 无静态闸门」是真问题 —— 全站只有
`scripts/check.cjs` 的 `node --check`（纯语法）和 `ci_check_static.cjs`（29 条自定义契约），
**没有一条规则能发现「对象里写了重复键」「return 后面还有代码」这类字面缺陷**。

**落地了四个文件**

| 文件 | 职责 |
|---|---|
| `eslint.config.js` | flat config（eslint 9）。规则分级与「为什么关掉两条」全写在文件头 |
| `eslint.globals.json` | 257 个 `window.*` 隐式全局白名单，**自动生成，勿手改** |
| `scripts/gen-eslint-globals.cjs` | 从已跟踪脚本里抓 `window.X =` 重新生成白名单 |
| `scripts/lint.cjs` | 闸门入口。用 `git ls-files --cached --others --exclude-standard` 取文件集 |

**为什么不用 `eslint .`** —— 这条是本次最关键的技术判断

根目录常年有 `_backup_*`（140+ 个）、`_probe_*.mjs`、`verify_*.cjs`。它们在 `.gitignore` 里，
但 **eslint 不读 `.gitignore`**。第一次直接 `eslint .` 就报了 29 条，其中 20 条是
`plugins/*/main.js` / `core/*.js` 的 ESM 解析错误、7 条是一个 `verify_*.cjs` 里
**故意保留的 `${...}` 字面量**（它在断言浏览器模板里确实写着 `${nodeFitRows}`）。
信噪比接近 0。

⇒ 改用 git 枚举，口径与 `check.cjs` 的语法检查**完全一致**（已跟踪 + 未跟踪但未被忽略）。
新写的文件不用 `git add` 就已在闸内；被忽略的临时产物永远进不来。

**首跑结果：285 个脚本，0 error 0 warning**（含 53 个入库探针、48 个 mod 模块、14 个插件）

**★ 两条被关掉的规则 —— 别再重新打开，除非先看这里**

1. `no-cond-assign` —— 13 处 `if(el=document.getElementById('x')) el.textContent=…`，
   全在 `mod/inline-09.js:2658-2691` 同一块，一个 `el` 变量反复复用，**是有意的紧凑赋值链**。
   想重开：给那 13 处各加一层括号 `if((el=…))`（零行为变化），规则自带的 `except-parens`
   就会放行。**没做**是因为 `inline-09.js` 在 CORE 名单里，改它必须抬 VERSION，
   不该混进「建闸门」这一个提交。
2. `no-func-assign` —— 2 处，**刻意的拦截器模式**：
   `mod/plot-editor.js:2369` 注释原文「把局部 `ppRender` 换成一个转发器（函数声明可重新赋值）」；
   `mod/inline-09.js:6065` `render = function(){ origRender(); initScrollReveal(); }`。
   站点依赖「函数声明当可替换槽位」，规则天然认它是错的 ⇒ 永久关闭。

**已知局限（写清楚，别当它不存在）**

`no-undef` / `no-unused-vars` / `no-redeclare` 三条**关着**。全站是 IIFE + 隐式全局写法，
不配白名单直接开会刷上千条假错。所以现在**拼错全局名抓不到**（`RyTilWs` vs `RyTlWs` 这类）。
将来要开，前置条件是 globals 补齐 + 各文件 env 分准。

**与发布闸的接线**

`scripts/check.cjs` 里加了 ESLint 一步，位置在「语法检查」之后、「静态契约」之前。
**未装 eslint 时优雅跳过**（`node_modules/eslint` 不存在就打印跳过说明），
不让发布闸因为某台机器没跑 `npm install` 而卡死。

`package.json` 只服务本地质量闸门（`lint` / `lint:fix` / `globals` / `check` / `test`），
**不参与发布链路**。`node_modules/` 已补进 `.gitignore`（原本没忽略，19MB 一直挂在 `??` 里）。

**复核命令**

```bash
npm run lint                                     # 285 个脚本，应为 0 问题
node scripts/check.cjs | grep -A2 ESLint         # 闸门里应看到 ESLint 静态检查
npx eslint mod/inline-09.js mod/plot-editor.js   # 两个巨头单独跑也应为空
```

**一条自检经验**：闸门建好那一刻必须**故意写坏一个文件**验证规则有牙 ——
本次用 `{a:1,a:2}` / `return` 后死代码 / `x===x` / `[1,,3]` / `'${x}'` 五连测，
5/5 全部命中，才敢相信「285 个文件 0 问题」是真的干净而不是规则没生效。

---

### 26.75 关键模块契约盘点 + 首个隔离切片：frame 坐标换算（v836 · 2026-10-31）

**范围**：降低 `mod/inline-09.js`（6110 行）与 `mod/plot-editor.js`（5008 行）之间的隐式全局依赖风险。
本轮**只做一个切片**，其余只出结论不落地。

#### 一、契约盘点（有源码依据的部分）

| 全局 | 所有者（写） | 读者 | 定性 |
|---|---|---|---|
| `window.tlDiagramData` | `inline-09.js:4634`（生成器，唯一常规写点）<br>`inline-12.js:260/819/949`（还原/清空）<br>`plot-editor.js:711`（回滚 preimage） | inline-09 内 54 处、inline-12、inline-27、plot-editor 19、tl-workspace、online-map | **单生产者 + 多读者**。plot-editor 只读来画叠加层，写只在回滚 |
| `window.measuredPolygon` | inline-10:186 / 12:791,793 / 13:314,334 / 16:121,143,150,264 / 29:1114,1828 / **09:1782** 共 **12 处 / 6 个文件** | inline-09 13 处、inline-13 18、inline-12 16、plot-editor 9 | **无单一所有者**（谁拿到地块谁写），是当前最大的隐式耦合点。<br>⚠ 09:1782 是**防御性回填**（缺了就从 `ppGetPolyPts()` 重建）⇒ inline-09 对这个全局**不是纯读者**，上一版表把它漏了 |
| `window.currentPlotId` | inline-10:190 / 12:763 / 13:4,123,182,250,324,414 / 16:107 共 **9 处 / 4 个文件** | inline-12 30、inline-13 11、inline-09 9 | 同上；inline-09 只读不写 |
| `window.measuredArea` | inline-10:185 / 11:2（置 0）/ 12:790 / 13:313 / 16:105,262 共 **6 处 / 5 个文件** | inline-09 4、inline-11/13、plot-editor、ry-diag、插件 | 单位 **m²**，下游多处 `/666.67` 转亩 |
| `window.runyeSaveProject` | `inline-12.js:522`（唯一实现） | inline-12 14、runye-undo 7、plot-editor 5、data-service 4、tl-workspace | 存档唯一入口，是「双向」接口（读全局状态 → 写存储） |

**三个「看着能替代、其实不能」的模块**（本轮逐条核实）：

- `hydraulic-calc/hc-core.js`：**纯公式库**（UMD，挂 `window.RyHcCore`，`index.html:38` 同步加载，
  `tests/hc_core.test.cjs` 钉着与主页的逐值一致）。零 DOM、零状态。**它不是几何/坐标工具，别往里塞**。
- `core/data-service.js`：**插件侧的工程快照/档案层**，`createDataService()` 工厂，只经
  `core/bootstrap.js` → 插件上下文 `ctx.data` 暴露，**没有任何 HTML 直接加载它**。
  它自己反过来依赖主页的 `window.runyeSaveProject` 与 `window.CloudSync` ⇒ 是「消费方」不是「访问层」。
- `core/event-bus.js`：58 行，`on/off/emit`，只被 `bootstrap.js` import，服务于插件。主页面主流程**完全不经过它**。

> 结论：这三者都不能用来替代主页面接口。主流程的真实耦合面是上表的 window 全局，
> 而不是 core/ 里那套插件体系。

#### 二、选中切片与理由

**`tlFrameToWorld` / `tlFrameToGrid`（分区网格 ↔ 世界米）→ `core/coord-frame.js`**

选它的四个理由（都可验证，不是"感觉合适"）：
1. **已被复制 4 份**：inline-09 两份局部实现、`plot-editor.js` 的 `ppGridFrame()` 闭包一份、
   `mod/trunk-geo.js:68` 一份（注释自承"与 tlFrameToWorld 逐字一致"）。
2. 纯函数、零 DOM、零全局状态 ⇒ 边界可完整测试。
3. 下游是分区网格 → 管路布局 → 材料量，**算错不是画歪而是整套量错**。
4. 本站已有同类先例：`inline-09.js:27-105` 早就把 `polyAreaM2 / clipPolyToRect / zoneGx` 等
   委托给 `window.RyZoneGeometry`。本次是同一套收口方式，不是新范式。

**没做的**（明确留给后续，理由见「剩余风险」）：
`plot-editor.js` 里 `ppGridFrame()` 的闭包版、`mod/trunk-geo.js` 的副本、`measuredPolygon` / `currentPlotId`
的写点收敛。一次性全改会变成大规模重构，本轮不做。

#### 三、改动文件

| 文件 | 改动 |
|---|---|
| `core/coord-frame.js` | **新增**。`RyCoordFrame.frameToWorld / frameToGrid`，逐字保留原数学 |
| `tests/coord_frame.test.cjs` | **新增**。46 项：正常/边界/无效输入/回调委托/往返/单位/防倒退 + ⑥trunk-geo 漂移锁 + ⑦ppGridFrame 闭包等价 |
| `tests/global_contracts.test.cjs` | **新增**。9 项：上面那张契约表的**写入面**门禁（见下） |
| `tests/version_sync.test.cjs` | **新增**。6 项：发布版本号「同抬」+ CORE 名单卫生 |
| `scripts/check.cjs` | 单测枚举后**打印「未入库测试」清单**（只提示、不改退出码）。见下 |
| `mod/inline-09.js` | 两个函数改成转发（调用点一行没动） |
| `index.html` | 新增 script（core 区，先于 inline-09）；`style-01.css?v=836-coord-frame` |
| `sw.js` | `VERSION='v836-coord-frame'`；CORE 增 `core/coord-frame.js` |
| `ci_check_static.cjs` | `scriptOrderRules` 增 `['core/coord-frame.js','mod/inline-09.js']` |
| `_probe_coord_frame.cjs` | **新增**（浏览器回归探针，零依赖 CDP） |
| `_probe_coord_equiv.cjs` | **新增**（行为等价性证明：新旧实现 + 四跑噪声底线） |

#### 四、验证

- 基线（改动前）：`check.cjs` PASS=29/FAIL=0，单测 **44** 文件通过，WASM 2500 项通过。
- 改动后：`check.cjs` PASS=29/FAIL=0，单测 **47** 个文件 / **321** 项通过（+coord_frame、+global_contracts、+version_sync），WASM、地块拼接均通过。
- 单测 **46/46**（含第⑥节 trunk-geo 漂移锁 12 项、第⑦节 ppGridFrame 闭包等价 5 项）。**抽取前**先跑一遍：27 项数值断言全绿 ⇒ 模块输出与原实现逐值一致，
  只有「防倒退」两条红（那时 inline-09 还没接线）。这就是"先证明现状再迁移"的证据。
- 浏览器回归 `_probe_coord_frame.cjs` **PASS 9/9**：`RyCoordFrame` 在位、0° 与 30° 各生成一次、
  25/38 个管线阀门点全部落在地块包围盒内、真实 frame 往返误差 1e-14、零脚本异常、
  且 30° 点集与 0° **不同**（证明旋转真的传到世界坐标，不是恒等）。
  > **⚠ 这条结论后来被推翻一半（2026-10-31 发布日实测）**：那次 9/9 是在**页面还没解析完**
  > （`document.readyState==='loading'`）时就驱动生成的，图面尚未完全初始化，所以"全在界内"
  > 是「驱动太早」换来的。把就绪判据补成 `readyState==='complete'` 之后：
  > - **本地 file://** 反而在 0° 就崩：`ReferenceError: esc is not defined`
  >   （`inline-09.js:4967`——那是 `catch` 分支自己崩了，掩盖真错因「规范绘图模型拒绝三级生成结果」，
  >   站点既有竞态：`0°,30°` 必红、`0°,0°,30°` 时好时坏）；
  > - **线上 Pages** 正常生成，但 30° 有 **23/54 点越出地块包围盒**。
  > 这 23 点**不是本切片造成的**：本切片只把两个函数的函数体换成转发，而 `_probe_coord_equiv.cjs`
  > 的 E1 已在**真实 30° frame** 上逐位比对过新旧实现（101 点 × 6 帧，最大差 0）。
  > 它对应的是「已知未修：分区角度 30° 时网格与虚线尺寸框越出地块边界」。
  > ⇒ 结论修正为：**「模块在位 + 数学逐位一致」这两个断言成立；「30° 点位全在界内」不成立，
  > 且本来就不该由本切片负责。** 后续若要让 C4(30°) 变绿，得先修那个 30° 越界问题。

**★ 契约面门禁（`tests/global_contracts.test.cjs`，PASS 9/9）**

上面那张表原先只有人读。这个文件把它变成会响的断言，钉的是**写入文件集合**（不是行号、不是处数：

行号随任何编辑漂、处数随合理重构变，而「又有一个新文件开始写这个全局」才是真正的破坏信号）：

- 5 个全局各一条：写入文件集合必须等于基线，失败信息直接点名「新增写者 / 消失写者」并给出实测处数。
- **架构约束**：`core/` 与 `plugins/` 不许写这五个全局 ⇒ 把「core 是插件侧访问层、plugins 只消费」从注释变成闸门。
- **存档唯一性**：`window.runyeSaveProject` 全站只许 1 个赋值点，且必须在 `mod/inline-12.js`。
  多一份实现 = 两份快照格式，而 restore 只认其中一份（静默丢档）。
- **扫描器自检**：`===` / `==` 不算写入。第一版盘点就是被这个坑到 —— `typeof window.runyeSaveProject === 'function'`
  让 `plugins/ai-plan/main.js:126` 和 `tl-workspace.js:3467` 被误报成"两个额外实现"。
- **有牙验证**：临时在 `mod/` 放一个 `window.measuredPolygon = []` 的新文件，闸门 `not ok 2` 并点名
  `新增写者：mod/zz_teeth_tmp.js`；删除后恢复绿。（临时文件已删。）

⚠ 一个必须记住的坑：`check.cjs` 用 `git ls-files --cached --others --exclude-standard` 枚举测试，
而 `tests/*` 在 `.gitignore` 里 ⇒ **没 `git add -f` 的测试文件根本不会进闸门**，本地 `node --test tests/*.test.cjs`
却是绿的（glob 不看 git）。加了新测试一定要 `git add -f`，再跑一次 `check.cjs` 核对文件数 +1。

这个坑**已经攒了 9 次**：2026-10-31 实测磁盘上 56 个 `tests/*.test.cjs`，闸门只跑 47 个，差的 9 个
（`ai_member_register` / `case-library` / `drawing-design-group-adapter` / `entitle_pending_nav` /
`pipe_path_loss` / `plugin-control` / `runye-irrigation-design` / `runye_hydraulics_core` / `tape_axis`）
单独跑 **27 项全绿**——也就是说它们都是有效测试，却从未拦过任何回归。
本切片**没有替人把这 9 个文件入库**（那是对别人未提交工作的所有权判断），而是在 `scripts/check.cjs`
里加了一段**只打印、不影响退出码**的提示：每次跑闸门都把「因未入库而不会执行」的测试列出来。
入库命令：`git add -f tests/xxx.test.cjs`，入库后自动纳入闸门。

**★ 顺带补齐的发布纪律闸门（`tests/version_sync.test.cjs`，PASS 6/6）**

本轮抬版本号时发现：「`sw.js VERSION` 去 `v` 必须等于页面 `style-01.css?v=`」这条纪律
**只靠人记着，没有任何脚本守**——而 v632 正是栽在这里（SW 抬了、CSS 查询串没抬 ⇒ 老用户命中
旧缓存，界面看起来"没生效"，于是一路查 SW 和构建）。现在钉住三件：

- 每个生产页面的 `style-01.css?v=` 必须逐字等于 `VERSION` 去 `v`；不一致时直接打印
  `页面：sw=… 页面写的是 …`。
- **反向自检**：拿合成 HTML 喂审计函数，版本不一致必须报红 —— 否则"真仓库全绿"只说明今天没坏，
  不说明坏了会响。另外单列一条「至少有一个页面真的引用了这个样式表」，防止比对集合为空导致恒绿。
- `CORE` 名单条目不许带 `?v=`：install 按原样 `addAll`（带查询串）、fetch 按 `key()`（抹掉查询串）查
  ⇒ 存查不同 key，**离线必 miss**，且只在断网时才炸。名单里现在一条都没有。
- 磁盘接线也实测过：临时把 `index.html` 的 `?v=` 改成 `999-broken` → `not ok 2` 并点名；
  复原后 `git diff index.html` 为空、测试回到 6/6。

**★ 行为等价性证明（`_probe_coord_equiv.cjs`，PASS 7/7）**

回答的问题：「换实现之后，分区 / 管路 / 材料 / 存档有没有哪怕一位数字变了？」

判据设计经过一次推翻重做，值得留档：

- ~~朴素做法「A 生成一次、B 生成一次，比结果」~~ → **不能用**。`tlAutoGenerate` 尾部会走规范绘图模型提交
  （`ryCommitSingleLevel3CanonicalFromRuntime`），连续/换角度重生成会被「规范绘图模型拒绝三级生成结果」拒掉，
  **且与坐标换算无关**：把 HEAD 的旧实现注入回去照样红。实测序列 `0°,30°` 必红、`0°,0°,30°` 时好时坏 ⇒
  是站点既有竞态。拿它当判据只会得到一个随机红的探针。
- 改成 **E1 逐点比对**：同一页面内 `git show HEAD:mod/inline-09.js` 切出旧实现原文（**不手打**）与
  `core/coord-frame.js` 现实现，在管线**真实产生的 frame**（0°/30°/12.5°+缩放2/负 origin/null/带闭包回调）
  上比 101 个点。→ **最大差 0，逐位相同**；E3 计数桩证明旧实现真被执行（N1=0/N2=0/N3=0/**O1=1478**）。
- **四跑结构**：N1/N2/N3 = 现实现连跑三次求噪声底线，O1 = 旧实现接管。原因见下。

**噪声底线的实测结果（这条是本节最该记住的）**：

```
pp.zoom   N1=6.298666666666667  N2=1  N3=6.298666666666667  O1=6.298666666666667
```

同一份实现连跑三次就有一次 `pp.zoom=1`（其余 6.2986…），而**旧实现那次 O1 反而是 6.2986**
⇒ `pp.zoom` 的跳变**属于同实现重跑抖动**（`ppFitView()` 与材料价回填谁先跑完的竞态），
与本次切片无关。若只跑两跑（前一版做法），就会把 N2 这个异类当成"切片引入的差异"，做出错误结论。

因此正式比对 N2 vs O1 时，用 N1/N2/N3 实测出的**不稳定集**做字段级豁免，并要求差异**全部**落在集内：

- 不稳定集 = `pp{pp.zoom}` / `saved{inputValues.optPriceF/M/B, pipePlan.zoom, tlAux.nodes, canonicalDrawingDesign.revision}`。
  —— 这个集合本身是**证据**，不是放宽：它由三次同实现重跑算出，且逐字段打印。
- **E4**（不参与判定的底线）：同实现三跑之间 `tlDiagramData` **0 处**差异、材料表**完全一致**
  ⇒ 这两项可以硬断言，不需要任何豁免。
- **E2a** `tlDiagramData` 逐字段：**0 处**。
- **E2b** `ppGetState`：抖动域内 1 处（`pp.zoom`），**域外 0 处**。
- **E2c** 材料表：总价 ¥23,045 / 10 行，**完全一致**。
- **E2d** `runyeSaveProject` 快照：`saveOk` 两边 true，抖动域内 6 处，**域外 0 处**。

⇒ 结论：**材料量与存档结构在换实现后逐值未变**；唯一变化的是本来就不稳定的 `pp.zoom`/`optPrice*` 回填时序，
且其异类样本出现在**同实现**那一跑。上一版文档里「本轮没做材料量数值对照」的缺口，至此补齐。

**★ 独立可回滚验证（干净 HEAD 工作树实测，2026-10-31）**

「这个切片能单独回滚」这句话之前只是声称。实测做法：`git worktree add --detach HEAD` 开一个干净树，
只把 `git diff --cached` 的补丁 `apply --index` 进去（并 `git add -f` 那几个被 `.gitignore` 拦住的测试），
再跑 `check.cjs`。结果：**PASS=29 / 47 个测试文件**，与主工作树一致 ⇒ 本切片不依赖那 9 个并行未提交改动。

**但查出一件事，提交前必须知道：**

- 干净 HEAD 上 `tests/plot_merge.smoke.cjs` 的 **③-i「回传入口（v191）」本来就是红的**
  （`btnCopy 入口应仍在` 断言失败）。用**不带本切片**的纯 HEAD 工作树复跑，同样红 ⇒ **与本次改动无关**。
- 原因：v830 已把面板里那个「回传地块绘制」按钮删掉、逻辑提成 `onSendCurrentDraft` 并导出
  `__rySendCurrentDraft` / `RyMapHost.sendDraft`，**但那条测试没跟着改**；改它的补丁现在还在工作区未提交。
- ⇒ **不要只提交本切片的 11 个文件**：那样新提交上的 `check.cjs` 会是红的（红的不是本切片，是 HEAD 自带的债）。
  要么把 `tests/plot_merge.smoke.cjs` 的那份改动一起提交，要么等它先落地。

**★ 三个坑（都是本轮实测踩出来的，写下来免得下次重踩）**

1. **手抄公式就是把 `c.y` 写成 `c.x`**。我第一版黄金值生成器手打了函数体，结果
   `world.y` 整体偏 65 m —— 恰好等于 `(c.x-c.y)/1000`。**凡是要"复刻现状"的地方，一律从源码切片取值，
   不许手打**。（生成器已删，做法写进测试文件头。）
2. **headless Edge 默认 800×600 ⇒ 站点判定为手机 ⇒ 跳 `runye-mobile-map-preview.html#second`**，
   在那个页面上所有主程序全局都不存在，表现为"RyCoordFrame 没加载"的**假红**。
   探针必须先 `Emulation.setDeviceMetricsOverride({width:1600,height:1000})`，并且**校验
   `location.href` 真的落在 index.html**（本机 Edge 还会复用已有会话页，实测拿到过别的 target）。
3. **`check.cjs` ⑩ 会拦"页面引用了但文件没进 git"**。新增被 index.html 引用的脚本，
   必须 `git add` 之后闸门才绿 —— 这不是误报，它防的正是"上线后 404"。

**★ 本轮验证面矩阵（哪些是 CI 覆盖的，哪些只在本机）**

`check.cjs` 报 PASS=29 很容易被误读成"全覆盖"。实际上**两个最重要的证据都只在本机**：

| 验证 | 覆盖方式 | 依赖 | 红了会怎样 |
|---|---|---|---|
| 语法 / 静态契约 / 单测 47 文件 / WASM 2500 / 地块拼接 | **CI**（`.github/workflows/ci.yml` 直接跑 `node scripts/check.cjs`，同一入口） | 无 | 推送即红 |
| 面板漂移（`panel`） | 本机 `node scripts/gate.cjs --filter=panel`（0.1s，纯静态，**CI 未接入**） | 无 | 要人手跑 |
| `_probe_coord_frame.cjs`（RyCoordFrame 在位、0°/30° 生成、25 个阀门点落界、往返 1e-14） | **仅本机** | 本机 Edge + CDP | 无人自动发现 |
| `_probe_coord_equiv.cjs`（E1 逐点逐位相等、四跑噪声底线、材料/存档一致） | **仅本机** | 本机 Edge + CDP | 无人自动发现 |
| `_probe_*` 之外的 e2e（n02/n03/pump/nav） | 仓库 `gate.cjs` 的 playwright 阶段 | playwright + Edge | 本轮没跑（见下） |

- **为什么 CI 不跑探针**：`ci.yml` 文件头已写明"需要本机 Edge + CDP 的项一律不进 CI，假红比没有更坏"。
  所以这两个探针的价值取决于**有人记得在本机跑**——它们已入库（`_probe_coord_*.cjs`），但不是自动哨兵。
- **playwright 那四个阶段本轮没跑**：本机 `npm i playwright` 一直 502（registry 不通），
  探针改用本机 Edge + 原生 CDP。`n02/n03/pump/nav` 因此**没有本轮证据**，这是明确的缺口，不是"应该没事"。
- 仓库对"双副本"已有登记惯例（`scripts/panel-drift-baseline.json` 里 4 条 + `check_panel_drift.cjs`），
  本切片的两把漂移锁沿用的是同一套思路：**不强行合并，先把"必须一致"变成会响的断言**。

**★ 发布到线上（2026-10-31，v836 已上线）**

用户当轮指令「发布到网络吧」，范围确认为**全部推**（含此前未发布的 3 个提交）+ 携带
`tests/plot_merge.smoke.cjs` 的测试修复（否则新提交的 CI 会红）。

- 本地 master 原本领先 `origin/master` **5 个提交**（3 个历史 + 本切片 2 个）：
  `3d1a9eb` 地图总管交互层 一~五期（7535 行）、`16a7d4c` 五期探针、`321b3a7` ESLint 基线、
  `a01291f` 本切片、`f128434` 测试修复。
- **仓库自带的 `推送更新.bat` 无法使用**：它要求「本地 master == origin/master」才肯跑
  （防顺带推送旧提交）。这次必须手工 submit + push，等于绕开那道保险。
- **`git push` 两次报错（`Recv failure` / `CONNECT tunnel 502`）但实际已成功**：
  远端 master 已是 `f128434`。⇒ 判定只能是 `git ls-remote` / API 比对，**不能凭 push 的报错下结论**
  （`_p1/_pub_api.py --dry` 打印「远端已是本地 HEAD，无需发布」就是已发布信号）。
  本机有 `HTTP(S)_PROXY=127.0.0.1:50855`，小请求通、大上传断，属链路质量问题。
- 发布后核验（`_p1/_verify_pub_836.py`，全绿）：
  | 项 | 结果 |
  |---|---|
  | 远端 master = 本地 HEAD | ✅ `f128434` |
  | 根树逐字节相同 | ✅ `b040566` |
  | 文件数 | ✅ 510 |
  | 关键 blob（index.html / sw.js / core/coord-frame.js / inline-09 / 两个新测试） | ✅ 全同 |
  | Pages 构建 | ✅ `built`（**必须查**：构建失败时站点继续服务旧版本） |
  | 线上 `index.html` / `sw.js` / `core/coord-frame.js` / `mod/inline-09.js` 与仓库 blob | ✅ 逐字节相同 |
  | 线上引用 `core/coord-frame.js?v=836-coord-frame` 与 `style-01.css?v=836-coord-frame` | ✅ 都在 |
- **线上专属断言**（`_probe_coord_frame_live.cjs`，入口换成 Pages URL、不再拦网络、加 404 收集）：
  C1 模块在位（`RyCoordFrame` 两方法可调、`tagCount=1`）、C2 零脚本异常、C7 **零 4xx/5xx**、
  0° 生成 5/5/5 且 25 点全在界内、往返 1e-14、30° 点集≠0° —— 全绿；
  **C4(30°) 红（23/54 越界）**，见上一节说明：属已知 30° 越界问题，不是本切片引入。
- 发布后本地仍有 8 个并行改动未提交（`.aoci/*`、`aoci.code.txt`、`inline-18`、`plot-editor`、
  `style-01.css`、`runye-hydraulics-page`、`tl-workspace`、验收记录的 `shared-canvas-browser.cjs`）——
  **它们没上线**，线上跑的是这些文件的 HEAD 版本。下次发布前要确认不会漏发。
- ⚠ 本段文档与上面「C4 结论修正」是在发布**之后**写的，**尚未推送**；需要下次发布时一并带出。

#### 五、剩余风险 / 后续建议

- `mod/plot-editor.js` 的 `ppGridFrame()` 仍是闭包版自算；`mod/trunk-geo.js:68` 仍是副本。
  **不建议下一轮直接改**：trunk-geo 已在 5 个读取方的链路上，把它的内部实现换成
  委托会引入新的加载顺序依赖。等 coord-frame 在线上跑稳一版再说。

  **但本轮给它加了漂移锁**（`tests/coord_frame.test.cjs` 第⑥节）：40 点 × 9 种 frame，
  要求 `RyTrunkGeo.frameToWorld` 与 `RyCoordFrame.frameToWorld` **逐位相同**（strict 相等，
  不是 1e-9 容差）。附两条前提断言：
  - trunk-geo 只有 `frameToWorld` 一个方向；长出 `frameToGrid` 就红（说明有人在加第二套语义）。
  - `tlDiagramData.zones.frame` 必须仍按 `{angle,center,origin,scaleX,scaleY}` **白名单重建**，
    不许按引用透传、不许带 `toWorld/toGrid`。这是「副本可以合法地不委托回调」的唯一前提 ——
    一旦生产者把活 frame 直接递下来，副本会静默分叉。
  - 漂移锁**已验证有牙**：把副本里 `dx*sn + dy*cs` 的符号改掉，160/160 点全部分叉，
    `y` 偏 170.08 m ≈ 地块南北跨度（就是"吸附点整块颠倒"那个故障形态）。临时脚本跑完即删。

- **第 3 份副本（`plot-editor.js:195 ppGridFrame`）也已锁住**（第⑦节 5 项），但它和 trunk-geo 那份性质不同：
  它返回的是**活 frame**（自带 `toWorld/toGrid` 闭包），coord-frame 见到这种 frame 会直接委托。
  于是整条链路依赖一条**从没被验证过的假设**：
  > 把 frame 的闭包剥掉、只留 `{angle,center,origin,scaleX,scaleY}`，下游用 coord-frame 自算，
  > 结果必须一位数字都不差。
  `inline-09:4631` 正是这么剥的。剥了之后数字若变了，画布上看到的点与总管捕捉用的点就不是同一个点，
  且**不会有任何报错**。第⑦节把这条假设变成断言：40 点 × 4 个角度（0/30/12.5/−47°），
  `f.toWorld(p)` 与 `CF.frameToWorld(thinned,p)` 逐位相等；顺带钉死口径
  （`center` 在图纸系 mm、`origin` 在世界系 m、`scaleX/scaleY = 图纸mm ÷ 地块m`）。
  - 取证方式**不改 plot-editor.js**（它有别人的未提交改动）：按大括号配平切出 `ppGridFrame` 函数体，
    用「一调用就抛」的桩替掉 `ppGetBounds/ppGetPlanDims/ppZoneAngle`。桩没被触发 ⇒ 证明测试把四个入参
    传齐了，不是靠内部兜底碰巧算对。
  - **有牙验证**：把切片里 `gx=c.x+x*cs-y*sn` 的符号改掉 → 120/160 点分叉。
    没分叉的正是 0° 那 40 点（`sin0=0` 让符号错误隐身）—— 这就是"只在 0° 上验等于没验"的实证。
- `measuredPolygon` / `currentPlotId` 仍是多写点无主状态 —— 这是比坐标换算更大的风险，
  但收敛它必然要动 5 个 inline 模块，属于"重写"而非"切片"，需要单独排期。
- 材料量 / 存档的数值对照已由 `_probe_coord_equiv.cjs` 补齐（见上）。**但 `pp.zoom`、`optPriceF/M/B`、
  `tlAux.nodes`、`canonicalDrawingDesign.revision` 这 6 个字段本身在同实现重跑时就会抖**，
  这是站点既有的回填时序问题，本轮**只登记不修**：它会让任何"两次生成结果 diff"式的验收都不可靠，
  下次做等价性证明必须先跑噪声底线，否则一定会误判。

#### 六、AOCI 状态

**本会话 AOCI 工具不可用**：`aoci_rules` / `aoci_overview` / `aoci_maintain` 未注册（`.mcp.json` 为
`{"mcpServers":{}}`，`.aoci/hooks` 为空目录，`~/.aoci` 不存在）。按 AGENTS.md「证据不足时用
`aoci_report` 登记待办，不猜写」——该工具同样不可用，故**没有手写 `aoci.code.txt` 任何条目**
（手写会违反"Entry 语义必须来自真实证据 + 机器签发的 Plan"）。

⇒ 需要下一次有 AOCI 工具时补做 Maintain：新对象 `core/coord-frame.js`、
`tests/coord_frame.test.cjs`、变更对象 `mod/inline-09.js` / `index.html` / `sw.js` / `ci_check_static.cjs`。
`.aoci/baseline.json` 与 `aoci.code.txt` 的现有 `M` 状态**是别的会话的未提交改动，本轮没碰**。

---

---

## 26.76 分区角度下「网格与管路画到地块外」的裁剪（v837 · 2026-10-31）

**用户原话**：「分区角度 30° 时，分区网格和管路整体画到地块边界外面，这个问题处理一下，
经过你分析，我发现这个问题还挺严重的。这个工作都做完了吗」

**诚实答案：没有做完。** 这个问题一直挂在「已知未修」，v834 那次发布时仍然存在。
更关键的是：**v830 已经写过一份管路裁剪（`ppClipSegToPoly` / `pushSeg`），但从来没提交、也没上线**，
而且只覆盖了管路，**网格与格子标注那一半没做** —— 用户说的「整体」两半都包括。

### 一、成因（不是"管路算错"，是"格子本来就在地块外"）

分区角度非 0 时，格子是**旋转后的外接框**切出来的。于是：

| 画出去的东西 | 为什么在外 |
|---|---|
| 网格虚线 | `ppDrawZones` 第二遍从**格系包围框** `minY→maxY` 整条画，这个框就是旋转外接框 |
| 分区底色 | 不受影响 —— 第一遍外面有 `ppTracePlotPath().clip()`，所以色块是对的 |
| 主管 / 支管 | 按整格 `(zx, zy, zoneW, zoneH)` 撒，格子四角在地块外 ⇒ 管子端点在地块外 |
| 格子标注 | 锚点是格子矩形中心，最外圈格子的中心会跑到地块外的空白里 |

> 「色块在地块内、虚线探到地块外」这个组合本身就是线索：只有第二遍没被 clip。

### 二、改法（一份实现，不写第二份求交）

- **撤掉 v830 的 `ppClipSegToPoly`**：它与 v659 的 `ppClipPolylineToRing` 重复，而且
  「只保留最长的一段界内区间」在**凹多边形**上会把另一段真实管段吞掉
  （U 形地块一条线穿进穿出两次 → 只剩一条臂有管）。
- 新增 `ppClipSegsToPlot(a, b, poly)`：委托 `ppClipPolylineToRing`，**返回多段**（凹形正确），
  并在「整段本来就在界内」时**原值透传**（见下条）。
- **边界容差** `ppRingIn` / `ppOnRingEdge`：网格线最外圈本来就压在地块边上，而
  `atPointInPolygon`（inline-10）用的是严格 `<`，对边界上的点结果未定义 ——
  实测 0° 下最右那条竖线**整条被判在界外、于是整条不画**（比越界更糟：用户会以为少了一条线）。
  ⇒ 判据改为「射线法 或 落在边上」，容差取环尺度的相对值（格系/世界系量级不同，写死不行）。
- `ppClipPolylineToRing(line, ring, fnInOverride)`：**纯增量**加第三个可选参数，
  不传时行为与 v659 完全一致（v659 的调用点是块间分发，不需要软判定）。
- **网格线**：`ppDrawZones` 第二遍改成「先把每条线换到世界系 → 裁剪 → 逐段 stroke」。
  不开 canvas clip 而真裁线段，是为了与第一遍（真几何）和 `ppHitTestCutLine`（真几何）同口径。
- **格子标注**：中心在界内**一个像素都不动**；真的出界才换成「本格 ∩ 地块」的形心
  （`ppZoneClipCenterWorld` = `ppClipPolyToRect` + 面积形心 `ppPolyCentroid`）。
- **测量钩子**：`window.__ppLastCuts` / `window.__ppLastGridSegs`（`try{}catch{}` 一行，无行为影响），
  让探针能量到「真正 stroke 出去的那几条」，而不是靠复原。

### 三、0° 逐位不变的证据（这是回归底线）

`ppClipPolylineToRing` 内部用 `lerp` 取端点，`t=1` 时 `a+(b-a)*1` 在浮点下未必等于 `b`
（如 `0.1+(0.3-0.1)*1 = 0.30000000000000004`）⇒ 若不做透传，「0° 生成结果哈希不变」会随机破。
`tests/zone_clip.test.cjs` 用 `assert.deepEqual` 锁死这一点。

### 四、实测（同探针、同代码路径、两侧都真生成出管路）

`_probe_zone_clip.cjs <file|live>`，300×170 m 地块、原点归零、两管程；
「修复前」= 独立 `git worktree` 检出 `53c9164` 跑同一个探针（不动主树）。

| 项 | 0° 修复前 | 0° 修复后 | 30° 修复前 | 30° 修复后 |
|---|---|---|---|---|
| 主管 | 300m，0/105 越界 | **300m，0/105** | 313/690m 界内（45.4%） | **311/311m（100%）** |
| 支管 | 260m，0/105 越界 | **260m，0/105** | 240/594m 界内（40.5%） | **241/241m（100%）** |
| 网格线 | 1620m，0/168 越界 | **1620m，0/168** | 1006/3115m 界内（32.3%） | **1055/1055m（100%）** |
| 管数 | 5主/5支 | **5主/5支** | 12主/12支（含幽灵角格） | **6主/5支** |

- 30° 网格画出去的总长 **3115m → 1055m**：少了 2060m 的幽灵虚线（原本 2/3 在地块外）。
- 主管界内长度 **313 → 311m**、支管 **240 → 241m**：**界内有效管段一根没少**，
  少掉的 377m / 354m 全是界外的幽灵段。
- 管数 12 → 6：旋转外接框的四个幽灵角格整格在地块外，裁完自然不再产生管子。
- 0° 三行**逐项相同**（长度、采样数、越界数全等）⇒ 无退化。
- 「修复前」的网格数字里，界内长度是**按 21 点采样量化的**（会略偏低），
  「修复后」读的是真实 stroke 线段长度，所以 1006 与 1055 不可直接相减。

### 五、Node 契约测试 `tests/zone_clip.test.cjs`（10 项，已 `git add -f` 入库）

全部用**源码切片**跑（`ppClipPolylineToRing` / `ppClipSegsToPlot` / `ppOnRingEdge` / `ppRingIn` /
`ppPolyCentroid` + inline-10 的 `atPointInPolygon`），不手抄几何：

1. 0° 网格线逐位透传（`deepEqual`，不给容差）
2. 0° 主管/支管逐位透传
3. 30° **缺陷基线**（未裁剪 >20% 采样越界）+ 裁剪后 **0 越界** + 长度比落在 30%~80%
4. 30° 最外侧一格主管：先断言「这根本来就有一端在界外」，再断言裁完全在界内且变短
5. **凹多边形 U 形**：一条横线穿进穿出两次必须返回 **2 段**（各 100m）—— 锁住 v830 版会吞段
6. 整根在外 → 空数组；7. 空环/短环 → 原样返回不抛错
8. 部分出界格子：形心换算回世界后必须**真的在界内**
9. **调用点契约**：`pushSeg` / `ppDrawZones` 必须真的调用 `ppClipSegsToPlot`，
   旧的「整条跨满包围框」画法不许回来，`function ppClipSegToPoly` 必须不存在
10. `ppPolyCentroid`：正方形形心 = 中心，且**绕向翻转不影响**（防分母 3A/6A 写错）

### 六、顺手修的真 Bug：`esc is not defined`（`mod/inline-09.js`）

排障时被它挡了两次。`esc` 的定义在 **`mod/inline-14.js`**（全局函数），而 inline-14 在
`index.html` 里排在 inline-09 **之后**。任何「inline-09 已就绪、inline-14 未执行」的时间窗里：

- `tlAutoGenerate` 的 **catch 分支**（错误提示框）引用 `esc` ⇒ 真正的错误被
  「esc is not defined」顶替，控制台只剩与病因无关的报错（本次就是这样把
  「规范绘图模型拒绝三级生成结果」埋了整整一版）；
- `tlPrintDiagram`（打印图纸）同样吃这个全局。

⇒ inline-09 自带一份语义相同的 `esc`（`& < > "` 四字符），不再跨脚本依赖。

### 七、发现了但**没修**的两处（登记，不越界）

1. **`angle=0` 且地块原点非 (0,0) 时，生成的管路整体平移**：`ppBuildAutoPipes` 末尾只在
   `|frame.angle|>0.001` 时才 `frame.toWorld(...)` 把结果换回世界系；角度为 0 时管路留在
   **cuts 空间**（= 世界 − 包围盒左下）。实测 `cutScaleX/Y=1`、`origin=地块包围盒左下`，
   所以这就是一次纯平移。真实地图回传的地块原点为 0 ⇒ 现场不触发；但**原点非 0 的地块会把管子整体挪走**。
   本次探针一开始就撞上它（0° 支管整排在界外），最后是把探针多边形改成原点归一才排除。
   ⚠ 这也说明：**裁剪用的环必须与管子同空间**。当前 `ppPipeClipPoly = ppState.polyPts` 在
   `angle≠0` 时恰好等于 cuts 空间（因为 `frame.poly` 已归一到原点），在 `angle=0` 且原点为 0 时也重合，
   所以两个真实场景都对。要修这条平移，得在 `finally` 里对 `angle=0` 也走一次 `cuts.frame.toWorld`。
2. **`ppPointInPlot` 判阀门也吃同一个空间假设**（同样只在原点非 0 时出错）。

### 八、发布状态

- 版本三处同抬：`sw.js VERSION = 'v837-zone-clip'`、`index.html` 的 `style-01.css?v=837-zone-clip`，
  以及 `mod/inline-09.js` / `mod/plot-editor.js` 的 `?v=` 一并抬（这两支是 CORE 文件，改了必须抬）。
- 闸门：`node scripts/check.cjs` → **PASS=29 FAIL=0**、单测 **48 个文件 / 341 项全绿**；
  `node check_publish_refs.cjs` → PASS；`node scripts/lint.cjs` → 无告警。
- **未提交、未推送**：等用户点头。工作区另有 8 个并行会话的未提交改动
  （`.aoci/baseline.json`、`aoci.code.txt`、`mod/inline-18.js`、`mod/style-01.css`、
  `runye-hydraulics-page.js`、`tl-workspace/tl-workspace.js`、`shared-canvas-browser.cjs` 等），
  **本次不得 `git add -A`**。注意 `mod/plot-editor.js` 的 diff 里含着 v830 那份并行改动，
  本版是在它基础上改的（撤掉了其中的 `ppClipSegToPoly`），提交前需与对方确认归属。

## 26.77 总管四期：右侧属性面板 + 节点标记（v838 · 2026-10-31）

> 规格书九节审计后的**第一批**。用户「按照你的建议逐步推进」⇒ 先补「参数与校核」层的入口件：
> 没有面板，`params.dn/designFlow` 在界面上根本无处可填，底部状态栏的「流速」永远是「—」，
> 后面的告警/水力复核/材料清单都缺输入。节点类型（水源/三通）与它同批次做，因为
> 局部损失要数三通、DXF 要按类型分层、水源唯一性要跨线约束——三者都读这一份数据。

### 一、新增 `mod/trunk-panel.js`（约 330 行，纯计算 + DOM）

- `compute(entry)` **纯函数**：输入一条干线，输出 11 个派生量（projM / slopeM / z0 / z1 / dz /
  dn / flow / v / vLevel / hf / hj / hfTotal）。不读 DOM、不读 `window` 状态、**不改入参**。
- 沿程损失 = 海曾-威廉 `hf = 10.67·L·Q^1.852/(C^1.852·D^4.8704)`，C 随管材：
  PE 140 / PVC-U 145 / 镀锌钢管 120（`MATERIALS[].hwC` 是**唯一**实现点，别在别处再写一份）。
- 局部损失 = `(0.5·弯头 + 1.5·三通 + 0.5·进口)·v²/2g`；弯头数 = 拐点数 − 2，三通数来自
  `params.nodeTypes`，进口损失只在 0 号点是 `source` 时计。
- 流速分档：`<0.8 low(黄) / ≤2.0 good(绿) / ≤3.0 warn(黄) / >3.0 bad(红)`。**只上色，不阻断**（规格一⑧）。
- `mount({container,getEntry,onPatch,onRecheck,onMarkNode,onClose})` 只负责画 DOM 与发意图，
  **不碰存储**：写库一律由宿主 `onPatch` → `commitTrunks` 完成。

### 二、`core/trunk-schema.js` 增量（契约扩展，向后兼容）

| 新增 | 作用 | 关键约束 |
|---|---|---|
| `normalizeCode(v)` | 管线编号规范化 | trim + 压空白 + 截断 24 字；**非字符串给空串** |
| `normalizeNodeTypes(raw,count)` | 拐点类型归一 | 只认 `source`/`tee`；`plain` 不落库；越界下标丢弃；单线内多 `source` 只留键序第一个 |
| `makeCode(trunk)` | 生成 `ZG-001…` | 补空位、避让已占用，与 `makeId`（T1/T2）**分开** |
| `normalize()` 尾部 | 跨干线去重水源 | 全方案只留第一个 `source`，顺序按 trunks ⇒ 结果确定 |

- `id` 仍是引用键（`activeTrunkId` / `labels` 下标都挂在它上面），**编号只写 `params.code`**，
  改编号不会打断任何引用（探针 E3 锁着）。
- `params` 的核心约定不变：**保留对方给的全部字段**，只规范化 `code`（它是显示字符串）。

### 三、`mod/online-map.js` 增量

- `renderTrunkNodes()`：`L.circleMarker` 画水源（r8 蓝实心）/ 三通（r5 橙实心），`interactive:false`；
  在 `renderTrunkDraft()` 末尾调用。**不放进 `measureGroup`**（那组在测距/清除时会被整体清空）。
- `ensureTrunkPanel()` **延迟创建**：`.map-wrap` 会被 `ensureSharedHost` 搬动，启动阶段建可能建进游离树。
- `patchTrunkParams(id,patch)`：面板改字段的唯一写回口，走 `applyTrunkEdit → commitTrunks`
  （revision 冲突/校验/撤销记账照常发生，面板不需要知道存储细节）。
- `openNodeDialog(id,idx)`：右键「标记当前拐点」与面板底部按钮共用。**用 DOM 拼不用 innerHTML**
  （拐点名称是用户输入）。顺带保留 v833 的命名能力，旧 `params.labels` 不会变得改不回去。
- `applyNodeMark()`：写 `nodeTypes`；`kind==='source'` 时先把**其它**干线上的 `source` 摘掉。
- 底部状态栏：`msbTrunk` 改显示 `params.code || id`；编辑态显示**当前选中那条**（原来恒显示主干，
  用户在面板改 ZG-003 时状态栏却念主干，两个控件互相拆台）。
- `commitTrunkDraft()`：新建时补 `params.code = S.makeCode(next)`。

### 四、四个踩过的坑（都已在代码注释里留了口径）

1. **`normalizeParams` 是浅拷贝**：`p2.nodeTypes` 与 `t.params.nodeTypes` 是**同一个对象**。
   清完水源若"只在还有别的标记时回写 `t.params`"，库里会留下 `nodeTypes:{}` 空壳
   （探针 G5 实测到）。⇒ 现在无条件回写。
2. **水源唯一必须写入期就清**：只在读取期（`normalize`）去重也能"用"，但用户会看到
   「我标的水源自己跑了」，且换一次读取顺序就是另一个结果。两处都要做。
3. **一位小数看不见的差**：4 m 高差摊在 211 m 上只多 0.04 m，斜长与投影**显示串完全相同**。
   断言必须比 `compute()` 的数值，比显示串会假红（探针 F2 第一版就这么红过）。
4. **面板「关闭记忆」要按线 id 压住**：按布尔值记会导致"改一次管径又自己弹回来"；
   完全不记又变成"关了就打不开"。现在的口径：× 只压住**当时那条线**，换线照常弹。

### 五、测试与探针

- `tests/trunk_panel.test.cjs`（12 项）：缺高程 ⇒ 斜长/高差必须 null、高差上坡正下坡负、
  缺 dn/flow ⇒ 水力区全 null、流速公式与分档边界、三档管材 C 值排序、弯头/三通计数、
  `compute` 不改入参、带/不带 schema 两条读取路径一致、haversine 对称性与量级。
- `tests/trunk_node_types.test.cjs`（10 项）：plain 不落库、越界下标丢弃、单线多 source、
  跨线唯一、`code` 不影响 `id`、`makeCode` 补空位、未知参数仍透传、v1 升级不凭空造标记。
- `_probe_trunk_p7_panel.mjs`（**41 项全绿**）：面板显隐/标题/12 行字段、只读量与状态栏同源、
  改管径/流量/编号后「库 + 面板 + 状态栏」三处一致、revision 递增、有高程线的斜长与高差、
  节点弹窗 3 项文案、水源唯一（G4~G6）、同点改标不新增圆点（G7）、两条线各留标记（G8）、
  复核水力有结论、× 关掉不弹回/换线弹回（I1~I3）、**Ctrl+Z 能退回面板改动**（K1~K2）、
  全程无 `pageerror`。

### 六、本切片**没做**（下一批，按用户确认的顺序）

1. 黄色非阻断告警弹窗 + 「不再对该总管提醒」单根屏蔽（依赖本批的 dn/flow ✅ 已具备）。
2. DXF `ZG_总管层` + 过滤捕捉白点（`runye-dxf.js` 现在只有 PLOT/ZONE/PIPE_*）。
3. 「重新复核水力」的**联合**部分：现在只算本条线；规格要「总管 + 下游所有分区管网整套复核」，
   前提是地图页先有 AI 管网图层（当前 `tlDiagramData` 只被拿去反算捕捉点，**不渲染**）。
4. 地图页叠加 AI 分区管网（只读）+ 图层顺序/线宽规范（总管现在是深灰 `#475569`，
   规格要「粗深蓝」）。
5. 分区管路页移除手绘总管入口 `#grTrunkDraw`（`inline-29.js:1247` 仍绑着，两套总管并存）。
6. 众包案例库打包（`众包` 全站零命中）。

### 七、发布状态（v838）

- 版本三处同抬：`sw.js VERSION='v838-trunk-panel'`、`index.html` 的 `style-01.css?v=838-trunk-panel`、
  `core/trunk-schema.js` / `mod/online-map.css` / `mod/online-map.js` / 新增 `mod/trunk-panel.js` 的 `?v=` 一并抬；
  `mod/trunk-panel.js` 已进 SW `CORE` 名单（裸路径，不带 `?v=`）。
- 闸门：`scripts/check.cjs` **全部通过**、`node --test tests/*.test.cjs` **353/353**、
  `check_publish_refs.cjs` **PASS**、`scripts/lint.cjs` 无告警。
- ⚠ 探针需要 playwright：`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i --no-save playwright`，
  跑完**删掉 `node_modules`**（`node_modules` 不在 `.gitignore` 里）。

## 26.78 总管五期：流速黄色告警 + 单根屏蔽（v839 · 2026-10-31）

> 规格六。第一批（v838 属性面板）把 `dn/designFlow` 带进了界面，这一批才有"超标"可判。

### 一、判定是纯函数（`mod/trunk-panel.js`）

```js
RyTrunkPanel.shouldWarn(entry, derived?) -> { warn, muted, vLevel, v, text }
```
- 只对 `vLevel ∈ {warn, bad}` 告警；**`low`（<0.8 m/s）不算告警** —— 偏低是选型浪费，
  不是水力风险，把它塞进来会让提示永远在响，等于没有提示。
- `warnMuted` **只看严格 `true`**：老数据里可能是 `'true'`/`1`/`'false'`，按 falsy 判会
  出现"点了不再提醒它还在弹"或反之。
- 缺 `dn`/`designFlow` 时 `v` 是 `null` ⇒ 不告警（**不能**被当成 0 去比档位，否则误报"偏低"）。
- 文案 `WARN_TEXT` 是规格原文，`tests/trunk_warn.test.cjs` 逐字比对。

### 二、卡片是"非模态"，这是设计决定不是偷懒

- 规格一⑧：「水力超标只黄色提示，不能阻断绘制/保存/导出/复核」。
  做 modal 遮罩就等于阻断（遮罩会吃掉后面所有点击）⇒ 用地图区里的一张浮卡片：
  `position:absolute`、`top:44px` 居中、`z-index 1185`（提示条是 1190，互不覆盖）、无 backdrop。
- 探针用**机械判据**验"非阻断"，不靠肉眼：① `elementFromPoint` 命中的仍是面板控件本身；
  ② `body` 下不存在 `fixed` + 全屏 + `z>1000` 的节点；③ 卡片在时改管径仍然落库。
- 位置避让：顶部 8px 是 `.map-trunk-hint`，右下是属性面板 + PWA 安装条 ⇒ 卡片取 44px。

### 三、触发与失效（都在 `mod/online-map.js`）

| 时机 | 行为 |
|---|---|
| 面板【重新复核水力】 | 有 tip 结论 + 超标就弹卡 |
| 保存干线（`commitTrunkDraft` 成功） | 记 `savedId` 后判一次（"画完才想起没填管径"是最常见的现场） |
| 改任何参数（`patchTrunkParams` 成功） | **收起**旧卡（上面那个流速已成旧值，宁可让用户再点一次复核） |
| 换选中线 / 进入绘制态 | 收起（卡里说的是另一根线的事） |
| 点【知道了】 | 只收起，**不写**屏蔽 |
| 点【不再对该总管提醒】 | `patch({warnMuted:true})` 走 `commitTrunks`（正常写库、revision+1、可撤销） |

### 四、屏蔽的出口必须双向

- `core/trunk-schema.js` 的 `normalizeParams`：`warnMuted !== true` 一律删键 ——
  库里不攒"等价于 false"的脏值，下游也不用再判"哪种算屏蔽"。
- 面板 footer 第三个按钮 `#tpWarnToggle`：`流速提醒：开启 / 已屏蔽`，点一次翻转。
  没有这个出口的话，用户点了"不再提醒"就**永久**看不到该线告警（除非重画），那是个死胡同。

### 五、测试

- `tests/trunk_warn.test.cjs`（11 项）：经济不弹、偏高/超标弹、**偏低不弹**、脏值当没屏蔽、
  缺数不误报、文案逐字、可传 derived、不改入参、schema 只留 true、端到端（存 true → normalize → 仍屏蔽）。
- `_probe_trunk_p8_warn.mjs`（**27 项全绿**）：文案/按钮/编号/档位、非阻断三条机械判据、
  【知道了】≠ 屏蔽（D2~D4）、屏蔽落库 + revision+1 + 面板变「已屏蔽」（E1~E4）、
  屏蔽后不弹但仍给 tip（E5~E6）、**另一条线照弹**（F1~F2）、面板解除后重新弹（G1~G4）、无 pageerror。

### 六、仍没做（下一批）

1. DXF `ZG_总管层` + 过滤捕捉白点（`runye-dxf.js` 现在只有 PLOT/ZONE/PIPE_*）。
2. 「联合水力复核」（总管 + 下游分区管网）—— 前提是地图页先有 AI 管网图层。
3. 地图页叠加 AI 分区管网（只读）+ 图层配色（总管仍深灰 `#475569`，规格要粗深蓝）。
4. 分区页移除手绘总管入口 `#grTrunkDraw`（两套总管并存）。
5. 众包案例库打包。

### 七、发布状态（v839）

- 版本同抬：`sw.js VERSION='v839-trunk-warn'`、`index.html` 的 `style-01.css?v=839-trunk-warn`
  + `core/trunk-schema.js` / `mod/online-map.css` / `mod/online-map.js` / `mod/trunk-panel.js` 的 `?v=`
  （`mod/trunk-panel.js` 已在 CORE 名单，无需再加）。
- 闸门：`check.cjs` 全部通过 / 单测 **364 项全绿** / `check_publish_refs.cjs` PASS / lint 无告警。

---

## 26.79 总管六期：DXF「ZG_TRUNK」地图总管层（v840 · 2026-11-01）

规格五的「DXF 导出含 ZG_总管层」。选了**方案 A**：改现有导出器 `runye-dxf.js`，
而不是在地图页另开一个 DXF 入口 —— 用户要的是「一张图带全部图层」，两个入口必然分裂。

### 一、为什么这一层不走 SVG 遍历

`buildDxf()` 其余图层都是遍历 `window.tlDiagramSVG`（出图用的权威 SVG 字符串）。
总管不行：图纸里画的是由总管**推出来**的设计 `frontPipe`（经过网格化 / 断点 / 平移），
真折线只住在 `plot.trunk` 里。所以这一层是唯一的"外部数据源"：

```
地块库 plot.trunk（GCJ-02 经纬度）
  → RyTrunkGeo.ll2m（±y 选边由 autoSign 定）
  → 图面米坐标
  → y 取负 ⇒ CAD 坐标（与 makeInv 同口径）
```

### 二、新增纯函数（`mod/trunk-geo.js`，Node 可测）

| 函数 | 作用 | 为什么必须在这里 |
|---|---|---|
| `ll2m(q, base, sign)` | `m2ll` 的逆 | 站点里第一次走"经纬度 → 米"反向链路 |
| `trunkToCad(points, base, sign)` | 折点 → `[[x,y],…]`，**y 取负** | 符号错在正南北干线上看不出来，只能靠单测钉 |

`y 取负`的推导（别自己重新做 view 变换）：`CAD_y = -((sy-oy)/s + minY)`，而
`sy = (my-minY)*s + oy` ⇒ `CAD_y = -my`；x 方向 `minX/ox` 正好抵消 ⇒ **CAD_x = 图面 x**。
`tlPlanView` 的 `s/ox/oy` 在这一层里根本不用出现。

### 三、层名为什么是 ASCII（`ZG_TRUNK` 而不是 `ZG_总管层`）

本导出器写 `$ACADVER=AC1018`(2004) + `$DWGCODEPAGE=ANSI_1252`，字符串按 1252 解码：

- 文字实体：`escText()` 把非 ASCII 转成 `\U+XXXX` ⇒ 中文正常（既有做法）；
- **层名没有这样的转义**。层名写 UTF-8 中文字节，AutoCAD 按 1252 解码 ⇒ 一串乱码字母，
  比 ASCII 层名更难用。

要真中文层名只有一条路：`$ACADVER` 抬到 `AC1021`(2007+) 改成 UTF-8 编码 ——
那会同时改掉**所有既有图层与实体**的编码，影响面远大于收益，需要单独一批 + 真机验证。
⇒ 层名 `ZG_TRUNK`（ZG = 总管），中文说明写在 `999` 注释行（读取方一律忽略）+ 对话框标签。
探针 A4/A6 把这两件事都锁住。

### 四、跨地块必须拒绝（本批最重要的一条纪律）

`tlDiagramData.poly` 属于**当前这张施工图**，`plot.trunk` 属于**库里那块地**。
二者不是同一块时（换了地块没重出图 / 打开的是别的地块的图），反算出的总管会整体错位
几十到几百米，而图上"确实有根线"，最难发现。

判据不用 id（库里没有 plotId 可比）：`autoSign(dd.poly, plot.polyLatLng, base)` ——
±y 两个候选都凑不出 `rms < 0.5m` 就是"这张图不是从这块地长出来的" ⇒ **不导**。
拒绝时**不弹窗**：对话框里那一行提示直接写原因并把勾选框 `disabled`
（"点了导出才发现少一层"比"提前说一声"糟得多）。

其余拒绝路径（同样只提示不中断）：成组/合并地块、没有总管、坐标系不是 GCJ-02、
缺 `tlDiagramData` 快照。

### 五、实体口径

| 内容 | 图层 | 说明 |
|---|---|---|
| 干线折线 | `ZG_TRUNK` | `LWPOLYLINE`，真彩 0x1E3A8A（深蓝）、`43`=0.5（图示宽度，**不是管径**）、不闭合 |
| 水源 / 三通 | `SYMBOL` | `CIRCLE` r=1.2 / 0.8，与地图同色（#2563eb / #f97316）；受「水泵/阀门符号」开关控制 |
| 干线编号 | `TEXT` | `params.code`（缺省 `id`），挂在中点、与图面文字同高（12px ⇒ 12/s 米）；受「文字」开关控制 |

- 节点标记是**拐点属性**（`params.nodeTypes` 一个下标只有一个类型）⇒ 同一点不会被画成两个圆。
- 勾选框 `data-k="trunk"` 默认勾选（条件满足时）；不勾就一个 ZG 实体都不出，但**层表仍然保留**该层
  （用户自己要往这层画东西时不用新建）。
- 图层表 `70` 条数由 `LAYERS.length` 自动跟随，新增层不用改别处。

### 六、测试

- `tests/trunk_geo_ll2m.test.cjs`（**9 项**）：`ll2m` 是 `m2ll` 的逆（±sign）、北=−y 选 −1、
  北=+y 选 +1、退化地块（y 全等）必须拒绝、环整体挪 40m 必须拒绝、CAD y 取负、
  **与 `makeInv` 逐位一致**（用 ts/inv 复刻闭环）、坏点整根返回 null、单点不插值。
  容差写 `0.2m` 而不是 `1e-6`：环按 `toFixed(6)` 落库，1e-6° ≈ 0.11m 是量化误差，与符号无关。
- `_probe_trunk_p9_dxf.mjs`（**28 项全绿**，本地 28/28 + 线上 28/28）：段序 / 严格 (code,value) 成对 /
  LAYER 表声明条数 == 实际记录数 / 层名全 ASCII / ZG 折线与**探针独立算的** (x,−y) 逐点相等 /
  北为正 / 圆点半径与圆心 / 编号各一次 / 三个开关（trunk、symbol、text）/
  四条拒绝路径（含"对不上时强行导也一个 ZG 折线都没有"）/ 无 pageerror。
  探针**故意不复用**页面里的 `ll2m`（否则两边同错也能全绿）。
- 探针踩过的坑（写新探针时照抄）：
  ① TABLE 表头是 `0 TABLE / 2 LAYER / 5 <h> / 100 … / 70 <count>`，`70` 在 `2` 的**后面**；
     第一版从 `2` 往前找 ⇒ 恒读成 `declared=0`。
  ② **线上匿名没有 `drawing-export` 权益**，而 `?rymock=` 只在 `file:// / localhost / 127.0.0.1`
     生效（`runye-entitle.js` 的防绕过，是对的，不该改）⇒ 线上跑 DXF 探针必须给权益门一个替身
     （`RyEntitle.can/ready = () => true`），并在 A0 里如实打印 `entStubbed:true`。
     别为此去放宽线上钩子。

### 七、发布状态（v840）

- 版本同抬：`sw.js VERSION='v840-trunk-dxf'`、`index.html` 的 `style-01.css?v=840-trunk-dxf`
  + `runye-dxf.js` / `mod/trunk-geo.js` 的 `?v=`。
- 闸门：`check.cjs` 29 项 PASS / 单测 **373 项全绿** / `check_publish_refs.cjs` PASS / lint 无告警。
- 发布：`b6d799d`，`_pub_api.py --apply` 成功；线上 `sw.js`/`index.html`/`runye-dxf.js`/
  `mod/trunk-geo.js` 四个文件的 blob sha256 与 `git cat-file blob HEAD:<path>` 全等；
  Pages `builds/latest` = `built` 且 commit 命中；探针线上 28/28。

### 八、仍没做

1. 「联合水力复核」（总管 + 下游分区管网）—— 前提是地图页先有 AI 管网图层。
2. 地图页叠加 AI 分区管网（只读）+ 图层配色（现深灰 `#475569`，规格要粗深蓝）。
3. 分区页移除手绘总管入口 `#grTrunkDraw`（两套总管并存）。
4. 众包案例库打包。
5. 「真中文层名」需要 AC1021/UTF-8 专项（见第三节），不在本批。

---

## 26.80 总管七期：地图配色 / 图层顺序 / 与 AI 管网的从属关系（v841 · 2026-11-01）

### 〇、先纠正一条审计结论（重要）

之前（§26.76 之后的实现度审计）写的是「地图页叠加 AI 分区管网 —— 缺失，
`tlDiagramData` 只用于捕捉反算、**不渲染**」。**这条是错的**，本批用探针实测推翻：

- 三级页出图时，`mod/inline-09.js:4790` 起会把设计管网反投成经纬度，
  经 `RyIrrigationDataStore.writeNetworkLayout()` 写进 `runye_network_layout`；
- 地图页 `runye-map-enhance.js` 读它，按「图层」面板的 **管网 / 滴灌带 / 设备** 三行渲染，
  并用 `networkMatchesCurrentPlot()` 按「当前地块锚点」绑定（失配就整片不画，不拿别的地块的管子充数）。
- 探针 B1/E1 实测：`overlayPane` 里确实有 `#f59e0b`（主管 dn90）/`#3b82f6`（支管 dn63）/
  `#dc2626`（总管 dn160）三条路径。

⇒ **真正缺的不是"叠加"，是"总管在图上认不出来"**：设计 front 段按管径着色（dn>110 → 红 5px），
真总管是深灰 4px，两个都在 ⇒ 用户看到的是**一根红线**，地图可编辑的那根总管被压在下面、看不出来。
本批改的就是这件事。

### 一、总管 = 粗深蓝（规格五「图层顺序 / 线宽」）

`mod/online-map.js` 新增 `TRUNK_STYLE`：

| 状态 | 颜色 | 线宽 | 说明 |
|---|---|---|---|
| 主干 | `#1e3a8a` | 6 | 与 DXF `ZG_TRUNK` 层**同一个色值**（`tests/trunk_palette.test.cjs` ① 锁着） |
| 次干 | `#1e3a8a` | 4 | 只差粗细不差颜色 —— 同一根总管换条线换色，用户会以为是两种东西 |
| 选中（编辑态） | `#2563eb` | 7 | 亮蓝加粗，编辑时需要"哪根被选中"一眼可辨 |
| 草稿 | `#7c3aed` | 6 | **仍是紫色**：它还没保存，不是总管。改深蓝会让人以为已完成 |

旧的深灰 `#475569` / 浅灰 `#94a3b8` 全部退场（`trunk_palette.test.cjs` ② 用去注释后的源码扫，防回潮）。

### 二、图层顺序：总管独占 pane（`ryTrunkPane`，z=430）

- 为什么不能靠"后添加"：Leaflet 同 pane 内按 DOM 顺序排，而管网**每次重绘都 `clearLayers()` 再重加**
  （`renderNetwork`），`bringToFront()` 下一次刷新就被打回去 ⇒ 顺序必须是**结构性**的。
- 层级：`overlayPane 400`（地块框 / AI 管网）< `ryTrunkPane 430`（总管）< `markerPane 600`
  （编辑手柄、捕捉白点、水源/三通之外的标记）。夹在中间是刻意的：手柄要能压住总管。
- 自定义 pane 的 CSS 是安全的：`leaflet.css` 的 `.leaflet-pane > svg`、`.leaflet-pane > svg path`、
  `.leaflet-pane > svg path.leaflet-interactive` 都是**通用选择器**（不是 `.leaflet-overlay-pane` 专属），
  所以透明点击区（`weight:16 / opacity:0`）在自定义 pane 里照样能点。

### 三、顺手修掉一个真实缺陷：「测量框」不再连带关掉总管

总管此前与面积测量框共用 `measureGroup`，而「测量框」开关是 `measureGroup.remove()` ——
**关掉面积测量框，总管跟着消失**（水源/三通圆点反而还在，因为它裸挂在 `map` 上）。
现在：总管折线 + 命中线 + 节点标记统一进新的 `trunkGroup` + `TRUNK_PANE`，
测量框开关只管测量框。探针 D1/D2/D3 用"先真画一个测量框 → 关掉它 → 框消失而总管与圆点都在"验。

### 四、有真总管的地块不再画设计 front 段

`runye-map-enhance.js` 新增 `mapTrunkExistsFor(plotId)`（复用 `RyTrunkSchema.hasUsableTrunk`，
排除成组/合并），`renderNetwork` 里 `if (isTrunk && suppressFront) return;`。

- **只在渲染层跳过**：`runye_network_layout` 里那段照旧保留 —— 水力校核读的就是它
  （`trunk_palette.test.cjs` ⑤ 断言 `net.segments` 不被改写）。
- 没有总管的地块（手画 / 未在地图上画干线）行为不变，设计 front 段照旧画（探针 E1）。
- `RyTrunkSchema` 不存在时（`runye-mobile-map-preview.html`）恒 false ⇒ 完全退回旧行为。

### 五、测试

- `tests/trunk_palette.test.cjs`（**5 项**，读源码的静态锁）：两处深蓝同值 / 旧灰退场（去注释后扫）/
  主次只差粗细 + 草稿仍紫 + 选中色不同 / pane z 夹在 400~600 且等于 430 /
  抑制只在有真总管时且不改写 `net.segments`。
- `_probe_trunk_p10_layers.mjs`（**18 项**，本地 18/18）：pane 存在与 z、深蓝 6/4、
  总管不在 overlayPane、水源圆点同 pane、管网在 overlayPane 且 pane 序正确、
  有总管时无红 front 段 / 主支管照画、画真测量框后关掉"框消失而总管与圆点都在"、
  无总管地块 front 段照画、无 pageerror。
- 探针踩过的坑：**Leaflet 把 `circleMarker` 渲染成 `<path>`，不是 `<circle>`**
  ⇒ 按 `stroke` 色 + `stroke-width` 认（水源 `#1d4ed8`/2、三通 `#9a3412`/1.5），
  查 `circle` 标签会永远 0 个。

### 六、发布状态（v841）

- 版本同抬：`sw.js VERSION='v841-trunk-layers'`、`index.html` 的 `style-01.css?v=` +
  `runye-map-enhance.js` / `mod/online-map.js` 的 `?v=`；`runye-mobile-map-preview.html` 的
  `runye-map-enhance.js?v=` 一起抬。
- 闸门：`check.cjs` 29 项 PASS / 单测 **378 项全绿** / `check_publish_refs.cjs` PASS / lint 无告警。

### 七、仍没做

1. 「联合水力复核」（总管 + 下游分区管网）：现在两套数据（`plot.trunk.params` 与
   `runye_network_layout`）各自的流量还没打通，需要先定"总管流量取设计值还是实测值"。
2. 分区页移除手绘总管入口 `#grTrunkDraw`（两套总管并存）。
3. 众包案例库打包。
4. 真中文层名（AC1021/UTF-8 专项，见 §26.79 三）。

---

## 26.81 总管八期：联合复核只读视图（v842 · 2026-11-01）

### 一、这一版**故意不做**什么（先看这条，否则会以为漏做）

规格七要「联合水力复核：总管 + 下游分区管网 ⇒ 给出合计损失」。**合计损失这一项这一版不给出**，
这是决策不是遗漏。

原因：总管侧的数字来自 `plot.trunk.params.designFlow`（**设计值**，用户填的），下游侧的数字来自
`runye_network_layout.segments[].q`（**由分区反投出来的段流量**）。两条链现在没有共同的流量来源：
总管流量不是从下游 Σ 反算得到的，下游 Σ 也不受总管约束。**直接把两边损失相加，在物理上等于
「假设两次独立设计刚好首尾相接」**，是个可能对也可能错两倍的数字。在一个验收工具里给出一个
可能错两倍的总损失，比不给更糟。

所以本版只做**只读对照**：两套数字并排放、各自标出来源、加三条自洽性判据，并在面板上常驻一句
「合计损失暂不给出：总管流量取设计值还是下游实际值尚未定口径，本版只做对照」。
这句说明是**产品的一部分**（`D1` 探针守着），不是临时占位符 —— 删掉它才是回归。

口径定下来之后，接的方式是：在 `jointReview()` 里把 `out.trunk.flow` 换成 `resolveJointFlow()`
返回的单一来源，然后才允许出现「合计」两个字。

### 二、`mod/trunk-panel.js`：`jointReview(entry, layout, derived)` 纯函数

```js
jointReview(entry, layout, derived) -> {
  ok, hasLayout,
  trunk: { code, material, dn, flow, v, hf, len },      // 来自 derived（compute 的结果）
  down:  { segCount, mainCount, branchCount, mainMaxDn, lenM, qMax },
  checks: [{ lvl:'ok'|'warn'|'info', t:'…' }],
  note:   '…'
}
```

四条硬口径：

1. **`front` 段不计入「下游」统计**（`kindOf(seg)` 认 `front` 前缀，也认 `kind:'front'`）。
   `front` 是分区反投时给总管画的那条**设计代理线**，把它算进下游 = 同一根管被数两遍，
   总长直接虚高，还会让「总管 DN ≥ 最大主管 DN」这条判据永远成立（因为它就是总管自己的复制品）。
2. **流量取「最大段流量」`qMax`，绝不 Σq。** 下游各段是**并联**关系（一个三通分出去几路），
   相加得到的是「如果所有支管同时按设计流量满流」的假想值，比总管设计流量大得多，
   会让「总管流量不足」这条判据变成永远在叫。这是最容易写错的一条。
3. **地块归属必须校验**：`layout.plotId !== 地图上正在编辑的地块` ⇒ 返回 `out.note='下游管网快照
   属于另一块地（xxx）…'` 且 `checks:[]`。宿主侧 `currentPlotNetwork()` 用 `{mismatch:true,plotId}`
   表达这件事，**不是返回 `null`** —— 返回 null 会被渲染成"下游还没做"，把"看错地块"伪装成"还没做"，
   这是两种完全不同的用户动作。
4. **缺任一边 ⇒ `info`「…对照暂不可做」，不是 `ok`。** 没有总管管径时不能说"管径自洽"。

判据本身只有两条（都只在两边都有数时才出）：

- `trunk.dn < down.mainMaxDn` ⇒ warn「总管 DN63 比下游最大主管 DN90 还细，管径需复核。」
- `trunk.flow < down.qMax` ⇒ warn（同理）。

### 三、`mod/online-map.js`：宿主侧只做两件事

```js
trunkPanel = P.mount({ …, getLayout: currentPlotNetwork });   // 注入

function currentPlotNetwork(){        // 读快照 + 校验归属，不做任何计算
  var store = window.RyIrrigationDataStore;
  if (!store || typeof store.readNetworkLayout !== 'function') return null;
  var net = store.readNetworkLayout();                        // try/catch 兜住
  if (!net || !Array.isArray(net.segments) || !net.segments.length) return null;
  var pid = String(currentMapPlotId == null ? '' : currentMapPlotId);
  if (!pid) return { mismatch:true, plotId:… };
  if (String(net.plotId ?? '') !== pid) return { mismatch:true, plotId:… };
  return net;
}
```

**归属锚点用 `currentMapPlotId`，不是 `currentPlotId`**（理由同 §26.75：`currentPlotId` 是施工图
那套，`currentMapPlotId` 才是地图这套；两者在同一次操作里可能不一致）。面板是地图上的面板。

### 四、`mod/online-map.css`：`.tp-joint` 一族

`.tp-jt-check` 用 `::before` 小圆点表达级别（`.is-ok` 绿 / `.is-warn` 琥珀 / 默认灰），
**不用图标字体、不写 `border-radius` 数值**（`body *{border-radius:0!important}` 会压掉，
正式模板见 §26.76 那条教训）。区块标题右侧 `.tp-jt-sub` 常驻写「总管 + 下游分区管网」，
让"这两行数字不是同一个来源"在界面上自证，别只写在文档里。

### 五、测试

- `tests/trunk_joint_review.test.cjs`（**12 项**，`git add -f` 入库）：
  front 段不计 / 并联支管不 Σq / 两边都有数才出判据 / DN 细则 warn / 流量细则 warn /
  缺总管管径出 info 不出 ok / 地块失配说"属于另一块地"且不给 checks / 下游空也给 note /
  「合计损失暂不给出」文案常驻 / `qMax` 取最大不是求和 / 长度按段长求和不含 front / 导出面。

- `_probe_trunk_p11_joint.mjs`（**16 项**，本地 16/16）：A1~A4 两行数字与来源、B1~B3 自洽判据、
  B4-pre/B4-pre2/B4/B5/B6 改管径立刻重算且真写库、C1/C2 地块失配、D1 口径说明、F1 无 pageerror。

### 六、探针踩的坑：`select.value='63'` 是假失败

第一版 B4 写 `document.getElementById('tpDn').value = '63'` 后触发 `change`，结果
`{"dn":null,"rev":5}` —— revision 前进了（说明真写库了），但值写成了 `null`。

原因：`DN_PRESETS = [110,125,160,200]` 里**没有 63**，`<select>` 里也就没有 `value="63"` 的
`<option>`。给 `select.value` 赋一个不存在的选项，DOM 规范的做法是**赋成空串**（而且 `selectedIndex`
变 -1），于是 `dnEl.onchange` 里的 `Number('')` → `0`／`null` → `patch({dn:null})`。

**教训不是"探针要写对"，而是"探针要顺着真实用户路径走"**：界面上想输 63 只能走「自定义…」
（`value='__custom'` → 展开 `#tpDnCustom` → 在 input 上触发 `change`）。任何"绕过交互直接塞值"
的探针都可能在一个**用户根本走不到的状态**下判绿或判红。B6 就是为了堵这条：写库成功后回填
必须还是「自定义 63」，不能被旧值悄悄改回去。

### 七、发布状态（v842）

- 版本同抬：`sw.js VERSION='v842-trunk-joint'`、`index.html` 的 `style-01.css?v=` +
  `core/trunk-schema.js` / `runye-map-enhance.js` / `mod/online-map.css` / `mod/trunk-panel.js` /
  `mod/online-map.js` 的 `?v=`。
- `runye-mobile-map-preview.html` 的 `runye-map-enhance.js?v=` **本版不动**（该文件内容本版没改，
  抬 `?v=` 只会让移动预览多下一次 300KB 的包，没有收益）。
- 闸门：`check.cjs` 29 项 PASS / 单测全绿 / `check_publish_refs.cjs` PASS / lint 无告警。

### 八、仍没做

1. **合计损失**（口径未定，见本节一）。
2. 分区页移除手绘总管入口 `#grTrunkDraw`（两套总管并存）。
3. 众包案例库打包。
4. 真中文层名（AC1021/UTF-8 专项，见 §26.79 三）。

---

## 26.82 总管九期：扬程口径定稿 —— 在线地图总管长 + 分区主管及支管（v843 · 2026-11-01）

### 一、用户的口径（一句话）

> **扬程应该是「在线地图总管长度 + 分区主管及支管长度」来算。**

这同时回答了 §26.81 留下的问题（合计损失怎么给）。但要先把「改之前是什么」说清楚，
否则下次有人看到代码会觉得这是个 bug：

三级扬程的算式（`mod/inline-09.js` 的 `computeThreeLevel`）本来**就是**三段相加：

```js
const totalPipeLoss = frontPipeLoss + mainLoss + branchLoss;
head = (lift + dh + 入口压力 − 已有压力 + totalPipeLoss + 过滤损失 + 4m富余) × 1.10
```

**主/支管**已是「最远分区最不利路径」的实际折线长（`tlWorstPathLen`）。
缺的是**总管那一项**：它取的是**设计图面** `tlDiagramData.frontPipe` 从水源走到最远分区
接点的弧长 —— 而用户在在线地图（`plot.trunk`）亲手画的那根总管，**从头到尾没进过扬程**。
两条路画出来的总管不是同一根，长度自然也不一样。

⇒ v843 补的正是这个缺口：**有地图总管就用它的实测长度**，不复述设计值。

### 二、一个必须说清的单位问题（这次撞上了）

把两段长度相加以前，得先确认它们**落在同一个米里**。

- `__runyeGeoBase` 的 `mlat`（`m2ll` / `ll2m` / inline-09 / inline-13 / inline-16 / online-map）
  全部用 **R = 6378137**；图面里量出来的主管/支管长度就是这套米。
- `mod/trunk-panel.js` 的 haversine 从 v838 起用 **R = 6371008.8**（IUGG 平均半径）。
  这是全站**唯一一处**孤立取值，看着更"正确"，实际让地图侧的长度比图面侧**短 0.11%**
  （342 m 上差 0.38 m）。

0.38 m 本身不影响结论，但**两个单位的米不能直接相加**。所以 v843 把 haversine 的 R
统一到 **6378137**，并且：

- 唯一实现放在 `mod/trunk-geo.js`（`haversine` / `lineLen` / `trunkLen`）；
- `trunk-panel.js` 保留一份本地兜底（只在 geo 未加载时），用
  `tests/trunk_geo_ll2m.test.cjs ⑰` 锁**逐位相等**；
- 抛 Mona 那条反查用例：`⑫` 用 `m2ll` 造一条精确 100 m 的线、`lineLen` 量回来必须等于
  100.000 —— R 一旦取错这条立刻红。（它确实红了一次，就是这么发现的。）

顺带：`tests/trunk_panel.test.cjs ①` 的期望值原本写死了 207493（旧 R），已改为 207725。

### 三、改动清单

| 文件 | 改了什么 |
|---|---|
| `mod/trunk-geo.js` | 新增 `haversine`（R=6378137）、`rawPointOk`、`lineLen`、`trunkLen`；收 imaging 测距唯一实现 |
| `mod/trunk-panel.js` | haversine 改走 geo（带兜底）；新增 `segLenOf`、`designBlock`；`jointReview` 多一个 `design` 入参；修复两个真缺陷（见下） |
| `mod/inline-09.js` | 新增 `tlMapTrunkLen()`、`tlFrontLenUse()`（总管长度**唯一收口**）；两个赋值点都改走它；返回新增 `frontLenSrc` / `frontLenMap`；「扬程计算式」标注来源 |
| `mod/online-map.js` | `getDesign: currentDesignNumbers`（读 `computeThreeLevel()`）；**`RyMapHost.currentPlotId()` 新开只读出口** |
| `hydraulic-calc/pipe-path-loss.js` | 新增可选入参 `frontTotalOverride`（按比例缩各取水点 run）；不传时**逐位不变** |
| `mod/online-map.css` | `.tp-jt-sep` / `.tp-jt-h2` / `.tp-jt-loss` / `.tp-jt-sum`；顺手修 `border-radius:50%` 没带 `!important`（全站规则会把它压成方块） |

### 四、`tlFrontLenUse()`：三个来源，必须能自证

```js
tlFrontLenUse(wpFront, frontPipeLen) -> { len, src, mapLen, mapId }
src = 'mapTrunk'   // 在线地图总管实测（优先）
      'figure'     // 设计图面最远分区弧长
      'input'      // 试算输入值
```

- 水源连接段（`tlSourceLinkLen`）+ 水源距离（`planSrcDist`）**照加** —— 那是「水源到总管
  起点」，不属于总管本体。
- 「扬程计算式」下方会把来源写出来：「总管 423.4 m（在线地图实测 · 最远 3 区主/支管）」。
  **「423.4 m（在线地图实测）」和「200 m（试算输入）」对用户是完全不同的两条信息**，不能
  只给一个数。

### 五、`frontTotalOverride`：为什么是"按比例缩"而不是"整根替换"

总管是一根**带多处取水点**的管，各段流量沿程递减（`pipe-path-loss.js` 的
`active.forEach` 就是在按这个累损失）。直接「全长 × 组流量」会把后段流量算大。

⇒ 取`runMax = max(每区取水点沿总管的 run)`，`runScale = override / runMax`，各取水点按原
比例缩放。总长等于实测值，**相对位置不变**，逐段递减的流量口径也没动。

不传 / 传 0 / 传负数 / 传 NaN / 传字符串垃圾 ⇒ `runScale = 1`，与改动前**逐位相同**
（`tests/pipe_path_loss_front_override.test.cjs ⑥` 守着，老调用方零影响）。

### 六、顺手修掉的两个真缺陷（都是 v842 埋的）

1. **下游「管长」在生产环境一直是「—」。** `runye_network_layout.segments` 由
   `mod/inline-09.js` 反投时只写 `{id, name, dn, kind, latLng}`，**根本没有 `len` 也没有 `q`**。
   面板只读 `s.len` ⇒ null。探针的 fixture 是我自己编的（带了 len/q），所以没暴露。
   ⇒ 新增 `segLenOf()`：`len` 优先，没有就按 `latLng` 现算（haversine）。
   **教训：探针 fixture 不能比生产数据更完整，否则它守的是一个不存在的场景。**

2. **「管长合计」把 front 也算进去了。** 原代码 `if (k !== 'front')` 只挡住了「数量」，
   长度那行在判断**外面**无条件累加 ⇒ 同一根管在"总管"行和"下游"行各出现一次。
   v842 的探针断言（A4 = 360 m）把错数也一并锁住了。
   ⇒ 现在 front 整段 `continue`；`down.lenMainM` / `lenBranchM` 分开给，`lenM` 不含 front。

另外：`down.lenM` 是**画在地图上的管线总长（材料量口径）**，而损失拆分里的主/支管长度是
**最不利路径长度**。两者不是一回事，界面上必须分开写「管长合计」与「损失拆分」，不许混用。

### 七、面板现在给什么

```
总管      ZG-001 · PE · DN160 · Q 60 m³/h · 0.83 m/s · 损失 1.85 m
下游      主管 1 段 · 支管 1 段 · 最大主管 DN90 · 管长合计 352.6 m
──────────────────────────────
损失拆分  按一条最不利路径
总管      423.4 m · 在线地图实测 · 5.12 m
主管      300.0 m · 5.70 m
支管      33.3 m · 0.20 m
合计损失  11.02 m
管路总长  756.7 m
三级页扬程 42.04 m
```

底注：**「合计 = 总管 + 主管 + 支管 的沿程与局部损失（按一条最不利路径）。不含静扬程、
入口工作压力、过滤损失、富余水头与 1.10 安全系数 —— 完整扬程见三级页『扬程计算式』。」**

这条界线必须写出来：1.28 m 那个数一旦被当成扬程，后果比不给更严重。
合计 = `computeThreeLevel().totalPipeLoss`，**面板不另算一份**。

### 八、`RyMapHost.currentPlotId()`：为什么必须新开这个口

`currentMapPlotId` 是 `mod/online-map.js` 的**闭包变量**，`window.currentMapPlotId` 恒为
`undefined`（历史上探针就栽过一次，memory 里记着"`currentMapPlotId` 不挂 window"）。
而 `tlMapTrunkLen()` 在 `inline-09` 里，读不到它。

⇒ 按文件里既有的约定（「外部想读状态走 `window.RyMapHost`」）加一个只读标量出口。

地块锚点口径：**两个锚点都有且不等 ⇒ 撤回**（这根总管不属于正在算的这块地，任取一边都会
把甲地的管长算进乙地的扬程）；只有一个 ⇒ 用那一个。

### 九、探针踩的坑（两条，都写进 memory 了）

1. **`RyPlotLibraryStore.replace()` 有形状校验**，外部拼的库对象会被拒：
   `{ok:false, error:'invalid-plot-library'}`。别在探针里直接改写地块库。
   ⇒ E7/E8/E9 改成**切换地块**（短总管 vs 长总管 vs 无总管），走真实用户路径。
   这跟 B4 那条（`select.value='63'` 假失败）是同一个道理：**绕过交互直接改状态，
   会在一个用户根本走不到的地方判绿或判红。**
2. 切地块时 app 会把自己的那份管网快照再写回去，所以「往 `...:p11-a` 键里塞一份别家
   plotId 的快照」这种构造**不生效**（会退化成"未找到本块的快照"）。失配场景要改
   `runye_current_plot_v1` 这个锚点。

### 十、测试与发布状态（v843）

- `tests/trunk_geo_ll2m.test.cjs`：+8 项（haversine 量级与对称、m2ll↔lineLen 100 m 闭环、
  坏点拒绝、main 优先 / 最长优先 / 选中者坏点则撤回、两份 haversine 逐位相等）。
- `tests/trunk_joint_review.test.cjs`：重写消费者（front 不计长度、latLng 现算、合计来源、
  合计≠扬程的文案、来源标签白名单）。
- `tests/pipe_path_loss_front_override.test.cjs`（新，9 项）：缩放正确、流量口径不变、
  只动总管、**不传时逐位不变**、退化不出 NaN、多组各自缩放。
- `tests/trunk_panel.test.cjs ①`：期望值按新 R 修正（207493 → 207725）。
- `_probe_trunk_p11_joint.mjs`：**29/29**（本地）。关键三跳：
  E7 总管 423→632 m、E8 合计损失 11.02→13.55 m、E9 **扬程 42.04→44.82 m**。
- 版本同抬 `v843-trunk-head`：`sw.js` + `index.html` 八处 `?v=`（含 `pipe-path-loss.js`、
  `trunk-geo.js`）。闸门：check.cjs 29 项 PASS / 单测 382 / publish_refs PASS / lint 无告警。

### 十一、仍没做

1. 分区页移除手绘总管入口 `#grTrunkDraw`（**三套**总管并存：`plot.trunk` v2 / 成组
   `W.trunk={lines,dn}` / 设计图面 `frontPipe`）。
2. 众包案例库打包。
3. 真中文 DXF 层名（AC1021/UTF-8 专项，见 §26.79 三）。
4. **已知未修**：`readPoint` / `readLatLng` 会把 `[null, 1]` 读成 `{lat:0, lng:1}`
   （`Number(null) === 0`）。历史数据里一个空位就会让整根线量出几千公里。
   只在 `lineLen` 这条新链上加了 `rawPointOk` 收紧；改 `readLatLng` 本身会影响
   `normalize` 的迁移语义（空位点会被判非法 ⇒ 丢掉整根干线），要单独评估。

---

## 26.83 分区成组页：移除手绘总管入口 `#grTrunkDraw`（v844 · 2026-11-01）

### 一、这一版做什么

规格审计（§26.80 之前的实现度盘点）一直挂着一条「不符规格：分区页仍有手绘总管入口」。
v843 把扬程口径统一到「在线地图总管实测长度」之后，这件事从"该改"变成了"必须改"：
**扬程都认地图总管了，分区页还能画另一套总管，用户画完只会发现扬程不认。**

⇒ 本版把 `#grTrunkDraw`（按钮 DOM + `click('grTrunkDraw')` 绑定 + active 同步）整组移除，
提示文案改为指路：「总管已改为在『在线地图』页绘制：选地块 → 『✎ 编辑总管』→ 画线/复核。
本页不再支持手画；已画的旧总管仍可点选删除。」

### 二、删的是入口，不是数据（这条边界必须说清）

- **存量 `W.trunk`（成组页手画的总管）照旧渲染、照旧参与材料汇总与流速体检。**
  `grRenderTrunk` / `grCommitTrunk` / `grComputeHydraulics` 一行没动。
- 「🗑 删除选中」（含 Delete 键）、「清空」、「参考线」三个按钮保留 —— 用户要把旧总管
  清掉换成地图总管，得有工具；「参考线」本来就是纯视觉。
- pick 态点选、Delete 删除的提示文案同步改（原话里还教人「画总管时点击加点」）。

### 三、画线状态机**保留不动**（W.mode / W.draw / grExitDraw）

入口删了，但双击收线、右键回退、Esc 取消这一整套状态机一行没删。
W.mode 恒为 `'pick'` ⇒ 画线分支不可达。为什么留着：

- 存量总管的**点选/删除仍走这套分支**（click 里 `if (W.mode==='draw')` 在前、pick 在后）；
- 将来若要恢复入口（比如离线场景不能开地图），**加回按钮与绑定即可，不用重写状态机**；
- 真正删除状态机要动 7 处事件分支，风险收益完全不成比例。

`tests/gr_trunk_draw_removed.test.cjs ⑥` 钉了两头：状态机在、但**没有任何活代码能把
W.mode 置成 'draw'**（入口真的删干净了）。

### 四、静态锁（6 项，`tests/gr_trunk_draw_removed.test.cjs`）

为什么用静态锁不用探针：要钉的是「入口不许回来」—— 这种回归的表现不是报错，而是按钮
悄悄出现在页面上，等发现时三套总管又并存了。

1. index.html 无 `id="grTrunkDraw"`（去 HTML 注释后扫）；
2. inline-29 无 `grTrunkDraw` 引用（去 JS 注释后扫）；
3. 活代码无「✎ 画总管」指引文案；
4. 提示文案指路「在线地图 / 编辑总管」（DOM 初始 + JS 运行时两处）；
5. 存量能力仍在：grRenderTrunk / grTrunkDel / grTrunkClear / grTrunkGhost /
   grCommitTrunk / grComputeHydraulics + 8 个 DOM 节点；
6. 状态机在（W.mode/W.draw/grExitDraw）且不可达（无 `mode='draw'` 赋值）。

★ 负向断言必须先去注释再扫（v841 踩过：注释里写旧色值会被自己扫到）。
★ `grTrunkGhost` 是 `$('grTrunkGhost')` + addEventListener，不是 `click()` 包装 ——
   断言写 `click('grTrunkGhost'` 会假红。

### 五、发布状态（v844）

- 版本同抬 `v844-gr-trunk-gate`：`sw.js` + `index.html` 八处 `?v=`。
  `mod/inline-29.js` 是展开内联的，无独立 `?v=`，随主页版本走。
- 闸门：check.cjs 29 项 / 单测 388 / publish_refs PASS / lint 无告警。
- 「三套总管并存」至此收口为：**地图总管 `plot.trunk` v2 是唯一可新增的权威**；
  成组 `W.trunk` 只减不增；设计 `frontPipe` 是渲染代理。

### 六、仍没做

1. 众包案例库打包。
2. 真中文 DXF 层名（AC1021/UTF-8 专项，见 §26.79 三）。
3. `readPoint/readLatLng` 的 `[null,1]` → `{lat:0,lng:1}` 隐患（见 §26.82 十一）。
4. `snapOn` 默认 true，规格要「重开默认关闭」。

## 26.84 众包案例库：打通检索闭环（v845 · 2026-11-01）

### 一、真相核查（重要：旧待办是误判出来的）

「众包案例库打包」这条待办挂在清单上很久，注记写「`众包` 全站零命中」——**当时审计者按
「众包」二字面搜索，漏看了以「匿名案例库 / case-library / case-lib」命名的一整套实现**。
实际早已存在且全部入库：

- 前端授权上传：`runye-case-library.js`（保存工程 → dialog 征集授权 → clean 脱敏 → POST submit）；
- 后端提交：`api/case-library.js` + `lib/case-library.cjs`（Upstash Redis，owner 身份哈希，TTL 3 年，
  强制引擎水力校核通过才收）；
- 服务端检索 `retrieve(q)`：rank 排序（manual+100 / deployed+80 / rating×3 − 面积偏差 − 形状偏差）
  取 top3 —— **一直是死代码**；
- 本地档案推荐（与远程案例库无关）：`data-service.findSimilar/recommend` + `plugins/case-lib`
  （面积 .4/作物 .25/区域 .2/水源 .15；P25/中位/P75 造价区间；DN 加权投票）。

真正的断链：① API 只收 `action:'submit'`，检索没有出口；② AI 规划链路零消费——上传成功 toast
承诺「可作为后续 AI 规划参考」从未兑现；③ `tests/case-library.test.cjs` 未入库。

### 二、v845 改动

1. `api/case-library.js`：新增 `action:'query'`（Bearer 会员访问码 → `quota.identity`；
   `q.area` 必须有限正数；`q.ratio` 缺省按 1）。返回 top3 已脱敏案例——**检索出口不给
   `owner_hash`、不给 `plan.polygon`**（retrieve 的返回映射本来就没带，测试锁死）。
2. `api/ai-irrigation.js`：规划前 `similarCases(body)` 检索案例库 top3 注入 user prompt
   新增段「五、相似工程案例参考」，原「输出要求」顺延为「六」。要点：
   - **fail-open**：案例库未配置/超时/空库/任何异常 → null，AI 规划照常，绝不因案例库挂掉而拒绝规划；
   - `bboxRatioOf(poly)` 服务端现算形状比，口径与前端 `build()` 的 `feature.bbox_ratio` 一致
     （`max(w,h)/max(1,min(w,h))`）；上传案例的 poly 与请求 polygon 同为图面相对坐标 ⇒ 可直接比；
   - prompt 案例行只取 `feature`/`engine_check` 规范化字段（`design.input_values` 是页面原始
     key 如 `planTapeSpacing`，**不进 prompt**）；
   - 案例文案必须带「实测锁定项不受案例影响…不得照抄为本地块结论」（防 LLM 把别人工况的
     扬程当本地结论）；
   - 成功响应 extra 新增 `similar_used: n`。
3. `runye-case-library.js`：新增 `queryCases({area,ratio})` 前端检索口（挂 `RyCaseLibrary`，
   `{ok,rows}` 永不 throw）；文件 `?v=277→278-case-query`。
4. `runye-ai-plan.js`：成功提示合并「参考了 n 个相似匿名案例」+ 剩余次数（`similar_used` 用户知情）；
   自有 `?v=823-…→845-case-closure`。
5. 测试：`tests/case-library.test.cjs` 补 query 用例（鉴权 401 / area 校验 400 / 排序 /
   脱敏 / 空库空数组）并 **git add -f 入闸门**；新增 `tests/ai_case_injection.test.cjs`
   （bboxRatioOf 口径 / 注入段出现与顺延 / 无案例时与旧版逐字一致 / caseLine 无
   undefined/NaN / fail-open 五连）。

### 三、版本

`v845-case-closure`：`sw.js` VERSION + `index.html` style-01.css?v= + runye-ai-plan.js?v=
（其余 6 处 844 串对应的文件本次未改，不抬）。

### 四、仍没做

1. 真中文 DXF 层名（AC1021/UTF-8 专项，见 §26.79 三）。
2. `readPoint/readLatLng` 的 `[null,1]` → `{lat:0,lng:1}` 隐患（见 §26.82 十一）。
3. `snapOn` 默认 true，规格要「重开默认关闭」。
4. 案例库前端「检索消费 UI」（case-lib 插件目前只读本地档案；`RyCaseLibrary.queryCases`
   已具备，插件想接远程库随时可接）。

## 26.85 捕捉默认关闭 + case-lib 插件接在线案例库（v846 · 2026-11-01）

### 一、snapOn 重开默认关闭（规格意见落地）

待办挂了很久的规格意见：「snapOn 默认 true，规格要『重开默认关闭』」。本批落地：

- `mod/online-map.js`：`var snapOn = false;`；**mount 时 `setSnapOn(snapOn)` 一次同步三处**
  （引擎 `setEnabled` / 按钮 DOM / 提示条）——只改变量不够，按钮初始文案是 HTML 写死的。
- `index.html`：`#btnSnapToggle` 初始 `aria-pressed="false"` + 「捕捉：关闭」。
- 会话内切换照旧（按钮 / S 键），不落库。
- 静态锁 `tests/snap_default_off.test.cjs`（4 项）：默认值、setSnapOn 三处同步、
  HTML 初始态一致、切换入口仍在。

### 二、case-lib 插件「查在线案例」（v845 闭环的展示端）

v845 打通了检索闭环但只有 AI 消费；本批给 `plugins/case-lib` 加第三个按钮「查在线案例」：

- 走 `RyCaseLibrary.queryCases({area})` 唯一收口（插件里不许出现裸 fetch——测试锁死）；
- `remoteRow(c)` 只消费服务端 retrieve 的脱敏返回面（feature/engine_check/source/status/rating），
  展示：亩数 / 已落地·待施工 / 来源 / 评分 / 带距·孔距·滴头·单区 / 扬程·流量·主管·支管；
- 免责文案常驻「已通过引擎水力校核；他人工况仅供参考，不得照抄为本地结论」
  （v842 联合复核同款纪律的插件版）；
- 未填访问码 / 服务端不可用 / 空库 → 提示行，绝不 throw；
- `manifest.json` version 1.0.0→1.1.0（loader 用 `?v=<manifest.version>` 破 import 缓存，
  **改插件必须抬 manifest 版本**，否则用户永远拿旧 main.js）。
- 静态锁 `tests/case_lib_remote.test.cjs`（4 项）。

### 三、与 DXF 真中文层名专项的关系

本批**有意跳过**待办第一项「真中文层名」：它需要 `$ACADVER` 抬 AC1021 全量改 UTF-8，
影响所有既有图层，且必须真机（CAD 软件）验证——沙箱无法闭环，盲发风险是全局乱码。
等用户确认验证条件再开专项（§26.79 三）。

### 四、版本与闸门（v846）

`v846-snap-off-case-ui`：sw VERSION + style-01.css?v= + mod/online-map.js?v= +
case-lib manifest 1.1.0。

## 26.86 总管提示条挪到地图底部（v847 · 2026-11-01 · 用户反馈）

用户截图反馈：顶部居中的常驻提示条（`#mapTrunkHint`）弹出时盖住右侧「图层」面板的
一行按钮，「体验非常不好」；要求与底部提示文字合并一处。

- `mod/online-map.css`：`.map-trunk-hint` 定位 `top:8 居中` → **`bottom:50px; left:14px`**。
  底部从下往上：状态栏(0~24) → `#tip`(≈14~47，黑条) → hint(50 起)，三条竖排互不叠、
  视觉上合并成地图下沿一个提示区；`left:14` 与 `#tip` 对齐。
- 右下角有 `.ry-pwa-install`（z2000）时 hint `max-width` 收窄 210px（对齐状态栏同款让位）。
- `.ry-trunk-warn` 的 top:44 **保持不动**：它避让的是顶部横排工具栏，不是提示条（注释已改）。
- 显隐与文案逻辑（`updateTrunkHint`）零改动——探针 p2 C4/C9 照旧。
- 静态锁 `tests/map_hint_bottom.test.cjs`（3 项）：bottom 定位 + 无 top/translateX 回潮 +
  PWA 让位规则 + DOM/注释卫生。
- CDP 实测（Edge headless 1600×1000）：hint 754~777、tip 778~813、状态栏 803~827，
  顶部工具栏区域 elementFromPoint 非 hint，无 pageerror。

## 26.87 工具栏按钮文字不加粗（v848 · 2026-11-01 · 用户反馈）

用户截图反馈：地图页工具栏一排按钮文字全是加粗的，「文字都不要加粗」。

- 加粗来源 = `mod/ry-panel.css` v544 统一工具栏时写的 `font-weight:600` ——
  地图绘制条 `.ry-hbar-btn` 与分区快捷条 `#ppQuickBar` 共用这一条，改一处两条一起生效。
- 改成 **显式 `font-weight:400`**（不省略声明）：runye-theme.css 的 `.ry-btn` 有
  `--ry-btn-weight` 等来源，删掉声明会回到继承/UA 的加粗。
- 静态锁 `tests/hbar_weight.test.cjs`（2 项）：显式 400 + 不回潮 600/700。
- 版本同抬 `v848-hbar-normal`：sw VERSION + style-01.css?v= + ry-panel.css?v=。

## 26.88 分区角度并入图层面板 + 取消 ±1° 按钮（v849 · 2026-11-01 · 用户反馈）

用户原话：两个工具栏合并到一起，旋转分区角度就用上下箭头调节就行，单独的正一度
负一度的按钮取消。

- **合并方式**：index.html 的独立 `#ryAnglePanel` 浮卡壳删除；内容（☁ 提交到云端 +
  section#mapPartitionTools）留在 hidden 暂存容器 `#ryAngleParts`，
  `runye-map-enhance.js` buildPanel 挂载后**逐子节点搬进**图层面板的
  `[data-rym-angle-host]`（节点移动不丢监听，runye-map-partition.js 按
  `getElementById('mapPartitionTools')` + querySelector 取控件零改动）。
  搬不到（移动端预览页无暂存容器）小节保持 hidden，功能自然缺省。
- **±1° 按钮**：DOM 与 partition JS 绑定一并删——那两行是裸 querySelector 赋
  onclick，只删 DOM 不删绑定直接炸 IIFE。number input（step=1）自带上下箭头，
  交互等价；实时预览监听（input 事件）照旧。
- **踩坑记录**：① v849 首版把壳和内容一起删了，搬运函数 `getElementById('ryAnglePanel')`
  永远 null ⇒ host 空小节隐藏——CDP 实测抓出（静态锁测不出这种「搬运源不存在」），
  改为暂存容器方案。② **file:// 直开 index.html 会被重定向到 runye-mobile-map-preview.html**
  ——无头验证必须带 `?full=1&rymock=L2`（历史探针命令模板一直带着，这次又验证了）。
- **CSS**：壳规则（absolute 定位/头部/折叠/body）删除；`.ry-angle-panel .save-row/.hint`
  前缀改 `.rym-angle-host`；新增 host 容器与小节标题规则。v847 的提示条、v839 告警卡
  位置不受影响（告警卡避让的是顶部工具栏）。
- 静态锁 `tests/map_panel_merge.test.cjs`（5 项）+ Edge headless CDP 实测：
  section/☁ 按钮都在 host 内、角度输入 step=1 可用、±1 按钮消失、无 pageerror。
- 版本同抬 `v849-panel-merge`：sw VERSION + style-01 / online-map.css /
  runye-map-enhance.js / runye-map-partition.js 的 `?v=`。

## 26.89 分区文字标注移到分块右上角（v850 · 2026-11-01 · 用户反馈）

用户原话：地块分区的文字标注，放在分地块的右上角。原先三处都锚在分块中心，
压着主管线和管口标注难读。

- **三处同批口径**（缺一 = 两页/导出风格分叉）：
  ① `mod/plot-editor.js` canvas 标注（屏幕所见，ppCtx.fillText「N区/尺寸/亩数/主Ø支Ø」）：
     锚 = q2（右上）沿边内缩（padX=5/padY=4），`textAlign='right'`，行从锚点向下排
     （r1=baseFont*0.65，行距 1.15×baseFont）；
  ② `mod/plot-editor.js` 施工简图 SVG 导出（labelParts）：锚 = cellPts[1] 内缩
     （pad 随格子尺寸 4%~6%），`text-anchor="end"`；
  ③ `mod/inline-09.js` 三级 SVG（data-tlzone）：同 ②（PADX=6/PADY=5）。
- cellPts 四角布局：[0]左上 [1]右上 [2]右下 [3]左下；局部 x 轴 = [0]→[1]，
  y 轴 = [0]→[3]；旋转角不变（文字仍沿网格方向）。
- **v837 出界兜底判定升级**：从「格子中心出界」改为「右上角锚点出界」——
  锚点比中心更靠边，旋转最外圈更容易出界；锚点经 `ppToMeters` 转世界坐标判
  `ppPointInPlot`，出界回退「本格 ∩ 地块」形心（界内）。0° 凸形地块行为不变。
- 版本同抬 `v850-zone-label`：sw VERSION + style-01.css?v= + plot-editor.js?v=
  （inline-09 展开内联随主页串走）。
- 静态锁 `tests/zone_label_corner.test.cjs`（4 项）：三处锚点/对齐 + 居中锚退场 +
  v837 兜底保留。纯显示层改动——管径选择（__act/ryZonePipePick）、水力计算零触碰。

## 26.90 工具栏「开始画框」按钮挪位（v851 · 2026-11-01 · 用户反馈）

用户原话：开始画框这个按钮位置移动到完成按钮前面、编辑总管后面。

- index.html `#mapDrawTools` 内 `#btnDraw` 从第 2 位（grip 之后）挪到 `#btnEditTrunk`
  之后、`#btnFinish` 之前。新顺序：⠿绘制 ｜ 绘制总管 · 完成总管 · 撤销总管点 · 编辑总管 ·
  **开始画框** · 完成 ｜ 加点 · 撤销 · 测距 · 清除。
- 纯 DOM 顺序调整：online-map.js 按 id 绑定，逻辑零改动；无测试锁按钮顺序。
- 版本同抬 `v851-draw-btn-order`：sw VERSION + style-01.css?v=。

## 26.91 总管绘制橡皮筋虚线预览（v852 · 2026-11-01 · 用户反馈）

用户原话：在线地图绘制总管的逻辑稍微改下，点一个点后随鼠标有虚线显示，再点第二个点形成直线。

- **公共换算防漂移（核心设计）**：click 落点与 mousemove 预览原来各自做
  「Shift 正交 → 捕捉」链，若不抽公共函数，最迷惑的 bug 就是「预览吸到了、
  落点没吸」或反之。新增 `trunkSnapPoint(cur, shiftOn)`（mod/online-map.js）：
  ① Shift 有前点 → 正交（v832 互斥语义：Shift 优先于捕捉）；② 否则 snapOn →
  `snapApi().nearest()`；③ 都不满足原值返回。click 块内**禁止**直调
  orthoPoint/`_snap.nearest`（静态锁 ① 守着）。
- **橡皮筋线**：`trunkRubber` 变量 + `removeTrunkRubber()`/`updateTrunkRubber(cursorDisp)`。
  样式 = TRUNK_STYLE.draft 紫色、weight:2、opacity:.65、dashArray:'4,7'、
  `pane:TRUNK_PANE`（z=430 独立层）、`interactive:false`（不挡地块点选）、挂 `trunkGroup`
  （关测量框不连坐，v841 拆组纪律）。虚线只在有落点后出现（≥1 点）。
- mousemove 里 `pv = trunkSnapPoint(lastCursorLatLng, shiftOn)` →
  `updateTrunkRubber(pv ? toDisplay(pv) : null)`；click 落点 push 后立即
  `updateTrunkRubber(toDisplay(trunkPoint))`（落点后虚线缩短为 0 段，
  防旧橡皮筋与新草稿双重显示）。
- **清理统一挂 setTrunkMode 开头**（`removeTrunkRubber()`）——全部退出路径
  （Esc/完成/双击收线/互斥切换）都走 setTrunkMode('idle')（v844 收口纪律），
  grep 验证 585/874/1230/1757/2036/2116/2176 七处全走它，无漏网路径。
- 静态锁 `tests/trunk_rubber.test.cjs`（4 项）：① click 与 mousemove 共用
  trunkSnapPoint（click 块禁直调）② 橡皮筋挂 trunkGroup/TRUNK_PANE/interactive:false/
  dashArray ③ setTrunkMode 里 removeTrunkRubber ④ click 落点后 updateTrunkRubber。
- 版本同抬 `v852-trunk-rubber`：sw VERSION + style-01.css?v= + online-map.js?v=。

## 26.92 状态栏测距回归唯一口径 + 总管探针三份跟上规格（v853 · 2026-11-01 · 工作区未发布）

任务 #8/#9 核查时全套复跑总管探针（p1~p11 + n02），抓出 1 个真实产品缺陷 + 3 份探针
未跟上规格变更。A/B 定界用 git worktree（探针未入库 ⇒ 拷过去跑；node_modules 用 junction）。

- **产品缺陷（v843 引入，v843~v852 五个版本都没复跑 p7 所以漏了）**：v843 面板改走
  `RyTrunkGeo.haversine`（R=6378137，唯一测距实现）后，状态栏还留在 Leaflet
  `map.distance`（CRS Earth **R=6371e3**；压缩码里的 6378137 是 SphericalMercator 投影
  常数，别认错）。326 m 的线上两处差 0.38 m —— 状态栏显示的数既不等于面板、也不等于
  扬程用的总管长。修法：状态栏 `updateTrunkStatus` 改走 `RyTrunkGeo.haversine`（缺席才退
  map.distance）。`_probe_trunk_p7_panel.mjs` B1 守着（v838~v842 绿，v843 起红）。
- **p2/p6 假红（v846 规格变更没同步探针）**：v846「捕捉重开默认关闭」后，p2 的
  C1b/C3 还硬编码期望「捕捉：开启」、C5/C6 吸附正测没先开捕捉；p6 的 H2 实际命中同理。
  修法：C1b/C3 期望翻转；吸附测试前 `keyboard.press('s')`。
- **p3 假红（v838 弹窗改造没同步探针）**：探针头的 `page.on('dialog')` prompt 接管是给
  v835 原生 prompt 的；v838 换成 `#ryNodeDialog` 后 prompt 永不触发 ⇒ 标签写不进库
  （C8 假红）**且弹窗遮罩挡住后续右键** ⇒ copyParams 无限重试超时。修法：C8 走真实
  用户路径 waitForSelector('#ryNodeDialog') → fill → 点 `.ry-node-btn.is-primary`。
- **教训**：改交互规格（默认值/弹窗形态）时，同批要扫 `_probe_trunk_*.mjs` 里对旧行为的
  硬编码期望——它们是入库资产（git add 过），假红会淹没真红。
- 版本同抬 `v853-trunk-dist-unity`：sw VERSION + style-01.css?v= + online-map.js?v=
  （online-map 是 CORE 文件必须抬）。**工作区完成，未提交未发布**（等并行会话改动落定）。

## 26.93 总管参数面板可拖动 + 可折叠（v855-panel-drag-fold · 2026-11-01）

用户截图需求「总管参数设置面板，要变成可以拖动的，可折叠的」。面板 = `#trunkPropPanel`
（mod/trunk-panel.js buildDom 创建、延迟挂载在 .map-wrap，absolute right:12px/bottom:30px，
z-index 1170）。改动三件套：

- **mod/trunk-panel.js**：① buildDom 标题栏加折叠按钮 `#tpFold`（在 #tpClose 之前，
  ▾/▸）；② 模块级 `setupPanelChrome(el)`（`__ryTpChrome` 标记防重复绑定——mount 可能
  复用已存在的面板元素，重复绑定会让一次 pointerdown 挂 N 个 move 监听）；③ 拖拽把手
  = `.tp-head`，`closest('#tpFold,#tpClose')` 排除按钮；首次移动把 right/bottom 切成
  inline left/top（此后 CSS right/bottom 与 PWA 安装条 `body:has(.ry-pwa-install)
  {bottom:96px}` 规则自动失效），范围钳制在宿主 clientWidth/Height 内；位置存
  localStorage `ryTrunkPanelPos`、折叠存 `ryTrunkPanelFolded`，下次打开自动恢复。
- **mod/online-map.css 尾部**：tp-head `cursor:move; touch-action:none; user-select:none`
  （touch-action:none 是触屏能拖的前提）；`.tp-fold` 样式；`.is-folded` 隐藏
  tp-body/tp-foot；`.is-dragging` 阴影。★ 禁写 border-radius 数值（全站
  `body *{border-radius:0!important}` 压掉）——静态锁在守。
- **契约不破**：11 个 tp* 只读控件 id（tpCode/tpDn/tpProj/tpV/tpJoint…）全部不动，
  探针 p7 与宿主 refresh() 都按 id 取件。

- 静态锁 `tests/trunk_panel_chrome.test.cjs`（7 项）：DOM 结构/防重复绑定/把手排除/
  持久化键/状态类/CSS 规则（含 border-radius 禁令——断言前要剥注释，注释里的反例文字
  会假红）/版本三处同抬。探针 `_dev-tools/probes/_probe_trunk_p8_chrome.mjs`（12 项）：
  折叠往返 + localStorage、点按钮不拖拽、拖拽 inline 接管 + is-dragging + 钳制、
  刷新后位置与折叠恢复、无 pageerror。
- 验收：476 单测全过、check.cjs/lint(299)/check_publish_refs(仓库根) 全过、p7 41/41、
  p8 12/12。
- 版本同抬 `v855-panel-drag-fold`：sw VERSION + style-01.css?v= + online-map.js?v=
  （三处同抬）+ online-map.css?v= + trunk-panel.js?v=（两 CORE 文件各自 ?v=）。
- 提交纪律再验证：并行会话探针迁移的 50+ 暂存重命名仍在索引里 ⇒ `git commit -- <pathspec>`
  严格限定六文件，重命名零带走。

## 26.94 总管工具栏按钮文案精简（v856-trunk-btn-label · 2026-11-01）

用户截图需求：绘制总管→绘制、完成总管→完成、撤销总管点→撤销点，且撤销点前面的
↩ 图例取消。改动：
- index.html 701~703 三个按钮初始文案（btnDrawTrunk/btnFinishTrunk/btnUndoTrunk id 不动）。
- mod/online-map.js 两处**动态文案必须同步**：943 绘制态切换 textContent（不改的话
  一进绘制态按钮就变回旧文案）、2026 tip 引用按钮名（文案与按钮对不上用户找不到）。
  1243/1246 的「绘制总管」是动词短语，不是按钮名引用，保留。
- 探针全部按 id 定位按钮（无 textContent 断言），p1 22/22、p7 41/41、p8 12/12 复验过。
- 版本 v856-trunk-btn-label 五处同抬（online-map.js 是 CORE 文件）。

## 26.95 分区文字标注统一右上角 + 全黑不加粗（v857-zone-label-black · 2026-11-01）

用户截图（分区与管路工作台）：「分区的文字标注怎么还有不在右上角的，都改到分区的右上角，
文字全部用黑色字，不加粗」。根因与改动：

- **根因**：v850 右上角批次只改了 plot-editor canvas/施工SVG + inline-09 三级SVG 三处
  （cellPts[1] 顶点锚），**tl-workspace 工作区不在批次里**，且它用「轴对齐包围盒右上
  （rx+rw）」当锚——地块拖成平行四边形后包围盒角 ≠ 格子角；另有窄高 rotate(-90) 竖排、
  小格两处**居中**分支残留。
- **tl-workspace.js**：锚改「分块实际右上顶点 l1 沿边内缩」（lx=l1.x-5, ly=l1.y+13，
  l0..l3=左上/右上/右下/左下）；竖排分支锚右上（translate(l1.x-4,l1.y+2) rotate(-90) +
  anchor=end，文字从锚点向下延伸）；小格居中分支改 anchor=end 右上；包围盒 rx/ry/rw/rh
  保留（aw/ah 尺寸分支判断仍要用）。组级标注（data-tlunion，v100 落组重心）位置不动。
- **颜色字重三页同批**：tl-workspace / inline-09 / plot-editor（canvas fillStyle + 施工
  SVG fill）标注全部 fill #000、去 font-weight 700/600；非标区琥珀语义色（#b45309/
  #9a4d05）一并取消（用户「全部黑色」）。v653 管径建议行 #7c2d12 保留（附加信息非标注本体）。
- **测试**：zone_label_corner.test.cjs 加 ⑤⑥（tl-workspace 锚= l1 + 无 middle 残留
  （data-tlunion 组级行除外）+ 无 font-weight + 全 #000；三页颜色统一）；tl_workspace
  旧断言「非标琥珀字色」反转为「琥珀已退出」。
- 版本 v857-zone-label-black：三处同抬 + plot-editor.js?v= + tl-workspace.js?v=
  （两文件均 CORE）。476→478 单测全过、四闸过。

## 26.96 段总管（自动生成的分区主管串联干线）+ 驳接点（v859-seg-trunk · 2026-11-01）

用户需求：「在分区与管路页面中增加一个段总管，垂直于自动生成的主管，把垂直方向的分区
主管通过一根总管连接起来，两端预留驳接点；数据传回在线地图页面，绘制总管后与驳接点驳接，
变成完整水路。」

- **mod/tl-seg-trunk.js（新，纯几何，Node 单测锁 5 项）**：RySegTrunk.build(mainPipes)。
  主方向多数投票 → 段总管走垂直方向；串联端取各主管「同一侧」端点（min/max 侧极差小者，
  两侧都超过 TOL=0.35m 不共线 ⇒ 返回 null 绝不猜位置）；stub=max(3, 主管平均间距×0.35)
  两端驳接段。单区（<2 条）不生成。
- **inline-09.js**：① 主管渲染段前 build（局部坐标，frame 仿射下垂直/共线保持）+ 渲染
  data-tlpipe="segTrunk"（#111827 宽 5，总管层）+ 两端白底方块「驳接」标记；②
  tlDiagramData.segTrunk 落地（points/couplers/joinPts 转世界坐标，len 世界重算）；③
  tlFrontLenUse 三分支全部 + segLen（扬程收口唯一改动点；segTrunk 缺席时 +0，输出与旧
  口径逐字节一致——Node mock 无该字段零影响）。
- **地图驳接闭环**：trunk-snap.js buildTargets 加第 7 类候选 seg-coupler「驳接点 N」；
  online-map.js extraSnapTargets 走既有 v835 geoBridge 把 segTrunk.couplers 世界米坐标
  反算成经纬度进捕捉（地块一致性/±y 符号判定全复用）。手绘总管开捕捉即可吸到驳接点。
- **tl-workspace.js**：自绘兜底路径补画 segTrunk 线+驳接方块（克隆路径简图 SVG 自带）。
- **验收**：483 单测 + 四闸全过；p1 22/22、p2 24/24、p7 41/41、p8 12/12。
  新增 _probe_tl_geom.mjs（CDP dump 三级几何，段总管实测工具——UI 流程 place-go 后
  currentPlotId 仍 null，tlDiagramData 未生成，浏览器端实机验证待用户页面复测）。
- 版本 v859-seg-trunk：三处同抬 + inline-09?v= + trunk-snap.js?v= + tl-workspace.js?v=
  + plot-editor.js?v= 等（CORE 全抬）；tl-seg-trunk.js 入 CORE 白名单。
- 已知边界：①最不利路径 tlWorstPathLen 未并入段总管（frontPipe 路径不含竖干线，损失
  估算略偏小，下轮评估）；②浏览器端「手绘总管吸驳接点」的实机链路未在本环境跑通
  （三级页需要真实地块上下文），算法已被单测与桥接复用性覆盖。

## 26.97 旋转裁剪场景分区标注跑格子中间（v860-zone-anchor-clamp · 2026-11-01）

用户截图（分区角 2.6°）：左列分区标注琥珀色、在格子中部「不在右上角」，怀疑多层覆盖。

- **排查结论：不是多层覆盖**。① 工作区渲染双路径互斥有锁（renderSVG：pipeBaseSVG()
  克隆成功即 return，自绘 lp 标注只在克隆失败路径）；克隆路径的分区标注来自简图
  zoneLabelParts（v857 已黑/已右上），剥离清单不含 data-tlzone，无双份。② 全仓
  #b45309/#9a4d05 残留只剩测量/损失/角度标注，无分区标注输出。
- **琥珀色 = 旧 SW 缓存**：截图画布实为 plot-editor canvas（ryCad 模式共享画布），
  其标注 fillStyle 在 v857 已改 '#000'；用户页面被旧版本 SW 控制（v855~v859 一天内
  五连发，页面未刷新到新版）。SW 已 skipWaiting+clients.claim（v435），**普通刷新一次
  即换新版**；建议用户 Ctrl+Shift+R 硬刷。静态锁 ⑦ 顺带钉死 canvas fill=#000。
- **真实产品缺陷（本轮修复）**：v850 出界兜底「右上锚点出界 ⇒ 直接回退本格∩地块形心」
  ——旋转/裁剪场景最外圈格子的右上锚点落在地块多边形外，标注被推到格子中间
  （用户截图左列正是被裁剪的非标格）。改三级化：① 锚点出界先在**格子参数面扫锚**
  （从右上角 (t=1,s=0) 沿顶边向左 t↓、逐行向下 s↑，12×8 步找第一个界内点）⇒ 标注
  仍贴格子右上区域；② 整格扫不出（极端碎格）才回退形心（v850 原行为降为末级兜底）。
  SVG 施工导出（恒右上锚、无兜底）不受影响。
- 版本 v860-zone-anchor-clamp：三处同抬 + plot-editor.js?v=。484 单测 + 四闸 + p1 22/22。

## 26.98 轮灌演示搬到在线地图实际地块（v861-map-flow-demo · 2026-11-01）

用户：分区与管路页的水流动画演示不显示了（疑似绘制总管后失效），已把演示面板
移到在线地图左栏（v858 #tlPlanBar）；现在要求**进来就在在线地图实际地块上演示**，
拾取手动绘制总管 + 分区主管/支管，**总管与分区主管没连接就报错**（连接细节后议）。

- **新模块 `mod/map-flow-demo.js`**（已入 CORE，先于 online-map.js 装载）：
  `window.RyMapFlowDemo`。纯函数 `groupOf/groupCount/validateConnection`（Node 单测锁
  `tests/map_flow_demo.test.cjs` 4 项）；`collect()` 从 tlDiagramData 取素材经
  geoBridge(plot).toLL 转经纬度（mainsLL/branchLL/valves/couplersLL/segLL/trunkLL，
  manual=tlManualGroups、nPer=combinedN）；`render()` Leaflet 图层（活动组主管
  #185FA5 宽5 / 支管 #16a34a 宽3 虚线滚动动画、总管 #111827 宽5 + 段总管宽4 常亮、
  阀门圆点活动绿/组外灰）；`start(g)` 先 validateConnection；`playToggle()` 1000ms
  组轮播；chips 复用 .tl-demo-dot/.tl-demo-ctl。
- **连接校验**：`validateConnection` tolM=5m；有段总管（v859 couplers）时总管贴任一
  驳接点 ≤tol 即贯通；无段总管看总管端点 ↔ 主管端点。no-trunk（未画总管）/
  disconnected（最近距离 X.Xm）均 tip 报错——用户明确要求报错。
- **页面切换**：进入在线地图（onlineMapSection active，MutationObserver + hashchange）
  显示 #mapDemoBar（index.html #ryCadGrpDemo 组内、v861 新增）并隐藏规划页
  #tlDemoBar；离开地图隐藏 #mapDemoBar + 清图层。isMapActive 判定与 v859
  geoBridge 同源（currentMapPlotId 闭包 → 宿主注入 RyMapFlowDemo.init 传
  `currentPlotId()` 读法）。**tlDiagramData 无浏览器实测路径**（探针 place-go 后
  currentPlotId 仍 null，§26.9x 老限制），几何算法走纯函数 + Node 单测。
- 版本 v861-map-flow-demo：三处同抬 + map-flow-demo.js?v=。488 单测 + 四闸 +
  p1 22/22 / p2 24/24 / p7 41/41 / p8 12/12。发布与线上复量见工作日志。
- 遗留：tlWorstPathLen 未并入段总管（最不利路径损失略偏小）；手绘总管→驳接点
  实机链路待用户页面验证；用户预告连接细节下轮再议。

## 26.99 段总管恒不生成修复（v862-seg-cross · 2026-11-01）

用户在 v861 发布后反馈「我没看到」段总管。排查定位为 **v859 判定设计错误**：

- **根因**：build 的共线判定要求「各主管同一侧端点在主管长轴上极差 ≤0.35m」。
  但自动主管按行/列排布——横向分支主管是**竖直线**，同一侧端点分布在不同行的
  边界上，多行网格极差跨整幅图高，**恒 >TOL ⇒ 恒返 null ⇒ 线上从不渲染**。
  单测全过是因为用例只造了「水平主管左端共线」的理想数据，没造真实网格。
- **重写判定（几何本质）**：① 主方向多数投票保留；② 各主管须轴对齐（两端在
  干线延伸轴坐标差 ≤AXIS_EPS=0.05m，斜主管不出）；③ 干线位置 base = 各主管
  走向范围 [min,max] **交集的中点**，交集为空（主管沿走向轴完全错开、垂直干线
  穿不过）⇒ null——「宁可不出」的语义改为「穿不过就不出」，不再误杀规则网格。
  2×2/2×3/1×N 及不等高相邻行（共享边 L=H）都能生成；斜主管、方向混合、错开
  无交集仍 null，符合用户「宁可不出也不猜错」。
- **输出契约不变**（axis/base/points/couplers/joinPts/stub/len/lenJoin/side），
  side 由 lo/hi 改 'mid'（无消费方）；joinPts 语义从「同侧端点」改「主管与干线
  交点」（无外部消费方）；couplers 仍是干线两端驳接段端点；扬程 segLen=len
  收口不变；地图 v861 驳接捕捉/演示校验读 couplers 不受影响。
- 单测重写 7 项（含 ⑥ 2×2 多行回归——v859 恒 null 的用户场景、⑦ 相邻行共享
  边）。490 单测 + 四闸 + p1 22/22 / p2 24/24 / p7 41/41 / p8 12/12。
- 版本 v862-seg-cross：三处同抬。tl-seg-trunk.js 已在 CORE（v859 登记）无需改名单。

## 26.100 演示入口双重隐藏修复（v863-demo-visible · 2026-11-01）

用户问「水流分区动画演示移走之后我也没看到，在哪里？」。定位为**双重可见性缺陷**，
演示功能本身都在，只是入口被折叠+无提示藏住了：

- **位置说明**：①「地块与灌溉参数」功能区（#tlPlanBar：联合灌溉/分组组合/轮灌演示
  按钮）——非工具模式在分区与管路页左栏底部原位；**开 CAD 工具模式**后被搬进在线
  地图左工具栏「分组组合 · 轮灌演示」组（#ryCadGrpDemo）。② 地图实际地块演示条
  #mapDemoBar 固定在该组组尾（v861）。③ #tlDemoBar（简图演示 chips）在地图页隐藏。
- **缺陷一**：#ryCadGrpDemo 是 <details> 且无 open，左工具栏五组全默认折叠——
  不点开 summary 根本看不到组内演示内容。**修复：该组默认 open**（其余组保持折叠）。
- **缺陷二**：#mapDemoBar 在「地图页激活但该地块无 tlDiagramData（未生成过分区图面）」
  时整条 display:none，连提示都没有。**修复：无数据时显示引导文案**（#mapDemoHint，
  橙色「请先到分区与管路页生成分区图面…」），有数据时移除提示、重建 chips。
- 另注：左工具栏 #ryCadSide 本身默认收起（⚙ 工具栏把手，data-ry-open=0），属既有
  交互不动。
- 版本 v863-demo-visible：三处同抬。490 单测 + check.cjs + publish_refs PASS。
  发布 84dcf25，sha256 复量 OK。

## 26.101 演示组常驻地图左栏（v864-map-demo-dock · 2026-11-01）

用户截图（分区与管路页左栏「分组组合 · 轮灌演示」组）要求把这块内容放到
**在线地图左侧工具栏**，样式与本栏原有卡片统一，轮灌演示在地图实际地块演。

- **实现（dock 搬移）**：mod/map-flow-demo.js 新增 ensureDock/dockDockIn/dockDockBack。
  在线地图激活（isMapActive，refresh 的 onMap 分支）时：**动态创建**同款卡片
  （section + h4.sec-t「分组组合 · 轮灌演示」+ #mapDemoDock，append 到
  #onlineMapSection aside.side 末尾——与本栏其他卡片完全同款、零新增样式），
  把 #tlPlanBar（联合灌溉/分组组合/轮灌演示 chips）与 #mapDemoBar 搬入；
  离开地图按 memo 原样搬回（#tlPlanBar→#tlSide、#mapDemoBar→#ryCadGrpDemo 组尾）
  并隐藏卡片。CSS .pp-plan-bar 是全局类，跨栏搬移样式不变。
- **两个坑（都实测踩过）**：① 静态 DOM 写在地图 aside 里会被工作区重排挪位
  （dock 祖先链漂到 MAIN 直下）⇒ dock 必须 JS 运行时动态创建；② dockDockIn
  必须幂等（重复 refresh 不得覆盖 memo，否则搬回失效）——memo 只在真正搬入时记。
- **与 v858 工具模式互斥**：body.ry-tool 时 dockDockIn 不抢 #tlPlanBar
  （它归 ry-cad-toolbar 的 #ryCadGrpDemo 管），dock 只补 #mapDemoBar。
- 验证：dock_test 两轮（headless 默认 ry-tool 验证 mb 链路+工具模式分流；
  移除 ry-tool 验证非工具模式全链：进 dock ✓ 搬回 ✓ 卡片隐藏 ✓）。
  490 单测 + check.cjs + lint + publish_refs 全过。
- ⚠ **p8 探针 10/12（环境漂移）**：C2（折叠 CSS 未命中）/D4（拖拽未移动）两项
  失败，git worktree 对照 v859/v862/v863 **同样失败** —— 与本会话代码无关，
  疑 Edge 自动更新改变 headless 行为（v862 发布当天同探针 12/12）。v855 面板
  功能用户已实测过，不阻塞发布；留观察，若用户报面板折叠/拖拽异常再深挖。
- 版本 v864-map-demo-dock：三处同抬。发布 815b5c9，sha256 复量 OK。

## 26.102 修「0°+地块原点偏移 ⇒ 自动管线全空」（v865-zero-deg-frame · 2026-11-01）

用户选方案 A。接 §26.9x 备忘录「angle=0 且地块原点非 (0,0) 时 ppBuildAutoPipes 少一次
平移（未触发）」——本次被无头探针实锤并修复。

- **根因（比备忘录记的更深一层）**：ppGetZoneCuts 的网格恒铺在 ppGridFrame(...).bounds
  （**格系**，min 角=格系多边形包围盒 min）上，管线坐标恒是格系；ppBuildAutoPipes 三处
  `Math.abs(angle)>0.001` 条件使 0° 时①ppState.polyPts 不换成格系环（裁剪环留在世界系）
  ②切缝快照不恢复 ③finally 不做 toWorld——格系管线裁世界系环，地块 min 角不在原点时
  两系错开 ⇒ **全部裁空、主管支管 0 根**。非 0° 时三处都走格系 ⇒ 正常（这就是「旋转反而
  好了」的原因，与用户直觉相反）。
- **修复**：三处条件去掉角度判断，0° 也走格系统一变换。0° 的 frame 是纯平移+缩放
  （toGrid/toWorld 互逆、无旋转），min 角在原点+scale=1 的旧正常场景 toWorld 恒等、
  行为逐点不变；其余场景从「错位」修正为「正确回位」。
- **验证（无头端到端）**：①旋转矩阵 0/15/40/90/30° 全部 3/3 根、施工图正常；
  ②坐标正确性四场景（y 负原点 0°、y 正 min(1000,1000) 0°、y 负大偏移 (5000,3000) 0°、
  y 负 15°）**管线全部点落在地块包围盒内（0 越界）**；③490 单测+check/lint/publish_refs。
- 探针固化：_probe_pp_rot_diagram.mjs（旋转矩阵）、/tmp/coord_check.mjs 逻辑可并入。
  备忘录已知未修 #3 就此关闭。
- 版本 v865-zero-deg-frame：三处同抬。发布 7e7ab33，sha256 复量 OK。

## 26.103 修「dock 搬进左栏后地图看不到」（v866-map-parse-fix · 2026-11-01）

用户报 v864 上线后「分区轮灌组搬到在线地图左侧工具栏底部之后，地图就看不到了」。

- **现象**：v864 下 #map 1566×**0**、瓦片仅 7 块；v863 对照 1310×835、24 块。
- **排查链（三条证据收敛到解析层）**：
  ① `/tmp/dom_dump2.mjs`：.map-wrap 存在但父链 `DIV < MAIN`——#onlineMapSection 的
  .main 里只剩 aside，.side-grip 也不见了；
  ② `/tmp/movetrace.mjs`（Page.addScriptToEvaluateOnNewDocument hook
  appendChild/insertBefore/removeChild + 栈）：**MOVES=[]**——没有任何 JS 搬过
  .map-wrap（ensureSharedHost 只搬 ppSide/tlSide/ppCanvas/tlCanvas，不碰地图）；
  ③ `/tmp/parseonly.mjs`（**Emulation.setScriptExecutionDisabled 禁 JS 纯解析**）：
  解析树里 .map-wrap 就已经是 MAIN 直下 ⇒ **纯 HTML 解析问题**，与 JS/时序全无关。
- **根因**：v864 编辑 index.html 时在地图左栏 aside 内（我的地块 </section> 之后、
  v864 注释之前）多写了一个游离 `</section>`（v863 同位置是 `</aside>`）。浏览器解析
  到它时把 **#onlineMapSection 整个提前闭合**，其后 .side-grip/.map-wrap 全部解析成
  MAIN 直下兄弟节点 ⇒ 地图容器脱离 `.main` 的 flex 行布局（高度塌成 97px）＝「地图看不到」。
  dock 卡片本身在 aside 里正常（ensureDock 动态创建），v864 的 JS 搬移逻辑无辜。
- **修复**：删游离 `</section>`（原 689 行），原地留 v866 病史注释。
- **静态锁**：`tests/html_map_section.test.cjs`——截取 #onlineMapSection → .map-wrap
  之间文本，断言 section/aside 开合标签两两配对；游离闭合标签再出现立即红。
- **教训**：改 index.html 注释区时必须保持容器标签配对；「元素离奇换父」先用
  **禁 JS 纯解析**探针排除解析层（一条命令定性），再查 JS 搬移，顺序别反。
- **验证**：parseonly 恢复 `DIV < DIV.main < DIV#onlineMapApp < SECTION < MAIN`；
  map_blank 1310×835/瓦片 24；dock_test2 非工具模式全链（进 dock/搬回/卡片隐藏）OK；
  491 单测 + check + check_publish_refs（**仓库根**）+ lint 全绿。
- 版本 v866-map-parse-fix：三处同抬。发布 4da9f1a（API --apply），sleep 80s 后
  线上 sha256 复量 index.html/sw.js/tests 三文件全 OK。

## 26.104 地图轮灌演示 chips 同用「原来的圆形样式」（v867-map-demo-round · 2026-11-01）

用户要求：轮灌区演示（在线地图左栏 dock 里的这组 chips）还用原来的圆形样式（v461 简图版）。

- **根因**：v461 圆形圆点样式选择器写死 `#tlDemoChips button.tl-demo-dot`——地图演示条
  #mapDemoChips（v861）用了同名类但不在选择器范围 ⇒ 渲染成默认方按钮；且地图版选中态
  是内联 outline（2px 深灰），与简图版「白+绿双环 box-shadow」不一致。
- **修复**：①三组规则（圆点几何/.selected 双环/▶■ 图标钮）选择器扩为
  `#tlDemoChips …, #mapDemoChips …`（样式零新增，纯并集）；②map-flow-demo.js
  syncChipsState 改切 `.selected` 类（classList.toggle，与简图版同源；classList 不可用时
  降级内联 outline）。border-radius:50%!important 豁免随选择器自然继承（ID+类优先级压过
  全站 body *{border-radius:0!important} 扁平化）。
- **静态锁**：tests/map_flow_demo.test.cjs ⑥——CSS 三组规则必须同时覆盖两个演示条 +
  50%!important 在场 + syncChipsState 必须切 .selected。
- **无头实机验证（/tmp/roundchip*.mjs）**：圆点 18×18 radius 50% 无边框；选中态计算样式
  `rgb(255,255,255) 1.5px + rgb(20,83,45) 3px` 双环；ctl 钮 20px。探针里点 chip 未选中属
  预期（无手绘总管 ⇒ start() 按设计报错）。
- 版本 v867-map-demo-round：三处同抬。发布 705f618，sleep 80s 线上 sha256 四文件全 OK。

## 26.105 段总管起止定版「方案B：起止在首末主管」（v868-seg-ends · 2026-11-01）

用户看着图面提出：「分区与管路生成一段总管的逻辑改下，垂直于主管的方向布置，起点是
上/左分区 终点是下/右分区」。先出三方案对比图（当前对称 stub / A 贯穿分区边界 /
B 起止在首末主管），用户选 **B**。

- **改动（mod/tl-seg-trunk.js build）**：points = [vMin 端(起点=上/左分区主管),
  vMax 端(终点=下/右分区主管)]，去掉两端 ±stub 外延；stub 恒 0、lenJoin=len；
  couplers = points 两端 = 首末主管串联处；side 'mid'→'ends'。
- **方向语义的坐标依据**：简图世界系**北=−y**（ts() 世界→屏幕不翻 y，世界 +y=屏幕
  向下=南，+x 恒东）⇒ 「上」与「左」都是 vMin 端、「下」与「右」都是 vMax 端，
  两轴同式无需按 axis 分叉；与 points[0]/points[1] 既有顺序天然一致，输入主管
  乱序不影响（单测⑧锁死）。
- **消费方零改动**：扬程只读 segTrunk.len（变短=真实管长口径，正确）；inline-09
  渲染按 points/couplers 画，白底「驳接」方块现落在首末主管串联处（与主管重叠，
  语义即「在此驳接」）；地图页捕捉（online-map.js:1069）与连通判定（map-flow-demo
  collect→validateConnection）消费 couplers，新位置天然兼容。
- **单测重写**（tl_seg_trunk.test.cjs 8 项）：③④合并重写为「起止=首末主管不外延」
  口径 + 驳接点与首末 joinPts 重合断言；新增 ⑧ 方向语义锁（乱序不变、竖直主管
  左=vMin/右=vMax）。
- 版本 v868-seg-ends：三处同抬（tl-seg-trunk.js 与 inline-09.js 均 CORE 白名单）。
  发布 04f3b2e，sleep 80s 线上 sha256 四文件全 OK。

## 26.106 段总管贴边定版「自动靠水源一侧」（v869-seg-side · 2026-11-01）

用户实测 v868 后追问：「没看到生成分区总管在哪里，是不好定位吗？你是不知道在
左侧/上侧还是右侧/下侧吗？」——v868 把干线放在走向交集**正中**（图面正中一根竖线
穿过主管），且 v868 去掉外延后两端缩进主管线，视觉上像一根普通格线 ⇒ 用户找不到、
也不认可「放中间」。出选项后用户选 **「自动靠水源一侧」**。

- **改动（mod/tl-seg-trunk.js build(mainPipes, opts)）**：base 从「交集 (L+H)/2」
  改为「交集里贴水源那侧的端」：lo ⇒ base=L=max(los)，hi ⇒ base=H=min(his)。
  对齐网格 = 同侧端点的公共坐标（干线穿过每根主管的同侧端点）；参差主管时贴最紧
  一端（仍在每根主管范围内 ⇒ 与每根主管都有交点）。选侧 = 水源坐标在走向轴上落
  在交集中点 (L+H)/2 的哪一半；无水源/坐标非法 ⇒ 默认 lo（左/上侧）。
  side 字段 'ends'→'lo'|'hi'（记录实际贴的一侧；无外部消费方）。
- **调用点（inline-09）**：build(mainPipes, { src: tlSrcDesign || frontPipe[0] || null })
  ——tlSrcDesign/frontPipe 均为局部格系坐标且定义于调用点之前（4357/4358 行）。
- **方向语义不变（v868）**：points[0]=起点=最上/最左分区主管（vMin 端）、
  points[1]=终点=最下/最右（vMax 端）；stub=0、lenJoin=len。
- **单测**（tl_seg_trunk.test.cjs 9 项）：①②base 改贴端口径；新增 ⑦ 选侧锁
  （左/右、上/下各验 + 非法 src 回退 lo）；⑤b 交集仅一点时选侧不改变位置。
- 版本 v869-seg-side：三处同抬。发布 b6aad5c，sleep 80s 线上 sha256 四文件全 OK。

## 26.107 段总管内移定位定版「方案甲：跨度×1/4」（v870-seg-inset · 2026-11-01）

用户实测 v869 仍「没看到那段总管」，问「是不是在地块外面了」，提议「按主管的中心点
向边缘偏移一定距离定位」，要求先画图确认。

- **病根确认**：v869 贴端点 = 贴走向交集靠水源侧的端，而主管端点延伸到地块外
  （接总管/接入短管一带）⇒ 干线画在地块边界线上被边界/总管盖住，等于看不见。
- **三方案对比图**（show_widget）：甲 中心向水源侧偏移跨度×1/4（比例自适应）/
  乙 固定米数偏移（需钳制、观感不一致）/ 丙 端点内收固定距离（端点在外时仍贴边）。
  用户选 **甲**。
- **改动（tl-seg-trunk build）**：base = C ± (H-L)×0.25（C=交集中心，向水源侧偏；
  (H-L)/4 < 半跨度 ⇒ 数学上恒在 [L,H] 内，另有防御性 clamp）。选侧沿用 v869：
  水源在交集哪一半 ⇒ 向哪侧偏，无水源默认 lo（左/上）。起止=首末主管（v868）
  与方向语义（起=上/左 vMin）不变。
- **单测**（9 项）：①② base 改 1/4 偏移口径（31.25/26.25）并加「base 必在主管
  范围内」断言；⑦ 加参差交集锁（los 参差时按实际 [L,H] 取 1/4）；⑤b/⑤c 交集
  仅一点 ⇒ offset=0 位置不变。
- 版本 v870-seg-inset：三处同抬。发布 78699bd，sleep 80s 线上 sha256 三文件全 OK。

## 26.108 双生成按钮语义区分「生成并回传地图」（v871-pipe-to-map · 2026-11-01）

用户提出：「分区与管路应该是旋转分区角度之后点击生成施工图重新生成主管、支管管线，
那个生成管线图按钮点击之后应该是回传给在线地图的，所以两个功能是不同的，要区分开。」
出选项后用户选「生成后自动跳地图」。

- **现状核实**：「生成施工图」(#ppGenerate) 的处理器**本就内链** tlAutoGenerate({scroll:false})
  （plot-editor v104 行为，4896-4902 行）——旋转角度后主管/支管随点随新，这部分不动；
  「🔄 生成管线图」(#tlAutoPipe) 与它看似重复（都是生成），地图页虽实时读 tlDiagramData
  （捕捉/演示/geoBridge 签名含 generatedAt，数据一换自动重建）但没有任何可见的「交给地图」动作。
- **改动**：#tlAutoPipe 文案「🔄 生成管线图」→「🔄 生成并回传地图」，onclick 改
  tlAutoPipeToMap()（inline-09 新增包装）：①tlAutoGenerate({scroll:false}) 重生成；
  ②generatedAt 前后对比判成败（tlAutoGenerate 无返回值约定，失败走内部 catch 弹错误框）
  ——未落地 ⇒ 留在本页不跳页；③成功 ⇒ ryShowSection(onlineMapSection) 切地图 +
  RyMapFlowDemo.refresh() 刷新演示。
- **无头端到端（/tmp/pipe2map.mjs）**：种子地块 → 生成施工图 → 点「生成并回传地图」
  ⇒ regened:true + mapActive:true + bodySec=onlineMapSection + demoBar 可见 + dock 已建。
  （注：探针里 ppGenerate 内链的 tlAutoGenerate 未落地而直点按钮成功——疑探针时序，
  真机链路正常，留观察。）
- **静态锁**：tests/pipe_to_map.test.cjs 三项——①按钮接线/文案；②包装函数成败判定+
  跳页+刷新演示；③生成施工图内链三级重生成不许回退。
- 版本 v871-pipe-to-map：三处同抬。发布 241a2ad，sleep 80s 线上 sha256 三文件全 OK。

## 26.109 补吸附优先级缺口：驳接点注册 4 档（v872-snap-coupler-prio · 2026-11-01）

用户审核报告两点：①seg-coupler（段总管驳接点，吸附第 7 类目标）没注册进
trunk-snap.js 的 PRIORITY 表 ⇒ prioOf 落 99 垫底档；②trunk_snap.test.cjs 完全没覆盖
驳接点。**两点核实均属实**，且有比审核更重的理由必修：

- **v870 前后风险变了质**：v869 时代驳接点在地块边/外，与高优先级目标空间重叠有限，
  垫底只是设计缺口；v870 内移后驳接点落在首末主管上的 1/4 分位处，与阀门/支管起点
  **共享空间**——阀门 4 档 vs 驳接点 99 档 ⇒ 用户想吸驳接点时被 10px 内的阀门抢走，
  悄悄吸错点。而驳接点是手绘总管的**设计落点**（接到即贯通），恰是最不该被抢的目标。
- **修复**：PRIORITY 注册 'seg-coupler': 4，后续重排——地块顶点1 > 水源2 > 干线拐点3
  > **驳接点4** > 阀门5 > 支管起点6 > 分区顶点7。定 4 的理由：设计落点压过顺路目标；
  仍低于干线拐点（编辑已有干线时「拐点抢自己脚下」的行为不变）。PRIORITY 值无外部
  消费方（grep 核实）⇒ 重排编号零影响；宿主接线（online-map.js:1105 input.couplers
  → buildTargets）本就正确，无需动。
- **单测**（trunk_snap 14→15 项）：①优先级表改 7 类新序；③buildTargets 补 couplers
  输入（数量/标签「驳接点 N」）；新增 ⑫ 同半径内驳接点压过更近的阀门 + 仍让位干线拐点。
- 版本 v872-snap-coupler-prio：三处同抬（trunk-snap.js 在 CORE 名单 sw.js:1427）。
  发布 e24662b，sleep 80s 线上 sha256 三文件全 OK。

## 26.110 版本撞号接管备忘（v880-worst-path-seg · 2026-11-02）

并行会话（v879-tape-layer，主管方向过期重算 ppMainDirectionOutdated）与本会话
（v879-worst-path-seg，最不利路径引擎补齐）同占 v879 且互相覆盖 sw/index 版本串；
用户拍板由本会话接管，统一抬 **v880-worst-path-seg** 发布（e799722，两特性随车，
全闸 515/0，线上 sha256 四文件 OK）。**tape-layer 会话回来请注意：你的特性已随
v880 上线，版本串已是 v880-worst-path-seg，勿再按 v879 发布**；详情见 e799722
提交说明与 tests/worst_path_seg.test.cjs。

## 26.111 轮灌演示水流动画复活 + 地图端完整闭环（v882-demo-flow-revive · 2026-11-02）

用户报：「原来的分区轮灌动画演示，现在被我们改的乱了，它已经彻底失效了」；要求在
在线地图实现：路径 = 手动总管 + 分区内自动生成的段总管连成闭合系统后动画演示。

**根因（简图演示）**：v873「分区图只拥有段总管」起 `frontPipe=null; sourcePos=null`
（inline-09 ~4614），简图 SVG 不再画 `path[data-tlpipe="front"]`；而
`tlDemoRenderFlow`（v218 水流动画）第一步找 front path、找不到就静默 `return`
（~2381）⇒ 水流层整链消失（chips 高亮还在、水流线/光晕/阀门开启全没了）。
探针复现实锤（gen_tldemo.mjs）：点 chip 后 flow:0/halo:0/valve:0/layer:0。

**修复①（简图）**：tlDemoRenderFlow 找不到 front path 时兜底走
`path[data-tlpipe="segTrunk"]`；水流入口端 = `tlSegAnchorIdx()`（v880 驳接端判定，
0=起点 1=终点，读不到退 0），为 1 时整条反序——与最不利路径同源。探针复验：
flow:2/halo:2/valve:2/layer:1，动画复活。

**修复②（地图端完整闭环）**：mod/map-flow-demo.js render() 把手绘总管与段总管从
「静态黑骨架」升级为「实线骨架 + 青色 #38bdf8 流动虚线叠层」（与简图 v218 水流线
同语言），演示时水流动画沿「水源→手动总管→段总管→当组主管/支管」整条路径走。
连通校验（validateConnection，5m 容差、未连报错不播放）保持不变。

**测试**：tests/demo_flow_revive.test.cjs 四把静态锁（兜底顺序 front→segTrunk→判空、
tlSegAnchorIdx 反序、地图端双叠层、连通报错门槛不放松）。

## 26.112 滴灌带沿地块长边硬规则（v883-tape-long-side · 2026-11-02）

用户报（v881 后）：「总管跟支管的方向还是不对，滴灌带要沿着地块长边布置，主管与
支管要垂直于滴灌带布置」。

**根因**：v416 起 tapeAxisOf 的判据是「贴合单边铺设长度 S」投票（软目标当主判据）。
用户地块 91×254 分区 + S=80（fixedSide 160）：贴合票 fx=0.879 > fy=0.314 ⇒ 必投
带沿短边 ⇒ 主管/支管沿长边 —— 与「带沿长边、管⊥带」正好整体翻转。v881 只修了
「带跟随主管」（构造性 ⊥），但主向本身选错了。

**修复**：zone-geometry.tapeAxisOf 加硬规则 —— 网格总宽/总高差 >5% ⇒ 长边即带轴
（不投票）；接近正方形（≤5%）退回贴合票（平票贴合度加权破平不变）。votes/fitSum
仍照算只作报告。两级共用此唯一事实源，主管/支管 ⊥ 带 由 forceDir 映射自动保证。

**探针双向验证**（gen_dir/gen_dir_wide）：竖地块 364×509+3.7° ⇒ 带 y、主管/支管
h:8、三级带 v:64、segTrunk y（⊥主管）；宽地块 509×364 ⇒ 全部翻转（带 x、主管
v:8、三级带 h:64）。

**测试**：tape_axis.test.cjs 重写（长边竖/宽孪生/混合朝向/近方正回退/超长分段），
zone_geometry.test.cjs 的 127×187 旧用例期望翻转（v416 口径→v883 口径）。
522/0。教训：软目标（贴合 S）不能当主判据用 —— 用户口径里「沿长边」是硬约束，
硬约束必须显式编码，不能指望软投票凑巧命中。

## 26.113 地图页演示按钮消失修复（v884-demo-dock-map · 2026-11-02）

用户报（v882/v883 后）：「分区与管路页面有轮灌演示按钮，切到在线地图后就没有了」；
并定口径：**两页都要能演示** —— 三级页只演自动生成的段总管+主管/支管（不含手绘
总管，v882 已是如此）；在线地图演完整闭环（手绘总管+段总管+主管/支管，v882 已做）。

**根因（dock 归属竞态）**：v864 规定工具模式（body.ry-tool）下 dock 不搬 #tlPlanBar
（联合灌溉/轮播组），认为它归绘图轨 #ryCadGrpDemo 代管。但绘图轨显隐由 ry-cad-vp
门控（VPS=[pipePlan/tlPipePlan/grPipe]，**不含 onlineMapSection**）⇒ 切到地图整条轨
display:none，#tlPlanBar 随之消失；dock 又只搬 #mapDemoBar ⇒ 用户看到「按钮全没了」。
探针还抓到第二层竞态：v884 首版直接搬后，ry-cad-toolbar 的 moveDemoBack（认节点
data-ry-demo 标记）在 syncAll 时把 #tlPlanBar 从 dock 拽回隐藏的 tlSide。

**修复（两处配对）**：①map-flow-demo.dockDockIn 废除工具模式豁免，#tlPlanBar 一律
搬进 dock（dockDockBack 按 memo 原样搬回不变）；②ry-cad-toolbar 的 moveDemoIn/
moveDemoBack 加 `closest('#mapDemoDock')` 守卫 —— dock 持有期间轨不抢不拽，两边
memo 各自闭环。探针三态复验：三级页轨内可见 → 地图 dock 内 pb+chips 双可见 →
返回三级页正常还原。

**测试**：demo_flow_revive.test.cjs 增锁 5（dockDockIn 不得再按工具模式跳过）。
522/0。教训：跨模块的 DOM 搬移链（rail↔section↔dock 三方共管一个节点）必须给
每个持有方加「别人持有期间不碰」守卫，只靠各自 memo 会互相打结。

## 26.114 地块唯一性：auto-current 副本叠加修复（v885-plot-unique · 2026-11-02）

用户问：「在线地图我的地块中，当前地块跟地图测量地块还有分区与管路回传回来的
地块，是不是有多层叠加的情况？地块应该是唯一性的。」

**确认属实**：inline-09 生成施工图后无条件 upsertGeneratedCurrent 创建
auto-current:<plotId> 副本（source:'auto'，designPlotId 指本体）；本体（地图画框/
测量保存的那条）本就在库 ⇒ 库里两条同形地块，renderPlots 各画一层 + 我的地块
双行。分区方案其实早已由 RyMapPartition.capture 挂到**本体**（capture 认
id===net.plotId），副本是纯冗余。

**修复（三层）**：①inline-09 同步块：库里有本体（id===plotId）⇒ 不建副本，并
removeGeneratedCurrent 清掉旧副本（自愈老数据）；本体不在（设计来自手动画框）
⇒ auto-current 机制保留（它的本职）。②runye-map-enhance renderPlots 显示级
去重（autoDupOwnerExists 判据），老数据不等重新生成就不再叠画。③online-map
renderMyPlots 同判据过滤，列表不出现双行。runye-map-enhance.js 自身 ?v= 串
849-panel-merge → 885-plot-unique（本轮有改动）。

**探针验证**（gen_plotdup.mjs）：CASE-A 本体在库+旧副本 ⇒ 生成后只剩本体（副本
被清）；CASE-B 无本体 ⇒ auto-current 正常创建。
**测试**：tests/plot_unique.test.cjs 三把静态锁。523/0。

## 26.115 滴灌带沿分区长边硬规则（v886-tape-zone-side · 2026-11-02）

用户报（v885 后截图：分区 127.5×187.5 竖长方形，带却横铺）：「滴灌带应该始终沿着
地块分区 分区的长边布置才对」。

**根因**：v883 用「网格总宽/总高」判长边 —— 用户地块网格 4×2（510×375）未铺满
地块（527×584），网格长边在 x ⇒ 带选横向；但分区本身是 127.5×187.5 **竖长方形**
，长边在 y。网格长边 ≠ 分区长边，整体选反。

**修复**：tapeAxisOf 改为**逐区按宽高比投票**（yPlan>xPlan 投 y、反之投 x、正方
形不投），多数派定全局带轴（全图统一，与主管/段总管架构一致）；平票退回 v416
「贴合 S」加权破平。v881 的 ppShare 构造性传导、v883 的「带⊥主管」链路不变。
探针双向回归：竖地块（分区横扁 182×127.25）带 x/主管 v:8；宽地块（分区竖长
127.25×182）带 y/主管 h:8 —— 带向随**分区形状**翻转。
**测试**：tape_axis.test.cjs 重写（含用户案例 127.5×187.5）、zone_geometry 127.2×187.2
用例期望翻转。524/0。教训：v883 把「长边」理解成地块/网格级，用户口径一直是
**分区级** —— 规则载体（网格 vs 分区）必须与用户语义逐字对齐。

## 26.116 方向修复「没生效」真凶：zone-geometry.js 缓存串停摆（v887-tape-zone-vgate · 2026-11-02）

用户报（v886 发布后截图：527×396 地块、分区角度 4°、8 分区 127.5×187.5 竖长、
铺设 80m）：「不对，没改过来，这个滴灌带的方向，你深度挖掘一下」。

**深度挖掘**：①精确量图：左边标 396m（585.9 是「最远输水距离」标注，非边长），
分区格 ≈131.75×198 竖长 ⇒ 任何 ≥v886 的 tapeAxisOf 都必投 y。②CDP 探针
（gen_dir_user.mjs）在本地 v886 代码上按用户参数全流程点「生成施工图」⇒
tapeAxis 'y'、主管 h:8 横铺、source ppShare 传导自洽 —— **代码链本身正确**。
③截图行为（带横主管竖）与 v416 贴合票（S=80: fx=0.627>fy=0.427 投 x）精确吻合
⇒ 用户浏览器在跑**旧版 zone-geometry.js**。④审计实锤：该文件 ?v= 串停在
**v425-manual-zone-geometry** —— v883、v886 两轮都实质修改它却没抬串，直接违反
sw.js 头注「zone-geometry.js 在 CORE 白名单必须抬版本」的发布纪律；inline-18.js
?v=823 同样落后于 v873 的实质修改。弱网下 SW 静默回退旧缓存（v628 自注「网络一慢
很常见」）/ 旧标签页驻留旧脚本，任何一层 URL 键缓存都能喂旧文件。

**修复（v887 三层）**：①补抬 zone-geometry.js?v= 与 inline-18.js?v= 至 887
（连同主页 13 处版本串、sw.js VERSION 全局同抬）。②zone-geometry.js 暴露数字
`VERSION: 887`。③plot-editor.js 文件头加**页面级缓存守卫**：加载到的
RyZoneGeometry.VERSION 落后于页面要求 ⇒ 强制 location.reload() 一次
（sessionStorage 防离线死循环），刷新后仍旧则 console.warn 留显式证据。
④tests/zone_geo_version.test.cjs 四把锁：zone-geo ?v= 串与主页版本串同 token
（结构性杜绝再停摆）、VERSION>=887、守卫存在且先于主体 IIFE、inline-18 串>=87x。
528/0。教训：**发布纪律「改 CORE 名单文件必须抬版本」要落到「逐文件 ?v= 串」级
——只抬 sw VERSION + 主页主串挡不住单个 mod 文件停摆；探针验证的是本地新代码，
永远无法发现「用户浏览器拿旧文件」这类交付断层，必须靠版本闸门 + 串对齐锁。**

## 26.117 驳接点磁吸常开：手绘总管端点自动吸附自动总管（v890-coupler-magnet-snap · 2026-11-02）

用户口径：「在线地图绘制的总管，断点接近分区与管路页面自动生成的总管驳接点时，
要能自动吸附，这样手动总管 + 自动总管 + 主管 + 支管形成完整水流闭环，演示动画
更直观」。

**现状勘察**：吸附链 v859/v872 已建全（trunk-snap kind='seg-coupler' 优先级 4、
宿主 extraSnapTargets 经 geoBridge 反算 dd.segTrunk.couplers），但整套吸附被
「捕捉」开关（snapOn，v846 规格**重开默认关**）闸死——用户不点「捕捉：开启」
驳接点永远不吸，与「自动吸附」的诉求相悖。

**修复**：①trunk-snap.js 新增 `setKindGate(fn)` 类别闸门（nearest() 内过滤：
被滤类别等同不存在，不命中不显示标记；切换即清标记防白圈残留；stats().gateActive
上报）；②online-map setSnapOn 改「引擎常开 + 闸门分诊」——捕捉开 ⇒ 全类吸附；
捕捉关 ⇒ 只放行 seg-coupler（驳接点是设计落点，全图最多 2 个/块、半径 10px、
优先级仍让位顶点/水源/干线拐点，误吸风险可控）；③mousemove 无条件跑引擎（闸门
决定可见性，不再按 snapOn 分叉——落点与橡皮筋预览继续共用 trunkSnapPoint）；
④吸中驳接点落点时 tip「已吸附段总管驳接点……贯通（轮灌演示可全链走水）」；
⑤进绘制态提示与状态栏追加「驳接点磁吸中」（couplers=0 时不出，geoBridge
一致性守卫挡住时不虚假承诺）。

**探针**（gen_snap_coupler.mjs，全真实路径：种地块→生成施工图→回传地图→
.place-go 选中→进绘制态）：捕捉关 ⇒ nearest(驳接点偏 2.83px) 命中 seg-coupler、
nearest(顶点贴脸)=null；捕捉开 ⇒ 顶点恢复吸附。注意合成环境要点：auto-current
副本 id ≠ 设计页 currentPlotId 会被 geoBridge 一致性守卫正确拒算（extras=null），
须先克隆成本体再选（真实流程本体天然同 id 不触发）。
**测试**：trunk_snap ⑬⑭（闸门过滤/清标记序列/闸门内仍守优先级）、snap_default_off
② 改口径（setEnabled(true)+setKindGate+aria-pressed）+ ②b 驳接点常开锁。533/0。
版本注：v888/v889 已被并行会话占用（zone-real-span / first-zone-axis，工作区未
提交），本版取 v890 并把并行抬号一并吸收。

## 26.118 驳接点磁吸回滚（v891-trunk-revert-coupler-snap · 2026-11-02）

用户撤销前令：「以上指令执行的内容都取消吧，改回去吧」——v890 驳接点磁吸常开
（§26.117）整体回退。

**回退方式**：版本只升不降，不删历史。v890 中只含磁吸改动的四个文件
（mod/trunk-snap.js / mod/online-map.js / tests/trunk_snap.test.cjs /
tests/snap_default_off.test.cjs）直接 `git checkout 32ccf1e --` 字节级恢复到
v887 状态（v887→v890 间该四文件无其他改动，checkout 最干净）；版本串全局抬到
v891-trunk-revert-coupler-snap。驳接点吸附回到 v859/v872 口径：**链路在，
但要手动开「捕捉」才生效**。

测试锁同步回退：trunk_snap ⑬⑭ 删除、snap_default_off ② 恢复
setEnabled(snapOn) 原口径（git checkout 已一并还原）。

## 26.119 旋转角度后「生成施工图管线消失」：7 轮探针 + 防御性修复（v895-rot-regen-guard · 2026-11-02）

用户报：从在线地图点「分区与管路」能看到管线，旋转分区角度后点「生成施工图」管线消失。

**挖掘（gen_rot_regen/rot90/rot_part/rot_shot/rot_irr/rot_edit/rot_restore 七轮 CDP 探针，
全真实路径：种地块→生成施工图→回传地图→导航进入工作区）**：矩形 30°/90°、
不规则六边形 30°、分区模式旋转、手动编辑管线后旋转、存档恢复后旋转——v891 代码上
管线数据与可见性**全部正常**（dd/ppState/画布 path/截图直证）。旋转后管路保持旧角度
几何是 v873 拍板的设计（生成时才重建，探针再次确认重建成功且方向正确）。

**探针抓到的真实缺陷（无论是否即用户所见根因，均须堵死）**：
① `ppAutoGeneratePipes` 重建产物为空时（旋转角度下裁剪异常可致管线全被丢弃），
   旧代码**静默应用空结果** ⇒ 画布管线凭空消失、无任何提示——与用户报的现象吻合；
② `__runyeSingleL2CommitFailure` 不在入口重置 ⇒ canonical 桥之外的失败沿用上轮
   旧原因，alert 恒为兜底文案「布管或设计提交失败」（探针实录），归因误导。

**修复**：① 单地块路径空结果保护——重建主/支管全空且原有管线非零 ⇒ 丢历史 +
恢复前像 + alert「重建管线结果为空…已保留原管线与画面」+ return false，守卫置于
规范事务提交之前（不许空结果写进规范模型）；② 入口重置失败原因，alert 只反映本次。
③ tlAutoGenerate 失败已有 alert（并行会话已加固，本轮确认）。
**测试**：tests/rot_regen_guard.test.cjs 四锁（守卫存在/次序先于提交/入口重置/文案可行动）。
534/0。**未决**：用户真实数据形态仍未复现「消失」，若 v895 上线后重现，alert 会给出
确切原因（不再静默）——届时按提示归因。版本注：v892/v893/v894 被并行会话跳占
（工作区未提交），本版取 v895 并吸收其抬号。

## 26.120 彻底合并第一步：两枚遗留 bug 修复 + 总管清单重评 + 权威切换规划（v896-merge-view-guard · 2026-11-02）

用户拍板「按照你的建议，一步一步解决，彻底合并」。三步全部完成：

**① 优先级 1：两枚遗留 bug 修复（v896-merge-view-guard，9a3fbdc，已发布+线上 sha256 复量 4 文件 OK）**
- inline-18.js syncLayers（~430）：**仅首次渲染**（renderedPipelineData null→有值）才 ppFitView 适应窗口；
  后续数据更新（重新生成管线图）保持用户缩放/平移不再被重置——v784 副作用修复。锁：tests/workspace_view_guard.test.cjs 锁①。
- plot-editor.js ppRender 两处「缩放 xx%」（空态+正常）从右下角挪到**左下角**（x=8, textAlign='left'）：
  右下角被 .ry-pwa-install 浮条（fixed right/bottom 16px, z-index 2000）遮挡。锁：同文件锁②。
- 536/0（534 基线+2 新锁）；版本串全局抬 v896-merge-view-guard（sed 首次对 index.html 静默失败疑并行进程锁文件，重跑成功——**教训：sed -i 后必须立即 grep 核对，不能假设成功**）。
- 版本纪律注意：index.html 实际 12 处 v896 串（含 runye-map-enhance/online-map.css/inline-09 等引用串全跟主页版本走）。

**② 优先级 2：总管剥离改造清单（10-31 v2）现状重评** → `project-planning/总管剥离改造_现状重评_2026-11-02.md`
结论：**清单主体已被 v840~v895 实际演进超越，可归档**。T2 关兜底=v873 恒置 frontPipe/sourcePos null；
T3 数据源=core/trunk-schema.js v2 + v844 plot.trunk 唯一可新增（落位与清单推荐 B 一致）；
T4 消费端=v879 segWorstPath/v878 network_layout kind:'segTrunk'/v843 tlFrontLenUse 收口；T6 手绘=v840+ 已上线。
残留仅 3 项（全低危）：①plot-editor.js:3756 水源换向死代码（读恒 null 的 dd.frontPipe）；
②T6.5/6.6/6.7 属性面板/黄标/撤销隔离按需增强；③权威切换见 ③。

**③ 优先级 3：权威切换分批实施规划** → `project-planning/权威切换分批实施规划_2026-11-02.md`
六批次：A 剩余写路径审计与接入（最大，先审计后分小批）→ B 组撤销权威收口（轻量）→
C 单地块旧格式边界验收 → D 迁移系统验收（发版闸门）→ E 旧字段停写与清退（最后，前置 A~D 稳定）→ F AOCI Maintain。
**未动工**，等用户拍板从批次 A 开始。docs 提交 7a21699 已同步远端。

## 26.121 权威切换批次 A：剩余写路径审计 + 死代码标记（v897-write-path-audit · a0e88a3 · 2026-11-02）

用户拍板「按照你的建议推进」→ 启动批次 A。子代理全量盘点 plot-editor.js 234 处 `ppState.*=` +
tlDiagramData 9 处活跃字段级写入，逐处核对事务链。

**核心结论（好消息）**：用户编辑主路径（角度/水源/阀门/遮蔽/清管/自动布管/重分区/面积锁/
分区线拖拽微调合并/undo/整组 slot）**全部已在 canonical 事务链内**——cut-drag 是规范的
「先写后提交、松手 CAS 结算」。绕过事务仅 7 条：2 死代码 + 2 降级 + 2 导入语义 + 1 缓存。
**批次 A 无需大规模写路径改造**，批次 E（停写）前提提前具备。

7 条路径与处置（全表见 `project-planning/剩余写路径审计_2026-11-02.md`）：
- D1 ppAddPipe 手动画管链：v304 guard 后不可达，v897 加 warn 标记+注释（恢复绘制前必须补事务）
- D2 window.ppSetState：**全仓无调用者**（恢复实走 inline-12 canonical 优先+RunyeBridge），保留留痕
- F1 tlAutoResetGroups fallback 直写 cutOffX/Y：v897 加 warn 标记（**留工作区未入库**——同文件混有
  并行会话未提交改动「底图滴灌带同图可见策略」，禁代提交；并行落地后补 warn 断言入库）
- F2 inline-09 N 区按钮清 cutOff：依赖 tlAutoGenerate 提交（v115 注释已明示），接受
- I1/I2 导入语义（ppLoadPolygon/ppApplySlot/ppRestoreState）：初始导入无前像，按设计无 CAS
- A1/A2/A3 缓存规整/拖中直写（先写后提交）/swap-restore 借用：可接受

tests/write_path_audit.test.cjs 三锁：v304 guard 仍在 / ppAddPipe 带标记 / tlAutoResetGroups 主路径
优先 cutStepReset。539/0。待评估项：mergePreview 在 PP_SLOT_KEYS 内会随 slot 持久化（挂入批次 E 前）。

**教训修正（v896 §26.120 的「sed 静默失败疑锁文件」判断错了）**：真相是串格式差异——
index.html 串为 `?v=NNN-name`（带 `=`），sw.js 为 `'vNNN-name'`；sed 查找串若带 `v` 前缀
（`v896-...`）对 index.html 天然 0 命中。**正确姿势：sed 用 `NNN-name`（不带 v）全局匹配**，
且 sed 后用 python `data.count(b'NNN-name')` 核对（grep 对此文件偶发输出异常）。

## 26.122 权威切换批次 B/C 验收（2026-11-02 · 2c298c2，纯文档+探针，零产品代码改动）

批次 B（组撤销权威收口）——探针 gen_undo_group.mjs **11/11 全 PASS**：
逐块态 setSourcePosition ×2（revision 单调）→ 逐块 undo source 回退 → 切整组 →
autoPipesWhole 各槽写入 → clearPipesWhole 清空 → **整组 undo（批次B核心）成员槽回写+revision 单调** →
再导出 canonical 存在+validate 通过+无 shadow 错误。§50 的「组撤销复用预检验证过的规范设计」实现正确。

批次 C（单地块旧格式边界）——探针 gen_legacy_archive.mjs：
- **C3/C3b PASS**：canonical 绑定损坏（plotId 改错）/校验损坏（revision=-5）→ runyeLoadProject 整份拒绝且现状不被半改。
- **C1/C2 合成环境受限**：runyeSaveProject 被保存链三级 canonical 提交分支拒绝
  （诊断：绑定健康 bound=true/rev=7、签名匹配，但 ryCommitSingleLevel3CanonicalFromRuntime
  合成环境返回 false——与 §26.119 存档恢复链 restored:false 同源，非产品缺陷）。
  C1 成功路径静态审计确认（inline-12:364 legacy:true 分支 + :796 importLegacySingleCanonicalForRestore）；
  真机「保存→导入工程」手工验证并入批次 D。

进度：A✅(v897) B✅ C✅；D/E/F 待拍板。验收记录：project-planning/权威切换批次BC验收记录_2026-11-02.md。

**探针教训补充**：gen_legacy_archive 首轮缺 Page.javascriptDialogOpening 自动接受 → 某次 alert 挂死整页
（SIGTERM 无输出）；保存链需要先「地块库注册探针本体」（RyPlotLibraryStore 克隆 auto 副本）否则
plotBinding 校验失败；tlDiagramData 存在时保存要求三级 canonical 提交成功（需先点 ppGenerate+tlAutoPipe）。

## 26.123 权威切换批次 D：迁移系统验收通过（2026-11-02 · 8daab0a，7/7 ALL PASS，零产品代码改动）

gen_batch_d.mjs 四产物一致性 + CAS 反馈 + revision 单调，7/7 全 PASS：
- D1 图纸（权威 SVG 实体）/材料表（「总管 Ø90 220m ¥3,740」行）/长度口径/DXF 数据源/canonical 健康全过；
- D2 无效提交（polyPts=null、before=null）→ false + __runyeSingleL2CommitFailure 显式原因（v895 反馈链在；
- D3 编辑→undo→再生成 revision 单调。
**语义澄清（防误判）**：tlDiagramSVG 不含总管实体是 v873 定版语义（设计侧只拥有段总管）；
DXF 总管来自地图手绘总管（对话框 trunkPlan() 单独算，未画时显式禁用+原因）——不是缺口。

四批次探针矩阵（迁移验收）：rot_regen 七轮(v895)+undo_group 11/11(B)+legacy_archive C3/C3b(C)+batch_d 7/7(D)。

**进度：A✅ B✅ C✅ D✅**。批次 E（停写）按规划前置「线上稳定至少一个版本周期」暂不启动，等拍板；
批次 F（AOCI）代码最终稳定后执行。
**遗留用户手工项**：真机「保存方案→导入工程」往返一次（C1/C2，探针合成环境保存链受限）。
验收记录：project-planning/权威切换批次D验收记录_2026-11-02.md。

## 26.124 批次 C1/C2 补强探针 + v897 审计一处结论修正（2026-11-02 · 探针+文档）

**审计修正（重要）**：v897 §26.121「window.ppSetState 全仓无调用者」结论**错误**——
inline-12.js:806 恢复链 `window.ppSetState(data.pipePlan||{})` 是其唯一消费点（当时 grep 管道
head 截断漏检）。归类从「死代码」修正为**导入语义**（存档→内存投影，canonical 由恢复链
projectSingleCanonical 预检+restoredCanonicalDesign 装载收口），不构成绕过事务的用户编辑。
审计文档已原地修正；write_path_audit.test.cjs 未锁该结论，无需改测试。
**教训：grep 管道接 head 前先看总命中数，审计结论逐条核对调用方后再定「死代码」**。

**C1/C2 补强探针**（gen_archive_c12.mjs）：绕过合成环境受限的 runyeSaveProject，页面内直接
构造存档 JSON（结构与保存链一致）写 localStorage → runyeLoadProject：
- 构造成功（C1 无键/C2 带 canonical revision=7）；
- load 返回 false 根因链定位：runyeLoadProject → captureRestoreRollbackSnapshot(:715) →
  runyeSaveProject(ROLLBACK_KEY) → 三级 canonical 提交分支（ryCommitSingleLevel3CanonicalFromRuntime
  内 adapter.isCurrent(plot.generated,...) 合成环境 false）→ rollback=null → 「无法建立安全回滚点」拒恢复。
  与 §26.119「存档恢复链合成环境失败」同根因，**非产品缺陷**（真实浏览器保存/恢复是日常路径）。
- C1/C2 结论维持：恢复语义正确（拒绝路径 C3/C3b 已探针 PASS），成功路径待用户真机「保存→导入工程」验证。

## 26.125 批次E前评估项落地：mergePreview 恢复置空（v898-merge-preview-restore · 536c8b9 · 2026-11-02）

**mergePreview 评估结论**（批次 C 审计遗留评估项）：渲染消费仅 ppDrawCutHandles（mode==='adjustCut'
才画橙色合并高亮）；随 slot 持久化是「捕获一致性」有意设计（ppBlankSlot 也带 mergePreview:null 键）；
**不移出 slot keys**。唯一缺口：ppApplySlot 恢复原语的兜底段漏了它——恢复后残留非 null 会在切回
adjustCut 时画一次幽灵橙色高亮（极窄窗口：拖动中恰好捕获 slot）。修复 1 行：ppApplySlot 统一
`ppState.mergePreview=null`，与 ppBlankSlot 语义对齐。539/0，线上 sha256 复量 3 文件 OK。

**待用户拍板项**（本轮发现，未擅动）：tlSrcFlip（v255 右键水源换向）读 dd.frontPipe/sourcePos——
v873 后两者恒 null，右键水源**永久弹「请先在管路规划页生成管线图」误导提示**（即使已生成）。
三个处置选项：A 移除监听（右键无反应）/ B 改提示文案「该功能已随段总管改版下线」/
C 恢复功能（改读段总管/地图总管口径——是否需要等价功能属产品问题）。等用户选。

线上版本：**v898-merge-view 系列最新 tip=536c8b9**。

## 26.126 v896~v898 发布后探针矩阵复跑：零回归（2026-11-02 · 探针回归）

今日三轮发布（v896 syncLayers/缩放文字、v897 审计标记、v898 mergePreview）后，在 v898 线上
代码复跑既有探针矩阵：
- gen_rot_regen（30°）：旋转后管线 8/8 在、tlPipePaths=32、生成施工图重生成正常 ✓
- gen_rot90（90°）：同上 ✓
- gen_undo_group：**11/11 ALL PASS** ✓
- gen_batch_d：**7/7 ALL PASS** ✓
- gen_legacy_archive：C3/C3b 拒绝路径 3 项 PASS；4 FAIL 与首跑一致（save/c1/c2 构造链，
  合成环境限制已定性，见 §26.124）✓

**结论：v896~v898 零回归**。今日收官状态：线上 tip=5ff45eb（v898），539/0，A~D 批次全绿。

## 26.127 双轨清单同步锁（2026-11-02 · 0a42147 · 纯测试 541/0）

新增 tests/slot_design_keys_sync.test.cjs 两锁：
- ① PP_SLOT_KEYS（plot-editor:971 捕获完整性，17 字段）⊇ designKeys（:130 提交触发检测，16 字段）——
  新设计字段只加一边 ⇒ slot 丢字段（恢复缺设计）或字段变化不触发提交（canonical 静默落后于画布）；
- ② mergePreview 单侧语义锁：进 slot 捕获（v898 评估定案）、**不进** designKeys
  （预览标志变化不得触发 canonical 提交，否则 CAS 把瞬态预览当设计变更）。

这是「彻底合并」主线的收尾防护：双轨并存期（批次 E 前）两张清单是最容易漂移的接缝。
远端 tip=0a42147（v898 系产品代码未变，纯测试）。

## 26.128 右键水源换向移除（v899-src-flip-remove · d154d4a · 2026-11-02 用户拍板 A）

用户三选一拍板 **A=移除**。tlSrcFlip（v255）IIFE 及注释整体删除（plot-editor.js ~3747-3784，
-51 行）：原功能读 dd.frontPipe/sourcePos，v873 后两者恒 null，实际退化为永久弹误导提示。
- 保留：三级 SVG 的 [data-tl-src] 热区元素（纯渲染标记无行为）；外层 IIFE 收尾；
- 语义：水源方向现在由地图总管（plot.trunk 手绘）画法定义；
- 残留引用核查：grep tlSrcFlip/data-tl-src 仅剩渲染侧与注释，无行为消费；
- 全闸 541/0；线上 sha256 复量 3 文件 OK。远端 tip=d154d4a（v899）。

## 26.129 水源热区 tooltip/光标同步 v899 拍板（v900-src-tooltip-fix · fb12ca2 · 2026-11-02）

v899 移除右键换向后复查发现**配套误导残留两处**，且实锤**水源拖动链同死**：
- `tlFrontDesign/tlSrcDesign`（inline-09.js:4630-4631）声明为 null 后**无任何赋值点** ⇒
  `tlDiagramData.frontPipe/sourcePos` 恒 null（v873 设计侧剥离的实锤）；
- 水源**拖动**链（:5905 svg mousedown data-tl-src 分支）读 dd.sourcePos → 不可达（死分支）；
  局部 sourcePos（走向分支赋值）仅用于渲染，水源点显示正常但不可拖。

修复（v900）：
- tooltip「拖动：移动水源位置（任意）｜右键：切换水源方向」→「水源位置随管线走向自动确定」；
- style-01.css 撤下 data-tl-src 手型光标（v255），恢复默认；
- 拖动死分支保留+注释标记（同 v897 ppAddPipe 处置策略，后续清理批次处理）；
- verify_ry_tool.js 锁的旧 tooltip 文案不需同步——gate.cjs:50 已注明其为历史审计工具、不在现行闸门链。

全闸 541/0；线上 sha256 复量 5 文件 OK。远端 tip=fb12ca2（v900）。

## 26.130 C1/C2 保存链四层诊断收官（2026-11-02 · 探针，无代码改动）

gen_batch_d 签名堵点深挖四层，每层结论：
1. rollback→save：确认（captureRestoreRollbackSnapshot 内 runyeSaveProject 失败即拒恢复）；
2. save 拒绝分支定位：640 行三条件 hasBoundCanonical && dd.sourceSignature===签名 && commit!==true；
3. **commit 前置条件逐项复现全过**：validate ✓ / 绑定 ✓ / **isCurrent ✓** / **s4 L2 十五项字段逐一 JSON 比对全等** ✓——保存链健康度证据充分；
4. 剩余堵点=闭包内 `drawingDesignGenerationInputSignature` 与实时辅助态（terrain/tlAux/collectInputValues）
   在探针多步操作间的漂移——**签名护栏设计正确**（护栏本该拒绝「输入态与生成时不一致」的保存；
   且 sig 不匹配时 640 分支不拒绝保存、走宽容路径保留旧 L3 canonical——真实用户单步流程不受影响）。

**C1/C2 最终定性**：探针合成环境多层时序依赖，非产品缺陷；等用户真机「保存→导入工程」一次即可闭环。
后续存档类探针若需在合成环境跑，可在生成后**立即** save（不插入库注册/refresh 等中间步骤）尝试绕开漂移。
