/* _p1/_fix_staged_v215block.cjs · [v216] 修正暂存 blob 中 v215 恢复点 4 行的错位
 * 背景：v215 用 git apply --cached 提交时，纯插入 hunk（无内容锚）在 HEAD 里落进了
 * map-enhance IIFE 内部 —— HEAD 错位、工作区正确。本脚本在【暂存区】把该块移到
 * innerHTML=svgStr 之后（内容精确替换 + 三重自检），不动工作区。 */
'use strict';
const { execSync } = require('child_process');
let s = execSync('git show :index.html', { maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
const block =
  '  /* [v215] 轮灌演示跨重渲染：简图整棵重建后立刻按当前演示组重涂 + 演示 chips 重建\n' +
  '     （组数随 N/手动分组变化；chips 内部自带越界退出守卫。工作区侧由 RyTlWs.render 内恢复）。 */\n' +
  '  try { if (window.__tlDemoGroup != null) tlApplyDemoHighlight(window.__tlDemoGroup); } catch (e) { }\n' +
  '  try { if (typeof tlRenderDemoChips === \'function\') tlRenderDemoChips(); } catch (e) { }\n';
const anchor = "  document.getElementById('tlDiagramContent').innerHTML=svgStr;\n";
const cnt = s.split(block).length - 1;
if (cnt !== 1) { console.log('恢复点块出现 ' + cnt + ' 次（应 1），中止'); process.exit(1); }
if (s.indexOf(anchor) < 0) { console.log('innerHTML 锚点不存在，中止'); process.exit(1); }
/* 1) 删掉 IIFE 内的错位份 */
s = s.replace(block, '');
/* 2) 插到 innerHTML 之后（正确位置） */
s = s.replace(anchor, anchor + block);
/* 3) 自检：块只剩一份、且紧跟 anchor */
if (s.split(block).length - 1 !== 1 || s.indexOf(block) !== s.indexOf(anchor) + anchor.length) {
  console.log('自检失败，中止'); process.exit(1);
}
const h = execSync('git hash-object -w --stdin', { input: s }).toString().trim();
execSync('git update-index --cacheinfo 100644,' + h + ',index.html');
console.log('暂存 blob 已修正：恢复点 4 行移到 innerHTML 之后（自检通过）');
