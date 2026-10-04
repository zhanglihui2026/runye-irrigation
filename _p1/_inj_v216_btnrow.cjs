/* _p1/_inj_v216_btnrow.cjs · [v216] 三钮一行/取消文字 注入体检
 * E1 chips 重建挂钩被删（status 行删除后最容易犯的回归）→ ④
 * E2 三钮没在同一行（恢复初始化被挤到下一行）→ ①b */
'use strict';
const path = require('path');
const { runCases } = require('./_inj_harness.cjs');

const WS = path.resolve(__dirname, '..');
runCases({
  ws: WS,
  src: 'index.html',
  script: '_p1/_shot_v216_btnrow.cjs',
  basePort: 9790,
  cases: [
    /* ★ chips 重建有两条挂钩（tlAutoGenerate 重生成 + tlRefreshGroupStatus 分组刷新），
       互为冗余：tlApplyGroups 总是先走 tlAutoGenerate ⇒ 单删 status 一条测不出行为差。
       体检注「两条一起删」，证明 ④ 断言至少拦得住全断（删一条属无害冗余，不注）。 */
    { n: 'E1 chips 重建两条挂钩全删（演示行永远不出现）→ ④',
      pat: [
        ['  try { if (window.__tlDemoGroup != null) tlApplyDemoHighlight(window.__tlDemoGroup); } catch (e) { }\n  try { if (typeof tlRenderDemoChips === \'function\') tlRenderDemoChips(); } catch (e) { }',
         '  try { if (window.__tlDemoGroup != null) tlApplyDemoHighlight(window.__tlDemoGroup); } catch (e) { }\n  /*E1: chips 挂钩已删*/'],
        ["  if (typeof tlRenderDemoChips === 'function') { try { tlRenderDemoChips(); } catch (e) { } }\n};",
         "  /*E1: chips 挂钩已删*/\n};"],
      ], red: ['④'] },
    { n: 'E2 恢复初始化按钮被挤到下一行（三钮不同行）→ ①b',
      from: 'cursor:pointer;color:#334155">↺ 恢复初始化</button>',
      to: 'cursor:pointer;color:#334155;display:block;width:100%">↺ 恢复初始化</button>', red: ['①b'] },
  ]
}).then((r) => { process.exitCode = r.bad ? 1 : 0; });
