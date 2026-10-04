/* _p1/_inj_v210_edit_move_view.cjs · [v210] 注入体检
 *
 * ★ 纪律（v201 教训 12 / v208 教训 21）：**「改完全绿」不等于「闸门有效」**。
 *   必须逐个把功能改坏，断言**指定编号精确变红**，才算这条断言真的拦得住。
 *   只挑「会红的编号」还不够：还要看「实际红条」里没有意料之外的条目，
 *   否则说明断言之间互相稀释（v207 教训：整串联动把 ⑨c/⑨d 的信号冲淡了）。
 *
 * 16 个缺陷，覆盖本次四项需求的每一条关键性质：
 *   K1 复制不带属性      → ②b
 *   K2 复制原地重合      → ②c
 *   K3 复制继承连接      → ②d
 *   K4 Ctrl+D 失效       → ②f
 *   K5 旋转不重排下游    → ③d
 *   K6 旋转绕错中心      → ③b
 *   K7 几何不应用 rot    → ③g
 *   K8 移动不搬整串      → ④b
 *   K9 方向键步长失效    → ④d
 *   K10 自由移动开关失效 → ④f
 *   K11 视图切换动数据   → ⑤f
 *   K12 前/侧视不压缩    → ⑤j
 *   K13 高亮不同步       → ⑤b
 * [v213] 方向轴选择：
 *   K14 箭头不随视图变   → ⑤n
 *   K15 方向轴当成步进   → ⑤o
 *   K16 方向轴不重排下游 → ③l
 */
'use strict';
const path = require('path');
const { runCases } = require('./_inj_harness.cjs');

const WS = path.resolve(__dirname, '..');
runCases({
  ws: WS,
  src: '管路接驳拼装.html',
  script: '_p1/_shot_v210_edit_move_view.cjs',
  basePort: 9620,
  cases: [
    { n: 'K1 复制不带属性（口径/管长丢了）→ ②b',
      from: '    n.x=c.x+36; n.y=c.y+36;',
      to: '    n.x=c.x+36; n.y=c.y+36; n.dn=90; n.len=1;', env: { PA_ONLY: '2' }, red: ['②b'] },
    { n: 'K2 复制原地重合（看不出复制成功）→ ②c',
      from: '    n.x=c.x+36; n.y=c.y+36;',
      to: '    n.x=c.x; n.y=c.y;', env: { PA_ONLY: '2' }, red: ['②c'] },
    { n: 'K3 复制把原件的连接也抄过来 → ②d',
      from: '    S.components.push(n);',
      to: '    S.components.push(n);\n    S.connections.slice().forEach(function(k){ if(k.a.id===c.id) S.connections.push({id:uid(\'k\'),a:{id:n.id,side:k.a.side},b:{id:k.b.id,side:k.b.side}}); });',
      env: { PA_ONLY: '2' }, red: ['②d'] },
    { n: 'K4 Ctrl+D 快捷键失效 → ②f',
      from: '      if(S.selected){ duplicateComp(S.selected); e.preventDefault(); } return;',
      to: '      return;', env: { PA_ONLY: '2' }, red: ['②f'] },
    { n: 'K5 旋转后不重排下游（接口被拉开）→ ③d',
      from: '    cascadeAlign(c.id);\n    pushHistory(); recompute(); render(); renderProps();',
      to: '    /*cascadeAlign(c.id);*/\n    pushHistory(); recompute(); render(); renderProps();', env: { PA_ONLY: '3' }, red: ['③d'] },
    { n: 'K6 旋转绕错中心（L 口也跟着跑了）→ ③b',
      from: '    c.rot=((+deg||0)%360+360)%360;',
      to: '    c.rot=((+deg||0)%360+360)%360; c.x+=5; c.y+=5;', env: { PA_ONLY: '3' }, red: ['③b'] },
    { n: 'K7 画法不应用 rot（数据转了、图没转）→ ③g2',
      from: '    var q=rotPt(lx,ly,c.rot||0); return {x:c.x+q.x, y:c.y+q.y};',
      to: '    var q={x:lx,y:ly}; return {x:c.x+q.x, y:c.y+q.y};', env: { PA_ONLY: '3' }, red: ['③g2'] },
    { n: 'K8 移动只挪自己、下游被拉开 → ④b',
      from: '    moveWithBranch(c, c.x+dx, c.y+dy);\n    recompute(); render();',
      to: '    c.x+=dx; c.y+=dy;\n    recompute(); render();', env: { PA_ONLY: '4' }, red: ['④b'] },
    { n: 'K9 方向键 Shift 加速失效（还是 1px）→ ④d',
      from: 'var st=e.shiftKey?10:1;',
      to: 'var st=1;', env: { PA_ONLY: '4' }, red: ['④d'] },
    { n: 'K10 自由移动开关失效（照样吸附）→ ④f',
      from: '    var n = (snap && !S.moveMode)? smartSnapIt(c.id, snapRadiusPx()) : 0;',
      to: '    var n = snap? smartSnapIt(c.id, snapRadiusPx()) : 0;', env: { PA_ONLY: '4' }, red: ['④f'] },
    { n: 'K11 切换视图动了数据（违背了"只换画法"）→ ⑤f',
      from: "    S.view=v;\n    var segs=document.querySelectorAll('#segView .vw');",
      to: "    S.view=v; S.components.forEach(function(c){ c.x+=1; });\n    var segs=document.querySelectorAll('#segView .vw');",
      env: { PA_ONLY: '5' }, red: ['⑤f'] },
    { n: 'K12 前/侧视不压缩（跟俯视一样）→ ⑤j',
      from: '  var FRONT_K=Math.cos(70*Math.PI/180);      // ≈0.342',
      to: '  var FRONT_K=1;      // ≈0.342', env: { PA_ONLY: '5' }, red: ['⑤j'] },
    { n: 'K13 视图高亮不同步（点了侧视却亮着俯视）→ ⑤b',
      from: "segs[i].classList.toggle('on', segs[i].getAttribute('data-view')===v);",
      to: "segs[i].classList.toggle('on', segs[i].getAttribute('data-view')==='plan');", env: { PA_ONLY: '5' }, red: ['⑤b'] },
    /* [v213] 方向轴选择 */
    { n: 'K14 方向轴箭头不随视图变（轴测里还是俯视的 →/↓）→ ⑤n',
      from: "      var p=P(Math.cos(a), Math.sin(a));       // 投影后的屏幕方向",
      to: "      var p={x:Math.cos(a), y:Math.sin(a)};       // 投影后的屏幕方向",
      env: { PA_ONLY: '5' }, red: ['⑤n'] },
    { n: 'K15 方向轴菜单把 rot 当成了步进（+90 而不是对齐）→ ⑤o',
      from: '    return commitRot(c, d, \'已对齐方向轴 \'+d+\'°（绕左端接口旋转）\');',
      to: '    return commitRot(c, ((+c.rot||0)+d)%360, \'已对齐方向轴 \'+d+\'°（绕左端接口旋转）\');',
      env: { PA_ONLY: '5' }, red: ['⑤o'] },
    { n: 'K16 方向轴选择变成「不重排下游」（接口被拉开）→ ③k 或 ③l',
      from: '    cascadeAlign(c.id);\n    pushHistory(); recompute(); render(); renderProps();',
      to: '    /*cascadeAlign(c.id);*/\n    pushHistory(); recompute(); render(); renderProps();',
      env: { PA_ONLY: '3' }, red: ['③l'] },
  ]
}).then((r) => { process.exitCode = r.bad ? 1 : 0; });
