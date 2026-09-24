# C++ 水力核心，阶段 1

前端、存档格式、管网拓扑、选型规则均保留。迁移范围：内径换算、Hazen–Williams、流速、局部损失、Christiansen 折减、水泵扬程与功率。浏览器中的主计算及 hc-core 通过适配层调用编译后的 C++。拓扑遍历和水泵选型仍由 JavaScript 组织，后续逐步迁移。

> 工程单位：长度/水头 m、流量 m³/h、管径 mm；内径使用 SDR 规则，粗糙系数可传入。输入清洗仍由现有 JavaScript 层负责，C++ 不擅自替换设计输入。
>
> 本阶段没有宣称加速或改善公式精度；验收目标是计算等价、可发布、可回退。

## 发布

继续使用现有 GitHub Pages 分支发布。必须一起提交：

- `index.html`
- `hydraulic-calc/hc-core.js`
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

`head`（扬程）与 `power`（功率）两个函数已加入 `hydraulics.cpp` 与 `hc-core.js`，但**当前随仓库提供的 `hydraulics-wasm.js` 不含这两个导出**。要启用 C++ 版扬程/功率，需按下方「重新编译」重建 wasm；重建前 `RyHydraulicNative.head/power` 保持未定义，hc-core 自动回退到 JS 实现。`verify.cjs` 在 wasm 未导出时打印 `SKIP`，导出后自动交叉校验。
