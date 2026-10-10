# 润野灌溉 v359 独立审核报告

审核日期：2026-10-10（Asia/Shanghai）  
审核目录：`C:/Users/AHS/runye-irrigation`  
审核基线：`e6329b9581e6742a8222da6108003b084c9730ad`，包含工作区未提交文件。  
**最终结论：需修改，暂不放行。** SDK 自托管产物本身有正向证据，但初始化引入了可复现并发回归，构建复现材料不匹配；指定真实浏览器验证本轮未跑通，不能沿用交接中的 PASS。

## 1. 审核边界与操作记录

已按指定顺序完整阅读 `HANDOFF_v359_REVIEW.md`、`AGENT_HANDOFF.md`，之后才核对 Git 与执行验证。未修改业务代码、`.gitignore`、会员规则、任何 calcStage 内容；未提交、push、发布、发送短信或调整平台权限。本次在项目内仅新增本报告。测试辅助脚本写在 `C:/Users/AHS/Documents/ChatGPT/数字农业工作台/`，不改变生产文件。

已有 localhost:8080 服务，`curl.exe --noproxy '*' -I http://localhost:8080/index.html` 返回 200，Content-Length=211393。服务响应为 Python/3.13.14，**与指定 3.13.12 不同**；未停止或替换已有服务。调用指定 Python 路径还能执行静态检查，但输出 `Failed to find real location ...3.13.12...` 提示，因此不声称服务由指定解释器启动。

## 2. Git 账实核对

`git log --oneline -5`：

```
e6329b9 docs: v359 工作交接审核版
bbafe2a docs: AGENT_HANDOFF 补 gitignore 挡住会员云同步层的发布阻塞项
c2cbc0e v359: index/cloud-sms-test 接入本地自托管 CloudBase SDK bundle
d512d72 v357 根治③：index.html 单文件拆分
09b3daa v356 性能优化：方案B懒重放
```

| 提交 | 实际文件 | 裁定 |
|---|---|---|
| e6329b9 | HANDOFF_v359_REVIEW.md，新增 117 行 | 对应审核交接；文中“两个本地 commit”未包含其自身，需解释统计范围 |
| bbafe2a | AGENT_HANDOFF.md，新增 14 行 | 与说明一致 |
| c2cbc0e | AGENT_HANDOFF.md、**README.md**、cloud-sms-test.html、index.html、bundle，共 5 文件 | §1 **漏列 README.md**；cloud-sms-test.html 在 Git 中是新增整页（258 行），不是仅两处标签修改；index 新增 10 行会员接入块，不仅是加 bundle |

`git status --short`（审核写报告前）：

```
 M runye-nav.js
?? _bak_v342_runye-ai-plan.css
?? _bak_v343_runye-ai-plan.css
?? _bak_v345_runye-ai-plan.css
?? _bak_v346_runye-nav.css
?? _bak_v348_runye-ai-plan.css
?? _bak_v349_runye-ai-plan.css
?? pwa/vendor/cloudbase-js-sdk-3.8.2.esm.js
?? runye-entitle.js
?? runye-member-ui.js
```

`runye-nav.js` 未提交差异为 **80 行新增、18 行删除**，涉及 v358 会员导航门控。不能归因于 v359 SDK 打包，也不能把这个脏工作区当作三个提交的干净复现。这里只登记，不审核或改动会员业务。

`git check-ignore -v`：cloud-sync.js 命中 `.gitignore:22`；cloud-diag.html 命中第 21 行；_sdk_verify.html 命中第 63 行 `_*.html`。三者未入库属**明确已知状态，不是误报遗漏**。runye-entitle.js / runye-member-ui.js 未跟踪。纯 Git 检出的版本缺少 index 引用的这些运行依赖，仍有交付阻塞。

沙箱内初始 `git status` 报 `must be run in a work tree`；提升权限后只读复核成功，以上采用成功输出，未更改 Git 配置。

## 3. 验证结果（区分失败和未取得证据）

运行 Node：`C:/Users/AHS/.workbuddy/binaries/node/versions/22.12.0/node.exe`。

| 验证 | 结果 | 实际输出与限制 |
|---|---|---|
| ① `node verify_ry_tool.js` | **PASS，exit 0** | 42 个编号检查全通过；31 段脚本语法失败 0、178 项契约缺失 0、446 个 id 重复 0。第 13d 明示有一项历史基准缺失而跳过；这是静态闸门，不是 SDK 集成测试 |
| ② localhost:8080 HTTP | **PASS（现存服务可达）** | HTTP/1.0 200，211393 字节。未另启服务器占用已有端口；解释器版本差异见 §1 |
| ③ 原样 `_verify_pages.cjs` | **FAIL / 环境阻塞，exit 1** | `Failed to launch the browser process: Code: 0`，发生在 page.goto 之前。没有三条 PASS，也没有本轮 anon/uid 或 jsdelivr 次数数据 |
| ④ 原样 `_verify_sdk_bundle.cjs http://127.0.0.1:8080/_sdk_verify.html` | **FAIL / 环境阻塞，exit 1** | 同样 Edge 启动失败；无 R1/R2/R3。不能据此判定 SDK 登录失败，也不能声称 EXCEED_AUTHORITY 已复现 |
| Edge 启动补充排查 | **FAIL / 环境阻塞** | 改用 pipe 通道、headless:true 的临时测试仍报 `Protocol error (Target.setDiscoverTargets): Target closed`；未更改原探针或浏览器配置 |
| ⑤ bundle 静态检查 | **PASS（限定检查）** | `^import\|import("` 等价正则匹配 0，文件 787218 字节。正则不是完整 JS AST 证明；配合下面运行证据裁定 |
| ⑥ 手机短信实测 | **未执行** | 无手机号/验证码输入；未产生短信费用。不裁定手机号登录、UID 继承、会员到期日 |
| 脱网 SDK 单文件执行 | **PASS（jsdom，非 Edge）** | jsdom outside-only 执行完整 bundle，不加载页面资源，fetch 设置为抛错：`cloudbase=object bundled=true`，初始化可完成。证明挂载不依赖下载其他 JS；不证明离线登录 |
| 三页面脚本顺序 | **PASS** | index:1000 bundle → :1001 cloud-sync → :1002 entitle → :1003 member；另外两页 :8 bundle → :9 cloud-sync，普通同步 script |
| cloudInit 并发/恢复 | **FAIL，发现回归** | 基线并发 initCalls=1；当前 SDK 已有时并发 initCalls=2；SDK 延迟就绪时两个调用返回 true 但 initCalls=2；超时 false 后再次调用可成功，但 lastError 仍为 sdk_not_loaded |
| SW network-first 合约 | **PASS（机制）；绝对更新保证 FAIL** | 模拟缓存存在且服务器 200：返回 fresh，fetch=1、save=1；后续服务器 404：返回缓存内容、status=200；离线也返回缓存 |
| 换行与未改文件 | **PASS** | index CRLF=2906、LF=2906；member-ui 与改前备份逐字节相同，SHA256 均为 5BF1FCFCFAD7CA97A0F7E11B213815794B4DDF494EC68B71EFE27FB5961D9FD1 |

证据脚本（均在可写工作台）：`review359-probes.cjs`、`review359-launch.cjs`、`review359-bundle-offline.cjs`。并发测试用虚拟定时器、stub init 计数；进一步执行真实 bundle 得到 **`repeated_init_same_app=false`**，排除了“SDK 自动返回同一实例，所以重复调用无影响”的假设。尚未证明必然造成登录失败，不夸大为已发生用户数据损坏。

产物 SHA256：`3DA5DAB831D37CC57767DB745DD44D0A9F8469968C48CA6D9F60687C1915DA56`。index SHA256：`D023AB67757146D3FDFABF5E9B69BFFB4B168EA32D3F8E86AEE08988B2C73993`。

## 4. §5 九个怀疑点逐条裁定

### 1）Publishable Key 入库 —— 认可“可公开”，推翻“无风险”的绝对表达

本地配置所用凭证标识为 PublishableKey、anonymous、非管理员；未在报告复制完整凭证。腾讯官方明确客户端 Publishable Key 可暴露浏览器、使用匿名权限：[API Key 配置](https://docs.cloudbase.net/api-reference/webv2/api-key)、[PG SDK 初始化](https://docs.cloudbase.net/api-reference/webv3-pg/initialization)。这不是服务端 SecretKey 泄漏。然而匿名可访问什么、成本/限流、数据隔离仍取决于后端授权；公开设计不等于所有资源都安全。不能仅凭这一点替用户改忽略规则。

### 2）bundle 自包含 —— 认可 SDK 代码自包含；推翻“index 无任何外部请求”

787218 字节、import 模式 0、脱网单文件执行成功，支持 SDK 挂载不需要 CDN。三个真实页面的“jsdelivr=0 且登录成功”本轮**未确认**。index:27 仍引入 `https://beacon.cdn.qq.com/sdk/4.5.9/beacon_web.min.js`，认证本身也需联网；member-ui:410–423 在本地 bundle 缺失时仍动态 import jsdelivr。因此“整个 index 无任何外部请求”“永远不会 sdk_not_loaded”均不成立。应区分 SDK 静态依赖、遥测、业务 API 与故障兜底。

### 3）不改 gitignore —— 认可

符合本次红线和发布决策边界。保留现状是正确的审核行为；但不代表可发布。交付前必须由授权负责人安排 cloud-sync 及会员依赖进入实际发布产物并完成干净检出测试。本报告不修改 `.gitignore`，也不擅自 git add -f。

### 4）cloudInit 异步等待 —— 推翻“行为无破坏/幂等成立”

Promise 返回契约保留；现有调用使用 `.then` 或 `await`，没有发现依赖布尔同步返回的调用。250ms 轮询可解决短暂未就绪，但 `if(cloudApp)` 在 `.then()` 之前，只挡住后续已完成的调用，挡不住同时开始的初始化。基线 1 次、当前 2 次，真实 SDK 两次 init 返回不同 app。必须加入共享 pending Promise 或在初始化前再次检查，避免覆盖 cloudApp、重复通知和多实例状态竞争。

等待计数是 40 个定时器，不是严格墙钟 10 秒（后台节流会更久）；不是必须换事件监听，事件+有界超时或轮询都可。超时后新调用能恢复，但当前成功路径未清除初始化阶段错误，诊断会误报。旧版函数本身再次调用也能重试，所以“永久失败直到刷新”只可能描述缺少重试的上层流程，不能作为函数本身的事实。

### 5）SW 不 bump —— 认可 network-first；推翻“在线永不卡旧版”

sw.js `local()` 先 `fetch(request)`，成功才调用 `save()` 并返回响应，故本轮不修改 SW 算法/CORE 的情况下，**不 bump 本身不是必然错误**。但 fetch 默认仍受浏览器 HTTP 缓存影响，没有强制 no-cache；非 2xx（包括 404）和异常会回退缓存，并以原缓存的 200 返回。`key()` 还会移除 query，`?v=359` 与旧 query 的 CacheStorage key 相同。新 SDK 不在 CORE，首次离线没有产物时不能靠 bump 修好；运行时缓存又受 Content-Length 与 80 项淘汰限制。必须把交接改为条件化保证，并验证完整资源发布与 HTTP 缓存头；不是机械 bump VERSION 就算通过。

### 6）混合版本参数 —— 认可基本策略，推翻过度精确描述

JS/CSS 的 query 不需要全站统一；未改 member/entitle 继续 358 不构成自身 bug。实际 index 的 bundle 也带 `?v=359`，不止 cloud-sync。纯 Git 基线中 index 新增了整块会员接入，不能简单说“引用从358升359”。由于 SW 归一化 key，query 不能保证故障回退时跨文件版本原子一致。先保证发布依赖齐全，再做缓存故障场景测试。

### 7）根目录 _sdk_verify.html —— 认可留本地，不能等同无副作用/适合发布

它自动匿名登录并裸调真实函数与不存在函数，适合受控本地测试；gitignored 符合本轮定位。它不是纯展示页，会产生认证/网关请求。保留可行，不要自动纳入公开发布包或以每次打开页触发的行为作为业务启动路径。本轮未删除。

### 8）匿名拦截与代码无关 —— 推翻作为本轮已复证/永久结论的表述

历史记录“真实函数和不存在函数同报授权拒绝”支持拦截早于函数业务执行，不支持把所有未来平台状态、所有身份都一概判死。本轮原始探针没启动，R2/R3 无新证据；只能记录历史结论，**当前状态待复测**。更不能从匿名被拒推出“手机号一定可用”或“唯一可行方案”。不触碰平台权限，也不重复尝试文档明确列为无效的配置路线。

### 9）不改会员业务边界 —— 认可，但集成依赖必须登记

member-ui 与改前备份一致，三个提交没有会员业务文件差异；本轮没有审核权益算法或邀请码。然而 index 新增加载三件套、工作区 nav 存在会员门控差异，所以测试的是带前置未提交依赖的集成状态。需记录这些依赖，不能声称从这三个提交单独检出就与本地运行等价。本次未改会员代码。

## 5. 交接未充分列出的新增问题

1. **P1：并发初始化回归。** 见 §3、§4-4，旧版 1 次新版本 2 次，真实 SDK 实例不同。必须修并补并发、延迟就绪、失败后重试测试。
2. **P1：交付构建脚本与产物不匹配。** 指定 `_bundle_sdk.cjs` 的 ENTRY 是 SDK `dist/index.esm.js`，`format:'esm'`，没有使用 `_ry_sdk_entry.mjs`，却写到相同 `.bundle.js` 路径；按文档直接重跑会覆盖现有 IIFE 为不同类型产物。该脚本未执行，以免改动生产。须提供正确 IIFE 构建配方、入口、锁定依赖及验证步骤；建议入库到构建工具目录。当前依赖清单还是 `^3.8.2` / `^0.28.2`，不能独立保证重建版本。
3. **P2：探针可假绿。** `_verify_pages.cjs` 收集 pageErrors，但 `ok` 不检查其为 0，也未显式要求非空 uid；bundle 探针的 RESULT 仅断言 R1，R2/R3 错误、跳过、超时均不影响 exit 0，V4 仅检查 uid 而非 anon=true。交接列出的预期需人工逐项核验或扩充断言，不能只看 RESULT。
4. **P2：成功后的错误状态残留。** sdk_not_loaded 后成功 init 仍保留旧 `_cloudLastError`，误导诊断；应只清除属于本次初始化阶段的旧错误，避免把其他业务错误一概清掉。
5. **P2：自托管后的诊断文案未更新。** cloud-sms-test:122–124 仍归因“八成 jsdelivr 取不到”，本地文件 404/执行失败会被引向错误排查。cloud-sync 注释仍称 ESM，cloud-diag 注释误称 init 会匿名登录，需校正。
6. **交付完整性：** README 漏列、工作区 nav 未提交、会员两文件未跟踪，以及 esm 中间产物未跟踪，须区分历史前置与本轮改动。不能以完整本地目录的 QA 通过替代干净发布包验证。
7. **依赖许可材料待补核：** SDK 安装包 license 为 Apache-2.0，bundle 中 Apache License/Copyright/@license 标记均为 0；现有 `pwa/vendor/LICENSE` 是 Leaflet BSD 文本。构建脚本设置 legalComments:'none'。尚未完成全仓第三方许可审计，但现有交付清单没有该 SDK 与传递依赖许可归档，应在分发前补齐相应 LICENSE/NOTICE 材料；这不是把 SDK 当 MIT 的依据。

## 6. 必须修改/补证项与放行条件

1. 修 cloudInit 并发幂等及初始化错误恢复，保持既有 Promise API；修改前备份到 `_backup_`。本报告先行说明修什么及原因，本轮不代改。
2. 修正 `_bundle_sdk.cjs` 复现配方，避免把 IIFE 覆盖成 ESM；提供可复现版本锁与许可材料。
3. 补正账实清单、缓存保证措辞、诊断文案与探针断言，使报告不再把未覆盖/失败场景写成通过。
4. 在能正常启动的 Edge 环境重跑指定两份探针，保存三页 sdk/jsdelivr/anon/uid/页面错误明细和 R1/R2/R3。当前启动失败必须解除或换可审计等价环境，不沿用上轮 PASS。手机号流程独立保留人工验收，不把匿名测试替代它。
5. **面向发布时**补齐未入库运行依赖并做干净产物检查。是否修改忽略规则、何时发布由用户另行授权；本轮不操作。

修复前不放行。此结论不是“自托管方向错误”：现有 bundle 大小、加载顺序、脱网挂载证据均正常；阻塞来自并发回归、构建交付不一致和当前缺失的真实浏览器复测证据。
