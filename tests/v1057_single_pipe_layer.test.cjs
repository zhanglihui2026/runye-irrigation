/* v1057-single-pipe-layer —— **已被 v1085 反转，本文件改锁新口径**
 *
 * 历史：M13（v1057）把方向定成「二级平面画布 = 自动管线唯一可见绘制层，
 * 三级叠加 SVG 把主管/支管/阀门全部透明化」。
 * 用户 2026-11-14 拍板反转（v1085「管路回三级，二级只负责规划地块」）：
 *   · 二级画布恒不画管路（主管/支管/阀门/三级管一律不画）；
 *   · 三级工作区恢复可见，「显示/隐藏管路」开关只控制三级层；
 *   · 唯一保留 M13 的产物是 `__ppPipeLayerDedupe` 诊断锚点（本版已改为如实反映）。
 *
 * 本文件锁定七条契约（①③ 已按 v1085 翻转，②④⑤⑥ 原样有效）：
 * ① 二级不画管路：ppPipeLayerSuppressed 恒 true，主管/支管绘制块与阀门块都挂
 *    `!ppPipeLayerSuppressed` 守卫；v875 判定只作为 wouldSuppress 诊断保留；
 *    探针 `__ppPipeLayerDedupe.suppressed` 必须如实反映而非写死 false。
 * ② 二级渲染消费三级图面编辑覆盖（渲染口径，虽被①抑制但链路不得断）：lensMap→
 *    AE.effPts 有效几何、hiddenMap→灰虚线；异代/数量不符时安全回落真身几何。
 * ③ 三级叠加 SVG 线体**默认可见**：克隆底图主管/支管 path 与 [data-tlvalve="1"] 只在
 *    `__ryPipelineLayerVisible === false` 时透明化；autoSVG 改长管线体恢复实色；兜底自绘
 *    branch/main 走 hidAttr（带遮蔽灰虚线口径）、阀门圆实色；滴灌带与总管保留可见。
 * ④ 简图阀门+连接管打 data-tlvalve 标记（简图本身显示不受影响，仅供工作区克隆识别）。
 * ⑤ 接驳节点：入口已于 M14（ee4a91b，2026-11-13）统一到工作区 N-xx 节点、从 index.html
 *    移除；绑定/面板/数据链全部保留（if(btn)/if(panel) 守卫 ⇒ 恢复零成本）。
 * ⑥ 失败不显旧版：v892 空结果保护反转（清空自动管线+移除旧版提示）、自动重算失败
 *    分支清空自动管线 + __ppGenCutSig 置空。
 * ⑦ 版本纪律：index.html 主串正好 17 处（含 tl-workspace.js，v1085 起并入主串同抬，
 *    不再独立串）；sw.js VERSION 与主串同值。
 * 明令不变项：面积算法/水力公式/布管方向/发布规则零改动；轮灌演示动画与地图手绘
 * 总管编辑不挪动。 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } }

(function () {
  console.log('— ① 二级不画管路：恒抑制（plot-editor.js）—');
  const pe = read('mod/plot-editor.js');
  ok('ppPipeLayerSuppressed 恒 true（v1085 口径锚）', /var ppPipeLayerSuppressed=true;/.test(pe));
  ok('不再存在恒 false 的旧口径', !/var ppPipeLayerSuppressed=false;/.test(pe));
  ok('v875 判定保留为诊断值 wouldSuppress', /ppPipeLayerWouldSuppress=true/.test(pe));
  ok('探针 suppressed 如实反映（不再写死 false）', /__ppPipeLayerDedupe=\{suppressed:!!ppPipeLayerSuppressed,wouldSuppress:ppPipeLayerWouldSuppress/.test(pe));
  ok('主管/支管绘制块入口 = 开关 + 恒抑制双守卫', /if\(window\.__ryPipelineLayerVisible!==false&&!ppPipeLayerSuppressed\)\{\s*\n\s*\/\* \[M13\] 二级画布消费三级图面编辑覆盖/.test(pe));
  ok('阀门块入口 = 开关 + 恒抑制双守卫（v1056 注释锚）', /if\(window\.__ryPipelineLayerVisible!==false&&!ppPipeLayerSuppressed\)\{\s*\n\s*ppState\.valves\.forEach/.test(pe));
  ok('两处守卫都用同一条件（无第三条分支）', (pe.split('if(window.__ryPipelineLayerVisible!==false&&!ppPipeLayerSuppressed){').length - 1) === 2);
  ok('主管绘制并入三级遮蔽态 __tlHidMain', /!ppIsPipeHidden\('main',idx\)&&!__tlHidMain\[idx\]/.test(pe));
  ok('支管绘制并入三级遮蔽态 __tlHidBranch', /!ppIsPipeHidden\('branch',idx\)&&!__tlHidBranch\[idx\]/.test(pe));
  ok('遮蔽灰虚线循环并入 __tlHid（main）', /ppIsPipeHidden\('main',idx\)\|\|__tlHidMain\[idx\]\)ppDrawLine/.test(pe));

  console.log('— ② 渲染消费 AE 覆盖（渲染口径，链路不得断）—');
  ok('同代守卫：dd.mainPipes.length 与二级一致才消费', /dd\.mainPipes\.length!==\(ppState\.mainPipes\|\|\[\]\)\.length\)return;/.test(pe));
  ok('branchPipes 数量守卫（三级并入次支管防失配）', /\(dd\.branchPipes\|\|\[\]\)\.length!==\(ppState\.branchPipes\|\|\[\]\)\.length\)return;/.test(pe));
  ok('改长管走 AE.effPts 有效几何（main-idx）', /var pid='main-'\+idx;\s*\n\s*return lm\[pid\]\?\(AE\.effPts\(pid,dd\)\|\|l\):l;/.test(pe));
  ok('displayGeometry 输入为有效几何 __tlEffMains/__tlEffBranches', /ppGetPipeDisplayGeometry\(__tlEffMains,__tlEffBranches,ppState\.valves,ppGapM\(\)\)/.test(pe));
  ok('异常回落真身几何（catch 分支复位）', /catch\(eAEOverlay\)\{\s*__tlEffMains=ppState\.mainPipes;/.test(pe));

  console.log('— ③ 三级线体默认可见（tl-workspace.js）—');
  const tw = read('tl-workspace/tl-workspace.js');
  ok('克隆透明化被收进「隐藏管路」条件内', /if \(window\.__ryPipelineLayerVisible === false\) \{\s*\n\s*var m13Pipes = clone\.querySelectorAll\('path\[data-tlpipe\^="main-"\],path\[data-tlpipe\^="branch-"\]'\)/.test(tw));
  ok('透明 stroke=rgba(0,0,0,0)（仍在条件内，关开关才生效）', /m13Pipes\[m13i\]\.setAttribute\('stroke', 'rgba\(0,0,0,0\)'\)/.test(tw));
  ok('阀门组 opacity=0（仍在条件内）', /m13Valves\[m13v\]\.setAttribute\('opacity', '0'\)/.test(tw));
  ok('autoSVG 改长管线体恢复实色（未遮蔽分支）', /if \(!hid\) \{\s*\n\s*s\.push\('<path d="' \+ d \+ '" fill="none" stroke="' \+ st\.c \+ '" stroke-width="' \+ st\.w \+ '"/.test(tw));
  ok('改长长度标注保留（b45309 文本）', /font-size="9" font-family="system-ui" fill="#b45309">' \+ esc\(AE\.polylineLen\(epts\)\.toFixed\(1\) \+ 'm'\)/.test(tw));
  const autoSeg = tw.split('function autoSVG(')[1] || tw.split('function drawFrontSegs(')[0];
  ok('遮蔽管不再由 autoSVG 重画灰虚线（hid 分支无 push）', !/hid \? hidAttr\(pid, st\.c, st\.w\)/.test(autoSeg));
  ok('兜底支管线体走 hidAttr（实色 + 遮蔽灰虚线口径）', tw.includes("hidAttr('branch-' + bi, COLORS.branch, 1.6)"));
  ok('兜底主管线体走 hidAttr', tw.includes("hidAttr('main-' + mi, COLORS.main, 2.6)"));
  ok('兜底主管/支管不再画透明线（M13 透明化已撤）', !/COLORS\.main, 2\.6\)[\s\S]{0,80}?'? stroke="rgba\(0,0,0,0\)"/.test(tw) && !/stroke="rgba\(0,0,0,0\)" stroke-width="2\.6"/.test(tw));
  ok('兜底阀门圆恢复实色', /r="3\.6" fill="' \+ COLORS\.valve \+ '" stroke="#fff"/.test(tw));
  ok('滴灌带保留可见（#0e7490）', /data-tltape="1" d="' \+ pl\(l\) \+ '" fill="none" stroke="#0e7490"/.test(tw));
  ok('总管 frontPipe 保留可见（兜底）', /hidAttr\('front', COLORS\.front, 4\)/.test(tw));
  ok('拾取不受影响：pickAutoPipe 几何命中仍在', /function pickAutoPipe\(p, tolM\)/.test(tw) && /closestOnSeg\(p, epts\[i\], epts\[i \+ 1\]\)/.test(tw));

  console.log('— ④ 简图 data-tlvalve 标记（inline-09.js）—');
  const i09 = read('mod/inline-09.js');
  ok('连接管包 data-tlvalve 标记', /'<g data-tlvalve="1"><line x1="'\+ap\.x\.toFixed\(1\)/.test(i09));
  ok('阀门圆包 data-tlvalve 标记', /'<g data-tlvalve="1">' \+ window\.ryValveSVG\(vp\.x, vp\.y\) \+ '<\/g>'/.test(i09));
  ok('简图主管/支管线体不变（图纸输出保持完整）', /data-tlpipe="main-'\+mi\+'".*stroke="'\+\(tlHidM\?\'#64748b\':\'#185FA5\'\)/.test(i09) || /data-tlpipe="main-'\+mi\+'"/.test(i09));

  console.log('— ⑤ 接驳节点：入口已由 M14 统一到工作区 N-xx（底层零成本恢复路径保留）—');
  /* 现状取证（2026-11-14）：`id="ppCouplerBtn"` 由 ee4a91b「Unify connection nodes for
     map and animation」（2026-11-13，M14）从 index.html 移除 —— 接驳点统一改用工作区
     N-xx 节点，避免两套节点重影。M13 那句「入口回归二级页」只活了一天，本文件原先
     的「入口必须存在」断言自 ee4a91b 起即为过期锁（v982 测试同款，属既有红，非本版引入）。
     本版改锁**真实状态**：入口不在 index.html，但绑定/面板/数据链全部保留（if(btn)/if(panel)
     守卫 ⇒ 恢复入口零成本）。 */
  const ix = read('index.html');
  ok('入口当前不在 index.html（M14 ee4a91b 统一到工作区 N-xx）', !/id="ppCouplerBtn"/.test(ix) && !/id="ppCouplerPanel"/.test(ix));
  ok('绑定保留 if(btn) 守卫（恢复入口零成本）', pe.includes("var btn=document.getElementById('ppCouplerBtn');"));
  ok('面板绑定保留 if(panel) 守卫（≥2 处）', (pe.match(/getElementById\('ppCouplerPanel'\)/g) || []).length >= 2);
  ok('数据层保留：ppState.couplerNodes（存拆兼容字段）', pe.includes('ppState.couplerNodes'));
  ok('绑定链保留：ppCouplerUpsert(pipeKey,s) 桩号置位', /ppCouplerUpsert\(ppCouplerSelected,v\)/.test(pe));
  ok('重投影链保留：ppRefreshTLAfterCuts（重算后节点重新投影）', /ppRefreshTLAfterCuts\(\).*\[v913\] 重投影 dd\.couplerNodes/.test(pe));
  ok('节点数据结构：{pipeKey,s 米} 按主管身份+桩号绑定', /\[\{pipeKey:'m1', s:米\}\]/.test(pe) || /\{pipeKey:pipeKey,s:s\}/.test(pe));

  console.log('— ⑥ 失败不显旧版 —');
  ok('v892 反转：失败清空自动管线（五连清）', /ppState\.mainPipes=\[\];ppState\.branchPipes=\[\];ppState\.subBranchPipes=\[\];\s*\n\s*ppState\.valves=\[\];ppState\.couplerNodes=\[\];\s*\n\s*ppState\.hiddenPipes=\{main:\{\},branch:\{\},subbranch:\{\}\};\s*\n\s*if\(typeof updatePlan==='function'\)updatePlan\(\);\s*\n\s*ppUpdateTransform\(\);ppRender\(\);ppUpdateAutoPipeButton\(\);ppRefreshDiagramOrReset\(\);ppRefreshMaterials\(\);/.test(pe));
  ok('v892 反转：不再回滚 preimage（旧文案已退役）', !/已保留原管线与画面/.test(pe));
  ok('v892 新提示明示旧版已移除', /旧版管线已移除以免误导/.test(pe));
  ok('自动重算失败分支清空管线 + 签名置空', /ppState\.__ppGenCutSig=null;window\.__ryPpGenCutSig=null;/.test(pe));
  ok('自动重算失败提示明示旧版已移除', /旧版管线已移除，请调整分区参数后重试/.test(pe));

  console.log('— ⑦ 版本纪律 —');
  /* 主串动态读 sw VERSION（v1058 起；v1085 起 tl-workspace 并入主串同抬） */
  const swDyn = read('sw.js');
  const verPlainDyn = ((swDyn.match(/const VERSION = '([^']+)';/) || [])[1] || '').replace(/^v/, '');
  const cnt = (ix.match(new RegExp(verPlainDyn, 'g')) || []).length;
  ok('index.html 主串正好 17 处动态版本串 ' + verPlainDyn + '（实测 ' + cnt + '）', cnt === 17);
  ok('tl-workspace.js 并入主串同抬（不再独立串）', ix.includes('tl-workspace/tl-workspace.js?v=' + verPlainDyn));
  ok('sw.js VERSION 动态与主串同款', swDyn.includes("const VERSION = 'v" + verPlainDyn + "';"));
  ok('不变量：publishToMap 仍为显式 ===true 判断（发布规则零改动）', /options\.publishToMap===true/.test(i09));
  ok('不变量：轮灌演示动画未被挪动（map-flow-demo 引用仍在）', /map-flow-demo\.js/.test(ix));

  console.log('\n结果: ' + pass + ' 过 / ' + fail + ' 红');
  process.exit(fail ? 1 : 0);
})();
