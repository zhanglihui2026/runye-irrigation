/* _p1/_inj_v215_tldemo.cjs · [v215] 轮灌演示 注入体检
 * 5 例：点击失效 / 简图不同步 / 轮播不推进 / 退出不恢复 / 重渲染恢复丢失。 */
'use strict';
const path = require('path');
const { runCases } = require('./_inj_harness.cjs');

const WS = path.resolve(__dirname, '..');
runCases({
  ws: WS,
  src: 'index.html',
  script: '_p1/_shot_v215_tldemo.cjs',
  basePort: 9770,
  cases: [
    { n: 'D1 chips 点击失效（点组没反应）→ ④',
      from: '    if (gb) {\n      if (tlDemoTimer) { clearInterval(tlDemoTimer); tlDemoTimer = null; }   /* 手点组 = 接管，轮播暂停 */',
      to: '    if (gb) { return; }\n    if (false) {\n      if (tlDemoTimer) { clearInterval(tlDemoTimer); tlDemoTimer = null; }   /* 手点组 = 接管，轮播暂停 */',
      red: ['④'] },
    { n: 'D2 三级简图不同步（只有工作区变色）→ ⑥',
      from: 'function tlApplyDemoHighlight(g) {\n  var svg = document.querySelector(\'#tlDiagramContent svg\'); if (!svg) return;',
      to: 'function tlApplyDemoHighlight(g) {\n  g = null;\n  var svg = document.querySelector(\'#tlDiagramContent svg\'); if (!svg) return;',
      red: ['⑥'] },
    { n: 'D3 轮播不推进（interval 空转）→ ⑩',
      from: '    tlDemoIdx = (tlDemoIdx + 1) % Mc;\n    tlDemoSet(tlDemoIdx);\n  }, 2000);',
      to: '    tlDemoIdx = (tlDemoIdx + 1) % Mc;\n    /*tlDemoSet(tlDemoIdx);*/\n  }, 2000);',
      red: ['⑩'] },
    { n: 'D4 退出不恢复（■ 失效，颜色留在演示态）→ ⑮',
      from: 'function tlDemoStop() {\n  if (tlDemoTimer) { clearInterval(tlDemoTimer); tlDemoTimer = null; }\n  tlDemoSet(null);\n}',
      to: 'function tlDemoStop() {\n  if (tlDemoTimer) { clearInterval(tlDemoTimer); tlDemoTimer = null; }\n  /*tlDemoSet(null);*/\n}',
      red: ['⑮'] },
    { n: 'D5 重新生成管线图后演示色丢失（恢复点被删）→ ⑪',
      from: '  try { if (window.__tlDemoGroup != null) tlApplyDemoHighlight(window.__tlDemoGroup); } catch (e) { }\n  try { if (typeof tlRenderDemoChips === \'function\') tlRenderDemoChips(); } catch (e) { }',
      to: '  try { if (false) tlApplyDemoHighlight(window.__tlDemoGroup); } catch (e) { }\n  try { if (typeof tlRenderDemoChips === \'function\') tlRenderDemoChips(); } catch (e) { }',
      red: ['⑪'] },
  ]
}).then((r) => { process.exitCode = r.bad ? 1 : 0; });
