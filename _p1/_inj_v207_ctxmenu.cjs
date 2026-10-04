/* _p1/_inj_v207_ctxmenu.cjs · [v207] 注入体检（驱动见 _p1/_inj_harness.cjs） */
'use strict';
const path = require('path');
const harness = require('./_inj_harness.cjs');
const WS = 'C:\\Users\\AHS\\runye-irrigation';

const CASES = [
  {
    n: 'J1 改径不扩散（只改自己，配件不跟随）',
    from: '    var n=propagateDn(c.id);',
    to: '    var n=0; /* INJ */',
    red: ['②b', '②c', '②e']
  },
  {
    n: 'J2 变径不再作为扩散边界（把有意保留的大小头拉平）',
    from: "      case 'reducer': return [];",
    to: "      case 'reducer': return LIB[c.kind].ports.filter(function(s){ return s!==entrySide; }); /* INJ */",
    red: ['③b', '③c']
  },
  {
    n: 'J3 自动吸附时不把配件口径改成管道的（退回异径不吸附）',
    from: '      if(!skip) applyDnToPort(mc, side, portDn(nc,near.side));',
    to: '      if(false) applyDnToPort(mc, side, portDn(nc,near.side)); /* INJ */',
    red: ['⑥a', '⑥c']
  },
  {
    /* ★ 复现 v207 开发中真实踩到的那个坑：手柄当时是挂在组件自己的 <g> 里（等价于「先画」），
       管尾正好接着下游管件 ⇒ 手柄被后画的下游盖住，pointerdown 命中的是下游件。 */
    n: 'J4 手柄画在组件之前（被下游管件抢走命中 —— 开发中真实踩到的坑）',
    pat: [
      ['    // 3) 组件本体\n    S.components.forEach(function(c){ drawComp(c); });',
        '    /* INJ: 手柄先画 ⇒ 被后画的组件盖住 */\n'
        + '    var _ll=el("g",{id:"paLenLayer0"}); vp.appendChild(_ll);\n'
        + '    S.components.forEach(function(c){ if(c.kind!=="straight") return;\n'
        + '      var _q=P(c.x+c.len*SCALE+LH_OFF,c.y); lenHandle(_ll,c.id,_q.x,_q.y); });\n'
        + '    // 3) 组件本体\n    S.components.forEach(function(c){ drawComp(c); });'],
      ['    /* 6) [v207] 直管长度手柄 —— 顶层图层，保证在下游管件之上仍可命中 */\n'
        + '    var lenLayer=el(\'g\',{id:\'paLenLayer\'});\n'
        + '    vp.appendChild(lenLayer);\n'
        + '    S.components.forEach(function(c){\n'
        + '      if(c.kind!==\'straight\') return;\n'
        + '      var q=P(c.x+c.len*SCALE+LH_OFF, c.y);\n'
        + '      lenHandle(lenLayer,c.id,q.x,q.y);\n'
        + '    });',
        '    /* INJ: 顶层图层那一份不再画 */']
    ],
    /* 真实信号只有「手柄不在顶层图层」+「管长没被拖动」两条：
       误拖到下游管件时，v208 的整串联动会把整条链一起平移 ⇒ ⑨c/⑨d 不再必然变红，
       所以这里只锁这两条（够精确，且不依赖连带效应）。 */
    red: ['⑨a2', '⑨b']
  },
  {
    n: 'J5 改管长不让下游跟着走（接口被拉开成缝）',
    from: "      collectBranch(c.id,'L').forEach(function(id){ var b=findComp(id); if(b) b.x+=dpx; });",
    to: '      void dpx; /* INJ */',
    red: ['⑨c', '⑨d']
  },
  {
    n: 'J6 换选型不重建连接',
    from: '      if(tryConnect(nc.id,newPorts[i],lk.oId,lk.oSide).ok) made++; else dropped++;',
    to: '      dropped++; /* INJ */',
    red: ['④d', '④e']
  },
  {
    n: 'J7 换选型后不做整链重排（几何错位）',
    from: '    cascadeAlign(nc.id);',
    to: '    /* INJ: 不做重排 */',
    red: ['⑤']
  },
  {
    n: 'J8 右键不弹菜单',
    from: "    selectComp(c.id);              /* 顺带选中，右栏属性同步显示这一件 */\n    openMenu(e.clientX,e.clientY,c);",
    to: '    selectComp(c.id);              /* INJ: 不弹菜单 */',
    red: ['①a', '①b', '①c']
  }
];

(async () => {
  const r = await harness.runCases({ ws: WS, src: '管路接驳拼装.html', script: '_p1/_shot_v207_pa_ctxmenu.cjs', cases: CASES, basePort: 9600 });
  process.exit(r.bad ? 1 : 0);
})();
