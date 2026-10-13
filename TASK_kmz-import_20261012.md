# TASK_kmz-import_20261012 —— 地图导入支持 KMZ（解压 → 读内部 KML）

> 执行者：Agent S（地图导入专项）
> 用户诉求：地图模块现有「导入地块(GeoJSON/KML/奥维轨迹)」，想直接导入 **KMZ**（Google Earth / 奥维导出的压缩格式），不再手动解压。
> 方案定调（用户已拍板）：**只加「解压 KMZ → 读内部 KML → 走现有解析链路」**。不做图片/模型叠加、不做导出 KMZ。
> 技术路线：浏览器原生 `DecompressionStream('deflate-raw')` 解压（Chrome/Edge 已支持），**不引第三方库**。
> 依赖规范：地图模块现有解析函数 `RunyeMapEnhance.parse.kml()`（runye-map-enhance.js）完全复用，零改动。
> **禁止改动**：runye-map-enhance.js 的解析函数（parse.kml/parse.geoJSON/奥维 gx:Track）；现有 KML/GeoJSON 导入分支；GCJ-02 纠偏链路。

---

## 0. 一句话目标

选中 `.kmz` 文件后，不再弹「请先解压」——改为：读文件头判断 ZIP 魔数 → `DecompressionStream('deflate-raw')` 解压 → 取出内部 `doc.kml`（或第一个 `.kml` 条目）→ 转 UTF-8 文本 → 复用现有 `RunyeMapEnhance.parse.kml(text)` → 走原导入链路（WGS-84→GCJ-02→本地米坐标→`runye_plot_library`→卫星叠加）。

## 1. 现状（已核实，勿推翻）

| 位置 | 现状 |
|---|---|
| `runye-map-measure.html:255` | `<input type="file" id="fileImport" accept=".geojson,.json,.kml,.ovkml,.kmz">` —— **accept 已含 .kmz** |
| `runye-map-measure.html:1478` | `if(/\.kmz$/i.test(f.name)){alert('请先解压 KMZ，再选择其中的 KML 文件。');e.target.value='';return;}` —— **当前拦截点，本次改造目标** |
| `runye-map-measure.html:1479-1486` | FileReader 按文本读 → 按扩展名/文件头分发到 `parse.kml` / `parse.geoJSON` |
| `runye-map-enhance.js` | `RunyeMapEnhance.parse.kml(text)` 已支持标准 KML + 奥维 gx:Track（.ovkml） |
| `sw.js:183,185` | `runye-map-enhance.js` 和 `runye-map-measure.html` **均在 CORE 白名单** → 改动必须抬版本 |

## 2. 改造设计（最小改动）

### 2.1 替换拦截点（runye-map-measure.html 第 1478 行）

把 KMZ 拦截改为「走 KMZ 解压分支」。整体 onchange 流程建议重构为：

```js
document.getElementById('fileImport').onchange = function (e) {
  var f = e.target.files && e.target.files[0];
  if (!f) return;
  if (/\.kmz$/i.test(f.name)) { handleKmz(f); e.target.value = ''; return; }
  /* 原 KML/GeoJSON 文本流程保持不变 */
  var reader = new FileReader();
  ...
};
```

### 2.2 新增 `handleKmz(file)`（放 runye-map-measure.html 内，就近 import 逻辑）

```js
function handleKmz(f) {
  var r = new FileReader();
  r.onload = function () {
    var buf = new Uint8Array(r.result);
    // ① ZIP 魔数校验：PK\x03\x04（或 PK\x05\x06 空包）
    if (!(buf[0] === 0x50 && buf[1] === 0x4B)) { alert('不是有效的 KMZ/ZIP 文件'); return; }
    extractKmlFromZip(buf).then(function (text) {
      if (!text) { alert('KMZ 内未找到 KML 文件（doc.kml 或任意 .kml 条目）'); return; }
      parseKmzText(text);   // ② 复用现有解析+入库+叠加链路
    }).catch(function (err) { alert('KMZ 解压失败：' + err.message); });
  };
  r.readAsArrayBuffer(f);
}
```

### 2.3 `extractKmlFromZip(bytes)` —— ZIP 内 KML 提取（纯浏览器实现）

**ZIP 结构要点**（只需解析 Local File Header）：
- 每条目头部签名 `PK\x03\x04`（字节 0-3）
- 偏移 4-5：版本；6-7：标志；8-9：压缩方法（**0=stored 不压缩 / 8=deflate**）
- 偏移 10-11：mod time；12-13：mod date；14-17：CRC-32；18-21：压缩后大小；22-25：原始大小；26-27：文件名长度 n；28-29：额外字段长度 m
- 文件名在偏移 30 起、长度 n；数据区在 `30 + n + m` 起、长度 = 压缩后大小
- 条目间顺序遍历（多数 KMZ 是连续 Local Headers；Central Directory 在文件尾可忽略——**只按签名扫描即可，容错跳过**）

**实现**：
1. 从偏移 0 循环扫描：找到 `PK\x03\x04` 签名 → 解析头部 → 读文件名
2. 文件名匹配：**`doc.kml`（大小写不敏感）优先**；找不到则取第一个以 `.kml` 结尾的条目
3. 按压缩方法处理：
   - `method === 8`：`new DecompressionStream('deflate-raw')` 解压数据区字节（reader.read() 累积）
   - `method === 0`：直接取原始字节
   - 其他方法：跳过（提示不支持）
4. 解压结果 `Uint8Array` → `new TextDecoder('utf-8')` 解码（自动处理 BOM）
5. 返回 KML 文本；无 KML 条目返回 null

**容错**：
- 扫描时若签名不连续（有间隙），用「找下一个 `PK\x03\x04`」方式跳过，不中断
- 文件名可能带路径（`doc.kml` 或 `files/doc.kml`）——按 basename 匹配 `.kml` 即可
- 单个 KMZ 里多个 KML：取第一个即可（阶段1），不弹选择

### 2.4 `parseKmzText(text)` —— 复用现有链路

把 KML 文本交给现有解析+入库逻辑。**最省事的做法**：把 onchange 里现有「读文本→parse.kml→入库→refreshPlotLibrary」段抽成公共函数 `importTextAsPlots(text, fallbackName)`，KMZ 分支和原分支共用；若不愿重构，则 KMZ 分支内**复制**现有入库段（约 30 行）但**必须保持与现有段逐字一致**（防两套口径漂移）。优先抽公共函数。

## 3. 验收标准（全绿才算完成）

1. **构造真实 KMZ 测试**（必须，不能只看 UI）：
   - 用现有 `RunyeMapEnhance.export.kml()` 导出一份 KML → 用 ZIP 工具（PowerShell `Compress-Archive` 或 Node 无依赖打包脚本）压成 `.kmz`（**注意：Compress-Archive 默认方法可能非 deflate，测 stored 与 deflate 两种**；若 Compress-Archive 不兼容则用 JSZip 一次性生成测试文件，测试完删除）
   - 上传该 KMZ → 成功解析出地块 → 存入 `runye_plot_library` → 卫星图叠加出现
   - 与「直接导入同内容 KML」的结果**逐字段对比**（mu/sqm/poly/polyLatLng 一致，误差为 0）
2. **边界用例**：
   - 非 ZIP 文件改名 `.kmz` → 弹「不是有效的 KMZ/ZIP 文件」
   - 空 ZIP / 无 KML 的 ZIP → 弹「KMZ 内未找到 KML 文件」
   - stored 与 deflate 两种压缩的 KMZ 各测一次
   - 文件名带路径（`folder/doc.kml`）→ 仍能解析
3. **回归**：KML / GeoJSON / 奥维 .ovkml 导入与原来完全一致（三态全测）
4. **闸门**：`_gate_plugins.cjs` + `_smoke_plugins.cjs` + `verify_nav_compact.js` 全绿（本改动不涉及插件导航，若 smoke 因页面运行期异常红 → 查 KMZ 分支是否在低版本浏览器抛错，需 fail-open）
5. **兼容降级**：`DecompressionStream` 不存在时（旧浏览器）→ 弹「当前浏览器不支持 KMZ 解压，请先解压后导入 KML」，**不崩溃不影响其他导入**
6. `sw.js` 版本抬至 **`v395-kmz-import`**（CORE 白名单含 runye-map-measure.html + runye-map-enhance.js，改动必须抬版本并在沿革注释记录）
7. `git diff --stat` 只含：runye-map-measure.html、sw.js（+ 测试用临时文件，验收后删除）

## 4. 红线（违反即失败）

- **不改 runye-map-enhance.js**（解析函数零改动；`?v=352` 缓存串不动）
- **不改现有 KML/GeoJSON/ovkml 导入分支**（除抽公共函数这一允许的重构——抽完必须回归三态）
- 不引第三方库（JSZip 等一律不用，纯 DecompressionStream）
- 不新增 localStorage 键（地块仍存 `runye_plot_library`，与现有一致）
- 不 commit / 不 push / 不发布；临时测试文件用完即删
- KMZ 内非 KML 资源（图片/模型/样式）**忽略不处理**（阶段1 明确范围）

## 5. 闸门红时的判定

- 若 smoke 报「页面运行期异常」且与 KMZ 相关：优先查 DecompressionStream 兼容分支是否真的 fail-open（旧浏览器不该抛错）
- 若与 KMZ 无关：先判期望值过期还是真回归，再处理；不得删断言硬过

## 6. 完成动作

1. 改完跑 §3 全部验收（含真实 KMZ 用例 + 与 KML 逐字段对比）
2. 汇报：改了哪几处（runye-map-measure.html 精确到行/函数）、sw.js 版本、KMZ 测试矩阵结果、DecompressionStream 降级路径
3. 浏览器截图：选中 KMZ → 导入成功 → 地块出现在地图与「我的地块」列表
4. 更新 `架构结构图.md`（§7 数据流加 KMZ 入口 + §10 变更记录追加 v395）
