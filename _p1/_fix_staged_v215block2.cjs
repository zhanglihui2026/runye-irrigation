/* _p1/_fix_staged_v215block2.cjs · [v216] 修正暂存 blob 中 v215 恢复点错位（纯 fs 版，不走 execSync）
 * 用法：先 `git show :index.html > _p1/_tmp_staged.html`，本脚本原地改写该文件（三重自检）；
 * 之后由 shell 执行 `git hash-object -w` + `git update-index --cacheinfo` 写回暂存区。 */
'use strict';
const fs = require('fs');
const P = '_p1/_tmp_staged.html';
let s = fs.readFileSync(P, 'utf8');
const block =
  '  /* [v215] 轮灌演示跨重渲染：简图整棵重建后立刻按当前演示组重涂 + 演示 chips 重建\n' +
  '     （组数随 N/手动分组变化；chips 内部自带越界退出守卫。工作区侧由 RyTlWs.render 内恢复）。 */\n' +
  '  try { if (window.__tlDemoGroup != null) tlApplyDemoHighlight(window.__tlDemoGroup); } catch (e) { }\n' +
  '  try { if (typeof tlRenderDemoChips === \'function\') tlRenderDemoChips(); } catch (e) { }\n';
const anchor = "  document.getElementById('tlDiagramContent').innerHTML=svgStr;\n";
const cnt = s.split(block).length - 1;
if (cnt !== 1) { console.log('恢复点块出现 ' + cnt + ' 次（应 1），中止'); process.exit(1); }
if (s.indexOf(anchor) < 0) { console.log('innerHTML 锚点不存在，中止'); process.exit(1); }
s = s.replace(block, '');                       /* 删 IIFE 内错位份 */
s = s.replace(anchor, anchor + block);          /* 插到 innerHTML 之后 */
/* 自检 1：块只剩一份；自检 2：紧跟 anchor；自检 3：IIFE 的 var dd 行后不再紧跟块 */
if (s.split(block).length - 1 !== 1) { console.log('自检1失败'); process.exit(1); }
if (s.indexOf(block) !== s.indexOf(anchor) + anchor.length) { console.log('自检2失败'); process.exit(1); }
const ddLine = "    var dd = window.tlDiagramData; if(!dd || dd.world!=='meter') return;\n";
if (s.indexOf(ddLine + block.replace(/^  \/\*/, '  /*').split('\n')[0]) >= 0) { console.log('自检3失败：IIFE 内仍有块'); process.exit(1); }
fs.writeFileSync(P, s, 'utf8');
console.log('修正完成（三重自检通过）');
