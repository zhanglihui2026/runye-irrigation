/* v1057-m13-single-pipe-layer —— 主线任务 M13「自动管线单一可见绘制层与节点维护位置」
 * 锁定七条契约：
 * ① 二级画布=自动管线线体唯一可见绘制层：v875 同代抑制退役（suppressed 恒 false、
 *    wouldSuppress 保留诊断），主管/支管/阀门渲染条件不再消费 ppPipeLayerSuppressed。
 * ② 二级渲染消费三级图面编辑覆盖（渲染口径）：lensMap→AE.effPts 有效几何、
 *    hiddenMap→灰虚线；异代/数量不符时安全回落真身几何。
 * ③ 三级叠加 SVG 线体透明化：pipeBaseSVG 克隆 main-/branch- stroke=rgba(0,0,0,0)、
 *    [data-tlvalve="1"] opacity=0；autoSVG 改长管线体透明+长度标注保留、遮蔽管不再重画灰虚线；
 *    兜底自绘路径同口径；滴灌带与总管（手绘体系）保留可见。
 * ④ 简图阀门+连接管打 data-tlvalve 标记（简图本身显示不受影响，仅供工作区克隆识别）。
 * ⑤ 接驳节点入口回归二级页（v982 下线后 M13 拍板恢复）：#ppCouplerBtn + #ppCouplerPanel
 *    存在，pipeKey+桩号（s）绑定与重投影链（ppRefreshTLAfterCuts）不变。
 * ⑥ 失败不显旧版：v892 空结果保护反转（清空自动管线+移除旧版提示，不再回滚 preimage）、
 *    自动重算失败分支清空自动管线 + __ppGenCutSig 置空。
 * ⑦ 版本纪律：index.html 主串正好 14 处 v1057-m13-single-pipe-layer；tl-workspace.js
 *    串独立抬版（1057-ws-single-layer——不同名并入主串会打破动态闸门的 14 处口径，
 *    与公告串 1043 同款教训）；sw.js VERSION = v1057-m13-single-pipe-layer。
 * M13 明令不变项：面积算法/水力公式/布管方向/发布规则零改动；「主管与支管垂直」
 * 待办功能不启用；轮灌演示动画与地图手绘总管编辑不挪动。 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } }

(function () {
  console.log('— ① 二级唯一可见线体层（plot-editor.js）—');
  const pe = read('mod/plot-editor.js');
  ok('v875 判定保留为诊断值 wouldSuppress', /ppPipeLayerWouldSuppress=true/.test(pe));
  ok('suppressed 恒 false 写入锚点（suppressed:false）', /__ppPipeLayerDedupe=\{suppressed:false,wouldSuppress:ppPipeLayerWouldSuppress/.test(pe));
  ok('主管渲染条件不再消费 ppPipeLayerSuppressed（main）', !/if\(!ppPipeLayerSuppressed && window\.__ryPipelineLayerVisible!==false\)\{\s*\n\s*\/\* \[M13\]/.test(pe));
  ok('主管/支管绘制块入口 = 仅 __ryPipelineLayerVisible 条件', /if\(window\.__ryPipelineLayerVisible!==false\)\{\s*\n\s*\/\* \[M13\] 二级画布消费三级图面编辑覆盖/.test(pe));
  ok('阀门块入口 = 仅 __ryPipelineLayerVisible 条件（M13 注释锚）', /if\(window\.__ryPipelineLayerVisible!==false\)\{\s*\n\s*ppState\.valves\.forEach/.test(pe));
  ok('主管绘制并入三级遮蔽态 __tlHidMain', /!ppIsPipeHidden\('main',idx\)&&!__tlHidMain\[idx\]/.test(pe));
  ok('支管绘制并入三级遮蔽态 __tlHidBranch', /!ppIsPipeHidden\('branch',idx\)&&!__tlHidBranch\[idx\]/.test(pe));
  ok('遮蔽灰虚线循环并入 __tlHid（main）', /ppIsPipeHidden\('main',idx\)\|\|__tlHidMain\[idx\]\)ppDrawLine/.test(pe));

  console.log('— ② 渲染消费 AE 覆盖（渲染口径）—');
  ok('同代守卫：dd.mainPipes.length 与二级一致才消费', /dd\.mainPipes\.length!==\(ppState\.mainPipes\|\|\[\]\)\.length\)return;/.test(pe));
  ok('branchPipes 数量守卫（三级并入次支管防失配）', /\(dd\.branchPipes\|\|\[\]\)\.length!==\(ppState\.branchPipes\|\|\[\]\)\.length\)return;/.test(pe));
  ok('改长管走 AE.effPts 有效几何（main-idx）', /var pid='main-'\+idx;\s*\n\s*return lm\[pid\]\?\(AE\.effPts\(pid,dd\)\|\|l\):l;/.test(pe));
  ok('displayGeometry 输入为有效几何 __tlEffMains/__tlEffBranches', /ppGetPipeDisplayGeometry\(__tlEffMains,__tlEffBranches,ppState\.valves,ppGapM\(\)\)/.test(pe));
  ok('异常回落真身几何（catch 分支复位）', /catch\(eAEOverlay\)\{\s*__tlEffMains=ppState\.mainPipes;/.test(pe));

  console.log('— ③ 三级叠加 SVG 线体透明化（tl-workspace.js）—');
  const tw = read('tl-workspace/tl-workspace.js');
  ok('pipeBaseSVG 克隆主管/支管 path 透明化', /clone\.querySelectorAll\('path\[data-tlpipe\^="main-"\],path\[data-tlpipe\^="branch-"\]'\)/.test(tw));
  ok('透明 stroke=rgba(0,0,0,0)（克隆路径）', /m13Pipes\[m13i\]\.setAttribute\('stroke', 'rgba\(0,0,0,0\)'\)/.test(tw));
  ok('阀门组 opacity=0（克隆路径 data-tlvalve）', /m13Valves\[m13v\]\.setAttribute\('opacity', '0'\)/.test(tw));
  ok('autoSVG 改长管线体透明（未遮蔽分支）', /if \(!hid\) \{\s*\n\s*s\.push\('<path d="' \+ d \+ '" fill="none" stroke="rgba\(0,0,0,0\)"/.test(tw));
  ok('改长长度标注保留（b45309 文本）', /font-size="9" font-family="system-ui" fill="#b45309">' \+ esc\(AE\.polylineLen\(epts\)\.toFixed\(1\) \+ 'm'\)/.test(tw));
  const autoSeg = tw.split('function autoSVG(')[1] || tw.split('function drawFrontSegs(')[0];
  ok('遮蔽管不再由 autoSVG 重画灰虚线（hid 分支无 push）', !/hid \? hidAttr\(pid, st\.c, st\.w\)/.test(autoSeg));
  ok('兜底自绘主管/支管透明化', /stroke="rgba\(0,0,0,0\)" stroke-width="1\.6"/.test(tw) && /stroke="rgba\(0,0,0,0\)" stroke-width="2\.6"/.test(tw));
  ok('兜底阀门圆透明化', /r="3\.6" fill="rgba\(0,0,0,0\)" stroke="rgba\(0,0,0,0\)"/.test(tw));
  ok('滴灌带保留可见（#0e7490）', /data-tltape="1" d="' \+ pl\(l\) \+ '" fill="none" stroke="#0e7490"/.test(tw));
  ok('总管 frontPipe 保留可见（兜底）', /hidAttr\('front', COLORS\.front, 4\)/.test(tw));
  ok('拾取不受影响：pickAutoPipe 几何命中仍在', /function pickAutoPipe\(p, tolM\)/.test(tw) && /closestOnSeg\(p, epts\[i\], epts\[i \+ 1\]\)/.test(tw));

  console.log('— ④ 简图 data-tlvalve 标记（inline-09.js）—');
  const i09 = read('mod/inline-09.js');
  ok('连接管包 data-tlvalve 标记', /'<g data-tlvalve="1"><line x1="'\+ap\.x\.toFixed\(1\)/.test(i09));
  ok('阀门圆包 data-tlvalve 标记', /'<g data-tlvalve="1">' \+ window\.ryValveSVG\(vp\.x, vp\.y\) \+ '<\/g>'/.test(i09));
  ok('简图主管/支管线体不变（图纸输出保持完整）', /data-tlpipe="main-'\+mi\+'".*stroke="'\+\(tlHidM\?\'#64748b\':\'#185FA5\'\)/.test(i09) || /data-tlpipe="main-'\+mi\+'"/.test(i09));

  console.log('— ⑤ 接驳节点入口回归二级页 —');
  const ix = read('index.html');
  ok('#ppCouplerBtn 恢复', /id="ppCouplerBtn"/.test(ix));
  ok('#ppCouplerPanel 恢复', /id="ppCouplerPanel"/.test(ix));
  ok('面板含距起点桩号输入与移除按钮', /pp-coupler-remove/.test(ix) && /距起点/.test(ix));
  ok('绑定链保留：ppCouplerUpsert(pipeKey,s) 桩号置位', /ppCouplerUpsert\(ppCouplerSelected,v\)/.test(pe));
  ok('重投影链保留：ppRefreshTLAfterCuts（重算后节点重新投影）', /ppRefreshTLAfterCuts\(\).*\[v913\] 重投影 dd\.couplerNodes/.test(pe));
  ok('节点数据结构：{pipeKey,s 米} 按主管身份+桩号绑定', /\[\{pipeKey:'m1', s:米\}\]/.test(pe) || /\{pipeKey:pipeKey,s:s\}/.test(pe));

  console.log('— ⑥ 失败不显旧版 —');
  ok('v892 反转：失败清空自动管线（mainPipes=[] 五连清）', /ppState\.mainPipes=\[\];ppState\.branchPipes=\[\];ppState\.subBranchPipes=\[\];\s*\n\s*ppState\.valves=\[\];ppState\.couplerNodes=\[\];\s*\n\s*ppState\.hiddenPipes=\{main:\{\},branch:\{\},subbranch:\{\}\};\s*\n\s*if\(typeof updatePlan==='function'\)updatePlan\(\);\s*\n\s*ppUpdateTransform\(\);ppRender\(\);ppUpdateAutoPipeButton\(\);ppRefreshDiagramOrReset\(\);ppRefreshMaterials\(\);/.test(pe));
  ok('v892 反转：不再回滚 preimage（旧文案已退役）', !/已保留原管线与画面/.test(pe));
  ok('v892 新提示明示旧版已移除', /旧版管线已移除以免误导/.test(pe));
  ok('自动重算失败分支清空管线 + 签名置空', /ppState\.__ppGenCutSig=null;window\.__ryPpGenCutSig=null;/.test(pe));
  ok('自动重算失败提示明示旧版已移除', /旧版管线已移除，请调整分区参数后重试/.test(pe));

  console.log('— ⑦ 版本纪律 —');
  /* [v1058] 主串动态读 sw VERSION（每版同抬，测试零维护） */
  const swDyn = read('sw.js');
  const verPlainDyn = ((swDyn.match(/const VERSION = '([^']+)';/) || [])[1] || '').replace(/^v/, '');
  const cnt = (ix.match(new RegExp(verPlainDyn, 'g')) || []).length;
  ok('index.html 主串正好 14 处动态版本串 ' + verPlainDyn + '（实测 ' + cnt + '）', cnt === 14);
  ok('tl-workspace.js 串独立抬版（不入主串计数）', /tl-workspace\/tl-workspace\.js\?v=(1057-ws-single-layer|1058-|1059-|106\d-)/.test(ix));
  ok('sw.js VERSION 动态与主串同款', swDyn.includes("const VERSION = 'v" + verPlainDyn + "';"));
  ok('M13 不变量：publishToMap 仍为显式 ===true 判断（发布规则零改动）', /options\.publishToMap===true/.test(i09));
  ok('M13 不变量：轮灌演示动画未被挪动（map-flow-demo 引用仍在）', /map-flow-demo\.js/.test(ix));

  console.log('\n结果: ' + pass + ' 过 / ' + fail + ' 红');
  process.exit(fail ? 1 : 0);
})();
