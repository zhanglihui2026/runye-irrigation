# v359 工作交接 · 审核版（2026-10-10 18:47）

> **给审核 agent**：本文档是本轮（v359 CloudBase SDK 自托管）工作的完整交接。
> 配套长期文档见 [AGENT_HANDOFF.md](AGENT_HANDOFF.md)（项目全局现状 / 硬约束 / 待用户拍板事项）。
> 审核时请**逐条跑「§3 验证复现」**，并重点攻击「§5 主动列出的怀疑点」—— 每一条都欢迎推翻。

---

## 0. 一句话现状

会员跑通的前端侧卡点（用户浏览器取不到 jsdelivr → `sdk_not_loaded`）已通过 **SDK 自托管**拔除；
三页面无头实测 PASS（0 次 jsdelivr 请求 + 匿名登录成功）；**平台状态未变**：匿名调云函数仍被
`EXCEED_AUTHORITY` 环境级一刀切，会员的唯一未知数仍是「手机号登录后能否调通云函数」，等用户实测。

---

## 1. 改动清单（文件级）

| 文件 | 改动 | commit |
|---|---|---|
| `pwa/vendor/cloudbase-js-sdk-3.8.2.bundle.js` | **新增**，787,218 字节，esbuild 打包的自包含 IIFE（`@cloudbase/js-sdk@3.8.2` + 全部 10 个依赖） | `c2cbc0e` |
| `index.html` | 在 `cloud-sync.js` 之前注入 bundle `<script>`（CRLF 保留）；jsdelivr 注释更新 | `c2cbc0e` |
| `cloud-sms-test.html` | 头部内联 module（jsdelivr import）→ 本地 bundle 标签；`cloud-sync.js?v=358→359` | `c2cbc0e` |
| `cloud-diag.html` | 同上（**未提交**，见 §5-3） | — |
| `cloud-sync.js` | `cloudInit()` 重写：SDK 未就绪时 250ms 轮询最多等 10s，再判 `sdk_not_loaded`（修复「首调碰上 SDK 未就绪 ⇒ 永久失败直到刷新」） | 未提交（被 gitignore） |
| `AGENT_HANDOFF.md` | 缺陷表 #1/#2/#3 标已修复；进度节更新；新增 gitignore 发布阻塞项一节 | `c2cbc0e` + `bbafe2a` |
| `_sdk_verify.html` | **新增** SDK 冒烟页（被 `_*.html` gitignore 挡住，仅本地用） | — |
| `runye-member-ui.js` | **未改**（其 jsdelivr import 降级为 bundle 404 时的兜底，保留是刻意的） | — |

两个本地 commit：`c2cbc0e`（代码+文档）、`bbafe2a`（交接文档补充）。**均未 push**（发布纪律：等用户下令）。

## 2. 为什么这么改（根因链）

1. 上次用户实测 `cloud-sms-test.html` 报 `sdk_not_loaded` → 用户浏览器取不到 `cdn.jsdelivr.net`。
2. SDK 根 `dist/` 只有 `index.cjs.js` / `index.esm.js`，**没有 UMD**；`+esm` 和 `dist/index.esm.js`
   都非自包含（前者内部继续拉 `/npm/@cloudbase/adapter-interface@0.7.1/+esm`，后者外置 8 个依赖）
   ⇒ 「下载一个 js 放本地」不成立，必须打包。
3. esbuild 安装两个坑（都踩过）：
   - postinstall 会 spawn `22.22.2-6` 版 node 报 **EBUSY** ⇒ 必须 `npm install --ignore-scripts`；
   - 不写进 package.json 的包会被下一次 `npm install` 当多余包**清掉**（第一版产物就是这么消失的）
     ⇒ 必须 `npm install esbuild@0.28.2 @cloudbase/js-sdk@3.8.2 ...` 一次装齐并记入 package.json。
4. 打包入口 `_ry_sdk_entry.mjs`（位于 `C:/Users/AHS/.workbuddy/binaries/node/workspace/`）：
   `import cloudbase from '@cloudbase/js-sdk'` → 挂 `window.cloudbase` → 派发 `cloudbase-ready`，
   与原先 `<script type="module">` 行为完全对齐，`cloud-sync.js` / `runye-member-ui.js` 零改动兼容。

## 3. 验证复现（审核 agent 请逐条跑）

```bash
# 环境：node 用 C:/Users/AHS/.workbuddy/binaries/node/versions/22.12.0/node.exe
#       python 用 C:/Users/AHS/.workbuddy/binaries/python/versions/3.13.12/python.exe

# ① 项目 QA 闸门（预期：42 项全部通过，exit 0）
cd C:/Users/AHS/runye-irrigation && node verify_ry_tool.js; echo EXIT=$?

# ② 起本地服务（安全来源白名单认 localhost:8080 这个名字）
python -m http.server 8080 --bind 127.0.0.1   # 在 C:/Users/AHS/runye-irrigation 下

# ③ 三页面复测（预期：三行 [PASS]，jsdelivr=0，anon=true 带 uid，最后 RESULT: PASS）
node C:/Users/AHS/Doubao/chats/2026-10-10/new-chat-1/_verify_pages.cjs

# ④ bundle 冒烟 + 云函数裸调探针（预期：R1 四项 true；R2/R3 均 THREW EXCEED_AUTHORITY，RESULT: PASS）
node C:/Users/AHS/Doubao/chats/2026-10-10/new-chat-1/_verify_sdk_bundle.cjs "http://127.0.0.1:8080/_sdk_verify.html"

# ⑤ bundle 自包含静态复核（注意：grep 'from"' 会命中字符串字面量属正常误报，
#    关键是裸 import 语句/动态 import 必须为 0）
grep -c '^import\|import("' C:/Users/AHS/runye-irrigation/pwa/vendor/cloudbase-js-sdk-3.8.2.bundle.js

# ⑥ 人工路径：浏览器开 http://localhost:8080/cloud-sms-test.html → 手机号 → 发码 → 登录 → 自动调云函数
```

无头脚本用 puppeteer-core + Edge（`C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`，headless）。

## 4. 备份与回滚

- 改前备份：`C:/Users/AHS/runye-irrigation/_backup_20261010_sdkbundle/`（5 个文件原样拷贝）。
- 回滚代码：`git revert c2cbc0e bbafe2a`（或直接用备份目录覆盖 4 个文件后 `git checkout` index.html）。
- 回滚后效果：回到「依赖 jsdelivr 动态 import」的原状，不会更糟。

## 5. 主动列出的怀疑点（欢迎审核推翻）

1. **Publishable Key 随 `cloud-sync.js` 入库是否可接受？**
   我的判断：它是「前端可见、anonymous 权限」的 Publishable Key，公开是设计意图，无风险。
   但 `.gitignore` 当初把它挡住（注释写「云端诊断/CloudBase 本地文件」），可能历史上有别的顾虑 —— **审核请确认**。
2. **bundle 真的自包含吗？** 静态复核 + 无头实测双证据；但仍请审核用 ⑤ 的 grep 再验一遍，
   并在断网环境开一次 `index.html`（DevTools Network 应无任何外部请求，SDK 正常挂载）。
3. **gitignore 我没有改**（`cloud-sync.js` / `cloud-diag.html` 仍被忽略，未提交）—— 这是发布相关决策，
   我只把「必做清单」写进 AGENT_HANDOFF.md §4。审核请确认这个克制是对的，还是应该当场改掉。
4. **`cloudInit()` 重写的行为面**：从「同步判 sdk、立即失败」变成「最多等 10s 异步失败」。
   所有调用方本来就拿到 Promise，理论无破坏；闸门 42 项全过。但 10s 上限是否合适、
   轮询是否该换成 `cloudbase-ready` 事件监听（更优雅），欢迎提意见。
5. **sw.js 未 bump VERSION**：理由是 fetch handler 是 network-first（在线永远走服务器，注释原话
   "Online always uses the server so subsequent releases cannot get stuck on old UI"），本次也没往
   CORE 里加文件。审核请确认这个理解无误（重点看 sw.js 的 `local()` 与 `save()`）。
6. **版本号策略**：`?v=359` 只加在内容有变的文件（index.html 内 cloud-sync.js 引用、cloud-sms-test/
   cloud-diag 的 cloud-sync 引用）；`runye-entitle.js`、`runye-member-ui.js` 无内容变化保持 358。混版本是否有坑？
7. **`_sdk_verify.html` 留在项目根**（gitignored）：留作 SDK 冒烟页还是删掉？我倾向留（与 cloud-diag.html 定位互补）。
8. **「匿名被拦与代码无关」结论的时效性**：本轮 R2/R3 裸调再次证实（真实函数与不存在函数同报
   `EXCEED_AUTHORITY`、网关 403）。若审核时平台策略变了，此结论需重新定性（判别方法见 AGENT_HANDOFF §7）。
9. **审核范围边界**：会员业务逻辑本身（`runye-entitle.js`、权益计算、邀请码）本轮**一行没动**，不在本次审核范围。

## 6. 遗留问题与待用户拍板（详见 AGENT_HANDOFF.md §2 Q1–Q5）

- **最高优先**：用户跑 `http://localhost:8080/cloud-sms-test.html` 手机号实测（SDK 卡点已清，这次不会再挂 sdk_not_loaded）。
  附带验证：① 新手机号自动注册 ② 同号二次登录 uid 不变、到期日不重置。
- 发布阻塞项：`.gitignore` 移出 `cloud-sync.js` + `git add` 会员三件套（AGENT_HANDOFF §4 有完整清单）。
- 架构是否迁移（GitHub Pages + Vercel + CloudBase 三处分散 → 收拢腾讯云）：用户说「再商量」。
- 其余：两个生产域名加安全来源白名单、AI 接口 `self_register:true` 额度风险、`INVITE_PAGE` 回填等。

## 7. 本轮踩坑记录（对下个 agent 有用）

- **探针 harness 空转**：`waitForFunction` 轮询里用闭包置 `done` —— 每次轮询重建闭包，恒 false。
  正确姿势：页面把结果写**普通对象**，探针等变量出现。
- **换行判据**：`count(b'\r\n') > count(b'\n')` 对纯 CRLF 文件恒假（两计数相等）⇒ 必须用 `b'\r\n' in raw`。
  本轮实证：`index.html` 是 CRLF（旧笔记误记为 LF，以 repr 为准）。
- **`CloudSync.callFn` 吞错误**：catch 后置 `_cloudLastError` 并返回 null —— 判「成功还是被拦」必须裸调
  `callFunction` 抓原始 `err.code`，且 `_cloudLastError` 要在调用**之后**读。
- **curl 打 localhost 被沙箱代理拦成 502**：加 `--noproxy '*'`；后台服务用 `run_in_background` 起才不会被回收。
