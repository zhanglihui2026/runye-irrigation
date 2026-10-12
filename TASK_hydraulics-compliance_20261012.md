# TASK_hydraulics-compliance_20261012 —— 水力合规校验（层 2）+ 现场数据接口预留（层 3）

> 执行者：Agent C（水力内核侧），与 Agent D（data-service）接口对齐
> 决策依据（用户已确认）：**主攻滴灌/微灌用户，喷灌场景为辅**；层 2 合规校验先行，层 3 实测闭环二期接上，本期只预留现场设备（压力表读数）数据接口。
> 关联契约：`RYPLOT_SCHEMA.md`（L4 flow 层）、`TASK_ryplot-interface_20261012.md`（data-service 接口，若未完成则本任务只定义产出、由 D 侧对接）

---

## 0. 一句话目标

在现有水力内核**之上加一层**「国标合规校验」：输入现有计算结果（computeThreeLevel 的 r 对象 / tlDiagramData），逐条对照微灌与喷灌国标判据，输出合规报告（合格/预警/不合格 + 修改建议）；同时为现场压力表实测数据预留标准接口（schema + 存取签名），二期接闭环。

## 1. 判据基准（已核实来源，直接引用）

| 标准 | 判据 | 适用 |
|---|---|---|
| GB/T 50485-2020 微灌工程技术标准 | 灌水器设计流量偏差率 qv ≤ [qv]（允许值）；灌水器制造偏差系数 CV ≤ 0.07；设计工作水头差率 hv 按式(4.0.7-2) | 滴灌/微灌（主） |
| GB/T 50085-2007 喷灌工程技术规范 | ①任何喷头实际工作压力 ≥ 设计压力的 90%；②同一条支管上任意两个喷头工作压力差 ≤ 设计压力的 20%；③喷灌均匀系数 CU ≥ 75% | 喷灌（辅） |
| NY/T 4368-2023 水肥一体化设计规范 | 各轮灌组设计流量偏差率 ≤ 30%；一个灌水小区内灌水器设计允许流量偏差率 ≤ 20% | 轮灌组（滴灌场景同样适用） |

来源：住建部/水利部公开标准文本（GB/T 50485-2020、GB/T 50085-2007 官方 PDF、NY/T 4368-2023）。

## 2. 改什么（精确到文件）

| 文件 | 动作 |
|---|---|
| `hydraulic-calc/compliance-check.js` | **新建**：合规校验核心（纯计算、零 DOM、可 Node 单测，挂 `window.RyComplianceCheck`，同时 `module.exports`） |
| `hydraulic-calc/hydraulic-calc.js` | 在现有界面增加「合规检查」结果区（懒挂载区块内追加渲染函数），调用 compliance-check |
| `RYPLOT_SCHEMA.md` | L4 flow 层追加 `compliance` 子字段（见 §4），供 data-service 后续挂载 |
| `core/data-service.js` | **只加签名占位不实现**（见 §5）：`saveFieldReadings` / `readFieldReadings`（二期实现闭环；本期防其他 agent 占用命名） |

**禁止改动**：`hc-core.js`（计算口径零改动）、`design-core.js`、`pipe-path-loss.js`、三级管网 inline-09/27、回传逻辑。

## 3. compliance-check.js 接口设计

```js
/* 输入：现有三级管网计算结果 + 灌水器/喷头参数（缺参返回 null，不臆造） */
window.RyComplianceCheck.check({
  r: {                 // computeThreeLevel() 返回值（r.zoneFlow/branchFlow/combinedFlow/frontPipe/mainPipe/branchPipe 等）
    zoneFlow, branchFlow, combinedFlow, zoneCount, branchCount,
    frontPipe:{od,len}, mainPipe:{od,len}, branchPipe:{od,len}
  },
  emitter: {           // 灌水器参数（微灌主判据用；缺省 = 不检微灌项）
    designFlow: 2,     // 灌水器设计流量 L/h
    flowIndex: 0.5,    // 流态指数 x（滴灌常用 0.4-0.6）
    cv: 0.05,          // 制造偏差系数（判据 ≤0.07）
    qvAllow: null      // 允许流量偏差率 [qv]，null=按规范默认（滴灌 10%）
  },
  sprinkler: {         // 喷头参数（喷灌判据用；缺省 = 不检喷灌项）
    designPressure: 20, // 设计工作压力 m
    headPressures: [],  // 同支管各喷头实际工作压力 m（≥2 个才检压差）
    cu: null            // 均匀系数 CU（null=调用 design-core christiansen 估算）
  },
  groups: {            // 轮灌组（NY/T 4368 判据；缺省 = 不检）
    flows: [8.2, 8.5, 9.1]   // 各轮灌组设计流量 m³/h
  }
}) → {
  standard: 'GB/T 50485-2020 / GB/T 50085-2007 / NY/T 4368-2023',
  checks: [
    {
      id: 'mv-qv', clause: 'GB/T 50485-2020 4.0.7/5.2.3',
      item: '灌水器流量偏差率 qv',
      actual: 7.4, unit: '%', limit: '≤10',
      status: 'pass' | 'warn' | 'fail',   // pass=合格 warn=接近限值(≥80%限值) fail=不合格
      suggestion: '增大支管管径可降低流量偏差'   // fail/warn 时给出，pass 时为 null
    },
    /* 每条判据一条：mv-cv（制造偏差）、mv-hv（水头差率）、sp-pressure（喷头≥90%）、
       sp-diff（同支管压差≤20%）、sp-cu（CU≥75%）、grp-dev（轮灌组偏差≤30%）、
       grp-emit（小区内偏差≤20%） */
  ],
  summary: { pass: 4, warn: 1, fail: 0 },
  computedAt: 'ISO'
}
```

实现要点：
- **纯函数**：只读入参，不改任何全局、不写 tlDiagramData；缺参项直接不检（status 不含该项），绝不臆造默认值
- qv 计算式（规范 4.0.7）：qv = hv × x（x=流态指数）；hv = (hmax − hmin) / hd × 100；hmax/hmin 由最不利路径与最有利路径水头差推算（用 r 的 front/main/branch 损失 + 地形差）
- 喷头 90% / 压差 20%：直接用 `headPressures` 数组算；缺数组则不检（不反推）
- CU：优先入参，缺省调 `window.RyDesignCore.christiansen` 或内置同式（1/2.852 + 1/(2N) + √0.852/(6N²)）
- 阈值可覆盖：每个 check 允许入参 `overrides: { 'mv-qv': { limit: 12 } }`（用户自定义地区/企业标准）
- 返回结构稳定，UI 直接渲染表格；所有数字四舍五入保留 1-2 位

## 4. RYPLOT_SCHEMA L4 追加字段（写入契约）

```js
flow: {
  // ...既有 model/pump/segments/economy...
  compliance: {                 // 本期由 compliance-check 产出，data-service getPlotContext 透传
    standard: 'GB/T 50485-2020 / GB/T 50085-2007 / NY/T 4368-2023',
    checks: [ /* §3 的 checks 数组 */ ],
    summary: { pass, warn, fail },
    checkedAt: 'ISO'
  }
}
```

## 5. 层 3 现场设备接口（本期只预留签名，不实现）

在 `core/data-service.js` **追加签名占位**（含 JSDoc 注释说明二期语义，函数体 `return Promise.resolve(null)` 或抛「not-implemented-yet」明确标记，禁止静默假实现）：

```js
/* 二期实现：保存现场压力表/流量计实测读数（压力表读数接口预留）
   readings: { plotId, ts, points:[{label, pressureBar|pressureM, flow}] , device:'pressure-gauge'|'flow-meter'|'manual', note }
   用途：反推实际 C 值（invertHazenC 已有）→ 带标签存案例库 → 新设计用实测参数 */
saveFieldReadings(readings) → Promise<{ ok:boolean, id?:string }>
readFieldReadings(plotId) → Promise<Array|null>
```

★ 本任务**不做**闭环：不写案例库、不接 invertHazenC、不改设计流程。只占命名 + 定义 schema，防止二期前命名被其他模块占用。

## 6. 验收标准（全绿才算完成）

1. **单元自测**：新建 `hydraulic-calc/compliance-check.test.cjs`（Node 直跑）验证：
   - 构造已知合格数据 → 全部 `pass`
   - 构造超限数据（流量偏差 15%、压差 30%）→ 对应 check `fail` + suggestion 非空
   - 缺 emitter/sprinkler/groups → 对应项不出现（不报错、不臆造）
   - `overrides` 改阈值生效
   - 纯函数：调用前后 `tlDiagramData` 深比较不变
2. **闸门**：`_gate_plugins.cjs` + `_smoke_plugins.cjs` + `verify_nav_compact.js` 全绿
3. **契约一致**：RYPLOT_SCHEMA.md L4 已含 compliance 字段；data-service 已含两个签名占位
4. `git diff --stat` 只含：compliance-check.js（新）、compliance-check.test.cjs（新）、hydraulic-calc.js、RYPLOT_SCHEMA.md、core/data-service.js

## 7. 红线

- **hc-core.js / design-core.js / pipe-path-loss.js 零改动**（口径唯一性由 C37 守护）
- 不写任何第二套公式；qv/hv/压差判据按 §1 标准条款实现，常数与式子在代码注释中写明出处
- 不接云函数；现场数据接口只留签名，不实现存储
- 不 commit / 不 push / 不发布（沿用 AGENT_HANDOFF 纪律）
- 测试脚本用完清理或置入一次性位置，不留垃圾

## 8. 完成动作

1. 全部验收通过后汇报：接口签名确认 + 自测结果 + `git diff --stat`
2. 说明哪些判据项在真实地块数据上验证过（用现有 tlDiagramData 实测一条路径）
3. 二期（实测闭环）待用户另行派单，本任务**不越界**推进
