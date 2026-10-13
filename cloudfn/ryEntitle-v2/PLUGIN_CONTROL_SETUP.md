# 全站插件控制部署说明

管理后台页面为仓库根目录的 `plugin-admin.html`。全站配置使用现有 `ry_kv` 表，记录主键为 `global:plugin-control`，无需新增表或开放浏览器端写权限。插件开关写操作只由 `ryEntitle` 云函数服务端执行。

部署新版函数前，在 CloudBase 的 `ryEntitle` 云函数环境变量中新增：

```text
RY_PLUGIN_ADMIN_UIDS=2089630534341758976
```

该 UID 来自你提供的 CloudBase 用户列表截图中 administrator 账号的用户 ID。不要填写手机号，也不要把 UID 白名单放入网页。未配置时所有账号只能读取状态，不能保存开关。部署后，先在主程序完成手机号登录，再访问 `plugin-admin.html`。后台显示“管理员权限已验证”后才能写入设置。

接口 action：`pluginsGet` 返回全局插件开关（可匿名只读）；`pluginsSet` 要求有效登录 JWT 且 UID 命中上述白名单。启用状态在主程序下一次加载插件时生效；已经打开的页面需要刷新。读取服务不可用时主程序 fail-open，继续加载插件，避免控制服务故障影响原工具。

部署包应包含本目录的 `index.js` 与 `package.json`。部署完成后还需把静态站点改动发布到 GitHub Pages；本次工作没有执行任何线上部署。

## [v2c 2026-10-13] 会员管理 + 规则参数（统一管理后台）

`plugin-admin.html` 已扩展为三页签：外挂插件 / 会员管理 / 规则参数。管理员鉴权复用 `RY_PLUGIN_ADMIN_UIDS`，无需新增环境变量。

新增 action（`ryEntitle` 云函数）：
- `configGet`：读取全局会员规则（免登录可读；无配置时回内置默认，fail-open）
- `configSet`：保存规则（管理员）→ 存 `ry_kv` 主键 `global:member-config`
- `adminMembers`：按手机号/UID 搜索会员，或列出最近到期前 50（管理员）
- `adminMemberGrant`：加天数（自较晚到期时间顺延）/ 设绝对到期日 / 调整 L1↔L2 等级（管理员）；全部写入 `ry_entitle.history`（src=admin，可追溯）

前端联动：`runye-entitle.js` 启动即调 `configGet`，成功则用云端 `trialDays / plans{name,days,features}` 覆盖内置默认并重渲染权益 UI；失败静默沿用默认。规则变更对用户在**下次打开/刷新页面**后生效。

部署步骤：
1. CloudBase 控制台 → 云函数 `ryEntitle` → 上传 `cloudfn/ryEntitle-v2c-admin.zip`（含 index.js + package.json）→ 部署。
2. 确认环境变量 `RY_PLUGIN_ADMIN_UIDS` 仍含管理员 UID（与插件开关共用）。
3. 静态站点（plugin-admin.html / runye-entitle.js / index.html / sw.js）随 GitHub Pages 发布即可；云函数未部署前，后台会员/规则页签会显示「未知 action」提示，主程序判定不受影响。
