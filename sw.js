/* Runye PWA v1. Increment VERSION when changing the offline shell. */
/* v427-archive-3d-iso: detach 3D preview and axonometric UI while retaining shared 2D pipe workspace and data. */
'use strict';
/* VERSION 沿革：v380-cache-fix（另一会话的缓存修复）→ v381-plugin-aiplan（本次新增 ai-plan
   插件 + core/data-service.js、core/event-bus.js、core/ui-shell.js 均在 CORE 白名单内，必须抬版本，
   否则离线态会取旧文件）→ v382-da-decouple（数字农业与灌溉工具完全剥离：
   删桥接层文件及其在 index.html 的引入与调用点，CORE 列表同步移除该项）→
   v383-thin-scrollbar（两项：① 用户要求全站滚动条最窄最短——runye-theme.css 删除压制自定义的
   标准属性 scrollbar-width（有头实测 Chrome/143 下 thin=10px、默认=15px、仅 webkit 4px=4px），
   全局 webkit 4px 半透明灰圆角丸，mod/style-01/02/05.css、filter-system、network-editor.css 的
   5px 覆盖同步对齐；② 用户要求「管网装配（平面图）」功能全部取消——network-editor.js
   EDITOR_OFF 总开关置 true，卡片/叠加层/观察器整体下线。以上均在 CORE 白名单内，必须抬版本）→
   v384-sprinkler（喷灌专项 TASK_sprinkler-pipeline_20261012 全链路：terrain 直接填间距 12×12 +
   sprinklerBom/tankVolumeEstimate/boostModel + terrain 页 BOM 落桥 + 新增 plugins/sprinkler 壳插件
   两文件进 CORE 白名单，必须抬版本）→ v385-global-open（并行会话：全站功能暂全开放）→
   v386-undock（用户指令剥离四功能入口：多地块规划/管路拼装/经济指标分析/数字化建模——runye-nav.js
   MORE_ITEMS 摘四行、智能规划侧栏摘四链接、plugins.json 移除 pipe-assemble 壳插件、CORE 同步移除
   其两文件；业务文件全部保留，将来把对应行/条目加回即可恢复，必须抬版本）→
   v387-nav-flat（用户指令：「更多」内容全部展开到顶栏——runye-nav.js 六项移入 ITEMS、
   MORE_ITEMS 置空保留面板承接管网优化详细分析，必须抬版本）→ v388-plugin-control（全站外挂插件开关：
   loader 启动前读取服务端配置，新增 plugin-admin.html 与云函数接口；后台纳入 CORE，必须抬版本）→
   v389-nav-panel-preserve（修复 v388 引入的时序回归：loader 的 controlPromise 网络等待把 pipe-optim
   插件接管推迟到权益重渲染之后，「更多」面板随导航重建被清空、注入的「管网优化详细分析」按钮丢失
   → 插件容器判定 null 错落顶栏、面板恒空（compact 闸门 M2/M3/M4 红）。runye-nav.js mount()
   重建前保留面板内外部注入按钮（排除 data-ry-navitem / data-ry-plugin-nav / data-ry-mbr，
   后两者由 ui-shell 自行重挂防双份），新面板建好后回插。runye-nav.js 在 CORE 白名单内，必须抬版本）→
   v390-plugin-migrate-4（用户指令：过滤系统/材料清单/轴测图/系统图四项作为外挂插件接入主程序；
   生成系统图与地块绘制留在主程序不动。新增 plugins/filter-system、material-list、iso-view、sys-view
   四个壳插件（业务零改动，接管 runye-nav 老导航项 + 重渲染抑制器），八文件进 CORE 白名单，必须抬版本）→
   v391-nav-reorder-decouple（用户指令三项：① 顶栏重排——智能规划第一（ai-plan 锚点改「地块绘制」）、
   地块绘制移到在线地图之前（pre:1 提前）、多地块规划恢复上线（v386 剥离条目原样加回，地形模块之后）；
   ② 管网优化入口与主程序脱开——pipe_optim_ui.js 不再自注入导航按钮，pipe-optim 插件直接持有
   「更多」面板入口（config.container），契约 C22/C25/C26 与 I13/I14/I15 同步改写；③ 为让重渲染后
   锚定项不被 [v377] 兜底挪走，core/ui-shell.js mountNavs 对锚定项按锚点重定位）。
   runye-nav.js / core/ui-shell.js / pipe_optim_ui.js 均在 CORE 白名单内，必须抬版本）→
   v392-iframe-shell（桌面端地图/地形/水力校核 iframe 首进懒加载后常驻，新增 mod/inline-31.js 入 CORE）→
   v393-map-embedded-nav（在线地图在主程序 iframe 内隐藏页面自身功能导航，只保留主导航）→
   v394-bom-nav-merge（材料清单单入口联动 BOM 面板）→
   v395-embedded-nav-unification（地图/地形/水力子页嵌入时统一隐藏重复功能导航）→
   v396-terrain-plot-angle（用户指令：地形模块地块增加旋转角度，复刻地块分区同款——
   terrain/index.html 制图区左上角快捷条「地块角度+落定基准」；terrain-ui.js 显示层整组
   刚性旋转（联合包围盒中心为轴，地块/RTK点/喷灌叠加同步跟随，只影响显示不重写数据），
   落定=地块轮廓与RTK高程点一起改写为新基准（栅格不转）。terrain 三文件均在 CORE 白名单，必须抬版本）→
   v397-kmz-import（地图支持直接导入 KMZ：解析 ZIP 中央目录，解压 doc.kml/首个 KML 并复用原导入链路；
   未引入第三方依赖，地图页面已在 CORE 白名单内）→
   v398-contour-dxf（TASK_contour-dxf_20261012 路径B：等高线 DXF 解析插件——CAD 另存 DXF →
   提取 LWPOLYLINE(顶点/38整线高程)/POLYLINE+VERTEX/SPLINE 控制点/LINE 顶点 Z + TEXT/MTEXT 纯数字标注
   → 高程点集 → 导出 CSV / 写入 terrain 高程状态接口（零新增 localStorage 键）→ 高差建议供水力扬程。
   无 Z 实体不产点不补 0；terrain 内核动态 import 只读复用零侵入。三文件进 CORE 白名单，必须抬版本）→
   v399-file-menu（用户指令：导航增加「文件 ▾」统一菜单——所有导入/导出/工程操作收进一个折叠入口。
   新增 mod/inline-32.js（菜单构建+动作分发：主程序内直接调 runyeDxf/RyIsoDiagram/headModal/runyeSaveProject
   等，独立页经 RyFrameShell 切 iframe 后触发 btnImport/btnGeoJSON/fileSHP 等按钮）；
   index.html 加 #fnFileMenu 静态块 + runye-nav.css 加 .fn-file 皮肤。   index.html / runye-nav.css /
   mod/inline-32.js 均在 CORE 白名单，必须抬版本）→
   v400-contour-dxf-panel-fix（contour-dxf 面板挂载修复：createMount 槽默认 display:none，
   position:fixed 面板在隐藏父容器内不渲染 → 改挂 document.body（archive/case-lib 同口径）。
   plugins/contour-dxf/main.js 在 CORE 白名单，必须抬版本）→
   v401-file-menu-complete（补齐等高线 CSV 菜单入口并将 BOM/等高线项定位到面板导出控件；
   RyFrameShell.show 增加独立页动作的同口径会员门控；菜单保持 .fn-file-panel 独立类）→
   v402-nav-more-collapse（用户指令：过滤系统/轴测图/系统图/滴灌带查询 折叠进「更多 ▾」
   （runye-nav.js ITEMS→MORE_ITEMS，v346 线上锁随之退役——面板项已是上线功能）；
   协议自检(hello-world)/参数标定(calib) 插件 nav 声明 container='.fn-more-panel' 同入面板；
   「文件」按钮挂到「地块绘制」之前（mod/inline-32.js relocate + MutationObserver）并去掉 📂 图标。
   runye-nav.js / index.html / runye-nav.css / mod/inline-32.js / 两插件 main.js 均在 CORE
   白名单，必须抬版本）→
   v406-terrain-angle-cachebust（地形「地块角度」线上反馈无效排查：代码端独立页/嵌入iframe/真实键击/落定基准全链路实测全部生效，判定为用户端陈旧缓存（terrain 两脚本无版本参数）；terrain/index.html 两 script 加 ?v=406-angle 破缓存，必须抬版本）→
   v407-terrain-angle-persist（用户再报「地块角度一直为0不能调整」+截图横幅「0°无需落定」：
   实锤与地块分区的真实差异——pp 的 plotRotationDeg 随状态持久化（inline-11 3944/3998/4008），
   terrain 刷新即丢（原注释误称与 pp 一致）→ terrain-core load/saveState 白名单加入 _plotRot；
   terrain-ui 输入框状态回填（pp 4008 同口径）+ change 兜底回显 + 反馈横幅 + 绘制异常可见化。
   terrain 三文件 + sw 均在 CORE 白名单，必须抬版本）→
   v408-member-admin-console（用户指令：会员管理与规则参数并入 plugin-admin 统一后台——
   云函数 v2c 新增 configGet/configSet/adminMembers/adminMemberGrant（ry_kv global:member-config，
   管理员复用 RY_PLUGIN_ADMIN_UIDS）；runye-entitle.js 启动拉取云端规则覆盖内置默认（fail-open）；
   plugin-admin.html 扩展三页签（插件/会员管理/规则参数）。plugin-admin.html 在 CORE 白名单，必须抬版本）→
   v409-member-bind-view（用户要测邀请绑定关系：云函数 v2c-3 新增 adminMemberBind（管理员查某用户
   邀请码/进度/名下 links）；后台会员详情新增「邀请绑定关系」懒加载块。plugin-admin.html 在 CORE
   白名单，必须抬版本）→
   v410-terrain-elev-viz（地形深化一：RTK 高程可视化——terrain-core 新增 planeSlope/buildElevField/
   contourSegments 纯函数（IDW 高程场 + marching squares 等高线）；terrain-ui 制图区新增「高程着色」
   「等高线」开关 + 色带图例 + 地块标签坡度标注，全部显示层语义随地块角度旋转；terrain/index.html
   elevTools 开关组 + elevLegend，?v=410-elev。terrain 三文件在 CORE 白名单，必须抬版本）→
   v411-tier-access（会员权益采用允许/拒绝/同步中三态；未同步期间禁用会员导航和iframe切换，
   并统一CAD/BOM操作提示；权益脚本进入离线CORE缓存，更新浏览器脚本版本）→
   v412-material-formulas（拆分材料表纯公式工具并纳入离线 CORE 缓存）→
   v413-zone-geometry（拆分多边形裁剪与轮灌分区面积纯计算模块并纳入离线 CORE 缓存）→
   v414-flow-geometry（将轮灌演示的 SVG 折线路径解析、最近点与距离计算提取为纯模块并纳入离线 CORE 缓存）→
   v415-pipe3d（新增三级管网 3D 预览：runye-pipe3d.js 读 window.tlDiagramData 用 Three.js 渲染总管/主管/
   支管/弯头/阀门/水源/滴灌带三维示意，自写轨道控制；three.min.js r147 本地自托管懒加载。
   两文件进 CORE 白名单，必须抬版本）→
   v416-tape-axis（布管方向单一事实来源：RyZoneGeometry 新增 axisFit/tapeAxisOf 纯函数——一次算出
   tapeAxis/pipeAxis/segs/代价报告，滴灌带 ∥ tapeAxis、主管∥支管 ⊥ tapeAxis 由构造保证；投票判据由
   「分区宽高比」改为「贴合单边铺设长度 S 的程度」，平票由更省支管一侧破平；带长超 S 自动分段。
   二级 ppBuildAutoPipes（原 v229 投票）与三级 tlAutoGenerate（原 v150b 逐区判向）改消费同一函数。
   mod/zone-geometry.js / inline-09.js / inline-11.js 均在 CORE 白名单，必须抬版本）→
   v419-manual-zone-limit（手动分区超限保护 + CAD工具栏脚本拆分，新增 mod/ry-cad-toolbar.js 入 CORE，必须抬版本）→
   v420-plot-editor-split（大文件拆分一：绘图编辑器 IIFE（07 管路规划与施工简图，402..4071 行逐字节）自
   inline-11.js 迁出为 mod/plot-editor.js；inline-11 仅余二级扬程面板顶层段（24KB）。审计确认 head 与 IIFE
   双向零符号依赖、IIFE 对外全部调用时守卫，加载顺序铁律=plot-editor 紧跟 inline-11 之后。新文件入 CORE，
   必须抬版本）→
   v421-mat-table（大文件拆分二：材料清单/材料表管理（TL_PIPE_PRICE_DEF 单价默认表 + tlPipePriceByOd +
   updateMaterialTotals + mat* 可编辑表格，493..1491 行逐字节）自 inline-09.js 迁出为 mod/material-table.js；
   边界审计：出带依赖仅 render/fmt/fmt0（call-time），带外引用 18 符号全 call-time，inline-09 本非 IIFE、
   符号原就是全局 ⇒ 迁移零语义变化；表格 HTML 骨架仍由 inline-09 的 render() 生成。加载顺序=先于
   inline-09（其尾部 IIFE 的 ready.then(render) 微任务在两脚本间触发首屏 render，须本文件先就位）。
   新文件入 CORE，必须抬版本）→
   v422-head-system-svg（提取首部系统图纯 SVG 布局/绘制模块，index.html 先行加载且新增 CORE 缓存项）→
   v423-header-layout（将三级简图标题换行/拖动/调宽交互从 inline-09.js 拆出为 mod/tl-header-layout.js；
   保留普通同步经典脚本，排在 inline-09 之后，复用 tlMeasureText 与生成器写入的 window 标题状态。新文件进 CORE）→
   v424-plan-calc-render（将扬程计算式和扬程分解的 DOM 展示从 inline-11.js 抽为独立渲染器，保留原全局入口与行为，新增 CORE 缓存项，必须抬版本）→
   v425-manual-zone-geometry（将手动分区尺寸与上限计算移入纯几何模块，inline-09 保留DOM参数适配与兼容入口）→
   v426-tl-polyline-geometry（将节点图层折线长度、沿线定位和弧长裁剪提取为纯模块）→
   v427-deepgreen-brand（全站品牌主色 token 深墨绿化：runye-theme.css 的 --ry-green-500/600/700/800/900、--ry-info、--ry-success、--ry-btn-shadow 改为深墨绿系 #173e32；同时 index.html 的 theme.css?v=1 升至 v=2。改 CSS 必须抬版本以重建 SW 缓存）→
   v428-panel-pilot（新增共享折叠/拖动面板交互库，试点主页面参数面板与在线地图分区角度面板；两项新资产纳入 CORE，地图页主题缓存版本同步至 v=2）→
   v429-local-admin（会员面板增加本机专用管理员测试会员，账号凭据仅保存PBKDF2哈希，登录状态可持久恢复；生产域名不启用）→
   v430-shoelace-panel（主设计参数面板改为紧凑分组布局，使用 Shoelace 数字输入控件并保留原生离线回退；增加可记忆的侧栏拖宽与折叠轨；参数字段 ID 和计算监听保持兼容）→
   v431-panel-layout-cascade（修正主页面既有布局规则覆盖拖宽变量的问题，并让窄屏折叠态收拢为紧凑横条）→
   v432-pp-side-panel（04 地块分区页参数栏 #ppSide 套用共享面板规范：深墨绿标题头与折叠/收起轨
   （mod/ry-panel.js rypCollapsible 驱动，记忆键 ryPpSideFolded）、灰条分组标题（水源与扬程/滴灌带铺设/
   分区与水力/水力计算结果，含 sl-icon）、紧凑键值行、Shoelace 数字输入代理（data-ry-proxy-for 桥接，
   原生 input 保留为数据源与离线回退）；字段 ID、计算监听与契约探针计数均不变；
   旧 .pp-plan-bar 横向暗色样式与 ::before 伪元素分组标题由 ry-panel.css 全宽替代，其版本参数同步抬升）→
   v433-core-script-audit（补齐主页面案例库、CloudSync 适配层和撤销模块的离线 CORE 预缓存；静态门禁校验
   主页面本地脚本均已缓存或登记有明确降级理由的例外，避免新脚本遗漏离线清单）→
   v434-pp-side-no-rail（按用户要求取消 04 分区参数面板的收起细条「参数」：折叠后标题头仍可见、
   点击标题头即可重新展开（data-ry-toggle），细条属重复入口；删该按钮与对应 CSS，折叠行为不变）→
   v435-skip-waiting（install 预缓存全部成功后调用 self.skipWaiting()，配合 activate 的
   clients.claim()：新版本 SW 立即接管页面，消除旧 SW 控制期「新 HTML + 旧缓存 CSS」的
   混合投递——这是用户反馈改样式后页面看不到效果的根因；预缓存失败仍保留旧 worker，原子性不变）→
   v436-pp-normalize（04 地块分区页参数栏样式归一第②刀：删除 style-01.css 两段
   #pipePlanSection 旧副本、index.html 内嵌 style 的参数栏段、body.ry-tool 统一层中
   pp 版 .pp-side 容器与子项压缩规则（grid 定位保留）、inline-11.js updatePlan 的
   内联 display:flex 写入；算式区浅色化规则搬家至 ry-panel.css 皮肤块并补齐容器布局；
   皮肤块撤除全部对抗性 !important——04 页参数栏自此只有 ry-panel.css 一个样式来源；
   tl/gr 页副本未动，属第③④刀）→
   v437-remove-plan-entries（用户要求：04 地块分区页取消「滴灌带压差改善」与「地形高程」
   两个动态注入入口——runye-inverse-design.js 移除 planTapeLaySide 行后的 ri-entry 按钮
   注入；runye-terrain.js 移除 planDh 宿主与 v280 的 planBtnRow 按钮行机制（RyPlanBtnRow
   导出一并删除）；   两脚本 01/土地流转/成组/设置页的入口不受影响；'plan' 作用域自此无入口））→
   v438-test-panel（用户指令：侧边工具面板样板页并入主程序——根目录新增
   runye-test-panel.html（样板复制 + 标题改「测试分区」），runye-nav.js ITEMS 在
   「地块分区」后加「测试分区」项（pre:1、feat:'' 免门控、href 指向该页），
   framePage 映射加 test-panel 分支，index.html #ryFrameShell 加
   frTestPanel iframe（data-fr-page=test-panel，懒加载）；本页进 CORE 预缓存）→
   v439-float-zindex（用户反馈：在线地图「分区角度」面板被地图盖住——共库 .ryp-float
   硬写 z-index:var(--ry-z-float)=200，同特异性后加载压掉页面自带的 1150，跌进
   Leaflet 层区间（200~800）。修法：共库删除 z-index 行（页面上下文相关值下放页面），
   地图页恢复 1150，测试分区页自声明 200）→
   v440-map-return-top（在线地图嵌入主程序时，回传地块改为导航顶层 index 页面，
   避免只把 iframe 内部跳转到 index.html 后出现嵌套应用及重复导航/状态栏；独立打开地图仍跳转自身）→
   v441-map-main-section（在线地图迁入主程序功能区，与地块分区/管路规划共用导航、状态栏和文档上下文，
   移除地图 iframe；新增 scoped 样式与初始化脚本纳入 CORE）→
   v442-native-terrain-hydraulics（地形与水力校核迁入主页面功能区，复用主导航、会员状态和页面上下文；
   独立旧页面保留兼容，新增功能区样式与初始化脚本纳入 CORE）→
   v443-terrain-panel（把三级页面的手动地形高程提升为独立侧栏分组，放在三级管网参数下方，
   默认折叠；三级工具栏切换时同步折叠状态）→
   v444-pp-style-layer-10（移除主程序模式下地块分区参数条的第二层卡片背景与描边覆盖，
   保留三级参数条样式）→
   v445-default-online-map（首次打开无参数网址时默认进入在线地图）→
   v446-default-online-map-active（页面初始活动区块设为在线地图，避免脚本启动前短暂或持续显示地块绘制）→
   v447-remove-water-head-label（移除地块分区参数栏“水源与扬程”装饰标题及仅供该标题使用的样式，保留计算字段与旧伪标题屏蔽）→
   v448-fluid-lift-input（泵提升高度输入填充侧栏行内剩余宽度，随可拖动CAD工具栏宽度伸缩）→
   v449-aligned-parameter-inputs（十项分区参数共享标签、输入、单位网格列；输入框左边缘对齐并随工具栏宽度伸缩）→
   v450-hide-relocated-separator（在移动到 CAD 侧栏的分区参数面板中同步隐藏已禁用的纵向分隔元素，消除参数行间空白）→
   v451-inline-plot-parameters（取消“地块分区参数”内层折叠，让二级工具栏分组展开后直接显示所有参数）→
   v452-inline-parameter-layout（恢复十项参数的标签、输入、单位横向排列；保留面板内 Shoelace 输入同步）→
   v453-disable-l2-schematic（停用二级简图的底部与移动端入口，并拦截旧程序切换路径；保留原实现与样式）→
   v454-terrain-sidebar-peer（地形高程统一作为CAD工具栏内与二级、三级同级的折叠分组；清理三级参数条旧入口并更新脚本缓存地址）→
   v455-full-width-head-formula（扬程算式在CAD主面板内撑满侧栏内容宽度，并允许按宽度换行）→
   v456-input-width-64-single-source →
   v457-hydraulic-path-loss（修复三级改径后逐路径损失被全局代表值覆写；纳入水源距离；
   将二级/三级计算轴功率与建议电机额定功率分开显示，经济电费估算改用计算轴功率）→
   v458-unified-design-path-loss（设计管径与手动改径均使用同一套逐路径水头损失算法）→
   v459-target-velocity-row（三级水力项目标流速移至表头下、联合流量上方）→
   v460-planbar-uniform-fontsize（三级左栏「联合灌溉/面积成组/轮灌演示」按钮与输入框字号收回 11px，
   与「联合灌溉」标签一致；对冲 runye-typography.css 对 input/button 的 13px 归一）→
   v462-demo-dot-chips（轮灌演示组 chips 改为圆形填充色+阿拉伯数字，填充色与工作区分组色带
   4 色循环同源；tlDemoChipSync 保留 .tl-demo-dot 只翻转选中态）→
   v463-irrigation-data-store（集中管理水力校核与地图共用的管网/设计快照读写，沿用现有键名和v1格式）→
   v464-laylen-relabel-move（二级左栏「单边铺设长度」改名「铺设长度」并挪到「滴头流量」之下、
   「分区划定」之上；id=planTapeLaySide 不变，消费点零改动）→
   v465-demo-icon-ctl（轮播/退出取消文字改图标 ▶/⏸/■；演示 chips 行改块级 flex，
   与「轮灌演示」标题行距加大）→
   v466-terrain-bridge-store（集中管理在线地图到地形模块的一次性载荷交接，保留 key/payload，
   消费时先删除以维持单次导入语义；新增 core/terrain-bridge-store.js 纳入 CORE）→
   v467-tape-spacing-relabel（二级左栏「滴灌带间距」改名「滴带间距」；id=planTapeSpacing 不变）→
   v468-sprinkler-bridge-store（集中管理地形喷灌成果快照的 remove/set 写入与插件只读解析，
   保留 runyeSprinklerResult、manifest 可配置 key 和既有载荷；新增 core/sprinkler-bridge-store.js 纳入 CORE）→
   v469-areagroup-annotate（三级左栏「按亩组合」实体按钮取消，改「亩（按亩组合）」括弧注释；
   执行入口收敛为「面积成组」点击+亩数框回车，acb 接线与死样式一并清理）→
   v470-areagroup-btn-restore（撤销 v469：「按亩组合」是执行按钮不能取消——按钮 DOM、acb 接线、
   样式三处原样恢复，括弧注释撤销）→
   v471-flow-connector-link（轮灌演示水流找阀升级：首选 45° 连接管 line 两端坐标直接关联
   阀门与主管锚点，零阈值、随图面自动成立；v354 的 8px/40px/6px 固定阈值降级为兜底——
   修复大分区/合并组水流不走斜管、垂足直插支管的回归）→
   v472-terrain-title-beta（地形模块页标题改「地形模块·测试中」：terrain/index.html 与
   主页面内嵌 terrainSection 两处 h1 + 独立页 <title>，导航清单项名不变）→
   v473-areagroup-right-align（三级左栏「按亩组合」按钮右缘与「4区」右缘对齐：
   两参数行结构对齐撑满栏宽——行1 区按钮均分余量、行2 亩数输入框吃余量，
   两行右缘天然重合，v227 左对齐保留；style-01.css ?v=473）→
   v474-plot-diag（面积缩水排查诊断入口：mod/ry-diag.js，地址栏 index.html#rydiag
   弹层展示 measuredArea/measuredPolygon/planDims 与地块库全部记录（含按环 geodesic
   实测），一键复制；只读不改状态，纳入 CORE）→
   v475-transfer-live-draft（回传地块绘制以画布为准：画布环与候选记录面积差>0.5% ⇒
   先落库（另存新条目、不覆盖旧记录）再回传，修复「卡片显示 A 亩、传过去是旧记录
   B 亩」（182.92→274.62、397.29→145.73 均为此因）；saveCurrentDraftToLibrary
   支持 opts.newId。online-map.js ?v=475-transfer-live-draft）→
   v476-pwa-reset（#ryresetpwa 一键清除安装面板关闭标记 runye_pwa_install_dismissed，
   面板恢复出现；ry-diag.js ?v=476-pwa-reset）→
   v477-del-confirm（删除/解散成组确认改页面内自绘弹窗 ryConfirm：原生 confirm() 被用户
   勾选「阻止此页面显示更多对话框」屏蔽后恒返回 false ⇒ 「🗑 删除地块点了没反应」；
   runye-map-enhance.js ?v=477-del-confirm）→
   v478-plot-ref-geometry（在线地图弹窗回传增加几何指纹，接收端拒绝重复编号或陈旧弹窗
   静默命中其他地块）；v479-plot-transfer（三条地块回传路径统一到分区页，同页立即消费引用，
   原始地块记录只读，重复编号拒绝设为当前；更新主页面脚本查询版本与核心缓存）→
   v481-angle-live（分区角度面板链路排查+交互修复：headless 实测证实「地图改角→应用→
   回二级」链路完好，故障观感来自①±1°/输入角度不实时转线、必须点应用才有反馈，
   ②「回二级继续规划」在角度未应用时静默拒绝（仅状态行小字）。修复：drawPreview 实时
   预览（绕地块中心旋转已划分区线，仅显示不落数据，点应用才真正重划）；回二级前自动
   应用；状态行成功绿/失败红着色。runye-map-partition.js ?v=481-angle-live）→
   v483-angle-preview（用户实测指正：v481 预览把分区格整块刚性旋转，格外边缘跟着转出去，
   看起来像「地块轮廓线也转动了」。改为只画分割线：从分区格边提取分割线（按方向+法向
   偏移归并共线段），旋转后与真实地块环求交取弦、越界裁掉——轮廓永不旋转，与正式应用
   的引擎行为（重划+按边界裁剪）一致。runye-map-partition.js ?v=483-angle-preview）→
   v485-ai-panel-hide（用户要求取消二级页右缘「AI灌溉方案规划」悬浮面板（含折叠竖条），
   但保留导航栏「智能规划」功能。关系澄清：导航「智能规划」= 新窗口打开 index.html?smart=1
   （runye-ai-plan.js smartEntry 分支 → installSmartWorkbench 全屏工作台）；悬浮面板与它共用
   同一脚本但互不依赖；工具栏「🤖 AI规划」按钮也走独立窗口。改法：syncSection 在非
   smartEntry 页面恒 display:none（面板仍创建、绑定与导出/导入/回传逻辑零改动）。
   runye-ai-plan.js ?v=484-ai-panel-hide）→
   v486-angle-fix（用户实测：旋转角度时「分区混乱」——不规则地块的格子被边界裁剪后带有
   沿边界走的跟随边，v483 提取分割线时把跟随边也当分割线并按边自身方向延伸，方向族实测
   从理论 2 个暴增到 4+ 个（76/83/166/173/113°），边界被当成一堆旋转线画出。修复：只收
   平行于分割方向 ±2.5° 内的边（点积 |投影|≥0.999），跟随边一律跳过；线延伸方向恒用
   分割方向 dir。runye-map-partition.js ?v=486-angle-fix）→
   v487-src-label-gap（用户要求：「水源/水泵」标注文字与水源点示意圆脱开距离——原间隙仅
   约 6px 几乎贴着。施工图 SVG：标签基线 -16→-30、流量/扬程行 +22→+32；交互画布「水源」
   基线 -13→-22。mod/plot-editor.js ?v=487-src-label-gap）→
   v488-worst-in-plotgroup（用户实测：三级简图紫色最不利路径水流动画线与管道路径恒定偏位约 8px——
   根因：紫线是唯一画在 #tlPlotGroup 地块组之外的几何图层，而 tlInitDrag 的图面拖动位移
   存 localStorage['tl-plot-pos'] 且每次重生成自动恢复，组内管线整体平移、组外紫线不动。
   修复：记 tlPlotGCloseIdx 后 splice 插到地块组闭合前（随拖动平移；时序仍在快照落地后）。
   mod/inline-09.js ?v=488-worst-in-plotgroup）→
   v489-legend-right（用户实测：三级简图底部图例与参数行重叠——参数行从左起排、长了
   压到居中图例。图例 6 槽位（总宽约 346px）改靠 A3 右边框对齐：lx=svgW/2-180 →
   svgW-358（右缘距 frame 右边线 4px），与参数行同基线不变。
   mod/inline-09.js ?v=489-legend-right）→
   v490-mapside-style-slim（用户要求：在线地图左栏样式逐层扒开简化、不影响整体效果。
   按 ui-style-reference 单一出处方法论只删死码/并自冲突，不改任何活规则：
   ① 删 v322 全局滚动条段（*::-webkit-scrollbar 四条，全被 runye-theme.css v383
     同特异性后加载覆盖，实际生效一直是 theme 的 4px 灰丸）；左栏局部 5px 绿拇指
     （.side/.sr-list 专属规则，特异性更高）保留不动。
   ② .side 右边框两处自冲突（s-300 + 块尾 v322 transparent）合并为一处 transparent。
   ③ 删 10 处被 runye-typography.css 13px !important 压死的 button/input/select
     font-size 声明（.mbtn/.sr-item/.place-go/.place-del/.place-send/.map-float-actions
     .mbtn/.ry-angle-panel .save-row .mbtn/#mapPartitionTools select/.ang-btn/
     .map-angle-value input/.side input[type=text]/.ah-fold）——字号统一出处=typography 层。
   ④ 删 :root 死变量别名 --s-200/--s-600（全页零引用）。
   等价性：27 项 computed style 快照（_mapside_snap.js）before/after 全一致，
   左栏截图目视一致。runye-map-measure.html）→
   v491-recipe-lib（用户要求：红框 10 项输入参数可整组保存为命名方案、随时调用，
   持续沉淀「地区 × 作物 × 铺设配置」配方库。二级左侧面板 #ppPlanBar 下新增
   #ppRecipeBar（名称框+存/下拉+调用/✎改名/🗑删除，无弹窗，反馈走状态行）；
   数据 = localStorage['runye_irrigation_recipes_v1']；逻辑 = plot-editor.js
   ppRecipeFlow（复用 ppAiPlanFlow 的 snapshot/apply 模式：回填派发 change/input
   触发实时重算 + tlPlanTargetV 联动 + 按新参数重划分区）；皮肤 = ry-panel.css
   .pp-recipe-*（24px 控件/6px 圆角/品牌绿，对齐面板基准档案）。
   mod/plot-editor.js ?v=491-recipe-lib、mod/ry-panel.css ?v=491-recipe-lib）→
   v492-cad-recipe-skin（用户实测：CAD 工具栏宿主里配方行是浏览器默认样式——
   根因 = 皮肤只写在 ry-panel.css 的 #pipePlanSection 前缀，宿主把面板节点移入
   #ryCadSide 后选择器失配；按基准档案流程跑 scripts/refresh-cad-twin-css.cjs
   重新生成 #ryCadTwinCss 镜像，.pp-recipe-* 以 #ryCadSide [data-pp=...] 前缀
   同步入镜像（同时同步了 style-01.css 单选择器写法的 4 条过期镜像差异）。
   index.html #ryCadTwinCss，随 SW 更新生效）→
   v493-recipe-ui-tweak（用户要求：①「💾 存」去图标只留「保存」两字；
   ②方案标签不再占 84px 基准列改紧凑排，名称框从标签右侧一直撑到保存按钮。
   mod/ry-panel.css ?v=493-recipe-ui-tweak + 镜像重新同步）→
   v494-map-draw-toolbar（用户要求：在线地图左栏「绘制」区整体迁出，做成地图区
   顶端的可拖动工具条。runye-map-measure.html：左栏删「绘制」section（注释留恢复
   说明），.map-wrap 内新增 #mapDrawTools（抓手 ⠿绘制 + 开始画框/完成并画下一块/
   加点/撤销/测距/清除 六钮，id 全部不变 → online-map.js 零改动）；拖动/位置记忆
   复用 mod/ry-panel.js rypDraggable（bounds=.map-wrap，clamp 在地图区内 = 永不
   超出导航栏；位置存 localStorage['mapDrawToolsPos']）；ry-panel.js 新增
   data-ry-default-left 默认水平位置钩子（未设置走原右缘逻辑，既有面板零影响）。
   mod/ry-panel.js ?v=494-drag-default-left（index.html + runye-map-measure.html
   两处引用同步抬）。 -->
   v495-map-draw-toolbar（用户截图反馈「工具栏在哪里？没看到」——根因：在线地图在
   独立页 runye-map-measure.html 与主程序 index.html #onlineMapSection 各有一份
   副本，v494 只改了独立页。本次同步主程序内嵌版：index.html 删左栏「绘制」section
   （注释留恢复说明）、.map-wrap 内 #map 后插入同款 #mapDrawTools（结构/属性与
   独立页完全一致，id 不变 → online-map.js 零改动）；mod/online-map.css 尾部追加
   #onlineMapSection .map-draw-tools 系列样式（含 .dt-grip/.mbtn/.btn-on），引用
   ?v=441-map-main-section 抬为 ?v=495-map-draw-toolbar。教训入档：改在线地图
   必须同步两处副本。index.html / online-map.css 均在 CORE 白名单，必须抬版本）→
   v496-map-hint-remove（用户要求：删掉测量结果栏下方那段绘制流程长提示
   （「点击地图添加顶点；拖动顶点可微调……面积按真实球面经纬度计算。」）——没啥用。
   index.html 与 runye-map-measure.html 各删一行 <div class="hint">（在线地图按
   v495 教训两处副本同步改）；online-map.js 的状态提示（十字光标/成组等）不动。
   两文件均在 CORE 白名单，必须抬版本）→
   v497-map-side-font（用户要求：在线地图左栏「定位三亚/切换底图/GeoJSON/KML/导入地块…」
   等文字缩小。按钮/输入框 13px→11px、高度 34→28px；栏目标题 .sec-t 11→10px。
   v490 起 typography.css 对 button/input 全局 13px !important，故用
   #onlineMapSection .side（独立页 .side）作用域 + 同载 !important 靠 specificity 压过；
   浮动面板（分区角度/地图浮动钮）在 .map-wrap 内不受影响。mod/online-map.css 尾部追加
   + index.html 引用 ?v= 抬为 497-map-side-font + runye-map-measure.html 页内
   <style> 追加 .side 作用域同款（v495 教训：两处副本同步改）。
   三文件均在 CORE 白名单，必须抬版本）→
   v498-pump-override-merge（统一合并面板分类选径与图面逐段改径，避免更新扬程时丢失任一覆盖；
   inline-09 暴露图面口径快照给合并器；更新主页面两个脚本查询版本及核心缓存版本）→
   v499-plot-library-store（并行会话：新增 core/plot-library-store.js 地块图库 store 并登记 CORE；
   inline-13.js（地块传输）与 online-map.js（在线地图）接入该 store，index.html / 地图独立页
   两处引用抬版本）→
   v503-ui-batch-plot-store【本次发布批量上线，含并行会话 v499 与以下用户需求改动】：
   ① v499-partition-inner：分区格改为只画内部共享边，修复「我的地块 vs 当前地块」重复轮廓
      （原来逐格画整框，分区重划后与地块环差数米 ⇒ 视觉双圈）；
   ② v500-dim-gap：三级简图右缘竖向尺寸标注基准间距 14→30px（原太贴地块边线，版面挤）；
   ③ v501 + v503：轮灌演示动画提速 —— 先整体减半（flow .85→.425s 等），再按用户要求只把
      **水流动画** flow .425→.22s；valve-open .25s / valve-ring .85s / src-pulse .75s 与
      轮播间隔 2s 保持不变；
   ④ v502-terrain-title：地形模块标题去掉 ⛰️ 图标（terrain/index.html + index.html 内嵌版两处）；
   ⑤ 在线地图「保存地点」按钮去 💾 图标并移入搜索行右侧（search → 搜索 → 保存地点），
      index.html 与 runye-map-measure.html 两处副本同步改（v495 教训）。
   index.html / runye-map-measure.html / runye-map-partition.js / mod/inline-09.js 均在 CORE
   白名单，必须抬版本。 */
// v506-map-list-delete-store：在线地图“我的地块”列表删除改为共享store读取+revision条件替换，失败时保留原数据。
// v505-map-plot-store-cas：地图增强层的合并、解散、备注、删除和自愈改为共享地块库store的revision条件写入；
// 损坏/重复编号/并发冲突时停止写入，并更新主页面与独立地图页资源版本。
// v507-auto-current-safe-write：主规划页自动地块清理/同步改走共享store，坏库、重复ID及revision冲突均拒绝覆盖。
// v508-project-import-safe-rollback：在线地图工程导入走地块库store；多键失败回滚按revision/已写入快照保护。
// v510-remove-missing-pages：移除已删除的AI协同跳转页与旧测试面板页面的CORE缓存引用，避免预缓存请求悬空。
// v509-flow-in-plotgroup（2026-10-16 用户实测截屏「三级简图水流动画的路径偏离了，应该跟总管/主管/
// 支管都重叠」）：轮灌演示的水流层原先 appendChild 到 svg 根，不随 #tlPlotGroup 的「图面整体拖动」
// transform=translate(x,y) 平移 —— 病史同 v183 节点层、v488 紫线标注。图面只要被拖动过（哪怕手抖
// 微拖一下就会写进 localStorage 'tl-plot-pos'），水流就与管道平行错开（实测位移 (24,16) ⇒ 偏 29.1px）。
// 修法：水流层改为挂进 #tlPlotGroup（无该组时退回 svg 根），并同步抬 index.html 的 inline-09.js ?v=。
// mod/inline-09.js 在 CORE 白名单，必须抬版本。
/* v504-demo-interval（2026-10-16 用户要求「两个地块切换的时长也要缩短」）：轮灌演示**切换节奏**
   2000→1000ms。注意与 v501/v503 区分——那两次改的是水流/阀门动画本身跑多快（.22/.25/.85/.75s，
   本次不动），这次改的是「多久换下一组」。间隔抽成具名常量 TL_DEMO_INTERVAL_MS（inline-09.js），
   ▶ 按钮 title 与三处注释同步改为「1 秒一组」；index.html 引用 inline-09.js ?v=500-dim-gap
   → ?v=504-demo-interval。mod/inline-09.js 在 CORE 白名单，必须抬版本。 */
/* v511-nav-rebind（2026-10-16 用户实测「管路规划切换三级简图之后，再点击管路规划，无法切换到
   管路规划页面」）：顶部导航的点击绑定失效。runye-nav.js 的 RyEntitle.onChange → RyFnNav.render()
   会在会员权益异步就绪时**重建**全部 [data-ry-navitem]，而 mod/inline-18.js 在解析期就把 click
   绑在那批旧元素上 ⇒ 新元素只剩浏览器原生锚点跳转 → hashchange → ryJumpToSection →
   ryShowSection（这条路径不复位视图，三级仍停 data-ry-view="pipe"、data-ry-clean 仍 "1"），
   同时 activate() 点亮的是脱离文档的旧节点 ⇒ 导航高亮一并丢失。
   修法：收集抽成可重入 collectItems()；点击行为抽成具名 navItemClick()；绑定按元素标记去重；
   在 #fnNav 上挂 MutationObserver（childList+subtree），重建后重收 + 补绑 + 按当前激活功能区
   恢复高亮。病史同 v376 的「重建后 href 改写丢失」。mod/inline-18.js 在 CORE 白名单，必须抬版本。 */
/* v513-sec-gate-hydraulic-coord：
   ① [安全审计] L2 门控补齐 —— 会员门控链路自查发现
      (a) runye-entitle.js 的 mockPlan 可被控制台一行改写（提权写入口）、
      (b) RyEntitle.state 交出的活对象可就地篡改提权、
      (c) 绘图编辑器静态按钮 #ppAiPlan 无任何权益校验、
      (d) terrain/index.html 与 管路接驳拼装.html 独立 URL 直达零校验。
      修法：runye-entitle.js 只读访问器 + 深冻结 state；plot-editor #ppAiPlan fail-closed；
      terrain-ui.js 统一门控（独立页 + 主页 #terrainSection 两入口）；管路接驳拼装.html 补门控。
   ② [并行会话] 水力拓扑拒绝 NaN/越界经纬度管段。
   ①② 均改到 CORE 白名单内文件 → 必须抬版本重建离线缓存。 */
const VERSION = 'v513-sec-gate-hydraulic-coord';
const BASE = new URL('./', self.location.href);
const PREFIX = 'runye-pwa-' + BASE.pathname + '-';
const CORE_CACHE = PREFIX + VERSION + '-core';
const RUNTIME_CACHE = PREFIX + VERSION + '-runtime';
const CORE = [
  /* [插件化阶段一 2026-10-11] 插件体系静态资源。
     ★ 新增插件必须同步登记到本列表，否则 PWA 离线态取不到（在线仍可用：本 SW 为 network-first）。
     ★ 注意：key() 会抹掉 ?v= 查询串，因此带版本号破缓存与这里的登记互不冲突。 */
  "plugins.json",
  "core/bootstrap.js",
  "core/loader.js",
  "core/event-bus.js",
  "core/data-service.js",
  "core/plot-library-store.js",
  "core/irrigation-data-store.js",
  "core/terrain-bridge-store.js",
  "core/sprinkler-bridge-store.js",
  "core/ui-shell.js",
  "core/runtime-guard.js",
  "plugins/hello-world/manifest.json",
  "plugins/hello-world/main.js",
  "plugins/archive/manifest.json",
  "plugins/archive/main.js",
  "plugins/archive/style.css",
  "plugins/bom/manifest.json",
  "plugins/bom/main.js",
  "plugins/bom/style.css",
  "plugins/case-lib/manifest.json",
  "plugins/case-lib/main.js",
  "plugins/case-lib/style.css",
  "plugins/pipe-optim/manifest.json",
  "plugins/pipe-optim/main.js",
  "plugins/calib/manifest.json",
  "plugins/calib/main.js",
  "plugins/calib/style.css",
  /* [v377] 水力校核壳迁移插件 */
  "plugins/hydraulics/manifest.json",
  "plugins/hydraulics/main.js",
  /* [v385] 管路拼装壳插件随四功能剥离下线（页面文件保留，恢复时把两行加回） */
  /* [v381] 智能规划壳迁移插件（独立窗口入口） */
  "plugins/ai-plan/manifest.json",
  "plugins/ai-plan/main.js",
  /* [v384] 喷灌成果壳插件（terrain 内核宿主，任务书 TASK_sprinkler-pipeline_20261012） */
  "plugins/sprinkler/manifest.json",
  "plugins/sprinkler/main.js",
  /* [v390] 四功能壳迁移插件：过滤系统 / 材料清单 / 轴测图 / 系统图（业务零改动，只接管导航入口） */
  "plugins/filter-system/manifest.json",
  "plugins/filter-system/main.js",
  "plugins/material-list/manifest.json",
  "plugins/material-list/main.js",
  "plugins/sys-view/manifest.json",
  "plugins/sys-view/main.js",
  /* [v397] 等高线解析插件（TASK_contour-dxf_20261012，DXF → 高程点 → 地形高差） */
  "plugins/contour-dxf/manifest.json",
  "plugins/contour-dxf/main.js",
  "plugins/contour-dxf/style.css",
  /* Main page local scripts required for case library, local/cloud adapter and undo. */
  "runye-case-library.js",
  "cloud-sync.js",
  "runye-undo.js",
  /* [v357] 单文件拆分产物 */
  "mod/inline-01.js",
  "mod/inline-02.js",
  "mod/inline-03.js",
  "mod/inline-04.js",
  "mod/inline-05.js",
  "mod/inline-06.js",
  "mod/inline-07.js",
  "mod/inline-08.js",
  "mod/inline-09.js",
  "mod/plan-calc-render.js",   /* [v424-plan-calc-render] 扬程计算式与分解展示 */
  "mod/tl-header-layout.js",   /* [v423-header-layout] 三级简图标题换行与拖动布局 */
  "mod/material-table.js",   /* [v421-mat-table] 材料清单/材料表管理预缓存 */
  "mod/inline-10.js",
  "mod/inline-11.js",
  "mod/plot-editor.js",   /* [v420-split] 绘图编辑器 IIFE（自 inline-11 迁出，紧随其后加载） */
  "mod/inline-12.js",
  "mod/inline-13.js",
  "mod/head-system-svg.js",   /* [v422-head-system-svg] inline-14 的纯 SVG 核心 */
  "mod/inline-14.js",
  "mod/inline-15.js",
  "mod/inline-16.js",
  "mod/ry-diag.js",
  "mod/inline-17.js",
  "mod/inline-18.js",
  "mod/inline-19.js",
  "mod/inline-20.js",
  "mod/inline-21.js",
  "mod/inline-22.js",
  "mod/inline-23.js",
  "mod/inline-24.js",
  "mod/inline-25.js",
  "mod/inline-27.js",
  "mod/inline-28.js",
  "mod/inline-29.js",
  "mod/inline-30.js",
  "mod/inline-32.js",
  "mod/ry-cad-toolbar.js",
  "mod/material-formulas.js",
  "mod/zone-geometry.js",
  "mod/flow-geometry.js",
  "mod/tl-polyline-geometry.js",
  "mod/ry-panel.js",
  "mod/ry-panel.css",
  "mod/online-map.css",
  "mod/online-map.js",
  "mod/style-01.css",
  "mod/style-03.css",
  "mod/style-04.css",
  "mod/style-05.css",
  "filter-system/filter-system.css",
  "filter-system/filter-system.js",
  "hydraulic-calc/design-core.js",
  "hydraulic-calc/hc-core.js",
  "hydraulic-calc/hydraulic-calc.css",
  "hydraulic-calc/hydraulic-calc.js",
  "hydraulic-calc/hydraulics-wasm.js",
  "hydraulic-calc/native-bridge.js",
  "hydraulic-calc/pipe-path-loss.js",
  "index.html",
  "plugin-admin.html",
  "runye-inverse-design.js",
  "runye-inverse-design.css",
  "runye-terrain.js",
  "runye-terrain.css",
  "runye-ai-plan.js",
  "runye-ai-plan.css",
  "manifest.webmanifest",
  "modeling/integration.js",
  "modeling/workspace.css",
  "pipe_optim_ui.js",
  "pwa/icons/apple-touch-icon.png",
  "pwa/icons/icon-192.png",
  "pwa/icons/icon-512.png",
  "pwa/icons/icon-maskable-512.png",
  "pwa/offline.html",
  "pwa/pwa.css",
  "pwa/pwa.js",
  "pwa/vendor/LICENSE",
  "pwa/vendor/epanet/index.mjs",
  "pwa/vendor/epanet/slim/index.mjs",
  "pwa/vendor/images/layers-2x.png",
  "pwa/vendor/images/layers.png",
  "pwa/vendor/images/marker-icon-2x.png",
  "pwa/vendor/images/marker-icon.png",
  "pwa/vendor/images/marker-shadow.png",
  "pwa/vendor/leaflet.css",
  "pwa/vendor/leaflet.js",
  "runye-dxf.js",
  "runye-entitle.js",
  "runye-member-ui.js",
  "runye-material-audit.js",
  "runye-geo.js",
  "runye-hydraulics.html",   /* 兼容独立入口 */
  "runye-hydraulics-core.js",
  "runye-hydraulics-page.js",
  "hydraulics-main.css",
  "runye-landing.html",
  "runye-map-enhance.js",
  "runye-map-partition.js",
  "runye-map-measure.html",
  "runye-mobile-map-preview.css",
  "runye-mobile-map-preview.html",
  "runye-mobile-map-preview.js",
  "runye-mobile-partition.js",
  "runye-mobile.css",
  "runye-mobile.js",
  "runye-nav.css",
  "runye-nav.js",
  "runye-theme.css",
  "runye-typography.css",
  "terrain/index.html",
  "terrain/terrain-core.js",
  "terrain/terrain-main.css",
  "terrain/terrain-ui.js",
  "terrain/terrain.css",
  "tl-workspace/tl-auto-edits.js",
  "tl-workspace/tl-edit-pipes.js",
  "tl-workspace/tl-nodes.js",
  "tl-workspace/tl-path-measure.js",
  "tl-workspace/tl-workspace.css",
  "tl-workspace/tl-workspace.js"
];
const LEAFLET_CDN = 'https://unpkg.com/leaflet@1.9.4/dist/';
const LEAFLET_FILES = ['leaflet.js','leaflet.css','images/layers.png','images/layers-2x.png','images/marker-icon.png','images/marker-icon-2x.png','images/marker-shadow.png'];
const CORE_URLS = new Set(CORE.map(path => new URL(path, BASE).href));

self.addEventListener('install', event => {
  // Atomic install: retain the previous working worker if any required file fails.
  // [v435-skip-waiting] 预缓存全部成功后才 skipWaiting：新 SW 立即接管、配合 activate 的
  // clients.claim() 让刷新后的页面不再被旧 SW 的旧缓存投递（根治「改了样式看不到」的
  // 混合投递问题）；若预缓存失败则不接管，保留原子性。
  event.waitUntil(caches.open(CORE_CACHE).then(cache => cache.addAll(CORE.map(path => new Request(new URL(path, BASE), {cache:'reload'})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(PREFIX) && name !== CORE_CACHE && name !== RUNTIME_CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});
function key(url) {
  const result = new URL(url); result.search = ''; result.hash = '';
  if (result.pathname === BASE.pathname) result.pathname += 'index.html';
  return result.href;
}
async function save(request, response) {
  if (!response.ok || response.type === 'opaque' || /no-store/i.test(response.headers.get('Cache-Control') || '')) return;
  const url = key(request.url);
  if (CORE_URLS.has(url)) {
    await (await caches.open(CORE_CACHE)).put(url, response.clone());
    return;
  }
  // Only small static resources; never cache user uploads, APIs, tracking or map tiles.
  if (!/\.(?:html|js|css|png|svg|ico|woff2?)$/i.test(new URL(url).pathname)) return;
  const length = Number(response.headers.get('Content-Length'));
  if (!length || length > 2 * 1024 * 1024) return;
  const cache = await caches.open(RUNTIME_CACHE);
  await cache.put(url, response.clone());
  const entries = await cache.keys();
  for (const entry of entries.slice(0, Math.max(0, entries.length - 80))) await cache.delete(entry);
}
async function local(request, event) {
  try {
    const response = await fetch(request);
    if (response.ok) { event.waitUntil(save(request, response).catch(() => {})); return response; }
    const cached = await caches.match(key(request.url));
    if (!cached && request.mode === 'navigate' && (response.type === 'error' || response.status >= 500)) return caches.match(new URL('pwa/offline.html', BASE).href);
    return cached || response;
  } catch (error) {
    const cached = await caches.match(key(request.url));
    if (cached) return cached;
    if (request.mode === 'navigate') return caches.match(new URL('pwa/offline.html', BASE).href);
    throw error;
  }
}
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.href.startsWith(LEAFLET_CDN)) {
    const path = url.href.slice(LEAFLET_CDN.length).split('?')[0];
    if (LEAFLET_FILES.includes(path)) {
      event.respondWith(caches.match(new URL('pwa/vendor/' + path, BASE).href).then(cached => cached || fetch(request)));
    }
    return;
  }
  if (url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname) || url.pathname.endsWith('/sw.js')) return;
  if (request.mode === 'navigate' || /\.(?:js|css|png|svg|ico|woff2?|webmanifest)$/i.test(url.pathname)) {
    // Online always uses the server so subsequent releases cannot get stuck on old UI.
    event.respondWith(local(request, event));
  }
});
