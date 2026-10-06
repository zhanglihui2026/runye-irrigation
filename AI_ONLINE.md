# AI 规划修复版部署说明（2026-10-06）

代码已完成本机修复，尚未发布。前端仍可部署于 GitHub Pages，后端部署于 Vercel。

## 保留每用户5次

额度绑定服务端配置的用户编号，不再信任浏览器传入的 user_id。线上使用 Redis 原子预占与提交，没有自动过期或冷启动重置；成功方案扣一次，上游失败或参数校验失败归还预占。并发中的请求占用可用额度，任何时候成功数加处理中请求不超过5。

每个用户领取一个随机访问码，在 AI 面板填写；访问码通过 Authorization 请求头提交，前端不持有模型密钥。访问码仅留在当前页面内存，不写入 localStorage。管理员轮换访问码时必须保持相同用户编号；用户不能通过更换浏览器标识获得新额度。访问码不要多人共享。

## Vercel 环境变量

- `DEEPSEEK_API_KEY`：实际模型密钥，仅保存在服务器。
- `AI_MODEL`：默认 `deepseek-flash`，可按供应商当前支持的模型配置。
- `AI_ACCESS_TOKENS`：JSON对象，键为随机访问码，值为稳定用户编号。每个码建议用 `crypto.randomBytes(32).toString('hex')` 生成，不要使用姓名或简单数字。轮换码保留原编号；不要给同一用户重复建新编号。
- `UPSTASH_REDIS_REST_URL`、`UPSTASH_REDIS_REST_TOKEN`：持久 Redis REST 连接配置。
- `AI_UPSTREAM_TIMEOUT_MS`：可选，默认150000。

访问码配置、Redis配置或计数服务不可用时不继续调用模型。配置完成后重新部署，并做真实模型联通测试。本机测试用的是模拟模型，不消耗付费额度。

GET `/api/ai-irrigation` 可检查配置状态，不显示密钥。GitHub Pages的前端来源白名单不变，CORS增加Authorization预检支持。

## 额度异常处理

进程异常退出或计数请求结果不确定时，保留预占，防止重试超发。管理员需要结合Vercel调用记录核对Redis哈希中的pending及r:请求编号，确认请求已结束和实际成功情况后人工处理；没有自动清空计数或重置额度的按钮。

`NODE_ENV=test` 且 `AI_QUOTA_TEST_MODE=1` 仅允许本地测试使用内存替身；当存在 `VERCEL` 环境标志时该模式强制禁用。

## 规划流程

在线生成或导入JSON → 展示待应用参数 → 核对地块/参数指纹 → 用户确认重建 → 原有引擎生成管路及水力复算 → 可撤销本次应用。现有手工管路重建会明确提示；不会在模型返回时直接覆盖图纸。

锁定提升高度、高差、水源距离及入口压力。模型备注明确为未作工程复算的建议；主管、支管、分区和泵扬程显示引擎结果。失败时恢复原参数与管路。

## 回归

- `node --test tests/ai_online_guard.test.cjs tests/ai_plan.test.cjs tests/desktop_new_features.test.cjs tests/terrain.test.cjs tests/group_planning.test.cjs`
- `node ci_check_static.cjs`
- 工作台 `ai-audit-20261006/fix-browser.cjs`：模拟在线结果的真实页面交互。

旧 `_p1/_v256_*` 探针绑定匿名身份、旧模型和直接自动应用行为，不再代表本次接口契约，请使用上述回归。
