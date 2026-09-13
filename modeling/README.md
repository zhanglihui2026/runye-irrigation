# 润野建模模块

数字化建模在此专指 **参数化节点建模**。当前版本是独立试验模块，三维建模入口另行预留。下一位 agent 请首先阅读 [开发规则](AGENTS.md)。

## 使用

打开主目录 `index.html`，从顶部进入“数字化建模”。默认示例有两个拾取节点和一个放样节点，接线完成时显示局部三维模型。可绘制直线／圆形／矩形、拾取图形、修改参数、连接或删除节点。使用说明在模块右上角。

也可独立打开 `parametric/index.html`，无第三方网络依赖。模型当前仅存在页面内存，切换导航保留，刷新或关闭清空。没有保存、导出或灌溉业务数据交换接口。

**两侧各有一条竖向工具栏**：整页最左是绘图工具栏（绘制／视图），整页最右是电池工具栏（电池／画布）；按钮上下排列，固定不参与三区分割，视口变窄时自动变回整幅横条。

**右侧电池区**的操作与左侧绘图区一致：滚轮缩放、在空白处按住拖动可平移画布，工具栏「－／适应／＋／重置」可缩放并把全部电池纳入视野，标签显示当前倍率。电池标题栏左侧「▾」可折叠，折叠后只保留标题与端口圆点，连线仍保持；鼠标悬停标题会显示该电池的功能说明。折叠状态只存在于当前会话，刷新后回到展开。

**左栏底部**的三维预览与参数调节面板左右并排：左侧实时显示放样成果，右侧编辑当前选中图形的参数。视口窄于 760px 时底部两块自动回退为上下堆叠。

**三个大区的界线都可以拖动**，用来调整三块的大小：

- **A 绘图区 ｜ B 三维预览＋参数调节 ｜ C 电池区**，两条界线分别是「绘图区与三维预览之间」的横线、以及「左侧两区与电池区之间」的竖线。页面左右两侧的竖向工具栏是固定侧栏，不参与这个分配。
- 鼠标移到界线上会变亮并显示抓手，按住拖动即可；**双击任一界线复位**为默认比例。
- 三块各有最小尺寸保护（绘图区／参数区不小于 120px，左右两侧不小于 260px），拖到头就停住，不会把某区压没。
- 矮屏（宽度不足 1100px 或高度不足 720px）时布局改为上下堆叠，此时两条界线都变为上下拖动。
- 没拖动过就不会写入任何样式，默认观感与固定布局完全一致；拖动结果只保留在当前会话，刷新回到默认。

模型坐标使用未标定的局部单位，不隐式解释为米或毫米。当前“放样圆管”实际生成带端盖的实心圆／矩形截面拉伸网格，没有管壁、水力或工程量语义。

## 目录与所有权

| 路径 | 职责 |
| --- | --- |
| 宿主 `index.html` | 两个导航链接、两个功能区、状态栏显示名与说明 |
| `workspace.css` | 宿主建模容器、加载提示、三维预留页；选择器限定于本模块 |
| `integration.js` | 第一次进入时加载 iframe，后续切换保留实例；主题同步 |
| `parametric/index.html` | 独立模型器的页面骨架、功能范围、CSP |
| `parametric/css/style.css` | 模型器内部主题和响应式样式 |
| `parametric/embed.js` | 子页就绪通知、白名单主题接收、画布尺寸同步 |
| `parametric/embedded.html` | 自动生成的单文件嵌入页，宿主实际加载它；不手改 |
| `build.cjs` | 零依赖打包命令，合入本地 CSS／JS 并生成 CSP 脚本哈希 |
| `parametric/js/` | 原型的七个功能脚本（含 `splitters.js` 三区分隔条），集成时保持原样 |
| `tests/` | 几何与浏览器回归 |

来源：用户提供的 `C:/Users/AHS/WorkBuddy/2026-09-12-21-12-10/gh-visual-modeler/`。原目录没有改动。后续维护部署副本，不要反复从来源覆盖本目录。

## 接入协议 v1

iframe 使用 `sandbox="allow-scripts"`，没有 `allow-same-origin`，因此子页面无法读取宿主 DOM 和存储。CSP `connect-src 'none'` 禁止模型器连接服务。由于浏览器在 file:// 的隔离页面中禁止继续加载本地子资源，宿主使用预生成的 `embedded.html`，其脚本和样式已打包进页面，脚本以 SHA-256 白名单授权，无需放松 sandbox。独立入口仍使用相对路径源码。

本期只有生命周期和样式消息，没有模型数据接口：

```js
// 子页 → 宿主：原型完成初始化
{channel: 'runye.parametric', version: 1, type: 'ready'}

// 宿主 → 子页：允许的颜色变量
{channel: 'runye.parametric', version: 1, type: 'theme',
 colors: {'--u-accent': '#18835e', '--u-water': '#245f87'}}
```

宿主仅接收 `event.source === frame.contentWindow` 且 `event.origin === 'null'` 的 ready；子页仅接收 `event.source === parent` 的 theme。两方都校验 channel/version/type。sandbox 子页为 opaque origin，发送端使用 `targetOrigin='*'` 是必要的；不要因此省略接收端的窗口身份校验。主题只接受代码中列出的 `--u-*` 白名单和 `#RRGGBB` 字符串，不接受任意 CSS。

加载过程不销毁 iframe，不会把绘图状态合并进宿主。12 秒未收到 ready 显示独立打开入口；迟到的有效 ready 仍能恢复展示。首次可见／点击才加载。

若将来要保存、导入／导出或连接主系统，需基于具体用户需求另行定义数据版本、单位、坐标变换、权限边界与校验，不能复用 theme 通道夹带数据。

## 验证

```powershell
node modeling/build.cjs
node modeling/build.cjs --check
node --test modeling/tests/geometry.test.cjs
# 使用已安装的 Playwright；也可通过 NODE_PATH 指向现有运行库
$env:NODE_PATH = 'C:\Users\AHS\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
node modeling/tests/smoke.cjs
# 电池区专项回归（缩放/平移对齐、节点尺寸、折叠、悬停说明）
node modeling/tests/node_viewport.cjs
# 布局分区专项回归（三维预览与参数面板左右并排、两区之间只有分隔条）
node modeling/tests/layout_regions.cjs
# 三区分隔条专项回归（拖动改变三区尺寸、最小尺寸保底、双击复位、拖动后画布重绘）
node modeling/tests/layout_splitters.cjs
# 竖向工具栏专项回归（左右两条侧栏贴边、按钮竖向堆叠、矮屏转横条）
node modeling/tests/layout_rails.cjs
# 反向验证：传改动前副本目录，应出现大面积报红
node modeling/tests/layout_regions.cjs <改动前副本根目录>
node modeling/tests/layout_splitters.cjs <改动前副本根目录>
node modeling/tests/layout_rails.cjs <改动前副本根目录>
```

浏览器脚本默认使用 Windows Edge，可用 `EDGE_PATH` 指定其他 Chromium 可执行文件。结果与截图写入仓库 `_modeling_verify/`，不发布。未安装 Playwright 的环境需单独配置测试依赖；模型器运行本身不需要 Node 或 Playwright。

当前测试不能替代对任意模型精度、完整触屏操作或生产工程用途的验证。已知原型限制与后续修改要求见 `AGENTS.md`。
