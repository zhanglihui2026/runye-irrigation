# C++ 水力核心，阶段 1

前端、存档格式、管网拓扑、选型规则均保留。迁移范围：内径换算、Hazen–Williams、流速、局部损失、Christiansen 折减、水泵扬程与功率。浏览器中的主计算及 hc-core 通过适配层调用编译后的 C++。拓扑遍历和水泵选型仍由 JavaScript 组织，后续逐步迁移。

> 工程单位：长度/水头 m、流量 m³/h、管径 mm；内径使用 SDR 规则，粗糙系数可传入。输入清洗仍由现有 JavaScript 层负责，C++ 不擅自替换设计输入。
>
> 本阶段没有宣称加速或改善公式精度；验收目标是计算等价、可发布、可回退。

## 发布

继续使用现有 GitHub Pages 分支发布。必须一起提交：

- `index.html`
- `hydraulic-calc/hc-core.js`
- `hydraulic-calc/design-core.js`（页面使用的纯选管与电机选型接口）
- `hydraulic-calc/native-bridge.js`
- `hydraulic-calc/hydraulics-wasm.js`（编译产物，内嵌真正的 WASM）
- 本目录中的 C++ 源码和构建说明，供后续维护。

Pages 不编译 C++。编译产物已经随项目提供，普通发布不需要安装编译器、不需要修改 Pages 设置。单文件产物避免遗漏 `.wasm`、仓库子路径错误和本地 file URL 的 fetch 限制；不使用线程或特殊响应头。

## 重新编译

固定 Emscripten **4.0.23**，执行 emsdk install / activate 4.0.23（不要设置全局环境）。Windows：

```powershell
./hydraulic-calc/native/build.ps1 -EmSdk 'C:/path/to/emsdk'
```

构建使用 C++17、double、O2，禁用默认之外的数学近似优化；没有 fast-math。

## 验证与回退

```text
node hydraulic-calc/native/verify.cjs
node hydraulic-calc/native/browser-smoke.cjs
```

浏览器验收需要 `playwright` 和 Microsoft Edge。测试使用隔离上下文、临时本地 HTTP 服务，不操作用户存档。验证仓库子路径、本地 file URL、WASM 不可用时回退、计算结果一致性。

控制台 `RyHydraulicNative.backend` 加载成功后应为 `cpp-wasm`（wasm 初始化是**异步**的：`createRunyeHydraulics()` 返回 Promise，`native-bridge.js` 在 Promise resolve 后才把 `backend` 翻成 `cpp-wasm` 并挂载各函数）。在 wasm 就绪**之前**或加载**失败**时，`backend` 为 `javascript`，原因在 `RyHydraulicNative.error`，原 JS 公式继续运行。

**不混用实现**：任一水力原语只在 `RyHydraulicNative.<fn>` 被挂载后（即原子地、在一次 resolve 中）才改用 C++，因此同一次 `computeThreeLevel()` 计算内不会 JS/C++ 混算；首屏自动运行若早于 wasm 就绪，则整次用 JS，后续用 C++，结果等价。`RyHydraulicNative.ready` 是一个 Promise，宿主可在首次计算前 `await` 它以确保已切到 C++。

**宿主已实现**：`index.html` 的首笔 `render()`（主工具）与三级系统图模态的初始化 `render()` 均已改为等待 `RyHydraulicNative.ready` 后再执行首笔计算——`ready` 成功则首笔即走 C++，失败（或 `RyHydraulicNative` 整体缺失）则立即回退 JS，不会卡白屏。即浏览器端默认首笔就走 `cpp-wasm`，而非一加载先 JS 回退。

`head`（扬程）与 `power`（功率）已编译进随项目提供的 WASM。主页面三处扬程/功率计算均通过 `RyDesignCore` 调用。所有七项原语必须完整导出才能启用 C++，缺少任何一项会整组回退；测试不再跳过缺失导出。扬程安全系数前的净水头限制为非负，效率按小数输入，功率输出 kW。

边界：`design-core.js` 承担最近目标流速选管及电机档位选择，`pipe-path-loss.js` 承担轮灌组逐路径计算，两者仍为 JavaScript；C++ 承担数值原语。页面保留输入读取、方案组合、绘图和存档，不表示整个后端已迁移为 C++。

`verify.cjs` 包含 2500 项 JS/C++ 对比、代数消元算例、扬程/功率边界、桥接失败回退，以及 `path-fixtures.cjs` 的独立路径算例（顺序轮灌与同时灌溉、异径、最不利路径、零流量）。消元算例采用非工程尺寸，仅验证公式和连接关系，不能替代实际工程设计校核。浏览器测试检查沿程损失、扬程和功率确实调用 C++，并验证静态站点子路径、本地文件及 JS 回退结果一致。
