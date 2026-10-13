# TASK_contour-dxf_20261012 —— 等高线 DXF 解析插件（CAD → 高程点 → 扬程）

> 执行者：Agent S（等高线解析专项）
> 用户诉求：CAD 里的等高线图能不能用软件识别出来 → 拿到等高线数据（高程点）→ 计算水泵扬程。
> 方案定调（用户已拍板路径 B）：写一个 **DXF 解析插件**——CAD 图纸另存为 DXF → 插件提取等高线 Z 值 → 生成高程点集 → 复用 terrain 现有高程接口（坡面拟合/坡度/表面积）→ 高差自动填入水力页扬程。
> 依赖规范：`PLUGIN_DEV.md`（插件六条硬约束）、`架构结构图.md`（§4 插件清单/§7 数据流）、terrain 高程统一接口（terrain-core.js §高程数据源统一接口层）。
> **禁止改动**：terrain 模块、水力计算（hc-core/design-core）、runye-nav.js、core/、主程序 index.html。本插件只做"读取 DXF → 产出高程点"，其余全部只读复用。

---

## 0. 一句话目标

新增插件 `plugins/contour-dxf`：用户上传 DXF（等高线图纸）→ 插件解析出带 Z 的高程点集 `[{x,y,z}]` → 通过现有 terrain 高程接口（`rtk_xyz` 同构）完成坡面拟合/坡度/表面积 → 地形高差（最高点-最低点/或相对水源）回填到水力页扬程的「地形」输入。

## 1. 背景与现状（已核实，勿推翻）

| 环节 | 现状 | 缺口 |
|---|---|---|
| CAD 图纸 | 用户有 DWG（`国裕农业专业合作社(4).dwg`），CAD 内可「另存为 DXF」 | 软件不读 DWG/DXF |
| 高程处理 | terrain-core.js 已具备：`parseCSV`（自动分隔符/表头跳过/X,Y,Z 解析）、`surfaceAreaApprox`（最小二乘坡面拟合→坡度/表面积）、`filterElevationOutliers`（6×MAD 飞点剔除）、`buildElevRecord`（统一输出契约 `{data_type, point_list:[{x,y,z}], confidence}`） | **无 DXF 解析入口** |
| 扬程计算 | hc-core.head(staticM, lossM, marginM, safety)，staticM 含「地形高差」 | 地形高差目前只能手填 |

**terrain 高程统一接口关键契约**（复用基准）：
- 输入同构：`point_list: [{x,y,z}]`（x/y 为 CGCS2000 平面坐标米，z 为高程米）
- `parseCSV` 输出 `{ok, points:[{x,y,z?}], hasZ}`，hasZ 要求 zCount ≥ max(3, 0.95×N)
- `ELEV_TYPES.rtk_xyz` = 高程点数据源（previewOnly:false）
- `surfaceAreaApprox(horizSqm, rtkPoints)` → `{surfSqm, slopeDeg, n}`

## 2. 插件设计（plugins/contour-dxf）

### 2.1 功能边界

**做**：上传 .dxf → 解析文本 → 提取高程实体 → 离散高程点集 → 预览统计（点数/高程范围/坡度估算）→ 导出「高程点 CSV」（供 terrain 导入）或直接写入 terrain 状态。
**不做**（阶段1 明确排除）：DWG 二进制解析（用户自己 CAD 另存 DXF）；TIN/网格插值（那是路径 C）；自动找最高点/最低点并直接改写水力页（本插件只产出数据 + 给出高差建议值，用户确认后填）。

### 2.2 DXF 解析要点（文本格式，纯 JS 可解析）

```
DXF 结构：SECTION(ENTITIES) → 组码对（0=实体类型 / 8=图层 / 10,20,30=X,Y,Z / 40=半径等）
```

- **目标实体**（等高线典型载体）：
  - `LWPOLYLINE`（组码 90=顶点数，后续成组 10/20/30）
  - `POLYLINE` + 顶点 `VERTEX`（组码 10/20/30）
  - `SPLINE`（组码 10/20/30 控制点；阶段1 取控制点即可，精细曲线拟合留阶段2）
  - `LINE`（组码 10/20/30 起 + 11/21/31 止）——可选
  - `TEXT`/`MTEXT`（高程标注，组码 10/20/30 位置 + 1/3 文本值）——**可选增强**：识别纯数字文本作独立高程点
- **图层过滤**：默认解析全部；给用户「图层多选」列表（从 `LAYER` 表或实体 8 组码去重提取）——等高线常在专用图层
- **Z 值处理**：LWPOLYLINE 的 30 组码可能缺失（0）——若整条线 Z 恒 0 且图层/标注有值，提示用户（不静默造假）；**有 Z 才产点**
- **离散化**：每个多段线顶点 = 1 个高程点；顶点间距过大（> 用户阈值，默认 20m）可选「沿线加密」（按弦长插值，阶段1 可只做顶点、加密留选项）

### 2.3 输出与对接

1. **解析结果面板**：点数 / 高程范围（min~max）/ 平均坡度（复用 surfaceAreaApprox 需要地块面积——若用户已在地块库有面积则传入，否则只报高程范围）/ 高差建议（max-min）
2. **「导出高程点 CSV」**：`X,Y,Z` 每行一个点（BOM 头 + 逗号分隔）→ 用户可存盘；同时插件内直接**调 terrain 高程接口**写入（若 terrain 全局可用）：
   - `window.RyTerrainCore`（terrain-core 暴露）→ 找到高程导入函数（`buildElevRecord` / 对应 upload 入口），传入 `{data_type:'rtk_xyz', point_list, coverage_area_m2?}`
3. **高差提示**：面板显示「地形高差建议值：X m」并附说明「水力页扬程的『地形』输入请参考此值」（引导而非自动写）

### 2.4 manifest（遵循 PLUGIN_DEV.md 六条硬约束）

```json
{
  "id": "contour-dxf",
  "name": "等高线解析（DXF）",
  "version": "1.0.0",
  "entry": "main.js",
  "requires": { "core": ">=1.0.0", "plugins": [] },
  "ui": { "nav": { "label": "等高线解析", "order": 94, "icon": "",
    "title": "等高线解析：上传 CAD 导出的 DXF，提取高程点 → 坡面拟合/坡度 → 地形高差（供水力扬程参考）" } },
  "permissions": ["read:diagram", "read:bom"],
  "config": {
    "feat": "pro-others",
    "_note": "阶段1：DXF 文本解析（LWPOLYLINE/POLYLINE/SPLINE/LINE + TEXT 高程标注）→ 高程点集 → 导出 CSV / 写入 terrain 高程接口。不含 DWG 解析、TIN 插值（阶段2/路径C）。会员门控 feat=pro-others。"
  }
}
```

### 2.5 生命周期（严格照搬已验证插件模式，勿自创）

- `activate(ctx)`：加载样式 → 建面板 → `ctx.ui.registerNav({label, title, order, beforeLabel:'滴灌带查询', gate, onLocked, onClick})` → 返回 `{open, state}`
- **重渲染抑制器**（MutationObserver 防权益重渲染复活——material-list/hydraulics 同款机制，2026-10-12 实测教训，必须带）
- **模块级状态复位**（ES 模块只加载一次，deactivate 置 stopped，二次 activate 不短路）
- `deactivate()`：注销导航/摘监听/移除面板/复位

## 3. 验收标准（全绿才算完成）

1. **闸门**：`_gate_plugins.cjs` + `_smoke_plugins.cjs` + `verify_nav_compact.js` 全绿。**新增插件必须同步**：plugins.json 登记、sw.js CORE 白名单登记两文件 + 抬版本、compact 闸门 WANT_PLUGINS 期望值更新（13→14）——期望值更新按闸门注释走，禁止删断言硬过。
2. **解析正确性（核心验收，用样例 DXF）**：
   - 构造/获取一份含 3 条以上 LWPOLYLINE（带 Z）的样例 DXF → 解析出正确点数、每点 X/Y/Z 与 DXF 原文一致（逐点核对）
   - 同一点集喂给 `terrain.parseCSV`（模拟导出 CSV 再导入）→ `hasZ=true`、点数一致
   - 高程范围/高差计算正确（已知样例：min/max 手算核对）
   - TEXT 高程标注解析（若实现）抽样核对
3. **UI**：面板打开/关闭正常；无 DXF 时给引导提示；图层多选生效（若实现）；导出 CSV 文件可下载、首行为 BOM+X,Y,Z
4. **回归**：主程序 hash 区块切换、其他插件导航不受影响；`?env=online` 锁定态下「等高线解析」显示「·锁」、点击走升级引导（feat 门控生效）
5. `git diff --stat` 只含：plugins/contour-dxf/（manifest.json + main.js + style.css）+ plugins.json + sw.js + verify_nav_compact.js（期望值）

## 4. 红线（违反即失败）

- **不改 terrain-core.js / hc-core.js / index.html / runye-nav.js / core/**（只读复用，零侵入）
- 不解析 DWG 二进制（阶段1 明确不做）；SPLINE 只取控制点、不造假曲线插值
- 无 Z 的实体**不产点**、不静默补 0（缺 Z 必须提示）
- 会员门控 feat=pro-others 语义照旧（三态 fail-open）
- 不 commit / 不 push / 不发布；自测脚本用完即删
- 不新增 localStorage 键（数据写入走 terrain 既有状态接口）

## 5. 闸门红时的判定

- compact 闸门：WANT_PLUGINS 13→14 为**预期变化**（新增插件），按注释更新；其余红先判期望值过期还是真回归。
- smoke 若报「插件运行期异常」：优先查面板构建/导航注册时序（参考 material-list 的 probe 超时降级逻辑）。

## 6. 完成动作

1. 改完跑 §3 全部验收
2. 汇报：插件文件清单 + 解析样例核对结果（点数/XYZ 逐点一致）+ 闸门结果 + sw.js 版本（建议 v394-contour-dxf）
3. 浏览器截图：上传样例 DXF → 解析面板（点数/高程范围/高差建议）→ 导出 CSV
4. 更新 `架构结构图.md`（§4 插件清单加 contour-dxf + §10 变更记录追加）
