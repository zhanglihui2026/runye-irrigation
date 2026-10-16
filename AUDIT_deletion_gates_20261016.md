# 门禁相关删除项 · 只读核查报告

日期：2026-10-16 15:45 · 基线：HEAD（工作树未提交，`git status` 共 171 项变更，其中 `D`（未暂存删除）86 项，`?? feature-archive/`（整目录未跟踪）。
约束：只读。未改代码、未恢复/删除文件、未运行测试、未提交。仅按用户点名范围：`runye-ai-chat-test.html`、`runye-test-panel.html`、`_p1/*.cjs`、移入 feature-archive 的轴测图/3D 文件。

---

## 0. 总体事实（实测）

- 所有被点名的删除项在 **HEAD 均有跟踪**（`git ls-tree` 确认：`_p1/` 恰 52 个 .cjs、两个测试 html 均在）；工作树状态全部为**未暂存删除**（` D`）——**git 历史可完整恢复，无不可逆损失**。
- `feature-archive/`（未跟踪新目录）含两个归档包：`三维与轴测图/`（33 文件 manifest + SHA-256 + README）与 `二级简图/`（仅 README，无文件副本——其 README 明言实现保留原位、只做入口保护，与本次删除清单无对应关系）。
- CI（`.github/workflows/ci.yml`）：跑 `scripts/check.cjs` = ① 语法（`git ls-files --cached --others` 枚举 + `node --check`）+ ② `ci_check_static.cjs` 静态契约 + ③ `tests/plot_merge.smoke.cjs`（若在）。ci.yml 头注释**明确排除** `_p1/*` 探针与 verify_*.js（后者被 .gitignore:28 排除，CI 上不存在）。
- **横切影响（非删除项本身，但直接由删除引起）**：
  - `scripts/check.cjs` 语法检查按 `git ls-files --cached` 枚举，**未暂存删除的路径仍在索引里** → 会对 86 项中被枚举的 JS/CJS（52×_p1 + iso-diagram×5 + inline-26 + plugins/iso-view/main.js + runye-pipe3d.js 等）执行 `node --check` → ENOENT 必红 → **推送即 CI 红**（`项目定位与任务清单.md:51` 已记录同一判断）。
  - `verify_ry_tool.js`（本地门禁，.gitignore）运行时 `readFileSync` 已删除的 `iso-diagram/iso-diagram.js`（:547、:1197、:1577）与 `network-editor.css`（:941）→ **本地主闸门必崩**。
  - `ci.yml` 头注释引用 `node _p1/_spawnprobe.cjs`，但该文件在 HEAD 就未被跟踪——既有文档漂移，早于本次删除。

---

## 1. 有证据确认的项

### 1.1 轴测图/3D 整组（14 项 HEAD 跟踪删除）

`iso-diagram/{NETWORK_EDITOR.md, README.md, editor.js, iso-diagram.css, iso-diagram.js, network-editor.css, network-editor.js, network-model.js, product-catalog.js}`、`mod/inline-26.js`、`mod/style-02.css`、`plugins/iso-view/{main.js, manifest.json}`、`pwa/vendor/three.min.js`、`runye-pipe3d.js`

| 核查维度 | 证据 |
|---|---|
| HEAD 跟踪 | 全部在 `git ls-tree HEAD` |
| 工作树状态 | ` D`（未暂存删除） |
| 归档副本 | `feature-archive/三维与轴测图/source/` 逐文件在盘；manifest 33 项全部 SHA-256 自洽（盘上副本 == manifest 记录，逐项实测通过）。**6 项与 HEAD 逐字节一致**（NETWORK_EDITOR.md、editor.js、network-model.js、product-catalog.js、plugins/iso-view/main.js、three.min.js）；**7 项归档副本比 HEAD 新 28~3033 字节**（iso-diagram.js/.css、network-editor.css/.js、inline-26.js、style-02.css、runye-pipe3d.js）= 归档捕获的是剥离前**含未提交改动**的工作树版本；README 已说明 `source/`（Git 基线）与 `integration-snapshot/`（剥离前快照）两份的关系，但 manifest 未逐项标注对应关系 |
| 引用残留 | `plugins.json` 已无 `iso-view` 条目（仅 `sys-view`）→ 插件声明同步清理；`sw.js` CORE 数组无这些文件（three.min.js 按懒加载设计从未进 CORE，v415 changelog :88-89） |
| CI/SW 依赖 | CI 无功能依赖（check.cjs/ci_check_static.cjs 均无硬编码读取）；SW 无预缓存依赖。唯一后果=上节横切影响（未暂存删除导致 CI 语法红） |
| 文档佐证 | `feature-archive/三维与轴测图/README.md`：明确「从主程序运行链路中完整摘除…供以后按需恢复」「不要将此目录作为页面运行资源或 SW 预缓存资源」，含 5 步恢复指引（恢复 index.html 资源顺序、plugins.json、sw.js CORE/VERSION）→ **删除是有意的** |

小缺口（记录，不影响结论）：①`iso-diagram/README.md` 在归档磁盘上有逐字节等于 HEAD 的副本，但**未登记进 manifest files[]**；②manifest 未标注 7 个「比 HEAD 新」副本对应的基线。

### 1.2 门禁侧既成事实（非删除项，供决策）

- SW 预缓存为**原子安装**（sw.js:436-441 `cache.addAll`，注释明言「全部成功才 skipWaiting」）。
- `_p1/_gates.cjs`（HEAD:51）把 `verify_ry_tool.js` 列为「主闸门」子进程 → 本地批跑链 = `_gates.cjs` → `verify_ry_tool.js` → 读 iso-diagram（已删）→ 链断。
- `ci_check_static.cjs`（193 行）只读 index.html/sw.js/plugins.json/插件 manifest，**未校验 SW CORE 条目与磁盘文件的一致性** → SW 悬空预缓存不会被静态契约发现。

---

## 2. 归属不明的项（证据不足或互相矛盾）

### 2.1 runye-ai-chat-test.html

| 维度 | 事实 |
|---|---|
| HEAD / 工作树 | 已跟踪 / ` D` 未暂存 |
| 归档副本 | **无**（feature-archive 全树无副本、无 manifest 条目） |
| CI/SW 依赖 | **sw.js:375 仍在 CORE 预缓存数组** → 下次版本抬升时原子安装必失败（新 SW 永不接管，离线更新卡死） |
| 文档佐证 | **冲突**：`插件化与数据资产化实施方案.md:619,631` 与 `AGENT_HANDOFF.md:22` 仍把它列为 `runye_network_layout` 的三读方之一（未来 land.network 收编计划的参与者）；`index.html` 无任何引用。没有任何文档说明删除此文件是有意的 |

### 2.2 runye-test-panel.html

| 维度 | 事实 |
|---|---|
| HEAD / 工作树 | 已跟踪（v438 新增，sw.js:140-144 changelog 记录其创建+预缓存+iframe 壳）/ ` D` 未暂存 |
| 归档副本 | **无** |
| CI/SW 依赖 | **sw.js:418 仍在 CORE 预缓存** → 同上，原子安装必失败 |
| 文档佐证 | **矛盾**：`UI界面与控制面板地图.md:30` 记录「原为 runye-test-panel.html，已从产品导航和 iframe 壳移除；**样板文件保留**」——移除导航是有意的，但文档明言文件应保留；当前工作树连文件一起删了。`MAINTENANCE_BACKLOG_2026-10-14.md:42` 只涉及其历史样式变更归属。无文档支持「删除文件本身」 |

### 2.3 _p1/*.cjs（52 项整体）

| 维度 | 事实 |
|---|---|
| HEAD / 工作树 | 52 项全部已跟踪 / 全部 ` D` 未暂存 |
| 归档副本 | **无** |
| CI/SW 依赖 | CI 明确不跑它们（ci.yml 注释）；check.cjs 无硬编码路径；SW 无引用 → **无自动化依赖**。但 ci.yml 头注释与 ci_check_static.cjs:10 仍把 `_p1/_gates.cjs` 批跑描述为既有流程；verify_ry_tool.js 多处把「动态判据」登记到 `_p1/_v2xx_*_e2e.cjs`（:1287,:1331,:1370,:1407,:1445,:1474,:1522 等，纯注释引用）→ 删除后这些「动态那一半」证据链无着落 |
| 文档佐证 | `项目定位与任务清单.md:51`：**明确写有待决**——「不能盲目恢复或移除缓存项：先确认两个页面及 _p1/归档代码的删除归属」。即删除归属在文档层面就登记为未确认。单个探针文件名无法区分「一次性诊断脚本（v2xx 时代）」与「仍被门禁文档引用的批跑件（_gates.cjs、_spawnprobe 引用）」 |

### 2.4 同批删除、超出本次点名范围（仅登记，未深查）

`HANDOFF_v359_REVIEW.md`、`HANDOVER_20261012.md`、`REVIEW_v359_RESULT.md`、`TASK_*_20261012.md`×9、`UI改造交接指令.md`、`cloud-sms-test.html`、`peanut-tool.html`、`workbench.html`、`数字农业.html`。其中 workbench/数字农业 与 `_gate_plugins.cjs` C40「数字农业完全剥离」（2026-10-12 用户决定）方向一致，但本次未逐项取证，**不给出结论**。

---

## 3. 需要你确认的最小文件清单

以下 4 项证据不足或互相矛盾，其余删除项证据充分：

1. **runye-ai-chat-test.html** —— 删除是否与「land.network 收编规划」同步做出的决策？（SW CORE 悬空条目需随决策一并处理）
2. **runye-test-panel.html** —— 文档说「样板文件保留」，当前被删：以哪个为准？（同样涉及 SW CORE 悬空条目）
3. **_p1/*.cjs 52 项整体** —— 是否全部废弃？还是保留 `_gates.cjs`（或其替代流程）作为本地门禁入口？（ci.yml / ci_check_static.cjs / verify_ry_tool.js 的注释仍指向该链）
4. **iso-diagram/README.md** —— 归档盘上有副本但 manifest 未登记：补登 manifest，还是确认该副本即最终版？

另请知悉（不需确认的事实）：轴测/3D 组 7 个归档副本比 HEAD 新（含未提交改动），若将来按 manifest 恢复，恢复的是剥离前最新版而非 HEAD 基线；SW 预缓存是原子安装，两个悬空 html 条目未处理前**任何**版本抬升都会让 PWA 停留在旧 SW。
