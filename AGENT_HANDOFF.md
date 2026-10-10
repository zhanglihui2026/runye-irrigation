# 润野灌溉 · 接手须知（Agent Handoff）

> **给接手本项目的 AI agent / 开发者**：先读这一页，再动代码。
> 最后更新：**2026-10-10** ｜ 当前阶段：**会员体系开发中，架构是否迁移待用户定方向**
> 相关文档：`README.md`（站点结构）｜`CLOUDBASE_SETUP.md`（云开发配置）｜`AI_ONLINE.md`（AI 在线模块）｜`发布与更新说明.md`

---

## 0. 一句话现状

会员/权益功能**代码已写完并本地联通**，云端 `ryEntitle` 云函数**已部署成功**，
但被 CloudBase 平台的一道环境级策略拦住 —— **匿名用户无法调用任何云函数**（`EXCEED_AUTHORITY`）。
已定性为「平台限制，不是配置问题」，绕开的唯一办法是**让用户用手机号登录**。
⇒ **当前唯一未知数：手机号登录后能否调通云函数**（待实测，见 §5）。

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

### 3.6 结论：润野的云函数**必须由已登录用户调用**
- 匿名态只能走「门控 fail-open + 本地临时额度」。
- 官方口径「**匿名转正后 UID 不变、云端数据继承**」可以兜住"先用后登"，不会丢数据。
- 时效注记（v359b，采纳审核意见）：以上为截至 **2026-10-10 19:15** 的实测状态（当日复测 R2/R3 均 `EXCEED_AUTHORITY`）；平台策略可能变化，复用前应按「诊断要点」重新定性。

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

### 🔒 发布纪律（**重要**）
**改完文件不要自动发布。** 本地改动 + 本地 `git commit` 可以，
但 **CloudStudio 部署 / GitHub 推送 / 任何对外可见的更新，必须等用户明确说"发布"**。

---

## 8. 一句话交接

> 会员代码写完了，云端函数也部署了，卡在**平台不给匿名调云函数**这道闸上 —— 已经查到底，改不了。
> 正解是**让用户用手机号登录**，这一步还没实测过。
> 请先陪用户跑一遍 `cloud-sms-test.html`；
> 迁移架构、AI 接口开放度、白名单这几件事，**等用户拍板，别自己动手**。
