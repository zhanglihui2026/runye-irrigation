# 润野灌溉 · Vercel 后端 API 对接 DeepSeek（v256）

> 状态：**代码已就绪，尚未部署**（等你下令才推 GitHub / 连 Vercel）。
> 网页端依旧**不持有任何密钥**，密钥只存在 Vercel 的环境变量里。

---

## 一、交付清单

| 文件 | 作用 |
|---|---|
| `api/ai-irrigation.js` | Vercel Serverless 接口（Node 运行时、零第三方依赖）。接收地块与需求 → 调 DeepSeek(`deepseek-reasoner`, temperature 0.1) → 校验 JSON → 返回 |
| `vercel.json` | 函数超时上限设为 300 s（推理模型比 chat 慢，留足时间） |
| `runye-ai-plan.js` / `.css` | 前端面板：新增【在线生成】，解析 `{code,msg,data}` 后走既有 `parse → validate → apply → calcPlan()` 通道，**绘图引擎一行未动** |
| `_p1/_v256_ai_irrigation_test.cjs` | 接口契约测试（45 条） |
| `_p1/_v256_online_btn.cjs` | 前端端到端测试（真实无头 Edge，云端用 stub，不花 token，16 条） |

请求链路：

```
GitHub Pages（https://zhanglihui2026.github.io/runye-irrigation/）
   │ POST {user_id, polygon, area, slope, user_text}
   ▼
Vercel 函数 /api/ai-irrigation  ──读 DEEPSEEK_API_KEY──▶ DeepSeek API
   │ 返回 {code:0, msg:"ok", data:"<JSON 字符串>", quota_left:4}
   ▼
前端解析 → 写入现有输入框 → calcPlan() 出图
```

---

## 二、接口约定

**入参**（`POST`，`Content-Type: application/json`）

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `user_id` | string | ✅ | 浏览器本地生成的匿名标识，只用于数次数 |
| `polygon` | array | ✅ | 地块顶点 `[{x,y}, ...]`，平面相对坐标，单位 m |
| `area` | number | | 地块面积 m² |
| `slope` | number | | 坡度 %（可为空） |
| `user_text` | string | | 用户填写的灌溉需求（提示词里标为最高优先级） |

**出参**

```json
// 成功
{ "code": 0, "msg": "ok", "data": "{\"version\":1,\"design\":{...}}", "quota_left": 4,
  "model": "deepseek-reasoner", "elapsed_ms": 12345 }

// 失败
{ "code": 422, "msg": "大模型返回的内容不是合法 JSON，已拒绝（本次不扣次数）：…", "data": null, "quota_left": 5 }
```

**错误码**

| code | 含义 | 是否扣次数 |
|---|---|---|
| 0 | 成功 | 扣 1（剩 5 次额度递减） |
| 400 | 参数缺失或格式不对（缺 user_id / polygon 非数组 / area 非数字…） | 否 |
| 403 | 来源域名不在白名单 | 否 |
| 405 | 不是 POST | 否 |
| 413 | 请求体过大（>256 KB，地块顶点过多） | 否 |
| 422 | **大模型返回内容不是合法 JSON**（会把原文片段回传便于排查） | 否 |
| 429 | 次数已用完（测试期每人 5 次）或上游限流 | 否 |
| 500 | 服务端未配置 `DEEPSEEK_API_KEY` | 否 |
| 502 | 上游调用失败 / 返回结构异常（含余额不足、密钥无效、断网） | 否 |
| 504 | 调用 DeepSeek 超时（默认 150 s） | 否 |

原则：**用户没拿到可用方案，就绝不扣次数**；次数耗尽时连上游都不调。

---

## 三、部署步骤（一次性，约 5 分钟）

### 1）把代码推到 GitHub（本地还没提交，等你说"提交/推送"我再执行）

本轮涉及：`api/ai-irrigation.js`、`vercel.json`、`runye-ai-plan.js`、`runye-ai-plan.css`、`index.html`、`sw.js`。

### 2）Vercel 绑定 GitHub 仓库

1. 打开 <https://vercel.com> → 右上角 **Log In** → 选 **Continue with GitHub**，用 `zhanglihui2026` 授权。
2. 进 Dashboard → 右上 **Add New ▾ → Project**（旧版界面叫 **New Project / Import Project**）。
3. 在 `Import Git Repository` 列表里找到 **`zhanglihui2026/runye-irrigation`** → 点 **Import**。
   - 列表里没有就先点 **Adjust GitHub App Permissions**，把该仓库勾给 Vercel。
4. **Framework Preset** 选 **Other**（或保持默认）；
   **Build Command 与 Output Directory 都留空**（纯静态 + `api/` 目录，Vercel 会自动把 `api/*.js` 变成函数）。
5. **先不要急着配环境变量**，直接 **Deploy**。第一次部署完访问 `/api/ai-irrigation` 会返回 `code:500`（提示未配置密钥），这是正常的。

### 3）添加环境变量

1. 进该项目 → 顶部 **Settings** → 左侧 **Environment Variables**。
2. 逐条添加（Key / Value 都别带空格，勾选 Production + Preview + Development）：

   | Key | Value | 必填 |
   |---|---|---|
   | `DEEPSEEK_API_KEY` | `sk-……`（DeepSeek 平台申请） | ✅ |

   可选（都有默认值，不填也能跑）：

   | Key | 默认 | 说明 |
   |---|---|---|
   | `AI_UPSTREAM_TIMEOUT_MS` | `150000` | 调 DeepSeek 的超时（毫秒），函数上限 300 s |
   | `AI_MAX_BODY_BYTES` | `262144` | 请求体上限 |

3. **改完环境变量必须重新部署才生效**：**Deployments → 右上角 ⋯ → Redeploy**（或再 push 一次代码自动部署）。

### 4）拿到域名并告诉前端

部署成功后 Vercel 会给一个域名，形如 **`https://runye-irrigation.vercel.app`**（如果你的项目名带后缀，以实际为准）。
接口完整地址就是 `https://<你的域名>/api/ai-irrigation`。

- 临时/个人使用：在网页二级管路页右上角 AI 面板底部的「接口」输入框里填这个地址（会存浏览器 localStorage）。
- 想让所有人默认都走它：告诉我实际域名，我改 `runye-ai-plan.js` 里的 `DEFAULT_API` 常量并升版本号。

### 5）自检

浏览器直接打开 `https://<你的域名>/api/ai-irrigation`，应看到：

```json
{"code":0,"msg":"ok","data":null,"service":"runye-ai-irrigation",
 "model":"deepseek-reasoner","temperature":0.1,"key_configured":true,
 "free_limit":5,"quota_store":"memory（进程内存，冷启动会重置）"}
```

`key_configured: true` 就说明密钥读到了。然后在网页上画一块地、填需求、点【在线生成】。

> Vercel 控制台偶尔改版，若上面哪一步的菜单位置对不上，**截个图给我**，我按你看到的界面重新给路径。

---

## 四、CORS 与前端地址

- 接口只放行 `https://zhanglihui2026.github.io`（预检 OPTIONS 也处理了）；
  没有 Origin 的请求（curl、服务端直连）放行，方便你自己用命令行自测。
- 若以后换域名，改 `api/ai-irrigation.js` 顶部的 `ALLOWED_ORIGIN` 常量即可。

---

## 五、注意事项

1. **测试期次数是写死的每人 5 次，记在进程内存里。** Serverless 冷启动 / 多实例会重置，
   所以线上可能出现"用完了又变回 5 次"。后期接数据库时，只须把文件里的
   `readUsed()` / `incrUsed()` 两个函数换成数据库读写，其余逻辑一行不用改。
2. **`deepseek-reasoner` 比 `deepseek-chat` 慢很多**（先推理再输出，常见 30~120 s）。
   函数超时设了 300 s、上游超时 150 s、前端等待上限 180 s。网页上会显示"生成中…"，别重复点击。
3. **密钥安全**：代码里没有、也不会有 `sk-`；测试脚本里有一条断言专门扫源码，出现 `sk-` 会直接失败。
   ⚠️ 上一轮调试时有一把旧密钥 `sk-f0143d…` 在聊天里明文出现过，**建议到 DeepSeek 平台作废重签**，
   新密钥只填进 Vercel 环境变量（本地 `_ai/.apikey` 若还要用，同步更新；该目录已被 `.gitignore` 忽略，不会进仓库）。
4. **前端改动没有触碰绘图引擎**：在线生成与原来的"导入 JSON"走的是同一条
   `parse → validate → apply → calcPlan()` 通道，离线流程（导出文本 → 本地脚本 → 导入JSON）完整保留作回退。

---

## 六、本地怎么验（不联网、不花 token）

```bash
node _p1/_v256_ai_irrigation_test.cjs    # 接口契约 45 条
node _p1/_v256_online_btn.cjs            # 前端端到端 16 条（真实无头 Edge）
```

两个都必须以退出码 0 结束。
