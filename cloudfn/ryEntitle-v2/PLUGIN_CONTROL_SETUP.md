# 全站插件控制部署说明

管理后台页面为仓库根目录的 `plugin-admin.html`。全站配置使用现有 `ry_kv` 表，记录主键为 `global:plugin-control`，无需新增表或开放浏览器端写权限。插件开关写操作只由 `ryEntitle` 云函数服务端执行。

部署新版函数前，在 CloudBase 的 `ryEntitle` 云函数环境变量中新增：

```text
RY_PLUGIN_ADMIN_UIDS=2089630534341758976
```

该 UID 来自你提供的 CloudBase 用户列表截图中 administrator 账号的用户 ID。不要填写手机号，也不要把 UID 白名单放入网页。未配置时所有账号只能读取状态，不能保存开关。部署后，先在主程序完成手机号登录，再访问 `plugin-admin.html`。后台显示“管理员权限已验证”后才能写入设置。

接口 action：`pluginsGet` 返回全局插件开关（可匿名只读）；`pluginsSet` 要求有效登录 JWT 且 UID 命中上述白名单。启用状态在主程序下一次加载插件时生效；已经打开的页面需要刷新。读取服务不可用时主程序 fail-open，继续加载插件，避免控制服务故障影响原工具。

部署包应包含本目录的 `index.js` 与 `package.json`。部署完成后还需把静态站点改动发布到 GitHub Pages；本次工作没有执行任何线上部署。
