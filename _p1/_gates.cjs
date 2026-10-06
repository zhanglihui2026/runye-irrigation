/* 润野灌溉 · 标准闸门批跑器（2026-09-17 第五十四轮落地，可复用）
 *
 * 用法：node _p1/_gates.cjs [--filter=正则]
 *   · 逐条 spawnSync（cwd=项目根 + NODE_PATH），打印 EXIT 与耗时；
 *   · 全量报告 fs.writeFileSync(..., 'utf8') 落盘 → _p1/_gates_out.txt
 *     （绕开 PowerShell 中文乱码；每条的尾部输出都留在报告里）；
 *   · eq 额外全量另存 _p1/_gates_eq_full.txt（尾部截断会看不到第 1/2 层的场景清单）。
 *
 * ★ 三个坑（都踩过）：
 *   1) `node --test <目录>` 在 Node 22 报 MODULE_NOT_FOUND —— 必须显式列 tests/*.test.cjs 文件；
 *   2) 单测 / e2e 里有按相对路径读盘或要求 cwd=项目根的，spawnSync 必须带 cwd（本脚本统一带）；
 *   3) ★ 2026-10-02（v184）新踩：**沙箱里 spawnSync 会以 EBUSY 失败**（连 `node --version` 都起不来），
 *      此时每条都得到 status=null / 0.0s，而旧版代码把它一律 `bad++` ⇒ 报告末尾打印
 *      「EXIT≠0 的条目数 = 43」——**看上去像 43 个真红项，其实一条闸门都没跑**。
 *      这与「只打印不设退出码」是同一类病（闸门自己骗人）的又一种形态：
 *      前者的病是「一律绿」，这里的病是「一律红」。**两头都要防**。
 *      现修法（两道）：
 *        ① 开跑前 preflight：spawnSync(node, ['--version'])，非 0 就**立即中止**并落盘
 *           `★ 批跑中止：... 本报告不是闸门结论`，退出码 = 2（与环境/真红区分开）；
 *        ② 循环内每条判 `r.error`：命中即标 `★SPAWN-FAIL(code)`，计入独立计数 envBad，
 *           末尾单独点名 —— 绝不再混进 `bad`（真红）里。
 *      取证：`node _p1/_spawnprobe.cjs`（终态 SPAWN_BLOCKED = 环境不让派生）。
 */
'use strict';
const { spawnSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const WS = path.resolve(__dirname, '..');
const NODE = process.execPath;
const NODE_PATH = 'C:\\Users\\AHS\\.workbuddy\\binaries\\node\\workspace\\node_modules';
const env = Object.assign({}, process.env, { NODE_PATH });
const p = (...a) => path.join(WS, ...a);
const arg = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith('--' + name + '='));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const FILTER = arg('filter', '');
/* ★ --emit：只把清单以 JSON 打印出来就退出，**不派生任何子进程**（2026-10-02 v184）。
   由来：本机环境里 node 派生**任何**子进程都 EBUSY（node→node / node→bash / node→cmd 全失败，
   见 _p1/_spawnmatrix.cjs），于是本脚本在这里永远跑不动；而 bash→node、python→node 都正常。
   ⇒ 让本脚本当「清单的单一来源」，由 _p1/_gates_run.py（python 驱动）去逐条真跑，
     两者共用同一份 LIST，不会各写一份清单然后走散。 */
const EMIT = process.argv.includes('--emit');

const testFiles = fs.readdirSync(p('tests')).filter((f) => /\.test\.cjs$/.test(f)).sort().map((f) => p('tests', f));

const LIST = [
  ['syntax tl-workspace.js', ['--check', p('tl-workspace', 'tl-workspace.js')]],
  ['syntax iso-diagram.js', ['--check', p('iso-diagram', 'iso-diagram.js')], ['iso-diagram', 'iso-diagram.js']],
  ['主闸门 verify_ry_tool.js', [p('verify_ry_tool.js'), WS]],
  ['单测 tests/(' + testFiles.length + ' 文件)', ['--test'].concat(testFiles)],
  ['e2e _wsstats_e2e', [p('_p1', '_wsstats_e2e.cjs')]],
  ['e2e _wpath_e2e', [p('_p1', '_wpath_e2e.cjs')]],
  ['e2e _headbreak_e2e', [p('_p1', '_headbreak_e2e.cjs')]],
  ['e2e _calmenu_e2e', [p('_p1', '_calmenu_e2e.cjs')]],
  ['e2e _pipecard_e2e', [p('_p1', '_pipecard_e2e.cjs')]],
  ['e2e _pimulti_e2e', [p('_p1', '_pimulti_e2e.cjs')]],
  ['e2e _legend_e2e', [p('_p1', '_legend_e2e.cjs')]],
  ['e2e _isocalchip_off_e2e', [p('_p1', '_isocalchip_off_e2e.cjs')]],
  ['e2e _hydcalc_e2e', [p('_p1', '_hydcalc_e2e.cjs')]],
  ['e2e _fitbtn_e2e', [p('_p1', '_fitbtn_e2e.cjs')]],
  ['e2e _filtnav_e2e', [p('_p1', '_filtnav_e2e.cjs')]],
  /* v80（2026-09-19）：_filtersys_e2e 此前是**孤儿探针** —— 写了 119 条过滤系统契约却从没进过闸门清单，
     于是它一直在报没人看的红（三条宽度断言因自身脏状态恒红）。本轮修掉脏状态后纳入批跑，
     它的职责正是「方式一（现状）不被改坏」，与下面这条配成一对。 */
  ['e2e _filtersys_e2e（过滤系统全契约 · 方式一不被改坏）', [p('_p1', '_filtersys_e2e.cjs')]],
  ['e2e _filtersys_mode_e2e（v80 反冲洗接法 方式一 ⇄ 方式二）', [p('_p1', '_filtersys_mode_e2e.cjs')]],
  ['shot _shot_fs_dimzoom（v57 端线朝图形延长契约）', [p('_p1', '_shot_fs_dimzoom.cjs'), 'gate', '4']],
  ['shot _shot_fs_couplabel（v58「沟槽快接」标注不压图形契约）', [p('_p1', '_shot_fs_couplabel.cjs'), 'gate']],
  /* v81（2026-09-19）：唯一能拦「文字互相压 / 压在管带上 / 被裁出视口」的探针 —— 这三种毛病
     静态契约与几何断言全都看不见，只有渲染态 bbox 才量得出来。该脚本自带真实退出码
     （BAD[] → exitCode=1），可以进批跑。 */
  /* ★ v90 收紧：_shot_v81_side 的「压管带」判定原为「两方向交叠都 ≥4px」，
     而「③ 出水」标签压在绿色管带上只有 2.0px、压 ③ 断面圆 5.0×3.3px（横向 3.3 < 4）——
     两条都刚好卡在阈值下 ⇒ 假绿（用户却肉眼看到重叠）。现改为**真交叠 ≥1px** 即算违规。 */
  ['shot _shot_v81_side（v81 方式一/二侧视版面契约：重叠/溢出/压管带 ≥1px）', [p('_p1', '_shot_v81_side.cjs')]],
  /* v90（2026-09-20）：「③ 出水」标签移到 ③ 出水管上方。上面那条只测默认参数，
     而标签位置用的是**绝对 px 锚点**、管带厚度 = dnBr×sc 随参数变 ⇒ 必须跨参数组合验证。
     本项 9 组参数 × 2 接法，断言「标签底沿 ≤ 管带顶沿 −2px」+ 与任何文字/管带/实体/断面圆
     零交叠 + 不溢出视口；已做「注入缺陷 → 断言 EXIT=1」体检（换回改动前版本 ⇒ 18/18 全红）。 */
  ['shot _verify_fs_outlet_label_v90（v90 ③ 出水 标签在管带上方 · 9 组参数 × 2 接法）', [p('_p1', '_verify_fs_outlet_label_v90.cjs')]],
  /* v108（2026-09-22）：压力表 PG1/PG2 方向恒「朝上族」（up 正上 / diag 斜上，禁 down/left/right），
     且侧视 ③ 文字不得压 PG2 正上候选走廊（文字挡走廊 ⇒ 择优落朝左，用户批注复现根因）。
     9 组参数 × 2 接法 × 4 视图；豁免两项并注明实证：c9degen（Δ<od/2 投影重叠无解）整组、
     c7small 仅 axo（小参数图面密集，15 个朝上候选全灭，截图 c7_modea_axo.png）。 */
  ['shot _verify_fs_gauge_dir_v108（v108 压力表恒朝上 + ③ 文字不挡走廊 · 9 组 × 2 接法 × 4 视图）', [p('_p1', '_verify_fs_gauge_dir_v108.cjs')]],
  /* v82（2026-09-19）：四窗口一起改接法后，上面那条只查侧视不够了。本探针查 4 视图 × 2 方式 = 8 张图，
     拦「文字互撞 ≥4×4px / 文字被裁出视口」两类眼病；「压在管带上」在这里降级为提示
     （本项目把 V1/G1/P1 标签压在阀体·罐体符号上是既有画风，判红会变成假红）。
     已注入缺陷体检：① 加长前视脚注→溢出红 ② 侧视叠字→重叠红，两次 EXIT 均为 1。 */
  ['shot _shot_v82_four（v82 四视图 × 两方式版面契约：重叠/溢出）', [p('_p1', '_shot_v82_four.cjs')]],
  ['e2e _fs_axozoom_e2e（v59 轴测图放大到四窗之和）', [p('_p1', '_fs_axozoom_e2e.cjs'), 'gate']],
  ['e2e _fs_mapplace_e2e（v60 地图搜索定位/保存地点/位置记忆）', [p('_p1', '_fs_mapplace_e2e.cjs'), 'gate']],
  ['e2e _fsside_circle_e2e（v61 侧视断面圆遮住管带）', [p('_p1', '_fsside_circle_e2e.cjs'), 'gate']],
  ['e2e _probe_v62_caltext（v62 改径汇总条去尾·渲染态文本）', [p('_p1', '_probe_v62_caltext.cjs'), 'v62']],
  ['e2e _probe_v63_hc2dp（v63 水力计算器长度/流量两位小数）', [p('_p1', '_probe_v63_hc2dp.cjs'), 'v63']],
  ['e2e _autoedits_e2e', [p('_p1', '_autoedits_e2e.cjs')]],
  /* v85（2026-09-20）：① 立管高度可调（cfg.inRise）+ 轴测图放大后长引注缩小（引注码 fs-tcode 不变）；
     v86（同日）：左栏参数改名「排污管朝后伸出」→「排污支管长」（含方式二计算表行名与交叉引用）。
     本项 48 条渲染态契约；已做「逐项注入缺陷 → 断言 EXIT=1」体检 **8/8 命中**
     （见 _p1/_v85_gate_inject.py），且体检里修掉了一处**空集假绿**：
     B5/B6/B7/B8/B2 都补了「条数必须是 7/4/11」的前置，否则「一个引注码都没有」也算通过。 */
  ['e2e _v85_e2e（①立管高度可调 + 轴测放大只缩长引注 + v86 参数改名）', [p('_p1', '_v85_e2e.cjs')]],
  ['static _v85_static（v85/v86/v87 冻结环 + v88 现场环 + v89 撤销残留核对）', [p('_p1', '_v85_static.cjs')]],
  /* ★ v87（轴测「视角 n/4」四方位）已于 v89 **撤销**（2026-09-20 用户决定）：
     四个方位下「管子横穿罐体 / 远罐压住近罐」＝图层顺序只按原方位排过；修对＝按深度重排整张图，
     而现顺序里编码着 v43/v52 两类分方位的用户批注，收益不抵成本 ⇒ 连按钮一起去掉。
     故 _v87_e2e 这一项**随之删除**（留着一个已不存在的契约＝永久假红）；
     反向契约改由 verify_ry_tool.js 的 13b) 承担（v87 机械一旦复活必须报红），
     隔离残留核对由 _v85_isolate.py 第 5 环承担。 */
  /* v89（2026-09-20）：把 v87 的「视角 n/4」四方位整个撤销（用户：透视问题不做，切换也取消）。
     撤销用的是**构造式还原**：目标 = .v86 快照 + _patch_v88.py（见 _p1/_patch_v87off.py），
     不是手工删代码 —— v87 是「新增整块模块级代码 + 4 处投影/标注改写 × A、B 两份拷贝」，手删必漏。
     本项渲染态判据 × 2 方式：轴测 SVG 的 **长度 + FNV 哈希必须等于 v87 改动前的快照**
     （a: 13092/6ee6966e，b: 13857/ad210f96，取自 _v87_snap_before.txt 与 _v87_snap_after.txt
     那份逐字节相同的实测快照）⇒ 即「逐像素回到原图」；外加视角按钮 0 个、卡头 .fs-zbtn 只剩 1 个、
     页面无「视角」字样、放大仍在且文案能切回、其余三视图仍渲染、零 pageerror。
     静态那一半（v87 机械一旦复活必须报红）在 verify_ry_tool.js 的 13b)。 */
  ['e2e _v89_e2e（v87 四方位已撤销：轴测图逐像素回到改动前 + 按钮消失）', [p('_p1', '_v89_e2e.cjs')]],
  /* v88（2026-09-20）：左栏操作按钮组从 2 个变 3 个（「恢复默认参数」从右列过滤损失卡下搬上来），
     同时取消两个按钮面上的 ⟵ / → —— 去箭头不是审美而是宽度硬约束（保留箭头 332 > 可用 303 必换行）。
     本项 10 组渲染态契约：按钮顺序/直系子元素/reset 唯一性、默认栏宽 348 必须一行、无横向溢出、
     无文字被裁、窄栏 300/280 允许换行但不许溢出或裁字、点搬家后的 reset 仍能复位参数、零 pageerror。
     静态那一半在 verify_ry_tool.js 的 13c)。 */
  ['e2e _v88_e2e（左栏三按钮同排：宽度账 + 窄栏兜底 + reset 仍生效）', [p('_p1', '_v88_e2e.cjs')]],
  /* v91（2026-09-20）：二级左栏「地块与灌溉参数」内新增「水泵提升高度 / 地形高差」两个可设定值
     （用户要求：放在「滴灌带间距」前面、变成可设定、原来的默认值不改）。
     实现上沿用 01 一级表单的 fld_lift / fld_dh 作唯一数据源，面板两框做双向镜像。
     本项 25 条渲染态契约，覆盖静态契约看不见的三件事：
       ① 顺序/标签/默认值（挪了顺序或改了默认值肉眼难发现）
       ② **真的接到计算** —— 只改镜像不驱动 calcPlan 的话，框能改、扬程不动（空壳功能）
       ③ 双向不打架 —— 「扬程计算式」条的内联编辑框写的是同一个量（程序化赋值不冒事件，
          静态契约完全看不见这条路径；C7 正是它抓出来的真缺陷，修法见 _patch_pp_liftdh_v91b.py）
       ④ 版面：新增两行不撑破左栏、文字不被裁、新 item 与同行既有 item 同款（46 属性逐字比对）
     已做注入缺陷体检 **2/2 命中**（见 _p1/_verify_pp_liftdh_v91_inject.py）：
       A 结构缺失（跑改动前的备份页）⇒ 报「缺少 #planLift」且给结论不崩
       B 空壳实现（把两框的 calcPlan 监听换成空函数）⇒ 报 C4b「扬程随之变大」。 */
  ['e2e _verify_pp_liftdh_v91（v91 二级左栏 提升高度/地形高差 两个可设定值）', [p('_p1', '_verify_pp_liftdh_v91.cjs')]],
  /* v92（2026-09-20）：过滤系统左栏「排污支管长」此前**只驱动方式二**（lwRunB 只在 B 版 5 个函数里被调，
     方式一那根「节点 → 贴地 ② 直落」的排污立管长度由标高链算死 660，与参数无关）——
     用户批注「只能驱动方式二，不能驱动方式一，要改下」，口径由用户选定 = **从节点起算**：
       方式一 ② 标高 = 节点 − 参数值 ⇒ 参数值就是那根竖直排污立管的长度；
       自动默认值 660 = 节点(+0.720) − 贴地 ②(+0.060) ⇒ 默认四视图逐像素不变。
     本项 68 条渲染态契约（5 组参数 × 2 接法），核心是「图上那根立管的像素长 = 参数值 × 比例尺（±1.5px）」——
     不是「动了一下」就算过；另含反向守卫（俯视 ② 投影线不动）、极端值不裁剪、换接法框里的数跟着变。
     已做注入缺陷体检 **4/4 命中**（见 _p1/_verify_fs_wrunA_v92_inject.py）：
       I1 方式一不读参数 / I2 框里写回旧 540 / I3 换接法不刷新左栏 / I4 自动值不区分接法。
     ★ 同时把两条**编码旧契约**的 e2e 断言改到新契约（_patch_fs_e2e_contract_v92.py）：
       _filtersys_e2e 的「wRun 默认 540」→ 方式一 660；_filtersys_mode_e2e 的「换接法后左栏全等」
       → 除 wRun 外全等 + 新增「660 − 540 = 罐口 120」。 */
  ['e2e _verify_fs_wrunA_v92（v92 排污支管长同时驱动方式一与方式二）', [p('_p1', '_verify_fs_wrunA_v92.cjs')]],
  /* v95（2026-09-21 用户口径）：三级「联合分区流量」= 该 N 下自动分组后**最大一组的实际面积和**
     （组号 = floor(分区序号 / N)，行主序；尾组按实际区数参与比较），不再是「单区流量 × N」的初步估算；
     「不同联合分区数总管对比」表 1/2/3/4/6/8 每档各按该 N 的最大组算；二级仍只体现「按最大分区」的估算。
     本项 73 条渲染态契约。夹具 = 1200×200m 锯齿地块（20 列 × 1 行；偶列满格 12000m²、奇列半格 6000m²）
     ⇒ 最大分区必与同组伙伴不同 ⇒ 旧口径值（24000/48000/72000/96000 m²）全部可被识破。
     判据核心是**独立复算**：自带鞋带公式 + 自带裁剪（裁剪平面顺序故意与产品实现不同）
     + 射线法栅格面积交叉校验（≤4%）+ 6 条手工单元用例（尾组只含 1 区 / 按行主序索引分组 /
     无多边形回退 / N=1 退化为单区）。 */
  ['e2e _combine_flow_e2e（v95 联合分区流量 = 该 N 下最大组实际面积和）', [p('_p1', '_combine_flow_e2e.cjs')]],
  /* v96（2026-09-21 用户截图指令）：#ppToolbar 顶部那六个「手工绘制管路」按钮
     （主管 / 支管 / 横竖锁定 / 水源 / 阀门 / 遮蔽管线）**隐藏**（只加行内 display:none，
     不删 DOM、不删 JS 引用 —— 删元素会打断无守卫的 #ppLineOrtho 监听，
     并改变 verify_sketchup.js 对 #ppToolbar .pp-btn 的计数值）。
     契约夹具无关：getComputedStyle 断 6 个 display===none + 7 个未误伤 + 3 个 JS 动态显隐只断存在
     + 模式选择器仍含 6 个模式 + 同轨计数 == 21（改前基线）+ 零 pageerror + 截图。 */
  ['e2e _hide6_e2e（v96 二级工具轨顶部六按钮已隐藏）', [p('_p1', '_hide6_e2e.cjs')]],
  ['eq verify_simplify_equivalence.js', [p('verify_simplify_equivalence.js'), WS]],
  /* ===== v184（2026-10-02，P1/P5）：把「曾经长期假红、无人跑」的 4 个施工管网 smoke 与
     新增的材料表单价联动 smoke 纳入批跑 —— 报告的结论就是「红项全是过期契约 → 习惯性忽略
     → 真回归失去哨兵」，唯二解法：① 重定基；② 纳管。
     这批 smoke 的口径 = v179 现状（平面视图编辑器在用 / 轴测视图收口 / 可编程开关干净），
     已做注入体检：ISO_OFF=false → 轴测收口断言红；EDITOR_OFF=true → 自动启用断言红；
     disable() 不摘叠加层 → 开关干净断言红（见 _p1/_inj_v179_smokes.py）。
     material_price_link 的注入体检见 _p1/_inj_p5_matsmoke.py（A/B/C 3 组全命中）。 */
  ['smoke network_editor（v179 编辑器现状：平面在用/轴测收口/开关干净/引擎保留）', [p('tests', 'network_editor.smoke.cjs')]],
  ['smoke network_assembly（v179 轴测收口 + 清单式接管防复活 + setCaliber 事务）', [p('tests', 'network_assembly.smoke.cjs')]],
  ['smoke network_elevation（高程契约：elevation 恒 null ⇄ 显示层高 z 分离）', [p('tests', 'network_elevation.smoke.cjs')]],
  ['smoke network_junction（改管长→接头随动 + 硬锚分类拒绝 + undo 复原）', [p('tests', 'network_junction.smoke.cjs')]],
  ['smoke material_price_link（v184 P5：单价按图面管径联动 + 造价自证 + 手改持久化）', [p('tests', 'material_price_link.smoke.cjs')]],
  /* ===== v186（2026-10-03）：连续绘制「功能诊断」——真 DOM，不是查源码文本 =====
     由来：用户报「点完成后没法接着画第二/第三块」。这一条修的是**行为**，
     「源码里有没有 clearDraft()」查不出来（注入缺陷后源码照样有这行、只是被注释掉了）。
     做法：jsdom 加载 runye-map-measure.html + 桩 Leaflet/RunyeGeo/RunyeMapEnhance，
           真点按钮、真 fire 地图 click，断言「画布状态 + 地块库」的演变。
     本项自带 --inject {1|2}（不清空 / 不入库），★ 注入模式下**期望变红**，
       故批跑器对它的判定与别项相反，用 _p1/_gates_dom.sh 包装（正常 0 / 非法 非 0）。
     ★ jsdom 是**隔离工作区的依赖**（不在仓库里）⇒ 不进 CI，只在本地全量批跑里跑；
       若 NODE_PATH 缺失会以「跳过（依赖缺失）」而非「红」呈现，避免假红。 */
  ['dom 连续绘制（v186：完成→入库→清空→接着画下一块 · jsdom 真 DOM · 含 --inject 反例）', [p('_p1', '_dom_multidraw.cjs')]],
  /* [v188 2026-10-03] 二级管路页「地块划分」开关 · Edge/CDP **真渲染**验证。
      起源：用户截图「这里什么都没有」—— 开关只剩一个绿色对勾、看不到文字。
      闸门三要素：① 存在（wrap/txt/chk 三节点 + 非零尺寸）
                 ② 判定（#ppZoneAutoTxt 的 computed color 与 #ppToolbar 实际背景色
                        算出 WCAG 对比度）
                 ③ 判据松紧（<3.0 判「肉眼看不见」；>=4.5 判小字 AA 达标）。
      真因：.pp-check-label 用白字 rgba(255,255,255,.75) 为**深色**工具栏而写，
            但本页工具栏是浅色面板（实测 rgb(247,250,249)）⇒ 对比度 1.04:1，完全不可见。
      ★ 选择器必须是 `#pipePlanSection .pp-toolbar>.pp-check-label` ——
        真实 DOM 链是 SECTION > .pp-body > .pp-stage > .ry-pane-edit > #ppToolbar，
        工具条不是 .pp-stage 的直接子节点；网上注释里的 `.pp-stage>.pp-toolbar` 在本页零命中
        （用 CSSOM rule.matches() 逐条核对过）。
      ★ 附带抓到并修复一个真实功能缺陷：从本开关切 adjustCut 时
        #ppCutFineGroup 未同步显隐（原逻辑只写在「调网格」按钮的 click 里），
        已抽出 ppSyncFineGroup() 归一，两条路径共用。
      本项自带 --inject {1|2|all}：1=注掉深色文字规则 / 2=注掉 ppSyncFineGroup 调用；
      ★ 注入模式下**期望变红**，退出码语义与别项相反（捕获=0 / 恒绿=1 / 锚点漂移=2）。
      ★ 依赖 puppeteer-core + 本机 Edge ⇒ 属**隔离环境依赖**，不进 CI，只入本地全量批跑；
        缺 NODE_PATH 时以「跳过（依赖缺失）」呈现，避免假红。 */
  ['二级「地块划分」开关真渲染（v188：文字可见性对比度 + 开关语义 + 持久化 + 注入反例）', [p('_p1', '_probe_zoneauto_render.cjs')]],
  /* [v187 2026-10-03] 地块拼接渲染契约：用户要求「拼接之后是各自的轮廓线，外面不用再加一个框」。
      两项配套：
        · _probe_merge_geom.cjs —— 拼接**几何**（凸包/subPlots 载体）不变，26 断言；
        · _probe_merge_render.cjs —— 拼接**绘制**改成「只画各子地块各自闭合轮廓线、
          各自作物色、去掉可见外框」，15 断言，自带 --inject（回退成旧「画可见凸包框」行为）。
      ★ 判据要点：断言「可见环顶点数均为 4」而不只是「颜色变了」—— 若把凸包当外框画，
        顶点数会 > 4，这条才真正拦得住；另断言「可见层无紫色」「无可见大框」。
      ★ 交互不能因去外框而丢：A) 未传 onPick → 无 click（避免无意义绑定）；
        B) 传 onPick → 每个可见子地块都有 click（拾取入口在）。
        这两条是**双向**的，只写 A 或只写 B 都可能恒真。
      两者都基于 jsdom（隔离依赖）⇒ 不进 CI，只入本地全量批跑。 */
  ['地块拼接几何（v185/v187：凸包载体 + subPlots 结构不变）', [p('_p1', '_probe_merge_geom.cjs')]],
  ['地块拼接渲染（v187：只画各自轮廓线/各自作物色/去外框 + 交互双向 + 注入反例）', [p('_p1', '_probe_merge_render.cjs')]],
  /* [v187] 拼接渲染的**真浏览器**端到端佐证：Edge/CDP 打开在线地图页，
      注入「3 子块拼接」地块库，把地图上每条 SVG 路径的 stroke/fill/线宽/顶点数/bbox
      逐条读出来判定 —— 比 jsdom 更接近用户眼睛看到的。
      判据：A) ≥3 条四顶点闭合子轮廓；B) 无「明显大于子块的外框」；
            B2) 填充路径数 ≥3（只剩 1 条 = 退化成画一个大框，旧行为）；
            C) 可见层无紫色（旧外框色）。
      ★ B 的判据踩过坑：起初跟「子块高度」比倍数，而注入把子块全干掉后比较基准为空 ⇒ B 假绿；
        改为「相对最小路径 bbox 面积 2×」+ 新增绝对判据 B2（填充路径数 ≥3）才拦得住。
      自带 --inject（改回 isMerged=false 的旧行为）→ 精确命中 A/B2 两条。
      依赖 puppeteer-core + 本机 Edge ⇒ 不进 CI。 */
  ['地块拼接轮廓真渲染截图（v187：≥3 条独立子轮廓 + 无外框 + 注入反例 · Edge/CDP）', [p('_p1', '_shot_merge_outline.cjs')]],
  /* ===== v184（2026-10-02，孤儿闸门纳管）：下面 13 个 verify_*.js 此前**从没进过任何批跑** ——
     写了契约、没人跑、红了也没人看见，与「过期契约被习惯性忽略」是同一件事的两面。
     本轮先做体检（_p1/_orphan_probe.sh 逐个真跑）再纳管，口径：
       · 9 个本来就是绿的（cascade_pp / construct_fit / dimgap / nav_compact / nav_switch /
         plan_hint / pp_tabs / sysdiagram_embed / settings）→ 直接纳管；
       · 4 个是「过期契约」不是功能坏（design_input 的 #layoutGroup 已改走 setLayoutSides 内联
         onclick；eng_skin 的水泵卡现为有意浅蓝底；text_contrast 的「≤2 处」名额被新增空状态
         提示语用光 → 改为命名豁免清单 + 第 7 处仍红；val_typography 把表头行当字段行误报）
         → 重定基后纳管，并做注入体检 _p1/_inj_v184_rebase.py（5/5 命中、还原逐字节一致）；
       · 1 个仍然红、**不**纳管：verify_sketchup.js（84 通过 / 11 失败，全是过期契约：
         4 条 --u-* 色值字面量 + 3 条运行期底色 + 4 条视图切换键数量，见 _verify_out/
         _rebase_verify_sketchup.js.log）。不纳管的理由：留着一条已知会红的项 =
         训练自己忽略红项。它待逐条重定基后再进（清单已记在体检报告里）。 */
  /* ★ v184 踩坑记录（纳管时踩的）：下面 5 个的 argv[2] 是 **HTML 文件路径**（变量名叫 SRC），
     不是工作目录 —— 一开始照抄 verify_ry_tool 的写法给了 WS（目录）⇒ 它们读不到文件、
     批跑里 5 条全红，而单独跑（无参数、用默认 index.html）全绿。
     教训：纳管别人的脚本前先确认**参数语义**，别按「同类脚本」猜。 */
  ['static verify_cascade_pp.js（层叠结果 · 含 :has 超子集跳过）', [p('verify_cascade_pp.js')]],
  ['static verify_design_input.js（设计输入区结构 + 选择器绑定链）', [p('verify_design_input.js')]],
  ['static verify_eng_skin.js（低饱和皮肤 · 39 条 token/规则断言）', [p('verify_eng_skin.js')]],
  ['static verify_nav_switch.js（导航高亮跟随点击 · 26 条）', [p('verify_nav_switch.js')]],
  ['static verify_pp_tabs.js（二级/三级 Tab 切换与清理态 · 67 条）', [p('verify_pp_tabs.js')]],
  ['e2e verify_construct_fit.js（三级施工图可见尺寸合理 + 零 pageerror）', [p('verify_construct_fit.js'), WS]],
  ['e2e verify_dimgap.js（尺寸线 gap/端线 6 面 × 3 视图 = 18 条）', [p('verify_dimgap.js'), WS]],
  ['e2e verify_nav_compact.js（窄屏导航名/布局 + 零运行期异常）', [p('verify_nav_compact.js'), WS]],
  ['e2e verify_plan_hint.js（二级提示语存在且未误伤 · 6 条）', [p('verify_plan_hint.js'), WS]],
  ['e2e verify_sysdiagram_embed.js（系统简图页内嵌 + 左栏滚动条隐藏 · 15 条）', [p('verify_sysdiagram_embed.js'), WS]],
  ['e2e verify_settings.js（设置页 26 项 · 含 S7 单价表单一来源）', [p('verify_settings.js'), WS]],
  ['e2e verify_text_contrast.js（对比度 A/B/C/C2/D · 含豁免清单两头体检）', [p('verify_text_contrast.js'), WS]],
  ['e2e verify_val_typography.js（左栏标签/数值/单位 11px·400 三档 9 条）', [p('verify_val_typography.js'), WS]],
  /* [v277 2026-10-06 用户要求] AI 灌溉方案规划悬浮面板「收齐=贴右缘竖排标签条」：
     用户原话「箭头指向的悬浮面板，收齐时候也是右侧折叠吧，这样看起来舒服一些」。
     本项真渲染量 rect（展开 262px/right≈136 → 折叠贴右缘 ≤44px 宽、竖排书写、不吃导航、
     不与 50% 处「工具栏」折叠标签撞区）+ 3x3 采样点 elementFromPoint 遮挡体检
     + ★ 折叠态合成拖动**不得**写 POS_KEY（同时以展开态同款拖动**必须**写入作正对照，
       证明这条判据不是恒真）+ pageerror 零。--inject 注入「折叠样式失效」⇒ 期望变红。 */
  ['e2e _v277_ai_fold_e2e（AI 面板折叠态=贴右缘竖排标签条 · rect/遮挡/拖动双头对照）', [p('_p1', '_v277_ai_fold_e2e.cjs')]],
  /* v278（AI 面板顶不越导航/底不越状态栏）+ v279（展开态上下贴满、↕ 手柄撤掉）真渲染：
     默认位顶/底各贴两条栏的 1px 边线、面板高 ≈ 导航下沿→状态栏上沿（占满整列）；
     往上下狠拖都拖不动（被自然钉死）；内容灌长后底不越界且正文内部滚动（不许被裁）；
     缩窗 900×600（会摘掉 body.ry-tool ⇒ 状态栏变 static，底界改以视口下沿为尺）+ 老存档 {y:8} 夹取；
     折叠态不得被内联 bottom 拉伸成满高细条、↕ 手柄必须查不到。
     --inject（回退 v278 两处）⇒ 期望变红（实测 6 条）；--inject2（回退 v279 两处）⇒ 期望 G15/G18 变红。 */
  ['e2e _v278_ai_bounds_e2e（AI 面板顶不越导航/底不越状态栏 + v279 上下贴满 · 默认位/拖不动/灌长内容/缩窗/老存档/折叠不拉伸）', [p('_p1', '_v278_ai_bounds_e2e.cjs')]],
  /* v280（2026-10-06 用户要求）二级页「滴灌带压差改善 / 地形高程」并排一行、各占一半：
     两按钮同一行（top 差 ≤2px）、左右不重叠、各占半宽、同一个行容器、顺序压差改善在左；
     地形按钮从标题行右端「移动下来」（position=static 且落在地形高差输入行之下）；
     点地形按钮 → 面板展开在整行之下且宽度≈行宽（不被压成半宽）；点压差改善 → 原 dialog 照旧。
     --inject（把两按钮打回各插各的）⇒ 期望变红（实测 9 条）。 */
  ['e2e _v280_plan_btnrow_e2e（二级页两按钮并排一行 · 同一行/各占半宽/移动下来/面板展开到整行之下）', [p('_p1', '_v280_plan_btnrow_e2e.cjs')]],
  /* [v282 2026-10-06 用户要求] 在线地图页：「↩ 回传设计工具」「💾 保存地块」→ 地图左上角悬浮条；
     「分区角度」→ 地图右侧**可拖动**悬浮面板（形态仿手机端 .map-angle：↶＋1° / 角度 / ↷−1° 竖排）。
     ★ 关键风险：runye-map-partition.js 只按 id 取 box 再 querySelector 内部控件，
       搬容器时漏一个控件 = 页面静默失效（attach 直接 return，无报错）⇒ 必须有渲染态哨兵。
     本项 15 条：左上贴边/不被缩放控件压住/可点/文案/右侧贴边/竖排三件/控件齐全/
       ±1° 功能不丢/拖动 ≥150px 且不出区/折叠⇄展开/刷新后位置记忆（漂移 ≤4px）/侧栏无残留/零 pageerror。
     --inject（把面板搬回左侧工具栏）⇒ 期望变红（实测 6 条：P5/P8/P9/P10a/P11/P12）。 */
  ['e2e _v282_map_angle_e2e（在线地图左上角悬浮条 + 右侧可拖动角度面板 · 15 条含拖动与位置记忆）', [p('_p1', '_v282_map_angle_e2e.cjs')]],
];

if (EMIT) {
  console.log(JSON.stringify({
    ws: WS, node: NODE, nodePath: NODE_PATH,
    items: LIST.filter((it) => !FILTER || new RegExp(FILTER).test(it[0])).map((it) => ({
      name: it[0], args: it[1], existCheck: it[2] || null,
      skip: it[2] ? !fs.existsSync(p(...it[2])) : false,
    })),
  }, null, 1));
  process.exit(0);
}

const rep = [];
let bad = 0;
let envBad = 0;

/* ★ 每项开跑前先清“本项目探针自己”残留的 Edge：命令行含 _verify_out。
   用户的正常 Edge 命令行没有这个串，不会被误杀。
   由来（2026-09-18 第七十一轮）：全批里 e2e **随机**有一项卡在 Edge 启动段被 240s 杀掉
   （这次 _autoedits、下次 _fitbtn，而这些探针单独跑只要 4~25s 且全绿）；
   给两个探针加了“启动前杀残留”后即恢复 ⇒ 根因在环境残留，
   会落在任一探针上，**该在批跑器层面统一治**，而不是逐个探针打补丁。
   （v184：这里原来用 spawnSync，在本机被 EBUSY 静默吃掉 ⇒ 长期是空操作；已改异步，见下。） */

/* 超时时把探针进度日志（_verify_out/_progress_*.log）贴进报告 —— 那是唯一能说明“卡在第几步”的东西 */
const dumpProgress = () => {
  try {
    const d = p('_verify_out');
    if (!fs.existsSync(d)) return '';
    return fs.readdirSync(d).filter((f) => /^_progress_.*\.log$/.test(f)).map((f) =>
      '  ·进度 ' + f + '\n' + fs.readFileSync(path.join(d, f), 'utf8').split('\n')
        .filter((l) => l.trim()).slice(-8).map((l) => '     ' + l).join('\n')).join('\n');
  } catch (e) { return ''; }
};

/* ★★ 2026-10-02 v184 关键修正：把 spawnSync 换成**异步 spawn**。
   实测（_p1/_spawnsync_vs_spawn.cjs）：本机 `spawnSync` 派生任何子进程都是 EBUSY
   （node→node / node→bash / node→cmd 全灭），而**异步 spawn 完全正常**
   （探针里拉 Edge 一直就是这么起来的 —— 所以现象才那么反直觉：
    「Edge 都能拉起来，怎么批跑器一条也跑不动」）。
   旧版用 spawnSync ⇒ 43 条全部 status=null，却被一律 bad++ 报成 `bad=43`（全是假红）。
   现在改成异步派生，本机可直接跑通，也不再依赖绕道 python。 */
const RUN_TIMEOUT_MS = 240000;
const runOnce = (args, timeoutMs = RUN_TIMEOUT_MS) => new Promise((resolve) => {
  let out = '', spawnErr = '', timedOut = false, done = false;
  let child;
  try { child = spawn(NODE, args, { cwd: WS, env, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { return resolve({ status: null, timedOut: false, spawnErr: e.code || e.message, out: '' }); }
  const timer = setTimeout(() => {
    timedOut = true;
    try { child.kill('SIGKILL'); } catch (e) { /* 尽力而为 */ }
  }, timeoutMs);
  child.stdout.on('data', (d) => { out += d.toString(); });
  child.stderr.on('data', (d) => { out += d.toString(); });
  child.on('error', (e) => { spawnErr = e.code || e.message; });
  child.on('close', (code) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    resolve({ status: spawnErr ? null : code, timedOut: timedOut, spawnErr: spawnErr, out: out.replace(/\r/g, '') });
  });
});

/* 清残留 Edge 也改异步（原来用 spawnSync，同样是被 EBUSY 静默吃掉 ⇒ 一直是空操作） */
const killProbeEdge = () => new Promise((resolve) => {
  let c;
  try {
    c = spawn('powershell', ['-NoProfile', '-Command',
      "Get-CimInstance Win32_Process -Filter \"Name='msedge.exe'\" | Where-Object { $_.CommandLine -like '*_verify_out*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"],
      { stdio: 'ignore' });
  } catch (e) { return resolve(); }
  const t = setTimeout(() => { try { c.kill('SIGKILL'); } catch (e) { } resolve(); }, 20000);
  c.on('error', () => { clearTimeout(t); resolve(); });
  c.on('close', () => { clearTimeout(t); resolve(); });
});

(async () => {
/* ★ preflight（2026-10-02 v184）：先证明「本环境能派生 node 子进程」再跑。
   否则几十条全部 spawn 失败 ⇒ 旧代码一律 bad++，看上去像几十个真回归。
   中止时退出码 = 2，与「有真红项」的 1 区分开。 */
{
  const pre = await runOnce(['--version'], 30000);
  if (pre.status !== 0) {
    /* 中止前顺手把「同步/异步」两条路都点一遍，直接给出精确诊断，少让下一个人猜。 */
    const syncProbe = (() => {
      try { const r = spawnSync(NODE, ['--version'], { encoding: 'utf8', timeout: 20000 });
        return 'spawnSync=' + r.status + (r.error ? '(' + r.error.code + ')' : ''); }
      catch (e) { return 'spawnSync=throw(' + e.message + ')'; }
    })();
    const txt = [
      '═════ PREFLIGHT FAILED ' + new Date().toISOString(),
      '★ 批跑中止：异步 spawn ' + NODE + ' --version 失败'
        + (pre.spawnErr ? '（' + pre.spawnErr + '）' : '（退出码 ' + pre.status + '）') + '。'
        + ' 对照：' + syncProbe,
      '★ 本报告**不是**闸门结论：下面没有任何一项真正跑过。',
      '★ 处置：换到允许派生子进程的环境重跑；或跑 node _p1/_spawnsync_vs_spawn.cjs /',
      '        python _p1/_gates_run.py（python 驱动版，同样用本文件的 LIST --emit）。',
      '★ 已知受害者：2026-10-02 的一次 spawnSync 批跑据此把 43 条「没跑起来」误报成 bad=43。',
    ].join('\n');
    fs.writeFileSync(p('_p1', '_gates_out.txt'), txt + '\n', 'utf8');
    console.log(txt);
    console.log('GATES ABORT  preflight=spawn-fail');
    process.exit(2);
  }
}

for (const item of LIST) {
  const [name, args, existCheck] = item;
  if (FILTER && !new RegExp(FILTER).test(name)) continue;
  if (existCheck && !fs.existsSync(p(...existCheck))) { rep.push('═════ ' + name + '   SKIP(文件不存在)'); rep.push(''); continue; }
  await killProbeEdge();
  const t0 = Date.now();
  let a = await runOnce(args);
  let retried = false;
  if (a.timedOut) {
    /* 启动悬挂是偶发的环境问题（同一探针单独跑 4~25s 全绿）：
       清掉残留 Edge 后重跑一次；**两次都超时才算本项失败**，且报告里如实标明“重试过”。 */
    rep.push('  （首轮 >240s 被杀 → 清残留 Edge 后重试一次；两次都超时才算本项失败）');
    const pg = dumpProgress();
    if (pg) rep.push(pg);
    await killProbeEdge();
    retried = true;
    a = await runOnce(args);
  }
  const out = a.out;
  const lines = out.split('\n').filter((l) => l.trim() !== '');
  /* ★ 派生失败 ≠ 闸门红（2026-10-02 v184）：单独计数、单独点名，绝不混进 bad。 */
  if (a.spawnErr) { envBad++; rep.push('   ★★ SPAWN-FAIL(' + a.spawnErr + ') —— 本项**没有跑过**，不计入真红项'); }
  else if (a.status !== 0) bad++;
  rep.push('═════ ' + name + '   EXIT=' + a.status
    + (a.spawnErr ? '   ★SPAWN-FAIL(' + a.spawnErr + ')' : '')
    + (a.timedOut ? '   ★TIMEOUT(两次均 >240s)' : (retried ? '   （重试后通过）' : ''))
    + '   ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
  if (a.timedOut) {
    const pg2 = dumpProgress();
    if (pg2) rep.push(pg2);
  }
  if (/^eq /.test(name)) {
    fs.writeFileSync(p('_p1', '_gates_eq_full.txt'), out, 'utf8');
    rep.push(lines.filter((l) => !/^     (旧|新):/.test(l)).slice(-60).join('\n'));
  } else if (/单测/.test(name)) {
    rep.push(lines.filter((l) => /^(# (tests|pass|fail|suites|duration_ms))|^not ok/.test(l)).join('\n') || '(无摘要行)');
  } else {
    rep.push(lines.slice(-45).join('\n'));
  }
  rep.push('');
  /* ★ 报告边跑边落盘：以前只在末尾写一次，一旦卡死前面各项的结论全都没了。 */
  fs.writeFileSync(p('_p1', '_gates_out.txt'), rep.join('\n') + '\n==(进行中，末行不是最终结论)==', 'utf8');
}
rep.push('== 批跑结束：EXIT≠0 的条目数 = ' + bad + (FILTER ? '（filter=' + FILTER + '）' : '') + ' ==');
if (envBad) {
  rep.push('★★ 另有 ' + envBad + ' 项 **SPAWN-FAIL（根本没跑起来）** —— 它们不是闸门结论，'
    + '不得计入上面的 bad；请先跑 node _p1/_spawnsync_vs_spawn.cjs 确认可用后重跑本批。');
  rep.push('★★ 本次 bad=' + bad + ' 只在 envBad=0 时才是可信的闸门结论。');
}
fs.writeFileSync(p('_p1', '_gates_out.txt'), rep.join('\n'), 'utf8');
console.log('GATES DONE  bad=' + bad + (envBad ? '  envBad=' + envBad + '（批跑不可信）' : ''));
/* ★ 必须有退出码：「打印了红字」≠「拦得住」。bad=0 时行为与改前完全一致（退出 0）。
   ★ 且有真红（1）与「环境不让跑」（2）**两种非零**：后者绝不能被读成前者。 */
process.exitCode = envBad ? 2 : (bad ? 1 : 0);
})();
